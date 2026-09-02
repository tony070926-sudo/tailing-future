import { describe, expect, it } from 'vitest';
import type { Vector3 } from '../molecular/molecular-interactions.ts';
import { DeterministicVerletNeighborList, PeriodicCell } from './periodic-cell.ts';
import {
  canonicalizePeriodicTopology,
  evaluatePeriodicAtomisticForces,
  type PeriodicAtomStateV041,
  type PeriodicTopologyV041,
} from './periodic-atomistic-kernel.ts';

const CELL_VECTORS = [
  { x: 12, y: 0, z: 0 },
  { x: 2.1, y: 11, z: 0 },
  { x: 1.3, y: 1.7, z: 10.5 },
] as const;

const BASE_TOPOLOGY: PeriodicTopologyV041 = {
  atoms: [
    { id: 'b', label: 'B', element: 'Ar', atomType: 'Ar', massDalton: 39.948, chargeE: 0 },
    { id: 'a', label: 'A', element: 'Ar', atomType: 'Ar', massDalton: 39.948, chargeE: 0 },
    { id: 'c', label: 'C', element: 'Ar', atomType: 'Ar', massDalton: 39.948, chargeE: 0 },
  ],
  pairRules: [{
    id: 'ar-ar',
    atomTypes: ['Ar', 'Ar'],
    cutoffAngstrom: 4.5,
    terms: [{ kind: 'lennard-jones-12-6', epsilonKjMol: 0.997, sigmaAngstrom: 3.405 }],
  }],
  bonds: [],
  excludeBondedNonbonded: true,
};

