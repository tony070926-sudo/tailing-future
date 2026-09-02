import type { Vector3 } from '../molecular/molecular-interactions.ts';
import {
  DeterministicVerletNeighborList,
  PeriodicCell,
  type Int3,
  type NeighborListSnapshot,
  type WrappedPeriodicPosition,
} from './periodic-cell.ts';
import {
  assertPotential,
  evaluateForceShiftedPotentialTerms,
  evaluateRadialPotential,
  radialForceVectorOnTarget,
  type BondedRadialPotential,
  type NonbondedRadialPotential,
  type RadialPotential,
} from './periodic-potentials.ts';

export type Tensor3 = Readonly<{
  xx: number; xy: number; xz: number;
  yx: number; yy: number; yz: number;
  zx: number; zy: number; zz: number;
}>;

export type PeriodicAtomTopologyV041 = Readonly<{
  id: string;
  label: string;
  element: string;
  atomType: string;
  massDalton: number;
  chargeE: number;
}>;

export type PeriodicAtomStateV041 = WrappedPeriodicPosition & Readonly<{
  id: string;
  velocityAngstromPerPicosecond: Vector3;
}>;

export type NonbondedPairRuleV041 = Readonly<{
  id: string;
  atomTypes: readonly [string, string];
  cutoffAngstrom: number;
  terms: ReadonlyArray<NonbondedRadialPotential>;
}>;

export type PeriodicBondV041 = Readonly<{
  id: string;
  atomAId: string;
  atomBId: string;
  imageShiftForB: Int3;
  potential: BondedRadialPotential;
}>;

export type PeriodicTopologyV041 = Readonly<{
  atoms: ReadonlyArray<PeriodicAtomTopologyV041>;
  pairRules: ReadonlyArray<NonbondedPairRuleV041>;
  bonds: ReadonlyArray<PeriodicBondV041>;
  excludeBondedNonbonded: boolean;
}>;

export type PeriodicPairInteractionV041 = Readonly<{
  id: string;
  role: 'nonbonded' | 'bonded';
  atomAId: string;
  atomBId: string;
  imageShiftForB: Int3;
  displacementAngstrom: Vector3;
  distanceAngstrom: number;
  energyKjMol: number;
  energyByKindKjMol: Readonly<Record<RadialPotential['kind'], number>>;
  forceOnBKjMolAngstrom: Vector3;
  pairVirialKjMol: Tensor3;
}>;

export type PeriodicForceEvaluationV041 = Readonly<{
  forceByAtomIdKjMolAngstrom: Readonly<Record<string, Vector3>>;
  potentialEnergyKjMol: number;
  energyByKindKjMol: Readonly<Record<RadialPotential['kind'], number>>;
  virialKjMol: Tensor3;
  perAtomVirialKjMol: Readonly<Record<string, Tensor3>>;
  pairInteractions: ReadonlyArray<PeriodicPairInteractionV041>;
  /** Ephemeral cache diagnostics; excluded from physical state and digests. */
  neighborListCache: NeighborListSnapshot;
  internalForceResidualKjMolAngstrom: number;
  minimumPairDistanceAngstrom: number | null;
}>;

const STABLE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const MAXIMUM_ABSOLUTE_IMAGE = 1_000_000_000;
const VALIDATED_TOPOLOGIES = new WeakSet<object>();

