import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  captureProjectSourceSnapshot,
  diffProjectSourceSnapshots,
  formatProjectSourceDrift,
} from './source-snapshot.mjs';

const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function temporaryRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'tailing-source-snapshot-'));
  temporaryRoots.push(root);
  return root;
}

describe('project source snapshot', () => {
  it('builds one deterministic manifest and artifact digest from captured bytes', async () => {
    const root = await temporaryRoot();
    await mkdir(path.join(root, 'docs'));
    await writeFile(path.join(root, 'README.md'), 'alpha\n');
    await writeFile(path.join(root, 'COPYING.txt'), 'gamma\n');
    await writeFile(path.join(root, 'docs', 'note.md'), 'beta\n');

    const snapshot = await captureProjectSourceSnapshot(root, ['docs/note.md', 'README.md', 'COPYING.txt']);
    const alphaDigest = `sha256:${createHash('sha256').update('alpha\n').digest('hex')}`;
    expect(snapshot.paths).toEqual(['COPYING.txt', 'README.md', 'docs/note.md']);
    expect(snapshot.text('README.md')).toBe('alpha\n');
    expect(snapshot.digest('README.md')).toBe(alphaDigest);
    expect(snapshot.sourceManifest()['README.md']).toBe(alphaDigest);
    expect(snapshot.artifactDigest()).toBe('sha256:388ab983746ed941098187eb35b5a21a5b6f991d924cdf57620050fe885dc032');
  });

  it('detects added, removed and byte-changed paths between snapshots', async () => {
    const root = await temporaryRoot();
    await writeFile(path.join(root, 'a.txt'), 'one');
    await writeFile(path.join(root, 'b.txt'), 'two');
    const before = await captureProjectSourceSnapshot(root, ['a.txt', 'b.txt']);

    const frozenDigest = before.digest('a.txt');
    const frozenManifest = before.sourceManifest();
    await writeFile(path.join(root, 'a.txt'), 'eno');
    await unlink(path.join(root, 'b.txt'));
    await writeFile(path.join(root, 'c.txt'), 'three');
    const after = await captureProjectSourceSnapshot(root, ['a.txt', 'c.txt']);
    const diff = diffProjectSourceSnapshots(before, after);

    expect(diff).toEqual({ added: ['c.txt'], changed: ['a.txt'], removed: ['b.txt'] });
    expect(formatProjectSourceDrift(diff)).toMatch(/added=\[c\.txt\].*removed=\[b\.txt\].*changed=\[a\.txt\]/);
    expect(before.text('a.txt')).toBe('one');
    expect(before.digest('a.txt')).toBe(frozenDigest);
    expect(before.sourceManifest()).toEqual(frozenManifest);
  });

  it('rejects duplicate, traversal, non-file and symlinked source entries', async () => {
    const root = await temporaryRoot();
    await writeFile(path.join(root, 'a.txt'), 'one');
    await mkdir(path.join(root, 'directory'));
    await symlink('a.txt', path.join(root, 'a.link'));

    const outside = await temporaryRoot();
    await writeFile(path.join(outside, 'outside.txt'), 'outside');
    await symlink(outside, path.join(root, 'linked-directory'));

    await expect(captureProjectSourceSnapshot(root, ['a.txt', 'a.txt'])).rejects.toThrow(/unique/);
    await expect(captureProjectSourceSnapshot(root, ['../escape'])).rejects.toThrow(/Invalid/);
    await expect(captureProjectSourceSnapshot(root, ['directory'])).rejects.toThrow(/regular non-symlink/);
    await expect(captureProjectSourceSnapshot(root, ['a.link'])).rejects.toThrow(/regular non-symlink/);
    await expect(captureProjectSourceSnapshot(root, ['linked-directory/outside.txt'])).rejects.toThrow(/symlink boundary/);
  });
});
