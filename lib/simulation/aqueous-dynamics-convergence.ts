import type { Vector3 } from '../molecular/molecular-interactions.ts';
import {
  evaluateAqueousForceFieldV042,
  type AqueousForceFieldEvaluationV042,
  type AqueousForceFieldPositionV042,
} from './aqueous-force-field.ts';
import {
  createNaClTip3pFiniteSizeCalibrationWorldV042,
  type AqueousDynamicsObservationV042,
} from './aqueous-dynamics-world.ts';
import { canonicalizeAqueousTopology } from './aqueous-topology.ts';
import { digestValue } from './digest.ts';
import {
  evaluateDirectPeriodicEwald,
  type DirectEwaldEvaluationV042,
  type DirectEwaldOptionsV042,
} from './periodic-ewald.ts';
import type { PeriodicCell } from './periodic-cell.ts';

/**
 * Deterministic single-snapshot convergence evidence for the v0.4.2 aqueous
 * calibration fixture. This module deliberately does not run or characterize
 * a trajectory.
 */

export const AQUEOUS_DYNAMICS_CONVERGENCE_ABSOLUTE_ENERGY_LIMIT_KJ_MOL_V042 = 2e-4;
export const AQUEOUS_DYNAMICS_CONVERGENCE_RELATIVE_ENERGY_LIMIT_V042 = 5e-7;
export const AQUEOUS_DYNAMICS_CONVERGENCE_FORCE_COMPONENT_LIMIT_KJ_MOL_ANGSTROM_V042 = 5e-5;
export const AQUEOUS_DYNAMICS_FORCE_DIFFERENCE_STEP_ANGSTROM_V042 = 1e-4;
export const AQUEOUS_DYNAMICS_FORCE_DIFFERENCE_LIMIT_KJ_MOL_ANGSTROM_V042 = 5e-8;

export const AQUEOUS_DYNAMICS_CONVERGENCE_GATE_NAMES_V042 = Object.freeze([
  'lockedInitialSnapshot',
  'looseDirectEwaldMatchesComposer',
  'tightDirectEwaldMatchesComposer',
  'absoluteComposerEnergyDifference',
  'relativeComposerEnergyDifference',
  'maximumComposerForceComponentDifference',
  'allComposerForceComponentsFiniteDifference',
  'workReceiptClosure',
] as const);

export type AqueousDynamicsConvergenceGateNameV042 =
  typeof AQUEOUS_DYNAMICS_CONVERGENCE_GATE_NAMES_V042[number];

type Axis = 'x' | 'y' | 'z';

type WorkSummary = Readonly<{
  realSpaceWorkUnitsConsumed: number;
  reciprocalSpaceWorkUnitsConsumed: number;
  totalWorkUnitsConsumed: number;
}>;

type PerAtomForceDifference = Readonly<{
  atomId: string;
  looseDirectEwaldKjMolAngstrom: Vector3;
  tightDirectEwaldKjMolAngstrom: Vector3;
  looseComposerDirectEwaldKjMolAngstrom: Vector3;
  tightComposerDirectEwaldKjMolAngstrom: Vector3;
  directEwaldLooseMinusTightKjMolAngstrom: Vector3;
  looseComposerKjMolAngstrom: Vector3;
  tightComposerKjMolAngstrom: Vector3;
  composerLooseMinusTightKjMolAngstrom: Vector3;
  maximumAbsoluteComposerComponentDifferenceKjMolAngstrom: number;
}>;

type FiniteDifferenceComponent = Readonly<{
  atomId: string;
  axis: Axis;
  analyticForceKjMolAngstrom: number;
  numericalForceKjMolAngstrom: number;
  signedAnalyticMinusNumericalKjMolAngstrom: number;
  absoluteErrorKjMolAngstrom: number;
  perturbations: ReadonlyArray<Readonly<{
    offsetSteps: -2 | -1 | 1 | 2;
    energyKjMol: number;
    evaluationDigest: string;
    workUnitsConsumed: number;
  }>>;
}>;

export type AqueousDynamicsConvergenceReportV042 = Readonly<{
  schemaVersion: 'tf.aqueous-dynamics-convergence/0.4.2';
  status: 'deterministic-initial-snapshot-local-verification';
  snapshot: Readonly<{
    step: 0;
    stateDigest: string;
    observationDigest: string;
    topologyDigest: string;
    configurationDigest: string;
    canonicalPositionDigest: string;
    snapshotDigest: string;
  }>;
  ewaldAndComposerComparison: Readonly<{
    scope: 'single-locked-initial-snapshot-only';
    interpretation: 'empirical-finite-sum-comparison-not-a-strict-error-bound';
    looseSettings: Readonly<{
      alphaInverseAngstrom: 0.4;
      realSpaceCutoffAngstrom: 9;
      reciprocalCutoffInverseAngstrom: 3;
    }>;
    tightSettings: Readonly<{
      alphaInverseAngstrom: 0.45;
      realSpaceCutoffAngstrom: 18;
      reciprocalCutoffInverseAngstrom: 7;
    }>;
    looseDirectEwaldEvaluationDigest: string;
    tightDirectEwaldEvaluationDigest: string;
    looseComposerEvaluationDigest: string;
    tightComposerEvaluationDigest: string;
    energyKjMol: Readonly<{
      looseDirectEwald: number;
      tightDirectEwald: number;
      looseComposerDirectEwald: number;
      tightComposerDirectEwald: number;
      absoluteDirectEwaldDifference: number;
      relativeDirectEwaldDifferenceDiagnostic: number;
      looseComposerTotalPotential: number;
      tightComposerTotalPotential: number;
      signedComposerLooseMinusTight: number;
      absoluteComposerDifference: number;
      relativeComposerDifference: number;
      relativeComposerDenominator: number;
    }>;
    forcesByAtom: ReadonlyArray<PerAtomForceDifference>;
    maximumAbsoluteComposerForceComponentDifferenceKjMolAngstrom: number;
    maximumDifferenceLocation: Readonly<{ atomId: string; axis: Axis }>;
    thresholds: Readonly<{
      absoluteEnergyDifferenceKjMol: typeof AQUEOUS_DYNAMICS_CONVERGENCE_ABSOLUTE_ENERGY_LIMIT_KJ_MOL_V042;
      relativeEnergyDifference: typeof AQUEOUS_DYNAMICS_CONVERGENCE_RELATIVE_ENERGY_LIMIT_V042;
      maximumForceComponentDifferenceKjMolAngstrom:
        typeof AQUEOUS_DYNAMICS_CONVERGENCE_FORCE_COMPONENT_LIMIT_KJ_MOL_ANGSTROM_V042;
    }>;
    workReceipt: Readonly<{
      looseDirectEwald: WorkSummary;
      tightDirectEwald: WorkSummary;
      looseComposerTotalWorkUnitsConsumed: number;
      tightComposerTotalWorkUnitsConsumed: number;
      totalReceiptedWorkUnits: number;
      workUnitBoundary: 'published-deterministic-kernel-work-units-not-wall-clock-time';
      workReceiptDigest: string;
    }>;
    comparisonDigest: string;
  }>;
  composerFiniteDifference: Readonly<{
    snapshotStep: 0;
    componentCount: 24;
    atomCount: 8;
    axesPerAtom: 3;
    stencil: 'five-point-centered-fourth-order';
    derivativeFormula: '[-E(+2h)+8E(+h)-8E(-h)+E(-2h)]/(12h)';
    forceConvention: 'force-is-negative-energy-gradient';
    gradientTarget: 'raw-unconstrained-nonbonded-composer-potential-not-rattle-projected-force';
    stepAngstrom: typeof AQUEOUS_DYNAMICS_FORCE_DIFFERENCE_STEP_ANGSTROM_V042;
    absoluteErrorLimitKjMolAngstrom:
      typeof AQUEOUS_DYNAMICS_FORCE_DIFFERENCE_LIMIT_KJ_MOL_ANGSTROM_V042;
    components: ReadonlyArray<FiniteDifferenceComponent>;
    maximumAbsoluteErrorKjMolAngstrom: number;
    maximumErrorLocation: Readonly<{ atomId: string; axis: Axis }>;
    workReceipt: Readonly<{
      referenceEvaluationCount: 1;
      perturbationEvaluationCount: 96;
      referenceEvaluationWorkUnitsConsumed: number;
      perturbationEvaluationWorkUnitsConsumed: number;
      totalReceiptedWorkUnits: number;
      deterministicOrder: 'stable-atom-id-then-axis-then-offset-minus2-minus1-plus1-plus2';
      workUnitBoundary: 'published-composer-work-units-not-wall-clock-time';
      workReceiptDigest: string;
    }>;
    verificationDigest: string;
  }>;
  gates: Readonly<Record<AqueousDynamicsConvergenceGateNameV042, true>>;
  claimBoundaries: Readonly<{
    finiteSizeCalibrationOnly: true;
    bulkClaim: false;
    diluteClaim: false;
    equilibriumClaim: false;
    externalEngineExecution: false;
    externalEngineReproduction: false;
    trajectoryEvidence: false;
    rigorousTruncationErrorBound: false;
    mechanicalObservableReceiptIncluded: false;
  }>;
  boundaries: ReadonlyArray<string>;
  verificationDigest: string;
}>;