export function canonicalizePeriodicTopology(topology: PeriodicTopologyV041): PeriodicTopologyV041 {
  if (!topology || typeof topology !== 'object') throw new Error('periodic topology must be an object');
  const atomIds = new Set<string>();
  const atoms = topology.atoms.map((atom) => {
    if (!STABLE_TOKEN.test(atom.id) || atomIds.has(atom.id)) throw new Error('periodic topology atom IDs must be unique ASCII stable tokens');
    atomIds.add(atom.id);
    if (!atom.label || !atom.element || !STABLE_TOKEN.test(atom.atomType)) throw new Error('periodic atom types must be ASCII stable tokens and identity fields non-empty');
    assertPositiveFinite('atom mass', atom.massDalton);
    if (!Number.isFinite(atom.chargeE)) throw new Error('atom charge must be finite');
    return { ...atom };
  }).sort((left, right) => compareStableToken(left.id, right.id));
  if (atoms.length < 2) throw new Error('periodic topology requires at least two atoms');

  const ruleIds = new Set<string>();
  const ruleKeys = new Set<string>();
  const pairRules = topology.pairRules.map((rule) => {
    if (!STABLE_TOKEN.test(rule.id) || ruleIds.has(rule.id)) throw new Error('pair-rule IDs must be unique ASCII stable tokens');
    ruleIds.add(rule.id);
    if (!Array.isArray(rule.atomTypes) || rule.atomTypes.length !== 2 || rule.atomTypes.some((value) => !value)) {
      throw new Error('pair rules require two non-empty atom types');
    }
    if (!rule.atomTypes.every((value) => STABLE_TOKEN.test(value))) throw new Error('pair-rule atom types must be ASCII stable tokens');
    const atomTypes = [...rule.atomTypes].sort(compareStableToken) as [string, string];
    const key = canonicalPairKey(atomTypes[0], atomTypes[1]);
    if (ruleKeys.has(key)) throw new Error('pair rules must be unique per canonical atom-type pair');
    ruleKeys.add(key);
    assertPositiveFinite('pair-rule cutoff', rule.cutoffAngstrom);
    if (!Array.isArray(rule.terms) || rule.terms.length < 1) throw new Error('pair rules require at least one potential term');
    for (const term of rule.terms) {
      assertPotential(term);
      if ((term as RadialPotential).kind === 'harmonic-bond') throw new Error('harmonic-bond cannot be used as a nonbonded pair term');
    }
    return { ...rule, atomTypes, terms: rule.terms.map((term) => ({ ...term })) };
  }).sort((left, right) => compareStableToken(left.id, right.id));
  if (pairRules.length < 1) throw new Error('periodic topology requires at least one pair rule');
  const atomTypes = [...new Set(atoms.map((atom) => atom.atomType))].sort(compareStableToken);
  for (let left = 0; left < atomTypes.length; left += 1) {
    for (let right = left; right < atomTypes.length; right += 1) {
      if (!ruleKeys.has(canonicalPairKey(atomTypes[left], atomTypes[right]))) {
        throw new Error(`missing explicit pair rule for atom types ${atomTypes[left]} and ${atomTypes[right]}`);
      }
    }
  }

  const bondIds = new Set<string>();
  const bondPairs = new Set<string>();
  const bonds = topology.bonds.map((bond) => {
    if (!STABLE_TOKEN.test(bond.id) || bondIds.has(bond.id)) throw new Error('bond IDs must be unique ASCII stable tokens');
    bondIds.add(bond.id);
    if (!atomIds.has(bond.atomAId) || !atomIds.has(bond.atomBId) || bond.atomAId === bond.atomBId) {
      throw new Error('bonds must reference two distinct topology atoms');
    }
    assertInt3(bond.imageShiftForB, 'bond image shift');
    const pairKey = canonicalPairKey(bond.atomAId, bond.atomBId);
    if (bondPairs.has(pairKey)) throw new Error('only one radial bond is allowed per atom pair');
    bondPairs.add(pairKey);
    assertPotential(bond.potential);
    if (bond.potential.kind !== 'harmonic-bond' && bond.potential.kind !== 'morse') {
      throw new Error('bond potential must be harmonic-bond or morse');
    }
    return { ...bond, imageShiftForB: { ...bond.imageShiftForB }, potential: { ...bond.potential } };
  }).sort((left, right) => compareStableToken(left.id, right.id));

  const result = deepFreeze({
    atoms,
    pairRules,
    bonds,
    excludeBondedNonbonded: topology.excludeBondedNonbonded === true,
  }) as PeriodicTopologyV041;
  VALIDATED_TOPOLOGIES.add(result);
  return result;
}

