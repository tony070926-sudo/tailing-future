import { digestValue } from './digest.ts';
import {
  ATOMISTIC_F64_TRAJECTORY_BYTE_LENGTH_V045,
  ATOMISTIC_FORCE_SEMANTICS_V045,
  ATOMISTIC_PARTICLE_COUNT_V045,
  ATOMISTIC_PLAN_DIGEST_V045,
  ATOMISTIC_REFERENCE_BACKEND_MANIFEST_DIGEST_V045,
  ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045,
  ATOMISTIC_SYSTEM_DIGEST_V045,
  ATOMISTIC_TIME_READBACK_ABSOLUTE_TOLERANCE_PS_V045,
  ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045,
  ATOMISTIC_TRAJECTORY_INTEGRATED_STEPS_V045,
  ATOMISTIC_TRAJECTORY_SAMPLE_STRIDE_STEPS_V045,
  ATOMISTIC_TRAJECTORY_TIME_STEP_PS_V045,
  ATOMISTIC_VELOCITY_READBACK_SEMANTICS_V045,
  ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045,
  ATOMISTIC_WORLD_SOURCE_V045,
  assertAtomisticTrajectoryChunkV045,
  assertAtomisticVisualInterpolationV045,
  type AtomisticTrajectoryChunkV045,
  type AtomisticTrajectoryFrameV045,
  type AtomisticTrajectoryLineageV045,
  type AtomisticVisualInterpolationV045,
} from './atomistic-trajectory-chunk.ts';

/**
 * Immutable presentation boundary for independently checked Reference-A
 * scientific evidence.  The current verifier does not authenticate execution,
 * so this object is deliberately ineligible for promotion and never claims a
 * reproduced or execution-authenticated trajectory.
 * Playback, seeking, selection, F32 upload, and interpolation live outside this
 * object and therefore cannot mutate or impersonate a solver frame.
 */

export const ATOMISTIC_WORLD_SESSION_VERSION_V045 =
  'tf.atomistic-world-session/0.4.5' as const;
export const ATOMISTIC_PRESENTATION_STATE_VERSION_V045 =
  'tf.atomistic-presentation-state/0.4.5' as const;
export const ATOMISTIC_WORLD_ID_V045 = 'openmm-tip3p-895-water-pme-control' as const;
export const ATOMISTIC_EXPECTED_FRAME_COUNT_V045 = ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045;
export const ATOMISTIC_EXPECTED_SAMPLE_STRIDE_STEPS_V045 =
  ATOMISTIC_TRAJECTORY_SAMPLE_STRIDE_STEPS_V045;
export const ATOMISTIC_EXPECTED_TIME_STEP_PS_V045 = ATOMISTIC_TRAJECTORY_TIME_STEP_PS_V045;
export const ATOMISTIC_EXPECTED_FINAL_STEP_V045 = ATOMISTIC_TRAJECTORY_INTEGRATED_STEPS_V045;

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const STABLE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const SOURCE_REVISION = /^(?!0{40}$)[0-9a-f]{40}$/;

type Vector3Nanometer = Readonly<{ x: number; y: number; z: number }>;
type CellVectorsNanometer3 = readonly [
  Vector3Nanometer,
  Vector3Nanometer,
  Vector3Nanometer,
];

export type AtomisticWorldSystemIdentityV045 = Readonly<{
  schemaVersion: 'tf.aqueous-system-spec/0.4.4';
  systemId: 'openmm-8.6-tip3p-895-water-pme-control';
  systemDigest: typeof ATOMISTIC_SYSTEM_DIGEST_V045;
}>;

export type AtomisticWorldBackendIdentityV045 = Readonly<{
  engine: 'OpenMM';
  engineVersion: '8.6.0';
  platform: 'Reference';
  lane: 'reference-a';
  backendManifestDigest: typeof ATOMISTIC_REFERENCE_BACKEND_MANIFEST_DIGEST_V045;
}>;

export type AtomisticWorldPreparationIdentityV045 = Readonly<{
  prepareReceiptDigest: string;
  prepareReceiptArtifactDigest: string;
  serializedSystemDigest: string;
  portableProductionStartStateDigest: string;
}>;

export type AtomisticWorldVerificationIdentityV045 = Readonly<{
  schemaVersion: 'tf.openmm-tip3p-control-receipt/0.4.5';
  statusDomain: 'independent-scientific-assessment-not-release-provenance';
  status: 'verified-pass';
  systemDigest: typeof ATOMISTIC_SYSTEM_DIGEST_V045;
  planDigest: typeof ATOMISTIC_PLAN_DIGEST_V045;
  sourceRevision: string;
  producerOutcomeDigest: string;
  artifactManifestDigest: string;
  controlReceiptDigest: string;
  verifierDigest: string;
  payloadBundleRoot: string;
  executionAuthenticityVerified: false;
  promotionEligible: false;
}>;

export type AtomisticWorldAtomOrderIdentityV045 = Readonly<{
  authority: 'pdb-record-order';
  atomOrderDigest: string;
  particleCount: typeof ATOMISTIC_PARTICLE_COUNT_V045;
  indexing: 'zero-based-render-index-maps-one-to-one-to-authoritative-order';
}>;

export type AtomisticWorldCellIdentityV045 = Readonly<{
  kind: 'orthorhombic-periodic-cell';
  vectorsNanometer: CellVectorsNanometer3;
  periodicAxes: readonly [true, true, true];
  volumeNanometer3: 27;
  cellDigest: string;
}>;

export type AtomisticWorldTopologyIdentityV045 = Readonly<{
  topologyDigest: string;
  particleCount: typeof ATOMISTIC_PARTICLE_COUNT_V045;
  topologyBondCount: 1790;
  rigidDistanceConstraintCount: 2685;
  topologyRole: 'identity-and-adjacency-not-dynamic-bond-order';
}>;

