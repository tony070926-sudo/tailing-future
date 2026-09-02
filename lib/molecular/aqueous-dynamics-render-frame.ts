import type { Vector3 } from './molecular-interactions.ts';
import type { AqueousForceComponentV042 } from '../simulation/aqueous-force-field.ts';
import type { CoulombExceptionVirialTensorV042 } from '../simulation/periodic-coulomb-exceptions.ts';
import {
  PeriodicCell,
  type CellVectors3,
  type Int3,
} from '../simulation/periodic-cell.ts';
import {
  createNaClTip3pFiniteSizeCalibrationWorldV042,
  type AqueousDynamicsObservationV042,
} from '../simulation/aqueous-dynamics-world.ts';
import { digestValue } from '../simulation/digest.ts';

const FIXED_ATOM_IDS = Object.freeze([
  'chloride-cl',
  'sodium-na',
  'water-a-h1',
  'water-a-h2',
  'water-a-o',
  'water-b-h1',
  'water-b-h2',
  'water-b-o',
] as const);

const FIXED_MOLECULE_IDS = Object.freeze([
  'chloride',
  'sodium',
  'water-a',
  'water-b',
] as const);

const LAYER_AVAILABILITY = Object.freeze({
  atoms: 'available-source-observation',
  cell: 'available-display-zero-periodic-gauge',
  charge: 'available-topology-charge',
  molecules: 'available-topology-and-minimum-image-projection',
  structuralOH: 'available-rigid-distance-constraints-not-energetic-interactions',
  constraintDiagnostic: 'available-hh-rigid-distance-constraint-diagnostic',
  velocity: 'available-source-observation',
  totalForce: 'available-source-observation',
  forceComponents: 'available-source-force-field-evaluation',
  periodicGhosts: 'available-minimum-image-render-copies',
  evaluatedLJ: 'available-only-evaluated-plain-cutoff-interactions',
  trajectory: 'unavailable-requires-multiple-observation-history',
  coulombPair: 'unavailable-direct-ewald-has-no-pair-render-decomposition',
  electricField: 'unavailable-not-evaluated-by-source-world',
  electronDensity: 'unavailable-classical-model-has-no-electron-density',
  orbital: 'unavailable-classical-model-has-no-orbitals',
  esp: 'unavailable-not-evaluated-by-source-world',
  pressure: 'unavailable-complete-ewald-virial-not-implemented',
  stress: 'unavailable-complete-ewald-virial-not-implemented',
  localVirial: 'unavailable-no-per-atom-complete-virial-partition',
  bondOrder: 'unavailable-fixed-classical-topology-has-no-bond-order',
  reaction: 'unavailable-fixed-topology-has-no-reaction-model',
} as const);

const BOUNDARIES = Object.freeze([
  'This frame is a deterministic rendering projection of one validated initial or one-step finite-size calibration observation; it performs no dynamics.',
  'Periodic ghosts are visualization copies used only to keep each rigid water continuous around its oxygen anchor.',
  'O-H links are structural distance constraints; H-H edges are diagnostics and neither class is an energetic interaction.',
  'Lennard-Jones edges are only the interactions actually emitted by the source force-field evaluation.',
  'Direct-Ewald pair edges, complete pressure, and complete stress are unavailable and remain null rather than inferred.',
] as const);

export type AqueousDynamicsRenderAtomV042 = Readonly<{
  id: string;
  moleculeId: string;
  siteName: string;
  element: string;
  massDalton: number;
  chargeE: number;
  wrappedFractional: Vector3;
  image: Int3;
  wrappedPositionAngstrom: Vector3;
  unwrappedPositionAngstrom: Vector3;
  velocityAngstromPerPicosecond: Vector3;
  forceComponentsKjMolAngstrom: AqueousForceComponentV042;
  forceKjMolAngstrom: Vector3;
}>;

export type AqueousDynamicsRenderMoleculeV042 = Readonly<{
  id: string;
  kind: 'rigid-tip3p-water' | 'monatomic-ion';
  atomIds: ReadonlyArray<string>;
  oxygenAnchorAtomId: string | null;
  continuousAtoms: ReadonlyArray<Readonly<{
    atomId: string;
    positionAngstrom: Vector3;
    imageShiftFromWrapped: Int3;
    usesPeriodicContinuityCopy: boolean;
  }>>;
}>;

export type AqueousDynamicsRenderConstraintEdgeV042 = Readonly<{
  id: string;
  moleculeId: string;
  atomAId: string;
  atomBId: string;
  atomAPositionAngstrom: Vector3;
  atomBPositionAngstrom: Vector3;
  renderedDistanceAngstrom: number;
  targetDistanceAngstrom: number;
  role:
    | 'structural-oh-rigid-distance-constraint'
    | 'diagnostic-hh-rigid-distance-constraint';
  energeticInteraction: false;
}>;

export type AqueousDynamicsRenderPeriodicGhostV042 = Readonly<{
  id: string;
  sourceAtomId: string;
  moleculeId: string;
  imageShiftFromWrapped: Int3;
  sourceWrappedPositionAngstrom: Vector3;
  ghostPositionAngstrom: Vector3;
  role: 'minimum-image-water-continuity-only';
  selectable: false;
  countsTowardAtomCount: false;
  replacesWrappedSourceInPrimaryMolecule: true;
}>;

export type AqueousDynamicsRenderLennardJonesPairV042 = Readonly<{
  id: string;
  atomAId: string;
  atomBId: string;
  imageShiftForB: Int3;
  atomAPositionAngstrom: Vector3;
  atomBImagePositionAngstrom: Vector3;
  displacementAngstrom: Vector3;
  distanceAngstrom: number;
  mixedSigmaAngstrom: number;
  mixedEpsilonKjMol: number;
  lennardJonesScale: number;
  evaluation:
    | 'evaluated-plain-cutoff'
    | 'epsilon-zero-exact-short-circuit'
    | 'exception-zero-exact-short-circuit';
  energyKjMol: number;
  forceOnBKjMolAngstrom: Vector3;
  virialKjMol: CoulombExceptionVirialTensorV042;
  activeForInteractionLayer: boolean;
}>;

