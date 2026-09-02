import { describe, expect, it } from 'vitest';
import type { Vector3 } from '../molecular/molecular-interactions.ts';
import { PeriodicCell, type Int3, type WrappedPeriodicPosition } from './periodic-cell.ts';
import {
  DEFAULT_EWALD_ELECTROSTATIC_CONSTANT_KJ_MOL_ANGSTROM_E2,
  evaluateDirectPeriodicEwald,
  type DirectEwaldAtomV042,
  type DirectEwaldOptionsV042,
} from './periodic-ewald.ts';
import {
  DEFAULT_PERIODIC_COULOMB_EXCEPTION_OPTIONS_V042,
  evaluatePeriodicCoulombExceptionCorrections,
  type PeriodicCoulombExceptionAtomV042,
  type PeriodicCoulombExceptionOptionsV042,
  type PeriodicCoulombExceptionV042,
} from './periodic-coulomb-exceptions.ts';

const COULOMB = DEFAULT_EWALD_ELECTROSTATIC_CONSTANT_KJ_MOL_ANGSTROM_E2;

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

function atom(
  id: string,
  chargeE: number,
  wrappedFractional: Vector3,
  image: Int3 = { x: 0, y: 0, z: 0 },
): PeriodicCoulombExceptionAtomV042 {
  return { id, chargeE, position: { wrappedFractional, image } };
}

function ewaldOptions(): DirectEwaldOptionsV042 {
  return {
    alphaInverseAngstrom: 0.45,
    realSpaceCutoffAngstrom: 18,
    reciprocalCutoffInverseAngstrom: 7,
    relativePermittivity: 1,
    neutralityToleranceE: 1e-12,
    electrostaticConstantKjMolAngstromE2: COULOMB,
    maximumRealSpaceCandidates: 10_000_000,
    maximumReciprocalCandidates: 10_000_000,
  };
}

