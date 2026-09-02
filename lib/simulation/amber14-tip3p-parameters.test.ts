import { describe, expect, it } from 'vitest';
import { digestValue } from './digest.ts';
import {
  AMBER14_TIP3P_PARAMETERS_V042 as parameters,
  AMBER14_TIP3P_SOURCE_V042 as source,
} from './amber14-tip3p-parameters.ts';

describe('pinned Amber14 TIP3P and Joung-Cheatham parameter receipt', () => {
  it('keeps source units and exact nanometer-to-angstrom conversions together', () => {
    for (const site of Object.values(parameters.sites)) {
      expect(site.sigmaAngstrom).toBe(site.sourceSigmaNanometer * 10);
    }
    expect(parameters.sites.waterHydrogen.sourceSigmaNanometer).toBe(1);
    expect(parameters.sites.waterHydrogen.sigmaAngstrom).toBe(10);
    expect(parameters.sites.waterHydrogen.epsilonKjMol).toBe(0);
    expect(parameters.sites.sodiumIon.sigmaAngstrom).toBe(2.439280690268249);
    expect(parameters.sites.chlorideIon.sigmaAngstrom).toBe(4.477656957373345);
    expect(parameters.sites.chlorideIon.epsilonKjMol).toBe(0.14891274399999999);
  });

  it('is charge neutral for one rigid water plus one sodium and one chloride ion', () => {
    const waterCharge = parameters.sites.waterOxygen.chargeE
      + 2 * parameters.sites.waterHydrogen.chargeE;
    expect(waterCharge).toBe(0);
    expect(waterCharge + parameters.sites.sodiumIon.chargeE + parameters.sites.chlorideIon.chargeE)
      .toBe(0);
  });

  it('binds all three independent rigid-water distances without an energetic duplicate', () => {
    const geometry = parameters.rigidWaterGeometry;
    const derivedHydrogenHydrogen = 2 * geometry.oxygenHydrogenDistanceAngstrom
      * Math.sin(geometry.hydrogenOxygenHydrogenAngleRadian / 2);
    expect(derivedHydrogenHydrogen).toBeCloseTo(geometry.hydrogenHydrogenDistanceAngstrom, 14);
    expect(geometry.hydrogenHydrogenDerivation)
      .toBe('sqrt(l1*l1+l2*l2-2*l1*l2*cos(theta))');
    expect(geometry.angleLiteralProvenance).toBe('derived-from-rounded-xml-radian-literal');
    expect(parameters.rigidWaterIntramolecularPolicy.requiredDistanceConstraints).toHaveLength(3);
    expect(parameters.rigidWaterIntramolecularPolicy.requiredCoulombExclusions).toHaveLength(3);
    expect(parameters.rigidWaterIntramolecularPolicy.requiredLennardJonesExclusions).toHaveLength(3);
    expect(parameters.rigidWaterIntramolecularPolicy.energeticBondTerms).toBe(0);
    expect(parameters.rigidWaterIntramolecularPolicy.energeticAngleTerms).toBe(0);
  });

  it('pins one primary-source family and does not promote extraction into execution evidence', () => {
    const payload = Object.fromEntries(
      Object.entries(source).filter(([key]) => key !== 'extractionDigest'),
    );
    expect(source.extractionDigest).toBe(digestValue(payload));
    expect(source.sourceCommit).toMatch(/^[0-9a-f]{40}$/);
    expect(source.sha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(parameters.familyId).toMatch(/amber14-tip3p/);
    expect(parameters.claimBoundaries).toEqual({
      sourceValuesExtracted: true,
      openmmExecuted: false,
      openmmReproduced: false,
      trajectoryProduced: false,
      bulkWaterValidated: false,
      licenseClearance: false,
    });
    expect(Object.isFrozen(parameters.sites.waterHydrogen)).toBe(true);
  });
});
