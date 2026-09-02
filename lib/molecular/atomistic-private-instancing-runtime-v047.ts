import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import {
  assertAtomisticPrivatePositionFrameMetadataV047,
  type AtomisticPrivatePositionFrameHandleV047,
  type AtomisticPrivatePositionFrameMetadataV047,
} from '../simulation/atomistic-private-position-frame-v047.ts';

/** Browser-safe, positions-only instancing core for one sanitized private frame. */

export const ATOMISTIC_PRIVATE_INSTANCING_PLAN_VERSION_V047 =
  'tf.atomistic-private-instancing-plan/0.4.7' as const;
export const ATOMISTIC_PRIVATE_INSTANCING_RUNTIME_VERSION_V047 =
  'tf.atomistic-private-instancing-runtime/0.4.7' as const;
export const ATOMISTIC_PRIVATE_INSTANCING_UPDATE_VERSION_V047 =
  'tf.atomistic-private-instancing-update-receipt/0.4.7' as const;
export const ATOMISTIC_PRIVATE_INSTANCING_SNAPSHOT_VERSION_V047 =
  'tf.atomistic-private-instancing-buffer-snapshot/0.4.7' as const;

const WATER_COUNT = 895;
const PARTICLE_COUNT = 2_685;
const OXYGEN_COUNT = 895;
const HYDROGEN_COUNT = 1_790;
const TOPOLOGY_LINK_COUNT = 1_790;
const POSITION_COMPONENT_COUNT = 8_055;
const POSITION_BYTE_LENGTH = 32_220;
const MATRIX_COMPONENT_COUNT = 16;
const CELL_LENGTH_NANOMETER = 3;
const DIGEST = /^sha256:(?!0{64}$)[0-9a-f]{64}$/;
const PLAN_DATA = new WeakMap<object, RuntimePlanData>();
const UINT8_ARRAY_FILL = Uint8Array.prototype.fill;
const FLOAT32_ARRAY_FILL = Float32Array.prototype.fill;
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype) as object;
const TYPED_ARRAY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  'buffer',
)?.get;
const ARRAY_BUFFER_RESIZABLE_GETTER = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'resizable',
)?.get;

export type AtomisticPrivateElementV047 = 'O' | 'H';

export type AtomisticPrivateInstanceSelectionV047 = Readonly<{
  batchId: 'atom:O' | 'atom:H';
  instanceId: number;
  atomIndex: number;
  atomId: string;
  moleculeId: string;
  element: AtomisticPrivateElementV047;
  atomOrderDigest: string;
  topologyDigest: string;
  mappingSemantics: 'stable-instance-to-authoritative-zero-based-pdb-record-order';
}>;

type AtomBatch = Readonly<{
  batchId: 'atom:O' | 'atom:H';
  element: AtomisticPrivateElementV047;
  instanceCount: 895 | 1_790;
  atomIndicesByInstance: ReadonlyArray<number>;
  displayRadiusNanometer: 0.065 | 0.04;
}>;

type BondBatch = Readonly<{
  batchId: 'bond:water-oh-topology';
  instanceCount: 1_790;
  atomIndexPairsByInstance: ReadonlyArray<readonly [number, number]>;
  energeticInteraction: false;
  semanticRole: 'topology-adjacency-and-rigid-distance-constraint-not-energetic-bond';
}>;

