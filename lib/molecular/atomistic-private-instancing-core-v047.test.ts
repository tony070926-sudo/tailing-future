import { describe, expect, it } from 'vitest';
import {
  getAtomisticWorldSessionFrameV045,
} from '../simulation/atomistic-world-session.ts';
import {
  createAtomisticPrivatePositionFrameControllerV047,
  createAtomisticPrivatePositionFrameMetadataV047,
  type AtomisticPrivatePositionFrameHandleV047,
} from '../simulation/atomistic-private-position-frame-v047.ts';
import {
  AtomisticPrivateInstancingRuntimeV047,
  createAtomisticPrivateInstancingPlanV047,
} from './atomistic-private-instancing-runtime-v047.ts';
import {
  AtomisticThreeInstancedRuntimeV046,
} from './atomistic-three-instanced-runtime-v046.ts';
import {
  createAtomisticInstancingPresentationHandleV046,
  createAtomisticInstancingWorldFixtureV046,
} from './atomistic-instancing-v046.test-fixture.ts';

describe('v0.4.7 sanitized private atomistic instancing path', () => {
  it('creates one position-only plan without reconstructing the private session tree', () => {
    const fixture = privateFixture('plan');
    const plan = createAtomisticPrivateInstancingPlanV047(fixture.metadata);
    expect(plan).toMatchObject({
      schemaVersion: 'tf.atomistic-private-instancing-plan/0.4.7',
      role: 'sanitized-private-single-position-frame-gpu-instancing-plan-no-solver',
      sourceBinding: {
        sourceVersion: 'tf.atomistic-private-position-frame/0.4.7',
        metadataDigest: fixture.metadata.metadataDigest,
        publicDistributionEligible: false,
      },
      inventory: {
        waterMoleculeCount: 895,
        particleCount: 2_685,
        oxygenCount: 895,
        hydrogenCount: 1_790,
        topologyLinkCount: 1_790,
        frameCount: 1,
      },
      scientificBoundary: {
        forceLayer: null,
        velocityLayer: null,
        fieldLayer: null,
        electronicDensityLayer: null,
        motionSynthesis: null,
        frameInterpolation: null,
        framesCreatedByThisModule: false,
        publicDistributionEligible: false,
      },
    });
    expect(plan.sourceBinding).toMatchObject({
      frameOrdinal: fixture.metadata.binding.frameOrdinal,
      positionsDerivedF32Digest: fixture.metadata.binding.positionsDerivedF32Digest,
    });
    expect(plan.atomBatches.map((batch) => batch.instanceCount)).toEqual([895, 1_790]);
    expect(plan.bondBatches[0].instanceCount).toBe(1_790);
    expect(plan.drawCallBudget.declaredSceneUpperBound).toBe(5);
    const selectionRuntime = new AtomisticPrivateInstancingRuntimeV047(plan);
    expect(selectionRuntime.resolveAtomInstanceSelection('atom:O', 0)).toMatchObject({
      atomIndex: 0,
      atomId: 'tip3p-water-0:O',
      element: 'O',
    });
    selectionRuntime.dispose();
    const serialized = JSON.stringify(plan);
    for (const forbidden of [
      'sourceArtifactPath',
      'sourceRevision',
      'payloadBundleRoot',
      'independentControlReceiptPath',
      'arrays/reference-a-',
    ]) expect(serialized).not.toContain(forbidden);
  });

  it('projects the sanitized frame twice without creating a second trajectory frame', () => {
    const fixture = privateFixture('update');
    const controller = createAtomisticPrivatePositionFrameControllerV047(
      fixture.metadata,
      fixture.positionsBytes,
    );
    const runtime = new AtomisticPrivateInstancingRuntimeV047(
      createAtomisticPrivateInstancingPlanV047(fixture.metadata),
    );
    const first = runtime.updatePrivatePositionFrameV047(controller.handle);
    const firstSnapshot = runtime.snapshot();
    const second = runtime.updatePrivatePositionFrameV047(controller.handle);
    const secondSnapshot = runtime.snapshot();

    expect(first).toEqual(second);
    expect(first).toMatchObject({
      status: 'sanitized-private-positions-projected-into-preallocated-runtime-buffers',
      privateFrameMetadataDigest: fixture.metadata.metadataDigest,
      positionsDerivedF32Digest: fixture.metadata.binding.positionsDerivedF32Digest,
      updatedAtomInstanceCount: 2_685,
      updatedTopologyLinkInstanceCount: 1_790,
      physicalWorldState: false,
      createsTrajectoryFrame: false,
      forcesConsumed: false,
      velocitiesConsumed: false,
      fieldsConsumed: false,
      publicDistributionEligible: false,
    });
    expect(secondSnapshot.presentationFrameDigest).toBe(fixture.metadata.metadataDigest);
    expect(secondSnapshot.atomMatricesByBatch[0].matrices)
      .toEqual(firstSnapshot.atomMatricesByBatch[0].matrices);
    expect(secondSnapshot.atomMatricesByBatch[1].matrices)
      .toEqual(firstSnapshot.atomMatricesByBatch[1].matrices);
    expect(secondSnapshot.topologyBondMatrices).toEqual(firstSnapshot.topologyBondMatrices);
    expect(secondSnapshot.displayPositionsNanometerByAtomIndex)
      .toEqual(firstSnapshot.displayPositionsNanometerByAtomIndex);
    expect(firstSnapshot.displayPositionsNanometerByAtomIndex[0]).toBeCloseTo(2.98, 5);
    controller.revoke();
    expect(() => runtime.updatePrivatePositionFrameV047(controller.handle)).toThrow(/revoked/);
  });

  it('zero-fills each issued handle copy and rejects cross-metadata updates atomically', () => {
    const fixture = privateFixture('zero-copy');
    const controller = createAtomisticPrivatePositionFrameControllerV047(
      fixture.metadata,
      fixture.positionsBytes,
    );
    let issuedCopy: Uint8Array | null = null;
    const observableHandle: AtomisticPrivatePositionFrameHandleV047 = Object.freeze({
      ...controller.handle,
      copyPositionBytes: () => {
        issuedCopy = controller.handle.copyPositionBytes();
        return issuedCopy;
      },
    });
    const runtime = new AtomisticPrivateInstancingRuntimeV047(
      createAtomisticPrivateInstancingPlanV047(fixture.metadata),
    );
    runtime.updatePrivatePositionFrameV047(observableHandle);
    expect(issuedCopy).not.toBeNull();
    const zeroedCopy = issuedCopy as unknown as Uint8Array;
    expect(zeroedCopy.every((value) => value === 0)).toBe(true);
    const stable = runtime.snapshot();

    const other = privateFixture('cross-metadata');
    const otherController = createAtomisticPrivatePositionFrameControllerV047(
      other.metadata,
      other.positionsBytes,
    );
    expect(() => runtime.updatePrivatePositionFrameV047(otherController.handle)).toThrow(/bound/);
    const after = runtime.snapshot();
    expect(after.sourceFrameDigest).toBe(stable.sourceFrameDigest);
    expect(after.displayPositionsNanometerByAtomIndex)
      .toEqual(stable.displayPositionsNanometerByAtomIndex);
    otherController.revoke();
    controller.revoke();
  });

  it('disposes runtime buffers idempotently and fails closed after disposal', () => {
    const fixture = privateFixture('dispose');
    const controller = createAtomisticPrivatePositionFrameControllerV047(
      fixture.metadata,
      fixture.positionsBytes,
    );
    const runtime = new AtomisticPrivateInstancingRuntimeV047(
      createAtomisticPrivateInstancingPlanV047(fixture.metadata),
    );
    runtime.updatePrivatePositionFrameV047(controller.handle);
    runtime.dispose();
    runtime.dispose();
    controller.revoke();
    expect(runtime.disposed).toBe(true);
    expect(() => runtime.snapshot()).toThrow(/disposed/);
    expect(() => runtime.updatePrivatePositionFrameV047(controller.handle)).toThrow(/disposed/);
  });

  it('feeds the shared Three bridge without importing the full private source session', () => {
    const fixture = privateFixture('three-bridge');
    const controller = createAtomisticPrivatePositionFrameControllerV047(
      fixture.metadata,
      fixture.positionsBytes,
    );
    const runtime = new AtomisticPrivateInstancingRuntimeV047(
      createAtomisticPrivateInstancingPlanV047(fixture.metadata),
    );
    const three = new AtomisticThreeInstancedRuntimeV046(runtime);
    runtime.updatePrivatePositionFrameV047(controller.handle);
    const upload = three.syncFromCore();
    expect(upload).toMatchObject({
      sourceFrameOrdinal: fixture.metadata.binding.frameOrdinal,
      sourceFrameDigest: fixture.metadata.binding.frameDigest,
      presentationFrameDigest: fixture.metadata.metadataDigest,
      positionsDerivedF32Digest: fixture.metadata.binding.positionsDerivedF32Digest,
      uploadedAtomInstanceCount: 2_685,
      uploadedTopologyBondInstanceCount: 1_790,
      webglOrWebgpuDrawExecuted: false,
      physicalWorldState: false,
      createsTrajectoryFrame: false,
    });
    expect(three.resolveRaycastIntersection({
      object: three.oxygenAtoms,
      instanceId: 0,
    })).toMatchObject({
      selection: { atomIndex: 0, atomId: 'tip3p-water-0:O' },
    });
    three.dispose();
    runtime.dispose();
    controller.revoke();
  });
});

function privateFixture(label: string) {
  const world = createAtomisticInstancingWorldFixtureV046(`private-core-${label}`);
  const presentation = createAtomisticInstancingPresentationHandleV046(world, 0);
  const frame = getAtomisticWorldSessionFrameV045(world.session, 0);
  const metadata = createAtomisticPrivatePositionFrameMetadataV047({
    sessionId: world.session.sessionId,
    sessionDigest: world.session.sessionDigest,
    trajectoryDigest: world.session.trajectory.trajectoryDigest,
    frameOrdinal: frame.frameOrdinal,
    frameDigest: frame.frameDigest,
    atomOrderDigest: frame.lineage.atomOrderDigest,
    cellDigest: frame.lineage.cellDigest,
    topologyDigest: frame.lineage.topologyDigest,
    step: frame.step,
    timePicoseconds: frame.timePicoseconds,
    positionsDerivedF32Digest:
      presentation.metadata.channels.positionsNanometer.derived.sha256,
  });
  return {
    metadata,
    positionsBytes: presentation.copyChannelBytes('positionsNanometer'),
  };
}
