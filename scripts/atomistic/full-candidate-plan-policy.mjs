import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  EXPECTED_STABLE_INPUTS,
  computeBootstrapStableInputsCommitment,
} from './bootstrap-replica-receipt-policy.mjs';
import {
  canonicalJson,
  parseJsonRejectingDuplicateMembers,
  recomputeRuntimeSourceIdentity,
} from './runtime-lock-policy.mjs';
import {
  FULL_CANDIDATE_PRODUCER_OUTCOME_SCHEMA_PATH,
  FULL_CANDIDATE_PRODUCER_OUTCOME_SCHEMA_RAW_DIGEST,
} from './full-candidate-producer-outcome-policy.mjs';

export {
  FULL_CANDIDATE_PRODUCER_OUTCOME_SCHEMA_PATH,
  FULL_CANDIDATE_PRODUCER_OUTCOME_SCHEMA_RAW_DIGEST,
};

export const FULL_CANDIDATE_PLAN_PATH = 'evaluation/atomistic/full-candidate-plan.json';
export const FULL_CANDIDATE_PLAN_SCHEMA_PATH = 'schemas/atomistic-full-candidate-plan.schema.json';
export const FULL_CANDIDATE_RECEIPT_SCHEMA_PATH = 'schemas/atomistic-full-candidate-receipt.schema.json';
export const FULL_CANDIDATE_PLAN_RAW_DIGEST = 'sha256:22a32d92a2c094c86f1978f066b631c503a8775e6e846831dcca5dde4376fe4b';
export const FULL_CANDIDATE_PLAN_SEMANTIC_DIGEST = 'sha256:825412a4d0bd4ba337d2cbf28edfbad6cf3bfbd5f4a62a7f4e0754ad1d27a570';
export const FULL_CANDIDATE_PLAN_SCHEMA_RAW_DIGEST = 'sha256:659cd4a6ca3d2cde790fbc9ad199ef6d6b4893ba61442e6809c72f570ba7c474';
export const FULL_CANDIDATE_RECEIPT_SCHEMA_RAW_DIGEST = 'sha256:f6dfdec4d81bd1467ec459f6e0153dee5fe877a17819de4704c0ae189dcc70aa';
export const FULL_CANDIDATE_DATASET_CATALOG_FROZEN_AT = '2026-08-30';

const SCIENTIFIC_PLAN_PATH = 'evaluation/atomistic/reproduction-plan.json';
const RUNTIME_LOCK_PATH = 'evaluation/atomistic/runtime-lock.json';
const RANDOM_TP_ID_MANIFEST_PATH = 'evaluation/atomistic/random-tp-id-manifest.txt';
const DATASET_CATALOG_PATH = 'evaluation/data/datasets.json';
const SCIENTIFIC_PLAN_RAW_DIGEST = 'sha256:d3a58524029b51c598d00a7bb9f60b6479a9973a0f9907cbf94a31e61bf1c9c2';
const RUNTIME_LOCK_RAW_DIGEST = 'sha256:b8c352aacfef3f74210d2dbf2002400887e35d21670f5f93da6a8003670bafa1';
const RANDOM_TP_ID_MANIFEST_RAW_DIGEST = 'sha256:4df1ba7cda1b0a31cdb0b3e2281ed535327d7b92ce381cd930c781cc8b800f91';

