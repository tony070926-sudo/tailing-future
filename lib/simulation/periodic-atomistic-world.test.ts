import { describe, expect, it } from 'vitest';
import { digestValue, shortDigest } from './digest.ts';
import {
  createPeriodicArgonCalibrationConfiguration,
  createPeriodicArgonCalibrationWorld,
  PeriodicAtomisticWorld,
  type SerializedPeriodicAtomisticWorldV041,
} from './periodic-atomistic-world.ts';

describe('PeriodicAtomisticWorld', () => {
  it('creates a truthful 32-atom fixed-cell 3D periodic NVE observation', () => {
    const world = createPeriodicArgonCalibrationWorld();
    const observation = world.observe();
    expect(observation.schemaVersion).toBe('tf.periodic-atomistic-observation/0.4.1');
    expect(observation.atoms).toHaveLength(32);
    expect(observation.cell.periodicAxes).toEqual([true, true, true]);
    expect(observation.cell.volumeAngstrom3).toBeCloseTo(10.52 ** 3, 10);
    expect(observation.thermodynamics.ensemble).toBe('NVE');
    expect(observation.thermodynamics.degreesOfFreedom).toBe(93);
    expect(observation.thermodynamics.kineticFrame).toBe('center-of-mass');
    expect(observation.energy.maximumRelativeExcursion).toBe(0);
    expect(world.neighborCacheDiagnostics().buildCount).toBe(1);
    expect(observation.neighborList.cacheExcludedFromPhysicalDigest).toBe(true);
    expect(observation.neighborList.activePairCount).toBeGreaterThan(0);
    expect(observation.provenance.externalEngineExecuted).toBe(false);
    expect(observation.provenance.electronicStructureSolved).toBe(false);
    expect(observation.boundaries.some((boundary) => boundary.includes('不是 Ewald、PME'))).toBe(true);
    expect(Object.isFrozen(world.configuration)).toBe(true);
    expect(Object.isFrozen(world.configuration.atoms)).toBe(true);
  });

  it('replays the same seed and action sequence exactly', () => {
    const first = createPeriodicArgonCalibrationWorld();
    const second = createPeriodicArgonCalibrationWorld();
    expect(first.observe()).toEqual(second.observe());
    first.advance(173);
    second.advance(173);
    expect(first.advance(37)).toEqual(second.advance(37));
  });

  it('crosses periodic faces, rebuilds the Verlet list and closes a 10,000-step NVE trajectory', () => {
    const world = createPeriodicArgonCalibrationWorld();
    const observation = world.advance(1_000);
    for (let batch = 1; batch < 10; batch += 1) world.advance(1_000);
    const final = world.observe();
    expect(observation.step).toBe(1_000);
    expect(final.step).toBe(10_000);
    expect(final.timePicoseconds).toBe(10);
    expect(final.events.faceCrossingCount).toBeGreaterThan(0);
    expect(world.neighborCacheDiagnostics().buildCount).toBeGreaterThan(1);
    expect(final.energy.maximumRelativeExcursion).toBeLessThan(final.numericalValidity.maximumRelativeEnergyExcursionLimit);
    expect(final.conservation.momentumResidual).toBeLessThan(final.numericalValidity.momentumResidualLimit);
    expect(final.conservation.internalForceResidualKjMolAngstrom).toBeLessThan(final.numericalValidity.internalForceResidualLimit);
    expect(final.conservation.centerOfMassResidualAngstrom).toBeLessThan(final.numericalValidity.centerOfMassResidualLimitAngstrom);
    for (const atom of final.atoms) {
      expect(atom.wrappedFractional.x).toBeGreaterThanOrEqual(0);
      expect(atom.wrappedFractional.x).toBeLessThan(1);
      expect(atom.wrappedFractional.y).toBeGreaterThanOrEqual(0);
      expect(atom.wrappedFractional.y).toBeLessThan(1);
      expect(atom.wrappedFractional.z).toBeGreaterThanOrEqual(0);
      expect(atom.wrappedFractional.z).toBeLessThan(1);
    }
  }, 30_000);

  it('restores byte-exactly, continues deterministically and isolates branches', () => {
    const original = createPeriodicArgonCalibrationWorld();
    original.advance(250);
    const restored = PeriodicAtomisticWorld.fromSerialized(original.serialize());
    expect(restored.serialize()).toEqual(original.serialize());
    expect(restored.observe()).toEqual(original.observe());
    expect(restored.advance(80)).toEqual(original.advance(80));
    expect(restored.serialize()).toEqual(original.serialize());

    const parentStateId = original.observe().stateId;
    const firstBranch = original.clone(1);
    const secondBranch = original.clone(2);
    expect(firstBranch.observe().parentStateId).toBe(parentStateId);
    expect(firstBranch.observe().physicalDigest).toBe(secondBranch.observe().physicalDigest);
    expect(firstBranch.observe().stateId).not.toBe(secondBranch.observe().stateId);
    expect(firstBranch.observe().stateDigest).not.toBe(secondBranch.observe().stateDigest);
    expect(firstBranch.advance(25).atoms).toEqual(secondBranch.advance(25).atoms);
  });

  it('keeps the physical digest invariant to an integer lattice gauge while the full state remains distinct', () => {
    const base = createPeriodicArgonCalibrationConfiguration();
    const translated = structuredClone(base);
    for (const atom of translated.atoms) {
      (atom.image as { x: number }).x += 7;
      (atom.image as { y: number }).y -= 3;
      (atom.image as { z: number }).z += 2;
    }
    const first = new PeriodicAtomisticWorld(base).observe();
    const second = new PeriodicAtomisticWorld(translated).observe();
    expect(second.physicalDigest).toBe(first.physicalDigest);
    expect(second.energy).toEqual(first.energy);
    expect(second.forceByAtomIdKjMolAngstrom).toEqual(first.forceByAtomIdKjMolAngstrom);
    expect(second.pairInteractions).toEqual(first.pairInteractions);
    expect(second.stateDigest).not.toBe(first.stateDigest);

    const relativeShift = structuredClone(base);
    (relativeShift.atoms[0].image as { x: number }).x += 1;
    expect(new PeriodicAtomisticWorld(relativeShift).observe().physicalDigest).not.toBe(first.physicalDigest);
  });

  it('rejects recomputed summaries when current kinetic energy violates the locked NVE gate', () => {
    const world = createPeriodicArgonCalibrationWorld();
    world.advance(1);
    const tamper = structuredClone(world.serialize());
    (tamper.atoms[0].velocityAngstromPerPicosecond as { x: number }).x += 5;
    (tamper.atoms[1].velocityAngstromPerPicosecond as { x: number }).x -= 5;
    rewriteStateIdentity(tamper);
    expect(() => PeriodicAtomisticWorld.fromSerialized(tamper)).toThrow(/deterministic replay|energy (statistics|excursion)/);
  });

  it('enforces pointwise distance gates inside a batch and rolls the whole action back', () => {
    const configuration = structuredClone(createPeriodicArgonCalibrationConfiguration());
    (configuration.options as { minimumAllowedPairDistanceAngstrom: number }).minimumAllowedPairDistanceAngstrom = 3.7115;
    const batched = new PeriodicAtomisticWorld(configuration);
    const before = batched.serialize();
    expect(() => batched.advance(300)).toThrow('pair distance crossed');
    expect(batched.serialize()).toEqual(before);

    const singleStep = new PeriodicAtomisticWorld(configuration);
    let rejectedAt = 0;
    for (let step = 1; step <= 300; step += 1) {
      try {
        singleStep.advance(1);
      } catch {
        rejectedAt = step;
        break;
      }
    }
    expect(rejectedAt).toBeGreaterThan(0);
    expect(rejectedAt).toBeLessThan(300);
  });

  it('keeps thermal temperature, pressure and stress invariant under uniform translation velocity', () => {
    const drifting = createPeriodicArgonCalibrationConfiguration();
    const comFrame = structuredClone(drifting);
    for (const atom of comFrame.atoms) {
      (atom.velocityAngstromPerPicosecond as { x: number }).x -= 1.15;
    }
    const first = new PeriodicAtomisticWorld(drifting).observe();
    const second = new PeriodicAtomisticWorld(comFrame).observe();
    expect(second.thermodynamics.temperatureKelvin).toBeCloseTo(first.thermodynamics.temperatureKelvin, 12);
    expect(second.thermodynamics.pressureKjMolAngstrom3).toBeCloseTo(first.thermodynamics.pressureKjMolAngstrom3, 12);
    for (const key of Object.keys(first.stressKjMolAngstrom3) as Array<keyof typeof first.stressKjMolAngstrom3>) {
      expect(second.stressKjMolAngstrom3[key]).toBeCloseTo(first.stressKjMolAngstrom3[key], 12);
    }
    expect(second.energy.kineticKjMol).toBeLessThan(first.energy.kineticKjMol);
  });

  it('rejects recomputed-digest action and reference-metadata contradictions', () => {
    const world = createPeriodicArgonCalibrationWorld();
    world.advance(3);
    const actionTamper = structuredClone(world.serialize());
    const action = actionTamper.lastAction!;
    (action.parameters as Record<string, number>).substeps = 2;
    (action as { actionId: string }).actionId = digestValue({ ...action, actionId: undefined });
    rewriteStateDigest(actionTamper);
    expect(() => PeriodicAtomisticWorld.fromSerialized(actionTamper)).toThrow('semantics');

    const metadataTamper = structuredClone(world.serialize());
    (metadataTamper as { initialMassDalton: number }).initialMassDalton += 1;
    rewriteStateDigest(metadataTamper);
    expect(() => PeriodicAtomisticWorld.fromSerialized(metadataTamper)).toThrow('reference metadata');

    const oneStepWorld = createPeriodicArgonCalibrationWorld();
    oneStepWorld.advance(1);
    const impossibleLineage = structuredClone(oneStepWorld.serialize());
    (impossibleLineage as { revision: number }).revision = 2;
    (impossibleLineage as { actionCount: number }).actionCount = 2;
    (impossibleLineage as { branchCount: number }).branchCount = 0;
    rewriteStateIdentity(impossibleLineage);
    expect(() => PeriodicAtomisticWorld.fromSerialized(impossibleLineage)).toThrow('step and action counts');
  });

  it('rejects a recomputed zero-step image/history contradiction', () => {
    const state = structuredClone(createPeriodicArgonCalibrationWorld().serialize());
    (state.atoms[0].image as { x: number }).x += 1;
    (state.atoms[1].image as { x: number }).x -= 1;
    rewriteStateIdentity(state);
    expect(() => PeriodicAtomisticWorld.fromSerialized(state)).toThrow('zero-step state');
  });

  it('replays serialized trajectory statistics, event counts and branch namespaces', () => {
    const world = createPeriodicArgonCalibrationWorld();
    world.advance(100);

    const statisticsTamper = structuredClone(world.serialize());
    (statisticsTamper.energyStatistics as { energySumKjMol: number }).energySumKjMol += 123;
    (statisticsTamper.energyStatistics as { timeEnergySumKjMolPicoseconds: number }).timeEnergySumKjMolPicoseconds -= 77;
    rewriteStateDigest(statisticsTamper);
    expect(() => PeriodicAtomisticWorld.fromSerialized(statisticsTamper)).toThrow('deterministic replay');

    const eventTamper = structuredClone(world.serialize());
    (eventTamper as { faceCrossingEvents: number }).faceCrossingEvents += 999_999;
    rewriteStateDigest(eventTamper);
    expect(() => PeriodicAtomisticWorld.fromSerialized(eventTamper)).toThrow('deterministic replay');

    const tenStepWorld = createPeriodicArgonCalibrationWorld();
    tenStepWorld.advance(10);
    const branchTamper = structuredClone(tenStepWorld.serialize());
    (branchTamper as { revision: number }).revision = 101;
    (branchTamper as { actionCount: number }).actionCount = 101;
    (branchTamper as { branchCount: number }).branchCount = 100;
    rewriteStateIdentity(branchTamper);
    expect(() => PeriodicAtomisticWorld.fromSerialized(branchTamper)).toThrow('branch count and namespace');
  });

  it('uses semantic key-order-independent digests and bounded branch namespaces', () => {
    expect(digestValue({ b: 2, a: 1 })).toBe(digestValue({ a: 1, b: 2 }));
    const base = createPeriodicArgonCalibrationConfiguration();
    const reordered = structuredClone(base);
    const reversedOptions = Object.fromEntries(Object.entries(reordered.options).reverse());
    (reordered as unknown as { options: typeof reordered.options }).options = reversedOptions as typeof reordered.options;
    expect(new PeriodicAtomisticWorld(reordered).configurationDigest)
      .toBe(new PeriodicAtomisticWorld(base).configurationDigest);

    let branch = createPeriodicArgonCalibrationWorld();
    for (let depth = 0; depth < 12; depth += 1) {
      branch = branch.clone(Number.MAX_SAFE_INTEGER);
      expect(() => PeriodicAtomisticWorld.fromSerialized(branch.serialize())).not.toThrow();
    }
  });

  it('binds cell, topology, dynamics and exact velocity shape into restore validation', () => {
    const world = createPeriodicArgonCalibrationWorld();
    world.advance(4);
    const cellTamper = structuredClone(world.serialize());
    (cellTamper.configuration.cell.vectorsAngstrom[0] as { x: number }).x += 0.1;
    expect(() => PeriodicAtomisticWorld.fromSerialized(cellTamper)).toThrow('configuration digest');

    const velocityTamper = structuredClone(world.serialize());
    (velocityTamper.atoms[0] as unknown as { velocityAngstromPerPicosecond: object }).velocityAngstromPerPicosecond = {};
    rewriteStateDigest(velocityTamper);
    expect(() => PeriodicAtomisticWorld.fromSerialized(velocityTamper)).toThrow('finite x, y and z');
  });

  it('rolls back a failed numerical transition byte-for-byte', () => {
    const world = createPeriodicArgonCalibrationWorld();
    const internal = world as unknown as { atoms: Array<{ wrappedFractional: { x: number; y: number; z: number } }> };
    internal.atoms[1].wrappedFractional = { ...internal.atoms[0].wrappedFractional };
    const before = world.serialize();
    expect(() => world.advance()).toThrow();
    expect(world.serialize()).toEqual(before);
  });

  it('rejects unsupported ensembles, unsafe neighbor radii and implicit periodic Coulomb claims', () => {
    const badEnsemble = structuredClone(createPeriodicArgonCalibrationConfiguration());
    (badEnsemble.options as { ensemble: string }).ensemble = 'NVT';
    expect(() => new PeriodicAtomisticWorld(badEnsemble as ReturnType<typeof createPeriodicArgonCalibrationConfiguration>)).toThrow('only fixed-cell');

    const badRadius = structuredClone(createPeriodicArgonCalibrationConfiguration());
    (badRadius.options as { neighborSkinAngstrom: number }).neighborSkinAngstrom = 1;
    expect(() => new PeriodicAtomisticWorld(badRadius)).toThrow('shortest nonzero lattice vector');

    const invisibleDistanceFloor = structuredClone(createPeriodicArgonCalibrationConfiguration());
    (invisibleDistanceFloor.options as { minimumAllowedPairDistanceAngstrom: number }).minimumAllowedPairDistanceAngstrom = 4.6;
    expect(() => new PeriodicAtomisticWorld(invisibleDistanceFloor)).toThrow('smallest pair-rule cutoff');

    const implicitCoulomb = structuredClone(createPeriodicArgonCalibrationConfiguration());
    (implicitCoulomb.pairRules[0].terms as Array<{ kind: 'coulomb-minimum-image-reference'; relativePermittivity: number }>).push({
      kind: 'coulomb-minimum-image-reference', relativePermittivity: 1,
    });
    expect(() => new PeriodicAtomisticWorld(implicitCoulomb)).toThrow('electrostatics option');

    const inventedElectrostatics = structuredClone(createPeriodicArgonCalibrationConfiguration());
    (inventedElectrostatics.options as { electrostatics: string }).electrostatics = 'PME';
    expect(() => new PeriodicAtomisticWorld(inventedElectrostatics as ReturnType<typeof createPeriodicArgonCalibrationConfiguration>))
      .toThrow('electrostatics option is unsupported');
  });
});

