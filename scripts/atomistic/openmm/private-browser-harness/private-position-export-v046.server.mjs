import 'server-only';

import {
  getOpenMmTip3pPresentationFrameHandleV046,
  revokeOpenMmTip3pPresentationFrameV046,
} from '../../../../lib/simulation/openmm-world-session-loader-implementation.server.mjs';
import {
  encodePrivatePositionPacketV047,
  privatePositionPacketDigestV047,
} from './private-position-envelope-v046.mjs';
import {
  createAtomisticPrivatePositionFrameMetadataV047,
} from '../../../../lib/simulation/atomistic-private-position-frame-v047.ts';
import {
  getAtomisticWorldSessionFrameV045,
} from '../../../../lib/simulation/atomistic-world-session.ts';

/**
 * Move one exact OpenMM presentation position frame into a test-only packet.
 *
 * The materialization object is an identity-bound server capability. This
 * function copies only its F32 positions derivative, creates one owned packet,
 * then revokes the source controller before returning. It never returns the
 * materialization, handle, raw F64 channels, filesystem paths, or a release
 * eligibility claim.
 */
export function exportPrivateOpenMmPositionPacketV047(materialization) {
  assertPrivateMaterializationBoundary(materialization);

  let positionsBytes = null;
  let packetBytes = null;
  let privateFrameMetadata = null;
  let operationFailure = null;
  let revocationReceipt = null;
  let revocationFailure = null;

  try {
    const handle = getOpenMmTip3pPresentationFrameHandleV046(materialization);
    if (handle.metadata !== materialization.presentationFrameMetadata) {
      throw new Error('private position export metadata identity changed');
    }
    positionsBytes = handle.copyChannelBytes('positionsNanometer');
    const session = materialization.worldSessionMaterialization.session;
    const frame = getAtomisticWorldSessionFrameV045(
      session,
      handle.metadata.binding.frameOrdinal,
    );
    privateFrameMetadata = createAtomisticPrivatePositionFrameMetadataV047({
      sessionId: session.sessionId,
      sessionDigest: session.sessionDigest,
      trajectoryDigest: session.trajectory.trajectoryDigest,
      frameOrdinal: frame.frameOrdinal,
      frameDigest: frame.frameDigest,
      atomOrderDigest: frame.lineage.atomOrderDigest,
      cellDigest: frame.lineage.cellDigest,
      topologyDigest: frame.lineage.topologyDigest,
      step: frame.step,
      timePicoseconds: frame.timePicoseconds,
      positionsDerivedF32Digest:
        handle.metadata.channels.positionsNanometer.derived.sha256,
    });
    packetBytes = encodePrivatePositionPacketV047({
      frameMetadata: privateFrameMetadata,
      positionsBytes,
    });
  } catch (error) {
    operationFailure = error;
  } finally {
    if (positionsBytes !== null) Uint8Array.prototype.fill.call(positionsBytes, 0);
    try {
      revocationReceipt = revokeOpenMmTip3pPresentationFrameV046(materialization);
    } catch (error) {
      revocationFailure = error;
    }
  }

  if (operationFailure !== null && revocationFailure !== null) {
    if (packetBytes !== null) Uint8Array.prototype.fill.call(packetBytes, 0);
    throw new AggregateError(
      [operationFailure, revocationFailure],
      'private position export failed and source capability revocation also failed',
      { cause: operationFailure },
    );
  }
  if (operationFailure !== null) {
    if (packetBytes !== null) Uint8Array.prototype.fill.call(packetBytes, 0);
    throw operationFailure;
  }
  if (revocationFailure !== null) {
    if (packetBytes !== null) Uint8Array.prototype.fill.call(packetBytes, 0);
    throw new Error('private position export source capability revocation failed', {
      cause: revocationFailure,
    });
  }
  if (packetBytes === null || privateFrameMetadata === null || revocationReceipt === null) {
    throw new Error('private position export did not produce one revoked packet');
  }

  const metadata = materialization.presentationFrameMetadata;
  return Object.freeze({
    schemaVersion: 'tf.private-openmm-position-packet-export/0.4.7',
    status: 'private-position-packet-ready-source-capability-revoked',
    runtimeBoundary: 'node-server-only-before-ephemeral-loopback-listen',
    packetBytes,
    packetDigest: privatePositionPacketDigestV047(packetBytes),
    frameOrdinal: metadata.binding.frameOrdinal,
    sourceFrameDigest: metadata.binding.frameDigest,
    presentationFrameDigest: metadata.presentationFrameDigest,
    privateFrameMetadataDigest: privateFrameMetadata.metadataDigest,
    positionsDerivedF32Digest: metadata.channels.positionsNanometer.derived.sha256,
    sourceOwnerRevocationReceipt: revocationReceipt,
    sourceHandleRevokedBeforeListen: true,
    sourceArtifactF64BytesIncluded: false,
    velocitiesIncluded: false,
    forcesIncluded: false,
    executionAuthenticityVerified: false,
    reproduced: false,
    protectedMainArtifact: false,
    attestedArtifact: false,
    sourceLicenseForPublicDistributionVerified: false,
    promotionEligible: false,
    publicDistributionEligible: false,
    cloudflareDistributionEligible: false,
    publicPayload: null,
  });
}

function assertPrivateMaterializationBoundary(materialization) {
  if (materialization === null || typeof materialization !== 'object') {
    throw new TypeError('private position export requires an OpenMM materialization object');
  }
  if (materialization.schemaVersion
      !== 'tf.openmm-tip3p-private-presentation-frame-materialization/0.4.6'
    || materialization.runtimeBoundary !== 'node-server-only-private-artifact-filesystem'
    || materialization.sourceArtifactF64BytesReachableFromReturn !== false
    || materialization.serializedBinaryPayloadExposed !== false
    || materialization.explicitPrivateDerivedF32OwnerRevocationSupported !== true
    || materialization.executionAuthenticityVerified !== false
    || materialization.reproduced !== false
    || materialization.protectedMainArtifact !== false
    || materialization.attestedArtifact !== false
    || materialization.sourceLicenseForPublicDistributionVerified !== false
    || materialization.promotionEligible !== false
    || materialization.publicDistributionEligible !== false
    || materialization.cloudflareDistributionEligible !== false
    || materialization.publicPayload !== null) {
    throw new Error('private position export materialization boundary changed');
  }
}