export type AtomisticWorldSessionV045 = Readonly<{
  schemaVersion: typeof ATOMISTIC_WORLD_SESSION_VERSION_V045;
  status: 'scientific-self-consistency-verified-execution-unattested-session';
  verificationBoundary: 'independent-scientific-assessment-not-execution-attestation';
  sessionId: string;
  worldId: typeof ATOMISTIC_WORLD_ID_V045;
  source: typeof ATOMISTIC_WORLD_SOURCE_V045;
  forceSemantics: typeof ATOMISTIC_FORCE_SEMANTICS_V045;
  system: AtomisticWorldSystemIdentityV045;
  backend: AtomisticWorldBackendIdentityV045;
  preparation: AtomisticWorldPreparationIdentityV045;
  verification: AtomisticWorldVerificationIdentityV045;
  atomOrder: AtomisticWorldAtomOrderIdentityV045;
  cell: AtomisticWorldCellIdentityV045;
  topology: AtomisticWorldTopologyIdentityV045;
  trajectory: Readonly<{
    referenceARunReceiptDigest: string;
    referenceARunArtifactDigest: string;
    trajectoryDigest: string;
    orderedFrameDigest: string;
    firstStep: 0;
    finalStep: typeof ATOMISTIC_EXPECTED_FINAL_STEP_V045;
    fixedTimeStepPicoseconds: typeof ATOMISTIC_EXPECTED_TIME_STEP_PS_V045;
    sampleStrideSteps: typeof ATOMISTIC_EXPECTED_SAMPLE_STRIDE_STEPS_V045;
    frameCount: typeof ATOMISTIC_EXPECTED_FRAME_COUNT_V045;
    integratedSteps: typeof ATOMISTIC_TRAJECTORY_INTEGRATED_STEPS_V045;
    monolithicF64ArtifactByteLength: typeof ATOMISTIC_F64_TRAJECTORY_BYTE_LENGTH_V045;
    velocityTemporalAlignment: typeof ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045;
    velocityReadbackSemantics: typeof ATOMISTIC_VELOCITY_READBACK_SEMANTICS_V045;
    stateEnergyTemporalAlignment: typeof ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045;
    chunkDigests: ReadonlyArray<string>;
    chunks: ReadonlyArray<AtomisticTrajectoryChunkV045>;
  }>;
  executionAuthenticityVerified: false;
  promotionEligible: false;
  immutableScientificEvidence: true;
  presentationControlsMutateScientificEvidence: false;
  sessionDigest: string;
}>;

export type AtomisticWorldSessionInputV045 = Readonly<{
  sessionId: string;
  system: AtomisticWorldSystemIdentityV045;
  backend: AtomisticWorldBackendIdentityV045;
  preparation: AtomisticWorldPreparationIdentityV045;
  verification: AtomisticWorldVerificationIdentityV045;
  atomOrder: AtomisticWorldAtomOrderIdentityV045;
  cell: AtomisticWorldCellIdentityV045;
  topology: AtomisticWorldTopologyIdentityV045;
  trajectory: Readonly<{
    referenceARunReceiptDigest: string;
    referenceARunArtifactDigest: string;
    trajectoryDigest: string;
    chunks: ReadonlyArray<AtomisticTrajectoryChunkV045>;
  }>;
}>;

export type AtomisticPresentationStateV045 = Readonly<{
  schemaVersion: typeof ATOMISTIC_PRESENTATION_STATE_VERSION_V045;
  role: 'presentation-only-no-physical-world-state';
  sourceSessionDigest: string;
  revision: number;
  playback: Readonly<{
    mode: 'paused' | 'playing';
    playbackRate: number;
    affectsSolverClock: false;
  }>;
  seek: Readonly<{
    frameOrdinal: number;
    frameDigest: string;
    changesPhysicalState: false;
  }>;
  selection: Readonly<{
    atomIndices: ReadonlyArray<number>;
    atomOrderDigest: string;
    changesPhysicalState: false;
  }>;
  interpolation: AtomisticVisualInterpolationV045 | null;
  physicalWorldState: false;
  presentationOnly: true;
  presentationDigest: string;
}>;

export function createAtomisticWorldSessionV045(
  input: AtomisticWorldSessionInputV045,
): AtomisticWorldSessionV045 {
  const clone = safePlainClone(input, 'atomistic world session input');
  assertExactKeys(clone, [
    'sessionId', 'system', 'backend', 'preparation', 'verification', 'atomOrder',
    'cell', 'topology', 'trajectory',
  ], 'atomistic world session input');
  assertStableToken(clone.sessionId, 'atomistic world sessionId');
  assertSystemIdentity(clone.system);
  assertBackendIdentity(clone.backend);
  assertPreparationIdentity(clone.preparation);
  assertVerificationIdentity(clone.verification);
  assertAtomOrderIdentity(clone.atomOrder);
  assertCellIdentity(clone.cell);
  assertTopologyIdentity(clone.topology);
  assertExactKeys(
    clone.trajectory,
    ['referenceARunReceiptDigest', 'referenceARunArtifactDigest', 'trajectoryDigest', 'chunks'],
    'atomistic session trajectory input',
  );
  assertDigest(clone.trajectory.referenceARunReceiptDigest, 'Reference A run receipt digest');
  assertDigest(clone.trajectory.referenceARunArtifactDigest, 'Reference A run artifact digest');
  assertDigest(clone.trajectory.trajectoryDigest, 'atomistic trajectory digest');
  if (!Array.isArray(clone.trajectory.chunks) || clone.trajectory.chunks.length !== 1) {
    throw new Error('atomistic world session requires one 101-frame monolithic trajectory chunk');
  }
  const chunks = clone.trajectory.chunks.map((chunk) => (
    assertAtomisticTrajectoryChunkV045(chunk)
  ));
  const frames = validateCompleteTrajectory(
    chunks,
    sessionLineageFromInput(clone),
  );
  const orderedFrameDigest = digestValue({
    schemaVersion: 'tf.atomistic-ordered-frame-set/0.4.5',
    source: ATOMISTIC_WORLD_SOURCE_V045,
    trajectoryDigest: clone.trajectory.trajectoryDigest,
    frameDigests: frames.map((frame) => frame.frameDigest),
  });
  const payload = {
    schemaVersion: ATOMISTIC_WORLD_SESSION_VERSION_V045,
    status: 'scientific-self-consistency-verified-execution-unattested-session' as const,
    verificationBoundary: 'independent-scientific-assessment-not-execution-attestation' as const,
    sessionId: clone.sessionId,
    worldId: ATOMISTIC_WORLD_ID_V045,
    source: ATOMISTIC_WORLD_SOURCE_V045,
    forceSemantics: ATOMISTIC_FORCE_SEMANTICS_V045,
    system: { ...clone.system },
    backend: { ...clone.backend },
    preparation: { ...clone.preparation },
    verification: { ...clone.verification },
    atomOrder: { ...clone.atomOrder },
    cell: structuredClone(clone.cell),
    topology: { ...clone.topology },
    trajectory: {
      referenceARunReceiptDigest: clone.trajectory.referenceARunReceiptDigest,
      referenceARunArtifactDigest: clone.trajectory.referenceARunArtifactDigest,
      trajectoryDigest: clone.trajectory.trajectoryDigest,
      orderedFrameDigest,
      firstStep: 0 as const,
      finalStep: ATOMISTIC_EXPECTED_FINAL_STEP_V045,
      fixedTimeStepPicoseconds: ATOMISTIC_EXPECTED_TIME_STEP_PS_V045,
      sampleStrideSteps: ATOMISTIC_EXPECTED_SAMPLE_STRIDE_STEPS_V045,
      frameCount: ATOMISTIC_EXPECTED_FRAME_COUNT_V045,
      integratedSteps: ATOMISTIC_TRAJECTORY_INTEGRATED_STEPS_V045,
      monolithicF64ArtifactByteLength: ATOMISTIC_F64_TRAJECTORY_BYTE_LENGTH_V045,
      velocityTemporalAlignment: ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045,
      velocityReadbackSemantics: ATOMISTIC_VELOCITY_READBACK_SEMANTICS_V045,
      stateEnergyTemporalAlignment: ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045,
      chunkDigests: chunks.map((chunk) => chunk.chunkDigest),
      chunks: chunks.map((chunk) => structuredClone(chunk)),
    },
    executionAuthenticityVerified: false as const,
    promotionEligible: false as const,
    immutableScientificEvidence: true as const,
    presentationControlsMutateScientificEvidence: false as const,
  };
  return assertAtomisticWorldSessionV045({
    ...payload,
    sessionDigest: digestValue(payload),
  });
}

