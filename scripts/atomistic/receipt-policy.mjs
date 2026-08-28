import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';

export const RECEIPT_SCHEMA_VERSION = 'tf.atomistic-reproduction-receipt/0.1';
export const RECEIPT_PATH_PATTERN = /^evaluation\/atomistic\/receipts\/[A-Za-z0-9][A-Za-z0-9._-]*\.json$/;
export const EXPECTED_REPOSITORY = 'tony070926-sudo/tailing-future';
export const EXPECTED_REPOSITORY_ID = 1_349_498_456;
export const FULL_WORKFLOW_PATH = '.github/workflows/atomistic-full.yml';
export const SMOKE_WORKFLOW_PATH = '.github/workflows/atomistic-smoke.yml';
export const EXPECTED_ATTESTATION_ISSUER = 'https://token.actions.githubusercontent.com';
export const EXPECTED_ATTESTATION_BUILD_TYPE = 'https://actions.github.io/buildtypes/workflow/v1';
export const EXPECTED_ATTESTATION_RUNNER_ENVIRONMENT = 'github-hosted';
export const EXPECTED_ATTESTATION_PREDICATE_TYPE = 'https://slsa.dev/provenance/v1';
export const expectedAttestationBuilderId = (workflowPath, ref) => `https://github.com/${EXPECTED_REPOSITORY}/${workflowPath}@${ref}`;
export const expectedAttestationSignerWorkflow = (workflowPath) => `${EXPECTED_REPOSITORY}/${workflowPath}`;
const randomTpIdManifestBytes = await readFile(new URL('../../evaluation/atomistic/random-tp-id-manifest.txt', import.meta.url));
const randomTpIdManifestDigest = sha256(randomTpIdManifestBytes);
if (randomTpIdManifestDigest !== 'sha256:4df1ba7cda1b0a31cdb0b3e2281ed535327d7b92ce381cd930c781cc8b800f91') throw new Error('Random-TP ID manifest digest is not the frozen ID set.');
const randomTpIdManifestText = randomTpIdManifestBytes.toString('utf8');
export const RANDOM_TP_IDS = Object.freeze(randomTpIdManifestText.endsWith('\n') ? randomTpIdManifestText.slice(0, -1).split('\n') : []);
if (RANDOM_TP_IDS.length !== 693 || new Set(RANDOM_TP_IDS).size !== 693 || RANDOM_TP_IDS.some((id, index) => !/^random-TP-[0-9]{6}$/.test(id) || (index > 0 && RANDOM_TP_IDS[index - 1] >= id))) throw new Error('Random-TP ID manifest is not 693 unique sorted canonical IDs.');
export const RANDOM_TP_SMOKE_IDS = Object.freeze([
  'random-TP-000000', 'random-TP-000005', 'random-TP-000010', 'random-TP-000095', 'random-TP-000125',
  'random-TP-000135', 'random-TP-000200', 'random-TP-000220', 'random-TP-000369', 'random-TP-000555',
]);

export const EXPECTED_ASSETS = Object.freeze({
  datasetDigest: 'sha256:c14473dcf4bd71e1ed11556ac9ff12b68e7a423d813f939bc9eedaef663054d9',
  idSetDigest: 'sha256:4df1ba7cda1b0a31cdb0b3e2281ed535327d7b92ce381cd930c781cc8b800f91',
  smokeIdSetDigest: 'sha256:858b009bddf8fe8d78114b1c227fd7756c49990ca84aaf7ee8e5aecd54967423',
  recordManifestDigest: 'sha256:6afbbdc0cd745efaca4bf5d7a2a7604db9f1d1f59749b86d3c0a51d48f07893a',
  structureBundleDigest: 'sha256:d4ff1ee210abf80884e1526b1e2600e918103f3505a2a712bce57d6fba3a1b5c',
  structureManifestFileDigest: 'sha256:9f870f62cd60b7021d874d1970c81ac8cb64a302e2c5fd4013464198fd11a25e',
  structureManifestRoot: 'sha256:b0a94b5424f9d4a2be7519265b8dbe89a478fa5b21a6c956c70ffe0c705078f7',
  smokeStructureManifestRoot: 'sha256:0b412c1d675b1ee8adf434610cd4e29bb40601c1c966bdbaa9cbc114d880f938',
  models: Object.freeze({
    'mattersim-1.0.0-5m': Object.freeze({
      modelId: 'mattersim-v1.0.0-5m',
      role: 'active',
      resultClass: 'REPRODUCED_MODEL_CARD_PROTOCOL',
      packageName: 'mattersim',
      packageVersion: '1.2.5',
      packageDigest: 'sha256:1b5e46ba56efa5c1e93372ad32321300fa5e1f07dd9188a11b727bd578cf8d7f',
      checkpointDigest: 'sha256:e3df9fa708725e3d453140646c7d1838324b347a3d1214cf1440522146f872b5',
    }),
    'mace-mpa-0': Object.freeze({
      modelId: 'mace-mpa-0-medium',
      role: 'challenger',
      resultClass: 'ENGINEERING_BASELINE_COMPLETE',
      packageName: 'mace-torch',
      packageVersion: '0.3.16',
      packageDigest: 'sha256:b80407edf6b2a1ec8523668c2a36852d20927ce1c3c56b70983a9f2dc53233ad',
      checkpointDigest: 'sha256:75428afe3a1d7d8062e19bcaabd5c433623cabf308242ec9fb493e38604fb638',
    }),
  }),
});

export const MATTERSIM_PROTOCOL = Object.freeze({
  targets: Object.freeze({ energyMaeEvPerAtom: 0.199, forceVectorMaeEvPerAngstrom: 0.824, stressFrobeniusMaeGpa: 1.999 }),
  tolerances: Object.freeze({ relative: 0.02, energyAbsolute: 0.005, forceAbsolute: 0.02, stressAbsolute: 0.05 }),
});

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const repositoryRootFromModule = path.resolve(scriptDirectory, '../..');
const receiptSchema = JSON.parse(await readFile(path.join(repositoryRootFromModule, 'schemas/atomistic-reproduction-receipt.schema.json'), 'utf8'));
const currentPlanBytes = await readFile(path.join(repositoryRootFromModule, 'evaluation/atomistic/reproduction-plan.json'));
const currentPlan = JSON.parse(currentPlanBytes.toString('utf8'));
export const CURRENT_PLAN_DIGEST = sha256(currentPlanBytes);
export const CURRENT_PLAN_EXECUTION_POLICY = executionPolicyFromPlan(currentPlan);
export const METRIC_REPORT_PROTOCOL = Object.freeze({
  definitionId: currentPlan.protocol.metrics.definitionId,
  aggregation: currentPlan.protocol.metrics.aggregation,
  summation: currentPlan.protocol.metrics.summation,
  quantileMethod: currentPlan.protocol.metrics.quantileMethod,
  reportedStatistics: Object.freeze([...currentPlan.protocol.metrics.reportedStatistics]),
  worstTieBreak: currentPlan.protocol.metrics.worstTieBreak,
  perIdMetricEvidenceRootProtocol: currentPlan.protocol.metrics.perIdMetricEvidenceRootProtocol,
  reports: Object.freeze(Object.fromEntries(Object.entries(currentPlan.protocol.metrics.reportDefinitions).map(([metric, report]) => [metric, Object.freeze({ ...report })]))),
});
const MATTERSIM_REPORT_TARGETS = Object.freeze({
  energy: 'energyMaeEvPerAtom',
  force: 'forceVectorMaeEvPerAngstrom',
  stress: 'stressFrobeniusMaeGpa',
});

