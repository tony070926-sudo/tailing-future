import { execFile } from 'node:child_process';
import { chmod, link, lstat, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';

const execFileAsync = promisify(execFile);
const temporaryRoots = [];
const launcherBytes = await readFile(new URL('./evaluate.mjs', import.meta.url));
const publicDimensionIds = [
  'contract', 'data', 'atomistic', 'mesoscale', 'continuum', 'process',
  'coupling', 'world_rollout', 'uq_ood', 'repro_cost', 'visual_truth', 'safety',
];
const publicDimensionWeights = [8, 8, 12, 8, 10, 10, 14, 8, 8, 6, 4, 4];
const publicComparatorIds = [
  'aido-cell-1.0', 'equiformerv3-dens-oam', 'tece-oam-rra-1.0',
  'mattersim-1.0.0-5m', 'mace-mpa-0', 'openmm-8.5.1-tip3p-ions',
  'openmm-8.6.0-tip3p-control', 'pfhub-benchmark-3', 'cantera-3.2-cstr',
  'idaes-2.12',
];
const fakeWorker = `
import { mkdir, readFile, symlink, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root = process.cwd();
const behavior = 'stable';
const control = JSON.parse(await readFile(path.join(root, '.tailing-sentinel-control.json'), 'utf8'));
if (behavior === 'drift') await writeFile(path.join(path.dirname(root), 'README.md'), 'changed\\n');
await mkdir(path.join(root, 'evaluation'), { recursive: true });
if (behavior === 'report-symlink') {
  await writeFile(path.join(root, 'evaluation', 'report-target.json'), '{}\\n');
  await symlink('report-target.json', path.join(root, 'evaluation', 'latest-report.json'));
  await writeFile(path.join(root, 'evaluation', 'latest-report.md'), '# linked\\n');
} else if (behavior === 'malformed') {
  await writeFile(path.join(root, 'evaluation', 'latest-report.json'), '{}\\n');
  await writeFile(path.join(root, 'evaluation', 'latest-report.md'), '# malformed\\n');
} else {
  const report = {
    artifactDigest: control.artifactDigest,
    sourceFileCount: control.sourceFiles.length,
    sourceManifest: control.sourceManifest,
    sourceRevision: process.env.GITHUB_SHA ?? null,
    hardGateFailures: [],
    verdict: 'conditional',
    gaps: [{ severity: 'P1', dimension: 'atomistic', recommendedChange: 'private worker text' }],
  };
  if (behavior === 'public-gap-forgery') report.gaps = [{ severity: 'P1', dimension: '../../../private', recommendedChange: 'private worker text' }];
  await writeFile(path.join(root, 'evaluation', 'latest-report.json'), JSON.stringify(report));
  await writeFile(path.join(root, 'evaluation', 'latest-report.md'), '# report\\n\\n- Verdict: **CONDITIONAL**\\n- Artifact: ' + control.artifactDigest + '\\n');
}
`;

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'tailing-evaluate-launcher-'));
  temporaryRoots.push(root);
  await mkdir(path.join(root, 'scripts'), { recursive: true });
  await mkdir(path.join(root, 'evaluation', 'baselines'), { recursive: true });
  await writeFile(path.join(root, 'scripts', 'evaluate.mjs'), launcherBytes);
  await writeFile(path.join(root, 'scripts', 'evaluate-worker.mjs'), fakeWorker);
  await writeFile(path.join(root, 'evaluation', 'input.json'), '{}\n');
  await writeFile(
    path.join(root, 'evaluation', 'current-scorecard.json'),
    `${JSON.stringify(scorecardFixture(), null, 2)}\n`,
  );
  await writeFile(
    path.join(root, 'evaluation', 'baselines', 'registry.json'),
    `${JSON.stringify(registryFixture(), null, 2)}\n`,
  );
  await writeFile(path.join(root, 'README.md'), 'original\n');
  await execFileAsync('git', ['init', '--quiet'], { cwd: root });
  return root;
}

