import type { Vector3 } from '../molecular/molecular-interactions.ts';
import {
  canonicalizeAqueousTopology,
  type AqueousExceptionRuleV042,
  type AqueousTopologyV042,
} from './aqueous-topology.ts';
import { digestValue } from './digest.ts';
import {
  evaluatePeriodicCoulombExceptionCorrections,
  type CoulombExceptionVirialTensorV042,
  type PeriodicCoulombExceptionV042,
} from './periodic-coulomb-exceptions.ts';
import {
  evaluateDirectPeriodicEwald,
  type DirectEwaldAtomV042,
  type DirectEwaldOptionsV042,
} from './periodic-ewald.ts';
import {
  PeriodicCell,
  type CellVectors3,
  type WrappedPeriodicPosition,
} from './periodic-cell.ts';

/**
 * Pure v0.4.2 composition of the validated aqueous topology, direct Ewald,
 * selected Coulomb corrections, and plain-cutoff Lorentz-Berthelot LJ.
 * This is a small-system reference composer, not an OpenMM or PME replica.
 */

export type AqueousForceFieldPositionV042 = Readonly<{
  id: string;
  position: WrappedPeriodicPosition;
}>;

export type AqueousForceComponentV042 = Readonly<{
  ewaldRealSpace: Vector3;
  ewaldReciprocalSpace: Vector3;
  ewaldSelfCorrection: Vector3;
  coulombExceptionCorrection: Vector3;
  lennardJonesFinal: Vector3;
  total: Vector3;
}>;

export type AqueousLennardJonesInteractionV042 = Readonly<{
  id: string;
  atomAId: string;
  atomBId: string;
  distanceAngstrom: number;
  displacementAngstrom: Vector3;
  mixedSigmaAngstrom: number;
  mixedEpsilonKjMol: number;
  lennardJonesScale: number;
  evaluation:
    | 'evaluated-plain-cutoff'
    | 'epsilon-zero-exact-short-circuit'
    | 'exception-zero-exact-short-circuit';
  energyKjMol: number;
  forceOnBKjMolAngstrom: Vector3;
  virialKjMol: CoulombExceptionVirialTensorV042;
}>;

export type AqueousForceFieldEvaluationV042 = Readonly<{
  schemaVersion: 'tf.aqueous-force-field-evaluation/0.4.2';
  method: 'direct-ewald-plus-selected-coulomb-correction-plus-plain-cutoff-lb-lj';
  topologyId: string;
  topologyDigest: string;
  evaluationDigest: string;
  atomOrder: ReadonlyArray<string>;
  atoms: ReadonlyArray<Readonly<{
    id: string;
    wrappedFractional: Vector3;
    imageGauge: 'omitted-nonphysical-lattice-gauge';
  }>>;
  cell: Readonly<{
    vectorsAngstrom: CellVectors3;
    volumeAngstrom3: number;
    originGauge: 'omitted-origin-is-not-physical';
  }>;
  energyKjMol: Readonly<{
    ewaldRealSpace: number;
    ewaldReciprocalSpace: number;
    ewaldSelfCorrection: number;
    coulombExceptionCorrection: number;
    lennardJonesFinal: number;
    total: number;
    componentOrder: readonly [
      'ewaldRealSpace',
      'ewaldReciprocalSpace',
      'ewaldSelfCorrection',
      'coulombExceptionCorrection',
      'lennardJonesFinal',
    ];
  }>;
  forceComponentsByAtomIdKjMolAngstrom: Readonly<Record<string, AqueousForceComponentV042>>;
  forceByAtomIdKjMolAngstrom: Readonly<Record<string, Vector3>>;
  netForceKjMolAngstrom: Vector3;
  nonbondedExceptionScales: ReadonlyArray<Readonly<{
    id: string;
    atomAId: string;
    atomBId: string;
    coulombScale: number;
    lennardJonesScale: number;
  }>>;
  lennardJonesInteractions: ReadonlyArray<AqueousLennardJonesInteractionV042>;
  mechanicalObservables: Readonly<{
    lennardJonesPairVirialKjMol: CoulombExceptionVirialTensorV042;
    coulombExceptionPairVirialKjMol: CoulombExceptionVirialTensorV042;
    availablePairVirialKjMol: CoulombExceptionVirialTensorV042;
    ewaldRealSpaceVirialKjMol: null;
    ewaldReciprocalSpaceVirialKjMol: null;
    totalVirialKjMol: null;
    pressureBar: null;
    totalStressKjMolAngstrom3: null;
    boundary: 'unavailable-complete-ewald-virial-not-implemented';
  }>;
  parameters: Readonly<{
    electrostatics: AqueousTopologyV042['electrostatics'];
    directEwald: DirectEwaldOptionsV042;
    coulombException: Readonly<{
      relativePermittivity: 1;
      neutralityToleranceE: number;
      electrostaticConstantKjMolAngstromE2: number;
      maximumExceptions: number;
    }>;
    shortRangeNonbonded: AqueousTopologyV042['shortRangeNonbonded'];
  }>;
  workReceipt: Readonly<{
    allPairCount: number;
    allPairBudget: number;
    allPairBudgetPassed: true;
    lennardJonesPairsInsideCutoff: number;
    lennardJonesPairsEvaluated: number;
    lennardJonesEpsilonZeroShortCircuits: number;
    lennardJonesExceptionZeroShortCircuits: number;
    coulombExceptions: number;
    coulombExceptionWorkUnitsConsumed: number;
    ewaldRealSpaceWorkUnitsConsumed: number;
    ewaldReciprocalSpaceWorkUnitsConsumed: number;
    totalWorkUnitsConsumed: number;
    deterministicOrder: 'stable-atom-id-then-stable-pair-id';
  }>;
  provenance: Readonly<{
    composer: 'tf-aqueous-force-field-reference';
    composerVersion: '0.4.2';
    topologyRecanonicalized: true;
    topologyDigestVerified: true;
    meshUsed: false;
    pme: false;
    openmmExecution: false;
    authenticity: 'not-provided';
  }>;
  boundaries: ReadonlyArray<string>;
}>;