const AXES = Object.freeze(['x', 'y', 'z'] as const);
const OFFSETS = Object.freeze([-2, -1, 1, 2] as const);
const TIGHT_MAXIMUM_WORK_UNITS = 10_000_000;

const BOUNDARIES = Object.freeze([
  'The loose-versus-tight comparison evaluates one locked initial snapshot only; it is not a strict truncation-error bound.',
  'The fixture is an eight-atom finite-size calibration and supplies no bulk, dilute, equilibrium, or statistically representative evidence.',
  'Only local direct sums and the local reference composer are executed; no external molecular-dynamics engine is executed or reproduced.',
  'The five-point centered stencil uses four perturbed composer evaluations per force component and reports all 96 perturbation receipts.',
  'Finite differences displace one Cartesian atom off the rigid-water constraint manifold and validate the raw nonbonded composer gradient, not a RATTLE constraint or projected force.',
  'No trajectory or virial-derived mechanical observable is included in this report.',
  'SHA-256 digests bind deterministic local payloads; they are not signatures or authenticity evidence.',
]);

export function runAqueousDynamicsConvergenceVerificationV042():
  AqueousDynamicsConvergenceReportV042 {
  const world = createNaClTip3pFiniteSizeCalibrationWorldV042();
  const initial = world.observe();
  requireLockedInitialSnapshot(initial);

  const snapshot = bindInitialSnapshot(initial);
  const comparison = compareLooseAndTight(initial, world.cell);
  const finiteDifference = verifyAllComposerForceComponents(initial, world.cell);
  const gates = {
    lockedInitialSnapshot: initial.step === 0 && initial.atoms.length === 8,
    looseDirectEwaldMatchesComposer: comparison.looseDirectEwaldMatchesComposer,
    tightDirectEwaldMatchesComposer: comparison.tightDirectEwaldMatchesComposer,
    absoluteComposerEnergyDifference:
      comparison.section.energyKjMol.absoluteComposerDifference
        <= AQUEOUS_DYNAMICS_CONVERGENCE_ABSOLUTE_ENERGY_LIMIT_KJ_MOL_V042,
    relativeComposerEnergyDifference:
      comparison.section.energyKjMol.relativeComposerDifference
        <= AQUEOUS_DYNAMICS_CONVERGENCE_RELATIVE_ENERGY_LIMIT_V042,
    maximumComposerForceComponentDifference:
      comparison.section.maximumAbsoluteComposerForceComponentDifferenceKjMolAngstrom
        <= AQUEOUS_DYNAMICS_CONVERGENCE_FORCE_COMPONENT_LIMIT_KJ_MOL_ANGSTROM_V042,
    allComposerForceComponentsFiniteDifference:
      finiteDifference.maximumAbsoluteErrorKjMolAngstrom
        <= AQUEOUS_DYNAMICS_FORCE_DIFFERENCE_LIMIT_KJ_MOL_ANGSTROM_V042,
    workReceiptClosure: comparison.workReceiptClosed && finiteDifference.workReceiptClosed,
  } satisfies Record<AqueousDynamicsConvergenceGateNameV042, boolean>;
  const failed = AQUEOUS_DYNAMICS_CONVERGENCE_GATE_NAMES_V042.filter((name) => !gates[name]);
  if (failed.length > 0) {
    throw new Error(`aqueous dynamics convergence gates failed: ${failed.join(', ')}`);
  }

  const payload = {
    schemaVersion: 'tf.aqueous-dynamics-convergence/0.4.2' as const,
    status: 'deterministic-initial-snapshot-local-verification' as const,
    snapshot,
    ewaldAndComposerComparison: comparison.section,
    composerFiniteDifference: finiteDifference.section,
    gates: gates as Record<AqueousDynamicsConvergenceGateNameV042, true>,
    claimBoundaries: {
      finiteSizeCalibrationOnly: true as const,
      bulkClaim: false as const,
      diluteClaim: false as const,
      equilibriumClaim: false as const,
      externalEngineExecution: false as const,
      externalEngineReproduction: false as const,
      trajectoryEvidence: false as const,
      rigorousTruncationErrorBound: false as const,
      mechanicalObservableReceiptIncluded: false as const,
    },
    boundaries: [...BOUNDARIES],
  };
  const report = deepFreeze({ ...payload, verificationDigest: digestValue(payload) });
  assertAqueousDynamicsConvergenceVerificationV042(report);
  return report;
}

