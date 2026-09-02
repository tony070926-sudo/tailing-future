import { digestValue } from './digest.ts';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

/**
 * Receipt-bound binary trajectory boundary for the first OpenMM control lane.
 *
 * This module never executes OpenMM, authenticates execution, or reproduces a
 * trajectory.  It records scientific/self-consistency evidence whose external
 * verifier explicitly reports executionAuthenticityVerified=false.  The literal
 * source and status values keep that downgrade visible to every consumer.
 */

export const ATOMISTIC_TRAJECTORY_CHUNK_VERSION_V045 =
  'tf.atomistic-trajectory-chunk/0.4.5' as const;
export const ATOMISTIC_TRAJECTORY_FRAME_VERSION_V045 =
  'tf.atomistic-trajectory-frame/0.4.5' as const;
export const ATOMISTIC_GPU_F32_VISUAL_FRAME_VERSION_V045 =
  'tf.atomistic-gpu-f32-visual-frame/0.4.5' as const;
export const ATOMISTIC_VISUAL_INTERPOLATION_VERSION_V045 =
  'tf.atomistic-visual-interpolation/0.4.5' as const;
export const ATOMISTIC_WORLD_SOURCE_V045 =
  'reference-a-scientific-evidence-execution-unattested' as const;
export const ATOMISTIC_FORCE_SEMANTICS_V045 =
  'potential-force-excluding-constraint-impulses' as const;
export const ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045 =
  'openmm-verlet-raw-velocity-at-t-minus-dt-over-2' as const;
export const ATOMISTIC_VELOCITY_READBACK_SEMANTICS_V045 =
  'prepared-step-0-then-raw-OpenMM-Verlet-half-step-velocities-no-resynchronization' as const;
export const ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045 =
  'openmm-state-potential-and-integrator-adjusted-kinetic-at-position-time' as const;
export const ATOMISTIC_PLAN_DIGEST_V045 =
  'sha256:ad07bc923c991746bcc5c9e048dff9b4065981b50c940b13c3f1654e4ffd1177' as const;
export const ATOMISTIC_SYSTEM_DIGEST_V045 =
  'sha256:e80bb9d1bd4bd8b774008b052b717cb758f16995e5164b36cda7102e2dbf6419' as const;
export const ATOMISTIC_REFERENCE_BACKEND_MANIFEST_DIGEST_V045 =
  'sha256:7f7104ea225819798c9c06eed382298c4d90ec19484f632fc6910832369882b9' as const;
export const ATOMISTIC_PARTICLE_COUNT_V045 = 2685 as const;
export const ATOMISTIC_COMPONENT_COUNT_V045 = 8055 as const;
export const ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045 = 101 as const;
export const ATOMISTIC_TRAJECTORY_SAMPLE_STRIDE_STEPS_V045 = 10 as const;
export const ATOMISTIC_TRAJECTORY_TIME_STEP_PS_V045 = 0.001 as const;
export const ATOMISTIC_TRAJECTORY_INTEGRATED_STEPS_V045 = 1000 as const;
export const ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045 = 64_440 as const;
export const ATOMISTIC_F64_TRAJECTORY_BYTE_LENGTH_V045 = 6_508_440 as const;
export const ATOMISTIC_F32_FRAME_BYTE_LENGTH_V045 = 32_220 as const;
export const ATOMISTIC_TIME_READBACK_ABSOLUTE_TOLERANCE_PS_V045 = 1e-12 as const;

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const SOURCE_REVISION = /^(?!0{40}$)[0-9a-f]{40}$/;
const MAXIMUM_SAFE_BYTE_LENGTH = 1_000_000_000;

export type AtomisticTrajectoryLineageV045 = Readonly<{
  systemDigest: typeof ATOMISTIC_SYSTEM_DIGEST_V045;
  planDigest: typeof ATOMISTIC_PLAN_DIGEST_V045;
  sourceRevision: string;
  backendManifestDigest: typeof ATOMISTIC_REFERENCE_BACKEND_MANIFEST_DIGEST_V045;
  serializedSystemDigest: string;
  prepareReceiptDigest: string;
  prepareReceiptArtifactDigest: string;
  referenceARunReceiptDigest: string;
  referenceARunArtifactDigest: string;
  producerOutcomeDigest: string;
  artifactManifestDigest: string;
  controlReceiptDigest: string;
  verifierDigest: string;
  payloadBundleRoot: string;
  trajectoryDigest: string;
  atomOrderDigest: string;
  cellDigest: string;
  topologyDigest: string;
  integratedSteps: typeof ATOMISTIC_TRAJECTORY_INTEGRATED_STEPS_V045;
  velocityTemporalAlignment: typeof ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045;
  stateEnergyTemporalAlignment: typeof ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045;
  executionAuthenticityVerified: false;
  promotionEligible: false;
}>;

export type AtomisticBinaryChannelV045 =
  | 'positionsNanometer'
  | 'velocitiesNanometerPerPicosecond'
  | 'potentialForcesKjMolNanometer';

export type AtomisticMetadataChannelV045 = 'sampleSteps' | 'sampleTimes' | 'energies';

export type AtomisticTrajectoryArtifactChannelV045 =
  | AtomisticBinaryChannelV045
  | AtomisticMetadataChannelV045;

export type AtomisticManifestArrayDescriptorV045 = Readonly<{
  id: string;
  path: string;
  kind: 'array';
  dtype: 'float64-le' | 'uint32-le';
  shape: ReadonlyArray<number>;
  unit:
    | 'step'
    | 'picosecond'
    | 'nanometer'
    | 'nanometer-per-picosecond'
    | 'kilojoule-per-mole'
    | 'kilojoule-per-mole-per-nanometer';
  sizeBytes: number;
  sha256: string;
}>;

export type AtomisticF64ChunkArtifactV045 = Readonly<{
  channel: AtomisticBinaryChannelV045;
  encoding: 'ieee754-float64-little-endian';
  componentCount: 813_555;
  manifestDescriptor: AtomisticManifestArrayDescriptorV045;
  manifestDescriptorDigest: string;
}>;

export type AtomisticMetadataArtifactV045 = Readonly<{
  channel: AtomisticMetadataChannelV045;
  encoding: 'uint32-little-endian' | 'ieee754-float64-little-endian';
  componentCount: 101 | 303;
  manifestDescriptor: AtomisticManifestArrayDescriptorV045;
  manifestDescriptorDigest: string;
}>;

export type AtomisticF64FrameSourceV045 = Readonly<{
  channel: AtomisticBinaryChannelV045;
  encoding: 'ieee754-float64-little-endian';
  shape: readonly [typeof ATOMISTIC_PARTICLE_COUNT_V045, 3];
  componentCount: typeof ATOMISTIC_COMPONENT_COUNT_V045;
  byteOffset: number;
  byteLength: typeof ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045;
  sourceArtifactId: string;
  sourceArtifactPath: string;
  sourceArtifactByteLength: typeof ATOMISTIC_F64_TRAJECTORY_BYTE_LENGTH_V045;
  sourceArtifactDigest: string;
  frameByteDigest: string;
  sourceManifestDescriptorDigest: string;
  frameSourceDescriptorDigest: string;
}>;

export type AtomisticMetadataFrameSourceV045 = Readonly<{
  channel: AtomisticMetadataChannelV045;
  encoding: 'uint32-little-endian' | 'ieee754-float64-little-endian';
  shape: readonly [1] | readonly [3];
  componentCount: 1 | 3;
  byteOffset: number;
  byteLength: 4 | 8 | 24;
  sourceArtifactId: string;
  sourceArtifactPath: string;
  sourceArtifactByteLength: 404 | 808 | 2424;
  sourceArtifactDigest: string;
  frameByteDigest: string;
  sourceManifestDescriptorDigest: string;
  frameSourceDescriptorDigest: string;
}>;

