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

export type AtomisticPrivatePositionTrajectoryFixtureV048 = Readonly<{
  session: AtomisticWorldSessionV045;
  sourceFrames: ReadonlyArray<AtomisticPrivatePositionTrajectorySourceFrameInputV048>;
}>;

export function createAtomisticPrivatePositionTrajectoryFixtureV048(
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
