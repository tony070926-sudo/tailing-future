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
export const FULL_CANDIDATE_RECEIPT_SCHEMA_VERSION = 'tf.atomistic-full-candidate-receipt/0.2';
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
const STRUCTURE_MANIFEST_FILE_PATH = 'manifests/structures.manifest.json';
const EXPECTED_PRODUCER_SCIENTIFIC_PAYLOAD_PATHS = Object.freeze([
  STRUCTURE_MANIFEST_FILE_PATH,
  PREDICTION_FILE_PATH,
]);
const MAX_RETAINED_PAYLOAD_FILE_OBSERVATIONS = 32;
const MAX_RECEIPT_OBSERVED_PAYLOAD_FILES = 100_000;
const MAX_AUTHORITATIVE_PAYLOAD_FILES = 32;
const MAX_AUTHORITATIVE_PAYLOAD_FILE_BYTES = 16 * 1024 * 1024;
const MAX_AUTHORITATIVE_PAYLOAD_TOTAL_BYTES = 32 * 1024 * 1024;
const MAX_CLASSIFIABLE_PAYLOAD_PATH_BYTES = 4_096;
const FORBIDDEN_PRODUCER_PAYLOAD_PATH = /(?:^|\/)(?:reference|labels?|metrics?|targets?|ground[-_]?truth|receipts?|attestations?|raw[-_]?data(?:set)?)(?:[./_-]|$)|(?:^|\/)structures(?:\/|\.jsonl$)|(?:^|\/)random-TP\.xyz$/i;
const VERIFIED_CONTEXTS = new WeakSet();
const ALLOWED_EVIDENCE_STATUSES = new Set(['complete', 'invalid', 'failed', 'cancelled', 'not-started']);
const PRODUCER_KEYS = Object.freeze(['hardwareId', 'jobId', 'repositoryId', 'revision', 'runAttempt', 'workflowRunId']);
const SOURCE_KEYS = Object.freeze([
  'repository', 'repositoryId', 'revision', 'treeDigest', 'treeDigestProtocol',
]);
const EVIDENCE_KEYS = Object.freeze(['model', 'modelId', 'producer', 'producerScientificPayloadFiles', 'status', 'termination']);
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
  'atomic-number disclosure and public producer-payload redistribution license clearance',
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
  let verifierDerivedStructureCommitment = unavailableVerifierDerivedStructureCommitment();
  if (Buffer.isBuffer(candidatePlanBytes)) {
    try {
      plan = parseJsonRejectDuplicateKeys(candidatePlanBytes, 'full-candidate plan');
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
    if (sha256(candidatePlanBytes) !== FULL_CANDIDATE_PLAN_DIGEST) errors.push('candidate plan raw digest differs from the frozen v0.2 contract');
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
    verifierDerivedStructureCommitment = deriveVerifierStructureCommitment(datasetBytes, datasetInspection);
  } catch (error) {
    errors.push(`dataset inspection failed: ${error instanceof Error ? error.message : String(error)}`);
  }
  const result = {
    plan,
    datasetInspection,
    referenceRecords: datasetInspection?.records ?? [],
    verifierDerivedStructureCommitment,
    candidatePlanBindingVerified: Buffer.isBuffer(candidatePlanBytes) && sha256(candidatePlanBytes) === FULL_CANDIDATE_PLAN_DIGEST,
    frozenBindingsVerified: false,
    errors: uniqueSorted(errors),
  };
  result.frozenBindingsVerified = result.errors.length === 0;
  if (result.frozenBindingsVerified) VERIFIED_CONTEXTS.add(result);
  return result;
}

function deriveVerifierStructureCommitment(datasetBytes, datasetInspection) {
  if (sha256(datasetBytes) !== EXPECTED_FROZEN_BINDINGS.datasetDigest
      || datasetInspection.structureManifestSha256 !== EXPECTED_FROZEN_BINDINGS.structureManifestDigest
      || datasetInspection.records.length !== EXPECTED_RECORDS) {
    throw new Error('raw dataset cannot establish the frozen structure commitment');
  }
  const bundleBytes = Buffer.concat(
    datasetInspection.records.map(canonicalPythonStructureRecordBytes),
  );
  const bundleDigest = sha256(bundleBytes);
  if (bundleBytes.length !== EXPECTED_STRUCTURE_BUNDLE_BYTES
      || bundleDigest !== EXPECTED_STRUCTURE_BUNDLE_DIGEST) {
    throw new Error('deterministically regenerated structure bytes differ from the frozen trust root');
  }
  return {
    status: 'verified',
    authority: 'independent-label-bearing-verifier',
    derivationProtocol: 'deterministic-label-stripping-from-frozen-raw-dataset/v1',
    rawDatasetDigest: EXPECTED_FROZEN_BINDINGS.datasetDigest,
    structureManifestDigest: EXPECTED_FROZEN_BINDINGS.structureManifestDigest,
    regeneratedStructureBundleDigest: bundleDigest,
    regeneratedStructureBundleBytes: bundleBytes.length,
    producerStructureBundleAttributed: false,
  };
}

