import { spawnSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  FULL_CANDIDATE_PRODUCER_WORKFLOW,
  FULL_CANDIDATE_REGISTRATION_WORKFLOW,
  FULL_CANDIDATE_REPOSITORY,
  FULL_CANDIDATE_REPOSITORY_ID,
  FULL_CANDIDATE_REPOSITORY_OWNER_ID,
  FULL_CANDIDATE_SENTINEL_WORKFLOW,
  selectFirstProducerDispatch,
  verifiedFirstProducerAttemptProvenance,
  verifiedSuccessfulProducerJobProvenance,
} from './full-candidate-github-evidence-policy.mjs';
import {
  FULL_CANDIDATE_REGISTRATION_MAX_LIST_ITEMS,
  fullCandidateRegistrationRejection,
  validateFullCandidateRegistrationCapture,
} from './full-candidate-registration-policy.mjs';
import {
  FULL_CANDIDATE_REGISTRATION_HTTP_CONTRACT,
  inspectFullCandidateRegistration,
} from './inspect-full-candidate-registration.mjs';
import { inspectFullCandidateGitHubReadiness } from './inspect-full-candidate-github-readiness.mjs';
import { createPrivateFullCandidateHandoff } from './private-full-candidate-handoff.mjs';

const workflowBytes = await readFile(new URL(
  '../../.github/workflows/atomistic-full-candidate.yml',
  import.meta.url,
));
const schema = JSON.parse(await readFile(new URL(
  '../../schemas/atomistic-full-candidate-registration-observation.schema.json',
  import.meta.url,
), 'utf8'));
const packageManifest = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8'));
const workflowDirectory = new URL('../../.github/workflows/', import.meta.url);
const workflowSources = await Promise.all((await readdir(workflowDirectory))
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => readFile(new URL(name, workflowDirectory), 'utf8')));
const offlineEvaluatorSources = await Promise.all([
  readFile(new URL('../evaluate.mjs', import.meta.url), 'utf8'),
  readFile(new URL('../evaluate-worker.mjs', import.meta.url), 'utf8'),
]);
const validateSchema = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: false,
}).compile(schema);
const originalToken = process.env.GITHUB_TOKEN;
const originalApiUrl = process.env.GITHUB_API_URL;
const frozen = FULL_CANDIDATE_REGISTRATION_WORKFLOW.registration;
const sentinel = FULL_CANDIDATE_REGISTRATION_WORKFLOW.sentinel;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  if (originalToken === undefined) delete process.env.GITHUB_TOKEN;
  else process.env.GITHUB_TOKEN = originalToken;
  if (originalApiUrl === undefined) delete process.env.GITHUB_API_URL;
  else process.env.GITHUB_API_URL = originalApiUrl;
});

function registeredWorkflow() {
  return {
    id: FULL_CANDIDATE_REGISTRATION_WORKFLOW.id,
    name: FULL_CANDIDATE_REGISTRATION_WORKFLOW.name,
    node_id: FULL_CANDIDATE_REGISTRATION_WORKFLOW.nodeId,
    path: FULL_CANDIDATE_REGISTRATION_WORKFLOW.path,
    state: 'active',
  };
}

function sentinelRun() {
  const repository = {
    full_name: FULL_CANDIDATE_REPOSITORY,
    id: FULL_CANDIDATE_REPOSITORY_ID,
  };
  return {
    conclusion: 'success',
    created_at: '2026-09-03T13:22:11Z',
    event: 'push',
    head_branch: 'main',
    head_repository: repository,
    head_sha: frozen.revision,
    id: sentinel.runId,
    name: FULL_CANDIDATE_SENTINEL_WORKFLOW.name,
    path: FULL_CANDIDATE_SENTINEL_WORKFLOW.path,
    repository,
    run_attempt: 1,
    run_number: 93,
    status: 'completed',
    workflow_id: FULL_CANDIDATE_SENTINEL_WORKFLOW.id,
  };
}

function paginated(itemKey, items) {
  const pages = [];
  for (let offset = 0, page = 1; offset < items.length; offset += 100, page += 1) {
    pages.push({
      page,
      payload: {
        [itemKey]: structuredClone(items.slice(offset, offset + 100)),
        total_count: items.length,
      },
    });
  }
  pages.push({
    page: pages.length + 1,
    payload: { [itemKey]: [], total_count: items.length },
  });
  return { itemKey, pages };
}

