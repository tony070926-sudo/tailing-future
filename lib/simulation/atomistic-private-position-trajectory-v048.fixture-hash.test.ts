import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createAtomisticPrivatePositionTrajectoryFixtureV048 as createIncrementalFixture,
} from './atomistic-private-position-trajectory-v048.test-fixture.ts';

// Synthetic fixture equivalence only: this does not execute or validate OpenMM.
// The legacy section preserves the pre-change source; only the two public
// declarations become private (and the factory is renamed). It intentionally
// retains the old full-trajectory allocation as a test oracle, not production.
// BEGIN PRESERVED LEGACY FIXTURE
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import {
  ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045,
  ATOMISTIC_PLAN_DIGEST_V045,
  ATOMISTIC_REFERENCE_BACKEND_MANIFEST_DIGEST_V045,
  ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045,
  ATOMISTIC_SYSTEM_DIGEST_V045,
  ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045,
  createAtomisticTrajectoryChunkV045,
  type AtomisticManifestArrayDescriptorV045,
  type AtomisticTrajectoryArtifactChannelV045,
  type AtomisticTrajectoryLineageV045,
} from './atomistic-trajectory-chunk.ts';
import { digestValue } from './digest.ts';
import {
  createAtomisticWorldSessionV045,
  type AtomisticWorldSessionV045,
} from './atomistic-world-session.ts';
import type { AtomisticPrivatePositionTrajectorySourceFrameInputV048 } from
  './atomistic-private-position-trajectory-v048.ts';

type AtomisticPrivatePositionTrajectoryFixtureV048 = Readonly<{
  session: AtomisticWorldSessionV045;
  sourceFrames: ReadonlyArray<AtomisticPrivatePositionTrajectorySourceFrameInputV048>;
}>;

function createLegacyFixture(
  prefix: string,
  options: Readonly<{
    layout?: 'spatial' | 'collapsed';
    mutate?: Readonly<{ frameOrdinal: number; componentIndex: number; value: number }>;
    mutations?: ReadonlyArray<
      Readonly<{ frameOrdinal: number; componentIndex: number; value: number }>
    >;
    duplicateFrame?: Readonly<{ sourceOrdinal: number; targetOrdinal: number }>;
    translateWater?: Readonly<{
      frameOrdinal: number;
      waterIndex: number;
      deltaNanometer: number;
    }>;
  }> = {},
): AtomisticPrivatePositionTrajectoryFixtureV048 {
  const frames = Array.from({ length: 101 }, (_, frameOrdinal) => (
    positionFrame(frameOrdinal, options.layout ?? 'spatial')
  ));
  if (options.duplicateFrame) {
    const { sourceOrdinal, targetOrdinal } = options.duplicateFrame;
    frames[targetOrdinal] = frames[sourceOrdinal].slice();
  }
  for (const mutation of [
    ...(options.mutate ? [options.mutate] : []),
    ...(options.mutations ?? []),
  ]) {
    const { frameOrdinal, componentIndex, value } = mutation;
    new DataView(frames[frameOrdinal].buffer).setFloat64(componentIndex * 8, value, true);
  }
  if (options.translateWater) {
    const { frameOrdinal, waterIndex, deltaNanometer } = options.translateWater;
    const view = new DataView(frames[frameOrdinal].buffer);
    const firstComponent = waterIndex * 9;
    for (let component = firstComponent; component < firstComponent + 9; component += 1) {
      view.setFloat64(component * 8, view.getFloat64(component * 8, true) + deltaNanometer, true);
    }
  }
  const trajectoryBytes = new Uint8Array(101 * ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045);
  const frameDigests = frames.map((bytes, frameOrdinal) => {
    trajectoryBytes.set(bytes, frameOrdinal * ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045);
    return digestBytes(bytes);
  });
  const session = worldSession(prefix, frameDigests, digestBytes(trajectoryBytes));
  return Object.freeze({
    session,
    sourceFrames: Object.freeze(frames.map((bytes, frameOrdinal) => Object.freeze({
      frameOrdinal,
      sourcePositionsF64Digest: frameDigests[frameOrdinal],
      positionsF64LeBytes: bytes.slice(),
    }))),
  });
}

