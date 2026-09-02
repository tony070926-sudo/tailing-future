import type { Vector3 } from '../molecular/molecular-interactions.ts';
import { AMBER14_TIP3P_PARAMETERS_V042 } from './amber14-tip3p-parameters.ts';
import {
  evaluateAqueousForceFieldV042,
  type AqueousForceFieldEvaluationV042,
} from './aqueous-force-field.ts';
import {
  canonicalizeAqueousTopology,
  type AqueousAtomTopologyV042,
  type AqueousTopologyV042,
} from './aqueous-topology.ts';
import {
  stepConstrainedVelocityVerlet,
  type ConstraintJacobianRankContext,
  type ConstrainedVelocityVerletResult,
} from './constrained-velocity-verlet.ts';
import { digestValue, shortDigest } from './digest.ts';
import { PeriodicCell, type CellVectors3, type WrappedPeriodicPosition } from './periodic-cell.ts';
import {
  applyRattleVelocityConstraints,
  applyShakePositionConstraints,
  type RigidConstraintAtom,
} from './rigid-constraints.ts';

/**
 * Small, solver-driven v0.4.2 integration fixture. It is deliberately named a
 * finite-size integration calibration: two waters and one ion pair cannot
 * represent a bulk or dilute NaCl solution.
 */

export const AQUEOUS_DYNAMICS_TIME_STEP_PS_V042 = 0.001 as const;
export const AQUEOUS_DYNAMICS_TEMPERATURE_DOF_V042 = 15 as const;
export const AQUEOUS_DYNAMICS_CONSTRAINT_JACOBIAN_RANK_TOLERANCE_V042 = 1e-12 as const;

const POSITION_TOLERANCE_ANGSTROM = 1e-10;
const VELOCITY_DERIVATIVE_TOLERANCE = 1e-10;
const MINIMUM_NONEXCLUDED_DISTANCE_ANGSTROM = 1.25;
const MAXIMUM_RELATIVE_ENERGY_EXCURSION = 1e-3;
const MOMENTUM_RESIDUAL_LIMIT = 2e-8;
const INTERNAL_FORCE_RESIDUAL_LIMIT = 1e-10;
const MAXIMUM_FORCE_WORK_UNITS = 500_000;
const MAXIMUM_STEP_WORK_UNITS = 1_100_000;
const MAXIMUM_RANK_WORK_UNITS = 1_000;
const MAXIMUM_INTEGRATOR_WORK_UNITS = MAXIMUM_STEP_WORK_UNITS - 2 * MAXIMUM_RANK_WORK_UNITS;
const CONSTRAINT_IMPULSE_TOLERANCE_DALTON_ANGSTROM_PER_PICOSECOND = 1e-8;
const RANK_METHOD = 'numeric-minimum-image-g2-scaled-partial-pivot-v1' as const;
const RANK_ATOM_COUNT = 8;
const RANK_CONSTRAINT_COUNT = 6;
const RANK_CARTESIAN_COORDINATE_COUNT = 24;

const WORLD_BOUNDARIES = Object.freeze([
  'This is an eight-atom NaCl-TIP3P finite-size integration calibration, not a bulk, dilute, thermodynamic-limit, or chemical-reaction claim.',
  'Forces are produced only by the local direct-Ewald, selected intramolecular correction, and plain-cutoff Lorentz-Berthelot reference composer.',
  'The fixed 0.001 ps NVE step uses the local discrete constrained Velocity Verlet/RATTLE kernel; no thermostat or barostat is present.',
  'No OpenMM, PME, SPME, PPPM, AMBER engine, electronic-structure solver, or external checkpoint has been executed or reproduced.',
  'Complete Ewald virial is unavailable, so pressure and stress remain null rather than being inferred from incomplete components.',
  'The initial state must already satisfy all position and velocity constraints; the world never silently repairs it.',
  'Constraint rank is evaluated from the numerical 6 x 24 Jacobian of g_ij=|minimum-image(r_j-r_i)|^2-d_ij^2 by deterministic scaled partial pivoting.',
  'SHA-256 digests bind deterministic local payloads; they are not signatures, authenticity evidence, or license clearance.',
]);

export type AqueousDynamicsAdvanceRequestV042 = Readonly<{
  kind: 'advance';
  substeps: 1;
}>;

export type AqueousDynamicsConstraintJacobianRankReceiptV042 = Readonly<{
  constraintDefinition: 'g=minimum-image-distance-squared-minus-target-distance-squared';
  matrixRows: 6;
  matrixColumns: 24;
  method: typeof RANK_METHOD;
  relativePivotTolerance: typeof AQUEOUS_DYNAMICS_CONSTRAINT_JACOBIAN_RANK_TOLERANCE_V042;
  rank: number;
  workUnitsConsumed: number;
  workUnitModel: 'scalar-matrix-write-inspection-and-elimination-v1';
}>;

export type AqueousDynamicsAtomStateV042 = Readonly<{
  id: string;
  position: WrappedPeriodicPosition;
  velocityAngstromPerPicosecond: Vector3;
}>;

export type AqueousDynamicsConfigurationV042 = Readonly<{
  schemaVersion: 'tf.aqueous-dynamics-configuration/0.4.2';
  worldId: 'nacl-tip3p-finite-size-calibration';
  cell: Readonly<{
    originAngstrom: Vector3;
    vectorsAngstrom: CellVectors3;
    volumeAngstrom3: number;
    periodicAxes: readonly [true, true, true];
  }>;
  topologyDigest: string;
  topology: AqueousTopologyV042;
  integration: Readonly<{
    algorithm: 'constrained-velocity-verlet-rattle';
    ensemble: 'NVE';
    fixedTimeStepPicoseconds: 0.001;
    constraintOptions: ReturnType<typeof constraintOptions>;
    constraintImpulseToleranceDaltonAngstromPerPicosecond: number;
    constraintJacobianRankRelativePivotTolerance:
      typeof AQUEOUS_DYNAMICS_CONSTRAINT_JACOBIAN_RANK_TOLERANCE_V042;
    maximumForceEvaluationWorkUnits: number;
    maximumIntegratorWorkUnits: number;
    maximumStepWorkUnits: number;
    maximumConstraintJacobianRankWorkUnits: number;
  }>;
  validityGates: Readonly<{
    minimumNonexcludedDistanceAngstrom: number;
    maximumRelativeEnergyExcursion: number;
    momentumResidualLimit: number;
    internalForceResidualLimit: number;
    massResidualLimitDalton: 0;
    chargeResidualLimitE: 0;
  }>;
  degreesOfFreedom: Readonly<{
    atomCount: 8;
    cartesianCoordinateCount: 24;
    constraintCount: 6;
    constraintJacobianRank: 6;
    centerOfMassRemovedDegreesOfFreedom: 3;
    temperatureDegreesOfFreedom: 15;
    rankMethod: typeof RANK_METHOD;
    rankWorkUnitsConsumed: number;
  }>;
}>;

export type AqueousDynamicsEnergyStatisticsV042 = Readonly<{
  sampleCount: number;
  timeSumPicoseconds: number;
  energySumKjMol: number;
  timeSquaredSumPicoseconds2: number;
  timeEnergySumKjMolPicoseconds: number;
  maximumAbsoluteExcursionKjMol: number;
  maximumAbsoluteExcursionStep: number;
  maximumRelativeExcursion: number;
  maximumRelativeExcursionStep: number;
  linearDriftSlopeKjMolPerPicosecond: number;
  linearRelativeDriftRatePerPicosecond: number;
}>;

export type AqueousDynamicsComposerEvaluationReceiptV042 = Readonly<{
  stage: 'initial' | 'final';
  evaluationOrdinal: 1 | 2;
  canonicalPositionDigest: string;
  topologyDigest: string;
  configurationDigest: string;
  evaluationDigest: string;
  forceNamespaceDigest: string;
  energyNamespaceDigest: string;
  workUnitsConsumed: number;
  workReceiptDigest: string;
  constraintJacobianRankReceipt: AqueousDynamicsConstraintJacobianRankReceiptV042 &
    Readonly<{ rank: 6 }>;
}>;

export type AqueousDynamicsIntegrationReceiptV042 = Readonly<{
  schemaVersion: 'tf.aqueous-dynamics-integration-receipt/0.4.2';
  fromStep: number;
  toStep: number;
  topologyDigest: string;
  configurationDigest: string;
  integratorResultDigest: string;
  initialEvaluation: AqueousDynamicsComposerEvaluationReceiptV042;
  finalEvaluation: AqueousDynamicsComposerEvaluationReceiptV042;
  workReceipt: Readonly<{
    solverIntegratorWorkUnits: number;
    composerEndpointRankAuditWorkUnits: number;
    totalIntegrationWorkUnits: number;
    maximumIntegrationWorkUnits: number;
    withinBudget: true;
    boundary: 'covers-integrator-and-two-composer-endpoint-rank-audits; observation-recomputation-is-receipted-separately';
  }>;
  receiptDigest: string;
}>;

export type AqueousDynamicsStateV042 = Readonly<{
  schemaVersion: 'tf.aqueous-dynamics-world-state/0.4.2';
  status: 'solver-driven-finite-size-integration-calibration';
  worldId: 'nacl-tip3p-finite-size-calibration';
  stateId: string;
  stateDigest: string;
  physicalDigest: string;
  parentStateId: string | null;
  revision: number;
  step: number;
  timePicoseconds: number;
  configurationDigest: string;
  topologyDigest: string;
  configuration: AqueousDynamicsConfigurationV042;
  atoms: ReadonlyArray<AqueousDynamicsAtomStateV042>;
  initialTotalEnergyKjMol: number;
  initialMassDalton: number;
  initialChargeE: number;
  initialMomentumDaltonAngstromPerPicosecond: Vector3;
  energyReferenceKjMol: number;
  energyStatistics: AqueousDynamicsEnergyStatisticsV042;
  lastIntegrationReceipt: AqueousDynamicsIntegrationReceiptV042 | null;
  lastAction: Readonly<{
    kind: 'advance';
    substeps: 1;
    fixedTimeStepPicoseconds: 0.001;
    parentStateId: string;
    resultingStateId: string;
    actionDigest: string;
  }> | null;
}>;

