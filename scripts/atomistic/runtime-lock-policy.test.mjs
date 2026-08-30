import { execFileSync } from 'node:child_process';
import { link, mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import { MINIMUM_SYSTEM_PATH } from './runtime-freeze-evidence-policy.mjs';
import {
  EXPECTED_DOCKERIGNORE_LINES,
  EXPECTED_RUNTIME_LOCK_RAW_DIGEST,
  EXPECTED_RUNTIME_SOURCE_FILES,
  EXPECTED_RUNTIME_SOURCE_MATERIALIZATIONS,
  RUNTIME_LOCK_CONTROL_PATHS,
  RUNTIME_LOCK_PATH,
  RUNTIME_LOCK_SCHEMA_PATH,
  inspectRuntimeLockBytes,
  isAllowedRuntimeBuildContextPath,
  parseJsonRejectingDuplicateMembers,
  recomputeRuntimeSourceIdentity,
  runtimeSourceGitOptions,
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

describe('atomistic bootstrap runtime freeze lock', () => {
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
    expect(output).toMatch(/VALID · bootstrap-runtime-frozen-not-reproduced · 2\/2 accepted protected-main replicas/);
    expect(output).toMatch(/NOT SCIENTIFICALLY REPRODUCED/);
  });

  it('rejects every static trust-root, build-contract, identity, replication, and claim mutation', () => {
    const changes = [
      (candidate) => { candidate.schemaVersion = 'tf.atomistic-runtime-lock/9.9'; },
      (candidate) => { candidate.scientificPlan.rawDigest = digest('a'); },
      (candidate) => { candidate.runtimeSource.runtimeSourceRevision = 'b'.repeat(40); },
      (candidate) => { candidate.runtimeSource.sourceDateEpoch += 1; },
      (candidate) => { candidate.runtimeSource.sourceManifestProtocol = 'self-reported/v0'; },
      (candidate) => { candidate.runtimeSource.sourceManifestDigest = digest('b'); },
      (candidate) => { candidate.runtimeSource.files[0].sizeBytes += 1; },
      (candidate) => { candidate.runtimeSource.files[4].sha256 = digest('c'); },
      (candidate) => { candidate.runtimeSource.materializationProtocol = 'copy-anything/v0'; },
      (candidate) => { candidate.runtimeSource.materializationDigest = digest('9'); },
      (candidate) => { candidate.runtimeSource.materializations[0].name = 'wrapper.py'; },
      (candidate) => { candidate.runtimeSource.materializations[0].sourcePath = 'scripts/atomistic/run_model.py'; },
      (candidate) => { candidate.runtimeSource.materializations[0].buildPath = 'scripts/atomistic/v2/run_model.py'; },
      (candidate) => { candidate.runtimeSource.materializations[0].standardContainerPath = '/tmp/run_model.py'; },
      (candidate) => { candidate.runtimeSource.materializations[0].mode = '100755'; },
      (candidate) => { candidate.runtimeSource.materializations[0].sizeBytes += 1; },
      (candidate) => { candidate.runtimeSource.materializations[0].sha256 = digest('8'); },
      (candidate) => { candidate.plannedBuildContract.schemaVersion = 'tf.atomistic-runtime-inputs/9.9'; },
      (candidate) => { candidate.plannedBuildContract.platform = 'linux/arm64'; },
      (candidate) => { candidate.plannedBuildContract.baseImage.platformManifestDigest = digest('d'); },
      (candidate) => { candidate.plannedBuildContract.dockerfileFrontend.manifestDigest = digest('e'); },
      (candidate) => { candidate.identities.runnerDigest = digest('f'); },
      (candidate) => { candidate.identities.dependencyLockDigests.mace = digest('1'); },
      (candidate) => { candidate.identities.runtimeInputManifestDigests.mattersim = digest('2'); },
      (candidate) => { candidate.identities.ociImages.mattersim.configDigest = digest('3'); },
      (candidate) => { candidate.identities.ociImages.promotionTrustRoot = true; },
      (candidate) => { candidate.freezeEvidence.sourceReceipt.rawDigest = digest('4'); },
      (candidate) => { candidate.freezeEvidence.attestation.transparencyLog.globalLogIndex += 1; },
      (candidate) => { candidate.freezeEvidence.trustedRoot.nonAuthoritativeSnapshot = false; },
      (candidate) => { candidate.replication.requiredIndependentProtectedMainReplicas = 1; },
      (candidate) => { candidate.replication.acceptedProtectedMainReplicas = 1; },
      (candidate) => { candidate.replication.independenceProtocol = 'same-run-is-enough/v0'; },
      (candidate) => { candidate.replication.observations.push({}); },
      (candidate) => { candidate.claims.evidenceClass = 'reproduced'; },
      (candidate) => { candidate.claims.promotionEligible = true; },
      (candidate) => { candidate.claims.comparable = true; },
      (candidate) => { candidate.claims.reproduced = true; },
    ];
    for (const [index, change] of changes.entries()) expect(mutate(change), `mutation ${index}`).not.toEqual([]);
  });

  it('recursively rejects every malformed promotion, comparison, or reproduction claim', () => {
    for (const key of ['promotionEligible', 'promotionTrustRoot', 'comparable', 'reproduced']) {
      for (const value of [true, null, 0, 'false']) {
        const candidate = structuredClone(lock);
        candidate.runtimeSource.materializations[0].nested = { [key]: value };
        expect(validateRuntimeLockSemantics(candidate).join('\n'), `${key}=${String(value)}`).toMatch(/requires exact false/);
      }
    }
  });

  it('rejects a locally asserted freeze when the externally attested evidence is absent', async () => {
    const candidate = structuredClone(lock);
    delete candidate.freezeEvidence;
    candidate.replication.acceptedProtectedMainReplicas = 0;
    candidate.replication.observations = [];

    expect(validateRuntimeLockSemantics(candidate).join('\n')).toMatch(/freezeEvidence|acceptedProtectedMainReplicas|observations/);
    const schema = parseJsonRejectingDuplicateMembers(await readFile(path.join(root, RUNTIME_LOCK_SCHEMA_PATH)));
    const validate = new Ajv2020({ allErrors: true, validateFormats: false }).compile(schema);
    expect(validate(candidate)).toBe(false);
  });

  it('keeps every runtime-lock control file outside the deny-all Docker context allowlist', () => {
    for (const source of EXPECTED_RUNTIME_SOURCE_FILES.slice(0, 3)) expect(isAllowedRuntimeBuildContextPath(source.path, EXPECTED_DOCKERIGNORE_LINES), source.path).toBe(true);
    for (const materialization of EXPECTED_RUNTIME_SOURCE_MATERIALIZATIONS) {
      expect(isAllowedRuntimeBuildContextPath(materialization.sourcePath, EXPECTED_DOCKERIGNORE_LINES), materialization.sourcePath).toBe(false);
      expect(isAllowedRuntimeBuildContextPath(materialization.buildPath, EXPECTED_DOCKERIGNORE_LINES), materialization.buildPath).toBe(true);
    }
    for (const controlPath of RUNTIME_LOCK_CONTROL_PATHS) expect(isAllowedRuntimeBuildContextPath(controlPath, EXPECTED_DOCKERIGNORE_LINES), controlPath).toBe(false);
  });

  it('binds the declared P revision, timestamp, modes, paths, blobs, and mappings to a real ancestor Git commit', async () => {
    expect(await validateRuntimeSourceCommit(lock, { root })).toEqual([]);
    const wrongTimestamp = structuredClone(lock);
    wrongTimestamp.runtimeSource.sourceDateEpoch += 1;
    expect((await validateRuntimeSourceCommit(wrongTimestamp, { root })).join('\n')).toMatch(/sourceDateEpoch/);
    const wrongFile = structuredClone(lock);
    wrongFile.runtimeSource.files[3].mode = '100755';
    expect((await validateRuntimeSourceCommit(wrongFile, { root })).join('\n')).toMatch(/declaredFiles/);
    const wrongMapping = structuredClone(lock);
    wrongMapping.runtimeSource.materializations[0].buildPath = 'scripts/atomistic/v2/run_model.py';
    expect((await validateRuntimeSourceCommit(wrongMapping, { root })).join('\n')).toMatch(/declaredMaterializations/);
    const missingCommit = structuredClone(lock);
    missingCommit.runtimeSource.runtimeSourceRevision = 'f'.repeat(40);
    expect((await validateRuntimeSourceCommit(missingCommit, { root })).join('\n')).toMatch(/unable to verify/);
  });

  it('uses only the fixed minimum system PATH for every P commit and blob Git read', () => {
    const options = runtimeSourceGitOptions(root);
    expect(options.env.PATH).toBe(MINIMUM_SYSTEM_PATH);
    expect(options.env.PATH).not.toContain('node_modules');
    expect(options.env.PATH).not.toContain(root);
    expect(options.env.GIT_CONFIG_NOSYSTEM).toBe('1');
    expect(options.env.GIT_NO_REPLACE_OBJECTS).toBe('1');
  });

  it('rejects the exact P object when it is not an ancestor of the executing checkout', async () => {
    const { temporaryRoot, repository } = await makeGitRoot();
    try {
      const environment = {
        ...process.env,
        PATH: MINIMUM_SYSTEM_PATH,
        GIT_AUTHOR_NAME: 'Tailing Future Test',
        GIT_AUTHOR_EMAIL: 'test@tailing.future',
        GIT_COMMITTER_NAME: 'Tailing Future Test',
        GIT_COMMITTER_EMAIL: 'test@tailing.future',
      };
      execFileSync('git', ['switch', '--orphan', 'disconnected-runtime-lock-test'], { cwd: repository, env: environment, stdio: 'ignore' });
      execFileSync('git', ['commit', '--allow-empty', '-m', 'disconnected test head'], { cwd: repository, env: environment, stdio: 'ignore' });
      expect((await validateRuntimeSourceCommit(lock, { root: repository })).join('\n')).toMatch(/unable to verify the P commit object, ancestry/);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('recomputes all five source blobs and both runner mappings from P rather than the working tree', async () => {
    const { temporaryRoot, repository } = await makeGitRoot();
    try {
      const before = await recomputeRuntimeSourceIdentity(repository);
      const runnerPath = path.join(repository, 'scripts/atomistic/v2/run_model.py');
      await writeFile(runnerPath, 'forged working-tree runner\n');
      const after = await recomputeRuntimeSourceIdentity(repository);
      expect(after.runnerDigest).toBe(before.runnerDigest);
      expect(after.runnerDigest).toBe('sha256:d6e83640f15926088c116312c27605570f9e9c8ba4e9a9988ef5bf4d3a974ed4');
      expect(after.sourceManifestDigest).toBe(lock.runtimeSource.sourceManifestDigest);
      expect(after.materializationDigest).toBe(lock.runtimeSource.materializationDigest);
      expect(after.files).toEqual(lock.runtimeSource.files);
      expect(after.materializations).toEqual(lock.runtimeSource.materializations);
      expect(after.fileDigests).toEqual(before.fileDigests);
      expect(await validateRuntimeLockRepository(lock, lockBytes, { root: repository })).toEqual([]);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('ignores symlinked and multiply linked working-tree runner decoys and verifies P blobs', async () => {
    for (const kind of ['symlink', 'hardlink']) {
      const { temporaryRoot, repository } = await makeGitRoot();
      try {
        const runnerPath = path.join(repository, 'scripts/atomistic/v2/run_model.py');
        const targetPath = `${runnerPath}.decoy`;
        await writeFile(targetPath, 'working-tree decoy\n');
        await rm(runnerPath);
        if (kind === 'symlink') await symlink(targetPath, runnerPath);
        else await link(targetPath, runnerPath);
        expect(await validateRuntimeLockRepository(lock, lockBytes, { root: repository }), kind).toEqual([]);
        expect(await validateRuntimeSourceCommit(lock, { root: repository }), kind).toEqual([]);
      } finally {
        await rm(temporaryRoot, { recursive: true, force: true });
      }
    }
  });

  it('rejects runtime-lock bytes that name their own control path', async () => {
    const candidate = structuredClone(lock);
    candidate.untrusted = RUNTIME_LOCK_PATH;
    const candidateBytes = Buffer.from(`${JSON.stringify(candidate)}\n`);
    expect((await validateRuntimeLockRepository(candidate, candidateBytes, { root })).join('\n')).toMatch(/contain their own control-file path/);
  });

  it('rejects duplicate members, including escape-equivalent keys, before last-wins JSON parsing', () => {
    const duplicate = lockText.replace(
      '  "state": "bootstrap-runtime-frozen-not-reproduced",',
      '  "state": "forged",\n  "state": "bootstrap-runtime-frozen-not-reproduced",',
    );
    expect(JSON.parse(duplicate)).toEqual(lock);
    expect(inspectRuntimeLockBytes(Buffer.from(duplicate)).failures.join('\n')).toMatch(/duplicate JSON member/);

    const escapedDuplicate = lockText.replace(
      '  "state": "bootstrap-runtime-frozen-not-reproduced",',
      '  "\\u0073tate": "forged",\n  "state": "bootstrap-runtime-frozen-not-reproduced",',
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

async function makeGitRoot() {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'tf-runtime-lock-git-'));
  const repository = path.join(temporaryRoot, 'repository');
  execFileSync('git', ['clone', '--quiet', '--no-hardlinks', root, repository], {
    env: {
      PATH: MINIMUM_SYSTEM_PATH,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_NO_REPLACE_OBJECTS: '1',
      GIT_OPTIONAL_LOCKS: '0',
      LC_ALL: 'C',
    },
  });
  return { temporaryRoot, repository };
}
