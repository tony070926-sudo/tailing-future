import type { Vector3 } from '../molecular/molecular-interactions.ts';
import { COULOMB_CONSTANT_KJ_MOL_ANGSTROM_E2 } from '../molecular/molecular-interactions.ts';
import {
  PeriodicCell,
  type CellVectors3,
  type Int3,
  type WrappedPeriodicPosition,
} from './periodic-cell.ts';

export type DirectEwaldAtomV042 = Readonly<{
  id: string;
  chargeE: number;
  /**
   * The wrapped coordinate is authoritative. `image` is an integer lattice
   * gauge and is deliberately ignored by the periodic electrostatic sum.
   */
  position: WrappedPeriodicPosition;
}>;

export type DirectEwaldOptionsV042 = Readonly<{
  alphaInverseAngstrom: number;
  realSpaceCutoffAngstrom: number;
  reciprocalCutoffInverseAngstrom: number;
  relativePermittivity: 1;
  neutralityToleranceE: number;
  electrostaticConstantKjMolAngstromE2: number;
  maximumRealSpaceCandidates: number;
  maximumReciprocalCandidates: number;
}>;

export type DirectEwaldEvaluationV042 = Readonly<{
  schemaVersion: 'tf.direct-periodic-ewald-evaluation/0.4.2';
  method: 'direct-ewald-explicit-real-and-reciprocal-sums';
  atoms: ReadonlyArray<Readonly<{
    id: string;
    chargeE: number;
    wrappedFractional: Vector3;
  }>>;
  netChargeE: number;
  cell: Readonly<{
    vectorsAngstrom: CellVectors3;
    volumeAngstrom3: number;
    originGauge: 'omitted-origin-is-not-physical';
  }>;
  energyKjMol: Readonly<{
    realSpace: number;
    reciprocalSpace: number;
    selfCorrection: number;
    total: number;
  }>;
  forceComponentsByAtomIdKjMolAngstrom: Readonly<Record<string, Readonly<{
    realSpace: Vector3;
    reciprocalSpace: Vector3;
    selfCorrection: Vector3;
  }>>>;
  forceByAtomIdKjMolAngstrom: Readonly<Record<string, Vector3>>;
  netForceKjMolAngstrom: Vector3;
  enumeration: Readonly<{
    realSpacePairTerms: number;
    realSpaceSelfImageTerms: number;
    realSpaceCandidatesExamined: number;
    realSpaceWorkUnitsConsumed: number;
    reciprocalVectors: number;
    reciprocalCandidatesExamined: number;
    reciprocalWorkUnitsConsumed: number;
    deterministicOrder: 'stable-atom-id-then-lexicographic-lattice-index';
  }>;
  parameters: DirectEwaldOptionsV042;
  tailIndicators: Readonly<{
    status: 'dimensionful-truncation-indicators-not-error-bounds';
    realSpaceInverseAngstrom: number;
    reciprocalSpaceAngstrom2: number;
  }>;
  provenance: Readonly<{
    solver: 'tf-direct-ewald-reference';
    solverVersion: '0.4.2';
    periodicDimensions: 3;
    cellKinds: 'orthorhombic-and-triclinic';
    electrostaticBoundary: 'conducting-tin-foil-k0-omitted';
    neutralSystemsOnly: true;
    meshUsed: false;
    pme: false;
    authenticity: 'not-provided';
  }>;
  boundaries: ReadonlyArray<string>;
}>;

type CanonicalAtom = Readonly<{
  id: string;
  chargeE: number;
  wrappedFractional: Vector3;
  positionAngstrom: Vector3;
}>;

type IndexedVector = Readonly<{
  index: Int3;
  vector: Vector3;
  magnitude: number;
}>;

const STABLE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const SQRT_PI = Math.sqrt(Math.PI);
const TWO_OVER_SQRT_PI = 2 / SQRT_PI;
const TWO_PI = 2 * Math.PI;
const MINIMUM_DISTANCE_ANGSTROM = 1e-10;
const MAXIMUM_ATOMS = 512;
const MAXIMUM_CANDIDATES = 10_000_000;
const MAXIMUM_ABSOLUTE_CHARGE_E = 1_000_000;
const SUM_EPSILON = Number.EPSILON * 128;

