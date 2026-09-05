import { readFile, realpath, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const root = process.cwd();
if (process.env.TAILING_SENTINEL_SNAPSHOT !== '1' || !path.basename(root).startsWith('.tailing-sentinel-')) {
  throw new Error('Evaluator worker must run only inside a launcher-created snapshot.');
}
const dependencyRoot = await realpath(path.join(path.dirname(root), 'node_modules'));
for (const specifier of ['ajv/dist/2020.js', 'js-yaml']) {
  const resolved = await realpath(fileURLToPath(import.meta.resolve(specifier)));
  if (resolved !== dependencyRoot && !resolved.startsWith(`${dependencyRoot}${path.sep}`)) {
    throw new Error(`Evaluator dependency resolution escaped the workspace node_modules trust boundary: ${specifier}.`);
  }
}
const projectSpecifiers = [
  '../lib/simulation/thermochemical-world.ts',
  '../lib/simulation/molecular-world.ts',
  '../lib/simulation/periodic-verification.ts',
  '../lib/simulation/aqueous-foundation-verification.ts',
  '../lib/simulation/aqueous-system-spec.ts',
  '../lib/simulation/nacl-water-interface-system-v0410.ts',
  '../lib/simulation/periodic-atomistic-world.ts',
  '../lib/simulation/digest.ts',
  './atomistic/full-candidate-plan-policy.mjs',
  './atomistic/full-candidate-execution-preflight-policy.mjs',
  './atomistic/full-candidate-observer-vnext.mjs',
  './atomistic/random-tp-rights-disposition-policy.mjs',
  './workflow-policy.mjs',
  './comparator-evidence-policy.mjs',
  './source-snapshot.mjs',
  './source-scope.mjs',
];
const canonicalRoot = await realpath(root);
for (const specifier of projectSpecifiers) {
  const resolved = await realpath(fileURLToPath(import.meta.resolve(specifier)));
  if (resolved !== canonicalRoot && !resolved.startsWith(`${canonicalRoot}${path.sep}`)) {
    throw new Error(`Evaluator project module escaped the frozen snapshot: ${specifier}.`);
  }
}
const [
  { default: Ajv2020 },
  { runThermochemicalVerification, ThermochemicalWorld },
  { MolecularDynamicsWorld },
  {
    assertPeriodicAtomisticVerification,
    PERIODIC_ATOMISTIC_VERIFICATION_GATE_NAMES,
    runPeriodicAtomisticVerification,
  },
  {
    AQUEOUS_FOUNDATION_GATE_NAMES,
    assertAqueousFoundationVerification,
    runAqueousFoundationVerification,
  },
  {
    assertOpenMmTip3pControlPlanV044,
    createOpenMmTip3pControlPlanV044,
  },
  {
    assertNaClWaterInterfacePlanV0410,
    createNaClWaterInterfaceActionV0410,
    createNaClWaterInterfacePlanV0410,
    observeNaClWaterInterfaceActionV0410,
  },
  { createPeriodicArgonCalibrationWorld },
  { digestValue, shortDigest },
  {
    FULL_CANDIDATE_DATASET_CATALOG_FROZEN_AT,
    FULL_CANDIDATE_PLAN_RAW_DIGEST,
    FULL_CANDIDATE_PLAN_SCHEMA_RAW_DIGEST,
    FULL_CANDIDATE_PRODUCER_OUTCOME_SCHEMA_RAW_DIGEST,
    FULL_CANDIDATE_RECEIPT_SCHEMA_RAW_DIGEST,
  },
  {
    FULL_CANDIDATE_EXECUTION_PREFLIGHT_PATH,
    validateFullCandidateExecutionPreflightRepository,
  },
  {
    OBSERVER_CONTRACT_PATH,
    OBSERVER_CONTRACT_SCHEMA_PATH,
    OBSERVER_RECEIPT_SCHEMA_PATH,
    OBSERVER_WORKFLOW_SOURCE_PATH,
    validateObserverContractRepository,
  },
  {
    EXPECTED_LOCAL_EVIDENCE,
    RANDOM_TP_RIGHTS_DISPOSITION_PATH,
    RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_PATH,
    validateRandomTpRightsDispositionRepository,
  },
  { inspectDockerfileSource, inspectDockerignoreSource, inspectWorkflowSource },
  { validateComparatorEvidenceRegistry },
  { captureProjectSourceSnapshot },
  { selectProjectSourceFiles },
] = await Promise.all([
  import('ajv/dist/2020.js'),
  import('../lib/simulation/thermochemical-world.ts'),
  import('../lib/simulation/molecular-world.ts'),
  import('../lib/simulation/periodic-verification.ts'),
  import('../lib/simulation/aqueous-foundation-verification.ts'),
  import('../lib/simulation/aqueous-system-spec.ts'),
  import('../lib/simulation/nacl-water-interface-system-v0410.ts'),
  import('../lib/simulation/periodic-atomistic-world.ts'),
  import('../lib/simulation/digest.ts'),
  import('./atomistic/full-candidate-plan-policy.mjs'),
  import('./atomistic/full-candidate-execution-preflight-policy.mjs'),
  import('./atomistic/full-candidate-observer-vnext.mjs'),
  import('./atomistic/random-tp-rights-disposition-policy.mjs'),
  import('./workflow-policy.mjs'),
  import('./comparator-evidence-policy.mjs'),
  import('./source-snapshot.mjs'),
  import('./source-scope.mjs'),
]);
const control = await readSnapshotControl(root);
const sourceFiles = control.sourceFiles;
const sourceSnapshot = await captureProjectSourceSnapshot(root, sourceFiles);
const sourceManifest = sourceSnapshot.sourceManifest();
const artifactDigest = sourceSnapshot.artifactDigest();
if (JSON.stringify(sourceManifest) !== JSON.stringify(control.sourceManifest)
  || artifactDigest !== control.artifactDigest) {
  throw new Error('Materialized evaluator source does not match the launcher snapshot.');
}
const readSnapshotText = (relativePath) => sourceSnapshot.text(relativePath);
const readJson = async (relativePath) => JSON.parse(readSnapshotText(relativePath));
const scorecard = await readJson('evaluation/current-scorecard.json');
const registry = await readJson('evaluation/baselines/registry.json');
const worldSchema = await readJson('schemas/world-state.schema.json');
const actionSchema = await readJson('schemas/action.schema.json');
const molecularWorldSchema = await readJson('schemas/molecular-world-state.schema.json');
const molecularActionSchema = await readJson('schemas/molecular-action.schema.json');
const molecularObservationSchema = await readJson('schemas/molecular-observation.schema.json');
const periodicAtomisticWorldSchema = await readJson('schemas/periodic-atomistic-world-state.schema.json');
const periodicAtomisticActionSchema = await readJson('schemas/periodic-atomistic-action.schema.json');
const periodicAtomisticObservationSchema = await readJson('schemas/periodic-atomistic-observation.schema.json');
const aqueousSystemSpecSchema = await readJson('schemas/aqueous-system-spec.schema.json');
const aqueousForceBackendManifestSchema = await readJson('schemas/aqueous-force-backend-manifest.schema.json');
const naclWaterInterfaceSystemSchema = await readJson('schemas/nacl-water-interface-system.schema.json');
const naclWaterInterfaceCoordinateSeedSchema = await readJson('schemas/nacl-water-interface-coordinate-seed.schema.json');
const naclWaterInterfacePlanSchema = await readJson('schemas/nacl-water-interface-plan.schema.json');
const naclWaterInterfaceActionSchema = await readJson('schemas/nacl-water-interface-action.schema.json');
const naclWaterInterfaceObservationSchema = await readJson('schemas/nacl-water-interface-observation.schema.json');
const naclWaterInterfaceImportReceiptSchema = await readJson(
  'schemas/nacl-water-interface-import-receipt.schema.json',
);
const atomisticPlan = await readJson('evaluation/atomistic/reproduction-plan.json');
const atomisticPlanSchema = await readJson('schemas/atomistic-reproduction.schema.json');
const atomisticCandidatePlan = await readJson('evaluation/atomistic/full-candidate-plan.json');
const atomisticCandidatePlanSchema = await readJson('schemas/atomistic-full-candidate-plan.schema.json');
const atomisticCandidateReceiptSchema = await readJson('schemas/atomistic-full-candidate-receipt.schema.json');
const atomisticCandidateProducerOutcomeSchema = await readJson('schemas/atomistic-full-candidate-producer-outcome.schema.json');
const datasetCatalog = await readJson('evaluation/data/datasets.json');
const evaluationSchema = await readJson('schemas/evaluation-report.schema.json');
const hardGateFailures = [...scorecard.hardGateFailures];

const upstreamGates = Object.fromEntries(
  ['install', 'lint', 'typecheck', 'test', 'atomistic_manifest', 'build', 'audit'].map((name) => [name, process.env[`TAILING_${name.toUpperCase()}_STATUS`] ?? 'not-reported-local']),
);
for (const [name, status] of Object.entries(upstreamGates)) {
  if (status !== 'not-reported-local' && status !== 'success') hardGateFailures.push(`Upstream ${name} gate ended with ${status}.`);
}

const totalWeight = scorecard.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
if (totalWeight !== 100) hardGateFailures.push(`Scorecard weights must total 100; received ${totalWeight}.`);

const evidenceManifest = {};
for (const dimension of scorecard.dimensions) {
  if (!Number.isInteger(dimension.score) || dimension.score < 0 || dimension.score > 4) hardGateFailures.push(`${dimension.id}: evidence score must be an integer from 0 to 4.`);
  if (!Number.isInteger(dimension.promotionFloor) || dimension.promotionFloor < 0 || dimension.promotionFloor > 4) hardGateFailures.push(`${dimension.id}: promotion floor must be an integer from 0 to 4.`);
  if (dimension.score < dimension.promotionFloor) hardGateFailures.push(`${dimension.id}: E${dimension.score} is below the candidate promotion floor E${dimension.promotionFloor}.`);
  if (dimension.score > 0 && (!Array.isArray(dimension.evidence) || dimension.evidence.length === 0)) hardGateFailures.push(`${dimension.id}: non-zero score has no evidence statement.`);
  if (dimension.score > 0 && (!Array.isArray(dimension.evidenceArtifacts) || dimension.evidenceArtifacts.length === 0)) hardGateFailures.push(`${dimension.id}: non-zero score has no executable evidence artifact.`);
  if (!dimension.acceptanceTest) hardGateFailures.push(`${dimension.id}: next iteration lacks an acceptance test.`);
  for (const relativePath of dimension.evidenceArtifacts ?? []) {
    if (!sourceSnapshot.has(relativePath)) {
      hardGateFailures.push(`${dimension.id}: evidence artifact is missing: ${relativePath}.`);
    } else if (!(relativePath in evidenceManifest)) {
      evidenceManifest[relativePath] = sourceSnapshot.digest(relativePath);
    }
  }
}

if (registry.snapshotDate !== scorecard.baselineSnapshotDate) hardGateFailures.push('Comparator registry and candidate scorecard use different snapshot dates.');
for (const comparator of registry.comparators) {
  for (const key of ['id', 'name', 'scope', 'source', 'revision', 'evidenceClass', 'claimOwner', 'comparable', 'reason']) {
    if (!(key in comparator) || comparator[key] === '') hardGateFailures.push(`${comparator.id ?? 'unknown comparator'}: missing ${key}.`);
  }
  for (const key of ['sourceCommit', 'sourceDigest', 'benchmarkCommit', 'checkpointDigest', 'datasetDigest', 'runnerDigest']) {
    if (!(key in comparator)) hardGateFailures.push(`${comparator.id ?? 'unknown comparator'}: missing explicit ${key} field.`);
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(comparator.sourceDigest ?? '')) hardGateFailures.push(`${comparator.id}: sourceDigest must be a concrete SHA-256 digest.`);
  for (const key of ['sourceCommit', 'benchmarkCommit']) {
    if (comparator[key] !== null && !/^[0-9a-f]{40}$/.test(comparator[key])) hardGateFailures.push(`${comparator.id}: ${key} must be null or a full Git commit.`);
  }
  for (const key of ['checkpointDigest', 'datasetDigest', 'runnerDigest']) {
    if (comparator[key] !== null && !/^sha256:[0-9a-f]{64}$/.test(comparator[key])) hardGateFailures.push(`${comparator.id}: ${key} must be null or a concrete SHA-256 digest.`);
  }
  if (!['claim', 'auditable', 'reference', 'reproduced'].includes(comparator.evidenceClass)) hardGateFailures.push(`${comparator.id}: invalid evidence class.`);
  if (comparator.evidenceClass !== 'reproduced' && comparator.comparable) hardGateFailures.push(`${comparator.id}: only locally reproduced evidence can enter numeric ranking.`);
  if (comparator.evidenceClass === 'reproduced' && (!comparator.runnerDigest || !comparator.datasetDigest)) hardGateFailures.push(`${comparator.id}: reproduced evidence lacks runner or dataset digest.`);
}
const comparatorReceiptFailures = await validateComparatorEvidenceRegistry(registry, { root });
hardGateFailures.push(...comparatorReceiptFailures);

const snapshotAgeDays = Math.floor((Date.now() - Date.parse(`${registry.snapshotDate}T00:00:00Z`)) / 86_400_000);
if (!Number.isFinite(snapshotAgeDays) || snapshotAgeDays < 0) hardGateFailures.push('Comparator registry snapshot date is invalid or in the future.');
if (snapshotAgeDays > 45) hardGateFailures.push(`Comparator registry is ${snapshotAgeDays} days old; refresh and review it before promotion.`);

const verificationStarted = performance.now();
let physicsVerification = null;
try {
  physicsVerification = runThermochemicalVerification({ profile: 'pr' });
  const checks = [
    ['Fourier heat-mode relative L2 error', physicsVerification.heatModeRelativeL2Error < 2e-3, physicsVerification.heatModeRelativeL2Error],
    ['Periodic heat-field energy residual', Math.abs(physicsVerification.heatEnergyResidual) < 5e-12, physicsVerification.heatEnergyResidual],
    ['Two-dimensional Fourier convergence order', physicsVerification.fourierMinimumObservedOrder >= 1.8, physicsVerification.fourierMinimumObservedOrder],
    ['Two-dimensional Fourier energy closure', physicsVerification.fourierMaximumEnergyResidual <= 5e-12, physicsVerification.fourierMaximumEnergyResidual],
    ['Grid-independent total heat capacity', physicsVerification.gridHeatCapacitySpread < 1e-12, physicsVerification.gridHeatCapacitySpread],
    ['Grid-independent uniform field energy', physicsVerification.gridEnergySpread < 1e-12, physicsVerification.gridEnergySpread],
    ['Analytic exchange matrix difference decay', physicsVerification.analyticExchangeMatrix.maximumDifferenceRatioError <= 2e-12, physicsVerification.analyticExchangeMatrix.maximumDifferenceRatioError],
    ['Analytic exchange semigroup', physicsVerification.analyticExchangeMatrix.maximumSemigroupError <= 2e-12, physicsVerification.analyticExchangeMatrix.maximumSemigroupError],
    ['Forced A-to-B reaction settlement', physicsVerification.forcedReactionConsumedA === 1 && physicsVerification.forcedReactionProducedB === 1, `${physicsVerification.forcedReactionConsumedA}/${physicsVerification.forcedReactionProducedB}`],
    ['Forced reaction energy closure', physicsVerification.forcedReactionClosureResidual <= 1e-12, physicsVerification.forcedReactionClosureResidual],
    ['Closed coupled-world relative energy residual', physicsVerification.coupledEnergyResidual < 2e-3, physicsVerification.coupledEnergyResidual],
    ['Closed coupled-world momentum residual', physicsVerification.momentumResidual < 1e-10, physicsVerification.momentumResidual],
    ['Raw particle momentum residual', physicsVerification.rawParticleMomentumResidual < 1e-10, physicsVerification.rawParticleMomentumResidual],
    ['Species conservation residual', physicsVerification.speciesResidual === 0, physicsVerification.speciesResidual],
    ['Mass conservation residual', physicsVerification.massResidual === 0, physicsVerification.massResidual],
    ['Non-trivial interface exchange', physicsVerification.interfaceEnergyMoved > 0, physicsVerification.interfaceEnergyMoved],
    ['Coupling particle coverage', physicsVerification.couplingCoverage >= 0.9, physicsVerification.couplingCoverage],
    ['Trajectory minimum coupling coverage', physicsVerification.minimumCouplingCoverage >= 0.9, physicsVerification.minimumCouplingCoverage],
    ['Non-trivial reaction trajectory', physicsVerification.reactionCount > 0, physicsVerification.reactionCount],
    ['Heat-operator closure residual', physicsVerification.heatClosureResidual < 1e-8, physicsVerification.heatClosureResidual],
    ['Particle-field exchange closure residual', physicsVerification.exchangeClosureResidual < 1e-8, physicsVerification.exchangeClosureResidual],
    ['Reaction closure residual', physicsVerification.reactionClosureResidual < 1e-10, physicsVerification.reactionClosureResidual],
    ['Maximum operator closure relative residual', physicsVerification.maximumOperatorClosureRelative <= 1e-12, physicsVerification.maximumOperatorClosureRelative],
    ['Heat cumulative closure relative residual', physicsVerification.heatClosureRelative <= 1e-10, physicsVerification.heatClosureRelative],
    ['Exchange cumulative closure relative residual', physicsVerification.exchangeClosureRelative <= 1e-10, physicsVerification.exchangeClosureRelative],
    ['Reaction cumulative closure relative residual', physicsVerification.reactionClosureRelative <= 1e-10, physicsVerification.reactionClosureRelative],
    ['Deterministic full-state replay', physicsVerification.deterministicReplay === true, physicsVerification.deterministicReplay],
    ['PR ensemble size and horizon', physicsVerification.ensemble.seeds.length === 8 && physicsVerification.ensemble.horizonSteps === 5000, `${physicsVerification.ensemble.seeds.length}x${physicsVerification.ensemble.horizonSteps}`],
    ['PR ensemble p95 energy tail', physicsVerification.ensemble.energyResidualTail.p95 <= 3e-4, physicsVerification.ensemble.energyResidualTail.p95],
    ['PR ensemble maximum energy tail', physicsVerification.ensemble.energyResidualTail.maximum <= 5e-4, physicsVerification.ensemble.energyResidualTail.maximum],
    ['PR ensemble momentum maximum', physicsVerification.ensemble.maximumMomentumResidual <= 1e-10, physicsVerification.ensemble.maximumMomentumResidual],
    ['PR ensemble raw momentum maximum', physicsVerification.ensemble.maximumRawParticleMomentumResidual <= 1e-10, physicsVerification.ensemble.maximumRawParticleMomentumResidual],
    ['PR ensemble minimum coverage', physicsVerification.ensemble.minimumCouplingCoverage >= 0.9, physicsVerification.ensemble.minimumCouplingCoverage],
    ['PR ensemble deterministic continuations', physicsVerification.ensemble.deterministicContinuations === physicsVerification.ensemble.seeds.length, physicsVerification.ensemble.deterministicContinuations],
    ['PR ensemble remains in domain', physicsVerification.ensemble.allInDomain === true, physicsVerification.ensemble.allInDomain],
    ['Locked trajectory remains in domain', physicsVerification.inDomain === true, physicsVerification.inDomain],
  ];
  for (const [label, passed, value] of checks) if (!passed) hardGateFailures.push(`${label} failed with ${String(value)}.`);
} catch (error) {
  hardGateFailures.push(`Thermochemical verification crashed: ${error instanceof Error ? error.message : String(error)}.`);
}

let molecularVerification = null;
try {
  const first = new MolecularDynamicsWorld();
  const replay = new MolecularDynamicsWorld();
  let maximumRelativeEnergyExcursion = 0;
  let maximumMomentumResidual = 0;
  let maximumCenterOfMassResidualAngstrom = 0;
  let maximumInternalForceResidualKjMolAngstrom = 0;
  for (let index = 0; index < 100; index += 1) {
    const frame = first.advance(100);
    replay.advance(100);
    maximumRelativeEnergyExcursion = Math.max(maximumRelativeEnergyExcursion, frame.energy.maximumRelativeExcursion);
    maximumMomentumResidual = Math.max(maximumMomentumResidual, frame.conservation.momentumResidual);
    maximumCenterOfMassResidualAngstrom = Math.max(maximumCenterOfMassResidualAngstrom, frame.conservation.centerOfMassResidualAngstrom);
    maximumInternalForceResidualKjMolAngstrom = Math.max(maximumInternalForceResidualKjMolAngstrom, frame.conservation.internalForceResidualKjMolAngstrom);
  }
  const finalFrame = first.observe();
  const replayFrame = replay.observe();
  const deterministicPhysicalReplay = finalFrame.physicalDigest === replayFrame.physicalDigest;
  const deterministicFullStateReplay = JSON.stringify(first.serialize()) === JSON.stringify(replay.serialize());
  const deterministicObservationReplay = JSON.stringify(finalFrame) === JSON.stringify(replayFrame);
  molecularVerification = {
    steps: finalFrame.step,
    timePicoseconds: finalFrame.timePicoseconds,
    maximumRelativeEnergyExcursion,
    linearRelativeDriftRatePerPicosecond: finalFrame.energy.linearRelativeDriftRatePerPicosecond,
    energyDriftSampleCount: finalFrame.energy.driftSampleCount,
    maximumMomentumResidual,
    maximumCenterOfMassResidualAngstrom,
    maximumInternalForceResidualKjMolAngstrom,
    maximumBondResidualAngstrom: finalFrame.conservation.maximumBondResidualAngstrom,
    maximumAngleResidualDegrees: finalFrame.conservation.maximumAngleResidualDegrees,
    deterministicPhysicalReplay,
    deterministicFullStateReplay,
    deterministicObservationReplay,
    deterministicReplay: deterministicPhysicalReplay && deterministicFullStateReplay && deterministicObservationReplay,
  };
  const molecularChecks = [
    ['Molecular 10,000-step horizon', molecularVerification.steps === 10_000, molecularVerification.steps],
    ['Molecular energy envelope', molecularVerification.maximumRelativeEnergyExcursion <= 1e-4, molecularVerification.maximumRelativeEnergyExcursion],
    ['Molecular energy sample count', molecularVerification.energyDriftSampleCount === 10_001, molecularVerification.energyDriftSampleCount],
    ['Molecular momentum closure', molecularVerification.maximumMomentumResidual <= 1e-9, molecularVerification.maximumMomentumResidual],
    ['Molecular COM closure', molecularVerification.maximumCenterOfMassResidualAngstrom <= 1e-9, molecularVerification.maximumCenterOfMassResidualAngstrom],
    ['Molecular internal-force closure', molecularVerification.maximumInternalForceResidualKjMolAngstrom <= 1e-9, molecularVerification.maximumInternalForceResidualKjMolAngstrom],
    ['Molecular rigid bond closure', molecularVerification.maximumBondResidualAngstrom <= 1e-12, molecularVerification.maximumBondResidualAngstrom],
    ['Molecular rigid angle closure', molecularVerification.maximumAngleResidualDegrees <= 1e-10, molecularVerification.maximumAngleResidualDegrees],
    ['Molecular deterministic physical replay', molecularVerification.deterministicPhysicalReplay === true, molecularVerification.deterministicPhysicalReplay],
    ['Molecular deterministic full-state replay', molecularVerification.deterministicFullStateReplay === true, molecularVerification.deterministicFullStateReplay],
    ['Molecular deterministic observation replay', molecularVerification.deterministicObservationReplay === true, molecularVerification.deterministicObservationReplay],
  ];
  for (const [label, passed, value] of molecularChecks) if (!passed) hardGateFailures.push(`${label} failed with ${String(value)}.`);
} catch (error) {
  hardGateFailures.push(`Molecular verification crashed: ${error instanceof Error ? error.message : String(error)}.`);
}

let periodicAtomisticVerification = null;
try {
  periodicAtomisticVerification = runPeriodicAtomisticVerification();
  const failedPeriodicGates = PERIODIC_ATOMISTIC_VERIFICATION_GATE_NAMES
    .filter((gateName) => periodicAtomisticVerification[gateName] !== true);
  for (const gateName of failedPeriodicGates) {
    hardGateFailures.push(`Periodic atomistic ${gateName} hard gate failed.`);
  }
  try {
    assertPeriodicAtomisticVerification(periodicAtomisticVerification);
  } catch (error) {
    hardGateFailures.push(`Periodic atomistic verification assertion failed: ${error instanceof Error ? error.message : String(error)}.`);
  }
} catch (error) {
  hardGateFailures.push(`Periodic atomistic verification crashed: ${error instanceof Error ? error.message : String(error)}.`);
}

let aqueousFoundationVerification = null;
try {
  aqueousFoundationVerification = runAqueousFoundationVerification();
  const failedAqueousFoundationGates = AQUEOUS_FOUNDATION_GATE_NAMES
    .filter((gateName) => aqueousFoundationVerification.gates[gateName] !== true);
  for (const gateName of failedAqueousFoundationGates) {
    hardGateFailures.push(`Aqueous foundation ${gateName} hard gate failed.`);
  }
  for (const boundaryName of [
    'naclWaterTrajectory',
    'pmeExecution',
    'openmmExecution',
    'intramolecularExclusions',
    'virialOrStress',
    'fullVelocityVerletRattleIntegrator',
    'constraintImpulseEnergyAudit',
    'licenseClearance',
    'externalModelReproduction',
    'scorePromotionEligible',
  ]) {
    if (aqueousFoundationVerification.boundaries[boundaryName] !== false) {
      hardGateFailures.push(`Aqueous foundation unsupported boundary ${boundaryName} must remain false.`);
    }
  }
  try {
    assertAqueousFoundationVerification(aqueousFoundationVerification);
  } catch (error) {
    hardGateFailures.push(`Aqueous foundation verification assertion failed: ${error instanceof Error ? error.message : String(error)}.`);
  }
} catch (error) {
  hardGateFailures.push(`Aqueous foundation verification crashed: ${error instanceof Error ? error.message : String(error)}.`);
}

let schemaVerification = {
  world: false,
  action: false,
  actionMutationCorpus: false,
  runtimeActionSemantics: false,
  molecularWorld: false,
  molecularAction: false,
  molecularObservation: false,
  molecularRuntimeSemantics: false,
  periodicAtomisticWorld: false,
  periodicAtomisticAction: false,
  periodicAtomisticObservation: false,
  aqueousSystemSpec: false,
  aqueousForceBackends: false,
  aqueousControlPlanSemantics: false,
  naclWaterInterfaceContract: false,
  naclWaterInterfaceImportContract: false,
  atomisticPlan: false,
  datasetCatalog: false,
  workflowPolicy: false,
  comparatorReceipts: false,
};
try {
  const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
  const validateWorld = ajv.compile(worldSchema);
  const validateAction = ajv.compile(actionSchema);
  const validateMolecularWorld = ajv.compile(molecularWorldSchema);
  const validateMolecularAction = ajv.compile(molecularActionSchema);
  const validateMolecularObservation = ajv.compile(molecularObservationSchema);
  const validatePeriodicAtomisticWorld = ajv.compile(periodicAtomisticWorldSchema);
  const validatePeriodicAtomisticAction = ajv.compile(periodicAtomisticActionSchema);
  const validatePeriodicAtomisticObservation = ajv.compile(periodicAtomisticObservationSchema);
  const validateAqueousSystemSpec = ajv.compile(aqueousSystemSpecSchema);
  const validateAqueousForceBackendManifest = ajv.compile(aqueousForceBackendManifestSchema);
  const interfaceAjv = new Ajv2020({ allErrors: true, strict: true, strictNumbers: true });
  for (const schema of [
    naclWaterInterfaceSystemSchema,
    naclWaterInterfaceCoordinateSeedSchema,
    naclWaterInterfacePlanSchema,
    naclWaterInterfaceActionSchema,
    naclWaterInterfaceObservationSchema,
    naclWaterInterfaceImportReceiptSchema,
  ]) interfaceAjv.addSchema(schema);
  const validateNaClWaterInterfaceSystem = interfaceAjv.getSchema(
    'https://tailing.future/schemas/nacl-water-interface-system/0.4.10',
  );
  const validateNaClWaterInterfaceCoordinateSeed = interfaceAjv.getSchema(
    'https://tailing.future/schemas/nacl-water-interface-coordinate-seed/0.4.10',
  );
  const validateNaClWaterInterfacePlan = interfaceAjv.getSchema(
    'https://tailing.future/schemas/nacl-water-interface-plan/0.4.10',
  );
  const validateNaClWaterInterfaceAction = interfaceAjv.getSchema(
    'https://tailing.future/schemas/nacl-water-interface-action/0.4.10',
  );
  const validateNaClWaterInterfaceObservation = interfaceAjv.getSchema(
    'https://tailing.future/schemas/nacl-water-interface-observation/0.4.10',
  );
  const validateNaClWaterInterfaceImportReceipt = interfaceAjv.getSchema(
    'https://tailing.future/schemas/nacl-water-interface-import-receipt/0.4.11',
  );
  if (!validateNaClWaterInterfaceSystem || !validateNaClWaterInterfaceCoordinateSeed
    || !validateNaClWaterInterfacePlan || !validateNaClWaterInterfaceAction
    || !validateNaClWaterInterfaceObservation) {
    throw new Error('NaCl-water interface v0.4.10 schema registration is incomplete.');
  }
  const validateAtomisticPlan = ajv.compile(atomisticPlanSchema);
  const validateAtomisticCandidatePlan = ajv.compile(atomisticCandidatePlanSchema);
  ajv.compile(atomisticCandidateReceiptSchema);
  ajv.compile(atomisticCandidateProducerOutcomeSchema);
  const sample = new ThermochemicalWorld({ count: 64, gridWidth: 5, gridHeight: 3, seed: 20260828 });
  sample.injectCentralHeatPulse(15);
  const serialized = sample.serialize();
  const invalidActions = [
    { ...serialized.lastAction, kind: 'step', parameters: { deltaKelvin: -999, unknown: 'accepted' } },
    { ...serialized.lastAction, kind: 'set_field_temperature', parameters: { temperatureKelvin: 181, externalEnergyReduced: 0 } },
    { ...serialized.lastAction, kind: 'inject_heat_pulse', parameters: { deltaKelvin: 0, externalEnergyReduced: 0 } },
    { ...serialized.lastAction, kind: 'branch', parameters: { fromStep: -1, branchOrdinal: 0 } },
  ];
  let runtimeActionSemantics = false;
  const crossKindState = structuredClone(serialized);
  crossKindState.lastAction = { ...crossKindState.lastAction, kind: 'step', parameters: { substeps: 1 } };
  try {
    ThermochemicalWorld.fromSerialized(crossKindState);
  } catch (error) {
    runtimeActionSemantics = error instanceof Error && error.message.includes('step action does not match its state transition');
  }
  const molecularSample = new MolecularDynamicsWorld();
  const molecularInitialState = molecularSample.serialize();
  const molecularInitialObservation = molecularSample.observe();
  molecularSample.advance(3);
  const molecularSteppedState = molecularSample.serialize();
  const molecularSteppedObservation = molecularSample.observe();
  const molecularActionValid = validateMolecularAction(molecularSteppedState.lastAction);
  const molecularStepTamper = structuredClone(molecularSteppedState);
  molecularStepTamper.lastAction.parameters = { substeps: 2 };
  molecularStepTamper.lastAction.actionId = molecularActionId(molecularStepTamper);
  molecularStepTamper.stateDigest = molecularSerializedDigest(molecularStepTamper);
  let molecularStepMutationRejected = false;
  try {
    MolecularDynamicsWorld.fromSerialized(molecularStepTamper);
  } catch (error) {
    molecularStepMutationRejected = error instanceof Error && error.message.includes('step action does not match its state transition');
  }
  const molecularBranchTamper = structuredClone(molecularSample.clone(1).serialize());
  molecularBranchTamper.lastAction.parameters = { fromStep: 2, branchOrdinal: 1 };
  molecularBranchTamper.lastAction.actionId = molecularActionId(molecularBranchTamper);
  molecularBranchTamper.stateDigest = molecularSerializedDigest(molecularBranchTamper);
  let molecularBranchMutationRejected = false;
  try {
    MolecularDynamicsWorld.fromSerialized(molecularBranchTamper);
  } catch (error) {
    molecularBranchMutationRejected = error instanceof Error && error.message.includes('branch action does not match its state transition');
  }
  const molecularComTamper = structuredClone(molecularInitialState);
  for (const body of molecularComTamper.bodies) body.centerOfMassAngstrom.x += 1;
  molecularComTamper.physicalDigest = molecularPhysicalDigest(molecularComTamper);
  molecularComTamper.stateId = molecularStateId(molecularComTamper);
  molecularComTamper.stateDigest = molecularSerializedDigest(molecularComTamper);
  let molecularComMutationRejected = false;
  try {
    MolecularDynamicsWorld.fromSerialized(molecularComTamper);
  } catch (error) {
    molecularComMutationRejected = error instanceof Error && error.message.includes('initial molecular state');
  }
  const periodicAtomisticSample = createPeriodicArgonCalibrationWorld();
  const periodicAtomisticInitialState = periodicAtomisticSample.serialize();
  const periodicAtomisticInitialObservation = periodicAtomisticSample.observe();
  periodicAtomisticSample.advance(3);
  const periodicAtomisticSteppedState = periodicAtomisticSample.serialize();
  const periodicAtomisticSteppedObservation = periodicAtomisticSample.observe();
  const aqueousControlPlan = createOpenMmTip3pControlPlanV044();
  const validatedAqueousControlPlan = assertOpenMmTip3pControlPlanV044(aqueousControlPlan);
  const aqueousSystemSpecValid = validateAqueousSystemSpec(validatedAqueousControlPlan.system);
  const aqueousForceBackendsValid = validatedAqueousControlPlan.backends.every(
    (backend) => validateAqueousForceBackendManifest(backend),
  );
  const aqueousControlPlanSemantics = validatedAqueousControlPlan.planDigest
      === 'sha256:ad07bc923c991746bcc5c9e048dff9b4065981b50c940b13c3f1654e4ffd1177'
    && validatedAqueousControlPlan.system.systemDigest
      === 'sha256:e80bb9d1bd4bd8b774008b052b717cb758f16995e5164b36cda7102e2dbf6419'
    && validatedAqueousControlPlan.backends[0].manifestDigest
      === 'sha256:7f7104ea225819798c9c06eed382298c4d90ec19484f632fc6910832369882b9'
    && validatedAqueousControlPlan.backends[1].manifestDigest
      === 'sha256:8bea1d8a2f48897d34594fb416f791aa8d94c02807857182681c32c9d6e0424b'
    && validatedAqueousControlPlan.status === 'planned-not-executed'
    && validatedAqueousControlPlan.system.evidenceSemantics.externalOpenmmExecution === false
    && validatedAqueousControlPlan.system.evidenceSemantics.externalPmeExecution === false
    && validatedAqueousControlPlan.system.claimBoundaries.scorePromotionEligible === false
    && validatedAqueousControlPlan.backends.every((backend) => (
      backend.evidence.externalExecutionPerformed === false
      && backend.evidence.pmeExecutionPerformed === false
      && backend.license.licenseClearance === false
      && backend.claimBoundaries.scorePromotionEligible === false
    ));
  const naclWaterInterfacePlan = assertNaClWaterInterfacePlanV0410(
    createNaClWaterInterfacePlanV0410(),
  );
  const naclWaterInterfaceActions = [
    'inspect-coordinate-seed',
    'request-interface-preparation',
    'request-mobile-interface-dynamics',
  ].map((kind, index) => createNaClWaterInterfaceActionV0410(
    kind,
    `sentinel-interface-action-${index}`,
    naclWaterInterfacePlan,
  ));
  const naclWaterInterfaceObservations = naclWaterInterfaceActions.map(
    (action) => observeNaClWaterInterfaceActionV0410(action, naclWaterInterfacePlan),
  );
  const naclWaterInterfaceContract = validateNaClWaterInterfaceSystem(naclWaterInterfacePlan.system)
    && validateNaClWaterInterfaceCoordinateSeed(naclWaterInterfacePlan.coordinateSeed)
    && validateNaClWaterInterfacePlan(naclWaterInterfacePlan)
    && naclWaterInterfaceActions.every((action) => validateNaClWaterInterfaceAction(action))
    && naclWaterInterfaceObservations.every(
      (observation) => validateNaClWaterInterfaceObservation(observation),
    )
    && naclWaterInterfacePlan.planDigest
      === 'sha256:f6f271d255de31ab655e62b7539b65e58a4e85994870232b675ef7b40f2fd0b8'
    && naclWaterInterfacePlan.system.systemDigest
      === 'sha256:d47785bc641fd6483c58b8549bf7c0dc7e116a5892c0c13864c98e87c712133a'
    && naclWaterInterfacePlan.coordinateSeed.seedDigest
      === 'sha256:beb7f2c4f997e2e8b8158a05d6083a7d6569bd1f11457f922844646cac0cc426'
    && naclWaterInterfacePlan.coordinateSeed.atoms.length === 6336
    && naclWaterInterfacePlan.system.prerequisiteGates.length === 4
    && naclWaterInterfacePlan.system.prerequisiteGates.every(
      (gate) => gate.status === 'required-not-satisfied' && gate.receiptDigest === null,
    )
    && Object.values(naclWaterInterfacePlan.system.claimBoundaries).every(
      (claim) => claim === false,
    )
    && naclWaterInterfaceObservations[0].outcome === 'accepted-read-only-inspection'
    && naclWaterInterfaceObservations.slice(1).every((observation) => (
      observation.outcome === 'blocked-prerequisite-gates-unsatisfied'
      && observation.unmetGateIds.length === 4
    ))
    && naclWaterInterfaceObservations.every((observation) => (
      observation.solverInvoked === false && observation.stateMutationPerformed === false
    ));
  const interfaceImporterSource = readSnapshotText(
    'scripts/atomistic/openmm/nacl_water_interface_import_v0411.py',
  );
  const interfaceExporterSource = readSnapshotText(
    'scripts/atomistic/openmm/export-nacl-water-interface-plan-v0411.mjs',
  );
  const interfaceVerifierSource = readSnapshotText(
    'scripts/atomistic/openmm/verify-nacl-water-interface-import-v0411.mjs',
  );
  const expectedInterfaceImportGates = [
    {
      gateId: 'pure-water-openmm-control',
      status: 'required-not-satisfied',
      receiptDigest: null,
    },
    {
      gateId: 'single-pair-low-salt-pme-control',
      status: 'required-not-satisfied',
      receiptDigest: null,
    },
    {
      gateId: 'dry-nacl-100-slab-stability-control',
      status: 'required-not-satisfied',
      receiptDigest: null,
    },
    {
      gateId: 'solid-water-interface-potential-domain-qualification',
      status: 'required-not-satisfied',
      receiptDigest: null,
    },
  ];
  const expectedInterfaceImportExecution = {
    openmmImported: false,
    systemCompiled: false,
    contextCreated: false,
    solverInvoked: false,
    minimized: false,
    equilibrated: false,
    executionEligible: false,
  };
  const expectedInterfaceImportClaims = {
    sourceAuthenticityVerified: false,
    potentialDomainQualified: false,
    dynamicsExecuted: false,
    scientificReproduction: false,
    interfaceSimulated: false,
    industrialPrediction: false,
    promotionEligible: false,
    publicReleaseEligible: false,
  };
  const naclWaterInterfaceImportContract = Boolean(validateNaClWaterInterfaceImportReceipt)
    && naclWaterInterfaceImportReceiptSchema.properties.statusDomain.const
      === 'semantic-import-integrity-only-not-solver-admission'
    && naclWaterInterfaceImportReceiptSchema.properties.status.const === 'verified-pass'
    && naclWaterInterfaceImportReceiptSchema.properties.subject.properties.byteCount.const === 5053426
    && naclWaterInterfaceImportReceiptSchema.properties.subject.properties.rawSha256.const
      === 'sha256:473eaab96bb5d90c8ee2f298860aaec624a7124ad7fa99ef362ef9213c7334bd'
    && naclWaterInterfaceImportReceiptSchema.properties.normalizedArtifacts.properties
      .semanticRoot.const
      === 'sha256:8bd306fbb9cfcef6756bcfce682d63baf31482c8d39e65e974868cce5f39325f'
    && JSON.stringify(naclWaterInterfaceImportReceiptSchema.properties.prerequisiteGates.const)
      === JSON.stringify(expectedInterfaceImportGates)
    && JSON.stringify(naclWaterInterfaceImportReceiptSchema.properties.execution.const)
      === JSON.stringify(expectedInterfaceImportExecution)
    && JSON.stringify(naclWaterInterfaceImportReceiptSchema.properties.claims.const)
      === JSON.stringify(expectedInterfaceImportClaims)
    && naclWaterInterfaceImportReceiptSchema.properties.digests.properties.expected
      .$ref === '#/$defs/lockedDigests'
    && sourceSnapshot.has('scripts/atomistic/openmm/nacl-water-interface-import-v0411.test.mjs')
    && sourceSnapshot.has('scripts/atomistic/openmm/nacl_water_interface_import_v0411_test.py')
    && sourceSnapshot.has('docs/NACL_WATER_INTERFACE_V0411_IMPORT_CONTRACT.md')
    && interfaceImporterSource.includes('EXPECTED_PLAN_RAW_SHA256')
    && interfaceImporterSource.includes('IMPORTER_SOURCE_SHA256 = _capture_importer_source_sha256()')
    && interfaceImporterSource.includes('def _validate_digest_graph(')
    && !/^\s*(?:from|import)\s+openmm\b/m.test(interfaceImporterSource)
    && interfaceExporterSource.includes('EXPECTED_PLAN_RAW_SHA256')
    && interfaceExporterSource.includes('solverImportPerformed: false')
    && interfaceVerifierSource.includes('function assertArtifactBytes(')
    && interfaceVerifierSource.includes('assertClosedBundleInventory(bundlePath);')
    && interfaceVerifierSource.includes('solverInvoked: false');
  const workflowFiles = sourceFiles.filter((relativePath) => relativePath.startsWith('.github/workflows/') && /\.ya?ml$/.test(relativePath));
  const dockerfiles = sourceFiles.filter((relativePath) => relativePath.startsWith('atomistic/containers/') && /\.Dockerfile$/.test(relativePath));
  const expectedDockerfiles = [
    'atomistic/containers/mace.Dockerfile',
    'atomistic/containers/mattersim.Dockerfile',
    'atomistic/containers/openmm-water.Dockerfile',
  ];
  const workflowFailures = [];
  for (const relativePath of workflowFiles) {
    workflowFailures.push(...inspectWorkflowSource(relativePath, readSnapshotText(relativePath)));
  }
  for (const relativePath of dockerfiles) {
    workflowFailures.push(...inspectDockerfileSource(relativePath, readSnapshotText(relativePath)));
  }
  workflowFailures.push(...inspectDockerignoreSource('.dockerignore', readSnapshotText('.dockerignore')));
  const candidateExecutionPreflightValidation =
    await validateFullCandidateExecutionPreflightRepository(
      Buffer.from(readSnapshotText(FULL_CANDIDATE_EXECUTION_PREFLIGHT_PATH), 'utf8'),
      { root },
    );
  hardGateFailures.push(...candidateExecutionPreflightValidation.failures);
  const observerContractValidation = await validateObserverContractRepository(
    Buffer.from(readSnapshotText(OBSERVER_CONTRACT_PATH), 'utf8'),
    {
      root,
      contractSchemaBytes: Buffer.from(
        readSnapshotText(OBSERVER_CONTRACT_SCHEMA_PATH),
        'utf8',
      ),
      receiptSchemaBytes: Buffer.from(
        readSnapshotText(OBSERVER_RECEIPT_SCHEMA_PATH),
        'utf8',
      ),
      workflowBytes: Buffer.from(
        readSnapshotText(OBSERVER_WORKFLOW_SOURCE_PATH),
        'utf8',
      ),
      requireWorkflowGitIndex: false,
    },
  );
  hardGateFailures.push(...observerContractValidation.failures);
  const rightsDispositionFileOverrides = Object.fromEntries([
    RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_PATH,
    ...Object.values(EXPECTED_LOCAL_EVIDENCE).map(({ path: relativePath }) => relativePath),
  ].map((relativePath) => [
    relativePath,
    Buffer.from(readSnapshotText(relativePath), 'utf8'),
  ]));
  const rightsDispositionValidation =
    await validateRandomTpRightsDispositionRepository(
      Buffer.from(readSnapshotText(RANDOM_TP_RIGHTS_DISPOSITION_PATH), 'utf8'),
      {
        root,
        fileOverrides: rightsDispositionFileOverrides,
      },
    );
  hardGateFailures.push(...rightsDispositionValidation.failures);
  const randomTpCatalog = datasetCatalog.datasets.find((dataset) => dataset.id === 'mattersim-random-tp');
  const candidateBenchmark = atomisticCandidatePlan.bindings?.benchmark;
  const candidateContractValid = validateAtomisticCandidatePlan(atomisticCandidatePlan)
    && sourceSnapshot.digest('evaluation/atomistic/full-candidate-plan.json') === FULL_CANDIDATE_PLAN_RAW_DIGEST
    && sourceSnapshot.digest('schemas/atomistic-full-candidate-plan.schema.json') === FULL_CANDIDATE_PLAN_SCHEMA_RAW_DIGEST
    && sourceSnapshot.digest('schemas/atomistic-full-candidate-receipt.schema.json') === FULL_CANDIDATE_RECEIPT_SCHEMA_RAW_DIGEST
    && sourceSnapshot.digest('schemas/atomistic-full-candidate-producer-outcome.schema.json') === FULL_CANDIDATE_PRODUCER_OUTCOME_SCHEMA_RAW_DIGEST
    && atomisticCandidatePlan.bindings.producerOutcomeSchema.rawDigest === FULL_CANDIDATE_PRODUCER_OUTCOME_SCHEMA_RAW_DIGEST
    && atomisticCandidatePlan.bindings.producerOutcomeSchema.schemaVersion === 'tf.atomistic-full-candidate-producer-outcome/0.2'
    && atomisticCandidatePlan.status === 'frozen-candidate-contract-not-run'
    && atomisticCandidatePlan.execution.partitioning.partitions.length === 2
    && atomisticCandidatePlan.execution.partitioning.partitions.every((partition) => partition.expectedRecords === 693 && partition.partitionCount === 1)
    && Object.values(atomisticCandidatePlan.resultPolicy.claims).every((claim) => claim === false)
    && atomisticCandidatePlan.execution.producerScientificPayloadPolicy.scientificArtifactUsesExactPayload === true
    && atomisticCandidatePlan.execution.producerScientificPayloadPolicy.administrativeEvidenceSeparated === true
    && atomisticCandidatePlan.execution.producerScientificPayloadPolicy.publicationEligible === false
    && atomisticCandidatePlan.claimBoundaries.randomTpIsMatbenchWbm === false
    && atomisticCandidatePlan.claimBoundaries.currentSotaClaimAllowed === false
    && candidateExecutionPreflightValidation.failures.length === 0
    && observerContractValidation.failures.length === 0
    && rightsDispositionValidation.failures.length === 0
    && datasetCatalog.frozenAt === FULL_CANDIDATE_DATASET_CATALOG_FROZEN_AT
    && randomTpCatalog?.redistribute === false
    && randomTpCatalog?.license?.startsWith('NOASSERTION:')
    && ['sha256', 'idSetSha256', 'recordManifestSha256', 'structureManifestSha256', 'labelManifestSha256']
      .every((catalogKey, index) => randomTpCatalog?.[catalogKey] === candidateBenchmark?.[['datasetDigest', 'idSetDigest', 'recordManifestDigest', 'structureManifestDigest', 'labelManifestDigest'][index]]);
  schemaVerification = {
    world: validateWorld(serialized),
    action: validateAction(serialized.lastAction),
    actionMutationCorpus: invalidActions.every((action) => !validateAction(action)),
    runtimeActionSemantics,
    molecularWorld: validateMolecularWorld(molecularInitialState) && validateMolecularWorld(molecularSteppedState),
    molecularAction: molecularActionValid,
    molecularObservation: validateMolecularObservation(molecularInitialObservation) && validateMolecularObservation(molecularSteppedObservation),
    molecularRuntimeSemantics: molecularStepMutationRejected && molecularBranchMutationRejected && molecularComMutationRejected,
    periodicAtomisticWorld: validatePeriodicAtomisticWorld(periodicAtomisticInitialState)
      && validatePeriodicAtomisticWorld(periodicAtomisticSteppedState),
    periodicAtomisticAction: validatePeriodicAtomisticAction(periodicAtomisticSteppedState.lastAction),
    periodicAtomisticObservation: validatePeriodicAtomisticObservation(periodicAtomisticInitialObservation)
      && validatePeriodicAtomisticObservation(periodicAtomisticSteppedObservation),
    aqueousSystemSpec: aqueousSystemSpecValid,
    aqueousForceBackends: aqueousForceBackendsValid,
    aqueousControlPlanSemantics,
    naclWaterInterfaceContract,
    naclWaterInterfaceImportContract,
    atomisticPlan: validateAtomisticPlan(atomisticPlan)
      && atomisticPlan.status === 'planned-not-reproduced'
      && atomisticPlan.models.length === 2
      && new Set(atomisticPlan.models.map((model) => model.role)).size === 2
      && atomisticPlan.models.every((model) => model.defaultAliasAllowed === false
        && model.outputs.length === 3
        && !/\/(?:main|master)(?:\/|$)/.test(model.sourceUrl)
        && model.sourceUrl.includes(model.sourceCommit)
        && model.package.url.endsWith(model.package.filename)
        && model.package.cachePath.endsWith(model.package.filename)
        && model.outOfScope.length >= 2)
      && atomisticPlan.excludedDefaults.some((entry) => entry.id === 'facebook-uma'
        && entry.revision === 'f611b917d9c68566bbbeccbb0aa0f7cad1696cb2'
        && entry.gating === 'manual'
        && entry.industrialDefaultAllowed === false
        && entry.legalEvidence.some((evidence) => evidence.kind === 'acceptable-use-policy' && evidence.sha256 === null))
      && atomisticPlan.benchmarks.some((benchmark) => benchmark.role === 'primary-like-for-like' && benchmark.artifact.frames === 693 && benchmark.artifact.atoms === 11088 && benchmark.artifact.elements === 89)
      && candidateContractValid,
    datasetCatalog: datasetCatalog.schemaVersion === 'tf.dataset-catalog/0.1'
      && datasetCatalog.frozenAt === FULL_CANDIDATE_DATASET_CATALOG_FROZEN_AT
      && datasetCatalog.datasets.length >= 4
      && datasetCatalog.datasets.every((dataset) => dataset.license && dataset.source?.startsWith('https://') && dataset.requiredProvenance?.length >= 4),
    workflowPolicy: workflowFiles.length >= 2
      && JSON.stringify(dockerfiles) === JSON.stringify(expectedDockerfiles)
      && workflowFailures.length === 0,
    comparatorReceipts: comparatorReceiptFailures.length === 0,
  };
  if (!schemaVerification.world) hardGateFailures.push(`World-state schema validation failed: ${JSON.stringify(validateWorld.errors)}.`);
  if (!schemaVerification.action) hardGateFailures.push(`Action schema validation failed: ${JSON.stringify(validateAction.errors)}.`);
  if (!schemaVerification.actionMutationCorpus) hardGateFailures.push('Action schema accepted an invalid per-kind mutation.');
  if (!schemaVerification.runtimeActionSemantics) hardGateFailures.push('Runtime action semantics accepted or misclassified a cross-kind mutation.');
  if (!schemaVerification.molecularWorld) hardGateFailures.push(`Molecular world-state schema validation failed: ${JSON.stringify(validateMolecularWorld.errors)}.`);
  if (!schemaVerification.molecularAction) hardGateFailures.push(`Molecular action schema validation failed: ${JSON.stringify(validateMolecularAction.errors)}.`);
  if (!schemaVerification.molecularObservation) hardGateFailures.push(`Molecular observation schema validation failed: ${JSON.stringify(validateMolecularObservation.errors)}.`);
  if (!schemaVerification.molecularRuntimeSemantics) hardGateFailures.push('Molecular runtime semantics accepted a recomputed lineage or initial-state mutation.');
  if (!schemaVerification.periodicAtomisticWorld) hardGateFailures.push(`Periodic atomistic world-state schema validation failed: ${JSON.stringify(validatePeriodicAtomisticWorld.errors)}.`);
  if (!schemaVerification.periodicAtomisticAction) hardGateFailures.push(`Periodic atomistic action schema validation failed: ${JSON.stringify(validatePeriodicAtomisticAction.errors)}.`);
  if (!schemaVerification.periodicAtomisticObservation) hardGateFailures.push(`Periodic atomistic observation schema validation failed: ${JSON.stringify(validatePeriodicAtomisticObservation.errors)}.`);
  if (!schemaVerification.aqueousSystemSpec) hardGateFailures.push(`Aqueous v0.4.4 system-spec schema validation failed: ${JSON.stringify(validateAqueousSystemSpec.errors)}.`);
  if (!schemaVerification.aqueousForceBackends) hardGateFailures.push(`Aqueous v0.4.4 force-backend schema validation failed: ${JSON.stringify(validateAqueousForceBackendManifest.errors)}.`);
  if (!schemaVerification.aqueousControlPlanSemantics) hardGateFailures.push('Aqueous v0.4.4 exact plan digest or negative evidence semantics changed.');
  if (!schemaVerification.naclWaterInterfaceContract) {
    hardGateFailures.push(`NaCl-water interface v0.4.10 schema, locked identity or fail-closed semantics changed: ${JSON.stringify(
      validateNaClWaterInterfacePlan.errors
      ?? validateNaClWaterInterfaceCoordinateSeed.errors
      ?? validateNaClWaterInterfaceSystem.errors,
    )}.`);
  }
  if (!schemaVerification.naclWaterInterfaceImportContract) {
    hardGateFailures.push('NaCl-water interface v0.4.11 cross-language semantic-import contract is incomplete.');
  }
  if (!schemaVerification.atomisticPlan) {
    const validationErrors = validateAtomisticPlan.errors ?? validateAtomisticCandidatePlan.errors;
    let detail = validationErrors
      ? JSON.stringify(validationErrors)
      : 'semantic identity or dependency check failed';
    if (candidateExecutionPreflightValidation.failures.length > 0) {
      detail = 'dependent candidate execution preflight validation failed';
    } else if (observerContractValidation.failures.length > 0) {
      detail = 'dependent observer contract validation failed';
    } else if (rightsDispositionValidation.failures.length > 0) {
      detail = 'dependent Random-TP rights disposition validation failed';
    }
    hardGateFailures.push(`Atomistic reproduction/candidate plan validation failed: ${detail}.`);
  }
  if (!schemaVerification.datasetCatalog) hardGateFailures.push('Dataset provenance and license catalog validation failed.');
  if (!schemaVerification.workflowPolicy) hardGateFailures.push('Workflow and atomistic build policy coverage is incomplete.');
  if (!schemaVerification.comparatorReceipts) hardGateFailures.push('Comparator receipt promotion policy rejected the registry.');
  hardGateFailures.push(...workflowFailures);
} catch (error) {
  hardGateFailures.push(`Schema verification crashed: ${error instanceof Error ? error.message : String(error)}.`);
}
const verificationElapsedMs = performance.now() - verificationStarted;

const claimFiles = ['app/page.tsx', 'app/layout.tsx', 'README.md'];
const forbiddenClaims = [/industrial[- ]grade/i, /scientifically validated/i, /已达到.{0,8}SOTA/i, /工业级预测/, /真实材料预测/];
for (const relativePath of claimFiles) {
  if (!sourceSnapshot.has(relativePath)) continue;
  const content = readSnapshotText(relativePath);
  for (const pattern of forbiddenClaims) if (pattern.test(content)) hardGateFailures.push(`${relativePath}: unsupported product claim matches ${pattern}.`);
}

const applicationFiles = sourceFiles.filter((relativePath) => relativePath.startsWith('app/'));
if (applicationFiles.some((relativePath) => /(?:^|\/)api\/.*(control|plc|dcs|sis)/i.test(relativePath))) hardGateFailures.push('A direct industrial-control endpoint exists inside the public application.');

const weightedScore = scorecard.dimensions.reduce((sum, dimension) => sum + dimension.weight * dimension.score / 4, 0);
const gaps = scorecard.dimensions
  .filter((dimension) => dimension.score < 3)
  .map((dimension) => {
    const severity = dimension.score < dimension.promotionFloor ? 'P0' : dimension.score === 0 ? 'P1' : dimension.score === 1 ? 'P1' : 'P2';
    const roadmapBoost = ({ atomistic: 300, mesoscale: 200, process: 100 })[dimension.id] ?? 0;
    return {
      severity,
      dimension: dimension.id,
      evidence: dimension.evidence.length ? dimension.evidence.join('; ') : 'No executable evidence in the current candidate.',
      recommendedChange: dimension.nextAction,
      acceptanceTest: dimension.acceptanceTest,
      priority: (4 - dimension.score) * dimension.weight + roadmapBoost + (severity === 'P0' ? 100 : 0),
    };
  })
  .sort((left, right) => right.priority - left.priority)
  .slice(0, 3)
  .map(({ severity, dimension, evidence, recommendedChange, acceptanceTest }) => ({ severity, dimension, evidence, recommendedChange, acceptanceTest }));

for (const [relativePath, evidenceDigest] of Object.entries(evidenceManifest)) {
  if (sourceManifest[relativePath] !== evidenceDigest) {
    hardGateFailures.push(`${relativePath}: evidence digest differs from the frozen source manifest.`);
  }
}

const upstreamReported = Object.values(upstreamGates).every((status) => status === 'success');
let verdict = hardGateFailures.length > 0 ? 'reject' : weightedScore >= 60 && upstreamReported ? 'accept' : 'conditional';
const report = {
  schemaVersion: 'tf.evaluation/0.2',
  candidateVersion: scorecard.candidateVersion,
  generatedAt: new Date().toISOString(),
  sourceRevision: /^[0-9a-f]{40}$/.test(process.env.GITHUB_SHA ?? '') ? process.env.GITHUB_SHA : null,
  baselineSnapshotDate: registry.snapshotDate,
  artifactDigest,
  sourceFileCount: sourceFiles.length,
  sourceManifest,
  runtime: { node: process.version, platform: process.platform, architecture: process.arch },
  upstreamGates,
  verification: {
    physics: physicsVerification,
    molecular: molecularVerification,
    periodicAtomistic: periodicAtomisticVerification,
    aqueousFoundation: aqueousFoundationVerification,
    schemas: schemaVerification,
    elapsedMs: Number(verificationElapsedMs.toFixed(2)),
  },
  evidenceManifest,
  weightedScore: Number(weightedScore.toFixed(2)),
  hardGateFailures,
  dimensions: scorecard.dimensions,
  comparators: registry.comparators,
  excludedDefaults: atomisticPlan.excludedDefaults,
  gaps,
  verdict,
};

try {
  const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true, validateFormats: false });
  const validateReport = ajv.compile(evaluationSchema);
  if (!validateReport(report)) {
    hardGateFailures.push(`Evaluation-report schema validation failed: ${JSON.stringify(validateReport.errors)}.`);
    verdict = 'reject';
    report.verdict = verdict;
  }
} catch (error) {
  hardGateFailures.push(`Evaluation-report schema verification crashed: ${error instanceof Error ? error.message : String(error)}.`);
  verdict = 'reject';
  report.verdict = verdict;
}

