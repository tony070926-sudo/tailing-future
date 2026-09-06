import { constants as fsConstants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  canonicalJson,
  parseJsonRejectingDuplicateMembers,
} from './runtime-lock-policy.mjs';
import {
  EXPECTED_CHECKPOINT_BINDINGS,
  EXPECTED_RANDOM_TP_BINDING,
  RANDOM_TP_PRIVATE_COMPUTE_SCOPE_DIGEST,
  RANDOM_TP_RIGHTS_DISPOSITION_PATH,
  RANDOM_TP_RIGHTS_DISPOSITION_RAW_DIGEST,
  RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_PATH,
  RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_RAW_DIGEST,
  RANDOM_TP_RIGHTS_DISPOSITION_SEMANTIC_DIGEST,
  computePrivateComputeScopeDigest,
  inspectRandomTpRightsDispositionBytes,
  sha256,
  validateRandomTpRightsDispositionSchema,
} from './random-tp-rights-disposition-policy.mjs';

export const RANDOM_TP_AUTHORITY_REQUEST_PATH =
  'evaluation/atomistic/random-tp-private-execution-authority-request-v0.1.json';
export const RANDOM_TP_AUTHORITY_REQUEST_MARKDOWN_PATH =
  'evaluation/atomistic/random-tp-private-execution-authority-request-v0.1.md';
export const RANDOM_TP_AUTHORITY_REQUEST_SCHEMA_PATH =
  'schemas/atomistic-random-tp-private-execution-authority-request.schema.json';
export const RANDOM_TP_AUTHORITY_REQUEST_RAW_DIGEST =
  'sha256:e3d8d7cca9b83c2ff10d85c0411e88f2b98628cf41113ead86e0b2fdcda91049';
export const RANDOM_TP_AUTHORITY_REQUEST_SEMANTIC_DIGEST =
  'sha256:8a3d60d59db5773945698759075176c48a92789450cbdba5c54ad26b32ca3ea5';
export const RANDOM_TP_AUTHORITY_REQUEST_SCHEMA_RAW_DIGEST =
  'sha256:4330cf199dd2c3e56066ea80932add207aab6ef3abc578f415a9a4f910ec36e5';
export const RANDOM_TP_AUTHORITY_REQUEST_MARKDOWN_RAW_DIGEST =
  'sha256:f4f534ee5af4953ab413231deab8419c56e7aa995656bd0596c20894ca3e1078';

const MAX_JSON_BYTES = 256 * 1024;
const MAX_SCHEMA_BYTES = 256 * 1024;
const MAX_MARKDOWN_BYTES = 64 * 1024;
const MAX_RIGHTS_BYTES = 256 * 1024;
const MAX_RIGHTS_SCHEMA_BYTES = 256 * 1024;
const EXPECTED_FILE_MODE = 0o644n;

export function inspectRandomTpAuthorityRequestBytes(
  bytes,
  { enforceCheckedInBytes = true } = {},
) {
  const buffer = toBuffer(bytes);
  const failures = [];
  let request = null;
  let parseSucceeded = false;
  let semanticDigest = null;
  if (buffer.length < 1 || buffer.length > MAX_JSON_BYTES) {
    failures.push('authority-request.raw: byte length is outside the bounded contract');
  } else {
    try {
      request = parseJsonRejectingDuplicateMembers(buffer);
      parseSucceeded = true;
      semanticDigest = sha256(Buffer.from(canonicalJson(request), 'utf8'));
    } catch (error) {
      failures.push(`authority-request.raw: invalid or duplicate-member JSON (${message(error)})`);
    }
  }
  const rawDigest = sha256(buffer);
  if (enforceCheckedInBytes && rawDigest !== RANDOM_TP_AUTHORITY_REQUEST_RAW_DIGEST) {
    failures.push('authority-request.rawDigest: exact reviewed bytes differ');
  }
  if (enforceCheckedInBytes
      && semanticDigest !== RANDOM_TP_AUTHORITY_REQUEST_SEMANTIC_DIGEST) {
    failures.push('authority-request.semanticDigest: exact reviewed semantics differ');
  }
  return {
    request,
    parseSucceeded,
    rawDigest,
    semanticDigest,
    failures: uniqueSorted(failures),
  };
}

