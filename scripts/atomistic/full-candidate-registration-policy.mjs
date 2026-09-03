import { createHash } from 'node:crypto';
import {
  FULL_CANDIDATE_REGISTRATION_OBSERVATION_SCHEMA_VERSION,
  FULL_CANDIDATE_REGISTRATION_WORKFLOW,
  FULL_CANDIDATE_REPOSITORY,
  FULL_CANDIDATE_REPOSITORY_ID,
  FULL_CANDIDATE_REPOSITORY_OWNER_ID,
  FULL_CANDIDATE_SENTINEL_WORKFLOW,
  validateProtectedMainSentinel,
} from './full-candidate-github-evidence-policy.mjs';
import { canonicalJson } from './runtime-input-contract.mjs';

export const FULL_CANDIDATE_REGISTRATION_PAGE_SIZE = 100;
export const FULL_CANDIDATE_REGISTRATION_MAX_LIST_ITEMS = 1_000;

const OWNER_LOGIN = 'tony070926-sudo';
const MAIN_BRANCH = 'main';
const REVISION_PATTERN = /^[0-9a-f]{40}$/;
const CODE_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/;
const TIMESTAMP_PATTERN = /^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?Z$/;
const CLAIMS = Object.freeze({
  claimEligible: false,
  comparisonEligible: false,
  promotionEligible: false,
  reproduced: false,
  reproductionEligible: false,
  superiorityClaimAllowed: false,
});
const PREREQUISITES = Object.freeze({
  actualProducerRunnerVerified: false,
  actualProducerToolchainVerified: false,
  credentialReadOnlyScopeProven: false,
  dispatchEligible: false,
  privateHandoffVerified: false,
  producerConfigured: false,
  redistributionRightsVerified: false,
  scientificEvidenceAvailable: false,
  structureRightsVerified: false,
});
const SCIENTIFIC_RESULTS = Object.freeze({
  comparison: null,
  mace: null,
  mattersim: null,
  status: 'unavailable',
});
const ABSTENTIONS = Object.freeze([
  'producer-execution-not-observed',
  'scientific-results-not-observed',
  'visible-history-does-not-prove-never-run-or-no-deletion',
  'structure-and-redistribution-rights-not-verified',
  'private-verifier-and-handoff-not-verified',
  'actual-producer-runner-and-toolchain-not-verified',
]);
const SNAPSHOT_KEYS = Object.freeze([
  'actor',
  'branch',
  'branchProtection',
  'checkRun',
  'checkSuite',
  'compare',
  'currentTree',
  'hashAlgorithm',
  'jobs',
  'registrationBlob',
  'registrationCommit',
  'registrationTree',
  'repository',
  'repositoryRuns',
  'runAttempt',
  'sentinelWorkflow',
  'targetRuns',
  'workflowByFilename',
  'workflowById',
  'workflows',
]);

/**
 * Convert two complete authenticated GET snapshots into a registration-only
 * administrative observation. This object is deliberately not branded as a
 * producer dispatch, producer job, private handoff or scientific receipt.
 */
export function validateFullCandidateRegistrationCapture(capture) {
  exactKeys(capture, ['completedAt', 'passes', 'startedAt'], 'registration capture');
  requireTimestamp(capture.startedAt, 'registration capture startedAt');
  requireTimestamp(capture.completedAt, 'registration capture completedAt');
  requirePolicy(
    Date.parse(capture.completedAt) >= Date.parse(capture.startedAt),
    'registration-observation-time-invalid',
    'registration observation completion precedes its start',
  );
  requirePolicy(
    Array.isArray(capture.passes) && capture.passes.length === 2,
    'registration-snapshot-count-invalid',
    'registration inspection requires exactly two complete snapshots',
  );

  const passes = capture.passes.map((snapshot, index) => validateSnapshot(snapshot, index + 1));
  requirePolicy(
    passes[0].stabilityJson === passes[1].stabilityJson,
    'registration-snapshot-drift',
    'the two authenticated registration snapshots differ',
  );
  const snapshotSha256 = digest(Buffer.from(passes[0].stabilityJson, 'utf8'));
  const observation = {
    abstentions: [...ABSTENTIONS],
    actor: passes[0].public.actor,
    claims: structuredClone(CLAIMS),
    observationWindow: {
      completedAt: capture.completedAt,
      startedAt: capture.startedAt,
    },
    prerequisites: structuredClone(PREREQUISITES),
    registration: {
      ...passes[0].public.registration,
      visibleHistory: {
        ...passes[0].public.registration.visibleHistory,
        completeHistoryProven: false,
        noDeletionProven: false,
        neverRunProven: false,
        passCount: 2,
        snapshotSha256,
        stableAcrossTwoPasses: true,
      },
    },
    repository: passes[0].public.repository,
    schemaVersion: FULL_CANDIDATE_REGISTRATION_OBSERVATION_SCHEMA_VERSION,
    scientificResults: structuredClone(SCIENTIFIC_RESULTS),
    status: 'verified-registration-only',
  };
  return deepFreeze(observation);
}

