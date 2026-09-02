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
  loadOpenMmTip3pPrivatePositionTrajectoryV048,
} from '../../../../lib/simulation/openmm-world-session-loader-implementation.server.mjs';
import { canonicalJson } from '../../runtime-input-contract.mjs';
import {
  SOURCE_REVISION,
  makeProducerDirectory,
  verifyDirectory,
} from '../openmm-tip3p-producer-directory-fixture.test-support.mjs';
import {
  observePrivateBrowserTrajectoryWithChromiumV049,
} from './private-browser-trajectory-chromium-observer-v049.mjs';
import {
  startPrivateOpenMmWebGl2TrajectoryHarnessV049,
} from './private-openmm-webgl2-trajectory-harness-v049.server.mjs';

const executablePath = process.env.TF_PRIVATE_CHROMIUM_EXECUTABLE ?? '';
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe.skipIf(executablePath === '')(
  'V049 private 101-frame trajectory in the locked local Chromium',
  () => {
    it.each(['happy-path', 'mid-playback-dispose', 'context-loss'])(
      'observes %s without exporting private bytes',
      async (mode) => {
        const materialization = await makeMaterialization(mode);
        const harness = await startPrivateOpenMmWebGl2TrajectoryHarnessV049(materialization);
        try {
          const observed = await observePrivateBrowserTrajectoryWithChromiumV049({
            executablePath,
            expectedClientByteLength: harness.clientBuildAudit.clientByteLength,
            expectedClientSha256: harness.clientBuildAudit.clientSha256,
            expectedPacketDigest: harness.sourceAudit.packetDigest,
            mode,
            url: harness.url,
          });
          expect(observed).toMatchObject({
            schemaVersion: 'tf.private-browser-chromium-run-observation/0.4.9',
            mode,
            packetBytesIncluded: false,
            coordinateBytesIncluded: false,
            clientJavaScriptByteLength: harness.clientBuildAudit.clientByteLength,
            clientJavaScriptSha256: harness.clientBuildAudit.clientSha256,
            clientJavaScriptResponseDigestVerified: true,
            renderedFrameCount: mode === 'happy-path' ? 101 : 37,
            performanceClaim: null,
            immutableChromiumRuntimeSnapshotVerified: false,
            chromiumRuntimeTreeDigestVerified: false,
            executionAuthenticityVerified: false,
            reproduced: false,
            protectedMainArtifact: false,
            attestedArtifact: false,
            promotionEligible: false,
            publicDistributionEligible: false,
            cloudflareDistributionEligible: false,
          });
          expect(observed.lifecycle).toMatchObject({
            state: mode === 'context-loss' ? 'context-lost' : 'disposed',
            cleanupComplete: true,
            browserOwnerRevoked: true,
            runtimeDisposed: true,
            threeDisposed: true,
            rendererDisposed: true,
            contextRestoreRequiresNewCapability: mode === 'context-loss',
          });
          if (mode === 'happy-path') {
            expect(observed.browserObservation).toMatchObject({
              frameCount: 101,
              updateCount: 101,
              uploadCount: 101,
              renderCount: 101,
              schedulerYieldCount: 101,
              drawCallsMinimum: 3,
              drawCallsMaximum: 3,
              trianglesMinimum: 554_900,
              trianglesMaximum: 554_900,
              browserGeometryValidatedFrameCount: 101,
              allFramesRigidWaterGeometryVerified: true,
              allFramesUniqueOxygenAnchorsVerified: true,
              allFramesEightOctantCoverageVerified: true,
              nonphysicalDisplayScale: true,
              webglOrWebgpuDrawExecuted: true,
              browserPositionsOwnerRevoked: true,
              revokedFrameAccessRejected: true,
              urlFragmentCredentialClearedBeforeRequest: true,
            });
          } else {
            expect(observed.browserObservation).toBeNull();
          }
        } finally {
          await harness.close();
        }
        expect(harness.lifecycle()).toMatchObject({
          consumed: true,
          finalized: true,
          listenerClosed: true,
          packetZeroized: true,
          tokenVerifierBytesZeroized: true,
          assetBytesZeroized: true,
        });
      },
      180_000,
    );
  },
);

async function makeMaterialization(mode) {
  const producer = makeProducerDirectory({
    positionLayout: 'synthetic-spatial-render-fixture',
  });
  temporaryRoots.push(producer.root);
  const receipt = await verifyDirectory(producer.root);
  const receiptRoot = realpathSync(mkdtempSync(path.join(
    tmpdir(),
    'tf-private-webgl2-trajectory-chromium-receipt-',
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
    sessionId: `synthetic-private-openmm-webgl2-trajectory-chromium-v049-${mode}`,
  });
}
