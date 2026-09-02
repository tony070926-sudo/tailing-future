import type { Vector3 } from '../molecular/molecular-interactions.ts';
import { PeriodicCell, type CellVectors3, type Int3, type WrappedPeriodicPosition } from './periodic-cell.ts';
import {
  applyRattleVelocityConstraints,
  applyShakePositionConstraints,
  MAXIMUM_RIGID_CONSTRAINT_ATOMS,
  MAXIMUM_RIGID_CONSTRAINT_ITERATIONS,
  MAXIMUM_RIGID_CONSTRAINT_WORK_UNITS,
  MAXIMUM_RIGID_DISTANCE_CONSTRAINTS,
  type RigidConstraintAtom,
  type RigidConstraintOptions,
  type RigidDistanceConstraint,
} from './rigid-constraints.ts';

/**
 * Complete, synchronous constrained Velocity Verlet/RATTLE single-step kernel.
 *
 * Scientific boundary: this is an NVE integration primitive for finite,
 * position-dependent forces. It does not implement a thermostat, barostat,
 * long-range electrostatics, force field, or constraint virial. Constraint
 * impulses are audited directly, but a virial is deliberately not inferred
 * from the aggregate corrections.
 */

export type ConstrainedForceAtom = Readonly<{
  id: string;
  massDalton: number;
  position: WrappedPeriodicPosition;
}>;

export type ConstrainedForceContext = Readonly<{
  stage: 'initial' | 'final';
  evaluationOrdinal: 1 | 2;
  cell: PeriodicCell;
  atoms: ReadonlyArray<ConstrainedForceAtom>;
}>;

export type ConstrainedForceEvaluation = Readonly<{
  forceByAtomIdKjMolAngstrom: Readonly<Record<string, Vector3>>;
  potentialEnergyComponentsKjMol: Readonly<Record<string, number>>;
  /** Deterministic caller-reported work; callback purity is a caller responsibility. */
  workUnitsConsumed: number;
}>;

export type ConstrainedForceCallback = (
  context: ConstrainedForceContext,
) => ConstrainedForceEvaluation;

export type ConstraintJacobianRankContext = Readonly<{
  cell: PeriodicCell;
  atoms: ReadonlyArray<ConstrainedForceAtom>;
  constraints: ReadonlyArray<RigidDistanceConstraint>;
}>;

export type ConstraintJacobianRankEvaluation = Readonly<{
  rank: number;
  /** Stable identifier for the independently auditable rank method. */
  method: string;
  workUnitsConsumed: number;
}>;

export type ConstraintJacobianRankCallback = (
  context: ConstraintJacobianRankContext,
) => ConstraintJacobianRankEvaluation;

export type ConstrainedVelocityVerletOptions = Readonly<{
  timeStepPicoseconds: number;
  constraintOptions?: Partial<RigidConstraintOptions>;
  maximumWorkUnits?: number;
  maximumForceEvaluationWorkUnits?: number;
  evaluateConstraintJacobianRank?: ConstraintJacobianRankCallback;
  maximumConstraintJacobianRankWorkUnits?: number;
  constraintImpulseToleranceDaltonAngstromPerPicosecond?: number;
}>;

export type ConstrainedEnergyState = Readonly<{
  kineticEnergyKjMol: number;
  potentialEnergyKjMol: number;
  totalEnergyKjMol: number;
  potentialEnergyComponentsKjMol: Readonly<Record<string, number>>;
}>;

export type ConstrainedStepEndpoint = Readonly<{
  atoms: ReadonlyArray<RigidConstraintAtom>;
  forceByAtomIdKjMolAngstrom: Readonly<Record<string, Vector3>>;
  energy: ConstrainedEnergyState;
}>;

export type PerAtomConstraintCorrection = Readonly<{
  shakeVelocityCorrectionAngstromPerPicosecond: Vector3;
  rattleVelocityCorrectionAngstromPerPicosecond: Vector3;
  totalVelocityCorrectionAngstromPerPicosecond: Vector3;
  /** Effective impulse associated with SHAKE position projection and Δr/dt synchronization. */
  shakeMassWeightedConstraintImpulseDaltonAngstromPerPicosecond: Vector3;
  /** Final velocity-projection impulse applied by RATTLE. */
  rattleMassWeightedConstraintImpulseDaltonAngstromPerPicosecond: Vector3;
  totalMassWeightedConstraintImpulseDaltonAngstromPerPicosecond: Vector3;
}>;

export type ConstraintImpulseClosure = Readonly<{
  shakeTotalDaltonAngstromPerPicosecond: Vector3;
  shakeResidualNormDaltonAngstromPerPicosecond: number;
  rattleTotalDaltonAngstromPerPicosecond: Vector3;
  rattleResidualNormDaltonAngstromPerPicosecond: number;
  combinedTotalDaltonAngstromPerPicosecond: Vector3;
  combinedResidualNormDaltonAngstromPerPicosecond: number;
  toleranceDaltonAngstromPerPicosecond: number;
}>;

export type ConstrainedVelocityVerletResult = Readonly<{
  algorithm: 'constrained-velocity-verlet-rattle';
  ensemble: 'NVE';
  timeStepPicoseconds: number;
  atomOrder: ReadonlyArray<string>;
  cell: Readonly<{
    /** Cell origin is a coordinate gauge and is intentionally omitted. */
    vectorsAngstrom: CellVectors3;
    volumeAngstrom3: number;
  }>;
  initial: ConstrainedStepEndpoint;
  final: ConstrainedStepEndpoint;
  perAtomConstraintCorrection: Readonly<Record<string, PerAtomConstraintCorrection>>;
  constraintImpulseClosure: ConstraintImpulseClosure;
  constraintKineticEnergyChangesKjMol: Readonly<{
    shake: number;
    rattle: number;
    total: number;
  }>;
  constraintNumericalWorkKjMol: Readonly<{
    /** Discrete kinetic-energy change caused by SHAKE position synchronization. */
    positionProjection: number;
    /** Discrete kinetic-energy change caused by the final RATTLE projection. */
    finalVelocityProjection: number;
    total: number;
    interpretation: 'constraint-projection kinetic-energy change; not potential energy';
  }>;
  degreesOfFreedom: Readonly<{
    cartesianCoordinateCount: number;
    constraintJacobianRank: number | null;
    constrainedCartesianCoordinateCount: number | null;
    rankMethod: string | null;
    rankWorkUnitsConsumed: number;
  }>;
  constraintResiduals: Readonly<{
    initialPositionAngstrom: number;
    initialVelocityDerivativeAngstrom2PerPicosecond: number;
    finalPositionAngstrom: number;
    finalVelocityDerivativeAngstrom2PerPicosecond: number;
    shakeIterations: number;
    rattleIterations: number;
    constraintOrder: ReadonlyArray<string>;
  }>;
  workBudget: Readonly<{
    maximumWorkUnits: number;
    maximumForceEvaluationWorkUnits: number;
    maximumConstraintJacobianRankWorkUnits: number;
    preflightReservedWorkUnits: number;
    integrationWorkUnits: number;
    forceEvaluationWorkUnits: number;
    constraintJacobianRankWorkUnits: number;
    constraintProjectionWorkUnits: number;
    consumedWorkUnits: number;
    remainingWorkUnits: number;
  }>;
  thermostat: null;
  barostat: null;
  constraintVirialKjMol: null;
  boundaries: ReadonlyArray<string>;
}>;

export const FORCE_KJ_MOL_ANGSTROM_PER_DALTON_TO_ACCELERATION_ANGSTROM_PER_PS2 = 100;
export const MAXIMUM_CONSTRAINED_VERLET_WORK_UNITS = 50_000_000;
export const MAXIMUM_FORCE_EVALUATION_WORK_UNITS = 20_000_000;
export const MAXIMUM_CONSTRAINT_JACOBIAN_RANK_WORK_UNITS = 20_000_000;