export type AqueousDynamicsObservationV042 = Readonly<{
  schemaVersion: 'tf.aqueous-dynamics-observation/0.4.2';
  status: 'solver-driven-finite-size-integration-calibration';
  observationDigest: string;
  worldId: 'nacl-tip3p-finite-size-calibration';
  stateId: string;
  stateDigest: string;
  physicalDigest: string;
  parentStateId: string | null;
  step: number;
  timePicoseconds: number;
  configurationDigest: string;
  topologyDigest: string;
  topology: AqueousTopologyV042;
  cell: Readonly<{
    vectorsAngstrom: CellVectors3;
    volumeAngstrom3: number;
    periodicAxes: readonly [true, true, true];
  }>;
  atoms: ReadonlyArray<AqueousDynamicsAtomStateV042 & Readonly<{
    element: string;
    massDalton: number;
    chargeE: number;
    wrappedPositionAngstrom: Vector3;
    unwrappedPositionAngstrom: Vector3;
    forceKjMolAngstrom: Vector3;
  }>>;
  forceField: AqueousForceFieldEvaluationV042;
  energy: Readonly<{
    ewaldRealSpaceKjMol: number;
    ewaldReciprocalSpaceKjMol: number;
    ewaldSelfCorrectionKjMol: number;
    coulombExceptionCorrectionKjMol: number;
    lennardJonesKjMol: number;
    constraintEnergyKjMol: null;
    kineticKjMol: number;
    potentialKjMol: number;
    totalKjMol: number;
    initialTotalKjMol: number;
    absoluteExcursionKjMol: number;
    relativeExcursion: number;
  }>;
  energyStatistics: AqueousDynamicsEnergyStatisticsV042;
  constraints: Readonly<{
    count: 6;
    jacobianRank: 6;
    rankMethod: typeof RANK_METHOD;
    rankRelativePivotTolerance:
      typeof AQUEOUS_DYNAMICS_CONSTRAINT_JACOBIAN_RANK_TOLERANCE_V042;
    rankWorkUnitsConsumed: number;
    maximumPositionResidualAngstrom: number;
    maximumVelocityDerivativeResidualAngstrom2PerPicosecond: number;
    energyBoundary: 'holonomic-constraint-is-not-a-potential-energy-term';
  }>;
  integration: Readonly<{
    algorithm: 'constrained-velocity-verlet-rattle';
    ensemble: 'NVE';
    fixedTimeStepPicoseconds: 0.001;
    lastStepResultDigest: string | null;
    lastStepSolverWorkUnitsConsumed: number;
    lastStepComposerEndpointRankAuditWorkUnitsConsumed: number;
    lastStepWorkUnitsConsumed: number;
    lastStepWorkUnitsLimit: number;
    lastStepConstraintImpulseResidual: number;
    lastIntegrationReceipt: AqueousDynamicsIntegrationReceiptV042 | null;
  }>;
  thermodynamics: Readonly<{
    atomCount: 8;
    cartesianCoordinateCount: 24;
    constraintDegreesOfFreedom: 6;
    centerOfMassRemovedDegreesOfFreedom: 3;
    temperatureDegreesOfFreedom: 15;
    kineticFrame: 'center-of-mass';
    temperatureKelvin: number;
  }>;
  mechanicalObservables: Readonly<{
    pressureBar: null;
    totalStressKjMolAngstrom3: null;
    boundary: 'unavailable-complete-ewald-virial-not-implemented';
  }>;
  conservation: Readonly<{
    totalMassDalton: number;
    massResidualDalton: number;
    totalChargeE: number;
    chargeResidualE: number;
    totalMomentumDaltonAngstromPerPicosecond: Vector3;
    momentumResidual: number;
    internalForceResidualKjMolAngstrom: number;
  }>;
  periodicGeometry: Readonly<{
    rigidWaterCount: 2;
    waterMoleculesStraddlingBoundary: number;
    minimumNonexcludedPairDistanceAngstrom: number;
  }>;
  numericalValidity: Readonly<{
    status: 'pass';
    positionConstraintToleranceAngstrom: number;
    velocityConstraintToleranceAngstrom2PerPicosecond: number;
    minimumNonexcludedDistanceAngstrom: number;
    maximumRelativeEnergyExcursion: number;
    momentumResidualLimit: number;
    internalForceResidualLimit: number;
    forceWorkUnitsConsumed: number;
    forceWorkUnitsLimit: number;
  }>;
  provenance: Readonly<{
    solver: 'tf-aqueous-dynamics-world';
    solverVersion: '0.4.2';
    evidenceRole: 'local-finite-size-integration-calibration';
    externalEngineExecuted: false;
    openmmReproduction: false;
    bulkOrDiluteClaim: false;
    chemicalReactionClaim: false;
  }>;
  boundaries: ReadonlyArray<string>;
}>;

type MutableBackup = {
  atoms: RigidConstraintAtom[];
  step: number;
  stateId: string;
  stateDigest: string;
  physicalDigest: string;
  parentStateId: string | null;
  revision: number;
  lastAction: AqueousDynamicsStateV042['lastAction'];
  lastStepResult: ConstrainedVelocityVerletResult | null;
  energyStatistics: AqueousDynamicsEnergyStatisticsV042;
  lastIntegrationReceipt: AqueousDynamicsIntegrationReceiptV042 | null;
};

type CapturedComposerEvaluation = Readonly<{
  receipt: AqueousDynamicsComposerEvaluationReceiptV042;
  evaluation: AqueousForceFieldEvaluationV042;
}>;

export class AqueousDynamicsWorldV042 {
  readonly worldId = 'nacl-tip3p-finite-size-calibration' as const;
  readonly configuration: AqueousDynamicsConfigurationV042;
  readonly configurationDigest: string;
  readonly topology: AqueousTopologyV042;
  readonly topologyDigest: string;
  readonly cell: PeriodicCell;
  #atoms: RigidConstraintAtom[];
  #step = 0;
  #revision = 0;
  #parentStateId: string | null = null;
  #stateId = '';
  #stateDigest = '';
  #physicalDigest = '';
  #lastAction: AqueousDynamicsStateV042['lastAction'] = null;
  #lastStepResult: ConstrainedVelocityVerletResult | null = null;
  #lastIntegrationReceipt: AqueousDynamicsIntegrationReceiptV042 | null = null;
  readonly #initialTotalEnergyKjMol: number;
  readonly #initialMassDalton: number;
  readonly #initialChargeE: number;
  readonly #initialMomentum: Vector3;
  readonly #energyReferenceKjMol: number;
  #energyStatistics: AqueousDynamicsEnergyStatisticsV042;
  #advanceInProgress = false;

