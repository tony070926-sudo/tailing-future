import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import {
  assertAtomisticPresentationFrameMetadataV046,
  type AtomisticPresentationFrameHandleV046,
} from '../simulation/atomistic-presentation-frame.ts';
import {
  assertAtomisticPrivatePositionFrameMetadataV047,
  type AtomisticPrivatePositionFrameHandleV047,
  type AtomisticPrivatePositionFrameMetadataV047,
} from '../simulation/atomistic-private-position-frame-v047.ts';
import {
  assertAtomisticWorldSessionV045,
  type AtomisticWorldSessionV045,
} from '../simulation/atomistic-world-session.ts';

/**
 * Renderer-independent instancing data core for the locked V045 OpenMM control.
 * It consumes only digest-bound position bytes from a V046 presentation handle.
 * It creates no renderer, solver frame, force, velocity, field, or public payload.
 */

export const ATOMISTIC_INSTANCING_PLAN_VERSION_V046 =
  'tf.atomistic-instancing-plan/0.4.6' as const;
export const ATOMISTIC_INSTANCING_UPDATE_RECEIPT_VERSION_V046 =
  'tf.atomistic-instancing-update-receipt/0.4.6' as const;
export const ATOMISTIC_INSTANCING_BUFFER_SNAPSHOT_VERSION_V046 =
  'tf.atomistic-instancing-buffer-snapshot/0.4.6' as const;
export const ATOMISTIC_PRIVATE_INSTANCING_PLAN_VERSION_V047 =
  'tf.atomistic-private-instancing-plan/0.4.7' as const;
export const ATOMISTIC_PRIVATE_INSTANCING_UPDATE_RECEIPT_VERSION_V047 =
  'tf.atomistic-private-instancing-update-receipt/0.4.7' as const;
export const ATOMISTIC_INSTANCING_PARTICLE_COUNT_V046 = 2_685 as const;
export const ATOMISTIC_INSTANCING_TOPOLOGY_BOND_COUNT_V046 = 1_790 as const;
export const ATOMISTIC_INSTANCING_WATER_COUNT_V046 = 895 as const;
export const ATOMISTIC_INSTANCING_FRAME_COUNT_V046 = 101 as const;
export const ATOMISTIC_INSTANCING_COMPONENT_COUNT_V046 = 8_055 as const;
export const ATOMISTIC_INSTANCING_F32_POSITION_BYTE_LENGTH_V046 = 32_220 as const;
export const ATOMISTIC_INSTANCING_BODY_DRAW_CALL_LIMIT_V046 = 8 as const;
export const ATOMISTIC_INSTANCING_ELEMENT_ORDER_V046 = Object.freeze(['O', 'H'] as const);

const ATOM_MATRIX_COMPONENTS = 16;
const BOND_MATRIX_COMPONENTS = 16;
const CELL_LENGTH_NANOMETER = 3;
const DIGEST = /^sha256:(?!0{64}$)[0-9a-f]{64}$/;
const PLAN_RUNTIME_DATA = new WeakMap<object, RuntimePlanData>();
const TYPED_ARRAY_PROTOTYPE = Object.getPrototypeOf(Uint8Array.prototype) as object;
const TYPED_ARRAY_BUFFER_GETTER = Object.getOwnPropertyDescriptor(
  TYPED_ARRAY_PROTOTYPE,
  'buffer',
)?.get;
const ARRAY_BUFFER_RESIZABLE_GETTER = Object.getOwnPropertyDescriptor(
  ArrayBuffer.prototype,
  'resizable',
)?.get;

export type AtomisticInstancingElementV046 =
  typeof ATOMISTIC_INSTANCING_ELEMENT_ORDER_V046[number];

export type AtomisticAtomInstanceBatchV046 = Readonly<{
  batchId: 'atom:O' | 'atom:H';
  primitive: 'unit-icosphere';
  element: AtomisticInstancingElementV046;
  instanceCount: 895 | 1_790;
  atomOrderDigest: string;
  atomIndicesByInstance: ReadonlyArray<number>;
  geometryResourceKey: 'shared:atom-unit-icosphere';
  materialResourceKey: 'shared:atom-material:O' | 'shared:atom-material:H';
  gpuObjectPolicy: 'one-instanced-mesh-for-entire-element-batch';
  matrixLayout: 'float32-column-major-mat4';
  displayRadiusNanometer: 0.065 | 0.04;
  displayScaleBoundary: 'nonphysical-display-scale-not-atomic-radius';
}>;

export type AtomisticBondInstanceBatchV046 = Readonly<{
  batchId: 'bond:water-oh-topology';
  primitive: 'unit-cylinder-y-axis-centered';
  instanceCount: 1_790;
  topologyBondIndicesByInstance: ReadonlyArray<number>;
  atomIndexPairsByInstance: ReadonlyArray<readonly [number, number]>;
  geometryResourceKey: 'shared:water-oh-unit-cylinder';
  materialResourceKey: 'shared:water-oh-topology-material';
  gpuObjectPolicy: 'one-instanced-mesh-for-all-water-oh-topology-bonds';
  matrixLayout: 'float32-column-major-mat4';
  semanticRole: 'topology-adjacency-and-rigid-distance-constraint-not-energetic-bond';
  energeticInteraction: false;
  displayRadiusNanometer: 0.012;
  displayScaleBoundary: 'nonphysical-topology-link-radius-for-visibility-only';
  periodicPlacement: 'source-unwrapped-oxygen-anchor-plus-cubic-minimum-image-internal-sites';
}>;

export type AtomisticInstancingFrameBindingV046 = Readonly<{
  frameOrdinal: number;
  frameDigest: string;
  atomOrderDigest: string;
  cellDigest: string;
  topologyDigest: string;
  positionsSourceF64Digest: string;
  positionsShape: readonly [2_685, 3];
}>;