function snapshot() {
  const run = sentinelRun();
  const jobUrl = `https://github.com/${FULL_CANDIDATE_REPOSITORY}/actions/runs/${run.id}/job/${sentinel.jobId}`;
  const checkRunUrl = `https://api.github.com/repos/${FULL_CANDIDATE_REPOSITORY}/check-runs/${sentinel.checkRunId}`;
  const targetEntry = {
    mode: '100644',
    path: FULL_CANDIDATE_REGISTRATION_WORKFLOW.path,
    sha: frozen.gitBlobOid,
    size: frozen.sizeBytes,
    type: 'blob',
  };
  const tree = {
    sha: frozen.treeOid,
    tree: [targetEntry],
    truncated: false,
  };
  return {
    actor: {
      id: FULL_CANDIDATE_REPOSITORY_OWNER_ID,
      login: 'tony070926-sudo',
      type: 'User',
    },
    branch: {
      commit: {
        commit: { tree: { sha: frozen.treeOid } },
        sha: frozen.revision,
      },
      name: 'main',
      protected: true,
    },
    branchProtection: {
      allow_deletions: { enabled: false },
      allow_force_pushes: { enabled: false },
      enforce_admins: { enabled: true },
      required_conversation_resolution: { enabled: true },
      required_linear_history: { enabled: true },
      required_status_checks: {
        checks: [{ app_id: 15_368, context: 'evaluate' }],
        strict: true,
      },
    },
    checkRun: {
      app: { id: 15_368 },
      check_suite: { id: sentinel.checkSuiteId },
      conclusion: 'success',
      details_url: jobUrl,
      head_sha: frozen.revision,
      id: sentinel.checkRunId,
      name: 'evaluate',
      status: 'completed',
      url: checkRunUrl,
    },
    checkSuite: {
      app: { id: 15_368 },
      conclusion: 'success',
      head_sha: frozen.revision,
      id: sentinel.checkSuiteId,
      latest_check_runs_count: 1,
      repository: {
        full_name: FULL_CANDIDATE_REPOSITORY,
        id: FULL_CANDIDATE_REPOSITORY_ID,
      },
      status: 'completed',
    },
    compare: {
      ahead_by: 0,
      base_commit: { sha: frozen.revision },
      behind_by: 0,
      commits: [],
      head_commit: { sha: frozen.revision },
      merge_base_commit: { sha: frozen.revision },
      status: 'identical',
      total_commits: 0,
    },
    currentTree: structuredClone(tree),
    hashAlgorithm: { hash_algorithm: 'sha1' },
    jobs: paginated('jobs', [{
      check_run_url: checkRunUrl,
      conclusion: 'success',
      head_sha: frozen.revision,
      html_url: jobUrl,
      id: sentinel.jobId,
      name: 'evaluate',
      run_attempt: 1,
      run_id: sentinel.runId,
      status: 'completed',
      workflow_name: FULL_CANDIDATE_SENTINEL_WORKFLOW.name,
    }]),
    registrationBlob: {
      content: workflowBytes.toString('base64').replace(/.{60}/g, '$&\n'),
      encoding: 'base64',
      sha: frozen.gitBlobOid,
      size: frozen.sizeBytes,
    },
    registrationCommit: {
      commit: {
        tree: { sha: frozen.treeOid },
        verification: { reason: 'valid', verified: true },
      },
      parents: [{ sha: frozen.parentRevision }],
      sha: frozen.revision,
    },
    registrationTree: tree,
    repository: {
      default_branch: 'main',
      full_name: FULL_CANDIDATE_REPOSITORY,
      id: FULL_CANDIDATE_REPOSITORY_ID,
      owner: { id: FULL_CANDIDATE_REPOSITORY_OWNER_ID, login: 'tony070926-sudo' },
      private: false,
    },
    repositoryRuns: paginated('workflow_runs', [run]),
    runAttempt: {
      ...run,
      run_started_at: '2026-09-03T13:22:11Z',
      updated_at: '2026-09-03T13:50:34Z',
    },
    sentinelWorkflow: {
      ...FULL_CANDIDATE_SENTINEL_WORKFLOW,
      state: 'active',
    },
    targetRuns: paginated('workflow_runs', []),
    workflowByFilename: registeredWorkflow(),
    workflowById: registeredWorkflow(),
    workflows: paginated('workflows', [registeredWorkflow()]),
  };
}

