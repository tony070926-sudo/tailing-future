import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { digestValue } from './digest.ts';
import {
  ATOMISTIC_COMPONENT_COUNT_V045,
  ATOMISTIC_F32_FRAME_BYTE_LENGTH_V045,
  ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045,
  ATOMISTIC_PARTICLE_COUNT_V045,
  assertAtomisticGpuF32VisualFrameV045,
  createAtomisticGpuF32VisualFrameV045,
  type AtomisticBinaryChannelV045,
  type AtomisticGpuF32VisualFrameV045,
  type AtomisticTrajectoryFrameV045,
} from './atomistic-trajectory-chunk.ts';
import {
  assertAtomisticWorldSessionV045,
  getAtomisticWorldSessionFrameV045,
  type AtomisticWorldSessionV045,
} from './atomistic-world-session.ts';

/**
 * Local, digest-bound bridge from a V045 solver frame to GPU-ready F32 bytes.
 *
 * The public metadata is recursively frozen. Derived bytes stay in a private
 * closure, and callers receive a fresh copy on every read. This module does
 * not authenticate execution, interpolate physical state, license source
 * bytes for distribution, or increase the precision of scientific evidence.
 */

export const ATOMISTIC_PRESENTATION_FRAME_VERSION_V046 =
  'tf.atomistic-presentation-frame/0.4.6' as const;
export const ATOMISTIC_PRESENTATION_REVOCATION_RECEIPT_VERSION_V046 =
  'tf.atomistic-presentation-frame-revocation-receipt/0.4.6' as const;

export const ATOMISTIC_PRESENTATION_CHANNELS_V046 = [
  'positionsNanometer',
  'velocitiesNanometerPerPicosecond',
  'potentialForcesKjMolNanometer',
] as const satisfies readonly AtomisticBinaryChannelV045[];

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype) as object;
const TYPED_ARRAY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  'buffer',
)?.get;
const ARRAY_BUFFER_RESIZABLE_GETTER = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'resizable',
)?.get;
const UINT8_ARRAY_FILL = Uint8Array.prototype.fill;

type AtomisticPresentationUnitV046 =
  | 'nanometer'
  | 'nanometer-per-picosecond'
  | 'kilojoule-per-mole-per-nanometer';

const CHANNEL_UNITS: Readonly<
  Record<AtomisticBinaryChannelV045, AtomisticPresentationUnitV046>
> = Object.freeze({
  positionsNanometer: 'nanometer',
  velocitiesNanometerPerPicosecond: 'nanometer-per-picosecond',
  potentialForcesKjMolNanometer: 'kilojoule-per-mole-per-nanometer',
});

export type AtomisticPresentationFrameBindingV046 = Readonly<{
  sessionId: string;
  sessionDigest: string;
  frameOrdinal: number;
  frameDigest: string;
  atomOrderDigest: string;
  cellDigest: string;
}>;

export type AtomisticPresentationF64ChannelInputV046 = Readonly<{
  channel: AtomisticBinaryChannelV045;
  dtype: 'float64-le';
  shape: readonly [typeof ATOMISTIC_PARTICLE_COUNT_V045, 3];
  unit: AtomisticPresentationUnitV046;
  sourceByteDigest: string;
  f64LeBytes: Uint8Array;
}>;

export type AtomisticPresentationFrameInputV046 = Readonly<{
  binding: AtomisticPresentationFrameBindingV046;
  channels: readonly [
    AtomisticPresentationF64ChannelInputV046,
    AtomisticPresentationF64ChannelInputV046,
    AtomisticPresentationF64ChannelInputV046,
  ];
}>;

export type AtomisticPresentationChannelMetadataV046 = Readonly<{
  channel: AtomisticBinaryChannelV045;
  unit: AtomisticPresentationUnitV046;
  componentCount: typeof ATOMISTIC_COMPONENT_COUNT_V045;
  source: Readonly<{
    dtype: 'float64-le';
    shape: readonly [typeof ATOMISTIC_PARTICLE_COUNT_V045, 3];
    byteLength: typeof ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045;
    sha256: string;
  }>;
  derived: Readonly<{
    dtype: 'float32-le';
    shape: readonly [typeof ATOMISTIC_PARTICLE_COUNT_V045, 3];
    byteLength: typeof ATOMISTIC_F32_FRAME_BYTE_LENGTH_V045;
    sha256: string;
  }>;
}>;

