import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { digestValue } from './digest.ts';
import {
  ATOMISTIC_PRIVATE_BROWSER_POSITION_TRAJECTORY_BYTE_LENGTH_V049,
  assertAtomisticPrivateBrowserPositionTrajectoryMetadataV049,
  createAtomisticPrivateBrowserOrderedPositionFrameDigestV049,
  createAtomisticPrivateBrowserPositionFrameDigestV049,
  createAtomisticPrivateBrowserPositionTrajectoryControllerV049,
  type AtomisticPrivateBrowserPositionTrajectoryMetadataV049,
} from './atomistic-private-browser-position-trajectory-v049.ts';
import {
  createAtomisticPrivateBrowserPositionTrajectoryMetadataV049,
} from './atomistic-private-browser-position-trajectory-v049-projector.server.ts';
import { createAtomisticPrivatePositionTrajectoryFixtureV048 } from
  './atomistic-private-position-trajectory-v048.test-fixture.ts';
import { createAtomisticPrivatePositionTrajectoryControllerV048 } from
  './atomistic-private-position-trajectory-v048.ts';

type MutableMetadata = {
  metadataDigest: string;
  sequence: {
    orderedPositionFrameDigest: string;
    frames: Array<{
      frameOrdinal: number;
      step: number;
      timePicoseconds: number;
      sourceFrameDigest: string;
      positionsDerivedF32Digest: string;
      byteOffset: number;
      byteLength: 32_220;
      positionFrameDigest: string;
    }>;
  };
  positionChannel: { sha256: string };
  scientificBoundary: { reproduced: boolean };
} & Record<string, unknown>;

let metadata: AtomisticPrivateBrowserPositionTrajectoryMetadataV049;
let positions: Uint8Array;

beforeAll(() => {
  // Explicitly synthetic: this fixture proves only the V049 protocol and owner,
  // never a reproduced or authenticated OpenMM execution.
  const fixture = createAtomisticPrivatePositionTrajectoryFixtureV048(
    'v049-explicit-synthetic-protocol-only',
  );
  let source: ReturnType<typeof createAtomisticPrivatePositionTrajectoryControllerV048> | null =
    null;
  try {
    source = createAtomisticPrivatePositionTrajectoryControllerV048(
      fixture.session,
      fixture.sourceFrames,
    );
    metadata = createAtomisticPrivateBrowserPositionTrajectoryMetadataV049(
      source.handle.metadata,
    );
    positions = new Uint8Array(
      ATOMISTIC_PRIVATE_BROWSER_POSITION_TRAJECTORY_BYTE_LENGTH_V049,
    );
    for (let frameOrdinal = 0; frameOrdinal < 101; frameOrdinal += 1) {
      const frameBytes = source.handle.copyFramePositionBytes(frameOrdinal);
      try {
        positions.set(frameBytes, frameOrdinal * 32_220);
      } finally {
        frameBytes.fill(0);
      }
    }
  } finally {
    source?.revoke();
    for (const frame of fixture.sourceFrames) frame.positionsF64LeBytes.fill(0);
  }
}, 30_000);

afterAll(() => {
  positions.fill(0);
});

