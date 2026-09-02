import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  auditProductionDist,
  createReleaseManifest,
  RELEASE_MANIFEST_PATH,
  RELEASE_WRANGLER_CONFIG,
  RELEASE_WRANGLER_PATH,
  validateExtractedReleaseArtifact,
} from './release-artifact.mjs';

const sha = 'a'.repeat(40);
const V049_FORBIDDEN_DIST_MARKERS = Object.freeze([
  'TFP049T1',
  'tf.atomistic-private-browser-position-frame/0.4.9',
  'tf.atomistic-private-browser-position-frame-order/0.4.9',
  'tf.atomistic-private-browser-position-trajectory-revocation/0.4.9',
  'tf.atomistic-private-browser-position-trajectory/0.4.9',
  'tf.atomistic-private-browser-trajectory-instancing-plan/0.4.9',
  'tf.atomistic-private-browser-trajectory-instancing-runtime/0.4.9',
  'tf.atomistic-private-browser-trajectory-instancing-snapshot/0.4.9',
  'tf.atomistic-private-browser-trajectory-instancing-update/0.4.9',
  'tf.private-browser-trajectory-client-build-audit/0.4.9',
  'tf.private-chromium-runtime-lock/0.4.9',
  'tf.private-chromium-runtime-preflight/0.4.9',
  'tf.private-chromium-runtime-freeze-audit/0.4.9',
  'tf.private-browser-webgl2-trajectory-observation/0.4.9',
  'tf.private-openmm-position-trajectory-packet-export/0.4.9',
  'tf.private-position-trajectory-loopback-server/0.4.9',
  'tf.openmm-tip3p-protected-browser-mode-receipt/0.4.9',
  'tf.openmm-tip3p-protected-browser-evidence/0.4.9',
  'tf.openmm-tip3p-protected-ci-evidence/0.4.9',
  'atomistic-private-browser-position-trajectory-v049',
  'atomistic-private-browser-trajectory-instancing-runtime-v049',
  'build-private-browser-trajectory-client-v049',
  'chromium-v049-lock',
  'private-position-trajectory-envelope-v049',
  'private-position-trajectory-export-v049',
  'private-position-trajectory-loopback-server-v049',
  'private-openmm-webgl2-trajectory-harness-v049',
  'run-protected-private-browser-mode-v049',
  'run-protected-browser-namespace-v049',
  'compose-protected-browser-evidence-v049',
  'X-Private-Packet-Digest',
  '__TF_PRIVATE_CSP_NONCE__',
]);
const reportTemplate = JSON.parse(await readFile(
  new URL('../evaluation/latest-report.json', import.meta.url),
  'utf8',
));

