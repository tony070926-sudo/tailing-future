import { describe, expect, it } from 'vitest';
import type { Vector3 } from '../molecular/molecular-interactions.ts';
import { PeriodicCell } from './periodic-cell.ts';
import {
  applyRattleVelocityConstraints,
  applyShakePositionConstraints,
  applyShakeRattleConstraints,
  MAXIMUM_RIGID_CONSTRAINT_ATOMS,
  MAXIMUM_RIGID_CONSTRAINT_ITERATIONS,
  MAXIMUM_RIGID_DISTANCE_CONSTRAINTS,
  type RigidConstraintAtom,
  type RigidDistanceConstraint,
} from './rigid-constraints.ts';

const WATER_ANGLE_RADIANS = 104 * Math.PI / 180;
const WATER_OH_DISTANCE = 1;
const WATER_HH_DISTANCE = Math.sqrt(2 - 2 * Math.cos(WATER_ANGLE_RADIANS));

function orthorhombicCell(edge = 20) {
  return new PeriodicCell([
    { x: edge, y: 0, z: 0 },
    { x: 0, y: edge, z: 0 },
    { x: 0, y: 0, z: edge },
  ]);
}

function atom(
  cell: PeriodicCell,
  id: string,
  massDalton: number,
  cartesian: Vector3,
  velocity: Vector3 = { x: 0, y: 0, z: 0 },
): RigidConstraintAtom {
  return {
    id,
    massDalton,
    position: cell.wrapCartesian(cartesian),
    velocityAngstromPerPicosecond: velocity,
  };
}

function water(
  cell: PeriodicCell,
  prefix: string,
  origin: Vector3,
  perturbation = 0,
): { atoms: RigidConstraintAtom[]; constraints: RigidDistanceConstraint[] } {
  const idealH1 = add(origin, { x: 1, y: 0, z: 0 });
  const idealH2 = add(origin, { x: Math.cos(WATER_ANGLE_RADIANS), y: Math.sin(WATER_ANGLE_RADIANS), z: 0 });
  return {
    atoms: [
      atom(cell, `${prefix}-O`, 16, add(origin, { x: -0.2 * perturbation, y: 0.1 * perturbation, z: 0.05 * perturbation })),
      atom(cell, `${prefix}-H1`, 1, add(idealH1, { x: 0.5 * perturbation, y: -0.25 * perturbation, z: 0.1 * perturbation })),
      atom(cell, `${prefix}-H2`, 1, add(idealH2, { x: -0.3 * perturbation, y: 0.4 * perturbation, z: -0.15 * perturbation })),
    ],
    constraints: [
      { id: `${prefix}-oh1`, atomAId: `${prefix}-O`, atomBId: `${prefix}-H1`, distanceAngstrom: WATER_OH_DISTANCE },
      { id: `${prefix}-oh2`, atomAId: `${prefix}-O`, atomBId: `${prefix}-H2`, distanceAngstrom: WATER_OH_DISTANCE },
      { id: `${prefix}-hh`, atomAId: `${prefix}-H1`, atomBId: `${prefix}-H2`, distanceAngstrom: WATER_HH_DISTANCE },
    ],
  };
}

function distance(cell: PeriodicCell, atoms: ReadonlyArray<RigidConstraintAtom>, constraint: RigidDistanceConstraint) {
  const atomA = atoms.find((candidate) => candidate.id === constraint.atomAId)!;
  const atomB = atoms.find((candidate) => candidate.id === constraint.atomBId)!;
  return cell.minimumImageFromFractional(
    atomA.position.wrappedFractional,
    atomB.position.wrappedFractional,
  ).distanceAngstrom;
}

function derivative(cell: PeriodicCell, atoms: ReadonlyArray<RigidConstraintAtom>, constraint: RigidDistanceConstraint) {
  const atomA = atoms.find((candidate) => candidate.id === constraint.atomAId)!;
  const atomB = atoms.find((candidate) => candidate.id === constraint.atomBId)!;
  const displacement = cell.minimumImageFromFractional(
    atomA.position.wrappedFractional,
    atomB.position.wrappedFractional,
  ).displacementAngstrom;
  return dot(displacement, subtract(
    atomB.velocityAngstromPerPicosecond,
    atomA.velocityAngstromPerPicosecond,
  ));
}

