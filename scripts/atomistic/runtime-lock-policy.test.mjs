import { execFileSync } from 'node:child_process';
import { copyFile, link, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  EXPECTED_DOCKERIGNORE_LINES,
  EXPECTED_RUNTIME_LOCK_RAW_DIGEST,
  EXPECTED_RUNTIME_SOURCE_FILES,
  RUNTIME_LOCK_CONTROL_PATHS,
  RUNTIME_LOCK_PATH,
  RUNTIME_LOCK_SCHEMA_PATH,
  SCIENTIFIC_PLAN_PATH,
  inspectRuntimeLockBytes,
  isAllowedRuntimeBuildContextPath,
  parseJsonRejectingDuplicateMembers,
  recomputeRuntimeSourceIdentity,
  validateAtomisticRuntimeLock,
  validateRuntimeLockRepository,
  validateRuntimeLockSemantics,
  validateRuntimeSourceCommit,
} from './runtime-lock-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lockBytes = await readFile(path.join(root, RUNTIME_LOCK_PATH));
const lockText = lockBytes.toString('utf8');
const lock = parseJsonRejectingDuplicateMembers(lockBytes);

const digest = (character) => `sha256:${character.repeat(64)}`;
const mutate = (change) => {
  const candidate = structuredClone(lock);
  change(candidate);
  return validateRuntimeLockSemantics(candidate);
};

