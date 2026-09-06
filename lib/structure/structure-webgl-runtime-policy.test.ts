import { describe, expect, it } from 'vitest';
import {
  canQueueStructureRender,
  clampStructureWebglDpr,
  invalidateStructureRender,
  settleStructureRender,
  structureClientPointToNdc,
  structurePointerIsClick,
  type StructureWebglRuntimeState,
} from './structure-webgl-runtime-policy';

const ready: StructureWebglRuntimeState = {
  active: true,
  documentVisible: true,
  intersectionVisible: true,
  contextLost: false,
  disposed: false,
  framePending: false,
};

describe('static WebGL invalidation policy', () => {
  it('coalesces one frame and suppresses hidden, inactive, lost and disposed states', () => {
    const first = invalidateStructureRender(ready);
    expect(first.queueAnimationFrame).toBe(true);
    expect(canQueueStructureRender(first.nextState)).toBe(false);
    expect(invalidateStructureRender(first.nextState).queueAnimationFrame).toBe(false);
    expect(settleStructureRender(first.nextState)).toEqual(ready);
    for (const blocked of [
      { active: false },
      { documentVisible: false },
      { intersectionVisible: false },
      { contextLost: true },
      { disposed: true },
    ]) {
      expect(canQueueStructureRender({ ...ready, ...blocked })).toBe(false);
    }
  });

  it('bounds DPR, pointer clicks, and CSS-to-NDC conversion', () => {
    expect(clampStructureWebglDpr(0.2)).toBe(1);
    expect(clampStructureWebglDpr(7)).toBe(2);
    expect(clampStructureWebglDpr(Number.NaN)).toBe(1);
    expect(structurePointerIsClick({ x: 0, y: 0 }, { x: 3, y: 4 })).toBe(true);
    expect(structurePointerIsClick({ x: 0, y: 0 }, { x: 3, y: 4.01 })).toBe(false);
    expect(structureClientPointToNdc(
      { x: 60, y: 45 },
      { left: 10, top: 20, width: 100, height: 50 },
    )).toEqual({ x: 0, y: 0 });
    expect(structureClientPointToNdc(
      { x: 0, y: 0 },
      { left: 0, top: 0, width: 0, height: 1 },
    )).toBeNull();
  });
});