export function assertAqueousDynamicsConvergenceVerificationV042(
  candidate: unknown,
): asserts candidate is AqueousDynamicsConvergenceReportV042 {
  if (!isRecord(candidate)
    || candidate.schemaVersion !== 'tf.aqueous-dynamics-convergence/0.4.2') {
    throw new Error('unsupported aqueous dynamics convergence verification report');
  }
  assertExactKeys(candidate, [
    'schemaVersion', 'status', 'snapshot', 'ewaldAndComposerComparison',
    'composerFiniteDifference', 'gates', 'claimBoundaries', 'boundaries',
    'verificationDigest',
  ], 'aqueous dynamics convergence report');
  const report = candidate as unknown as AqueousDynamicsConvergenceReportV042;
  const { verificationDigest, ...payload } = report;
  if (verificationDigest !== digestValue(payload)) {
    throw new Error('aqueous dynamics convergence verification digest mismatch');
  }
  const failed = AQUEOUS_DYNAMICS_CONVERGENCE_GATE_NAMES_V042
    .filter((name) => report.gates[name] !== true);
  assertExactKeys(
    report.gates as Record<string, unknown>,
    AQUEOUS_DYNAMICS_CONVERGENCE_GATE_NAMES_V042,
    'aqueous dynamics convergence gates',
  );
  if (failed.length > 0) {
    throw new Error(`aqueous dynamics convergence hard gates failed: ${failed.join(', ')}`);
  }
  assertSnapshotSemantics(report.snapshot);
  assertComparisonSemantics(report.ewaldAndComposerComparison);
  assertFiniteDifferenceSemantics(
    report.composerFiniteDifference,
    report.ewaldAndComposerComparison.forcesByAtom.map((force) => force.atomId),
  );
  if (report.status !== 'deterministic-initial-snapshot-local-verification'
    || report.snapshot.step !== 0 || report.composerFiniteDifference.snapshotStep !== 0
    || report.claimBoundaries.finiteSizeCalibrationOnly !== true
    || report.claimBoundaries.bulkClaim !== false
    || report.claimBoundaries.diluteClaim !== false
    || report.claimBoundaries.equilibriumClaim !== false
    || report.claimBoundaries.externalEngineExecution !== false
    || report.claimBoundaries.externalEngineReproduction !== false
    || report.claimBoundaries.trajectoryEvidence !== false
    || report.claimBoundaries.rigorousTruncationErrorBound !== false
    || report.claimBoundaries.mechanicalObservableReceiptIncluded !== false) {
    throw new Error('aqueous dynamics convergence claim boundary mismatch');
  }
  assertExactKeys(report.claimBoundaries as Record<string, unknown>, [
    'finiteSizeCalibrationOnly', 'bulkClaim', 'diluteClaim', 'equilibriumClaim',
    'externalEngineExecution', 'externalEngineReproduction', 'trajectoryEvidence',
    'rigorousTruncationErrorBound', 'mechanicalObservableReceiptIncluded',
  ], 'aqueous dynamics convergence claim boundaries');
  if (report.boundaries.length !== BOUNDARIES.length
    || report.boundaries.some((boundary, index) => boundary !== BOUNDARIES[index])) {
    throw new Error('aqueous dynamics convergence textual boundaries mismatch');
  }
  assertDeepFrozen(report, 'aqueous dynamics convergence report');
}

function assertSnapshotSemantics(
  snapshot: AqueousDynamicsConvergenceReportV042['snapshot'],
) {
  assertExactKeys(snapshot as Record<string, unknown>, [
    'step', 'stateDigest', 'observationDigest', 'topologyDigest', 'configurationDigest',
    'canonicalPositionDigest', 'snapshotDigest',
  ], 'aqueous dynamics convergence snapshot');
  const { snapshotDigest, ...payload } = snapshot;
  if (snapshot.step !== 0 || snapshotDigest !== digestValue(payload)
    || [snapshot.stateDigest, snapshot.observationDigest, snapshot.topologyDigest,
      snapshot.configurationDigest, snapshot.canonicalPositionDigest]
      .some((value) => !/^sha256:[0-9a-f]{64}$/.test(value))) {
    throw new Error('aqueous dynamics convergence snapshot binding mismatch');
  }
}

function bindInitialSnapshot(initial: AqueousDynamicsObservationV042) {
  const canonicalPositionDigest = digestValue(initial.atoms.map((atom) => ({
    id: atom.id,
    wrappedFractional: atom.position.wrappedFractional,
  })));
  const payload = {
    step: 0 as const,
    stateDigest: initial.stateDigest,
    observationDigest: initial.observationDigest,
    topologyDigest: initial.topologyDigest,
    configurationDigest: initial.configurationDigest,
    canonicalPositionDigest,
  };
  return deepFreeze({ ...payload, snapshotDigest: digestValue(payload) });
}

