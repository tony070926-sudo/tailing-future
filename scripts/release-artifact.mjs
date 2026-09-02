import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, mkdir, open, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { hasExactKeys, hasExactStatuses, runtimeKeys } from './release-report.mjs';

const RFC3339_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const RFC3339_DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})[Tt](\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:[Zz]|[+-](\d{2}):(\d{2}))$/;
const evaluationReportSchema = JSON.parse(await readFile(
  new URL('../schemas/evaluation-report.schema.json', import.meta.url),
  'utf8',
));
const evaluationReportAjv = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
});
evaluationReportAjv.addFormat('date', { type: 'string', validate: isValidRfc3339Date });
evaluationReportAjv.addFormat('date-time', { type: 'string', validate: isValidRfc3339DateTime });
const validateEvaluationReport = evaluationReportAjv.compile(evaluationReportSchema);

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
  'evaluation/public-summary.json',
]);
const MAX_FILES = 20_000;
const MAX_TOTAL_BYTES = 50_000_000;
const READ_CHUNK_BYTES = 64 * 1024;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const PUBLIC_GAP_DIMENSIONS = new Set([
  'contract', 'data', 'atomistic', 'mesoscale', 'continuum', 'process',
  'coupling', 'world_rollout', 'uq_ood', 'repro_cost', 'visual_truth', 'safety',
]);
const PUBLIC_GAP_SEVERITIES = new Set(['P0', 'P1', 'P2', 'P3']);
const EVALUATION_VERDICTS = new Set(['accept', 'conditional', 'reject']);
const FORBIDDEN_DIST_MARKERS = Object.freeze([
  'TFP046P1',
  'sourceManifest',
  'TFP047P1',
  'tf.private-browser-webgl2-position-packet/0.4.6',
  'tf.private-browser-webgl2-observation/0.4.7',
  'private-browser-harness',
  'private-openmm-webgl2-harness',
  'private-position-loopback',
  'openmm-world-session-loader',
  'atomistic-private-position-frame',
  'atomistic-private-instancing-runtime',
  'tf.atomistic-private-position-trajectory/0.4.8',
  'tf.atomistic-private-trajectory-instancing-runtime/0.4.8',
  'private-position-trajectory-v048',
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

export async function createReleaseManifest({ root, commitSha }) {
  validateCommit(commitSha);
  const files = await collectReleaseFiles(root);
  const snapshot = await captureReleaseFiles(root, files);
  try {
    validateReleaseWranglerConfig(files, requireSnapshotBytes(snapshot, RELEASE_WRANGLER_PATH));
    const report = parseReleaseReport(requireSnapshotBytes(snapshot, REPORT_PATHS[0]), commitSha);
    assertPublicSummaryBytes(requireSnapshotBytes(snapshot, 'evaluation/public-summary.json'), report);
    const totalBytes = snapshot.entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
    const contentRootDigest = releaseContentRoot(snapshot.entries);
    const manifest = {
      schemaVersion: RELEASE_SCHEMA_VERSION,
      repository: RELEASE_REPOSITORY,
      commitSha,
      workflow: RELEASE_WORKFLOW,
      reportArtifactDigest: report.artifactDigest,
      fileCount: snapshot.entries.length,
      totalBytes,
      contentRootDigest,
      files: snapshot.entries,
    };
    const manifestPath = path.join(root, RELEASE_MANIFEST_PATH);
    await mkdir(path.dirname(manifestPath), { recursive: true, mode: 0o700 });
    await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx', mode: 0o600 });
    return manifest;
  } finally {
    snapshot.dispose();
  }
}

export async function validateExtractedReleaseArtifact({ root, commitSha }) {
  validateCommit(commitSha);
  const manifestPath = path.join(root, RELEASE_MANIFEST_PATH);
  const manifestCapture = await stableReadAndAudit(manifestPath, RELEASE_MANIFEST_PATH);
  let manifestBytes;
  let manifest;
  try {
    manifestBytes = decodeExactUtf8(manifestCapture.bytes, 'release manifest');
    manifest = JSON.parse(manifestBytes);
  } catch (error) {
    throw new Error(`release manifest is not valid exact UTF-8 JSON: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    manifestCapture.bytes.fill(0);
  }
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
  const snapshot = await captureReleaseFiles(root, paths);
  try {
    validateReleaseWranglerConfig(paths, requireSnapshotBytes(snapshot, RELEASE_WRANGLER_PATH));
    const report = parseReleaseReport(requireSnapshotBytes(snapshot, REPORT_PATHS[0]), commitSha);
    if (report.artifactDigest !== manifest.reportArtifactDigest) throw new Error('release report is not bound to the manifest and selected commit');
    assertPublicSummaryBytes(requireSnapshotBytes(snapshot, 'evaluation/public-summary.json'), report);
    if (JSON.stringify(snapshot.entries) !== JSON.stringify(manifest.files)) throw new Error('release artifact file bytes differ from the manifest');
    const totalBytes = snapshot.entries.reduce((sum, entry) => sum + entry.sizeBytes, 0);
    if (manifest.fileCount !== snapshot.entries.length || manifest.totalBytes !== totalBytes || totalBytes > MAX_TOTAL_BYTES) throw new Error('release artifact file totals differ from the manifest');
    if (releaseContentRoot(snapshot.entries) !== manifest.contentRootDigest) throw new Error('release artifact content root differs from the manifest');
    return { manifest, report };
  } finally {
    snapshot.dispose();
  }
}

export async function auditProductionDist({ root }) {
  const metadataSnapshot = await captureReleaseFiles(root, [
    'evaluation/latest-report.json',
    'evaluation/public-summary.json',
  ]);
  try {
    const report = parseEvaluationReport(requireSnapshotBytes(metadataSnapshot, REPORT_PATHS[0]));
    assertPublicSummaryBytes(requireSnapshotBytes(metadataSnapshot, 'evaluation/public-summary.json'), report);
  } finally {
    metadataSnapshot.dispose();
  }
  const files = await walkRegularFiles(root, 'dist');
  const snapshot = await captureReleaseFiles(root, files);
  try {
    return {
      fileCount: snapshot.entries.length,
      totalBytes: snapshot.entries.reduce((sum, entry) => sum + entry.sizeBytes, 0),
      contentRootDigest: releaseContentRoot(snapshot.entries),
    };
  } finally {
    snapshot.dispose();
  }
}

async function collectReleaseFiles(root) {
  const dist = await walkRegularFiles(root, 'dist');
  const files = [...dist, ...REPORT_PATHS].sort();
  if (!files.includes(RELEASE_WRANGLER_PATH)) throw new Error(`release build lacks ${RELEASE_WRANGLER_PATH}`);
  return files;
}

function validateReleaseWranglerConfig(manifestPaths, configBytes) {
  if (!Array.isArray(manifestPaths) || !manifestPaths.includes(RELEASE_WRANGLER_PATH)) throw new Error('release manifest does not contain the pinned Wrangler config');
  if (!Buffer.isBuffer(configBytes) || configBytes.length < 2 || configBytes.length > 256 * 1024 || configBytes.includes(0)) {
    throw new Error('release Wrangler config bytes are missing or outside policy');
  }
  const bytes = decodeExactUtf8(configBytes, 'release Wrangler config');
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

async function captureReleaseFiles(root, files) {
  if (!Array.isArray(files) || files.length < 1 || files.length > MAX_FILES) throw new Error('release artifact file count is outside policy');
  const entries = [];
  const bytesByPath = new Map();
  let totalBytes = 0;
  try {
    for (const relativePath of files) {
      if (!isAllowedReleasePath(relativePath)) throw new Error(`release path is outside the allowlist: ${relativePath}`);
      const absolutePath = path.join(root, relativePath);
      const captured = await stableReadAndAudit(absolutePath, relativePath);
      totalBytes += captured.sizeBytes;
      if (totalBytes > MAX_TOTAL_BYTES) {
        captured.bytes.fill(0);
        throw new Error('release artifact exceeds the expanded byte limit');
      }
      entries.push({ path: relativePath, sizeBytes: captured.sizeBytes, sha256: captured.sha256 });
      bytesByPath.set(relativePath, captured.bytes);
    }
    let disposed = false;
    return {
      entries: Object.freeze(entries.map((entry) => Object.freeze(entry))),
      bytesByPath,
      dispose() {
        if (disposed) return;
        disposed = true;
        for (const bytes of bytesByPath.values()) bytes.fill(0);
        bytesByPath.clear();
      },
    };
  } catch (error) {
    for (const bytes of bytesByPath.values()) bytes.fill(0);
    bytesByPath.clear();
    throw error;
  }
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

async function stableReadAndAudit(absolutePath, relativePath) {
  const before = await lstat(absolutePath, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size > BigInt(MAX_TOTAL_BYTES)) {
    throw new Error(`release path is not one bounded single-link regular file: ${relativePath}`);
  }
  const handle = await open(absolutePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  const digest = createHash('sha256');
  const markers = relativePath.startsWith('dist/')
    ? FORBIDDEN_DIST_MARKERS.map((marker) => Buffer.from(marker, 'utf8'))
    : [];
  const maximumMarkerBytes = markers.reduce((maximum, marker) => Math.max(maximum, marker.length), 0);
  const content = Buffer.allocUnsafe(Number(before.size));
  let carry = Buffer.alloc(0);
  let completed = false;
  try {
    const opened = await handle.stat({ bigint: true });
    if (!sameFileIdentity(before, opened)) throw new Error(`release path changed before stable read: ${relativePath}`);
    let offset = 0;
    while (offset < Number(before.size)) {
      const requestedBytes = Math.min(READ_CHUNK_BYTES, Number(before.size) - offset);
      const { bytesRead } = await handle.read(content, offset, requestedBytes, offset);
      if (bytesRead === 0) throw new Error(`release path became shorter during stable read: ${relativePath}`);
      const bytes = content.subarray(offset, offset + bytesRead);
      digest.update(bytes);
      if (markers.length) {
        const window = carry.length ? Buffer.concat([carry, bytes]) : bytes;
        let nextCarry;
        try {
          for (const marker of markers) {
            if (window.indexOf(marker) !== -1) throw new Error(`release dist contains a forbidden private marker: ${relativePath}`);
          }
          const retainedBytes = Math.min(Math.max(0, maximumMarkerBytes - 1), window.length);
          nextCarry = Buffer.from(window.subarray(window.length - retainedBytes));
        } finally {
          if (window !== bytes) window.fill(0);
        }
        carry.fill(0);
        carry = nextCarry;
      }
      offset += bytesRead;
    }
    const probe = Buffer.allocUnsafe(1);
    try {
      if ((await handle.read(probe, 0, 1, Number(before.size))).bytesRead !== 0) {
        throw new Error(`release path grew during stable read: ${relativePath}`);
      }
    } finally {
      probe.fill(0);
    }
    const after = await handle.stat({ bigint: true });
    if (!sameFileIdentity(before, after)) throw new Error(`release path changed during stable read: ${relativePath}`);
    completed = true;
    return {
      bytes: content,
      sizeBytes: Number(before.size),
      sha256: `sha256:${digest.digest('hex')}`,
    };
  } catch (error) {
    content.fill(0);
    throw error;
  } finally {
    carry.fill(0);
    try {
      await handle.close();
    } catch (error) {
      if (completed) content.fill(0);
      throw error;
    }
  }
}

function encodePublicSummary(report) {
  const bytes = Buffer.from(`${JSON.stringify(publicSummaryProjection(report), null, 2)}\n`, 'utf8');
  if (bytes.length < 2 || bytes.length > 4 * 1024 || bytes.includes(0)) throw new Error('release public summary projection is outside its byte contract');
  return bytes;
}

function publicSummaryProjection(report) {
  if (!/^sha256:(?!0{64}$)[0-9a-f]{64}$/.test(report?.artifactDigest ?? '')
    || !EVALUATION_VERDICTS.has(report?.verdict)) {
    throw new Error('release report contains an invalid public digest or verdict');
  }
  if (!Array.isArray(report.gaps) || report.gaps.length > 3) throw new Error('release report gaps exceed the public summary bound');
  const gaps = report.gaps.map((gap) => {
    if (!gap || typeof gap !== 'object'
      || !PUBLIC_GAP_SEVERITIES.has(gap.severity)
      || !PUBLIC_GAP_DIMENSIONS.has(gap.dimension)) {
      throw new Error('release report contains an invalid public gap identifier');
    }
    return { severity: gap.severity, dimension: gap.dimension };
  });
  if (new Set(gaps.map((gap) => gap.dimension)).size !== gaps.length) throw new Error('release report contains duplicate public gap identifiers');
  return { artifactDigest: report.artifactDigest, verdict: report.verdict, gaps };
}

function requireSnapshotBytes(snapshot, relativePath) {
  const bytes = snapshot?.bytesByPath?.get(relativePath);
  if (!Buffer.isBuffer(bytes)) throw new Error(`release snapshot is missing exact bytes for ${relativePath}`);
  return bytes;
}

function assertPublicSummaryBytes(actualBytes, report) {
  const expectedBytes = encodePublicSummary(report);
  try {
    if (!Buffer.isBuffer(actualBytes) || !actualBytes.equals(expectedBytes)) {
      throw new Error('release public summary is not the canonical exact projection of the full report');
    }
  } finally {
    expectedBytes.fill(0);
  }
}

function parseEvaluationReport(reportBytes) {
  if (!Buffer.isBuffer(reportBytes) || reportBytes.length < 2 || reportBytes.length > 16 * 1024 * 1024 || reportBytes.includes(0)) {
    throw new Error('release report bytes are missing or outside policy');
  }
  let reportText;
  let report;
  try {
    reportText = decodeExactUtf8(reportBytes, 'release report');
    report = JSON.parse(reportText);
  } catch {
    throw new Error('release report is not valid JSON');
  }
  if (reportText !== `${JSON.stringify(report, null, 2)}\n`) {
    throw new Error('release report must be canonical pretty JSON without duplicate keys or trailing bytes');
  }
  if (!validateEvaluationReport(report)) {
    throw new Error(`release report fails the exact evaluation schema: ${JSON.stringify(validateEvaluationReport.errors)}`);
  }
  return report;
}

function isValidRfc3339Date(value) {
  const match = RFC3339_DATE_PATTERN.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1) return false;
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day <= daysInMonth[month - 1];
}

function isValidRfc3339DateTime(value) {
  const match = RFC3339_DATE_TIME_PATTERN.exec(value);
  if (!match || !isValidRfc3339Date(match[1])) return false;
  const hour = Number(match[2]);
  const minute = Number(match[3]);
  const second = Number(match[4]);
  const offsetHour = match[5] === undefined ? 0 : Number(match[5]);
  const offsetMinute = match[6] === undefined ? 0 : Number(match[6]);
  const validClock = (hour <= 23 && minute <= 59 && second <= 59)
    || (hour === 23 && minute === 59 && second === 60);
  return validClock && offsetHour <= 23 && offsetMinute <= 59;
}

function decodeExactUtf8(bytes, label) {
  if (!Buffer.isBuffer(bytes)) throw new Error(`${label} bytes are missing`);
  let text;
  try {
    text = UTF8_DECODER.decode(bytes);
  } catch {
    throw new Error(`${label} is not valid UTF-8`);
  }
  if (!Buffer.from(text, 'utf8').equals(bytes)) throw new Error(`${label} contains a BOM or noncanonical UTF-8 bytes`);
  return text;
}

function parseReleaseReport(reportBytes, commitSha) {
  const report = parseEvaluationReport(reportBytes);
  if (report.sourceRevision !== commitSha) throw new Error('release report sourceRevision does not match the CI commit');
  if (!['accept', 'conditional'].includes(report.verdict)) throw new Error('release report verdict is not releasable');
  if (report.hardGateFailures.length !== 0) throw new Error('release report contains a failed hard gate');
  if (!hasExactStatuses(report.upstreamGates, 'success')) throw new Error('release report does not bind every successful upstream gate');
  if (!hasExactKeys(report.runtime, runtimeKeys)) throw new Error('release report runtime shape is invalid');
  publicSummaryProjection(report);
  return report;
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
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
