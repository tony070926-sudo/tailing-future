import {
  CylinderGeometry,
  DynamicDrawUsage,
  Group,
  IcosahedronGeometry,
  InstancedMesh,
  MeshPhysicalMaterial,
  type Intersection,
  type Object3D,
} from 'three';
/**
 * Three.js scene-object bridge for the receipt-bound V046 instancing core.
 *
 * This layer never accepts caller-authored matrices. It pulls a fresh snapshot
 * from one validated core runtime, copies those matrices into three persistent
 * InstancedMesh objects, and marks the GPU attributes dirty. Creating scene
 * objects is not evidence that a WebGL/WebGPU draw occurred or met an FPS goal.
 */

export const ATOMISTIC_THREE_INSTANCED_RUNTIME_VERSION_V046 =
  'tf.atomistic-three-instanced-runtime/0.4.6' as const;
export const ATOMISTIC_THREE_INSTANCED_UPLOAD_RECEIPT_VERSION_V046 =
  'tf.atomistic-three-instanced-upload-receipt/0.4.6' as const;

const OXYGEN_INSTANCE_COUNT = 895 as const;
const HYDROGEN_INSTANCE_COUNT = 1_790 as const;
const PARTICLE_COUNT = 2_685 as const;
const TOPOLOGY_LINK_COUNT = 1_790 as const;
const MATRIX_COMPONENT_COUNT = 16;
const MAX_ABSOLUTE_MATRIX_COMPONENT = 1_000_000;
const FLOAT32_ARRAY_FILL = Float32Array.prototype.fill;

type AtomisticInstanceSelection = Readonly<{
  batchId: 'atom:O' | 'atom:H';
  instanceId: number;
  atomIndex: number;
  atomId: string;
  moleculeId: string;
  element: 'O' | 'H';
  atomOrderDigest: string;
  topologyDigest: string;
  mappingSemantics: 'stable-instance-to-authoritative-zero-based-pdb-record-order';
}>;

type AtomisticCoreSnapshot = Readonly<{
  sourceFrameOrdinal: number | null;
  sourceFrameDigest: string | null;
  presentationFrameDigest: string | null;
  positionsDerivedF32Digest: string | null;
  atomOrderDigest: string;
  topologyDigest: string;
  publicDistributionEligible: false;
  atomMatricesByBatch: readonly [
    Readonly<{ batchId: 'atom:O'; matrices: Float32Array }>,
    Readonly<{ batchId: 'atom:H'; matrices: Float32Array }>,
  ];
  topologyBondMatrices: Float32Array;
  displayPositionsNanometerByAtomIndex: Float32Array;
}>;

type AtomisticInstancingCore = Readonly<{
  snapshot: () => AtomisticCoreSnapshot;
  resolveAtomInstanceSelection: (
    batchId: 'atom:O' | 'atom:H',
    instanceId: number,
  ) => AtomisticInstanceSelection;
}>;

export type AtomisticThreeInstancedUploadReceiptV046 = Readonly<{
  schemaVersion: typeof ATOMISTIC_THREE_INSTANCED_UPLOAD_RECEIPT_VERSION_V046;
  status: 'three-instanced-matrices-updated-from-validated-core-snapshot';
  sourceFrameOrdinal: number;
  sourceFrameDigest: string;
  presentationFrameDigest: string;
  positionsDerivedF32Digest: string;
  atomOrderDigest: string;
  persistentInstancedMeshCount: 3;
  uploadedAtomInstanceCount: 2_685;
  uploadedTopologyBondInstanceCount: 1_790;
  uploadedMatrixCount: 4_475;
  instanceMatricesMarkedForGpuUpdate: true;
  boundingBoxesRecomputed: true;
  boundingSpheresRecomputed: true;
  sceneObjectIdentityPreserved: true;
  webglOrWebgpuDrawExecuted: false;
  measuredDrawCalls: null;
  measuredFramesPerSecond: null;
  renderedChannel: 'digest-bound-source-position-f32-presentation-derivative-only';
  nonphysicalDisplayScale: true;
  topologyLinksEnergetic: false;
  publicDistributionEligible: false;
  physicalWorldState: false;
  createsTrajectoryFrame: false;
}>;

