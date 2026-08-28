import { describe, expect, it } from 'vitest';
import {
  forceShiftedPotential,
  forceShiftedRadialDerivative,
  LennardJonesSimulation,
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
    const branch = original.clone();
    expect(replay.advance(30).particles).toEqual(original.advance(30).particles);
    expect(branch.observe().parentStateId).toBe(baseStateId);
    expect(branch.observe().stateId).not.toBe(original.observe().stateId);
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