export type AtomisticPresentationFrameMetadataV046 = Readonly<{
  schemaVersion: typeof ATOMISTIC_PRESENTATION_FRAME_VERSION_V046;
  status: 'local-f32-presentation-derivative-from-v045-execution-unattested-frame';
  sourceWorldSessionSchemaVersion: 'tf.atomistic-world-session/0.4.5';
  binding: AtomisticPresentationFrameBindingV046 & Readonly<{
    atomCount: typeof ATOMISTIC_PARTICLE_COUNT_V045;
    componentCountPerChannel: typeof ATOMISTIC_COMPONENT_COUNT_V045;
    step: number;
    timePicoseconds: number;
  }>;
  channels: Readonly<
    Record<AtomisticBinaryChannelV045, AtomisticPresentationChannelMetadataV046>
  >;
  conversionReceipt: AtomisticGpuF32VisualFrameV045;
  conversion: Readonly<{
    operation: 'per-component-f64le-to-f32le';
    rounding: 'ecmascript-dataview-setfloat32-ieee754-round-to-nearest-ties-to-even';
    sourceFiniteRequired: true;
    sourceNegativeZeroRejected: true;
    derivedNonfiniteRejected: true;
    derivedNegativeZeroRejected: true;
    interpolationApplied: false;
  }>;
  physicalWorldState: false;
  presentationOnly: true;
  renderFrameOnly: true;
  affectsSolverClock: false;
  sourceF64BytesRetained: false;
  scientificPrecisionImproved: false;
  executionAuthenticityVerified: false;
  promotionEligible: false;
  sourceLicenseForPublicDistributionVerified: false;
  publicDistributionEligible: false;
  presentationFrameDigest: string;
}>;

export type AtomisticPresentationFrameHandleV046 = Readonly<{
  metadata: AtomisticPresentationFrameMetadataV046;
  lifecycle: Readonly<{
    privateDerivedByteRetention:
      'until-owner-revocation-or-handle-garbage-collection';
    ownerRevocationSemantics: 'idempotent-zero-fill-and-reference-clear';
    ownerRevocationAuthorityExposedOnReadHandle: false;
    externalCopiesRevokedOnOwnerRevocation: false;
  }>;
  copyChannelBytes: (channel: AtomisticBinaryChannelV045) => Uint8Array;
  copyChannelFloat32: (channel: AtomisticBinaryChannelV045) => Float32Array;
  isRevoked: () => boolean;
}>;

export type AtomisticPresentationFrameRevocationReceiptV046 = Readonly<{
  schemaVersion: typeof ATOMISTIC_PRESENTATION_REVOCATION_RECEIPT_VERSION_V046;
  status: 'revoked';
  presentationFrameDigest: string;
  scope: 'handle-owned-derived-channel-buffers-only';
  idempotent: true;
  internalDerivedChannelCountZeroFilled: 3;
  internalDerivedByteLengthZeroFilled: 96_660;
  internalDerivedReferencesCleared: true;
  previouslyIssuedCopiesRevoked: false;
  rendererOrRuntimeCopiesRevoked: false;
  metadataRetainedForAudit: true;
  scientificEvidenceChanged: false;
  securePhysicalErasureVerified: false;
}>;

export type AtomisticPresentationFrameOwnerControllerV046 = Readonly<{
  handle: AtomisticPresentationFrameHandleV046;
  revoke: () => AtomisticPresentationFrameRevocationReceiptV046;
}>;

/**
 * Compatibility read-handle factory. It intentionally withholds owner
 * revocation authority; callers that own the lifetime must use the controller
 * factory below and pass only `controller.handle` to render consumers.
 */
export function createAtomisticPresentationFrameV046(
  sessionInput: AtomisticWorldSessionV045,
  input: AtomisticPresentationFrameInputV046,
): AtomisticPresentationFrameHandleV046 {
  return createAtomisticPresentationFrameControllerV046(sessionInput, input).handle;
}

