import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import {
  assertAtomisticPrivateBrowserPositionTrajectoryMetadataV049,
  type AtomisticPrivateBrowserPositionTrajectoryFrameHandleV049,
  type AtomisticPrivateBrowserPositionTrajectoryMetadataV049,
} from '../simulation/atomistic-private-browser-position-trajectory-v049.ts';

/** Browser-safe, positions-only instancing core for the sanitized V049 trajectory. */

export const ATOMISTIC_PRIVATE_BROWSER_TRAJECTORY_INSTANCING_PLAN_VERSION_V049 =
  'tf.atomistic-private-browser-trajectory-instancing-plan/0.4.9' as const;
export const ATOMISTIC_PRIVATE_BROWSER_TRAJECTORY_INSTANCING_RUNTIME_VERSION_V049 =
  'tf.atomistic-private-browser-trajectory-instancing-runtime/0.4.9' as const;
export const ATOMISTIC_PRIVATE_BROWSER_TRAJECTORY_INSTANCING_UPDATE_VERSION_V049 =
  'tf.atomistic-private-browser-trajectory-instancing-update/0.4.9' as const;
export const ATOMISTIC_PRIVATE_BROWSER_TRAJECTORY_INSTANCING_SNAPSHOT_VERSION_V049 =
  'tf.atomistic-private-browser-trajectory-instancing-snapshot/0.4.9' as const;

const WATER_COUNT = 895;
const OXYGEN_COUNT = 895;
const HYDROGEN_COUNT = 1_790;
const TOPOLOGY_LINK_COUNT = 1_790;
const COMPONENT_COUNT = 8_055;
const FRAME_BYTE_LENGTH = 32_220;
const MATRIX_COMPONENT_COUNT = 16;
const CELL_LENGTH_NANOMETER = 3;
const PLAN_DATA = new WeakMap<object, RuntimePlanData>();
const UINT8_ARRAY_FILL = Uint8Array.prototype.fill;
const UINT8_ARRAY_SLICE = Uint8Array.prototype.slice;
const FLOAT32_ARRAY_FILL = Float32Array.prototype.fill;
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype) as object;
const TYPED_ARRAY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  'buffer',
)?.get;
const TYPED_ARRAY_BYTE_LENGTH_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  'byteLength',
)?.get;
const ARRAY_BUFFER_RESIZABLE_GETTER = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'resizable',
)?.get;

type AtomElement = 'O' | 'H';
type AtomRecord = Readonly<{
  atomIndex: number;
  atomId: string;
  moleculeId: string;
  element: AtomElement;
  anchorOxygenIndex: number;
}>;
type LinkRecord = Readonly<{
  topologyLinkIndex: number;
  atomAIndex: number;
  atomBIndex: number;
}>;
type RuntimePlanData = Readonly<{
  metadata: AtomisticPrivateBrowserPositionTrajectoryMetadataV049;
  atoms: ReadonlyArray<AtomRecord>;
  links: ReadonlyArray<LinkRecord>;
}>;
type RuntimeBuffers = {
  oxygenMatrices: Float32Array;
  hydrogenMatrices: Float32Array;
  topologyLinkMatrices: Float32Array;
  displayPositions: Float32Array;
};

export type AtomisticPrivateBrowserTrajectoryInstancingPlanV049 = Readonly<{
  schemaVersion: typeof ATOMISTIC_PRIVATE_BROWSER_TRAJECTORY_INSTANCING_PLAN_VERSION_V049;
  role: 'sanitized-private-discrete-position-trajectory-gpu-instancing-plan-no-solver';
  sourceBinding: Readonly<{
    sourceVersion: 'tf.atomistic-private-browser-position-trajectory/0.4.9';
    trajectoryMetadataDigest: string;
    sourceTrajectoryMetadataDigest: string;
    sessionDigest: string;
    trajectoryDigest: string;
    orderedPositionFrameDigest: string;
    atomOrderDigest: string;
    cellDigest: string;
    topologyDigest: string;
    allowedPositionFrameDigests: ReadonlyArray<string>;
    executionAuthenticityVerified: false;
    publicDistributionEligible: false;
  }>;
  inventory: Readonly<{
    waterMoleculeCount: 895;
    particleCount: 2_685;
    oxygenCount: 895;
    hydrogenCount: 1_790;
    topologyLinkCount: 1_790;
    frameCount: 101;
  }>;
  atomBatches: readonly [
    Readonly<{
      batchId: 'atom:O';
      element: 'O';
      instanceCount: 895;
      atomIndicesByInstance: ReadonlyArray<number>;
      displayRadiusNanometer: 0.065;
    }>,
    Readonly<{
      batchId: 'atom:H';
      element: 'H';
      instanceCount: 1_790;
      atomIndicesByInstance: ReadonlyArray<number>;
      displayRadiusNanometer: 0.04;
    }>,
  ];
  drawCallBudget: Readonly<{
    bodyUpperBound: 3;
    declaredSceneUpperBound: 5;
    hardLimit: 8;
    measurementBoundary: 'static-upper-bound-not-measured-browser-performance';
  }>;
  scientificBoundary: Readonly<{
    renderedChannel: 'digest-bound-sanitized-position-f32-derivative-only';
    topologyLinksEnergetic: false;
    forceLayer: null;
    velocityLayer: null;
    fieldLayer: null;
    electronicDensityLayer: null;
    interpolation: null;
    createsSolverFrames: false;
    completePhysicalStateIncluded: false;
    publicDistributionEligible: false;
  }>;
}>;