  constructor() {
    this.cell = createCalibrationCell();
    this.topology = createCalibrationTopology();
    this.topologyDigest = this.topology.topologyDigest;
    this.#atoms = createInitialAtoms(this.cell, this.topology);
    assertFixedFixture(this.topology, this.#atoms);
    const initialRankReceipt = requireFullConstraintJacobianRank(
      this.cell,
      this.#atoms,
      this.topology.constraints,
      'aqueous dynamics initial state',
    );
    this.configuration = createDynamicsConfiguration(
      this.worldId,
      this.cell,
      this.topology,
      initialRankReceipt,
    );
    this.configurationDigest = digestValue(this.configuration);
    const constraintAudit = auditConstraintManifold(this.cell, this.#atoms, this.topology);
    if (constraintAudit.shakeIterations !== 0 || constraintAudit.rattleIterations !== 0) {
      throw new Error('aqueous dynamics initial state is not already on the exact constraint manifold');
    }
    const forceField = this.#evaluateForceField(this.#atoms);
    this.#initialTotalEnergyKjMol = forceField.energyKjMol.total + kineticEnergyKjMol(this.#atoms);
    this.#initialMassDalton = this.topology.atoms.reduce((sum, atom) => sum + atom.massDalton, 0);
    this.#initialChargeE = this.topology.atoms.reduce((sum, atom) => sum + atom.chargeE, 0);
    this.#initialMomentum = deepFreeze(totalMomentum(this.#atoms));
    this.#energyReferenceKjMol = Math.max(1, Math.abs(this.#initialTotalEnergyKjMol));
    this.#energyStatistics = initialEnergyStatistics(this.#initialTotalEnergyKjMol);
    this.#refreshIdentity();
    this.observe();
    Object.freeze(this);
  }

  get stepCount() { return this.#step; }

  advance(request: AqueousDynamicsAdvanceRequestV042 = { kind: 'advance', substeps: 1 }) {
    if (this.#advanceInProgress) {
      throw new Error('aqueous dynamics advance is not reentrant');
    }
    this.#advanceInProgress = true;
    try {
      const action = copyExactOwnDataRecord(
        request,
        ['kind', 'substeps'],
        'aqueous dynamics advance request',
      );
      if (action.kind !== 'advance' || action.substeps !== 1) {
        throw new Error('aqueous dynamics advance is locked to exactly one 0.001 ps substep');
      }
      const backup = this.#capture();
      const parentStateId = this.#stateId;
      try {
        const integrated = this.#integrateOneStep();
        const { result } = integrated;
        this.#atoms = result.final.atoms.map(cloneRigidAtom);
        this.#lastStepResult = result;
        this.#lastIntegrationReceipt = integrated.receipt;
        this.#step += 1;
        this.#recordEnergySample(integrated.finalComposerTotalEnergyKjMol);
        this.#revision += 1;
        this.#parentStateId = parentStateId;
        this.#physicalDigest = this.#computePhysicalDigest();
        this.#stateId = this.#computeStateId();
        const actionPayload = {
          kind: 'advance' as const,
          substeps: 1 as const,
          fixedTimeStepPicoseconds: AQUEOUS_DYNAMICS_TIME_STEP_PS_V042,
          parentStateId,
          resultingStateId: this.#stateId,
        };
        this.#lastAction = deepFreeze({ ...actionPayload, actionDigest: digestValue(actionPayload) });
        this.#stateDigest = this.#computeStateDigest();
        const observation = this.observe();
        this.#assertObservation(observation);
        return observation;
      } catch (error) {
        this.#restore(backup);
        throw error;
      }
    } finally {
      this.#advanceInProgress = false;
    }
  }

  observe(): AqueousDynamicsObservationV042 {
    const forceField = this.#evaluateForceField(this.#atoms);
    const constraintRankReceipt = requireFullConstraintJacobianRank(
      this.cell,
      this.#atoms,
      this.topology.constraints,
      'aqueous dynamics observed endpoint',
    );
    this.#assertObservedForceFieldMatchesLatestIntegration(forceField, constraintRankReceipt);
    const constraintAudit = auditConstraintManifold(this.cell, this.#atoms, this.topology);
    const kineticKjMol = kineticEnergyKjMol(this.#atoms);
    const totalKjMol = forceField.energyKjMol.total + kineticKjMol;
    const absoluteExcursionKjMol = Math.abs(totalKjMol - this.#initialTotalEnergyKjMol);
    const topologyById = new Map(this.topology.atoms.map((atom) => [atom.id, atom]));
    const totalMomentumValue = totalMomentum(this.#atoms);
    const minimumPairDistance = minimumNonexcludedPairDistance(this.cell, this.#atoms, this.topology);
    const payload = {
      schemaVersion: 'tf.aqueous-dynamics-observation/0.4.2' as const,
      status: 'solver-driven-finite-size-integration-calibration' as const,
      worldId: this.worldId,
      stateId: this.#stateId,
      stateDigest: this.#stateDigest,
      physicalDigest: this.#physicalDigest,
      parentStateId: this.#parentStateId,
      step: this.#step,
      timePicoseconds: this.#step * AQUEOUS_DYNAMICS_TIME_STEP_PS_V042,
      configurationDigest: this.configurationDigest,
      topologyDigest: this.topologyDigest,
      topology: this.topology,
      cell: {
        vectorsAngstrom: cloneCellVectors(this.cell.vectorsAngstrom),
        volumeAngstrom3: this.cell.volumeAngstrom3,
        periodicAxes: [true, true, true] as const,
      },
      atoms: this.#atoms.map((atom) => {
        const topologyAtom = requireMap(topologyById, atom.id, 'aqueous topology atom');
        return {
          id: atom.id,
          element: topologyAtom.element,
          massDalton: atom.massDalton,
          chargeE: topologyAtom.chargeE,
          position: clonePosition(atom.position),
          velocityAngstromPerPicosecond: cloneVector(atom.velocityAngstromPerPicosecond),
          wrappedPositionAngstrom: this.cell.wrappedCartesian(atom.position),
          unwrappedPositionAngstrom: this.cell.unwrappedCartesian(atom.position),
          forceKjMolAngstrom: cloneVector(forceField.forceByAtomIdKjMolAngstrom[atom.id]),
        };
      }),
      forceField,
      energy: {
        ewaldRealSpaceKjMol: forceField.energyKjMol.ewaldRealSpace,
        ewaldReciprocalSpaceKjMol: forceField.energyKjMol.ewaldReciprocalSpace,
        ewaldSelfCorrectionKjMol: forceField.energyKjMol.ewaldSelfCorrection,
        coulombExceptionCorrectionKjMol: forceField.energyKjMol.coulombExceptionCorrection,
        lennardJonesKjMol: forceField.energyKjMol.lennardJonesFinal,
        constraintEnergyKjMol: null,
        kineticKjMol,
        potentialKjMol: forceField.energyKjMol.total,
        totalKjMol,
        initialTotalKjMol: this.#initialTotalEnergyKjMol,
        absoluteExcursionKjMol,
        relativeExcursion: absoluteExcursionKjMol / this.#energyReferenceKjMol,
      },
      energyStatistics: { ...this.#energyStatistics },
      constraints: {
        count: 6 as const,
        jacobianRank: constraintRankReceipt.rank,
        rankMethod: constraintRankReceipt.method,
        rankRelativePivotTolerance: constraintRankReceipt.relativePivotTolerance,
        rankWorkUnitsConsumed: constraintRankReceipt.workUnitsConsumed,
        maximumPositionResidualAngstrom: constraintAudit.maximumPositionResidualAngstrom,
        maximumVelocityDerivativeResidualAngstrom2PerPicosecond:
          constraintAudit.maximumVelocityDerivativeResidualAngstrom2PerPicosecond,
        energyBoundary: 'holonomic-constraint-is-not-a-potential-energy-term' as const,
      },
      integration: {
        algorithm: 'constrained-velocity-verlet-rattle' as const,
        ensemble: 'NVE' as const,
        fixedTimeStepPicoseconds: AQUEOUS_DYNAMICS_TIME_STEP_PS_V042,
        lastStepResultDigest: this.#lastStepResult ? digestValue(this.#lastStepResult) : null,
        lastStepSolverWorkUnitsConsumed:
          this.#lastIntegrationReceipt?.workReceipt.solverIntegratorWorkUnits ?? 0,
        lastStepComposerEndpointRankAuditWorkUnitsConsumed:
          this.#lastIntegrationReceipt?.workReceipt.composerEndpointRankAuditWorkUnits ?? 0,
        lastStepWorkUnitsConsumed:
          this.#lastIntegrationReceipt?.workReceipt.totalIntegrationWorkUnits ?? 0,
        lastStepWorkUnitsLimit: MAXIMUM_STEP_WORK_UNITS,
        lastStepConstraintImpulseResidual:
          this.#lastStepResult?.constraintImpulseClosure.combinedResidualNormDaltonAngstromPerPicosecond ?? 0,
        lastIntegrationReceipt: this.#lastIntegrationReceipt
          ? structuredClone(this.#lastIntegrationReceipt)
          : null,
      },
      thermodynamics: {
        atomCount: 8 as const,
        cartesianCoordinateCount: 24 as const,
        constraintDegreesOfFreedom: 6 as const,
        centerOfMassRemovedDegreesOfFreedom: 3 as const,
        temperatureDegreesOfFreedom: AQUEOUS_DYNAMICS_TEMPERATURE_DOF_V042,
        kineticFrame: 'center-of-mass' as const,
        temperatureKelvin: 2 * centerOfMassKineticEnergyKjMol(this.#atoms)
          / (AQUEOUS_DYNAMICS_TEMPERATURE_DOF_V042 * 0.008_314_462_618_153_24),
      },
      mechanicalObservables: {
        pressureBar: null,
        totalStressKjMolAngstrom3: null,
        boundary: 'unavailable-complete-ewald-virial-not-implemented' as const,
      },
      conservation: {
        totalMassDalton: this.topology.atoms.reduce((sum, atom) => sum + atom.massDalton, 0),
        massResidualDalton: Math.abs(
          this.topology.atoms.reduce((sum, atom) => sum + atom.massDalton, 0) - this.#initialMassDalton,
        ),
        totalChargeE: this.topology.atoms.reduce((sum, atom) => sum + atom.chargeE, 0),
        chargeResidualE: Math.abs(
          this.topology.atoms.reduce((sum, atom) => sum + atom.chargeE, 0) - this.#initialChargeE,
        ),
        totalMomentumDaltonAngstromPerPicosecond: totalMomentumValue,
        momentumResidual: magnitude(subtract(totalMomentumValue, this.#initialMomentum)),
        internalForceResidualKjMolAngstrom: magnitude(forceField.netForceKjMolAngstrom),
      },
      periodicGeometry: {
        rigidWaterCount: 2 as const,
        waterMoleculesStraddlingBoundary: countBoundaryStraddlingWaters(this.cell, this.#atoms, this.topology),
        minimumNonexcludedPairDistanceAngstrom: minimumPairDistance,
      },
      numericalValidity: {
        status: 'pass' as const,
        positionConstraintToleranceAngstrom: POSITION_TOLERANCE_ANGSTROM,
        velocityConstraintToleranceAngstrom2PerPicosecond: VELOCITY_DERIVATIVE_TOLERANCE,
        minimumNonexcludedDistanceAngstrom: MINIMUM_NONEXCLUDED_DISTANCE_ANGSTROM,
        maximumRelativeEnergyExcursion: MAXIMUM_RELATIVE_ENERGY_EXCURSION,
        momentumResidualLimit: MOMENTUM_RESIDUAL_LIMIT,
        internalForceResidualLimit: INTERNAL_FORCE_RESIDUAL_LIMIT,
        forceWorkUnitsConsumed: forceField.workReceipt.totalWorkUnitsConsumed,
        forceWorkUnitsLimit: MAXIMUM_FORCE_WORK_UNITS,
      },
      provenance: {
        solver: 'tf-aqueous-dynamics-world' as const,
        solverVersion: '0.4.2' as const,
        evidenceRole: 'local-finite-size-integration-calibration' as const,
        externalEngineExecuted: false as const,
        openmmReproduction: false as const,
        bulkOrDiluteClaim: false as const,
        chemicalReactionClaim: false as const,
      },
      boundaries: [...WORLD_BOUNDARIES],
    };
    const observation = deepFreeze({ ...payload, observationDigest: digestValue(payload) });
    this.#assertObservation(observation);
    return observation;
  }

  serialize(): AqueousDynamicsStateV042 {
    const state = deepFreeze({ ...this.#statePayload(), stateDigest: this.#stateDigest });
    this.#assertSerializedState(state);
    return state;
  }

  #integrateOneStep() {
    const captured: CapturedComposerEvaluation[] = [];
    const result = stepConstrainedVelocityVerlet(
      this.cell,
      this.#atoms,
      this.topology.constraints,
      ({ atoms, stage, evaluationOrdinal }) => {
        const constraintJacobianRankReceipt = requireFullConstraintJacobianRank(
          this.cell,
          atoms,
          this.topology.constraints,
          `aqueous dynamics ${stage} force callback endpoint`,
        );
        const evaluated = this.#evaluateForceField(atoms.map((atom) => ({
          ...atom,
          velocityAngstromPerPicosecond: zero(),
        })));
        const potentialEnergyComponentsKjMol = potentialEnergyNamespace(evaluated);
        const forceByAtomIdKjMolAngstrom = evaluated.forceByAtomIdKjMolAngstrom;
        const receipt = deepFreeze({
          stage,
          evaluationOrdinal,
          canonicalPositionDigest: canonicalPositionDigestFromEvaluation(evaluated),
          topologyDigest: evaluated.topologyDigest,
          configurationDigest: this.configurationDigest,
          evaluationDigest: evaluated.evaluationDigest,
          forceNamespaceDigest: digestValue(forceByAtomIdKjMolAngstrom),
          energyNamespaceDigest: digestValue(potentialEnergyComponentsKjMol),
          workUnitsConsumed: evaluated.workReceipt.totalWorkUnitsConsumed,
          workReceiptDigest: digestValue(evaluated.workReceipt),
          constraintJacobianRankReceipt,
        }) as AqueousDynamicsComposerEvaluationReceiptV042;
        captured.push({ receipt, evaluation: evaluated });
        return {
          forceByAtomIdKjMolAngstrom: evaluated.forceByAtomIdKjMolAngstrom,
          potentialEnergyComponentsKjMol,
          workUnitsConsumed: evaluated.workReceipt.totalWorkUnitsConsumed,
        };
      },
      {
        timeStepPicoseconds: AQUEOUS_DYNAMICS_TIME_STEP_PS_V042,
        constraintOptions: constraintOptions(),
        maximumWorkUnits: MAXIMUM_INTEGRATOR_WORK_UNITS,
        maximumForceEvaluationWorkUnits: MAXIMUM_FORCE_WORK_UNITS,
        maximumConstraintJacobianRankWorkUnits: MAXIMUM_RANK_WORK_UNITS,
        evaluateConstraintJacobianRank: ({ cell, atoms, constraints }) => {
          const receipt = requireFullConstraintJacobianRank(
            cell,
            atoms,
            constraints,
            'aqueous dynamics integrator rank callback endpoint',
          );
          return {
            rank: receipt.rank,
            method: receipt.method,
            workUnitsConsumed: receipt.workUnitsConsumed,
          };
        },
        constraintImpulseToleranceDaltonAngstromPerPicosecond:
          CONSTRAINT_IMPULSE_TOLERANCE_DALTON_ANGSTROM_PER_PICOSECOND,
      },
    );
    if (captured.length !== 2
      || captured[0].receipt.stage !== 'initial' || captured[0].receipt.evaluationOrdinal !== 1
      || captured[1].receipt.stage !== 'final' || captured[1].receipt.evaluationOrdinal !== 2) {
      throw new Error('aqueous dynamics integrator did not produce the locked two-stage composer receipt');
    }
    validateComposerReceiptAgainstEndpoint(
      captured[0],
      result.initial,
      result,
      this.topologyDigest,
      this.configurationDigest,
    );
    validateComposerReceiptAgainstEndpoint(
      captured[1],
      result.final,
      result,
      this.topologyDigest,
      this.configurationDigest,
    );
    if (captured[0].receipt.workUnitsConsumed + captured[1].receipt.workUnitsConsumed
      !== result.workBudget.forceEvaluationWorkUnits) {
      throw new Error('aqueous dynamics composer work receipts do not close to the integrator force budget');
    }
    const composerEndpointRankAuditWorkUnits = safeWorkSum(
      captured[0].receipt.constraintJacobianRankReceipt.workUnitsConsumed,
      captured[1].receipt.constraintJacobianRankReceipt.workUnitsConsumed,
    );
    const totalIntegrationWorkUnits = safeWorkSum(
      result.workBudget.consumedWorkUnits,
      composerEndpointRankAuditWorkUnits,
    );
    if (totalIntegrationWorkUnits > MAXIMUM_STEP_WORK_UNITS) {
      throw new Error('aqueous dynamics integration and endpoint audit work exceeded the locked budget');
    }
    const integratorResultDigest = digestValue(result);
    const receiptPayload = {
      schemaVersion: 'tf.aqueous-dynamics-integration-receipt/0.4.2' as const,
      fromStep: this.#step,
      toStep: this.#step + 1,
      topologyDigest: this.topologyDigest,
      configurationDigest: this.configurationDigest,
      integratorResultDigest,
      initialEvaluation: captured[0].receipt,
      finalEvaluation: captured[1].receipt,
      workReceipt: {
        solverIntegratorWorkUnits: result.workBudget.consumedWorkUnits,
        composerEndpointRankAuditWorkUnits,
        totalIntegrationWorkUnits,
        maximumIntegrationWorkUnits: MAXIMUM_STEP_WORK_UNITS,
        withinBudget: true as const,
        boundary: 'covers-integrator-and-two-composer-endpoint-rank-audits; observation-recomputation-is-receipted-separately' as const,
      },
    };
    const receipt = deepFreeze({
      ...receiptPayload,
      receiptDigest: digestValue(receiptPayload),
    }) as AqueousDynamicsIntegrationReceiptV042;
    const finalComposerTotalEnergyKjMol = captured[1].evaluation.energyKjMol.total
      + kineticEnergyKjMol(result.final.atoms);
    if (!Number.isFinite(finalComposerTotalEnergyKjMol)) {
      throw new Error('aqueous dynamics final composer total energy became non-finite');
    }
    return { result, receipt, finalComposerTotalEnergyKjMol };
  }

  #evaluateForceField(atoms: ReadonlyArray<Pick<RigidConstraintAtom, 'id' | 'position'>>) {
    return evaluateAqueousForceFieldV042(
      this.topology,
      this.cell,
      atoms.map((atom) => ({ id: atom.id, position: atom.position })),
    );
  }

  #recordEnergySample(totalEnergyKjMol: number) {
    if (!Number.isFinite(totalEnergyKjMol)) {
      throw new Error('aqueous dynamics energy statistics require a finite total energy');
    }
    const timePicoseconds = this.#step * AQUEOUS_DYNAMICS_TIME_STEP_PS_V042;
    const absoluteExcursionKjMol = Math.abs(totalEnergyKjMol - this.#initialTotalEnergyKjMol);
    const isNewMaximum = absoluteExcursionKjMol
      > this.#energyStatistics.maximumAbsoluteExcursionKjMol;
    const regressionSums = {
      sampleCount: this.#energyStatistics.sampleCount + 1,
      timeSumPicoseconds: this.#energyStatistics.timeSumPicoseconds + timePicoseconds,
      energySumKjMol: this.#energyStatistics.energySumKjMol + totalEnergyKjMol,
      timeSquaredSumPicoseconds2:
        this.#energyStatistics.timeSquaredSumPicoseconds2 + timePicoseconds ** 2,
      timeEnergySumKjMolPicoseconds:
        this.#energyStatistics.timeEnergySumKjMolPicoseconds
        + timePicoseconds * totalEnergyKjMol,
      maximumAbsoluteExcursionKjMol: isNewMaximum
        ? absoluteExcursionKjMol
        : this.#energyStatistics.maximumAbsoluteExcursionKjMol,
      maximumAbsoluteExcursionStep: isNewMaximum
        ? this.#step
        : this.#energyStatistics.maximumAbsoluteExcursionStep,
    };
    const linearDriftSlopeKjMolPerPicosecond = energyDriftSlope(regressionSums);
    this.#energyStatistics = deepFreeze({
      ...regressionSums,
      maximumRelativeExcursion:
        regressionSums.maximumAbsoluteExcursionKjMol / this.#energyReferenceKjMol,
      maximumRelativeExcursionStep: regressionSums.maximumAbsoluteExcursionStep,
      linearDriftSlopeKjMolPerPicosecond,
      linearRelativeDriftRatePerPicosecond:
        linearDriftSlopeKjMolPerPicosecond / this.#energyReferenceKjMol,
    });
  }

  #assertObservedForceFieldMatchesLatestIntegration(
    forceField: AqueousForceFieldEvaluationV042,
    constraintJacobianRankReceipt: AqueousDynamicsConstraintJacobianRankReceiptV042 &
      Readonly<{ rank: 6 }>,
  ) {
    if (this.#step === 0) {
      if (this.#lastIntegrationReceipt !== null) {
        throw new Error('aqueous dynamics initial state cannot carry an integration receipt');
      }
      return;
    }
    const integration = this.#lastIntegrationReceipt;
    if (!integration || integration.fromStep !== this.#step - 1 || integration.toStep !== this.#step
      || integration.configurationDigest !== this.configurationDigest
      || integration.topologyDigest !== this.topologyDigest) {
      throw new Error('aqueous dynamics latest integration receipt does not bind the current state');
    }
    const final = integration.finalEvaluation;
    if (final.stage !== 'final' || final.evaluationOrdinal !== 2
      || final.configurationDigest !== this.configurationDigest
      || final.topologyDigest !== this.topologyDigest
      || final.evaluationDigest !== forceField.evaluationDigest
      || final.canonicalPositionDigest !== canonicalPositionDigestFromEvaluation(forceField)
      || final.forceNamespaceDigest !== digestValue(forceField.forceByAtomIdKjMolAngstrom)
      || final.energyNamespaceDigest !== digestValue(potentialEnergyNamespace(forceField))
      || final.workUnitsConsumed !== forceField.workReceipt.totalWorkUnitsConsumed
      || final.workReceiptDigest !== digestValue(forceField.workReceipt)
      || !sameConstraintJacobianRankReceipt(
        final.constraintJacobianRankReceipt,
        constraintJacobianRankReceipt,
      )) {
      throw new Error('aqueous dynamics observed force field does not match the final composer receipt');
    }
  }

  #assertObservation(observation: AqueousDynamicsObservationV042) {
    if (!allFiniteOrNull(observation)) throw new Error('aqueous dynamics observation contains a non-finite number');
    if (observation.stateId !== this.#stateId
      || observation.stateDigest !== this.#stateDigest
      || observation.physicalDigest !== this.#physicalDigest
      || digestValue(this.#statePayload()) !== this.#stateDigest
      || observation.configurationDigest !== this.configurationDigest
      || digestValue(this.configuration) !== this.configurationDigest
      || this.configuration.topologyDigest !== this.topologyDigest) {
      throw new Error('aqueous dynamics state or configuration digest binding failed');
    }
    if (observation.constraints.maximumPositionResidualAngstrom > POSITION_TOLERANCE_ANGSTROM
      || observation.constraints.maximumVelocityDerivativeResidualAngstrom2PerPicosecond
        > VELOCITY_DERIVATIVE_TOLERANCE) {
      throw new Error('aqueous dynamics constraint residual exceeded the locked tolerance');
    }
    if (observation.energyStatistics.maximumRelativeExcursion
      > MAXIMUM_RELATIVE_ENERGY_EXCURSION) {
      throw new Error('aqueous dynamics NVE energy excursion exceeded the locked limit');
    }
    const excursionTolerance = Math.max(1, observation.energy.absoluteExcursionKjMol)
      * Number.EPSILON * 128;
    if (observation.energyStatistics.maximumAbsoluteExcursionKjMol + excursionTolerance
        < observation.energy.absoluteExcursionKjMol
      || observation.energyStatistics.maximumRelativeExcursion
        !== observation.energyStatistics.maximumAbsoluteExcursionKjMol / this.#energyReferenceKjMol
      || observation.energyStatistics.maximumRelativeExcursionStep
        !== observation.energyStatistics.maximumAbsoluteExcursionStep
      || observation.energyStatistics.sampleCount !== this.#step + 1
      || observation.energyStatistics.maximumAbsoluteExcursionStep < 0
      || observation.energyStatistics.maximumAbsoluteExcursionStep > this.#step
      || observation.energyStatistics.linearDriftSlopeKjMolPerPicosecond
        !== energyDriftSlope(observation.energyStatistics)
      || observation.energyStatistics.linearRelativeDriftRatePerPicosecond
        !== observation.energyStatistics.linearDriftSlopeKjMolPerPicosecond
          / this.#energyReferenceKjMol) {
      throw new Error('aqueous dynamics energy statistics are inconsistent with trajectory history');
    }
    if (observation.conservation.momentumResidual > MOMENTUM_RESIDUAL_LIMIT) {
      throw new Error('aqueous dynamics momentum residual exceeded the locked limit');
    }
    if (observation.conservation.internalForceResidualKjMolAngstrom > INTERNAL_FORCE_RESIDUAL_LIMIT) {
      throw new Error('aqueous dynamics internal-force closure exceeded the locked limit');
    }
    if (observation.conservation.massResidualDalton !== 0 || observation.conservation.chargeResidualE !== 0) {
      throw new Error('aqueous dynamics mass or charge closure failed');
    }
    if (observation.periodicGeometry.minimumNonexcludedPairDistanceAngstrom
      < MINIMUM_NONEXCLUDED_DISTANCE_ANGSTROM) {
      throw new Error('aqueous dynamics nonexcluded contact crossed the locked distance floor');
    }
    if (observation.numericalValidity.forceWorkUnitsConsumed > MAXIMUM_FORCE_WORK_UNITS
      || observation.integration.lastStepWorkUnitsConsumed > MAXIMUM_STEP_WORK_UNITS
      || observation.constraints.rankWorkUnitsConsumed > MAXIMUM_RANK_WORK_UNITS) {
      throw new Error('aqueous dynamics work receipt exceeded the locked budget');
    }
    const latestIntegration = observation.integration.lastIntegrationReceipt;
    if (this.#step === 0) {
      if (observation.integration.lastStepSolverWorkUnitsConsumed !== 0
        || observation.integration.lastStepComposerEndpointRankAuditWorkUnitsConsumed !== 0
        || observation.integration.lastStepWorkUnitsConsumed !== 0) {
        throw new Error('aqueous dynamics initial state cannot report step work');
      }
    } else if (!latestIntegration || !this.#lastStepResult
      || this.#lastStepResult.workBudget.maximumWorkUnits !== MAXIMUM_INTEGRATOR_WORK_UNITS
      || observation.integration.lastStepSolverWorkUnitsConsumed
        !== this.#lastStepResult.workBudget.consumedWorkUnits
      || observation.integration.lastStepSolverWorkUnitsConsumed
        !== latestIntegration.workReceipt.solverIntegratorWorkUnits
      || observation.integration.lastStepComposerEndpointRankAuditWorkUnitsConsumed
        !== latestIntegration.workReceipt.composerEndpointRankAuditWorkUnits
      || observation.integration.lastStepWorkUnitsConsumed
        !== latestIntegration.workReceipt.totalIntegrationWorkUnits
      || observation.integration.lastStepWorkUnitsLimit !== MAXIMUM_STEP_WORK_UNITS) {
      throw new Error('aqueous dynamics step work receipt is inconsistent');
    }
    if (observation.constraints.jacobianRank !== 6
      || observation.constraints.rankMethod !== RANK_METHOD
      || observation.constraints.rankRelativePivotTolerance
        !== AQUEOUS_DYNAMICS_CONSTRAINT_JACOBIAN_RANK_TOLERANCE_V042
      || this.configuration.degreesOfFreedom.constraintJacobianRank !== 6
      || this.configuration.degreesOfFreedom.rankMethod !== RANK_METHOD
      || this.configuration.integration.constraintJacobianRankRelativePivotTolerance
        !== AQUEOUS_DYNAMICS_CONSTRAINT_JACOBIAN_RANK_TOLERANCE_V042
      || observation.thermodynamics.temperatureDegreesOfFreedom !== 15) {
      throw new Error('aqueous dynamics degree-of-freedom receipt is invalid');
    }
    assertIntegrationReceipt(
      observation.integration.lastIntegrationReceipt,
      this.#step,
      this.topologyDigest,
      this.configurationDigest,
      observation.integration.lastStepResultDigest,
    );
  }

  #assertSerializedState(state: AqueousDynamicsStateV042) {
    if (!allFiniteOrNull(state)) throw new Error('aqueous dynamics state contains a non-finite number');
    const { stateDigest, ...payload } = state;
    if (stateDigest !== this.#stateDigest
      || stateDigest !== digestValue(payload)
      || state.configurationDigest !== this.configurationDigest
      || digestValue(state.configuration) !== state.configurationDigest
      || state.topologyDigest !== this.topologyDigest
      || state.configuration.topologyDigest !== state.topologyDigest) {
      throw new Error('aqueous dynamics serialized state or configuration digest binding failed');
    }
  }

  #refreshIdentity() {
    this.#physicalDigest = this.#computePhysicalDigest();
    this.#stateId = this.#computeStateId();
    this.#stateDigest = this.#computeStateDigest();
  }

  #computePhysicalDigest() {
    return digestValue({
      schemaVersion: 'tf.aqueous-dynamics-physical/0.4.2',
      worldId: this.worldId,
      configurationDigest: this.configurationDigest,
      topologyDigest: this.topologyDigest,
      cellVectorsAngstrom: cloneCellVectors(this.cell.vectorsAngstrom),
      step: this.#step,
      atoms: this.#atoms.map((atom) => ({
        id: atom.id,
        wrappedFractional: cloneVector(atom.position.wrappedFractional),
        velocityAngstromPerPicosecond: cloneVector(atom.velocityAngstromPerPicosecond),
      })),
    });
  }

  #computeStateId() {
    return `tfadw-s${this.#step.toString(36)}-r${this.#revision.toString(36)}-${shortDigest({
      parentStateId: this.#parentStateId,
      physicalDigest: this.#physicalDigest,
      configurationDigest: this.configurationDigest,
    })}`;
  }

  #statePayload(): Omit<AqueousDynamicsStateV042, 'stateDigest'> {
    return {
      schemaVersion: 'tf.aqueous-dynamics-world-state/0.4.2',
      status: 'solver-driven-finite-size-integration-calibration',
      worldId: this.worldId,
      stateId: this.#stateId,
      physicalDigest: this.#physicalDigest,
      parentStateId: this.#parentStateId,
      revision: this.#revision,
      step: this.#step,
      timePicoseconds: this.#step * AQUEOUS_DYNAMICS_TIME_STEP_PS_V042,
      configurationDigest: this.configurationDigest,
      topologyDigest: this.topologyDigest,
      configuration: cloneDynamicsConfiguration(this.configuration),
      atoms: this.#atoms.map((atom) => ({
        id: atom.id,
        position: clonePosition(atom.position),
        velocityAngstromPerPicosecond: cloneVector(atom.velocityAngstromPerPicosecond),
      })),
      initialTotalEnergyKjMol: this.#initialTotalEnergyKjMol,
      initialMassDalton: this.#initialMassDalton,
      initialChargeE: this.#initialChargeE,
      initialMomentumDaltonAngstromPerPicosecond: cloneVector(this.#initialMomentum),
      energyReferenceKjMol: this.#energyReferenceKjMol,
      energyStatistics: { ...this.#energyStatistics },
      lastIntegrationReceipt: this.#lastIntegrationReceipt
        ? structuredClone(this.#lastIntegrationReceipt)
        : null,
      lastAction: this.#lastAction ? structuredClone(this.#lastAction) : null,
    };
  }

  #computeStateDigest() { return digestValue(this.#statePayload()); }

  #capture(): MutableBackup {
    return {
      atoms: this.#atoms.map(cloneRigidAtom),
      step: this.#step,
      stateId: this.#stateId,
      stateDigest: this.#stateDigest,
      physicalDigest: this.#physicalDigest,
      parentStateId: this.#parentStateId,
      revision: this.#revision,
      lastAction: this.#lastAction ? structuredClone(this.#lastAction) : null,
      lastStepResult: this.#lastStepResult ? structuredClone(this.#lastStepResult) : null,
      energyStatistics: { ...this.#energyStatistics },
      lastIntegrationReceipt: this.#lastIntegrationReceipt
        ? structuredClone(this.#lastIntegrationReceipt)
        : null,
    };
  }

  #restore(backup: MutableBackup) {
    this.#atoms = backup.atoms.map(cloneRigidAtom);
    this.#step = backup.step;
    this.#stateId = backup.stateId;
    this.#stateDigest = backup.stateDigest;
    this.#physicalDigest = backup.physicalDigest;
    this.#parentStateId = backup.parentStateId;
    this.#revision = backup.revision;
    this.#lastAction = backup.lastAction ? structuredClone(backup.lastAction) : null;
    this.#lastStepResult = backup.lastStepResult ? deepFreeze(structuredClone(backup.lastStepResult)) : null;
    this.#energyStatistics = deepFreeze({ ...backup.energyStatistics });
    this.#lastIntegrationReceipt = backup.lastIntegrationReceipt
      ? deepFreeze(structuredClone(backup.lastIntegrationReceipt))
      : null;
  }
}