function unavailableVerifierDerivedStructureCommitment() {
  return {
    status: 'unavailable',
    authority: 'independent-label-bearing-verifier',
    derivationProtocol: 'deterministic-label-stripping-from-frozen-raw-dataset/v1',
    rawDatasetDigest: null,
    structureManifestDigest: null,
    regeneratedStructureBundleDigest: null,
    regeneratedStructureBundleBytes: null,
    producerStructureBundleAttributed: false,
  };
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
        rejectedProducerScientificPayloadObservation(evidence?.producerScientificPayloadFiles),
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
    const payloadInspection = inspectProducerScientificPayloadFiles(
      evidence.producerScientificPayloadFiles,
      spec,
    );
    if (!ALLOWED_EVIDENCE_STATUSES.has(evidence.status)) {
      integrityErrors.push(`${spec.model} producer status is missing or unsupported`);
      return failedPartition(
        spec,
        'failed',
        'producer-status-invalid',
        'Producer status is missing or outside the frozen status allowlist.',
        producer,
        payloadInspection.rejectedProducerScientificPayload,
        recordCountsForParsedPayload(payloadInspection.parsed, spec, referenceRecords),
      );
    }
    if (['failed', 'cancelled', 'not-started'].includes(evidence.status)) {
      const message = normalizeText(evidence.termination?.message, `Producer ended ${evidence.status}.`, 2048);
      integrityErrors.push(...payloadInspection.errors);
      integrityErrors.push(`${spec.model} producer ended ${evidence.status}: ${message}`);
      return failedPartition(
        spec,
        evidence.status,
        normalizeCode(evidence.termination?.code, `producer-${evidence.status}`),
        message,
        producer,
        payloadInspection.rejectedProducerScientificPayload,
        recordCountsForParsedPayload(payloadInspection.parsed, spec, referenceRecords),
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
        payloadInspection.rejectedProducerScientificPayload,
        recordCountsForParsedPayload(payloadInspection.parsed, spec, referenceRecords),
      );
    }
    const parsed = payloadInspection.parsed;
    if (!parsed) {
      const localErrors = payloadInspection.errors.length > 0
        ? payloadInspection.errors
        : [`${spec.model} producer scientific payload is unavailable`];
      integrityErrors.push(...localErrors);
      return invalidPartition(
        spec,
        producer,
        null,
        payloadInspection.rejectedProducerScientificPayload,
        zeroRecordCounts(payloadInspection.rejectedProducerScientificPayload.predictionRecordsObserved ?? 0),
        localErrors,
      );
    }
    const metricResult = evaluateFullCandidateMetrics(spec.modelId, parsed.records, referenceRecords);
    if (metricResult.metrics) metricResults.set(spec.model, metricResult);
    const localErrors = [
      ...evidenceContractErrors,
      ...payloadInspection.errors,
      ...parsed.errors,
      ...metricResult.validation.errors,
    ];
    if (!isDeepStrictEqual(parsed.records.map((record) => record.id), referenceRecords.map((record) => record.id))) localErrors.push(`${spec.model} prediction records are not in the frozen ASCII ID order`);
    const producerScientificPayload = payloadInspection.producerScientificPayload;
    if (!producerScientificPayload
        || producerScientificPayload.producerPayloadReferenceLabelsPresent !== false
        || producerScientificPayload.producerRawDatasetPresent !== false
        || producerScientificPayload.producerStructureBundlePresent !== false) {
      localErrors.push(`${spec.model} producer scientific payload does not prove the exact two-file label-free public allowlist`);
    }
    if (evidence.status !== 'complete') localErrors.push(`${spec.model} producer evidence was explicitly marked invalid`);
    const recordCounts = coverageToRecordCounts(metricResult.coverage, parsed.malformedRows);
    if (localErrors.length > 0 || !metricResult.coverage.complete || !producerScientificPayload) {
      integrityErrors.push(...localErrors);
      return invalidPartition(
        spec,
        producer,
        producerScientificPayload,
        producerScientificPayload ? null : payloadInspection.rejectedProducerScientificPayload,
        recordCounts,
        localErrors.length > 0 ? localErrors : ['producer evidence was marked invalid'],
      );
    }
    return completePartition(spec, producer, producerScientificPayload);
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
        MODEL_SPECS[index], partitions[index].producer, partitions[index].producerScientificPayload,
        null, partitions[index].records, ['global campaign or frozen-binding verification failed'],
      );
    }
  }

  const complete = partitions.every((partition) => partition.status === 'complete')
    && metricResults.size === MODEL_SPECS.length
    && integrityErrors.length === 0;
  const producerScientificPayloadReferenceLabelsAbsent = partitions.every(
    (partition) => partition.producerScientificPayload?.producerPayloadReferenceLabelsPresent === false,
  );
  const producerScientificPayloadStructureBundleAbsent = partitions.every(
    (partition) => partition.producerScientificPayload?.producerStructureBundlePresent === false,
  );
  const verifierReferenceLabelsLoaded = contextBranded && referenceRecords.length === EXPECTED_RECORDS;
  const verification = {
    status: complete ? 'verified-complete' : 'verified-incomplete',
    verifierClass: 'independent-label-bearing-verifier',
    implementationDigest: FULL_CANDIDATE_VERIFIER_IMPLEMENTATION_DIGEST,
    candidatePlanBindingVerified: planBindingVerified,
    frozenBindingsVerified,
    producerScientificPayloadReferenceLabelsAbsent,
    producerScientificPayloadStructureBundleAbsent,
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
      schemaVersion: 'tf.atomistic-full-candidate-plan/0.2',
      rawDigest: FULL_CANDIDATE_PLAN_DIGEST,
    },
    source,
    frozenBindings: structuredClone(EXPECTED_FROZEN_BINDINGS),
    verifierDerivedStructureCommitment: structuredClone(context?.verifierDerivedStructureCommitment
      ?? unavailableVerifierDerivedStructureCommitment()),
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
 * those require the frozen dataset plus the observed producer scientific payload bytes.
 */
