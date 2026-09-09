import { describe, expect, it } from 'vitest';
import { minimumWrappedOxygenDistanceNanometerV048 } from
  './atomistic-private-oxygen-minimum-distance-v048.ts';

type Anchor = readonly [number, number, number];

// Independent test-local old algorithm: no production helper or image helper.
function oldAllPairs(anchors: ReadonlyArray<Anchor>) {
  const image = (value: number) => value - 3 * Math.round(value / 3);
  let minimum = Number.POSITIVE_INFINITY;
  let calls = 0;
  for (let left = 0; left < anchors.length; left += 1) {
    for (let right = left + 1; right < anchors.length; right += 1) {
      minimum = Math.min(minimum, Math.hypot(
        image(anchors[right][0] - anchors[left][0]),
        image(anchors[right][1] - anchors[left][1]),
        image(anchors[right][2] - anchors[left][2]),
      ));
      calls += 1;
    }
  }
  return { minimum, calls };
}

function wrap(value: number) {
  const result = ((value % 3) + 3) % 3;
  return Object.is(result, -0) ? 0 : result;
}

function nextUp(value: number) {
  const bytes = new ArrayBuffer(8);
  const view = new DataView(bytes);
  view.setFloat64(0, value, true);
  view.setBigUint64(0, view.getBigUint64(0, true) + BigInt(1), true);
  return view.getFloat64(0, true);
}

// Only a scalar counter is retained; native results are forwarded unchanged.
// Globals are restored before assertions or any Vitest internals execute.
function observedHelper(anchors: ReadonlyArray<Anchor>, runtime: unknown) {
  const processDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'process');
  const nativeHypot = Math.hypot;
  let calls = 0;
  try {
    Object.defineProperty(globalThis, 'process', {configurable: true, value: runtime});
    Math.hypot = (...values: number[]) => { calls += 1; return nativeHypot(...values); };
    return { minimum: minimumWrappedOxygenDistanceNanometerV048(anchors), calls };
  } finally {
    Math.hypot = nativeHypot;
    if (processDescriptor) Object.defineProperty(globalThis, 'process', processDescriptor);
    else Reflect.deleteProperty(globalThis, 'process');
  }
}

describe.sequential('private fixed-cell oxygen minimum distance', () => {
  it('matches the independent old loop on wrapped floating-point and periodic boundaries', () => {
    // These tests run with the real pinned native implementation; runtime text
    // below selects branches and does not simulate a different JS engine.
    expect(process.versions.node).toBe('24.16.0');
    expect(process.versions.v8).toBe('13.6.233.17-node.49');
    const seeds: Anchor[][] = [
      [[0, 0, 0], [0.25, 0, 0], [0.5, 0, 0], [2, 2, 2]],
      [[0.001, 0, 0], [2.999, 0, 0], [1.5, 1.5, 1.5]],
      [[0, 0, 0], [1.5, 0, 0], [nextUp(1.5), 0, 0], [3 - 2 ** -50, 1, 1]],
      [[0, 0, 0], [1, 1, 1], [2, 2, 2], [2 + 2 ** -49, 2, 2]],
      [[0, 0, 0], [1, 0, 0], [nextUp(1), 1, 0], [nextUp(nextUp(1)), 0, 1]],
      [[-0, -3, 6], [-Number.MIN_VALUE, 3, -6], [2.75, 1.25, 0.5]],
      [[0.25, 0.25, 0.25], [0.75, 0.75, 0.75], [1.25, 1.25, 1.25]],
    ];
    // Exercise maxima in each axis and both original F64 / rounded F32 inputs.
    for (const seed of seeds) for (const shift of [0, 1, 2]) for (const f32 of [false, true]) {
      const anchors = seed.map(point => [0, 1, 2].map(axis => {
        const value = point[(axis + shift) % 3];
        return wrap(f32 ? Math.fround(value) : value);
      }) as [number, number, number]);
      const old = oldAllPairs(anchors);
      const actual = observedHelper(anchors, process);
      expect(Object.is(actual.minimum, old.minimum)).toBe(true);
      expect(old.calls).toBe(anchors.length * (anchors.length - 1) / 2);
      expect(actual.calls).toBeLessThanOrEqual(old.calls);
    }
  });

  it('retains wrapped adjacent half-cell values from negative representatives', () => {
    const halfCell = 1.5;
    const below = wrap(-1.5 - 2 ** -52);
    const above = wrap(-1.5 + 2 ** -52);
    expect(Object.is(below, halfCell - 2 ** -52)).toBe(true);
    expect(Object.is(above, nextUp(halfCell))).toBe(true);
    expect(below).toBeLessThan(halfCell);
    expect(above).toBeGreaterThan(halfCell);
    for (const separation of [below, halfCell, above]) {
      for (const axis of [0, 1, 2]) {
        const point: [number, number, number] = [0, 0, 0];
        point[axis] = separation;
        for (const anchors of [
          [[0, 0, 0] as Anchor, point], [point, [0, 0, 0] as Anchor],
        ]) {
          const old = oldAllPairs(anchors);
          const actual = observedHelper(anchors, process);
          expect(Object.is(actual.minimum, old.minimum)).toBe(true);
          expect(actual.calls).toBe(1);
        }
      }
    }
  });

  it('evaluates equality but prunes a surviving one-ULP-greater wrapped component', () => {
    const adjacent = wrap(-2 + 2 ** -52);
    expect(Object.is(adjacent, nextUp(1))).toBe(true);
    expect(adjacent).toBeGreaterThan(1);
    const equal: Anchor[] = [[0, 0, 0], [1, 0, 0], [0, 1, 0]];
    const greater: Anchor[] = [[0, 0, 0], [1, 0, 0], [adjacent, 1, 0]];
    const equalResult = observedHelper(equal, process);
    const greaterResult = observedHelper(greater, process);
    expect(Object.is(equalResult.minimum, oldAllPairs(equal).minimum)).toBe(true);
    expect(Object.is(greaterResult.minimum, oldAllPairs(greater).minimum)).toBe(true);
    expect(equalResult.calls).toBe(3);
    expect(greaterResult.calls).toBe(2);
  });

  it('uses the actual supported and fallback loops with exact full-pair counts', () => {
    const anchors: Anchor[] = Array.from({length: 895}, (_, water) => [
      wrap(0.12 + (water % 10) * 0.285),
      wrap(0.12 + (Math.floor(water / 10) % 10) * 0.285),
      wrap(0.15 + Math.floor(water / 100) * 0.32),
    ]);
    const old = oldAllPairs(anchors);
    expect(old.calls).toBe(400_065);
    const supported = observedHelper(anchors, process);
    expect(Object.is(supported.minimum, old.minimum)).toBe(true);
    expect(supported.calls).toBeLessThan(old.calls);
    for (const runtime of [
      undefined,
      {versions: {node: '0.0.0', v8: '13.6.233.17-node.49'}},
      {versions: {node: '24.16.0', v8: 'unverified'}},
      {versions: {}},
    ]) {
      const fallback = observedHelper(anchors, runtime);
      expect(Object.is(fallback.minimum, old.minimum)).toBe(true);
      expect(fallback.calls).toBe(old.calls);
    }
    console.log(JSON.stringify({oxygenPairWork: {oldCalls: old.calls, supportedCalls: supported.calls,
      fallbackCallsPerRun: old.calls, evidence: 'call-count-only-not-wall-speedup'}}));
  });
});
