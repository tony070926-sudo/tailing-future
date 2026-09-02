import type { Vector3 } from '../molecular/molecular-interactions.ts';
import { COULOMB_CONSTANT_KJ_MOL_ANGSTROM_E2 } from '../molecular/molecular-interactions.ts';
import {
  PeriodicCell,
  type Int3,
  type WrappedPeriodicPosition,
} from './periodic-cell.ts';

export type PeriodicCoulombExceptionAtomV042 = Readonly<{
  id: string;
  chargeE: number;
  position: WrappedPeriodicPosition;
}>;

export type PeriodicCoulombExceptionV042 = Readonly<{
  id: string;
  atomAId: string;
  atomBId: string;
  /** 0 excludes the selected intramolecular pair; 1 leaves it unchanged. */
  coulombScale: number;
  /** Explicit local molecular image from atom A to atom B. */
  imageShiftForB: Int3;
}>;

export type PeriodicCoulombExceptionOptionsV042 = Readonly<{
  relativePermittivity: 1;
  neutralityToleranceE: number;
  electrostaticConstantKjMolAngstromE2: number;
  maximumExceptions: number;
}>;

export type CoulombExceptionVirialTensorV042 = Readonly<{
  xx: number; xy: number; xz: number;
  yx: number; yy: number; yz: number;
  zx: number; zy: number; zz: number;
}>;

export type PeriodicCoulombExceptionEvaluationV042 = Readonly<{
  schemaVersion: 'tf.periodic-coulomb-exception-evaluation/0.4.2';
  method: 'selected-minimum-image-unscreened-1-over-r-correction';
  netChargeE: number;
  energyCorrectionKjMol: number;
  forceCorrectionByAtomIdKjMolAngstrom: Readonly<Record<string, Vector3>>;
  netForceCorrectionKjMolAngstrom: Vector3;
  virialCorrectionKjMol: CoulombExceptionVirialTensorV042;
  interactions: ReadonlyArray<Readonly<{
    id: string;
    atomAId: string;
    atomBId: string;
    coulombScale: number;
    imageShiftForB: Int3;
    displacementAngstrom: Vector3;
    distanceAngstrom: number;
    energyCorrectionKjMol: number;
    forceCorrectionOnBKjMolAngstrom: Vector3;
    virialCorrectionKjMol: CoulombExceptionVirialTensorV042;
  }>>;
  parameters: PeriodicCoulombExceptionOptionsV042;
  workUnitsConsumed: number;
  provenance: Readonly<{
    solver: 'tf-direct-ewald-selected-pair-correction';
    solverVersion: '0.4.2';
    compatibleElectrostaticBoundary: 'three-dimensional-periodic-tin-foil';
    meshUsed: false;
    pme: false;
  }>;
  boundaries: ReadonlyArray<string>;
}>;

const STABLE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MINIMUM_DISTANCE_ANGSTROM = 1e-10;
const MAXIMUM_ATOMS = 512;
const MAXIMUM_EXCEPTIONS = 130_816;
const MAXIMUM_ABSOLUTE_CHARGE_E = 1_000_000;

const BOUNDARIES = Object.freeze([
  'This result is only the selected unscreened 1/r pair correction that must be added to a complete periodic Ewald evaluation; it is not a standalone electrostatic energy.',
  'A scale of zero removes only the explicitly selected intramolecular minimum-image pair while retaining interactions with its periodic images.',
  'Selected intramolecular pairs must lie strictly inside the cell minimum-image radius so their local molecular lift is unique, not merely deterministically tie-broken.',
  'Only relativePermittivity=1 is supported because explicit solvent charges, rather than a continuum dielectric, carry screening.',
  'The reported virial is the exception-correction pair virial only; it is not the reciprocal-space virial, total electrostatic stress or full system stress.',
  'No Lennard-Jones exception, PME mesh, slab correction, polarization, charge transfer or force-field authenticity claim is provided.',
]);