describe('periodic Ewald Coulomb exception corrections', () => {
  it('removes or scales one selected unscreened pair with exact energy, force and correction virial', () => {
    const cell = cubicCell();
    const atoms = [
      atom('positive', 1, { x: 0.2, y: 0.3, z: 0.4 }),
      atom('negative', -1, { x: 0.3, y: 0.3, z: 0.4 }),
    ];
    const exclusion = exception(cell, atoms, 'pair', 'positive', 'negative', 0);
    const excluded = evaluatePeriodicCoulombExceptionCorrections(
      cell,
      atoms,
      [exclusion],
      DEFAULT_PERIODIC_COULOMB_EXCEPTION_OPTIONS_V042,
    );
    const half = evaluatePeriodicCoulombExceptionCorrections(
      cell,
      atoms,
      [{ ...exclusion, coulombScale: 0.5 }],
      DEFAULT_PERIODIC_COULOMB_EXCEPTION_OPTIONS_V042,
    );

    expect(excluded.energyCorrectionKjMol).toBeCloseTo(COULOMB, 12);
    expect(excluded.forceCorrectionByAtomIdKjMolAngstrom.negative.x).toBeCloseTo(COULOMB, 11);
    expect(excluded.forceCorrectionByAtomIdKjMolAngstrom.positive.x).toBeCloseTo(-COULOMB, 11);
    expect(excluded.virialCorrectionKjMol.xx).toBeCloseTo(COULOMB, 11);
    expect(excluded.netForceCorrectionKjMolAngstrom).toEqual({ x: 0, y: 0, z: 0 });
    expect(half.energyCorrectionKjMol).toBeCloseTo(0.5 * excluded.energyCorrectionKjMol, 12);
    expect(half.forceCorrectionByAtomIdKjMolAngstrom.negative.x)
      .toBeCloseTo(0.5 * excluded.forceCorrectionByAtomIdKjMolAngstrom.negative.x, 11);
  });

  it('makes direct Ewald plus TIP3P intramolecular corrections agree with central energy differences', () => {
    const cell = triclinicCell();
    const atoms = tip3pAtoms();
    const exceptions = allTip3pExclusions(cell, atoms);
    const ewald = evaluateDirectPeriodicEwald(cell, atoms, ewaldOptions());
    const correction = evaluatePeriodicCoulombExceptionCorrections(
      cell,
      atoms,
      exceptions,
      DEFAULT_PERIODIC_COULOMB_EXCEPTION_OPTIONS_V042,
    );
    const stepAngstrom = 1e-4;
    let maximumError = 0;

    for (let atomIndex = 0; atomIndex < atoms.length; atomIndex += 1) {
      for (const axis of ['x', 'y', 'z'] as const) {
        const cartesianStep = {
          x: axis === 'x' ? stepAngstrom : 0,
          y: axis === 'y' ? stepAngstrom : 0,
          z: axis === 'z' ? stepAngstrom : 0,
        };
        const fractionalStep = cell.cartesianVectorToFractional(cartesianStep);
        const plus = displace(atoms, atomIndex, fractionalStep, 1);
        const minus = displace(atoms, atomIndex, fractionalStep, -1);
        const finiteDifferenceForce = -(combinedEnergy(cell, plus, exceptions)
          - combinedEnergy(cell, minus, exceptions)) / (2 * stepAngstrom);
        const analytical = ewald.forceByAtomIdKjMolAngstrom[atoms[atomIndex].id][axis]
          + correction.forceCorrectionByAtomIdKjMolAngstrom[atoms[atomIndex].id][axis];
        maximumError = Math.max(maximumError, Math.abs(finiteDifferenceForce - analytical));
      }
    }

    expect(maximumError).toBeLessThan(5e-8);
    expect(magnitude(add(
      ewald.netForceKjMolAngstrom,
      correction.netForceCorrectionKjMolAngstrom,
    ))).toBeLessThan(1e-12);
    expect(correction.interactions).toHaveLength(3);
  });

  it('is deterministic under atom, exception endpoint and huge image gauges and ignores cell origin', () => {
    const cell = triclinicCell();
    const atoms = tip3pAtoms();
    const exceptions = allTip3pExclusions(cell, atoms);
    const reference = evaluatePeriodicCoulombExceptionCorrections(
      cell,
      atoms,
      exceptions,
      DEFAULT_PERIODIC_COULOMB_EXCEPTION_OPTIONS_V042,
    );
    const reversedExceptions = [...exceptions].reverse().map((candidate) => ({
      ...candidate,
      atomAId: candidate.atomBId,
      atomBId: candidate.atomAId,
      imageShiftForB: negate(candidate.imageShiftForB),
    }));
    const permuted = evaluatePeriodicCoulombExceptionCorrections(
      cell,
      [...atoms].reverse(),
      reversedExceptions,
      DEFAULT_PERIODIC_COULOMB_EXCEPTION_OPTIONS_V042,
    );
    expect(permuted).toEqual(reference);

    const gauge = { x: 1_000_000_000, y: -1_000_000_000, z: 1_000_000_000 };
    const gauged = evaluatePeriodicCoulombExceptionCorrections(
      cell,
      atoms.map((candidate) => ({
        ...candidate,
        position: {
          wrappedFractional: { ...candidate.position.wrappedFractional },
          image: gauge,
        },
      })),
      exceptions,
      DEFAULT_PERIODIC_COULOMB_EXCEPTION_OPTIONS_V042,
    );
    expect(gauged).toEqual(reference);

    const shiftedOrigin = evaluatePeriodicCoulombExceptionCorrections(
      triclinicCell({ x: 900_000_000, y: -800_000_000, z: 700_000_000 }),
      atoms,
      exceptions,
      DEFAULT_PERIODIC_COULOMB_EXCEPTION_OPTIONS_V042,
    );
    expect(shiftedOrigin).toEqual(reference);
  });

  it('accepts the validated large lift of a skew cell and rejects ambiguous boundary pairs', () => {
    const skewCell = new PeriodicCell([
      { x: 10, y: 0, z: 0 },
      { x: 99, y: 1, z: 0 },
      { x: 0, y: 0, z: 10 },
    ]);
    const skewAtoms = [
      atom('a', 1, { x: 0, y: 0, z: 0 }),
      atom('b', -1, { x: 0, y: 0.303, z: 0 }),
    ];
    const largeLift = exception(skewCell, skewAtoms, 'large-lift', 'a', 'b', 0);
    expect(Math.abs(largeLift.imageShiftForB.x)).toBeGreaterThan(2);
    expect(() => evaluatePeriodicCoulombExceptionCorrections(
      skewCell,
      skewAtoms,
      [largeLift],
      DEFAULT_PERIODIC_COULOMB_EXCEPTION_OPTIONS_V042,
    )).not.toThrow();

    const boundaryCell = cubicCell();
    const boundaryAtoms = [
      atom('a', 1, { x: 0, y: 0, z: 0 }),
      atom('b', -1, { x: 0.5, y: 0, z: 0 }),
    ];
    expect(() => evaluatePeriodicCoulombExceptionCorrections(
      boundaryCell,
      boundaryAtoms,
      [exception(boundaryCell, boundaryAtoms, 'ambiguous', 'a', 'b', 0)],
      DEFAULT_PERIODIC_COULOMB_EXCEPTION_OPTIONS_V042,
    )).toThrow(/strictly inside the unique minimum-image radius/);
  });

  it('binds exception work, returns deeply frozen evidence and keeps scale one as an explicit zero correction', () => {
    const cell = cubicCell();
    const atoms = [
      atom('a', 1, { x: 0.1, y: 0.2, z: 0.3 }),
      atom('b', -1, { x: 0.4, y: 0.2, z: 0.3 }),
    ];
    const result = evaluatePeriodicCoulombExceptionCorrections(
      cell,
      atoms,
      [exception(cell, atoms, 'unchanged', 'a', 'b', 1)],
      DEFAULT_PERIODIC_COULOMB_EXCEPTION_OPTIONS_V042,
    );
    expect(result.energyCorrectionKjMol).toBe(0);
    expect(result.forceCorrectionByAtomIdKjMolAngstrom).toEqual({
      a: { x: 0, y: 0, z: 0 },
      b: { x: 0, y: 0, z: 0 },
    });
    expect(result.workUnitsConsumed).toBe(1);
    expect(result.boundaries.join('\n')).toMatch(/not the reciprocal-space virial/);
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.interactions[0].virialCorrectionKjMol)).toBe(true);

    const empty = evaluatePeriodicCoulombExceptionCorrections(
      cell,
      atoms,
      [],
      DEFAULT_PERIODIC_COULOMB_EXCEPTION_OPTIONS_V042,
    );
    expect(empty.energyCorrectionKjMol).toBe(0);
    expect(empty.interactions).toEqual([]);
    expect(empty.workUnitsConsumed).toBe(0);
  });

  it('fails closed on wrong images, duplicate pairs, invalid scales, overlap, dielectric drift and budgets', () => {
    const cell = cubicCell();
    const atoms = [
      atom('a', 1, { x: 0.1, y: 0.2, z: 0.3 }),
      atom('b', -1, { x: 0.9, y: 0.2, z: 0.3 }),
      atom('c', 0, { x: 0.5, y: 0.6, z: 0.7 }),
    ];
    const valid = exception(cell, atoms, 'ab', 'a', 'b', 0);
    const dielectricOptions = {
      ...DEFAULT_PERIODIC_COULOMB_EXCEPTION_OPTIONS_V042,
      relativePermittivity: 78.3,
    } as unknown as PeriodicCoulombExceptionOptionsV042;
    expect(() => evaluatePeriodicCoulombExceptionCorrections(
      cell,
      atoms,
      [{ ...valid, imageShiftForB: { x: 0, y: 0, z: 0 } }],
      DEFAULT_PERIODIC_COULOMB_EXCEPTION_OPTIONS_V042,
    )).toThrow(/not the locked deterministic minimum-image lift/);
    expect(() => evaluatePeriodicCoulombExceptionCorrections(
      cell,
      atoms,
      [valid, { ...valid, id: 'duplicate' }],
      DEFAULT_PERIODIC_COULOMB_EXCEPTION_OPTIONS_V042,
    )).toThrow(/duplicate Coulomb exception atom pair/);
    expect(() => evaluatePeriodicCoulombExceptionCorrections(
      cell,
      atoms,
      [{ ...valid, coulombScale: 1.1 }],
      DEFAULT_PERIODIC_COULOMB_EXCEPTION_OPTIONS_V042,
    )).toThrow(/scale must be finite and in \[0, 1\]/);
    expect(() => evaluatePeriodicCoulombExceptionCorrections(
      cell,
      [atoms[0], { ...atoms[1], position: atoms[0].position }],
      [{ ...valid, imageShiftForB: { x: 0, y: 0, z: 0 } }],
      DEFAULT_PERIODIC_COULOMB_EXCEPTION_OPTIONS_V042,
    )).toThrow(/overlapping/);
    expect(() => evaluatePeriodicCoulombExceptionCorrections(
      cell,
      atoms,
      [valid],
      dielectricOptions,
    )).toThrow(/relativePermittivity is locked to 1/);
    expect(() => evaluatePeriodicCoulombExceptionCorrections(
      cell,
      [atoms[0], { ...atoms[1], chargeE: -0.9 }, atoms[2]],
      [valid],
      DEFAULT_PERIODIC_COULOMB_EXCEPTION_OPTIONS_V042,
    )).toThrow(/same neutral atom set/);
    expect(() => evaluatePeriodicCoulombExceptionCorrections(
      cell,
      atoms,
      [valid, exception(cell, atoms, 'ac', 'a', 'c', 0)],
      { ...DEFAULT_PERIODIC_COULOMB_EXCEPTION_OPTIONS_V042, maximumExceptions: 1 },
    )).toThrow(/exception count must be in \[0, 1\]/);
    expect(() => evaluatePeriodicCoulombExceptionCorrections(
      cell,
      atoms,
      [valid],
      {
        ...DEFAULT_PERIODIC_COULOMB_EXCEPTION_OPTIONS_V042,
        extraPhysicalKnob: 7,
      } as unknown as PeriodicCoulombExceptionOptionsV042,
    )).toThrow(/exactly the locked keys/);
  });
});

