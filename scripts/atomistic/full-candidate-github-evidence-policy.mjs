import {
  releaseRepository,
  sentinelWorkflow,
  validateBranchProtection,
} from '../github-release-policy.mjs';

export const FULL_CANDIDATE_REPOSITORY = releaseRepository.nameWithOwner;
export const FULL_CANDIDATE_REPOSITORY_ID = releaseRepository.id;
export const FULL_CANDIDATE_REPOSITORY_OWNER_ID = 288_004_538;
export const FULL_CANDIDATE_GITHUB_RESULT_SCHEMA_VERSION =
  'tf.atomistic-full-candidate-github-readiness/0.1';
export const FULL_CANDIDATE_SENTINEL_WORKFLOW = Object.freeze({
  id: sentinelWorkflow.id,
  name: sentinelWorkflow.name,
  path: sentinelWorkflow.path,
});
export const FULL_CANDIDATE_PRODUCER_WORKFLOW = Object.freeze({
  configured: false,
  id: null,
  name: 'Atomistic full candidate private producer (non-promotional)',
  path: '.github/workflows/atomistic-full-candidate.yml',
});
export const FULL_CANDIDATE_REGISTRATION_WORKFLOW = Object.freeze({
  id: 349_363_715,
  name: FULL_CANDIDATE_PRODUCER_WORKFLOW.name,
  nodeId: 'W_kwDOUG-2WM4U0t4D',
  path: FULL_CANDIDATE_PRODUCER_WORKFLOW.path,
  producerConfigured: false,
  registered: true,
  state: 'active',
  registration: Object.freeze({
    gitBlobOid: '76d40b0938df50375728b4f68133a52a1ceabd13',
    parentRevision: '72bc2011d75d9880b9918b70c903129b9bf1de65',
    revision: '3221265a4145626dd9e32876fa911f23ae49fbff',
    sha256: 'sha256:e578459f2c46e77d10f3fd944984daa01f845219921454c3095b9852e4074cc0',
    sizeBytes: 520,
    treeOid: '2b9735696a4c2b1fc8419b6de818df7289246c8b',
  }),
  sentinel: Object.freeze({
    checkRunId: 100_666_166_912,
    checkSuiteId: 91_492_151_082,
    jobId: 100_666_166_912,
    runAttempt: 1,
    runId: 33_760_752_864,
  }),
});

export const FULL_CANDIDATE_REGISTRATION_OBSERVATION_SCHEMA_VERSION =
  'tf.atomistic-full-candidate-registration-observation/0.1';

const GITHUB_ACTIONS_APP_ID = 15_368;
const MAX_COMPLETE_RUN_LISTING = 1_000;
const REVISION_PATTERN = /^[0-9a-f]{40}$/;
const CODE_PATTERN = /^[a-z0-9][a-z0-9-]{0,127}$/;
const TIMESTAMP_PATTERN = /^20[0-9]{2}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}(?:\.[0-9]{1,6})?Z$/;
const TERMINAL_RUN_CONCLUSIONS = new Set(['success', 'failure', 'cancelled', 'timed_out']);
const TERMINAL_JOB_CONCLUSIONS = new Set(['failure', 'cancelled', 'timed_out']);
const MODEL_SPECS = Object.freeze({
  mattersim: Object.freeze({ jobName: 'mattersim', modelId: 'mattersim-v1.0.0-5m' }),
  mace: Object.freeze({ jobName: 'mace', modelId: 'mace-mpa-0-medium' }),
});
const CLAIMS = Object.freeze({
  claimEligible: false,
  comparisonEligible: false,
  promotionEligible: false,
  reproduced: false,
  reproductionEligible: false,
  superiorityClaimAllowed: false,
});
const VERIFIED_FIRST_PRODUCER_DISPATCHES = new WeakSet();
const VERIFIED_FIRST_PRODUCER_ATTEMPTS = new WeakSet();
const VERIFIED_FIRST_PRODUCER_JOBS = new WeakSet();

