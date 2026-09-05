import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  canonicalJson,
  parseJsonRejectingDuplicateMembers,
} from './runtime-lock-policy.mjs';

export const RANDOM_TP_RIGHTS_DISPOSITION_PATH =
  'evaluation/atomistic/random-tp-rights-disposition-v0.1.json';
export const RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_PATH =
  'schemas/atomistic-random-tp-rights-disposition.schema.json';
export const RANDOM_TP_RIGHTS_DISPOSITION_RAW_DIGEST =
  'sha256:32e0134c25553ab7a415ffab526b4bb82a81e487f1dae3424c25b841faf9962f';
export const RANDOM_TP_RIGHTS_DISPOSITION_SEMANTIC_DIGEST =
  'sha256:edfaf76141afd65221f674f55c806568f3b7aab57eea9b62d2dabc9c67866cd3';
export const RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_RAW_DIGEST =
  'sha256:7c1f5c781c87cc3dfbfa0349be3b77a0529e23f569b1b4a213595bc0d606297c';
export const RANDOM_TP_PRIVATE_COMPUTE_SCOPE_DIGEST =
  'sha256:c73cbb22ae3f7c57579d55c1242f6a0434eb79fb0489cd8799fceff67b8e3c91';

const MAX_DISPOSITION_BYTES = 256 * 1024;
const MAX_SCHEMA_BYTES = 256 * 1024;
const SCOPE_DIGEST_DOMAIN =
  'tf.atomistic-random-tp-private-compute-scope/0.1\0';
const EXPECTED_FILE_MODE = 0o644n;

export const EXPECTED_RANDOM_TP_BINDING = deepFreeze({
  id: 'mattersim-random-tp',
  repository: 'microsoft/mattersim',
  revision: '40a1eb8f1189a53af310957b4f2c5dfbfe68d647',
  path: 'data/benchmarks/random-TP.xyz',
  contentsApiUrl: 'https://api.github.com/repos/microsoft/mattersim/contents/data/benchmarks/random-TP.xyz?ref=40a1eb8f1189a53af310957b4f2c5dfbfe68d647',
  contentsApiType: 'file',
  contentsApiEncoding: 'none',
  contentsApiResponseDigest: null,
  contentsApiSha256FieldPresent: false,
  gitObjectFormat: 'sha1',
  gitBlobOid: '79bddf16aac8f8f5559fe2218867a7817fad4219',
  gitBlobOidIsSha256: false,
  sizeBytes: 1_514_015,
  projectFrozenSha256: 'sha256:c14473dcf4bd71e1ed11556ac9ff12b68e7a423d813f939bc9eedaef663054d9',
  frames: 693,
  atomsPerFrame: 16,
  idSetSha256: 'sha256:4df1ba7cda1b0a31cdb0b3e2281ed535327d7b92ce381cd930c781cc8b800f91',
  structureManifestSha256: 'sha256:b0a94b5424f9d4a2be7519265b8dbe89a478fa5b21a6c956c70ffe0c705078f7',
  labelManifestSha256: 'sha256:a0eda4ac1c7720002a32f42f91c635bf8398b93c02846fb83ae97437e3e8422f',
  licenseStatus: 'NOASSERTION: the file is in the MIT-licensed MatterSim repository, but no dataset-specific provenance or redistribution grant is supplied',
  redistributionCleared: false,
});

export const EXPECTED_CHECKPOINT_BINDINGS = deepFreeze({
  mattersim: {
    modelId: 'mattersim-v1.0.0-5m',
    packageName: 'mattersim',
    packageVersion: '1.2.5',
    sourceRevision: '40a1eb8f1189a53af310957b4f2c5dfbfe68d647',
    url: 'https://raw.githubusercontent.com/microsoft/mattersim/40a1eb8f1189a53af310957b4f2c5dfbfe68d647/pretrained_models/mattersim-v1.0.0-5M.pth',
    sizeBytes: 91_176_875,
    sha256: 'sha256:e3df9fa708725e3d453140646c7d1838324b347a3d1214cf1440522146f872b5',
  },
  mace: {
    modelId: 'mace-mpa-0-medium',
    packageName: 'mace-torch',
    packageVersion: '0.3.16',
    sourceRevision: '4d2da09413ac1407f37cdbb6b81fa28e4c15655e',
    foundationRepository: 'ACEsuit/mace-foundations',
    foundationRevision: '6de003bb29db05f451051c30ce809fad522d26da',
    releaseTag: 'mace_mpa_0',
    releaseId: 191_152_959,
    assetId: 213_937_064,
    assetName: 'mace-mpa-0-medium.model',
    officialAssetDigest: null,
    url: 'https://github.com/ACEsuit/mace-foundations/releases/download/mace_mpa_0/mace-mpa-0-medium.model',
    sizeBytes: 79_462_305,
    sha256: 'sha256:75428afe3a1d7d8062e19bcaabd5c433623cabf308242ec9fb493e38604fb638',
  },
});

export const EXPECTED_RUNTIME_BINDING = deepFreeze({
  platform: 'linux/amd64',
  python: '3.12.13',
  device: 'cpu',
  precision: 'float32',
  batchSize: 1,
  threads: 1,
  baseImageIndexDigest: 'sha256:4766d8b510c428e595d74b9cc5bbb2fae8e26316fffb4adc89908d79aacd58a2',
  baseImagePlatformManifestDigest: 'sha256:6e13e65c55e33adf203d77ee371cf8bf5d81bd4902ef07565721f46bf44917af',
  runnerDigest: 'sha256:d6e83640f15926088c116312c27605570f9e9c8ba4e9a9988ef5bf4d3a974ed4',
  sourceManifestDigest: 'sha256:08b1ed2ae239ce5732cf565b5e7bd814727a99ad6e1e1a29aeaa21ea1ed529a1',
  materializationDigest: 'sha256:345d5e55227bbe873d567f5ea72b88db1f21c1d46e72f078db38e6a455d47721',
  ociPromotionTrustRootsAvailable: false,
  mattersim: {
    dependencyLockDigest: 'sha256:9c990909d1307bb32608d31b9ed217d2368c28e2048f6dec39e8dc4a2b63642b',
    runtimeInputManifestDigest: 'sha256:203acc5ec09c2e76a819ff384573c2c0aca1316f90c53f2e735c98e9daab5c53',
    dependencyGraphDigest: 'sha256:089b3a59daaf10fef45086ea5e8d63a7bf143d2d99aefef6cb7451e34dc50da0',
    installedPathDigest: 'sha256:cf12e368061c2420f802592a8b732e4f510e15129144c4a56161766a0e5bb321',
    runtimeInstalledPathDigest: 'sha256:3c393f19d748b945a77683d5e722f3a3b49d49415652ba4c78380bc1c175d873',
  },
  mace: {
    dependencyLockDigest: 'sha256:ae4b21b6f6d8ad98edcf2d5e0d938cd563379f494cce0b4aaa2e987332147e33',
    runtimeInputManifestDigest: 'sha256:6bb7f79c5380bb54b0d5ff972c3f22cc27623d131291d3a7c1b2c4efff826f47',
    dependencyGraphDigest: 'sha256:27045fc8bfc4bf841b6164f1360c71450753329db1aa8e61e22cf0963f82246b',
    installedPathDigest: 'sha256:e880ee162447820b350b0056700656f903bb6ff782bea9b15fd0be24bc08e290',
    runtimeInstalledPathDigest: 'sha256:cc7c3b47516ab8d80d96243c14a648f39bc89ce9ae3b8ad894868fab2c9029e5',
    pythonHostlist: {
      version: '2.3.0',
      upstreamLicenseRaw: 'GPL2+',
      upstreamLicenseExpression: null,
      normalizedLicense: 'GPL-2.0-or-later',
      sourceDistributionFilename: 'python_hostlist-2.3.0.tar.gz',
      sourceDistributionSizeBytes: 37_326,
      sourceDistributionSha256: 'sha256:e1a0b18e525a5fca573cb9862799f11b3f2bd3ba7aec70c4ecd8b95341bb71ea',
      derivedWheelSha256: 'sha256:498c59026aec1015aa07f970423d4b655ac45f5108bbc900f40f8afd3593ad1c',
      derivedWheelProvenanceManifestDigest: 'sha256:1b2796e8419a6eeaf1bfaacd3942c266ca1316d2975afb040d718a8edd9b1d59',
      distributionObligationsReviewed: false,
    },
  },
});

