import { describe, expect, it } from 'vitest';
import type { Vector3 } from '../molecular/molecular-interactions.ts';
import { PeriodicCell, type Int3, type WrappedPeriodicPosition } from './periodic-cell.ts';
import {
  complementaryErrorFunction,
  DEFAULT_EWALD_ELECTROSTATIC_CONSTANT_KJ_MOL_ANGSTROM_E2,
  evaluateDirectPeriodicEwald,
  type DirectEwaldAtomV042,
  type DirectEwaldOptionsV042,
} from './periodic-ewald.ts';

const COULOMB = DEFAULT_EWALD_ELECTROSTATIC_CONSTANT_KJ_MOL_ANGSTROM_E2;

function options(overrides: Partial<DirectEwaldOptionsV042> = {}): DirectEwaldOptionsV042 {
  return {
    alphaInverseAngstrom: 0.45,
    realSpaceCutoffAngstrom: 18,
    reciprocalCutoffInverseAngstrom: 7,
    relativePermittivity: 1,
    neutralityToleranceE: 1e-12,
    electrostaticConstantKjMolAngstromE2: COULOMB,
    maximumRealSpaceCandidates: 10_000_000,
    maximumReciprocalCandidates: 10_000_000,
    ...overrides,
  };
}

function cubicCell(edge = 10, origin: Vector3 = { x: 0, y: 0, z: 0 }) {
  return new PeriodicCell([
    { x: edge, y: 0, z: 0 },
    { x: 0, y: edge, z: 0 },
    { x: 0, y: 0, z: edge },
  ], origin);
}

function triclinicCell(origin: Vector3 = { x: 0, y: 0, z: 0 }) {
  return new PeriodicCell([
    { x: 11, y: 0, z: 0 },
    { x: 2.1, y: 10.3, z: 0 },
    { x: -0.7, y: 1.4, z: 12.2 },
  ], origin);
}

function neutralTriclinicAtoms(): DirectEwaldAtomV042[] {
  return [
    ewaldAtom('charge-a', 1, { x: 0.17, y: 0.23, z: 0.31 }),
    ewaldAtom('charge-b', -0.6, { x: 0.62, y: 0.44, z: 0.73 }),
    ewaldAtom('charge-c', -0.4, { x: 0.83, y: 0.12, z: 0.54 }),
  ];
}

function rocksaltAtoms(): DirectEwaldAtomV042[] {
  const positive = [
    [0.5, 0, 0],
    [0, 0.5, 0],
    [0, 0, 0.5],
    [0.5, 0.5, 0.5],
  ] as const;
  const negative = [
    [0, 0, 0],
    [0, 0.5, 0.5],
    [0.5, 0, 0.5],
    [0.5, 0.5, 0],
  ] as const;
  return [
    ...positive.map(([x, y, z], index) => ewaldAtom(`na-${index}`, 1, { x, y, z })),
    ...negative.map(([x, y, z], index) => ewaldAtom(`cl-${index}`, -1, { x, y, z })),
  ];
}

function shiftImages(atoms: ReadonlyArray<DirectEwaldAtomV042>, delta: Int3) {
  return atoms.map((atom) => ({
    ...atom,
    position: {
      wrappedFractional: { ...atom.position.wrappedFractional },
      image: {
        x: atom.position.image.x + delta.x,
        y: atom.position.image.y + delta.y,
        z: atom.position.image.z + delta.z,
      },
    },
  }));
}

function translateWrapped(atoms: ReadonlyArray<DirectEwaldAtomV042>, delta: Vector3) {
  return atoms.map((atom) => ({
    ...atom,
    position: wrappedPosition(add(atom.position.wrappedFractional, delta)),
  }));
}

