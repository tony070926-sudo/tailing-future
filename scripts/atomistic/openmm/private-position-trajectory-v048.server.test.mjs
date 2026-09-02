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
  getOpenMmTip3pPrivatePositionTrajectoryHandleV048,
  loadOpenMmTip3pPrivatePositionTrajectoryV048,
  revokeOpenMmTip3pPrivatePositionTrajectoryV048,
} from '../../../lib/simulation/openmm-world-session-loader-implementation.server.mjs';
import { canonicalJson } from '../runtime-input-contract.mjs';
import {
  SOURCE_REVISION,
  makeProducerDirectory,
  verifyDirectory,
} from './openmm-tip3p-producer-directory-fixture.test-support.mjs';

const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

describe('V048 single-snapshot OpenMM positions trajectory loader', () => {
  it('derives all 101 private frames from one explicitly synthetic spatial fixture', async () => {
    const fixture = makeProducerDirectory({
      positionLayout: 'synthetic-spatial-render-fixture',
    });
    temporaryRoots.push(fixture.root);
    const input = await materializationInput(fixture.root, 'spatial-loader-test');

    const materialization = await loadOpenMmTip3pPrivatePositionTrajectoryV048(input);
    expect(materialization).toMatchObject({
      schemaVersion: 'tf.openmm-tip3p-private-position-trajectory-materialization/0.4.8',
      singleStableArtifactSnapshot: true,
      positionsOnlyDerivative: true,
      sourceArtifactF64BytesReachableFromReturn: false,
      serializedBinaryPayloadExposed: false,
      executionAuthenticityVerified: false,
      reproduced: false,
      promotionEligible: false,
      publicDistributionEligible: false,
      cloudflareDistributionEligible: false,
      publicPayload: null,
      positionTrajectoryMetadata: {
        status: 'private-spatially-resolved-discrete-position-trajectory-execution-unattested',
        inventory: { frameCount: 101, particleCount: 2_685 },
        scientificBoundary: {
          rawPayloadChannelsIncluded: ['positionsNanometer'],
          interpolationApplied: false,
          sourceEvidenceClass:
            "digest-bound-position-artifact-frames-execution-unattested",
          sourceDeclaredDiscreteFrameCount: 101,
          solverFrameOriginVerified: false,
          motionSynthesizedByThisAdapter: false,
        },
      },
    });
    expect(containsBinaryPayload(materialization)).toBe(false);

    const handle = getOpenMmTip3pPrivatePositionTrajectoryHandleV048(materialization);
    const frame0 = handle.getFrameHandle(0);
    const frame50 = handle.getFrameHandle(50);
    const frame100 = handle.getFrameHandle(100);
    expect(new Set([
      frame0.frame.stateKey,
      frame50.frame.stateKey,
      frame100.frame.stateKey,
    ]).size).toBe(3);
    for (const frame of [frame0, frame50, frame100]) {
      const bytes = frame.copyPositionBytes();
      expect(bytes).toHaveLength(32_220);
      bytes.fill(0);
    }

    const receipt = revokeOpenMmTip3pPrivatePositionTrajectoryV048(materialization);
    expect(receipt).toMatchObject({
      status: 'revoked', frameCountZeroFilled: 101,
      positionByteLengthZeroFilled: 3_254_220,
    });
    expect(revokeOpenMmTip3pPrivatePositionTrajectoryV048(materialization)).toBe(receipt);
    expect(() => getOpenMmTip3pPrivatePositionTrajectoryHandleV048(materialization))
      .toThrow(/revoked/);
  }, 60_000);

  it('rejects the legacy collapsed verifier fixture at the V048 spatial gate', async () => {
    const fixture = makeProducerDirectory();
    temporaryRoots.push(fixture.root);
    const input = await materializationInput(fixture.root, 'collapsed-loader-test');
    await expect(loadOpenMmTip3pPrivatePositionTrajectoryV048(input))
      .rejects.toThrow(/collapsed oxygen anchors/);
  }, 30_000);

  it('requires exact-object capability identity', () => {
    expect(() => getOpenMmTip3pPrivatePositionTrajectoryHandleV048({}))
      .toThrow(/original materialization object/);
    expect(() => revokeOpenMmTip3pPrivatePositionTrajectoryV048({}))
      .toThrow(/original materialization object/);
  });
});

async function materializationInput(artifactRoot, sessionId) {
  const receipt = await verifyDirectory(artifactRoot);
  const receiptRoot = realpathSync(mkdtempSync(path.join(tmpdir(), 'tf-v048-receipt-')));
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

function containsBinaryPayload(value) {
  const seen = new WeakSet();
  function visit(entry) {
    if (entry === null || typeof entry !== 'object') return false;
    if (entry instanceof ArrayBuffer || ArrayBuffer.isView(entry)
      || (typeof SharedArrayBuffer !== 'undefined' && entry instanceof SharedArrayBuffer)) {
      return true;
    }
    if (seen.has(entry)) return false;
    seen.add(entry);
    return Object.values(entry).some(visit);
  }
  return visit(value);
}