const DEFAULT_MAXIMUM_WORK_UNITS = 25_000_000;
const DEFAULT_MAXIMUM_FORCE_EVALUATION_WORK_UNITS = 1_000_000;
const DEFAULT_CONSTRAINT_IMPULSE_TOLERANCE = 1e-8;
const MAXIMUM_ABSOLUTE_IMAGE = 1_000_000_000;
const INTEGRATION_WORK_UNITS_PER_ATOM = 16;
const STABLE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const DEFAULT_CONSTRAINT_OPTIONS: RigidConstraintOptions = Object.freeze({
  positionToleranceAngstrom: 1e-10,
  velocityDerivativeToleranceAngstrom2PerPicosecond: 1e-10,
  maximumIterations: 1_000,
  momentumToleranceDaltonAngstromPerPicosecond: 1e-10,
  centerOfMassPositionToleranceAngstrom: 1e-10,
});

type CanonicalForceEvaluation = Readonly<{
  forceByAtomIdKjMolAngstrom: Readonly<Record<string, Vector3>>;
  potentialEnergyComponentsKjMol: Readonly<Record<string, number>>;
  potentialEnergyKjMol: number;
  workUnitsConsumed: number;
}>;

/**
 * Advances one transactional NVE step. Inputs and force contexts are never
 * mutated; any validation, callback, convergence, non-finite, or budget error
 * throws before a result object is exposed.
 */
export function stepConstrainedVelocityVerlet(
  cell: PeriodicCell,
  atoms: ReadonlyArray<RigidConstraintAtom>,
  constraints: ReadonlyArray<RigidDistanceConstraint>,
  evaluateForces: ConstrainedForceCallback,
  options: ConstrainedVelocityVerletOptions,
): ConstrainedVelocityVerletResult {
  if (!(cell instanceof PeriodicCell)) throw new TypeError('constrained Velocity Verlet requires a PeriodicCell');
  if (!Array.isArray(atoms) || atoms.length < 1) {
    throw new TypeError('constrained Velocity Verlet requires at least one atom');
  }
  if (!Array.isArray(constraints)) throw new TypeError('constraints must be an array');
  if (typeof evaluateForces !== 'function') throw new TypeError('force callback must be a function');
  if (!options || typeof options !== 'object') throw new TypeError('constrained Velocity Verlet options are required');
  assertAllowedKeys(options, [
    'constraintImpulseToleranceDaltonAngstromPerPicosecond',
    'constraintOptions',
    'evaluateConstraintJacobianRank',
    'maximumConstraintJacobianRankWorkUnits',
    'maximumForceEvaluationWorkUnits',
    'maximumWorkUnits',
    'timeStepPicoseconds',
  ], 'constrained Velocity Verlet options');
  if (atoms.length > MAXIMUM_RIGID_CONSTRAINT_ATOMS) {
    throw new Error(`atom count exceeds ${MAXIMUM_RIGID_CONSTRAINT_ATOMS}`);
  }
  if (constraints.length > MAXIMUM_RIGID_DISTANCE_CONSTRAINTS) {
    throw new Error(`constraint count exceeds ${MAXIMUM_RIGID_DISTANCE_CONSTRAINTS}`);
  }

  const timeStepPicoseconds = requirePositiveFinite(options.timeStepPicoseconds, 'timeStepPicoseconds');
  if (!Number.isFinite(1 / timeStepPicoseconds)) {
    throw new Error('timeStepPicoseconds is too small for a finite reciprocal');
  }
  const constraintOptions = resolveConstraintOptions(options.constraintOptions ?? {});
  const maximumWorkUnits = requireBoundedWorkUnits(
    options.maximumWorkUnits ?? DEFAULT_MAXIMUM_WORK_UNITS,
    'maximumWorkUnits',
    MAXIMUM_CONSTRAINED_VERLET_WORK_UNITS,
  );
  const maximumForceEvaluationWorkUnits = requireBoundedWorkUnits(
    options.maximumForceEvaluationWorkUnits ?? DEFAULT_MAXIMUM_FORCE_EVALUATION_WORK_UNITS,
    'maximumForceEvaluationWorkUnits',
    MAXIMUM_FORCE_EVALUATION_WORK_UNITS,
    true,
  );
  const maximumConstraintJacobianRankWorkUnits = requireBoundedWorkUnits(
    options.maximumConstraintJacobianRankWorkUnits ?? 0,
    'maximumConstraintJacobianRankWorkUnits',
    MAXIMUM_CONSTRAINT_JACOBIAN_RANK_WORK_UNITS,
    true,
  );
  if (options.evaluateConstraintJacobianRank !== undefined
    && typeof options.evaluateConstraintJacobianRank !== 'function') {
    throw new TypeError('evaluateConstraintJacobianRank must be a function');
  }
  if (options.evaluateConstraintJacobianRank && maximumConstraintJacobianRankWorkUnits === 0) {
    throw new Error('a constraint Jacobian rank callback requires a positive maximumConstraintJacobianRankWorkUnits');
  }
  const impulseTolerance = requirePositiveFinite(
    options.constraintImpulseToleranceDaltonAngstromPerPicosecond
      ?? DEFAULT_CONSTRAINT_IMPULSE_TOLERANCE,
    'constraintImpulseToleranceDaltonAngstromPerPicosecond',
  );

  const integrationWorkUnits = safeProduct(atoms.length, INTEGRATION_WORK_UNITS_PER_ATOM);
  const constraintProjectionWorkReserve = constraints.length === 0
    ? 0
    : safeProduct(
      atoms.length + constraints.length,
      4 + 2 * constraintOptions.maximumIterations,
    );
  const forceEvaluationWorkReserve = safeProduct(2, maximumForceEvaluationWorkUnits);
  const rankWorkReserve = constraints.length > 0 && options.evaluateConstraintJacobianRank
    ? maximumConstraintJacobianRankWorkUnits
    : 0;
  const preflightReservedWorkUnits = safeSum(
    integrationWorkUnits,
    constraintProjectionWorkReserve,
    forceEvaluationWorkReserve,
    rankWorkReserve,
  );
  if (preflightReservedWorkUnits > maximumWorkUnits) {
    throw new Error(
      `constrained Velocity Verlet preflight requires ${preflightReservedWorkUnits} work units, above budget ${maximumWorkUnits}`,
    );
  }
  if (constraints.length > 0) {
    const perProjectionWork = safeProduct(
      atoms.length + constraints.length,
      constraintOptions.maximumIterations,
    );
    if (perProjectionWork > MAXIMUM_RIGID_CONSTRAINT_WORK_UNITS) {
      throw new Error(
        `each rigid constraint projection would exceed ${MAXIMUM_RIGID_CONSTRAINT_WORK_UNITS} work units`,
      );
    }
  }

  const canonicalAtoms = canonicalizeAtoms(cell, atoms);
  const canonicalConstraints = cloneConstraints(constraints);
  const initialConstraintState = validateInitialConstraintManifold(
    cell,
    canonicalAtoms,
    canonicalConstraints,
    constraintOptions,
  );
  const degreeAudit = evaluateDegreesOfFreedom(
    cell,
    canonicalAtoms,
    canonicalConstraints,
    options.evaluateConstraintJacobianRank,
    maximumConstraintJacobianRankWorkUnits,
  );

  const initialForce = invokeForceCallback(
    evaluateForces,
    cell,
    canonicalAtoms,
    'initial',
    1,
    maximumForceEvaluationWorkUnits,
  );
  const halfKickAtoms = kick(canonicalAtoms, initialForce.forceByAtomIdKjMolAngstrom, timeStepPicoseconds / 2);
  const driftedAtoms = drift(cell, halfKickAtoms, timeStepPicoseconds);

  const shake = canonicalConstraints.length === 0
    ? noConstraintShake(driftedAtoms)
    : applyDiscreteRattlePositionConstraints(
      cell,
      canonicalAtoms,
      driftedAtoms,
      canonicalConstraints,
      constraintOptions,
    );
  const halfSynchronizedAtoms = synchronizeHalfVelocity(
    cell,
    driftedAtoms,
    shake.atoms,
    timeStepPicoseconds,
  );

  const finalForce = invokeForceCallback(
    evaluateForces,
    cell,
    halfSynchronizedAtoms,
    'final',
    2,
    maximumForceEvaluationWorkUnits,
  );
  const secondKickAtoms = kick(
    halfSynchronizedAtoms,
    finalForce.forceByAtomIdKjMolAngstrom,
    timeStepPicoseconds / 2,
  );
  const rattle = canonicalConstraints.length === 0
    ? noConstraintRattle(secondKickAtoms)
    : applyRattleVelocityConstraints(
      cell,
      secondKickAtoms,
      canonicalConstraints,
      constraintOptions,
    );

  const correctionAudit = auditConstraintCorrections(
    canonicalAtoms,
    halfKickAtoms,
    halfSynchronizedAtoms,
    secondKickAtoms,
    rattle.atoms,
    impulseTolerance,
  );
  const initialEnergy = energyState(canonicalAtoms, initialForce);
  const finalEnergy = energyState(rattle.atoms, finalForce);
  const constraintProjectionWorkUnits = canonicalConstraints.length === 0
    ? 0
    : safeProduct(
      canonicalAtoms.length + canonicalConstraints.length,
      4 + shake.iterations + rattle.iterations,
    );
  const forceEvaluationWorkUnits = safeSum(
    initialForce.workUnitsConsumed,
    finalForce.workUnitsConsumed,
  );
  const consumedWorkUnits = safeSum(
    integrationWorkUnits,
    forceEvaluationWorkUnits,
    constraintProjectionWorkUnits,
    degreeAudit.rankWorkUnitsConsumed,
  );
  if (consumedWorkUnits > maximumWorkUnits || consumedWorkUnits > preflightReservedWorkUnits) {
    throw new Error('constrained Velocity Verlet work accounting exceeded its preflight reservation');
  }

  return deepFreeze({
    algorithm: 'constrained-velocity-verlet-rattle',
    ensemble: 'NVE',
    timeStepPicoseconds,
    atomOrder: canonicalAtoms.map((atom) => atom.id),
    cell: {
      vectorsAngstrom: cell.vectorsAngstrom.map((vector) => ({ ...vector })) as unknown as CellVectors3,
      volumeAngstrom3: cell.volumeAngstrom3,
    },
    initial: {
      atoms: canonicalAtoms,
      forceByAtomIdKjMolAngstrom: initialForce.forceByAtomIdKjMolAngstrom,
      energy: initialEnergy,
    },
    final: {
      atoms: rattle.atoms,
      forceByAtomIdKjMolAngstrom: finalForce.forceByAtomIdKjMolAngstrom,
      energy: finalEnergy,
    },
    perAtomConstraintCorrection: correctionAudit.perAtom,
    constraintImpulseClosure: correctionAudit.closure,
    constraintKineticEnergyChangesKjMol: correctionAudit.kineticEnergyChanges,
    constraintNumericalWorkKjMol: {
      positionProjection: correctionAudit.kineticEnergyChanges.shake,
      finalVelocityProjection: correctionAudit.kineticEnergyChanges.rattle,
      total: correctionAudit.kineticEnergyChanges.total,
      interpretation: 'constraint-projection kinetic-energy change; not potential energy',
    },
    degreesOfFreedom: degreeAudit,
    constraintResiduals: {
      initialPositionAngstrom: initialConstraintState.maximumPositionResidualAngstrom,
      initialVelocityDerivativeAngstrom2PerPicosecond:
        initialConstraintState.maximumVelocityDerivativeResidualAngstrom2PerPicosecond,
      finalPositionAngstrom: shake.maximumPositionResidualAngstrom,
      finalVelocityDerivativeAngstrom2PerPicosecond:
        rattle.maximumVelocityDerivativeResidualAngstrom2PerPicosecond,
      shakeIterations: shake.iterations,
      rattleIterations: rattle.iterations,
      constraintOrder: shake.constraintOrder,
    },
    workBudget: {
      maximumWorkUnits,
      maximumForceEvaluationWorkUnits,
      maximumConstraintJacobianRankWorkUnits,
      preflightReservedWorkUnits,
      integrationWorkUnits,
      forceEvaluationWorkUnits,
      constraintJacobianRankWorkUnits: degreeAudit.rankWorkUnitsConsumed,
      constraintProjectionWorkUnits,
      consumedWorkUnits,
      remainingWorkUnits: maximumWorkUnits - consumedWorkUnits,
    },
    thermostat: null,
    barostat: null,
    constraintVirialKjMol: null,
    boundaries: [
      'NVE single-step kernel; no thermostat or barostat is applied.',
      'Constrained inputs must already satisfy the configured position and velocity-derivative manifolds.',
      'The caller must supply deterministic, pure, position-dependent force callbacks; this kernel validates outputs but cannot prove callback semantics.',
      'The production composer is responsible for an exact closed potential-component namespace; this kernel accepts finite stable-token components.',
      'Constraint impulses and kinetic-energy changes are audited; no constraint virial is claimed.',
      'The position multiplier follows discrete RATTLE: its mass-weighted correction direction is the constraint gradient at the beginning of the step, not a closest-point projection at the drifted position.',
      'Constraint Jacobian rank is reported only when there are no constraints or an explicit audited rank hook is supplied.',
      'This kernel does not choose a force field, electrostatics method, water model, or integration time step.',
    ],
  }) as ConstrainedVelocityVerletResult;
}