function compareLooseAndTight(initial: AqueousDynamicsObservationV042, cell: PeriodicCell) {
  const looseSettings = initial.topology.electrostatics;
  const positions = initial.atoms.map((atom) => ({ id: atom.id, position: atom.position }));
  const chargeById = new Map(initial.topology.atoms.map((atom) => [atom.id, atom.chargeE]));
  const ewaldAtoms = positions.map((atom) => ({
    ...atom,
    chargeE: requireMap(chargeById, atom.id, 'initial Ewald atom charge'),
  }));
  const looseOptions = directEwaldOptions(looseSettings, {
    alphaInverseAngstrom: 0.4,
    realSpaceCutoffAngstrom: 9,
    reciprocalCutoffInverseAngstrom: 3,
    maximumRealSpaceCandidates: looseSettings.maximumRealSpaceWorkUnits,
    maximumReciprocalCandidates: looseSettings.maximumReciprocalSpaceWorkUnits,
  });
  const tightOptions = directEwaldOptions(looseSettings, {
    alphaInverseAngstrom: 0.45,
    realSpaceCutoffAngstrom: 18,
    reciprocalCutoffInverseAngstrom: 7,
    maximumRealSpaceCandidates: TIGHT_MAXIMUM_WORK_UNITS,
    maximumReciprocalCandidates: TIGHT_MAXIMUM_WORK_UNITS,
  });
  const looseDirect = evaluateDirectPeriodicEwald(cell, ewaldAtoms, looseOptions);
  const tightDirect = evaluateDirectPeriodicEwald(cell, ewaldAtoms, tightOptions);
  const tightTopologyInput = structuredClone(initial.topology);
  const { topologyDigest: _ignoredDigest, ...withoutDigest } = tightTopologyInput;
  void _ignoredDigest;
  const tightTopology = canonicalizeAqueousTopology({
    ...withoutDigest,
    electrostatics: {
      ...withoutDigest.electrostatics,
      alphaInverseAngstrom: 0.45,
      realSpaceCutoffAngstrom: 18,
      reciprocalCutoffInverseAngstrom: 7,
      maximumRealSpaceWorkUnits: TIGHT_MAXIMUM_WORK_UNITS,
      maximumReciprocalSpaceWorkUnits: TIGHT_MAXIMUM_WORK_UNITS,
    },
  });
  const looseComposer = initial.forceField;
  const tightComposer = evaluateAqueousForceFieldV042(tightTopology, cell, positions);
  const looseDirectEwaldMatchesComposer = directEwaldMatchesComposer(looseDirect, looseComposer);
  const tightDirectEwaldMatchesComposer = directEwaldMatchesComposer(tightDirect, tightComposer);
  const forces = forceDifferences(looseDirect, tightDirect, looseComposer, tightComposer);
  const maximum = maximumForceDifference(forces);
  const signedComposerEnergyDifference = looseComposer.energyKjMol.total
    - tightComposer.energyKjMol.total;
  const absoluteComposerEnergyDifference = Math.abs(signedComposerEnergyDifference);
  const composerDenominator = Math.max(1, Math.abs(tightComposer.energyKjMol.total));
  const directAbsoluteDifference = Math.abs(
    looseDirect.energyKjMol.total - tightDirect.energyKjMol.total,
  );
  const looseDirectWork = directWorkSummary(looseDirect);
  const tightDirectWork = directWorkSummary(tightDirect);
  const workPayload = {
    looseDirectEwald: looseDirectWork,
    tightDirectEwald: tightDirectWork,
    looseComposerTotalWorkUnitsConsumed: looseComposer.workReceipt.totalWorkUnitsConsumed,
    tightComposerTotalWorkUnitsConsumed: tightComposer.workReceipt.totalWorkUnitsConsumed,
    totalReceiptedWorkUnits: safeSum(
      looseDirectWork.totalWorkUnitsConsumed,
      tightDirectWork.totalWorkUnitsConsumed,
      looseComposer.workReceipt.totalWorkUnitsConsumed,
      tightComposer.workReceipt.totalWorkUnitsConsumed,
    ),
    workUnitBoundary: 'published-deterministic-kernel-work-units-not-wall-clock-time' as const,
  };
  const workReceipt = deepFreeze({ ...workPayload, workReceiptDigest: digestValue(workPayload) });
  const comparisonPayload = {
    scope: 'single-locked-initial-snapshot-only' as const,
    interpretation: 'empirical-finite-sum-comparison-not-a-strict-error-bound' as const,
    looseSettings: {
      alphaInverseAngstrom: 0.4 as const,
      realSpaceCutoffAngstrom: 9 as const,
      reciprocalCutoffInverseAngstrom: 3 as const,
    },
    tightSettings: {
      alphaInverseAngstrom: 0.45 as const,
      realSpaceCutoffAngstrom: 18 as const,
      reciprocalCutoffInverseAngstrom: 7 as const,
    },
    looseDirectEwaldEvaluationDigest: digestValue(looseDirect),
    tightDirectEwaldEvaluationDigest: digestValue(tightDirect),
    looseComposerEvaluationDigest: looseComposer.evaluationDigest,
    tightComposerEvaluationDigest: tightComposer.evaluationDigest,
    energyKjMol: {
      looseDirectEwald: looseDirect.energyKjMol.total,
      tightDirectEwald: tightDirect.energyKjMol.total,
      looseComposerDirectEwald: composerDirectEwaldEnergy(looseComposer),
      tightComposerDirectEwald: composerDirectEwaldEnergy(tightComposer),
      absoluteDirectEwaldDifference: directAbsoluteDifference,
      relativeDirectEwaldDifferenceDiagnostic:
        directAbsoluteDifference / Math.max(1, Math.abs(tightDirect.energyKjMol.total)),
      looseComposerTotalPotential: looseComposer.energyKjMol.total,
      tightComposerTotalPotential: tightComposer.energyKjMol.total,
      signedComposerLooseMinusTight: signedComposerEnergyDifference,
      absoluteComposerDifference: absoluteComposerEnergyDifference,
      relativeComposerDifference: absoluteComposerEnergyDifference / composerDenominator,
      relativeComposerDenominator: composerDenominator,
    },
    forcesByAtom: forces,
    maximumAbsoluteComposerForceComponentDifferenceKjMolAngstrom: maximum.value,
    maximumDifferenceLocation: maximum.location,
    thresholds: {
      absoluteEnergyDifferenceKjMol:
        AQUEOUS_DYNAMICS_CONVERGENCE_ABSOLUTE_ENERGY_LIMIT_KJ_MOL_V042,
      relativeEnergyDifference: AQUEOUS_DYNAMICS_CONVERGENCE_RELATIVE_ENERGY_LIMIT_V042,
      maximumForceComponentDifferenceKjMolAngstrom:
        AQUEOUS_DYNAMICS_CONVERGENCE_FORCE_COMPONENT_LIMIT_KJ_MOL_ANGSTROM_V042,
    },
    workReceipt,
  };
  const section = deepFreeze({
    ...comparisonPayload,
    comparisonDigest: digestValue(comparisonPayload),
  });
  return {
    section,
    looseDirectEwaldMatchesComposer,
    tightDirectEwaldMatchesComposer,
    workReceiptClosed: workPayload.totalReceiptedWorkUnits === safeSum(
      looseDirectWork.totalWorkUnitsConsumed,
      tightDirectWork.totalWorkUnitsConsumed,
      looseComposer.workReceipt.totalWorkUnitsConsumed,
      tightComposer.workReceipt.totalWorkUnitsConsumed,
    ),
  };
}

function verifyAllComposerForceComponents(
  initial: AqueousDynamicsObservationV042,
  cell: PeriodicCell,
) {
  const positions = initial.atoms.map((atom) => ({ id: atom.id, position: atom.position }));
  const components: FiniteDifferenceComponent[] = [];
  let perturbationWork = 0;
  for (const atomId of initial.forceField.atomOrder) {
    for (const axis of AXES) {
      const evaluations = OFFSETS.map((offsetSteps) => {
        const evaluation = evaluateAqueousForceFieldV042(
          initial.topology,
          cell,
          displace(positions, cell, atomId, axis, offsetSteps),
        );
        perturbationWork = safeSum(
          perturbationWork,
          evaluation.workReceipt.totalWorkUnitsConsumed,
        );
        return { offsetSteps, evaluation };
      });
      const energy = (offset: -2 | -1 | 1 | 2) => evaluations
        .find((entry) => entry.offsetSteps === offset)!.evaluation.energyKjMol.total;
      const energyDerivative = (
        -energy(2) + 8 * energy(1) - 8 * energy(-1) + energy(-2)
      ) / (12 * AQUEOUS_DYNAMICS_FORCE_DIFFERENCE_STEP_ANGSTROM_V042);
      const numericalForce = canonicalNumber(-energyDerivative);
      const analyticForce = initial.forceField.forceByAtomIdKjMolAngstrom[atomId][axis];
      const signedError = canonicalNumber(analyticForce - numericalForce);
      components.push(deepFreeze({
        atomId,
        axis,
        analyticForceKjMolAngstrom: analyticForce,
        numericalForceKjMolAngstrom: numericalForce,
        signedAnalyticMinusNumericalKjMolAngstrom: signedError,
        absoluteErrorKjMolAngstrom: Math.abs(signedError),
        perturbations: evaluations.map(({ offsetSteps, evaluation }) => ({
          offsetSteps,
          energyKjMol: evaluation.energyKjMol.total,
          evaluationDigest: evaluation.evaluationDigest,
          workUnitsConsumed: evaluation.workReceipt.totalWorkUnitsConsumed,
        })),
      }));
    }
  }
  const maximum = components.reduce((best, component) => (
    component.absoluteErrorKjMolAngstrom > best.absoluteErrorKjMolAngstrom ? component : best
  ));
  const referenceWork = initial.forceField.workReceipt.totalWorkUnitsConsumed;
  const workPayload = {
    referenceEvaluationCount: 1 as const,
    perturbationEvaluationCount: 96 as const,
    referenceEvaluationWorkUnitsConsumed: referenceWork,
    perturbationEvaluationWorkUnitsConsumed: perturbationWork,
    totalReceiptedWorkUnits: safeSum(referenceWork, perturbationWork),
    deterministicOrder:
      'stable-atom-id-then-axis-then-offset-minus2-minus1-plus1-plus2' as const,
    workUnitBoundary: 'published-composer-work-units-not-wall-clock-time' as const,
  };
  const workReceipt = deepFreeze({ ...workPayload, workReceiptDigest: digestValue(workPayload) });
  const sectionPayload = {
    snapshotStep: 0 as const,
    componentCount: 24 as const,
    atomCount: 8 as const,
    axesPerAtom: 3 as const,
    stencil: 'five-point-centered-fourth-order' as const,
    derivativeFormula: '[-E(+2h)+8E(+h)-8E(-h)+E(-2h)]/(12h)' as const,
    forceConvention: 'force-is-negative-energy-gradient' as const,
    gradientTarget:
      'raw-unconstrained-nonbonded-composer-potential-not-rattle-projected-force' as const,
    stepAngstrom: AQUEOUS_DYNAMICS_FORCE_DIFFERENCE_STEP_ANGSTROM_V042,
    absoluteErrorLimitKjMolAngstrom:
      AQUEOUS_DYNAMICS_FORCE_DIFFERENCE_LIMIT_KJ_MOL_ANGSTROM_V042,
    components,
    maximumAbsoluteErrorKjMolAngstrom: maximum.absoluteErrorKjMolAngstrom,
    maximumErrorLocation: { atomId: maximum.atomId, axis: maximum.axis },
    workReceipt,
  };
  const section = deepFreeze({
    ...sectionPayload,
    verificationDigest: digestValue(sectionPayload),
  });
  return {
    section,
    maximumAbsoluteErrorKjMolAngstrom: maximum.absoluteErrorKjMolAngstrom,
    workReceiptClosed: workPayload.totalReceiptedWorkUnits === safeSum(
      referenceWork,
      ...components.flatMap((component) => component.perturbations
        .map((perturbation) => perturbation.workUnitsConsumed)),
    ),
  };
}

