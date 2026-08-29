import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';

const MAX_SOURCE_FILE_BYTES = 32 * 1024 * 1024;
const MAX_SOURCE_SNAPSHOT_BYTES = 128 * 1024 * 1024;

function validateRelativePath(relativePath) {
  if (typeof relativePath !== 'string'
    || relativePath.length === 0
    || relativePath.includes('\0')
    || relativePath.includes('\\')
    || path.isAbsolute(relativePath)
    || relativePath.split('/').some((part) => part === '' || part === '.' || part === '..')) {
    throw new TypeError(`Invalid project source path: ${String(relativePath)}`);
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

async function captureEntry(root, canonicalRoot, relativePath) {
  validateRelativePath(relativePath);
  const absolutePath = path.join(root, relativePath);
  const before = await lstat(absolutePath, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n) throw new Error(`Project source is not one regular non-symlink file: ${relativePath}`);
  if (before.size > BigInt(MAX_SOURCE_FILE_BYTES)) throw new Error(`Project source file exceeds ${MAX_SOURCE_FILE_BYTES} bytes: ${relativePath}`);
  const expectedCanonicalPath = path.join(canonicalRoot, ...relativePath.split('/'));
  if (await realpath(absolutePath) !== expectedCanonicalPath) throw new Error(`Project source crosses a symlink boundary: ${relativePath}`);

  const handle = await open(absolutePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat({ bigint: true });
    if (!sameIdentity(before, opened)) throw new Error(`Project source changed before snapshot read: ${relativePath}`);
    const content = await readExactFile(handle, Number(before.size), relativePath);
    const after = await handle.stat({ bigint: true });
    if (!sameIdentity(before, after) || BigInt(content.length) !== before.size) {
      throw new Error(`Project source changed while snapshotting: ${relativePath}`);
    }
    if (await realpath(absolutePath) !== expectedCanonicalPath) throw new Error(`Project source crossed a symlink boundary while snapshotting: ${relativePath}`);
    return {
      byteLength: content.length,
      content,
      digest: `sha256:${createHash('sha256').update(content).digest('hex')}`,
      kind: 'file',
    };
  } finally {
    await handle.close();
  }
}

async function readExactFile(handle, expectedBytes, relativePath) {
  const content = Buffer.allocUnsafe(expectedBytes);
  let offset = 0;
  while (offset < expectedBytes) {
    const { bytesRead } = await handle.read(content, offset, expectedBytes - offset, offset);
    if (bytesRead === 0) throw new Error(`Project source became shorter while snapshotting: ${relativePath}`);
    offset += bytesRead;
  }
  const probe = Buffer.allocUnsafe(1);
  if ((await handle.read(probe, 0, 1, expectedBytes)).bytesRead !== 0) {
    throw new Error(`Project source grew while snapshotting: ${relativePath}`);
  }
  return content;
}

export async function captureProjectSourceSnapshot(root, relativePaths) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) throw new TypeError('root must be an absolute path');
  if (!Array.isArray(relativePaths)) throw new TypeError('relativePaths must be an array');
  const canonicalRoot = await realpath(root);
  const paths = [...relativePaths].sort();
  if (new Set(paths).size !== paths.length) throw new Error('Project source paths must be unique');

  const entries = new Map();
  let totalBytes = 0;
  for (const relativePath of paths) {
    const entry = await captureEntry(root, canonicalRoot, relativePath);
    totalBytes += entry.byteLength;
    if (totalBytes > MAX_SOURCE_SNAPSHOT_BYTES) {
      throw new Error(`Project source snapshot exceeds ${MAX_SOURCE_SNAPSHOT_BYTES} bytes`);
    }
    entries.set(relativePath, entry);
  }

  const frozenPaths = Object.freeze(paths);
  return Object.freeze({
    paths: frozenPaths,
    artifactDigest() {
      const digest = createHash('sha256');
      for (const relativePath of frozenPaths) {
        const entry = entries.get(relativePath);
        digest.update(`${relativePath.length}:${relativePath}:${entry.byteLength}:${entry.digest}\n`);
      }
      return `sha256:${digest.digest('hex')}`;
    },
    describe(relativePath) {
      const entry = entries.get(relativePath);
      return entry ? `${entry.kind}:${entry.byteLength}:${entry.digest}` : null;
    },
    digest(relativePath) {
      return entries.get(relativePath)?.digest ?? null;
    },
    has(relativePath) {
      return entries.has(relativePath);
    },
    sourceManifest() {
      return Object.fromEntries(frozenPaths.map((relativePath) => [relativePath, entries.get(relativePath).digest]));
    },
    text(relativePath) {
      const entry = entries.get(relativePath);
      if (!entry || entry.kind !== 'file' || !entry.content) {
        throw new Error(`Project source text is unavailable: ${relativePath}`);
      }
      return entry.content.toString('utf8');
    },
  });
}

export function diffProjectSourceSnapshots(expected, actual) {
  const expectedPaths = new Set(expected.paths);
  const actualPaths = new Set(actual.paths);
  return Object.freeze({
    added: Object.freeze(actual.paths.filter((relativePath) => !expectedPaths.has(relativePath))),
    changed: Object.freeze(expected.paths.filter((relativePath) => actualPaths.has(relativePath)
      && expected.describe(relativePath) !== actual.describe(relativePath))),
    removed: Object.freeze(expected.paths.filter((relativePath) => !actualPaths.has(relativePath))),
  });
}

export function formatProjectSourceDrift(diff, limit = 8) {
  const sections = [];
  for (const key of ['added', 'removed', 'changed']) {
    if (diff[key].length === 0) continue;
    const shown = diff[key].slice(0, limit);
    const suffix = diff[key].length > shown.length ? `, +${diff[key].length - shown.length} more` : '';
    sections.push(`${key}=[${shown.join(', ')}${suffix}]`);
  }
  return sections.length ? `Project source changed during evaluation: ${sections.join('; ')}.` : null;
}
