import { beforeAll, describe, expect, it } from 'vitest';
import { createNaClTip3pFiniteSizeCalibrationWorldV042 } from '../simulation/aqueous-dynamics-world.ts';
import { digestValue } from '../simulation/digest.ts';
import { PeriodicCell } from '../simulation/periodic-cell.ts';
import { createAqueousDynamicsRenderFrameV042 } from './aqueous-dynamics-render-frame.ts';
import {
  assertAqueousDynamicsWebglSceneV042,
  createAqueousDynamicsWebglSceneV042,
  type AqueousDynamicsWebglSceneV042,
} from './aqueous-dynamics-webgl-scene.ts';

type Mutable<Value> = { -readonly [Key in keyof Value]: Value[Key] };

const SELECTED_ATOM_ID = 'water-a-h1';

let fixture: ReturnType<typeof createNaClTip3pFiniteSizeCalibrationWorldV042>;
let initialObservation: ReturnType<typeof fixture.observe>;
let oneStepObservation: ReturnType<typeof fixture.observe>;
let initialFrame: ReturnType<typeof createAqueousDynamicsRenderFrameV042>;
let oneStepFrame: ReturnType<typeof createAqueousDynamicsRenderFrameV042>;
let initialScene: AqueousDynamicsWebglSceneV042;
let selectedScene: AqueousDynamicsWebglSceneV042;

beforeAll(() => {
  fixture = createNaClTip3pFiniteSizeCalibrationWorldV042();
  initialObservation = fixture.observe();
  oneStepObservation = fixture.advance();
  initialFrame = createAqueousDynamicsRenderFrameV042(initialObservation);
  oneStepFrame = createAqueousDynamicsRenderFrameV042(oneStepObservation);
  initialScene = createAqueousDynamicsWebglSceneV042(initialFrame, initialObservation);
  selectedScene = createAqueousDynamicsWebglSceneV042(
    oneStepFrame,
    oneStepObservation,
    SELECTED_ATOM_ID,
  );
});

