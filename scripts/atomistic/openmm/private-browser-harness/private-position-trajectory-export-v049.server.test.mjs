import { createHash } from 'node:crypto';
import {
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  afterEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  getOpenMmTip3pPrivatePositionTrajectoryHandleV048,
  loadOpenMmTip3pPrivatePositionTrajectoryV048,
  revokeOpenMmTip3pPrivatePositionTrajectoryV048,
} from '../../../../lib/simulation/openmm-world-session-loader-implementation.server.mjs';
import { canonicalJson } from '../../runtime-input-contract.mjs';
import {
  SOURCE_REVISION,
  makeProducerDirectory,
  verifyDirectory,
} from '../openmm-tip3p-producer-directory-fixture.test-support.mjs';
import {
  decodePrivatePositionTrajectoryPacketV049,
  privatePositionTrajectoryPacketDigestV049,
} from './private-position-trajectory-envelope-v049.mjs';
import {
  exportPrivateOpenMmPositionTrajectoryPacketV049,
} from './private-position-trajectory-export-v049.server.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('V049 exact V048 capability to sanitized private-browser trajectory export', () => {
  it('exports one positions-only packet and revokes the synthetic V048 source before return', async () => {
    const fixture = makeProducerDirectory({
      positionLayout: 'synthetic-spatial-render-fixture',
    });
    temporaryRoots.push(fixture.root);
    const materialization = await loadOpenMmTip3pPrivatePositionTrajectoryV048(
      await materializationInput(fixture.root, 'synthetic-v049-export-test'),
    );
    const sourceHandle = getOpenMmTip3pPrivatePositionTrajectoryHandleV048(materialization);
    const expectedPositions = sourceHandle.copyTrajectoryPositionBytes();
    const expectedPositionDigest = bytesDigest(expectedPositions);
    const expectedSourceMetadataDigest = sourceHandle.metadata.metadataDigest;

    const exported = exportPrivateOpenMmPositionTrajectoryPacketV049(materialization);
    expect(exported).toMatchObject({
      schemaVersion: 'tf.private-openmm-position-trajectory-packet-export/0.4.9',
      status: 'private-position-trajectory-packet-ready-source-capability-revoked',
      runtimeBoundary: 'node-server-only-before-ephemeral-loopback-listen',
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
      publicPayload: null,
    });
    expect(exported.packetBytes).toBeInstanceOf(Uint8Array);
    expect(exported.packetBytes.some((value) => value !== 0)).toBe(true);
    expect(exported.packetDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(exported.packetDigest)
      .toBe(privatePositionTrajectoryPacketDigestV049(exported.packetBytes));
    expect(exported.sourceOwnerRevocationReceipt).toEqual({
      schemaVersion: 'tf.atomistic-private-position-trajectory-revocation/0.4.8',
      status: 'revoked',
      metadataDigest: expectedSourceMetadataDigest,
      frameCountZeroFilled: 101,
      positionByteLengthZeroFilled: 3_254_220,
      internalReferenceCleared: true,
      previouslyIssuedCopiesRevoked: false,
      runtimeOrGpuCopiesRevoked: false,
      securePhysicalErasureVerified: false,
    });
    expect(() => getOpenMmTip3pPrivatePositionTrajectoryHandleV048(materialization))
      .toThrow(/revoked/);

    const decoded = decodePrivatePositionTrajectoryPacketV049(exported.packetBytes);
    try {
      expect(decoded.trajectoryMetadata).toMatchObject({
        status: 'sanitized-private-101-frame-position-trajectory-execution-unattested',
        inventory: { frameCount: 101, particleCount: 2_685 },
        scientificBoundary: {
          completePhysicalStateIncluded: false,
          solverFrameOriginVerified: false,
          interpolationApplied: false,
          executionAuthenticityVerified: false,
          publicDistributionEligible: false,
          cloudflareDistributionEligible: false,
        },
      });
      expect(decoded.positionsBytes).toHaveLength(3_254_220);
      expect(bytesDigest(decoded.positionsBytes)).toBe(expectedPositionDigest);
      expect(decoded.trajectoryMetadata.metadataDigest)
        .toBe(exported.privateTrajectoryMetadataDigest);
      expect(decoded.trajectoryMetadata.positionChannel.sha256)
        .toBe(exported.positionTrajectoryDigest);
      expect(decoded.trajectoryMetadata.sequence.orderedPositionFrameDigest)
        .toBe(exported.orderedPositionFrameDigest);
      const metadataText = JSON.stringify(decoded.trajectoryMetadata);
      for (const forbidden of [
        'sessionId', 'sourcePositionsArtifactDigest', 'sourcePositionsF64Digest',
        'sourceGeometryGate', 'derivedGeometryGate', 'probeDisplacement',
        'artifactRoot', 'independentControlReceiptPath', 'sourceRevision',
        'velocityTemporalAlignment', 'forceSemantics',
      ]) expect(metadataText).not.toContain(forbidden);
    } finally {
      expectedPositions.fill(0);
      decoded.positionsBytes.fill(0);
      exported.packetBytes.fill(0);
    }
  }, 60_000);

  it('does not export from a revoked or cloned materialization capability', async () => {
    const fixture = makeProducerDirectory({
      positionLayout: 'synthetic-spatial-render-fixture',
    });
    temporaryRoots.push(fixture.root);
    const materialization = await loadOpenMmTip3pPrivatePositionTrajectoryV048(
      await materializationInput(fixture.root, 'synthetic-v049-revoked-test'),
    );
    revokeOpenMmTip3pPrivatePositionTrajectoryV048(materialization);

    expect(() => exportPrivateOpenMmPositionTrajectoryPacketV049(materialization))
      .toThrow(/revoked/);
    expect(() => exportPrivateOpenMmPositionTrajectoryPacketV049({ ...materialization }))
      .toThrow(/export failed and source capability revocation also failed/);
  }, 60_000);

  it('zeroizes the positions copy and partial packet when operation and revocation both fail',
    async () => {
      const loaderModule =
        '../../../../lib/simulation/openmm-world-session-loader-implementation.server.mjs';
      const projectorModule =
        '../../../../lib/simulation/atomistic-private-browser-position-trajectory-v049-projector.server.ts';
      const envelopeModule = './private-position-trajectory-envelope-v049.mjs';
      const exportModule = './private-position-trajectory-export-v049.server.mjs';
      const sourceMetadata = Object.freeze({ metadataDigest: `sha256:${'1'.repeat(64)}` });
      const materialization = fakeMaterialization(sourceMetadata);
      let issuedPositions = null;
      let partialPacket = null;
      let revoked = false;
      let revokeCalls = 0;

      vi.resetModules();
      vi.doMock(loaderModule, () => ({
        getOpenMmTip3pPrivatePositionTrajectoryHandleV048(candidate) {
          if (candidate !== materialization) throw new Error('wrong capability object');
          return Object.freeze({
            metadata: sourceMetadata,
            copyTrajectoryPositionBytes() {
              issuedPositions = new Uint8Array(32);
              issuedPositions.fill(0xa5);
              return issuedPositions;
            },
            isRevoked: () => revoked,
          });
        },
        revokeOpenMmTip3pPrivatePositionTrajectoryV048(candidate) {
          if (candidate !== materialization) throw new Error('wrong revocation object');
          revokeCalls += 1;
          revoked = true;
          throw new Error('injected revocation failure after owner revoke');
        },
      }));
      vi.doMock(projectorModule, () => ({
        createAtomisticPrivateBrowserPositionTrajectoryMetadataV049() {
          return Object.freeze({
            metadataDigest: `sha256:${'2'.repeat(64)}`,
            positionChannel: Object.freeze({ sha256: `sha256:${'3'.repeat(64)}` }),
            sequence: Object.freeze({ orderedPositionFrameDigest: `sha256:${'4'.repeat(64)}` }),
          });
        },
      }));
      vi.doMock(envelopeModule, () => ({
        encodePrivatePositionTrajectoryPacketV049() {
          partialPacket = new Uint8Array(64);
          partialPacket.fill(0x5a);
          return partialPacket;
        },
        privatePositionTrajectoryPacketDigestV049() {
          throw new Error('injected packet digest failure');
        },
      }));

      try {
        const faulted = await import(exportModule);
        let failure = null;
        try {
          faulted.exportPrivateOpenMmPositionTrajectoryPacketV049(materialization);
        } catch (error) {
          failure = error;
        }
        expect(failure).toBeInstanceOf(AggregateError);
        expect(failure.message)
          .toBe('private trajectory export failed and source capability revocation also failed');
        expect(failure.errors.map((error) => error.message)).toEqual([
          'injected packet digest failure',
          'injected revocation failure after owner revoke',
        ]);
        expect(revokeCalls).toBe(1);
        expect(revoked).toBe(true);
        expect(issuedPositions).not.toBeNull();
        expect(issuedPositions.every((value) => value === 0)).toBe(true);
        expect(partialPacket).not.toBeNull();
        expect(partialPacket.every((value) => value === 0)).toBe(true);
      } finally {
        vi.doUnmock(loaderModule);
        vi.doUnmock(projectorModule);
        vi.doUnmock(envelopeModule);
        vi.resetModules();
      }
    });
});