export function fullCandidateRegistrationRejection(
  error,
  secret = '',
  fallbackCode = 'registration-control-plane-rejected',
) {
  const normalizedFallback = typeof fallbackCode === 'string' && CODE_PATTERN.test(fallbackCode)
    ? fallbackCode
    : 'registration-control-plane-rejected';
  const code = typeof error?.code === 'string' && CODE_PATTERN.test(error.code)
    ? error.code
    : normalizedFallback;
  let rawMessage;
  try {
    rawMessage = String(error instanceof Error ? error.message : error ?? 'Registration inspection is unavailable.');
  } catch {
    rawMessage = 'Registration inspection is unavailable.';
  }
  if (typeof secret === 'string' && secret.length > 0) rawMessage = rawMessage.split(secret).join('[redacted]');
  const message = rawMessage
    .replace(/\b(?:github_pat_|gh[pousr]_)[A-Za-z0-9_]{8,}\b/g, '[redacted]')
    .replace(/authorization\s*:\s*(?:bearer|token)\s+[^\s,;]+/gi, 'authorization: [redacted]')
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, 2_048) || 'Registration inspection is unavailable.';
  return deepFreeze({
    abstentions: [...ABSTENTIONS],
    claims: structuredClone(CLAIMS),
    prerequisites: structuredClone(PREREQUISITES),
    rejection: { code, message },
    schemaVersion: FULL_CANDIDATE_REGISTRATION_OBSERVATION_SCHEMA_VERSION,
    scientificResults: structuredClone(SCIENTIFIC_RESULTS),
    status: 'rejected',
  });
}

export class FullCandidateRegistrationPolicyError extends Error {
  constructor(code, message) {
    super(`full-candidate registration observation rejected: ${message}`);
    this.code = code;
    this.name = 'FullCandidateRegistrationPolicyError';
  }
}

