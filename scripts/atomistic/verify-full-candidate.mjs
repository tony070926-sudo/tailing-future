import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { inspectRandomTp } from './dataset-manifest.mjs';
import {
  FULL_CANDIDATE_PLAN_PATH,
  FULL_CANDIDATE_PLAN_RAW_DIGEST,
  FULL_CANDIDATE_RECEIPT_SCHEMA_RAW_DIGEST,
} from './full-candidate-plan-policy.mjs';
import { evaluateFullCandidateMetrics } from './full-candidate-metrics.mjs';
import {
  canonicalJsonBytes,
  parseJsonRejectDuplicateKeys,
} from './write-container-observation.mjs';

export { FULL_CANDIDATE_PLAN_PATH };
export const FULL_CANDIDATE_PLAN_DIGEST = FULL_CANDIDATE_PLAN_RAW_DIGEST;
export const FULL_CANDIDATE_RECEIPT_SCHEMA_VERSION = 'tf.atomistic-full-candidate-receipt/0.1';
export const FULL_CANDIDATE_RECEIPT_SCHEMA_DIGEST = FULL_CANDIDATE_RECEIPT_SCHEMA_RAW_DIGEST;
export const MAX_FULL_PREDICTION_BYTES = 8 * 1024 * 1024;

const EXPECTED_RECORDS = 693;
const EXPECTED_REPOSITORY = 'tony070926-sudo/tailing-future';
const EXPECTED_REPOSITORY_ID = 1349498456;
const EXPECTED_RUNNER_DIGEST = 'sha256:d6e83640f15926088c116312c27605570f9e9c8ba4e9a9988ef5bf4d3a974ed4';
const EXPECTED_STRUCTURE_BUNDLE_DIGEST = 'sha256:d4ff1ee210abf80884e1526b1e2600e918103f3505a2a712bce57d6fba3a1b5c';
const EXPECTED_STRUCTURE_MANIFEST_FILE_DIGEST = 'sha256:9f870f62cd60b7021d874d1970c81ac8cb64a302e2c5fd4013464198fd11a25e';
const EXPECTED_STRUCTURE_BUNDLE_BYTES = 681_414;
const EXPECTED_STRUCTURE_MANIFEST_FILE_BYTES = 1_147;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const SHA_PATTERN = /^[0-9a-f]{40}$/;
const TIMESTAMP_PATTERN = /^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?Z$/;
const PREDICTION_FILE_PATH = 'predictions/predictions.jsonl';
const STRUCTURE_BUNDLE_FILE_PATH = 'structures/structures.jsonl';
const STRUCTURE_MANIFEST_FILE_PATH = 'manifests/structures.manifest.json';
const EXPECTED_ARTIFACT_PATHS = Object.freeze([
  STRUCTURE_MANIFEST_FILE_PATH,
  PREDICTION_FILE_PATH,
  STRUCTURE_BUNDLE_FILE_PATH,
]);
const FORBIDDEN_ARTIFACT_PATH = /(?:^|\/)(?:reference|labels?|metrics?|targets?|ground[-_]?truth|receipts?|attestations?)(?:[./_-]|$)/i;
const VERIFIED_CONTEXTS = new WeakSet();
const ALLOWED_EVIDENCE_STATUSES = new Set(['complete', 'invalid', 'failed', 'cancelled', 'not-started']);
const PRODUCER_KEYS = Object.freeze(['hardwareId', 'jobId', 'repositoryId', 'revision', 'runAttempt', 'workflowRunId']);
const SOURCE_KEYS = Object.freeze(['repository', 'repositoryId', 'revision', 'treeDigest']);
const EVIDENCE_KEYS = Object.freeze(['artifactFiles', 'model', 'modelId', 'producer', 'status', 'termination']);
const AUTHORITATIVE_INPUT_KEYS = Object.freeze([
  'candidatePlanBytes', 'createdAt', 'datasetBytes', 'partitionEvidence',
  'runtimeLockBytes', 'scientificPlanBytes', 'source',
]);
const MODEL_SPECS = Object.freeze([
  Object.freeze({
    model: 'mattersim',
    modelId: 'mattersim-v1.0.0-5m',
    partitionId: 'mattersim-full-000',
    checkpointDigest: 'sha256:e3df9fa708725e3d453140646c7d1838324b347a3d1214cf1440522146f872b5',
    packageDigest: 'sha256:1b5e46ba56efa5c1e93372ad32321300fa5e1f07dd9188a11b727bd578cf8d7f',
  }),
  Object.freeze({
    model: 'mace',
    modelId: 'mace-mpa-0-medium',
    partitionId: 'mace-full-000',
    checkpointDigest: 'sha256:75428afe3a1d7d8062e19bcaabd5c433623cabf308242ec9fb493e38604fb638',
    packageDigest: 'sha256:b80407edf6b2a1ec8523668c2a36852d20927ce1c3c56b70983a9f2dc53233ad',
  }),
]);
const PREDICTION_KEYS = Object.freeze([
  'atomCount', 'atomicNumbers', 'checkpointSha256', 'energyEv', 'environmentSha256',
  'forcesEvPerAngstrom', 'id', 'inputStructureDigest', 'modelId', 'packageSha256',
  'runnerSha256', 'schemaVersion', 'status', 'stressAseEvPerAngstrom3',
]);

export const FULL_CANDIDATE_VERIFIER_IMPLEMENTATION_DIGEST = sha256(
  readFileSync(fileURLToPath(import.meta.url)),
);

