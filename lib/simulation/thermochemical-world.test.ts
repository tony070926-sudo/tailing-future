import { describe, expect, it, vi } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import actionSchema from '../../schemas/action.schema.json' with { type: 'json' };
import worldStateSchema from '../../schemas/world-state.schema.json' with { type: 'json' };
import { digestValue, shortDigest } from './digest';
import { ARGON_UNITS, LennardJonesSimulation } from './lennard-jones';
import {
  fourierGridConvergence,
  fourierModeRelativeL2Error,
  heatCapacityGridInvariance,
  PeriodicHeatField,
  reactionProbability,
  releaseReactionHeat,
  runThermochemicalVerification,
  settleReactionEvents,
  ThermochemicalWorld,
  twoReservoirExchange,
  twoReservoirMatrixVerification,
  WORLD_DOMAIN,
  WorldDomainError,
} from './thermochemical-world';

type SerializedWorld = ReturnType<ThermochemicalWorld['serialize']>;

function resignWorldState(state: SerializedWorld) {
  if (!state.lastAction) throw new Error('test fixture requires a last action');
  const actionFingerprint = shortDigest({
    kind: state.lastAction.kind,
    parentStateId: state.lastAction.parentStateId,
    resultingStateId: state.lastAction.resultingStateId,
    appliedAtStep: state.lastAction.appliedAtStep,
    parameters: state.lastAction.parameters,
  });
  state.lastAction.actionId = `${state.stateNamespace}-a${state.actionCount.toString(36).padStart(5, '0')}-${actionFingerprint}`;
  state.stateDigest = digestValue({
    schemaVersion: state.schemaVersion,
    worldId: state.worldId,
    stateId: state.stateId,
    parentStateId: state.parentStateId,
    stateNamespace: state.stateNamespace,
    revision: state.revision,
    actionCount: state.actionCount,
    branchCount: state.branchCount,
    step: state.md.step,
    options: state.options,
    md: state.md,
    field: state.field,
    species: state.species,
    initialTotalEnergy: state.initialTotalEnergy,
    initialClosureReferenceEnergy: state.initialClosureReferenceEnergy,
    externalEnergy: state.externalEnergy,
    initialMomentum: state.initialMomentum,
    reservoirMomentum: state.reservoirMomentum,
    cumulativeInterfaceEnergy: state.cumulativeInterfaceEnergy,
    couplingCoverage: state.couplingCoverage,
    minimumCouplingCoverage: state.minimumCouplingCoverage,
    heatClosureResidual: state.heatClosureResidual,
    exchangeClosureResidual: state.exchangeClosureResidual,
    reactionClosureResidual: state.reactionClosureResidual,
    heatClosureMaximum: state.heatClosureMaximum,
    exchangeClosureMaximum: state.exchangeClosureMaximum,
    reactionClosureMaximum: state.reactionClosureMaximum,
    lastAction: state.lastAction,
  });
}

function forgedParentStateId(namespace: string, step: number, revision: number) {
  return `${namespace}-s${step.toString(36).padStart(6, '0')}r${revision.toString(36).padStart(4, '0')}-${'e'.repeat(16)}`;
}

