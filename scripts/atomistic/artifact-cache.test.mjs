import { createHash } from 'node:crypto';
import { link, mkdir, mkdtemp, readFile, realpath, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { rmSync } from 'node:fs';
import { canonicalCacheRoot, fetchCachedArtifact, verifyCachedArtifact } from './artifact-cache.mjs';

const temporaryDirectories = [];
afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

const fixture = async () => {
  const root = await realpath(await mkdtemp(path.join(tmpdir(), 'tailing-atomistic-cache-')));
  temporaryDirectories.push(root);
  await mkdir(path.join(root, 'atomistic'));
  const bytes = Buffer.from('verified artifact\n');
  const artifact = {
    id: 'fixture',
    cachePath: 'atomistic/fixture.bin',
    url: 'https://example.invalid/fixture.bin',
    sizeBytes: bytes.length,
    sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
  };
  await writeFile(path.join(root, artifact.cachePath), bytes, { mode: 0o400 });
  return { root, bytes, artifact };
};

describe('atomistic artifact cache', () => {
  it('accepts a regular file only when its exact byte length and digest match', async () => {
    const { root, artifact } = await fixture();
    await expect(verifyCachedArtifact(root, artifact)).resolves.toMatchObject({ verifiedSha256: artifact.sha256 });
    await expect(verifyCachedArtifact(root, { ...artifact, sizeBytes: artifact.sizeBytes + 1 })).rejects.toThrow(/expected/);
    await expect(verifyCachedArtifact(root, { ...artifact, sha256: `sha256:${'0'.repeat(64)}` })).rejects.toThrow(/SHA-256/);
  });

  it('rejects paths escaping the cache and both symbolic and hard links', async () => {
    const { root, artifact } = await fixture();
    await expect(verifyCachedArtifact(root, { ...artifact, cachePath: '../fixture.bin' })).rejects.toThrow(/escapes/);

    const symbolicPath = path.join(root, 'atomistic', 'symbolic.bin');
    await symlink(path.join(root, artifact.cachePath), symbolicPath);
    await expect(verifyCachedArtifact(root, { ...artifact, cachePath: 'atomistic/symbolic.bin' })).rejects.toThrow(/regular file/);

    const hardPath = path.join(root, 'atomistic', 'hard.bin');
    await link(path.join(root, artifact.cachePath), hardPath);
    await expect(verifyCachedArtifact(root, { ...artifact, cachePath: 'atomistic/hard.bin' })).rejects.toThrow(/hard link/);
  });

  it('rejects a symbolic-link root and does not create through a symbolic-link parent', async () => {
    const outer = await realpath(await mkdtemp(path.join(tmpdir(), 'tailing-atomistic-outer-')));
    const holder = await realpath(await mkdtemp(path.join(tmpdir(), 'tailing-atomistic-holder-')));
    temporaryDirectories.push(outer, holder);
    const rootLink = path.join(holder, 'cache-link');
    await symlink(outer, rootLink);
    await expect(canonicalCacheRoot(rootLink)).rejects.toThrow(/symbolic link/);

    const root = path.join(holder, 'cache');
    await mkdir(root);
    await symlink(outer, path.join(root, 'redirect'));
    const bytes = Buffer.from('verified artifact\n');
    const artifact = {
      id: 'redirect-fixture', cachePath: 'redirect/created/fixture.bin',
      url: 'https://example.invalid/fixture.bin', sizeBytes: bytes.length,
      sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    };
    await expect(fetchCachedArtifact(root, artifact, async () => new Response(bytes))).rejects.toThrow(/real directory/);
    await expect(readFile(path.join(outer, 'created', 'fixture.bin'))).rejects.toMatchObject({ code: 'ENOENT' });

    const ancestorLink = path.join(holder, 'ancestor-link');
    await symlink(outer, ancestorLink);
    await expect(canonicalCacheRoot(path.join(ancestorLink, 'new-cache'))).rejects.toThrow(/symbolic link|non-directory/);
    await expect(readFile(path.join(outer, 'new-cache'))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('never overwrites a destination that appears while a download is in flight', async () => {
    const root = await realpath(await mkdtemp(path.join(tmpdir(), 'tailing-atomistic-race-')));
    temporaryDirectories.push(root);
    const destination = path.join(root, 'artifact.bin');
    const expected = Buffer.from('expected bytes\n');
    const attacker = Buffer.from('attacker bytes\n');
    const artifact = {
      id: 'race-fixture', cachePath: 'artifact.bin', url: 'https://example.invalid/artifact.bin',
      sizeBytes: expected.length, sha256: `sha256:${createHash('sha256').update(expected).digest('hex')}`,
    };
    await expect(fetchCachedArtifact(root, artifact, async () => {
      await writeFile(destination, attacker);
      return new Response(expected);
    })).rejects.toThrow(/refusing to overwrite/);
    expect(await readFile(destination)).toEqual(attacker);
  });
});