const markdown = [
  `# Tailing Sentinel — ${report.candidateVersion}`,
  '',
  `- Verdict: **${verdict.toUpperCase()}**`,
  `- Evidence maturity: **${report.weightedScore.toFixed(2)} / 100** (not a SOTA score)`,
  `- Comparator snapshot: **${report.baselineSnapshotDate}**`,
  `- Evaluated revision: **${report.sourceRevision ?? 'local working tree'}**`,
  `- Artifact: \`${report.artifactDigest}\` across ${report.sourceFileCount} source files`,
  '',
  '## Hard gates',
  '',
  ...(hardGateFailures.length ? hardGateFailures.map((failure) => `- FAIL — ${failure}`) : ['- PASS — executable R2 numerical, schema, manifest and promotion-floor gates passed.']),
  '',
  '## Executable verification',
  '',
  physicsVerification
    ? `- Fourier L2: ${physicsVerification.heatModeRelativeL2Error.toExponential(3)}; minimum 2D order: ${physicsVerification.fourierMinimumObservedOrder.toFixed(3)}; ${physicsVerification.ensemble.seeds.length}×${physicsVerification.ensemble.horizonSteps} p95/max energy tail: ${physicsVerification.ensemble.energyResidualTail.p95.toExponential(3)} / ${physicsVerification.ensemble.energyResidualTail.maximum.toExponential(3)}.`
    : '- Physics verification unavailable.',
  molecularVerification
    ? `- Molecular isolated constant-energy trajectory: ${molecularVerification.steps} steps / ${molecularVerification.timePicoseconds.toFixed(3)} ps; maximum |ΔE|/max(|E₀|, 1 kJ mol⁻¹): ${molecularVerification.maximumRelativeEnergyExcursion.toExponential(3)}; OLS relative drift: ${molecularVerification.linearRelativeDriftRatePerPicosecond.toExponential(3)} ps⁻¹; deterministic replay: ${molecularVerification.deterministicReplay ? 'PASS' : 'FAIL'}.`
    : '- Molecular verification unavailable.',
  periodicAtomisticVerification
    ? `- Periodic atomistic fixed-cell NVE calibration: ${periodicAtomisticVerification.fixture.stepsExecuted.toLocaleString('en-US')} primary + ${periodicAtomisticVerification.fixture.independentReplayStepsExecuted.toLocaleString('en-US')} independent replay steps; maximum relative energy excursion ${periodicAtomisticVerification.maximumResiduals.relativeEnergyExcursion.toExponential(3)}; momentum / internal-force / COM residuals ${periodicAtomisticVerification.maximumResiduals.momentumDaltonAngstromPerPicosecond.toExponential(3)} / ${periodicAtomisticVerification.maximumResiduals.internalForceKjMolAngstrom.toExponential(3)} / ${periodicAtomisticVerification.maximumResiduals.centerOfMassAngstrom.toExponential(3)}; physical, full-state, observation and trajectory/checkpoint digest replay ${periodicAtomisticVerification.deterministicPhysicalReplay && periodicAtomisticVerification.deterministicFullStateReplay && periodicAtomisticVerification.deterministicObservationReplay ? 'PASS' : 'FAIL'} (evidence ${periodicAtomisticVerification.digests.verificationEvidence}).`
    : '- Periodic atomistic verification unavailable.',
  aqueousFoundationVerification
    ? `- Aqueous foundation references: ${AQUEOUS_FOUNDATION_GATE_NAMES.filter((gateName) => aqueousFoundationVerification.gates[gateName] === true).length}/${AQUEOUS_FOUNDATION_GATE_NAMES.length} direct-Ewald and rigid-constraint gates passed; NaCl point-charge Madelung |ΔE| ${aqueousFoundationVerification.naclPointChargeReference.absoluteEnergyErrorKjMol.toExponential(3)} kJ mol⁻¹; triclinic force finite-difference maximum ${aqueousFoundationVerification.triclinicForceCheck.maximumAbsoluteForceErrorKjMolAngstrom.toExponential(3)} kJ mol⁻¹ Å⁻¹; TIP3P position / velocity-derivative residuals ${aqueousFoundationVerification.tip3pConstraintFixture.maximumPositionResidualAngstrom.toExponential(3)} Å / ${aqueousFoundationVerification.tip3pConstraintFixture.maximumVelocityDerivativeResidualAngstrom2PerPicosecond.toExponential(3)} Å² ps⁻¹ (foundation only; no NaCl–water trajectory, PME or OpenMM execution; evidence ${aqueousFoundationVerification.verificationDigest}).`
    : '- Aqueous foundation verification unavailable.',
  `- World/action schemas and negative mutation corpus: ${schemaVerification.world && schemaVerification.action && schemaVerification.actionMutationCorpus && schemaVerification.runtimeActionSemantics ? 'PASS' : 'FAIL'}; molecular world/action/observation schemas and recomputed-tamper corpus: ${schemaVerification.molecularWorld && schemaVerification.molecularAction && schemaVerification.molecularObservation && schemaVerification.molecularRuntimeSemantics ? 'PASS' : 'FAIL'}; periodic atomistic world/action/observation schemas: ${schemaVerification.periodicAtomisticWorld && schemaVerification.periodicAtomisticAction && schemaVerification.periodicAtomisticObservation ? 'PASS' : 'FAIL'}; aqueous v0.4.4 system/backend schemas and exact negative-evidence plan: ${schemaVerification.aqueousSystemSpec && schemaVerification.aqueousForceBackends && schemaVerification.aqueousControlPlanSemantics ? 'PASS (declarative contract only; OpenMM not run)' : 'FAIL'}; NaCl-water v0.4.10 full-seed schemas, locked digests and fail-closed actions: ${schemaVerification.naclWaterInterfaceContract ? 'PASS (geometric contract only; no trajectory or solver)' : 'FAIL'}; v0.4.11 Python semantic import and independent byte verifier source contract: ${schemaVerification.naclWaterInterfaceImportContract ? 'PASS (portable input only; OpenMM not imported)' : 'FAIL'}; atomistic reproduction + full-candidate plans / dataset catalog / comparator receipts: ${schemaVerification.atomisticPlan && schemaVerification.datasetCatalog && schemaVerification.comparatorReceipts ? 'PASS (candidate contract only; no full run)' : 'FAIL'}; evaluator runtime: ${verificationElapsedMs.toFixed(1)} ms.`,
  `- Industrial default exclusions: ${atomisticPlan.excludedDefaults.map((entry) => `${entry.id} (${entry.gating}; industrialDefaultAllowed=${entry.industrialDefaultAllowed})`).join(', ')}.`,
  '',
  '## Next iteration gaps',
  '',
  ...gaps.flatMap((gap, index) => [
    `${index + 1}. **${gap.severity} · ${gap.dimension}** — ${gap.recommendedChange}`,
    `   - Evidence: ${gap.evidence}`,
    `   - Acceptance: ${gap.acceptanceTest}`,
  ]),
  '',
  '## Interpretation boundary',
  '',
  'This score measures evidence and engineering maturity only. CLAIM and AUDITABLE comparator records are not treated as locally reproduced numerical baselines. R2 is still a reduced-unit thermochemical verification world with non-promotional ten-frame MatterSim and MACE smoke artifacts and no dual-model full benchmark, not a real-material, reactor or industrial-process predictor.',
  '',
].join('\n');

