import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import {
  ATOMISTIC_COMPONENT_COUNT_V045,
  ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045,
  ATOMISTIC_PLAN_DIGEST_V045,
  ATOMISTIC_REFERENCE_BACKEND_MANIFEST_DIGEST_V045,
  ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045,
  ATOMISTIC_SYSTEM_DIGEST_V045,
  ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045,
  createAtomisticTrajectoryChunkV045,
  type AtomisticBinaryChannelV045,
  type AtomisticManifestArrayDescriptorV045,
  type AtomisticTrajectoryArtifactChannelV045,
  type AtomisticTrajectoryChunkInputV045,
  type AtomisticTrajectoryLineageV045,
} from '../simulation/atomistic-trajectory-chunk.ts';
import { digestValue } from '../simulation/digest.ts';
import {
  ATOMISTIC_PRESENTATION_CHANNELS_V046,
  createAtomisticPresentationFrameControllerV046,
  createAtomisticPresentationFrameV046,
  type AtomisticPresentationFrameInputV046,
} from '../simulation/atomistic-presentation-frame.ts';
import {
  createAtomisticWorldSessionV045,
  getAtomisticWorldSessionFrameV045,
  type AtomisticWorldSessionInputV045,
  type AtomisticWorldSessionV045,
} from '../simulation/atomistic-world-session.ts';

const CHANNELS = ATOMISTIC_PRESENTATION_CHANNELS_V046;
const UNITS = Object.freeze({
  positionsNanometer: 'nanometer',
  velocitiesNanometerPerPicosecond: 'nanometer-per-picosecond',
  potentialForcesKjMolNanometer: 'kilojoule-per-mole-per-nanometer',
} as const);
type RawChannels = Record<AtomisticBinaryChannelV045, Uint8Array>;

export type AtomisticInstancingWorldFixtureV046 = Readonly<{
  session: AtomisticWorldSessionV045;
  raw: RawChannels;
}>;

export function createAtomisticInstancingWorldFixtureV046(
  prefix: string,
): AtomisticInstancingWorldFixtureV046 {
  const raw = rawChannels();
  return Object.freeze({ session: worldSession(prefix, raw), raw });
}

export function createAtomisticInstancingPresentationHandleV046(
  fixture: AtomisticInstancingWorldFixtureV046,
  frameOrdinal: number,
) {
  return createAtomisticPresentationFrameV046(
    fixture.session,
    presentationInput(fixture, frameOrdinal),
  );
}

export function createAtomisticInstancingPresentationControllerV046(
  fixture: AtomisticInstancingWorldFixtureV046,
  frameOrdinal: number,
) {
  return createAtomisticPresentationFrameControllerV046(
    fixture.session,
    presentationInput(fixture, frameOrdinal),
  );
}

function presentationInput(
  fixture: AtomisticInstancingWorldFixtureV046,
  frameOrdinal: number,
): AtomisticPresentationFrameInputV046 {
  const frame = getAtomisticWorldSessionFrameV045(fixture.session, frameOrdinal);
  return {
    binding: {
      sessionId: fixture.session.sessionId,
      sessionDigest: fixture.session.sessionDigest,
      frameOrdinal,
      frameDigest: frame.frameDigest,
      atomOrderDigest: fixture.session.atomOrder.atomOrderDigest,
      cellDigest: fixture.session.cell.cellDigest,
    },
    channels: CHANNELS.map((channel) => ({
      channel,
      dtype: 'float64-le' as const,
      shape: [2_685, 3] as const,
      unit: UNITS[channel],
      sourceByteDigest: digestAtomisticInstancingFixtureBytesV046(fixture.raw[channel]),
      f64LeBytes: fixture.raw[channel].slice(),
    })) as unknown as AtomisticPresentationFrameInputV046['channels'],
  };
}

export function digestAtomisticInstancingFixtureBytesV046(bytes: Uint8Array) {
  return `sha256:${bytesToHex(sha256(bytes))}`;
}

function rawChannels(): RawChannels {
  return {
    positionsNanometer: positionF64LeBytes(),
    velocitiesNanometerPerPicosecond: repeatedF64LeBytes(0.375),
    potentialForcesKjMolNanometer: repeatedF64LeBytes(2.5),
  };
}

function positionF64LeBytes() {
  const bytes = new Uint8Array(ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045);
  const view = new DataView(bytes.buffer);
  for (let water = 0; water < 895; water += 1) {
    const component = water * 9;
    const x = 0.08 + (water % 10) * 0.28;
    const y = 0.08 + (Math.floor(water / 10) % 10) * 0.28;
    const z = 0.08 + Math.floor(water / 100) * 0.28;
    setF64(view, component, x, y, z);
    setF64(view, component + 3, x + 0.09572, y, z);
    setF64(view, component + 6, x - 0.031, y + 0.09056, z);
  }
  setF64(view, 0, 2.98, 0.2, 0.2);
  setF64(view, 3, 0.07572, 0.2, 0.2);
  setF64(view, 6, 2.949, 0.29056, 0.2);
  return bytes;
}

function setF64(view: DataView, component: number, x: number, y: number, z: number) {
  view.setFloat64(component * 8, x, true);
  view.setFloat64((component + 1) * 8, y, true);
  view.setFloat64((component + 2) * 8, z, true);
}

function repeatedF64LeBytes(seed: number) {
  const bytes = new Uint8Array(ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < ATOMISTIC_COMPONENT_COUNT_V045; index += 1) {
    view.setFloat64(index * 8, seed + (index % 97) / 100, true);
  }
  return bytes;
}