function validateInitialConstraintManifold(
  cell: PeriodicCell,
  atoms: ReadonlyArray<RigidConstraintAtom>,
  constraints: ReadonlyArray<RigidDistanceConstraint>,
  options: RigidConstraintOptions,
) {
  if (constraints.length === 0) {
    return {
      maximumPositionResidualAngstrom: 0,
      maximumVelocityDerivativeResidualAngstrom2PerPicosecond: 0,
    };
  }
  const validationOptions = { ...options, maximumIterations: 1 };
  let shake;
  try {
    shake = applyShakePositionConstraints(cell, atoms, constraints, validationOptions);
  } catch (error) {
    throw new Error(`initial constraint position validation failed: ${errorMessage(error)}`);
  }
  if (shake.iterations !== 0) {
    throw new Error('initial positions must already satisfy every SHAKE distance constraint');
  }
  let rattle;
  try {
    rattle = applyRattleVelocityConstraints(cell, atoms, constraints, validationOptions);
  } catch (error) {
    throw new Error(`initial constraint velocity validation failed: ${errorMessage(error)}`);
  }
  if (rattle.iterations !== 0) {
    throw new Error('initial velocities must already satisfy every RATTLE derivative constraint');
  }
  return {
    maximumPositionResidualAngstrom: shake.maximumPositionResidualAngstrom,
    maximumVelocityDerivativeResidualAngstrom2PerPicosecond:
      rattle.maximumVelocityDerivativeResidualAngstrom2PerPicosecond,
  };
}

