import { describe, expect, it } from 'vitest';
import type { Vector3 } from '../molecular/molecular-interactions.ts';
import { AMBER14_TIP3P_PARAMETERS_V042 } from './amber14-tip3p-parameters.ts';
import {
  stepConstrainedVelocityVerlet,
  type ConstrainedForceCallback,
  type ConstrainedForceContext,
} from './constrained-velocity-verlet.ts';
import { PeriodicCell, type Int3 } from './periodic-cell.ts';
import type { RigidConstraintAtom, RigidDistanceConstraint } from './rigid-constraints.ts';

const OH_ANGSTROM = AMBER14_TIP3P_PARAMETERS_V042.rigidWaterGeometry
  .oxygenHydrogenDistanceAngstrom;
const HOH_RADIANS = AMBER14_TIP3P_PARAMETERS_V042.rigidWaterGeometry
  .hydrogenOxygenHydrogenAngleRadian;
const HH_ANGSTROM = AMBER14_TIP3P_PARAMETERS_V042.rigidWaterGeometry
  .hydrogenHydrogenDistanceAngstrom;
const ZERO: Vector3 = Object.freeze({ x: 0, y: 0, z: 0 });

function orthorhombicCell(edge = 30, origin: Vector3 = ZERO) {
  return new PeriodicCell([
    { x: edge, y: 0, z: 0 },
    { x: 0, y: edge, z: 0 },
    { x: 0, y: 0, z: edge },
  ], origin);
}

function triclinicCell(origin: Vector3 = ZERO) {
  return new PeriodicCell([
    { x: 10, y: 0, z: 0 },
    { x: 2.7, y: 8.8, z: 0 },
    { x: 1.3, y: 1.9, z: 8.1 },
  ], origin);
}

function atom(
  cell: PeriodicCell,
  id: string,
  massDalton: number,
  cartesianAngstrom: Vector3,
  velocityAngstromPerPicosecond: Vector3 = ZERO,
): RigidConstraintAtom {
  return {
    id,
    massDalton,
    position: cell.wrapCartesian(cartesianAngstrom),
    velocityAngstromPerPicosecond,
  };
}

function localUnwrapped(cell: PeriodicCell, candidate: RigidConstraintAtom | ConstrainedForceContext['atoms'][number]) {
  return cell.latticeVector({
    x: candidate.position.wrappedFractional.x + candidate.position.image.x,
    y: candidate.position.wrappedFractional.y + candidate.position.image.y,
    z: candidate.position.wrappedFractional.z + candidate.position.image.z,
  });
}

function zeroForces(workUnitsConsumed = 1): ConstrainedForceCallback {
  return ({ atoms }) => ({
    forceByAtomIdKjMolAngstrom: Object.fromEntries(atoms.map((candidate) => [candidate.id, ZERO])),
    potentialEnergyComponentsKjMol: { zero: 0 },
    workUnitsConsumed,
  });
}

function harmonicForces(cell: PeriodicCell, springKjMolAngstrom2: number): ConstrainedForceCallback {
  return ({ atoms }) => {
    const forceByAtomIdKjMolAngstrom: Record<string, Vector3> = {};
    let harmonic = 0;
    for (const candidate of atoms) {
      const position = localUnwrapped(cell, candidate);
      forceByAtomIdKjMolAngstrom[candidate.id] = {
        x: -springKjMolAngstrom2 * position.x,
        y: 0,
        z: 0,
      };
      harmonic += 0.5 * springKjMolAngstrom2 * position.x * position.x;
    }
    return {
      forceByAtomIdKjMolAngstrom,
      potentialEnergyComponentsKjMol: { harmonic },
      workUnitsConsumed: atoms.length * 3,
    };
  };
}

function rigidWater(
  cell: PeriodicCell,
  oxygenCartesian: Vector3,
  translation: Vector3 = ZERO,
  angularVelocityPerPicosecond: Vector3 = ZERO,
) {
  const localPositions = [
    { id: 'water-O', mass: 15.99943, offset: { x: 0, y: 0, z: 0 } },
    { id: 'water-H1', mass: 1.007947, offset: { x: OH_ANGSTROM, y: 0, z: 0 } },
    {
      id: 'water-H2',
      mass: 1.007947,
      offset: {
        x: OH_ANGSTROM * Math.cos(HOH_RADIANS),
        y: OH_ANGSTROM * Math.sin(HOH_RADIANS),
        z: 0,
      },
    },
  ];
  const totalMass = localPositions.reduce((sum, site) => sum + site.mass, 0);
  const centerOfMassOffset = scale(
    localPositions.reduce((sum, site) => add(sum, scale(site.offset, site.mass)), ZERO),
    1 / totalMass,
  );
  const atoms = localPositions.map((site) => atom(
    cell,
    site.id,
    site.mass,
    add(oxygenCartesian, site.offset),
    add(translation, cross(angularVelocityPerPicosecond, subtract(site.offset, centerOfMassOffset))),
  ));
  const constraints: RigidDistanceConstraint[] = [
    { id: 'water-oh1', atomAId: 'water-O', atomBId: 'water-H1', distanceAngstrom: OH_ANGSTROM },
    { id: 'water-oh2', atomAId: 'water-O', atomBId: 'water-H2', distanceAngstrom: OH_ANGSTROM },
    { id: 'water-hh', atomAId: 'water-H1', atomBId: 'water-H2', distanceAngstrom: HH_ANGSTROM },
  ];
  return { atoms, constraints };
}

