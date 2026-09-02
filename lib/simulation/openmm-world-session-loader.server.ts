import 'server-only';

import type {
  AtomisticPresentationFrameHandleV046,
  AtomisticPresentationFrameMetadataV046,
  AtomisticPresentationFrameRevocationReceiptV046,
} from './atomistic-presentation-frame.ts';
import type {
  AtomisticPrivatePositionTrajectoryHandleV048,
  AtomisticPrivatePositionTrajectoryMetadataV048,
} from './atomistic-private-position-trajectory-v048.ts';
import type { AtomisticWorldSessionV045 } from './atomistic-world-session.ts';
import {
  getOpenMmTip3pPrivatePositionTrajectoryHandleV048 as getPrivatePositionTrajectoryHandle,
  getOpenMmTip3pPresentationFrameHandleV046 as getPrivatePresentationHandle,
  loadOpenMmTip3pPrivatePositionTrajectoryV048 as loadPrivatePositionTrajectoryImplementation,
  loadOpenMmTip3pPresentationFrameV046 as loadPrivatePresentationImplementation,
  loadOpenMmTip3pWorldSessionV045 as loadPrivateImplementation,
  revokeOpenMmTip3pPrivatePositionTrajectoryV048 as revokePrivatePositionTrajectory,
  revokeOpenMmTip3pPresentationFrameV046 as revokePrivatePresentation,
} from './openmm-world-session-loader-implementation.server.mjs';

if (typeof process === 'undefined'
  || process.release?.name !== 'node'
  || typeof window !== 'undefined') {
  throw new Error('OpenMM world-session loading is restricted to a private Node server runtime');
}

export type LoadOpenMmTip3pWorldSessionInputV045 = Readonly<{
  artifactRoot: string;
  independentControlReceiptPath: string;
  expectedSourceRevision: string;
  sessionId: string;
}>;

export type LoadedOpenMmTip3pWorldSessionV045 = Readonly<{
  schemaVersion: 'tf.openmm-tip3p-world-session-materialization/0.4.5';
  runtimeBoundary: 'node-server-only-private-artifact-filesystem';
  evidenceBoundary:
    'scientific-self-consistency-verified-against-same-digest-bound-artifacts-execution-unattested';
  session: AtomisticWorldSessionV045;
  executionAuthenticityVerified: false;
  promotionEligible: false;
  rawScientificPayloadExposed: false;
  privateArtifactBytesRetained: false;
  cloudflareDistributionEligible: false;
  publicPayload: null;
  materializationDigest: string;
}>;

export type LoadOpenMmTip3pPresentationFrameInputV046 =
  LoadOpenMmTip3pWorldSessionInputV045 & Readonly<{
    frameOrdinal: number;
  }>;

export type LoadedOpenMmTip3pPresentationFrameV046 = Readonly<{
  schemaVersion: 'tf.openmm-tip3p-private-presentation-frame-materialization/0.4.6';
  runtimeBoundary: 'node-server-only-private-artifact-filesystem';
  evidenceBoundary:
    'scientific-self-consistency-verified-against-same-digest-bound-artifacts-execution-unattested';
  worldSessionMaterialization: LoadedOpenMmTip3pWorldSessionV045;
  presentationFrameMetadata: AtomisticPresentationFrameMetadataV046;
  sourceArtifactF64BytesReachableFromReturn: false;
  serializedBinaryPayloadExposed: false;
  privateDerivedF32BytesRetainedUntilOwnerRevocationOrCapabilityGc: true;
  explicitPrivateDerivedF32OwnerRevocationSupported: true;
  executionAuthenticityVerified: false;
  reproduced: false;
  protectedMainArtifact: false;
  attestedArtifact: false;
  sourceLicenseForPublicDistributionVerified: false;
  promotionEligible: false;
  publicDistributionEligible: false;
  cloudflareDistributionEligible: false;
  publicPayload: null;
  materializationDigest: string;
}>;

