import { describe, expect, it } from 'vitest';
import type { Vector3 } from '../molecular/molecular-interactions.ts';
import { AMBER14_TIP3P_PARAMETERS_V042 } from './amber14-tip3p-parameters.ts';
import {
  canonicalizeAqueousTopology,
  createAqueousContractFixture,
  type AqueousTopologyV042,
} from './aqueous-topology.ts';
import {
  evaluateAqueousForceFieldV042,
  type AqueousForceFieldPositionV042,
} from './aqueous-force-field.ts';
import { PeriodicCell, type Int3 } from './periodic-cell.ts';

const OH_ANGSTROM = AMBER14_TIP3P_PARAMETERS_V042.rigidWaterGeometry
  .oxygenHydrogenDistanceAngstrom;
const HOH_RADIANS = AMBER14_TIP3P_PARAMETERS_V042.rigidWaterGeometry
  .hydrogenOxygenHydrogenAngleRadian;

function cubicCell(edge = 22, origin: Vector3 = { x: 0, y: 0, z: 0 }) {
  return new PeriodicCell([
    { x: edge, y: 0, z: 0 },
    { x: 0, y: edge, z: 0 },
    { x: 0, y: 0, z: edge },
  ], origin);
}

function fiveAtomFixture() {
  const topology = createAqueousContractFixture().topology;
  const cell = cubicCell();
  const oxygen = { x: 5, y: 5, z: 5 };
  const cartesianById: Record<string, Vector3> = {
    'water-o': oxygen,
    'water-h1': add(oxygen, { x: OH_ANGSTROM, y: 0, z: 0 }),
    'water-h2': add(oxygen, {
      x: OH_ANGSTROM * Math.cos(HOH_RADIANS),
      y: OH_ANGSTROM * Math.sin(HOH_RADIANS),
      z: 0,
    }),
    'sodium-na': { x: 10, y: 8, z: 8 },
    'chloride-cl': { x: 15, y: 14, z: 12 },
  };
  const positions = topology.atoms.map((atom) => ({
    id: atom.id,
    position: cell.wrapCartesian(cartesianById[atom.id]),
  }));
  return { topology, cell, positions };
}

function withoutDigest(topology: AqueousTopologyV042) {
  const { topologyDigest, ...input } = structuredClone(topology);
  void topologyDigest;
  return input;
}

function displace(
  cell: PeriodicCell,
  positions: ReadonlyArray<AqueousForceFieldPositionV042>,
  atomId: string,
  cartesianDelta: Vector3,
) {
  const fractionalDelta = cell.cartesianVectorToFractional(cartesianDelta);
  return positions.map((candidate) => {
    if (candidate.id !== atomId) return structuredClone(candidate);
    const local = cell.wrapFractional(add(candidate.position.wrappedFractional, fractionalDelta));
    return {
      id: candidate.id,
      position: {
        wrappedFractional: local.wrappedFractional,
        image: addImage(candidate.position.image, local.image),
      },
    };
  });
}

function expectRecursivelyFrozen(value: unknown) {
  if (!value || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value as Record<string, unknown>)) expectRecursivelyFrozen(child);
}

