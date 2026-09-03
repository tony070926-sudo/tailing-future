import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import {
  FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH,
  FULL_CANDIDATE_REGISTRATION_WORKFLOW_SHA256,
  FULL_CANDIDATE_REGISTRATION_WORKFLOW_SIZE_BYTES,
  inspectFullCandidateRegistrationWorkflowSource,
} from '../workflow-policy.mjs';

const GIT_EXECUTABLE = '/usr/bin/git';
const GIT_TIMEOUT_MS = 10_000;
const MAX_GIT_OUTPUT_BYTES = 64 * 1024;
const EXPECTED_FILE_MODE = 0o644n;
const GIT_ENVIRONMENT = Object.freeze({
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_LITERAL_PATHSPECS: '1',
  GIT_NO_LAZY_FETCH: '1',
  GIT_NO_REPLACE_OBJECTS: '1',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_TERMINAL_PROMPT: '0',
  LANG: 'C',
  LC_ALL: 'C',
  PATH: '/usr/bin:/bin',
});

export async function validateFullCandidateRegistrationWorkflowRepository(
  root,
  options = {},
) {
  const failures = [];
  let snapshot = null;
  let gitBinding = null;

  try {
    snapshot = await captureRegistrationWorkflow(root, options);
  } catch (error) {
    failures.push(repositoryFailure(error));
  }

  if (snapshot) {
    failures.push(...inspectFullCandidateRegistrationWorkflowSource(
      FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH,
      snapshot.source,
    ));
    try {
      gitBinding = await bindRegistrationWorkflowToGit(root, snapshot.bytes, options);
      await assertSnapshotStillCurrent(snapshot);
    } catch (error) {
      failures.push(repositoryFailure(error));
    }
  }

  return Object.freeze({
    failures: Object.freeze(failures),
    gitBlobOid: gitBinding?.blobOid ?? null,
    stagedTreeOid: gitBinding?.treeOid ?? null,
    source: snapshot?.source ?? null,
  });
}

async function captureRegistrationWorkflow(root, options) {
  validateOptions(options);
  if (typeof root !== 'string' || !path.isAbsolute(root) || path.resolve(root) !== root) {
    throw new TypeError('repository root must be one absolute normalized path');
  }
  const rootMetadata = await lstat(root, { bigint: true });
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new Error('repository root must be one real directory');
  }
  const canonicalRoot = await realpath(root);
  if (canonicalRoot !== root) throw new Error('repository root crosses a symbolic-link boundary');

  for (const relativeDirectory of ['.github', '.github/workflows']) {
    const absoluteDirectory = path.join(root, ...relativeDirectory.split('/'));
    const metadata = await lstat(absoluteDirectory, { bigint: true });
    if (!metadata.isDirectory() || metadata.isSymbolicLink()) {
      throw new Error(`${relativeDirectory} must be one real directory`);
    }
    if (await realpath(absoluteDirectory) !== absoluteDirectory) {
      throw new Error(`${relativeDirectory} crosses a symbolic-link boundary`);
    }
  }

  const absolutePath = path.join(
    root,
    ...FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH.split('/'),
  );
  const before = await lstat(absolutePath, { bigint: true });
  assertRegularRegistrationFile(before);
  if (typeof fsConstants.O_NOFOLLOW !== 'number') {
    throw new Error('this platform does not provide O_NOFOLLOW');
  }
  if (await realpath(absolutePath) !== absolutePath) {
    throw new Error('registration workflow crosses a symbolic-link boundary');
  }

  const handle = await open(absolutePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  let bytes;
  try {
    const openedBefore = await handle.stat({ bigint: true });
    if (!sameIdentity(before, openedBefore)) {
      throw new Error('registration workflow changed before its descriptor read');
    }
    bytes = await readExactFile(handle, Number(before.size));
    if (options.afterReadForTest) await options.afterReadForTest(absolutePath);
    const openedAfter = await handle.stat({ bigint: true });
    const pathAfter = await lstat(absolutePath, { bigint: true });
    if (!sameIdentity(before, openedAfter) || !sameIdentity(before, pathAfter)) {
      throw new Error('registration workflow changed during its descriptor read');
    }
    assertRegularRegistrationFile(pathAfter);
    if (await realpath(absolutePath) !== absolutePath) {
      throw new Error('registration workflow crossed a symbolic-link boundary during its read');
    }
  } finally {
    await handle.close();
  }

  const rawDigest = createHash('sha256').update(bytes).digest('hex');
  if (bytes.length !== FULL_CANDIDATE_REGISTRATION_WORKFLOW_SIZE_BYTES
      || rawDigest !== FULL_CANDIDATE_REGISTRATION_WORKFLOW_SHA256) {
    throw new Error('registration workflow raw bytes differ from the exact reviewed source');
  }

  let source;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error('registration workflow is not strict UTF-8', { cause: error });
  }
  return Object.freeze({
    absolutePath,
    bytes,
    identity: before,
    source,
  });
}

