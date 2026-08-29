import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  PINNED_DOCKERFILE_FRONTEND,
  buildRuntimeInputManifest,
  canonicalJson,
  canonicalJsonBytes,
  expectedDependencyLockBytes,
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
const SOURCE_REVISION = '9a67f4509588d242838c736a580b6ec5badc18f9';

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
    runModelBytes: Buffer.from('"""fixture runner"""\n'),
    runtimeContractBytes: Buffer.from('"""fixture contract"""\n'),
    runtimeSourceRevision: SOURCE_REVISION,
    sourceDateEpoch: '1756467619',
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
      schemaVersion: 'tf.atomistic-runtime-inputs/0.1',
      platform: 'linux/amd64',
      runtimeSource: { revision: SOURCE_REVISION, sourceDateEpoch: 1756467619 },
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

  it('changes identity for every independent build-relevant input class', () => {
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

    const runModel = makeFixture();
    runModel.runModelBytes = Buffer.concat([runModel.runModelBytes, Buffer.from('# runner change\n')]);
    cases.push(['run_model.py bytes', runModel]);

    const runtimeContract = makeFixture();
    runtimeContract.runtimeContractBytes = Buffer.concat([runtimeContract.runtimeContractBytes, Buffer.from('# contract change\n')]);
    cases.push(['runtime_contract.py bytes', runtimeContract]);

    const revision = makeFixture();
    revision.runtimeSourceRevision = 'e'.repeat(40);
    cases.push(['runtime source revision', revision]);

    const epoch = makeFixture();
    epoch.sourceDateEpoch = '1756467620';
    cases.push(['source date epoch', epoch]);

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
    expect(() => buildRuntimeInputManifest({ ...makeFixture(), sourceDateEpoch: '01756467619' })).toThrow(/canonical/);
  });

  it('matches Python sha256_json(files) semantics for checked-in runner sources', async () => {
    const runModelBytes = await readFile(new URL('./run_model.py', import.meta.url));
    const runtimeContractBytes = await readFile(new URL('./runtime_contract.py', import.meta.url));
    const identity = runnerIdentity(runModelBytes, runtimeContractBytes);
    const manualFiles = [
      { name: 'run_model.py', sha256: `sha256:${createHash('sha256').update(runModelBytes).digest('hex')}` },
      { name: 'runtime_contract.py', sha256: `sha256:${createHash('sha256').update(runtimeContractBytes).digest('hex')}` },
    ].sort((left, right) => left.name.localeCompare(right.name));
    const manualRunner = `sha256:${createHash('sha256').update(canonicalJson(manualFiles), 'utf8').digest('hex')}`;
    expect(identity.files).toEqual(manualFiles);
    expect(identity.digest).toBe(manualRunner);
    expect(identity).toEqual({
      files: [
        { name: 'run_model.py', sha256: 'sha256:82704e552e7d5f0a2cdbb0603676429931997653568db70ab016533690c2efd8' },
        { name: 'runtime_contract.py', sha256: 'sha256:d1d94c6ee1b256a16c485e1760ea13ebddf24ef0e34ccde7d3682b9c9ceecc61' },
      ],
      digest: 'sha256:2c708fc0220808cc4b2e2f3043623f604793f7bd8a5913472440f91f17a3987c',
    });
  });

  it('writes a new exact file, refuses overwrite, and verifies exact canonical bytes', async () => {
    const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'tailing-runtime-input-')));
    try {
      const fixture = makeFixture();
      const paths = {
        plan: path.join(temporary, 'reproduction-plan.json'),
        wheelhouseManifest: path.join(temporary, 'mattersim.wheelhouse.manifest.json'),
        dockerfile: path.join(temporary, 'mattersim.Dockerfile'),
        dockerignore: path.join(temporary, '.dockerignore'),
        dependencyLock: path.join(temporary, 'mattersim.requirements.lock'),
        runModel: path.join(temporary, 'run_model.py'),
        runtimeContract: path.join(temporary, 'runtime_contract.py'),
        output: path.join(temporary, 'mattersim.runtime-inputs.json'),
      };
      await mkdir(temporary, { recursive: true });
      await Promise.all([
        writeFile(paths.plan, fixture.scientificPlanBytes),
        writeFile(paths.wheelhouseManifest, fixture.wheelhouseManifestBytes),
        writeFile(paths.dockerfile, fixture.dockerfileBytes),
        writeFile(paths.dockerignore, fixture.dockerignoreBytes),
        writeFile(paths.dependencyLock, fixture.dependencyLockBytes),
        writeFile(paths.runModel, fixture.runModelBytes),
        writeFile(paths.runtimeContract, fixture.runtimeContractBytes),
      ]);
      const cliPath = fileURLToPath(new URL('./runtime-input-contract.mjs', import.meta.url));
      const args = [
        '--model', 'mattersim',
        '--plan', paths.plan,
        '--wheelhouse-manifest', paths.wheelhouseManifest,
        '--dockerfile', paths.dockerfile,
        '--dockerignore', paths.dockerignore,
        '--dependency-lock', paths.dependencyLock,
        '--run-model', paths.runModel,
        '--runtime-contract', paths.runtimeContract,
        '--runtime-source-revision', SOURCE_REVISION,
        '--source-date-epoch', '1756467619',
        '--output', paths.output,
      ];
      const written = spawnSync(process.execPath, [cliPath, 'write-new', ...args], { encoding: 'utf8' });
      expect(written.stderr).toBe('');
      expect(written.status).toBe(0);
      const summary = JSON.parse(written.stdout);
      const outputBytes = await readFile(paths.output);
      expect(summary.fileDigest).toBe(sha256(outputBytes));
      expect(summary.runnerDigest).toMatch(/^sha256:[0-9a-f]{64}$/);

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
});
