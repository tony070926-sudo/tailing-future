import type { Vector3 } from './molecular-interactions.ts';
import type { CoulombExceptionVirialTensorV042 } from '../simulation/periodic-coulomb-exceptions.ts';
import { PeriodicCell, type Int3 } from '../simulation/periodic-cell.ts';
import type { AqueousDynamicsObservationV042 } from '../simulation/aqueous-dynamics-world.ts';
import { digestValue } from '../simulation/digest.ts';
import {
  assertAqueousDynamicsRenderFrameV042,
  getLocallyExecutedAqueousDynamicsRenderTrajectorySampleV043,
  type AqueousDynamicsRenderFrameV042,
  type AqueousDynamicsRenderFrameV043,
  type AqueousDynamicsRenderTrajectoryV043,
} from './aqueous-dynamics-render-frame.ts';

const DISPLAY_RADIUS_BOUNDARY = 'nonphysical-display-radius-for-visibility-only' as const;
const FORCE_DISPLAY_SCALE = 0.002;
const FORCE_COMPONENT_ORDER = Object.freeze([
  'total',
  'ewaldRealSpace',
  'ewaldReciprocalSpace',
  'ewaldSelfCorrection',
  'coulombExceptionCorrection',
  'lennardJonesFinal',
] as const);

const CELL_EDGE_VERTEX_INDICES = Object.freeze([
  [0, 1], [0, 2], [1, 3], [2, 3],
  [0, 4], [1, 5], [2, 6], [3, 7],
  [4, 5], [4, 6], [5, 7], [6, 7],
] as const);

const LAYER_AVAILABILITY = Object.freeze({
  selectableAtoms: 'available-exactly-eight-continuous-molecule-atoms',
  structuralOH: 'available-four-rigid-distance-constraint-cylinders',
  constraintDiagnostic: 'available-two-hh-rigid-distance-constraint-diagnostics-ui-controlled',
  evaluatedLJ: 'available-only-actual-evaluated-plain-cutoff-pairs',
  triclinicCell: 'available-twelve-edges-from-eight-bound-vertices',
  selectedAtomForces: 'available-total-plus-five-source-force-components',
  periodicGhostAtoms: 'not-emitted-continuity-copy-replaces-wrapped-source-placement',
  coulombPairEdges: 'unavailable-not-generated-direct-ewald-has-no-pair-decomposition',
  pressure: 'unavailable-not-generated',
  stress: 'unavailable-not-generated',
  electronCloud: 'unavailable-not-generated-classical-model',
} as const);

type Rgb = readonly [number, number, number];
type ForceComponentName = typeof FORCE_COMPONENT_ORDER[number];

export type AqueousWebglMoleculeGaugeShiftV042 = Readonly<{
  moleculeId: string;
  anchorAtomId: string;
  latticeImageShift: Int3;
  translationAngstrom: Vector3;
}>;

export type AqueousWebglMoleculeGaugeV042 = Readonly<{
  kind: 'sodium-na-anchored-minimum-image-molecule-gauge';
  referenceAtomId: 'sodium-na';
  uniquenessBoundary: 'anchor-distance-strictly-inside-minimum-image-radius';
  moleculeLatticeShifts: ReadonlyArray<AqueousWebglMoleculeGaugeShiftV042>;
}>;

export type AqueousWebglMoleculeGaugeV043 = Readonly<{
  kind: 'source-unwrapped-fixed-trajectory-epoch-gauge';
  gaugeEpoch: 0;
  gaugeEpochBoundary: 'source-unwrapped-images-no-display-rebase';
  sourceCoordinate: 'molecule-anchor-unwrapped-plus-minimum-image-internal-sites';
  globalLatticeImageShift: Readonly<{ x: 0; y: 0; z: 0 }>;
  moleculeLatticeShifts: ReadonlyArray<AqueousWebglMoleculeGaugeShiftV042>;
}>;

export type AqueousWebglAtomSphereV042 = Readonly<{
  primitive: 'sphere';
  id: string;
  atomId: string;
  moleculeId: string;
  element: string;
  positionAngstrom: Vector3;
  latticeImageShiftFromWrapped: Int3;
  selectable: true;
  countsTowardAtomCount: true;
  usesPeriodicContinuityCopy: boolean;
  displayRadiusSceneUnits: number;
  displayRadiusBoundary: typeof DISPLAY_RADIUS_BOUNDARY;
  displayColorRgb: Rgb;
}>;

export type AqueousWebglStructuralOhCylinderV042 = Readonly<{
  primitive: 'cylinder';
  id: string;
  sourceConstraintId: string;
  atomAId: string;
  atomBId: string;
  startAngstrom: Vector3;
  endAngstrom: Vector3;
  displayRadiusSceneUnits: 0.055;
  displayRadiusBoundary: typeof DISPLAY_RADIUS_BOUNDARY;
  displayColorRgb: Rgb;
  energeticInteraction: false;
}>;

