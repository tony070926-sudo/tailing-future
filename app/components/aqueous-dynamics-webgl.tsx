'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import type {
  Group,
  Object3D,
  PerspectiveCamera,
  Raycaster,
  Scene,
  WebGLRenderer,
} from 'three';
import type { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type {
  AqueousDynamicsWebglSceneV042,
  AqueousDynamicsWebglSceneV043,
} from '@/lib/molecular/aqueous-dynamics-webgl-scene';
import {
  canQueueWebglRender,
  clampWebglDevicePixelRatio,
  cssClientPointToNdc,
  isPointerClickWithinDragThreshold,
} from '@/lib/molecular/aqueous-webgl-runtime-policy';

export type AqueousWebglVisualLayers = Readonly<{
  atoms: boolean;
  structuralOH: boolean;
  constraintDiagnostic: boolean;
  evaluatedLJ: boolean;
  triclinicCell: boolean;
  totalForce: boolean;
  forceComponents: boolean;
}>;

export type AqueousWebglStatus =
  | 'checking-webgl2'
  | 'ready'
  | 'webgl2-unavailable'
  | 'context-lost'
  | 'initialization-failed';

export type AqueousWebglRenderStats = Readonly<{
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
}>;

type ThreeModule = typeof import('three');
type AqueousDynamicsWebglScene = AqueousDynamicsWebglSceneV042 | AqueousDynamicsWebglSceneV043;

type CameraView = Readonly<{
  position: readonly [number, number, number];
  target: readonly [number, number, number];
}>;

type Runtime = {
  three: ThreeModule;
  renderer: WebGLRenderer;
  scene: Scene;
  camera: PerspectiveCamera;
  controls: OrbitControls;
  raycaster: Raycaster;
  content: Group;
  selectableAtoms: Object3D[];
  resetView: CameraView;
  fullCellView: CameraView;
  frameRequest: number | null;
  intersectionVisible: boolean;
  contextLost: boolean;
  disposed: boolean;
  pointerStart: Readonly<{ x: number; y: number; pointerId: number }> | null;
  isActive: () => boolean;
  publishRenderStats: (stats: AqueousWebglRenderStats) => void;
};

type Props = Readonly<{
  active: boolean;
  sceneModel: AqueousDynamicsWebglScene;
  selectedAtomId: string;
  layers: AqueousWebglVisualLayers;
  onAtomSelect: (atomId: string) => void;
  onAnnouncement: (message: string) => void;
  onStatusChange: (status: AqueousWebglStatus) => void;
  onRenderStats: (stats: AqueousWebglRenderStats) => void;
}>;

export function AqueousDynamicsWebgl({
  active,
  sceneModel,
  selectedAtomId,
  layers,
  onAtomSelect,
  onAnnouncement,
  onStatusChange,
  onRenderStats,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const runtimeRef = useRef<Runtime | null>(null);
  const activeRef = useRef(active);
  const sceneModelRef = useRef(sceneModel);
  const layersRef = useRef(layers);
  const selectedAtomIdRef = useRef(selectedAtomId);
  const onAtomSelectRef = useRef(onAtomSelect);
  const onAnnouncementRef = useRef(onAnnouncement);
  const onStatusChangeRef = useRef(onStatusChange);
  const onRenderStatsRef = useRef(onRenderStats);
  const [status, setStatus] = useState<AqueousWebglStatus>('checking-webgl2');

  useEffect(() => {
    activeRef.current = active;
    sceneModelRef.current = sceneModel;
    layersRef.current = layers;
    selectedAtomIdRef.current = selectedAtomId;
    onAtomSelectRef.current = onAtomSelect;
    onAnnouncementRef.current = onAnnouncement;
    onStatusChangeRef.current = onStatusChange;
    onRenderStatsRef.current = onRenderStats;
  }, [
    active,
    layers,
    onAnnouncement,
    onAtomSelect,
    onRenderStats,
    onStatusChange,
    sceneModel,
    selectedAtomId,
  ]);

  const publishStatus = useCallback((next: AqueousWebglStatus) => {
    setStatus(next);
    onStatusChangeRef.current(next);
  }, []);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let release: (() => void) | null = null;

    publishStatus('checking-webgl2');
    const context = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    if (!context) {
      publishStatus('webgl2-unavailable');
      onAnnouncementRef.current('此设备没有可用的 WebGL2 上下文；已切换到可检查的结构数据表。');
      return;
    }

    void Promise.all([
      import('three'),
      import('three/addons/controls/OrbitControls.js'),
    ]).then(([three, controlsModule]) => {
      if (cancelled) return;
      let partialRenderer: WebGLRenderer | null = null;
      let partialControls: OrbitControls | null = null;
      try {
        const renderer = new three.WebGLRenderer({
          canvas,
          context,
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
        });
        partialRenderer = renderer;
        renderer.outputColorSpace = three.SRGBColorSpace;
        renderer.toneMapping = three.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.08;
        renderer.setClearColor(0xf1f6ef, 1);
        renderer.setPixelRatio(clampWebglDevicePixelRatio(window.devicePixelRatio));

        const worldScene = new three.Scene();
        worldScene.background = new three.Color(0xf1f6ef);
        const camera = new three.PerspectiveCamera(34, 1, 0.05, 240);
        const controls = new controlsModule.OrbitControls(camera, canvas);
        partialControls = controls;
        controls.enableDamping = false;
        controls.enablePan = true;
        controls.minDistance = 1.4;
        controls.maxDistance = 120;
        controls.screenSpacePanning = true;

        const resetView = fitInteractionView(sceneModelRef.current, three);
        const fullCellView = fitCellView(sceneModelRef.current, three);
        applyCameraView(camera, controls, resetView);
        worldScene.add(new three.HemisphereLight(0xffffff, 0xc9ded2, 2.3));
        const keyLight = new three.DirectionalLight(0xffffff, 3.1);
        keyLight.position.set(26, 34, 42);
        worldScene.add(keyLight);
        const fillLight = new three.DirectionalLight(0xa7d9c5, 1.25);
        fillLight.position.set(-24, 10, -18);
        worldScene.add(fillLight);

        const runtime: Runtime = {
          three,
          renderer,
          scene: worldScene,
          camera,
          controls,
          raycaster: new three.Raycaster(),
          content: new three.Group(),
          selectableAtoms: [],
          resetView,
          fullCellView,
          frameRequest: null,
          intersectionVisible: true,
          contextLost: false,
          disposed: false,
          pointerStart: null,
          isActive: () => activeRef.current,
          publishRenderStats: (stats) => onRenderStatsRef.current(stats),
        };
        worldScene.add(runtime.content);
        runtimeRef.current = runtime;

        const invalidate = () => invalidateRuntime(runtime);
        const resize = () => resizeRuntime(runtime, canvas);
        const pointerDown = (event: PointerEvent) => {
          if (event.button !== 0) return;
          runtime.pointerStart = {
            x: event.clientX,
            y: event.clientY,
            pointerId: event.pointerId,
          };
        };
        const pointerUp = (event: PointerEvent) => {
          const start = runtime.pointerStart;
          runtime.pointerStart = null;
          if (!start || start.pointerId !== event.pointerId
            || !isPointerClickWithinDragThreshold(
              { clientX: start.x, clientY: start.y },
              { clientX: event.clientX, clientY: event.clientY },
            )) return;
          const atomId = pickAtom(runtime, canvas, event.clientX, event.clientY);
          if (atomId) onAtomSelectRef.current(atomId);
        };
        const pointerCancel = () => {
          runtime.pointerStart = null;
        };
        const contextLost = (event: Event) => {
          event.preventDefault();
          runtime.contextLost = true;
          cancelRuntimeFrame(runtime);
          abandonRuntimeContentAfterContextLoss(runtime);
          publishStatus('context-lost');
          onAnnouncementRef.current('GPU WebGL2 context 已丢失；求解器 observation 未改变，等待上下文恢复。');
        };
        const contextRestored = () => {
          runtime.contextLost = false;
          publishStatus('ready');
          rebuildRuntimeContent(runtime, sceneModelRef.current, layersRef.current, selectedAtomIdRef.current);
          resize();
          invalidate();
          onAnnouncementRef.current('GPU WebGL2 context 已恢复，并从同一冻结 observation 重建场景。');
        };
        const visibilityChange = () => {
          if (!document.hidden) invalidate();
        };

        let resizeObserver: ResizeObserver | null = null;
        let intersectionObserver: IntersectionObserver | null = null;
        release = () => {
          runtime.disposed = true;
          cancelRuntimeFrame(runtime);
          resizeObserver?.disconnect();
          intersectionObserver?.disconnect();
          controls.removeEventListener('change', invalidate);
          canvas.removeEventListener('pointerdown', pointerDown);
          canvas.removeEventListener('pointerup', pointerUp);
          canvas.removeEventListener('pointercancel', pointerCancel);
          canvas.removeEventListener('webglcontextlost', contextLost);
          canvas.removeEventListener('webglcontextrestored', contextRestored);
          document.removeEventListener('visibilitychange', visibilityChange);
          controls.dispose();
          if (runtime.contextLost) abandonRuntimeContentAfterContextLoss(runtime);
          else disposeObjectTree(runtime.content);
          worldScene.remove(runtime.content);
          renderer.setAnimationLoop(null);
          renderer.dispose();
          if (runtimeRef.current === runtime) runtimeRef.current = null;
        };

        controls.addEventListener('change', invalidate);
        canvas.addEventListener('pointerdown', pointerDown);
        canvas.addEventListener('pointerup', pointerUp);
        canvas.addEventListener('pointercancel', pointerCancel);
        canvas.addEventListener('webglcontextlost', contextLost);
        canvas.addEventListener('webglcontextrestored', contextRestored);
        document.addEventListener('visibilitychange', visibilityChange);

        resizeObserver = typeof ResizeObserver === 'undefined'
          ? null
          : new ResizeObserver(resize);
        resizeObserver?.observe(canvas);
        intersectionObserver = typeof IntersectionObserver === 'undefined'
          ? null
          : new IntersectionObserver((entries) => {
            runtime.intersectionVisible = entries.some((entry) => entry.isIntersecting);
            if (runtime.intersectionVisible) invalidate();
          }, { threshold: 0.01 });
        intersectionObserver?.observe(canvas);

        rebuildRuntimeContent(runtime, sceneModelRef.current, layersRef.current, selectedAtomIdRef.current);
        resize();
        publishStatus('ready');
        invalidate();
        onAnnouncementRef.current('WebGL2 深度场景已就绪；显示内容来自锁定的 solver observation。');
      } catch (error) {
        if (release) {
          const disposeInitializedRuntime = release;
          release = null;
          disposeInitializedRuntime();
        } else {
          partialControls?.dispose();
          partialRenderer?.setAnimationLoop(null);
          partialRenderer?.dispose();
        }
        publishStatus('initialization-failed');
        const message = error instanceof Error ? error.message : String(error);
        onAnnouncementRef.current(`WebGL2 初始化失败；已保留结构数据回退。${message}`);
      }
    }).catch((error: unknown) => {
      if (cancelled) return;
      publishStatus('initialization-failed');
      const message = error instanceof Error ? error.message : String(error);
      onAnnouncementRef.current(`WebGL2 模块载入失败；已保留结构数据回退。${message}`);
    });

    return () => {
      cancelled = true;
      release?.();
    };
  }, [active, publishStatus]);

  useEffect(() => {
    const runtime = runtimeRef.current;
    if (!active || !runtime || runtime.disposed || runtime.contextLost) return;
    runtime.resetView = fitInteractionView(sceneModel, runtime.three);
    runtime.fullCellView = fitCellView(sceneModel, runtime.three);
    rebuildRuntimeContent(runtime, sceneModel, layers, selectedAtomId);
    invalidateRuntime(runtime);
  }, [active, layers, sceneModel, selectedAtomId]);

  const showInteractionRegion = () => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    applyCameraView(runtime.camera, runtime.controls, runtime.resetView);
    invalidateRuntime(runtime);
    onAnnouncementRef.current(
      sceneModel.schemaVersion === 'tf.aqueous-dynamics-webgl-scene/0.4.3'
        ? '相机已回到 source-unwrapped 固定轨迹 gauge 的相互作用区域；求解器状态没有改变。'
        : '相机已回到 sodium-na 锚定的最小镜像相互作用区域；求解器状态没有改变。',
    );
  };

  const showFullCell = () => {
    const runtime = runtimeRef.current;
    if (!runtime) return;
    applyCameraView(runtime.camera, runtime.controls, runtime.fullCellView);
    invalidateRuntime(runtime);
    onAnnouncementRef.current('相机已切换到完整三斜晶胞参考视角；求解器状态没有改变。');
  };

  const focusSelectedAtom = () => {
    const runtime = runtimeRef.current;
    const atom = sceneModel.atomSpheres.find((candidate) => candidate.atomId === selectedAtomId);
    if (!runtime || !atom) return;
    const target = atom.positionAngstrom;
    applyCameraView(runtime.camera, runtime.controls, {
      target: [target.x, target.y, target.z],
      position: [target.x + 7.2, target.y + 5.4, target.z + 9.6],
    });
    invalidateRuntime(runtime);
    onAnnouncementRef.current(`相机已聚焦 ${selectedAtomId}；显示坐标仍来自同一周期 observation。`);
  };

  const handleCanvasKeyDown = (event: ReactKeyboardEvent<HTMLCanvasElement>) => {
    const runtime = runtimeRef.current;
    if (!runtime || status !== 'ready') return;
    const action = moveCameraByKeyboard(runtime, event.key);
    if (!action) return;
    event.preventDefault();
    invalidateRuntime(runtime);
    onAnnouncementRef.current(`${action}；相机操作不会改变 solver state。`);
  };

  const fallbackVisible = status === 'webgl2-unavailable'
    || status === 'context-lost'
    || status === 'initialization-failed';

  return (
    <div className="aqueous-webgl-surface" data-webgl-status={status}>
      <canvas
        ref={canvasRef}
        className="aqueous-webgl-canvas"
        role="application"
        tabIndex={status === 'ready' ? 0 : -1}
        aria-disabled={status !== 'ready'}
        aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Home + -"
        aria-label="NaCl–TIP3P 三维周期晶胞；拖动旋转、滚轮缩放，单击真实原子可选择"
        onKeyDown={handleCanvasKeyDown}
      >
        WebGL2 三维分子场景。若画布不可用，请使用后面的原子数据表。
      </canvas>
      <div className="aqueous-camera-tools" role="group" aria-label="三维相机控制">
        <button type="button" onClick={showInteractionRegion} disabled={status !== 'ready'}>交互区域</button>
        <button type="button" onClick={showFullCell} disabled={status !== 'ready'}>完整晶胞</button>
        <button type="button" onClick={focusSelectedAtom} disabled={status !== 'ready'}>聚焦选中原子</button>
      </div>
      {status === 'checking-webgl2' && (
        <div className="aqueous-webgl-message" role="status">正在建立 WebGL2 深度场景…</div>
      )}
      {fallbackVisible && (
        <div className="aqueous-webgl-fallback" role={status === 'context-lost' ? 'status' : 'alert'}>
          <div>
            <b>{status === 'context-lost' ? 'GPU CONTEXT LOST' : 'WEBGL2 UNAVAILABLE'}</b>
            <span>求解器数据仍可检查；没有以 2D 假画面冒充三维渲染。</span>
          </div>
          <div className="aqueous-fallback-table-wrap">
            <table>
              <caption>{sceneModel.schemaVersion === 'tf.aqueous-dynamics-webgl-scene/0.4.3'
                ? 'source-unwrapped 固定轨迹 gauge 中的 8 个真实原子/离子位点'
                : 'sodium-na 锚定最小镜像中的 8 个真实原子/离子位点'}</caption>
              <thead><tr><th>原子</th><th>元素</th><th>x / Å</th><th>y / Å</th><th>z / Å</th></tr></thead>
              <tbody>{sceneModel.atomSpheres.map((atom) => (
                <tr key={atom.atomId}>
                  <th scope="row">{atom.atomId}</th>
                  <td>{atom.element}</td>
                  <td>{atom.positionAngstrom.x.toFixed(4)}</td>
                  <td>{atom.positionAngstrom.y.toFixed(4)}</td>
                  <td>{atom.positionAngstrom.z.toFixed(4)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function invalidateRuntime(runtime: Runtime) {
  if (!canQueueWebglRender(renderRuntimePolicyState(runtime))) return;
  runtime.frameRequest = window.requestAnimationFrame(() => {
    runtime.frameRequest = null;
    if (!canQueueWebglRender(renderRuntimePolicyState(runtime))) return;
    runtime.renderer.render(runtime.scene, runtime.camera);
    onRenderStatsFromRuntime(runtime);
  });
}

function renderRuntimePolicyState(runtime: Runtime) {
  return {
    active: runtime.isActive(),
    documentVisible: !document.hidden,
    intersectionVisible: runtime.intersectionVisible,
    contextLost: runtime.contextLost,
    disposed: runtime.disposed,
    framePending: runtime.frameRequest !== null,
  };
}

function cancelRuntimeFrame(runtime: Runtime) {
  if (runtime.frameRequest === null) return;
  window.cancelAnimationFrame(runtime.frameRequest);
  runtime.frameRequest = null;
}

function onRenderStatsFromRuntime(runtime: Runtime) {
  const info = runtime.renderer.info;
  runtime.renderer.info.autoReset = true;
  runtime.publishRenderStats({
    drawCalls: info.render.calls,
    triangles: info.render.triangles,
    geometries: info.memory.geometries,
    textures: info.memory.textures,
  });
}

function resizeRuntime(runtime: Runtime, canvas: HTMLCanvasElement) {
  const rect = canvas.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (width <= 0 || height <= 0) return;
  runtime.renderer.setPixelRatio(clampWebglDevicePixelRatio(window.devicePixelRatio));
  runtime.renderer.setSize(width, height, false);
  runtime.camera.aspect = width / height;
  runtime.camera.updateProjectionMatrix();
  invalidateRuntime(runtime);
}

function pickAtom(
  runtime: Runtime,
  canvas: HTMLCanvasElement,
  clientX: number,
  clientY: number,
) {
  const rect = canvas.getBoundingClientRect();
  const ndc = cssClientPointToNdc({ clientX, clientY }, rect);
  if (!ndc) return null;
  const pointer = new runtime.three.Vector2(ndc.x, ndc.y);
  runtime.raycaster.setFromCamera(pointer, runtime.camera);
  const hit = runtime.raycaster.intersectObjects(runtime.selectableAtoms, false)[0];
  return typeof hit?.object.userData.atomId === 'string'
    ? hit.object.userData.atomId as string
    : null;
}

function rebuildRuntimeContent(
  runtime: Runtime,
  model: AqueousDynamicsWebglScene,
  layers: AqueousWebglVisualLayers,
  selectedAtomId: string,
) {
  disposeObjectTree(runtime.content);
  runtime.scene.remove(runtime.content);
  const next = buildRuntimeContent(runtime.three, model, layers, selectedAtomId);
  runtime.content = next.group;
  runtime.selectableAtoms = next.selectableAtoms;
  runtime.scene.add(runtime.content);
}

function abandonRuntimeContentAfterContextLoss(runtime: Runtime) {
  runtime.scene.remove(runtime.content);
  runtime.content.clear();
  runtime.selectableAtoms = [];
}

function buildRuntimeContent(
  three: ThreeModule,
  model: AqueousDynamicsWebglScene,
  layers: AqueousWebglVisualLayers,
  selectedAtomId: string,
) {
  const group = new three.Group();
  group.name = `aqueous-step-${model.step}`;
  const selectableAtoms: Object3D[] = [];

  try {
  if (layers.atoms) {
    for (const atom of model.atomSpheres) {
      const color = rgbColor(three, atom.displayColorRgb);
      const geometry = new three.IcosahedronGeometry(atom.displayRadiusSceneUnits, 4);
      const selected = atom.atomId === selectedAtomId;
      const material = new three.MeshStandardMaterial({
        color,
        roughness: 0.26,
        metalness: atom.element === 'Na' ? 0.2 : 0.04,
        emissive: selected ? color : new three.Color(0x000000),
        emissiveIntensity: selected ? 0.42 : 0,
      });
      const mesh = new three.Mesh(geometry, material);
      mesh.name = atom.id;
      mesh.position.set(atom.positionAngstrom.x, atom.positionAngstrom.y, atom.positionAngstrom.z);
      mesh.userData.atomId = atom.atomId;
      mesh.userData.selectable = true;
      mesh.renderOrder = selected ? 4 : 2;
      group.add(mesh);
      selectableAtoms.push(mesh);

      if (selected) {
        const halo = new three.Mesh(
          new three.IcosahedronGeometry(atom.displayRadiusSceneUnits * 1.42, 2),
          new three.MeshBasicMaterial({
            color: 0x168454,
            transparent: true,
            opacity: 0.16,
            wireframe: true,
            depthWrite: false,
          }),
        );
        halo.name = `selection-halo:${atom.atomId}`;
        halo.position.copy(mesh.position);
        group.add(halo);
      }
    }
  }

  if (layers.structuralOH) {
    for (const link of model.structuralOhCylinders) {
      group.add(createCylinderSegment(three, link.startAngstrom, link.endAngstrom,
        link.displayRadiusSceneUnits, rgbColor(three, link.displayColorRgb), 0.9, false));
    }
  }
  if (layers.constraintDiagnostic) {
    for (const diagnostic of model.diagnosticHhConstraintSegments) {
      const segment = createCylinderSegment(
        three,
        diagnostic.startAngstrom,
        diagnostic.endAngstrom,
        diagnostic.displayLineWidthSceneUnits,
        rgbColor(three, diagnostic.displayColorRgb),
        0.62,
        true,
      );
      segment.name = diagnostic.id;
      group.add(segment);
    }
  }
  if (layers.evaluatedLJ) {
    for (const interaction of model.evaluatedLennardJonesSegments) {
      const segment = createCylinderSegment(
        three,
        interaction.startAngstrom,
        interaction.endAngstrom,
        interaction.displayLineWidthSceneUnits,
        rgbColor(three, interaction.displayColorRgb),
        0.34,
        true,
      );
      segment.name = interaction.id;
      group.add(segment);
    }
  }
  if (layers.triclinicCell) {
    for (const edge of model.triclinicCellEdges) {
      const segment = createCylinderSegment(
        three,
        edge.startAngstrom,
        edge.endAngstrom,
        edge.displayLineWidthSceneUnits,
        rgbColor(three, edge.displayColorRgb),
        0.42,
        true,
      );
      segment.name = edge.id;
      group.add(segment);
    }
  }

  const forces = model.selectedAtomForces;
  if (forces) {
    for (const arrow of forces.arrows) {
      const visible = arrow.component === 'total'
        ? layers.totalForce
        : layers.forceComponents;
      if (!visible) continue;
      const vector = new three.Vector3(
        arrow.forceVectorKjMolAngstrom.x,
        arrow.forceVectorKjMolAngstrom.y,
        arrow.forceVectorKjMolAngstrom.z,
      ).multiplyScalar(arrow.displayScaleSceneUnitsPerKjMolAngstrom);
      const length = vector.length();
      if (length <= Number.EPSILON) continue;
      const origin = new three.Vector3(
        arrow.originAngstrom.x,
        arrow.originAngstrom.y,
        arrow.originAngstrom.z,
      );
      const helper = createOwnedForceArrow(
        three,
        origin,
        vector,
        rgbColor(three, arrow.displayColorRgb),
      );
      helper.name = arrow.id;
      helper.renderOrder = arrow.component === 'total' ? 7 : 6;
      group.add(helper);
    }
  }

    return { group, selectableAtoms };
  } catch (error) {
    disposeObjectTree(group);
    throw error;
  }
}

function createOwnedForceArrow(
  three: ThreeModule,
  origin: InstanceType<ThreeModule['Vector3']>,
  vector: InstanceType<ThreeModule['Vector3']>,
  color: InstanceType<ThreeModule['Color']>,
) {
  const length = vector.length();
  const headLength = Math.min(length * 0.45, Math.max(0.055, length * 0.24));
  const headWidth = Math.min(0.075, Math.max(0.018, length * 0.12));
  const shaftLength = Math.max(0.0001, length - headLength);
  const shaftRadius = Math.min(0.026, Math.max(0.009, headWidth * 0.24));
  const arrow = new three.Group();
  arrow.position.copy(origin);
  arrow.quaternion.setFromUnitVectors(
    new three.Vector3(0, 1, 0),
    vector.clone().normalize(),
  );

  const shaft = new three.Mesh(
    new three.CylinderGeometry(shaftRadius, shaftRadius, shaftLength, 8, 1, false),
    new three.MeshBasicMaterial({ color, toneMapped: false }),
  );
  shaft.position.y = shaftLength / 2;
  arrow.add(shaft);

  const head = new three.Mesh(
    new three.ConeGeometry(headWidth, headLength, 10, 1, false),
    new three.MeshBasicMaterial({ color, toneMapped: false }),
  );
  head.position.y = shaftLength + headLength / 2;
  arrow.add(head);
  return arrow;
}

function createCylinderSegment(
  three: ThreeModule,
  start: Readonly<{ x: number; y: number; z: number }>,
  end: Readonly<{ x: number; y: number; z: number }>,
  radius: number,
  color: InstanceType<ThreeModule['Color']>,
  opacity: number,
  transparent: boolean,
) {
  const from = new three.Vector3(start.x, start.y, start.z);
  const to = new three.Vector3(end.x, end.y, end.z);
  const direction = to.clone().sub(from);
  const length = direction.length();
  const geometry = new three.CylinderGeometry(radius, radius, Math.max(length, 1e-12), 10, 1, false);
  const material = new three.MeshStandardMaterial({
    color,
    roughness: 0.48,
    metalness: 0,
    transparent,
    opacity,
    depthWrite: !transparent,
  });
  const mesh = new three.Mesh(geometry, material);
  mesh.position.copy(from).add(to).multiplyScalar(0.5);
  if (length > Number.EPSILON) {
    mesh.quaternion.setFromUnitVectors(new three.Vector3(0, 1, 0), direction.normalize());
  }
  return mesh;
}

function fitCellView(model: AqueousDynamicsWebglScene, three: ThreeModule): CameraView {
  const points = model.triclinicCellEdges.flatMap((edge) => [
    new three.Vector3(edge.startAngstrom.x, edge.startAngstrom.y, edge.startAngstrom.z),
    new three.Vector3(edge.endAngstrom.x, edge.endAngstrom.y, edge.endAngstrom.z),
  ]);
  const box = new three.Box3().setFromPoints(points);
  const center = box.getCenter(new three.Vector3());
  const sphere = box.getBoundingSphere(new three.Sphere());
  const distance = Math.max(18, sphere.radius / Math.sin((34 * Math.PI / 180) / 2) * 1.04);
  const direction = new three.Vector3(0.86, 0.68, 1.12).normalize().multiplyScalar(distance);
  const position = center.clone().add(direction);
  return {
    target: [center.x, center.y, center.z],
    position: [position.x, position.y, position.z],
  };
}

function fitInteractionView(model: AqueousDynamicsWebglScene, three: ThreeModule): CameraView {
  const points = [
    ...model.atomSpheres.map((atom) => atom.positionAngstrom),
    ...model.evaluatedLennardJonesSegments.flatMap((segment) => [
      segment.startAngstrom,
      segment.endAngstrom,
    ]),
  ].map((point) => new three.Vector3(point.x, point.y, point.z));
  const box = new three.Box3().setFromPoints(points);
  const center = box.getCenter(new three.Vector3());
  const sphere = box.getBoundingSphere(new three.Sphere());
  const distance = Math.max(11, sphere.radius / Math.sin((34 * Math.PI / 180) / 2) * 1.18);
  const direction = new three.Vector3(0.82, 0.58, 1.06).normalize().multiplyScalar(distance);
  const position = center.clone().add(direction);
  return {
    target: [center.x, center.y, center.z],
    position: [position.x, position.y, position.z],
  };
}

function applyCameraView(camera: PerspectiveCamera, controls: OrbitControls, view: CameraView) {
  camera.position.set(...view.position);
  controls.target.set(...view.target);
  camera.lookAt(controls.target);
  camera.updateProjectionMatrix();
  controls.update();
}

function moveCameraByKeyboard(runtime: Runtime, key: string) {
  if (key === 'Home') {
    applyCameraView(runtime.camera, runtime.controls, runtime.resetView);
    return '相机已复位到最小镜像相互作用区域';
  }
  const offset = runtime.camera.position.clone().sub(runtime.controls.target);
  const spherical = new runtime.three.Spherical().setFromVector3(offset);
  if (key === 'ArrowLeft') spherical.theta -= Math.PI / 36;
  else if (key === 'ArrowRight') spherical.theta += Math.PI / 36;
  else if (key === 'ArrowUp') spherical.phi -= Math.PI / 48;
  else if (key === 'ArrowDown') spherical.phi += Math.PI / 48;
  else if (key === '+' || key === '=') spherical.radius *= 0.9;
  else if (key === '-' || key === '_') spherical.radius *= 1.1;
  else return null;
  spherical.radius = Math.min(runtime.controls.maxDistance,
    Math.max(runtime.controls.minDistance, spherical.radius));
  spherical.makeSafe();
  runtime.camera.position.copy(runtime.controls.target).add(offset.setFromSpherical(spherical));
  runtime.camera.lookAt(runtime.controls.target);
  runtime.controls.update();
  return key.startsWith('Arrow') ? '三维相机已旋转' : '三维相机缩放已更新';
}

function rgbColor(three: ThreeModule, rgb: readonly [number, number, number]) {
  return new three.Color().setRGB(rgb[0], rgb[1], rgb[2], three.SRGBColorSpace);
}

function disposeObjectTree(root: Object3D) {
  const disposedGeometries = new Set<{ dispose: () => void }>();
  const disposedMaterials = new Set<{ dispose: () => void }>();
  root.traverse((object) => {
    const geometry = 'geometry' in object
      ? (object as Object3D & { geometry?: { dispose: () => void } }).geometry
      : undefined;
    if (geometry && !disposedGeometries.has(geometry)) {
      disposedGeometries.add(geometry);
      geometry.dispose();
    }
    const material = 'material' in object
      ? (object as Object3D & { material?: { dispose: () => void } | Array<{ dispose: () => void }> }).material
      : undefined;
    const materials = Array.isArray(material) ? material : material ? [material] : [];
    for (const entry of materials) {
      if (disposedMaterials.has(entry)) continue;
      disposedMaterials.add(entry);
      entry.dispose();
    }
  });
  root.clear();
}