function assertComparisonSemantics(
  comparison: AqueousDynamicsConvergenceReportV042['ewaldAndComposerComparison'],
) {
  assertExactKeys(comparison as unknown as Record<string, unknown>, [
    'scope', 'interpretation', 'looseSettings', 'tightSettings',
    'looseDirectEwaldEvaluationDigest', 'tightDirectEwaldEvaluationDigest',
    'looseComposerEvaluationDigest', 'tightComposerEvaluationDigest', 'energyKjMol',
    'forcesByAtom', 'maximumAbsoluteComposerForceComponentDifferenceKjMolAngstrom',
    'maximumDifferenceLocation', 'thresholds', 'workReceipt', 'comparisonDigest',
  ], 'aqueous Ewald comparison');
  for (const [label, settings] of [
    ['loose', comparison.looseSettings],
    ['tight', comparison.tightSettings],
  ] as const) {
    assertExactKeys(settings as unknown as Record<string, unknown>, [
      'alphaInverseAngstrom', 'realSpaceCutoffAngstrom',
      'reciprocalCutoffInverseAngstrom',
    ], `${label} Ewald settings`);
  }
  assertExactKeys(comparison.energyKjMol as unknown as Record<string, unknown>, [
    'looseDirectEwald', 'tightDirectEwald', 'looseComposerDirectEwald',
    'tightComposerDirectEwald', 'absoluteDirectEwaldDifference',
    'relativeDirectEwaldDifferenceDiagnostic', 'looseComposerTotalPotential',
    'tightComposerTotalPotential', 'signedComposerLooseMinusTight',
    'absoluteComposerDifference', 'relativeComposerDifference',
    'relativeComposerDenominator',
  ], 'aqueous Ewald comparison energy');
  assertExactKeys(comparison.maximumDifferenceLocation as unknown as Record<string, unknown>, [
    'atomId', 'axis',
  ], 'aqueous Ewald maximum-force location');
  assertExactKeys(comparison.thresholds as unknown as Record<string, unknown>, [
    'absoluteEnergyDifferenceKjMol', 'relativeEnergyDifference',
    'maximumForceComponentDifferenceKjMolAngstrom',
  ], 'aqueous Ewald comparison thresholds');
  assertExactKeys(comparison.workReceipt as unknown as Record<string, unknown>, [
    'looseDirectEwald', 'tightDirectEwald', 'looseComposerTotalWorkUnitsConsumed',
    'tightComposerTotalWorkUnitsConsumed', 'totalReceiptedWorkUnits',
    'workUnitBoundary', 'workReceiptDigest',
  ], 'aqueous Ewald comparison work receipt');
  for (const [label, summary] of [
    ['loose', comparison.workReceipt.looseDirectEwald],
    ['tight', comparison.workReceipt.tightDirectEwald],
  ] as const) {
    assertExactKeys(summary as unknown as Record<string, unknown>, [
      'realSpaceWorkUnitsConsumed', 'reciprocalSpaceWorkUnitsConsumed',
      'totalWorkUnitsConsumed',
    ], `${label} direct-Ewald work summary`);
  }
  const { comparisonDigest, ...payload } = comparison;
  if (comparisonDigest !== digestValue(payload)) throw new Error('Ewald comparison digest mismatch');
  const { workReceiptDigest, ...workPayload } = comparison.workReceipt;
  if (workReceiptDigest !== digestValue(workPayload)) throw new Error('Ewald work receipt digest mismatch');
  if (comparison.scope !== 'single-locked-initial-snapshot-only'
    || comparison.interpretation !== 'empirical-finite-sum-comparison-not-a-strict-error-bound'
    || comparison.looseSettings.alphaInverseAngstrom !== 0.4
    || comparison.looseSettings.realSpaceCutoffAngstrom !== 9
    || comparison.looseSettings.reciprocalCutoffInverseAngstrom !== 3
    || comparison.tightSettings.alphaInverseAngstrom !== 0.45
    || comparison.tightSettings.realSpaceCutoffAngstrom !== 18
    || comparison.tightSettings.reciprocalCutoffInverseAngstrom !== 7) {
    throw new Error('Ewald comparison settings or scope mismatch');
  }
  if (comparison.thresholds.absoluteEnergyDifferenceKjMol
      !== AQUEOUS_DYNAMICS_CONVERGENCE_ABSOLUTE_ENERGY_LIMIT_KJ_MOL_V042
    || comparison.thresholds.relativeEnergyDifference
      !== AQUEOUS_DYNAMICS_CONVERGENCE_RELATIVE_ENERGY_LIMIT_V042
    || comparison.thresholds.maximumForceComponentDifferenceKjMolAngstrom
      !== AQUEOUS_DYNAMICS_CONVERGENCE_FORCE_COMPONENT_LIMIT_KJ_MOL_ANGSTROM_V042) {
    throw new Error('Ewald comparison thresholds are not locked');
  }
  if ([comparison.looseDirectEwaldEvaluationDigest,
    comparison.tightDirectEwaldEvaluationDigest, comparison.looseComposerEvaluationDigest,
    comparison.tightComposerEvaluationDigest].some((value) => (
    !/^sha256:[0-9a-f]{64}$/.test(value)
  ))) throw new Error('Ewald evaluation digest format mismatch');
  const energy = comparison.energyKjMol;
  const signed = energy.looseComposerTotalPotential - energy.tightComposerTotalPotential;
  const absolute = Math.abs(signed);
  const denominator = Math.max(1, Math.abs(energy.tightComposerTotalPotential));
  const directAbsolute = Math.abs(energy.looseDirectEwald - energy.tightDirectEwald);
  const directRelative = directAbsolute / Math.max(1, Math.abs(energy.tightDirectEwald));
  if (energy.signedComposerLooseMinusTight !== signed
    || energy.absoluteComposerDifference !== absolute
    || energy.relativeComposerDenominator !== denominator
    || energy.relativeComposerDifference !== absolute / denominator
    || energy.absoluteDirectEwaldDifference !== directAbsolute
    || energy.relativeDirectEwaldDifferenceDiagnostic !== directRelative
    || energy.looseComposerDirectEwald !== energy.looseDirectEwald
    || energy.tightComposerDirectEwald !== energy.tightDirectEwald
    || energy.signedComposerLooseMinusTight
      !== energy.looseDirectEwald - energy.tightDirectEwald
    || absolute > AQUEOUS_DYNAMICS_CONVERGENCE_ABSOLUTE_ENERGY_LIMIT_KJ_MOL_V042
    || energy.relativeComposerDifference
      > AQUEOUS_DYNAMICS_CONVERGENCE_RELATIVE_ENERGY_LIMIT_V042) {
    throw new Error('Ewald composer energy comparison is inconsistent');
  }
  const maximum = maximumForceDifference(comparison.forcesByAtom);
  const forceIds = new Set<string>();
  let previousForceId = '';
  for (const force of comparison.forcesByAtom) {
    assertExactKeys(force as unknown as Record<string, unknown>, [
      'atomId', 'looseDirectEwaldKjMolAngstrom', 'tightDirectEwaldKjMolAngstrom',
      'looseComposerDirectEwaldKjMolAngstrom', 'tightComposerDirectEwaldKjMolAngstrom',
      'directEwaldLooseMinusTightKjMolAngstrom', 'looseComposerKjMolAngstrom',
      'tightComposerKjMolAngstrom', 'composerLooseMinusTightKjMolAngstrom',
      'maximumAbsoluteComposerComponentDifferenceKjMolAngstrom',
    ], 'aqueous Ewald per-atom force comparison');
    for (const vector of [
      force.looseDirectEwaldKjMolAngstrom, force.tightDirectEwaldKjMolAngstrom,
      force.looseComposerDirectEwaldKjMolAngstrom,
      force.tightComposerDirectEwaldKjMolAngstrom,
      force.directEwaldLooseMinusTightKjMolAngstrom, force.looseComposerKjMolAngstrom,
      force.tightComposerKjMolAngstrom, force.composerLooseMinusTightKjMolAngstrom,
    ]) assertVectorKeys(vector, 'aqueous Ewald force vector');
    if (forceIds.has(force.atomId)
      || (previousForceId !== '' && compareAscii(force.atomId, previousForceId) <= 0)) {
      throw new Error('Ewald force comparison atom IDs are not unique ASCII order');
    }
    forceIds.add(force.atomId);
    previousForceId = force.atomId;
    let perAtomMaximum = 0;
    for (const axis of AXES) {
      const directDifference = canonicalNumber(
        force.looseDirectEwaldKjMolAngstrom[axis] - force.tightDirectEwaldKjMolAngstrom[axis],
      );
      const composerDifference = canonicalNumber(
        force.looseComposerKjMolAngstrom[axis] - force.tightComposerKjMolAngstrom[axis],
      );
      if (force.looseComposerDirectEwaldKjMolAngstrom[axis]
          !== force.looseDirectEwaldKjMolAngstrom[axis]
        || force.tightComposerDirectEwaldKjMolAngstrom[axis]
          !== force.tightDirectEwaldKjMolAngstrom[axis]
        || force.directEwaldLooseMinusTightKjMolAngstrom[axis] !== directDifference
        || force.composerLooseMinusTightKjMolAngstrom[axis] !== composerDifference
        || composerDifference !== directDifference) {
        throw new Error('Ewald force difference arithmetic mismatch');
      }
      perAtomMaximum = Math.max(perAtomMaximum, Math.abs(composerDifference));
    }
    if (force.maximumAbsoluteComposerComponentDifferenceKjMolAngstrom !== perAtomMaximum) {
      throw new Error('Ewald per-atom force maximum mismatch');
    }
  }
  if (comparison.forcesByAtom.length !== 8
    || forceIds.size !== 8
    || comparison.maximumAbsoluteComposerForceComponentDifferenceKjMolAngstrom !== maximum.value
    || comparison.maximumDifferenceLocation.atomId !== maximum.location.atomId
    || comparison.maximumDifferenceLocation.axis !== maximum.location.axis
    || maximum.value
      > AQUEOUS_DYNAMICS_CONVERGENCE_FORCE_COMPONENT_LIMIT_KJ_MOL_ANGSTROM_V042) {
    throw new Error('Ewald composer force comparison is inconsistent');
  }
  const work = comparison.workReceipt;
  if (work.looseDirectEwald.totalWorkUnitsConsumed !== safeSum(
    work.looseDirectEwald.realSpaceWorkUnitsConsumed,
    work.looseDirectEwald.reciprocalSpaceWorkUnitsConsumed,
  ) || work.tightDirectEwald.totalWorkUnitsConsumed !== safeSum(
    work.tightDirectEwald.realSpaceWorkUnitsConsumed,
    work.tightDirectEwald.reciprocalSpaceWorkUnitsConsumed,
  ) || work.totalReceiptedWorkUnits !== safeSum(
    work.looseDirectEwald.totalWorkUnitsConsumed,
    work.tightDirectEwald.totalWorkUnitsConsumed,
    work.looseComposerTotalWorkUnitsConsumed,
    work.tightComposerTotalWorkUnitsConsumed,
  ) || work.workUnitBoundary
    !== 'published-deterministic-kernel-work-units-not-wall-clock-time') {
    throw new Error('Ewald work receipt does not close');
  }
}

