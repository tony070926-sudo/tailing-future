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
  './atomistic/full-candidate-plan-policy.mjs',
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
  {
    FULL_CANDIDATE_DATASET_CATALOG_FROZEN_AT,
    FULL_CANDIDATE_PLAN_RAW_DIGEST,
    FULL_CANDIDATE_PLAN_SCHEMA_RAW_DIGEST,
    FULL_CANDIDATE_PRODUCER_OUTCOME_SCHEMA_RAW_DIGEST,
    FULL_CANDIDATE_RECEIPT_SCHEMA_RAW_DIGEST,
  },
  { inspectDockerfileSource, inspectDockerignoreSource, inspectWorkflowSource },
  { validateComparatorEvidenceRegistry },
  { captureProjectSourceSnapshot },
  { selectProjectSourceFiles },
] = await Promise.all([
  import('ajv/dist/2020.js'),
  import('../lib/simulation/thermochemical-world.ts'),
  import('./atomistic/full-candidate-plan-policy.mjs'),
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

let schemaVerification = { world: false, action: false, actionMutationCorpus: false, runtimeActionSemantics: false, atomisticPlan: false, datasetCatalog: false, workflowPolicy: false, comparatorReceipts: false };
try {
  const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
  const validateWorld = ajv.compile(worldSchema);
  const validateAction = ajv.compile(actionSchema);
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
  const workflowFiles = sourceFiles.filter((relativePath) => relativePath.startsWith('.github/workflows/') && /\.ya?ml$/.test(relativePath));
  const dockerfiles = sourceFiles.filter((relativePath) => relativePath.startsWith('atomistic/containers/') && /\.Dockerfile$/.test(relativePath));
  const workflowFailures = [];
  for (const relativePath of workflowFiles) {
    workflowFailures.push(...inspectWorkflowSource(relativePath, readSnapshotText(relativePath)));
  }
  for (const relativePath of dockerfiles) {
    workflowFailures.push(...inspectDockerfileSource(relativePath, readSnapshotText(relativePath)));
  }
  workflowFailures.push(...inspectDockerignoreSource('.dockerignore', readSnapshotText('.dockerignore')));
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
    workflowPolicy: workflowFiles.length >= 2 && dockerfiles.length === 2 && workflowFailures.length === 0,
    comparatorReceipts: comparatorReceiptFailures.length === 0,
  };
  if (!schemaVerification.world) hardGateFailures.push(`World-state schema validation failed: ${JSON.stringify(validateWorld.errors)}.`);
  if (!schemaVerification.action) hardGateFailures.push(`Action schema validation failed: ${JSON.stringify(validateAction.errors)}.`);
  if (!schemaVerification.actionMutationCorpus) hardGateFailures.push('Action schema accepted an invalid per-kind mutation.');
  if (!schemaVerification.runtimeActionSemantics) hardGateFailures.push('Runtime action semantics accepted or misclassified a cross-kind mutation.');
  if (!schemaVerification.atomisticPlan) hardGateFailures.push(`Atomistic reproduction/candidate plan validation failed: ${JSON.stringify(validateAtomisticPlan.errors ?? validateAtomisticCandidatePlan.errors)}.`);
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
  `- World/action schemas and negative mutation corpus: ${schemaVerification.world && schemaVerification.action && schemaVerification.actionMutationCorpus && schemaVerification.runtimeActionSemantics ? 'PASS' : 'FAIL'}; atomistic reproduction + full-candidate plans / dataset catalog / comparator receipts: ${schemaVerification.atomisticPlan && schemaVerification.datasetCatalog && schemaVerification.comparatorReceipts ? 'PASS (candidate contract only; no full run)' : 'FAIL'}; evaluator runtime: ${verificationElapsedMs.toFixed(1)} ms.`,
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