const BOUNDARIES = Object.freeze([
  'This is an explicit direct Ewald reference sum with spherical real-space and reciprocal-space cutoffs; it is not PME, SPME, PPPM or a mesh method.',
  'Only three-dimensional periodic, electrically neutral cells are admitted; no uniform neutralizing background is introduced.',
  'Relative permittivity is locked to 1 for explicit point charges; continuum dielectric screening is a different, unsupported model.',
  'The omitted k=0 mode uses the conducting (tin-foil) boundary convention; vacuum surface and dipole corrections are not included.',
  'Reported tail indicators are convergence diagnostics, not rigorous truncation-error bounds; production work must demonstrate cutoff and alpha convergence.',
  'Configured candidate limits are fail-closed work budgets: lattice candidates and every evaluated real/self/reciprocal atom term consume budget.',
  'Atoms must provide already wrapped fractional coordinates plus a separate bounded integer image; image counters are an omitted lattice gauge and never enter the sum.',
  'SHA/signature provenance is not provided by this numerical kernel; callers must bind source and artifacts separately.',
]);

/**
 * Direct three-dimensional Ewald electrostatics for small, auditable neutral
 * periodic systems. Real lattice images and reciprocal vectors are enumerated
 * explicitly; no FFT, charge assignment grid or PME approximation is used.
 */