export function createAtomisticPresentationFrameControllerV046(
  sessionInput: AtomisticWorldSessionV045,
  input: AtomisticPresentationFrameInputV046,
): AtomisticPresentationFrameOwnerControllerV046 {
  const session = assertAtomisticWorldSessionV045(sessionInput);
  const parsed = parseInput(input);
  const privateDerivedBytes = new Map<AtomisticBinaryChannelV045, Uint8Array>();
  let controllerIssued = false;
  try {
    const frame = getAtomisticWorldSessionFrameV045(session, parsed.binding.frameOrdinal);
    assertBindingMatchesSession(parsed.binding, session, frame);

    const derivedDigests = {} as Record<AtomisticBinaryChannelV045, string>;
    const channelMetadata = {} as Record<
      AtomisticBinaryChannelV045,
      AtomisticPresentationChannelMetadataV046
    >;

    for (const channelInput of parsed.channels) {
      const channel = channelInput.channel;
      const frameSource = frame.arrays[channel];
      const actualSourceDigest = digestBytes(channelInput.f64LeBytes);
      if (channelInput.sourceByteDigest !== frameSource.frameByteDigest
        || actualSourceDigest !== channelInput.sourceByteDigest) {
        throw new Error(`atomistic presentation ${channel} F64 source digest does not match frame`);
      }
      const derivedBytes = convertF64LeToF32Le(channelInput.f64LeBytes, channel);
      const derivedDigest = digestBytes(derivedBytes);
      privateDerivedBytes.set(channel, derivedBytes);
      derivedDigests[channel] = derivedDigest;
      channelMetadata[channel] = {
        channel,
        unit: channelInput.unit,
        componentCount: ATOMISTIC_COMPONENT_COUNT_V045,
        source: {
          dtype: 'float64-le',
          shape: [ATOMISTIC_PARTICLE_COUNT_V045, 3],
          byteLength: ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045,
          sha256: actualSourceDigest,
        },
        derived: {
          dtype: 'float32-le',
          shape: [ATOMISTIC_PARTICLE_COUNT_V045, 3],
          byteLength: ATOMISTIC_F32_FRAME_BYTE_LENGTH_V045,
          sha256: derivedDigest,
        },
      };
    }

    const conversionReceipt = createAtomisticGpuF32VisualFrameV045(frame, derivedDigests);
    const payload = {
      schemaVersion: ATOMISTIC_PRESENTATION_FRAME_VERSION_V046,
      status: 'local-f32-presentation-derivative-from-v045-execution-unattested-frame' as const,
      sourceWorldSessionSchemaVersion: 'tf.atomistic-world-session/0.4.5' as const,
      binding: {
        ...parsed.binding,
        atomCount: ATOMISTIC_PARTICLE_COUNT_V045,
        componentCountPerChannel: ATOMISTIC_COMPONENT_COUNT_V045,
        step: frame.step,
        timePicoseconds: frame.timePicoseconds,
      },
      channels: channelMetadata,
      conversionReceipt,
      conversion: {
        operation: 'per-component-f64le-to-f32le' as const,
        rounding:
          'ecmascript-dataview-setfloat32-ieee754-round-to-nearest-ties-to-even' as const,
        sourceFiniteRequired: true as const,
        sourceNegativeZeroRejected: true as const,
        derivedNonfiniteRejected: true as const,
        derivedNegativeZeroRejected: true as const,
        interpolationApplied: false as const,
      },
      physicalWorldState: false as const,
      presentationOnly: true as const,
      renderFrameOnly: true as const,
      affectsSolverClock: false as const,
      sourceF64BytesRetained: false as const,
      scientificPrecisionImproved: false as const,
      executionAuthenticityVerified: false as const,
      promotionEligible: false as const,
      sourceLicenseForPublicDistributionVerified: false as const,
      publicDistributionEligible: false as const,
    };
    const metadata = assertAtomisticPresentationFrameMetadataV046({
      ...payload,
      presentationFrameDigest: digestValue(payload),
    }, session);

    const lifecycle = Object.freeze({
      privateDerivedByteRetention:
        'until-owner-revocation-or-handle-garbage-collection' as const,
      ownerRevocationSemantics: 'idempotent-zero-fill-and-reference-clear' as const,
      ownerRevocationAuthorityExposedOnReadHandle: false as const,
      externalCopiesRevokedOnOwnerRevocation: false as const,
    });
    const revocationReceipt = Object.freeze({
      schemaVersion: ATOMISTIC_PRESENTATION_REVOCATION_RECEIPT_VERSION_V046,
      status: 'revoked' as const,
      presentationFrameDigest: metadata.presentationFrameDigest,
      scope: 'handle-owned-derived-channel-buffers-only' as const,
      idempotent: true as const,
      internalDerivedChannelCountZeroFilled: 3 as const,
      internalDerivedByteLengthZeroFilled: 96_660 as const,
      internalDerivedReferencesCleared: true as const,
      previouslyIssuedCopiesRevoked: false as const,
      rendererOrRuntimeCopiesRevoked: false as const,
      metadataRetainedForAudit: true as const,
      scientificEvidenceChanged: false as const,
      securePhysicalErasureVerified: false as const,
    });
    let revoked = false;
    let issuedReceipt: AtomisticPresentationFrameRevocationReceiptV046 | null = null;
    const assertActive = () => {
      if (revoked) {
        throw new Error('atomistic presentation frame read capability has been revoked');
      }
    };

    const copyChannelBytes = (channel: AtomisticBinaryChannelV045): Uint8Array => {
      assertActive();
      assertChannel(channel);
      const bytes = privateDerivedBytes.get(channel);
      if (!bytes || digestBytes(bytes) !== metadata.channels[channel].derived.sha256) {
        throw new Error(`atomistic presentation ${channel} private F32 payload integrity failed`);
      }
      return bytes.slice();
    };
    const copyChannelFloat32 = (channel: AtomisticBinaryChannelV045): Float32Array => {
      const bytes = copyChannelBytes(channel);
      const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
      const values = new Float32Array(ATOMISTIC_COMPONENT_COUNT_V045);
      for (let index = 0; index < values.length; index += 1) {
        values[index] = view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true);
      }
      return values;
    };
    const isRevoked = () => revoked;
    const handle = Object.freeze({
      metadata,
      lifecycle,
      copyChannelBytes,
      copyChannelFloat32,
      isRevoked,
    });
    const revoke = (): AtomisticPresentationFrameRevocationReceiptV046 => {
      if (issuedReceipt) return issuedReceipt;
      revoked = true;
      for (const bytes of privateDerivedBytes.values()) UINT8_ARRAY_FILL.call(bytes, 0);
      privateDerivedBytes.clear();
      issuedReceipt = revocationReceipt;
      return issuedReceipt;
    };
    const controller = Object.freeze({ handle, revoke });
    controllerIssued = true;
    return controller;
  } finally {
    for (const channelInput of parsed.channels) {
      UINT8_ARRAY_FILL.call(channelInput.f64LeBytes, 0);
    }
    if (!controllerIssued) {
      for (const bytes of privateDerivedBytes.values()) UINT8_ARRAY_FILL.call(bytes, 0);
      privateDerivedBytes.clear();
    }
  }
}

