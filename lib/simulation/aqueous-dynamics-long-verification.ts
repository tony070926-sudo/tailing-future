import {
  AQUEOUS_DYNAMICS_TIME_STEP_PS_V042,
  createNaClTip3pFiniteSizeCalibrationWorldV042,
  type AqueousDynamicsObservationV042,
} from './aqueous-dynamics-world.ts';
import { digestValue } from './digest.ts';
import type { PeriodicCell } from './periodic-cell.ts';

/**
 * Long-horizon evidence for the locked eight-atom cold-start fixture. This is
 * a finite-size integration calibration, not a thermodynamic or equilibrium
 * study.
 */

export const AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042 = 10_000 as const;
export const AQUEOUS_DYNAMICS_LONG_VERIFICATION_PREFIX_REPLAY_STEPS_V042 = 10 as const;
export const AQUEOUS_DYNAMICS_LONG_VERIFICATION_CHECKPOINT_INTERVAL_V042 = 1_000 as const;

export const AQUEOUS_DYNAMICS_LONG_VERIFICATION_GATE_NAMES_V042 = Object.freeze([
  'acceptedStepHorizon',
  'energyStatisticsClosure',
  'energyExcursion',
  'momentumClosure',
  'internalForceClosure',
  'positionConstraintClosure',
  'velocityConstraintClosure',
  'massAndChargeClosure',
  'minimumNonexcludedDistance',
  'integrationWorkClosure',
  'observationAuditWorkClosure',
  'lennardJonesMembershipAccounting',
  'trajectoryAndCheckpointBinding',
  'deterministicPrefixReplay',
] as const);

export type AqueousDynamicsLongVerificationGateNameV042 =
  typeof AQUEOUS_DYNAMICS_LONG_VERIFICATION_GATE_NAMES_V042[number];

type StepMaximum = Readonly<{ value: number; step: number }>;

type MinimumPairReceipt = Readonly<{
  distanceAngstrom: number;
  atomAId: string;
  atomBId: string;
  step: number;
}>;

type LennardJonesMembershipEvent = Readonly<{
  step: number;
  interactionId: string;
  transition: 'entered-strict-cutoff' | 'exited-strict-cutoff';
}>;

type CheckpointReceipt = Readonly<{
  step: number;
  timePicoseconds: number;
  stateDigest: string;
  physicalDigest: string;
  observationDigest: string;
  integrationReceiptDigest: string | null;
  sampleDigest: string;
}>;

type PerSampleAuditEvidence = readonly [
  step: number,
  timePicoseconds: number,
  totalEnergyKjMol: number,
  momentumResidual: number,
  internalForceResidualKjMolAngstrom: number,
  positionConstraintResidualAngstrom: number,
  velocityConstraintResidualAngstrom2PerPicosecond: number,
  massResidualDalton: number,
  chargeResidualE: number,
  minimumNonexcludedDistanceAngstrom: number,
  minimumPairAtomAId: string,
  minimumPairAtomBId: string,
  solverIntegratorWorkUnits: number,
  composerEndpointRankAuditWorkUnits: number,
  observationForceAuditWorkUnits: number,
  observationRankAuditWorkUnits: number,
  stateDigest: string,
  physicalDigest: string,
  observationDigest: string,
  integrationReceiptDigest: string | null,
  forceFieldEvaluationDigest: string,
  lennardJonesMembershipDigest: string,
];

type ReplayWorkEvidence = readonly [
  step: number,
  solverIntegratorWorkUnits: number,
  composerEndpointRankAuditWorkUnits: number,
  observationForceAuditWorkUnits: number,
  observationRankAuditWorkUnits: number,
];

type LockedThresholds = Readonly<{
  maximumRelativeEnergyExcursion: 1e-3;
  momentumResidualLimit: 2e-8;
  internalForceResidualLimitKjMolAngstrom: 1e-10;
  positionConstraintToleranceAngstrom: 1e-10;
  velocityConstraintToleranceAngstrom2PerPicosecond: 1e-10;
  minimumNonexcludedDistanceAngstrom: 1.25;
  massResidualLimitDalton: 0;
  chargeResidualLimitE: 0;
  maximumForceEvaluationWorkUnits: 500_000;
  maximumConstraintJacobianRankWorkUnits: 1_000;
  maximumStepWorkUnits: 1_100_000;
}>;

const LOCKED_THRESHOLD_VALUES: LockedThresholds = Object.freeze({
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
});

export type AqueousDynamicsLongVerificationReportV042 = Readonly<{
  schemaVersion: 'tf.aqueous-dynamics-long-verification/0.4.2';
  status: 'finite-size-cold-start-integration-calibration-only';
  fixture: Readonly<{
    worldId: 'nacl-tip3p-finite-size-calibration';
    atomCount: 8;
    ensemble: 'NVE';
    fixedTimeStepPicoseconds: 0.001;
    fromStep: 0;
    acceptedStepsExecuted: 10_000;
    toStep: 10_000;
    finalTimePicoseconds: 10;
    energySampleCount: 10_001;
    topologyDigest: string;
    configurationDigest: string;
    initialStateDigest: string;
    initialObservationDigest: string;
  }>;
  thresholds: LockedThresholds;
  longRunReceipt: Readonly<{
    energy: Readonly<{
      initialTotalKjMol: number;
      finalTotalKjMol: number;
      energyReferenceKjMol: number;
      maximumAbsoluteExcursionKjMol: number;
      maximumAbsoluteExcursionStep: number;
      maximumRelativeExcursion: number;
      maximumRelativeExcursionStep: number;
      linearDriftSlopeKjMolPerPicosecond: number;
      linearRelativeDriftRatePerPicosecond: number;
      statistics: AqueousDynamicsObservationV042['energyStatistics'];
    }>;
    maximumResiduals: Readonly<{
      momentumDaltonAngstromPerPicosecond: StepMaximum;
      internalForceKjMolAngstrom: StepMaximum;
      positionConstraintAngstrom: StepMaximum;
      velocityConstraintAngstrom2PerPicosecond: StepMaximum;
      massDalton: StepMaximum;
      chargeE: StepMaximum;
    }>;
    minimumNonexcludedPair: MinimumPairReceipt;
    lennardJonesCutoffMembership: Readonly<{
      cutoffAngstrom: number;
      sampling: 'accepted-endpoint-strict-less-than-cutoff-membership-set';
      atomIds: ReadonlyArray<string>;
      pairUniverseInteractionIds: ReadonlyArray<string>;
      initialMemberIds: ReadonlyArray<string>;
      finalMemberIds: ReadonlyArray<string>;
      initialMemberCount: number;
      finalMemberCount: number;
      enteredEventCount: number;
      exitedEventCount: number;
      totalTransitionCount: number;
      stepsWithTransitions: number;
      events: ReadonlyArray<LennardJonesMembershipEvent>;
      eventDigest: string;
    }>;
    workReceipt: Readonly<{
      acceptedIntegrationCount: 10_000;
      observationAuditCount: 10_001;
      solverIntegratorWorkUnits: number;
      composerEndpointRankAuditWorkUnits: number;
      integrationReceiptedWorkUnits: number;
      observationForceAuditWorkUnits: number;
      observationRankAuditWorkUnits: number;
      observationAuditWorkUnits: number;
      totalReceiptedSolverAndObservationWorkUnits: number;
      maximumPerStepIntegrationWork: StepMaximum;
      maximumPerObservationForceAuditWork: StepMaximum;
      maximumPerObservationRankAuditWork: StepMaximum;
      perSampleAuditEvidenceDigest: string;
      accountingBoundary: ReadonlyArray<string>;
      workReceiptDigest: string;
    }>;
    final: Readonly<{
      step: 10_000;
      stateDigest: string;
      physicalDigest: string;
      observationDigest: string;
      finalIntegrationReceiptDigest: string;
    }>;
    trajectory: Readonly<{
      sampleCount: 10_001;
      sampleBinding: 'state-physical-observation-integration-energy-residual-membership-and-work-v1';
      auditColumns: readonly [
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
      ];
      auditSamples: ReadonlyArray<PerSampleAuditEvidence>;
      auditEvidenceDigest: string;
      sampleDigests: ReadonlyArray<string>;
      trajectoryDigest: string;
      checkpointRule: 'steps-0-1-10-and-every-1000';
      checkpointCount: 13;
      checkpoints: ReadonlyArray<CheckpointReceipt>;
      checkpointDigest: string;
    }>;
    receiptDigest: string;
  }>;
  determinism: Readonly<{
    evidenceClass: 'initial-plus-short-accepted-prefix-replay';
    primaryPrefixAcceptedSteps: 10;
    replayPrefixAcceptedSteps: 10;
    comparedSampleCount: 11;
    primaryPrefixDigest: string;
    replayPrefixDigest: string;
    replaySampleDigests: ReadonlyArray<string>;
    replayWorkColumns: readonly [
      'step',
      'solverIntegratorWorkUnits',
      'composerEndpointRankAuditWorkUnits',
      'observationForceAuditWorkUnits',
      'observationRankAuditWorkUnits',
    ];
    replayWorkSamples: ReadonlyArray<ReplayWorkEvidence>;
    replayWorkEvidenceDigest: string;
    exactSampleDigestEquality: true;
    fullTenThousandStepReplayPerformed: false;
    futureFullReplayBoundary:
      'a-second-independent-10000-step-run-must-match-all-sample-final-and-checkpoint-digests-before-claiming-full-replay';
    replayReceiptedWorkUnits: number;
    receiptDigest: string;
  }>;
  evidenceSemantics: Readonly<{
    selfDigestExecutionProof: false;
    selfDigestAuthenticityProof: false;
    ciExecutionTruthAuthority: 'release-artifact-guard';
    boundary: 'self-consistent-digests-do-not-prove-that-the-reported-execution-occurred';
  }>;
  gates: Readonly<Record<AqueousDynamicsLongVerificationGateNameV042, true>>;
  claimBoundaries: Readonly<{
    finiteSizeColdStartIntegrationCalibrationOnly: true;
    bulkClaim: false;
    diluteClaim: false;
    equilibratedClaim: false;
    externalEngineExecution: false;
    externalEngineReproduction: false;
    fullTenThousandStepReplayClaim: false;
    virialDerivedMechanicalObservableIncluded: false;
  }>;
  boundaries: ReadonlyArray<string>;
  verificationDigest: string;
}>;

const CHECKPOINT_STEPS = new Set<number>([
  0,
  1,
  AQUEOUS_DYNAMICS_LONG_VERIFICATION_PREFIX_REPLAY_STEPS_V042,
  ...Array.from(
    { length: AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042
      / AQUEOUS_DYNAMICS_LONG_VERIFICATION_CHECKPOINT_INTERVAL_V042 },
    (_, index) => (index + 1) * AQUEOUS_DYNAMICS_LONG_VERIFICATION_CHECKPOINT_INTERVAL_V042,
  ),
]);

const AUDIT_COLUMNS = Object.freeze([
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
] as const);

const AUDIT_INDEX = Object.freeze({
  step: 0,
  time: 1,
  totalEnergy: 2,
  momentum: 3,
  internalForce: 4,
  positionConstraint: 5,
  velocityConstraint: 6,
  mass: 7,
  charge: 8,
  minimumDistance: 9,
  minimumAtomA: 10,
  minimumAtomB: 11,
  solverWork: 12,
  endpointRankWork: 13,
  observationForceWork: 14,
  observationRankWork: 15,
  stateDigest: 16,
  physicalDigest: 17,
  observationDigest: 18,
  integrationReceiptDigest: 19,
  forceFieldDigest: 20,
  membershipDigest: 21,
} as const);

const REPLAY_WORK_COLUMNS = Object.freeze([
  'step',
  'solverIntegratorWorkUnits',
  'composerEndpointRankAuditWorkUnits',
  'observationForceAuditWorkUnits',
  'observationRankAuditWorkUnits',
] as const);