function assertFiniteDifferenceSemantics(
  finiteDifference: AqueousDynamicsConvergenceReportV042['composerFiniteDifference'],
  expectedAtomIds: ReadonlyArray<string>,
) {
  assertExactKeys(finiteDifference as unknown as Record<string, unknown>, [
    'snapshotStep', 'componentCount', 'atomCount', 'axesPerAtom', 'stencil',
    'derivativeFormula', 'forceConvention', 'gradientTarget', 'stepAngstrom',
    'absoluteErrorLimitKjMolAngstrom', 'components', 'maximumAbsoluteErrorKjMolAngstrom',
    'maximumErrorLocation', 'workReceipt', 'verificationDigest',
  ], 'aqueous composer finite-difference section');
  assertExactKeys(
    finiteDifference.maximumErrorLocation as unknown as Record<string, unknown>,
    ['atomId', 'axis'],
    'aqueous finite-difference maximum-error location',
  );
  assertExactKeys(finiteDifference.workReceipt as unknown as Record<string, unknown>, [
    'referenceEvaluationCount', 'perturbationEvaluationCount',
    'referenceEvaluationWorkUnitsConsumed', 'perturbationEvaluationWorkUnitsConsumed',
    'totalReceiptedWorkUnits', 'deterministicOrder', 'workUnitBoundary',
    'workReceiptDigest',
  ], 'aqueous finite-difference work receipt');
  const { verificationDigest, ...payload } = finiteDifference;
  if (verificationDigest !== digestValue(payload)) throw new Error('finite-difference digest mismatch');
  const { workReceiptDigest, ...workPayload } = finiteDifference.workReceipt;
  if (workReceiptDigest !== digestValue(workPayload)) {
    throw new Error('finite-difference work receipt digest mismatch');
  }
  if (finiteDifference.componentCount !== 24 || finiteDifference.components.length !== 24
    || finiteDifference.atomCount !== 8 || finiteDifference.axesPerAtom !== 3
    || finiteDifference.stencil !== 'five-point-centered-fourth-order'
    || finiteDifference.derivativeFormula
      !== '[-E(+2h)+8E(+h)-8E(-h)+E(-2h)]/(12h)'
    || finiteDifference.forceConvention !== 'force-is-negative-energy-gradient'
    || finiteDifference.gradientTarget
      !== 'raw-unconstrained-nonbonded-composer-potential-not-rattle-projected-force'
    || finiteDifference.stepAngstrom !== AQUEOUS_DYNAMICS_FORCE_DIFFERENCE_STEP_ANGSTROM_V042
    || finiteDifference.absoluteErrorLimitKjMolAngstrom
      !== AQUEOUS_DYNAMICS_FORCE_DIFFERENCE_LIMIT_KJ_MOL_ANGSTROM_V042) {
    throw new Error('finite-difference stencil contract mismatch');
  }
  const canonicalExpectedAtomIds = [...expectedAtomIds].sort(compareAscii);
  if (canonicalExpectedAtomIds.length !== 8
    || new Set(canonicalExpectedAtomIds).size !== 8
    || canonicalExpectedAtomIds.some((atomId, index) => atomId !== expectedAtomIds[index])) {
    throw new Error('finite-difference expected atom namespace is not the locked comparison namespace');
  }
  const expectedComponentOrder = canonicalExpectedAtomIds.flatMap((atomId) => (
    AXES.map((axis) => `${atomId}\0${axis}`)
  ));
  const identities = new Set<string>();
  let maximum = finiteDifference.components[0];
  for (const [componentIndex, component] of finiteDifference.components.entries()) {
    assertExactKeys(component as unknown as Record<string, unknown>, [
      'atomId', 'axis', 'analyticForceKjMolAngstrom', 'numericalForceKjMolAngstrom',
      'signedAnalyticMinusNumericalKjMolAngstrom', 'absoluteErrorKjMolAngstrom',
      'perturbations',
    ], 'aqueous finite-difference component');
    const identity = `${component.atomId}\0${component.axis}`;
    identities.add(identity);
    if (identity !== expectedComponentOrder[componentIndex]) {
      throw new Error('finite-difference components are not in locked atom-axis order');
    }
    if (component.perturbations.length !== 4
      || component.perturbations.some((entry, index) => entry.offsetSteps !== OFFSETS[index])) {
      throw new Error('finite-difference perturbation order mismatch');
    }
    for (const perturbation of component.perturbations) {
      assertExactKeys(perturbation as unknown as Record<string, unknown>, [
        'offsetSteps', 'energyKjMol', 'evaluationDigest', 'workUnitsConsumed',
      ], 'aqueous finite-difference perturbation receipt');
    }
    if (!AXES.includes(component.axis)
      || component.perturbations.some((entry) => (
        !/^sha256:[0-9a-f]{64}$/.test(entry.evaluationDigest)
        || !Number.isSafeInteger(entry.workUnitsConsumed) || entry.workUnitsConsumed <= 0
      ))) {
      throw new Error('finite-difference component identity or receipt mismatch');
    }
    const byOffset = new Map(component.perturbations.map((entry) => [entry.offsetSteps, entry]));
    const derivative = (
      -requireMap(byOffset, 2, 'plus-two perturbation').energyKjMol
      + 8 * requireMap(byOffset, 1, 'plus-one perturbation').energyKjMol
      - 8 * requireMap(byOffset, -1, 'minus-one perturbation').energyKjMol
      + requireMap(byOffset, -2, 'minus-two perturbation').energyKjMol
    ) / (12 * finiteDifference.stepAngstrom);
    const numerical = canonicalNumber(-derivative);
    const signed = canonicalNumber(component.analyticForceKjMolAngstrom - numerical);
    if (component.numericalForceKjMolAngstrom !== numerical
      || component.signedAnalyticMinusNumericalKjMolAngstrom !== signed
      || component.absoluteErrorKjMolAngstrom !== Math.abs(signed)) {
      throw new Error('finite-difference component arithmetic mismatch');
    }
    if (component.absoluteErrorKjMolAngstrom > maximum.absoluteErrorKjMolAngstrom) maximum = component;
  }
  if (identities.size !== 24
    || expectedComponentOrder.some((identity) => !identities.has(identity))
    || maximum.absoluteErrorKjMolAngstrom !== finiteDifference.maximumAbsoluteErrorKjMolAngstrom
    || maximum.atomId !== finiteDifference.maximumErrorLocation.atomId
    || maximum.axis !== finiteDifference.maximumErrorLocation.axis
    || maximum.absoluteErrorKjMolAngstrom
      > AQUEOUS_DYNAMICS_FORCE_DIFFERENCE_LIMIT_KJ_MOL_ANGSTROM_V042) {
    throw new Error('finite-difference component coverage or gate mismatch');
  }
  const perturbationWork = safeSum(...finiteDifference.components.flatMap((component) => (
    component.perturbations.map((entry) => entry.workUnitsConsumed)
  )));
  if (finiteDifference.workReceipt.referenceEvaluationCount !== 1
    || finiteDifference.workReceipt.perturbationEvaluationCount !== 96
    || finiteDifference.workReceipt.perturbationEvaluationWorkUnitsConsumed !== perturbationWork
    || finiteDifference.workReceipt.totalReceiptedWorkUnits !== safeSum(
      finiteDifference.workReceipt.referenceEvaluationWorkUnitsConsumed,
      perturbationWork,
    )
    || finiteDifference.workReceipt.deterministicOrder
      !== 'stable-atom-id-then-axis-then-offset-minus2-minus1-plus1-plus2'
    || finiteDifference.workReceipt.workUnitBoundary
      !== 'published-composer-work-units-not-wall-clock-time') {
    throw new Error('finite-difference work receipt does not close');
  }
}

