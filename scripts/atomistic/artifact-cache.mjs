import { createHash, randomUUID } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { chmod, link, lstat, mkdir, open, realpath, rm, stat } from 'node:fs/promises';
import path from 'node:path';

export async function canonicalCacheRoot(cacheRoot) {
  if (!path.isAbsolute(cacheRoot ?? '')) throw new Error('Atomistic cache root must be an absolute path.');
  const lexicalRoot = path.resolve(cacheRoot);
  if (lexicalRoot !== cacheRoot) throw new Error('Atomistic cache root must be a normalized absolute path.');

  const missing = [];
  let existing = lexicalRoot;
  for (;;) {
    try {
      const metadata = await lstat(existing, { bigint: true });
      if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error('Atomistic cache root contains a symbolic link or non-directory ancestor.');
      break;
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      const parent = path.dirname(existing);
      if (parent === existing) throw new Error('Atomistic cache root has no existing directory ancestor.');
      missing.unshift(path.basename(existing));
      existing = parent;
    }
  }

  const canonicalExisting = await realpath(existing);
  if (canonicalExisting !== existing) throw new Error('Atomistic cache root contains a symbolic link ancestor.');
  let current = existing;
  for (const component of missing) {
    const candidate = path.join(current, component);
    try { await mkdir(candidate, { recursive: false, mode: 0o700 }); }
    catch (error) { if (error?.code !== 'EEXIST') throw error; }
    const metadata = await lstat(candidate, { bigint: true });
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error('Atomistic cache root contains a symbolic link or non-directory component.');
    const canonicalCandidate = await realpath(candidate);
    if (canonicalCandidate !== candidate) throw new Error('Atomistic cache root contains a symbolic link ancestor.');
    current = candidate;
  }

  const canonical = await realpath(lexicalRoot);
  if (canonical !== lexicalRoot) throw new Error('Atomistic cache root contains a symbolic link ancestor.');
  const metadata = await lstat(canonical, { bigint: true });
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) throw new Error('Atomistic cache root must be a real directory.');
  return canonical;
}

export async function verifyCachedArtifact(cacheRoot, artifact) {
  validateArtifactContract(artifact);
  const absolutePath = await resolveCachePath(cacheRoot, artifact.cachePath, false);
  const before = await lstat(absolutePath, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink()) throw new Error(`${artifact.id}: cached artifact is not a regular file.`);
  if (before.nlink !== 1n) throw new Error(`${artifact.id}: cached artifact must not be a hard link.`);
  if (before.size !== BigInt(artifact.sizeBytes)) throw new Error(`${artifact.id}: expected ${artifact.sizeBytes} bytes, found ${before.size}.`);

  const hash = createHash('sha256');
  for await (const chunk of createReadStream(absolutePath, { flags: 'r' })) hash.update(chunk);
  const actualDigest = `sha256:${hash.digest('hex')}`;
  if (actualDigest !== artifact.sha256) throw new Error(`${artifact.id}: cached SHA-256 mismatch.`);

  const after = await stat(absolutePath, { bigint: true });
  if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs) {
    throw new Error(`${artifact.id}: cached artifact changed while it was verified.`);
  }
  return { ...artifact, absolutePath, verifiedSizeBytes: Number(after.size), verifiedSha256: actualDigest };
}

export async function fetchCachedArtifact(cacheRoot, artifact, fetchImpl = globalThis.fetch) {
  try {
    return await verifyCachedArtifact(cacheRoot, artifact);
  } catch (error) {
    if (await pathExists(path.resolve(cacheRoot, artifact.cachePath))) throw error;
  }

  const absolutePath = await resolveCachePath(cacheRoot, artifact.cachePath, true);
  const stagingDirectory = await resolveCachePath(cacheRoot, '.staging', true, true);
  const stagingPath = path.join(stagingDirectory, `${randomUUID()}.part`);
  const handle = await open(stagingPath, 'wx', 0o600);
  let received = 0;
  const hash = createHash('sha256');
  let finalUrl = artifact.url;
  try {
    const response = await fetchImpl(artifact.url, {
      redirect: 'follow',
      headers: { 'user-agent': 'tailing-future-atomistic-fetch/1' },
    });
    if (!response.ok || !response.body) throw new Error(`${artifact.id}: download failed with HTTP ${response.status}.`);
    finalUrl = response.url || artifact.url;
    for await (const chunk of response.body) {
      const bytes = Buffer.from(chunk);
      received += bytes.length;
      if (received > artifact.sizeBytes) throw new Error(`${artifact.id}: download exceeded the pinned byte length.`);
      hash.update(bytes);
      await handle.write(bytes);
    }
    await handle.sync();
    await handle.close();
    if (received !== artifact.sizeBytes) throw new Error(`${artifact.id}: expected ${artifact.sizeBytes} bytes, downloaded ${received}.`);
    const actualDigest = `sha256:${hash.digest('hex')}`;
    if (actualDigest !== artifact.sha256) throw new Error(`${artifact.id}: downloaded SHA-256 mismatch.`);
    await chmod(stagingPath, 0o400);
    try {
      await link(stagingPath, absolutePath);
    } catch (error) {
      if (error?.code === 'EEXIST') throw new Error(`${artifact.id}: destination appeared during download; refusing to overwrite it.`);
      throw error;
    }
    await rm(stagingPath);
    const verified = await verifyCachedArtifact(cacheRoot, artifact);
    return { ...verified, finalHost: new URL(finalUrl).host };
  } catch (error) {
    await handle.close().catch(() => undefined);
    await rm(stagingPath, { force: true }).catch(() => undefined);
    throw error;
  }
}