function worldSession(prefix: string, raw: RawChannels) {
  const frameLineage = lineage(prefix);
  const input: AtomisticWorldSessionInputV045 = {
    sessionId: `instancing-${prefix}`,
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
      prepareReceiptDigest: frameLineage.prepareReceiptDigest,
      prepareReceiptArtifactDigest: frameLineage.prepareReceiptArtifactDigest,
      serializedSystemDigest: frameLineage.serializedSystemDigest,
      portableProductionStartStateDigest: digest(`${prefix}-portable-start`),
    },
    verification: {
      schemaVersion: 'tf.openmm-tip3p-control-receipt/0.4.5',
      statusDomain: 'independent-scientific-assessment-not-release-provenance',
      status: 'verified-pass', systemDigest: ATOMISTIC_SYSTEM_DIGEST_V045,
      planDigest: ATOMISTIC_PLAN_DIGEST_V045, sourceRevision: frameLineage.sourceRevision,
      producerOutcomeDigest: frameLineage.producerOutcomeDigest,
      artifactManifestDigest: frameLineage.artifactManifestDigest,
      controlReceiptDigest: frameLineage.controlReceiptDigest,
      verifierDigest: frameLineage.verifierDigest,
      payloadBundleRoot: frameLineage.payloadBundleRoot,
      executionAuthenticityVerified: false, promotionEligible: false,
    },
    atomOrder: {
      authority: 'pdb-record-order', atomOrderDigest: frameLineage.atomOrderDigest,
      particleCount: 2_685,
      indexing: 'zero-based-render-index-maps-one-to-one-to-authoritative-order',
    },
    cell: {
      kind: 'orthorhombic-periodic-cell',
      vectorsNanometer: [
        { x: 3, y: 0, z: 0 }, { x: 0, y: 3, z: 0 }, { x: 0, y: 0, z: 3 },
      ],
      periodicAxes: [true, true, true], volumeNanometer3: 27,
      cellDigest: frameLineage.cellDigest,
    },
    topology: {
      topologyDigest: frameLineage.topologyDigest, particleCount: 2_685,
      topologyBondCount: 1_790, rigidDistanceConstraintCount: 2_685,
      topologyRole: 'identity-and-adjacency-not-dynamic-bond-order',
    },
    trajectory: {
      referenceARunReceiptDigest: frameLineage.referenceARunReceiptDigest,
      referenceARunArtifactDigest: frameLineage.referenceARunArtifactDigest,
      trajectoryDigest: frameLineage.trajectoryDigest,
      chunks: [createAtomisticTrajectoryChunkV045(chunkInput(frameLineage, raw))],
    },
  };
  return createAtomisticWorldSessionV045(input);
}

function lineage(prefix: string): AtomisticTrajectoryLineageV045 {
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

function chunkInput(lineageValue: AtomisticTrajectoryLineageV045, raw: RawChannels):
AtomisticTrajectoryChunkInputV045 {
  const channelDigests = Object.fromEntries(CHANNELS.map((channel) => [
    channel, digestAtomisticInstancingFixtureBytesV046(raw[channel]),
  ])) as Record<AtomisticBinaryChannelV045, string>;
  return {
    chunkId: 'reference-a-monolithic-trajectory', lineage: { ...lineageValue },
    firstFrameOrdinal: 0, sampleStrideSteps: 10, fixedTimeStepPicoseconds: 0.001,
    artifactManifestDescriptors: artifactDescriptors(),
    frames: Array.from({ length: 101 }, (_, ordinal) => {
      const step = ordinal * 10;
      const potentialKjMol = -100 + ordinal / 10;
      const kineticKjMol = 50 + ordinal / 20;
      return {
        step,
        timePicoseconds: step === 1_000 ? 1.0000000000000007 : step * 0.001,
        frameByteDigests: { ...channelDigests },
        energy: { potentialKjMol, kineticKjMol, totalKjMol: potentialKjMol + kineticKjMol },
      };
    }),
  };
}

function artifactDescriptors(): Record<
  AtomisticTrajectoryArtifactChannelV045,
  AtomisticManifestArrayDescriptorV045
> {
  return {
    positionsNanometer: descriptor('reference-a-positions', 'arrays/reference-a-positions.f64le',
      'float64-le', [101, 2_685, 3], 'nanometer', 6_508_440),
    velocitiesNanometerPerPicosecond: descriptor('reference-a-velocities',
      'arrays/reference-a-velocities.f64le', 'float64-le', [101, 2_685, 3],
      'nanometer-per-picosecond', 6_508_440),
    potentialForcesKjMolNanometer: descriptor('reference-a-potential-forces',
      'arrays/reference-a-potential-forces.f64le', 'float64-le', [101, 2_685, 3],
      'kilojoule-per-mole-per-nanometer', 6_508_440),
    sampleSteps: descriptor('reference-a-sample-steps', 'arrays/reference-a-sample-steps.u32le',
      'uint32-le', [101], 'step', 404),
    sampleTimes: descriptor('reference-a-sample-times', 'arrays/reference-a-sample-times.f64le',
      'float64-le', [101], 'picosecond', 808),
    energies: descriptor('reference-a-energies', 'arrays/reference-a-energies.f64le',
      'float64-le', [101, 3], 'kilojoule-per-mole', 2_424),
  };
}

function descriptor(id: string, path: string, dtype: 'float64-le' | 'uint32-le',
  shape: number[], unit: AtomisticManifestArrayDescriptorV045['unit'], sizeBytes: number):
AtomisticManifestArrayDescriptorV045 {
  return { id, path, kind: 'array', dtype, shape, unit, sizeBytes, sha256: digest(id) };
}

function digest(label: string) {
  return digestValue({ fixture: label });
}
