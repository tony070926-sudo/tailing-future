import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { digestValue } from '../../../../lib/simulation/digest.ts';
import {
  createAtomisticPrivateBrowserPositionTrajectoryMetadataV049,
} from '../../../../lib/simulation/atomistic-private-browser-position-trajectory-v049-projector.server.ts';
import {
  createAtomisticPrivatePositionTrajectoryFixtureV048,
} from '../../../../lib/simulation/atomistic-private-position-trajectory-v048.test-fixture.ts';
import {
  createAtomisticPrivatePositionTrajectoryControllerV048,
} from '../../../../lib/simulation/atomistic-private-position-trajectory-v048.ts';
import {
  PRIVATE_POSITION_TRAJECTORY_PACKET_FRAME_BYTES_V049,
  PRIVATE_POSITION_TRAJECTORY_PACKET_FRAME_COUNT_V049,
  PRIVATE_POSITION_TRAJECTORY_PACKET_MAGIC_V049,
  PRIVATE_POSITION_TRAJECTORY_PACKET_PAYLOAD_BYTES_V049,
  PRIVATE_POSITION_TRAJECTORY_PACKET_PREFIX_BYTES_V049,
  PRIVATE_POSITION_TRAJECTORY_PACKET_TRAILER_BYTES_V049,
  canonicalPrivatePositionTrajectoryPacketJsonV049,
  decodePrivatePositionTrajectoryPacketV049,
  encodePrivatePositionTrajectoryPacketV049,
  privatePositionTrajectoryPacketDigestV049,
} from './private-position-trajectory-envelope-v049.mjs';

let fixturePositions;
let trajectoryMetadata;

beforeAll(() => {
  const fixture = createAtomisticPrivatePositionTrajectoryFixtureV048(
    'private-browser-trajectory-envelope-v049',
  );
  let controller;
  try {
    controller = createAtomisticPrivatePositionTrajectoryControllerV048(
      fixture.session,
      fixture.sourceFrames,
    );
    trajectoryMetadata = createAtomisticPrivateBrowserPositionTrajectoryMetadataV049(
      controller.handle.metadata,
    );
    fixturePositions = controller.handle.copyTrajectoryPositionBytes();
  } finally {
    controller?.revoke();
    for (const frame of fixture.sourceFrames) frame.positionsF64LeBytes.fill(0);
  }
}, 90_000);

afterAll(() => {
  fixturePositions?.fill(0);
  fixturePositions = undefined;
  trajectoryMetadata = undefined;
});

