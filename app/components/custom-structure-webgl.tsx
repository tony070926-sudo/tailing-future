'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  Group,
  InstancedMesh,
  Mesh,
  PerspectiveCamera,
  Raycaster,
  Scene,
  WebGLRenderer,
} from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  uploadFloat,
  type StructureRenderModel,
  type StructureRenderSegment,
} from '@/lib/structure/structure-render-model';
import {
  clampStructureWebglDpr,
  structureClientPointToNdc,
  structurePointerIsClick,
} from '@/lib/structure/structure-webgl-runtime-policy';

export type CustomStructureWebglStatus =
  | 'checking-webgl2'
  | 'ready'
  | 'webgl2-unavailable'
  | 'context-lost'
  | 'initialization-failed';

type ThreeModule = typeof import('three');
type OrbitControlsModule = typeof import('three/addons/controls/OrbitControls.js');
type ThreeRuntimeLoader = () => Promise<readonly [ThreeModule, OrbitControlsModule]>;
type DisposableResource = { dispose: () => void };

const loadPinnedThreeRuntime: ThreeRuntimeLoader = () => Promise.all([
  import('three'),
  import('three/addons/controls/OrbitControls.js'),
]);

type Runtime = {
  three: ThreeModule;
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  raycaster: Raycaster;
  content: Group;
  atomMesh: InstancedMesh;
  atomIdsByInstance: readonly string[];
  selectionHalo: Mesh;
  frameRequest: number | null;
  firstFrameRendered: boolean;
  intersectionVisible: boolean;
  contextLost: boolean;
  disposed: boolean;
  failRender: (error: unknown) => void;
  pointerStart: null | Readonly<{ x: number; y: number; pointerId: number }>;
};

type Props = Readonly<{
  active: boolean;
  model: StructureRenderModel;
  selectedAtomId: string | null;
  onAtomSelect: (atomId: string) => void;
  onAnnouncement: (message: string) => void;
  onStatusChange?: (status: CustomStructureWebglStatus) => void;
  loadRuntime?: ThreeRuntimeLoader;
}>;