function momentum(atoms: ReadonlyArray<RigidConstraintAtom>) {
  return atoms.reduce(
    (sum, candidate) => add(sum, scale(candidate.velocityAngstromPerPicosecond, candidate.massDalton)),
    { x: 0, y: 0, z: 0 },
  );
}

describe('mass-weighted periodic SHAKE/RATTLE constraints', () => {
  it('converges a generic rigid three-site water geometry without embedding a water potential', () => {
    const cell = orthorhombicCell();
    const fixture = water(cell, 'w1', { x: 6, y: 7, z: 8 }, 0.12);
    const result = applyShakePositionConstraints(cell, fixture.atoms, fixture.constraints, {
      positionToleranceAngstrom: 1e-12,
      maximumIterations: 2_000,
    });

    expect(result.iterations).toBeGreaterThan(0);
    expect(result.maximumPositionResidualAngstrom).toBeLessThanOrEqual(1e-12);
    expect(result.maximumCenterOfMassPositionChangeAngstrom).toBeLessThanOrEqual(1e-10);
    for (const constraint of fixture.constraints) {
      expect(distance(cell, result.atoms, constraint)).toBeCloseTo(constraint.distanceAngstrom, 11);
    }
    expect(result.constraintOrder).toEqual(['w1-hh', 'w1-oh1', 'w1-oh2']);
    expect(Object.isFrozen(result.atoms)).toBe(true);
  });

  it('uses inverse-mass weighting and does not move a heavy site like a light site', () => {
    const cell = orthorhombicCell();
    const atoms = [
      atom(cell, 'heavy', 16, { x: 4, y: 4, z: 4 }),
      atom(cell, 'light', 1, { x: 5.2, y: 4, z: 4 }),
    ];
    const constraints = [{ id: 'bond', atomAId: 'heavy', atomBId: 'light', distanceAngstrom: 1 }];
    const result = applyShakePositionConstraints(cell, atoms, constraints, { positionToleranceAngstrom: 1e-13 });
    const heavyX = cell.unwrappedCartesian(result.atoms[0].position).x;
    const lightX = cell.unwrappedCartesian(result.atoms[1].position).x;

    expect(heavyX - 4).toBeCloseTo(0.2 / 17, 13);
    expect(5.2 - lightX).toBeCloseTo(3.2 / 17, 13);
    expect((5.2 - lightX) / (heavyX - 4)).toBeCloseTo(16, 10);
  });

  it('converges multiple independent rigid molecules in one deterministic solve', () => {
    const cell = orthorhombicCell(30);
    const first = water(cell, 'a', { x: 5, y: 6, z: 7 }, 0.09);
    const second = water(cell, 'b', { x: 20, y: 18, z: 16 }, -0.11);
    const constraints = [...second.constraints.reverse(), ...first.constraints.reverse()];
    const result = applyShakePositionConstraints(cell, [...first.atoms, ...second.atoms], constraints, {
      positionToleranceAngstrom: 1e-12,
    });

    expect(result.constraintOrder).toEqual(['a-hh', 'a-oh1', 'a-oh2', 'b-hh', 'b-oh1', 'b-oh2']);
    for (const constraint of [...first.constraints, ...second.constraints]) {
      expect(Math.abs(distance(cell, result.atoms, constraint) - constraint.distanceAngstrom)).toBeLessThanOrEqual(1e-12);
    }
  });

  it('keeps a rigid water connected across a periodic face', () => {
    const cell = orthorhombicCell(10);
    const fixture = water(cell, 'face', { x: 9.72, y: 4.8, z: 5.1 }, 0.08);
    const result = applyShakePositionConstraints(cell, fixture.atoms, fixture.constraints, {
      positionToleranceAngstrom: 1e-12,
    });

    expect(result.atoms.some((candidate) => candidate.position.image.x !== 0)).toBe(true);
    for (const constraint of fixture.constraints) {
      expect(Math.abs(distance(cell, result.atoms, constraint) - constraint.distanceAngstrom)).toBeLessThanOrEqual(1e-12);
    }
  });

  it('rejects a triclinic periodic ring whose independently shortest edges imply inconsistent lifts', () => {
    const cell = new PeriodicCell([
      { x: 10, y: 0, z: 0 },
      { x: 2, y: 9, z: 0 },
      { x: 1, y: 1, z: 8 },
    ]);
    const atoms = [
      atom(cell, 'ring-a', 1, cell.fractionalToCartesian({ x: 0.1, y: 0.2, z: 0.2 })),
      atom(cell, 'ring-b', 1, cell.fractionalToCartesian({ x: 0.4, y: 0.2, z: 0.2 })),
      atom(cell, 'ring-c', 1, cell.fractionalToCartesian({ x: 0.8, y: 0.2, z: 0.2 })),
    ];
    const constraints = [
      { id: 'ring-ab', atomAId: 'ring-a', atomBId: 'ring-b', distanceAngstrom: 1 },
      { id: 'ring-bc', atomAId: 'ring-b', atomBId: 'ring-c', distanceAngstrom: 1 },
      { id: 'ring-ca', atomAId: 'ring-c', atomBId: 'ring-a', distanceAngstrom: 1 },
    ];

    expect(() => applyShakePositionConstraints(cell, atoms, constraints))
      .toThrow(/inconsistent periodic image loop/);
    expect(() => applyRattleVelocityConstraints(cell, atoms, constraints))
      .toThrow(/inconsistent periodic image loop/);
  });

  it('converges a face-crossing three-site water in a strongly sheared triclinic cell', () => {
    const cell = new PeriodicCell([
      { x: 10, y: 0, z: 0 },
      { x: 8.7, y: 4.9, z: 0 },
      { x: 4.5, y: 2.1, z: 7.2 },
    ]);
    const origin = cell.fractionalToCartesian({ x: 0.97, y: 0.93, z: 0.45 });
    const fixture = water(cell, 'shear', origin, 0.06);
    const initialImages = new Set(fixture.atoms.map((candidate) => JSON.stringify(candidate.position.image)));
    const result = applyShakePositionConstraints(cell, fixture.atoms, fixture.constraints, {
      positionToleranceAngstrom: 1e-12,
    });

    expect(initialImages.size).toBeGreaterThan(1);
    expect(result.maximumCenterOfMassPositionChangeAngstrom).toBeLessThanOrEqual(1e-10);
    for (const constraint of fixture.constraints) {
      expect(Math.abs(distance(cell, result.atoms, constraint) - constraint.distanceAngstrom)).toBeLessThanOrEqual(1e-12);
    }
  });

  it('enforces velocity-derivative constraints while preserving COM momentum', () => {
    const cell = orthorhombicCell();
    const fixture = water(cell, 'v', { x: 8, y: 8, z: 8 });
    fixture.atoms[0] = { ...fixture.atoms[0], velocityAngstromPerPicosecond: { x: 0.3, y: -0.2, z: 0.1 } };
    fixture.atoms[1] = { ...fixture.atoms[1], velocityAngstromPerPicosecond: { x: 1.1, y: 0.4, z: -0.3 } };
    fixture.atoms[2] = { ...fixture.atoms[2], velocityAngstromPerPicosecond: { x: -0.7, y: 0.9, z: 0.2 } };
    const initialMomentum = momentum(fixture.atoms);
    const result = applyRattleVelocityConstraints(cell, fixture.atoms, fixture.constraints, {
      velocityDerivativeToleranceAngstrom2PerPicosecond: 1e-12,
      momentumToleranceDaltonAngstromPerPicosecond: 1e-11,
    });

    expect(result.iterations).toBeGreaterThan(0);
    for (const constraint of fixture.constraints) expect(Math.abs(derivative(cell, result.atoms, constraint))).toBeLessThanOrEqual(1e-12);
    expectVectorClose(momentum(result.atoms), initialMomentum, 12);
    expect(result.centerOfMassMomentumChangeDaltonAngstromPerPicosecond).toBeLessThanOrEqual(1e-11);
  });

  it('is covariant under rigid translation and rotation', () => {
    const cell = orthorhombicCell(40);
    const base = water(cell, 'rigid', { x: 10, y: 10, z: 10 }, 0.13);
    const rotatedAtoms = base.atoms.map((candidate) => {
      const relative = subtract(cell.unwrappedCartesian(candidate.position), { x: 10, y: 10, z: 10 });
      return atom(cell, candidate.id, candidate.massDalton, add(rotateZ(relative, 0.73), { x: 27, y: 21, z: 17 }));
    });
    const baseResult = applyShakePositionConstraints(cell, base.atoms, base.constraints, { positionToleranceAngstrom: 1e-12 });
    const transformedResult = applyShakePositionConstraints(cell, rotatedAtoms, base.constraints, { positionToleranceAngstrom: 1e-12 });

    for (const constraint of base.constraints) {
      expect(distance(cell, baseResult.atoms, constraint)).toBeCloseTo(distance(cell, transformedResult.atoms, constraint), 11);
    }
    expect(baseResult.iterations).toBe(transformedResult.iterations);
  });

  it('returns bitwise-repeatable results for shuffled input constraints', () => {
    const cell = orthorhombicCell();
    const fixture = water(cell, 'd', { x: 6, y: 6, z: 6 }, 0.1);
    const first = applyShakeRattleConstraints(cell, fixture.atoms, fixture.constraints, {
      positionToleranceAngstrom: 1e-12,
      velocityDerivativeToleranceAngstrom2PerPicosecond: 1e-12,
    });
    const second = applyShakeRattleConstraints(cell, fixture.atoms, [...fixture.constraints].reverse(), {
      positionToleranceAngstrom: 1e-12,
      velocityDerivativeToleranceAngstrom2PerPicosecond: 1e-12,
    });
    const reversedEndpoints = applyShakeRattleConstraints(cell, fixture.atoms, fixture.constraints.map((constraint) => ({
      ...constraint,
      atomAId: constraint.atomBId,
      atomBId: constraint.atomAId,
    })), {
      positionToleranceAngstrom: 1e-12,
      velocityDerivativeToleranceAngstrom2PerPicosecond: 1e-12,
    });

    expect(second).toEqual(first);
    expect(reversedEndpoints).toEqual(first);
  });

  it('is invariant after removing a common whole-molecule lattice-image gauge', () => {
    const cell = orthorhombicCell();
    const fixture = water(cell, 'gauge', { x: 7, y: 7, z: 7 }, 0.08);
    fixture.atoms[0] = { ...fixture.atoms[0], velocityAngstromPerPicosecond: { x: 0.2, y: -0.3, z: 0.1 } };
    fixture.atoms[1] = { ...fixture.atoms[1], velocityAngstromPerPicosecond: { x: 0.8, y: 0.4, z: -0.2 } };
    fixture.atoms[2] = { ...fixture.atoms[2], velocityAngstromPerPicosecond: { x: -0.5, y: 0.7, z: 0.3 } };
    const gauge = { x: 3, y: -2, z: 4 };
    const gaugedAtoms = fixture.atoms.map((candidate) => ({
      ...candidate,
      position: {
        ...candidate.position,
        image: {
          x: candidate.position.image.x + gauge.x,
          y: candidate.position.image.y + gauge.y,
          z: candidate.position.image.z + gauge.z,
        },
      },
    }));
    const reference = applyShakeRattleConstraints(cell, fixture.atoms, fixture.constraints, {
      positionToleranceAngstrom: 1e-12,
      velocityDerivativeToleranceAngstrom2PerPicosecond: 1e-12,
    });
    const translated = applyShakeRattleConstraints(cell, gaugedAtoms, fixture.constraints, {
      positionToleranceAngstrom: 1e-12,
      velocityDerivativeToleranceAngstrom2PerPicosecond: 1e-12,
    });

    for (let index = 0; index < reference.atoms.length; index += 1) {
      expectVectorClose(
        translated.atoms[index].position.wrappedFractional,
        reference.atoms[index].position.wrappedFractional,
        11,
      );
      expect(translated.atoms[index].position.image).toEqual({
        x: reference.atoms[index].position.image.x + gauge.x,
        y: reference.atoms[index].position.image.y + gauge.y,
        z: reference.atoms[index].position.image.z + gauge.z,
      });
      expectVectorClose(
        translated.atoms[index].velocityAngstromPerPicosecond,
        reference.atoms[index].velocityAngstromPerPicosecond,
        11,
      );
    }
    for (const constraint of fixture.constraints) {
      expect(distance(cell, translated.atoms, constraint)).toBeCloseTo(distance(cell, reference.atoms, constraint), 11);
    }
  });

  it('keeps a strongly sheared face-crossing water bitwise invariant under a huge common image gauge', () => {
    const cell = new PeriodicCell([
      { x: 10, y: 0, z: 0 },
      { x: 8.7, y: 4.9, z: 0 },
      { x: 4.5, y: 2.1, z: 7.2 },
    ]);
    const origin = cell.fractionalToCartesian({ x: 0.97, y: 0.93, z: 0.45 });
    const fixture = water(cell, 'huge-gauge', origin, 0.06);
    fixture.atoms[0] = { ...fixture.atoms[0], velocityAngstromPerPicosecond: { x: 0.2, y: -0.3, z: 0.1 } };
    fixture.atoms[1] = { ...fixture.atoms[1], velocityAngstromPerPicosecond: { x: 0.8, y: 0.4, z: -0.2 } };
    fixture.atoms[2] = { ...fixture.atoms[2], velocityAngstromPerPicosecond: { x: -0.5, y: 0.7, z: 0.3 } };
    const gauge = { x: 100_000_000, y: -100_000_000, z: 100_000_000 };
    const gaugedAtoms = fixture.atoms.map((candidate) => ({
      ...candidate,
      position: {
        wrappedFractional: { ...candidate.position.wrappedFractional },
        image: addImage(candidate.position.image, gauge),
      },
    }));
    const settings = {
      positionToleranceAngstrom: 1e-12,
      velocityDerivativeToleranceAngstrom2PerPicosecond: 1e-12,
      maximumIterations: 2_000,
    };
    const reference = applyShakeRattleConstraints(cell, fixture.atoms, fixture.constraints, settings);
    const gauged = applyShakeRattleConstraints(cell, gaugedAtoms, fixture.constraints, settings);

    expect(gauged.shakeIterations).toBe(reference.shakeIterations);
    expect(gauged.rattleIterations).toBe(reference.rattleIterations);
    expect(gauged.maximumPositionResidualAngstrom).toBe(reference.maximumPositionResidualAngstrom);
    expect(gauged.maximumVelocityDerivativeResidualAngstrom2PerPicosecond)
      .toBe(reference.maximumVelocityDerivativeResidualAngstrom2PerPicosecond);
    for (let index = 0; index < reference.atoms.length; index += 1) {
      expect(gauged.atoms[index].position.wrappedFractional)
        .toEqual(reference.atoms[index].position.wrappedFractional);
      expect(gauged.atoms[index].velocityAngstromPerPicosecond)
        .toEqual(reference.atoms[index].velocityAngstromPerPicosecond);
      expect(gauged.atoms[index].position.image)
        .toEqual(addImage(reference.atoms[index].position.image, gauge));
    }
  });

  it('rejects atom, constraint, iteration and aggregate work-unit bounds before projection', () => {
    const cell = orthorhombicCell();
    const atoms = [
      atom(cell, 'bound-a', 1, { x: 4, y: 4, z: 4 }),
      atom(cell, 'bound-b', 1, { x: 5, y: 4, z: 4 }),
    ];
    const constraint = { id: 'bound-ab', atomAId: 'bound-a', atomBId: 'bound-b', distanceAngstrom: 1 };

    expect(() => applyShakePositionConstraints(
      cell,
      new Array<RigidConstraintAtom>(MAXIMUM_RIGID_CONSTRAINT_ATOMS + 1),
      [constraint],
    )).toThrow(/atom count exceeds/);
    expect(() => applyShakePositionConstraints(
      cell,
      atoms,
      new Array<RigidDistanceConstraint>(MAXIMUM_RIGID_DISTANCE_CONSTRAINTS + 1),
    )).toThrow(/constraint count exceeds/);
    expect(() => applyShakePositionConstraints(cell, atoms, [constraint], {
      maximumIterations: MAXIMUM_RIGID_CONSTRAINT_ITERATIONS + 1,
    })).toThrow(/maximumIterations/);
    expect(() => applyShakePositionConstraints(
      cell,
      new Array<RigidConstraintAtom>(6).fill(atoms[0]),
      new Array<RigidDistanceConstraint>(5).fill(constraint),
      { maximumIterations: MAXIMUM_RIGID_CONSTRAINT_ITERATIONS },
    )).toThrow(/work units/);
    const combined = water(cell, 'work-combined', { x: 8, y: 8, z: 8 });
    expect(() => applyShakeRattleConstraints(cell, combined.atoms, combined.constraints, {
      maximumIterations: MAXIMUM_RIGID_CONSTRAINT_ITERATIONS,
    })).toThrow(/work units/);
  });

  it('rejects singular inputs and fails closed when constraints cannot converge', () => {
    const cell = orthorhombicCell();
    const goodAtoms = [
      atom(cell, 'a', 1, { x: 4, y: 4, z: 4 }),
      atom(cell, 'b', 1, { x: 5, y: 4, z: 4 }),
      atom(cell, 'c', 1, { x: 4, y: 5, z: 4 }),
    ];
    expect(() => applyShakePositionConstraints(cell, [{ ...goodAtoms[0], massDalton: 0 }, goodAtoms[1]], [
      { id: 'ab', atomAId: 'a', atomBId: 'b', distanceAngstrom: 1 },
    ])).toThrow(/mass and inverse mass must be finite and positive/);
    expect(() => applyShakePositionConstraints(cell, [goodAtoms[0], atom(cell, 'b', 1, { x: 4, y: 4, z: 4 })], [
      { id: 'ab', atomAId: 'a', atomBId: 'b', distanceAngstrom: 1 },
    ])).toThrow(/coincident/);
    expect(() => applyShakePositionConstraints(cell, goodAtoms, [
      { id: 'ab1', atomAId: 'a', atomBId: 'b', distanceAngstrom: 1 },
      { id: 'ab2', atomAId: 'b', atomBId: 'a', distanceAngstrom: 1 },
    ])).toThrow(/duplicate rigid atom pair/);
    expect(() => applyRattleVelocityConstraints(cell, goodAtoms, [
      { id: 'bc', atomAId: 'b', atomBId: 'c', distanceAngstrom: 1 },
    ], { positionToleranceAngstrom: 1e-12 })).toThrow(/requires SHAKE-converged positions/);
    expect(() => applyShakePositionConstraints(cell, goodAtoms, [
      { id: 'ab', atomAId: 'a', atomBId: 'b', distanceAngstrom: 1 },
      { id: 'ac', atomAId: 'a', atomBId: 'c', distanceAngstrom: 1 },
      { id: 'bc', atomAId: 'b', atomBId: 'c', distanceAngstrom: 3 },
    ], {
      positionToleranceAngstrom: 1e-14,
      maximumIterations: 8,
    })).toThrow(/did not converge/);
  });
});

function expectVectorClose(actual: Vector3, expected: Vector3, digits: number) {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
  expect(actual.z).toBeCloseTo(expected.z, digits);
}

function rotateZ(vector: Vector3, radians: number): Vector3 {
  const cosine = Math.cos(radians);
  const sine = Math.sin(radians);
  return {
    x: cosine * vector.x - sine * vector.y,
    y: sine * vector.x + cosine * vector.y,
    z: vector.z,
  };
}

function add(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function subtract(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function scale(vector: Vector3, scalar: number): Vector3 {
  return { x: vector.x * scalar, y: vector.y * scalar, z: vector.z * scalar };
}

function dot(left: Vector3, right: Vector3) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function addImage(
  left: Readonly<{ x: number; y: number; z: number }>,
  right: Readonly<{ x: number; y: number; z: number }>,
) {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}