describe('release artifact manifest', () => {
  it('binds and revalidates the exact deployable dist plus CI reports', async () => {
    const root = await fixture();
    const manifest = await createReleaseManifest({ root, commitSha: sha });
    expect(manifest.files.map((entry) => entry.path)).toContain('dist/server/.vite/manifest.json');
    expect(manifest.files.map((entry) => entry.path)).toContain(RELEASE_WRANGLER_PATH);
    expect(manifest.files.map((entry) => entry.path)).toContain('dist/server/index.js');
    expect(manifest.files.map((entry) => entry.path)).toContain('dist/client/index.html');
    expect(manifest.files.map((entry) => entry.path)).toContain('evaluation/public-summary.json');
    await expect(validateExtractedReleaseArtifact({ root, commitSha: sha })).resolves.toMatchObject({ manifest });
  });

  it('rejects changed, unmanifested and noncanonical extracted content', async () => {
    const changed = await fixture();
    await createReleaseManifest({ root: changed, commitSha: sha });
    await writeFile(path.join(changed, 'dist/server/index.js'), 'changed');
    await expect(validateExtractedReleaseArtifact({ root: changed, commitSha: sha })).rejects.toThrow(/bytes differ/);

    const extra = await fixture();
    await createReleaseManifest({ root: extra, commitSha: sha });
    await writeFile(path.join(extra, 'dist/extra.txt'), 'extra');
    await expect(validateExtractedReleaseArtifact({ root: extra, commitSha: sha })).rejects.toThrow(/unmanifested/);

    const noncanonical = await fixture();
    await createReleaseManifest({ root: noncanonical, commitSha: sha });
    const manifestPath = path.join(noncanonical, RELEASE_MANIFEST_PATH);
    const parsed = JSON.parse(await readFile(manifestPath, 'utf8'));
    await writeFile(manifestPath, JSON.stringify(parsed));
    await expect(validateExtractedReleaseArtifact({ root: noncanonical, commitSha: sha })).rejects.toThrow(/not canonical/);
  });

  it('requires a successful exact CI report for the selected commit', async () => {
    const root = await fixture({ sourceRevision: 'b'.repeat(40) });
    await expect(createReleaseManifest({ root, commitSha: sha })).rejects.toThrow(/sourceRevision/);
  });

  it('fails closed on unknown verdicts and any report schema drift', async () => {
    const unknownVerdict = await fixture({ verdict: 'banana' });
    await expect(createReleaseManifest({ root: unknownVerdict, commitSha: sha })).rejects.toThrow(/exact evaluation schema|verdict/);

    const extraField = await fixture({ unexpectedReleaseAuthority: true });
    await expect(createReleaseManifest({ root: extraField, commitSha: sha })).rejects.toThrow(/exact evaluation schema/);

    const missingField = await fixture();
    const reportPath = path.join(missingField, 'evaluation/latest-report.json');
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    delete report.hardGateFailures;
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    await expect(createReleaseManifest({ root: missingField, commitSha: sha })).rejects.toThrow(/exact evaluation schema/);
  });

  it('rejects duplicate keys, noncanonical report JSON and invalid date formats', async () => {
    const duplicateKey = await fixture();
    const duplicateReportPath = path.join(duplicateKey, 'evaluation/latest-report.json');
    const duplicateReport = await readFile(duplicateReportPath, 'utf8');
    await writeFile(duplicateReportPath, duplicateReport.replace('{\n', '{\n  "verdict": "reject",\n'));
    await expect(createReleaseManifest({ root: duplicateKey, commitSha: sha })).rejects.toThrow(/canonical pretty JSON without duplicate keys/);

    const noncanonical = await fixture();
    const noncanonicalReportPath = path.join(noncanonical, 'evaluation/latest-report.json');
    const noncanonicalReport = JSON.parse(await readFile(noncanonicalReportPath, 'utf8'));
    await writeFile(noncanonicalReportPath, JSON.stringify(noncanonicalReport));
    await expect(createReleaseManifest({ root: noncanonical, commitSha: sha })).rejects.toThrow(/canonical pretty JSON/);

    const invalidDate = await fixture({ baselineSnapshotDate: '2026-02-30' });
    await expect(createReleaseManifest({ root: invalidDate, commitSha: sha })).rejects.toThrow(/exact evaluation schema/);

    const invalidDateTime = await fixture({ generatedAt: '2026-09-02T25:00:00Z' });
    await expect(createReleaseManifest({ root: invalidDateTime, commitSha: sha })).rejects.toThrow(/exact evaluation schema/);
  });

  it('rejects path escape and requires main/assets to remain in manifest dist', async () => {
    const mainEscape = await fixture({}, (config) => { config.main = '../../../outside.js'; });
    await expect(createReleaseManifest({ root: mainEscape, commitSha: sha })).rejects.toThrow(/main path escapes manifest dist/);

    const assetsEscape = await fixture({}, (config) => { config.assets.directory = '../../../outside'; });
    await expect(createReleaseManifest({ root: assetsEscape, commitSha: sha })).rejects.toThrow(/assets\.directory path escapes manifest dist/);

    const missingMain = await fixture();
    await rm(path.join(missingMain, 'dist/server/index.js'));
    await expect(createReleaseManifest({ root: missingMain, commitSha: sha })).rejects.toThrow(/main path is not a file in the manifest dist/);

    const missingAssets = await fixture();
    await rm(path.join(missingAssets, 'dist/client/index.html'));
    await expect(createReleaseManifest({ root: missingAssets, commitSha: sha })).rejects.toThrow(/assets directory has no files in the manifest dist/);
  });

  it('rejects identity drift, build hooks, routes and nonempty production bindings', async () => {
    const accountOverride = await fixture({}, (config) => { config.account_id = 'f'.repeat(32); });
    await expect(createReleaseManifest({ root: accountOverride, commitSha: sha }))
      .rejects.toThrow(/must not override the pinned Cloudflare account/);

    const cases = [
      ['name', (config) => { config.name = 'attacker-worker'; }],
      ['topLevelName', (config) => { config.topLevelName = 'attacker-worker'; }],
      ['main', (config) => { config.main = 'alternate.js'; }],
      ['no_bundle', (config) => { config.no_bundle = false; }],
      ['assets binding', (config) => { config.assets.binding = 'ASSETS'; }],
      ['build command', (config) => { config.build.command = 'node predeploy.mjs'; }],
      ['build hook', (config) => { config.build.hooks = ['node hook.mjs']; }],
      ['routes', (config) => { config.routes = [{ pattern: '*/*', zone_name: 'example.com' }]; }],
      ['vars', (config) => { config.vars = { ADMIN: 'true' }; }],
      ['secrets', (config) => { config.secrets = ['API_TOKEN']; }],
      ['durable object binding', (config) => { config.durable_objects.bindings = [{ name: 'STATE', class_name: 'State' }]; }],
      ['D1 binding', (config) => { config.d1_databases = [{ binding: 'DB', database_id: 'id' }]; }],
      ['migration', (config) => { config.migrations = [{ tag: 'v1', new_classes: ['State'] }]; }],
      ['queue producer', (config) => { config.queues.producers = [{ binding: 'QUEUE', queue: 'jobs' }]; }],
    ];
    for (const [label, mutate] of cases) {
      const root = await fixture({}, mutate);
      await expect(createReleaseManifest({ root, commitSha: sha }), label).rejects.toThrow();
    }
  });

  it('rechecks Wrangler configuration after extraction instead of trusting manifest creation', async () => {
    const root = await fixture();
    await createReleaseManifest({ root, commitSha: sha });
    await writeWranglerConfig(root, (config) => { config.services = [{ binding: 'UPSTREAM', service: 'admin' }]; });
    await expect(validateExtractedReleaseArtifact({ root, commitSha: sha })).rejects.toThrow(/unreviewed.*production capability/);

    const noncanonical = await fixture();
    const configPath = path.join(noncanonical, RELEASE_WRANGLER_PATH);
    await writeFile(configPath, `${await readFile(configPath, 'utf8')}\n`);
    await expect(createReleaseManifest({ root: noncanonical, commitSha: sha })).rejects.toThrow(/canonical single-line JSON/);
  });

  it('rejects private harness markers in client and server release bytes, including a read-chunk boundary', async () => {
    const client = await fixture();
    await writeFile(path.join(client, 'dist/client/index.html'), '<!doctype html><script>private-browser-harness</script>\n');
    await expect(createReleaseManifest({ root: client, commitSha: sha })).rejects.toThrow(/forbidden private marker/);

    const server = await fixture();
    await writeFile(path.join(server, 'dist/server/index.js'), Buffer.concat([
      Buffer.alloc(64 * 1024 - 7, 0x61),
      Buffer.from('TFP046P1', 'utf8'),
    ]));
    const originalConcat = Buffer.concat;
    const marker = Buffer.from('TFP046P1', 'utf8');
    const matchingScanWindows = [];
    Buffer.concat = function trackedConcat(buffers, totalLength) {
      const output = originalConcat(buffers, totalLength);
      if (output.includes(marker)) matchingScanWindows.push(output);
      return output;
    };
    try {
      await expect(createReleaseManifest({ root: server, commitSha: sha })).rejects.toThrow(/forbidden private marker/);
    } finally {
      Buffer.concat = originalConcat;
      marker.fill(0);
    }
    expect(matchingScanWindows).toHaveLength(1);
    expect(matchingScanWindows[0].every((byte) => byte === 0)).toBe(true);

    const ordinaryProductionBuild = await fixture();
    await writeFile(
      path.join(ordinaryProductionBuild, 'dist/client/index.html'),
      '<!doctype html><script>tf.atomistic-private-position-trajectory/0.4.8</script>\n',
    );
    await expect(auditProductionDist({ root: ordinaryProductionBuild }))
      .rejects.toThrow(/forbidden private marker/);
  });

  it('rejects every V049 magic, schema, module, and harness marker from release bytes',
    async () => {
      for (const marker of V049_FORBIDDEN_DIST_MARKERS) {
        const root = await fixture();
        try {
          await writeFile(
            path.join(root, 'dist/server/index.js'),
            `export const leakedPrivateV049 = ${JSON.stringify(marker)};\n`,
          );
          await expect(
            createReleaseManifest({ root, commitSha: sha }),
            `release accepted V049 marker ${marker}`,
          ).rejects.toThrow(/forbidden private marker/);
        } finally {
          await rm(root, { recursive: true, force: true });
        }
      }
    });

  it('detects V049 magic, schema, and harness markers across production read chunks',
    async () => {
      const crossChunkMarkers = [
        'TFP049T1',
        'tf.atomistic-private-browser-position-trajectory/0.4.9',
        'private-openmm-webgl2-trajectory-harness-v049',
      ];
      for (const marker of crossChunkMarkers) {
        const root = await fixture();
        const markerBytes = Buffer.from(marker, 'utf8');
        try {
          const prefixBytes = (64 * 1024) - Math.ceil(markerBytes.byteLength / 2);
          await writeFile(path.join(root, 'dist/client/index.html'), Buffer.concat([
            Buffer.alloc(prefixBytes, 0x61),
            markerBytes,
            Buffer.from('\n', 'ascii'),
          ]));
          await expect(
            auditProductionDist({ root }),
            `production audit accepted cross-chunk V049 marker ${marker}`,
          ).rejects.toThrow(/forbidden private marker/);
          await expect(
            createReleaseManifest({ root, commitSha: sha }),
            `release accepted cross-chunk V049 marker ${marker}`,
          ).rejects.toThrow(/forbidden private marker/);
        } finally {
          markerBytes.fill(0);
          await rm(root, { recursive: true, force: true });
        }
      }
    });

  it('rejects any public summary drift from the full CI report projection', async () => {
    const root = await fixture();
    const summaryPath = path.join(root, 'evaluation/public-summary.json');
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
    summary.verdict = 'accept';
    await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`);
    await expect(createReleaseManifest({ root, commitSha: sha })).rejects.toThrow(/canonical exact projection/);
  });

  it('revalidates changed report and Wrangler bytes after manifest creation', async () => {
    const reportSwap = await fixture();
    await createReleaseManifest({ root: reportSwap, commitSha: sha });
    const reportPath = path.join(reportSwap, 'evaluation/latest-report.json');
    const report = JSON.parse(await readFile(reportPath, 'utf8'));
    report.verdict = 'banana';
    await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`);
    await expect(validateExtractedReleaseArtifact({ root: reportSwap, commitSha: sha })).rejects.toThrow(/exact evaluation schema|verdict/);

    const configSwap = await fixture();
    await createReleaseManifest({ root: configSwap, commitSha: sha });
    await writeWranglerConfig(configSwap, (config) => { config.vars = { ESCALATED: 'true' }; });
    await expect(validateExtractedReleaseArtifact({ root: configSwap, commitSha: sha })).rejects.toThrow(/unreviewed.*production capability/);
  });
});