export type AtomisticPrivateBrowserTrajectoryInstancingUpdateV049 = Readonly<{
  schemaVersion: typeof ATOMISTIC_PRIVATE_BROWSER_TRAJECTORY_INSTANCING_UPDATE_VERSION_V049;
  status: 'sanitized-private-position-frame-projected-atomically';
  previousSourceFrameOrdinal: number | null;
  sourceFrameOrdinal: number;
  sourceFrameDigest: string;
  positionFrameDigest: string;
  positionsDerivedF32Digest: string;
  atomOrderDigest: string;
  cellDigest: string;
  topologyDigest: string;
  updatedAtomInstanceCount: 2_685;
  updatedTopologyLinkInstanceCount: 1_790;
  preallocatedCpuBuffersReused: true;
  atomicUpdate: true;
  sourceFrameAdvanced: boolean;
  sameSourceStateRepeated: boolean;
  createsSolverFrame: false;
  interpolationApplied: false;
  forceConsumed: false;
  velocityConsumed: false;
  completePhysicalStateIncluded: false;
  publicDistributionEligible: false;
}>;

export type AtomisticPrivateBrowserTrajectoryInstanceSelectionV049 = Readonly<{
  batchId: 'atom:O' | 'atom:H';
  instanceId: number;
  atomIndex: number;
  atomId: string;
  moleculeId: string;
  element: AtomElement;
  atomOrderDigest: string;
  topologyDigest: string;
  mappingSemantics: 'stable-instance-to-authoritative-zero-based-pdb-record-order';
}>;

