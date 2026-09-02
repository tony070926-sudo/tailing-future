import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import {
  ATOMISTIC_PRIVATE_BROWSER_POSITION_TRAJECTORY_BYTE_LENGTH_V049,
  ATOMISTIC_PRIVATE_BROWSER_POSITION_TRAJECTORY_FRAME_BYTE_LENGTH_V049,
  ATOMISTIC_PRIVATE_BROWSER_POSITION_TRAJECTORY_FRAME_COUNT_V049,
  assertAtomisticPrivateBrowserPositionTrajectoryMetadataV049,
} from '../../../../lib/simulation/atomistic-private-browser-position-trajectory-v049.ts';

/**
 * Strict private-browser packet for one complete V049 positions trajectory.
 *
 * Binary layout:
 *   8 bytes    ASCII magic `TFP049T1`
 *   4 bytes    canonical V049 metadata byte length, unsigned little-endian
 *   4 bytes    fixed F32LE position payload byte length, unsigned little-endian
 *   N bytes    canonical V049 trajectory metadata JSON (no wrapper object)
 *   3,254,220  101 ordered positionsNanometer F32LE frames
 *   32 bytes   SHA-256 of every preceding byte
 *
 * No source F64 bytes, velocities, forces, energies, filesystem paths, or
 * publication authority are represented by this transport.
 */

export const PRIVATE_POSITION_TRAJECTORY_PACKET_MAGIC_V049 = 'TFP049T1';
export const PRIVATE_POSITION_TRAJECTORY_PACKET_METADATA_MAX_BYTES_V049 = 65_536;
export const PRIVATE_POSITION_TRAJECTORY_PACKET_FRAME_COUNT_V049 =
  ATOMISTIC_PRIVATE_BROWSER_POSITION_TRAJECTORY_FRAME_COUNT_V049;
export const PRIVATE_POSITION_TRAJECTORY_PACKET_FRAME_BYTES_V049 =
  ATOMISTIC_PRIVATE_BROWSER_POSITION_TRAJECTORY_FRAME_BYTE_LENGTH_V049;
export const PRIVATE_POSITION_TRAJECTORY_PACKET_PAYLOAD_BYTES_V049 =
  ATOMISTIC_PRIVATE_BROWSER_POSITION_TRAJECTORY_BYTE_LENGTH_V049;
export const PRIVATE_POSITION_TRAJECTORY_PACKET_TRAILER_BYTES_V049 = 32;
export const PRIVATE_POSITION_TRAJECTORY_PACKET_PREFIX_BYTES_V049 = 16;

const ENCODE_KEYS = Object.freeze(['positionsBytes', 'trajectoryMetadata']);
const UINT8_ARRAY_FILL = Uint8Array.prototype.fill;
const UINT8_ARRAY_SET = Uint8Array.prototype.set;
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype);
const TYPED_ARRAY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  'buffer',
)?.get;
const TYPED_ARRAY_BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  'byteLength',
)?.get;
const ARRAY_BUFFER_RESIZABLE_GETTER = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'resizable',
)?.get;

if (typeof TYPED_ARRAY_BUFFER_GETTER !== 'function'
  || typeof TYPED_ARRAY_BYTE_LENGTH_GETTER !== 'function') {
  throw new Error('V049 trajectory packet requires intrinsic typed-array accessors');
}

