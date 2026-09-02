import type { Vector3 } from '../molecular/molecular-interactions.ts';
import { AMBER14_TIP3P_PARAMETERS_V042 } from './amber14-tip3p-parameters.ts';
import { digestValue } from './digest.ts';
import { PeriodicCell, type WrappedPeriodicPosition } from './periodic-cell.ts';
import { canonicalizeDirectEwaldOptionsV042 } from './periodic-ewald.ts';
import {
  applyRattleVelocityConstraints,
  applyShakePositionConstraints,
  type RigidConstraintAtom,
} from './rigid-constraints.ts';

export type AqueousAtomTopologyV042 = Readonly<{
  id: string;
  element: string;
  massDalton: number;
  chargeE: number;
  lennardJones: Readonly<{ sigmaAngstrom: number; epsilonKjMol: number }>;
  identity: Readonly<{
    moleculeId: string;
    residueId: string;
    residueName: string;
    siteName: string;
    siteIndex: number;
  }>;
}>;

export type AqueousDistanceConstraintV042 = Readonly<{
  id: string;
  atomAId: string;
  atomBId: string;
  distanceAngstrom: number;
}>;

export type AqueousEnergeticBondV042 = Readonly<{
  id: string;
  atomAId: string;
  atomBId: string;
  potential: Readonly<{
    kind: 'harmonic';
    equilibriumDistanceAngstrom: number;
    forceConstantKjMolAngstrom2: number;
  }>;
}>;

export type AqueousExceptionRuleV042 =
  | Readonly<{ mode: 'exclude' }>
  | Readonly<{ mode: 'scale'; scale: number }>;

export type AqueousNonbondedExceptionV042 = Readonly<{
  id: string;
  atomAId: string;
  atomBId: string;
  coulomb: AqueousExceptionRuleV042;
  lennardJones: AqueousExceptionRuleV042;
}>;

export type AqueousDirectEwaldSettingsV042 = Readonly<{
  method: 'direct-ewald-explicit-real-and-reciprocal-sums';
  alphaInverseAngstrom: number;
  realSpaceCutoffAngstrom: number;
  reciprocalCutoffInverseAngstrom: number;
  relativePermittivity: 1;
  neutralityToleranceE: number;
  electrostaticConstantKjMolAngstromE2: number;
  maximumRealSpaceWorkUnits: number;
  maximumReciprocalSpaceWorkUnits: number;
}>;

export type AqueousSourcePinV042 = Readonly<{
  id: string;
  owner: string;
  repository: string;
  sourceCommit: string;
  filePath: string;
  sizeBytes: number;
  sha256: string;
  executionPerformed: false;
  licenseClearance: false;
}>;

export type AqueousResidueTopologyV042 = Readonly<{
  id: string;
  moleculeId: string;
  name: string;
  atomIds: ReadonlyArray<string>;
}>;

export type AqueousMoleculeTopologyV042 = Readonly<{
  id: string;
  kind: 'rigid-tip3p-water' | 'monatomic-ion';
  residueIds: ReadonlyArray<string>;
  atomIds: ReadonlyArray<string>;
}>;

export type AqueousShortRangeNonbondedV042 = Readonly<{
  method: 'lennard-jones-12-6';
  mixingRule: 'lorentz-berthelot';
  cutoffAngstrom: number;
  switchingPolicy: 'none';
  energyShift: false;
  dispersionCorrection: false;
  maximumPairWorkUnits: number;
}>;

export type AqueousParameterReceiptV042 = typeof AMBER14_TIP3P_PARAMETERS_V042;

export type AqueousTopologyV042 = Readonly<{
  schemaVersion: 'tf.aqueous-topology/0.4.2';
  topologyId: string;
  topologyDigest: string;
  atoms: ReadonlyArray<AqueousAtomTopologyV042>;
  molecules: ReadonlyArray<AqueousMoleculeTopologyV042>;
  residues: ReadonlyArray<AqueousResidueTopologyV042>;
  energeticBonds: ReadonlyArray<AqueousEnergeticBondV042>;
  constraints: ReadonlyArray<AqueousDistanceConstraintV042>;
  nonbondedExceptions: ReadonlyArray<AqueousNonbondedExceptionV042>;
  shortRangeNonbonded: AqueousShortRangeNonbondedV042;
  electrostatics: AqueousDirectEwaldSettingsV042;
  parameterReceipt: AqueousParameterReceiptV042;
  sourcePins: ReadonlyArray<AqueousSourcePinV042>;
  provenance: Readonly<{
    evidenceClass: 'contract-only';
    modelExecution: false;
    dynamicsExecution: false;
    canonicalization: 'stable-ascii-id-order';
  }>;
  claimBoundaries: Readonly<{
    naclWaterTrajectory: false;
    forceFieldReproduction: false;
    pmeOrOpenmmExecution: false;
    industrialPrediction: false;
    licenseClearance: false;
  }>;
}>;

export const AQUEOUS_ACTION_BUDGET = Object.freeze({
  maximumSubsteps: 1_000,
  maximumWorkUnits: 1_000_000,
});

type ActionBudgetV042 = Readonly<{
  requestedWorkUnits: number;
  maximumWorkUnits: 1000000;
  withinBudget: true;
}>;

export type AqueousActionParametersV042 =
  | Readonly<{
    kind: 'advance';
    substeps: number;
    budget: ActionBudgetV042;
  }>
  | Readonly<{ kind: 'observe'; includePerAtomForces: boolean; budget: ActionBudgetV042 }>
  | Readonly<{ kind: 'checkpoint'; checkpointId: string; budget: ActionBudgetV042 }>
  | Readonly<{ kind: 'restore'; checkpointId: string; expectedStateDigest: string; budget: ActionBudgetV042 }>
  | Readonly<{ kind: 'branch'; fromStep: number; branchOrdinal: number; budget: ActionBudgetV042 }>;

export type AqueousActionV042 = Readonly<{
  schemaVersion: 'tf.aqueous-action/0.4.2';
  actionId: string;
  kind: AqueousActionParametersV042['kind'];
  parentStateId: string;
  resultingStateId: string;
  appliedAtStep: number;
  parameters: AqueousActionParametersV042;
}>;

export type AqueousActionRequestV042 =
  | Readonly<{ kind: 'advance'; substeps: number }>
  | Readonly<{ kind: 'observe'; includePerAtomForces: boolean }>
  | Readonly<{ kind: 'checkpoint'; checkpointId: string }>
  | Readonly<{ kind: 'restore'; checkpointId: string; expectedStateDigest: string }>
  | Readonly<{ kind: 'branch'; fromStep: number; branchOrdinal: number }>;

export type AqueousAtomStateV042 = Readonly<{
  id: string;
  position: WrappedPeriodicPosition;
  velocityAngstromPerPicosecond: Vector3;
}>;

export type AqueousPeriodicCellV042 = Readonly<{
  kind: 'triclinic-periodic-cell';
  originGauge: 'wrapped-fractional-plus-integer-image';
  boundary: Readonly<{ x: 'periodic'; y: 'periodic'; z: 'periodic' }>;
  aAngstrom: Vector3;
  bAngstrom: Vector3;
  cAngstrom: Vector3;
  volumeAngstrom3: number;
}>;