const MINIMUM_DISTANCE_ANGSTROM = 1e-10;
const ENERGY_COMPONENT_ORDER = Object.freeze([
  'ewaldRealSpace',
  'ewaldReciprocalSpace',
  'ewaldSelfCorrection',
  'coulombExceptionCorrection',
  'lennardJonesFinal',
] as const);
const POSITION_KEYS = Object.freeze(['id', 'position']);
const WRAPPED_POSITION_KEYS = Object.freeze(['wrappedFractional', 'image']);
const VECTOR_KEYS = Object.freeze(['x', 'y', 'z']);

const BOUNDARIES = Object.freeze([
  'This is a pure small-system reference composer; it is not an OpenMM, AMBER, PME, SPME, PPPM, or production-MD reproduction.',
  'The topology is fully re-canonicalized and its supplied digest must match before any force evaluation is accepted.',
  'Direct Ewald options are copied exactly from the validated topology; no composer-side electrostatic defaults are introduced.',
  'Lennard-Jones uses topology-locked Lorentz-Berthelot mixing and a plain strict cutoff with no switch, shift, or dispersion correction.',
  'Every unordered atom pair consumes the all-pair budget, including excluded, outside-cutoff, and epsilon-zero pairs.',
  'Epsilon-zero and exception-zero LJ pairs take exact zero short-circuits and do not evaluate inverse-power terms.',
  'Constraint projection is not a potential-energy component and energetic bonds are not evaluated by this composer.',
  'No per-atom potential-energy partition is claimed; only global energy components and per-atom force components are reported.',
  'Only LJ and selected Coulomb-exception pair virials are available; complete Ewald virial, total virial, pressure, and stress are null.',
  'The evaluation digest is deterministic evidence binding, not a signature, authenticity proof, license clearance, or trajectory reproduction.',
]);

type CanonicalPosition = Readonly<{
  id: string;
  position: WrappedPeriodicPosition;
}>;

type LennardJonesEvaluation = Readonly<{
  energyKjMol: number;
  forceByAtomIdKjMolAngstrom: Readonly<Record<string, Vector3>>;
  virialKjMol: CoulombExceptionVirialTensorV042;
  interactions: ReadonlyArray<AqueousLennardJonesInteractionV042>;
  pairCount: number;
  pairsInsideCutoff: number;
  pairsEvaluated: number;
  epsilonZeroShortCircuits: number;
  exceptionZeroShortCircuits: number;
}>;