async function bindRegistrationWorkflowToGit(root, bytes, options) {
  const topLevel = decodeSingleLine(
    await runGit(root, ['rev-parse', '--show-toplevel']),
    'Git top-level path',
  );
  if (await realpath(topLevel) !== root || topLevel !== root) {
    throw new Error('repository root is not the exact Git worktree top level');
  }
  const objectFormat = decodeSingleLine(
    await runGit(root, ['rev-parse', '--show-object-format']),
    'Git object format',
  );
  if (!['sha1', 'sha256'].includes(objectFormat)) {
    throw new Error(`unsupported Git object format: ${objectFormat}`);
  }

  const firstIndexBytes = await readIndexEntryBytes(root);
  const indexEntry = parseIndexEntry(firstIndexBytes, objectFormat);
  const blobBytes = await runGit(root, ['cat-file', 'blob', indexEntry.blobOid]);
  if (!blobBytes.equals(bytes)) {
    throw new Error('Git index blob bytes differ from the reviewed registration workflow');
  }
  const computedBlobOid = gitBlobOid(bytes, objectFormat);
  if (computedBlobOid !== indexEntry.blobOid) {
    throw new Error('Git index blob object ID does not match the reviewed bytes');
  }

  const treeOid = decodeSingleLine(await runGit(root, ['write-tree']), 'staged tree object ID');
  requireObjectId(treeOid, objectFormat, 'staged tree object ID');
  const treeEntry = parseTreeEntry(
    await runGit(root, [
      'ls-tree', '-z', '--full-tree', treeOid, '--',
      FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH,
    ]),
    objectFormat,
  );
  if (treeEntry.blobOid !== indexEntry.blobOid) {
    throw new Error('staged tree blob differs from the Git index registration workflow');
  }

  if (options.beforeFinalIndexReadForTest) {
    await options.beforeFinalIndexReadForTest(root);
  }
  const finalIndexBytes = await readIndexEntryBytes(root);
  if (!finalIndexBytes.equals(firstIndexBytes)) {
    throw new Error('Git index registration entry changed during validation');
  }
  return Object.freeze({ blobOid: indexEntry.blobOid, treeOid });
}

async function assertSnapshotStillCurrent(snapshot) {
  const current = await lstat(snapshot.absolutePath, { bigint: true });
  assertRegularRegistrationFile(current);
  if (!sameIdentity(snapshot.identity, current)) {
    throw new Error('registration workflow changed after Git binding');
  }
  if (await realpath(snapshot.absolutePath) !== snapshot.absolutePath) {
    throw new Error('registration workflow crossed a symbolic-link boundary after Git binding');
  }
}

function assertRegularRegistrationFile(metadata) {
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1n) {
    throw new Error('registration workflow must be one regular non-symlink single-link file');
  }
  if ((metadata.mode & 0o7777n) !== EXPECTED_FILE_MODE) {
    throw new Error('registration workflow filesystem mode must be exactly 0644');
  }
  if (metadata.size !== BigInt(FULL_CANDIDATE_REGISTRATION_WORKFLOW_SIZE_BYTES)) {
    throw new Error(
      `registration workflow size must be exactly ${FULL_CANDIDATE_REGISTRATION_WORKFLOW_SIZE_BYTES} bytes`,
    );
  }
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

async function readExactFile(handle, expectedBytes) {
  const content = Buffer.allocUnsafe(expectedBytes);
  let offset = 0;
  while (offset < expectedBytes) {
    const { bytesRead } = await handle.read(content, offset, expectedBytes - offset, offset);
    if (bytesRead === 0) throw new Error('registration workflow became shorter during its read');
    offset += bytesRead;
  }
  const probe = Buffer.allocUnsafe(1);
  if ((await handle.read(probe, 0, 1, expectedBytes)).bytesRead !== 0) {
    throw new Error('registration workflow grew during its read');
  }
  return content;
}

async function readIndexEntryBytes(root) {
  return runGit(root, [
    'ls-files', '--stage', '-z', '--full-name', '--',
    FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH,
  ]);
}