function evaluateDegreesOfFreedom(
  cell: PeriodicCell,
  atoms: ReadonlyArray<RigidConstraintAtom>,
  constraints: ReadonlyArray<RigidDistanceConstraint>,
  callback: ConstraintJacobianRankCallback | undefined,
  maximumWorkUnits: number,
) {
  const cartesianCoordinateCount = safeProduct(atoms.length, 3);
  if (constraints.length === 0) {
    return Object.freeze({
      cartesianCoordinateCount,
      constraintJacobianRank: 0,
      constrainedCartesianCoordinateCount: cartesianCoordinateCount,
      rankMethod: 'analytic-no-constraints',
      rankWorkUnitsConsumed: 0,
    });
  }
  if (!callback) {
    return Object.freeze({
      cartesianCoordinateCount,
      constraintJacobianRank: null,
      constrainedCartesianCoordinateCount: null,
      rankMethod: null,
      rankWorkUnitsConsumed: 0,
    });
  }
  const rankAtoms = Object.freeze(atoms.map((atom) => Object.freeze({
    id: atom.id,
    massDalton: atom.massDalton,
    position: cloneAndFreezePosition(atom.position),
  })));
  const rankConstraints = Object.freeze(constraints.map((constraint) => Object.freeze({ ...constraint })));
  let evaluation: ConstraintJacobianRankEvaluation;
  try {
    evaluation = callback(Object.freeze({ cell, atoms: rankAtoms, constraints: rankConstraints }));
  } catch (error) {
    throw new Error(`constraint Jacobian rank callback failed: ${errorMessage(error)}`);
  }
  if (isThenable(evaluation)) {
    throw new Error('constraint Jacobian rank callback must be synchronous and must not return a Promise');
  }
  if (!evaluation || typeof evaluation !== 'object' || Array.isArray(evaluation)) {
    throw new Error('constraint Jacobian rank callback must return an evaluation object');
  }
  assertExactOwnStringKeys(
    evaluation,
    ['method', 'rank', 'workUnitsConsumed'],
    'constraint Jacobian rank evaluation',
  );
  const maximumRank = Math.min(constraints.length, cartesianCoordinateCount);
  if (!(Number.isSafeInteger(evaluation.rank) && evaluation.rank >= 0 && evaluation.rank <= maximumRank)) {
    throw new Error(`constraint Jacobian rank must be a safe integer in [0, ${maximumRank}]`);
  }
  if (!STABLE_TOKEN.test(evaluation.method)) {
    throw new Error('constraint Jacobian rank method must be a stable ASCII token');
  }
  const rankWorkUnitsConsumed = requireBoundedWorkUnits(
    evaluation.workUnitsConsumed,
    'constraint Jacobian rank workUnitsConsumed',
    maximumWorkUnits,
    true,
  );
  return Object.freeze({
    cartesianCoordinateCount,
    constraintJacobianRank: evaluation.rank,
    constrainedCartesianCoordinateCount: cartesianCoordinateCount - evaluation.rank,
    rankMethod: evaluation.method,
    rankWorkUnitsConsumed,
  });
}

function invokeForceCallback(
  callback: ConstrainedForceCallback,
  cell: PeriodicCell,
  atoms: ReadonlyArray<RigidConstraintAtom>,
  stage: 'initial' | 'final',
  evaluationOrdinal: 1 | 2,
  maximumWorkUnits: number,
): CanonicalForceEvaluation {
  const forceAtoms = Object.freeze(atoms.map((atom) => Object.freeze({
    id: atom.id,
    massDalton: atom.massDalton,
    position: cloneAndFreezePosition(atom.position),
  })));
  const context = Object.freeze({ stage, evaluationOrdinal, cell, atoms: forceAtoms });
  let evaluation: ConstrainedForceEvaluation;
  try {
    evaluation = callback(context);
  } catch (error) {
    throw new Error(`${stage} force callback failed: ${errorMessage(error)}`);
  }
  if (isThenable(evaluation)) {
    throw new Error(`${stage} force callback must be synchronous and must not return a Promise`);
  }
  if (!evaluation || typeof evaluation !== 'object' || Array.isArray(evaluation)) {
    throw new Error(`${stage} force callback must return an evaluation object`);
  }
  assertExactOwnStringKeys(
    evaluation,
    [
      'forceByAtomIdKjMolAngstrom',
      'potentialEnergyComponentsKjMol',
      'workUnitsConsumed',
    ],
    `${stage} force callback evaluation`,
  );
  const workUnitsConsumed = requireBoundedWorkUnits(
    evaluation.workUnitsConsumed,
    `${stage} force workUnitsConsumed`,
    maximumWorkUnits,
    true,
  );
  const forceByAtomId = canonicalForceRecord(
    evaluation.forceByAtomIdKjMolAngstrom,
    atoms,
    stage,
  );
  const potentialComponents = canonicalEnergyComponents(
    evaluation.potentialEnergyComponentsKjMol,
    stage,
  );
  const potentialEnergyKjMol = finiteSum(Object.values(potentialComponents), `${stage} potential energy`);
  return Object.freeze({
    forceByAtomIdKjMolAngstrom: forceByAtomId,
    potentialEnergyComponentsKjMol: potentialComponents,
    potentialEnergyKjMol,
    workUnitsConsumed,
  });
}

function canonicalForceRecord(
  value: Readonly<Record<string, Vector3>>,
  atoms: ReadonlyArray<RigidConstraintAtom>,
  stage: string,
) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${stage} forceByAtomIdKjMolAngstrom must be an object`);
  }
  const expected = atoms.map((atom) => atom.id);
  const actual = ownStringKeys(value, `${stage} force record`);
  if (actual.length !== expected.length || actual.some((id, index) => id !== expected[index])) {
    throw new Error(`${stage} force record must contain exactly one vector for every atom ID`);
  }
  const record: Record<string, Vector3> = {};
  for (const atom of atoms) {
    const force = value[atom.id];
    assertFiniteVector(force, `${stage} force for atom ${atom.id}`);
    const acceleration = scale(force, FORCE_KJ_MOL_ANGSTROM_PER_DALTON_TO_ACCELERATION_ANGSTROM_PER_PS2 / atom.massDalton);
    assertFiniteVector(acceleration, `${stage} acceleration for atom ${atom.id}`);
    record[atom.id] = Object.freeze({ x: force.x, y: force.y, z: force.z });
  }
  return Object.freeze(record);
}

function canonicalEnergyComponents(value: Readonly<Record<string, number>>, stage: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${stage} potentialEnergyComponentsKjMol must be an object`);
  }
  const record: Record<string, number> = {};
  for (const key of ownStringKeys(value, `${stage} potential-energy component record`)) {
    if (!STABLE_TOKEN.test(key)) throw new Error(`${stage} potential energy component keys must be stable ASCII tokens`);
    const energy = value[key];
    if (!Number.isFinite(energy)) throw new Error(`${stage} potential energy component ${key} must be finite`);
    record[key] = energy;
  }
  return Object.freeze(record);
}

function kick(
  atoms: ReadonlyArray<RigidConstraintAtom>,
  forceByAtomId: Readonly<Record<string, Vector3>>,
  halfTimeStepPicoseconds: number,
) {
  return freezeAtoms(atoms.map((atom) => {
    const acceleration = scale(
      forceByAtomId[atom.id],
      FORCE_KJ_MOL_ANGSTROM_PER_DALTON_TO_ACCELERATION_ANGSTROM_PER_PS2 / atom.massDalton,
    );
    const velocity = add(
      atom.velocityAngstromPerPicosecond,
      scale(acceleration, halfTimeStepPicoseconds),
    );
    assertFiniteVector(velocity, `kicked velocity for atom ${atom.id}`);
    return { ...atom, velocityAngstromPerPicosecond: velocity };
  }));
}

function drift(
  cell: PeriodicCell,
  atoms: ReadonlyArray<RigidConstraintAtom>,
  timeStepPicoseconds: number,
) {
  return freezeAtoms(atoms.map((atom) => {
    const displacementAngstrom = scale(atom.velocityAngstromPerPicosecond, timeStepPicoseconds);
    assertFiniteVector(displacementAngstrom, `drift displacement for atom ${atom.id}`);
    const displacementFractional = cell.cartesianVectorToFractional(displacementAngstrom);
    const localWrapped = cell.wrapFractional(add(atom.position.wrappedFractional, displacementFractional));
    const image = addBoundedImages(atom.position.image, localWrapped.image, atom.id);
    return {
      ...atom,
      position: {
        wrappedFractional: localWrapped.wrappedFractional,
        image,
      },
    };
  }));
}

