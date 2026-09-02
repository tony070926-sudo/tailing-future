import { digestValue } from './digest.ts';

export type Amber14Tip3pSiteParameterV042 = Readonly<{
  siteType: 'water-oxygen' | 'water-hydrogen' | 'sodium-ion' | 'chloride-ion';
  element: 'O' | 'H' | 'Na' | 'Cl';
  massDalton: number;
  chargeE: number;
  sourceSigmaNanometer: number;
  sigmaAngstrom: number;
  epsilonKjMol: number;
}>;

const SOURCE_PAYLOAD = {
  evidenceClass: 'primary-source-parameter-extraction-not-execution' as const,
  owner: 'OpenMM',
  repository: 'https://github.com/openmm/openmm',
  sourceCommit: 'f7fa0c27c1f8d943c339d67b3bf22f026d0bd8b5',
  filePath: 'wrappers/python/openmm/app/data/amber14/tip3p.xml',
  rawUrl: 'https://raw.githubusercontent.com/openmm/openmm/f7fa0c27c1f8d943c339d67b3bf22f026d0bd8b5/wrappers/python/openmm/app/data/amber14/tip3p.xml',
  sizeBytes: 19_070,
  sha256: 'sha256:3f4b188dbcb6c02863230eaca231e927fb6bf3307ce947d8a50d0f46f6dd83d9',
  executionPerformed: false as const,
  reproductionPerformed: false as const,
  licenseClearance: false as const,
};

export const AMBER14_TIP3P_SOURCE_V042 = deepFreeze({
  ...SOURCE_PAYLOAD,
  extractionDigest: digestValue(SOURCE_PAYLOAD),
});

export const AMBER14_TIP3P_PARAMETERS_V042 = deepFreeze({
  schemaVersion: 'tf.amber14-tip3p-parameter-receipt/0.4.2' as const,
  familyId: 'openmm-amber14-tip3p-joung-cheatham-explicit-solvent' as const,
  source: AMBER14_TIP3P_SOURCE_V042,
  units: {
    sourceLength: 'nanometer' as const,
    runtimeLength: 'angstrom' as const,
    nanometerToAngstrom: 10 as const,
    energy: 'kilojoule-per-mole' as const,
    charge: 'elementary-charge' as const,
    mass: 'dalton' as const,
  },
  combiningRule: {
    name: 'lorentz-berthelot' as const,
    sigma: 'arithmetic-mean' as const,
    epsilon: 'geometric-mean' as const,
  },
  sites: {
    waterOxygen: site('water-oxygen', 'O', 15.99943, -0.834, 0.31507524065751241, 0.635968),
    waterHydrogen: site('water-hydrogen', 'H', 1.007947, 0.417, 1, 0),
    sodiumIon: site('sodium-ion', 'Na', 22.99, 1, 0.2439280690268249, 0.3658460312),
    chlorideIon: site('chloride-ion', 'Cl', 35.45, -1, 0.4477656957373345, 0.14891274399999999),
  },
  rigidWaterGeometry: {
    oxygenHydrogenDistanceNanometer: 0.09572,
    oxygenHydrogenDistanceAngstrom: 0.9572,
    hydrogenOxygenHydrogenAngleRadian: 1.82421813418,
    hydrogenHydrogenDistanceAngstrom: 1.5139006545247014,
    hydrogenHydrogenDerivation: 'sqrt(l1*l1+l2*l2-2*l1*l2*cos(theta))' as const,
    angleLiteralProvenance: 'derived-from-rounded-xml-radian-literal' as const,
    independentDistanceConstraints: 3 as const,
  },
  xmlScales: {
    coulomb14Scale: 0.8333333333333334,
    lennardJones14Scale: 0.5,
  },
  rigidWaterIntramolecularPolicy: {
    energeticBondTerms: 0 as const,
    energeticAngleTerms: 0 as const,
    requiredDistanceConstraints: ['O-H1', 'O-H2', 'H1-H2'] as const,
    requiredCoulombExclusions: ['O-H1', 'O-H2', 'H1-H2'] as const,
    requiredLennardJonesExclusions: ['O-H1', 'O-H2', 'H1-H2'] as const,
  },
  claimBoundaries: {
    sourceValuesExtracted: true as const,
    openmmExecuted: false as const,
    openmmReproduced: false as const,
    trajectoryProduced: false as const,
    bulkWaterValidated: false as const,
    licenseClearance: false as const,
  },
});

function site(
  siteType: Amber14Tip3pSiteParameterV042['siteType'],
  element: Amber14Tip3pSiteParameterV042['element'],
  massDalton: number,
  chargeE: number,
  sourceSigmaNanometer: number,
  epsilonKjMol: number,
): Amber14Tip3pSiteParameterV042 {
  return {
    siteType,
    element,
    massDalton,
    chargeE,
    sourceSigmaNanometer,
    sigmaAngstrom: sourceSigmaNanometer * 10,
    epsilonKjMol,
  };
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