function createDynamicsConfiguration(
  worldId: AqueousDynamicsConfigurationV042['worldId'],
  cell: PeriodicCell,
  topology: AqueousTopologyV042,
  constraintJacobianRankReceipt: AqueousDynamicsConstraintJacobianRankReceiptV042 &
    Readonly<{ rank: 6 }>,
): AqueousDynamicsConfigurationV042 {
  return deepFreeze({
    schemaVersion: 'tf.aqueous-dynamics-configuration/0.4.2',
    worldId,
    cell: {
      originAngstrom: cloneVector(cell.originAngstrom),
      vectorsAngstrom: cloneCellVectors(cell.vectorsAngstrom),
      volumeAngstrom3: cell.volumeAngstrom3,
      periodicAxes: [true, true, true] as const,
    },
    topologyDigest: topology.topologyDigest,
    topology: structuredClone(topology),
    integration: {
      algorithm: 'constrained-velocity-verlet-rattle',
      ensemble: 'NVE',
      fixedTimeStepPicoseconds: AQUEOUS_DYNAMICS_TIME_STEP_PS_V042,
      constraintOptions: constraintOptions(),
      constraintImpulseToleranceDaltonAngstromPerPicosecond:
        CONSTRAINT_IMPULSE_TOLERANCE_DALTON_ANGSTROM_PER_PICOSECOND,
      constraintJacobianRankRelativePivotTolerance:
        AQUEOUS_DYNAMICS_CONSTRAINT_JACOBIAN_RANK_TOLERANCE_V042,
      maximumForceEvaluationWorkUnits: MAXIMUM_FORCE_WORK_UNITS,
      maximumIntegratorWorkUnits: MAXIMUM_INTEGRATOR_WORK_UNITS,
      maximumStepWorkUnits: MAXIMUM_STEP_WORK_UNITS,
      maximumConstraintJacobianRankWorkUnits: MAXIMUM_RANK_WORK_UNITS,
    },
    validityGates: {
      minimumNonexcludedDistanceAngstrom: MINIMUM_NONEXCLUDED_DISTANCE_ANGSTROM,
      maximumRelativeEnergyExcursion: MAXIMUM_RELATIVE_ENERGY_EXCURSION,
      momentumResidualLimit: MOMENTUM_RESIDUAL_LIMIT,
      internalForceResidualLimit: INTERNAL_FORCE_RESIDUAL_LIMIT,
      massResidualLimitDalton: 0,
      chargeResidualLimitE: 0,
    },
    degreesOfFreedom: {
      atomCount: 8,
      cartesianCoordinateCount: 24,
      constraintCount: 6,
      constraintJacobianRank: constraintJacobianRankReceipt.rank,
      centerOfMassRemovedDegreesOfFreedom: 3,
      temperatureDegreesOfFreedom: AQUEOUS_DYNAMICS_TEMPERATURE_DOF_V042,
      rankMethod: constraintJacobianRankReceipt.method,
      rankWorkUnitsConsumed: constraintJacobianRankReceipt.workUnitsConsumed,
    },
  });
}

