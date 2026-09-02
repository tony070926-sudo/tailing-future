import type { Vector3 } from '../molecular/molecular-interactions.ts';
import { digestValue, shortDigest } from './digest.ts';
import {
  canonicalizePeriodicTopology,
  evaluatePeriodicAtomisticForces,
  maximumRuleCutoff,
  type PeriodicAtomStateV041,
  type PeriodicTopologyV041,
} from './periodic-atomistic-kernel.ts';
import {
  createPeriodicArgonCalibrationConfiguration,
  createPeriodicArgonCalibrationWorld,
  PeriodicAtomisticWorld,
  type PeriodicAtomisticObservationV041,
  type SerializedPeriodicAtomisticWorldV041,
} from './periodic-atomistic-world.ts';
import {
  DeterministicVerletNeighborList,
  enumeratePeriodicNeighborPairsOracle,
  PeriodicCell,
  type CellVectors3,
  type Int3,
  type NeighborAtomPosition,
} from './periodic-cell.ts';
import {
  evaluateForceShiftedRadialPotential,
  evaluateRadialPotential,
  type NonbondedRadialPotential,
  type RadialPotential,
} from './periodic-potentials.ts';

export const PERIODIC_ATOMISTIC_VERIFICATION_STEPS = 10_000;

export const PERIODIC_ATOMISTIC_VERIFICATION_GATE_NAMES = Object.freeze([
  'cellRoundTrip',
  'cellDomain',
  'integerTranslationInvariance',
  'micOracleAgreement',
  'micFaceContinuity',
  'neighborPairSetAgreement',
  'neighborRebuildCoverage',
  'newtonPairAntisymmetry',
  'finiteDifferenceForce',
  'energyClosure',
  'momentumClosure',
  'massClosure',
  'chargeClosure',
  'runtimeMutationCorpus',
  'deterministicPhysicalReplay',
  'deterministicFullStateReplay',
  'deterministicObservationReplay',
] as const);

export type PeriodicAtomisticVerificationGateName = typeof PERIODIC_ATOMISTIC_VERIFICATION_GATE_NAMES[number];

export type PeriodicAtomisticVerificationReportV041 = Readonly<{
  schemaVersion: 'tf.periodic-atomistic-verification/0.4.1';
  fixture: Readonly<{
    scenarioId: 'periodic-fcc-argon-calibration/v1';
    atomCount: 32;
    stepsExecuted: 10_000;
    timeStepPicoseconds: number;
    finalTimePicoseconds: number;
    energySampleCount: number;
    independentReplayStepsExecuted: 10_000;
  }>;
  cellRoundTrip: boolean;
  cellDomain: boolean;
  integerTranslationInvariance: boolean;
  micOracleAgreement: boolean;
  micFaceContinuity: boolean;
  neighborPairSetAgreement: boolean;
  neighborRebuildCoverage: boolean;
  newtonPairAntisymmetry: boolean;
  finiteDifferenceForce: boolean;
  energyClosure: boolean;
  momentumClosure: boolean;
  massClosure: boolean;
  chargeClosure: boolean;
  runtimeMutationCorpus: boolean;
  deterministicPhysicalReplay: boolean;
  deterministicFullStateReplay: boolean;
  deterministicObservationReplay: boolean;
  maximumResiduals: Readonly<{
    cellRoundTripFractional: number;
    micOracleDistanceAngstrom: number;
    micOracleVectorAngstrom: number;
    micFaceContinuityAngstrom: number;
    neighborPairSetSymmetricDifference: number;
    newtonPairAntisymmetryKjMolAngstrom: number;
    finiteDifferenceRelativeForce: number;
    relativeEnergyExcursion: number;
    momentumDaltonAngstromPerPicosecond: number;
    internalForceKjMolAngstrom: number;
    centerOfMassAngstrom: number;
    massDalton: number;
    chargeE: number;
  }>;
  thresholds: Readonly<{
    cellRoundTripFractional: number;
    micOracleAngstrom: number;
    micFaceContinuityAngstrom: number;
    newtonPairAntisymmetryKjMolAngstrom: number;
    finiteDifferenceRelativeForce: number;
    relativeEnergyExcursion: number;
    momentumDaltonAngstromPerPicosecond: number;
    internalForceKjMolAngstrom: number;
    centerOfMassAngstrom: number;
    massDalton: 0;
    chargeE: 0;
  }>;
  faceCrossings: number;
  rebuilds: number;
  runtimeMutationEvidence: Readonly<{
    casesExecuted: number;
    casesRejected: number;
    rejectedCaseIds: ReadonlyArray<string>;
    unexpectedlyAcceptedCaseIds: ReadonlyArray<string>;
  }>;
  digestSemantics: Readonly<{
    algorithm: 'SHA-256';
    purpose: 'deterministic-integrity-and-replay-comparison';
    authenticity: 'not-provided';
    signed: false;
  }>;
  digests: Readonly<{
    configuration: string;
    topology: string;
    physicalState: string;
    replayPhysicalState: string;
    fullState: string;
    replayFullState: string;
    observation: string;
    replayObservation: string;
    physicalTrajectory: string;
    replayPhysicalTrajectory: string;
    fullStateTrajectory: string;
    replayFullStateTrajectory: string;
    observationCheckpoints: string;
    replayObservationCheckpoints: string;
    verificationEvidence: string;
  }>;
}>;

type CellVerification = Readonly<{
  cellRoundTrip: boolean;
  cellDomain: boolean;
  maximumRoundTripResidual: number;
}>;

type MicVerification = Readonly<{
  micOracleAgreement: boolean;
  micFaceContinuity: boolean;
  maximumDistanceResidual: number;
  maximumVectorResidual: number;
  faceContinuityResidual: number;
}>;

type NeighborVerification = Readonly<{
  neighborPairSetAgreement: boolean;
  neighborRebuildCoverage: boolean;
  maximumPairSetSymmetricDifference: number;
}>;

