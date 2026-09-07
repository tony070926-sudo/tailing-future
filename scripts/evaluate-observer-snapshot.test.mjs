import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  appendFile,
  chmod,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { load as loadYaml } from 'js-yaml';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const publishedReportPaths = [
  'evaluation/latest-report.json',
  'evaluation/latest-report.md',
  'evaluation/public-summary.json',
  'evaluation/public-product-evaluation.json',
];
const mutations = [
  {
    path: 'evaluation/atomistic/full-candidate-observer-contract-vnext.json',
    hardGate: 'observer.contract.rawDigest: exact reviewed bytes differ',
    syntax: 'json',
  },
  {
    path: 'evaluation/atomistic/full-candidate-observer-vnext.workflow.yml',
    hardGate: 'observer.workflow.rawDigest: exact reviewed bytes differ',
    syntax: 'yaml',
  },
  {
    path: 'schemas/atomistic-full-candidate-observer-contract.schema.json',
    hardGate: 'observer.contract.schema.rawDigest: exact reviewed bytes differ',
    syntax: 'json',
  },
  {
    path: 'schemas/atomistic-full-candidate-host-observation.schema.json',
    hardGate: 'observer.receipt.schema.rawDigest: exact reviewed bytes differ',
    syntax: 'json',
  },
  {
    path: 'evaluation/atomistic/full-candidate-determinism-roots-v0.1.json',
    hardGate: 'observer.determinismRoots.rawDigest: exact reviewed bytes differ',
    syntax: 'json',
  },
  {
    path: 'schemas/atomistic-full-candidate-determinism-roots.schema.json',
    hardGate: 'observer.determinismRoots.schema.rawDigest: exact reviewed bytes differ',
    syntax: 'json',
  },
  {
    path: 'evaluation/atomistic/random-tp-rights-disposition-v0.1.json',
    hardGate: 'rights-disposition.rawDigest: exact reviewed bytes differ',
    syntax: 'json',
  },
];
const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
    force: true,
    recursive: true,
  })));
});