type DiscretePositionConstraint = Readonly<{
  id: string;
  atomAId: string;
  atomBId: string;
  distanceAngstrom: number;
  atomAIndex: number;
  atomBIndex: number;
  /** Fixed \(q_n\) constraint-gradient direction from atom A to atom B. */
  referenceDisplacementAngstrom: Vector3;
}>;

/**
 * Solves the position half of discrete RATTLE for pair-distance constraints.
 *
 * For a current candidate bond r* and the beginning-of-step bond r_n, one
 * Gauss-Seidel correction uses
 *
 *   lambda = (|r*|^2 - d^2)
 *            / (2 (1/m_a + 1/m_b) (r* dot r_n))
 *   delta q_a = +(lambda/m_a) r_n
 *   delta q_b = -(lambda/m_b) r_n.
 *
 * The fixed r_n direction is the essential discrete-RATTLE invariant. Using
 * r* as the correction direction instead performs a closest-point projection;
 * that different map is dissipative for a freely rotating constrained pair and
 * is not time reversible. The nonlinear lambda-squared term is resolved by
 * deterministic iteration, as in Andersen's original RATTLE construction.
 */
function applyDiscreteRattlePositionConstraints(
  cell: PeriodicCell,
  beginningOfStepAtoms: ReadonlyArray<RigidConstraintAtom>,
  driftedAtoms: ReadonlyArray<RigidConstraintAtom>,
  constraints: ReadonlyArray<RigidDistanceConstraint>,
  options: RigidConstraintOptions,
) {
  const referenceIndexById = new Map(
    beginningOfStepAtoms.map((atom, index) => [atom.id, index] as const),
  );
  const driftedIndexById = new Map(
    driftedAtoms.map((atom, index) => [atom.id, index] as const),
  );
  if (referenceIndexById.size !== driftedIndexById.size
    || beginningOfStepAtoms.length !== driftedAtoms.length) {
    throw new Error('discrete RATTLE position solve requires identical beginning and drifted atom sets');
  }

  const preparedConstraints: ReadonlyArray<DiscretePositionConstraint> = Object.freeze(
    constraints.map((constraint) => {
      const atomAIndex = driftedIndexById.get(constraint.atomAId);
      const atomBIndex = driftedIndexById.get(constraint.atomBId);
      const referenceAtomAIndex = referenceIndexById.get(constraint.atomAId);
      const referenceAtomBIndex = referenceIndexById.get(constraint.atomBId);
      if (atomAIndex === undefined || atomBIndex === undefined
        || referenceAtomAIndex === undefined || referenceAtomBIndex === undefined) {
        throw new Error(`discrete RATTLE constraint ${constraint.id} references an unknown atom`);
      }
      if (atomAIndex !== referenceAtomAIndex || atomBIndex !== referenceAtomBIndex) {
        throw new Error('discrete RATTLE atom order changed between the beginning and drift stages');
      }
      const referenceDisplacementAngstrom = cell.minimumImageFromFractional(
        beginningOfStepAtoms[referenceAtomAIndex].position.wrappedFractional,
        beginningOfStepAtoms[referenceAtomBIndex].position.wrappedFractional,
      ).displacementAngstrom;
      assertFiniteVector(
        referenceDisplacementAngstrom,
        `discrete RATTLE reference displacement for constraint ${constraint.id}`,
      );
      const referenceDistanceSquared = dot(
        referenceDisplacementAngstrom,
        referenceDisplacementAngstrom,
      );
      if (!(Number.isFinite(referenceDistanceSquared) && referenceDistanceSquared > 0)) {
        throw new Error(`discrete RATTLE constraint ${constraint.id} has an unresolvable reference direction`);
      }
      return Object.freeze({
        ...constraint,
        atomAIndex,
        atomBIndex,
        referenceDisplacementAngstrom: Object.freeze({ ...referenceDisplacementAngstrom }),
      });
    }),
  );

  const mutable = driftedAtoms.map(cloneAtom);
  const iterationToleranceAngstrom = Math.max(
    Number.MIN_VALUE,
    options.positionToleranceAngstrom / 4,
  );
  let maximumResidual = maximumDiscretePositionResidual(
    cell,
    beginningOfStepAtoms,
    mutable,
    preparedConstraints,
  );
  if (maximumResidual <= iterationToleranceAngstrom) {
    return freezeDiscretePositionResult(
      mutable,
      0,
      maximumResidual,
      0,
      preparedConstraints,
    );
  }

  for (let iteration = 1; iteration <= options.maximumIterations; iteration += 1) {
    for (const constraint of preparedConstraints) {
      const atomA = mutable[constraint.atomAIndex];
      const atomB = mutable[constraint.atomBIndex];
      const currentDisplacement = discreteConstraintDisplacement(
        cell,
        beginningOfStepAtoms[constraint.atomAIndex],
        beginningOfStepAtoms[constraint.atomBIndex],
        atomA,
        atomB,
        constraint.referenceDisplacementAngstrom,
      );
      const currentDistanceSquared = dot(currentDisplacement, currentDisplacement);
      if (!(Number.isFinite(currentDistanceSquared) && currentDistanceSquared > 0)) {
        throw new Error(`discrete RATTLE constraint ${constraint.id} has an unresolvable candidate distance`);
      }
      const currentDistance = Math.sqrt(currentDistanceSquared);
      if (Math.abs(currentDistance - constraint.distanceAngstrom)
        <= iterationToleranceAngstrom) continue;

      const inverseMassA = 1 / atomA.massDalton;
      const inverseMassB = 1 / atomB.massDalton;
      const inverseMassSum = inverseMassA + inverseMassB;
      const gradientDot = dot(
        currentDisplacement,
        constraint.referenceDisplacementAngstrom,
      );
      const referenceDistanceSquared = dot(
        constraint.referenceDisplacementAngstrom,
        constraint.referenceDisplacementAngstrom,
      );
      const singularityTolerance = Math.max(
        Number.MIN_VALUE,
        Math.sqrt(currentDistanceSquared * referenceDistanceSquared),
      ) * Number.EPSILON * 128;
      if (!(Number.isFinite(gradientDot) && Math.abs(gradientDot) > singularityTolerance)) {
        throw new Error(
          `discrete RATTLE constraint ${constraint.id} has a singular current/reference gradient denominator`,
        );
      }
      const denominator = 2 * inverseMassSum * gradientDot;
      const constraintValue = currentDistanceSquared
        - constraint.distanceAngstrom * constraint.distanceAngstrom;
      const lagrangeMultiplier = constraintValue / denominator;
      if (!Number.isFinite(lagrangeMultiplier)) {
        throw new Error(`discrete RATTLE constraint ${constraint.id} produced a non-finite position multiplier`);
      }
      const correctionA = scale(
        constraint.referenceDisplacementAngstrom,
        inverseMassA * lagrangeMultiplier,
      );
      const correctionB = scale(
        constraint.referenceDisplacementAngstrom,
        -inverseMassB * lagrangeMultiplier,
      );
      assertFiniteVector(correctionA, `discrete RATTLE correction for atom ${atomA.id}`);
      assertFiniteVector(correctionB, `discrete RATTLE correction for atom ${atomB.id}`);
      mutable[constraint.atomAIndex] = {
        ...atomA,
        position: translatePosition(cell, atomA.position, correctionA, atomA.id),
      };
      mutable[constraint.atomBIndex] = {
        ...atomB,
        position: translatePosition(cell, atomB.position, correctionB, atomB.id),
      };
    }

    maximumResidual = maximumDiscretePositionResidual(
      cell,
      beginningOfStepAtoms,
      mutable,
      preparedConstraints,
    );
    if (maximumResidual <= iterationToleranceAngstrom) {
      const maximumCenterOfMassPositionChangeAngstrom = maximumProjectionCenterOfMassChange(
        cell,
        driftedAtoms,
        mutable,
        preparedConstraints,
      );
      if (maximumCenterOfMassPositionChangeAngstrom
        > options.centerOfMassPositionToleranceAngstrom) {
        throw new Error(
          `discrete RATTLE position solve changed a mass-weighted component COM position by ${maximumCenterOfMassPositionChangeAngstrom}, above the explicit tolerance`,
        );
      }
      return freezeDiscretePositionResult(
        mutable,
        iteration,
        maximumResidual,
        maximumCenterOfMassPositionChangeAngstrom,
        preparedConstraints,
      );
    }
  }

  throw new Error(
    `SHAKE constraints did not converge after ${options.maximumIterations} iterations; maximum position residual ${maximumResidual}`,
  );
}