export function validateRandomTpAuthorityRequestSchema(request, schema) {
  const failures = [];
  try {
    const validate = new Ajv2020({
      allErrors: true,
      strict: true,
      validateFormats: false,
      validateSchema: true,
    }).compile(schema);
    if (!validate(request)) {
      failures.push(`authority-request.schema: ${JSON.stringify(validate.errors)}`);
    }
  } catch (error) {
    failures.push(`authority-request.schema: strict AJV compilation failed (${message(error)})`);
  }
  return failures;
}

export function validateRandomTpAuthorityRequestSemantics(request, rightsDisposition) {
  const failures = [];
  if (!isRecord(request)) return ['authority-request.semantic: root must be an object'];
  let digest = null;
  try {
    digest = sha256(Buffer.from(canonicalJson(request), 'utf8'));
  } catch (error) {
    failures.push(`authority-request.semantic: canonicalization failed (${message(error)})`);
  }
  if (digest !== RANDOM_TP_AUTHORITY_REQUEST_SEMANTIC_DIGEST) {
    failures.push('authority-request.semantic: exact frozen v0.1 contract digest mismatch');
  }
  compare(failures, 'authority-request.schemaVersion', request.schemaVersion,
    'tf.atomistic-random-tp-private-execution-authority-request/0.1');
  compare(failures, 'authority-request.requestId', request.requestId,
    'random-tp-private-execution-exact-scope-v0.1');
  compare(failures, 'authority-request.status', request.status,
    'draft-routing-only-not-authorization');
  compare(failures, 'authority-request.asOf', request.asOf, '2026-09-06');
  compare(failures, 'authority-request.legalAdvice', request.legalAdvice, false);
  validateDefaultDeny(request, failures);
  validateRightsBinding(request, rightsDisposition, failures);
  validateScopeSummary(request, rightsDisposition, failures);
  return uniqueSorted(failures);
}

