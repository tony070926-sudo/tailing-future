import { describe, expect, it } from 'vitest';
import { digestValue } from './digest.ts';
import {
  ATOMISTIC_F32_FRAME_BYTE_LENGTH_V045,
  ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045,
  ATOMISTIC_F64_TRAJECTORY_BYTE_LENGTH_V045,
  ATOMISTIC_FORCE_SEMANTICS_V045,
  ATOMISTIC_PARTICLE_COUNT_V045,
  ATOMISTIC_PLAN_DIGEST_V045,
  ATOMISTIC_REFERENCE_BACKEND_MANIFEST_DIGEST_V045,
  ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045,
  ATOMISTIC_SYSTEM_DIGEST_V045,
  ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045,
  ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045,
  ATOMISTIC_WORLD_SOURCE_V045,
  assertAtomisticGpuF32VisualFrameV045,
  assertAtomisticTrajectoryChunkV045,
  assertAtomisticTrajectoryFrameV045,
  assertAtomisticVisualInterpolationV045,
  createAtomisticGpuF32VisualFrameV045,
  createAtomisticTrajectoryChunkV045,
  createAtomisticVisualInterpolationV045,
  type AtomisticManifestArrayDescriptorV045,
  type AtomisticTrajectoryArtifactChannelV045,
  type AtomisticTrajectoryChunkInputV045,
  type AtomisticTrajectoryLineageV045,
} from './atomistic-trajectory-chunk.ts';

const CHANNELS = [
  'positionsNanometer',
  'velocitiesNanometerPerPicosecond',
  'potentialForcesKjMolNanometer',
] as const;