export type AqueousDynamicsRenderFrameV042 = Readonly<{
  schemaVersion: 'tf.aqueous-dynamics-render-frame/0.4.2';
  sourceBinding: Readonly<{
    observationDigest: string;
    forceFieldEvaluationDigest: string;
    topologyDigest: string;
    configurationDigest: string;
    stateId: string;
    stateDigest: string;
    physicalDigest: string;
    step: 0 | 1;
    timePicoseconds: number;
  }>;
  sourceBindingDigest: string;
  worldId: 'nacl-tip3p-finite-size-calibration';
  stateId: string;
  stateDigest: string;
  physicalDigest: string;
  step: 0 | 1;
  timePicoseconds: number;
  cell: Readonly<{
    originGauge: 'display-zero-periodic-gauge';
    originAngstrom: Vector3;
    vectorsAngstrom: CellVectors3;
    volumeAngstrom3: number;
    periodicAxes: readonly [true, true, true];
    verticesAngstrom: ReadonlyArray<Vector3>;
  }>;
  atoms: ReadonlyArray<AqueousDynamicsRenderAtomV042>;
  molecules: ReadonlyArray<AqueousDynamicsRenderMoleculeV042>;
  structuralOhLinks: ReadonlyArray<AqueousDynamicsRenderConstraintEdgeV042>;
  diagnosticHhEdges: ReadonlyArray<AqueousDynamicsRenderConstraintEdgeV042>;
  periodicGhosts: ReadonlyArray<AqueousDynamicsRenderPeriodicGhostV042>;
  lennardJonesPairs: ReadonlyArray<AqueousDynamicsRenderLennardJonesPairV042>;
  layerAvailability: typeof LAYER_AVAILABILITY;
  unavailableLayers: Readonly<{
    trajectory: null;
    coulombPairInteractions: null;
    electricField: null;
    electronDensity: null;
    orbital: null;
    electrostaticPotential: null;
    pressureBar: null;
    totalStressKjMolAngstrom3: null;
    localVirialByAtom: null;
    bondOrder: null;
    reaction: null;
  }>;
  workReceipt: Readonly<{
    forceFieldAllPairWorkUnits: number;
    forceFieldCoulombExceptionWorkUnits: number;
    forceFieldEwaldRealSpaceWorkUnits: number;
    forceFieldEwaldReciprocalSpaceWorkUnits: number;
    forceFieldTotalWorkUnits: number;
    integrationSolverWorkUnits: number;
    integrationComposerEndpointRankAuditWorkUnits: number;
    integrationTotalWorkUnits: number;
    observationConstraintRankAuditWorkUnits: number;
  }>;
  boundaries: typeof BOUNDARIES;
  renderDigest: string;
}>;

type RenderFramePayload = Omit<AqueousDynamicsRenderFrameV042, 'renderDigest'>;

const TRAJECTORY_FRAME_BOUNDARIES = Object.freeze([
  'This frame is an exact accepted solver endpoint emitted only by the locally executed v0.4.3 trajectory builder; it performs no dynamics.',
  'Periodic ghosts are visualization copies used only to keep each rigid water continuous around its oxygen anchor.',
  'O-H links are structural distance constraints; H-H edges are diagnostics and neither class is an energetic interaction.',
  'Lennard-Jones edges are only the interactions actually emitted by the source force-field evaluation.',
  'Direct-Ewald pair edges, complete pressure, and complete stress are unavailable and remain null rather than inferred.',
]);

export type AqueousDynamicsRenderFrameV043 = Readonly<
  Omit<AqueousDynamicsRenderFrameV042, 'schemaVersion' | 'sourceBinding' | 'step' | 'boundaries'> & {
    schemaVersion: 'tf.aqueous-dynamics-render-frame/0.4.3';
    sourceBinding: Readonly<
      Omit<AqueousDynamicsRenderFrameV042['sourceBinding'], 'step'> & { step: number }
    >;
    step: number;
    boundaries: typeof TRAJECTORY_FRAME_BOUNDARIES;
  }
>;

type RenderFramePayloadV043 = Omit<AqueousDynamicsRenderFrameV043, 'renderDigest'>;

export const AQUEOUS_DYNAMICS_RENDER_TRAJECTORY_DEFAULT_STEPS_V043 = 10 as const;

const TRAJECTORY_BOUNDARIES = Object.freeze([
  'Every sample is produced by an accepted fixed-step transition of a locally constructed tf-aqueous-dynamics-world; the renderer never advances solver state.',
  'The bundle contains exact solver endpoints only. Renderer interpolation is null and presentation cadence is not physical time.',
  'The executed system remains the locked eight-site finite-size NaCl-TIP3P calibration, not a bulk solution, crystal-water interface, dissolution, crystallization, or equilibrium claim.',
  'Self-digests bind local payloads but do not prove execution authenticity; protected-main CI artifacts remain the release truth authority.',
]);

export type AqueousDynamicsRenderTrajectorySampleV043 = Readonly<{
  schemaVersion: 'tf.aqueous-dynamics-render-trajectory-sample/0.4.3';
  sampleIndex: number;
  step: number;
  timePicoseconds: number;
  parentStateId: string | null;
  stateId: string;
  stateDigest: string;
  physicalDigest: string;
  observationDigest: string;
  integrationReceiptDigest: string | null;
  previousSampleDigest: string | null;
  observation: AqueousDynamicsObservationV042;
  renderFrame: AqueousDynamicsRenderFrameV043;
  sampleDigest: string;
}>;