export type AtomisticUnavailableObservablesV045 = Readonly<{
  electronicDensity: Readonly<{
    status: 'unavailable';
    value: null;
    reason: 'no-electronic-structure-result';
  }>;
  bondOrder: Readonly<{
    status: 'unavailable';
    value: null;
    reason: 'no-bond-order-result';
  }>;
  stress: Readonly<{
    status: 'unavailable';
    value: null;
    reason: 'no-complete-virial-result';
  }>;
  pressure: Readonly<{
    status: 'unavailable';
    value: null;
    reason: 'no-complete-virial-result';
  }>;
}>;

export type AtomisticTrajectoryFrameV045 = Readonly<{
  schemaVersion: typeof ATOMISTIC_TRAJECTORY_FRAME_VERSION_V045;
  status: 'scientific-self-consistency-frame-execution-unattested';
  source: typeof ATOMISTIC_WORLD_SOURCE_V045;
  forceSemantics: typeof ATOMISTIC_FORCE_SEMANTICS_V045;
  velocityTemporalAlignment: typeof ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045;
  velocityReadbackSemantics: typeof ATOMISTIC_VELOCITY_READBACK_SEMANTICS_V045;
  stateEnergyTemporalAlignment: typeof ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045;
  executionAuthenticityVerified: false;
  promotionEligible: false;
  lineage: AtomisticTrajectoryLineageV045;
  frameOrdinal: number;
  step: number;
  timePicoseconds: number;
  arrays: Readonly<{
    positionsNanometer: AtomisticF64FrameSourceV045;
    velocitiesNanometerPerPicosecond: AtomisticF64FrameSourceV045;
    potentialForcesKjMolNanometer: AtomisticF64FrameSourceV045;
  }>;
  metadataSources: Readonly<{
    sampleSteps: AtomisticMetadataFrameSourceV045;
    sampleTimes: AtomisticMetadataFrameSourceV045;
    energies: AtomisticMetadataFrameSourceV045;
  }>;
  energy: Readonly<{
    potentialKjMol: number;
    kineticKjMol: number;
    totalKjMol: number;
  }>;
  unavailableObservables: AtomisticUnavailableObservablesV045;
  frameDigest: string;
}>;

export type AtomisticTrajectoryChunkV045 = Readonly<{
  schemaVersion: typeof ATOMISTIC_TRAJECTORY_CHUNK_VERSION_V045;
  status: 'scientific-self-consistency-monolithic-trajectory-execution-unattested';
  verificationBoundary: 'independent-scientific-verification-without-execution-attestation';
  chunkId: string;
  source: typeof ATOMISTIC_WORLD_SOURCE_V045;
  forceSemantics: typeof ATOMISTIC_FORCE_SEMANTICS_V045;
  lineage: AtomisticTrajectoryLineageV045;
  firstFrameOrdinal: 0;
  frameCount: typeof ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045;
  sampleStrideSteps: typeof ATOMISTIC_TRAJECTORY_SAMPLE_STRIDE_STEPS_V045;
  fixedTimeStepPicoseconds: typeof ATOMISTIC_TRAJECTORY_TIME_STEP_PS_V045;
  integratedSteps: typeof ATOMISTIC_TRAJECTORY_INTEGRATED_STEPS_V045;
  velocityTemporalAlignment: typeof ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045;
  velocityReadbackSemantics: typeof ATOMISTIC_VELOCITY_READBACK_SEMANTICS_V045;
  stateEnergyTemporalAlignment: typeof ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045;
  executionAuthenticityVerified: false;
  promotionEligible: false;
  artifacts: Readonly<{
    positionsNanometer: AtomisticF64ChunkArtifactV045;
    velocitiesNanometerPerPicosecond: AtomisticF64ChunkArtifactV045;
    potentialForcesKjMolNanometer: AtomisticF64ChunkArtifactV045;
    sampleSteps: AtomisticMetadataArtifactV045;
    sampleTimes: AtomisticMetadataArtifactV045;
    energies: AtomisticMetadataArtifactV045;
  }>;
  frames: ReadonlyArray<AtomisticTrajectoryFrameV045>;
  chunkDigest: string;
}>;

export type AtomisticTrajectoryChunkInputV045 = Readonly<{
  chunkId: string;
  lineage: AtomisticTrajectoryLineageV045;
  firstFrameOrdinal: number;
  sampleStrideSteps: number;
  fixedTimeStepPicoseconds: number;
  artifactManifestDescriptors: Readonly<
    Record<AtomisticTrajectoryArtifactChannelV045, AtomisticManifestArrayDescriptorV045>
  >;
  frames: ReadonlyArray<Readonly<{
    step: number;
    timePicoseconds: number;
    frameByteDigests: Readonly<Record<AtomisticBinaryChannelV045, string>>;
    energy: AtomisticTrajectoryFrameV045['energy'];
  }>>;
}>;

export type AtomisticGpuF32ChannelReceiptV045 = Readonly<{
  channel: AtomisticBinaryChannelV045;
  sourceEncoding: 'ieee754-float64-little-endian';
  sourceShape: readonly [typeof ATOMISTIC_PARTICLE_COUNT_V045, 3];
  sourceByteLength: typeof ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045;
  sourceByteDigest: string;
  derivedEncoding: 'ieee754-float32-little-endian';
  derivedShape: readonly [typeof ATOMISTIC_PARTICLE_COUNT_V045, 3];
  derivedByteLength: typeof ATOMISTIC_F32_FRAME_BYTE_LENGTH_V045;
  derivedByteDigest: string;
  decodeSemantics: 'visual-only-f64le-to-f32le-round-to-nearest-ties-to-even';
}>;

export type AtomisticGpuF32VisualFrameV045 = Readonly<{
  schemaVersion: typeof ATOMISTIC_GPU_F32_VISUAL_FRAME_VERSION_V045;
  status: 'visual-derived-gpu-decode-receipt';
  source: typeof ATOMISTIC_WORLD_SOURCE_V045;
  sourceFrameDigest: string;
  sourceStep: number;
  sourceTimePicoseconds: number;
  forceSemantics: typeof ATOMISTIC_FORCE_SEMANTICS_V045;
  channels: Readonly<Record<AtomisticBinaryChannelV045, AtomisticGpuF32ChannelReceiptV045>>;
  physicalWorldState: false;
  presentationOnly: true;
  gpuFrameDigest: string;
}>;

export type AtomisticVisualInterpolationV045 = Readonly<{
  schemaVersion: typeof ATOMISTIC_VISUAL_INTERPOLATION_VERSION_V045;
  status: 'presentation-only-between-scientific-evidence-frames';
  source: typeof ATOMISTIC_WORLD_SOURCE_V045;
  frameA: Readonly<{
    frameDigest: string;
    frameOrdinal: number;
    step: number;
    timePicoseconds: number;
  }>;
  frameB: Readonly<{
    frameDigest: string;
    frameOrdinal: number;
    step: number;
    timePicoseconds: number;
  }>;
  alpha: number;
  presentationTimePicoseconds: number;
  interpolationSemantics: 'visual-position-only-no-force-or-observable-interpolation';
  forceDisplay: 'disabled-between-scientific-evidence-frames';
  physicalWorldState: false;
  presentationOnly: true;
  interpolationDigest: string;
}>;

const CHANNELS = Object.freeze([
  'positionsNanometer',
  'velocitiesNanometerPerPicosecond',
  'potentialForcesKjMolNanometer',
] as const satisfies ReadonlyArray<AtomisticBinaryChannelV045>);

const METADATA_CHANNELS = Object.freeze([
  'sampleSteps',
  'sampleTimes',
  'energies',
] as const satisfies ReadonlyArray<AtomisticMetadataChannelV045>);

const ARTIFACT_CHANNELS = Object.freeze([
  ...CHANNELS,
  ...METADATA_CHANNELS,
] as const satisfies ReadonlyArray<AtomisticTrajectoryArtifactChannelV045>);