export function evaluateDirectPeriodicEwald(
  cell: PeriodicCell,
  atoms: ReadonlyArray<DirectEwaldAtomV042>,
  options: DirectEwaldOptionsV042,
): DirectEwaldEvaluationV042 {
  if (!(cell instanceof PeriodicCell)) throw new Error('direct Ewald requires a validated PeriodicCell');
  const parameters = canonicalizeOptions(options);
  const canonicalAtoms = canonicalizeAtoms(cell, atoms);
  const netCharge = compensatedScalar(canonicalAtoms.map((atom) => atom.chargeE));
  if (Math.abs(netCharge) > parameters.neutralityToleranceE) {
    throw new Error('direct Ewald requires an electrically neutral periodic cell; no background correction is available');
  }

  const prefactor = parameters.electrostaticConstantKjMolAngstromE2 / parameters.relativePermittivity;
  const realForceAccumulators = new Map(canonicalAtoms.map((atom) => [atom.id, new CompensatedVector()]));
  const reciprocalForceAccumulators = new Map(canonicalAtoms.map((atom) => [atom.id, new CompensatedVector()]));
  const realEnergy = new CompensatedSum();
  const reciprocalEnergy = new CompensatedSum();
  const realBudget = new CandidateBudget(parameters.maximumRealSpaceCandidates, 'real-space');
  let realSpacePairTerms = 0;
  let realSpaceSelfImageTerms = 0;

  const selfImages = enumerateRealImages(
    cell,
    { x: 0, y: 0, z: 0 },
    parameters.realSpaceCutoffAngstrom,
    realBudget,
    true,
  );
  const chargedAtomCount = canonicalAtoms.filter((atom) => atom.chargeE !== 0).length;
  realBudget.consumeTerms(safeProduct(chargedAtomCount, selfImages.length, 'real-space self-image work'));
  for (const atom of canonicalAtoms) {
    if (atom.chargeE === 0) continue;
    const chargeSquared = atom.chargeE ** 2;
    for (const image of selfImages) {
      realEnergy.add(0.5 * prefactor * chargeSquared
        * complementaryErrorFunction(parameters.alphaInverseAngstrom * image.magnitude) / image.magnitude);
      realSpaceSelfImageTerms += 1;
    }
  }

  for (let firstIndex = 0; firstIndex < canonicalAtoms.length; firstIndex += 1) {
    const first = canonicalAtoms[firstIndex];
    for (let secondIndex = firstIndex + 1; secondIndex < canonicalAtoms.length; secondIndex += 1) {
      const second = canonicalAtoms[secondIndex];
      const chargeProduct = first.chargeE * second.chargeE;
      if (chargeProduct === 0) continue;
      const fractionalDisplacement = subtract(second.wrappedFractional, first.wrappedFractional);
      const images = enumerateRealImages(
        cell,
        fractionalDisplacement,
        parameters.realSpaceCutoffAngstrom,
        realBudget,
        false,
      );
      realBudget.consumeTerms(images.length);
      for (const image of images) {
        if (image.magnitude <= MINIMUM_DISTANCE_ANGSTROM) {
          throw new Error(`direct Ewald charged-particle overlap for ${first.id} and ${second.id}`);
        }
        const scaledDistance = parameters.alphaInverseAngstrom * image.magnitude;
        const erfc = complementaryErrorFunction(scaledDistance);
        realEnergy.add(prefactor * chargeProduct * erfc / image.magnitude);
        const radialForceOnSecond = prefactor * chargeProduct * (
          erfc / image.magnitude ** 2
          + TWO_OVER_SQRT_PI * parameters.alphaInverseAngstrom
          * Math.exp(-(scaledDistance ** 2)) / image.magnitude
        );
        const forceOnSecond = scale(image.vector, radialForceOnSecond / image.magnitude);
        requireMap(realForceAccumulators, first.id).add(scale(forceOnSecond, -1));
        requireMap(realForceAccumulators, second.id).add(forceOnSecond);
        realSpacePairTerms += 1;
      }
    }
  }

  const reciprocalBudget = new CandidateBudget(parameters.maximumReciprocalCandidates, 'reciprocal-space');
  const reciprocalVectors = enumerateReciprocalVectors(
    cell,
    parameters.reciprocalCutoffInverseAngstrom,
    reciprocalBudget,
  );
  reciprocalBudget.consumeTerms(safeProduct(
    reciprocalVectors.length,
    2 * canonicalAtoms.length + 1,
    'reciprocal-space atom work',
  ));
  const reciprocalEnergyPrefactor = prefactor * 2 * Math.PI / cell.volumeAngstrom3;
  const reciprocalForcePrefactor = prefactor * 4 * Math.PI / cell.volumeAngstrom3;
  for (const reciprocal of reciprocalVectors) {
    const squaredMagnitude = reciprocal.magnitude ** 2;
    const weight = Math.exp(-squaredMagnitude / (4 * parameters.alphaInverseAngstrom ** 2)) / squaredMagnitude;
    const realStructure = new CompensatedSum();
    const imaginaryStructure = new CompensatedSum();
    const phases: number[] = [];
    for (const atom of canonicalAtoms) {
      const phase = dot(reciprocal.vector, atom.positionAngstrom);
      phases.push(phase);
      realStructure.add(atom.chargeE * Math.cos(phase));
      imaginaryStructure.add(atom.chargeE * Math.sin(phase));
    }
    const structureReal = realStructure.value;
    const structureImaginary = imaginaryStructure.value;
    reciprocalEnergy.add(reciprocalEnergyPrefactor * weight
      * (structureReal ** 2 + structureImaginary ** 2));
    for (let atomIndex = 0; atomIndex < canonicalAtoms.length; atomIndex += 1) {
      const atom = canonicalAtoms[atomIndex];
      const phase = phases[atomIndex];
      const scalar = reciprocalForcePrefactor * weight * atom.chargeE
        * (structureReal * Math.sin(phase) - structureImaginary * Math.cos(phase));
      requireMap(reciprocalForceAccumulators, atom.id).add(scale(reciprocal.vector, scalar));
    }
  }

  const chargeSquares = compensatedScalar(canonicalAtoms.map((atom) => atom.chargeE ** 2));
  const selfCorrection = -prefactor * parameters.alphaInverseAngstrom / SQRT_PI * chargeSquares;
  const forceComponentsByAtomId = Object.fromEntries(canonicalAtoms.map((atom) => {
    const realSpace = canonicalVector(requireMap(realForceAccumulators, atom.id).value);
    const reciprocalSpace = canonicalVector(requireMap(reciprocalForceAccumulators, atom.id).value);
    return [atom.id, {
      realSpace,
      reciprocalSpace,
      selfCorrection: zeroVector(),
    }];
  }));
  const forceByAtomId = Object.fromEntries(canonicalAtoms.map((atom) => [
    atom.id,
    canonicalVector(add(
      forceComponentsByAtomId[atom.id].realSpace,
      forceComponentsByAtomId[atom.id].reciprocalSpace,
    )),
  ]));
  const netForce = canonicalVector(Object.values(forceByAtomId).reduce(add, zeroVector()));
  const realSpace = canonicalNumber(realEnergy.value);
  const reciprocalSpace = canonicalNumber(reciprocalEnergy.value);
  const canonicalSelfCorrection = canonicalNumber(selfCorrection);
  const total = canonicalNumber(realSpace + reciprocalSpace + canonicalSelfCorrection);
  assertFiniteEvaluation(total, forceByAtomId);

  return deepFreeze({
    schemaVersion: 'tf.direct-periodic-ewald-evaluation/0.4.2',
    method: 'direct-ewald-explicit-real-and-reciprocal-sums',
    atoms: canonicalAtoms.map((atom) => ({
      id: atom.id,
      chargeE: atom.chargeE,
      wrappedFractional: { ...atom.wrappedFractional },
    })),
    netChargeE: canonicalNumber(netCharge),
    cell: {
      vectorsAngstrom: cell.vectorsAngstrom.map((vector) => ({ ...vector })) as unknown as CellVectors3,
      volumeAngstrom3: cell.volumeAngstrom3,
      originGauge: 'omitted-origin-is-not-physical',
    },
    energyKjMol: { realSpace, reciprocalSpace, selfCorrection: canonicalSelfCorrection, total },
    forceComponentsByAtomIdKjMolAngstrom: forceComponentsByAtomId,
    forceByAtomIdKjMolAngstrom: forceByAtomId,
    netForceKjMolAngstrom: netForce,
    enumeration: {
      realSpacePairTerms,
      realSpaceSelfImageTerms,
      realSpaceCandidatesExamined: realBudget.candidatesExamined,
      realSpaceWorkUnitsConsumed: realBudget.used,
      reciprocalVectors: reciprocalVectors.length,
      reciprocalCandidatesExamined: reciprocalBudget.candidatesExamined,
      reciprocalWorkUnitsConsumed: reciprocalBudget.used,
      deterministicOrder: 'stable-atom-id-then-lexicographic-lattice-index',
    },
    parameters,
    tailIndicators: {
      status: 'dimensionful-truncation-indicators-not-error-bounds',
      realSpaceInverseAngstrom: complementaryErrorFunction(
        parameters.alphaInverseAngstrom * parameters.realSpaceCutoffAngstrom,
      ) / parameters.realSpaceCutoffAngstrom,
      reciprocalSpaceAngstrom2: Math.exp(
        -(parameters.reciprocalCutoffInverseAngstrom ** 2)
        / (4 * parameters.alphaInverseAngstrom ** 2),
      ) / parameters.reciprocalCutoffInverseAngstrom ** 2,
    },
    provenance: {
      solver: 'tf-direct-ewald-reference',
      solverVersion: '0.4.2',
      periodicDimensions: 3,
      cellKinds: 'orthorhombic-and-triclinic',
      electrostaticBoundary: 'conducting-tin-foil-k0-omitted',
      neutralSystemsOnly: true,
      meshUsed: false,
      pme: false,
      authenticity: 'not-provided',
    },
    boundaries: [...BOUNDARIES],
  });
}

