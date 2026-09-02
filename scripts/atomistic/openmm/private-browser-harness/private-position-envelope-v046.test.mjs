import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { describe, expect, it } from 'vitest';
import { digestValue } from '../../../../lib/simulation/digest.ts';
import {
  createAtomisticPrivatePositionFrameMetadataV047,
} from '../../../../lib/simulation/atomistic-private-position-frame-v047.ts';
import {
  PRIVATE_POSITION_PACKET_MAGIC_V047,
  PRIVATE_POSITION_PACKET_PAYLOAD_BYTES_V047,
  PRIVATE_POSITION_PACKET_PREFIX_BYTES_V047,
  PRIVATE_POSITION_PACKET_TRAILER_BYTES_V047,
  canonicalPrivatePositionPacketJsonV047,
  decodePrivatePositionPacketV047,
  encodePrivatePositionPacketV047,
  privatePositionPacketDigestV047,
} from './private-position-envelope-v046.mjs';

describe('V047 sanitized private-browser position packet', () => {
  it('encodes exactly canonical V047 frame metadata, F32LE positions, and one trailer', () => {
    const fixture = makePacketFixture();
    const envelope = encodePrivatePositionPacketV047({
      frameMetadata: fixture.frameMetadata,
      positionsBytes: fixture.positions,
    });
    const view = new DataView(envelope.buffer, envelope.byteOffset, envelope.byteLength);
    const metadataLength = view.getUint32(8, true);
    const payloadLength = view.getUint32(12, true);
    const payloadOffset = PRIVATE_POSITION_PACKET_PREFIX_BYTES_V047 + metadataLength;
    const trailerOffset = payloadOffset + payloadLength;

    expect(new TextDecoder().decode(envelope.subarray(0, 8)))
      .toBe(PRIVATE_POSITION_PACKET_MAGIC_V047);
    expect(payloadLength).toBe(PRIVATE_POSITION_PACKET_PAYLOAD_BYTES_V047);
    expect(envelope.byteLength).toBe(
      PRIVATE_POSITION_PACKET_PREFIX_BYTES_V047
        + metadataLength
        + PRIVATE_POSITION_PACKET_PAYLOAD_BYTES_V047
        + PRIVATE_POSITION_PACKET_TRAILER_BYTES_V047,
    );
    expect(new TextDecoder().decode(envelope.subarray(16, payloadOffset)))
      .toBe(canonicalPrivatePositionPacketJsonV047(fixture.frameMetadata));
    expect(envelope.subarray(trailerOffset))
      .toEqual(sha256(envelope.subarray(0, trailerOffset)));

    const decoded = decodePrivatePositionPacketV047(envelope);
    expect(Object.keys(decoded)).toEqual(['frameMetadata', 'positionsBytes']);
    expect(decoded.frameMetadata).toEqual(fixture.frameMetadata);
    expect(decoded.positionsBytes).toEqual(fixture.positions);
    expect(decoded.positionsBytes).not.toBe(fixture.positions);
    expect(decoded.positionsBytes.buffer).not.toBe(envelope.buffer);
    expect(Object.isFrozen(decoded.frameMetadata)).toBe(true);
    expect(privatePositionPacketDigestV047(decoded.positionsBytes))
      .toBe(decoded.frameMetadata.positionChannel.sha256);

    decoded.positionsBytes[0] ^= 0xff;
    expect(decodePrivatePositionPacketV047(envelope).positionsBytes).toEqual(fixture.positions);
  });

  it('contains no full source objects, provenance paths, or velocity/force channel metadata', () => {
    const fixture = makePacketFixture();
    const envelope = encodePrivatePositionPacketV047({
      frameMetadata: fixture.frameMetadata,
      positionsBytes: fixture.positions,
    });
    const decoded = decodePrivatePositionPacketV047(envelope);
    const metadataKeys = collectKeys(decoded.frameMetadata);
    const forbiddenKeys = [
      'artifactRoot',
      'independentControlReceiptPath',
      'sourceRevision',
      'artifactManifestDigest',
      'controlReceiptDigest',
      'payloadBundleRoot',
      'preparation',
      'verification',
      'worldSessionMaterialization',
      'presentationFrameMetadata',
      'channels',
      'conversionReceipt',
      'velocityTemporalAlignment',
      'forceSemantics',
    ];
    for (const key of forbiddenKeys) expect(metadataKeys).not.toContain(key);
    expect(metadataKeys.some((key) => /velocity|force/i.test(key))).toBe(false);

    const metadataText = canonicalPrivatePositionPacketJsonV047(decoded.frameMetadata);
    for (const forbiddenValue of [
      '/private/artifacts/openmm',
      'independent-control-receipt.json',
      'arrays/reference-a-velocities.f64le',
      'arrays/reference-a-potential-forces.f64le',
    ]) expect(metadataText).not.toContain(forbiddenValue);

    expect(() => encodePrivatePositionPacketV047({
      frameMetadata: fixture.frameMetadata,
      positionsBytes: fixture.positions,
      worldSession: { artifactRoot: '/private/artifacts/openmm' },
    })).toThrow(/exactly the locked keys/);
    expect(() => encodePrivatePositionPacketV047({
      frameMetadata: fixture.frameMetadata,
      positionsBytes: fixture.positions,
      presentationFrameMetadata: { channels: {} },
    })).toThrow(/exactly the locked keys/);
  });

  it('rejects truncation, append, length, magic, payload, and trailer tampering', () => {
    const { envelope } = makeEncodedFixture();
    const mutations = [
      envelope.slice(0, -1),
      appendByte(envelope, 0),
      mutate(envelope, (bytes) => { bytes[0] ^= 1; }),
      mutate(envelope, (bytes) => {
        new DataView(bytes.buffer).setUint32(8, 1, true);
      }),
      mutate(envelope, (bytes) => {
        new DataView(bytes.buffer).setUint32(12, 32_216, true);
      }),
      mutate(envelope, (bytes) => {
        const metadataLength = new DataView(bytes.buffer).getUint32(8, true);
        bytes[PRIVATE_POSITION_PACKET_PREFIX_BYTES_V047 + metadataLength + 7] ^= 1;
      }),
      mutate(envelope, (bytes) => { bytes[bytes.length - 1] ^= 1; }),
    ];
    for (const candidate of mutations) {
      expect(() => decodePrivatePositionPacketV047(candidate)).toThrow();
    }
  });

  it('rejects noncanonical metadata and recomputed semantic or digest forgeries', () => {
    const fixture = makePacketFixture();
    const noncanonical = forgeEnvelope(
      JSON.stringify(fixture.frameMetadata, null, 2),
      fixture.positions,
    );
    expect(() => decodePrivatePositionPacketV047(noncanonical)).toThrow(/canonical JSON/);

    const withSourceRevision = structuredClone(fixture.frameMetadata);
    withSourceRevision.sourceRevision = '1234567890abcdef1234567890abcdef12345678';
    refreshMetadataDigest(withSourceRevision);

    const escalated = structuredClone(fixture.frameMetadata);
    escalated.scientificBoundary.reproduced = true;
    refreshMetadataDigest(escalated);

    const forgedPositionDigest = structuredClone(fixture.frameMetadata);
    forgedPositionDigest.binding.positionsDerivedF32Digest = digest('forged-position');
    forgedPositionDigest.positionChannel.sha256 =
      forgedPositionDigest.binding.positionsDerivedF32Digest;
    refreshMetadataDigest(forgedPositionDigest);

    for (const metadata of [withSourceRevision, escalated, forgedPositionDigest]) {
      expect(() => decodePrivatePositionPacketV047(forgeEnvelope(
        canonicalPrivatePositionPacketJsonV047(metadata),
        fixture.positions,
      ))).toThrow();
    }
  });

  it('rejects recomputed packets containing nonfinite or negative-zero F32LE positions', () => {
    const fixture = makePacketFixture();
    for (const invalid of [Number.NaN, Number.POSITIVE_INFINITY, -0]) {
      const positions = fixture.positions.slice();
      new DataView(positions.buffer).setFloat32(0, invalid, true);
      const frameMetadata = createFrameMetadata(digestBytes(positions));
      expect(() => decodePrivatePositionPacketV047(forgeEnvelope(
        canonicalPrivatePositionPacketJsonV047(frameMetadata),
        positions,
      ))).toThrow(/finite non-negative-zero F32LE/);
    }
  });

  it('zero-fills tracked internal byte copies on success and exception without clearing outputs', async () => {
    const audit = await importWithZeroizationAudit();
    const fixture = makePacketFixture();
    const envelope = audit.module.encodePrivatePositionPacketV047({
      frameMetadata: fixture.frameMetadata,
      positionsBytes: fixture.positions,
    });
    expect(new TextDecoder().decode(envelope.subarray(0, 8))).toBe('TFP047P1');
    expectZeroization(audit.take(), [32_220, 32]);

    const decoded = audit.module.decodePrivatePositionPacketV047(envelope);
    expect(decoded.positionsBytes.some((value) => value !== 0)).toBe(true);
    expectZeroization(audit.take(), [envelope.byteLength, 32]);

    expect(audit.module.privatePositionPacketDigestV047(envelope)).toMatch(/^sha256:[0-9a-f]{64}$/);
    expectZeroization(audit.take(), [envelope.byteLength, 32]);

    const corrupted = envelope.slice();
    corrupted[corrupted.length - 1] ^= 1;
    expect(() => audit.module.decodePrivatePositionPacketV047(corrupted)).toThrow(/trailer/);
    expectZeroization(audit.take(), [corrupted.byteLength, 32]);

    const escalated = structuredClone(fixture.frameMetadata);
    escalated.scientificBoundary.reproduced = true;
    refreshMetadataDigest(escalated);
    expect(() => audit.module.encodePrivatePositionPacketV047({
      frameMetadata: escalated,
      positionsBytes: fixture.positions,
    })).toThrow();
    expectZeroization(audit.take(), [32_220]);

    const forgedEnvelope = forgeEnvelope(
      canonicalPrivatePositionPacketJsonV047(escalated),
      fixture.positions,
    );
    expect(() => audit.module.decodePrivatePositionPacketV047(forgedEnvelope)).toThrow();
    expectZeroization(audit.take(), [forgedEnvelope.byteLength, 32_220, 32]);
    expect(new TextDecoder().decode(envelope.subarray(0, 8))).toBe('TFP047P1');
    expect(fixture.positions.some((value) => value !== 0)).toBe(true);
  });
});