function parseIndexEntry(output, objectFormat) {
  const record = decodeSingleNulRecord(output, 'Git index registration entry');
  const match = /^(\d{6}) ([0-9a-f]+) ([0-3])\t([^\0]+)$/.exec(record);
  if (!match || match[4] !== FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH) {
    throw new Error('Git index must contain exactly the reviewed registration path');
  }
  if (match[1] !== '100644' || match[3] !== '0') {
    throw new Error('Git index registration entry must be one stage-0 mode-100644 blob');
  }
  requireObjectId(match[2], objectFormat, 'Git index blob object ID');
  return Object.freeze({ blobOid: match[2] });
}

function parseTreeEntry(output, objectFormat) {
  const record = decodeSingleNulRecord(output, 'staged tree registration entry');
  const match = /^(\d{6}) ([a-z]+) ([0-9a-f]+)\t([^\0]+)$/.exec(record);
  if (!match || match[4] !== FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH) {
    throw new Error('staged tree must contain exactly the reviewed registration path');
  }
  if (match[1] !== '100644' || match[2] !== 'blob') {
    throw new Error('staged tree registration entry must be one mode-100644 blob');
  }
  requireObjectId(match[3], objectFormat, 'staged tree blob object ID');
  return Object.freeze({ blobOid: match[3] });
}

function decodeSingleNulRecord(value, label) {
  if (!Buffer.isBuffer(value) || value.length < 2 || value.at(-1) !== 0
      || value.subarray(0, -1).includes(0)) {
    throw new Error(`${label} is not exactly one NUL-terminated record`);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(value.subarray(0, -1));
  } catch (error) {
    throw new Error(`${label} is not strict UTF-8`, { cause: error });
  }
}

function decodeSingleLine(value, label) {
  if (!Buffer.isBuffer(value) || value.length < 2 || value.at(-1) !== 0x0a
      || value.subarray(0, -1).includes(0x0a)) {
    throw new Error(`${label} is not exactly one LF-terminated line`);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(value.subarray(0, -1));
  } catch (error) {
    throw new Error(`${label} is not strict UTF-8`, { cause: error });
  }
}

function requireObjectId(value, objectFormat, label) {
  const expectedLength = objectFormat === 'sha1' ? 40 : 64;
  if (!new RegExp(`^[0-9a-f]{${expectedLength}}$`).test(value)) {
    throw new Error(`${label} is not one full ${objectFormat} object ID`);
  }
}

function gitBlobOid(bytes, objectFormat) {
  return createHash(objectFormat)
    .update(Buffer.from(`blob ${bytes.length}\0`, 'ascii'))
    .update(bytes)
    .digest('hex');
}

function runGit(root, args) {
  return new Promise((resolve, reject) => {
    execFile(
      GIT_EXECUTABLE,
      ['--no-replace-objects', '-C', root, ...args],
      {
        encoding: null,
        env: GIT_ENVIRONMENT,
        maxBuffer: MAX_GIT_OUTPUT_BYTES,
        timeout: GIT_TIMEOUT_MS,
        windowsHide: true,
      },
      (error, stdout, stderr) => {
        if (error) {
          const diagnostic = Buffer.from(stderr ?? Buffer.alloc(0))
            .subarray(0, 512)
            .toString('utf8')
            .replace(/[\r\n\t]+/g, ' ')
            .trim();
          reject(new Error(`Git ${args[0]} failed${diagnostic ? ` (${diagnostic})` : ''}`, {
            cause: error,
          }));
          return;
        }
        resolve(Buffer.from(stdout));
      },
    );
  });
}

function validateOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('registration source options must be one object');
  }
  const allowed = new Set(['afterReadForTest', 'beforeFinalIndexReadForTest']);
  const unexpected = Object.keys(options).filter((key) => !allowed.has(key));
  if (unexpected.length) throw new TypeError(`unexpected registration source option: ${unexpected[0]}`);
  if (options.afterReadForTest !== undefined && typeof options.afterReadForTest !== 'function') {
    throw new TypeError('afterReadForTest must be one function');
  }
  if (options.beforeFinalIndexReadForTest !== undefined
      && typeof options.beforeFinalIndexReadForTest !== 'function') {
    throw new TypeError('beforeFinalIndexReadForTest must be one function');
  }
}

function repositoryFailure(error) {
  return `${FULL_CANDIDATE_REGISTRATION_WORKFLOW_PATH}: repository identity validation failed (${error instanceof Error ? error.message : String(error)}).`;
}
