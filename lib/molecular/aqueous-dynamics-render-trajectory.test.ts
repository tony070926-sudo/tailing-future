import { beforeAll, describe, expect, it } from 'vitest';
import { digestValue } from '../simulation/digest.ts';
import {
  AQUEOUS_DYNAMICS_RENDER_TRAJECTORY_DEFAULT_STEPS_V043,
  assertAqueousDynamicsRenderTrajectoryV043,
  createAqueousDynamicsRenderTrajectoryV043,
  getLocallyExecutedAqueousDynamicsRenderTrajectorySampleV043,
  requireLocallyExecutedAqueousDynamicsRenderTrajectoryV043,
  type AqueousDynamicsRenderTrajectorySampleV043,
  type AqueousDynamicsRenderTrajectoryV043,
} from './aqueous-dynamics-render-frame.ts';

type Mutable<Value> = { -readonly [Key in keyof Value]: Value[Key] };

let trajectory: AqueousDynamicsRenderTrajectoryV043;

beforeAll(() => {
  trajectory = createAqueousDynamicsRenderTrajectoryV043();
});

describe('aqueous dynamics exact render trajectory v0.4.3', () => {
  it('executes the default ten accepted steps and emits eleven exact source-bound endpoints', () => {
    expect(AQUEOUS_DYNAMICS_RENDER_TRAJECTORY_DEFAULT_STEPS_V043).toBe(10);
    expect(trajectory).toMatchObject({
      schemaVersion: 'tf.aqueous-dynamics-render-trajectory/0.4.3',
      status: 'locally-executed-exact-endpoint-trajectory',
      worldId: 'nacl-tip3p-finite-size-calibration',
      execution: {
        acceptedStepsExecuted: 10,
        fromStep: 0,
        toStep: 10,
        sampleStrideSteps: 1,
        sampleCount: 11,
        fixedTimeStepPicoseconds: 0.001,
        finalTimePicoseconds: 0.01,
        solverEndpointRatePerPicosecond: 1000,
      },
    });
    expect(trajectory.samples).toHaveLength(11);
    expect(trajectory.sampleDigests).toHaveLength(11);

    for (const [sampleIndex, sample] of trajectory.samples.entries()) {
      const observation = sample.observation;
      const frame = sample.renderFrame;
      const previous = trajectory.samples[sampleIndex - 1] ?? null;
      const receipt = observation.integration.lastIntegrationReceipt;

      expect(sample).toMatchObject({
        schemaVersion: 'tf.aqueous-dynamics-render-trajectory-sample/0.4.3',
        sampleIndex,
        step: sampleIndex,
        timePicoseconds: sampleIndex * 0.001,
        parentStateId: previous?.stateId ?? null,
        stateId: observation.stateId,
        stateDigest: observation.stateDigest,
        physicalDigest: observation.physicalDigest,
        observationDigest: observation.observationDigest,
        integrationReceiptDigest: receipt?.receiptDigest ?? null,
        previousSampleDigest: previous?.sampleDigest ?? null,
      });
      expect(observation.step).toBe(sampleIndex);
      expect(observation.timePicoseconds).toBe(sampleIndex * 0.001);

      if (sampleIndex === 0) {
        expect(receipt).toBeNull();
      } else {
        expect(receipt).not.toBeNull();
        if (!receipt) throw new Error('accepted trajectory endpoint is missing its receipt');
        expect(receipt).toMatchObject({
          fromStep: sampleIndex - 1,
          toStep: sampleIndex,
          topologyDigest: trajectory.topologyDigest,
          configurationDigest: trajectory.configurationDigest,
          integratorResultDigest: observation.integration.lastStepResultDigest,
        });
        const { receiptDigest, ...receiptPayload } = receipt;
        expect(receiptDigest).toBe(digestValue(receiptPayload));
        expect(observation.parentStateId).toBe(previous?.stateId);
      }

      expect(frame).toMatchObject({
        schemaVersion: 'tf.aqueous-dynamics-render-frame/0.4.3',
        worldId: observation.worldId,
        stateId: observation.stateId,
        stateDigest: observation.stateDigest,
        physicalDigest: observation.physicalDigest,
        step: observation.step,
        timePicoseconds: observation.timePicoseconds,
      });
      expect(frame.sourceBinding).toEqual({
        observationDigest: observation.observationDigest,
        forceFieldEvaluationDigest: observation.forceField.evaluationDigest,
        topologyDigest: observation.topologyDigest,
        configurationDigest: observation.configurationDigest,
        stateId: observation.stateId,
        stateDigest: observation.stateDigest,
        physicalDigest: observation.physicalDigest,
        step: observation.step,
        timePicoseconds: observation.timePicoseconds,
      });
      expect(frame.sourceBindingDigest).toBe(digestValue(frame.sourceBinding));
      expect(frame.atoms.map((atom) => atom.id)).toEqual(
        observation.atoms.map((atom) => atom.id),
      );
      for (const [atomIndex, frameAtom] of frame.atoms.entries()) {
        const sourceAtom = observation.atoms[atomIndex];
        expect(frameAtom).toMatchObject({
          id: sourceAtom.id,
          element: sourceAtom.element,
          massDalton: sourceAtom.massDalton,
          chargeE: sourceAtom.chargeE,
          wrappedFractional: sourceAtom.position.wrappedFractional,
          image: sourceAtom.position.image,
          wrappedPositionAngstrom: sourceAtom.wrappedPositionAngstrom,
          unwrappedPositionAngstrom: sourceAtom.unwrappedPositionAngstrom,
          velocityAngstromPerPicosecond: sourceAtom.velocityAngstromPerPicosecond,
          forceKjMolAngstrom: sourceAtom.forceKjMolAngstrom,
        });
        expect(frameAtom.forceComponentsKjMolAngstrom).toEqual(
          observation.forceField.forceComponentsByAtomIdKjMolAngstrom[sourceAtom.id],
        );
      }
      expect(frame.lennardJonesPairs.map((pair) => pair.id)).toEqual(
        observation.forceField.lennardJonesInteractions.map((pair) => pair.id),
      );
      const { renderDigest, ...framePayload } = frame;
      expect(renderDigest).toBe(digestValue(framePayload));
    }
  });

  it('binds every sample, the ordered trajectory, the replay receipt, and the full bundle digest', () => {
    for (const sample of trajectory.samples) {
      const { sampleDigest, ...samplePayload } = sample;
      expect(sampleDigest).toBe(digestValue(samplePayload));
    }
    expect(trajectory.sampleDigests).toEqual(
      trajectory.samples.map((sample) => sample.sampleDigest),
    );
    expect(trajectory.trajectoryDigest).toBe(digestValue({
      binding: 'ordered-exact-solver-endpoint-sample-digests-v1',
      topologyDigest: trajectory.topologyDigest,
      configurationDigest: trajectory.configurationDigest,
      sampleDigests: trajectory.sampleDigests,
    }));

    const determinism = trajectory.determinism;
    expect(determinism).toMatchObject({
      evidenceClass: 'independent-full-accepted-prefix-replay',
      primaryAcceptedSteps: 10,
      replayAcceptedSteps: 10,
      comparedSampleCount: 11,
      primaryTrajectoryDigest: trajectory.trajectoryDigest,
      replayTrajectoryDigest: trajectory.trajectoryDigest,
      replaySampleDigests: trajectory.sampleDigests,
      exactSampleDigestEquality: true,
    });
    expect(determinism.replaySampleDigests).toEqual(trajectory.sampleDigests);
    const { receiptDigest, ...determinismPayload } = determinism;
    expect(receiptDigest).toBe(digestValue(determinismPayload));

    const { bundleDigest, ...bundlePayload } = trajectory;
    expect(bundleDigest).toBe(digestValue(bundlePayload));
  });

  it('closes primary and independent-replay work to the exact per-observation receipts', () => {
    const integrationWorkUnits = trajectory.samples.reduce(
      (sum, sample) => sum + sample.observation.integration.lastStepWorkUnitsConsumed,
      0,
    );
    const observationForceAuditWorkUnits = trajectory.samples.reduce(
      (sum, sample) => sum + sample.observation.forceField.workReceipt.totalWorkUnitsConsumed,
      0,
    );
    const observationConstraintRankAuditWorkUnits = trajectory.samples.reduce(
      (sum, sample) => sum + sample.observation.constraints.rankWorkUnitsConsumed,
      0,
    );
    const totalReceiptedWorkUnits = integrationWorkUnits
      + observationForceAuditWorkUnits
      + observationConstraintRankAuditWorkUnits;

    expect(trajectory.workReceipt).toEqual({
      acceptedIntegrationCount: 10,
      observationCount: 11,
      integrationWorkUnits,
      observationForceAuditWorkUnits,
      observationConstraintRankAuditWorkUnits,
      totalReceiptedWorkUnits,
    });
    expect(trajectory.determinism.replayReceiptedWorkUnits).toBe(totalReceiptedWorkUnits);
  });

  it('keeps all presentation cadence, cursor, and interpolation state outside the physical bundle', () => {
    expect(trajectory.presentation).toEqual({
      selectedSampleIndex: null,
      presentationFramesPerSecond: null,
      rendererInterpolation: null,
      boundary: 'presentation-state-is-external-and-cannot-change-solver-or-trajectory-digests',
    });
  });

  it('is deterministic for the same accepted-step input', () => {
    const first = createAqueousDynamicsRenderTrajectoryV043(10);
    const second = createAqueousDynamicsRenderTrajectoryV043(10);
    expect(second).toEqual(first);
    expect(second.sampleDigests).toEqual(first.sampleDigests);
    expect(second.trajectoryDigest).toBe(first.trajectoryDigest);
    expect(second.bundleDigest).toBe(first.bundleDigest);
  });

  it.each([
    ['zero', 0],
    ['shorter than the locked prefix', 2],
    ['longer than the locked prefix', 11],
    ['non-integer', 1.5],
  ] as const)('rejects %s acceptedSteps before execution', (_label, acceptedSteps) => {
    expect(() => createAqueousDynamicsRenderTrajectoryV043(acceptedSteps))
      .toThrow(/acceptedSteps must equal the locked 0–10 prefix/);
  });

  it('rejects nested source tampering after the attacker recomputes the outer bundle digest', () => {
    const forged = cloneTrajectory(trajectory);
    const samples = forged.samples as Array<Mutable<AqueousDynamicsRenderTrajectorySampleV043>>;
    const observation = samples[3].observation as Mutable<typeof samples[3]['observation']>;
    const atoms = observation.atoms as Array<Mutable<typeof observation.atoms[number]>>;
    const position = atoms[0].position as Mutable<typeof atoms[0]['position']>;
    const wrappedFractional = position.wrappedFractional as Mutable<typeof position.wrappedFractional>;
    wrappedFractional.x += 1e-6;
    rebindOuterBundleDigest(forged);
    deepFreezeFixture(forged);

    const { bundleDigest, ...payload } = forged;
    expect(bundleDigest).toBe(digestValue(payload));
    expect(() => assertAqueousDynamicsRenderTrajectoryV043(forged))
      .toThrow(/wrappedFractional\.x primitive value is not exact/);
  });

  it('requires local execution branding, then brands an exact frozen clone only after full replay', () => {
    expect(requireLocallyExecutedAqueousDynamicsRenderTrajectoryV043(trajectory)).toBe(trajectory);
    expect(getLocallyExecutedAqueousDynamicsRenderTrajectorySampleV043(trajectory, 10))
      .toBe(trajectory.samples[10]);

    const unbranded = deepFreezeFixture(structuredClone(trajectory));
    expect(() => requireLocallyExecutedAqueousDynamicsRenderTrajectoryV043(unbranded))
      .toThrow(/created or independently replay-validated locally/);
    expect(() => getLocallyExecutedAqueousDynamicsRenderTrajectorySampleV043(unbranded, 0))
      .toThrow(/created or independently replay-validated locally/);

    assertAqueousDynamicsRenderTrajectoryV043(unbranded);
    expect(requireLocallyExecutedAqueousDynamicsRenderTrajectoryV043(unbranded)).toBe(unbranded);
    expect(getLocallyExecutedAqueousDynamicsRenderTrajectorySampleV043(unbranded, 10))
      .toBe(unbranded.samples[10]);
  });

  it('is deeply frozen and rejects mutable candidates before replay validation', () => {
    expectDeepFrozenPlainDataTree(trajectory);
    const mutable = structuredClone(trajectory);
    expect(() => assertAqueousDynamicsRenderTrajectoryV043(mutable))
      .toThrow(/must be a frozen plain data record/);
  });

  it('does not execute top-level or nested accessors while rejecting untrusted candidates', () => {
    let topLevelGetterReads = 0;
    const topLevelDescriptors = Object.getOwnPropertyDescriptors(trajectory) as Record<
      string,
      PropertyDescriptor
    >;
    topLevelDescriptors.execution = {
      configurable: false,
      enumerable: true,
      get() {
        topLevelGetterReads += 1;
        return trajectory.execution;
      },
    };
    const topLevelAccessor = Object.freeze(Object.create(Object.prototype, topLevelDescriptors));
    expect(() => assertAqueousDynamicsRenderTrajectoryV043(topLevelAccessor))
      .toThrow(/execution must be an own data property/);
    expect(topLevelGetterReads).toBe(0);

    let acceptedStepGetterReads = 0;
    const executionDescriptors = Object.getOwnPropertyDescriptors(trajectory.execution) as Record<
      string,
      PropertyDescriptor
    >;
    executionDescriptors.acceptedStepsExecuted = {
      configurable: false,
      enumerable: true,
      get() {
        acceptedStepGetterReads += 1;
        return 10;
      },
    };
    const accessorExecution = Object.freeze(Object.create(Object.prototype, executionDescriptors));
    const nestedDescriptors = Object.getOwnPropertyDescriptors(trajectory) as Record<
      string,
      PropertyDescriptor
    >;
    nestedDescriptors.execution = {
      configurable: false,
      enumerable: true,
      writable: false,
      value: accessorExecution,
    };
    const nestedAccessor = Object.freeze(Object.create(Object.prototype, nestedDescriptors));
    expect(() => assertAqueousDynamicsRenderTrajectoryV043(nestedAccessor))
      .toThrow(/accepted step count must be an own integer data property/);
    expect(acceptedStepGetterReads).toBe(0);

    let unbrandedSampleGetterReads = 0;
    const unbrandedAccessor = Object.freeze(Object.defineProperty({}, 'samples', {
      configurable: false,
      enumerable: true,
      get() {
        unbrandedSampleGetterReads += 1;
        return trajectory.samples;
      },
    }));
    expect(() => getLocallyExecutedAqueousDynamicsRenderTrajectorySampleV043(
      unbrandedAccessor,
      0,
    )).toThrow(/created or independently replay-validated locally/);
    expect(unbrandedSampleGetterReads).toBe(0);
  });

  it.each([-1, 11, 1.5])('rejects invalid locally executed sample index %s', (sampleIndex) => {
    expect(() => getLocallyExecutedAqueousDynamicsRenderTrajectorySampleV043(
      trajectory,
      sampleIndex,
    )).toThrow(/sample index is outside the executed endpoint range/);
  });
});

function cloneTrajectory(value: AqueousDynamicsRenderTrajectoryV043) {
  return structuredClone(value) as Mutable<AqueousDynamicsRenderTrajectoryV043>;
}

function rebindOuterBundleDigest(trajectoryValue: Mutable<AqueousDynamicsRenderTrajectoryV043>) {
  const { bundleDigest: ignoredBundleDigest, ...payload } = trajectoryValue;
  void ignoredBundleDigest;
  trajectoryValue.bundleDigest = digestValue(payload);
}

function deepFreezeFixture<Value>(value: Value): Value {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
      if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
        deepFreezeFixture(descriptor.value);
      }
    }
  }
  return value;
}

function expectDeepFrozenPlainDataTree(value: unknown, seen = new Set<object>()): void {
  if (!value || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  expect(Object.isFrozen(value)).toBe(true);
  const isArray = Array.isArray(value);
  const prototype = Object.getPrototypeOf(value);
  expect(isArray ? prototype === Array.prototype : prototype === Object.prototype || prototype === null)
    .toBe(true);
  for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
    expect(Object.prototype.hasOwnProperty.call(descriptor, 'value')).toBe(true);
    if (Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      expectDeepFrozenPlainDataTree(descriptor.value, seen);
    }
  }
}