function validateSnapshot(snapshot, passNumber) {
  exactKeys(snapshot, SNAPSHOT_KEYS, `registration snapshot ${passNumber}`);
  const actor = validateActor(snapshot.actor);
  const repository = validateRepository(snapshot.repository);
  requirePolicy(
    snapshot.hashAlgorithm?.hash_algorithm === 'sha1',
    'repository-hash-algorithm-drift',
    'repository Git object hash algorithm differs from the registered SHA-1 identities',
  );
  const currentMain = validateBranch(snapshot.branch);
  const relation = validateCompare(snapshot.compare, currentMain.revision);
  const source = validateRegistrationSource({
    blob: snapshot.registrationBlob,
    commit: snapshot.registrationCommit,
    currentTree: snapshot.currentTree,
    registrationTree: snapshot.registrationTree,
    currentTreeOid: currentMain.treeOid,
  });
  const branchProtection = validateBranchProtectionProjection(snapshot.branchProtection);

  const workflowById = validateWorkflow(snapshot.workflowById, 'numeric-ID workflow');
  const workflowByFilename = validateWorkflow(snapshot.workflowByFilename, 'filename workflow');
  requirePolicy(
    canonicalJson(workflowById) === canonicalJson(workflowByFilename),
    'registration-workflow-identity-drift',
    'numeric-ID and filename workflow observations differ',
  );
  const workflowItems = flattenPaginatedListing(snapshot.workflows, 'workflows', 'workflow listing');
  const workflowMatches = workflowItems.filter((workflow) => workflow?.id === FULL_CANDIDATE_REGISTRATION_WORKFLOW.id
    || workflow?.path === FULL_CANDIDATE_REGISTRATION_WORKFLOW.path);
  requirePolicy(
    workflowMatches.length === 1
      && canonicalJson(validateWorkflow(workflowMatches[0], 'workflow listing entry')) === canonicalJson(workflowById),
    'registration-workflow-listing-invalid',
    'complete workflow listing does not contain exactly one matching registered workflow',
  );

  const targetRuns = flattenPaginatedListing(snapshot.targetRuns, 'workflow_runs', 'target workflow run listing');
  requirePolicy(
    targetRuns.length === 0,
    'registration-target-run-visible',
    'the registered quarantine workflow has a currently API-visible run',
  );
  const repositoryRuns = flattenPaginatedListing(snapshot.repositoryRuns, 'workflow_runs', 'repository run listing');
  const repositoryTargetRuns = repositoryRuns.filter((run) => run?.workflow_id === FULL_CANDIDATE_REGISTRATION_WORKFLOW.id
    || run?.path === FULL_CANDIDATE_REGISTRATION_WORKFLOW.path);
  requirePolicy(
    repositoryTargetRuns.length === 0,
    'registration-target-run-visible',
    'repository-wide history contains a currently API-visible quarantine-workflow run',
  );

  const sentinelWorkflow = validateSentinelWorkflow(snapshot.sentinelWorkflow);
  const sentinelRuns = repositoryRuns.filter((run) => run?.head_sha === source.revision
    && (run?.workflow_id === FULL_CANDIDATE_SENTINEL_WORKFLOW.id
      || run?.path === FULL_CANDIDATE_SENTINEL_WORKFLOW.path
      || run?.name === FULL_CANDIDATE_SENTINEL_WORKFLOW.name));
  const jobs = flattenPaginatedListing(snapshot.jobs, 'jobs', 'Sentinel attempt-one job listing');
  const checkSuite = validateCheckSuite(snapshot.checkSuite, source.revision);
  requirePolicy(
    snapshot.checkRun?.check_suite?.id === FULL_CANDIDATE_REGISTRATION_WORKFLOW.sentinel.checkSuiteId,
    'protected-main-sentinel-invalid',
    'Sentinel check run is not bound to the locked check suite',
  );
  const sentinel = validateProtectedMainSentinel({
    branch: {
      commit: { sha: source.revision },
      name: MAIN_BRANCH,
      protected: currentMain.protected,
    },
    branchProtection: snapshot.branchProtection,
    checkRun: {
      ...snapshot.checkRun,
      check_suite: {
        ...snapshot.checkRun.check_suite,
        head_sha: checkSuite.headSha,
      },
    },
    jobs: { jobs, total_count: jobs.length },
    repository: snapshot.repository,
    runAttempt: snapshot.runAttempt,
    runListing: { total_count: sentinelRuns.length, workflow_runs: sentinelRuns },
    workflow: snapshot.sentinelWorkflow,
  }, source.revision);
  requirePolicy(
    sentinel.runId === FULL_CANDIDATE_REGISTRATION_WORKFLOW.sentinel.runId
      && sentinel.runAttempt === FULL_CANDIDATE_REGISTRATION_WORKFLOW.sentinel.runAttempt
      && sentinel.jobId === FULL_CANDIDATE_REGISTRATION_WORKFLOW.sentinel.jobId
      && sentinel.checkRunId === FULL_CANDIDATE_REGISTRATION_WORKFLOW.sentinel.checkRunId,
    'protected-main-sentinel-invalid',
    'protected-main Sentinel identities differ from the locked first-main evidence',
  );

  const workflowSummaries = workflowItems.map(workflowSummary).sort(compareNumericId);
  const repositoryRunSummaries = repositoryRuns.map(runSummary).sort(compareNumericId);
  const stabilityProjection = {
    actor,
    branchProtection,
    checkRun: checkRunSummary(snapshot.checkRun),
    checkSuite,
    currentMain,
    jobs: jobs.map(jobSummary).sort(compareNumericId),
    relation,
    repository,
    repositoryRuns: repositoryRunSummaries,
    sentinel,
    sentinelWorkflow,
    source,
    targetRuns: targetRuns.map(runSummary).sort(compareNumericId),
    workflow: workflowById,
    workflows: workflowSummaries,
  };
  return {
    public: {
      actor,
      registration: {
        currentMain: {
          ...currentMain,
          branchProtection,
          registrationAncestor: true,
          registrationRelation: relation,
        },
        historicalSource: source,
        protectedMainSentinel: sentinel,
        visibleHistory: {
          completeCurrentVisiblePagination: true,
          pageSize: FULL_CANDIDATE_REGISTRATION_PAGE_SIZE,
          paginationBound: FULL_CANDIDATE_REGISTRATION_MAX_LIST_ITEMS,
          repositoryRunCount: repositoryRuns.length,
          repositoryRunPagesIncludingTerminator: snapshot.repositoryRuns.pages.length,
          repositoryTargetMatchCount: repositoryTargetRuns.length,
          sentinelJobPagesIncludingTerminator: snapshot.jobs.pages.length,
          targetWorkflowRunCount: targetRuns.length,
          targetWorkflowRunPagesIncludingTerminator: snapshot.targetRuns.pages.length,
          workflowCount: workflowItems.length,
          workflowPagesIncludingTerminator: snapshot.workflows.pages.length,
          workflowTargetMatchCount: workflowMatches.length,
        },
        workflow: {
          ...workflowById,
          dispatchEligible: false,
          producerConfigured: false,
          registered: true,
        },
      },
      repository,
    },
    stabilityJson: canonicalJson(stabilityProjection),
  };
}