export function validateFullCandidateReceiptEnvelope(receipt, receiptSchemaBytes) {
  const errors = [];
  if (!Buffer.isBuffer(receiptSchemaBytes)) {
    errors.push('frozen receipt schema raw bytes are required');
  } else if (sha256(receiptSchemaBytes) !== FULL_CANDIDATE_RECEIPT_SCHEMA_DIGEST) {
    errors.push('receipt schema raw digest differs from the frozen v0.2 candidate contract');
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
  if (receipt?.candidatePlan?.rawDigest !== FULL_CANDIDATE_PLAN_DIGEST) errors.push('candidate receipt is not bound to the frozen v0.2 plan');
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
    && partitions.every((partition) => partition?.producerScientificPayload?.producerPayloadReferenceLabelsPresent === false);
  if (receipt?.verification?.producerScientificPayloadReferenceLabelsAbsent !== expectedLabelAbsence) {
    errors.push('producer scientific-payload label-absence summary is inconsistent with partition payloads');
  }
  const expectedStructureBundleAbsence = partitions.length === MODEL_SPECS.length
    && partitions.every((partition) => partition?.producerScientificPayload?.producerStructureBundlePresent === false);
  if (receipt?.verification?.producerScientificPayloadStructureBundleAbsent !== expectedStructureBundleAbsence) {
    errors.push('producer scientific-payload structure-bundle absence summary is inconsistent with partition payloads');
  }
  validateVerifierDerivedStructureCommitment(
    receipt?.verifierDerivedStructureCommitment,
    receipt?.verification,
    errors,
  );
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
 * observed producer scientific payload bytes, then require an exact receipt match. A receipt plus
 * its public bundle hash alone is not authoritative evidence.
 */
export function validateFullCandidateReceipt(receipt, receiptSchemaBytes, verificationInputs) {
  const envelope = validateFullCandidateReceiptEnvelope(receipt, receiptSchemaBytes);
  const errors = [...envelope.errors];
  if (!validAuthoritativeVerificationInputs(verificationInputs)) {
    errors.push('authoritative receipt validation requires frozen raw inputs and observed producer scientific payload bytes');
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
    domain: 'tf.atomistic-full-candidate.evidence-bundle/v2',
    createdAt: receipt.createdAt,
    candidatePlan: receipt.candidatePlan,
    source: receipt.source,
    frozenBindings: receipt.frozenBindings,
    verifierDerivedStructureCommitment: receipt.verifierDerivedStructureCommitment,
    partitions: receipt.partitions,
    metrics: receipt.metrics,
    assessments: receipt.assessments,
    verification: receipt.verification,
  }));
}

