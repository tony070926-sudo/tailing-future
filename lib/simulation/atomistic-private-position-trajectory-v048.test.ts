import { describe, expect, it } from 'vitest';
import {
  assertAtomisticPrivatePositionTrajectoryMetadataV048,
  createAtomisticPrivatePositionTrajectoryControllerV048,
} from './atomistic-private-position-trajectory-v048.ts';
import { createAtomisticPrivatePositionTrajectoryFixtureV048 } from
  './atomistic-private-position-trajectory-v048.test-fixture.ts';
import { digestValue } from './digest.ts';

describe.sequential('v0.4.8 private positions-only trajectory owner', () => {
  it('owns exactly 101 spatially resolved solver frames without interpolation', () => {
    const fixture = createAtomisticPrivatePositionTrajectoryFixtureV048('accepted');
    const controller = createAtomisticPrivatePositionTrajectoryControllerV048(
      fixture.session,
      fixture.sourceFrames,
    );
    const { metadata } = controller.handle;

    expect(metadata).toMatchObject({
      schemaVersion: 'tf.atomistic-private-position-trajectory/0.4.8',
      status: 'private-spatially-resolved-discrete-position-trajectory-execution-unattested',
      inventory: { particleCount: 2_685, frameCount: 101 },
      sequence: {
        firstFrameOrdinal: 0,
        lastFrameOrdinal: 100,
        distinctSourcePositionDigestCount: 101,
        distinctDerivedPositionDigestCount: 101,
        derivedPositionsF32TrajectoryByteLength: 3_254_220,
      },
      scientificBoundary: {
        sourceEvidenceClass: 'digest-bound-position-artifact-frames-execution-unattested',
        rawPayloadChannelsIncluded: ['positionsNanometer'],
        sourceDeclaredDiscreteFrameCount: 101,
        solverFrameOriginVerified: false,
        createsSolverFrames: false,
        interpolationApplied: false,
        motionSynthesizedByThisAdapter: false,
        executionAuthenticityVerified: false,
        reproduced: false,
        publicDistributionEligible: false,
      },
    });
    expect(metadata.sequence.frames).toHaveLength(101);
    expect(metadata.sequence.frames[0].sourceGeometryGate)
      .toMatchObject({ uniqueWrappedOxygenAnchorCount: 895, occupiedHalfCellOctantCount: 8 });
    expect(metadata.sequence.frames[100].derivedGeometryGate)
      .toMatchObject({ uniqueWrappedOxygenAnchorCount: 895, occupiedHalfCellOctantCount: 8 });
    expect(metadata.probeDisplacement.pairwiseMinimumImageRmsNanometer.frame0To100)
      .toBeGreaterThan(1e-7);
    expect(assertAtomisticPrivatePositionTrajectoryMetadataV048(metadata)).toEqual(metadata);

    const first = controller.handle.copyFramePositionBytes(50);
    const second = controller.handle.getFrameHandle(50).copyPositionBytes();
    expect(first).toHaveLength(32_220);
    expect(second).toEqual(first);
    first.fill(0xff);
    expect(controller.handle.copyFramePositionBytes(50)).toEqual(second);
    first.fill(0);
    second.fill(0);

    const trajectoryBytes = controller.handle.copyTrajectoryPositionBytes();
    expect(trajectoryBytes).toHaveLength(3_254_220);
    const frame37Offset = 37 * 32_220;
    const frame37 = controller.handle.copyFramePositionBytes(37);
    expect(trajectoryBytes.slice(frame37Offset, frame37Offset + 32_220)).toEqual(frame37);
    trajectoryBytes.fill(0);
    const freshTrajectoryBytes = controller.handle.copyTrajectoryPositionBytes();
    expect(freshTrajectoryBytes.some((byte) => byte !== 0)).toBe(true);
    freshTrajectoryBytes.fill(0);
    frame37.fill(0);

    const metadataClone = structuredClone(metadata) as unknown as
      Record<string, unknown> & {
        metadataDigest: string;
        sequence: { frames: Array<{ stateKey: string }> };
      };
    metadataClone.sequence.frames[37].stateKey = `sha256:${'a'.repeat(64)}`;
    const payload: Record<string, unknown> = { ...metadataClone };
    delete payload.metadataDigest;
    metadataClone.metadataDigest = digestValue(payload);
    expect(() => assertAtomisticPrivatePositionTrajectoryMetadataV048(metadataClone))
      .toThrow(/state key is stale/);

    const receipt = controller.revoke();
    expect(receipt).toMatchObject({
      status: 'revoked', frameCountZeroFilled: 101,
      positionByteLengthZeroFilled: 3_254_220,
    });
    expect(controller.revoke()).toBe(receipt);
    expect(controller.handle.isRevoked()).toBe(true);
    expect(() => controller.handle.copyFramePositionBytes(0)).toThrow(/revoked/);
    expect(() => controller.handle.copyTrajectoryPositionBytes()).toThrow(/revoked/);
    expect(() => controller.handle.getFrameHandle(100)).toThrow(/revoked/);
  }, 30_000);

  it('rejects the old 895-water collapsed visual fixture', () => {
    const fixture = createAtomisticPrivatePositionTrajectoryFixtureV048(
      'collapsed',
      { layout: 'collapsed' },
    );
    expect(() => createAtomisticPrivatePositionTrajectoryControllerV048(
      fixture.session,
      fixture.sourceFrames,
    )).toThrow(/collapsed oxygen anchors/);
  });

  it('rejects a rigid-water geometry violation even when all source digests are refreshed', () => {
    const fixture = createAtomisticPrivatePositionTrajectoryFixtureV048('geometry', {
      mutate: { frameOrdinal: 0, componentIndex: 3, value: 0.3 },
    });
    expect(() => createAtomisticPrivatePositionTrajectoryControllerV048(
      fixture.session,
      fixture.sourceFrames,
    )).toThrow(/exceeds source-f64 rigid-water tolerance/);
  });

  it('rejects non-finite input and out-of-order frame descriptors', () => {
    const nonfinite = createAtomisticPrivatePositionTrajectoryFixtureV048('nan', {
      mutate: { frameOrdinal: 0, componentIndex: 0, value: Number.NaN },
    });
    expect(() => createAtomisticPrivatePositionTrajectoryControllerV048(
      nonfinite.session,
      nonfinite.sourceFrames,
    )).toThrow(/component 0 is invalid/);

    const reordered = createAtomisticPrivatePositionTrajectoryFixtureV048('reordered');
    const inputs = [...reordered.sourceFrames];
    [inputs[0], inputs[1]] = [inputs[1], inputs[0]];
    expect(() => createAtomisticPrivatePositionTrajectoryControllerV048(
      reordered.session,
      inputs,
    )).toThrow(/source frame 0 is out of order/);
  });

  it('rejects each F64-to-F32 numeric edge before a derived frame can be issued', () => {
    for (const numericCase of [
      { prefix: 'infinity', value: Number.POSITIVE_INFINITY, error: /component 0 is invalid/ },
      { prefix: 'negative-zero', value: -0, error: /component 0 is invalid/ },
      { prefix: 'f32-overflow', value: Number.MAX_VALUE, error: /F32 conversion failed/ },
      { prefix: 'f32-negative-zero', value: -Number.MIN_VALUE, error: /F32 conversion failed/ },
    ]) {
      const fixture = createAtomisticPrivatePositionTrajectoryFixtureV048(numericCase.prefix, {
        mutate: { frameOrdinal: 0, componentIndex: 0, value: numericCase.value },
      });
      expect(() => createAtomisticPrivatePositionTrajectoryControllerV048(
        fixture.session,
        fixture.sourceFrames,
      ), numericCase.prefix).toThrow(numericCase.error);
    }
  });

  it('rejects duplicate declared frames before scanning the remaining trajectory', () => {
    const duplicate = createAtomisticPrivatePositionTrajectoryFixtureV048('duplicate', {
      duplicateFrame: { sourceOrdinal: 0, targetOrdinal: 1 },
    });
    expect(() => createAtomisticPrivatePositionTrajectoryControllerV048(
      duplicate.session,
      duplicate.sourceFrames,
    )).toThrow(/requires 101 distinct source and derived frames/);
  });

  it('rejects rigid geometry that survives F64 but collapses after F32 conversion', () => {
    const f32Geometry = createAtomisticPrivatePositionTrajectoryFixtureV048('f32-geometry', {
      translateWater: { frameOrdinal: 0, waterIndex: 0, deltaNanometer: 256 },
    });
    expect(() => createAtomisticPrivatePositionTrajectoryControllerV048(
      f32Geometry.session,
      f32Geometry.sourceFrames,
    )).toThrow(/exceeds derived-f32 rigid-water tolerance/);
  });
});