export type AqueousWebglDiagnosticHhConstraintSegmentV042 = Readonly<{
  primitive: 'diagnostic-constraint-segment';
  id: string;
  sourceConstraintId: string;
  atomAId: string;
  atomBId: string;
  startAngstrom: Vector3;
  endAngstrom: Vector3;
  renderedDistanceAngstrom: number;
  targetDistanceAngstrom: number;
  role: 'diagnostic-hh-rigid-distance-constraint';
  energeticInteraction: false;
  selectable: false;
  countsTowardAtomCount: false;
  visibilityPolicy: 'ui-controlled-no-projection-default';
  displayLineWidthSceneUnits: 0.02;
  displayColorRgb: Rgb;
}>;

export type AqueousWebglEvaluatedLjSegmentV042 = Readonly<{
  primitive: 'line-segment';
  id: string;
  sourceInteractionId: string;
  atomAId: string;
  atomBId: string;
  startAngstrom: Vector3;
  endAngstrom: Vector3;
  minimumImageDisplacementAngstrom: Vector3;
  imageShiftForB: Int3;
  distanceAngstrom: number;
  mixedSigmaAngstrom: number;
  mixedEpsilonKjMol: number;
  lennardJonesScale: number;
  energyKjMol: number;
  forceOnBKjMolAngstrom: Vector3;
  virialKjMol: CoulombExceptionVirialTensorV042;
  activeForInteractionLayer: true;
  selectable: false;
  countsTowardAtomCount: false;
  displayLineWidthSceneUnits: 0.025;
  displayColorRgb: Rgb;
}>;

export type AqueousWebglCellEdgeV042 = Readonly<{
  primitive: 'line-segment';
  id: string;
  startVertexIndex: number;
  endVertexIndex: number;
  startAngstrom: Vector3;
  endAngstrom: Vector3;
  displayLineWidthSceneUnits: 0.02;
  displayColorRgb: Rgb;
}>;

export type AqueousWebglForceArrowV042 = Readonly<{
  primitive: 'arrow';
  id: string;
  atomId: string;
  component: ForceComponentName;
  originAngstrom: Vector3;
  forceVectorKjMolAngstrom: Vector3;
  endpointScenePosition: Vector3;
  displayScaleSceneUnitsPerKjMolAngstrom: typeof FORCE_DISPLAY_SCALE;
  displayShaftRadiusSceneUnits: 0.018;
  displayRadiusBoundary: typeof DISPLAY_RADIUS_BOUNDARY;
  displayColorRgb: Rgb;
}>;

export type AqueousDynamicsWebglSceneV042 = Readonly<{
  schemaVersion: 'tf.aqueous-dynamics-webgl-scene/0.4.2';
  sourceBinding: Readonly<{
    renderDigest: string;
    observationDigest: string;
    stateDigest: string;
    physicalDigest: string;
    step: 0 | 1;
    selectedAtomId: string | null;
    coordinateGauge: AqueousWebglMoleculeGaugeV042;
  }>;
  sourceBindingDigest: string;
  stateId: string;
  stateDigest: string;
  physicalDigest: string;
  step: 0 | 1;
  timePicoseconds: number;
  projection: Readonly<{
    kind: 'webgl-ready-pure-data-primitives';
    renderingLibraryDependency: null;
    positionUnits: 'angstrom';
    displayRadiusBoundary: typeof DISPLAY_RADIUS_BOUNDARY;
    forceArrowBoundary: 'nonphysical-display-scale-for-visibility-only';
    coordinateGauge: AqueousWebglMoleculeGaugeV042;
  }>;
  sourceFrameLayerAvailability: AqueousDynamicsRenderFrameV042['layerAvailability'];
  unavailableSourceLayers: AqueousDynamicsRenderFrameV042['unavailableLayers'];
  atomSpheres: ReadonlyArray<AqueousWebglAtomSphereV042>;
  structuralOhCylinders: ReadonlyArray<AqueousWebglStructuralOhCylinderV042>;
  diagnosticHhConstraintSegments: ReadonlyArray<AqueousWebglDiagnosticHhConstraintSegmentV042>;
  evaluatedLennardJonesSegments: ReadonlyArray<AqueousWebglEvaluatedLjSegmentV042>;
  triclinicCellEdges: ReadonlyArray<AqueousWebglCellEdgeV042>;
  selectedAtomForces: Readonly<{
    atomId: string;
    originAngstrom: Vector3;
    componentOrder: typeof FORCE_COMPONENT_ORDER;
    arrows: ReadonlyArray<AqueousWebglForceArrowV042>;
  }> | null;
  layerAvailability: typeof LAYER_AVAILABILITY;
  unavailablePrimitives: Readonly<{
    periodicGhostAtomSpheres: null;
    coulombPairEdges: null;
    pressure: null;
    stress: null;
    electronCloud: null;
  }>;
  sceneDigest: string;
}>;

type ScenePayload = Omit<AqueousDynamicsWebglSceneV042, 'sceneDigest'>;

