import { describe, expect, it } from 'vitest';
import {
  FULL_CANDIDATE_PRODUCER_WORKFLOW,
  FULL_CANDIDATE_REGISTRATION_WORKFLOW,
  FULL_CANDIDATE_REPOSITORY,
  FULL_CANDIDATE_REPOSITORY_ID,
  FULL_CANDIDATE_REPOSITORY_OWNER_ID,
  FULL_CANDIDATE_SENTINEL_WORKFLOW,
  fullCandidateGitHubRejection,
  selectFirstProducerDispatch,
  terminalPartitionEvidenceFromGitHub,
  validateFirstProducerAttempt,
  validateFirstProducerJob,
  validateNoActionsArtifacts,
  validateProducerDispatchAfterSentinel,
  validateProtectedMainSentinel,
  verifiedFirstProducerAttemptProvenance,
  verifiedSuccessfulProducerJobProvenance,
} from './full-candidate-github-evidence-policy.mjs';

const SOURCE_REVISION = '1234567890abcdef1234567890abcdef12345678';
const PRODUCER_WORKFLOW = Object.freeze({
  ...FULL_CANDIDATE_PRODUCER_WORKFLOW,
  configured: true,
  id: 900_001,
});
const REPOSITORY_IDENTITY = Object.freeze({
  full_name: FULL_CANDIDATE_REPOSITORY,
  id: FULL_CANDIDATE_REPOSITORY_ID,
});

function workflowRun({
  createdAt = '2026-09-03T06:10:00Z',
  event = 'workflow_dispatch',
  headSha = SOURCE_REVISION,
  id,
  name = PRODUCER_WORKFLOW.name,
  path = PRODUCER_WORKFLOW.path,
  runNumber,
  workflowId = PRODUCER_WORKFLOW.id,
} = {}) {
  return {
    created_at: createdAt,
    event,
    head_branch: 'main',
    head_repository: REPOSITORY_IDENTITY,
    head_sha: headSha,
    id,
    name,
    path,
    repository: REPOSITORY_IDENTITY,
    run_number: runNumber,
    workflow_id: workflowId,
  };
}

function producerAttempt(run, { attempt = 1, conclusion = 'failure' } = {}) {
  return {
    ...run,
    conclusion,
    run_attempt: attempt,
    run_started_at: '2026-09-03T06:10:01Z',
    status: 'completed',
    updated_at: '2026-09-03T06:12:00Z',
  };
}

function producerJob(run, {
  conclusion = 'success',
  id = 940_001,
  model = 'mattersim',
} = {}) {
  return {
    conclusion,
    head_sha: run.head_sha,
    id,
    name: model,
    run_attempt: 1,
    run_id: run.id,
    status: 'completed',
    workflow_name: run.name,
  };
}

function verifiedProducerJob(conclusion, model = 'mattersim') {
  const run = workflowRun({ id: 945_001, runNumber: 1 });
  const selected = selectFirstProducerDispatch({
    total_count: 1,
    workflow_runs: [run],
  }, PRODUCER_WORKFLOW, SOURCE_REVISION).selected;
  const attempt = validateFirstProducerAttempt(
    selected,
    producerAttempt(run, { conclusion: conclusion === 'success' ? 'success' : conclusion }),
  );
  return validateFirstProducerJob(
    attempt,
    producerJob(run, { conclusion, model }),
    model,
  );
}