export const EXPECTED_LOCAL_EVIDENCE = deepFreeze({
  datasetCatalog: {
    path: 'evaluation/data/datasets.json',
    schemaVersion: 'tf.dataset-catalog/0.1',
    rawDigest: 'sha256:ca6e7ca0187cf5584806f2684611b2b813b46bd7c434741d756df7947aef8fe7',
  },
  reproductionPlan: {
    path: 'evaluation/atomistic/reproduction-plan.json',
    schemaVersion: 'tf.atomistic-reproduction/0.2',
    rawDigest: 'sha256:d3a58524029b51c598d00a7bb9f60b6479a9973a0f9907cbf94a31e61bf1c9c2',
  },
  runtimeLock: {
    path: 'evaluation/atomistic/runtime-lock.json',
    schemaVersion: 'tf.atomistic-runtime-lock/0.3',
    rawDigest: 'sha256:b8c352aacfef3f74210d2dbf2002400887e35d21670f5f93da6a8003670bafa1',
    semanticDigest: 'sha256:3f817d5536589d7d1eaeda32d27917ba590d517ee8172d6572b4bee90cc1193a',
    state: 'bootstrap-runtime-frozen-not-reproduced',
  },
  mattersimRuntimeInputs: {
    path: 'evaluation/atomistic/runtime-inputs/mattersim.runtime-inputs.json',
    schemaVersion: 'tf.atomistic-runtime-inputs/0.2',
    rawDigest: 'sha256:203acc5ec09c2e76a819ff384573c2c0aca1316f90c53f2e735c98e9daab5c53',
  },
  maceRuntimeInputs: {
    path: 'evaluation/atomistic/runtime-inputs/mace.runtime-inputs.json',
    schemaVersion: 'tf.atomistic-runtime-inputs/0.2',
    rawDigest: 'sha256:6bb7f79c5380bb54b0d5ff972c3f22cc27623d131291d3a7c1b2c4efff826f47',
  },
  maceRuntimeLicenseNotice: {
    path: 'atomistic/locks/README.md',
    rawDigest: 'sha256:65abe1d5c48185090a1b1a96cfa813f3b8eb88a25cf10f59798798db5ae36a03',
  },
  executionPreflight: {
    path: 'evaluation/atomistic/full-candidate-execution-preflight.json',
    schemaVersion: 'tf.atomistic-full-candidate-execution-preflight/0.1',
    rawDigest: 'sha256:886cf305df9418386c3087bf066cd8e9b83b316c127eaa41965c606b82f602aa',
  },
  observerContract: {
    path: 'evaluation/atomistic/full-candidate-observer-contract-vnext.json',
    schemaVersion: 'tf.atomistic-full-candidate-observer-contract/0.1',
    rawDigest: 'sha256:9fd93ded20bd013a0c6d61dfec48368fc7957725ee4f95f4fafa242c7f7f0759',
  },
  legacyReceiptSchema: {
    path: 'schemas/atomistic-full-candidate-receipt.schema.json',
    schemaVersion: 'tf.atomistic-full-candidate-receipt/0.2',
    rawDigest: 'sha256:f6dfdec4d81bd1467ec459f6e0153dee5fe877a17819de4704c0ae189dcc70aa',
  },
});

export const EXPECTED_RIGHTS_DECISIONS = deepFreeze({
  privateExecution: {
    rightId: 'private-execution',
    allowed: false,
    disposition: 'abstain',
    effect: 'dispatch-blocking',
    reasonCodes: [
      'RANDOM_TP_DATASET_LICENSE_SCOPE_UNRESOLVED',
      'RANDOM_TP_DATASET_PROVENANCE_NOT_DATASET_SPECIFICALLY_ATTESTED',
      'QUALIFIED_RIGHTS_REVIEW_NOT_RECORDED',
    ],
  },
  aggregatePublication: {
    rightId: 'aggregate-publication',
    allowed: false,
    disposition: 'abstain',
    effect: 'publication-blocking',
    reasonCodes: [
      'PRIVATE_EXECUTION_NOT_CLEARED',
      'RANDOM_TP_DERIVED_AGGREGATE_PUBLICATION_RIGHTS_UNRESOLVED',
      'AGGREGATE_ONLY_PROJECTION_NOT_RIGHTS_VALIDATED',
    ],
  },
  runtimeRedistribution: {
    rightId: 'runtime-redistribution',
    allowed: false,
    disposition: 'abstain',
    effect: 'redistribution-blocking',
    reasonCodes: [
      'COMPLETE_RUNTIME_SBOM_LICENSE_MATRIX_NOT_REVIEWED',
      'PYTHON_HOSTLIST_GPL2PLUS_DERIVED_WHEEL_OBLIGATIONS_UNREVIEWED',
      'CORRESPONDING_SOURCE_NOTICE_DISTRIBUTION_BUNDLE_UNVERIFIED',
    ],
  },
});

const EXPECTED_AUTHORITY_GATE = deepFreeze({
  status: 'qualified-rights-review-not-recorded',
  authorizationRecord: null,
  requiredAuthorityClasses: [
    'dataset-rightsholder',
    'documented-rightsholder-delegate',
    'qualified-rights-reviewer-with-recorded-mandate',
  ],
  authorizationMustBeIndependentFromImplementation: true,
  authorizationMustBeTrusted: true,
  authorizationMustBeUnexpiredAtUse: true,
  authorizationScopeMustEqualPrivateComputeScopeDigest: true,
  selfAuthoredAuthorityAccepted: false,
});

const EXPECTED_INDEPENDENCE = deepFreeze({
  protocol: 'private-execution-aggregate-publication-and-runtime-redistribution-are-three-independent-default-deny-decisions/v1',
  representation: 'three-named-nonsubstitutable-slots',
  decisionSwappingAllowed: false,
  decisionSubstitutionAllowed: false,
  crossDecisionGrantPropagationAllowed: false,
  privateExecutionMayImplyAggregatePublication: false,
  privateExecutionMayImplyRuntimeRedistribution: false,
  aggregatePublicationMayImplyRuntimeRedistribution: false,
});

const EXPECTED_EFFECTS = deepFreeze({
  privateModelExecutionAuthorized: false,
  workflowRegistrationAuthorized: false,
  workflowDispatchAuthorized: false,
  aggregateArtifactPublicationAuthorized: false,
  runtimeOrCheckpointPublicationAuthorized: false,
  frontendIngestionAuthorized: false,
  scorePromotionEligible: false,
  scientificClaimEligible: false,
});

const EXPECTED_COMPATIBILITY = deepFreeze({
  frontendContractVersionsChanged: false,
  observerContractChanged: false,
  observerRightsRemainDefaultDeny: true,
  legacyReceiptSchemaChanged: false,
  legacyReceiptSchemaReinterpreted: false,
  futureGrantRequiresVersionedMigration: true,
});

const EXPECTED_CLAIMS = deepFreeze({
  rightsCleared: false,
  fullInferenceRun: false,
  modelExecutionPerformed: false,
  reproduced: false,
  comparisonEligible: false,
  promotionEligible: false,
  sota: false,
  dataLeakageCertified: false,
  causalClaimAllowed: false,
  industrialFitness: false,
});

const EXPECTED_PRIVATE_SCOPE_MODELS = deepFreeze([
  {
    modelId: EXPECTED_CHECKPOINT_BINDINGS.mattersim.modelId,
    packageVersion: EXPECTED_CHECKPOINT_BINDINGS.mattersim.packageVersion,
    sourceRevision: EXPECTED_CHECKPOINT_BINDINGS.mattersim.sourceRevision,
    checkpointSha256: EXPECTED_CHECKPOINT_BINDINGS.mattersim.sha256,
    checkpointSizeBytes: EXPECTED_CHECKPOINT_BINDINGS.mattersim.sizeBytes,
    ...EXPECTED_RUNTIME_BINDING.mattersim,
  },
  {
    modelId: EXPECTED_CHECKPOINT_BINDINGS.mace.modelId,
    packageVersion: EXPECTED_CHECKPOINT_BINDINGS.mace.packageVersion,
    sourceRevision: EXPECTED_CHECKPOINT_BINDINGS.mace.sourceRevision,
    foundationRevision: EXPECTED_CHECKPOINT_BINDINGS.mace.foundationRevision,
    checkpointSha256: EXPECTED_CHECKPOINT_BINDINGS.mace.sha256,
    checkpointSizeBytes: EXPECTED_CHECKPOINT_BINDINGS.mace.sizeBytes,
    dependencyLockDigest: EXPECTED_RUNTIME_BINDING.mace.dependencyLockDigest,
    runtimeInputManifestDigest: EXPECTED_RUNTIME_BINDING.mace.runtimeInputManifestDigest,
    dependencyGraphDigest: EXPECTED_RUNTIME_BINDING.mace.dependencyGraphDigest,
    installedPathDigest: EXPECTED_RUNTIME_BINDING.mace.installedPathDigest,
    runtimeInstalledPathDigest: EXPECTED_RUNTIME_BINDING.mace.runtimeInstalledPathDigest,
  },
]);