export type AqueousDynamicsWebglSceneV043 = Readonly<
  Omit<
    AqueousDynamicsWebglSceneV042,
    'schemaVersion' | 'sourceBinding' | 'step' | 'projection' | 'sceneDigest'
  > & {
    schemaVersion: 'tf.aqueous-dynamics-webgl-scene/0.4.3';
    sourceBinding: Readonly<{
      renderDigest: string;
      observationDigest: string;
      stateDigest: string;
      physicalDigest: string;
      step: number;
      trajectoryDigest: string;
      trajectoryBundleDigest: string;
      trajectorySampleDigest: string;
      trajectorySampleIndex: number;
      selectedAtomId: string | null;
      coordinateGauge: AqueousWebglMoleculeGaugeV043;
    }>;
    step: number;
    projection: Readonly<
      Omit<AqueousDynamicsWebglSceneV042['projection'], 'coordinateGauge'> & {
        coordinateGauge: AqueousWebglMoleculeGaugeV043;
      }
    >;
    sceneDigest: string;
  }
>;

type ScenePayloadV043 = Omit<AqueousDynamicsWebglSceneV043, 'sceneDigest'>;
type TrajectorySceneBindingV043 = Readonly<{
  trajectoryDigest: string;
  trajectoryBundleDigest: string;
  trajectorySampleDigest: string;
  trajectorySampleIndex: number;
}>;

/** Pure-data WebGL projection. It creates no renderer, canvas, GPU object, or UI state. */
export function createAqueousDynamicsWebglSceneV042(
  frame: AqueousDynamicsRenderFrameV042,
  observation: AqueousDynamicsObservationV042,
  selectedAtomId: string | null = null,
): AqueousDynamicsWebglSceneV042 {
  assertAqueousDynamicsRenderFrameV042(frame, observation);
  return buildExpectedScene(frame, selectedAtomId);
}

/**
 * Selects one exact endpoint from a locally executed or locally replay-validated
 * trajectory. The sample index is display state and cannot advance the solver.
 */
export function createAqueousDynamicsWebglSceneFromTrajectoryV043(
  trajectory: AqueousDynamicsRenderTrajectoryV043,
  sampleIndex: number,
  selectedAtomId: string | null = null,
): AqueousDynamicsWebglSceneV043 {
  const sample = getLocallyExecutedAqueousDynamicsRenderTrajectorySampleV043(
    trajectory,
    sampleIndex,
  );
  return buildExpectedScene(sample.renderFrame, selectedAtomId, {
    trajectoryDigest: trajectory.trajectoryDigest,
    trajectoryBundleDigest: trajectory.bundleDigest,
    trajectorySampleDigest: sample.sampleDigest,
    trajectorySampleIndex: sample.sampleIndex,
  });
}

export function assertAqueousDynamicsWebglSceneV043(
  candidate: unknown,
  trajectory: AqueousDynamicsRenderTrajectoryV043,
  sampleIndex: number,
  selectedAtomId: string | null = null,
): asserts candidate is AqueousDynamicsWebglSceneV043 {
  const expected = createAqueousDynamicsWebglSceneFromTrajectoryV043(
    trajectory,
    sampleIndex,
    selectedAtomId,
  );
  assertExactFrozenDataTree(candidate, expected, 'aqueous trajectory WebGL scene');
}

export function assertAqueousDynamicsWebglSceneV042(
  candidate: unknown,
  frame: AqueousDynamicsRenderFrameV042,
  observation: AqueousDynamicsObservationV042,
  selectedAtomId: string | null = null,
): asserts candidate is AqueousDynamicsWebglSceneV042 {
  assertAqueousDynamicsRenderFrameV042(frame, observation);
  const expected = buildExpectedScene(frame, selectedAtomId);
  assertExactFrozenDataTree(candidate, expected, 'aqueous WebGL scene');
}

