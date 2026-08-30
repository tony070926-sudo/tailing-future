import { createHash } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { lstat, realpath } from 'node:fs/promises';
import path from 'node:path';
import { TextDecoder } from 'node:util';

export const SOURCE_TREE_IDENTITY_PROTOCOL = 'tf.git-source-tree/v1';
export const SOURCE_TREE_TOPOLOGY_PROTOCOL = 'tf.git-source-tree/topology/v1';
export const MAX_SOURCE_TREE_BLOB_BYTES = 32 * 1024 * 1024;
export const MAX_SOURCE_TREE_TOTAL_BYTES = 128 * 1024 * 1024;

const MAX_TREE_LISTING_BYTES = 32 * 1024 * 1024;
const MAX_TREE_OBJECT_BYTES = 32 * 1024 * 1024;
const MAX_TREE_ENTRIES = 100_000;
const MAX_PATH_BYTES = 4_096;
const MAX_GIT_DIAGNOSTIC_BYTES = 64 * 1024;
const GIT_TIMEOUT_MS = 120_000;
const REVISION_PATTERN = /^[0-9a-f]{40}$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const REGULAR_BLOB_MODES = new Set(['100644', '100755']);
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });
const NULL_DEVICE = process.platform === 'win32' ? 'NUL' : '/dev/null';
const GIT_EXECUTABLE = process.platform === 'win32' ? 'git.exe' : '/usr/bin/git';

/**
 * Derive a content-strong identity for every tracked file in one Git commit.
 *
 * Tree topology has its own binary NUL-framed sub-manifest. It begins with
 * SOURCE_TREE_TOPOLOGY_PROTOCOL and NUL. The root tree (empty path) and every
 * recursively reachable tree entry are then ordered by raw UTF-8 path bytes and
 * encoded as:
 *
 *   <decimal path byte length>:<path bytes> NUL
 *   <decimal raw tree size> NUL <40-hex tree oid> NUL <raw-tree sha256> NUL
 *
 * Each tree SHA-256 is computed over the exact raw tree object bytes read from
 * Git's object database. Thus the topology commitment does not depend on SHA-1
 * collision resistance; the tree OID is retained only as an auditable locator.
 * topologyDigest is SHA-256 over the exact topology sub-manifest.
 *
 * The canonical source manifest begins with SOURCE_TREE_IDENTITY_PROTOCOL and
 * NUL, then `topology`, NUL, topologyDigest, and NUL. Each regular file follows,
 * ordered by its raw UTF-8 path bytes and encoded as:
 *
 *   <decimal path byte length>:<path bytes> NUL
 *   <mode> NUL <decimal size> NUL <40-hex blob oid> NUL <sha256 digest> NUL
 *
 * treeDigest is SHA-256 over exactly those canonical source-manifest bytes. The
 * revision is deliberately not part of treeDigest: callers bind revision and
 * treeDigest as separate source-identity fields.
 */