const EXPECTED_PRIVATE_SCOPE_RUNTIME = deepFreeze({
  platform: EXPECTED_RUNTIME_BINDING.platform,
  python: EXPECTED_RUNTIME_BINDING.python,
  device: EXPECTED_RUNTIME_BINDING.device,
  precision: EXPECTED_RUNTIME_BINDING.precision,
  batchSize: EXPECTED_RUNTIME_BINDING.batchSize,
  threads: EXPECTED_RUNTIME_BINDING.threads,
  baseImageIndexDigest: EXPECTED_RUNTIME_BINDING.baseImageIndexDigest,
  baseImagePlatformManifestDigest: EXPECTED_RUNTIME_BINDING.baseImagePlatformManifestDigest,
  runnerDigest: EXPECTED_RUNTIME_BINDING.runnerDigest,
  sourceManifestDigest: EXPECTED_RUNTIME_BINDING.sourceManifestDigest,
  materializationDigest: EXPECTED_RUNTIME_BINDING.materializationDigest,
});

const EXPECTED_PRIMARY_SOURCES = deepFreeze([
  ['mattersim-license-40a1eb8', 'repository-license', 'https://github.com/microsoft/mattersim/blob/40a1eb8f1189a53af310957b4f2c5dfbfe68d647/LICENSE.txt', '40a1eb8f1189a53af310957b4f2c5dfbfe68d647', 'sha256:fd532481d828e13a0b13ccb598e02338a3617740675a862ee6bdc1541b68e93d', 'auditable'],
  ['random-tp-contents-api-40a1eb8', 'upstream-file-identity', EXPECTED_RANDOM_TP_BINDING.contentsApiUrl, EXPECTED_RANDOM_TP_BINDING.revision, null, 'auditable'],
  ['random-tp-file-40a1eb8', 'upstream-dataset-file', 'https://github.com/microsoft/mattersim/blob/40a1eb8f1189a53af310957b4f2c5dfbfe68d647/data/benchmarks/random-TP.xyz', EXPECTED_RANDOM_TP_BINDING.revision, EXPECTED_RANDOM_TP_BINDING.projectFrozenSha256, 'auditable'],
  ['mattersim-model-card-40a1eb8', 'model-card', 'https://github.com/microsoft/mattersim/blob/40a1eb8f1189a53af310957b4f2c5dfbfe68d647/MODEL_CARD.md', EXPECTED_RANDOM_TP_BINDING.revision, 'sha256:9f48dffafb55f0700bbc2d180ce8f7b5bc28decac1de43c3058c323a7c0dc5b7', 'auditable'],
  ['mattersim-paper-2405.04967v2', 'primary-paper', 'https://arxiv.org/html/2405.04967v2#S6', '2405.04967v2', null, 'reference'],
  ['mace-readme-4d2da09', 'official-model-repository', 'https://github.com/ACEsuit/mace/blob/4d2da09413ac1407f37cdbb6b81fa28e4c15655e/README.md', EXPECTED_CHECKPOINT_BINDINGS.mace.sourceRevision, 'sha256:1ef0c309a49cf7d1035ab581b1ddc8284c678658ba375a132c4d5fcefd833038', 'auditable'],
  ['mace-setup-cfg-4d2da09', 'official-dependency-declaration', 'https://raw.githubusercontent.com/ACEsuit/mace/4d2da09413ac1407f37cdbb6b81fa28e4c15655e/setup.cfg', EXPECTED_CHECKPOINT_BINDINGS.mace.sourceRevision, 'sha256:3b279d3b2abaf74b1107c7af244d48a7c6d7eba0c7525434328055efd58ddf12', 'auditable'],
  ['mace-license-4d2da09', 'repository-license', 'https://github.com/ACEsuit/mace/blob/4d2da09413ac1407f37cdbb6b81fa28e4c15655e/LICENSE.md', EXPECTED_CHECKPOINT_BINDINGS.mace.sourceRevision, 'sha256:42137790f854ae2b9d29a0a72a4da3f6fb9a21d820b3f276f23b0575af72e86e', 'auditable'],
  ['mace-foundations-license-6de003b', 'checkpoint-repository-license', 'https://github.com/ACEsuit/mace-foundations/blob/6de003bb29db05f451051c30ce809fad522d26da/LICENSE', EXPECTED_CHECKPOINT_BINDINGS.mace.foundationRevision, 'sha256:31ea0ccf7bc19797081bff51c7eff3a3927c8cb6c1d7a726dec3d157b436da1c', 'auditable'],
  ['mace-mpa-0-release', 'official-checkpoint-release', 'https://github.com/ACEsuit/mace-foundations/releases/tag/mace_mpa_0', 'mace_mpa_0', null, 'reference'],
  ['python-hostlist-pypi-2.3.0', 'official-package-index-metadata', 'https://pypi.org/pypi/python-hostlist/2.3.0/json', '2.3.0', null, 'reference'],
].map(([id, kind, url, revision, contentDigest, evidenceClass]) => ({
  id, kind, url, revision, contentDigest, evidenceClass,
})));

const MAX_BYTES_BY_PATH = new Map([
  [EXPECTED_LOCAL_EVIDENCE.datasetCatalog.path, 64 * 1024],
  [EXPECTED_LOCAL_EVIDENCE.reproductionPlan.path, 64 * 1024],
  [EXPECTED_LOCAL_EVIDENCE.runtimeLock.path, 64 * 1024],
  [EXPECTED_LOCAL_EVIDENCE.mattersimRuntimeInputs.path, 256 * 1024],
  [EXPECTED_LOCAL_EVIDENCE.maceRuntimeInputs.path, 128 * 1024],
  [EXPECTED_LOCAL_EVIDENCE.maceRuntimeLicenseNotice.path, 64 * 1024],
  [EXPECTED_LOCAL_EVIDENCE.executionPreflight.path, 64 * 1024],
  [EXPECTED_LOCAL_EVIDENCE.observerContract.path, 64 * 1024],
  [EXPECTED_LOCAL_EVIDENCE.legacyReceiptSchema.path, 64 * 1024],
]);

export function sha256(bytes) {
  return `sha256:${createHash('sha256').update(toBuffer(bytes)).digest('hex')}`;
}

export function computePrivateComputeScopeDigest(contract) {
  return sha256(Buffer.from(
    `${SCOPE_DIGEST_DOMAIN}${canonicalJson(contract)}`,
    'utf8',
  ));
}

export function inspectRandomTpRightsDispositionBytes(
  bytes,
  { enforceCheckedInBytes = true } = {},
) {
  const buffer = toBuffer(bytes);
  const failures = [];
  let disposition = null;
  let semanticDigest = null;
  if (buffer.length < 1 || buffer.length > MAX_DISPOSITION_BYTES) {
    failures.push('rights-disposition.raw: byte length is outside the bounded contract');
  } else {
    try {
      disposition = parseJsonRejectingDuplicateMembers(buffer);
      semanticDigest = sha256(Buffer.from(canonicalJson(disposition), 'utf8'));
    } catch (error) {
      failures.push(`rights-disposition.raw: invalid or duplicate-member JSON (${message(error)})`);
    }
  }
  const rawDigest = sha256(buffer);
  if (enforceCheckedInBytes && rawDigest !== RANDOM_TP_RIGHTS_DISPOSITION_RAW_DIGEST) {
    failures.push('rights-disposition.rawDigest: exact reviewed bytes differ');
  }
  if (enforceCheckedInBytes
      && semanticDigest !== RANDOM_TP_RIGHTS_DISPOSITION_SEMANTIC_DIGEST) {
    failures.push('rights-disposition.semanticDigest: exact reviewed semantics differ');
  }
  return { disposition, rawDigest, semanticDigest, failures: uniqueSorted(failures) };
}