function buildExpectedScene(
  frame: AqueousDynamicsRenderFrameV042,
  selectedAtomId: string | null,
): AqueousDynamicsWebglSceneV042;
function buildExpectedScene(
  frame: AqueousDynamicsRenderFrameV043,
  selectedAtomId: string | null,
  trajectoryBinding: TrajectorySceneBindingV043,
): AqueousDynamicsWebglSceneV043;
function buildExpectedScene(
  frame: AqueousDynamicsRenderFrameV042 | AqueousDynamicsRenderFrameV043,
  selectedAtomId: string | null,
  trajectoryBinding?: TrajectorySceneBindingV043,
): AqueousDynamicsWebglSceneV042 | AqueousDynamicsWebglSceneV043 {
  if (selectedAtomId !== null && typeof selectedAtomId !== 'string') {
    throw new TypeError('selected aqueous atom ID must be a string or null');
  }
  const cell = new PeriodicCell(frame.cell.vectorsAngstrom);
  if (trajectoryBinding) {
    if (frame.schemaVersion !== 'tf.aqueous-dynamics-render-frame/0.4.3') {
      throw new Error('aqueous trajectory WebGL projection requires a v0.4.3 frame');
    }
  } else if (frame.schemaVersion !== 'tf.aqueous-dynamics-render-frame/0.4.2') {
    throw new Error('aqueous v0.4.2 WebGL projection requires a v0.4.2 frame');
  }
  const coordinateGauge = trajectoryBinding
    ? buildTrajectoryMoleculeGauge(frame as AqueousDynamicsRenderFrameV043, cell)
    : buildMoleculeGauge(frame as AqueousDynamicsRenderFrameV042, cell);
  const gaugeShiftByMoleculeId = new Map(
    coordinateGauge.moleculeLatticeShifts.map((entry) => [entry.moleculeId, entry]),
  );
  const continuousByAtomId = new Map<string, Readonly<{
    positionAngstrom: Vector3;
    usesPeriodicContinuityCopy: boolean;
    totalLatticeImageShift: Int3;
  }>>();
  for (const molecule of frame.molecules) {
    const moleculeGauge = requireMap(
      gaugeShiftByMoleculeId,
      molecule.id,
      'aqueous molecule gauge shift',
    );
    for (const atom of molecule.continuousAtoms) {
      if (continuousByAtomId.has(atom.atomId)) {
        throw new Error(`continuous molecule atom ${atom.atomId} is duplicated`);
      }
      continuousByAtomId.set(atom.atomId, {
        positionAngstrom: add(atom.positionAngstrom, moleculeGauge.translationAngstrom),
        usesPeriodicContinuityCopy: atom.usesPeriodicContinuityCopy,
        totalLatticeImageShift: addInt3(
          atom.imageShiftFromWrapped,
          moleculeGauge.latticeImageShift,
        ),
      });
    }
  }

  const atomSpheres: AqueousWebglAtomSphereV042[] = frame.atoms.map((atom) => {
    const continuous = requireMap(continuousByAtomId, atom.id, 'continuous render atom');
    return {
      primitive: 'sphere',
      id: `atom-sphere:${atom.id}`,
      atomId: atom.id,
      moleculeId: atom.moleculeId,
      element: atom.element,
      positionAngstrom: cloneVector(continuous.positionAngstrom),
      latticeImageShiftFromWrapped: cloneInt3(continuous.totalLatticeImageShift),
      selectable: true,
      countsTowardAtomCount: true,
      usesPeriodicContinuityCopy: continuous.usesPeriodicContinuityCopy,
      displayRadiusSceneUnits: displayAtomRadius(atom.element),
      displayRadiusBoundary: DISPLAY_RADIUS_BOUNDARY,
      displayColorRgb: displayAtomColor(atom.element),
    };
  });
  if (atomSpheres.length !== 8 || new Set(atomSpheres.map((atom) => atom.atomId)).size !== 8) {
    throw new Error('aqueous WebGL scene must contain exactly eight unique selectable atoms');
  }

  const structuralOhCylinders: AqueousWebglStructuralOhCylinderV042[] =
    frame.structuralOhLinks.map((link) => {
      const translation = requireMap(
        gaugeShiftByMoleculeId,
        link.moleculeId,
        'structural O-H molecule gauge shift',
      ).translationAngstrom;
      return {
        primitive: 'cylinder',
        id: `structural-oh-cylinder:${link.id}`,
        sourceConstraintId: link.id,
        atomAId: link.atomAId,
        atomBId: link.atomBId,
        startAngstrom: add(link.atomAPositionAngstrom, translation),
        endAngstrom: add(link.atomBPositionAngstrom, translation),
        displayRadiusSceneUnits: 0.055,
        displayRadiusBoundary: DISPLAY_RADIUS_BOUNDARY,
        displayColorRgb: [0.76, 0.82, 0.9] as Rgb,
        energeticInteraction: false as const,
      };
    });

  const diagnosticHhConstraintSegments: AqueousWebglDiagnosticHhConstraintSegmentV042[] =
    frame.diagnosticHhEdges.map((edge) => {
      const translation = requireMap(
        gaugeShiftByMoleculeId,
        edge.moleculeId,
        'diagnostic H-H molecule gauge shift',
      ).translationAngstrom;
      return {
        primitive: 'diagnostic-constraint-segment',
        id: `diagnostic-hh-constraint:${edge.id}`,
        sourceConstraintId: edge.id,
        atomAId: edge.atomAId,
        atomBId: edge.atomBId,
        startAngstrom: add(edge.atomAPositionAngstrom, translation),
        endAngstrom: add(edge.atomBPositionAngstrom, translation),
        renderedDistanceAngstrom: edge.renderedDistanceAngstrom,
        targetDistanceAngstrom: edge.targetDistanceAngstrom,
        role: 'diagnostic-hh-rigid-distance-constraint',
        energeticInteraction: false,
        selectable: false,
        countsTowardAtomCount: false,
        visibilityPolicy: 'ui-controlled-no-projection-default',
        displayLineWidthSceneUnits: 0.02,
        displayColorRgb: [0.92, 0.62, 0.24] as Rgb,
      };
    });
  if (diagnosticHhConstraintSegments.length !== 2) {
    throw new Error('aqueous WebGL scene requires exactly two H-H constraint diagnostics');
  }

  const evaluatedLennardJonesSegments: AqueousWebglEvaluatedLjSegmentV042[] =
    frame.lennardJonesPairs
      .filter((pair) => pair.activeForInteractionLayer)
      .map((pair) => {
        if (pair.evaluation !== 'evaluated-plain-cutoff') {
          throw new Error(`active LJ pair ${pair.id} is not an evaluated plain-cutoff interaction`);
        }
        const atomA = frame.atoms.find((atom) => atom.id === pair.atomAId);
        if (!atomA) throw new Error(`active LJ pair ${pair.id} atom A is missing`);
        const moleculeGauge = requireMap(
          gaugeShiftByMoleculeId,
          atomA.moleculeId,
          'active LJ atom-A molecule gauge shift',
        );
        const sourceDisplacement = subtract(
          pair.atomBImagePositionAngstrom,
          pair.atomAPositionAngstrom,
        );
        assertVectorClose(
          sourceDisplacement,
          pair.displacementAngstrom,
          `active LJ pair ${pair.id} source minimum-image displacement`,
        );
        assertScalarClose(
          magnitude(sourceDisplacement),
          pair.distanceAngstrom,
          `active LJ pair ${pair.id} source distance`,
        );
        const startAngstrom = add(
          pair.atomAPositionAngstrom,
          moleculeGauge.translationAngstrom,
        );
        const endAngstrom = add(
          pair.atomBImagePositionAngstrom,
          moleculeGauge.translationAngstrom,
        );
        assertVectorClose(
          subtract(endAngstrom, startAngstrom),
          pair.displacementAngstrom,
          `active LJ pair ${pair.id} display minimum-image displacement`,
        );
        assertScalarClose(
          distance(startAngstrom, endAngstrom),
          pair.distanceAngstrom,
          `active LJ pair ${pair.id} display distance`,
        );
        return {
          primitive: 'line-segment',
          id: `evaluated-lj-segment:${pair.id}`,
          sourceInteractionId: pair.id,
          atomAId: pair.atomAId,
          atomBId: pair.atomBId,
          startAngstrom: cloneVector(startAngstrom),
          endAngstrom: cloneVector(endAngstrom),
          minimumImageDisplacementAngstrom: cloneVector(pair.displacementAngstrom),
          imageShiftForB: cloneInt3(pair.imageShiftForB),
          distanceAngstrom: pair.distanceAngstrom,
          mixedSigmaAngstrom: pair.mixedSigmaAngstrom,
          mixedEpsilonKjMol: pair.mixedEpsilonKjMol,
          lennardJonesScale: pair.lennardJonesScale,
          energyKjMol: pair.energyKjMol,
          forceOnBKjMolAngstrom: cloneVector(pair.forceOnBKjMolAngstrom),
          virialKjMol: { ...pair.virialKjMol },
          activeForInteractionLayer: true,
          selectable: false,
          countsTowardAtomCount: false,
          displayLineWidthSceneUnits: 0.025,
          displayColorRgb: [0.52, 0.72, 1],
        };
      });

  if (frame.cell.verticesAngstrom.length !== 8) {
    throw new Error('aqueous WebGL scene requires exactly eight triclinic cell vertices');
  }
  const triclinicCellEdges: AqueousWebglCellEdgeV042[] = CELL_EDGE_VERTEX_INDICES.map(
    ([startVertexIndex, endVertexIndex], index) => ({
      primitive: 'line-segment',
      id: `triclinic-cell-edge:${index}`,
      startVertexIndex,
      endVertexIndex,
      startAngstrom: cloneVector(frame.cell.verticesAngstrom[startVertexIndex]),
      endAngstrom: cloneVector(frame.cell.verticesAngstrom[endVertexIndex]),
      displayLineWidthSceneUnits: 0.02,
      displayColorRgb: [0.46, 0.5, 0.58],
    }),
  );

  const selectedAtomForces = selectedAtomId === null
    ? null
    : buildSelectedAtomForces(frame, atomSpheres, selectedAtomId);
  const commonPayload = {
    stateId: frame.stateId,
    stateDigest: frame.stateDigest,
    physicalDigest: frame.physicalDigest,
    timePicoseconds: frame.timePicoseconds,
    sourceFrameLayerAvailability: frame.layerAvailability,
    unavailableSourceLayers: frame.unavailableLayers,
    atomSpheres,
    structuralOhCylinders,
    diagnosticHhConstraintSegments,
    evaluatedLennardJonesSegments,
    triclinicCellEdges,
    selectedAtomForces,
    layerAvailability: LAYER_AVAILABILITY,
    unavailablePrimitives: {
      periodicGhostAtomSpheres: null,
      coulombPairEdges: null,
      pressure: null,
      stress: null,
      electronCloud: null,
    },
  } as const;
  if (trajectoryBinding) {
    if (coordinateGauge.kind !== 'source-unwrapped-fixed-trajectory-epoch-gauge') {
      throw new Error('aqueous trajectory WebGL projection did not use the fixed source gauge');
    }
    const sourceBinding = {
      renderDigest: frame.renderDigest,
      observationDigest: frame.sourceBinding.observationDigest,
      stateDigest: frame.stateDigest,
      physicalDigest: frame.physicalDigest,
      step: frame.step,
      ...trajectoryBinding,
      selectedAtomId,
      coordinateGauge,
    };
    const payload: ScenePayloadV043 = {
      schemaVersion: 'tf.aqueous-dynamics-webgl-scene/0.4.3',
      sourceBinding,
      sourceBindingDigest: digestValue(sourceBinding),
      step: frame.step,
      projection: {
        kind: 'webgl-ready-pure-data-primitives',
        renderingLibraryDependency: null,
        positionUnits: 'angstrom',
        displayRadiusBoundary: DISPLAY_RADIUS_BOUNDARY,
        forceArrowBoundary: 'nonphysical-display-scale-for-visibility-only',
        coordinateGauge,
      },
      ...commonPayload,
    };
    return deepFreeze({ ...payload, sceneDigest: digestValue(payload) });
  }
  if (coordinateGauge.kind !== 'sodium-na-anchored-minimum-image-molecule-gauge'
    || frame.schemaVersion !== 'tf.aqueous-dynamics-render-frame/0.4.2') {
    throw new Error('aqueous v0.4.2 WebGL projection did not use its locked coordinate gauge');
  }
  const sourceBinding = {
    renderDigest: frame.renderDigest,
    observationDigest: frame.sourceBinding.observationDigest,
    stateDigest: frame.stateDigest,
    physicalDigest: frame.physicalDigest,
    step: frame.step,
    selectedAtomId,
    coordinateGauge,
  };
  const payload: ScenePayload = {
    schemaVersion: 'tf.aqueous-dynamics-webgl-scene/0.4.2',
    sourceBinding,
    sourceBindingDigest: digestValue(sourceBinding),
    step: frame.step,
    projection: {
      kind: 'webgl-ready-pure-data-primitives',
      renderingLibraryDependency: null,
      positionUnits: 'angstrom',
      displayRadiusBoundary: DISPLAY_RADIUS_BOUNDARY,
      forceArrowBoundary: 'nonphysical-display-scale-for-visibility-only',
      coordinateGauge,
    },
    ...commonPayload,
  };
  return deepFreeze({ ...payload, sceneDigest: digestValue(payload) });
}