function positionFrame(frameOrdinal: number, layout: 'spatial' | 'collapsed') {
  const bytes = new Uint8Array(ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045);
  const view = new DataView(bytes.buffer);
  const oh = 0.09572;
  const angle = 1.82421813418;
  const h2x = oh * Math.cos(angle);
  const h2y = oh * Math.sin(angle);
  const translation = frameOrdinal * 0.000005;
  for (let water = 0; water < 895; water += 1) {
    const component = water * 9;
    const x = layout === 'collapsed' ? 0.2 : 0.12 + (water % 10) * 0.285;
    const y = layout === 'collapsed' ? 0.2 : 0.12 + (Math.floor(water / 10) % 10) * 0.285;
    const z = layout === 'collapsed' ? 0.2 : 0.15 + Math.floor(water / 100) * 0.32;
    setVector(view, component, x + translation, y + translation, z + translation);
    setVector(view, component + 3, x + oh + translation, y + translation, z + translation);
    setVector(view, component + 6, x + h2x + translation,
      y + h2y + translation, z + translation);
  }
  return bytes;
}

function worldSession(prefix: string, positionFrameDigests: string[], positionArtifactDigest: string) {
  const lineage = createLineage(prefix);
  const descriptors = artifactDescriptors(positionArtifactDigest);
  const chunk = createAtomisticTrajectoryChunkV045({
    chunkId: 'reference-a-monolithic-trajectory',
    lineage,
    firstFrameOrdinal: 0,
    sampleStrideSteps: 10,
    fixedTimeStepPicoseconds: 0.001,
    artifactManifestDescriptors: descriptors,
    frames: Array.from({ length: 101 }, (_, frameOrdinal) => {
      const potentialKjMol = -100 + frameOrdinal / 10;
      const kineticKjMol = 50 + frameOrdinal / 20;
      return {
        step: frameOrdinal * 10,
        timePicoseconds: frameOrdinal === 100 ? 1.0000000000000007 : frameOrdinal * 0.01,
        frameByteDigests: {
          positionsNanometer: positionFrameDigests[frameOrdinal],
          velocitiesNanometerPerPicosecond: digest(`${prefix}-velocity-${frameOrdinal}`),
          potentialForcesKjMolNanometer: digest(`${prefix}-force-${frameOrdinal}`),
        },
        energy: {
          potentialKjMol,
          kineticKjMol,
          totalKjMol: potentialKjMol + kineticKjMol,
        },
      };
    }),
  });
  return createAtomisticWorldSessionV045({
    sessionId: `position-trajectory-${prefix}`,
    system: {
      schemaVersion: 'tf.aqueous-system-spec/0.4.4',
      systemId: 'openmm-8.6-tip3p-895-water-pme-control',
      systemDigest: ATOMISTIC_SYSTEM_DIGEST_V045,
    },
    backend: {
      engine: 'OpenMM', engineVersion: '8.6.0', platform: 'Reference', lane: 'reference-a',
      backendManifestDigest: ATOMISTIC_REFERENCE_BACKEND_MANIFEST_DIGEST_V045,
    },
    preparation: {
      prepareReceiptDigest: lineage.prepareReceiptDigest,
      prepareReceiptArtifactDigest: lineage.prepareReceiptArtifactDigest,
      serializedSystemDigest: lineage.serializedSystemDigest,
      portableProductionStartStateDigest: digest(`${prefix}-portable-start`),
    },
    verification: {
      schemaVersion: 'tf.openmm-tip3p-control-receipt/0.4.5',
      statusDomain: 'independent-scientific-assessment-not-release-provenance',
      status: 'verified-pass', systemDigest: ATOMISTIC_SYSTEM_DIGEST_V045,
      planDigest: ATOMISTIC_PLAN_DIGEST_V045, sourceRevision: lineage.sourceRevision,
      producerOutcomeDigest: lineage.producerOutcomeDigest,
      artifactManifestDigest: lineage.artifactManifestDigest,
      controlReceiptDigest: lineage.controlReceiptDigest,
      verifierDigest: lineage.verifierDigest,
      payloadBundleRoot: lineage.payloadBundleRoot,
      executionAuthenticityVerified: false, promotionEligible: false,
    },
    atomOrder: {
      authority: 'pdb-record-order', atomOrderDigest: lineage.atomOrderDigest,
      particleCount: 2_685,
      indexing: 'zero-based-render-index-maps-one-to-one-to-authoritative-order',
    },
    cell: {
      kind: 'orthorhombic-periodic-cell',
      vectorsNanometer: [
        { x: 3, y: 0, z: 0 }, { x: 0, y: 3, z: 0 }, { x: 0, y: 0, z: 3 },
      ],
      periodicAxes: [true, true, true], volumeNanometer3: 27,
      cellDigest: lineage.cellDigest,
    },
    topology: {
      topologyDigest: lineage.topologyDigest, particleCount: 2_685,
      topologyBondCount: 1_790, rigidDistanceConstraintCount: 2_685,
      topologyRole: 'identity-and-adjacency-not-dynamic-bond-order',
    },
    trajectory: {
      referenceARunReceiptDigest: lineage.referenceARunReceiptDigest,
      referenceARunArtifactDigest: lineage.referenceARunArtifactDigest,
      trajectoryDigest: lineage.trajectoryDigest,
      chunks: [chunk],
    },
  });
}