export function encodePrivatePositionTrajectoryPacketV049(input) {
  const scope = createByteZeroizationScope();
  try {
    const record = snapshotExactInput(
      requirePlainRecord(input, 'private position trajectory packet encode input'),
      ENCODE_KEYS,
      'private position trajectory packet encode input',
    );
    const positions = copyIntrinsicFixedBytes(
      record.positionsBytes,
      PRIVATE_POSITION_TRAJECTORY_PACKET_PAYLOAD_BYTES_V049,
      'private position trajectory packet positions',
      scope,
    );
    assertPositionsPayload(positions);
    const trajectoryMetadata = assertBoundTrajectoryMetadata(
      record.trajectoryMetadata,
      positions,
      scope,
    );
    const metadataBytes = scope.track(
      new TextEncoder().encode(canonicalJson(trajectoryMetadata)),
    );
    if (metadataBytes.byteLength < 2
      || metadataBytes.byteLength > PRIVATE_POSITION_TRAJECTORY_PACKET_METADATA_MAX_BYTES_V049) {
      throw new Error('private position trajectory packet canonical metadata exceeds its byte bound');
    }

    const trailerOffset = PRIVATE_POSITION_TRAJECTORY_PACKET_PREFIX_BYTES_V049
      + metadataBytes.byteLength
      + positions.byteLength;
    const envelope = scope.track(new Uint8Array(
      trailerOffset + PRIVATE_POSITION_TRAJECTORY_PACKET_TRAILER_BYTES_V049,
    ));
    writeMagic(envelope);
    const view = new DataView(envelope.buffer, envelope.byteOffset, envelope.byteLength);
    view.setUint32(8, metadataBytes.byteLength, true);
    view.setUint32(12, positions.byteLength, true);
    UINT8_ARRAY_SET.call(
      envelope,
      metadataBytes,
      PRIVATE_POSITION_TRAJECTORY_PACKET_PREFIX_BYTES_V049,
    );
    UINT8_ARRAY_SET.call(
      envelope,
      positions,
      PRIVATE_POSITION_TRAJECTORY_PACKET_PREFIX_BYTES_V049 + metadataBytes.byteLength,
    );
    const trailerDigest = scope.track(sha256(envelope.subarray(0, trailerOffset)));
    UINT8_ARRAY_SET.call(envelope, trailerDigest, trailerOffset);
    return scope.release(envelope);
  } finally {
    scope.zeroAll();
  }
}

export function decodePrivatePositionTrajectoryPacketV049(inputBytes) {
  const scope = createByteZeroizationScope();
  try {
    const envelope = copyIntrinsicBytes(
      inputBytes,
      'private position trajectory packet envelope',
      scope,
    );
    const minimumBytes = PRIVATE_POSITION_TRAJECTORY_PACKET_PREFIX_BYTES_V049
      + 2
      + PRIVATE_POSITION_TRAJECTORY_PACKET_PAYLOAD_BYTES_V049
      + PRIVATE_POSITION_TRAJECTORY_PACKET_TRAILER_BYTES_V049;
    const maximumBytes = PRIVATE_POSITION_TRAJECTORY_PACKET_PREFIX_BYTES_V049
      + PRIVATE_POSITION_TRAJECTORY_PACKET_METADATA_MAX_BYTES_V049
      + PRIVATE_POSITION_TRAJECTORY_PACKET_PAYLOAD_BYTES_V049
      + PRIVATE_POSITION_TRAJECTORY_PACKET_TRAILER_BYTES_V049;
    if (envelope.byteLength < minimumBytes || envelope.byteLength > maximumBytes) {
      throw new Error('private position trajectory packet total byte length is outside the locked bounds');
    }
    if (!hasMagic(envelope)) {
      throw new Error('private position trajectory packet magic is invalid');
    }

    const view = new DataView(envelope.buffer, envelope.byteOffset, envelope.byteLength);
    const metadataLength = view.getUint32(8, true);
    const payloadLength = view.getUint32(12, true);
    if (metadataLength < 2
      || metadataLength > PRIVATE_POSITION_TRAJECTORY_PACKET_METADATA_MAX_BYTES_V049) {
      throw new Error('private position trajectory packet metadata length is outside the locked bounds');
    }
    if (payloadLength !== PRIVATE_POSITION_TRAJECTORY_PACKET_PAYLOAD_BYTES_V049) {
      throw new Error(
        'private position trajectory packet payload length must be exactly 3254220 bytes',
      );
    }
    const payloadOffset = PRIVATE_POSITION_TRAJECTORY_PACKET_PREFIX_BYTES_V049 + metadataLength;
    const trailerOffset = payloadOffset + payloadLength;
    const expectedTotal = trailerOffset + PRIVATE_POSITION_TRAJECTORY_PACKET_TRAILER_BYTES_V049;
    if (envelope.byteLength !== expectedTotal) {
      throw new Error('private position trajectory packet is truncated or has appended bytes');
    }

    const expectedTrailer = scope.track(sha256(envelope.subarray(0, trailerOffset)));
    const trailer = envelope.subarray(trailerOffset, expectedTotal);
    if (!equalBytes(expectedTrailer, trailer)) {
      throw new Error('private position trajectory packet trailer digest is invalid');
    }

    const metadataBytes = envelope.subarray(
      PRIVATE_POSITION_TRAJECTORY_PACKET_PREFIX_BYTES_V049,
      payloadOffset,
    );
    const metadataText = decodeStrictUtf8(metadataBytes);
    let parsed;
    try {
      parsed = JSON.parse(metadataText);
    } catch (error) {
      throw new SyntaxError('private position trajectory packet metadata is not valid JSON', {
        cause: error,
      });
    }
    const canonicalBytes = scope.track(new TextEncoder().encode(canonicalJson(parsed)));
    if (!equalBytes(metadataBytes, canonicalBytes)) {
      throw new Error('private position trajectory packet metadata is not canonical JSON');
    }

    const positions = scope.track(envelope.slice(payloadOffset, trailerOffset));
    assertPositionsPayload(positions);
    const trajectoryMetadata = assertBoundTrajectoryMetadata(parsed, positions, scope);
    const result = Object.freeze({ trajectoryMetadata, positionsBytes: positions });
    scope.release(positions);
    return result;
  } finally {
    scope.zeroAll();
  }
}

