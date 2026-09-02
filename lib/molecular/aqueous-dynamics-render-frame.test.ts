import { beforeAll, describe, expect, it } from 'vitest';
import {
  createNaClTip3pFiniteSizeCalibrationWorldV042,
  type AqueousDynamicsObservationV042,
} from '../simulation/aqueous-dynamics-world.ts';
import { digestValue } from '../simulation/digest.ts';
import {
  assertAqueousDynamicsRenderFrameV042,
  createAqueousDynamicsRenderFrameV042,
  type AqueousDynamicsRenderFrameV042,
} from './aqueous-dynamics-render-frame.ts';

type Mutable<Value> = { -readonly [Key in keyof Value]: Value[Key] };

let initial: AqueousDynamicsObservationV042;
let oneStep: AqueousDynamicsObservationV042;
let initialFrame: AqueousDynamicsRenderFrameV042;
let oneStepFrame: AqueousDynamicsRenderFrameV042;

beforeAll(() => {
  const world = createNaClTip3pFiniteSizeCalibrationWorldV042();
  initial = world.observe();
  oneStep = world.advance();
  initialFrame = createAqueousDynamicsRenderFrameV042(initial);
  oneStepFrame = createAqueousDynamicsRenderFrameV042(oneStep);
});

describe('aqueous dynamics render frame v0.4.2', () => {
  it('adapts the real initial and one-step observations with fixed source/render bindings', () => {
    for (const [observation, frame] of [[initial, initialFrame], [oneStep, oneStepFrame]] as const) {
      expect(frame.atoms.map((atom) => atom.id)).toEqual(observation.atoms.map((atom) => atom.id));
      expect(frame.atoms).toHaveLength(8);
      expect(frame.molecules.map((molecule) => molecule.id)).toEqual([
        'chloride', 'sodium', 'water-a', 'water-b',
      ]);
      expect(frame.structuralOhLinks).toHaveLength(4);
      expect(frame.diagnosticHhEdges).toHaveLength(2);
      expect(frame.sourceBinding).toMatchObject({
        observationDigest: observation.observationDigest,
        forceFieldEvaluationDigest: observation.forceField.evaluationDigest,
        topologyDigest: observation.topologyDigest,
        stateDigest: observation.stateDigest,
        physicalDigest: observation.physicalDigest,
      });
      expect(frame.sourceBindingDigest).toBe(digestValue(frame.sourceBinding));
      const { renderDigest, ...payload } = frame;
      expect(renderDigest).toBe(digestValue(payload));
      expect(() => assertAqueousDynamicsRenderFrameV042(frame, observation)).not.toThrow();
    }
    expect(initialFrame.workReceipt.integrationTotalWorkUnits).toBe(0);
    expect(oneStepFrame.workReceipt.integrationTotalWorkUnits).toBeGreaterThan(0);
  });

  it('is deterministic, deeply frozen, and leaves its source observation unchanged', () => {
    const sourceBefore = structuredClone(oneStep);
    const replay = createAqueousDynamicsRenderFrameV042(oneStep);
    expect(replay).toEqual(oneStepFrame);
    expect(oneStep).toEqual(sourceBefore);
    expect(Object.isFrozen(replay)).toBe(true);
    expect(Object.isFrozen(replay.atoms)).toBe(true);
    expect(Object.isFrozen(replay.atoms[0].forceComponentsKjMolAngstrom.total)).toBe(true);
    expect(Object.isFrozen(replay.lennardJonesPairs)).toBe(true);
  });

  it('keeps both waters continuous around their oxygen anchors and marks only lifted copies as ghosts', () => {
    for (const frame of [initialFrame, oneStepFrame]) {
      for (const molecule of frame.molecules.filter((entry) => entry.kind === 'rigid-tip3p-water')) {
        expect(molecule.continuousAtoms[0].atomId).toBe(molecule.oxygenAnchorAtomId);
        const oxygen = molecule.continuousAtoms[0].positionAngstrom;
        expect(molecule.continuousAtoms[0].usesPeriodicContinuityCopy).toBe(false);
        for (const hydrogen of molecule.continuousAtoms.slice(1)) {
          expect(vectorDistance(oxygen, hydrogen.positionAngstrom)).toBeCloseTo(0.9572, 9);
        }
      }
      for (const link of [...frame.structuralOhLinks, ...frame.diagnosticHhEdges]) {
        expect(link.renderedDistanceAngstrom).toBeCloseTo(link.targetDistanceAngstrom, 9);
        expect(link.energeticInteraction).toBe(false);
      }
      for (const ghost of frame.periodicGhosts) {
        expect(ghost.imageShiftFromWrapped).not.toEqual({ x: 0, y: 0, z: 0 });
        const moleculeAtom = frame.molecules
          .flatMap((molecule) => molecule.continuousAtoms)
          .find((atom) => atom.atomId === ghost.sourceAtomId);
        expect(ghost.ghostPositionAngstrom).toEqual(moleculeAtom?.positionAngstrom);
        expect(moleculeAtom?.usesPeriodicContinuityCopy).toBe(true);
        expect(ghost).toMatchObject({
          selectable: false,
          countsTowardAtomCount: false,
          replacesWrappedSourceInPrimaryMolecule: true,
        });
        const sourceAtom = frame.atoms.find((atom) => atom.id === ghost.sourceAtomId)!;
        expect(sourceAtom.element).toBe('H');
        expect(ghost.moleculeId.startsWith('water-')).toBe(true);
      }
      const ghostIds = frame.periodicGhosts.map((ghost) => ghost.id);
      expect(new Set(ghostIds).size).toBe(ghostIds.length);
      expect(frame.molecules.flatMap((molecule) => molecule.continuousAtoms)
        .filter((atom) => atom.usesPeriodicContinuityCopy).map((atom) => atom.atomId).sort())
        .toEqual(frame.periodicGhosts.map((ghost) => ghost.sourceAtomId).sort());
    }
    expect(initialFrame.periodicGhosts.length).toBeGreaterThan(0);
  });

  it('projects exact force components and emitted LJ records while activating only evaluated LJ', () => {
    for (const [observation, frame] of [[initial, initialFrame], [oneStep, oneStepFrame]] as const) {
      for (const atom of frame.atoms) {
        const sourceAtom = observation.atoms.find((candidate) => candidate.id === atom.id)!;
        expect(atom.forceKjMolAngstrom).toEqual(sourceAtom.forceKjMolAngstrom);
        expect(atom.forceComponentsKjMolAngstrom)
          .toEqual(observation.forceField.forceComponentsByAtomIdKjMolAngstrom[atom.id]);
      }
      expect(frame.lennardJonesPairs.map((pair) => pair.id))
        .toEqual(observation.forceField.lennardJonesInteractions.map((pair) => pair.id));
      for (const pair of frame.lennardJonesPairs) {
        const sourcePair = observation.forceField.lennardJonesInteractions
          .find((candidate) => candidate.id === pair.id)!;
        expect(pair.activeForInteractionLayer).toBe(pair.evaluation === 'evaluated-plain-cutoff');
        expect(pair.energyKjMol).toBe(sourcePair.energyKjMol);
        expect(pair.forceOnBKjMolAngstrom).toEqual(sourcePair.forceOnBKjMolAngstrom);
        expect(pair.virialKjMol).toEqual(sourcePair.virialKjMol);
        expect(pair.mixedSigmaAngstrom).toBe(sourcePair.mixedSigmaAngstrom);
        expect(pair.mixedEpsilonKjMol).toBe(sourcePair.mixedEpsilonKjMol);
        expect(pair.lennardJonesScale).toBe(sourcePair.lennardJonesScale);
        expect(add(pair.atomAPositionAngstrom, pair.displacementAngstrom))
          .toEqual(pair.atomBImagePositionAngstrom);
      }
      const shortCircuits = frame.lennardJonesPairs
        .filter((pair) => pair.evaluation !== 'evaluated-plain-cutoff');
      expect(shortCircuits.length).toBeGreaterThan(0);
      expect(shortCircuits.every((pair) => !pair.activeForInteractionLayer)).toBe(true);
      expect(frame.workReceipt.forceFieldTotalWorkUnits).toBe(
        frame.workReceipt.forceFieldAllPairWorkUnits
        + frame.workReceipt.forceFieldCoulombExceptionWorkUnits
        + frame.workReceipt.forceFieldEwaldRealSpaceWorkUnits
        + frame.workReceipt.forceFieldEwaldReciprocalSpaceWorkUnits,
      );
    }
  });

  it('locks the display cell gauge and fails unavailable science layers closed', () => {
    expect(initialFrame.cell).toMatchObject({
      originGauge: 'display-zero-periodic-gauge',
      originAngstrom: { x: 0, y: 0, z: 0 },
    });
    expect(initialFrame.cell.verticesAngstrom).toHaveLength(8);
    expect(initialFrame.cell.verticesAngstrom).toEqual([
      { x: 0, y: 0, z: 0 },
      { x: 24, y: 0, z: 0 },
      { x: 2, y: 23, z: 0 },
      { x: 26, y: 23, z: 0 },
      { x: 1, y: 1.5, z: 22 },
      { x: 25, y: 1.5, z: 22 },
      { x: 3, y: 24.5, z: 22 },
      { x: 27, y: 24.5, z: 22 },
    ]);
    expect(initialFrame.layerAvailability).toMatchObject({
      atoms: 'available-source-observation',
      cell: 'available-display-zero-periodic-gauge',
      structuralOH: 'available-rigid-distance-constraints-not-energetic-interactions',
      evaluatedLJ: 'available-only-evaluated-plain-cutoff-interactions',
      trajectory: 'unavailable-requires-multiple-observation-history',
      coulombPair: 'unavailable-direct-ewald-has-no-pair-render-decomposition',
      pressure: 'unavailable-complete-ewald-virial-not-implemented',
      stress: 'unavailable-complete-ewald-virial-not-implemented',
      reaction: 'unavailable-fixed-topology-has-no-reaction-model',
    });
    expect(Object.values(initialFrame.unavailableLayers).every((value) => value === null)).toBe(true);
  });

  it('rejects a frozen source with an extra undefined key that its self-digest could omit', () => {
    const forged = cloneObservation(initial) as Mutable<AqueousDynamicsObservationV042>
      & { unexpected?: undefined };
    forged.unexpected = undefined;
    deepFreezeFixture(forged);
    expect(() => createAqueousDynamicsRenderFrameV042(forged))
      .toThrow(/own-key sequence is not exact/);
  });

  it('rejects a frozen source state swap even when it otherwise has the locked step namespace', () => {
    const forged = cloneObservation(initial);
    forged.stateId = oneStep.stateId;
    forged.stateDigest = oneStep.stateDigest;
    forged.physicalDigest = oneStep.physicalDigest;
    deepFreezeFixture(forged);
    expect(() => createAqueousDynamicsRenderFrameV042(forged))
      .toThrow(/stateId primitive value is not exact/);
  });

  it('does not execute a source getter while rejecting the frozen accessor tree', () => {
    let getterReads = 0;
    const descriptors = Object.getOwnPropertyDescriptors(initial);
    descriptors.trap = {
      configurable: true,
      enumerable: true,
      get() {
        getterReads += 1;
        return undefined;
      },
    };
    const forged = Object.freeze(
      Object.create(Object.prototype, descriptors),
    ) as AqueousDynamicsObservationV042;
    expect(() => createAqueousDynamicsRenderFrameV042(forged))
      .toThrow(/own-key sequence is not exact/);
    expect(getterReads).toBe(0);
  });

  it('rejects a frozen one-step source with bad receipt lineage/work', () => {
    const badLineage = cloneObservation(oneStep);
    const lineageReceipt = badLineage.integration.lastIntegrationReceipt as Mutable<
      NonNullable<AqueousDynamicsObservationV042['integration']['lastIntegrationReceipt']>
    >;
    lineageReceipt.fromStep = 9;
    deepFreezeFixture(badLineage);
    expect(() => createAqueousDynamicsRenderFrameV042(badLineage))
      .toThrow(/lastIntegrationReceipt\.fromStep primitive value is not exact/);

    const badWork = cloneObservation(oneStep);
    const workIntegration = badWork.integration as Mutable<typeof badWork.integration>;
    workIntegration.lastStepWorkUnitsConsumed += 1;
    deepFreezeFixture(badWork);
    expect(() => createAqueousDynamicsRenderFrameV042(badWork))
      .toThrow(/lastStepWorkUnitsConsumed primitive value is not exact/);
  });

  it('rejects mutable frames before accepting any self-digest or nested value', () => {
    const mutable = structuredClone(initialFrame);
    expect(() => assertAqueousDynamicsRenderFrameV042(mutable, initial))
      .toThrow(/recursively frozen/);
  });

  it('does not execute a frame getter while rejecting the accessor descriptor', () => {
    let getterReads = 0;
    const descriptors = Object.getOwnPropertyDescriptors(initialFrame) as Record<
      string,
      PropertyDescriptor
    >;
    descriptors.renderDigest = {
      configurable: true,
      enumerable: true,
      get() {
        getterReads += 1;
        return initialFrame.renderDigest;
      },
    };
    const forged = Object.freeze(Object.create(Object.prototype, descriptors));
    expect(() => assertAqueousDynamicsRenderFrameV042(forged, initial))
      .toThrow(/renderDigest must be an own data property/);
    expect(getterReads).toBe(0);
  });

  it('rejects frozen frame forgeries in short-circuit activation and every LJ science field', () => {
    const shortCircuit = oneStepFrame.lennardJonesPairs
      .find((pair) => pair.evaluation !== 'evaluated-plain-cutoff')!;
    const activationForgery = cloneFrame(oneStepFrame);
    const activationPair = mutablePair(activationForgery, shortCircuit.id);
    activationPair.activeForInteractionLayer = true;
    deepFreezeFixture(activationForgery);
    expect(() => assertAqueousDynamicsRenderFrameV042(activationForgery, oneStep))
      .toThrow(/activeForInteractionLayer primitive value is not exact/);

    const mutations: ReadonlyArray<(pair: ReturnType<typeof mutablePair>) => void> = [
      (pair) => { pair.energyKjMol += 1; },
      (pair) => {
        (pair.forceOnBKjMolAngstrom as Mutable<typeof pair.forceOnBKjMolAngstrom>).x += 1;
      },
      (pair) => { (pair.virialKjMol as Mutable<typeof pair.virialKjMol>).xx += 1; },
      (pair) => { pair.mixedSigmaAngstrom += 1; },
      (pair) => { pair.mixedEpsilonKjMol += 1; },
      (pair) => { pair.lennardJonesScale = pair.lennardJonesScale === 0 ? 1 : 0; },
    ];
    for (const mutate of mutations) {
      const forged = cloneFrame(oneStepFrame);
      mutate(mutablePair(forged, forged.lennardJonesPairs[0].id));
      deepFreezeFixture(forged);
      expect(() => assertAqueousDynamicsRenderFrameV042(forged, oneStep)).toThrow(/not exact/);
    }
  });
});