const ARTIFACT_SPECS = Object.freeze({
  positionsNanometer: Object.freeze({
    id: 'reference-a-positions',
    path: 'arrays/reference-a-positions.f64le',
    dtype: 'float64-le',
    shape: [ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045, ATOMISTIC_PARTICLE_COUNT_V045, 3],
    unit: 'nanometer',
    sizeBytes: ATOMISTIC_F64_TRAJECTORY_BYTE_LENGTH_V045,
    encoding: 'ieee754-float64-little-endian',
    componentCount: 813_555,
  }),
  velocitiesNanometerPerPicosecond: Object.freeze({
    id: 'reference-a-velocities',
    path: 'arrays/reference-a-velocities.f64le',
    dtype: 'float64-le',
    shape: [ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045, ATOMISTIC_PARTICLE_COUNT_V045, 3],
    unit: 'nanometer-per-picosecond',
    sizeBytes: ATOMISTIC_F64_TRAJECTORY_BYTE_LENGTH_V045,
    encoding: 'ieee754-float64-little-endian',
    componentCount: 813_555,
  }),
  potentialForcesKjMolNanometer: Object.freeze({
    id: 'reference-a-potential-forces',
    path: 'arrays/reference-a-potential-forces.f64le',
    dtype: 'float64-le',
    shape: [ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045, ATOMISTIC_PARTICLE_COUNT_V045, 3],
    unit: 'kilojoule-per-mole-per-nanometer',
    sizeBytes: ATOMISTIC_F64_TRAJECTORY_BYTE_LENGTH_V045,
    encoding: 'ieee754-float64-little-endian',
    componentCount: 813_555,
  }),
  sampleSteps: Object.freeze({
    id: 'reference-a-sample-steps',
    path: 'arrays/reference-a-sample-steps.u32le',
    dtype: 'uint32-le',
    shape: [ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045],
    unit: 'step',
    sizeBytes: 404,
    encoding: 'uint32-little-endian',
    componentCount: 101,
  }),
  sampleTimes: Object.freeze({
    id: 'reference-a-sample-times',
    path: 'arrays/reference-a-sample-times.f64le',
    dtype: 'float64-le',
    shape: [ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045],
    unit: 'picosecond',
    sizeBytes: 808,
    encoding: 'ieee754-float64-little-endian',
    componentCount: 101,
  }),
  energies: Object.freeze({
    id: 'reference-a-energies',
    path: 'arrays/reference-a-energies.f64le',
    dtype: 'float64-le',
    shape: [ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045, 3],
    unit: 'kilojoule-per-mole',
    sizeBytes: 2424,
    encoding: 'ieee754-float64-little-endian',
    componentCount: 303,
  }),
} as const);

export function createAtomisticTrajectoryChunkV045(
  input: AtomisticTrajectoryChunkInputV045,
): AtomisticTrajectoryChunkV045 {
  const clone = safePlainClone(input, 'atomistic trajectory chunk input');
  assertExactKeys(clone, [
    'chunkId', 'lineage', 'firstFrameOrdinal', 'sampleStrideSteps',
    'fixedTimeStepPicoseconds', 'artifactManifestDescriptors', 'frames',
  ], 'atomistic trajectory chunk input');
  if (clone.chunkId !== 'reference-a-monolithic-trajectory') {
    throw new Error('atomistic trajectory must use the single locked monolithic chunkId');
  }
  assertLineage(clone.lineage, 'atomistic trajectory chunk lineage');
  if (clone.firstFrameOrdinal !== 0
    || clone.sampleStrideSteps !== ATOMISTIC_TRAJECTORY_SAMPLE_STRIDE_STEPS_V045
    || clone.fixedTimeStepPicoseconds !== ATOMISTIC_TRAJECTORY_TIME_STEP_PS_V045) {
    throw new Error('atomistic trajectory monolith cadence or first ordinal changed');
  }
  if (!Array.isArray(clone.frames)
    || clone.frames.length !== ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045) {
    throw new Error('atomistic trajectory must contain exactly 101 frames in one monolith');
  }
  assertExactKeys(
    clone.artifactManifestDescriptors,
    ARTIFACT_CHANNELS,
    'atomistic trajectory manifest descriptors',
  );
  const artifacts = Object.fromEntries(ARTIFACT_CHANNELS.map((channel) => [
    channel,
    buildManifestBoundArtifact(channel, clone.artifactManifestDescriptors[channel]),
  ])) as unknown as AtomisticTrajectoryChunkV045['artifacts'];

  const frames = clone.frames.map((frameInput, localIndex) => {
    assertExactKeys(
      frameInput,
      ['step', 'timePicoseconds', 'frameByteDigests', 'energy'],
      `atomistic frame input ${localIndex}`,
    );
    assertExactKeys(
      frameInput.frameByteDigests,
      CHANNELS,
      `atomistic frame ${localIndex} byte digests`,
    );
    const frameOrdinal = localIndex;
    const expectedStep = checkedProduct(
      frameOrdinal,
      ATOMISTIC_TRAJECTORY_SAMPLE_STRIDE_STEPS_V045,
      'atomistic frame step',
    );
    assertSafeInteger(frameInput.step, 0, 1_000_000_000, `atomistic frame ${localIndex} step`);
    if (frameInput.step !== expectedStep) {
      throw new Error(`atomistic frame ${localIndex} step cadence changed`);
    }
    assertTimeReadback(
      frameInput.timePicoseconds,
      frameInput.step,
      ATOMISTIC_TRAJECTORY_TIME_STEP_PS_V045,
      `atomistic frame ${localIndex} time`,
    );
    const byteOffset = checkedProduct(
      frameOrdinal,
      ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045,
      'atomistic global frame byte offset',
    );
    const arrays = Object.fromEntries(CHANNELS.map((channel) => {
      const frameByteDigest = frameInput.frameByteDigests[channel];
      assertDigest(frameByteDigest, `atomistic frame ${localIndex} ${channel} byte digest`);
      const artifact = artifacts[channel];
      const manifestDescriptor = artifact.manifestDescriptor;
      const descriptorPayload = {
        channel,
        encoding: 'ieee754-float64-little-endian' as const,
        shape: [ATOMISTIC_PARTICLE_COUNT_V045, 3] as const,
        componentCount: ATOMISTIC_COMPONENT_COUNT_V045,
        byteOffset,
        byteLength: ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045,
        sourceArtifactId: manifestDescriptor.id,
        sourceArtifactPath: manifestDescriptor.path,
        sourceArtifactByteLength: ATOMISTIC_F64_TRAJECTORY_BYTE_LENGTH_V045,
        sourceArtifactDigest: manifestDescriptor.sha256,
        frameByteDigest,
        sourceManifestDescriptorDigest: artifact.manifestDescriptorDigest,
      };
      return [channel, {
        ...descriptorPayload,
        frameSourceDescriptorDigest: digestValue(descriptorPayload),
      }];
    })) as AtomisticTrajectoryFrameV045['arrays'];
    const energy = safePlainClone(frameInput.energy, `atomistic frame ${localIndex} energy`);
    assertEnergy(energy);
    const metadataSources = {
      sampleSteps: buildMetadataFrameSource(
        'sampleSteps',
        frameOrdinal,
        artifacts.sampleSteps,
        [frameInput.step],
      ),
      sampleTimes: buildMetadataFrameSource(
        'sampleTimes',
        frameOrdinal,
        artifacts.sampleTimes,
        [frameInput.timePicoseconds],
      ),
      energies: buildMetadataFrameSource(
        'energies',
        frameOrdinal,
        artifacts.energies,
        [energy.potentialKjMol, energy.kineticKjMol, energy.totalKjMol],
      ),
    } as const;
    const framePayload = {
      schemaVersion: ATOMISTIC_TRAJECTORY_FRAME_VERSION_V045,
      status: 'scientific-self-consistency-frame-execution-unattested' as const,
      source: ATOMISTIC_WORLD_SOURCE_V045,
      forceSemantics: ATOMISTIC_FORCE_SEMANTICS_V045,
      velocityTemporalAlignment: ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045,
      velocityReadbackSemantics: ATOMISTIC_VELOCITY_READBACK_SEMANTICS_V045,
      stateEnergyTemporalAlignment: ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045,
      executionAuthenticityVerified: false as const,
      promotionEligible: false as const,
      lineage: { ...clone.lineage },
      frameOrdinal,
      step: frameInput.step,
      timePicoseconds: frameInput.timePicoseconds,
      arrays,
      metadataSources,
      energy,
      unavailableObservables: unavailableObservables(),
    };
    return assertAtomisticTrajectoryFrameV045({
      ...framePayload,
      frameDigest: digestValue(framePayload),
    });
  });
  const payload = {
    schemaVersion: ATOMISTIC_TRAJECTORY_CHUNK_VERSION_V045,
    status: 'scientific-self-consistency-monolithic-trajectory-execution-unattested' as const,
    verificationBoundary: 'independent-scientific-verification-without-execution-attestation' as const,
    chunkId: clone.chunkId,
    source: ATOMISTIC_WORLD_SOURCE_V045,
    forceSemantics: ATOMISTIC_FORCE_SEMANTICS_V045,
    lineage: { ...clone.lineage },
    firstFrameOrdinal: 0 as const,
    frameCount: ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045,
    sampleStrideSteps: ATOMISTIC_TRAJECTORY_SAMPLE_STRIDE_STEPS_V045,
    fixedTimeStepPicoseconds: ATOMISTIC_TRAJECTORY_TIME_STEP_PS_V045,
    integratedSteps: ATOMISTIC_TRAJECTORY_INTEGRATED_STEPS_V045,
    velocityTemporalAlignment: ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045,
    velocityReadbackSemantics: ATOMISTIC_VELOCITY_READBACK_SEMANTICS_V045,
    stateEnergyTemporalAlignment: ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045,
    executionAuthenticityVerified: false as const,
    promotionEligible: false as const,
    artifacts,
    frames,
  };
  return assertAtomisticTrajectoryChunkV045({
    ...payload,
    chunkDigest: digestValue(payload),
  });
}