export type AtomisticInstancingPlanV046 = Readonly<{
  schemaVersion: typeof ATOMISTIC_INSTANCING_PLAN_VERSION_V046;
  role: 'gpu-instancing-data-plan-no-renderer-no-solver';
  sourceBinding: Readonly<{
    sourceVersion: 'tf.atomistic-world-session/0.4.5';
    sessionId: string;
    sessionDigest: string;
    trajectoryDigest: string;
    atomOrderDigest: string;
    cellDigest: string;
    topologyDigest: string;
    executionAuthenticityVerified: false;
    promotionEligible: false;
    sourceLicenseForPublicDistributionVerified: false;
    publicDistributionEligible: false;
  }>;
  inventory: Readonly<{
    waterMoleculeCount: 895;
    particleCount: 2_685;
    oxygenCount: 895;
    hydrogenCount: 1_790;
    topologyBondCount: 1_790;
    frameCount: 101;
  }>;
  cell: Readonly<{
    kind: 'locked-three-nanometer-orthorhombic-periodic-cell';
    cellDigest: string;
    vectorsNanometer: readonly [
      readonly [3, 0, 0],
      readonly [0, 3, 0],
      readonly [0, 0, 3],
    ];
    periodicAxes: readonly [true, true, true];
    coordinateGauge: 'source-unwrapped-oxygen-anchor-with-cubic-minimum-image-internal-sites';
  }>;
  atomBatches: readonly [AtomisticAtomInstanceBatchV046, AtomisticAtomInstanceBatchV046];
  bondBatches: readonly [AtomisticBondInstanceBatchV046];
  frameBindings: ReadonlyArray<AtomisticInstancingFrameBindingV046>;
  updateLayout: Readonly<{
    allocationPolicy: 'runtime-matrices-and-display-positions-preallocated-once';
    inputOwnership: 'fixed-f32le-position-bytes-defensively-copied-and-digest-verified';
    atomMatrixFloat32ComponentCount: 42_960;
    bondMatrixFloat32ComponentCount: 28_640;
    displayPositionFloat32ComponentCount: 8_055;
    matrixConvention: 'column-major-unit-primitive-local-to-source-nanometer';
  }>;
  drawCallBudget: Readonly<{
    atomBatchUpperBound: 2;
    topologyBondBatchUpperBound: 1;
    bodyUpperBound: 3;
    selectionOverlayUpperBound: 1;
    periodicCellOverlayUpperBound: 1;
    declaredSceneUpperBound: 5;
    hardLimit: 8;
    measurementBoundary: 'static-upper-bound-not-measured-fps-or-runtime-performance';
  }>;
  scientificBoundary: Readonly<{
    renderedPhysicalChannel: 'digest-bound-source-position-f32-presentation-derivative-only';
    topologyLayoutAuthority: 'locked-tip3p-pdb-o-h-h-record-order-two-oh-links-per-water';
    topologyBondMeaning: 'adjacency-and-rigid-constraint-not-energetic-bond-or-bond-order';
    forceLayer: null;
    velocityLayer: null;
    fieldLayer: null;
    electronicDensityLayer: null;
    motionSynthesis: null;
    frameInterpolation: null;
    forceSemanticsIfLaterIntegrated: 'total-potential-force-excluding-constraint-impulses';
    velocitySemanticsIfLaterIntegrated: 'raw-openmm-verlet-half-step-not-consumed-by-this-plan';
    systemClaim: '895-tip3p-water-pme-control-not-bulk-water-not-solution-not-nacl';
    framesCreatedByThisModule: false;
    publicDistributionEligible: false;
  }>;
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
    sourceLicenseForPublicDistributionVerified: false;
    publicDistributionEligible: false;
  }>;
  inventory: Readonly<{
    waterMoleculeCount: 895;
    particleCount: 2_685;
    oxygenCount: 895;
    hydrogenCount: 1_790;
    topologyBondCount: 1_790;
    frameCount: 1;
  }>;
  cell: AtomisticInstancingPlanV046['cell'];
  atomBatches: AtomisticInstancingPlanV046['atomBatches'];
  bondBatches: AtomisticInstancingPlanV046['bondBatches'];
  frameBinding: Readonly<{
    frameOrdinal: number;
    frameDigest: string;
    atomOrderDigest: string;
    cellDigest: string;
    topologyDigest: string;
    positionsShape: readonly [2_685, 3];
    positionsDerivedF32Digest: string;
  }>;
  updateLayout: AtomisticInstancingPlanV046['updateLayout'];
  drawCallBudget: AtomisticInstancingPlanV046['drawCallBudget'];
  scientificBoundary: AtomisticInstancingPlanV046['scientificBoundary'] & Readonly<{
    transportMetadata:
      'sanitized-single-frame-no-artifact-paths-no-source-revision-no-velocity-force-metadata';
  }>;
}>;

export type AtomisticPrivateInstancingUpdateReceiptV047 = Readonly<{
  schemaVersion: typeof ATOMISTIC_PRIVATE_INSTANCING_UPDATE_RECEIPT_VERSION_V047;
  status: 'sanitized-private-positions-projected-into-preallocated-runtime-buffers';
  sourceFrameOrdinal: number;
  sourceFrameDigest: string;
  privateFrameMetadataDigest: string;
  positionsDerivedF32Digest: string;
  atomOrderDigest: string;
  cellDigest: string;
  topologyDigest: string;
  updatedAtomInstanceCount: 2_685;
  updatedTopologyBondInstanceCount: 1_790;
  positionGauge: 'source-unwrapped-oxygen-anchor-with-cubic-minimum-image-internal-sites';
  atomicUpdate: true;
  physicalWorldState: false;
  createsTrajectoryFrame: false;
  forcesConsumed: false;
  velocitiesConsumed: false;
  fieldsConsumed: false;
  publicDistributionEligible: false;
  performanceClaim: null;
}>;

export type AtomisticInstanceSelectionV046 = Readonly<{
  batchId: 'atom:O' | 'atom:H';
  instanceId: number;
  atomIndex: number;
  atomId: string;
  moleculeId: string;
  element: AtomisticInstancingElementV046;
  atomOrderDigest: string;
  topologyDigest: string;
  mappingSemantics: 'stable-instance-to-authoritative-zero-based-pdb-record-order';
}>;

export type AtomisticInstancingUpdateReceiptV046 = Readonly<{
  schemaVersion: typeof ATOMISTIC_INSTANCING_UPDATE_RECEIPT_VERSION_V046;
  status: 'digest-bound-positions-projected-into-preallocated-runtime-buffers';
  sourceFrameOrdinal: number;
  sourceFrameDigest: string;
  presentationFrameDigest: string;
  positionsSourceF64Digest: string;
  positionsDerivedF32Digest: string;
  atomOrderDigest: string;
  cellDigest: string;
  topologyDigest: string;
  updatedAtomInstanceCount: 2_685;
  updatedTopologyBondInstanceCount: 1_790;
  positionGauge: 'source-unwrapped-oxygen-anchor-with-cubic-minimum-image-internal-sites';
  atomicUpdate: true;
  physicalWorldState: false;
  createsTrajectoryFrame: false;
  forcesConsumed: false;
  velocitiesConsumed: false;
  fieldsConsumed: false;
  publicDistributionEligible: false;
  performanceClaim: null;
}>;