/**
 * Select the first dispatch for one already-pinned workflow and source revision.
 * The caller must supply a complete, untruncated listing assembled from GitHub's
 * workflow-runs API. No caller-supplied run ID participates in this decision.
 */
export function selectFirstProducerDispatch(runListing, frozenWorkflow, sourceRevision) {
  validateProducerWorkflow(frozenWorkflow);
  requireRevision(sourceRevision, 'producer source revision');
  const runs = completeRunListing(runListing, 'producer dispatch');
  requirePolicy(runs.length > 0, 'producer-dispatch-unavailable', 'no producer dispatch exists for the pinned workflow and source revision');

  const seenIds = new Set();
  const seenNumbers = new Set();
  for (const run of runs) {
    requirePositiveInteger(run?.id, 'producer run ID');
    requirePositiveInteger(run?.run_number, 'producer run number');
    requirePolicy(!seenIds.has(run.id), 'producer-run-history-invalid', 'producer run history contains a duplicate run ID');
    requirePolicy(!seenNumbers.has(run.run_number), 'producer-run-history-invalid', 'producer run history contains a duplicate run number');
    seenIds.add(run.id);
    seenNumbers.add(run.run_number);
    requirePolicy(
      run.workflow_id === frozenWorkflow.id
        && run.name === frozenWorkflow.name
        && run.path === frozenWorkflow.path
        && run.event === 'workflow_dispatch'
        && run.head_branch === 'main'
        && run.head_sha === sourceRevision,
      'producer-run-history-invalid',
      'producer run history contains a different workflow, event, branch, or revision',
    );
    validateRunRepositoryIdentity(run, 'producer run');
    requireTimestamp(run.created_at, 'producer run created_at');
  }

  const ordered = [...runs].sort(compareDispatches);
  const selected = summarizeDispatch(ordered[0]);
  requirePolicy(
    selected.runNumber === 1,
    'producer-first-dispatch-unavailable',
    'producer workflow run number one is absent, so deleted or earlier dispatch history cannot be excluded',
  );
  VERIFIED_FIRST_PRODUCER_DISPATCHES.add(selected);
  return Object.freeze({
    ignoredDispatchIds: Object.freeze(ordered.slice(1).map((run) => run.id)),
    queryCoverageComplete: true,
    selected,
    totalDispatches: ordered.length,
  });
}

/**
 * Bind the selected dispatch to attempt one. A later rerun attempt can never
 * replace the first attempt's terminal state.
 */
export function validateFirstProducerAttempt(selectedDispatch, runAttempt) {
  requirePolicy(
    isPlainObject(selectedDispatch) && VERIFIED_FIRST_PRODUCER_DISPATCHES.has(selectedDispatch),
    'producer-attempt-invalid',
    'selected producer dispatch is unavailable or was not derived from complete first-run policy',
  );
  requirePositiveInteger(selectedDispatch.id, 'selected producer run ID');
  requireRevision(selectedDispatch.sourceRevision, 'selected producer source revision');
  requirePolicy(
    runAttempt?.id === selectedDispatch.id
      && runAttempt.workflow_id === selectedDispatch.workflowId
      && runAttempt.name === selectedDispatch.workflowName
      && runAttempt.path === selectedDispatch.workflowPath
      && runAttempt.run_attempt === 1
      && runAttempt.event === 'workflow_dispatch'
      && runAttempt.head_branch === 'main'
      && runAttempt.head_sha === selectedDispatch.sourceRevision
      && runAttempt.run_number === selectedDispatch.runNumber
      && runAttempt.created_at === selectedDispatch.createdAt
      && runAttempt.status === 'completed'
      && TERMINAL_RUN_CONCLUSIONS.has(runAttempt.conclusion),
    'producer-attempt-invalid',
    'producer attempt one is unavailable, nonterminal, or bound to different source identity',
  );
  validateRunRepositoryIdentity(runAttempt, 'producer attempt one');
  for (const key of ['created_at', 'run_started_at', 'updated_at']) {
    requireTimestamp(runAttempt[key], `producer attempt one ${key}`);
  }

  const verified = Object.freeze({
    conclusion: runAttempt.conclusion,
    createdAt: runAttempt.created_at,
    id: runAttempt.id,
    runAttempt: 1,
    sourceRevision: runAttempt.head_sha,
    startedAt: runAttempt.run_started_at,
    status: runAttempt.status,
    updatedAt: runAttempt.updated_at,
    workflowId: runAttempt.workflow_id,
    workflowName: runAttempt.name,
  });
  VERIFIED_FIRST_PRODUCER_ATTEMPTS.add(verified);
  return verified;
}

