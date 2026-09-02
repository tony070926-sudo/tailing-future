import { beforeAll, describe, expect, it } from 'vitest';
import {
  AQUEOUS_DYNAMICS_LONG_VERIFICATION_CHECKPOINT_INTERVAL_V042,
  AQUEOUS_DYNAMICS_LONG_VERIFICATION_GATE_NAMES_V042,
  AQUEOUS_DYNAMICS_LONG_VERIFICATION_PREFIX_REPLAY_STEPS_V042,
  AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042,
  assertAqueousDynamicsLongVerificationV042,
  runAqueousDynamicsLongVerificationV042,
  type AqueousDynamicsLongVerificationReportV042,
} from './aqueous-dynamics-long-verification.ts';
import { createNaClTip3pFiniteSizeCalibrationWorldV042 } from './aqueous-dynamics-world.ts';
import { digestValue } from './digest.ts';

let syntheticAssertionFixture: AqueousDynamicsLongVerificationReportV042 | undefined;

function getSyntheticAssertionFixture() {
  syntheticAssertionFixture ??= createSyntheticAssertionFixture();
  return syntheticAssertionFixture;
}

describe('fast forged-report assertion corpus', () => {
  it('accepts a structurally self-consistent synthetic fixture only as non-execution evidence', () => {
    const synthetic = getSyntheticAssertionFixture();
    expect(() => assertAqueousDynamicsLongVerificationV042(synthetic)).not.toThrow();
    expect(synthetic.evidenceSemantics.selfDigestExecutionProof).toBe(false);
    expect(synthetic.evidenceSemantics.ciExecutionTruthAuthority).toBe('release-artifact-guard');
  });

  it('rejects consistently rehashed threshold relaxation', () => {
    const relaxed = structuredClone(getSyntheticAssertionFixture());
    (relaxed.thresholds as { maximumRelativeEnergyExcursion: number })
      .maximumRelativeEnergyExcursion = 1;
    rebindSyntheticReport(relaxed);
    expect(() => assertAqueousDynamicsLongVerificationV042(relaxed))
      .toThrow(/locked threshold/);
  });

  it('rejects consistently rehashed gate rewriting', () => {
    const gateRewrite = structuredClone(getSyntheticAssertionFixture());
    (gateRewrite.gates as Record<string, boolean>).energyExcursion = false;
    rebindSyntheticReport(gateRewrite);
    expect(() => assertAqueousDynamicsLongVerificationV042(gateRewrite))
      .toThrow(/gate energyExcursion mismatch/);
  });

  it('rejects rehashed inconsistent energy statistics', () => {
    const statistics = structuredClone(getSyntheticAssertionFixture());
    (statistics.longRunReceipt.energy.statistics as { energySumKjMol: number }).energySumKjMol += 1;
    rebindSyntheticReport(statistics);
    expect(() => assertAqueousDynamicsLongVerificationV042(statistics))
      .toThrow(/audit-derived energy/);
  });

  it('rejects a duplicate sample digest after consistent parent rehashing', () => {
    const duplicate = structuredClone(getSyntheticAssertionFixture());
    const duplicateDigests = duplicate.longRunReceipt.trajectory.sampleDigests as string[];
    duplicateDigests[2] = duplicateDigests[1];
    rebindSyntheticReport(duplicate);
    expect(() => assertAqueousDynamicsLongVerificationV042(duplicate))
      .toThrow(/invalid or repeated/);
  });

  it('rejects a non-digest sample binding after consistent parent rehashing', () => {
    const nonDigest = structuredClone(getSyntheticAssertionFixture());
    (nonDigest.longRunReceipt.trajectory.sampleDigests as string[])[2] = 'not-a-digest';
    rebindSyntheticReport(nonDigest);
    expect(() => assertAqueousDynamicsLongVerificationV042(nonDigest))
      .toThrow(/canonical SHA-256/);
  });

  it('rejects a rehashed wrong checkpoint index', () => {
    const checkpoint = structuredClone(getSyntheticAssertionFixture());
    (checkpoint.longRunReceipt.trajectory.checkpoints[3] as { step: number }).step = 999;
    rebindSyntheticReport(checkpoint);
    expect(() => assertAqueousDynamicsLongVerificationV042(checkpoint))
      .toThrow(/trajectory or checkpoint/);
  });

  it('rejects negative per-sample integration work', () => {
    const negative = structuredClone(getSyntheticAssertionFixture());
    const auditSample = negative.longRunReceipt.trajectory.auditSamples[1] as unknown as number[];
    auditSample[12] = -1;
    const sampleDigests = negative.longRunReceipt.trajectory.sampleDigests as string[];
    sampleDigests[1] = digestValue(auditSample);
    rebindSyntheticReport(negative);
    expect(() => assertAqueousDynamicsLongVerificationV042(negative))
      .toThrow(/nonnegative safe integer/);
  });

  it('rejects zero per-sample integration work after step zero', () => {
    const zero = structuredClone(getSyntheticAssertionFixture());
    const auditSample = zero.longRunReceipt.trajectory.auditSamples[1] as unknown as number[];
    auditSample[12] = 0;
    (zero.longRunReceipt.trajectory.sampleDigests as string[])[1] = digestValue(auditSample);
    rebindSyntheticReport(zero);
    expect(() => assertAqueousDynamicsLongVerificationV042(zero))
      .toThrow(/work evidence is not positive/);
  });

  it('rejects a negative audit time even after all containing digests are refreshed', () => {
    const negativeTime = structuredClone(getSyntheticAssertionFixture());
    const auditSample = (
      negativeTime.longRunReceipt.trajectory.auditSamples[1]
    ) as unknown as number[];
    auditSample[1] = -0.001;
    (negativeTime.longRunReceipt.trajectory.sampleDigests as string[])[1]
      = digestValue(auditSample);
    rebindSyntheticReport(negativeTime);
    expect(() => assertAqueousDynamicsLongVerificationV042(negativeTime))
      .toThrow(/time namespace mismatch/);
  });

  it('rejects finite Number.MAX_VALUE evidence that overflows derived statistics', () => {
    const maximum = structuredClone(getSyntheticAssertionFixture());
    const auditSample = maximum.longRunReceipt.trajectory.auditSamples[1] as unknown as number[];
    auditSample[2] = Number.MAX_VALUE;
    (maximum.longRunReceipt.trajectory.sampleDigests as string[])[1] = digestValue(auditSample);
    rebindSyntheticReport(maximum);
    expect(() => assertAqueousDynamicsLongVerificationV042(maximum))
      .toThrow(/non-finite|finite|drift/);
  });

  it('rejects claim rewriting after consistent outer rehashing', () => {
    const claim = structuredClone(getSyntheticAssertionFixture());
    (claim.claimBoundaries as { bulkClaim: boolean }).bulkClaim = true;
    rebindSyntheticReport(claim);
    expect(() => assertAqueousDynamicsLongVerificationV042(claim))
      .toThrow(/canonical boundary/);
  });

  it('rejects a forged deterministic prefix despite a refreshed receipt', () => {
    const determinism = structuredClone(getSyntheticAssertionFixture());
    const forgedPrefixDigest = digestValue('forged-prefix');
    (determinism.determinism as { primaryPrefixDigest: string }).primaryPrefixDigest
      = forgedPrefixDigest;
    (determinism.determinism as { replayPrefixDigest: string }).replayPrefixDigest
      = forgedPrefixDigest;
    rebindSyntheticReport(determinism);
    expect(() => assertAqueousDynamicsLongVerificationV042(determinism))
      .toThrow(/short prefix replay/);
  });

  it('rejects rehashed replay work that disagrees with the primary prefix', () => {
    const replayWork = structuredClone(getSyntheticAssertionFixture());
    const replaySample = replayWork.determinism.replayWorkSamples[1] as unknown as number[];
    replaySample[1] += 1;
    (replayWork.determinism as { replayReceiptedWorkUnits: number })
      .replayReceiptedWorkUnits += 1;
    rebindSyntheticReport(replayWork);
    expect(() => assertAqueousDynamicsLongVerificationV042(replayWork))
      .toThrow(/short prefix replay work sample/);
  });

  it('rejects canonical boundary text rewriting after outer rehashing', () => {
    const boundary = structuredClone(getSyntheticAssertionFixture());
    (boundary.boundaries as string[])[0] = 'rewritten boundary';
    rebindSyntheticReport(boundary);
    expect(() => assertAqueousDynamicsLongVerificationV042(boundary))
      .toThrow(/boundaries canonical value/);
  });

  it('rejects a forged initial fixture digest against a fresh locked world', () => {
    const fixture = structuredClone(getSyntheticAssertionFixture());
    (fixture.fixture as { topologyDigest: string }).topologyDigest = digestValue('forged-topology');
    rebindSyntheticReport(fixture);
    expect(() => assertAqueousDynamicsLongVerificationV042(fixture))
      .toThrow(/fresh locked initial-world binding/);
  });

  it('rejects a top-level schemaVersion getter before reading it', () => {
    const getter = structuredClone(getSyntheticAssertionFixture());
    Object.defineProperty(getter, 'schemaVersion', {
      get: () => 'tf.aqueous-dynamics-long-verification/0.4.2',
      enumerable: true,
      configurable: true,
    });
    expect(() => assertAqueousDynamicsLongVerificationV042(getter))
      .toThrow(/enumerable data property/);
  });

  it('rejects a nonenumerable nested claim field', () => {
    const hidden = structuredClone(getSyntheticAssertionFixture());
    Object.defineProperty(hidden.claimBoundaries, 'hiddenClaim', {
      value: true,
      enumerable: false,
    });
    expect(() => assertAqueousDynamicsLongVerificationV042(hidden))
      .toThrow(/enumerable data property|keys mismatch/);
  });

  it('rejects an injected enumerable energy field after consistent rehashing', () => {
    const injected = structuredClone(getSyntheticAssertionFixture());
    (injected.longRunReceipt.energy as unknown as Record<string, unknown>).hiddenEnergy = 7;
    rebindSyntheticReport(injected);
    expect(() => assertAqueousDynamicsLongVerificationV042(injected))
      .toThrow(/energy keys mismatch/);
  });

  it('rejects a hidden field on a deep audit tuple', () => {
    const hidden = structuredClone(getSyntheticAssertionFixture());
    Object.defineProperty(hidden.longRunReceipt.trajectory.auditSamples[1], 'hidden', {
      value: 1,
      enumerable: false,
    });
    expect(() => assertAqueousDynamicsLongVerificationV042(hidden))
      .toThrow(/hidden, symbolic, sparse, or extra keys|non-index properties/);
  });

  it('rejects a symbol field on a deep maximum receipt', () => {
    const symbolic = structuredClone(getSyntheticAssertionFixture());
    Object.defineProperty(
      symbolic.longRunReceipt.workReceipt.maximumPerStepIntegrationWork,
      Symbol('forged'),
      { value: true, enumerable: true },
    );
    expect(() => assertAqueousDynamicsLongVerificationV042(symbolic))
      .toThrow(/symbol keys/);
  });

  it('rejects an accessor on a deep residual receipt', () => {
    const accessor = structuredClone(getSyntheticAssertionFixture());
    Object.defineProperty(
      accessor.longRunReceipt.maximumResiduals.momentumDaltonAngstromPerPicosecond,
      'value',
      { get: () => 1e-9, enumerable: true, configurable: true },
    );
    expect(() => assertAqueousDynamicsLongVerificationV042(accessor))
      .toThrow(/enumerable data property/);
  });

  it('rejects an illegal Lennard-Jones membership transition', () => {
    const illegal = structuredClone(getSyntheticAssertionFixture());
    const membership = illegal.longRunReceipt.lennardJonesCutoffMembership;
    (membership.events as unknown as Array<Record<string, unknown>>).push({
      step: 1,
      interactionId: membership.pairUniverseInteractionIds[0],
      transition: 'teleported',
    });
    rebindSyntheticReport(illegal);
    expect(() => assertAqueousDynamicsLongVerificationV042(illegal))
      .toThrow(/outside its namespace/);
  });

  it('rejects a later minimum step when equal-distance samples tie', () => {
    const tie = structuredClone(getSyntheticAssertionFixture());
    (tie.longRunReceipt.minimumNonexcludedPair as { step: number }).step = 1;
    rebindSyntheticReport(tie);
    expect(() => assertAqueousDynamicsLongVerificationV042(tie))
      .toThrow(/audit-derived energy, residual, or minimum-pair summary/);
  });
});