describe('observer source snapshot evaluator binding', () => {
  it('rejects the seven enumerated pre-capture reviewed-source mutations without score promotion', async () => {
    const scorecard = JSON.parse(await readFile(
      path.join(repositoryRoot, 'evaluation/current-scorecard.json'),
      'utf8',
    ));
    const originalPublishedReports = new Map(await Promise.all(
      publishedReportPaths.map(async (relativePath) => [
        relativePath,
        await readFile(path.join(repositoryRoot, relativePath)),
      ]),
    ));

    const baselineRoot = await copyCandidateRepository();
    const baseline = await runEvaluator(baselineRoot);

    expect(baseline.code).toBe(0);
    expect(baseline.report.verdict).toBe('conditional');
    expect(baseline.report.hardGateFailures).toEqual([]);
    expect(baseline.report.weightedScore).toBe(41);
    expect(baseline.report.dimensions).toEqual(scorecard.dimensions);
    expect(baseline.publicProduct.scorecard.dimensions).toEqual(
      publicDimensions(scorecard.dimensions),
    );

    const mutationRoot = await copyCandidateRepository();
    const mutationDigests = new Map();
    for (const mutation of mutations) {
      const target = path.join(mutationRoot, mutation.path);
      const before = await readFile(target);

      await appendFile(target, Buffer.from(' ', 'utf8'));

      const after = await readFile(target);
      expect(after.byteLength).toBe(before.byteLength + 1);
      expect(after.subarray(0, before.byteLength)).toEqual(before);
      expect(after.at(-1)).toBe(0x20);
      if (mutation.syntax === 'json') {
        expect(JSON.parse(after.toString('utf8'))).toEqual(JSON.parse(before.toString('utf8')));
      } else {
        expect(loadYaml(after.toString('utf8'))).toEqual(loadYaml(before.toString('utf8')));
      }
      expect(baseline.report.sourceManifest[mutation.path]).toBe(sha256(before));
      mutationDigests.set(mutation.path, sha256(after));

    }

    const mutationResult = await runEvaluator(mutationRoot);
    const workflowPath = mutations.find(({ syntax }) => syntax === 'yaml').path;
    const expectedMutationGates = [
      ...mutations.map(({ hardGate }) => hardGate),
      'authority-request.binding.rights-disposition.rawDigest: exact reviewed bytes differ',
      'Atomistic reproduction/candidate plan validation failed: dependent observer contract validation failed.',
      'rights-disposition.localEvidence.observerContract.rawDigest: exact bound bytes differ',
      `observer.receipt.workflowObservation.sourceDigest: expected "${baseline.report.sourceManifest[workflowPath]}"; received "${mutationDigests.get(workflowPath)}"`,
      'observer.workflow.sizeBytes: exact reviewed byte length differs',
    ];

    expect(mutationResult.code).toBe(1);
    expect(mutationResult.report.verdict).toBe('reject');
    expect([...mutationResult.report.hardGateFailures].sort())
      .toEqual([...expectedMutationGates].sort());
    expect(mutationResult.report.hardGateFailures.filter((failure) => (
      /^(?:observer\.contract(?:\.schema)?|observer\.workflow|observer\.receipt\.schema|observer\.determinismRoots(?:\.schema)?)\.rawDigest:/.test(
        failure,
      )
    )).sort()).toEqual(mutations
      .filter(({ hardGate }) => hardGate.startsWith('observer.'))
      .map(({ hardGate }) => hardGate)
      .sort());

    for (const mutation of mutations) {
      expect(mutationResult.report.sourceManifest[mutation.path])
        .toBe(mutationDigests.get(mutation.path));
    }
    expect(changedManifestPaths(
      baseline.report.sourceManifest,
      mutationResult.report.sourceManifest,
    )).toEqual(mutations.map(({ path: relativePath }) => relativePath).sort());
    expect(mutationResult.report.artifactDigest).not.toBe(baseline.report.artifactDigest);
    expect(mutationResult.publicProduct.sourceArtifactDigest)
      .toBe(mutationResult.report.artifactDigest);
    expect(mutationResult.report.weightedScore).toBe(baseline.report.weightedScore);
    expect(mutationResult.report.weightedScore).toBe(41);
    expect(mutationResult.report.dimensions).toEqual(baseline.report.dimensions);
    expect(mutationResult.report.dimensions).toEqual(scorecard.dimensions);
    expect(mutationResult.publicProduct.scorecard.dimensions).toEqual(
      baseline.publicProduct.scorecard.dimensions,
    );

    const rightsMutation = mutations.find(({ hardGate }) => (
      hardGate.startsWith('rights-disposition.')
    ));
    const rightsMutationRoot = await copyCandidateRepository();
    const rightsTarget = path.join(rightsMutationRoot, rightsMutation.path);
    const rightsBefore = await readFile(rightsTarget);
    await appendFile(rightsTarget, Buffer.from(' ', 'utf8'));
    const rightsAfter = await readFile(rightsTarget);
    expect(JSON.parse(rightsAfter.toString('utf8'))).toEqual(
      JSON.parse(rightsBefore.toString('utf8')),
    );
    const rightsMutationResult = await runEvaluator(rightsMutationRoot);
    expect(rightsMutationResult.code).toBe(1);
    expect(rightsMutationResult.report.verdict).toBe('reject');
    expect(rightsMutationResult.report.hardGateFailures).toEqual([
      rightsMutation.hardGate,
      'authority-request.binding.rights-disposition.rawDigest: exact reviewed bytes differ',
      'Atomistic reproduction/candidate plan validation failed: dependent Random-TP rights disposition validation failed.',
    ]);
    expect(rightsMutationResult.report.weightedScore).toBe(41);
    expect(changedManifestPaths(
      baseline.report.sourceManifest,
      rightsMutationResult.report.sourceManifest,
    )).toEqual([rightsMutation.path]);

    for (const [relativePath, originalBytes] of originalPublishedReports) {
      expect(await readFile(path.join(repositoryRoot, relativePath))).toEqual(originalBytes);
    }
  }, 45 * 60 * 1000);

  it('rejects a request-only authorization injection without score promotion', async () => {
    const requestPath =
      'evaluation/atomistic/random-tp-private-execution-authority-request-v0.1.json';
    const baselineRoot = await copyCandidateRepository();
    const baseline = await runEvaluator(baselineRoot);
    expect(baseline.code).toBe(0);
    expect(baseline.report.verdict).toBe('conditional');
    expect(baseline.report.weightedScore).toBe(41);
    expect(baseline.report.hardGateFailures).toEqual([]);

    const mutationRoot = await copyCandidateRepository();
    const target = path.join(mutationRoot, requestPath);
    const candidate = JSON.parse(await readFile(target, 'utf8'));
    candidate.authorizationState.authorizationRecord = {
      principalId: 'self-authored-forgery',
      signature: 'not-verified',
    };
    candidate.effects.privateModelExecutionAuthorized = true;
    candidate.requestSemantics.requestMayDispatchWorkflow = true;
    await writeFile(target, `${JSON.stringify(candidate, null, 2)}\n`, { mode: 0o644 });

    const mutation = await runEvaluator(mutationRoot);
    expect(mutation.code).toBe(1);
    expect(mutation.report.verdict).toBe('reject');
    expect(mutation.report.weightedScore).toBe(41);
    expect(mutation.report.dimensions).toEqual(baseline.report.dimensions);
    expect(mutation.publicProduct.scorecard.dimensions)
      .toEqual(baseline.publicProduct.scorecard.dimensions);
    const schemaFailures = mutation.report.hardGateFailures.filter((failure) => (
      failure.startsWith('authority-request.schema: ')
    ));
    expect(schemaFailures).toHaveLength(1);
    const expectedAuthorizationMutationGates = [
      'authority-request.rawDigest: exact reviewed bytes differ',
      'authority-request.semanticDigest: exact reviewed semantics differ',
      'authority-request.semantic: exact frozen v0.1 contract digest mismatch',
      'authority-request.requestSemantics: exact contract mismatch',
      'authority-request.authorizationState: exact contract mismatch',
      'authority-request.effects: every value must remain false',
      schemaFailures[0],
      'Atomistic reproduction/candidate plan validation failed: dependent Random-TP authority request validation failed.',
    ];
    expect([...mutation.report.hardGateFailures].sort())
      .toEqual([...expectedAuthorizationMutationGates].sort());
    expect(mutation.publicSummary).toEqual({
      artifactDigest: mutation.report.artifactDigest,
      verdict: 'reject',
      gaps: mutation.report.gaps.map(({ severity, dimension }) => ({ severity, dimension })),
    });
    expect(changedManifestPaths(
      baseline.report.sourceManifest,
      mutation.report.sourceManifest,
    )).toEqual([requestPath]);

    const modeMutationRoot = await copyCandidateRepository();
    await chmod(path.join(modeMutationRoot, requestPath), 0o755);
    const modeMutation = await runEvaluator(modeMutationRoot);
    expect(modeMutation.code).toBe(1);
    expect(modeMutation.report.verdict).toBe('reject');
    expect(modeMutation.report.weightedScore).toBe(41);
    expect(modeMutation.report.dimensions).toEqual(baseline.report.dimensions);
    expect(modeMutation.publicProduct.scorecard.dimensions)
      .toEqual(baseline.publicProduct.scorecard.dimensions);
    expect(modeMutation.report.hardGateFailures).toEqual([
      `authority-request.sourceMode.${requestPath}: exact mode 0644 required; received 0755`,
      'Atomistic reproduction/candidate plan validation failed: dependent Random-TP authority-request source mode validation failed.',
    ]);
    expect(changedManifestPaths(
      baseline.report.sourceManifest,
      modeMutation.report.sourceManifest,
    )).toEqual([]);
    expect(modeMutation.report.artifactDigest).not.toBe(baseline.report.artifactDigest);
    expect(modeMutation.publicSummary).toEqual({
      artifactDigest: modeMutation.report.artifactDigest,
      verdict: 'reject',
      gaps: modeMutation.report.gaps.map(({ severity, dimension }) => ({ severity, dimension })),
    });
  }, 45 * 60 * 1000);
});

