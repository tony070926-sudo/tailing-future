import { describe, expect, it } from 'vitest';
import {
  forceShiftedPotential,
  forceShiftedRadialDerivative,
  LennardJonesSimulation,
  type ParticleState,
} from './lennard-jones';

describe('force-shifted Lennard-Jones pair model', () => {
  it('is continuous in potential and force at the cutoff', () => {
    const cutoff = 2.5;
    expect(forceShiftedPotential(cutoff)).toBe(0);
    expect(forceShiftedRadialDerivative(cutoff)).toBe(0);
    expect(Math.abs(forceShiftedPotential(cutoff - 1e-8))).toBeLessThan(1e-12);
    expect(Math.abs(forceShiftedRadialDerivative(cutoff - 1e-8))).toBeLessThan(2e-9);
  });

  it('matches a finite-difference derivative away from the singularity', () => {
    for (const distance of [0.95, 1.05, 1.3, 1.8, 2.35]) {
      const delta = 1e-6;
      const numerical = (forceShiftedPotential(distance + delta) - forceShiftedPotential(distance - delta)) / (2 * delta);
      expect(Math.abs(numerical - forceShiftedRadialDerivative(distance))).toBeLessThan(2e-5);
    }
  });
});

describe('LennardJonesSimulation', () => {
  it('is deterministic for an identical seed and action sequence', () => {
    const first = new LennardJonesSimulation({ count: 48, seed: 17, temperatureKelvin: 70 });
    const second = new LennardJonesSimulation({ count: 48, seed: 17, temperatureKelvin: 70 });
    first.setTargetTemperatureKelvin(105);
    second.setTargetTemperatureKelvin(105);
    const a = first.advance(240);
    const b = second.advance(240);
    expect(a).toEqual(b);
  });

  it('conserves pair momentum to floating-point precision', () => {
    const simulation = new LennardJonesSimulation({ count: 64, seed: 31 });
    const totalForce = simulation.totalForce();
    expect(Math.abs(totalForce.x)).toBeLessThan(1e-10);
    expect(Math.abs(totalForce.y)).toBeLessThan(1e-10);
  });

  it('keeps particles inside periodic boundaries', () => {
    const simulation = new LennardJonesSimulation({ count: 64, seed: 9, temperatureKelvin: 130 });
    const snapshot = simulation.advance(2_000);
    for (const particle of snapshot.particles) {
      expect(particle.x).toBeGreaterThanOrEqual(0);
      expect(particle.y).toBeGreaterThanOrEqual(0);
      expect(particle.x).toBeLessThan(snapshot.box.width);
      expect(particle.y).toBeLessThan(snapshot.box.height);
    }
  });

  it('replays exactly from a serialized state and isolates a branch', () => {
    const original = new LennardJonesSimulation({ count: 36, seed: 42 });
    original.advance(120);
    const baseStateId = original.observe().stateId;
    const replay = LennardJonesSimulation.fromSerialized(original.serialize());
    const branch = original.clone(1);
    const replayed = replay.advance(30);
    const continued = original.advance(30);
    expect(replayed).toEqual(continued);
    expect(branch.observe().parentStateId).toBe(baseStateId);
    expect(branch.observe().stateId).not.toBe(original.observe().stateId);
  });

  it('changes identity for parameters and actions and gives sibling branches unique IDs', () => {
    const first = new LennardJonesSimulation({ count: 48, density: 0.78, seed: 99 });
    const changedParameter = new LennardJonesSimulation({ count: 48, density: 0.81, seed: 99 });
    expect(first.observe().stateId).not.toBe(changedParameter.observe().stateId);
    const beforeAction = first.observe().stateId;
    first.setTargetTemperatureKelvin(110);
    expect(first.observe().stateId).not.toBe(beforeAction);
    const firstBranch = first.clone(1);
    const secondBranch = first.clone(2);
    expect(firstBranch.observe().stateId).not.toBe(secondBranch.observe().stateId);
    expect(firstBranch.observe().stateDigest).not.toBe(secondBranch.observe().stateDigest);
    expect(firstBranch.observe().particles).toEqual(secondBranch.observe().particles);
    expect(firstBranch.observe().metrics).toEqual(secondBranch.observe().metrics);
    const idempotentBranch = first.clone(1);
    expect(idempotentBranch.observe()).toEqual(firstBranch.observe());
    const divergentFirst = first.clone(3);
    const divergentSecond = first.clone(3);
    divergentFirst.setTargetTemperatureKelvin(100);
    divergentSecond.setTargetTemperatureKelvin(120);
    expect(divergentFirst.observe().stateId).not.toBe(divergentSecond.observe().stateId);
    expect(() => (first.clone as unknown as (ordinal?: number) => LennardJonesSimulation).call(first)).toThrow('positive safe integer');
  });

  it('returns immutable-by-copy observations and records the requested density exactly', () => {
    const simulation = new LennardJonesSimulation({ count: 48, density: 0.84, seed: 14 });
    const snapshot = simulation.observe();
    const originalX = snapshot.particles[0].x;
    (snapshot.particles[0] as { x: number }).x += 10;
    expect(simulation.observe().particles[0].x).toBe(originalX);
    expect(Object.isFrozen(simulation.options)).toBe(true);
    expect(Object.isFrozen(simulation.box)).toBe(true);
    expect(snapshot.metrics.densityReduced).toBeCloseTo(0.84, 14);
  });

  it('rolls back a failed numerical transition byte-for-byte', () => {
    const simulation = new LennardJonesSimulation({ count: 48, density: 0.78, seed: 5 });
    const internal = simulation as unknown as { particles: ParticleState[] };
    internal.particles[1].x = internal.particles[0].x;
    internal.particles[1].y = internal.particles[0].y;
    const before = simulation.serialize();
    expect(() => simulation.advance()).toThrow('particle overlap');
    expect(simulation.serialize()).toEqual(before);
  });

  it('rejects non-finite, non-integral and minimum-image-invalid configurations', () => {
    expect(() => new LennardJonesSimulation({ count: Number.NaN })).toThrow();
    expect(() => new LennardJonesSimulation({ count: 48.5 })).toThrow();
    expect(() => new LennardJonesSimulation({ count: 48, temperatureKelvin: -1 })).toThrow();
    expect(() => new LennardJonesSimulation({ count: 48, thermostatTau: 0 })).toThrow();
    expect(() => new LennardJonesSimulation({ count: 8, cutoff: 2.5 })).toThrow('minimum-image');
  });

  it('binds serialized identity and energy metadata into the module digest', () => {
    const simulation = new LennardJonesSimulation({ count: 48, seed: 27 });
    simulation.advance(12);
    expect(simulation.serialize().stateDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    const energyTamper = structuredClone(simulation.serialize());
    energyTamper.initialEnergy += 1;
    expect(() => LennardJonesSimulation.fromSerialized(energyTamper)).toThrow('digest mismatch');

    const boxTamper = structuredClone(simulation.serialize());
    boxTamper.box.width += 1;
    expect(() => LennardJonesSimulation.fromSerialized(boxTamper)).toThrow('digest mismatch');

    const forceTamper = structuredClone(simulation.serialize());
    forceTamper.particles[0].fx += 1;
    expect(() => LennardJonesSimulation.fromSerialized(forceTamper)).toThrow('digest mismatch');

    const identityTamper = structuredClone(simulation.serialize());
    identityTamper.stateId = `${identityTamper.stateId}-forged`;
    expect(() => LennardJonesSimulation.fromSerialized(identityTamper)).toThrow('identity is inconsistent');
  });

  it('limits NVE energy drift for a stable trajectory', () => {
    const simulation = new LennardJonesSimulation({
      count: 48,
      density: 0.78,
      temperatureKelvin: 45,
      timeStep: 0.001,
      thermostatTau: null,
      seed: 12,
    });
    const snapshot = simulation.advance(10_000);
    expect(Number.isFinite(snapshot.metrics.relativeEnergyDrift)).toBe(true);
    expect(Math.abs(snapshot.metrics.relativeEnergyDrift)).toBeLessThan(1e-3);
  });
});