describe('aqueous dynamics pure-data WebGL scene projection', () => {
  it('binds deterministic step-0 and step-1 scenes to their validated render frames', () => {
    for (const [frame, observation, scene] of [
      [initialFrame, initialObservation, initialScene],
      [oneStepFrame, oneStepObservation, selectedScene],
    ] as const) {
      expect(scene.step).toBe(frame.step);
      expect(scene.stateDigest).toBe(frame.stateDigest);
      expect(scene.physicalDigest).toBe(frame.physicalDigest);
      expect(scene.sourceBinding).toMatchObject({
        renderDigest: frame.renderDigest,
        observationDigest: observation.observationDigest,
      });
      expect(scene.sourceBindingDigest).toBe(digestValue(scene.sourceBinding));
      const { sceneDigest, ...payload } = scene;
      expect(sceneDigest).toBe(digestValue(payload));
      expect(() => assertAqueousDynamicsWebglSceneV042(
        scene,
        frame,
        observation,
        scene.sourceBinding.selectedAtomId,
      )).not.toThrow();
    }
    expect(createAqueousDynamicsWebglSceneV042(initialFrame, initialObservation)).toEqual(initialScene);
    expect(selectedScene.sceneDigest).not.toBe(initialScene.sceneDigest);
  });

  it('emits exactly 8 selectable continuous atoms without periodic-ghost duplication', () => {
    for (const [frame, scene] of [[initialFrame, initialScene], [oneStepFrame, selectedScene]] as const) {
      expect(scene.atomSpheres).toHaveLength(8);
      expect(new Set(scene.atomSpheres.map((atom) => atom.atomId)).size).toBe(8);
      expect(scene.atomSpheres.every((atom) => atom.selectable && atom.countsTowardAtomCount)).toBe(true);
      expect(scene.atomSpheres.map((atom) => atom.atomId)).toEqual(frame.atoms.map((atom) => atom.id));
      const continuous = new Map(frame.molecules.flatMap((molecule) => molecule.continuousAtoms)
        .map((atom) => [atom.atomId, atom] as const));
      for (const sphere of scene.atomSpheres) {
        const placement = continuous.get(sphere.atomId)!;
        const moleculeGauge = gaugeForMolecule(scene, sphere.moleculeId);
        expect(sphere.positionAngstrom).toEqual(add(
          placement.positionAngstrom,
          moleculeGauge.translationAngstrom,
        ));
        expect(sphere.latticeImageShiftFromWrapped).toEqual(addInt3(
          placement.imageShiftFromWrapped,
          moleculeGauge.latticeImageShift,
        ));
        expect(sphere.usesPeriodicContinuityCopy).toBe(placement.usesPeriodicContinuityCopy);
      }
      for (const ghost of frame.periodicGhosts) {
        const replacementSphere = scene.atomSpheres.find((atom) => atom.atomId === ghost.sourceAtomId)!;
        const moleculeGauge = gaugeForMolecule(scene, ghost.moleculeId);
        expect(replacementSphere.positionAngstrom).toEqual(add(
          ghost.ghostPositionAngstrom,
          moleculeGauge.translationAngstrom,
        ));
        expect(replacementSphere.usesPeriodicContinuityCopy).toBe(true);
      }
      expect(scene.unavailablePrimitives.periodicGhostAtomSpheres).toBeNull();
    }
  });

  it('places every intact molecule in a sodium-anchored unique minimum-image gauge', () => {
    for (const [frame, scene] of [[initialFrame, initialScene], [oneStepFrame, selectedScene]] as const) {
      expect(scene.sourceBinding.coordinateGauge).toBe(scene.projection.coordinateGauge);
      expect(scene.projection.coordinateGauge).toMatchObject({
        kind: 'sodium-na-anchored-minimum-image-molecule-gauge',
        referenceAtomId: 'sodium-na',
        uniquenessBoundary: 'anchor-distance-strictly-inside-minimum-image-radius',
      });
      const shifts = Object.fromEntries(scene.projection.coordinateGauge.moleculeLatticeShifts
        .map((entry) => [entry.moleculeId, entry.latticeImageShift]));
      expect(shifts).toEqual({
        'water-a': { x: -1, y: 0, z: 0 },
        'water-b': { x: 0, y: 0, z: 0 },
        sodium: { x: 0, y: 0, z: 0 },
        chloride: { x: 0, y: 0, z: 0 },
      });
      const cell = new PeriodicCell(frame.cell.vectorsAngstrom);
      const sodium = scene.atomSpheres.find((atom) => atom.atomId === 'sodium-na')!;
      for (const molecule of frame.molecules) {
        const gauge = gaugeForMolecule(scene, molecule.id);
        const anchor = scene.atomSpheres.find((atom) => atom.atomId === gauge.anchorAtomId)!;
        expect(distance(anchor.positionAngstrom, sodium.positionAngstrom))
          .toBeLessThan(cell.minimumImageRadiusAngstrom);
        expect(gauge.translationAngstrom).toEqual(cell.latticeVector(gauge.latticeImageShift));
      }
      expect(scene.sourceBindingDigest).toBe(digestValue(scene.sourceBinding));
    }
  });

  it('emits four structural O-H cylinders, actual evaluated LJ pairs, and twelve cell edges', () => {
    for (const [frame, scene] of [[initialFrame, initialScene], [oneStepFrame, selectedScene]] as const) {
      expect(scene.structuralOhCylinders).toHaveLength(4);
      expect(scene.evaluatedLennardJonesSegments).toHaveLength(
        frame.lennardJonesPairs.filter((pair) => pair.activeForInteractionLayer).length,
      );
      expect(scene.triclinicCellEdges).toHaveLength(12);
      for (const cylinder of scene.structuralOhCylinders) {
        const source = frame.structuralOhLinks
          .find((link) => link.id === cylinder.sourceConstraintId)!;
        const translation = gaugeForMolecule(scene, source.moleculeId).translationAngstrom;
        expect(cylinder.startAngstrom).toEqual(add(source.atomAPositionAngstrom, translation));
        expect(cylinder.endAngstrom).toEqual(add(source.atomBPositionAngstrom, translation));
        expect(cylinder.energeticInteraction).toBe(false);
      }
      for (const segment of scene.evaluatedLennardJonesSegments) {
        const source = frame.lennardJonesPairs
          .find((pair) => pair.id === segment.sourceInteractionId)!;
        const atomA = frame.atoms.find((atom) => atom.id === source.atomAId)!;
        const translation = gaugeForMolecule(scene, atomA.moleculeId).translationAngstrom;
        expect(source.evaluation).toBe('evaluated-plain-cutoff');
        expect(segment.startAngstrom).toEqual(add(source.atomAPositionAngstrom, translation));
        expect(segment.endAngstrom).toEqual(add(source.atomBImagePositionAngstrom, translation));
        expect(segment.minimumImageDisplacementAngstrom).toEqual(source.displacementAngstrom);
        expect(segment.imageShiftForB).toEqual(source.imageShiftForB);
        expect(subtract(segment.endAngstrom, segment.startAngstrom).x)
          .toBeCloseTo(source.displacementAngstrom.x, 12);
        expect(subtract(segment.endAngstrom, segment.startAngstrom).y)
          .toBeCloseTo(source.displacementAngstrom.y, 12);
        expect(subtract(segment.endAngstrom, segment.startAngstrom).z)
          .toBeCloseTo(source.displacementAngstrom.z, 12);
        expect(distance(segment.startAngstrom, segment.endAngstrom))
          .toBeCloseTo(source.distanceAngstrom, 12);
        expect(segment.energyKjMol).toBe(source.energyKjMol);
        expect(segment.forceOnBKjMolAngstrom).toEqual(source.forceOnBKjMolAngstrom);
        expect(segment.virialKjMol).toEqual(source.virialKjMol);
      }
      for (const edge of scene.triclinicCellEdges) {
        expect(edge.startAngstrom).toEqual(frame.cell.verticesAngstrom[edge.startVertexIndex]);
        expect(edge.endAngstrom).toEqual(frame.cell.verticesAngstrom[edge.endVertexIndex]);
      }
    }
  });

  it('emits exactly two independent H-H constraint diagnostics with exact endpoints and no energy semantics', () => {
    for (const [frame, scene] of [[initialFrame, initialScene], [oneStepFrame, selectedScene]] as const) {
      expect(scene.structuralOhCylinders).toHaveLength(4);
      expect(scene.diagnosticHhConstraintSegments).toHaveLength(2);
      for (const diagnostic of scene.diagnosticHhConstraintSegments) {
        const source = frame.diagnosticHhEdges
          .find((edge) => edge.id === diagnostic.sourceConstraintId)!;
        const translation = gaugeForMolecule(scene, source.moleculeId).translationAngstrom;
        expect(diagnostic.startAngstrom).toEqual(add(source.atomAPositionAngstrom, translation));
        expect(diagnostic.endAngstrom).toEqual(add(source.atomBPositionAngstrom, translation));
        expect(diagnostic.renderedDistanceAngstrom).toBe(source.renderedDistanceAngstrom);
        expect(diagnostic.targetDistanceAngstrom).toBe(source.targetDistanceAngstrom);
        expect(diagnostic).toMatchObject({
          primitive: 'diagnostic-constraint-segment',
          role: 'diagnostic-hh-rigid-distance-constraint',
          energeticInteraction: false,
          selectable: false,
          countsTowardAtomCount: false,
          visibilityPolicy: 'ui-controlled-no-projection-default',
        });
        expect(frame.atoms.find((atom) => atom.id === diagnostic.atomAId)?.element).toBe('H');
        expect(frame.atoms.find((atom) => atom.id === diagnostic.atomBId)?.element).toBe('H');
        expect(Object.isFrozen(diagnostic)).toBe(true);
        expect(Object.isFrozen(diagnostic.startAngstrom)).toBe(true);
      }
    }
  });

  it('projects the selected atom total force and five ordered force components', () => {
    expect(initialScene.selectedAtomForces).toBeNull();
    const selection = selectedScene.selectedAtomForces!;
    expect(selection.atomId).toBe(SELECTED_ATOM_ID);
    expect(selection.componentOrder).toEqual([
      'total',
      'ewaldRealSpace',
      'ewaldReciprocalSpace',
      'ewaldSelfCorrection',
      'coulombExceptionCorrection',
      'lennardJonesFinal',
    ]);
    expect(selection.arrows).toHaveLength(6);
    const sourceAtom = oneStepFrame.atoms.find((atom) => atom.id === SELECTED_ATOM_ID)!;
    const expectedVectors = {
      total: sourceAtom.forceKjMolAngstrom,
      ewaldRealSpace: sourceAtom.forceComponentsKjMolAngstrom.ewaldRealSpace,
      ewaldReciprocalSpace: sourceAtom.forceComponentsKjMolAngstrom.ewaldReciprocalSpace,
      ewaldSelfCorrection: sourceAtom.forceComponentsKjMolAngstrom.ewaldSelfCorrection,
      coulombExceptionCorrection: sourceAtom.forceComponentsKjMolAngstrom.coulombExceptionCorrection,
      lennardJonesFinal: sourceAtom.forceComponentsKjMolAngstrom.lennardJonesFinal,
    };
    for (const arrow of selection.arrows) {
      expect(arrow.originAngstrom).toEqual(selection.originAngstrom);
      expect(arrow.forceVectorKjMolAngstrom).toEqual(expectedVectors[arrow.component]);
      expect(arrow.endpointScenePosition).toEqual(add(
        selection.originAngstrom,
        scale(arrow.forceVectorKjMolAngstrom, arrow.displayScaleSceneUnitsPerKjMolAngstrom),
      ));
    }
    expect(() => createAqueousDynamicsWebglSceneV042(
      oneStepFrame,
      oneStepObservation,
      'not-an-atom',
    )).toThrow(/selected aqueous atom/);
  });

  it('labels every visual radius as a nonphysical display radius and fails forbidden layers closed', () => {
    expect(selectedScene.projection).toMatchObject({
      renderingLibraryDependency: null,
      displayRadiusBoundary: 'nonphysical-display-radius-for-visibility-only',
      forceArrowBoundary: 'nonphysical-display-scale-for-visibility-only',
    });
    for (const primitive of [...selectedScene.atomSpheres, ...selectedScene.structuralOhCylinders]) {
      expect(primitive.displayRadiusSceneUnits).toBeGreaterThan(0);
      expect(primitive.displayRadiusBoundary).toBe('nonphysical-display-radius-for-visibility-only');
    }
    expect(selectedScene.layerAvailability).toMatchObject({
      constraintDiagnostic: 'available-two-hh-rigid-distance-constraint-diagnostics-ui-controlled',
      periodicGhostAtoms: 'not-emitted-continuity-copy-replaces-wrapped-source-placement',
      coulombPairEdges: 'unavailable-not-generated-direct-ewald-has-no-pair-decomposition',
      pressure: 'unavailable-not-generated',
      stress: 'unavailable-not-generated',
      electronCloud: 'unavailable-not-generated-classical-model',
    });
    expect(selectedScene.sourceFrameLayerAvailability).toEqual(oneStepFrame.layerAvailability);
    expect(selectedScene.unavailableSourceLayers).toEqual(oneStepFrame.unavailableLayers);
    expect(Object.keys(selectedScene.unavailableSourceLayers)).toEqual([
      'trajectory',
      'coulombPairInteractions',
      'electricField',
      'electronDensity',
      'orbital',
      'electrostaticPotential',
      'pressureBar',
      'totalStressKjMolAngstrom3',
      'localVirialByAtom',
      'bondOrder',
      'reaction',
    ]);
    expect(Object.values(selectedScene.unavailableSourceLayers).every((value) => value === null))
      .toBe(true);
    expect(Object.values(selectedScene.unavailablePrimitives).every((value) => value === null)).toBe(true);
  });

  it('deep-freezes all primitives and leaves the frame unchanged', () => {
    const before = structuredClone(oneStepFrame);
    const scene = createAqueousDynamicsWebglSceneV042(
      oneStepFrame,
      oneStepObservation,
      SELECTED_ATOM_ID,
    );
    expect(oneStepFrame).toEqual(before);
    expect(Object.isFrozen(scene)).toBe(true);
    expect(Object.isFrozen(scene.atomSpheres)).toBe(true);
    expect(Object.isFrozen(scene.atomSpheres[0].positionAngstrom)).toBe(true);
    expect(Object.isFrozen(scene.structuralOhCylinders[0])).toBe(true);
    expect(Object.isFrozen(scene.diagnosticHhConstraintSegments[0])).toBe(true);
    expect(Object.isFrozen(scene.evaluatedLennardJonesSegments[0].virialKjMol)).toBe(true);
    expect(Object.isFrozen(scene.selectedAtomForces?.arrows[0])).toBe(true);
  });

  it('rejects a mutable or forged render frame before projection', () => {
    const mutableFrame = structuredClone(initialFrame);
    expect(() => createAqueousDynamicsWebglSceneV042(
      mutableFrame,
      initialObservation,
    )).toThrow(/recursively frozen/);

    const forgedFrame = structuredClone(initialFrame) as Mutable<typeof initialFrame>;
    forgedFrame.renderDigest = `sha256:${'0'.repeat(64)}`;
    deepFreezeFixture(forgedFrame);
    expect(() => createAqueousDynamicsWebglSceneV042(
      forgedFrame,
      initialObservation,
    )).toThrow(/renderDigest primitive value is not exact/);
  });

  it('rejects mutable scenes and self-redigested primitive tampering', () => {
    const mutableScene = structuredClone(selectedScene);
    expect(() => assertAqueousDynamicsWebglSceneV042(
      mutableScene,
      oneStepFrame,
      oneStepObservation,
      SELECTED_ATOM_ID,
    )).toThrow(/recursively frozen/);

    const forged = structuredClone(selectedScene) as Mutable<AqueousDynamicsWebglSceneV042>;
    const atoms = forged.atomSpheres as Array<Mutable<
      AqueousDynamicsWebglSceneV042['atomSpheres'][number]
    >>;
    atoms[0].displayRadiusSceneUnits += 1;
    const { sceneDigest: ignoredDigest, ...payload } = forged;
    void ignoredDigest;
    forged.sceneDigest = digestValue(payload);
    deepFreezeFixture(forged);
    expect(() => assertAqueousDynamicsWebglSceneV042(
      forged,
      oneStepFrame,
      oneStepObservation,
      SELECTED_ATOM_ID,
    )).toThrow(/displayRadiusSceneUnits primitive value is not exact/);
  });
});

function add(
  left: Readonly<{ x: number; y: number; z: number }>,
  right: Readonly<{ x: number; y: number; z: number }>,
) {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function scale(vector: Readonly<{ x: number; y: number; z: number }>, factor: number) {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

function subtract(
  left: Readonly<{ x: number; y: number; z: number }>,
  right: Readonly<{ x: number; y: number; z: number }>,
) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function addInt3(
  left: Readonly<{ x: number; y: number; z: number }>,
  right: Readonly<{ x: number; y: number; z: number }>,
) {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function distance(
  left: Readonly<{ x: number; y: number; z: number }>,
  right: Readonly<{ x: number; y: number; z: number }>,
) {
  const delta = subtract(left, right);
  return Math.hypot(delta.x, delta.y, delta.z);
}

function gaugeForMolecule(scene: AqueousDynamicsWebglSceneV042, moleculeId: string) {
  const gauge = scene.projection.coordinateGauge.moleculeLatticeShifts
    .find((entry) => entry.moleculeId === moleculeId);
  if (!gauge) throw new Error(`missing test gauge for molecule ${moleculeId}`);
  return gauge;
}

function deepFreezeFixture<Value>(value: Value): Value {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreezeFixture(nested);
  }
  return value;
}