export function canonicalPrivatePositionTrajectoryPacketJsonV049(value) {
  return canonicalJson(value);
}

export function privatePositionTrajectoryPacketDigestV049(inputBytes) {
  const scope = createByteZeroizationScope();
  try {
    const bytes = copyIntrinsicBytes(
      inputBytes,
      'private position trajectory packet digest input',
      scope,
    );
    return digestBytes(bytes, scope);
  } finally {
    scope.zeroAll();
  }
}

function assertBoundTrajectoryMetadata(candidate, positions, scope) {
  const trajectoryMetadata = assertAtomisticPrivateBrowserPositionTrajectoryMetadataV049(candidate);
  const positionTrajectoryDigest = digestBytes(positions, scope);
  if (positionTrajectoryDigest !== trajectoryMetadata.positionChannel.sha256) {
    throw new Error('private position trajectory packet payload digest binding is invalid');
  }
  const frames = trajectoryMetadata.sequence.frames;
  if (!Array.isArray(frames)
    || frames.length !== PRIVATE_POSITION_TRAJECTORY_PACKET_FRAME_COUNT_V049) {
    throw new Error('private position trajectory packet frame inventory is invalid');
  }
  for (let frameOrdinal = 0; frameOrdinal < frames.length; frameOrdinal += 1) {
    const frame = frames[frameOrdinal];
    const byteOffset = frameOrdinal * PRIVATE_POSITION_TRAJECTORY_PACKET_FRAME_BYTES_V049;
    if (frame.frameOrdinal !== frameOrdinal
      || frame.byteOffset !== byteOffset
      || frame.byteLength !== PRIVATE_POSITION_TRAJECTORY_PACKET_FRAME_BYTES_V049) {
      throw new Error(`private position trajectory packet frame ${frameOrdinal} layout is invalid`);
    }
    const frameDigest = digestBytes(
      positions.subarray(byteOffset, byteOffset + frame.byteLength),
      scope,
    );
    if (frameDigest !== frame.positionsDerivedF32Digest) {
      throw new Error(
        `private position trajectory packet frame ${frameOrdinal} digest binding is invalid`,
      );
    }
  }
  return trajectoryMetadata;
}

function assertPositionsPayload(positions) {
  if (positions.byteLength !== PRIVATE_POSITION_TRAJECTORY_PACKET_PAYLOAD_BYTES_V049) {
    throw new Error(
      'private position trajectory packet positions must contain exactly 3254220 bytes',
    );
  }
  const view = new DataView(positions.buffer, positions.byteOffset, positions.byteLength);
  for (let offset = 0; offset < positions.byteLength; offset += 4) {
    const value = view.getFloat32(offset, true);
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error(
        'private position trajectory packet positions must be finite non-negative-zero F32LE values',
      );
    }
  }
}