export async function validateRandomTpAuthorityRequestRepository(
  requestBytes,
  {
    root = process.cwd(),
    enforceCheckedInBytes = true,
    fileOverrides = {},
    fileOverrideModes = null,
    requestFileMode = null,
    requestSnapshot = null,
    beforeFinalAuditForTest = null,
  } = {},
) {
  const inspection = inspectRandomTpAuthorityRequestBytes(
    requestBytes,
    { enforceCheckedInBytes },
  );
  const failures = [...inspection.failures];
  const request = inspection.request;
  const snapshots = requestSnapshot ? [requestSnapshot] : [];
  if (!inspection.parseSucceeded) return resultEnvelope(inspection, failures);
  const hasFileOverrides = Object.keys(fileOverrides).length > 0;
  if ((hasFileOverrides && requestFileMode === null)
      || (requestFileMode !== null && requestFileMode !== Number(EXPECTED_FILE_MODE))) {
    failures.push('authority-request.raw.mode: exact mode 0644 is required');
  }

  let canonicalRoot;
  try {
    canonicalRoot = await canonicalRepositoryRoot(root);
  } catch (error) {
    failures.push(`authority-request.repositoryRoot: ${message(error)}`);
    return resultEnvelope(inspection, failures);
  }

  let schema = null;
  try {
    const bytes = await readPolicyFile(
      canonicalRoot,
      RANDOM_TP_AUTHORITY_REQUEST_SCHEMA_PATH,
      MAX_SCHEMA_BYTES,
      fileOverrides,
      fileOverrideModes,
      snapshots,
    );
    if (sha256(bytes) !== RANDOM_TP_AUTHORITY_REQUEST_SCHEMA_RAW_DIGEST) {
      failures.push('authority-request.schema.rawDigest: exact reviewed schema bytes differ');
    }
    schema = parseJsonRejectingDuplicateMembers(bytes);
  } catch (error) {
    failures.push(`authority-request.schema.raw: unavailable or invalid (${message(error)})`);
  }
  if (schema) failures.push(...validateRandomTpAuthorityRequestSchema(request, schema));

  let markdown = null;
  try {
    const bytes = await readPolicyFile(
      canonicalRoot,
      RANDOM_TP_AUTHORITY_REQUEST_MARKDOWN_PATH,
      MAX_MARKDOWN_BYTES,
      fileOverrides,
      fileOverrideModes,
      snapshots,
    );
    if (sha256(bytes) !== RANDOM_TP_AUTHORITY_REQUEST_MARKDOWN_RAW_DIGEST) {
      failures.push('authority-request.markdown.rawDigest: exact reviewed Markdown bytes differ');
    }
    markdown = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    failures.push(`authority-request.markdown.raw: unavailable or invalid (${message(error)})`);
  }
  if (markdown !== null) {
    try {
      if (markdown !== renderRandomTpAuthorityRequestMarkdown(request)) {
        failures.push('authority-request.markdown: deterministic projection differs');
      }
    } catch (error) {
      failures.push(`authority-request.markdown: request cannot be projected (${message(error)})`);
    }
  }

  let rightsSchema = null;
  try {
    const bytes = await readPolicyFile(
      canonicalRoot,
      RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_PATH,
      MAX_RIGHTS_SCHEMA_BYTES,
      fileOverrides,
      fileOverrideModes,
      snapshots,
    );
    if (sha256(bytes) !== RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_RAW_DIGEST) {
      failures.push('authority-request.binding.rightsDisposition.schema.rawDigest: exact reviewed schema bytes differ');
    }
    rightsSchema = parseJsonRejectingDuplicateMembers(bytes);
  } catch (error) {
    failures.push(`authority-request.binding.rightsDisposition.schema.raw: unavailable or invalid (${message(error)})`);
  }

  let rightsDisposition = null;
  try {
    const bytes = await readPolicyFile(
      canonicalRoot,
      RANDOM_TP_RIGHTS_DISPOSITION_PATH,
      MAX_RIGHTS_BYTES,
      fileOverrides,
      fileOverrideModes,
      snapshots,
    );
    const rights = inspectRandomTpRightsDispositionBytes(bytes);
    failures.push(...rights.failures.map((failure) => `authority-request.binding.${failure}`));
    rightsDisposition = rights.disposition;
  } catch (error) {
    failures.push(`authority-request.binding.rightsDisposition: unavailable or unsafe (${message(error)})`);
  }
  if (rightsSchema !== null && rightsDisposition !== null) {
    failures.push(...validateRandomTpRightsDispositionSchema(
      rightsDisposition,
      rightsSchema,
    ).map((failure) => `authority-request.binding.${failure}`));
  }
  try {
    failures.push(...validateRandomTpAuthorityRequestSemantics(request, rightsDisposition));
  } catch (error) {
    failures.push(`authority-request.semantic: validation failed closed (${message(error)})`);
  }

  if (beforeFinalAuditForTest !== null) {
    if (typeof beforeFinalAuditForTest !== 'function') {
      failures.push('authority-request.repositorySnapshot: test audit hook must be a function');
    } else {
      try {
        await beforeFinalAuditForTest();
      } catch (error) {
        failures.push(`authority-request.repositorySnapshot: test audit hook failed (${message(error)})`);
      }
    }
  }
  failures.push(...await auditPolicyFileSnapshots(snapshots));
  return resultEnvelope(inspection, failures);
}

export async function validateCheckedInRandomTpAuthorityRequest(
  { root = process.cwd(), beforeFinalAuditForTest = null } = {},
) {
  let canonicalRoot;
  try {
    canonicalRoot = await canonicalRepositoryRoot(root);
  } catch (error) {
    const inspection = inspectRandomTpAuthorityRequestBytes(Buffer.alloc(0));
    return resultEnvelope(inspection, [
      ...inspection.failures,
      `authority-request.repositoryRoot: ${message(error)}`,
    ]);
  }
  const snapshots = [];
  let bytes;
  try {
    bytes = await readBoundedRegularFile(
      canonicalRoot,
      RANDOM_TP_AUTHORITY_REQUEST_PATH,
      MAX_JSON_BYTES,
      snapshots,
    );
  } catch (error) {
    const inspection = inspectRandomTpAuthorityRequestBytes(Buffer.alloc(0));
    return resultEnvelope(inspection, [
      ...inspection.failures,
      `authority-request.raw: unavailable or unsafe (${message(error)})`,
    ]);
  }
  return validateRandomTpAuthorityRequestRepository(bytes, {
    root: canonicalRoot,
    requestSnapshot: snapshots[0],
    beforeFinalAuditForTest,
  });
}

