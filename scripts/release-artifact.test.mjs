import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createReleaseManifest,
  RELEASE_MANIFEST_PATH,
  RELEASE_WRANGLER_CONFIG,
  RELEASE_WRANGLER_PATH,
  validateExtractedReleaseArtifact,
} from './release-artifact.mjs';

const sha = 'a'.repeat(40);

describe('release artifact manifest', () => {
  it('binds and revalidates the exact deployable dist plus CI reports', async () => {
    const root = await fixture();
    const manifest = await createReleaseManifest({ root, commitSha: sha });
    expect(manifest.files.map((entry) => entry.path)).toContain('dist/server/.vite/manifest.json');
    expect(manifest.files.map((entry) => entry.path)).toContain(RELEASE_WRANGLER_PATH);
    expect(manifest.files.map((entry) => entry.path)).toContain('dist/server/index.js');
    expect(manifest.files.map((entry) => entry.path)).toContain('dist/client/index.html');
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
  const report = {
    sourceRevision: sha,
    verdict: 'conditional',
    hardGateFailures: [],
    upstreamGates: Object.fromEntries(['install', 'lint', 'typecheck', 'test', 'atomistic_manifest', 'build', 'audit'].map((gate) => [gate, 'success'])),
    runtime: { node: 'v24.0.0', platform: 'linux', architecture: 'x64' },
    artifactDigest: `sha256:${'1'.repeat(64)}`,
    ...overrides,
  };
  await writeFile(path.join(root, 'evaluation/latest-report.json'), `${JSON.stringify(report, null, 2)}\n`);
  await writeFile(path.join(root, 'evaluation/latest-report.md'), '# report\n');
  return root;
}

async function writeWranglerConfig(root, mutateWrangler = undefined) {
  const config = structuredClone(RELEASE_WRANGLER_CONFIG);
  if (mutateWrangler) mutateWrangler(config);
  await writeFile(path.join(root, RELEASE_WRANGLER_PATH), JSON.stringify(config));
}