type ForceVerification = Readonly<{
  newtonPairAntisymmetry: boolean;
  finiteDifferenceForce: boolean;
  maximumNewtonResidual: number;
  maximumFiniteDifferenceRelativeError: number;
}>;

type TrajectoryVerification = Readonly<{
  primary: PeriodicAtomisticWorld;
  replay: PeriodicAtomisticWorld;
  finalObservation: PeriodicAtomisticObservationV041;
  replayObservation: PeriodicAtomisticObservationV041;
  maximumMomentumResidual: number;
  maximumInternalForceResidual: number;
  maximumCenterOfMassResidual: number;
  maximumMassResidual: number;
  maximumChargeResidual: number;
  deterministicPhysicalReplay: boolean;
  deterministicFullStateReplay: boolean;
  deterministicObservationReplay: boolean;
  physicalTrajectoryDigest: string;
  replayPhysicalTrajectoryDigest: string;
  fullStateTrajectoryDigest: string;
  replayFullStateTrajectoryDigest: string;
  observationCheckpointDigest: string;
  replayObservationCheckpointDigest: string;
}>;

const ORTHORHOMBIC_CELL: CellVectors3 = [
  { x: 10, y: 0, z: 0 },
  { x: 0, y: 11, z: 0 },
  { x: 0, y: 0, z: 12 },
];

const TRICLINIC_CELL: CellVectors3 = [
  { x: 9.4, y: 0.3, z: -0.2 },
  { x: 4.1, y: 8.2, z: 0.4 },
  { x: 3.3, y: 2.7, z: 7.6 },
];

const CELL_ROUND_TRIP_LIMIT = 2e-12;
const MIC_ORACLE_LIMIT_ANGSTROM = 2e-12;
const MIC_FACE_CONTINUITY_LIMIT_ANGSTROM = 2e-12;
const NEWTON_ANTISYMMETRY_LIMIT = 1e-12;
const FINITE_DIFFERENCE_RELATIVE_FORCE_LIMIT = 3e-7;
const OBSERVATION_REPLAY_CHECKPOINTS = new Set([
  1,
  10,
  ...Array.from({ length: PERIODIC_ATOMISTIC_VERIFICATION_STEPS / 100 + 1 }, (_, index) => index * 100),
]);

/**
 * Executes the locked 32-atom, 10,000-step Argon calibration trajectory twice.
 * Geometry, neighbor, force and mutation gates are executed in the same call;
 * no field in the returned report is inferred from test-file presence.
 */
