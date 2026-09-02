import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { digestValue } from './digest.ts';
import {
  ATOMISTIC_COMPONENT_COUNT_V045,
  ATOMISTIC_F32_FRAME_BYTE_LENGTH_V045,
  ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045,
  ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045,
} from './atomistic-trajectory-chunk.ts';
import {
  assertAtomisticWorldSessionV045,
  getAtomisticWorldSessionFrameV045,
  type AtomisticWorldSessionV045,
} from './atomistic-world-session.ts';

/**
 * One private owner for the complete, discrete, positions-only OpenMM
 * Reference-A trajectory. Source F64 frames must come from one stable artifact
 * snapshot. This module converts only positions, creates no physical states,
 * and never interpolates, extrapolates, or authenticates an execution.
 */

export const ATOMISTIC_PRIVATE_POSITION_TRAJECTORY_VERSION_V048 =
  'tf.atomistic-private-position-trajectory/0.4.8' as const;
export const ATOMISTIC_PRIVATE_POSITION_TRAJECTORY_REVOCATION_VERSION_V048 =
  'tf.atomistic-private-position-trajectory-revocation/0.4.8' as const;
export const ATOMISTIC_PRIVATE_POSITION_TRAJECTORY_FRAME_COUNT_V048 =
  ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045;
export const ATOMISTIC_PRIVATE_POSITION_TRAJECTORY_BYTE_LENGTH_V048 =
  ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045 * ATOMISTIC_F32_FRAME_BYTE_LENGTH_V045;

const WATER_COUNT = 895;
const CELL_LENGTH_NANOMETER = 3;
const OH_DISTANCE_NANOMETER = 0.09572;
const HH_DISTANCE_NANOMETER = 0.15139006545247014;
const SOURCE_F64_CONSTRAINT_RELATIVE_RESIDUAL_LIMIT = 1e-6;
const DERIVED_F32_CONSTRAINT_RELATIVE_RESIDUAL_LIMIT = 1e-5;
const MINIMUM_PROBE_RMS_NANOMETER = 1e-7;
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

export type AtomisticPrivatePositionTrajectorySourceFrameInputV048 = Readonly<{
  frameOrdinal: number;
  sourcePositionsF64Digest: string;
  positionsF64LeBytes: Uint8Array;
}>;

export type AtomisticPrivatePositionGeometryGateV048 = Readonly<{
  precision: 'source-f64' | 'derived-f32';
  uniqueWrappedOxygenAnchorCount: 895;
  maximumWrappedOxygenAnchorMultiplicity: 1;
  occupiedHalfCellOctantCount: 8;
  halfCellOctantOxygenCounts: readonly [
    number, number, number, number, number, number, number, number,
  ];
  minimumImageOxygenOxygenDistanceNanometer: number;
  maximumRigidConstraintRelativeResidual: number;
  acceptedRelativeResidualLimit: 0.000001 | 0.00001;
  meaning:
    'noncollapsed-rigid-water-presentation-sanity-not-equilibrium-density-or-execution-proof';
  gateDigest: string;
}>;

export type AtomisticPrivatePositionTrajectoryFrameV048 = Readonly<{
  frameOrdinal: number;
  step: number;
  timePicoseconds: number;
  sourceFrameDigest: string;
  sourcePositionsF64Digest: string;
  derivedPositionsF32Digest: string;
  derivedByteOffset: number;
  derivedByteLength: 32_220;
  sourceGeometryGate: AtomisticPrivatePositionGeometryGateV048;
  derivedGeometryGate: AtomisticPrivatePositionGeometryGateV048;
  stateKey: string;
}>;

export type AtomisticPrivatePositionTrajectoryMetadataV048 = Readonly<{
  schemaVersion: typeof ATOMISTIC_PRIVATE_POSITION_TRAJECTORY_VERSION_V048;
  status:
    'private-spatially-resolved-discrete-position-trajectory-execution-unattested';
  sourceSchemaVersion: 'tf.atomistic-world-session/0.4.5';
  binding: Readonly<{
    sessionId: string;
    sessionDigest: string;
    trajectoryDigest: string;
    orderedFrameDigest: string;
    sourcePositionsArtifactDigest: string;
    atomOrderDigest: string;
    cellDigest: string;
    topologyDigest: string;
  }>;
  inventory: Readonly<{
    waterMoleculeCount: 895;
    particleCount: 2_685;
    oxygenCount: 895;
    hydrogenCount: 1_790;
    topologyLinkCount: 1_790;
    frameCount: 101;
  }>;
  sequence: Readonly<{
    firstFrameOrdinal: 0;
    lastFrameOrdinal: 100;
    sampleStrideSteps: 10;
    sampleIntervalPicoseconds: 0.01;
    sourcePositionsF64FrameByteLength: 64_440;
    derivedPositionsF32FrameByteLength: 32_220;
    derivedPositionsF32TrajectoryByteLength: 3_254_220;
    derivedPositionsF32TrajectoryDigest: string;
    distinctSourcePositionDigestCount: 101;
    distinctDerivedPositionDigestCount: 101;
    frames: ReadonlyArray<AtomisticPrivatePositionTrajectoryFrameV048>;
  }>;
  probeDisplacement: Readonly<{
    frameOrdinals: readonly [0, 50, 100];
    pairwiseMinimumImageRmsNanometer: Readonly<{
      frame0To50: number;
      frame50To100: number;
      frame0To100: number;
    }>;
    minimumAcceptedRmsNanometer: 1e-7;
    allProbePositionDigestsDistinct: true;
  }>;
  conversion: Readonly<{
    operation: 'per-component-f64le-to-f32le';
    rounding: 'ecmascript-dataview-setfloat32-ieee754-round-to-nearest-ties-to-even';
    sourceFiniteRequired: true;
    sourceNegativeZeroRejected: true;
    derivedNonfiniteRejected: true;
    derivedNegativeZeroRejected: true;
    interpolationApplied: false;
  }>;
  scientificBoundary: Readonly<{
    sourceEvidenceClass: 'digest-bound-position-artifact-frames-execution-unattested';
    rawPayloadChannelsIncluded: readonly ['positionsNanometer'];
    rawPayloadChannelsOmitted: readonly [
      'velocitiesNanometerPerPicosecond',
      'potentialForcesKjMolNanometer',
    ];
    sourceDeclaredDiscreteFrameCount: 101;
    solverFrameOriginVerified: false;
    createsSolverFrames: false;
    interpolationApplied: false;
    extrapolationApplied: false;
    motionSynthesizedByThisAdapter: false;
    physicalWorldState: false;
    executionAuthenticityVerified: false;
    reproduced: false;
    promotionEligible: false;
    publicDistributionEligible: false;
    cloudflareDistributionEligible: false;
  }>;
  metadataDigest: string;
}>;