export function assertAtomisticPresentationFrameMetadataV046(
  candidate: unknown,
  sourceSession: AtomisticWorldSessionV045,
): AtomisticPresentationFrameMetadataV046 {
  const clone = safePlainClone(
    candidate,
    'atomistic presentation frame metadata',
  ) as AtomisticPresentationFrameMetadataV046;
  assertExactKeys(clone, [
    'schemaVersion', 'status', 'sourceWorldSessionSchemaVersion', 'binding', 'channels',
    'conversionReceipt', 'conversion', 'physicalWorldState', 'presentationOnly',
    'renderFrameOnly', 'affectsSolverClock', 'sourceF64BytesRetained',
    'scientificPrecisionImproved', 'executionAuthenticityVerified', 'promotionEligible',
    'sourceLicenseForPublicDistributionVerified', 'publicDistributionEligible',
    'presentationFrameDigest',
  ], 'atomistic presentation frame metadata');
  if (clone.schemaVersion !== ATOMISTIC_PRESENTATION_FRAME_VERSION_V046
    || clone.status
      !== 'local-f32-presentation-derivative-from-v045-execution-unattested-frame'
    || clone.sourceWorldSessionSchemaVersion !== 'tf.atomistic-world-session/0.4.5'
    || clone.physicalWorldState !== false
    || clone.presentationOnly !== true
    || clone.renderFrameOnly !== true
    || clone.affectsSolverClock !== false
    || clone.sourceF64BytesRetained !== false
    || clone.scientificPrecisionImproved !== false
    || clone.executionAuthenticityVerified !== false
    || clone.promotionEligible !== false
    || clone.sourceLicenseForPublicDistributionVerified !== false
    || clone.publicDistributionEligible !== false) {
    throw new Error('atomistic presentation frame safety boundary changed');
  }
  assertMetadataBinding(clone.binding);
  assertExactKeys(clone.channels, ATOMISTIC_PRESENTATION_CHANNELS_V046,
    'atomistic presentation frame channels');
  for (const channel of ATOMISTIC_PRESENTATION_CHANNELS_V046) {
    assertChannelMetadata(clone.channels[channel], channel);
  }
  assertConversionMetadata(clone.conversion);
  const receipt = assertAtomisticGpuF32VisualFrameV045(clone.conversionReceipt);
  if (receipt.sourceFrameDigest !== clone.binding.frameDigest
    || receipt.sourceStep !== clone.binding.step
    || !Object.is(receipt.sourceTimePicoseconds, clone.binding.timePicoseconds)) {
    throw new Error('atomistic presentation conversion receipt frame binding changed');
  }
  for (const channel of ATOMISTIC_PRESENTATION_CHANNELS_V046) {
    const metadata = clone.channels[channel];
    const receiptChannel = receipt.channels[channel];
    if (receiptChannel.sourceByteDigest !== metadata.source.sha256
      || receiptChannel.sourceByteLength !== metadata.source.byteLength
      || !exactArray(receiptChannel.sourceShape, metadata.source.shape)
      || receiptChannel.derivedByteDigest !== metadata.derived.sha256
      || receiptChannel.derivedByteLength !== metadata.derived.byteLength
      || !exactArray(receiptChannel.derivedShape, metadata.derived.shape)) {
      throw new Error(`atomistic presentation ${channel} receipt lineage changed`);
    }
  }
  const session = assertAtomisticWorldSessionV045(sourceSession);
  const frame = getAtomisticWorldSessionFrameV045(session, clone.binding.frameOrdinal);
  assertBindingMatchesSession(clone.binding, session, frame);
  assertAtomisticGpuF32VisualFrameV045(receipt, frame);
  assertDigest(clone.presentationFrameDigest, 'atomistic presentation frame digest');
  const { presentationFrameDigest, ...payload } = clone;
  if (presentationFrameDigest !== digestValue(payload)) {
    throw new Error('atomistic presentation frame digest is stale');
  }
  return deepFreeze(clone);
}