export type AqueousWorldStateV042 = Readonly<{
  schemaVersion: 'tf.aqueous-world-state/0.4.2';
  status: 'contract-only-no-dynamics';
  worldId: string;
  stateId: string;
  stateDigest: string;
  topologyDigest: string;
  parentStateId: string | null;
  revision: number;
  step: number;
  timePicoseconds: number;
  periodicCell: AqueousPeriodicCellV042;
  topology: AqueousTopologyV042;
  atoms: ReadonlyArray<AqueousAtomStateV042>;
  checkpointIds: ReadonlyArray<string>;
  lastAction: AqueousActionV042 | null;
}>;

export type AqueousEnergyComponentsV042 = Readonly<{
  shortRangeKjMol: number;
  ewaldRealSpaceKjMol: number;
  ewaldReciprocalSpaceKjMol: number;
  ewaldSelfKjMol: number;
  nonbondedExceptionKjMol: number;
  constraintEnergyKjMol: null;
  constraintEnergyBoundary: 'holonomic-constraint-is-not-a-potential-energy-term';
  kineticKjMol: number;
  totalKjMol: number;
}>;

export type AqueousForceComponentsV042 = Readonly<{
  shortRangeKjMolAngstrom: Vector3;
  ewaldRealSpaceKjMolAngstrom: Vector3;
  ewaldReciprocalSpaceKjMolAngstrom: Vector3;
  ewaldSelfKjMolAngstrom: Vector3;
  nonbondedExceptionKjMolAngstrom: Vector3;
  constraintKjMolAngstrom: Vector3;
  totalKjMolAngstrom: Vector3;
}>;

export type AqueousObservationV042 = Readonly<{
  schemaVersion: 'tf.aqueous-observation/0.4.2';
  status: 'contract-only-no-dynamics';
  observationDigest: string;
  worldId: string;
  stateId: string;
  stateDigest: string;
  topologyDigest: string;
  step: number;
  timePicoseconds: number;
  periodicCell: AqueousPeriodicCellV042;
  atoms: ReadonlyArray<AqueousAtomStateV042>;
  energy: AqueousEnergyComponentsV042;
  forceComponentsByAtomId: Readonly<Record<string, AqueousForceComponentsV042>>;
  electrostatics: Readonly<{
    settings: AqueousDirectEwaldSettingsV042;
    netChargeE: number;
    directEwaldExecuted: false;
  }>;
  thermodynamics: Readonly<{
    atomCount: number;
    coordinateDegreesOfFreedom: number;
    constraintDegreesOfFreedom: number;
    centerOfMassRemovedDegreesOfFreedom: number;
    temperatureDegreesOfFreedom: number;
    kineticFrame: 'center-of-mass';
    temperatureKelvin: null;
  }>;
  mechanicalObservables: Readonly<{
    pressureBar: null;
    totalStressKjMolAngstrom3: null;
    boundary: 'unavailable-reciprocal-virial-not-implemented';
  }>;
  provenance: AqueousTopologyV042['provenance'];
  uncertainty: Readonly<{
    status: 'not-quantified-contract-only';
    aleatoric: null;
    epistemic: null;
    coverage: 'schema-and-contract-only';
  }>;
  claimBoundaries: AqueousTopologyV042['claimBoundaries'];
}>;

const STABLE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const ELEMENT = /^[A-Z][a-z]{0,2}$/;

export function canonicalizeAqueousTopology(
  input: Omit<AqueousTopologyV042, 'topologyDigest'>,
): AqueousTopologyV042 {
  if (!input || input.schemaVersion !== 'tf.aqueous-topology/0.4.2') {
    throw new Error('aqueous topology requires exact schema version 0.4.2');
  }
  assertToken(input.topologyId, 'topologyId');
  assertExactKeys(input, [
    'schemaVersion', 'topologyId', 'atoms', 'molecules', 'residues', 'energeticBonds', 'constraints',
    'nonbondedExceptions', 'shortRangeNonbonded', 'electrostatics', 'parameterReceipt', 'sourcePins',
    'provenance', 'claimBoundaries',
  ], 'aqueous topology');
  if (!Array.isArray(input.atoms) || input.atoms.length < 2 || input.atoms.length > 512) {
    throw new Error('aqueous direct-Ewald topology atom count must be in [2, 512]');
  }
  const atoms = [...input.atoms].map(canonicalAtom).sort(byId);
  assertUniqueIds(atoms, 'atom');
  const atomIds = new Set(atoms.map((atom) => atom.id));
  const residues = canonicalResidues(input.residues, atomIds);
  const molecules = canonicalMolecules(input.molecules, atomIds, new Set(residues.map((residue) => residue.id)));
  validateIdentityMembership(atoms, molecules, residues);
  const energeticBonds = canonicalPairs(input.energeticBonds, 'energetic bond', atomIds, canonicalEnergeticBond);
  const constraints = canonicalPairs(input.constraints, 'constraint', atomIds, canonicalConstraint);
  const nonbondedExceptions = canonicalPairs(
    input.nonbondedExceptions,
    'nonbonded exception',
    atomIds,
    canonicalException,
  );
  canonicalShortRange(input.shortRangeNonbonded);
  canonicalEwald(input.electrostatics);
  const netChargeE = atoms.reduce((sum, atom) => sum + atom.chargeE, 0);
  if (Math.abs(netChargeE) > input.electrostatics.neutralityToleranceE) {
    throw new Error('aqueous direct-Ewald topology must be neutral within the locked tolerance');
  }
  const sourcePins = [...input.sourcePins].map(canonicalSourcePin).sort(byId);
  assertUniqueIds(sourcePins, 'source pin');
  canonicalParameterReceipt(input.parameterReceipt, sourcePins);
  validateRigidTip3pClosedSets(
    atoms,
    molecules,
    residues,
    energeticBonds,
    constraints,
    nonbondedExceptions,
  );
  assertExactKeys(input.provenance, ['evidenceClass', 'modelExecution', 'dynamicsExecution', 'canonicalization'], 'provenance');
  if (input.provenance?.evidenceClass !== 'contract-only'
    || input.provenance.modelExecution !== false
    || input.provenance.dynamicsExecution !== false
    || input.provenance.canonicalization !== 'stable-ascii-id-order') {
    throw new Error('aqueous topology provenance must remain contract-only');
  }
  assertExactKeys(input.claimBoundaries, [
    'naclWaterTrajectory', 'forceFieldReproduction', 'pmeOrOpenmmExecution',
    'industrialPrediction', 'licenseClearance',
  ], 'claim boundaries');
  if (Object.values(input.claimBoundaries).some((value) => value !== false)) {
    throw new Error('aqueous topology claim boundaries must all remain false');
  }
  const payload = {
    schemaVersion: input.schemaVersion,
    topologyId: input.topologyId,
    atoms,
    molecules,
    residues,
    energeticBonds,
    constraints,
    nonbondedExceptions,
    shortRangeNonbonded: { ...input.shortRangeNonbonded },
    electrostatics: { ...input.electrostatics },
    parameterReceipt: structuredClone(input.parameterReceipt),
    sourcePins,
    provenance: { ...input.provenance },
    claimBoundaries: { ...input.claimBoundaries },
  };
  return deepFreeze({ ...payload, topologyDigest: digestValue(payload) });
}