function buildMoleculeGauge(
  frame: AqueousDynamicsRenderFrameV042,
  cell: PeriodicCell,
): AqueousWebglMoleculeGaugeV042 {
  const referenceAtom = frame.atoms.find((atom) => atom.id === 'sodium-na');
  if (!referenceAtom) throw new Error('aqueous WebGL molecule gauge requires sodium-na');
  const atomById = new Map(frame.atoms.map((atom) => [atom.id, atom]));
  const seenMoleculeIds = new Set<string>();
  const moleculeLatticeShifts = frame.molecules.map((molecule) => {
    if (seenMoleculeIds.has(molecule.id)) {
      throw new Error(`aqueous WebGL molecule gauge duplicates molecule ${molecule.id}`);
    }
    seenMoleculeIds.add(molecule.id);
    const anchorAtomId = molecule.oxygenAnchorAtomId ?? molecule.atomIds[0];
    if (!anchorAtomId) {
      throw new Error(`aqueous WebGL molecule gauge has no anchor for ${molecule.id}`);
    }
    const anchorAtom = requireMap(
      atomById,
      anchorAtomId,
      'aqueous WebGL molecule gauge anchor atom',
    );
    if (anchorAtom.moleculeId !== molecule.id) {
      throw new Error(`aqueous WebGL molecule gauge anchor ${anchorAtomId} has the wrong molecule`);
    }
    const minimumImage = cell.minimumImageFromCartesian(
      referenceAtom.wrappedPositionAngstrom,
      anchorAtom.wrappedPositionAngstrom,
    );
    const boundaryTolerance = Math.max(
      1,
      cell.minimumImageRadiusAngstrom,
      minimumImage.distanceAngstrom,
    ) * Number.EPSILON * 256;
    if (!(minimumImage.distanceAngstrom < cell.minimumImageRadiusAngstrom - boundaryTolerance)) {
      throw new Error(
        `aqueous WebGL molecule gauge anchor ${anchorAtomId} is not strictly inside the unique minimum-image radius`,
      );
    }
    const latticeImageShift = cloneInt3(minimumImage.imageShiftForTarget);
    const translationAngstrom = cloneVector(cell.latticeVector(latticeImageShift));
    assertVectorClose(
      subtract(add(anchorAtom.wrappedPositionAngstrom, translationAngstrom), referenceAtom.wrappedPositionAngstrom),
      minimumImage.displacementAngstrom,
      `aqueous WebGL molecule gauge anchor ${anchorAtomId}`,
    );
    return {
      moleculeId: molecule.id,
      anchorAtomId,
      latticeImageShift,
      translationAngstrom,
    };
  });
  if (moleculeLatticeShifts.length !== frame.molecules.length) {
    throw new Error('aqueous WebGL molecule gauge did not cover every molecule');
  }
  return {
    kind: 'sodium-na-anchored-minimum-image-molecule-gauge',
    referenceAtomId: 'sodium-na',
    uniquenessBoundary: 'anchor-distance-strictly-inside-minimum-image-radius',
    moleculeLatticeShifts,
  };
}