export async function deriveGitSourceTreeIdentity(root, commit, options = {}) {
  const canonicalRoot = await canonicalRepositoryRoot(root);
  requireRevision(commit, 'commit');
  const verifierRevision = options.verifierRevision ?? null;
  if (verifierRevision !== null) requireRevision(verifierRevision, 'verifierRevision');
  const limits = validatedLimits(options);

  await requireCommit(canonicalRoot, commit, 'source commit');
  const rootTreeObjectId = await resolveRootTree(canonicalRoot, commit);
  await requireStrictTreeObjects(canonicalRoot, rootTreeObjectId);
  if (verifierRevision !== null) {
    await requireCommit(canonicalRoot, verifierRevision, 'verifier revision');
    await requireAncestor(canonicalRoot, commit, verifierRevision);
  }

  const listing = await runGit(canonicalRoot, [
    'ls-tree', '-r', '-t', '-z', '--full-tree', '-l', commit,
  ], MAX_TREE_LISTING_BYTES);
  const listed = parseTreeListing(listing, limits);
  const totalBytes = listed.files.reduce((sum, entry) => sum + entry.sizeBytes, 0);
  const blobDigests = await readObjectDigests(canonicalRoot, listed.files.map((entry) => ({
    objectId: entry.blobObjectId,
    sizeBytes: entry.sizeBytes,
  })), {
    expectedType: 'blob',
    maximumPayloadBytes: totalBytes,
    label: 'blob',
  });
  const entries = Object.freeze(listed.files.map((entry, index) => Object.freeze({
    path: entry.path,
    mode: entry.mode,
    sizeBytes: entry.sizeBytes,
    blobObjectId: entry.blobObjectId,
    sha256: blobDigests[index].sha256,
  })));

  const treeReferences = [{
    path: '', rawPath: Buffer.alloc(0), treeObjectId: rootTreeObjectId,
  }, ...listed.trees];
  treeReferences.sort((left, right) => Buffer.compare(left.rawPath, right.rawPath));
  const uniqueTreeObjectIds = [...new Set(treeReferences.map((entry) => entry.treeObjectId))].sort();
  const treeDigests = await readObjectDigests(canonicalRoot, uniqueTreeObjectIds.map((objectId) => ({
    objectId,
  })), {
    expectedType: 'tree',
    maximumPayloadBytes: MAX_TREE_OBJECT_BYTES,
    label: 'tree object',
  });
  const treeDigestByObjectId = new Map(uniqueTreeObjectIds.map((objectId, index) => [
    objectId,
    treeDigests[index],
  ]));
  const treeEntries = Object.freeze(treeReferences.map((entry) => {
    const digest = treeDigestByObjectId.get(entry.treeObjectId);
    if (!digest) throw new Error(`Git tree object ${entry.treeObjectId} was not read`);
    return Object.freeze({
      path: entry.path,
      sizeBytes: digest.sizeBytes,
      treeObjectId: entry.treeObjectId,
      sha256: digest.sha256,
    });
  }));
  const topologyBytes = buildCanonicalTopology(treeEntries);
  const topologyDigest = sha256(topologyBytes);
  const manifestBytes = buildCanonicalManifest(topologyDigest, entries);
  const treeDigest = sha256(manifestBytes);

  return Object.freeze({
    protocol: SOURCE_TREE_IDENTITY_PROTOCOL,
    revision: commit,
    verifierRevision,
    rootTreeObjectId,
    topologyDigest,
    treeEntryCount: treeEntries.length,
    uniqueTreeObjectCount: uniqueTreeObjectIds.length,
    treeObjectBytes: treeDigests.reduce((sum, entry) => sum + entry.sizeBytes, 0),
    treeEntries,
    fileCount: entries.length,
    totalBytes,
    treeDigest,
    manifestByteLength: manifestBytes.length,
    entries,
    canonicalManifestBytes() {
      return Buffer.from(manifestBytes);
    },
    canonicalTopologyBytes() {
      return Buffer.from(topologyBytes);
    },
  });
}

async function canonicalRepositoryRoot(root) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) {
    throw new TypeError('repository root must be an absolute path');
  }
  const metadata = await lstat(root);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error('repository root must be a directory, not a symbolic link');
  }
  const canonicalRoot = await realpath(root);
  const topLevelBytes = await runGit(canonicalRoot, ['rev-parse', '--show-toplevel'], 8_192);
  const topLevel = trimSingleLf(topLevelBytes, 'Git top-level path').toString('utf8');
  if (await realpath(topLevel) !== canonicalRoot) {
    throw new Error('repository root must be the exact Git worktree top level');
  }
  return canonicalRoot;
}