describe('v0.4.2 aqueous 10000-step long verification', () => {
  let report: AqueousDynamicsLongVerificationReportV042;
  const progress: number[] = [];

  beforeAll(() => {
    report = runAqueousDynamicsLongVerificationV042((acceptedSteps) => {
      progress.push(acceptedSteps);
      console.info(`[aqueous-long-verification] accepted ${acceptedSteps}/10000 steps`);
    });
    console.info('[aqueous-long-verification] evidence', JSON.stringify({
      verificationDigest: report.verificationDigest,
      trajectoryDigest: report.longRunReceipt.trajectory.trajectoryDigest,
      checkpointDigest: report.longRunReceipt.trajectory.checkpointDigest,
      auditEvidenceDigest: report.longRunReceipt.trajectory.auditEvidenceDigest,
      finalStateDigest: report.longRunReceipt.final.stateDigest,
      longRunReceiptDigest: report.longRunReceipt.receiptDigest,
      determinismReceiptDigest: report.determinism.receiptDigest,
      replayWorkEvidenceDigest: report.determinism.replayWorkEvidenceDigest,
      maximumRelativeEnergyExcursion: report.longRunReceipt.energy.maximumRelativeExcursion,
      maximumRelativeEnergyExcursionStep: report.longRunReceipt.energy.maximumRelativeExcursionStep,
      linearRelativeDriftRatePerPicosecond:
        report.longRunReceipt.energy.linearRelativeDriftRatePerPicosecond,
      maximumMomentumResidual:
        report.longRunReceipt.maximumResiduals.momentumDaltonAngstromPerPicosecond,
      maximumInternalForceResidual:
        report.longRunReceipt.maximumResiduals.internalForceKjMolAngstrom,
      maximumPositionConstraintResidual:
        report.longRunReceipt.maximumResiduals.positionConstraintAngstrom,
      maximumVelocityConstraintResidual:
        report.longRunReceipt.maximumResiduals.velocityConstraintAngstrom2PerPicosecond,
      minimumNonexcludedPair: report.longRunReceipt.minimumNonexcludedPair,
      lennardJonesCutoffTransitions:
        report.longRunReceipt.lennardJonesCutoffMembership.totalTransitionCount,
      totalReceiptedSolverAndObservationWorkUnits:
        report.longRunReceipt.workReceipt.totalReceiptedSolverAndObservationWorkUnits,
    }));
  }, 600_000);

  it('actually executes exactly 10000 accepted fixed-step NVE transitions', () => {
    expect(() => assertAqueousDynamicsLongVerificationV042(report)).not.toThrow();
    expect(report.fixture).toMatchObject({
      worldId: 'nacl-tip3p-finite-size-calibration',
      atomCount: 8,
      ensemble: 'NVE',
      fixedTimeStepPicoseconds: 0.001,
      fromStep: 0,
      acceptedStepsExecuted: AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042,
      toStep: AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042,
      finalTimePicoseconds: 10,
      energySampleCount: AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042 + 1,
    });
    expect(report.longRunReceipt.final.step).toBe(AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042);
    expect(report.longRunReceipt.energy.statistics.sampleCount)
      .toBe(AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042 + 1);
    expect(progress).toEqual(Array.from({ length: 10 }, (_, index) => (index + 1) * 1_000));
    expect(report.longRunReceipt.energy.maximumRelativeExcursion)
      .toBeLessThanOrEqual(report.thresholds.maximumRelativeEnergyExcursion);
    expect(report.longRunReceipt.energy.maximumRelativeExcursionStep).toBeGreaterThanOrEqual(0);
    expect(report.longRunReceipt.energy.maximumRelativeExcursionStep)
      .toBeLessThanOrEqual(AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042);
    expect(Number.isFinite(report.longRunReceipt.energy.linearDriftSlopeKjMolPerPicosecond))
      .toBe(true);
    expect(Number.isFinite(report.longRunReceipt.energy.linearRelativeDriftRatePerPicosecond))
      .toBe(true);
  });

  it('records trajectory-wide residual maxima and the exact minimum nonexcluded pair', () => {
    const residuals = report.longRunReceipt.maximumResiduals;
    expect(residuals.momentumDaltonAngstromPerPicosecond.value)
      .toBeLessThanOrEqual(report.thresholds.momentumResidualLimit);
    expect(residuals.internalForceKjMolAngstrom.value)
      .toBeLessThanOrEqual(report.thresholds.internalForceResidualLimitKjMolAngstrom);
    expect(residuals.positionConstraintAngstrom.value)
      .toBeLessThanOrEqual(report.thresholds.positionConstraintToleranceAngstrom);
    expect(residuals.velocityConstraintAngstrom2PerPicosecond.value)
      .toBeLessThanOrEqual(report.thresholds.velocityConstraintToleranceAngstrom2PerPicosecond);
    expect(residuals.massDalton.value).toBe(report.thresholds.massResidualLimitDalton);
    expect(residuals.chargeE.value).toBe(report.thresholds.chargeResidualLimitE);
    for (const receipt of Object.values(residuals)) {
      expect(receipt.step).toBeGreaterThanOrEqual(0);
      expect(receipt.step).toBeLessThanOrEqual(AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042);
    }
    const minimum = report.longRunReceipt.minimumNonexcludedPair;
    expect(minimum.distanceAngstrom)
      .toBeGreaterThanOrEqual(report.thresholds.minimumNonexcludedDistanceAngstrom);
    expect(minimum.atomAId).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(minimum.atomBId).toMatch(/^[A-Za-z0-9._-]+$/);
    expect(minimum.atomAId).not.toBe(minimum.atomBId);
    expect(minimum.step).toBeGreaterThanOrEqual(0);
    expect(minimum.step).toBeLessThanOrEqual(AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042);
  });

  it('accounts for endpoint-sampled strict-cutoff membership transitions without assuming a count', () => {
    const membership = report.longRunReceipt.lennardJonesCutoffMembership;
    expect(membership.sampling)
      .toBe('accepted-endpoint-strict-less-than-cutoff-membership-set');
    expect(membership.totalTransitionCount).toBe(membership.events.length);
    expect(membership.totalTransitionCount)
      .toBe(membership.enteredEventCount + membership.exitedEventCount);
    expect(membership.stepsWithTransitions)
      .toBe(new Set(membership.events.map((event) => event.step)).size);
    expect(membership.eventDigest).toBe(digestValue(membership.events));
    for (const event of membership.events) {
      expect(event.step).toBeGreaterThanOrEqual(1);
      expect(event.step).toBeLessThanOrEqual(AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042);
      expect(['entered-strict-cutoff', 'exited-strict-cutoff']).toContain(event.transition);
    }
  });

  it('separates solver, endpoint-rank, and observation audit work without double counting', () => {
    const work = report.longRunReceipt.workReceipt;
    const audits = report.longRunReceipt.trajectory.auditSamples;
    expect(work).toMatchObject({
      acceptedIntegrationCount: AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042,
      observationAuditCount: AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042 + 1,
    });
    expect(work.integrationReceiptedWorkUnits).toBe(
      work.solverIntegratorWorkUnits + work.composerEndpointRankAuditWorkUnits,
    );
    expect(work.observationAuditWorkUnits).toBe(
      work.observationForceAuditWorkUnits + work.observationRankAuditWorkUnits,
    );
    expect(work.totalReceiptedSolverAndObservationWorkUnits).toBe(
      work.integrationReceiptedWorkUnits + work.observationAuditWorkUnits,
    );
    expect(work.maximumPerStepIntegrationWork.value)
      .toBeLessThanOrEqual(report.thresholds.maximumStepWorkUnits);
    expect(work.maximumPerObservationForceAuditWork.value)
      .toBeLessThanOrEqual(report.thresholds.maximumForceEvaluationWorkUnits);
    expect(work.maximumPerObservationRankAuditWork.value)
      .toBeLessThanOrEqual(report.thresholds.maximumConstraintJacobianRankWorkUnits);
    expect(work.accountingBoundary.some((entry) => entry.includes('excluded'))).toBe(true);
    expect(work.workReceiptDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(audits).toHaveLength(AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042 + 1);
    expect(audits[0].slice(12, 16)).toEqual([
      0,
      0,
      audits[0][14],
      audits[0][15],
    ]);
    expect(audits.slice(1).every((sample) => (
      sample[12] > 0 && sample[13] > 0 && sample[14] > 0 && sample[15] > 0
    ))).toBe(true);
    expect(work.perSampleAuditEvidenceDigest)
      .toBe(report.longRunReceipt.trajectory.auditEvidenceDigest);
  });

  it('binds every endpoint sample, the checkpoint schedule, and final state identities', () => {
    const trajectory = report.longRunReceipt.trajectory;
    expect(trajectory.sampleCount).toBe(AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042 + 1);
    expect(trajectory.sampleDigests).toHaveLength(AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042 + 1);
    expect(trajectory.sampleDigests.every((digest) => /^sha256:[0-9a-f]{64}$/.test(digest)))
      .toBe(true);
    expect(trajectory.trajectoryDigest).toBe(digestValue({
      algorithm: 'canonical-sha256-sample-list-v1',
      sampleDigests: trajectory.sampleDigests,
    }));
    const expectedCheckpointSteps = [
      0,
      1,
      AQUEOUS_DYNAMICS_LONG_VERIFICATION_PREFIX_REPLAY_STEPS_V042,
      ...Array.from(
        { length: AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042
          / AQUEOUS_DYNAMICS_LONG_VERIFICATION_CHECKPOINT_INTERVAL_V042 },
        (_, index) => (index + 1) * AQUEOUS_DYNAMICS_LONG_VERIFICATION_CHECKPOINT_INTERVAL_V042,
      ),
    ];
    expect(trajectory.checkpoints.map((entry) => entry.step)).toEqual(expectedCheckpointSteps);
    expect(trajectory.checkpointDigest).toBe(digestValue(trajectory.checkpoints));
    const last = trajectory.checkpoints.at(-1)!;
    expect(last).toMatchObject({
      step: report.longRunReceipt.final.step,
      stateDigest: report.longRunReceipt.final.stateDigest,
      physicalDigest: report.longRunReceipt.final.physicalDigest,
      observationDigest: report.longRunReceipt.final.observationDigest,
    });
    expect(last.sampleDigest).toBe(trajectory.sampleDigests.at(-1));
    for (const digest of [
      report.longRunReceipt.final.stateDigest,
      report.longRunReceipt.final.physicalDigest,
      report.longRunReceipt.final.observationDigest,
      report.longRunReceipt.final.finalIntegrationReceiptDigest,
      report.longRunReceipt.receiptDigest,
      report.verificationDigest,
    ]) expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('reports only the executed short replay and keeps scientific claim boundaries false', () => {
    expect(report.determinism).toMatchObject({
      evidenceClass: 'initial-plus-short-accepted-prefix-replay',
      primaryPrefixAcceptedSteps: AQUEOUS_DYNAMICS_LONG_VERIFICATION_PREFIX_REPLAY_STEPS_V042,
      replayPrefixAcceptedSteps: AQUEOUS_DYNAMICS_LONG_VERIFICATION_PREFIX_REPLAY_STEPS_V042,
      comparedSampleCount: AQUEOUS_DYNAMICS_LONG_VERIFICATION_PREFIX_REPLAY_STEPS_V042 + 1,
      exactSampleDigestEquality: true,
      fullTenThousandStepReplayPerformed: false,
    });
    expect(report.determinism.primaryPrefixDigest).toBe(report.determinism.replayPrefixDigest);
    expect(report.determinism.replaySampleDigests).toEqual(
      report.longRunReceipt.trajectory.sampleDigests.slice(0, 11),
    );
    expect(report.determinism.replayPrefixDigest)
      .toBe(digestValue(report.determinism.replaySampleDigests));
    expect(report.determinism.replayWorkColumns).toEqual([
      'step',
      'solverIntegratorWorkUnits',
      'composerEndpointRankAuditWorkUnits',
      'observationForceAuditWorkUnits',
      'observationRankAuditWorkUnits',
    ]);
    expect(report.determinism.replayWorkSamples).toHaveLength(11);
    expect(report.determinism.replayWorkSamples).toEqual(
      report.longRunReceipt.trajectory.auditSamples.slice(0, 11).map((sample) => [
        sample[0], sample[12], sample[13], sample[14], sample[15],
      ]),
    );
    expect(report.determinism.replayWorkEvidenceDigest).toBe(digestValue({
      columns: report.determinism.replayWorkColumns,
      samples: report.determinism.replayWorkSamples,
    }));
    expect(report.determinism.replayReceiptedWorkUnits).toBe(
      report.determinism.replayWorkSamples.reduce(
        (sum, sample) => sum + sample[1] + sample[2] + sample[3] + sample[4],
        0,
      ),
    );
    expect(report.claimBoundaries).toEqual({
      finiteSizeColdStartIntegrationCalibrationOnly: true,
      bulkClaim: false,
      diluteClaim: false,
      equilibratedClaim: false,
      externalEngineExecution: false,
      externalEngineReproduction: false,
      fullTenThousandStepReplayClaim: false,
      virialDerivedMechanicalObservableIncluded: false,
    });
    expect(report.evidenceSemantics).toEqual({
      selfDigestExecutionProof: false,
      selfDigestAuthenticityProof: false,
      ciExecutionTruthAuthority: 'release-artifact-guard',
      boundary: 'self-consistent-digests-do-not-prove-that-the-reported-execution-occurred',
    });
    expect(JSON.stringify(report))
      .not.toMatch(/"pressureBar"|"totalStress|"serializedStateEnvelopeDigest"/);
    for (const gate of AQUEOUS_DYNAMICS_LONG_VERIFICATION_GATE_NAMES_V042) {
      expect(report.gates[gate]).toBe(true);
    }
    expectDeepFrozen(report);
  });

  it('rejects outer tampering and nested work tampering after refreshed parent digests', () => {
    const outerTamper = structuredClone(report);
    (outerTamper.longRunReceipt.energy as { maximumRelativeExcursion: number })
      .maximumRelativeExcursion += 1e-5;
    expect(() => assertAqueousDynamicsLongVerificationV042(outerTamper))
      .toThrow('evidence digest mismatch');

    const workTamper = structuredClone(report);
    (workTamper.longRunReceipt.workReceipt as { solverIntegratorWorkUnits: number })
      .solverIntegratorWorkUnits += 1;
    refreshLongReceiptDigest(workTamper);
    refreshOuterDigest(workTamper);
    expect(() => assertAqueousDynamicsLongVerificationV042(workTamper))
      .toThrow('long work receipt digest mismatch');
  });
});

type SyntheticAuditSample = AqueousDynamicsLongVerificationReportV042[
  'longRunReceipt'
]['trajectory']['auditSamples'][number];

const SYNTHETIC_AUDIT_COLUMNS = [
  'step',
  'timePicoseconds',
  'totalEnergyKjMol',
  'momentumResidual',
  'internalForceResidualKjMolAngstrom',
  'positionConstraintResidualAngstrom',
  'velocityConstraintResidualAngstrom2PerPicosecond',
  'massResidualDalton',
  'chargeResidualE',
  'minimumNonexcludedDistanceAngstrom',
  'minimumPairAtomAId',
  'minimumPairAtomBId',
  'solverIntegratorWorkUnits',
  'composerEndpointRankAuditWorkUnits',
  'observationForceAuditWorkUnits',
  'observationRankAuditWorkUnits',
  'stateDigest',
  'physicalDigest',
  'observationDigest',
  'integrationReceiptDigest',
  'forceFieldEvaluationDigest',
  'lennardJonesMembershipDigest',
] as const;

const SYNTHETIC_BOUNDARIES = [
  'This is one deterministic 10000-step run of the locked eight-atom finite-size cold-start integration fixture.',
  'It is not bulk, dilute, equilibrated, statistically representative, or an external-engine reproduction.',
  'Cutoff transitions count accepted endpoint membership-set changes and do not claim continuous within-step crossing counts.',
  'The total receipted work covers published solver, endpoint-rank, observation-force, and observation-rank work units only.',
  'World construction checks, verifier bookkeeping, digest hashing, pair scans, and wall-clock cost have no published kernel work units and are excluded.',
  'The short replay validates the replay mechanism for steps 0 through 10; a full independent 10000-step replay remains explicitly unexecuted.',
  'No virial-derived mechanical observable is included.',
  'SHA-256 digests bind local deterministic payloads; they are not signatures or authenticity evidence.',
  'A self-consistent report does not prove execution; CI execution truth must be established by the release artifact guard.',
] as const;

const SYNTHETIC_ACCOUNTING_BOUNDARY = [
  'solverIntegratorWorkUnits and composerEndpointRankAuditWorkUnits are disjoint fields whose sum is the published per-step integration total',
  'observation force and rank audits are separately receipted and are not included in the integration total',
  'constructor validation, verifier analysis, digest hashing, pair scans, and wall-clock time are excluded because no kernel work units are published for them',
] as const;

function createSyntheticAssertionFixture(): AqueousDynamicsLongVerificationReportV042 {
  const freshWorld = createNaClTip3pFiniteSizeCalibrationWorldV042();
  const freshState = freshWorld.serialize();
  const freshInitial = freshWorld.observe();
  const atomIds = [...freshInitial.forceField.atomOrder];
  const pairUniverseInteractionIds: string[] = [];
  for (let left = 0; left < atomIds.length; left += 1) {
    for (let right = left + 1; right < atomIds.length; right += 1) {
      pairUniverseInteractionIds.push(`lj:${atomIds[left]}:${atomIds[right]}`);
    }
  }
  const initialMemberIds = freshInitial.forceField.lennardJonesInteractions
    .map((interaction) => interaction.id)
    .sort(compareAsciiForTest);
  const membershipDigest = digestValue(initialMemberIds);
  const auditSamples: SyntheticAuditSample[] = [];
  for (let step = 0; step <= AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042; step += 1) {
    auditSamples.push([
      step,
      step * 0.001,
      -10,
      1e-9,
      1e-11,
      1e-12,
      1e-12,
      0,
      0,
      2,
      'chloride-cl',
      'sodium-na',
      step === 0 ? 0 : 2,
      step === 0 ? 0 : 1,
      1,
      1,
      step === 0 ? freshInitial.stateDigest : digestValue({ kind: 'synthetic-state', step }),
      step === 0 ? freshInitial.physicalDigest : digestValue({ kind: 'synthetic-physical', step }),
      step === 0
        ? freshInitial.observationDigest
        : digestValue({ kind: 'synthetic-observation', step }),
      step === 0 ? null : digestValue({ kind: 'synthetic-integration', step }),
      step === 0
        ? freshInitial.forceField.evaluationDigest
        : digestValue({ kind: 'synthetic-force-field', step }),
      membershipDigest,
    ]);
  }
  const sampleDigests = auditSamples.map((sample) => digestValue(sample));
  let timeSumPicoseconds = 0;
  let energySumKjMol = 0;
  let timeSquaredSumPicoseconds2 = 0;
  let timeEnergySumKjMolPicoseconds = 0;
  for (const sample of auditSamples) {
    timeSumPicoseconds += sample[1];
    energySumKjMol += sample[2];
    timeSquaredSumPicoseconds2 += sample[1] ** 2;
    timeEnergySumKjMolPicoseconds += sample[1] * sample[2];
  }
  const statisticsBase = {
    sampleCount: 10_001,
    timeSumPicoseconds,
    energySumKjMol,
    timeSquaredSumPicoseconds2,
    timeEnergySumKjMolPicoseconds,
    maximumAbsoluteExcursionKjMol: 0,
    maximumAbsoluteExcursionStep: 0,
  };
  const linearDriftSlopeKjMolPerPicosecond = syntheticEnergyDriftSlope(statisticsBase);
  const statistics = {
    ...statisticsBase,
    maximumRelativeExcursion: 0,
    maximumRelativeExcursionStep: 0,
    linearDriftSlopeKjMolPerPicosecond,
    linearRelativeDriftRatePerPicosecond: linearDriftSlopeKjMolPerPicosecond / 10,
  };
  const auditEvidenceDigest = digestValue({
    columns: SYNTHETIC_AUDIT_COLUMNS,
    samples: auditSamples,
  });
  const checkpointSteps = [
    0,
    1,
    10,
    ...Array.from({ length: 10 }, (_, index) => (index + 1) * 1_000),
  ];
  const checkpoints = checkpointSteps.map((step) => ({
    step,
    timePicoseconds: step * 0.001,
    stateDigest: auditSamples[step][16],
    physicalDigest: auditSamples[step][17],
    observationDigest: auditSamples[step][18],
    integrationReceiptDigest: auditSamples[step][19],
    sampleDigest: sampleDigests[step],
  }));
  const trajectory = {
    sampleCount: 10_001,
    sampleBinding: 'state-physical-observation-integration-energy-residual-membership-and-work-v1',
    auditColumns: [...SYNTHETIC_AUDIT_COLUMNS],
    auditSamples,
    auditEvidenceDigest,
    sampleDigests,
    trajectoryDigest: digestValue({
      algorithm: 'canonical-sha256-sample-list-v1',
      sampleDigests,
    }),
    checkpointRule: 'steps-0-1-10-and-every-1000',
    checkpointCount: 13,
    checkpoints,
    checkpointDigest: digestValue(checkpoints),
  };
  const workPayload = {
    acceptedIntegrationCount: 10_000,
    observationAuditCount: 10_001,
    solverIntegratorWorkUnits: 20_000,
    composerEndpointRankAuditWorkUnits: 10_000,
    integrationReceiptedWorkUnits: 30_000,
    observationForceAuditWorkUnits: 10_001,
    observationRankAuditWorkUnits: 10_001,
    observationAuditWorkUnits: 20_002,
    totalReceiptedSolverAndObservationWorkUnits: 50_002,
    maximumPerStepIntegrationWork: { value: 3, step: 1 },
    maximumPerObservationForceAuditWork: { value: 1, step: 0 },
    maximumPerObservationRankAuditWork: { value: 1, step: 0 },
    perSampleAuditEvidenceDigest: auditEvidenceDigest,
    accountingBoundary: [...SYNTHETIC_ACCOUNTING_BOUNDARY],
  };
  const workReceipt = {
    ...workPayload,
    workReceiptDigest: digestValue(workPayload),
  };
  const membershipEvents: Array<{
    step: number;
    interactionId: string;
    transition: 'entered-strict-cutoff' | 'exited-strict-cutoff';
  }> = [];
  const lennardJonesCutoffMembership = {
    cutoffAngstrom: 10,
    sampling: 'accepted-endpoint-strict-less-than-cutoff-membership-set',
    atomIds,
    pairUniverseInteractionIds,
    initialMemberIds,
    finalMemberIds: [...initialMemberIds],
    initialMemberCount: initialMemberIds.length,
    finalMemberCount: initialMemberIds.length,
    enteredEventCount: 0,
    exitedEventCount: 0,
    totalTransitionCount: 0,
    stepsWithTransitions: 0,
    events: membershipEvents,
    eventDigest: digestValue(membershipEvents),
  };
  const finalSample = auditSamples.at(-1)!;
  const longPayload = {
    energy: {
      initialTotalKjMol: -10,
      finalTotalKjMol: -10,
      energyReferenceKjMol: 10,
      maximumAbsoluteExcursionKjMol: 0,
      maximumAbsoluteExcursionStep: 0,
      maximumRelativeExcursion: 0,
      maximumRelativeExcursionStep: 0,
      linearDriftSlopeKjMolPerPicosecond,
      linearRelativeDriftRatePerPicosecond: linearDriftSlopeKjMolPerPicosecond / 10,
      statistics,
    },
    maximumResiduals: {
      momentumDaltonAngstromPerPicosecond: { value: 1e-9, step: 0 },
      internalForceKjMolAngstrom: { value: 1e-11, step: 0 },
      positionConstraintAngstrom: { value: 1e-12, step: 0 },
      velocityConstraintAngstrom2PerPicosecond: { value: 1e-12, step: 0 },
      massDalton: { value: 0, step: 0 },
      chargeE: { value: 0, step: 0 },
    },
    minimumNonexcludedPair: {
      distanceAngstrom: 2,
      atomAId: 'chloride-cl',
      atomBId: 'sodium-na',
      step: 0,
    },
    lennardJonesCutoffMembership,
    workReceipt,
    final: {
      step: 10_000,
      stateDigest: finalSample[16],
      physicalDigest: finalSample[17],
      observationDigest: finalSample[18],
      finalIntegrationReceiptDigest: finalSample[19],
    },
    trajectory,
  };
  const longRunReceipt = {
    ...longPayload,
    receiptDigest: digestValue(longPayload),
  };
  const replaySampleDigests = sampleDigests.slice(0, 11);
  const primaryPrefixDigest = digestValue(replaySampleDigests);
  const replayWorkColumns = [
    'step',
    'solverIntegratorWorkUnits',
    'composerEndpointRankAuditWorkUnits',
    'observationForceAuditWorkUnits',
    'observationRankAuditWorkUnits',
  ] as const;
  const replayWorkSamples = auditSamples.slice(0, 11).map((sample) => [
    sample[0],
    sample[12],
    sample[13],
    sample[14],
    sample[15],
  ] as const);
  const determinismPayload = {
    evidenceClass: 'initial-plus-short-accepted-prefix-replay',
    primaryPrefixAcceptedSteps: 10,
    replayPrefixAcceptedSteps: 10,
    comparedSampleCount: 11,
    primaryPrefixDigest,
    replayPrefixDigest: primaryPrefixDigest,
    replaySampleDigests,
    replayWorkColumns,
    replayWorkSamples,
    replayWorkEvidenceDigest: digestValue({
      columns: replayWorkColumns,
      samples: replayWorkSamples,
    }),
    exactSampleDigestEquality: true,
    fullTenThousandStepReplayPerformed: false,
    futureFullReplayBoundary:
      'a-second-independent-10000-step-run-must-match-all-sample-final-and-checkpoint-digests-before-claiming-full-replay',
    replayReceiptedWorkUnits: replayWorkSamples.reduce(
      (sum, sample) => sum + sample[1] + sample[2] + sample[3] + sample[4],
      0,
    ),
  };
  const determinism = {
    ...determinismPayload,
    receiptDigest: digestValue(determinismPayload),
  };
  const reportPayload = {
    schemaVersion: 'tf.aqueous-dynamics-long-verification/0.4.2',
    status: 'finite-size-cold-start-integration-calibration-only',
    fixture: {
      worldId: 'nacl-tip3p-finite-size-calibration',
      atomCount: 8,
      ensemble: 'NVE',
      fixedTimeStepPicoseconds: 0.001,
      fromStep: 0,
      acceptedStepsExecuted: 10_000,
      toStep: 10_000,
      finalTimePicoseconds: 10,
      energySampleCount: 10_001,
      topologyDigest: freshInitial.topologyDigest,
      configurationDigest: freshInitial.configurationDigest,
      initialStateDigest: freshState.stateDigest,
      initialObservationDigest: freshInitial.observationDigest,
    },
    thresholds: {
      maximumRelativeEnergyExcursion: 1e-3,
      momentumResidualLimit: 2e-8,
      internalForceResidualLimitKjMolAngstrom: 1e-10,
      positionConstraintToleranceAngstrom: 1e-10,
      velocityConstraintToleranceAngstrom2PerPicosecond: 1e-10,
      minimumNonexcludedDistanceAngstrom: 1.25,
      massResidualLimitDalton: 0,
      chargeResidualLimitE: 0,
      maximumForceEvaluationWorkUnits: 500_000,
      maximumConstraintJacobianRankWorkUnits: 1_000,
      maximumStepWorkUnits: 1_100_000,
    },
    longRunReceipt,
    determinism,
    evidenceSemantics: {
      selfDigestExecutionProof: false,
      selfDigestAuthenticityProof: false,
      ciExecutionTruthAuthority: 'release-artifact-guard',
      boundary: 'self-consistent-digests-do-not-prove-that-the-reported-execution-occurred',
    },
    gates: Object.fromEntries(
      AQUEOUS_DYNAMICS_LONG_VERIFICATION_GATE_NAMES_V042.map((name) => [name, true]),
    ),
    claimBoundaries: {
      finiteSizeColdStartIntegrationCalibrationOnly: true,
      bulkClaim: false,
      diluteClaim: false,
      equilibratedClaim: false,
      externalEngineExecution: false,
      externalEngineReproduction: false,
      fullTenThousandStepReplayClaim: false,
      virialDerivedMechanicalObservableIncluded: false,
    },
    boundaries: [...SYNTHETIC_BOUNDARIES],
  };
  return deepFreezeFixture({
    ...reportPayload,
    verificationDigest: digestValue(reportPayload),
  } as unknown as AqueousDynamicsLongVerificationReportV042);
}

function syntheticEnergyDriftSlope(statistics: Readonly<{
  sampleCount: number;
  timeSumPicoseconds: number;
  energySumKjMol: number;
  timeSquaredSumPicoseconds2: number;
  timeEnergySumKjMolPicoseconds: number;
}>) {
  const denominator = statistics.sampleCount * statistics.timeSquaredSumPicoseconds2
    - statistics.timeSumPicoseconds ** 2;
  const numerator = statistics.sampleCount * statistics.timeEnergySumKjMolPicoseconds
    - statistics.timeSumPicoseconds * statistics.energySumKjMol;
  const slope = numerator / denominator;
  return Object.is(slope, -0) ? 0 : slope;
}

function compareAsciiForTest(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function rebindSyntheticReport(report: AqueousDynamicsLongVerificationReportV042) {
  const membership = report.longRunReceipt.lennardJonesCutoffMembership;
  (membership as { eventDigest: string }).eventDigest = digestValue(membership.events);
  const trajectory = report.longRunReceipt.trajectory;
  const auditEvidenceDigest = digestValue({
    columns: trajectory.auditColumns,
    samples: trajectory.auditSamples,
  });
  (trajectory as { auditEvidenceDigest: string }).auditEvidenceDigest = auditEvidenceDigest;
  (trajectory as { trajectoryDigest: string }).trajectoryDigest = digestValue({
    algorithm: 'canonical-sha256-sample-list-v1',
    sampleDigests: trajectory.sampleDigests,
  });
  (trajectory as { checkpointDigest: string }).checkpointDigest = digestValue(
    trajectory.checkpoints,
  );
  const work = report.longRunReceipt.workReceipt;
  (work as { perSampleAuditEvidenceDigest: string }).perSampleAuditEvidenceDigest
    = auditEvidenceDigest;
  refreshEmbeddedDigest(work, 'workReceiptDigest');
  refreshLongReceiptDigest(report);
  const determinism = report.determinism;
  (determinism as { replayWorkEvidenceDigest: string }).replayWorkEvidenceDigest = digestValue({
    columns: determinism.replayWorkColumns,
    samples: determinism.replayWorkSamples,
  });
  refreshEmbeddedDigest(determinism, 'receiptDigest');
  refreshOuterDigest(report);
}

function refreshEmbeddedDigest(value: object, digestKey: string) {
  const record = value as Record<string, unknown>;
  const payload = { ...record };
  delete payload[digestKey];
  record[digestKey] = digestValue(payload);
}

function refreshLongReceiptDigest(report: AqueousDynamicsLongVerificationReportV042) {
  const { receiptDigest: _oldDigest, ...payload } = report.longRunReceipt;
  void _oldDigest;
  (report.longRunReceipt as { receiptDigest: string }).receiptDigest = digestValue(payload);
}

function refreshOuterDigest(report: AqueousDynamicsLongVerificationReportV042) {
  const { verificationDigest: _oldDigest, ...payload } = report;
  void _oldDigest;
  (report as { verificationDigest: string }).verificationDigest = digestValue(payload);
}

function expectDeepFrozen(value: unknown) {
  if (value && typeof value === 'object') {
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) expectDeepFrozen(child);
  }
}

function deepFreezeFixture<Value>(value: Value): Value {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreezeFixture(child);
  }
  return value;
}