function capture() {
  return {
    completedAt: '2026-09-03T14:00:01.000Z',
    passes: [snapshot(), snapshot()],
    startedAt: '2026-09-03T14:00:00.000Z',
  };
}

function mutateBoth(registrationCapture, mutator) {
  registrationCapture.passes.forEach(mutator);
  return registrationCapture;
}

function expectSchema(result) {
  expect(validateSchema(result), JSON.stringify(validateSchema.errors)).toBe(true);
}

function responseFor(url, payload, overrides = {}) {
  const raw = overrides.raw ?? Buffer.from(JSON.stringify(payload), 'utf8');
  const chunks = overrides.chunks ?? [raw];
  const headers = new Headers({
    'content-length': String(raw.length),
    'content-type': 'application/json; charset=utf-8',
    ...(overrides.headers ?? {}),
  });
  return {
    body: new ReadableStream({
      start(controller) {
        for (const chunk of chunks) controller.enqueue(chunk);
        controller.close();
      },
    }),
    headers,
    redirected: overrides.redirected ?? false,
    status: overrides.status ?? 200,
    url: overrides.url ?? url,
  };
}

function payloadForUrl(observation, requestUrl) {
  const url = new URL(requestUrl);
  const path = url.pathname;
  const page = Number(url.searchParams.get('page'));
  const repoBase = `/repos/${FULL_CANDIDATE_REPOSITORY}`;
  if (path === '/user') return observation.actor;
  if (path === repoBase) return observation.repository;
  if (path === `${repoBase}/hash-algorithm`) return observation.hashAlgorithm;
  if (path === `${repoBase}/branches/main`) return observation.branch;
  if (path === `${repoBase}/branches/main/protection`) return observation.branchProtection;
  if (path === `${repoBase}/compare/${frozen.revision}...main`) return observation.compare;
  if (path === `${repoBase}/commits/${frozen.revision}`) return observation.registrationCommit;
  if (path === `${repoBase}/git/trees/${frozen.treeOid}`) return observation.registrationTree;
  if (path === `${repoBase}/git/blobs/${frozen.gitBlobOid}`) return observation.registrationBlob;
  if (path === `${repoBase}/actions/workflows/${FULL_CANDIDATE_REGISTRATION_WORKFLOW.id}`) {
    return observation.workflowById;
  }
  if (path === `${repoBase}/actions/workflows/atomistic-full-candidate.yml`) {
    return observation.workflowByFilename;
  }
  if (path === `${repoBase}/actions/workflows/${FULL_CANDIDATE_SENTINEL_WORKFLOW.id}`) {
    return observation.sentinelWorkflow;
  }
  if (path === `${repoBase}/actions/runs/${sentinel.runId}/attempts/1`) return observation.runAttempt;
  if (path === `${repoBase}/check-runs/${sentinel.checkRunId}`) return observation.checkRun;
  if (path === `${repoBase}/check-suites/${sentinel.checkSuiteId}`) return observation.checkSuite;
  if (path === `${repoBase}/actions/workflows/${FULL_CANDIDATE_REGISTRATION_WORKFLOW.id}/runs`) {
    return observation.targetRuns.pages[page - 1]?.payload;
  }
  if (path === `${repoBase}/actions/runs/${sentinel.runId}/attempts/1/jobs`) {
    return observation.jobs.pages[page - 1]?.payload;
  }
  if (path === `${repoBase}/actions/runs`) return observation.repositoryRuns.pages[page - 1]?.payload;
  if (path === `${repoBase}/actions/workflows`) return observation.workflows.pages[page - 1]?.payload;
  throw new Error(`unexpected fixed request ${requestUrl}`);
}

