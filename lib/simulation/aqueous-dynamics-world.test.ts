import { describe, expect, it } from 'vitest';
import {
  AQUEOUS_DYNAMICS_CONSTRAINT_JACOBIAN_RANK_TOLERANCE_V042,
  AQUEOUS_DYNAMICS_TEMPERATURE_DOF_V042,
  AQUEOUS_DYNAMICS_TIME_STEP_PS_V042,
  createNaClTip3pFiniteSizeCalibrationWorldV042,
  evaluateAqueousConstraintJacobianRankV042,
} from './aqueous-dynamics-world.ts';
import { digestValue } from './digest.ts';

function potentialEnergyNamespace(forceField: ReturnType<
  ReturnType<typeof createNaClTip3pFiniteSizeCalibrationWorldV042>['observe']
>['forceField']) {
  return {
    ewaldRealSpace: forceField.energyKjMol.ewaldRealSpace,
    ewaldReciprocalSpace: forceField.energyKjMol.ewaldReciprocalSpace,
    ewaldSelfCorrection: forceField.energyKjMol.ewaldSelfCorrection,
    coulombExceptionCorrection: forceField.energyKjMol.coulombExceptionCorrection,
    lennardJonesFinal: forceField.energyKjMol.lennardJonesFinal,
  };
}