function buildTrajectoryMoleculeGauge(
  frame: AqueousDynamicsRenderFrameV043,
  cell: PeriodicCell,
): AqueousWebglMoleculeGaugeV043 {
  const atomById = new Map(frame.atoms.map((atom) => [atom.id, atom]));
  const seenMoleculeIds = new Set<string>();
  const moleculeLatticeShifts = frame.molecules.map((molecule) => {
    if (seenMoleculeIds.has(molecule.id)) {
      throw new Error(`aqueous trajectory WebGL gauge duplicates molecule ${molecule.id}`);
    }
    seenMoleculeIds.add(molecule.id);
    const anchorAtomId = molecule.oxygenAnchorAtomId ?? molecule.atomIds[0];
    if (!anchorAtomId) {
      throw new Error(`aqueous trajectory WebGL gauge has no anchor for ${molecule.id}`);
    }
    const anchorAtom = requireMap(
      atomById,
      anchorAtomId,
      'aqueous trajectory WebGL gauge anchor atom',
    );
    const anchorPlacement = molecule.continuousAtoms.find((atom) => atom.atomId === anchorAtomId);
    if (!anchorPlacement || anchorAtom.moleculeId !== molecule.id) {
      throw new Error(`aqueous trajectory WebGL gauge anchor ${anchorAtomId} is inconsistent`);
    }
    const latticeImageShift = cloneInt3(anchorAtom.image);
    const translationAngstrom = cloneVector(cell.latticeVector(latticeImageShift));
    assertVectorClose(
      add(anchorAtom.wrappedPositionAngstrom, translationAngstrom),
      anchorAtom.unwrappedPositionAngstrom,
      `aqueous trajectory WebGL source-unwrapped anchor ${anchorAtomId}`,
    );
    assertVectorClose(
      add(anchorPlacement.positionAngstrom, translationAngstrom),
      anchorAtom.unwrappedPositionAngstrom,
      `aqueous trajectory WebGL fixed-epoch molecule anchor ${anchorAtomId}`,
    );
    return {
      moleculeId: molecule.id,
      anchorAtomId,
      latticeImageShift,
      translationAngstrom,
    };
  });
  if (moleculeLatticeShifts.length !== frame.molecules.length) {
    throw new Error('aqueous trajectory WebGL gauge did not cover every molecule');
  }
  return {
    kind: 'source-unwrapped-fixed-trajectory-epoch-gauge',
    gaugeEpoch: 0,
    gaugeEpochBoundary: 'source-unwrapped-images-no-display-rebase',
    sourceCoordinate: 'molecule-anchor-unwrapped-plus-minimum-image-internal-sites',
    globalLatticeImageShift: { x: 0, y: 0, z: 0 },
    moleculeLatticeShifts,
  };
}

