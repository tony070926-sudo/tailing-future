import { describe, expect, it } from 'vitest';
import {
  AQUEOUS_ACTION_BUDGET,
  canonicalizeAqueousTopology,
  createAqueousAction,
  createAqueousContractFixture,
  type AqueousAtomTopologyV042,
  type AqueousMoleculeTopologyV042,
  type AqueousNonbondedExceptionV042,
  type AqueousResidueTopologyV042,
  type AqueousSourcePinV042,
  type AqueousTopologyV042,
} from './aqueous-topology.ts';
import { PeriodicCell } from './periodic-cell.ts';

type MutableTopologyInput = {
  -readonly [Key in keyof Omit<AqueousTopologyV042, 'topologyDigest'>]: Omit<AqueousTopologyV042, 'topologyDigest'>[Key];
} & {
  atoms: AqueousAtomTopologyV042[];
  molecules: AqueousMoleculeTopologyV042[];
  residues: AqueousResidueTopologyV042[];
  constraints: Array<AqueousTopologyV042['constraints'][number]>;
  energeticBonds: Array<AqueousTopologyV042['energeticBonds'][number]>;
  nonbondedExceptions: AqueousNonbondedExceptionV042[];
  sourcePins: AqueousSourcePinV042[];
};

function mutableTopology(topology: AqueousTopologyV042): MutableTopologyInput {
  const { topologyDigest, ...copy } = structuredClone(topology);
  void topologyDigest;
  return copy as MutableTopologyInput;
}

function expectRecursivelyFrozen(value: unknown) {
  if (!value || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value as Record<string, unknown>)) expectRecursivelyFrozen(child);
}