function verletOptions(timeStepPicoseconds: number) {
  return {
    timeStepPicoseconds,
    constraintOptions: {
      positionToleranceAngstrom: 1e-11,
      velocityDerivativeToleranceAngstrom2PerPicosecond: 1e-11,
      maximumIterations: 2_000,
      momentumToleranceDaltonAngstromPerPicosecond: 1e-9,
      centerOfMassPositionToleranceAngstrom: 1e-9,
    },
    constraintImpulseToleranceDaltonAngstromPerPicosecond: 1e-7,
  } as const;
}

function constraintDistance(
  cell: PeriodicCell,
  atoms: ReadonlyArray<RigidConstraintAtom>,
  constraint: RigidDistanceConstraint,
) {
  const left = atoms.find((candidate) => candidate.id === constraint.atomAId)!;
  const right = atoms.find((candidate) => candidate.id === constraint.atomBId)!;
  return cell.minimumImageFromFractional(
    left.position.wrappedFractional,
    right.position.wrappedFractional,
  ).distanceAngstrom;
}

function constraintDerivative(
  cell: PeriodicCell,
  atoms: ReadonlyArray<RigidConstraintAtom>,
  constraint: RigidDistanceConstraint,
) {
  const left = atoms.find((candidate) => candidate.id === constraint.atomAId)!;
  const right = atoms.find((candidate) => candidate.id === constraint.atomBId)!;
  const displacement = cell.minimumImageFromFractional(
    left.position.wrappedFractional,
    right.position.wrappedFractional,
  ).displacementAngstrom;
  return dot(displacement, subtract(
    right.velocityAngstromPerPicosecond,
    left.velocityAngstromPerPicosecond,
  ));
}

function momentum(atoms: ReadonlyArray<RigidConstraintAtom>) {
  return atoms.reduce(
    (sum, candidate) => add(sum, scale(candidate.velocityAngstromPerPicosecond, candidate.massDalton)),
    ZERO,
  );
}