/** Reuses the executable kernel's exact-key and numeric-domain gate. */
export function canonicalizeDirectEwaldOptionsV042(
  options: DirectEwaldOptionsV042,
): DirectEwaldOptionsV042 {
  return canonicalizeOptions(options);
}

/** Accurate regularized-gamma evaluation of erfc(x) for x >= 0. */
export function complementaryErrorFunction(value: number) {
  if (!(Number.isFinite(value) && value >= 0)) throw new Error('erfc input must be finite and nonnegative');
  if (value === 0) return 1;
  if (value >= 27) return 0;
  const argument = value ** 2;
  const logarithmicPrefactor = -argument + 0.5 * Math.log(argument) - Math.log(SQRT_PI);
  if (argument < 1.5) {
    let term = 2;
    let sum = term;
    let shape = 0.5;
    for (let iteration = 1; iteration <= 10_000; iteration += 1) {
      shape += 1;
      term *= argument / shape;
      sum += term;
      if (Math.abs(term) <= Math.abs(sum) * Number.EPSILON * 4) {
        return clampProbability(1 - sum * Math.exp(logarithmicPrefactor));
      }
    }
  } else {
    const minimum = Number.MIN_VALUE / Number.EPSILON;
    let b = argument + 0.5;
    let c = 1 / minimum;
    let d = 1 / b;
    let fraction = d;
    for (let iteration = 1; iteration <= 10_000; iteration += 1) {
      const coefficient = -iteration * (iteration - 0.5);
      b += 2;
      d = coefficient * d + b;
      if (Math.abs(d) < minimum) d = minimum;
      c = b + coefficient / c;
      if (Math.abs(c) < minimum) c = minimum;
      d = 1 / d;
      const delta = d * c;
      fraction *= delta;
      if (Math.abs(delta - 1) <= Number.EPSILON * 8) {
        return clampProbability(Math.exp(logarithmicPrefactor) * fraction);
      }
    }
  }
  throw new Error('erfc evaluation did not converge');
}

