import { describe, expect, it } from 'vitest';
import {
  POINTER_DRAG_THRESHOLD_CSS_PIXELS,
  canQueueWebglRender,
  clampWebglDevicePixelRatio,
  cssClientPointToNdc,
  invalidateWebglRender,
  isPointerClickWithinDragThreshold,
  settleWebglRenderFrame,
  type WebglRenderRuntimeState,
} from './aqueous-webgl-runtime-policy.ts';

const READY_STATE: WebglRenderRuntimeState = {
  active: true,
  documentVisible: true,
  intersectionVisible: true,
  contextLost: false,
  disposed: false,
  framePending: false,
};

describe('aqueous WebGL runtime policy', () => {
  it('maps CSS client coordinates to WebGL NDC at rectangle boundaries and center', () => {
    const rect = { left: 100, top: 50, width: 400, height: 200 };
    expect(cssClientPointToNdc({ clientX: 100, clientY: 50 }, rect)).toEqual({ x: -1, y: 1 });
    expect(cssClientPointToNdc({ clientX: 500, clientY: 250 }, rect)).toEqual({ x: 1, y: -1 });
    expect(cssClientPointToNdc({ clientX: 300, clientY: 150 }, rect)).toEqual({ x: 0, y: 0 });
    expect(cssClientPointToNdc({ clientX: 700, clientY: 350 }, rect)).toEqual({ x: 2, y: -2 });
  });

  it('rejects zero-sized, negative-sized, and non-finite coordinate inputs', () => {
    const point = { clientX: 10, clientY: 10 };
    expect(cssClientPointToNdc(point, { left: 0, top: 0, width: 0, height: 20 })).toBeNull();
    expect(cssClientPointToNdc(point, { left: 0, top: 0, width: 20, height: 0 })).toBeNull();
    expect(cssClientPointToNdc(point, { left: 0, top: 0, width: -20, height: 20 })).toBeNull();
    expect(cssClientPointToNdc(
      { clientX: Number.NaN, clientY: 10 },
      { left: 0, top: 0, width: 20, height: 20 },
    )).toBeNull();
  });

  it('clamps device pixel ratio to the inclusive [1, 2] interval', () => {
    expect(clampWebglDevicePixelRatio(0.5)).toBe(1);
    expect(clampWebglDevicePixelRatio(1)).toBe(1);
    expect(clampWebglDevicePixelRatio(1.5)).toBe(1.5);
    expect(clampWebglDevicePixelRatio(2)).toBe(2);
    expect(clampWebglDevicePixelRatio(3)).toBe(2);
    expect(clampWebglDevicePixelRatio(Number.NaN)).toBe(1);
    expect(clampWebglDevicePixelRatio(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it('uses a five-CSS-pixel inclusive click threshold and rejects larger drags', () => {
    expect(POINTER_DRAG_THRESHOLD_CSS_PIXELS).toBe(5);
    const pointerDown = { clientX: 20, clientY: 30 };
    expect(isPointerClickWithinDragThreshold(pointerDown, { clientX: 23, clientY: 34 })).toBe(true);
    expect(isPointerClickWithinDragThreshold(pointerDown, { clientX: 25, clientY: 30 })).toBe(true);
    expect(isPointerClickWithinDragThreshold(pointerDown, { clientX: 24, clientY: 34 })).toBe(false);
    expect(isPointerClickWithinDragThreshold(
      pointerDown,
      { clientX: Number.NaN, clientY: 30 },
    )).toBe(false);
  });

  it('queues one eligible render and coalesces repeated invalidations', () => {
    expect(canQueueWebglRender(READY_STATE)).toBe(true);
    const first = invalidateWebglRender(READY_STATE);
    expect(first.queueAnimationFrame).toBe(true);
    expect(first.nextState).toEqual({ ...READY_STATE, framePending: true });
    expect(READY_STATE.framePending).toBe(false);

    const duplicate = invalidateWebglRender(first.nextState);
    expect(duplicate.queueAnimationFrame).toBe(false);
    expect(duplicate.nextState).toBe(first.nextState);

    const settled = settleWebglRenderFrame(first.nextState);
    expect(settled.framePending).toBe(false);
    expect(invalidateWebglRender(settled).queueAnimationFrame).toBe(true);
  });

  it.each([
    ['inactive', { active: false }],
    ['document hidden', { documentVisible: false }],
    ['outside the viewport', { intersectionVisible: false }],
    ['context lost', { contextLost: true }],
    ['disposed', { disposed: true }],
    ['frame pending', { framePending: true }],
  ] as const)('does not queue a render while %s', (_label, override) => {
    const blocked = { ...READY_STATE, ...override };
    expect(canQueueWebglRender(blocked)).toBe(false);
    const invalidation = invalidateWebglRender(blocked);
    expect(invalidation.queueAnimationFrame).toBe(false);
    expect(invalidation.nextState).toBe(blocked);
  });
});