export function runPeriodicAtomisticVerification(): PeriodicAtomisticVerificationReportV041 {
  const cell = verifyCellGeometry();
  const mic = verifyMinimumImage();
  const neighbors = verifyNeighborList();
  const force = verifyPairForces();
  const integerTranslationInvariance = verifyIntegerTranslationInvariance();
  const trajectory = runArgonReplayPair();
  const final = trajectory.finalObservation;
  const finalReplay = trajectory.replayObservation;
  const mutationFixture = createPeriodicArgonCalibrationWorld();
  mutationFixture.advance(37);
  const mutationEvidence = executeRuntimeMutationCorpus(mutationFixture.serialize());
  const maximumRelativeEnergyExcursion = final.energy.maximumRelativeExcursion;
  const energyClosure = final.step === PERIODIC_ATOMISTIC_VERIFICATION_STEPS
    && final.energy.sampleCount === PERIODIC_ATOMISTIC_VERIFICATION_STEPS + 1
    && maximumRelativeEnergyExcursion <= final.numericalValidity.maximumRelativeEnergyExcursionLimit;
  const momentumClosure = trajectory.maximumMomentumResidual <= final.numericalValidity.momentumResidualLimit
    && trajectory.maximumInternalForceResidual <= final.numericalValidity.internalForceResidualLimit
    && trajectory.maximumCenterOfMassResidual <= final.numericalValidity.centerOfMassResidualLimitAngstrom;
  const massClosure = trajectory.maximumMassResidual === 0;
  const chargeClosure = trajectory.maximumChargeResidual === 0;
  const runtimeMutationCorpus = mutationEvidence.casesExecuted > 0
    && mutationEvidence.casesRejected === mutationEvidence.casesExecuted;
  const primaryNeighborDiagnostics = trajectory.primary.neighborCacheDiagnostics();
  const replayNeighborDiagnostics = trajectory.replay.neighborCacheDiagnostics();
  const rebuilds = primaryNeighborDiagnostics.buildCount;
  const primaryState = trajectory.primary.serialize();
  const replayState = trajectory.replay.serialize();
  const fullStateDigest = digestValue(primaryState);
  const replayFullStateDigest = digestValue(replayState);
  const observationDigest = digestValue(final);
  const replayObservationDigest = digestValue(finalReplay);
  const cacheScheduleIsolation = verifyCacheScheduleIsolation();
  const digestsWithoutEvidence = {
    configuration: final.configurationDigest,
    topology: final.topologyDigest,
    physicalState: final.physicalDigest,
    replayPhysicalState: finalReplay.physicalDigest,
    fullState: fullStateDigest,
    replayFullState: replayFullStateDigest,
    observation: observationDigest,
    replayObservation: replayObservationDigest,
    physicalTrajectory: trajectory.physicalTrajectoryDigest,
    replayPhysicalTrajectory: trajectory.replayPhysicalTrajectoryDigest,
    fullStateTrajectory: trajectory.fullStateTrajectoryDigest,
    replayFullStateTrajectory: trajectory.replayFullStateTrajectoryDigest,
    observationCheckpoints: trajectory.observationCheckpointDigest,
    replayObservationCheckpoints: trajectory.replayObservationCheckpointDigest,
  };
  const gates = {
    cellRoundTrip: cell.cellRoundTrip,
    cellDomain: cell.cellDomain,
    integerTranslationInvariance,
    micOracleAgreement: mic.micOracleAgreement,
    micFaceContinuity: mic.micFaceContinuity,
    neighborPairSetAgreement: neighbors.neighborPairSetAgreement,
    neighborRebuildCoverage: neighbors.neighborRebuildCoverage
      && rebuilds > 1
      && rebuilds === replayNeighborDiagnostics.buildCount
      && primaryNeighborDiagnostics.role === 'ephemeral-cache-diagnostic'
      && primaryNeighborDiagnostics.serialized === false
      && primaryNeighborDiagnostics.includedInPhysicalDigest === false
      && cacheScheduleIsolation
      && final.events.faceCrossingCount > 0,
    newtonPairAntisymmetry: force.newtonPairAntisymmetry,
    finiteDifferenceForce: force.finiteDifferenceForce,
    energyClosure,
    momentumClosure,
    massClosure,
    chargeClosure,
    runtimeMutationCorpus,
    deterministicPhysicalReplay: trajectory.deterministicPhysicalReplay,
    deterministicFullStateReplay: trajectory.deterministicFullStateReplay,
    deterministicObservationReplay: trajectory.deterministicObservationReplay,
  } satisfies Record<PeriodicAtomisticVerificationGateName, boolean>;
  const thresholds = {
    cellRoundTripFractional: CELL_ROUND_TRIP_LIMIT,
    micOracleAngstrom: MIC_ORACLE_LIMIT_ANGSTROM,
    micFaceContinuityAngstrom: MIC_FACE_CONTINUITY_LIMIT_ANGSTROM,
    newtonPairAntisymmetryKjMolAngstrom: NEWTON_ANTISYMMETRY_LIMIT,
    finiteDifferenceRelativeForce: FINITE_DIFFERENCE_RELATIVE_FORCE_LIMIT,
    relativeEnergyExcursion: final.numericalValidity.maximumRelativeEnergyExcursionLimit,
    momentumDaltonAngstromPerPicosecond: final.numericalValidity.momentumResidualLimit,
    internalForceKjMolAngstrom: final.numericalValidity.internalForceResidualLimit,
    centerOfMassAngstrom: final.numericalValidity.centerOfMassResidualLimitAngstrom,
    massDalton: 0 as const,
    chargeE: 0 as const,
  };
  const maximumResiduals = {
    cellRoundTripFractional: cell.maximumRoundTripResidual,
    micOracleDistanceAngstrom: mic.maximumDistanceResidual,
    micOracleVectorAngstrom: mic.maximumVectorResidual,
    micFaceContinuityAngstrom: mic.faceContinuityResidual,
    neighborPairSetSymmetricDifference: neighbors.maximumPairSetSymmetricDifference,
    newtonPairAntisymmetryKjMolAngstrom: force.maximumNewtonResidual,
    finiteDifferenceRelativeForce: force.maximumFiniteDifferenceRelativeError,
    relativeEnergyExcursion: maximumRelativeEnergyExcursion,
    momentumDaltonAngstromPerPicosecond: trajectory.maximumMomentumResidual,
    internalForceKjMolAngstrom: trajectory.maximumInternalForceResidual,
    centerOfMassAngstrom: trajectory.maximumCenterOfMassResidual,
    massDalton: trajectory.maximumMassResidual,
    chargeE: trajectory.maximumChargeResidual,
  };
  const digestSemantics = {
    algorithm: 'SHA-256' as const,
    purpose: 'deterministic-integrity-and-replay-comparison' as const,
    authenticity: 'not-provided' as const,
    signed: false as const,
  };
  const fixture = {
    scenarioId: 'periodic-fcc-argon-calibration/v1',
    atomCount: 32,
    stepsExecuted: PERIODIC_ATOMISTIC_VERIFICATION_STEPS,
    timeStepPicoseconds: final.timePicoseconds / final.step,
    finalTimePicoseconds: final.timePicoseconds,
    energySampleCount: final.energy.sampleCount,
    independentReplayStepsExecuted: PERIODIC_ATOMISTIC_VERIFICATION_STEPS,
  } as const;
  const verificationEvidence = digestValue({
    schemaVersion: 'tf.periodic-atomistic-verification-evidence/0.4.1',
    fixture,
    gates,
    maximumResiduals,
    thresholds,
    faceCrossings: final.events.faceCrossingCount,
    rebuilds,
    mutationEvidence,
    digestSemantics,
    digests: digestsWithoutEvidence,
  });

  return deepFreeze({
    schemaVersion: 'tf.periodic-atomistic-verification/0.4.1',
    fixture,
    ...gates,
    maximumResiduals,
    thresholds,
    faceCrossings: final.events.faceCrossingCount,
    rebuilds,
    runtimeMutationEvidence: mutationEvidence,
    digestSemantics,
    digests: { ...digestsWithoutEvidence, verificationEvidence },
  });
}

export function assertPeriodicAtomisticVerification(
  report: PeriodicAtomisticVerificationReportV041,
): asserts report is PeriodicAtomisticVerificationReportV041 {
  if (!report || report.schemaVersion !== 'tf.periodic-atomistic-verification/0.4.1') {
    throw new Error('unsupported periodic atomistic verification report');
  }
  if (report.fixture.stepsExecuted !== PERIODIC_ATOMISTIC_VERIFICATION_STEPS
    || report.fixture.independentReplayStepsExecuted !== PERIODIC_ATOMISTIC_VERIFICATION_STEPS
    || report.fixture.energySampleCount !== PERIODIC_ATOMISTIC_VERIFICATION_STEPS + 1) {
    throw new Error('periodic atomistic verification did not execute the locked 10,000-step replay pair');
  }
  const failed = PERIODIC_ATOMISTIC_VERIFICATION_GATE_NAMES.filter((name) => report[name] !== true);
  if (failed.length > 0) throw new Error(`periodic atomistic verification hard gates failed: ${failed.join(', ')}`);
  if (!(report.faceCrossings > 0 && report.rebuilds > 1)) {
    throw new Error('periodic atomistic verification did not exercise face crossing and neighbor rebuild paths');
  }
  if (!Object.values(report.maximumResiduals).every(Number.isFinite)) {
    throw new Error('periodic atomistic verification contains a non-finite residual');
  }
  const { verificationEvidence, ...digestsWithoutEvidence } = report.digests;
  void verificationEvidence;
  const expectedEvidence = digestValue({
    schemaVersion: 'tf.periodic-atomistic-verification-evidence/0.4.1',
    fixture: report.fixture,
    gates: Object.fromEntries(PERIODIC_ATOMISTIC_VERIFICATION_GATE_NAMES.map((name) => [name, report[name]])),
    maximumResiduals: report.maximumResiduals,
    thresholds: report.thresholds,
    faceCrossings: report.faceCrossings,
    rebuilds: report.rebuilds,
    mutationEvidence: report.runtimeMutationEvidence,
    digestSemantics: report.digestSemantics,
    digests: digestsWithoutEvidence,
  });
  if (expectedEvidence !== report.digests.verificationEvidence) {
    throw new Error('periodic atomistic verification evidence digest mismatch');
  }
}

