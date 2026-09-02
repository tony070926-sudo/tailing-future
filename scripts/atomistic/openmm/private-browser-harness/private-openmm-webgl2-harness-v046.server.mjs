import 'server-only';

import {
  buildPrivateBrowserClientV047,
} from './build-private-browser-client-v046.mjs';
import {
  exportPrivateOpenMmPositionPacketV047,
} from './private-position-export-v046.server.mjs';
import {
  startPrivatePositionLoopbackServerV047,
} from './private-position-loopback-server-v046.mjs';

/**
 * Compose the exact-object OpenMM export, isolated browser bundle, and one-time
 * loopback server. Starting this controller is not evidence that a browser or
 * a WebGL draw has occurred; the client emits that observation only after its
 * own runtime checks pass.
 */
export async function startPrivateOpenMmWebGl2HarnessV047(materialization) {
  const exported = exportPrivateOpenMmPositionPacketV047(materialization);
  let loopback = null;
  try {
    const client = await buildPrivateBrowserClientV047();
    loopback = await startPrivatePositionLoopbackServerV047({
      packetBytes: exported.packetBytes,
      indexHtmlTemplate: client.indexHtmlTemplate,
      clientJavaScript: client.clientJavaScript,
    });
    const sourceAudit = Object.freeze({
      schemaVersion: exported.schemaVersion,
      status: exported.status,
      packetDigest: exported.packetDigest,
      frameOrdinal: exported.frameOrdinal,
      sourceFrameDigest: exported.sourceFrameDigest,
      presentationFrameDigest: exported.presentationFrameDigest,
      privateFrameMetadataDigest: exported.privateFrameMetadataDigest,
      positionsDerivedF32Digest: exported.positionsDerivedF32Digest,
      sourceHandleRevokedBeforeListen: exported.sourceHandleRevokedBeforeListen,
      sourceOwnerRevocationReceipt: exported.sourceOwnerRevocationReceipt,
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
    return Object.freeze({
      schemaVersion: 'tf.private-openmm-webgl2-harness-controller/0.4.7',
      status: 'loopback-listening-browser-draw-not-yet-observed',
      url: loopback.url,
      origin: loopback.origin,
      sourceAudit,
      clientBuildAudit: client.audit,
      browserDrawObservedByController: false,
      publicDistributionEligible: false,
      cloudflareDistributionEligible: false,
      lifecycle() {
        return loopback.lifecycle();
      },
      close() {
        return loopback.close();
      },
    });
  } catch (error) {
    exported.packetBytes.fill(0);
    if (loopback !== null) await loopback.close();
    throw error;
  }
}
