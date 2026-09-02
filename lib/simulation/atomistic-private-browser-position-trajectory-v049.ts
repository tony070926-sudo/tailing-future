import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { digestValue } from './digest.ts';

/**
 * Sanitized browser projection of the private V048 positions trajectory.
 * It deliberately excludes source paths, revisions, receipts, manifests,
 * source F64 digests, geometry gates, velocities, forces, and energies.
 */

export const ATOMISTIC_PRIVATE_BROWSER_POSITION_TRAJECTORY_VERSION_V049 =
  'tf.atomistic-private-browser-position-trajectory/0.4.9' as const;
export const ATOMISTIC_PRIVATE_BROWSER_POSITION_TRAJECTORY_REVOCATION_VERSION_V049 =
  'tf.atomistic-private-browser-position-trajectory-revocation/0.4.9' as const;
export const ATOMISTIC_PRIVATE_BROWSER_POSITION_TRAJECTORY_FRAME_COUNT_V049 = 101 as const;
export const ATOMISTIC_PRIVATE_BROWSER_POSITION_TRAJECTORY_FRAME_BYTE_LENGTH_V049 =
  32_220 as const;
export const ATOMISTIC_PRIVATE_BROWSER_POSITION_TRAJECTORY_BYTE_LENGTH_V049 =
  3_254_220 as const;
export const ATOMISTIC_PRIVATE_BROWSER_POSITION_TRAJECTORY_COMPONENT_COUNT_V049 =
  813_555 as const;

const DIGEST = /^sha256:(?!0{64}$)[0-9a-f]{64}$/;
const UINT8_ARRAY_FILL = Uint8Array.prototype.fill;
const UINT8_ARRAY_SLICE = Uint8Array.prototype.slice;
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype) as object;
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

export type AtomisticPrivateBrowserPositionTrajectoryBindingV049 = Readonly<{
  sourceTrajectoryMetadataDigest: string;
  sessionDigest: string;
  trajectoryDigest: string;
  atomOrderDigest: string;
  cellDigest: string;
  topologyDigest: string;
}>;

export type AtomisticPrivateBrowserPositionTrajectoryFrameV049 = Readonly<{
  frameOrdinal: number;
  step: number;
  timePicoseconds: number;
  sourceFrameDigest: string;
  positionsDerivedF32Digest: string;
  byteOffset: number;
  byteLength: 32_220;
  positionFrameDigest: string;
}>;

export type AtomisticPrivateBrowserPositionTrajectoryMetadataV049 = Readonly<{
  schemaVersion: typeof ATOMISTIC_PRIVATE_BROWSER_POSITION_TRAJECTORY_VERSION_V049;
  status: 'sanitized-private-101-frame-position-trajectory-execution-unattested';
  sourceSchemaVersion: 'tf.atomistic-private-position-trajectory/0.4.8';
  binding: AtomisticPrivateBrowserPositionTrajectoryBindingV049;
  inventory: Readonly<{
    waterMoleculeCount: 895;
    particleCount: 2_685;
    oxygenCount: 895;
    hydrogenCount: 1_790;
    topologyLinkCount: 1_790;
    frameCount: 101;
  }>;
  cell: Readonly<{
    kind: 'locked-three-nanometer-orthorhombic-periodic-cell';
    vectorsNanometer: readonly [
      readonly [3, 0, 0],
      readonly [0, 3, 0],
      readonly [0, 0, 3],
    ];
    periodicAxes: readonly [true, true, true];
    coordinateGauge:
      'source-unwrapped-oxygen-anchor-with-cubic-minimum-image-internal-sites';
  }>;
  sequence: Readonly<{
    firstFrameOrdinal: 0;
    lastFrameOrdinal: 100;
    sampleStrideSteps: 10;
    sampleIntervalPicoseconds: 0.01;
    frameByteLength: 32_220;
    trajectoryByteLength: 3_254_220;
    orderedPositionFrameDigest: string;
    frames: ReadonlyArray<AtomisticPrivateBrowserPositionTrajectoryFrameV049>;
  }>;
  positionChannel: Readonly<{
    channel: 'positionsNanometer';
    unit: 'nanometer';
    dtype: 'float32-le';
    encoding: 'ieee754-float32-little-endian';
    shape: readonly [101, 2_685, 3];
    componentCount: 813_555;
    byteLength: 3_254_220;
    sha256: string;
  }>;
  scientificBoundary: Readonly<{
    sourceEvidenceClass: 'digest-bound-derived-position-frames-execution-origin-unattested';
    rawPayloadChannelsIncluded: readonly ['positionsNanometer'];
    rawPayloadChannelsOmitted: readonly [
      'velocitiesNanometerPerPicosecond',
      'potentialForcesKjMolNanometer',
      'energies',
    ];
    topologyLinkMeaning:
      'adjacency-and-rigid-constraint-not-energetic-bond-or-bond-order';
    completePhysicalStateIncluded: false;
    solverFrameOriginVerified: false;
    createsSolverFrames: false;
    interpolationApplied: false;
    extrapolationApplied: false;
    motionSynthesizedByThisAdapter: false;
    repeatedDrawCreatesTrajectoryFrame: false;
    executionAuthenticityVerified: false;
    reproduced: false;
    protectedMainArtifact: false;
    attestedArtifact: false;
    sourceLicenseForPublicDistributionVerified: false;
    promotionEligible: false;
    publicDistributionEligible: false;
    cloudflareDistributionEligible: false;
  }>;
  metadataDigest: string;
}>;