await writeFile(path.join(root, 'evaluation/latest-report.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(root, 'evaluation/latest-report.md'), markdown);

console.log(`Tailing Sentinel: ${verdict.toUpperCase()} · ${report.weightedScore.toFixed(2)}/100 · ${gaps.length} next gaps`);
if (hardGateFailures.length) {
  for (const failure of hardGateFailures) console.error(`HARD GATE: ${failure}`);
  process.exitCode = 1;
}

async function readSnapshotControl(snapshotRoot) {
  const controlPath = path.join(snapshotRoot, '.tailing-sentinel-control.json');
  const bytes = await readFile(controlPath);
  if (bytes.length < 2 || bytes.length > 1024 * 1024) throw new Error('Evaluator snapshot control size is invalid.');
  const parsed = JSON.parse(bytes.toString('utf8'));
  if (parsed?.schemaVersion !== 'tf.evaluator-snapshot/0.1'
    || !Array.isArray(parsed.rawPaths)
    || !Array.isArray(parsed.sourceFiles)
    || parsed.rawPaths.length > 4096
    || parsed.sourceFiles.length > 4096
    || !parsed.sourceManifest
    || typeof parsed.sourceManifest !== 'object'
    || Array.isArray(parsed.sourceManifest)
    || !/^sha256:[0-9a-f]{64}$/.test(parsed.artifactDigest ?? '')) {
    throw new Error('Evaluator snapshot control is malformed.');
  }
  const selected = selectProjectSourceFiles(parsed.rawPaths);
  if (JSON.stringify(selected) !== JSON.stringify(parsed.sourceFiles)) {
    throw new Error('Evaluator snapshot control source scope is inconsistent.');
  }
  if (Object.keys(parsed.sourceManifest).length !== selected.length
    || selected.some((relativePath) => !/^sha256:[0-9a-f]{64}$/.test(parsed.sourceManifest[relativePath] ?? ''))) {
    throw new Error('Evaluator snapshot control manifest is inconsistent.');
  }
  return parsed;
}

function molecularActionId(state) {
  const action = state.lastAction;
  const fingerprint = shortDigest({
    kind: action.kind,
    parentStateId: action.parentStateId,
    resultingStateId: action.resultingStateId,
    appliedAtStep: action.appliedAtStep,
    parameters: action.parameters,
  });
  return `${state.stateNamespace}-a${state.actionCount.toString(36).padStart(5, '0')}-${fingerprint}`;
}

function molecularPhysicalDigest(state) {
  return digestValue({
    schemaVersion: 'tf.molecular-physical-state/0.4',
    step: state.step,
    options: state.options,
    topologyDigest: state.topologyDigest,
    bodies: state.bodies,
  });
}

function molecularStateId(state) {
  const suffix = shortDigest({
    digest: state.physicalDigest,
    parentStateId: state.parentStateId,
    revision: state.revision,
    actionCount: state.actionCount,
    branchCount: state.branchCount,
  });
  return `${state.stateNamespace}-s${state.step.toString(36).padStart(6, '0')}r${state.revision.toString(36).padStart(4, '0')}-${suffix}`;
}

function molecularSerializedDigest(state) {
  const withoutDigest = Object.fromEntries(Object.entries(state).filter(([key]) => key !== 'stateDigest'));
  return digestValue(withoutDigest);
}