/**
 * Project the provenance carried by a first-attempt result produced by this
 * module. The process-local brand prevents a codec caller from substituting a
 * self-authored lookalike object. An operational adapter must still obtain the
 * underlying observations from authenticated GitHub APIs.
 */
export function verifiedFirstProducerAttemptProvenance(observation) {
  requirePolicy(
    isPlainObject(observation) && VERIFIED_FIRST_PRODUCER_ATTEMPTS.has(observation),
    'producer-attempt-proof-invalid',
    'producer attempt provenance was not derived from the validated first dispatch and attempt one',
  );
  return Object.freeze({
    conclusion: observation.conclusion,
    runAttempt: 1,
    sourceRevision: observation.sourceRevision,
    status: observation.status,
    workflowRunId: observation.id,
  });
}

/**
 * Bind one exact terminal model job to the validated first workflow attempt.
 * A workflow may finish in failure while one model job finished successfully;
 * only the exact successful job proof is eligible for private handoff.
 */
export function validateFirstProducerJob(verifiedFirstProducerAttempt, job, model) {
  requirePolicy(
    isPlainObject(verifiedFirstProducerAttempt)
      && VERIFIED_FIRST_PRODUCER_ATTEMPTS.has(verifiedFirstProducerAttempt),
    'producer-job-proof-invalid',
    'producer job was not bound to a validated first workflow attempt',
  );
  const spec = MODEL_SPECS[model];
  requirePolicy(Boolean(spec), 'producer-job-proof-invalid', 'producer job model is outside the allowlist');
  requirePositiveInteger(job?.id, 'producer job ID');
  requirePolicy(
    job.run_id === verifiedFirstProducerAttempt.id
      && job.run_attempt === 1
      && job.workflow_name === verifiedFirstProducerAttempt.workflowName
      && job.name === spec.jobName
      && job.head_sha === verifiedFirstProducerAttempt.sourceRevision
      && job.status === 'completed'
      && TERMINAL_RUN_CONCLUSIONS.has(job.conclusion),
    'producer-job-proof-invalid',
    'producer job identity, source, status or conclusion differs from the validated first attempt',
  );
  const verified = Object.freeze({
    conclusion: job.conclusion,
    jobId: job.id,
    model,
    modelId: spec.modelId,
    runAttempt: 1,
    sourceRevision: job.head_sha,
    status: job.status,
    workflowRunId: job.run_id,
  });
  VERIFIED_FIRST_PRODUCER_JOBS.add(verified);
  return verified;
}

export function verifiedSuccessfulProducerJobProvenance(observation) {
  requirePolicy(
    isPlainObject(observation)
      && VERIFIED_FIRST_PRODUCER_JOBS.has(observation)
      && observation.status === 'completed'
      && observation.conclusion === 'success',
    'producer-job-proof-invalid',
    'private scientific handoff requires the exact validated successful model job from attempt one',
  );
  return Object.freeze({
    jobId: observation.jobId,
    model: observation.model,
    modelId: observation.modelId,
    runAttempt: 1,
    sourceRevision: observation.sourceRevision,
    workflowRunId: observation.workflowRunId,
  });
}