function validatedLimits(options) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('source-tree options must be an object');
  }
  const allowed = new Set(['maxBlobBytes', 'maxTotalBytes', 'verifierRevision']);
  const unexpected = Object.keys(options).filter((key) => !allowed.has(key));
  if (unexpected.length > 0) throw new TypeError(`unexpected source-tree option: ${unexpected.sort()[0]}`);
  const blobBytes = options.maxBlobBytes ?? MAX_SOURCE_TREE_BLOB_BYTES;
  const totalBytes = options.maxTotalBytes ?? MAX_SOURCE_TREE_TOTAL_BYTES;
  if (!Number.isSafeInteger(blobBytes) || blobBytes < 0 || blobBytes > MAX_SOURCE_TREE_BLOB_BYTES) {
    throw new RangeError(`maxBlobBytes must be an integer from 0 to ${MAX_SOURCE_TREE_BLOB_BYTES}`);
  }
  if (!Number.isSafeInteger(totalBytes) || totalBytes < 0 || totalBytes > MAX_SOURCE_TREE_TOTAL_BYTES) {
    throw new RangeError(`maxTotalBytes must be an integer from 0 to ${MAX_SOURCE_TREE_TOTAL_BYTES}`);
  }
  return Object.freeze({ blobBytes, totalBytes });
}

function requireRevision(value, name) {
  if (typeof value !== 'string' || !REVISION_PATTERN.test(value)) {
    throw new TypeError(`${name} must be one full lowercase 40-hex commit`);
  }
}

async function requireCommit(root, revision, label) {
  let type;
  try {
    type = trimSingleLf(await runGit(root, ['cat-file', '-t', revision], 128), `${label} type`).toString('ascii');
  } catch (error) {
    throw new Error(`${label} is unavailable from the Git object database`, { cause: error });
  }
  if (type !== 'commit') throw new Error(`${label} does not identify a commit object`);
}

async function resolveRootTree(root, revision) {
  const treeObjectId = trimSingleLf(
    await runGit(root, ['rev-parse', '--verify', `${revision}^{tree}`], 128),
    'source root tree object ID',
  ).toString('ascii');
  if (!REVISION_PATTERN.test(treeObjectId)) throw new Error('source root tree object ID is not full 40-hex');
  return treeObjectId;
}

function requireStrictTreeObjects(root, treeObjectId) {
  return new Promise((resolve, reject) => {
    execFile(
      GIT_EXECUTABLE,
      [
        '--no-replace-objects', '-C', root, 'fsck', '--strict', '--no-dangling',
        '--no-reflogs', '--no-progress', '--no-cache', treeObjectId,
      ],
      {
        encoding: null,
        env: gitEnvironment(),
        maxBuffer: MAX_GIT_DIAGNOSTIC_BYTES,
        timeout: GIT_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error('Git source tree failed strict object validation', {
            cause: new GitCommandError('fsck --strict', error.code, stderr),
          }));
          return;
        }
        if (stdout.length !== 0 || stderr.length !== 0) {
          const diagnostic = sanitizedDiagnostic(Buffer.concat([stdout, stderr]));
          reject(new Error(`Git source tree failed strict object validation${diagnostic ? `: ${diagnostic}` : ''}`));
          return;
        }
        resolve();
      },
    );
  });
}

async function requireAncestor(root, sourceRevision, verifierRevision) {
  try {
    await runGit(root, ['merge-base', '--is-ancestor', sourceRevision, verifierRevision], 128);
  } catch (error) {
    if (error instanceof GitCommandError && error.exitCode === 1) {
      throw new Error('source commit is not an ancestor of the verifier revision', { cause: error });
    }
    throw new Error('source/verifier ancestry could not be verified', { cause: error });
  }
}