function cloneDynamicsConfiguration(
  configuration: AqueousDynamicsConfigurationV042,
): AqueousDynamicsConfigurationV042 {
  return structuredClone(configuration) as AqueousDynamicsConfigurationV042;
}

function initialEnergyStatistics(
  initialTotalEnergyKjMol: number,
): AqueousDynamicsEnergyStatisticsV042 {
  return deepFreeze({
    sampleCount: 1,
    timeSumPicoseconds: 0,
    energySumKjMol: initialTotalEnergyKjMol,
    timeSquaredSumPicoseconds2: 0,
    timeEnergySumKjMolPicoseconds: 0,
    maximumAbsoluteExcursionKjMol: 0,
    maximumAbsoluteExcursionStep: 0,
    maximumRelativeExcursion: 0,
    maximumRelativeExcursionStep: 0,
    linearDriftSlopeKjMolPerPicosecond: 0,
    linearRelativeDriftRatePerPicosecond: 0,
  });
}

function energyDriftSlope(statistics: Pick<
  AqueousDynamicsEnergyStatisticsV042,
  | 'sampleCount'
  | 'timeSumPicoseconds'
  | 'energySumKjMol'
  | 'timeSquaredSumPicoseconds2'
  | 'timeEnergySumKjMolPicoseconds'
>) {
  const denominator = statistics.sampleCount * statistics.timeSquaredSumPicoseconds2
    - statistics.timeSumPicoseconds ** 2;
  if (statistics.sampleCount < 2 || denominator === 0) return 0;
  const numerator = statistics.sampleCount * statistics.timeEnergySumKjMolPicoseconds
    - statistics.timeSumPicoseconds * statistics.energySumKjMol;
  const slope = numerator / denominator;
  if (!Number.isFinite(slope)) {
    throw new Error('aqueous dynamics energy regression produced a non-finite slope');
  }
  return canonicalZero(slope);
}

function potentialEnergyNamespace(evaluation: AqueousForceFieldEvaluationV042) {
  return {
    ewaldRealSpace: evaluation.energyKjMol.ewaldRealSpace,
    ewaldReciprocalSpace: evaluation.energyKjMol.ewaldReciprocalSpace,
    ewaldSelfCorrection: evaluation.energyKjMol.ewaldSelfCorrection,
    coulombExceptionCorrection: evaluation.energyKjMol.coulombExceptionCorrection,
    lennardJonesFinal: evaluation.energyKjMol.lennardJonesFinal,
  };
}