export type AtomisticPrivateBrowserPositionTrajectoryFrameHandleV049 = Readonly<{
  trajectoryMetadataDigest: string;
  binding: AtomisticPrivateBrowserPositionTrajectoryBindingV049;
  frame: AtomisticPrivateBrowserPositionTrajectoryFrameV049;
  lifecycle: Readonly<{
    ownerRevocationAuthorityExposed: false;
    externalCopiesRevokedOnOwnerRevocation: false;
  }>;
  copyPositionBytes: () => Uint8Array;
  isRevoked: () => boolean;
}>;

export type AtomisticPrivateBrowserPositionTrajectoryHandleV049 = Readonly<{
  metadata: AtomisticPrivateBrowserPositionTrajectoryMetadataV049;
  lifecycle: Readonly<{
    privatePositionByteRetention:
      'one-contiguous-3254220-byte-owner-until-revocation-or-garbage-collection';
    ownerRevocationSemantics: 'idempotent-zero-fill-and-reference-clear';
    ownerRevocationAuthorityExposedOnReadHandle: false;
    externalCopiesRevokedOnOwnerRevocation: false;
  }>;
  getFrameHandle: (frameOrdinal: number) =>
    AtomisticPrivateBrowserPositionTrajectoryFrameHandleV049;
  copyFramePositionBytes: (frameOrdinal: number) => Uint8Array;
  isRevoked: () => boolean;
}>;

export type AtomisticPrivateBrowserPositionTrajectoryControllerV049 = Readonly<{
  handle: AtomisticPrivateBrowserPositionTrajectoryHandleV049;
  revoke: () => Readonly<{
    schemaVersion:
      typeof ATOMISTIC_PRIVATE_BROWSER_POSITION_TRAJECTORY_REVOCATION_VERSION_V049;
    status: 'revoked';
    metadataDigest: string;
    frameCountZeroFilled: 101;
    positionByteLengthZeroFilled: 3_254_220;
    internalReferenceCleared: true;
    previouslyIssuedCopiesRevoked: false;
    runtimeOrGpuCopiesRevoked: false;
    securePhysicalErasureVerified: false;
  }>;
}>;

