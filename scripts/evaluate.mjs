import { createHash, randomUUID } from 'node:crypto';
import { execFileSync, spawnSync } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  realpath,
  rename,
  rm,
  unlink,
} from 'node:fs/promises';
import path from 'node:path';

const MAX_SOURCE_FILE_BYTES = 32 * 1024 * 1024;
const MAX_SOURCE_SNAPSHOT_BYTES = 128 * 1024 * 1024;
const MAX_REPORT_JSON_BYTES = 16 * 1024 * 1024;
const MAX_REPORT_MARKDOWN_BYTES = 2 * 1024 * 1024;
const MAX_PUBLIC_SUMMARY_BYTES = 4 * 1024;
const MAX_PUBLIC_PRODUCT_EVALUATION_BYTES = 32 * 1024;
const EVALUATOR_WORKER_TIMEOUT_MS = 18 * 60 * 1000;
const PUBLIC_PRODUCT_EVALUATION_VERSION = 'tf.public-product-evaluation/0.1';
const PUBLIC_SCORECARD_DIMENSION_IDS = Object.freeze([
  'contract',
  'data',
  'atomistic',
  'mesoscale',
  'continuum',
  'process',
  'coupling',
  'world_rollout',
  'uq_ood',
  'repro_cost',
  'visual_truth',
  'safety',
]);
const PUBLIC_COMPARATOR_IDS = Object.freeze([
  'aido-cell-1.0',
  'equiformerv3-dens-oam',
  'tece-oam-rra-1.0',
  'mattersim-1.0.0-5m',
  'mace-mpa-0',
  'openmm-8.5.1-tip3p-ions',
  'openmm-8.6.0-tip3p-control',
  'pfhub-benchmark-3',
  'cantera-3.2-cstr',
  'idaes-2.12',
]);
const PUBLIC_COMPARATOR_EVIDENCE_CLASSES = new Set([
  'claim',
  'auditable',
  'reference',
  'reproduced',
]);
const PUBLIC_GAP_DIMENSIONS = new Set([
  'contract',
  'data',
  'atomistic',
  'mesoscale',
  'continuum',
  'process',
  'coupling',
  'world_rollout',
  'uq_ood',
  'repro_cost',
  'visual_truth',
  'safety',
]);
const PUBLIC_GAP_SEVERITIES = new Set(['P0', 'P1', 'P2', 'P3']);
const SNAPSHOT_PREFIX = '.tailing-sentinel-';
const TRUSTED_GIT = '/usr/bin/git';
const GIT_ENVIRONMENT = Object.freeze({
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_LITERAL_PATHSPECS: '1',
  GIT_NO_REPLACE_OBJECTS: '1',
  LANG: 'C',
  LC_ALL: 'C',
  PATH: '/usr/bin:/bin',
});
const PROJECT_SOURCE_DIRECTORIES = Object.freeze([
  '.github/',
  '.openai/',
  'app/',
  'atomistic/',
  'docs/',
  'evaluation/',
  'lib/',
  'public/',
  'schemas/',
  'scripts/',
]);
const PROJECT_SOURCE_ROOT_FILES = new Set([
  '.dockerignore',
  '.gitignore',
  'README.md',
  'eslint.config.mjs',
  'next.config.ts',
  'package-lock.json',
  'package.json',
  'tsconfig.json',
  'vite.config.ts',
  'vitest.config.ts',
]);

const root = process.cwd();
await clearPublishedReports(root);
const rawPaths = gitPaths(root);
const sourceFiles = selectProjectSourceFiles(rawPaths);
const captured = await captureSource(root, sourceFiles);
assertCiCommitBinding(root, sourceFiles, captured);
const sourceManifest = Object.fromEntries(sourceFiles.map((relativePath) => [relativePath, captured.get(relativePath).digest]));
const artifactDigest = computeArtifactDigest(sourceFiles, captured);
let snapshotRoot;

