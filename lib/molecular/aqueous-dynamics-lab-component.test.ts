/** @vitest-environment jsdom */

import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AqueousDynamicsLab } from '../../app/components/aqueous-dynamics-lab.tsx';
import {
  createAqueousDynamicsRenderTrajectoryV043,
  type AqueousDynamicsRenderTrajectoryV043,
} from './aqueous-dynamics-render-frame.ts';
import {
  createAqueousDynamicsWebglSceneFromTrajectoryV043,
  type AqueousDynamicsWebglSceneV043,
} from './aqueous-dynamics-webgl-scene.ts';
import { AqueousDynamicsWorldV042 } from '../simulation/aqueous-dynamics-world.ts';

const webglProbe = vi.hoisted(() => ({
  renderedScenes: [] as unknown[],
  rafScenes: [] as unknown[],
}));

vi.mock('../../app/components/aqueous-dynamics-webgl.tsx', async () => {
  const react = await import('react');
  return {
    AqueousDynamicsWebgl(props: Readonly<{ sceneModel: unknown }>) {
      webglProbe.renderedScenes.push(props.sceneModel);
      react.useEffect(() => {
        const frameRequest = window.requestAnimationFrame(() => {
          webglProbe.rafScenes.push(props.sceneModel);
        });
        return () => window.cancelAnimationFrame(frameRequest);
      }, [props.sceneModel]);
      return react.createElement('output', {
        'aria-label': '可控 WebGL RAF 探针',
        'data-webgl-raf-probe': 'true',
      });
    },
  };
});

type ActEnvironment = typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