async function fixture(overrides = {}, mutateWrangler = undefined) {
  const root = await mkdtemp(path.join(tmpdir(), 'tailing-release-artifact-'));
  await mkdir(path.join(root, 'dist/server/.vite'), { recursive: true });
  await mkdir(path.join(root, 'dist/client'), { recursive: true });
  await mkdir(path.join(root, 'evaluation'), { recursive: true });
  await writeFile(path.join(root, 'dist/server/index.js'), 'export default {};\n');
  await writeFile(path.join(root, 'dist/client/index.html'), '<!doctype html>\n');
  await writeWranglerConfig(root, mutateWrangler);
  await writeFile(path.join(root, 'dist/server/.vite/manifest.json'), '{}\n');
  const report = structuredClone(reportTemplate);
  Object.assign(report, {
    sourceRevision: sha,
    verdict: 'conditional',
    hardGateFailures: [],
    upstreamGates: Object.fromEntries(['install', 'lint', 'typecheck', 'test', 'atomistic_manifest', 'build', 'audit'].map((gate) => [gate, 'success'])),
    runtime: { node: 'v24.0.0', platform: 'linux', architecture: 'x64' },
    artifactDigest: `sha256:${'1'.repeat(64)}`,
  }, overrides);
  await writeFile(path.join(root, 'evaluation/latest-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(root, 'evaluation/latest-report.md'), '# report\n');
  await writeFile(path.join(root, 'evaluation/public-summary.json'), `${JSON.stringify({
    artifactDigest: report.artifactDigest,
    verdict: report.verdict,
    gaps: report.gaps.map(({ severity, dimension }) => ({ severity, dimension })),
  }, null, 2)}\n`);
  return root;
}

async function writeWranglerConfig(root, mutateWrangler = undefined) {
  const config = structuredClone(RELEASE_WRANGLER_CONFIG);
  if (mutateWrangler) mutateWrangler(config);
  await writeFile(path.join(root, RELEASE_WRANGLER_PATH), JSON.stringify(config));
}
