import 'server-only';

import { digestValue } from './digest.ts';
import {
  assertAtomisticPrivatePositionTrajectoryMetadataV048,
  type AtomisticPrivatePositionTrajectoryMetadataV048,
} from './atomistic-private-position-trajectory-v048.ts';
import {
  ATOMISTIC_PRIVATE_BROWSER_POSITION_TRAJECTORY_VERSION_V049,
  assertAtomisticPrivateBrowserPositionTrajectoryMetadataV049,
  createAtomisticPrivateBrowserOrderedPositionFrameDigestV049,
  createAtomisticPrivateBrowserPositionFrameDigestV049,
  type AtomisticPrivateBrowserPositionTrajectoryFrameV049,
} from './atomistic-private-browser-position-trajectory-v049.ts';

/** Project exact V048 server metadata into the strict browser allowlist. */
export function createAtomisticPrivateBrowserPositionTrajectoryMetadataV049(
  sourceInput: AtomisticPrivatePositionTrajectoryMetadataV048,
) {
  const source = assertAtomisticPrivatePositionTrajectoryMetadataV048(sourceInput);
  const binding = Object.freeze({
    sourceTrajectoryMetadataDigest: source.metadataDigest,
    sessionDigest: source.binding.sessionDigest,
    trajectoryDigest: source.binding.trajectoryDigest,
    atomOrderDigest: source.binding.atomOrderDigest,
    cellDigest: source.binding.cellDigest,
    topologyDigest: source.binding.topologyDigest,
  });
  const frames = Object.freeze(source.sequence.frames.map((sourceFrame) => {
    const framePayload = {
      frameOrdinal: sourceFrame.frameOrdinal,
      step: sourceFrame.step,
      timePicoseconds: sourceFrame.timePicoseconds,
      sourceFrameDigest: sourceFrame.sourceFrameDigest,
      positionsDerivedF32Digest: sourceFrame.derivedPositionsF32Digest,
      byteOffset: sourceFrame.derivedByteOffset,
      byteLength: 32_220 as const,
    };
    return Object.freeze({
      ...framePayload,
      positionFrameDigest: createAtomisticPrivateBrowserPositionFrameDigestV049(
        binding,
        framePayload,
      ),
    });
  })) as ReadonlyArray<AtomisticPrivateBrowserPositionTrajectoryFrameV049>;
  const payload = {
    schemaVersion: ATOMISTIC_PRIVATE_BROWSER_POSITION_TRAJECTORY_VERSION_V049,
    status: 'sanitized-private-101-frame-position-trajectory-execution-unattested' as const,
    sourceSchemaVersion: 'tf.atomistic-private-position-trajectory/0.4.8' as const,
    binding,
    inventory: {
      waterMoleculeCount: 895 as const,
      particleCount: 2_685 as const,
      oxygenCount: 895 as const,
      hydrogenCount: 1_790 as const,
      topologyLinkCount: 1_790 as const,
      frameCount: 101 as const,
    },
    cell: {
      kind: 'locked-three-nanometer-orthorhombic-periodic-cell' as const,
      vectorsNanometer: [[3, 0, 0], [0, 3, 0], [0, 0, 3]] as const,
      periodicAxes: [true, true, true] as const,
      coordinateGauge:
        'source-unwrapped-oxygen-anchor-with-cubic-minimum-image-internal-sites' as const,
    },
    sequence: {
      firstFrameOrdinal: 0 as const,
      lastFrameOrdinal: 100 as const,
      sampleStrideSteps: 10 as const,
      sampleIntervalPicoseconds: 0.01 as const,
      frameByteLength: 32_220 as const,
      trajectoryByteLength: 3_254_220 as const,
      orderedPositionFrameDigest:
        createAtomisticPrivateBrowserOrderedPositionFrameDigestV049(frames),
      frames,
    },
    positionChannel: {
      channel: 'positionsNanometer' as const,
      unit: 'nanometer' as const,
      dtype: 'float32-le' as const,
      encoding: 'ieee754-float32-little-endian' as const,
      shape: [101, 2_685, 3] as const,
      componentCount: 813_555 as const,
      byteLength: 3_254_220 as const,
      sha256: source.sequence.derivedPositionsF32TrajectoryDigest,
    },
    scientificBoundary: {
      sourceEvidenceClass:
        'digest-bound-derived-position-frames-execution-origin-unattested' as const,
      rawPayloadChannelsIncluded: ['positionsNanometer'] as const,
      rawPayloadChannelsOmitted: [
        'velocitiesNanometerPerPicosecond',
        'potentialForcesKjMolNanometer',
        'energies',
      ] as const,
      topologyLinkMeaning:
        'adjacency-and-rigid-constraint-not-energetic-bond-or-bond-order' as const,
      completePhysicalStateIncluded: false as const,
      solverFrameOriginVerified: false as const,
      createsSolverFrames: false as const,
      interpolationApplied: false as const,
      extrapolationApplied: false as const,
      motionSynthesizedByThisAdapter: false as const,
      repeatedDrawCreatesTrajectoryFrame: false as const,
      executionAuthenticityVerified: false as const,
      reproduced: false as const,
      protectedMainArtifact: false as const,
      attestedArtifact: false as const,
      sourceLicenseForPublicDistributionVerified: false as const,
      promotionEligible: false as const,
      publicDistributionEligible: false as const,
      cloudflareDistributionEligible: false as const,
    },
  };
  return assertAtomisticPrivateBrowserPositionTrajectoryMetadataV049({
    ...payload,
    metadataDigest: digestValue(payload),
  });
}