export const EXPECTED_FULL_CANDIDATE_BINDINGS = deepFreeze({
  scientificPlan: {
    path: SCIENTIFIC_PLAN_PATH,
    schemaVersion: 'tf.atomistic-reproduction/0.2',
    rawDigest: SCIENTIFIC_PLAN_RAW_DIGEST,
  },
  producerOutcomeSchema: {
    path: FULL_CANDIDATE_PRODUCER_OUTCOME_SCHEMA_PATH,
    schemaVersion: 'tf.atomistic-full-candidate-producer-outcome/0.2',
    rawDigest: FULL_CANDIDATE_PRODUCER_OUTCOME_SCHEMA_RAW_DIGEST,
  },
  runtimeLock: {
    path: RUNTIME_LOCK_PATH,
    schemaVersion: 'tf.atomistic-runtime-lock/0.3',
    rawDigest: RUNTIME_LOCK_RAW_DIGEST,
    stableInputsCommitment: 'sha256:b4183913307ca0810813c66a3963de1cb20f63ae2000121f9d1016eac94fbfcb',
    sourceManifestDigest: 'sha256:08b1ed2ae239ce5732cf565b5e7bd814727a99ad6e1e1a29aeaa21ea1ed529a1',
    materializationDigest: 'sha256:345d5e55227bbe873d567f5ea72b88db1f21c1d46e72f078db38e6a455d47721',
    runnerDigest: 'sha256:d6e83640f15926088c116312c27605570f9e9c8ba4e9a9988ef5bf4d3a974ed4',
    modelRuntimeIdentities: {
      mattersim: {
        dependencyLockDigest: 'sha256:9c990909d1307bb32608d31b9ed217d2368c28e2048f6dec39e8dc4a2b63642b',
        runtimeInputManifestDigest: 'sha256:203acc5ec09c2e76a819ff384573c2c0aca1316f90c53f2e735c98e9daab5c53',
      },
      mace: {
        dependencyLockDigest: 'sha256:ae4b21b6f6d8ad98edcf2d5e0d938cd563379f494cce0b4aaa2e987332147e33',
        runtimeInputManifestDigest: 'sha256:6bb7f79c5380bb54b0d5ff972c3f22cc27623d131291d3a7c1b2c4efff826f47',
      },
    },
    ociPromotionTrustRootsAvailable: false,
  },
  benchmark: {
    id: 'mattersim-random-tp',
    datasetDigest: 'sha256:c14473dcf4bd71e1ed11556ac9ff12b68e7a423d813f939bc9eedaef663054d9',
    idSetDigest: RANDOM_TP_ID_MANIFEST_RAW_DIGEST,
    idManifestPath: RANDOM_TP_ID_MANIFEST_PATH,
    recordManifestDigest: 'sha256:6afbbdc0cd745efaca4bf5d7a2a7604db9f1d1f59749b86d3c0a51d48f07893a',
    recordManifestProtocol: 'tf.random-tp.record-manifest/v1',
    structureManifestDigest: 'sha256:b0a94b5424f9d4a2be7519265b8dbe89a478fa5b21a6c956c70ffe0c705078f7',
    structureManifestProtocol: 'tf.atomistic-structure-manifest/v1',
    labelManifestDigest: 'sha256:a0eda4ac1c7720002a32f42f91c635bf8398b93c02846fb83ae97437e3e8422f',
    labelManifestProtocol: 'tf.random-tp.reference-label-manifest/v1',
    frames: 693,
    atoms: 11_088,
    elements: 89,
    atomsPerFrame: 16,
    redistributionAllowed: false,
  },
});

export const EXPECTED_FULL_CANDIDATE_PARTITIONS = deepFreeze([
  {
    partitionId: 'mattersim-full-000',
    model: 'mattersim',
    modelId: 'mattersim-v1.0.0-5m',
    selection: 'all-693-ids-from-frozen-manifest-in-ascii-order',
    expectedRecords: 693,
    partitionIndex: 0,
    partitionCount: 1,
  },
  {
    partitionId: 'mace-full-000',
    model: 'mace',
    modelId: 'mace-mpa-0-medium',
    selection: 'all-693-ids-from-frozen-manifest-in-ascii-order',
    expectedRecords: 693,
    partitionIndex: 0,
    partitionCount: 1,
  },
]);

export const EXPECTED_FULL_CANDIDATE_METRICS = deepFreeze({
  definitionId: 'mattersim-model-card-frobenius/v1',
  energyError: 'absolute-total-energy-error-divided-by-frame-atom-count',
  forceError: 'mean-per-atom-l2-vector-error-per-frame',
  stressGateError: 'full-3x3-frobenius-error-in-gpa-per-frame',
  stressDiagnostics: ['spectral-norm', 'unweighted-voigt6-l2', 'six-component-mae'],
  evA3ToGpa: 160.21766208,
  aggregation: 'equal-weight-structure-mean-float64',
  summation: 'ascii-id-order-python-3.12-math-fsum-divide-by-693/v1',
  quantileMethod: 'Hyndman-Fan-7-linear',
  quantiles: [0.5, 0.9, 0.95, 0.99],
  reportedStatistics: ['mean', 'p50', 'p90', 'p95', 'p99', 'worst'],
  worstTieBreak: 'error-descending-then-ascii-id-ascending',
  perIdMetricEvidenceRootProtocol: 'sha256-merkle-canonical-json-array-model-id-metric-id-error-ascii-id-order-duplicate-id-forbidden/v1',
  binary64MetricEvidenceRootProtocol: 'sha256-merkle-domain-separated-model-id-metric-id-ieee754-binary64-little-endian-ascii-id-order-duplicate-id-forbidden/v1',
});

