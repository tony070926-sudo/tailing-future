import { readFileSync } from 'node:fs';
import {
  DynamicDrawUsage,
  Group,
  InstancedMesh,
  Raycaster,
  Vector3,
  type Intersection,
  type Object3D,
} from 'three';
import { describe, expect, it } from 'vitest';
import {
  AtomisticInstancingRuntimeV046,
  createAtomisticInstancingPlanV046,
} from './atomistic-instancing-core-v046.ts';
import {
  createAtomisticInstancingPresentationHandleV046,
  createAtomisticInstancingWorldFixtureV046,
} from './atomistic-instancing-v046.test-fixture.ts';
import {
  ATOMISTIC_THREE_INSTANCED_RUNTIME_VERSION_V046,
  AtomisticThreeInstancedRuntimeV046,
} from './atomistic-three-instanced-runtime-v046.ts';

describe('v0.4.6 Three.js atomistic InstancedMesh runtime', () => {
  it('creates exactly three persistent body meshes and shares atom geometry', () => {
    const { threeRuntime } = runtimeFixture('three-inventory');

    expect(threeRuntime.schemaVersion).toBe(ATOMISTIC_THREE_INSTANCED_RUNTIME_VERSION_V046);
    expect(threeRuntime.group).toBeInstanceOf(Group);
    expect(threeRuntime.group.children).toEqual([
      threeRuntime.topologyBonds,
      threeRuntime.oxygenAtoms,
      threeRuntime.hydrogenAtoms,
    ]);
    expect(threeRuntime.group.children.every((child) => child instanceof InstancedMesh)).toBe(true);
    expect(threeRuntime.oxygenAtoms.count).toBe(895);
    expect(threeRuntime.hydrogenAtoms.count).toBe(1_790);
    expect(threeRuntime.topologyBonds.count).toBe(1_790);
    expect(threeRuntime.oxygenAtoms.geometry).toBe(threeRuntime.hydrogenAtoms.geometry);
    expect(threeRuntime.topologyBonds.geometry).not.toBe(threeRuntime.oxygenAtoms.geometry);
    expect(threeRuntime.oxygenAtoms.material).not.toBe(threeRuntime.hydrogenAtoms.material);
    expect(threeRuntime.topologyBonds.material).not.toBe(threeRuntime.oxygenAtoms.material);
    expect(threeRuntime.oxygenAtoms.instanceMatrix.usage).toBe(DynamicDrawUsage);
    expect(threeRuntime.hydrogenAtoms.instanceMatrix.usage).toBe(DynamicDrawUsage);
    expect(threeRuntime.topologyBonds.instanceMatrix.usage).toBe(DynamicDrawUsage);
    expect(() => threeRuntime.syncFromCore()).toThrow(/before a presentation frame update/);
    expect(() => new AtomisticThreeInstancedRuntimeV046(
      {} as AtomisticInstancingRuntimeV046,
    )).toThrow(/validated instancing core/);
  });

  it('derives the locked 554,900-triangle budget from BufferGeometry draw cardinalities', () => {
    const { threeRuntime } = runtimeFixture('three-triangle-budget');
    const atomPrimitiveVertexCount = threeRuntime.oxygenAtoms.geometry.getIndex()?.count
      ?? threeRuntime.oxygenAtoms.geometry.getAttribute('position').count;
    const hydrogenPrimitiveVertexCount = threeRuntime.hydrogenAtoms.geometry.getIndex()?.count
      ?? threeRuntime.hydrogenAtoms.geometry.getAttribute('position').count;
    const bondPrimitiveVertexCount = threeRuntime.topologyBonds.geometry.getIndex()?.count
      ?? threeRuntime.topologyBonds.geometry.getAttribute('position').count;

    expect(threeRuntime.oxygenAtoms.geometry.getIndex()).toBeNull();
    expect(threeRuntime.topologyBonds.geometry.getIndex()).not.toBeNull();
    expect(atomPrimitiveVertexCount).toBe(540);
    expect(hydrogenPrimitiveVertexCount).toBe(atomPrimitiveVertexCount);
    expect(bondPrimitiveVertexCount).toBe(120);

    const triangleCount = (
      (atomPrimitiveVertexCount / 3) * threeRuntime.oxygenAtoms.count
      + (hydrogenPrimitiveVertexCount / 3) * threeRuntime.hydrogenAtoms.count
      + (bondPrimitiveVertexCount / 3) * threeRuntime.topologyBonds.count
    );
    expect(triangleCount).toBe(554_900);
  });

  it('uploads bound matrices in place, marks updates, recomputes bounds, and preserves objects', () => {
    const fixture = runtimeFixture('three-upload');
    const { coreRuntime, threeRuntime } = fixture;
    const identities = {
      oxygen: threeRuntime.oxygenAtoms,
      hydrogen: threeRuntime.hydrogenAtoms,
      bonds: threeRuntime.topologyBonds,
      atomGeometry: threeRuntime.oxygenAtoms.geometry,
      bondGeometry: threeRuntime.topologyBonds.geometry,
      oxygenMaterial: threeRuntime.oxygenAtoms.material,
      hydrogenMaterial: threeRuntime.hydrogenAtoms.material,
      bondMaterial: threeRuntime.topologyBonds.material,
    };
    const versionsBefore = matrixVersions(threeRuntime);

    const frame0 = createAtomisticInstancingPresentationHandleV046(fixture.world, 0);
    coreRuntime.update(frame0);
    const sourceSnapshot = coreRuntime.snapshot();
    const receipt0 = threeRuntime.syncFromCore();

    expect(receipt0).toMatchObject({
      status: 'three-instanced-matrices-updated-from-validated-core-snapshot',
      sourceFrameOrdinal: 0,
      sourceFrameDigest: frame0.metadata.binding.frameDigest,
      presentationFrameDigest: frame0.metadata.presentationFrameDigest,
      positionsDerivedF32Digest:
        frame0.metadata.channels.positionsNanometer.derived.sha256,
      atomOrderDigest: fixture.world.session.atomOrder.atomOrderDigest,
      persistentInstancedMeshCount: 3,
      uploadedAtomInstanceCount: 2_685,
      uploadedTopologyBondInstanceCount: 1_790,
      uploadedMatrixCount: 4_475,
      instanceMatricesMarkedForGpuUpdate: true,
      boundingBoxesRecomputed: true,
      boundingSpheresRecomputed: true,
      sceneObjectIdentityPreserved: true,
      webglOrWebgpuDrawExecuted: false,
      measuredDrawCalls: null,
      measuredFramesPerSecond: null,
      renderedChannel: 'digest-bound-source-position-f32-presentation-derivative-only',
      nonphysicalDisplayScale: true,
      topologyLinksEnergetic: false,
      publicDistributionEligible: false,
      physicalWorldState: false,
      createsTrajectoryFrame: false,
    });
    expect(Object.isFrozen(receipt0)).toBe(true);
    expect(matrixVersions(threeRuntime)).toEqual(versionsBefore.map((version) => version + 1));
    expect(firstMatrix(threeRuntime.oxygenAtoms)).toEqual(
      [...sourceSnapshot.atomMatricesByBatch[0].matrices.subarray(0, 16)],
    );
    expect(firstMatrix(threeRuntime.hydrogenAtoms)).toEqual(
      [...sourceSnapshot.atomMatricesByBatch[1].matrices.subarray(0, 16)],
    );
    expect(firstMatrix(threeRuntime.topologyBonds)).toEqual(
      [...sourceSnapshot.topologyBondMatrices.subarray(0, 16)],
    );
    for (const mesh of [
      threeRuntime.oxygenAtoms,
      threeRuntime.hydrogenAtoms,
      threeRuntime.topologyBonds,
    ]) {
      expect(mesh.boundingBox?.isEmpty()).toBe(false);
      expect(Number.isFinite(mesh.boundingSphere?.radius)).toBe(true);
    }

    const frame100 = createAtomisticInstancingPresentationHandleV046(fixture.world, 100);
    coreRuntime.update(frame100);
    const receipt100 = threeRuntime.syncFromCore();
    expect(receipt100.sourceFrameOrdinal).toBe(100);
    expect(threeRuntime.uploadCount).toBe(2);
    expect(threeRuntime.oxygenAtoms).toBe(identities.oxygen);
    expect(threeRuntime.hydrogenAtoms).toBe(identities.hydrogen);
    expect(threeRuntime.topologyBonds).toBe(identities.bonds);
    expect(threeRuntime.oxygenAtoms.geometry).toBe(identities.atomGeometry);
    expect(threeRuntime.hydrogenAtoms.geometry).toBe(identities.atomGeometry);
    expect(threeRuntime.topologyBonds.geometry).toBe(identities.bondGeometry);
    expect(threeRuntime.oxygenAtoms.material).toBe(identities.oxygenMaterial);
    expect(threeRuntime.hydrogenAtoms.material).toBe(identities.hydrogenMaterial);
    expect(threeRuntime.topologyBonds.material).toBe(identities.bondMaterial);
  });

  it('maps actual Three Raycaster instanceId hits back to authoritative atom identity', () => {
    const fixture = runtimeFixture('three-raycast');
    const frame = createAtomisticInstancingPresentationHandleV046(fixture.world, 0);
    fixture.coreRuntime.update(frame);
    fixture.threeRuntime.syncFromCore();
    fixture.threeRuntime.group.updateMatrixWorld(true);

    const oxygenIntersection = firstRayHit(
      fixture.threeRuntime.oxygenAtoms,
      new Vector3(2.98, 0.2, 1),
    );
    expect(oxygenIntersection.instanceId).toBe(0);
    expect(fixture.threeRuntime.resolveRaycastIntersection(oxygenIntersection)).toEqual({
      objectRole: 'oxygen-atoms',
      selection: {
        batchId: 'atom:O',
        instanceId: 0,
        atomIndex: 0,
        atomId: 'tip3p-water-0:O',
        moleculeId: 'tip3p-water-0',
        element: 'O',
        atomOrderDigest: fixture.world.session.atomOrder.atomOrderDigest,
        topologyDigest: fixture.world.session.topology.topologyDigest,
        mappingSemantics: 'stable-instance-to-authoritative-zero-based-pdb-record-order',
      },
      source: 'three-raycaster-instance-id',
    });

    const hydrogenIntersection = firstRayHit(
      fixture.threeRuntime.hydrogenAtoms,
      new Vector3(3.07572, 0.2, 1),
    );
    expect(hydrogenIntersection.instanceId).toBe(0);
    expect(fixture.threeRuntime.resolveRaycastIntersection(hydrogenIntersection))
      .toMatchObject({
        objectRole: 'hydrogen-atoms',
        selection: { atomIndex: 1, atomId: 'tip3p-water-0:H1', element: 'H' },
        source: 'three-raycaster-instance-id',
      });
    expect(fixture.threeRuntime.resolveRaycastIntersection({
      object: fixture.threeRuntime.topologyBonds,
      instanceId: 0,
    })).toBeNull();
    expect(fixture.threeRuntime.resolveRaycastIntersection({
      object: new Group(),
      instanceId: 0,
    })).toBeNull();
    expect(fixture.threeRuntime.resolveRaycastIntersection({
      object: fixture.threeRuntime.oxygenAtoms,
    })).toBeNull();

    const mappedAtomIndices = new Set<number>();
    for (const [mesh, count] of [
      [fixture.threeRuntime.oxygenAtoms, 895],
      [fixture.threeRuntime.hydrogenAtoms, 1_790],
    ] as const) {
      for (let instanceId = 0; instanceId < count; instanceId += 1) {
        const hit = fixture.threeRuntime.resolveRaycastIntersection({
          object: mesh,
          instanceId,
        });
        expect(hit?.selection.atomOrderDigest).toBe(
          fixture.world.session.atomOrder.atomOrderDigest,
        );
        expect(hit?.selection.topologyDigest).toBe(
          fixture.world.session.topology.topologyDigest,
        );
        mappedAtomIndices.add(hit?.selection.atomIndex ?? -1);
      }
    }
    expect(mappedAtomIndices.size).toBe(2_685);
    expect(mappedAtomIndices.has(-1)).toBe(false);
  });

  it('updates layer visibility and disposes every shared resource exactly once', () => {
    const { world, coreRuntime, threeRuntime } = runtimeFixture('three-dispose');
    coreRuntime.update(createAtomisticInstancingPresentationHandleV046(world, 0));
    threeRuntime.syncFromCore();
    threeRuntime.setLayerVisibility({ atoms: false, topologyBonds: true });
    expect(threeRuntime.oxygenAtoms.visible).toBe(false);
    expect(threeRuntime.hydrogenAtoms.visible).toBe(false);
    expect(threeRuntime.topologyBonds.visible).toBe(true);

    const disposeCounts = new Map<object, number>();
    const resources = [
      threeRuntime.oxygenAtoms,
      threeRuntime.hydrogenAtoms,
      threeRuntime.topologyBonds,
      threeRuntime.oxygenAtoms.geometry,
      threeRuntime.topologyBonds.geometry,
      threeRuntime.oxygenAtoms.material,
      threeRuntime.hydrogenAtoms.material,
      threeRuntime.topologyBonds.material,
    ];
    for (const resource of resources) {
      disposeCounts.set(resource, 0);
      const eventSource = resource as unknown as {
        addEventListener: (type: 'dispose', listener: () => void) => void;
      };
      eventSource.addEventListener('dispose', () => {
        disposeCounts.set(resource, (disposeCounts.get(resource) ?? 0) + 1);
      });
    }
    const matrixArrays = [
      threeRuntime.oxygenAtoms.instanceMatrix.array,
      threeRuntime.hydrogenAtoms.instanceMatrix.array,
      threeRuntime.topologyBonds.instanceMatrix.array,
    ];
    expect(matrixArrays.every((values) => [...values].some((value) => value !== 0))).toBe(true);
    threeRuntime.dispose();
    threeRuntime.dispose();

    expect(threeRuntime.disposed).toBe(true);
    expect(threeRuntime.group.children).toHaveLength(0);
    expect(matrixArrays.every((values) => [...values].every((value) => value === 0))).toBe(true);
    for (const resource of resources) expect(disposeCounts.get(resource)).toBe(1);
    expect(() => threeRuntime.syncFromCore()).toThrow(/disposed/);
    expect(() => threeRuntime.setLayerVisibility({ atoms: true, topologyBonds: true }))
      .toThrow(/disposed/);
    expect(() => threeRuntime.resolveRaycastIntersection({
      object: threeRuntime.oxygenAtoms,
      instanceId: 0,
    })).toThrow(/disposed/);
  });

  it('contains no renderer construction and creates only the three declared InstancedMesh objects', () => {
    const source = readFileSync(
      new URL('./atomistic-three-instanced-runtime-v046.ts', import.meta.url),
      'utf8',
    );
    expect(source).not.toMatch(/WebGLRenderer|WebGPURenderer/);
    expect(source.match(/new InstancedMesh\(/g)).toHaveLength(3);
    expect(source).not.toMatch(/new\s+Mesh\(/);
  });
});

function runtimeFixture(prefix: string) {
  const world = createAtomisticInstancingWorldFixtureV046(prefix);
  const plan = createAtomisticInstancingPlanV046(world.session);
  const coreRuntime = new AtomisticInstancingRuntimeV046(plan);
  const threeRuntime = new AtomisticThreeInstancedRuntimeV046(coreRuntime);
  return { world, coreRuntime, threeRuntime };
}

function matrixVersions(runtime: AtomisticThreeInstancedRuntimeV046) {
  return [
    runtime.oxygenAtoms.instanceMatrix.version,
    runtime.hydrogenAtoms.instanceMatrix.version,
    runtime.topologyBonds.instanceMatrix.version,
  ];
}

function firstMatrix(mesh: InstancedMesh) {
  return [...(mesh.instanceMatrix.array as Float32Array).subarray(0, 16)];
}

function firstRayHit(mesh: InstancedMesh, origin: Vector3) {
  const raycaster = new Raycaster(origin, new Vector3(0, 0, -1), 0, 2);
  const intersection = raycaster.intersectObject(mesh, false)[0];
  if (!intersection || intersection.instanceId === undefined) {
    throw new Error('locked atomistic ray did not produce an instance intersection');
  }
  return intersection as Pick<Intersection<Object3D>, 'object' | 'instanceId'>;
}
