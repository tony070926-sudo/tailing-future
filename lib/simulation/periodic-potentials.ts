import type { Vector3 } from '../molecular/molecular-interactions.ts';
import { COULOMB_CONSTANT_KJ_MOL_ANGSTROM_E2 } from '../molecular/molecular-interactions.ts';

export type CoulombMinimumImagePotential = Readonly<{
  kind: 'coulomb-minimum-image-reference';
  relativePermittivity: number;
  electrostaticConstantKjMolAngstromE2?: number;
}>;

export type LennardJonesPotential = Readonly<{
  kind: 'lennard-jones-12-6';
  epsilonKjMol: number;
  sigmaAngstrom: number;
}>;

export type BuckinghamPotential = Readonly<{
  kind: 'buckingham-exp-6';
  exponentialPrefactorKjMol: number;
  decayInverseAngstrom: number;
  dispersionKjMolAngstrom6: number;
}>;

export type MorsePotential = Readonly<{
  kind: 'morse';
  wellDepthKjMol: number;
  widthInverseAngstrom: number;
  equilibriumDistanceAngstrom: number;
  energyZero: 'minimum';
}>;

export type HarmonicBondPotential = Readonly<{
  kind: 'harmonic-bond';
  forceConstantKjMolAngstrom2: number;
  equilibriumDistanceAngstrom: number;
}>;

export type NonbondedRadialPotential =
  | CoulombMinimumImagePotential
  | LennardJonesPotential
  | BuckinghamPotential
  | MorsePotential;

export type BondedRadialPotential = HarmonicBondPotential | MorsePotential;
export type RadialPotential = NonbondedRadialPotential | HarmonicBondPotential;

export type RadialPotentialEvaluation = Readonly<{
  energyKjMol: number;
  forceMagnitudeOnTargetKjMolAngstrom: number;
}>;

export type CompositeRadialEvaluation = RadialPotentialEvaluation & Readonly<{
  energyByKindKjMol: Readonly<Record<RadialPotential['kind'], number>>;
  forceMagnitudeByKindKjMolAngstrom: Readonly<Record<RadialPotential['kind'], number>>;
}>;

const MINIMUM_DISTANCE_ANGSTROM = 1e-8;

/**
 * Evaluates U(r) and -dU/dr. Positive force magnitude points from source to
 * target and is therefore repulsive; negative magnitude is attractive.
 */
export function evaluateRadialPotential(
  potential: RadialPotential,
  distanceAngstrom: number,
  chargeProductE2 = 0,
): RadialPotentialEvaluation {
  assertDistance(distanceAngstrom);
  assertPotential(potential);
  if (!Number.isFinite(chargeProductE2)) throw new Error('charge product must be finite');

  switch (potential.kind) {
    case 'coulomb-minimum-image-reference': {
      const constant = potential.electrostaticConstantKjMolAngstromE2 ?? COULOMB_CONSTANT_KJ_MOL_ANGSTROM_E2;
      const prefactor = constant * chargeProductE2 / potential.relativePermittivity;
      return {
        energyKjMol: prefactor / distanceAngstrom,
        forceMagnitudeOnTargetKjMolAngstrom: prefactor / distanceAngstrom ** 2,
      };
    }
    case 'lennard-jones-12-6': {
      const ratio = potential.sigmaAngstrom / distanceAngstrom;
      const ratio6 = ratio ** 6;
      const ratio12 = ratio6 ** 2;
      return {
        energyKjMol: 4 * potential.epsilonKjMol * (ratio12 - ratio6),
        forceMagnitudeOnTargetKjMolAngstrom: 24 * potential.epsilonKjMol * (2 * ratio12 - ratio6) / distanceAngstrom,
      };
    }
    case 'buckingham-exp-6': {
      const exponential = Math.exp(-potential.decayInverseAngstrom * distanceAngstrom);
      return {
        energyKjMol: potential.exponentialPrefactorKjMol * exponential - potential.dispersionKjMolAngstrom6 / distanceAngstrom ** 6,
        forceMagnitudeOnTargetKjMolAngstrom:
          potential.exponentialPrefactorKjMol * potential.decayInverseAngstrom * exponential
          - 6 * potential.dispersionKjMolAngstrom6 / distanceAngstrom ** 7,
      };
    }
    case 'morse': {
      const exponential = Math.exp(-potential.widthInverseAngstrom * (distanceAngstrom - potential.equilibriumDistanceAngstrom));
      return {
        energyKjMol: potential.wellDepthKjMol * (1 - exponential) ** 2,
        forceMagnitudeOnTargetKjMolAngstrom:
          -2 * potential.wellDepthKjMol * potential.widthInverseAngstrom * exponential * (1 - exponential),
      };
    }
    case 'harmonic-bond': {
      const extension = distanceAngstrom - potential.equilibriumDistanceAngstrom;
      return {
        energyKjMol: 0.5 * potential.forceConstantKjMolAngstrom2 * extension ** 2,
        forceMagnitudeOnTargetKjMolAngstrom: -potential.forceConstantKjMolAngstrom2 * extension,
      };
    }
  }
}

/**
 * Applies the force-shift transform U_sf=U-U(rc)+(r-rc)F(rc), so both U and
 * F=-dU/dr are exactly zero at the declared cutoff. This is a local short-range
 * reference treatment, not Ewald/PME periodic electrostatics.
 */