export function assertAtomisticPrivateBrowserPositionTrajectoryMetadataV049(
  candidate: unknown,
): AtomisticPrivateBrowserPositionTrajectoryMetadataV049 {
  const clone = safePlainClone(candidate, 'private browser position trajectory metadata') as
    AtomisticPrivateBrowserPositionTrajectoryMetadataV049;
  assertExactKeys(clone, [
    'schemaVersion', 'status', 'sourceSchemaVersion', 'binding', 'inventory', 'cell',
    'sequence', 'positionChannel', 'scientificBoundary', 'metadataDigest',
  ], 'private browser position trajectory metadata');
  if (clone.schemaVersion !== ATOMISTIC_PRIVATE_BROWSER_POSITION_TRAJECTORY_VERSION_V049
    || clone.status
      !== 'sanitized-private-101-frame-position-trajectory-execution-unattested'
    || clone.sourceSchemaVersion !== 'tf.atomistic-private-position-trajectory/0.4.8') {
    throw new Error('private browser position trajectory identity changed');
  }
  const binding = assertBinding(clone.binding);
  assertLiteralRecord(clone.inventory, {
    waterMoleculeCount: 895,
    particleCount: 2_685,
    oxygenCount: 895,
    hydrogenCount: 1_790,
    topologyLinkCount: 1_790,
    frameCount: 101,
  }, 'private browser position trajectory inventory');
  assertExactKeys(clone.cell, [
    'kind', 'vectorsNanometer', 'periodicAxes', 'coordinateGauge',
  ], 'private browser position trajectory cell');
  if (clone.cell.kind !== 'locked-three-nanometer-orthorhombic-periodic-cell'
    || !exactNestedArray(clone.cell.vectorsNanometer, [[3, 0, 0], [0, 3, 0], [0, 0, 3]])
    || !exactArray(clone.cell.periodicAxes, [true, true, true])
    || clone.cell.coordinateGauge
      !== 'source-unwrapped-oxygen-anchor-with-cubic-minimum-image-internal-sites') {
    throw new Error('private browser position trajectory cell changed');
  }
  assertExactKeys(clone.sequence, [
    'firstFrameOrdinal', 'lastFrameOrdinal', 'sampleStrideSteps',
    'sampleIntervalPicoseconds', 'frameByteLength', 'trajectoryByteLength',
    'orderedPositionFrameDigest', 'frames',
  ], 'private browser position trajectory sequence');
  if (clone.sequence.firstFrameOrdinal !== 0 || clone.sequence.lastFrameOrdinal !== 100
    || clone.sequence.sampleStrideSteps !== 10
    || clone.sequence.sampleIntervalPicoseconds !== 0.01
    || clone.sequence.frameByteLength !== 32_220
    || clone.sequence.trajectoryByteLength !== 3_254_220
    || !Array.isArray(clone.sequence.frames) || clone.sequence.frames.length !== 101) {
    throw new Error('private browser position trajectory sequence changed');
  }
  assertDigest(clone.sequence.orderedPositionFrameDigest,
    'private browser ordered position frame digest');
  const sourceFrameDigests = new Set<string>();
  const positionDigests = new Set<string>();
  const positionFrameDigests = new Set<string>();
  for (let index = 0; index < clone.sequence.frames.length; index += 1) {
    const frame = clone.sequence.frames[index];
    assertFrame(frame, binding, index);
    sourceFrameDigests.add(frame.sourceFrameDigest);
    positionDigests.add(frame.positionsDerivedF32Digest);
    positionFrameDigests.add(frame.positionFrameDigest);
  }
  if (sourceFrameDigests.size !== 101 || positionDigests.size !== 101
    || positionFrameDigests.size !== 101) {
    throw new Error('private browser position trajectory requires 101 distinct frame identities');
  }
  if (clone.sequence.orderedPositionFrameDigest
    !== createAtomisticPrivateBrowserOrderedPositionFrameDigestV049(clone.sequence.frames)) {
    throw new Error('private browser ordered position frame digest is stale');
  }
  assertExactKeys(clone.positionChannel, [
    'channel', 'unit', 'dtype', 'encoding', 'shape', 'componentCount', 'byteLength', 'sha256',
  ], 'private browser position trajectory channel');
  if (clone.positionChannel.channel !== 'positionsNanometer'
    || clone.positionChannel.unit !== 'nanometer'
    || clone.positionChannel.dtype !== 'float32-le'
    || clone.positionChannel.encoding !== 'ieee754-float32-little-endian'
    || !exactArray(clone.positionChannel.shape, [101, 2_685, 3])
    || clone.positionChannel.componentCount !== 813_555
    || clone.positionChannel.byteLength !== 3_254_220) {
    throw new Error('private browser position trajectory channel changed');
  }
  assertDigest(clone.positionChannel.sha256, 'private browser position trajectory digest');
  assertLiteralRecord(clone.scientificBoundary, {
    sourceEvidenceClass: 'digest-bound-derived-position-frames-execution-origin-unattested',
    rawPayloadChannelsIncluded: ['positionsNanometer'],
    rawPayloadChannelsOmitted: [
      'velocitiesNanometerPerPicosecond',
      'potentialForcesKjMolNanometer',
      'energies',
    ],
    topologyLinkMeaning: 'adjacency-and-rigid-constraint-not-energetic-bond-or-bond-order',
    completePhysicalStateIncluded: false,
    solverFrameOriginVerified: false,
    createsSolverFrames: false,
    interpolationApplied: false,
    extrapolationApplied: false,
    motionSynthesizedByThisAdapter: false,
    repeatedDrawCreatesTrajectoryFrame: false,
    executionAuthenticityVerified: false,
    reproduced: false,
    protectedMainArtifact: false,
    attestedArtifact: false,
    sourceLicenseForPublicDistributionVerified: false,
    promotionEligible: false,
    publicDistributionEligible: false,
    cloudflareDistributionEligible: false,
  }, 'private browser position trajectory scientific boundary');
  assertDigest(clone.metadataDigest, 'private browser position trajectory metadata digest');
  const { metadataDigest, ...payload } = clone;
  if (metadataDigest !== digestValue(payload)) {
    throw new Error('private browser position trajectory metadata digest is stale');
  }
  return deepFreeze(clone);
}