export function renderRandomTpAuthorityRequestMarkdown(request) {
  const scope = request.exactPrivateComputeScope;
  const benchmark = scope.benchmark;
  const [mattersim, mace] = scope.models;
  const budget = scope.requestBudget;
  return [
    '# Random-TP exact-scope private-execution authority request v0.1',
    '',
    '> **NOT AUTHORIZATION — DO NOT EXECUTE OR DISPATCH.** This is a routing-only draft request. It does not grant a right, register a workflow, authorize model execution, permit publication or redistribution, or establish a scientific result.',
    '',
    `- Request ID: \`${request.requestId}\``,
    `- Status: \`${request.status}\``,
    `- As of: \`${request.asOf}\``,
    `- Legal advice: \`${String(request.legalAdvice)}\``,
    `- Current private-execution right: \`${String(request.requestSemantics.currentRightAllowed)}\``,
    '',
    '## Determination requested',
    '',
    `Please determine whether the exact private computation identified by scope digest \`${scope.scopeDigest}\` may be authorized by a qualified dataset rights authority. The canonical scope is \`${scope.canonicalContractPath}\`.`,
    '',
    'This request covers only private execution. It does not request aggregate publication or runtime/checkpoint redistribution, and no decision may propagate from one of those rights to another.',
    '',
    '## Exact benchmark binding',
    '',
    `- Dataset: \`${benchmark.repository}\` / \`${benchmark.sourcePath}\``,
    `- Source revision: \`${benchmark.sourceRevision}\``,
    `- Git SHA-1 blob: \`${benchmark.gitBlobOid}\``,
    `- Project-frozen SHA-256: \`${benchmark.projectFrozenSha256}\``,
    `- Population: ${benchmark.frameCount.value} frames × ${benchmark.atomsPerFrame.value} atoms/frame, covering every frozen ASCII-ordered ID`,
    `- ID-set digest: \`${benchmark.idSetSha256}\``,
    `- Structure-manifest digest: \`${benchmark.structureManifestSha256}\``,
    `- Label-manifest digest: \`${benchmark.labelManifestSha256}\``,
    '',
    '## Exact model and runtime binding',
    '',
    `- MatterSim: \`${mattersim.modelId}\`, package \`${mattersim.packageName}==${mattersim.packageVersion}\`, source \`${mattersim.sourceRevision}\`, checkpoint \`${mattersim.checkpointSha256}\``,
    `- MACE: \`${mace.modelId}\`, package \`${mace.packageName}==${mace.packageVersion}\`, source \`${mace.sourceRevision}\`, foundation revision \`${mace.foundationRevision}\`, checkpoint \`${mace.checkpointSha256}\``,
    `- Canonical runtime: \`${scope.runtime.platform}\`, Python \`${scope.runtime.python}\`, CPU, ${scope.runtime.precision}, batch size ${scope.runtime.batchSize}, one thread`,
    `- Runner digest: \`${scope.runtime.runnerDigest}\``,
    `- Runtime source-manifest digest: \`${scope.runtime.sourceManifestDigest}\``,
    `- Materialization digest: \`${scope.runtime.materializationDigest}\``,
    `- Maximum request budget: ${budget.totalMaximumRequests.value.toLocaleString('en-US')} prediction requests, exactly ${budget.authoritativePredictions.value.toLocaleString('en-US')} authoritative + ${budget.repeatPredictions.value.toLocaleString('en-US')} repeats + ${budget.invariancePredictions.value} invariance + ${budget.forceFiniteDifferencePredictions.value} force finite-difference + ${budget.stressFiniteDifferencePredictions.value} stress finite-difference requests`,
    '',
    '## Execution boundary if separately authorized later',
    '',
    'The proposed computation uses one private ephemeral Linux AMD64 CPU runner and four fresh sequential model containers. Model execution has no network access, a read-only root filesystem, UID/GID `65532:65532`, no capabilities, no new privileges, no host sockets or secrets, no reference labels in model containers, and no shared writable mount between executions.',
    '',
    'No persistent dataset, reference-label or per-record-prediction copy is allowed. No public artifact or log upload is allowed. Dataset and label material must be deleted before runner teardown, with independent deletion evidence. Encryption does not change the rights status.',
    '',
    'Training or fine-tuning, any other dataset, GPU or non-Linux-AMD64 execution, public output, redistribution, browser/frontend ingestion, scientific promotion, SOTA ranking, data-leakage certification, future-rollout claims, causal claims and industrial-control use are excluded.',
    '',
    '## Routing candidates are not authority evidence',
    '',
    `- \`${request.routingCandidates[0].route}\` is an official MatterSim project contact found in the fixed README. It is a routing candidate only; its authority is not verified.`,
    `- \`${request.routingCandidates[1].route}\` is an official project issue route only; it is not a grant.`,
    `- \`${request.routingCandidates[2].route}\` is an official corporate permissions route only; it is not a dataset-specific grant.`,
    '',
    'No email, issue or permissions request has been sent by this repository change, and no response has been received.',
    '',
    '## Future response requirements',
    '',
    'A future response is unusable unless a separate versioned migration independently verifies the responding principal, its rightsholder/delegate/qualified-review mandate, a trusted document digest and signature, issue and expiry times, implementation independence, and exact equality to the scope digest above. A self-authored, unsigned, untrusted, expired, broader, narrower or ambiguous response must remain default-deny.',
    '',
    'The current `tf.atomistic-random-tp-rights-disposition/0.1` record remains an all-rights abstention. MatterSim/MACE 693×2 inference remains **NOT RUN**; no result is reproduced, comparison-eligible, SOTA-ranked, leakage-certified, causal, or fit for industrial use.',
    '',
  ].join('\n');
}

