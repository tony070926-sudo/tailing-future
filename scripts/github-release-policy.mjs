export const releaseRepository = Object.freeze({
  nameWithOwner: 'tony070926-sudo/tailing-future',
  id: 1349498456,
});
export const sentinelWorkflow = Object.freeze({
  id: 344526316,
  name: 'Tailing Sentinel',
  path: '.github/workflows/evaluate.yml',
});
export const requiredBranchChecks = Object.freeze([
  Object.freeze({ context: 'evaluate', app_id: 15368 }),
]);

export function validateWorkflowMetadata(workflow) {
  const failures = [];
  if (workflow?.id !== sentinelWorkflow.id) failures.push('workflow ID differs from the pinned Sentinel workflow');
  if (workflow?.name !== sentinelWorkflow.name) failures.push('workflow name differs from the pinned Sentinel workflow');
  if (workflow?.path !== sentinelWorkflow.path) failures.push('workflow path differs from the pinned Sentinel workflow');
  if (workflow?.state !== 'active') failures.push('pinned Sentinel workflow is not active');
  return failures;
}

export function selectReleaseRun(runs, head) {
  if (!Array.isArray(runs)) return null;
  return runs.find((run) => run?.id && run.workflow_id === sentinelWorkflow.id
    && run.path === sentinelWorkflow.path
    && run.name === sentinelWorkflow.name
    && run.repository?.id === releaseRepository.id
    && run.head_repository?.id === releaseRepository.id
    && run.head_sha === head
    && run.head_branch === 'main'
    && run.event === 'push'
    && run.status === 'completed'
    && run.conclusion === 'success'
    && run.run_attempt === 1) ?? null;
}

export function validateArtifactListing(payload, run, head, now = new Date()) {
  const expectedName = `tailing-sentinel-${head}`;
  const matches = Array.isArray(payload?.artifacts) ? payload.artifacts.filter((artifact) => artifact?.name === expectedName) : [];
  const failures = [];
  if (matches.length !== 1) return { artifact: null, failures: [`expected exactly one ${expectedName} artifact, found ${matches.length}`] };
  const artifact = matches[0];
  if (!Number.isSafeInteger(artifact.id) || artifact.id < 1) failures.push('Sentinel artifact has no stable numeric ID');
  if (!/^sha256:[0-9a-f]{64}$/.test(artifact.digest ?? '')) failures.push('Sentinel artifact has no concrete API digest');
  if (artifact.expired !== false) failures.push('Sentinel artifact is expired');
  const expiry = Date.parse(artifact.expires_at ?? '');
  if (!Number.isFinite(expiry) || expiry <= now.getTime()) failures.push('Sentinel artifact expiry is invalid or elapsed');
  const binding = artifact.workflow_run;
  if (binding?.id !== run.id || binding?.head_sha !== head || binding?.head_branch !== 'main') failures.push('Sentinel artifact is not bound to the selected run and main SHA');
  if (binding?.repository_id !== releaseRepository.id || binding?.head_repository_id !== releaseRepository.id) failures.push('Sentinel artifact repository binding is invalid');
  return { artifact, failures };
}

export function validateBranchProtection(protection) {
  const failures = [];
  const statusChecks = protection?.required_status_checks;
  if (statusChecks?.strict !== true) failures.push('branch protection strict status checks are disabled');
  const actualChecks = [...(statusChecks?.checks ?? [])]
    .map(({ context, app_id }) => ({ context, app_id }))
    .sort(compareChecks);
  const expectedChecks = [...requiredBranchChecks].sort(compareChecks);
  if (JSON.stringify(actualChecks) !== JSON.stringify(expectedChecks)) failures.push('branch protection required checks differ from the pinned set');
  if (protection?.enforce_admins?.enabled !== true) failures.push('branch protection does not include administrators');
  if (protection?.required_linear_history?.enabled !== true) failures.push('linear history is not required');
  if (protection?.allow_force_pushes?.enabled !== false) failures.push('force pushes are not explicitly disabled');
  if (protection?.allow_deletions?.enabled !== false) failures.push('branch deletion is not explicitly disabled');
  return failures;
}

function compareChecks(left, right) {
  return left.context.localeCompare(right.context) || left.app_id - right.app_id;
}