export function createAtomisticPrivateBrowserPositionTrajectoryControllerV049(
  metadataInput: AtomisticPrivateBrowserPositionTrajectoryMetadataV049,
  positionsBytesInput: Uint8Array,
): AtomisticPrivateBrowserPositionTrajectoryControllerV049 {
  const metadata = assertAtomisticPrivateBrowserPositionTrajectoryMetadataV049(metadataInput);
  let ownedBytes: Uint8Array | null = copyFixedIntrinsicBytes(
    positionsBytesInput,
    ATOMISTIC_PRIVATE_BROWSER_POSITION_TRAJECTORY_BYTE_LENGTH_V049,
    'private browser position trajectory bytes',
  );
  try {
    assertPositionBytes(ownedBytes, metadata);
  } catch (error) {
    UINT8_ARRAY_FILL.call(ownedBytes, 0);
    ownedBytes = null;
    throw error;
  }
  let revoked = false;
  const frameLifecycle = Object.freeze({
    ownerRevocationAuthorityExposed: false as const,
    externalCopiesRevokedOnOwnerRevocation: false as const,
  });
  const frameHandles = metadata.sequence.frames.map((frame) => Object.freeze({
    trajectoryMetadataDigest: metadata.metadataDigest,
    binding: metadata.binding,
    frame,
    lifecycle: frameLifecycle,
    copyPositionBytes() {
      if (revoked || ownedBytes === null) {
        throw new Error('private browser position trajectory capability is revoked');
      }
      const copy = UINT8_ARRAY_SLICE.call(
        ownedBytes,
        frame.byteOffset,
        frame.byteOffset + frame.byteLength,
      ) as Uint8Array;
      if (digestBytes(copy) !== frame.positionsDerivedF32Digest) {
        UINT8_ARRAY_FILL.call(copy, 0);
        throw new Error('private browser position trajectory owned frame lost integrity');
      }
      return copy;
    },
    isRevoked: () => revoked,
  }));
  const lifecycle = Object.freeze({
    privatePositionByteRetention:
      'one-contiguous-3254220-byte-owner-until-revocation-or-garbage-collection' as const,
    ownerRevocationSemantics: 'idempotent-zero-fill-and-reference-clear' as const,
    ownerRevocationAuthorityExposedOnReadHandle: false as const,
    externalCopiesRevokedOnOwnerRevocation: false as const,
  });
  const handle = Object.freeze({
    metadata,
    lifecycle,
    getFrameHandle(frameOrdinal: number) {
      assertFrameOrdinal(frameOrdinal);
      if (revoked) throw new Error('private browser position trajectory capability is revoked');
      return frameHandles[frameOrdinal];
    },
    copyFramePositionBytes(frameOrdinal: number) {
      assertFrameOrdinal(frameOrdinal);
      return frameHandles[frameOrdinal].copyPositionBytes();
    },
    isRevoked: () => revoked,
  });
  const receipt = Object.freeze({
    schemaVersion: ATOMISTIC_PRIVATE_BROWSER_POSITION_TRAJECTORY_REVOCATION_VERSION_V049,
    status: 'revoked' as const,
    metadataDigest: metadata.metadataDigest,
    frameCountZeroFilled: 101 as const,
    positionByteLengthZeroFilled: 3_254_220 as const,
    internalReferenceCleared: true as const,
    previouslyIssuedCopiesRevoked: false as const,
    runtimeOrGpuCopiesRevoked: false as const,
    securePhysicalErasureVerified: false as const,
  });
  return Object.freeze({
    handle,
    revoke() {
      if (revoked) return receipt;
      revoked = true;
      if (ownedBytes !== null) UINT8_ARRAY_FILL.call(ownedBytes, 0);
      ownedBytes = null;
      return receipt;
    },
  });
}