export function evaluatePeriodicCoulombExceptionCorrections(
  cell: PeriodicCell,
  atoms: ReadonlyArray<PeriodicCoulombExceptionAtomV042>,
  exceptions: ReadonlyArray<PeriodicCoulombExceptionV042>,
  options: PeriodicCoulombExceptionOptionsV042,
): PeriodicCoulombExceptionEvaluationV042 {
  if (!(cell instanceof PeriodicCell)) throw new TypeError('periodic Coulomb exceptions require a PeriodicCell');
  const parameters = validateOptions(options);
  const canonicalAtoms = validateAtoms(cell, atoms);
  const netChargeE = compensatedScalar(canonicalAtoms.map((atom) => atom.chargeE));
  if (Math.abs(netChargeE) > parameters.neutralityToleranceE) {
    throw new Error('periodic Coulomb exceptions require the same neutral atom set as the direct Ewald evaluation');
  }
  const atomsById = new Map(canonicalAtoms.map((atom) => [atom.id, atom]));
  const forceById = Object.fromEntries(canonicalAtoms.map((atom) => [atom.id, zeroVector()])) as Record<string, Vector3>;
  const canonicalExceptions = validateExceptions(exceptions, atomsById, parameters.maximumExceptions);
  const interactions: Array<PeriodicCoulombExceptionEvaluationV042['interactions'][number]> = [];
  let energyCorrection = 0;
  let virialCorrection = zeroTensor();
  const prefactor = parameters.electrostaticConstantKjMolAngstromE2 / parameters.relativePermittivity;

  for (const exception of canonicalExceptions) {
    const atomA = requireMap(atomsById, exception.atomAId);
    const atomB = requireMap(atomsById, exception.atomBId);
    const minimumImage = cell.minimumImageFromFractional(
      atomA.position.wrappedFractional,
      atomB.position.wrappedFractional,
    );
    if (!equalInt3(exception.imageShiftForB, minimumImage.imageShiftForTarget)) {
      throw new Error(`Coulomb exception ${exception.id} image shift is not the locked deterministic minimum-image lift`);
    }
    const displacement = minimumImage.displacementAngstrom;
    const distance = minimumImage.distanceAngstrom;
    if (!(Number.isFinite(distance) && distance > MINIMUM_DISTANCE_ANGSTROM)) {
      throw new Error(`Coulomb exception ${exception.id} has overlapping or non-finite sites`);
    }
    const uniquenessTolerance = Math.max(1, cell.minimumImageRadiusAngstrom)
      * Number.EPSILON * 256;
    if (distance + uniquenessTolerance >= cell.minimumImageRadiusAngstrom) {
      throw new Error(`Coulomb exception ${exception.id} must lie strictly inside the unique minimum-image radius`);
    }
    const correctionMultiplier = exception.coulombScale - 1;
    const chargePrefactor = prefactor * atomA.chargeE * atomB.chargeE;
    const pairEnergy = correctionMultiplier * chargePrefactor / distance;
    const forceOnB = scale(
      displacement,
      correctionMultiplier * chargePrefactor / distance ** 3,
    );
    const pairVirial = outer(displacement, forceOnB);
    energyCorrection += pairEnergy;
    forceById[atomA.id] = subtract(forceById[atomA.id], forceOnB);
    forceById[atomB.id] = add(forceById[atomB.id], forceOnB);
    virialCorrection = addTensor(virialCorrection, pairVirial);
    interactions.push({
      id: exception.id,
      atomAId: exception.atomAId,
      atomBId: exception.atomBId,
      coulombScale: exception.coulombScale,
      imageShiftForB: { ...exception.imageShiftForB },
      displacementAngstrom: { ...displacement },
      distanceAngstrom: distance,
      energyCorrectionKjMol: canonicalNumber(pairEnergy),
      forceCorrectionOnBKjMolAngstrom: canonicalVector(forceOnB),
      virialCorrectionKjMol: canonicalTensor(pairVirial),
    });
  }

  const canonicalForces = Object.fromEntries(canonicalAtoms.map((atom) => [
    atom.id,
    canonicalVector(forceById[atom.id]),
  ])) as Record<string, Vector3>;
  const netForce = Object.values(canonicalForces).reduce(add, zeroVector());
  assertFiniteResult(energyCorrection, canonicalForces, virialCorrection);
  return deepFreeze({
    schemaVersion: 'tf.periodic-coulomb-exception-evaluation/0.4.2',
    method: 'selected-minimum-image-unscreened-1-over-r-correction',
    netChargeE: canonicalNumber(netChargeE),
    energyCorrectionKjMol: canonicalNumber(energyCorrection),
    forceCorrectionByAtomIdKjMolAngstrom: canonicalForces,
    netForceCorrectionKjMolAngstrom: canonicalVector(netForce),
    virialCorrectionKjMol: canonicalTensor(virialCorrection),
    interactions,
    parameters,
    workUnitsConsumed: canonicalExceptions.length,
    provenance: {
      solver: 'tf-direct-ewald-selected-pair-correction',
      solverVersion: '0.4.2',
      compatibleElectrostaticBoundary: 'three-dimensional-periodic-tin-foil',
      meshUsed: false,
      pme: false,
    },
    boundaries: [...BOUNDARIES],
  });
}