try {
  snapshotRoot = await mkdtemp(path.join(root, SNAPSHOT_PREFIX));
  await chmod(snapshotRoot, 0o700);
  await materializeSnapshot(snapshotRoot, sourceFiles, captured);
  const control = {
    schemaVersion: 'tf.evaluator-snapshot/0.1',
    rawPaths,
    sourceFiles,
    sourceManifest,
    artifactDigest,
  };
  await writeExclusive(path.join(snapshotRoot, '.tailing-sentinel-control.json'), Buffer.from(`${JSON.stringify(control)}\n`), 0o400);

  const workerEnvironment = {
    LANG: 'C',
    LC_ALL: 'C',
    TAILING_SENTINEL_SNAPSHOT: '1',
  };
  for (const name of [
    'GITHUB_SHA',
    'TAILING_INSTALL_STATUS',
    'TAILING_LINT_STATUS',
    'TAILING_TYPECHECK_STATUS',
    'TAILING_TEST_STATUS',
    'TAILING_ATOMISTIC_MANIFEST_STATUS',
    'TAILING_BUILD_STATUS',
    'TAILING_AUDIT_STATUS',
  ]) if (process.env[name] !== undefined) workerEnvironment[name] = process.env[name];
  const worker = spawnSync(process.execPath, [path.join(snapshotRoot, 'scripts', 'evaluate-worker.mjs')], {
    cwd: snapshotRoot,
    env: workerEnvironment,
    stdio: 'inherit',
    timeout: EVALUATOR_WORKER_TIMEOUT_MS,
  });
  if (worker.error) throw worker.error;
  if (worker.signal) throw new Error(`Evaluator worker ended with signal ${worker.signal}.`);

  const currentRawPaths = gitPaths(root, path.basename(snapshotRoot));
  const currentSourceFiles = selectProjectSourceFiles(currentRawPaths);
  const current = await captureSource(root, currentSourceFiles);
  assertCiCommitBinding(root, currentSourceFiles, current);
  const drift = describeDrift(sourceFiles, captured, currentSourceFiles, current);
  if (drift) throw new Error(drift);

  const reportJson = await readBoundedRegularFile(path.join(snapshotRoot, 'evaluation', 'latest-report.json'), MAX_REPORT_JSON_BYTES);
  const reportMarkdown = await readBoundedRegularFile(path.join(snapshotRoot, 'evaluation', 'latest-report.md'), MAX_REPORT_MARKDOWN_BYTES);
  const report = validateWorkerReport(reportJson, reportMarkdown, sourceFiles, sourceManifest, artifactDigest, worker.status);
  const publicSummary = buildPublicSummary(report);
  const publicProductEvaluation = buildPublicProductEvaluation(
    report,
    capturedJson(captured, 'evaluation/current-scorecard.json'),
    capturedJson(captured, 'evaluation/baselines/registry.json'),
  );
  await publishReports(
    root,
    reportJson,
    reportMarkdown,
    publicSummary,
    publicProductEvaluation,
  );
  process.exitCode = worker.status ?? 1;
} catch (error) {
  console.error(`HARD GATE: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
} finally {
  if (snapshotRoot) {
    const expectedParent = `${path.resolve(root)}${path.sep}`;
    const resolvedSnapshot = path.resolve(snapshotRoot);
    if (!resolvedSnapshot.startsWith(expectedParent) || !path.basename(resolvedSnapshot).startsWith(SNAPSHOT_PREFIX)) {
      throw new Error('Refusing to clean an invalid evaluator snapshot path.');
    }
    await rm(resolvedSnapshot, { force: true, recursive: true });
  }
}

function gitPaths(repositoryRoot, privateSnapshotDirectory) {
  const output = execFileSync(TRUSTED_GIT, ['-c', 'core.excludesFile=/dev/null', 'ls-files', '--cached', '--others', '--exclude-standard', '-z'], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: GIT_ENVIRONMENT,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const records = output.split('\0').filter(Boolean);
  if (records.length > 4096 || new Set(records).size !== records.length) {
    throw new Error('Git source path inventory contains a duplicate, malformed or platform-ambiguous path.');
  }
  const paths = [];
  for (const record of records) {
    if (privateSnapshotDirectory
      && (record === `${privateSnapshotDirectory}/` || record.startsWith(`${privateSnapshotDirectory}/`))) continue;
    // Git represents an adjacent, untracked repository as a trailing-slash
    // directory marker. Only a safe marker outside every declared source root
    // is adjacent; a marker inside the project would conceal build inputs.
    if (record.endsWith('/')) {
      const directory = record.slice(0, -1);
      if (!isSafeRepositoryPath(directory) || isPotentialProjectSourceDirectory(directory)) {
        throw new Error('Git source path inventory contains a duplicate, malformed or platform-ambiguous path.');
      }
      continue;
    }
    if (!isSafeRepositoryPath(record)) {
      throw new Error('Git source path inventory contains a duplicate, malformed or platform-ambiguous path.');
    }
    if (!isPotentialProjectSourcePath(record)) {
      throw new Error(`Git file is outside the declared project source roots: ${record}.`);
    }
    paths.push(record);
  }
  return paths;
}

function isPotentialProjectSourcePath(relativePath) {
  return typeof relativePath === 'string'
    && (PROJECT_SOURCE_ROOT_FILES.has(relativePath)
      || !relativePath.includes('/')
      || PROJECT_SOURCE_DIRECTORIES.some((prefix) => relativePath.startsWith(prefix)));
}

function isPotentialProjectSourceDirectory(relativePath) {
  return PROJECT_SOURCE_DIRECTORIES.some((prefix) => relativePath === prefix.slice(0, -1) || relativePath.startsWith(prefix));
}

function assertCiCommitBinding(repositoryRoot, currentSourceFiles, currentEntries) {
  const revision = process.env.GITHUB_SHA;
  if (revision === undefined) return;
  if (!/^[0-9a-f]{40}$/.test(revision)) throw new Error('GITHUB_SHA is not one full lowercase commit ID.');
  const revisionType = execFileSync(TRUSTED_GIT, ['cat-file', '-t', revision], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: GIT_ENVIRONMENT,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
  if (revisionType !== 'commit') throw new Error(`GITHUB_SHA ${revision} is not a commit object.`);
  const treeOutput = execFileSync(TRUSTED_GIT, ['ls-tree', '-r', '-z', '--full-tree', revision], {
    cwd: repositoryRoot,
    encoding: 'utf8',
    env: GIT_ENVIRONMENT,
    maxBuffer: 16 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const tree = new Map();
  for (const record of treeOutput.split('\0').filter(Boolean)) {
    const separator = record.indexOf('\t');
    const header = separator < 0 ? [] : record.slice(0, separator).split(' ');
    const relativePath = separator < 0 ? '' : record.slice(separator + 1);
    if (header.length !== 3 || !/^[0-7]{6}$/.test(header[0]) || !/^[0-9a-f]{40,64}$/.test(header[2]) || !isSafeRepositoryPath(relativePath)) {
      throw new Error(`GITHUB_SHA ${revision} has an invalid source-tree entry: ${relativePath || '<unparsed>'}.`);
    }
    if (isProjectSourcePath(relativePath)) tree.set(relativePath, { mode: header[0], objectId: header[2], type: header[1] });
  }
  const committedSourceFiles = selectProjectSourceFiles([...tree.keys()]);
  if (JSON.stringify(committedSourceFiles) !== JSON.stringify(currentSourceFiles)) {
    throw new Error(`Evaluator source path set is not bound to GITHUB_SHA ${revision}.`);
  }
  for (const relativePath of currentSourceFiles) {
    const committed = tree.get(relativePath);
    const current = currentEntries.get(relativePath);
    if (!committed || committed.type !== 'blob' || !['100644', '100755'].includes(committed.mode)) {
      throw new Error(`GITHUB_SHA ${revision} source is not a regular executable or non-executable blob: ${relativePath}.`);
    }
    const committedBytes = execFileSync(TRUSTED_GIT, ['cat-file', 'blob', committed.objectId], {
      cwd: repositoryRoot,
      encoding: 'buffer',
      env: GIT_ENVIRONMENT,
      maxBuffer: MAX_SOURCE_FILE_BYTES + 1,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const committedDigest = `sha256:${createHash('sha256').update(committedBytes).digest('hex')}`;
    const currentExecutable = (current.mode & 0o111) !== 0;
    if (committedBytes.length !== current.byteLength
      || committedDigest !== current.digest
      || currentExecutable !== (committed.mode === '100755')) {
      throw new Error(`Evaluator raw source blob or executable mode is not bound to GITHUB_SHA ${revision}: ${relativePath}.`);
    }
  }
}

function isProjectSourcePath(relativePath) {
  if (!isSafeRepositoryPath(relativePath)) return false;
  return PROJECT_SOURCE_ROOT_FILES.has(relativePath)
    || !relativePath.includes('/')
    || PROJECT_SOURCE_DIRECTORIES.some((prefix) => relativePath.startsWith(prefix));
}

function isSafeRepositoryPath(relativePath) {
  return typeof relativePath === 'string'
    && relativePath.length > 0
    && !relativePath.includes('\\')
    && !/[\u0000-\u001f\u007f]/.test(relativePath)
    && !path.isAbsolute(relativePath)
    && relativePath.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

function selectProjectSourceFiles(relativePaths) {
  return [...new Set(relativePaths.filter(isProjectSourcePath))]
    .filter((relativePath) => relativePath !== 'evaluation/latest-report.json'
      && relativePath !== 'evaluation/latest-report.md'
      && relativePath !== 'evaluation/public-summary.json'
      && relativePath !== 'evaluation/public-product-evaluation.json')
    .sort();
}

function sameIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

async function captureSource(repositoryRoot, relativePaths) {
  const entries = new Map();
  let totalBytes = 0;
  const canonicalRoot = await realpath(repositoryRoot);
  for (const relativePath of relativePaths) {
    const absolutePath = path.join(repositoryRoot, relativePath);
    const before = await lstat(absolutePath, { bigint: true });
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n) {
      throw new Error(`Project source must be one regular non-symlink file: ${relativePath}.`);
    }
    if (before.size > BigInt(MAX_SOURCE_FILE_BYTES)) throw new Error(`Project source exceeds the per-file limit: ${relativePath}.`);
    const expectedCanonicalPath = path.join(canonicalRoot, ...relativePath.split('/'));
    if (await realpath(absolutePath) !== expectedCanonicalPath) throw new Error(`Project source crosses a symlink boundary: ${relativePath}.`);
    const handle = await open(absolutePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    try {
      const opened = await handle.stat({ bigint: true });
      if (!sameIdentity(before, opened)) throw new Error(`Project source changed before capture: ${relativePath}.`);
      const content = await readExactFile(handle, Number(before.size), `Project source ${relativePath}`);
      const after = await handle.stat({ bigint: true });
      if (!sameIdentity(before, after) || BigInt(content.length) !== before.size) {
        throw new Error(`Project source changed during capture: ${relativePath}.`);
      }
      if (await realpath(absolutePath) !== expectedCanonicalPath) throw new Error(`Project source crossed a symlink boundary during capture: ${relativePath}.`);
      totalBytes += content.length;
      if (totalBytes > MAX_SOURCE_SNAPSHOT_BYTES) throw new Error('Project source exceeds the total snapshot limit.');
      entries.set(relativePath, {
        byteLength: content.length,
        content,
        digest: `sha256:${createHash('sha256').update(content).digest('hex')}`,
        mode: Number(before.mode & 0o777n),
      });
    } finally {
      await handle.close();
    }
  }
  return entries;
}

function computeArtifactDigest(relativePaths, entries) {
  const digest = createHash('sha256');
  for (const relativePath of relativePaths) {
    const entry = entries.get(relativePath);
    digest.update(`${relativePath.length}:${relativePath}:${entry.byteLength}:${entry.digest}\n`);
  }
  return `sha256:${digest.digest('hex')}`;
}

async function materializeSnapshot(destinationRoot, relativePaths, entries) {
  for (const relativePath of relativePaths) {
    const destination = path.join(destinationRoot, relativePath);
    await mkdir(path.dirname(destination), { mode: 0o700, recursive: true });
    await writeExclusive(destination, entries.get(relativePath).content, 0o400);
  }
}

async function writeExclusive(destination, content, finalMode) {
  const handle = await open(destination, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0), 0o600);
  try {
    await handle.writeFile(content);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await chmod(destination, finalMode);
}

function describeDrift(expectedPaths, expected, actualPaths, actual) {
  const expectedSet = new Set(expectedPaths);
  const actualSet = new Set(actualPaths);
  const added = actualPaths.filter((relativePath) => !expectedSet.has(relativePath));
  const removed = expectedPaths.filter((relativePath) => !actualSet.has(relativePath));
  const changed = expectedPaths.filter((relativePath) => {
    const current = actual.get(relativePath);
    const prior = expected.get(relativePath);
    return current && (current.digest !== prior.digest || current.byteLength !== prior.byteLength || current.mode !== prior.mode);
  });
  const sections = [];
  for (const [label, values] of [['added', added], ['removed', removed], ['changed', changed]]) {
    if (values.length) sections.push(`${label}=[${values.slice(0, 8).join(', ')}${values.length > 8 ? `, +${values.length - 8} more` : ''}]`);
  }
  return sections.length ? `Project source changed during frozen evaluation: ${sections.join('; ')}.` : null;
}

async function readBoundedRegularFile(absolutePath, maximumBytes) {
  const before = await lstat(absolutePath, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size < 1n || before.size > BigInt(maximumBytes)) {
    throw new Error(`Evaluator report is missing, unsafe or outside its size limit: ${path.basename(absolutePath)}.`);
  }
  const handle = await open(absolutePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat({ bigint: true });
    if (!sameIdentity(before, opened)) throw new Error(`Evaluator report changed before read: ${path.basename(absolutePath)}.`);
    const content = await readExactFile(handle, Number(before.size), `Evaluator report ${path.basename(absolutePath)}`);
    const after = await handle.stat({ bigint: true });
    if (!sameIdentity(before, after) || BigInt(content.length) !== before.size) throw new Error(`Evaluator report changed during read: ${path.basename(absolutePath)}.`);
    return content;
  } finally {
    await handle.close();
  }
}

async function readExactFile(handle, expectedBytes, label) {
  const content = Buffer.allocUnsafe(expectedBytes);
  let offset = 0;
  while (offset < expectedBytes) {
    const { bytesRead } = await handle.read(content, offset, expectedBytes - offset, offset);
    if (bytesRead === 0) throw new Error(`${label} became shorter during its bounded read.`);
    offset += bytesRead;
  }
  const probe = Buffer.allocUnsafe(1);
  if ((await handle.read(probe, 0, 1, expectedBytes)).bytesRead !== 0) {
    throw new Error(`${label} grew during its bounded read.`);
  }
  return content;
}

function validateWorkerReport(reportJson, reportMarkdown, relativePaths, manifest, digest, workerStatus) {
  let report;
  try {
    report = JSON.parse(reportJson.toString('utf8'));
  } catch {
    throw new Error('Evaluator worker produced malformed JSON.');
  }
  if (report.artifactDigest !== digest
    || report.sourceFileCount !== relativePaths.length
    || JSON.stringify(report.sourceManifest) !== JSON.stringify(manifest)
    || report.sourceRevision !== (process.env.GITHUB_SHA ?? null)) {
    throw new Error('Evaluator worker report is not bound to the frozen source snapshot.');
  }
  if (!Array.isArray(report.hardGateFailures) || !['accept', 'conditional', 'reject'].includes(report.verdict)) {
    throw new Error('Evaluator worker report has an invalid verdict contract.');
  }
  const successful = workerStatus === 0 && report.hardGateFailures.length === 0 && report.verdict !== 'reject';
  const rejected = Number.isInteger(workerStatus) && workerStatus !== 0 && report.hardGateFailures.length > 0 && report.verdict === 'reject';
  if (!successful && !rejected) throw new Error(`Evaluator worker exit/report mismatch (${String(workerStatus)} / ${String(report.verdict)}).`);
  const markdown = reportMarkdown.toString('utf8');
  if (!markdown.includes(`Verdict: **${report.verdict.toUpperCase()}**`) || !markdown.includes(report.artifactDigest)) {
    throw new Error('Evaluator Markdown is not bound to the JSON verdict and artifact.');
  }
  return report;
}

function buildPublicSummary(report) {
  if (!Array.isArray(report.gaps) || report.gaps.length > 3) {
    throw new Error('Evaluator report gaps cannot be projected into the bounded public summary.');
  }
  const gaps = report.gaps.map((gap) => {
    if (!gap || typeof gap !== 'object'
      || !PUBLIC_GAP_SEVERITIES.has(gap.severity)
      || !PUBLIC_GAP_DIMENSIONS.has(gap.dimension)) {
      throw new Error('Evaluator report contains an invalid public gap identifier.');
    }
    return { severity: gap.severity, dimension: gap.dimension };
  });
  if (new Set(gaps.map((gap) => gap.dimension)).size !== gaps.length) {
    throw new Error('Evaluator report contains duplicate public gap identifiers.');
  }
  const summary = {
    artifactDigest: report.artifactDigest,
    verdict: report.verdict,
    gaps,
  };
  const bytes = Buffer.from(`${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  if (bytes.length > MAX_PUBLIC_SUMMARY_BYTES) throw new Error('Evaluator public summary exceeds its size limit.');
  return bytes;
}

function capturedJson(entries, relativePath) {
  const entry = entries.get(relativePath);
  if (!entry || !Buffer.isBuffer(entry.content)) {
    throw new Error(`Evaluator public product projection source is missing: ${relativePath}.`);
  }
  try {
    return JSON.parse(entry.content.toString('utf8'));
  } catch {
    throw new Error(`Evaluator public product projection source is malformed: ${relativePath}.`);
  }
}

function buildPublicProductEvaluation(report, scorecard, registry) {
  if (!report || typeof report !== 'object'
    || !/^sha256:[0-9a-f]{64}$/.test(report.artifactDigest ?? '')) {
    throw new Error('Evaluator public product projection lacks a bound source artifact digest.');
  }
  if (!scorecard || typeof scorecard !== 'object' || Array.isArray(scorecard)
    || !isPublicIdentifier(scorecard.candidateVersion, 128)
    || !Array.isArray(scorecard.dimensions)
    || scorecard.dimensions.length !== PUBLIC_SCORECARD_DIMENSION_IDS.length) {
    throw new Error('Evaluator scorecard cannot enter the public product projection.');
  }
  const dimensions = scorecard.dimensions.map((dimension, index) => {
    const expectedId = PUBLIC_SCORECARD_DIMENSION_IDS[index];
    if (!dimension || typeof dimension !== 'object' || Array.isArray(dimension)
      || dimension.id !== expectedId
      || !isPublicText(dimension.displayLabel, 96)
      || !Number.isSafeInteger(dimension.weight)
      || dimension.weight < 0
      || dimension.weight > 100
      || !Number.isSafeInteger(dimension.score)
      || dimension.score < 0
      || dimension.score > 4
      || !isPublicText(dimension.summary, 256)) {
      throw new Error(`Evaluator scorecard dimension cannot enter the public product projection: ${expectedId}.`);
    }
    return {
      id: dimension.id,
      displayLabel: dimension.displayLabel,
      weight: dimension.weight,
      score: dimension.score,
      summary: dimension.summary,
    };
  });
  if (dimensions.reduce((total, dimension) => total + dimension.weight, 0) !== 100) {
    throw new Error('Evaluator public scorecard weights must total 100.');
  }
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)
    || !/^\d{4}-\d{2}-\d{2}$/.test(registry.snapshotDate ?? '')
    || !Array.isArray(registry.comparators)
    || registry.comparators.length !== PUBLIC_COMPARATOR_IDS.length) {
    throw new Error('Evaluator comparator registry cannot enter the public product projection.');
  }
  const items = registry.comparators.map((comparator, index) => {
    const expectedId = PUBLIC_COMPARATOR_IDS[index];
    if (!comparator || typeof comparator !== 'object' || Array.isArray(comparator)
      || comparator.id !== expectedId
      || !isPublicText(comparator.name, 128)
      || !isPublicText(comparator.scope, 256)
      || !PUBLIC_COMPARATOR_EVIDENCE_CLASSES.has(comparator.evidenceClass)) {
      throw new Error(`Evaluator comparator cannot enter the public product projection: ${expectedId}.`);
    }
    return {
      id: comparator.id,
      name: comparator.name,
      scope: comparator.scope,
      evidenceClass: comparator.evidenceClass,
    };
  });
  const projection = {
    schemaVersion: PUBLIC_PRODUCT_EVALUATION_VERSION,
    sourceArtifactDigest: report.artifactDigest,
    scorecard: {
      candidateVersion: scorecard.candidateVersion,
      dimensions,
    },
    comparators: {
      snapshotDate: registry.snapshotDate,
      items,
    },
  };
  const bytes = Buffer.from(`${JSON.stringify(projection, null, 2)}\n`, 'utf8');
  if (bytes.length < 2
    || bytes.length > MAX_PUBLIC_PRODUCT_EVALUATION_BYTES
    || bytes.includes(0)) {
    throw new Error('Evaluator public product projection exceeds its byte contract.');
  }
  return bytes;
}