export function assertAtomisticWorldSessionV045(candidate: unknown): AtomisticWorldSessionV045 {
  const clone = safePlainClone(candidate, 'atomistic world session') as AtomisticWorldSessionV045;
  assertExactKeys(clone, [
    'schemaVersion', 'status', 'verificationBoundary', 'sessionId', 'worldId',
    'source', 'forceSemantics', 'system', 'backend', 'preparation', 'verification',
    'atomOrder', 'cell', 'topology', 'trajectory', 'executionAuthenticityVerified',
    'promotionEligible', 'immutableScientificEvidence',
    'presentationControlsMutateScientificEvidence', 'sessionDigest',
  ], 'atomistic world session');
  if (clone.schemaVersion !== ATOMISTIC_WORLD_SESSION_VERSION_V045
    || clone.status !== 'scientific-self-consistency-verified-execution-unattested-session'
    || clone.verificationBoundary !== 'independent-scientific-assessment-not-execution-attestation'
    || clone.worldId !== ATOMISTIC_WORLD_ID_V045
    || clone.source !== ATOMISTIC_WORLD_SOURCE_V045
    || clone.forceSemantics !== ATOMISTIC_FORCE_SEMANTICS_V045
    || clone.executionAuthenticityVerified !== false
    || clone.promotionEligible !== false
    || clone.immutableScientificEvidence !== true
    || clone.presentationControlsMutateScientificEvidence !== false) {
    throw new Error('atomistic world session scientific or execution-unattested boundary changed');
  }
  assertStableToken(clone.sessionId, 'atomistic world sessionId');
  assertSystemIdentity(clone.system);
  assertBackendIdentity(clone.backend);
  assertPreparationIdentity(clone.preparation);
  assertVerificationIdentity(clone.verification);
  assertAtomOrderIdentity(clone.atomOrder);
  assertCellIdentity(clone.cell);
  assertTopologyIdentity(clone.topology);
  assertExactKeys(clone.trajectory, [
    'referenceARunReceiptDigest', 'referenceARunArtifactDigest',
    'trajectoryDigest', 'orderedFrameDigest',
    'firstStep', 'finalStep', 'fixedTimeStepPicoseconds', 'sampleStrideSteps',
    'frameCount', 'integratedSteps', 'monolithicF64ArtifactByteLength',
    'velocityTemporalAlignment', 'velocityReadbackSemantics',
    'stateEnergyTemporalAlignment', 'chunkDigests', 'chunks',
  ], 'atomistic session trajectory');
  assertDigest(clone.trajectory.referenceARunReceiptDigest, 'Reference A run receipt digest');
  assertDigest(clone.trajectory.referenceARunArtifactDigest, 'Reference A run artifact digest');
  assertDigest(clone.trajectory.trajectoryDigest, 'atomistic trajectory digest');
  assertDigest(clone.trajectory.orderedFrameDigest, 'atomistic ordered frame digest');
  if (clone.trajectory.firstStep !== 0
    || clone.trajectory.finalStep !== ATOMISTIC_EXPECTED_FINAL_STEP_V045
    || clone.trajectory.fixedTimeStepPicoseconds !== ATOMISTIC_EXPECTED_TIME_STEP_PS_V045
    || clone.trajectory.sampleStrideSteps !== ATOMISTIC_EXPECTED_SAMPLE_STRIDE_STEPS_V045
    || clone.trajectory.frameCount !== ATOMISTIC_EXPECTED_FRAME_COUNT_V045
    || clone.trajectory.integratedSteps !== ATOMISTIC_TRAJECTORY_INTEGRATED_STEPS_V045
    || clone.trajectory.monolithicF64ArtifactByteLength
      !== ATOMISTIC_F64_TRAJECTORY_BYTE_LENGTH_V045
    || clone.trajectory.velocityTemporalAlignment !== ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045
    || clone.trajectory.velocityReadbackSemantics !== ATOMISTIC_VELOCITY_READBACK_SEMANTICS_V045
    || clone.trajectory.stateEnergyTemporalAlignment
      !== ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045) {
    throw new Error('atomistic world session trajectory cadence changed');
  }
  if (!Array.isArray(clone.trajectory.chunks) || clone.trajectory.chunks.length !== 1
    || !Array.isArray(clone.trajectory.chunkDigests)
    || clone.trajectory.chunkDigests.length !== 1) {
    throw new Error('atomistic world session must index one monolithic trajectory chunk');
  }
  const chunks = clone.trajectory.chunks.map((chunk, index) => {
    const validated = assertAtomisticTrajectoryChunkV045(chunk);
    assertDigest(clone.trajectory.chunkDigests[index], `atomistic chunk ${index} index digest`);
    if (clone.trajectory.chunkDigests[index] !== validated.chunkDigest) {
      throw new Error(`atomistic chunk ${index} index digest is stale`);
    }
    return validated;
  });
  const frames = validateCompleteTrajectory(chunks, sessionLineage(clone));
  const expectedOrderedFrameDigest = digestValue({
    schemaVersion: 'tf.atomistic-ordered-frame-set/0.4.5',
    source: ATOMISTIC_WORLD_SOURCE_V045,
    trajectoryDigest: clone.trajectory.trajectoryDigest,
    frameDigests: frames.map((frame) => frame.frameDigest),
  });
  if (clone.trajectory.orderedFrameDigest !== expectedOrderedFrameDigest) {
    throw new Error('atomistic ordered frame digest is stale');
  }
  assertDigest(clone.sessionDigest, 'atomistic session digest');
  const { sessionDigest, ...payload } = clone;
  if (sessionDigest !== digestValue(payload)) throw new Error('atomistic session digest is stale');
  return deepFreeze(clone);
}

