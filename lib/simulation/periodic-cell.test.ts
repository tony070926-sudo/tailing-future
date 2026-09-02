import { describe, expect, it } from 'vitest';
import type { Vector3 } from '../molecular/molecular-interactions.ts';
import {
  DeterministicVerletNeighborList,
  enumeratePeriodicNeighborPairsOracle,
  PeriodicCell,
  type CellVectors3,
  type Int3,
  type NeighborAtomPosition,
} from './periodic-cell.ts';

const ORTHORHOMBIC: CellVectors3 = [
  { x: 10, y: 0, z: 0 },
  { x: 0, y: 11, z: 0 },
  { x: 0, y: 0, z: 12 },
];

const TRICLINIC: CellVectors3 = [
  { x: 9.4, y: 0.3, z: -0.2 },
  { x: 4.1, y: 8.2, z: 0.4 },
  { x: 3.3, y: 2.7, z: 7.6 },
];

describe('PeriodicCell', () => {
  it('round-trips Cartesian and fractional coordinates for orthorhombic and skew cells', () => {
    for (const vectors of [ORTHORHOMBIC, TRICLINIC]) {
      const cell = new PeriodicCell(vectors, { x: -1.2, y: 0.7, z: 2.4 });
      for (const fractional of [
        { x: 0, y: 0, z: 0 },
        { x: 0.125, y: 0.875, z: 0.375 },
        { x: -2.2, y: 3.7, z: 1.05 },
      ]) {
        expectVectorClose(cell.cartesianToFractional(cell.fractionalToCartesian(fractional)), fractional, 12);
      }
      expect(cell.volumeAngstrom3).toBeGreaterThan(0);
      expect(cell.shortestLatticeVectorAngstrom).toBeGreaterThan(0);
    }
  });

  it('wraps every axis into [0, 1) while retaining exact integer images', () => {
    const cell = new PeriodicCell(ORTHORHOMBIC);
    const wrapped = cell.wrapFractional({ x: -2.25, y: 3, z: 4.999 });
    expect(wrapped).toEqual({
      wrappedFractional: { x: 0.75, y: 0, z: 0.9989999999999997 },
      image: { x: -3, y: 3, z: 4 },
    });
    expectVectorClose(cell.unwrappedCartesian(wrapped), cell.fractionalToCartesian({ x: -2.25, y: 3, z: 4.999 }), 12);
  });

  it('matches an independent wide lattice-image oracle for a strongly skew cell', () => {
    const cell = new PeriodicCell(TRICLINIC);
    const samples = [
      [{ x: 0.91, y: 0.08, z: 0.84 }, { x: 0.11, y: 0.94, z: 0.09 }],
      [{ x: 0.03, y: 0.77, z: 0.48 }, { x: 0.96, y: 0.12, z: 0.52 }],
      [{ x: 0.36, y: 0.04, z: 0.97 }, { x: 0.63, y: 0.88, z: 0.02 }],
    ] as const;

    for (const [source, target] of samples) {
      const actual = cell.minimumImageFromFractional(source, target);
      const expected = bruteMinimumImage(TRICLINIC, source, target, 4);
      expect(actual.distanceAngstrom).toBeCloseTo(expected.distanceAngstrom, 12);
      expectVectorClose(actual.displacementAngstrom, expected.displacementAngstrom, 12);
      expect(actual.imageShiftForTarget).toEqual(expected.imageShiftForTarget);
    }
  });

  it('is continuous across a periodic face away from the exact half-cell tie', () => {
    const cell = new PeriodicCell(ORTHORHOMBIC);
    const source = { x: 0.99, y: 0.4, z: 0.5 };
    const left = cell.minimumImageFromFractional(source, { x: 0.009999999, y: 0.4, z: 0.5 });
    const right = cell.minimumImageFromFractional(source, { x: 0.010000001, y: 0.4, z: 0.5 });
    expect(left.displacementAngstrom.x).toBeCloseTo(0.19999999, 10);
    expect(right.displacementAngstrom.x).toBeCloseTo(0.20000001, 10);
    expect(Math.abs(left.distanceAngstrom - right.distanceAngstrom)).toBeLessThan(3e-8);
  });

  it('uses a deterministic exact-half tie whose reverse displacement is antisymmetric', () => {
    const cell = new PeriodicCell(ORTHORHOMBIC);
    const forward = cell.minimumImageFromFractional({ x: 0, y: 0.2, z: 0.3 }, { x: 0.5, y: 0.2, z: 0.3 });
    const reverse = cell.minimumImageFromFractional({ x: 0.5, y: 0.2, z: 0.3 }, { x: 0, y: 0.2, z: 0.3 });
    expectVectorClose(reverse.displacementAngstrom, {
      x: -forward.displacementAngstrom.x,
      y: -forward.displacementAngstrom.y,
      z: -forward.displacementAngstrom.z,
    }, 13);
  });

  it('uses the shortest lattice combination rather than only the three basis lengths', () => {
    const cell = new PeriodicCell([
      { x: 10, y: 0, z: 0 },
      { x: 9, y: 2, z: 0 },
      { x: 0, y: 0, z: 12 },
    ]);
    expect(cell.shortestLatticeVectorAngstrom).toBeCloseTo(Math.sqrt(5), 12);
    expect(() => cell.assertNeighborRadius(1.2)).toThrow('shortest nonzero lattice vector');
    expect(() => cell.assertNeighborRadius(1.1)).not.toThrow();
  });

  it('rejects left-handed, singular, ill-conditioned and non-finite cells', () => {
    expect(() => new PeriodicCell([ORTHORHOMBIC[1], ORTHORHOMBIC[0], ORTHORHOMBIC[2]])).toThrow('right-handed');
    expect(() => new PeriodicCell([ORTHORHOMBIC[0], ORTHORHOMBIC[0], ORTHORHOMBIC[2]])).toThrow();
    expect(() => new PeriodicCell([
      { x: 10, y: 0, z: 0 },
      { x: 10, y: 1e-10, z: 0 },
      { x: 0, y: 0, z: 10 },
    ])).toThrow('ill-conditioned');
    expect(() => new PeriodicCell([
      { x: Number.NaN, y: 0, z: 0 },
      ORTHORHOMBIC[1],
      ORTHORHOMBIC[2],
    ])).toThrow('finite');
    expect(() => new PeriodicCell([
      { x: 1e-4, y: 0, z: 0 },
      { x: 0, y: 1e-4, z: 0 },
      { x: 0, y: 0, z: 1e-4 },
    ])).toThrow('vector lengths');
    expect(() => new PeriodicCell([
      { x: 1e154, y: 0, z: 0 },
      { x: 0, y: 1e154, z: 0 },
      { x: 0, y: 0, z: 1e154 },
    ])).toThrow('vector lengths');
  });

  it('deep-freezes public cell geometry and emits canonical positive-zero image shifts', () => {
    const origin = { x: 1, y: 2, z: 3 };
    const cell = new PeriodicCell(ORTHORHOMBIC, origin);
    origin.x = 99;
    expect(cell.originAngstrom.x).toBe(1);
    expect(Object.isFrozen(cell.originAngstrom)).toBe(true);
    const image = cell.minimumImageFromFractional({ x: 0.1, y: 0.1, z: 0.1 }, { x: 0.2, y: 0.2, z: 0.2 });
    expect(Object.is(image.imageShiftForTarget.x, -0)).toBe(false);
    expect(Object.is(image.imageShiftForTarget.y, -0)).toBe(false);
    expect(Object.is(image.imageShiftForTarget.z, -0)).toBe(false);
  });
});