export function evaluateAqueousForceFieldV042(
  topology: AqueousTopologyV042,
  cell: PeriodicCell,
  positions: ReadonlyArray<AqueousForceFieldPositionV042>,
): AqueousForceFieldEvaluationV042 {
  if (!(cell instanceof PeriodicCell)) throw new TypeError('aqueous force field requires a PeriodicCell');
  const canonicalTopology = recanonicalizeAndVerifyTopology(topology);
  const canonicalPositions = canonicalizePositions(cell, positions, canonicalTopology);

  cell.assertNeighborRadius(canonicalTopology.shortRangeNonbonded.cutoffAngstrom);
  const pairCount = safePairCount(canonicalPositions.length);
  if (pairCount > canonicalTopology.shortRangeNonbonded.maximumPairWorkUnits) {
    throw new Error(
      `aqueous all-pair work ${pairCount} exceeds topology budget ${canonicalTopology.shortRangeNonbonded.maximumPairWorkUnits}`,
    );
  }

  const topologyById = new Map(canonicalTopology.atoms.map((atom) => [atom.id, atom]));
  const positionById = new Map(canonicalPositions.map((position) => [position.id, position]));
  const electrostaticAtoms: ReadonlyArray<DirectEwaldAtomV042> = canonicalTopology.atoms.map((atom) => ({
    id: atom.id,
    chargeE: atom.chargeE,
    position: requireMap(positionById, atom.id, 'aqueous atom position').position,
  }));
  const ewaldOptions: DirectEwaldOptionsV042 = {
    alphaInverseAngstrom: canonicalTopology.electrostatics.alphaInverseAngstrom,
    realSpaceCutoffAngstrom: canonicalTopology.electrostatics.realSpaceCutoffAngstrom,
    reciprocalCutoffInverseAngstrom: canonicalTopology.electrostatics.reciprocalCutoffInverseAngstrom,
    relativePermittivity: canonicalTopology.electrostatics.relativePermittivity,
    neutralityToleranceE: canonicalTopology.electrostatics.neutralityToleranceE,
    electrostaticConstantKjMolAngstromE2:
      canonicalTopology.electrostatics.electrostaticConstantKjMolAngstromE2,
    maximumRealSpaceCandidates: canonicalTopology.electrostatics.maximumRealSpaceWorkUnits,
    maximumReciprocalCandidates: canonicalTopology.electrostatics.maximumReciprocalSpaceWorkUnits,
  };
  const ewald = evaluateDirectPeriodicEwald(cell, electrostaticAtoms, ewaldOptions);

  const coulombExceptions: ReadonlyArray<PeriodicCoulombExceptionV042> =
    canonicalTopology.nonbondedExceptions.map((exception) => {
      const atomA = requireMap(positionById, exception.atomAId, 'Coulomb exception atom A');
      const atomB = requireMap(positionById, exception.atomBId, 'Coulomb exception atom B');
      return {
        id: exception.id,
        atomAId: exception.atomAId,
        atomBId: exception.atomBId,
        coulombScale: exceptionScale(exception.coulomb),
        imageShiftForB: cell.minimumImageFromFractional(
          atomA.position.wrappedFractional,
          atomB.position.wrappedFractional,
        ).imageShiftForTarget,
      };
    });
  const coulombCorrection = evaluatePeriodicCoulombExceptionCorrections(
    cell,
    electrostaticAtoms,
    coulombExceptions,
    {
      relativePermittivity: canonicalTopology.electrostatics.relativePermittivity,
      neutralityToleranceE: canonicalTopology.electrostatics.neutralityToleranceE,
      electrostaticConstantKjMolAngstromE2:
        canonicalTopology.electrostatics.electrostaticConstantKjMolAngstromE2,
      maximumExceptions: Math.max(1, coulombExceptions.length),
    },
  );

  const lennardJones = evaluateFinalLennardJones(
    cell,
    canonicalTopology,
    canonicalPositions,
    topologyById,
    pairCount,
  );
  const forceComponentsByAtomId: Record<string, AqueousForceComponentV042> = {};
  const forceByAtomId: Record<string, Vector3> = {};
  for (const atom of canonicalTopology.atoms) {
    const ewaldComponents = ewald.forceComponentsByAtomIdKjMolAngstrom[atom.id];
    const exceptionForce = coulombCorrection.forceCorrectionByAtomIdKjMolAngstrom[atom.id];
    const lennardJonesForce = lennardJones.forceByAtomIdKjMolAngstrom[atom.id];
    if (!ewaldComponents || !exceptionForce || !lennardJonesForce) {
      throw new Error(`aqueous force composition lost atom ${atom.id}`);
    }
    const ewaldRealSpace = canonicalVector(ewaldComponents.realSpace);
    const ewaldReciprocalSpace = canonicalVector(ewaldComponents.reciprocalSpace);
    const ewaldSelfCorrection = canonicalVector(ewaldComponents.selfCorrection);
    const coulombExceptionCorrection = canonicalVector(exceptionForce);
    const lennardJonesFinal = canonicalVector(lennardJonesForce);
    const total = canonicalVector(addFive(
      ewaldRealSpace,
      ewaldReciprocalSpace,
      ewaldSelfCorrection,
      coulombExceptionCorrection,
      lennardJonesFinal,
    ));
    assertFiniteVector(total, `total force for atom ${atom.id}`);
    forceComponentsByAtomId[atom.id] = {
      ewaldRealSpace,
      ewaldReciprocalSpace,
      ewaldSelfCorrection,
      coulombExceptionCorrection,
      lennardJonesFinal,
      total,
    };
    forceByAtomId[atom.id] = total;
  }
  const netForce = canonicalVector(canonicalTopology.atoms.reduce(
    (sum, atom) => add(sum, forceByAtomId[atom.id]),
    zeroVector(),
  ));
  assertFiniteVector(netForce, 'aqueous net force');

  const energyKjMol = {
    ewaldRealSpace: ewald.energyKjMol.realSpace,
    ewaldReciprocalSpace: ewald.energyKjMol.reciprocalSpace,
    ewaldSelfCorrection: ewald.energyKjMol.selfCorrection,
    coulombExceptionCorrection: coulombCorrection.energyCorrectionKjMol,
    lennardJonesFinal: lennardJones.energyKjMol,
    total: canonicalNumber(
      ewald.energyKjMol.realSpace
      + ewald.energyKjMol.reciprocalSpace
      + ewald.energyKjMol.selfCorrection
      + coulombCorrection.energyCorrectionKjMol
      + lennardJones.energyKjMol,
    ),
    componentOrder: ENERGY_COMPONENT_ORDER,
  };
  if (!Object.values(energyKjMol).slice(0, 6).every((value) => Number.isFinite(value))) {
    throw new Error('aqueous composed energy became non-finite');
  }

  const totalWorkUnitsConsumed = safeSum(
    pairCount,
    coulombCorrection.workUnitsConsumed,
    ewald.enumeration.realSpaceWorkUnitsConsumed,
    ewald.enumeration.reciprocalWorkUnitsConsumed,
  );
  const payload = {
    schemaVersion: 'tf.aqueous-force-field-evaluation/0.4.2' as const,
    method: 'direct-ewald-plus-selected-coulomb-correction-plus-plain-cutoff-lb-lj' as const,
    topologyId: canonicalTopology.topologyId,
    topologyDigest: canonicalTopology.topologyDigest,
    atomOrder: canonicalTopology.atoms.map((atom) => atom.id),
    atoms: canonicalPositions.map((position) => ({
      id: position.id,
      wrappedFractional: { ...position.position.wrappedFractional },
      imageGauge: 'omitted-nonphysical-lattice-gauge' as const,
    })),
    cell: {
      vectorsAngstrom: cell.vectorsAngstrom.map((vector) => ({ ...vector })) as unknown as CellVectors3,
      volumeAngstrom3: cell.volumeAngstrom3,
      originGauge: 'omitted-origin-is-not-physical' as const,
    },
    energyKjMol,
    forceComponentsByAtomIdKjMolAngstrom: forceComponentsByAtomId,
    forceByAtomIdKjMolAngstrom: forceByAtomId,
    netForceKjMolAngstrom: netForce,
    nonbondedExceptionScales: canonicalTopology.nonbondedExceptions.map((exception) => ({
      id: exception.id,
      atomAId: exception.atomAId,
      atomBId: exception.atomBId,
      coulombScale: exceptionScale(exception.coulomb),
      lennardJonesScale: exceptionScale(exception.lennardJones),
    })),
    lennardJonesInteractions: lennardJones.interactions,
    mechanicalObservables: {
      lennardJonesPairVirialKjMol: lennardJones.virialKjMol,
      coulombExceptionPairVirialKjMol: coulombCorrection.virialCorrectionKjMol,
      availablePairVirialKjMol: addTensor(
        lennardJones.virialKjMol,
        coulombCorrection.virialCorrectionKjMol,
      ),
      ewaldRealSpaceVirialKjMol: null,
      ewaldReciprocalSpaceVirialKjMol: null,
      totalVirialKjMol: null,
      pressureBar: null,
      totalStressKjMolAngstrom3: null,
      boundary: 'unavailable-complete-ewald-virial-not-implemented' as const,
    },
    parameters: {
      electrostatics: { ...canonicalTopology.electrostatics },
      directEwald: { ...ewald.parameters },
      coulombException: { ...coulombCorrection.parameters },
      shortRangeNonbonded: { ...canonicalTopology.shortRangeNonbonded },
    },
    workReceipt: {
      allPairCount: pairCount,
      allPairBudget: canonicalTopology.shortRangeNonbonded.maximumPairWorkUnits,
      allPairBudgetPassed: true as const,
      lennardJonesPairsInsideCutoff: lennardJones.pairsInsideCutoff,
      lennardJonesPairsEvaluated: lennardJones.pairsEvaluated,
      lennardJonesEpsilonZeroShortCircuits: lennardJones.epsilonZeroShortCircuits,
      lennardJonesExceptionZeroShortCircuits: lennardJones.exceptionZeroShortCircuits,
      coulombExceptions: coulombExceptions.length,
      coulombExceptionWorkUnitsConsumed: coulombCorrection.workUnitsConsumed,
      ewaldRealSpaceWorkUnitsConsumed: ewald.enumeration.realSpaceWorkUnitsConsumed,
      ewaldReciprocalSpaceWorkUnitsConsumed: ewald.enumeration.reciprocalWorkUnitsConsumed,
      totalWorkUnitsConsumed,
      deterministicOrder: 'stable-atom-id-then-stable-pair-id' as const,
    },
    provenance: {
      composer: 'tf-aqueous-force-field-reference' as const,
      composerVersion: '0.4.2' as const,
      topologyRecanonicalized: true as const,
      topologyDigestVerified: true as const,
      meshUsed: false as const,
      pme: false as const,
      openmmExecution: false as const,
      authenticity: 'not-provided' as const,
    },
    boundaries: [...BOUNDARIES],
  };
  return deepFreeze({
    ...payload,
    evaluationDigest: digestValue(payload),
  }) as AqueousForceFieldEvaluationV042;
}