export const EXPECTED_FULL_CANDIDATE_ACCEPTANCE = deepFreeze({
  completeness: {
    requiredModels: 2,
    requiredRecordsPerModel: 693,
    requiredTotalPredictions: 1_386,
    allowedMissing: 0,
    allowedExtra: 0,
    allowedDuplicate: 0,
    allowedFailed: 0,
    allowedNonfinite: 0,
  },
  mattersim: {
    model: 'mattersim',
    assessment: 'protocol-equivalent-model-card-interval-check',
    conjunction: 'energy-and-force-and-stress',
    targets: {
      energyMaeEvPerAtom: 0.199,
      forceVectorMaeEvPerAngstrom: 0.824,
      stressFrobeniusMaeGpa: 1.999,
    },
    acceptedIntervals: {
      energyMaeEvPerAtom: [0.19502, 0.20298],
      forceVectorMaeEvPerAngstrom: [0.80752, 0.84048],
      stressFrobeniusMaeGpa: [1.95902, 2.03898],
    },
    officialOrBitExactClaimAllowed: false,
  },
  mace: {
    model: 'mace',
    assessment: 'blind-engineering-baseline',
    publishedRandomTpTargetAvailable: false,
    fitOffsetScaleOrSignAfterObservationAllowed: false,
    superiorityClaimAllowed: false,
  },
});

export const EXPECTED_FULL_CANDIDATE_CLAIMS = deepFreeze({
  claimEligible: false,
  promotionEligible: false,
  comparisonEligible: false,
  reproductionEligible: false,
  reproduced: false,
  superiorityClaimAllowed: false,
});

export const EXPECTED_FULL_CANDIDATE_CLAIM_BOUNDARIES = deepFreeze({
  randomTpIsMatbenchWbm: false,
  matterSimInterpretation: 'frozen-frobenius-protocol-equivalent-only',
  maceInterpretation: 'blind-engineering-baseline-only',
  currentSotaClaimAllowed: false,
  experimentalGroundTruthClaimAllowed: false,
  industrialFitnessClaimAllowed: false,
  crossModelSuperiorityClaimAllowed: false,
});

export const EXPECTED_FULL_CANDIDATE_PENDING_GATES = deepFreeze([
  'two independent protected-main full-candidate receipts with durable attestations',
  '40 invariance checks per model',
  '89 force finite-difference checks per model',
  '60 stress finite-difference checks per model',
  'versioned multi-producer hardware and run-attempt receipt semantics',
  'registry-addressable OCI manifest and config trust roots',
  'atomic-number disclosure and public producer-payload redistribution license clearance',
]);

const EXPECTED_EXECUTION = deepFreeze({
  profile: 'full-candidate',
  mode: 'full',
  canonicalDevice: 'cpu',
  dtype: 'float32',
  batchSize: 1,
  threads: 1,
  networkPolicy: 'fetch-online-build-and-run-offline',
  trustedPreprocessorReferenceLabelAccess: true,
  modelSandboxReferenceLabelAccess: false,
  independentVerifierReferenceLabelAccess: true,
  producerScientificPayloadPolicy: {
    exactPaths: [
      'manifests/structures.manifest.json',
      'predictions/predictions.jsonl',
    ],
    scientificArtifactUsesExactPayload: true,
    administrativeEvidenceSeparated: true,
    rawDatasetIncluded: false,
    structureBundleIncluded: false,
    referenceLabelsIncluded: false,
    atomicNumbersIncluded: true,
    atomicNumbersPublicationLicenseCleared: false,
    publicationEligible: false,
    structureCommitmentAuthority: 'independent-verifier-derived-from-frozen-raw-dataset',
  },
  mixedRunAttemptsAllowed: false,
  partitioning: {
    partitionKey: 'model',
    currentStrategy: 'one-complete-id-set-partition-per-model',
    futureShardingPolicy: 'A future record-sharded run requires a new versioned plan and receipt contract; this plan forbids mixing shards, hardware identities or run attempts.',
    partitions: EXPECTED_FULL_CANDIDATE_PARTITIONS,
  },
});

const EXPECTED_RESULT_POLICY = deepFreeze({
  allowedOutcomes: ['complete-pass', 'complete-fail', 'incomplete'],
  completePass: 'Both model partitions contain exactly 693 valid predictions and the independently recomputed MatterSim means pass all three frozen intervals.',
  completeFail: 'Both model partitions contain exactly 693 valid predictions and independent metrics are complete, but at least one frozen MatterSim interval fails.',
  incomplete: 'At least one model partition is absent, cancelled, failed, partial, corrupt or otherwise cannot support all frozen metrics; available failure evidence must be retained.',
  claims: EXPECTED_FULL_CANDIDATE_CLAIMS,
});