function maximumDiscretePositionResidual(
  cell: PeriodicCell,
  referenceAtoms: ReadonlyArray<RigidConstraintAtom>,
  currentAtoms: ReadonlyArray<RigidConstraintAtom>,
  constraints: ReadonlyArray<DiscretePositionConstraint>,
) {
  let maximumResidual = 0;
  for (const constraint of constraints) {
    const displacement = discreteConstraintDisplacement(
      cell,
      referenceAtoms[constraint.atomAIndex],
      referenceAtoms[constraint.atomBIndex],
      currentAtoms[constraint.atomAIndex],
      currentAtoms[constraint.atomBIndex],
      constraint.referenceDisplacementAngstrom,
    );
    const distance = magnitude(displacement);
    if (!Number.isFinite(distance)) {
      throw new Error(`discrete RATTLE constraint ${constraint.id} residual became non-finite`);
    }
    const minimumImageDistance = cell.minimumImageFromFractional(
      currentAtoms[constraint.atomAIndex].position.wrappedFractional,
      currentAtoms[constraint.atomBIndex].position.wrappedFractional,
    ).distanceAngstrom;
    maximumResidual = Math.max(
      maximumResidual,
      Math.abs(distance - constraint.distanceAngstrom),
      Math.abs(minimumImageDistance - constraint.distanceAngstrom),
    );
  }
  return maximumResidual;
}

function discreteConstraintDisplacement(
  cell: PeriodicCell,
  referenceAtomA: RigidConstraintAtom,
  referenceAtomB: RigidConstraintAtom,
  currentAtomA: RigidConstraintAtom,
  currentAtomB: RigidConstraintAtom,
  referenceDisplacement: Vector3,
) {
  const displacement = add(
    referenceDisplacement,
    subtract(
      localPositionDelta(cell, referenceAtomB.position, currentAtomB.position),
      localPositionDelta(cell, referenceAtomA.position, currentAtomA.position),
    ),
  );
  assertFiniteVector(displacement, 'discrete RATTLE continuous-branch displacement');
  return displacement;
}

function maximumProjectionCenterOfMassChange(
  cell: PeriodicCell,
  beforeProjectionAtoms: ReadonlyArray<RigidConstraintAtom>,
  afterProjectionAtoms: ReadonlyArray<RigidConstraintAtom>,
  constraints: ReadonlyArray<DiscretePositionConstraint>,
) {
  const adjacency = beforeProjectionAtoms.map(() => [] as number[]);
  for (const constraint of constraints) {
    adjacency[constraint.atomAIndex].push(constraint.atomBIndex);
    adjacency[constraint.atomBIndex].push(constraint.atomAIndex);
  }
  const visited = new Set<number>();
  let maximumChange = 0;
  for (let start = 0; start < beforeProjectionAtoms.length; start += 1) {
    if (visited.has(start) || adjacency[start].length === 0) continue;
    const queue = [start];
    visited.add(start);
    let totalMass = 0;
    let massWeightedCorrection = zero();
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const atomIndex = queue[cursor];
      const before = beforeProjectionAtoms[atomIndex];
      const after = afterProjectionAtoms[atomIndex];
      totalMass += before.massDalton;
      massWeightedCorrection = add(
        massWeightedCorrection,
        scale(
          localPositionDelta(cell, before.position, after.position),
          before.massDalton,
        ),
      );
      for (const neighbor of adjacency[atomIndex]) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          queue.push(neighbor);
        }
      }
    }
    const centerOfMassChange = magnitude(scale(massWeightedCorrection, 1 / totalMass));
    if (!Number.isFinite(centerOfMassChange)) {
      throw new Error('discrete RATTLE component COM audit became non-finite');
    }
    maximumChange = Math.max(maximumChange, centerOfMassChange);
  }
  return maximumChange;
}

function freezeDiscretePositionResult(
  atoms: ReadonlyArray<RigidConstraintAtom>,
  iterations: number,
  maximumPositionResidualAngstrom: number,
  maximumCenterOfMassPositionChangeAngstrom: number,
  constraints: ReadonlyArray<DiscretePositionConstraint>,
) {
  return Object.freeze({
    atoms: freezeAtoms(atoms),
    iterations,
    maximumPositionResidualAngstrom,
    maximumCenterOfMassPositionChangeAngstrom,
    constraintOrder: Object.freeze(constraints.map((constraint) => constraint.id)),
  });
}

function translatePosition(
  cell: PeriodicCell,
  position: WrappedPeriodicPosition,
  displacementAngstrom: Vector3,
  atomId: string,
): WrappedPeriodicPosition {
  const displacementFractional = cell.cartesianVectorToFractional(displacementAngstrom);
  const localWrapped = cell.wrapFractional(add(position.wrappedFractional, displacementFractional));
  return {
    wrappedFractional: localWrapped.wrappedFractional,
    image: addBoundedImages(position.image, localWrapped.image, atomId),
  };
}

function synchronizeHalfVelocity(
  cell: PeriodicCell,
  driftedAtoms: ReadonlyArray<RigidConstraintAtom>,
  projectedAtoms: ReadonlyArray<RigidConstraintAtom>,
  timeStepPicoseconds: number,
) {
  const driftedById = new Map(driftedAtoms.map((atom) => [atom.id, atom]));
  return freezeAtoms(projectedAtoms.map((projected) => {
    const drifted = driftedById.get(projected.id);
    if (!drifted) throw new Error(`SHAKE returned unknown atom ${projected.id}`);
    const correctionDisplacement = localPositionDelta(cell, drifted.position, projected.position);
    const velocity = add(
      drifted.velocityAngstromPerPicosecond,
      scale(correctionDisplacement, 1 / timeStepPicoseconds),
    );
    assertFiniteVector(velocity, `SHAKE-synchronized half velocity for atom ${projected.id}`);
    return { ...projected, velocityAngstromPerPicosecond: velocity };
  }));
}