const EXPECTED_CLAIMS = Object.freeze({
  claimEligible: false,
  promotionEligible: false,
  comparisonEligible: false,
  reproductionEligible: false,
  reproduced: false,
  superiorityClaimAllowed: false,
});
const EXPECTED_CLAIM_BOUNDARIES = Object.freeze({
  randomTpIsMatbenchWbm: false,
  matterSimInterpretation: 'frozen-frobenius-protocol-equivalent-only',
  maceInterpretation: 'blind-engineering-baseline-only',
  currentSotaClaimAllowed: false,
  experimentalGroundTruthClaimAllowed: false,
  industrialFitnessClaimAllowed: false,
  crossModelSuperiorityClaimAllowed: false,
});
const EXPECTED_PENDING_GATES = Object.freeze([
  'two independent protected-main full-candidate receipts with durable attestations',
  '40 invariance checks per model',
  '89 force finite-difference checks per model',
  '60 stress finite-difference checks per model',
  'versioned multi-producer hardware and run-attempt receipt semantics',
  'registry-addressable OCI manifest and config trust roots',
]);
const EXPECTED_FROZEN_BINDINGS = Object.freeze({
  scientificPlanDigest: 'sha256:d3a58524029b51c598d00a7bb9f60b6479a9973a0f9907cbf94a31e61bf1c9c2',
  runtimeLockDigest: 'sha256:b8c352aacfef3f74210d2dbf2002400887e35d21670f5f93da6a8003670bafa1',
  runtimeStableInputsCommitment: 'sha256:b4183913307ca0810813c66a3963de1cb20f63ae2000121f9d1016eac94fbfcb',
  runtimeSourceManifestDigest: 'sha256:08b1ed2ae239ce5732cf565b5e7bd814727a99ad6e1e1a29aeaa21ea1ed529a1',
  runtimeMaterializationDigest: 'sha256:345d5e55227bbe873d567f5ea72b88db1f21c1d46e72f078db38e6a455d47721',
  runnerDigest: EXPECTED_RUNNER_DIGEST,
  modelRuntimeIdentities: Object.freeze({
    mattersim: Object.freeze({
      dependencyLockDigest: 'sha256:9c990909d1307bb32608d31b9ed217d2368c28e2048f6dec39e8dc4a2b63642b',
      runtimeInputManifestDigest: 'sha256:203acc5ec09c2e76a819ff384573c2c0aca1316f90c53f2e735c98e9daab5c53',
    }),
    mace: Object.freeze({
      dependencyLockDigest: 'sha256:ae4b21b6f6d8ad98edcf2d5e0d938cd563379f494cce0b4aaa2e987332147e33',
      runtimeInputManifestDigest: 'sha256:6bb7f79c5380bb54b0d5ff972c3f22cc27623d131291d3a7c1b2c4efff826f47',
    }),
  }),
  datasetDigest: 'sha256:c14473dcf4bd71e1ed11556ac9ff12b68e7a423d813f939bc9eedaef663054d9',
  idSetDigest: 'sha256:4df1ba7cda1b0a31cdb0b3e2281ed535327d7b92ce381cd930c781cc8b800f91',
  recordManifestDigest: 'sha256:6afbbdc0cd745efaca4bf5d7a2a7604db9f1d1f59749b86d3c0a51d48f07893a',
  recordManifestProtocol: 'tf.random-tp.record-manifest/v1',
  structureManifestDigest: 'sha256:b0a94b5424f9d4a2be7519265b8dbe89a478fa5b21a6c956c70ffe0c705078f7',
  structureManifestProtocol: 'tf.atomistic-structure-manifest/v1',
  labelManifestDigest: 'sha256:a0eda4ac1c7720002a32f42f91c635bf8398b93c02846fb83ae97437e3e8422f',
  labelManifestProtocol: 'tf.random-tp.reference-label-manifest/v1',
  metricProtocol: Object.freeze({
    definitionId: 'mattersim-model-card-frobenius/v1',
    summation: 'ascii-id-order-python-3.12-math-fsum-divide-by-693/v1',
    quantileMethod: 'Hyndman-Fan-7-linear',
    perIdMetricEvidenceRootProtocol: 'sha256-merkle-canonical-json-array-model-id-metric-id-error-ascii-id-order-duplicate-id-forbidden/v1',
    binary64MetricEvidenceRootProtocol: 'sha256-merkle-domain-separated-model-id-metric-id-ieee754-binary64-little-endian-ascii-id-order-duplicate-id-forbidden/v1',
  }),
});

export function parseFullPredictionJsonl(bytes, spec) {
  if (!Buffer.isBuffer(bytes)) throw new TypeError(`${spec.model} predictions must be a Buffer.`);
  if (bytes.length === 0 || bytes.length > MAX_FULL_PREDICTION_BYTES) {
    throw new RangeError(`${spec.model} prediction bytes must be between 1 and ${MAX_FULL_PREDICTION_BYTES}.`);
  }
  if (bytes[bytes.length - 1] !== 0x0a || bytes.subarray(0, -1).includes(0x0d)) {
    throw new SyntaxError(`${spec.model} predictions must use non-empty LF-terminated JSONL records.`);
  }
  const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, -1));
  const lines = source.split('\n');
  if (lines.some((line) => line.length === 0)) throw new SyntaxError(`${spec.model} predictions contain an empty JSONL record.`);
  if (lines.length > 100_000) throw new RangeError(`${spec.model} prediction record count exceeds the review bound.`);

  const records = [];
  const errors = [];
  let malformedRows = 0;
  let exactFieldAllowlist = true;
  let explicitReferenceLabelsPresent = false;
  lines.forEach((line, index) => {
    let record;
    try {
      record = parseJsonRejectDuplicateKeys(Buffer.from(line, 'utf8'), `${spec.model} prediction ${index}`);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
      malformedRows += 1;
      return;
    }
    if (!isPlainObject(record)) {
      errors.push(`${spec.model} prediction ${index} is not an object`);
      malformedRows += 1;
      exactFieldAllowlist = false;
      return;
    }
    const canonicalLine = canonicalJsonBytes(record);
    if (!canonicalLine.equals(Buffer.from(`${line}\n`, 'utf8'))) {
      errors.push(`${spec.model} prediction ${index} is not canonical JSON`);
    }
    const keys = Object.keys(record).sort(asciiCompare);
    if (!isDeepStrictEqual(keys, PREDICTION_KEYS)) {
      exactFieldAllowlist = false;
      const unexpected = keys.filter((key) => !PREDICTION_KEYS.includes(key));
      if (unexpected.some((key) => /(?:reference|label|metric|target|ground.?truth)/i.test(key))) explicitReferenceLabelsPresent = true;
      errors.push(`${spec.model} prediction ${index} has extra or missing fields`);
    }
    if (record.modelId !== spec.modelId) errors.push(`${spec.model} prediction ${index} modelId differs`);
    if (record.checkpointSha256 !== spec.checkpointDigest) errors.push(`${spec.model} prediction ${index} checkpoint digest differs`);
    if (record.packageSha256 !== spec.packageDigest) errors.push(`${spec.model} prediction ${index} package digest differs`);
    if (record.runnerSha256 !== EXPECTED_RUNNER_DIGEST) errors.push(`${spec.model} prediction ${index} runner digest differs`);
    if (!DIGEST_PATTERN.test(record.environmentSha256 ?? '')) errors.push(`${spec.model} prediction ${index} environment digest is invalid`);
    records.push(record);
  });
  const environments = [...new Set(records.map((record) => record.environmentSha256))];
  const environmentBound = records.length === lines.length
    && environments.length === 1
    && DIGEST_PATTERN.test(environments[0] ?? '');
  if (!environmentBound) errors.push(`${spec.model} predictions do not bind every record to one valid environment digest`);
  return {
    records,
    errors,
    lineCount: lines.length,
    malformedRows,
    rawDigest: sha256(bytes),
    environmentDigest: environmentBound ? environments[0] : sha256(Buffer.from(`${spec.model}:environment-unavailable`, 'utf8')),
    predictionSchemaVersion: normalizeObservedSchemaVersion(
      records.length > 0 && records.every((record) => record.schemaVersion === records[0].schemaVersion)
        ? records[0].schemaVersion
        : null,
    ),
    referenceLabelsPresent: explicitReferenceLabelsPresent ? true : exactFieldAllowlist && records.length === lines.length ? false : null,
  };
}

