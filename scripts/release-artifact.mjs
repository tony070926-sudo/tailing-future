import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { lstat, mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { hasExactKeys, hasExactStatuses, runtimeKeys } from './release-report.mjs';

export const RELEASE_MANIFEST_PATH = '.release-artifact/manifest.json';
export const RELEASE_SCHEMA_VERSION = 'tf.release-artifact/0.1';
export const RELEASE_REPOSITORY = 'tony070926-sudo/tailing-future';
export const RELEASE_WRANGLER_PATH = 'dist/server/wrangler.json';
export const RELEASE_WORKFLOW = Object.freeze({
  id: 344526316,
  name: 'Tailing Sentinel',
  path: '.github/workflows/evaluate.yml',
});
export const RELEASE_WRANGLER_CONFIG = deepFreeze({
  topLevelName: 'tailing-future',
  dev: {
    ip: 'localhost',
    local_protocol: 'http',
    upstream_protocol: 'http',
    enable_containers: true,
    generate_types: false,
  },
  name: 'tailing-future',
  compatibility_date: '2026-08-26',
  compatibility_flags: ['nodejs_compat'],
  vars: {},
  durable_objects: { bindings: [] },
  kv_namespaces: [],
  queues: { producers: [], consumers: [] },
  connect: [],
  r2_buckets: [],
  d1_databases: [],
  vectorize: [],
  ai_search_namespaces: [],
  ai_search: [],
  agent_memory: [],
  hyperdrive: [],
  workflows: [],
  secrets_store_secrets: [],
  artifacts: [],
  services: [],
  analytics_engine_datasets: [],
  unsafe_hello_world: [],
  flagship: [],
  ratelimits: [],
  worker_loaders: [],
  main: 'index.js',
  jsx_factory: 'React.createElement',
  jsx_fragment: 'React.Fragment',
  migrations: [],
  exports: {},
  triggers: {},
  rules: [{ type: 'ESModule', globs: ['**/*.js', '**/*.mjs'] }],
  build: { watch_dir: './src' },
  no_bundle: true,
  dispatch_namespaces: [],
  logfwdr: { bindings: [] },
  assets: { directory: '../client' },
  observability: { enabled: true },
  python_modules: { exclude: ['**/*.pyc'] },
  define: {},
  cloudchamber: {},
  send_email: [],
  mtls_certificates: [],
  pipelines: [],
  vpc_services: [],
  vpc_networks: [],
});

const REPORT_PATHS = Object.freeze([
  'evaluation/latest-report.json',
  'evaluation/latest-report.md',
]);
const MAX_FILES = 20_000;
const MAX_TOTAL_BYTES = 50_000_000;

export async function createReleaseManifest({ root, commitSha }) {
  validateCommit(commitSha);
  const files = await collectReleaseFiles(root);
  await validateReleaseWranglerConfig(root, files);
  const report = JSON.parse(await readFile(path.join(root, REPORT_PATHS[0]), 'utf8'));
  if (report.sourceRevision !== commitSha) throw new Error('release report sourceRevision does not match the CI commit');
  if (report.verdict === 'reject' || report.hardGateFailures?.length !== 0) throw new Error('release report contains a failed hard gate');
  if (!hasExactStatuses(report.upstreamGates, 'success')) throw new Error('release report does not bind every successful upstream gate');
  if (!hasExactKeys(report.runtime, runtimeKeys)) throw new Error('release report runtime shape is invalid');
  const entries = await digestReleaseFiles(root, files);
  const totalBytes = entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  const contentRootDigest = releaseContentRoot(entries);
  const manifest = {
    schemaVersion: RELEASE_SCHEMA_VERSION,
    repository: RELEASE_REPOSITORY,
    commitSha,
    workflow: RELEASE_WORKFLOW,
    reportArtifactDigest: report.artifactDigest,
    fileCount: entries.length,
    totalBytes,
    contentRootDigest,
    files: entries,
  };
  const manifestPath = path.join(root, RELEASE_MANIFEST_PATH);
  await mkdir(path.dirname(manifestPath), { recursive: true, mode: 0o700 });
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
  return manifest;
}

export async function validateExtractedReleaseArtifact({ root, commitSha }) {
  validateCommit(commitSha);
  const manifestPath = path.join(root, RELEASE_MANIFEST_PATH);
  const manifestBytes = await readFile(manifestPath, 'utf8');
  const manifest = JSON.parse(manifestBytes);
  if (manifestBytes !== `${JSON.stringify(manifest, null, 2)}\n`) throw new Error('release manifest is not canonical pretty JSON');
  const expectedKeys = ['schemaVersion', 'repository', 'commitSha', 'workflow', 'reportArtifactDigest', 'fileCount', 'totalBytes', 'contentRootDigest', 'files'];
  if (!hasExactKeys(manifest, expectedKeys)) throw new Error('release manifest shape is not exact');
  if (manifest.schemaVersion !== RELEASE_SCHEMA_VERSION || manifest.repository !== RELEASE_REPOSITORY || manifest.commitSha !== commitSha) throw new Error('release manifest identity does not match the selected commit');
  if (JSON.stringify(manifest.workflow) !== JSON.stringify(RELEASE_WORKFLOW)) throw new Error('release manifest workflow identity is not pinned');
  if (!/^sha256:[0-9a-f]{64}$/.test(manifest.reportArtifactDigest ?? '') || !/^sha256:[0-9a-f]{64}$/.test(manifest.contentRootDigest ?? '')) throw new Error('release manifest contains an invalid digest');
  if (!Array.isArray(manifest.files) || manifest.files.length < 3 || manifest.files.length > MAX_FILES) throw new Error('release manifest file count is outside policy');
  const paths = manifest.files.map((entry) => entry?.path);
  if (JSON.stringify(paths) !== JSON.stringify([...paths].sort()) || new Set(paths).size !== paths.length) throw new Error('release manifest paths are not unique ASCII-sorted paths');
  for (const entry of manifest.files) validateEntry(entry);
  const actualFiles = await collectExtractedFiles(root);
  if (JSON.stringify(actualFiles) !== JSON.stringify([...paths, RELEASE_MANIFEST_PATH].sort())) throw new Error('extracted artifact contains missing or unmanifested files');
  await validateReleaseWranglerConfig(root, paths);
  const actualEntries = await digestReleaseFiles(root, paths);
  if (JSON.stringify(actualEntries) !== JSON.stringify(manifest.files)) throw new Error('release artifact file bytes differ from the manifest');
  const totalBytes = actualEntries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  if (manifest.fileCount !== actualEntries.length || manifest.totalBytes !== totalBytes || totalBytes > MAX_TOTAL_BYTES) throw new Error('release artifact file totals differ from the manifest');
  if (releaseContentRoot(actualEntries) !== manifest.contentRootDigest) throw new Error('release artifact content root differs from the manifest');
  const report = JSON.parse(await readFile(path.join(root, REPORT_PATHS[0]), 'utf8'));
  if (report.sourceRevision !== commitSha || report.artifactDigest !== manifest.reportArtifactDigest) throw new Error('release report is not bound to the manifest and selected commit');
  if (report.verdict === 'reject' || report.hardGateFailures?.length !== 0 || !hasExactStatuses(report.upstreamGates, 'success')) throw new Error('release report is not an all-gates-success CI report');
  return { manifest, report };
}

async function collectReleaseFiles(root) {
  const dist = await walkRegularFiles(root, 'dist');
  const files = [...dist, ...REPORT_PATHS].sort();
  if (!files.includes(RELEASE_WRANGLER_PATH)) throw new Error(`release build lacks ${RELEASE_WRANGLER_PATH}`);
  return files;
}

async function validateReleaseWranglerConfig(root, manifestPaths) {
  if (!Array.isArray(manifestPaths) || !manifestPaths.includes(RELEASE_WRANGLER_PATH)) throw new Error('release manifest does not contain the pinned Wrangler config');
  const absolutePath = path.join(root, RELEASE_WRANGLER_PATH);
  const bytes = await readFile(absolutePath, 'utf8');
  let config;
  try {
    config = JSON.parse(bytes);
  } catch (error) {
    throw new Error(`release Wrangler config is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (bytes !== JSON.stringify(config)) throw new Error('release Wrangler config must be canonical single-line JSON without duplicate keys or trailing bytes');
  // Wrangler resolves config.account_id before CLOUDFLARE_ACCOUNT_ID. The
  // reviewed release artifact must therefore never be able to override the
  // account pinned by the deployment environment.
  if (Object.hasOwn(config, 'account_id')) throw new Error('release Wrangler config must not override the pinned Cloudflare account');
  if (config?.name !== 'tailing-future' || config?.topLevelName !== 'tailing-future') throw new Error('release Wrangler worker identity drifted');

  const mainPath = resolveDistConfigPath(config?.main, 'main');
  const assetsPath = resolveDistConfigPath(config?.assets?.directory, 'assets.directory');
  if (config.main !== 'index.js' || config.no_bundle !== true || config.assets.directory !== '../client') throw new Error('release Wrangler main/no_bundle/assets contract drifted');
  if (!manifestPaths.includes(mainPath)) throw new Error('release Wrangler main path is not a file in the manifest dist');
  if (!manifestPaths.some((entry) => entry.startsWith(`${assetsPath}/`))) throw new Error('release Wrangler assets directory has no files in the manifest dist');
  if (!sameReleaseValue(config, RELEASE_WRANGLER_CONFIG)) {
    throw new Error('release Wrangler config contains an unreviewed build hook, route, variable, secret, binding, migration, queue or other production capability');
  }
}

function resolveDistConfigPath(configuredPath, label) {
  if (typeof configuredPath !== 'string' || configuredPath.length === 0
      || configuredPath.includes('\\') || path.posix.isAbsolute(configuredPath)) {
    throw new Error(`release Wrangler ${label} path is absolute or invalid`);
  }
  const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(RELEASE_WRANGLER_PATH), configuredPath));
  if (!resolved.startsWith('dist/') || resolved === 'dist') throw new Error(`release Wrangler ${label} path escapes manifest dist`);
  return resolved;
}

async function collectExtractedFiles(root) {
  return walkRegularFiles(root, '.');
}

async function walkRegularFiles(root, relativeDirectory) {
  const output = [];
  async function visit(relativePath) {
    const absolutePath = path.join(root, relativePath);
    const metadata = await lstat(absolutePath);
    if (metadata.isSymbolicLink() || (!metadata.isDirectory() && !metadata.isFile())) throw new Error(`release artifact path is not a regular file/directory: ${relativePath}`);
    if (metadata.isFile()) {
      if (metadata.nlink !== 1) throw new Error(`release artifact file has multiple hard links: ${relativePath}`);
      output.push(relativePath.replace(/^\.\//, ''));
      return;
    }
    const entries = await readdir(absolutePath);
    for (const entry of entries.sort()) await visit(path.posix.join(relativePath, entry));
  }
  await visit(relativeDirectory);
  return output.sort();
}

async function digestReleaseFiles(root, files) {
  const entries = [];
  let totalBytes = 0;
  for (const relativePath of files) {
    if (!isAllowedReleasePath(relativePath)) throw new Error(`release path is outside the allowlist: ${relativePath}`);
    const absolutePath = path.join(root, relativePath);
    const metadata = await lstat(absolutePath);
    if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) throw new Error(`release path is not a single-link regular file: ${relativePath}`);
    totalBytes += metadata.size;
    if (totalBytes > MAX_TOTAL_BYTES) throw new Error('release artifact exceeds the expanded byte limit');
    entries.push({ path: relativePath, sizeBytes: metadata.size, sha256: await streamDigest(absolutePath) });
  }
  return entries;
}

function validateEntry(entry) {
  if (!hasExactKeys(entry, ['path', 'sizeBytes', 'sha256']) || !isAllowedReleasePath(entry.path)) throw new Error('release manifest contains an invalid file entry');
  if (!Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 0 || !/^sha256:[0-9a-f]{64}$/.test(entry.sha256 ?? '')) throw new Error('release manifest file size/digest is invalid');
}

function isAllowedReleasePath(relativePath) {
  if (typeof relativePath !== 'string' || !/^[\x20-\x7e]+$/.test(relativePath) || relativePath.includes('\\') || relativePath.startsWith('/') || relativePath.split('/').some((part) => part === '' || part === '.' || part === '..')) return false;
  return relativePath.startsWith('dist/') || REPORT_PATHS.includes(relativePath);
}

function releaseContentRoot(entries) {
  const digest = createHash('sha256');
  for (const entry of entries) digest.update(`${entry.path.length}:${entry.path}:${entry.sizeBytes}:${entry.sha256}\n`);
  return `sha256:${digest.digest('hex')}`;
}

async function streamDigest(absolutePath) {
  const digest = createHash('sha256');
  for await (const chunk of createReadStream(absolutePath)) digest.update(chunk);
  return `sha256:${digest.digest('hex')}`;
}

function validateCommit(commitSha) {
  if (!/^[0-9a-f]{40}$/.test(commitSha ?? '')) throw new Error('release commit must be a full lowercase Git SHA');
}

function sameReleaseValue(left, right) {
  if (Object.is(left, right)) return true;
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) return left.length === right.length && left.every((value, index) => sameReleaseValue(value, right[index]));
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return JSON.stringify(leftKeys) === JSON.stringify(rightKeys)
    && leftKeys.every((key) => sameReleaseValue(left[key], right[key]));
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  if (process.argv[2] !== 'create') throw new Error('usage: node scripts/release-artifact.mjs create');
  const commitSha = process.env.GITHUB_SHA;
  const manifest = await createReleaseManifest({ root: process.cwd(), commitSha });
  console.log(`Release artifact manifest: ${manifest.fileCount} files · ${manifest.contentRootDigest}`);
}
