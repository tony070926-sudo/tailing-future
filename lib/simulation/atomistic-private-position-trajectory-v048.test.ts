import { Buffer } from 'node:buffer';
import { describe, expect, it, vi } from 'vitest';
import * as worldSession from './atomistic-world-session.ts';
import {
  assertAtomisticPrivatePositionTrajectoryMetadataV048,
  createAtomisticPrivatePositionTrajectoryControllerV048,
} from './atomistic-private-position-trajectory-v048.ts';
import { createAtomisticPrivatePositionTrajectoryFixtureV048 } from
  './atomistic-private-position-trajectory-v048.test-fixture.ts';
import { digestValue } from './digest.ts';
import { minimumWrappedOxygenDistanceNanometerV048 } from
  './atomistic-private-oxygen-minimum-distance-v048.ts';

// Elapsed test-resource policy only; no physical or numerical tolerance changes.
const SNAPSHOT_OWNERSHIP_WATCHDOG_MS = 60_000;

function equalPositionByteViews(actual: Uint8Array, expected: Uint8Array): boolean {
  return Buffer.from(actual.buffer, actual.byteOffset, actual.byteLength).equals(
    Buffer.from(expected.buffer, expected.byteOffset, expected.byteLength),
  );
}

describe.sequential('v0.4.8 private positions-only trajectory owner', () => {
  it('compares complete byte views with exact offsets lengths and mismatch positions', () => {
    const actual = new Uint8Array([8, 1, 2, 3, 9]).subarray(1, 4);
    const expected = new Uint8Array([7, 6, 1, 2, 3, 5]).subarray(2, 5);
    expect(equalPositionByteViews(actual, expected)).toBe(true);
    for (const mismatch of [
      [0, 2, 3], [1, 0, 3], [1, 2, 0], [1, 2], [1, 2, 3, 4], [],
    ]) {
      expect(equalPositionByteViews(actual, new Uint8Array(mismatch))).toBe(false);
    }
    expect(equalPositionByteViews(actual.subarray(1, 1), expected.subarray(2, 2))).toBe(true);
    expect(equalPositionByteViews(actual.subarray(1, 1), expected)).toBe(false);
  });

  it('matches every public frame descriptor and independent complete F32 trajectory', () => {
    const fixture = createAtomisticPrivatePositionTrajectoryFixtureV048('snapshot-oracle');
    const controller = createAtomisticPrivatePositionTrajectoryControllerV048(fixture.session, fixture.sourceFrames);
    try {
      const expected = new Uint8Array(3_254_220);
      const output = new DataView(expected.buffer);
      for (let ordinal = 0; ordinal < 101; ordinal += 1) {
        const frame = worldSession.getAtomisticWorldSessionFrameV045(fixture.session, ordinal);
        const actual = controller.handle.metadata.sequence.frames[ordinal];
        expect(actual.frameOrdinal).toBe(frame.frameOrdinal);
        expect(actual.step).toBe(frame.step);
        expect(actual.timePicoseconds).toBe(frame.timePicoseconds);
        expect(actual.sourceFrameDigest).toBe(frame.frameDigest);
        expect(actual.sourcePositionsF64Digest).toBe(frame.arrays.positionsNanometer.frameByteDigest);
        expect(actual.derivedByteOffset).toBe(ordinal * 32_220);
        expect(actual.derivedByteLength).toBe(32_220);
        const bytes = fixture.sourceFrames[ordinal].positionsF64LeBytes;
        const input = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
        for (let component = 0; component < 8055; component += 1) {
          output.setFloat32(ordinal * 32_220 + component * 4, input.getFloat64(component * 8, true), true);
        }
      }
      expect(controller.handle.metadata.binding).toEqual({
        sessionId: fixture.session.sessionId, sessionDigest: fixture.session.sessionDigest,
        trajectoryDigest: fixture.session.trajectory.trajectoryDigest,
        orderedFrameDigest: fixture.session.trajectory.orderedFrameDigest,
        sourcePositionsArtifactDigest: fixture.session.trajectory.chunks[0].artifacts.positionsNanometer.manifestDescriptor.sha256,
        atomOrderDigest: fixture.session.atomOrder.atomOrderDigest,
        cellDigest: fixture.session.cell.cellDigest, topologyDigest: fixture.session.topology.topologyDigest,
      });
      expect(equalPositionByteViews(controller.handle.copyTrajectoryPositionBytes(), expected)).toBe(true);
      expect(assertAtomisticPrivatePositionTrajectoryMetadataV048(controller.handle.metadata)).toEqual(controller.handle.metadata);
    } finally { controller.revoke(); }
  });

  it('preserves all 202 old all-pair geometry distances and their dependent metadata digests', () => {
    expect(process.versions.node).toBe('24.16.0');
    expect(process.versions.v8).toBe('13.6.233.17-node.49');
    const fixture = createAtomisticPrivatePositionTrajectoryFixtureV048('oxygen-old-oracle');
    const controller = createAtomisticPrivatePositionTrajectoryControllerV048(fixture.session, fixture.sourceFrames);
    const nativeHypot = Math.hypot;
    let oldCalls = 0;
    let supportedCalls = 0;
    // Deliberately test-local old loop and image/wrap arithmetic. No production
    // helper participates in the old oracle or expected distance calculation.
    const image = (value: number) => value - 3 * Math.round(value / 3);
    const wrap = (value: number) => {
      const wrapped = ((value % 3) + 3) % 3;
      return Object.is(wrapped, -0) ? 0 : wrapped;
    };
    try {
      const {metadata} = controller.handle;
      const binding = {
        sessionId: fixture.session.sessionId,
        sessionDigest: fixture.session.sessionDigest,
        trajectoryDigest: fixture.session.trajectory.trajectoryDigest,
        orderedFrameDigest: fixture.session.trajectory.orderedFrameDigest,
        sourcePositionsArtifactDigest: fixture.session.trajectory.chunks[0].artifacts.positionsNanometer.manifestDescriptor.sha256,
        atomOrderDigest: fixture.session.atomOrder.atomOrderDigest,
        cellDigest: fixture.session.cell.cellDigest,
        topologyDigest: fixture.session.topology.topologyDigest,
      };
      expect(metadata.binding).toEqual(binding);
      const expectedFrames = metadata.sequence.frames.map(actual => {
        const source = fixture.sourceFrames[actual.frameOrdinal].positionsF64LeBytes;
        const input = new DataView(source.buffer, source.byteOffset, source.byteLength);
        const derived = new Uint8Array(32_220);
        const converted = new DataView(derived.buffer);
        for (let component = 0; component < 8055; component += 1) {
          converted.setFloat32(component * 4, input.getFloat64(component * 8, true), true);
        }
        const expectedGates = (['source-f64', 'derived-f32'] as const).map(precision => {
          const anchors: Array<readonly [number, number, number]> = [];
          for (let water = 0; water < 895; water += 1) {
            const values = [0, 1, 2].map(axis => {
              const component = water * 9 + axis;
              return wrap(precision === 'source-f64'
                ? input.getFloat64(component * 8, true)
                : converted.getFloat32(component * 4, true));
            });
            anchors.push([values[0], values[1], values[2]]);
          }
          let minimum = Number.POSITIVE_INFINITY;
          let frameOldCalls = 0;
          for (let left = 0; left < anchors.length; left += 1) {
            for (let right = left + 1; right < anchors.length; right += 1) {
              minimum = Math.min(minimum, nativeHypot(
                image(anchors[right][0] - anchors[left][0]),
                image(anchors[right][1] - anchors[left][1]),
                image(anchors[right][2] - anchors[left][2]),
              ));
              frameOldCalls += 1;
            }
          }
          expect(frameOldCalls).toBe(400_065);
          oldCalls += frameOldCalls;
          let helperMinimum;
          try {
            // Scalar count only: no retained argument/call arrays.
            Math.hypot = (...values: number[]) => {
              supportedCalls += 1;
              return nativeHypot(...values);
            };
            helperMinimum = minimumWrappedOxygenDistanceNanometerV048(anchors);
          } finally { Math.hypot = nativeHypot; }
          expect(Object.is(helperMinimum, minimum)).toBe(true);
          const gate = precision === 'source-f64' ? actual.sourceGeometryGate : actual.derivedGeometryGate;
          expect(Object.is(gate.minimumImageOxygenOxygenDistanceNanometer, minimum)).toBe(true);
          // Reuse only unchanged gate fields (octants, rigid residual, limits,
          // meaning). Replace the changed-distance input before hashing.
          const {gateDigest, ...unchangedGateFields} = gate;
          const expectedPayload = {...unchangedGateFields,
            minimumImageOxygenOxygenDistanceNanometer: minimum};
          const expectedGate = {...expectedPayload, gateDigest: digestValue(expectedPayload)};
          expect(gateDigest).toBe(expectedGate.gateDigest);
          expect(gate).toEqual(expectedGate);
          return expectedGate;
        });
        const [sourceGeometryGate, derivedGeometryGate] = expectedGates;
        const stateKey = digestValue({
          schemaVersion: 'tf.atomistic-private-position-state-key/0.4.8',
          sessionDigest: binding.sessionDigest,
          trajectoryDigest: binding.trajectoryDigest,
          orderedFrameDigest: binding.orderedFrameDigest,
          atomOrderDigest: binding.atomOrderDigest,
          cellDigest: binding.cellDigest,
          topologyDigest: binding.topologyDigest,
          frameOrdinal: actual.frameOrdinal,
          frameDigest: actual.sourceFrameDigest,
          step: actual.step,
          timePicoseconds: actual.timePicoseconds,
          sourcePositionsF64Digest: actual.sourcePositionsF64Digest,
          derivedPositionsF32Digest: actual.derivedPositionsF32Digest,
          sourceGeometryGateDigest: sourceGeometryGate.gateDigest,
          derivedGeometryGateDigest: derivedGeometryGate.gateDigest,
        });
        expect(actual.stateKey).toBe(stateKey);
        // The unchanged descriptor/byte fields are reused; all quantities
        // downstream of the independently computed minimum are rebuilt.
        return {...actual, sourceGeometryGate, derivedGeometryGate, stateKey};
      });
      const {metadataDigest, ...unchangedMetadataFields} = metadata;
      const expectedMetadataPayload = {...unchangedMetadataFields, binding,
        sequence: {...metadata.sequence, frames: expectedFrames}};
      expect(metadataDigest).toBe(digestValue(expectedMetadataPayload));
      expect(metadata).toEqual({...expectedMetadataPayload,
        metadataDigest: digestValue(expectedMetadataPayload)});
      expect(oldCalls).toBe(80_813_130);
      expect(supportedCalls).toBeGreaterThan(0);
      expect(supportedCalls).toBeLessThan(oldCalls);
      console.log(JSON.stringify({completeOxygenPairWork: {frames: 101, precisions: 2,
        oldCalls, supportedCalls, evidence: 'call-count-only-not-wall-speedup'}}));
    } finally { Math.hypot = nativeHypot; controller.revoke(); }
  });

  it('validates each private snapshot once without trusting later caller mutation or a shared cache', () => {
    const fixture = createAtomisticPrivatePositionTrajectoryFixtureV048('snapshot-ownership');
    const mutableSession = structuredClone(fixture.session);
    const spy = vi.spyOn(worldSession, 'assertAtomisticWorldSessionV045');
    try {
      spy.mockClear();
      const first = createAtomisticPrivatePositionTrajectoryControllerV048(mutableSession, fixture.sourceFrames);
      try {
        expect(spy).toHaveBeenCalledTimes(1);
        const second = createAtomisticPrivatePositionTrajectoryControllerV048(mutableSession, fixture.sourceFrames);
        try {
          expect(spy).toHaveBeenCalledTimes(2);
          const metadata = structuredClone(first.handle.metadata);
          const bytes = first.handle.copyTrajectoryPositionBytes();
          Reflect.set(mutableSession, 'sessionDigest', 'sha256:' + 'a'.repeat(64));
          fixture.sourceFrames[0].positionsF64LeBytes.fill(0);
          expect(first.handle.metadata).toEqual(metadata);
          expect(equalPositionByteViews(first.handle.copyTrajectoryPositionBytes(), bytes)).toBe(true);
          expect(equalPositionByteViews(second.handle.copyTrajectoryPositionBytes(), bytes)).toBe(true);
          bytes.fill(0);
          expect(first.handle.copyTrajectoryPositionBytes().some(byte => byte !== 0)).toBe(true);
          // The public getter still rejects a changed input on each separate call.
          for (const ordinal of [0, 50, 100]) {
            expect(() => worldSession.getAtomisticWorldSessionFrameV045(mutableSession, ordinal)).toThrow('atomistic session digest is stale');
          }
          expect(() => createAtomisticPrivatePositionTrajectoryControllerV048(mutableSession, fixture.sourceFrames)).toThrow('atomistic session digest is stale');
        } finally { second.revoke(); }
      } finally { first.revoke(); }
    } finally { spy.mockRestore(); }
  }, SNAPSHOT_OWNERSHIP_WATCHDOG_MS);

  it('rejects coherent first middle last descriptor and lineage corruption plus missing and reordered frames', () => {
    const fixture = createAtomisticPrivatePositionTrajectoryFixtureV048('snapshot-rejection');
    const refresh = (object: object, key: string) => {
      const payload = { ...object } as Record<string, unknown>;
      delete payload[key];
      Reflect.set(object, key, digestValue(payload));
    };
    for (const ordinal of [0, 50, 100]) {
      for (const kind of ['step', 'lineage']) {
        const session = structuredClone(fixture.session);
        const chunk = session.trajectory.chunks[0];
        const frame = chunk.frames[ordinal];
        if (kind === 'step') Reflect.set(frame, 'step', frame.step + 1);
        else Reflect.set(frame.lineage, 'trajectoryDigest', 'sha256:' + 'b'.repeat(64));
        refresh(frame, 'frameDigest'); refresh(chunk, 'chunkDigest');
        Reflect.set(session.trajectory, 'chunkDigests', [chunk.chunkDigest]);
        Reflect.set(session.trajectory, 'orderedFrameDigest', digestValue({
          schemaVersion: 'tf.atomistic-ordered-frame-set/0.4.5',
          source: session.source, trajectoryDigest: session.trajectory.trajectoryDigest,
          frameDigests: chunk.frames.map(item => item.frameDigest),
        }));
        refresh(session, 'sessionDigest');
        const rejection = kind === 'step'
          ? 'atomistic sampleSteps frame byte digest does not bind its recorded value'
          : `atomistic frame ${ordinal} lineage.trajectoryDigest is not exact`;
        // Each call receives a freshly mutated, coherently rehashed session.
        expect(() => worldSession.getAtomisticWorldSessionFrameV045(session, ordinal)).toThrow(rejection);
        expect(() => createAtomisticPrivatePositionTrajectoryControllerV048(session, fixture.sourceFrames)).toThrow(
          rejection,
        );
      }
    }
    for (const kind of ['missing', 'reordered', 'session-digest']) {
      const session = structuredClone(fixture.session);
      const frames = [...session.trajectory.chunks[0].frames];
      if (kind === 'missing') frames.splice(50, 1);
      if (kind === 'reordered') [frames[0], frames[100]] = [frames[100], frames[0]];
      Reflect.set(session.trajectory.chunks[0], 'frames', frames);
      if (kind === 'session-digest') Reflect.set(session, 'sessionDigest', 'sha256:' + 'c'.repeat(64));
      expect(() => createAtomisticPrivatePositionTrajectoryControllerV048(session, fixture.sourceFrames)).toThrow(
        kind === 'missing' ? 'atomistic chunk frame count does not match its frames'
          : kind === 'reordered' ? 'atomistic frame 0 step lineage changed'
            : 'atomistic session digest is stale',
      );
    }
  });

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