function validateDefaultDeny(request, failures) {
  compare(failures, 'authority-request.requestSemantics', request.requestSemantics, {
    rightId: 'private-execution',
    decisionRequested: 'dataset-specific-authority-determination-for-the-exact-bound-scope',
    currentRightAllowed: false,
    requestIsAuthorization: false,
    requestCreatesPermission: false,
    requestMayRegisterWorkflow: false,
    requestMayDispatchWorkflow: false,
    requestMayExecuteModels: false,
    requestMayPublishArtifacts: false,
    requestMayRedistributeRuntimeOrCheckpoints: false,
  });
  compare(failures, 'authority-request.rightsIndependence', request.rightsIndependence, {
    privateExecutionRequested: true,
    aggregatePublicationRequested: false,
    runtimeRedistributionRequested: false,
    crossDecisionGrantPropagationAllowed: false,
    privateExecutionMayImplyAggregatePublication: false,
    privateExecutionMayImplyRuntimeRedistribution: false,
    aggregatePublicationMayImplyRuntimeRedistribution: false,
  });
  compare(failures, 'authority-request.outboundAction', request.outboundAction, {
    performed: false,
    authorizedByUser: false,
    messageDispatched: false,
    issueCreated: false,
    externalRecordId: null,
  });
  compare(failures, 'authority-request.authorizationState', request.authorizationState, {
    authorizationRecord: null,
    qualifiedAuthorityIdentified: false,
    datasetRightsholderIdentified: false,
    mandateChainVerified: false,
    trustVerified: false,
    authorizationUsable: false,
  });
  for (const field of ['effects', 'claims']) {
    if (!isRecord(request[field])
        || Object.values(request[field]).some((value) => value !== false)) {
      failures.push(`authority-request.${field}: every value must remain false`);
    }
  }
  if (!Array.isArray(request.routingCandidates)
      || request.routingCandidates.length !== 3
      || request.routingCandidates.some((route) => !isRecord(route)
        || route.routingOnly !== true
        || route.authorityVerified !== false
        || route.contactAttempted !== false
        || route.responseReceived !== false)) {
    failures.push('authority-request.routingCandidates: routes must remain uncontacted and non-authoritative');
  }
  const required = request.authorityEvidenceRequiredForAnyFutureMigration;
  if (!isRecord(required)
      || required.requestArtifactAcceptedAsAuthority !== false
      || required.selfAuthoredAuthorityAccepted !== false
      || required.unsignedOrSelfAssertedResponseAccepted !== false
      || required.futureGrantRequiresSeparateVersionedMigration !== true) {
    failures.push('authority-request.futureAuthority: request cannot satisfy a future authority gate');
  }
}

