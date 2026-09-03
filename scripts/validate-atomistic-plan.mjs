import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { artifactContracts, canonicalCacheRoot, verifyCachedArtifact } from './atomistic/artifact-cache.mjs';
import { inspectRandomTp } from './atomistic/dataset-manifest.mjs';
import {
  FULL_CANDIDATE_PLAN_PATH,
  validateFullCandidatePlanRepository,
} from './atomistic/full-candidate-plan-policy.mjs';
import {
  FULL_CANDIDATE_EXECUTION_PREFLIGHT_PATH,
  validateFullCandidateExecutionPreflightRepository,
} from './atomistic/full-candidate-execution-preflight-policy.mjs';
import { validateFrozenAtomisticPlan, validateFrozenAtomisticPlanBytes } from './atomistic/plan-policy.mjs';
import {
  validateFullCandidateRegistrationWorkflowRepository,
} from './atomistic/full-candidate-registration-source-policy.mjs';

const root = process.cwd();
const registrationValidation = await validateFullCandidateRegistrationWorkflowRepository(root);
if (process.argv.includes('--registration-workflow-only')) {
  if (registrationValidation.failures.length) {
    console.error(registrationValidation.failures.join('\n'));
    process.exit(1);
  }
  console.log(
    `Full-candidate registration workflow: VALID · staged tree ${registrationValidation.stagedTreeOid} · blob ${registrationValidation.gitBlobOid} · REGISTRATION ONLY — NO PRODUCER EXECUTION`,
  );
  process.exit(0);
}
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
const planBytes = await readFile(path.join(root, 'evaluation/atomistic/reproduction-plan.json'));
const plan = JSON.parse(planBytes.toString('utf8'));
const schema = await readJson('schemas/atomistic-reproduction.schema.json');
const catalog = await readJson('evaluation/data/datasets.json');
const failures = [...registrationValidation.failures];
const candidatePlanBytes = await readFile(path.join(root, FULL_CANDIDATE_PLAN_PATH));
const candidateValidation = await validateFullCandidatePlanRepository(candidatePlanBytes, { root });
const candidatePlan = candidateValidation.plan;
failures.push(...candidateValidation.failures);
const executionPreflightBytes = await readFile(
  path.join(root, FULL_CANDIDATE_EXECUTION_PREFLIGHT_PATH),
);
const executionPreflightValidation =
  await validateFullCandidateExecutionPreflightRepository(executionPreflightBytes, { root });
failures.push(...executionPreflightValidation.failures);

const ajv = new Ajv2020({ allErrors: true, validateFormats: false });
const validate = ajv.compile(schema);
if (!validate(plan)) failures.push(`schema: ${JSON.stringify(validate.errors)}`);
failures.push(...validateFrozenAtomisticPlanBytes(planBytes));
failures.push(...validateFrozenAtomisticPlan(plan));
if (plan.schemaVersion !== 'tf.atomistic-reproduction/0.2' || plan.status !== 'planned-not-reproduced') failures.push('plan: expected the frozen v0.2 planned-not-reproduced state');

if (new Set(plan.models.map((model) => model.role)).size !== 2) failures.push('models: active and challenger roles must both be present');
for (const model of plan.models) {
  if (/\/main(?:\/|$)|\/master(?:\/|$)/.test(model.sourceUrl) || /\/main(?:\/|$)|\/master(?:\/|$)/.test(model.checkpoint.url)) failures.push(`${model.id}: mutable branch URL is forbidden`);
  if (!model.sourceUrl.includes(model.sourceCommit)) failures.push(`${model.id}: source URL is not bound to sourceCommit`);
  if (model.defaultAliasAllowed) failures.push(`${model.id}: default model aliases must remain disabled`);
  if (model.outputs.length !== 3) failures.push(`${model.id}: E/F/stress outputs are all required`);
  if (!model.package.url.endsWith(model.package.filename) || !model.package.cachePath.endsWith(model.package.filename)) failures.push(`${model.id}: package filename, URL and cache path disagree`);
  if (!model.intendedUse || model.outOfScope.length < 2 || !model.levelOfTheory || !model.energyConvention) failures.push(`${model.id}: model-use and energy-convention boundaries are incomplete`);
}

const uma = plan.excludedDefaults.find((entry) => entry.id === 'facebook-uma');
const requiredUmaRestrictions = ['critical infrastructure', 'transportation', 'heavy machinery', 'nuclear'];
if (!uma
  || uma.revision !== 'f611b917d9c68566bbbeccbb0aa0f7cad1696cb2'
  || uma.gating !== 'manual'
  || uma.industrialDefaultAllowed !== false
  || !requiredUmaRestrictions.every((category) => uma.restrictedCategories.includes(category))
  || uma.obligations.length < 4) failures.push('facebook-uma: fixed legal exclusion contract is incomplete');