function fakeGitHubFetch(snapshots = [snapshot(), snapshot()], override = () => ({})) {
  let activePass = -1;
  const calls = [];
  const fetch = vi.fn(async (requestUrl, init) => {
    const parsed = new URL(requestUrl);
    if (parsed.pathname === `/repos/${FULL_CANDIDATE_REPOSITORY}/branches/main`) activePass += 1;
    const observation = snapshots[Math.max(0, activePass)];
    const payload = payloadForUrl(observation, requestUrl);
    const page = Number(parsed.searchParams.get('page'));
    let link = null;
    if (Number.isSafeInteger(page) && page > 0 && payload && Number.isSafeInteger(payload.total_count)) {
      const dataPages = Math.ceil(payload.total_count / 100);
      if (page < dataPages) {
        const next = new URL(requestUrl);
        next.searchParams.set('page', String(page + 1));
        const last = new URL(requestUrl);
        last.searchParams.set('page', String(dataPages));
        const numericNext = next.href.replace(
          `https://api.github.com/repos/${FULL_CANDIDATE_REPOSITORY}/`,
          `https://api.github.com/repositories/${FULL_CANDIDATE_REPOSITORY_ID}/`,
        );
        const numericLast = last.href.replace(
          `https://api.github.com/repos/${FULL_CANDIDATE_REPOSITORY}/`,
          `https://api.github.com/repositories/${FULL_CANDIDATE_REPOSITORY_ID}/`,
        );
        link = `<${numericNext}>; rel="next", <${numericLast}>; rel="last"`;
      } else if (page > 1 && dataPages > 0) {
        const previous = new URL(requestUrl);
        previous.searchParams.set('page', String(Math.min(page - 1, dataPages)));
        const last = new URL(requestUrl);
        last.searchParams.set('page', String(dataPages));
        const first = new URL(requestUrl);
        first.searchParams.set('page', '1');
        const numeric = (candidate) => candidate.href.replace(
          `https://api.github.com/repos/${FULL_CANDIDATE_REPOSITORY}/`,
          `https://api.github.com/repositories/${FULL_CANDIDATE_REPOSITORY_ID}/`,
        );
        link = `<${numeric(previous)}>; rel="prev", <${numeric(last)}>; rel="last", <${numeric(first)}>; rel="first"`;
      }
    }
    const custom = override({ activePass, init, payload, requestUrl }) ?? {};
    calls.push({ init, requestUrl });
    if (custom.throwValue) throw custom.throwValue;
    return responseFor(requestUrl, custom.payload ?? payload, {
      ...custom,
      headers: {
        ...(link ? { link } : {}),
        ...(custom.headers ?? {}),
      },
    });
  });
  fetch.calls = calls;
  return fetch;
}