export type AqueousDynamicsRenderTrajectoryV043 = Readonly<{
  schemaVersion: 'tf.aqueous-dynamics-render-trajectory/0.4.3';
  status: 'locally-executed-exact-endpoint-trajectory';
  worldId: 'nacl-tip3p-finite-size-calibration';
  topologyDigest: string;
  configurationDigest: string;
  execution: Readonly<{
    acceptedStepsExecuted: number;
    fromStep: 0;
    toStep: number;
    sampleStrideSteps: 1;
    sampleCount: number;
    fixedTimeStepPicoseconds: 0.001;
    finalTimePicoseconds: number;
    solverEndpointRatePerPicosecond: 1000;
  }>;
  presentation: Readonly<{
    selectedSampleIndex: null;
    presentationFramesPerSecond: null;
    rendererInterpolation: null;
    boundary: 'presentation-state-is-external-and-cannot-change-solver-or-trajectory-digests';
  }>;
  samples: ReadonlyArray<AqueousDynamicsRenderTrajectorySampleV043>;
  sampleDigests: ReadonlyArray<string>;
  workReceipt: Readonly<{
    acceptedIntegrationCount: number;
    observationCount: number;
    integrationWorkUnits: number;
    observationForceAuditWorkUnits: number;
    observationConstraintRankAuditWorkUnits: number;
    totalReceiptedWorkUnits: number;
  }>;
  determinism: Readonly<{
    evidenceClass: 'independent-full-accepted-prefix-replay';
    primaryAcceptedSteps: number;
    replayAcceptedSteps: number;
    comparedSampleCount: number;
    primaryTrajectoryDigest: string;
    replayTrajectoryDigest: string;
    replaySampleDigests: ReadonlyArray<string>;
    exactSampleDigestEquality: true;
    replayReceiptedWorkUnits: number;
    receiptDigest: string;
  }>;
  evidenceSemantics: Readonly<{
    localSolverExecutionPerformed: true;
    externalEngineExecutionPerformed: false;
    selfDigestExecutionProof: false;
    selfDigestAuthenticityProof: false;
    ciExecutionTruthAuthority: 'release-artifact-guard';
  }>;
  boundaries: typeof TRAJECTORY_BOUNDARIES;
  trajectoryDigest: string;
  bundleDigest: string;
}>;

type TrajectoryPayload = Omit<AqueousDynamicsRenderTrajectoryV043, 'bundleDigest'>;
type TrajectorySamplePayload = Omit<AqueousDynamicsRenderTrajectorySampleV043, 'sampleDigest'>;
type ExecutedTrajectoryPrefixV043 = Readonly<{
  worldId: 'nacl-tip3p-finite-size-calibration';
  topologyDigest: string;
  configurationDigest: string;
  samples: ReadonlyArray<AqueousDynamicsRenderTrajectorySampleV043>;
  sampleDigests: ReadonlyArray<string>;
  trajectoryDigest: string;
  integrationWorkUnits: number;
  observationForceAuditWorkUnits: number;
  observationConstraintRankAuditWorkUnits: number;
  totalReceiptedWorkUnits: number;
}>;
const LOCALLY_EXECUTED_TRAJECTORIES = new WeakSet<object>();

/**
 * Adapts only the locked initial/one-step NaCl-TIP3P calibration observation.
 * The source is validated and copied; it is never mutated.
 */
export function createAqueousDynamicsRenderFrameV042(
  observation: AqueousDynamicsObservationV042,
): AqueousDynamicsRenderFrameV042 {
  const source = validateSourceObservation(observation);
  return buildExpectedFrame(source);
}

/** Source-aware assertion. A self-digest alone is not treated as proof of provenance. */
export function assertAqueousDynamicsRenderFrameV042(
  candidate: unknown,
  observation: AqueousDynamicsObservationV042,
): asserts candidate is AqueousDynamicsRenderFrameV042 {
  const source = validateSourceObservation(observation);
  const expected = buildExpectedFrame(source);
  assertExactFrozenDataTree(candidate, expected, 'aqueous render frame');
}

/**
 * Executes the locked local world and projects every accepted endpoint. The
 * bundle owns no presentation cursor, timer, interpolation, or renderer state.
 */
export function createAqueousDynamicsRenderTrajectoryV043(
  acceptedSteps: number = AQUEOUS_DYNAMICS_RENDER_TRAJECTORY_DEFAULT_STEPS_V043,
): AqueousDynamicsRenderTrajectoryV043 {
  assertAcceptedTrajectoryStepCount(acceptedSteps);
  const primary = executeRenderTrajectoryPrefix(acceptedSteps);
  const replay = executeRenderTrajectoryPrefix(acceptedSteps);
  if (primary.trajectoryDigest !== replay.trajectoryDigest
    || primary.sampleDigests.length !== replay.sampleDigests.length
    || primary.sampleDigests.some((digest, index) => digest !== replay.sampleDigests[index])) {
    throw new Error('aqueous render trajectory independent accepted-prefix replay is not exact');
  }
  const last = primary.samples[primary.samples.length - 1];
  const determinismPayload = {
    evidenceClass: 'independent-full-accepted-prefix-replay' as const,
    primaryAcceptedSteps: acceptedSteps,
    replayAcceptedSteps: acceptedSteps,
    comparedSampleCount: primary.samples.length,
    primaryTrajectoryDigest: primary.trajectoryDigest,
    replayTrajectoryDigest: replay.trajectoryDigest,
    replaySampleDigests: replay.sampleDigests,
    exactSampleDigestEquality: true as const,
    replayReceiptedWorkUnits: replay.totalReceiptedWorkUnits,
  };
  const payload: TrajectoryPayload = {
    schemaVersion: 'tf.aqueous-dynamics-render-trajectory/0.4.3',
    status: 'locally-executed-exact-endpoint-trajectory',
    worldId: primary.worldId,
    topologyDigest: primary.topologyDigest,
    configurationDigest: primary.configurationDigest,
    execution: {
      acceptedStepsExecuted: acceptedSteps,
      fromStep: 0,
      toStep: acceptedSteps,
      sampleStrideSteps: 1,
      sampleCount: primary.samples.length,
      fixedTimeStepPicoseconds: 0.001,
      finalTimePicoseconds: last.timePicoseconds,
      solverEndpointRatePerPicosecond: 1000,
    },
    presentation: {
      selectedSampleIndex: null,
      presentationFramesPerSecond: null,
      rendererInterpolation: null,
      boundary: 'presentation-state-is-external-and-cannot-change-solver-or-trajectory-digests',
    },
    samples: primary.samples,
    sampleDigests: primary.sampleDigests,
    workReceipt: {
      acceptedIntegrationCount: acceptedSteps,
      observationCount: primary.samples.length,
      integrationWorkUnits: primary.integrationWorkUnits,
      observationForceAuditWorkUnits: primary.observationForceAuditWorkUnits,
      observationConstraintRankAuditWorkUnits:
        primary.observationConstraintRankAuditWorkUnits,
      totalReceiptedWorkUnits: primary.totalReceiptedWorkUnits,
    },
    determinism: {
      ...determinismPayload,
      receiptDigest: digestValue(determinismPayload),
    },
    evidenceSemantics: {
      localSolverExecutionPerformed: true,
      externalEngineExecutionPerformed: false,
      selfDigestExecutionProof: false,
      selfDigestAuthenticityProof: false,
      ciExecutionTruthAuthority: 'release-artifact-guard',
    },
    boundaries: TRAJECTORY_BOUNDARIES,
    trajectoryDigest: primary.trajectoryDigest,
  };
  const bundle = deepFreeze({ ...payload, bundleDigest: digestValue(payload) });
  LOCALLY_EXECUTED_TRAJECTORIES.add(bundle);
  return bundle;
}