function parseInput(input: AtomisticPresentationFrameInputV046): Readonly<{
  binding: AtomisticPresentationFrameBindingV046;
  channels: ReadonlyArray<AtomisticPresentationF64ChannelInputV046>;
}> {
  assertExactDataKeys(input, ['binding', 'channels'], 'atomistic presentation frame input');
  const binding = safePlainClone(
    readDataProperty(input, 'binding', 'atomistic presentation frame input'),
    'atomistic presentation frame binding',
  ) as AtomisticPresentationFrameBindingV046;
  assertInputBinding(binding);
  const channels = readDataProperty(input, 'channels', 'atomistic presentation frame input');
  assertDenseIntrinsicArray(channels, 3, 'atomistic presentation source channels');
  const parsedChannels = channels.map((entry, index) => {
    const expectedChannel = ATOMISTIC_PRESENTATION_CHANNELS_V046[index];
    assertExactDataKeys(entry, [
      'channel', 'dtype', 'shape', 'unit', 'sourceByteDigest', 'f64LeBytes',
    ], `atomistic presentation source channel ${index}`);
    const channel = readDataProperty(
      entry,
      'channel',
      `atomistic presentation source channel ${index}`,
    );
    if (channel !== expectedChannel) {
      throw new Error('atomistic presentation source channels must use canonical order');
    }
    const dtype = readDataProperty(entry, 'dtype', `atomistic presentation ${channel}`);
    const shape = safePlainClone(
      readDataProperty(entry, 'shape', `atomistic presentation ${channel}`),
      `atomistic presentation ${channel} shape`,
    );
    const unit = readDataProperty(entry, 'unit', `atomistic presentation ${channel}`);
    const sourceByteDigest = readDataProperty(
      entry,
      'sourceByteDigest',
      `atomistic presentation ${channel}`,
    );
    if (dtype !== 'float64-le'
      || !Array.isArray(shape)
      || !exactArray(shape, [ATOMISTIC_PARTICLE_COUNT_V045, 3])
      || unit !== CHANNEL_UNITS[expectedChannel]) {
      throw new Error(`atomistic presentation ${channel} dtype, shape, or unit changed`);
    }
    assertDigest(sourceByteDigest, `atomistic presentation ${channel} source digest`);
    const bytes = copyUint8Array(
      readDataProperty(entry, 'f64LeBytes', `atomistic presentation ${channel}`),
      `atomistic presentation ${channel} F64 bytes`,
    );
    if (bytes.byteLength !== ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045) {
      throw new Error(`atomistic presentation ${channel} F64 byte length changed`);
    }
    return {
      channel: expectedChannel,
      dtype: 'float64-le' as const,
      shape: [ATOMISTIC_PARTICLE_COUNT_V045, 3] as const,
      unit: CHANNEL_UNITS[expectedChannel],
      sourceByteDigest: sourceByteDigest as string,
      f64LeBytes: bytes,
    };
  });
  return { binding, channels: parsedChannels };
}