const EXPECTED_RANDOM_TP_CATALOG_ENTRY = deepFreeze({
  id: 'mattersim-random-tp',
  access: 'anonymous fixed-revision raw download',
  license: 'NOASSERTION: the file is in the MIT-licensed MatterSim repository, but no dataset-specific provenance or redistribution grant is supplied',
  redistribute: false,
  source: 'https://raw.githubusercontent.com/microsoft/mattersim/40a1eb8f1189a53af310957b4f2c5dfbfe68d647/data/benchmarks/random-TP.xyz',
  sourceCommit: '40a1eb8f1189a53af310957b4f2c5dfbfe68d647',
  sizeBytes: 1_514_015,
  sha256: EXPECTED_FULL_CANDIDATE_BINDINGS.benchmark.datasetDigest,
  frames: 693,
  atoms: 11_088,
  elements: 89,
  atomsPerFrame: 16,
  idSetSha256: EXPECTED_FULL_CANDIDATE_BINDINGS.benchmark.idSetDigest,
  recordManifestSha256: EXPECTED_FULL_CANDIDATE_BINDINGS.benchmark.recordManifestDigest,
  structureManifestSha256: EXPECTED_FULL_CANDIDATE_BINDINGS.benchmark.structureManifestDigest,
  labelManifestSha256: EXPECTED_FULL_CANDIDATE_BINDINGS.benchmark.labelManifestDigest,
  manifestProtocols: {
    record: EXPECTED_FULL_CANDIDATE_BINDINGS.benchmark.recordManifestProtocol,
    structure: EXPECTED_FULL_CANDIDATE_BINDINGS.benchmark.structureManifestProtocol,
    label: EXPECTED_FULL_CANDIDATE_BINDINGS.benchmark.labelManifestProtocol,
  },
  requiredProvenance: [
    'source_commit',
    'raw_sha256',
    'internal_id',
    'input_structure_digest',
    'reference_label_digest',
    'scientific_record_digest',
  ],
});

const CLAIM_BOOLEAN_KEYS = new Set([
  'claimEligible',
  'promotionEligible',
  'comparisonEligible',
  'reproductionEligible',
  'reproduced',
  'superiorityClaimAllowed',
  'officialOrBitExactClaimAllowed',
  'currentSotaClaimAllowed',
  'experimentalGroundTruthClaimAllowed',
  'industrialFitnessClaimAllowed',
  'crossModelSuperiorityClaimAllowed',
]);

const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

export function inspectFullCandidatePlanBytes(bytes, { enforceCheckedInBytes = true } = {}) {
  const buffer = toBuffer(bytes);
  const rawDigest = sha256(buffer);
  const failures = [];
  let plan = null;
  let semanticDigest = null;
  try {
    plan = parseJsonRejectingDuplicateMembers(buffer);
    semanticDigest = sha256(Buffer.from(canonicalJson(plan), 'utf8'));
  } catch (error) {
    failures.push(`candidate-plan.raw: invalid or duplicate-member JSON (${message(error)})`);
  }
  if (enforceCheckedInBytes && rawDigest !== FULL_CANDIDATE_PLAN_RAW_DIGEST) {
    failures.push('candidate-plan.raw: frozen byte digest mismatch');
  }
  return { plan, rawDigest, semanticDigest, failures };
}

export function validateFullCandidatePlanSchema(plan, schema) {
  const failures = [];
  try {
    const ajv = new Ajv2020({
      allErrors: true,
      strict: true,
      validateFormats: false,
      validateSchema: true,
    });
    const validate = ajv.compile(schema);
    if (!validate(plan)) failures.push(`candidate-plan.schema: ${JSON.stringify(validate.errors)}`);
  } catch (error) {
    failures.push(`candidate-plan.schema: strict AJV compilation failed (${message(error)})`);
  }
  return failures;
}