function sentinelObservations() {
  const sentinelRun = workflowRun({
    createdAt: '2026-09-03T06:00:00Z',
    event: 'push',
    id: 800_001,
    name: FULL_CANDIDATE_SENTINEL_WORKFLOW.name,
    path: FULL_CANDIDATE_SENTINEL_WORKFLOW.path,
    runNumber: 40,
    workflowId: FULL_CANDIDATE_SENTINEL_WORKFLOW.id,
  });
  const jobId = 700_001;
  const checkRunId = 600_001;
  const jobUrl = `https://github.com/${FULL_CANDIDATE_REPOSITORY}/actions/runs/${sentinelRun.id}/job/${jobId}`;
  const checkRunUrl = `https://api.github.com/repos/${FULL_CANDIDATE_REPOSITORY}/check-runs/${checkRunId}`;
  return {
    branch: {
      commit: { sha: SOURCE_REVISION },
      name: 'main',
      protected: true,
    },
    branchProtection: {
      allow_deletions: { enabled: false },
      allow_force_pushes: { enabled: false },
      enforce_admins: { enabled: true },
      required_linear_history: { enabled: true },
      required_status_checks: {
        checks: [{ app_id: 15_368, context: 'evaluate' }],
        strict: true,
      },
    },
    checkRun: {
      app: { id: 15_368 },
      check_suite: { head_sha: SOURCE_REVISION },
      conclusion: 'success',
      details_url: jobUrl,
      head_sha: SOURCE_REVISION,
      id: checkRunId,
      name: 'evaluate',
      status: 'completed',
      url: checkRunUrl,
    },
    jobs: {
      jobs: [{
        check_run_url: checkRunUrl,
        conclusion: 'success',
        head_sha: SOURCE_REVISION,
        html_url: jobUrl,
        id: jobId,
        name: 'evaluate',
        run_attempt: 1,
        run_id: sentinelRun.id,
        status: 'completed',
        workflow_name: FULL_CANDIDATE_SENTINEL_WORKFLOW.name,
      }],
      total_count: 1,
    },
    repository: {
      ...REPOSITORY_IDENTITY,
      owner: { id: FULL_CANDIDATE_REPOSITORY_OWNER_ID },
    },
    runAttempt: {
      ...sentinelRun,
      conclusion: 'success',
      run_attempt: 1,
      run_started_at: '2026-09-03T06:00:01Z',
      status: 'completed',
      updated_at: '2026-09-03T06:05:00Z',
    },
    runListing: { total_count: 1, workflow_runs: [sentinelRun] },
    workflow: {
      ...FULL_CANDIDATE_SENTINEL_WORKFLOW,
      state: 'active',
    },
  };
}