describe('pure aqueous v0.4.2 force-field composer', () => {
  it('composes the neutral five-atom reference with exact component sums and receipts', () => {
    const fixture = fiveAtomFixture();
    const topologySnapshot = JSON.stringify(fixture.topology);
    const positionSnapshot = JSON.stringify(fixture.positions);
    const result = evaluateAqueousForceFieldV042(
      fixture.topology,
      fixture.cell,
      fixture.positions,
    );

    expect(result.atomOrder).toEqual([
      'chloride-cl', 'sodium-na', 'water-h1', 'water-h2', 'water-o',
    ]);
    expect(result.topologyDigest).toBe(fixture.topology.topologyDigest);
    expect(result.evaluationDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(result.energyKjMol.total).toBe(
      result.energyKjMol.ewaldRealSpace
      + result.energyKjMol.ewaldReciprocalSpace
      + result.energyKjMol.ewaldSelfCorrection
      + result.energyKjMol.coulombExceptionCorrection
      + result.energyKjMol.lennardJonesFinal,
    );
    expect(Object.keys(result.energyKjMol).sort()).toEqual([
      'componentOrder',
      'coulombExceptionCorrection',
      'ewaldRealSpace',
      'ewaldReciprocalSpace',
      'ewaldSelfCorrection',
      'lennardJonesFinal',
      'total',
    ]);
    for (const atomId of result.atomOrder) {
      const components = result.forceComponentsByAtomIdKjMolAngstrom[atomId];
      expect(Object.keys(components).sort()).toEqual([
        'coulombExceptionCorrection',
        'ewaldRealSpace',
        'ewaldReciprocalSpace',
        'ewaldSelfCorrection',
        'lennardJonesFinal',
        'total',
      ]);
      expect(components.total).toEqual(addFive(
        components.ewaldRealSpace,
        components.ewaldReciprocalSpace,
        components.ewaldSelfCorrection,
        components.coulombExceptionCorrection,
        components.lennardJonesFinal,
      ));
      expect(result.forceByAtomIdKjMolAngstrom[atomId]).toEqual(components.total);
    }
    expect(magnitude(result.netForceKjMolAngstrom)).toBeLessThan(2e-12);
    expect(result.parameters.electrostatics).toEqual(fixture.topology.electrostatics);
    expect(result.parameters.directEwald).toEqual({
      alphaInverseAngstrom: fixture.topology.electrostatics.alphaInverseAngstrom,
      realSpaceCutoffAngstrom: fixture.topology.electrostatics.realSpaceCutoffAngstrom,
      reciprocalCutoffInverseAngstrom: fixture.topology.electrostatics.reciprocalCutoffInverseAngstrom,
      relativePermittivity: fixture.topology.electrostatics.relativePermittivity,
      neutralityToleranceE: fixture.topology.electrostatics.neutralityToleranceE,
      electrostaticConstantKjMolAngstromE2:
        fixture.topology.electrostatics.electrostaticConstantKjMolAngstromE2,
      maximumRealSpaceCandidates: fixture.topology.electrostatics.maximumRealSpaceWorkUnits,
      maximumReciprocalCandidates: fixture.topology.electrostatics.maximumReciprocalSpaceWorkUnits,
    });
    expect(result.parameters.coulombException).toEqual({
      relativePermittivity: fixture.topology.electrostatics.relativePermittivity,
      neutralityToleranceE: fixture.topology.electrostatics.neutralityToleranceE,
      electrostaticConstantKjMolAngstromE2:
        fixture.topology.electrostatics.electrostaticConstantKjMolAngstromE2,
      maximumExceptions: fixture.topology.nonbondedExceptions.length,
    });
    expect(result.parameters.shortRangeNonbonded).toEqual(fixture.topology.shortRangeNonbonded);
    expect(result.workReceipt).toMatchObject({
      allPairCount: 10,
      allPairBudget: 1_000_000,
      allPairBudgetPassed: true,
      coulombExceptions: 3,
      coulombExceptionWorkUnitsConsumed: 3,
    });
    expect(result.workReceipt.totalWorkUnitsConsumed).toBe(
      result.workReceipt.allPairCount
      + result.workReceipt.coulombExceptionWorkUnitsConsumed
      + result.workReceipt.ewaldRealSpaceWorkUnitsConsumed
      + result.workReceipt.ewaldReciprocalSpaceWorkUnitsConsumed,
    );
    expect(result.mechanicalObservables).toMatchObject({
      ewaldRealSpaceVirialKjMol: null,
      ewaldReciprocalSpaceVirialKjMol: null,
      totalVirialKjMol: null,
      pressureBar: null,
      totalStressKjMolAngstrom3: null,
    });
    expect(result.boundaries.join(' ')).toMatch(/not an OpenMM/);
    expect(result.boundaries.join(' ')).toMatch(/No per-atom potential-energy partition/);
    expectRecursivelyFrozen(result);
    expect(JSON.stringify(fixture.topology)).toBe(topologySnapshot);
    expect(JSON.stringify(fixture.positions)).toBe(positionSnapshot);
  });

  it('applies exact Lorentz-Berthelot mixing, explicit exception scales, and epsilon-zero short circuits', () => {
    const fixture = fiveAtomFixture();
    const result = evaluateAqueousForceFieldV042(fixture.topology, fixture.cell, fixture.positions);
    const topologyById = new Map(fixture.topology.atoms.map((atom) => [atom.id, atom]));
    const sodiumChloride = result.lennardJonesInteractions.find((interaction) => new Set([
      interaction.atomAId,
      interaction.atomBId,
    ]).size === 2 && [interaction.atomAId, interaction.atomBId].includes('sodium-na')
      && [interaction.atomAId, interaction.atomBId].includes('chloride-cl'))!;
    const sodium = topologyById.get('sodium-na')!;
    const chloride = topologyById.get('chloride-cl')!;
    expect(sodiumChloride.mixedSigmaAngstrom).toBe(
      (sodium.lennardJones.sigmaAngstrom + chloride.lennardJones.sigmaAngstrom) / 2,
    );
    expect(sodiumChloride.mixedEpsilonKjMol).toBe(Math.sqrt(
      sodium.lennardJones.epsilonKjMol * chloride.lennardJones.epsilonKjMol,
    ));
    expect(sodiumChloride.lennardJonesScale).toBe(1);
    expect(sodiumChloride.evaluation).toBe('evaluated-plain-cutoff');

    const hydrogenIon = result.lennardJonesInteractions.find((interaction) => (
      interaction.atomAId.startsWith('water-h') || interaction.atomBId.startsWith('water-h')
    ) && [interaction.atomAId, interaction.atomBId].includes('sodium-na'))!;
    expect(hydrogenIon.mixedEpsilonKjMol).toBe(0);
    expect(hydrogenIon.evaluation).toBe('epsilon-zero-exact-short-circuit');
    expect(hydrogenIon.energyKjMol).toBe(0);
    expect(hydrogenIon.forceOnBKjMolAngstrom).toEqual({ x: 0, y: 0, z: 0 });

    const waterExceptionInteractions = result.lennardJonesInteractions.filter((interaction) => (
      interaction.atomAId.startsWith('water-') && interaction.atomBId.startsWith('water-')
    ));
    expect(waterExceptionInteractions).toHaveLength(3);
    expect(waterExceptionInteractions.every((interaction) => (
      interaction.lennardJonesScale === 0
      && interaction.evaluation === 'exception-zero-exact-short-circuit'
      && interaction.energyKjMol === 0
    ))).toBe(true);
    expect(result.workReceipt.lennardJonesEpsilonZeroShortCircuits).toBeGreaterThan(0);
    expect(result.workReceipt.lennardJonesExceptionZeroShortCircuits).toBe(3);
    expect(result.nonbondedExceptionScales).toHaveLength(3);
    expect(result.nonbondedExceptionScales.every((exception) => (
      exception.coulombScale === 0 && exception.lennardJonesScale === 0
    ))).toBe(true);
  });

  it('matches central finite differences for every total-force component', () => {
    const fixture = fiveAtomFixture();
    const reference = evaluateAqueousForceFieldV042(fixture.topology, fixture.cell, fixture.positions);
    const stepAngstrom = 1e-4;
    let maximumAbsoluteError = 0;

    for (const atomId of reference.atomOrder) {
      for (const axis of ['x', 'y', 'z'] as const) {
        const delta = {
          x: axis === 'x' ? stepAngstrom : 0,
          y: axis === 'y' ? stepAngstrom : 0,
          z: axis === 'z' ? stepAngstrom : 0,
        };
        const plus = evaluateAqueousForceFieldV042(
          fixture.topology,
          fixture.cell,
          displace(fixture.cell, fixture.positions, atomId, delta),
        );
        const minus = evaluateAqueousForceFieldV042(
          fixture.topology,
          fixture.cell,
          displace(fixture.cell, fixture.positions, atomId, scale(delta, -1)),
        );
        const finiteDifferenceForce = -(plus.energyKjMol.total - minus.energyKjMol.total)
          / (2 * stepAngstrom);
        maximumAbsoluteError = Math.max(
          maximumAbsoluteError,
          Math.abs(finiteDifferenceForce - reference.forceByAtomIdKjMolAngstrom[atomId][axis]),
        );
      }
    }

    expect(maximumAbsoluteError).toBeLessThan(5e-8);
  });

  it('is invariant to atom order, integer image gauge, and cell origin gauge', () => {
    const fixture = fiveAtomFixture();
    const reference = evaluateAqueousForceFieldV042(fixture.topology, fixture.cell, fixture.positions);
    const permuted = evaluateAqueousForceFieldV042(
      fixture.topology,
      fixture.cell,
      [...fixture.positions].reverse(),
    );
    expect(permuted).toEqual(reference);

    const gauge: Int3 = { x: 1_000_000_000, y: -1_000_000_000, z: 1_000_000_000 };
    const gauged = evaluateAqueousForceFieldV042(
      fixture.topology,
      fixture.cell,
      fixture.positions.map((candidate) => ({
        id: candidate.id,
        position: {
          wrappedFractional: { ...candidate.position.wrappedFractional },
          image: gauge,
        },
      })),
    );
    expect(gauged).toEqual(reference);

    const originShifted = evaluateAqueousForceFieldV042(
      fixture.topology,
      cubicCell(22, { x: 900_000_000, y: -800_000_000, z: 700_000_000 }),
      fixture.positions,
    );
    expect(originShifted).toEqual(reference);
  });

  it('canonicalizes signed-zero cell, wrapped-position, and image gauges exactly', () => {
    const fixture = fiveAtomFixture();
    const translatedPositions = translateToFirstAtomFractionalOrigin(
      fixture.cell,
      fixture.positions,
    );
    const reference = evaluateAqueousForceFieldV042(
      fixture.topology,
      fixture.cell,
      translatedPositions,
    );
    const signedZeroCell = new PeriodicCell([
      { x: 22, y: -0, z: 0 },
      { x: 0, y: 22, z: -0 },
      { x: -0, y: 0, z: 22 },
    ], { x: -0, y: 0, z: -0 });
    const signedZeroPositions = structuredClone(translatedPositions);
    signedZeroPositions[0] = {
      ...signedZeroPositions[0],
      position: {
        wrappedFractional: {
          ...signedZeroPositions[0].position.wrappedFractional,
          x: -0,
        },
        image: {
          ...signedZeroPositions[0].position.image,
          x: -0,
        },
      },
    };
    const candidate = evaluateAqueousForceFieldV042(
      fixture.topology,
      signedZeroCell,
      signedZeroPositions,
    );

    expect(candidate).toEqual(reference);
  });

  it('rejects stale/nonneutral topology, atom mismatch, small cells, budgets, and extra keys atomically', () => {
    const fixture = fiveAtomFixture();
    const topologySnapshot = JSON.stringify(fixture.topology);
    const positionSnapshot = JSON.stringify(fixture.positions);
    const stale = {
      ...structuredClone(fixture.topology),
      topologyDigest: `sha256:${'0'.repeat(64)}`,
    };
    expect(() => evaluateAqueousForceFieldV042(
      stale,
      fixture.cell,
      fixture.positions,
    )).toThrow(/topologyDigest is stale/);

    const nonneutralClone = structuredClone(fixture.topology);
    const nonneutral = {
      ...nonneutralClone,
      atoms: nonneutralClone.atoms.map((atom, index) => index === 0
        ? { ...atom, chargeE: atom.chargeE + 0.1 }
        : atom),
    };
    expect(() => evaluateAqueousForceFieldV042(
      nonneutral,
      fixture.cell,
      fixture.positions,
    )).toThrow(/must be neutral/);

    expect(() => evaluateAqueousForceFieldV042(
      fixture.topology,
      fixture.cell,
      fixture.positions.slice(1),
    )).toThrow(/exactly match the topology atom count/);
    const wrongId = structuredClone(fixture.positions);
    wrongId[0] = { ...wrongId[0], id: 'unknown-atom' };
    expect(() => evaluateAqueousForceFieldV042(
      fixture.topology,
      fixture.cell,
      wrongId,
    )).toThrow(/exactly equal the topology atom IDs/);

    expect(() => evaluateAqueousForceFieldV042(
      fixture.topology,
      cubicCell(18),
      fixture.positions,
    )).toThrow(/strictly smaller/);

    const budgetTopology = canonicalizeAqueousTopology({
      ...withoutDigest(fixture.topology),
      shortRangeNonbonded: {
        ...fixture.topology.shortRangeNonbonded,
        maximumPairWorkUnits: 9,
      },
    });
    expect(() => evaluateAqueousForceFieldV042(
      budgetTopology,
      fixture.cell,
      fixture.positions,
    )).toThrow(/all-pair work 10 exceeds topology budget 9/);

    const extraPositionKey = structuredClone(fixture.positions) as Array<Record<string, unknown>>;
    extraPositionKey[0].hidden = true;
    expect(() => evaluateAqueousForceFieldV042(
      fixture.topology,
      fixture.cell,
      extraPositionKey as unknown as ReadonlyArray<AqueousForceFieldPositionV042>,
    )).toThrow(/exactly the locked keys/);
    const extraTopologyKey = { ...structuredClone(fixture.topology), hidden: true };
    expect(() => evaluateAqueousForceFieldV042(
      extraTopologyKey as unknown as AqueousTopologyV042,
      fixture.cell,
      fixture.positions,
    )).toThrow(/exactly the declared keys/);

    expect(JSON.stringify(fixture.topology)).toBe(topologySnapshot);
    expect(JSON.stringify(fixture.positions)).toBe(positionSnapshot);
  });
});

function addImage(left: Int3, right: Int3): Int3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function translateToFirstAtomFractionalOrigin(
  cell: PeriodicCell,
  positions: ReadonlyArray<AqueousForceFieldPositionV042>,
) {
  const anchor = positions[0].position.wrappedFractional;
  return positions.map((candidate) => {
    const translated = cell.wrapFractional(subtract(
      candidate.position.wrappedFractional,
      anchor,
    ));
    return {
      id: candidate.id,
      position: {
        wrappedFractional: translated.wrappedFractional,
        image: translated.image,
      },
    };
  });
}

function add(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function scale(vector: Vector3, factor: number): Vector3 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

function subtract(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function addFive(
  first: Vector3,
  second: Vector3,
  third: Vector3,
  fourth: Vector3,
  fifth: Vector3,
) {
  return add(add(add(add(first, second), third), fourth), fifth);
}

function magnitude(vector: Vector3) {
  return Math.hypot(vector.x, vector.y, vector.z);
}
