import { execFile } from 'node:child_process';
import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { afterEach, describe, expect, it } from 'vitest';
import { FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH } from '../workflow-policy.mjs';
import { validateFullCandidateRegistrationWorkflowRepository } from './full-candidate-registration-source-policy.mjs';

const execFileAsync = promisify(execFile);
const temporaryRoots = [];
const TEST_GIT_ENVIRONMENT = Object.freeze({
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_LITERAL_PATHSPECS: '1',
  GIT_NO_LAZY_FETCH: '1',
  GIT_NO_REPLACE_OBJECTS: '1',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_TERMINAL_PROMPT: '0',
  LANG: 'C',
  LC_ALL: 'C',
  PATH: '/usr/bin:/bin',
});
const workflowBytes = await readFile(
  new URL('../../.github/workflows/atomistic-full-candidate.yml', import.meta.url),
);
const validatorPath = fileURLToPath(new URL('../validate-atomistic-plan.mjs', import.meta.url));

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map(
    (root) => rm(root, { force: true, recursive: true }),
  ));
});

async function fixture({ stage = true } = {}) {
  const createdRoot = await mkdtemp(path.join(tmpdir(), 'tailing-full-candidate-registration-'));
  const root = await realpath(createdRoot);
  temporaryRoots.push(root);
  const workflowPath = path.join(root, FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH);
  await mkdir(path.dirname(workflowPath), { recursive: true });
  await writeFile(workflowPath, workflowBytes, { mode: 0o644 });
  await runFixtureGit(root, ['init', '--quiet']);
  if (stage) {
    await runFixtureGit(
      root,
      ['add', '--', FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH],
    );
  }
  return { root, workflowPath };
}

async function validationFailures(root, options) {
  return (await validateFullCandidateRegistrationWorkflowRepository(root, options)).failures;
}

async function runRegistrationCli(root) {
  try {
    const result = await execFileAsync(
      process.execPath,
      [validatorPath, '--registration-workflow-only'],
      { cwd: root, env: TEST_GIT_ENVIRONMENT },
    );
    return { code: 0, ...result };
  } catch (error) {
    return { code: error.code, stderr: error.stderr, stdout: error.stdout };
  }
}

