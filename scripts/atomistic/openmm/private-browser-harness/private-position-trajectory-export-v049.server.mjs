import 'server-only';

import { isProxy } from 'node:util/types';

import {
  getOpenMmTip3pPrivatePositionTrajectoryHandleV048,
  revokeOpenMmTip3pPrivatePositionTrajectoryV048,
} from '../../../../lib/simulation/openmm-world-session-loader-implementation.server.mjs';
import {
  createAtomisticPrivateBrowserPositionTrajectoryMetadataV049,
} from '../../../../lib/simulation/atomistic-private-browser-position-trajectory-v049-projector.server.ts';
import {
  encodePrivatePositionTrajectoryPacketV049,
  privatePositionTrajectoryPacketDigestV049,
} from './private-position-trajectory-envelope-v049.mjs';

const UINT8_ARRAY_FILL = Uint8Array.prototype.fill;
const REVOCATION_RECEIPT_KEYS = Object.freeze([
  'frameCountZeroFilled',
  'internalReferenceCleared',
  'metadataDigest',
  'positionByteLengthZeroFilled',
  'previouslyIssuedCopiesRevoked',
  'runtimeOrGpuCopiesRevoked',
  'schemaVersion',
  'securePhysicalErasureVerified',
  'status',
]);

/**
 * Export the exact private V048 positions capability into one sanitized V049
 * browser packet. The source capability is revoked before this function can
 * return, so callers can only move the already-sanitized packet into an
 * ephemeral loopback transport.
 */