export type AtomisticInstancingBufferSnapshotV046 = Readonly<{
  schemaVersion: typeof ATOMISTIC_INSTANCING_BUFFER_SNAPSHOT_VERSION_V046;
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
  element: AtomisticInstancingElementV046;
  anchorOxygenIndex: number;
}>;
type TopologyBond = Readonly<{
  topologyBondIndex: number;
  atomAIndex: number;
  atomBIndex: number;
}>;
type RuntimePlanData = Readonly<{
  session: AtomisticWorldSessionV045 | null;
  privateFrameMetadata: AtomisticPrivatePositionFrameMetadataV047 | null;
  atoms: ReadonlyArray<TopologyAtom>;
  bonds: ReadonlyArray<TopologyBond>;
}>;
type RuntimeBuffers = {
  atomMatricesO: Float32Array;
  atomMatricesH: Float32Array;
  topologyBondMatrices: Float32Array;
  displayPositions: Float32Array;
};
type AtomisticInstancingPlan =
  | AtomisticInstancingPlanV046
  | AtomisticPrivateInstancingPlanV047;

const UINT8_ARRAY_FILL = Uint8Array.prototype.fill;
const FLOAT32_ARRAY_FILL = Float32Array.prototype.fill;

export function createAtomisticInstancingPlanV046(
  sourceSession: AtomisticWorldSessionV045,
): AtomisticInstancingPlanV046 {
  const session = assertAtomisticWorldSessionV045(sourceSession);
  assertLockedCubicCell(session);
  const topology = createLockedTip3pTopology();
  const oxygenIndices = Object.freeze(topology.atoms
    .filter((atom) => atom.element === 'O').map((atom) => atom.atomIndex));
  const hydrogenIndices = Object.freeze(topology.atoms
    .filter((atom) => atom.element === 'H').map((atom) => atom.atomIndex));
  const atomBatches = Object.freeze([
    atomBatch('O', oxygenIndices, session.atomOrder.atomOrderDigest),
    atomBatch('H', hydrogenIndices, session.atomOrder.atomOrderDigest),
  ] as const);
  const bondBatch = createTopologyBondBatch(topology);
  const frames = session.trajectory.chunks.flatMap((chunk) => chunk.frames);
  if (frames.length !== ATOMISTIC_INSTANCING_FRAME_COUNT_V046) {
    throw new Error('validated session does not contain exactly 101 source frames');
  }
  const frameBindings = Object.freeze(frames.map((frame, frameOrdinal) => {
    if (frame.frameOrdinal !== frameOrdinal
      || frame.lineage.atomOrderDigest !== session.atomOrder.atomOrderDigest
      || frame.lineage.cellDigest !== session.cell.cellDigest
      || frame.lineage.topologyDigest !== session.topology.topologyDigest) {
      throw new Error('source frame lineage differs from its validated world session');
    }
    return Object.freeze({
      frameOrdinal,
      frameDigest: frame.frameDigest,
      atomOrderDigest: frame.lineage.atomOrderDigest,
      cellDigest: frame.lineage.cellDigest,
      topologyDigest: frame.lineage.topologyDigest,
      positionsSourceF64Digest: frame.arrays.positionsNanometer.frameByteDigest,
      positionsShape: Object.freeze([2_685, 3] as const),
    });
  }));
  const plan: AtomisticInstancingPlanV046 = Object.freeze({
    schemaVersion: ATOMISTIC_INSTANCING_PLAN_VERSION_V046,
    role: 'gpu-instancing-data-plan-no-renderer-no-solver',
    sourceBinding: Object.freeze({
      sourceVersion: 'tf.atomistic-world-session/0.4.5' as const,
      sessionId: session.sessionId,
      sessionDigest: session.sessionDigest,
      trajectoryDigest: session.trajectory.trajectoryDigest,
      atomOrderDigest: session.atomOrder.atomOrderDigest,
      cellDigest: session.cell.cellDigest,
      topologyDigest: session.topology.topologyDigest,
      executionAuthenticityVerified: false as const,
      promotionEligible: false as const,
      sourceLicenseForPublicDistributionVerified: false as const,
      publicDistributionEligible: false as const,
    }),
    inventory: Object.freeze({
      waterMoleculeCount: 895 as const,
      particleCount: 2_685 as const,
      oxygenCount: 895 as const,
      hydrogenCount: 1_790 as const,
      topologyBondCount: 1_790 as const,
      frameCount: 101 as const,
    }),
    cell: Object.freeze({
      kind: 'locked-three-nanometer-orthorhombic-periodic-cell' as const,
      cellDigest: session.cell.cellDigest,
      vectorsNanometer: Object.freeze([
        Object.freeze([3, 0, 0] as const),
        Object.freeze([0, 3, 0] as const),
        Object.freeze([0, 0, 3] as const),
      ] as const),
      periodicAxes: Object.freeze([true, true, true] as const),
      coordinateGauge:
        'source-unwrapped-oxygen-anchor-with-cubic-minimum-image-internal-sites' as const,
    }),
    atomBatches,
    bondBatches: Object.freeze([bondBatch] as const),
    frameBindings,
    updateLayout: Object.freeze({
      allocationPolicy: 'runtime-matrices-and-display-positions-preallocated-once' as const,
      inputOwnership: 'fixed-f32le-position-bytes-defensively-copied-and-digest-verified' as const,
      atomMatrixFloat32ComponentCount: 42_960 as const,
      bondMatrixFloat32ComponentCount: 28_640 as const,
      displayPositionFloat32ComponentCount: 8_055 as const,
      matrixConvention: 'column-major-unit-primitive-local-to-source-nanometer' as const,
    }),
    drawCallBudget: Object.freeze({
      atomBatchUpperBound: 2 as const,
      topologyBondBatchUpperBound: 1 as const,
      bodyUpperBound: 3 as const,
      selectionOverlayUpperBound: 1 as const,
      periodicCellOverlayUpperBound: 1 as const,
      declaredSceneUpperBound: 5 as const,
      hardLimit: 8 as const,
      measurementBoundary: 'static-upper-bound-not-measured-fps-or-runtime-performance' as const,
    }),
    scientificBoundary: Object.freeze({
      renderedPhysicalChannel:
        'digest-bound-source-position-f32-presentation-derivative-only' as const,
      topologyLayoutAuthority:
        'locked-tip3p-pdb-o-h-h-record-order-two-oh-links-per-water' as const,
      topologyBondMeaning:
        'adjacency-and-rigid-constraint-not-energetic-bond-or-bond-order' as const,
      forceLayer: null,
      velocityLayer: null,
      fieldLayer: null,
      electronicDensityLayer: null,
      motionSynthesis: null,
      frameInterpolation: null,
      forceSemanticsIfLaterIntegrated:
        'total-potential-force-excluding-constraint-impulses' as const,
      velocitySemanticsIfLaterIntegrated:
        'raw-openmm-verlet-half-step-not-consumed-by-this-plan' as const,
      systemClaim: '895-tip3p-water-pme-control-not-bulk-water-not-solution-not-nacl' as const,
      framesCreatedByThisModule: false as const,
      publicDistributionEligible: false as const,
    }),
  });
  PLAN_RUNTIME_DATA.set(plan, Object.freeze({
    session,
    privateFrameMetadata: null,
    atoms: topology.atoms,
    bonds: topology.bonds,
  }));
  return plan;
}

