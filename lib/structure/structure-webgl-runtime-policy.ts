export const STRUCTURE_WEBGL_MIN_DPR = 1;
export const STRUCTURE_WEBGL_MAX_DPR = 2;
export const STRUCTURE_POINTER_CLICK_THRESHOLD_CSS_PX = 5;

export type StructureWebglRuntimeState = Readonly<{
  active: boolean;
  documentVisible: boolean;
  intersectionVisible: boolean;
  contextLost: boolean;
  disposed: boolean;
  framePending: boolean;
}>;

export function clampStructureWebglDpr(value: number): number {
  if (!Number.isFinite(value)) return STRUCTURE_WEBGL_MIN_DPR;
  return Math.max(STRUCTURE_WEBGL_MIN_DPR, Math.min(STRUCTURE_WEBGL_MAX_DPR, value));
}
export function canQueueStructureRender(state: StructureWebglRuntimeState): boolean {
  return state.active
    && state.documentVisible
    && state.intersectionVisible
    && !state.contextLost
    && !state.disposed
    && !state.framePending;
}

export function invalidateStructureRender(state: StructureWebglRuntimeState): Readonly<{
  nextState: StructureWebglRuntimeState;
  queueAnimationFrame: boolean;
}> {
  if (!canQueueStructureRender(state)) return { nextState: state, queueAnimationFrame: false };
  return { nextState: { ...state, framePending: true }, queueAnimationFrame: true };
}

export function settleStructureRender(state: StructureWebglRuntimeState): StructureWebglRuntimeState {
  return state.framePending ? { ...state, framePending: false } : state;
}

export function structurePointerIsClick(
  down: Readonly<{ x: number; y: number }>,
  up: Readonly<{ x: number; y: number }>,
): boolean {
  if (![down.x, down.y, up.x, up.y].every(Number.isFinite)) return false;
  const dx = up.x - down.x;
  const dy = up.y - down.y;
  return dx * dx + dy * dy <= STRUCTURE_POINTER_CLICK_THRESHOLD_CSS_PX ** 2;
}

export function structureClientPointToNdc(
  client: Readonly<{ x: number; y: number }>,
  rect: Readonly<{ left: number; top: number; width: number; height: number }>,
): Readonly<{ x: number; y: number }> | null {
  if (![client.x, client.y, rect.left, rect.top, rect.width, rect.height].every(Number.isFinite)) return null;
  if (rect.width <= 0 || rect.height <= 0) return null;
  return {
    x: ((client.x - rect.left) / rect.width) * 2 - 1,
    y: 1 - ((client.y - rect.top) / rect.height) * 2,
  };
}