/**
 * Validate the protected-main Sentinel independently of any producer result.
 * The check run is fetched from the job's check_run_url and must bind back to
 * the first main-push workflow attempt and exact job details URL.
 */
export function validateProtectedMainSentinel(observations, sourceRevision) {
  requireRevision(sourceRevision, 'Sentinel source revision');
  requirePolicy(isPlainObject(observations), 'protected-main-sentinel-invalid', 'Sentinel observations are unavailable');
  const {
    branch,
    branchProtection,
    checkRun,
    jobs: jobsPayload,
    repository,
    runAttempt,
    runListing,
    workflow,
  } = observations;

  requirePolicy(
    repository?.id === FULL_CANDIDATE_REPOSITORY_ID
      && repository?.full_name === FULL_CANDIDATE_REPOSITORY
      && repository?.owner?.id === FULL_CANDIDATE_REPOSITORY_OWNER_ID,
    'protected-main-sentinel-invalid',
    'repository API identity differs from the frozen repository',
  );
  requirePolicy(
    branch?.name === 'main'
      && branch.protected === true
      && branch.commit?.sha === sourceRevision,
    'protected-main-sentinel-invalid',
    'main branch is not protected at the expected source revision',
  );
  const protectionFailures = validateBranchProtection(branchProtection);
  requirePolicy(
    protectionFailures.length === 0,
    'protected-main-sentinel-invalid',
    `branch protection differs: ${protectionFailures.join('; ') || 'required check ordering or fields differ'}`,
  );
  requirePolicy(
    workflow?.id === FULL_CANDIDATE_SENTINEL_WORKFLOW.id
      && workflow.name === FULL_CANDIDATE_SENTINEL_WORKFLOW.name
      && workflow.path === FULL_CANDIDATE_SENTINEL_WORKFLOW.path
      && workflow.state === 'active',
    'protected-main-sentinel-invalid',
    'Sentinel workflow API identity differs',
  );

  const runs = completeRunListing(runListing, 'Sentinel main-push');
  requirePolicy(runs.length > 0, 'protected-main-sentinel-invalid', 'no Sentinel main-push run exists for the source revision');
  for (const run of runs) {
    requirePositiveInteger(run?.id, 'Sentinel run ID');
    requirePositiveInteger(run?.run_number, 'Sentinel run number');
    requirePolicy(
      run.workflow_id === FULL_CANDIDATE_SENTINEL_WORKFLOW.id
        && run.name === FULL_CANDIDATE_SENTINEL_WORKFLOW.name
        && run.path === FULL_CANDIDATE_SENTINEL_WORKFLOW.path
        && run.event === 'push'
        && run.head_branch === 'main'
        && run.head_sha === sourceRevision,
      'protected-main-sentinel-invalid',
      'Sentinel run history contains a different workflow, event, branch, or revision',
    );
    validateRunRepositoryIdentity(run, 'Sentinel run');
    requireTimestamp(run.created_at, 'Sentinel run created_at');
  }
  requireUniqueDispatchIdentities(runs, 'Sentinel');
  const firstRun = [...runs].sort(compareDispatches)[0];
  requirePolicy(
    runAttempt?.id === firstRun.id
      && runAttempt.workflow_id === FULL_CANDIDATE_SENTINEL_WORKFLOW.id
      && runAttempt.name === FULL_CANDIDATE_SENTINEL_WORKFLOW.name
      && runAttempt.path === FULL_CANDIDATE_SENTINEL_WORKFLOW.path
      && runAttempt.run_attempt === 1
      && runAttempt.event === 'push'
      && runAttempt.head_branch === 'main'
      && runAttempt.head_sha === sourceRevision
      && runAttempt.status === 'completed'
      && runAttempt.conclusion === 'success',
    'protected-main-sentinel-invalid',
    'first Sentinel main-push attempt did not complete successfully',
  );
  validateRunRepositoryIdentity(runAttempt, 'Sentinel attempt one');
  for (const key of ['created_at', 'run_started_at', 'updated_at']) {
    requireTimestamp(runAttempt[key], `Sentinel attempt one ${key}`);
  }

  const jobs = Array.isArray(jobsPayload?.jobs) ? jobsPayload.jobs : [];
  requirePolicy(
    jobsPayload?.total_count === 1 && jobs.length === 1,
    'protected-main-sentinel-invalid',
    'Sentinel attempt one must expose exactly one job',
  );
  const job = jobs[0];
  const expectedJobUrl = `https://github.com/${FULL_CANDIDATE_REPOSITORY}/actions/runs/${firstRun.id}/job/${job?.id}`;
  const expectedCheckPrefix = `https://api.github.com/repos/${FULL_CANDIDATE_REPOSITORY}/check-runs/`;
  const checkRunId = parsePositiveIntegerSuffix(job?.check_run_url, expectedCheckPrefix);
  requirePolicy(
    Number.isSafeInteger(job?.id)
      && job.id > 0
      && job.run_id === firstRun.id
      && job.run_attempt === 1
      && job.workflow_name === FULL_CANDIDATE_SENTINEL_WORKFLOW.name
      && job.name === 'evaluate'
      && job.head_sha === sourceRevision
      && job.status === 'completed'
      && job.conclusion === 'success'
      && job.html_url === expectedJobUrl
      && checkRunId !== null,
    'protected-main-sentinel-invalid',
    'Sentinel evaluate job identity or first-attempt result differs',
  );
  requirePolicy(
    checkRun?.id === checkRunId
      && checkRun.url === job.check_run_url
      && checkRun.name === 'evaluate'
      && checkRun.head_sha === sourceRevision
      && checkRun.status === 'completed'
      && checkRun.conclusion === 'success'
      && checkRun.app?.id === GITHUB_ACTIONS_APP_ID
      && checkRun.details_url === job.html_url
      && checkRun.check_suite?.head_sha === sourceRevision,
    'protected-main-sentinel-invalid',
    'evaluate check run is not bound to the exact Sentinel workflow job and source revision',
  );

  return Object.freeze({
    checkRunId,
    completedAt: runAttempt.updated_at,
    jobId: job.id,
    runAttempt: 1,
    runId: firstRun.id,
    sourceRevision,
    status: 'verified-control-plane-only',
    workflowId: FULL_CANDIDATE_SENTINEL_WORKFLOW.id,
  });
}