function requireLockedInitialSnapshot(initial: AqueousDynamicsObservationV042) {
  const settings = initial.topology.electrostatics;
  if (initial.step !== 0 || initial.atoms.length !== 8
    || settings.alphaInverseAngstrom !== 0.4
    || settings.realSpaceCutoffAngstrom !== 9
    || settings.reciprocalCutoffInverseAngstrom !== 3) {
    throw new Error('aqueous dynamics convergence requires the locked loose initial snapshot');
  }
}

function directEwaldOptions(
  source: AqueousDynamicsObservationV042['topology']['electrostatics'],
  truncation: Pick<DirectEwaldOptionsV042,
    'alphaInverseAngstrom' | 'realSpaceCutoffAngstrom' | 'reciprocalCutoffInverseAngstrom'
    | 'maximumRealSpaceCandidates' | 'maximumReciprocalCandidates'>,
): DirectEwaldOptionsV042 {
  return {
    ...truncation,
    relativePermittivity: 1,
    neutralityToleranceE: source.neutralityToleranceE,
    electrostaticConstantKjMolAngstromE2: source.electrostaticConstantKjMolAngstromE2,
  };
}

function directEwaldMatchesComposer(
  direct: DirectEwaldEvaluationV042,
  composer: AqueousForceFieldEvaluationV042,
) {
  if (direct.energyKjMol.realSpace !== composer.energyKjMol.ewaldRealSpace
    || direct.energyKjMol.reciprocalSpace !== composer.energyKjMol.ewaldReciprocalSpace
    || direct.energyKjMol.selfCorrection !== composer.energyKjMol.ewaldSelfCorrection) return false;
  return direct.atoms.every((atom) => {
    const directForce = direct.forceByAtomIdKjMolAngstrom[atom.id];
    const components = composer.forceComponentsByAtomIdKjMolAngstrom[atom.id];
    return AXES.every((axis) => directForce[axis] === canonicalNumber(
      components.ewaldRealSpace[axis]
      + components.ewaldReciprocalSpace[axis]
      + components.ewaldSelfCorrection[axis],
    ));
  });
}

