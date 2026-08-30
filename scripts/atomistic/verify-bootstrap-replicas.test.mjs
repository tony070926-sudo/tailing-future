import { deflateRawSync } from 'node:zlib';
import { describe, expect, it, vi } from 'vitest';
import {
  EXPECTED_EVIDENCE,
  EXPECTED_RUN_IDS,
  EXPECTED_SOURCE_REVISION,
  assertNonPromotionalTree,
  artifactAllowlist,
  comparePredictionReplicas,
  createGitHubTransport,
  expectedLogAllowlist,
  inspectZipCentralDirectory,
  parsePositiveInteger,
  parseAndValidatePredictions,
  runCli,
  validateArtifactPublicationSnapshot,
  validateArtifacts,
  validateJobs,
  validateRunMetadata,
} from './verify-bootstrap-replicas.mjs';
import { canonicalJson } from './runtime-input-contract.mjs';

function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function githubZip(entries, options = {}) {
  const locals = []; const centrals = []; let offset = options.prefix?.length ?? 0;
  for (const entry of entries) {
    const name = Buffer.from(entry.name); const content = Buffer.from(entry.content ?? 'x'); const compressed = deflateRawSync(content);
    const crc = crc32(content); const flags = entry.flags ?? 8; const method = 8;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(method, 8);
    local.writeUInt16LE(name.length, 26); local.writeUInt16LE(0, 28);
    const descriptor = Buffer.alloc(16);
    descriptor.writeUInt32LE(entry.badDescriptorSignature ? 0 : 0x08074b50, 0); descriptor.writeUInt32LE(entry.descriptorCrc ?? crc, 4);
    descriptor.writeUInt32LE(compressed.length, 8); descriptor.writeUInt32LE(content.length, 12);
    locals.push(local, name, compressed, descriptor, ...(entry.gap ? [Buffer.from([0])] : []));
    const extra = entry.extra ?? Buffer.alloc(0); const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE((3 << 8) | 45, 4); central.writeUInt16LE(20, 6); central.writeUInt16LE(flags, 8); central.writeUInt16LE(method, 10);
    central.writeUInt32LE(entry.centralCrc ?? crc, 16); central.writeUInt32LE(compressed.length, 20); central.writeUInt32LE(content.length, 24);
    central.writeUInt16LE(name.length, 28); central.writeUInt16LE(extra.length, 30); central.writeUInt32LE(((entry.mode ?? 0o100444) << 16) >>> 0, 38);
    central.writeUInt32LE(entry.localOffset ?? offset, 42); centrals.push(central, name, extra);
    offset += local.length + name.length + compressed.length + descriptor.length + (entry.gap ? 1 : 0);
  }
  const prefix = options.prefix ?? Buffer.alloc(0); const localBytes = Buffer.concat(locals); const centralBytes = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22); eocd.writeUInt32LE(0x06054b50, 0); eocd.writeUInt16LE(entries.length, 8); eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12); eocd.writeUInt32LE(prefix.length + localBytes.length, 16); eocd.writeUInt16LE(options.comment?.length ?? 0, 20);
  return Buffer.concat([prefix, localBytes, centralBytes, eocd, options.comment ?? Buffer.alloc(0), options.trailing ?? Buffer.alloc(0)]);
}

function prediction(index, overrides = {}) {
  return {
    atomCount: 16, atomicNumbers: Array(16).fill(1), checkpointSha256: 'sha256:e3df9fa708725e3d453140646c7d1838324b347a3d1214cf1440522146f872b5', energyEv: 0,
    environmentSha256: `sha256:${'d'.repeat(64)}`, forcesEvPerAngstrom: Array.from({ length: 16 }, () => [0, 0, 0]),
    id: ['random-TP-000000', 'random-TP-000005', 'random-TP-000010', 'random-TP-000095', 'random-TP-000125', 'random-TP-000135', 'random-TP-000200', 'random-TP-000220', 'random-TP-000369', 'random-TP-000555'][index],
    inputStructureDigest: `sha256:${'c'.repeat(64)}`, modelId: 'mattersim-v1.0.0-5m', packageSha256: 'sha256:1b5e46ba56efa5c1e93372ad32321300fa5e1f07dd9188a11b727bd578cf8d7f',
    runnerSha256: 'sha256:d6e83640f15926088c116312c27605570f9e9c8ba4e9a9988ef5bf4d3a974ed4', schemaVersion: 'tf.atomistic-prediction/0.3', status: 'success',
    stressAseEvPerAngstrom3: Array.from({ length: 3 }, () => [0, 0, 0]), ...overrides,
  };
}

function predictionBytes(records = Array.from({ length: 10 }, (_, index) => prediction(index))) {
  return Buffer.from(`${records.map((record) => canonicalJson(record)).join('\n')}\n`);
}