function canonicalizeOptions(options: DirectEwaldOptionsV042): DirectEwaldOptionsV042 {
  if (!options || typeof options !== 'object') throw new Error('direct Ewald options must be an object');
  assertExactKeys(options, [
    'alphaInverseAngstrom',
    'realSpaceCutoffAngstrom',
    'reciprocalCutoffInverseAngstrom',
    'relativePermittivity',
    'neutralityToleranceE',
    'electrostaticConstantKjMolAngstromE2',
    'maximumRealSpaceCandidates',
    'maximumReciprocalCandidates',
  ], 'direct Ewald options');
  assertPositiveRange('alphaInverseAngstrom', options.alphaInverseAngstrom, 1e-6, 100);
  assertPositiveRange('realSpaceCutoffAngstrom', options.realSpaceCutoffAngstrom, 1e-6, 100_000);
  assertPositiveRange('reciprocalCutoffInverseAngstrom', options.reciprocalCutoffInverseAngstrom, 1e-6, 100_000);
  if (options.relativePermittivity !== 1) {
    throw new Error('direct Ewald relativePermittivity is locked to 1 for explicit point charges');
  }
  assertPositiveRange('neutralityToleranceE', options.neutralityToleranceE, 1e-16, 1e-8);
  assertPositiveRange(
    'electrostaticConstantKjMolAngstromE2',
    options.electrostaticConstantKjMolAngstromE2,
    1e-12,
    1e9,
  );
  assertCandidateLimit('maximumRealSpaceCandidates', options.maximumRealSpaceCandidates);
  assertCandidateLimit('maximumReciprocalCandidates', options.maximumReciprocalCandidates);
  return Object.freeze({ ...options });
}

function assertExactKeys(value: object, expected: ReadonlyArray<string>, label: string) {
  const actual = Object.keys(value).sort(compareStableToken);
  const canonicalExpected = [...expected].sort(compareStableToken);
  if (actual.length !== canonicalExpected.length
    || actual.some((key, index) => key !== canonicalExpected[index])) {
    throw new Error(`${label} must contain exactly the locked keys`);
  }
}

function canonicalizeAtoms(cell: PeriodicCell, atoms: ReadonlyArray<DirectEwaldAtomV042>) {
  if (!Array.isArray(atoms) || atoms.length < 2 || atoms.length > MAXIMUM_ATOMS) {
    throw new Error(`direct Ewald atom count must be in [2, ${MAXIMUM_ATOMS}]`);
  }
  const seen = new Set<string>();
  return atoms.map((atom) => {
    if (!atom || !STABLE_TOKEN.test(atom.id) || seen.has(atom.id)) {
      throw new Error('direct Ewald atom IDs must be unique ASCII stable tokens');
    }
    seen.add(atom.id);
    if (!(Number.isFinite(atom.chargeE) && Math.abs(atom.chargeE) <= MAXIMUM_ABSOLUTE_CHARGE_E)) {
      throw new Error('direct Ewald atom charges must be finite and bounded');
    }
    if (!atom.position || typeof atom.position !== 'object') {
      throw new Error('direct Ewald atom position must contain a wrapped fractional coordinate and integer image');
    }
    // This validates both the canonical [0, 1) fractional domain and the
    // bounded safe-integer image without ever forming wrapped + image. Forming
    // that large sum would discard physically meaningful fractional bits near
    // the allowed image limit before this kernel could recover them.
    cell.wrappedCartesian(atom.position);
    const wrapped = canonicalVector(atom.position.wrappedFractional);
    return {
      id: atom.id,
      chargeE: canonicalNumber(atom.chargeE),
      wrappedFractional: wrapped,
      // Reciprocal phases are origin-gauge invariant. Avoiding the render
      // origin also prevents trigonometric range-reduction loss at ~1e9 Å.
      positionAngstrom: cell.latticeVector(wrapped),
    };
  }).sort((left, right) => compareStableToken(left.id, right.id)) as CanonicalAtom[];
}