describe('periodic atomistic force kernel', () => {
  it('canonicalizes topology and applies pair forces with exact Newton antisymmetry', () => {
    const cell = new PeriodicCell(CELL_VECTORS);
    const topology = canonicalizePeriodicTopology(BASE_TOPOLOGY);
    expect(topology.atoms.map((atom) => atom.id)).toEqual(['a', 'b', 'c']);
    const states = [
      state(cell, 'a', { x: 0.1, y: 0.2, z: 0.3 }),
      state(cell, 'b', { x: 0.4, y: 0.2, z: 0.3 }),
      state(cell, 'c', { x: 0.75, y: 0.75, z: 0.75 }),
    ];
    const evaluation = evaluate(topology, states, cell);
    const totalForce = Object.values(evaluation.forceByAtomIdKjMolAngstrom).reduce(add, { x: 0, y: 0, z: 0 });
    expectMagnitude(totalForce, 1e-12);
    expect(evaluation.internalForceResidualKjMolAngstrom).toBeLessThan(1e-12);
    expect(evaluation.pairInteractions).toHaveLength(1);
    const pair = evaluation.pairInteractions[0];
    expectVectorClose(evaluation.forceByAtomIdKjMolAngstrom.a, negate(pair.forceOnBKjMolAngstrom), 13);
    expectVectorClose(evaluation.forceByAtomIdKjMolAngstrom.b, pair.forceOnBKjMolAngstrom, 13);
  });

  it('matches a Cartesian finite-difference oracle through triclinic MIC and force shifting', () => {
    const cell = new PeriodicCell(CELL_VECTORS);
    const topology = canonicalizePeriodicTopology(BASE_TOPOLOGY);
    const initial = [
      state(cell, 'a', { x: 0.11, y: 0.22, z: 0.33 }),
      state(cell, 'b', { x: 0.39, y: 0.22, z: 0.33 }),
      state(cell, 'c', { x: 0.8, y: 0.8, z: 0.8 }),
    ];
    const analytical = evaluate(topology, initial, cell).forceByAtomIdKjMolAngstrom.b.x;
    const delta = 1e-6;
    const plus = perturbCartesian(cell, initial, 'b', { x: delta, y: 0, z: 0 });
    const minus = perturbCartesian(cell, initial, 'b', { x: -delta, y: 0, z: 0 });
    const numerical = -(evaluate(topology, plus, cell).potentialEnergyKjMol - evaluate(topology, minus, cell).potentialEnergyKjMol) / (2 * delta);
    expect(relativeError(analytical, numerical)).toBeLessThan(2e-8);
  });

  it('is invariant to integer lattice translations while retaining unwrapped images', () => {
    const cell = new PeriodicCell(CELL_VECTORS);
    const topology = canonicalizePeriodicTopology(BASE_TOPOLOGY);
    const states = [
      state(cell, 'a', { x: 0.98, y: 0.2, z: 0.3 }),
      state(cell, 'b', { x: 1.07, y: 0.2, z: 0.3 }),
      state(cell, 'c', { x: 0.55, y: 0.7, z: 0.8 }),
    ];
    const translated = states.map((atom, index) => index === 1
      ? { ...atom, image: { x: atom.image.x + 7, y: atom.image.y - 3, z: atom.image.z + 2 } }
      : atom);
    const base = evaluate(topology, states, cell);
    const shifted = evaluate(topology, translated, cell);
    expect(shifted.potentialEnergyKjMol).toBe(base.potentialEnergyKjMol);
    expect(shifted.forceByAtomIdKjMolAngstrom).toEqual(base.forceByAtomIdKjMolAngstrom);
    expect(shifted.virialKjMol).toEqual(base.virialKjMol);
    expect(shifted.pairInteractions).toEqual(base.pairInteractions);
  });

  it('uses an explicit image shift for a bonded pair spanning a periodic face', () => {
    const cell = new PeriodicCell([
      { x: 10, y: 0, z: 0 },
      { x: 0, y: 10, z: 0 },
      { x: 0, y: 0, z: 10 },
    ]);
    const topology = canonicalizePeriodicTopology({
      atoms: [
        { id: 'a', label: 'A', element: 'X', atomType: 'X', massDalton: 10, chargeE: 0 },
        { id: 'b', label: 'B', element: 'X', atomType: 'X', massDalton: 10, chargeE: 0 },
      ],
      pairRules: [{
        id: 'x-x', atomTypes: ['X', 'X'], cutoffAngstrom: 4,
        terms: [{ kind: 'morse', wellDepthKjMol: 1, widthInverseAngstrom: 1, equilibriumDistanceAngstrom: 1, energyZero: 'minimum' }],
      }],
      bonds: [{
        id: 'a-b', atomAId: 'a', atomBId: 'b', imageShiftForB: { x: 1, y: 0, z: 0 },
        potential: { kind: 'harmonic-bond', forceConstantKjMolAngstrom2: 500, equilibriumDistanceAngstrom: 1 },
      }],
      excludeBondedNonbonded: true,
    });
    const states = [state(cell, 'a', { x: 0.95, y: 0.5, z: 0.5 }), state(cell, 'b', { x: 0.05, y: 0.5, z: 0.5 })];
    const evaluation = evaluate(topology, states, cell);
    expect(evaluation.pairInteractions).toHaveLength(1);
    expect(evaluation.pairInteractions[0].role).toBe('bonded');
    expect(evaluation.pairInteractions[0].distanceAngstrom).toBeCloseTo(1, 12);
    expectMagnitude(evaluation.pairInteractions[0].forceOnBKjMolAngstrom, 1e-10);
  });

  it('half-allocates pair virial without changing the exact system virial', () => {
    const cell = new PeriodicCell(CELL_VECTORS);
    const topology = canonicalizePeriodicTopology(BASE_TOPOLOGY);
    const states = [
      state(cell, 'a', { x: 0.1, y: 0.2, z: 0.3 }),
      state(cell, 'b', { x: 0.4, y: 0.2, z: 0.3 }),
      state(cell, 'c', { x: 0.8, y: 0.8, z: 0.8 }),
    ];
    const evaluation = evaluate(topology, states, cell);
    const allocated = Object.values(evaluation.perAtomVirialKjMol).reduce(addTensor, zeroTensor());
    expect(allocated).toEqual(evaluation.virialKjMol);
  });

  it('rejects invalid identities, rules and state/topology mismatches', () => {
    expect(() => canonicalizePeriodicTopology({ ...BASE_TOPOLOGY, atoms: [BASE_TOPOLOGY.atoms[0], BASE_TOPOLOGY.atoms[0]] })).toThrow('unique');
    expect(() => canonicalizePeriodicTopology({ ...BASE_TOPOLOGY, pairRules: [] })).toThrow('at least one');
    const cell = new PeriodicCell(CELL_VECTORS);
    const topology = canonicalizePeriodicTopology(BASE_TOPOLOGY);
    expect(() => evaluate(topology, [state(cell, 'a', { x: 0.1, y: 0.1, z: 0.1 })], cell)).toThrow('count');

    const mixed = {
      ...BASE_TOPOLOGY,
      atoms: [
        BASE_TOPOLOGY.atoms[0],
        { ...BASE_TOPOLOGY.atoms[1], atomType: 'Xe' },
        BASE_TOPOLOGY.atoms[2],
      ],
    };
    expect(() => canonicalizePeriodicTopology(mixed)).toThrow('missing explicit pair rule');
    const invalidPotential = structuredClone(BASE_TOPOLOGY) as unknown as PeriodicTopologyV041;
    (invalidPotential.pairRules[0].terms[0] as { epsilonKjMol: number }).epsilonKjMol = -1;
    expect(() => canonicalizePeriodicTopology(invalidPotential)).toThrow('positive');
    expect(() => canonicalizePeriodicTopology({
      ...BASE_TOPOLOGY,
      atoms: BASE_TOPOLOGY.atoms.map((atom, index) => index === 0 ? { ...atom, atomType: 'é' } : atom),
    })).toThrow('ASCII stable tokens');
  });

  it('rejects a neighbor list bound to the wrong cell or a smaller cutoff', () => {
    const cell = new PeriodicCell(CELL_VECTORS);
    const otherCell = new PeriodicCell(CELL_VECTORS);
    const topology = canonicalizePeriodicTopology(BASE_TOPOLOGY);
    const states = [
      state(cell, 'a', { x: 0.1, y: 0.2, z: 0.3 }),
      state(cell, 'b', { x: 0.4, y: 0.2, z: 0.3 }),
      state(cell, 'c', { x: 0.75, y: 0.75, z: 0.75 }),
    ];
    expect(() => evaluatePeriodicAtomisticForces(
      cell,
      topology,
      states,
      new DeterministicVerletNeighborList(otherCell, 4.5, 0.3),
    )).toThrow('different periodic cell');
    expect(() => evaluatePeriodicAtomisticForces(
      cell,
      topology,
      states,
      new DeterministicVerletNeighborList(cell, 4, 0.3),
    )).toThrow('smaller');
  });

  it('cannot bypass validation with a raw duplicate topology or an incomplete velocity object', () => {
    const cell = new PeriodicCell(CELL_VECTORS);
    const rawDuplicate = {
      ...BASE_TOPOLOGY,
      atoms: [BASE_TOPOLOGY.atoms[0], BASE_TOPOLOGY.atoms[0]],
    };
    const states = [state(cell, 'b', { x: 0.1, y: 0.2, z: 0.3 })];
    expect(() => evaluatePeriodicAtomisticForces(
      cell,
      rawDuplicate,
      states,
      new DeterministicVerletNeighborList(cell, 4.5, 0.3),
    )).toThrow('unique');

    const topology = canonicalizePeriodicTopology(BASE_TOPOLOGY);
    const invalidStates = [
      state(cell, 'a', { x: 0.1, y: 0.2, z: 0.3 }),
      { ...state(cell, 'b', { x: 0.4, y: 0.2, z: 0.3 }), velocityAngstromPerPicosecond: {} as Vector3 },
      state(cell, 'c', { x: 0.75, y: 0.75, z: 0.75 }),
    ];
    expect(() => evaluatePeriodicAtomisticForces(
      cell,
      topology,
      invalidStates,
      new DeterministicVerletNeighborList(cell, 4.5, 0.3),
    )).toThrow('finite x, y and z');
  });
});