function composerDirectEwaldEnergy(composer: AqueousForceFieldEvaluationV042) {
  return canonicalNumber(
    composer.energyKjMol.ewaldRealSpace
    + composer.energyKjMol.ewaldReciprocalSpace
    + composer.energyKjMol.ewaldSelfCorrection,
  );
}

function composerDirectEwaldForce(
  composer: AqueousForceFieldEvaluationV042,
  atomId: string,
) {
  const components = composer.forceComponentsByAtomIdKjMolAngstrom[atomId];
  return cloneVector({
    x: components.ewaldRealSpace.x
      + components.ewaldReciprocalSpace.x + components.ewaldSelfCorrection.x,
    y: components.ewaldRealSpace.y
      + components.ewaldReciprocalSpace.y + components.ewaldSelfCorrection.y,
    z: components.ewaldRealSpace.z
      + components.ewaldReciprocalSpace.z + components.ewaldSelfCorrection.z,
  });
}

function forceDifferences(
  looseDirect: DirectEwaldEvaluationV042,
  tightDirect: DirectEwaldEvaluationV042,
  looseComposer: AqueousForceFieldEvaluationV042,
  tightComposer: AqueousForceFieldEvaluationV042,
) {
  return deepFreeze(looseComposer.atomOrder.map((atomId) => {
    const directDifference = subtract(
      looseDirect.forceByAtomIdKjMolAngstrom[atomId],
      tightDirect.forceByAtomIdKjMolAngstrom[atomId],
    );
    const composerDifference = subtract(
      looseComposer.forceByAtomIdKjMolAngstrom[atomId],
      tightComposer.forceByAtomIdKjMolAngstrom[atomId],
    );
    return {
      atomId,
      looseDirectEwaldKjMolAngstrom: cloneVector(looseDirect.forceByAtomIdKjMolAngstrom[atomId]),
      tightDirectEwaldKjMolAngstrom: cloneVector(tightDirect.forceByAtomIdKjMolAngstrom[atomId]),
      looseComposerDirectEwaldKjMolAngstrom: composerDirectEwaldForce(looseComposer, atomId),
      tightComposerDirectEwaldKjMolAngstrom: composerDirectEwaldForce(tightComposer, atomId),
      directEwaldLooseMinusTightKjMolAngstrom: directDifference,
      looseComposerKjMolAngstrom: cloneVector(looseComposer.forceByAtomIdKjMolAngstrom[atomId]),
      tightComposerKjMolAngstrom: cloneVector(tightComposer.forceByAtomIdKjMolAngstrom[atomId]),
      composerLooseMinusTightKjMolAngstrom: composerDifference,
      maximumAbsoluteComposerComponentDifferenceKjMolAngstrom:
        Math.max(...AXES.map((axis) => Math.abs(composerDifference[axis]))),
    };
  }));
}

function maximumForceDifference(forces: ReadonlyArray<PerAtomForceDifference>) {
  if (forces.length === 0) throw new Error('force comparison requires at least one atom');
  let value = -1;
  let location: { atomId: string; axis: Axis } = { atomId: '', axis: 'x' };
  for (const force of forces) {
    for (const axis of AXES) {
      const candidate = Math.abs(force.composerLooseMinusTightKjMolAngstrom[axis]);
      if (candidate > value) {
        value = candidate;
        location = { atomId: force.atomId, axis };
      }
    }
  }
  return { value, location };
}

function directWorkSummary(evaluation: DirectEwaldEvaluationV042): WorkSummary {
  const real = evaluation.enumeration.realSpaceWorkUnitsConsumed;
  const reciprocal = evaluation.enumeration.reciprocalWorkUnitsConsumed;
  return deepFreeze({
    realSpaceWorkUnitsConsumed: real,
    reciprocalSpaceWorkUnitsConsumed: reciprocal,
    totalWorkUnitsConsumed: safeSum(real, reciprocal),
  });
}

function displace(
  positions: ReadonlyArray<AqueousForceFieldPositionV042>,
  cell: PeriodicCell,
  atomId: string,
  axis: Axis,
  offsetSteps: -2 | -1 | 1 | 2,
) {
  return positions.map((candidate) => {
    if (candidate.id !== atomId) return candidate;
    const cartesian = cell.unwrappedCartesian(candidate.position);
    const displaced = {
      ...cartesian,
      [axis]: cartesian[axis]
        + offsetSteps * AQUEOUS_DYNAMICS_FORCE_DIFFERENCE_STEP_ANGSTROM_V042,
    };
    return { id: candidate.id, position: cell.wrapCartesian(displaced) };
  });
}

function safeSum(...values: number[]) {
  const total = values.reduce((sum, value) => sum + value, 0);
  if (!Number.isSafeInteger(total) || values.some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error('aqueous convergence work units exceed the nonnegative safe-integer domain');
  }
  return total;
}

function canonicalNumber(value: number) { return Object.is(value, -0) ? 0 : value; }

function cloneVector(vector: Vector3): Vector3 {
  return { x: canonicalNumber(vector.x), y: canonicalNumber(vector.y), z: canonicalNumber(vector.z) };
}

function subtract(left: Vector3, right: Vector3): Vector3 {
  return cloneVector({ x: left.x - right.x, y: left.y - right.y, z: left.z - right.z });
}

function requireMap<Key, Value>(map: ReadonlyMap<Key, Value>, key: Key, label: string) {
  const value = map.get(key);
  if (value === undefined) throw new Error(`${label} is missing`);
  return value;
}

function assertVectorKeys(vector: Vector3, label: string) {
  assertExactKeys(vector as unknown as Record<string, unknown>, ['x', 'y', 'z'], label);
  if (![vector.x, vector.y, vector.z].every(Number.isFinite)) {
    throw new Error(`${label} contains a non-finite component`);
  }
}

function compareAscii(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function assertExactKeys(value: Record<string, unknown>, expected: ReadonlyArray<string>, label: string) {
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new Error(`${label} keys mismatch`);
  }
}

function assertDeepFrozen(value: unknown, label: string) {
  if (value && typeof value === 'object') {
    if (!Object.isFrozen(value)) throw new Error(`${label} is not deeply frozen`);
    for (const child of Object.values(value)) assertDeepFrozen(child, label);
  }
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