function recanonicalizeAndVerifyTopology(topology: AqueousTopologyV042) {
  if (!topology || typeof topology !== 'object' || Array.isArray(topology)) {
    throw new TypeError('aqueous force field topology must be an object');
  }
  const cloned = structuredClone(topology) as AqueousTopologyV042;
  const { topologyDigest, ...topologyInput } = cloned;
  const canonical = canonicalizeAqueousTopology(topologyInput);
  if (typeof topologyDigest !== 'string' || canonical.topologyDigest !== topologyDigest) {
    throw new Error('aqueous topologyDigest is stale or does not match the re-canonicalized topology');
  }
  return canonical;
}

function canonicalizePositions(
  cell: PeriodicCell,
  positions: ReadonlyArray<AqueousForceFieldPositionV042>,
  topology: AqueousTopologyV042,
) {
  if (!Array.isArray(positions) || positions.length !== topology.atoms.length) {
    throw new Error('aqueous force-field atom positions must exactly match the topology atom count');
  }
  const topologyIds = topology.atoms.map((atom) => atom.id);
  const seen = new Set<string>();
  const canonical = positions.map((position) => {
    assertExactKeys(position, POSITION_KEYS, 'aqueous force-field atom position');
    if (typeof position.id !== 'string' || seen.has(position.id)) {
      throw new Error('aqueous force-field atom position IDs must be unique strings');
    }
    seen.add(position.id);
    assertExactKeys(position.position, WRAPPED_POSITION_KEYS, `position ${position.id}`);
    assertExactKeys(
      position.position.wrappedFractional,
      VECTOR_KEYS,
      `position ${position.id} wrappedFractional`,
    );
    assertExactKeys(position.position.image, VECTOR_KEYS, `position ${position.id} image`);
    cell.wrappedCartesian(position.position);
    return {
      id: position.id,
      position: {
        wrappedFractional: canonicalVector(position.position.wrappedFractional),
        image: {
          x: canonicalNumber(position.position.image.x),
          y: canonicalNumber(position.position.image.y),
          z: canonicalNumber(position.position.image.z),
        },
      },
    };
  }).sort((left, right) => compareAscii(left.id, right.id));
  if (canonical.some((position, index) => position.id !== topologyIds[index])) {
    throw new Error('aqueous force-field atom position IDs must exactly equal the topology atom IDs');
  }
  return deepFreeze(canonical) as ReadonlyArray<CanonicalPosition>;
}

