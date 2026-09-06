// @vitest-environment jsdom

import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { CustomStructureWebgl } from '../../app/components/custom-structure-webgl';
import { createDefaultStructureDraft, finalizeStructureDocument } from './structure-document';
import { createStructureRenderModel } from './structure-render-model';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('real custom WebGL component fallback lifecycle', () => {
  it('reports WebGL2 unavailable and preserves read-only camera controls', async () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const announcement = vi.fn();
    const model = createStructureRenderModel(finalizeStructureDocument(createDefaultStructureDraft()));
    await act(async () => {
      root.render(React.createElement(CustomStructureWebgl, {
        active: true,
        model,
        selectedAtomId: 'atom-1',
        onAtomSelect: vi.fn(),
        onAnnouncement: announcement,
      }));
      await Promise.resolve();
    });
    expect(getContext).toHaveBeenCalledWith('webgl2', expect.objectContaining({ preserveDrawingBuffer: false }));
    expect(container.textContent).toContain('webgl2-unavailable');
    expect(container.textContent).toContain('Orbit / pan / zoom are view-only');
    expect(announcement).toHaveBeenCalledWith(expect.stringContaining('WebGL2 unavailable'));
  });

  it('does not acquire a WebGL context while inactive', () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
    const model = createStructureRenderModel(finalizeStructureDocument(createDefaultStructureDraft()));
    act(() => root.render(React.createElement(CustomStructureWebgl, {
      active: false,
      model,
      selectedAtomId: null,
      onAtomSelect: vi.fn(),
      onAnnouncement: vi.fn(),
    })));
    expect(getContext).not.toHaveBeenCalled();
  });

  it('moves to an explicit initialization failure when a Three dependency chunk rejects', async () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext')
      .mockReturnValue({} as WebGL2RenderingContext);
    const announcement = vi.fn();
    const model = createStructureRenderModel(finalizeStructureDocument(createDefaultStructureDraft()));
    await act(async () => {
      root.render(React.createElement(CustomStructureWebgl, {
        active: true,
        model,
        selectedAtomId: 'atom-1',
        onAtomSelect: vi.fn(),
        onAnnouncement: announcement,
        loadRuntime: async () => { throw new Error(`chunk unavailable ${'x'.repeat(400)}`); },
      }));
      await new Promise((resolve) => window.setTimeout(resolve, 100));
    });
    expect(getContext).toHaveBeenCalled();
    expect(container.textContent).toContain('initialization-failed');
    expect(announcement).toHaveBeenCalledWith(expect.stringContaining('dependency load failed'));
    expect((announcement.mock.calls[0][0] as string).length).toBeLessThanOrEqual(281);
  });

  it('runs the ready path, suppresses hidden RAF work, raycasts, restores context, and disposes resources', async () => {
    const harness = installReadyRuntimeHarness();
    const announcement = vi.fn();
    const status = vi.fn();
    const selected = vi.fn();
    const model = createStructureRenderModel(finalizeStructureDocument(createDefaultStructureDraft()));
    await act(async () => {
      root.render(React.createElement(CustomStructureWebgl, {
        active: true,
        model,
        selectedAtomId: 'atom-1',
        onAtomSelect: selected,
        onAnnouncement: announcement,
        onStatusChange: status,
        loadRuntime: harness.loader,
      }));
      await flushRuntime();
    });
    expect(container.textContent).not.toContain('initialization-failed');
    expect(status).not.toHaveBeenCalledWith('ready');
    expect(harness.renderers).toHaveLength(1);

    const pending = harness.rafCallbacks.shift();
    expect(pending).toBeDefined();
    setVisibility('hidden');
    act(() => pending?.(1));
    expect(harness.renderers[0].render).not.toHaveBeenCalled();
    setVisibility('visible');
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    const visibleFrame = harness.rafCallbacks.shift();
    act(() => visibleFrame?.(2));
    expect(harness.renderers[0].render).toHaveBeenCalledOnce();
    expect(status).toHaveBeenCalledWith('ready');

    const canvas = container.querySelector('canvas')!;
    vi.spyOn(canvas, 'getBoundingClientRect').mockReturnValue({
      x: 0, y: 0, left: 0, top: 0, right: 100, bottom: 100, width: 100, height: 100,
      toJSON: () => ({}),
    });
    act(() => {
      canvas.dispatchEvent(pointerEvent('pointerdown', 50, 50, 7));
      canvas.dispatchEvent(pointerEvent('pointerup', 50, 50, 7));
    });
    expect(selected).toHaveBeenCalledWith('atom-1');

    act(() => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
    expect(container.textContent).toContain('context-lost');
    expect(announcement).toHaveBeenCalledWith(expect.stringContaining('context lost'));
    await act(async () => {
      canvas.dispatchEvent(new Event('webglcontextrestored'));
      await flushRuntime();
    });
    expect(harness.renderers).toHaveLength(2);
    expect(harness.renderers[0].dispose).toHaveBeenCalledOnce();
    expect(harness.controls[0].dispose).toHaveBeenCalledOnce();

    const restoredFrame = harness.rafCallbacks.shift();
    act(() => restoredFrame?.(3));
    expect(harness.renderers[1].render).toHaveBeenCalledOnce();
    act(() => canvas.dispatchEvent(new Event('webglcontextlost', { cancelable: true })));
    expect(harness.renderers[1].dispose).toHaveBeenCalledOnce();
    await act(async () => {
      canvas.dispatchEvent(new Event('webglcontextrestored'));
      await flushRuntime();
    });
    expect(harness.renderers).toHaveLength(3);

    act(() => root.unmount());
    expect(harness.renderers.every((entry) => entry.dispose.mock.calls.length === 1)).toBe(true);
    expect(harness.controls.every((entry) => entry.dispose.mock.calls.length === 1)).toBe(true);
    root = createRoot(container);
  });

  it('fails closed and performs idempotent cleanup after partial ready-path initialization', async () => {
    const harness = installReadyRuntimeHarness({ throwOnSetSize: true });
    const removeDocumentListener = vi.spyOn(document, 'removeEventListener');
    const removeCanvasListener = vi.spyOn(HTMLCanvasElement.prototype, 'removeEventListener');
    const model = createStructureRenderModel(finalizeStructureDocument(createDefaultStructureDraft()));
    await act(async () => {
      root.render(React.createElement(CustomStructureWebgl, {
        active: true,
        model,
        selectedAtomId: 'atom-1',
        onAtomSelect: vi.fn(),
        onAnnouncement: vi.fn(),
        loadRuntime: harness.loader,
      }));
      await flushRuntime();
    });
    expect(container.textContent).toContain('initialization-failed');
    expect(harness.renderers[0].dispose).toHaveBeenCalledOnce();
    expect(harness.controls[0].dispose).toHaveBeenCalledOnce();
    expect(harness.resizeObservers[0].disconnect).toHaveBeenCalledOnce();
    expect(harness.intersectionObservers[0].disconnect).toHaveBeenCalledOnce();
    expect(removeDocumentListener).toHaveBeenCalledWith('visibilitychange', expect.any(Function));
    expect(removeCanvasListener).toHaveBeenCalledWith('webglcontextlost', expect.any(Function));
    act(() => root.unmount());
    expect(harness.renderers[0].dispose).toHaveBeenCalledOnce();
    root = createRoot(container);
  });

  it('disposes every owned resource exactly once when instance upload fails before scene attachment', async () => {
    const geometryDispose = vi.spyOn(THREE.BufferGeometry.prototype, 'dispose');
    const materialDispose = vi.spyOn(THREE.Material.prototype, 'dispose');
    const harness = installReadyRuntimeHarness({ throwOnSetMatrixAt: true });
    const model = createStructureRenderModel(finalizeStructureDocument(createDefaultStructureDraft()));
    await act(async () => {
      root.render(React.createElement(CustomStructureWebgl, {
        active: true,
        model,
        selectedAtomId: 'atom-1',
        onAtomSelect: vi.fn(),
        onAnnouncement: vi.fn(),
        loadRuntime: harness.loader,
      }));
      await flushRuntime();
    });
    expect(container.textContent).toContain('initialization-failed');
    expect(harness.renderers[0].dispose).toHaveBeenCalledOnce();
    expect(harness.controls[0].dispose).toHaveBeenCalledOnce();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    act(() => root.unmount());
    expect(harness.renderers[0].dispose).toHaveBeenCalledOnce();
    expect(harness.controls[0].dispose).toHaveBeenCalledOnce();
    expect(geometryDispose).toHaveBeenCalledOnce();
    expect(materialDispose).toHaveBeenCalledOnce();
    root = createRoot(container);
  });

  it('never publishes ready and cleans up when the first real render throws', async () => {
    const harness = installReadyRuntimeHarness({ throwOnRender: true });
    const status = vi.fn();
    const announcement = vi.fn();
    const model = createStructureRenderModel(finalizeStructureDocument(createDefaultStructureDraft()));
    await act(async () => {
      root.render(React.createElement(CustomStructureWebgl, {
        active: true,
        model,
        selectedAtomId: 'atom-1',
        onAtomSelect: vi.fn(),
        onAnnouncement: announcement,
        onStatusChange: status,
        loadRuntime: harness.loader,
      }));
      await flushRuntime();
    });
    const firstFrame = harness.rafCallbacks.shift();
    act(() => firstFrame?.(1));
    expect(status).not.toHaveBeenCalledWith('ready');
    expect(container.textContent).toContain('initialization-failed');
    expect(announcement).toHaveBeenCalledWith(expect.stringContaining('render failed'));
    expect(harness.renderers[0].dispose).toHaveBeenCalledOnce();
    expect(harness.controls[0].dispose).toHaveBeenCalledOnce();
  });
});