export function createAqueousAction(
  request: AqueousActionRequestV042,
  lineage: Readonly<{
    parentStateId: string;
    resultingStateId: string;
    appliedAtStep: number;
  }>,
): AqueousActionV042 {
  assertExactKeys(lineage, ['parentStateId', 'resultingStateId', 'appliedAtStep'], 'action lineage');
  assertToken(lineage.parentStateId, 'parentStateId');
  assertToken(lineage.resultingStateId, 'resultingStateId');
  assertInteger(lineage.appliedAtStep, 0, 1_000_000_000, 'appliedAtStep');
  let requestedWorkUnits = 1;
  let parameters: AqueousActionParametersV042;
  if (request.kind === 'advance') {
    assertExactKeys(request, ['kind', 'substeps'], 'advance request');
    assertInteger(request.substeps, 1, AQUEOUS_ACTION_BUDGET.maximumSubsteps, 'advance substeps');
    requestedWorkUnits = request.substeps;
    parameters = {
      kind: request.kind,
      substeps: request.substeps,
      budget: actionBudget(requestedWorkUnits),
    };
  } else if (request.kind === 'observe') {
    assertExactKeys(request, ['kind', 'includePerAtomForces'], 'observe request');
    if (typeof request.includePerAtomForces !== 'boolean') throw new Error('observe flag must be boolean');
    parameters = { kind: request.kind, includePerAtomForces: request.includePerAtomForces, budget: actionBudget(1) };
  } else if (request.kind === 'checkpoint') {
    assertExactKeys(request, ['kind', 'checkpointId'], 'checkpoint request');
    assertToken(request.checkpointId, 'checkpointId');
    parameters = { kind: request.kind, checkpointId: request.checkpointId, budget: actionBudget(1) };
  } else if (request.kind === 'restore') {
    assertExactKeys(request, ['kind', 'checkpointId', 'expectedStateDigest'], 'restore request');
    assertToken(request.checkpointId, 'checkpointId');
    if (!DIGEST.test(request.expectedStateDigest)) throw new Error('restore expectedStateDigest is invalid');
    parameters = {
      kind: request.kind,
      checkpointId: request.checkpointId,
      expectedStateDigest: request.expectedStateDigest,
      budget: actionBudget(1),
    };
  } else if (request.kind === 'branch') {
    assertExactKeys(request, ['kind', 'fromStep', 'branchOrdinal'], 'branch request');
    assertInteger(request.fromStep, 0, 1_000_000_000, 'branch fromStep');
    assertInteger(request.branchOrdinal, 1, Number.MAX_SAFE_INTEGER, 'branch branchOrdinal');
    parameters = {
      kind: request.kind,
      fromStep: request.fromStep,
      branchOrdinal: request.branchOrdinal,
      budget: actionBudget(1),
    };
  } else {
    throw new Error('unsupported aqueous action kind');
  }
  const payload = {
    schemaVersion: 'tf.aqueous-action/0.4.2' as const,
    kind: request.kind,
    parentStateId: lineage.parentStateId,
    resultingStateId: lineage.resultingStateId,
    appliedAtStep: lineage.appliedAtStep,
    parameters,
  };
  void requestedWorkUnits;
  return deepFreeze({ ...payload, actionId: digestValue(payload) });
}

export function createAqueousContractFixture(): Readonly<{
  topology: AqueousTopologyV042;
  state: AqueousWorldStateV042;
  actions: ReadonlyArray<AqueousActionV042>;
  observation: AqueousObservationV042;
}> {
  const topology = canonicalizeAqueousTopology(tip3pTopologyInput());
  const cell = contractPeriodicCellInstance();
  const periodicCell = contractPeriodicCell(cell);
  const stateId = 'aqueous-contract-state-000001';
  const parentStateId = 'aqueous-contract-state-000000';
  const actions = [
    createAqueousAction(
      { kind: 'advance', substeps: 1 },
      { parentStateId, resultingStateId: stateId, appliedAtStep: 0 },
    ),
    createAqueousAction(
      { kind: 'observe', includePerAtomForces: true },
      { parentStateId: stateId, resultingStateId: stateId, appliedAtStep: 0 },
    ),
    createAqueousAction(
      { kind: 'checkpoint', checkpointId: 'checkpoint-000001' },
      { parentStateId: stateId, resultingStateId: stateId, appliedAtStep: 0 },
    ),
    createAqueousAction(
      { kind: 'restore', checkpointId: 'checkpoint-000001', expectedStateDigest: digestValue('checkpoint-state') },
      { parentStateId: stateId, resultingStateId: 'aqueous-contract-state-restored', appliedAtStep: 0 },
    ),
    createAqueousAction(
      { kind: 'branch', fromStep: 0, branchOrdinal: 1 },
      { parentStateId: stateId, resultingStateId: 'aqueous-contract-state-branch-1', appliedAtStep: 0 },
    ),
  ] as const;
  const atoms = contractAtomStates(cell);
  assertContractConstraintManifold(cell, topology, atoms);
  const statePayload = {
    schemaVersion: 'tf.aqueous-world-state/0.4.2' as const,
    status: 'contract-only-no-dynamics' as const,
    worldId: 'aqueous-contract-world',
    stateId,
    topologyDigest: topology.topologyDigest,
    parentStateId: null,
    revision: 0,
    step: 0,
    timePicoseconds: 0,
    periodicCell,
    topology,
    atoms,
    checkpointIds: [],
    lastAction: null,
  };
  const state = deepFreeze({ ...statePayload, stateDigest: digestValue(statePayload) });
  const zeroForce = () => ({
    shortRangeKjMolAngstrom: zero(),
    ewaldRealSpaceKjMolAngstrom: zero(),
    ewaldReciprocalSpaceKjMolAngstrom: zero(),
    ewaldSelfKjMolAngstrom: zero(),
    nonbondedExceptionKjMolAngstrom: zero(),
    constraintKjMolAngstrom: zero(),
    totalKjMolAngstrom: zero(),
  });
  const observationPayload = {
    schemaVersion: 'tf.aqueous-observation/0.4.2' as const,
    status: 'contract-only-no-dynamics' as const,
    worldId: state.worldId,
    stateId: state.stateId,
    stateDigest: state.stateDigest,
    topologyDigest: topology.topologyDigest,
    step: state.step,
    timePicoseconds: state.timePicoseconds,
    periodicCell: state.periodicCell,
    atoms,
    energy: {
      shortRangeKjMol: 0,
      ewaldRealSpaceKjMol: 0,
      ewaldReciprocalSpaceKjMol: 0,
      ewaldSelfKjMol: 0,
      nonbondedExceptionKjMol: 0,
      constraintEnergyKjMol: null,
      constraintEnergyBoundary: 'holonomic-constraint-is-not-a-potential-energy-term' as const,
      kineticKjMol: 0,
      totalKjMol: 0,
    },
    forceComponentsByAtomId: Object.fromEntries(atoms.map((atom) => [atom.id, zeroForce()])),
    electrostatics: {
      settings: topology.electrostatics,
      netChargeE: 0,
      directEwaldExecuted: false as const,
    },
    thermodynamics: {
      atomCount: 5,
      coordinateDegreesOfFreedom: 15,
      constraintDegreesOfFreedom: 3,
      centerOfMassRemovedDegreesOfFreedom: 3,
      temperatureDegreesOfFreedom: 9,
      kineticFrame: 'center-of-mass' as const,
      temperatureKelvin: null,
    },
    mechanicalObservables: {
      pressureBar: null,
      totalStressKjMolAngstrom3: null,
      boundary: 'unavailable-reciprocal-virial-not-implemented' as const,
    },
    provenance: topology.provenance,
    uncertainty: {
      status: 'not-quantified-contract-only' as const,
      aleatoric: null,
      epistemic: null,
      coverage: 'schema-and-contract-only' as const,
    },
    claimBoundaries: topology.claimBoundaries,
  };
  const observation = deepFreeze({
    ...observationPayload,
    observationDigest: digestValue(observationPayload),
  });
  return deepFreeze({ topology, state, actions, observation });
}