export function getAtomisticWorldSessionFrameV045(
  sessionInput: AtomisticWorldSessionV045,
  frameOrdinal: number,
): AtomisticTrajectoryFrameV045 {
  const session = assertAtomisticWorldSessionV045(sessionInput);
  assertSafeInteger(
    frameOrdinal,
    0,
    ATOMISTIC_EXPECTED_FRAME_COUNT_V045 - 1,
    'atomistic requested frame ordinal',
  );
  const frame = flattenFrames(session.trajectory.chunks)[frameOrdinal];
  if (!frame || frame.frameOrdinal !== frameOrdinal) {
    throw new Error('atomistic requested frame is missing from the authoritative trajectory');
  }
  return frame;
}

export function createAtomisticPresentationStateV045(
  sessionInput: AtomisticWorldSessionV045,
): AtomisticPresentationStateV045 {
  const session = assertAtomisticWorldSessionV045(sessionInput);
  const frame = flattenFrames(session.trajectory.chunks)[0];
  return buildPresentationState(session, {
    revision: 0,
    playback: {
      mode: 'paused',
      playbackRate: 1,
      affectsSolverClock: false,
    },
    seek: {
      frameOrdinal: 0,
      frameDigest: frame.frameDigest,
      changesPhysicalState: false,
    },
    selection: {
      atomIndices: [],
      atomOrderDigest: session.atomOrder.atomOrderDigest,
      changesPhysicalState: false,
    },
    interpolation: null,
  });
}

export function setAtomisticPresentationPlaybackV045(
  sessionInput: AtomisticWorldSessionV045,
  stateInput: AtomisticPresentationStateV045,
  mode: 'paused' | 'playing',
  playbackRate: number,
): AtomisticPresentationStateV045 {
  const session = assertAtomisticWorldSessionV045(sessionInput);
  const state = assertAtomisticPresentationStateV045(stateInput, session);
  if (mode !== 'paused' && mode !== 'playing') throw new Error('atomistic playback mode is invalid');
  assertPositiveFinite(playbackRate, 'atomistic playback rate');
  if (playbackRate > 16) throw new Error('atomistic playback rate exceeds the presentation bound');
  return buildPresentationState(session, {
    revision: nextRevision(state.revision),
    playback: { mode, playbackRate, affectsSolverClock: false },
    seek: structuredClone(state.seek),
    selection: structuredClone(state.selection),
    interpolation: state.interpolation ? structuredClone(state.interpolation) : null,
  });
}

export function seekAtomisticPresentationV045(
  sessionInput: AtomisticWorldSessionV045,
  stateInput: AtomisticPresentationStateV045,
  frameOrdinal: number,
): AtomisticPresentationStateV045 {
  const session = assertAtomisticWorldSessionV045(sessionInput);
  const state = assertAtomisticPresentationStateV045(stateInput, session);
  const frame = getFrameFromValidatedSession(session, frameOrdinal);
  return buildPresentationState(session, {
    revision: nextRevision(state.revision),
    playback: structuredClone(state.playback),
    seek: {
      frameOrdinal,
      frameDigest: frame.frameDigest,
      changesPhysicalState: false,
    },
    selection: structuredClone(state.selection),
    interpolation: null,
  });
}

export function selectAtomisticPresentationAtomsV045(
  sessionInput: AtomisticWorldSessionV045,
  stateInput: AtomisticPresentationStateV045,
  atomIndices: ReadonlyArray<number>,
): AtomisticPresentationStateV045 {
  const session = assertAtomisticWorldSessionV045(sessionInput);
  const state = assertAtomisticPresentationStateV045(stateInput, session);
  const indices = safePlainClone(atomIndices, 'atomistic presentation atom selection');
  assertAtomSelection(indices, session.atomOrder.particleCount);
  return buildPresentationState(session, {
    revision: nextRevision(state.revision),
    playback: structuredClone(state.playback),
    seek: structuredClone(state.seek),
    selection: {
      atomIndices: indices,
      atomOrderDigest: session.atomOrder.atomOrderDigest,
      changesPhysicalState: false,
    },
    interpolation: state.interpolation ? structuredClone(state.interpolation) : null,
  });
}

