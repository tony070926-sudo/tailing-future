import { describe, expect, it } from 'vitest';
import {
  releaseRepository,
  selectReleaseRun,
  sentinelWorkflow,
  validateArtifactListing,
  validateBranchProtection,
  validateWorkflowMetadata,
} from './github-release-policy.mjs';

const head = 'a'.repeat(40);
const run = {
  id: 7,
  workflow_id: sentinelWorkflow.id,
  path: sentinelWorkflow.path,
  name: sentinelWorkflow.name,
  repository: { id: releaseRepository.id },
  head_repository: { id: releaseRepository.id },
  head_sha: head,
  head_branch: 'main',
  event: 'push',
  status: 'completed',
  conclusion: 'success',
  run_attempt: 1,
};
const protection = {
  required_status_checks: { strict: true, checks: [{ context: 'evaluate', app_id: 15368 }] },
  enforce_admins: { enabled: true },
  required_linear_history: { enabled: true },
  allow_force_pushes: { enabled: false },
  allow_deletions: { enabled: false },
};

describe('GitHub release provenance policy', () => {
  it('selects only the exact first-attempt push run from the pinned workflow and repository', () => {
    expect(selectReleaseRun([run], head)).toEqual(run);
    for (const mutation of [
      { workflow_id: 9 }, { path: '.github/workflows/forged.yml' }, { name: 'forged' },
      { repository: { id: 9 } }, { head_repository: { id: 9 } }, { head_sha: 'b'.repeat(40) },
      { head_branch: 'feature' }, { event: 'pull_request' }, { status: 'queued' },
      { conclusion: 'failure' }, { run_attempt: 2 },
    ]) expect(selectReleaseRun([{ ...run, ...mutation }], head)).toBeNull();
  });

  it('requires exact active workflow metadata', () => {
    const workflow = { ...sentinelWorkflow, state: 'active' };
    expect(validateWorkflowMetadata(workflow)).toEqual([]);
    expect(validateWorkflowMetadata({ ...workflow, path: '.github/workflows/forged.yml' })).not.toEqual([]);
    expect(validateWorkflowMetadata({ ...workflow, state: 'disabled_manually' })).not.toEqual([]);
  });

  it('binds one unexpired, digested artifact to the selected run, repository and SHA', () => {
    const artifact = {
      id: 11,
      name: `tailing-sentinel-${head}`,
      digest: `sha256:${'1'.repeat(64)}`,
      expired: false,
      expires_at: '2030-01-01T00:00:00Z',
      workflow_run: {
        id: run.id,
        head_sha: head,
        head_branch: 'main',
        repository_id: releaseRepository.id,
        head_repository_id: releaseRepository.id,
      },
    };
    expect(validateArtifactListing({ artifacts: [artifact] }, run, head, new Date('2029-01-01')).failures).toEqual([]);
    expect(validateArtifactListing({ artifacts: [artifact, artifact] }, run, head).failures).not.toEqual([]);
    expect(validateArtifactListing({ artifacts: [{ ...artifact, digest: null }] }, run, head).failures).not.toEqual([]);
    expect(validateArtifactListing({ artifacts: [{ ...artifact, expired: true }] }, run, head).failures).not.toEqual([]);
    expect(validateArtifactListing({ artifacts: [{ ...artifact, workflow_run: { ...artifact.workflow_run, id: 8 } }] }, run, head).failures).not.toEqual([]);
  });

  it('fails closed when any branch-protection invariant drifts', () => {
    expect(validateBranchProtection(protection)).toEqual([]);
    expect(validateBranchProtection({ ...protection, required_status_checks: { ...protection.required_status_checks, strict: false } })).not.toEqual([]);
    expect(validateBranchProtection({ ...protection, required_status_checks: { strict: true, checks: [{ context: 'forged', app_id: 15368 }] } })).not.toEqual([]);
    expect(validateBranchProtection({ ...protection, enforce_admins: { enabled: false } })).not.toEqual([]);
    expect(validateBranchProtection({ ...protection, allow_force_pushes: { enabled: true } })).not.toEqual([]);
  });
});