function completePartition(spec, producer, producerScientificPayload) {
  return {
    partitionId: spec.partitionId, model: spec.model, modelId: spec.modelId,
    partitionIndex: 0, partitionCount: 1, status: 'complete', records: completeRecordCounts(),
    producer: structuredClone(producer), producerScientificPayload,
  };
}

function invalidPartition(
  spec,
  producer,
  producerScientificPayload,
  rejectedProducerScientificPayload,
  records,
  errors,
) {
  const result = {
    partitionId: spec.partitionId, model: spec.model, modelId: spec.modelId,
    partitionIndex: 0, partitionCount: 1, status: 'invalid', records,
    producer: structuredClone(producer),
    termination: terminationEvidence('independent-verification', 'prediction-invalid', errors.join('; ')),
  };
  if (producerScientificPayload) result.producerScientificPayload = producerScientificPayload;
  else {
    result.rejectedProducerScientificPayload = rejectedProducerScientificPayload
      ?? rejectedProducerScientificPayloadObservation(null);
  }
  return result;
}

function failedPartition(
  spec,
  status,
  code,
  message,
  producer = null,
  rejectedProducerScientificPayload = null,
  records = null,
) {
  const normalizedStatus = ['failed', 'cancelled', 'not-started'].includes(status) ? status : 'failed';
  const result = {
    partitionId: spec.partitionId, model: spec.model, modelId: spec.modelId,
    partitionIndex: 0, partitionCount: 1, status: normalizedStatus,
    records: records ?? zeroRecordCounts(),
    termination: terminationEvidence('producer', normalizeCode(code, `producer-${normalizedStatus}`), message),
  };
  if (producer) result.producer = structuredClone(producer);
  if (rejectedProducerScientificPayload) {
    result.rejectedProducerScientificPayload = rejectedProducerScientificPayload;
  }
  return result;
}