function cloneObservation(observation: AqueousDynamicsObservationV042) {
  return structuredClone(observation) as Mutable<AqueousDynamicsObservationV042>;
}

function cloneFrame(frame: AqueousDynamicsRenderFrameV042) {
  return structuredClone(frame) as Mutable<AqueousDynamicsRenderFrameV042>;
}

function mutablePair(frame: Mutable<AqueousDynamicsRenderFrameV042>, pairId: string) {
  const pairs = frame.lennardJonesPairs as Array<Mutable<
    AqueousDynamicsRenderFrameV042['lennardJonesPairs'][number]
  >>;
  const pair = pairs.find((candidate) => candidate.id === pairId);
  if (!pair) throw new Error(`test LJ pair ${pairId} is missing`);
  return pair;
}

function deepFreezeFixture<Value>(value: Value): Value {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreezeFixture(nested);
  }
  return value;
}

function vectorDistance(
  left: Readonly<{ x: number; y: number; z: number }>,
  right: Readonly<{ x: number; y: number; z: number }>,
) {
  const delta = subtract(left, right);
  return Math.hypot(delta.x, delta.y, delta.z);
}

function subtract(
  left: Readonly<{ x: number; y: number; z: number }>,
  right: Readonly<{ x: number; y: number; z: number }>,
) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function add(
  left: Readonly<{ x: number; y: number; z: number }>,
  right: Readonly<{ x: number; y: number; z: number }>,
) {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}