export function validateProducerDispatchAfterSentinel(selectedDispatch, sentinelObservation) {
  requireTimestamp(selectedDispatch?.createdAt, 'producer dispatch createdAt');
  requireTimestamp(sentinelObservation?.completedAt, 'Sentinel completedAt');
  requirePolicy(
    selectedDispatch.sourceRevision === sentinelObservation.sourceRevision
      && Date.parse(selectedDispatch.createdAt) > Date.parse(sentinelObservation.completedAt),
    'producer-before-sentinel',
    'producer dispatch is not strictly after the successful first Sentinel attempt or targets another revision',
  );
  return true;
}

/** Actions artifacts are forbidden until redistribution and restricted handoff are reviewed. */
export function validateNoActionsArtifacts(payload) {
  const artifacts = Array.isArray(payload?.artifacts) ? payload.artifacts : null;
  requirePolicy(
    artifacts !== null
      && payload.total_count === 0
      && artifacts.length === 0,
    'public-scientific-artifact-forbidden',
    'the producer campaign must not publish any GitHub Actions artifact',
  );
  return Object.freeze({
    actionsArtifactCount: 0,
    publicArtifactPublicationEligible: false,
  });
}

/**
 * Convert an authenticated terminal GitHub observation into the exact input
 * shape expected by the independent scientific verifier. No producer, job or
 * hardware identity is promoted into scientific evidence.
 */