const BOUNDARIES = Object.freeze([
  'This is one deterministic 10000-step run of the locked eight-atom finite-size cold-start integration fixture.',
  'It is not bulk, dilute, equilibrated, statistically representative, or an external-engine reproduction.',
  'Cutoff transitions count accepted endpoint membership-set changes and do not claim continuous within-step crossing counts.',
  'The total receipted work covers published solver, endpoint-rank, observation-force, and observation-rank work units only.',
  'World construction checks, verifier bookkeeping, digest hashing, pair scans, and wall-clock cost have no published kernel work units and are excluded.',
  'The short replay validates the replay mechanism for steps 0 through 10; a full independent 10000-step replay remains explicitly unexecuted.',
  'No virial-derived mechanical observable is included.',
  'SHA-256 digests bind local deterministic payloads; they are not signatures or authenticity evidence.',
  'A self-consistent report does not prove execution; CI execution truth must be established by the release artifact guard.',
]);

export function runAqueousDynamicsLongVerificationV042(
  onAcceptedStepCheckpoint: ((acceptedSteps: number) => void) | null = null,
):
  AqueousDynamicsLongVerificationReportV042 {
  const world = createNaClTip3pFiniteSizeCalibrationWorldV042();
  const initialState = world.serialize();
  const initial = world.observe();
  const thresholds = lockedThresholds(initial, initialState.configuration);
  const sampleDigests: string[] = [];
  const auditSamples: PerSampleAuditEvidence[] = [];
  const primaryPrefixSampleDigests: string[] = [];
  const checkpoints: CheckpointReceipt[] = [];
  const events: LennardJonesMembershipEvent[] = [];
  let previousMembership = lennardJonesMembership(initial);
  const initialMinimum = minimumNonexcludedPair(world.cell, initial);
  assertReportedMinimum(initial, initialMinimum);

  let maximumMomentum = stepMaximum(initial.conservation.momentumResidual, 0);
  let maximumInternalForce = stepMaximum(initial.conservation.internalForceResidualKjMolAngstrom, 0);
  let maximumPositionConstraint = stepMaximum(initial.constraints.maximumPositionResidualAngstrom, 0);
  let maximumVelocityConstraint = stepMaximum(
    initial.constraints.maximumVelocityDerivativeResidualAngstrom2PerPicosecond,
    0,
  );
  let maximumMass = stepMaximum(initial.conservation.massResidualDalton, 0);
  let maximumCharge = stepMaximum(initial.conservation.chargeResidualE, 0);
  let observedMaximumRelativeEnergy = stepMaximum(initial.energy.relativeExcursion, 0);
  let minimumPair = initialMinimum;

  let solverIntegratorWork = 0;
  let endpointRankAuditWork = 0;
  let observationForceAuditWork = initial.numericalValidity.forceWorkUnitsConsumed;
  let observationRankAuditWork = initial.constraints.rankWorkUnitsConsumed;
  let maximumIntegrationWork = stepMaximum(0, 0);
  let maximumObservationForceAuditWork = stepMaximum(
    initial.numericalValidity.forceWorkUnitsConsumed,
    0,
  );
  let maximumObservationRankAuditWork = stepMaximum(
    initial.constraints.rankWorkUnitsConsumed,
    0,
  );

  const initialAuditSample = sampleAuditEvidence(
    initial,
    initialMinimum,
    previousMembership,
  );
  const initialSampleDigest = digestValue(initialAuditSample);
  auditSamples.push(initialAuditSample);
  sampleDigests.push(initialSampleDigest);
  primaryPrefixSampleDigests.push(initialSampleDigest);
  checkpoints.push(checkpoint(initial, initialSampleDigest));

  let final = initial;
  for (let expectedStep = 1;
    expectedStep <= AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042;
    expectedStep += 1) {
    const observation = world.advance();
    if (observation.step !== expectedStep) {
      throw new Error(`aqueous long verification accepted step ${observation.step}, expected ${expectedStep}`);
    }
    const integrationReceipt = observation.integration.lastIntegrationReceipt;
    if (!integrationReceipt
      || integrationReceipt.fromStep !== expectedStep - 1
      || integrationReceipt.toStep !== expectedStep
      || integrationReceipt.receiptDigest !== digestValue(withoutDigest(integrationReceipt, 'receiptDigest'))) {
      throw new Error(`aqueous long verification integration receipt failed at step ${expectedStep}`);
    }
    const solverWork = observation.integration.lastStepSolverWorkUnitsConsumed;
    const endpointWork = observation.integration.lastStepComposerEndpointRankAuditWorkUnitsConsumed;
    const totalIntegrationWork = observation.integration.lastStepWorkUnitsConsumed;
    if (safeSum(solverWork, endpointWork) !== totalIntegrationWork
      || integrationReceipt.workReceipt.solverIntegratorWorkUnits !== solverWork
      || integrationReceipt.workReceipt.composerEndpointRankAuditWorkUnits !== endpointWork
      || integrationReceipt.workReceipt.totalIntegrationWorkUnits !== totalIntegrationWork) {
      throw new Error(`aqueous long verification work split failed at step ${expectedStep}`);
    }
    solverIntegratorWork = safeSum(solverIntegratorWork, solverWork);
    endpointRankAuditWork = safeSum(endpointRankAuditWork, endpointWork);
    observationForceAuditWork = safeSum(
      observationForceAuditWork,
      observation.numericalValidity.forceWorkUnitsConsumed,
    );
    observationRankAuditWork = safeSum(
      observationRankAuditWork,
      observation.constraints.rankWorkUnitsConsumed,
    );
    maximumIntegrationWork = updateMaximum(maximumIntegrationWork, totalIntegrationWork, expectedStep);
    maximumObservationForceAuditWork = updateMaximum(
      maximumObservationForceAuditWork,
      observation.numericalValidity.forceWorkUnitsConsumed,
      expectedStep,
    );
    maximumObservationRankAuditWork = updateMaximum(
      maximumObservationRankAuditWork,
      observation.constraints.rankWorkUnitsConsumed,
      expectedStep,
    );

    maximumMomentum = updateMaximum(
      maximumMomentum,
      observation.conservation.momentumResidual,
      expectedStep,
    );
    maximumInternalForce = updateMaximum(
      maximumInternalForce,
      observation.conservation.internalForceResidualKjMolAngstrom,
      expectedStep,
    );
    maximumPositionConstraint = updateMaximum(
      maximumPositionConstraint,
      observation.constraints.maximumPositionResidualAngstrom,
      expectedStep,
    );
    maximumVelocityConstraint = updateMaximum(
      maximumVelocityConstraint,
      observation.constraints.maximumVelocityDerivativeResidualAngstrom2PerPicosecond,
      expectedStep,
    );
    maximumMass = updateMaximum(
      maximumMass,
      observation.conservation.massResidualDalton,
      expectedStep,
    );
    maximumCharge = updateMaximum(
      maximumCharge,
      observation.conservation.chargeResidualE,
      expectedStep,
    );
    observedMaximumRelativeEnergy = updateMaximum(
      observedMaximumRelativeEnergy,
      observation.energy.relativeExcursion,
      expectedStep,
    );

    const pair = minimumNonexcludedPair(world.cell, observation);
    assertReportedMinimum(observation, pair);
    if (pair.distanceAngstrom < minimumPair.distanceAngstrom) minimumPair = pair;

    const membership = lennardJonesMembership(observation);
    const stepEvents = membershipTransitions(previousMembership, membership, expectedStep);
    events.push(...stepEvents);
    previousMembership = membership;
    const auditSample = sampleAuditEvidence(observation, pair, membership);
    const sampleDigest = digestValue(auditSample);
    auditSamples.push(auditSample);
    sampleDigests.push(sampleDigest);
    if (expectedStep <= AQUEOUS_DYNAMICS_LONG_VERIFICATION_PREFIX_REPLAY_STEPS_V042) {
      primaryPrefixSampleDigests.push(sampleDigest);
    }
    if (CHECKPOINT_STEPS.has(expectedStep)) checkpoints.push(checkpoint(observation, sampleDigest));
    if (expectedStep % AQUEOUS_DYNAMICS_LONG_VERIFICATION_CHECKPOINT_INTERVAL_V042 === 0) {
      onAcceptedStepCheckpoint?.(expectedStep);
    }
    final = observation;
  }

  const finalState = world.serialize();
  if (world.stepCount !== AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042
    || final.step !== AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042
    || finalState.step !== AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042) {
    throw new Error('aqueous long verification did not execute exactly 10000 accepted steps');
  }
  if (observedMaximumRelativeEnergy.value !== final.energyStatistics.maximumRelativeExcursion
    || observedMaximumRelativeEnergy.step !== final.energyStatistics.maximumRelativeExcursionStep) {
    throw new Error('aqueous long verification independent energy maximum does not match world statistics');
  }

  const membershipPayload = bindMembershipReceipt(
    initial,
    lennardJonesMembership(initial),
    previousMembership,
    events,
  );
  const workPayload = bindPrimaryWorkReceipt({
    solverIntegratorWork,
    endpointRankAuditWork,
    observationForceAuditWork,
    observationRankAuditWork,
    maximumIntegrationWork,
    maximumObservationForceAuditWork,
    maximumObservationRankAuditWork,
    auditEvidenceDigest: digestValue({ columns: AUDIT_COLUMNS, samples: auditSamples }),
  });
  const trajectoryPayload = bindTrajectoryReceipt(sampleDigests, auditSamples, checkpoints);
  const finalIntegrationReceipt = final.integration.lastIntegrationReceipt;
  if (!finalIntegrationReceipt) throw new Error('aqueous long verification final receipt is missing');
  const longPayload = {
    energy: {
      initialTotalKjMol: initial.energy.totalKjMol,
      finalTotalKjMol: final.energy.totalKjMol,
      energyReferenceKjMol: finalState.energyReferenceKjMol,
      maximumAbsoluteExcursionKjMol: final.energyStatistics.maximumAbsoluteExcursionKjMol,
      maximumAbsoluteExcursionStep: final.energyStatistics.maximumAbsoluteExcursionStep,
      maximumRelativeExcursion: final.energyStatistics.maximumRelativeExcursion,
      maximumRelativeExcursionStep: final.energyStatistics.maximumRelativeExcursionStep,
      linearDriftSlopeKjMolPerPicosecond:
        final.energyStatistics.linearDriftSlopeKjMolPerPicosecond,
      linearRelativeDriftRatePerPicosecond:
        final.energyStatistics.linearRelativeDriftRatePerPicosecond,
      statistics: structuredClone(final.energyStatistics),
    },
    maximumResiduals: {
      momentumDaltonAngstromPerPicosecond: maximumMomentum,
      internalForceKjMolAngstrom: maximumInternalForce,
      positionConstraintAngstrom: maximumPositionConstraint,
      velocityConstraintAngstrom2PerPicosecond: maximumVelocityConstraint,
      massDalton: maximumMass,
      chargeE: maximumCharge,
    },
    minimumNonexcludedPair: minimumPair,
    lennardJonesCutoffMembership: membershipPayload,
    workReceipt: workPayload,
    final: {
      step: AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042,
      stateDigest: final.stateDigest,
      physicalDigest: final.physicalDigest,
      observationDigest: final.observationDigest,
      finalIntegrationReceiptDigest: finalIntegrationReceipt.receiptDigest,
    },
    trajectory: trajectoryPayload,
  };
  const longRunReceipt = deepFreeze({ ...longPayload, receiptDigest: digestValue(longPayload) });
  const determinism = runShortPrefixReplay(primaryPrefixSampleDigests);
  const gates = evaluateGates(final, thresholds, longRunReceipt, determinism);
  const failed = AQUEOUS_DYNAMICS_LONG_VERIFICATION_GATE_NAMES_V042.filter((name) => !gates[name]);
  if (failed.length > 0) {
    throw new Error(`aqueous dynamics long verification gates failed: ${failed.join(', ')}`);
  }
  const fixture = {
    worldId: 'nacl-tip3p-finite-size-calibration' as const,
    atomCount: 8 as const,
    ensemble: 'NVE' as const,
    fixedTimeStepPicoseconds: AQUEOUS_DYNAMICS_TIME_STEP_PS_V042,
    fromStep: 0 as const,
    acceptedStepsExecuted: AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042,
    toStep: AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042,
    finalTimePicoseconds: 10 as const,
    energySampleCount: 10_001 as const,
    topologyDigest: initial.topologyDigest,
    configurationDigest: initial.configurationDigest,
    initialStateDigest: initial.stateDigest,
    initialObservationDigest: initial.observationDigest,
  };
  const payload = {
    schemaVersion: 'tf.aqueous-dynamics-long-verification/0.4.2' as const,
    status: 'finite-size-cold-start-integration-calibration-only' as const,
    fixture,
    thresholds,
    longRunReceipt,
    determinism,
    evidenceSemantics: {
      selfDigestExecutionProof: false as const,
      selfDigestAuthenticityProof: false as const,
      ciExecutionTruthAuthority: 'release-artifact-guard' as const,
      boundary:
        'self-consistent-digests-do-not-prove-that-the-reported-execution-occurred' as const,
    },
    gates: gates as Record<AqueousDynamicsLongVerificationGateNameV042, true>,
    claimBoundaries: {
      finiteSizeColdStartIntegrationCalibrationOnly: true as const,
      bulkClaim: false as const,
      diluteClaim: false as const,
      equilibratedClaim: false as const,
      externalEngineExecution: false as const,
      externalEngineReproduction: false as const,
      fullTenThousandStepReplayClaim: false as const,
      virialDerivedMechanicalObservableIncluded: false as const,
    },
    boundaries: [...BOUNDARIES],
  };
  const report = deepFreeze({ ...payload, verificationDigest: digestValue(payload) });
  assertAqueousDynamicsLongVerificationV042(report);
  return report;
}