function validateActor(actor) {
  requirePolicy(
    actor?.id === FULL_CANDIDATE_REPOSITORY_OWNER_ID
      && actor.login === OWNER_LOGIN
      && actor.type === 'User',
    'registration-actor-identity-invalid',
    'authenticated GitHub actor differs from the frozen repository owner',
  );
  return { id: actor.id, login: actor.login };
}

function validateRepository(repository) {
  requirePolicy(
    repository?.id === FULL_CANDIDATE_REPOSITORY_ID
      && repository.full_name === FULL_CANDIDATE_REPOSITORY
      && repository.default_branch === MAIN_BRANCH
      && repository.private === false
      && repository.owner?.id === FULL_CANDIDATE_REPOSITORY_OWNER_ID
      && repository.owner.login === OWNER_LOGIN,
    'registration-repository-identity-invalid',
    'repository identity, owner, visibility or default branch differs',
  );
  return {
    defaultBranch: MAIN_BRANCH,
    id: repository.id,
    nameWithOwner: repository.full_name,
    private: false,
  };
}

function validateBranch(branch) {
  const revision = branch?.commit?.sha;
  const treeOid = branch?.commit?.commit?.tree?.sha;
  requirePolicy(
    branch?.name === MAIN_BRANCH
      && branch.protected === true
      && REVISION_PATTERN.test(revision ?? '')
      && REVISION_PATTERN.test(treeOid ?? ''),
    'registration-current-main-invalid',
    'current protected main identity is unavailable or malformed',
  );
  return { protected: true, revision, treeOid };
}