function parseTreeListing(listing, limits) {
  if (!Buffer.isBuffer(listing)) throw new TypeError('Git tree listing must be raw bytes');
  if (listing.length === 0) return { files: [], trees: [] };
  if (listing.at(-1) !== 0) throw new Error('Git tree listing is not terminated by NUL');
  const records = splitNulRecords(listing);
  if (records.length > MAX_TREE_ENTRIES) throw new Error(`Git tree contains more than ${MAX_TREE_ENTRIES} entries`);

  const files = [];
  const trees = [];
  const observedPaths = new Set();
  let totalBytes = 0;
  for (const record of records) {
    const separator = record.indexOf(0x09);
    if (separator < 1 || record.indexOf(0x09, separator + 1) !== -1) {
      throw new Error('Git tree record does not contain one unambiguous header/path separator');
    }
    const headerBytes = record.subarray(0, separator);
    if ([...headerBytes].some((byte) => byte < 0x20 || byte > 0x7e)) {
      throw new Error('Git tree record header is not canonical ASCII');
    }
    const match = /^([0-7]{6}) ([a-z]+) ([0-9a-f]{40}) +([0-9]+|-)$/.exec(headerBytes.toString('ascii'));
    if (!match) throw new Error('Git tree record header is malformed');
    const [, mode, type, objectId, sizeText] = match;

    const rawPath = record.subarray(separator + 1);
    const canonicalPath = decodeCanonicalPath(rawPath);
    const pathKey = rawPath.toString('hex');
    if (observedPaths.has(pathKey)) throw new Error(`Git tree contains duplicate path: ${canonicalPath}`);
    observedPaths.add(pathKey);

    if (type === 'tree' && mode === '040000') {
      if (sizeText !== '-') throw new Error(`Git tree ${objectId} has an unexpected reported size`);
      trees.push({
        path: canonicalPath,
        rawPath: Buffer.from(rawPath),
        treeObjectId: objectId,
      });
      continue;
    }
    if (type !== 'blob' || !REGULAR_BLOB_MODES.has(mode)) {
      throw new Error(`Git tree contains a non-regular entry mode/type: ${mode} ${type}`);
    }
    if (sizeText === '-') throw new Error(`Git tree blob ${objectId} has no available size`);
    const size = BigInt(sizeText);
    if (size > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error('Git tree blob size exceeds the safe integer range');
    const sizeBytes = Number(size);
    if (sizeBytes > limits.blobBytes) throw new Error(`Git tree blob exceeds the ${limits.blobBytes}-byte per-file limit`);
    totalBytes += sizeBytes;
    if (!Number.isSafeInteger(totalBytes) || totalBytes > limits.totalBytes) {
      throw new Error(`Git tree exceeds the ${limits.totalBytes}-byte total limit`);
    }
    files.push({
      path: canonicalPath,
      rawPath: Buffer.from(rawPath),
      mode,
      sizeBytes,
      blobObjectId: objectId,
    });
  }

  files.sort((left, right) => Buffer.compare(left.rawPath, right.rawPath));
  trees.sort((left, right) => Buffer.compare(left.rawPath, right.rawPath));
  return { files, trees };
}

function splitNulRecords(value) {
  const records = [];
  let start = 0;
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== 0) continue;
    if (index === start) throw new Error('Git tree listing contains an empty record');
    records.push(value.subarray(start, index));
    start = index + 1;
  }
  if (start !== value.length) throw new Error('Git tree listing has unterminated trailing bytes');
  return records;
}

function decodeCanonicalPath(rawPath) {
  if (rawPath.length < 1 || rawPath.length > MAX_PATH_BYTES) {
    throw new Error(`Git tree path must contain 1 to ${MAX_PATH_BYTES} bytes`);
  }
  let value;
  try {
    value = UTF8_DECODER.decode(rawPath);
  } catch (error) {
    throw new Error('Git tree path is not canonical UTF-8', { cause: error });
  }
  if (!Buffer.from(value, 'utf8').equals(rawPath) || value.normalize('NFC') !== value) {
    throw new Error('Git tree path is not canonical UTF-8 NFC');
  }
  if (value.includes('\\') || /[\p{Cc}\p{Cf}]/u.test(value)) {
    throw new Error('Git tree path contains a backslash or control character');
  }
  if (value.startsWith('/') || value.endsWith('/') || path.posix.normalize(value) !== value) {
    throw new Error('Git tree path is not a canonical relative path');
  }
  const parts = value.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) {
    throw new Error('Git tree path contains an empty, dot or parent segment');
  }
  return value;
}

