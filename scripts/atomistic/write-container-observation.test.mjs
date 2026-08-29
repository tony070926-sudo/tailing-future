import { spawnSync } from 'node:child_process';
import { link, mkdir, mkdtemp, readFile, realpath, rm, symlink, truncate, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  CONTAINER_OBSERVATION_SCHEMA_VERSION,
  EVIDENCE_CLASS,
  RUN_SPECIFIC_SEMANTICS,
  STABLE_INPUT_SEMANTICS,
  buildContainerObservation,
  canonicalJsonBytes,
  parseJsonRejectDuplicateKeys,
  sha256,
} from './write-container-observation.mjs';
import {
  PINNED_DOCKERFILE_FRONTEND,
  buildRuntimeInputManifest,
  canonicalJsonBytes as runtimeCanonicalJsonBytes,
  expectedDependencyLockBytes,
  sha256 as runtimeSha256,
} from './runtime-input-contract.mjs';

const SOURCE_REVISION = '9a67f4509588d242838c736a580b6ec5badc18f9';
const WORKFLOW_REVISION = 'a67f4509588d242838c736a580b6ec5badc18f91';
const SOURCE_DATE_EPOCH = 1_756_467_619;
const CREATED = '2025-08-29T11:40:19Z';
const CONFIG_DIGEST = 'sha256:739ef6ded2c0ab06b448cbab2855a171d9942b4410d28df8aba4e1e3740d817e';
const MANIFEST_DIGEST = `sha256:${'1'.repeat(64)}`;
const DIFF_IDS = Object.freeze([`sha256:${'2'.repeat(64)}`, `sha256:${'3'.repeat(64)}`]);
const BUILDX_VERSION = 'github.com/docker/buildx v0.27.0 1234567890abcdef\n';
const DOCKER_SERVER_VERSION = '28.3.3\n';

function makeRuntimeInput(model) {
  return {
    schemaVersion: 'tf.atomistic-runtime-inputs/0.1',
    model,
    modelId: model === 'mattersim' ? 'mattersim-v1.0.0-5m' : 'mace-mpa-0-medium',
    scientificPlan: {
      rawDigest: 'sha256:d3a58524029b51c598d00a7bb9f60b6479a9973a0f9907cbf94a31e61bf1c9c2',
      sizeBytes: 43_730,
    },
    runtimeSource: { revision: SOURCE_REVISION, sourceDateEpoch: SOURCE_DATE_EPOCH },
    platform: 'linux/amd64',
    baseImage: {
      reference: `python:3.12.13-slim-bookworm@sha256:${'4'.repeat(64)}`,
      indexDigest: `sha256:${'4'.repeat(64)}`,
      platformManifestDigest: `sha256:${'5'.repeat(64)}`,
    },
    dockerfileFrontend: {
      reference: `docker/dockerfile:1.7@sha256:${'6'.repeat(64)}`,
      manifestDigest: `sha256:${'6'.repeat(64)}`,
    },
    buildInputs: {
      runner: { digest: `sha256:${'7'.repeat(64)}` },
      dependencyLock: { sha256: `sha256:${'8'.repeat(64)}` },
    },
    policy: {
      build: {
        cache: 'disabled',
        dependencySource: 'verified-local-wheelhouse-only',
        network: 'none',
        pull: false,
        provenance: 'disabled',
        sbom: 'disabled',
      },
      runtime: { capabilities: 'drop-all', network: 'none', noNewPrivileges: true, rootFilesystem: 'read-only', user: '65532:65532' },
    },
  };
}

function makeMetadata() {
  return {
    'buildx.build.provenance': {},
    'buildx.build.ref': 'default/default/0fjb6ubs52xx3vygf6fgdl611',
    'buildx.build.warnings': {},
    'containerimage.config.digest': CONFIG_DIGEST,
    'containerimage.descriptor': {
      annotations: {
        'config.digest': CONFIG_DIGEST,
        'org.opencontainers.image.created': CREATED,
      },
      digest: MANIFEST_DIGEST,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      size: 506,
    },
    'containerimage.digest': MANIFEST_DIGEST,
  };
}