function inspectProducerScientificPayloadFiles(producerScientificPayloadFiles, spec) {
  const errors = [];
  const rejectedProducerScientificPayload = rejectedProducerScientificPayloadObservation(
    producerScientificPayloadFiles,
  );
  if (!(producerScientificPayloadFiles instanceof Map)) {
    errors.push(`${spec.model} producerScientificPayloadFiles must be a Map of observed path to bytes`);
    return {
      producerScientificPayload: null,
      rejectedProducerScientificPayload,
      parsed: null,
      errors,
    };
  }
  if (producerScientificPayloadFiles.size > MAX_AUTHORITATIVE_PAYLOAD_FILES) {
    errors.push(`${spec.model} producer scientific payload exceeds the ${MAX_AUTHORITATIVE_PAYLOAD_FILES}-file inspection limit`);
  }
  let totalPayloadBytes = 0;
  for (const [name, value] of producerScientificPayloadFiles) {
    if (canonicalPayloadPathBytes(name) === null) {
      errors.push(`${spec.model} producer scientific payload contains a non-canonical UTF-8 path or exceeds the ${MAX_CLASSIFIABLE_PAYLOAD_PATH_BYTES}-byte path limit`);
    }
    if (!Buffer.isBuffer(value)) {
      errors.push(`${spec.model} producer scientific payload values must be byte buffers`);
      continue;
    }
    if (value.length > MAX_AUTHORITATIVE_PAYLOAD_FILE_BYTES) {
      errors.push(`${spec.model} producer scientific payload member exceeds the per-file byte limit`);
    }
    totalPayloadBytes += value.length;
  }
  if (!Number.isSafeInteger(totalPayloadBytes)
      || totalPayloadBytes > MAX_AUTHORITATIVE_PAYLOAD_TOTAL_BYTES) {
    errors.push(`${spec.model} producer scientific payload exceeds the aggregate byte limit`);
  }
  if (errors.length > 0) {
    return {
      producerScientificPayload: null,
      rejectedProducerScientificPayload,
      parsed: null,
      errors: uniqueSorted(errors),
    };
  }
  const names = [...producerScientificPayloadFiles.keys()];
  if (!names.every((name) => typeof name === 'string')) errors.push(`${spec.model} producer scientific payload file names must be strings`);
  const orderedNames = names.filter((name) => typeof name === 'string').sort(asciiCompare);
  if (!isDeepStrictEqual(orderedNames, EXPECTED_PRODUCER_SCIENTIFIC_PAYLOAD_PATHS)) {
    errors.push(`${spec.model} producer scientific payload file allowlist differs`);
  }
  if (orderedNames.some((name) => FORBIDDEN_PRODUCER_PAYLOAD_PATH.test(name))) {
    errors.push(`${spec.model} producer scientific payload paths expose forbidden labels, raw data or a structure bundle`);
  }
  for (const name of EXPECTED_PRODUCER_SCIENTIFIC_PAYLOAD_PATHS) {
    if (!Buffer.isBuffer(producerScientificPayloadFiles.get(name))) {
      errors.push(`${spec.model} producer scientific payload ${name} is unavailable as bytes`);
    }
  }
  const predictionBytes = producerScientificPayloadFiles.get(PREDICTION_FILE_PATH);
  const manifestBytes = producerScientificPayloadFiles.get(STRUCTURE_MANIFEST_FILE_PATH);
  let parsed = null;
  if (Buffer.isBuffer(predictionBytes)) {
    try {
      parsed = parseFullPredictionJsonl(predictionBytes, spec);
      rejectedProducerScientificPayload.predictionRecordsObserved = parsed.lineCount;
      if (parsed.referenceLabelsPresent === true) {
        rejectedProducerScientificPayload.producerPayloadReferenceLabelsPresent = true;
      }
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error));
    }
  }
  const manifestDigest = Buffer.isBuffer(manifestBytes) ? sha256(manifestBytes) : null;
  const manifestTrusted = Buffer.isBuffer(manifestBytes)
    && manifestBytes.length === EXPECTED_STRUCTURE_MANIFEST_FILE_BYTES
    && manifestDigest === EXPECTED_STRUCTURE_MANIFEST_FILE_DIGEST;
  if (!manifestTrusted) errors.push(`${spec.model} producer structure manifest bytes differ from the frozen manifest`);
  const exactAllowlist = isDeepStrictEqual(orderedNames, EXPECTED_PRODUCER_SCIENTIFIC_PAYLOAD_PATHS)
    && orderedNames.length === names.length
    && !orderedNames.some((name) => FORBIDDEN_PRODUCER_PAYLOAD_PATH.test(name));
  const producerPayloadReferenceLabelsPresent = rejectedProducerScientificPayload.producerPayloadReferenceLabelsPresent === true
      || parsed?.referenceLabelsPresent === true
    ? true
    : exactAllowlist && manifestTrusted && parsed?.referenceLabelsPresent === false
      ? false
      : null;
  const producerScientificPayload = exactAllowlist
      && parsed
      && Buffer.isBuffer(predictionBytes)
      && Buffer.isBuffer(manifestBytes)
    ? {
        predictionSchemaVersion: parsed.predictionSchemaVersion,
        predictionFileDigest: parsed.rawDigest,
        predictionBytes: predictionBytes.length,
        predictionRecords: parsed.lineCount,
        environmentDigest: parsed.environmentDigest,
        producerStructureManifestFileDigest: manifestDigest,
        producerScientificPayloadEvidenceDigest:
          rejectedProducerScientificPayload.producerScientificPayloadEvidenceDigest,
        producerPayloadReferenceLabelsPresent,
        producerRawDatasetPresent: rejectedProducerScientificPayload.producerRawDatasetPresent,
        producerStructureBundlePresent:
          rejectedProducerScientificPayload.producerStructureBundlePresent,
        atomicNumbersPresent: parsed.records.length > 0
          && parsed.records.every((record) => Array.isArray(record.atomicNumbers)),
        atomicNumbersPublicationLicenseCleared: false,
        publicationEligible: false,
      }
    : null;
  return {
    producerScientificPayload,
    rejectedProducerScientificPayload,
    parsed,
    errors: uniqueSorted(errors),
  };
}