async function copyCandidateRepository() {
  const root = await mkdtemp(path.join(tmpdir(), 'tailing-observer-snapshot-e2e-'));
  temporaryRoots.push(root);
  const canonicalRepositoryRoot = await realpath(repositoryRoot);
  const { stdout } = await execFileAsync('/usr/bin/git', [
    '-c',
    'core.excludesFile=/dev/null',
    'ls-files',
    '--cached',
    '--others',
    '--exclude-standard',
    '-z',
  ], {
    cwd: repositoryRoot,
    encoding: 'buffer',
    maxBuffer: 16 * 1024 * 1024,
  });
  const sourcePaths = stdout.toString('utf8').split('\0').filter(Boolean);
  if (sourcePaths.length === 0 || new Set(sourcePaths).size !== sourcePaths.length) {
    throw new Error('Candidate source inventory is empty or contains duplicate paths.');
  }

  for (const relativePath of sourcePaths) {
    const source = path.join(repositoryRoot, relativePath);
    const destination = path.join(root, relativePath);
    const metadata = await lstat(source);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) {
      throw new Error(`Candidate source is not one regular file: ${relativePath}.`);
    }
    const expectedSource = path.join(canonicalRepositoryRoot, ...relativePath.split('/'));
    if (await realpath(source) !== expectedSource) {
      throw new Error(`Candidate source resolves outside its reviewed path: ${relativePath}.`);
    }
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(source, destination);
    await chmod(destination, metadata.mode & 0o777);
  }

  await execFileAsync('/usr/bin/git', ['init', '--quiet'], { cwd: root });
  await symlink(
    await realpath(path.join(repositoryRoot, 'node_modules')),
    path.join(root, 'node_modules'),
    'dir',
  );
  return root;
}