function buildSelectedAtomForces(
  frame: AqueousDynamicsRenderFrameV042 | AqueousDynamicsRenderFrameV043,
  atomSpheres: ReadonlyArray<AqueousWebglAtomSphereV042>,
  atomId: string,
) {
  const atom = frame.atoms.find((candidate) => candidate.id === atomId);
  const sphere = atomSpheres.find((candidate) => candidate.atomId === atomId);
  if (!atom || !sphere) throw new Error(`selected aqueous atom ${atomId} is unavailable`);
  const vectors: Readonly<Record<ForceComponentName, Vector3>> = {
    total: atom.forceKjMolAngstrom,
    ewaldRealSpace: atom.forceComponentsKjMolAngstrom.ewaldRealSpace,
    ewaldReciprocalSpace: atom.forceComponentsKjMolAngstrom.ewaldReciprocalSpace,
    ewaldSelfCorrection: atom.forceComponentsKjMolAngstrom.ewaldSelfCorrection,
    coulombExceptionCorrection: atom.forceComponentsKjMolAngstrom.coulombExceptionCorrection,
    lennardJonesFinal: atom.forceComponentsKjMolAngstrom.lennardJonesFinal,
  };
  const arrows: AqueousWebglForceArrowV042[] = FORCE_COMPONENT_ORDER.map((component) => {
    const vector = vectors[component];
    return {
      primitive: 'arrow',
      id: `selected-force:${atomId}:${component}`,
      atomId,
      component,
      originAngstrom: cloneVector(sphere.positionAngstrom),
      forceVectorKjMolAngstrom: cloneVector(vector),
      endpointScenePosition: add(sphere.positionAngstrom, scale(vector, FORCE_DISPLAY_SCALE)),
      displayScaleSceneUnitsPerKjMolAngstrom: FORCE_DISPLAY_SCALE,
      displayShaftRadiusSceneUnits: 0.018,
      displayRadiusBoundary: DISPLAY_RADIUS_BOUNDARY,
      displayColorRgb: displayForceColor(component),
    };
  });
  return {
    atomId,
    originAngstrom: cloneVector(sphere.positionAngstrom),
    componentOrder: FORCE_COMPONENT_ORDER,
    arrows,
  };
}

function displayAtomRadius(element: string) {
  if (element === 'H') return 0.18;
  if (element === 'O') return 0.3;
  if (element === 'Na') return 0.36;
  if (element === 'Cl') return 0.42;
  throw new Error(`aqueous WebGL atom element ${element} has no locked display radius`);
}