export function validateFullCandidatePlanSemantics(plan) {
  const failures = [];
  if (!plan || typeof plan !== 'object' || Array.isArray(plan)) return ['candidate-plan.semantic: root must be an object'];
  let semanticDigest = null;
  try { semanticDigest = sha256(Buffer.from(canonicalJson(plan), 'utf8')); }
  catch (error) { failures.push(`candidate-plan.semantic: canonicalization failed (${message(error)})`); }
  if (semanticDigest !== FULL_CANDIDATE_PLAN_SEMANTIC_DIGEST) failures.push('candidate-plan.semantic: exact frozen contract digest mismatch');

  compare(failures, 'candidate-plan.schemaVersion', plan.schemaVersion, 'tf.atomistic-full-candidate-plan/0.2');
  compare(failures, 'candidate-plan.status', plan.status, 'frozen-candidate-contract-not-run');
  compare(failures, 'candidate-plan.frozenAt', plan.frozenAt, '2026-08-30');
  compare(failures, 'candidate-plan.bindings', plan.bindings, EXPECTED_FULL_CANDIDATE_BINDINGS);
  compare(failures, 'candidate-plan.execution', plan.execution, EXPECTED_EXECUTION);
  compare(failures, 'candidate-plan.partitions', plan.execution?.partitioning?.partitions, EXPECTED_FULL_CANDIDATE_PARTITIONS);
  compare(failures, 'candidate-plan.metrics', plan.metrics, EXPECTED_FULL_CANDIDATE_METRICS);
  compare(failures, 'candidate-plan.acceptance', plan.acceptance, EXPECTED_FULL_CANDIDATE_ACCEPTANCE);
  compare(failures, 'candidate-plan.resultPolicy', plan.resultPolicy, EXPECTED_RESULT_POLICY);
  compare(failures, 'candidate-plan.claims', plan.resultPolicy?.claims, EXPECTED_FULL_CANDIDATE_CLAIMS);
  compare(failures, 'candidate-plan.claimBoundaries', plan.claimBoundaries, EXPECTED_FULL_CANDIDATE_CLAIM_BOUNDARIES);
  compare(failures, 'candidate-plan.scientificGatesPending', plan.scientificGatesPending, EXPECTED_FULL_CANDIDATE_PENDING_GATES);
  rejectPositiveCandidateClaims(plan, failures);
  return failures;
}

export function validateFullCandidateIdManifest(bytes, plan) {
  const buffer = toBuffer(bytes);
  const failures = [];
  const actualDigest = sha256(buffer);
  compare(failures, 'candidate-plan.id-manifest.rawDigest', actualDigest, RANDOM_TP_ID_MANIFEST_RAW_DIGEST);
  compare(failures, 'candidate-plan.id-manifest.binding', plan?.bindings?.benchmark?.idSetDigest, actualDigest);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(buffer); }
  catch (error) { return [...failures, `candidate-plan.id-manifest: invalid UTF-8 (${message(error)})`]; }
  if (!text.endsWith('\n') || text.endsWith('\n\n') || text.includes('\r')) {
    failures.push('candidate-plan.id-manifest: exactly one final LF and no CR are required');
    return failures;
  }
  const ids = text.slice(0, -1).split('\n');
  if (ids.length !== 693) failures.push('candidate-plan.id-manifest: exactly 693 IDs are required');
  const seen = new Set();
  ids.forEach((id, index) => {
    if (!/^random-TP-[0-9]{6}$/.test(id)) failures.push(`candidate-plan.id-manifest[${index}]: malformed ASCII ID`);
    if (seen.has(id)) failures.push(`candidate-plan.id-manifest[${index}]: duplicate ID`);
    if (index > 0 && ids[index - 1] >= id) failures.push(`candidate-plan.id-manifest[${index}]: IDs are not strictly ASCII sorted`);
    seen.add(id);
  });
  return failures;
}