async function readObjectDigests(root, objects, {
  expectedType,
  maximumPayloadBytes,
  label,
}) {
  if (objects.length === 0) return [];
  const request = Buffer.from(`${objects.map((entry) => entry.objectId).join('\n')}\n`, 'ascii');
  const maximumOutputBytes = maximumPayloadBytes + (objects.length * 128) + 1;
  const response = await runGitBatch(root, request, maximumOutputBytes);
  const digests = [];
  let offset = 0;
  let payloadBytes = 0;
  for (const entry of objects) {
    const newline = response.indexOf(0x0a, offset);
    if (newline < offset) throw new Error(`Git ${label} ${entry.objectId} response header is missing`);
    const headerBytes = response.subarray(offset, newline);
    if ([...headerBytes].some((byte) => byte < 0x20 || byte > 0x7e)) {
      throw new Error(`Git ${label} ${entry.objectId} response header is not ASCII`);
    }
    const match = /^([0-9a-f]{40}) ([a-z]+) ([0-9]+)$/.exec(headerBytes.toString('ascii'));
    if (!match || match[1] !== entry.objectId || match[2] !== expectedType) {
      throw new Error(`Git ${label} ${entry.objectId} is missing or differs from the tree entry`);
    }
    const size = BigInt(match[3]);
    if (size > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`Git ${label} size exceeds the safe integer range`);
    const sizeBytes = Number(size);
    if (entry.sizeBytes !== undefined && sizeBytes !== entry.sizeBytes) {
      throw new Error(`Git ${label} ${entry.objectId} size differs from the tree entry`);
    }
    payloadBytes += sizeBytes;
    if (!Number.isSafeInteger(payloadBytes) || payloadBytes > maximumPayloadBytes) {
      throw new Error(`Git ${label} bytes exceed the ${maximumPayloadBytes}-byte object-read limit`);
    }
    const contentStart = newline + 1;
    const contentEnd = contentStart + sizeBytes;
    if (contentEnd >= response.length || response[contentEnd] !== 0x0a) {
      throw new Error(`Git ${label} ${entry.objectId} bytes are truncated or overlong`);
    }
    const objectBytes = response.subarray(contentStart, contentEnd);
    if (objectBytes.length !== sizeBytes) throw new Error(`Git ${label} ${entry.objectId} size differs`);
    digests.push(Object.freeze({ sizeBytes, sha256: sha256(objectBytes) }));
    offset = contentEnd + 1;
  }
  if (offset !== response.length) throw new Error(`Git ${label} batch response contains unexpected trailing bytes`);
  return digests;
}

function buildCanonicalTopology(treeEntries) {
  const chunks = [Buffer.from(`${SOURCE_TREE_TOPOLOGY_PROTOCOL}\0`, 'ascii')];
  for (const entry of treeEntries) {
    if (!REVISION_PATTERN.test(entry.treeObjectId)) throw new Error('source tree object ID is malformed');
    if (!DIGEST_PATTERN.test(entry.sha256)) throw new Error('source tree object SHA-256 is malformed');
    const pathBytes = Buffer.from(entry.path, 'utf8');
    chunks.push(
      Buffer.from(`${pathBytes.length}:`, 'ascii'),
      pathBytes,
      Buffer.from(`\0${entry.sizeBytes}\0${entry.treeObjectId}\0${entry.sha256}\0`, 'ascii'),
    );
  }
  return Buffer.concat(chunks);
}

function buildCanonicalManifest(topologyDigest, entries) {
  if (!DIGEST_PATTERN.test(topologyDigest)) throw new Error('source topology SHA-256 is malformed');
  const chunks = [Buffer.from(`${SOURCE_TREE_IDENTITY_PROTOCOL}\0topology\0${topologyDigest}\0`, 'ascii')];
  for (const entry of entries) {
    if (!DIGEST_PATTERN.test(entry.sha256)) throw new Error('source-tree entry SHA-256 is malformed');
    const pathBytes = Buffer.from(entry.path, 'utf8');
    chunks.push(
      Buffer.from(`${pathBytes.length}:`, 'ascii'),
      pathBytes,
      Buffer.from(`\0${entry.mode}\0${entry.sizeBytes}\0${entry.blobObjectId}\0${entry.sha256}\0`, 'ascii'),
    );
  }
  return Buffer.concat(chunks);
}