function auditConstraintCorrections(
  initialAtoms: ReadonlyArray<RigidConstraintAtom>,
  halfKickAtoms: ReadonlyArray<RigidConstraintAtom>,
  halfSynchronizedAtoms: ReadonlyArray<RigidConstraintAtom>,
  secondKickAtoms: ReadonlyArray<RigidConstraintAtom>,
  finalAtoms: ReadonlyArray<RigidConstraintAtom>,
  tolerance: number,
) {
  const halfKickById = new Map(halfKickAtoms.map((atom) => [atom.id, atom]));
  const halfSynchronizedById = new Map(halfSynchronizedAtoms.map((atom) => [atom.id, atom]));
  const secondKickById = new Map(secondKickAtoms.map((atom) => [atom.id, atom]));
  const finalById = new Map(finalAtoms.map((atom) => [atom.id, atom]));
  const perAtom: Record<string, PerAtomConstraintCorrection> = {};
  let shakeTotal = zero();
  let rattleTotal = zero();

  for (const atom of initialAtoms) {
    const halfKick = requireAtom(halfKickById, atom.id, 'half-kick');
    const halfSynchronized = requireAtom(halfSynchronizedById, atom.id, 'SHAKE synchronization');
    const secondKick = requireAtom(secondKickById, atom.id, 'second half-kick');
    const final = requireAtom(finalById, atom.id, 'RATTLE');
    const shakeVelocity = subtract(
      halfSynchronized.velocityAngstromPerPicosecond,
      halfKick.velocityAngstromPerPicosecond,
    );
    const rattleVelocity = subtract(
      final.velocityAngstromPerPicosecond,
      secondKick.velocityAngstromPerPicosecond,
    );
    const totalVelocity = add(shakeVelocity, rattleVelocity);
    const shakeImpulse = scale(shakeVelocity, atom.massDalton);
    const rattleImpulse = scale(rattleVelocity, atom.massDalton);
    const totalImpulse = add(shakeImpulse, rattleImpulse);
    for (const [label, vector] of [
      ['SHAKE velocity correction', shakeVelocity],
      ['RATTLE velocity correction', rattleVelocity],
      ['total velocity correction', totalVelocity],
      ['SHAKE constraint impulse', shakeImpulse],
      ['RATTLE constraint impulse', rattleImpulse],
      ['total constraint impulse', totalImpulse],
    ] as const) assertFiniteVector(vector, `${label} for atom ${atom.id}`);
    shakeTotal = add(shakeTotal, shakeImpulse);
    rattleTotal = add(rattleTotal, rattleImpulse);
    perAtom[atom.id] = deepFreeze({
      shakeVelocityCorrectionAngstromPerPicosecond: shakeVelocity,
      rattleVelocityCorrectionAngstromPerPicosecond: rattleVelocity,
      totalVelocityCorrectionAngstromPerPicosecond: totalVelocity,
      shakeMassWeightedConstraintImpulseDaltonAngstromPerPicosecond: shakeImpulse,
      rattleMassWeightedConstraintImpulseDaltonAngstromPerPicosecond: rattleImpulse,
      totalMassWeightedConstraintImpulseDaltonAngstromPerPicosecond: totalImpulse,
    }) as PerAtomConstraintCorrection;
  }

  const combinedTotal = add(shakeTotal, rattleTotal);
  const shakeNorm = magnitude(shakeTotal);
  const rattleNorm = magnitude(rattleTotal);
  const combinedNorm = magnitude(combinedTotal);
  if (![shakeNorm, rattleNorm, combinedNorm].every(Number.isFinite)) {
    throw new Error('constraint impulse closure became non-finite');
  }
  if (Math.max(shakeNorm, rattleNorm, combinedNorm) > tolerance) {
    throw new Error(
      `constraint impulse closure residual ${Math.max(shakeNorm, rattleNorm, combinedNorm)} exceeds tolerance ${tolerance}`,
    );
  }

  const shakeKineticChange = kineticEnergy(halfSynchronizedAtoms) - kineticEnergy(halfKickAtoms);
  const rattleKineticChange = kineticEnergy(finalAtoms) - kineticEnergy(secondKickAtoms);
  const totalKineticChange = shakeKineticChange + rattleKineticChange;
  if (![shakeKineticChange, rattleKineticChange, totalKineticChange].every(Number.isFinite)) {
    throw new Error('constraint kinetic-energy audit became non-finite');
  }
  return {
    perAtom: Object.freeze(perAtom),
    closure: deepFreeze({
      shakeTotalDaltonAngstromPerPicosecond: shakeTotal,
      shakeResidualNormDaltonAngstromPerPicosecond: shakeNorm,
      rattleTotalDaltonAngstromPerPicosecond: rattleTotal,
      rattleResidualNormDaltonAngstromPerPicosecond: rattleNorm,
      combinedTotalDaltonAngstromPerPicosecond: combinedTotal,
      combinedResidualNormDaltonAngstromPerPicosecond: combinedNorm,
      toleranceDaltonAngstromPerPicosecond: tolerance,
    }) as ConstraintImpulseClosure,
    kineticEnergyChanges: Object.freeze({
      shake: shakeKineticChange,
      rattle: rattleKineticChange,
      total: totalKineticChange,
    }),
  };
}

function energyState(
  atoms: ReadonlyArray<RigidConstraintAtom>,
  force: CanonicalForceEvaluation,
): ConstrainedEnergyState {
  const kineticEnergyKjMol = kineticEnergy(atoms);
  const totalEnergyKjMol = kineticEnergyKjMol + force.potentialEnergyKjMol;
  if (!Number.isFinite(totalEnergyKjMol)) throw new Error('total energy became non-finite');
  return Object.freeze({
    kineticEnergyKjMol,
    potentialEnergyKjMol: force.potentialEnergyKjMol,
    totalEnergyKjMol,
    potentialEnergyComponentsKjMol: force.potentialEnergyComponentsKjMol,
  });
}

function kineticEnergy(atoms: ReadonlyArray<RigidConstraintAtom>) {
  return finiteSum(atoms.map((atom) => {
    const speedSquared = dot(
      atom.velocityAngstromPerPicosecond,
      atom.velocityAngstromPerPicosecond,
    );
    return 0.005 * atom.massDalton * speedSquared;
  }), 'kinetic energy');
}

function noConstraintShake(atoms: ReadonlyArray<RigidConstraintAtom>) {
  return {
    atoms,
    iterations: 0,
    maximumPositionResidualAngstrom: 0,
    maximumCenterOfMassPositionChangeAngstrom: 0,
    constraintOrder: Object.freeze([] as string[]),
  };
}

function noConstraintRattle(atoms: ReadonlyArray<RigidConstraintAtom>) {
  return {
    atoms,
    iterations: 0,
    maximumVelocityDerivativeResidualAngstrom2PerPicosecond: 0,
    centerOfMassMomentumChangeDaltonAngstromPerPicosecond: 0,
    constraintOrder: Object.freeze([] as string[]),
  };
}

function canonicalizeAtoms(cell: PeriodicCell, atoms: ReadonlyArray<RigidConstraintAtom>) {
  const ids = new Set<string>();
  const canonical = atoms.map((atom) => {
    if (!atom || typeof atom !== 'object') throw new Error('each atom must be an object');
    if (!STABLE_TOKEN.test(atom.id) || ids.has(atom.id)) {
      throw new Error('atom IDs must be unique stable ASCII tokens');
    }
    ids.add(atom.id);
    if (!(Number.isFinite(atom.massDalton) && atom.massDalton > 0
      && Number.isFinite(1 / atom.massDalton))) {
      throw new Error(`atom ${atom.id} mass and inverse mass must be finite and positive`);
    }
    assertFiniteVector(atom.velocityAngstromPerPicosecond, `atom ${atom.id} velocity`);
    assertFiniteVector(
      scale(atom.velocityAngstromPerPicosecond, atom.massDalton),
      `atom ${atom.id} momentum`,
    );
    cell.wrappedCartesian(atom.position);
    return cloneAtom(atom);
  }).sort((left, right) => compareAscii(left.id, right.id));
  kineticEnergy(canonical);
  return freezeAtoms(canonical);
}

function cloneConstraints(constraints: ReadonlyArray<RigidDistanceConstraint>) {
  return Object.freeze(constraints
    .map((constraint) => Object.freeze({ ...constraint }))
    .sort((left, right) => {
      const leftPair = [left.atomAId, left.atomBId].sort(compareAscii);
      const rightPair = [right.atomAId, right.atomBId].sort(compareAscii);
      return compareAscii(leftPair[0], rightPair[0])
        || compareAscii(leftPair[1], rightPair[1])
        || compareAscii(left.id, right.id);
    }));
}

