import 'server-only';

import { isProxy } from 'node:util/types';
import {
  buildPrivateBrowserTrajectoryClientV049,
} from './build-private-browser-trajectory-client-v049.mjs';
import {
  exportPrivateOpenMmPositionTrajectoryPacketV049,
} from './private-position-trajectory-export-v049.server.mjs';
import {
  PRIVATE_POSITION_TRAJECTORY_PACKET_MAX_BYTES_V049,
  PRIVATE_POSITION_TRAJECTORY_PACKET_MIN_BYTES_V049,
  startPrivatePositionTrajectoryLoopbackServerV049,
} from './private-position-trajectory-loopback-server-v049.mjs';

const EXPORT_KEYS = Object.freeze([
  'attestedArtifact',
  'cloudflareDistributionEligible',
  'energiesIncluded',
  'executionAuthenticityVerified',
  'forcesIncluded',
  'frameCount',
  'orderedPositionFrameDigest',
  'packetBytes',
  'packetDigest',
  'privateTrajectoryMetadataDigest',
  'promotionEligible',
  'protectedMainArtifact',
  'publicDistributionEligible',
  'publicPayload',
  'reproduced',
  'runtimeBoundary',
  'schemaVersion',
  'sourceArtifactF64BytesIncluded',
  'sourceHandleRevokedBeforeListen',
  'sourceLicenseForPublicDistributionVerified',
  'sourceOwnerRevocationReceipt',
  'status',
  'velocitiesIncluded',
  'positionTrajectoryDigest',
]);
const REVOCATION_KEYS = Object.freeze([
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
const BUILD_RESULT_KEYS = Object.freeze([
  'audit',
  'clientJavaScript',
  'indexHtmlTemplate',
]);
const BUILD_AUDIT_KEYS = Object.freeze([
  'clientByteLength',
  'clientSha256',
  'cloudflareDistributionEligible',
  'configFileLoaded',
  'nodeBuiltinsIncluded',
  'outputAssetCount',
  'outputChunkCount',
  'privateLoaderIncluded',
  'privateV048SourceIncluded',
  'publicDistributionEligible',
  'schemaVersion',
  'serverIncluded',
  'sourceMapsIncluded',
  'sourceModuleCount',
  'writeBundleHookInvoked',
  'writtenToFilesystem',
]);
const LOOPBACK_KEYS = Object.freeze([
  'close',
  'exactPacketByteLength',
  'lifecycle',
  'origin',
  'packetDigest',
  'schemaVersion',
  'url',
]);
const UINT8_ARRAY_FILL = Uint8Array.prototype.fill;
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype);
const TYPED_ARRAY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  'buffer',
)?.get;
const TYPED_ARRAY_BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  'byteLength',
)?.get;
const ARRAY_BUFFER_RESIZABLE_GETTER = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'resizable',
)?.get;
const DIGEST = /^sha256:(?!0{64}$)[0-9a-f]{64}$/;

/**
 * Revoke one exact V048 source into a sanitized V049 packet, build the
 * browser-only client in memory, then transfer that packet into one private
 * loopback listener. Reaching the listening state is not a browser or WebGL2
 * draw observation and does not authenticate the underlying solver execution.
 */
export async function startPrivateOpenMmWebGl2TrajectoryHarnessV049(materialization) {
  let packetBytes = null;
  let loopback = null;
  try {
    const exported = assertExactExport(
      exportPrivateOpenMmPositionTrajectoryPacketV049(materialization),
    );
    packetBytes = exported.packetBytes;
    const packetByteLength = intrinsicPacketByteLength(packetBytes);
    const sourceAudit = createSourceAudit(exported, packetByteLength);

    const client = assertExactClientBuild(
      await buildPrivateBrowserTrajectoryClientV049(),
    );
    loopback = await startPrivatePositionTrajectoryLoopbackServerV049({
      packetBytes,
      exactPacketByteLength: packetByteLength,
      indexHtmlTemplate: client.indexHtmlTemplate,
      clientJavaScript: client.clientJavaScript,
    });
    const transport = assertExactLoopback(loopback, exported.packetDigest, packetByteLength);
    assertPacketOwnershipTransferred(packetBytes, packetByteLength);

    return Object.freeze({
      schemaVersion: 'tf.private-openmm-webgl2-trajectory-harness-controller/0.4.9',
      status: 'loopback-listening-browser-trajectory-draw-not-yet-observed',
      url: transport.url,
      origin: transport.origin,
      sourceAudit,
      clientBuildAudit: client.audit,
      browserDrawObservedByController: false,
      publicDistributionEligible: false,
      cloudflareDistributionEligible: false,
      lifecycle() {
        return transport.lifecycle();
      },
      close() {
        return transport.close();
      },
    });
  } catch (error) {
    const cleanupFailures = [];
    if (packetBytes !== null) {
      try {
        UINT8_ARRAY_FILL.call(packetBytes, 0);
      } catch (cleanupError) {
        cleanupFailures.push(cleanupError);
      }
    }
    if (loopback !== null && typeof loopback.close === 'function') {
      try {
        await loopback.close();
      } catch (cleanupError) {
        cleanupFailures.push(cleanupError);
      }
    }
    if (cleanupFailures.length > 0) {
      throw new AggregateError(
        [error, ...cleanupFailures],
        'private OpenMM trajectory harness failed and cleanup did not complete',
        { cause: error },
      );
    }
    throw error;
  }
}