function validateOptions(options: PeriodicCoulombExceptionOptionsV042) {
  if (!options || typeof options !== 'object') throw new TypeError('periodic Coulomb exception options must be an object');
  assertExactKeys(options, [
    'relativePermittivity',
    'neutralityToleranceE',
    'electrostaticConstantKjMolAngstromE2',
    'maximumExceptions',
  ], 'periodic Coulomb exception options');
  if (options.relativePermittivity !== 1) {
    throw new Error('periodic Coulomb exception relativePermittivity is locked to 1');
  }
  if (!(Number.isFinite(options.neutralityToleranceE)
    && options.neutralityToleranceE >= 1e-16
    && options.neutralityToleranceE <= 1e-8)) {
    throw new Error('periodic Coulomb exception neutralityToleranceE must be finite and in [1e-16, 1e-8]');
  }
  if (!(Number.isFinite(options.electrostaticConstantKjMolAngstromE2)
    && options.electrostaticConstantKjMolAngstromE2 > 0
    && options.electrostaticConstantKjMolAngstromE2 <= 1e9)) {
    throw new Error('periodic Coulomb exception electrostatic constant must be finite, positive and bounded');
  }
  if (!(Number.isSafeInteger(options.maximumExceptions)
    && options.maximumExceptions >= 1
    && options.maximumExceptions <= MAXIMUM_EXCEPTIONS)) {
    throw new Error(`maximumExceptions must be a safe integer in [1, ${MAXIMUM_EXCEPTIONS}]`);
  }
  return Object.freeze({ ...options });
}

function assertExactKeys(value: object, expected: ReadonlyArray<string>, label: string) {
  const actual = Object.keys(value).sort(compareAscii);
  const canonicalExpected = [...expected].sort(compareAscii);
  if (actual.length !== canonicalExpected.length
    || actual.some((key, index) => key !== canonicalExpected[index])) {
    throw new Error(`${label} must contain exactly the locked keys`);
  }
}

function validateAtoms(cell: PeriodicCell, atoms: ReadonlyArray<PeriodicCoulombExceptionAtomV042>) {
  if (!Array.isArray(atoms) || atoms.length < 2 || atoms.length > MAXIMUM_ATOMS) {
    throw new Error(`periodic Coulomb exception atom count must be in [2, ${MAXIMUM_ATOMS}]`);
  }
  const ids = new Set<string>();
  return atoms.map((atom) => {
    assertToken(atom?.id, 'Coulomb exception atom id');
    if (ids.has(atom.id)) throw new Error(`duplicate Coulomb exception atom id: ${atom.id}`);
    ids.add(atom.id);
    if (!(Number.isFinite(atom.chargeE) && Math.abs(atom.chargeE) <= MAXIMUM_ABSOLUTE_CHARGE_E)) {
      throw new Error(`Coulomb exception atom ${atom.id} charge must be finite and bounded`);
    }
    cell.wrappedCartesian(atom.position);
    return {
      id: atom.id,
      chargeE: canonicalNumber(atom.chargeE),
      position: {
        wrappedFractional: canonicalVector(atom.position.wrappedFractional),
        image: {
          x: canonicalNumber(atom.position.image.x),
          y: canonicalNumber(atom.position.image.y),
          z: canonicalNumber(atom.position.image.z),
        },
      },
    };
  }).sort((left, right) => compareAscii(left.id, right.id));
}