describe('aqueous v0.4.2 contract topology', () => {
  it('is deterministic, deeply frozen and canonical under input array permutations', () => {
    const first = createAqueousContractFixture();
    const second = createAqueousContractFixture();
    expect(first).toEqual(second);
    expect(first.topology.topologyDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.state.stateDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.observation.observationDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expectRecursivelyFrozen(first);

    const permuted = mutableTopology(first.topology);
    permuted.atoms = [...permuted.atoms].reverse();
    permuted.constraints = [...permuted.constraints].reverse();
    permuted.nonbondedExceptions = [...permuted.nonbondedExceptions].reverse();
    permuted.sourcePins = [...permuted.sourcePins].reverse();
    permuted.molecules = permuted.molecules.map((molecule) => ({
      ...molecule,
      atomIds: [...molecule.atomIds].reverse(),
      residueIds: [...molecule.residueIds].reverse(),
    }));
    permuted.residues = permuted.residues.map((residue) => ({
      ...residue,
      atomIds: [...residue.atomIds].reverse(),
    }));
    expect(canonicalizeAqueousTopology(permuted)).toEqual(first.topology);
  });

  it('keeps constraint topology independent from energetic bonds and permits zero LJ epsilon', () => {
    const { topology, state, observation } = createAqueousContractFixture();
    expect(topology.energeticBonds).toEqual([]);
    expect(topology.constraints.map((constraint) => constraint.distanceAngstrom)).toEqual([
      1.5139006545247014,
      0.9572,
      0.9572,
    ]);
    expect(topology.atoms.filter((atom) => atom.element === 'H').every(
      (atom) => atom.lennardJones.epsilonKjMol === 0,
    )).toBe(true);
    expect(topology.nonbondedExceptions).toHaveLength(3);
    expect(topology.nonbondedExceptions.every(
      (exception) => exception.coulomb.mode === 'exclude' && exception.lennardJones.mode === 'exclude',
    )).toBe(true);
    expect(state.periodicCell.volumeAngstrom3).toBe(6840);
    expect(observation.periodicCell).toEqual(state.periodicCell);
    expect(observation.mechanicalObservables).toEqual({
      pressureBar: null,
      totalStressKjMolAngstrom3: null,
      boundary: 'unavailable-reciprocal-virial-not-implemented',
    });
    expect(state).toMatchObject({ revision: 0, step: 0, timePicoseconds: 0, parentStateId: null, lastAction: null });
    expect(topology.parameterReceipt.familyId).toBe('openmm-amber14-tip3p-joung-cheatham-explicit-solvent');
    expect(topology.shortRangeNonbonded).toMatchObject({
      mixingRule: 'lorentz-berthelot', switchingPolicy: 'none', energyShift: false, dispersionCorrection: false,
    });
    const cell = new PeriodicCell([
      state.periodicCell.aAngstrom,
      state.periodicCell.bAngstrom,
      state.periodicCell.cAngstrom,
    ]);
    const stateById = new Map(state.atoms.map((atom) => [atom.id, atom]));
    for (const constraint of topology.constraints) {
      const atomA = stateById.get(constraint.atomAId)!;
      const atomB = stateById.get(constraint.atomBId)!;
      expect(cell.minimumImageFromFractional(
        atomA.position.wrappedFractional,
        atomB.position.wrappedFractional,
      ).distanceAngstrom).toBeCloseTo(constraint.distanceAngstrom, 12);
    }
    expect(stateById.get('water-h1')?.position.image.x).not.toBe(0);
  });

  it('canonicalizes pair endpoint orientation into the topology digest', () => {
    const { topology } = createAqueousContractFixture();
    const swapped = mutableTopology(topology);
    swapped.constraints = swapped.constraints.map((value) => ({
      ...value, atomAId: value.atomBId, atomBId: value.atomAId,
    }));
    swapped.nonbondedExceptions = swapped.nonbondedExceptions.map((value) => ({
      ...value, atomAId: value.atomBId, atomBId: value.atomAId,
    }));
    expect(canonicalizeAqueousTopology(swapped)).toEqual(topology);
  });

  it('hard-gates neutrality, exact TIP3P/ion families, partitions and work settings', () => {
    const { topology } = createAqueousContractFixture();
    const cases: Array<[RegExp, (value: MutableTopologyInput) => void]> = [
      [/must be neutral/, (value) => {
        const sodiumIndex = value.atoms.findIndex((atom) => atom.element === 'Na');
        value.atoms[sodiumIndex] = { ...value.atoms[sodiumIndex], chargeE: 0.9 };
      }],
      [/hydrogen parameters are not pinned/, (value) => {
        const hydrogenIndex = value.atoms.findIndex((atom) => atom.identity.siteName === 'H1');
        value.atoms[hydrogenIndex] = { ...value.atoms[hydrogenIndex], lennardJones: { sigmaAngstrom: 1, epsilonKjMol: 0 } };
      }],
      [/closed 3-constraint/, (value) => { value.constraints = value.constraints.slice(1); }],
      [/double-counted/, (value) => {
        value.energeticBonds = [{
          id: 'forbidden-oh-bond', atomAId: 'water-o', atomBId: 'water-h1',
          potential: { kind: 'harmonic', equilibriumDistanceAngstrom: 0.9572, forceConstantKjMolAngstrom2: 1000 },
        }];
      }],
      [/not a partition/, (value) => {
        const chlorideIndex = value.molecules.findIndex((molecule) => molecule.id === 'chloride');
        value.molecules[chlorideIndex] = {
          ...value.molecules[chlorideIndex], atomIds: ['chloride-cl', 'sodium-na'],
        };
      }],
      [/short-range nonbonded semantics/, (value) => {
        value.shortRangeNonbonded = { ...value.shortRangeNonbonded, mixingRule: 'geometric' as never };
      }],
      [/parameter receipt/, (value) => {
        value.parameterReceipt = { ...value.parameterReceipt, familyId: 'mixed-unpinned-family' as never };
      }],
      [/safe integer/, (value) => {
        value.electrostatics = { ...value.electrostatics, maximumRealSpaceWorkUnits: 1.5 };
      }],
      [/alphaInverseAngstrom/, (value) => {
        value.electrostatics = { ...value.electrostatics, alphaInverseAngstrom: 1_000 };
      }],
      [/neutralityToleranceE/, (value) => {
        value.electrostatics = { ...value.electrostatics, neutralityToleranceE: 1e-4 };
      }],
      [/maximumRealSpaceCandidates/, (value) => {
        value.electrostatics = { ...value.electrostatics, maximumRealSpaceWorkUnits: 1_000_000_000 };
      }],
      [/electrostatic constant/, (value) => {
        value.electrostatics = { ...value.electrostatics, electrostaticConstantKjMolAngstromE2: 1 };
      }],
      [/exactly the declared keys/, (value) => {
        value.electrostatics = { ...value.electrostatics, hidden: 1 } as never;
      }],
      [/exactly one source pin/, (value) => {
        value.sourcePins[0] = { ...value.sourcePins[0], owner: 'ForgedOwner' };
      }],
      [/exactly one source pin/, (value) => {
        value.sourcePins.push({ ...value.sourcePins[0], id: 'extra-source-pin' });
      }],
      [/one residue/, (value) => {
        const moleculeIndex = value.molecules.findIndex((molecule) => molecule.id === 'water-000001');
        const residueIndex = value.residues.findIndex((residue) => residue.id === 'residue-000001');
        const hydrogenIndex = value.atoms.findIndex((atom) => atom.id === 'water-h2');
        value.molecules[moleculeIndex] = {
          ...value.molecules[moleculeIndex],
          residueIds: ['residue-000001', 'residue-water-shadow'],
        };
        value.residues[residueIndex] = {
          ...value.residues[residueIndex], atomIds: ['water-o', 'water-h1'],
        };
        value.residues.push({
          id: 'residue-water-shadow', moleculeId: 'water-000001', name: 'HOH', atomIds: ['water-h2'],
        });
        value.atoms[hydrogenIndex] = {
          ...value.atoms[hydrogenIndex],
          identity: { ...value.atoms[hydrogenIndex].identity, residueId: 'residue-water-shadow' },
        };
      }],
      [/parameters are not pinned/, (value) => {
        value.atoms = value.atoms.map((atom) => atom.identity.moleculeId === 'water-000001'
          ? { ...atom, identity: { ...atom.identity, siteIndex: atom.identity.siteIndex + 10 } }
          : atom);
      }],
    ];
    for (const [message, mutate] of cases) {
      const candidate = mutableTopology(topology);
      mutate(candidate);
      expect(() => canonicalizeAqueousTopology(candidate)).toThrow(message);
    }

    const oversized = mutableTopology(topology);
    oversized.atoms = Array.from({ length: 513 }, (_, index) => ({
      ...oversized.atoms[0], id: `oversized-${index}`,
    }));
    expect(() => canonicalizeAqueousTopology(oversized)).toThrow(/\[2, 512\]/);
  });

  it('pins explicit molecule, residue and site identity membership', () => {
    const { topology } = createAqueousContractFixture();
    expect(topology.molecules).toEqual([{
      id: 'chloride', kind: 'monatomic-ion', residueIds: ['residue-chloride'], atomIds: ['chloride-cl'],
    }, {
      id: 'sodium', kind: 'monatomic-ion', residueIds: ['residue-sodium'], atomIds: ['sodium-na'],
    }, {
      id: 'water-000001',
      kind: 'rigid-tip3p-water',
      residueIds: ['residue-000001'],
      atomIds: ['water-h1', 'water-h2', 'water-o'],
    }]);
    expect(topology.residues.find((residue) => residue.id === 'residue-000001')?.atomIds)
      .toEqual(['water-h1', 'water-h2', 'water-o']);

    const badForeignKey = mutableTopology(topology);
    badForeignKey.atoms[0] = {
      ...badForeignKey.atoms[0],
      identity: { ...badForeignKey.atoms[0].identity, residueId: 'missing-residue' },
    };
    expect(() => canonicalizeAqueousTopology(badForeignKey)).toThrow(/identity/);

    const duplicateMember = mutableTopology(topology);
    duplicateMember.residues[0] = {
      ...duplicateMember.residues[0],
      atomIds: [...duplicateMember.residues[0].atomIds, duplicateMember.residues[0].atomIds[0]],
    };
    expect(() => canonicalizeAqueousTopology(duplicateMember)).toThrow(/membership must be unique/);
  });

  it('constructs all five typed actions with a fail-closed work budget', () => {
    const { actions } = createAqueousContractFixture();
    expect(actions.map((action) => action.kind)).toEqual([
      'advance', 'observe', 'checkpoint', 'restore', 'branch',
    ]);
    expect(actions.every((action) => action.kind === action.parameters.kind)).toBe(true);
    expect(actions.every((action) => action.parameters.budget.withinBudget)).toBe(true);

    const lineage = { parentStateId: 'state-a', resultingStateId: 'state-b', appliedAtStep: 1 };
    expect(() => createAqueousAction({
      kind: 'advance',
      substeps: AQUEOUS_ACTION_BUDGET.maximumSubsteps + 1,
    }, lineage)).toThrow(/substeps/);
    expect(() => createAqueousAction({
      kind: 'advance',
      substeps: 1,
      // Runtime force/constraint consumption is deliberately not caller-authoritative.
      forceEvaluations: 1,
    } as never, lineage)).toThrow(/exactly the declared keys/);
    expect(() => createAqueousAction({ kind: 'invalid' } as never, lineage)).toThrow(/unsupported/);

    const nonEnumerable = { kind: 'advance', substeps: 1 };
    Object.defineProperty(nonEnumerable, 'timeStepPicoseconds', { value: 0.002, enumerable: false });
    expect(() => createAqueousAction(nonEnumerable as never, lineage)).toThrow(/declared keys/);
    const symbolic = { kind: 'advance', substeps: 1 } as Record<PropertyKey, unknown>;
    symbolic[Symbol('timeStepPicoseconds')] = 0.002;
    expect(() => createAqueousAction(symbolic as never, lineage)).toThrow(/declared string keys/);
    const inherited = Object.assign(Object.create({ timeStepPicoseconds: 0.002 }), {
      kind: 'advance', substeps: 1,
    });
    expect(() => createAqueousAction(inherited as never, lineage)).toThrow(/plain record/);
  });

  it('rejects the v0.4.1 envelope and a negative mutation corpus', () => {
    const { topology } = createAqueousContractFixture();
    const mutations: Array<[RegExp, (value: MutableTopologyInput) => void]> = [
      [/exact schema version/, (value) => { value.schemaVersion = 'tf.aqueous-topology/0.4.1' as never; }],
      [/LJ epsilon/, (value) => { value.atoms[0] = { ...value.atoms[0], lennardJones: { ...value.atoms[0].lennardJones, epsilonKjMol: -1 } }; }],
      [/duplicate atom pair/, (value) => { value.nonbondedExceptions[1] = { ...value.nonbondedExceptions[1], atomAId: value.nonbondedExceptions[0].atomAId, atomBId: value.nonbondedExceptions[0].atomBId }; }],
      [/exclude rule cannot carry scale/, (value) => { value.nonbondedExceptions[0] = { ...value.nonbondedExceptions[0], coulomb: { mode: 'exclude', scale: 0.5 } as never }; }],
      [/invalid atoms/, (value) => { value.constraints[0] = { ...value.constraints[0], atomAId: 'missing-atom' }; }],
      [/Ewald settings/, (value) => { value.electrostatics = { ...value.electrostatics, relativePermittivity: 2 as never }; }],
      [/claim boundaries/, (value) => { value.claimBoundaries = { ...value.claimBoundaries, naclWaterTrajectory: true as never }; }],
      [/source pin/, (value) => { value.sourcePins[0] = { ...value.sourcePins[0], sha256: 'sha256:forged' }; }],
    ];
    for (const [message, mutate] of mutations) {
      const candidate = mutableTopology(topology);
      mutate(candidate);
      expect(() => canonicalizeAqueousTopology(candidate)).toThrow(message);
    }
  });
});
