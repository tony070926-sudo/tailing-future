import {
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getOpenMmTip3pPrivatePositionTrajectoryHandleV048,
  loadOpenMmTip3pPrivatePositionTrajectoryV048,
} from '../../../../lib/simulation/openmm-world-session-loader-implementation.server.mjs';
import { canonicalJson } from '../../runtime-input-contract.mjs';
import {
  SOURCE_REVISION,
  makeProducerDirectory,
  verifyDirectory,
} from '../openmm-tip3p-producer-directory-fixture.test-support.mjs';
import {
  decodePrivatePositionTrajectoryPacketV049,
} from './private-position-trajectory-envelope-v049.mjs';

const COMPOSER_MODULE = './private-openmm-webgl2-trajectory-harness-v049.server.mjs';
const BUILD_MODULE = './build-private-browser-trajectory-client-v049.mjs';
const EXPORT_MODULE = './private-position-trajectory-export-v049.server.mjs';
const LOOPBACK_MODULE = './private-position-trajectory-loopback-server-v049.mjs';
const MINIMUM_PACKET_BYTES = 3_254_270;
const MAXIMUM_PACKET_BYTES = 3_319_804;
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
  vi.doUnmock(BUILD_MODULE);
  vi.doUnmock(EXPORT_MODULE);
  vi.doUnmock(LOOPBACK_MODULE);
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('V049 composed private OpenMM WebGL2 trajectory harness boundary', () => {
  it('revokes the synthetic V048 source before listening and returns only aggregate audit data',
    async () => {
      const materialization = await makeMaterialization();
      const sourceHandle = getOpenMmTip3pPrivatePositionTrajectoryHandleV048(materialization);
      const { startPrivateOpenMmWebGl2TrajectoryHarnessV049 } = await import(COMPOSER_MODULE);
      const harness = await startPrivateOpenMmWebGl2TrajectoryHarnessV049(materialization);
      try {
        expect(sourceHandle.isRevoked()).toBe(true);
        expect(() => getOpenMmTip3pPrivatePositionTrajectoryHandleV048(materialization))
          .toThrow(/revoked/);
        expect(harness).toMatchObject({
          schemaVersion: 'tf.private-openmm-webgl2-trajectory-harness-controller/0.4.9',
          status: 'loopback-listening-browser-trajectory-draw-not-yet-observed',
          browserDrawObservedByController: false,
          publicDistributionEligible: false,
          cloudflareDistributionEligible: false,
        });
        expect(Object.keys(harness.sourceAudit)).toEqual([
          'schemaVersion',
          'status',
          'packetDigest',
          'packetByteLength',
          'privateTrajectoryMetadataDigest',
          'positionTrajectoryDigest',
          'orderedPositionFrameDigest',
          'frameCount',
          'sourceHandleRevokedBeforeListen',
          'sourceArtifactF64BytesIncluded',
          'velocitiesIncluded',
          'forcesIncluded',
          'energiesIncluded',
          'executionAuthenticityVerified',
          'reproduced',
          'protectedMainArtifact',
          'attestedArtifact',
          'sourceLicenseForPublicDistributionVerified',
          'promotionEligible',
          'publicDistributionEligible',
          'cloudflareDistributionEligible',
        ]);
        expect(harness.sourceAudit).toMatchObject({
          schemaVersion: 'tf.private-openmm-webgl2-trajectory-source-audit/0.4.9',
          status: 'source-capability-revoked-before-private-loopback-listen',
          frameCount: 101,
          privateTrajectoryMetadataDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
          positionTrajectoryDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
          orderedPositionFrameDigest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
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
        expect(Object.isFrozen(harness.sourceAudit)).toBe(true);
        const sourceAuditText = JSON.stringify(harness.sourceAudit);
        for (const forbidden of [
          'metadata',
          'frames',
          'frameOrdinal',
          'sourceOwnerRevocationReceipt',
          'artifactRoot',
          'independentControlReceiptPath',
          'sourceRevision',
          'sourcePositionsF64Digest',
          'sourceGeometryGate',
        ]) expect(sourceAuditText).not.toContain(forbidden);
        expect(harness.clientBuildAudit).toMatchObject({
          configFileLoaded: false,
          writtenToFilesystem: false,
          outputChunkCount: 1,
          outputAssetCount: 0,
          sourceMapsIncluded: false,
          privateV048SourceIncluded: false,
          privateLoaderIncluded: false,
          serverIncluded: false,
        });

        const page = await send(harness.origin, '/');
        try {
          expect(page.statusCode).toBe(200);
          expect(page.body.toString('utf8')).toContain('Private 101-frame WebGL2 proof');
          expect(page.body.toString('utf8')).toContain('不证明 OpenMM 执行真实性');
        } finally {
          page.body.fill(0);
        }
        const client = await send(harness.origin, '/client.js');
        try {
          expect(client.statusCode).toBe(200);
          expect(client.body.toString('utf8')).toContain('TFP049T1');
          expect(client.body.toString('utf8')).not.toContain('sourcePositionsF64Digest');
        } finally {
          client.body.fill(0);
        }

        const token = new URL(harness.url).hash.slice('#token='.length);
        const packet = await send(harness.origin, '/trajectory', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            Origin: harness.origin,
            'Sec-Fetch-Site': 'same-origin',
            'Sec-Fetch-Mode': 'cors',
            'Sec-Fetch-Dest': 'empty',
          },
        });
        let decoded;
        try {
          expect(packet.statusCode).toBe(200);
          expect(packet.headers['x-private-packet-digest'])
            .toBe(harness.sourceAudit.packetDigest);
          expect(packet.body.byteLength).toBe(harness.sourceAudit.packetByteLength);
          const packetView = new Uint8Array(
            packet.body.buffer,
            packet.body.byteOffset,
            packet.body.byteLength,
          );
          decoded = decodePrivatePositionTrajectoryPacketV049(packetView);
          expect(decoded.trajectoryMetadata).toMatchObject({
            inventory: { frameCount: 101, particleCount: 2_685 },
            scientificBoundary: {
              solverFrameOriginVerified: false,
              executionAuthenticityVerified: false,
              reproduced: false,
              publicDistributionEligible: false,
              cloudflareDistributionEligible: false,
            },
          });
          expect(decoded.positionsBytes).toHaveLength(3_254_220);
        } finally {
          decoded?.positionsBytes.fill(0);
          packet.body.fill(0);
        }
      } finally {
        await harness.close();
      }
      expect(harness.lifecycle()).toMatchObject({
        consumed: true,
        finalized: true,
        listenerClosed: true,
        packetZeroized: true,
        assetBytesZeroized: true,
      });
    }, 180_000);

  it('zeroizes the exported packet when the in-memory client build fails before listen',
    async () => {
      const packet = fakePacket();
      const order = [];
      let loopbackCalls = 0;
      vi.resetModules();
      vi.doMock(EXPORT_MODULE, () => ({
        exportPrivateOpenMmPositionTrajectoryPacketV049() {
          order.push('export-revoked');
          return fakeExport(packet);
        },
      }));
      vi.doMock(BUILD_MODULE, () => ({
        async buildPrivateBrowserTrajectoryClientV049() {
          order.push('build-failed');
          throw new Error('injected in-memory build failure');
        },
      }));
      vi.doMock(LOOPBACK_MODULE, () => ({
        PRIVATE_POSITION_TRAJECTORY_PACKET_MIN_BYTES_V049: MINIMUM_PACKET_BYTES,
        PRIVATE_POSITION_TRAJECTORY_PACKET_MAX_BYTES_V049: MAXIMUM_PACKET_BYTES,
        async startPrivatePositionTrajectoryLoopbackServerV049() {
          loopbackCalls += 1;
          throw new Error('loopback must not start');
        },
      }));

      const { startPrivateOpenMmWebGl2TrajectoryHarnessV049 } = await import(COMPOSER_MODULE);
      await expect(startPrivateOpenMmWebGl2TrajectoryHarnessV049(Object.freeze({})))
        .rejects.toThrow(/injected in-memory build failure/);
      expect(order).toEqual(['export-revoked', 'build-failed']);
      expect(loopbackCalls).toBe(0);
      expect(packet.every((value) => value === 0)).toBe(true);
    });

  it('zeroizes the packet on listen rejection and closes an invalid returned transport',
    async () => {
      const rejectedPacket = fakePacket();
      vi.resetModules();
      vi.doMock(EXPORT_MODULE, () => ({
        exportPrivateOpenMmPositionTrajectoryPacketV049: () => fakeExport(rejectedPacket),
      }));
      vi.doMock(BUILD_MODULE, () => ({
        buildPrivateBrowserTrajectoryClientV049: async () => fakeClientBuild(),
      }));
      vi.doMock(LOOPBACK_MODULE, () => ({
        PRIVATE_POSITION_TRAJECTORY_PACKET_MIN_BYTES_V049: MINIMUM_PACKET_BYTES,
        PRIVATE_POSITION_TRAJECTORY_PACKET_MAX_BYTES_V049: MAXIMUM_PACKET_BYTES,
        async startPrivatePositionTrajectoryLoopbackServerV049() {
          throw new Error('injected loopback listen failure');
        },
      }));
      let composer = await import(COMPOSER_MODULE);
      await expect(composer.startPrivateOpenMmWebGl2TrajectoryHarnessV049(Object.freeze({})))
        .rejects.toThrow(/injected loopback listen failure/);
      expect(rejectedPacket.every((value) => value === 0)).toBe(true);

      const invalidPacket = fakePacket();
      const close = vi.fn(async () => {});
      vi.resetModules();
      vi.doMock(EXPORT_MODULE, () => ({
        exportPrivateOpenMmPositionTrajectoryPacketV049: () => fakeExport(invalidPacket),
      }));
      vi.doMock(BUILD_MODULE, () => ({
        buildPrivateBrowserTrajectoryClientV049: async () => fakeClientBuild(),
      }));
      vi.doMock(LOOPBACK_MODULE, () => ({
        PRIVATE_POSITION_TRAJECTORY_PACKET_MIN_BYTES_V049: MINIMUM_PACKET_BYTES,
        PRIVATE_POSITION_TRAJECTORY_PACKET_MAX_BYTES_V049: MAXIMUM_PACKET_BYTES,
        async startPrivatePositionTrajectoryLoopbackServerV049({ packetBytes }) {
          packetBytes.fill(0);
          return Object.freeze({
            schemaVersion: 'tf.private-position-trajectory-loopback-server/0.4.9',
            url: 'http://127.0.0.1:32123/#token=' + 'a'.repeat(64),
            origin: 'http://127.0.0.1:32123',
            packetDigest: digest('9'),
            exactPacketByteLength: MINIMUM_PACKET_BYTES,
            lifecycle: () => Object.freeze({ finalized: false }),
            close,
          });
        },
      }));
      composer = await import(COMPOSER_MODULE);
      await expect(composer.startPrivateOpenMmWebGl2TrajectoryHarnessV049(Object.freeze({})))
        .rejects.toThrow(/loopback transport boundary changed/);
      expect(invalidPacket.every((value) => value === 0)).toBe(true);
      expect(close).toHaveBeenCalledTimes(1);
    });

  it('rejects a detached caller packet instead of treating zero byteLength as zeroization',
    async () => {
      const packet = fakePacket();
      const close = vi.fn(async () => {});
      vi.resetModules();
      vi.doMock(EXPORT_MODULE, () => ({
        exportPrivateOpenMmPositionTrajectoryPacketV049: () => fakeExport(packet),
      }));
      vi.doMock(BUILD_MODULE, () => ({
        buildPrivateBrowserTrajectoryClientV049: async () => fakeClientBuild(),
      }));
      vi.doMock(LOOPBACK_MODULE, () => ({
        PRIVATE_POSITION_TRAJECTORY_PACKET_MIN_BYTES_V049: MINIMUM_PACKET_BYTES,
        PRIVATE_POSITION_TRAJECTORY_PACKET_MAX_BYTES_V049: MAXIMUM_PACKET_BYTES,
        async startPrivatePositionTrajectoryLoopbackServerV049({ packetBytes }) {
          structuredClone(packetBytes.buffer, { transfer: [packetBytes.buffer] });
          return Object.freeze({
            schemaVersion: 'tf.private-position-trajectory-loopback-server/0.4.9',
            url: 'http://127.0.0.1:32123/#token=' + 'a'.repeat(64),
            origin: 'http://127.0.0.1:32123',
            packetDigest: digest('1'),
            exactPacketByteLength: MINIMUM_PACKET_BYTES,
            lifecycle: () => Object.freeze({ finalized: false }),
            close,
          });
        },
      }));

      const composer = await import(COMPOSER_MODULE);
      await expect(composer.startPrivateOpenMmWebGl2TrajectoryHarnessV049(Object.freeze({})))
        .rejects.toThrow(/cleanup did not complete/);
      expect(packet.byteLength).toBe(0);
      expect(close).toHaveBeenCalledTimes(1);
    });
});