export function setAtomisticPresentationInterpolationV045(
  sessionInput: AtomisticWorldSessionV045,
  stateInput: AtomisticPresentationStateV045,
  interpolationInput: AtomisticVisualInterpolationV045 | null,
): AtomisticPresentationStateV045 {
  const session = assertAtomisticWorldSessionV045(sessionInput);
  const state = assertAtomisticPresentationStateV045(stateInput, session);
  if (interpolationInput === null) {
    return buildPresentationState(session, {
      revision: nextRevision(state.revision),
      playback: structuredClone(state.playback),
      seek: structuredClone(state.seek),
      selection: structuredClone(state.selection),
      interpolation: null,
    });
  }
  const interpolation = assertInterpolationBelongsToSession(interpolationInput, session);
  return buildPresentationState(session, {
    revision: nextRevision(state.revision),
    playback: structuredClone(state.playback),
    seek: {
      frameOrdinal: interpolation.frameA.frameOrdinal,
      frameDigest: interpolation.frameA.frameDigest,
      changesPhysicalState: false,
    },
    selection: structuredClone(state.selection),
    interpolation,
  });
}

export function assertAtomisticPresentationStateV045(
  candidate: unknown,
  sessionInput: AtomisticWorldSessionV045,
): AtomisticPresentationStateV045 {
  const session = assertAtomisticWorldSessionV045(sessionInput);
  const clone = safePlainClone(candidate, 'atomistic presentation state') as AtomisticPresentationStateV045;
  assertExactKeys(clone, [
    'schemaVersion', 'role', 'sourceSessionDigest', 'revision', 'playback',
    'seek', 'selection', 'interpolation', 'physicalWorldState',
    'presentationOnly', 'presentationDigest',
  ], 'atomistic presentation state');
  if (clone.schemaVersion !== ATOMISTIC_PRESENTATION_STATE_VERSION_V045
    || clone.role !== 'presentation-only-no-physical-world-state'
    || clone.sourceSessionDigest !== session.sessionDigest
    || clone.physicalWorldState !== false
    || clone.presentationOnly !== true) {
    throw new Error('atomistic presentation state cannot be a physical world state');
  }
  assertSafeInteger(clone.revision, 0, 1_000_000_000, 'atomistic presentation revision');
  assertExactKeys(
    clone.playback,
    ['mode', 'playbackRate', 'affectsSolverClock'],
    'atomistic presentation playback',
  );
  if ((clone.playback.mode !== 'paused' && clone.playback.mode !== 'playing')
    || clone.playback.affectsSolverClock !== false) {
    throw new Error('atomistic playback must remain presentation-only');
  }
  assertPositiveFinite(clone.playback.playbackRate, 'atomistic playback rate');
  if (clone.playback.playbackRate > 16) {
    throw new Error('atomistic playback rate exceeds the presentation bound');
  }
  assertExactKeys(
    clone.seek,
    ['frameOrdinal', 'frameDigest', 'changesPhysicalState'],
    'atomistic presentation seek',
  );
  if (clone.seek.changesPhysicalState !== false) {
    throw new Error('atomistic seek cannot change physical state');
  }
  const soughtFrame = getFrameFromValidatedSession(session, clone.seek.frameOrdinal);
  if (clone.seek.frameDigest !== soughtFrame.frameDigest) {
    throw new Error('atomistic seek frame digest is stale');
  }
  assertExactKeys(
    clone.selection,
    ['atomIndices', 'atomOrderDigest', 'changesPhysicalState'],
    'atomistic presentation selection',
  );
  if (clone.selection.atomOrderDigest !== session.atomOrder.atomOrderDigest
    || clone.selection.changesPhysicalState !== false) {
    throw new Error('atomistic selection lineage or presentation boundary changed');
  }
  assertAtomSelection(clone.selection.atomIndices, session.atomOrder.particleCount);
  if (clone.interpolation !== null) {
    const interpolation = assertInterpolationBelongsToSession(clone.interpolation, session);
    if (clone.seek.frameOrdinal !== interpolation.frameA.frameOrdinal
      || clone.seek.frameDigest !== interpolation.frameA.frameDigest) {
      throw new Error('atomistic interpolation must start at the sought authoritative frame');
    }
  }
  assertDigest(clone.presentationDigest, 'atomistic presentation digest');
  const { presentationDigest, ...payload } = clone;
  if (presentationDigest !== digestValue(payload)) {
    throw new Error('atomistic presentation digest is stale');
  }
  return deepFreeze(clone);
}

type PresentationPayload = Readonly<{
  revision: number;
  playback: AtomisticPresentationStateV045['playback'];
  seek: AtomisticPresentationStateV045['seek'];
  selection: AtomisticPresentationStateV045['selection'];
  interpolation: AtomisticVisualInterpolationV045 | null;
}>;

function buildPresentationState(
  session: AtomisticWorldSessionV045,
  input: PresentationPayload,
) {
  const payload = {
    schemaVersion: ATOMISTIC_PRESENTATION_STATE_VERSION_V045,
    role: 'presentation-only-no-physical-world-state' as const,
    sourceSessionDigest: session.sessionDigest,
    revision: input.revision,
    playback: structuredClone(input.playback),
    seek: structuredClone(input.seek),
    selection: structuredClone(input.selection),
    interpolation: input.interpolation ? structuredClone(input.interpolation) : null,
    physicalWorldState: false as const,
    presentationOnly: true as const,
  };
  return assertAtomisticPresentationStateV045({
    ...payload,
    presentationDigest: digestValue(payload),
  }, session);
}