function enumerateRealImages(
  cell: PeriodicCell,
  fractionalDisplacement: Vector3,
  cutoffAngstrom: number,
  budget: CandidateBudget,
  excludeZero: boolean,
) {
  const dual = reciprocalBasis(cell, false);
  const reaches = dual.map((vector) => magnitude(vector) * cutoffAngstrom);
  const bounds = [
    integerBounds(-fractionalDisplacement.x, reaches[0]),
    integerBounds(-fractionalDisplacement.y, reaches[1]),
    integerBounds(-fractionalDisplacement.z, reaches[2]),
  ] as const;
  budget.consumeCandidates(candidateCount(bounds));
  const images: IndexedVector[] = [];
  for (let x = bounds[0][0]; x <= bounds[0][1]; x += 1) {
    for (let y = bounds[1][0]; y <= bounds[1][1]; y += 1) {
      for (let z = bounds[2][0]; z <= bounds[2][1]; z += 1) {
        if (excludeZero && x === 0 && y === 0 && z === 0) continue;
        const index = { x, y, z };
        const vector = cell.latticeVector({
          x: fractionalDisplacement.x + x,
          y: fractionalDisplacement.y + y,
          z: fractionalDisplacement.z + z,
        });
        const length = magnitude(vector);
        if (length <= cutoffAngstrom) images.push({ index, vector, magnitude: length });
      }
    }
  }
  return images;
}

function enumerateReciprocalVectors(
  cell: PeriodicCell,
  cutoffInverseAngstrom: number,
  budget: CandidateBudget,
) {
  const basis = reciprocalBasis(cell, true);
  const direct = cell.vectorsAngstrom;
  const bounds = direct.map((vector) => Math.ceil(magnitude(vector) * cutoffInverseAngstrom / TWO_PI));
  const ranges = [
    [-bounds[0], bounds[0]],
    [-bounds[1], bounds[1]],
    [-bounds[2], bounds[2]],
  ] as const;
  budget.consumeCandidates(candidateCount(ranges));
  const vectors: IndexedVector[] = [];
  for (let x = -bounds[0]; x <= bounds[0]; x += 1) {
    for (let y = -bounds[1]; y <= bounds[1]; y += 1) {
      for (let z = -bounds[2]; z <= bounds[2]; z += 1) {
        if (x === 0 && y === 0 && z === 0) continue;
        const vector = add(add(scale(basis[0], x), scale(basis[1], y)), scale(basis[2], z));
        const length = magnitude(vector);
        if (length <= cutoffInverseAngstrom) vectors.push({ index: { x, y, z }, vector, magnitude: length });
      }
    }
  }
  return vectors;
}

function reciprocalBasis(cell: PeriodicCell, includeTwoPi: boolean) {
  const [a, b, c] = cell.vectorsAngstrom;
  const factor = (includeTwoPi ? TWO_PI : 1) / cell.volumeAngstrom3;
  return [
    scale(cross(b, c), factor),
    scale(cross(c, a), factor),
    scale(cross(a, b), factor),
  ] as const;
}

function integerBounds(center: number, reach: number) {
  const tolerance = Math.max(1, Math.abs(center), reach) * SUM_EPSILON;
  return [Math.ceil(center - reach - tolerance), Math.floor(center + reach + tolerance)] as const;
}

function candidateCount(bounds: readonly [readonly [number, number], readonly [number, number], readonly [number, number]]) {
  const count = bounds.reduce((product, [lower, upper]) => product * Math.max(0, upper - lower + 1), 1);
  if (!Number.isSafeInteger(count)) throw new Error('direct Ewald lattice enumeration exceeds the safe integer domain');
  return count;
}

class CandidateBudget {
  private _used = 0;
  private _candidatesExamined = 0;
  private readonly limit: number;
  private readonly label: string;

  constructor(limit: number, label: string) {
    this.limit = limit;
    this.label = label;
  }

  get used() { return this._used; }
  get candidatesExamined() { return this._candidatesExamined; }