async function materializationInput(artifactRoot, sessionId) {
  const receipt = await verifyDirectory(artifactRoot);
  const receiptRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'tf-v049-receipt-')));
  temporaryRoots.push(receiptRoot);
  const receiptPath = path.join(receiptRoot, 'independent-control-receipt.json');
  writeFileSync(receiptPath, `${canonicalJson(receipt)}\n`, { encoding: 'ascii', flag: 'wx' });
  return {
    artifactRoot,
    independentControlReceiptPath: receiptPath,
    expectedSourceRevision: SOURCE_REVISION,
    sessionId,
  };
}

function bytesDigest(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

function fakeMaterialization(positionTrajectoryMetadata) {
  return {
    schemaVersion: 'tf.openmm-tip3p-private-position-trajectory-materialization/0.4.8',
    runtimeBoundary: 'node-server-only-private-artifact-filesystem',
    positionTrajectoryMetadata,
    sourceArtifactF64BytesReachableFromReturn: false,
    serializedBinaryPayloadExposed: false,
    privateDerivedF32BytesRetainedUntilOwnerRevocationOrCapabilityGc: true,
    explicitPrivateDerivedF32OwnerRevocationSupported: true,
    singleStableArtifactSnapshot: true,
    positionsOnlyDerivative: true,
    executionAuthenticityVerified: false,
    reproduced: false,
    protectedMainArtifact: false,
    attestedArtifact: false,
    sourceLicenseForPublicDistributionVerified: false,
    promotionEligible: false,
    publicDistributionEligible: false,
    cloudflareDistributionEligible: false,
    publicPayload: null,
  };
}