describe('PeriodicHeatField', () => {
  it('preserves a uniform periodic field and total field energy', () => {
    const field = new PeriodicHeatField({
      width: 12,
      height: 8,
      boxWidth: 3,
      boxHeight: 2,
      diffusivity: 0.2,
      heatCapacityDensity: 3,
      initialTemperatureReduced: 0.8,
      minimumTemperatureReduced: 0.01,
    });
    const energy = field.totalEnergyReduced();
    for (let index = 0; index < 10_000; index += 1) field.advance(0.001);
    expect(Math.max(...field.valuesReduced().map((value) => Math.abs(value - 0.8)))).toBeLessThan(5e-14);
    expect(Math.abs(field.totalEnergyReduced() - energy) / energy).toBeLessThan(5e-12);
  });

  it('matches the analytic Fourier decay and conserves field energy', () => {
    const result = fourierModeRelativeL2Error();
    expect(result.relativeL2Error).toBeLessThan(2e-3);
    expect(Math.abs(result.relativeEnergyResidual)).toBeLessThan(5e-12);
  });

  it('obeys the discrete maximum principle under the CFL subcycling gate', () => {
    const field = new PeriodicHeatField({
      width: 16,
      height: 16,
      boxWidth: 1,
      boxHeight: 1,
      diffusivity: 0.03,
      heatCapacityDensity: 1,
      initialTemperatureReduced: 0.5,
      minimumTemperatureReduced: 0.01,
    });
    field.setCellTemperatureReduced(8, 8, 1.2);
    const energy = field.totalEnergyReduced();
    field.advance(0.8);
    const values = field.valuesReduced();
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0.5 - 1e-12);
    expect(Math.max(...values)).toBeLessThanOrEqual(1.2 + 1e-12);
    expect(Math.abs(field.totalEnergyReduced() - energy) / energy).toBeLessThan(5e-12);
  });

  it('keeps total heat capacity and uniform-field energy invariant under grid refinement', () => {
    const result = heatCapacityGridInvariance();
    expect(result.maximumCapacitySpread).toBeLessThan(1e-12);
    expect(result.maximumEnergySpread).toBeLessThan(1e-12);
  });

  it('injects the requested Gaussian-pulse energy independently of grid resolution', () => {
    const injected = [[4, 4], [5, 3], [8, 8]].map(([gridWidth, gridHeight]) => {
      const world = new ThermochemicalWorld({ count: 256, density: 0.84, gridWidth, gridHeight, seed: 73 });
      const before = world.serialize();
      const beforeEnergy = before.field.values.reduce((sum, value) => sum + value, 0)
        * before.field.heatCapacityDensity * before.field.boxWidth * before.field.boxHeight / before.field.values.length;
      const snapshot = world.injectCentralHeatPulse(10);
      const after = world.serialize();
      const afterEnergy = after.field.values.reduce((sum, value) => sum + value, 0)
        * after.field.heatCapacityDensity * after.field.boxWidth * after.field.boxHeight / after.field.values.length;
      return { actual: afterEnergy - beforeEnergy, recorded: snapshot.lastAction?.parameters.energyReduced as number };
    });
    expect(Math.max(...injected.map(({ actual }) => actual)) - Math.min(...injected.map(({ actual }) => actual))).toBeLessThan(1e-12);
    for (const { actual, recorded } of injected) expect(actual).toBeCloseTo(recorded, 12);
  });

  it('demonstrates second-order convergence across two-dimensional Fourier modes', () => {
    const result = fourierGridConvergence();
    expect(result.minimumObservedOrder).toBeGreaterThanOrEqual(1.8);
    expect(result.modes.every((mode) => mode.errors.at(-1)! < 5e-4)).toBe(true);
  });
});