describe('v0.4.2 NaCl-TIP3P finite-size integration calibration world', () => {
  it('constructs the locked 8-atom, two-water periodic fixture without silently projecting it', () => {
    const world = createNaClTip3pFiniteSizeCalibrationWorldV042();
    const observation = world.observe();

    expect(observation.status).toBe('solver-driven-finite-size-integration-calibration');
    expect(observation.atoms).toHaveLength(8);
    expect(observation.topology.molecules.filter((molecule) => molecule.kind === 'rigid-tip3p-water'))
      .toHaveLength(2);
    expect(observation.topology.constraints).toHaveLength(6);
    expect(observation.topology.nonbondedExceptions).toHaveLength(6);
    expect(observation.periodicGeometry.waterMoleculesStraddlingBoundary).toBeGreaterThanOrEqual(1);
    expect(observation.constraints.maximumPositionResidualAngstrom)
      .toBeLessThanOrEqual(observation.numericalValidity.positionConstraintToleranceAngstrom);
    expect(observation.constraints.maximumVelocityDerivativeResidualAngstrom2PerPicosecond).toBe(0);
    expect(observation.thermodynamics.temperatureDegreesOfFreedom)
      .toBe(AQUEOUS_DYNAMICS_TEMPERATURE_DOF_V042);
    expect(observation.mechanicalObservables).toEqual({
      pressureBar: null,
      totalStressKjMolAngstrom3: null,
      boundary: 'unavailable-complete-ewald-virial-not-implemented',
    });
    expect(observation.provenance).toMatchObject({
      externalEngineExecuted: false,
      openmmReproduction: false,
      bulkOrDiluteClaim: false,
      chemicalReactionClaim: false,
    });
    const state = world.serialize();
    expect(state.configurationDigest).toBe(digestValue(state.configuration));
    expect(state.configuration.topologyDigest).toBe(state.topologyDigest);
    expect(state.configuration.topology).toEqual(observation.topology);
    expect(state.configuration.cell).toMatchObject({
      vectorsAngstrom: observation.cell.vectorsAngstrom,
      volumeAngstrom3: observation.cell.volumeAngstrom3,
      periodicAxes: [true, true, true],
    });
    expect(state.configuration.integration).toMatchObject({
      algorithm: 'constrained-velocity-verlet-rattle',
      ensemble: 'NVE',
      fixedTimeStepPicoseconds: AQUEOUS_DYNAMICS_TIME_STEP_PS_V042,
      constraintImpulseToleranceDaltonAngstromPerPicosecond: 1e-8,
      constraintJacobianRankRelativePivotTolerance:
        AQUEOUS_DYNAMICS_CONSTRAINT_JACOBIAN_RANK_TOLERANCE_V042,
      maximumIntegratorWorkUnits: 1_098_000,
      maximumStepWorkUnits: 1_100_000,
      maximumConstraintJacobianRankWorkUnits: 1_000,
    });
    const rankReceipt = evaluateAqueousConstraintJacobianRankV042({
      cell: world.cell,
      atoms: observation.atoms.map((atom) => ({
        id: atom.id,
        massDalton: atom.massDalton,
        position: atom.position,
      })),
      constraints: observation.topology.constraints,
    });
    expect(rankReceipt).toEqual({
      constraintDefinition: 'g=minimum-image-distance-squared-minus-target-distance-squared',
      matrixRows: 6,
      matrixColumns: 24,
      method: 'numeric-minimum-image-g2-scaled-partial-pivot-v1',
      relativePivotTolerance: AQUEOUS_DYNAMICS_CONSTRAINT_JACOBIAN_RANK_TOLERANCE_V042,
      rank: 6,
      workUnitsConsumed: 651,
      workUnitModel: 'scalar-matrix-write-inspection-and-elimination-v1',
    });
    expect(state.configuration.degreesOfFreedom).toMatchObject({
      constraintJacobianRank: 6,
      temperatureDegreesOfFreedom: AQUEOUS_DYNAMICS_TEMPERATURE_DOF_V042,
      rankMethod: 'numeric-minimum-image-g2-scaled-partial-pivot-v1',
      rankWorkUnitsConsumed: rankReceipt.workUnitsConsumed,
    });
    expect(observation.constraints).toMatchObject({
      count: 6,
      jacobianRank: 6,
      rankMethod: 'numeric-minimum-image-g2-scaled-partial-pivot-v1',
      rankRelativePivotTolerance: AQUEOUS_DYNAMICS_CONSTRAINT_JACOBIAN_RANK_TOLERANCE_V042,
      rankWorkUnitsConsumed: rankReceipt.workUnitsConsumed,
    });
    expect(observation.thermodynamics.temperatureDegreesOfFreedom).toBe(
      observation.thermodynamics.cartesianCoordinateCount
      - observation.constraints.jacobianRank
      - observation.thermodynamics.centerOfMassRemovedDegreesOfFreedom,
    );
    expect(state.initialTotalEnergyKjMol).toBe(observation.energy.totalKjMol);
    expect(state.initialMassDalton).toBe(observation.conservation.totalMassDalton);
    expect(state.initialChargeE).toBe(observation.conservation.totalChargeE);
    expect(state.initialMomentumDaltonAngstromPerPicosecond)
      .toEqual(observation.conservation.totalMomentumDaltonAngstromPerPicosecond);
    expect(state.energyReferenceKjMol).toBe(Math.max(1, Math.abs(state.initialTotalEnergyKjMol)));
    expect(state.energyStatistics).toEqual({
      sampleCount: 1,
      timeSumPicoseconds: 0,
      energySumKjMol: state.initialTotalEnergyKjMol,
      timeSquaredSumPicoseconds2: 0,
      timeEnergySumKjMolPicoseconds: 0,
      maximumAbsoluteExcursionKjMol: 0,
      maximumAbsoluteExcursionStep: 0,
      maximumRelativeExcursion: 0,
      maximumRelativeExcursionStep: 0,
      linearDriftSlopeKjMolPerPicosecond: 0,
      linearRelativeDriftRatePerPicosecond: 0,
    });
    expect(state.lastIntegrationReceipt).toBeNull();
  });

  it('advances exactly one fixed 0.001 ps step through the composer and discrete RATTLE', () => {
    const world = createNaClTip3pFiniteSizeCalibrationWorldV042();
    const before = world.observe();
    const after = world.advance();

    expect(world.stepCount).toBe(1);
    expect(after.step).toBe(1);
    expect(after.timePicoseconds).toBe(AQUEOUS_DYNAMICS_TIME_STEP_PS_V042);
    expect(after.stateDigest).not.toBe(before.stateDigest);
    expect(after.physicalDigest).not.toBe(before.physicalDigest);
    expect(after.integration).toMatchObject({
      algorithm: 'constrained-velocity-verlet-rattle',
      ensemble: 'NVE',
      fixedTimeStepPicoseconds: 0.001,
    });
    expect(after.integration.lastStepResultDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(after.integration.lastStepWorkUnitsConsumed).toBeGreaterThan(0);
    expect(after.constraints.jacobianRank).toBe(6);
    expect(after.constraints.maximumPositionResidualAngstrom)
      .toBeLessThanOrEqual(after.numericalValidity.positionConstraintToleranceAngstrom);
    expect(after.constraints.maximumVelocityDerivativeResidualAngstrom2PerPicosecond)
      .toBeLessThanOrEqual(after.numericalValidity.velocityConstraintToleranceAngstrom2PerPicosecond);
    expect(after.energy.relativeExcursion)
      .toBeLessThanOrEqual(after.numericalValidity.maximumRelativeEnergyExcursion);
    expect(after.conservation.momentumResidual)
      .toBeLessThanOrEqual(after.numericalValidity.momentumResidualLimit);
    expect(after.conservation.internalForceResidualKjMolAngstrom)
      .toBeLessThanOrEqual(after.numericalValidity.internalForceResidualLimit);

    const state = world.serialize();
    const receipt = state.lastIntegrationReceipt!;
    expect(receipt).toEqual(after.integration.lastIntegrationReceipt);
    expect(receipt.integratorResultDigest).toBe(after.integration.lastStepResultDigest);
    expect(receipt).toMatchObject({
      fromStep: 0,
      toStep: 1,
      topologyDigest: after.topologyDigest,
      configurationDigest: after.configurationDigest,
      initialEvaluation: {
        stage: 'initial',
        evaluationOrdinal: 1,
        evaluationDigest: before.forceField.evaluationDigest,
        constraintJacobianRankReceipt: {
          rank: 6,
          method: 'numeric-minimum-image-g2-scaled-partial-pivot-v1',
          relativePivotTolerance: AQUEOUS_DYNAMICS_CONSTRAINT_JACOBIAN_RANK_TOLERANCE_V042,
          workUnitsConsumed: 651,
        },
      },
      finalEvaluation: {
        stage: 'final',
        evaluationOrdinal: 2,
        evaluationDigest: after.forceField.evaluationDigest,
        constraintJacobianRankReceipt: {
          rank: 6,
          method: 'numeric-minimum-image-g2-scaled-partial-pivot-v1',
          relativePivotTolerance: AQUEOUS_DYNAMICS_CONSTRAINT_JACOBIAN_RANK_TOLERANCE_V042,
          workUnitsConsumed: 651,
        },
      },
    });
    expect(receipt.finalEvaluation.forceNamespaceDigest)
      .toBe(digestValue(after.forceField.forceByAtomIdKjMolAngstrom));
    expect(receipt.finalEvaluation.energyNamespaceDigest)
      .toBe(digestValue(potentialEnergyNamespace(after.forceField)));
    expect(receipt.finalEvaluation.workUnitsConsumed)
      .toBe(after.forceField.workReceipt.totalWorkUnitsConsumed);
    expect(receipt.finalEvaluation.workReceiptDigest)
      .toBe(digestValue(after.forceField.workReceipt));
    const endpointRankAuditWork = receipt.initialEvaluation.constraintJacobianRankReceipt.workUnitsConsumed
      + receipt.finalEvaluation.constraintJacobianRankReceipt.workUnitsConsumed;
    expect(receipt.workReceipt).toEqual({
      solverIntegratorWorkUnits: after.integration.lastStepSolverWorkUnitsConsumed,
      composerEndpointRankAuditWorkUnits: endpointRankAuditWork,
      totalIntegrationWorkUnits:
        after.integration.lastStepSolverWorkUnitsConsumed + endpointRankAuditWork,
      maximumIntegrationWorkUnits: 1_100_000,
      withinBudget: true,
      boundary: 'covers-integrator-and-two-composer-endpoint-rank-audits; observation-recomputation-is-receipted-separately',
    });
    expect(after.integration.lastStepComposerEndpointRankAuditWorkUnitsConsumed)
      .toBe(endpointRankAuditWork);
    expect(after.integration.lastStepWorkUnitsConsumed)
      .toBe(receipt.workReceipt.totalIntegrationWorkUnits);
    expect(after.integration.lastStepWorkUnitsLimit).toBe(1_100_000);
    const { receiptDigest, ...receiptPayload } = receipt;
    expect(receiptDigest).toBe(digestValue(receiptPayload));
    const { stateDigest, ...statePayload } = state;
    expect(stateDigest).toBe(digestValue(statePayload));
  });

  it('persists cumulative regression sums and retains a historical maximum after current energy recedes', () => {
    const world = createNaClTip3pFiniteSizeCalibrationWorldV042();
    let observation = world.observe();
    let observedRecession = false;
    for (let step = 1; step <= 24; step += 1) {
      observation = world.advance();
      if (observation.energyStatistics.maximumAbsoluteExcursionStep < observation.step) {
        observedRecession = true;
        break;
      }
    }

    expect(observedRecession).toBe(true);
    expect(observation.energyStatistics.maximumAbsoluteExcursionKjMol)
      .toBeGreaterThan(observation.energy.absoluteExcursionKjMol);
    expect(observation.energyStatistics.maximumRelativeExcursionStep)
      .toBe(observation.energyStatistics.maximumAbsoluteExcursionStep);
    expect(observation.energyStatistics.sampleCount).toBe(observation.step + 1);
    expect(observation.energyStatistics.timeSumPicoseconds)
      .toBe(AQUEOUS_DYNAMICS_TIME_STEP_PS_V042 * observation.step * (observation.step + 1) / 2);
    expect(observation.energyStatistics.timeSquaredSumPicoseconds2).toBe(
      AQUEOUS_DYNAMICS_TIME_STEP_PS_V042 ** 2
      * observation.step * (observation.step + 1) * (2 * observation.step + 1) / 6,
    );
    expect(Number.isFinite(observation.energyStatistics.linearDriftSlopeKjMolPerPicosecond))
      .toBe(true);
    expect(world.serialize().energyStatistics).toEqual(observation.energyStatistics);
  });

  it('is bit-deterministic for construction and one accepted step', () => {
    const left = createNaClTip3pFiniteSizeCalibrationWorldV042();
    const right = createNaClTip3pFiniteSizeCalibrationWorldV042();

    expect(left.serialize()).toEqual(right.serialize());
    expect(left.observe()).toEqual(right.observe());
    expect(left.advance()).toEqual(right.advance());
    expect(left.serialize()).toEqual(right.serialize());
  });

  it('detects a rank-deficient 6 x 24 Jacobian instead of trusting fixture counts', () => {
    const world = createNaClTip3pFiniteSizeCalibrationWorldV042();
    const observation = world.observe();
    const atoms = observation.atoms.map((atom) => ({
      id: atom.id,
      massDalton: atom.massDalton,
      position: atom.position,
    }));
    const constraints = observation.topology.constraints.map((constraint) => ({ ...constraint }));
    constraints[5] = {
      ...constraints[4],
      id: 'rank-deficient-duplicate-row',
    };

    const deficient = evaluateAqueousConstraintJacobianRankV042({
      cell: world.cell,
      atoms,
      constraints,
    });

    expect(atoms).toHaveLength(8);
    expect(constraints).toHaveLength(6);
    expect(deficient).toEqual({
      constraintDefinition: 'g=minimum-image-distance-squared-minus-target-distance-squared',
      matrixRows: 6,
      matrixColumns: 24,
      method: 'numeric-minimum-image-g2-scaled-partial-pivot-v1',
      relativePivotTolerance: AQUEOUS_DYNAMICS_CONSTRAINT_JACOBIAN_RANK_TOLERANCE_V042,
      rank: 5,
      workUnitsConsumed: 660,
      workUnitModel: 'scalar-matrix-write-inspection-and-elimination-v1',
    });
  });

  it('keeps mutable state in ECMAScript private fields', () => {
    const world = createNaClTip3pFiniteSizeCalibrationWorldV042();
    const pristine = world.serialize();

    expect(Object.isFrozen(world)).toBe(true);
    expect(Reflect.set(world, 'atoms', [])).toBe(false);
    expect(Reflect.set(world, 'step', 999)).toBe(false);
    expect(Reflect.set(world, 'stateDigest', 'sha256:tampered')).toBe(false);

    for (const erasedTypeScriptPrivateName of [
      'capture',
      'restore',
      'refreshIdentity',
      'computeStateDigest',
      'statePayload',
    ]) {
      expect(Reflect.get(world, erasedTypeScriptPrivateName)).toBeUndefined();
    }

    expect(world.stepCount).toBe(0);
    expect(world.serialize()).toEqual(pristine);
    expect(world.observe().stateDigest).toBe(pristine.stateDigest);
  });

  it('rejects action key injection and rolls all mutable state back on an integration failure', () => {
    const world = createNaClTip3pFiniteSizeCalibrationWorldV042();
    const pristine = world.serialize();
    expect(() => world.advance({ kind: 'advance', substeps: 1, timeStepPicoseconds: 0.002 } as never))
      .toThrow(/exactly the locked keys/);
    expect(world.serialize()).toEqual(pristine);

    const nonEnumerable = { kind: 'advance', substeps: 1 };
    Object.defineProperty(nonEnumerable, 'timeStepPicoseconds', { value: 0.002, enumerable: false });
    expect(() => world.advance(nonEnumerable as never)).toThrow(/exactly the locked keys/);
    const symbolic = { kind: 'advance', substeps: 1 } as Record<PropertyKey, unknown>;
    symbolic[Symbol('timeStepPicoseconds')] = 0.002;
    expect(() => world.advance(symbolic as never)).toThrow(/locked string keys/);
    const inherited = Object.assign(Object.create({ timeStepPicoseconds: 0.002 }), {
      kind: 'advance', substeps: 1,
    });
    expect(() => world.advance(inherited as never)).toThrow(/plain record/);

    let getterCalls = 0;
    const accessorAction = { substeps: 1 } as Record<PropertyKey, unknown>;
    Object.defineProperty(accessorAction, 'kind', {
      configurable: true,
      enumerable: true,
      get() {
        getterCalls += 1;
        world.advance();
        return 'invalid-after-reentry';
      },
    });
    let reentrantError = '';
    const reentrantDescriptorTrap = new Proxy(accessorAction, {
      getOwnPropertyDescriptor(target, property) {
        if (property === 'kind') {
          try {
            world.advance();
          } catch (error) {
            reentrantError = error instanceof Error ? error.message : String(error);
          }
        }
        return Reflect.getOwnPropertyDescriptor(target, property);
      },
    });
    expect(() => world.advance(reentrantDescriptorTrap as never)).toThrow(/own data properties/);
    expect(reentrantError).toMatch(/not reentrant/);
    expect(getterCalls).toBe(0);
    expect(world.serialize()).toEqual(pristine);

    world.advance();
    const acceptedState = world.serialize();
    const acceptedBytes = JSON.stringify(acceptedState);
    const prototype = Object.getPrototypeOf(world) as { observe: () => unknown };
    const originalObserve = prototype.observe;
    prototype.observe = () => { throw new Error('injected post-integration gate failure'); };
    try {
      expect(() => world.advance()).toThrow(/injected post-integration gate failure/);
    } finally {
      prototype.observe = originalObserve;
    }
    expect(JSON.stringify(world.serialize())).toBe(acceptedBytes);
    expect(world.serialize()).toEqual(acceptedState);
    expect(world.stepCount).toBe(1);
  });
});