function executeRenderTrajectoryPrefix(acceptedSteps: number): ExecutedTrajectoryPrefixV043 {
  const world = createNaClTip3pFiniteSizeCalibrationWorldV042();
  const samples: AqueousDynamicsRenderTrajectorySampleV043[] = [];
  let previous: AqueousDynamicsRenderTrajectorySampleV043 | null = null;
  let integrationWorkUnits = 0;
  let observationForceAuditWorkUnits = 0;
  let observationConstraintRankAuditWorkUnits = 0;

  for (let sampleIndex = 0; sampleIndex <= acceptedSteps; sampleIndex += 1) {
    const observation = sampleIndex === 0 ? world.observe() : world.advance();
    const renderFrame = buildExpectedTrajectoryFrame(observation);
    assertExecutedTrajectoryEndpoint(observation, renderFrame, previous, sampleIndex);
    const samplePayload: TrajectorySamplePayload = {
      schemaVersion: 'tf.aqueous-dynamics-render-trajectory-sample/0.4.3',
      sampleIndex,
      step: observation.step,
      timePicoseconds: observation.timePicoseconds,
      parentStateId: observation.parentStateId,
      stateId: observation.stateId,
      stateDigest: observation.stateDigest,
      physicalDigest: observation.physicalDigest,
      observationDigest: observation.observationDigest,
      integrationReceiptDigest: observation.integration.lastIntegrationReceipt?.receiptDigest ?? null,
      previousSampleDigest: previous?.sampleDigest ?? null,
      observation,
      renderFrame,
    };
    const sample = deepFreeze({
      ...samplePayload,
      sampleDigest: digestValue(samplePayload),
    }) as AqueousDynamicsRenderTrajectorySampleV043;
    samples.push(sample);
    previous = sample;
    integrationWorkUnits = safeWorkSum(
      integrationWorkUnits,
      observation.integration.lastStepWorkUnitsConsumed,
    );
    observationForceAuditWorkUnits = safeWorkSum(
      observationForceAuditWorkUnits,
      observation.forceField.workReceipt.totalWorkUnitsConsumed,
    );
    observationConstraintRankAuditWorkUnits = safeWorkSum(
      observationConstraintRankAuditWorkUnits,
      observation.constraints.rankWorkUnitsConsumed,
    );
  }

  const sampleDigests = samples.map((sample) => sample.sampleDigest);
  const trajectoryDigest = digestValue({
    binding: 'ordered-exact-solver-endpoint-sample-digests-v1',
    topologyDigest: world.topologyDigest,
    configurationDigest: world.configurationDigest,
    sampleDigests,
  });
  const totalReceiptedWorkUnits = safeWorkSum(
    integrationWorkUnits,
    observationForceAuditWorkUnits,
    observationConstraintRankAuditWorkUnits,
  );
  return deepFreeze({
    worldId: world.worldId,
    topologyDigest: world.topologyDigest,
    configurationDigest: world.configurationDigest,
    samples,
    sampleDigests,
    trajectoryDigest,
    integrationWorkUnits,
    observationForceAuditWorkUnits,
    observationConstraintRankAuditWorkUnits,
    totalReceiptedWorkUnits,
  });
}

function assertAcceptedTrajectoryStepCount(acceptedSteps: number) {
  if (acceptedSteps !== AQUEOUS_DYNAMICS_RENDER_TRAJECTORY_DEFAULT_STEPS_V043) {
    throw new Error(
      `aqueous render trajectory acceptedSteps must equal the locked 0–${AQUEOUS_DYNAMICS_RENDER_TRAJECTORY_DEFAULT_STEPS_V043} prefix`,
    );
  }
}

/** Re-executes the locked world; this is intentionally stronger than checking self-digests. */
export function assertAqueousDynamicsRenderTrajectoryV043(
  candidate: unknown,
): asserts candidate is AqueousDynamicsRenderTrajectoryV043 {
  const acceptedSteps = readFrozenTrajectoryAcceptedSteps(candidate);
  const expected = createAqueousDynamicsRenderTrajectoryV043(acceptedSteps);
  assertExactFrozenDataTree(candidate, expected, 'aqueous render trajectory');
  LOCALLY_EXECUTED_TRAJECTORIES.add(candidate as object);
}

export function requireLocallyExecutedAqueousDynamicsRenderTrajectoryV043(
  candidate: unknown,
): AqueousDynamicsRenderTrajectoryV043 {
  if (!candidate || typeof candidate !== 'object' || !LOCALLY_EXECUTED_TRAJECTORIES.has(candidate)) {
    throw new Error('aqueous render trajectory must be created or independently replay-validated locally');
  }
  const trajectory = candidate as AqueousDynamicsRenderTrajectoryV043;
  const { bundleDigest, ...payload } = trajectory;
  if (!Object.isFrozen(trajectory) || bundleDigest !== digestValue(payload)) {
    throw new Error('aqueous render trajectory local bundle digest is invalid');
  }
  return trajectory;
}

export function getLocallyExecutedAqueousDynamicsRenderTrajectorySampleV043(
  trajectory: unknown,
  sampleIndex: number,
): AqueousDynamicsRenderTrajectorySampleV043 {
  const executed = requireLocallyExecutedAqueousDynamicsRenderTrajectoryV043(trajectory);
  if (!Number.isSafeInteger(sampleIndex) || sampleIndex < 0 || sampleIndex >= executed.samples.length) {
    throw new Error('aqueous render trajectory sample index is outside the executed endpoint range');
  }
  return executed.samples[sampleIndex];
}