export type AtomisticPrivatePositionTrajectoryFrameHandleV048 = Readonly<{
  trajectoryMetadataDigest: string;
  binding: AtomisticPrivatePositionTrajectoryMetadataV048['binding'];
  frame: AtomisticPrivatePositionTrajectoryFrameV048;
  lifecycle: Readonly<{
    ownerRevocationAuthorityExposed: false;
    externalCopiesRevokedOnOwnerRevocation: false;
  }>;
  copyPositionBytes: () => Uint8Array;
  isRevoked: () => boolean;
}>;

export type AtomisticPrivatePositionTrajectoryHandleV048 = Readonly<{
  metadata: AtomisticPrivatePositionTrajectoryMetadataV048;
  lifecycle: Readonly<{
    privatePositionByteRetention:
      'one-contiguous-3254220-byte-owner-until-revocation-or-garbage-collection';
    ownerRevocationSemantics: 'idempotent-zero-fill-and-reference-clear';
    ownerRevocationAuthorityExposedOnReadHandle: false;
    externalCopiesRevokedOnOwnerRevocation: false;
  }>;
  getFrameHandle: (frameOrdinal: number) => AtomisticPrivatePositionTrajectoryFrameHandleV048;
  copyFramePositionBytes: (frameOrdinal: number) => Uint8Array;
  copyTrajectoryPositionBytes: () => Uint8Array;
  isRevoked: () => boolean;
}>;

