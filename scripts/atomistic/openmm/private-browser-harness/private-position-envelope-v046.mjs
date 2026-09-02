import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import {
  ATOMISTIC_PRIVATE_POSITION_BYTE_LENGTH_V047,
  ATOMISTIC_PRIVATE_POSITION_COMPONENT_COUNT_V047,
  ATOMISTIC_PRIVATE_POSITION_PARTICLE_COUNT_V047,
  assertAtomisticPrivatePositionFrameMetadataV047,
} from '../../../../lib/simulation/atomistic-private-position-frame-v047.ts';

/**
 * Strict private-browser packet for one sanitized V047 position frame.
 *
 * Binary layout:
 *   8 bytes  ASCII magic `TFP047P1`
 *   4 bytes  canonical V047 metadata byte length, unsigned little-endian
 *   4 bytes  fixed F32LE position payload byte length, unsigned little-endian
 *   N bytes  canonical V047 frame metadata JSON (no wrapper object)
 *   32220    one positionsNanometer F32LE payload
 *   32 bytes SHA-256 of every preceding byte
 *
 * Full V045 sessions, V046 presentation metadata, filesystem/provenance trees,
 * and velocity/force channel metadata are intentionally outside this format.
 */

export const PRIVATE_POSITION_PACKET_MAGIC_V047 = 'TFP047P1';
export const PRIVATE_POSITION_PACKET_METADATA_MAX_BYTES_V047 = 64 * 1024;
export const PRIVATE_POSITION_PACKET_ATOM_COUNT_V047 =
  ATOMISTIC_PRIVATE_POSITION_PARTICLE_COUNT_V047;
export const PRIVATE_POSITION_PACKET_COMPONENT_COUNT_V047 =
  ATOMISTIC_PRIVATE_POSITION_COMPONENT_COUNT_V047;
export const PRIVATE_POSITION_PACKET_PAYLOAD_BYTES_V047 =
  ATOMISTIC_PRIVATE_POSITION_BYTE_LENGTH_V047;
export const PRIVATE_POSITION_PACKET_TRAILER_BYTES_V047 = 32;
export const PRIVATE_POSITION_PACKET_PREFIX_BYTES_V047 = 16;

const UINT8_ARRAY_FILL = Uint8Array.prototype.fill;
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype);
const TYPED_ARRAY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  'buffer',
)?.get;
const ARRAY_BUFFER_RESIZABLE_GETTER = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'resizable',
)?.get;
const ENCODE_KEYS = Object.freeze(['frameMetadata', 'positionsBytes']);

export function encodePrivatePositionPacketV047(input) {
  const scope = createByteZeroizationScope();
  try {
    const record = requirePlainRecord(input, 'private position packet encode input');
    assertExactKeys(record, ENCODE_KEYS, 'private position packet encode input');
    const positions = copyBytes(
      record.positionsBytes,
      'private position packet positions',
      scope,
    );
    assertPositionsPayload(positions);
    const frameMetadata = assertBoundFrameMetadata(record.frameMetadata, positions, scope);
    const metadataBytes = scope.track(
      new TextEncoder().encode(canonicalJson(frameMetadata)),
    );
    if (metadataBytes.byteLength < 2
      || metadataBytes.byteLength > PRIVATE_POSITION_PACKET_METADATA_MAX_BYTES_V047) {
      throw new Error('private position packet canonical metadata exceeds its byte bound');
    }

    const trailerOffset = PRIVATE_POSITION_PACKET_PREFIX_BYTES_V047
      + metadataBytes.byteLength
      + positions.byteLength;
    const envelope = scope.track(new Uint8Array(
      trailerOffset + PRIVATE_POSITION_PACKET_TRAILER_BYTES_V047,
    ));
    writeMagic(envelope);
    const view = new DataView(envelope.buffer, envelope.byteOffset, envelope.byteLength);
    view.setUint32(8, metadataBytes.byteLength, true);
    view.setUint32(12, positions.byteLength, true);
    envelope.set(metadataBytes, PRIVATE_POSITION_PACKET_PREFIX_BYTES_V047);
    envelope.set(
      positions,
      PRIVATE_POSITION_PACKET_PREFIX_BYTES_V047 + metadataBytes.byteLength,
    );
    const trailerDigest = scope.track(sha256(envelope.subarray(0, trailerOffset)));
    envelope.set(trailerDigest, trailerOffset);
    return scope.release(envelope);
  } finally {
    scope.zeroAll();
  }
}