export function assertAqueousDynamicsLongVerificationV042(
  candidate: unknown,
): asserts candidate is AqueousDynamicsLongVerificationReportV042 {
  const candidateRecord = asRecord(candidate, 'aqueous dynamics long verification report');
  assertExactKeys(candidateRecord, [
    'schemaVersion', 'status', 'fixture', 'thresholds', 'longRunReceipt', 'determinism',
    'evidenceSemantics', 'gates', 'claimBoundaries', 'boundaries', 'verificationDigest',
  ], 'aqueous dynamics long verification report');
  if (candidateRecord.schemaVersion !== 'tf.aqueous-dynamics-long-verification/0.4.2') {
    throw new Error('unsupported aqueous dynamics long verification report');
  }
  const report = candidateRecord as unknown as AqueousDynamicsLongVerificationReportV042;
  assertLockedReportShape(report);
  assertFreshLockedInitialWorldBinding(report);
  const { verificationDigest, ...payload } = report;
  if (verificationDigest !== digestValue(payload)) {
    throw new Error('aqueous dynamics long verification evidence digest mismatch');
  }
  const { receiptDigest, ...longPayload } = report.longRunReceipt;
  if (receiptDigest !== digestValue(longPayload)) {
    throw new Error('aqueous dynamics long-run receipt digest mismatch');
  }
  const recomputed = recomputeAuditEvidence(report);
  assertAuditDerivedSummaries(report, recomputed);
  assertWorkSemantics(report.longRunReceipt.workReceipt, report.thresholds, recomputed);
  assertMembershipSemantics(
    report.longRunReceipt.lennardJonesCutoffMembership,
    report.longRunReceipt.trajectory.auditSamples,
  );
  assertTrajectorySemantics(report);
  assertDeterminismSemantics(report);
  const expectedGates = recomputeReportGates(report);
  assertExactGateRecord(report.gates, expectedGates);
  assertDeepFrozen(report, 'aqueous dynamics long verification report');
}

function assertFreshLockedInitialWorldBinding(
  report: AqueousDynamicsLongVerificationReportV042,
) {
  const freshWorld = createNaClTip3pFiniteSizeCalibrationWorldV042();
  const freshState = freshWorld.serialize();
  const freshInitial = freshWorld.observe();
  const membership = report.longRunReceipt.lennardJonesCutoffMembership;
  const expectedAtomIds = [...freshInitial.forceField.atomOrder];
  const expectedPairUniverse = lennardJonesPairUniverse(freshInitial);
  const expectedInitialMembership = [...lennardJonesMembership(freshInitial)].sort(compareAscii);
  if (report.fixture.topologyDigest !== freshInitial.topologyDigest
    || report.fixture.configurationDigest !== freshInitial.configurationDigest
    || report.fixture.initialStateDigest !== freshState.stateDigest
    || report.fixture.initialStateDigest !== freshInitial.stateDigest
    || report.fixture.initialObservationDigest !== freshInitial.observationDigest
    || !sameStringArray(membership.atomIds, expectedAtomIds)
    || !sameStringArray(membership.pairUniverseInteractionIds, expectedPairUniverse)
    || !sameStringArray(membership.initialMemberIds, expectedInitialMembership)) {
    throw new Error('fresh locked initial-world binding mismatch');
  }
}

function lockedThresholds(
  observation: AqueousDynamicsObservationV042,
  configuration: ReturnType<typeof createNaClTip3pFiniteSizeCalibrationWorldV042>['configuration'],
): LockedThresholds {
  const thresholds = {
    maximumRelativeEnergyExcursion: configuration.validityGates.maximumRelativeEnergyExcursion,
    momentumResidualLimit: configuration.validityGates.momentumResidualLimit,
    internalForceResidualLimitKjMolAngstrom: configuration.validityGates.internalForceResidualLimit,
    positionConstraintToleranceAngstrom:
      configuration.integration.constraintOptions.positionToleranceAngstrom,
    velocityConstraintToleranceAngstrom2PerPicosecond:
      configuration.integration.constraintOptions.velocityDerivativeToleranceAngstrom2PerPicosecond,
    minimumNonexcludedDistanceAngstrom:
      configuration.validityGates.minimumNonexcludedDistanceAngstrom,
    massResidualLimitDalton: configuration.validityGates.massResidualLimitDalton,
    chargeResidualLimitE: configuration.validityGates.chargeResidualLimitE,
    maximumForceEvaluationWorkUnits: configuration.integration.maximumForceEvaluationWorkUnits,
    maximumConstraintJacobianRankWorkUnits:
      configuration.integration.maximumConstraintJacobianRankWorkUnits,
    maximumStepWorkUnits: configuration.integration.maximumStepWorkUnits,
  };
  if (thresholds.maximumRelativeEnergyExcursion !== 1e-3
    || thresholds.momentumResidualLimit !== 2e-8
    || thresholds.internalForceResidualLimitKjMolAngstrom !== 1e-10
    || thresholds.positionConstraintToleranceAngstrom !== 1e-10
    || thresholds.velocityConstraintToleranceAngstrom2PerPicosecond !== 1e-10
    || thresholds.minimumNonexcludedDistanceAngstrom !== 1.25
    || thresholds.massResidualLimitDalton !== 0
    || thresholds.chargeResidualLimitE !== 0
    || thresholds.maximumForceEvaluationWorkUnits !== 500_000
    || thresholds.maximumConstraintJacobianRankWorkUnits !== 1_000
    || thresholds.maximumStepWorkUnits !== 1_100_000
    || observation.numericalValidity.maximumRelativeEnergyExcursion
      !== thresholds.maximumRelativeEnergyExcursion
    || observation.numericalValidity.momentumResidualLimit !== thresholds.momentumResidualLimit
    || observation.numericalValidity.internalForceResidualLimit
      !== thresholds.internalForceResidualLimitKjMolAngstrom) {
    throw new Error('aqueous long verification world thresholds are not the locked values');
  }
  return deepFreeze(thresholds as LockedThresholds);
}

function evaluateGates(
  final: AqueousDynamicsObservationV042,
  thresholds: LockedThresholds,
  receipt: AqueousDynamicsLongVerificationReportV042['longRunReceipt'],
  determinism: AqueousDynamicsLongVerificationReportV042['determinism'],
) {
  const residuals = receipt.maximumResiduals;
  return {
    acceptedStepHorizon:
      final.step === AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042
      && final.energyStatistics.sampleCount === AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042 + 1,
    energyStatisticsClosure:
      receipt.energy.statistics.maximumRelativeExcursion === receipt.energy.maximumRelativeExcursion
      && receipt.energy.statistics.maximumRelativeExcursionStep
        === receipt.energy.maximumRelativeExcursionStep
      && receipt.energy.statistics.linearRelativeDriftRatePerPicosecond
        === receipt.energy.linearRelativeDriftRatePerPicosecond,
    energyExcursion:
      receipt.energy.maximumRelativeExcursion <= thresholds.maximumRelativeEnergyExcursion,
    momentumClosure:
      residuals.momentumDaltonAngstromPerPicosecond.value <= thresholds.momentumResidualLimit,
    internalForceClosure:
      residuals.internalForceKjMolAngstrom.value
        <= thresholds.internalForceResidualLimitKjMolAngstrom,
    positionConstraintClosure:
      residuals.positionConstraintAngstrom.value
        <= thresholds.positionConstraintToleranceAngstrom,
    velocityConstraintClosure:
      residuals.velocityConstraintAngstrom2PerPicosecond.value
        <= thresholds.velocityConstraintToleranceAngstrom2PerPicosecond,
    massAndChargeClosure:
      residuals.massDalton.value === thresholds.massResidualLimitDalton
      && residuals.chargeE.value === thresholds.chargeResidualLimitE,
    minimumNonexcludedDistance:
      receipt.minimumNonexcludedPair.distanceAngstrom
        >= thresholds.minimumNonexcludedDistanceAngstrom,
    integrationWorkClosure:
      receipt.workReceipt.integrationReceiptedWorkUnits === safeSum(
        receipt.workReceipt.solverIntegratorWorkUnits,
        receipt.workReceipt.composerEndpointRankAuditWorkUnits,
      ) && receipt.workReceipt.maximumPerStepIntegrationWork.value
        <= thresholds.maximumStepWorkUnits,
    observationAuditWorkClosure:
      receipt.workReceipt.observationAuditWorkUnits === safeSum(
        receipt.workReceipt.observationForceAuditWorkUnits,
        receipt.workReceipt.observationRankAuditWorkUnits,
      ) && receipt.workReceipt.maximumPerObservationForceAuditWork.value
        <= thresholds.maximumForceEvaluationWorkUnits
      && receipt.workReceipt.maximumPerObservationRankAuditWork.value
        <= thresholds.maximumConstraintJacobianRankWorkUnits,
    lennardJonesMembershipAccounting:
      receipt.lennardJonesCutoffMembership.totalTransitionCount === safeSum(
        receipt.lennardJonesCutoffMembership.enteredEventCount,
        receipt.lennardJonesCutoffMembership.exitedEventCount,
      ),
    trajectoryAndCheckpointBinding:
      receipt.trajectory.sampleDigests.length === 10_001
      && receipt.trajectory.checkpoints.at(-1)?.sampleDigest
        === receipt.trajectory.sampleDigests.at(-1),
    deterministicPrefixReplay: determinism.exactSampleDigestEquality,
  } satisfies Record<AqueousDynamicsLongVerificationGateNameV042, boolean>;
}

function bindPrimaryWorkReceipt(input: Readonly<{
  solverIntegratorWork: number;
  endpointRankAuditWork: number;
  observationForceAuditWork: number;
  observationRankAuditWork: number;
  maximumIntegrationWork: StepMaximum;
  maximumObservationForceAuditWork: StepMaximum;
  maximumObservationRankAuditWork: StepMaximum;
  auditEvidenceDigest: string;
}>) {
  const integrationWork = safeSum(input.solverIntegratorWork, input.endpointRankAuditWork);
  const observationWork = safeSum(input.observationForceAuditWork, input.observationRankAuditWork);
  const payload = {
    acceptedIntegrationCount: AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042,
    observationAuditCount: 10_001 as const,
    solverIntegratorWorkUnits: input.solverIntegratorWork,
    composerEndpointRankAuditWorkUnits: input.endpointRankAuditWork,
    integrationReceiptedWorkUnits: integrationWork,
    observationForceAuditWorkUnits: input.observationForceAuditWork,
    observationRankAuditWorkUnits: input.observationRankAuditWork,
    observationAuditWorkUnits: observationWork,
    totalReceiptedSolverAndObservationWorkUnits: safeSum(integrationWork, observationWork),
    maximumPerStepIntegrationWork: input.maximumIntegrationWork,
    maximumPerObservationForceAuditWork: input.maximumObservationForceAuditWork,
    maximumPerObservationRankAuditWork: input.maximumObservationRankAuditWork,
    perSampleAuditEvidenceDigest: input.auditEvidenceDigest,
    accountingBoundary: [
      'solverIntegratorWorkUnits and composerEndpointRankAuditWorkUnits are disjoint fields whose sum is the published per-step integration total',
      'observation force and rank audits are separately receipted and are not included in the integration total',
      'constructor validation, verifier analysis, digest hashing, pair scans, and wall-clock time are excluded because no kernel work units are published for them',
    ],
  };
  return deepFreeze({ ...payload, workReceiptDigest: digestValue(payload) });
}