export function exportPrivateOpenMmPositionTrajectoryPacketV049(materialization) {
  let handle = null;
  let positionsBytes = null;
  let packetBytes = null;
  let packetDigest = null;
  let trajectoryMetadata = null;
  let sourceMetadataDigest = null;
  let operationFailure = null;
  let positionZeroizationFailure = null;
  let revocationReceipt = null;
  let revocationFailure = null;

  try {
    handle = getOpenMmTip3pPrivatePositionTrajectoryHandleV048(materialization);
    assertPrivateTrajectoryMaterializationBoundary(materialization);
    if (handle.metadata !== materialization.positionTrajectoryMetadata) {
      throw new Error('private trajectory export metadata identity changed');
    }
    sourceMetadataDigest = handle.metadata.metadataDigest;
    trajectoryMetadata = createAtomisticPrivateBrowserPositionTrajectoryMetadataV049(
      handle.metadata,
    );
    positionsBytes = handle.copyTrajectoryPositionBytes();
    packetBytes = encodePrivatePositionTrajectoryPacketV049({
      trajectoryMetadata,
      positionsBytes,
    });
    packetDigest = privatePositionTrajectoryPacketDigestV049(packetBytes);
  } catch (error) {
    operationFailure = error;
  } finally {
    if (positionsBytes !== null) {
      try {
        UINT8_ARRAY_FILL.call(positionsBytes, 0);
      } catch (error) {
        positionZeroizationFailure = error;
      }
    }
    positionsBytes = null;
    try {
      revocationReceipt = revokeOpenMmTip3pPrivatePositionTrajectoryV048(materialization);
    } catch (error) {
      revocationFailure = error;
    }
  }

  const failures = [
    operationFailure,
    positionZeroizationFailure,
    revocationFailure,
  ].filter((failure) => failure !== null);
  if (failures.length > 0) {
    try {
      zeroPacket(packetBytes);
    } catch (error) {
      failures.push(error);
    }
    if (failures.length === 1) throw failures[0];
    throw new AggregateError(
      failures,
      operationFailure !== null && revocationFailure !== null
        ? 'private trajectory export failed and source capability revocation also failed'
        : 'private trajectory export failed or cleanup did not complete',
      { cause: operationFailure ?? failures[0] },
    );
  }
  if (packetBytes === null || packetDigest === null
    || trajectoryMetadata === null || sourceMetadataDigest === null
    || revocationReceipt === null || handle === null) {
    zeroPacket(packetBytes);
    throw new Error('private trajectory export did not produce one revoked packet');
  }
  try {
    assertRevokedSource(handle, revocationReceipt, sourceMetadataDigest);
    if (!/^sha256:[0-9a-f]{64}$/.test(packetDigest)) {
      throw new Error('private trajectory export packet digest is invalid');
    }
  } catch (error) {
    zeroPacket(packetBytes);
    throw error;
  }

  return Object.freeze({
    schemaVersion: 'tf.private-openmm-position-trajectory-packet-export/0.4.9',
    status: 'private-position-trajectory-packet-ready-source-capability-revoked',
    runtimeBoundary: 'node-server-only-before-ephemeral-loopback-listen',
    packetBytes,
    packetDigest,
    privateTrajectoryMetadataDigest: trajectoryMetadata.metadataDigest,
    positionTrajectoryDigest: trajectoryMetadata.positionChannel.sha256,
    orderedPositionFrameDigest: trajectoryMetadata.sequence.orderedPositionFrameDigest,
    frameCount: 101,
    sourceOwnerRevocationReceipt: revocationReceipt,
    sourceHandleRevokedBeforeListen: true,
    sourceArtifactF64BytesIncluded: false,
    velocitiesIncluded: false,
    forcesIncluded: false,
    energiesIncluded: false,
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

function assertPrivateTrajectoryMaterializationBoundary(materialization) {
  if (materialization === null || typeof materialization !== 'object'
    || isProxy(materialization) || Object.getPrototypeOf(materialization) !== Object.prototype) {
    throw new TypeError('private trajectory export requires an OpenMM materialization object');
  }
  if (materialization.schemaVersion
      !== 'tf.openmm-tip3p-private-position-trajectory-materialization/0.4.8'
    || materialization.runtimeBoundary !== 'node-server-only-private-artifact-filesystem'
    || materialization.sourceArtifactF64BytesReachableFromReturn !== false
    || materialization.serializedBinaryPayloadExposed !== false
    || materialization.privateDerivedF32BytesRetainedUntilOwnerRevocationOrCapabilityGc !== true
    || materialization.explicitPrivateDerivedF32OwnerRevocationSupported !== true
    || materialization.singleStableArtifactSnapshot !== true
    || materialization.positionsOnlyDerivative !== true
    || materialization.executionAuthenticityVerified !== false
    || materialization.reproduced !== false
    || materialization.protectedMainArtifact !== false
    || materialization.attestedArtifact !== false
    || materialization.sourceLicenseForPublicDistributionVerified !== false
    || materialization.promotionEligible !== false
    || materialization.publicDistributionEligible !== false
    || materialization.cloudflareDistributionEligible !== false
    || materialization.publicPayload !== null) {
    throw new Error('private trajectory export materialization boundary changed');
  }
}

function zeroPacket(packetBytes) {
  if (packetBytes instanceof Uint8Array) UINT8_ARRAY_FILL.call(packetBytes, 0);
}

function assertRevokedSource(handle, receipt, sourceMetadataDigest) {
  if (handle.isRevoked() !== true) {
    throw new Error('private trajectory export source handle was not revoked');
  }
  if (receipt === null || typeof receipt !== 'object' || isProxy(receipt)
    || Object.getPrototypeOf(receipt) !== Object.prototype || !Object.isFrozen(receipt)) {
    throw new Error('private trajectory export source revocation receipt is invalid');
  }
  const descriptors = Object.getOwnPropertyDescriptors(receipt);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== 'string')
    || keys.length !== REVOCATION_RECEIPT_KEYS.length
    || keys.sort().some((key, index) => key !== REVOCATION_RECEIPT_KEYS[index])) {
    throw new Error('private trajectory export source revocation receipt keys changed');
  }
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !('value' in descriptor)) {
      throw new Error('private trajectory export source revocation receipt must use data fields');
    }
  }
  if (descriptors.schemaVersion.value
      !== 'tf.atomistic-private-position-trajectory-revocation/0.4.8'
    || descriptors.status.value !== 'revoked'
    || descriptors.metadataDigest.value !== sourceMetadataDigest
    || descriptors.frameCountZeroFilled.value !== 101
    || descriptors.positionByteLengthZeroFilled.value !== 3_254_220
    || descriptors.internalReferenceCleared.value !== true
    || descriptors.previouslyIssuedCopiesRevoked.value !== false
    || descriptors.runtimeOrGpuCopiesRevoked.value !== false
    || descriptors.securePhysicalErasureVerified.value !== false) {
    throw new Error('private trajectory export source revocation receipt claims changed');
  }
}
