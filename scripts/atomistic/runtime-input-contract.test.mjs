import { spawnSync } from 'node:child_process';
import { chmod, link, mkdtemp, mkdir, readFile, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PINNED_DOCKERFILE_FRONTEND,
  PINNED_RUNTIME_SOURCE_DATE_EPOCH,
  PINNED_RUNTIME_SOURCE_REVISION,
  RUNNER_IDENTITY_IMPLEMENTATION,
  RUNNER_MATERIALIZATION,
  RUNNER_MATERIALIZATION_PROTOCOL,
  RUNNER_STAGED_FILE_MODE,
  RUNTIME_INPUT_CLAIMS,
  assertNoPositivePromotionClaims,
  buildRuntimeInputManifest,
  canonicalJson,
  canonicalJsonBytes,
  expectedDependencyLockBytes,
  readRunnerMaterialization,
  runnerIdentity,
  sha256,
} from './runtime-input-contract.mjs';

const DIGESTS = Object.freeze({
  plan: `sha256:${'1'.repeat(64)}`,
  resolver: `sha256:${'2'.repeat(64)}`,
  baseIndex: `sha256:${'3'.repeat(64)}`,
  baseAmd64: `sha256:${'4'.repeat(64)}`,
  dependencyGraph: `sha256:${'5'.repeat(64)}`,
  installedPaths: `sha256:${'6'.repeat(64)}`,
  runtimePaths: `sha256:${'7'.repeat(64)}`,
  wheel: `sha256:${'8'.repeat(64)}`,
  wheelPaths: `sha256:${'9'.repeat(64)}`,
  derivedManifest: `sha256:${'a'.repeat(64)}`,
  derivedSource: `sha256:${'b'.repeat(64)}`,
});
const SOURCE_REVISION = PINNED_RUNTIME_SOURCE_REVISION;
const SOURCE_DATE_EPOCH = PINNED_RUNTIME_SOURCE_DATE_EPOCH;
const RUN_MODEL_BYTES = await readFile(new URL('./v2/run_model.py', import.meta.url));
const RUNTIME_CONTRACT_BYTES = await readFile(new URL('./v2/runtime_contract.py', import.meta.url));
const EXPECTED_RUNNER_DIGEST = 'sha256:d6e83640f15926088c116312c27605570f9e9c8ba4e9a9988ef5bf4d3a974ed4';
const EXPECTED_RUNNER_FILES = RUNNER_MATERIALIZATION.map(({
  name, standardContainerPath, sizeBytes, sha256: digest,
}) => ({ name, standardContainerPath, sizeBytes, sha256: digest }));
const EXPECTED_MATERIALIZATION_DIGEST = sha256(Buffer.from(canonicalJson(RUNNER_MATERIALIZATION), 'utf8'));

function wheel(model) {
  const hostlist = model === 'mace';
  return {
    archiveMemberCount: 7,
    expandedSizeBytes: 2048,
    filename: hostlist ? 'python_hostlist-2.3.0-py3-none-any.whl' : 'probe-1.0-py3-none-any.whl',
    generatedScripts: [],
    installPathDigest: DIGESTS.wheelPaths,
    name: hostlist ? 'python_hostlist' : 'probe',
    normalizedName: hostlist ? 'python-hostlist' : 'probe',
    providesExtras: [],
    python31213Compatible: true,
    requiresDist: [],
    requiresPython: '>=3.12',
    sha256: DIGESTS.wheel,
    sizeBytes: 1024,
    startupHookRemovals: [],
    version: hostlist ? '2.3.0' : '1.0',
  };
}