function assertExecutedTrajectoryEndpoint(
  observation: AqueousDynamicsObservationV042,
  renderFrame: AqueousDynamicsRenderFrameV043,
  previous: AqueousDynamicsRenderTrajectorySampleV043 | null,
  sampleIndex: number,
) {
  if (observation.step !== sampleIndex
    || observation.timePicoseconds !== sampleIndex * 0.001
    || renderFrame.step !== observation.step
    || renderFrame.timePicoseconds !== observation.timePicoseconds
    || renderFrame.sourceBinding.observationDigest !== observation.observationDigest
    || renderFrame.stateDigest !== observation.stateDigest
    || renderFrame.physicalDigest !== observation.physicalDigest) {
    throw new Error('aqueous render trajectory endpoint projection is not source-exact');
  }
  const receipt = observation.integration.lastIntegrationReceipt;
  if (sampleIndex === 0) {
    if (previous !== null || observation.parentStateId !== null || receipt !== null) {
      throw new Error('aqueous render trajectory initial sample lineage is invalid');
    }
    return;
  }
  if (!previous || !receipt) {
    throw new Error('aqueous render trajectory accepted-step lineage is invalid');
  }
  const { receiptDigest, ...receiptPayload } = receipt;
  if (observation.parentStateId !== previous.stateId
    || receipt.fromStep !== sampleIndex - 1
    || receipt.toStep !== sampleIndex
    || receiptDigest !== digestValue(receiptPayload)) {
    throw new Error('aqueous render trajectory accepted-step lineage is invalid');
  }
}

function readFrozenTrajectoryAcceptedSteps(candidate: unknown) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate) || !Object.isFrozen(candidate)) {
    throw new Error('aqueous render trajectory must be a frozen plain data record');
  }
  const executionDescriptor = Object.getOwnPropertyDescriptor(candidate, 'execution');
  if (!executionDescriptor || !Object.prototype.hasOwnProperty.call(executionDescriptor, 'value')) {
    throw new Error('aqueous render trajectory execution must be an own data property');
  }
  const execution = executionDescriptor.value;
  if (!execution || typeof execution !== 'object' || Array.isArray(execution) || !Object.isFrozen(execution)) {
    throw new Error('aqueous render trajectory execution must be a frozen plain data record');
  }
  const acceptedDescriptor = Object.getOwnPropertyDescriptor(execution, 'acceptedStepsExecuted');
  const acceptedSteps = acceptedDescriptor?.value;
  if (!acceptedDescriptor || !Object.prototype.hasOwnProperty.call(acceptedDescriptor, 'value')
    || !Number.isSafeInteger(acceptedSteps)) {
    throw new Error('aqueous render trajectory accepted step count must be an own integer data property');
  }
  return acceptedSteps as number;
}

function buildExpectedFrame(
  observation: AqueousDynamicsObservationV042,
): AqueousDynamicsRenderFrameV042 {
  const payload = deriveFramePayload(observation);
  return deepFreeze({ ...payload, renderDigest: digestValue(payload) });
}

function buildExpectedTrajectoryFrame(
  observation: AqueousDynamicsObservationV042,
): AqueousDynamicsRenderFrameV043 {
  const legacyPayload = deriveFramePayload(observation);
  const sourceBinding = {
    ...legacyPayload.sourceBinding,
    step: observation.step,
  };
  const payload: RenderFramePayloadV043 = {
    ...legacyPayload,
    schemaVersion: 'tf.aqueous-dynamics-render-frame/0.4.3',
    sourceBinding,
    sourceBindingDigest: digestValue(sourceBinding),
    step: observation.step,
    boundaries: TRAJECTORY_FRAME_BOUNDARIES,
  };
  return deepFreeze({ ...payload, renderDigest: digestValue(payload) });
}