function validateRightsBinding(request, rightsDisposition, failures) {
  const binding = request.rightsDispositionBinding;
  compare(failures, 'authority-request.rightsDispositionBinding',
    binding, {
      path: RANDOM_TP_RIGHTS_DISPOSITION_PATH,
      schemaVersion: 'tf.atomistic-random-tp-rights-disposition/0.1',
      rawDigest: RANDOM_TP_RIGHTS_DISPOSITION_RAW_DIGEST,
      semanticDigest: RANDOM_TP_RIGHTS_DISPOSITION_SEMANTIC_DIGEST,
      schemaPath: RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_PATH,
      schemaRawDigest: RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_RAW_DIGEST,
      currentStatus: 'reviewed-abstention-all-rights-not-cleared',
      privateExecutionAllowed: false,
      aggregatePublicationAllowed: false,
      runtimeRedistributionAllowed: false,
    });
  if (!isRecord(rightsDisposition)) {
    failures.push('authority-request.rightsDispositionBinding: exact disposition is unavailable');
    return;
  }
  if (rightsDisposition.status !== binding?.currentStatus
      || rightsDisposition.decisions?.privateExecution?.allowed !== false
      || rightsDisposition.decisions?.aggregatePublication?.allowed !== false
      || rightsDisposition.decisions?.runtimeRedistribution?.allowed !== false
      || rightsDisposition.authorityGate?.authorizationRecord !== null) {
    failures.push('authority-request.rightsDispositionBinding: bound rights remain default-deny');
  }
}