function bindMembershipReceipt(
  initial: AqueousDynamicsObservationV042,
  initialMembership: ReadonlySet<string>,
  finalMembership: ReadonlySet<string>,
  events: ReadonlyArray<LennardJonesMembershipEvent>,
) {
  const entered = events.filter((event) => event.transition === 'entered-strict-cutoff').length;
  const exited = events.filter((event) => event.transition === 'exited-strict-cutoff').length;
  const eventSteps = new Set(events.map((event) => event.step));
  return deepFreeze({
    cutoffAngstrom: initial.topology.shortRangeNonbonded.cutoffAngstrom,
    sampling: 'accepted-endpoint-strict-less-than-cutoff-membership-set' as const,
    atomIds: [...initial.forceField.atomOrder],
    pairUniverseInteractionIds: lennardJonesPairUniverse(initial),
    initialMemberIds: [...initialMembership].sort(compareAscii),
    finalMemberIds: [...finalMembership].sort(compareAscii),
    initialMemberCount: initialMembership.size,
    finalMemberCount: finalMembership.size,
    enteredEventCount: entered,
    exitedEventCount: exited,
    totalTransitionCount: safeSum(entered, exited),
    stepsWithTransitions: eventSteps.size,
    events: events.map((event) => ({ ...event })),
    eventDigest: digestValue(events),
  });
}

function bindTrajectoryReceipt(
  sampleDigests: ReadonlyArray<string>,
  auditSamples: ReadonlyArray<PerSampleAuditEvidence>,
  checkpoints: ReadonlyArray<CheckpointReceipt>,
) {
  const samples = [...sampleDigests];
  const audits = auditSamples.map((sample) => Object.freeze([...sample]) as PerSampleAuditEvidence);
  const checkpointCopies = checkpoints.map((entry) => ({ ...entry }));
  return deepFreeze({
    sampleCount: 10_001 as const,
    sampleBinding:
      'state-physical-observation-integration-energy-residual-membership-and-work-v1' as const,
    auditColumns: AUDIT_COLUMNS,
    auditSamples: audits,
    auditEvidenceDigest: digestValue({ columns: AUDIT_COLUMNS, samples: audits }),
    sampleDigests: samples,
    trajectoryDigest: digestValue({
      algorithm: 'canonical-sha256-sample-list-v1',
      sampleDigests: samples,
    }),
    checkpointRule: 'steps-0-1-10-and-every-1000' as const,
    checkpointCount: 13 as const,
    checkpoints: checkpointCopies,
    checkpointDigest: digestValue(checkpointCopies),
  });
}

function runShortPrefixReplay(primarySampleDigests: ReadonlyArray<string>) {
  const replay = createNaClTip3pFiniteSizeCalibrationWorldV042();
  let observation = replay.observe();
  let membership = lennardJonesMembership(observation);
  let pair = minimumNonexcludedPair(replay.cell, observation);
  const replaySampleDigests = [digestValue(sampleAuditEvidence(observation, pair, membership))];
  const replayWorkSamples: ReplayWorkEvidence[] = [replayWorkEvidence(observation)];
  for (let step = 1;
    step <= AQUEOUS_DYNAMICS_LONG_VERIFICATION_PREFIX_REPLAY_STEPS_V042;
    step += 1) {
    observation = replay.advance();
    membership = lennardJonesMembership(observation);
    pair = minimumNonexcludedPair(replay.cell, observation);
    replaySampleDigests.push(digestValue(sampleAuditEvidence(observation, pair, membership)));
    replayWorkSamples.push(replayWorkEvidence(observation));
  }
  const primary = [...primarySampleDigests];
  const exact = primary.length === replaySampleDigests.length
    && primary.every((digest, index) => digest === replaySampleDigests[index]);
  if (!exact) throw new Error('aqueous long verification short prefix replay diverged');
  const payload = {
    evidenceClass: 'initial-plus-short-accepted-prefix-replay' as const,
    primaryPrefixAcceptedSteps: AQUEOUS_DYNAMICS_LONG_VERIFICATION_PREFIX_REPLAY_STEPS_V042,
    replayPrefixAcceptedSteps: AQUEOUS_DYNAMICS_LONG_VERIFICATION_PREFIX_REPLAY_STEPS_V042,
    comparedSampleCount: 11 as const,
    primaryPrefixDigest: digestValue(primary),
    replayPrefixDigest: digestValue(replaySampleDigests),
    replaySampleDigests,
    replayWorkColumns: REPLAY_WORK_COLUMNS,
    replayWorkSamples,
    replayWorkEvidenceDigest: digestValue({
      columns: REPLAY_WORK_COLUMNS,
      samples: replayWorkSamples,
    }),
    exactSampleDigestEquality: true as const,
    fullTenThousandStepReplayPerformed: false as const,
    futureFullReplayBoundary:
      'a-second-independent-10000-step-run-must-match-all-sample-final-and-checkpoint-digests-before-claiming-full-replay' as const,
    replayReceiptedWorkUnits: replayWorkSamples.reduce(
      (sum, sample) => safeSum(sum, sample[1], sample[2], sample[3], sample[4]),
      0,
    ),
  };
  return deepFreeze({ ...payload, receiptDigest: digestValue(payload) });
}

function replayWorkEvidence(
  observation: AqueousDynamicsObservationV042,
): ReplayWorkEvidence {
  return Object.freeze([
    observation.step,
    observation.integration.lastStepSolverWorkUnitsConsumed,
    observation.integration.lastStepComposerEndpointRankAuditWorkUnitsConsumed,
    observation.numericalValidity.forceWorkUnitsConsumed,
    observation.constraints.rankWorkUnitsConsumed,
  ]);
}

function sampleAuditEvidence(
  observation: AqueousDynamicsObservationV042,
  minimumPair: MinimumPairReceipt,
  membership: ReadonlySet<string>,
) : PerSampleAuditEvidence {
  return Object.freeze([
    observation.step,
    observation.timePicoseconds,
    observation.energy.totalKjMol,
    observation.conservation.momentumResidual,
    observation.conservation.internalForceResidualKjMolAngstrom,
    observation.constraints.maximumPositionResidualAngstrom,
    observation.constraints.maximumVelocityDerivativeResidualAngstrom2PerPicosecond,
    observation.conservation.massResidualDalton,
    observation.conservation.chargeResidualE,
    minimumPair.distanceAngstrom,
    minimumPair.atomAId,
    minimumPair.atomBId,
    observation.integration.lastStepSolverWorkUnitsConsumed,
    observation.integration.lastStepComposerEndpointRankAuditWorkUnitsConsumed,
    observation.numericalValidity.forceWorkUnitsConsumed,
    observation.constraints.rankWorkUnitsConsumed,
    observation.stateDigest,
    observation.physicalDigest,
    observation.observationDigest,
    observation.integration.lastIntegrationReceipt?.receiptDigest ?? null,
    observation.forceField.evaluationDigest,
    digestValue([...membership].sort(compareAscii)),
  ]);
}

function checkpoint(
  observation: AqueousDynamicsObservationV042,
  sampleDigest: string,
): CheckpointReceipt {
  return deepFreeze({
    step: observation.step,
    timePicoseconds: observation.timePicoseconds,
    stateDigest: observation.stateDigest,
    physicalDigest: observation.physicalDigest,
    observationDigest: observation.observationDigest,
    integrationReceiptDigest:
      observation.integration.lastIntegrationReceipt?.receiptDigest ?? null,
    sampleDigest,
  });
}

function minimumNonexcludedPair(
  cell: PeriodicCell,
  observation: AqueousDynamicsObservationV042,
): MinimumPairReceipt {
  const excluded = new Set(observation.topology.nonbondedExceptions.map((exception) => (
    pairKey(exception.atomAId, exception.atomBId)
  )));
  const atoms = [...observation.atoms].sort((left, right) => compareAscii(left.id, right.id));
  let best: MinimumPairReceipt | null = null;
  for (let left = 0; left < atoms.length; left += 1) {
    for (let right = left + 1; right < atoms.length; right += 1) {
      if (excluded.has(pairKey(atoms[left].id, atoms[right].id))) continue;
      const distance = cell.minimumImageFromFractional(
        atoms[left].position.wrappedFractional,
        atoms[right].position.wrappedFractional,
      ).distanceAngstrom;
      if (!best || distance < best.distanceAngstrom) {
        best = {
          distanceAngstrom: distance,
          atomAId: atoms[left].id,
          atomBId: atoms[right].id,
          step: observation.step,
        };
      }
    }
  }
  if (!best) throw new Error('aqueous long verification found no nonexcluded pair');
  return deepFreeze(best);
}

function assertReportedMinimum(
  observation: AqueousDynamicsObservationV042,
  pair: MinimumPairReceipt,
) {
  if (pair.distanceAngstrom
    !== observation.periodicGeometry.minimumNonexcludedPairDistanceAngstrom) {
    throw new Error(`aqueous long verification minimum-pair mismatch at step ${observation.step}`);
  }
}

function lennardJonesMembership(observation: AqueousDynamicsObservationV042) {
  return new Set(observation.forceField.lennardJonesInteractions
    .map((interaction) => interaction.id)
    .sort(compareAscii));
}

function lennardJonesPairUniverse(observation: AqueousDynamicsObservationV042) {
  const ids = [...observation.forceField.atomOrder];
  const universe: string[] = [];
  for (let left = 0; left < ids.length; left += 1) {
    for (let right = left + 1; right < ids.length; right += 1) {
      universe.push(`lj:${ids[left]}:${ids[right]}`);
    }
  }
  return universe;
}

function membershipTransitions(
  previous: ReadonlySet<string>,
  current: ReadonlySet<string>,
  step: number,
) {
  const events: LennardJonesMembershipEvent[] = [];
  for (const id of [...current].sort(compareAscii)) {
    if (!previous.has(id)) events.push({ step, interactionId: id, transition: 'entered-strict-cutoff' });
  }
  for (const id of [...previous].sort(compareAscii)) {
    if (!current.has(id)) events.push({ step, interactionId: id, transition: 'exited-strict-cutoff' });
  }
  return events;
}

type RecomputedAudit = Readonly<{
  statistics: AqueousDynamicsObservationV042['energyStatistics'];
  energyReferenceKjMol: number;
  finalTotalEnergyKjMol: number;
  maximumResiduals: AqueousDynamicsLongVerificationReportV042['longRunReceipt']['maximumResiduals'];
  minimumPair: MinimumPairReceipt;
  work: Readonly<{
    solver: number;
    endpointRank: number;
    observationForce: number;
    observationRank: number;
    maximumIntegration: StepMaximum;
    maximumObservationForce: StepMaximum;
    maximumObservationRank: StepMaximum;
  }>;
}>;