describe('V049 private-browser 101-frame position trajectory envelope', () => {
  it('round-trips deterministically with exact layout, independent output, and bound offsets', () => {
    const first = encodeFixture();
    const second = encodeFixture();
    let decoded;
    let decodedAgain;
    try {
      expect(first).toEqual(second);
      expect(privatePositionTrajectoryPacketDigestV049(first))
        .toBe(privatePositionTrajectoryPacketDigestV049(second));

      const view = new DataView(first.buffer, first.byteOffset, first.byteLength);
      const metadataLength = view.getUint32(8, true);
      const payloadLength = view.getUint32(12, true);
      const payloadOffset = PRIVATE_POSITION_TRAJECTORY_PACKET_PREFIX_BYTES_V049
        + metadataLength;
      const trailerOffset = payloadOffset + payloadLength;
      expect(new TextDecoder().decode(first.subarray(0, 8)))
        .toBe(PRIVATE_POSITION_TRAJECTORY_PACKET_MAGIC_V049);
      expect(payloadLength).toBe(PRIVATE_POSITION_TRAJECTORY_PACKET_PAYLOAD_BYTES_V049);
      expect(first.byteLength).toBe(
        PRIVATE_POSITION_TRAJECTORY_PACKET_PREFIX_BYTES_V049
          + metadataLength
          + PRIVATE_POSITION_TRAJECTORY_PACKET_PAYLOAD_BYTES_V049
          + PRIVATE_POSITION_TRAJECTORY_PACKET_TRAILER_BYTES_V049,
      );
      expect(new TextDecoder().decode(first.subarray(16, payloadOffset)))
        .toBe(canonicalPrivatePositionTrajectoryPacketJsonV049(trajectoryMetadata));
      expect(first.subarray(trailerOffset))
        .toEqual(sha256(first.subarray(0, trailerOffset)));

      decoded = decodePrivatePositionTrajectoryPacketV049(first);
      expect(Object.keys(decoded)).toEqual(['trajectoryMetadata', 'positionsBytes']);
      expect(decoded.trajectoryMetadata).toEqual(trajectoryMetadata);
      expect(Object.isFrozen(decoded)).toBe(true);
      expect(Object.isFrozen(decoded.trajectoryMetadata)).toBe(true);
      expect(decoded.positionsBytes).toEqual(fixturePositions);
      expect(decoded.positionsBytes).not.toBe(fixturePositions);
      expect(decoded.positionsBytes.buffer).not.toBe(first.buffer);
      expect(digestBytes(decoded.positionsBytes))
        .toBe(decoded.trajectoryMetadata.positionChannel.sha256);
      expect(decoded.trajectoryMetadata.sequence.frames)
        .toHaveLength(PRIVATE_POSITION_TRAJECTORY_PACKET_FRAME_COUNT_V049);

      for (const frameOrdinal of [0, 37, 100]) {
        const frame = decoded.trajectoryMetadata.sequence.frames[frameOrdinal];
        const expectedOffset = frameOrdinal
          * PRIVATE_POSITION_TRAJECTORY_PACKET_FRAME_BYTES_V049;
        expect(frame.frameOrdinal).toBe(frameOrdinal);
        expect(frame.byteOffset).toBe(expectedOffset);
        expect(frame.byteLength).toBe(PRIVATE_POSITION_TRAJECTORY_PACKET_FRAME_BYTES_V049);
        const frameBytes = decoded.positionsBytes.subarray(
          expectedOffset,
          expectedOffset + PRIVATE_POSITION_TRAJECTORY_PACKET_FRAME_BYTES_V049,
        );
        expect(frameBytes).toEqual(fixturePositions.subarray(
          expectedOffset,
          expectedOffset + PRIVATE_POSITION_TRAJECTORY_PACKET_FRAME_BYTES_V049,
        ));
        expect(digestBytes(frameBytes)).toBe(frame.positionsDerivedF32Digest);
      }

      decoded.positionsBytes[0] ^= 0xff;
      decodedAgain = decodePrivatePositionTrajectoryPacketV049(first);
      expect(decodedAgain.positionsBytes).toEqual(fixturePositions);
      expect(decodedAgain.positionsBytes[0]).not.toBe(decoded.positionsBytes[0]);
    } finally {
      decoded?.positionsBytes.fill(0);
      decodedAgain?.positionsBytes.fill(0);
      first.fill(0);
      second.fill(0);
    }
  }, 90_000);

  it('contains only sanitized metadata and consumes one exact input descriptor snapshot', () => {
    const packet = encodeFixture();
    let decoded;
    let proxyPacket;
    try {
      decoded = decodePrivatePositionTrajectoryPacketV049(packet);
      const serialized = canonicalPrivatePositionTrajectoryPacketJsonV049(
        decoded.trajectoryMetadata,
      );
      for (const forbidden of [
        'sourcePositionsF64Digest',
        'sourcePositionsArtifactDigest',
        'artifactRoot',
        'independentControlReceiptPath',
        'velocityTemporalAlignment',
        'forceSemantics',
        'publicPayload',
      ]) expect(serialized).not.toContain(forbidden);
      expect(decoded.trajectoryMetadata.scientificBoundary).toMatchObject({
        solverFrameOriginVerified: false,
        executionAuthenticityVerified: false,
        reproduced: false,
        promotionEligible: false,
        publicDistributionEligible: false,
        cloudflareDistributionEligible: false,
      });

      expect(() => encodePrivatePositionTrajectoryPacketV049({
        trajectoryMetadata,
        positionsBytes: fixturePositions,
        publicPayload: fixturePositions,
      })).toThrow(/exactly the locked keys/);
      expect(() => encodePrivatePositionTrajectoryPacketV049({
        trajectoryMetadata,
      })).toThrow(/exactly the locked keys/);
      const accessorInput = { trajectoryMetadata };
      Object.defineProperty(accessorInput, 'positionsBytes', {
        configurable: true,
        enumerable: true,
        get: () => fixturePositions,
      });
      expect(() => encodePrivatePositionTrajectoryPacketV049(accessorInput))
        .toThrow(/data property/);
      const symbolInput = { trajectoryMetadata, positionsBytes: fixturePositions };
      symbolInput[Symbol('private-channel')] = fixturePositions;
      expect(() => encodePrivatePositionTrajectoryPacketV049(symbolInput))
        .toThrow(/locked string keys/);

      let directPropertyReadCount = 0;
      const descriptorStableProxy = new Proxy(
        { trajectoryMetadata, positionsBytes: fixturePositions },
        {
          get() {
            directPropertyReadCount += 1;
            throw new Error('encode must not read the input after taking its descriptor snapshot');
          },
        },
      );
      proxyPacket = encodePrivatePositionTrajectoryPacketV049(descriptorStableProxy);
      expect(directPropertyReadCount).toBe(0);
      expect(new TextDecoder().decode(proxyPacket.subarray(0, 8))).toBe('TFP049T1');
    } finally {
      decoded?.positionsBytes.fill(0);
      proxyPacket?.fill(0);
      packet.fill(0);
    }
  });

  it('rejects truncation, append, magic, length, payload, and trailer tampering', () => {
    const packet = encodeFixture();
    try {
      const mutations = [
        () => packet.slice(0, -1),
        () => appendByte(packet, 0),
        () => mutate(packet, (bytes) => { bytes[0] ^= 1; }),
        () => mutate(packet, (bytes) => {
          new DataView(bytes.buffer).setUint32(8, 1, true);
        }),
        () => mutate(packet, (bytes) => {
          new DataView(bytes.buffer).setUint32(12, 32_220, true);
        }),
        () => mutate(packet, (bytes) => {
          const metadataLength = new DataView(bytes.buffer).getUint32(8, true);
          bytes[PRIVATE_POSITION_TRAJECTORY_PACKET_PREFIX_BYTES_V049
            + metadataLength + 37] ^= 1;
        }),
        () => mutate(packet, (bytes) => { bytes[bytes.length - 1] ^= 1; }),
      ];
      for (const createCandidate of mutations) {
        const candidate = createCandidate();
        try {
          expect(() => decodePrivatePositionTrajectoryPacketV049(candidate)).toThrow();
        } finally {
          candidate.fill(0);
        }
      }
    } finally {
      packet.fill(0);
    }
  });

  it('rejects noncanonical metadata, reordered inventory, and recomputed claim forgeries', () => {
    const candidates = [];
    try {
      candidates.push(forgePacket(
        JSON.stringify(trajectoryMetadata, null, 2),
        fixturePositions,
      ));

      const reorderedInventory = structuredClone(trajectoryMetadata);
      [reorderedInventory.sequence.frames[0], reorderedInventory.sequence.frames[1]] = [
        reorderedInventory.sequence.frames[1],
        reorderedInventory.sequence.frames[0],
      ];
      refreshMetadataDigest(reorderedInventory);
      candidates.push(forgePacket(
        canonicalPrivatePositionTrajectoryPacketJsonV049(reorderedInventory),
        fixturePositions,
      ));

      const escalated = structuredClone(trajectoryMetadata);
      escalated.scientificBoundary.publicDistributionEligible = true;
      refreshMetadataDigest(escalated);
      candidates.push(forgePacket(
        canonicalPrivatePositionTrajectoryPacketJsonV049(escalated),
        fixturePositions,
      ));

      const withPublicPayload = structuredClone(trajectoryMetadata);
      withPublicPayload.publicPayload = null;
      refreshMetadataDigest(withPublicPayload);
      candidates.push(forgePacket(
        canonicalPrivatePositionTrajectoryPacketJsonV049(withPublicPayload),
        fixturePositions,
      ));

      for (const candidate of candidates) {
        expect(() => decodePrivatePositionTrajectoryPacketV049(candidate)).toThrow();
      }
    } finally {
      for (const candidate of candidates) candidate.fill(0);
    }
  });

  it('binds every ordered frame slice after an attacker recomputes packet and payload digests', () => {
    const reorderedPositions = fixturePositions.slice();
    let forgedPacket;
    try {
      swapFrames(reorderedPositions, 0, 1);
      const forgedMetadata = structuredClone(trajectoryMetadata);
      forgedMetadata.positionChannel.sha256 = digestBytes(reorderedPositions);
      refreshMetadataDigest(forgedMetadata);
      forgedPacket = forgePacket(
        canonicalPrivatePositionTrajectoryPacketJsonV049(forgedMetadata),
        reorderedPositions,
      );
      expect(() => decodePrivatePositionTrajectoryPacketV049(forgedPacket))
        .toThrow(/frame 0 digest binding/);
    } finally {
      reorderedPositions.fill(0);
      forgedPacket?.fill(0);
    }
  });

  it('rejects recomputed packets and encode inputs containing nonfinite or negative-zero F32LE', () => {
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, -0]) {
      const positions = fixturePositions.slice();
      let forgedPacket;
      try {
        new DataView(positions.buffer).setFloat32(37 * 4, invalid, true);
        expect(() => encodePrivatePositionTrajectoryPacketV049({
          trajectoryMetadata,
          positionsBytes: positions,
        })).toThrow(/finite non-negative-zero F32LE/);
        forgedPacket = forgePacket(
          canonicalPrivatePositionTrajectoryPacketJsonV049(trajectoryMetadata),
          positions,
        );
        expect(() => decodePrivatePositionTrajectoryPacketV049(forgedPacket))
          .toThrow(/finite non-negative-zero F32LE/);
      } finally {
        positions.fill(0);
        forgedPacket?.fill(0);
      }
    }
  });

  it('rejects subclassed, shared, resizable, proxied, and detached byte ownership', () => {
    class ByteSubclass extends Uint8Array {}
    const subclassedPositions = new ByteSubclass(fixturePositions);
    const packet = encodeFixture();
    const subclassedPacket = new ByteSubclass(packet);
    try {
      expect(() => encodePrivatePositionTrajectoryPacketV049({
        trajectoryMetadata,
        positionsBytes: subclassedPositions,
      })).toThrow(/intrinsic Uint8Array/);
      expect(() => decodePrivatePositionTrajectoryPacketV049(subclassedPacket))
        .toThrow(/intrinsic Uint8Array/);
      expect(() => privatePositionTrajectoryPacketDigestV049(subclassedPacket))
        .toThrow(/intrinsic Uint8Array/);

      const proxy = new Proxy(fixturePositions, {});
      expect(() => encodePrivatePositionTrajectoryPacketV049({
        trajectoryMetadata,
        positionsBytes: proxy,
      })).toThrow(/intrinsic Uint8Array|unreadable/);

      if (typeof SharedArrayBuffer === 'function') {
        const sharedPositions = new Uint8Array(new SharedArrayBuffer(
          PRIVATE_POSITION_TRAJECTORY_PACKET_PAYLOAD_BYTES_V049,
        ));
        sharedPositions.set(fixturePositions);
        expect(() => encodePrivatePositionTrajectoryPacketV049({
          trajectoryMetadata,
          positionsBytes: sharedPositions,
        })).toThrow(/non-shared non-resizable intrinsic ArrayBuffer/);
        sharedPositions.fill(0);
      }

      if (typeof ArrayBuffer.prototype.resize === 'function') {
        const resizableBuffer = new ArrayBuffer(
          PRIVATE_POSITION_TRAJECTORY_PACKET_PAYLOAD_BYTES_V049,
          { maxByteLength: PRIVATE_POSITION_TRAJECTORY_PACKET_PAYLOAD_BYTES_V049 + 4 },
        );
        const resizablePositions = new Uint8Array(resizableBuffer);
        resizablePositions.set(fixturePositions);
        expect(() => encodePrivatePositionTrajectoryPacketV049({
          trajectoryMetadata,
          positionsBytes: resizablePositions,
        })).toThrow(/non-shared non-resizable intrinsic ArrayBuffer/);
        resizablePositions.fill(0);
      }

      const detached = fixturePositions.slice();
      structuredClone(detached.buffer, { transfer: [detached.buffer] });
      expect(() => encodePrivatePositionTrajectoryPacketV049({
        trajectoryMetadata,
        positionsBytes: detached,
      })).toThrow(/exactly 3254220 bytes|detached|unreadable/);
    } finally {
      subclassedPositions.fill(0);
      subclassedPacket.fill(0);
      packet.fill(0);
    }
  });

  it('zero-fills controlled internal byte allocations on success and error', async () => {
    const audit = await importWithZeroizationAudit();
    const packet = audit.module.encodePrivatePositionTrajectoryPacketV049({
      trajectoryMetadata,
      positionsBytes: fixturePositions,
    });
    let decoded;
    let forgedPacket;
    try {
      expect(new TextDecoder().decode(packet.subarray(0, 8))).toBe('TFP049T1');
      expectZeroization(audit.take(), [
        PRIVATE_POSITION_TRAJECTORY_PACKET_PAYLOAD_BYTES_V049,
        32,
      ]);

      decoded = audit.module.decodePrivatePositionTrajectoryPacketV049(packet);
      expect(decoded.positionsBytes.some((value) => value !== 0)).toBe(true);
      expectZeroization(audit.take(), [packet.byteLength, 32]);

      expect(audit.module.privatePositionTrajectoryPacketDigestV049(packet))
        .toMatch(/^sha256:[0-9a-f]{64}$/);
      expectZeroization(audit.take(), [packet.byteLength, 32]);

      const corrupted = packet.slice();
      try {
        corrupted[corrupted.byteLength - 1] ^= 1;
        expect(() => audit.module.decodePrivatePositionTrajectoryPacketV049(corrupted))
          .toThrow(/trailer/);
        expectZeroization(audit.take(), [corrupted.byteLength, 32]);
      } finally {
        corrupted.fill(0);
      }

      const escalated = structuredClone(trajectoryMetadata);
      escalated.scientificBoundary.promotionEligible = true;
      refreshMetadataDigest(escalated);
      expect(() => audit.module.encodePrivatePositionTrajectoryPacketV049({
        trajectoryMetadata: escalated,
        positionsBytes: fixturePositions,
      })).toThrow();
      expectZeroization(audit.take(), [PRIVATE_POSITION_TRAJECTORY_PACKET_PAYLOAD_BYTES_V049]);

      forgedPacket = forgePacket(
        canonicalPrivatePositionTrajectoryPacketJsonV049(escalated),
        fixturePositions,
      );
      expect(() => audit.module.decodePrivatePositionTrajectoryPacketV049(forgedPacket))
        .toThrow();
      expectZeroization(audit.take(), [
        forgedPacket.byteLength,
        PRIVATE_POSITION_TRAJECTORY_PACKET_PAYLOAD_BYTES_V049,
        32,
      ]);

      expect(new TextDecoder().decode(packet.subarray(0, 8))).toBe('TFP049T1');
      expect(fixturePositions.some((value) => value !== 0)).toBe(true);
      expect(decoded.positionsBytes.some((value) => value !== 0)).toBe(true);
    } finally {
      decoded?.positionsBytes.fill(0);
      forgedPacket?.fill(0);
      packet.fill(0);
    }
  }, 30_000);
});