describe('full-candidate registration workflow repository identity', () => {
  it('binds exact regular bytes to one stage-0 index blob and staged tree', async () => {
    const { root } = await fixture();
    const result = await validateFullCandidateRegistrationWorkflowRepository(root);

    expect(result.failures).toEqual([]);
    expect(result.source).toBe(workflowBytes.toString('utf8'));
    expect(result.gitBlobOid).toMatch(/^[0-9a-f]{40}$/);
    expect(result.stagedTreeOid).toMatch(/^[0-9a-f]{40}$/);
    const cli = await runRegistrationCli(root);
    expect(cli.code).toBe(0);
    expect(cli.stdout).toMatch(/VALID.*REGISTRATION ONLY — NO PRODUCER EXECUTION/);
  });

  it('rejects target, ancestor, hard-link and filesystem-mode substitutions', async () => {
    const targetLink = await fixture();
    const targetPath = path.join(targetLink.root, 'same-workflow.yml');
    await writeFile(targetPath, workflowBytes, { mode: 0o644 });
    await unlink(targetLink.workflowPath);
    await symlink('../../same-workflow.yml', targetLink.workflowPath);
    expect((await validationFailures(targetLink.root)).join('\n')).toMatch(/regular non-symlink/);

    const ancestorLink = await fixture();
    const realDirectory = path.join(ancestorLink.root, 'real-workflows');
    await mkdir(realDirectory);
    await writeFile(
      path.join(realDirectory, 'atomistic-full-candidate.yml'),
      workflowBytes,
      { mode: 0o644 },
    );
    await rm(path.join(ancestorLink.root, '.github', 'workflows'), { recursive: true });
    await symlink('../real-workflows', path.join(ancestorLink.root, '.github', 'workflows'));
    expect((await validationFailures(ancestorLink.root)).join('\n')).toMatch(/real directory|symbolic-link/);

    const hardLink = await fixture();
    await link(hardLink.workflowPath, path.join(hardLink.root, 'second-link.yml'));
    expect((await validationFailures(hardLink.root)).join('\n')).toMatch(/single-link/);

    const wrongMode = await fixture();
    await chmod(wrongMode.workflowPath, 0o600);
    expect((await validationFailures(wrongMode.root)).join('\n')).toMatch(/exactly 0644/);
  });

  it('rejects untracked, byte-mismatched, symlink-mode and executable index entries', async () => {
    const untracked = await fixture({ stage: false });
    expect((await validationFailures(untracked.root)).join('\n')).toMatch(/Git index/);

    const byteMismatch = await fixture({ stage: false });
    await writeFile(byteMismatch.workflowPath, Buffer.concat([workflowBytes, Buffer.from('# staged\n')]));
    await runFixtureGit(
      byteMismatch.root,
      ['add', '--', FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH],
    );
    await writeFile(byteMismatch.workflowPath, workflowBytes, { mode: 0o644 });
    expect((await validationFailures(byteMismatch.root)).join('\n')).toMatch(/index blob bytes differ/);

    const symlinkMode = await fixture({ stage: false });
    const symlinkTarget = path.join(symlinkMode.root, 'same-workflow.yml');
    await writeFile(symlinkTarget, workflowBytes, { mode: 0o644 });
    await unlink(symlinkMode.workflowPath);
    await symlink('../../same-workflow.yml', symlinkMode.workflowPath);
    await runFixtureGit(
      symlinkMode.root,
      ['add', '--', FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH],
    );
    await unlink(symlinkMode.workflowPath);
    await writeFile(symlinkMode.workflowPath, workflowBytes, { mode: 0o644 });
    expect((await validationFailures(symlinkMode.root)).join('\n')).toMatch(/stage-0 mode-100644/);

    const executableIndex = await fixture({ stage: false });
    await chmod(executableIndex.workflowPath, 0o755);
    await runFixtureGit(
      executableIndex.root,
      ['add', '--', FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH],
    );
    await chmod(executableIndex.workflowPath, 0o644);
    expect((await validationFailures(executableIndex.root)).join('\n')).toMatch(/stage-0 mode-100644/);
  });

  it('rejects a staged UTF-8 BOM before any source decoding in both API and CLI paths', async () => {
    const withBom = await fixture({ stage: false });
    await writeFile(
      withBom.workflowPath,
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), workflowBytes]),
      { mode: 0o644 },
    );
    await runFixtureGit(
      withBom.root,
      ['add', '--', FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH],
    );

    expect((await validationFailures(withBom.root)).join('\n')).toMatch(/exactly 520 bytes/);
    const cli = await runRegistrationCli(withBom.root);
    expect(cli.code).toBe(1);
    expect(cli.stderr).toMatch(/exactly 520 bytes/);
    expect(cli.stdout).not.toMatch(/VALID/);
  });

  it('rejects a live Git index mutation between its first and final entry reads', async () => {
    const changedIndex = await fixture();
    const alternatePath = path.join(changedIndex.root, 'alternate-workflow.yml');
    const alternateBytes = Buffer.from(workflowBytes);
    alternateBytes[0] = alternateBytes[0] === 0x6e ? 0x4e : 0x6e;
    await writeFile(alternatePath, alternateBytes, { mode: 0o644 });
    const { stdout } = await runFixtureGit(
      changedIndex.root,
      ['hash-object', '-w', '--', 'alternate-workflow.yml'],
    );
    const alternateBlobOid = stdout.trim();

    const failures = await validationFailures(changedIndex.root, {
      beforeFinalIndexReadForTest: async () => runFixtureGit(
        changedIndex.root,
        [
          'update-index', '--add', '--cacheinfo',
          '100644', alternateBlobOid, FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH,
        ],
      ),
    });
    expect(failures.join('\n')).toMatch(/index registration entry changed during validation/);
  });

  it('detects a same-size descriptor read race and fails the CLI closed', async () => {
    const raced = await fixture();
    const replacement = Buffer.from(workflowBytes);
    replacement[0] = replacement[0] === 0x6e ? 0x4e : 0x6e;
    const raceFailures = await validationFailures(raced.root, {
      afterReadForTest: async (absolutePath) => writeFile(absolutePath, replacement),
    });
    expect(raceFailures.join('\n')).toMatch(/changed during its descriptor read/);

    const linked = await fixture();
    const targetPath = path.join(linked.root, 'same-workflow.yml');
    await writeFile(targetPath, workflowBytes, { mode: 0o644 });
    await unlink(linked.workflowPath);
    await symlink('../../same-workflow.yml', linked.workflowPath);
    const cli = await runRegistrationCli(linked.root);
    expect(cli.code).toBe(1);
    expect(cli.stderr).toMatch(/repository identity validation failed.*regular non-symlink/);
    expect(cli.stdout).not.toMatch(/VALID/);
  });
});

function runFixtureGit(root, args) {
  return execFileAsync(
    '/usr/bin/git',
    ['--no-replace-objects', '-C', root, ...args],
    { env: TEST_GIT_ENVIRONMENT },
  );
}