export async function validateFullCandidatePlanRepository(planBytes, {
  root = process.cwd(),
  enforceCheckedInBytes = true,
  fileOverrides = {},
} = {}) {
  const inspection = inspectFullCandidatePlanBytes(planBytes, { enforceCheckedInBytes });
  const failures = [...inspection.failures];
  const plan = inspection.plan;
  if (!plan) return { ...inspection, failures };
  failures.push(...validateFullCandidatePlanSemantics(plan));

  const readPolicyFile = async (relativePath) => {
    if (Object.hasOwn(fileOverrides, relativePath)) return toBuffer(fileOverrides[relativePath]);
    return readFile(path.join(root, relativePath));
  };
  let schemaBytes;
  let receiptSchemaBytes;
  let producerOutcomeSchemaBytes;
  let scientificPlanBytes;
  let runtimeLockBytes;
  let idManifestBytes;
  let catalogBytes;
  try {
    [schemaBytes, receiptSchemaBytes, producerOutcomeSchemaBytes, scientificPlanBytes, runtimeLockBytes, idManifestBytes, catalogBytes] = await Promise.all([
      readPolicyFile(FULL_CANDIDATE_PLAN_SCHEMA_PATH),
      readPolicyFile(FULL_CANDIDATE_RECEIPT_SCHEMA_PATH),
      readPolicyFile(FULL_CANDIDATE_PRODUCER_OUTCOME_SCHEMA_PATH),
      readPolicyFile(SCIENTIFIC_PLAN_PATH),
      readPolicyFile(RUNTIME_LOCK_PATH),
      readPolicyFile(RANDOM_TP_ID_MANIFEST_PATH),
      readPolicyFile(DATASET_CATALOG_PATH),
    ]);
  } catch (error) {
    failures.push(`candidate-plan.repository: required bound file unavailable (${message(error)})`);
    return { ...inspection, failures };
  }

  compare(failures, 'candidate-plan.schema.rawDigest', sha256(schemaBytes), FULL_CANDIDATE_PLAN_SCHEMA_RAW_DIGEST);
  const schema = parseBoundJson(schemaBytes, 'candidate-plan.schema', failures);
  if (schema) failures.push(...validateFullCandidatePlanSchema(plan, schema));
  compare(failures, 'candidate-receipt.schema.rawDigest', sha256(receiptSchemaBytes), FULL_CANDIDATE_RECEIPT_SCHEMA_RAW_DIGEST);
  const receiptSchema = parseBoundJson(receiptSchemaBytes, 'candidate-receipt.schema', failures);
  if (receiptSchema) failures.push(...validateFullCandidateReceiptSchema(receiptSchema));
  compare(
    failures,
    'candidate-producer-outcome.schema.rawDigest',
    sha256(producerOutcomeSchemaBytes),
    FULL_CANDIDATE_PRODUCER_OUTCOME_SCHEMA_RAW_DIGEST,
  );
  compareBoundRawDigest(
    failures,
    'candidate-plan.producer-outcome-schema',
    producerOutcomeSchemaBytes,
    plan.bindings?.producerOutcomeSchema?.rawDigest,
    FULL_CANDIDATE_PRODUCER_OUTCOME_SCHEMA_RAW_DIGEST,
  );
  const producerOutcomeSchema = parseBoundJson(
    producerOutcomeSchemaBytes,
    'candidate-producer-outcome.schema',
    failures,
  );
  if (producerOutcomeSchema) failures.push(...validateFullCandidateReceiptSchema(
    producerOutcomeSchema,
    'candidate-producer-outcome.schema',
  ));

  compareBoundRawDigest(failures, 'candidate-plan.scientific-plan', scientificPlanBytes, plan.bindings?.scientificPlan?.rawDigest, SCIENTIFIC_PLAN_RAW_DIGEST);
  const scientificPlan = parseBoundJson(scientificPlanBytes, 'candidate-plan.scientific-plan', failures);
  if (scientificPlan) compare(failures, 'candidate-plan.scientific-plan.schemaVersion', scientificPlan.schemaVersion, plan.bindings.scientificPlan.schemaVersion);

  compareBoundRawDigest(failures, 'candidate-plan.runtime-lock', runtimeLockBytes, plan.bindings?.runtimeLock?.rawDigest, RUNTIME_LOCK_RAW_DIGEST);
  const runtimeLock = parseBoundJson(runtimeLockBytes, 'candidate-plan.runtime-lock', failures);
  if (runtimeLock) compare(failures, 'candidate-plan.runtime-lock.schemaVersion', runtimeLock.schemaVersion, plan.bindings.runtimeLock.schemaVersion);

  failures.push(...validateFullCandidateIdManifest(idManifestBytes, plan));
  const catalog = parseBoundJson(catalogBytes, 'candidate-plan.dataset-catalog', failures);
  if (catalog) validateRandomTpCatalog(catalog, plan, failures);
  if (scientificPlan) validateScientificPlanProjection(scientificPlan, plan, failures);
  if (runtimeLock) await validateRuntimeProjection(runtimeLock, plan, failures, root);
  return { ...inspection, failures };
}

function validateFullCandidateReceiptSchema(schema, label = 'candidate-receipt.schema') {
  try {
    new Ajv2020({ allErrors: true, strict: true, validateFormats: false, validateSchema: true }).compile(schema);
    return [];
  } catch (error) {
    return [`${label}: strict AJV compilation failed (${message(error)})`];
  }
}