function tip3pTopologyInput(): Omit<AqueousTopologyV042, 'topologyDigest'> {
  const identity = (siteName: string, siteIndex: number) => ({
    moleculeId: 'water-000001',
    residueId: 'residue-000001',
    residueName: 'HOH',
    siteName,
    siteIndex,
  });
  const ionIdentity = (moleculeId: string, residueName: string, siteName: string) => ({
    moleculeId,
    residueId: `residue-${moleculeId}`,
    residueName,
    siteName,
    siteIndex: 0,
  });
  const exclude = { mode: 'exclude' as const };
  return {
    schemaVersion: 'tf.aqueous-topology/0.4.2',
    topologyId: 'neutral-tip3p-nacl-contract-topology',
    atoms: [
      atomFromReceipt('water-o', AMBER14_TIP3P_PARAMETERS_V042.sites.waterOxygen, identity('O', 0)),
      atomFromReceipt('water-h1', AMBER14_TIP3P_PARAMETERS_V042.sites.waterHydrogen, identity('H1', 1)),
      atomFromReceipt('water-h2', AMBER14_TIP3P_PARAMETERS_V042.sites.waterHydrogen, identity('H2', 2)),
      atomFromReceipt('sodium-na', AMBER14_TIP3P_PARAMETERS_V042.sites.sodiumIon, ionIdentity('sodium', 'NA', 'Na')),
      atomFromReceipt('chloride-cl', AMBER14_TIP3P_PARAMETERS_V042.sites.chlorideIon, ionIdentity('chloride', 'CL', 'Cl')),
    ],
    molecules: [{
      id: 'water-000001',
      kind: 'rigid-tip3p-water',
      residueIds: ['residue-000001'],
      atomIds: ['water-o', 'water-h1', 'water-h2'],
    }, {
      id: 'sodium', kind: 'monatomic-ion', residueIds: ['residue-sodium'], atomIds: ['sodium-na'],
    }, {
      id: 'chloride', kind: 'monatomic-ion', residueIds: ['residue-chloride'], atomIds: ['chloride-cl'],
    }],
    residues: [{
      id: 'residue-000001',
      moleculeId: 'water-000001',
      name: 'HOH',
      atomIds: ['water-o', 'water-h1', 'water-h2'],
    }, {
      id: 'residue-sodium', moleculeId: 'sodium', name: 'NA', atomIds: ['sodium-na'],
    }, {
      id: 'residue-chloride', moleculeId: 'chloride', name: 'CL', atomIds: ['chloride-cl'],
    }],
    energeticBonds: [],
    constraints: [
      { id: 'constraint-oh1', atomAId: 'water-o', atomBId: 'water-h1', distanceAngstrom: AMBER14_TIP3P_PARAMETERS_V042.rigidWaterGeometry.oxygenHydrogenDistanceAngstrom },
      { id: 'constraint-oh2', atomAId: 'water-o', atomBId: 'water-h2', distanceAngstrom: AMBER14_TIP3P_PARAMETERS_V042.rigidWaterGeometry.oxygenHydrogenDistanceAngstrom },
      { id: 'constraint-hh', atomAId: 'water-h1', atomBId: 'water-h2', distanceAngstrom: AMBER14_TIP3P_PARAMETERS_V042.rigidWaterGeometry.hydrogenHydrogenDistanceAngstrom },
    ],
    nonbondedExceptions: [
      { id: 'exception-oh1', atomAId: 'water-o', atomBId: 'water-h1', coulomb: exclude, lennardJones: exclude },
      { id: 'exception-oh2', atomAId: 'water-o', atomBId: 'water-h2', coulomb: exclude, lennardJones: exclude },
      { id: 'exception-hh', atomAId: 'water-h1', atomBId: 'water-h2', coulomb: exclude, lennardJones: exclude },
    ],
    shortRangeNonbonded: {
      method: 'lennard-jones-12-6',
      mixingRule: 'lorentz-berthelot',
      cutoffAngstrom: 9,
      switchingPolicy: 'none',
      energyShift: false,
      dispersionCorrection: false,
      maximumPairWorkUnits: 1_000_000,
    },
    electrostatics: {
      method: 'direct-ewald-explicit-real-and-reciprocal-sums',
      alphaInverseAngstrom: 0.45,
      realSpaceCutoffAngstrom: 18,
      reciprocalCutoffInverseAngstrom: 7,
      relativePermittivity: 1,
      neutralityToleranceE: 1e-12,
      electrostaticConstantKjMolAngstromE2: 1389.35458,
      maximumRealSpaceWorkUnits: 10_000_000,
      maximumReciprocalSpaceWorkUnits: 10_000_000,
    },
    parameterReceipt: AMBER14_TIP3P_PARAMETERS_V042,
    sourcePins: [
      { id: 'openmm-tip3p-amber14', owner: 'OpenMM', repository: 'https://github.com/openmm/openmm', sourceCommit: 'f7fa0c27c1f8d943c339d67b3bf22f026d0bd8b5', filePath: 'wrappers/python/openmm/app/data/amber14/tip3p.xml', sizeBytes: 19070, sha256: 'sha256:3f4b188dbcb6c02863230eaca231e927fb6bf3307ce947d8a50d0f46f6dd83d9', executionPerformed: false, licenseClearance: false },
    ],
    provenance: {
      evidenceClass: 'contract-only',
      modelExecution: false,
      dynamicsExecution: false,
      canonicalization: 'stable-ascii-id-order',
    },
    claimBoundaries: {
      naclWaterTrajectory: false,
      forceFieldReproduction: false,
      pmeOrOpenmmExecution: false,
      industrialPrediction: false,
      licenseClearance: false,
    },
  };
}