export function validateRandomTpRightsDispositionSchema(disposition, schema) {
  const failures = [];
  try {
    const ajv = new Ajv2020({
      allErrors: true,
      strict: true,
      validateFormats: false,
      validateSchema: true,
    });
    const validate = ajv.compile(schema);
    if (!validate(disposition)) {
      failures.push(`rights-disposition.schema: ${JSON.stringify(validate.errors)}`);
    }
  } catch (error) {
    failures.push(`rights-disposition.schema: strict AJV compilation failed (${message(error)})`);
  }
  return failures;
}

export function validateRandomTpRightsDispositionSemantics(disposition) {
  const failures = [];
  if (!isRecord(disposition)) {
    return ['rights-disposition.semantic: root must be an object'];
  }
  let semanticDigest = null;
  try {
    semanticDigest = sha256(Buffer.from(canonicalJson(disposition), 'utf8'));
  } catch (error) {
    failures.push(`rights-disposition.semantic: canonicalization failed (${message(error)})`);
  }
  if (semanticDigest !== RANDOM_TP_RIGHTS_DISPOSITION_SEMANTIC_DIGEST) {
    failures.push('rights-disposition.semantic: exact frozen v0.1 contract digest mismatch');
  }
  compare(failures, 'rights-disposition.schemaVersion', disposition.schemaVersion,
    'tf.atomistic-random-tp-rights-disposition/0.1');
  compare(failures, 'rights-disposition.status', disposition.status,
    'reviewed-abstention-all-rights-not-cleared');
  compare(failures, 'rights-disposition.asOf', disposition.asOf, '2026-09-04');
  compare(failures, 'rights-disposition.legalAdvice', disposition.legalAdvice, false);
  compare(failures, 'rights-disposition.bindings.dataset',
    disposition.bindings?.dataset, EXPECTED_RANDOM_TP_BINDING);
  compare(failures, 'rights-disposition.bindings.checkpoints',
    disposition.bindings?.checkpoints, EXPECTED_CHECKPOINT_BINDINGS);
  compare(failures, 'rights-disposition.bindings.runtime',
    disposition.bindings?.runtime, EXPECTED_RUNTIME_BINDING);
  compare(failures, 'rights-disposition.bindings.localEvidence',
    disposition.bindings?.localEvidence, EXPECTED_LOCAL_EVIDENCE);

  compare(failures, 'rights-disposition.evidenceReview.header', {
    asOf: disposition.evidenceReview?.asOf,
    evidenceClass: disposition.evidenceReview?.evidenceClass,
    reviewerClass: disposition.evidenceReview?.reviewerClass,
    implementedCandidate: disposition.evidenceReview?.implementedCandidate,
    qualifiedRightsAuthority: disposition.evidenceReview?.qualifiedRightsAuthority,
    approvalAuthority: disposition.evidenceReview?.approvalAuthority,
  }, {
    asOf: '2026-09-04',
    evidenceClass: 'auditable-primary-source-review-not-legal-advice',
    reviewerClass: 'independent-read-only-sota-rights-scout',
    implementedCandidate: false,
    qualifiedRightsAuthority: false,
    approvalAuthority: false,
  });
  compare(failures, 'rights-disposition.evidenceReview.sources',
    disposition.evidenceReview?.sources, EXPECTED_PRIMARY_SOURCES);

  const scope = disposition.intendedPrivateComputeScope;
  compare(failures, 'rights-disposition.privateScope.status',
    scope?.status, 'proposed-not-authorized');
  compare(failures, 'rights-disposition.privateScope.scopeDigest',
    scope?.scopeDigest, RANDOM_TP_PRIVATE_COMPUTE_SCOPE_DIGEST);
  if (isRecord(scope?.contract)) {
    try {
      compare(failures, 'rights-disposition.privateScope.recomputedScopeDigest',
        computePrivateComputeScopeDigest(scope.contract), scope.scopeDigest);
    } catch (error) {
      failures.push(`rights-disposition.privateScope: cannot compute scope digest (${message(error)})`);
    }
    validatePrivateScope(scope.contract, failures);
  } else {
    failures.push('rights-disposition.privateScope.contract: exact object required');
  }

  compare(failures, 'rights-disposition.authorityGate',
    disposition.authorityGate, EXPECTED_AUTHORITY_GATE);
  if (disposition.authorityGate?.authorizationRecord !== null) {
    failures.push('rights-disposition.authorityGate.authorizationRecord: v0.1 forbids authority injection; a reviewed versioned migration is required');
  }
  compare(failures, 'rights-disposition.decisions',
    disposition.decisions, EXPECTED_RIGHTS_DECISIONS);
  validateDecisionSlots(disposition.decisions, failures);
  validateReasonEvidence(disposition, failures);
  compare(failures, 'rights-disposition.independence',
    disposition.independence, EXPECTED_INDEPENDENCE);
  compare(failures, 'rights-disposition.effects', disposition.effects, EXPECTED_EFFECTS);
  compare(failures, 'rights-disposition.compatibility',
    disposition.compatibility, EXPECTED_COMPATIBILITY);
  compare(failures, 'rights-disposition.claims', disposition.claims, EXPECTED_CLAIMS);
  return uniqueSorted(failures);
}

export function assessRightsAuthority(
  record,
  {
    now,
    expectedScopeDigest = RANDOM_TP_PRIVATE_COMPUTE_SCOPE_DIGEST,
    implementationPrincipals = [],
  } = {},
) {
  const blockers = [];
  if (record === null || record === undefined) {
    blockers.push('QUALIFIED_RIGHTS_REVIEW_NOT_RECORDED');
    return authorityAssessment(blockers);
  }
  if (!isRecord(record)) {
    blockers.push('RIGHTS_AUTHORITY_RECORD_MALFORMED');
    return authorityAssessment(blockers);
  }
  const required = [
    'principalId',
    'authorityClass',
    'documentDigest',
    'scopeDigest',
    'issuedAt',
    'expiresAt',
    'trustVerified',
    'signatureVerified',
    'independentFromImplementation',
    'authoredByImplementation',
  ];
  if (required.some((key) => !Object.hasOwn(record, key))
      || !isDeepStrictEqual(Object.keys(record), required)
      || typeof record.principalId !== 'string'
      || !/^[a-z0-9][a-z0-9._-]{2,127}$/.test(record.principalId)) {
    blockers.push('RIGHTS_AUTHORITY_RECORD_MALFORMED');
  }
  if (now === undefined) blockers.push('RIGHTS_AUTHORITY_TIME_REQUIRED');
  const nowEpoch = canonicalTimestamp(now);
  const issuedEpoch = canonicalTimestamp(record.issuedAt);
  const expiresEpoch = canonicalTimestamp(record.expiresAt);
  if (![nowEpoch, issuedEpoch, expiresEpoch].every(Number.isFinite)
      || issuedEpoch > nowEpoch || issuedEpoch >= expiresEpoch) {
    blockers.push('RIGHTS_AUTHORITY_TIME_INVALID');
  } else if (expiresEpoch <= nowEpoch) {
    blockers.push('RIGHTS_AUTHORITY_EXPIRED');
  }
  if (!EXPECTED_AUTHORITY_GATE.requiredAuthorityClasses.includes(record.authorityClass)
      || record.trustVerified !== true
      || record.signatureVerified !== true
      || !/^sha256:[0-9a-f]{64}$/.test(record.documentDigest ?? '')) {
    blockers.push('RIGHTS_AUTHORITY_UNTRUSTED');
  }
  if (record.independentFromImplementation !== true
      || record.authoredByImplementation !== false
      || implementationPrincipals.includes(record.principalId)) {
    blockers.push('RIGHTS_AUTHORITY_SELF_AUTHORED');
  }
  if (record.scopeDigest !== expectedScopeDigest) {
    blockers.push('RIGHTS_AUTHORITY_SCOPE_MISMATCH');
  }
  blockers.push('VERSIONED_RIGHTS_MIGRATION_REQUIRED');
  return authorityAssessment(blockers);
}