function resolveConstraintOptions(overrides: Partial<RigidConstraintOptions>): RigidConstraintOptions {
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) {
    throw new Error('constraintOptions must be an object');
  }
  assertAllowedKeys(overrides, [
    'centerOfMassPositionToleranceAngstrom',
    'maximumIterations',
    'momentumToleranceDaltonAngstromPerPicosecond',
    'positionToleranceAngstrom',
    'velocityDerivativeToleranceAngstrom2PerPicosecond',
  ], 'constraintOptions');
  const options = { ...DEFAULT_CONSTRAINT_OPTIONS, ...overrides };
  requirePositiveFinite(options.positionToleranceAngstrom, 'positionToleranceAngstrom');
  requirePositiveFinite(
    options.velocityDerivativeToleranceAngstrom2PerPicosecond,
    'velocityDerivativeToleranceAngstrom2PerPicosecond',
  );
  requirePositiveFinite(
    options.momentumToleranceDaltonAngstromPerPicosecond,
    'momentumToleranceDaltonAngstromPerPicosecond',
  );
  requirePositiveFinite(
    options.centerOfMassPositionToleranceAngstrom,
    'centerOfMassPositionToleranceAngstrom',
  );
  if (!(Number.isSafeInteger(options.maximumIterations)
    && options.maximumIterations >= 1
    && options.maximumIterations <= MAXIMUM_RIGID_CONSTRAINT_ITERATIONS)) {
    throw new Error(`maximumIterations must be in [1, ${MAXIMUM_RIGID_CONSTRAINT_ITERATIONS}]`);
  }
  return Object.freeze(options);
}

function localPositionDelta(
  cell: PeriodicCell,
  from: WrappedPeriodicPosition,
  to: WrappedPeriodicPosition,
) {
  const imageDelta = subtractImages(to.image, from.image);
  const fractionalDelta = {
    x: imageDelta.x + to.wrappedFractional.x - from.wrappedFractional.x,
    y: imageDelta.y + to.wrappedFractional.y - from.wrappedFractional.y,
    z: imageDelta.z + to.wrappedFractional.z - from.wrappedFractional.z,
  };
  const delta = cell.latticeVector(fractionalDelta);
  assertFiniteVector(delta, 'local SHAKE position correction');
  return delta;
}

function addBoundedImages(left: Int3, right: Int3, atomId: string): Int3 {
  const result = { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
  if (![result.x, result.y, result.z].every(
    (component) => Number.isSafeInteger(component) && Math.abs(component) <= MAXIMUM_ABSOLUTE_IMAGE,
  )) {
    throw new Error(`drift for atom ${atomId} exceeded the bounded periodic image domain`);
  }
  return result;
}

function subtractImages(left: Int3, right: Int3): Int3 {
  const result = { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
  if (![result.x, result.y, result.z].every(Number.isSafeInteger)) {
    throw new Error('periodic image delta exceeded the safe integer domain');
  }
  return result;
}

function cloneAtom(atom: RigidConstraintAtom): RigidConstraintAtom {
  return {
    id: atom.id,
    massDalton: atom.massDalton,
    position: {
      wrappedFractional: { ...atom.position.wrappedFractional },
      image: { ...atom.position.image },
    },
    velocityAngstromPerPicosecond: { ...atom.velocityAngstromPerPicosecond },
  };
}

function freezeAtoms(atoms: ReadonlyArray<RigidConstraintAtom>) {
  return Object.freeze(atoms.map((atom) => Object.freeze({
    id: atom.id,
    massDalton: atom.massDalton,
    position: cloneAndFreezePosition(atom.position),
    velocityAngstromPerPicosecond: Object.freeze({ ...atom.velocityAngstromPerPicosecond }),
  })));
}

function cloneAndFreezePosition(position: WrappedPeriodicPosition): WrappedPeriodicPosition {
  return Object.freeze({
    wrappedFractional: Object.freeze({ ...position.wrappedFractional }),
    image: Object.freeze({ ...position.image }),
  });
}

function requireAtom(
  atoms: ReadonlyMap<string, RigidConstraintAtom>,
  atomId: string,
  stage: string,
) {
  const atom = atoms.get(atomId);
  if (!atom) throw new Error(`${stage} result omitted atom ${atomId}`);
  return atom;
}

function requirePositiveFinite(value: number, label: string) {
  if (!(Number.isFinite(value) && value > 0)) throw new Error(`${label} must be finite and positive`);
  return value;
}

function requireBoundedWorkUnits(
  value: number,
  label: string,
  maximum: number,
  allowZero = false,
) {
  const minimum = allowZero ? 0 : 1;
  if (!(Number.isSafeInteger(value) && value >= minimum && value <= maximum)) {
    throw new Error(`${label} must be a safe integer in [${minimum}, ${maximum}]`);
  }
  return value;
}

function safeProduct(...values: number[]) {
  const product = values.reduce((result, value) => result * value, 1);
  if (!Number.isSafeInteger(product)) throw new Error('work-unit multiplication exceeded the safe integer domain');
  return product;
}

function safeSum(...values: number[]) {
  const sum = values.reduce((result, value) => result + value, 0);
  if (!Number.isSafeInteger(sum)) throw new Error('work-unit addition exceeded the safe integer domain');
  return sum;
}

function finiteSum(values: ReadonlyArray<number>, label: string) {
  let sum = 0;
  let compensation = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) throw new Error(`${label} contains a non-finite term`);
    const adjusted = value - compensation;
    const next = sum + adjusted;
    compensation = (next - sum) - adjusted;
    sum = next;
  }
  if (!Number.isFinite(sum)) throw new Error(`${label} sum became non-finite`);
  return sum;
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return Boolean(value && typeof value === 'object' && 'then' in value
    && typeof (value as { then?: unknown }).then === 'function');
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function assertFiniteVector(vector: Vector3, label: string) {
  const ownKeys = isPlainRecord(vector) ? Reflect.ownKeys(vector) : [];
  const keys = ownKeys.every((key): key is string => typeof key === 'string')
    ? ownKeys.sort(compareAscii)
    : [];
  if (!vector
    || keys.length !== 3
    || keys[0] !== 'x'
    || keys[1] !== 'y'
    || keys[2] !== 'z'
    || ![vector.x, vector.y, vector.z].every(Number.isFinite)) {
    throw new Error(`${label} must contain finite x, y and z components and exactly those keys`);
  }
}

function assertAllowedKeys(value: object, allowed: ReadonlyArray<string>, label: string) {
  assertPlainRecord(value, label);
  const allowedSet = new Set(allowed);
  const unsupported = Reflect.ownKeys(value).filter(
    (key) => typeof key !== 'string' || !allowedSet.has(key),
  );
  if (unsupported.length > 0) {
    throw new Error(`${label} contains an unsupported key`);
  }
}

function assertExactOwnStringKeys(
  value: object,
  expected: ReadonlyArray<string>,
  label: string,
) {
  const actual = ownStringKeys(value, label);
  const locked = [...expected].sort(compareAscii);
  if (actual.length !== locked.length
    || actual.some((key, index) => key !== locked[index])) {
    throw new Error(`${label} must contain exactly the locked own string keys`);
  }
}

function ownStringKeys(value: object, label: string) {
  assertPlainRecord(value, label);
  const keys = Reflect.ownKeys(value);
  if (!keys.every((key): key is string => typeof key === 'string')) {
    throw new Error(`${label} must not contain symbol keys`);
  }
  return keys.sort(compareAscii);
}

function assertPlainRecord(value: object, label: string) {
  if (!isPlainRecord(value)) {
    throw new Error(`${label} must be a plain record without inherited application fields`);
  }
}

function isPlainRecord(value: unknown): value is Record<PropertyKey, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function compareAscii(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function zero(): Vector3 {
  return { x: 0, y: 0, z: 0 };
}

function add(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function subtract(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function scale(vector: Vector3, scalar: number): Vector3 {
  return { x: vector.x * scalar, y: vector.y * scalar, z: vector.z * scalar };
}

function dot(left: Vector3, right: Vector3) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function magnitude(vector: Vector3) {
  return Math.sqrt(dot(vector, vector));
}

function deepFreeze<T>(value: T): T {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}
