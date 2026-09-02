import {
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { expect, it } from 'vitest';
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
  startPrivateOpenMmWebGl2TrajectoryHarnessV049,
} from './private-openmm-webgl2-trajectory-harness-v049.server.mjs';

const enabled = process.env.TF_PRIVATE_MANUAL_LAUNCH === '1'
  && process.env.TF_PRIVATE_MANUAL_CAPABILITY_STDOUT_ACK === 'synthetic-only'
  && process.env.CI !== 'true';

it.skipIf(!enabled)(
  'holds one synthetic private capability for Playwright CLI inspection',
  async () => {
    const temporaryRoots = [];
    let harness = null;
    try {
      const producer = makeProducerDirectory({
        positionLayout: 'synthetic-spatial-render-fixture',
      });
      temporaryRoots.push(producer.root);
      const receipt = await verifyDirectory(producer.root);
      const receiptRoot = realpathSync(mkdtempSync(path.join(
        tmpdir(),
        'tf-private-webgl2-trajectory-manual-receipt-',
      )));
      temporaryRoots.push(receiptRoot);
      const receiptPath = path.join(receiptRoot, 'independent-control-receipt.json');
      writeFileSync(receiptPath, `${canonicalJson(receipt)}\n`, {
        encoding: 'ascii',
        flag: 'wx',
      });
      const materialization = await loadOpenMmTip3pPrivatePositionTrajectoryV048({
        artifactRoot: producer.root,
        independentControlReceiptPath: receiptPath,
        expectedSourceRevision: SOURCE_REVISION,
        sessionId: 'synthetic-private-openmm-webgl2-trajectory-manual-v049',
      });
      harness = await startPrivateOpenMmWebGl2TrajectoryHarnessV049(materialization);
      process.stdout.write(`TF_PRIVATE_MANUAL_URL=${harness.url}\n`);
      const responseFinished = await waitUntilResponseFinished(harness);
      expect(responseFinished).toBe(true);
    } finally {
      await harness?.close();
      for (const root of temporaryRoots.reverse()) {
        rmSync(root, { recursive: true, force: true });
      }
    }
  },
  120_000,
);

async function waitUntilResponseFinished(harness) {
  for (let attempt = 0; attempt < 600; attempt += 1) {
    const lifecycle = harness.lifecycle();
    if (lifecycle.consumed && lifecycle.packetZeroized) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return false;
}