describe('v0.4.5 execution-unattested atomistic trajectory monolith', () => {
  it('binds all 101 frames to the actual Reference-A descriptors and global offsets', () => {
    const first = createAtomisticTrajectoryChunkV045(chunkInput());
    const replay = createAtomisticTrajectoryChunkV045(chunkInput());

    expect(first).toEqual(replay);
    expect(first).not.toBe(replay);
    expect(first).toMatchObject({
      status: 'scientific-self-consistency-monolithic-trajectory-execution-unattested',
      verificationBoundary: 'independent-scientific-verification-without-execution-attestation',
      source: ATOMISTIC_WORLD_SOURCE_V045,
      forceSemantics: ATOMISTIC_FORCE_SEMANTICS_V045,
      frameCount: 101,
      integratedSteps: 1000,
      executionAuthenticityVerified: false,
      promotionEligible: false,
      velocityTemporalAlignment: ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045,
      stateEnergyTemporalAlignment: ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045,
    });
    expect(first.artifacts.positionsNanometer).toMatchObject({
      encoding: 'ieee754-float64-little-endian',
      componentCount: 813_555,
      manifestDescriptor: {
        id: 'reference-a-positions',
        path: 'arrays/reference-a-positions.f64le',
        dtype: 'float64-le',
        shape: [101, ATOMISTIC_PARTICLE_COUNT_V045, 3],
        unit: 'nanometer',
        sizeBytes: ATOMISTIC_F64_TRAJECTORY_BYTE_LENGTH_V045,
      },
    });
    expect(first.artifacts.sampleSteps.manifestDescriptor).toMatchObject({
      id: 'reference-a-sample-steps',
      path: 'arrays/reference-a-sample-steps.u32le',
      dtype: 'uint32-le',
      shape: [101],
      sizeBytes: 404,
    });
    expect(first.artifacts.sampleTimes.manifestDescriptor).toMatchObject({
      id: 'reference-a-sample-times',
      path: 'arrays/reference-a-sample-times.f64le',
      shape: [101],
      sizeBytes: 808,
    });
    expect(first.artifacts.energies.manifestDescriptor).toMatchObject({
      id: 'reference-a-energies',
      path: 'arrays/reference-a-energies.f64le',
      shape: [101, 3],
      sizeBytes: 2424,
    });

    const final = first.frames[100];
    expect(final).toMatchObject({
      status: 'scientific-self-consistency-frame-execution-unattested',
      frameOrdinal: 100,
      step: 1000,
      timePicoseconds: 1.0000000000000007,
      executionAuthenticityVerified: false,
      promotionEligible: false,
      velocityTemporalAlignment: ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045,
      stateEnergyTemporalAlignment: ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045,
    });
    expect(final.arrays.positionsNanometer).toMatchObject({
      sourceArtifactId: 'reference-a-positions',
      sourceArtifactPath: 'arrays/reference-a-positions.f64le',
      sourceArtifactByteLength: ATOMISTIC_F64_TRAJECTORY_BYTE_LENGTH_V045,
      byteOffset: 100 * ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045,
      byteLength: ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045,
      sourceArtifactDigest: first.artifacts.positionsNanometer.manifestDescriptor.sha256,
      sourceManifestDescriptorDigest:
        first.artifacts.positionsNanometer.manifestDescriptorDigest,
    });
    expect(final.metadataSources.sampleSteps).toMatchObject({
      sourceArtifactId: 'reference-a-sample-steps',
      byteOffset: 400,
      byteLength: 4,
      sourceArtifactByteLength: 404,
    });
    expect(final.metadataSources.sampleTimes).toMatchObject({
      sourceArtifactId: 'reference-a-sample-times',
      byteOffset: 800,
      byteLength: 8,
      sourceArtifactByteLength: 808,
    });
    expect(final.metadataSources.energies).toMatchObject({
      sourceArtifactId: 'reference-a-energies',
      byteOffset: 2400,
      byteLength: 24,
      sourceArtifactByteLength: 2424,
    });
    expect(first.frames[0].unavailableObservables).toEqual({
      electronicDensity: {
        status: 'unavailable', value: null, reason: 'no-electronic-structure-result',
      },
      bondOrder: {
        status: 'unavailable', value: null, reason: 'no-bond-order-result',
      },
      stress: {
        status: 'unavailable', value: null, reason: 'no-complete-virial-result',
      },
      pressure: {
        status: 'unavailable', value: null, reason: 'no-complete-virial-result',
      },
    });
    expectSelfDigest(first, 'chunkDigest');
    for (const frame of first.frames) {
      expectSelfDigest(frame, 'frameDigest');
      for (const channel of CHANNELS) {
        expectSelfDigest(frame.arrays[channel], 'frameSourceDescriptorDigest');
      }
      expectSelfDigest(frame.metadataSources.sampleSteps, 'frameSourceDescriptorDigest');
      expectSelfDigest(frame.metadataSources.sampleTimes, 'frameSourceDescriptorDigest');
      expectSelfDigest(frame.metadataSources.energies, 'frameSourceDescriptorDigest');
    }
    expectRecursivelyFrozen(first);
    expect(() => assertAtomisticTrajectoryChunkV045(first)).not.toThrow();
  });

  it('rejects legacy 51/50 chunks and partial or locally-offset artifacts', () => {
    expect(() => createAtomisticTrajectoryChunkV045(chunkInput({ frameCount: 51 })))
      .toThrow(/exactly 101 frames/i);
    expect(() => createAtomisticTrajectoryChunkV045(chunkInput({
      firstFrameOrdinal: 51,
      frameCount: 50,
    }))).toThrow(/monolith cadence|exactly 101 frames/i);

    const partial = chunkInput() as DeepMutable<AtomisticTrajectoryChunkInputV045>;
    partial.artifactManifestDescriptors.positionsNanometer.shape[0] = 51;
    partial.artifactManifestDescriptors.positionsNanometer.sizeBytes =
      51 * ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045;
    expect(() => createAtomisticTrajectoryChunkV045(partial))
      .toThrow(/manifest descriptor changed/i);

    const localOffset = structuredClone(
      createAtomisticTrajectoryChunkV045(chunkInput()),
    ) as unknown as DeepMutable<ReturnType<typeof createAtomisticTrajectoryChunkV045>>;
    localOffset.frames[100].arrays.positionsNanometer.byteOffset = 0;
    rehashFrameSource(localOffset.frames[100].arrays.positionsNanometer);
    rehashFrame(localOffset.frames[100]);
    rehashChunk(localOffset);
    expect(() => assertAtomisticTrajectoryChunkV045(localOffset))
      .toThrow(/global monolithic offset/i);
  });

  it('rejects false promotion, stale descriptors, bad values, and hostile input', () => {
    const caller = chunkInput() as DeepMutable<AtomisticTrajectoryChunkInputV045>;
    const accepted = createAtomisticTrajectoryChunkV045(caller);
    const snapshot = structuredClone(accepted);
    caller.frames[0].energy.potentialKjMol = 123;
    caller.frames[0].frameByteDigests.positionsNanometer = digest('mutated');
    expect(accepted).toEqual(snapshot);

    const promoted = structuredClone(accepted) as unknown as DeepMutable<typeof accepted>;
    promoted.promotionEligible = true as false;
    rehashChunk(promoted);
    expect(() => assertAtomisticTrajectoryChunkV045(promoted))
      .toThrow(/execution-unattested boundary/i);

    const forged = structuredClone(accepted) as unknown as DeepMutable<typeof accepted>;
    forged.executionAuthenticityVerified = true as false;
    rehashChunk(forged);
    expect(() => assertAtomisticTrajectoryChunkV045(forged))
      .toThrow(/execution-unattested boundary/i);

    const stale = structuredClone(accepted) as unknown as DeepMutable<typeof accepted>;
    stale.artifacts.positionsNanometer.manifestDescriptor.sha256 = digest('different-bytes');
    rehashChunk(stale);
    expect(() => assertAtomisticTrajectoryChunkV045(stale))
      .toThrow(/descriptor digest is stale/i);

    const nonfinite = chunkInput() as DeepMutable<AtomisticTrajectoryChunkInputV045>;
    nonfinite.frames[0].energy.kineticKjMol = Number.NaN;
    expect(() => createAtomisticTrajectoryChunkV045(nonfinite)).toThrow(/plain-data|finite/i);

    const noClosure = chunkInput() as DeepMutable<AtomisticTrajectoryChunkInputV045>;
    noClosure.frames[0].energy.totalKjMol = -48;
    expect(() => createAtomisticTrajectoryChunkV045(noClosure)).toThrow(/does not close/i);

    let getterCalls = 0;
    const hostile = chunkInput() as unknown as Record<string, unknown>;
    Object.defineProperty(hostile, 'chunkId', {
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 'hostile';
      },
    });
    expect(() => createAtomisticTrajectoryChunkV045(
      hostile as unknown as AtomisticTrajectoryChunkInputV045,
    )).toThrow(/plain-data/i);
    expect(getterCalls).toBe(0);
  });
});