function rejectedProducerScientificPayloadObservation(producerScientificPayloadFiles) {
  const isMap = producerScientificPayloadFiles instanceof Map;
  const retainedObservations = [];
  const overflowHash = createHash('sha256');
  overflowHash.update('tf.atomistic-full-candidate.producer-scientific-payload-overflow/v1\0', 'utf8');
  let observedFileCount = 0;
  let classificationComplete = isMap;
  let referenceLabelsPresent = false;
  let rawDatasetPresent = false;
  let structureBundlePresent = false;
  if (isMap) {
    for (const [rawPath, value] of producerScientificPayloadFiles) {
      const observation = payloadFileObservation(rawPath, value);
      observedFileCount += 1;
      if (observation.classificationPath === null) classificationComplete = false;
      else {
        referenceLabelsPresent ||= /(?:^|\/)(?:reference|labels?|targets?|ground[-_]?truth)(?:[./_-]|$)/i.test(observation.classificationPath);
        rawDatasetPresent ||= /(?:^|\/)(?:raw[-_]?data(?:set)?)(?:[./_-]|$)|(?:^|\/)random-TP\.xyz$/i.test(observation.classificationPath);
        structureBundlePresent ||= /(?:^|\/)structures(?:\/|\.jsonl$)/i.test(observation.classificationPath);
      }
      const publicObservation = publicPayloadFileObservation(observation);
      if (retainedObservations.length < MAX_RETAINED_PAYLOAD_FILE_OBSERVATIONS) {
        retainedObservations.push(publicObservation);
      } else {
        overflowHash.update(canonicalJsonBytes(publicObservation));
      }
    }
  }
  const metadata = retainedObservations
    .sort(comparePayloadFileObservations)
    .map((observation) => observation);
  const predictionBytes = isMap ? producerScientificPayloadFiles.get(PREDICTION_FILE_PATH) : null;
  const observedNames = [...new Set(metadata.map((entry) => entry.path))].sort(asciiCompare);
  const truncated = observedFileCount > metadata.length;
  const overflowDigest = truncated ? `sha256:${overflowHash.digest('hex')}` : null;
  return {
    producerScientificPayloadEvidenceDigest: sha256(canonicalJsonBytes({
      domain: 'tf.atomistic-full-candidate.producer-scientific-payload/v2',
      observedFileCount,
      retainedFileCount: metadata.length,
      truncated,
      overflowDigest,
      files: metadata,
    })),
    observedFileCount: Math.min(observedFileCount, MAX_RECEIPT_OBSERVED_PAYLOAD_FILES),
    observedFileNames: observedNames.slice(0, 32),
    predictionFileDigest: Buffer.isBuffer(predictionBytes) ? sha256(predictionBytes) : null,
    predictionBytesObserved: Buffer.isBuffer(predictionBytes) ? predictionBytes.length : 0,
    predictionRecordsObserved: observedJsonlRecordCount(predictionBytes),
    producerPayloadReferenceLabelsPresent: referenceLabelsPresent ? true : classificationComplete ? false : null,
    producerRawDatasetPresent: rawDatasetPresent ? true : classificationComplete ? false : null,
    producerStructureBundlePresent: structureBundlePresent ? true : classificationComplete ? false : null,
  };
}

function payloadFileObservation(rawPath, value) {
  const validStringPath = typeof rawPath === 'string' && rawPath.length > 0;
  const pathBytes = validStringPath ? wellFormedUtf8Bytes(rawPath) : null;
  const classificationPath = canonicalPayloadPathBytes(rawPath) === null ? null : rawPath;
  return {
    path: pathBytes
      ? truncateCodePoints(rawPath, 256)
      : validStringPath
        ? '<invalid-utf16-path>'
        : '<empty-or-non-string-path>',
    pathByteLength: pathBytes?.length ?? null,
    pathSha256: pathBytes
      ? sha256(pathBytes)
      : validStringPath
        ? invalidUtf16PathDigest(rawPath)
        : null,
    sizeBytes: Buffer.isBuffer(value) ? value.length : null,
    sha256: Buffer.isBuffer(value) ? sha256(value) : null,
    classificationPath,
  };
}

function publicPayloadFileObservation(observation) {
  return {
    path: observation.path,
    pathByteLength: observation.pathByteLength,
    pathSha256: observation.pathSha256,
    sizeBytes: observation.sizeBytes,
    sha256: observation.sha256,
  };
}

function wellFormedUtf8Bytes(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const bytes = Buffer.from(value, 'utf8');
  return bytes.toString('utf8') === value ? bytes : null;
}

function canonicalPayloadPathBytes(value) {
  if (typeof value !== 'string'
      || value.length === 0
      || value.length > MAX_CLASSIFIABLE_PAYLOAD_PATH_BYTES) return null;
  const bytes = wellFormedUtf8Bytes(value);
  if (!bytes
      || bytes.length > MAX_CLASSIFIABLE_PAYLOAD_PATH_BYTES
      || value.normalize('NFC') !== value
      || value.includes('\\')
      || /[\p{Cc}\p{Cf}]/u.test(value)
      || value.startsWith('/')
      || value.endsWith('/')) return null;
  const components = value.split('/');
  if (components.some((component) => component === '' || component === '.' || component === '..')) {
    return null;
  }
  return bytes;
}

function invalidUtf16PathDigest(value) {
  const codeUnits = Buffer.allocUnsafe(value.length * 2);
  for (let index = 0; index < value.length; index += 1) {
    codeUnits.writeUInt16BE(value.charCodeAt(index), index * 2);
  }
  return sha256(Buffer.concat([
    Buffer.from('tf.atomistic-full-candidate.invalid-utf16-path/v1\0', 'utf8'),
    codeUnits,
  ]));
}

