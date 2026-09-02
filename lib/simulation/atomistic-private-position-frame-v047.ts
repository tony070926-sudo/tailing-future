import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { digestValue } from './digest.ts';

/**
 * Sanitized, single-frame browser contract derived only after the full private
 * V045/V046 source objects have been validated on the server. It intentionally
 * carries no artifact paths, source revision, receipt tree, raw F64 bytes, or
 * velocity/force metadata.
 */

export const ATOMISTIC_PRIVATE_POSITION_FRAME_VERSION_V047 =
  'tf.atomistic-private-position-frame/0.4.7' as const;
export const ATOMISTIC_PRIVATE_POSITION_REVOCATION_VERSION_V047 =
  'tf.atomistic-private-position-frame-revocation/0.4.7' as const;
export const ATOMISTIC_PRIVATE_POSITION_PARTICLE_COUNT_V047 = 2_685 as const;
export const ATOMISTIC_PRIVATE_POSITION_COMPONENT_COUNT_V047 = 8_055 as const;
export const ATOMISTIC_PRIVATE_POSITION_BYTE_LENGTH_V047 = 32_220 as const;

const DIGEST = /^sha256:(?!0{64}$)[0-9a-f]{64}$/;
const UINT8_ARRAY_FILL = Uint8Array.prototype.fill;
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype) as object;
const TYPED_ARRAY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  'buffer',
)?.get;
const ARRAY_BUFFER_RESIZABLE_GETTER = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'resizable',
)?.get;

export type AtomisticPrivatePositionFrameBindingInputV047 = Readonly<{
  sessionId: string;
  sessionDigest: string;
  trajectoryDigest: string;
  frameOrdinal: number;
  frameDigest: string;
  atomOrderDigest: string;
  cellDigest: string;
  topologyDigest: string;
  step: number;
  timePicoseconds: number;
  positionsDerivedF32Digest: string;
}>;