function evaluate(topology: PeriodicTopologyV041, states: ReadonlyArray<PeriodicAtomStateV041>, cell: PeriodicCell) {
  return evaluatePeriodicAtomisticForces(cell, topology, states, new DeterministicVerletNeighborList(cell, 4.5, 0.3));
}

function state(cell: PeriodicCell, id: string, unwrappedFractional: Vector3): PeriodicAtomStateV041 {
  return { id, ...cell.wrapFractional(unwrappedFractional), velocityAngstromPerPicosecond: { x: 0, y: 0, z: 0 } };
}

function perturbCartesian(
  cell: PeriodicCell,
  states: ReadonlyArray<PeriodicAtomStateV041>,
  id: string,
  delta: Vector3,
) {
  return states.map((atom) => {
    if (atom.id !== id) return atom;
    const unwrapped = cell.unwrappedCartesian(atom);
    return { ...atom, ...cell.wrapCartesian(add(unwrapped, delta)) };
  });
}

function expectVectorClose(actual: Vector3, expected: Vector3, digits: number) {
  expect(actual.x).toBeCloseTo(expected.x, digits);
  expect(actual.y).toBeCloseTo(expected.y, digits);
  expect(actual.z).toBeCloseTo(expected.z, digits);
}

function expectMagnitude(vector: Vector3, maximum: number) {
  expect(Math.hypot(vector.x, vector.y, vector.z)).toBeLessThan(maximum);
}

function relativeError(actual: number, expected: number) {
  return Math.abs(actual - expected) / Math.max(1, Math.abs(actual), Math.abs(expected));
}

function negate(vector: Vector3): Vector3 { return { x: -vector.x, y: -vector.y, z: -vector.z }; }
function add(left: Vector3, right: Vector3): Vector3 { return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z }; }
function zeroTensor() { return { xx: 0, xy: 0, xz: 0, yx: 0, yy: 0, yz: 0, zx: 0, zy: 0, zz: 0 }; }
function addTensor(left: ReturnType<typeof zeroTensor>, right: ReturnType<typeof zeroTensor>) {
  return {
    xx: left.xx + right.xx, xy: left.xy + right.xy, xz: left.xz + right.xz,
    yx: left.yx + right.yx, yy: left.yy + right.yy, yz: left.yz + right.yz,
    zx: left.zx + right.zx, zy: left.zy + right.zy, zz: left.zz + right.zz,
  };
}