function truncateCodePoints(value, maximum) {
  let result = '';
  let count = 0;
  for (const codePoint of value) {
    if (count >= maximum) break;
    result += codePoint;
    count += 1;
  }
  return result;
}

function comparePayloadFileObservations(left, right) {
  return asciiCompare(left.pathSha256 ?? '', right.pathSha256 ?? '')
    || asciiCompare(left.path, right.path)
    || ((left.sizeBytes ?? -1) - (right.sizeBytes ?? -1))
    || asciiCompare(left.sha256 ?? '', right.sha256 ?? '');
}

function observedJsonlRecordCount(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0 || bytes.length > MAX_FULL_PREDICTION_BYTES) return null;
  let lines = 0;
  for (const byte of bytes) if (byte === 0x0a) lines += 1;
  return lines <= 100_000 ? lines : null;
}

function recordCountsForParsedPayload(parsed, spec, referenceRecords) {
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
    treeDigestProtocol: 'tf.git-source-tree/v1',
    treeDigest: DIGEST_PATTERN.test(source?.treeDigest ?? '') ? source.treeDigest : sha256(Buffer.from('source-tree-unavailable', 'utf8')),
  };
}

function normalizeTimestamp(value, errors) {
  if (validUtcTimestamp(value)) return value;
  errors.push('candidate creation timestamp is invalid');
  return '2000-01-01T00:00:00Z';
}

function validUtcTimestamp(value) {
  if (typeof value !== 'string') return false;
  const match = TIMESTAMP_PATTERN.exec(value);
  if (!match) return false;
  const components = value.match(
    /^(20[0-9]{2})-([0-9]{2})-([0-9]{2})T([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.[0-9]{1,6})?Z$/,
  );
  if (!components) return false;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText] = components;
  const [year, month, day, hour, minute, second] = [
    yearText, monthText, dayText, hourText, minuteText, secondText,
  ].map(Number);
  if (month < 1 || month > 12 || hour > 23 || minute > 59 || second > 59) return false;
  const observed = new Date(Date.UTC(year, month - 1, day, hour, minute, second));
  return observed.getUTCFullYear() === year
    && observed.getUTCMonth() === month - 1
    && observed.getUTCDate() === day
    && observed.getUTCHours() === hour
    && observed.getUTCMinutes() === minute
    && observed.getUTCSeconds() === second;
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
  if (isPlainObject(partition?.rejectedProducerScientificPayload)) {
    const names = partition.rejectedProducerScientificPayload.observedFileNames;
    if (Array.isArray(names) && !isDeepStrictEqual(names, [...new Set(names)].sort(asciiCompare))) {
      errors.push(`${partition.model ?? 'unknown'} rejected producer scientific payload file names are not uniquely ASCII sorted`);
    }
    if (Array.isArray(names)
        && Number.isSafeInteger(partition.rejectedProducerScientificPayload.observedFileCount)
        && partition.rejectedProducerScientificPayload.observedFileCount < names.length) {
      errors.push(`${partition.model ?? 'unknown'} rejected producer scientific payload file count is smaller than its retained names`);
    }
  }
  if (partition?.status === 'complete' && isPlainObject(partition.producerScientificPayload)) {
    const expected = completeProducerScientificPayloadEvidenceDigest(
      partition.producerScientificPayload,
    );
    if (partition.producerScientificPayload.producerScientificPayloadEvidenceDigest !== expected) {
      errors.push(`${partition.model ?? 'unknown'} complete producer scientific payload evidence digest is inconsistent`);
    }
  }
}

function completeProducerScientificPayloadEvidenceDigest(producerScientificPayload) {
  const metadata = [
    {
      path: STRUCTURE_MANIFEST_FILE_PATH,
      pathByteLength: Buffer.byteLength(STRUCTURE_MANIFEST_FILE_PATH, 'utf8'),
      pathSha256: sha256(Buffer.from(STRUCTURE_MANIFEST_FILE_PATH, 'utf8')),
      sizeBytes: EXPECTED_STRUCTURE_MANIFEST_FILE_BYTES,
      sha256: producerScientificPayload.producerStructureManifestFileDigest,
    },
    {
      path: PREDICTION_FILE_PATH,
      pathByteLength: Buffer.byteLength(PREDICTION_FILE_PATH, 'utf8'),
      pathSha256: sha256(Buffer.from(PREDICTION_FILE_PATH, 'utf8')),
      sizeBytes: producerScientificPayload.predictionBytes,
      sha256: producerScientificPayload.predictionFileDigest,
    },
  ].sort(comparePayloadFileObservations);
  return sha256(canonicalJsonBytes({
    domain: 'tf.atomistic-full-candidate.producer-scientific-payload/v2',
    observedFileCount: metadata.length,
    retainedFileCount: metadata.length,
    truncated: false,
    overflowDigest: null,
    files: metadata,
  }));
}