function makePacketFixture() {
  const positions = positionF32LeBytes();
  const frameMetadata = createFrameMetadata(digestBytes(positions));
  return { positions, frameMetadata };
}

function makeEncodedFixture() {
  const fixture = makePacketFixture();
  return {
    ...fixture,
    envelope: encodePrivatePositionPacketV047({
      frameMetadata: fixture.frameMetadata,
      positionsBytes: fixture.positions,
    }),
  };
}

function createFrameMetadata(positionsDerivedF32Digest) {
  return createAtomisticPrivatePositionFrameMetadataV047({
    sessionId: 'private-browser-v047',
    sessionDigest: digest('session'),
    trajectoryDigest: digest('trajectory'),
    frameOrdinal: 37,
    frameDigest: digest('frame-37'),
    atomOrderDigest: digest('atom-order'),
    cellDigest: digest('cell'),
    topologyDigest: digest('topology'),
    step: 370,
    timePicoseconds: 0.37,
    positionsDerivedF32Digest,
  });
}

function positionF32LeBytes() {
  const positions = new Uint8Array(PRIVATE_POSITION_PACKET_PAYLOAD_BYTES_V047);
  const view = new DataView(positions.buffer);
  for (let index = 0; index < positions.byteLength / 4; index += 1) {
    view.setFloat32(index * 4, 0.01 + (index % 503) / 100, true);
  }
  return positions;
}