function canonicalPositionDigestFromEvaluation(
  evaluation: AqueousForceFieldEvaluationV042,
) {
  return canonicalPositionDigest(evaluation.atoms.map((atom) => ({
    id: atom.id,
    wrappedFractional: atom.wrappedFractional,
  })));
}

function canonicalPositionDigestFromEndpoint(
  atoms: ConstrainedVelocityVerletResult['initial']['atoms'],
) {
  return canonicalPositionDigest(atoms.map((atom) => ({
    id: atom.id,
    wrappedFractional: atom.position.wrappedFractional,
  })));
}

function canonicalPositionDigest(
  atoms: ReadonlyArray<Readonly<{ id: string; wrappedFractional: Vector3 }>>,
) {
  return digestValue({
    schemaVersion: 'tf.aqueous-dynamics-canonical-position-namespace/0.4.2',
    atoms: atoms.map((atom) => ({
      id: atom.id,
      wrappedFractional: cloneVector(atom.wrappedFractional),
    })).sort((left, right) => compareAscii(left.id, right.id)),
  });
}

function validateComposerReceiptAgainstEndpoint(
  captured: CapturedComposerEvaluation,
  endpoint: ConstrainedVelocityVerletResult['initial'],
  result: ConstrainedVelocityVerletResult,
  topologyDigest: string,
  configurationDigest: string,
) {
  const { evaluation, receipt } = captured;
  const endpointEnergyNamespace = endpoint.energy.potentialEnergyComponentsKjMol;
  const endpointPotentialEnergy = compensatedSum(Object.values(endpointEnergyNamespace));
  const endpointKineticEnergy = compensatedSum(endpoint.atoms.map((atom) => 0.005
    * atom.massDalton
    * dot(atom.velocityAngstromPerPicosecond, atom.velocityAngstromPerPicosecond)));
  if (receipt.topologyDigest !== topologyDigest
    || evaluation.topologyDigest !== topologyDigest
    || receipt.configurationDigest !== configurationDigest
    || receipt.evaluationDigest !== evaluation.evaluationDigest
    || receipt.canonicalPositionDigest !== canonicalPositionDigestFromEvaluation(evaluation)
    || receipt.canonicalPositionDigest !== canonicalPositionDigestFromEndpoint(endpoint.atoms)
    || receipt.forceNamespaceDigest !== digestValue(evaluation.forceByAtomIdKjMolAngstrom)
    || receipt.forceNamespaceDigest !== digestValue(endpoint.forceByAtomIdKjMolAngstrom)
    || receipt.energyNamespaceDigest !== digestValue(potentialEnergyNamespace(evaluation))
    || receipt.energyNamespaceDigest !== digestValue(endpointEnergyNamespace)
    || receipt.workUnitsConsumed !== evaluation.workReceipt.totalWorkUnitsConsumed
    || receipt.workReceiptDigest !== digestValue(evaluation.workReceipt)
    || receipt.constraintJacobianRankReceipt.rank !== 6
    || receipt.constraintJacobianRankReceipt.method !== RANK_METHOD
    || receipt.constraintJacobianRankReceipt.relativePivotTolerance
      !== AQUEOUS_DYNAMICS_CONSTRAINT_JACOBIAN_RANK_TOLERANCE_V042
    || receipt.constraintJacobianRankReceipt.matrixRows !== RANK_CONSTRAINT_COUNT
    || receipt.constraintJacobianRankReceipt.matrixColumns !== RANK_CARTESIAN_COORDINATE_COUNT
    || receipt.constraintJacobianRankReceipt.workUnitsConsumed > MAXIMUM_RANK_WORK_UNITS
    || endpoint.energy.potentialEnergyKjMol !== endpointPotentialEnergy
    || endpoint.energy.kineticEnergyKjMol !== endpointKineticEnergy
    || endpoint.energy.totalEnergyKjMol !== endpointPotentialEnergy + endpointKineticEnergy
    || result.timeStepPicoseconds !== AQUEOUS_DYNAMICS_TIME_STEP_PS_V042
    || result.algorithm !== 'constrained-velocity-verlet-rattle'
    || result.degreesOfFreedom.constraintJacobianRank !== 6
    || result.degreesOfFreedom.rankMethod !== RANK_METHOD
    || result.degreesOfFreedom.rankWorkUnitsConsumed
      !== result.workBudget.constraintJacobianRankWorkUnits
    || (receipt.stage === 'initial'
      && result.degreesOfFreedom.rankWorkUnitsConsumed
        !== receipt.constraintJacobianRankReceipt.workUnitsConsumed)) {
    throw new Error(`${receipt.stage} aqueous composer receipt does not exactly match its integrator endpoint`);
  }
}

function assertIntegrationReceipt(
  receipt: AqueousDynamicsIntegrationReceiptV042 | null,
  step: number,
  topologyDigest: string,
  configurationDigest: string,
  lastStepResultDigest: string | null,
) {
  if (step === 0) {
    if (receipt !== null || lastStepResultDigest !== null) {
      throw new Error('aqueous dynamics initial integration receipt must be null');
    }
    return;
  }
  if (!receipt || receipt.fromStep !== step - 1 || receipt.toStep !== step
    || receipt.topologyDigest !== topologyDigest
    || receipt.configurationDigest !== configurationDigest
    || receipt.integratorResultDigest !== lastStepResultDigest
    || receipt.initialEvaluation.stage !== 'initial'
    || receipt.initialEvaluation.evaluationOrdinal !== 1
    || receipt.finalEvaluation.stage !== 'final'
    || receipt.finalEvaluation.evaluationOrdinal !== 2
    || receipt.initialEvaluation.topologyDigest !== topologyDigest
    || receipt.finalEvaluation.topologyDigest !== topologyDigest
    || receipt.initialEvaluation.configurationDigest !== configurationDigest
    || receipt.finalEvaluation.configurationDigest !== configurationDigest) {
    throw new Error('aqueous dynamics integration receipt is inconsistent');
  }
  const endpointRankAuditWork = safeWorkSum(
    receipt.initialEvaluation.constraintJacobianRankReceipt.workUnitsConsumed,
    receipt.finalEvaluation.constraintJacobianRankReceipt.workUnitsConsumed,
  );
  if (receipt.workReceipt.composerEndpointRankAuditWorkUnits !== endpointRankAuditWork
    || receipt.workReceipt.totalIntegrationWorkUnits !== safeWorkSum(
      receipt.workReceipt.solverIntegratorWorkUnits,
      endpointRankAuditWork,
    )
    || receipt.workReceipt.maximumIntegrationWorkUnits !== MAXIMUM_STEP_WORK_UNITS
    || receipt.workReceipt.totalIntegrationWorkUnits > MAXIMUM_STEP_WORK_UNITS
    || receipt.workReceipt.withinBudget !== true
    || receipt.workReceipt.boundary
      !== 'covers-integrator-and-two-composer-endpoint-rank-audits; observation-recomputation-is-receipted-separately') {
    throw new Error('aqueous dynamics integration work receipt is inconsistent');
  }
  const { receiptDigest, ...payload } = receipt;
  if (receiptDigest !== digestValue(payload)) {
    throw new Error('aqueous dynamics integration receipt digest mismatch');
  }
}

/**
 * Evaluates the locked fixture's numerical 6 x 24 Cartesian constraint
 * Jacobian. For each distance constraint, the row is the gradient of
 * g_ij = |minimum-image(r_j-r_i)|^2 - d_ij^2, namely -2 r_ij at atom i and
 * +2 r_ij at atom j. Rows and atom-coordinate columns are ASCII-id ordered.
 */
export function evaluateAqueousConstraintJacobianRankV042(
  context: ConstraintJacobianRankContext,
): AqueousDynamicsConstraintJacobianRankReceiptV042 {
  assertExactKeys(context, ['atoms', 'cell', 'constraints'], 'aqueous constraint rank context');
  const { cell, atoms, constraints } = context;
  if (!(cell instanceof PeriodicCell)) {
    throw new TypeError('aqueous constraint rank context requires a PeriodicCell');
  }
  if (!Array.isArray(atoms) || atoms.length !== RANK_ATOM_COUNT
    || !Array.isArray(constraints) || constraints.length !== RANK_CONSTRAINT_COUNT) {
    throw new Error('aqueous constraint rank requires the locked numerical 6 x 24 Jacobian shape');
  }

  const atomIds = new Set<string>();
  const canonicalAtoms = atoms.map((atom) => {
    assertExactKeys(atom, ['id', 'massDalton', 'position'], 'aqueous constraint rank atom');
    assertStableRankToken(atom.id, 'aqueous constraint rank atom id');
    if (atomIds.has(atom.id)) throw new Error(`duplicate aqueous constraint rank atom id: ${atom.id}`);
    atomIds.add(atom.id);
    if (!(Number.isFinite(atom.massDalton) && atom.massDalton > 0)) {
      throw new Error(`aqueous constraint rank atom ${atom.id} mass must be finite and positive`);
    }
    assertExactRankPosition(atom.position, `aqueous constraint rank atom ${atom.id} position`);
    cell.wrappedCartesian(atom.position);
    return atom;
  }).sort((left, right) => compareAscii(left.id, right.id));
  const atomIndex = new Map(canonicalAtoms.map((atom, index) => [atom.id, index]));

  const constraintIds = new Set<string>();
  const canonicalConstraints = constraints.map((constraint) => {
    assertExactKeys(
      constraint,
      ['atomAId', 'atomBId', 'distanceAngstrom', 'id'],
      'aqueous constraint rank constraint',
    );
    assertStableRankToken(constraint.id, 'aqueous constraint rank constraint id');
    assertStableRankToken(constraint.atomAId, `aqueous constraint rank ${constraint.id} atomAId`);
    assertStableRankToken(constraint.atomBId, `aqueous constraint rank ${constraint.id} atomBId`);
    if (constraintIds.has(constraint.id)) {
      throw new Error(`duplicate aqueous constraint rank constraint id: ${constraint.id}`);
    }
    constraintIds.add(constraint.id);
    if (constraint.atomAId === constraint.atomBId
      || !atomIndex.has(constraint.atomAId) || !atomIndex.has(constraint.atomBId)) {
      throw new Error(`aqueous constraint rank constraint ${constraint.id} has invalid atom references`);
    }
    if (!(Number.isFinite(constraint.distanceAngstrom) && constraint.distanceAngstrom > 0
      && constraint.distanceAngstrom < cell.minimumImageRadiusAngstrom)) {
      throw new Error(`aqueous constraint rank constraint ${constraint.id} distance is invalid`);
    }
    return constraint;
  }).sort((left, right) => compareAscii(left.id, right.id));

  let workUnitsConsumed = 0;
  const jacobian = canonicalConstraints.map((constraint) => {
    const row = Array<number>(RANK_CARTESIAN_COORDINATE_COUNT).fill(0);
    workUnitsConsumed += RANK_CARTESIAN_COORDINATE_COUNT;
    const atomAIndex = requireMap(atomIndex, constraint.atomAId, 'rank atom A index');
    const atomBIndex = requireMap(atomIndex, constraint.atomBId, 'rank atom B index');
    const displacement = cell.minimumImageFromFractional(
      canonicalAtoms[atomAIndex].position.wrappedFractional,
      canonicalAtoms[atomBIndex].position.wrappedFractional,
    ).displacementAngstrom;
    workUnitsConsumed += 1;
    for (const [axisOffset, component] of [
      [0, displacement.x],
      [1, displacement.y],
      [2, displacement.z],
    ] as const) {
      row[3 * atomAIndex + axisOffset] = canonicalZero(-2 * component);
      row[3 * atomBIndex + axisOffset] = canonicalZero(2 * component);
      workUnitsConsumed += 2;
    }
    return row;
  });

  const elimination = scaledPartialPivotRank(
    jacobian,
    AQUEOUS_DYNAMICS_CONSTRAINT_JACOBIAN_RANK_TOLERANCE_V042,
  );
  workUnitsConsumed += elimination.workUnitsConsumed;
  if (!Number.isSafeInteger(workUnitsConsumed) || workUnitsConsumed > MAXIMUM_RANK_WORK_UNITS) {
    throw new Error('aqueous constraint rank work receipt exceeded its locked budget');
  }
  return deepFreeze({
    constraintDefinition: 'g=minimum-image-distance-squared-minus-target-distance-squared',
    matrixRows: 6,
    matrixColumns: 24,
    method: RANK_METHOD,
    relativePivotTolerance: AQUEOUS_DYNAMICS_CONSTRAINT_JACOBIAN_RANK_TOLERANCE_V042,
    rank: elimination.rank,
    workUnitsConsumed,
    workUnitModel: 'scalar-matrix-write-inspection-and-elimination-v1',
  });
}