function deriveFramePayload(observation: AqueousDynamicsObservationV042): RenderFramePayload {
  const cell = new PeriodicCell(cloneCellVectors(observation.cell.vectorsAngstrom));
  const topologyByAtomId = new Map(observation.topology.atoms.map((atom) => [atom.id, atom]));
  const observationByAtomId = new Map(observation.atoms.map((atom) => [atom.id, atom]));

  const atoms: AqueousDynamicsRenderAtomV042[] = observation.atoms.map((atom) => {
    const topologyAtom = requireMap(topologyByAtomId, atom.id, 'render topology atom');
    const forceComponents = requireRecord(
      observation.forceField.forceComponentsByAtomIdKjMolAngstrom,
      atom.id,
      'render force components',
    );
    return {
      id: atom.id,
      moleculeId: topologyAtom.identity.moleculeId,
      siteName: topologyAtom.identity.siteName,
      element: atom.element,
      massDalton: atom.massDalton,
      chargeE: atom.chargeE,
      wrappedFractional: cloneVector(atom.position.wrappedFractional),
      image: cloneInt3(atom.position.image),
      wrappedPositionAngstrom: cloneVector(atom.wrappedPositionAngstrom),
      unwrappedPositionAngstrom: cloneVector(atom.unwrappedPositionAngstrom),
      velocityAngstromPerPicosecond: cloneVector(atom.velocityAngstromPerPicosecond),
      forceComponentsKjMolAngstrom: cloneForceComponents(forceComponents),
      forceKjMolAngstrom: cloneVector(atom.forceKjMolAngstrom),
    };
  });

  const molecules: AqueousDynamicsRenderMoleculeV042[] = observation.topology.molecules.map((molecule) => {
    const members = molecule.atomIds.map((id) => requireMap(observationByAtomId, id, 'render molecule atom'));
    const oxygen = molecule.kind === 'rigid-tip3p-water'
      ? members.find((atom) => atom.element === 'O') ?? null
      : null;
    const anchor = oxygen ?? members[0];
    const ordered = [...members].sort((left, right) => {
      const leftSite = requireMap(topologyByAtomId, left.id, 'render molecule topology atom').identity.siteIndex;
      const rightSite = requireMap(topologyByAtomId, right.id, 'render molecule topology atom').identity.siteIndex;
      return leftSite - rightSite || compareAscii(left.id, right.id);
    });
    const continuousAtoms = ordered.map((atom) => {
      if (atom.id === anchor.id) {
        return {
          atomId: atom.id,
          positionAngstrom: cloneVector(anchor.wrappedPositionAngstrom),
          imageShiftFromWrapped: zeroInt3(),
          usesPeriodicContinuityCopy: false,
        };
      }
      const minimumImage = cell.minimumImageFromFractional(
        anchor.position.wrappedFractional,
        atom.position.wrappedFractional,
      );
      return {
        atomId: atom.id,
        positionAngstrom: add(anchor.wrappedPositionAngstrom, minimumImage.displacementAngstrom),
        imageShiftFromWrapped: cloneInt3(minimumImage.imageShiftForTarget),
        usesPeriodicContinuityCopy: !isZeroInt3(minimumImage.imageShiftForTarget),
      };
    });
    return {
      id: molecule.id,
      kind: molecule.kind,
      atomIds: [...molecule.atomIds],
      oxygenAnchorAtomId: oxygen?.id ?? null,
      continuousAtoms,
    };
  });

  const continuousByAtomId = new Map<string, Readonly<{ moleculeId: string; position: Vector3; shift: Int3 }>>();
  for (const molecule of molecules) {
    for (const atom of molecule.continuousAtoms) {
      continuousByAtomId.set(atom.atomId, {
        moleculeId: molecule.id,
        position: atom.positionAngstrom,
        shift: atom.imageShiftFromWrapped,
      });
    }
  }

  const structuralOhLinks: AqueousDynamicsRenderConstraintEdgeV042[] = [];
  const diagnosticHhEdges: AqueousDynamicsRenderConstraintEdgeV042[] = [];
  for (const constraint of observation.topology.constraints) {
    const topologyA = requireMap(topologyByAtomId, constraint.atomAId, 'render constraint topology atom A');
    const topologyB = requireMap(topologyByAtomId, constraint.atomBId, 'render constraint topology atom B');
    const renderedA = requireMap(continuousByAtomId, constraint.atomAId, 'render constraint atom A');
    const renderedB = requireMap(continuousByAtomId, constraint.atomBId, 'render constraint atom B');
    const isHh = topologyA.element === 'H' && topologyB.element === 'H';
    const edge: AqueousDynamicsRenderConstraintEdgeV042 = {
      id: constraint.id,
      moleculeId: topologyA.identity.moleculeId,
      atomAId: constraint.atomAId,
      atomBId: constraint.atomBId,
      atomAPositionAngstrom: cloneVector(renderedA.position),
      atomBPositionAngstrom: cloneVector(renderedB.position),
      renderedDistanceAngstrom: distance(renderedA.position, renderedB.position),
      targetDistanceAngstrom: constraint.distanceAngstrom,
      role: isHh
        ? 'diagnostic-hh-rigid-distance-constraint'
        : 'structural-oh-rigid-distance-constraint',
      energeticInteraction: false,
    };
    (isHh ? diagnosticHhEdges : structuralOhLinks).push(edge);
  }

  const periodicGhosts: AqueousDynamicsRenderPeriodicGhostV042[] = [];
  for (const [atomId, rendered] of continuousByAtomId) {
    if (isZeroInt3(rendered.shift)) continue;
    const atom = requireMap(observationByAtomId, atomId, 'periodic ghost source atom');
    periodicGhosts.push({
      id: `${rendered.moleculeId}:${atomId}:periodic-ghost`,
      sourceAtomId: atomId,
      moleculeId: rendered.moleculeId,
      imageShiftFromWrapped: cloneInt3(rendered.shift),
      sourceWrappedPositionAngstrom: cloneVector(atom.wrappedPositionAngstrom),
      ghostPositionAngstrom: cloneVector(rendered.position),
      role: 'minimum-image-water-continuity-only',
      selectable: false,
      countsTowardAtomCount: false,
      replacesWrappedSourceInPrimaryMolecule: true,
    });
  }

  const lennardJonesPairs: AqueousDynamicsRenderLennardJonesPairV042[] =
    observation.forceField.lennardJonesInteractions.map((interaction) => {
      const atomA = requireMap(observationByAtomId, interaction.atomAId, 'LJ render atom A');
      const atomB = requireMap(observationByAtomId, interaction.atomBId, 'LJ render atom B');
      const minimumImage = cell.minimumImageFromFractional(
        atomA.position.wrappedFractional,
        atomB.position.wrappedFractional,
      );
      return {
        id: interaction.id,
        atomAId: interaction.atomAId,
        atomBId: interaction.atomBId,
        imageShiftForB: cloneInt3(minimumImage.imageShiftForTarget),
        atomAPositionAngstrom: cloneVector(atomA.wrappedPositionAngstrom),
        atomBImagePositionAngstrom: add(atomA.wrappedPositionAngstrom, interaction.displacementAngstrom),
        displacementAngstrom: cloneVector(interaction.displacementAngstrom),
        distanceAngstrom: interaction.distanceAngstrom,
        mixedSigmaAngstrom: interaction.mixedSigmaAngstrom,
        mixedEpsilonKjMol: interaction.mixedEpsilonKjMol,
        lennardJonesScale: interaction.lennardJonesScale,
        evaluation: interaction.evaluation,
        energyKjMol: interaction.energyKjMol,
        forceOnBKjMolAngstrom: cloneVector(interaction.forceOnBKjMolAngstrom),
        virialKjMol: { ...interaction.virialKjMol },
        activeForInteractionLayer: interaction.evaluation === 'evaluated-plain-cutoff',
      };
    });

  const sourceBinding = {
    observationDigest: observation.observationDigest,
    forceFieldEvaluationDigest: observation.forceField.evaluationDigest,
    topologyDigest: observation.topologyDigest,
    configurationDigest: observation.configurationDigest,
    stateId: observation.stateId,
    stateDigest: observation.stateDigest,
    physicalDigest: observation.physicalDigest,
    step: observation.step as 0 | 1,
    timePicoseconds: observation.timePicoseconds,
  };
  const forceWork = observation.forceField.workReceipt;
  const payload: RenderFramePayload = {
    schemaVersion: 'tf.aqueous-dynamics-render-frame/0.4.2',
    sourceBinding,
    sourceBindingDigest: digestValue(sourceBinding),
    worldId: observation.worldId,
    stateId: observation.stateId,
    stateDigest: observation.stateDigest,
    physicalDigest: observation.physicalDigest,
    step: observation.step as 0 | 1,
    timePicoseconds: observation.timePicoseconds,
    cell: {
      originGauge: 'display-zero-periodic-gauge',
      originAngstrom: zeroVector(),
      vectorsAngstrom: cloneCellVectors(observation.cell.vectorsAngstrom),
      volumeAngstrom3: observation.cell.volumeAngstrom3,
      periodicAxes: [true, true, true],
      verticesAngstrom: cellVertices(zeroVector(), observation.cell.vectorsAngstrom),
    },
    atoms,
    molecules,
    structuralOhLinks,
    diagnosticHhEdges,
    periodicGhosts,
    lennardJonesPairs,
    layerAvailability: LAYER_AVAILABILITY,
    unavailableLayers: {
      trajectory: null,
      coulombPairInteractions: null,
      electricField: null,
      electronDensity: null,
      orbital: null,
      electrostaticPotential: null,
      pressureBar: null,
      totalStressKjMolAngstrom3: null,
      localVirialByAtom: null,
      bondOrder: null,
      reaction: null,
    },
    workReceipt: {
      forceFieldAllPairWorkUnits: forceWork.allPairCount,
      forceFieldCoulombExceptionWorkUnits: forceWork.coulombExceptionWorkUnitsConsumed,
      forceFieldEwaldRealSpaceWorkUnits: forceWork.ewaldRealSpaceWorkUnitsConsumed,
      forceFieldEwaldReciprocalSpaceWorkUnits: forceWork.ewaldReciprocalSpaceWorkUnitsConsumed,
      forceFieldTotalWorkUnits: forceWork.totalWorkUnitsConsumed,
      integrationSolverWorkUnits: observation.integration.lastStepSolverWorkUnitsConsumed,
      integrationComposerEndpointRankAuditWorkUnits:
        observation.integration.lastStepComposerEndpointRankAuditWorkUnitsConsumed,
      integrationTotalWorkUnits: observation.integration.lastStepWorkUnitsConsumed,
      observationConstraintRankAuditWorkUnits: observation.constraints.rankWorkUnitsConsumed,
    },
    boundaries: BOUNDARIES,
  };
  return payload;
}