export type LoadedOpenMmTip3pPrivatePositionTrajectoryV048 = Readonly<{
  schemaVersion: 'tf.openmm-tip3p-private-position-trajectory-materialization/0.4.8';
  runtimeBoundary: 'node-server-only-private-artifact-filesystem';
  evidenceBoundary:
    'one-stable-digest-bound-reference-a-snapshot-scientifically-checked-execution-unattested';
  worldSessionMaterialization: LoadedOpenMmTip3pWorldSessionV045;
  positionTrajectoryMetadata: AtomisticPrivatePositionTrajectoryMetadataV048;
  sourceArtifactF64BytesReachableFromReturn: false;
  serializedBinaryPayloadExposed: false;
  privateDerivedF32BytesRetainedUntilOwnerRevocationOrCapabilityGc: true;
  explicitPrivateDerivedF32OwnerRevocationSupported: true;
  singleStableArtifactSnapshot: true;
  positionsOnlyDerivative: true;
  executionAuthenticityVerified: false;
  reproduced: false;
  protectedMainArtifact: false;
  attestedArtifact: false;
  sourceLicenseForPublicDistributionVerified: false;
  promotionEligible: false;
  publicDistributionEligible: false;
  cloudflareDistributionEligible: false;
  publicPayload: null;
  materializationDigest: string;
}>;

/**
 * Node-server-only facade for materializing immutable Reference-A metadata from
 * a second stable read of the artifacts bound by the independently verified
 * receipt and manifest digests. No raw scientific byte payload is returned.
 */
export async function loadOpenMmTip3pWorldSessionV045(
  input: LoadOpenMmTip3pWorldSessionInputV045,
): Promise<LoadedOpenMmTip3pWorldSessionV045> {
  return loadPrivateImplementation(input) as Promise<LoadedOpenMmTip3pWorldSessionV045>;
}

/**
 * Materializes one presentation derivative from the same stable, digest-bound
 * artifact snapshot used to build the V045 world session. The returned record
 * is plain metadata only; its private F32 handle is available solely through
 * the exact-object capability getter below. Paths, source revision, and session
 * label must come from trusted server release configuration, never HTTP input
 * or an authorization decision.
 */
export async function loadOpenMmTip3pPresentationFrameV046(
  input: LoadOpenMmTip3pPresentationFrameInputV046,
): Promise<LoadedOpenMmTip3pPresentationFrameV046> {
  return loadPrivatePresentationImplementation(input) as
    Promise<LoadedOpenMmTip3pPresentationFrameV046>;
}

/**
 * Resolves the server-local presentation handle for the exact materialization
 * object returned above. Copies, clones, spreads, and serialized round trips
 * intentionally lose this capability. The handle is a capture-time snapshot,
 * not proof that the files on disk remain fresh and not a user auth token.
 */
export function getOpenMmTip3pPresentationFrameHandleV046(
  materialization: LoadedOpenMmTip3pPresentationFrameV046,
): AtomisticPresentationFrameHandleV046 {
  return getPrivatePresentationHandle(materialization) as AtomisticPresentationFrameHandleV046;
}

/**
 * Idempotently zero-fills and releases the exact materialization's private F32
 * derivative. External copies previously requested from the handle cannot be
 * revoked and remain caller-owned.
 */
export function revokeOpenMmTip3pPresentationFrameV046(
  materialization: LoadedOpenMmTip3pPresentationFrameV046,
): AtomisticPresentationFrameRevocationReceiptV046 {
  return revokePrivatePresentation(materialization) as
    AtomisticPresentationFrameRevocationReceiptV046;
}

/**
 * Materializes all 101 positions frames from one stable, digest-bound artifact
 * snapshot. No fixture fallback, interpolation, force, velocity, path, or raw
 * payload is reachable from the returned plain metadata object.
 */
export async function loadOpenMmTip3pPrivatePositionTrajectoryV048(
  input: LoadOpenMmTip3pWorldSessionInputV045,
): Promise<LoadedOpenMmTip3pPrivatePositionTrajectoryV048> {
  return loadPrivatePositionTrajectoryImplementation(input) as
    Promise<LoadedOpenMmTip3pPrivatePositionTrajectoryV048>;
}

export function getOpenMmTip3pPrivatePositionTrajectoryHandleV048(
  materialization: LoadedOpenMmTip3pPrivatePositionTrajectoryV048,
): AtomisticPrivatePositionTrajectoryHandleV048 {
  return getPrivatePositionTrajectoryHandle(materialization) as
    AtomisticPrivatePositionTrajectoryHandleV048;
}

export function revokeOpenMmTip3pPrivatePositionTrajectoryV048(
  materialization: LoadedOpenMmTip3pPrivatePositionTrajectoryV048,
) {
  return revokePrivatePositionTrajectory(materialization) as ReturnType<
    import('./atomistic-private-position-trajectory-v048.ts')
      .AtomisticPrivatePositionTrajectoryControllerV048['revoke']
  >;
}