describe('direct periodic Ewald reference', () => {
  it('evaluates erfc accurately across the real-space range', () => {
    const references = [
      [0, 1],
      [0.5, 0.4795001221869535],
      [1, 0.15729920705028513],
      [2, 0.004677734981047266],
      [5, 1.537459794428035e-12],
    ] as const;
    for (const [input, expected] of references) {
      expect(complementaryErrorFunction(input)).toBeCloseTo(expected, 14);
    }
    expect(() => complementaryErrorFunction(-1)).toThrow(/nonnegative/);
  });

  it('reproduces the rocksalt point-charge Madelung energy without claiming a NaCl force field', () => {
    const latticeAngstrom = 5.64;
    const nearestNeighborAngstrom = latticeAngstrom / 2;
    const madelung = 1.7475645946331822;
    const expectedCellEnergy = -4 * madelung * COULOMB / nearestNeighborAngstrom;
    const result = evaluateDirectPeriodicEwald(
      cubicCell(latticeAngstrom),
      rocksaltAtoms(),
      options({
        alphaInverseAngstrom: 0.5,
        realSpaceCutoffAngstrom: 24,
        reciprocalCutoffInverseAngstrom: 10,
      }),
    );

    expect(result.energyKjMol.total).toBeCloseTo(expectedCellEnergy, 10);
    expect(magnitude(result.netForceKjMolAngstrom)).toBeLessThan(1e-12);
    expect(result.boundaries.join('\n')).toMatch(/not PME/);
    expect(result.provenance.pme).toBe(false);
  });

  it('matches analytical forces with central energy differences in a skew cell', () => {
    const cell = triclinicCell();
    const atoms = neutralTriclinicAtoms();
    const configuration = options();
    const result = evaluateDirectPeriodicEwald(cell, atoms, configuration);
    const stepAngstrom = 1e-5;
    let maximumAbsoluteError = 0;

    for (let atomIndex = 0; atomIndex < atoms.length; atomIndex += 1) {
      for (const axis of ['x', 'y', 'z'] as const) {
        const cartesianStep = {
          x: axis === 'x' ? stepAngstrom : 0,
          y: axis === 'y' ? stepAngstrom : 0,
          z: axis === 'z' ? stepAngstrom : 0,
        };
        const fractionalStep = cell.cartesianVectorToFractional(cartesianStep);
        const plus = displacedAtom(atoms, atomIndex, fractionalStep, 1);
        const minus = displacedAtom(atoms, atomIndex, fractionalStep, -1);
        const plusEnergy = evaluateDirectPeriodicEwald(cell, plus, configuration).energyKjMol.total;
        const minusEnergy = evaluateDirectPeriodicEwald(cell, minus, configuration).energyKjMol.total;
        const finiteDifferenceForce = -(plusEnergy - minusEnergy) / (2 * stepAngstrom);
        const analyticalForce = result.forceByAtomIdKjMolAngstrom[atoms[atomIndex].id][axis];
        maximumAbsoluteError = Math.max(maximumAbsoluteError, Math.abs(finiteDifferenceForce - analyticalForce));
      }
    }

    expect(maximumAbsoluteError).toBeLessThan(5e-8);
    expect(magnitude(result.netForceKjMolAngstrom)).toBeLessThan(1e-12);
    for (const atom of atoms) {
      const components = result.forceComponentsByAtomIdKjMolAngstrom[atom.id];
      expect(add(components.realSpace, components.reciprocalSpace))
        .toEqual(result.forceByAtomIdKjMolAngstrom[atom.id]);
      expect(components.selfCorrection).toEqual({ x: 0, y: 0, z: 0 });
    }
  });

  it('converges with tighter spherical sums and becomes alpha independent', () => {
    const cell = new PeriodicCell([
      { x: 9, y: 0, z: 0 },
      { x: 1.7, y: 8.4, z: 0 },
      { x: -0.8, y: 1.1, z: 10.2 },
    ]);
    const atoms = neutralTriclinicAtoms();
    const reference = evaluateDirectPeriodicEwald(cell, atoms, options({
      realSpaceCutoffAngstrom: 28,
      reciprocalCutoffInverseAngstrom: 10,
    })).energyKjMol.total;
    const loose = evaluateDirectPeriodicEwald(cell, atoms, options({
      realSpaceCutoffAngstrom: 7,
      reciprocalCutoffInverseAngstrom: 2,
    })).energyKjMol.total;
    const medium = evaluateDirectPeriodicEwald(cell, atoms, options({
      realSpaceCutoffAngstrom: 10,
      reciprocalCutoffInverseAngstrom: 3,
    })).energyKjMol.total;
    const tight = evaluateDirectPeriodicEwald(cell, atoms, options({
      realSpaceCutoffAngstrom: 14,
      reciprocalCutoffInverseAngstrom: 5,
    })).energyKjMol.total;

    expect(Math.abs(medium - reference)).toBeLessThan(Math.abs(loose - reference));
    expect(Math.abs(tight - reference)).toBeLessThan(Math.abs(medium - reference));
    expect(Math.abs(tight - reference)).toBeLessThan(1e-9);

    for (const alphaInverseAngstrom of [0.3, 0.45, 0.65]) {
      const energy = evaluateDirectPeriodicEwald(cell, atoms, options({
        alphaInverseAngstrom,
        realSpaceCutoffAngstrom: 24,
        reciprocalCutoffInverseAngstrom: 9,
      })).energyKjMol.total;
      expect(Math.abs(energy - reference)).toBeLessThan(1e-9);
    }
  });

  it('reports the exact Ewald self correction independently of positions', () => {
    const alphaInverseAngstrom = 0.4;
    const atoms = [
      ewaldAtom('positive', 1, { x: 0.1, y: 0.2, z: 0.3 }),
      ewaldAtom('negative', -1, { x: 0.6, y: 0.7, z: 0.8 }),
    ];
    const result = evaluateDirectPeriodicEwald(cubicCell(), atoms, options({ alphaInverseAngstrom }));
    const expected = -COULOMB * alphaInverseAngstrom * 2 / Math.sqrt(Math.PI);
    expect(result.energyKjMol.selfCorrection).toBeCloseTo(expected, 12);
    expect(result.energyKjMol.total).toBeCloseTo(
      result.energyKjMol.realSpace + result.energyKjMol.reciprocalSpace + result.energyKjMol.selfCorrection,
      13,
    );
  });

  it('is invariant to atom order, lattice gauges, common translations and the cell origin gauge', () => {
    const atoms = neutralTriclinicAtoms();
    const cell = triclinicCell();
    const reference = evaluateDirectPeriodicEwald(cell, atoms, options());
    const permuted = evaluateDirectPeriodicEwald(cell, [...atoms].reverse(), options());
    expect(permuted).toEqual(reference);

    const latticeGauged = shiftImages(atoms, {
      x: 1_000_000_000,
      y: -1_000_000_000,
      z: 1_000_000_000,
    });
    const latticeResult = evaluateDirectPeriodicEwald(cell, latticeGauged, options());
    expect(latticeResult).toEqual(reference);

    const translated = evaluateDirectPeriodicEwald(
      cell,
      translateWrapped(atoms, { x: 0.137, y: -0.211, z: 0.089 }),
      options(),
    );
    expect(Math.abs(translated.energyKjMol.total - reference.energyKjMol.total)).toBeLessThan(1e-11);
    expect(maximumVectorDifference(
      translated.forceByAtomIdKjMolAngstrom,
      reference.forceByAtomIdKjMolAngstrom,
    )).toBeLessThan(1e-11);

    const shiftedOrigin = evaluateDirectPeriodicEwald(
      triclinicCell({ x: 900_000_000, y: -800_000_000, z: 700_000_000 }),
      atoms,
      options(),
    );
    expect(shiftedOrigin).toEqual(reference);
  });

  it('scales quadratically with charge and is unchanged by a global charge-sign flip', () => {
    const cell = triclinicCell();
    const atoms = neutralTriclinicAtoms();
    const reference = evaluateDirectPeriodicEwald(cell, atoms, options());
    const signFlipped = evaluateDirectPeriodicEwald(
      cell,
      atoms.map((atom) => ({ ...atom, chargeE: -atom.chargeE })),
      options(),
    );
    expect(signFlipped.energyKjMol).toEqual(reference.energyKjMol);
    expect(signFlipped.forceByAtomIdKjMolAngstrom).toEqual(reference.forceByAtomIdKjMolAngstrom);

    const doubled = evaluateDirectPeriodicEwald(
      cell,
      atoms.map((atom) => ({ ...atom, chargeE: 2 * atom.chargeE })),
      options(),
    );
    expect(doubled.energyKjMol.total).toBeCloseTo(4 * reference.energyKjMol.total, 11);
    for (const atom of atoms) {
      expectVectorClose(
        doubled.forceByAtomIdKjMolAngstrom[atom.id],
        scale(reference.forceByAtomIdKjMolAngstrom[atom.id], 4),
        11,
      );
    }
  });

  it('binds the physical cell while omitting the nonphysical origin gauge', () => {
    const atoms = neutralTriclinicAtoms();
    const first = evaluateDirectPeriodicEwald(triclinicCell(), atoms, options());
    const secondCell = new PeriodicCell([
      { x: 11.2, y: 0, z: 0 },
      { x: 2.1, y: 10.3, z: 0 },
      { x: -0.7, y: 1.4, z: 12.2 },
    ]);
    const second = evaluateDirectPeriodicEwald(secondCell, atoms, options());

    expect(first.cell.originGauge).toBe('omitted-origin-is-not-physical');
    expect(second.cell).not.toEqual(first.cell);
    expect(second.energyKjMol.total).not.toBe(first.energyKjMol.total);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.cell.vectorsAngstrom[0])).toBe(true);
  });

  it('fails closed on non-neutral, overlapping, continuum-dielectric and nonfinite inputs', () => {
    const cell = cubicCell();
    expect(() => evaluateDirectPeriodicEwald(cell, [
      ewaldAtom('a', 1, { x: 0, y: 0, z: 0 }),
      ewaldAtom('b', -0.9, { x: 0.5, y: 0.5, z: 0.5 }),
    ], options())).toThrow(/electrically neutral/);

    expect(() => evaluateDirectPeriodicEwald(cell, [
      ewaldAtom('a', 1, { x: 0.2, y: 0.3, z: 0.4 }),
      ewaldAtom('b', -1, { x: 0.2, y: 0.3, z: 0.4 }),
    ], options())).toThrow(/overlap/);

    expect(() => evaluateDirectPeriodicEwald(
      cell,
      neutralTriclinicAtoms(),
      { ...options(), relativePermittivity: 78.3 } as unknown as DirectEwaldOptionsV042,
    )).toThrow(/relativePermittivity is locked to 1/);

    expect(() => evaluateDirectPeriodicEwald(
      cell,
      neutralTriclinicAtoms(),
      { ...options(), extraPhysicalKnob: 7 } as unknown as DirectEwaldOptionsV042,
    )).toThrow(/exactly the locked keys/);

    expect(() => evaluateDirectPeriodicEwald(cell, [
      ewaldAtom('a', 1, { x: Number.NaN, y: 0, z: 0 }),
      ewaldAtom('b', -1, { x: 0.5, y: 0.5, z: 0.5 }),
    ], options())).toThrow(/wrapped fractional/);

    expect(() => evaluateDirectPeriodicEwald(cell, [
      {
        id: 'a',
        chargeE: 1,
        position: {
          wrappedFractional: { x: 1.2, y: 0, z: 0 },
          image: { x: 0, y: 0, z: 0 },
        },
      },
      ewaldAtom('b', -1, { x: 0.5, y: 0.5, z: 0.5 }),
    ], options())).toThrow(/wrapped fractional/);
  });

  it('enforces actual real and reciprocal work budgets before excessive evaluation', () => {
    const atoms = neutralTriclinicAtoms();
    expect(() => evaluateDirectPeriodicEwald(
      triclinicCell(),
      atoms,
      options({ maximumRealSpaceCandidates: 1 }),
    )).toThrow(/real-space work-unit limit exceeded/);
    expect(() => evaluateDirectPeriodicEwald(
      triclinicCell(),
      atoms,
      options({ maximumReciprocalCandidates: 1 }),
    )).toThrow(/reciprocal-space work-unit limit exceeded/);

    const accepted = evaluateDirectPeriodicEwald(triclinicCell(), atoms, options());
    expect(accepted.enumeration.realSpaceWorkUnitsConsumed)
      .toBeGreaterThan(accepted.enumeration.realSpaceCandidatesExamined);
    expect(accepted.enumeration.reciprocalWorkUnitsConsumed)
      .toBeGreaterThan(accepted.enumeration.reciprocalCandidatesExamined);
  });
});