function convertF64LeToF32Le(
  sourceBytes: Uint8Array,
  channel: AtomisticBinaryChannelV045,
): Uint8Array {
  const sourceView = new DataView(
    sourceBytes.buffer,
    sourceBytes.byteOffset,
    sourceBytes.byteLength,
  );
  const derivedBytes = new Uint8Array(ATOMISTIC_F32_FRAME_BYTE_LENGTH_V045);
  const derivedView = new DataView(derivedBytes.buffer);
  for (let index = 0; index < ATOMISTIC_COMPONENT_COUNT_V045; index += 1) {
    const value = sourceView.getFloat64(index * Float64Array.BYTES_PER_ELEMENT, true);
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new Error(
        `atomistic presentation ${channel} F64 component ${index} must be finite and not -0`,
      );
    }
    const byteOffset = index * Float32Array.BYTES_PER_ELEMENT;
    derivedView.setFloat32(byteOffset, value, true);
    const converted = derivedView.getFloat32(byteOffset, true);
    if (!Number.isFinite(converted)) {
      throw new Error(`atomistic presentation ${channel} F32 component ${index} overflowed`);
    }
    if (Object.is(converted, -0)) {
      throw new Error(
        `atomistic presentation ${channel} F32 component ${index} became negative zero`,
      );
    }
  }
  return derivedBytes;
}

function assertBindingMatchesSession(
  binding: AtomisticPresentationFrameMetadataV046['binding'] | AtomisticPresentationFrameBindingV046,
  session: AtomisticWorldSessionV045,
  frame: AtomisticTrajectoryFrameV045,
) {
  if (binding.sessionId !== session.sessionId
    || binding.sessionDigest !== session.sessionDigest
    || binding.frameOrdinal !== frame.frameOrdinal
    || binding.frameDigest !== frame.frameDigest
    || binding.atomOrderDigest !== session.atomOrder.atomOrderDigest
    || binding.atomOrderDigest !== frame.lineage.atomOrderDigest
    || binding.cellDigest !== session.cell.cellDigest
    || binding.cellDigest !== frame.lineage.cellDigest) {
    throw new Error('atomistic presentation binding does not match the source session and frame');
  }
  if ('atomCount' in binding
    && (binding.atomCount !== session.atomOrder.particleCount
      || binding.componentCountPerChannel !== session.atomOrder.particleCount * 3
      || binding.step !== frame.step
      || !Object.is(binding.timePicoseconds, frame.timePicoseconds))) {
    throw new Error('atomistic presentation materialized frame binding changed');
  }
}

