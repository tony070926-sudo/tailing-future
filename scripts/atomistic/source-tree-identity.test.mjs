import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmod,
  mkdir,
  mkdtemp,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  SOURCE_TREE_IDENTITY_PROTOCOL,
  SOURCE_TREE_TOPOLOGY_PROTOCOL,
  deriveGitSourceTreeIdentity,
} from './source-tree-identity.mjs';

const GIT_EXECUTABLE = process.platform === 'win32' ? 'git.exe' : '/usr/bin/git';
const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function temporaryRepository() {
  const root = await mkdtemp(path.join(tmpdir(), 'tailing-source-tree-'));
  temporaryRoots.push(root);
  git(root, ['init', '-q']);
  git(root, ['config', 'user.name', 'Tailing Source Tree Test']);
  git(root, ['config', 'user.email', 'source-tree@example.invalid']);
  return root;
}

function git(root, args, options = {}) {
  const environment = {
    ...process.env,
    GIT_CONFIG_NOSYSTEM: '1',
  };
  if (options.honorReplacements) delete environment.GIT_NO_REPLACE_OBJECTS;
  else environment.GIT_NO_REPLACE_OBJECTS = '1';
  return execFileSync(GIT_EXECUTABLE, ['-C', root, ...args], {
    encoding: Object.hasOwn(options, 'encoding') ? options.encoding : 'utf8',
    env: environment,
    input: options.input,
    maxBuffer: 16 * 1024 * 1024,
  });
}

function gitText(root, args, options = {}) {
  return git(root, args, { ...options, encoding: 'utf8' }).trimEnd();
}

async function commitAll(root, message) {
  git(root, ['add', '-A']);
  git(root, ['commit', '-q', '-m', message]);
  return gitText(root, ['rev-parse', 'HEAD']);
}

function writeBlob(root, bytes) {
  return gitText(root, ['hash-object', '-w', '--stdin'], { input: bytes });
}

function writeTree(root, entries, { missing = false } = {}) {
  const input = Buffer.concat(entries.map((entry) => Buffer.concat([
    Buffer.from(`${entry.mode} ${entry.type} ${entry.objectId}\t`, 'ascii'),
    Buffer.isBuffer(entry.path) ? entry.path : Buffer.from(entry.path, 'utf8'),
    Buffer.from([0]),
  ])));
  return gitText(root, ['mktree', '-z', ...(missing ? ['--missing'] : [])], { input });
}

function writeCommit(root, tree, message) {
  return gitText(root, ['commit-tree', tree, '-m', message]);
}

function writeLiteralTree(root, entries) {
  const input = Buffer.concat(entries.map((entry) => Buffer.concat([
    Buffer.from(`${entry.mode} ${entry.path}\0`, 'utf8'),
    Buffer.from(entry.objectId, 'hex'),
  ])));
  return gitText(root, ['hash-object', '--literally', '-t', 'tree', '-w', '--stdin'], { input });
}

function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

function documentedTopology(treeEntries) {
  const chunks = [Buffer.from(`${SOURCE_TREE_TOPOLOGY_PROTOCOL}\0`, 'ascii')];
  for (const entry of treeEntries) {
    const pathBytes = Buffer.from(entry.path, 'utf8');
    chunks.push(
      Buffer.from(`${pathBytes.length}:`, 'ascii'),
      pathBytes,
      Buffer.from(`\0${entry.sizeBytes}\0${entry.treeObjectId}\0${entry.sha256}\0`, 'ascii'),
    );
  }
  return Buffer.concat(chunks);
}

function documentedManifest(topologyDigest, entries) {
  const chunks = [Buffer.from(`${SOURCE_TREE_IDENTITY_PROTOCOL}\0topology\0${topologyDigest}\0`, 'ascii')];
  for (const entry of entries) {
    const pathBytes = Buffer.from(entry.path, 'utf8');
    chunks.push(
      Buffer.from(`${pathBytes.length}:`, 'ascii'),
      pathBytes,
      Buffer.from(`\0${entry.mode}\0${entry.sizeBytes}\0${entry.blobObjectId}\0${entry.sha256}\0`, 'ascii'),
    );
  }
  return Buffer.concat(chunks);
}