function wheelhouse(model = 'mattersim') {
  const wheels = [wheel(model)];
  const lock = expectedDependencyLockBytes(wheels);
  return {
    manifest: {
      schemaVersion: 'tf.atomistic-wheelhouse-manifest/0.1',
      model,
      modelId: model === 'mattersim' ? 'mattersim-v1.0.0-5m' : 'mace-mpa-0-medium',
      planDigest: DIGESTS.plan,
      python: '3.12.13',
      platform: 'linux',
      architecture: 'x86_64',
      baseImage: `python:3.12.13-slim-bookworm@${DIGESTS.baseIndex}`,
      baseImageAmd64Digest: DIGESTS.baseAmd64,
      lockDigest: sha256(lock),
      wheelCount: wheels.length,
      dependencyRoots: [`${wheels[0].normalizedName}==${wheels[0].version}`],
      dependencyGraphDigest: DIGESTS.dependencyGraph,
      derivedWheelProvenance: model === 'mace' ? {
        schemaVersion: 'tf.python-hostlist-derived-wheel-provenance/0.1',
        manifestDigest: DIGESTS.derivedManifest,
        sourceSha256: DIGESTS.derivedSource,
        wheelFilename: wheels[0].filename,
        wheelSha256: wheels[0].sha256,
        promotionEligible: false,
      } : null,
      resolverDigest: DIGESTS.resolver,
      resolverRuntime: { pip: '25.2', vendoredPackaging: '25.0' },
      installedFileCount: 7,
      installedPathDigest: DIGESTS.installedPaths,
      startupHookRemovals: [],
      runtimeInstalledFileCount: 7,
      runtimeInstalledPathDigest: DIGESTS.installedPaths,
      wheels,
    },
    lock,
  };
}

function dockerignore(model) {
  return Buffer.from([
    '**',
    '!.dockerignore',
    '!atomistic/',
    '!atomistic/containers/',
    `!atomistic/containers/${model}.Dockerfile`,
    '!atomistic/locks/',
    `!atomistic/locks/${model}.requirements.lock`,
    '!scripts/',
    '!scripts/atomistic/',
    '!scripts/atomistic/run_model.py',
    '!scripts/atomistic/runtime_contract.py',
    '',
  ].join('\n'));
}

function makeFixture(model = 'mattersim') {
  const resolved = wheelhouse(model);
  return {
    model,
    scientificPlanBytes: Buffer.from('{"schemaVersion":"tf.atomistic-reproduction/0.2"}\n'),
    wheelhouseManifestBytes: canonicalJsonBytes(resolved.manifest),
    dockerfileBytes: Buffer.from([
      `# syntax=${PINNED_DOCKERFILE_FRONTEND}`,
      'ARG BASE_IMAGE',
      'FROM ${BASE_IMAGE}',
      'COPY scripts/atomistic/run_model.py /opt/tailing/run_model.py',
      '',
    ].join('\n')),
    dockerignoreBytes: dockerignore(model),
    dependencyLockBytes: resolved.lock,
    runModelBytes: Buffer.from(RUN_MODEL_BYTES),
    runtimeContractBytes: Buffer.from(RUNTIME_CONTRACT_BYTES),
    runtimeSourceRevision: SOURCE_REVISION,
    sourceDateEpoch: String(SOURCE_DATE_EPOCH),
  };
}

function decodeWheelhouse(fixture) {
  return JSON.parse(fixture.wheelhouseManifestBytes.toString('utf8'));
}

function replaceWheelhouse(fixture, manifest) {
  fixture.wheelhouseManifestBytes = canonicalJsonBytes(manifest);
  return fixture;
}

function refreshLock(fixture, manifest) {
  fixture.dependencyLockBytes = expectedDependencyLockBytes(manifest.wheels);
  manifest.lockDigest = sha256(fixture.dependencyLockBytes);
  return replaceWheelhouse(fixture, manifest);
}

async function writeRunnerTrees(parent) {
  const sourceRoot = path.join(parent, 'source-root');
  const buildRoot = path.join(parent, 'build-root');
  await Promise.all([
    mkdir(path.join(sourceRoot, 'scripts/atomistic/v2'), { recursive: true }),
    mkdir(path.join(buildRoot, 'scripts/atomistic'), { recursive: true }),
  ]);
  await Promise.all([
    writeFile(path.join(sourceRoot, 'scripts/atomistic/v2/run_model.py'), RUN_MODEL_BYTES),
    writeFile(path.join(sourceRoot, 'scripts/atomistic/v2/runtime_contract.py'), RUNTIME_CONTRACT_BYTES),
    writeFile(path.join(buildRoot, 'scripts/atomistic/run_model.py'), RUN_MODEL_BYTES),
    writeFile(path.join(buildRoot, 'scripts/atomistic/runtime_contract.py'), RUNTIME_CONTRACT_BYTES),
  ]);
  await Promise.all([
    chmod(path.join(sourceRoot, 'scripts/atomistic/v2/run_model.py'), 0o444),
    chmod(path.join(sourceRoot, 'scripts/atomistic/v2/runtime_contract.py'), 0o444),
    chmod(path.join(buildRoot, 'scripts/atomistic/run_model.py'), 0o444),
    chmod(path.join(buildRoot, 'scripts/atomistic/runtime_contract.py'), 0o444),
  ]);
  return { sourceRoot, buildRoot };
}