export async function validateRandomTpRightsDispositionRepository(
  dispositionBytes,
  {
    root = process.cwd(),
    enforceCheckedInBytes = true,
    fileOverrides = {},
    dispositionSnapshot = null,
    beforeFinalAuditForTest = null,
  } = {},
) {
  const inspection = inspectRandomTpRightsDispositionBytes(
    dispositionBytes,
    { enforceCheckedInBytes },
  );
  const failures = [...inspection.failures];
  const disposition = inspection.disposition;
  const fileSnapshots = dispositionSnapshot ? [dispositionSnapshot] : [];
  if (!disposition) return resultEnvelope(inspection, failures, null);
  failures.push(...validateRandomTpRightsDispositionSemantics(disposition));

  let canonicalRoot;
  try {
    canonicalRoot = await canonicalRepositoryRoot(root);
  } catch (error) {
    failures.push(`rights-disposition.repositoryRoot: ${message(error)}`);
    return resultEnvelope(inspection, failures, disposition);
  }

  let schema = null;
  try {
    const schemaBytes = await readPolicyFile(
      canonicalRoot,
      RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_PATH,
      MAX_SCHEMA_BYTES,
      fileOverrides,
      fileSnapshots,
    );
    if (sha256(schemaBytes) !== RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_RAW_DIGEST) {
      failures.push('rights-disposition.schema.rawDigest: exact reviewed schema bytes differ');
    }
    schema = parseJsonRejectingDuplicateMembers(schemaBytes);
  } catch (error) {
    failures.push(`rights-disposition.schema.raw: unavailable or invalid (${message(error)})`);
  }
  if (schema) failures.push(...validateRandomTpRightsDispositionSchema(disposition, schema));

  const evidence = {};
  for (const [key, binding] of Object.entries(EXPECTED_LOCAL_EVIDENCE)) {
    try {
      const bytes = await readPolicyFile(
        canonicalRoot,
        binding.path,
        MAX_BYTES_BY_PATH.get(binding.path),
        fileOverrides,
        fileSnapshots,
      );
      if (sha256(bytes) !== binding.rawDigest) {
        failures.push(`rights-disposition.localEvidence.${key}.rawDigest: exact bound bytes differ`);
      }
      evidence[key] = bytes;
    } catch (error) {
      failures.push(`rights-disposition.localEvidence.${key}: unavailable or unsafe (${message(error)})`);
    }
  }
  validateLocalEvidenceProjection(disposition, evidence, failures);
  if (beforeFinalAuditForTest !== null) {
    if (typeof beforeFinalAuditForTest !== 'function') {
      failures.push('rights-disposition.repositorySnapshot: test audit hook must be a function');
    } else {
      try {
        await beforeFinalAuditForTest();
      } catch (error) {
        failures.push(`rights-disposition.repositorySnapshot: test audit hook failed (${message(error)})`);
      }
    }
  }
  failures.push(...await auditPolicyFileSnapshots(fileSnapshots));
  return resultEnvelope(inspection, failures, disposition);
}

export async function validateCheckedInRandomTpRightsDisposition(
  { root = process.cwd(), beforeFinalAuditForTest = null } = {},
) {
  const canonicalRoot = await canonicalRepositoryRoot(root);
  const fileSnapshots = [];
  const bytes = await readBoundedRegularFile(
    canonicalRoot,
    RANDOM_TP_RIGHTS_DISPOSITION_PATH,
    MAX_DISPOSITION_BYTES,
    fileSnapshots,
  );
  return validateRandomTpRightsDispositionRepository(bytes, {
    root: canonicalRoot,
    dispositionSnapshot: fileSnapshots[0],
    beforeFinalAuditForTest,
  });
}

function validatePrivateScope(contract, failures) {
  compare(failures, 'rights-disposition.privateScope.purposeId',
    contract.purposeId, 'private-random-tp-foundation-model-evaluation-only');
  compare(failures, 'rights-disposition.privateScope.benchmark.datasetId',
    contract.benchmark?.datasetId, EXPECTED_RANDOM_TP_BINDING.id);
  compare(failures, 'rights-disposition.privateScope.benchmark.datasetSha256',
    contract.benchmark?.datasetSha256, EXPECTED_RANDOM_TP_BINDING.projectFrozenSha256);
  for (const [key, expected] of [
    ['sourceRevision', EXPECTED_RANDOM_TP_BINDING.revision],
    ['gitBlobOid', EXPECTED_RANDOM_TP_BINDING.gitBlobOid],
    ['idSetSha256', EXPECTED_RANDOM_TP_BINDING.idSetSha256],
    ['structureManifestSha256', EXPECTED_RANDOM_TP_BINDING.structureManifestSha256],
    ['labelManifestSha256', EXPECTED_RANDOM_TP_BINDING.labelManifestSha256],
  ]) compare(failures, `rights-disposition.privateScope.benchmark.${key}`,
    contract.benchmark?.[key], expected);
  compare(failures, 'rights-disposition.privateScope.benchmark.frameCount.value',
    contract.benchmark?.frameCount?.value, 693);
  compare(failures, 'rights-disposition.privateScope.benchmark.atomsPerFrame.value',
    contract.benchmark?.atomsPerFrame?.value, 16);
  compare(failures, 'rights-disposition.privateScope.models', contract.models,
    EXPECTED_PRIVATE_SCOPE_MODELS);
  compare(failures, 'rights-disposition.privateScope.runtime', contract.runtime,
    EXPECTED_PRIVATE_SCOPE_RUNTIME);
  const budget = contract.requestBudget;
  const expectedBudget = {
    authoritativePredictions: 1_386,
    repeatPredictions: 1_386,
    invariancePredictions: 80,
    forceFiniteDifferencePredictions: 712,
    stressFiniteDifferencePredictions: 480,
    totalMaximumRequests: 4_044,
  };
  for (const [key, value] of Object.entries(expectedBudget)) {
    compare(failures, `rights-disposition.privateScope.requestBudget.${key}.value`,
      budget?.[key]?.value, value);
  }
  const componentTotal = Object.keys(expectedBudget)
    .filter((key) => key !== 'totalMaximumRequests')
    .reduce((sum, key) => sum + (budget?.[key]?.value ?? Number.NaN), 0);
  compare(failures, 'rights-disposition.privateScope.requestBudget.recomputedTotal',
    componentTotal, budget?.totalMaximumRequests?.value);
  compare(failures, 'rights-disposition.privateScope.environment', contract.environment, {
    host: 'one-private-ephemeral-linux-amd64-cpu-runner',
    producerJobs: 1,
    freshSequentialModelContainers: 4,
    networkDuringModelExecution: 'none',
    rootFilesystem: 'read-only',
    user: '65532:65532',
    capabilities: 'drop-all',
    noNewPrivileges: true,
    hostSocketsMounted: false,
    hostSecretsMounted: false,
    referenceLabelsMountedInModelContainers: false,
    sharedWritableMountsBetweenExecutions: false,
  });
  compare(failures, 'rights-disposition.privateScope.access', contract.access, {
    currentlyAuthorizedPrincipals: [],
    rawDatasetRoles: [
      'trusted-private-preprocessor',
      'producer-independent-label-bearing-host-verifier',
    ],
    structureProjectionRoles: [
      'isolated-mattersim-container',
      'isolated-mace-container',
    ],
    referenceLabelRoles: ['producer-independent-label-bearing-host-verifier'],
    modelContainersMayAccessReferenceLabels: false,
    publicBrowserAccessAllowed: false,
    thirdPartyServiceAccessAllowed: false,
    publicRepositoryAccessAllowed: false,
  });
  compare(failures, 'rights-disposition.privateScope.retention', contract.retention, {
    basis: 'single-private-ephemeral-runner-lifetime-only',
    persistentDatasetCopyAllowed: false,
    persistentReferenceLabelCopyAllowed: false,
    persistentPerRecordPredictionCopyAllowed: false,
    checkpointOrRuntimeBundlePublicationAllowed: false,
    publicArtifactUploadAllowed: false,
    publicLogDisclosureAllowed: false,
    encryptedCopyChangesRightsStatus: false,
    deleteBeforeRunnerTeardownRequired: true,
    independentDeletionEvidenceRequired: true,
  });
  compare(failures, 'rights-disposition.privateScope.excludedUses', contract.excludedUses, [
    'training-or-finetuning',
    'any-dataset-other-than-the-frozen-random-tp-bytes',
    'gpu-or-non-linux-amd64-execution',
    'public-artifact-or-log-publication',
    'runtime-or-checkpoint-redistribution',
    'browser-or-frontend-ingestion',
    'scientific-promotion-or-sota-ranking',
    'data-leakage-certification',
    'dynamics-future-rollout-causal-or-industrial-control-use',
  ]);
}