function assertLockedReportShape(report: AqueousDynamicsLongVerificationReportV042) {
  assertExactKeys(asRecord(report.fixture, 'fixture'), [
    'worldId', 'atomCount', 'ensemble', 'fixedTimeStepPicoseconds', 'fromStep',
    'acceptedStepsExecuted', 'toStep', 'finalTimePicoseconds', 'energySampleCount',
    'topologyDigest', 'configurationDigest', 'initialStateDigest', 'initialObservationDigest',
  ], 'fixture');
  assertExactKeys(asRecord(report.thresholds, 'thresholds'), Object.keys(LOCKED_THRESHOLD_VALUES), 'thresholds');
  assertExactKeys(asRecord(report.longRunReceipt, 'longRunReceipt'), [
    'energy', 'maximumResiduals', 'minimumNonexcludedPair', 'lennardJonesCutoffMembership',
    'workReceipt', 'final', 'trajectory', 'receiptDigest',
  ], 'longRunReceipt');
  assertExactKeys(asRecord(report.longRunReceipt.energy, 'energy'), [
    'initialTotalKjMol', 'finalTotalKjMol', 'energyReferenceKjMol',
    'maximumAbsoluteExcursionKjMol', 'maximumAbsoluteExcursionStep',
    'maximumRelativeExcursion', 'maximumRelativeExcursionStep',
    'linearDriftSlopeKjMolPerPicosecond', 'linearRelativeDriftRatePerPicosecond', 'statistics',
  ], 'energy');
  assertExactKeys(asRecord(report.longRunReceipt.energy.statistics, 'energy statistics'), [
    'sampleCount', 'timeSumPicoseconds', 'energySumKjMol', 'timeSquaredSumPicoseconds2',
    'timeEnergySumKjMolPicoseconds', 'maximumAbsoluteExcursionKjMol',
    'maximumAbsoluteExcursionStep', 'maximumRelativeExcursion',
    'maximumRelativeExcursionStep', 'linearDriftSlopeKjMolPerPicosecond',
    'linearRelativeDriftRatePerPicosecond',
  ], 'energy statistics');
  assertExactKeys(asRecord(report.longRunReceipt.maximumResiduals, 'maximumResiduals'), [
    'momentumDaltonAngstromPerPicosecond', 'internalForceKjMolAngstrom',
    'positionConstraintAngstrom', 'velocityConstraintAngstrom2PerPicosecond',
    'massDalton', 'chargeE',
  ], 'maximumResiduals');
  for (const [label, maximum] of Object.entries(report.longRunReceipt.maximumResiduals)) {
    assertStepMaximumShape(maximum, `maximumResiduals.${label}`, false);
  }
  assertExactKeys(asRecord(report.longRunReceipt.minimumNonexcludedPair, 'minimumNonexcludedPair'), [
    'distanceAngstrom', 'atomAId', 'atomBId', 'step',
  ], 'minimumNonexcludedPair');
  assertMembershipShape(report.longRunReceipt.lennardJonesCutoffMembership);
  assertWorkShape(report.longRunReceipt.workReceipt);
  assertExactKeys(asRecord(report.longRunReceipt.final, 'final'), [
    'step', 'stateDigest', 'physicalDigest', 'observationDigest',
    'finalIntegrationReceiptDigest',
  ], 'final');
  assertTrajectoryShape(report.longRunReceipt.trajectory);
  assertExactKeys(asRecord(report.determinism, 'determinism'), [
    'evidenceClass', 'primaryPrefixAcceptedSteps', 'replayPrefixAcceptedSteps',
    'comparedSampleCount', 'primaryPrefixDigest', 'replayPrefixDigest',
    'replaySampleDigests', 'replayWorkColumns', 'replayWorkSamples',
    'replayWorkEvidenceDigest',
    'exactSampleDigestEquality', 'fullTenThousandStepReplayPerformed',
    'futureFullReplayBoundary', 'replayReceiptedWorkUnits', 'receiptDigest',
  ], 'determinism');
  assertExactKeys(asRecord(report.evidenceSemantics, 'evidenceSemantics'), [
    'selfDigestExecutionProof', 'selfDigestAuthenticityProof',
    'ciExecutionTruthAuthority', 'boundary',
  ], 'evidenceSemantics');
  assertExactKeys(asRecord(report.gates, 'gates'), AQUEOUS_DYNAMICS_LONG_VERIFICATION_GATE_NAMES_V042, 'gates');
  assertExactKeys(asRecord(report.claimBoundaries, 'claimBoundaries'), [
    'finiteSizeColdStartIntegrationCalibrationOnly', 'bulkClaim', 'diluteClaim',
    'equilibratedClaim', 'externalEngineExecution', 'externalEngineReproduction',
    'fullTenThousandStepReplayClaim', 'virialDerivedMechanicalObservableIncluded',
  ], 'claimBoundaries');
  assertStringArrayExact(report.boundaries, BOUNDARIES, 'boundaries');
  assertLockedThresholdValues(report.thresholds);
  assertLockedCanonicalValues(report);
  assertEnergyFieldShapes(report.longRunReceipt.energy);
  assertDigestString(report.longRunReceipt.receiptDigest, 'longRunReceipt.receiptDigest');
  assertDigestString(report.verificationDigest, 'verificationDigest');
}

function assertLockedThresholdValues(thresholds: LockedThresholds) {
  for (const [key, expected] of Object.entries(LOCKED_THRESHOLD_VALUES)) {
    if (thresholds[key as keyof LockedThresholds] !== expected) {
      throw new Error(`locked threshold ${key} mismatch`);
    }
  }
}

function assertLockedCanonicalValues(report: AqueousDynamicsLongVerificationReportV042) {
  const fixture = report.fixture;
  if (report.status !== 'finite-size-cold-start-integration-calibration-only'
    || fixture.worldId !== 'nacl-tip3p-finite-size-calibration'
    || fixture.atomCount !== 8 || fixture.ensemble !== 'NVE'
    || fixture.fixedTimeStepPicoseconds !== 0.001 || fixture.fromStep !== 0
    || fixture.acceptedStepsExecuted !== 10_000 || fixture.toStep !== 10_000
    || fixture.finalTimePicoseconds !== 10 || fixture.energySampleCount !== 10_001
    || report.evidenceSemantics.selfDigestExecutionProof !== false
    || report.evidenceSemantics.selfDigestAuthenticityProof !== false
    || report.evidenceSemantics.ciExecutionTruthAuthority !== 'release-artifact-guard'
    || report.evidenceSemantics.boundary
      !== 'self-consistent-digests-do-not-prove-that-the-reported-execution-occurred'
    || report.claimBoundaries.finiteSizeColdStartIntegrationCalibrationOnly !== true
    || report.claimBoundaries.bulkClaim !== false || report.claimBoundaries.diluteClaim !== false
    || report.claimBoundaries.equilibratedClaim !== false
    || report.claimBoundaries.externalEngineExecution !== false
    || report.claimBoundaries.externalEngineReproduction !== false
    || report.claimBoundaries.fullTenThousandStepReplayClaim !== false
    || report.claimBoundaries.virialDerivedMechanicalObservableIncluded !== false) {
    throw new Error('aqueous dynamics long verification canonical boundary mismatch');
  }
  for (const [label, digest] of Object.entries({
    topologyDigest: fixture.topologyDigest,
    configurationDigest: fixture.configurationDigest,
    initialStateDigest: fixture.initialStateDigest,
    initialObservationDigest: fixture.initialObservationDigest,
  })) assertDigestString(digest, `fixture.${label}`);
}

function assertEnergyFieldShapes(
  energy: AqueousDynamicsLongVerificationReportV042['longRunReceipt']['energy'],
) {
  for (const [label, value] of Object.entries(energy)) {
    if (label === 'statistics') continue;
    if (label.endsWith('Step')) assertSafeStep(value, `energy.${label}`);
    else if (label.includes('maximum') || label === 'energyReferenceKjMol') {
      assertNonnegativeFinite(value, `energy.${label}`);
    } else assertFiniteNumber(value, `energy.${label}`);
  }
  const stats = energy.statistics;
  assertSafeIntegerExact(stats.sampleCount, 10_001, 'statistics.sampleCount');
  for (const label of [
    'timeSumPicoseconds', 'timeSquaredSumPicoseconds2', 'maximumAbsoluteExcursionKjMol',
    'maximumRelativeExcursion',
  ] as const) assertNonnegativeFinite(stats[label], `statistics.${label}`);
  for (const label of [
    'energySumKjMol', 'timeEnergySumKjMolPicoseconds',
    'linearDriftSlopeKjMolPerPicosecond', 'linearRelativeDriftRatePerPicosecond',
  ] as const) assertFiniteNumber(stats[label], `statistics.${label}`);
  assertSafeStep(stats.maximumAbsoluteExcursionStep, 'statistics.maximumAbsoluteExcursionStep');
  assertSafeStep(stats.maximumRelativeExcursionStep, 'statistics.maximumRelativeExcursionStep');
}

function assertWorkShape(
  work: AqueousDynamicsLongVerificationReportV042['longRunReceipt']['workReceipt'],
) {
  assertExactKeys(asRecord(work, 'workReceipt'), [
    'acceptedIntegrationCount', 'observationAuditCount', 'solverIntegratorWorkUnits',
    'composerEndpointRankAuditWorkUnits', 'integrationReceiptedWorkUnits',
    'observationForceAuditWorkUnits', 'observationRankAuditWorkUnits',
    'observationAuditWorkUnits', 'totalReceiptedSolverAndObservationWorkUnits',
    'maximumPerStepIntegrationWork', 'maximumPerObservationForceAuditWork',
    'maximumPerObservationRankAuditWork', 'perSampleAuditEvidenceDigest',
    'accountingBoundary', 'workReceiptDigest',
  ], 'workReceipt');
  for (const label of [
    'acceptedIntegrationCount', 'observationAuditCount', 'solverIntegratorWorkUnits',
    'composerEndpointRankAuditWorkUnits', 'integrationReceiptedWorkUnits',
    'observationForceAuditWorkUnits', 'observationRankAuditWorkUnits',
    'observationAuditWorkUnits', 'totalReceiptedSolverAndObservationWorkUnits',
  ] as const) assertNonnegativeSafeInteger(work[label], `workReceipt.${label}`);
  assertStepMaximumShape(work.maximumPerStepIntegrationWork, 'maximumPerStepIntegrationWork', true);
  assertStepMaximumShape(work.maximumPerObservationForceAuditWork, 'maximumPerObservationForceAuditWork', true);
  assertStepMaximumShape(work.maximumPerObservationRankAuditWork, 'maximumPerObservationRankAuditWork', true);
  assertDigestString(work.perSampleAuditEvidenceDigest, 'workReceipt.perSampleAuditEvidenceDigest');
  assertDigestString(work.workReceiptDigest, 'workReceipt.workReceiptDigest');
  assertStringArrayExact(work.accountingBoundary, [
    'solverIntegratorWorkUnits and composerEndpointRankAuditWorkUnits are disjoint fields whose sum is the published per-step integration total',
    'observation force and rank audits are separately receipted and are not included in the integration total',
    'constructor validation, verifier analysis, digest hashing, pair scans, and wall-clock time are excluded because no kernel work units are published for them',
  ], 'workReceipt.accountingBoundary');
}

function assertMembershipShape(
  membership: AqueousDynamicsLongVerificationReportV042['longRunReceipt']['lennardJonesCutoffMembership'],
) {
  assertExactKeys(asRecord(membership, 'lennardJonesCutoffMembership'), [
    'cutoffAngstrom', 'sampling', 'atomIds', 'pairUniverseInteractionIds',
    'initialMemberIds', 'finalMemberIds', 'initialMemberCount', 'finalMemberCount',
    'enteredEventCount', 'exitedEventCount', 'totalTransitionCount',
    'stepsWithTransitions', 'events', 'eventDigest',
  ], 'lennardJonesCutoffMembership');
  if (membership.cutoffAngstrom !== 10
    || membership.sampling !== 'accepted-endpoint-strict-less-than-cutoff-membership-set') {
    throw new Error('Lennard-Jones cutoff contract mismatch');
  }
  for (const label of [
    'initialMemberCount', 'finalMemberCount', 'enteredEventCount', 'exitedEventCount',
    'totalTransitionCount', 'stepsWithTransitions',
  ] as const) assertNonnegativeSafeInteger(membership[label], `membership.${label}`);
  assertDigestString(membership.eventDigest, 'membership.eventDigest');
  assertStringArray(membership.atomIds, 'membership.atomIds');
  assertStringArray(membership.pairUniverseInteractionIds, 'membership.pairUniverseInteractionIds');
  assertStringArray(membership.initialMemberIds, 'membership.initialMemberIds');
  assertStringArray(membership.finalMemberIds, 'membership.finalMemberIds');
  assertArrayShape(membership.events, undefined, 'membership.events');
  for (const [index, event] of membership.events.entries()) {
    assertExactKeys(asRecord(event, `membership.events[${index}]`), [
      'step', 'interactionId', 'transition',
    ], `membership.events[${index}]`);
  }
}