function createLineage(prefix: string): AtomisticTrajectoryLineageV045 {
  return {
    systemDigest: ATOMISTIC_SYSTEM_DIGEST_V045,
    planDigest: ATOMISTIC_PLAN_DIGEST_V045,
    sourceRevision: '1234567890abcdef1234567890abcdef12345678',
    backendManifestDigest: ATOMISTIC_REFERENCE_BACKEND_MANIFEST_DIGEST_V045,
    serializedSystemDigest: digest(`${prefix}-system`),
    prepareReceiptDigest: digest(`${prefix}-prepare`),
    prepareReceiptArtifactDigest: digest(`${prefix}-prepare-artifact`),
    referenceARunReceiptDigest: digest(`${prefix}-run`),
    referenceARunArtifactDigest: digest(`${prefix}-run-artifact`),
    producerOutcomeDigest: digest(`${prefix}-outcome`),
    artifactManifestDigest: digest(`${prefix}-manifest`),
    controlReceiptDigest: digest(`${prefix}-control`),
    verifierDigest: digest(`${prefix}-verifier`),
    payloadBundleRoot: digest(`${prefix}-bundle`),
    trajectoryDigest: digest(`${prefix}-trajectory`),
    atomOrderDigest: digest(`${prefix}-atom-order`),
    cellDigest: digest(`${prefix}-cell`),
    topologyDigest: digest(`${prefix}-topology`),
    integratedSteps: 1_000,
    velocityTemporalAlignment: ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045,
    stateEnergyTemporalAlignment: ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045,
    executionAuthenticityVerified: false,
    promotionEligible: false,
  };
}

function artifactDescriptors(positionArtifactDigest: string): Record<
  AtomisticTrajectoryArtifactChannelV045,
  AtomisticManifestArrayDescriptorV045