function validateDecisionSlots(decisions, failures) {
  if (!isRecord(decisions)) {
    failures.push('rights-disposition.decisions: three named decision slots are required');
    return;
  }
  const expectedKeys = Object.keys(EXPECTED_RIGHTS_DECISIONS);
  compare(failures, 'rights-disposition.decisions.keys', Object.keys(decisions), expectedKeys);
  for (const key of expectedKeys) {
    const decision = decisions[key];
    if (!isRecord(decision)) {
      failures.push(`rights-disposition.decisions.${key}: exact decision object required`);
      continue;
    }
    if (decision.allowed !== false || decision.disposition !== 'abstain') {
      failures.push(`rights-disposition.decisions.${key}: v0.1 has no granting state`);
    }
    compare(failures, `rights-disposition.decisions.${key}.rightId`,
      decision.rightId, EXPECTED_RIGHTS_DECISIONS[key].rightId);
    compare(failures, `rights-disposition.decisions.${key}.effect`,
      decision.effect, EXPECTED_RIGHTS_DECISIONS[key].effect);
    compare(failures, `rights-disposition.decisions.${key}.reasonCodes`,
      decision.reasonCodes, EXPECTED_RIGHTS_DECISIONS[key].reasonCodes);
  }
}

function validateReasonEvidence(disposition, failures) {
  const decisions = disposition.decisions;
  const expectedCodes = Object.values(EXPECTED_RIGHTS_DECISIONS)
    .flatMap(({ reasonCodes }) => reasonCodes);
  const reasonEvidence = disposition.reasonEvidence;
  if (!isRecord(reasonEvidence)) {
    failures.push('rights-disposition.reasonEvidence: exact reason map required');
    return;
  }
  compare(failures, 'rights-disposition.reasonEvidence.keys',
    Object.keys(reasonEvidence), expectedCodes);
  const sourceIds = new Set(EXPECTED_PRIMARY_SOURCES.map(({ id }) => id));
  for (const code of expectedCodes) {
    const references = reasonEvidence[code];
    if (!Array.isArray(references) || new Set(references).size !== references.length) {
      failures.push(`rights-disposition.reasonEvidence.${code}: unique source ID array required`);
      continue;
    }
    references.forEach((sourceId) => {
      if (!sourceIds.has(sourceId)) {
        failures.push(`rights-disposition.reasonEvidence.${code}: unknown source ${String(sourceId)}`);
      }
    });
  }
  const observedCodes = isRecord(decisions)
    ? Object.values(decisions).flatMap((decision) => decision?.reasonCodes ?? [])
    : [];
  compare(failures, 'rights-disposition.reasonEvidence.decisionProjection',
    observedCodes, expectedCodes);
}

function validateLocalEvidenceProjection(disposition, evidence, failures) {
  const parsed = {};
  for (const key of [
    'datasetCatalog',
    'reproductionPlan',
    'runtimeLock',
    'mattersimRuntimeInputs',
    'maceRuntimeInputs',
    'executionPreflight',
    'observerContract',
    'legacyReceiptSchema',
  ]) {
    if (!evidence[key]) continue;
    try {
      parsed[key] = parseJsonRejectingDuplicateMembers(evidence[key]);
    } catch (error) {
      failures.push(`rights-disposition.localEvidence.${key}: invalid or duplicate-member JSON (${message(error)})`);
    }
  }
  const dataset = parsed.datasetCatalog?.datasets?.find(
    ({ id }) => id === EXPECTED_RANDOM_TP_BINDING.id,
  );
  if (!dataset) failures.push('rights-disposition.projection.datasetCatalog: exact Random-TP entry missing');
  else {
    compare(failures, 'rights-disposition.projection.datasetCatalog.schemaVersion',
      parsed.datasetCatalog.schemaVersion, EXPECTED_LOCAL_EVIDENCE.datasetCatalog.schemaVersion);
    const fields = {
      id: EXPECTED_RANDOM_TP_BINDING.id,
      sourceCommit: EXPECTED_RANDOM_TP_BINDING.revision,
      sizeBytes: EXPECTED_RANDOM_TP_BINDING.sizeBytes,
      sha256: EXPECTED_RANDOM_TP_BINDING.projectFrozenSha256,
      frames: EXPECTED_RANDOM_TP_BINDING.frames,
      atomsPerFrame: EXPECTED_RANDOM_TP_BINDING.atomsPerFrame,
      idSetSha256: EXPECTED_RANDOM_TP_BINDING.idSetSha256,
      structureManifestSha256: EXPECTED_RANDOM_TP_BINDING.structureManifestSha256,
      labelManifestSha256: EXPECTED_RANDOM_TP_BINDING.labelManifestSha256,
      license: EXPECTED_RANDOM_TP_BINDING.licenseStatus,
      redistribute: false,
    };
    for (const [field, expected] of Object.entries(fields)) {
      compare(failures, `rights-disposition.projection.datasetCatalog.${field}`,
        dataset[field], expected);
    }
  }

  const plan = parsed.reproductionPlan;
  if (plan) {
    compare(failures, 'rights-disposition.projection.reproductionPlan.schemaVersion',
      plan.schemaVersion, EXPECTED_LOCAL_EVIDENCE.reproductionPlan.schemaVersion);
    const benchmark = plan.benchmarks?.find(({ id }) => id === EXPECTED_RANDOM_TP_BINDING.id);
    compare(failures, 'rights-disposition.projection.reproductionPlan.benchmark.sourceCommit',
      benchmark?.sourceCommit, EXPECTED_RANDOM_TP_BINDING.revision);
    compare(failures, 'rights-disposition.projection.reproductionPlan.benchmark.artifact.sha256',
      benchmark?.artifact?.sha256, EXPECTED_RANDOM_TP_BINDING.projectFrozenSha256);
    compare(failures, 'rights-disposition.projection.reproductionPlan.benchmark.redistribute',
      benchmark?.redistribute, false);
    for (const [model, binding] of Object.entries(EXPECTED_CHECKPOINT_BINDINGS)) {
      const candidate = plan.models?.find(({ id }) => id === binding.modelId);
      for (const [field, actual, expected] of [
        ['sourceRevision', candidate?.sourceCommit, binding.sourceRevision],
        ['packageName', candidate?.package?.name, binding.packageName],
        ['packageVersion', candidate?.package?.version, binding.packageVersion],
        ['checkpointUrl', candidate?.checkpoint?.url, binding.url],
        ['checkpointSizeBytes', candidate?.checkpoint?.sizeBytes, binding.sizeBytes],
        ['checkpointSha256', candidate?.checkpoint?.sha256, binding.sha256],
      ]) compare(failures, `rights-disposition.projection.reproductionPlan.${model}.${field}`,
        actual, expected);
    }
  }

  const lock = parsed.runtimeLock;
  if (lock) {
    compare(failures, 'rights-disposition.projection.runtimeLock.schemaVersion',
      lock.schemaVersion, EXPECTED_LOCAL_EVIDENCE.runtimeLock.schemaVersion);
    compare(failures, 'rights-disposition.projection.runtimeLock.state',
      lock.state, EXPECTED_LOCAL_EVIDENCE.runtimeLock.state);
    compare(failures, 'rights-disposition.projection.runtimeLock.semanticDigest',
      sha256(Buffer.from(canonicalJson(lock), 'utf8')),
      EXPECTED_LOCAL_EVIDENCE.runtimeLock.semanticDigest);
    compare(failures, 'rights-disposition.projection.runtimeLock.runnerDigest',
      lock.identities?.runnerDigest, EXPECTED_RUNTIME_BINDING.runnerDigest);
    compare(failures, 'rights-disposition.projection.runtimeLock.sourceManifestDigest',
      lock.runtimeSource?.sourceManifestDigest, EXPECTED_RUNTIME_BINDING.sourceManifestDigest);
    compare(failures, 'rights-disposition.projection.runtimeLock.materializationDigest',
      lock.runtimeSource?.materializationDigest, EXPECTED_RUNTIME_BINDING.materializationDigest);
    compare(failures, 'rights-disposition.projection.runtimeLock.dependencyLockDigests',
      lock.identities?.dependencyLockDigests, {
        mattersim: EXPECTED_RUNTIME_BINDING.mattersim.dependencyLockDigest,
        mace: EXPECTED_RUNTIME_BINDING.mace.dependencyLockDigest,
      });
    compare(failures, 'rights-disposition.projection.runtimeLock.runtimeInputManifestDigests',
      lock.identities?.runtimeInputManifestDigests, {
        mattersim: EXPECTED_RUNTIME_BINDING.mattersim.runtimeInputManifestDigest,
        mace: EXPECTED_RUNTIME_BINDING.mace.runtimeInputManifestDigest,
      });
    compare(failures, 'rights-disposition.projection.runtimeLock.ociPromotionTrustRootsAvailable',
      lock.identities?.ociImages?.promotionTrustRoot, false);
  }

  validateRuntimeManifest('mattersim', parsed.mattersimRuntimeInputs,
    EXPECTED_RUNTIME_BINDING.mattersim, failures);
  validateRuntimeManifest('mace', parsed.maceRuntimeInputs,
    EXPECTED_RUNTIME_BINDING.mace, failures);
  validatePreflightProjection(disposition, parsed.executionPreflight, failures);
  validateObserverCompatibility(parsed.observerContract, failures);
  validateLegacyReceiptCompatibility(parsed.legacyReceiptSchema, failures);

  if (evidence.maceRuntimeLicenseNotice) {
    let text = '';
    try {
      text = new TextDecoder('utf-8', { fatal: true }).decode(
        evidence.maceRuntimeLicenseNotice,
      );
    } catch (error) {
      failures.push(`rights-disposition.projection.maceRuntimeLicenseNotice: invalid UTF-8 (${message(error)})`);
    }
    if (!text.includes('`python-hostlist` 2.3.0 is GPL-2.0-or-later')) {
      failures.push('rights-disposition.projection.maceRuntimeLicenseNotice: GPL-2.0-or-later notice missing');
    }
    if (!/it does not\s+grant binary redistribution/.test(text)) {
      failures.push('rights-disposition.projection.maceRuntimeLicenseNotice: non-grant boundary missing');
    }
  }
}