function steps() {
  const names = [
    'Set up job', 'Check out the dispatched revision without credentials', 'Install the pinned JavaScript runtime',
    'Refuse non-main, non-Linux, or non-x86_64 dispatches', 'Create fresh, model-isolated working directories',
    'Bind paths and runner constants from the frozen plan', 'Verify and pull the pinned Linux amd64 base and Dockerfile frontend',
    'Fetch and hash-check the selected assets', 'Preprocess structures without mounting any model checkpoint',
    'Download one fresh resolved wheelhouse in the online phase', 'Resolve an exact lock from the offline wheelhouse',
    'Freeze and verify the exact resolved wheel set', 'Prove a cold, hash-locked install with no network',
    'Build the isolated runtime image with no build-step network', 'Run checkpoint deserialization and smoke predictions in the final sandbox',
    'Stage only non-promotional bootstrap outputs', 'Upload the allowlisted bootstrap bundle',
    'Post Install the pinned JavaScript runtime', 'Post Check out the dispatched revision without credentials', 'Complete job',
  ];
  const numbers = [...Array.from({ length: 17 }, (_, index) => index + 1), 33, 34, 35];
  return names.map((name, index) => ({ name, number: numbers[index], status: 'completed', conclusion: 'success' }));
}

function jobPayload(runId = EXPECTED_RUN_IDS[0]) {
  const make = (model) => ({ id: EXPECTED_EVIDENCE[runId].jobs[model], name: `${model} isolated bootstrap smoke`, status: 'completed', conclusion: 'success', run_id: runId, run_attempt: 1, head_sha: EXPECTED_SOURCE_REVISION, runner_name: 'GitHub Actions 123', runner_group_name: 'GitHub Actions', workflow_name: 'Atomistic bootstrap predictions (non-promotional)', labels: ['ubuntu-24.04'], started_at: '2026-08-29T08:22:38Z', completed_at: '2026-08-29T08:24:30Z', steps: steps() });
  return { total_count: 2, jobs: [make('mattersim'), make('mace')] };
}

function artifactPayload(runId = EXPECTED_RUN_IDS[0]) {
  const make = (model) => {
    const expected = EXPECTED_EVIDENCE[runId].artifacts[model];
    return { id: expected.id, name: `tailing-atomistic-bootstrap-${model}-${EXPECTED_SOURCE_REVISION}-${runId}-1`, size_in_bytes: expected.sizeBytes, digest: expected.digest, expired: false, expires_at: expected.expiresAt, created_at: model === 'mattersim' ? '2026-08-29T08:25:37Z' : '2026-08-29T08:24:30Z', updated_at: model === 'mattersim' ? '2026-08-29T08:25:37Z' : '2026-08-29T08:24:30Z', archive_download_url: `https://api.github.com/repos/tony070926-sudo/tailing-future/actions/artifacts/${expected.id}/zip`, workflow_run: { id: runId, head_sha: EXPECTED_SOURCE_REVISION, repository_id: 1349498456, head_repository_id: 1349498456 } };
  };
  return { total_count: 2, artifacts: [make('mattersim'), make('mace')] };
}