function assertTrajectoryShape(
  trajectory: AqueousDynamicsLongVerificationReportV042['longRunReceipt']['trajectory'],
) {
  assertExactKeys(asRecord(trajectory, 'trajectory'), [
    'sampleCount', 'sampleBinding', 'auditColumns', 'auditSamples',
    'auditEvidenceDigest', 'sampleDigests', 'trajectoryDigest', 'checkpointRule',
    'checkpointCount', 'checkpoints', 'checkpointDigest',
  ], 'trajectory');
  assertArrayShape(trajectory.auditColumns, AUDIT_COLUMNS.length, 'trajectory.auditColumns');
  assertArrayShape(trajectory.auditSamples, 10_001, 'trajectory.auditSamples');
  assertArrayShape(trajectory.sampleDigests, 10_001, 'trajectory.sampleDigests');
  assertArrayShape(trajectory.checkpoints, 13, 'trajectory.checkpoints');
  for (const [index, checkpointValue] of trajectory.checkpoints.entries()) {
    assertExactKeys(asRecord(checkpointValue, `checkpoints[${index}]`), [
      'step', 'timePicoseconds', 'stateDigest', 'physicalDigest', 'observationDigest',
      'integrationReceiptDigest', 'sampleDigest',
    ], `checkpoints[${index}]`);
  }
}

function recomputeAuditEvidence(
  report: AqueousDynamicsLongVerificationReportV042,
): RecomputedAudit {
  const trajectory = report.longRunReceipt.trajectory;
  if (trajectory.sampleCount !== 10_001
    || trajectory.sampleBinding
      !== 'state-physical-observation-integration-energy-residual-membership-and-work-v1'
    || trajectory.auditColumns.some((column, index) => column !== AUDIT_COLUMNS[index])) {
    throw new Error('trajectory audit namespace mismatch');
  }
  const samples = trajectory.auditSamples;
  let timeSum = 0;
  let energySum = 0;
  let timeSquaredSum = 0;
  let timeEnergySum = 0;
  const initialEnergy = samples[0]?.[AUDIT_INDEX.totalEnergy];
  assertFiniteNumber(initialEnergy, 'initial audit energy');
  const energyReference = Math.max(1, Math.abs(initialEnergy));
  let maximumAbsoluteEnergy = stepMaximum(0, 0);
  let maximumMomentum = stepMaximum(0, 0);
  let maximumInternalForce = stepMaximum(0, 0);
  let maximumPosition = stepMaximum(0, 0);
  let maximumVelocity = stepMaximum(0, 0);
  let maximumMass = stepMaximum(0, 0);
  let maximumCharge = stepMaximum(0, 0);
  let minimumPair: MinimumPairReceipt | null = null;
  let solver = 0;
  let endpointRank = 0;
  let observationForce = 0;
  let observationRank = 0;
  let maximumIntegration = stepMaximum(0, 0);
  let maximumObservationForce = stepMaximum(0, 0);
  let maximumObservationRank = stepMaximum(0, 0);
  const seenSampleDigests = new Set<string>();
  const atomUniverse = new Set(report.longRunReceipt.lennardJonesCutoffMembership.atomIds);

  for (let index = 0; index < samples.length; index += 1) {
    const sample = samples[index];
    assertArrayShape(sample, AUDIT_COLUMNS.length, `auditSamples[${index}]`);
    assertSafeIntegerExact(sample[AUDIT_INDEX.step], index, `auditSamples[${index}].step`);
    const time = sample[AUDIT_INDEX.time];
    if (time !== index * AQUEOUS_DYNAMICS_TIME_STEP_PS_V042) {
      throw new Error(`audit sample ${index} time namespace mismatch`);
    }
    const energy = sample[AUDIT_INDEX.totalEnergy];
    assertFiniteNumber(energy, `auditSamples[${index}].totalEnergy`);
    for (const field of [
      AUDIT_INDEX.momentum, AUDIT_INDEX.internalForce, AUDIT_INDEX.positionConstraint,
      AUDIT_INDEX.velocityConstraint, AUDIT_INDEX.mass, AUDIT_INDEX.charge,
      AUDIT_INDEX.minimumDistance,
    ] as const) assertNonnegativeFinite(sample[field], `auditSamples[${index}][${field}]`);
    assertStableToken(sample[AUDIT_INDEX.minimumAtomA], `auditSamples[${index}].minimumAtomA`);
    assertStableToken(sample[AUDIT_INDEX.minimumAtomB], `auditSamples[${index}].minimumAtomB`);
    if (compareAscii(sample[AUDIT_INDEX.minimumAtomA], sample[AUDIT_INDEX.minimumAtomB]) >= 0) {
      throw new Error(`audit sample ${index} minimum pair is not canonical`);
    }
    if (!atomUniverse.has(sample[AUDIT_INDEX.minimumAtomA])
      || !atomUniverse.has(sample[AUDIT_INDEX.minimumAtomB])) {
      throw new Error(`audit sample ${index} minimum pair is outside the atom universe`);
    }
    const solverWork = sample[AUDIT_INDEX.solverWork];
    const endpointWork = sample[AUDIT_INDEX.endpointRankWork];
    const forceWork = sample[AUDIT_INDEX.observationForceWork];
    const rankWork = sample[AUDIT_INDEX.observationRankWork];
    for (const [label, value] of [
      ['solver', solverWork], ['endpointRank', endpointWork],
      ['observationForce', forceWork], ['observationRank', rankWork],
    ] as const) assertNonnegativeSafeInteger(value, `auditSamples[${index}].${label}`);
    if ((index === 0 && (solverWork !== 0 || endpointWork !== 0))
      || (index > 0 && (solverWork <= 0 || endpointWork <= 0))
      || forceWork <= 0 || rankWork <= 0) {
      throw new Error(`audit sample ${index} work evidence is not positive in its namespace`);
    }
    for (const field of [
      AUDIT_INDEX.stateDigest, AUDIT_INDEX.physicalDigest, AUDIT_INDEX.observationDigest,
      AUDIT_INDEX.forceFieldDigest, AUDIT_INDEX.membershipDigest,
    ] as const) assertDigestString(sample[field], `auditSamples[${index}][${field}]`);
    if (index === 0) {
      if (sample[AUDIT_INDEX.integrationReceiptDigest] !== null) {
        throw new Error('initial audit sample must not have an integration receipt');
      }
    } else assertDigestString(
      sample[AUDIT_INDEX.integrationReceiptDigest],
      `auditSamples[${index}].integrationReceiptDigest`,
    );
    const sampleDigest = trajectory.sampleDigests[index];
    assertDigestString(sampleDigest, `sampleDigests[${index}]`);
    if (sampleDigest !== digestValue(sample) || seenSampleDigests.has(sampleDigest)) {
      throw new Error(`trajectory sample digest ${index} is invalid or repeated`);
    }
    seenSampleDigests.add(sampleDigest);

    timeSum += time;
    energySum += energy;
    timeSquaredSum += time ** 2;
    timeEnergySum += time * energy;
    const absoluteEnergy = Math.abs(energy - initialEnergy);
    maximumAbsoluteEnergy = updateMaximum(maximumAbsoluteEnergy, absoluteEnergy, index);
    maximumMomentum = updateMaximum(maximumMomentum, sample[AUDIT_INDEX.momentum], index);
    maximumInternalForce = updateMaximum(maximumInternalForce, sample[AUDIT_INDEX.internalForce], index);
    maximumPosition = updateMaximum(maximumPosition, sample[AUDIT_INDEX.positionConstraint], index);
    maximumVelocity = updateMaximum(maximumVelocity, sample[AUDIT_INDEX.velocityConstraint], index);
    maximumMass = updateMaximum(maximumMass, sample[AUDIT_INDEX.mass], index);
    maximumCharge = updateMaximum(maximumCharge, sample[AUDIT_INDEX.charge], index);
    const pair = {
      distanceAngstrom: sample[AUDIT_INDEX.minimumDistance],
      atomAId: sample[AUDIT_INDEX.minimumAtomA],
      atomBId: sample[AUDIT_INDEX.minimumAtomB],
      step: index,
    };
    if (!minimumPair || pair.distanceAngstrom < minimumPair.distanceAngstrom) minimumPair = pair;
    solver = safeSum(solver, solverWork);
    endpointRank = safeSum(endpointRank, endpointWork);
    observationForce = safeSum(observationForce, forceWork);
    observationRank = safeSum(observationRank, rankWork);
    maximumIntegration = updateMaximum(maximumIntegration, safeSum(solverWork, endpointWork), index);
    maximumObservationForce = updateMaximum(maximumObservationForce, forceWork, index);
    maximumObservationRank = updateMaximum(maximumObservationRank, rankWork, index);
  }
  if (!minimumPair) throw new Error('audit evidence has no minimum pair');
  const statisticsBase = {
    sampleCount: samples.length,
    timeSumPicoseconds: timeSum,
    energySumKjMol: energySum,
    timeSquaredSumPicoseconds2: timeSquaredSum,
    timeEnergySumKjMolPicoseconds: timeEnergySum,
    maximumAbsoluteExcursionKjMol: maximumAbsoluteEnergy.value,
    maximumAbsoluteExcursionStep: maximumAbsoluteEnergy.step,
  };
  const slope = energyDriftSlopeFromStatistics(statisticsBase);
  return {
    statistics: {
      ...statisticsBase,
      maximumRelativeExcursion: maximumAbsoluteEnergy.value / energyReference,
      maximumRelativeExcursionStep: maximumAbsoluteEnergy.step,
      linearDriftSlopeKjMolPerPicosecond: slope,
      linearRelativeDriftRatePerPicosecond: slope / energyReference,
    },
    energyReferenceKjMol: energyReference,
    finalTotalEnergyKjMol: samples.at(-1)![AUDIT_INDEX.totalEnergy],
    maximumResiduals: {
      momentumDaltonAngstromPerPicosecond: maximumMomentum,
      internalForceKjMolAngstrom: maximumInternalForce,
      positionConstraintAngstrom: maximumPosition,
      velocityConstraintAngstrom2PerPicosecond: maximumVelocity,
      massDalton: maximumMass,
      chargeE: maximumCharge,
    },
    minimumPair,
    work: {
      solver,
      endpointRank,
      observationForce,
      observationRank,
      maximumIntegration,
      maximumObservationForce,
      maximumObservationRank,
    },
  };
}

function assertAuditDerivedSummaries(
  report: AqueousDynamicsLongVerificationReportV042,
  recomputed: RecomputedAudit,
) {
  const receipt = report.longRunReceipt;
  if (digestValue(receipt.energy.statistics) !== digestValue(recomputed.statistics)
    || receipt.energy.initialTotalKjMol
      !== receipt.trajectory.auditSamples[0][AUDIT_INDEX.totalEnergy]
    || receipt.energy.finalTotalKjMol !== recomputed.finalTotalEnergyKjMol
    || receipt.energy.energyReferenceKjMol !== recomputed.energyReferenceKjMol
    || receipt.energy.maximumAbsoluteExcursionKjMol
      !== recomputed.statistics.maximumAbsoluteExcursionKjMol
    || receipt.energy.maximumAbsoluteExcursionStep
      !== recomputed.statistics.maximumAbsoluteExcursionStep
    || receipt.energy.maximumRelativeExcursion !== recomputed.statistics.maximumRelativeExcursion
    || receipt.energy.maximumRelativeExcursionStep
      !== recomputed.statistics.maximumRelativeExcursionStep
    || receipt.energy.linearDriftSlopeKjMolPerPicosecond
      !== recomputed.statistics.linearDriftSlopeKjMolPerPicosecond
    || receipt.energy.linearRelativeDriftRatePerPicosecond
      !== recomputed.statistics.linearRelativeDriftRatePerPicosecond
    || digestValue(receipt.maximumResiduals) !== digestValue(recomputed.maximumResiduals)
    || digestValue(receipt.minimumNonexcludedPair) !== digestValue(recomputed.minimumPair)) {
    throw new Error('audit-derived energy, residual, or minimum-pair summary mismatch');
  }
}