function validateCompare(compare, currentRevision) {
  const expected = FULL_CANDIDATE_REGISTRATION_WORKFLOW.registration.revision;
  const commits = Array.isArray(compare?.commits) ? compare.commits : null;
  requirePolicy(
    (compare?.status === 'identical' || compare?.status === 'ahead')
      && compare.base_commit?.sha === expected
      && compare.merge_base_commit?.sha === expected
      && compare.behind_by === 0
      && Number.isSafeInteger(compare.ahead_by)
      && compare.ahead_by >= 0
      && compare.total_commits === compare.ahead_by
      && commits !== null
      && commits.length === compare.ahead_by,
    'registration-main-ancestry-invalid',
    'registration comparison metadata does not establish a non-divergent main history',
  );
  if (compare.ahead_by === 0) {
    requirePolicy(
      currentRevision === expected
        && compare.status === 'identical'
        && (compare.head_commit == null || compare.head_commit?.sha === currentRevision),
      'registration-main-ancestry-invalid',
      'an identical registration comparison does not bind current main',
    );
  } else {
    requirePolicy(
      compare.status === 'ahead'
        && (compare.head_commit == null || compare.head_commit?.sha === currentRevision)
        && commits.at(-1)?.sha === currentRevision,
      'registration-main-ancestry-invalid',
      'an ahead registration comparison does not terminate at current main',
    );
  }
  return compare.status;
}

function validateRegistrationSource({ blob, commit, currentTree, currentTreeOid, registrationTree }) {
  const frozen = FULL_CANDIDATE_REGISTRATION_WORKFLOW.registration;
  requirePolicy(
    commit?.sha === frozen.revision
      && commit.commit?.tree?.sha === frozen.treeOid
      && Array.isArray(commit.parents)
      && commit.parents.length === 1
      && commit.parents[0]?.sha === frozen.parentRevision
      && commit.commit?.verification?.verified === true
      && commit.commit.verification.reason === 'valid',
    'registration-commit-identity-invalid',
    'historical registration commit, parent, tree or signature verification differs',
  );
  validateTree(registrationTree, frozen.treeOid, 'historical registration tree');
  validateTree(currentTree, currentTreeOid, 'current main tree');
  const blobBytes = decodeBlob(blob);
  requirePolicy(
    blob?.sha === frozen.gitBlobOid
      && blob.size === frozen.sizeBytes
      && blobBytes.length === frozen.sizeBytes
      && digest(blobBytes) === frozen.sha256
      && gitBlobOid(blobBytes) === frozen.gitBlobOid,
    'registration-workflow-blob-invalid',
    'registered workflow blob identity, byte count or digest differs',
  );
  return {
    blob: {
      gitBlobOid: frozen.gitBlobOid,
      mode: '100644',
      path: FULL_CANDIDATE_REGISTRATION_WORKFLOW.path,
      sha256: frozen.sha256,
      sizeBytes: frozen.sizeBytes,
    },
    parentRevision: frozen.parentRevision,
    revision: frozen.revision,
    signatureReason: 'valid',
    signatureVerified: true,
    treeOid: frozen.treeOid,
  };
}

function validateTree(tree, expectedTreeOid, label) {
  requirePolicy(
    tree?.sha === expectedTreeOid && tree.truncated === false && Array.isArray(tree.tree),
    'registration-source-tree-invalid',
    `${label} is unavailable, truncated or bound to another tree`,
  );
  const matches = tree.tree.filter((entry) => entry?.path === FULL_CANDIDATE_REGISTRATION_WORKFLOW.path);
  const frozen = FULL_CANDIDATE_REGISTRATION_WORKFLOW.registration;
  requirePolicy(
    matches.length === 1
      && matches[0].mode === '100644'
      && matches[0].type === 'blob'
      && matches[0].sha === frozen.gitBlobOid
      && matches[0].size === frozen.sizeBytes,
    'registration-source-tree-invalid',
    `${label} does not contain the exact regular registered workflow blob`,
  );
}

function decodeBlob(blob) {
  requirePolicy(
    blob?.encoding === 'base64' && typeof blob.content === 'string',
    'registration-workflow-blob-invalid',
    'registered workflow blob is not base64 encoded',
  );
  const normalized = blob.content.replaceAll('\n', '');
  requirePolicy(
    normalized.length > 0
      && normalized.length % 4 === 0
      && /^[A-Za-z0-9+/]+={0,2}$/.test(normalized),
    'registration-workflow-blob-invalid',
    'registered workflow blob uses malformed base64',
  );
  const decoded = Buffer.from(normalized, 'base64');
  requirePolicy(
    decoded.toString('base64') === normalized,
    'registration-workflow-blob-invalid',
    'registered workflow blob uses noncanonical base64',
  );
  return decoded;
}