function validateCompleteTrajectory(
  chunks: ReadonlyArray<AtomisticTrajectoryChunkV045>,
  expectedLineage: AtomisticTrajectoryLineageV045,
) {
  if (chunks.length !== 1) {
    throw new Error('atomistic session requires one 101-frame monolithic trajectory chunk');
  }
  const frames: AtomisticTrajectoryFrameV045[] = [];
  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const chunk = chunks[chunkIndex];
    assertExactDeepValue(chunk.lineage, expectedLineage, `atomistic chunk ${chunkIndex} lineage`);
    if (chunk.sampleStrideSteps !== ATOMISTIC_EXPECTED_SAMPLE_STRIDE_STEPS_V045
      || chunk.fixedTimeStepPicoseconds !== ATOMISTIC_EXPECTED_TIME_STEP_PS_V045
      || chunk.firstFrameOrdinal !== frames.length) {
      throw new Error(`atomistic chunk ${chunkIndex} cadence or ordering changed`);
    }
    frames.push(...chunk.frames);
  }
  if (frames.length !== ATOMISTIC_EXPECTED_FRAME_COUNT_V045) {
    throw new Error('atomistic session must contain exactly 101 scientific evidence frames');
  }
  for (let ordinal = 0; ordinal < frames.length; ordinal += 1) {
    const frame = frames[ordinal];
    const expectedStep = ordinal * ATOMISTIC_EXPECTED_SAMPLE_STRIDE_STEPS_V045;
    const expectedTime = expectedStep * ATOMISTIC_EXPECTED_TIME_STEP_PS_V045;
    const timeResidual = Math.abs(frame.timePicoseconds - expectedTime);
    if (frame.frameOrdinal !== ordinal || frame.step !== expectedStep) {
      throw new Error(`atomistic session frame ${ordinal} cadence changed`);
    }
    if (!Number.isFinite(timeResidual)
      || timeResidual > ATOMISTIC_TIME_READBACK_ABSOLUTE_TOLERANCE_PS_V045) {
      throw new Error(`atomistic session frame ${ordinal} time readback exceeds tolerance`);
    }
  }
  if (frames[0].step !== 0
    || frames[frames.length - 1].step !== ATOMISTIC_EXPECTED_FINAL_STEP_V045) {
    throw new Error('atomistic session trajectory endpoints changed');
  }
  return frames;
}

function sessionLineageFromInput(input: AtomisticWorldSessionInputV045) {
  return {
    systemDigest: input.system.systemDigest,
    planDigest: input.verification.planDigest,
    sourceRevision: input.verification.sourceRevision,
    backendManifestDigest: input.backend.backendManifestDigest,
    serializedSystemDigest: input.preparation.serializedSystemDigest,
    prepareReceiptDigest: input.preparation.prepareReceiptDigest,
    prepareReceiptArtifactDigest: input.preparation.prepareReceiptArtifactDigest,
    referenceARunReceiptDigest: input.trajectory.referenceARunReceiptDigest,
    referenceARunArtifactDigest: input.trajectory.referenceARunArtifactDigest,
    producerOutcomeDigest: input.verification.producerOutcomeDigest,
    artifactManifestDigest: input.verification.artifactManifestDigest,
    controlReceiptDigest: input.verification.controlReceiptDigest,
    verifierDigest: input.verification.verifierDigest,
    payloadBundleRoot: input.verification.payloadBundleRoot,
    trajectoryDigest: input.trajectory.trajectoryDigest,
    atomOrderDigest: input.atomOrder.atomOrderDigest,
    cellDigest: input.cell.cellDigest,
    topologyDigest: input.topology.topologyDigest,
    integratedSteps: ATOMISTIC_TRAJECTORY_INTEGRATED_STEPS_V045,
    velocityTemporalAlignment: ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045,
    stateEnergyTemporalAlignment: ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045,
    executionAuthenticityVerified: false as const,
    promotionEligible: false as const,
  };
}

function sessionLineage(session: AtomisticWorldSessionV045) {
  return {
    systemDigest: session.system.systemDigest,
    planDigest: session.verification.planDigest,
    sourceRevision: session.verification.sourceRevision,
    backendManifestDigest: session.backend.backendManifestDigest,
    serializedSystemDigest: session.preparation.serializedSystemDigest,
    prepareReceiptDigest: session.preparation.prepareReceiptDigest,
    prepareReceiptArtifactDigest: session.preparation.prepareReceiptArtifactDigest,
    referenceARunReceiptDigest: session.trajectory.referenceARunReceiptDigest,
    referenceARunArtifactDigest: session.trajectory.referenceARunArtifactDigest,
    producerOutcomeDigest: session.verification.producerOutcomeDigest,
    artifactManifestDigest: session.verification.artifactManifestDigest,
    controlReceiptDigest: session.verification.controlReceiptDigest,
    verifierDigest: session.verification.verifierDigest,
    payloadBundleRoot: session.verification.payloadBundleRoot,
    trajectoryDigest: session.trajectory.trajectoryDigest,
    atomOrderDigest: session.atomOrder.atomOrderDigest,
    cellDigest: session.cell.cellDigest,
    topologyDigest: session.topology.topologyDigest,
    integratedSteps: session.trajectory.integratedSteps,
    velocityTemporalAlignment: session.trajectory.velocityTemporalAlignment,
    stateEnergyTemporalAlignment: session.trajectory.stateEnergyTemporalAlignment,
    executionAuthenticityVerified: session.verification.executionAuthenticityVerified,
    promotionEligible: session.verification.promotionEligible,
  };
}

function assertSystemIdentity(value: AtomisticWorldSystemIdentityV045) {
  assertExactKeys(value, ['schemaVersion', 'systemId', 'systemDigest'], 'atomistic system identity');
  if (value.schemaVersion !== 'tf.aqueous-system-spec/0.4.4'
    || value.systemId !== 'openmm-8.6-tip3p-895-water-pme-control'
    || value.systemDigest !== ATOMISTIC_SYSTEM_DIGEST_V045) {
    throw new Error('atomistic system identity is not the locked aqueous control');
  }
}

function assertBackendIdentity(value: AtomisticWorldBackendIdentityV045) {
  assertExactKeys(value, [
    'engine', 'engineVersion', 'platform', 'lane', 'backendManifestDigest',
  ], 'atomistic backend identity');
  if (value.engine !== 'OpenMM' || value.engineVersion !== '8.6.0'
    || value.platform !== 'Reference' || value.lane !== 'reference-a'
    || value.backendManifestDigest !== ATOMISTIC_REFERENCE_BACKEND_MANIFEST_DIGEST_V045) {
    throw new Error('atomistic backend identity is not OpenMM Reference A');
  }
}