function assertExactExport(value) {
  const exported = snapshotExactFrozenRecord(
    value,
    EXPORT_KEYS,
    'private OpenMM trajectory export',
  );
  if (exported.schemaVersion
      !== 'tf.private-openmm-position-trajectory-packet-export/0.4.9'
    || exported.status
      !== 'private-position-trajectory-packet-ready-source-capability-revoked'
    || exported.runtimeBoundary !== 'node-server-only-before-ephemeral-loopback-listen'
    || exported.frameCount !== 101
    || exported.sourceHandleRevokedBeforeListen !== true
    || exported.sourceArtifactF64BytesIncluded !== false
    || exported.velocitiesIncluded !== false
    || exported.forcesIncluded !== false
    || exported.energiesIncluded !== false
    || exported.executionAuthenticityVerified !== false
    || exported.reproduced !== false
    || exported.protectedMainArtifact !== false
    || exported.attestedArtifact !== false
    || exported.sourceLicenseForPublicDistributionVerified !== false
    || exported.promotionEligible !== false
    || exported.publicDistributionEligible !== false
    || exported.cloudflareDistributionEligible !== false
    || exported.publicPayload !== null) {
    throw new Error('private OpenMM trajectory export boundary changed');
  }
  for (const digest of [
    exported.packetDigest,
    exported.privateTrajectoryMetadataDigest,
    exported.positionTrajectoryDigest,
    exported.orderedPositionFrameDigest,
  ]) assertDigest(digest, 'private OpenMM trajectory export digest');
  assertExactRevocationReceipt(exported.sourceOwnerRevocationReceipt);
  return exported;
}

function assertExactRevocationReceipt(value) {
  const receipt = snapshotExactFrozenRecord(
    value,
    REVOCATION_KEYS,
    'private OpenMM trajectory source revocation receipt',
  );
  if (receipt.schemaVersion
      !== 'tf.atomistic-private-position-trajectory-revocation/0.4.8'
    || receipt.status !== 'revoked'
    || receipt.frameCountZeroFilled !== 101
    || receipt.positionByteLengthZeroFilled !== 3_254_220
    || receipt.internalReferenceCleared !== true
    || receipt.previouslyIssuedCopiesRevoked !== false
    || receipt.runtimeOrGpuCopiesRevoked !== false
    || receipt.securePhysicalErasureVerified !== false) {
    throw new Error('private OpenMM trajectory source revocation receipt changed');
  }
  assertDigest(receipt.metadataDigest, 'private OpenMM trajectory source metadata digest');
}

function assertExactClientBuild(value) {
  const client = snapshotExactFrozenRecord(
    value,
    BUILD_RESULT_KEYS,
    'private trajectory client build',
  );
  const audit = snapshotExactFrozenRecord(
    client.audit,
    BUILD_AUDIT_KEYS,
    'private trajectory client build audit',
  );
  if (audit.schemaVersion !== 'tf.private-browser-trajectory-client-build-audit/0.4.9'
    || audit.configFileLoaded !== false
    || audit.writtenToFilesystem !== false
    || audit.outputChunkCount !== 1
    || audit.outputAssetCount !== 0
    || !Number.isSafeInteger(audit.sourceModuleCount)
    || audit.sourceModuleCount < 1
    || !Number.isSafeInteger(audit.clientByteLength)
    || audit.clientByteLength < 1
    || audit.clientByteLength > 2 * 1024 * 1024
    || audit.sourceMapsIncluded !== false
    || audit.writeBundleHookInvoked !== false
    || audit.nodeBuiltinsIncluded !== false
    || audit.privateV048SourceIncluded !== false
    || audit.privateLoaderIncluded !== false
    || audit.serverIncluded !== false
    || audit.publicDistributionEligible !== false
    || audit.cloudflareDistributionEligible !== false) {
    throw new Error('private trajectory client build audit changed');
  }
  assertDigest(audit.clientSha256, 'private trajectory client build digest');
  if (typeof client.indexHtmlTemplate !== 'string'
    || countOccurrences(client.indexHtmlTemplate, '__TF_PRIVATE_CSP_NONCE__') < 2
    || !client.indexHtmlTemplate.includes('src="/client.js"')
    || typeof client.clientJavaScript !== 'string'
    || Buffer.byteLength(client.clientJavaScript, 'utf8') !== audit.clientByteLength) {
    throw new Error('private trajectory client build output changed');
  }
  return Object.freeze({
    indexHtmlTemplate: client.indexHtmlTemplate,
    clientJavaScript: client.clientJavaScript,
    audit,
  });
}