function encodeFixture() {
  return encodePrivatePositionTrajectoryPacketV049({
    trajectoryMetadata,
    positionsBytes: fixturePositions,
  });
}

function mutate(source, callback) {
  const copy = source.slice();
  callback(copy);
  return copy;
}

function appendByte(source, value) {
  const copy = new Uint8Array(source.byteLength + 1);
  copy.set(source);
  copy[source.byteLength] = value;
  return copy;
}

function forgePacket(metadataText, positions) {
  const metadataBytes = new TextEncoder().encode(metadataText);
  const trailerOffset = PRIVATE_POSITION_TRAJECTORY_PACKET_PREFIX_BYTES_V049
    + metadataBytes.byteLength
    + positions.byteLength;
  const packet = new Uint8Array(
    trailerOffset + PRIVATE_POSITION_TRAJECTORY_PACKET_TRAILER_BYTES_V049,
  );
  packet.set(new TextEncoder().encode(PRIVATE_POSITION_TRAJECTORY_PACKET_MAGIC_V049));
  const view = new DataView(packet.buffer);
  view.setUint32(8, metadataBytes.byteLength, true);
  view.setUint32(12, positions.byteLength, true);
  packet.set(metadataBytes, PRIVATE_POSITION_TRAJECTORY_PACKET_PREFIX_BYTES_V049);
  packet.set(
    positions,
    PRIVATE_POSITION_TRAJECTORY_PACKET_PREFIX_BYTES_V049 + metadataBytes.byteLength,
  );
  packet.set(sha256(packet.subarray(0, trailerOffset)), trailerOffset);
  metadataBytes.fill(0);
  return packet;
}