describe('full-candidate registration-only observation policy', () => {
  it('binds the exact registered shell while every producer and scientific claim remains false', () => {
    const result = validateFullCandidateRegistrationCapture(capture());
    expect(result).toMatchObject({
      claims: {
        claimEligible: false,
        comparisonEligible: false,
        promotionEligible: false,
        reproduced: false,
        reproductionEligible: false,
        superiorityClaimAllowed: false,
      },
      prerequisites: {
        actualProducerRunnerVerified: false,
        dispatchEligible: false,
        privateHandoffVerified: false,
        producerConfigured: false,
        scientificEvidenceAvailable: false,
      },
      registration: {
        historicalSource: {
          blob: {
            gitBlobOid: frozen.gitBlobOid,
            sha256: frozen.sha256,
            sizeBytes: 520,
          },
          revision: frozen.revision,
          signatureVerified: true,
          treeOid: frozen.treeOid,
        },
        visibleHistory: {
          completeHistoryProven: false,
          neverRunProven: false,
          noDeletionProven: false,
          passCount: 2,
          repositoryRunPagesIncludingTerminator: 2,
          repositoryTargetMatchCount: 0,
          sentinelJobPagesIncludingTerminator: 2,
          stableAcrossTwoPasses: true,
          targetWorkflowRunCount: 0,
          targetWorkflowRunPagesIncludingTerminator: 1,
          workflowPagesIncludingTerminator: 2,
        },
        workflow: {
          dispatchEligible: false,
          id: FULL_CANDIDATE_REGISTRATION_WORKFLOW.id,
          producerConfigured: false,
          registered: true,
          state: 'active',
        },
      },
      scientificResults: {
        comparison: null,
        mace: null,
        mattersim: null,
        status: 'unavailable',
      },
      status: 'verified-registration-only',
    });
    expect(result.registration.visibleHistory.snapshotSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(Object.isFrozen(result)).toBe(true);
    expectSchema(result);
  });

  it('cannot cross the process-local producer or private-handoff provenance brands', () => {
    const observation = validateFullCandidateRegistrationCapture(capture());
    expect(() => verifiedFirstProducerAttemptProvenance(observation)).toThrow(/not derived/);
    expect(() => verifiedSuccessfulProducerJobProvenance(observation)).toThrow(/requires the exact/);
    expect(() => selectFirstProducerDispatch(
      { total_count: 0, workflow_runs: [] },
      FULL_CANDIDATE_PRODUCER_WORKFLOW,
      frozen.revision,
    )).toThrow(/not an executable producer/);
    expect(() => createPrivateFullCandidateHandoff({
      files: new Map(),
      key: Buffer.alloc(32),
      keyId: 'registration-observation-must-not-cross-handoff',
      producerOutcomeSchemaBytes: Buffer.from('{}', 'utf8'),
      verifiedProducerJob: observation,
    })).toThrow(/requires the exact validated successful model job/);
    expect(inspectFullCandidateGitHubReadiness()).toMatchObject({
      rejection: { code: 'producer-workflow-not-pinned' },
      status: 'rejected',
    });
  });

  it('keeps the authenticated observer outside offline evaluation and every CI workflow', () => {
    expect(packageManifest.scripts['atomistic:inspect-full-registration'])
      .toBe('node scripts/atomistic/inspect-full-candidate-registration.mjs');
    expect(packageManifest.scripts.check).not.toContain('inspect-full-registration');
    expect(packageManifest.scripts.evaluate).not.toContain('inspect-full-registration');
    const offlineSources = [...workflowSources, ...offlineEvaluatorSources].join('\n');
    expect(offlineSources).not.toContain('atomistic:inspect-full-registration');
    expect(offlineSources).not.toContain('inspect-full-candidate-registration.mjs');
  });

  it.each([
    ['actor', (pass) => { pass.actor.id += 1; }],
    ['repository', (pass) => { pass.repository.full_name = 'wrong/repository'; }],
    ['main ancestry', (pass) => { pass.compare.status = 'diverged'; }],
    ['protection', (pass) => { pass.branchProtection.enforce_admins.enabled = false; }],
    ['conversation resolution', (pass) => { pass.branchProtection.required_conversation_resolution.enabled = false; }],
    ['hash algorithm', (pass) => { pass.hashAlgorithm.hash_algorithm = 'sha256'; }],
    ['commit', (pass) => { pass.registrationCommit.parents[0].sha = 'f'.repeat(40); }],
    ['tree', (pass) => { pass.registrationTree.truncated = true; }],
    ['blob', (pass) => { pass.registrationBlob.content = Buffer.from('drift').toString('base64'); }],
    ['workflow ID', (pass) => { pass.workflowById.id += 1; }],
    ['workflow filename', (pass) => { pass.workflowByFilename.state = 'disabled_manually'; }],
    ['Sentinel attempt', (pass) => { pass.runAttempt.run_attempt = 2; }],
    ['Sentinel check', (pass) => { pass.checkRun.conclusion = 'failure'; }],
  ])('fails closed on %s drift', (_label, mutator) => {
    expect(() => validateFullCandidateRegistrationCapture(
      mutateBoth(capture(), mutator),
    )).toThrow(/rejected/);
  });

  it.each([
    ['missing', undefined],
    ['null', null],
    ['string', 'true'],
  ])('rejects %s required conversation-resolution protection', (_label, enabled) => {
    const registrationCapture = capture();
    registrationCapture.passes.forEach((pass) => {
      if (enabled === undefined) delete pass.branchProtection.required_conversation_resolution;
      else pass.branchProtection.required_conversation_resolution.enabled = enabled;
    });
    expect(() => validateFullCandidateRegistrationCapture(registrationCapture)).toThrow(
      /selected classic branch-protection fields differ/,
    );
  });

  it('rejects incomplete, duplicate, unstable and nonzero target histories', () => {
    const missingTerminator = capture();
    missingTerminator.passes.forEach((pass) => { pass.repositoryRuns.pages.pop(); });
    expect(() => validateFullCandidateRegistrationCapture(missingTerminator)).toThrow(/empty terminator/);

    const duplicate = capture();
    duplicate.passes.forEach((pass) => {
      const run = structuredClone(pass.repositoryRuns.pages[0].payload.workflow_runs[0]);
      pass.repositoryRuns = paginated('workflow_runs', [run, run]);
    });
    expect(() => validateFullCandidateRegistrationCapture(duplicate)).toThrow(/duplicate positive item ID/);

    const totalDrift = capture();
    totalDrift.passes.forEach((pass) => { pass.workflows.pages[1].payload.total_count = 2; });
    expect(() => validateFullCandidateRegistrationCapture(totalDrift)).toThrow(/page 2/);

    const nonemptyTerminator = capture();
    nonemptyTerminator.passes.forEach((pass) => {
      pass.repositoryRuns.pages[1].payload.workflow_runs.push(sentinelRun());
    });
    expect(() => validateFullCandidateRegistrationCapture(nonemptyTerminator)).toThrow(/page 2/);

    const overBound = capture();
    overBound.passes.forEach((pass) => {
      pass.repositoryRuns.pages[0].payload.total_count = 1_001;
    });
    expect(() => validateFullCandidateRegistrationCapture(overBound)).toThrow(/auditable bound/);

    const targetSpecific = capture();
    targetSpecific.passes.forEach((pass) => {
      pass.targetRuns = paginated('workflow_runs', [{
        ...sentinelRun(),
        id: 99,
        path: FULL_CANDIDATE_REGISTRATION_WORKFLOW.path,
        workflow_id: FULL_CANDIDATE_REGISTRATION_WORKFLOW.id,
      }]);
    });
    expect(() => validateFullCandidateRegistrationCapture(targetSpecific)).toThrow(/currently API-visible run/);

    const repositoryWide = capture();
    repositoryWide.passes.forEach((pass) => {
      pass.repositoryRuns = paginated('workflow_runs', [sentinelRun(), {
        ...sentinelRun(),
        id: 100,
        path: FULL_CANDIDATE_REGISTRATION_WORKFLOW.path,
        workflow_id: FULL_CANDIDATE_REGISTRATION_WORKFLOW.id,
      }]);
    });
    expect(() => validateFullCandidateRegistrationCapture(repositoryWide)).toThrow(/repository-wide history/);
  });

  it('rejects a race between the two otherwise valid snapshots', () => {
    const registrationCapture = capture();
    registrationCapture.passes[1].repositoryRuns.pages[0].payload.workflow_runs[0].status = 'queued';
    expect(() => validateFullCandidateRegistrationCapture(registrationCapture)).toThrow(/snapshots differ/);
  });

  it('rejects injected claims and keeps every rejection schema-total and redacted', () => {
    const injected = capture();
    injected.claims = { reproduced: true };
    expect(() => validateFullCandidateRegistrationCapture(injected)).toThrow(/fields differ/);

    const secret = 'github_pat_must_not_leak_123456789';
    const rejected = fullCandidateRegistrationRejection(
      new Error(`authorization: Bearer ${secret}`),
      secret,
    );
    expect(rejected.status).toBe('rejected');
    expect(JSON.stringify(rejected)).not.toContain(secret);
    expect(Object.values(rejected.claims).every((value) => value === false)).toBe(true);
    expectSchema(rejected);
  });
});

describe('fixed authenticated GET-only registration inspector', () => {
  it('uses only the fixed GitHub origin and returns the schema-bound observation', async () => {
    const token = 'github_pat_fixture_token_123456789';
    process.env.GITHUB_TOKEN = token;
    process.env.GITHUB_API_URL = 'https://attacker.invalid';
    const fake = fakeGitHubFetch();
    vi.stubGlobal('fetch', fake);

    const result = await inspectFullCandidateRegistration();
    expect(result.status).toBe('verified-registration-only');
    expectSchema(result);
    expect(fake.calls.length).toBeGreaterThan(20);
    for (const call of fake.calls) {
      expect(new URL(call.requestUrl).origin).toBe(FULL_CANDIDATE_REGISTRATION_HTTP_CONTRACT.apiOrigin);
      expect(call.init.method).toBe('GET');
      expect(call.init.body).toBeUndefined();
      expect(call.init.redirect).toBe('error');
      expect(call.init.cache).toBe('no-store');
      expect(call.init.headers.Authorization).toBe(`Bearer ${token}`);
      expect(call.requestUrl).not.toMatch(/artifacts|logs/);
    }
    const hashCalls = fake.calls.filter(({ requestUrl }) => requestUrl.endsWith('/hash-algorithm'));
    expect(hashCalls).toHaveLength(2);
    expect(hashCalls[0].init.headers['X-GitHub-Api-Version']).toBe('2026-03-10');
  });

  it('fails before transport when credentials or caller-supplied inputs are present', async () => {
    delete process.env.GITHUB_TOKEN;
    const fake = vi.fn();
    vi.stubGlobal('fetch', fake);
    const missing = await inspectFullCandidateRegistration();
    expect(missing).toMatchObject({ rejection: { code: 'github-token-unavailable' }, status: 'rejected' });
    expect(fake).not.toHaveBeenCalled();
    expectSchema(missing);

    process.env.GITHUB_TOKEN = 'token-for-test';
    const injected = await inspectFullCandidateRegistration({
      body: 'forbidden',
      method: 'POST',
      url: 'https://attacker.invalid',
    });
    expect(injected).toMatchObject({
      rejection: { code: 'non-self-reporting-input-rejected' },
      status: 'rejected',
    });
    expect(fake).not.toHaveBeenCalled();
    expectSchema(injected);
  });

  it.each([
    ['redirect', ({ requestUrl }) => requestUrl.endsWith('/user') ? { redirected: true, url: 'https://attacker.invalid/' } : {}],
    ['HTTP error', ({ requestUrl }) => requestUrl.endsWith('/user') ? { status: 503 } : {}],
    ['wrong content type', ({ requestUrl }) => requestUrl.endsWith('/user') ? { headers: { 'content-type': 'text/plain' } } : {}],
    ['API version drift', ({ requestUrl }) => requestUrl.endsWith('/user') ? { headers: { 'x-github-api-version-selected': '2099-01-01' } } : {}],
    ['API sunset', ({ requestUrl }) => requestUrl.endsWith('/user') ? { headers: { sunset: 'Thu, 01 Jan 2099 00:00:00 GMT' } } : {}],
    ['UTF-8 BOM', ({ requestUrl }) => requestUrl.endsWith('/user') ? { raw: Buffer.from('\ufeff{}', 'utf8') } : {}],
    ['invalid UTF-8', ({ requestUrl }) => requestUrl.endsWith('/user') ? { raw: Buffer.from([0xff]) } : {}],
    ['duplicate JSON key', ({ requestUrl }) => requestUrl.endsWith('/user') ? { raw: Buffer.from('{"id":1,"id":2}', 'utf8') } : {}],
    ['truncated JSON', ({ requestUrl }) => requestUrl.endsWith('/user') ? { raw: Buffer.from('{"id":', 'utf8') } : {}],
    ['oversized declaration', ({ requestUrl }) => requestUrl.endsWith('/user') ? { headers: { 'content-length': String(FULL_CANDIDATE_REGISTRATION_HTTP_CONTRACT.maxResponseBytes + 1) } } : {}],
    ['oversized stream', ({ requestUrl }) => requestUrl.endsWith('/user') ? {
      chunks: [Buffer.alloc(FULL_CANDIDATE_REGISTRATION_HTTP_CONTRACT.maxResponseBytes + 1)],
      headers: { 'content-length': '' },
      raw: Buffer.from('{}', 'utf8'),
    } : {}],
  ])('returns a redacted schema-valid rejection for %s', async (_label, override) => {
    process.env.GITHUB_TOKEN = 'github_pat_transport_secret_123456789';
    vi.stubGlobal('fetch', fakeGitHubFetch(undefined, override));
    const result = await inspectFullCandidateRegistration();
    expect(result.status).toBe('rejected');
    expect(JSON.stringify(result)).not.toContain(process.env.GITHUB_TOKEN);
    expectSchema(result);
  });

  it('rejects off-origin Link pagination without following it', async () => {
    process.env.GITHUB_TOKEN = 'token-for-link-test';
    const manyRuns = Array.from({ length: 101 }, (_value, index) => ({
      ...sentinelRun(),
      head_sha: index === 0 ? frozen.revision : 'f'.repeat(40),
      id: sentinel.runId + index,
      name: index === 0 ? FULL_CANDIDATE_SENTINEL_WORKFLOW.name : 'Unrelated',
      path: index === 0 ? FULL_CANDIDATE_SENTINEL_WORKFLOW.path : '.github/workflows/unrelated.yml',
      run_number: 93 + index,
      workflow_id: index === 0 ? FULL_CANDIDATE_SENTINEL_WORKFLOW.id : 999_000,
    }));
    const snapshots = [snapshot(), snapshot()];
    snapshots.forEach((pass) => { pass.repositoryRuns = paginated('workflow_runs', manyRuns); });
    const fake = fakeGitHubFetch(snapshots, ({ requestUrl }) => {
      const url = new URL(requestUrl);
      if (url.pathname.endsWith('/actions/runs') && url.searchParams.get('page') === '1') {
        return { headers: { link: '<https://attacker.invalid/steal>; rel="next"' } };
      }
      return {};
    });
    vi.stubGlobal('fetch', fake);
    const result = await inspectFullCandidateRegistration();
    expect(result).toMatchObject({ rejection: { code: 'registration-pagination-invalid' }, status: 'rejected' });
    expect(fake.calls.every(({ requestUrl }) => new URL(requestUrl).hostname === 'api.github.com')).toBe(true);
    expectSchema(result);
  });

  it('rejects transport exceptions without exposing the credential', async () => {
    const secret = 'github_pat_exception_secret_123456789';
    process.env.GITHUB_TOKEN = secret;
    vi.stubGlobal('fetch', fakeGitHubFetch(undefined, ({ requestUrl }) => (
      requestUrl.endsWith('/user') ? { throwValue: new Error(secret) } : {}
    )));
    const result = await inspectFullCandidateRegistration();
    expect(result).toMatchObject({ rejection: { code: 'github-get-failed' }, status: 'rejected' });
    expect(JSON.stringify(result)).not.toContain(secret);
    expectSchema(result);
  });

  it('keeps the response-body timeout active after headers arrive', async () => {
    vi.useFakeTimers();
    const secret = 'github_pat_timeout_secret_123456789';
    process.env.GITHUB_TOKEN = secret;
    const fetch = vi.fn(async (requestUrl, init) => ({
      body: new ReadableStream({
        start(controller) {
          init.signal.addEventListener('abort', () => controller.error(new Error(secret)));
        },
      }),
      headers: new Headers({ 'content-type': 'application/json' }),
      redirected: false,
      status: 200,
      url: requestUrl,
    }));
    vi.stubGlobal('fetch', fetch);
    const pending = inspectFullCandidateRegistration();
    await vi.advanceTimersByTimeAsync(
      FULL_CANDIDATE_REGISTRATION_HTTP_CONTRACT.requestTimeoutMs + 1,
    );
    const result = await pending;
    expect(result).toMatchObject({ rejection: { code: 'github-get-failed' }, status: 'rejected' });
    expect(JSON.stringify(result)).not.toContain(secret);
    expectSchema(result);
  });

  it('rejects CLI arguments without echoing them or contacting GitHub', () => {
    const secret = 'github_pat_cli_secret_123456789';
    const child = spawnSync(process.execPath, [
      fileURLToPath(new URL('./inspect-full-candidate-registration.mjs', import.meta.url)),
      '--github-token',
      secret,
      '--method',
      'POST',
    ], {
      encoding: 'utf8',
      env: { ...process.env, GITHUB_TOKEN: 'unused-token' },
    });
    expect(child.status).toBe(1);
    expect(child.stderr).toBe('');
    expect(child.stdout).not.toContain(secret);
    const result = JSON.parse(child.stdout);
    expect(result).toMatchObject({
      rejection: { code: 'non-self-reporting-input-rejected' },
      status: 'rejected',
    });
    expectSchema(result);
  });

  it('keeps the fixed pagination ceiling finite', () => {
    expect(FULL_CANDIDATE_REGISTRATION_MAX_LIST_ITEMS).toBe(1_000);
  });
});