  consumeCandidates(count: number) {
    this.consume(count);
    this._candidatesExamined += count;
  }

  consumeTerms(count: number) {
    this.consume(count);
  }

  private consume(count: number) {
    if (!Number.isSafeInteger(count) || count < 0 || this._used + count > this.limit) {
      throw new Error(`direct Ewald ${this.label} work-unit limit exceeded`);
    }
    this._used += count;
  }
}

class CompensatedSum {
  private sum = 0;
  private correction = 0;

  add(value: number) {
    const adjusted = value - this.correction;
    const next = this.sum + adjusted;
    this.correction = (next - this.sum) - adjusted;
    this.sum = next;
  }

  get value() { return canonicalNumber(this.sum); }
}

class CompensatedVector {
  private readonly x = new CompensatedSum();
  private readonly y = new CompensatedSum();
  private readonly z = new CompensatedSum();

  add(vector: Vector3) {
    this.x.add(vector.x);
    this.y.add(vector.y);
    this.z.add(vector.z);
  }

  get value(): Vector3 { return { x: this.x.value, y: this.y.value, z: this.z.value }; }
}

function compensatedScalar(values: ReadonlyArray<number>) {
  const sum = new CompensatedSum();
  for (const value of values) sum.add(value);
  return sum.value;
}

function assertFiniteEvaluation(totalEnergy: number, forces: Readonly<Record<string, Vector3>>) {
  if (!Number.isFinite(totalEnergy)) throw new Error('direct Ewald energy became non-finite');
  for (const force of Object.values(forces)) assertFiniteVector(force, 'direct Ewald force');
}

function assertPositiveRange(label: string, value: number, minimum: number, maximum: number) {
  if (!(Number.isFinite(value) && value >= minimum && value <= maximum)) {
    throw new Error(`${label} must be finite and in [${minimum}, ${maximum}]`);
  }
}

function assertCandidateLimit(label: string, value: number) {
  if (!Number.isSafeInteger(value) || value < 1 || value > MAXIMUM_CANDIDATES) {
    throw new Error(`${label} must be a safe integer in [1, ${MAXIMUM_CANDIDATES}]`);
  }
}

function safeProduct(left: number, right: number, label: string) {
  if (!Number.isSafeInteger(left) || left < 0 || !Number.isSafeInteger(right) || right < 0
    || (left !== 0 && right > Number.MAX_SAFE_INTEGER / left)) {
    throw new Error(`direct Ewald ${label} exceeds the safe integer domain`);
  }
  return left * right;
}

function assertFiniteVector(vector: Vector3, label: string) {
  if (!vector || ![vector.x, vector.y, vector.z].every(Number.isFinite)) {
    throw new Error(`${label} must contain finite x, y and z`);
  }
}

function clampProbability(value: number) {
  if (!Number.isFinite(value)) throw new Error('erfc evaluation became non-finite');
  return value <= 0 ? 0 : value >= 1 ? 1 : value;
}

function canonicalNumber(value: number) { return Object.is(value, -0) ? 0 : value; }

function canonicalVector(vector: Vector3): Vector3 {
  return { x: canonicalNumber(vector.x), y: canonicalNumber(vector.y), z: canonicalNumber(vector.z) };
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function requireMap<Key, Value>(map: ReadonlyMap<Key, Value>, key: Key) {
  const value = map.get(key);
  if (value === undefined) throw new Error('direct Ewald internal atom identity is missing');
  return value;
}

function compareStableToken(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
function zeroVector(): Vector3 { return { x: 0, y: 0, z: 0 }; }
function add(left: Vector3, right: Vector3): Vector3 { return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z }; }
function subtract(left: Vector3, right: Vector3): Vector3 { return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }; }
function scale(vector: Vector3, factor: number): Vector3 { return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor }; }
function dot(left: Vector3, right: Vector3) { return left.x * right.x + left.y * right.y + left.z * right.z; }
function cross(left: Vector3, right: Vector3): Vector3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}
function magnitude(vector: Vector3) { return Math.hypot(vector.x, vector.y, vector.z); }

export const DEFAULT_EWALD_ELECTROSTATIC_CONSTANT_KJ_MOL_ANGSTROM_E2 = COULOMB_CONSTANT_KJ_MOL_ANGSTROM_E2;