export type AtomisticPrivatePositionFrameMetadataV047 = Readonly<{
  schemaVersion: typeof ATOMISTIC_PRIVATE_POSITION_FRAME_VERSION_V047;
  status: 'sanitized-private-single-position-frame-execution-unattested';
  sourceSchemas: Readonly<{
    worldSession: 'tf.atomistic-world-session/0.4.5';
    presentationFrame: 'tf.atomistic-presentation-frame/0.4.6';
  }>;
  binding: AtomisticPrivatePositionFrameBindingInputV047;
  inventory: Readonly<{
    waterMoleculeCount: 895;
    particleCount: 2_685;
    oxygenCount: 895;
    hydrogenCount: 1_790;
    topologyLinkCount: 1_790;
  }>;
  cell: Readonly<{
    kind: 'locked-three-nanometer-orthorhombic-periodic-cell';
    vectorsNanometer: readonly [
      readonly [3, 0, 0],
      readonly [0, 3, 0],
      readonly [0, 0, 3],
    ];
    periodicAxes: readonly [true, true, true];
    coordinateGauge: 'source-unwrapped-oxygen-anchor-with-cubic-minimum-image-internal-sites';
  }>;
  positionChannel: Readonly<{
    channel: 'positionsNanometer';
    unit: 'nanometer';
    dtype: 'float32-le';
    encoding: 'ieee754-float32-little-endian';
    shape: readonly [2_685, 3];
    componentCount: 8_055;
    byteLength: 32_220;
    sha256: string;
  }>;
  scientificBoundary: Readonly<{
    rawPayloadChannelsIncluded: readonly ['positionsNanometer'];
    omittedRawChannels: readonly [
      'velocitiesNanometerPerPicosecond',
      'potentialForcesKjMolNanometer',
    ];
    topologyLinkMeaning: 'adjacency-and-rigid-constraint-not-energetic-bond-or-bond-order';
    physicalWorldState: false;
    presentationOnly: true;
    createsTrajectoryFrame: false;
    interpolationApplied: false;
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

export type AtomisticPrivatePositionFrameHandleV047 = Readonly<{
  metadata: AtomisticPrivatePositionFrameMetadataV047;
  lifecycle: Readonly<{
    privatePositionByteRetention: 'until-owner-revocation-or-handle-garbage-collection';
    ownerRevocationSemantics: 'idempotent-zero-fill-and-reference-clear';
    ownerRevocationAuthorityExposedOnReadHandle: false;
    externalCopiesRevokedOnOwnerRevocation: false;
  }>;
  copyPositionBytes: () => Uint8Array;
  isRevoked: () => boolean;
}>;

export type AtomisticPrivatePositionFrameControllerV047 = Readonly<{
  handle: AtomisticPrivatePositionFrameHandleV047;
  revoke: () => Readonly<{
    schemaVersion: typeof ATOMISTIC_PRIVATE_POSITION_REVOCATION_VERSION_V047;
    status: 'revoked';
    metadataDigest: string;
    positionByteLengthZeroFilled: 32_220;
    internalReferenceCleared: true;
    previouslyIssuedCopiesRevoked: false;
    runtimeOrGpuCopiesRevoked: false;
    securePhysicalErasureVerified: false;
  }>;
}>;

export function createAtomisticPrivatePositionFrameMetadataV047(
  bindingInput: AtomisticPrivatePositionFrameBindingInputV047,
): AtomisticPrivatePositionFrameMetadataV047 {
  const binding = validateBinding(bindingInput);
  const payload = {
    schemaVersion: ATOMISTIC_PRIVATE_POSITION_FRAME_VERSION_V047,
    status: 'sanitized-private-single-position-frame-execution-unattested' as const,
    sourceSchemas: {
      worldSession: 'tf.atomistic-world-session/0.4.5' as const,
      presentationFrame: 'tf.atomistic-presentation-frame/0.4.6' as const,
    },
    binding,
    inventory: {
      waterMoleculeCount: 895 as const,
      particleCount: 2_685 as const,
      oxygenCount: 895 as const,
      hydrogenCount: 1_790 as const,
      topologyLinkCount: 1_790 as const,
    },
    cell: {
      kind: 'locked-three-nanometer-orthorhombic-periodic-cell' as const,
      vectorsNanometer: [[3, 0, 0], [0, 3, 0], [0, 0, 3]] as const,
      periodicAxes: [true, true, true] as const,
      coordinateGauge:
        'source-unwrapped-oxygen-anchor-with-cubic-minimum-image-internal-sites' as const,
    },
    positionChannel: {
      channel: 'positionsNanometer' as const,
      unit: 'nanometer' as const,
      dtype: 'float32-le' as const,
      encoding: 'ieee754-float32-little-endian' as const,
      shape: [2_685, 3] as const,
      componentCount: 8_055 as const,
      byteLength: 32_220 as const,
      sha256: binding.positionsDerivedF32Digest,
    },
    scientificBoundary: {
      rawPayloadChannelsIncluded: ['positionsNanometer'] as const,
      omittedRawChannels: [
        'velocitiesNanometerPerPicosecond',
        'potentialForcesKjMolNanometer',
      ] as const,
      topologyLinkMeaning:
        'adjacency-and-rigid-constraint-not-energetic-bond-or-bond-order' as const,
      physicalWorldState: false as const,
      presentationOnly: true as const,
      createsTrajectoryFrame: false as const,
      interpolationApplied: false as const,
      executionAuthenticityVerified: false as const,
      reproduced: false as const,
      protectedMainArtifact: false as const,
      attestedArtifact: false as const,
      sourceLicenseForPublicDistributionVerified: false as const,
      promotionEligible: false as const,
      publicDistributionEligible: false as const,
      cloudflareDistributionEligible: false as const,
    },
  };
  return assertAtomisticPrivatePositionFrameMetadataV047({
    ...payload,
    metadataDigest: digestValue(payload),
  });
}

export function assertAtomisticPrivatePositionFrameMetadataV047(
  candidate: unknown,
): AtomisticPrivatePositionFrameMetadataV047 {
  const clone = safePlainClone(candidate, 'private position frame metadata') as
    AtomisticPrivatePositionFrameMetadataV047;
  assertExactKeys(clone, [
    'schemaVersion', 'status', 'sourceSchemas', 'binding', 'inventory', 'cell',
    'positionChannel', 'scientificBoundary', 'metadataDigest',
  ], 'private position frame metadata');
  if (clone.schemaVersion !== ATOMISTIC_PRIVATE_POSITION_FRAME_VERSION_V047
    || clone.status !== 'sanitized-private-single-position-frame-execution-unattested') {
    throw new Error('private position frame identity changed');
  }
  assertLiteralRecord(clone.sourceSchemas, {
    worldSession: 'tf.atomistic-world-session/0.4.5',
    presentationFrame: 'tf.atomistic-presentation-frame/0.4.6',
  }, 'private position frame sourceSchemas');
  const binding = validateBinding(clone.binding);
  assertLiteralRecord(clone.inventory, {
    waterMoleculeCount: 895,
    particleCount: 2_685,
    oxygenCount: 895,
    hydrogenCount: 1_790,
    topologyLinkCount: 1_790,
  }, 'private position frame inventory');
  assertExactKeys(clone.cell, [
    'kind', 'vectorsNanometer', 'periodicAxes', 'coordinateGauge',
  ], 'private position frame cell');
  if (clone.cell.kind !== 'locked-three-nanometer-orthorhombic-periodic-cell'
    || !exactNestedArray(clone.cell.vectorsNanometer, [[3, 0, 0], [0, 3, 0], [0, 0, 3]])
    || !exactArray(clone.cell.periodicAxes, [true, true, true])
    || clone.cell.coordinateGauge
      !== 'source-unwrapped-oxygen-anchor-with-cubic-minimum-image-internal-sites') {
    throw new Error('private position frame cell changed');
  }
  assertExactKeys(clone.positionChannel, [
    'channel', 'unit', 'dtype', 'encoding', 'shape', 'componentCount', 'byteLength', 'sha256',
  ], 'private position frame positionChannel');
  if (clone.positionChannel.channel !== 'positionsNanometer'
    || clone.positionChannel.unit !== 'nanometer'
    || clone.positionChannel.dtype !== 'float32-le'
    || clone.positionChannel.encoding !== 'ieee754-float32-little-endian'
    || !exactArray(clone.positionChannel.shape, [2_685, 3])
    || clone.positionChannel.componentCount !== 8_055
    || clone.positionChannel.byteLength !== 32_220
    || clone.positionChannel.sha256 !== binding.positionsDerivedF32Digest) {
    throw new Error('private position frame channel changed');
  }
  assertLiteralRecord(clone.scientificBoundary, {
    rawPayloadChannelsIncluded: ['positionsNanometer'],
    omittedRawChannels: [
      'velocitiesNanometerPerPicosecond',
      'potentialForcesKjMolNanometer',
    ],
    topologyLinkMeaning: 'adjacency-and-rigid-constraint-not-energetic-bond-or-bond-order',
    physicalWorldState: false,
    presentationOnly: true,
    createsTrajectoryFrame: false,
    interpolationApplied: false,
    executionAuthenticityVerified: false,
    reproduced: false,
    protectedMainArtifact: false,
    attestedArtifact: false,
    sourceLicenseForPublicDistributionVerified: false,
    promotionEligible: false,
    publicDistributionEligible: false,
    cloudflareDistributionEligible: false,
  }, 'private position frame scientificBoundary');
  assertDigest(clone.metadataDigest, 'private position frame metadata digest');
  const { metadataDigest, ...payload } = clone;
  if (metadataDigest !== digestValue(payload)) {
    throw new Error('private position frame metadata digest is stale');
  }
  return deepFreeze(clone);
}

export function createAtomisticPrivatePositionFrameControllerV047(
  metadataInput: AtomisticPrivatePositionFrameMetadataV047,
  positionBytesInput: Uint8Array,
): AtomisticPrivatePositionFrameControllerV047 {
  const metadata = assertAtomisticPrivatePositionFrameMetadataV047(metadataInput);
  let ownedBytes: Uint8Array | null = copyFixedPositionBytes(positionBytesInput);
  try {
    assertFiniteF32Positions(ownedBytes);
    if (digestBytes(ownedBytes) !== metadata.positionChannel.sha256) {
      throw new Error('private position bytes differ from sanitized metadata');
    }
  } catch (error) {
    UINT8_ARRAY_FILL.call(ownedBytes, 0);
    ownedBytes = null;
    throw error;
  }
  let revoked = false;
  const lifecycle = Object.freeze({
    privatePositionByteRetention:
      'until-owner-revocation-or-handle-garbage-collection' as const,
    ownerRevocationSemantics: 'idempotent-zero-fill-and-reference-clear' as const,
    ownerRevocationAuthorityExposedOnReadHandle: false as const,
    externalCopiesRevokedOnOwnerRevocation: false as const,
  });
  const copyPositionBytes = () => {
    if (revoked || ownedBytes === null) {
      throw new Error('private position frame read capability has been revoked');
    }
    if (digestBytes(ownedBytes) !== metadata.positionChannel.sha256) {
      throw new Error('private position frame owned bytes lost integrity');
    }
    return ownedBytes.slice();
  };
  const handle = Object.freeze({
    metadata,
    lifecycle,
    copyPositionBytes,
    isRevoked: () => revoked,
  });
  const receipt = Object.freeze({
    schemaVersion: ATOMISTIC_PRIVATE_POSITION_REVOCATION_VERSION_V047,
    status: 'revoked' as const,
    metadataDigest: metadata.metadataDigest,
    positionByteLengthZeroFilled: 32_220 as const,
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

function validateBinding(value: unknown): AtomisticPrivatePositionFrameBindingInputV047 {
  const clone = safePlainClone(value, 'private position frame binding') as
    AtomisticPrivatePositionFrameBindingInputV047;
  assertExactKeys(clone, [
    'sessionId', 'sessionDigest', 'trajectoryDigest', 'frameOrdinal', 'frameDigest',
    'atomOrderDigest', 'cellDigest', 'topologyDigest', 'step', 'timePicoseconds',
    'positionsDerivedF32Digest',
  ], 'private position frame binding');
  if (typeof clone.sessionId !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(clone.sessionId)) {
    throw new Error('private position frame sessionId is invalid');
  }
  for (const [label, digest] of [
    ['session', clone.sessionDigest],
    ['trajectory', clone.trajectoryDigest],
    ['frame', clone.frameDigest],
    ['atom-order', clone.atomOrderDigest],
    ['cell', clone.cellDigest],
    ['topology', clone.topologyDigest],
    ['positions', clone.positionsDerivedF32Digest],
  ] as const) assertDigest(digest, `private position frame ${label} digest`);
  assertSafeInteger(clone.frameOrdinal, 0, 100, 'private position frame ordinal');
  assertSafeInteger(clone.step, 0, 1_000_000_000, 'private position frame step');
  if (typeof clone.timePicoseconds !== 'number'
    || !Number.isFinite(clone.timePicoseconds)
    || Object.is(clone.timePicoseconds, -0)
    || clone.timePicoseconds < 0) {
    throw new Error('private position frame time must be finite and nonnegative');
  }
  return deepFreeze(clone);
}

function assertLiteralRecord(value: unknown, expected: Record<string, unknown>, label: string) {
  assertExactKeys(value, Object.keys(expected), label);
  const record = value as Record<string, unknown>;
  for (const [key, expectedValue] of Object.entries(expected)) {
    const actual = record[key];
    if (Array.isArray(expectedValue)) {
      if (!exactArray(actual, expectedValue)) throw new Error(`${label}.${key} changed`);
    } else if (actual !== expectedValue) {
      throw new Error(`${label}.${key} changed`);
    }
  }
}

function copyFixedPositionBytes(value: Uint8Array) {
  if (!(value instanceof Uint8Array)
    || Object.getPrototypeOf(value) !== Uint8Array.prototype
    || value.byteLength !== ATOMISTIC_PRIVATE_POSITION_BYTE_LENGTH_V047) {
    throw new Error('private positions must be one intrinsic 32,220-byte Uint8Array');
  }
  let buffer: unknown;
  let resizable = false;
  try {
    buffer = TYPED_ARRAY_BUFFER_GETTER?.call(value);
    resizable = ARRAY_BUFFER_RESIZABLE_GETTER?.call(buffer) === true;
  } catch {
    throw new Error('private positions must have stable ArrayBuffer ownership');
  }
  if (!(buffer instanceof ArrayBuffer)
    || Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype
    || resizable) {
    throw new Error('private positions must reject shared or resizable buffers');
  }
  return Uint8Array.prototype.slice.call(value) as Uint8Array;
}

function assertFiniteF32Positions(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let offset = 0; offset < bytes.byteLength; offset += 4) {
    const value = view.getFloat32(offset, true);
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error('private positions must contain finite non-negative-zero F32LE values');
    }
  }
}

function digestBytes(bytes: Uint8Array) {
  return `sha256:${bytesToHex(sha256(bytes))}`;
}

function safePlainClone<T>(value: T, label: string): T {
  try {
    void digestValue(value);
  } catch (error) {
    throw new Error(`${label} is not a canonical plain-data tree`, { cause: error });
  }
  return structuredClone(value);
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
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error(`${label}.${key} must be one enumerable data property`);
    }
  }
}

function assertDigest(value: unknown, label: string) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new Error(`${label} is invalid`);
}

function assertSafeInteger(value: unknown, minimum: number, maximum: number, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${label} is outside its bound`);
  }
}

function exactArray(value: unknown, expected: ReadonlyArray<unknown>): boolean {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((entry, index) => Object.is(entry, expected[index]));
}

function exactNestedArray(value: unknown, expected: ReadonlyArray<ReadonlyArray<unknown>>) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((entry, index) => exactArray(entry, expected[index]));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