export function artifactContracts(plan) {
  return [
    ...plan.models.map((model) => ({
      id: `${model.id}:package`,
      kind: 'package',
      cachePath: model.package.cachePath,
      url: model.package.url,
      sizeBytes: model.package.sizeBytes,
      sha256: model.package.sha256,
    })),
    ...plan.models.map((model) => ({
      id: `${model.id}:checkpoint`,
      kind: 'checkpoint',
      cachePath: model.cachePath,
      url: model.checkpoint.url,
      sizeBytes: model.checkpoint.sizeBytes,
      sha256: model.checkpoint.sha256,
    })),
    ...plan.benchmarks.filter((benchmark) => benchmark.cachePath && benchmark.artifact.sha256).map((benchmark) => ({
      id: `${benchmark.id}:dataset`,
      kind: 'dataset',
      cachePath: benchmark.cachePath,
      url: benchmark.artifact.url,
      sizeBytes: benchmark.artifact.sizeBytes,
      sha256: benchmark.artifact.sha256,
    })),
  ];
}

async function resolveCachePath(cacheRoot, relativePath, createParent, directory = false) {
  const canonicalRoot = await canonicalCacheRoot(cacheRoot);
  if (typeof relativePath !== 'string' || relativePath.length === 0 || path.isAbsolute(relativePath)) throw new Error('Cache paths must be non-empty relative paths.');
  const absolutePath = path.resolve(canonicalRoot, relativePath);
  const relativeToRoot = path.relative(canonicalRoot, absolutePath);
  if (relativeToRoot.startsWith('..') || path.isAbsolute(relativeToRoot)) throw new Error(`Cache path escapes the root: ${relativePath}.`);
  if (directory) return ensureRelativeDirectory(canonicalRoot, relativeToRoot);
  if (createParent) await ensureRelativeDirectory(canonicalRoot, path.dirname(relativeToRoot));
  const canonicalParent = await realpath(path.dirname(absolutePath));
  assertWithin(canonicalRoot, canonicalParent, relativePath);
  return absolutePath;
}

async function ensureRelativeDirectory(canonicalRoot, relativeDirectory) {
  let current = canonicalRoot;
  const parts = relativeDirectory === '.' || relativeDirectory === '' ? [] : relativeDirectory.split(path.sep);
  for (const part of parts) {
    if (!part || part === '.' || part === '..') throw new Error(`Invalid cache directory component: ${part}.`);
    const candidate = path.join(current, part);
    try { await mkdir(candidate, { recursive: false, mode: 0o700 }); }
    catch (error) { if (error?.code !== 'EEXIST') throw error; }
    const metadata = await lstat(candidate, { bigint: true });
    if (metadata.isSymbolicLink() || !metadata.isDirectory()) throw new Error(`Cache directory component is not a real directory: ${part}.`);
    const canonical = await realpath(candidate);
    assertWithin(canonicalRoot, canonical, relativeDirectory);
    current = canonical;
  }
  return current;
}

function assertWithin(root, candidate, label) {
  const relative = path.relative(root, candidate);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error(`Cache path resolves outside the root: ${label}.`);
}

function validateArtifactContract(artifact) {
  if (!artifact || typeof artifact !== 'object') throw new Error('Artifact contract is missing.');
  if (!artifact.id || !artifact.cachePath || !artifact.url) throw new Error('Artifact contract lacks id, cachePath or URL.');
  if (!Number.isSafeInteger(artifact.sizeBytes) || artifact.sizeBytes < 1) throw new Error(`${artifact.id}: invalid pinned byte length.`);
  if (!/^sha256:[0-9a-f]{64}$/.test(artifact.sha256 ?? '')) throw new Error(`${artifact.id}: invalid pinned SHA-256.`);
  const url = new URL(artifact.url);
  if (url.protocol !== 'https:') throw new Error(`${artifact.id}: only HTTPS artifact URLs are allowed.`);
}

async function pathExists(absolutePath) {
  try {
    await lstat(absolutePath);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    throw error;
  }
}