function validateRandomTpCatalog(catalog, plan, failures) {
  compare(failures, 'candidate-plan.dataset-catalog.schemaVersion', catalog.schemaVersion, 'tf.dataset-catalog/0.1');
  compare(failures, 'candidate-plan.dataset-catalog.frozenAt', catalog.frozenAt, FULL_CANDIDATE_DATASET_CATALOG_FROZEN_AT);
  const matches = Array.isArray(catalog.datasets)
    ? catalog.datasets.filter((dataset) => dataset?.id === EXPECTED_RANDOM_TP_CATALOG_ENTRY.id)
    : [];
  if (matches.length !== 1) {
    failures.push('candidate-plan.dataset-catalog: exactly one Random-TP entry is required');
    return;
  }
  compare(failures, 'candidate-plan.dataset-catalog.random-tp', matches[0], EXPECTED_RANDOM_TP_CATALOG_ENTRY);
  if (!matches[0].license.startsWith('NOASSERTION:') || matches[0].redistribute !== false) {
    failures.push('candidate-plan.dataset-catalog.random-tp: NOASSERTION and redistribute=false are mandatory');
  }
  const binding = plan.bindings.benchmark;
  compare(failures, 'candidate-plan.dataset-catalog.datasetDigest', matches[0].sha256, binding.datasetDigest);
  compare(failures, 'candidate-plan.dataset-catalog.idSetDigest', matches[0].idSetSha256, binding.idSetDigest);
  compare(failures, 'candidate-plan.dataset-catalog.recordManifestDigest', matches[0].recordManifestSha256, binding.recordManifestDigest);
  compare(failures, 'candidate-plan.dataset-catalog.structureManifestDigest', matches[0].structureManifestSha256, binding.structureManifestDigest);
  compare(failures, 'candidate-plan.dataset-catalog.labelManifestDigest', matches[0].labelManifestSha256, binding.labelManifestDigest);
}

function validateScientificPlanProjection(scientificPlan, candidatePlan, failures) {
  const matches = Array.isArray(scientificPlan.benchmarks)
    ? scientificPlan.benchmarks.filter((benchmark) => benchmark?.id === 'mattersim-random-tp')
    : [];
  if (matches.length !== 1) {
    failures.push('candidate-plan.scientific-plan: exactly one Random-TP benchmark is required');
    return;
  }
  const benchmark = matches[0];
  const binding = candidatePlan.bindings.benchmark;
  compare(failures, 'candidate-plan.scientific-plan.datasetDigest', benchmark.artifact?.sha256, binding.datasetDigest);
  compare(failures, 'candidate-plan.scientific-plan.idSetDigest', benchmark.artifact?.idSetSha256, binding.idSetDigest);
  compare(failures, 'candidate-plan.scientific-plan.recordManifestDigest', benchmark.artifact?.recordManifestSha256, binding.recordManifestDigest);
  compare(failures, 'candidate-plan.scientific-plan.frames', benchmark.artifact?.frames, binding.frames);
  compare(failures, 'candidate-plan.scientific-plan.atoms', benchmark.artifact?.atoms, binding.atoms);
  compare(failures, 'candidate-plan.scientific-plan.elements', benchmark.artifact?.elements, binding.elements);
  compare(failures, 'candidate-plan.scientific-plan.atomsPerFrame', benchmark.artifact?.atomsPerFrame, binding.atomsPerFrame);
  if (benchmark.redistribute !== false) failures.push('candidate-plan.scientific-plan: Random-TP redistribution must remain disabled');
}

