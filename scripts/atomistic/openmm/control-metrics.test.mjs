import { describe, expect, it, vi } from 'vitest';
import {
  OPENMM_TIP3P_CONTROL_SHAPE,
  assertReferenceReplayExact,
  computeCpuReferenceComparison,
  computeEnergyDriftSlopeKjMolPicosecond,
  computeForceGroupClosure,
  computeMaximumConstraintRelativeResidual,
  computeRelativeEnergyExcursion,
  decodeFloat64LittleEndian,
  encodeFloat64LittleEndian,
  evaluateControlGates,
  float32UlpDistance,
} from './control-metrics.mjs';

const { componentCount, particleCount, sampleCount } = OPENMM_TIP3P_CONTROL_SHAPE;

describe('OpenMM TIP3P independent control metrics', () => {
  it('decodes only exact finite little-endian float64 arrays', () => {
    const bytes = encodeFloat64LittleEndian([1.25, -2.5, -0]);
    expect([...decodeFloat64LittleEndian(bytes, 3)]).toEqual([1.25, -2.5, 0]);
    expect(() => decodeFloat64LittleEndian(bytes.subarray(0, 16), 3)).toThrow(/exactly 24 bytes/);
    expect(() => decodeFloat64LittleEndian(encodeFloat64LittleEndian([Number.MAX_VALUE, 1]), 3))
      .toThrow(/exactly 24 bytes/);
    const nan = new Uint8Array(8);
    new DataView(nan.buffer).setFloat64(0, Number.NaN, true);
    expect(() => decodeFloat64LittleEndian(nan, 1)).toThrow(/must be finite/);
    const negativeZero = new Uint8Array(8);
    new DataView(negativeZero.buffer).setFloat64(0, -0, true);
    expect(() => decodeFloat64LittleEndian(negativeZero, 1)).toThrow(/canonical positive zero/);
  });

  it('zero-fills a partially decoded float64 owner before rejecting invalid input', () => {
    const bytes = new Uint8Array(24);
    const view = new DataView(bytes.buffer);
    view.setFloat64(0, 1.25, true);
    view.setFloat64(8, Number.NaN, true);
    view.setFloat64(16, 2.5, true);
    const fill = vi.spyOn(Float64Array.prototype, 'fill');
    try {
      expect(() => decodeFloat64LittleEndian(bytes, 3, 'zeroization probe'))
        .toThrow(/must be finite/);
      expect(fill).toHaveBeenCalledWith(0);
      const zeroizedOwner = fill.mock.instances.at(-1);
      expect(zeroizedOwner).toBeInstanceOf(Float64Array);
      expect([...zeroizedOwner]).toEqual([0, 0, 0]);
    } finally {
      fill.mockRestore();
      bytes.fill(0);
    }
  });

  it('measures energy excursion and linear drift over all 101 samples', () => {
    const times = Float64Array.from({ length: sampleCount }, (_, index) => index / 100);
    const energies = Float64Array.from(times, (time) => -1000 + time * 0.5);
    expect(computeRelativeEnergyExcursion(energies)).toBeCloseTo(0.0005, 14);
    expect(computeEnergyDriftSlopeKjMolPicosecond(energies, times)).toBeCloseTo(0.5, 12);
  });

  it('recomputes all periodic constraints from unwrapped authoritative coordinates', () => {
    const positions = new Float64Array(sampleCount * componentCount);
    const constraints = new Uint32Array(particleCount * 2);
    const targets = new Float64Array(particleCount);
    for (let constraint = 0; constraint < particleCount; constraint += 1) {
      constraints[constraint * 2] = 0;
      constraints[constraint * 2 + 1] = 1;
      targets[constraint] = 0.1;
    }
    for (let sample = 0; sample < sampleCount; sample += 1) {
      for (let particle = 0; particle < particleCount; particle += 1) {
        positions[sample * componentCount + particle * 3] = particle * 0.1;
      }
    }
    const residual = computeMaximumConstraintRelativeResidual({
      positionsNanometer: positions,
      cellVectorsNanometer: Float64Array.from([300, 0, 0, 0, 300, 0, 0, 0, 300]),
      constraintParticleIndices: constraints,
      constraintTargetsNanometer: targets,
    });
    expect(residual).toBeLessThan(1e-10);
  });

  it('computes the locked five-step CPU/Reference energy and force metrics', () => {
    const referenceEnergy = Float64Array.from([-100, -101, -102, -103, -104]);
    const cpuEnergy = Float64Array.from(referenceEnergy, (value) => value * (1 + 1e-6));
    const referenceForce = new Float64Array(5 * componentCount).fill(2);
    const cpuForce = new Float64Array(5 * componentCount).fill(2.000002);
    const result = computeCpuReferenceComparison({
      referencePotentialEnergyKjMol: referenceEnergy,
      cpuPotentialEnergyKjMol: cpuEnergy,
      referencePotentialForceKjMolNanometer: referenceForce,
      cpuPotentialForceKjMolNanometer: cpuForce,
    });
    expect(result.maximumRelativePotentialEnergyDifference).toBeCloseTo(1e-6, 12);
    expect(result.maximumMedianPerParticleRelativeForceError).toBeCloseTo(1e-6, 12);
    expect(result.maximumGlobalRelativeForceL2Error).toBeCloseTo(1e-6, 12);
    expect(result.perStep.map((entry) => entry.step)).toEqual([0, 10, 100, 500, 1000]);
  });

  it('uses separate Reference relative and CPU float32 ULP force closure rules', () => {
    const forceLength = 5 * 5 * componentCount;
    const referenceForces = new Float64Array(forceLength);
    const cpuForces = new Float64Array(forceLength);
    const energies = new Float64Array(25);
    for (let step = 0; step < 5; step += 1) {
      const forceStep = step * 5 * componentCount;
      const energyStep = step * 5;
      for (let group = 1; group < 5; group += 1) {
        energies[energyStep + group] = group;
        for (let component = 0; component < componentCount; component += 1) {
          referenceForces[forceStep + group * componentCount + component] = group;
          cpuForces[forceStep + group * componentCount + component] = Math.fround(group / 10);
        }
      }
      energies[energyStep] = 10;
      for (let component = 0; component < componentCount; component += 1) {
        referenceForces[forceStep + component] = 10;
        let sum = Math.fround(0);
        for (let group = 1; group < 5; group += 1) sum = Math.fround(sum + Math.fround(group / 10));
        cpuForces[forceStep + component] = sum;
      }
    }
    expect(computeForceGroupClosure({ lane: 'Reference', energiesKjMol: energies,
      forcesKjMolNanometer: referenceForces })).toMatchObject({
      maximumEnergyRelativeResidual: 0,
      maximumForceRelativeResidual: 0,
      maximumForceUlpDistanceFloat32: null,
    });
    expect(computeForceGroupClosure({ lane: 'CPU', energiesKjMol: energies,
      forcesKjMolNanometer: cpuForces })).toMatchObject({
      maximumEnergyRelativeResidual: 0,
      maximumForceRelativeResidual: null,
      maximumForceUlpDistanceFloat32: 0,
    });
    expect(float32UlpDistance(1, nextFloat32(1))).toBe(1);
  });

  it('requires exact replay bytes and derives every scientific gate independently', () => {
    expect(assertReferenceReplayExact([{ name: 'positions', referenceA: Uint8Array.of(1, 2),
      referenceB: Uint8Array.of(1, 2) }])).toBe(true);
    expect(() => assertReferenceReplayExact([{ name: 'positions', referenceA: Uint8Array.of(1, 2),
      referenceB: Uint8Array.of(1, 3) }])).toThrow(/byte 1/);
    expect(evaluateControlGates({
      referenceExactReplay: true,
      relativeEnergyExcursion: 1e-4,
      maximumConstraintRelativeResidual: 1e-8,
      maximumRelativePotentialEnergyDifference: 1e-6,
      maximumMedianPerParticleRelativeForceError: 1e-5,
      maximumGlobalRelativeForceL2Error: 1e-5,
      referenceMaximumEnergyGroupRelativeResidual: 1e-10,
      referenceMaximumForceGroupRelativeResidual: 1e-10,
      cpuMaximumEnergyGroupRelativeResidual: 1e-10,
      cpuMaximumForceGroupUlpDistanceFloat32: 1,
      productionStartCenterOfMassSpeedNanometerPerPicosecond: 1e-14,
      productionStartMaximumVelocityConstraintRelativeResidual: 1e-10,
    })).toMatchObject({ status: 'verified-pass' });
  });
});

function nextFloat32(value) {
  const bytes = new ArrayBuffer(4);
  const view = new DataView(bytes);
  view.setFloat32(0, value, false);
  view.setUint32(0, view.getUint32(0, false) + 1, false);
  return view.getFloat32(0, false);
}