function evaluateFinalLennardJones(
  cell: PeriodicCell,
  topology: AqueousTopologyV042,
  positions: ReadonlyArray<CanonicalPosition>,
  topologyById: ReadonlyMap<string, AqueousTopologyV042['atoms'][number]>,
  pairCount: number,
): LennardJonesEvaluation {
  const exceptions = new Map(topology.nonbondedExceptions.map((exception) => [
    pairKey(exception.atomAId, exception.atomBId),
    exception,
  ]));
  const forceById = Object.fromEntries(positions.map((position) => [position.id, zeroVector()])) as Record<string, Vector3>;
  const interactions: AqueousLennardJonesInteractionV042[] = [];
  let energy = 0;
  let virial = zeroTensor();
  let pairsInsideCutoff = 0;
  let pairsEvaluated = 0;
  let epsilonZeroShortCircuits = 0;
  let exceptionZeroShortCircuits = 0;

  for (let firstIndex = 0; firstIndex < positions.length; firstIndex += 1) {
    const firstPosition = positions[firstIndex];
    const firstTopology = requireMap(topologyById, firstPosition.id, 'LJ topology atom A');
    for (let secondIndex = firstIndex + 1; secondIndex < positions.length; secondIndex += 1) {
      const secondPosition = positions[secondIndex];
      const secondTopology = requireMap(topologyById, secondPosition.id, 'LJ topology atom B');
      const minimumImage = cell.minimumImageFromFractional(
        firstPosition.position.wrappedFractional,
        secondPosition.position.wrappedFractional,
      );
      if (!(Number.isFinite(minimumImage.distanceAngstrom)
        && minimumImage.distanceAngstrom > MINIMUM_DISTANCE_ANGSTROM)) {
        throw new Error(`aqueous LJ pair ${firstPosition.id}/${secondPosition.id} overlaps or is non-finite`);
      }
      if (minimumImage.distanceAngstrom >= topology.shortRangeNonbonded.cutoffAngstrom) continue;
      pairsInsideCutoff += 1;
      const mixedSigma = canonicalNumber(
        (firstTopology.lennardJones.sigmaAngstrom + secondTopology.lennardJones.sigmaAngstrom) / 2,
      );
      const mixedEpsilon = canonicalNumber(Math.sqrt(
        firstTopology.lennardJones.epsilonKjMol * secondTopology.lennardJones.epsilonKjMol,
      ));
      const exception = exceptions.get(pairKey(firstPosition.id, secondPosition.id));
      const scaleValue = exception ? exceptionScale(exception.lennardJones) : 1;
      let evaluation: AqueousLennardJonesInteractionV042['evaluation'];
      let pairEnergy = 0;
      let forceOnB = zeroVector();
      if (scaleValue === 0) {
        evaluation = 'exception-zero-exact-short-circuit';
        exceptionZeroShortCircuits += 1;
      } else if (mixedEpsilon === 0) {
        evaluation = 'epsilon-zero-exact-short-circuit';
        epsilonZeroShortCircuits += 1;
      } else {
        evaluation = 'evaluated-plain-cutoff';
        pairsEvaluated += 1;
        const inverseDistance = 1 / minimumImage.distanceAngstrom;
        const sigmaOverDistance = mixedSigma * inverseDistance;
        const sigmaOverDistance6 = sigmaOverDistance ** 6;
        const sigmaOverDistance12 = sigmaOverDistance6 ** 2;
        pairEnergy = scaleValue * 4 * mixedEpsilon * (sigmaOverDistance12 - sigmaOverDistance6);
        const forceScale = scaleValue * 24 * mixedEpsilon
          * (2 * sigmaOverDistance12 - sigmaOverDistance6) * inverseDistance ** 2;
        forceOnB = scale(minimumImage.displacementAngstrom, forceScale);
      }
      const pairVirial = outer(minimumImage.displacementAngstrom, forceOnB);
      assertFiniteScalar(pairEnergy, `LJ energy for ${firstPosition.id}/${secondPosition.id}`);
      assertFiniteVector(forceOnB, `LJ force for ${firstPosition.id}/${secondPosition.id}`);
      energy += pairEnergy;
      assertFiniteScalar(energy, 'LJ accumulated energy');
      forceById[firstPosition.id] = subtract(forceById[firstPosition.id], forceOnB);
      forceById[secondPosition.id] = add(forceById[secondPosition.id], forceOnB);
      virial = addTensor(virial, pairVirial);
      interactions.push({
        id: `lj:${firstPosition.id}:${secondPosition.id}`,
        atomAId: firstPosition.id,
        atomBId: secondPosition.id,
        distanceAngstrom: canonicalNumber(minimumImage.distanceAngstrom),
        displacementAngstrom: canonicalVector(minimumImage.displacementAngstrom),
        mixedSigmaAngstrom: mixedSigma,
        mixedEpsilonKjMol: mixedEpsilon,
        lennardJonesScale: canonicalNumber(scaleValue),
        evaluation,
        energyKjMol: canonicalNumber(pairEnergy),
        forceOnBKjMolAngstrom: canonicalVector(forceOnB),
        virialKjMol: canonicalTensor(pairVirial),
      });
    }
  }
  if (pairCount !== safePairCount(positions.length)) {
    throw new Error('aqueous LJ pair accounting changed after preflight');
  }
  const canonicalForces = Object.fromEntries(positions.map((position) => {
    const force = canonicalVector(forceById[position.id]);
    assertFiniteVector(force, `final LJ force for ${position.id}`);
    return [position.id, force];
  })) as Readonly<Record<string, Vector3>>;
  return deepFreeze({
    energyKjMol: canonicalNumber(energy),
    forceByAtomIdKjMolAngstrom: canonicalForces,
    virialKjMol: canonicalTensor(virial),
    interactions,
    pairCount,
    pairsInsideCutoff,
    pairsEvaluated,
    epsilonZeroShortCircuits,
    exceptionZeroShortCircuits,
  });
}