async function runEvaluator(root) {
  const environment = { ...process.env };
  for (const name of [
    'GITHUB_SHA',
    'TAILING_INSTALL_STATUS',
    'TAILING_LINT_STATUS',
    'TAILING_TYPECHECK_STATUS',
    'TAILING_TEST_STATUS',
    'TAILING_ATOMISTIC_MANIFEST_STATUS',
    'TAILING_BUILD_STATUS',
    'TAILING_AUDIT_STATUS',
  ]) delete environment[name];

  let code = 0;
  let diagnostic = '';
  try {
    await execFileAsync(process.execPath, ['scripts/evaluate.mjs'], {
      cwd: root,
      env: environment,
      maxBuffer: 16 * 1024 * 1024,
      timeout: 20 * 60 * 1000,
    });
  } catch (error) {
    if (error.killed || error.signal || !Number.isInteger(error.code)) throw error;
    code = error.code;
    diagnostic = `${error.stdout ?? ''}\n${error.stderr ?? ''}`.trim().slice(-4000);
  }

  try {
    return {
      code,
      report: JSON.parse(await readFile(path.join(root, 'evaluation/latest-report.json'), 'utf8')),
      publicProduct: JSON.parse(await readFile(
        path.join(root, 'evaluation/public-product-evaluation.json'),
        'utf8',
      )),
      publicSummary: JSON.parse(await readFile(
        path.join(root, 'evaluation/public-summary.json'),
        'utf8',
      )),
    };
  } catch (error) {
    throw new Error(
      `Evaluator exited ${code} without complete reports.${diagnostic ? `\n${diagnostic}` : ''}`,
      { cause: error },
    );
  }
}

function changedManifestPaths(baseline, candidate) {
  expect(Object.keys(candidate)).toEqual(Object.keys(baseline));
  return Object.keys(baseline).filter((relativePath) => (
    baseline[relativePath] !== candidate[relativePath]
  ));
}

function publicDimensions(dimensions) {
  return dimensions.map(({ id, displayLabel, weight, score, summary }) => ({
    id,
    displayLabel,
    weight,
    score,
    summary,
  }));
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