export type AtomisticThreeRaycastHitV046 = Readonly<{
  objectRole: 'oxygen-atoms' | 'hydrogen-atoms';
  selection: AtomisticInstanceSelection;
  source: 'three-raycaster-instance-id';
}>;

export class AtomisticThreeInstancedRuntimeV046 {
  readonly schemaVersion = ATOMISTIC_THREE_INSTANCED_RUNTIME_VERSION_V046;
  readonly group: Group;
  readonly oxygenAtoms: InstancedMesh<IcosahedronGeometry, MeshPhysicalMaterial>;
  readonly hydrogenAtoms: InstancedMesh<IcosahedronGeometry, MeshPhysicalMaterial>;
  readonly topologyBonds: InstancedMesh<CylinderGeometry, MeshPhysicalMaterial>;

  #core: AtomisticInstancingCore;
  #atomGeometry: IcosahedronGeometry;
  #bondGeometry: CylinderGeometry;
  #oxygenMaterial: MeshPhysicalMaterial;
  #hydrogenMaterial: MeshPhysicalMaterial;
  #bondMaterial: MeshPhysicalMaterial;
  #disposed = false;
  #uploadCount = 0;

  constructor(core: AtomisticInstancingCore) {
    if (!core || typeof core !== 'object'
      || typeof core.snapshot !== 'function'
      || typeof core.resolveAtomInstanceSelection !== 'function') {
      throw new Error('atomistic Three runtime requires a validated instancing core');
    }
    this.#core = core;
    this.#atomGeometry = new IcosahedronGeometry(1, 2);
    this.#bondGeometry = new CylinderGeometry(1, 1, 1, 10, 1, false);
    this.#oxygenMaterial = new MeshPhysicalMaterial({
      color: 0xff647c,
      emissive: 0x3c0711,
      emissiveIntensity: 0.16,
      metalness: 0.02,
      roughness: 0.24,
      clearcoat: 0.28,
      clearcoatRoughness: 0.3,
    });
    this.#hydrogenMaterial = new MeshPhysicalMaterial({
      color: 0xe7f2ff,
      emissive: 0x0b1b2e,
      emissiveIntensity: 0.12,
      metalness: 0,
      roughness: 0.2,
      clearcoat: 0.34,
      clearcoatRoughness: 0.24,
    });
    this.#bondMaterial = new MeshPhysicalMaterial({
      color: 0x8fb2d6,
      emissive: 0x071421,
      emissiveIntensity: 0.08,
      metalness: 0,
      roughness: 0.38,
      transparent: true,
      opacity: 0.62,
      depthWrite: false,
    });

    this.oxygenAtoms = new InstancedMesh(
      this.#atomGeometry,
      this.#oxygenMaterial,
      OXYGEN_INSTANCE_COUNT,
    );
    this.hydrogenAtoms = new InstancedMesh(
      this.#atomGeometry,
      this.#hydrogenMaterial,
      HYDROGEN_INSTANCE_COUNT,
    );
    this.topologyBonds = new InstancedMesh(
      this.#bondGeometry,
      this.#bondMaterial,
      TOPOLOGY_LINK_COUNT,
    );
    this.oxygenAtoms.name = 'tf-v046-oxygen-atoms';
    this.hydrogenAtoms.name = 'tf-v046-hydrogen-atoms';
    this.topologyBonds.name = 'tf-v046-water-oh-topology-links';
    this.oxygenAtoms.instanceMatrix.setUsage(DynamicDrawUsage);
    this.hydrogenAtoms.instanceMatrix.setUsage(DynamicDrawUsage);
    this.topologyBonds.instanceMatrix.setUsage(DynamicDrawUsage);

    this.group = new Group();
    this.group.name = 'tf-v046-atomistic-instanced-scene';
    this.group.add(this.topologyBonds, this.oxygenAtoms, this.hydrogenAtoms);
  }

  get uploadCount() {
    return this.#uploadCount;
  }

  get disposed() {
    return this.#disposed;
  }

  syncFromCore(): AtomisticThreeInstancedUploadReceiptV046 {
    this.#assertActive();
    const snapshot = this.#core.snapshot();
    try {
      if (snapshot.sourceFrameOrdinal === null
        || snapshot.sourceFrameDigest === null
        || snapshot.presentationFrameDigest === null
        || snapshot.positionsDerivedF32Digest === null
        || snapshot.publicDistributionEligible !== false) {
        throw new Error('atomistic Three runtime cannot upload before a presentation frame update');
      }
      const oxygenMatrices = snapshot.atomMatricesByBatch[0];
      const hydrogenMatrices = snapshot.atomMatricesByBatch[1];
      if (oxygenMatrices.batchId !== 'atom:O'
        || hydrogenMatrices.batchId !== 'atom:H') {
        throw new Error('atomistic core snapshot batch order changed');
      }
      assertMatrixArray(
        oxygenMatrices.matrices,
        OXYGEN_INSTANCE_COUNT,
        'oxygen instance matrices',
      );
      assertMatrixArray(
        hydrogenMatrices.matrices,
        HYDROGEN_INSTANCE_COUNT,
        'hydrogen instance matrices',
      );
      assertMatrixArray(
        snapshot.topologyBondMatrices,
      TOPOLOGY_LINK_COUNT,
        'topology-bond instance matrices',
      );

      copyInstanceMatrices(this.oxygenAtoms, oxygenMatrices.matrices);
      copyInstanceMatrices(this.hydrogenAtoms, hydrogenMatrices.matrices);
      copyInstanceMatrices(this.topologyBonds, snapshot.topologyBondMatrices);
      recomputeBounds(this.oxygenAtoms);
      recomputeBounds(this.hydrogenAtoms);
      recomputeBounds(this.topologyBonds);
      this.#uploadCount += 1;

      return Object.freeze({
      schemaVersion: ATOMISTIC_THREE_INSTANCED_UPLOAD_RECEIPT_VERSION_V046,
      status: 'three-instanced-matrices-updated-from-validated-core-snapshot' as const,
      sourceFrameOrdinal: snapshot.sourceFrameOrdinal,
      sourceFrameDigest: snapshot.sourceFrameDigest,
      presentationFrameDigest: snapshot.presentationFrameDigest,
      positionsDerivedF32Digest: snapshot.positionsDerivedF32Digest,
      atomOrderDigest: snapshot.atomOrderDigest,
      persistentInstancedMeshCount: 3 as const,
      uploadedAtomInstanceCount: PARTICLE_COUNT,
      uploadedTopologyBondInstanceCount: TOPOLOGY_LINK_COUNT,
      uploadedMatrixCount: 4_475 as const,
      instanceMatricesMarkedForGpuUpdate: true as const,
      boundingBoxesRecomputed: true as const,
      boundingSpheresRecomputed: true as const,
      sceneObjectIdentityPreserved: true as const,
      webglOrWebgpuDrawExecuted: false as const,
      measuredDrawCalls: null,
      measuredFramesPerSecond: null,
      renderedChannel:
        'digest-bound-source-position-f32-presentation-derivative-only' as const,
      nonphysicalDisplayScale: true as const,
      topologyLinksEnergetic: false as const,
      publicDistributionEligible: false as const,
      physicalWorldState: false as const,
      createsTrajectoryFrame: false as const,
      });
    } finally {
      zeroSnapshotArrays(snapshot);
    }
  }

  resolveRaycastIntersection(
    intersection: Pick<Intersection<Object3D>, 'object' | 'instanceId'>,
  ): AtomisticThreeRaycastHitV046 | null {
    this.#assertActive();
    if (!intersection || typeof intersection !== 'object') {
      throw new Error('atomistic Three raycast intersection is invalid');
    }
    const instanceId = intersection.instanceId;
    if (instanceId === undefined) return null;
    if (!Number.isSafeInteger(instanceId) || instanceId < 0) {
      throw new Error('atomistic Three raycast instanceId is invalid');
    }
    if (intersection.object === this.oxygenAtoms) {
      return Object.freeze({
        objectRole: 'oxygen-atoms' as const,
        selection: this.#core.resolveAtomInstanceSelection(
          'atom:O',
          instanceId,
        ),
        source: 'three-raycaster-instance-id' as const,
      });
    }
    if (intersection.object === this.hydrogenAtoms) {
      return Object.freeze({
        objectRole: 'hydrogen-atoms' as const,
        selection: this.#core.resolveAtomInstanceSelection(
          'atom:H',
          instanceId,
        ),
        source: 'three-raycaster-instance-id' as const,
      });
    }
    return null;
  }

  setLayerVisibility(layers: Readonly<{ atoms: boolean; topologyBonds: boolean }>) {
    this.#assertActive();
    if (!layers || typeof layers !== 'object'
      || typeof layers.atoms !== 'boolean'
      || typeof layers.topologyBonds !== 'boolean') {
      throw new Error('atomistic Three layer visibility input is invalid');
    }
    this.oxygenAtoms.visible = layers.atoms;
    this.hydrogenAtoms.visible = layers.atoms;
    this.topologyBonds.visible = layers.topologyBonds;
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    zeroInstanceMatrix(this.oxygenAtoms);
    zeroInstanceMatrix(this.hydrogenAtoms);
    zeroInstanceMatrix(this.topologyBonds);
    this.group.remove(this.topologyBonds, this.oxygenAtoms, this.hydrogenAtoms);
    this.oxygenAtoms.dispose();
    this.hydrogenAtoms.dispose();
    this.topologyBonds.dispose();
    this.#atomGeometry.dispose();
    this.#bondGeometry.dispose();
    this.#oxygenMaterial.dispose();
    this.#hydrogenMaterial.dispose();
    this.#bondMaterial.dispose();
  }

  #assertActive() {
    if (this.#disposed) throw new Error('atomistic Three runtime is disposed');
  }
}