function assertInputBinding(binding: AtomisticPresentationFrameBindingV046) {
  assertExactKeys(binding, [
    'sessionId', 'sessionDigest', 'frameOrdinal', 'frameDigest', 'atomOrderDigest', 'cellDigest',
  ], 'atomistic presentation frame binding');
  if (typeof binding.sessionId !== 'string' || binding.sessionId.length < 1
    || binding.sessionId.length > 128) {
    throw new Error('atomistic presentation sessionId is invalid');
  }
  assertDigest(binding.sessionDigest, 'atomistic presentation session digest');
  assertSafeInteger(binding.frameOrdinal, 0, 100, 'atomistic presentation frame ordinal');
  assertDigest(binding.frameDigest, 'atomistic presentation frame source digest');
  assertDigest(binding.atomOrderDigest, 'atomistic presentation atom-order digest');
  assertDigest(binding.cellDigest, 'atomistic presentation cell digest');
}

function assertMetadataBinding(binding: AtomisticPresentationFrameMetadataV046['binding']) {
  assertExactKeys(binding, [
    'sessionId', 'sessionDigest', 'frameOrdinal', 'frameDigest', 'atomOrderDigest', 'cellDigest',
    'atomCount', 'componentCountPerChannel', 'step', 'timePicoseconds',
  ], 'atomistic presentation materialized binding');
  assertInputBinding({
    sessionId: binding.sessionId,
    sessionDigest: binding.sessionDigest,
    frameOrdinal: binding.frameOrdinal,
    frameDigest: binding.frameDigest,
    atomOrderDigest: binding.atomOrderDigest,
    cellDigest: binding.cellDigest,
  });
  if (binding.atomCount !== ATOMISTIC_PARTICLE_COUNT_V045
    || binding.componentCountPerChannel !== ATOMISTIC_COMPONENT_COUNT_V045) {
    throw new Error('atomistic presentation binding shape changed');
  }
  assertSafeInteger(binding.step, 0, 1_000_000_000, 'atomistic presentation source step');
  assertFinite(binding.timePicoseconds, 'atomistic presentation source time');
  if (binding.timePicoseconds < 0) throw new Error('atomistic presentation source time is negative');
}

function assertChannelMetadata(
  value: AtomisticPresentationChannelMetadataV046,
  channel: AtomisticBinaryChannelV045,
) {
  assertExactKeys(value, ['channel', 'unit', 'componentCount', 'source', 'derived'],
    `atomistic presentation ${channel} metadata`);
  if (value.channel !== channel
    || value.unit !== CHANNEL_UNITS[channel]
    || value.componentCount !== ATOMISTIC_COMPONENT_COUNT_V045) {
    throw new Error(`atomistic presentation ${channel} identity changed`);
  }
  assertExactKeys(value.source, ['dtype', 'shape', 'byteLength', 'sha256'],
    `atomistic presentation ${channel} source metadata`);
  assertExactKeys(value.derived, ['dtype', 'shape', 'byteLength', 'sha256'],
    `atomistic presentation ${channel} derived metadata`);
  if (value.source.dtype !== 'float64-le'
    || !exactArray(value.source.shape, [ATOMISTIC_PARTICLE_COUNT_V045, 3])
    || value.source.byteLength !== ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045
    || value.derived.dtype !== 'float32-le'
    || !exactArray(value.derived.shape, [ATOMISTIC_PARTICLE_COUNT_V045, 3])
    || value.derived.byteLength !== ATOMISTIC_F32_FRAME_BYTE_LENGTH_V045) {
    throw new Error(`atomistic presentation ${channel} byte layout changed`);
  }
  assertDigest(value.source.sha256, `atomistic presentation ${channel} source digest`);
  assertDigest(value.derived.sha256, `atomistic presentation ${channel} derived digest`);
}