function validateBranchProtectionProjection(protection) {
  const checks = protection?.required_status_checks?.checks;
  requirePolicy(
    protection?.required_status_checks?.strict === true
      && Array.isArray(checks)
      && checks.length === 1
      && checks[0]?.context === 'evaluate'
      && checks[0]?.app_id === 15_368
      && protection.enforce_admins?.enabled === true
      && protection.required_linear_history?.enabled === true
      && protection.required_conversation_resolution?.enabled === true
      && protection.allow_force_pushes?.enabled === false
      && protection.allow_deletions?.enabled === false,
    'registration-branch-protection-invalid',
    'selected classic branch-protection fields differ from the locked policy',
  );
  return {
    allowDeletions: false,
    allowForcePushes: false,
    bypassActorsFullyObserved: false,
    classicSelectedFieldsVerified: true,
    conversationResolutionRequired: true,
    enforceAdmins: true,
    linearHistoryRequired: true,
    requiredCheckAppId: 15_368,
    requiredCheckContext: 'evaluate',
    requiredStatusChecksStrict: true,
    rulesetsFullyObserved: false,
  };
}

function validateWorkflow(workflow, label) {
  requirePolicy(
    workflow?.id === FULL_CANDIDATE_REGISTRATION_WORKFLOW.id
      && workflow.node_id === FULL_CANDIDATE_REGISTRATION_WORKFLOW.nodeId
      && workflow.name === FULL_CANDIDATE_REGISTRATION_WORKFLOW.name
      && workflow.path === FULL_CANDIDATE_REGISTRATION_WORKFLOW.path
      && workflow.state === FULL_CANDIDATE_REGISTRATION_WORKFLOW.state,
    'registration-workflow-identity-drift',
    `${label} differs from the frozen registration identity`,
  );
  return workflowSummary(workflow);
}

function validateSentinelWorkflow(workflow) {
  requirePolicy(
    workflow?.id === FULL_CANDIDATE_SENTINEL_WORKFLOW.id
      && workflow.name === FULL_CANDIDATE_SENTINEL_WORKFLOW.name
      && workflow.path === FULL_CANDIDATE_SENTINEL_WORKFLOW.path
      && workflow.state === 'active',
    'protected-main-sentinel-invalid',
    'Sentinel workflow API identity differs',
  );
  return {
    id: workflow.id,
    name: workflow.name,
    path: workflow.path,
    state: workflow.state,
  };
}

function validateCheckSuite(suite, sourceRevision) {
  requirePolicy(
    suite?.id === FULL_CANDIDATE_REGISTRATION_WORKFLOW.sentinel.checkSuiteId
      && suite.head_sha === sourceRevision
      && suite.status === 'completed'
      && suite.conclusion === 'success'
      && suite.app?.id === 15_368
      && suite.repository?.id === FULL_CANDIDATE_REPOSITORY_ID
      && suite.repository.full_name === FULL_CANDIDATE_REPOSITORY
      && suite.latest_check_runs_count === 1,
    'protected-main-sentinel-invalid',
    'Sentinel check suite differs from the locked first-main evidence',
  );
  return {
    conclusion: suite.conclusion,
    headSha: suite.head_sha,
    id: suite.id,
    status: suite.status,
  };
}

