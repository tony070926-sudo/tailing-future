import {
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  getOpenMmTip3pPresentationFrameHandleV046,
  loadOpenMmTip3pPresentationFrameV046,
  revokeOpenMmTip3pPresentationFrameV046,
} from '../../../../lib/simulation/openmm-world-session-loader-implementation.server.mjs';
import { canonicalJson } from '../../runtime-input-contract.mjs';
import {
  SOURCE_REVISION,
  makeProducerDirectory,
  verifyDirectory,
} from '../openmm-tip3p-producer-directory-fixture.test-support.mjs';
import {
  decodePrivatePositionPacketV047,
} from './private-position-envelope-v046.mjs';
import {
  exportPrivateOpenMmPositionPacketV047,
} from './private-position-export-v046.server.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('V047 sanitized private OpenMM position packet export', () => {
  it('exports only the digest-bound positions derivative and revokes before listen', async () => {
    const producer = makeProducerDirectory();
    temporaryRoots.push(producer.root);
    const receipt = await verifyDirectory(producer.root);
    const receiptRoot = realpathSync(mkdtempSync(path.join(
      tmpdir(),
      'tf-private-position-export-receipt-',
    )));
    temporaryRoots.push(receiptRoot);
    const receiptPath = path.join(receiptRoot, 'independent-control-receipt.json');
    writeFileSync(receiptPath, `${canonicalJson(receipt)}\n`, {
      encoding: 'ascii',
      flag: 'wx',
    });

    const materialization = await loadOpenMmTip3pPresentationFrameV046({
      artifactRoot: producer.root,
      independentControlReceiptPath: receiptPath,
      expectedSourceRevision: SOURCE_REVISION,
      sessionId: 'private-browser-position-export-v046',
      frameOrdinal: 37,
    });
    const exported = exportPrivateOpenMmPositionPacketV047(materialization);
    const decoded = decodePrivatePositionPacketV047(exported.packetBytes);

    expect(exported).toMatchObject({
      schemaVersion: 'tf.private-openmm-position-packet-export/0.4.7',
      status: 'private-position-packet-ready-source-capability-revoked',
      runtimeBoundary: 'node-server-only-before-ephemeral-loopback-listen',
      frameOrdinal: 37,
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
    expect(Object.keys(decoded)).toEqual(['frameMetadata', 'positionsBytes']);
    expect(decoded.frameMetadata.binding).toMatchObject({
      sessionId: materialization.worldSessionMaterialization.session.sessionId,
      sessionDigest: materialization.worldSessionMaterialization.session.sessionDigest,
      trajectoryDigest:
        materialization.worldSessionMaterialization.session.trajectory.trajectoryDigest,
      frameOrdinal: 37,
      frameDigest: exported.sourceFrameDigest,
      positionsDerivedF32Digest: exported.positionsDerivedF32Digest,
    });
    expect(decoded.frameMetadata.positionChannel.sha256)
      .toBe(exported.positionsDerivedF32Digest);
    expect(decoded.frameMetadata.metadataDigest).toBe(exported.privateFrameMetadataDigest);
    expect(decoded.positionsBytes).toHaveLength(32_220);
    expect(exported.packetDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(exported.sourceOwnerRevocationReceipt).toMatchObject({
      status: 'revoked',
      presentationFrameDigest: exported.presentationFrameDigest,
      securePhysicalErasureVerified: false,
    });
    expect(() => getOpenMmTip3pPresentationFrameHandleV046(materialization))
      .toThrow(/revoked/);
    expect(revokeOpenMmTip3pPresentationFrameV046(materialization))
      .toBe(exported.sourceOwnerRevocationReceipt);

    const packetMetadataText = JSON.stringify(decoded.frameMetadata);
    for (const forbidden of [
      producer.root,
      receiptPath,
      SOURCE_REVISION,
      'payloadBundleRoot',
      'independentControlReceiptPath',
      'sourceArtifactPath',
      'sourceRevision',
      'arrays/reference-a-',
      'conversionReceipt',
    ]) expect(packetMetadataText).not.toContain(forbidden);

    decoded.positionsBytes.fill(0);
    exported.packetBytes.fill(0);
  }, 120_000);
});