export function decodePrivatePositionPacketV047(inputBytes) {
  const scope = createByteZeroizationScope();
  try {
    const envelope = copyBytes(
      inputBytes,
      'private position packet envelope',
      scope,
    );
    const minimumBytes = PRIVATE_POSITION_PACKET_PREFIX_BYTES_V047
      + 2
      + PRIVATE_POSITION_PACKET_PAYLOAD_BYTES_V047
      + PRIVATE_POSITION_PACKET_TRAILER_BYTES_V047;
    const maximumBytes = PRIVATE_POSITION_PACKET_PREFIX_BYTES_V047
      + PRIVATE_POSITION_PACKET_METADATA_MAX_BYTES_V047
      + PRIVATE_POSITION_PACKET_PAYLOAD_BYTES_V047
      + PRIVATE_POSITION_PACKET_TRAILER_BYTES_V047;
    if (envelope.byteLength < minimumBytes || envelope.byteLength > maximumBytes) {
      throw new Error('private position packet total byte length is outside the locked bounds');
    }
    if (!hasMagic(envelope)) throw new Error('private position packet magic is invalid');

    const view = new DataView(envelope.buffer, envelope.byteOffset, envelope.byteLength);
    const metadataLength = view.getUint32(8, true);
    const payloadLength = view.getUint32(12, true);
    if (metadataLength < 2
      || metadataLength > PRIVATE_POSITION_PACKET_METADATA_MAX_BYTES_V047) {
      throw new Error('private position packet metadata length is outside the locked bounds');
    }
    if (payloadLength !== PRIVATE_POSITION_PACKET_PAYLOAD_BYTES_V047) {
      throw new Error('private position packet payload length must be exactly 32220 bytes');
    }
    const payloadOffset = PRIVATE_POSITION_PACKET_PREFIX_BYTES_V047 + metadataLength;
    const trailerOffset = payloadOffset + payloadLength;
    const expectedTotal = trailerOffset + PRIVATE_POSITION_PACKET_TRAILER_BYTES_V047;
    if (envelope.byteLength !== expectedTotal) {
      throw new Error('private position packet is truncated or has appended bytes');
    }

    const expectedTrailer = scope.track(sha256(envelope.subarray(0, trailerOffset)));
    const trailer = envelope.subarray(trailerOffset, expectedTotal);
    if (!equalBytes(expectedTrailer, trailer)) {
      throw new Error('private position packet trailer digest is invalid');
    }

    const metadataBytes = envelope.subarray(
      PRIVATE_POSITION_PACKET_PREFIX_BYTES_V047,
      payloadOffset,
    );
    const metadataText = decodeStrictUtf8(metadataBytes);
    let parsed;
    try {
      parsed = JSON.parse(metadataText);
    } catch (error) {
      throw new SyntaxError('private position packet metadata is not valid JSON', { cause: error });
    }
    const canonicalBytes = scope.track(
      new TextEncoder().encode(canonicalJson(parsed)),
    );
    if (!equalBytes(metadataBytes, canonicalBytes)) {
      throw new Error('private position packet metadata is not canonical JSON');
    }

    const positions = scope.track(envelope.slice(payloadOffset, trailerOffset));
    assertPositionsPayload(positions);
    const frameMetadata = assertBoundFrameMetadata(parsed, positions, scope);
    const result = Object.freeze({ frameMetadata, positionsBytes: positions });
    scope.release(positions);
    return result;
  } finally {
    scope.zeroAll();
  }
}

export function canonicalPrivatePositionPacketJsonV047(value) {
  return canonicalJson(value);
}

export function privatePositionPacketDigestV047(inputBytes) {
  const scope = createByteZeroizationScope();
  try {
    const bytes = copyBytes(
      inputBytes,
      'private position packet digest input',
      scope,
    );
    return digestBytes(bytes, scope);
  } finally {
    scope.zeroAll();
  }
}

function assertBoundFrameMetadata(candidate, positions, scope) {
  const frameMetadata = assertAtomisticPrivatePositionFrameMetadataV047(candidate);
  const positionsDigest = digestBytes(positions, scope);
  if (positionsDigest !== frameMetadata.positionChannel.sha256
    || positionsDigest !== frameMetadata.binding.positionsDerivedF32Digest) {
    throw new Error('private position packet positions digest binding is invalid');
  }
  return frameMetadata;
}

function assertPositionsPayload(positions) {
  if (positions.byteLength !== PRIVATE_POSITION_PACKET_PAYLOAD_BYTES_V047) {
    throw new Error('private position packet positions must contain exactly 32220 bytes');
  }
  const view = new DataView(positions.buffer, positions.byteOffset, positions.byteLength);
  for (let offset = 0; offset < positions.byteLength; offset += 4) {
    const value = view.getFloat32(offset, true);
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error('private position packet positions must be finite non-negative-zero F32LE values');
    }
  }
}