describe('bootstrap replica verifier primitives', () => {
  it('freezes the only two eligible source runs and exact artifact cardinalities', () => {
    expect(EXPECTED_RUN_IDS).toEqual([33242996794, 33242999376]);
    expect(artifactAllowlist('mattersim')).toHaveLength(15);
    expect(artifactAllowlist('mace')).toHaveLength(16);
    expect(EXPECTED_EVIDENCE[EXPECTED_RUN_IDS[0]].artifacts.mattersim.id).toBe(9711953689);
  });

  it('rejects noncanonical IDs and positive nested claims', () => {
    expect(() => parsePositiveInteger('01', 'run')).toThrow(/canonical/);
    expect(() => assertNonPromotionalTree({ nested: { promotionEligible: true } })).toThrow(/exactly false/);
    expect(() => assertNonPromotionalTree({ metrics: {} })).toThrow(/forbidden/);
  });

  it('validates exact source run identity and rejects attempt drift', () => {
    const runId = EXPECTED_RUN_IDS[0];
    const run = {
      id: runId, run_number: 13, run_attempt: 1, workflow_id: 344903345,
      path: '.github/workflows/atomistic-bootstrap.yml', event: 'workflow_dispatch', status: 'completed', conclusion: 'success',
      head_branch: 'main', head_sha: EXPECTED_SOURCE_REVISION,
      repository: { id: 1349498456, full_name: 'tony070926-sudo/tailing-future' },
      head_repository: { id: 1349498456, full_name: 'tony070926-sudo/tailing-future' },
      created_at: '2026-08-29T08:22:34Z', run_started_at: '2026-08-29T08:22:34Z', updated_at: '2026-08-29T08:25:41Z',
    };
    expect(() => validateRunMetadata(run, runId)).not.toThrow();
    expect(() => validateRunMetadata({ ...run, run_attempt: 2 }, runId)).toThrow(/attempt/);
    expect(() => validateRunMetadata({ ...run, head_sha: 'a'.repeat(40) }, runId)).toThrow(/source S/);
  });

  it('requires exact MACE numerics and applies bounded MatterSim drift', () => {
    const record = (id) => ({
      id, inputStructureDigest: `sha256:${'a'.repeat(64)}`, atomicNumbers: Array(16).fill(1), environmentSha256: `sha256:${'b'.repeat(64)}`,
      energyEv: 1, forcesEvPerAngstrom: Array.from({ length: 16 }, () => [0, 0, 0]), stressAseEvPerAngstrom3: Array.from({ length: 3 }, () => [0, 0, 0]),
    });
    const left = Array.from({ length: 10 }, (_, index) => record(`random-TP-${String(index).padStart(6, '0')}`));
    const right = structuredClone(left);
    expect(comparePredictionReplicas(left, right, 'mace')).toEqual({ energyMaxEv: 0, forceVectorMaxEvPerAngstrom: 0, stressFrobeniusMaxEvPerAngstrom3: 0 });
    right[0].energyEv += 0.00011;
    expect(() => comparePredictionReplicas(left, right, 'mattersim')).toThrow(/threshold/);
  });

  it('pins the distinct GitHub log ZIP ordering for both approved runs', () => {
    expect(expectedLogAllowlist(EXPECTED_RUN_IDS[0])).toContain('0_mace isolated bootstrap smoke.txt');
    expect(expectedLogAllowlist(EXPECTED_RUN_IDS[1])).toContain('0_mattersim isolated bootstrap smoke.txt');
    expect(() => expectedLogAllowlist(1)).toThrow(/not frozen/);
  });

  it('accepts only contiguous signed-descriptor GitHub ZIPs with exact paths and regular 0444 modes', () => {
    const allowed = ['a/file.txt', 'b.txt'];
    const good = githubZip(allowed.map((name) => ({ name })));
    expect(inspectZipCentralDirectory(good, { allowedPaths: allowed, requireMode: 0o100444 })).toHaveLength(2);
    const bomb = githubZip([{ name: 'a' }]);
    const bombCentral = bomb.readUInt32LE(bomb.length - 6); const bombDescriptor = bombCentral - 16;
    bomb.writeUInt32LE(50_000_001, bombCentral + 24); bomb.writeUInt32LE(50_000_001, bombDescriptor + 12);
    const zip64 = githubZip([{ name: 'a' }]); zip64.writeUInt32LE(0xffffffff, zip64.readUInt32LE(zip64.length - 6) + 20);
    const bad = [
      githubZip([{ name: '../escape', content: 'x' }]),
      githubZip([{ name: 'bad\\path', content: 'x' }]),
      githubZip([{ name: 'a', content: 'x' }, { name: 'a', content: 'y' }]),
      githubZip([{ name: 'A', content: 'x' }, { name: 'a', content: 'y' }]),
      githubZip([{ name: 'a', mode: 0o120777 }]),
      githubZip([{ name: 'a', flags: 9 }]),
      githubZip([{ name: 'a', extra: Buffer.from([1]) }]),
      githubZip([{ name: 'a', gap: true }]),
      githubZip([{ name: 'a', badDescriptorSignature: true }]),
      githubZip([{ name: 'a', descriptorCrc: 1 }]),
      githubZip([{ name: 'a', centralCrc: 1 }]),
      githubZip([{ name: 'a' }], { prefix: Buffer.from([0]) }),
      githubZip([{ name: 'a' }], { trailing: Buffer.from([0]) }),
      githubZip([{ name: 'a' }, { name: 'b', localOffset: 0 }]),
      bomb,
      zip64,
    ];
    for (const archive of bad) expect(() => inspectZipCentralDirectory(archive)).toThrow();
  });

  it('strips the token on approved redirects and rejects hostile hosts and streaming overflow', async () => {
    const calls = [];
    const fetchImpl = vi.fn(async (url, init) => {
      calls.push({ url: String(url), headers: init.headers });
      if (calls.length === 1) return new Response(null, { status: 302, headers: { location: 'https://results-receiver.actions.githubusercontent.com/download' } });
      return new Response(Buffer.from('ok'), { status: 200, headers: { 'content-length': '2' } });
    });
    const transport = createGitHubTransport({ token: 'secret', fetchImpl });
    await expect(transport.download('/download', 2)).resolves.toEqual(Buffer.from('ok'));
    expect(calls[0].headers.Authorization).toBe('Bearer secret');
    expect(calls[1].headers.Authorization).toBeUndefined();
    const hostile = createGitHubTransport({ token: 'secret', fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://evil.example/file' } }) });
    await expect(hostile.download('/download', 2)).rejects.toThrow(/redirect/);
    const port = createGitHubTransport({ token: 'secret', fetchImpl: async () => new Response(null, { status: 302, headers: { location: 'https://results-receiver.actions.githubusercontent.com:444/file' } }) });
    await expect(port.download('/download', 2)).rejects.toThrow(/target/);
    const overflow = createGitHubTransport({ token: 'secret', fetchImpl: async () => new Response(Buffer.from('too large'), { status: 200 }) });
    await expect(overflow.download('/download', 2)).rejects.toThrow(/streaming/);
    const advertised = createGitHubTransport({ token: 'secret', fetchImpl: async () => new Response(Buffer.from('x'), { status: 200, headers: { 'content-length': '3' } }) });
    await expect(advertised.download('/download', 2)).rejects.toThrow(/Content-Length/);
  });

  it('rejects job cardinality, runner-label, artifact digest, expiry, and publication reread drift', () => {
    const jobs = jobPayload();
    expect(() => validateJobs(jobs, EXPECTED_RUN_IDS[0])).not.toThrow();
    expect(() => validateJobs({ ...jobs, total_count: 1 }, EXPECTED_RUN_IDS[0])).toThrow(/exactly two/);
    const wrongLabel = structuredClone(jobs); wrongLabel.jobs[0].labels = ['self-hosted'];
    expect(() => validateJobs(wrongLabel, EXPECTED_RUN_IDS[0])).toThrow(/labels/);
    const artifacts = artifactPayload();
    expect(() => validateArtifacts(artifacts, EXPECTED_RUN_IDS[0], new Date('2026-08-30T00:00:00Z'))).not.toThrow();
    const wrongDigest = structuredClone(artifacts); wrongDigest.artifacts[0].digest = `sha256:${'0'.repeat(64)}`;
    expect(() => validateArtifacts(wrongDigest, EXPECTED_RUN_IDS[0], new Date('2026-08-30T00:00:00Z'))).toThrow(/digest/);
    expect(() => validateArtifacts(artifacts, EXPECTED_RUN_IDS[0], new Date('2026-09-06T00:00:00Z'))).toThrow(/expired/);
    const reread = structuredClone(artifacts); reread.artifacts[0].node_id = 'changed';
    expect(() => validateArtifactPublicationSnapshot(artifacts, reread, EXPECTED_RUN_IDS[0], new Date('2026-08-30T00:00:00Z'))).toThrow(/changed/);
  });

  it('validates ten finite label-free prediction records and rejects key, ID, shape, and numeric mutations', () => {
    expect(parseAndValidatePredictions(predictionBytes(), 'mattersim')).toHaveLength(10);
    const duplicate = Array.from({ length: 10 }, (_, index) => prediction(index)); duplicate[1].id = duplicate[0].id;
    expect(() => parseAndValidatePredictions(predictionBytes(duplicate), 'mattersim')).toThrow(/identity|duplicated/);
    const label = Array.from({ length: 10 }, (_, index) => prediction(index)); label[0].referenceLabels = {};
    expect(() => parseAndValidatePredictions(predictionBytes(label), 'mattersim')).toThrow(/keys|forbidden/);
    const claim = Array.from({ length: 10 }, (_, index) => prediction(index)); claim[0].promotionEligible = true;
    expect(() => parseAndValidatePredictions(predictionBytes(claim), 'mattersim')).toThrow(/keys|false/);
    const shape = Array.from({ length: 10 }, (_, index) => prediction(index)); shape[0].forcesEvPerAngstrom = [[0, 0, 0]];
    expect(() => parseAndValidatePredictions(predictionBytes(shape), 'mattersim')).toThrow(/16x3/);
    const nonfinite = predictionBytes().toString().replace('"energyEv":0', '"energyEv":1e999');
    expect(() => parseAndValidatePredictions(Buffer.from(nonfinite), 'mattersim')).toThrow(/non-finite/);
    const duplicateKey = predictionBytes().toString().replace('"atomCount":16', '"atomCount":16,"atomCount":16');
    expect(() => parseAndValidatePredictions(Buffer.from(duplicateKey), 'mattersim')).toThrow(/duplicate/);
  });

  it('fails the CLI closed before network access when its exact arguments are absent', async () => {
    await expect(runCli([], {})).rejects.toThrow(/usage/);
  });
});