function validateExceptions(
  exceptions: ReadonlyArray<PeriodicCoulombExceptionV042>,
  atomsById: ReadonlyMap<string, PeriodicCoulombExceptionAtomV042>,
  maximumExceptions: number,
) {
  if (!Array.isArray(exceptions) || exceptions.length > maximumExceptions) {
    throw new Error(`periodic Coulomb exception count must be in [0, ${maximumExceptions}]`);
  }
  const ids = new Set<string>();
  const pairs = new Set<string>();
  return exceptions.map((exception) => {
    assertToken(exception?.id, 'Coulomb exception id');
    if (ids.has(exception.id)) throw new Error(`duplicate Coulomb exception id: ${exception.id}`);
    ids.add(exception.id);
    assertToken(exception.atomAId, `Coulomb exception ${exception.id} atomAId`);
    assertToken(exception.atomBId, `Coulomb exception ${exception.id} atomBId`);
    if (exception.atomAId === exception.atomBId
      || !atomsById.has(exception.atomAId)
      || !atomsById.has(exception.atomBId)) {
      throw new Error(`Coulomb exception ${exception.id} must reference two distinct known atoms`);
    }
    if (!(Number.isFinite(exception.coulombScale)
      && exception.coulombScale >= 0
      && exception.coulombScale <= 1)) {
      throw new Error(`Coulomb exception ${exception.id} scale must be finite and in [0, 1]`);
    }
    assertLocalInt3(exception.imageShiftForB, `Coulomb exception ${exception.id} image shift`);
    const pair = canonicalPairKey(exception.atomAId, exception.atomBId);
    if (pairs.has(pair)) throw new Error(`duplicate Coulomb exception atom pair in ${exception.id}`);
    pairs.add(pair);
    const [atomAId, atomBId] = compareAscii(exception.atomAId, exception.atomBId) <= 0
      ? [exception.atomAId, exception.atomBId]
      : [exception.atomBId, exception.atomAId];
    return {
      id: exception.id,
      atomAId,
      atomBId,
      coulombScale: canonicalNumber(exception.coulombScale),
      imageShiftForB: compareAscii(exception.atomAId, exception.atomBId) <= 0
        ? { ...exception.imageShiftForB }
        : negateInt3(exception.imageShiftForB),
    };
  }).sort((left, right) => compareAscii(left.atomAId, right.atomAId)
    || compareAscii(left.atomBId, right.atomBId)
    || compareAscii(left.id, right.id));
}

function assertToken(value: string, label: string) {
  if (typeof value !== 'string' || !STABLE_TOKEN.test(value)) throw new Error(`${label} must be a stable ASCII token`);
}

function assertLocalInt3(value: Int3, label: string) {
  if (!value || ![value.x, value.y, value.z].every(Number.isSafeInteger)) {
    throw new Error(`${label} must contain safe integer components`);
  }
}

function assertFiniteResult(
  energy: number,
  forces: Readonly<Record<string, Vector3>>,
  virial: CoulombExceptionVirialTensorV042,
) {
  if (!Number.isFinite(energy)) throw new Error('periodic Coulomb exception energy became non-finite');
  for (const force of Object.values(forces)) assertFiniteVector(force, 'periodic Coulomb exception force');
  if (!Object.values(virial).every(Number.isFinite)) throw new Error('periodic Coulomb exception virial became non-finite');
}