describe('Git source-tree identity', () => {
  it('hashes committed blobs in deterministic raw-path order and ignores worktree decoys', async () => {
    const root = await temporaryRepository();
    await mkdir(path.join(root, 'nested'));
    await writeFile(path.join(root, 'z.txt'), 'zulu\n');
    await writeFile(path.join(root, 'A.txt'), 'alpha\n');
    await writeFile(path.join(root, 'b.txt'), 'lower\n');
    await writeFile(path.join(root, 'nested', 'b.txt'), 'beta\n');
    const commit = await commitAll(root, 'frozen source');

    await writeFile(path.join(root, 'A.txt'), 'WORKTREE DECOY\n');
    await writeFile(path.join(root, 'untracked.txt'), 'UNTRACKED DECOY\n');
    const identity = await deriveGitSourceTreeIdentity(root, commit);

    expect(identity.revision).toBe(commit);
    expect(identity.verifierRevision).toBeNull();
    expect(identity.entries.map((entry) => entry.path)).toEqual([
      'A.txt', 'b.txt', 'nested/b.txt', 'z.txt',
    ]);
    expect(identity.entries.find((entry) => entry.path === 'A.txt')?.sha256).toBe(sha256('alpha\n'));
    expect(identity.entries.some((entry) => entry.path === 'untracked.txt')).toBe(false);
    expect(identity.totalBytes).toBe(Buffer.byteLength('alpha\nlower\nbeta\nzulu\n'));

    const expectedTopology = documentedTopology(identity.treeEntries);
    const expectedManifest = documentedManifest(identity.topologyDigest, identity.entries);
    expect(identity.rootTreeObjectId).toMatch(/^[0-9a-f]{40}$/);
    expect(identity.canonicalTopologyBytes()).toEqual(expectedTopology);
    expect(identity.topologyDigest).toBe(sha256(expectedTopology));
    expect(identity.canonicalManifestBytes()).toEqual(expectedManifest);
    expect(identity.treeDigest).toBe(sha256(expectedManifest));
    const mutableCopy = identity.canonicalManifestBytes();
    mutableCopy.fill(0);
    expect(identity.canonicalManifestBytes()).toEqual(expectedManifest);
  });

  it('ignores replacement refs and inherited Git replacement configuration', async () => {
    const root = await temporaryRepository();
    await writeFile(path.join(root, 'tracked.txt'), 'original\n');
    const originalCommit = await commitAll(root, 'original');
    const originalIdentity = await deriveGitSourceTreeIdentity(root, originalCommit);

    await writeFile(path.join(root, 'tracked.txt'), 'replacement\n');
    const replacementCommit = await commitAll(root, 'replacement');
    git(root, ['replace', originalCommit, replacementCommit]);
    expect(git(root, ['show', `${originalCommit}:tracked.txt`], {
      encoding: null,
      honorReplacements: true,
    })).toEqual(Buffer.from('replacement\n'));

    const observed = await deriveGitSourceTreeIdentity(root, originalCommit);
    expect(observed.treeDigest).toBe(originalIdentity.treeDigest);
    expect(observed.entries[0].sha256).toBe(sha256('original\n'));
  });

  it('binds empty-subtree topology through SHA-256 of every raw tree object', async () => {
    const root = await temporaryRepository();
    const blob = writeBlob(root, Buffer.from('payload'));
    const emptyTree = writeTree(root, []);
    const flatTree = writeTree(root, [{
      mode: '100644', type: 'blob', objectId: blob, path: 'file.txt',
    }]);
    const treeWithEmptyDirectory = writeTree(root, [
      { mode: '100644', type: 'blob', objectId: blob, path: 'file.txt' },
      { mode: '040000', type: 'tree', objectId: emptyTree, path: 'vacant' },
    ]);

    const flat = await deriveGitSourceTreeIdentity(root, writeCommit(root, flatTree, 'flat'));
    const nested = await deriveGitSourceTreeIdentity(
      root,
      writeCommit(root, treeWithEmptyDirectory, 'empty subtree'),
    );

    expect(nested.entries).toEqual(flat.entries);
    expect(nested.rootTreeObjectId).not.toBe(flat.rootTreeObjectId);
    expect(nested.treeEntries.map((entry) => entry.path)).toEqual(['', 'vacant']);
    expect(nested.treeEntries.find((entry) => entry.path === '')?.sha256).toBe(sha256(git(
      root,
      ['cat-file', 'tree', treeWithEmptyDirectory],
      { encoding: null },
    )));
    expect(nested.treeEntries.find((entry) => entry.path === 'vacant')?.sha256).toBe(sha256(git(
      root,
      ['cat-file', 'tree', emptyTree],
      { encoding: null },
    )));
    expect(nested.topologyDigest).toBe(sha256(documentedTopology(nested.treeEntries)));
    expect(nested.topologyDigest).not.toBe(flat.topologyDigest);
    expect(nested.treeDigest).not.toBe(flat.treeDigest);
  });

  it('separates content, executable-mode and path drift and enforces ancestry', async () => {
    const root = await temporaryRepository();
    await writeFile(path.join(root, 'source.txt'), 'one\n');
    const first = await commitAll(root, 'one');
    await writeFile(path.join(root, 'source.txt'), 'two\n');
    const contentDrift = await commitAll(root, 'content drift');
    await chmod(path.join(root, 'source.txt'), 0o755);
    const modeDrift = await commitAll(root, 'mode drift');
    await rename(path.join(root, 'source.txt'), path.join(root, 'renamed.txt'));
    const pathDrift = await commitAll(root, 'path drift');

    const identities = await Promise.all([
      deriveGitSourceTreeIdentity(root, first),
      deriveGitSourceTreeIdentity(root, contentDrift),
      deriveGitSourceTreeIdentity(root, modeDrift),
      deriveGitSourceTreeIdentity(root, pathDrift, { verifierRevision: pathDrift }),
    ]);
    expect(new Set(identities.map((identity) => identity.treeDigest)).size).toBe(4);
    expect((await deriveGitSourceTreeIdentity(root, first, {
      verifierRevision: pathDrift,
    })).verifierRevision).toBe(pathDrift);

    const unrelated = writeCommit(root, gitText(root, ['rev-parse', `${pathDrift}^{tree}`]), 'unrelated root');
    await expect(deriveGitSourceTreeIdentity(root, pathDrift, {
      verifierRevision: unrelated,
    })).rejects.toThrow(/not an ancestor/);
    await expect(deriveGitSourceTreeIdentity(root, first.slice(0, 12))).rejects.toThrow(/full lowercase 40-hex/);
  });

  it('rejects symlinks, gitlinks and every non-regular blob mode', async () => {
    const root = await temporaryRepository();
    const blob = writeBlob(root, Buffer.from('payload'));
    const regularTree = writeTree(root, [{
      mode: '100644', type: 'blob', objectId: blob, path: 'regular.txt',
    }]);
    const targetCommit = writeCommit(root, regularTree, 'gitlink target');
    const mutations = [
      { mode: '120000', type: 'blob', objectId: blob, path: 'link' },
      { mode: '160000', type: 'commit', objectId: targetCommit, path: 'dependency' },
      { mode: '100664', type: 'blob', objectId: blob, path: 'nonregular.txt' },
    ];

    for (const [index, mutation] of mutations.entries()) {
      const tree = mutation.mode === '100664'
        ? writeLiteralTree(root, [mutation])
        : writeTree(root, [mutation]);
      const commit = writeCommit(root, tree, `unsafe mode ${index}`);
      await expect(deriveGitSourceTreeIdentity(root, commit)).rejects.toThrow(/non-regular entry mode\/type|strict object validation/);
    }
  });

  it('rejects duplicate, backslash, control, non-NFC and invalid-UTF8 paths', async () => {
    const root = await temporaryRepository();
    const blob = writeBlob(root, Buffer.from('payload'));
    const duplicateTree = writeTree(root, [
      { mode: '100644', type: 'blob', objectId: blob, path: 'same.txt' },
      { mode: '100644', type: 'blob', objectId: blob, path: 'same.txt' },
    ]);
    await expect(deriveGitSourceTreeIdentity(
      root,
      writeCommit(root, duplicateTree, 'duplicate path'),
    )).rejects.toThrow(/duplicate path|strict object validation/);

    const unsafePaths = [
      { path: 'bad\\name.txt', expected: /backslash or control/ },
      { path: 'bad\nname.txt', expected: /backslash or control/ },
      { path: 'e\u0301.txt', expected: /canonical UTF-8 NFC/ },
      { path: Buffer.from([0xff, 0x2e, 0x74, 0x78, 0x74]), expected: /canonical UTF-8/ },
    ];
    for (const [index, candidate] of unsafePaths.entries()) {
      const tree = writeTree(root, [{
        mode: '100644', type: 'blob', objectId: blob, path: candidate.path,
      }]);
      const commit = writeCommit(root, tree, `unsafe path ${index}`);
      await expect(deriveGitSourceTreeIdentity(root, commit)).rejects.toThrow(
        new RegExp(`(?:${candidate.expected.source})|strict object validation`),
      );
    }
  });

  it('rejects missing blobs and bounded individual or aggregate source bytes', async () => {
    const root = await temporaryRepository();
    await writeFile(path.join(root, 'a.txt'), 'abc');
    await writeFile(path.join(root, 'b.txt'), 'def');
    const normalCommit = await commitAll(root, 'bounded source');
    await expect(deriveGitSourceTreeIdentity(root, normalCommit, {
      maxBlobBytes: 2,
    })).rejects.toThrow(/per-file limit/);
    await expect(deriveGitSourceTreeIdentity(root, normalCommit, {
      maxBlobBytes: 3,
      maxTotalBytes: 5,
    })).rejects.toThrow(/total limit/);

    const missingObjectId = '1'.repeat(40);
    const missingTree = writeTree(root, [{
      mode: '100644', type: 'blob', objectId: missingObjectId, path: 'missing.txt',
    }], { missing: true });
    const missingCommit = writeCommit(root, missingTree, 'missing blob');
    await expect(deriveGitSourceTreeIdentity(root, missingCommit)).rejects.toThrow(/strict object validation|malformed|missing|available size/);
  });
});