const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
const validateSchema = ajv.compile(receiptSchema);

/**
 * Validate a receipt without network access or external commands. Cryptographic
 * attestation verification remains the responsibility of the independent
 * verifier named by independentVerifierDigest; this policy binds its extracted
 * claims and the exact attestation bundle bytes into the promotion receipt.
 */
export function validateReproductionReceipt(receipt, options = {}) {
  const errors = [];
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  if (!Number.isFinite(now.getTime())) errors.push('policy clock is invalid');

  let schemaValid = false;
  try {
    schemaValid = validateSchema(receipt);
  } catch (error) {
    errors.push(`schema: validator crashed (${error instanceof Error ? error.message : String(error)})`);
  }
  if (!schemaValid) {
    for (const error of validateSchema.errors ?? []) errors.push(`schema${error.instancePath || '/'}: ${error.message}`);
    return result(errors);
  }

  findNonFiniteNumbers(receipt, '$', errors, new Set());
  requireTimestamp(receipt.createdAt, 'createdAt', errors);
  if (receipt.plan.digest !== CURRENT_PLAN_DIGEST) errors.push('plan.digest does not match the current frozen reproduction plan');
  if (receipt.source.repository !== EXPECTED_REPOSITORY || receipt.source.repositoryId !== EXPECTED_REPOSITORY_ID) errors.push('source repository identity is not Tailing Future');
  if (options.expectedSourceRevision && receipt.source.revision !== options.expectedSourceRevision) errors.push('source.revision does not match the expected promotion revision');

  if (receipt.profile === 'plan') return result(errors);

  const candidateExecutionPolicy = options.trustedExecutionPolicy ?? CURRENT_PLAN_EXECUTION_POLICY;
  const executionErrors = executionPolicyProblems(candidateExecutionPolicy);
  if (executionErrors.length) errors.push(`frozen execution policy is incomplete: ${executionErrors.join('; ')}`);
  const executionPolicy = executionErrors.length === 0 ? candidateExecutionPolicy : { ready: false };
  validateExecutedReceipt(receipt, now, errors, executionPolicy);
  if (receipt.profile === 'full') validateFullReceipt(receipt, errors);
  else validateSmokeReceipt(receipt, errors);
  return result(errors);
}

/**
 * A registry entry marked reproduced is eligible only when it points to a
 * complete full receipt and duplicates every promotion-critical digest. Entries
 * at lower evidence classes are outside this policy and remain non-promoted.
 */
export function validateComparatorPromotion(comparator, receipt, options = {}) {
  const errors = [];
  if (!comparator || typeof comparator !== 'object' || Array.isArray(comparator)) return result(['comparator must be an object'], false);
  if (comparator.evidenceClass !== 'reproduced') return { ok: true, applicable: false, errors: [] };

  if (!validateReceiptPath(comparator.receiptPath)) errors.push('reproduced comparator requires a canonical evaluation/atomistic/receipts/*.json receiptPath');
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    errors.push('reproduced comparator requires the loaded receipt object');
    return result(errors, true);
  }

  const receiptByteEvidence = validateReceiptByteEvidence(receipt, options.receiptBytes, errors);

  const receiptResult = validateReproductionReceipt(receipt, options);
  errors.push(...receiptResult.errors.map((error) => `receipt: ${error}`));
  if (!receiptResult.ok) return result(errors, true);
  if (receipt.profile !== 'full' || receipt.claimEligible !== true || receipt.status !== 'verified') errors.push('reproduced comparator requires a claim-eligible verified full receipt');
  validateTrustedPromotionContext(receipt, options.trustedPromotionContext, receiptByteEvidence, errors);

  const model = Array.isArray(receipt.models) ? receipt.models.find((entry) => entry.comparatorId === comparator.id) : undefined;
  if (!model) {
    errors.push(`receipt does not contain comparator ${String(comparator.id)}`);
    return result(errors, true);
  }
  if (comparator.comparable !== true) errors.push('reproduced comparator must explicitly set comparable=true');
  if (comparator.resultClass !== model.resultClass) errors.push('comparator resultClass does not match its receipt result');
  if (comparator.id === 'mace-mpa-0' && comparator.superiorityClaimed !== false) errors.push('MACE blind baseline must explicitly set superiorityClaimed=false');

  const bindings = {
    packageDigest: model.package.digest,
    checkpointDigest: model.checkpointDigest,
    datasetDigest: receipt.benchmark?.datasetDigest,
    runnerDigest: receipt.runner?.digest,
    containerDigest: model.containerDigest,
    dependencyLockDigest: model.dependencyLockDigest,
    predictionMerkleRoot: model.predictionMerkleRoot,
    resultBundleDigest: model.resultBundleDigest,
    evidenceBundleDigest: receipt.evidenceBundleDigest,
    independentVerifierDigest: receipt.verification?.independentVerifierDigest,
    reproductionSourceRevision: receipt.source?.revision,
    artifactApiDigest: receipt.provenance?.artifact?.apiDigest,
    attestationBundleDigest: receipt.provenance?.attestation?.bundleDigest,
    attestationRawBundleDigest: receipt.provenance?.attestation?.rawBundleDigest,
  };
  for (const [field, expected] of Object.entries(bindings)) {
    if (comparator[field] !== expected) errors.push(`comparator ${field} does not match its receipt`);
  }
  return result(errors, true);
}

/** Read a comparator receipt from a symlink-free repository-relative path. */
export async function loadComparatorReceipt(comparator, options = {}) {
  const errors = [];
  if (!comparator || comparator.evidenceClass !== 'reproduced') return { ok: true, applicable: false, errors: [], receipt: null };
  if (!validateReceiptPath(comparator.receiptPath)) return { ok: false, applicable: true, errors: ['invalid receiptPath'], receipt: null };

  const root = path.resolve(options.root ?? process.cwd());
  const receiptsRoot = path.join(root, 'evaluation', 'atomistic', 'receipts');
  const candidate = path.resolve(root, comparator.receiptPath);
  if (!isPathInside(receiptsRoot, candidate)) return { ok: false, applicable: true, errors: ['receiptPath escapes the receipt directory'], receipt: null };

  try {
    const metadata = await lstat(candidate);
    if (metadata.isSymbolicLink() || !metadata.isFile()) throw new Error('receipt must be a regular non-symlink file');
    if (metadata.nlink !== 1) throw new Error('receipt must not be a hard link');
    if (metadata.size < 2 || metadata.size > 5 * 1024 * 1024) throw new Error('receipt size is outside the 2 byte to 5 MiB policy');
    const handle = await open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const openedMetadata = await handle.stat();
      if (!openedMetadata.isFile() || openedMetadata.dev !== metadata.dev || openedMetadata.ino !== metadata.ino) throw new Error('receipt changed while it was being opened');
      const [canonicalRepositoryRoot, canonicalReceiptsRoot, canonicalCandidate] = await Promise.all([realpath(root), realpath(receiptsRoot), realpath(candidate)]);
      if (canonicalReceiptsRoot !== path.join(canonicalRepositoryRoot, 'evaluation', 'atomistic', 'receipts')) throw new Error('receipt directory must not contain symlink ancestors');
      if (!isPathInside(canonicalReceiptsRoot, canonicalCandidate)) throw new Error('canonical receipt path escapes the receipt directory');
      const receiptBytes = await handle.readFile();
      const receipt = parseJsonRejectDuplicateKeys(receiptBytes);
      if (!receiptBytes.equals(canonicalReceiptBytes(receipt))) throw new Error('receipt bytes are not the required canonical JSON plus one LF');
      const validation = validateComparatorPromotion(comparator, receipt, { ...options, receiptBytes });
      return { ...validation, receipt };
    } finally {
      await handle.close();
    }
  } catch (error) {
    errors.push(`receipt load failed: ${error instanceof Error ? error.message : String(error)}`);
    return { ok: false, applicable: true, errors, receipt: null };
  }
}