function flattenPaginatedListing(listing, itemKey, label) {
  exactKeys(listing, ['itemKey', 'pages'], label);
  requirePolicy(
    listing.itemKey === itemKey && Array.isArray(listing.pages) && listing.pages.length > 0,
    'registration-pagination-invalid',
    `${label} pagination envelope is invalid`,
  );
  const firstTotal = listing.pages[0]?.payload?.total_count;
  requirePolicy(
    Number.isSafeInteger(firstTotal)
      && firstTotal >= 0
      && firstTotal <= FULL_CANDIDATE_REGISTRATION_MAX_LIST_ITEMS,
    'registration-pagination-invalid',
    `${label} total_count is invalid or exceeds the auditable bound`,
  );
  const dataPages = Math.ceil(firstTotal / FULL_CANDIDATE_REGISTRATION_PAGE_SIZE);
  requirePolicy(
    listing.pages.length === dataPages + 1,
    'registration-pagination-invalid',
    `${label} does not include every data page and one explicit empty terminator`,
  );
  const items = [];
  const ids = new Set();
  for (let index = 0; index < listing.pages.length; index += 1) {
    const expectedPage = index + 1;
    const page = listing.pages[index];
    const pageItems = page?.payload?.[itemKey];
    const remaining = Math.max(0, firstTotal - (index * FULL_CANDIDATE_REGISTRATION_PAGE_SIZE));
    const expectedCount = index < dataPages
      ? Math.min(FULL_CANDIDATE_REGISTRATION_PAGE_SIZE, remaining)
      : 0;
    requirePolicy(
      page?.page === expectedPage
        && page.payload?.total_count === firstTotal
        && Array.isArray(pageItems)
        && pageItems.length === expectedCount,
      'registration-pagination-invalid',
      `${label} page ${expectedPage} is missing, unstable, short, overfull or not the empty terminator`,
    );
    for (const item of pageItems) {
      requirePolicy(
        Number.isSafeInteger(item?.id) && item.id > 0 && !ids.has(item.id),
        'registration-pagination-invalid',
        `${label} contains a missing or duplicate positive item ID`,
      );
      ids.add(item.id);
      items.push(item);
    }
  }
  requirePolicy(
    items.length === firstTotal,
    'registration-pagination-invalid',
    `${label} item count differs from total_count`,
  );
  return items;
}

function workflowSummary(workflow) {
  return {
    id: workflow.id,
    name: workflow.name,
    nodeId: workflow.node_id,
    path: workflow.path,
    state: workflow.state,
  };
}

function runSummary(run) {
  return {
    conclusion: run.conclusion ?? null,
    createdAt: run.created_at,
    event: run.event,
    headBranch: run.head_branch,
    headSha: run.head_sha,
    id: run.id,
    name: run.name,
    path: run.path,
    runAttempt: run.run_attempt ?? null,
    runNumber: run.run_number,
    status: run.status ?? null,
    workflowId: run.workflow_id,
  };
}

function jobSummary(job) {
  return {
    checkRunUrl: job.check_run_url,
    conclusion: job.conclusion,
    headSha: job.head_sha,
    htmlUrl: job.html_url,
    id: job.id,
    name: job.name,
    runAttempt: job.run_attempt,
    runId: job.run_id,
    status: job.status,
    workflowName: job.workflow_name,
  };
}

function checkRunSummary(checkRun) {
  return {
    appId: checkRun?.app?.id,
    checkSuiteId: checkRun?.check_suite?.id,
    conclusion: checkRun?.conclusion,
    detailsUrl: checkRun?.details_url,
    headSha: checkRun?.head_sha,
    id: checkRun?.id,
    name: checkRun?.name,
    status: checkRun?.status,
    url: checkRun?.url,
  };
}

function compareNumericId(left, right) {
  return left.id - right.id;
}

function gitBlobOid(bytes) {
  const header = Buffer.from(`blob ${bytes.length}\0`, 'ascii');
  return createHash('sha1').update(header).update(bytes).digest('hex');
}

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function exactKeys(value, expected, label) {
  requirePolicy(isPlainObject(value), 'registration-shape-invalid', `${label} must be a plain object`);
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  requirePolicy(
    canonicalJson(actualKeys) === canonicalJson(expectedKeys),
    'registration-shape-invalid',
    `${label} fields differ from the fixed contract`,
  );
}

function requireTimestamp(value, label) {
  requirePolicy(
    typeof value === 'string'
      && TIMESTAMP_PATTERN.test(value)
      && Number.isFinite(Date.parse(value))
      && new Date(value).toISOString() === value,
    'registration-observation-time-invalid',
    `${label} is not a canonical UTC timestamp`,
  );
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(value) {
  if (value !== null && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function requirePolicy(condition, code, message) {
  if (!condition) throw new FullCandidateRegistrationPolicyError(code, message);
}