function makeInspect(model = 'mattersim') {
  return [{
    Id: CONFIG_DIGEST,
    RepoTags: [`tailing-atomistic-${model}-bootstrap:${WORKFLOW_REVISION}`],
    RepoDigests: [],
    Parent: '',
    Comment: 'buildkit.dockerfile.v0',
    Created: CREATED,
    DockerVersion: '',
    Author: '',
    Config: {
      Hostname: '',
      Domainname: '',
      User: '65532:65532',
      AttachStdin: false,
      AttachStdout: false,
      AttachStderr: false,
      Tty: false,
      OpenStdin: false,
      StdinOnce: false,
      Env: ['PATH=/usr/local/bin:/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin'],
      Cmd: ['python', '/opt/tailing/run_model.py'],
      Image: '',
      Volumes: null,
      WorkingDir: '/work',
      Entrypoint: null,
      OnBuild: null,
      Labels: {
        'org.opencontainers.image.revision': SOURCE_REVISION,
        'org.tailing-future.evidence-class': EVIDENCE_CLASS,
      },
    },
    Architecture: 'amd64',
    Os: 'linux',
    Size: 123_456_789,
    GraphDriver: { Data: { LowerDir: '/var/lib/docker/overlay2/lower' }, Name: 'overlay2' },
    RootFS: { Type: 'layers', Layers: [...DIFF_IDS] },
    Metadata: { LastTagTime: '2025-08-29T11:41:00Z' },
    Descriptor: {
      digest: MANIFEST_DIGEST,
      mediaType: 'application/vnd.oci.image.manifest.v1+json',
      size: 506,
    },
  }];
}

function makeFixture(model = 'mattersim') {
  return {
    model,
    runtimeSourceRevision: SOURCE_REVISION,
    workflowRevision: WORKFLOW_REVISION,
    sourceDateEpoch: String(SOURCE_DATE_EPOCH),
    runtimeInput: makeRuntimeInput(model),
    metadata: makeMetadata(),
    inspect: makeInspect(model),
    buildxVersionBytes: Buffer.from(BUILDX_VERSION),
    dockerServerVersionBytes: Buffer.from(DOCKER_SERVER_VERSION),
  };
}