export function assertAtomisticTrajectoryFrameV045(
  candidate: unknown,
): AtomisticTrajectoryFrameV045 {
  const clone = safePlainClone(candidate, 'atomistic trajectory frame') as AtomisticTrajectoryFrameV045;
  assertExactKeys(clone, [
    'schemaVersion', 'status', 'source', 'forceSemantics', 'velocityTemporalAlignment',
    'velocityReadbackSemantics', 'stateEnergyTemporalAlignment',
    'executionAuthenticityVerified', 'promotionEligible', 'lineage', 'frameOrdinal',
    'step', 'timePicoseconds', 'arrays', 'metadataSources', 'energy',
    'unavailableObservables', 'frameDigest',
  ], 'atomistic trajectory frame');
  if (clone.schemaVersion !== ATOMISTIC_TRAJECTORY_FRAME_VERSION_V045
    || clone.status !== 'scientific-self-consistency-frame-execution-unattested'
    || clone.source !== ATOMISTIC_WORLD_SOURCE_V045
    || clone.forceSemantics !== ATOMISTIC_FORCE_SEMANTICS_V045
    || clone.velocityTemporalAlignment !== ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045
    || clone.velocityReadbackSemantics !== ATOMISTIC_VELOCITY_READBACK_SEMANTICS_V045
    || clone.stateEnergyTemporalAlignment !== ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045
    || clone.executionAuthenticityVerified !== false
    || clone.promotionEligible !== false) {
    throw new Error('atomistic trajectory frame scientific or execution-unattested boundary changed');
  }
  assertLineage(clone.lineage, 'atomistic trajectory frame lineage');
  assertSafeInteger(clone.frameOrdinal, 0, 1_000_000, 'atomistic frame ordinal');
  assertSafeInteger(clone.step, 0, 1_000_000_000, 'atomistic frame step');
  assertNonnegativeFinite(clone.timePicoseconds, 'atomistic frame time');
  assertExactKeys(clone.arrays, CHANNELS, 'atomistic frame arrays');
  for (const channel of CHANNELS) {
    assertF64FrameSource(clone.arrays[channel], channel);
    const expectedOffset = checkedProduct(
      clone.frameOrdinal,
      ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045,
      `atomistic ${channel} global frame byte offset`,
    );
    if (clone.arrays[channel].byteOffset !== expectedOffset) {
      throw new Error(`atomistic ${channel} frame source does not use a global monolithic offset`);
    }
  }
  assertEnergy(clone.energy);
  assertExactKeys(clone.metadataSources, METADATA_CHANNELS, 'atomistic frame metadata sources');
  assertMetadataFrameSource(
    clone.metadataSources.sampleSteps,
    'sampleSteps',
    clone.frameOrdinal,
    [clone.step],
  );
  assertMetadataFrameSource(
    clone.metadataSources.sampleTimes,
    'sampleTimes',
    clone.frameOrdinal,
    [clone.timePicoseconds],
  );
  assertMetadataFrameSource(
    clone.metadataSources.energies,
    'energies',
    clone.frameOrdinal,
    [clone.energy.potentialKjMol, clone.energy.kineticKjMol, clone.energy.totalKjMol],
  );
  assertUnavailableObservables(clone.unavailableObservables);
  assertDigest(clone.frameDigest, 'atomistic frame digest');
  const { frameDigest, ...payload } = clone;
  if (frameDigest !== digestValue(payload)) throw new Error('atomistic frame digest is stale');
  return deepFreeze(clone);
}