function displayAtomColor(element: string): Rgb {
  if (element === 'H') return [0.92, 0.95, 1];
  if (element === 'O') return [0.92, 0.16, 0.2];
  if (element === 'Na') return [0.48, 0.34, 0.92];
  if (element === 'Cl') return [0.24, 0.78, 0.34];
  throw new Error(`aqueous WebGL atom element ${element} has no locked display color`);
}

function displayForceColor(component: ForceComponentName): Rgb {
  if (component === 'total') return [1, 0.88, 0.2];
  if (component === 'ewaldRealSpace') return [1, 0.34, 0.28];
  if (component === 'ewaldReciprocalSpace') return [0.3, 0.62, 1];
  if (component === 'ewaldSelfCorrection') return [0.7, 0.42, 0.92];
  if (component === 'coulombExceptionCorrection') return [0.94, 0.55, 0.2];
  return [0.34, 0.84, 0.56];
}

function assertExactFrozenDataTree(actual: unknown, expected: unknown, label: string) {
  const compare = (left: unknown, right: unknown, path: string): void => {
    if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') {
      if (!Object.is(left, right)) throw new Error(`${path} primitive value is not exact`);
      return;
    }
    if (Array.isArray(left) !== Array.isArray(right)
      || Object.getPrototypeOf(left) !== Object.getPrototypeOf(right)) {
      throw new Error(`${path} data-tree kind or prototype is not exact`);
    }
    if (!Object.isFrozen(left) || !Object.isFrozen(right)) {
      throw new Error(`${path} data tree must be recursively frozen`);
    }
    const leftKeys = Reflect.ownKeys(left);
    const rightKeys = Reflect.ownKeys(right);
    if (leftKeys.some((key) => typeof key !== 'string')
      || rightKeys.some((key) => typeof key !== 'string')
      || leftKeys.length !== rightKeys.length
      || leftKeys.some((key, index) => key !== rightKeys[index])) {
      throw new Error(`${path} own-key sequence is not exact`);
    }
    const leftDescriptors = Object.getOwnPropertyDescriptors(left);
    const rightDescriptors = Object.getOwnPropertyDescriptors(right);
    for (const key of leftKeys as string[]) {
      const leftDescriptor = leftDescriptors[key];
      const rightDescriptor = rightDescriptors[key];
      if (!leftDescriptor || !rightDescriptor
        || !Object.prototype.hasOwnProperty.call(leftDescriptor, 'value')
        || !Object.prototype.hasOwnProperty.call(rightDescriptor, 'value')) {
        throw new Error(`${path}.${key} must be an own data property`);
      }
      if (leftDescriptor.enumerable !== rightDescriptor.enumerable
        || leftDescriptor.configurable !== rightDescriptor.configurable
        || leftDescriptor.writable !== rightDescriptor.writable) {
        throw new Error(`${path}.${key} property descriptor is not exact`);
      }
      compare(leftDescriptor.value, rightDescriptor.value, `${path}.${key}`);
    }
  };
  compare(actual, expected, label);
}

function requireMap<Key, Value>(map: ReadonlyMap<Key, Value>, key: Key, label: string): Value {
  const value = map.get(key);
  if (value === undefined) throw new Error(`${label} ${String(key)} is missing`);
  return value;
}

function cloneVector(vector: Vector3): Vector3 {
  return { x: canonicalZero(vector.x), y: canonicalZero(vector.y), z: canonicalZero(vector.z) };
}

function cloneInt3(vector: Int3): Int3 {
  return { x: canonicalZero(vector.x), y: canonicalZero(vector.y), z: canonicalZero(vector.z) };
}

function add(left: Vector3, right: Vector3): Vector3 {
  return cloneVector({ x: left.x + right.x, y: left.y + right.y, z: left.z + right.z });
}

function subtract(left: Vector3, right: Vector3): Vector3 {
  return cloneVector({ x: left.x - right.x, y: left.y - right.y, z: left.z - right.z });
}

function addInt3(left: Int3, right: Int3): Int3 {
  return cloneInt3({ x: left.x + right.x, y: left.y + right.y, z: left.z + right.z });
}

function scale(vector: Vector3, factor: number): Vector3 {
  return cloneVector({ x: vector.x * factor, y: vector.y * factor, z: vector.z * factor });
}

function magnitude(vector: Vector3) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function distance(left: Vector3, right: Vector3) {
  return magnitude(subtract(left, right));
}

function assertVectorClose(actual: Vector3, expected: Vector3, label: string) {
  assertScalarClose(actual.x, expected.x, `${label}.x`);
  assertScalarClose(actual.y, expected.y, `${label}.y`);
  assertScalarClose(actual.z, expected.z, `${label}.z`);
}

function assertScalarClose(actual: number, expected: number, label: string) {
  const tolerance = Math.max(1, Math.abs(actual), Math.abs(expected)) * Number.EPSILON * 512;
  if (!Number.isFinite(actual) || !Number.isFinite(expected) || Math.abs(actual - expected) > tolerance) {
    throw new Error(`${label} is not preserved by the WebGL coordinate gauge`);
  }
}

function canonicalZero(value: number) { return Object.is(value, -0) ? 0 : value; }

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