function scaledPartialPivotRank(matrix: ReadonlyArray<ReadonlyArray<number>>, tolerance: number) {
  const mutable = matrix.map((row) => [...row]);
  const columnCount = mutable[0]?.length ?? 0;
  if (mutable.length !== RANK_CONSTRAINT_COUNT
    || columnCount !== RANK_CARTESIAN_COORDINATE_COUNT
    || mutable.some((row) => row.length !== columnCount)) {
    throw new Error('scaled partial pivot rank requires the locked 6 x 24 matrix');
  }
  let workUnitsConsumed = 0;
  const rowScales = mutable.map((row) => {
    let scaleValue = 0;
    for (const value of row) {
      workUnitsConsumed += 1;
      if (!Number.isFinite(value)) throw new Error('constraint Jacobian contains a non-finite value');
      scaleValue = Math.max(scaleValue, Math.abs(value));
    }
    return scaleValue;
  });

  let rank = 0;
  for (let column = 0; column < columnCount && rank < mutable.length; column += 1) {
    let pivotRow = -1;
    let bestScaledMagnitude = -1;
    for (let row = rank; row < mutable.length; row += 1) {
      workUnitsConsumed += 1;
      const scaledMagnitude = rowScales[row] === 0
        ? 0
        : Math.abs(mutable[row][column]) / rowScales[row];
      if (scaledMagnitude > bestScaledMagnitude) {
        bestScaledMagnitude = scaledMagnitude;
        pivotRow = row;
      }
    }
    if (pivotRow < 0 || bestScaledMagnitude <= tolerance) continue;

    if (pivotRow !== rank) {
      [mutable[rank], mutable[pivotRow]] = [mutable[pivotRow], mutable[rank]];
      [rowScales[rank], rowScales[pivotRow]] = [rowScales[pivotRow], rowScales[rank]];
      workUnitsConsumed += 1;
    }
    const pivot = mutable[rank][column];
    for (let row = rank + 1; row < mutable.length; row += 1) {
      const factor = mutable[row][column] / pivot;
      mutable[row][column] = 0;
      workUnitsConsumed += 2;
      for (let trailing = column + 1; trailing < columnCount; trailing += 1) {
        mutable[row][trailing] = canonicalZero(
          mutable[row][trailing] - factor * mutable[rank][trailing],
        );
        workUnitsConsumed += 1;
      }
    }
    rank += 1;
  }
  return { rank, workUnitsConsumed };
}

function requireFullConstraintJacobianRank(
  cell: PeriodicCell,
  atoms: ReadonlyArray<Pick<RigidConstraintAtom, 'id' | 'massDalton' | 'position'>>,
  constraints: ConstraintJacobianRankContext['constraints'],
  label: string,
): AqueousDynamicsConstraintJacobianRankReceiptV042 & Readonly<{ rank: 6 }> {
  const receipt = evaluateAqueousConstraintJacobianRankV042({
    cell,
    atoms: atoms.map((atom) => ({
      id: atom.id,
      massDalton: atom.massDalton,
      position: atom.position,
    })),
    constraints,
  });
  if (receipt.rank !== RANK_CONSTRAINT_COUNT) {
    throw new Error(`${label} constraint Jacobian rank ${receipt.rank} is not the locked rank 6`);
  }
  return receipt as AqueousDynamicsConstraintJacobianRankReceiptV042 & Readonly<{ rank: 6 }>;
}

function sameConstraintJacobianRankReceipt(
  left: AqueousDynamicsConstraintJacobianRankReceiptV042,
  right: AqueousDynamicsConstraintJacobianRankReceiptV042,
) {
  return digestValue(left) === digestValue(right);
}

function assertExactRankPosition(position: WrappedPeriodicPosition, label: string) {
  assertExactKeys(position, ['image', 'wrappedFractional'], label);
  assertExactKeys(position.wrappedFractional, ['x', 'y', 'z'], `${label} wrappedFractional`);
  assertExactKeys(position.image, ['x', 'y', 'z'], `${label} image`);
}

function assertStableRankToken(value: unknown, label: string) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(value)) {
    throw new Error(`${label} must be a stable ASCII token`);
  }
}

export function createNaClTip3pFiniteSizeCalibrationWorldV042() {
  return new AqueousDynamicsWorldV042();
}

function createCalibrationCell() {
  return new PeriodicCell([
    { x: 24, y: 0, z: 0 },
    { x: 2, y: 23, z: 0 },
    { x: 1, y: 1.5, z: 22 },
  ]);
}

function createCalibrationTopology() {
  const parameters = AMBER14_TIP3P_PARAMETERS_V042;
  const atom = (
    id: string,
    site: typeof parameters.sites[keyof typeof parameters.sites],
    moleculeId: string,
    residueId: string,
    residueName: string,
    siteName: string,
    siteIndex: number,
  ): AqueousAtomTopologyV042 => ({
    id,
    element: site.element,
    massDalton: site.massDalton,
    chargeE: site.chargeE,
    lennardJones: { sigmaAngstrom: site.sigmaAngstrom, epsilonKjMol: site.epsilonKjMol },
    identity: { moleculeId, residueId, residueName, siteName, siteIndex },
  });
  const waterAtoms = (prefix: 'water-a' | 'water-b') => {
    const residueId = `residue-${prefix}`;
    return [
      atom(`${prefix}-o`, parameters.sites.waterOxygen, prefix, residueId, 'HOH', 'O', 0),
      atom(`${prefix}-h1`, parameters.sites.waterHydrogen, prefix, residueId, 'HOH', 'H1', 1),
      atom(`${prefix}-h2`, parameters.sites.waterHydrogen, prefix, residueId, 'HOH', 'H2', 2),
    ];
  };
  const waterConstraints = (prefix: 'water-a' | 'water-b') => [
    { id: `${prefix}-constraint-oh1`, atomAId: `${prefix}-o`, atomBId: `${prefix}-h1`, distanceAngstrom: parameters.rigidWaterGeometry.oxygenHydrogenDistanceAngstrom },
    { id: `${prefix}-constraint-oh2`, atomAId: `${prefix}-o`, atomBId: `${prefix}-h2`, distanceAngstrom: parameters.rigidWaterGeometry.oxygenHydrogenDistanceAngstrom },
    { id: `${prefix}-constraint-hh`, atomAId: `${prefix}-h1`, atomBId: `${prefix}-h2`, distanceAngstrom: parameters.rigidWaterGeometry.hydrogenHydrogenDistanceAngstrom },
  ];
  const excluded = { mode: 'exclude' as const };
  const waterExceptions = (prefix: 'water-a' | 'water-b') => [
    { id: `${prefix}-exception-oh1`, atomAId: `${prefix}-o`, atomBId: `${prefix}-h1`, coulomb: excluded, lennardJones: excluded },
    { id: `${prefix}-exception-oh2`, atomAId: `${prefix}-o`, atomBId: `${prefix}-h2`, coulomb: excluded, lennardJones: excluded },
    { id: `${prefix}-exception-hh`, atomAId: `${prefix}-h1`, atomBId: `${prefix}-h2`, coulomb: excluded, lennardJones: excluded },
  ];
  return canonicalizeAqueousTopology({
    schemaVersion: 'tf.aqueous-topology/0.4.2',
    topologyId: 'nacl-tip3p-two-water-finite-size-calibration',
    atoms: [
      ...waterAtoms('water-a'),
      ...waterAtoms('water-b'),
      atom('sodium-na', parameters.sites.sodiumIon, 'sodium', 'residue-sodium', 'NA', 'Na', 0),
      atom('chloride-cl', parameters.sites.chlorideIon, 'chloride', 'residue-chloride', 'CL', 'Cl', 0),
    ],
    molecules: [
      { id: 'water-a', kind: 'rigid-tip3p-water', residueIds: ['residue-water-a'], atomIds: ['water-a-o', 'water-a-h1', 'water-a-h2'] },
      { id: 'water-b', kind: 'rigid-tip3p-water', residueIds: ['residue-water-b'], atomIds: ['water-b-o', 'water-b-h1', 'water-b-h2'] },
      { id: 'sodium', kind: 'monatomic-ion', residueIds: ['residue-sodium'], atomIds: ['sodium-na'] },
      { id: 'chloride', kind: 'monatomic-ion', residueIds: ['residue-chloride'], atomIds: ['chloride-cl'] },
    ],
    residues: [
      { id: 'residue-water-a', moleculeId: 'water-a', name: 'HOH', atomIds: ['water-a-o', 'water-a-h1', 'water-a-h2'] },
      { id: 'residue-water-b', moleculeId: 'water-b', name: 'HOH', atomIds: ['water-b-o', 'water-b-h1', 'water-b-h2'] },
      { id: 'residue-sodium', moleculeId: 'sodium', name: 'NA', atomIds: ['sodium-na'] },
      { id: 'residue-chloride', moleculeId: 'chloride', name: 'CL', atomIds: ['chloride-cl'] },
    ],
    energeticBonds: [],
    constraints: [...waterConstraints('water-a'), ...waterConstraints('water-b')],
    nonbondedExceptions: [...waterExceptions('water-a'), ...waterExceptions('water-b')],
    shortRangeNonbonded: {
      method: 'lennard-jones-12-6',
      mixingRule: 'lorentz-berthelot',
      cutoffAngstrom: 10,
      switchingPolicy: 'none',
      energyShift: false,
      dispersionCorrection: false,
      maximumPairWorkUnits: 1_000,
    },
    electrostatics: {
      method: 'direct-ewald-explicit-real-and-reciprocal-sums',
      alphaInverseAngstrom: 0.4,
      realSpaceCutoffAngstrom: 9,
      reciprocalCutoffInverseAngstrom: 3,
      relativePermittivity: 1,
      neutralityToleranceE: 1e-12,
      electrostaticConstantKjMolAngstromE2: 1389.35458,
      maximumRealSpaceWorkUnits: 100_000,
      maximumReciprocalSpaceWorkUnits: 1_000_000,
    },
    parameterReceipt: parameters,
    sourcePins: [{
      id: 'openmm-tip3p-amber14',
      owner: parameters.source.owner,
      repository: parameters.source.repository,
      sourceCommit: parameters.source.sourceCommit,
      filePath: parameters.source.filePath,
      sizeBytes: parameters.source.sizeBytes,
      sha256: parameters.source.sha256,
      executionPerformed: false,
      licenseClearance: false,
    }],
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
  });
}