function assertConversionMetadata(value: AtomisticPresentationFrameMetadataV046['conversion']) {
  assertExactKeys(value, [
    'operation', 'rounding', 'sourceFiniteRequired', 'sourceNegativeZeroRejected',
    'derivedNonfiniteRejected', 'derivedNegativeZeroRejected', 'interpolationApplied',
  ], 'atomistic presentation conversion metadata');
  if (value.operation !== 'per-component-f64le-to-f32le'
    || value.rounding
      !== 'ecmascript-dataview-setfloat32-ieee754-round-to-nearest-ties-to-even'
    || value.sourceFiniteRequired !== true
    || value.sourceNegativeZeroRejected !== true
    || value.derivedNonfiniteRejected !== true
    || value.derivedNegativeZeroRejected !== true
    || value.interpolationApplied !== false) {
    throw new Error('atomistic presentation conversion semantics changed');
  }
}

function copyUint8Array(value: unknown, label: string): Uint8Array {
  if (!(value instanceof Uint8Array) || Object.getPrototypeOf(value) !== Uint8Array.prototype) {
    throw new Error(`${label} must be a fixed intrinsic Uint8Array backed by ArrayBuffer`);
  }
  let buffer: unknown;
  let resizable = false;
  try {
    buffer = TYPED_ARRAY_BUFFER_GETTER?.call(value);
    resizable = ARRAY_BUFFER_RESIZABLE_GETTER?.call(buffer) === true;
  } catch {
    throw new Error(`${label} must be a fixed intrinsic Uint8Array backed by ArrayBuffer`);
  }
  if (!(buffer instanceof ArrayBuffer)
    || Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype
    || resizable) {
    throw new Error(`${label} must be a fixed intrinsic Uint8Array backed by ArrayBuffer`);
  }
  try {
    return Uint8Array.prototype.slice.call(value) as Uint8Array;
  } catch {
    throw new Error(`${label} could not be read as stable Uint8Array bytes`);
  }
}

function digestBytes(bytes: Uint8Array) {
  return `sha256:${bytesToHex(sha256(bytes))}`;
}

function assertChannel(value: unknown): asserts value is AtomisticBinaryChannelV045 {
  if (typeof value !== 'string'
    || !ATOMISTIC_PRESENTATION_CHANNELS_V046.includes(
      value as AtomisticBinaryChannelV045,
    )) {
    throw new Error('atomistic presentation channel is invalid');
  }
}

function readDataProperty(record: unknown, key: string, label: string): unknown {
  if (!record || typeof record !== 'object') throw new Error(`${label} must be a plain record`);
  const descriptor = Object.getOwnPropertyDescriptor(record, key);
  if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
    throw new Error(`${label}.${key} must be an enumerable data property`);
  }
  return descriptor.value;
}

function assertExactDataKeys(value: unknown, expected: ReadonlyArray<string>, label: string) {
  assertExactKeys(value, expected, label);
  for (const key of expected) void readDataProperty(value, key, label);
}

function assertDenseIntrinsicArray(
  value: unknown,
  expectedLength: number,
  label: string,
): asserts value is unknown[] {
  if (!Array.isArray(value)
    || Object.getPrototypeOf(value) !== Array.prototype
    || value.length !== expectedLength) {
    throw new Error(`${label} must be a dense intrinsic array of length ${expectedLength}`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== 'string'
    || (key !== 'length' && !isArrayIndex(key, expectedLength)))) {
    throw new Error(`${label} must not contain decorated keys`);
  }
  for (let index = 0; index < expectedLength; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error(`${label} must contain only enumerable data elements`);
    }
  }
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
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) {
    throw new Error(`${label} must contain only locked string keys`);
  }
  const actual = [...keys as string[]].sort(compareAscii);
  const locked = [...expected].sort(compareAscii);
  if (actual.length !== locked.length || actual.some((key, index) => key !== locked[index])) {
    throw new Error(`${label} must contain exactly the locked keys`);
  }
}

function assertDigest(value: unknown, label: string) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new Error(`${label} is invalid`);
}

function assertSafeInteger(value: unknown, minimum: number, maximum: number, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${label} must be a bounded safe integer`);
  }
}

function assertFinite(value: unknown, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || Object.is(value, -0)) {
    throw new Error(`${label} must be finite and cannot be negative zero`);
  }
}

function exactArray(left: ReadonlyArray<unknown>, right: ReadonlyArray<unknown>) {
  return left.length === right.length && left.every((value, index) => Object.is(value, right[index]));
}

function isArrayIndex(key: string, length: number) {
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < length && String(index) === key;
}

function compareAscii(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