function assertMatrixArray(values: Float32Array, instanceCount: number, label: string) {
  if (!(values instanceof Float32Array)
    || values.length !== instanceCount * MATRIX_COMPONENT_COUNT) {
    throw new Error(`${label} has an invalid Float32 matrix layout`);
  }
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!Number.isFinite(value)
      || Math.abs(value) > MAX_ABSOLUTE_MATRIX_COMPONENT) {
      throw new Error(`${label} component ${index} is invalid`);
    }
  }
}

function copyInstanceMatrices(
  mesh: InstancedMesh,
  source: Float32Array,
) {
  const target = mesh.instanceMatrix.array;
  if (!(target instanceof Float32Array) || target.length !== source.length) {
    throw new Error('Three instanceMatrix storage differs from the locked Float32 layout');
  }
  target.set(source);
  mesh.instanceMatrix.needsUpdate = true;
}

function zeroSnapshotArrays(
  snapshot: AtomisticCoreSnapshot,
) {
  FLOAT32_ARRAY_FILL.call(snapshot.atomMatricesByBatch[0].matrices, 0);
  FLOAT32_ARRAY_FILL.call(snapshot.atomMatricesByBatch[1].matrices, 0);
  FLOAT32_ARRAY_FILL.call(snapshot.topologyBondMatrices, 0);
  FLOAT32_ARRAY_FILL.call(snapshot.displayPositionsNanometerByAtomIndex, 0);
}

function zeroInstanceMatrix(mesh: InstancedMesh) {
  const values = mesh.instanceMatrix.array;
  if (values instanceof Float32Array) FLOAT32_ARRAY_FILL.call(values, 0);
  mesh.instanceMatrix.needsUpdate = true;
}

function recomputeBounds(mesh: InstancedMesh) {
  mesh.computeBoundingBox();
  mesh.computeBoundingSphere();
  if (!mesh.boundingBox || !mesh.boundingSphere
    || !Number.isFinite(mesh.boundingSphere.radius)) {
    throw new Error('Three instanced mesh bounds could not be recomputed');
  }
}