function validateScopeSummary(request, rightsDisposition, failures) {
  const scope = request.exactPrivateComputeScope;
  const contract = rightsDisposition?.intendedPrivateComputeScope?.contract;
  if (!isRecord(scope)) {
    failures.push('authority-request.privateScope: exact private compute scope must be an object');
    return;
  }
  compare(failures, 'authority-request.privateScope.scopeDigest',
    scope?.scopeDigest, RANDOM_TP_PRIVATE_COMPUTE_SCOPE_DIGEST);
  compare(failures, 'authority-request.privateScope.status',
    scope?.status, 'proposed-not-authorized');
  compare(failures, 'authority-request.privateScope.purposeId',
    scope?.purposeId, 'private-random-tp-foundation-model-evaluation-only');
  if (!isRecord(contract)) {
    failures.push('authority-request.privateScope.contract: bound contract is unavailable');
    return;
  }
  try {
    compare(failures, 'authority-request.privateScope.recomputedScopeDigest',
      computePrivateComputeScopeDigest(contract), scope.scopeDigest);
  } catch (error) {
    failures.push(`authority-request.privateScope: cannot recompute scope digest (${message(error)})`);
  }
  const benchmark = scope.benchmark;
  compare(failures, 'authority-request.privateScope.benchmark.identity', {
    datasetId: benchmark?.datasetId,
    repository: benchmark?.repository,
    sourcePath: benchmark?.sourcePath,
    sourceRevision: benchmark?.sourceRevision,
    gitObjectFormat: benchmark?.gitObjectFormat,
    gitBlobOid: benchmark?.gitBlobOid,
    projectFrozenSha256: benchmark?.projectFrozenSha256,
    idSetSha256: benchmark?.idSetSha256,
    structureManifestSha256: benchmark?.structureManifestSha256,
    labelManifestSha256: benchmark?.labelManifestSha256,
  }, {
    datasetId: EXPECTED_RANDOM_TP_BINDING.id,
    repository: EXPECTED_RANDOM_TP_BINDING.repository,
    sourcePath: EXPECTED_RANDOM_TP_BINDING.path,
    sourceRevision: EXPECTED_RANDOM_TP_BINDING.revision,
    gitObjectFormat: EXPECTED_RANDOM_TP_BINDING.gitObjectFormat,
    gitBlobOid: EXPECTED_RANDOM_TP_BINDING.gitBlobOid,
    projectFrozenSha256: EXPECTED_RANDOM_TP_BINDING.projectFrozenSha256,
    idSetSha256: EXPECTED_RANDOM_TP_BINDING.idSetSha256,
    structureManifestSha256: EXPECTED_RANDOM_TP_BINDING.structureManifestSha256,
    labelManifestSha256: EXPECTED_RANDOM_TP_BINDING.labelManifestSha256,
  });
  compare(failures, 'authority-request.privateScope.benchmark.frameCount',
    benchmark?.frameCount, contract.benchmark.frameCount);
  compare(failures, 'authority-request.privateScope.benchmark.atomsPerFrame',
    benchmark?.atomsPerFrame, contract.benchmark.atomsPerFrame);
  validateModelSummaries(scope.models, contract.models, failures);
  compare(failures, 'authority-request.privateScope.runtime', scope.runtime, contract.runtime);
  compare(failures, 'authority-request.privateScope.requestBudget',
    scope.requestBudget, contract.requestBudget);
  const budget = scope.requestBudget;
  const total = [
    'authoritativePredictions',
    'repeatPredictions',
    'invariancePredictions',
    'forceFiniteDifferencePredictions',
    'stressFiniteDifferencePredictions',
  ].reduce((sum, key) => sum + (budget?.[key]?.value ?? Number.NaN), 0);
  compare(failures, 'authority-request.privateScope.requestBudget.recomputedTotal',
    total, budget?.totalMaximumRequests?.value);
  compare(failures, 'authority-request.privateScope.retention',
    scope.retention, contract.retention);
  compare(failures, 'authority-request.privateScope.excludedUses',
    scope.excludedUses, contract.excludedUses);
  validateEnvironmentAndAccess(scope.environmentAndAccess, contract, failures);
}

function validateModelSummaries(models, contractModels, failures) {
  if (!Array.isArray(contractModels)) {
    failures.push('authority-request.privateScope.models: bound models are unavailable');
    return;
  }
  const expected = contractModels.map((model) => {
    const binding = model.modelId === EXPECTED_CHECKPOINT_BINDINGS.mattersim.modelId
      ? EXPECTED_CHECKPOINT_BINDINGS.mattersim
      : EXPECTED_CHECKPOINT_BINDINGS.mace;
    const prefix = {
      modelId: model.modelId,
      packageName: binding.packageName,
      packageVersion: model.packageVersion,
      sourceRevision: model.sourceRevision,
    };
    if (Object.hasOwn(model, 'foundationRevision')) {
      prefix.foundationRevision = model.foundationRevision;
    }
    return {
      ...prefix,
      checkpointSize: {
        value: model.checkpointSizeBytes,
        unit: 'byte',
        dimension: 'information',
        basis: model.modelId === EXPECTED_CHECKPOINT_BINDINGS.mattersim.modelId
          ? 'frozen MatterSim checkpoint asset'
          : 'frozen MACE checkpoint asset',
      },
      checkpointSha256: model.checkpointSha256,
      dependencyLockDigest: model.dependencyLockDigest,
      runtimeInputManifestDigest: model.runtimeInputManifestDigest,
      dependencyGraphDigest: model.dependencyGraphDigest,
      installedPathDigest: model.installedPathDigest,
      runtimeInstalledPathDigest: model.runtimeInstalledPathDigest,
    };
  });
  compare(failures, 'authority-request.privateScope.models', models, expected);
}

