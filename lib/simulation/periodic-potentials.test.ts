import { describe, expect, it } from 'vitest';
import {
  evaluateForceShiftedRadialPotential,
  evaluateRadialPotential,
  radialForceVectorOnTarget,
  type RadialPotential,
} from './periodic-potentials.ts';

const POTENTIALS: ReadonlyArray<Readonly<{ potential: RadialPotential; chargeProductE2: number; samples: ReadonlyArray<number> }>> = [
  {
    potential: { kind: 'coulomb-minimum-image-reference', relativePermittivity: 1 },
    chargeProductE2: -0.55,
    samples: [1.7, 2.3, 4.1],
  },
  {
    potential: { kind: 'lennard-jones-12-6', epsilonKjMol: 0.997, sigmaAngstrom: 3.405 },
    chargeProductE2: 0,
    samples: [3.2, 3.8, 4.6],
  },
  {
    potential: {
      kind: 'buckingham-exp-6',
      exponentialPrefactorKjMol: 120_000,
      decayInverseAngstrom: 3.2,
      dispersionKjMolAngstrom6: 1_500,
    },
    chargeProductE2: 0,
    samples: [1.9, 2.5, 3.7],
  },
  {
    potential: {
      kind: 'morse',
      wellDepthKjMol: 18,
      widthInverseAngstrom: 1.7,
      equilibriumDistanceAngstrom: 2.2,
      energyZero: 'minimum',
    },
    chargeProductE2: 0,
    samples: [1.8, 2.2, 3.1],
  },
  {
    potential: {
      kind: 'harmonic-bond',
      forceConstantKjMolAngstrom2: 450,
      equilibriumDistanceAngstrom: 1.05,
    },
    chargeProductE2: 0,
    samples: [0.9, 1.05, 1.3],
  },
];

describe('periodic radial potentials', () => {
  it('matches -dU/dr by independent centered finite differences for every supported term', () => {
    for (const { potential, chargeProductE2, samples } of POTENTIALS) {
      for (const distance of samples) {
        const delta = 1e-6;
        const plus = evaluateRadialPotential(potential, distance + delta, chargeProductE2).energyKjMol;
        const minus = evaluateRadialPotential(potential, distance - delta, chargeProductE2).energyKjMol;
        const numericalForce = -(plus - minus) / (2 * delta);
        const analytical = evaluateRadialPotential(potential, distance, chargeProductE2).forceMagnitudeOnTargetKjMolAngstrom;
        expect(relativeError(analytical, numericalForce)).toBeLessThan(2e-8);
      }
    }
  });

  it('has the correct attractive and repulsive signs around equilibrium', () => {
    const lj = { kind: 'lennard-jones-12-6', epsilonKjMol: 1, sigmaAngstrom: 3 } as const;
    const equilibrium = 2 ** (1 / 6) * lj.sigmaAngstrom;
    expect(evaluateRadialPotential(lj, equilibrium * 0.9).forceMagnitudeOnTargetKjMolAngstrom).toBeGreaterThan(0);
    expect(Math.abs(evaluateRadialPotential(lj, equilibrium).forceMagnitudeOnTargetKjMolAngstrom)).toBeLessThan(1e-12);
    expect(evaluateRadialPotential(lj, equilibrium * 1.1).forceMagnitudeOnTargetKjMolAngstrom).toBeLessThan(0);

    const harmonic = { kind: 'harmonic-bond', forceConstantKjMolAngstrom2: 300, equilibriumDistanceAngstrom: 1 } as const;
    expect(evaluateRadialPotential(harmonic, 0.9).forceMagnitudeOnTargetKjMolAngstrom).toBeGreaterThan(0);
    expect(evaluateRadialPotential(harmonic, 1.1).forceMagnitudeOnTargetKjMolAngstrom).toBeLessThan(0);
  });

  it('force-shifts every nonbonded term continuously to zero at the cutoff', () => {
    for (const { potential, chargeProductE2 } of POTENTIALS) {
      if (potential.kind === 'harmonic-bond') continue;
      const cutoff = 5.2;
      expect(evaluateForceShiftedRadialPotential(potential, cutoff, cutoff, chargeProductE2)).toEqual({
        energyKjMol: 0,
        forceMagnitudeOnTargetKjMolAngstrom: 0,
      });
      const justInside = evaluateForceShiftedRadialPotential(potential, cutoff - 1e-7, cutoff, chargeProductE2);
      expect(Math.abs(justInside.energyKjMol)).toBeLessThan(1e-9);
      expect(Math.abs(justInside.forceMagnitudeOnTargetKjMolAngstrom)).toBeLessThan(2e-4);

      const distance = 3.7;
      const delta = 1e-6;
      const plus = evaluateForceShiftedRadialPotential(potential, distance + delta, cutoff, chargeProductE2).energyKjMol;
      const minus = evaluateForceShiftedRadialPotential(potential, distance - delta, cutoff, chargeProductE2).energyKjMol;
      const numericalForce = -(plus - minus) / (2 * delta);
      const analytical = evaluateForceShiftedRadialPotential(potential, distance, cutoff, chargeProductE2).forceMagnitudeOnTargetKjMolAngstrom;
      expect(relativeError(analytical, numericalForce)).toBeLessThan(2e-7);
    }
  });

  it('maps a radial force onto the source-to-target direction without inventing a component', () => {
    const force = radialForceVectorOnTarget({ x: 2, y: -3, z: 6 }, 14);
    expect(force).toEqual({ x: 4, y: -6, z: 12 });
    expect(Math.hypot(force.x, force.y, force.z)).toBe(14);
  });

  it('keeps the minimum-image Coulomb role explicit and rejects invalid domains', () => {
    const unlike = evaluateRadialPotential(
      { kind: 'coulomb-minimum-image-reference', relativePermittivity: 1 },
      2,
      -1,
    );
    expect(unlike.energyKjMol).toBeLessThan(0);
    expect(unlike.forceMagnitudeOnTargetKjMolAngstrom).toBeLessThan(0);
    expect(() => evaluateRadialPotential({ kind: 'lennard-jones-12-6', epsilonKjMol: -1, sigmaAngstrom: 3 }, 3)).toThrow();
    expect(() => evaluateRadialPotential({ kind: 'coulomb-minimum-image-reference', relativePermittivity: 0 }, 2, 1)).toThrow();
    expect(() => evaluateRadialPotential(POTENTIALS[1].potential, 0)).toThrow('overlap');
    expect(() => evaluateForceShiftedRadialPotential(
      { kind: 'lennard-jones-12-6', epsilonKjMol: -1, sigmaAngstrom: 3 },
      8,
      5,
    )).toThrow('positive');
  });
});

function relativeError(actual: number, expected: number) {
  return Math.abs(actual - expected) / Math.max(1, Math.abs(actual), Math.abs(expected));
}