export function assertAtomisticTrajectoryChunkV045(
  candidate: unknown,
): AtomisticTrajectoryChunkV045 {
  const clone = safePlainClone(candidate, 'atomistic trajectory chunk') as AtomisticTrajectoryChunkV045;
  assertExactKeys(clone, [
    'schemaVersion', 'status', 'verificationBoundary', 'chunkId', 'source',
    'forceSemantics', 'lineage', 'firstFrameOrdinal', 'frameCount',
    'sampleStrideSteps', 'fixedTimeStepPicoseconds', 'integratedSteps',
    'velocityTemporalAlignment', 'velocityReadbackSemantics',
    'stateEnergyTemporalAlignment', 'executionAuthenticityVerified',
    'promotionEligible', 'artifacts', 'frames', 'chunkDigest',
  ], 'atomistic trajectory chunk');
  if (clone.schemaVersion !== ATOMISTIC_TRAJECTORY_CHUNK_VERSION_V045
    || clone.status !== 'scientific-self-consistency-monolithic-trajectory-execution-unattested'
    || clone.verificationBoundary
      !== 'independent-scientific-verification-without-execution-attestation'
    || clone.source !== ATOMISTIC_WORLD_SOURCE_V045
    || clone.forceSemantics !== ATOMISTIC_FORCE_SEMANTICS_V045
    || clone.firstFrameOrdinal !== 0
    || clone.frameCount !== ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045
    || clone.sampleStrideSteps !== ATOMISTIC_TRAJECTORY_SAMPLE_STRIDE_STEPS_V045
    || clone.fixedTimeStepPicoseconds !== ATOMISTIC_TRAJECTORY_TIME_STEP_PS_V045
    || clone.integratedSteps !== ATOMISTIC_TRAJECTORY_INTEGRATED_STEPS_V045
    || clone.velocityTemporalAlignment !== ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045
    || clone.velocityReadbackSemantics !== ATOMISTIC_VELOCITY_READBACK_SEMANTICS_V045
    || clone.stateEnergyTemporalAlignment !== ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045
    || clone.executionAuthenticityVerified !== false
    || clone.promotionEligible !== false) {
    throw new Error('atomistic trajectory monolith scientific or execution-unattested boundary changed');
  }
  if (clone.chunkId !== 'reference-a-monolithic-trajectory') {
    throw new Error('atomistic trajectory must use the single locked monolithic chunkId');
  }
  assertLineage(clone.lineage, 'atomistic trajectory chunk lineage');
  if (!Array.isArray(clone.frames) || clone.frames.length !== clone.frameCount) {
    throw new Error('atomistic chunk frame count does not match its frames');
  }
  assertExactKeys(clone.artifacts, ARTIFACT_CHANNELS, 'atomistic chunk artifacts');
  for (const channel of ARTIFACT_CHANNELS) assertManifestBoundArtifact(clone.artifacts[channel], channel);
  for (let localIndex = 0; localIndex < clone.frames.length; localIndex += 1) {
    const frame = assertAtomisticTrajectoryFrameV045(clone.frames[localIndex]);
    assertExactDeepValue(frame.lineage, clone.lineage, `atomistic frame ${localIndex} lineage`);
    const expectedOrdinal = clone.firstFrameOrdinal + localIndex;
    const expectedStep = checkedProduct(
      expectedOrdinal,
      ATOMISTIC_TRAJECTORY_SAMPLE_STRIDE_STEPS_V045,
      `atomistic frame ${localIndex} step`,
    );
    if (frame.frameOrdinal !== expectedOrdinal || frame.step !== expectedStep
    ) {
      throw new Error(`atomistic frame ${localIndex} step lineage changed`);
    }
    assertTimeReadback(
      frame.timePicoseconds,
      frame.step,
      ATOMISTIC_TRAJECTORY_TIME_STEP_PS_V045,
      `atomistic frame ${localIndex} time lineage`,
    );
    for (const channel of CHANNELS) {
      const artifact = clone.artifacts[channel];
      const source = frame.arrays[channel];
      const expectedOffset = checkedProduct(
        expectedOrdinal,
        ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045,
        `atomistic frame ${localIndex} global byte offset`,
      );
      if (source.sourceArtifactId !== artifact.manifestDescriptor.id
        || source.sourceArtifactPath !== artifact.manifestDescriptor.path
        || source.sourceArtifactDigest !== artifact.manifestDescriptor.sha256
        || source.sourceArtifactByteLength !== artifact.manifestDescriptor.sizeBytes
        || source.sourceManifestDescriptorDigest !== artifact.manifestDescriptorDigest
        || source.byteOffset !== expectedOffset) {
        throw new Error(`atomistic frame ${localIndex} ${channel} artifact lineage changed`);
      }
    }
    for (const channel of METADATA_CHANNELS) {
      const artifact = clone.artifacts[channel];
      const source = frame.metadataSources[channel];
      if (source.sourceArtifactId !== artifact.manifestDescriptor.id
        || source.sourceArtifactPath !== artifact.manifestDescriptor.path
        || source.sourceArtifactDigest !== artifact.manifestDescriptor.sha256
        || source.sourceArtifactByteLength !== artifact.manifestDescriptor.sizeBytes
        || source.sourceManifestDescriptorDigest !== artifact.manifestDescriptorDigest) {
        throw new Error(`atomistic frame ${localIndex} ${channel} artifact lineage changed`);
      }
    }
  }
  assertDigest(clone.chunkDigest, 'atomistic chunk digest');
  const { chunkDigest, ...payload } = clone;
  if (chunkDigest !== digestValue(payload)) throw new Error('atomistic chunk digest is stale');
  return deepFreeze(clone);
}

/**
 * Records an already-performed F64-to-F32 GPU decode.  It is intentionally a
 * presentation receipt: it cannot be passed to the physical-frame validator.
 */
export function createAtomisticGpuF32VisualFrameV045(
  sourceFrame: AtomisticTrajectoryFrameV045,
  derivedByteDigests: Readonly<Record<AtomisticBinaryChannelV045, string>>,
): AtomisticGpuF32VisualFrameV045 {
  const frame = assertAtomisticTrajectoryFrameV045(sourceFrame);
  const digests = safePlainClone(derivedByteDigests, 'atomistic GPU derived byte digests');
  assertExactKeys(digests, CHANNELS, 'atomistic GPU derived byte digests');
  const channels = Object.fromEntries(CHANNELS.map((channel) => {
    assertDigest(digests[channel], `atomistic GPU ${channel} derived byte digest`);
    const source = frame.arrays[channel];
    return [channel, {
      channel,
      sourceEncoding: source.encoding,
      sourceShape: [...source.shape] as [typeof ATOMISTIC_PARTICLE_COUNT_V045, 3],
      sourceByteLength: source.byteLength,
      sourceByteDigest: source.frameByteDigest,
      derivedEncoding: 'ieee754-float32-little-endian' as const,
      derivedShape: [...source.shape] as [typeof ATOMISTIC_PARTICLE_COUNT_V045, 3],
      derivedByteLength: ATOMISTIC_F32_FRAME_BYTE_LENGTH_V045,
      derivedByteDigest: digests[channel],
      decodeSemantics: 'visual-only-f64le-to-f32le-round-to-nearest-ties-to-even' as const,
    }];
  })) as unknown as AtomisticGpuF32VisualFrameV045['channels'];
  const payload = {
    schemaVersion: ATOMISTIC_GPU_F32_VISUAL_FRAME_VERSION_V045,
    status: 'visual-derived-gpu-decode-receipt' as const,
    source: ATOMISTIC_WORLD_SOURCE_V045,
    sourceFrameDigest: frame.frameDigest,
    sourceStep: frame.step,
    sourceTimePicoseconds: frame.timePicoseconds,
    forceSemantics: ATOMISTIC_FORCE_SEMANTICS_V045,
    channels,
    physicalWorldState: false as const,
    presentationOnly: true as const,
  };
  return assertAtomisticGpuF32VisualFrameV045({
    ...payload,
    gpuFrameDigest: digestValue(payload),
  }, frame);
}

export function assertAtomisticGpuF32VisualFrameV045(
  candidate: unknown,
  sourceFrame?: AtomisticTrajectoryFrameV045,
): AtomisticGpuF32VisualFrameV045 {
  const clone = safePlainClone(candidate, 'atomistic GPU visual frame') as AtomisticGpuF32VisualFrameV045;
  assertExactKeys(clone, [
    'schemaVersion', 'status', 'source', 'sourceFrameDigest', 'sourceStep',
    'sourceTimePicoseconds', 'forceSemantics', 'channels', 'physicalWorldState',
    'presentationOnly', 'gpuFrameDigest',
  ], 'atomistic GPU visual frame');
  if (clone.schemaVersion !== ATOMISTIC_GPU_F32_VISUAL_FRAME_VERSION_V045
    || clone.status !== 'visual-derived-gpu-decode-receipt'
    || clone.source !== ATOMISTIC_WORLD_SOURCE_V045
    || clone.forceSemantics !== ATOMISTIC_FORCE_SEMANTICS_V045
    || clone.physicalWorldState !== false
    || clone.presentationOnly !== true) {
    throw new Error('atomistic GPU frame must remain a visual-only derivative');
  }
  assertDigest(clone.sourceFrameDigest, 'atomistic GPU source frame digest');
  assertSafeInteger(clone.sourceStep, 0, 1_000_000_000, 'atomistic GPU source step');
  assertNonnegativeFinite(clone.sourceTimePicoseconds, 'atomistic GPU source time');
  assertExactKeys(clone.channels, CHANNELS, 'atomistic GPU channels');
  for (const channel of CHANNELS) assertGpuChannel(clone.channels[channel], channel);
  if (sourceFrame) {
    const frame = assertAtomisticTrajectoryFrameV045(sourceFrame);
    if (clone.sourceFrameDigest !== frame.frameDigest
      || clone.sourceStep !== frame.step
      || !Object.is(clone.sourceTimePicoseconds, frame.timePicoseconds)) {
      throw new Error('atomistic GPU frame source-frame lineage changed');
    }
    for (const channel of CHANNELS) {
      const source = frame.arrays[channel];
      const receipt = clone.channels[channel];
      if (receipt.sourceByteDigest !== source.frameByteDigest
        || receipt.sourceByteLength !== source.byteLength
        || !exactArray(receipt.sourceShape, source.shape)) {
        throw new Error(`atomistic GPU ${channel} source-byte lineage changed`);
      }
    }
  }
  assertDigest(clone.gpuFrameDigest, 'atomistic GPU frame digest');
  const { gpuFrameDigest, ...payload } = clone;
  if (gpuFrameDigest !== digestValue(payload)) throw new Error('atomistic GPU frame digest is stale');
  return deepFreeze(clone);
}