function validateRuntimeManifest(model, manifest, binding, failures) {
  if (!manifest) return;
  compare(failures, `rights-disposition.projection.runtimeInputs.${model}.schemaVersion`,
    manifest.schemaVersion, 'tf.atomistic-runtime-inputs/0.2');
  compare(failures, `rights-disposition.projection.runtimeInputs.${model}.model`,
    manifest.model, model);
  compare(failures, `rights-disposition.projection.runtimeInputs.${model}.modelId`,
    manifest.modelId, EXPECTED_CHECKPOINT_BINDINGS[model].modelId);
  compare(failures, `rights-disposition.projection.runtimeInputs.${model}.platform`,
    manifest.platform, EXPECTED_RUNTIME_BINDING.platform);
  compare(failures, `rights-disposition.projection.runtimeInputs.${model}.baseImage.indexDigest`,
    manifest.baseImage?.indexDigest, EXPECTED_RUNTIME_BINDING.baseImageIndexDigest);
  compare(failures, `rights-disposition.projection.runtimeInputs.${model}.baseImage.platformManifestDigest`,
    manifest.baseImage?.platformManifestDigest,
    EXPECTED_RUNTIME_BINDING.baseImagePlatformManifestDigest);
  compare(failures, `rights-disposition.projection.runtimeInputs.${model}.dependencyLockDigest`,
    manifest.buildInputs?.dependencyLock?.sha256, binding.dependencyLockDigest);
  compare(failures, `rights-disposition.projection.runtimeInputs.${model}.runnerDigest`,
    manifest.buildInputs?.runner?.digest, EXPECTED_RUNTIME_BINDING.runnerDigest);
  for (const field of [
    'dependencyGraphDigest',
    'installedPathDigest',
    'runtimeInstalledPathDigest',
  ]) compare(failures, `rights-disposition.projection.runtimeInputs.${model}.${field}`,
    manifest.buildInputs?.wheelhouse?.[field], binding[field]);
  compare(failures, `rights-disposition.projection.runtimeInputs.${model}.materializationDigest`,
    manifest.runtimeSource?.materializationDigest, EXPECTED_RUNTIME_BINDING.materializationDigest);
  compare(failures, `rights-disposition.projection.runtimeInputs.${model}.buildNetwork`,
    manifest.policy?.build?.network, 'none');
  compare(failures, `rights-disposition.projection.runtimeInputs.${model}.runtimeNetwork`,
    manifest.policy?.runtime?.network, 'none');
  compare(failures, `rights-disposition.projection.runtimeInputs.${model}.sbom`,
    manifest.policy?.build?.sbom, 'disabled');
  compare(failures, `rights-disposition.projection.runtimeInputs.${model}.promotionEligible`,
    manifest.claims?.promotionEligible, false);
  compare(failures, `rights-disposition.projection.runtimeInputs.${model}.reproduced`,
    manifest.claims?.reproduced, false);
  if (model === 'mace') {
    const derived = manifest.buildInputs?.wheelhouse?.derivedWheelProvenance;
    compare(failures, 'rights-disposition.projection.runtimeInputs.mace.pythonHostlist', {
      sourceDistributionSha256: derived?.sourceSha256,
      derivedWheelSha256: derived?.wheelSha256,
      derivedWheelProvenanceManifestDigest: derived?.manifestDigest,
      promotionEligible: derived?.promotionEligible,
    }, {
      sourceDistributionSha256: binding.pythonHostlist.sourceDistributionSha256,
      derivedWheelSha256: binding.pythonHostlist.derivedWheelSha256,
      derivedWheelProvenanceManifestDigest:
        binding.pythonHostlist.derivedWheelProvenanceManifestDigest,
      promotionEligible: false,
    });
  } else {
    compare(failures, 'rights-disposition.projection.runtimeInputs.mattersim.derivedWheel',
      manifest.buildInputs?.wheelhouse?.derivedWheelProvenance, null);
  }
}

function validatePreflightProjection(disposition, preflight, failures) {
  if (!preflight) return;
  compare(failures, 'rights-disposition.projection.executionPreflight.schemaVersion',
    preflight.schemaVersion, EXPECTED_LOCAL_EVIDENCE.executionPreflight.schemaVersion);
  compare(failures, 'rights-disposition.projection.executionPreflight.status',
    preflight.status, 'frozen-topology-and-runtime-inputs-not-executable');
  if (!isRecord(preflight.dispatchGates)
      || Object.values(preflight.dispatchGates).some((value) => value !== false)) {
    failures.push('rights-disposition.projection.executionPreflight.dispatchGates: every gate must remain false');
  }
  if (!isRecord(preflight.claims)
      || Object.values(preflight.claims).some((value) => value !== false)) {
    failures.push('rights-disposition.projection.executionPreflight.claims: every claim must remain false');
  }
  compare(failures, 'rights-disposition.projection.executionPreflight.publication.enabled',
    preflight.candidateTopology?.publication?.enabled, false);
  compare(failures, 'rights-disposition.projection.executionPreflight.publication.allowedArtifactPaths',
    preflight.candidateTopology?.publication?.allowedArtifactPaths, []);
  compare(failures, 'rights-disposition.projection.executionPreflight.publication.runtimeRedistributionAllowed',
    preflight.candidateTopology?.publication?.runtimeRedistributionAllowed, false);
  const scope = disposition.intendedPrivateComputeScope?.contract;
  compare(failures, 'rights-disposition.projection.executionPreflight.producerJobs',
    scope?.environment?.producerJobs, preflight.candidateTopology?.producerJobCount);
  compare(failures, 'rights-disposition.projection.executionPreflight.freshContainers',
    scope?.environment?.freshSequentialModelContainers,
    preflight.candidateTopology?.requiredContainerExecutionsTotal);
  compare(failures, 'rights-disposition.projection.executionPreflight.authoritativePredictions',
    scope?.requestBudget?.authoritativePredictions?.value,
    preflight.preregisteredValidation?.determinismPerModel?.authoritativePredictionRecordsTotal?.value);
  compare(failures, 'rights-disposition.projection.executionPreflight.repeatPredictions',
    scope?.requestBudget?.repeatPredictions?.value,
    preflight.preregisteredValidation?.determinismPerModel?.repeatValidationPredictionRecordsTotal?.value);
  compare(failures, 'rights-disposition.projection.executionPreflight.invariancePredictions',
    scope?.requestBudget?.invariancePredictions?.value,
    2 * (preflight.preregisteredValidation?.invariancePerModel?.requiredCases?.value ?? Number.NaN));
  compare(failures, 'rights-disposition.projection.executionPreflight.forceFiniteDifferencePredictions',
    scope?.requestBudget?.forceFiniteDifferencePredictions?.value,
    2 * 2 * (preflight.preregisteredValidation?.forceFiniteDifferencePerModel?.steps?.values?.length ?? Number.NaN)
      * (preflight.preregisteredValidation?.forceFiniteDifferencePerModel?.requiredCases?.value ?? Number.NaN));
  compare(failures, 'rights-disposition.projection.executionPreflight.stressFiniteDifferencePredictions',
    scope?.requestBudget?.stressFiniteDifferencePredictions?.value,
    2 * 2 * (preflight.preregisteredValidation?.stressFiniteDifferencePerModel?.strainSteps?.values?.length ?? Number.NaN)
      * (preflight.preregisteredValidation?.stressFiniteDifferencePerModel?.requiredCases?.value ?? Number.NaN));
}