function refreshMetadataDigest(metadata) {
  const payload = { ...metadata };
  Reflect.deleteProperty(payload, 'metadataDigest');
  metadata.metadataDigest = digestValue(payload);
}

function swapFrames(positions, leftOrdinal, rightOrdinal) {
  const leftOffset = leftOrdinal * PRIVATE_POSITION_TRAJECTORY_PACKET_FRAME_BYTES_V049;
  const rightOffset = rightOrdinal * PRIVATE_POSITION_TRAJECTORY_PACKET_FRAME_BYTES_V049;
  const temporary = positions.slice(
    leftOffset,
    leftOffset + PRIVATE_POSITION_TRAJECTORY_PACKET_FRAME_BYTES_V049,
  );
  positions.copyWithin(
    leftOffset,
    rightOffset,
    rightOffset + PRIVATE_POSITION_TRAJECTORY_PACKET_FRAME_BYTES_V049,
  );
  positions.set(temporary, rightOffset);
  temporary.fill(0);
}

async function importWithZeroizationAudit() {
  const originalFill = Uint8Array.prototype.fill;
  const zeroized = [];
  Uint8Array.prototype.fill = function auditedFill(...args) {
    const result = originalFill.apply(this, args);
    let allZero = true;
    for (let index = 0; index < this.byteLength; index += 1) {
      if (this[index] !== 0) {
        allZero = false;
        break;
      }
    }
    zeroized.push({ byteLength: this.byteLength, allZero });
    return result;
  };
  let auditedModule;
  try {
    auditedModule = await import(
      './private-position-trajectory-envelope-v049.mjs?zeroization-audit'
    );
  } finally {
    Uint8Array.prototype.fill = originalFill;
  }
  return {
    module: auditedModule,
    take() {
      return zeroized.splice(0);
    },
  };
}

function expectZeroization(entries, expectedByteLengths) {
  expect(entries.length).toBeGreaterThan(0);
  expect(entries.every((entry) => entry.allZero)).toBe(true);
  for (const byteLength of expectedByteLengths) {
    expect(entries.some((entry) => entry.byteLength === byteLength)).toBe(true);
  }
}

function digestBytes(bytes) {
  return `sha256:${bytesToHex(sha256(bytes))}`;
}