function tip3pAtoms(): PeriodicCoulombExceptionAtomV042[] {
  return [
    atom('tip3p-o', -0.834, { x: 0.97, y: 0.93, z: 0.45 }),
    atom('tip3p-h1', 0.417, { x: 0.055, y: 0.93, z: 0.45 }),
    atom('tip3p-h2', 0.417, { x: 0.945, y: 0.015, z: 0.45 }),
  ];
}

function allTip3pExclusions(
  cell: PeriodicCell,
  atoms: ReadonlyArray<PeriodicCoulombExceptionAtomV042>,
) {
  return [
    exception(cell, atoms, 'tip3p-oh1', 'tip3p-o', 'tip3p-h1', 0),
    exception(cell, atoms, 'tip3p-oh2', 'tip3p-o', 'tip3p-h2', 0),
    exception(cell, atoms, 'tip3p-hh', 'tip3p-h1', 'tip3p-h2', 0),
  ];
}

function exception(
  cell: PeriodicCell,
  atoms: ReadonlyArray<PeriodicCoulombExceptionAtomV042>,
  id: string,
  atomAId: string,
  atomBId: string,
  coulombScale: number,
): PeriodicCoulombExceptionV042 {
  const atomA = atoms.find((candidate) => candidate.id === atomAId)!;
  const atomB = atoms.find((candidate) => candidate.id === atomBId)!;
  return {
    id,
    atomAId,
    atomBId,
    coulombScale,
    imageShiftForB: cell.minimumImageFromFractional(
      atomA.position.wrappedFractional,
      atomB.position.wrappedFractional,
    ).imageShiftForTarget,
  };
}