export function createAtomisticPrivateInstancingPlanV047(
  metadataInput: AtomisticPrivatePositionFrameMetadataV047,
): AtomisticPrivateInstancingPlanV047 {
  const metadata = assertAtomisticPrivatePositionFrameMetadataV047(metadataInput);
  const topology = createLockedTip3pTopology();
  const oxygenIndices = Object.freeze(topology.atoms
    .filter((atom) => atom.element === 'O').map((atom) => atom.atomIndex));
  const hydrogenIndices = Object.freeze(topology.atoms
    .filter((atom) => atom.element === 'H').map((atom) => atom.atomIndex));
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
      sourceLicenseForPublicDistributionVerified: false as const,
      publicDistributionEligible: false as const,
    }),
    inventory: Object.freeze({
      waterMoleculeCount: 895 as const,
      particleCount: 2_685 as const,
      oxygenCount: 895 as const,
      hydrogenCount: 1_790 as const,
      topologyBondCount: 1_790 as const,
      frameCount: 1 as const,
    }),
    cell: Object.freeze({
      kind: 'locked-three-nanometer-orthorhombic-periodic-cell' as const,
      cellDigest: metadata.binding.cellDigest,
      vectorsNanometer: Object.freeze([
        Object.freeze([3, 0, 0] as const),
        Object.freeze([0, 3, 0] as const),
        Object.freeze([0, 0, 3] as const),
      ] as const),
      periodicAxes: Object.freeze([true, true, true] as const),
      coordinateGauge:
        'source-unwrapped-oxygen-anchor-with-cubic-minimum-image-internal-sites' as const,
    }),
    atomBatches: Object.freeze([
      atomBatch('O', oxygenIndices, metadata.binding.atomOrderDigest),
      atomBatch('H', hydrogenIndices, metadata.binding.atomOrderDigest),
    ] as const),
    bondBatches: Object.freeze([createTopologyBondBatch(topology)] as const),
    frameBinding: Object.freeze({
      frameOrdinal: metadata.binding.frameOrdinal,
      frameDigest: metadata.binding.frameDigest,
      atomOrderDigest: metadata.binding.atomOrderDigest,
      cellDigest: metadata.binding.cellDigest,
      topologyDigest: metadata.binding.topologyDigest,
      positionsShape: Object.freeze([2_685, 3] as const),
      positionsDerivedF32Digest: metadata.binding.positionsDerivedF32Digest,
    }),
    updateLayout: Object.freeze({
      allocationPolicy: 'runtime-matrices-and-display-positions-preallocated-once' as const,
      inputOwnership: 'fixed-f32le-position-bytes-defensively-copied-and-digest-verified' as const,
      atomMatrixFloat32ComponentCount: 42_960 as const,
      bondMatrixFloat32ComponentCount: 28_640 as const,
      displayPositionFloat32ComponentCount: 8_055 as const,
      matrixConvention: 'column-major-unit-primitive-local-to-source-nanometer' as const,
    }),
    drawCallBudget: Object.freeze({
      atomBatchUpperBound: 2 as const,
      topologyBondBatchUpperBound: 1 as const,
      bodyUpperBound: 3 as const,
      selectionOverlayUpperBound: 1 as const,
      periodicCellOverlayUpperBound: 1 as const,
      declaredSceneUpperBound: 5 as const,
      hardLimit: 8 as const,
      measurementBoundary: 'static-upper-bound-not-measured-fps-or-runtime-performance' as const,
    }),
    scientificBoundary: Object.freeze({
      renderedPhysicalChannel:
        'digest-bound-source-position-f32-presentation-derivative-only' as const,
      topologyLayoutAuthority:
        'locked-tip3p-pdb-o-h-h-record-order-two-oh-links-per-water' as const,
      topologyBondMeaning:
        'adjacency-and-rigid-constraint-not-energetic-bond-or-bond-order' as const,
      forceLayer: null,
      velocityLayer: null,
      fieldLayer: null,
      electronicDensityLayer: null,
      motionSynthesis: null,
      frameInterpolation: null,
      forceSemanticsIfLaterIntegrated:
        'total-potential-force-excluding-constraint-impulses' as const,
      velocitySemanticsIfLaterIntegrated:
        'raw-openmm-verlet-half-step-not-consumed-by-this-plan' as const,
      systemClaim: '895-tip3p-water-pme-control-not-bulk-water-not-solution-not-nacl' as const,
      framesCreatedByThisModule: false as const,
      publicDistributionEligible: false as const,
      transportMetadata:
        'sanitized-single-frame-no-artifact-paths-no-source-revision-no-velocity-force-metadata' as const,
    }),
  });
  PLAN_RUNTIME_DATA.set(plan, Object.freeze({
    session: null,
    privateFrameMetadata: metadata,
    atoms: topology.atoms,
    bonds: topology.bonds,
  }));
  return plan;
}