export function CustomStructureWebgl({
  active,
  model,
  selectedAtomId,
  onAtomSelect,
  onAnnouncement,
  onStatusChange,
  loadRuntime = loadPinnedThreeRuntime,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const activeRef = useRef(active);
  const selectedAtomIdRef = useRef(selectedAtomId);
  const onAtomSelectRef = useRef(onAtomSelect);
  const onAnnouncementRef = useRef(onAnnouncement);
  const [status, setStatus] = useState<CustomStructureWebglStatus>('checking-webgl2');
  const [contextEpoch, setContextEpoch] = useState(0);

  useEffect(() => {
    activeRef.current = active;
    selectedAtomIdRef.current = selectedAtomId;
    onAtomSelectRef.current = onAtomSelect;
    onAnnouncementRef.current = onAnnouncement;
  }, [active, onAnnouncement, onAtomSelect, selectedAtomId]);

  useEffect(() => {
    onStatusChange?.(status);
  }, [onStatusChange, status]);

  const requestStaticRender = useCallback(() => {
    const runtime = runtimeRef.current;
    if (
      !runtime
      || runtime.disposed
      || runtime.contextLost
      || runtime.frameRequest !== null
      || !activeRef.current
      || document.visibilityState === 'hidden'
      || !runtime.intersectionVisible
    ) return;
    runtime.frameRequest = window.requestAnimationFrame(() => {
      runtime.frameRequest = null;
      if (
        !runtime.disposed
        && !runtime.contextLost
        && activeRef.current
        && document.visibilityState !== 'hidden'
        && runtime.intersectionVisible
      ) {
        try {
          runtime.renderer.render(runtime.scene, runtime.camera);
          if (!runtime.firstFrameRendered) {
            runtime.firstFrameRendered = true;
            setStatus('ready');
          }
        } catch (error) {
          runtime.failRender(error);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let release: (() => void) | null = null;
    setStatus('checking-webgl2');
    const context = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    if (!context) {
      setStatus('webgl2-unavailable');
      onAnnouncementRef.current('WebGL2 unavailable; exact validated structure data remains available below.');
      return;
    }

    void loadRuntime().then(([three, controlsModule]) => {
      if (cancelled) return;
      let renderer: WebGLRenderer | null = null;
      let controls: OrbitControls | null = null;
      let content: Group | null = null;
      let runtime: Runtime | null = null;
      let resizeObserver: ResizeObserver | null = null;
      let intersectionObserver: IntersectionObserver | null = null;
      let onControlsChange: (() => void) | null = null;
      let onVisibility: (() => void) | null = null;
      let onContextLost: ((event: Event) => void) | null = null;
      let pendingContextRestore: (() => void) | null = null;
      let cleaned = false;
      const ownedResources: DisposableResource[] = [];
      const own = <T extends DisposableResource>(resource: T): T => {
        ownedResources.push(resource);
        return resource;
      };
      const cleanup = () => {
        if (cleaned) return;
        cleaned = true;
        if (runtime) {
          runtime.disposed = true;
          if (runtime.frameRequest !== null) window.cancelAnimationFrame(runtime.frameRequest);
          runtime.frameRequest = null;
        }
        resizeObserver?.disconnect();
        intersectionObserver?.disconnect();
        if (controls && onControlsChange) controls.removeEventListener('change', onControlsChange);
        if (onVisibility) document.removeEventListener('visibilitychange', onVisibility);
        if (onContextLost) canvas.removeEventListener('webglcontextlost', onContextLost);
        for (const resource of [...ownedResources].reverse()) resource.dispose();
        ownedResources.length = 0;
        if (runtime && runtimeRef.current === runtime) runtimeRef.current = null;
      };
      release = () => {
        cleanup();
        if (pendingContextRestore) {
          canvas.removeEventListener('webglcontextrestored', pendingContextRestore);
          pendingContextRestore = null;
        }
      };
      try {
        renderer = own(new three.WebGLRenderer({ canvas, context, antialias: true, alpha: false }));
        renderer.setClearColor(0x071216, 1);
        renderer.setPixelRatio(clampStructureWebglDpr(window.devicePixelRatio));
        renderer.outputColorSpace = three.SRGBColorSpace;
        const scene = new three.Scene();
        const camera = new three.PerspectiveCamera(
          42,
          1,
          model.bounds.uploadCameraNear,
          model.bounds.uploadCameraFar,
        );
        const [cx, cy, cz] = model.bounds.uploadCenter;
        const distance = model.bounds.uploadCameraDistance;
        camera.position.set(...model.bounds.uploadInitialCameraPosition);
        camera.lookAt(cx, cy, cz);
        controls = own(new controlsModule.OrbitControls(camera, canvas));
        controls.enableDamping = false;
        controls.autoRotate = false;
        controls.enablePan = true;
        controls.enableZoom = true;
        controls.target.set(cx, cy, cz);
        controls.minDistance = model.bounds.uploadCameraMinimumDistance;
        controls.maxDistance = model.bounds.uploadCameraMaximumDistance;
        controls.update();

        scene.add(new three.HemisphereLight(0xeafcff, 0x192023, 2.1));
        const key = new three.DirectionalLight(0xffffff, 2.2);
        key.position.set(
          uploadFloat(cx + distance, 'lighting.key.x'),
          uploadFloat(cy + distance, 'lighting.key.y'),
          uploadFloat(cz + distance, 'lighting.key.z'),
        );
        scene.add(key);
        content = new three.Group();
        scene.add(content);

        const atomGeometry = own(new three.SphereGeometry(1, 18, 12));
        const atomMaterial = own(new three.MeshStandardMaterial({ roughness: 0.32, metalness: 0.06 }));
        const atomMesh = new three.InstancedMesh(atomGeometry, atomMaterial, model.atoms.length);
        atomMesh.name = 'validated-structure-atoms';
        const transform = new three.Object3D();
        model.atoms.forEach((atom, index) => {
          transform.position.set(...atom.uploadPosition);
          transform.quaternion.identity();
          transform.scale.setScalar(atom.uploadUniformRadius);
          transform.updateMatrix();
          roundAndValidateMatrix(transform.matrix.elements, `atoms[${index}].instanceMatrix`);
          atomMesh.setMatrixAt(index, transform.matrix);
          atomMesh.setColorAt(index, new three.Color(...atom.uploadColorRgb));
        });
        atomMesh.instanceMatrix.needsUpdate = true;
        if (atomMesh.instanceColor) atomMesh.instanceColor.needsUpdate = true;
        content.add(atomMesh);

        const connectionMesh = model.connections.length === 0 ? null : createSegmentInstances(
          three,
          model.connections,
          own(new three.MeshStandardMaterial({ color: 0x8ba4ad, roughness: 0.5 })),
          own,
        );
        if (connectionMesh) content.add(connectionMesh);
        const cellMesh = model.cellEdges.length === 0 ? null : createSegmentInstances(
          three,
          model.cellEdges,
          own(new three.MeshBasicMaterial({ color: 0x47d7b0, transparent: true, opacity: 0.76 })),
          own,
        );
        if (cellMesh) content.add(cellMesh);

        const haloGeometry = own(new three.SphereGeometry(1, 18, 12));
        const haloMaterial = own(new three.MeshBasicMaterial({ color: 0xffffff, wireframe: true }));
        const selectionHalo = new three.Mesh(haloGeometry, haloMaterial);
        selectionHalo.visible = false;
        content.add(selectionHalo);

        runtime = {
          three,
          renderer,
          scene,
          camera,
          controls,
          raycaster: new three.Raycaster(),
          content,
          atomMesh,
          atomIdsByInstance: model.atoms.map((atom) => atom.id),
          selectionHalo,
          frameRequest: null,
          firstFrameRendered: false,
          intersectionVisible: true,
          contextLost: false,
          disposed: false,
          failRender: (error: unknown) => {
            cleanup();
            setStatus('initialization-failed');
            onAnnouncementRef.current(`Static WebGL render failed: ${boundedErrorMessage(error)}`);
          },
          pointerStart: null,
        };
        const initializedRuntime = runtime;
        const resize = () => {
          const width = Math.max(1, canvas.clientWidth);
          const height = Math.max(1, canvas.clientHeight);
          renderer!.setSize(width, height, false);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          requestStaticRender();
        };
        onControlsChange = () => requestStaticRender();
        onVisibility = () => requestStaticRender();
        onContextLost = (event: Event) => {
          event.preventDefault();
          initializedRuntime.contextLost = true;
          if (initializedRuntime.frameRequest !== null) window.cancelAnimationFrame(initializedRuntime.frameRequest);
          initializedRuntime.frameRequest = null;
          setStatus('context-lost');
          onAnnouncementRef.current('WebGL context lost; rendering stopped safely.');
          cleanup();
          if (cancelled) return;
          const restore = () => {
            if (pendingContextRestore === restore) pendingContextRestore = null;
            if (!cancelled) setContextEpoch((value) => value + 1);
          };
          pendingContextRestore = restore;
          canvas.addEventListener('webglcontextrestored', restore, { once: true });
        };
        resizeObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(resize);
        resizeObserver?.observe(canvas);
        intersectionObserver = typeof IntersectionObserver === 'undefined' ? null : new IntersectionObserver((entries) => {
          initializedRuntime.intersectionVisible = entries[0]?.isIntersecting ?? false;
          requestStaticRender();
        });
        intersectionObserver?.observe(canvas);
        controls.addEventListener('change', onControlsChange);
        document.addEventListener('visibilitychange', onVisibility);
        canvas.addEventListener('webglcontextlost', onContextLost);
        runtimeRef.current = initializedRuntime;
        resize();
        updateSelection(initializedRuntime, model, selectedAtomIdRef.current);
        requestStaticRender();

      } catch (error) {
        cleanup();
        setStatus('initialization-failed');
        onAnnouncementRef.current(`Static WebGL initialization failed: ${boundedErrorMessage(error)}`);
      }
    }).catch((error: unknown) => {
      if (cancelled) return;
      setStatus('initialization-failed');
      onAnnouncementRef.current(`Static WebGL dependency load failed: ${boundedErrorMessage(error)}`);
    });
    return () => {
      cancelled = true;
      release?.();
    };
  }, [active, contextEpoch, loadRuntime, model, requestStaticRender]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!runtime || runtime.disposed) return;
    updateSelection(runtime, model, selectedAtomId);
    requestStaticRender();
  }, [model, requestStaticRender, selectedAtomId]);

  const resetView = useCallback(() => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    const [x, y, z] = model.bounds.uploadCenter;
    runtime.controls.target.set(x, y, z);
    runtime.camera.position.set(...model.bounds.uploadInitialCameraPosition);
    runtime.camera.lookAt(x, y, z);
    runtime.controls.update();
    requestStaticRender();
  }, [model, requestStaticRender]);

  const focusSelected = useCallback(() => {
    const runtime = runtimeRef.current;
    const atom = model.atoms.find((candidate) => candidate.id === selectedAtomId);
    if (!runtime || !atom) return;
    const [x, y, z] = atom.uploadPosition;
    try {
      const distance = uploadFloat(Math.max(model.bounds.uploadFramingRadius * 0.22, 2), 'camera.focus.distance');
      runtime.controls.target.set(x, y, z);
      runtime.camera.position.set(
        uploadFloat(normalizeDerivedZero(x + distance * 0.6), 'camera.focus.x'),
        uploadFloat(normalizeDerivedZero(y + distance * 0.4), 'camera.focus.y'),
        uploadFloat(normalizeDerivedZero(z + distance), 'camera.focus.z'),
      );
      runtime.camera.lookAt(x, y, z);
      runtime.controls.update();
      requestStaticRender();
    } catch (error) {
      onAnnouncementRef.current(`Camera display projection refused: ${boundedErrorMessage(error)}`);
    }
  }, [model, requestStaticRender, selectedAtomId]);

  return (
    <section className="custom-structure-viewer" aria-label="Static validated structure viewer">
      <div className="custom-structure-canvas-wrap">
        <canvas
          ref={canvasRef}
          className="custom-structure-canvas"
          aria-label="WebGL2 static structure viewport"
          tabIndex={0}
          onPointerDown={(event) => {
            const runtime = runtimeRef.current;
            if (!runtime) return;
            runtime.pointerStart = { x: event.clientX, y: event.clientY, pointerId: event.pointerId };
          }}
          onPointerUp={(event) => {
            const runtime = runtimeRef.current;
            const start = runtime?.pointerStart;
            if (!runtime || !start || start.pointerId !== event.pointerId) return;
            runtime.pointerStart = null;
            if (!structurePointerIsClick(start, { x: event.clientX, y: event.clientY })) return;
            const rect = event.currentTarget.getBoundingClientRect();
            const ndc = structureClientPointToNdc(
              { x: event.clientX, y: event.clientY },
              { left: rect.left, top: rect.top, width: rect.width, height: rect.height },
            );
            if (!ndc) return;
            runtime.raycaster.setFromCamera(new runtime.three.Vector2(ndc.x, ndc.y), runtime.camera);
            const hit = runtime.raycaster.intersectObject(runtime.atomMesh, false)[0];
            if (hit?.instanceId === undefined) return;
            const atomId = runtime.atomIdsByInstance[hit.instanceId];
            if (atomId) onAtomSelectRef.current(atomId);
          }}
        />
        {status !== 'ready' ? <div className="custom-structure-webgl-status" role="status">{status}</div> : null}
      </div>
      <div className="custom-structure-camera-controls" aria-label="Read-only camera controls">
        <button type="button" onClick={resetView}>Reset camera</button>
        <button type="button" onClick={focusSelected} disabled={!selectedAtomId}>Focus selected atom</button>
        <span>Orbit / pan / zoom are view-only</span>
      </div>
    </section>
  );
}

function createSegmentInstances(
  three: ThreeModule,
  segments: readonly StructureRenderSegment[],
  material: import('three').Material,
  own: <T extends DisposableResource>(resource: T) => T,
): InstancedMesh | null {
  if (segments.length === 0) return null;
  const geometry = own(new three.CylinderGeometry(1, 1, 1, 8, 1, false));
  const mesh = new three.InstancedMesh(geometry, material, segments.length);
  const transform = new three.Object3D();
  const up = new three.Vector3(0, 1, 0);
  segments.forEach((segment, index) => {
    const start = new three.Vector3(...segment.uploadStart);
    const end = new three.Vector3(...segment.uploadEnd);
    const direction = end.clone().sub(start);
    const length = direction.length();
    transform.position.copy(start).add(end).multiplyScalar(0.5);
    transform.quaternion.setFromUnitVectors(up, direction.normalize());
    transform.scale.set(segment.uploadRadius, length, segment.uploadRadius);
    transform.updateMatrix();
    roundAndValidateMatrix(transform.matrix.elements, `${segment.kind}.${segment.id}.instanceMatrix`);
    mesh.setMatrixAt(index, transform.matrix);
  });
  mesh.instanceMatrix.needsUpdate = true;
  return mesh;
}

function roundAndValidateMatrix(elements: number[], path: string) {
  for (let index = 0; index < elements.length; index += 1) {
    elements[index] = uploadFloat(normalizeDerivedZero(elements[index]), `${path}[${index}]`);
  }
}

function normalizeDerivedZero(value: number): number {
  return value === 0 ? 0 : value;
}

function boundedErrorMessage(error: unknown): string {
  return (error instanceof Error ? error.message : 'unknown reason').slice(0, 240);
}

function updateSelection(runtime: Runtime, model: StructureRenderModel, selectedAtomId: string | null) {
  const selected = model.atoms.find((atom) => atom.id === selectedAtomId);
  if (!selected) {
    runtime.selectionHalo.visible = false;
    return;
  }
  runtime.selectionHalo.position.set(...selected.uploadPosition);
  runtime.selectionHalo.scale.setScalar(uploadFloat(selected.uploadUniformRadius * 1.34, 'selection.radius'));
  runtime.selectionHalo.visible = true;
}