function validateEnvironmentAndAccess(summary, contract, failures) {
  compare(failures, 'authority-request.privateScope.environmentAndAccess', summary, {
    host: contract.environment.host,
    producerJobs: contract.environment.producerJobs,
    freshSequentialModelContainers: contract.environment.freshSequentialModelContainers,
    networkDuringModelExecution: contract.environment.networkDuringModelExecution,
    rootFilesystem: contract.environment.rootFilesystem,
    runtimeUser: contract.environment.user,
    capabilities: contract.environment.capabilities,
    noNewPrivileges: contract.environment.noNewPrivileges,
    hostSocketsMounted: contract.environment.hostSocketsMounted,
    hostSecretsMounted: contract.environment.hostSecretsMounted,
    referenceLabelsMountedInModelContainers:
      contract.environment.referenceLabelsMountedInModelContainers,
    sharedWritableMountsBetweenExecutions:
      contract.environment.sharedWritableMountsBetweenExecutions,
    modelContainersMayAccessReferenceLabels:
      contract.access.modelContainersMayAccessReferenceLabels,
    publicBrowserAccessAllowed: contract.access.publicBrowserAccessAllowed,
    thirdPartyServiceAccessAllowed: contract.access.thirdPartyServiceAccessAllowed,
    publicRepositoryAccessAllowed: contract.access.publicRepositoryAccessAllowed,
  });
}

function resultEnvelope(inspection, failures) {
  const uniqueFailures = uniqueSorted(failures);
  return {
    ...inspection,
    failures: uniqueFailures,
    effectiveRights: Object.freeze({
      privateExecutionAllowed: false,
      aggregatePublicationAllowed: false,
      runtimeRedistributionAllowed: false,
    }),
    authorizationPresent: false,
    authorizesPrivateExecution: false,
    registrationEligible: false,
    dispatchEligible: false,
    publicationEligible: false,
    redistributionEligible: false,
    frontendIngestionEligible: false,
    scorePromotionEligible: false,
    scientificClaimEligible: false,
    valid: uniqueFailures.length === 0,
  };
}

async function readPolicyFile(
  root,
  relativePath,
  maximumBytes,
  overrides,
  overrideModes,
  snapshots,
) {
  if (Object.hasOwn(overrides, relativePath)) {
    const bytes = toBuffer(overrides[relativePath]);
    if (bytes.length < 1 || bytes.length > maximumBytes) {
      throw new Error('override bytes are outside the bounded contract');
    }
    if (!isRecord(overrideModes)
        || !Object.hasOwn(overrideModes, relativePath)
        || overrideModes[relativePath] !== Number(EXPECTED_FILE_MODE)) {
      throw new Error('override source mode must be exact 0644');
    }
    return bytes;
  }
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
  if (typeof relativePath !== 'string'
      || path.isAbsolute(relativePath)
      || relativePath.includes('\\')
      || relativePath.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error('bound path must be one canonical repository-relative path');
  }
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1) {
    throw new Error('bound byte limit is invalid');
  }
  const absolute = path.join(root, relativePath);
  if (await realpath(absolute) !== absolute) {
    throw new Error('bound file crosses a symlink boundary');
  }
  const before = await lstat(absolute, { bigint: true });
  if (!before.isFile()
      || before.isSymbolicLink()
      || before.nlink !== 1n
      || (before.mode & 0o7777n) !== EXPECTED_FILE_MODE
      || before.size < 1n
      || before.size > BigInt(maximumBytes)) {
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
    if (await realpath(absolute) !== absolute) {
      throw new Error('bound file changed path after read');
    }
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
        `authority-request.repositorySnapshot.${snapshot.relativePath}: bound file changed after snapshot (${message(error)})`,
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
  throw new TypeError('authority-request bytes must be a string, Buffer or Uint8Array');
}

function uniqueSorted(values) {
  return [...new Set(values)].sort();
}

function message(error) {
  return error instanceof Error ? error.message : String(error);
}