export function terminalPartitionEvidenceFromGitHub({ conclusion, model, observation }) {
  const spec = MODEL_SPECS[model];
  requirePolicy(Boolean(spec), 'terminal-partition-invalid', 'model is outside the full-candidate allowlist');
  if (conclusion === 'not-started') {
    requirePolicy(
      observation === null || observation === undefined,
      'terminal-partition-invalid',
      'not-started evidence must not invent a GitHub job observation',
    );
    return terminalEvidence(model, spec.modelId, 'not-started', 'github-job-not-started', 'The model job was not created in the first producer attempt.');
  }

  requirePolicy(
    TERMINAL_JOB_CONCLUSIONS.has(conclusion)
      && isPlainObject(observation)
      && VERIFIED_FIRST_PRODUCER_JOBS.has(observation)
      && observation.model === model
      && observation.modelId === spec.modelId
      && observation?.status === 'completed'
      && observation.conclusion === conclusion
      && observation.runAttempt === 1
      && Number.isSafeInteger(observation.workflowRunId)
      && observation.workflowRunId > 0
      && Number.isSafeInteger(observation.jobId)
      && observation.jobId > 0,
    'terminal-partition-invalid',
    'terminal job observation is unavailable or inconsistent',
  );
  const status = conclusion === 'cancelled' ? 'cancelled' : 'failed';
  const code = `github-job-${conclusion.replaceAll('_', '-')}-before-restricted-handoff`;
  return terminalEvidence(
    model,
    spec.modelId,
    status,
    code,
    `GitHub reported the first producer attempt job as ${conclusion} before any restricted scientific handoff.`,
  );
}

export function fullCandidateGitHubRejection(error, fallbackCode = 'github-control-plane-rejected') {
  const normalizedFallbackCode = typeof fallbackCode === 'string'
    && CODE_PATTERN.test(fallbackCode)
    ? fallbackCode
    : 'github-control-plane-rejected';
  const code = typeof error?.code === 'string' && CODE_PATTERN.test(error.code)
    ? error.code
    : normalizedFallbackCode;
  const messageValue = error instanceof Error
    ? error.message
    : error ?? 'GitHub control-plane readiness is unavailable.';
  let rawMessage;
  try {
    rawMessage = String(messageValue);
  } catch {
    rawMessage = 'GitHub control-plane readiness is unavailable.';
  }
  const sanitizedMessage = rawMessage
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .trim()
    .slice(0, 2_048);
  const message = sanitizedMessage || 'GitHub control-plane readiness is unavailable.';
  return Object.freeze({
    claims: structuredClone(CLAIMS),
    rejection: Object.freeze({ code, message }),
    schemaVersion: FULL_CANDIDATE_GITHUB_RESULT_SCHEMA_VERSION,
    status: 'rejected',
  });
}

export function producerWorkflowNotPinnedError() {
  return new FullCandidateGitHubPolicyError(
    'producer-workflow-not-pinned',
    'The registered quarantine shell is not an executable producer, and no executable full-candidate producer workflow identity has been reviewed or pinned; dispatch and scientific verification are forbidden.',
  );
}

export class FullCandidateGitHubPolicyError extends Error {
  constructor(code, message) {
    super(`full-candidate GitHub evidence rejected: ${message}`);
    this.code = code;
    this.name = 'FullCandidateGitHubPolicyError';
  }
}

function validateProducerWorkflow(workflow) {
  if (workflow?.configured !== true || !Number.isSafeInteger(workflow.id) || workflow.id < 1) {
    throw producerWorkflowNotPinnedError();
  }
  requirePolicy(
    typeof workflow.name === 'string'
      && workflow.name.length > 0
      && workflow.name.length <= 128
      && typeof workflow.path === 'string'
      && /^\.github\/workflows\/[A-Za-z0-9._-]+\.ya?ml$/.test(workflow.path),
    'producer-workflow-invalid',
    'pinned producer workflow name or path is invalid',
  );
}