export type AtomisticPrivateInstancingPlanV047 = Readonly<{
  schemaVersion: typeof ATOMISTIC_PRIVATE_INSTANCING_PLAN_VERSION_V047;
  role: 'sanitized-private-single-position-frame-gpu-instancing-plan-no-solver';
  sourceBinding: Readonly<{
    sourceVersion: 'tf.atomistic-private-position-frame/0.4.7';
    sessionId: string;
    sessionDigest: string;
    trajectoryDigest: string;
    frameOrdinal: number;
    frameDigest: string;
    positionsDerivedF32Digest: string;
    atomOrderDigest: string;
    cellDigest: string;
    topologyDigest: string;
    metadataDigest: string;
    executionAuthenticityVerified: false;
    promotionEligible: false;
    publicDistributionEligible: false;
  }>;
  inventory: Readonly<{
    waterMoleculeCount: 895;
    particleCount: 2_685;
    oxygenCount: 895;
    hydrogenCount: 1_790;
    topologyLinkCount: 1_790;
    frameCount: 1;
  }>;
  atomBatches: readonly [AtomBatch, AtomBatch];
  bondBatches: readonly [BondBatch];
  drawCallBudget: Readonly<{
    bodyUpperBound: 3;
    declaredSceneUpperBound: 5;
    hardLimit: 8;
    measurementBoundary: 'static-upper-bound-not-measured-fps-or-runtime-performance';
  }>;
  scientificBoundary: Readonly<{
    renderedPhysicalChannel: 'digest-bound-source-position-f32-presentation-derivative-only';
    topologyLinkMeaning: 'adjacency-and-rigid-constraint-not-energetic-bond-or-bond-order';
    forceLayer: null;
    velocityLayer: null;
    fieldLayer: null;
    electronicDensityLayer: null;
    motionSynthesis: null;
    frameInterpolation: null;
    physicalWorldState: false;
    framesCreatedByThisModule: false;
    publicDistributionEligible: false;
  }>;
}>;

export type AtomisticPrivateInstancingUpdateReceiptV047 = Readonly<{
  schemaVersion: typeof ATOMISTIC_PRIVATE_INSTANCING_UPDATE_VERSION_V047;
  status: 'sanitized-private-positions-projected-into-preallocated-runtime-buffers';
  sourceFrameOrdinal: number;
  sourceFrameDigest: string;
  privateFrameMetadataDigest: string;
  positionsDerivedF32Digest: string;
  atomOrderDigest: string;
  cellDigest: string;
  topologyDigest: string;
  updatedAtomInstanceCount: 2_685;
  updatedTopologyLinkInstanceCount: 1_790;
  atomicUpdate: true;
  physicalWorldState: false;
  createsTrajectoryFrame: false;
  forcesConsumed: false;
  velocitiesConsumed: false;
  fieldsConsumed: false;
  publicDistributionEligible: false;
}>;