export function validateReceiptPath(receiptPath) {
  return typeof receiptPath === 'string'
    && !receiptPath.includes('\\')
    && RECEIPT_PATH_PATTERN.test(receiptPath)
    && path.posix.normalize(receiptPath) === receiptPath;
}

/** Convert the frozen plan into promotion trust roots; null digests fail closed. */
export function executionPolicyFromPlan(plan) {
  const errors = [];
  const runner = plan?.protocol?.runner;
  if (plan?.schemaVersion !== 'tf.atomistic-reproduction/0.2') errors.push('plan schema is not tf.atomistic-reproduction/0.2');
  const values = {
    runnerDigest: runner?.runnerDigest,
    containers: {
      'mattersim-v1.0.0-5m': runner?.containerDigests?.mattersim,
      'mace-mpa-0-medium': runner?.containerDigests?.mace,
    },
    dependencyLocks: {
      'mattersim-v1.0.0-5m': runner?.dependencyLockDigests?.mattersim,
      'mace-mpa-0-medium': runner?.dependencyLockDigests?.mace,
    },
    python: runner?.python,
    platform: runner?.platform,
    architecture: runner?.architecture,
    dtype: runner?.dtype,
    device: runner?.canonicalDevice,
    batchSize: runner?.batchSize,
    threads: runner?.threads,
  };
  for (const [label, value] of [
    ['runnerDigest', values.runnerDigest],
    ['MatterSim container digest', values.containers['mattersim-v1.0.0-5m']],
    ['MACE container digest', values.containers['mace-mpa-0-medium']],
    ['MatterSim dependency-lock digest', values.dependencyLocks['mattersim-v1.0.0-5m']],
    ['MACE dependency-lock digest', values.dependencyLocks['mace-mpa-0-medium']],
  ]) if (!/^sha256:[0-9a-f]{64}$/.test(value ?? '')) errors.push(`${label} is not frozen`);
  if (!/^3\.12\.[0-9]+$/.test(values.python ?? '')) errors.push('Python patch version is not frozen');
  if (values.platform !== 'linux' || values.architecture !== 'x86_64') errors.push('platform must be linux/x86_64');
  if (values.dtype !== 'float32' || values.device !== 'cpu' || values.batchSize !== 1 || !Number.isInteger(values.threads) || values.threads < 1) errors.push('canonical dtype/device/batch/thread contract is incomplete');
  return Object.freeze({ ...values, containers: Object.freeze(values.containers), dependencyLocks: Object.freeze(values.dependencyLocks), ready: errors.length === 0, errors: Object.freeze(errors) });
}

export function digestCanonical(value) {
  return sha256(Buffer.from(canonicalJson(value), 'utf8'));
}

/** Exact on-disk receipt representation: canonical JSON followed by one LF. */
export function canonicalReceiptBytes(receipt) {
  return Buffer.from(`${canonicalJson(receipt)}\n`, 'utf8');
}

/**
 * Domain-separated root for the complete scientific gate. The root binds the
 * frozen structure bundle/manifests, runner codec, independent verifier,
 * prediction artifacts and every structured scientific result without
 * including itself.
 */
export function computeScientificValidationRoot(receipt) {
  if (!receipt?.scientificValidation || !Array.isArray(receipt.scientificValidation.models)) throw new TypeError('scientificValidation.models is required');
  const benchmarkPlan = currentPlan.benchmarks?.find((entry) => entry.id === receipt.benchmark?.id);
  if (!benchmarkPlan?.artifact?.url || !benchmarkPlan.cachePath) throw new TypeError('frozen benchmark file identity is required');
  const modelEvidence = receipt.scientificValidation.models.map((validation) => {
    const model = receipt.models?.find((entry) => entry.comparatorId === validation.comparatorId);
    if (!model) throw new TypeError(`missing model evidence for ${String(validation.comparatorId)}`);
    return {
      comparatorId: model.comparatorId,
      modelReceipt: model,
      metricReports: model.metrics,
      validation,
    };
  });
  return digestCanonical({
    domain: 'tf.atomistic-scientific-validation/v2',
    planDigest: receipt.plan?.digest,
    status: receipt.scientificValidation.status,
    benchmark: {
      id: receipt.benchmark?.id,
      structureBundleFile: benchmarkPlan.cachePath,
      structureBundleSource: benchmarkPlan.artifact.url,
      structureBundleSourceCommit: benchmarkPlan.sourceCommit,
      rawDatasetDigest: receipt.benchmark?.datasetDigest,
      idSetDigest: receipt.benchmark?.idSetDigest,
      recordManifestDigest: receipt.benchmark?.recordManifestDigest,
      modelVisibleStructureBundleDigest: receipt.benchmark?.structureBundleDigest,
      structureManifestFileDigest: receipt.benchmark?.structureManifestFileDigest,
      structureManifestRoot: receipt.benchmark?.structureManifestRoot,
      manifestCanonicalization: benchmarkPlan.artifact.manifestCanonicalization,
    },
    runner: {
      digest: receipt.runner?.digest,
      recordCodecDigest: receipt.runner?.recordCodecDigest,
    },
    independentVerifierDigest: receipt.verification?.independentVerifierDigest,
    modelEvidence,
  });
}