> {
  return {
    positionsNanometer: descriptor('reference-a-positions', 'arrays/reference-a-positions.f64le',
      'float64-le', [101, 2_685, 3], 'nanometer', 6_508_440, positionArtifactDigest),
    velocitiesNanometerPerPicosecond: descriptor('reference-a-velocities',
      'arrays/reference-a-velocities.f64le', 'float64-le', [101, 2_685, 3],
      'nanometer-per-picosecond', 6_508_440, digest('velocity-artifact')),
    potentialForcesKjMolNanometer: descriptor('reference-a-potential-forces',
      'arrays/reference-a-potential-forces.f64le', 'float64-le', [101, 2_685, 3],
      'kilojoule-per-mole-per-nanometer', 6_508_440, digest('force-artifact')),
    sampleSteps: descriptor('reference-a-sample-steps', 'arrays/reference-a-sample-steps.u32le',
      'uint32-le', [101], 'step', 404, digest('steps')),
    sampleTimes: descriptor('reference-a-sample-times', 'arrays/reference-a-sample-times.f64le',
      'float64-le', [101], 'picosecond', 808, digest('times')),
    energies: descriptor('reference-a-energies', 'arrays/reference-a-energies.f64le',
      'float64-le', [101, 3], 'kilojoule-per-mole', 2_424, digest('energies')),
  };
}

function descriptor(
  id: string,
  artifactPath: string,
  dtype: 'float64-le' | 'uint32-le',
  shape: number[],
  unit: AtomisticManifestArrayDescriptorV045['unit'],
  sizeBytes: number,
  sha256Digest: string,
): AtomisticManifestArrayDescriptorV045 {
  return { id, path: artifactPath, kind: 'array', dtype, shape, unit, sizeBytes,
    sha256: sha256Digest };
}

function setVector(view: DataView, component: number, x: number, y: number, z: number) {
  view.setFloat64(component * 8, x, true);
  view.setFloat64((component + 1) * 8, y, true);
  view.setFloat64((component + 2) * 8, z, true);
}

function digestBytes(bytes: Uint8Array) {
  return `sha256:${bytesToHex(sha256(bytes))}`;
}

function digest(label: string) {
  return digestValue({ fixture: label });
}
// END PRESERVED LEGACY FIXTURE

type FixtureOptions = Parameters<typeof createIncrementalFixture>[1];
type Fixture = ReturnType<typeof createIncrementalFixture>;
const lastComponent = ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045 / 8 - 1;
const artifactHash = (fixture: Fixture) => (
  fixture.session.trajectory.chunks[0].artifacts.positionsNanometer.manifestDescriptor.sha256
);
const nodeHash = (bytes: Uint8Array) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const frameBuffer = (fixture: Fixture, ordinal: number) => {
  const bytes = fixture.sourceFrames[ordinal].positionsF64LeBytes;
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
};
const componentValue = (fixture: Fixture, frame: number, component: number) => {
  const bytes = fixture.sourceFrames[frame].positionsF64LeBytes;
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getFloat64(component * 8, true);
};

function compareCompleteFixture(id: string, options: FixtureOptions) {
  const previous = createLegacyFixture(`synthetic-hash-${id}`, options);
  const current = createIncrementalFixture(`synthetic-hash-${id}`, options);
  expect(previous.sourceFrames).toHaveLength(101);
  expect(current.sourceFrames).toHaveLength(101);
  const independent = createHash('sha256');
  for (let ordinal = 0; ordinal < 101; ordinal += 1) {
    const oldFrame = previous.sourceFrames[ordinal];
    const newFrame = current.sourceFrames[ordinal];
    expect(newFrame.frameOrdinal).toBe(ordinal);
    expect(oldFrame.frameOrdinal).toBe(ordinal);
    expect(newFrame.positionsF64LeBytes.byteLength).toBe(64_440);
    // Compare actual bytes, including signed zero and nonfinite representations.
    expect(frameBuffer(current, ordinal).equals(frameBuffer(previous, ordinal))).toBe(true);
    expect(newFrame.sourcePositionsF64Digest).toBe(oldFrame.sourcePositionsF64Digest);
    expect(newFrame.sourcePositionsF64Digest).toBe(nodeHash(newFrame.positionsF64LeBytes));
    independent.update(newFrame.positionsF64LeBytes);
  }
  expect(current.session).toStrictEqual(previous.session);
  expect(artifactHash(current)).toBe(artifactHash(previous));
  expect(artifactHash(current)).toBe(`sha256:${independent.digest('hex')}`);
  expect(current.session.executionAuthenticityVerified).toBe(false);
  expect(current.session.promotionEligible).toBe(false);
  return current;
}