function contractAtomStates(cell: PeriodicCell): ReadonlyArray<AqueousAtomStateV042> {
  const geometry = AMBER14_TIP3P_PARAMETERS_V042.rigidWaterGeometry;
  const oxygen = cell.fractionalToCartesian({ x: 0.98, y: 0.5, z: 0.5 });
  const hydrogenOne = add(oxygen, {
    x: geometry.oxygenHydrogenDistanceAngstrom,
    y: 0,
    z: 0,
  });
  const hydrogenTwo = add(oxygen, {
    x: geometry.oxygenHydrogenDistanceAngstrom
      * Math.cos(geometry.hydrogenOxygenHydrogenAngleRadian),
    y: geometry.oxygenHydrogenDistanceAngstrom
      * Math.sin(geometry.hydrogenOxygenHydrogenAngleRadian),
    z: 0,
  });
  return [
    { id: 'water-o', position: cell.wrapCartesian(oxygen) },
    { id: 'water-h1', position: cell.wrapCartesian(hydrogenOne) },
    { id: 'water-h2', position: cell.wrapCartesian(hydrogenTwo) },
    { id: 'sodium-na', position: cell.wrapFractional({ x: 0.25, y: 0.25, z: 0.5 }) },
    { id: 'chloride-cl', position: cell.wrapFractional({ x: 0.75, y: 0.75, z: 0.5 }) },
  ].map((atom) => ({ ...atom, velocityAngstromPerPicosecond: zero() }));
}

function atomFromReceipt(
  id: string,
  site: AqueousParameterReceiptV042['sites'][keyof AqueousParameterReceiptV042['sites']],
  identity: AqueousAtomTopologyV042['identity'],
): AqueousAtomTopologyV042 {
  return {
    id,
    element: site.element,
    massDalton: site.massDalton,
    chargeE: site.chargeE,
    lennardJones: { sigmaAngstrom: site.sigmaAngstrom, epsilonKjMol: site.epsilonKjMol },
    identity,
  };
}

function contractPeriodicCellInstance() {
  return new PeriodicCell([
    { x: 20, y: 0, z: 0 },
    { x: 4, y: 19, z: 0 },
    { x: 2, y: 3, z: 18 },
  ]);
}

function contractPeriodicCell(cell: PeriodicCell): AqueousPeriodicCellV042 {
  const [aAngstrom, bAngstrom, cAngstrom] = cell.vectorsAngstrom;
  return {
    kind: 'triclinic-periodic-cell',
    originGauge: 'wrapped-fractional-plus-integer-image',
    boundary: { x: 'periodic', y: 'periodic', z: 'periodic' },
    aAngstrom: { ...aAngstrom },
    bAngstrom: { ...bAngstrom },
    cAngstrom: { ...cAngstrom },
    volumeAngstrom3: cell.volumeAngstrom3,
  };
}

function assertContractConstraintManifold(
  cell: PeriodicCell,
  topology: AqueousTopologyV042,
  atoms: ReadonlyArray<AqueousAtomStateV042>,
) {
  const topologyById = new Map(topology.atoms.map((atom) => [atom.id, atom]));
  const rigidAtoms: ReadonlyArray<RigidConstraintAtom> = atoms.map((atom) => ({
    ...atom,
    massDalton: topologyById.get(atom.id)!.massDalton,
  }));
  const options = {
    positionToleranceAngstrom: 1e-12,
    velocityDerivativeToleranceAngstrom2PerPicosecond: 1e-12,
    maximumIterations: 1,
    momentumToleranceDaltonAngstromPerPicosecond: 1e-12,
    centerOfMassPositionToleranceAngstrom: 1e-12,
  };
  const shake = applyShakePositionConstraints(cell, rigidAtoms, topology.constraints, options);
  const rattle = applyRattleVelocityConstraints(cell, rigidAtoms, topology.constraints, options);
  if (shake.iterations !== 0 || rattle.iterations !== 0) {
    throw new Error('aqueous contract fixture must begin on the exact SHAKE/RATTLE constraint manifold');
  }
}

function canonicalResidues(
  values: ReadonlyArray<AqueousResidueTopologyV042>,
  atomIds: ReadonlySet<string>,
) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 100_000) {
    throw new Error('aqueous topology residue count must be in [1, 100000]');
  }
  const residues = values.map((value) => {
    assertExactKeys(value, ['id', 'moleculeId', 'name', 'atomIds'], 'residue');
    assertToken(value.id, 'residue id');
    assertToken(value.moleculeId, `residue ${value.id} moleculeId`);
    assertToken(value.name, `residue ${value.id} name`);
    return { ...value, atomIds: canonicalMemberIds(value.atomIds, atomIds, `residue ${value.id}`) };
  }).sort(byId);
  assertUniqueIds(residues, 'residue');
  return residues;
}

function canonicalMolecules(
  values: ReadonlyArray<AqueousMoleculeTopologyV042>,
  atomIds: ReadonlySet<string>,
  residueIds: ReadonlySet<string>,
) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 100_000) {
    throw new Error('aqueous topology molecule count must be in [1, 100000]');
  }
  const molecules = values.map((value) => {
    assertExactKeys(value, ['id', 'kind', 'atomIds', 'residueIds'], 'molecule');
    assertToken(value.id, 'molecule id');
    if (value.kind !== 'rigid-tip3p-water' && value.kind !== 'monatomic-ion') {
      throw new Error(`molecule ${value.id} kind is invalid`);
    }
    return {
      ...value,
      atomIds: canonicalMemberIds(value.atomIds, atomIds, `molecule ${value.id}`),
      residueIds: canonicalMemberIds(value.residueIds, residueIds, `molecule ${value.id}`),
    };
  }).sort(byId);
  assertUniqueIds(molecules, 'molecule');
  return molecules;
}

function canonicalShortRange(settings: AqueousShortRangeNonbondedV042) {
  assertExactKeys(settings, [
    'method', 'mixingRule', 'cutoffAngstrom', 'switchingPolicy', 'energyShift',
    'dispersionCorrection', 'maximumPairWorkUnits',
  ], 'short-range nonbonded settings');
  if (settings?.method !== 'lennard-jones-12-6' || settings.mixingRule !== 'lorentz-berthelot'
    || settings.switchingPolicy !== 'none' || settings.energyShift !== false
    || settings.dispersionCorrection !== false) {
    throw new Error('aqueous short-range nonbonded semantics are invalid');
  }
  assertFiniteRange(settings.cutoffAngstrom, Number.MIN_VALUE, 1e6, 'short-range cutoffAngstrom');
  assertInteger(settings.maximumPairWorkUnits, 1, 1_000_000_000, 'short-range maximumPairWorkUnits');
}

