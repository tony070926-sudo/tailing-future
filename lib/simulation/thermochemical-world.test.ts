import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import actionSchema from '../../schemas/action.schema.json' with { type: 'json' };
import worldStateSchema from '../../schemas/world-state.schema.json' with { type: 'json' };
import { LennardJonesSimulation } from './lennard-jones';
import {
  fourierModeRelativeL2Error,
  PeriodicHeatField,
  reactionProbability,
  runThermochemicalVerification,
  ThermochemicalWorld,
  WORLD_DOMAIN,
  WorldDomainError,
} from './thermochemical-world';

describe('PeriodicHeatField', () => {
  it('preserves a uniform periodic field and total field energy', () => {
    const field = new PeriodicHeatField({
      width: 12,
      height: 8,
      boxWidth: 3,
      boxHeight: 2,
      diffusivity: 0.2,
      heatCapacity: 3,
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
      heatCapacity: 1,
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

  it('uses the exact constant-hazard survival probability', () => {
    const rate = 0.27;
    const dt = 0.003;
    const steps = 8_000;
    const probability = reactionProbability(rate, dt);
    expect((1 - probability) ** steps).toBeCloseTo(Math.exp(-rate * dt * steps), 12);
  });

  it('passes deterministic heat, coupling, conservation and domain verification', () => {
    const result = runThermochemicalVerification();
    expect(result.heatModeRelativeL2Error).toBeLessThan(2e-3);
    expect(Math.abs(result.heatEnergyResidual)).toBeLessThan(5e-12);
    expect(result.coupledEnergyResidual).toBeLessThan(2e-3);
    expect(result.momentumResidual).toBeLessThan(1e-9);
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
  });

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
    const actionValue = exposed.lastAction?.parameters.deltaKelvin;
    if (exposed.lastAction) expect(() => {
      (exposed.lastAction?.parameters as Record<string, number | string>).deltaKelvin = 1;
    }).toThrow();
    expect(baseline.observe().lastAction?.parameters.deltaKelvin).toBe(actionValue);

    const ledgerTamper = structuredClone(baseline.serialize());
    ledgerTamper.initialTotalEnergy += 10;
    expect(() => ThermochemicalWorld.fromSerialized(ledgerTamper)).toThrow('digest mismatch');

    const fieldTamper = structuredClone(baseline.serialize());
    fieldTamper.field.heatCapacity += 1;
    expect(() => ThermochemicalWorld.fromSerialized(fieldTamper)).toThrow('configuration does not match');

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

  it('rejects transitions that leave the resolved or numerical domain atomically', () => {
    expect(Object.isFrozen(WORLD_DOMAIN)).toBe(true);
    const pulseWorld = new ThermochemicalWorld();
    const beforePulse = pulseWorld.serialize();
    expect(() => pulseWorld.injectCentralHeatPulse(80)).toThrow(WorldDomainError);
    expect(pulseWorld.serialize()).toEqual(beforePulse);

    const aggressive = new ThermochemicalWorld({ timeStep: 0.01, couplingTau: 0.05 });
    const beforeAdvance = aggressive.serialize();
    expect(() => aggressive.advance(1_200)).toThrow(WorldDomainError);
    expect(aggressive.serialize()).toEqual(beforeAdvance);
  });
});