function assertExactLoopback(value, expectedPacketDigest, expectedPacketByteLength) {
  const transport = snapshotExactFrozenRecord(
    value,
    LOOPBACK_KEYS,
    'private trajectory loopback transport',
  );
  if (transport.schemaVersion !== 'tf.private-position-trajectory-loopback-server/0.4.9'
    || transport.packetDigest !== expectedPacketDigest
    || transport.exactPacketByteLength !== expectedPacketByteLength
    || typeof transport.origin !== 'string'
    || !/^http:\/\/127\.0\.0\.1:\d+$/.test(transport.origin)
    || typeof transport.url !== 'string'
    || new URL(transport.url).origin !== transport.origin
    || !/^#token=[0-9a-f]{64}$/.test(new URL(transport.url).hash)
    || typeof transport.lifecycle !== 'function'
    || typeof transport.close !== 'function') {
    throw new Error('private trajectory loopback transport boundary changed');
  }
  return transport;
}

function createSourceAudit(exported, packetByteLength) {
  return Object.freeze({
    schemaVersion: 'tf.private-openmm-webgl2-trajectory-source-audit/0.4.9',
    status: 'source-capability-revoked-before-private-loopback-listen',
    packetDigest: exported.packetDigest,
    packetByteLength,
    privateTrajectoryMetadataDigest: exported.privateTrajectoryMetadataDigest,
    positionTrajectoryDigest: exported.positionTrajectoryDigest,
    orderedPositionFrameDigest: exported.orderedPositionFrameDigest,
    frameCount: 101,
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
  });
}

function intrinsicPacketByteLength(value) {
  if (value === null || typeof value !== 'object' || isProxy(value)
    || Object.getPrototypeOf(value) !== Uint8Array.prototype) {
    throw new TypeError('private OpenMM trajectory export packet must be intrinsic bytes');
  }
  let buffer;
  let byteLength;
  let resizable = false;
  try {
    buffer = TYPED_ARRAY_BUFFER_GETTER?.call(value);
    byteLength = TYPED_ARRAY_BYTE_LENGTH_GETTER?.call(value);
    if (Object.getPrototypeOf(buffer) === ArrayBuffer.prototype
      && typeof ARRAY_BUFFER_RESIZABLE_GETTER === 'function') {
      resizable = ARRAY_BUFFER_RESIZABLE_GETTER.call(buffer) === true;
    }
    void new DataView(buffer, 0, 0);
  } catch (error) {
    throw new TypeError('private OpenMM trajectory export packet storage is unreadable', {
      cause: error,
    });
  }
  if (Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype || resizable
    || !Number.isSafeInteger(byteLength)
    || byteLength < PRIVATE_POSITION_TRAJECTORY_PACKET_MIN_BYTES_V049
    || byteLength > PRIVATE_POSITION_TRAJECTORY_PACKET_MAX_BYTES_V049) {
    throw new TypeError('private OpenMM trajectory export packet storage changed');
  }
  return byteLength;
}

function assertPacketOwnershipTransferred(packetBytes, expectedPacketByteLength) {
  if (intrinsicPacketByteLength(packetBytes) !== expectedPacketByteLength) {
    throw new Error('private trajectory transferred packet owner changed its byte length');
  }
  for (let index = 0; index < expectedPacketByteLength; index += 1) {
    if (packetBytes[index] !== 0) {
      throw new Error('private trajectory loopback did not zero the transferred packet owner');
    }
  }
}

function snapshotExactFrozenRecord(value, expectedKeys, label) {
  if (value === null || typeof value !== 'object' || isProxy(value)
    || Object.getPrototypeOf(value) !== Object.prototype || !Object.isFrozen(value)) {
    throw new TypeError(`${label} must be one frozen plain non-Proxy record`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== 'string')) {
    throw new TypeError(`${label} must contain only string keys`);
  }
  const actual = keys.sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} must contain exactly the locked keys`);
  }
  const snapshot = Object.create(null);
  for (const key of actual) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
      throw new TypeError(`${label}.${key} must be one enumerable defined data property`);
    }
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot);
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new Error(`${label} is invalid`);
  }
}

function countOccurrences(value, needle) {
  let count = 0;
  let offset = 0;
  while ((offset = value.indexOf(needle, offset)) !== -1) {
    count += 1;
    offset += needle.length;
  }
  return count;
}