function verifyCellGeometry(): CellVerification {
  let maximumRoundTripResidual = 0;
  let validDomain = true;
  for (const vectors of [ORTHORHOMBIC_CELL, TRICLINIC_CELL]) {
    const cell = new PeriodicCell(vectors, { x: -1.2, y: 0.7, z: 2.4 });
    validDomain = validDomain && cell.volumeAngstrom3 > 0 && cell.shortestLatticeVectorAngstrom > 0;
    for (const fractional of [
      { x: 0, y: 0, z: 0 },
      { x: 0.125, y: 0.875, z: 0.375 },
      { x: -2.2, y: 3.7, z: 1.05 },
      { x: 11.25, y: -7.125, z: 0.499_999_9 },
    ]) {
      const roundTrip = cell.cartesianToFractional(cell.fractionalToCartesian(fractional));
      maximumRoundTripResidual = Math.max(maximumRoundTripResidual, maximumComponent(subtract(roundTrip, fractional)));
    }
  }

  const invalidLeftHandedRejected = throws(() => new PeriodicCell([
    ORTHORHOMBIC_CELL[1], ORTHORHOMBIC_CELL[0], ORTHORHOMBIC_CELL[2],
  ]));
  const singularRejected = throws(() => new PeriodicCell([
    ORTHORHOMBIC_CELL[0], ORTHORHOMBIC_CELL[0], ORTHORHOMBIC_CELL[2],
  ]));
  const unsafeRadiusRejected = throws(() => new PeriodicCell(ORTHORHOMBIC_CELL).assertNeighborRadius(5));
  const invalidValidityFloor = structuredClone(createPeriodicArgonCalibrationConfiguration());
  (invalidValidityFloor.options as { minimumAllowedPairDistanceAngstrom: number }).minimumAllowedPairDistanceAngstrom = 4.6;
  const validityFloorAboveCutoffRejected = throws(() => new PeriodicAtomisticWorld(invalidValidityFloor));
  return {
    cellRoundTrip: maximumRoundTripResidual <= CELL_ROUND_TRIP_LIMIT,
    cellDomain: validDomain
      && invalidLeftHandedRejected
      && singularRejected
      && unsafeRadiusRejected
      && validityFloorAboveCutoffRejected,
    maximumRoundTripResidual,
  };
}

function verifyMinimumImage(): MicVerification {
  const cells: ReadonlyArray<CellVectors3> = [ORTHORHOMBIC_CELL, TRICLINIC_CELL, [
    { x: 10, y: 0, z: 0 },
    { x: 8.7, y: 3.1, z: 0 },
    { x: 2.4, y: 1.8, z: 8.6 },
  ]];
  const samples = [
    [{ x: 0.91, y: 0.08, z: 0.84 }, { x: 0.11, y: 0.94, z: 0.09 }],
    [{ x: 0.03, y: 0.77, z: 0.48 }, { x: 0.96, y: 0.12, z: 0.52 }],
    [{ x: 0.36, y: 0.04, z: 0.97 }, { x: 0.63, y: 0.88, z: 0.02 }],
    [{ x: 0.771, y: 0.319, z: 0.127 }, { x: 0.204, y: 0.873, z: 0.682 }],
  ] as const;
  let maximumDistanceResidual = 0;
  let maximumVectorResidual = 0;
  let imageAgreement = true;
  for (const vectors of cells) {
    const cell = new PeriodicCell(vectors);
    for (const [source, target] of samples) {
      const actual = cell.minimumImageFromFractional(source, target);
      const oracle = bruteMinimumImage(vectors, source, target, 6);
      maximumDistanceResidual = Math.max(maximumDistanceResidual, Math.abs(actual.distanceAngstrom - oracle.distanceAngstrom));
      maximumVectorResidual = Math.max(maximumVectorResidual, magnitude(subtract(actual.displacementAngstrom, oracle.displacementAngstrom)));
      imageAgreement = imageAgreement && equalInt3(actual.imageShiftForTarget, oracle.imageShiftForTarget);
    }
  }

  const faceCell = new PeriodicCell(ORTHORHOMBIC_CELL);
  const source = { x: 0.99, y: 0.4, z: 0.5 };
  const epsilon = 1e-9;
  const left = faceCell.minimumImageFromFractional(source, { x: 0.01 - epsilon, y: 0.4, z: 0.5 });
  const right = faceCell.minimumImageFromFractional(source, { x: 0.01 + epsilon, y: 0.4, z: 0.5 });
  const expectedDelta = faceCell.latticeVector({ x: 2 * epsilon, y: 0, z: 0 });
  const faceContinuityResidual = magnitude(subtract(subtract(right.displacementAngstrom, left.displacementAngstrom), expectedDelta));
  const antisymmetric = faceCell.minimumImageFromFractional(
    { x: 0.01 + epsilon, y: 0.4, z: 0.5 },
    source,
  );
  const antisymmetryResidual = magnitude(add(right.displacementAngstrom, antisymmetric.displacementAngstrom));
  const maximumFaceResidual = Math.max(faceContinuityResidual, antisymmetryResidual);
  return {
    micOracleAgreement: imageAgreement
      && maximumDistanceResidual <= MIC_ORACLE_LIMIT_ANGSTROM
      && maximumVectorResidual <= MIC_ORACLE_LIMIT_ANGSTROM,
    micFaceContinuity: maximumFaceResidual <= MIC_FACE_CONTINUITY_LIMIT_ANGSTROM,
    maximumDistanceResidual,
    maximumVectorResidual,
    faceContinuityResidual: maximumFaceResidual,
  };
}