function assertPreparationIdentity(value: AtomisticWorldPreparationIdentityV045) {
  assertExactKeys(value, [
    'prepareReceiptDigest', 'prepareReceiptArtifactDigest', 'serializedSystemDigest',
    'portableProductionStartStateDigest',
  ], 'atomistic preparation identity');
  assertDigest(value.prepareReceiptDigest, 'atomistic prepare receipt digest');
  assertDigest(value.prepareReceiptArtifactDigest, 'atomistic prepare receipt artifact digest');
  assertDigest(value.serializedSystemDigest, 'atomistic serialized system digest');
  assertDigest(
    value.portableProductionStartStateDigest,
    'atomistic portable production start state digest',
  );
}

function assertVerificationIdentity(value: AtomisticWorldVerificationIdentityV045) {
  assertExactKeys(value, [
    'schemaVersion', 'statusDomain', 'status', 'systemDigest', 'planDigest',
    'sourceRevision', 'producerOutcomeDigest', 'artifactManifestDigest',
    'controlReceiptDigest', 'verifierDigest', 'payloadBundleRoot',
    'executionAuthenticityVerified', 'promotionEligible',
  ], 'atomistic independent verification identity');
  if (value.schemaVersion !== 'tf.openmm-tip3p-control-receipt/0.4.5'
    || value.statusDomain !== 'independent-scientific-assessment-not-release-provenance'
    || value.status !== 'verified-pass'
    || value.systemDigest !== ATOMISTIC_SYSTEM_DIGEST_V045
    || value.planDigest !== ATOMISTIC_PLAN_DIGEST_V045
    || value.executionAuthenticityVerified !== false
    || value.promotionEligible !== false) {
    throw new Error(
      'atomistic session requires scientific verified-pass evidence with execution and promotion disabled',
    );
  }
  if (typeof value.sourceRevision !== 'string' || !SOURCE_REVISION.test(value.sourceRevision)) {
    throw new Error('atomistic verification source revision is invalid');
  }
  assertDigest(value.producerOutcomeDigest, 'atomistic producer outcome digest');
  assertDigest(value.artifactManifestDigest, 'atomistic artifact manifest digest');
  assertDigest(value.controlReceiptDigest, 'atomistic control receipt digest');
  assertDigest(value.verifierDigest, 'atomistic verifier digest');
  assertDigest(value.payloadBundleRoot, 'atomistic payload bundle root');
}

function assertAtomOrderIdentity(value: AtomisticWorldAtomOrderIdentityV045) {
  assertExactKeys(value, [
    'authority', 'atomOrderDigest', 'particleCount', 'indexing',
  ], 'atomistic atom-order identity');
  if (value.authority !== 'pdb-record-order'
    || value.particleCount !== ATOMISTIC_PARTICLE_COUNT_V045
    || value.indexing !== 'zero-based-render-index-maps-one-to-one-to-authoritative-order') {
    throw new Error('atomistic atom-order identity changed');
  }
  assertDigest(value.atomOrderDigest, 'atomistic atom-order digest');
}

function assertCellIdentity(value: AtomisticWorldCellIdentityV045) {
  assertExactKeys(value, [
    'kind', 'vectorsNanometer', 'periodicAxes', 'volumeNanometer3', 'cellDigest',
  ], 'atomistic cell identity');
  if (value.kind !== 'orthorhombic-periodic-cell'
    || value.volumeNanometer3 !== 27
    || !exactArray(value.periodicAxes, [true, true, true])) {
    throw new Error('atomistic cell kind, axes, or volume changed');
  }
  assertCellVectors(value.vectorsNanometer);
  const expected = [
    { x: 3, y: 0, z: 0 },
    { x: 0, y: 3, z: 0 },
    { x: 0, y: 0, z: 3 },
  ];
  assertExactDeepValue(value.vectorsNanometer, expected, 'atomistic cell vectors');
  assertDigest(value.cellDigest, 'atomistic cell digest');
}

function assertTopologyIdentity(value: AtomisticWorldTopologyIdentityV045) {
  assertExactKeys(value, [
    'topologyDigest', 'particleCount', 'topologyBondCount',
    'rigidDistanceConstraintCount', 'topologyRole',
  ], 'atomistic topology identity');
  if (value.particleCount !== ATOMISTIC_PARTICLE_COUNT_V045
    || value.topologyBondCount !== 1790
    || value.rigidDistanceConstraintCount !== 2685
    || value.topologyRole !== 'identity-and-adjacency-not-dynamic-bond-order') {
    throw new Error('atomistic topology counts or role changed');
  }
  assertDigest(value.topologyDigest, 'atomistic topology digest');
}

function assertInterpolationBelongsToSession(
  interpolationInput: AtomisticVisualInterpolationV045,
  session: AtomisticWorldSessionV045,
) {
  const probe = safePlainClone(interpolationInput, 'atomistic presentation interpolation');
  if (!probe || typeof probe !== 'object') throw new Error('atomistic interpolation is invalid');
  const candidate = probe as AtomisticVisualInterpolationV045;
  const frameA = getFrameFromValidatedSession(session, candidate.frameA.frameOrdinal);
  const frameB = getFrameFromValidatedSession(session, candidate.frameB.frameOrdinal);
  return assertAtomisticVisualInterpolationV045(candidate, frameA, frameB);
}

function getFrameFromValidatedSession(session: AtomisticWorldSessionV045, frameOrdinal: number) {
  assertSafeInteger(
    frameOrdinal,
    0,
    ATOMISTIC_EXPECTED_FRAME_COUNT_V045 - 1,
    'atomistic requested frame ordinal',
  );
  const frame = flattenFrames(session.trajectory.chunks)[frameOrdinal];
  if (!frame || frame.frameOrdinal !== frameOrdinal) {
    throw new Error('atomistic requested frame is missing');
  }
  return frame;
}

function flattenFrames(chunks: ReadonlyArray<AtomisticTrajectoryChunkV045>) {
  return chunks.flatMap((chunk) => chunk.frames);
}

function assertAtomSelection(value: ReadonlyArray<number>, particleCount: number) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
    || value.length > 256) {
    throw new Error('atomistic presentation selection must contain at most 256 intrinsic indices');
  }
  let previous = -1;
  for (let index = 0; index < value.length; index += 1) {
    const atomIndex = value[index];
    assertSafeInteger(atomIndex, 0, particleCount - 1, `atomistic selected atom ${index}`);
    if (atomIndex <= previous) {
      throw new Error('atomistic selected atom indices must be strictly increasing and unique');
    }
    previous = atomIndex;
  }
}