describe('transactional constrained Velocity Verlet/RATTLE step', () => {
  it('matches the analytic constant-force trajectory with zero constraints', () => {
    const cell = orthorhombicCell(100);
    const mass = 2;
    const initialPosition = { x: 5, y: 6, z: 7 };
    const initialVelocity = { x: 0.3, y: -0.2, z: 0.1 };
    const force = { x: 0.2, y: -0.1, z: 0.05 };
    const timeStep = 0.004;
    const acceleration = scale(force, 100 / mass);
    const initial = [atom(cell, 'solo', mass, initialPosition, initialVelocity)];
    const callback: ConstrainedForceCallback = ({ atoms, stage }) => {
      const position = localUnwrapped(cell, atoms[0]);
      return {
        forceByAtomIdKjMolAngstrom: { solo: force },
        potentialEnergyComponentsKjMol: { constant: -dot(force, position) },
        workUnitsConsumed: stage === 'initial' ? 2 : 3,
      };
    };

    const result = stepConstrainedVelocityVerlet(cell, initial, [], callback, {
      timeStepPicoseconds: timeStep,
    });
    const expectedPosition = add(
      add(initialPosition, scale(initialVelocity, timeStep)),
      scale(acceleration, 0.5 * timeStep * timeStep),
    );
    const expectedVelocity = add(initialVelocity, scale(acceleration, timeStep));

    expectVectorClose(localUnwrapped(cell, result.final.atoms[0]), expectedPosition, 12);
    expectVectorClose(result.final.atoms[0].velocityAngstromPerPicosecond, expectedVelocity, 13);
    expect(result.constraintResiduals).toMatchObject({
      initialPositionAngstrom: 0,
      initialVelocityDerivativeAngstrom2PerPicosecond: 0,
      finalPositionAngstrom: 0,
      finalVelocityDerivativeAngstrom2PerPicosecond: 0,
      shakeIterations: 0,
      rattleIterations: 0,
    });
    expect(result.degreesOfFreedom).toMatchObject({
      cartesianCoordinateCount: 3,
      constraintJacobianRank: 0,
      constrainedCartesianCoordinateCount: 3,
      rankMethod: 'analytic-no-constraints',
    });
    expect(result.final.energy.totalEnergyKjMol)
      .toBeCloseTo(result.initial.energy.totalEnergyKjMol, 13);
    expect(result.workBudget.forceEvaluationWorkUnits).toBe(5);
  });

  it('matches one harmonic KDK step, a finite-difference force, and time reversal', () => {
    const cell = orthorhombicCell(40);
    const mass = 4;
    const spring = 0.7;
    const dt = 0.003;
    const x0 = 1.2;
    const v0 = -0.4;
    const initial = [atom(cell, 'oscillator', mass, { x: x0, y: 3, z: 4 }, { x: v0, y: 0, z: 0 })];
    const callback = harmonicForces(cell, spring);
    const result = stepConstrainedVelocityVerlet(cell, initial, [], callback, { timeStepPicoseconds: dt });
    const halfVelocity = v0 + 0.5 * dt * (-100 * spring * x0 / mass);
    const expectedX = x0 + dt * halfVelocity;
    const expectedVelocity = halfVelocity + 0.5 * dt * (-100 * spring * expectedX / mass);

    expect(localUnwrapped(cell, result.final.atoms[0]).x).toBeCloseTo(expectedX, 13);
    expect(result.final.atoms[0].velocityAngstromPerPicosecond.x).toBeCloseTo(expectedVelocity, 13);
    const finiteDifferenceStep = 1e-6;
    const plus = 0.5 * spring * (x0 + finiteDifferenceStep) ** 2;
    const minus = 0.5 * spring * (x0 - finiteDifferenceStep) ** 2;
    const finiteDifferenceForce = -(plus - minus) / (2 * finiteDifferenceStep);
    expect(result.initial.forceByAtomIdKjMolAngstrom.oscillator.x)
      .toBeCloseTo(finiteDifferenceForce, 8);

    const reversed = result.final.atoms.map((candidate) => ({
      ...candidate,
      velocityAngstromPerPicosecond: scale(candidate.velocityAngstromPerPicosecond, -1),
    }));
    const reverseResult = stepConstrainedVelocityVerlet(cell, reversed, [], callback, {
      timeStepPicoseconds: dt,
    });
    expect(localUnwrapped(cell, reverseResult.final.atoms[0]).x).toBeCloseTo(x0, 12);
    expect(reverseResult.final.atoms[0].velocityAngstromPerPicosecond.x).toBeCloseTo(-v0, 12);
  });

  it('uses the q_n constraint gradient: a free rotor is reversible and has bounded non-monotone energy error', () => {
    const cell = orthorhombicCell(20);
    const constraints: RigidDistanceConstraint[] = [{
      id: 'rotor-distance',
      atomAId: 'rotor-a',
      atomBId: 'rotor-b',
      distanceAngstrom: 1,
    }];
    const initial = [
      atom(cell, 'rotor-a', 1, { x: 9.5, y: 10, z: 10 }, { x: 0, y: -1, z: 0 }),
      atom(cell, 'rotor-b', 1, { x: 10.5, y: 10, z: 10 }, { x: 0, y: 1, z: 0 }),
    ];
    const oneStep = stepConstrainedVelocityVerlet(
      cell,
      initial,
      constraints,
      zeroForces(),
      verletOptions(0.01),
    );
    expect(Math.abs(oneStep.final.energy.totalEnergyKjMol - oneStep.initial.energy.totalEnergyKjMol))
      .toBeLessThan(1e-12);

    const reversed = oneStep.final.atoms.map((candidate) => ({
      ...candidate,
      velocityAngstromPerPicosecond: scale(candidate.velocityAngstromPerPicosecond, -1),
    }));
    const reversedStep = stepConstrainedVelocityVerlet(
      cell,
      reversed,
      constraints,
      zeroForces(),
      verletOptions(0.01),
    );
    for (const initialAtom of initial) {
      const recovered = reversedStep.final.atoms.find((candidate) => candidate.id === initialAtom.id)!;
      expect(magnitude(subtract(localUnwrapped(cell, recovered), localUnwrapped(cell, initialAtom))))
        .toBeLessThan(2e-11);
      expect(magnitude(add(
        recovered.velocityAngstromPerPicosecond,
        initialAtom.velocityAngstromPerPicosecond,
      ))).toBeLessThan(2e-10);
    }

    let current: ReadonlyArray<RigidConstraintAtom> = initial;
    const initialEnergy = 0.01;
    let maximumEnergyError = 0;
    let previousEnergy = initialEnergy;
    let increasingSteps = 0;
    let decreasingSteps = 0;
    for (let step = 0; step < 10_000; step += 1) {
      const result = stepConstrainedVelocityVerlet(
        cell,
        current,
        constraints,
        zeroForces(),
        verletOptions(0.001),
      );
      const energy = result.final.energy.totalEnergyKjMol;
      maximumEnergyError = Math.max(maximumEnergyError, Math.abs(energy - initialEnergy));
      if (energy > previousEnergy) increasingSteps += 1;
      if (energy < previousEnergy) decreasingSteps += 1;
      previousEnergy = energy;
      current = result.final.atoms;
    }
    expect(maximumEnergyError).toBeLessThan(2e-10);
    expect(increasingSteps).toBeGreaterThan(100);
    expect(decreasingSteps).toBeGreaterThan(100);
    expect(Math.abs(previousEnergy - initialEnergy) / initialEnergy).toBeLessThan(2e-8);
  });

  it.each([0.001, 0.002])(
    'keeps a free rigid TIP3P geometry stable for 2,000 steps at dt=%s ps',
    (timeStepPicoseconds) => {
      const cell = orthorhombicCell(24);
      const fixture = rigidWater(
        cell,
        { x: 11, y: 10, z: 9 },
        { x: 0.3, y: -0.2, z: 0.1 },
        { x: 2.5, y: -1.7, z: 3.2 },
      );
      const initialMomentum = momentum(fixture.atoms);
      let current: ReadonlyArray<RigidConstraintAtom> = fixture.atoms;
      let initialEnergy: number | undefined;
      let maximumEnergyError = 0;
      for (let step = 0; step < 2_000; step += 1) {
        const result = stepConstrainedVelocityVerlet(
          cell,
          current,
          fixture.constraints,
          zeroForces(),
          verletOptions(timeStepPicoseconds),
        );
        initialEnergy ??= result.initial.energy.totalEnergyKjMol;
        maximumEnergyError = Math.max(
          maximumEnergyError,
          Math.abs(result.final.energy.totalEnergyKjMol - initialEnergy),
        );
        current = result.final.atoms;
      }

      expect(maximumEnergyError).toBeLessThan(2e-8);
      expect(magnitude(subtract(momentum(current), initialMomentum))).toBeLessThan(2e-7);
      for (const constraint of fixture.constraints) {
        expect(Math.abs(constraintDistance(cell, current, constraint) - constraint.distanceAngstrom))
          .toBeLessThanOrEqual(1e-11);
        expect(Math.abs(constraintDerivative(cell, current, constraint))).toBeLessThanOrEqual(1e-11);
      }
    },
  );

  it('executes TIP3P geometry through a strongly sheared triclinic face crossing', () => {
    const cell = triclinicCell();
    const oxygen = cell.fractionalToCartesian({ x: 0.985, y: 0.42, z: 0.37 });
    const fixture = rigidWater(
      cell,
      oxygen,
      { x: 100, y: -2, z: 1 },
      { x: 1.1, y: -0.7, z: 4.5 },
    );
    const initialImages = new Map(fixture.atoms.map((candidate) => [candidate.id, candidate.position.image]));
    const rankContexts: unknown[] = [];
    const result = stepConstrainedVelocityVerlet(
      cell,
      fixture.atoms,
      fixture.constraints,
      zeroForces(4),
      {
        ...verletOptions(0.002),
        maximumConstraintJacobianRankWorkUnits: 20,
        evaluateConstraintJacobianRank: (context) => {
          rankContexts.push(context);
          expect(Object.isFrozen(context)).toBe(true);
          expect(Object.isFrozen(context.atoms)).toBe(true);
          expect(Object.isFrozen(context.constraints)).toBe(true);
          return { rank: 3, method: 'locked-tip3p-rank', workUnitsConsumed: 17 };
        },
      },
    );

    expect(rankContexts).toHaveLength(1);
    expect(result.degreesOfFreedom).toEqual({
      cartesianCoordinateCount: 9,
      constraintJacobianRank: 3,
      constrainedCartesianCoordinateCount: 6,
      rankMethod: 'locked-tip3p-rank',
      rankWorkUnitsConsumed: 17,
    });
    expect(result.final.atoms.some((candidate) => {
      const initial = initialImages.get(candidate.id)!;
      return candidate.position.image.x !== initial.x
        || candidate.position.image.y !== initial.y
        || candidate.position.image.z !== initial.z;
    })).toBe(true);
    expect(result.constraintResiduals.shakeIterations).toBeGreaterThan(0);
    for (const constraint of fixture.constraints) {
      expect(Math.abs(constraintDistance(cell, result.final.atoms, constraint) - constraint.distanceAngstrom))
        .toBeLessThanOrEqual(1e-11);
      expect(Math.abs(constraintDerivative(cell, result.final.atoms, constraint)))
        .toBeLessThanOrEqual(1e-11);
    }
    expect(result.constraintImpulseClosure.combinedResidualNormDaltonAngstromPerPicosecond)
      .toBeLessThanOrEqual(1e-7);
    expect(result.constraintNumericalWorkKjMol).toEqual({
      positionProjection: result.constraintKineticEnergyChangesKjMol.shake,
      finalVelocityProjection: result.constraintKineticEnergyChangesKjMol.rattle,
      total: result.constraintKineticEnergyChangesKjMol.total,
      interpretation: 'constraint-projection kinetic-energy change; not potential energy',
    });
    expect(result.constraintVirialKjMol).toBeNull();
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.final.atoms[0].position.wrappedFractional)).toBe(true);
    expect(Object.isFrozen(result.perAtomConstraintCorrection['water-O'])).toBe(true);

    const reversed = result.final.atoms.map((candidate) => ({
      ...candidate,
      velocityAngstromPerPicosecond: scale(candidate.velocityAngstromPerPicosecond, -1),
    }));
    const reverseResult = stepConstrainedVelocityVerlet(
      cell,
      reversed,
      fixture.constraints,
      zeroForces(4),
      verletOptions(0.002),
    );
    for (const initialAtom of fixture.atoms) {
      const recovered = reverseResult.final.atoms.find((candidate) => candidate.id === initialAtom.id)!;
      expect(magnitude(subtract(localUnwrapped(cell, recovered), localUnwrapped(cell, initialAtom))))
        .toBeLessThan(2e-9);
      expect(magnitude(add(
        recovered.velocityAngstromPerPicosecond,
        initialAtom.velocityAngstromPerPicosecond,
      ))).toBeLessThan(2e-8);
    }
  });

  it('preserves constrained free-rotor momentum and bounds multistep NVE energy error', () => {
    const cell = orthorhombicCell(25);
    const fixture = rigidWater(
      cell,
      { x: 12, y: 11, z: 10 },
      { x: 0.2, y: -0.3, z: 0.1 },
      { x: 0.8, y: -0.4, z: 1.2 },
    );
    const initialMomentum = momentum(fixture.atoms);
    let current = fixture.atoms as ReadonlyArray<RigidConstraintAtom>;
    let initialEnergy: number | undefined;
    let maximumEnergyError = 0;
    for (let step = 0; step < 400; step += 1) {
      const result = stepConstrainedVelocityVerlet(
        cell,
        current,
        fixture.constraints,
        zeroForces(),
        verletOptions(0.0001),
      );
      initialEnergy ??= result.initial.energy.totalEnergyKjMol;
      maximumEnergyError = Math.max(
        maximumEnergyError,
        Math.abs(result.final.energy.totalEnergyKjMol - initialEnergy),
      );
      current = result.final.atoms;
    }

    expect(maximumEnergyError).toBeLessThan(2e-7);
    expect(magnitude(subtract(momentum(current), initialMomentum))).toBeLessThan(2e-7);
    for (const constraint of fixture.constraints) {
      expect(Math.abs(constraintDistance(cell, current, constraint) - constraint.distanceAngstrom))
        .toBeLessThanOrEqual(1e-11);
      expect(Math.abs(constraintDerivative(cell, current, constraint))).toBeLessThanOrEqual(1e-11);
    }
  });

  it('is bitwise deterministic and invariant to atom/constraint permutation', () => {
    const cell = triclinicCell();
    const fixture = rigidWater(
      cell,
      cell.fractionalToCartesian({ x: 0.35, y: 0.41, z: 0.29 }),
      { x: 0.5, y: -0.25, z: 0.1 },
      { x: 0.3, y: 0.7, z: -0.4 },
    );
    const callback = zeroForces(7);
    const first = stepConstrainedVelocityVerlet(
      cell,
      fixture.atoms,
      fixture.constraints,
      callback,
      verletOptions(0.001),
    );
    const replay = stepConstrainedVelocityVerlet(
      cell,
      fixture.atoms,
      fixture.constraints,
      callback,
      verletOptions(0.001),
    );
    const permuted = stepConstrainedVelocityVerlet(
      cell,
      [...fixture.atoms].reverse(),
      [...fixture.constraints].reverse(),
      callback,
      verletOptions(0.001),
    );
    const reversedEndpoints = stepConstrainedVelocityVerlet(
      cell,
      fixture.atoms,
      fixture.constraints.map((constraint) => ({
        ...constraint,
        atomAId: constraint.atomBId,
        atomBId: constraint.atomAId,
      })),
      callback,
      verletOptions(0.001),
    );

    expect(replay).toEqual(first);
    expect(permuted).toEqual(first);
    expect(reversedEndpoints).toEqual(first);
  });

  it('remains covariant under a huge common periodic image gauge', () => {
    const cell = triclinicCell();
    const fixture = rigidWater(
      cell,
      cell.fractionalToCartesian({ x: 0.3, y: 0.4, z: 0.5 }),
      { x: 0.1, y: -0.2, z: 0.3 },
      { x: 0.2, y: 0.4, z: -0.5 },
    );
    const gauge: Int3 = { x: 900_000_000, y: -800_000_000, z: 700_000_000 };
    const shifted = fixture.atoms.map((candidate) => ({
      ...candidate,
      position: {
        wrappedFractional: { ...candidate.position.wrappedFractional },
        image: addImage(candidate.position.image, gauge),
      },
    }));
    const base = stepConstrainedVelocityVerlet(
      cell,
      fixture.atoms,
      fixture.constraints,
      zeroForces(),
      verletOptions(0.001),
    );
    const gauged = stepConstrainedVelocityVerlet(
      cell,
      shifted,
      fixture.constraints,
      zeroForces(),
      verletOptions(0.001),
    );

    for (const baseAtom of base.final.atoms) {
      const shiftedAtom = gauged.final.atoms.find((candidate) => candidate.id === baseAtom.id)!;
      expect(shiftedAtom.position.wrappedFractional).toEqual(baseAtom.position.wrappedFractional);
      expect(shiftedAtom.position.image).toEqual(addImage(baseAtom.position.image, gauge));
      expect(shiftedAtom.velocityAngstromPerPicosecond).toEqual(baseAtom.velocityAngstromPerPicosecond);
      expect(gauged.perAtomConstraintCorrection[baseAtom.id])
        .toEqual(base.perAtomConstraintCorrection[baseAtom.id]);
    }
    expect(gauged.final.energy).toEqual(base.final.energy);
    expect(gauged.constraintImpulseClosure).toEqual(base.constraintImpulseClosure);
  });

  it('exposes the two callback stages without claiming stage-independent physics', () => {
    const cell = orthorhombicCell();
    const initial = [atom(cell, 'stage-atom', 1, { x: 5, y: 5, z: 5 })];
    const stages: string[] = [];
    const result = stepConstrainedVelocityVerlet(cell, initial, [], (context) => {
      stages.push(context.stage);
      const force = context.stage === 'initial' ? ZERO : { x: 1, y: 0, z: 0 };
      return {
        forceByAtomIdKjMolAngstrom: { 'stage-atom': force },
        potentialEnergyComponentsKjMol: { caller_branch: context.stage === 'initial' ? 0 : 1 },
        workUnitsConsumed: 1,
      };
    }, { timeStepPicoseconds: 0.01 });

    expect(stages).toEqual(['initial', 'final']);
    expect(result.final.atoms[0].velocityAngstromPerPicosecond.x).toBeCloseTo(0.5, 14);
    expect(result.boundaries.join(' ')).toMatch(/caller must supply deterministic, pure/);
    expect(result.boundaries.join(' ')).toMatch(/component namespace/);
  });

  it('fails closed on extra, symbol, and inherited callback-boundary fields', () => {
    const cell = orthorhombicCell();
    const fixture = rigidWater(cell, { x: 8, y: 9, z: 10 });
    const hidden = Symbol('hidden-non-finite');

    expect(() => stepConstrainedVelocityVerlet(
      cell,
      fixture.atoms,
      fixture.constraints,
      (context) => ({ ...zeroForces()(context), pressureBar: 1 }) as never,
      verletOptions(0.001),
    )).toThrow(/force callback evaluation must contain exactly the locked own string keys/);

    expect(() => stepConstrainedVelocityVerlet(
      cell,
      fixture.atoms,
      fixture.constraints,
      ((context: ConstrainedForceContext) => {
        const evaluation = { ...zeroForces()(context) } as ConstrainedForceCallback extends
          (...args: never[]) => infer Result ? Result & Record<PropertyKey, unknown> : never;
        Object.defineProperty(evaluation, hidden, { value: Number.NaN, enumerable: true });
        return evaluation;
      }) as ConstrainedForceCallback,
      verletOptions(0.001),
    )).toThrow(/force callback evaluation must not contain symbol keys/);

    expect(() => stepConstrainedVelocityVerlet(
      cell,
      fixture.atoms,
      fixture.constraints,
      ((context: ConstrainedForceContext) => {
        const evaluation = Object.assign(
          Object.create({ inheritedPressureBar: Number.NaN }),
          zeroForces()(context),
        );
        return evaluation;
      }) as ConstrainedForceCallback,
      verletOptions(0.001),
    )).toThrow(/plain record without inherited application fields/);

    expect(() => stepConstrainedVelocityVerlet(
      cell,
      fixture.atoms,
      fixture.constraints,
      ({ atoms }) => ({
        forceByAtomIdKjMolAngstrom: {
          ...Object.fromEntries(atoms.map((candidate) => [candidate.id, ZERO])),
          unexpectedAtom: ZERO,
        },
        potentialEnergyComponentsKjMol: { zero: 0 },
        workUnitsConsumed: 1,
      }),
      verletOptions(0.001),
    )).toThrow(/force record must contain exactly one vector for every atom ID/);

    expect(() => stepConstrainedVelocityVerlet(
      cell,
      fixture.atoms,
      fixture.constraints,
      (({ atoms }) => {
        const forceRecord = Object.fromEntries(atoms.map((candidate) => [candidate.id, ZERO]));
        Object.defineProperty(forceRecord, hidden, { value: Number.NaN, enumerable: true });
        return {
          forceByAtomIdKjMolAngstrom: forceRecord,
          potentialEnergyComponentsKjMol: { zero: 0 },
          workUnitsConsumed: 1,
        };
      }) as ConstrainedForceCallback,
      verletOptions(0.001),
    )).toThrow(/force record must not contain symbol keys/);

    expect(() => stepConstrainedVelocityVerlet(
      cell,
      fixture.atoms,
      fixture.constraints,
      (({ atoms }) => {
        const components = { zero: 0 } as Record<PropertyKey, number>;
        Object.defineProperty(components, hidden, { value: Number.NaN, enumerable: true });
        return {
          forceByAtomIdKjMolAngstrom: Object.fromEntries(
            atoms.map((candidate) => [candidate.id, ZERO]),
          ),
          potentialEnergyComponentsKjMol: components,
          workUnitsConsumed: 1,
        };
      }) as ConstrainedForceCallback,
      verletOptions(0.001),
    )).toThrow(/potential-energy component record must not contain symbol keys/);

    const rankOptions = {
      ...verletOptions(0.001),
      maximumConstraintJacobianRankWorkUnits: 10,
    };
    expect(() => stepConstrainedVelocityVerlet(
      cell,
      fixture.atoms,
      fixture.constraints,
      zeroForces(),
      {
        ...rankOptions,
        evaluateConstraintJacobianRank: () => ({
          rank: 3,
          method: 'test-rank',
          workUnitsConsumed: 1,
          hiddenNonFinite: Number.NaN,
        }) as never,
      },
    )).toThrow(/rank evaluation must contain exactly the locked own string keys/);

    expect(() => stepConstrainedVelocityVerlet(
      cell,
      fixture.atoms,
      fixture.constraints,
      zeroForces(),
      {
        ...rankOptions,
        evaluateConstraintJacobianRank: () => {
          const evaluation = { rank: 3, method: 'test-rank', workUnitsConsumed: 1 };
          Object.defineProperty(evaluation, hidden, { value: Number.NaN, enumerable: true });
          return evaluation;
        },
      },
    )).toThrow(/rank evaluation must not contain symbol keys/);
  });

  it('rolls back on callback, Promise, non-finite, partial-force, constraint, and budget failures', () => {
    const cell = orthorhombicCell();
    const fixture = rigidWater(cell, { x: 8, y: 9, z: 10 });
    const inputSnapshot = JSON.stringify(fixture.atoms);
    let callbackCalls = 0;

    expect(() => stepConstrainedVelocityVerlet(cell, fixture.atoms, fixture.constraints, (context) => {
      callbackCalls += 1;
      if (context.stage === 'final') throw new Error('deliberate final failure');
      return zeroForces()(context);
    }, verletOptions(0.001))).toThrow(/final force callback failed: deliberate final failure/);
    expect(JSON.stringify(fixture.atoms)).toBe(inputSnapshot);
    expect(callbackCalls).toBe(2);

    expect(() => stepConstrainedVelocityVerlet(
      cell,
      fixture.atoms,
      fixture.constraints,
      (() => Promise.resolve({})) as unknown as ConstrainedForceCallback,
      verletOptions(0.001),
    )).toThrow(/must be synchronous/);
    expect(JSON.stringify(fixture.atoms)).toBe(inputSnapshot);

    expect(() => stepConstrainedVelocityVerlet(cell, fixture.atoms, fixture.constraints, ({ atoms }) => ({
      forceByAtomIdKjMolAngstrom: Object.fromEntries(atoms.map((candidate) => [candidate.id, {
        x: candidate.id === 'water-O' ? Number.NaN : 0,
        y: 0,
        z: 0,
      }])),
      potentialEnergyComponentsKjMol: { invalid: 0 },
      workUnitsConsumed: 1,
    }), verletOptions(0.001))).toThrow(/must contain finite/);

    expect(() => stepConstrainedVelocityVerlet(cell, fixture.atoms, fixture.constraints, ({ atoms }) => ({
      forceByAtomIdKjMolAngstrom: Object.fromEntries(atoms.map((candidate) => [candidate.id, {
        x: 0,
        y: 0,
        z: 0,
        hiddenNonFinite: Number.NaN,
      }])),
      potentialEnergyComponentsKjMol: { invalid_shape: 0 },
      workUnitsConsumed: 1,
    }), verletOptions(0.001))).toThrow(/exactly those keys/);

    expect(() => stepConstrainedVelocityVerlet(cell, fixture.atoms, fixture.constraints, () => ({
      forceByAtomIdKjMolAngstrom: { 'water-O': ZERO },
      potentialEnergyComponentsKjMol: { partial: 0 },
      workUnitsConsumed: 1,
    }), verletOptions(0.001))).toThrow(/exactly one vector for every atom ID/);

    const offManifold = fixture.atoms.map((candidate) => candidate.id === 'water-H1'
      ? {
        ...candidate,
        position: cell.wrapCartesian(add(localUnwrapped(cell, candidate), { x: 0.2, y: 0, z: 0 })),
      }
      : candidate);
    let offManifoldCallbacks = 0;
    expect(() => stepConstrainedVelocityVerlet(cell, offManifold, fixture.constraints, (context) => {
      offManifoldCallbacks += 1;
      return zeroForces()(context);
    }, verletOptions(0.001))).toThrow(/initial constraint position validation failed|must already satisfy/);
    expect(offManifoldCallbacks).toBe(0);

    const pairAtoms = [
      atom(cell, 'pair-a', 1, { x: 4, y: 5, z: 6 }),
      atom(cell, 'pair-b', 1, { x: 5, y: 5, z: 6 }),
    ];
    const pairConstraints = [{
      id: 'pair-distance', atomAId: 'pair-a', atomBId: 'pair-b', distanceAngstrom: 1,
    }];
    const pairSnapshot = JSON.stringify(pairAtoms);
    expect(() => stepConstrainedVelocityVerlet(cell, pairAtoms, pairConstraints, ({ stage }) => ({
      forceByAtomIdKjMolAngstrom: {
        'pair-a': stage === 'initial' ? { x: -10, y: 0, z: 0 } : ZERO,
        'pair-b': stage === 'initial' ? { x: 10, y: 0, z: 0 } : ZERO,
      },
      potentialEnergyComponentsKjMol: { stretch: 0 },
      workUnitsConsumed: 1,
    }), {
      timeStepPicoseconds: 0.01,
      constraintOptions: {
        maximumIterations: 1,
        positionToleranceAngstrom: 1e-14,
        velocityDerivativeToleranceAngstrom2PerPicosecond: 1e-14,
      },
    })).toThrow(/SHAKE constraints did not converge/);
    expect(JSON.stringify(pairAtoms)).toBe(pairSnapshot);

    const singularPairAtoms = [
      { ...pairAtoms[0], velocityAngstromPerPicosecond: { x: 0, y: -1, z: 0 } },
      { ...pairAtoms[1], velocityAngstromPerPicosecond: { x: 0, y: 1, z: 0 } },
    ];
    const singularPairSnapshot = JSON.stringify(singularPairAtoms);
    let singularCallbacks = 0;
    expect(() => stepConstrainedVelocityVerlet(cell, singularPairAtoms, pairConstraints, ({ atoms, stage }) => {
      singularCallbacks += 1;
      return {
        forceByAtomIdKjMolAngstrom: Object.fromEntries(atoms.map((candidate) => [
          candidate.id,
          stage === 'initial'
            ? { x: candidate.id === 'pair-a' ? 100 : -100, y: 0, z: 0 }
            : ZERO,
        ])),
        potentialEnergyComponentsKjMol: { singular_fixture: 0 },
        workUnitsConsumed: 1,
      };
    }, {
      ...verletOptions(0.01),
      constraintOptions: {
        ...verletOptions(0.01).constraintOptions,
        positionToleranceAngstrom: 1e-13,
      },
    })).toThrow(/singular current\/reference gradient denominator/);
    expect(singularCallbacks).toBe(1);
    expect(JSON.stringify(singularPairAtoms)).toBe(singularPairSnapshot);

    let budgetCallbacks = 0;
    expect(() => stepConstrainedVelocityVerlet(cell, fixture.atoms, fixture.constraints, (context) => {
      budgetCallbacks += 1;
      return zeroForces()(context);
    }, {
      ...verletOptions(0.001),
      maximumWorkUnits: 10,
      maximumForceEvaluationWorkUnits: 1,
    })).toThrow(/preflight requires/);
    expect(budgetCallbacks).toBe(0);
    expect(JSON.stringify(fixture.atoms)).toBe(inputSnapshot);

    expect(() => stepConstrainedVelocityVerlet(
      cell,
      fixture.atoms,
      fixture.constraints,
      zeroForces(),
      { ...verletOptions(0.001), unsupportedOption: true } as never,
    )).toThrow(/options contains an unsupported key/);
    expect(JSON.stringify(fixture.atoms)).toBe(inputSnapshot);
  });
});

function addImage(left: Int3, right: Int3): Int3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
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

function scale(vector: Vector3, scalar: number): Vector3 {
  return { x: vector.x * scalar, y: vector.y * scalar, z: vector.z * scalar };
}

function dot(left: Vector3, right: Vector3) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function magnitude(vector: Vector3) {
  return Math.sqrt(dot(vector, vector));
}

function cross(left: Vector3, right: Vector3): Vector3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}