describe('atomistic runtime discovery lock', () => {
  it('accepts the checked-in lock with schema, source, plan, and non-circular context checks', async () => {
    const schema = parseJsonRejectingDuplicateMembers(await readFile(path.join(root, RUNTIME_LOCK_SCHEMA_PATH)));
    const validate = new Ajv2020({ allErrors: true, validateFormats: false }).compile(schema);
    expect(validate(lock), JSON.stringify(validate.errors)).toBe(true);
    const result = await validateAtomisticRuntimeLock(lockBytes, { root });
    expect(result.rawDigest).toBe(EXPECTED_RUNTIME_LOCK_RAW_DIGEST);
    expect(result.failures).toEqual([]);

    const output = execFileSync(process.execPath, ['scripts/validate-atomistic-runtime-lock.mjs'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(output).toMatch(/VALID · discovery-not-frozen · 0\/2 protected-main replicas/);
    expect(output).toMatch(/NOT REPRODUCED/);
  });

  it('rejects every static trust-root, build-contract, identity, replication, and claim mutation', () => {
    const changes = [
      (candidate) => { candidate.schemaVersion = 'tf.atomistic-runtime-lock/9.9'; },
      (candidate) => { candidate.scientificPlan.rawDigest = digest('a'); },
      (candidate) => { candidate.runtimeSource.revision = 'b'.repeat(40); },
      (candidate) => { candidate.runtimeSource.commitTimestamp += 1; },
      (candidate) => { candidate.runtimeSource.files[0].sizeBytes += 1; },
      (candidate) => { candidate.runtimeSource.files[4].sha256 = digest('c'); },
      (candidate) => { candidate.plannedBuildContract.schemaVersion = 'tf.atomistic-runtime-inputs/9.9'; },
      (candidate) => { candidate.plannedBuildContract.platform = 'linux/arm64'; },
      (candidate) => { candidate.plannedBuildContract.baseImage.platformManifestDigest = digest('d'); },
      (candidate) => { candidate.plannedBuildContract.dockerfileFrontend.manifestDigest = digest('e'); },
      (candidate) => { candidate.identities.runnerDigest = digest('f'); },
      (candidate) => { candidate.identities.dependencyLockDigests.mace = digest('1'); },
      (candidate) => { candidate.identities.runtimeInputManifestDigests.mattersim = digest('2'); },
      (candidate) => { candidate.identities.ociImages.mattersim.configDigest = digest('3'); },
      (candidate) => { candidate.identities.ociImages.promotionTrustRoot = true; },
      (candidate) => { candidate.replication.requiredIndependentProtectedMainReplicas = 1; },
      (candidate) => { candidate.replication.independenceProtocol = 'same-run-is-enough/v0'; },
      (candidate) => { candidate.replication.observations.push({}); },
      (candidate) => { candidate.claims.evidenceClass = 'reproduced'; },
      (candidate) => { candidate.claims.promotionEligible = true; },
      (candidate) => { candidate.claims.comparable = true; },
      (candidate) => { candidate.claims.reproduced = true; },
    ];
    for (const [index, change] of changes.entries()) expect(mutate(change), `mutation ${index}`).not.toEqual([]);
  });

  it('rejects a locally asserted frozen state even when every self-reported identity looks complete', async () => {
    const candidate = structuredClone(lock);
    candidate.state = 'frozen';
    candidate.claims.evidenceClass = 'runtime-frozen-not-reproduced';
    candidate.identities.runnerDigest = digest('4');
    candidate.identities.dependencyLockDigests = { mattersim: digest('5'), mace: digest('6') };
    candidate.identities.runtimeInputManifestDigests = { mattersim: digest('7'), mace: digest('8') };
    candidate.replication.observations = [{
      repositoryRevision: '9'.repeat(40),
      repositoryRef: 'refs/heads/main',
      protectedMain: true,
      runId: '100',
      runAttempt: 1,
      observedAt: '2026-08-29T00:00:00Z',
      conclusion: 'success',
      identities: structuredClone(candidate.identities),
    }];

    expect(validateRuntimeLockSemantics(candidate).join('\n')).toMatch(/separately controlled verifier receipt/);
    const schema = parseJsonRejectingDuplicateMembers(await readFile(path.join(root, RUNTIME_LOCK_SCHEMA_PATH)));
    const validate = new Ajv2020({ allErrors: true, validateFormats: false }).compile(schema);
    expect(validate(candidate)).toBe(false);
  });

  it('keeps every runtime-lock control file outside the deny-all Docker context allowlist', () => {
    for (const source of EXPECTED_RUNTIME_SOURCE_FILES) expect(isAllowedRuntimeBuildContextPath(source.path, EXPECTED_DOCKERIGNORE_LINES), source.path).toBe(true);
    for (const controlPath of RUNTIME_LOCK_CONTROL_PATHS) expect(isAllowedRuntimeBuildContextPath(controlPath, EXPECTED_DOCKERIGNORE_LINES), controlPath).toBe(false);
  });

  it('binds the declared R5 revision, timestamp, modes, paths, and blobs to a real ancestor Git commit', async () => {
    expect(await validateRuntimeSourceCommit(lock, { root })).toEqual([]);
    const wrongTimestamp = structuredClone(lock);
    wrongTimestamp.runtimeSource.commitTimestamp += 1;
    expect((await validateRuntimeSourceCommit(wrongTimestamp, { root })).join('\n')).toMatch(/commitTimestamp/);
    const missingCommit = structuredClone(lock);
    missingCommit.runtimeSource.revision = 'f'.repeat(40);
    expect((await validateRuntimeSourceCommit(missingCommit, { root })).join('\n')).toMatch(/unable to verify/);
  });

  it('changing runtime-lock alone cannot change recomputed runner or build-context source identities', async () => {
    const temporaryRoot = await makeSourceRoot();
    try {
      const before = await recomputeRuntimeSourceIdentity(temporaryRoot);
      const changed = structuredClone(lock);
      changed.state = 'forged';
      await writeFile(path.join(temporaryRoot, RUNTIME_LOCK_PATH), `${JSON.stringify(changed, null, 2)}\n`);
      const after = await recomputeRuntimeSourceIdentity(temporaryRoot);
      expect(after.runnerDigest).toBe(before.runnerDigest);
      expect(after.buildContextSourceDigest).toBe(before.buildContextSourceDigest);
      expect(after.fileDigests).toEqual(before.fileDigests);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('rejects circular runtime-lock paths and file digests in runner or Docker-context bytes', async () => {
    for (const marker of [RUNTIME_LOCK_PATH, EXPECTED_RUNTIME_LOCK_RAW_DIGEST]) {
      const temporaryRoot = await makeSourceRoot();
      try {
        const runnerPath = path.join(temporaryRoot, 'scripts/atomistic/run_model.py');
        const runner = await readFile(runnerPath, 'utf8');
        await writeFile(runnerPath, `${runner}\n# ${marker}\n`);
        const failures = await validateRuntimeLockRepository(lock, lockBytes, { root: temporaryRoot });
        expect(failures.join('\n')).toMatch(/circular runtime-lock reference/);
      } finally {
        await rm(temporaryRoot, { recursive: true, force: true });
      }
    }
  });

  it('rejects symlinked or multiply linked runtime-source files', async () => {
    for (const kind of ['symlink', 'hardlink']) {
      const temporaryRoot = await makeSourceRoot();
      try {
        const runnerPath = path.join(temporaryRoot, 'scripts/atomistic/run_model.py');
        const targetPath = `${runnerPath}.target`;
        await copyFile(runnerPath, targetPath);
        await rm(runnerPath);
        if (kind === 'symlink') await symlink(targetPath, runnerPath);
        else await link(targetPath, runnerPath);
        const failures = await validateRuntimeLockRepository(lock, lockBytes, { root: temporaryRoot });
        expect(failures.join('\n'), kind).toMatch(/unable to read the bounded source set/);
      } finally {
        await rm(temporaryRoot, { recursive: true, force: true });
      }
    }
  });

  it('rejects duplicate members, including escape-equivalent keys, before last-wins JSON parsing', () => {
    const duplicate = lockText.replace(
      '  "state": "discovery-not-frozen",',
      '  "state": "forged",\n  "state": "discovery-not-frozen",',
    );
    expect(JSON.parse(duplicate)).toEqual(lock);
    expect(inspectRuntimeLockBytes(Buffer.from(duplicate)).failures.join('\n')).toMatch(/duplicate JSON member/);

    const escapedDuplicate = lockText.replace(
      '  "state": "discovery-not-frozen",',
      '  "\\u0073tate": "forged",\n  "state": "discovery-not-frozen",',
    );
    expect(JSON.parse(escapedDuplicate)).toEqual(lock);
    expect(() => parseJsonRejectingDuplicateMembers(Buffer.from(escapedDuplicate))).toThrow(/duplicate JSON member/);
  });

  it('rejects a raw-byte-only rewrite even when JSON semantics are unchanged', () => {
    const rewritten = Buffer.from(`${lockText.trimEnd()}  \n`);
    expect(parseJsonRejectingDuplicateMembers(rewritten)).toEqual(lock);
    expect(inspectRuntimeLockBytes(rewritten).failures).toContain('runtime-lock.raw: checked-in byte digest mismatch');
  });
});

async function makeSourceRoot() {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'tf-runtime-lock-'));
  const paths = [...EXPECTED_RUNTIME_SOURCE_FILES.map((entry) => entry.path), SCIENTIFIC_PLAN_PATH, RUNTIME_LOCK_PATH];
  for (const relativePath of paths) {
    await mkdir(path.dirname(path.join(temporaryRoot, relativePath)), { recursive: true });
    await copyFile(path.join(root, relativePath), path.join(temporaryRoot, relativePath));
  }
  return temporaryRoot;
}
