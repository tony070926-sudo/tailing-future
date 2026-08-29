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
    timeout: 10 * 60 * 1000,
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
  validateWorkerReport(reportJson, reportMarkdown, sourceFiles, sourceManifest, artifactDigest, worker.status);
  await publishReports(root, reportJson, reportMarkdown);
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
      && relativePath !== 'evaluation/latest-report.md')
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
}

async function publishReports(repositoryRoot, reportJson, reportMarkdown) {
  const evaluationDirectory = await safeEvaluationDirectory(repositoryRoot);
  for (const name of ['latest-report.json', 'latest-report.md']) {
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
  try {
    await writeExclusive(jsonTemporary, reportJson, 0o600);
    await writeExclusive(markdownTemporary, reportMarkdown, 0o600);
    await rename(markdownTemporary, path.join(evaluationDirectory, 'latest-report.md'));
    await rename(jsonTemporary, path.join(evaluationDirectory, 'latest-report.json'));
  } finally {
    await Promise.all([
      rm(jsonTemporary, { force: true }),
      rm(markdownTemporary, { force: true }),
    ]);
  }
}

async function clearPublishedReports(repositoryRoot) {
  const evaluationDirectory = await safeEvaluationDirectory(repositoryRoot);
  for (const name of ['latest-report.json', 'latest-report.md']) {
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