async function makeMaterialization() {
  const producer = makeProducerDirectory({
    positionLayout: 'synthetic-spatial-render-fixture',
  });
  temporaryRoots.push(producer.root);
  const receipt = await verifyDirectory(producer.root);
  const receiptRoot = realpathSync(mkdtempSync(path.join(
    tmpdir(),
    'tf-private-webgl2-trajectory-harness-receipt-',
  )));
  temporaryRoots.push(receiptRoot);
  const receiptPath = path.join(receiptRoot, 'independent-control-receipt.json');
  writeFileSync(receiptPath, `${canonicalJson(receipt)}\n`, {
    encoding: 'ascii',
    flag: 'wx',
  });
  return loadOpenMmTip3pPrivatePositionTrajectoryV048({
    artifactRoot: producer.root,
    independentControlReceiptPath: receiptPath,
    expectedSourceRevision: SOURCE_REVISION,
    sessionId: 'synthetic-private-openmm-webgl2-trajectory-harness-v049',
  });
}

function fakePacket() {
  const packet = new Uint8Array(MINIMUM_PACKET_BYTES);
  packet.fill(0x5a);
  return packet;
}

function fakeExport(packetBytes) {
  return Object.freeze({
    schemaVersion: 'tf.private-openmm-position-trajectory-packet-export/0.4.9',
    status: 'private-position-trajectory-packet-ready-source-capability-revoked',
    runtimeBoundary: 'node-server-only-before-ephemeral-loopback-listen',
    packetBytes,
    packetDigest: digest('1'),
    privateTrajectoryMetadataDigest: digest('2'),
    positionTrajectoryDigest: digest('3'),
    orderedPositionFrameDigest: digest('4'),
    frameCount: 101,
    sourceOwnerRevocationReceipt: Object.freeze({
      schemaVersion: 'tf.atomistic-private-position-trajectory-revocation/0.4.8',
      status: 'revoked',
      metadataDigest: digest('5'),
      frameCountZeroFilled: 101,
      positionByteLengthZeroFilled: 3_254_220,
      internalReferenceCleared: true,
      previouslyIssuedCopiesRevoked: false,
      runtimeOrGpuCopiesRevoked: false,
      securePhysicalErasureVerified: false,
    }),
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

function fakeClientBuild() {
  const clientJavaScript = 'document.body.dataset.privateTrajectory = "ready";\n';
  return Object.freeze({
    indexHtmlTemplate: '<style nonce="__TF_PRIVATE_CSP_NONCE__"></style>'
      + '<script nonce="__TF_PRIVATE_CSP_NONCE__" src="/client.js"></script>',
    clientJavaScript,
    audit: Object.freeze({
      schemaVersion: 'tf.private-browser-trajectory-client-build-audit/0.4.9',
      configFileLoaded: false,
      writtenToFilesystem: false,
      outputChunkCount: 1,
      outputAssetCount: 0,
      sourceModuleCount: 1,
      clientByteLength: Buffer.byteLength(clientJavaScript, 'utf8'),
      clientSha256: digest('6'),
      sourceMapsIncluded: false,
      writeBundleHookInvoked: false,
      nodeBuiltinsIncluded: false,
      privateV048SourceIncluded: false,
      privateLoaderIncluded: false,
      serverIncluded: false,
      publicDistributionEligible: false,
      cloudflareDistributionEligible: false,
    }),
  });
}

function digest(character) {
  return `sha256:${character.repeat(64)}`;
}

function send(origin, requestPath, { method = 'GET', headers = {} } = {}) {
  const url = new URL(origin);
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: url.hostname,
      port: Number(url.port),
      path: requestPath,
      method,
      headers,
      agent: false,
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        headers: response.headers,
        body: Buffer.concat(chunks),
      }));
    });
    request.once('error', reject);
    request.end();
  });
}