const optionCases: ReadonlyArray<Readonly<{ id: string; options: FixtureOptions }>> = [
  { id: 'D01-default', options: undefined },
  { id: 'D02-spatial', options: { layout: 'spatial' } },
  { id: 'D03-collapsed', options: { layout: 'collapsed' } },
  { id: 'D04-empty-mutations', options: { mutations: [] } },
  { id: 'M01-single-mutation', options: {
    mutate: { frameOrdinal: 50, componentIndex: 0, value: -13.25 },
  } },
  { id: 'M02-ordered-mutations', options: { mutations: [
    { frameOrdinal: 0, componentIndex: 0, value: 1 },
    { frameOrdinal: 50, componentIndex: lastComponent, value: 2 },
    { frameOrdinal: 100, componentIndex: lastComponent, value: 3 },
    { frameOrdinal: 0, componentIndex: 0, value: 4 },
  ] } },
  { id: 'C01-duplicate-forward', options: {
    duplicateFrame: { sourceOrdinal: 0, targetOrdinal: 100 },
  } },
  { id: 'C02-duplicate-reverse', options: {
    duplicateFrame: { sourceOrdinal: 100, targetOrdinal: 0 },
  } },
  { id: 'T01-translate-last-water', options: {
    translateWater: { frameOrdinal: 50, waterIndex: 894, deltaNanometer: -0.125 },
  } },
  { id: 'O01-combined-order', options: {
    duplicateFrame: { sourceOrdinal: 0, targetOrdinal: 100 },
    mutate: { frameOrdinal: 100, componentIndex: 0, value: 1 },
    mutations: [
      { frameOrdinal: 0, componentIndex: 0, value: 7 },
      { frameOrdinal: 100, componentIndex: 0, value: 2 },
      { frameOrdinal: 100, componentIndex: 0, value: 3 },
    ],
    translateWater: { frameOrdinal: 100, waterIndex: 0, deltaNanometer: 0.25 },
  } },
];
const specialCases = [
  ['S01-nan', Number.NaN],
  ['S02-positive-infinity', Number.POSITIVE_INFINITY],
  ['S03-negative-infinity', Number.NEGATIVE_INFINITY],
  ['S04-negative-zero', -0],
  ['S05-max-value', Number.MAX_VALUE],
  ['S06-negative-min-value', -Number.MIN_VALUE],
] as const;