function rewriteStateDigest(state: SerializedPeriodicAtomisticWorldV041) {
  const mutable = state as unknown as { stateDigest: string };
  const payload = structuredClone(state) as unknown as Record<string, unknown>;
  delete payload.stateDigest;
  mutable.stateDigest = digestValue(payload);
}

function rewriteStateIdentity(state: SerializedPeriodicAtomisticWorldV041) {
  const mutable = state as unknown as {
    physicalDigest: string;
    stateId: string;
    lastAction: null | { actionId: string; resultingStateId: string };
  };
  const ordered = [...state.atoms].sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0);
  const anchor = ordered[0].image;
  mutable.physicalDigest = digestValue({
    schemaVersion: 'tf.periodic-atomistic-physical/0.4.1',
    worldId: state.worldId,
    topologyDigest: state.topologyDigest,
    step: state.step,
    atoms: ordered.map((atom) => ({
      id: atom.id,
      wrappedFractional: { ...atom.wrappedFractional },
      relativeImageToAnchor: {
        x: atom.image.x - anchor.x,
        y: atom.image.y - anchor.y,
        z: atom.image.z - anchor.z,
      },
      velocityAngstromPerPicosecond: { ...atom.velocityAngstromPerPicosecond },
    })),
  });
  mutable.stateId = `${state.stateNamespace}-s${state.step.toString(36)}-r${state.revision.toString(36)}-${shortDigest({
    parentStateId: state.parentStateId,
    actionCount: state.actionCount,
    branchCount: state.branchCount,
    physicalDigest: state.physicalDigest,
  })}`;
  if (mutable.lastAction) {
    mutable.lastAction.resultingStateId = mutable.stateId;
    mutable.lastAction.actionId = digestValue({ ...mutable.lastAction, actionId: undefined });
  }
  rewriteStateDigest(state);
}