describe('v0.4.5 GPU and interpolation presentation derivatives', () => {
  it('records F64/F32 digest lineage without promoting scientific evidence', () => {
    const frame = createAtomisticTrajectoryChunkV045(chunkInput()).frames[0];
    const gpu = createAtomisticGpuF32VisualFrameV045(frame, channelDigests('gpu-f32'));
    for (const channel of CHANNELS) {
      expect(gpu.channels[channel]).toMatchObject({
        sourceShape: [ATOMISTIC_PARTICLE_COUNT_V045, 3],
        sourceByteLength: ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045,
        sourceByteDigest: frame.arrays[channel].frameByteDigest,
        derivedByteLength: ATOMISTIC_F32_FRAME_BYTE_LENGTH_V045,
      });
    }
    expect(() => assertAtomisticGpuF32VisualFrameV045(gpu, frame)).not.toThrow();
    expect(() => assertAtomisticTrajectoryFrameV045(gpu)).toThrow();

    const wrongSource = structuredClone(gpu) as unknown as DeepMutable<typeof gpu>;
    wrongSource.channels.positionsNanometer.sourceByteDigest = digest('wrong-f64-source');
    rehashGpu(wrongSource);
    expect(() => assertAtomisticGpuF32VisualFrameV045(wrongSource, frame))
      .toThrow(/source-byte lineage/i);
  });

  it('keeps interpolation presentation-only and binds exact scientific frame lineage', () => {
    const chunk = createAtomisticTrajectoryChunkV045(chunkInput());
    const frameA = chunk.frames[20];
    const frameB = chunk.frames[21];
    const interpolation = createAtomisticVisualInterpolationV045(frameA, frameB, 0.25);
    expect(interpolation).toMatchObject({
      status: 'presentation-only-between-scientific-evidence-frames',
      frameA: { frameOrdinal: 20, step: 200, timePicoseconds: 0.2 },
      frameB: { frameOrdinal: 21, step: 210, timePicoseconds: 0.21 },
      alpha: 0.25,
      presentationTimePicoseconds: 0.2025,
      forceDisplay: 'disabled-between-scientific-evidence-frames',
      physicalWorldState: false,
      presentationOnly: true,
    });
    expect(() => assertAtomisticVisualInterpolationV045(
      interpolation, frameA, frameB,
    )).not.toThrow();

    const otherLineage = { ...fixtureLineage(), topologyDigest: digest('other-topology') };
    const otherB = createAtomisticTrajectoryChunkV045(
      chunkInput({ lineage: otherLineage }),
    ).frames[21];
    expect(() => createAtomisticVisualInterpolationV045(frameA, otherB, 0.5)).toThrow(/lineage/i);
  });
});