function validateObserverCompatibility(observer, failures) {
  if (!observer) return;
  compare(failures, 'rights-disposition.compatibility.observer.schemaVersion',
    observer.schemaVersion, EXPECTED_LOCAL_EVIDENCE.observerContract.schemaVersion);
  compare(failures, 'rights-disposition.compatibility.observer.rightsPolicy.status',
    observer.rightsPolicy?.status, 'rights-not-cleared');
  for (const key of [
    'privateExecutionAllowed',
    'aggregatePublicationAllowed',
    'runtimeRedistributionAllowed',
  ]) compare(failures, `rights-disposition.compatibility.observer.rightsPolicy.${key}`,
    observer.rightsPolicy?.[key], false);
  compare(failures, 'rights-disposition.compatibility.observer.publication',
    observer.publication, {
      enabled: false,
      allowedArtifactPaths: [],
      artifactUploadAllowed: false,
      privateExecutionAllowed: false,
      aggregatePublicationAllowed: false,
      runtimeRedistributionAllowed: false,
      aggregateReceiptRightsDispositionRecorded: false,
    });
  if (!isRecord(observer.outcomePolicy?.claims)
      || Object.values(observer.outcomePolicy.claims).some((value) => value !== false)) {
    failures.push('rights-disposition.compatibility.observer.claims: every claim must remain false');
  }
}

function validateLegacyReceiptCompatibility(schema, failures) {
  if (!schema) return;
  compare(failures, 'rights-disposition.compatibility.legacyReceipt.$id', schema.$id,
    'https://tailing.future/schemas/atomistic-full-candidate-receipt/0.2');
  compare(failures, 'rights-disposition.compatibility.legacyReceipt.schemaVersion',
    schema.properties?.schemaVersion?.const,
    EXPECTED_LOCAL_EVIDENCE.legacyReceiptSchema.schemaVersion);
}

function resultEnvelope(inspection, failures, disposition) {
  const effectiveRights = Object.freeze({
    privateExecutionAllowed: false,
    aggregatePublicationAllowed: false,
    runtimeRedistributionAllowed: false,
  });
  const blockers = disposition
    ? Object.values(EXPECTED_RIGHTS_DECISIONS).flatMap(({ reasonCodes }) => reasonCodes)
    : [];
  const authority = assessRightsAuthority(
    disposition?.authorityGate?.authorizationRecord,
    { expectedScopeDigest: disposition?.intendedPrivateComputeScope?.scopeDigest },
  );
  const uniqueFailures = uniqueSorted(failures);
  return {
    ...inspection,
    failures: uniqueFailures,
    blockers: Object.freeze([...blockers]),
    authority,
    effectiveRights,
    rightsCleared: false,
    dispatchEligible: false,
    valid: uniqueFailures.length === 0,
  };
}

function authorityAssessment(blockers) {
  return Object.freeze({
    authorizationUsableForV01: false,
    authorizesRights: false,
    effectiveRights: Object.freeze({
      privateExecutionAllowed: false,
      aggregatePublicationAllowed: false,
      runtimeRedistributionAllowed: false,
    }),
    blockers: Object.freeze(uniqueSorted(blockers)),
  });
}

async function readPolicyFile(root, relativePath, maximumBytes, overrides, snapshots) {
  if (Object.hasOwn(overrides, relativePath)) return toBuffer(overrides[relativePath]);
  return readBoundedRegularFile(root, relativePath, maximumBytes, snapshots);
}

async function canonicalRepositoryRoot(root) {
  const absolute = path.resolve(root);
  const canonical = await realpath(absolute);
  if (absolute !== canonical) throw new Error('repository root crosses a symlink boundary');
  return canonical;
}

async function readBoundedRegularFile(
  root,
  relativePath,
  maximumBytes,
  snapshots = null,
) {
  if (typeof relativePath !== 'string' || path.isAbsolute(relativePath)
      || relativePath.includes('\\')
      || relativePath.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error('bound path must be one canonical repository-relative path');
  }
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error('bound byte limit is invalid');
  }
  const absolute = path.join(root, relativePath);
  if (await realpath(absolute) !== absolute) throw new Error('bound file crosses a symlink boundary');
  const before = await lstat(absolute, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || (before.mode & 0o777n) !== EXPECTED_FILE_MODE
      || before.size < 1n || before.size > BigInt(maximumBytes)) {
    throw new Error('bound file must be one mode-0644, singly linked, bounded regular file');
  }
  if (typeof fsConstants.O_NOFOLLOW !== 'number') throw new Error('O_NOFOLLOW unavailable');
  const handle = await open(absolute, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const opened = await handle.stat({ bigint: true });
    if (!sameIdentity(before, opened)) throw new Error('bound file changed before read');
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (!sameIdentity(opened, after) || bytes.length !== Number(after.size)) {
      throw new Error('bound file changed during read');
    }
    if (await realpath(absolute) !== absolute) throw new Error('bound file changed path after read');
    const finalPath = await lstat(absolute, { bigint: true });
    if (!sameIdentity(after, finalPath)) throw new Error('bound file changed after read');
    if (snapshots !== null) snapshots.push(Object.freeze({
      absolutePath: absolute,
      relativePath,
      identity: finalPath,
    }));
    return bytes;
  } finally {
    await handle.close();
  }
}

async function auditPolicyFileSnapshots(snapshots) {
  const failures = [];
  for (const snapshot of snapshots) {
    try {
      if (await realpath(snapshot.absolutePath) !== snapshot.absolutePath) {
        throw new Error('path crosses a symlink boundary');
      }
      const current = await lstat(snapshot.absolutePath, { bigint: true });
      if (!sameIdentity(snapshot.identity, current)) throw new Error('identity changed');
    } catch (error) {
      failures.push(
        `rights-disposition.repositorySnapshot.${snapshot.relativePath}: bound file changed after snapshot (${message(error)})`,
      );
    }
  }
  return failures;
}

function sameIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function canonicalTimestamp(value) {
  if (typeof value !== 'string') return Number.NaN;
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch) || new Date(epoch).toISOString() !== value) return Number.NaN;
  return epoch;
}

function compare(failures, label, actual, expected) {
  if (!isDeepStrictEqual(actual, expected)) failures.push(`${label}: exact contract mismatch`);
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof Uint8Array) {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  if (typeof bytes === 'string') return Buffer.from(bytes, 'utf8');
  throw new TypeError('rights-disposition bytes must be a string, Buffer or Uint8Array');
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function message(error) {
  return error instanceof Error ? error.message : String(error);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach((entry) => deepFreeze(entry));
  }
  return value;
}