function verifyNeighborList(): NeighborVerification {
  const cell = new PeriodicCell(ORTHORHOMBIC_CELL);
  const list = new DeterministicVerletNeighborList(cell, 1.5, 0.4);
  const initial = [
    neighborAtom(cell, 'zeta', { x: 0.98, y: 0.2, z: 0.2 }),
    neighborAtom(cell, 'alpha', { x: 0.05, y: 0.2, z: 0.2 }),
    neighborAtom(cell, 'gamma', { x: 0.31, y: 0.2, z: 0.2 }),
    neighborAtom(cell, 'beta', { x: 0.2, y: 0.2, z: 0.2 }),
  ];
  const initialSnapshot = list.update(initial);
  const initialOracle = enumeratePeriodicNeighborPairsOracle(cell, initial, 1.5);
  const below = initial.map((atom) => atom.id === 'zeta'
    ? neighborAtom(cell, atom.id, { x: 0.999, y: 0.2, z: 0.2 })
    : atom);
  const belowSnapshot = list.update(below);
  const belowOracle = enumeratePeriodicNeighborPairsOracle(cell, below, 1.5);
  const threshold = initial.map((atom) => atom.id === 'zeta'
    ? neighborAtom(cell, atom.id, { x: 1, y: 0.2, z: 0.2 })
    : atom);
  const thresholdSnapshot = list.update(threshold);
  const thresholdOracle = enumeratePeriodicNeighborPairsOracle(cell, threshold, 1.5);
  const differences = [
    pairSetSymmetricDifference(initialSnapshot.pairs, initialOracle),
    pairSetSymmetricDifference(belowSnapshot.pairs, belowOracle),
    pairSetSymmetricDifference(thresholdSnapshot.pairs, thresholdOracle),
  ];
  const maximumPairSetSymmetricDifference = Math.max(...differences);
  const pairAgreement = maximumPairSetSymmetricDifference === 0
    && stablePairIds(initialSnapshot.pairs).join('\n') === stablePairIds(initialOracle).join('\n')
    && stablePairIds(belowSnapshot.pairs).join('\n') === stablePairIds(belowOracle).join('\n')
    && stablePairIds(thresholdSnapshot.pairs).join('\n') === stablePairIds(thresholdOracle).join('\n');
  return {
    neighborPairSetAgreement: pairAgreement,
    neighborRebuildCoverage: initialSnapshot.rebuilt
      && !belowSnapshot.rebuilt
      && belowSnapshot.maximumDisplacementSinceBuildAngstrom < list.skinAngstrom / 2
      && thresholdSnapshot.rebuilt
      && thresholdSnapshot.buildCount === 2
      && threshold.find((atom) => atom.id === 'zeta')?.image.x === 1
      && pairAgreement,
    maximumPairSetSymmetricDifference,
  };
}