describe('DeterministicVerletNeighborList', () => {
  it('matches the O(N²) oracle exactly and emits canonical stable-ID pair order', () => {
    const cell = new PeriodicCell(ORTHORHOMBIC);
    const atoms = [
      atom(cell, 'zeta', { x: 0.97, y: 0.2, z: 0.2 }),
      atom(cell, 'alpha', { x: 0.03, y: 0.2, z: 0.2 }),
      atom(cell, 'gamma', { x: 0.3, y: 0.2, z: 0.2 }),
      atom(cell, 'beta', { x: 0.2, y: 0.2, z: 0.2 }),
    ];
    const list = new DeterministicVerletNeighborList(cell, 1.2, 0.3);
    const actual = list.update(atoms);
    const oracle = enumeratePeriodicNeighborPairsOracle(cell, atoms, 1.2);
    expect(pairIdentity(actual.pairs)).toEqual(pairIdentity(oracle));
    expect(pairIdentity(actual.pairs)).toEqual(['alpha|zeta', 'beta|gamma']);
    expect(actual.rebuilt).toBe(true);
    expect(actual.buildCount).toBe(1);
  });

  it('keeps a half-list valid below skin/2 and rebuilds at the locked threshold', () => {
    const cell = new PeriodicCell(ORTHORHOMBIC);
    const list = new DeterministicVerletNeighborList(cell, 2, 0.4);
    const initial = [atom(cell, 'a', { x: 0.1, y: 0.1, z: 0.1 }), atom(cell, 'b', { x: 0.25, y: 0.1, z: 0.1 })];
    expect(list.update(initial).rebuilt).toBe(true);

    const below = [atom(cell, 'a', { x: 0.119, y: 0.1, z: 0.1 }), initial[1]];
    const cached = list.update(below);
    expect(cached.rebuilt).toBe(false);
    expect(cached.maximumDisplacementSinceBuildAngstrom).toBeCloseTo(0.19, 12);

    const threshold = [atom(cell, 'a', { x: 0.12, y: 0.1, z: 0.1 }), initial[1]];
    const rebuilt = list.update(threshold);
    expect(rebuilt.rebuilt).toBe(true);
    expect(rebuilt.buildCount).toBe(2);
    expect(rebuilt.maximumDisplacementSinceBuildAngstrom).toBe(0);
  });

  it('tracks unwrapped displacement across a face and preserves physical pair identity', () => {
    const cell = new PeriodicCell(ORTHORHOMBIC);
    const list = new DeterministicVerletNeighborList(cell, 1.5, 0.4);
    const initial = [atom(cell, 'a', { x: 0.99, y: 0.1, z: 0.1 }), atom(cell, 'b', { x: 0.04, y: 0.1, z: 0.1 })];
    expect(pairIdentity(list.update(initial).pairs)).toEqual(['a|b']);

    const crossed = [atom(cell, 'a', { x: 1.02, y: 0.1, z: 0.1 }), initial[1]];
    const snapshot = list.update(crossed);
    expect(snapshot.rebuilt).toBe(true);
    expect(pairIdentity(snapshot.pairs)).toEqual(['a|b']);
    expect(snapshot.pairs[0].distanceAngstrom).toBeCloseTo(0.2, 12);
    expect(crossed[0].image.x).toBe(1);
  });

  it('rejects duplicate identities and unsafe list radii', () => {
    const cell = new PeriodicCell(ORTHORHOMBIC);
    expect(() => new DeterministicVerletNeighborList(cell, 4.8, 0.2)).toThrow('strictly smaller');
    const list = new DeterministicVerletNeighborList(cell, 2, 0.3);
    const duplicate = [atom(cell, 'a', { x: 0.1, y: 0.1, z: 0.1 }), atom(cell, 'a', { x: 0.2, y: 0.1, z: 0.1 })];
    expect(() => list.update(duplicate)).toThrow('unique');
  });

  it('rebuilds from fractional/image deltas even with a large render origin and image counter', () => {
    const cell = new PeriodicCell(ORTHORHOMBIC, { x: 1e8, y: -1e8, z: 5e7 });
    const list = new DeterministicVerletNeighborList(cell, 2, 0.4);
    const initial = [
      { ...atom(cell, 'a', { x: 0.1, y: 0.1, z: 0.1 }), image: { x: 999_999_999, y: 0, z: 0 } },
      { ...atom(cell, 'b', { x: 0.35, y: 0.1, z: 0.1 }), image: { x: 999_999_999, y: 0, z: 0 } },
    ];
    expect(list.update(initial).pairs).toHaveLength(0);
    const moved = [initial[0], { ...initial[1], wrappedFractional: { x: 0.29, y: 0.1, z: 0.1 } }];
    const snapshot = list.update(moved);
    expect(snapshot.rebuilt).toBe(true);
    expect(pairIdentity(snapshot.pairs)).toEqual(['a|b']);
    expect(snapshot.pairs[0].distanceAngstrom).toBeCloseTo(1.9, 12);
  });

  it('rejects unsafe lattice translations before closest-vector loops can lose integer progress', () => {
    const cell = new PeriodicCell(ORTHORHOMBIC);
    expect(() => cell.minimumImageFromCartesian(
      { x: 0, y: 0, z: 0 },
      { x: 1e16, y: 0, z: 0 },
    )).toThrow('bounded safe integers');
  });

  it('never emits an image that its own wrapped-position APIs reject', () => {
    const cell = new PeriodicCell(ORTHORHOMBIC);
    expect(() => cell.wrapFractional({ x: 1_000_000_001, y: 0, z: 0 })).toThrow('bounded safe integer');
  });
});