function validateSourceObservation(
  candidate: AqueousDynamicsObservationV042,
): AqueousDynamicsObservationV042 {
  const step = readLockedFrozenStep(candidate);
  const world = createNaClTip3pFiniteSizeCalibrationWorldV042();
  const expected = step === 0 ? world.observe() : world.advance();
  assertExactFrozenDataTree(candidate, expected, 'aqueous render source observation');

  const observation = candidate as AqueousDynamicsObservationV042;
  assertExactOrder(observation.atoms.map((atom) => atom.id), FIXED_ATOM_IDS, 'observation atom');
  assertExactOrder(observation.topology.atoms.map((atom) => atom.id), FIXED_ATOM_IDS, 'topology atom');
  assertExactOrder(observation.forceField.atomOrder, FIXED_ATOM_IDS, 'force-field atom');
  assertExactOrder(
    observation.topology.molecules.map((molecule) => molecule.id),
    FIXED_MOLECULE_IDS,
    'molecule',
  );
  assertLockedStepReceipt(observation);
  return observation;
}

function readLockedFrozenStep(candidate: unknown): 0 | 1 {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('aqueous render source observation must be a frozen plain data record');
  }
  const prototype = Object.getPrototypeOf(candidate);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error('aqueous render source observation must be a frozen plain data record');
  }
  if (!Object.isFrozen(candidate)) {
    throw new Error('aqueous render source observation must be frozen before step selection');
  }
  const keys = Reflect.ownKeys(candidate);
  if (keys.some((key) => typeof key !== 'string')) {
    throw new Error('aqueous render source observation cannot contain symbol keys');
  }
  const descriptor = Object.getOwnPropertyDescriptor(candidate, 'step');
  if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')
    || descriptor.enumerable !== true) {
    throw new Error('aqueous render source step must be an enumerable own data property');
  }
  if (descriptor.value !== 0 && descriptor.value !== 1) {
    throw new Error('aqueous render source step must be exactly 0 or 1');
  }
  return descriptor.value as 0 | 1;
}

function assertLockedStepReceipt(observation: AqueousDynamicsObservationV042) {
  const integration = observation.integration;
  if (observation.constraints.rankWorkUnitsConsumed <= 0 || observation.constraints.jacobianRank !== 6) {
    throw new Error('aqueous render observation rank audit must be positive and full rank');
  }
  if (observation.step === 0) {
    if (integration.lastStepSolverWorkUnitsConsumed !== 0
      || integration.lastStepComposerEndpointRankAuditWorkUnitsConsumed !== 0
      || integration.lastStepWorkUnitsConsumed !== 0
      || integration.lastStepResultDigest !== null
      || integration.lastIntegrationReceipt !== null) {
      throw new Error('aqueous render initial observation must have zero step work and no receipt');
    }
    return;
  }
  const receipt = integration.lastIntegrationReceipt;
  if (!receipt
    || receipt.fromStep !== 0
    || receipt.toStep !== 1
    || receipt.integratorResultDigest !== integration.lastStepResultDigest
    || receipt.topologyDigest !== observation.topologyDigest
    || receipt.configurationDigest !== observation.configurationDigest
    || receipt.initialEvaluation.stage !== 'initial'
    || receipt.initialEvaluation.evaluationOrdinal !== 1
    || receipt.finalEvaluation.stage !== 'final'
    || receipt.finalEvaluation.evaluationOrdinal !== 2) {
    throw new Error('aqueous render one-step receipt lineage is invalid');
  }
  const { receiptDigest, ...receiptPayload } = receipt;
  const initialRankWork = receipt.initialEvaluation.constraintJacobianRankReceipt.workUnitsConsumed;
  const finalRankWork = receipt.finalEvaluation.constraintJacobianRankReceipt.workUnitsConsumed;
  const endpointRankWork = safeWorkSum(initialRankWork, finalRankWork);
  const work = receipt.workReceipt;
  if (receiptDigest !== digestValue(receiptPayload)
    || receipt.initialEvaluation.constraintJacobianRankReceipt.rank !== 6
    || receipt.finalEvaluation.constraintJacobianRankReceipt.rank !== 6
    || initialRankWork <= 0
    || finalRankWork <= 0
    || receipt.initialEvaluation.workUnitsConsumed <= 0
    || receipt.finalEvaluation.workUnitsConsumed <= 0
    || work.solverIntegratorWorkUnits <= 0
    || work.composerEndpointRankAuditWorkUnits <= 0
    || work.totalIntegrationWorkUnits <= 0
    || work.composerEndpointRankAuditWorkUnits !== endpointRankWork
    || work.totalIntegrationWorkUnits !== safeWorkSum(
      work.solverIntegratorWorkUnits,
      work.composerEndpointRankAuditWorkUnits,
    )
    || integration.lastStepSolverWorkUnitsConsumed !== work.solverIntegratorWorkUnits
    || integration.lastStepComposerEndpointRankAuditWorkUnitsConsumed
      !== work.composerEndpointRankAuditWorkUnits
    || integration.lastStepWorkUnitsConsumed !== work.totalIntegrationWorkUnits) {
    throw new Error('aqueous render one-step receipt digest, rank, or work split is invalid');
  }
}