function completeRunListing(payload, label) {
  const runs = Array.isArray(payload?.workflow_runs) ? payload.workflow_runs : null;
  requirePolicy(
    runs !== null
      && Number.isSafeInteger(payload.total_count)
      && payload.total_count === runs.length
      && payload.total_count <= MAX_COMPLETE_RUN_LISTING,
    'run-listing-incomplete',
    `${label} run listing is unavailable, truncated, or exceeds the auditable bound`,
  );
  return runs;
}

function requireUniqueDispatchIdentities(runs, label) {
  const ids = new Set();
  const numbers = new Set();
  for (const run of runs) {
    requirePolicy(
      !ids.has(run.id) && !numbers.has(run.run_number),
      'run-listing-incomplete',
      `${label} run listing contains duplicate identities`,
    );
    ids.add(run.id);
    numbers.add(run.run_number);
  }
}

function validateRunRepositoryIdentity(run, label) {
  requirePolicy(
    run.repository?.id === FULL_CANDIDATE_REPOSITORY_ID
      && run.repository?.full_name === FULL_CANDIDATE_REPOSITORY
      && run.head_repository?.id === FULL_CANDIDATE_REPOSITORY_ID
      && run.head_repository?.full_name === FULL_CANDIDATE_REPOSITORY,
    'run-repository-identity-invalid',
    `${label} repository identity differs`,
  );
}

function summarizeDispatch(run) {
  return Object.freeze({
    createdAt: run.created_at,
    id: run.id,
    runNumber: run.run_number,
    sourceRevision: run.head_sha,
    workflowId: run.workflow_id,
    workflowName: run.name,
    workflowPath: run.path,
  });
}

function terminalEvidence(model, modelId, status, code, message) {
  return {
    model,
    modelId,
    producerScientificPayloadFiles: new Map(),
    status,
    termination: { code, message },
  };
}

function parsePositiveIntegerSuffix(value, prefix) {
  if (typeof value !== 'string' || !value.startsWith(prefix)) return null;
  const suffix = value.slice(prefix.length);
  if (!/^[1-9][0-9]*$/.test(suffix)) return null;
  const parsed = Number(suffix);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

function requireRevision(value, label) {
  requirePolicy(REVISION_PATTERN.test(value ?? ''), 'source-revision-invalid', `${label} is invalid`);
}

function requireTimestamp(value, label) {
  const match = typeof value === 'string' ? TIMESTAMP_PATTERN.exec(value) : null;
  const calendar = match && /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/.exec(value);
  const milliseconds = calendar ? Date.UTC(
    Number(calendar[1]),
    Number(calendar[2]) - 1,
    Number(calendar[3]),
    Number(calendar[4]),
    Number(calendar[5]),
    Number(calendar[6]),
  ) : Number.NaN;
  const parsed = new Date(milliseconds);
  requirePolicy(
    match
      && Number.isFinite(milliseconds)
      && parsed.getUTCFullYear() === Number(calendar[1])
      && parsed.getUTCMonth() + 1 === Number(calendar[2])
      && parsed.getUTCDate() === Number(calendar[3])
      && parsed.getUTCHours() === Number(calendar[4])
      && parsed.getUTCMinutes() === Number(calendar[5])
      && parsed.getUTCSeconds() === Number(calendar[6])
      && Number.isFinite(Date.parse(value)),
    'timestamp-invalid',
    `${label} is not a canonical UTC timestamp`,
  );
  return value;
}

function requirePositiveInteger(value, label) {
  requirePolicy(Number.isSafeInteger(value) && value > 0, 'identifier-invalid', `${label} must be a positive safe integer`);
}

function compareDispatches(left, right) {
  return left.run_number - right.run_number
    || Date.parse(left.created_at) - Date.parse(right.created_at)
    || left.id - right.id;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requirePolicy(condition, code, message) {
  if (!condition) throw new FullCandidateGitHubPolicyError(code, message);
}