else {
  const legalByKind = Object.fromEntries(uma.legalEvidence.map((evidence) => [evidence.kind, evidence]));
  if (legalByKind['model-card-and-embedded-use-policy']?.sha256 !== 'sha256:fb36209d8c19c5cc86d6bdf1402201159fc8883d7402ed349d2aa1fd3f0aa4ca') failures.push('facebook-uma: fixed README/use-policy digest mismatch');
  if (legalByKind.license?.sha256 !== 'sha256:9dbfc25ed718f486587677d3eab6212aae5044859473a1229f6a26f44e22c0b0') failures.push('facebook-uma: fixed license digest mismatch');
  if (legalByKind['acceptable-use-policy']?.sha256 !== null || !legalByKind['acceptable-use-policy']?.accessStatus.includes('identity-gated')) failures.push('facebook-uma: separately gated AUP must remain explicitly unresolved');
}

const primary = plan.benchmarks.find((benchmark) => benchmark.role === 'primary-like-for-like');
if (!primary) failures.push('benchmark: primary like-for-like benchmark is missing');
else {
  const expected = {
    frames: 693,
    atoms: 11088,
    elements: 89,
    atomsPerFrame: 16,
    smokeElements: 89,
    idSetSha256: 'sha256:4df1ba7cda1b0a31cdb0b3e2281ed535327d7b92ce381cd930c781cc8b800f91',
    smokeManifestSha256: 'sha256:858b009bddf8fe8d78114b1c227fd7756c49990ca84aaf7ee8e5aecd54967423',
    recordManifestSha256: 'sha256:6afbbdc0cd745efaca4bf5d7a2a7604db9f1d1f59749b86d3c0a51d48f07893a',
    smokeRecordManifestSha256: 'sha256:35c87d2440310bb226e800407c9bec39000f4e2934d2ca83ec4eea537e7ed8de',
  };
  for (const [key, value] of Object.entries(expected)) if (primary.artifact[key] !== value) failures.push(`${primary.id}: expected ${key}=${value}`);
  if (!primary.artifact.sha256 || primary.artifact.smokeIds?.length !== 10) failures.push(`${primary.id}: digest or 10-frame smoke manifest is missing`);
  try {
    const idManifest = await readFile(path.join(root, primary.artifact.idManifestPath), 'utf8');
    const manifestIds = idManifest.endsWith('\n') ? idManifest.slice(0, -1).split('\n') : [];
    const parsedManifestDigest = `sha256:${createHash('sha256').update(idManifest, 'utf8').digest('hex')}`;
    if (parsedManifestDigest !== primary.artifact.idSetSha256 || manifestIds.length !== primary.artifact.frames || new Set(manifestIds).size !== manifestIds.length || manifestIds.some((id, index) => !/^random-TP-[0-9]{6}$/.test(id) || (index > 0 && manifestIds[index - 1] >= id))) failures.push(`${primary.id}: checked-in ID manifest is malformed or does not match idSetSha256`);
  } catch (error) {
    failures.push(`${primary.id}: checked-in ID manifest is unavailable (${error instanceof Error ? error.message : String(error)})`);
  }
}

const { runner, metrics, invariance, batchPolicy, randomTpAcceptance } = plan.protocol;
if (runner.python !== '3.12.13' || runner.batchSize !== 1 || runner.threads !== 1 || runner.canonicalDevice !== 'cpu') failures.push('protocol: canonical execution must remain Python 3.12.13 CPU float32 batch-1 with one thread');
if (runner.containerDigests.mattersim !== null || runner.containerDigests.mace !== null || runner.dependencyLockDigests.mattersim !== null || runner.dependencyLockDigests.mace !== null || runner.runnerDigest !== null) failures.push('protocol: pre-execution plan cannot claim frozen runtime digests');
if (metrics.stressGateError !== 'full-3x3-frobenius-error-in-gpa-per-frame'
  || metrics.quantileMethod !== 'Hyndman-Fan-7-linear'
  || metrics.summation !== 'ascii-id-order-python-3.12-math-fsum-divide-by-693/v1'
  || metrics.perIdMetricEvidenceRootProtocol !== 'sha256-merkle-canonical-json-array-model-id-metric-id-error-ascii-id-order-duplicate-id-forbidden/v1'
  || metrics.reportedStatistics.join('\0') !== ['mean', 'p50', 'p90', 'p95', 'p99', 'worst'].join('\0')
  || metrics.reportDefinitions.energy.definition !== metrics.energyError
  || metrics.reportDefinitions.force.definition !== metrics.forceError
  || metrics.reportDefinitions.stress.definition !== metrics.stressGateError) failures.push('protocol: metric definition or deterministic reporting contract drifted from the preregistration');