describe('canonical atomistic runtime-input contract', () => {
  it('is deterministic across repeated construction and wheelhouse object-key order', () => {
    const fixture = makeFixture();
    const first = buildRuntimeInputManifest(fixture);
    const second = buildRuntimeInputManifest(structuredClone(fixture));
    expect(second.bytes).toEqual(first.bytes);
    expect(second.fileDigest).toBe(first.fileDigest);
    expect(first.bytes.at(-1)).toBe(0x0a);
    expect(first.bytes.subarray(0, -1).includes(0x0a)).toBe(false);
    expect(first.manifest).not.toHaveProperty('fileDigest');
    expect(first.manifest).toMatchObject({
      schemaVersion: 'tf.atomistic-runtime-inputs/0.2',
      platform: 'linux/amd64',
      runtimeSource: {
        runtimeSourceRevision: SOURCE_REVISION,
        sourceDateEpoch: SOURCE_DATE_EPOCH,
        materializationProtocol: RUNNER_MATERIALIZATION_PROTOCOL,
        materializationDigest: EXPECTED_MATERIALIZATION_DIGEST,
        materializations: RUNNER_MATERIALIZATION,
      },
      baseImage: {
        indexDigest: DIGESTS.baseIndex,
        platformManifestDigest: DIGESTS.baseAmd64,
      },
      dockerfileFrontend: {
        reference: PINNED_DOCKERFILE_FRONTEND,
        manifestDigest: `sha256:${'a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e'}`,
      },
      policy: {
        build: { cache: 'disabled', network: 'none', provenance: 'disabled', sbom: 'disabled' },
        runtime: { network: 'none', rootFilesystem: 'read-only' },
      },
      claims: RUNTIME_INPUT_CLAIMS,
    });
    expect(first.manifest.buildInputs.runner).toEqual({
      implementation: RUNNER_IDENTITY_IMPLEMENTATION,
      files: EXPECTED_RUNNER_FILES,
      digest: EXPECTED_RUNNER_DIGEST,
    });

    const manifest = decodeWheelhouse(fixture);
    const reversed = Object.fromEntries(Object.entries(manifest).reverse());
    const reordered = buildRuntimeInputManifest(replaceWheelhouse(makeFixture(), reversed));
    expect(reordered.fileDigest).toBe(first.fileDigest);
  });

  it('excludes resolver identity/runtime and the resolver copy of planDigest from identity', () => {
    const baseline = buildRuntimeInputManifest(makeFixture());
    const fixture = makeFixture();
    const manifest = decodeWheelhouse(fixture);
    manifest.planDigest = `sha256:${'c'.repeat(64)}`;
    manifest.resolverDigest = `sha256:${'d'.repeat(64)}`;
    manifest.resolverRuntime = { pip: '99.0', nested: { deliberately: 'irrelevant' } };
    const changed = buildRuntimeInputManifest(replaceWheelhouse(fixture, manifest));
    expect(changed.fileDigest).toBe(baseline.fileDigest);
    expect(changed.manifest.buildInputs.wheelhouse).not.toHaveProperty('planDigest');
    expect(changed.manifest.buildInputs.wheelhouse).not.toHaveProperty('resolverDigest');
    expect(changed.manifest.buildInputs.wheelhouse).not.toHaveProperty('resolverRuntime');
  });

  it('changes identity for every independently variable build-relevant input class', () => {
    const baseline = buildRuntimeInputManifest(makeFixture()).fileDigest;
    const cases = [];

    const plan = makeFixture();
    plan.scientificPlanBytes = Buffer.from('{"schemaVersion":"tf.atomistic-reproduction/0.2","note":"changed"}\n');
    cases.push(['scientific plan raw bytes', plan]);

    const dockerfile = makeFixture();
    dockerfile.dockerfileBytes = Buffer.concat([dockerfile.dockerfileBytes, Buffer.from('# reviewed build change\n')]);
    cases.push(['Dockerfile bytes', dockerfile]);

    const ignore = makeFixture();
    ignore.dockerignoreBytes = Buffer.concat([ignore.dockerignoreBytes, Buffer.from('!extra-reviewed-input/\n')]);
    cases.push(['dockerignore bytes', ignore]);

    for (const [label, mutate] of [
      ['base image index digest', (manifest) => { manifest.baseImage = `python:3.12.13-slim-bookworm@sha256:${'e'.repeat(64)}`; }],
      ['base image amd64 digest', (manifest) => { manifest.baseImageAmd64Digest = `sha256:${'f'.repeat(64)}`; }],
      ['dependency roots', (manifest) => { manifest.dependencyRoots.push('reviewed-root==2.0'); }],
      ['dependency graph', (manifest) => { manifest.dependencyGraphDigest = `sha256:${'0'.repeat(64)}`; }],
      ['wheel inventory', (manifest) => { manifest.wheels[0].requiresDist.push('reviewed-child>=1'); }],
      ['runtime installed inventory', (manifest) => {
        manifest.installedPathDigest = `sha256:${'a'.repeat(64)}`;
        manifest.runtimeInstalledPathDigest = manifest.installedPathDigest;
      }],
    ]) {
      const fixture = makeFixture();
      const manifest = decodeWheelhouse(fixture);
      mutate(manifest);
      cases.push([label, replaceWheelhouse(fixture, manifest)]);
    }

    const lock = makeFixture();
    const lockManifest = decodeWheelhouse(lock);
    lockManifest.wheels[0].version = '1.1';
    lockManifest.wheels[0].sha256 = `sha256:${'0'.repeat(64)}`;
    lockManifest.dependencyRoots = ['probe==1.1'];
    cases.push(['dependency lock and exact wheel bytes', refreshLock(lock, lockManifest)]);

    const removal = makeFixture();
    const removalManifest = decodeWheelhouse(removal);
    const hook = {
      archivePath: 'distutils-precedence.pth',
      installPath: 'site-packages/distutils-precedence.pth',
      sha256: `sha256:${'c'.repeat(64)}`,
      sizeBytes: 151,
      wheelFilename: removalManifest.wheels[0].filename,
    };
    removalManifest.wheels[0].startupHookRemovals = [hook];
    removalManifest.startupHookRemovals = [hook];
    removalManifest.runtimeInstalledFileCount -= 1;
    removalManifest.runtimeInstalledPathDigest = DIGESTS.runtimePaths;
    cases.push(['startup-hook removal', replaceWheelhouse(removal, removalManifest)]);

    const mace = makeFixture('mace');
    const maceBaseline = buildRuntimeInputManifest(mace).fileDigest;
    const maceManifest = decodeWheelhouse(mace);
    maceManifest.derivedWheelProvenance.sourceSha256 = `sha256:${'d'.repeat(64)}`;
    const derivedChanged = buildRuntimeInputManifest(replaceWheelhouse(mace, maceManifest)).fileDigest;
    expect(derivedChanged, 'derived wheel provenance').not.toBe(maceBaseline);

    for (const [label, fixture] of cases) {
      expect(buildRuntimeInputManifest(fixture).fileDigest, label).not.toBe(baseline);
    }
  });

  it('rejects duplicate, malformed, incoherent and unsafe input claims', () => {
    const duplicate = makeFixture();
    const duplicateText = duplicate.wheelhouseManifestBytes.toString('utf8').replace(
      '"schemaVersion":',
      '"schemaVersion":"forged","schemaVersion":',
    );
    duplicate.wheelhouseManifestBytes = Buffer.from(duplicateText);
    expect(() => buildRuntimeInputManifest(duplicate)).toThrow(/duplicate JSON key/);

    const unsorted = makeFixture();
    const unsortedManifest = decodeWheelhouse(unsorted);
    const earlier = structuredClone(unsortedManifest.wheels[0]);
    earlier.filename = 'alpha-1.0-py3-none-any.whl';
    earlier.name = 'alpha';
    earlier.normalizedName = 'alpha';
    earlier.sha256 = `sha256:${'e'.repeat(64)}`;
    unsortedManifest.wheels.push(earlier);
    unsortedManifest.wheelCount += 1;
    unsortedManifest.installedFileCount += 1;
    unsortedManifest.runtimeInstalledFileCount += 1;
    unsortedManifest.dependencyRoots.push('alpha==1.0');
    expect(() => buildRuntimeInputManifest(refreshLock(unsorted, unsortedManifest))).toThrow(/sorted/);

    const unsafeWheel = makeFixture();
    const unsafeWheelManifest = decodeWheelhouse(unsafeWheel);
    unsafeWheelManifest.wheels[0].filename = '../probe.whl';
    expect(() => buildRuntimeInputManifest(refreshLock(unsafeWheel, unsafeWheelManifest))).toThrow(/safe.*filename/);

    const unsafeIgnore = makeFixture();
    unsafeIgnore.dockerignoreBytes = Buffer.concat([unsafeIgnore.dockerignoreBytes, Buffer.from('!../secret\n')]);
    expect(() => buildRuntimeInputManifest(unsafeIgnore)).toThrow(/unsafe|safe relative/);

    const frontend = makeFixture();
    frontend.dockerfileBytes = Buffer.from(frontend.dockerfileBytes.toString().replace('dockerfile:1.7', 'dockerfile:1.8'));
    expect(() => buildRuntimeInputManifest(frontend)).toThrow(/pinned frontend/);

    const badLock = makeFixture();
    badLock.dependencyLockBytes = Buffer.concat([badLock.dependencyLockBytes, Buffer.from('# drift\n')]);
    expect(() => buildRuntimeInputManifest(badLock)).toThrow(/lock bytes/);

    const malformedDigest = makeFixture();
    const malformedManifest = decodeWheelhouse(malformedDigest);
    malformedManifest.baseImageAmd64Digest = 'sha256:ABC';
    expect(() => buildRuntimeInputManifest(replaceWheelhouse(malformedDigest, malformedManifest))).toThrow(/lowercase sha256/);

    const missingDerived = makeFixture('mace');
    const missingDerivedManifest = decodeWheelhouse(missingDerived);
    missingDerivedManifest.derivedWheelProvenance = null;
    expect(() => buildRuntimeInputManifest(replaceWheelhouse(missingDerived, missingDerivedManifest))).toThrow(/derivedWheelProvenance/);

    expect(() => buildRuntimeInputManifest({ ...makeFixture(), runtimeSourceRevision: 'abc123' })).toThrow(/40-hex/);
    expect(() => buildRuntimeInputManifest({ ...makeFixture(), runtimeSourceRevision: 'e'.repeat(40) })).toThrow(/immutable P revision/);
    expect(() => buildRuntimeInputManifest({ ...makeFixture(), sourceDateEpoch: `0${SOURCE_DATE_EPOCH}` })).toThrow(/canonical/);
    expect(() => buildRuntimeInputManifest({ ...makeFixture(), sourceDateEpoch: String(SOURCE_DATE_EPOCH + 1) })).toThrow(/immutable P commit timestamp/);

    const changedRunModel = makeFixture();
    changedRunModel.runModelBytes = Buffer.concat([changedRunModel.runModelBytes, Buffer.from('# drift\n')]);
    expect(() => buildRuntimeInputManifest(changedRunModel)).toThrow(/immutable P runtime-source identity/);
    const changedRuntimeContract = makeFixture();
    changedRuntimeContract.runtimeContractBytes = Buffer.concat([changedRuntimeContract.runtimeContractBytes, Buffer.from('# drift\n')]);
    expect(() => buildRuntimeInputManifest(changedRuntimeContract)).toThrow(/immutable P runtime-source identity/);
  });

  it('matches the immutable v2 self identity and hashes only its ordered container projection', () => {
    const identity = runnerIdentity(RUN_MODEL_BYTES, RUNTIME_CONTRACT_BYTES);
    expect(identity.digest).toBe(sha256(Buffer.from(canonicalJson(identity.files), 'utf8')));
    expect(identity.files.every((file) => !Object.hasOwn(file, 'sourcePath') && !Object.hasOwn(file, 'buildPath'))).toBe(true);
    expect(identity).toEqual({
      implementation: 'tf.atomistic-runner/v2',
      files: EXPECTED_RUNNER_FILES,
      digest: EXPECTED_RUNNER_DIGEST,
    });
  });

  it('recursively requires every final-manifest promotion claim to be exactly false', () => {
    const manifest = buildRuntimeInputManifest(makeFixture()).manifest;
    expect(() => assertNoPositivePromotionClaims(manifest)).not.toThrow();
    for (const key of ['promotionEligible', 'promotionTrustRoot', 'comparable', 'reproduced']) {
      for (const value of [true, null, 0, 'false']) {
        const candidate = structuredClone(manifest);
        candidate.buildInputs.dockerfile.nestedClaim = [{ [key]: value }];
        expect(
          () => assertNoPositivePromotionClaims(candidate),
          `${key}=${String(value)}`,
        ).toThrow(/must be exactly false/);
      }
    }
  });

  it('writes a new exact file, refuses overwrite, and verifies exact canonical bytes', async () => {
    const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'tailing-runtime-input-')));
    try {
      const fixture = makeFixture();
      const runnerRoots = await writeRunnerTrees(temporary);
      const paths = {
        plan: path.join(temporary, 'reproduction-plan.json'),
        wheelhouseManifest: path.join(temporary, 'mattersim.wheelhouse.manifest.json'),
        dockerfile: path.join(temporary, 'mattersim.Dockerfile'),
        dockerignore: path.join(temporary, '.dockerignore'),
        dependencyLock: path.join(temporary, 'mattersim.requirements.lock'),
        output: path.join(temporary, 'mattersim.runtime-inputs.json'),
      };
      await mkdir(temporary, { recursive: true });
      await Promise.all([
        writeFile(paths.plan, fixture.scientificPlanBytes),
        writeFile(paths.wheelhouseManifest, fixture.wheelhouseManifestBytes),
        writeFile(paths.dockerfile, fixture.dockerfileBytes),
        writeFile(paths.dockerignore, fixture.dockerignoreBytes),
        writeFile(paths.dependencyLock, fixture.dependencyLockBytes),
      ]);
      const cliPath = fileURLToPath(new URL('./runtime-input-contract.mjs', import.meta.url));
      const args = [
        '--model', 'mattersim',
        '--plan', paths.plan,
        '--wheelhouse-manifest', paths.wheelhouseManifest,
        '--dockerfile', paths.dockerfile,
        '--dockerignore', paths.dockerignore,
        '--dependency-lock', paths.dependencyLock,
        '--runner-source-root', runnerRoots.sourceRoot,
        '--runner-build-root', runnerRoots.buildRoot,
        '--runtime-source-revision', SOURCE_REVISION,
        '--source-date-epoch', String(SOURCE_DATE_EPOCH),
        '--output', paths.output,
      ];
      const written = spawnSync(process.execPath, [cliPath, 'write-new', ...args], { encoding: 'utf8' });
      expect(written.stderr).toBe('');
      expect(written.status).toBe(0);
      const summary = JSON.parse(written.stdout);
      const outputBytes = await readFile(paths.output);
      expect(summary.fileDigest).toBe(sha256(outputBytes));
      expect(summary.runnerDigest).toBe(EXPECTED_RUNNER_DIGEST);

      const overwrite = spawnSync(process.execPath, [cliPath, 'write-new', ...args], { encoding: 'utf8' });
      expect(overwrite.status).not.toBe(0);

      const verified = spawnSync(process.execPath, [cliPath, 'verify-exact', ...args], { encoding: 'utf8' });
      expect(verified.status).toBe(0);
      expect(JSON.parse(verified.stdout)).toEqual(summary);

      await writeFile(paths.output, Buffer.concat([outputBytes, Buffer.from('\n')]));
      const drifted = spawnSync(process.execPath, [cliPath, 'verify-exact', ...args], { encoding: 'utf8' });
      expect(drifted.status).not.toBe(0);
      expect(drifted.stderr).toMatch(/differs from the exact canonical contract/);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('fail-closes runner materialization drift, aliases, and legacy tracked-R5 CLI inputs', async () => {
    const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'tailing-runner-materialization-')));
    try {
      const exact = await writeRunnerTrees(path.join(temporary, 'exact'));
      const read = await readRunnerMaterialization(exact.sourceRoot, exact.buildRoot);
      expect(read.runModelBytes).toEqual(RUN_MODEL_BYTES);
      expect(read.runtimeContractBytes).toEqual(RUNTIME_CONTRACT_BYTES);

      const sourceDrift = await writeRunnerTrees(path.join(temporary, 'source-drift'));
      const sourceDriftPath = path.join(sourceDrift.sourceRoot, 'scripts/atomistic/v2/run_model.py');
      await chmod(sourceDriftPath, 0o644);
      await writeFile(sourceDriftPath, Buffer.concat([RUN_MODEL_BYTES, Buffer.from('# drift\n')]));
      await chmod(sourceDriftPath, 0o444);
      await expect(readRunnerMaterialization(sourceDrift.sourceRoot, sourceDrift.buildRoot)).rejects.toThrow(/runtime source.*immutable P/);

      const buildDrift = await writeRunnerTrees(path.join(temporary, 'build-drift'));
      const buildDriftPath = path.join(buildDrift.buildRoot, 'scripts/atomistic/runtime_contract.py');
      await chmod(buildDriftPath, 0o644);
      await writeFile(buildDriftPath, Buffer.concat([RUNTIME_CONTRACT_BYTES, Buffer.from('# drift\n')]));
      await chmod(buildDriftPath, 0o444);
      await expect(readRunnerMaterialization(buildDrift.sourceRoot, buildDrift.buildRoot)).rejects.toThrow(/materialized runner.*immutable P/);

      await expect(readRunnerMaterialization(exact.sourceRoot, exact.sourceRoot)).rejects.toThrow(/disjoint/);
      await expect(readRunnerMaterialization(path.dirname(exact.sourceRoot), exact.sourceRoot)).rejects.toThrow(/disjoint/);

      const symlinked = await writeRunnerTrees(path.join(temporary, 'symlinked'));
      const symlinkTarget = path.join(symlinked.buildRoot, 'scripts/atomistic/run_model.real.py');
      const symlinkPath = path.join(symlinked.buildRoot, 'scripts/atomistic/run_model.py');
      await rm(symlinkPath);
      await writeFile(symlinkTarget, RUN_MODEL_BYTES);
      await symlink(symlinkTarget, symlinkPath);
      await expect(readRunnerMaterialization(symlinked.sourceRoot, symlinked.buildRoot)).rejects.toThrow(/canonical|symlink/);

      const hardlinked = await writeRunnerTrees(path.join(temporary, 'hardlinked'));
      const extraLink = path.join(hardlinked.buildRoot, 'scripts/atomistic/run_model.link.py');
      await link(path.join(hardlinked.buildRoot, 'scripts/atomistic/run_model.py'), extraLink);
      await expect(readRunnerMaterialization(hardlinked.sourceRoot, hardlinked.buildRoot)).rejects.toThrow(/single-link/);

      expect(RUNNER_STAGED_FILE_MODE).toBe('100444');
      const writableMode = await writeRunnerTrees(path.join(temporary, 'writable-mode'));
      await chmod(path.join(writableMode.buildRoot, 'scripts/atomistic/run_model.py'), 0o644);
      await expect(readRunnerMaterialization(writableMode.sourceRoot, writableMode.buildRoot)).rejects.toThrow(/runtime mode must be exactly 100444/);

      const groupUnreadableMode = await writeRunnerTrees(path.join(temporary, 'group-unreadable-mode'));
      await chmod(path.join(groupUnreadableMode.sourceRoot, 'scripts/atomistic/v2/runtime_contract.py'), 0o440);
      await expect(readRunnerMaterialization(groupUnreadableMode.sourceRoot, groupUnreadableMode.buildRoot)).rejects.toThrow(/runtime mode must be exactly 100444/);

      const cliPath = fileURLToPath(new URL('./runtime-input-contract.mjs', import.meta.url));
      const legacy = spawnSync(process.execPath, [cliPath, 'write-new', '--run-model', path.join(temporary, 'run_model.py')], { encoding: 'utf8' });
      expect(legacy.status).not.toBe(0);
      expect(legacy.stderr).toMatch(/unknown.*--run-model/);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
});