function validateExecutedReceipt(receipt, now, errors, executionPolicy) {
  const { workflow, artifact, attestation } = receipt.provenance;
  const expectedWorkflowPath = receipt.profile === 'full' ? FULL_WORKFLOW_PATH : SMOKE_WORKFLOW_PATH;
  if (workflow.path !== expectedWorkflowPath) errors.push(`${receipt.profile} receipt uses the wrong workflow path`);
  if (receipt.profile === 'full' && (workflow.event !== 'workflow_dispatch' || workflow.ref !== 'refs/heads/main')) errors.push('full receipt must originate from workflow_dispatch on refs/heads/main');
  if (workflow.sha !== receipt.source.revision) errors.push('workflow SHA does not match source revision');

  const claims = attestation.verifiedClaims;
  const workflowBindings = {
    issuer: EXPECTED_ATTESTATION_ISSUER,
    repository: receipt.source.repository,
    repositoryId: receipt.source.repositoryId,
    workflowPath: workflow.path,
    runId: workflow.runId,
    runAttempt: workflow.runAttempt,
    sourceRevision: workflow.sha,
    event: workflow.event,
    ref: workflow.ref,
    builderId: expectedAttestationBuilderId(workflow.path, workflow.ref),
    buildType: EXPECTED_ATTESTATION_BUILD_TYPE,
    runnerEnvironment: EXPECTED_ATTESTATION_RUNNER_ENVIRONMENT,
    predicateType: EXPECTED_ATTESTATION_PREDICATE_TYPE,
  };
  for (const [field, expected] of Object.entries(workflowBindings)) if (claims[field] !== expected) errors.push(`attestation verified claim ${field} does not match workflow provenance`);
  if (receipt.hardware.runnerClass !== claims.runnerEnvironment) errors.push('hardware runnerClass does not match the attested runner environment');

  const expectedArtifactName = `tailing-atomistic-${receipt.profile}-${workflow.sha}-${workflow.runId}-${workflow.runAttempt}`;
  const expectedSubjectName = `tailing-atomistic-${receipt.profile}-${workflow.sha}.tar.zst`;
  if (artifact.name !== expectedArtifactName) errors.push('artifact name is not bound to profile, SHA, run ID and attempt');
  if (artifact.subjectName !== expectedSubjectName) errors.push('artifact subject name is not bound to profile and SHA');
  if (attestation.subjectName !== artifact.subjectName) errors.push('attestation subject name does not match artifact subject');
  if (artifact.subjectDigest !== receipt.evidenceBundleDigest) errors.push('artifact subject and evidence-bundle digests are not identical');
  if (attestation.subjectDigest !== artifact.subjectDigest) errors.push('attestation subject digest does not match artifact subject');
  try {
    if (attestation.bundleDigest !== digestCanonical(attestation.bundle)) errors.push('attestation bundle digest does not match canonical bundle bytes');
  } catch (error) {
    errors.push(`attestation bundle is not canonical JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  for (const field of ['id', 'name', 'apiDigest', 'expiresAt', 'expired']) if (receipt.verification.artifactObservation[field] !== artifact[field]) errors.push(`independent verifier artifact observation ${field} does not match provenance`);

  requireTimestamp(artifact.expiresAt, 'artifact.expiresAt', errors);
  requireTimestamp(receipt.verification.verifiedAt, 'verification.verifiedAt', errors);
  requireTimestamp(receipt.cost.estimated.priceSnapshotAt, 'cost.estimated.priceSnapshotAt', errors);
  const expiry = Date.parse(artifact.expiresAt);
  const created = Date.parse(receipt.createdAt);
  const verified = Date.parse(receipt.verification.verifiedAt);
  const priceSnapshot = Date.parse(receipt.cost.estimated.priceSnapshotAt);
  const current = now.getTime();
  if (Number.isFinite(expiry) && Number.isFinite(created) && expiry <= created) errors.push('artifact expiry must be after receipt creation');
  if (Number.isFinite(expiry) && Number.isFinite(current) && expiry <= current) errors.push('artifact has expired and is no longer promotion evidence');
  if (Number.isFinite(verified) && Number.isFinite(created) && verified < created) errors.push('verification timestamp predates receipt creation');
  if (Number.isFinite(verified) && Number.isFinite(expiry) && verified >= expiry) errors.push('verification timestamp is not before artifact expiry');
  if (Number.isFinite(created) && Number.isFinite(current) && created > current) errors.push('receipt creation timestamp is in the future');
  if (Number.isFinite(verified) && Number.isFinite(current) && verified > current) errors.push('verification timestamp is in the future');
  if (Number.isFinite(priceSnapshot) && Number.isFinite(created) && priceSnapshot > created) errors.push('cost price snapshot postdates receipt creation');

  const measured = receipt.cost.measured;
  const acceleratorCount = receipt.hardware.accelerators.reduce((sum, accelerator) => sum + accelerator.count, 0);
  if (measured.cpuSeconds > measured.wallSeconds * receipt.hardware.cpu.logicalCores * 1.05) errors.push('measured CPU seconds exceed the hardware/wall-time envelope');
  if (measured.gpuSeconds > measured.wallSeconds * acceleratorCount * 1.05) errors.push('measured accelerator seconds exceed the hardware/wall-time envelope');
  if (acceleratorCount === 0 && (measured.gpuSeconds !== 0 || measured.peakAcceleratorMemoryBytes !== 0)) errors.push('accelerator cost was reported without accelerator hardware');
  if (receipt.models.every((model) => model.execution.device === 'cpu') && (measured.gpuSeconds !== 0 || measured.peakAcceleratorMemoryBytes !== 0)) errors.push('accelerator usage was reported for an all-CPU execution');

  if (receipt.benchmark.datasetDigest !== EXPECTED_ASSETS.datasetDigest) errors.push('benchmark dataset digest is not the frozen Random-TP digest');
  if (executionPolicy?.ready) {
    if (receipt.runner.digest !== executionPolicy.runnerDigest) errors.push('runner digest does not match the frozen execution policy');
    for (const modelId of ['mattersim-v1.0.0-5m', 'mace-mpa-0-medium']) {
      if (receipt.runner.containers[modelId] !== executionPolicy.containers[modelId]) errors.push(`${modelId} container digest does not match the frozen execution policy`);
      if (receipt.runner.dependencyLocks[modelId] !== executionPolicy.dependencyLocks[modelId]) errors.push(`${modelId} dependency-lock digest does not match the frozen execution policy`);
    }
    const expectedArchitecture = executionPolicy.architecture === 'x86_64' ? 'x64' : executionPolicy.architecture;
    if (receipt.hardware.architecture !== expectedArchitecture || !receipt.hardware.os.toLowerCase().includes(executionPolicy.platform)) errors.push('hardware OS/architecture does not match the frozen execution policy');
  }
  const seenComparators = new Set();
  const seenModels = new Set();
  for (const model of receipt.models) {
    if (seenComparators.has(model.comparatorId)) errors.push(`duplicate comparator model ${model.comparatorId}`);
    if (seenModels.has(model.modelId)) errors.push(`duplicate model ID ${model.modelId}`);
    seenComparators.add(model.comparatorId);
    seenModels.add(model.modelId);
    validateModelBindings(receipt, model, errors, executionPolicy);
  }
  if (seenComparators.size !== 2 || !seenComparators.has('mattersim-1.0.0-5m') || !seenComparators.has('mace-mpa-0')) errors.push('receipt must contain exactly MatterSim and MACE');

  const roots = receipt.models.map((model) => model.predictionMerkleRoot);
  const bundles = receipt.models.map((model) => model.resultBundleDigest);
  if (new Set(roots).size !== roots.length) errors.push('the two model prediction Merkle roots must be distinct');
  if (new Set(bundles).size !== bundles.length) errors.push('the two model result bundle digests must be distinct');
}

/*
 * Promotion is deliberately stricter than receipt parsing. These observations
 * must be supplied by the release guard after it obtains GitHub metadata,
 * verifies the Sigstore bundle, hashes its raw bytes, decodes its authenticated
 * claims and hashes the downloaded evidence. Deriving this object from the
 * receipt would defeat the trust boundary. receiptRawDigest covers the exact
 * canonical on-disk bytes including LF; receiptCanonicalDigest covers the
 * canonical JSON payload without the trailing LF.
 */
function validateTrustedPromotionContext(receipt, observation, receiptByteEvidence, errors) {
  if (!observation || typeof observation !== 'object' || Array.isArray(observation)) {
    errors.push('reproduced promotion requires independent trustedPromotionContext observations');
    return;
  }
  if (observation.attestationCryptographicallyVerified !== true) errors.push('promotion context does not confirm cryptographic attestation verification');
  if (observation.artifactDownloadedFromActionsApi !== true) errors.push('promotion context does not confirm Actions API artifact retrieval');

  const bindings = [
    ['receiptRawDigest', observation.receiptRawDigest, receiptByteEvidence?.rawDigest],
    ['receiptCanonicalDigest', observation.receiptCanonicalDigest, receiptByteEvidence?.canonicalDigest],
    ['source.revision', observation.source?.revision, receipt.source?.revision],
    ['source.treeDigest', observation.source?.treeDigest, receipt.source?.treeDigest],
    ['hardwareDigest', observation.hardwareDigest, digestCanonical(receipt.hardware)],
    ['workflow.path', observation.workflow?.path, receipt.provenance?.workflow?.path],
    ['workflow.id', observation.workflow?.id, receipt.provenance?.workflow?.id],
    ['workflow.runId', observation.workflow?.runId, receipt.provenance?.workflow?.runId],
    ['workflow.runAttempt', observation.workflow?.runAttempt, receipt.provenance?.workflow?.runAttempt],
    ['workflow.event', observation.workflow?.event, receipt.provenance?.workflow?.event],
    ['workflow.ref', observation.workflow?.ref, receipt.provenance?.workflow?.ref],
    ['workflow.sha', observation.workflow?.sha, receipt.provenance?.workflow?.sha],
    ['artifact.id', observation.artifact?.id, receipt.provenance?.artifact?.id],
    ['artifact.name', observation.artifact?.name, receipt.provenance?.artifact?.name],
    ['artifact.apiDigest', observation.artifact?.apiDigest, receipt.provenance?.artifact?.apiDigest],
    ['artifact.subjectName', observation.artifact?.subjectName, receipt.provenance?.artifact?.subjectName],
    ['artifact.subjectDigest', observation.artifact?.subjectDigest, receipt.provenance?.artifact?.subjectDigest],
    ['artifact.expiresAt', observation.artifact?.expiresAt, receipt.provenance?.artifact?.expiresAt],
    ['artifact.expired', observation.artifact?.expired, receipt.provenance?.artifact?.expired],
    ['attestation.bundleDigest', observation.attestation?.bundleDigest, receipt.provenance?.attestation?.bundleDigest],
    ['attestation.rawBundleDigest', observation.attestation?.rawBundleDigest, receipt.provenance?.attestation?.rawBundleDigest],
    ['attestation.subjectName', observation.attestation?.subjectName, receipt.provenance?.attestation?.subjectName],
    ['attestation.subjectDigest', observation.attestation?.subjectDigest, receipt.provenance?.attestation?.subjectDigest],
    ['evidenceBundleDigest', observation.evidenceBundleDigest, receipt.evidenceBundleDigest],
    ['runner.recordCodecDigest', observation.recordCodecDigest, receipt.runner?.recordCodecDigest],
    ['verification.independentVerifierDigest', observation.independentVerifierDigest, receipt.verification?.independentVerifierDigest],
    ['cost.estimated.pricingSourceDigest', observation.pricingSourceDigest, receipt.cost?.estimated?.pricingSourceDigest],
    ['scientificValidation.root', observation.scientificValidationRoot, receipt.scientificValidation?.root],
    ['benchmark.structureBundleDigest', observation.structureInputs?.bundleDigest, receipt.benchmark?.structureBundleDigest],
    ['benchmark.structureManifestFileDigest', observation.structureInputs?.manifestFileDigest, receipt.benchmark?.structureManifestFileDigest],
    ['benchmark.structureManifestRoot', observation.structureInputs?.manifestRoot, receipt.benchmark?.structureManifestRoot],
  ];
  for (const [label, observed, claimed] of bindings) {
    if (observed === undefined || observed !== claimed) errors.push(`trusted promotion observation ${label} is missing or does not match the receipt`);
  }
  if (!sameCanonical(observation.attestation?.decodedVerifiedClaims, receipt.provenance?.attestation?.verifiedClaims)) errors.push('trusted attestation decoded claims do not match the receipt claims');

  // These normalized values must come from gh attestation verify's
  // verificationResult.signature.certificate and verifiedTimestamps, not from
  // the workflow-controlled SLSA predicate. The policy mirrors the strict CLI
  // flags used by the future independent promotion guard.
  const expectedBuilderId = expectedAttestationBuilderId(
    receipt.provenance.workflow.path,
    receipt.provenance.workflow.ref,
  );
  const expectedSignerWorkflow = expectedAttestationSignerWorkflow(receipt.provenance.workflow.path);
  const expectedCertificate = {
    issuer: EXPECTED_ATTESTATION_ISSUER,
    subjectAlternativeName: expectedBuilderId,
    sourceRepository: EXPECTED_REPOSITORY,
    repositoryId: EXPECTED_REPOSITORY_ID,
    sourceDigest: receipt.provenance.workflow.sha,
    sourceRef: receipt.provenance.workflow.ref,
    signerWorkflow: expectedSignerWorkflow,
    signerDigest: receipt.provenance.workflow.sha,
    runId: receipt.provenance.workflow.runId,
    runAttempt: receipt.provenance.workflow.runAttempt,
    runnerEnvironment: EXPECTED_ATTESTATION_RUNNER_ENVIRONMENT,
  };
  for (const [field, expected] of Object.entries(expectedCertificate)) {
    if (observation.attestation?.certificate?.[field] !== expected) errors.push(`trusted attestation certificate ${field} is missing or does not match policy`);
  }
  const expectedVerificationPolicy = {
    repository: EXPECTED_REPOSITORY,
    signerWorkflow: expectedSignerWorkflow,
    signerDigest: receipt.provenance.workflow.sha,
    sourceDigest: receipt.provenance.workflow.sha,
    sourceRef: receipt.provenance.workflow.ref,
    predicateType: EXPECTED_ATTESTATION_PREDICATE_TYPE,
    denySelfHostedRunners: true,
  };
  for (const [field, expected] of Object.entries(expectedVerificationPolicy)) {
    if (observation.attestation?.verificationPolicy?.[field] !== expected) errors.push(`trusted attestation verification policy ${field} is missing or does not match`);
  }
  const verifiedTimestamps = observation.attestation?.verifiedTimestamps;
  if (!Array.isArray(verifiedTimestamps) || verifiedTimestamps.length < 1) {
    errors.push('trusted attestation has no verified transparency-log or timestamp-authority timestamp');
  } else {
    const verificationTime = Date.parse(receipt.verification.verifiedAt);
    for (const [index, timestamp] of verifiedTimestamps.entries()) {
      requireTimestamp(timestamp, `trusted attestation verifiedTimestamps[${index}]`, errors);
      const parsed = Date.parse(timestamp);
      if (Number.isFinite(parsed) && Number.isFinite(verificationTime) && parsed > verificationTime) errors.push('trusted attestation verified timestamp postdates independent verification');
    }
  }

  for (const model of receipt.models ?? []) {
    const observed = observation.modelOutputs?.[model.comparatorId];
    let reportsMatch = true;
    for (const metric of ['energy', 'force', 'stress']) {
      const report = model.metrics?.[metric];
      const observedReport = observed?.metricReports?.[metric];
      if (!report
        || !observedReport
        || !sameCanonical(observedReport.report, report)
        || observedReport.reportDigest !== digestCanonical(report)
        || observedReport.perIdMetricEvidenceRoot !== report.perIdMetricEvidenceRoot) reportsMatch = false;
    }
    if (!observed
      || observed.predictionMerkleRoot !== model.predictionMerkleRoot
      || observed.resultBundleDigest !== model.resultBundleDigest
      || observed.modelReceiptDigest !== digestCanonical(model)
      || observed.metricsDigest !== digestCanonical(model.metrics)
      || !reportsMatch) {
      errors.push(`trusted promotion observations do not match ${model.comparatorId} output digests`);
    }
  }
}

function validateFullReceipt(receipt, errors) {
  if (receipt.benchmark.idSetDigest !== EXPECTED_ASSETS.idSetDigest) errors.push('full benchmark ID-set digest is not the frozen Random-TP ID manifest');
  if (receipt.benchmark.recordManifestDigest !== EXPECTED_ASSETS.recordManifestDigest) errors.push('full benchmark record manifest digest is not the frozen Random-TP manifest');
  if (receipt.benchmark.structureBundleDigest !== EXPECTED_ASSETS.structureBundleDigest || receipt.benchmark.structureManifestFileDigest !== EXPECTED_ASSETS.structureManifestFileDigest || receipt.benchmark.structureManifestRoot !== EXPECTED_ASSETS.structureManifestRoot) errors.push('full benchmark model-visible structure bundle provenance is not frozen');
  requireExactIds(receipt.benchmark.recordIds, RANDOM_TP_IDS, 'full benchmark', errors);

  const metricEvidenceRoots = [];
  for (const model of receipt.models) {
    requireExactIds(model.records.recordIds, RANDOM_TP_IDS, `${model.comparatorId} output`, errors);
    if (model.records.expected !== 693 || model.records.produced !== 693 || model.records.atoms !== 11088 || model.records.elements !== 89) errors.push(`${model.comparatorId} completeness totals are not 693 records / 11088 atoms / 89 elements`);
    for (const field of ['missingIds', 'duplicateIds', 'extraIds', 'failedIds', 'nonfiniteIds']) if (model.records[field].length !== 0) errors.push(`${model.comparatorId} has non-empty ${field}`);
    validateFullMetricReports(model, metricEvidenceRoots, errors);
  }
  if (metricEvidenceRoots.length !== 6 || new Set(metricEvidenceRoots).size !== 6) errors.push('full receipt metric reports require six distinct model-and-metric per-ID evidence roots');

  const matterSim = receipt.models.find((model) => model.comparatorId === 'mattersim-1.0.0-5m');
  const mace = receipt.models.find((model) => model.comparatorId === 'mace-mpa-0');
  if (!matterSim || matterSim.resultClass !== 'REPRODUCED_MODEL_CARD_PROTOCOL' || !protocolEquivalent(matterSim.metrics)) errors.push('MatterSim is not model-card-protocol equivalent within preregistered tolerances');
  if (!matterSim?.protocolAcceptance || canonicalJson(matterSim.protocolAcceptance.targets) !== canonicalJson(MATTERSIM_PROTOCOL.targets) || canonicalJson(matterSim.protocolAcceptance.tolerances) !== canonicalJson(MATTERSIM_PROTOCOL.tolerances)) errors.push('MatterSim protocol targets or tolerances were changed');
  if (!mace || mace.resultClass !== 'ENGINEERING_BASELINE_COMPLETE' || mace.protocolAcceptance !== null || mace.superiorityClaimed !== false) errors.push('MACE must remain a non-superiority blind engineering baseline');
  validateScientificValidation(receipt, errors);
}

function validateScientificValidation(receipt, errors) {
  const scientific = receipt.scientificValidation;
  const protocol = currentPlan.protocol?.invariance;
  if (!scientific || !protocol) {
    errors.push('full receipt requires the frozen scientific validation protocol');
    return;
  }

  const expectedComparators = ['mattersim-1.0.0-5m', 'mace-mpa-0'];
  if (scientific.status !== 'passed' || scientific.models.length !== 2 || scientific.models.some((model, index) => model.comparatorId !== expectedComparators[index])) errors.push('scientific validation must contain one ordered all-pass record for MatterSim and MACE');

  const evidenceRoots = [];
  for (const comparatorId of expectedComparators) {
    const validation = scientific.models.find((entry) => entry.comparatorId === comparatorId);
    if (!validation) {
      errors.push(`scientific validation is missing ${comparatorId}`);
      continue;
    }

    const invariance = validation.invariance;
    const expectedInvarianceProtocol = {
      translationFractionalShift: protocol.translationFractionalShift,
      permutation: protocol.permutation,
      properRotation: protocol.properRotation,
      periodicImageShift: protocol.periodicImageShift,
    };
    if (invariance.status !== 'passed'
      || !sameCanonical(invariance.structureIds, protocol.structureIds)
      || !sameCanonical(invariance.transformations, ['translation', 'permutation', 'proper-rotation', 'periodic-image'])
      || invariance.cases !== protocol.structureIds.length * 4
      || !sameCanonical(invariance.protocol, expectedInvarianceProtocol)
      || invariance.failedCases.length !== 0) errors.push(`${comparatorId} invariance coverage is incomplete or not all-pass`);
    const thresholds = protocol.thresholds;
    if (!finiteWithin(invariance.maximumErrors.energyEv, thresholds.energyMaxEv)
      || !finiteWithin(invariance.maximumErrors.forceVectorEvPerAngstrom, thresholds.forceVectorMaxEvPerAngstrom)
      || !finiteWithin(invariance.maximumErrors.stressFrobeniusEvPerAngstrom3, thresholds.stressFrobeniusMaxEvPerAngstrom3)) errors.push(`${comparatorId} invariance maximum error exceeds the frozen threshold`);

    const force = validation.forceFiniteDifference;
    const frozenForce = protocol.forceFiniteDifference;
    const expectedForceProtocol = {
      selection: frozenForce.selection,
      axisConvention: frozenForce.axisConvention,
      displacement: frozenForce.displacement,
      stepsAngstrom: frozenForce.stepsAngstrom,
      centralDifference: frozenForce.centralDifference,
      richardson: frozenForce.richardson,
      absoluteToleranceEvPerAngstrom: frozenForce.absoluteToleranceEvPerAngstrom,
      relativeTolerance: frozenForce.relativeTolerance,
      scale: frozenForce.scale,
      rule: frozenForce.rule,
      allPass: frozenForce.allPass,
    };
    const claimedForceProtocol = Object.fromEntries(Object.keys(expectedForceProtocol).map((field) => [field, force[field]]));
    if (force.status !== 'passed' || force.elements !== 89 || force.cases !== 89 || force.failedCases.length !== 0
      || !sameCanonical(claimedForceProtocol, expectedForceProtocol)
      || !finiteWithin(force.maximumNormalizedError, 1)) errors.push(`${comparatorId} force finite-difference gate is incomplete or outside tolerance`);

    const stress = validation.stressFiniteDifference;
    const frozenStress = protocol.stressFiniteDifference;
    const expectedStressProtocol = {
      structureIds: frozenStress.structureIds,
      voigtModes: frozenStress.voigtModes,
      deformation: frozenStress.deformation,
      coordinateConvention: frozenStress.coordinateConvention,
      strainBasis: frozenStress.strainBasis,
      referenceVolume: frozenStress.referenceVolume,
      strainSteps: frozenStress.strainSteps,
      centralDifference: frozenStress.centralDifference,
      richardson: frozenStress.richardson,
      comparison: frozenStress.comparison,
      absoluteToleranceEvPerAngstrom3: frozenStress.absoluteToleranceEvPerAngstrom3,
      relativeTolerance: frozenStress.relativeTolerance,
      scale: frozenStress.scale,
      rule: frozenStress.rule,
      allPass: frozenStress.allPass,
      automaticSignSelectionAllowed: frozenStress.automaticSignSelectionAllowed,
    };
    const claimedStressProtocol = Object.fromEntries(Object.keys(expectedStressProtocol).map((field) => [field, stress[field]]));
    if (stress.status !== 'passed'
      || stress.cases !== frozenStress.structureIds.length * frozenStress.voigtModes.length
      || stress.failedCases.length !== 0
      || !sameCanonical(claimedStressProtocol, expectedStressProtocol)
      || stress.automaticSignSelectionAllowed !== false
      || !finiteWithin(stress.maximumNormalizedError, 1)) errors.push(`${comparatorId} stress finite-difference gate is incomplete or outside tolerance`);

    const batch = validation.batchEquivalence;
    if (batch.canonicalBatchSize !== 1 || batch.status !== 'not-run-canonical-batch1-only' || batch.acceleratedBatchEligible !== false || batch.acceleratedExecutionClaimed !== false) errors.push(`${comparatorId} canonical batch-1 receipt must not claim accelerated batch equivalence`);
    evidenceRoots.push(invariance.evidenceRoot, force.evidenceRoot, stress.evidenceRoot);
  }

  if (evidenceRoots.length !== 6 || new Set(evidenceRoots).size !== evidenceRoots.length) errors.push('scientific validation evidence roots must be six distinct model-and-gate roots');
  try {
    if (scientific.root !== computeScientificValidationRoot(receipt)) errors.push('scientificValidation.root does not match the complete canonical scientific evidence');
  } catch (error) {
    errors.push(`scientificValidation.root could not be recomputed (${error instanceof Error ? error.message : String(error)})`);
  }
}

function validateSmokeReceipt(receipt, errors) {
  if (receipt.benchmark.idSetDigest !== EXPECTED_ASSETS.smokeIdSetDigest) errors.push('smoke benchmark ID-set digest is not the frozen ten-ID manifest');
  if (receipt.benchmark.structureBundleDigest !== EXPECTED_ASSETS.structureBundleDigest || receipt.benchmark.structureManifestFileDigest !== EXPECTED_ASSETS.structureManifestFileDigest || receipt.benchmark.structureManifestRoot !== EXPECTED_ASSETS.smokeStructureManifestRoot) errors.push('smoke benchmark model-visible structure bundle provenance is not frozen');
  requireExactIds(receipt.benchmark.recordIds, RANDOM_TP_SMOKE_IDS, 'smoke benchmark', errors);
  if (receipt.benchmark.frames !== RANDOM_TP_SMOKE_IDS.length) errors.push('smoke benchmark must contain the ten preregistered IDs');
  for (const model of receipt.models) {
    requireExactIds(model.records.recordIds, RANDOM_TP_SMOKE_IDS, `${model.comparatorId} smoke output`, errors);
    if (model.records.expected !== RANDOM_TP_SMOKE_IDS.length || model.records.produced !== RANDOM_TP_SMOKE_IDS.length) errors.push(`${model.comparatorId} smoke completeness count is not ten`);
    if (model.resultClass !== 'smoke-only' || model.status !== 'smoke-complete') errors.push(`${model.comparatorId} smoke result was mislabeled`);
  }
}

function validateModelBindings(receipt, model, errors, executionPolicy) {
  const expectation = EXPECTED_ASSETS.models[model.comparatorId];
  if (!expectation) {
    errors.push(`unexpected model ${model.comparatorId}`);
    return;
  }
  const expectedResultClass = receipt.profile === 'full' ? expectation.resultClass : 'smoke-only';
  const exact = {
    modelId: expectation.modelId,
    role: expectation.role,
    resultClass: expectedResultClass,
    checkpointDigest: expectation.checkpointDigest,
    datasetDigest: receipt.benchmark.datasetDigest,
    runnerDigest: receipt.runner.digest,
    containerDigest: receipt.runner.containers[expectation.modelId],
    dependencyLockDigest: receipt.runner.dependencyLocks[expectation.modelId],
  };
  for (const [field, expected] of Object.entries(exact)) if (model[field] !== expected) errors.push(`${model.comparatorId} ${field} does not match frozen provenance`);
  if (model.package.name !== expectation.packageName || model.package.version !== expectation.packageVersion || model.package.digest !== expectation.packageDigest) errors.push(`${model.comparatorId} package provenance does not match the frozen wheel`);
  if (executionPolicy?.ready) {
    if (model.software.python !== executionPolicy.python) errors.push(`${model.comparatorId} Python version does not match the frozen execution policy`);
    for (const field of ['threads', 'batchSize', 'dtype', 'device']) if (model.execution[field] !== executionPolicy[field]) errors.push(`${model.comparatorId} ${field} does not match the frozen execution policy`);
  }
  if (model.execution.hardwareId !== receipt.hardware.id) errors.push(`${model.comparatorId} hardwareId does not match receipt hardware`);
  if (model.execution.threads > receipt.hardware.cpu.logicalCores) errors.push(`${model.comparatorId} threads exceed recorded logical cores`);
  if (model.execution.device !== 'cpu' && !receipt.hardware.accelerators.some((accelerator) => accelerator.kind === model.execution.device || (model.execution.device === 'cuda' && accelerator.kind === 'gpu'))) errors.push(`${model.comparatorId} device lacks matching accelerator provenance`);
  if (model.records.recordIds.length !== model.records.produced || model.records.produced !== receipt.benchmark.frames) errors.push(`${model.comparatorId} record counts disagree with its IDs or benchmark`);
  if (model.records.atoms !== receipt.benchmark.atoms || model.records.elements !== receipt.benchmark.elements) errors.push(`${model.comparatorId} atom or element totals disagree with benchmark`);
}

function protocolEquivalent(metrics) {
  const absoluteTolerances = { energy: 'energyAbsolute', force: 'forceAbsolute', stress: 'stressAbsolute' };
  return Object.entries(MATTERSIM_REPORT_TARGETS).every(([report, metric]) => {
    const observed = metrics?.[report]?.mean;
    const target = MATTERSIM_PROTOCOL.targets[metric];
    const tolerance = Math.min(MATTERSIM_PROTOCOL.tolerances[absoluteTolerances[report]], Math.abs(target) * MATTERSIM_PROTOCOL.tolerances.relative);
    return Number.isFinite(observed) && Math.abs(observed - target) <= tolerance + Number.EPSILON;
  });
}

function validateFullMetricReports(model, evidenceRoots, errors) {
  const metrics = model.metrics;
  if (metrics?.definitionId !== METRIC_REPORT_PROTOCOL.definitionId) errors.push(`${model.comparatorId} metric definitionId does not match the frozen protocol`);
  for (const metric of ['energy', 'force', 'stress']) {
    const report = metrics?.[metric];
    const expected = METRIC_REPORT_PROTOCOL.reports[metric];
    if (!report) {
      errors.push(`${model.comparatorId} is missing its complete ${metric} metric report`);
      continue;
    }
    for (const [field, value] of [
      ['definition', expected.definition],
      ['unit', expected.unit],
      ['aggregation', METRIC_REPORT_PROTOCOL.aggregation],
      ['summation', METRIC_REPORT_PROTOCOL.summation],
      ['quantileMethod', METRIC_REPORT_PROTOCOL.quantileMethod],
      ['worstTieBreak', METRIC_REPORT_PROTOCOL.worstTieBreak],
      ['perIdMetricEvidenceRootProtocol', METRIC_REPORT_PROTOCOL.perIdMetricEvidenceRootProtocol],
    ]) if (report[field] !== value) errors.push(`${model.comparatorId} ${metric} ${field} does not match the frozen metric-report protocol`);

    const orderedQuantiles = ['p50', 'p90', 'p95', 'p99'].map((field) => report[field]);
    if (![report.mean, ...orderedQuantiles, report.worst?.error].every((value) => Number.isFinite(value) && value >= 0)) {
      errors.push(`${model.comparatorId} ${metric} metric statistics must be finite nonnegative numbers`);
    } else {
      if (orderedQuantiles.some((value, index) => index > 0 && value < orderedQuantiles[index - 1])) errors.push(`${model.comparatorId} ${metric} HF7 quantiles are not monotone`);
      if (report.worst.error < orderedQuantiles.at(-1) || report.worst.error < report.mean) errors.push(`${model.comparatorId} ${metric} worst error is inconsistent with the reported distribution`);
    }
    if (!model.records.recordIds.includes(report.worst?.id)) errors.push(`${model.comparatorId} ${metric} worst ID is outside the exact model record set`);
    evidenceRoots.push(report.perIdMetricEvidenceRoot);
  }
}

function executionPolicyProblems(policy) {
  if (!policy || policy.ready !== true) return policy?.errors?.length ? [...policy.errors] : ['missing or unready policy'];
  const problems = [];
  for (const [label, value] of [
    ['runnerDigest', policy.runnerDigest],
    ['MatterSim container digest', policy.containers?.['mattersim-v1.0.0-5m']],
    ['MACE container digest', policy.containers?.['mace-mpa-0-medium']],
    ['MatterSim dependency-lock digest', policy.dependencyLocks?.['mattersim-v1.0.0-5m']],
    ['MACE dependency-lock digest', policy.dependencyLocks?.['mace-mpa-0-medium']],
  ]) if (!/^sha256:[0-9a-f]{64}$/.test(value ?? '')) problems.push(`${label} is invalid`);
  if (!/^3\.12\.[0-9]+$/.test(policy.python ?? '')) problems.push('Python patch version is invalid');
  if (policy.platform !== 'linux' || policy.architecture !== 'x86_64' || policy.dtype !== 'float32' || policy.device !== 'cpu' || policy.batchSize !== 1 || !Number.isInteger(policy.threads) || policy.threads < 1) problems.push('runtime profile is invalid');
  return problems;
}

function validateReceiptByteEvidence(receipt, candidateBytes, errors) {
  if (!(Buffer.isBuffer(candidateBytes) || candidateBytes instanceof Uint8Array)) {
    errors.push('reproduced promotion requires the exact receiptBytes observed from disk');
    return null;
  }
  const bytes = Buffer.from(candidateBytes);
  let parsed;
  try {
    parsed = parseJsonRejectDuplicateKeys(bytes);
  } catch (error) {
    errors.push(`receipt bytes are invalid (${error instanceof Error ? error.message : String(error)})`);
    return null;
  }
  if (!sameCanonical(parsed, receipt)) errors.push('receipt object does not match the exact parsed receipt bytes');
  let canonicalDigest = null;
  try {
    if (!bytes.equals(canonicalReceiptBytes(receipt))) errors.push('receipt bytes are not the required canonical JSON plus one LF');
    canonicalDigest = digestCanonical(receipt);
  } catch (error) {
    errors.push(`receipt canonicalization failed (${error instanceof Error ? error.message : String(error)})`);
  }
  return {
    rawDigest: sha256(bytes),
    canonicalDigest,
  };
}

/** Parse JSON while rejecting duplicate decoded object-member names at any depth. */
function parseJsonRejectDuplicateKeys(bytes) {
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  let position = 0;
  const fail = (message) => { throw new SyntaxError(`${message} at character ${position}`); };
  const skipWhitespace = () => {
    while (position < source.length && /[\u0009\u000a\u000d\u0020]/.test(source[position])) position += 1;
  };
  const parseString = () => {
    if (source[position] !== '"') fail('expected JSON string');
    const start = position;
    position += 1;
    while (position < source.length) {
      const code = source.charCodeAt(position);
      if (source[position] === '"') {
        position += 1;
        return JSON.parse(source.slice(start, position));
      }
      if (source[position] === '\\') {
        position += 1;
        const escape = source[position];
        if (!'"\\/bfnrtu'.includes(escape ?? '')) fail('invalid JSON string escape');
        if (escape === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(source.slice(position + 1, position + 5))) fail('invalid JSON unicode escape');
          position += 5;
        } else position += 1;
        continue;
      }
      if (code < 0x20) fail('unescaped control character in JSON string');
      position += 1;
    }
    fail('unterminated JSON string');
  };
  const parseValue = (depth = 0) => {
    if (depth > 256) fail('JSON nesting exceeds 256 levels');
    skipWhitespace();
    if (source[position] === '{') {
      position += 1;
      skipWhitespace();
      const keys = new Set();
      if (source[position] === '}') {
        position += 1;
        return;
      }
      while (position < source.length) {
        const key = parseString();
        if (keys.has(key)) throw new SyntaxError(`duplicate JSON key ${JSON.stringify(key)} at character ${position}`);
        keys.add(key);
        skipWhitespace();
        if (source[position] !== ':') fail('expected colon after JSON object key');
        position += 1;
        parseValue(depth + 1);
        skipWhitespace();
        if (source[position] === '}') {
          position += 1;
          return;
        }
        if (source[position] !== ',') fail('expected comma or closing brace');
        position += 1;
        skipWhitespace();
      }
      fail('unterminated JSON object');
    }
    if (source[position] === '[') {
      position += 1;
      skipWhitespace();
      if (source[position] === ']') {
        position += 1;
        return;
      }
      while (position < source.length) {
        parseValue(depth + 1);
        skipWhitespace();
        if (source[position] === ']') {
          position += 1;
          return;
        }
        if (source[position] !== ',') fail('expected comma or closing bracket');
        position += 1;
      }
      fail('unterminated JSON array');
    }
    if (source[position] === '"') {
      parseString();
      return;
    }
    for (const literal of ['true', 'false', 'null']) {
      if (source.startsWith(literal, position)) {
        position += literal.length;
        return;
      }
    }
    const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(source.slice(position));
    if (number) {
      position += number[0].length;
      return;
    }
    fail('expected JSON value');
  };

  parseValue();
  skipWhitespace();
  if (position !== source.length) fail('unexpected trailing JSON content');
  return JSON.parse(source);
}

function sameCanonical(left, right) {
  try {
    return canonicalJson(left) === canonicalJson(right);
  } catch {
    return false;
  }
}

function finiteWithin(value, maximum) {
  return Number.isFinite(value) && value >= 0 && value <= maximum;
}

function requireExactIds(actual, expected, label, errors) {
  if (!Array.isArray(actual) || actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) errors.push(`${label} IDs are not the exact preregistered sorted set`);
}

function requireTimestamp(value, label, errors) {
  const match = /^(20[0-9]{2})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.[0-9]{1,6})?Z$/.exec(value ?? '');
  const milliseconds = Date.parse(value);
  const parsed = Number.isFinite(milliseconds) ? new Date(milliseconds) : null;
  const componentsMatch = match && parsed
    && parsed.getUTCFullYear() === Number(match[1])
    && parsed.getUTCMonth() + 1 === Number(match[2])
    && parsed.getUTCDate() === Number(match[3])
    && parsed.getUTCHours() === Number(match[4])
    && parsed.getUTCMinutes() === Number(match[5])
    && parsed.getUTCSeconds() === Number(match[6]);
  if (!componentsMatch) errors.push(`${label} is not a valid UTC timestamp`);
}

function findNonFiniteNumbers(value, valuePath, errors, seen) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) errors.push(`${valuePath} is not finite`);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) {
    errors.push(`${valuePath} contains a cycle`);
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) value.forEach((entry, index) => findNonFiniteNumbers(entry, `${valuePath}[${index}]`, errors, seen));
  else for (const [key, entry] of Object.entries(value)) findNonFiniteNumbers(entry, `${valuePath}.${key}`, errors, seen);
  seen.delete(value);
}

function canonicalJson(value) {
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonical JSON forbids non-finite numbers');
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  throw new TypeError(`canonical JSON forbids ${typeof value}`);
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function isPathInside(parent, child) {
  const relative = path.relative(parent, child);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function result(errors, applicable = true) {
  return { ok: errors.length === 0, applicable, errors: [...new Set(errors)] };
}