export function computeAtomisticInstancingDrawCallUpperBoundV046(
  plan: AtomisticInstancingPlanV046 | AtomisticPrivateInstancingPlanV047,
  layers: Readonly<{
    atoms: boolean;
    topologyBonds: boolean;
    selectionOverlay: boolean;
    periodicCellOverlay: boolean;
  }>,
) {
  requireRuntimePlanData(plan);
  const upperBound = (layers.atoms ? plan.atomBatches.length : 0)
    + (layers.topologyBonds ? plan.bondBatches.length : 0)
    + (layers.selectionOverlay ? 1 : 0)
    + (layers.periodicCellOverlay ? 1 : 0);
  if (upperBound > plan.drawCallBudget.hardLimit) {
    throw new Error('instancing draw-call upper bound exceeds the locked limit');
  }
  return Object.freeze({
    upperBound,
    hardLimit: plan.drawCallBudget.hardLimit,
    withinLimit: true as const,
    boundary: plan.drawCallBudget.measurementBoundary,
  });
}

export function resolveAtomInstanceSelectionV046(
  plan: AtomisticInstancingPlanV046 | AtomisticPrivateInstancingPlanV047,
  batchId: 'atom:O' | 'atom:H',
  instanceId: number,
): AtomisticInstanceSelectionV046 {
  const data = requireRuntimePlanData(plan);
  const batch = plan.atomBatches.find((candidate) => candidate.batchId === batchId);
  if (!batch || !Number.isSafeInteger(instanceId) || instanceId < 0
    || instanceId >= batch.instanceCount) {
    throw new Error('atom instance selection is outside the declared batch');
  }
  const atomIndex = batch.atomIndicesByInstance[instanceId];
  const atom = data.atoms[atomIndex];
  if (!atom || atom.element !== batch.element) throw new Error('atom instance mapping is invalid');
  return Object.freeze({
    batchId,
    instanceId,
    atomIndex,
    atomId: atom.atomId,
    moleculeId: atom.moleculeId,
    element: atom.element,
    atomOrderDigest: plan.sourceBinding.atomOrderDigest,
    topologyDigest: plan.sourceBinding.topologyDigest,
    mappingSemantics: 'stable-instance-to-authoritative-zero-based-pdb-record-order' as const,
  });
}

export function resolveAtomIndexSelectionV046(
  plan: AtomisticInstancingPlanV046 | AtomisticPrivateInstancingPlanV047,
  atomIndex: number,
) {
  requireRuntimePlanData(plan);
  if (!Number.isSafeInteger(atomIndex) || atomIndex < 0
    || atomIndex >= ATOMISTIC_INSTANCING_PARTICLE_COUNT_V046) {
    throw new Error('atom index is outside the locked particle inventory');
  }
  for (const batch of plan.atomBatches) {
    const instanceId = batch.atomIndicesByInstance.indexOf(atomIndex);
    if (instanceId >= 0) return resolveAtomInstanceSelectionV046(plan, batch.batchId, instanceId);
  }
  throw new Error('atom index is absent from every instancing batch');
}

export class AtomisticInstancingRuntimeV046 {
  readonly schemaVersion = 'tf.atomistic-instancing-runtime/0.4.6' as const;
  readonly plan: AtomisticInstancingPlanV046 | AtomisticPrivateInstancingPlanV047;
  #data: RuntimePlanData;
  #buffers: RuntimeBuffers;
  #sourceFrameOrdinal: number | null = null;
  #sourceFrameDigest: string | null = null;
  #presentationFrameDigest: string | null = null;
  #positionsDerivedF32Digest: string | null = null;
  #disposed = false;