function canonicalParameterReceipt(
  receipt: AqueousParameterReceiptV042,
  sourcePins: ReadonlyArray<AqueousSourcePinV042>,
) {
  if (digestValue(receipt) !== digestValue(AMBER14_TIP3P_PARAMETERS_V042)) {
    throw new Error('aqueous parameter receipt is invalid');
  }
  const expectedPin: AqueousSourcePinV042 = {
    id: 'openmm-tip3p-amber14',
    owner: receipt.source.owner,
    repository: receipt.source.repository,
    sourceCommit: receipt.source.sourceCommit,
    filePath: receipt.source.filePath,
    sizeBytes: receipt.source.sizeBytes,
    sha256: receipt.source.sha256,
    executionPerformed: false,
    licenseClearance: false,
  };
  if (sourcePins.length !== 1 || digestValue(sourcePins[0]) !== digestValue(expectedPin)) {
    throw new Error('aqueous topology requires exactly one source pin matching the full parameter receipt projection');
  }
}

function validateRigidTip3pClosedSets(
  atoms: ReadonlyArray<AqueousAtomTopologyV042>,
  molecules: ReadonlyArray<AqueousMoleculeTopologyV042>,
  residues: ReadonlyArray<AqueousResidueTopologyV042>,
  energeticBonds: ReadonlyArray<AqueousEnergeticBondV042>,
  constraints: ReadonlyArray<AqueousDistanceConstraintV042>,
  exceptions: ReadonlyArray<AqueousNonbondedExceptionV042>,
) {
  if (energeticBonds.length !== 0) {
    throw new Error('rigid TIP3P constraints cannot be double-counted as energetic bonds');
  }
  const waterMolecules = molecules.filter((molecule) => molecule.kind === 'rigid-tip3p-water');
  if (constraints.length !== waterMolecules.length * 3 || exceptions.length !== waterMolecules.length * 3) {
    throw new Error('rigid TIP3P topology requires closed 3-constraint and 3-exception sets per molecule');
  }
  const atomById = new Map(atoms.map((atom) => [atom.id, atom]));
  const residueById = new Map(residues.map((residue) => [residue.id, residue]));
  for (const molecule of molecules) {
    if (molecule.kind === 'monatomic-ion') {
      if (molecule.atomIds.length !== 1 || molecule.residueIds.length !== 1) {
        throw new Error(`monatomic ion ${molecule.id} must contain exactly one atom and one residue`);
      }
      const ion = atomById.get(molecule.atomIds[0])!;
      const expected = ion.element === 'Na'
        ? AMBER14_TIP3P_PARAMETERS_V042.sites.sodiumIon
        : ion.element === 'Cl' ? AMBER14_TIP3P_PARAMETERS_V042.sites.chlorideIon : null;
      if (!expected || ion.massDalton !== expected.massDalton || ion.chargeE !== expected.chargeE
        || ion.lennardJones.sigmaAngstrom !== expected.sigmaAngstrom
        || ion.lennardJones.epsilonKjMol !== expected.epsilonKjMol) {
        throw new Error(`monatomic ion ${molecule.id} parameters are not pinned`);
      }
      const ionResidue = residueById.get(molecule.residueIds[0])!;
      const expectedResidueName = ion.element === 'Na' ? 'NA' : 'CL';
      const expectedSiteName = ion.element === 'Na' ? 'Na' : 'Cl';
      if (ionResidue.name !== expectedResidueName || ion.identity.residueName !== expectedResidueName
        || ion.identity.siteName !== expectedSiteName || ion.identity.siteIndex !== 0) {
        throw new Error(`monatomic ion ${molecule.id} residue and site identity are not pinned`);
      }
      if (constraints.some((value) => value.atomAId === ion.id || value.atomBId === ion.id)
        || exceptions.some((value) => value.atomAId === ion.id || value.atomBId === ion.id)) {
        throw new Error(`monatomic ion ${molecule.id} cannot have intramolecular constraints or exceptions`);
      }
      continue;
    }
    if (molecule.atomIds.length !== 3 || molecule.residueIds.length !== 1) {
      throw new Error(`rigid TIP3P molecule ${molecule.id} must contain exactly 3 atoms and one residue`);
    }
    const waterResidue = residueById.get(molecule.residueIds[0])!;
    if (waterResidue.name !== 'HOH' || waterResidue.atomIds.length !== 3) {
      throw new Error(`rigid TIP3P molecule ${molecule.id} requires exactly one closed HOH residue`);
    }
    const moleculeAtoms = molecule.atomIds.map((id) => atomById.get(id)!);
    if (moleculeAtoms.filter((atom) => atom.element === 'O').length !== 1
      || moleculeAtoms.filter((atom) => atom.element === 'H').length !== 2) {
      throw new Error(`rigid TIP3P molecule ${molecule.id} must contain one O and two H atoms`);
    }
    const bySiteName = new Map(moleculeAtoms.map((atom) => [atom.identity.siteName, atom]));
    if (bySiteName.size !== 3 || !bySiteName.has('O') || !bySiteName.has('H1') || !bySiteName.has('H2')) {
      throw new Error(`rigid TIP3P molecule ${molecule.id} site names are not pinned`);
    }
    const oxygen = bySiteName.get('O')!;
    const expectedOxygen = AMBER14_TIP3P_PARAMETERS_V042.sites.waterOxygen;
    if (oxygen.element !== expectedOxygen.element
      || oxygen.massDalton !== expectedOxygen.massDalton
      || oxygen.chargeE !== expectedOxygen.chargeE
      || oxygen.lennardJones.sigmaAngstrom !== expectedOxygen.sigmaAngstrom
      || oxygen.lennardJones.epsilonKjMol !== expectedOxygen.epsilonKjMol
      || oxygen.identity.siteIndex !== 0) {
      throw new Error(`rigid TIP3P molecule ${molecule.id} oxygen parameters are not pinned`);
    }
    const expectedHydrogen = AMBER14_TIP3P_PARAMETERS_V042.sites.waterHydrogen;
    for (const [siteName, siteIndex] of [['H1', 1], ['H2', 2]] as const) {
      const atom = bySiteName.get(siteName)!;
      if (atom.element !== expectedHydrogen.element
        || atom.massDalton !== expectedHydrogen.massDalton
        || atom.chargeE !== expectedHydrogen.chargeE
        || atom.lennardJones.sigmaAngstrom !== expectedHydrogen.sigmaAngstrom
        || atom.lennardJones.epsilonKjMol !== expectedHydrogen.epsilonKjMol
        || atom.identity.siteIndex !== siteIndex) {
        throw new Error(`rigid TIP3P molecule ${molecule.id} hydrogen parameters are not pinned`);
      }
    }
    const memberIds = new Set(molecule.atomIds);
    const moleculeConstraints = constraints.filter((value) => memberIds.has(value.atomAId) && memberIds.has(value.atomBId));
    const moleculeExceptions = exceptions.filter((value) => memberIds.has(value.atomAId) && memberIds.has(value.atomBId));
    if (moleculeConstraints.length !== 3 || moleculeExceptions.length !== 3) {
      throw new Error(`rigid TIP3P molecule ${molecule.id} requires exactly 3 constraints and 3 exceptions`);
    }
    const constraintDistances = moleculeConstraints.map((value) => value.distanceAngstrom).sort((a, b) => a - b);
    if (constraintDistances[0] !== AMBER14_TIP3P_PARAMETERS_V042.rigidWaterGeometry.oxygenHydrogenDistanceAngstrom
      || constraintDistances[1] !== AMBER14_TIP3P_PARAMETERS_V042.rigidWaterGeometry.oxygenHydrogenDistanceAngstrom
      || constraintDistances[2] !== AMBER14_TIP3P_PARAMETERS_V042.rigidWaterGeometry.hydrogenHydrogenDistanceAngstrom) {
      throw new Error(`rigid TIP3P molecule ${molecule.id} constraint geometry is not pinned`);
    }
    for (const constraint of moleculeConstraints) {
      const atomA = atomById.get(constraint.atomAId)!;
      const atomB = atomById.get(constraint.atomBId)!;
      const target = atomA.element === 'H' && atomB.element === 'H'
        ? AMBER14_TIP3P_PARAMETERS_V042.rigidWaterGeometry.hydrogenHydrogenDistanceAngstrom
        : AMBER14_TIP3P_PARAMETERS_V042.rigidWaterGeometry.oxygenHydrogenDistanceAngstrom;
      if (constraint.distanceAngstrom !== target) {
        throw new Error(`rigid TIP3P molecule ${molecule.id} pair geometry is not pinned`);
      }
    }
    if (moleculeExceptions.some((value) => value.coulomb.mode !== 'exclude' || value.lennardJones.mode !== 'exclude')) {
      throw new Error(`rigid TIP3P molecule ${molecule.id} exceptions must exclude Coulomb and Lennard-Jones`);
    }
  }
}