function writeMagic(target) {
  for (let index = 0; index < PRIVATE_POSITION_TRAJECTORY_PACKET_MAGIC_V049.length;
    index += 1) {
    target[index] = PRIVATE_POSITION_TRAJECTORY_PACKET_MAGIC_V049.charCodeAt(index);
  }
}

function hasMagic(candidate) {
  for (let index = 0; index < PRIVATE_POSITION_TRAJECTORY_PACKET_MAGIC_V049.length;
    index += 1) {
    if (candidate[index] !== PRIVATE_POSITION_TRAJECTORY_PACKET_MAGIC_V049.charCodeAt(index)) {
      return false;
    }
  }
  return true;
}

function copyIntrinsicFixedBytes(value, expectedByteLength, label, scope) {
  const byteLength = intrinsicByteLength(value, label);
  if (byteLength !== expectedByteLength) {
    throw new TypeError(`${label} must contain exactly ${expectedByteLength} bytes`);
  }
  return copyKnownLength(value, byteLength, label, scope);
}

function copyIntrinsicBytes(value, label, scope) {
  const byteLength = intrinsicByteLength(value, label);
  return copyKnownLength(value, byteLength, label, scope);
}

function intrinsicByteLength(value, label) {
  if (value === null || typeof value !== 'object'
    || Object.getPrototypeOf(value) !== Uint8Array.prototype) {
    throw new TypeError(`${label} must be one intrinsic Uint8Array`);
  }
  let buffer;
  let byteLength;
  let resizable = false;
  try {
    buffer = TYPED_ARRAY_BUFFER_GETTER.call(value);
    byteLength = TYPED_ARRAY_BYTE_LENGTH_GETTER.call(value);
    if (Object.getPrototypeOf(buffer) === ArrayBuffer.prototype
      && typeof ARRAY_BUFFER_RESIZABLE_GETTER === 'function') {
      resizable = ARRAY_BUFFER_RESIZABLE_GETTER.call(buffer) === true;
    }
    // A detached intrinsic ArrayBuffer retains its prototype and reports a
    // zero-length typed-array view, but cannot back even an empty DataView.
    // Probe the brand before accepting the buffer as readable ownership.
    void new DataView(buffer, 0, 0);
  } catch (error) {
    throw new TypeError(`${label} cannot be detached, proxied, or unreadable`, { cause: error });
  }
  if (Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype || resizable) {
    throw new TypeError(`${label} must use one non-shared non-resizable intrinsic ArrayBuffer`);
  }
  if (!Number.isSafeInteger(byteLength) || byteLength < 0) {
    throw new TypeError(`${label} byte length is invalid`);
  }
  return byteLength;
}

function copyKnownLength(value, byteLength, label, scope) {
  const copy = scope.track(new Uint8Array(byteLength));
  try {
    UINT8_ARRAY_SET.call(copy, value);
  } catch (error) {
    throw new TypeError(`${label} cannot be copied`, { cause: error });
  }
  return copy;
}

function createByteZeroizationScope() {
  const tracked = new Set();
  return {
    track(bytes) {
      if (Object.getPrototypeOf(bytes) !== Uint8Array.prototype) {
        throw new TypeError(
          'private position trajectory packet internal allocation must be a Uint8Array',
        );
      }
      tracked.add(bytes);
      return bytes;
    },
    release(bytes) {
      if (!tracked.delete(bytes)) {
        throw new Error(
          'private position trajectory packet cannot release an untracked byte allocation',
        );
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
          'private position trajectory packet internal byte zeroization failed',
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

function snapshotExactInput(record, expectedKeys, label) {
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
  const snapshot = Object.create(null);
  for (const key of actualKeys) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
      throw new Error(`${label}.${key} must be one enumerable defined data property`);
    }
    snapshot[key] = descriptor.value;
  }
  return Object.freeze(snapshot);
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
    throw new SyntaxError('private position trajectory packet metadata is not strict UTF-8', {
      cause: error,
    });
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