describe.sequential('V049 sanitized private-browser position trajectory', () => {
  it('projects exactly 101 ordered F32LE frames without private V048 metadata', () => {
    expect(metadata).toMatchObject({
      schemaVersion: 'tf.atomistic-private-browser-position-trajectory/0.4.9',
      status: 'sanitized-private-101-frame-position-trajectory-execution-unattested',
      inventory: {
        waterMoleculeCount: 895,
        particleCount: 2_685,
        oxygenCount: 895,
        hydrogenCount: 1_790,
        topologyLinkCount: 1_790,
        frameCount: 101,
      },
      sequence: {
        firstFrameOrdinal: 0,
        lastFrameOrdinal: 100,
        frameByteLength: 32_220,
        trajectoryByteLength: 3_254_220,
      },
      positionChannel: {
        dtype: 'float32-le',
        shape: [101, 2_685, 3],
        componentCount: 813_555,
        byteLength: 3_254_220,
      },
      scientificBoundary: {
        completePhysicalStateIncluded: false,
        solverFrameOriginVerified: false,
        createsSolverFrames: false,
        interpolationApplied: false,
        motionSynthesizedByThisAdapter: false,
        repeatedDrawCreatesTrajectoryFrame: false,
        executionAuthenticityVerified: false,
        reproduced: false,
        publicDistributionEligible: false,
        cloudflareDistributionEligible: false,
      },
    });
    expect(Object.keys(metadata).sort()).toEqual([
      'binding', 'cell', 'inventory', 'metadataDigest', 'positionChannel',
      'schemaVersion', 'scientificBoundary', 'sequence', 'sourceSchemaVersion', 'status',
    ]);
    expect(metadata.sequence.frames).toHaveLength(101);
    expect(digestBytes(positions)).toBe(metadata.positionChannel.sha256);
    for (const [frameOrdinal, byteOffset, exclusiveEnd, step] of [
      [0, 0, 32_220, 0],
      [37, 1_192_140, 1_224_360, 370],
      [100, 3_222_000, 3_254_220, 1_000],
    ]) {
      const frame = metadata.sequence.frames[frameOrdinal];
      expect(frame).toMatchObject({ frameOrdinal, byteOffset, byteLength: 32_220, step });
      expect(frame.byteOffset + frame.byteLength).toBe(exclusiveEnd);
      expect(digestBytes(positions.subarray(byteOffset, exclusiveEnd)))
        .toBe(frame.positionsDerivedF32Digest);
    }
    expect(new DataView(positions.buffer).getFloat32(0, true)).toBeCloseTo(0.12, 6);
    expect(new DataView(positions.buffer).getFloat32(0, false)).not.toBeCloseTo(0.12, 3);
    expect(assertAtomisticPrivateBrowserPositionTrajectoryMetadataV049(metadata))
      .toEqual(metadata);

    const keys = collectKeys(metadata);
    for (const forbidden of [
      'sessionId', 'sourceRevision', 'sourcePositionsArtifactDigest',
      'sourcePositionsF64Digest', 'sourceGeometryGate', 'derivedGeometryGate',
      'probeDisplacement', 'conversion', 'artifactManifestDigest', 'controlReceiptDigest',
      'payloadBundleRoot', 'worldSessionMaterialization', 'positionTrajectoryMetadata',
    ]) expect(keys).not.toContain(forbidden);
    const serialized = JSON.stringify(metadata);
    for (const forbidden of [
      '/private/artifacts', 'independentControlReceiptPath',
      'arrays/reference-a-velocities', 'arrays/reference-a-potential-forces',
    ]) expect(serialized).not.toContain(forbidden);
  });

  it('owns one full trajectory, issues fresh exact-frame copies, and revokes idempotently', () => {
    const controller = createAtomisticPrivateBrowserPositionTrajectoryControllerV049(
      metadata,
      positions,
    );
    const frame0 = controller.handle.getFrameHandle(0);
    const first37 = controller.handle.copyFramePositionBytes(37);
    const second37 = controller.handle.getFrameHandle(37).copyPositionBytes();
    const external100 = controller.handle.copyFramePositionBytes(100);
    expect(first37).toEqual(second37);
    expect(first37).not.toBe(second37);
    expect(first37.buffer).not.toBe(positions.buffer);
    first37.fill(0xff);
    expect(controller.handle.copyFramePositionBytes(37)).toEqual(second37);

    const auditedMetadata = controller.handle.metadata;
    const receipt = controller.revoke();
    expect(controller.revoke()).toBe(receipt);
    expect(receipt).toEqual({
      schemaVersion: 'tf.atomistic-private-browser-position-trajectory-revocation/0.4.9',
      status: 'revoked',
      metadataDigest: metadata.metadataDigest,
      frameCountZeroFilled: 101,
      positionByteLengthZeroFilled: 3_254_220,
      internalReferenceCleared: true,
      previouslyIssuedCopiesRevoked: false,
      runtimeOrGpuCopiesRevoked: false,
      securePhysicalErasureVerified: false,
    });
    expect(controller.handle.metadata).toBe(auditedMetadata);
    expect(controller.handle.isRevoked()).toBe(true);
    expect(frame0.isRevoked()).toBe(true);
    expect(() => frame0.copyPositionBytes()).toThrow(/revoked/);
    expect(() => controller.handle.copyFramePositionBytes(100)).toThrow(/revoked/);
    expect(() => controller.handle.getFrameHandle(0)).toThrow(/revoked/);
    expect(external100.some((value) => value !== 0)).toBe(true);
    for (const invalid of [-1, 101, 1.5, Number.NaN, -0]) {
      expect(() => controller.handle.getFrameHandle(invalid)).toThrow(/0 through 100/);
    }
    first37.fill(0);
    second37.fill(0);
    external100.fill(0);
  }, 30_000);

  it('fails closed on extra private fields, claim escalation, reorder, stale digests, and proxies', () => {
    const extra = mutableMetadata();
    extra.artifactRoot = '/private/artifacts/openmm';
    refreshMetadataDigest(extra);
    expect(() => assertAtomisticPrivateBrowserPositionTrajectoryMetadataV049(extra))
      .toThrow(/exactly the locked keys/);

    const escalated = mutableMetadata();
    escalated.scientificBoundary.reproduced = true;
    refreshMetadataDigest(escalated);
    expect(() => assertAtomisticPrivateBrowserPositionTrajectoryMetadataV049(escalated))
      .toThrow(/reproduced changed/);

    const reordered = mutableMetadata();
    [reordered.sequence.frames[0], reordered.sequence.frames[1]] = [
      reordered.sequence.frames[1], reordered.sequence.frames[0],
    ];
    reordered.sequence.orderedPositionFrameDigest =
      createAtomisticPrivateBrowserOrderedPositionFrameDigestV049(reordered.sequence.frames);
    refreshMetadataDigest(reordered);
    expect(() => assertAtomisticPrivateBrowserPositionTrajectoryMetadataV049(reordered))
      .toThrow(/frame 0 sequence changed/);

    const stale = mutableMetadata();
    stale.sequence.frames[37].positionsDerivedF32Digest = digestValue({ forged: 37 });
    refreshMetadataDigest(stale);
    expect(() => assertAtomisticPrivateBrowserPositionTrajectoryMetadataV049(stale))
      .toThrow(/frame 37 digest is stale/);

    expect(() => assertAtomisticPrivateBrowserPositionTrajectoryMetadataV049(
      new Proxy(metadata, {}),
    )).toThrow(/canonical plain-data tree/);

    let getterCalls = 0;
    const accessor = mutableMetadata();
    Object.defineProperty(accessor, 'status', {
      enumerable: true,
      get() {
        getterCalls += 1;
        return metadata.status;
      },
    });
    expect(() => assertAtomisticPrivateBrowserPositionTrajectoryMetadataV049(accessor))
      .toThrow(/canonical plain-data tree/);
    expect(getterCalls).toBe(0);
  });

  it('rejects aggregate/frame corruption, invalid F32LE, and unstable byte owners', () => {
    const aggregateTamper = positions.slice();
    aggregateTamper[1_192_140 + 17] ^= 1;
    expect(() => createAtomisticPrivateBrowserPositionTrajectoryControllerV049(
      metadata,
      aggregateTamper,
    )).toThrow(/aggregate digest/);

    const frameTamper = positions.slice();
    frameTamper[1_192_140 + 17] ^= 1;
    const aggregateOnly = mutableMetadata();
    aggregateOnly.positionChannel.sha256 = digestBytes(frameTamper);
    refreshMetadataDigest(aggregateOnly);
    expect(() => createAtomisticPrivateBrowserPositionTrajectoryControllerV049(
      assertAtomisticPrivateBrowserPositionTrajectoryMetadataV049(aggregateOnly),
      frameTamper,
    )).toThrow(/frame 37 bytes changed/);

    const invalidF32 = positions.slice();
    new DataView(invalidF32.buffer).setFloat32(0, -0, true);
    const invalidMetadata = mutableMetadata();
    invalidMetadata.positionChannel.sha256 = digestBytes(invalidF32);
    invalidMetadata.sequence.frames[0].positionsDerivedF32Digest =
      digestBytes(invalidF32.subarray(0, 32_220));
    const invalidFrame = invalidMetadata.sequence.frames[0];
    const framePayload = {
      frameOrdinal: invalidFrame.frameOrdinal,
      step: invalidFrame.step,
      timePicoseconds: invalidFrame.timePicoseconds,
      sourceFrameDigest: invalidFrame.sourceFrameDigest,
      positionsDerivedF32Digest: invalidFrame.positionsDerivedF32Digest,
      byteOffset: invalidFrame.byteOffset,
      byteLength: invalidFrame.byteLength,
    };
    invalidMetadata.sequence.frames[0].positionFrameDigest =
      createAtomisticPrivateBrowserPositionFrameDigestV049(
        metadata.binding,
        framePayload,
      );
    invalidMetadata.sequence.orderedPositionFrameDigest =
      createAtomisticPrivateBrowserOrderedPositionFrameDigestV049(
        invalidMetadata.sequence.frames,
      );
    refreshMetadataDigest(invalidMetadata);
    expect(() => createAtomisticPrivateBrowserPositionTrajectoryControllerV049(
      assertAtomisticPrivateBrowserPositionTrajectoryMetadataV049(invalidMetadata),
      invalidF32,
    )).toThrow(/finite non-negative-zero F32LE/);

    expect(() => createAtomisticPrivateBrowserPositionTrajectoryControllerV049(
      metadata,
      positions.subarray(0, positions.length - 1),
    )).toThrow(/exactly 3254220 bytes/);
    class DecoratedBytes extends Uint8Array {}
    expect(() => createAtomisticPrivateBrowserPositionTrajectoryControllerV049(
      metadata,
      new DecoratedBytes(positions),
    )).toThrow(/intrinsic Uint8Array/);
    const shared = new Uint8Array(new SharedArrayBuffer(positions.byteLength));
    expect(() => createAtomisticPrivateBrowserPositionTrajectoryControllerV049(metadata, shared))
      .toThrow(/shared or resizable/);
    const resizableGetter = Object.getOwnPropertyDescriptor(
      ArrayBuffer.prototype,
      'resizable',
    )?.get;
    if (resizableGetter) {
      const buffer = new ArrayBuffer(positions.byteLength, {
        maxByteLength: positions.byteLength * 2,
      });
      if (resizableGetter.call(buffer) === true) {
        expect(() => createAtomisticPrivateBrowserPositionTrajectoryControllerV049(
          metadata,
          new Uint8Array(buffer),
        )).toThrow(/shared or resizable/);
      }
    }
    expect(() => createAtomisticPrivateBrowserPositionTrajectoryControllerV049(
      metadata,
      new Proxy(positions, {}),
    )).toThrow();

    const detachedBuffer = positions.slice().buffer;
    const detached = new Uint8Array(detachedBuffer);
    structuredClone(detachedBuffer, { transfer: [detachedBuffer] });
    expect(() => createAtomisticPrivateBrowserPositionTrajectoryControllerV049(metadata, detached))
      .toThrow(/exactly 3254220 bytes|detached or unreadable/);

    aggregateTamper.fill(0);
    frameTamper.fill(0);
    invalidF32.fill(0);
    shared.fill(0);
  }, 30_000);

  it('zero-fills the owned full trajectory on revoke and construction failure', async () => {
    const originalFill = Uint8Array.prototype.fill;
    const fills: Array<{ byteLength: number; allZero: boolean }> = [];
    Uint8Array.prototype.fill = function auditedFill(...args) {
      const result = originalFill.apply(this, args);
      fills.push({
        byteLength: this.byteLength,
        allZero: this.every((value) => value === 0),
      });
      return result;
    };
    let auditedModule: typeof import(
      './atomistic-private-browser-position-trajectory-v049.ts'
    );
    try {
      // @ts-expect-error Vitest query imports intentionally create an isolated module instance.
      auditedModule = await import('./atomistic-private-browser-position-trajectory-v049.ts?owner-zeroization-audit');
    } finally {
      Uint8Array.prototype.fill = originalFill;
    }

    const controller = auditedModule.createAtomisticPrivateBrowserPositionTrajectoryControllerV049(
      metadata,
      positions,
    );
    controller.revoke();
    expect(fills.some((entry) => entry.byteLength === 3_254_220 && entry.allZero)).toBe(true);

    fills.length = 0;
    const invalid = positions.slice();
    invalid[0] ^= 1;
    expect(() => auditedModule.createAtomisticPrivateBrowserPositionTrajectoryControllerV049(
      metadata,
      invalid,
    )).toThrow(/aggregate digest/);
    expect(fills.some((entry) => entry.byteLength === 3_254_220 && entry.allZero)).toBe(true);
    invalid.fill(0);
  }, 30_000);
});

function mutableMetadata() {
  return structuredClone(metadata) as unknown as MutableMetadata;
}

function refreshMetadataDigest(value: MutableMetadata) {
  const payload = { ...value };
  Reflect.deleteProperty(payload, 'metadataDigest');
  value.metadataDigest = digestValue(payload);
}

function digestBytes(bytes: Uint8Array) {
  return `sha256:${bytesToHex(sha256(bytes))}`;
}

function collectKeys(value: unknown, output: string[] = []) {
  if (Array.isArray(value)) {
    for (const entry of value) collectKeys(entry, output);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      output.push(key);
      collectKeys(child, output);
    }
  }
  return output;
}
