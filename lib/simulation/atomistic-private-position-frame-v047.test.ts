import { describe, expect, it } from 'vitest';
import {
  createAtomisticInstancingPresentationHandleV046,
  createAtomisticInstancingWorldFixtureV046,
} from '../molecular/atomistic-instancing-v046.test-fixture.ts';
import { getAtomisticWorldSessionFrameV045 } from './atomistic-world-session.ts';
import {
  ATOMISTIC_PRIVATE_POSITION_BYTE_LENGTH_V047,
  assertAtomisticPrivatePositionFrameMetadataV047,
  createAtomisticPrivatePositionFrameControllerV047,
  createAtomisticPrivatePositionFrameMetadataV047,
  type AtomisticPrivatePositionFrameBindingInputV047,
} from './atomistic-private-position-frame-v047.ts';

describe('v0.4.7 sanitized private position frame', () => {
  it('derives a frozen minimal single-frame contract with no private artifact tree', () => {
    const source = sourceFixture('minimal');
    const metadata = createAtomisticPrivatePositionFrameMetadataV047(source.binding);
    const serialized = JSON.stringify(metadata);

    expect(metadata).toMatchObject({
      schemaVersion: 'tf.atomistic-private-position-frame/0.4.7',
      status: 'sanitized-private-single-position-frame-execution-unattested',
      binding: source.binding,
      inventory: {
        waterMoleculeCount: 895,
        particleCount: 2_685,
        oxygenCount: 895,
        hydrogenCount: 1_790,
        topologyLinkCount: 1_790,
      },
      positionChannel: {
        channel: 'positionsNanometer',
        dtype: 'float32-le',
        byteLength: 32_220,
        sha256: source.binding.positionsDerivedF32Digest,
      },
      scientificBoundary: {
        rawPayloadChannelsIncluded: ['positionsNanometer'],
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
      },
    });
    expect(Object.isFrozen(metadata)).toBe(true);
    expect(Object.isFrozen(metadata.binding)).toBe(true);
    for (const forbidden of [
      'sourceArtifactPath',
      'sourceRevision',
      'payloadBundleRoot',
      'independentControlReceiptPath',
      'manifestPath',
      'receiptPath',
      'byteOffset',
      'arrays/reference-a-',
    ]) expect(serialized).not.toContain(forbidden);
  });

  it('fails closed on extra keys, stale digests, and altered literal boundaries', () => {
    const metadata = createAtomisticPrivatePositionFrameMetadataV047(
      sourceFixture('validation').binding,
    );
    const extra = { ...structuredClone(metadata), artifactRoot: '/private/path' };
    expect(() => assertAtomisticPrivatePositionFrameMetadataV047(extra)).toThrow(
      /exactly the locked keys/,
    );

    const stale = structuredClone(metadata) as unknown as {
      binding: { step: number };
    };
    stale.binding.step += 1;
    expect(() => assertAtomisticPrivatePositionFrameMetadataV047(stale)).toThrow(/digest is stale/);

    const promoted = structuredClone(metadata) as unknown as {
      scientificBoundary: { publicDistributionEligible: boolean };
    };
    promoted.scientificBoundary.publicDistributionEligible = true;
    expect(() => assertAtomisticPrivatePositionFrameMetadataV047(promoted)).toThrow(/changed/);
  });

  it('owns one defensive positions copy and revokes it with deterministic zero-fill semantics', () => {
    const source = sourceFixture('owner');
    const metadata = createAtomisticPrivatePositionFrameMetadataV047(source.binding);
    const originalFirstByte = source.positionsBytes[0];
    const controller = createAtomisticPrivatePositionFrameControllerV047(
      metadata,
      source.positionsBytes,
    );
    source.positionsBytes.fill(0xff);
    const issuedCopy = controller.handle.copyPositionBytes();
    expect(issuedCopy[0]).toBe(originalFirstByte);
    issuedCopy[0] ^= 1;
    expect(controller.handle.copyPositionBytes()[0]).toBe(originalFirstByte);

    const first = controller.revoke();
    const second = controller.revoke();
    expect(first).toBe(second);
    expect(first).toMatchObject({
      status: 'revoked',
      positionByteLengthZeroFilled: ATOMISTIC_PRIVATE_POSITION_BYTE_LENGTH_V047,
      internalReferenceCleared: true,
      previouslyIssuedCopiesRevoked: false,
      runtimeOrGpuCopiesRevoked: false,
      securePhysicalErasureVerified: false,
    });
    expect(controller.handle.isRevoked()).toBe(true);
    expect(() => controller.handle.copyPositionBytes()).toThrow(/revoked/);
    expect(issuedCopy.some((value) => value !== 0)).toBe(true);
    issuedCopy.fill(0);
  });

  it('rejects altered, non-finite, shared, and wrong-sized position bytes', () => {
    const source = sourceFixture('bytes');
    const metadata = createAtomisticPrivatePositionFrameMetadataV047(source.binding);
    const altered = source.positionsBytes.slice();
    altered[0] ^= 1;
    expect(() => createAtomisticPrivatePositionFrameControllerV047(metadata, altered)).toThrow(
      /differ from sanitized metadata/,
    );

    const nonFinite = source.positionsBytes.slice();
    new DataView(nonFinite.buffer).setFloat32(0, Number.NaN, true);
    expect(() => createAtomisticPrivatePositionFrameControllerV047(metadata, nonFinite)).toThrow(
      /finite/,
    );
    expect(() => createAtomisticPrivatePositionFrameControllerV047(
      metadata,
      source.positionsBytes.subarray(0, source.positionsBytes.length - 1),
    )).toThrow(/32,220-byte/);

    if (typeof SharedArrayBuffer !== 'undefined') {
      const shared = new Uint8Array(new SharedArrayBuffer(source.positionsBytes.byteLength));
      shared.set(source.positionsBytes);
      expect(() => createAtomisticPrivatePositionFrameControllerV047(metadata, shared)).toThrow(
        /stable ArrayBuffer|shared or resizable/,
      );
    }
  });
});

function sourceFixture(label: string) {
  const fixture = createAtomisticInstancingWorldFixtureV046(`private-v047-${label}`);
  const presentation = createAtomisticInstancingPresentationHandleV046(fixture, 0);
  const frame = getAtomisticWorldSessionFrameV045(fixture.session, 0);
  const binding: AtomisticPrivatePositionFrameBindingInputV047 = {
    sessionId: fixture.session.sessionId,
    sessionDigest: fixture.session.sessionDigest,
    trajectoryDigest: fixture.session.trajectory.trajectoryDigest,
    frameOrdinal: frame.frameOrdinal,
    frameDigest: frame.frameDigest,
    atomOrderDigest: frame.lineage.atomOrderDigest,
    cellDigest: frame.lineage.cellDigest,
    topologyDigest: frame.lineage.topologyDigest,
    step: frame.step,
    timePicoseconds: frame.timePicoseconds,
    positionsDerivedF32Digest:
      presentation.metadata.channels.positionsNanometer.derived.sha256,
  };
  return {
    binding,
    positionsBytes: presentation.copyChannelBytes('positionsNanometer'),
  };
}
