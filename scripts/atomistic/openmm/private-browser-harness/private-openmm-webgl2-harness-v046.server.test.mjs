import {
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { request as httpRequest } from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  loadOpenMmTip3pPresentationFrameV046,
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
  startPrivateOpenMmWebGl2HarnessV047,
} from './private-openmm-webgl2-harness-v046.server.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('V047 composed private OpenMM WebGL2 harness boundary', () => {
  it('composes the exact source export and browser bundle without claiming a draw', async () => {
    const materialization = await makeMaterialization();
    const harness = await startPrivateOpenMmWebGl2HarnessV047(materialization);
    try {
      expect(harness).toMatchObject({
        schemaVersion: 'tf.private-openmm-webgl2-harness-controller/0.4.7',
        status: 'loopback-listening-browser-draw-not-yet-observed',
        browserDrawObservedByController: false,
        publicDistributionEligible: false,
        cloudflareDistributionEligible: false,
      });
      expect(harness.sourceAudit).toMatchObject({
        frameOrdinal: 37,
        sourceHandleRevokedBeforeListen: true,
        sourceArtifactF64BytesIncluded: false,
        velocitiesIncluded: false,
        forcesIncluded: false,
        executionAuthenticityVerified: false,
        reproduced: false,
        protectedMainArtifact: false,
        attestedArtifact: false,
        publicDistributionEligible: false,
      });
      expect(harness.clientBuildAudit).toMatchObject({
        configFileLoaded: false,
        writtenToFilesystem: false,
        outputChunkCount: 1,
        privateLoaderIncluded: false,
        serverIncluded: false,
      });

      const page = await send(harness.origin, '/');
      expect(page.statusCode).toBe(200);
      expect(page.body.toString('utf8')).toContain('Atomistic WebGL2 frame proof');
      const client = await send(harness.origin, '/client.js');
      expect(client.statusCode).toBe(200);
      expect(client.body.toString('utf8')).toContain('TFP047P1');

      const token = new URL(harness.url).hash.slice('#token='.length);
      const packet = await send(harness.origin, '/frame', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          Origin: harness.origin,
          'Sec-Fetch-Site': 'same-origin',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Dest': 'empty',
        },
      });
      expect(packet.statusCode).toBe(200);
      const decoded = decodePrivatePositionPacketV047(packet.body);
      expect(decoded.frameMetadata.binding.frameOrdinal).toBe(37);
      expect(decoded.frameMetadata.scientificBoundary).toMatchObject({
        executionAuthenticityVerified: false,
        reproduced: false,
        protectedMainArtifact: false,
        publicDistributionEligible: false,
        cloudflareDistributionEligible: false,
      });
      decoded.positionsBytes.fill(0);
      packet.body.fill(0);
    } finally {
      await harness.close();
    }
    expect(harness.lifecycle()).toMatchObject({
      consumed: true,
      finalized: true,
      listenerClosed: true,
      envelopeZeroized: true,
    });
  }, 120_000);
});

async function makeMaterialization() {
  const producer = makeProducerDirectory();
  temporaryRoots.push(producer.root);
  const receipt = await verifyDirectory(producer.root);
  const receiptRoot = realpathSync(mkdtempSync(path.join(
    tmpdir(),
    'tf-private-webgl2-harness-receipt-',
  )));
  temporaryRoots.push(receiptRoot);
  const receiptPath = path.join(receiptRoot, 'independent-control-receipt.json');
  writeFileSync(receiptPath, `${canonicalJson(receipt)}\n`, {
    encoding: 'ascii',
    flag: 'wx',
  });
  return loadOpenMmTip3pPresentationFrameV046({
    artifactRoot: producer.root,
    independentControlReceiptPath: receiptPath,
    expectedSourceRevision: SOURCE_REVISION,
    sessionId: 'private-openmm-webgl2-harness-v047',
    frameOrdinal: 37,
  });
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