function verifyPairForces(): ForceVerification {
  const cell = new PeriodicCell([
    { x: 12, y: 0, z: 0 },
    { x: 0, y: 12, z: 0 },
    { x: 0, y: 0, z: 12 },
  ]);
  const topology = canonicalizePeriodicTopology({
    atoms: [
      { id: 'a', label: 'A', element: 'Ar', atomType: 'Ar', massDalton: 39.948, chargeE: 0 },
      { id: 'b', label: 'B', element: 'Ar', atomType: 'Ar', massDalton: 39.948, chargeE: 0 },
    ],
    pairRules: [{
      id: 'Ar-Ar',
      atomTypes: ['Ar', 'Ar'],
      cutoffAngstrom: 4.5,
      terms: [{ kind: 'lennard-jones-12-6', epsilonKjMol: 0.997, sigmaAngstrom: 3.405 }],
    }],
    bonds: [],
    excludeBondedNonbonded: true,
  });
  const states = [
    periodicState(cell, 'a', { x: 0.1, y: 0.2, z: 0.3 }),
    periodicState(cell, 'b', { x: 0.4, y: 0.2, z: 0.3 }),
  ];
  const evaluated = evaluateForceFixture(cell, topology, states);
  const forceA = evaluated.forceByAtomIdKjMolAngstrom.a;
  const forceB = evaluated.forceByAtomIdKjMolAngstrom.b;
  const pair = evaluated.pairInteractions[0];
  const maximumNewtonResidual = Math.max(
    magnitude(add(forceA, forceB)),
    magnitude(subtract(forceB, pair.forceOnBKjMolAngstrom)),
    magnitude(add(forceA, pair.forceOnBKjMolAngstrom)),
  );

  const potentialCases: ReadonlyArray<Readonly<{
    potential: RadialPotential;
    distanceAngstrom: number;
    cutoffAngstrom?: number;
    chargeProductE2?: number;
  }>> = [
    {
      potential: { kind: 'coulomb-minimum-image-reference', relativePermittivity: 1 },
      distanceAngstrom: 2.3,
      cutoffAngstrom: 5.2,
      chargeProductE2: -0.55,
    },
    {
      potential: { kind: 'lennard-jones-12-6', epsilonKjMol: 0.997, sigmaAngstrom: 3.405 },
      distanceAngstrom: 3.8,
      cutoffAngstrom: 5.2,
    },
    {
      potential: {
        kind: 'buckingham-exp-6',
        exponentialPrefactorKjMol: 120_000,
        decayInverseAngstrom: 3.2,
        dispersionKjMolAngstrom6: 1_500,
      },
      distanceAngstrom: 2.5,
      cutoffAngstrom: 5.2,
    },
    {
      potential: {
        kind: 'morse',
        wellDepthKjMol: 18,
        widthInverseAngstrom: 1.7,
        equilibriumDistanceAngstrom: 2.2,
        energyZero: 'minimum',
      },
      distanceAngstrom: 2.8,
      cutoffAngstrom: 5.2,
    },
    {
      potential: { kind: 'harmonic-bond', forceConstantKjMolAngstrom2: 450, equilibriumDistanceAngstrom: 1.05 },
      distanceAngstrom: 1.2,
    },
  ];
  let maximumFiniteDifferenceRelativeError = 0;
  for (const sample of potentialCases) {
    const delta = 1e-6;
    const evaluate = (distance: number) => sample.cutoffAngstrom === undefined
      ? evaluateRadialPotential(sample.potential, distance, sample.chargeProductE2).energyKjMol
      : evaluateForceShiftedRadialPotential(
        sample.potential as NonbondedRadialPotential,
        distance,
        sample.cutoffAngstrom,
        sample.chargeProductE2,
      ).energyKjMol;
    const numerical = -(evaluate(sample.distanceAngstrom + delta) - evaluate(sample.distanceAngstrom - delta)) / (2 * delta);
    const analytical = sample.cutoffAngstrom === undefined
      ? evaluateRadialPotential(sample.potential, sample.distanceAngstrom, sample.chargeProductE2).forceMagnitudeOnTargetKjMolAngstrom
      : evaluateForceShiftedRadialPotential(
        sample.potential as NonbondedRadialPotential,
        sample.distanceAngstrom,
        sample.cutoffAngstrom,
        sample.chargeProductE2,
      ).forceMagnitudeOnTargetKjMolAngstrom;
    maximumFiniteDifferenceRelativeError = Math.max(maximumFiniteDifferenceRelativeError, relativeError(analytical, numerical));
  }

  const delta = 1e-6;
  const plus = perturbPeriodicStateCartesian(cell, states, 'b', { x: delta, y: 0, z: 0 });
  const minus = perturbPeriodicStateCartesian(cell, states, 'b', { x: -delta, y: 0, z: 0 });
  const numericalKernelForce = -(
    evaluateForceFixture(cell, topology, plus).potentialEnergyKjMol
    - evaluateForceFixture(cell, topology, minus).potentialEnergyKjMol
  ) / (2 * delta);
  maximumFiniteDifferenceRelativeError = Math.max(
    maximumFiniteDifferenceRelativeError,
    relativeError(forceB.x, numericalKernelForce),
  );
  return {
    newtonPairAntisymmetry: maximumNewtonResidual <= NEWTON_ANTISYMMETRY_LIMIT,
    finiteDifferenceForce: maximumFiniteDifferenceRelativeError <= FINITE_DIFFERENCE_RELATIVE_FORCE_LIMIT,
    maximumNewtonResidual,
    maximumFiniteDifferenceRelativeError,
  };
}

function verifyIntegerTranslationInvariance() {
  const configuration = createPeriodicArgonCalibrationConfiguration();
  const translated = structuredClone(configuration);
  for (const atom of translated.atoms) {
    (atom.image as { x: number }).x += 7;
    (atom.image as { y: number }).y -= 3;
    (atom.image as { z: number }).z += 2;
  }
  const primary = new PeriodicAtomisticWorld(configuration).observe();
  const shifted = new PeriodicAtomisticWorld(translated).observe();
  return shifted.physicalDigest === primary.physicalDigest
    && shifted.stateDigest !== primary.stateDigest
    && digestValue(shifted.energy) === digestValue(primary.energy)
    && digestValue(shifted.forceByAtomIdKjMolAngstrom) === digestValue(primary.forceByAtomIdKjMolAngstrom)
    && digestValue(shifted.pairInteractions) === digestValue(primary.pairInteractions);
}