export function evaluateForceShiftedRadialPotential(
  potential: NonbondedRadialPotential,
  distanceAngstrom: number,
  cutoffAngstrom: number,
  chargeProductE2 = 0,
): RadialPotentialEvaluation {
  assertDistance(distanceAngstrom);
  if (!(Number.isFinite(cutoffAngstrom) && cutoffAngstrom > MINIMUM_DISTANCE_ANGSTROM)) {
    throw new Error('force-shift cutoff must be finite and positive');
  }
  assertPotential(potential);
  if (distanceAngstrom >= cutoffAngstrom) return { energyKjMol: 0, forceMagnitudeOnTargetKjMolAngstrom: 0 };
  const value = evaluateRadialPotential(potential, distanceAngstrom, chargeProductE2);
  const atCutoff = evaluateRadialPotential(potential, cutoffAngstrom, chargeProductE2);
  return {
    energyKjMol: value.energyKjMol - atCutoff.energyKjMol
      + (distanceAngstrom - cutoffAngstrom) * atCutoff.forceMagnitudeOnTargetKjMolAngstrom,
    forceMagnitudeOnTargetKjMolAngstrom:
      value.forceMagnitudeOnTargetKjMolAngstrom - atCutoff.forceMagnitudeOnTargetKjMolAngstrom,
  };
}

export function evaluateForceShiftedPotentialTerms(
  potentials: ReadonlyArray<NonbondedRadialPotential>,
  distanceAngstrom: number,
  cutoffAngstrom: number,
  chargeProductE2 = 0,
): CompositeRadialEvaluation {
  const energyByKind = emptyEnergyRecord();
  const forceByKind = emptyEnergyRecord();
  let energyKjMol = 0;
  let forceMagnitudeOnTargetKjMolAngstrom = 0;
  for (const potential of potentials) {
    const value = evaluateForceShiftedRadialPotential(potential, distanceAngstrom, cutoffAngstrom, chargeProductE2);
    energyKjMol += value.energyKjMol;
    forceMagnitudeOnTargetKjMolAngstrom += value.forceMagnitudeOnTargetKjMolAngstrom;
    energyByKind[potential.kind] += value.energyKjMol;
    forceByKind[potential.kind] += value.forceMagnitudeOnTargetKjMolAngstrom;
  }
  return { energyKjMol, forceMagnitudeOnTargetKjMolAngstrom, energyByKindKjMol: energyByKind, forceMagnitudeByKindKjMolAngstrom: forceByKind };
}

export function radialForceVectorOnTarget(
  displacementSourceToTargetAngstrom: Vector3,
  forceMagnitudeOnTargetKjMolAngstrom: number,
): Vector3 {
  if (!Number.isFinite(forceMagnitudeOnTargetKjMolAngstrom)) throw new Error('radial force magnitude must be finite');
  const distance = Math.hypot(
    displacementSourceToTargetAngstrom.x,
    displacementSourceToTargetAngstrom.y,
    displacementSourceToTargetAngstrom.z,
  );
  assertDistance(distance);
  const scale = forceMagnitudeOnTargetKjMolAngstrom / distance;
  return {
    x: displacementSourceToTargetAngstrom.x * scale,
    y: displacementSourceToTargetAngstrom.y * scale,
    z: displacementSourceToTargetAngstrom.z * scale,
  };
}

export function assertPotential(potential: RadialPotential) {
  if (!potential || typeof potential !== 'object') throw new Error('radial potential must be an object');
  switch (potential.kind) {
    case 'coulomb-minimum-image-reference':
      assertPositive('relativePermittivity', potential.relativePermittivity);
      if (potential.electrostaticConstantKjMolAngstromE2 !== undefined) {
        assertPositive('electrostaticConstantKjMolAngstromE2', potential.electrostaticConstantKjMolAngstromE2);
      }
      return;
    case 'lennard-jones-12-6':
      assertPositive('epsilonKjMol', potential.epsilonKjMol);
      assertPositive('sigmaAngstrom', potential.sigmaAngstrom);
      return;
    case 'buckingham-exp-6':
      assertPositive('exponentialPrefactorKjMol', potential.exponentialPrefactorKjMol);
      assertPositive('decayInverseAngstrom', potential.decayInverseAngstrom);
      assertNonnegative('dispersionKjMolAngstrom6', potential.dispersionKjMolAngstrom6);
      return;
    case 'morse':
      assertPositive('wellDepthKjMol', potential.wellDepthKjMol);
      assertPositive('widthInverseAngstrom', potential.widthInverseAngstrom);
      assertPositive('equilibriumDistanceAngstrom', potential.equilibriumDistanceAngstrom);
      if (potential.energyZero !== 'minimum') throw new Error('Morse energyZero must be minimum');
      return;
    case 'harmonic-bond':
      assertPositive('forceConstantKjMolAngstrom2', potential.forceConstantKjMolAngstrom2);
      assertPositive('equilibriumDistanceAngstrom', potential.equilibriumDistanceAngstrom);
      return;
    default:
      throw new Error('unsupported radial potential kind');
  }
}

function emptyEnergyRecord(): Record<RadialPotential['kind'], number> {
  return {
    'coulomb-minimum-image-reference': 0,
    'lennard-jones-12-6': 0,
    'buckingham-exp-6': 0,
    morse: 0,
    'harmonic-bond': 0,
  };
}

function assertDistance(distanceAngstrom: number) {
  if (!(Number.isFinite(distanceAngstrom) && distanceAngstrom > MINIMUM_DISTANCE_ANGSTROM)) {
    throw new Error('radial distance must be finite and greater than the overlap limit');
  }
}

function assertPositive(label: string, value: number) {
  if (!(Number.isFinite(value) && value > 0)) throw new Error(`${label} must be finite and positive`);
}

function assertNonnegative(label: string, value: number) {
  if (!(Number.isFinite(value) && value >= 0)) throw new Error(`${label} must be finite and nonnegative`);
}