function assertExactFrozenDataTree(actual: unknown, expected: unknown, label: string) {
  const actualAncestors = new Set<object>();
  const expectedAncestors = new Set<object>();

  const compare = (left: unknown, right: unknown, path: string): void => {
    if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
      if (!Object.is(left, right)) throw new Error(`${path} primitive value is not exact`);
      return;
    }
    const leftIsArray = Array.isArray(left);
    const rightIsArray = Array.isArray(right);
    if (leftIsArray !== rightIsArray) throw new Error(`${path} array/record kind is not exact`);
    const leftPrototype = Object.getPrototypeOf(left);
    const rightPrototype = Object.getPrototypeOf(right);
    const validLeftPrototype = leftIsArray
      ? leftPrototype === Array.prototype
      : leftPrototype === Object.prototype || leftPrototype === null;
    const validRightPrototype = rightIsArray
      ? rightPrototype === Array.prototype
      : rightPrototype === Object.prototype || rightPrototype === null;
    if (!validLeftPrototype || !validRightPrototype || leftPrototype !== rightPrototype) {
      throw new Error(`${path} must use the exact plain/null-record or array prototype`);
    }
    if (!Object.isFrozen(left) || !Object.isFrozen(right)) {
      throw new Error(`${path} data tree must be recursively frozen`);
    }
    if (actualAncestors.has(left) || expectedAncestors.has(right)) {
      throw new Error(`${path} data tree cannot contain cycles`);
    }
    actualAncestors.add(left);
    expectedAncestors.add(right);
    try {
      const leftKeys = Reflect.ownKeys(left);
      const rightKeys = Reflect.ownKeys(right);
      if (leftKeys.some((key) => typeof key !== 'string')
        || rightKeys.some((key) => typeof key !== 'string')) {
        throw new Error(`${path} data tree cannot contain symbol keys`);
      }
      if (leftKeys.length !== rightKeys.length
        || leftKeys.some((key, index) => key !== rightKeys[index])) {
        throw new Error(`${path} own-key sequence is not exact`);
      }
      const leftDescriptors = Object.getOwnPropertyDescriptors(left);
      const rightDescriptors = Object.getOwnPropertyDescriptors(right);
      for (const key of leftKeys as string[]) {
        const leftDescriptor = leftDescriptors[key];
        const rightDescriptor = rightDescriptors[key];
        if (!leftDescriptor || !rightDescriptor
          || !Object.prototype.hasOwnProperty.call(leftDescriptor, 'value')
          || !Object.prototype.hasOwnProperty.call(rightDescriptor, 'value')) {
          throw new Error(`${path}.${key} must be an own data property; accessors are forbidden`);
        }
        if (leftDescriptor.enumerable !== rightDescriptor.enumerable
          || leftDescriptor.configurable !== rightDescriptor.configurable
          || leftDescriptor.writable !== rightDescriptor.writable) {
          throw new Error(`${path}.${key} property descriptor is not exact`);
        }
        compare(leftDescriptor.value, rightDescriptor.value, `${path}.${key}`);
      }
    } finally {
      actualAncestors.delete(left);
      expectedAncestors.delete(right);
    }
  };

  compare(actual, expected, label);
}

function cloneForceComponents(components: AqueousForceComponentV042): AqueousForceComponentV042 {
  return {
    ewaldRealSpace: cloneVector(components.ewaldRealSpace),
    ewaldReciprocalSpace: cloneVector(components.ewaldReciprocalSpace),
    ewaldSelfCorrection: cloneVector(components.ewaldSelfCorrection),
    coulombExceptionCorrection: cloneVector(components.coulombExceptionCorrection),
    lennardJonesFinal: cloneVector(components.lennardJonesFinal),
    total: cloneVector(components.total),
  };
}

function assertExactOrder(
  actual: ReadonlyArray<string>,
  expected: ReadonlyArray<string>,
  label: string,
) {
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new Error(`aqueous render source ${label} order is not the locked fixture order`);
  }
}

function requireMap<Key, Value>(map: ReadonlyMap<Key, Value>, key: Key, label: string): Value {
  const value = map.get(key);
  if (value === undefined) throw new Error(`${label} ${String(key)} is missing`);
  return value;
}

function requireRecord<Value>(record: Readonly<Record<string, Value>>, key: string, label: string): Value {
  const value = record[key];
  if (value === undefined) throw new Error(`${label} ${key} is missing`);
  return value;
}

function cloneCellVectors(vectors: CellVectors3): CellVectors3 {
  return vectors.map(cloneVector) as unknown as CellVectors3;
}

function cellVertices(origin: Vector3, vectors: CellVectors3): ReadonlyArray<Vector3> {
  const [a, b, c] = vectors;
  return [
    origin,
    add(origin, a),
    add(origin, b),
    add(add(origin, a), b),
    add(origin, c),
    add(add(origin, a), c),
    add(add(origin, b), c),
    add(add(add(origin, a), b), c),
  ].map(cloneVector);
}

function cloneVector(vector: Vector3): Vector3 {
  return { x: canonicalZero(vector.x), y: canonicalZero(vector.y), z: canonicalZero(vector.z) };
}

function cloneInt3(vector: Int3): Int3 {
  return { x: canonicalZero(vector.x), y: canonicalZero(vector.y), z: canonicalZero(vector.z) };
}

function zeroVector(): Vector3 { return { x: 0, y: 0, z: 0 }; }
function zeroInt3(): Int3 { return { x: 0, y: 0, z: 0 }; }
function isZeroInt3(value: Int3) { return value.x === 0 && value.y === 0 && value.z === 0; }
function canonicalZero(value: number) { return Object.is(value, -0) ? 0 : value; }
function compareAscii(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
function add(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}
function subtract(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}
function dot(left: Vector3, right: Vector3) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}
function distance(left: Vector3, right: Vector3) {
  const delta = subtract(right, left);
  return Math.sqrt(dot(delta, delta));
}

function safeWorkSum(...values: number[]) {
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error('aqueous render source work components must be nonnegative safe integers');
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) throw new Error('aqueous render source work sum exceeds safe integer range');
  return total;
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