export function createAtomisticPrivateBrowserTrajectoryInstancingPlanV049(
  metadataInput: AtomisticPrivateBrowserPositionTrajectoryMetadataV049,
): AtomisticPrivateBrowserTrajectoryInstancingPlanV049 {
  const metadata = assertAtomisticPrivateBrowserPositionTrajectoryMetadataV049(metadataInput);
  const topology = createTopology();
  const oxygenIndices = Object.freeze(topology.atoms
    .filter((atom) => atom.element === 'O').map((atom) => atom.atomIndex));
  const hydrogenIndices = Object.freeze(topology.atoms
    .filter((atom) => atom.element === 'H').map((atom) => atom.atomIndex));
  const plan = Object.freeze({
    schemaVersion: ATOMISTIC_PRIVATE_BROWSER_TRAJECTORY_INSTANCING_PLAN_VERSION_V049,
    role: 'sanitized-private-discrete-position-trajectory-gpu-instancing-plan-no-solver' as const,
    sourceBinding: Object.freeze({
      sourceVersion: 'tf.atomistic-private-browser-position-trajectory/0.4.9' as const,
      trajectoryMetadataDigest: metadata.metadataDigest,
      sourceTrajectoryMetadataDigest: metadata.binding.sourceTrajectoryMetadataDigest,
      sessionDigest: metadata.binding.sessionDigest,
      trajectoryDigest: metadata.binding.trajectoryDigest,
      orderedPositionFrameDigest: metadata.sequence.orderedPositionFrameDigest,
      atomOrderDigest: metadata.binding.atomOrderDigest,
      cellDigest: metadata.binding.cellDigest,
      topologyDigest: metadata.binding.topologyDigest,
      allowedPositionFrameDigests: Object.freeze(
        metadata.sequence.frames.map((frame) => frame.positionFrameDigest),
      ),
      executionAuthenticityVerified: false as const,
      publicDistributionEligible: false as const,
    }),
    inventory: Object.freeze({
      waterMoleculeCount: 895 as const,
      particleCount: 2_685 as const,
      oxygenCount: 895 as const,
      hydrogenCount: 1_790 as const,
      topologyLinkCount: 1_790 as const,
      frameCount: 101 as const,
    }),
    atomBatches: Object.freeze([
      Object.freeze({
        batchId: 'atom:O' as const,
        element: 'O' as const,
        instanceCount: 895 as const,
        atomIndicesByInstance: oxygenIndices,
        displayRadiusNanometer: 0.065 as const,
      }),
      Object.freeze({
        batchId: 'atom:H' as const,
        element: 'H' as const,
        instanceCount: 1_790 as const,
        atomIndicesByInstance: hydrogenIndices,
        displayRadiusNanometer: 0.04 as const,
      }),
    ] as const),
    drawCallBudget: Object.freeze({
      bodyUpperBound: 3 as const,
      declaredSceneUpperBound: 5 as const,
      hardLimit: 8 as const,
      measurementBoundary: 'static-upper-bound-not-measured-browser-performance' as const,
    }),
    scientificBoundary: Object.freeze({
      renderedChannel: 'digest-bound-sanitized-position-f32-derivative-only' as const,
      topologyLinksEnergetic: false as const,
      forceLayer: null,
      velocityLayer: null,
      fieldLayer: null,
      electronicDensityLayer: null,
      interpolation: null,
      createsSolverFrames: false as const,
      completePhysicalStateIncluded: false as const,
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

export class AtomisticPrivateBrowserTrajectoryInstancingRuntimeV049 {
  readonly schemaVersion = ATOMISTIC_PRIVATE_BROWSER_TRAJECTORY_INSTANCING_RUNTIME_VERSION_V049;
  readonly plan: AtomisticPrivateBrowserTrajectoryInstancingPlanV049;
  #data: RuntimePlanData;
  #current = allocateBuffers();
  #staging = allocateBuffers();
  #sourceFrameOrdinal: number | null = null;
  #sourceFrameDigest: string | null = null;
  #positionFrameDigest: string | null = null;
  #positionsDigest: string | null = null;
  #disposed = false;

  constructor(plan: AtomisticPrivateBrowserTrajectoryInstancingPlanV049) {
    const data = PLAN_DATA.get(plan);
    if (!data) {
      throw new Error('private browser trajectory instancing plan lacks factory identity');
    }
    this.plan = plan;
    this.#data = data;
  }

  updatePrivatePositionFrameV049(
    handle: AtomisticPrivateBrowserPositionTrajectoryFrameHandleV049,
  ): AtomisticPrivateBrowserTrajectoryInstancingUpdateV049 {
    this.#assertActive();
    if (!handle || typeof handle !== 'object'
      || typeof handle.copyPositionBytes !== 'function'
      || typeof handle.isRevoked !== 'function'
      || handle.isRevoked()) {
      throw new Error('private browser trajectory instancing requires one active frame handle');
    }
    const frame = handle.frame;
    const expected = this.#data.metadata.sequence.frames[frame?.frameOrdinal];
    if (!expected
      || handle.trajectoryMetadataDigest !== this.plan.sourceBinding.trajectoryMetadataDigest
      || handle.binding.sourceTrajectoryMetadataDigest
        !== this.plan.sourceBinding.sourceTrajectoryMetadataDigest
      || handle.binding.sessionDigest !== this.plan.sourceBinding.sessionDigest
      || handle.binding.trajectoryDigest !== this.plan.sourceBinding.trajectoryDigest
      || handle.binding.atomOrderDigest !== this.plan.sourceBinding.atomOrderDigest
      || handle.binding.cellDigest !== this.plan.sourceBinding.cellDigest
      || handle.binding.topologyDigest !== this.plan.sourceBinding.topologyDigest
      || frame.frameOrdinal !== expected.frameOrdinal
      || frame.step !== expected.step
      || frame.timePicoseconds !== expected.timePicoseconds
      || frame.byteOffset !== expected.byteOffset
      || frame.byteLength !== expected.byteLength
      || frame.sourceFrameDigest !== expected.sourceFrameDigest
      || frame.positionsDerivedF32Digest !== expected.positionsDerivedF32Digest
      || frame.positionFrameDigest !== expected.positionFrameDigest) {
      throw new Error('private browser trajectory frame is not bound to this instancing plan');
    }

    const issuedBytes = handle.copyPositionBytes();
    let bytes: Uint8Array | null = null;
    let positions: Float32Array | null = null;
    try {
      bytes = copyFixedPositionBytes(issuedBytes);
      if (digestBytes(bytes) !== expected.positionsDerivedF32Digest) {
        throw new Error('private browser trajectory frame bytes changed');
      }
      positions = decodePositions(bytes);
      projectInto(this.#data, positions, this.#staging);
      assertFiniteBuffers(this.#staging);
      copyBuffers(this.#staging, this.#current);
    } finally {
      bestEffortZeroBytes(issuedBytes);
      if (bytes !== null) UINT8_ARRAY_FILL.call(bytes, 0);
      if (positions !== null) FLOAT32_ARRAY_FILL.call(positions, 0);
      zeroBuffers(this.#staging);
    }

    const previousSourceFrameOrdinal = this.#sourceFrameOrdinal;
    const sameSourceStateRepeated = previousSourceFrameOrdinal === expected.frameOrdinal
      && this.#positionFrameDigest === expected.positionFrameDigest;
    const sourceFrameAdvanced = previousSourceFrameOrdinal !== null
      && expected.frameOrdinal > previousSourceFrameOrdinal;
    this.#sourceFrameOrdinal = expected.frameOrdinal;
    this.#sourceFrameDigest = expected.sourceFrameDigest;
    this.#positionFrameDigest = expected.positionFrameDigest;
    this.#positionsDigest = expected.positionsDerivedF32Digest;
    return Object.freeze({
      schemaVersion: ATOMISTIC_PRIVATE_BROWSER_TRAJECTORY_INSTANCING_UPDATE_VERSION_V049,
      status: 'sanitized-private-position-frame-projected-atomically' as const,
      previousSourceFrameOrdinal,
      sourceFrameOrdinal: expected.frameOrdinal,
      sourceFrameDigest: expected.sourceFrameDigest,
      positionFrameDigest: expected.positionFrameDigest,
      positionsDerivedF32Digest: expected.positionsDerivedF32Digest,
      atomOrderDigest: this.plan.sourceBinding.atomOrderDigest,
      cellDigest: this.plan.sourceBinding.cellDigest,
      topologyDigest: this.plan.sourceBinding.topologyDigest,
      updatedAtomInstanceCount: 2_685 as const,
      updatedTopologyLinkInstanceCount: 1_790 as const,
      preallocatedCpuBuffersReused: true as const,
      atomicUpdate: true as const,
      sourceFrameAdvanced,
      sameSourceStateRepeated,
      createsSolverFrame: false as const,
      interpolationApplied: false as const,
      forceConsumed: false as const,
      velocityConsumed: false as const,
      completePhysicalStateIncluded: false as const,
      publicDistributionEligible: false as const,
    });
  }

  snapshot() {
    this.#assertActive();
    return Object.freeze({
      schemaVersion: ATOMISTIC_PRIVATE_BROWSER_TRAJECTORY_INSTANCING_SNAPSHOT_VERSION_V049,
      ownership: 'fresh-copy-snapshot-mutation-does-not-affect-runtime' as const,
      sourceFrameOrdinal: this.#sourceFrameOrdinal,
      sourceFrameDigest: this.#sourceFrameDigest,
      presentationFrameDigest: this.#positionFrameDigest,
      positionsDerivedF32Digest: this.#positionsDigest,
      atomOrderDigest: this.plan.sourceBinding.atomOrderDigest,
      topologyDigest: this.plan.sourceBinding.topologyDigest,
      publicDistributionEligible: false as const,
      atomMatricesByBatch: Object.freeze([
        Object.freeze({
          batchId: 'atom:O' as const,
          matrices: this.#current.oxygenMatrices.slice(),
        }),
        Object.freeze({
          batchId: 'atom:H' as const,
          matrices: this.#current.hydrogenMatrices.slice(),
        }),
      ] as const),
      topologyBondMatrices: this.#current.topologyLinkMatrices.slice(),
      displayPositionsNanometerByAtomIndex: this.#current.displayPositions.slice(),
    });
  }

  resolveAtomInstanceSelection(
    batchId: 'atom:O' | 'atom:H',
    instanceId: number,
  ): AtomisticPrivateBrowserTrajectoryInstanceSelectionV049 {
    this.#assertActive();
    const batch = this.plan.atomBatches.find((candidate) => candidate.batchId === batchId);
    if (!batch || !Number.isSafeInteger(instanceId) || Object.is(instanceId, -0)
      || instanceId < 0 || instanceId >= batch.instanceCount) {
      throw new Error('private browser trajectory atom selection is outside its batch');
    }
    const atom = this.#data.atoms[batch.atomIndicesByInstance[instanceId]];
    if (!atom || atom.element !== batch.element) {
      throw new Error('private browser trajectory atom selection mapping changed');
    }
    return Object.freeze({
      batchId,
      instanceId,
      atomIndex: atom.atomIndex,
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
    zeroBuffers(this.#current);
    zeroBuffers(this.#staging);
    this.#sourceFrameOrdinal = null;
    this.#sourceFrameDigest = null;
    this.#positionFrameDigest = null;
    this.#positionsDigest = null;
  }

  #assertActive() {
    if (this.#disposed) {
      throw new Error('private browser trajectory instancing runtime is disposed');
    }
  }
}

function copyFixedPositionBytes(value: unknown) {
  if (!(value instanceof Uint8Array) || Object.getPrototypeOf(value) !== Uint8Array.prototype) {
    throw new Error('private browser trajectory positions require one intrinsic Uint8Array');
  }
  let buffer: unknown;
  let byteLength: unknown;
  let resizable = false;
  try {
    buffer = TYPED_ARRAY_BUFFER_GETTER?.call(value);
    byteLength = TYPED_ARRAY_BYTE_LENGTH_GETTER?.call(value);
    if (buffer instanceof ArrayBuffer) {
      resizable = ARRAY_BUFFER_RESIZABLE_GETTER?.call(buffer) === true;
    }
  } catch {
    throw new Error('private browser trajectory position bytes lack stable ArrayBuffer ownership');
  }
  if (!(buffer instanceof ArrayBuffer)
    || Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype
    || resizable) {
    throw new Error('private browser trajectory position bytes reject shared or resizable buffers');
  }
  if (byteLength !== FRAME_BYTE_LENGTH) {
    throw new Error('private browser trajectory positions require exactly 32,220 bytes');
  }
  return UINT8_ARRAY_SLICE.call(value) as Uint8Array;
}

function allocateBuffers(): RuntimeBuffers {
  return {
    oxygenMatrices: new Float32Array(OXYGEN_COUNT * MATRIX_COMPONENT_COUNT),
    hydrogenMatrices: new Float32Array(HYDROGEN_COUNT * MATRIX_COMPONENT_COUNT),
    topologyLinkMatrices: new Float32Array(TOPOLOGY_LINK_COUNT * MATRIX_COMPONENT_COUNT),
    displayPositions: new Float32Array(COMPONENT_COUNT),
  };
}

function decodePositions(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const positions = new Float32Array(COMPONENT_COUNT);
  try {
    for (let index = 0; index < positions.length; index += 1) {
      const value = view.getFloat32(index * 4, true);
      if (!Number.isFinite(value) || Object.is(value, -0)) {
        throw new Error(`private browser trajectory position component ${index} is invalid`);
      }
      positions[index] = value;
    }
    return positions;
  } catch (error) {
    FLOAT32_ARRAY_FILL.call(positions, 0);
    throw error;
  }
}

function projectInto(data: RuntimePlanData, positions: Float32Array, target: RuntimeBuffers) {
  for (const atom of data.atoms) {
    const sourceOffset = atom.atomIndex * 3;
    const point = projectedPosition(atom, positions);
    target.displayPositions[sourceOffset] = point[0];
    target.displayPositions[sourceOffset + 1] = point[1];
    target.displayPositions[sourceOffset + 2] = point[2];
    const waterIndex = Math.floor(atom.atomIndex / 3);
    const instanceIndex = atom.element === 'O'
      ? waterIndex
      : waterIndex * 2 + atom.atomIndex % 3 - 1;
    writeAtomMatrix(
      atom.element === 'O' ? target.oxygenMatrices : target.hydrogenMatrices,
      instanceIndex * MATRIX_COMPONENT_COUNT,
      atom.element === 'O' ? 0.065 : 0.04,
      point[0],
      point[1],
      point[2],
    );
  }
  for (const link of data.links) {
    const a = link.atomAIndex * 3;
    const b = link.atomBIndex * 3;
    writeLinkMatrix(
      target.topologyLinkMatrices,
      link.topologyLinkIndex * MATRIX_COMPONENT_COUNT,
      target.displayPositions[a],
      target.displayPositions[a + 1],
      target.displayPositions[a + 2],
      target.displayPositions[b],
      target.displayPositions[b + 1],
      target.displayPositions[b + 2],
    );
  }
}

function projectedPosition(atom: AtomRecord, positions: Float32Array): readonly [number, number, number] {
  const offset = atom.atomIndex * 3;
  if (atom.atomIndex === atom.anchorOxygenIndex) {
    return [positions[offset], positions[offset + 1], positions[offset + 2]];
  }
  const anchor = atom.anchorOxygenIndex * 3;
  return [
    positions[anchor] + minimumImage(positions[offset] - positions[anchor]),
    positions[anchor + 1] + minimumImage(positions[offset + 1] - positions[anchor + 1]),
    positions[anchor + 2] + minimumImage(positions[offset + 2] - positions[anchor + 2]),
  ];
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
  const dx = bx - ax;
  const dy = by - ay;
  const dz = bz - az;
  const length = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(length) || length <= Number.EPSILON) {
    throw new Error('private browser trajectory topology link has invalid displayed length');
  }
  const ux = dx / length;
  const uy = dy / length;
  const uz = dz / length;
  const rx = Math.abs(uy) < 0.9 ? 0 : 1;
  const ry = Math.abs(uy) < 0.9 ? 1 : 0;
  const cx = ry * uz;
  const cy = -rx * uz;
  const cz = rx * uy - ry * ux;
  const crossLength = Math.hypot(cx, cy, cz);
  const xx = cx / crossLength;
  const xy = cy / crossLength;
  const xz = cz / crossLength;
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

function copyBuffers(source: RuntimeBuffers, target: RuntimeBuffers) {
  target.oxygenMatrices.set(source.oxygenMatrices);
  target.hydrogenMatrices.set(source.hydrogenMatrices);
  target.topologyLinkMatrices.set(source.topologyLinkMatrices);
  target.displayPositions.set(source.displayPositions);
}

function assertFiniteBuffers(buffers: RuntimeBuffers) {
  for (const values of [
    buffers.oxygenMatrices,
    buffers.hydrogenMatrices,
    buffers.topologyLinkMatrices,
    buffers.displayPositions,
  ]) {
    for (const value of values) {
      if (!Number.isFinite(value)) {
        throw new Error('private browser trajectory projection is not finite float32');
      }
    }
  }
}

function zeroBuffers(buffers: RuntimeBuffers) {
  FLOAT32_ARRAY_FILL.call(buffers.oxygenMatrices, 0);
  FLOAT32_ARRAY_FILL.call(buffers.hydrogenMatrices, 0);
  FLOAT32_ARRAY_FILL.call(buffers.topologyLinkMatrices, 0);
  FLOAT32_ARRAY_FILL.call(buffers.displayPositions, 0);
}

function createTopology() {
  const atoms: AtomRecord[] = [];
  const links: LinkRecord[] = [];
  for (let water = 0; water < WATER_COUNT; water += 1) {
    const oxygen = water * 3;
    const moleculeId = `tip3p-water-${water}`;
    atoms.push(
      Object.freeze({
        atomIndex: oxygen,
        atomId: `${moleculeId}:O`,
        moleculeId,
        element: 'O' as const,
        anchorOxygenIndex: oxygen,
      }),
      Object.freeze({
        atomIndex: oxygen + 1,
        atomId: `${moleculeId}:H1`,
        moleculeId,
        element: 'H' as const,
        anchorOxygenIndex: oxygen,
      }),
      Object.freeze({
        atomIndex: oxygen + 2,
        atomId: `${moleculeId}:H2`,
        moleculeId,
        element: 'H' as const,
        anchorOxygenIndex: oxygen,
      }),
    );
    links.push(
      Object.freeze({
        topologyLinkIndex: water * 2,
        atomAIndex: oxygen,
        atomBIndex: oxygen + 1,
      }),
      Object.freeze({
        topologyLinkIndex: water * 2 + 1,
        atomAIndex: oxygen,
        atomBIndex: oxygen + 2,
      }),
    );
  }
  return Object.freeze({
    atoms: Object.freeze(atoms),
    links: Object.freeze(links),
  });
}

function minimumImage(value: number) {
  return value - CELL_LENGTH_NANOMETER * Math.round(value / CELL_LENGTH_NANOMETER);
}

function bestEffortZeroBytes(value: unknown) {
  if (!(value instanceof Uint8Array)) return;
  try {
    UINT8_ARRAY_FILL.call(value, 0);
  } catch {
    // An invalid external byte owner must not mask the primary validation error.
  }
}

function digestBytes(bytes: Uint8Array) {
  return `sha256:${bytesToHex(sha256(bytes))}`;
}