async function runLauncher(root, { behavior = 'stable', environment = {} } = {}) {
  if (behavior !== 'stable') {
    const workerPath = path.join(root, 'scripts', 'evaluate-worker.mjs');
    const source = await readFile(workerPath, 'utf8');
    await writeFile(workerPath, source.replace("const behavior = 'stable';", `const behavior = '${behavior}';`));
  }
  const childEnvironment = { ...process.env };
  delete childEnvironment.GITHUB_SHA;
  Object.assign(childEnvironment, environment);
  try {
    const output = await execFileAsync(process.execPath, ['scripts/evaluate.mjs'], {
      cwd: root,
      env: childEnvironment,
    });
    return { ...output, code: 0 };
  } catch (error) {
    return { code: error.code, stderr: error.stderr, stdout: error.stdout };
  }
}

describe('two-stage evaluator launcher', () => {
  it('keeps the evaluator worker timeout explicit and bounded', () => {
    const source = launcherBytes.toString('utf8');
    expect(source).toContain('const EVALUATOR_WORKER_TIMEOUT_MS = 18 * 60 * 1000;');
    expect(source).toContain('timeout: EVALUATOR_WORKER_TIMEOUT_MS,');
  });

  it('publishes only a worker report bound to the exact frozen source', async () => {
    const root = await fixture();
    const result = await runLauncher(root);
    const report = JSON.parse(await readFile(path.join(root, 'evaluation', 'latest-report.json'), 'utf8'));
    const publicSummary = JSON.parse(await readFile(path.join(root, 'evaluation', 'public-summary.json'), 'utf8'));
    const publicProduct = JSON.parse(await readFile(
      path.join(root, 'evaluation', 'public-product-evaluation.json'),
      'utf8',
    ));

    expect(result.code).toBe(0);
    expect(report.sourceFileCount).toBe(Object.keys(report.sourceManifest).length);
    expect(report.sourceManifest['scripts/evaluate.mjs']).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(report.sourceManifest['scripts/evaluate-worker.mjs']).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(report.artifactDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(report.sourceManifest['evaluation/public-summary.json']).toBeUndefined();
    expect(report.sourceManifest['evaluation/public-product-evaluation.json']).toBeUndefined();
    expect(publicSummary).toEqual({
      artifactDigest: report.artifactDigest,
      verdict: report.verdict,
      gaps: [{ severity: 'P1', dimension: 'atomistic' }],
    });
    expect(JSON.stringify(publicSummary)).not.toContain('private worker text');
    expect(Object.keys(publicProduct)).toEqual([
      'schemaVersion', 'sourceArtifactDigest', 'scorecard', 'comparators',
    ]);
    expect(publicProduct.sourceArtifactDigest).toBe(report.artifactDigest);
    expect(Object.keys(publicProduct.scorecard)).toEqual(['candidateVersion', 'dimensions']);
    expect(publicProduct.scorecard.dimensions).toHaveLength(12);
    expect(Object.keys(publicProduct.scorecard.dimensions[0])).toEqual([
      'id', 'displayLabel', 'weight', 'score', 'summary',
    ]);
    expect(Object.keys(publicProduct.comparators)).toEqual(['snapshotDate', 'items']);
    expect(publicProduct.comparators.items).toHaveLength(10);
    expect(Object.keys(publicProduct.comparators.items[0])).toEqual([
      'id', 'name', 'scope', 'evidenceClass',
    ]);
    for (const forbidden of [
      'private scorecard evidence',
      'private/evidence/path',
      'private next action',
      'private acceptance test',
      'https://private.invalid/source',
      'private comparator reason',
      'checkpointDigest',
      'claimOwner',
    ]) expect(JSON.stringify(publicProduct)).not.toContain(forbidden);
  });

  it('rejects a report gap that cannot enter the allowlisted public projection', async () => {
    const root = await fixture();
    const result = await runLauncher(root, { behavior: 'public-gap-forgery' });

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/invalid public gap identifier/);
    await expect(lstat(path.join(root, 'evaluation', 'latest-report.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(path.join(root, 'evaluation', 'public-summary.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(path.join(root, 'evaluation', 'public-product-evaluation.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects scorecard values outside the strict public product allowlist', async () => {
    const root = await fixture();
    const scorecardPath = path.join(root, 'evaluation', 'current-scorecard.json');
    const scorecard = JSON.parse(await readFile(scorecardPath, 'utf8'));
    scorecard.dimensions[0].score = 5;
    await writeFile(scorecardPath, `${JSON.stringify(scorecard, null, 2)}\n`);

    const result = await runLauncher(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/scorecard dimension cannot enter the public product projection/);
    await expect(lstat(path.join(root, 'evaluation', 'latest-report.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(path.join(root, 'evaluation', 'public-summary.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(path.join(root, 'evaluation', 'public-product-evaluation.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects active-tree drift and does not publish the frozen success report', async () => {
    const root = await fixture();
    const result = await runLauncher(root, { behavior: 'drift' });

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/changed=\[README\.md\]/);
    await expect(lstat(path.join(root, 'evaluation', 'latest-report.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects a malformed worker report without publishing it', async () => {
    const root = await fixture();
    const result = await runLauncher(root, { behavior: 'malformed' });

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/not bound to the frozen source snapshot/);
    await expect(lstat(path.join(root, 'evaluation', 'latest-report.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('clears stale outputs and rejects linked worker report output', async () => {
    const root = await fixture();
    await writeFile(path.join(root, 'evaluation', 'latest-report.json'), '{"stale":true}\n');
    await writeFile(path.join(root, 'evaluation', 'latest-report.md'), '# stale\n');
    await writeFile(path.join(root, 'evaluation', 'public-summary.json'), '{"stale":true}\n');
    await writeFile(path.join(root, 'evaluation', 'public-product-evaluation.json'), '{"stale":true}\n');
    const result = await runLauncher(root, { behavior: 'report-symlink' });

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/missing, unsafe or outside its size limit/);
    await expect(lstat(path.join(root, 'evaluation', 'latest-report.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(path.join(root, 'evaluation', 'latest-report.md'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(path.join(root, 'evaluation', 'public-summary.json'))).rejects.toMatchObject({ code: 'ENOENT' });
    await expect(lstat(path.join(root, 'evaluation', 'public-product-evaluation.json'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects symlink and hard-link source entries before spawning a worker', async () => {
    const symlinkRoot = await fixture();
    await rm(path.join(symlinkRoot, 'README.md'));
    await symlink('evaluation/input.json', path.join(symlinkRoot, 'README.md'));
    const symlinkResult = await runLauncher(symlinkRoot);
    expect(symlinkResult.code).toBe(1);
    expect(symlinkResult.stderr).toMatch(/regular non-symlink/);

    const hardLinkRoot = await fixture();
    await link(path.join(hardLinkRoot, 'README.md'), path.join(hardLinkRoot, 'LICENSE'));
    const hardLinkResult = await runLauncher(hardLinkRoot);
    expect(hardLinkResult.code).toBe(1);
    expect(hardLinkResult.stderr).toMatch(/regular non-symlink/);
  });

  it('rejects malformed or platform-ambiguous raw Git paths instead of omitting them', async () => {
    const root = await fixture();
    await mkdir(path.join(root, 'app'));
    await writeFile(path.join(root, 'app', 'bad\npage.tsx'), 'export {};\n');
    const controlCharacter = await runLauncher(root);
    expect(controlCharacter.code).toBe(1);
    expect(controlCharacter.stderr).toMatch(/platform-ambiguous path/);

    await rm(path.join(root, 'app'), { force: true, recursive: true });
    await mkdir(path.join(root, 'app'));
    await writeFile(path.join(root, 'app', 'bad\\page.tsx'), 'export {};\n');
    const backslash = await runLauncher(root);
    expect(backslash.code).toBe(1);
    expect(backslash.stderr).toMatch(/platform-ambiguous path/);

    await rm(path.join(root, 'app'), { force: true, recursive: true });
    await mkdir(path.join(root, 'adjacent'));
    await writeFile(path.join(root, 'adjacent', 'bad\nfile'), 'not project source\n');
    const outOfScopeControlCharacter = await runLauncher(root);
    expect(outOfScopeControlCharacter.code).toBe(1);
    expect(outOfScopeControlCharacter.stderr).toMatch(/platform-ambiguous path/);
  });

  it('ignores Git directory markers for adjacent untracked repositories outside the source scope', async () => {
    const root = await fixture();
    const adjacentRoot = path.join(root, 'tailing-future-health');
    await mkdir(adjacentRoot);
    await writeFile(path.join(adjacentRoot, 'README.md'), 'adjacent project\n');
    await execFileAsync('git', ['init', '--quiet'], { cwd: adjacentRoot });

    const result = await runLauncher(root);
    const report = JSON.parse(await readFile(path.join(root, 'evaluation', 'latest-report.json'), 'utf8'));

    expect(result.code).toBe(0);
    expect(Object.keys(report.sourceManifest).some((relativePath) => relativePath.startsWith('tailing-future-health/'))).toBe(false);
  });

  it('rejects an unexpanded nested repository inside a declared source root', async () => {
    const root = await fixture();
    const nestedRoot = path.join(root, 'app', 'plugin');
    await mkdir(nestedRoot, { recursive: true });
    await writeFile(path.join(nestedRoot, 'page.tsx'), 'export default null;\n');
    await execFileAsync('git', ['init', '--quiet'], { cwd: nestedRoot });

    const result = await runLauncher(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/platform-ambiguous path/);
  });

  it('rejects ordinary files outside the declared source roots', async () => {
    const root = await fixture();
    await mkdir(path.join(root, 'components'));
    await writeFile(path.join(root, 'components', 'card.tsx'), 'export default null;\n');

    const result = await runLauncher(root);

    expect(result.code).toBe(1);
    expect(result.stderr).toMatch(/outside the declared project source roots/);
  });

  it('binds CI source paths, bytes and modes to the declared GitHub commit', async () => {
    const root = await fixture();
    await writeFile(path.join(root, '.gitattributes'), 'README.md text eol=lf\n');
    await execFileAsync('git', ['add', '--all'], { cwd: root });
    await execFileAsync('git', ['-c', 'user.name=Tailing Test', '-c', 'user.email=tailing@example.invalid', 'commit', '--quiet', '-m', 'fixture'], { cwd: root });
    const { stdout } = await execFileAsync('git', ['rev-parse', 'HEAD'], { cwd: root });
    const revision = stdout.trim();

    expect((await runLauncher(root, { environment: { GITHUB_SHA: revision } })).code).toBe(0);
    await writeFile(path.join(root, 'README.md'), 'original\r\n');
    const changed = await runLauncher(root, { environment: { GITHUB_SHA: revision } });
    expect(changed.code).toBe(1);
    expect(changed.stderr).toMatch(/raw source blob or executable mode is not bound/);

    await writeFile(path.join(root, 'README.md'), 'original\n');
    await chmod(path.join(root, 'README.md'), 0o755);
    const modeChanged = await runLauncher(root, { environment: { GITHUB_SHA: revision } });
    expect(modeChanged.code).toBe(1);
    expect(modeChanged.stderr).toMatch(/raw source blob or executable mode is not bound/);

    await chmod(path.join(root, 'README.md'), 0o644);
    await writeFile(path.join(root, 'scripts', 'untracked.mjs'), 'export {};\n');
    const added = await runLauncher(root, { environment: { GITHUB_SHA: revision } });
    expect(added.code).toBe(1);
    expect(added.stderr).toMatch(/source path set is not bound/);
  });
});

function scorecardFixture() {
  return {
    schemaVersion: 'tf.scorecard/test',
    candidateVersion: 'test-candidate-1',
    baselineSnapshotDate: '2026-08-29',
    hardGateFailures: [],
    dimensions: publicDimensionIds.map((id, index) => ({
      id,
      label: `private label ${id}`,
      displayLabel: `Public ${id}`,
      weight: publicDimensionWeights[index],
      score: index % 5,
      promotionFloor: 0,
      summary: `Public summary ${id}`,
      evidence: ['private scorecard evidence'],
      evidenceArtifacts: ['private/evidence/path'],
      nextAction: 'private next action',
      acceptanceTest: 'private acceptance test',
    })),
  };
}

function registryFixture() {
  return {
    schemaVersion: 'tf.comparators/test',
    snapshotDate: '2026-08-29',
    policy: 'private registry policy',
    comparators: publicComparatorIds.map((id, index) => ({
      id,
      name: `Public comparator ${index + 1}`,
      scope: `Public scope ${index + 1}`,
      source: 'https://private.invalid/source',
      revision: 'private revision',
      evidenceClass: index === 0 ? 'claim' : index < 5 ? 'auditable' : 'reference',
      claimOwner: 'private owner',
      comparable: false,
      checkpointDigest: `sha256:${String(index + 1).repeat(64).slice(0, 64)}`,
      reason: 'private comparator reason',
    })),
  };
}