export type AtomisticPrivatePositionTrajectoryControllerV048 = Readonly<{
  handle: AtomisticPrivatePositionTrajectoryHandleV048;
  revoke: () => Readonly<{
    schemaVersion: typeof ATOMISTIC_PRIVATE_POSITION_TRAJECTORY_REVOCATION_VERSION_V048;
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

export function createAtomisticPrivatePositionTrajectoryControllerV048(
  sessionInput: AtomisticWorldSessionV045,
  sourceFramesInput: ReadonlyArray<AtomisticPrivatePositionTrajectorySourceFrameInputV048>,
): AtomisticPrivatePositionTrajectoryControllerV048 {
  const session = assertAtomisticWorldSessionV045(sessionInput);
  assertDenseSourceFrameArray(sourceFramesInput);
  let ownedTrajectory: Uint8Array | null = new Uint8Array(
    ATOMISTIC_PRIVATE_POSITION_TRAJECTORY_BYTE_LENGTH_V048,
  );
  let controllerIssued = false;
  try {
    const frames: AtomisticPrivatePositionTrajectoryFrameV048[] = [];
    const sourceDigests = new Set<string>();
    const derivedDigests = new Set<string>();
    for (let frameOrdinal = 0; frameOrdinal < sourceFramesInput.length; frameOrdinal += 1) {
      const input = parseSourceFrameInput(sourceFramesInput[frameOrdinal], frameOrdinal);
      try {
        const sourceFrame = getAtomisticWorldSessionFrameV045(session, frameOrdinal);
        const sourceDescriptor = sourceFrame.arrays.positionsNanometer;
        if (input.sourcePositionsF64Digest !== sourceDescriptor.frameByteDigest
          || digestBytes(input.positionsF64LeBytes) !== sourceDescriptor.frameByteDigest) {
          throw new Error(`private position trajectory source frame ${frameOrdinal} digest changed`);
        }
        if (sourceDigests.has(input.sourcePositionsF64Digest)) {
          throw new Error('private position trajectory requires 101 distinct source and derived frames');
        }
        sourceDigests.add(input.sourcePositionsF64Digest);
        const derivedBytes = convertF64PositionsToF32(input.positionsF64LeBytes, frameOrdinal);
        try {
          const derivedDigest = digestBytes(derivedBytes);
          if (derivedDigests.has(derivedDigest)) {
            throw new Error('private position trajectory requires 101 distinct source and derived frames');
          }
          derivedDigests.add(derivedDigest);
          const sourceGeometryGate = validateGeometry(
            input.positionsF64LeBytes,
            'source-f64',
            frameOrdinal,
          );
          const derivedGeometryGate = validateGeometry(
            derivedBytes,
            'derived-f32',
            frameOrdinal,
          );
          const derivedByteOffset = frameOrdinal * ATOMISTIC_F32_FRAME_BYTE_LENGTH_V045;
          ownedTrajectory.set(derivedBytes, derivedByteOffset);
          const frameWithoutStateKey = {
            frameOrdinal,
            step: sourceFrame.step,
            timePicoseconds: sourceFrame.timePicoseconds,
            sourceFrameDigest: sourceFrame.frameDigest,
            sourcePositionsF64Digest: input.sourcePositionsF64Digest,
            derivedPositionsF32Digest: derivedDigest,
            derivedByteOffset,
            derivedByteLength: 32_220 as const,
            sourceGeometryGate,
            derivedGeometryGate,
          };
          frames.push(Object.freeze({
            ...frameWithoutStateKey,
            stateKey: createStateKey({
              sessionId: session.sessionId,
              sessionDigest: session.sessionDigest,
              trajectoryDigest: session.trajectory.trajectoryDigest,
              orderedFrameDigest: session.trajectory.orderedFrameDigest,
              sourcePositionsArtifactDigest:
                session.trajectory.chunks[0].artifacts.positionsNanometer.manifestDescriptor.sha256,
              atomOrderDigest: session.atomOrder.atomOrderDigest,
              cellDigest: session.cell.cellDigest,
              topologyDigest: session.topology.topologyDigest,
            }, frameWithoutStateKey),
          }));
        } finally {
          UINT8_ARRAY_FILL.call(derivedBytes, 0);
        }
      } finally {
        UINT8_ARRAY_FILL.call(input.positionsF64LeBytes, 0);
      }
    }
    if (sourceDigests.size !== 101 || derivedDigests.size !== 101) {
      throw new Error('private position trajectory requires 101 distinct source and derived frames');
    }
    const metadata = createMetadata(session, frames, ownedTrajectory);
    let revoked = false;
    const frameHandles = frames.map((frame) => Object.freeze({
      trajectoryMetadataDigest: metadata.metadataDigest,
      binding: metadata.binding,
      frame,
      lifecycle: Object.freeze({
        ownerRevocationAuthorityExposed: false as const,
        externalCopiesRevokedOnOwnerRevocation: false as const,
      }),
      copyPositionBytes() {
        if (revoked || ownedTrajectory === null) {
          throw new Error('private position trajectory capability is revoked');
        }
        const bytes = ownedTrajectory.slice(
          frame.derivedByteOffset,
          frame.derivedByteOffset + frame.derivedByteLength,
        );
        if (digestBytes(bytes) !== frame.derivedPositionsF32Digest) {
          UINT8_ARRAY_FILL.call(bytes, 0);
          throw new Error('private position trajectory owned frame lost integrity');
        }
        return bytes;
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
        if (revoked) throw new Error('private position trajectory capability is revoked');
        return frameHandles[frameOrdinal];
      },
      copyFramePositionBytes(frameOrdinal: number) {
        assertFrameOrdinal(frameOrdinal);
        return frameHandles[frameOrdinal].copyPositionBytes();
      },
      copyTrajectoryPositionBytes() {
        if (revoked || ownedTrajectory === null) {
          throw new Error('private position trajectory capability is revoked');
        }
        const bytes = ownedTrajectory.slice();
        if (digestBytes(bytes) !== metadata.sequence.derivedPositionsF32TrajectoryDigest) {
          UINT8_ARRAY_FILL.call(bytes, 0);
          throw new Error('private position trajectory owned payload lost integrity');
        }
        return bytes;
      },
      isRevoked: () => revoked,
    });
    const receipt = Object.freeze({
      schemaVersion: ATOMISTIC_PRIVATE_POSITION_TRAJECTORY_REVOCATION_VERSION_V048,
      status: 'revoked' as const,
      metadataDigest: metadata.metadataDigest,
      frameCountZeroFilled: 101 as const,
      positionByteLengthZeroFilled: 3_254_220 as const,
      internalReferenceCleared: true as const,
      previouslyIssuedCopiesRevoked: false as const,
      runtimeOrGpuCopiesRevoked: false as const,
      securePhysicalErasureVerified: false as const,
    });
    controllerIssued = true;
    return Object.freeze({
      handle,
      revoke() {
        if (revoked) return receipt;
        revoked = true;
        if (ownedTrajectory !== null) UINT8_ARRAY_FILL.call(ownedTrajectory, 0);
        ownedTrajectory = null;
        return receipt;
      },
    });
  } finally {
    if (!controllerIssued && ownedTrajectory !== null) {
      UINT8_ARRAY_FILL.call(ownedTrajectory, 0);
      ownedTrajectory = null;
    }
  }
}

export function assertAtomisticPrivatePositionTrajectoryMetadataV048(
  candidate: unknown,
): AtomisticPrivatePositionTrajectoryMetadataV048 {
  const clone = safePlainClone(candidate, 'private position trajectory metadata') as
    AtomisticPrivatePositionTrajectoryMetadataV048;
  assertExactKeys(clone, [
    'schemaVersion', 'status', 'sourceSchemaVersion', 'binding', 'inventory',
    'sequence', 'probeDisplacement', 'conversion', 'scientificBoundary', 'metadataDigest',
  ], 'private position trajectory metadata');
  if (clone.schemaVersion !== ATOMISTIC_PRIVATE_POSITION_TRAJECTORY_VERSION_V048
    || clone.status
      !== 'private-spatially-resolved-discrete-position-trajectory-execution-unattested'
    || clone.sourceSchemaVersion !== 'tf.atomistic-world-session/0.4.5') {
    throw new Error('private position trajectory identity changed');
  }
  assertExactKeys(clone.binding, [
    'sessionId', 'sessionDigest', 'trajectoryDigest', 'orderedFrameDigest',
    'sourcePositionsArtifactDigest', 'atomOrderDigest', 'cellDigest', 'topologyDigest',
  ], 'private position trajectory binding');
  if (typeof clone.binding.sessionId !== 'string'
    || !/^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/.test(clone.binding.sessionId)) {
    throw new Error('private position trajectory sessionId is invalid');
  }
  for (const value of [
    clone.binding.sessionDigest,
    clone.binding.trajectoryDigest,
    clone.binding.orderedFrameDigest,
    clone.binding.sourcePositionsArtifactDigest,
    clone.binding.atomOrderDigest,
    clone.binding.cellDigest,
    clone.binding.topologyDigest,
  ]) assertDigest(value, 'private position trajectory binding digest');
  assertLiteralRecord(clone.inventory, {
    waterMoleculeCount: 895,
    particleCount: 2_685,
    oxygenCount: 895,
    hydrogenCount: 1_790,
    topologyLinkCount: 1_790,
    frameCount: 101,
  }, 'private position trajectory inventory');
  assertExactKeys(clone.sequence, [
    'firstFrameOrdinal', 'lastFrameOrdinal', 'sampleStrideSteps',
    'sampleIntervalPicoseconds', 'sourcePositionsF64FrameByteLength',
    'derivedPositionsF32FrameByteLength', 'derivedPositionsF32TrajectoryByteLength',
    'derivedPositionsF32TrajectoryDigest', 'distinctSourcePositionDigestCount',
    'distinctDerivedPositionDigestCount', 'frames',
  ], 'private position trajectory sequence');
  if (clone.sequence.firstFrameOrdinal !== 0 || clone.sequence.lastFrameOrdinal !== 100
    || clone.sequence.sampleStrideSteps !== 10
    || clone.sequence.sampleIntervalPicoseconds !== 0.01
    || clone.sequence.sourcePositionsF64FrameByteLength !== 64_440
    || clone.sequence.derivedPositionsF32FrameByteLength !== 32_220
    || clone.sequence.derivedPositionsF32TrajectoryByteLength !== 3_254_220
    || clone.sequence.distinctSourcePositionDigestCount !== 101
    || clone.sequence.distinctDerivedPositionDigestCount !== 101
    || !Array.isArray(clone.sequence.frames) || clone.sequence.frames.length !== 101) {
    throw new Error('private position trajectory sequence changed');
  }
  assertDigest(clone.sequence.derivedPositionsF32TrajectoryDigest,
    'private position trajectory payload digest');
  const sourceDigests = new Set<string>();
  const derivedDigests = new Set<string>();
  for (let index = 0; index < clone.sequence.frames.length; index += 1) {
    const frame = clone.sequence.frames[index];
    assertFrameDescriptor(frame, index);
    if (frame.stateKey !== createStateKey(clone.binding, frame)) {
      throw new Error(`private position trajectory frame ${index} state key is stale`);
    }
    sourceDigests.add(frame.sourcePositionsF64Digest);
    derivedDigests.add(frame.derivedPositionsF32Digest);
  }
  if (sourceDigests.size !== 101 || derivedDigests.size !== 101) {
    throw new Error('private position trajectory frame digest uniqueness changed');
  }
  assertProbeDisplacement(clone.probeDisplacement);
  assertLiteralRecord(clone.conversion, {
    operation: 'per-component-f64le-to-f32le',
    rounding: 'ecmascript-dataview-setfloat32-ieee754-round-to-nearest-ties-to-even',
    sourceFiniteRequired: true,
    sourceNegativeZeroRejected: true,
    derivedNonfiniteRejected: true,
    derivedNegativeZeroRejected: true,
    interpolationApplied: false,
  }, 'private position trajectory conversion');
  assertLiteralRecord(clone.scientificBoundary, {
    sourceEvidenceClass: 'digest-bound-position-artifact-frames-execution-unattested',
    rawPayloadChannelsIncluded: ['positionsNanometer'],
    rawPayloadChannelsOmitted: [
      'velocitiesNanometerPerPicosecond',
      'potentialForcesKjMolNanometer',
    ],
    sourceDeclaredDiscreteFrameCount: 101,
    solverFrameOriginVerified: false,
    createsSolverFrames: false,
    interpolationApplied: false,
    extrapolationApplied: false,
    motionSynthesizedByThisAdapter: false,
    physicalWorldState: false,
    executionAuthenticityVerified: false,
    reproduced: false,
    promotionEligible: false,
    publicDistributionEligible: false,
    cloudflareDistributionEligible: false,
  }, 'private position trajectory scientific boundary');
  assertDigest(clone.metadataDigest, 'private position trajectory metadata digest');
  const { metadataDigest, ...payload } = clone;
  if (metadataDigest !== digestValue(payload)) {
    throw new Error('private position trajectory metadata digest is stale');
  }
  return deepFreeze(clone);
}

function createMetadata(
  session: AtomisticWorldSessionV045,
  frames: ReadonlyArray<AtomisticPrivatePositionTrajectoryFrameV048>,
  ownedTrajectory: Uint8Array,
) {
  const sourcePositionsArtifactDigest =
    session.trajectory.chunks[0].artifacts.positionsNanometer.manifestDescriptor.sha256;
  const binding = Object.freeze({
    sessionId: session.sessionId,
    sessionDigest: session.sessionDigest,
    trajectoryDigest: session.trajectory.trajectoryDigest,
    orderedFrameDigest: session.trajectory.orderedFrameDigest,
    sourcePositionsArtifactDigest,
    atomOrderDigest: session.atomOrder.atomOrderDigest,
    cellDigest: session.cell.cellDigest,
    topologyDigest: session.topology.topologyDigest,
  });
  const probeRms = Object.freeze({
    frame0To50: minimumImageRms(ownedTrajectory, 0, 50),
    frame50To100: minimumImageRms(ownedTrajectory, 50, 100),
    frame0To100: minimumImageRms(ownedTrajectory, 0, 100),
  });
  if (Object.values(probeRms).some((value) => (
    !Number.isFinite(value) || value <= MINIMUM_PROBE_RMS_NANOMETER
  ))) {
    throw new Error('private position trajectory probe displacement is below F32 noise gate');
  }
  const payload = {
    schemaVersion: ATOMISTIC_PRIVATE_POSITION_TRAJECTORY_VERSION_V048,
    status:
      'private-spatially-resolved-discrete-position-trajectory-execution-unattested' as const,
    sourceSchemaVersion: 'tf.atomistic-world-session/0.4.5' as const,
    binding,
    inventory: {
      waterMoleculeCount: 895 as const,
      particleCount: 2_685 as const,
      oxygenCount: 895 as const,
      hydrogenCount: 1_790 as const,
      topologyLinkCount: 1_790 as const,
      frameCount: 101 as const,
    },
    sequence: {
      firstFrameOrdinal: 0 as const,
      lastFrameOrdinal: 100 as const,
      sampleStrideSteps: 10 as const,
      sampleIntervalPicoseconds: 0.01 as const,
      sourcePositionsF64FrameByteLength: 64_440 as const,
      derivedPositionsF32FrameByteLength: 32_220 as const,
      derivedPositionsF32TrajectoryByteLength: 3_254_220 as const,
      derivedPositionsF32TrajectoryDigest: digestBytes(ownedTrajectory),
      distinctSourcePositionDigestCount: 101 as const,
      distinctDerivedPositionDigestCount: 101 as const,
      frames: Object.freeze([...frames]),
    },
    probeDisplacement: {
      frameOrdinals: [0, 50, 100] as const,
      pairwiseMinimumImageRmsNanometer: probeRms,
      minimumAcceptedRmsNanometer: 1e-7 as const,
      allProbePositionDigestsDistinct: true as const,
    },
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
    scientificBoundary: {
      sourceEvidenceClass:
        'digest-bound-position-artifact-frames-execution-unattested' as const,
      rawPayloadChannelsIncluded: ['positionsNanometer'] as const,
      rawPayloadChannelsOmitted: [
        'velocitiesNanometerPerPicosecond',
        'potentialForcesKjMolNanometer',
      ] as const,
      sourceDeclaredDiscreteFrameCount: 101 as const,
      solverFrameOriginVerified: false as const,
      createsSolverFrames: false as const,
      interpolationApplied: false as const,
      extrapolationApplied: false as const,
      motionSynthesizedByThisAdapter: false as const,
      physicalWorldState: false as const,
      executionAuthenticityVerified: false as const,
      reproduced: false as const,
      promotionEligible: false as const,
      publicDistributionEligible: false as const,
      cloudflareDistributionEligible: false as const,
    },
  };
  return assertAtomisticPrivatePositionTrajectoryMetadataV048({
    ...payload,
    metadataDigest: digestValue(payload),
  });
}

function parseSourceFrameInput(
  input: AtomisticPrivatePositionTrajectorySourceFrameInputV048,
  expectedOrdinal: number,
) {
  assertExactKeys(input, [
    'frameOrdinal', 'sourcePositionsF64Digest', 'positionsF64LeBytes',
  ], `private position trajectory source frame ${expectedOrdinal}`);
  if (input.frameOrdinal !== expectedOrdinal) {
    throw new Error(`private position trajectory source frame ${expectedOrdinal} is out of order`);
  }
  assertDigest(input.sourcePositionsF64Digest,
    `private position trajectory source frame ${expectedOrdinal} digest`);
  const positionsF64LeBytes = copyIntrinsicBytes(
    input.positionsF64LeBytes,
    ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045,
    `private position trajectory source frame ${expectedOrdinal}`,
  );
  return {
    frameOrdinal: expectedOrdinal,
    sourcePositionsF64Digest: input.sourcePositionsF64Digest,
    positionsF64LeBytes,
  };
}

function convertF64PositionsToF32(sourceBytes: Uint8Array, frameOrdinal: number) {
  const source = new DataView(sourceBytes.buffer, sourceBytes.byteOffset, sourceBytes.byteLength);
  const derived = new Uint8Array(ATOMISTIC_F32_FRAME_BYTE_LENGTH_V045);
  const target = new DataView(derived.buffer);
  try {
    for (let index = 0; index < ATOMISTIC_COMPONENT_COUNT_V045; index += 1) {
      const value = source.getFloat64(index * 8, true);
      if (!Number.isFinite(value) || Object.is(value, -0)) {
        throw new Error(`private position trajectory source frame ${frameOrdinal} component ${index} is invalid`);
      }
      target.setFloat32(index * 4, value, true);
      const converted = target.getFloat32(index * 4, true);
      if (!Number.isFinite(converted) || Object.is(converted, -0)) {
        throw new Error(`private position trajectory frame ${frameOrdinal} F32 conversion failed`);
      }
    }
    return derived;
  } catch (error) {
    UINT8_ARRAY_FILL.call(derived, 0);
    throw error;
  }
}

function validateGeometry(
  bytes: Uint8Array,
  precision: 'source-f64' | 'derived-f32',
  frameOrdinal: number,
): AtomisticPrivatePositionGeometryGateV048 {
  const width = precision === 'source-f64' ? 8 : 4;
  const expectedLength = precision === 'source-f64'
    ? ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045
    : ATOMISTIC_F32_FRAME_BYTE_LENGTH_V045;
  if (bytes.byteLength !== expectedLength) {
    throw new Error(`private position trajectory frame ${frameOrdinal} geometry byte length changed`);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const read = precision === 'source-f64'
    ? (index: number) => view.getFloat64(index * width, true)
    : (index: number) => view.getFloat32(index * width, true);
  const oxygenAnchors: Array<readonly [number, number, number]> = [];
  const oxygenKeys = new Map<string, number>();
  const octants = [0, 0, 0, 0, 0, 0, 0, 0];
  let maximumRelativeResidual = 0;
  for (let water = 0; water < WATER_COUNT; water += 1) {
    const offset = water * 9;
    const oxygen = [read(offset), read(offset + 1), read(offset + 2)] as const;
    const hydrogen1 = minimumImageSite(oxygen, [
      read(offset + 3), read(offset + 4), read(offset + 5),
    ]);
    const hydrogen2 = minimumImageSite(oxygen, [
      read(offset + 6), read(offset + 7), read(offset + 8),
    ]);
    for (const value of [...oxygen, ...hydrogen1, ...hydrogen2]) {
      if (!Number.isFinite(value) || Object.is(value, -0)) {
        throw new Error(`private position trajectory frame ${frameOrdinal} geometry is invalid`);
      }
    }
    maximumRelativeResidual = Math.max(
      maximumRelativeResidual,
      relativeResidual(distance(oxygen, hydrogen1), OH_DISTANCE_NANOMETER),
      relativeResidual(distance(oxygen, hydrogen2), OH_DISTANCE_NANOMETER),
      relativeResidual(distance(hydrogen1, hydrogen2), HH_DISTANCE_NANOMETER),
    );
    const wrapped = oxygen.map(wrapCell) as [number, number, number];
    const key = coordinateBitKey(wrapped, precision);
    oxygenKeys.set(key, (oxygenKeys.get(key) ?? 0) + 1);
    oxygenAnchors.push(wrapped);
    const octant = (wrapped[0] >= 1.5 ? 4 : 0)
      + (wrapped[1] >= 1.5 ? 2 : 0)
      + (wrapped[2] >= 1.5 ? 1 : 0);
    octants[octant] += 1;
  }
  const maximumMultiplicity = Math.max(...oxygenKeys.values());
  if (oxygenKeys.size !== WATER_COUNT || maximumMultiplicity !== 1) {
    throw new Error(`private position trajectory frame ${frameOrdinal} has collapsed oxygen anchors`);
  }
  if (octants.some((count) => count === 0)) {
    throw new Error(`private position trajectory frame ${frameOrdinal} does not occupy all cell octants`);
  }
  let minimumOxygenDistance = Number.POSITIVE_INFINITY;
  for (let left = 0; left < oxygenAnchors.length; left += 1) {
    for (let right = left + 1; right < oxygenAnchors.length; right += 1) {
      minimumOxygenDistance = Math.min(minimumOxygenDistance, Math.hypot(
        minimumImage(oxygenAnchors[right][0] - oxygenAnchors[left][0]),
        minimumImage(oxygenAnchors[right][1] - oxygenAnchors[left][1]),
        minimumImage(oxygenAnchors[right][2] - oxygenAnchors[left][2]),
      ));
    }
  }
  if (!Number.isFinite(minimumOxygenDistance) || minimumOxygenDistance <= 0) {
    throw new Error(`private position trajectory frame ${frameOrdinal} has zero O-O separation`);
  }
  const acceptedRelativeResidualLimit = precision === 'source-f64'
    ? SOURCE_F64_CONSTRAINT_RELATIVE_RESIDUAL_LIMIT
    : DERIVED_F32_CONSTRAINT_RELATIVE_RESIDUAL_LIMIT;
  if (maximumRelativeResidual > acceptedRelativeResidualLimit) {
    throw new Error(`private position trajectory frame ${frameOrdinal} exceeds ${precision} rigid-water tolerance`);
  }
  const payload = {
    precision,
    uniqueWrappedOxygenAnchorCount: 895 as const,
    maximumWrappedOxygenAnchorMultiplicity: 1 as const,
    occupiedHalfCellOctantCount: 8 as const,
    halfCellOctantOxygenCounts: octants as [
      number, number, number, number, number, number, number, number,
    ],
    minimumImageOxygenOxygenDistanceNanometer: minimumOxygenDistance,
    maximumRigidConstraintRelativeResidual: maximumRelativeResidual,
    acceptedRelativeResidualLimit: acceptedRelativeResidualLimit as 0.000001 | 0.00001,
    meaning:
      'noncollapsed-rigid-water-presentation-sanity-not-equilibrium-density-or-execution-proof' as const,
  };
  return deepFreeze({ ...payload, gateDigest: digestValue(payload) });
}

function createStateKey(
  binding: AtomisticPrivatePositionTrajectoryMetadataV048['binding'],
  frame: Omit<AtomisticPrivatePositionTrajectoryFrameV048, 'stateKey'>,
) {
  return digestValue({
    schemaVersion: 'tf.atomistic-private-position-state-key/0.4.8',
    sessionDigest: binding.sessionDigest,
    trajectoryDigest: binding.trajectoryDigest,
    orderedFrameDigest: binding.orderedFrameDigest,
    atomOrderDigest: binding.atomOrderDigest,
    cellDigest: binding.cellDigest,
    topologyDigest: binding.topologyDigest,
    frameOrdinal: frame.frameOrdinal,
    frameDigest: frame.sourceFrameDigest,
    step: frame.step,
    timePicoseconds: frame.timePicoseconds,
    sourcePositionsF64Digest: frame.sourcePositionsF64Digest,
    derivedPositionsF32Digest: frame.derivedPositionsF32Digest,
    sourceGeometryGateDigest: frame.sourceGeometryGate.gateDigest,
    derivedGeometryGateDigest: frame.derivedGeometryGate.gateDigest,
  });
}

function assertFrameDescriptor(frame: AtomisticPrivatePositionTrajectoryFrameV048, index: number) {
  assertExactKeys(frame, [
    'frameOrdinal', 'step', 'timePicoseconds', 'sourceFrameDigest',
    'sourcePositionsF64Digest', 'derivedPositionsF32Digest', 'derivedByteOffset',
    'derivedByteLength', 'sourceGeometryGate', 'derivedGeometryGate', 'stateKey',
  ], `private position trajectory frame ${index}`);
  if (frame.frameOrdinal !== index || frame.step !== index * 10
    || Math.abs(frame.timePicoseconds - index * 0.01) > 1e-12
    || frame.derivedByteOffset !== index * ATOMISTIC_F32_FRAME_BYTE_LENGTH_V045
    || frame.derivedByteLength !== 32_220) {
    throw new Error(`private position trajectory frame ${index} sequence changed`);
  }
  for (const digest of [
    frame.sourceFrameDigest,
    frame.sourcePositionsF64Digest,
    frame.derivedPositionsF32Digest,
    frame.stateKey,
  ]) assertDigest(digest, `private position trajectory frame ${index} digest`);
  assertGeometryGate(frame.sourceGeometryGate, 'source-f64', index);
  assertGeometryGate(frame.derivedGeometryGate, 'derived-f32', index);
}

function assertGeometryGate(
  gate: AtomisticPrivatePositionGeometryGateV048,
  precision: 'source-f64' | 'derived-f32',
  frameOrdinal: number,
) {
  assertExactKeys(gate, [
    'precision', 'uniqueWrappedOxygenAnchorCount',
    'maximumWrappedOxygenAnchorMultiplicity', 'occupiedHalfCellOctantCount',
    'halfCellOctantOxygenCounts', 'minimumImageOxygenOxygenDistanceNanometer',
    'maximumRigidConstraintRelativeResidual', 'acceptedRelativeResidualLimit',
    'meaning', 'gateDigest',
  ], `private position trajectory frame ${frameOrdinal} ${precision} geometry gate`);
  const limit = precision === 'source-f64' ? 0.000001 : 0.00001;
  if (gate.precision !== precision || gate.uniqueWrappedOxygenAnchorCount !== 895
    || gate.maximumWrappedOxygenAnchorMultiplicity !== 1
    || gate.occupiedHalfCellOctantCount !== 8
    || !Array.isArray(gate.halfCellOctantOxygenCounts)
    || gate.halfCellOctantOxygenCounts.length !== 8
    || gate.halfCellOctantOxygenCounts.some((count) => !Number.isSafeInteger(count) || count < 1)
    || gate.halfCellOctantOxygenCounts.reduce((sum, count) => sum + count, 0) !== 895
    || !Number.isFinite(gate.minimumImageOxygenOxygenDistanceNanometer)
    || gate.minimumImageOxygenOxygenDistanceNanometer <= 0
    || !Number.isFinite(gate.maximumRigidConstraintRelativeResidual)
    || gate.maximumRigidConstraintRelativeResidual < 0
    || gate.maximumRigidConstraintRelativeResidual > limit
    || gate.acceptedRelativeResidualLimit !== limit
    || gate.meaning
      !== 'noncollapsed-rigid-water-presentation-sanity-not-equilibrium-density-or-execution-proof') {
    throw new Error(`private position trajectory frame ${frameOrdinal} ${precision} geometry gate changed`);
  }
  assertDigest(gate.gateDigest,
    `private position trajectory frame ${frameOrdinal} ${precision} gate digest`);
  const { gateDigest, ...payload } = gate;
  if (gateDigest !== digestValue(payload)) {
    throw new Error(`private position trajectory frame ${frameOrdinal} ${precision} gate digest is stale`);
  }
}

function assertProbeDisplacement(value: AtomisticPrivatePositionTrajectoryMetadataV048['probeDisplacement']) {
  assertExactKeys(value, [
    'frameOrdinals', 'pairwiseMinimumImageRmsNanometer',
    'minimumAcceptedRmsNanometer', 'allProbePositionDigestsDistinct',
  ], 'private position trajectory probe displacement');
  if (!exactArray(value.frameOrdinals, [0, 50, 100])
    || value.minimumAcceptedRmsNanometer !== 1e-7
    || value.allProbePositionDigestsDistinct !== true) {
    throw new Error('private position trajectory probe identity changed');
  }
  assertExactKeys(value.pairwiseMinimumImageRmsNanometer, [
    'frame0To50', 'frame50To100', 'frame0To100',
  ], 'private position trajectory probe RMS');
  if (Object.values(value.pairwiseMinimumImageRmsNanometer).some((entry) => (
    !Number.isFinite(entry) || entry <= MINIMUM_PROBE_RMS_NANOMETER
  ))) throw new Error('private position trajectory probe RMS changed');
}

function minimumImageRms(trajectory: Uint8Array, leftOrdinal: number, rightOrdinal: number) {
  const view = new DataView(trajectory.buffer, trajectory.byteOffset, trajectory.byteLength);
  const leftOffset = leftOrdinal * ATOMISTIC_F32_FRAME_BYTE_LENGTH_V045;
  const rightOffset = rightOrdinal * ATOMISTIC_F32_FRAME_BYTE_LENGTH_V045;
  let sumSquared = 0;
  for (let index = 0; index < ATOMISTIC_COMPONENT_COUNT_V045; index += 1) {
    const delta = minimumImage(
      view.getFloat32(rightOffset + index * 4, true)
      - view.getFloat32(leftOffset + index * 4, true),
    );
    sumSquared += delta * delta;
  }
  return Math.sqrt(sumSquared / ATOMISTIC_COMPONENT_COUNT_V045);
}

function coordinateBitKey(
  coordinate: readonly [number, number, number],
  precision: 'source-f64' | 'derived-f32',
) {
  const width = precision === 'source-f64' ? 8 : 4;
  const bytes = new Uint8Array(width * 3);
  const view = new DataView(bytes.buffer);
  for (let axis = 0; axis < 3; axis += 1) {
    if (precision === 'source-f64') view.setFloat64(axis * width, coordinate[axis], true);
    else view.setFloat32(axis * width, coordinate[axis], true);
  }
  return bytesToHex(bytes);
}

function minimumImageSite(
  oxygen: readonly [number, number, number],
  site: ReadonlyArray<number>,
): readonly [number, number, number] {
  return [
    oxygen[0] + minimumImage(site[0] - oxygen[0]),
    oxygen[1] + minimumImage(site[1] - oxygen[1]),
    oxygen[2] + minimumImage(site[2] - oxygen[2]),
  ];
}

function relativeResidual(value: number, target: number) {
  return Math.abs(value - target) / target;
}

function distance(
  left: readonly [number, number, number],
  right: readonly [number, number, number],
) {
  return Math.hypot(right[0] - left[0], right[1] - left[1], right[2] - left[2]);
}

function wrapCell(value: number) {
  const wrapped = ((value % CELL_LENGTH_NANOMETER) + CELL_LENGTH_NANOMETER)
    % CELL_LENGTH_NANOMETER;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

function minimumImage(value: number) {
  return value - CELL_LENGTH_NANOMETER * Math.round(value / CELL_LENGTH_NANOMETER);
}

function copyIntrinsicBytes(value: unknown, expectedLength: number, label: string) {
  if (!(value instanceof Uint8Array)
    || Object.getPrototypeOf(value) !== Uint8Array.prototype
    || value.byteLength !== expectedLength) {
    throw new Error(`${label} must be one fixed intrinsic Uint8Array`);
  }
  let buffer: unknown;
  let resizable = false;
  try {
    buffer = TYPED_ARRAY_BUFFER_GETTER?.call(value);
    resizable = ARRAY_BUFFER_RESIZABLE_GETTER?.call(buffer) === true;
  } catch {
    throw new Error(`${label} must have stable ArrayBuffer ownership`);
  }
  if (!(buffer instanceof ArrayBuffer)
    || Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype
    || resizable) {
    throw new Error(`${label} rejects shared or resizable buffers`);
  }
  return Uint8Array.prototype.slice.call(value) as Uint8Array;
}

function assertFrameOrdinal(value: number) {
  if (!Number.isSafeInteger(value) || value < 0 || value >= 101) {
    throw new Error('private position trajectory frame ordinal must be 0 through 100');
  }
}

function digestBytes(bytes: Uint8Array) {
  return `sha256:${bytesToHex(sha256(bytes))}`;
}

function assertDigest(value: unknown, label: string) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new Error(`${label} is invalid`);
}

function safePlainClone<T>(value: T, label: string): T {
  try {
    void digestValue(value);
  } catch (error) {
    throw new Error(`${label} is not a canonical plain-data tree`, { cause: error });
  }
  return structuredClone(value);
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
    throw new Error(`${label} must contain only string keys`);
  }
  const sortedActual = [...actual as string[]].sort();
  const sortedExpected = [...expected].sort();
  if (sortedActual.length !== sortedExpected.length
    || sortedActual.some((key, index) => key !== sortedExpected[index])) {
    throw new Error(`${label} must contain exactly the locked keys`);
  }
  for (const key of sortedActual) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error(`${label}.${key} must be one enumerable data property`);
    }
  }
}

function assertDenseSourceFrameArray(value: unknown): asserts value is ReadonlyArray<
AtomisticPrivatePositionTrajectorySourceFrameInputV048> {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
    || value.length !== ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045) {
    throw new Error('private position trajectory requires exactly 101 source frames');
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== 'string'
    || (key !== 'length' && !/^\d+$/.test(key)))) {
    throw new Error('private position trajectory source frames must be an undecorated array');
  }
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
      throw new Error('private position trajectory source frames must be dense data elements');
    }
  }
}

function exactArray(value: unknown, expected: ReadonlyArray<unknown>) {
  return Array.isArray(value) && value.length === expected.length
    && value.every((entry, index) => Object.is(entry, expected[index]));
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