function isPublicIdentifier(value, maximumLength) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maximumLength
    && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

function isPublicText(value, maximumLength) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maximumLength
    && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value);
}

async function publishReports(
  repositoryRoot,
  reportJson,
  reportMarkdown,
  publicSummary,
  publicProductEvaluation,
) {
  const evaluationDirectory = await safeEvaluationDirectory(repositoryRoot);
  for (const name of [
    'latest-report.json',
    'latest-report.md',
    'public-summary.json',
    'public-product-evaluation.json',
  ]) {
    const target = path.join(evaluationDirectory, name);
    try {
      const metadata = await lstat(target);
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) throw new Error(`${name} is not one regular output file.`);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  const token = randomUUID();
  const jsonTemporary = path.join(evaluationDirectory, `.latest-report-${token}.json.tmp`);
  const markdownTemporary = path.join(evaluationDirectory, `.latest-report-${token}.md.tmp`);
  const publicSummaryTemporary = path.join(evaluationDirectory, `.public-summary-${token}.json.tmp`);
  const publicProductEvaluationTemporary = path.join(
    evaluationDirectory,
    `.public-product-evaluation-${token}.json.tmp`,
  );
  try {
    await writeExclusive(jsonTemporary, reportJson, 0o600);
    await writeExclusive(markdownTemporary, reportMarkdown, 0o600);
    await writeExclusive(publicSummaryTemporary, publicSummary, 0o600);
    await writeExclusive(publicProductEvaluationTemporary, publicProductEvaluation, 0o600);
    await rename(markdownTemporary, path.join(evaluationDirectory, 'latest-report.md'));
    await rename(jsonTemporary, path.join(evaluationDirectory, 'latest-report.json'));
    await rename(publicSummaryTemporary, path.join(evaluationDirectory, 'public-summary.json'));
    await rename(
      publicProductEvaluationTemporary,
      path.join(evaluationDirectory, 'public-product-evaluation.json'),
    );
  } finally {
    await Promise.all([
      rm(jsonTemporary, { force: true }),
      rm(markdownTemporary, { force: true }),
      rm(publicSummaryTemporary, { force: true }),
      rm(publicProductEvaluationTemporary, { force: true }),
    ]);
  }
}

async function clearPublishedReports(repositoryRoot) {
  const evaluationDirectory = await safeEvaluationDirectory(repositoryRoot);
  for (const name of [
    'latest-report.json',
    'latest-report.md',
    'public-summary.json',
    'public-product-evaluation.json',
  ]) {
    const target = path.join(evaluationDirectory, name);
    try {
      const metadata = await lstat(target);
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) throw new Error(`${name} is not one regular output file.`);
      await unlink(target);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

async function safeEvaluationDirectory(repositoryRoot) {
  const canonicalRoot = await realpath(repositoryRoot);
  const evaluationDirectory = path.join(repositoryRoot, 'evaluation');
  const canonicalEvaluation = await realpath(evaluationDirectory);
  if (canonicalEvaluation !== path.join(canonicalRoot, 'evaluation')) throw new Error('Evaluation output directory crosses a symlink boundary.');
  return evaluationDirectory;
}