export function createAtomisticVisualInterpolationV045(
  frameAInput: AtomisticTrajectoryFrameV045,
  frameBInput: AtomisticTrajectoryFrameV045,
  alpha: number,
): AtomisticVisualInterpolationV045 {
  const frameA = assertAtomisticTrajectoryFrameV045(frameAInput);
  const frameB = assertAtomisticTrajectoryFrameV045(frameBInput);
  assertInterpolationFrames(frameA, frameB);
  assertUnitInterval(alpha, 'atomistic visual interpolation alpha');
  const presentationTimePicoseconds = canonicalFiniteSum(
    frameA.timePicoseconds,
    (frameB.timePicoseconds - frameA.timePicoseconds) * alpha,
    'atomistic interpolation presentation time',
  );
  const payload = {
    schemaVersion: ATOMISTIC_VISUAL_INTERPOLATION_VERSION_V045,
    status: 'presentation-only-between-scientific-evidence-frames' as const,
    source: ATOMISTIC_WORLD_SOURCE_V045,
    frameA: frameReference(frameA),
    frameB: frameReference(frameB),
    alpha,
    presentationTimePicoseconds,
    interpolationSemantics: 'visual-position-only-no-force-or-observable-interpolation' as const,
    forceDisplay: 'disabled-between-scientific-evidence-frames' as const,
    physicalWorldState: false as const,
    presentationOnly: true as const,
  };
  return assertAtomisticVisualInterpolationV045({
    ...payload,
    interpolationDigest: digestValue(payload),
  }, frameA, frameB);
}

export function assertAtomisticVisualInterpolationV045(
  candidate: unknown,
  frameAInput?: AtomisticTrajectoryFrameV045,
  frameBInput?: AtomisticTrajectoryFrameV045,
): AtomisticVisualInterpolationV045 {
  const clone = safePlainClone(
    candidate,
    'atomistic visual interpolation',
  ) as AtomisticVisualInterpolationV045;
  assertExactKeys(clone, [
    'schemaVersion', 'status', 'source', 'frameA', 'frameB', 'alpha',
    'presentationTimePicoseconds', 'interpolationSemantics', 'forceDisplay',
    'physicalWorldState', 'presentationOnly', 'interpolationDigest',
  ], 'atomistic visual interpolation');
  if (clone.schemaVersion !== ATOMISTIC_VISUAL_INTERPOLATION_VERSION_V045
    || clone.status !== 'presentation-only-between-scientific-evidence-frames'
    || clone.source !== ATOMISTIC_WORLD_SOURCE_V045
    || clone.interpolationSemantics !== 'visual-position-only-no-force-or-observable-interpolation'
    || clone.forceDisplay !== 'disabled-between-scientific-evidence-frames'
    || clone.physicalWorldState !== false
    || clone.presentationOnly !== true) {
    throw new Error('atomistic interpolation must remain presentation-only');
  }
  assertFrameReference(clone.frameA, 'atomistic interpolation frame A');
  assertFrameReference(clone.frameB, 'atomistic interpolation frame B');
  if (clone.frameB.frameOrdinal !== clone.frameA.frameOrdinal + 1
    || clone.frameB.step <= clone.frameA.step
    || clone.frameB.timePicoseconds <= clone.frameA.timePicoseconds) {
    throw new Error('atomistic interpolation requires consecutive increasing frames');
  }
  assertUnitInterval(clone.alpha, 'atomistic visual interpolation alpha');
  const expectedTime = canonicalFiniteSum(
    clone.frameA.timePicoseconds,
    (clone.frameB.timePicoseconds - clone.frameA.timePicoseconds) * clone.alpha,
    'atomistic interpolation presentation time',
  );
  if (!Object.is(clone.presentationTimePicoseconds, expectedTime)) {
    throw new Error('atomistic interpolation presentation time is stale');
  }
  if (frameAInput || frameBInput) {
    if (!frameAInput || !frameBInput) {
      throw new Error('atomistic interpolation validation needs both authoritative frames');
    }
    const frameA = assertAtomisticTrajectoryFrameV045(frameAInput);
    const frameB = assertAtomisticTrajectoryFrameV045(frameBInput);
    assertInterpolationFrames(frameA, frameB);
    assertExactDeepValue(clone.frameA, frameReference(frameA), 'atomistic interpolation frame A');
    assertExactDeepValue(clone.frameB, frameReference(frameB), 'atomistic interpolation frame B');
  }
  assertDigest(clone.interpolationDigest, 'atomistic interpolation digest');
  const { interpolationDigest, ...payload } = clone;
  if (interpolationDigest !== digestValue(payload)) {
    throw new Error('atomistic interpolation digest is stale');
  }
  return deepFreeze(clone);
}

function unavailableObservables(): AtomisticUnavailableObservablesV045 {
  return {
    electronicDensity: {
      status: 'unavailable',
      value: null,
      reason: 'no-electronic-structure-result',
    },
    bondOrder: {
      status: 'unavailable',
      value: null,
      reason: 'no-bond-order-result',
    },
    stress: {
      status: 'unavailable',
      value: null,
      reason: 'no-complete-virial-result',
    },
    pressure: {
      status: 'unavailable',
      value: null,
      reason: 'no-complete-virial-result',
    },
  };
}

function assertUnavailableObservables(value: AtomisticUnavailableObservablesV045) {
  assertExactDeepValue(value, unavailableObservables(), 'atomistic unavailable observables');
}

function assertEnergy(value: AtomisticTrajectoryFrameV045['energy']) {
  assertExactKeys(value, ['potentialKjMol', 'kineticKjMol', 'totalKjMol'], 'atomistic frame energy');
  assertFinite(value.potentialKjMol, 'atomistic potential energy');
  assertFinite(value.kineticKjMol, 'atomistic kinetic energy');
  assertFinite(value.totalKjMol, 'atomistic total energy');
  const expectedTotal = value.potentialKjMol + value.kineticKjMol;
  const tolerance = 8 * Number.EPSILON * Math.max(
    Math.abs(value.potentialKjMol),
    Math.abs(value.kineticKjMol),
    Math.abs(value.totalKjMol),
    1,
  );
  if (!Number.isFinite(expectedTotal) || Math.abs(value.totalKjMol - expectedTotal) > tolerance) {
    throw new Error('atomistic frame total energy does not close to potential plus kinetic');
  }
}