function assertBinding(value: unknown): AtomisticPrivateBrowserPositionTrajectoryBindingV049 {
  const binding = value as AtomisticPrivateBrowserPositionTrajectoryBindingV049;
  assertExactKeys(binding, [
    'sourceTrajectoryMetadataDigest', 'sessionDigest', 'trajectoryDigest',
    'atomOrderDigest', 'cellDigest', 'topologyDigest',
  ], 'private browser position trajectory binding');
  for (const digest of Object.values(binding)) {
    assertDigest(digest, 'private browser position trajectory binding digest');
  }
  return binding;
}

function assertFrame(
  frame: AtomisticPrivateBrowserPositionTrajectoryFrameV049,
  binding: AtomisticPrivateBrowserPositionTrajectoryBindingV049,
  index: number,
) {
  assertExactKeys(frame, [
    'frameOrdinal', 'step', 'timePicoseconds', 'sourceFrameDigest',
    'positionsDerivedF32Digest', 'byteOffset', 'byteLength', 'positionFrameDigest',
  ], `private browser position trajectory frame ${index}`);
  if (frame.frameOrdinal !== index || frame.step !== index * 10
    || typeof frame.timePicoseconds !== 'number'
    || !Number.isFinite(frame.timePicoseconds)
    || Object.is(frame.timePicoseconds, -0)
    || frame.timePicoseconds < 0
    || Math.abs(frame.timePicoseconds - index * 0.01) > 1e-12
    || frame.byteOffset !== index * 32_220 || frame.byteLength !== 32_220) {
    throw new Error(`private browser position trajectory frame ${index} sequence changed`);
  }
  assertDigest(frame.sourceFrameDigest,
    `private browser position trajectory frame ${index} source digest`);
  assertDigest(frame.positionsDerivedF32Digest,
    `private browser position trajectory frame ${index} position digest`);
  assertDigest(frame.positionFrameDigest,
    `private browser position trajectory frame ${index} identity digest`);
  const { positionFrameDigest, ...payload } = frame;
  if (positionFrameDigest
    !== createAtomisticPrivateBrowserPositionFrameDigestV049(binding, payload)) {
    throw new Error(`private browser position trajectory frame ${index} digest is stale`);
  }
}

export function createAtomisticPrivateBrowserPositionFrameDigestV049(
  binding: AtomisticPrivateBrowserPositionTrajectoryBindingV049,
  frame: Omit<AtomisticPrivateBrowserPositionTrajectoryFrameV049, 'positionFrameDigest'>,
) {
  return digestValue({
    schemaVersion: 'tf.atomistic-private-browser-position-frame/0.4.9',
    ...binding,
    ...frame,
  });
}

export function createAtomisticPrivateBrowserOrderedPositionFrameDigestV049(
  frames: ReadonlyArray<AtomisticPrivateBrowserPositionTrajectoryFrameV049>,
) {
  return digestValue({
    schemaVersion: 'tf.atomistic-private-browser-position-frame-order/0.4.9',
    positionFrameDigests: frames.map((frame) => frame.positionFrameDigest),
  });
}