function actualRuntimeInputContract(model = 'mattersim') {
  const digests = {
    plan: `sha256:${'1'.repeat(64)}`,
    resolver: `sha256:${'2'.repeat(64)}`,
    baseIndex: `sha256:${'3'.repeat(64)}`,
    baseAmd64: `sha256:${'4'.repeat(64)}`,
    dependencyGraph: `sha256:${'5'.repeat(64)}`,
    installedPaths: `sha256:${'6'.repeat(64)}`,
    wheel: `sha256:${'8'.repeat(64)}`,
    wheelPaths: `sha256:${'9'.repeat(64)}`,
  };
  const wheel = {
    archiveMemberCount: 7,
    expandedSizeBytes: 2048,
    filename: 'probe-1.0-py3-none-any.whl',
    generatedScripts: [],
    installPathDigest: digests.wheelPaths,
    name: 'probe',
    normalizedName: 'probe',
    providesExtras: [],
    python31213Compatible: true,
    requiresDist: [],
    requiresPython: '>=3.12',
    sha256: digests.wheel,
    sizeBytes: 1024,
    startupHookRemovals: [],
    version: '1.0',
  };
  const dependencyLockBytes = expectedDependencyLockBytes([wheel]);
  const wheelhouse = {
    schemaVersion: 'tf.atomistic-wheelhouse-manifest/0.1',
    model,
    modelId: 'mattersim-v1.0.0-5m',
    planDigest: digests.plan,
    python: '3.12.13',
    platform: 'linux',
    architecture: 'x86_64',
    baseImage: `python:3.12.13-slim-bookworm@${digests.baseIndex}`,
    baseImageAmd64Digest: digests.baseAmd64,
    lockDigest: runtimeSha256(dependencyLockBytes),
    wheelCount: 1,
    dependencyRoots: ['probe==1.0'],
    dependencyGraphDigest: digests.dependencyGraph,
    derivedWheelProvenance: null,
    resolverDigest: digests.resolver,
    resolverRuntime: { pip: '25.2', vendoredPackaging: '25.0' },
    installedFileCount: 7,
    installedPathDigest: digests.installedPaths,
    startupHookRemovals: [],
    runtimeInstalledFileCount: 7,
    runtimeInstalledPathDigest: digests.installedPaths,
    wheels: [wheel],
  };
  const dockerignoreBytes = Buffer.from([
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
  return buildRuntimeInputManifest({
    model,
    scientificPlanBytes: Buffer.from('{"schemaVersion":"tf.atomistic-reproduction/0.2"}\n'),
    wheelhouseManifestBytes: runtimeCanonicalJsonBytes(wheelhouse),
    dockerfileBytes: Buffer.from([
      `# syntax=${PINNED_DOCKERFILE_FRONTEND}`,
      'ARG BASE_IMAGE',
      'FROM ${BASE_IMAGE}',
      'COPY scripts/atomistic/run_model.py /opt/tailing/run_model.py',
      '',
    ].join('\n')),
    dockerignoreBytes,
    dependencyLockBytes,
    runModelBytes: Buffer.from('"""fixture runner"""\n'),
    runtimeContractBytes: Buffer.from('"""fixture contract"""\n'),
    runtimeSourceRevision: SOURCE_REVISION,
    sourceDateEpoch: String(SOURCE_DATE_EPOCH),
  });
}

function build(fixture) {
  return buildContainerObservation({
    model: fixture.model,
    runtimeSourceRevision: fixture.runtimeSourceRevision,
    workflowRevision: fixture.workflowRevision,
    sourceDateEpoch: fixture.sourceDateEpoch,
    runtimeInputManifestBytes: fixture.runtimeInputManifestBytes ?? canonicalJsonBytes(fixture.runtimeInput),
    buildxMetadataBytes: fixture.buildxMetadataBytes ?? canonicalJsonBytes(fixture.metadata),
    imageInspectBytes: fixture.imageInspectBytes ?? canonicalJsonBytes(fixture.inspect),
    buildxVersionBytes: fixture.buildxVersionBytes,
    dockerServerVersionBytes: fixture.dockerServerVersionBytes,
  });
}

function mutateFixture(mutator, model = 'mattersim') {
  const fixture = makeFixture(model);
  mutator(fixture);
  return fixture;
}

describe('canonical atomistic container observation', () => {
  it('is deterministic and matches the complete current expected fixture', () => {
    const fixture = makeFixture();
    const first = build(fixture);
    const second = build(makeFixture());
    expect(second.bytes).toEqual(first.bytes);
    expect(second.fileDigest).toBe(first.fileDigest);
    expect(first.bytes.at(-1)).toBe(0x0a);
    expect(first.bytes.subarray(0, -1).includes(0x0a)).toBe(false);

    const runtimeInputBytes = canonicalJsonBytes(fixture.runtimeInput);
    const metadataBytes = canonicalJsonBytes(fixture.metadata);
    const inspectBytes = canonicalJsonBytes(fixture.inspect);
    expect(first.observation).toEqual({
      schemaVersion: CONTAINER_OBSERVATION_SCHEMA_VERSION,
      model: 'mattersim',
      platform: 'linux/amd64',
      runtimeSourceRevision: SOURCE_REVISION,
      workflowRevision: WORKFLOW_REVISION,
      sourceDateEpoch: SOURCE_DATE_EPOCH,
      stableInputReference: {
        runtimeInputManifestDigest: sha256(runtimeInputBytes),
        semantics: STABLE_INPUT_SEMANTICS,
      },
      runSpecificObservations: {
        semantics: RUN_SPECIFIC_SEMANTICS,
        configImageId: { digest: CONFIG_DIGEST, semantics: RUN_SPECIFIC_SEMANTICS },
        manifestDigest: { digest: MANIFEST_DIGEST, semantics: RUN_SPECIFIC_SEMANTICS },
        manifestDescriptor: { mediaType: 'application/vnd.oci.image.manifest.v1+json', sizeBytes: 506 },
        created: CREATED,
        rootfsDiffIds: [...DIFF_IDS],
        buildReference: 'default/default/0fjb6ubs52xx3vygf6fgdl611',
        buildxVersion: BUILDX_VERSION.trimEnd(),
        dockerServerVersion: DOCKER_SERVER_VERSION.trimEnd(),
        registryPushClaim: false,
        sourceEvidence: {
          buildxMetadataDigest: sha256(metadataBytes),
          imageInspectDigest: sha256(inspectBytes),
          buildxVersionDigest: sha256(Buffer.from(BUILDX_VERSION)),
          dockerServerVersionDigest: sha256(Buffer.from(DOCKER_SERVER_VERSION)),
        },
      },
      claims: {
        evidenceClass: EVIDENCE_CLASS,
        promotionEligible: false,
        comparable: false,
        reproduced: false,
      },
    });
    expect(first.fileDigest).toBe('sha256:86ea500ca7a8a2d8a8636893c9193c2ddfb42c05d73fdec56f20966cdbeec2e9');
  });

  it('supports both reviewed model identities', () => {
    expect(build(makeFixture('mattersim')).observation.model).toBe('mattersim');
    expect(build(makeFixture('mace')).observation.model).toBe('mace');
  });

  it('accepts bytes emitted directly by the real runtime-input contract builder', () => {
    const generated = actualRuntimeInputContract();
    const fixture = makeFixture();
    fixture.runtimeInputManifestBytes = generated.bytes;
    const result = build(fixture);
    expect(result.observation.stableInputReference.runtimeInputManifestDigest).toBe(generated.fileDigest);
    expect(JSON.parse(generated.bytes).schemaVersion).toBe('tf.atomistic-runtime-inputs/0.1');
    expect(JSON.parse(generated.bytes).dockerfileFrontend).toEqual({
      reference: PINNED_DOCKERFILE_FRONTEND,
      manifestDigest: PINNED_DOCKERFILE_FRONTEND.slice(PINNED_DOCKERFILE_FRONTEND.indexOf('@') + 1),
    });
  });

  it('changes the exact observation for every coherent input identity mutation', () => {
    const baseline = build(makeFixture());
    const cases = [
      ['runtime-input manifest', mutateFixture((fixture) => { fixture.runtimeInput.buildInputs.runner.digest = `sha256:${'a'.repeat(64)}`; })],
      ['workflow revision and local tag', mutateFixture((fixture) => {
        fixture.workflowRevision = 'b'.repeat(40);
        fixture.inspect[0].RepoTags = [`tailing-atomistic-mattersim-bootstrap:${fixture.workflowRevision}`];
      })],
      ['config/image ID', mutateFixture((fixture) => {
        const digest = `sha256:${'b'.repeat(64)}`;
        fixture.metadata['containerimage.config.digest'] = digest;
        fixture.metadata['containerimage.descriptor'].annotations['config.digest'] = digest;
        fixture.inspect[0].Id = digest;
      })],
      ['manifest digest', mutateFixture((fixture) => {
        const digest = `sha256:${'c'.repeat(64)}`;
        fixture.metadata['containerimage.digest'] = digest;
        fixture.metadata['containerimage.descriptor'].digest = digest;
        fixture.inspect[0].Descriptor.digest = digest;
      })],
      ['rootfs DiffID', mutateFixture((fixture) => { fixture.inspect[0].RootFS.Layers[0] = `sha256:${'d'.repeat(64)}`; })],
      ['Buildx build reference', mutateFixture((fixture) => { fixture.metadata['buildx.build.ref'] = 'default/default/a-different-build'; })],
      ['Buildx version', mutateFixture((fixture) => { fixture.buildxVersionBytes = Buffer.from('github.com/docker/buildx v0.28.0 abcdef\n'); })],
      ['Docker server version', mutateFixture((fixture) => { fixture.dockerServerVersionBytes = Buffer.from('29.0.0\n'); })],
      ['manifest descriptor mediaType', mutateFixture((fixture) => {
        const mediaType = 'application/vnd.docker.distribution.manifest.v2+json';
        fixture.metadata['containerimage.descriptor'].mediaType = mediaType;
        fixture.inspect[0].Descriptor.mediaType = mediaType;
      })],
      ['manifest descriptor size', mutateFixture((fixture) => {
        fixture.metadata['containerimage.descriptor'].size = 507;
        fixture.inspect[0].Descriptor.size = 507;
      })],
      ['Created representation', mutateFixture((fixture) => {
        fixture.metadata['containerimage.descriptor'].annotations['org.opencontainers.image.created'] = '2025-08-29T11:40:19.000000000Z';
        fixture.inspect[0].Created = '2025-08-29T11:40:19.000000000Z';
      })],
    ];
    for (const [label, fixture] of cases) {
      const changed = build(fixture);
      expect(changed.fileDigest, label).not.toBe(baseline.fileDigest);
      expect(changed.bytes, label).not.toEqual(baseline.bytes);
    }
  });

  it('rejects every cross-input identity mismatch and malformed digest', () => {
    const cases = [
      ['model', /model identity/, mutateFixture((fixture) => { fixture.runtimeInput.model = 'mace'; })],
      ['revision', /revision differs/, mutateFixture((fixture) => { fixture.runtimeInput.runtimeSource.revision = 'e'.repeat(40); })],
      ['epoch', /sourceDateEpoch differs/, mutateFixture((fixture) => { fixture.runtimeInput.runtimeSource.sourceDateEpoch += 1; })],
      ['config annotation', /descriptor annotation/, mutateFixture((fixture) => { fixture.metadata['containerimage.descriptor'].annotations['config.digest'] = `sha256:${'e'.repeat(64)}`; })],
      ['manifest descriptor', /descriptor digest/, mutateFixture((fixture) => { fixture.metadata['containerimage.descriptor'].digest = `sha256:${'e'.repeat(64)}`; })],
      ['image Id', /inspect Id differs/, mutateFixture((fixture) => { fixture.inspect[0].Id = `sha256:${'e'.repeat(64)}`; })],
      ['inspect descriptor', /descriptor digest differs/, mutateFixture((fixture) => { fixture.inspect[0].Descriptor.digest = `sha256:${'e'.repeat(64)}`; })],
      ['runtime-input nested digest', /lowercase sha256/, mutateFixture((fixture) => { fixture.runtimeInput.buildInputs.runner.digest = 'sha256:abcd'; })],
      ['uppercase digest', /lowercase sha256/, mutateFixture((fixture) => { fixture.metadata['containerimage.config.digest'] = `sha256:${'A'.repeat(64)}`; })],
      ['short digest', /lowercase sha256/, mutateFixture((fixture) => { fixture.inspect[0].RootFS.Layers[0] = 'sha256:abcd'; })],
    ];
    for (const [label, message, fixture] of cases) expect(() => build(fixture), label).toThrow(message);
  });

  it('rejects extra and duplicate claims at every trusted JSON surface', () => {
    for (const [label, fixture] of [
      ['runtime-input top level', mutateFixture((fixture) => { fixture.runtimeInput.unreviewed = true; })],
      ['metadata top level', mutateFixture((fixture) => { fixture.metadata['containerimage.push'] = true; })],
      ['descriptor', mutateFixture((fixture) => { fixture.metadata['containerimage.descriptor'].registry = 'example.invalid'; })],
      ['descriptor annotations', mutateFixture((fixture) => { fixture.metadata['containerimage.descriptor'].annotations.unreviewed = 'claim'; })],
      ['inspect top level', mutateFixture((fixture) => { fixture.inspect[0].RegistryPush = true; })],
      ['Config', mutateFixture((fixture) => { fixture.inspect[0].Config.Privileged = true; })],
      ['Config labels', mutateFixture((fixture) => { fixture.inspect[0].Config.Labels.unreviewed = 'claim'; })],
      ['RootFS', mutateFixture((fixture) => { fixture.inspect[0].RootFS.Registry = 'example.invalid'; })],
    ]) expect(() => build(fixture), label).toThrow(/unexpected claim surface/);

    const fixture = makeFixture();
    fixture.buildxMetadataBytes = Buffer.from(`{"containerimage.digest":"${MANIFEST_DIGEST}","containerimage.digest":"${MANIFEST_DIGEST}"}\n`);
    expect(() => build(fixture)).toThrow(/duplicate JSON key/);
    expect(() => parseJsonRejectDuplicateKeys(Buffer.from('{"a":1,"\\u0061":2}'), 'fixture')).toThrow(/duplicate JSON key/);
  });

  it('rejects timestamp, label, platform, cardinality, RootFS and registry-push mismatches', () => {
    const cases = [
      [/Created differs/, mutateFixture((fixture) => { fixture.inspect[0].Created = '2025-08-29T11:40:20Z'; })],
      [/created annotation differs/, mutateFixture((fixture) => { fixture.metadata['containerimage.descriptor'].annotations['org.opencontainers.image.created'] = '2025-08-29T11:40:20Z'; })],
      [/whole second/, mutateFixture((fixture) => { fixture.inspect[0].Created = '2025-08-29T11:40:19.1Z'; })],
      [/revision label differs/, mutateFixture((fixture) => { fixture.inspect[0].Config.Labels['org.opencontainers.image.revision'] = 'e'.repeat(40); })],
      [/evidence label/, mutateFixture((fixture) => { fixture.inspect[0].Config.Labels['org.tailing-future.evidence-class'] = 'reproduced'; })],
      [/linux\/amd64/, mutateFixture((fixture) => { fixture.inspect[0].Os = 'windows'; })],
      [/linux\/amd64/, mutateFixture((fixture) => { fixture.inspect[0].Architecture = 'arm64'; })],
      [/exactly one/, mutateFixture((fixture) => { fixture.inspect.push(structuredClone(fixture.inspect[0])); })],
      [/nonempty array/, mutateFixture((fixture) => { fixture.inspect[0].RootFS.Layers = []; })],
      [/RootFS.Type/, mutateFixture((fixture) => { fixture.inspect[0].RootFS.Type = 'not-layers'; })],
      [/RepoTags/, mutateFixture((fixture) => { fixture.inspect[0].RepoTags = [`tailing-atomistic-mace-bootstrap:${SOURCE_REVISION}`]; })],
      [/registry-push claim/, mutateFixture((fixture) => { fixture.inspect[0].RepoDigests = [`example.invalid/tailing@${MANIFEST_DIGEST}`]; })],
      [/provenance/, mutateFixture((fixture) => { fixture.metadata['buildx.build.provenance'] = { pushed: true }; })],
      [/warnings/, mutateFixture((fixture) => { fixture.metadata['buildx.build.warnings'] = { warning: 'not empty' }; })],
    ];
    for (const [message, fixture] of cases) expect(() => build(fixture)).toThrow(message);
  });

  it('requires the runtime-input bytes and version files to have exact canonical text forms', () => {
    const pretty = makeFixture();
    pretty.runtimeInputManifestBytes = Buffer.from(`${JSON.stringify(pretty.runtimeInput, null, 2)}\n`);
    expect(() => build(pretty)).toThrow(/exact canonical JSON/);

    for (const bytes of [Buffer.from(BUILDX_VERSION.trimEnd()), Buffer.from(BUILDX_VERSION.replace('\n', '\r\n')), Buffer.from('v0.27.0\n')]) {
      const fixture = makeFixture();
      fixture.buildxVersionBytes = bytes;
      expect(() => build(fixture)).toThrow(/Buildx version/);
    }
    const server = makeFixture();
    server.dockerServerVersionBytes = Buffer.from('Docker Engine 28.3.3\n');
    expect(() => build(server)).toThrow(/Docker server version/);
  });
});

async function writeCliFixture(directory, model = 'mattersim') {
  const fixture = makeFixture(model);
  const runtimeInputBytes = model === 'mattersim'
    ? actualRuntimeInputContract(model).bytes
    : canonicalJsonBytes(fixture.runtimeInput);
  const paths = {
    runtimeInputManifest: path.join(directory, `${model}.runtime-inputs.json`),
    buildxMetadata: path.join(directory, `${model}.buildx-metadata.json`),
    imageInspect: path.join(directory, `${model}.image-inspect.json`),
    buildxVersion: path.join(directory, 'buildx-version.txt'),
    dockerServerVersion: path.join(directory, 'docker-server-version.txt'),
    output: path.join(directory, `${model}.container-observation.json`),
  };
  await Promise.all([
    writeFile(paths.runtimeInputManifest, runtimeInputBytes),
    writeFile(paths.buildxMetadata, canonicalJsonBytes(fixture.metadata)),
    writeFile(paths.imageInspect, canonicalJsonBytes(fixture.inspect)),
    writeFile(paths.buildxVersion, fixture.buildxVersionBytes),
    writeFile(paths.dockerServerVersion, fixture.dockerServerVersionBytes),
  ]);
  return { fixture, paths };
}

function cliArguments(paths, model = 'mattersim') {
  return [
    '--model', model,
    '--runtime-source-revision', SOURCE_REVISION,
    '--workflow-revision', WORKFLOW_REVISION,
    '--source-date-epoch', String(SOURCE_DATE_EPOCH),
    '--runtime-input-manifest', paths.runtimeInputManifest,
    '--buildx-metadata', paths.buildxMetadata,
    '--image-inspect', paths.imageInspect,
    '--buildx-version', paths.buildxVersion,
    '--docker-server-version', paths.dockerServerVersion,
    '--output', paths.output,
  ];
}

const cliPath = fileURLToPath(new URL('./write-container-observation.mjs', import.meta.url));

describe('container observation CLI filesystem boundary', () => {
  it('writes once, refuses overwrite, verifies exact bytes, and enforces the model output name', async () => {
    const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'tailing-container-observation-')));
    try {
      const { paths } = await writeCliFixture(temporary);
      const args = cliArguments(paths);
      const written = spawnSync(process.execPath, [cliPath, 'write-new', ...args], { encoding: 'utf8' });
      expect(written.status, written.stderr).toBe(0);
      expect(written.stderr).toBe('');
      const summary = JSON.parse(written.stdout);
      const outputBytes = await readFile(paths.output);
      expect(summary).toEqual({ fileDigest: sha256(outputBytes), model: 'mattersim' });

      const overwrite = spawnSync(process.execPath, [cliPath, 'write-new', ...args], { encoding: 'utf8' });
      expect(overwrite.status).not.toBe(0);
      const verified = spawnSync(process.execPath, [cliPath, 'verify-exact', ...args], { encoding: 'utf8' });
      expect(verified.status, verified.stderr).toBe(0);
      expect(JSON.parse(verified.stdout)).toEqual(summary);

      await writeFile(paths.output, Buffer.concat([outputBytes, Buffer.from('\n')]));
      const drifted = spawnSync(process.execPath, [cliPath, 'verify-exact', ...args], { encoding: 'utf8' });
      expect(drifted.status).not.toBe(0);
      expect(drifted.stderr).toMatch(/differs from the exact canonical contract/);

      const wrongName = { ...paths, output: path.join(temporary, 'observation.json') };
      const rejectedName = spawnSync(process.execPath, [cliPath, 'write-new', ...cliArguments(wrongName)], { encoding: 'utf8' });
      expect(rejectedName.status).not.toBe(0);
      expect(rejectedName.stderr).toMatch(/must name mattersim\.container-observation\.json/);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('rejects symbolic links, hard links, oversized files and path aliases before parsing', async () => {
    const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'tailing-container-boundary-')));
    try {
      const { paths } = await writeCliFixture(temporary);

      const symbolic = path.join(temporary, 'symbolic-buildx-metadata.json');
      await symlink(paths.buildxMetadata, symbolic);
      let result = spawnSync(process.execPath, [cliPath, 'write-new', ...cliArguments({ ...paths, buildxMetadata: symbolic })], { encoding: 'utf8' });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/symlink|canonical/);

      const hard = path.join(temporary, 'hard-buildx-metadata.json');
      await link(paths.buildxMetadata, hard);
      result = spawnSync(process.execPath, [cliPath, 'write-new', ...cliArguments({ ...paths, buildxMetadata: hard })], { encoding: 'utf8' });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/single-link regular file/);
      await rm(hard);

      const oversized = path.join(temporary, 'oversized-buildx-metadata.json');
      await writeFile(oversized, 'x');
      await truncate(oversized, 5_000_001);
      result = spawnSync(process.execPath, [cliPath, 'write-new', ...cliArguments({ ...paths, buildxMetadata: oversized })], { encoding: 'utf8' });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/bounded, single-link regular file/);

      result = spawnSync(process.execPath, [cliPath, 'write-new', ...cliArguments({ ...paths, imageInspect: paths.buildxMetadata })], { encoding: 'utf8' });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/path aliases/);

      await mkdir(path.join(temporary, 'unused'));
      const lexicalAlias = `${temporary}${path.sep}unused${path.sep}..${path.sep}${path.basename(paths.buildxVersion)}`;
      result = spawnSync(process.execPath, [cliPath, 'write-new', ...cliArguments({ ...paths, buildxVersion: lexicalAlias })], { encoding: 'utf8' });
      expect(result.status).not.toBe(0);
      expect(result.stderr).toMatch(/path aliases/);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });
});