function assertLineage(value: AtomisticTrajectoryLineageV045, label: string) {
  assertExactKeys(value, [
    'systemDigest', 'planDigest', 'sourceRevision', 'backendManifestDigest',
    'serializedSystemDigest', 'prepareReceiptDigest', 'prepareReceiptArtifactDigest',
    'referenceARunReceiptDigest', 'referenceARunArtifactDigest',
    'producerOutcomeDigest', 'artifactManifestDigest', 'controlReceiptDigest',
    'verifierDigest', 'payloadBundleRoot', 'trajectoryDigest', 'atomOrderDigest',
    'cellDigest', 'topologyDigest', 'integratedSteps', 'velocityTemporalAlignment',
    'stateEnergyTemporalAlignment', 'executionAuthenticityVerified', 'promotionEligible',
  ], label);
  if (value.systemDigest !== ATOMISTIC_SYSTEM_DIGEST_V045
    || value.planDigest !== ATOMISTIC_PLAN_DIGEST_V045
    || value.backendManifestDigest !== ATOMISTIC_REFERENCE_BACKEND_MANIFEST_DIGEST_V045
    || value.integratedSteps !== ATOMISTIC_TRAJECTORY_INTEGRATED_STEPS_V045
    || value.velocityTemporalAlignment !== ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045
    || value.stateEnergyTemporalAlignment !== ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045
    || value.executionAuthenticityVerified !== false
    || value.promotionEligible !== false) {
    throw new Error(`${label} locked scientific or execution-unattested identity changed`);
  }
  if (typeof value.sourceRevision !== 'string' || !SOURCE_REVISION.test(value.sourceRevision)) {
    throw new Error(`${label} source revision is invalid`);
  }
  for (const key of [
    'serializedSystemDigest', 'prepareReceiptDigest', 'prepareReceiptArtifactDigest',
    'referenceARunReceiptDigest', 'referenceARunArtifactDigest', 'producerOutcomeDigest',
    'artifactManifestDigest', 'controlReceiptDigest', 'verifierDigest', 'payloadBundleRoot',
    'trajectoryDigest', 'atomOrderDigest', 'cellDigest', 'topologyDigest',
  ] as const) {
    assertDigest(value[key], `${label} ${key}`);
  }
}

function buildManifestBoundArtifact(
  channel: AtomisticTrajectoryArtifactChannelV045,
  input: AtomisticManifestArrayDescriptorV045,
) {
  const manifestDescriptor = safePlainClone(
    input,
    `atomistic ${channel} manifest descriptor`,
  );
  assertManifestDescriptor(manifestDescriptor, channel);
  const spec = ARTIFACT_SPECS[channel];
  return {
    channel,
    encoding: spec.encoding,
    componentCount: spec.componentCount,
    manifestDescriptor,
    manifestDescriptorDigest: digestValue(manifestDescriptor),
  };
}

function assertManifestBoundArtifact(
  value: AtomisticF64ChunkArtifactV045 | AtomisticMetadataArtifactV045,
  channel: AtomisticTrajectoryArtifactChannelV045,
) {
  assertExactKeys(value, [
    'channel', 'encoding', 'componentCount', 'manifestDescriptor',
    'manifestDescriptorDigest',
  ], `atomistic ${channel} manifest-bound artifact`);
  const spec = ARTIFACT_SPECS[channel];
  if (value.channel !== channel || value.encoding !== spec.encoding
    || value.componentCount !== spec.componentCount) {
    throw new Error(`atomistic ${channel} manifest-bound artifact identity changed`);
  }
  assertManifestDescriptor(value.manifestDescriptor, channel);
  assertDigest(value.manifestDescriptorDigest, `atomistic ${channel} descriptor digest`);
  if (value.manifestDescriptorDigest !== digestValue(value.manifestDescriptor)) {
    throw new Error(`atomistic ${channel} manifest descriptor digest is stale`);
  }
}

function assertManifestDescriptor(
  value: AtomisticManifestArrayDescriptorV045,
  channel: AtomisticTrajectoryArtifactChannelV045,
) {
  assertExactKeys(value, [
    'id', 'path', 'kind', 'dtype', 'shape', 'unit', 'sizeBytes', 'sha256',
  ], `atomistic ${channel} artifact manifest descriptor`);
  const spec = ARTIFACT_SPECS[channel];
  if (value.id !== spec.id || value.path !== spec.path || value.kind !== 'array'
    || value.dtype !== spec.dtype || !exactArray(value.shape, spec.shape)
    || value.unit !== spec.unit || value.sizeBytes !== spec.sizeBytes) {
    throw new Error(`atomistic ${channel} artifact manifest descriptor changed`);
  }
  assertDigest(value.sha256, `atomistic ${channel} artifact digest`);
}

function assertF64FrameSource(
  value: AtomisticF64FrameSourceV045,
  channel: AtomisticBinaryChannelV045,
) {
  assertExactKeys(value, [
    'channel', 'encoding', 'shape', 'componentCount', 'byteOffset', 'byteLength',
    'sourceArtifactId', 'sourceArtifactPath', 'sourceArtifactByteLength',
    'sourceArtifactDigest', 'frameByteDigest', 'sourceManifestDescriptorDigest',
    'frameSourceDescriptorDigest',
  ], `atomistic ${channel} F64 source`);
  const artifactSpec = ARTIFACT_SPECS[channel];
  if (value.channel !== channel || value.encoding !== 'ieee754-float64-little-endian'
    || !exactArray(value.shape, [ATOMISTIC_PARTICLE_COUNT_V045, 3])
    || value.componentCount !== ATOMISTIC_COMPONENT_COUNT_V045
    || value.byteLength !== ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045
    || value.sourceArtifactId !== artifactSpec.id
    || value.sourceArtifactPath !== artifactSpec.path
    || value.sourceArtifactByteLength !== ATOMISTIC_F64_TRAJECTORY_BYTE_LENGTH_V045) {
    throw new Error(`atomistic ${channel} F64 source shape or byte length changed`);
  }
  assertSafeInteger(value.byteOffset, 0, MAXIMUM_SAFE_BYTE_LENGTH, `atomistic ${channel} byte offset`);
  assertSafeInteger(
    value.sourceArtifactByteLength,
    ATOMISTIC_F64_TRAJECTORY_BYTE_LENGTH_V045,
    ATOMISTIC_F64_TRAJECTORY_BYTE_LENGTH_V045,
    `atomistic ${channel} source artifact byte length`,
  );
  if (value.byteOffset % ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045 !== 0
    || value.byteOffset + value.byteLength > value.sourceArtifactByteLength
    || value.sourceArtifactByteLength % value.byteLength !== 0) {
    throw new Error(`atomistic ${channel} F64 source byte range is invalid`);
  }
  assertDigest(value.sourceArtifactDigest, `atomistic ${channel} source artifact digest`);
  assertDigest(value.frameByteDigest, `atomistic ${channel} frame byte digest`);
  assertDigest(
    value.sourceManifestDescriptorDigest,
    `atomistic ${channel} source manifest descriptor digest`,
  );
  assertDigest(value.frameSourceDescriptorDigest, `atomistic ${channel} frame source digest`);
  const { frameSourceDescriptorDigest, ...payload } = value;
  if (frameSourceDescriptorDigest !== digestValue(payload)) {
    throw new Error(`atomistic ${channel} frame source descriptor digest is stale`);
  }
}

function buildMetadataFrameSource(
  channel: AtomisticMetadataChannelV045,
  frameOrdinal: number,
  artifact: AtomisticMetadataArtifactV045,
  values: readonly number[],
): AtomisticMetadataFrameSourceV045 {
  const layout = metadataFrameLayout(channel);
  const manifestDescriptor = artifact.manifestDescriptor;
  const descriptorPayload = {
    channel,
    encoding: layout.encoding,
    shape: layout.shape,
    componentCount: layout.componentCount,
    byteOffset: checkedProduct(frameOrdinal, layout.byteLength, `atomistic ${channel} byte offset`),
    byteLength: layout.byteLength,
    sourceArtifactId: manifestDescriptor.id,
    sourceArtifactPath: manifestDescriptor.path,
    sourceArtifactByteLength: manifestDescriptor.sizeBytes,
    sourceArtifactDigest: manifestDescriptor.sha256,
    frameByteDigest: digestMetadataFrameBytes(channel, values),
    sourceManifestDescriptorDigest: artifact.manifestDescriptorDigest,
  };
  return {
    ...descriptorPayload,
    frameSourceDescriptorDigest: digestValue(descriptorPayload),
  } as AtomisticMetadataFrameSourceV045;
}