export function evaluatePeriodicAtomisticForces(
  cell: PeriodicCell,
  topology: PeriodicTopologyV041,
  states: ReadonlyArray<PeriodicAtomStateV041>,
  neighborList: DeterministicVerletNeighborList,
): PeriodicForceEvaluationV041 {
  topology = requireValidatedTopology(topology);
  const topologyById = new Map(topology.atoms.map((atom) => [atom.id, atom]));
  const statesById = validateCompleteStates(topology, states);

  neighborList.assertCompatible(cell, maximumRuleCutoff(topology));

  const forceById = Object.fromEntries(topology.atoms.map((atom) => [atom.id, zeroVector()])) as Record<string, Vector3>;
  const perAtomVirial = Object.fromEntries(topology.atoms.map((atom) => [atom.id, zeroTensor()])) as Record<string, Tensor3>;
  const energyByKind = emptyEnergyRecord();
  const rulesByType = new Map(topology.pairRules.map((rule) => [canonicalPairKey(rule.atomTypes[0], rule.atomTypes[1]), rule]));
  const bondedPairKeys = new Set(topology.bonds.map((bond) => canonicalPairKey(bond.atomAId, bond.atomBId)));
  const neighborSnapshot = neighborList.update(states);
  const interactions: PeriodicPairInteractionV041[] = [];
  let potentialEnergyKjMol = 0;
  let totalVirial = zeroTensor();
  let minimumPairDistance = Number.POSITIVE_INFINITY;

  for (const pair of neighborSnapshot.pairs) {
    if (topology.excludeBondedNonbonded && bondedPairKeys.has(canonicalPairKey(pair.atomAId, pair.atomBId))) continue;
    const atomA = requireMap(topologyById, pair.atomAId, 'topology atom');
    const atomB = requireMap(topologyById, pair.atomBId, 'topology atom');
    const rule = rulesByType.get(canonicalPairKey(atomA.atomType, atomB.atomType));
    if (!rule) throw new Error(`missing evaluated pair rule for ${atomA.atomType} and ${atomB.atomType}`);
    if (pair.distanceAngstrom >= rule.cutoffAngstrom) continue;
    const evaluated = evaluateForceShiftedPotentialTerms(
      rule.terms,
      pair.distanceAngstrom,
      rule.cutoffAngstrom,
      atomA.chargeE * atomB.chargeE,
    );
    const forceOnB = radialForceVectorOnTarget(pair.displacementAngstrom, evaluated.forceMagnitudeOnTargetKjMolAngstrom);
    const pairVirial = outer(pair.displacementAngstrom, forceOnB);
    addPairContribution(forceById, perAtomVirial, pair.atomAId, pair.atomBId, forceOnB, pairVirial);
    totalVirial = addTensor(totalVirial, pairVirial);
    potentialEnergyKjMol += evaluated.energyKjMol;
    addEnergyRecord(energyByKind, evaluated.energyByKindKjMol);
    minimumPairDistance = Math.min(minimumPairDistance, pair.distanceAngstrom);
    interactions.push({
      id: `nonbonded:${rule.id}:${pair.atomAId}:${pair.atomBId}`,
      role: 'nonbonded',
      atomAId: pair.atomAId,
      atomBId: pair.atomBId,
      imageShiftForB: pair.imageShiftForB,
      displacementAngstrom: pair.displacementAngstrom,
      distanceAngstrom: pair.distanceAngstrom,
      energyKjMol: evaluated.energyKjMol,
      energyByKindKjMol: evaluated.energyByKindKjMol,
      forceOnBKjMolAngstrom: forceOnB,
      pairVirialKjMol: pairVirial,
    });
  }

  for (const bond of topology.bonds) {
    const stateA = requireMap(statesById, bond.atomAId, 'bond state atom');
    const stateB = requireMap(statesById, bond.atomBId, 'bond state atom');
    const relativeImage = addInt3(subtractInt3(stateB.image, stateA.image), bond.imageShiftForB);
    if ([relativeImage.x, relativeImage.y, relativeImage.z].some((component) => Math.abs(component) > 2)) {
      throw new Error('bond relative image exceeds the locked local topology domain');
    }
    const displacement = cell.latticeVector({
      x: relativeImage.x + stateB.wrappedFractional.x - stateA.wrappedFractional.x,
      y: relativeImage.y + stateB.wrappedFractional.y - stateA.wrappedFractional.y,
      z: relativeImage.z + stateB.wrappedFractional.z - stateA.wrappedFractional.z,
    });
    const distance = magnitude(displacement);
    const evaluated = evaluateRadialPotential(bond.potential, distance);
    const forceOnB = radialForceVectorOnTarget(displacement, evaluated.forceMagnitudeOnTargetKjMolAngstrom);
    const pairVirial = outer(displacement, forceOnB);
    addPairContribution(forceById, perAtomVirial, bond.atomAId, bond.atomBId, forceOnB, pairVirial);
    totalVirial = addTensor(totalVirial, pairVirial);
    potentialEnergyKjMol += evaluated.energyKjMol;
    energyByKind[bond.potential.kind] += evaluated.energyKjMol;
    minimumPairDistance = Math.min(minimumPairDistance, distance);
    interactions.push({
      id: `bonded:${bond.id}`,
      role: 'bonded',
      atomAId: bond.atomAId,
      atomBId: bond.atomBId,
      imageShiftForB: bond.imageShiftForB,
      displacementAngstrom: displacement,
      distanceAngstrom: distance,
      energyKjMol: evaluated.energyKjMol,
      energyByKindKjMol: { ...emptyEnergyRecord(), [bond.potential.kind]: evaluated.energyKjMol },
      forceOnBKjMolAngstrom: forceOnB,
      pairVirialKjMol: pairVirial,
    });
  }

  const totalForce = Object.values(forceById).reduce(add, zeroVector());
  assertFiniteEvaluation(forceById, potentialEnergyKjMol, totalVirial);
  return {
    forceByAtomIdKjMolAngstrom: cloneVectorRecord(forceById),
    potentialEnergyKjMol,
    energyByKindKjMol: { ...energyByKind },
    virialKjMol: { ...totalVirial },
    perAtomVirialKjMol: cloneTensorRecord(perAtomVirial),
    pairInteractions: interactions,
    neighborListCache: neighborSnapshot,
    internalForceResidualKjMolAngstrom: magnitude(totalForce),
    minimumPairDistanceAngstrom: Number.isFinite(minimumPairDistance) ? minimumPairDistance : null,
  };
}