function installReadyRuntimeHarness(options: {
  throwOnSetSize?: boolean;
  throwOnSetMatrixAt?: boolean;
  throwOnRender?: boolean;
} = {}) {
  const renderers: FakeRenderer[] = [];
  const controls: FakeOrbitControls[] = [];
  const resizeObservers: Array<{ observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
  const intersectionObservers: Array<{ observe: ReturnType<typeof vi.fn>; disconnect: ReturnType<typeof vi.fn> }> = [];
  const rafCallbacks: FrameRequestCallback[] = [];
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({} as WebGL2RenderingContext);
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
    rafCallbacks.push(callback);
    return rafCallbacks.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  class HarnessRenderer extends FakeRenderer {
    constructor() {
      super(options);
      renderers.push(this);
    }
  }
  class HarnessControls extends FakeOrbitControls {
    constructor(camera: THREE.Camera, canvas: HTMLCanvasElement) {
      super(camera, canvas);
      controls.push(this);
    }
  }
  class HarnessResizeObserver {
    readonly observe = vi.fn();
    readonly disconnect = vi.fn();
    constructor(callback: ResizeObserverCallback) { void callback; resizeObservers.push(this); }
  }
  class HarnessIntersectionObserver {
    readonly observe = vi.fn();
    readonly disconnect = vi.fn();
    constructor(callback: IntersectionObserverCallback) { void callback; intersectionObservers.push(this); }
  }
  class HarnessRaycaster {
    setFromCamera = vi.fn();
    intersectObject = vi.fn(() => [{ instanceId: 0 }]);
  }
  class HarnessInstancedMesh extends THREE.InstancedMesh {
    override setMatrixAt(index: number, matrix: THREE.Matrix4) {
      if (options.throwOnSetMatrixAt) throw new Error('synthetic instance upload failure');
      return super.setMatrixAt(index, matrix);
    }
  }
  vi.stubGlobal('ResizeObserver', HarnessResizeObserver);
  vi.stubGlobal('IntersectionObserver', HarnessIntersectionObserver);
  const fakeThree = {
    ...THREE,
    WebGLRenderer: HarnessRenderer,
    Raycaster: HarnessRaycaster,
    InstancedMesh: HarnessInstancedMesh,
  };
  return {
    renderers,
    controls,
    resizeObservers,
    intersectionObservers,
    rafCallbacks,
    loader: async () => [fakeThree, { OrbitControls: HarnessControls }] as never,
  };
}

class FakeRenderer {
  readonly render: ReturnType<typeof vi.fn>;
  readonly dispose = vi.fn();
  readonly setClearColor = vi.fn();
  readonly setPixelRatio = vi.fn();
  readonly setSize: ReturnType<typeof vi.fn>;
  outputColorSpace = '';

  constructor(options: { throwOnSetSize?: boolean; throwOnRender?: boolean }) {
    this.render = vi.fn(() => {
      if (options.throwOnRender) throw new Error('synthetic render failure');
    });
    this.setSize = vi.fn(() => {
      if (options.throwOnSetSize) throw new Error('synthetic resize failure');
    });
  }
}

class FakeOrbitControls {
  readonly target = new THREE.Vector3();
  readonly dispose = vi.fn();
  enableDamping = false;
  autoRotate = false;
  enablePan = true;
  enableZoom = true;
  minDistance = 0;
  maxDistance = 0;
  private readonly listeners = new Map<string, Set<() => void>>();

  constructor(camera: THREE.Camera, canvas: HTMLCanvasElement) { void camera; void canvas; }
  update() {}
  addEventListener(type: string, callback: () => void) {
    const callbacks = this.listeners.get(type) ?? new Set();
    callbacks.add(callback);
    this.listeners.set(type, callbacks);
  }
  removeEventListener(type: string, callback: () => void) {
    this.listeners.get(type)?.delete(callback);
  }
}

async function flushRuntime() {
  await Promise.resolve();
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

function setVisibility(value: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value });
}

function pointerEvent(type: string, x: number, y: number, pointerId: number) {
  const event = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.defineProperty(event, 'pointerId', { value: pointerId });
  return event;
}