function runGit(root, commandArguments, maxBuffer) {
  return new Promise((resolve, reject) => {
    execFile(
      GIT_EXECUTABLE,
      ['--no-replace-objects', '-C', root, ...commandArguments],
      {
        encoding: null,
        env: gitEnvironment(),
        maxBuffer,
        timeout: GIT_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          reject(new GitCommandError(commandArguments[0], error.code, stderr));
          return;
        }
        resolve(Buffer.from(stdout));
      },
    );
  });
}

function runGitBatch(root, request, maximumOutputBytes) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      GIT_EXECUTABLE,
      ['--no-replace-objects', '-C', root, 'cat-file', '--batch'],
      { env: gitEnvironment(), stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true },
    );
    const stdout = [];
    const stderr = [];
    let stdoutBytes = 0;
    let stderrBytes = 0;
    let failure = null;
    const timer = setTimeout(() => {
      failure = failure ?? new Error('Git blob batch read timed out');
      child.kill('SIGKILL');
    }, GIT_TIMEOUT_MS);

    child.stdout.on('data', (chunk) => {
      stdoutBytes += chunk.length;
      if (stdoutBytes > maximumOutputBytes) {
        failure = failure ?? new Error('Git blob batch response exceeded its exact bound');
        child.kill('SIGKILL');
        return;
      }
      stdout.push(Buffer.from(chunk));
    });
    child.stderr.on('data', (chunk) => {
      stderrBytes += chunk.length;
      if (stderrBytes <= MAX_GIT_DIAGNOSTIC_BYTES) stderr.push(Buffer.from(chunk));
      else {
        failure = failure ?? new Error('Git blob batch diagnostics exceeded their bound');
        child.kill('SIGKILL');
      }
    });
    child.once('error', (error) => {
      failure = failure ?? new Error('Git blob batch process could not start', { cause: error });
    });
    child.once('close', (code, signal) => {
      clearTimeout(timer);
      if (failure) {
        reject(failure);
        return;
      }
      if (code !== 0 || signal !== null) {
        reject(new GitCommandError('cat-file --batch', code, Buffer.concat(stderr)));
        return;
      }
      resolve(Buffer.concat(stdout, stdoutBytes));
    });
    child.stdin.on('error', (error) => {
      failure = failure ?? new Error('Git blob batch request could not be written', { cause: error });
    });
    child.stdin.end(request);
  });
}

function gitEnvironment() {
  const environment = {
    LANG: 'C',
    LC_ALL: 'C',
    GIT_CONFIG_GLOBAL: NULL_DEVICE,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_CONFIG_SYSTEM: NULL_DEVICE,
    GIT_NO_REPLACE_OBJECTS: '1',
    GIT_NO_LAZY_FETCH: '1',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
  };
  if (process.platform === 'win32') {
    if (process.env.SystemRoot) environment.SystemRoot = process.env.SystemRoot;
    if (process.env.ComSpec) environment.ComSpec = process.env.ComSpec;
  }
  return environment;
}

function trimSingleLf(value, label) {
  if (!Buffer.isBuffer(value) || value.length < 2 || value.at(-1) !== 0x0a || value.subarray(0, -1).includes(0x0a)) {
    throw new Error(`${label} is not one LF-terminated value`);
  }
  return value.subarray(0, -1);
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

class GitCommandError extends Error {
  constructor(command, exitCode, stderr) {
    const diagnostic = sanitizedDiagnostic(stderr);
    super(`Git ${command} failed${diagnostic ? `: ${diagnostic}` : ''}`);
    this.name = 'GitCommandError';
    this.exitCode = typeof exitCode === 'number' ? exitCode : null;
  }
}

function sanitizedDiagnostic(value) {
  return Buffer.isBuffer(value)
    ? value.subarray(0, 512).toString('utf8').replace(/[\p{Cc}\p{Cf}]+/gu, ' ').trim()
    : '';
}