let container: HTMLDivElement;
let root: Root;
let originalActEnvironment: boolean | undefined;
let originalRequestAnimationFrame: PropertyDescriptor | undefined;
let originalCancelAnimationFrame: PropertyDescriptor | undefined;
let nextAnimationFrameId: number;
let animationFrames: Map<number, FrameRequestCallback>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  webglProbe.renderedScenes.length = 0;
  webglProbe.rafScenes.length = 0;
  animationFrames = new Map();
  nextAnimationFrameId = 1;
  originalActEnvironment = (globalThis as ActEnvironment).IS_REACT_ACT_ENVIRONMENT;
  (globalThis as ActEnvironment).IS_REACT_ACT_ENVIRONMENT = true;
  originalRequestAnimationFrame = Object.getOwnPropertyDescriptor(window, 'requestAnimationFrame');
  originalCancelAnimationFrame = Object.getOwnPropertyDescriptor(window, 'cancelAnimationFrame');
  Object.defineProperty(window, 'requestAnimationFrame', {
    configurable: true,
    writable: true,
    value: (callback: FrameRequestCallback) => {
      const frameId = nextAnimationFrameId;
      nextAnimationFrameId += 1;
      animationFrames.set(frameId, callback);
      return frameId;
    },
  });
  Object.defineProperty(window, 'cancelAnimationFrame', {
    configurable: true,
    writable: true,
    value: (frameId: number) => {
      animationFrames.delete(frameId);
    },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  restoreWindowProperty('requestAnimationFrame', originalRequestAnimationFrame);
  restoreWindowProperty('cancelAnimationFrame', originalCancelAnimationFrame);
  (globalThis as ActEnvironment).IS_REACT_ACT_ENVIRONMENT = originalActEnvironment;
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('AqueousDynamicsLab exact-endpoint presentation controls', () => {
  it('keeps play, seek, navigation, and WebGL RAF read-only after trajectory generation', async () => {
    const expectedTrajectory = createAqueousDynamicsRenderTrajectoryV043(10);
    const expectedDigests = snapshotTrajectoryDigests(expectedTrajectory);
    const solverAdvance = vi.spyOn(AqueousDynamicsWorldV042.prototype, 'advance');

    await act(async () => {
      root.render(createElement(AqueousDynamicsLab, { active: true, onBack: vi.fn() }));
    });
    clickButton('生成 0–10 精确轨迹');
    await act(async () => {
      await vi.runOnlyPendingTimersAsync();
    });

    expect(solverAdvance).toHaveBeenCalledTimes(20);
    expect(rangeControl().min).toBe('0');
    expect(rangeControl().max).toBe('10');
    expect(rangeControl().step).toBe('1');
    assertSelectedExactEndpoint(expectedTrajectory, 0);

    solverAdvance.mockClear();
    await flushAnimationFrames();
    expect(solverAdvance).not.toHaveBeenCalled();
    expect(latestRafScene()).toEqual(latestTrajectoryScene());

    clickButton('后一帧 →');
    expect(rangeControl().value).toBe('1');
    assertSelectedExactEndpoint(expectedTrajectory, 1);
    expect(solverAdvance).not.toHaveBeenCalled();

    clickButton('← 前一帧');
    expect(rangeControl().value).toBe('0');
    assertSelectedExactEndpoint(expectedTrajectory, 0);
    expect(solverAdvance).not.toHaveBeenCalled();

    clickButton('播放 exact');
    await act(async () => {
      await vi.advanceTimersByTimeAsync(320);
    });
    clickButton('暂停');
    expect(rangeControl().value).toBe('1');
    assertSelectedExactEndpoint(expectedTrajectory, 1);
    expect(solverAdvance).not.toHaveBeenCalled();

    setRangeControlValue('7.8');
    expect(rangeControl().value).toBe('7');
    assertSelectedExactEndpoint(expectedTrajectory, 7);
    expect(solverAdvance).not.toHaveBeenCalled();

    await flushAnimationFrames();
    expect(solverAdvance).not.toHaveBeenCalled();
    expect(latestRafScene()).toEqual(latestTrajectoryScene());

    for (const scene of trajectoryScenes()) {
      const sampleIndex = scene.sourceBinding.trajectorySampleIndex;
      expect(Number.isSafeInteger(sampleIndex)).toBe(true);
      expect(sampleIndex).toBeGreaterThanOrEqual(0);
      expect(sampleIndex).toBeLessThan(expectedTrajectory.samples.length);
      expect(scene.sourceBinding.trajectoryDigest).toBe(expectedDigests.trajectoryDigest);
      expect(scene.sourceBinding.trajectoryBundleDigest).toBe(expectedDigests.bundleDigest);
      expect(scene.sourceBinding.trajectorySampleDigest)
        .toBe(expectedDigests.sampleDigests[sampleIndex]);
      expect(scene.physicalDigest).toBe(expectedDigests.physicalDigests[sampleIndex]);
      expect(scene).toEqual(createAqueousDynamicsWebglSceneFromTrajectoryV043(
        expectedTrajectory,
        sampleIndex,
        'sodium-na',
      ));
    }

    expect(expectedTrajectory.presentation.rendererInterpolation).toBeNull();
    expect(snapshotTrajectoryDigests(expectedTrajectory)).toEqual(expectedDigests);
    expect(solverAdvance).not.toHaveBeenCalled();
  }, 15_000);
});

function clickButton(label: string) {
  const button = Array.from(container.querySelectorAll('button')).find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!button) throw new Error(`button not found: ${label}`);
  act(() => button.dispatchEvent(new MouseEvent('click', { bubbles: true })));
}

function rangeControl() {
  const input = container.querySelector<HTMLInputElement>(
    'input[aria-label="选择精确求解端点"]',
  );
  if (!input) throw new Error('exact endpoint range control was not rendered');
  return input;
}

function setRangeControlValue(value: string) {
  const input = rangeControl();
  const valueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value',
  )?.set;
  if (!valueSetter) throw new Error('HTML range value setter is unavailable');
  act(() => {
    valueSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function flushAnimationFrames() {
  await act(async () => {
    const pending = [...animationFrames.values()];
    animationFrames.clear();
    for (const callback of pending) callback(performance.now());
  });
}

function trajectoryScenes(): AqueousDynamicsWebglSceneV043[] {
  return webglProbe.renderedScenes.filter(isTrajectoryScene);
}

function latestTrajectoryScene() {
  const scenes = trajectoryScenes();
  const scene = scenes[scenes.length - 1];
  if (!scene) throw new Error('trajectory WebGL scene was not rendered');
  return scene;
}

function latestRafScene() {
  const scenes = webglProbe.rafScenes.filter(isTrajectoryScene);
  const scene = scenes[scenes.length - 1];
  if (!scene) throw new Error('trajectory WebGL scene RAF was not observed');
  return scene;
}

function isTrajectoryScene(value: unknown): value is AqueousDynamicsWebglSceneV043 {
  return Boolean(value && typeof value === 'object'
    && 'schemaVersion' in value
    && value.schemaVersion === 'tf.aqueous-dynamics-webgl-scene/0.4.3');
}

function assertSelectedExactEndpoint(
  trajectory: AqueousDynamicsRenderTrajectoryV043,
  sampleIndex: number,
) {
  const expected = createAqueousDynamicsWebglSceneFromTrajectoryV043(
    trajectory,
    sampleIndex,
    'sodium-na',
  );
  const actual = latestTrajectoryScene();
  expect(actual.sourceBinding.trajectorySampleIndex).toBe(sampleIndex);
  expect(actual.step).toBe(trajectory.samples[sampleIndex].step);
  expect(actual.timePicoseconds).toBe(trajectory.samples[sampleIndex].timePicoseconds);
  expect(actual.atomSpheres).toEqual(expected.atomSpheres);
  expect(actual).toEqual(expected);
}

function snapshotTrajectoryDigests(trajectory: AqueousDynamicsRenderTrajectoryV043) {
  return {
    trajectoryDigest: trajectory.trajectoryDigest,
    bundleDigest: trajectory.bundleDigest,
    sampleDigests: trajectory.samples.map((sample) => sample.sampleDigest),
    physicalDigests: trajectory.samples.map((sample) => sample.physicalDigest),
  };
}

function restoreWindowProperty(name: 'requestAnimationFrame' | 'cancelAnimationFrame', descriptor?: PropertyDescriptor) {
  if (descriptor) Object.defineProperty(window, name, descriptor);
  else Reflect.deleteProperty(window, name);
}