function canonicalMemberIds(values: ReadonlyArray<string>, knownIds: ReadonlySet<string>, label: string) {
  if (!Array.isArray(values) || values.length < 1 || values.length > 100_000) {
    throw new Error(`${label} membership array is invalid`);
  }
  const result = [...values];
  for (const id of result) {
    assertToken(id, `${label} member id`);
    if (!knownIds.has(id)) throw new Error(`${label} references an unknown member`);
  }
  result.sort(compareAscii);
  if (new Set(result).size !== result.length) throw new Error(`${label} membership must be unique`);
  return result;
}

function validateIdentityMembership(
  atoms: ReadonlyArray<AqueousAtomTopologyV042>,
  molecules: ReadonlyArray<AqueousMoleculeTopologyV042>,
  residues: ReadonlyArray<AqueousResidueTopologyV042>,
) {
  const moleculeById = new Map(molecules.map((value) => [value.id, value]));
  const residueById = new Map(residues.map((value) => [value.id, value]));
  const siteNames = new Set<string>();
  const siteIndices = new Set<string>();
  const moleculeAtomOwnership = new Map<string, number>();
  const residueAtomOwnership = new Map<string, number>();
  const residueOwnership = new Map<string, number>();
  for (const molecule of molecules) {
    for (const atomId of molecule.atomIds) {
      moleculeAtomOwnership.set(atomId, (moleculeAtomOwnership.get(atomId) ?? 0) + 1);
    }
    for (const residueId of molecule.residueIds) {
      residueOwnership.set(residueId, (residueOwnership.get(residueId) ?? 0) + 1);
    }
  }
  for (const residue of residues) {
    for (const atomId of residue.atomIds) {
      residueAtomOwnership.set(atomId, (residueAtomOwnership.get(atomId) ?? 0) + 1);
    }
  }
  for (const atom of atoms) {
    const molecule = moleculeById.get(atom.identity.moleculeId);
    const residue = residueById.get(atom.identity.residueId);
    if (!molecule?.atomIds.includes(atom.id) || !residue?.atomIds.includes(atom.id)
      || residue.moleculeId !== molecule.id || residue.name !== atom.identity.residueName
      || !molecule.residueIds.includes(residue.id)) {
      throw new Error(`atom ${atom.id} identity does not match molecule/residue membership`);
    }
    if (moleculeAtomOwnership.get(atom.id) !== 1 || residueAtomOwnership.get(atom.id) !== 1) {
      throw new Error(`atom ${atom.id} molecule/residue membership is not a partition`);
    }
    const siteNameKey = `${molecule.id}\0${atom.identity.siteName}`;
    const siteIndexKey = `${molecule.id}\0${atom.identity.siteIndex}`;
    if (siteNames.has(siteNameKey) || siteIndices.has(siteIndexKey)) {
      throw new Error(`atom ${atom.id} site identity is not unique within its molecule`);
    }
    siteNames.add(siteNameKey);
    siteIndices.add(siteIndexKey);
  }
  for (const molecule of molecules) {
    for (const residueId of molecule.residueIds) {
      if (residueById.get(residueId)?.moleculeId !== molecule.id) {
        throw new Error(`molecule ${molecule.id} has inconsistent residue membership`);
      }
    }
  }
  for (const residue of residues) {
    if (residueOwnership.get(residue.id) !== 1) {
      throw new Error(`residue ${residue.id} molecule membership is not a partition`);
    }
  }
}

function canonicalAtom(atom: AqueousAtomTopologyV042) {
  assertExactKeys(atom, ['id', 'element', 'massDalton', 'chargeE', 'lennardJones', 'identity'], 'atom');
  assertExactKeys(atom.lennardJones, ['sigmaAngstrom', 'epsilonKjMol'], `atom ${atom.id} Lennard-Jones`);
  assertExactKeys(
    atom.identity,
    ['moleculeId', 'residueId', 'residueName', 'siteName', 'siteIndex'],
    `atom ${atom.id} identity`,
  );
  assertToken(atom.id, 'atom id');
  if (!ELEMENT.test(atom.element)) throw new Error(`atom ${atom.id} element is invalid`);
  assertFiniteRange(atom.massDalton, Number.MIN_VALUE, 1e9, `atom ${atom.id} massDalton`);
  assertFiniteRange(atom.chargeE, -1e6, 1e6, `atom ${atom.id} chargeE`);
  assertFiniteRange(atom.lennardJones?.sigmaAngstrom, Number.MIN_VALUE, 1e6, `atom ${atom.id} LJ sigma`);
  assertFiniteRange(atom.lennardJones?.epsilonKjMol, 0, 1e9, `atom ${atom.id} LJ epsilon`);
  for (const [label, value] of Object.entries(atom.identity ?? {})) {
    if (label === 'siteIndex') continue;
    assertToken(String(value), `atom ${atom.id} identity ${label}`);
  }
  assertInteger(atom.identity?.siteIndex, 0, 1_000_000, `atom ${atom.id} siteIndex`);
  return structuredClone(atom);
}

function canonicalEnergeticBond(bond: AqueousEnergeticBondV042) {
  assertExactKeys(bond, ['id', 'atomAId', 'atomBId', 'potential'], 'energetic bond');
  assertExactKeys(
    bond.potential,
    ['kind', 'equilibriumDistanceAngstrom', 'forceConstantKjMolAngstrom2'],
    `energetic bond ${bond.id} potential`,
  );
  if (bond.potential?.kind !== 'harmonic') throw new Error(`energetic bond ${bond.id} potential is invalid`);
  assertFiniteRange(bond.potential.equilibriumDistanceAngstrom, Number.MIN_VALUE, 1e6, `bond ${bond.id} distance`);
  assertFiniteRange(bond.potential.forceConstantKjMolAngstrom2, Number.MIN_VALUE, 1e12, `bond ${bond.id} force constant`);
  return structuredClone(bond);
}