function validateVerifierDerivedStructureCommitment(commitment, verification, errors) {
  const verified = {
    status: 'verified',
    authority: 'independent-label-bearing-verifier',
    derivationProtocol: 'deterministic-label-stripping-from-frozen-raw-dataset/v1',
    rawDatasetDigest: EXPECTED_FROZEN_BINDINGS.datasetDigest,
    structureManifestDigest: EXPECTED_FROZEN_BINDINGS.structureManifestDigest,
    regeneratedStructureBundleDigest: EXPECTED_STRUCTURE_BUNDLE_DIGEST,
    regeneratedStructureBundleBytes: EXPECTED_STRUCTURE_BUNDLE_BYTES,
    producerStructureBundleAttributed: false,
  };
  const unavailable = unavailableVerifierDerivedStructureCommitment();
  if (!isDeepStrictEqual(commitment, verified) && !isDeepStrictEqual(commitment, unavailable)) {
    errors.push('verifier-derived structure commitment differs from the frozen deterministic forms');
  }
  if (verification?.frozenBindingsVerified === true && !isDeepStrictEqual(commitment, verified)) {
    errors.push('verified frozen bindings lack the independently derived structure commitment');
  }
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

function rows(values, width) {
  return Array.from(
    { length: values.length / width },
    (_, index) => values.slice(index * width, (index + 1) * width),
  );
}

function canonicalPythonStructureRecordBytes(record) {
  const lattice = pythonFloatMatrix(rows(record.lattice, 3));
  const positions = pythonFloatMatrix(rows(record.positions, 3));
  const line = `{"atomCount":${record.atomCount},"atomicNumbers":${JSON.stringify(record.atomicNumbers)},"id":${JSON.stringify(record.id)},"inputStructureDigest":${JSON.stringify(record.inputStructureDigest)},"lattice":${lattice},"pbc":[true,true,true],"positions":${positions},"schemaVersion":"tf.atomistic-structure/0.1"}\n`;
  return Buffer.from(line, 'utf8');
}

function pythonFloatMatrix(matrix) {
  return `[${matrix.map((row) => `[${row.map(pythonFloatLiteral).join(',')}]`).join(',')}]`;
}

function pythonFloatLiteral(value) {
  if (!Number.isFinite(value)) throw new Error('structure geometry contains a nonfinite value');
  if (Object.is(value, -0)) return '-0.0';
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude < 1e-4 || magnitude >= 1e16)) {
    return normalizePythonExponent(value.toExponential());
  }
  if (Number.isInteger(value) && Math.abs(value) < 1e16) return `${value}.0`;
  const text = String(value);
  return /[eE]/.test(text) ? normalizePythonExponent(text) : text;
}

function normalizePythonExponent(text) {
  const exponent = text.match(/^(.+)[eE]([+-]?)([0-9]+)$/);
  if (!exponent) return text;
  const sign = exponent[2] === '-' ? '-' : '+';
  return `${exponent[1]}e${sign}${exponent[3].padStart(2, '0')}`;
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
      && evidence.producerScientificPayloadFiles instanceof Map
      && evidence.producerScientificPayloadFiles.size <= MAX_AUTHORITATIVE_PAYLOAD_FILES
      && [...evidence.producerScientificPayloadFiles.entries()]
        .every(([name, bytes]) => canonicalPayloadPathBytes(name) !== null
          && Buffer.isBuffer(bytes)
          && bytes.length <= MAX_AUTHORITATIVE_PAYLOAD_FILE_BYTES)
      && [...evidence.producerScientificPayloadFiles.values()]
        .reduce((sum, bytes) => sum + bytes.length, 0) <= MAX_AUTHORITATIVE_PAYLOAD_TOTAL_BYTES)
    && validSource(value.source)
    && validUtcTimestamp(value.createdAt);
}

function validSource(value) {
  return isDictionary(value)
    && isDeepStrictEqual(Object.keys(value).sort(asciiCompare), SOURCE_KEYS)
    && value.repository === EXPECTED_REPOSITORY
    && value.repositoryId === EXPECTED_REPOSITORY_ID
    && SHA_PATTERN.test(value.revision ?? '')
    && value.treeDigestProtocol === 'tf.git-source-tree/v1'
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