function exceptionScale(rule: AqueousExceptionRuleV042) {
  if (rule.mode === 'exclude') return 0;
  if (rule.mode === 'scale' && Number.isFinite(rule.scale) && rule.scale >= 0 && rule.scale <= 1) {
    return canonicalNumber(rule.scale);
  }
  throw new Error('aqueous nonbonded exception scale is invalid after topology canonicalization');
}

function safePairCount(atomCount: number) {
  const product = atomCount * (atomCount - 1);
  if (!Number.isSafeInteger(product)) throw new Error('aqueous all-pair count exceeds the safe integer domain');
  return product / 2;
}

function safeSum(...values: number[]) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) throw new Error('aqueous force-field work receipt exceeds the safe integer domain');
  return total;
}

function assertExactKeys(value: unknown, expected: ReadonlyArray<string>, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object with exact keys`);
  }
  const actual = Object.keys(value).sort(compareAscii);
  const wanted = [...expected].sort(compareAscii);
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} must contain exactly the locked keys`);
  }
}

function requireMap<Key, Value>(map: ReadonlyMap<Key, Value>, key: Key, label: string) {
  const value = map.get(key);
  if (value === undefined) throw new Error(`${label} is missing`);
  return value;
}

function pairKey(left: string, right: string) {
  return compareAscii(left, right) <= 0 ? `${left}\0${right}` : `${right}\0${left}`;
}