function runArgonReplayPair(): TrajectoryVerification {
  const primary = createPeriodicArgonCalibrationWorld();
  const replay = createPeriodicArgonCalibrationWorld();
  let primaryObservation = primary.observe();
  let replayObservation = replay.observe();
  let maximumMomentumResidual = 0;
  let maximumInternalForceResidual = 0;
  let maximumCenterOfMassResidual = 0;
  let maximumMassResidual = 0;
  let maximumChargeResidual = 0;
  let deterministicPhysicalReplay = primaryObservation.physicalDigest === replayObservation.physicalDigest;
  let deterministicFullStateReplay = primaryObservation.stateDigest === replayObservation.stateDigest;
  let deterministicObservationReplay = digestValue(primaryObservation) === digestValue(replayObservation);
  let physicalTrajectoryDigest = digestValue({ step: 0, digest: primaryObservation.physicalDigest });
  let replayPhysicalTrajectoryDigest = digestValue({ step: 0, digest: replayObservation.physicalDigest });
  let fullStateTrajectoryDigest = digestValue({ step: 0, digest: primaryObservation.stateDigest });
  let replayFullStateTrajectoryDigest = digestValue({ step: 0, digest: replayObservation.stateDigest });
  const observationCheckpoints: string[] = [digestValue(primaryObservation)];
  const replayObservationCheckpoints: string[] = [digestValue(replayObservation)];
  updateResiduals(primaryObservation);

  for (let step = 1; step <= PERIODIC_ATOMISTIC_VERIFICATION_STEPS; step += 1) {
    primaryObservation = primary.advance(1);
    replayObservation = replay.advance(1);
    deterministicPhysicalReplay = deterministicPhysicalReplay
      && primaryObservation.physicalDigest === replayObservation.physicalDigest;
    deterministicFullStateReplay = deterministicFullStateReplay
      && primaryObservation.stateDigest === replayObservation.stateDigest;
    physicalTrajectoryDigest = digestValue({ previous: physicalTrajectoryDigest, step, digest: primaryObservation.physicalDigest });
    replayPhysicalTrajectoryDigest = digestValue({ previous: replayPhysicalTrajectoryDigest, step, digest: replayObservation.physicalDigest });
    fullStateTrajectoryDigest = digestValue({ previous: fullStateTrajectoryDigest, step, digest: primaryObservation.stateDigest });
    replayFullStateTrajectoryDigest = digestValue({ previous: replayFullStateTrajectoryDigest, step, digest: replayObservation.stateDigest });
    if (OBSERVATION_REPLAY_CHECKPOINTS.has(step)) {
      const primaryDigest = digestValue(primaryObservation);
      const replayDigest = digestValue(replayObservation);
      observationCheckpoints.push(primaryDigest);
      replayObservationCheckpoints.push(replayDigest);
      deterministicObservationReplay = deterministicObservationReplay && primaryDigest === replayDigest;
    }
    updateResiduals(primaryObservation);
  }

  const primaryStateDigest = digestValue(primary.serialize());
  const replayStateDigest = digestValue(replay.serialize());
  deterministicPhysicalReplay = deterministicPhysicalReplay
    && physicalTrajectoryDigest === replayPhysicalTrajectoryDigest;
  deterministicFullStateReplay = deterministicFullStateReplay
    && fullStateTrajectoryDigest === replayFullStateTrajectoryDigest
    && primaryStateDigest === replayStateDigest;
  deterministicObservationReplay = deterministicObservationReplay
    && digestValue(primaryObservation) === digestValue(replayObservation);

  return {
    primary,
    replay,
    finalObservation: primaryObservation,
    replayObservation,
    maximumMomentumResidual,
    maximumInternalForceResidual,
    maximumCenterOfMassResidual,
    maximumMassResidual,
    maximumChargeResidual,
    deterministicPhysicalReplay,
    deterministicFullStateReplay,
    deterministicObservationReplay,
    physicalTrajectoryDigest,
    replayPhysicalTrajectoryDigest,
    fullStateTrajectoryDigest,
    replayFullStateTrajectoryDigest,
    observationCheckpointDigest: digestValue(observationCheckpoints),
    replayObservationCheckpointDigest: digestValue(replayObservationCheckpoints),
  };

  function updateResiduals(observation: PeriodicAtomisticObservationV041) {
    maximumMomentumResidual = Math.max(maximumMomentumResidual, observation.conservation.momentumResidual);
    maximumInternalForceResidual = Math.max(maximumInternalForceResidual, observation.conservation.internalForceResidualKjMolAngstrom);
    maximumCenterOfMassResidual = Math.max(maximumCenterOfMassResidual, observation.conservation.centerOfMassResidualAngstrom);
    maximumMassResidual = Math.max(maximumMassResidual, observation.conservation.massResidualDalton);
    maximumChargeResidual = Math.max(maximumChargeResidual, observation.conservation.chargeResidualE);
  }
}

function verifyCacheScheduleIsolation() {
  const world = createPeriodicArgonCalibrationWorld();
  let observation = world.observe();
  while (world.neighborCacheDiagnostics().buildCount < 2 && observation.step < 1_000) {
    observation = world.advance(100);
  }
  const state = world.serialize();
  const originalDiagnostics = world.neighborCacheDiagnostics();
  const restored = PeriodicAtomisticWorld.fromSerialized(state);
  const restoredDiagnostics = restored.neighborCacheDiagnostics();
  return originalDiagnostics.buildCount > 1
    && restoredDiagnostics.buildCount !== originalDiagnostics.buildCount
    && digestValue(restored.serialize()) === digestValue(state)
    && digestValue(restored.observe()) === digestValue(observation)
    && restoredDiagnostics.role === 'ephemeral-cache-diagnostic'
    && restoredDiagnostics.serialized === false
    && restoredDiagnostics.includedInPhysicalDigest === false;
}

function executeRuntimeMutationCorpus(state: SerializedPeriodicAtomisticWorldV041) {
  const mutations: ReadonlyArray<Readonly<{
    id: string;
    mutate: (candidate: MutableSerializedWorld) => void;
  }>> = [
    {
      id: 'outer-state-digest',
      mutate: (candidate) => { candidate.stateDigest = `${candidate.stateDigest}-tampered`; },
    },
    {
      id: 'recomputed-action-semantics',
      mutate: (candidate) => {
        const action = candidate.lastAction;
        if (!action) throw new Error('locked mutation fixture requires a last action');
        action.parameters.substeps = 2;
        action.actionId = digestValue({ ...action, actionId: undefined });
        rewriteStateDigest(candidate);
      },
    },
    {
      id: 'recomputed-energy-sample-count',
      mutate: (candidate) => {
        candidate.energyStatistics.sampleCount -= 1;
        rewriteStateDigest(candidate);
      },
    },
    {
      id: 'recomputed-energy-sum',
      mutate: (candidate) => {
        candidate.energyStatistics.energySumKjMol += 1;
        rewriteStateDigest(candidate);
      },
    },
    {
      id: 'recomputed-initial-mass-reference',
      mutate: (candidate) => {
        candidate.initialMassDalton += 1;
        rewriteStateDigest(candidate);
      },
    },
    {
      id: 'recomputed-lineage-revision',
      mutate: (candidate) => {
        candidate.revision -= 1;
        rewriteStateDigest(candidate);
      },
    },
    {
      id: 'recomputed-face-crossing-events',
      mutate: (candidate) => {
        candidate.faceCrossingEvents += 1;
        rewriteStateDigest(candidate);
      },
    },
    {
      id: 'recomputed-base-namespace-fake-branch-count',
      mutate: (candidate) => {
        candidate.branchCount = 1;
        candidate.stateId = `${candidate.stateNamespace}-s${candidate.step.toString(36)}-r${candidate.revision.toString(36)}-${shortDigest({
          parentStateId: candidate.parentStateId,
          actionCount: candidate.actionCount,
          branchCount: candidate.branchCount,
          physicalDigest: candidate.physicalDigest,
        })}`;
        const action = candidate.lastAction;
        if (!action) throw new Error('locked mutation fixture requires a last action');
        action.resultingStateId = candidate.stateId;
        action.actionId = digestValue({ ...action, actionId: undefined });
        rewriteStateDigest(candidate);
      },
    },
    {
      id: 'physical-coordinate-payload',
      mutate: (candidate) => {
        candidate.atoms[0].wrappedFractional.x += 1e-6;
        rewriteStateDigest(candidate);
      },
    },
    {
      id: 'configuration-cell-payload',
      mutate: (candidate) => {
        candidate.configuration.cell.vectorsAngstrom[0].x += 0.01;
        rewriteStateDigest(candidate);
      },
    },
  ];
  const rejectedCaseIds: string[] = [];
  const unexpectedlyAcceptedCaseIds: string[] = [];
  for (const mutation of mutations) {
    const candidate = structuredClone(state) as unknown as MutableSerializedWorld;
    mutation.mutate(candidate);
    if (throws(() => PeriodicAtomisticWorld.fromSerialized(candidate as unknown as SerializedPeriodicAtomisticWorldV041))) {
      rejectedCaseIds.push(mutation.id);
    } else {
      unexpectedlyAcceptedCaseIds.push(mutation.id);
    }
  }
  return {
    casesExecuted: mutations.length,
    casesRejected: rejectedCaseIds.length,
    rejectedCaseIds,
    unexpectedlyAcceptedCaseIds,
  };
}