function assertWorkSemantics(
  work: AqueousDynamicsLongVerificationReportV042['longRunReceipt']['workReceipt'],
  thresholds: LockedThresholds,
  recomputed: RecomputedAudit,
) {
  const { workReceiptDigest, ...payload } = work;
  if (workReceiptDigest !== digestValue(payload)) throw new Error('long work receipt digest mismatch');
  if (work.acceptedIntegrationCount !== 10_000 || work.observationAuditCount !== 10_001
    || work.solverIntegratorWorkUnits !== recomputed.work.solver
    || work.composerEndpointRankAuditWorkUnits !== recomputed.work.endpointRank
    || work.observationForceAuditWorkUnits !== recomputed.work.observationForce
    || work.observationRankAuditWorkUnits !== recomputed.work.observationRank
    || work.integrationReceiptedWorkUnits !== safeSum(recomputed.work.solver, recomputed.work.endpointRank)
    || work.observationAuditWorkUnits !== safeSum(
      recomputed.work.observationForce,
      recomputed.work.observationRank,
    )
    || work.totalReceiptedSolverAndObservationWorkUnits !== safeSum(
      work.integrationReceiptedWorkUnits,
      work.observationAuditWorkUnits,
    )
    || work.integrationReceiptedWorkUnits <= 0
    || digestValue(work.maximumPerStepIntegrationWork)
      !== digestValue(recomputed.work.maximumIntegration)
    || digestValue(work.maximumPerObservationForceAuditWork)
      !== digestValue(recomputed.work.maximumObservationForce)
    || digestValue(work.maximumPerObservationRankAuditWork)
      !== digestValue(recomputed.work.maximumObservationRank)
    || work.maximumPerStepIntegrationWork.value <= 0
    || work.maximumPerStepIntegrationWork.step < 1
    || work.maximumPerStepIntegrationWork.value > thresholds.maximumStepWorkUnits
    || work.maximumPerObservationForceAuditWork.value > thresholds.maximumForceEvaluationWorkUnits
    || work.maximumPerObservationRankAuditWork.value > thresholds.maximumConstraintJacobianRankWorkUnits) {
    throw new Error('long work receipt accounting mismatch');
  }
}

function assertMembershipSemantics(
  membership: AqueousDynamicsLongVerificationReportV042['longRunReceipt']['lennardJonesCutoffMembership'],
  auditSamples: ReadonlyArray<PerSampleAuditEvidence>,
) {
  assertCanonicalUniqueStrings(membership.atomIds, 8, 'membership.atomIds', true);
  const expectedUniverse: string[] = [];
  for (let left = 0; left < membership.atomIds.length; left += 1) {
    for (let right = left + 1; right < membership.atomIds.length; right += 1) {
      expectedUniverse.push(`lj:${membership.atomIds[left]}:${membership.atomIds[right]}`);
    }
  }
  assertStringArrayExact(membership.pairUniverseInteractionIds, expectedUniverse, 'pair universe');
  assertCanonicalUniqueStrings(membership.initialMemberIds, undefined, 'initial membership', false);
  assertCanonicalUniqueStrings(membership.finalMemberIds, undefined, 'final membership', false);
  const universe = new Set(expectedUniverse);
  if (membership.initialMemberIds.some((id) => !universe.has(id))
    || membership.finalMemberIds.some((id) => !universe.has(id))) {
    throw new Error('Lennard-Jones membership is outside the pair universe');
  }
  const current = new Set(membership.initialMemberIds);
  if (auditSamples[0][AUDIT_INDEX.membershipDigest]
    !== digestValue([...current].sort(compareAscii))) {
    throw new Error('initial Lennard-Jones membership digest mismatch');
  }
  let entered = 0;
  let exited = 0;
  const eventSteps = new Set<number>();
  const pairsAtStep = new Set<string>();
  let previousOrderKey = '';
  let eventIndex = 0;
  for (let step = 1; step <= 10_000; step += 1) {
    pairsAtStep.clear();
    while (eventIndex < membership.events.length && membership.events[eventIndex].step === step) {
      const event = membership.events[eventIndex];
      assertSafeIntegerInRange(event.step, 1, 10_000, `events[${eventIndex}].step`);
      if (!universe.has(event.interactionId)
        || (event.transition !== 'entered-strict-cutoff'
          && event.transition !== 'exited-strict-cutoff')) {
        throw new Error(`Lennard-Jones event ${eventIndex} is outside its namespace`);
      }
      const orderKey = `${event.step.toString().padStart(5, '0')}\0${event.transition === 'entered-strict-cutoff' ? '0' : '1'}\0${event.interactionId}`;
      if (orderKey <= previousOrderKey || pairsAtStep.has(event.interactionId)) {
        throw new Error('Lennard-Jones events are not in canonical unique order');
      }
      previousOrderKey = orderKey;
      pairsAtStep.add(event.interactionId);
      eventSteps.add(step);
      if (event.transition === 'entered-strict-cutoff') {
        if (current.has(event.interactionId)) throw new Error('Lennard-Jones enter event repeats membership');
        current.add(event.interactionId);
        entered += 1;
      } else {
        if (!current.has(event.interactionId)) throw new Error('Lennard-Jones exit event lacks membership');
        current.delete(event.interactionId);
        exited += 1;
      }
      eventIndex += 1;
    }
    if (auditSamples[step][AUDIT_INDEX.membershipDigest]
      !== digestValue([...current].sort(compareAscii))) {
      throw new Error(`Lennard-Jones membership digest mismatch at step ${step}`);
    }
  }
  if (eventIndex !== membership.events.length
    || membership.eventDigest !== digestValue(membership.events)
    || membership.initialMemberCount !== membership.initialMemberIds.length
    || membership.finalMemberCount !== membership.finalMemberIds.length
    || membership.enteredEventCount !== entered || membership.exitedEventCount !== exited
    || membership.totalTransitionCount !== safeSum(entered, exited)
    || membership.totalTransitionCount !== membership.events.length
    || membership.stepsWithTransitions !== eventSteps.size
    || !sameStringArray([...current].sort(compareAscii), membership.finalMemberIds)) {
    throw new Error('Lennard-Jones membership replay receipt mismatch');
  }
}

function assertTrajectorySemantics(
  report: AqueousDynamicsLongVerificationReportV042,
) {
  const trajectory = report.longRunReceipt.trajectory;
  const final = report.longRunReceipt.final;
  const expectedCheckpointSteps = [0, 1, 10, ...Array.from({ length: 10 }, (_, index) => (index + 1) * 1_000)];
  if (trajectory.auditEvidenceDigest !== digestValue({
    columns: trajectory.auditColumns,
    samples: trajectory.auditSamples,
  }) || trajectory.auditEvidenceDigest
      !== report.longRunReceipt.workReceipt.perSampleAuditEvidenceDigest
    || trajectory.trajectoryDigest !== digestValue({
      algorithm: 'canonical-sha256-sample-list-v1',
      sampleDigests: trajectory.sampleDigests,
    })
    || trajectory.checkpointRule !== 'steps-0-1-10-and-every-1000'
    || trajectory.checkpointCount !== 13
    || trajectory.checkpointDigest !== digestValue(trajectory.checkpoints)
    || trajectory.checkpoints.some((entry, index) => (
      entry.step !== expectedCheckpointSteps[index]
      || entry.timePicoseconds !== entry.step * AQUEOUS_DYNAMICS_TIME_STEP_PS_V042
      || entry.sampleDigest !== trajectory.sampleDigests[entry.step]
      || entry.stateDigest !== trajectory.auditSamples[entry.step][AUDIT_INDEX.stateDigest]
      || entry.physicalDigest !== trajectory.auditSamples[entry.step][AUDIT_INDEX.physicalDigest]
      || entry.observationDigest !== trajectory.auditSamples[entry.step][AUDIT_INDEX.observationDigest]
      || entry.integrationReceiptDigest
        !== trajectory.auditSamples[entry.step][AUDIT_INDEX.integrationReceiptDigest]
    ))) {
    throw new Error('trajectory or checkpoint digest mismatch');
  }
  for (const [index, entry] of trajectory.checkpoints.entries()) {
    assertSafeIntegerExact(entry.step, expectedCheckpointSteps[index], `checkpoints[${index}].step`);
    assertFiniteNumber(entry.timePicoseconds, `checkpoints[${index}].time`);
    for (const [label, digest] of Object.entries({
      stateDigest: entry.stateDigest,
      physicalDigest: entry.physicalDigest,
      observationDigest: entry.observationDigest,
      sampleDigest: entry.sampleDigest,
    })) assertDigestString(digest, `checkpoints[${index}].${label}`);
    if (entry.step === 0) {
      if (entry.integrationReceiptDigest !== null) throw new Error('checkpoint zero integration receipt mismatch');
    } else assertDigestString(entry.integrationReceiptDigest, `checkpoints[${index}].integrationReceiptDigest`);
  }
  const initialCheckpoint = trajectory.checkpoints[0];
  const finalCheckpoint = trajectory.checkpoints.at(-1)!;
  if (initialCheckpoint.stateDigest !== report.fixture.initialStateDigest
    || initialCheckpoint.observationDigest !== report.fixture.initialObservationDigest
    || finalCheckpoint.stateDigest !== final.stateDigest
    || finalCheckpoint.physicalDigest !== final.physicalDigest
    || finalCheckpoint.observationDigest !== final.observationDigest
    || finalCheckpoint.integrationReceiptDigest !== final.finalIntegrationReceiptDigest
    || final.step !== 10_000
    || final.stateDigest === report.fixture.initialStateDigest) {
    throw new Error('initial/final checkpoint identity mismatch');
  }
  for (const [label, digest] of Object.entries(final)) {
    if (label === 'step') continue;
    assertDigestString(digest, `final.${label}`);
  }
}

function assertDeterminismSemantics(report: AqueousDynamicsLongVerificationReportV042) {
  const determinism = report.determinism;
  const trajectory = report.longRunReceipt.trajectory;
  const primaryPrefixSampleDigests = trajectory.sampleDigests.slice(0, 11);
  const boundPrimaryPrefixDigest = digestValue(primaryPrefixSampleDigests);
  assertArrayShape(determinism.replaySampleDigests, 11, 'determinism.replaySampleDigests');
  assertStringArrayExact(
    determinism.replayWorkColumns,
    REPLAY_WORK_COLUMNS,
    'determinism.replayWorkColumns',
  );
  assertArrayShape(determinism.replayWorkSamples, 11, 'determinism.replayWorkSamples');
  let recomputedReplayWork = 0;
  for (let index = 0; index < 11; index += 1) {
    const replaySampleDigest = determinism.replaySampleDigests[index];
    assertDigestString(replaySampleDigest, `determinism.replaySampleDigests[${index}]`);
    if (replaySampleDigest !== primaryPrefixSampleDigests[index]) {
      throw new Error(`short prefix replay sample ${index} mismatch`);
    }
    const workSample = determinism.replayWorkSamples[index];
    assertArrayShape(workSample, REPLAY_WORK_COLUMNS.length, `determinism.replayWorkSamples[${index}]`);
    assertSafeIntegerExact(workSample[0], index, `determinism.replayWorkSamples[${index}].step`);
    for (let column = 1; column < REPLAY_WORK_COLUMNS.length; column += 1) {
      assertNonnegativeSafeInteger(
        workSample[column],
        `determinism.replayWorkSamples[${index}][${column}]`,
      );
    }
    if ((index === 0 && (workSample[1] !== 0 || workSample[2] !== 0))
      || (index > 0 && (workSample[1] <= 0 || workSample[2] <= 0))
      || workSample[3] <= 0 || workSample[4] <= 0
      || workSample[1] !== trajectory.auditSamples[index][AUDIT_INDEX.solverWork]
      || workSample[2] !== trajectory.auditSamples[index][AUDIT_INDEX.endpointRankWork]
      || workSample[3] !== trajectory.auditSamples[index][AUDIT_INDEX.observationForceWork]
      || workSample[4] !== trajectory.auditSamples[index][AUDIT_INDEX.observationRankWork]) {
      throw new Error(`short prefix replay work sample ${index} mismatch`);
    }
    recomputedReplayWork = safeSum(
      recomputedReplayWork,
      workSample[1],
      workSample[2],
      workSample[3],
      workSample[4],
    );
  }
  const { receiptDigest, ...payload } = determinism;
  if (receiptDigest !== digestValue(payload)
    || determinism.evidenceClass !== 'initial-plus-short-accepted-prefix-replay'
    || determinism.primaryPrefixAcceptedSteps !== 10
    || determinism.replayPrefixAcceptedSteps !== 10
    || determinism.comparedSampleCount !== 11
    || determinism.primaryPrefixDigest !== boundPrimaryPrefixDigest
    || determinism.replayPrefixDigest !== digestValue(determinism.replaySampleDigests)
    || determinism.primaryPrefixDigest !== determinism.replayPrefixDigest
    || determinism.replayWorkEvidenceDigest !== digestValue({
      columns: determinism.replayWorkColumns,
      samples: determinism.replayWorkSamples,
    })
    || determinism.exactSampleDigestEquality !== true
    || determinism.fullTenThousandStepReplayPerformed !== false
    || determinism.futureFullReplayBoundary
      !== 'a-second-independent-10000-step-run-must-match-all-sample-final-and-checkpoint-digests-before-claiming-full-replay'
    || determinism.replayReceiptedWorkUnits !== recomputedReplayWork
    || recomputedReplayWork <= 0) {
    throw new Error('short prefix replay receipt mismatch');
  }
  assertDigestString(determinism.primaryPrefixDigest, 'determinism.primaryPrefixDigest');
  assertDigestString(determinism.replayPrefixDigest, 'determinism.replayPrefixDigest');
  assertDigestString(determinism.replayWorkEvidenceDigest, 'determinism.replayWorkEvidenceDigest');
  assertDigestString(determinism.receiptDigest, 'determinism.receiptDigest');
}