function compareAscii(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function assertFiniteScalar(value: number, label: string) {
  if (!Number.isFinite(value)) throw new Error(`${label} must be finite`);
}

function assertFiniteVector(vector: Vector3, label: string) {
  if (!vector || ![vector.x, vector.y, vector.z].every(Number.isFinite)) {
    throw new Error(`${label} must contain finite x, y and z`);
  }
}

function canonicalNumber(value: number) {
  return Object.is(value, -0) ? 0 : value;
}

function canonicalVector(vector: Vector3): Vector3 {
  return {
    x: canonicalNumber(vector.x),
    y: canonicalNumber(vector.y),
    z: canonicalNumber(vector.z),
  };
}

function zeroVector(): Vector3 {
  return { x: 0, y: 0, z: 0 };
}

function add(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function subtract(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function scale(vector: Vector3, factor: number): Vector3 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
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

function canonicalTensor(tensor: CoulombExceptionVirialTensorV042) {
  const canonical = Object.fromEntries(Object.entries(tensor).map(([key, value]) => [
    key,
    canonicalNumber(value),
  ])) as unknown as CoulombExceptionVirialTensorV042;
  if (!Object.values(canonical).every(Number.isFinite)) throw new Error('aqueous pair virial became non-finite');
  return canonical;
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