type MutableSerializedWorld = {
  -readonly [Key in keyof SerializedPeriodicAtomisticWorldV041]: Mutable<SerializedPeriodicAtomisticWorldV041[Key]>;
};

type Mutable<Value> = Value extends ReadonlyArray<infer Item>
  ? Mutable<Item>[]
  : Value extends object
    ? { -readonly [Key in keyof Value]: Mutable<Value[Key]> }
    : Value;

function rewriteStateDigest(state: MutableSerializedWorld) {
  const payload = { ...state };
  delete (payload as Partial<MutableSerializedWorld>).stateDigest;
  state.stateDigest = digestValue(payload);
}

function evaluateForceFixture(
  cell: PeriodicCell,
  topology: PeriodicTopologyV041,
  states: ReadonlyArray<PeriodicAtomStateV041>,
) {
  return evaluatePeriodicAtomisticForces(
    cell,
    topology,
    states,
    new DeterministicVerletNeighborList(cell, maximumRuleCutoff(topology), 0.3),
  );
}

function neighborAtom(cell: PeriodicCell, id: string, unwrappedFractional: Vector3): NeighborAtomPosition {
  return { id, ...cell.wrapFractional(unwrappedFractional) };
}

function periodicState(cell: PeriodicCell, id: string, unwrappedFractional: Vector3): PeriodicAtomStateV041 {
  return {
    id,
    ...cell.wrapFractional(unwrappedFractional),
    velocityAngstromPerPicosecond: { x: 0, y: 0, z: 0 },
  };
}

function perturbPeriodicStateCartesian(
  cell: PeriodicCell,
  states: ReadonlyArray<PeriodicAtomStateV041>,
  id: string,
  deltaAngstrom: Vector3,
) {
  return states.map((state) => state.id === id
    ? { ...state, ...cell.wrapCartesian(add(cell.unwrappedCartesian(state), deltaAngstrom)) }
    : state);
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
        const displacement = latticeVector(vectors, subtract(raw, translation));
        const distanceSquared = dot(displacement, displacement);
        const tolerance = Math.max(Number.MIN_VALUE, bestDistanceSquared, distanceSquared) * Number.EPSILON * 128;
        if (distanceSquared < bestDistanceSquared - tolerance
          || (Math.abs(distanceSquared - bestDistanceSquared) <= tolerance && compareInt3(translation, bestTranslation) < 0)) {
          bestDistanceSquared = distanceSquared;
          bestDisplacement = displacement;
          bestTranslation = translation;
        }
      }
    }
  }
  return {
    displacementAngstrom: bestDisplacement,
    distanceAngstrom: Math.sqrt(bestDistanceSquared),
    imageShiftForTarget: negateInt3(bestTranslation),
  };
}

function stablePairIds(pairs: ReadonlyArray<Readonly<{ atomAId: string; atomBId: string }>>) {
  return pairs.map((pair) => `${pair.atomAId}|${pair.atomBId}`);
}

function pairSetSymmetricDifference(
  left: ReadonlyArray<Readonly<{ atomAId: string; atomBId: string }>>,
  right: ReadonlyArray<Readonly<{ atomAId: string; atomBId: string }>>,
) {
  const leftSet = new Set(stablePairIds(left));
  const rightSet = new Set(stablePairIds(right));
  let count = 0;
  for (const pair of leftSet) if (!rightSet.has(pair)) count += 1;
  for (const pair of rightSet) if (!leftSet.has(pair)) count += 1;
  return count;
}

function latticeVector(vectors: CellVectors3, fractional: Vector3): Vector3 {
  const [a, b, c] = vectors;
  return {
    x: a.x * fractional.x + b.x * fractional.y + c.x * fractional.z,
    y: a.y * fractional.x + b.y * fractional.y + c.y * fractional.z,
    z: a.z * fractional.x + b.z * fractional.y + c.z * fractional.z,
  };
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function throws(action: () => unknown) {
  try {
    action();
    return false;
  } catch {
    return true;
  }
}

function relativeError(actual: number, expected: number) {
  return Math.abs(actual - expected) / Math.max(1, Math.abs(actual), Math.abs(expected));
}

function maximumComponent(vector: Vector3) {
  return Math.max(Math.abs(vector.x), Math.abs(vector.y), Math.abs(vector.z));
}

function equalInt3(left: Int3, right: Int3) {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function negateInt3(value: Int3): Int3 {
  return {
    x: value.x === 0 ? 0 : -value.x,
    y: value.y === 0 ? 0 : -value.y,
    z: value.z === 0 ? 0 : -value.z,
  };
}

function compareInt3(left: Int3, right: Int3) {
  return left.x - right.x || left.y - right.y || left.z - right.z;
}

function add(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function subtract(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function magnitude(vector: Vector3) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function dot(left: Vector3, right: Vector3) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}