function assertPositionBytes(
  bytes: Uint8Array,
  metadata: AtomisticPrivateBrowserPositionTrajectoryMetadataV049,
) {
  if (digestBytes(bytes) !== metadata.positionChannel.sha256) {
    throw new Error('private browser position trajectory bytes differ from aggregate digest');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset < bytes.byteLength; offset += 4) {
    const value = view.getFloat32(offset, true);
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error('private browser positions require finite non-negative-zero F32LE values');
    }
  }
  for (const frame of metadata.sequence.frames) {
    const slice = bytes.subarray(frame.byteOffset, frame.byteOffset + frame.byteLength);
    if (digestBytes(slice) !== frame.positionsDerivedF32Digest) {
      throw new Error(`private browser position trajectory frame ${frame.frameOrdinal} bytes changed`);
    }
  }
}

function copyFixedIntrinsicBytes(value: unknown, expectedLength: number, label: string) {
  if (!(value instanceof Uint8Array) || Object.getPrototypeOf(value) !== Uint8Array.prototype) {
    throw new TypeError(`${label} must be one intrinsic Uint8Array`);
  }
  let buffer: unknown;
  let byteLength: unknown;
  let resizable = false;
  try {
    buffer = TYPED_ARRAY_BUFFER_GETTER?.call(value);
    byteLength = TYPED_ARRAY_BYTE_LENGTH_GETTER?.call(value);
    if (buffer instanceof ArrayBuffer) {
      resizable = ARRAY_BUFFER_RESIZABLE_GETTER?.call(buffer) === true;
    }
  } catch (error) {
    throw new TypeError(`${label} cannot be detached or unreadable`, { cause: error });
  }
  if (!(buffer instanceof ArrayBuffer)
    || Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype
    || resizable) {
    throw new TypeError(`${label} rejects shared or resizable buffers`);
  }
  if (byteLength !== expectedLength) {
    throw new TypeError(`${label} must contain exactly ${expectedLength} bytes`);
  }
  try {
    return UINT8_ARRAY_SLICE.call(value) as Uint8Array;
  } catch (error) {
    throw new TypeError(`${label} cannot be copied`, { cause: error });
  }
}

function digestBytes(bytes: Uint8Array) {
  return `sha256:${bytesToHex(sha256(bytes))}`;
}

function safePlainClone<T>(value: T, label: string): T {
  try {
    void digestValue(value);
    return structuredClone(value);
  } catch (error) {
    throw new Error(`${label} is not a canonical plain-data tree`, { cause: error });
  }
}

function assertExactKeys(value: unknown, expected: ReadonlyArray<string>, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a plain record with exactly the locked keys`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain record with exactly the locked keys`);
  }
  const actual = Reflect.ownKeys(value);
  if (actual.some((key) => typeof key !== 'string')) {
    throw new Error(`${label} must contain only locked string keys`);
  }
  const sortedActual = [...actual as string[]].sort();
  const sortedExpected = [...expected].sort();
  if (!exactArray(sortedActual, sortedExpected)) {
    throw new Error(`${label} must contain exactly the locked keys`);
  }
  for (const key of sortedActual) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)
      || descriptor.value === undefined) {
      throw new Error(`${label}.${key} must be one enumerable defined data property`);
    }
  }
}

function assertLiteralRecord(value: unknown, expected: Record<string, unknown>, label: string) {
  assertExactKeys(value, Object.keys(expected), label);
  const record = value as Record<string, unknown>;
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actual = record[key];
    if (Array.isArray(expectedValue)) {
      if (!exactArray(actual, expectedValue)) throw new Error(`${label}.${key} changed`);
    } else if (actual !== expectedValue) throw new Error(`${label}.${key} changed`);
  }
}

function assertDigest(value: unknown, label: string) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new Error(`${label} is invalid`);
}

function assertFrameOrdinal(value: number) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < 0 || value >= 101) {
    throw new Error('private browser position trajectory frame ordinal must be 0 through 100');
  }
}

function exactArray(value: unknown, expected: ReadonlyArray<unknown>) {
  return Array.isArray(value) && value.length === expected.length
    && value.every((entry, index) => Object.is(entry, expected[index]));
}

function exactNestedArray(value: unknown, expected: ReadonlyArray<ReadonlyArray<unknown>>) {
  return Array.isArray(value) && value.length === expected.length
    && value.every((entry, index) => exactArray(entry, expected[index]));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