function atom(cell: PeriodicCell, id: string, unwrappedFractional: Vector3): NeighborAtomPosition {
  return { id, ...cell.wrapFractional(unwrappedFractional) };
}

function pairIdentity(pairs: ReadonlyArray<{ atomAId: string; atomBId: string }>) {
  return pairs.map((pair) => `${pair.atomAId}|${pair.atomBId}`);
}

function bruteMinimumImage(
  vectors: CellVectors3,
  source: Vector3,
  target: Vector3,
  radius: number,
) {
  const raw = subtract(target, source);
  let bestDistanceSquared = Number.POSITIVE_INFINITY;
  let bestDisplacement = { x: 0, y: 0, z: 0 };
  let bestTranslation: Int3 = { x: 0, y: 0, z: 0 };
  for (let nx = -radius; nx <= radius; nx += 1) {
    for (let ny = -radius; ny <= radius; ny += 1) {
      for (let nz = -radius; nz <= radius; nz += 1) {
        const translation = { x: nx, y: ny, z: nz };
        const displacementFractional = subtract(raw, translation);
        const displacementAngstrom = latticeVector(vectors, displacementFractional);
        const distanceSquared = dot(displacementAngstrom, displacementAngstrom);
        const tolerance = Math.max(1, bestDistanceSquared, distanceSquared) * Number.EPSILON * 128;
        if (
          distanceSquared < bestDistanceSquared - tolerance
          || (Math.abs(distanceSquared - bestDistanceSquared) <= tolerance && compareInt3(translation, bestTranslation) < 0)
        ) {
          bestDistanceSquared = distanceSquared;
          bestDisplacement = displacementAngstrom;
          bestTranslation = translation;
        }
      }
    }
  }
  return {
    displacementAngstrom: bestDisplacement,
    distanceAngstrom: Math.sqrt(bestDistanceSquared),
    imageShiftForTarget: {
      x: bestTranslation.x === 0 ? 0 : -bestTranslation.x,
      y: bestTranslation.y === 0 ? 0 : -bestTranslation.y,
      z: bestTranslation.z === 0 ? 0 : -bestTranslation.z,
    },
  };
}

function latticeVector(vectors: CellVectors3, fractional: Vector3) {
  const [a, b, c] = vectors;
  return {
    x: a.x * fractional.x + b.x * fractional.y + c.x * fractional.z,
    y: a.y * fractional.x + b.y * fractional.y + c.y * fractional.z,
    z: a.z * fractional.x + b.z * fractional.y + c.z * fractional.z,
  };
}

function expectVectorClose(actual: Vector3, expected: Vector3, digits: number) {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
  expect(actual.z).toBeCloseTo(expected.z, digits);
}

function subtract(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function dot(left: Vector3, right: Vector3) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function compareInt3(left: Int3, right: Int3) {
  return left.x - right.x || left.y - right.y || left.z - right.z;
}