function displacedAtom(
  atoms: ReadonlyArray<DirectEwaldAtomV042>,
  atomIndex: number,
  fractionalStep: Vector3,
  direction: number,
) {
  return atoms.map((atom, index) => index === atomIndex
    ? {
      ...atom,
      position: wrappedPosition(add(
        atom.position.wrappedFractional,
        scale(fractionalStep, direction),
      )),
    }
    : atom);
}

function ewaldAtom(id: string, chargeE: number, wrappedFractional: Vector3): DirectEwaldAtomV042 {
  return { id, chargeE, position: wrappedPosition(wrappedFractional) };
}

function wrappedPosition(fractional: Vector3): WrappedPeriodicPosition {
  const x = wrapScalar(fractional.x);
  const y = wrapScalar(fractional.y);
  const z = wrapScalar(fractional.z);
  return {
    wrappedFractional: { x: x.wrapped, y: y.wrapped, z: z.wrapped },
    image: { x: x.image, y: y.image, z: z.image },
  };
}

function wrapScalar(value: number) {
  const image = Math.floor(value);
  return { wrapped: value - image, image };
}

function maximumVectorDifference(
  left: Readonly<Record<string, Vector3>>,
  right: Readonly<Record<string, Vector3>>,
) {
  return Math.max(...Object.keys(left).map((id) => magnitude(subtract(left[id], right[id]))));
}

function expectVectorClose(actual: Vector3, expected: Vector3, digits: number) {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
  expect(actual.z).toBeCloseTo(expected.z, digits);
}

function add(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function subtract(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function scale(vector: Vector3, factor: number): Vector3 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

function magnitude(vector: Vector3) {
  return Math.hypot(vector.x, vector.y, vector.z);
}