  constructor(plan: AtomisticInstancingPlanV046 | AtomisticPrivateInstancingPlanV047) {
    this.#data = requireRuntimePlanData(plan);
    this.plan = plan;
    this.#buffers = {
      atomMatricesO: new Float32Array(895 * ATOM_MATRIX_COMPONENTS),
      atomMatricesH: new Float32Array(1_790 * ATOM_MATRIX_COMPONENTS),
      topologyBondMatrices: new Float32Array(1_790 * BOND_MATRIX_COMPONENTS),
      displayPositions: new Float32Array(ATOMISTIC_INSTANCING_COMPONENT_COUNT_V046),
    };
  }

  update(
    frameHandle: AtomisticPresentationFrameHandleV046,
  ): AtomisticInstancingUpdateReceiptV046 {
    this.#assertActive();
    if (this.plan.schemaVersion !== ATOMISTIC_INSTANCING_PLAN_VERSION_V046
      || this.#data.session === null) {
      throw new Error('V046 presentation update requires a full V046 instancing plan');
    }
    const plan = this.plan;
    if (!frameHandle || typeof frameHandle !== 'object'
      || typeof frameHandle.copyChannelBytes !== 'function'
      || typeof frameHandle.isRevoked !== 'function') {
      throw new Error('instancing update requires an atomistic presentation frame handle');
    }
    if (frameHandle.isRevoked()) {
      throw new Error('instancing update rejects a revoked presentation frame handle');
    }
    const metadata = assertAtomisticPresentationFrameMetadataV046(
      frameHandle.metadata,
      this.#data.session,
    );
    const binding = plan.frameBindings[metadata.binding.frameOrdinal];
    if (!binding
      || metadata.binding.sessionId !== plan.sourceBinding.sessionId
      || metadata.binding.sessionDigest !== plan.sourceBinding.sessionDigest
      || metadata.binding.frameDigest !== binding.frameDigest
      || metadata.binding.atomOrderDigest !== binding.atomOrderDigest
      || metadata.binding.cellDigest !== binding.cellDigest
      || metadata.channels.positionsNanometer.source.sha256 !== binding.positionsSourceF64Digest
      || metadata.sourceLicenseForPublicDistributionVerified !== false
      || metadata.publicDistributionEligible !== false) {
      throw new Error('presentation frame is not bound to this instancing plan');
    }
    const exportedBytes = frameHandle.copyChannelBytes('positionsNanometer');
    let derivedDigest: string;
    try {
      derivedDigest = projectFixedPositionBytes(
        exportedBytes,
        metadata.channels.positionsNanometer.derived.sha256,
        plan,
        this.#data,
        this.#buffers,
      );
    } finally {
      if (exportedBytes instanceof Uint8Array) UINT8_ARRAY_FILL.call(exportedBytes, 0);
    }
    this.#sourceFrameOrdinal = metadata.binding.frameOrdinal;
    this.#sourceFrameDigest = metadata.binding.frameDigest;
    this.#presentationFrameDigest = metadata.presentationFrameDigest;
    this.#positionsDerivedF32Digest = derivedDigest;
    return Object.freeze({
      schemaVersion: ATOMISTIC_INSTANCING_UPDATE_RECEIPT_VERSION_V046,
      status: 'digest-bound-positions-projected-into-preallocated-runtime-buffers' as const,
      sourceFrameOrdinal: metadata.binding.frameOrdinal,
      sourceFrameDigest: metadata.binding.frameDigest,
      presentationFrameDigest: metadata.presentationFrameDigest,
      positionsSourceF64Digest: binding.positionsSourceF64Digest,
      positionsDerivedF32Digest: derivedDigest,
      atomOrderDigest: binding.atomOrderDigest,
      cellDigest: binding.cellDigest,
      topologyDigest: binding.topologyDigest,
      updatedAtomInstanceCount: 2_685 as const,
      updatedTopologyBondInstanceCount: 1_790 as const,
      positionGauge:
        'source-unwrapped-oxygen-anchor-with-cubic-minimum-image-internal-sites' as const,
      atomicUpdate: true as const,
      physicalWorldState: false as const,
      createsTrajectoryFrame: false as const,
      forcesConsumed: false as const,
      velocitiesConsumed: false as const,
      fieldsConsumed: false as const,
      publicDistributionEligible: false as const,
      performanceClaim: null,
    });
  }

  updatePrivatePositionFrameV047(
    frameHandle: AtomisticPrivatePositionFrameHandleV047,
  ): AtomisticPrivateInstancingUpdateReceiptV047 {
    this.#assertActive();
    if (this.plan.schemaVersion !== ATOMISTIC_PRIVATE_INSTANCING_PLAN_VERSION_V047
      || this.#data.privateFrameMetadata === null) {
      throw new Error('private position update requires a sanitized V047 instancing plan');
    }
    const plan = this.plan;
    if (!frameHandle || typeof frameHandle !== 'object'
      || typeof frameHandle.copyPositionBytes !== 'function'
      || typeof frameHandle.isRevoked !== 'function') {
      throw new Error('private instancing update requires a private position frame handle');
    }
    if (frameHandle.isRevoked()) {
      throw new Error('private instancing update rejects a revoked position handle');
    }
    const metadata = assertAtomisticPrivatePositionFrameMetadataV047(frameHandle.metadata);
    const binding = plan.frameBinding;
    if (metadata.metadataDigest !== plan.sourceBinding.metadataDigest
      || metadata.binding.sessionId !== plan.sourceBinding.sessionId
      || metadata.binding.sessionDigest !== plan.sourceBinding.sessionDigest
      || metadata.binding.trajectoryDigest !== plan.sourceBinding.trajectoryDigest
      || metadata.binding.frameOrdinal !== binding.frameOrdinal
      || metadata.binding.frameDigest !== binding.frameDigest
      || metadata.binding.atomOrderDigest !== binding.atomOrderDigest
      || metadata.binding.cellDigest !== binding.cellDigest
      || metadata.binding.topologyDigest !== binding.topologyDigest
      || metadata.binding.positionsDerivedF32Digest !== binding.positionsDerivedF32Digest
      || metadata.scientificBoundary.publicDistributionEligible !== false) {
      throw new Error('private position frame is not bound to this sanitized instancing plan');
    }
    const exportedBytes = frameHandle.copyPositionBytes();
    let derivedDigest: string;
    try {
      derivedDigest = projectFixedPositionBytes(
        exportedBytes,
        binding.positionsDerivedF32Digest,
        plan,
        this.#data,
        this.#buffers,
      );
    } finally {
      if (exportedBytes instanceof Uint8Array) UINT8_ARRAY_FILL.call(exportedBytes, 0);
    }
    this.#sourceFrameOrdinal = binding.frameOrdinal;
    this.#sourceFrameDigest = binding.frameDigest;
    this.#presentationFrameDigest = metadata.metadataDigest;
    this.#positionsDerivedF32Digest = derivedDigest;
    return Object.freeze({
      schemaVersion: ATOMISTIC_PRIVATE_INSTANCING_UPDATE_RECEIPT_VERSION_V047,
      status: 'sanitized-private-positions-projected-into-preallocated-runtime-buffers' as const,
      sourceFrameOrdinal: binding.frameOrdinal,
      sourceFrameDigest: binding.frameDigest,
      privateFrameMetadataDigest: metadata.metadataDigest,
      positionsDerivedF32Digest: derivedDigest,
      atomOrderDigest: binding.atomOrderDigest,
      cellDigest: binding.cellDigest,
      topologyDigest: binding.topologyDigest,
      updatedAtomInstanceCount: 2_685 as const,
      updatedTopologyBondInstanceCount: 1_790 as const,
      positionGauge:
        'source-unwrapped-oxygen-anchor-with-cubic-minimum-image-internal-sites' as const,
      atomicUpdate: true as const,
      physicalWorldState: false as const,
      createsTrajectoryFrame: false as const,
      forcesConsumed: false as const,
      velocitiesConsumed: false as const,
      fieldsConsumed: false as const,
      publicDistributionEligible: false as const,
      performanceClaim: null,
    });
  }

  snapshot(): AtomisticInstancingBufferSnapshotV046 {
    this.#assertActive();
    return Object.freeze({
      schemaVersion: ATOMISTIC_INSTANCING_BUFFER_SNAPSHOT_VERSION_V046,
      ownership: 'fresh-copy-snapshot-mutation-does-not-affect-runtime' as const,
      sourceFrameOrdinal: this.#sourceFrameOrdinal,
      sourceFrameDigest: this.#sourceFrameDigest,
      presentationFrameDigest: this.#presentationFrameDigest,
      positionsDerivedF32Digest: this.#positionsDerivedF32Digest,
      atomOrderDigest: this.plan.sourceBinding.atomOrderDigest,
      topologyDigest: this.plan.sourceBinding.topologyDigest,
      publicDistributionEligible: false as const,
      atomMatricesByBatch: Object.freeze([
        Object.freeze({ batchId: 'atom:O' as const, matrices: this.#buffers.atomMatricesO.slice() }),
        Object.freeze({ batchId: 'atom:H' as const, matrices: this.#buffers.atomMatricesH.slice() }),
      ] as const),
      topologyBondMatrices: this.#buffers.topologyBondMatrices.slice(),
      displayPositionsNanometerByAtomIndex: this.#buffers.displayPositions.slice(),
    });
  }

  resolveAtomInstanceSelection(
    batchId: 'atom:O' | 'atom:H',
    instanceId: number,
  ) {
    this.#assertActive();
    return resolveAtomInstanceSelectionV046(this.plan, batchId, instanceId);
  }

  get disposed() {
    return this.#disposed;
  }

  dispose() {
    if (this.#disposed) return;
    this.#disposed = true;
    FLOAT32_ARRAY_FILL.call(this.#buffers.atomMatricesO, 0);
    FLOAT32_ARRAY_FILL.call(this.#buffers.atomMatricesH, 0);
    FLOAT32_ARRAY_FILL.call(this.#buffers.topologyBondMatrices, 0);
    FLOAT32_ARRAY_FILL.call(this.#buffers.displayPositions, 0);
    this.#sourceFrameOrdinal = null;
    this.#sourceFrameDigest = null;
    this.#presentationFrameDigest = null;
    this.#positionsDerivedF32Digest = null;
  }

  #assertActive() {
    if (this.#disposed) throw new Error('atomistic instancing runtime is disposed');
  }
}

function atomBatch(
  element: AtomisticInstancingElementV046,
  atomIndicesByInstance: ReadonlyArray<number>,
  atomOrderDigest: string,
): AtomisticAtomInstanceBatchV046 {
  return Object.freeze({
    batchId: `atom:${element}` as 'atom:O' | 'atom:H',
    primitive: 'unit-icosphere' as const,
    element,
    instanceCount: (element === 'O' ? 895 : 1_790) as 895 | 1_790,
    atomOrderDigest,
    atomIndicesByInstance,
    geometryResourceKey: 'shared:atom-unit-icosphere' as const,
    materialResourceKey: `shared:atom-material:${element}` as
      'shared:atom-material:O' | 'shared:atom-material:H',
    gpuObjectPolicy: 'one-instanced-mesh-for-entire-element-batch' as const,
    matrixLayout: 'float32-column-major-mat4' as const,
    displayRadiusNanometer: (element === 'O' ? 0.065 : 0.04) as 0.065 | 0.04,
    displayScaleBoundary: 'nonphysical-display-scale-not-atomic-radius' as const,
  });
}

function createLockedTip3pTopology() {
  const atoms: TopologyAtom[] = [];
  const bonds: TopologyBond[] = [];
  for (let water = 0; water < ATOMISTIC_INSTANCING_WATER_COUNT_V046; water += 1) {
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
    bonds.push(
      Object.freeze({ topologyBondIndex: water * 2, atomAIndex: oxygen,
        atomBIndex: oxygen + 1 }),
      Object.freeze({ topologyBondIndex: water * 2 + 1, atomAIndex: oxygen,
        atomBIndex: oxygen + 2 }),
    );
  }
  if (atoms.length !== 2_685 || bonds.length !== 1_790) {
    throw new Error('locked TIP3P topology construction failed');
  }
  return Object.freeze({ atoms: Object.freeze(atoms), bonds: Object.freeze(bonds) });
}

function createTopologyBondBatch(
  topology: ReturnType<typeof createLockedTip3pTopology>,
): AtomisticBondInstanceBatchV046 {
  return Object.freeze({
    batchId: 'bond:water-oh-topology' as const,
    primitive: 'unit-cylinder-y-axis-centered' as const,
    instanceCount: 1_790 as const,
    topologyBondIndicesByInstance: Object.freeze(
      topology.bonds.map((bond) => bond.topologyBondIndex),
    ),
    atomIndexPairsByInstance: Object.freeze(
      topology.bonds.map((bond) => Object.freeze([
        bond.atomAIndex,
        bond.atomBIndex,
      ] as const)),
    ),
    geometryResourceKey: 'shared:water-oh-unit-cylinder' as const,
    materialResourceKey: 'shared:water-oh-topology-material' as const,
    gpuObjectPolicy: 'one-instanced-mesh-for-all-water-oh-topology-bonds' as const,
    matrixLayout: 'float32-column-major-mat4' as const,
    semanticRole:
      'topology-adjacency-and-rigid-distance-constraint-not-energetic-bond' as const,
    energeticInteraction: false as const,
    displayRadiusNanometer: 0.012 as const,
    displayScaleBoundary:
      'nonphysical-topology-link-radius-for-visibility-only' as const,
    periodicPlacement:
      'source-unwrapped-oxygen-anchor-plus-cubic-minimum-image-internal-sites' as const,
  });
}

function assertLockedCubicCell(session: AtomisticWorldSessionV045) {
  const expected = [[3, 0, 0], [0, 3, 0], [0, 0, 3]] as const;
  const actual = session.cell.vectorsNanometer;
  for (let vector = 0; vector < 3; vector += 1) {
    const candidate = actual[vector];
    if (!Object.is(candidate.x, expected[vector][0])
      || !Object.is(candidate.y, expected[vector][1])
      || !Object.is(candidate.z, expected[vector][2])) {
      throw new Error('V046 instancing requires the locked 3 nm orthorhombic cell');
    }
  }
}

function requireRuntimePlanData(plan: AtomisticInstancingPlan) {
  if (!plan || typeof plan !== 'object'
    || (plan.schemaVersion !== ATOMISTIC_INSTANCING_PLAN_VERSION_V046
      && plan.schemaVersion !== ATOMISTIC_PRIVATE_INSTANCING_PLAN_VERSION_V047)) {
    throw new Error('atomistic instancing plan is invalid');
  }
  const data = PLAN_RUNTIME_DATA.get(plan);
  if (!data) throw new Error('atomistic instancing plan was not created by the validated factory');
  return data;
}

function copyFixedPositionBytes(value: Uint8Array) {
  if (!(value instanceof Uint8Array)
    || Object.getPrototypeOf(value) !== Uint8Array.prototype
    || value.byteLength !== ATOMISTIC_INSTANCING_F32_POSITION_BYTE_LENGTH_V046) {
    throw new Error('presentation positions must be one intrinsic 32,220-byte Uint8Array');
  }
  let buffer: unknown;
  let resizable = false;
  try {
    buffer = TYPED_ARRAY_BUFFER_GETTER?.call(value);
    resizable = ARRAY_BUFFER_RESIZABLE_GETTER?.call(buffer) === true;
  } catch {
    throw new Error('presentation position bytes do not have stable ArrayBuffer ownership');
  }
  if (!(buffer instanceof ArrayBuffer)
    || Object.getPrototypeOf(buffer) !== ArrayBuffer.prototype || resizable) {
    throw new Error('presentation position bytes must reject shared or resizable buffers');
  }
  try {
    return Uint8Array.prototype.slice.call(value) as Uint8Array;
  } catch {
    throw new Error('presentation position bytes could not be defensively copied');
  }
}

function decodeFiniteF32Positions(bytes: Uint8Array) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const positions = new Float32Array(ATOMISTIC_INSTANCING_COMPONENT_COUNT_V046);
  try {
    for (let index = 0; index < positions.length; index += 1) {
      const value = view.getFloat32(index * Float32Array.BYTES_PER_ELEMENT, true);
      if (!Number.isFinite(value) || Object.is(value, -0)) {
        throw new Error(`presentation position component ${index} is invalid`);
      }
      positions[index] = value;
    }
    return positions;
  } catch (error) {
    FLOAT32_ARRAY_FILL.call(positions, 0);
    throw error;
  }
}

function projectFixedPositionBytes(
  positionBytes: Uint8Array,
  expectedDigest: string,
  plan: AtomisticInstancingPlan,
  data: RuntimePlanData,
  buffers: RuntimeBuffers,
) {
  const ownedBytes = copyFixedPositionBytes(positionBytes);
  let decodedPositions: Float32Array | null = null;
  try {
    const derivedDigest = digestBytes(ownedBytes);
    if (derivedDigest !== expectedDigest) {
      throw new Error('presentation positions derived digest changed');
    }
    decodedPositions = decodeFiniteF32Positions(ownedBytes);
    preflightProjection(data, decodedPositions);
    writeProjection(plan, data, decodedPositions, buffers);
    return derivedDigest;
  } finally {
    UINT8_ARRAY_FILL.call(ownedBytes, 0);
    if (decodedPositions !== null) FLOAT32_ARRAY_FILL.call(decodedPositions, 0);
  }
}

function preflightProjection(data: RuntimePlanData, positions: Float32Array) {
  for (const atom of data.atoms) {
    const [x, y, z] = projectedPosition(atom, positions);
    assertFiniteF32(x, `atom ${atom.atomIndex} x`);
    assertFiniteF32(y, `atom ${atom.atomIndex} y`);
    assertFiniteF32(z, `atom ${atom.atomIndex} z`);
  }
  for (const bond of data.bonds) {
    const [ax, ay, az] = projectedPosition(data.atoms[bond.atomAIndex], positions);
    const [bx, by, bz] = projectedPosition(data.atoms[bond.atomBIndex], positions);
    const length = Math.hypot(bx - ax, by - ay, bz - az);
    if (!Number.isFinite(length) || length <= Number.EPSILON) {
      throw new Error(`topology bond ${bond.topologyBondIndex} has invalid displayed length`);
    }
    assertFiniteF32(length, `topology bond ${bond.topologyBondIndex} length`);
    assertFiniteF32((ax + bx) / 2, `topology bond ${bond.topologyBondIndex} midpoint x`);
    assertFiniteF32((ay + by) / 2, `topology bond ${bond.topologyBondIndex} midpoint y`);
    assertFiniteF32((az + bz) / 2, `topology bond ${bond.topologyBondIndex} midpoint z`);
  }
}

function projectedPosition(atom: TopologyAtom, positions: Float32Array): readonly [number, number, number] {
  const atomOffset = atom.atomIndex * 3;
  if (atom.atomIndex === atom.anchorOxygenIndex) {
    return [positions[atomOffset], positions[atomOffset + 1], positions[atomOffset + 2]];
  }
  const anchorOffset = atom.anchorOxygenIndex * 3;
  const ox = positions[anchorOffset];
  const oy = positions[anchorOffset + 1];
  const oz = positions[anchorOffset + 2];
  return [
    ox + minimumImageCubic(positions[atomOffset] - ox),
    oy + minimumImageCubic(positions[atomOffset + 1] - oy),
    oz + minimumImageCubic(positions[atomOffset + 2] - oz),
  ];
}

function minimumImageCubic(delta: number) {
  return delta - CELL_LENGTH_NANOMETER * Math.round(delta / CELL_LENGTH_NANOMETER);
}

function writeProjection(
  plan: AtomisticInstancingPlan,
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
    const target = batch.element === 'O' ? buffers.atomMatricesO : buffers.atomMatricesH;
    for (let instance = 0; instance < batch.instanceCount; instance += 1) {
      const atomIndex = batch.atomIndicesByInstance[instance];
      const offset = atomIndex * 3;
      writeAtomMatrix(target, instance * 16, batch.displayRadiusNanometer,
        buffers.displayPositions[offset], buffers.displayPositions[offset + 1],
        buffers.displayPositions[offset + 2]);
    }
  }
  for (const bond of data.bonds) {
    const a = bond.atomAIndex * 3;
    const b = bond.atomBIndex * 3;
    writeBondMatrix(buffers.topologyBondMatrices, bond.topologyBondIndex * 16,
      buffers.displayPositions[a], buffers.displayPositions[a + 1], buffers.displayPositions[a + 2],
      buffers.displayPositions[b], buffers.displayPositions[b + 1], buffers.displayPositions[b + 2]);
  }
}

function writeAtomMatrix(target: Float32Array, offset: number, scale: number,
  x: number, y: number, z: number) {
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

function writeBondMatrix(target: Float32Array, offset: number,
  ax: number, ay: number, az: number, bx: number, by: number, bz: number) {
  const dx = bx - ax; const dy = by - ay; const dz = bz - az;
  const length = Math.hypot(dx, dy, dz);
  const ux = dx / length; const uy = dy / length; const uz = dz / length;
  const rx = Math.abs(uy) < 0.9 ? 0 : 1;
  const ry = Math.abs(uy) < 0.9 ? 1 : 0;
  const cx = ry * uz; const cy = -rx * uz; const cz = rx * uy - ry * ux;
  const cl = Math.hypot(cx, cy, cz);
  const xx = cx / cl; const xy = cy / cl; const xz = cz / cl;
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

function assertFiniteF32(value: number, label: string) {
  if (!Number.isFinite(value) || !Number.isFinite(Math.fround(value))) {
    throw new Error(`${label} is not representable as finite float32`);
  }
}

function digestBytes(bytes: Uint8Array) {
  const digest = `sha256:${bytesToHex(sha256(bytes))}`;
  if (!DIGEST.test(digest)) throw new Error('position byte digest is invalid');
  return digest;
}