function assertMetadataFrameSource(
  value: AtomisticMetadataFrameSourceV045,
  channel: AtomisticMetadataChannelV045,
  frameOrdinal: number,
  values: readonly number[],
) {
  assertExactKeys(value, [
    'channel', 'encoding', 'shape', 'componentCount', 'byteOffset', 'byteLength',
    'sourceArtifactId', 'sourceArtifactPath', 'sourceArtifactByteLength',
    'sourceArtifactDigest', 'frameByteDigest', 'sourceManifestDescriptorDigest',
    'frameSourceDescriptorDigest',
  ], `atomistic ${channel} frame source`);
  const layout = metadataFrameLayout(channel);
  const artifactSpec = ARTIFACT_SPECS[channel];
  const expectedOffset = checkedProduct(
    frameOrdinal,
    layout.byteLength,
    `atomistic ${channel} global byte offset`,
  );
  if (value.channel !== channel || value.encoding !== layout.encoding
    || !exactArray(value.shape, layout.shape) || value.componentCount !== layout.componentCount
    || value.byteOffset !== expectedOffset || value.byteLength !== layout.byteLength
    || value.sourceArtifactId !== artifactSpec.id || value.sourceArtifactPath !== artifactSpec.path
    || value.sourceArtifactByteLength !== artifactSpec.sizeBytes) {
    throw new Error(`atomistic ${channel} frame source descriptor changed`);
  }
  assertDigest(value.sourceArtifactDigest, `atomistic ${channel} source artifact digest`);
  assertDigest(value.sourceManifestDescriptorDigest, `atomistic ${channel} manifest descriptor digest`);
  if (value.frameByteDigest !== digestMetadataFrameBytes(channel, values)) {
    throw new Error(`atomistic ${channel} frame byte digest does not bind its recorded value`);
  }
  assertDigest(value.frameSourceDescriptorDigest, `atomistic ${channel} frame source digest`);
  const { frameSourceDescriptorDigest, ...payload } = value;
  if (frameSourceDescriptorDigest !== digestValue(payload)) {
    throw new Error(`atomistic ${channel} frame source descriptor digest is stale`);
  }
}

function metadataFrameLayout(channel: AtomisticMetadataChannelV045) {
  if (channel === 'sampleSteps') {
    return {
      encoding: 'uint32-little-endian' as const,
      shape: [1] as const,
      componentCount: 1 as const,
      byteLength: 4 as const,
    };
  }
  if (channel === 'sampleTimes') {
    return {
      encoding: 'ieee754-float64-little-endian' as const,
      shape: [1] as const,
      componentCount: 1 as const,
      byteLength: 8 as const,
    };
  }
  return {
    encoding: 'ieee754-float64-little-endian' as const,
    shape: [3] as const,
    componentCount: 3 as const,
    byteLength: 24 as const,
  };
}

function digestMetadataFrameBytes(
  channel: AtomisticMetadataChannelV045,
  values: readonly number[],
) {
  const layout = metadataFrameLayout(channel);
  if (values.length !== layout.componentCount) {
    throw new Error(`atomistic ${channel} frame value count changed`);
  }
  const bytes = new Uint8Array(layout.byteLength);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (channel === 'sampleSteps') {
      assertSafeInteger(value, 0, 0xffff_ffff, 'atomistic sample step source value');
      view.setUint32(index * 4, value, true);
    } else {
      assertFinite(value, `atomistic ${channel} source value ${index}`);
      view.setFloat64(index * 8, value, true);
    }
  }
  return `sha256:${bytesToHex(sha256(bytes))}`;
}

function assertGpuChannel(
  value: AtomisticGpuF32ChannelReceiptV045,
  channel: AtomisticBinaryChannelV045,
) {
  assertExactKeys(value, [
    'channel', 'sourceEncoding', 'sourceShape', 'sourceByteLength',
    'sourceByteDigest', 'derivedEncoding', 'derivedShape', 'derivedByteLength',
    'derivedByteDigest', 'decodeSemantics',
  ], `atomistic GPU ${channel} channel`);
  if (value.channel !== channel
    || value.sourceEncoding !== 'ieee754-float64-little-endian'
    || !exactArray(value.sourceShape, [ATOMISTIC_PARTICLE_COUNT_V045, 3])
    || value.sourceByteLength !== ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045
    || value.derivedEncoding !== 'ieee754-float32-little-endian'
    || !exactArray(value.derivedShape, [ATOMISTIC_PARTICLE_COUNT_V045, 3])
    || value.derivedByteLength !== ATOMISTIC_F32_FRAME_BYTE_LENGTH_V045
    || value.decodeSemantics !== 'visual-only-f64le-to-f32le-round-to-nearest-ties-to-even') {
    throw new Error(`atomistic GPU ${channel} decode shape, length, or semantics changed`);
  }
  assertDigest(value.sourceByteDigest, `atomistic GPU ${channel} source digest`);
  assertDigest(value.derivedByteDigest, `atomistic GPU ${channel} derived digest`);
}

function assertInterpolationFrames(
  frameA: AtomisticTrajectoryFrameV045,
  frameB: AtomisticTrajectoryFrameV045,
) {
  assertExactDeepValue(frameA.lineage, frameB.lineage, 'atomistic interpolation lineage');
  if (frameB.frameOrdinal !== frameA.frameOrdinal + 1
    || frameB.step <= frameA.step
    || frameB.timePicoseconds <= frameA.timePicoseconds) {
    throw new Error('atomistic interpolation requires consecutive increasing frames');
  }
}

function frameReference(frame: AtomisticTrajectoryFrameV045) {
  return {
    frameDigest: frame.frameDigest,
    frameOrdinal: frame.frameOrdinal,
    step: frame.step,
    timePicoseconds: frame.timePicoseconds,
  };
}

function assertFrameReference(
  value: AtomisticVisualInterpolationV045['frameA'],
  label: string,
) {
  assertExactKeys(value, ['frameDigest', 'frameOrdinal', 'step', 'timePicoseconds'], label);
  assertDigest(value.frameDigest, `${label} digest`);
  assertSafeInteger(value.frameOrdinal, 0, 1_000_000, `${label} ordinal`);
  assertSafeInteger(value.step, 0, 1_000_000_000, `${label} step`);
  assertNonnegativeFinite(value.timePicoseconds, `${label} time`);
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

function assertNonnegativeFinite(value: unknown, label: string) {
  assertFinite(value, label);
  if ((value as number) < 0) throw new Error(`${label} must be nonnegative`);
}

function assertUnitInterval(value: unknown, label: string) {
  assertFinite(value, label);
  if ((value as number) < 0 || (value as number) > 1) {
    throw new Error(`${label} must be in the closed unit interval`);
  }
}

function checkedProduct(left: number, right: number, label: string) {
  const value = left * right;
  assertSafeInteger(value, 0, MAXIMUM_SAFE_BYTE_LENGTH, label);
  return value;
}

function canonicalFiniteProduct(left: number, right: number, label: string) {
  const value = left * right;
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return Object.is(value, -0) ? 0 : value;
}

function assertTimeReadback(
  timePicoseconds: unknown,
  step: number,
  fixedTimeStepPicoseconds: number,
  label: string,
) {
  assertNonnegativeFinite(timePicoseconds, label);
  const derivedTime = canonicalFiniteProduct(step, fixedTimeStepPicoseconds, `${label} derived value`);
  const residual = Math.abs((timePicoseconds as number) - derivedTime);
  if (!Number.isFinite(residual)
    || residual > ATOMISTIC_TIME_READBACK_ABSOLUTE_TOLERANCE_PS_V045) {
    throw new Error(
      `${label} differs from step times dt by more than the locked absolute tolerance`,
    );
  }
}

function canonicalFiniteSum(left: number, right: number, label: string) {
  const value = left + right;
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
  return Object.is(value, -0) ? 0 : value;
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