export function fixtureLineage(): AtomisticTrajectoryLineageV045 {
  return {
    systemDigest: ATOMISTIC_SYSTEM_DIGEST_V045,
    planDigest: ATOMISTIC_PLAN_DIGEST_V045,
    sourceRevision: '1234567890abcdef1234567890abcdef12345678',
    backendManifestDigest: ATOMISTIC_REFERENCE_BACKEND_MANIFEST_DIGEST_V045,
    serializedSystemDigest: digest('serialized-system'),
    prepareReceiptDigest: digest('prepare-receipt'),
    prepareReceiptArtifactDigest: digest('prepare-receipt-artifact'),
    referenceARunReceiptDigest: digest('reference-a-run-receipt'),
    referenceARunArtifactDigest: digest('reference-a-run-artifact'),
    producerOutcomeDigest: digest('producer-outcome'),
    artifactManifestDigest: digest('artifact-manifest'),
    controlReceiptDigest: digest('control-receipt'),
    verifierDigest: digest('independent-verifier'),
    payloadBundleRoot: digest('payload-bundle-root'),
    trajectoryDigest: digest('trajectory'),
    atomOrderDigest: digest('atom-order'),
    cellDigest: digest('cell'),
    topologyDigest: digest('topology'),
    integratedSteps: 1000,
    velocityTemporalAlignment: ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045,
    stateEnergyTemporalAlignment: ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045,
    executionAuthenticityVerified: false,
    promotionEligible: false,
  };
}

type ChunkInputOptions = Readonly<{
  firstFrameOrdinal?: number;
  frameCount?: number;
  lineage?: AtomisticTrajectoryLineageV045;
}>;

export function chunkInput(options: ChunkInputOptions = {}): AtomisticTrajectoryChunkInputV045 {
  const firstFrameOrdinal = options.firstFrameOrdinal ?? 0;
  const frameCount = options.frameCount ?? ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045;
  return {
    chunkId: 'reference-a-monolithic-trajectory',
    lineage: { ...(options.lineage ?? fixtureLineage()) },
    firstFrameOrdinal,
    sampleStrideSteps: 10,
    fixedTimeStepPicoseconds: 0.001,
    artifactManifestDescriptors: artifactManifestDescriptors(),
    frames: Array.from({ length: frameCount }, (_, localIndex) => {
      const ordinal = firstFrameOrdinal + localIndex;
      const step = ordinal * 10;
      const potentialKjMol = -100 + ordinal / 10;
      const kineticKjMol = 50 + ordinal / 20;
      return {
        step,
        timePicoseconds: step === 1000 ? 1.0000000000000007 : step * 0.001,
        frameByteDigests: channelDigests(`frame-${ordinal}`),
        energy: {
          potentialKjMol,
          kineticKjMol,
          totalKjMol: potentialKjMol + kineticKjMol,
        },
      };
    }),
  };
}