async function validateRuntimeProjection(runtimeLock, candidatePlan, failures, root) {
  const binding = candidatePlan.bindings.runtimeLock;
  const recomputedStableCommitment = computeBootstrapStableInputsCommitment(EXPECTED_STABLE_INPUTS);
  compare(failures, 'candidate-plan.runtime-lock.stableInputsCommitment', binding.stableInputsCommitment, recomputedStableCommitment);
  compare(failures, 'candidate-plan.runtime-lock.freezeEvidence.stableInputsCommitment', runtimeLock.freezeEvidence?.sourceReceipt?.stableInputsCommitment, recomputedStableCommitment);
  for (const [index, observation] of (runtimeLock.replication?.observations ?? []).entries()) {
    compare(failures, `candidate-plan.runtime-lock.replication[${index}].stableInputsCommitment`, observation.stableInputsCommitment, recomputedStableCommitment);
  }

  compare(failures, 'candidate-plan.runtime-lock.sourceManifestDigest', runtimeLock.runtimeSource?.sourceManifestDigest, binding.sourceManifestDigest);
  compare(failures, 'candidate-plan.runtime-lock.materializationDigest', runtimeLock.runtimeSource?.materializationDigest, binding.materializationDigest);
  compare(failures, 'candidate-plan.runtime-lock.runnerDigest', runtimeLock.identities?.runnerDigest, binding.runnerDigest);
  compare(failures, 'candidate-plan.runtime-lock.ociPromotionTrustRootsAvailable', binding.ociPromotionTrustRootsAvailable, false);
  compare(failures, 'candidate-plan.runtime-lock.ociPromotionTrustRoot', runtimeLock.identities?.ociImages?.promotionTrustRoot, false);
  for (const model of ['mattersim', 'mace']) {
    compare(failures, `candidate-plan.runtime-lock.ociImages.${model}.manifestDigest`, runtimeLock.identities?.ociImages?.[model]?.manifestDigest, null);
    compare(failures, `candidate-plan.runtime-lock.ociImages.${model}.configDigest`, runtimeLock.identities?.ociImages?.[model]?.configDigest, null);
    const modelBinding = binding.modelRuntimeIdentities[model];
    compare(failures, `candidate-plan.runtime-lock.${model}.dependencyLockDigest`, runtimeLock.identities?.dependencyLockDigests?.[model], modelBinding.dependencyLockDigest);
    compare(failures, `candidate-plan.runtime-lock.${model}.runtimeInputManifestDigest`, runtimeLock.identities?.runtimeInputManifestDigests?.[model], modelBinding.runtimeInputManifestDigest);
    const stableModel = EXPECTED_STABLE_INPUTS.models.find((entry) => entry.model === model);
    compare(failures, `candidate-plan.stable-inputs.${model}.dependencyLockDigest`, modelBinding.dependencyLockDigest, stableModel?.dependencyLockDigest);
    compare(failures, `candidate-plan.stable-inputs.${model}.runtimeInputManifestDigest`, modelBinding.runtimeInputManifestDigest, stableModel?.runtimeInputDigest);
    for (const [index, observation] of (runtimeLock.replication?.observations ?? []).entries()) {
      compare(failures, `candidate-plan.runtime-lock.replication[${index}].${model}.dependencyLockDigest`, observation.identities?.dependencyLockDigests?.[model], modelBinding.dependencyLockDigest);
      compare(failures, `candidate-plan.runtime-lock.replication[${index}].${model}.runtimeInputManifestDigest`, observation.identities?.runtimeInputManifestDigests?.[model], modelBinding.runtimeInputManifestDigest);
    }
  }
  compare(failures, 'candidate-plan.stable-inputs.sourceManifestDigest', binding.sourceManifestDigest, EXPECTED_STABLE_INPUTS.sourceManifestDigest);
  compare(failures, 'candidate-plan.stable-inputs.materializationDigest', binding.materializationDigest, EXPECTED_STABLE_INPUTS.materializationDigest);
  compare(failures, 'candidate-plan.stable-inputs.runnerDigest', binding.runnerDigest, EXPECTED_STABLE_INPUTS.runnerDigest);

  try {
    const actual = await recomputeRuntimeSourceIdentity(root, runtimeLock.runtimeSource?.runtimeSourceRevision);
    compare(failures, 'candidate-plan.runtime-source.recomputedSourceManifestDigest', actual.sourceManifestDigest, binding.sourceManifestDigest);
    compare(failures, 'candidate-plan.runtime-source.recomputedMaterializationDigest', actual.materializationDigest, binding.materializationDigest);
    compare(failures, 'candidate-plan.runtime-source.recomputedRunnerDigest', actual.runnerDigest, binding.runnerDigest);
  } catch (error) {
    failures.push(`candidate-plan.runtime-source: unable to recompute frozen source, materialization and runner roots (${message(error)})`);
  }
}

function compareBoundRawDigest(failures, label, bytes, bindingDigest, frozenDigest) {
  const actualDigest = sha256(bytes);
  compare(failures, `${label}.rawDigest`, actualDigest, frozenDigest);
  compare(failures, `${label}.binding`, bindingDigest, actualDigest);
}

function parseBoundJson(bytes, label, failures) {
  try { return parseJsonRejectingDuplicateMembers(bytes); }
  catch (error) {
    failures.push(`${label}: invalid or duplicate-member JSON (${message(error)})`);
    return null;
  }
}

function rejectPositiveCandidateClaims(value, failures, location = '$', seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) {
    failures.push(`${location}: cyclic candidate plan is forbidden`);
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) value.forEach((entry, index) => rejectPositiveCandidateClaims(entry, failures, `${location}[${index}]`, seen));
  else {
    for (const [key, entry] of Object.entries(value)) {
      const childLocation = `${location}.${key}`;
      if (CLAIM_BOOLEAN_KEYS.has(key) && entry !== false) failures.push(`${childLocation}: candidate plan requires exact false`);
      rejectPositiveCandidateClaims(entry, failures, childLocation, seen);
    }
  }
  seen.delete(value);
}

function compare(failures, label, actual, expected) {
  if (!isDeepStrictEqual(actual, expected)) failures.push(`${label}: frozen value mismatch`);
}

function toBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof Uint8Array) return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (typeof bytes === 'string') return Buffer.from(bytes, 'utf8');
  throw new TypeError('expected bytes, Uint8Array or string');
}

function message(error) {
  return error instanceof Error ? error.message : String(error);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}