function mutate(source, callback) {
  const copy = source.slice();
  callback(copy);
  return copy;
}

function appendByte(source, value) {
  const copy = new Uint8Array(source.length + 1);
  copy.set(source);
  copy[source.length] = value;
  return copy;
}

function forgeEnvelope(metadataText, positions) {
  const metadataBytes = new TextEncoder().encode(metadataText);
  const trailerOffset = 16 + metadataBytes.length + positions.length;
  const envelope = new Uint8Array(trailerOffset + 32);
  envelope.set(new TextEncoder().encode('TFP047P1'));
  const view = new DataView(envelope.buffer);
  view.setUint32(8, metadataBytes.length, true);
  view.setUint32(12, positions.length, true);
  envelope.set(metadataBytes, 16);
  envelope.set(positions, 16 + metadataBytes.length);
  envelope.set(sha256(envelope.subarray(0, trailerOffset)), trailerOffset);
  return envelope;
}

function refreshMetadataDigest(metadata) {
  const payload = { ...metadata };
  Reflect.deleteProperty(payload, 'metadataDigest');
  metadata.metadataDigest = digestValue(payload);
}

function collectKeys(value, keys = []) {
  if (Array.isArray(value)) {
    for (const entry of value) collectKeys(entry, keys);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key);
      collectKeys(child, keys);
    }
  }
  return keys;
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
    auditedModule = await import('./private-position-envelope-v046.mjs?zeroization-audit');
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

function digest(value) {
  return digestBytes(new TextEncoder().encode(value));
}