describe('thermochemical bridge', () => {
  it('validates serialized world states and typed actions against the executable schemas', () => {
    const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
    const validateWorld = ajv.compile(worldStateSchema);
    const validateAction = ajv.compile(actionSchema);
    const world = new ThermochemicalWorld({ count: 64, gridWidth: 5, gridHeight: 3, seed: 11 });
    world.injectCentralHeatPulse(15);
    const state = world.serialize();
    expect(validateWorld(state), JSON.stringify(validateWorld.errors)).toBe(true);
    expect(validateAction(state.lastAction), JSON.stringify(validateAction.errors)).toBe(true);
    const invalidActions = [
      { ...state.lastAction, kind: 'step', parameters: { deltaKelvin: -999, unknown: 'accepted' } },
      { ...state.lastAction, kind: 'set_field_temperature', parameters: { temperatureKelvin: 181, externalEnergyReduced: 0 } },
      { ...state.lastAction, kind: 'inject_heat_pulse', parameters: { deltaKelvin: 0, externalEnergyReduced: 0 } },
      { ...state.lastAction, kind: 'branch', parameters: { fromStep: -1, branchOrdinal: 0 } },
    ];
    expect(invalidActions.every((action) => !validateAction(action))).toBe(true);
    const invalid = { ...state, stateDigest: 'unverified' };
    expect(validateWorld(invalid)).toBe(false);
  });

  it('conserves cell momentum while exchanging the requested peculiar kinetic energy', () => {
    const simulation = new LennardJonesSimulation({ count: 48, density: 0.78, thermostatTau: null, seed: 19 });
    const before = simulation.observe();
    const momentumBefore = before.particles.reduce((sum, particle) => ({ x: sum.x + particle.vx, y: sum.y + particle.vy }), { x: 0, y: 0 });
    const result = simulation.exchangeCellThermalEnergies([{ indices: before.particles.map((_, index) => index), energyReduced: 0.5 }])[0];
    const after = simulation.observe();
    const momentumAfter = after.particles.reduce((sum, particle) => ({ x: sum.x + particle.vx, y: sum.y + particle.vy }), { x: 0, y: 0 });
    expect(result.actualEnergyReduced).toBeCloseTo(0.5, 12);
    expect(Math.hypot(momentumAfter.x - momentumBefore.x, momentumAfter.y - momentumBefore.y)).toBeLessThan(5e-13);
    expect(Math.hypot(result.deltaPx, result.deltaPy)).toBeLessThan(5e-13);
  });

  it('does not count occupancy-only cells as thermally coupled', () => {
    const world = new ThermochemicalWorld({
      count: 64,
      density: 0.78,
      temperatureKelvin: 88,
      gridWidth: 5,
      gridHeight: 3,
      thermalDiffusivity: 0,
      reactionPreexponential: 0,
      seed: 73,
    });
    const internals = world as unknown as {
      md: { particles: Array<{ x: number; y: number; vx: number; vy: number }> };
      field: PeriodicHeatField;
      exchangeParticleFieldEnergy: (duration: number) => number;
      cumulativeInterfaceEnergy: number;
      options: { timeStep: number };
    };
    for (const particle of internals.md.particles) {
      const cell = internals.field.cellIndexAtPosition(particle.x, particle.y);
      particle.vx = cell * 0.01;
      particle.vy = -cell * 0.02;
    }
    const interfaceBefore = internals.cumulativeInterfaceEnergy;
    expect(internals.exchangeParticleFieldEnergy(internals.options.timeStep / 2)).toBe(0);
    expect(internals.cumulativeInterfaceEnergy).toBe(interfaceBefore);
  });

  it('uses the exact constant-hazard survival probability', () => {
    const rate = 0.27;
    const dt = 0.003;
    const steps = 8_000;
    const probability = reactionProbability(rate, dt);
    expect((1 - probability) ** steps).toBeCloseTo(Math.exp(-rate * dt * steps), 12);
  });

  it('matches the analytic two-reservoir exchange semigroup and closes energy', () => {
    const oneStep = twoReservoirExchange({
      particleTemperature: 0.6,
      particleHeatCapacity: 7,
      fieldTemperature: 1.1,
      fieldHeatCapacity: 3.5,
      durationReduced: 0.12,
      couplingTauReduced: 0.3,
    });
    const halfStep = twoReservoirExchange({
      particleTemperature: 0.6,
      particleHeatCapacity: 7,
      fieldTemperature: 1.1,
      fieldHeatCapacity: 3.5,
      durationReduced: 0.06,
      couplingTauReduced: 0.3,
    });
    const twoSteps = twoReservoirExchange({
      particleTemperature: halfStep.nextParticleTemperature,
      particleHeatCapacity: 7,
      fieldTemperature: halfStep.nextFieldTemperature,
      fieldHeatCapacity: 3.5,
      durationReduced: 0.06,
      couplingTauReduced: 0.3,
    });
    expect(oneStep.temperatureDifferenceRatio).toBeCloseTo(Math.exp(-0.4), 13);
    expect(oneStep.energyClosureResidual).toBeLessThan(1e-12);
    expect(twoSteps.nextParticleTemperature).toBeCloseTo(oneStep.nextParticleTemperature, 13);
    expect(twoSteps.nextFieldTemperature).toBeCloseTo(oneStep.nextFieldTemperature, 13);
    const matrix = twoReservoirMatrixVerification();
    expect(matrix.cases).toBe(73);
    expect(matrix.maximumDifferenceRatioError).toBeLessThanOrEqual(2e-12);
    expect(matrix.maximumTemperatureError).toBeLessThanOrEqual(2e-12);
    expect(matrix.maximumRelativeClosureResidual).toBeLessThanOrEqual(1e-12);
    expect(matrix.maximumSemigroupError).toBeLessThanOrEqual(2e-12);
    expect(matrix.equalTemperatureEnergyExchange).toBe(0);
  });

  it('settles a forced reaction heat release with exact field/chemical closure', () => {
    const field = new PeriodicHeatField({
      width: 4,
      height: 4,
      boxWidth: 4,
      boxHeight: 4,
      diffusivity: 0.1,
      heatCapacityDensity: 1,
      initialTemperatureReduced: 1,
      minimumTemperatureReduced: 0.01,
    });
    const before = field.totalEnergyReduced();
    const result = releaseReactionHeat({ field, cellIndex: 5, reactionCount: 1, reactionHeatReduced: 0.015 });
    expect(result.fieldEnergyDelta).toBeCloseTo(0.015, 13);
    expect(result.chemicalEnergyDelta).toBe(-0.015);
    expect(result.closureResidual).toBeLessThan(1e-12);
    expect(field.totalEnergyReduced() - before).toBeCloseTo(0.015, 13);
  });

  it('atomically settles a forced A-to-B reaction batch through the production kernel', () => {
    const field = new PeriodicHeatField({
      width: 4,
      height: 4,
      boxWidth: 4,
      boxHeight: 4,
      diffusivity: 0.1,
      heatCapacityDensity: 1,
      initialTemperatureReduced: 1,
      minimumTemperatureReduced: 0.01,
    });
    const species: Array<'A' | 'B'> = ['A', 'A'];
    const result = settleReactionEvents({
      field,
      species,
      events: [{ particleIndex: 1, cellIndex: 5 }, { particleIndex: 0, cellIndex: 5 }],
      reactionHeatReduced: 0.015,
    });
    expect(species).toEqual(['B', 'B']);
    expect(result.consumedA).toBe(2);
    expect(result.producedB).toBe(2);
    expect(result.cells).toEqual([{ cellIndex: 5, count: 2 }]);
    expect(result.fieldEnergyDelta).toBeCloseTo(0.03, 13);
    expect(result.chemicalEnergyDelta).toBe(-0.03);
    expect(result.closureResidual).toBeLessThan(1e-12);

    const rejectedField = PeriodicHeatField.fromSerialized(field.serialize());
    rejectedField.setCellTemperatureReduced(1, 0, 2);
    const rejectedSpecies: Array<'A' | 'B'> = ['A', 'A'];
    const beforeField = rejectedField.serialize();
    expect(() => settleReactionEvents({
      field: rejectedField,
      species: rejectedSpecies,
      events: [{ particleIndex: 0, cellIndex: 1 }, { particleIndex: 1, cellIndex: 2 }],
      reactionHeatReduced: 0.03,
    })).toThrow(WorldDomainError);
    expect(rejectedSpecies).toEqual(['A', 'A']);
    expect(rejectedField.serialize()).toEqual(beforeField);

    const maximumTemperatureField = new PeriodicHeatField({
      width: 4,
      height: 4,
      boxWidth: 4,
      boxHeight: 4,
      diffusivity: 0.1,
      heatCapacityDensity: 1,
      initialTemperatureReduced: WORLD_DOMAIN.maximumResolvedTemperatureKelvin / ARGON_UNITS.epsilonOverKelvin,
      minimumTemperatureReduced: 0.01,
    });
    const maximumTemperatureSpecies: Array<'A' | 'B'> = ['A'];
    const beforeMaximumTemperatureField = maximumTemperatureField.serialize();
    expect(() => settleReactionEvents({
      field: maximumTemperatureField,
      species: maximumTemperatureSpecies,
      events: [{ particleIndex: 0, cellIndex: 5 }],
      reactionHeatReduced: 0.001,
    })).toThrow('maximum resolved temperature');
    expect(maximumTemperatureSpecies).toEqual(['A']);
    expect(maximumTemperatureField.serialize()).toEqual(beforeMaximumTemperatureField);
  });

  it('passes deterministic heat, coupling, conservation and domain verification', () => {
    const result = runThermochemicalVerification();
    expect(result.heatModeRelativeL2Error).toBeLessThan(2e-3);
    expect(Math.abs(result.heatEnergyResidual)).toBeLessThan(5e-12);
    expect(result.fourierMinimumObservedOrder).toBeGreaterThanOrEqual(1.8);
    expect(result.fourierMaximumEnergyResidual).toBeLessThan(5e-12);
    expect(result.gridHeatCapacitySpread).toBeLessThan(1e-12);
    expect(result.gridEnergySpread).toBeLessThan(1e-12);
    expect(result.analyticExchangeMatrix.maximumDifferenceRatioError).toBeLessThanOrEqual(2e-12);
    expect(result.analyticExchangeMatrix.maximumSemigroupError).toBeLessThanOrEqual(2e-12);
    expect(result.forcedReactionConsumedA).toBe(1);
    expect(result.forcedReactionProducedB).toBe(1);
    expect(result.forcedReactionClosureResidual).toBeLessThan(1e-12);
    expect(result.coupledEnergyResidual).toBeLessThan(2e-3);
    expect(result.momentumResidual).toBeLessThan(1e-9);
    expect(result.rawParticleMomentumResidual).toBeLessThan(1e-10);
    expect(result.speciesResidual).toBe(0);
    expect(result.massResidual).toBe(0);
    expect(result.interfaceEnergyMoved).toBeGreaterThan(0);
    expect(result.couplingCoverage).toBeGreaterThanOrEqual(0.9);
    expect(result.reactionCount).toBeGreaterThan(0);
    expect(result.heatClosureResidual).toBeLessThan(1e-8);
    expect(result.exchangeClosureResidual).toBeLessThan(1e-8);
    expect(result.reactionClosureResidual).toBeLessThan(1e-10);
    expect(result.deterministicReplay).toBe(true);
    expect(result.inDomain).toBe(true);
    expect(result.ensemble.seeds).toHaveLength(3);
    expect(result.ensemble.deterministicContinuations).toBe(3);
    expect(result.ensemble.energyResidualTail.maximum).toBeLessThan(5e-4);
    expect(result.ensemble.allInDomain).toBe(true);
  }, 30_000);

  it('replays the complete world and gives sibling branches unique identities', () => {
    const world = new ThermochemicalWorld({ count: 64, gridWidth: 5, gridHeight: 3, seed: 41 });
    world.injectCentralHeatPulse(20);
    world.advance(180);
    const replay = ThermochemicalWorld.fromSerialized(world.serialize());
    expect(replay.advance(40)).toEqual(world.advance(40));

    const firstBranch = world.clone(1);
    const secondBranch = world.clone(2);
    expect(firstBranch.stateId).not.toBe(secondBranch.stateId);
    expect(firstBranch.observe().stateDigest).not.toBe(secondBranch.observe().stateDigest);
    expect(firstBranch.observe().particles).toEqual(secondBranch.observe().particles);
    expect(firstBranch.observe().field).toEqual(secondBranch.observe().field);
    const idempotentBranch = world.clone(1);
    expect(idempotentBranch.observe()).toEqual(firstBranch.observe());
    const divergentFirst = world.clone(3);
    const divergentSecond = world.clone(3);
    divergentFirst.setFieldTemperatureKelvin(100);
    divergentSecond.setFieldTemperatureKelvin(120);
    expect(divergentFirst.stateId).not.toBe(divergentSecond.stateId);
    expect(divergentFirst.observe().lastAction?.actionId).not.toBe(divergentSecond.observe().lastAction?.actionId);
    expect(() => (world.clone as unknown as (ordinal?: number) => ThermochemicalWorld).call(world)).toThrow('positive safe integer');
    firstBranch.advance(10);
    secondBranch.advance(10);
    expect(firstBranch.observe().stateDigest).not.toBe(secondBranch.observe().stateDigest);
    expect(firstBranch.observe().conservation).toEqual(secondBranch.observe().conservation);
  });

  it('distinguishes action histories that reach the same physical microstate', () => {
    const batched = new ThermochemicalWorld({ count: 64, gridWidth: 5, gridHeight: 3, seed: 47 });
    const split = ThermochemicalWorld.fromSerialized(batched.serialize());
    batched.advance(3);
    split.advance(1);
    split.advance(1);
    split.advance(1);

    expect(batched.observe().particles).toEqual(split.observe().particles);
    expect(batched.observe().field).toEqual(split.observe().field);
    expect(batched.stateId).not.toBe(split.stateId);
    expect(batched.observe().stateDigest).not.toBe(split.observe().stateDigest);
    expect(batched.serialize().actionCount).toBe(1);
    expect(split.serialize().actionCount).toBe(3);
  });

  it('creates immutable typed actions and rejects out-of-domain actions atomically', () => {
    const world = new ThermochemicalWorld({ count: 64, gridWidth: 5, gridHeight: 3, seed: 53 });
    const initial = world.observe();
    const heated = world.setFieldTemperatureKelvin(120);
    expect(heated.stateId).not.toBe(initial.stateId);
    expect(heated.stateDigest).not.toBe(initial.stateDigest);
    expect(heated.lastAction?.kind).toBe('set_field_temperature');
    expect(heated.lastAction?.parentStateId).toBe(initial.stateId);
    expect(heated.lastAction?.resultingStateId).toBe(heated.stateId);
    expect(Math.abs(heated.conservation.relativeEnergyResidual)).toBeLessThan(1e-12);

    const beforeRejectedAction = world.serialize();
    expect(() => world.setFieldTemperatureKelvin(181)).toThrow(WorldDomainError);
    expect(world.serialize()).toEqual(beforeRejectedAction);
  });

  it('binds configuration, ledgers and action history into identity and digest', () => {
    const baseline = new ThermochemicalWorld({ count: 64, density: 0.78, gridWidth: 5, gridHeight: 3, seed: 67 });
    const changed = new ThermochemicalWorld({ count: 64, density: 0.81, gridWidth: 5, gridHeight: 3, seed: 67 });
    expect(baseline.worldId).not.toBe(changed.worldId);
    expect(baseline.stateId).not.toBe(changed.stateId);
    expect(Object.isFrozen(baseline.options)).toBe(true);

    baseline.injectCentralHeatPulse(15);
    const exposed = baseline.observe();
    expect(exposed.stateDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    const actionValue = exposed.lastAction?.parameters.deltaKelvin;
    if (exposed.lastAction) expect(() => {
      (exposed.lastAction?.parameters as Record<string, number | string>).deltaKelvin = 1;
    }).toThrow();
    expect(baseline.observe().lastAction?.parameters.deltaKelvin).toBe(actionValue);

    const ledgerTamper = structuredClone(baseline.serialize());
    ledgerTamper.initialTotalEnergy += 10;
    expect(() => ThermochemicalWorld.fromSerialized(ledgerTamper)).toThrow('digest mismatch');

    const fieldTamper = structuredClone(baseline.serialize());
    fieldTamper.field.heatCapacityDensity += 1;
    expect(() => ThermochemicalWorld.fromSerialized(fieldTamper)).toThrow('pre-allocation resource gate');

    const actionTamper = structuredClone(baseline.serialize());
    if (actionTamper.lastAction) (actionTamper.lastAction.parameters as Record<string, number | string>).deltaKelvin = 1;
    expect(() => ThermochemicalWorld.fromSerialized(actionTamper)).toThrow();

    const crossKindTamper = structuredClone(baseline.serialize());
    if (crossKindTamper.lastAction) crossKindTamper.lastAction = { ...crossKindTamper.lastAction, kind: 'step', parameters: { substeps: 1 } };
    expect(() => ThermochemicalWorld.fromSerialized(crossKindTamper)).toThrow('step action does not match its state transition');

    const identityTamper = structuredClone(baseline.serialize());
    identityTamper.stateId = `${identityTamper.stateId}-forged`;
    expect(() => ThermochemicalWorld.fromSerialized(identityTamper)).toThrow('identity is inconsistent');
  });

  it('rejects oversized or inconsistent nested payloads before invoking nested loaders', () => {
    const base = new ThermochemicalWorld({ count: 64, density: 0.78, gridWidth: 5, gridHeight: 3, seed: 71 }).serialize();
    const oversizedCount = structuredClone(base);
    oversizedCount.md.options.count = WORLD_DOMAIN.maximumParticleCount + 1;
    const mismatchedOptions = structuredClone(base);
    mismatchedOptions.md.options.density += 0.01;
    const oversizedGrid = structuredClone(base);
    oversizedGrid.field.width = WORLD_DOMAIN.maximumGridDimension + 1;
    const mismatchedValues = structuredClone(base);
    mismatchedValues.field.values.push(mismatchedValues.field.values[0]);

    const mdLoader = vi.spyOn(LennardJonesSimulation, 'fromSerialized').mockImplementation(() => { throw new Error('nested MD loader was invoked'); });
    const fieldLoader = vi.spyOn(PeriodicHeatField, 'fromSerialized').mockImplementation(() => { throw new Error('nested field loader was invoked'); });
    try {
      for (const state of [oversizedCount, mismatchedOptions, oversizedGrid, mismatchedValues]) {
        expect(() => ThermochemicalWorld.fromSerialized(state)).toThrow('pre-allocation resource gate');
      }
      expect(mdLoader).not.toHaveBeenCalled();
      expect(fieldLoader).not.toHaveBeenCalled();
    } finally {
      mdLoader.mockRestore();
      fieldLoader.mockRestore();
    }
  });

  it('rejects a broken top-level to last-action parent chain before digest verification', () => {
    const world = new ThermochemicalWorld({ count: 64, density: 0.78, gridWidth: 5, gridHeight: 3, seed: 79 });
    world.injectCentralHeatPulse(15);
    const broken = structuredClone(world.serialize());
    broken.parentStateId = broken.stateId;
    expect(() => ThermochemicalWorld.fromSerialized(broken)).toThrow('parent chain is inconsistent');
  });

  it('rejects publicly re-signed parent IDs outside the direct namespace and revision lineage', () => {
    const world = new ThermochemicalWorld({ count: 64, density: 0.78, gridWidth: 5, gridHeight: 3, seed: 83 });
    world.advance(3);
    const valid = world.serialize();
    const digestControl = structuredClone(valid);
    resignWorldState(digestControl);
    expect(digestControl.stateDigest).toBe(valid.stateDigest);
    expect(digestControl.lastAction?.actionId).toBe(valid.lastAction?.actionId);

    const evilNamespace = structuredClone(valid);
    const substeps = evilNamespace.lastAction?.parameters.substeps as number;
    const parentStep = evilNamespace.md.step - substeps;
    const parentRevision = evilNamespace.revision - substeps - 1;
    const evilParent = forgedParentStateId(`${evilNamespace.worldId}-bzz`, parentStep, parentRevision);
    evilNamespace.parentStateId = evilParent;
    if (evilNamespace.lastAction) evilNamespace.lastAction.parentStateId = evilParent;
    resignWorldState(evilNamespace);
    expect(evilNamespace.stateDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(() => ThermochemicalWorld.fromSerialized(evilNamespace)).toThrow('namespace lineage is inconsistent');

    const evilRevision = structuredClone(valid);
    const wrongRevisionParent = forgedParentStateId(evilRevision.stateNamespace, parentStep, parentRevision + 1);
    evilRevision.parentStateId = wrongRevisionParent;
    if (evilRevision.lastAction) evilRevision.lastAction.parentStateId = wrongRevisionParent;
    resignWorldState(evilRevision);
    expect(() => ThermochemicalWorld.fromSerialized(evilRevision)).toThrow('parent revision is inconsistent');

    const branchRoot = new ThermochemicalWorld({ count: 64, density: 0.78, gridWidth: 5, gridHeight: 3, seed: 89 });
    branchRoot.advance(2);
    const validBranch = branchRoot.clone(7).serialize();
    expect(ThermochemicalWorld.fromSerialized(validBranch).serialize()).toEqual(validBranch);
    const evilBranch = structuredClone(validBranch);
    const evilBranchParent = forgedParentStateId(`${evilBranch.worldId}-b9`, evilBranch.md.step, evilBranch.revision - 1);
    evilBranch.parentStateId = evilBranchParent;
    if (evilBranch.lastAction) evilBranch.lastAction.parentStateId = evilBranchParent;
    resignWorldState(evilBranch);
    expect(() => ThermochemicalWorld.fromSerialized(evilBranch)).toThrow('namespace lineage is inconsistent');
  });

  it('rejects transitions that leave the resolved or numerical domain atomically', () => {
    expect(Object.isFrozen(WORLD_DOMAIN)).toBe(true);
    const pulseWorld = new ThermochemicalWorld();
    const beforePulse = pulseWorld.serialize();
    expect(() => pulseWorld.injectCentralHeatPulse(80)).toThrow(WorldDomainError);
    expect(pulseWorld.serialize()).toEqual(beforePulse);

    expect(() => new ThermochemicalWorld({ timeStep: 0.01, couplingTau: 0.05 })).toThrow(WorldDomainError);
    expect(() => new ThermochemicalWorld({ seed: 0x1_0000_0001 })).toThrow(WorldDomainError);
    expect(() => new ThermochemicalWorld({ count: 64, gridWidth: 9, gridHeight: 8 })).toThrow(WorldDomainError);

    const extremeOptions = {
      count: 256,
      density: 0.95,
      temperatureKelvin: 140,
      timeStep: 0.004,
      cutoff: 2.8,
      gridWidth: 8,
      gridHeight: 8,
      thermalDiffusivity: 0.5,
      fieldHeatCapacityDensity: 0.25,
      couplingTau: 0.05,
      reactionPreexponential: 5,
      reactionActivationReduced: 0,
      seed: 0,
    };
    expect(() => new ThermochemicalWorld({ ...extremeOptions, reactionHeatReduced: 0.05 })).toThrow('single-event settlement domain');
    const zeroHeatProbe = new ThermochemicalWorld({ ...extremeOptions, reactionHeatReduced: 0 });
    const probeField = zeroHeatProbe.serialize().field;
    const boundaryHeat = WORLD_DOMAIN.maximumReactionCellEnergyFraction
      * probeField.minimumTemperatureReduced * probeField.heatCapacityDensity
      * probeField.boxWidth * probeField.boxHeight / probeField.values.length;
    const boundaryWorld = new ThermochemicalWorld({ ...extremeOptions, reactionHeatReduced: boundaryHeat });
    expect(boundaryWorld.advance(1).validityDomain.status).toBe('in_domain');

    const expensive = new ThermochemicalWorld({ count: 256, gridWidth: 8, gridHeight: 8 });
    const beforeAdvance = expensive.serialize();
    expect(() => expensive.advance(2_000)).toThrow(WorldDomainError);
    expect(expensive.serialize()).toEqual(beforeAdvance);
  });
});