function assertCellVectors(value: CellVectorsNanometer3) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error('atomistic cell needs exactly three vectors');
  }
  for (let index = 0; index < 3; index += 1) {
    const vector = value[index];
    assertExactKeys(vector, ['x', 'y', 'z'], `atomistic cell vector ${index}`);
    assertFinite(vector.x, `atomistic cell vector ${index}.x`);
    assertFinite(vector.y, `atomistic cell vector ${index}.y`);
    assertFinite(vector.z, `atomistic cell vector ${index}.z`);
  }
  const [a, b, c] = value;
  const determinant = a.x * (b.y * c.z - b.z * c.y)
    - b.x * (a.y * c.z - a.z * c.y)
    + c.x * (a.y * b.z - a.z * b.y);
  if (!(determinant > 0)) throw new Error('atomistic cell must be right-handed and non-singular');
}

function safePlainClone<T>(value: T, label: string): T {
  try {
    assertBoundedPlainDataTree(value);
    void digestValue(value);
  } catch (error) {
    throw new Error(`${label} is not a canonical plain-data tree`, { cause: error });
  }
  return structuredClone(value);
}

function assertBoundedPlainDataTree(value: unknown): void {
  const seen = new Set<object>();
  let nodes = 0;
  const visit = (node: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > 500_000) throw new TypeError('plain-data tree exceeds 500000 nodes');
    if (depth > 64) throw new TypeError('plain-data tree exceeds depth 64');
    if (node === null || typeof node === 'boolean') return;
    if (typeof node === 'string') {
      if (node.length > 1_000_000) throw new TypeError('plain-data string is too long');
      return;
    }
    if (typeof node === 'number') {
      if (!Number.isFinite(node) || Object.is(node, -0)) {
        throw new TypeError('plain-data numbers must be finite and cannot be negative zero');
      }
      return;
    }
    if (typeof node !== 'object') throw new TypeError('plain-data tree has a non-JSON value');
    if (seen.has(node)) throw new TypeError('plain-data tree cannot contain cycles or aliases');
    seen.add(node);
    const descriptors = Object.getOwnPropertyDescriptors(node);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== 'string')) {
      throw new TypeError('plain-data tree cannot contain symbol keys');
    }
    if (Array.isArray(node)) {
      if (Object.getPrototypeOf(node) !== Array.prototype) {
        throw new TypeError('plain-data arrays must use the intrinsic Array prototype');
      }
      if (node.length > 100_000) throw new TypeError('plain-data array is too long');
      const stringKeys = keys as string[];
      if (stringKeys.some((key) => key !== 'length' && !isArrayIndex(key, node.length))) {
        throw new TypeError('plain-data arrays cannot contain decorated keys');
      }
      for (let index = 0; index < node.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
          throw new TypeError('plain-data arrays must be dense enumerable data arrays');
        }
        visit(descriptor.value, depth + 1);
      }
      return;
    }
    const prototype = Object.getPrototypeOf(node);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('plain-data records must have a plain prototype');
    }
    if (keys.length > 10_000) throw new TypeError('plain-data record has too many keys');
    for (const key of keys as string[]) {
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
        throw new TypeError('plain-data records require enumerable defined data properties');
      }
      visit(descriptor.value, depth + 1);
    }
  };
  visit(value, 0);
}

function assertExactKeys(value: unknown, expected: ReadonlyArray<string>, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a plain record with exactly the locked keys`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain record with exactly the locked keys`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) {
    throw new Error(`${label} must contain only locked string keys`);
  }
  const actual = [...keys as string[]].sort(compareAscii);
  const locked = [...expected].sort(compareAscii);
  if (actual.length !== locked.length || actual.some((key, index) => key !== locked[index])) {
    throw new Error(`${label} must contain exactly the locked keys`);
  }
}

function assertExactDeepValue(actual: unknown, expected: unknown, label: string): void {
  if (Object.is(actual, expected)) return;
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) {
      throw new Error(`${label} is not exact`);
    }
    for (let index = 0; index < expected.length; index += 1) {
      if (!Object.hasOwn(actual, index) || !Object.hasOwn(expected, index)) {
        throw new Error(`${label} is not exact`);
      }
      assertExactDeepValue(actual[index], expected[index], `${label}[${index}]`);
    }
    return;
  }
  if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
    const actualRecord = actual as Record<string, unknown>;
    const expectedRecord = expected as Record<string, unknown>;
    const actualKeys = Object.keys(actualRecord).sort(compareAscii);
    const expectedKeys = Object.keys(expectedRecord).sort(compareAscii);
    if (actualKeys.length !== expectedKeys.length
      || actualKeys.some((key, index) => key !== expectedKeys[index])) {
      throw new Error(`${label} is not exact`);
    }
    for (const key of expectedKeys) {
      assertExactDeepValue(actualRecord[key], expectedRecord[key], `${label}.${key}`);
    }
    return;
  }
  throw new Error(`${label} is not exact`);
}

function assertStableToken(value: unknown, label: string) {
  if (typeof value !== 'string' || !STABLE_TOKEN.test(value)) {
    throw new Error(`${label} must be a stable ASCII token`);
  }
}

function assertDigest(value: unknown, label: string) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new Error(`${label} is invalid`);
}

function assertSafeInteger(value: unknown, minimum: number, maximum: number, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${label} must be a bounded safe integer`);
  }
}

function assertFinite(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0)) {
    throw new Error(`${label} must be finite and cannot be negative zero`);
  }
}

function assertPositiveFinite(value: unknown, label: string) {
  assertFinite(value, label);
  if ((value as number) <= 0) throw new Error(`${label} must be positive`);
}

function nextRevision(revision: number) {
  const next = revision + 1;
  assertSafeInteger(next, 1, 1_000_000_000, 'atomistic presentation revision');
  return next;
}

function exactArray(left: ReadonlyArray<unknown>, right: ReadonlyArray<unknown>) {
  return left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}

function isArrayIndex(key: string, length: number) {
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < length && String(index) === key;
}

function compareAscii(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