describe('full-candidate GitHub control-plane policy', () => {
  it('keeps the registered quarantine shell separate from the unconfigured producer', () => {
    expect(FULL_CANDIDATE_PRODUCER_WORKFLOW).toEqual({
      configured: false,
      id: null,
      name: 'Atomistic full candidate private producer (non-promotional)',
      path: '.github/workflows/atomistic-full-candidate.yml',
    });
    expect(() => selectFirstProducerDispatch(
      { total_count: 0, workflow_runs: [] },
      FULL_CANDIDATE_PRODUCER_WORKFLOW,
      SOURCE_REVISION,
    )).toThrow(/registered quarantine shell is not an executable producer/);
    expect(FULL_CANDIDATE_REGISTRATION_WORKFLOW).toMatchObject({
      id: 349_363_715,
      name: FULL_CANDIDATE_PRODUCER_WORKFLOW.name,
      nodeId: 'W_kwDOUG-2WM4U0t4D',
      path: FULL_CANDIDATE_PRODUCER_WORKFLOW.path,
      producerConfigured: false,
      registered: true,
      state: 'active',
    });
    expect(FULL_CANDIDATE_REGISTRATION_WORKFLOW.registration).toEqual({
      gitBlobOid: '76d40b0938df50375728b4f68133a52a1ceabd13',
      parentRevision: '72bc2011d75d9880b9918b70c903129b9bf1de65',
      revision: '3221265a4145626dd9e32876fa911f23ae49fbff',
      sha256: 'sha256:e578459f2c46e77d10f3fd944984daa01f845219921454c3095b9852e4074cc0',
      sizeBytes: 520,
      treeOid: '2b9735696a4c2b1fc8419b6de818df7289246c8b',
    });
  });

  it('selects the first dispatch even when a later independent dispatch succeeds', () => {
    const firstFailure = workflowRun({
      createdAt: '2026-09-03T06:10:00Z',
      id: 910_001,
      runNumber: 1,
    });
    const laterSuccess = workflowRun({
      createdAt: '2026-09-03T06:20:00Z',
      id: 910_002,
      runNumber: 2,
    });
    const selected = selectFirstProducerDispatch({
      total_count: 2,
      workflow_runs: [laterSuccess, firstFailure],
    }, PRODUCER_WORKFLOW, SOURCE_REVISION);

    expect(selected).toMatchObject({
      ignoredDispatchIds: [laterSuccess.id],
      queryCoverageComplete: true,
      selected: { id: firstFailure.id, runNumber: firstFailure.run_number },
      totalDispatches: 2,
    });
    const attempt = validateFirstProducerAttempt(
      selected.selected,
      producerAttempt(firstFailure, { conclusion: 'failure' }),
    );
    expect(attempt).toMatchObject({
      conclusion: 'failure',
      id: firstFailure.id,
      runAttempt: 1,
      workflowId: PRODUCER_WORKFLOW.id,
    });
    expect(verifiedFirstProducerAttemptProvenance(attempt)).toEqual({
      conclusion: 'failure',
      runAttempt: 1,
      sourceRevision: SOURCE_REVISION,
      status: 'completed',
      workflowRunId: firstFailure.id,
    });
    expect(() => verifiedFirstProducerAttemptProvenance({ ...attempt })).toThrow(
      /not derived from the validated first dispatch/,
    );

    const successfulJob = validateFirstProducerJob(
      attempt,
      producerJob(firstFailure),
      'mattersim',
    );
    expect(verifiedSuccessfulProducerJobProvenance(successfulJob)).toEqual({
      jobId: 940_001,
      model: 'mattersim',
      modelId: 'mattersim-v1.0.0-5m',
      runAttempt: 1,
      sourceRevision: SOURCE_REVISION,
      workflowRunId: firstFailure.id,
    });
  });

  it('requires an exact successful model-job proof for scientific handoff', () => {
    const run = workflowRun({ id: 918_001, runNumber: 1 });
    const selected = selectFirstProducerDispatch({
      total_count: 1,
      workflow_runs: [run],
    }, PRODUCER_WORKFLOW, SOURCE_REVISION).selected;
    const attempt = validateFirstProducerAttempt(
      selected,
      producerAttempt(run, { conclusion: 'failure' }),
    );
    const failedJob = validateFirstProducerJob(
      attempt,
      producerJob(run, { conclusion: 'failure' }),
      'mattersim',
    );
    expect(() => verifiedSuccessfulProducerJobProvenance(failedJob)).toThrow(
      /requires the exact validated successful model job/,
    );

    const successfulJob = validateFirstProducerJob(attempt, producerJob(run), 'mattersim');
    for (const forged of [
      { ...successfulJob, jobId: 999 },
      structuredClone(successfulJob),
      JSON.parse(JSON.stringify(successfulJob)),
    ]) {
      expect(() => verifiedSuccessfulProducerJobProvenance(forged)).toThrow(
        /requires the exact validated successful model job/,
      );
    }
  });

  it('rejects a current listing that omits deleted workflow run number one', () => {
    const later = workflowRun({ id: 915_002, runNumber: 2 });
    expect(() => selectFirstProducerDispatch({
      total_count: 1,
      workflow_runs: [later],
    }, PRODUCER_WORKFLOW, SOURCE_REVISION)).toThrow(/run number one is absent/);
  });

  it('rejects attempt two even when it succeeds after attempt one failed', () => {
    const first = workflowRun({ id: 920_001, runNumber: 1 });
    const selected = selectFirstProducerDispatch({
      total_count: 1,
      workflow_runs: [first],
    }, PRODUCER_WORKFLOW, SOURCE_REVISION);
    expect(() => validateFirstProducerAttempt(
      selected.selected,
      producerAttempt(first, { attempt: 2, conclusion: 'success' }),
    )).toThrow(/attempt one is unavailable/);
  });

  it('binds redundant attempt-one summary fields to the selected first dispatch', () => {
    const first = workflowRun({ id: 925_001, runNumber: 1 });
    const selected = selectFirstProducerDispatch({
      total_count: 1,
      workflow_runs: [first],
    }, PRODUCER_WORKFLOW, SOURCE_REVISION).selected;
    const drifted = producerAttempt(first);
    drifted.run_number = 999;
    drifted.created_at = '2026-09-04T06:10:00Z';
    expect(() => validateFirstProducerAttempt(selected, drifted)).toThrow(
      /bound to different source identity/,
    );
  });

  it('requires complete run history rather than accepting a paginated subset', () => {
    const run = workflowRun({ id: 930_001, runNumber: 1 });
    expect(() => selectFirstProducerDispatch(
      { total_count: 2, workflow_runs: [run] },
      PRODUCER_WORKFLOW,
      SOURCE_REVISION,
    )).toThrow(/unavailable, truncated/);
  });

  it('binds protected main, first Sentinel attempt, evaluate job and check URL', () => {
    const observed = validateProtectedMainSentinel(sentinelObservations(), SOURCE_REVISION);
    expect(observed).toMatchObject({
      runAttempt: 1,
      sourceRevision: SOURCE_REVISION,
      status: 'verified-control-plane-only',
      workflowId: FULL_CANDIDATE_SENTINEL_WORKFLOW.id,
    });
    expect(validateProducerDispatchAfterSentinel({
      createdAt: '2026-09-03T06:05:01Z',
      sourceRevision: SOURCE_REVISION,
    }, observed)).toBe(true);
    expect(() => validateProducerDispatchAfterSentinel({
      createdAt: '2026-09-03T06:04:59Z',
      sourceRevision: SOURCE_REVISION,
    }, observed)).toThrow(/not strictly after/);
    expect(() => validateProducerDispatchAfterSentinel({
      createdAt: observed.completedAt,
      sourceRevision: SOURCE_REVISION,
    }, observed)).toThrow(/not strictly after/);
  });

  it('rejects same-name evaluate checks that are detached from the Sentinel job', () => {
    const wrongWorkflow = sentinelObservations();
    wrongWorkflow.jobs.jobs[0].workflow_name = 'Different workflow';
    expect(() => validateProtectedMainSentinel(wrongWorkflow, SOURCE_REVISION)).toThrow(/job identity/);

    const wrongDetails = sentinelObservations();
    wrongDetails.checkRun.details_url = `https://github.com/${FULL_CANDIDATE_REPOSITORY}/actions/runs/999/job/999`;
    expect(() => validateProtectedMainSentinel(wrongDetails, SOURCE_REVISION)).toThrow(/not bound/);

    const weakProtection = sentinelObservations();
    weakProtection.branchProtection.enforce_admins.enabled = false;
    expect(() => validateProtectedMainSentinel(weakProtection, SOURCE_REVISION)).toThrow(/branch protection differs/);
  });

  it('forbids every Actions artifact, including ciphertext', () => {
    expect(validateNoActionsArtifacts({ artifacts: [], total_count: 0 })).toEqual({
      actionsArtifactCount: 0,
      publicArtifactPublicationEligible: false,
    });
    expect(() => validateNoActionsArtifacts({
      artifacts: [{ id: 1, name: 'ciphertext-only-is-still-forbidden' }],
      total_count: 1,
    })).toThrow(/must not publish any GitHub Actions artifact/);
  });

  it.each([
    ['failure', 'failed', 'github-job-failure-before-restricted-handoff'],
    ['cancelled', 'cancelled', 'github-job-cancelled-before-restricted-handoff'],
    ['timed_out', 'failed', 'github-job-timed-out-before-restricted-handoff'],
  ])('maps %s to exact empty scientific evidence', (conclusion, status, code) => {
    const evidence = terminalPartitionEvidenceFromGitHub({
      conclusion,
      model: 'mattersim',
      observation: verifiedProducerJob(conclusion),
    });
    expect(Object.keys(evidence).sort()).toEqual([
      'model',
      'modelId',
      'producerScientificPayloadFiles',
      'status',
      'termination',
    ]);
    expect(evidence).toMatchObject({
      model: 'mattersim',
      modelId: 'mattersim-v1.0.0-5m',
      status,
      termination: { code },
    });
    expect(evidence.producerScientificPayloadFiles).toBeInstanceOf(Map);
    expect(evidence.producerScientificPayloadFiles.size).toBe(0);
    expect(evidence).not.toHaveProperty('producer');
    expect(evidence).not.toHaveProperty('hardwareId');
  });

  it('represents an absent job as not-started without inventing an observation', () => {
    const evidence = terminalPartitionEvidenceFromGitHub({
      conclusion: 'not-started',
      model: 'mace',
      observation: null,
    });
    expect(evidence).toMatchObject({
      model: 'mace',
      modelId: 'mace-mpa-0-medium',
      status: 'not-started',
      termination: { code: 'github-job-not-started' },
    });
    expect(evidence.producerScientificPayloadFiles.size).toBe(0);
    expect(() => terminalPartitionEvidenceFromGitHub({
      conclusion: 'success',
      model: 'mace',
      observation: verifiedProducerJob('success', 'mace'),
    })).toThrow(/unavailable or inconsistent/);
  });

  it('always returns a schema-compatible rejection code and nonempty bounded message', () => {
    expect(fullCandidateGitHubRejection(new Error(''), 'NOT VALID')).toMatchObject({
      rejection: {
        code: 'github-control-plane-rejected',
        message: 'GitHub control-plane readiness is unavailable.',
      },
      status: 'rejected',
    });
  });
});