export type AtomisticPrivateInstancingSnapshotV047 = Readonly<{
  schemaVersion: typeof ATOMISTIC_PRIVATE_INSTANCING_SNAPSHOT_VERSION_V047;
  ownership: 'fresh-copy-snapshot-mutation-does-not-affect-runtime';
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

type TopologyAtom = Readonly<{
  atomIndex: number;
  atomId: string;
  moleculeId: string;
  element: AtomisticPrivateElementV047;
  anchorOxygenIndex: number;
}>;

type TopologyLink = Readonly<{
  topologyLinkIndex: number;
  atomAIndex: number;
  atomBIndex: number;
}>;

type RuntimePlanData = Readonly<{
  metadata: AtomisticPrivatePositionFrameMetadataV047;
  atoms: ReadonlyArray<TopologyAtom>;
  links: ReadonlyArray<TopologyLink>;
}>;

type RuntimeBuffers = {
  oxygenMatrices: Float32Array;
  hydrogenMatrices: Float32Array;
  topologyLinkMatrices: Float32Array;
  displayPositions: Float32Array;
};

export function createAtomisticPrivateInstancingPlanV047(
  metadataInput: AtomisticPrivatePositionFrameMetadataV047,
): AtomisticPrivateInstancingPlanV047 {
  const metadata = assertAtomisticPrivatePositionFrameMetadataV047(metadataInput);
  const topology = createLockedTip3pTopology();
  const oxygenIndices = Object.freeze(topology.atoms
    .filter((atom) => atom.element === 'O')
    .map((atom) => atom.atomIndex));
  const hydrogenIndices = Object.freeze(topology.atoms
    .filter((atom) => atom.element === 'H')
    .map((atom) => atom.atomIndex));
  const plan: AtomisticPrivateInstancingPlanV047 = Object.freeze({
    schemaVersion: ATOMISTIC_PRIVATE_INSTANCING_PLAN_VERSION_V047,
    role: 'sanitized-private-single-position-frame-gpu-instancing-plan-no-solver',
    sourceBinding: Object.freeze({
      sourceVersion: 'tf.atomistic-private-position-frame/0.4.7' as const,
      sessionId: metadata.binding.sessionId,
      sessionDigest: metadata.binding.sessionDigest,
      trajectoryDigest: metadata.binding.trajectoryDigest,
      frameOrdinal: metadata.binding.frameOrdinal,
      frameDigest: metadata.binding.frameDigest,
      positionsDerivedF32Digest: metadata.binding.positionsDerivedF32Digest,
      atomOrderDigest: metadata.binding.atomOrderDigest,
      cellDigest: metadata.binding.cellDigest,
      topologyDigest: metadata.binding.topologyDigest,
      metadataDigest: metadata.metadataDigest,
      executionAuthenticityVerified: false as const,
      promotionEligible: false as const,
      publicDistributionEligible: false as const,
    }),
    inventory: Object.freeze({
      waterMoleculeCount: 895 as const,
      particleCount: 2_685 as const,
      oxygenCount: 895 as const,
      hydrogenCount: 1_790 as const,
      topologyLinkCount: 1_790 as const,
      frameCount: 1 as const,
    }),
    atomBatches: Object.freeze([
      atomBatch('O', oxygenIndices),
      atomBatch('H', hydrogenIndices),
    ] as const),
    bondBatches: Object.freeze([Object.freeze({
      batchId: 'bond:water-oh-topology' as const,
      instanceCount: 1_790 as const,
      atomIndexPairsByInstance: Object.freeze(topology.links.map((link) => Object.freeze([
        link.atomAIndex,
        link.atomBIndex,
      ] as const))),
      energeticInteraction: false as const,
      semanticRole:
        'topology-adjacency-and-rigid-distance-constraint-not-energetic-bond' as const,
    })] as const),
    drawCallBudget: Object.freeze({
      bodyUpperBound: 3 as const,
      declaredSceneUpperBound: 5 as const,
      hardLimit: 8 as const,
      measurementBoundary: 'static-upper-bound-not-measured-fps-or-runtime-performance' as const,
    }),
    scientificBoundary: Object.freeze({
      renderedPhysicalChannel:
        'digest-bound-source-position-f32-presentation-derivative-only' as const,
      topologyLinkMeaning:
        'adjacency-and-rigid-constraint-not-energetic-bond-or-bond-order' as const,
      forceLayer: null,
      velocityLayer: null,
      fieldLayer: null,
      electronicDensityLayer: null,
      motionSynthesis: null,
      frameInterpolation: null,
      physicalWorldState: false as const,
      framesCreatedByThisModule: false as const,
      publicDistributionEligible: false as const,
    }),
  });
  PLAN_DATA.set(plan, Object.freeze({
    metadata,
    atoms: topology.atoms,
    links: topology.links,
  }));
  return plan;
}

export class AtomisticPrivateInstancingRuntimeV047 {
  readonly schemaVersion = ATOMISTIC_PRIVATE_INSTANCING_RUNTIME_VERSION_V047;
  readonly plan: AtomisticPrivateInstancingPlanV047;
  #data: RuntimePlanData;
  #buffers: RuntimeBuffers;
  #sourceFrameOrdinal: number | null = null;
  #sourceFrameDigest: string | null = null;
  #metadataDigest: string | null = null;
  #positionsDigest: string | null = null;
  #disposed = false;

  constructor(plan: AtomisticPrivateInstancingPlanV047) {
    this.#data = requirePlanData(plan);
    this.plan = plan;
    this.#buffers = {
      oxygenMatrices: new Float32Array(OXYGEN_COUNT * MATRIX_COMPONENT_COUNT),
      hydrogenMatrices: new Float32Array(HYDROGEN_COUNT * MATRIX_COMPONENT_COUNT),
      topologyLinkMatrices: new Float32Array(TOPOLOGY_LINK_COUNT * MATRIX_COMPONENT_COUNT),
      displayPositions: new Float32Array(POSITION_COMPONENT_COUNT),
    };
  }

  updatePrivatePositionFrameV047(
    handle: AtomisticPrivatePositionFrameHandleV047,
  ): AtomisticPrivateInstancingUpdateReceiptV047 {
    this.#assertActive();
    assertHandleShape(handle);
    if (handle.isRevoked()) throw new Error('private position frame handle is revoked');
    const metadata = assertAtomisticPrivatePositionFrameMetadataV047(handle.metadata);
    if (metadata.metadataDigest !== this.plan.sourceBinding.metadataDigest
      || metadata.binding.sessionDigest !== this.plan.sourceBinding.sessionDigest
      || metadata.binding.trajectoryDigest !== this.plan.sourceBinding.trajectoryDigest
      || metadata.binding.frameOrdinal !== this.plan.sourceBinding.frameOrdinal
      || metadata.binding.frameDigest !== this.plan.sourceBinding.frameDigest
      || metadata.binding.atomOrderDigest !== this.plan.sourceBinding.atomOrderDigest
      || metadata.binding.cellDigest !== this.plan.sourceBinding.cellDigest
      || metadata.binding.topologyDigest !== this.plan.sourceBinding.topologyDigest
      || metadata.binding.positionsDerivedF32Digest
        !== this.plan.sourceBinding.positionsDerivedF32Digest) {
      throw new Error('private position frame is not bound to this browser instancing plan');
    }

    const issuedBytes = handle.copyPositionBytes();
    let derivedDigest: string;
    try {
      derivedDigest = projectPositionBytes(
        issuedBytes,
        this.plan.sourceBinding.positionsDerivedF32Digest,
        this.plan,
        this.#data,
        this.#buffers,
      );
    } finally {
      if (issuedBytes instanceof Uint8Array) UINT8_ARRAY_FILL.call(issuedBytes, 0);
    }
    this.#sourceFrameOrdinal = metadata.binding.frameOrdinal;
    this.#sourceFrameDigest = metadata.binding.frameDigest;
    this.#metadataDigest = metadata.metadataDigest;
    this.#positionsDigest = derivedDigest;

    return Object.freeze({
      schemaVersion: ATOMISTIC_PRIVATE_INSTANCING_UPDATE_VERSION_V047,
      status: 'sanitized-private-positions-projected-into-preallocated-runtime-buffers' as const,
      sourceFrameOrdinal: metadata.binding.frameOrdinal,
      sourceFrameDigest: metadata.binding.frameDigest,
      privateFrameMetadataDigest: metadata.metadataDigest,
      positionsDerivedF32Digest: derivedDigest,
      atomOrderDigest: metadata.binding.atomOrderDigest,
      cellDigest: metadata.binding.cellDigest,
      topologyDigest: metadata.binding.topologyDigest,
      updatedAtomInstanceCount: 2_685 as const,
      updatedTopologyLinkInstanceCount: 1_790 as const,
      atomicUpdate: true as const,
      physicalWorldState: false as const,
      createsTrajectoryFrame: false as const,
      forcesConsumed: false as const,
      velocitiesConsumed: false as const,
      fieldsConsumed: false as const,
      publicDistributionEligible: false as const,
    });
  }

  snapshot(): AtomisticPrivateInstancingSnapshotV047 {
    this.#assertActive();
    return Object.freeze({
      schemaVersion: ATOMISTIC_PRIVATE_INSTANCING_SNAPSHOT_VERSION_V047,
      ownership: 'fresh-copy-snapshot-mutation-does-not-affect-runtime' as const,
      sourceFrameOrdinal: this.#sourceFrameOrdinal,
      sourceFrameDigest: this.#sourceFrameDigest,
      presentationFrameDigest: this.#metadataDigest,
      positionsDerivedF32Digest: this.#positionsDigest,
      atomOrderDigest: this.plan.sourceBinding.atomOrderDigest,
      topologyDigest: this.plan.sourceBinding.topologyDigest,
      publicDistributionEligible: false as const,
      atomMatricesByBatch: Object.freeze([
        Object.freeze({
          batchId: 'atom:O' as const,
          matrices: this.#buffers.oxygenMatrices.slice(),
        }),
        Object.freeze({
          batchId: 'atom:H' as const,
          matrices: this.#buffers.hydrogenMatrices.slice(),
        }),
      ] as const),
      topologyBondMatrices: this.#buffers.topologyLinkMatrices.slice(),
      displayPositionsNanometerByAtomIndex: this.#buffers.displayPositions.slice(),
    });
  }

  resolveAtomInstanceSelection(
    batchId: 'atom:O' | 'atom:H',
    instanceId: number,
  ): AtomisticPrivateInstanceSelectionV047 {
    this.#assertActive();
    const batch = this.plan.atomBatches.find((candidate) => candidate.batchId === batchId);
    if (!batch || !Number.isSafeInteger(instanceId) || instanceId < 0
      || instanceId >= batch.instanceCount) {
      throw new Error('atom instance selection is outside the declared batch');
    }
    const atomIndex = batch.atomIndicesByInstance[instanceId];
    const atom = this.#data.atoms[atomIndex];
    if (!atom || atom.element !== batch.element) throw new Error('atom instance mapping is invalid');
    return Object.freeze({
      batchId,
      instanceId,
      atomIndex,
      atomId: atom.atomId,
      moleculeId: atom.moleculeId,
      element: atom.element,
      atomOrderDigest: this.plan.sourceBinding.atomOrderDigest,
      topologyDigest: this.plan.sourceBinding.topologyDigest,
      mappingSemantics: 'stable-instance-to-authoritative-zero-based-pdb-record-order' as const,
    });
  }

  get disposed() {
    return this.#disposed;
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    FLOAT32_ARRAY_FILL.call(this.#buffers.oxygenMatrices, 0);
    FLOAT32_ARRAY_FILL.call(this.#buffers.hydrogenMatrices, 0);
    FLOAT32_ARRAY_FILL.call(this.#buffers.topologyLinkMatrices, 0);
    FLOAT32_ARRAY_FILL.call(this.#buffers.displayPositions, 0);
    this.#sourceFrameOrdinal = null;
    this.#sourceFrameDigest = null;
    this.#metadataDigest = null;
    this.#positionsDigest = null;
  }

  #assertActive() {
    if (this.#disposed) throw new Error('private atomistic instancing runtime is disposed');
  }
}

function atomBatch(
  element: AtomisticPrivateElementV047,
  atomIndicesByInstance: ReadonlyArray<number>,
): AtomBatch {
  return Object.freeze({
    batchId: `atom:${element}` as 'atom:O' | 'atom:H',
    element,
    instanceCount: (element === 'O' ? OXYGEN_COUNT : HYDROGEN_COUNT) as 895 | 1_790,
    atomIndicesByInstance,
    displayRadiusNanometer: (element === 'O' ? 0.065 : 0.04) as 0.065 | 0.04,
  });
}

function createLockedTip3pTopology() {
  const atoms: TopologyAtom[] = [];
  const links: TopologyLink[] = [];
  for (let water = 0; water < WATER_COUNT; water += 1) {
    const oxygen = water * 3;
    const moleculeId = `tip3p-water-${water}`;
    atoms.push(
      Object.freeze({ atomIndex: oxygen, atomId: `${moleculeId}:O`, moleculeId,
        element: 'O', anchorOxygenIndex: oxygen }),
      Object.freeze({ atomIndex: oxygen + 1, atomId: `${moleculeId}:H1`, moleculeId,
        element: 'H', anchorOxygenIndex: oxygen }),
      Object.freeze({ atomIndex: oxygen + 2, atomId: `${moleculeId}:H2`, moleculeId,
        element: 'H', anchorOxygenIndex: oxygen }),
    );
    links.push(
      Object.freeze({ topologyLinkIndex: water * 2, atomAIndex: oxygen,
        atomBIndex: oxygen + 1 }),
      Object.freeze({ topologyLinkIndex: water * 2 + 1, atomAIndex: oxygen,
        atomBIndex: oxygen + 2 }),
    );
  }
  if (atoms.length !== PARTICLE_COUNT || links.length !== TOPOLOGY_LINK_COUNT) {
    throw new Error('locked TIP3P browser topology construction failed');
  }
  return Object.freeze({ atoms: Object.freeze(atoms), links: Object.freeze(links) });
}

function requirePlanData(plan: AtomisticPrivateInstancingPlanV047) {
  if (!plan || typeof plan !== 'object'
    || plan.schemaVersion !== ATOMISTIC_PRIVATE_INSTANCING_PLAN_VERSION_V047) {
    throw new Error('private atomistic instancing plan is invalid');
  }
  const data = PLAN_DATA.get(plan);
  if (!data) throw new Error('private atomistic instancing plan lacks factory identity');
  return data;
}

function assertHandleShape(handle: AtomisticPrivatePositionFrameHandleV047) {
  if (!handle || typeof handle !== 'object'
    || typeof handle.copyPositionBytes !== 'function'
    || typeof handle.isRevoked !== 'function') {
    throw new Error('private instancing update requires a position frame handle');
  }
}

function projectPositionBytes(
  input: Uint8Array,
  expectedDigest: string,
  plan: AtomisticPrivateInstancingPlanV047,
  data: RuntimePlanData,
  buffers: RuntimeBuffers,
) {
  const bytes = copyFixedBytes(input);
  let positions: Float32Array | null = null;
  try {
    const digest = digestBytes(bytes);
    if (digest !== expectedDigest) throw new Error('private position digest changed');
    positions = decodeFinitePositions(bytes);
    preflightProjection(data, positions);
    writeProjection(plan, data, positions, buffers);
    return digest;
  } finally {
    UINT8_ARRAY_FILL.call(bytes, 0);
    if (positions !== null) FLOAT32_ARRAY_FILL.call(positions, 0);
  }
}

function copyFixedBytes(value: Uint8Array) {
  if (!(value instanceof Uint8Array)
    || Object.getPrototypeOf(value) !== Uint8Array.prototype
    || value.byteLength !== POSITION_BYTE_LENGTH) {
    throw new Error('private positions require one intrinsic 32,220-byte Uint8Array');
  }
  let buffer: unknown;
  let resizable = false;
  try {
    buffer = TYPED_ARRAY_BUFFER_GETTER?.call(value);
    resizable = ARRAY_BUFFER_RESIZABLE_GETTER?.call(buffer) === true;
  } catch {
    throw new Error('private position bytes lack stable ArrayBuffer ownership');
  }
  if (!(buffer instanceof ArrayBuffer)
    || Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype
    || resizable) {
    throw new Error('private position bytes reject shared or resizable buffers');
  }
  return Uint8Array.prototype.slice.call(value) as Uint8Array;
}

function decodeFinitePositions(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const positions = new Float32Array(POSITION_COMPONENT_COUNT);
  try {
    for (let index = 0; index < positions.length; index += 1) {
      const value = view.getFloat32(index * 4, true);
      if (!Number.isFinite(value) || Object.is(value, -0)) {
        throw new Error(`private position component ${index} is invalid`);
      }
      positions[index] = value;
    }
    return positions;
  } catch (error) {
    FLOAT32_ARRAY_FILL.call(positions, 0);
    throw error;
  }
}

function preflightProjection(data: RuntimePlanData, positions: Float32Array) {
  for (const atom of data.atoms) {
    const [x, y, z] = projectedPosition(atom, positions);
    assertFiniteF32(x);
    assertFiniteF32(y);
    assertFiniteF32(z);
  }
  for (const link of data.links) {
    const [ax, ay, az] = projectedPosition(data.atoms[link.atomAIndex], positions);
    const [bx, by, bz] = projectedPosition(data.atoms[link.atomBIndex], positions);
    const length = Math.hypot(bx - ax, by - ay, bz - az);
    if (!Number.isFinite(length) || length <= Number.EPSILON) {
      throw new Error(`topology link ${link.topologyLinkIndex} has invalid displayed length`);
    }
    assertFiniteF32(length);
  }
}

function projectedPosition(
  atom: TopologyAtom,
  positions: Float32Array,
): readonly [number, number, number] {
  const offset = atom.atomIndex * 3;
  if (atom.atomIndex === atom.anchorOxygenIndex) {
    return [positions[offset], positions[offset + 1], positions[offset + 2]];
  }
  const anchor = atom.anchorOxygenIndex * 3;
  const ox = positions[anchor];
  const oy = positions[anchor + 1];
  const oz = positions[anchor + 2];
  return [
    ox + minimumImage(positions[offset] - ox),
    oy + minimumImage(positions[offset + 1] - oy),
    oz + minimumImage(positions[offset + 2] - oz),
  ];
}

function minimumImage(delta: number) {
  return delta - CELL_LENGTH_NANOMETER * Math.round(delta / CELL_LENGTH_NANOMETER);
}

function writeProjection(
  plan: AtomisticPrivateInstancingPlanV047,
  data: RuntimePlanData,
  positions: Float32Array,
  buffers: RuntimeBuffers,
) {
  for (const atom of data.atoms) {
    const [x, y, z] = projectedPosition(atom, positions);
    const offset = atom.atomIndex * 3;
    buffers.displayPositions[offset] = x;
    buffers.displayPositions[offset + 1] = y;
    buffers.displayPositions[offset + 2] = z;
  }
  for (const batch of plan.atomBatches) {
    const target = batch.element === 'O'
      ? buffers.oxygenMatrices
      : buffers.hydrogenMatrices;
    for (let instance = 0; instance < batch.instanceCount; instance += 1) {
      const atomOffset = batch.atomIndicesByInstance[instance] * 3;
      writeAtomMatrix(
        target,
        instance * MATRIX_COMPONENT_COUNT,
        batch.displayRadiusNanometer,
        buffers.displayPositions[atomOffset],
        buffers.displayPositions[atomOffset + 1],
        buffers.displayPositions[atomOffset + 2],
      );
    }
  }
  for (const link of data.links) {
    const a = link.atomAIndex * 3;
    const b = link.atomBIndex * 3;
    writeLinkMatrix(
      buffers.topologyLinkMatrices,
      link.topologyLinkIndex * MATRIX_COMPONENT_COUNT,
      buffers.displayPositions[a],
      buffers.displayPositions[a + 1],
      buffers.displayPositions[a + 2],
      buffers.displayPositions[b],
      buffers.displayPositions[b + 1],
      buffers.displayPositions[b + 2],
    );
  }
}

function writeAtomMatrix(
  target: Float32Array,
  offset: number,
  scale: number,
  x: number,
  y: number,
  z: number,
) {
  target[offset] = scale;
  target[offset + 1] = 0;
  target[offset + 2] = 0;
  target[offset + 3] = 0;
  target[offset + 4] = 0;
  target[offset + 5] = scale;
  target[offset + 6] = 0;
  target[offset + 7] = 0;
  target[offset + 8] = 0;
  target[offset + 9] = 0;
  target[offset + 10] = scale;
  target[offset + 11] = 0;
  target[offset + 12] = x;
  target[offset + 13] = y;
  target[offset + 14] = z;
  target[offset + 15] = 1;
}

function writeLinkMatrix(
  target: Float32Array,
  offset: number,
  ax: number,
  ay: number,
  az: number,
  bx: number,
  by: number,
  bz: number,
) {
  const dx = bx - ax; const dy = by - ay; const dz = bz - az;
  const length = Math.hypot(dx, dy, dz);
  const ux = dx / length; const uy = dy / length; const uz = dz / length;
  const rx = Math.abs(uy) < 0.9 ? 0 : 1;
  const ry = Math.abs(uy) < 0.9 ? 1 : 0;
  const cx = ry * uz; const cy = -rx * uz; const cz = rx * uy - ry * ux;
  const crossLength = Math.hypot(cx, cy, cz);
  const xx = cx / crossLength; const xy = cy / crossLength; const xz = cz / crossLength;
  const zx = uy * xz - uz * xy;
  const zy = uz * xx - ux * xz;
  const zz = ux * xy - uy * xx;
  const radius = 0.012;
  target[offset] = xx * radius;
  target[offset + 1] = xy * radius;
  target[offset + 2] = xz * radius;
  target[offset + 3] = 0;
  target[offset + 4] = ux * length;
  target[offset + 5] = uy * length;
  target[offset + 6] = uz * length;
  target[offset + 7] = 0;
  target[offset + 8] = zx * radius;
  target[offset + 9] = zy * radius;
  target[offset + 10] = zz * radius;
  target[offset + 11] = 0;
  target[offset + 12] = (ax + bx) / 2;
  target[offset + 13] = (ay + by) / 2;
  target[offset + 14] = (az + bz) / 2;
  target[offset + 15] = 1;
}

function assertFiniteF32(value: number) {
  if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value))) {
    throw new Error('projected position is not representable as finite float32');
  }
}

function digestBytes(bytes: Uint8Array) {
  const digest = `sha256:${bytesToHex(sha256(bytes))}`;
  if (!DIGEST.test(digest)) throw new Error('private position digest is invalid');
  return digest;
}