function artifactManifestDescriptors(): Record<
  AtomisticTrajectoryArtifactChannelV045,
  AtomisticManifestArrayDescriptorV045
> {
  return {
    positionsNanometer: descriptor('reference-a-positions', 'arrays/reference-a-positions.f64le',
      'float64-le', [101, 2685, 3], 'nanometer', 6_508_440),
    velocitiesNanometerPerPicosecond: descriptor(
      'reference-a-velocities', 'arrays/reference-a-velocities.f64le',
      'float64-le', [101, 2685, 3], 'nanometer-per-picosecond', 6_508_440,
    ),
    potentialForcesKjMolNanometer: descriptor(
      'reference-a-potential-forces', 'arrays/reference-a-potential-forces.f64le',
      'float64-le', [101, 2685, 3], 'kilojoule-per-mole-per-nanometer', 6_508_440,
    ),
    sampleSteps: descriptor('reference-a-sample-steps', 'arrays/reference-a-sample-steps.u32le',
      'uint32-le', [101], 'step', 404),
    sampleTimes: descriptor('reference-a-sample-times', 'arrays/reference-a-sample-times.f64le',
      'float64-le', [101], 'picosecond', 808),
    energies: descriptor('reference-a-energies', 'arrays/reference-a-energies.f64le',
      'float64-le', [101, 3], 'kilojoule-per-mole', 2424),
  };
}

function descriptor(
  id: string,
  path: string,
  dtype: 'float64-le' | 'uint32-le',
  shape: number[],
  unit: AtomisticManifestArrayDescriptorV045['unit'],
  sizeBytes: number,
): AtomisticManifestArrayDescriptorV045 {
  return { id, path, kind: 'array', dtype, shape, unit, sizeBytes, sha256: digest(`artifact-${id}`) };
}

function channelDigests(prefix: string) {
  return {
    positionsNanometer: digest(`${prefix}-positions`),
    velocitiesNanometerPerPicosecond: digest(`${prefix}-velocities`),
    potentialForcesKjMolNanometer: digest(`${prefix}-forces`),
  };
}

function digest(label: string) {
  return digestValue({ fixture: label });
}

function rehashFrameSource(source: Record<string, unknown>) {
  const payload = { ...source };
  Reflect.deleteProperty(payload, 'frameSourceDescriptorDigest');
  source.frameSourceDescriptorDigest = digestValue(payload);
}

function rehashFrame(frame: Record<string, unknown>) {
  const payload = { ...frame };
  Reflect.deleteProperty(payload, 'frameDigest');
  frame.frameDigest = digestValue(payload);
}

function rehashChunk(chunk: Record<string, unknown>) {
  const payload = { ...chunk };
  Reflect.deleteProperty(payload, 'chunkDigest');
  chunk.chunkDigest = digestValue(payload);
}

function rehashGpu(frame: Record<string, unknown>) {
  const payload = { ...frame };
  Reflect.deleteProperty(payload, 'gpuFrameDigest');
  frame.gpuFrameDigest = digestValue(payload);
}

function expectSelfDigest(value: object, digestKey: string) {
  const clone = structuredClone(value) as Record<string, unknown>;
  const digestValueFromObject = clone[digestKey];
  Reflect.deleteProperty(clone, digestKey);
  expect(digestValueFromObject).toBe(digestValue(clone));
}

function expectRecursivelyFrozen(value: unknown) {
  if (!value || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectRecursivelyFrozen(child);
}

type DeepMutable<T> = T extends ReadonlyArray<infer U>
  ? DeepMutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
    : T;
