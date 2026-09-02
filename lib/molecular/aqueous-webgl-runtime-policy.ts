export const WEBGL_MIN_DEVICE_PIXEL_RATIO = 1;
export const WEBGL_MAX_DEVICE_PIXEL_RATIO = 2;
export const POINTER_DRAG_THRESHOLD_CSS_PIXELS = 5;

export type CssClientPoint = Readonly<{
  clientX: number;
  clientY: number;
}>;

export type DomRectLike = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

export type NormalizedDeviceCoordinates = Readonly<{
  x: number;
  y: number;
}>;

export type WebglRenderRuntimeState = Readonly<{
  active: boolean;
  documentVisible: boolean;
  intersectionVisible: boolean;
  contextLost: boolean;
  disposed: boolean;
  framePending: boolean;
}>;

export type WebglRenderInvalidation = Readonly<{
  nextState: WebglRenderRuntimeState;
  queueAnimationFrame: boolean;
}>;

/**
 * Converts CSS client coordinates to WebGL normalized device coordinates.
 * Returns null when a coordinate is non-finite or the target has no positive area.
 * Points outside the rectangle intentionally remain outside the [-1, 1] interval.
 */
export function cssClientPointToNdc(
  point: CssClientPoint,
  rect: DomRectLike,
): NormalizedDeviceCoordinates | null {
  if (
    !isFinitePoint(point)
    || !Number.isFinite(rect.left)
    || !Number.isFinite(rect.top)
    || !Number.isFinite(rect.width)
    || !Number.isFinite(rect.height)
    || rect.width <= 0
    || rect.height <= 0
  ) {
    return null;
  }

  return {
    x: ((point.clientX - rect.left) / rect.width) * 2 - 1,
    y: 1 - ((point.clientY - rect.top) / rect.height) * 2,
  };
}

/** Keeps the renderer backing buffer bounded while preserving one physical pixel minimum. */
export function clampWebglDevicePixelRatio(devicePixelRatio: number): number {
  if (!Number.isFinite(devicePixelRatio)) return WEBGL_MIN_DEVICE_PIXEL_RATIO;
  return Math.min(
    WEBGL_MAX_DEVICE_PIXEL_RATIO,
    Math.max(WEBGL_MIN_DEVICE_PIXEL_RATIO, devicePixelRatio),
  );
}

/**
 * A movement exactly on the five-CSS-pixel boundary still counts as a click.
 * Invalid coordinates fail closed so they cannot trigger atom selection.
 */
export function isPointerClickWithinDragThreshold(
  pointerDown: CssClientPoint,
  pointerUp: CssClientPoint,
): boolean {
  if (!isFinitePoint(pointerDown) || !isFinitePoint(pointerUp)) return false;
  const deltaX = pointerUp.clientX - pointerDown.clientX;
  const deltaY = pointerUp.clientY - pointerDown.clientY;
  return (
    deltaX * deltaX + deltaY * deltaY
    <= POINTER_DRAG_THRESHOLD_CSS_PIXELS * POINTER_DRAG_THRESHOLD_CSS_PIXELS
  );
}

/** True only when one new requestAnimationFrame callback may be queued. */
export function canQueueWebglRender(state: WebglRenderRuntimeState): boolean {
  return (
    state.active
    && state.documentVisible
    && state.intersectionVisible
    && !state.contextLost
    && !state.disposed
    && !state.framePending
  );
}

/**
 * Coalesces repeated invalidations by setting framePending only for the first
 * eligible request. The caller owns requestAnimationFrame and renderer effects.
 */
export function invalidateWebglRender(
  state: WebglRenderRuntimeState,
): WebglRenderInvalidation {
  if (!canQueueWebglRender(state)) {
    return { nextState: state, queueAnimationFrame: false };
  }
  return {
    nextState: { ...state, framePending: true },
    queueAnimationFrame: true,
  };
}

/** Clears the coalescing latch after a queued callback runs or is cancelled. */
export function settleWebglRenderFrame(
  state: WebglRenderRuntimeState,
): WebglRenderRuntimeState {
  if (!state.framePending) return state;
  return { ...state, framePending: false };
}

function isFinitePoint(point: CssClientPoint): boolean {
  return Number.isFinite(point.clientX) && Number.isFinite(point.clientY);
}
