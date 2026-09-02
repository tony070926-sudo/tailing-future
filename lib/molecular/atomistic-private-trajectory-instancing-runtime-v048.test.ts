import { describe, expect, it } from 'vitest';
import { AtomisticThreeInstancedRuntimeV046 } from './atomistic-three-instanced-runtime-v046.ts';
import {
  AtomisticPrivateTrajectoryInstancingRuntimeV048,
  createAtomisticPrivateTrajectoryInstancingPlanV048,
} from './atomistic-private-trajectory-instancing-runtime-v048.ts';
import { createAtomisticPrivatePositionTrajectoryControllerV048 } from
  '../simulation/atomistic-private-position-trajectory-v048.ts';
import { createAtomisticPrivatePositionTrajectoryFixtureV048 } from
  '../simulation/atomistic-private-position-trajectory-v048.test-fixture.ts';

describe('v0.4.8 trajectory instancing runtime', () => {
  it('updates all 101 frames while preserving all Three scene and buffer identities', () => {
    const fixture = createAtomisticPrivatePositionTrajectoryFixtureV048('runtime');
    const controller = createAtomisticPrivatePositionTrajectoryControllerV048(
      fixture.session,
      fixture.sourceFrames,
    );
    const plan = createAtomisticPrivateTrajectoryInstancingPlanV048(
      controller.handle.metadata,
    );
    const core = new AtomisticPrivateTrajectoryInstancingRuntimeV048(plan);
    const three = new AtomisticThreeInstancedRuntimeV046(core);
    const identities = {
      group: three.group,
      oxygen: three.oxygenAtoms,
      hydrogen: three.hydrogenAtoms,
      links: three.topologyBonds,
      oxygenGeometry: three.oxygenAtoms.geometry,
      hydrogenGeometry: three.hydrogenAtoms.geometry,
      linkGeometry: three.topologyBonds.geometry,
      oxygenMaterial: three.oxygenAtoms.material,
      hydrogenMaterial: three.hydrogenAtoms.material,
      linkMaterial: three.topologyBonds.material,
      oxygenMatrix: three.oxygenAtoms.instanceMatrix,
      hydrogenMatrix: three.hydrogenAtoms.instanceMatrix,
      linkMatrix: three.topologyBonds.instanceMatrix,
      oxygenArray: three.oxygenAtoms.instanceMatrix.array,
      hydrogenArray: three.hydrogenAtoms.instanceMatrix.array,
      linkArray: three.topologyBonds.instanceMatrix.array,
    };
    const stateKeys = [];
    try {
      for (const frameOrdinal of Array.from({ length: 101 }, (_, index) => index)) {
        const update = core.updatePrivatePositionFrameV048(
          controller.handle.getFrameHandle(frameOrdinal),
        );
        const upload = three.syncFromCore();
        stateKeys.push(update.stateKey);
        expect(update).toMatchObject({
          sourceFrameOrdinal: frameOrdinal,
          preallocatedCpuBuffersReused: true,
          interpolationApplied: false,
          forceOrVelocityConsumed: false,
          createsSolverFrame: false,
        });
        expect(upload).toMatchObject({
          sourceFrameOrdinal: frameOrdinal,
          persistentInstancedMeshCount: 3,
          sceneObjectIdentityPreserved: true,
        });
        expect(three.group).toBe(identities.group);
        expect(three.oxygenAtoms).toBe(identities.oxygen);
        expect(three.hydrogenAtoms).toBe(identities.hydrogen);
        expect(three.topologyBonds).toBe(identities.links);
        expect(three.oxygenAtoms.geometry).toBe(identities.oxygenGeometry);
        expect(three.hydrogenAtoms.geometry).toBe(identities.hydrogenGeometry);
        expect(three.topologyBonds.geometry).toBe(identities.linkGeometry);
        expect(three.oxygenAtoms.material).toBe(identities.oxygenMaterial);
        expect(three.hydrogenAtoms.material).toBe(identities.hydrogenMaterial);
        expect(three.topologyBonds.material).toBe(identities.linkMaterial);
        expect(three.oxygenAtoms.instanceMatrix).toBe(identities.oxygenMatrix);
        expect(three.hydrogenAtoms.instanceMatrix).toBe(identities.hydrogenMatrix);
        expect(three.topologyBonds.instanceMatrix).toBe(identities.linkMatrix);
        expect(three.oxygenAtoms.instanceMatrix.array).toBe(identities.oxygenArray);
        expect(three.hydrogenAtoms.instanceMatrix.array).toBe(identities.hydrogenArray);
        expect(three.topologyBonds.instanceMatrix.array).toBe(identities.linkArray);
      }
      expect(new Set(stateKeys).size).toBe(101);
      expect(three.uploadCount).toBe(101);
      expect(core.resolveAtomInstanceSelection('atom:O', 0)).toMatchObject({
        atomIndex: 0, atomId: 'tip3p-water-0:O', element: 'O',
      });
      expect(core.resolveAtomInstanceSelection('atom:H', 1_789)).toMatchObject({
        atomIndex: 2_684, atomId: 'tip3p-water-894:H2', element: 'H',
      });
    } finally {
      three.dispose();
      core.dispose();
      controller.revoke();
    }
    expect(core.disposed).toBe(true);
    expect(three.disposed).toBe(true);
    expect(() => core.snapshot()).toThrow(/disposed/);
  }, 45_000);

  it('rejects a frame capability from another trajectory before changing current state', () => {
    const firstFixture = createAtomisticPrivatePositionTrajectoryFixtureV048('runtime-a');
    const secondFixture = createAtomisticPrivatePositionTrajectoryFixtureV048('runtime-b');
    const first = createAtomisticPrivatePositionTrajectoryControllerV048(
      firstFixture.session,
      firstFixture.sourceFrames,
    );
    const second = createAtomisticPrivatePositionTrajectoryControllerV048(
      secondFixture.session,
      secondFixture.sourceFrames,
    );
    const core = new AtomisticPrivateTrajectoryInstancingRuntimeV048(
      createAtomisticPrivateTrajectoryInstancingPlanV048(first.handle.metadata),
    );
    try {
      core.updatePrivatePositionFrameV048(first.handle.getFrameHandle(0));
      const before = core.snapshot();
      expect(() => core.updatePrivatePositionFrameV048(second.handle.getFrameHandle(0)))
        .toThrow(/not bound/);
      const after = core.snapshot();
      expect(after.sourceFrameOrdinal).toBe(before.sourceFrameOrdinal);
      expect(after.presentationFrameDigest).toBe(before.presentationFrameDigest);
      zeroSnapshot(before);
      zeroSnapshot(after);
    } finally {
      core.dispose();
      first.revoke();
      second.revoke();
    }
  }, 90_000);

  it('rejects unstable or decorated position-byte owners before digesting or projecting', () => {
    const fixture = createAtomisticPrivatePositionTrajectoryFixtureV048('runtime-byte-owner');
    const controller = createAtomisticPrivatePositionTrajectoryControllerV048(
      fixture.session,
      fixture.sourceFrames,
    );
    const core = new AtomisticPrivateTrajectoryInstancingRuntimeV048(
      createAtomisticPrivateTrajectoryInstancingPlanV048(controller.handle.metadata),
    );
    const sourceHandle = controller.handle.getFrameHandle(1);
    const ordinaryBytes = sourceHandle.copyPositionBytes();
    class DecoratedUint8Array extends Uint8Array {}
    const decoratedBytes = new DecoratedUint8Array(ordinaryBytes.byteLength);
    decoratedBytes.set(ordinaryBytes);
    const sharedBytes = new Uint8Array(new SharedArrayBuffer(ordinaryBytes.byteLength));
    sharedBytes.set(ordinaryBytes);
    const cases: Array<{ label: string; bytes: Uint8Array }> = [
      { label: 'typed-array subclass', bytes: decoratedBytes },
      { label: 'SharedArrayBuffer backing', bytes: sharedBytes },
    ];
    const resizableGetter = Object.getOwnPropertyDescriptor(
      ArrayBuffer.prototype,
      'resizable',
    )?.get;
    if (resizableGetter) {
      const resizableBuffer = Reflect.construct(ArrayBuffer, [
        ordinaryBytes.byteLength,
        { maxByteLength: ordinaryBytes.byteLength * 2 },
      ]) as ArrayBuffer;
      if (resizableGetter.call(resizableBuffer) === true) {
        const resizableBytes = new Uint8Array(resizableBuffer);
        resizableBytes.set(ordinaryBytes);
        cases.push({ label: 'resizable ArrayBuffer backing', bytes: resizableBytes });
      }
    }
    try {
      core.updatePrivatePositionFrameV048(controller.handle.getFrameHandle(0));
      const before = core.snapshot();
      try {
        for (const candidate of cases) {
          const substitutedHandle = {
            ...sourceHandle,
            copyPositionBytes: () => candidate.bytes,
          };
          expect(
            () => core.updatePrivatePositionFrameV048(substitutedHandle),
            candidate.label,
          ).toThrow(/intrinsic|shared or resizable/);
          const after = core.snapshot();
          expect(after.sourceFrameOrdinal).toBe(before.sourceFrameOrdinal);
          expect(after.presentationFrameDigest).toBe(before.presentationFrameDigest);
          expect(after.displayPositionsNanometerByAtomIndex)
            .toEqual(before.displayPositionsNanometerByAtomIndex);
          zeroSnapshot(after);
        }
      } finally {
        zeroSnapshot(before);
      }
    } finally {
      ordinaryBytes.fill(0);
      core.dispose();
      controller.revoke();
    }
  }, 45_000);
});

function zeroSnapshot(snapshot: ReturnType<AtomisticPrivateTrajectoryInstancingRuntimeV048['snapshot']>) {
  snapshot.atomMatricesByBatch[0].matrices.fill(0);
  snapshot.atomMatricesByBatch[1].matrices.fill(0);
  snapshot.topologyBondMatrices.fill(0);
  snapshot.displayPositionsNanometerByAtomIndex.fill(0);
}