if (invariance.structureIds.join('\0') !== primary?.artifact.smokeIds.join('\0') || invariance.stressFiniteDifference.structureIds.join('\0') !== primary?.artifact.smokeIds.join('\0')) failures.push('protocol: invariance and stress finite-difference IDs must equal the frozen smoke set');
if (batchPolicy.canonicalBatchSize !== 1 || batchPolicy.legacyGraphConverterBatchGreaterThanOneAllowed !== false) failures.push('protocol: unsafe legacy MatterSim multi-graph batching is enabled');
if (randomTpAcceptance.matterSimStatus !== 'REPRODUCED_MODEL_CARD_PROTOCOL' || randomTpAcceptance.maceStatus !== 'ENGINEERING_BASELINE_COMPLETE') failures.push('protocol: scientific result status names drifted');
for (const [metric, target] of Object.entries(randomTpAcceptance.matterSimTargets)) {
  const absoluteKey = metric.startsWith('energy') ? 'energyAbsolute' : metric.startsWith('force') ? 'forceAbsolute' : 'stressAbsolute';
  const delta = Math.min(randomTpAcceptance.matterSimTolerance[absoluteKey], target * randomTpAcceptance.matterSimTolerance.relative);
  const expectedInterval = [target - delta, target + delta];
  const actualInterval = randomTpAcceptance.matterSimTolerance.acceptedIntervals[metric];
  if (!Array.isArray(actualInterval) || actualInterval.length !== 2 || actualInterval.some((value, index) => Math.abs(value - expectedInterval[index]) > 1e-12)) failures.push(`protocol: accepted interval for ${metric} is not derived by the frozen AND rule`);
}

const unresolved = plan.benchmarks.filter((benchmark) => benchmark.artifact.sha256 === null);
if (unresolved.some((benchmark) => benchmark.redistribute)) failures.push('benchmark: unresolved artifacts cannot be redistributable');
if (catalog.schemaVersion !== 'tf.dataset-catalog/0.1' || catalog.datasets.length < 4) failures.push('dataset catalog is incomplete');
for (const dataset of catalog.datasets) {
  if (!dataset.license || !dataset.source?.startsWith('https://') || !Array.isArray(dataset.requiredProvenance) || dataset.requiredProvenance.length < 4) failures.push(`${dataset.id}: incomplete license/source/provenance contract`);
  if (dataset.sha256 && !/^sha256:[0-9a-f]{64}$/.test(dataset.sha256)) failures.push(`${dataset.id}: malformed SHA-256`);
}

if (process.argv.includes('--verify-cache')) {
  const cacheRoot = process.env.TAILING_ATOMISTIC_CACHE;
  if (!cacheRoot || !path.isAbsolute(cacheRoot)) failures.push('cache: TAILING_ATOMISTIC_CACHE must be an absolute path');
  else {
    let verifiedRoot;
    try { verifiedRoot = await canonicalCacheRoot(cacheRoot); } catch (error) { failures.push(`cache: root is unavailable (${error instanceof Error ? error.message : String(error)})`); }
    for (const artifact of verifiedRoot ? artifactContracts(plan) : []) {
      try { await verifyCachedArtifact(verifiedRoot, artifact); }
      catch (error) { failures.push(`${artifact.id}: cached artifact unavailable (${error instanceof Error ? error.message : String(error)})`); }
    }
    if (verifiedRoot && primary?.cachePath) {
      try {
        const parsed = inspectRandomTp(await readFile(path.join(verifiedRoot, primary.cachePath)), primary.artifact.smokeIds);
        for (const key of ['frames', 'atoms', 'elements', 'smokeElements', 'idSetSha256', 'smokeManifestSha256', 'recordManifestSha256', 'smokeRecordManifestSha256']) {
          if (parsed[key] !== primary.artifact[key]) failures.push(`${primary.id}: cached ${key} does not match the frozen manifest`);
        }
        if (!parsed.records.every((record) => record.atomCount === primary.artifact.atomsPerFrame)) failures.push(`${primary.id}: cached dataset does not have ${primary.artifact.atomsPerFrame} atoms in every frame`);
      } catch (error) {
        failures.push(`${primary.id}: cached dataset parsing failed (${error instanceof Error ? error.message : String(error)})`);
      }
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Atomistic plan: VALID · ${plan.models.length} pinned models · ${plan.benchmarks.length} benchmarks · ${unresolved.length} intentionally blocked artifact(s) · FULL CANDIDATE FROZEN ${candidatePlan.bindings.benchmark.frames}×${candidatePlan.execution.partitioning.partitions.length} — NOT RUN · RUNTIME INPUTS BYTE-FROZEN · SHARED-HOST VNEXT PREFLIGHT ONLY · DISPATCH BLOCKED · ${process.argv.includes('--verify-cache') ? 'CACHE + DATASET RECORDS VERIFIED' : 'PLAN ONLY — NO INFERENCE'}`);
}