function writeMagic(target) {
  for (let index = 0; index < PRIVATE_POSITION_PACKET_MAGIC_V047.length; index += 1) {
    target[index] = PRIVATE_POSITION_PACKET_MAGIC_V047.charCodeAt(index);
  }
}

function hasMagic(candidate) {
  for (let index = 0; index < PRIVATE_POSITION_PACKET_MAGIC_V047.length; index += 1) {
    if (candidate[index] !== PRIVATE_POSITION_PACKET_MAGIC_V047.charCodeAt(index)) return false;
  }
  return true;
}

function copyBytes(value, label, scope) {
  if (!(value instanceof Uint8Array)) throw new TypeError(`${label} must be a Uint8Array`);
  let buffer;
  let resizable = false;
  try {
    buffer = TYPED_ARRAY_BUFFER_GETTER?.call(value);
    resizable = ARRAY_BUFFER_RESIZABLE_GETTER?.call(buffer) === true;
  } catch (error) {
    throw new TypeError(`${label} cannot be detached or unreadable`, { cause: error });
  }
  if (!(buffer instanceof ArrayBuffer) || resizable) {
    throw new TypeError(`${label} must use one non-shared non-resizable ArrayBuffer`);
  }
  const copy = scope.track(new Uint8Array(value.byteLength));
  try {
    copy.set(value);
  } catch (error) {
    throw new TypeError(`${label} cannot be detached or unreadable`, { cause: error });
  }
  return copy;
}

function createByteZeroizationScope() {
  const tracked = new Set();
  return {
    track(bytes) {
      if (!(bytes instanceof Uint8Array)) {
        throw new TypeError('private position packet internal byte allocation must be a Uint8Array');
      }
      tracked.add(bytes);
      return bytes;
    },
    release(bytes) {
      if (!tracked.delete(bytes)) {
        throw new Error('private position packet cannot release an untracked byte allocation');
      }
      return bytes;
    },
    zeroAll() {
      const failures = [];
      for (const bytes of tracked) {
        try {
          UINT8_ARRAY_FILL.call(bytes, 0);
        } catch (error) {
          failures.push(error);
        }
      }
      tracked.clear();
      if (failures.length > 0) {
        throw new AggregateError(
          failures,
          'private position packet internal byte zeroization failed',
        );
      }
    },
  };
}

function canonicalJson(value, ancestors = new Set()) {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON forbids non-finite numbers');
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new TypeError(`canonical JSON forbids ${typeof value} values`);
  }
  if (ancestors.has(value)) throw new TypeError('canonical JSON forbids cyclic values');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      return `[${value.map((entry) => canonicalJson(entry, ancestors)).join(',')}]`;
    }
    const record = requirePlainRecord(value, 'canonical JSON value');
    const entries = Object.keys(record).sort().map((key) => {
      if (record[key] === undefined) throw new TypeError('canonical JSON forbids undefined values');
      return `${JSON.stringify(key)}:${canonicalJson(record[key], ancestors)}`;
    });
    return `{${entries.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

function assertExactKeys(record, expectedKeys, label) {
  const descriptors = Object.getOwnPropertyDescriptors(record);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.some((key) => typeof key !== 'string')) {
    throw new Error(`${label} must contain only locked string keys`);
  }
  const actualKeys = ownKeys.sort();
  const expected = [...expectedKeys].sort();
  if (!exactArray(actualKeys, expected)) {
    throw new Error(`${label} must contain exactly the locked keys`);
  }
  for (const key of actualKeys) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
      throw new Error(`${label}.${key} must be one enumerable defined data property`);
    }
  }
}

function exactArray(candidate, expected) {
  return Array.isArray(candidate)
    && candidate.length === expected.length
    && candidate.every((value, index) => value === expected[index]);
}

function requirePlainRecord(value, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new TypeError(`${label} must be a plain JSON record`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError(`${label} must be a plain JSON record`);
  }
  return value;
}

function decodeStrictUtf8(bytes) {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new SyntaxError('private position packet metadata is not strict UTF-8', { cause: error });
  }
}

function digestBytes(bytes, scope) {
  const digest = scope.track(sha256(bytes));
  return `sha256:${bytesToHex(digest)}`;
}

function equalBytes(left, right) {
  if (left.byteLength !== right.byteLength) return false;
  let difference = 0;
  for (let index = 0; index < left.byteLength; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}