function assertFiniteVector(vector: Vector3, label: string) {
  if (!vector || ![vector.x, vector.y, vector.z].every(Number.isFinite)) {
    throw new Error(`${label} must contain finite x, y and z`);
  }
}

function canonicalPairKey(left: string, right: string) {
  return compareAscii(left, right) <= 0 ? `${left}\0${right}` : `${right}\0${left}`;
}

function compensatedScalar(values: ReadonlyArray<number>) {
  let sum = 0;
  let correction = 0;
  for (const value of values) {
    const adjusted = value - correction;
    const next = sum + adjusted;
    correction = (next - sum) - adjusted;
    sum = next;
  }
  return canonicalNumber(sum);
}

function requireMap<Key, Value>(map: ReadonlyMap<Key, Value>, key: Key) {
  const value = map.get(key);
  if (value === undefined) throw new Error('periodic Coulomb exception internal atom identity is missing');
  return value;
}

function zeroVector(): Vector3 { return { x: 0, y: 0, z: 0 }; }
function add(left: Vector3, right: Vector3): Vector3 { return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z }; }
function subtract(left: Vector3, right: Vector3): Vector3 { return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }; }
function scale(vector: Vector3, factor: number): Vector3 { return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor }; }
function negateInt3(value: Int3): Int3 { return { x: -value.x, y: -value.y, z: -value.z }; }
function equalInt3(left: Int3, right: Int3) { return left.x === right.x && left.y === right.y && left.z === right.z; }
function compareAscii(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
function canonicalNumber(value: number) { return Object.is(value, -0) ? 0 : value; }
function canonicalVector(vector: Vector3): Vector3 {
  return { x: canonicalNumber(vector.x), y: canonicalNumber(vector.y), z: canonicalNumber(vector.z) };
}

function zeroTensor(): CoulombExceptionVirialTensorV042 {
  return { xx: 0, xy: 0, xz: 0, yx: 0, yy: 0, yz: 0, zx: 0, zy: 0, zz: 0 };
}

function outer(left: Vector3, right: Vector3): CoulombExceptionVirialTensorV042 {
  return {
    xx: left.x * right.x, xy: left.x * right.y, xz: left.x * right.z,
    yx: left.y * right.x, yy: left.y * right.y, yz: left.y * right.z,
    zx: left.z * right.x, zy: left.z * right.y, zz: left.z * right.z,
  };
}

function addTensor(
  left: CoulombExceptionVirialTensorV042,
  right: CoulombExceptionVirialTensorV042,
): CoulombExceptionVirialTensorV042 {
  return {
    xx: left.xx + right.xx, xy: left.xy + right.xy, xz: left.xz + right.xz,
    yx: left.yx + right.yx, yy: left.yy + right.yy, yz: left.yz + right.yz,
    zx: left.zx + right.zx, zy: left.zy + right.zy, zz: left.zz + right.zz,
  };
}

function canonicalTensor(tensor: CoulombExceptionVirialTensorV042): CoulombExceptionVirialTensorV042 {
  return {
    xx: canonicalNumber(tensor.xx), xy: canonicalNumber(tensor.xy), xz: canonicalNumber(tensor.xz),
    yx: canonicalNumber(tensor.yx), yy: canonicalNumber(tensor.yy), yz: canonicalNumber(tensor.yz),
    zx: canonicalNumber(tensor.zx), zy: canonicalNumber(tensor.zy), zz: canonicalNumber(tensor.zz),
  };
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

export const DEFAULT_PERIODIC_COULOMB_EXCEPTION_OPTIONS_V042: PeriodicCoulombExceptionOptionsV042 = Object.freeze({
  relativePermittivity: 1,
  neutralityToleranceE: 1e-12,
  electrostaticConstantKjMolAngstromE2: COULOMB_CONSTANT_KJ_MOL_ANGSTROM_E2,
  maximumExceptions: MAXIMUM_EXCEPTIONS,
});