describe('synthetic private trajectory incremental hash equivalence', () => {
  it('B01 private legacy implementation reconstructs the exact frozen baseline', () => {
    const text = readFileSync(new URL(import.meta.url), 'utf8');
    const legacy = text.split('// BEGIN PRESERVED LEGACY FIXTURE\n')[1]
      .split('// END PRESERVED LEGACY FIXTURE\n')[0]
      .replace('type AtomisticPrivatePositionTrajectoryFixtureV048',
        'export type AtomisticPrivatePositionTrajectoryFixtureV048')
      .replace('function createLegacyFixture(',
        'export function createAtomisticPrivatePositionTrajectoryFixtureV048(');
    expect(createHash('sha256').update(legacy).digest('hex')).toBe(
      'a0832649ec949f0ee12333f8535facc93c76244456779494e2115ee5565eacca',
    );
  });

  for (const { id, options } of optionCases) {
    it(id + ' preserves all bytes, frame hashes and the complete session', () => {
      const fixture = compareCompleteFixture(id, options);
      if (id === 'M01-single-mutation') expect(componentValue(fixture, 50, 0)).toBe(-13.25);
      if (id === 'M02-ordered-mutations') expect(componentValue(fixture, 0, 0)).toBe(4);
      if (id.startsWith('C0')) {
        expect(frameBuffer(fixture, 0).equals(frameBuffer(fixture, 100))).toBe(true);
      }
      if (id === 'O01-combined-order') {
        expect(componentValue(fixture, 0, 0)).toBe(7);
        expect(componentValue(fixture, 100, 0)).toBe(3.25);
        for (let component = 1; component < 9; component += 1) {
          expect(componentValue(fixture, 100, component)).toBe(
            componentValue(fixture, 0, component) + 0.25,
          );
        }
      }
    });
  }

  for (const [id, value] of specialCases) {
    it(id + ' preserves first/middle/last frame and first/last component bytes', () => {
      // These numbers remain in memory: JSON would erase NaN, infinities or -0.
      const mutations = [0, 50, 100].flatMap((frameOrdinal) => (
        [0, lastComponent].map((componentIndex) => ({ frameOrdinal, componentIndex, value }))
      ));
      const fixture = compareCompleteFixture(id, { mutations });
      for (const { frameOrdinal, componentIndex } of mutations) {
        expect(Object.is(componentValue(fixture, frameOrdinal, componentIndex), value)).toBe(true);
      }
    });
  }

  it('H01 Node crypto contiguous bytes and frame-order sensitivity are independent of noble', () => {
    const fixture = createIncrementalFixture('synthetic-order');
    const ordered = fixture.sourceFrames.map((_, ordinal) => frameBuffer(fixture, ordinal));
    expect(nodeHash(Buffer.concat(ordered))).toBe(artifactHash(fixture));
    const swapped = [...ordered];
    [swapped[0], swapped[100]] = [swapped[100], swapped[0]];
    expect(nodeHash(Buffer.concat(swapped))).not.toBe(artifactHash(fixture));
  });

  for (const [id, create] of [
    ['I01-legacy', createLegacyFixture],
    ['I02-incremental', createIncrementalFixture],
  ] as const) {
    it(id + ' keeps all caller buffers independent and session metadata frozen', () => {
      const options = { duplicateFrame: { sourceOrdinal: 0, targetOrdinal: 100 } };
      const left = create('synthetic-isolation', options);
      const right = create('synthetic-isolation', options);
      const rightHashes = right.sourceFrames.map((frame) => nodeHash(frame.positionsF64LeBytes));
      const leftHashes = left.sourceFrames.map((frame) => nodeHash(frame.positionsF64LeBytes));
      const frozenSession = structuredClone(left.session);
      const buffers = [...left.sourceFrames, ...right.sourceFrames]
        .map((frame) => frame.positionsF64LeBytes.buffer);
      expect(new Set(buffers).size).toBe(202);
      left.sourceFrames[100].positionsF64LeBytes[0] ^= 0xff;
      for (let ordinal = 0; ordinal < 101; ordinal += 1) {
        expect(nodeHash(right.sourceFrames[ordinal].positionsF64LeBytes)).toBe(rightHashes[ordinal]);
        if (ordinal !== 100) {
          expect(nodeHash(left.sourceFrames[ordinal].positionsF64LeBytes)).toBe(leftHashes[ordinal]);
        }
        expect(left.sourceFrames[ordinal].sourcePositionsF64Digest).toBe(leftHashes[ordinal]);
      }
      expect(nodeHash(left.sourceFrames[100].positionsF64LeBytes)).not.toBe(leftHashes[100]);
      expect(left.session).toStrictEqual(frozenSession);
      expect(right.session).toStrictEqual(frozenSession);
      expect(Object.isFrozen(left)).toBe(true);
      expect(Object.isFrozen(left.sourceFrames)).toBe(true);
      const assertFrozen = (value: unknown): void => {
        if (value && typeof value === 'object') {
          expect(Object.isFrozen(value)).toBe(true);
          for (const child of Object.values(value)) assertFrozen(child);
        }
      };
      assertFrozen(left.session);
    });
  }
});