function recomputeReportGates(report: AqueousDynamicsLongVerificationReportV042) {
  const receipt = report.longRunReceipt;
  const residuals = receipt.maximumResiduals;
  const work = receipt.workReceipt;
  return {
    acceptedStepHorizon:
      report.fixture.acceptedStepsExecuted === 10_000 && report.fixture.toStep === 10_000
      && receipt.final.step === 10_000 && receipt.energy.statistics.sampleCount === 10_001,
    energyStatisticsClosure:
      receipt.energy.statistics.maximumRelativeExcursion === receipt.energy.maximumRelativeExcursion
      && receipt.energy.statistics.maximumRelativeExcursionStep === receipt.energy.maximumRelativeExcursionStep
      && receipt.energy.statistics.linearRelativeDriftRatePerPicosecond
        === receipt.energy.linearRelativeDriftRatePerPicosecond,
    energyExcursion: receipt.energy.maximumRelativeExcursion
      <= report.thresholds.maximumRelativeEnergyExcursion,
    momentumClosure: residuals.momentumDaltonAngstromPerPicosecond.value
      <= report.thresholds.momentumResidualLimit,
    internalForceClosure: residuals.internalForceKjMolAngstrom.value
      <= report.thresholds.internalForceResidualLimitKjMolAngstrom,
    positionConstraintClosure: residuals.positionConstraintAngstrom.value
      <= report.thresholds.positionConstraintToleranceAngstrom,
    velocityConstraintClosure: residuals.velocityConstraintAngstrom2PerPicosecond.value
      <= report.thresholds.velocityConstraintToleranceAngstrom2PerPicosecond,
    massAndChargeClosure: residuals.massDalton.value === 0 && residuals.chargeE.value === 0,
    minimumNonexcludedDistance: receipt.minimumNonexcludedPair.distanceAngstrom
      >= report.thresholds.minimumNonexcludedDistanceAngstrom,
    integrationWorkClosure: work.integrationReceiptedWorkUnits
      === safeSum(work.solverIntegratorWorkUnits, work.composerEndpointRankAuditWorkUnits)
      && work.integrationReceiptedWorkUnits > 0
      && work.maximumPerStepIntegrationWork.value > 0
      && work.maximumPerStepIntegrationWork.value <= report.thresholds.maximumStepWorkUnits,
    observationAuditWorkClosure: work.observationAuditWorkUnits
      === safeSum(work.observationForceAuditWorkUnits, work.observationRankAuditWorkUnits)
      && work.maximumPerObservationForceAuditWork.value
        <= report.thresholds.maximumForceEvaluationWorkUnits
      && work.maximumPerObservationRankAuditWork.value
        <= report.thresholds.maximumConstraintJacobianRankWorkUnits,
    lennardJonesMembershipAccounting: receipt.lennardJonesCutoffMembership.totalTransitionCount
      === receipt.lennardJonesCutoffMembership.events.length,
    trajectoryAndCheckpointBinding: receipt.trajectory.sampleDigests.length === 10_001
      && receipt.trajectory.checkpoints.length === 13
      && receipt.trajectory.checkpoints.at(-1)?.sampleDigest
        === receipt.trajectory.sampleDigests.at(-1),
    deterministicPrefixReplay: report.determinism.exactSampleDigestEquality
      && report.determinism.primaryPrefixDigest === report.determinism.replayPrefixDigest,
  } satisfies Record<AqueousDynamicsLongVerificationGateNameV042, boolean>;
}

function assertExactGateRecord(
  actual: Readonly<Record<AqueousDynamicsLongVerificationGateNameV042, true>>,
  expected: Record<AqueousDynamicsLongVerificationGateNameV042, boolean>,
) {
  for (const name of AQUEOUS_DYNAMICS_LONG_VERIFICATION_GATE_NAMES_V042) {
    if (actual[name] !== expected[name] || actual[name] !== true) {
      throw new Error(`aqueous dynamics long verification gate ${name} mismatch`);
    }
  }
}

function energyDriftSlopeFromStatistics(statistics: Readonly<{
  sampleCount: number;
  timeSumPicoseconds: number;
  energySumKjMol: number;
  timeSquaredSumPicoseconds2: number;
  timeEnergySumKjMolPicoseconds: number;
}>) {
  const denominator = statistics.sampleCount * statistics.timeSquaredSumPicoseconds2
    - statistics.timeSumPicoseconds ** 2;
  if (statistics.sampleCount < 2 || denominator === 0) return 0;
  const numerator = statistics.sampleCount * statistics.timeEnergySumKjMolPicoseconds
    - statistics.timeSumPicoseconds * statistics.energySumKjMol;
  const slope = numerator / denominator;
  if (!Number.isFinite(slope)) throw new Error('audit energy drift slope is non-finite');
  return canonicalNumber(slope);
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be a plain record`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must have a plain record prototype`);
  }
  return value;
}

function assertArrayShape(value: unknown, length: number | undefined, label: string) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) {
    throw new Error(`${label} must be a plain array`);
  }
  if (length !== undefined && value.length !== length) {
    throw new Error(`${label} length mismatch`);
  }
  const keys = Reflect.ownKeys(value);
  const expected = [...Array.from({ length: value.length }, (_, index) => String(index)), 'length'];
  if (keys.length !== expected.length || keys.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} has hidden, symbolic, sparse, or extra keys`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error(`${label}[${index}] is not an enumerable data item`);
    }
  }
}

function assertStringArray(value: unknown, label: string): asserts value is ReadonlyArray<string> {
  assertArrayShape(value, undefined, label);
  for (const [index, entry] of (value as unknown[]).entries()) {
    if (typeof entry !== 'string') throw new Error(`${label}[${index}] must be a string`);
  }
}

function assertStringArrayExact(
  value: unknown,
  expected: ReadonlyArray<string>,
  label: string,
) {
  assertStringArray(value, label);
  if (!sameStringArray(value, expected)) throw new Error(`${label} canonical value mismatch`);
}

function assertCanonicalUniqueStrings(
  value: unknown,
  length: number | undefined,
  label: string,
  stableTokens: boolean,
) {
  assertStringArray(value, label);
  if (length !== undefined && value.length !== length) throw new Error(`${label} length mismatch`);
  if (new Set(value).size !== value.length
    || value.some((entry, index) => index > 0 && compareAscii(value[index - 1], entry) >= 0)) {
    throw new Error(`${label} must be strictly ASCII-sorted and unique`);
  }
  if (stableTokens) {
    for (const [index, entry] of value.entries()) assertStableToken(entry, `${label}[${index}]`);
  } else {
    for (const [index, entry] of value.entries()) {
      if (!/^lj:[A-Za-z0-9._-]+:[A-Za-z0-9._-]+$/.test(entry)) {
        throw new Error(`${label}[${index}] is not a canonical LJ interaction ID`);
      }
    }
  }
}

function sameStringArray(left: ReadonlyArray<string>, right: ReadonlyArray<string>) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function assertFiniteNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertNonnegativeFinite(value: unknown, label: string): asserts value is number {
  assertFiniteNumber(value, label);
  if (value < 0) throw new Error(`${label} must be nonnegative`);
}

function assertNonnegativeSafeInteger(value: unknown, label: string): asserts value is number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label} must be a nonnegative safe integer`);
  }
}

function assertSafeIntegerExact(value: unknown, expected: number, label: string) {
  if (!Number.isSafeInteger(value) || value !== expected) throw new Error(`${label} mismatch`);
}

function assertSafeIntegerInRange(value: unknown, minimum: number, maximum: number, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${label} is outside [${minimum}, ${maximum}]`);
  }
}

function assertSafeStep(value: unknown, label: string) {
  assertSafeIntegerInRange(value, 0, AQUEOUS_DYNAMICS_LONG_VERIFICATION_STEPS_V042, label);
}

function assertDigestString(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) {
    throw new Error(`${label} must be a canonical SHA-256 digest`);
  }
}

function assertStableToken(value: unknown, label: string): asserts value is string {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)) {
    throw new Error(`${label} must be a stable ASCII token`);
  }
}

function assertStepMaximumShape(value: unknown, label: string, requirePositive: boolean) {
  const record = asRecord(value, label);
  assertExactKeys(record, ['value', 'step'], label);
  assertNonnegativeFinite(record.value, `${label}.value`);
  assertSafeStep(record.step, `${label}.step`);
  if (requirePositive && record.value <= 0) throw new Error(`${label}.value must be positive`);
}

function stepMaximum(value: number, step: number): StepMaximum {
  if (!Number.isFinite(value) || value < 0 || !Number.isSafeInteger(step) || step < 0) {
    throw new Error('aqueous long verification maximum sample is invalid');
  }
  return deepFreeze({ value: canonicalNumber(value), step });
}

function updateMaximum(current: StepMaximum, value: number, step: number) {
  return value > current.value ? stepMaximum(value, step) : current;
}

function withoutDigest<RecordValue extends Record<string, unknown>, Key extends keyof RecordValue>(
  value: RecordValue,
  key: Key,
) {
  const clone = { ...value };
  delete clone[key];
  return clone;
}

function pairKey(left: string, right: string) {
  return compareAscii(left, right) <= 0 ? `${left}\0${right}` : `${right}\0${left}`;
}

function compareAscii(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function safeSum(...values: number[]) {
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error('aqueous long verification work units require nonnegative safe integers');
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) throw new Error('aqueous long verification work sum is unsafe');
  return total;
}

function canonicalNumber(value: number) { return Object.is(value, -0) ? 0 : value; }

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, expected: ReadonlyArray<string>, label: string) {
  const record = asRecord(value, label);
  const ownKeys = Reflect.ownKeys(record);
  if (ownKeys.some((key) => typeof key !== 'string')) {
    throw new Error(`${label} cannot contain symbol keys`);
  }
  for (const key of ownKeys as string[]) {
    const descriptor = Object.getOwnPropertyDescriptor(record, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error(`${label}.${key} must be an enumerable data property`);
    }
  }
  const actual = (ownKeys as string[]).sort(compareAscii);
  const wanted = [...expected].sort(compareAscii);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} keys mismatch`);
  }
}

function assertDeepFrozen(value: unknown, label: string) {
  if (value && typeof value === 'object') {
    if (!Object.isFrozen(value)) throw new Error(`${label} is not deeply frozen`);
    for (const child of Object.values(value)) assertDeepFrozen(child, label);
  }
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