export function inspectFrozenCandidateInputs({
  candidatePlanBytes,
  scientificPlanBytes,
  runtimeLockBytes,
  datasetBytes,
}) {
  const errors = [];
  let plan = null;
  let datasetInspection = null;
  if (Buffer.isBuffer(candidatePlanBytes)) {
    try {
      plan = parseJsonRejectDuplicateKeys(candidatePlanBytes, 'full-candidate plan');
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    if (sha256(candidatePlanBytes) !== FULL_CANDIDATE_PLAN_DIGEST) errors.push('candidate plan raw digest differs from the frozen R7a contract');
  } else errors.push('candidate plan bytes are unavailable');
  if (!Buffer.isBuffer(scientificPlanBytes) || sha256(scientificPlanBytes) !== EXPECTED_FROZEN_BINDINGS.scientificPlanDigest) {
    errors.push('scientific plan raw digest differs from the frozen candidate binding');
  }
  if (!Buffer.isBuffer(runtimeLockBytes) || sha256(runtimeLockBytes) !== EXPECTED_FROZEN_BINDINGS.runtimeLockDigest) {
    errors.push('runtime lock raw digest differs from the frozen candidate binding');
  }
  try {
    if (!Buffer.isBuffer(datasetBytes)) throw new TypeError('dataset bytes are unavailable');
    datasetInspection = inspectRandomTp(datasetBytes);
    const actual = {
      datasetDigest: sha256(datasetBytes),
      idSetDigest: datasetInspection.idSetSha256,
      recordManifestDigest: datasetInspection.recordManifestSha256,
      structureManifestDigest: datasetInspection.structureManifestSha256,
      labelManifestDigest: datasetInspection.labelManifestSha256,
      frames: datasetInspection.frames,
      atoms: datasetInspection.atoms,
      elements: datasetInspection.elements,
    };
    const expected = {
      datasetDigest: EXPECTED_FROZEN_BINDINGS.datasetDigest,
      idSetDigest: EXPECTED_FROZEN_BINDINGS.idSetDigest,
      recordManifestDigest: EXPECTED_FROZEN_BINDINGS.recordManifestDigest,
      structureManifestDigest: EXPECTED_FROZEN_BINDINGS.structureManifestDigest,
      labelManifestDigest: EXPECTED_FROZEN_BINDINGS.labelManifestDigest,
      frames: EXPECTED_RECORDS,
      atoms: 11_088,
      elements: 89,
    };
    for (const [key, value] of Object.entries(actual)) if (expected[key] !== value) errors.push(`dataset ${key} differs from the candidate binding`);
    if (!datasetInspection.records.every((record) => record.atomCount === 16)) errors.push('dataset atoms-per-frame differs from the candidate binding');
  } catch (error) {
    errors.push(`dataset inspection failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const result = {
    plan,
    datasetInspection,
    referenceRecords: datasetInspection?.records ?? [],
    candidatePlanBindingVerified: Buffer.isBuffer(candidatePlanBytes) && sha256(candidatePlanBytes) === FULL_CANDIDATE_PLAN_DIGEST,
    frozenBindingsVerified: false,
    errors: uniqueSorted(errors),
  };
  result.frozenBindingsVerified = result.errors.length === 0;
  if (result.frozenBindingsVerified) VERIFIED_CONTEXTS.add(result);
  return result;
}

function assembleFullCandidateReceipt({ context, partitionEvidence, source: sourceInput, createdAt: createdAtInput }) {
  const integrityErrors = [...(context?.errors ?? ['frozen candidate input inspection is unavailable'])];
  const source = normalizeSource(sourceInput, integrityErrors);
  const createdAt = normalizeTimestamp(createdAtInput, integrityErrors);
  const evidenceList = Array.isArray(partitionEvidence) ? partitionEvidence : [];
  if (evidenceList.length !== MODEL_SPECS.length) integrityErrors.push('exactly two ordered model partition evidence objects are required');
  const referenceRecords = Array.isArray(context?.referenceRecords) ? context.referenceRecords : [];
  const metricResults = new Map();
  const partitions = MODEL_SPECS.map((spec, index) => {
    const evidence = evidenceList[index];
    if (evidence?.model !== spec.model || evidence?.modelId !== spec.modelId) {
      integrityErrors.push(`${spec.model} partition evidence identity or ordering differs`);
      return failedPartition(
        spec,
        'not-started',
        'partition-evidence-missing',
        'Ordered model partition evidence is unavailable.',
        validProducer(evidence?.producer) ? evidence.producer : null,
        rejectedArtifactObservation(evidence?.artifactFiles),
      );
    }
    const unexpectedEvidenceKeys = isPlainObject(evidence)
      ? Object.keys(evidence).filter((key) => !EVIDENCE_KEYS.includes(key))
      : [];
    const evidenceContractErrors = [];
    if (unexpectedEvidenceKeys.length > 0) {
      const error = `${spec.model} partition evidence contains unexpected fields`;
      integrityErrors.push(error);
      evidenceContractErrors.push(error);
    }
    if (['complete', 'invalid'].includes(evidence.status) && evidence.termination !== undefined) {
      const error = `${spec.model} ${evidence.status} evidence contradicts its producer termination`;
      integrityErrors.push(error);
      evidenceContractErrors.push(error);
    }
    const producer = validProducer(evidence.producer) ? structuredClone(evidence.producer) : null;
    if (evidence.producer !== undefined && !producer) integrityErrors.push(`${spec.model} producer identity is malformed`);
    const artifactInspection = inspectArtifactFiles(evidence.artifactFiles, spec);
    if (!ALLOWED_EVIDENCE_STATUSES.has(evidence.status)) {
      integrityErrors.push(`${spec.model} producer status is missing or unsupported`);
      return failedPartition(
        spec,
        'failed',
        'producer-status-invalid',
        'Producer status is missing or outside the frozen status allowlist.',
        producer,
        artifactInspection.rejectedArtifact,
        recordCountsForParsedArtifact(artifactInspection.parsed, spec, referenceRecords),
      );
    }
    if (['failed', 'cancelled', 'not-started'].includes(evidence.status)) {
      const message = normalizeText(evidence.termination?.message, `Producer ended ${evidence.status}.`, 2048);
      integrityErrors.push(`${spec.model} producer ended ${evidence.status}: ${message}`);
      return failedPartition(
        spec,
        evidence.status,
        normalizeCode(evidence.termination?.code, `producer-${evidence.status}`),
        message,
        producer,
        artifactInspection.rejectedArtifact,
        recordCountsForParsedArtifact(artifactInspection.parsed, spec, referenceRecords),
      );
    }
    if (!producer) {
      const message = `${spec.model} complete or invalid evidence lacks a schema-valid producer identity`;
      integrityErrors.push(message);
      return failedPartition(
        spec,
        'failed',
        'producer-evidence-unavailable',
        message,
        null,
        artifactInspection.rejectedArtifact,
        recordCountsForParsedArtifact(artifactInspection.parsed, spec, referenceRecords),
      );
    }
    const parsed = artifactInspection.parsed;
    if (!parsed) {
      const localErrors = artifactInspection.errors.length > 0
        ? artifactInspection.errors
        : [`${spec.model} prediction artifact is unavailable`];
      integrityErrors.push(...localErrors);
      return invalidPartition(
        spec,
        producer,
        null,
        artifactInspection.rejectedArtifact,
        zeroRecordCounts(artifactInspection.rejectedArtifact.predictionRecordsObserved ?? 0),
        localErrors,
      );
    }
    const metricResult = evaluateFullCandidateMetrics(spec.modelId, parsed.records, referenceRecords);
    if (metricResult.metrics) metricResults.set(spec.model, metricResult);
    const localErrors = [
      ...evidenceContractErrors,
      ...artifactInspection.errors,
      ...parsed.errors,
      ...metricResult.validation.errors,
    ];
    if (!isDeepStrictEqual(parsed.records.map((record) => record.id), referenceRecords.map((record) => record.id))) localErrors.push(`${spec.model} prediction records are not in the frozen ASCII ID order`);
    const artifact = artifactInspection.artifact;
    if (!artifact || artifact.referenceLabelsPresent !== false) localErrors.push(`${spec.model} producer artifact does not prove the exact label-free file allowlist`);
    if (evidence.status !== 'complete') localErrors.push(`${spec.model} producer evidence was explicitly marked invalid`);
    const recordCounts = coverageToRecordCounts(metricResult.coverage, parsed.malformedRows);
    if (localErrors.length > 0 || !metricResult.coverage.complete || !artifact) {
      integrityErrors.push(...localErrors);
      return invalidPartition(
        spec,
        producer,
        artifact,
        artifact ? null : artifactInspection.rejectedArtifact,
        recordCounts,
        localErrors.length > 0 ? localErrors : ['producer evidence was marked invalid'],
      );
    }
    return completePartition(spec, producer, artifact);
  });

  const producerPartitions = partitions.filter((partition) => partition.producer);
  const runKeys = new Set(producerPartitions.map((partition) => `${partition.producer.workflowRunId}/${partition.producer.runAttempt}`));
  const mixedRunAttemptsObserved = runKeys.size > 1;
  if (mixedRunAttemptsObserved) integrityErrors.push('model partitions originate from mixed workflow run IDs or attempts');
  if (new Set(producerPartitions.map((partition) => partition.producer.jobId)).size !== producerPartitions.length) integrityErrors.push('producer job IDs are not distinct');
  for (const partition of producerPartitions) {
    if (partition.producer.repositoryId !== EXPECTED_REPOSITORY_ID || partition.producer.revision !== source.revision) integrityErrors.push(`${partition.model} producer source identity differs from the candidate source`);
  }
  const contextBranded = context !== null && typeof context === 'object' && VERIFIED_CONTEXTS.has(context);
  const planBindingVerified = context?.candidatePlanBindingVerified === true;
  const frozenBindingsVerified = contextBranded && context.frozenBindingsVerified === true;
  if (!planBindingVerified) integrityErrors.push('candidate plan binding was not independently verified');
  if (!frozenBindingsVerified) integrityErrors.push('one or more frozen scientific/runtime/data bindings were not independently verified');

  const globalIntegrityFailure = mixedRunAttemptsObserved || !planBindingVerified || !frozenBindingsVerified
    || integrityErrors.some((error) => /producer source identity|job IDs/.test(error))
    || (integrityErrors.length > 0 && partitions.every((partition) => partition.status === 'complete'));
  if (globalIntegrityFailure) {
    for (let index = 0; index < partitions.length; index += 1) {
      if (partitions[index].status !== 'complete') continue;
      partitions[index] = invalidPartition(
        MODEL_SPECS[index], partitions[index].producer, partitions[index].artifact,
        null, partitions[index].records, ['global campaign or frozen-binding verification failed'],
      );
    }
  }

  const complete = partitions.every((partition) => partition.status === 'complete')
    && metricResults.size === MODEL_SPECS.length
    && integrityErrors.length === 0;
  const producerReferenceLabelsAbsent = partitions.every((partition) => partition.artifact?.referenceLabelsPresent === false);
  const verifierReferenceLabelsLoaded = contextBranded && referenceRecords.length === EXPECTED_RECORDS;
  const verification = {
    status: complete ? 'verified-complete' : 'verified-incomplete',
    verifierClass: 'independent-label-bearing-verifier',
    implementationDigest: FULL_CANDIDATE_VERIFIER_IMPLEMENTATION_DIGEST,
    candidatePlanBindingVerified: planBindingVerified,
    frozenBindingsVerified,
    producerReferenceLabelsAbsent,
    verifierReferenceLabelsLoaded,
    metricRecomputationIndependent: complete,
    metricEvaluationComplete: complete,
    mixedRunAttemptsObserved,
    integrityErrors: uniqueSorted(integrityErrors),
  };
  if (!complete && verification.integrityErrors.length === 0) verification.integrityErrors.push('one or more producer partitions did not complete');

  const receipt = {
    schemaVersion: FULL_CANDIDATE_RECEIPT_SCHEMA_VERSION,
    outcome: 'incomplete',
    createdAt,
    candidatePlan: {
      path: FULL_CANDIDATE_PLAN_PATH,
      schemaVersion: 'tf.atomistic-full-candidate-plan/0.1',
      rawDigest: FULL_CANDIDATE_PLAN_DIGEST,
    },
    source,
    frozenBindings: structuredClone(EXPECTED_FROZEN_BINDINGS),
    claims: structuredClone(EXPECTED_CLAIMS),
    claimBoundaries: structuredClone(EXPECTED_CLAIM_BOUNDARIES),
    partitions,
    verification,
    pendingScientificGates: [...EXPECTED_PENDING_GATES],
  };

  if (complete) {
    const mattersim = metricResults.get('mattersim');
    const mace = metricResults.get('mace');
    receipt.outcome = mattersim.assessment.status === 'passed' ? 'complete-pass' : 'complete-fail';
    receipt.metrics = { models: [mattersim.metrics, mace.metrics] };
    receipt.assessments = { mattersim: mattersim.assessment, mace: mace.assessment };
    receipt.evidenceBundleDigest = computeCandidateEvidenceBundleDigest(receipt);
  } else {
    const partialMetrics = MODEL_SPECS.map((spec) => metricResults.get(spec.model)?.metrics).filter(Boolean);
    if (partialMetrics.length > 0) receipt.partialMetrics = partialMetrics;
  }
  return receipt;
}

export function verifyFullCandidate(options = {}) {
  const inspected = inspectFrozenCandidateInputs(options);
  return assembleFullCandidateReceipt({
    context: inspected,
    partitionEvidence: options.partitionEvidence,
    source: options.source,
    createdAt: options.createdAt,
  });
}

/**
 * Validate only the frozen receipt envelope and its internally derivable fields.
 * This deliberately does not authenticate metric reports or evidence roots:
 * those require the frozen dataset plus the observed producer artifact bytes.
 */
export function validateFullCandidateReceiptEnvelope(receipt, receiptSchemaBytes) {
  const errors = [];
  if (!Buffer.isBuffer(receiptSchemaBytes)) {
    errors.push('frozen receipt schema raw bytes are required');
  } else if (sha256(receiptSchemaBytes) !== FULL_CANDIDATE_RECEIPT_SCHEMA_DIGEST) {
    errors.push('receipt schema raw digest differs from the frozen R7a contract');
  } else {
    try {
      const receiptSchema = parseJsonRejectDuplicateKeys(receiptSchemaBytes, 'full-candidate receipt schema');
      const validate = new Ajv2020({ allErrors: true, strict: true, validateFormats: false }).compile(receiptSchema);
      if (!validate(receipt)) errors.push(`schema: ${JSON.stringify(validate.errors)}`);
    } catch (error) {
      errors.push(`schema compilation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (!isDeepStrictEqual(receipt?.claims, EXPECTED_CLAIMS)) errors.push('candidate claims differ from the all-negative boundary');
  if (!isDeepStrictEqual(receipt?.claimBoundaries, EXPECTED_CLAIM_BOUNDARIES)) errors.push('candidate claim boundaries differ from the frozen non-promotional boundary');
  if (!isDeepStrictEqual(receipt?.frozenBindings, EXPECTED_FROZEN_BINDINGS)) errors.push('candidate frozen bindings differ');
  if (!isDeepStrictEqual(receipt?.pendingScientificGates, EXPECTED_PENDING_GATES)) errors.push('candidate pending scientific gates differ');
  if (receipt?.candidatePlan?.rawDigest !== FULL_CANDIDATE_PLAN_DIGEST) errors.push('candidate receipt is not bound to the frozen R7a plan');
  if (receipt?.verification?.implementationDigest !== FULL_CANDIDATE_VERIFIER_IMPLEMENTATION_DIGEST) {
    errors.push('candidate verifier implementation digest differs from the current frozen verifier');
  }
  if (Array.isArray(receipt?.verification?.integrityErrors)
      && !isDeepStrictEqual(receipt.verification.integrityErrors, uniqueSorted(receipt.verification.integrityErrors))) {
    errors.push('candidate integrity errors are not uniquely ASCII sorted');
  }
  const partitions = Array.isArray(receipt?.partitions) ? receipt.partitions : [];
  const partitionIdentities = partitions.map((partition) => ({
    partitionId: partition?.partitionId,
    model: partition?.model,
    modelId: partition?.modelId,
  }));
  if (!isDeepStrictEqual(partitionIdentities, MODEL_SPECS.map(({ partitionId, model, modelId }) => ({ partitionId, model, modelId })))) errors.push('candidate partitions are missing, duplicated or reordered');
  const producers = partitions.filter((partition) => partition?.producer).map((partition) => partition.producer);
  for (const producer of producers) {
    if (producer.repositoryId !== receipt?.source?.repositoryId || producer.revision !== receipt?.source?.revision) errors.push('producer provenance differs from the receipt source');
  }
  if (new Set(producers.map((producer) => producer.jobId)).size !== producers.length) errors.push('producer job IDs are not distinct');
  const runKeys = new Set(producers.map((producer) => `${producer.workflowRunId}/${producer.runAttempt}`));
  const observedMixed = runKeys.size > 1;
  if (receipt?.verification?.mixedRunAttemptsObserved !== observedMixed) errors.push('mixed-run-attempt observation is inconsistent with producer provenance');
  for (const partition of partitions) {
    validateRecordCountSemantics(partition?.records, errors, partition?.model);
    validatePartitionEvidenceSemantics(partition, errors);
  }
  const expectedLabelAbsence = partitions.length === MODEL_SPECS.length
    && partitions.every((partition) => partition?.artifact?.referenceLabelsPresent === false);
  if (receipt?.verification?.producerReferenceLabelsAbsent !== expectedLabelAbsence) errors.push('producer label-absence summary is inconsistent with partition artifacts');
  validatePartialMetrics(receipt?.partialMetrics, errors);
  if (typeof receipt?.outcome === 'string' && receipt.outcome.startsWith('complete-')) {
    if (partitions.some((partition) => partition?.status !== 'complete')) errors.push('complete outcome contains a non-complete partition');
    if (producers.length !== MODEL_SPECS.length || runKeys.size !== 1) errors.push('complete outcome lacks one coherent two-job producer run');
    try {
      if (receipt.evidenceBundleDigest !== computeCandidateEvidenceBundleDigest(receipt)) errors.push('candidate evidence bundle digest does not match the complete receipt');
    } catch (error) {
      errors.push(`candidate evidence bundle cannot be recomputed: ${error instanceof Error ? error.message : String(error)}`);
    }
    const means = receipt.metrics?.models?.[0];
    const metricPass = {
      energy: inInterval(means?.energy?.mean, [0.19502, 0.20298]),
      force: inInterval(means?.force?.mean, [0.80752, 0.84048]),
      stress: inInterval(means?.stress?.mean, [1.95902, 2.03898]),
    };
    const pass = Object.values(metricPass).every(Boolean);
    if (!isDeepStrictEqual(receipt?.assessments?.mattersim?.metricPass, metricPass)) errors.push('MatterSim metricPass does not match the frozen intervals');
    if (receipt?.assessments?.mattersim?.status !== (pass ? 'passed' : 'failed')) errors.push('MatterSim assessment status disagrees with the frozen three-way AND gate');
    if ((receipt.outcome === 'complete-pass') !== pass) errors.push('complete outcome disagrees with the frozen MatterSim three-way AND gate');
    const modelMetrics = Array.isArray(receipt.metrics?.models) ? receipt.metrics.models : [];
    for (const metrics of modelMetrics) validateDiagnosticSummaries(metrics, errors);
  } else if (receipt?.outcome === 'incomplete' && receipt?.verification?.integrityErrors?.length === 0) {
    errors.push('incomplete candidate lacks explicit integrity or execution failure evidence');
  }
  return { ok: errors.length === 0, errors };
}

/**
 * Independently re-run the label-bearing verifier from frozen raw inputs and
 * observed artifact bytes, then require an exact receipt match. A receipt plus
 * its public bundle hash alone is not authoritative evidence.
 */
export function validateFullCandidateReceipt(receipt, receiptSchemaBytes, verificationInputs) {
  const envelope = validateFullCandidateReceiptEnvelope(receipt, receiptSchemaBytes);
  const errors = [...envelope.errors];
  if (!validAuthoritativeVerificationInputs(verificationInputs)) {
    errors.push('authoritative receipt validation requires frozen raw inputs and observed artifact bytes');
  } else {
    try {
      const recomputed = verifyFullCandidate(verificationInputs);
      if (!isDeepStrictEqual(receipt, recomputed)) {
        errors.push('receipt differs from the independently recomputed frozen-input result');
      }
    } catch (error) {
      errors.push(`independent frozen-input recomputation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { ok: errors.length === 0, errors: uniqueSorted(errors) };
}

export function computeCandidateEvidenceBundleDigest(receipt) {
  return sha256(canonicalJsonBytes({
    domain: 'tf.atomistic-full-candidate.evidence-bundle/v1',
    createdAt: receipt.createdAt,
    candidatePlan: receipt.candidatePlan,
    source: receipt.source,
    frozenBindings: receipt.frozenBindings,
    partitions: receipt.partitions,
    metrics: receipt.metrics,
    assessments: receipt.assessments,
    verification: receipt.verification,
  }));
}

function completePartition(spec, producer, artifact) {
  return {
    partitionId: spec.partitionId, model: spec.model, modelId: spec.modelId,
    partitionIndex: 0, partitionCount: 1, status: 'complete', records: completeRecordCounts(),
    producer: structuredClone(producer), artifact,
  };
}

function invalidPartition(spec, producer, artifact, rejectedArtifact, records, errors) {
  const result = {
    partitionId: spec.partitionId, model: spec.model, modelId: spec.modelId,
    partitionIndex: 0, partitionCount: 1, status: 'invalid', records,
    producer: structuredClone(producer),
    termination: terminationEvidence('independent-verification', 'prediction-invalid', errors.join('; ')),
  };
  if (artifact) result.artifact = artifact;
  else result.rejectedArtifact = rejectedArtifact ?? rejectedArtifactObservation(null);
  return result;
}

function failedPartition(spec, status, code, message, producer = null, rejectedArtifact = null, records = null) {
  const normalizedStatus = ['failed', 'cancelled', 'not-started'].includes(status) ? status : 'failed';
  const result = {
    partitionId: spec.partitionId, model: spec.model, modelId: spec.modelId,
    partitionIndex: 0, partitionCount: 1, status: normalizedStatus,
    records: records ?? zeroRecordCounts(),
    termination: terminationEvidence('producer', normalizeCode(code, `producer-${normalizedStatus}`), message),
  };
  if (producer) result.producer = structuredClone(producer);
  if (rejectedArtifact) result.rejectedArtifact = rejectedArtifact;
  return result;
}

function inspectArtifactFiles(artifactFiles, spec) {
  const errors = [];
  const rejectedArtifact = rejectedArtifactObservation(artifactFiles);
  if (!(artifactFiles instanceof Map)) {
    errors.push(`${spec.model} artifactFiles must be a Map of observed path to bytes`);
    return { artifact: null, rejectedArtifact, parsed: null, errors };
  }
  const names = [...artifactFiles.keys()];
  if (!names.every((name) => typeof name === 'string')) errors.push(`${spec.model} artifact file names must be strings`);
  const orderedNames = names.filter((name) => typeof name === 'string').sort(asciiCompare);
  if (!isDeepStrictEqual(orderedNames, EXPECTED_ARTIFACT_PATHS)) errors.push(`${spec.model} artifact file allowlist differs`);
  if (orderedNames.some((name) => FORBIDDEN_ARTIFACT_PATH.test(name))) errors.push(`${spec.model} artifact paths expose forbidden label or result material`);
  for (const name of EXPECTED_ARTIFACT_PATHS) {
    if (!Buffer.isBuffer(artifactFiles.get(name))) errors.push(`${spec.model} artifact ${name} is unavailable as bytes`);
  }
  const predictionBytes = artifactFiles.get(PREDICTION_FILE_PATH);
  const structureBytes = artifactFiles.get(STRUCTURE_BUNDLE_FILE_PATH);
  const manifestBytes = artifactFiles.get(STRUCTURE_MANIFEST_FILE_PATH);
  let parsed = null;
  if (Buffer.isBuffer(predictionBytes)) {
    try {
      parsed = parseFullPredictionJsonl(predictionBytes, spec);
      rejectedArtifact.predictionRecordsObserved = parsed.lineCount;
      if (parsed.referenceLabelsPresent === true) rejectedArtifact.referenceLabelsPresent = true;
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  const structureDigest = Buffer.isBuffer(structureBytes) ? sha256(structureBytes) : null;
  const manifestDigest = Buffer.isBuffer(manifestBytes) ? sha256(manifestBytes) : null;
  const structureTrusted = Buffer.isBuffer(structureBytes)
    && structureBytes.length === EXPECTED_STRUCTURE_BUNDLE_BYTES
    && structureDigest === EXPECTED_STRUCTURE_BUNDLE_DIGEST;
  const manifestTrusted = Buffer.isBuffer(manifestBytes)
    && manifestBytes.length === EXPECTED_STRUCTURE_MANIFEST_FILE_BYTES
    && manifestDigest === EXPECTED_STRUCTURE_MANIFEST_FILE_DIGEST;
  if (!structureTrusted) errors.push(`${spec.model} structure bundle bytes differ from the frozen label-free artifact`);
  if (!manifestTrusted) errors.push(`${spec.model} structure manifest bytes differ from the frozen artifact`);
  const exactAllowlist = isDeepStrictEqual(orderedNames, EXPECTED_ARTIFACT_PATHS)
    && orderedNames.length === names.length
    && !orderedNames.some((name) => FORBIDDEN_ARTIFACT_PATH.test(name));
  const referenceLabelsPresent = rejectedArtifact.referenceLabelsPresent === true || parsed?.referenceLabelsPresent === true
    ? true
    : exactAllowlist && structureTrusted && manifestTrusted && parsed?.referenceLabelsPresent === false
      ? false
      : null;
  const artifact = parsed && Buffer.isBuffer(predictionBytes) && Buffer.isBuffer(structureBytes) && Buffer.isBuffer(manifestBytes)
    ? {
        predictionSchemaVersion: parsed.predictionSchemaVersion,
        predictionFileDigest: parsed.rawDigest,
        predictionBytes: predictionBytes.length,
        predictionRecords: parsed.lineCount,
        environmentDigest: parsed.environmentDigest,
        structureBundleDigest: structureDigest,
        structureManifestFileDigest: manifestDigest,
        artifactFilesEvidenceDigest: rejectedArtifact.artifactFilesEvidenceDigest,
        referenceLabelsPresent,
      }
    : null;
  return { artifact, rejectedArtifact, parsed, errors: uniqueSorted(errors) };
}

function rejectedArtifactObservation(artifactFiles) {
  const isMap = artifactFiles instanceof Map;
  const entries = isMap ? [...artifactFiles.entries()] : [];
  const metadata = entries.slice(0, 100_000).map(([rawPath, value]) => {
    const filePath = typeof rawPath === 'string' && rawPath.length > 0
      ? rawPath.slice(0, 256)
      : '<empty-or-non-string-path>';
    return {
      path: filePath,
      sizeBytes: Buffer.isBuffer(value) ? value.length : null,
      sha256: Buffer.isBuffer(value) ? sha256(value) : null,
    };
  }).sort((left, right) => asciiCompare(left.path, right.path));
  const predictionBytes = isMap ? artifactFiles.get(PREDICTION_FILE_PATH) : null;
  const observedNames = metadata.map((entry) => entry.path);
  return {
    artifactFilesEvidenceDigest: sha256(canonicalJsonBytes({
      domain: 'tf.atomistic-full-candidate.artifact-files/v1',
      truncated: entries.length > metadata.length,
      files: metadata,
    })),
    observedFileCount: Math.min(entries.length, 100_000),
    observedFileNames: [...new Set(observedNames)].slice(0, 32),
    predictionFileDigest: Buffer.isBuffer(predictionBytes) ? sha256(predictionBytes) : null,
    predictionBytesObserved: Buffer.isBuffer(predictionBytes) ? predictionBytes.length : 0,
    predictionRecordsObserved: observedJsonlRecordCount(predictionBytes),
    referenceLabelsPresent: observedNames.some((name) => FORBIDDEN_ARTIFACT_PATH.test(name)) ? true : null,
  };
}

function observedJsonlRecordCount(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_FULL_PREDICTION_BYTES) return null;
  let lines = 0;
  for (const byte of bytes) if (byte === 0x0a) lines += 1;
  return lines <= 100_000 ? lines : null;
}

function recordCountsForParsedArtifact(parsed, spec, referenceRecords) {
  if (!parsed) return null;
  const result = evaluateFullCandidateMetrics(spec.modelId, parsed.records, referenceRecords);
  return coverageToRecordCounts(result.coverage, parsed.malformedRows);
}

function coverageToRecordCounts(coverage, parseMalformedRows = 0) {
  const malformedRows = Math.min(
    100_000,
    Math.max(0, coverage.malformedRows ?? 0) + Math.max(0, parseMalformedRows ?? 0),
  );
  if (coverage.referenceRecords !== EXPECTED_RECORDS) {
    return {
      ...zeroRecordCounts(malformedRows),
      extra: coverage.unexpectedDistinctIds,
      duplicate: coverage.duplicatedDistinctIds,
    };
  }
  return {
    expected: EXPECTED_RECORDS,
    attempted: coverage.attemptedExpectedIds,
    succeeded: coverage.validExpectedIds,
    missing: coverage.missingExpectedIds,
    extra: coverage.unexpectedDistinctIds,
    duplicate: coverage.duplicatedDistinctIds,
    failed: coverage.failedExpectedIds,
    nonfinite: coverage.nonfiniteExpectedIds,
    malformedRows,
  };
}

function completeRecordCounts() {
  return { expected: 693, attempted: 693, succeeded: 693, missing: 0, extra: 0, duplicate: 0, failed: 0, nonfinite: 0, malformedRows: 0 };
}

function zeroRecordCounts(malformedRows = 0) {
  return {
    expected: 693, attempted: 0, succeeded: 0, missing: 693,
    extra: 0, duplicate: 0, failed: 0, nonfinite: 0,
    malformedRows: Number.isSafeInteger(malformedRows) ? Math.min(Math.max(malformedRows, 0), 100_000) : 0,
  };
}

function terminationEvidence(stage, code, message) {
  const boundedStage = normalizeText(stage, 'independent-verification', 128);
  const boundedCode = normalizeCode(code, 'verification-failure');
  const boundedMessage = normalizeText(message, 'Unspecified verification failure.', 2048);
  return {
    stage: boundedStage,
    code: boundedCode,
    message: boundedMessage,
    evidenceDigest: sha256(canonicalJsonBytes({ stage: boundedStage, code: boundedCode, message: boundedMessage })),
  };
}

function validProducer(producer) {
  return isPlainObject(producer)
    && isDeepStrictEqual(Object.keys(producer).sort(asciiCompare), PRODUCER_KEYS)
    && producer.repositoryId === EXPECTED_REPOSITORY_ID
    && SHA_PATTERN.test(producer.revision ?? '')
    && ['workflowRunId', 'runAttempt', 'jobId'].every((key) => Number.isSafeInteger(producer[key]) && producer[key] > 0)
    && typeof producer.hardwareId === 'string'
    && producer.hardwareId.length >= 3
    && producer.hardwareId.length <= 128;
}

function normalizeSource(source, errors) {
  const valid = validSource(source);
  if (!valid) errors.push('candidate source identity is malformed or outside the frozen repository');
  return {
    repository: EXPECTED_REPOSITORY,
    repositoryId: EXPECTED_REPOSITORY_ID,
    revision: SHA_PATTERN.test(source?.revision ?? '') ? source.revision : '0'.repeat(40),
    treeDigest: DIGEST_PATTERN.test(source?.treeDigest ?? '') ? source.treeDigest : sha256(Buffer.from('source-tree-unavailable', 'utf8')),
  };
}

function normalizeTimestamp(value, errors) {
  if (typeof value === 'string' && TIMESTAMP_PATTERN.test(value) && Number.isFinite(Date.parse(value))) return value;
  errors.push('candidate creation timestamp is invalid');
  return '2000-01-01T00:00:00Z';
}

function normalizeObservedSchemaVersion(value) {
  if (typeof value !== 'string' || value.length < 1 || value.length > 128) return 'unavailable';
  return value;
}

function normalizeCode(value, fallback) {
  return typeof value === 'string' && /^[a-z0-9][a-z0-9-]{0,127}$/.test(value) ? value : fallback;
}

function normalizeText(value, fallback, maximum) {
  const text = typeof value === 'string' && value.length > 0 ? value : fallback;
  return text.slice(0, maximum);
}

function validateRecordCountSemantics(records, errors, model) {
  if (!isPlainObject(records)) return;
  const fields = ['expected', 'attempted', 'succeeded', 'missing', 'extra', 'duplicate', 'failed', 'nonfinite', 'malformedRows'];
  if (!fields.every((field) => Number.isSafeInteger(records[field]) && records[field] >= 0)) return;
  if (records.expected !== EXPECTED_RECORDS
      || records.attempted + records.missing !== EXPECTED_RECORDS
      || records.succeeded + records.failed !== records.attempted
      || records.nonfinite > records.failed) {
    errors.push(`${model ?? 'unknown'} record-count invariants are inconsistent`);
  }
}

function validatePartitionEvidenceSemantics(partition, errors) {
  if (isPlainObject(partition?.termination)) {
    const expected = terminationEvidence(
      partition.termination.stage,
      partition.termination.code,
      partition.termination.message,
    ).evidenceDigest;
    if (partition.termination.evidenceDigest !== expected) {
      errors.push(`${partition.model ?? 'unknown'} termination evidence digest is inconsistent`);
    }
  }
  if (isPlainObject(partition?.rejectedArtifact)) {
    const names = partition.rejectedArtifact.observedFileNames;
    if (Array.isArray(names) && !isDeepStrictEqual(names, [...new Set(names)].sort(asciiCompare))) {
      errors.push(`${partition.model ?? 'unknown'} rejected artifact file names are not uniquely ASCII sorted`);
    }
    if (Array.isArray(names)
        && Number.isSafeInteger(partition.rejectedArtifact.observedFileCount)
        && partition.rejectedArtifact.observedFileCount < names.length) {
      errors.push(`${partition.model ?? 'unknown'} rejected artifact file count is smaller than its retained names`);
    }
  }
  if (partition?.status === 'complete' && isPlainObject(partition.artifact)) {
    const expected = completeArtifactFilesEvidenceDigest(partition.artifact);
    if (partition.artifact.artifactFilesEvidenceDigest !== expected) {
      errors.push(`${partition.model ?? 'unknown'} complete artifact file evidence digest is inconsistent`);
    }
  }
}

function completeArtifactFilesEvidenceDigest(artifact) {
  const metadata = [
    {
      path: STRUCTURE_MANIFEST_FILE_PATH,
      sizeBytes: EXPECTED_STRUCTURE_MANIFEST_FILE_BYTES,
      sha256: artifact.structureManifestFileDigest,
    },
    {
      path: PREDICTION_FILE_PATH,
      sizeBytes: artifact.predictionBytes,
      sha256: artifact.predictionFileDigest,
    },
    {
      path: STRUCTURE_BUNDLE_FILE_PATH,
      sizeBytes: EXPECTED_STRUCTURE_BUNDLE_BYTES,
      sha256: artifact.structureBundleDigest,
    },
  ];
  return sha256(canonicalJsonBytes({
    domain: 'tf.atomistic-full-candidate.artifact-files/v1',
    truncated: false,
    files: metadata,
  }));
}

function validatePartialMetrics(partialMetrics, errors) {
  if (partialMetrics === undefined) return;
  if (!Array.isArray(partialMetrics)) return;
  const models = partialMetrics.map((metrics) => metrics?.model);
  const allowed = models.length === 1
    ? ['mattersim', 'mace'].includes(models[0])
    : isDeepStrictEqual(models, ['mattersim', 'mace']);
  if (!allowed || new Set(models).size !== models.length) errors.push('partial metrics are duplicated or out of frozen model order');
}

function validateDiagnosticSummaries(metrics, errors) {
  const diagnostics = metrics?.stressDiagnostics;
  const reports = diagnostics?.reports;
  const order = diagnostics?.voigtOrder;
  if (!reports || !Array.isArray(order)) return;
  if (diagnostics.spectralNormMeanGpa !== reports.spectralNorm?.mean
      || diagnostics.voigt6L2MeanGpa !== reports.unweightedVoigt6L2?.mean
      || !isDeepStrictEqual(diagnostics.sixComponentMaeGpa, order.map((id) => reports.sixComponent?.[id]?.mean))) {
    errors.push(`${metrics?.model ?? 'unknown'} stress diagnostic summaries differ from evidence-bound reports`);
  }
}

function inInterval(value, interval) {
  return typeof value === 'number' && Number.isFinite(value) && value >= interval[0] && value <= interval[1];
}

function uniqueSorted(values) {
  return [...new Set(values.map((value) => String(value).slice(0, 2048)))].sort(asciiCompare);
}

function asciiCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validAuthoritativeVerificationInputs(value) {
  return isDictionary(value)
    && isDeepStrictEqual(Object.keys(value).sort(asciiCompare), AUTHORITATIVE_INPUT_KEYS)
    && ['candidatePlanBytes', 'scientificPlanBytes', 'runtimeLockBytes', 'datasetBytes']
      .every((key) => Buffer.isBuffer(value[key]))
    && Array.isArray(value.partitionEvidence)
    && value.partitionEvidence.length === MODEL_SPECS.length
    && value.partitionEvidence.every((evidence, index) => isDictionary(evidence)
      && evidence.model === MODEL_SPECS[index].model
      && evidence.modelId === MODEL_SPECS[index].modelId
      && evidence.artifactFiles instanceof Map
      && [...evidence.artifactFiles.entries()].every(([name, bytes]) => typeof name === 'string' && Buffer.isBuffer(bytes)))
    && validSource(value.source)
    && typeof value.createdAt === 'string'
    && TIMESTAMP_PATTERN.test(value.createdAt)
    && Number.isFinite(Date.parse(value.createdAt));
}

function validSource(value) {
  return isDictionary(value)
    && isDeepStrictEqual(Object.keys(value).sort(asciiCompare), SOURCE_KEYS)
    && value.repository === EXPECTED_REPOSITORY
    && value.repositoryId === EXPECTED_REPOSITORY_ID
    && SHA_PATTERN.test(value.revision ?? '')
    && DIGEST_PATTERN.test(value.treeDigest ?? '');
}

function isDictionary(value) {
  if (!isPlainObject(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}