function canonicalConstraint(constraint: AqueousDistanceConstraintV042) {
  assertExactKeys(constraint, ['id', 'atomAId', 'atomBId', 'distanceAngstrom'], 'constraint');
  assertFiniteRange(constraint.distanceAngstrom, Number.MIN_VALUE, 1e6, `constraint ${constraint.id} distance`);
  return structuredClone(constraint);
}

function canonicalException(exception: AqueousNonbondedExceptionV042) {
  assertExactKeys(exception, ['id', 'atomAId', 'atomBId', 'coulomb', 'lennardJones'], 'nonbonded exception');
  canonicalExceptionRule(exception.coulomb, `${exception.id} Coulomb`);
  canonicalExceptionRule(exception.lennardJones, `${exception.id} Lennard-Jones`);
  return structuredClone(exception);
}

function canonicalExceptionRule(rule: AqueousExceptionRuleV042, label: string) {
  if (rule?.mode === 'exclude') {
    if ('scale' in rule) throw new Error(`${label} exclude rule cannot carry scale`);
    assertExactKeys(rule, ['mode'], label);
  } else if (rule?.mode === 'scale') {
    assertExactKeys(rule, ['mode', 'scale'], label);
    assertFiniteRange(rule.scale, 0, 1, `${label} scale`);
  } else {
    throw new Error(`${label} rule is invalid`);
  }
}

function canonicalPairs<Value extends { id: string; atomAId: string; atomBId: string }>(
  values: ReadonlyArray<Value>,
  label: string,
  atomIds: ReadonlySet<string>,
  canonicalize: (value: Value) => Value,
) {
  if (!Array.isArray(values) || values.length > 1_000_000) throw new Error(`${label} array is invalid`);
  const pairs = new Set<string>();
  const result = values.map((value) => {
    assertToken(value.id, `${label} id`);
    if (!atomIds.has(value.atomAId) || !atomIds.has(value.atomBId) || value.atomAId === value.atomBId) {
      throw new Error(`${label} ${value.id} references invalid atoms`);
    }
    const key = [value.atomAId, value.atomBId].sort(compareAscii).join('\0');
    if (pairs.has(key)) throw new Error(`${label} contains duplicate atom pair`);
    pairs.add(key);
    const canonical = canonicalize(value);
    return {
      ...canonical,
      atomAId: compareAscii(canonical.atomAId, canonical.atomBId) <= 0 ? canonical.atomAId : canonical.atomBId,
      atomBId: compareAscii(canonical.atomAId, canonical.atomBId) <= 0 ? canonical.atomBId : canonical.atomAId,
    };
  }).sort(byId);
  assertUniqueIds(result, label);
  return result;
}

function canonicalEwald(settings: AqueousDirectEwaldSettingsV042) {
  assertExactKeys(settings, [
    'method', 'alphaInverseAngstrom', 'realSpaceCutoffAngstrom', 'reciprocalCutoffInverseAngstrom',
    'relativePermittivity', 'neutralityToleranceE', 'electrostaticConstantKjMolAngstromE2',
    'maximumRealSpaceWorkUnits', 'maximumReciprocalSpaceWorkUnits',
  ], 'aqueous Ewald settings');
  if (settings?.method !== 'direct-ewald-explicit-real-and-reciprocal-sums'
    || settings.relativePermittivity !== 1) throw new Error('aqueous Ewald settings are invalid');
  canonicalizeDirectEwaldOptionsV042({
    alphaInverseAngstrom: settings.alphaInverseAngstrom,
    realSpaceCutoffAngstrom: settings.realSpaceCutoffAngstrom,
    reciprocalCutoffInverseAngstrom: settings.reciprocalCutoffInverseAngstrom,
    relativePermittivity: settings.relativePermittivity,
    neutralityToleranceE: settings.neutralityToleranceE,
    electrostaticConstantKjMolAngstromE2: settings.electrostaticConstantKjMolAngstromE2,
    maximumRealSpaceCandidates: settings.maximumRealSpaceWorkUnits,
    maximumReciprocalCandidates: settings.maximumReciprocalSpaceWorkUnits,
  });
  if (settings.electrostaticConstantKjMolAngstromE2 !== 1389.35458) {
    throw new Error('aqueous Ewald electrostatic constant must equal the locked explicit-charge parameter');
  }
}

function canonicalSourcePin(pin: AqueousSourcePinV042) {
  assertExactKeys(pin, [
    'id', 'owner', 'repository', 'sourceCommit', 'filePath', 'sizeBytes', 'sha256',
    'executionPerformed', 'licenseClearance',
  ], 'source pin');
  assertToken(pin.id, 'source pin id');
  if (!DIGEST.test(pin.sha256) || !/^[0-9a-f]{40}$/.test(pin.sourceCommit)
    || !pin.repository.startsWith('https://') || !pin.filePath || !Number.isSafeInteger(pin.sizeBytes)
    || pin.sizeBytes < 1 || pin.executionPerformed !== false || pin.licenseClearance !== false) {
    throw new Error(`source pin ${pin.id} is invalid`);
  }
  return structuredClone(pin);
}

function actionBudget(requestedWorkUnits: number): ActionBudgetV042 {
  if (!Number.isSafeInteger(requestedWorkUnits) || requestedWorkUnits < 1
    || requestedWorkUnits > AQUEOUS_ACTION_BUDGET.maximumWorkUnits) {
    throw new Error('aqueous action exceeds the fail-closed work budget');
  }
  return {
    requestedWorkUnits,
    maximumWorkUnits: AQUEOUS_ACTION_BUDGET.maximumWorkUnits,
    withinBudget: true,
  };
}

function byId<Thing extends { id: string }>(left: Thing, right: Thing) { return compareAscii(left.id, right.id); }
function compareAscii(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }
function assertUniqueIds(values: ReadonlyArray<{ id: string }>, label: string) {
  if (new Set(values.map((value) => value.id)).size !== values.length) throw new Error(`${label} IDs must be unique`);
}
function assertToken(value: unknown, label: string) {
  if (typeof value !== 'string' || !STABLE_TOKEN.test(value)) throw new Error(`${label} must be a stable ASCII token`);
}
function assertInteger(value: unknown, minimum: number, maximum: number, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${label} must be a safe integer in [${minimum}, ${maximum}]`);
  }
}
function assertFiniteRange(value: unknown, minimum: number, maximum: number, label: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${label} must be finite and in [${minimum}, ${maximum}]`);
  }
}
function assertExactKeys(value: unknown, expected: ReadonlyArray<string>, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain record`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) {
    throw new Error(`${label} must contain exactly the declared string keys`);
  }
  const actual = (ownKeys as string[]).sort(compareAscii);
  const wanted = [...expected].sort(compareAscii);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} must contain exactly the declared keys`);
  }
}
function zero(): Vector3 { return { x: 0, y: 0, z: 0 }; }
function add(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}
function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