export function maximumRuleCutoff(topology: PeriodicTopologyV041) {
  return Math.max(...topology.pairRules.map((rule) => rule.cutoffAngstrom));
}

export function canonicalPairKey(left: string, right: string) {
  return compareStableToken(left, right) <= 0 ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

export function kineticTensorKjMol(topology: PeriodicTopologyV041, states: ReadonlyArray<PeriodicAtomStateV041>): Tensor3 {
  return kineticTensorKjMolRelativeToVelocity(topology, states, { x: 0, y: 0, z: 0 });
}

export function kineticTensorKjMolRelativeToVelocity(
  topology: PeriodicTopologyV041,
  states: ReadonlyArray<PeriodicAtomStateV041>,
  referenceVelocityAngstromPerPicosecond: Vector3,
): Tensor3 {
  topology = requireValidatedTopology(topology);
  validateCompleteStates(topology, states);
  assertFiniteVector(referenceVelocityAngstromPerPicosecond, 'kinetic reference velocity');
  const topologyById = new Map(topology.atoms.map((atom) => [atom.id, atom]));
  return states.reduce((sum, state) => {
    const mass = requireMap(topologyById, state.id, 'kinetic topology atom').massDalton;
    const relativeVelocity = subtract(state.velocityAngstromPerPicosecond, referenceVelocityAngstromPerPicosecond);
    return addTensor(sum, scaleTensor(outer(relativeVelocity, relativeVelocity), 0.01 * mass));
  }, zeroTensor());
}

export function kineticEnergyKjMol(topology: PeriodicTopologyV041, states: ReadonlyArray<PeriodicAtomStateV041>) {
  return 0.5 * traceTensor(kineticTensorKjMol(topology, states));
}

export function totalMomentumDaltonAngstromPerPicosecond(
  topology: PeriodicTopologyV041,
  states: ReadonlyArray<PeriodicAtomStateV041>,
) {
  topology = requireValidatedTopology(topology);
  validateCompleteStates(topology, states);
  const topologyById = new Map(topology.atoms.map((atom) => [atom.id, atom]));
  return states.reduce((sum, state) => {
    const mass = requireMap(topologyById, state.id, 'momentum topology atom').massDalton;
    return add(sum, scale(state.velocityAngstromPerPicosecond, mass));
  }, zeroVector());
}

export function addTensor(left: Tensor3, right: Tensor3): Tensor3 {
  return {
    xx: left.xx + right.xx, xy: left.xy + right.xy, xz: left.xz + right.xz,
    yx: left.yx + right.yx, yy: left.yy + right.yy, yz: left.yz + right.yz,
    zx: left.zx + right.zx, zy: left.zy + right.zy, zz: left.zz + right.zz,
  };
}

export function scaleTensor(tensor: Tensor3, factor: number): Tensor3 {
  return {
    xx: tensor.xx * factor, xy: tensor.xy * factor, xz: tensor.xz * factor,
    yx: tensor.yx * factor, yy: tensor.yy * factor, yz: tensor.yz * factor,
    zx: tensor.zx * factor, zy: tensor.zy * factor, zz: tensor.zz * factor,
  };
}

export function traceTensor(tensor: Tensor3) {
  return tensor.xx + tensor.yy + tensor.zz;
}

export function zeroTensor(): Tensor3 {
  return { xx: 0, xy: 0, xz: 0, yx: 0, yy: 0, yz: 0, zx: 0, zy: 0, zz: 0 };
}

function addPairContribution(
  forceById: Record<string, Vector3>,
  perAtomVirial: Record<string, Tensor3>,
  atomAId: string,
  atomBId: string,
  forceOnB: Vector3,
  pairVirial: Tensor3,
) {
  forceById[atomAId] = subtract(forceById[atomAId], forceOnB);
  forceById[atomBId] = add(forceById[atomBId], forceOnB);
  const halfVirial = scaleTensor(pairVirial, 0.5);
  perAtomVirial[atomAId] = addTensor(perAtomVirial[atomAId], halfVirial);
  perAtomVirial[atomBId] = addTensor(perAtomVirial[atomBId], halfVirial);
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

function addEnergyRecord(target: Record<RadialPotential['kind'], number>, source: Readonly<Record<RadialPotential['kind'], number>>) {
  for (const kind of Object.keys(target) as RadialPotential['kind'][]) target[kind] += source[kind];
}

function outer(left: Vector3, right: Vector3): Tensor3 {
  return {
    xx: left.x * right.x, xy: left.x * right.y, xz: left.x * right.z,
    yx: left.y * right.x, yy: left.y * right.y, yz: left.y * right.z,
    zx: left.z * right.x, zy: left.z * right.y, zz: left.z * right.z,
  };
}

function cloneVectorRecord(record: Readonly<Record<string, Vector3>>) {
  return Object.fromEntries(Object.entries(record).map(([id, vector]) => [id, { ...vector }]));
}

function cloneTensorRecord(record: Readonly<Record<string, Tensor3>>) {
  return Object.fromEntries(Object.entries(record).map(([id, tensor]) => [id, { ...tensor }]));
}

function assertFiniteEvaluation(forceById: Readonly<Record<string, Vector3>>, energy: number, virial: Tensor3) {
  if (!Number.isFinite(energy)) throw new Error('periodic potential energy became non-finite');
  for (const [id, force] of Object.entries(forceById)) {
    if (![force.x, force.y, force.z].every(Number.isFinite)) throw new Error(`periodic force became non-finite for ${id}`);
  }
  if (!Object.values(virial).every(Number.isFinite)) throw new Error('periodic virial became non-finite');
}

function assertState(state: PeriodicAtomStateV041) {
  if (!STABLE_TOKEN.test(state.id)) throw new Error('periodic state atom ID must be an ASCII stable token');
  if (![state.wrappedFractional.x, state.wrappedFractional.y, state.wrappedFractional.z].every((value) => Number.isFinite(value) && value >= 0 && value < 1)) {
    throw new Error('periodic state wrapped coordinates must be finite and in [0, 1)');
  }
  assertInt3(state.image, 'periodic state image');
  assertFiniteVector(state.velocityAngstromPerPicosecond, 'periodic state velocity');
}

function assertInt3(value: Int3, label: string) {
  if (!value || ![value.x, value.y, value.z].every((component) => Number.isSafeInteger(component) && Math.abs(component) <= MAXIMUM_ABSOLUTE_IMAGE)) {
    throw new Error(`${label} must contain bounded safe integers`);
  }
}

function assertPositiveFinite(label: string, value: number) {
  if (!(Number.isFinite(value) && value > 0)) throw new Error(`${label} must be finite and positive`);
}

function addInt3(left: Int3, right: Int3): Int3 {
  const value = { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
  assertInt3(value, 'combined periodic image');
  return value;
}

function subtractInt3(left: Int3, right: Int3): Int3 {
  const value = { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
  if (![value.x, value.y, value.z].every(Number.isSafeInteger)) throw new Error('periodic image difference exceeds the safe integer domain');
  return value;
}

function requireValidatedTopology(topology: PeriodicTopologyV041) {
  return VALIDATED_TOPOLOGIES.has(topology as object) ? topology : canonicalizePeriodicTopology(topology);
}

function validateCompleteStates(topology: PeriodicTopologyV041, states: ReadonlyArray<PeriodicAtomStateV041>) {
  const topologyIds = new Set(topology.atoms.map((atom) => atom.id));
  const statesById = new Map<string, PeriodicAtomStateV041>();
  for (const state of states) {
    if (!topologyIds.has(state.id) || statesById.has(state.id)) throw new Error('periodic state atom identities do not match topology');
    assertState(state);
    statesById.set(state.id, state);
  }
  if (statesById.size !== topologyIds.size) throw new Error('periodic state atom count does not match topology');
  return statesById;
}

function assertFiniteVector(vector: Vector3, label: string) {
  if (!vector || !Number.isFinite(vector.x) || !Number.isFinite(vector.y) || !Number.isFinite(vector.z)) {
    throw new Error(`${label} must contain finite x, y and z components`);
  }
}

function compareStableToken(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function requireMap<K, V>(map: ReadonlyMap<K, V>, key: K, label: string) {
  const value = map.get(key);
  if (value === undefined) throw new Error(`${label} is missing`);
  return value;
}

function zeroVector(): Vector3 { return { x: 0, y: 0, z: 0 }; }
function add(left: Vector3, right: Vector3): Vector3 { return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z }; }
function subtract(left: Vector3, right: Vector3): Vector3 { return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }; }
function scale(vector: Vector3, factor: number): Vector3 { return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor }; }
function magnitude(vector: Vector3) { return Math.hypot(vector.x, vector.y, vector.z); }