function combinedEnergy(
  cell: PeriodicCell,
  atoms: ReadonlyArray<PeriodicCoulombExceptionAtomV042>,
  exceptions: ReadonlyArray<PeriodicCoulombExceptionV042>,
) {
  return evaluateDirectPeriodicEwald(cell, atoms as ReadonlyArray<DirectEwaldAtomV042>, ewaldOptions())
    .energyKjMol.total
    + evaluatePeriodicCoulombExceptionCorrections(
      cell,
      atoms,
      exceptions,
      DEFAULT_PERIODIC_COULOMB_EXCEPTION_OPTIONS_V042,
    ).energyCorrectionKjMol;
}

function displace(
  atoms: ReadonlyArray<PeriodicCoulombExceptionAtomV042>,
  atomIndex: number,
  fractionalStep: Vector3,
  direction: number,
) {
  return atoms.map((candidate, index) => index === atomIndex
    ? {
      ...candidate,
      position: wrap(add(
        candidate.position.wrappedFractional,
        scale(fractionalStep, direction),
      )),
    }
    : candidate);
}

function wrap(fractional: Vector3): WrappedPeriodicPosition {
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

function negate(value: Int3): Int3 { return { x: -value.x, y: -value.y, z: -value.z }; }
function add(left: Vector3, right: Vector3): Vector3 { return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z }; }
function scale(vector: Vector3, factor: number): Vector3 { return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor }; }
function magnitude(vector: Vector3) { return Math.hypot(vector.x, vector.y, vector.z); }