function createInitialAtoms(
  cell: PeriodicCell,
  topology: AqueousTopologyV042,
): RigidConstraintAtom[] {
  // Offline constrained steepest-descent candidate, then translated by one
  // common lattice gauge so water-a straddles x. Runtime construction only
  // validates this receipt; it never projects or minimizes it silently.
  const positions = [
    { id: 'chloride-cl', fractional: { x: 0.07927577188468216, y: 0.43804101449193433, z: 0.45002691965757735 } },
    { id: 'sodium-na', fractional: { x: 0.088483872118714, y: 0.3275790866692706, z: 0.4497210847186817 } },
    { id: 'water-a-h1', fractional: { x: 0.001958901006683833, y: 0.35874487225748136, z: 0.4500736254322989 } },
    { id: 'water-a-h2', fractional: { x: 0.9584406157928324, y: 0.315037792037817, z: 0.4500263690531387 } },
    { id: 'water-a-o', fractional: { x: 0.998, y: 0.3178495309539293, z: 0.4499936198071472 } },
    { id: 'water-b-h1', fractional: { x: 0.16964868162925928, y: 0.3588655541123695, z: 0.450074099379338 } },
    { id: 'water-b-h2', fractional: { x: 0.22060132963568302, y: 0.3153492631470686, z: 0.45003017212247637 } },
    { id: 'water-b-o', fractional: { x: 0.18057945479644077, y: 0.3180003287055862, z: 0.4499939422197722 } },
  ];
  const topologyById = new Map(topology.atoms.map((atom) => [atom.id, atom]));
  return positions.map((entry) => ({
    id: entry.id,
    massDalton: requireMap(topologyById, entry.id, 'initial topology atom').massDalton,
    position: cell.wrapFractional(entry.fractional),
    velocityAngstromPerPicosecond: zero(),
  })).sort((left, right) => compareAscii(left.id, right.id));
}

function assertFixedFixture(
  topology: AqueousTopologyV042,
  atoms: ReadonlyArray<RigidConstraintAtom>,
) {
  if (topology.atoms.length !== 8 || atoms.length !== 8
    || topology.constraints.length !== 6 || topology.nonbondedExceptions.length !== 6
    || topology.molecules.filter((molecule) => molecule.kind === 'rigid-tip3p-water').length !== 2) {
    throw new Error('aqueous dynamics fixture must contain exactly 8 atoms, 2 waters, 6 constraints, and 6 exclusions');
  }
}

function auditConstraintManifold(
  cell: PeriodicCell,
  atoms: ReadonlyArray<RigidConstraintAtom>,
  topology: AqueousTopologyV042,
) {
  const options = { ...constraintOptions(), maximumIterations: 1 };
  const shake = applyShakePositionConstraints(cell, atoms, topology.constraints, options);
  const rattle = applyRattleVelocityConstraints(cell, atoms, topology.constraints, options);
  return {
    shakeIterations: shake.iterations,
    rattleIterations: rattle.iterations,
    maximumPositionResidualAngstrom: shake.maximumPositionResidualAngstrom,
    maximumVelocityDerivativeResidualAngstrom2PerPicosecond:
      rattle.maximumVelocityDerivativeResidualAngstrom2PerPicosecond,
  };
}

function constraintOptions() {
  return {
    positionToleranceAngstrom: POSITION_TOLERANCE_ANGSTROM,
    velocityDerivativeToleranceAngstrom2PerPicosecond: VELOCITY_DERIVATIVE_TOLERANCE,
    maximumIterations: 200,
    momentumToleranceDaltonAngstromPerPicosecond: 1e-9,
    centerOfMassPositionToleranceAngstrom: 1e-9,
  };
}

function minimumNonexcludedPairDistance(
  cell: PeriodicCell,
  atoms: ReadonlyArray<RigidConstraintAtom>,
  topology: AqueousTopologyV042,
) {
  const excluded = new Set(topology.nonbondedExceptions.map((exception) => pairKey(
    exception.atomAId,
    exception.atomBId,
  )));
  let minimum = Number.POSITIVE_INFINITY;
  for (let left = 0; left < atoms.length; left += 1) {
    for (let right = left + 1; right < atoms.length; right += 1) {
      if (excluded.has(pairKey(atoms[left].id, atoms[right].id))) continue;
      minimum = Math.min(minimum, cell.minimumImageFromFractional(
        atoms[left].position.wrappedFractional,
        atoms[right].position.wrappedFractional,
      ).distanceAngstrom);
    }
  }
  if (!Number.isFinite(minimum)) throw new Error('aqueous dynamics fixture has no nonexcluded atom pair');
  return minimum;
}

function countBoundaryStraddlingWaters(
  cell: PeriodicCell,
  atoms: ReadonlyArray<RigidConstraintAtom>,
  topology: AqueousTopologyV042,
) {
  const atomById = new Map(atoms.map((atom) => [atom.id, atom]));
  return topology.molecules.filter((molecule) => molecule.kind === 'rigid-tip3p-water').filter((molecule) => {
    const oxygenId = molecule.atomIds.find((id) => id.endsWith('-o'))!;
    const oxygen = requireMap(atomById, oxygenId, 'water oxygen state');
    return molecule.atomIds.filter((id) => id !== oxygenId).some((id) => {
      const hydrogen = requireMap(atomById, id, 'water hydrogen state');
      const shift = cell.minimumImageFromFractional(
        oxygen.position.wrappedFractional,
        hydrogen.position.wrappedFractional,
      ).imageShiftForTarget;
      return shift.x !== 0 || shift.y !== 0 || shift.z !== 0;
    });
  }).length;
}

function kineticEnergyKjMol(atoms: ReadonlyArray<RigidConstraintAtom>) {
  return atoms.reduce((sum, atom) => sum + 0.005 * atom.massDalton
    * dot(atom.velocityAngstromPerPicosecond, atom.velocityAngstromPerPicosecond), 0);
}

function centerOfMassKineticEnergyKjMol(atoms: ReadonlyArray<RigidConstraintAtom>) {
  const totalMass = atoms.reduce((sum, atom) => sum + atom.massDalton, 0);
  const centerOfMassVelocity = scale(totalMomentum(atoms), 1 / totalMass);
  return atoms.reduce((sum, atom) => {
    const relative = subtract(atom.velocityAngstromPerPicosecond, centerOfMassVelocity);
    return sum + 0.005 * atom.massDalton * dot(relative, relative);
  }, 0);
}

function totalMomentum(atoms: ReadonlyArray<RigidConstraintAtom>) {
  return {
    x: compensatedSum(atoms.map((atom) => atom.massDalton * atom.velocityAngstromPerPicosecond.x)),
    y: compensatedSum(atoms.map((atom) => atom.massDalton * atom.velocityAngstromPerPicosecond.y)),
    z: compensatedSum(atoms.map((atom) => atom.massDalton * atom.velocityAngstromPerPicosecond.z)),
  };
}

function compensatedSum(values: ReadonlyArray<number>) {
  let sum = 0;
  let compensation = 0;
  for (const value of values) {
    const adjusted = value - compensation;
    const next = sum + adjusted;
    compensation = (next - sum) - adjusted;
    sum = next;
  }
  return canonicalZero(sum);
}

function safeWorkSum(...values: number[]) {
  if (values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error('aqueous dynamics work receipt components must be nonnegative safe integers');
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total)) {
    throw new Error('aqueous dynamics work receipt exceeds the safe integer domain');
  }
  return total;
}

function pairKey(left: string, right: string) {
  return [left, right].sort(compareAscii).join('\0');
}

function cloneRigidAtom(atom: RigidConstraintAtom): RigidConstraintAtom {
  return {
    id: atom.id,
    massDalton: atom.massDalton,
    position: clonePosition(atom.position),
    velocityAngstromPerPicosecond: cloneVector(atom.velocityAngstromPerPicosecond),
  };
}

function clonePosition(position: WrappedPeriodicPosition): WrappedPeriodicPosition {
  return {
    wrappedFractional: cloneVector(position.wrappedFractional),
    image: { ...position.image },
  };
}

function cloneCellVectors(vectors: CellVectors3): CellVectors3 {
  return vectors.map(cloneVector) as unknown as CellVectors3;
}

function cloneVector(vector: Vector3): Vector3 {
  return { x: canonicalZero(vector.x), y: canonicalZero(vector.y), z: canonicalZero(vector.z) };
}

function zero(): Vector3 { return { x: 0, y: 0, z: 0 }; }

function subtract(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function scale(vector: Vector3, factor: number): Vector3 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

function dot(left: Vector3, right: Vector3) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function magnitude(vector: Vector3) { return Math.sqrt(dot(vector, vector)); }

function canonicalZero(value: number) { return Object.is(value, -0) ? 0 : value; }

function compareAscii(left: string, right: string) { return left < right ? -1 : left > right ? 1 : 0; }

function requireMap<K, V>(map: ReadonlyMap<K, V>, key: K, label: string) {
  const value = map.get(key);
  if (value === undefined) throw new Error(`${label} is missing`);
  return value;
}

function assertExactKeys(value: unknown, expected: ReadonlyArray<string>, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a plain record with exactly the locked keys`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain record with exactly the locked keys`);
  }
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) {
    throw new Error(`${label} must contain exactly the locked string keys`);
  }
  const actual = (ownKeys as string[]).sort(compareAscii);
  const locked = [...expected].sort(compareAscii);
  if (actual.length !== locked.length || actual.some((key, index) => key !== locked[index])) {
    throw new Error(`${label} must contain exactly the locked keys`);
  }
}

function copyExactOwnDataRecord<Key extends string>(
  value: unknown,
  expected: readonly Key[],
  label: string,
): Readonly<Record<Key, unknown>> {
  assertExactKeys(value, expected, label);
  const descriptors = Object.getOwnPropertyDescriptors(value as object);
  const entries = expected.map((key) => {
    const descriptor = descriptors[key];
    if (!descriptor || !Object.prototype.hasOwnProperty.call(descriptor, 'value')) {
      throw new Error(`${label} must contain only own data properties`);
    }
    return [key, descriptor.value] as const;
  });
  return Object.freeze(Object.fromEntries(entries)) as Readonly<Record<Key, unknown>>;
}

function allFiniteOrNull(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (value === null || typeof value !== 'object') return true;
  if (Array.isArray(value)) return value.every(allFiniteOrNull);
  return Object.values(value as Record<string, unknown>).every(allFiniteOrNull);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value as Record<string, unknown>)) deepFreeze(nested);
  }
  return value;
}
