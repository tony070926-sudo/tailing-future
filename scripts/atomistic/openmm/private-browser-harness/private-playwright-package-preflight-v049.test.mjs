import { createHash } from 'node:crypto';
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  __testOnlyVerifyOwnPackageTreeV049,
  preflightPrivatePlaywrightPackagesV049,
} from './private-playwright-package-preflight-v049.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('V049 private Playwright own-package preflight', () => {
  it('matches both current installed own-package trees without importing Playwright', () => {
    const audit = preflightPrivatePlaywrightPackagesV049();

    expect(audit).toMatchObject({
      schemaVersion: 'tf.private-playwright-package-preflight/0.4.9',
      profile: 'read-only-own-package-content-preflight',
      lockSchemaVersion: 'tf.private-chromium-runtime-lock/0.4.9',
      playwrightVersion: '1.62.1',
      chromiumRevision: '1234',
      browserVersion: '151.0.7922.34',
      packageLockBindingsMatched: true,
      browsersJsonSha256:
        'sha256:f306eed529599b1eaf2f8a85db9de2b23e1a3fe36c2b66434b7c9434fb627a99',
      browsersJsonDigestMatched: true,
      chromiumDeclarationMatched: true,
      topLevelNodeModulesExcludedFromOwnPackageTrees: true,
      incompleteHostClosure: true,
      playwrightImportedOrExecutedByPreflight: false,
      freshProcessRuntimeVerified: false,
      claims: {
        realBrowserExecutionVerified: false,
        executionAuthenticityVerified: false,
        reproduced: false,
        promotionEligible: false,
        publicDistributionEligible: false,
        cloudflareDistributionEligible: false,
        immutableOwnPackageClosureVerified: false,
        immutableHostClosureVerified: false,
        immutableRuntimeSnapshotVerified: false,
      },
    });
    expect(audit.packages).toEqual([
      {
        packageName: 'playwright',
        version: '1.62.1',
        treeDigest:
          'sha256:5981dbf5b0604778dfe94c03564da904f13ba2289340fd1f695211922de1dc3f',
        regularFileCount: 62,
        expandedByteLength: 5_074_152,
        unixModeCounts: { '100644': 61, '100755': 1 },
        regularFilesOnly: true,
        singleLinkFilesOnly: true,
        topLevelNodeModulesExcluded: true,
      },
      {
        packageName: 'playwright-core',
        version: '1.62.1',
        treeDigest:
          'sha256:c3d1a9f4d8c8a2f5251c323aa3a4cb4202ba86f7ba4ff6330c1fa0e634f7c357',
        regularFileCount: 111,
        expandedByteLength: 13_442_086,
        unixModeCounts: { '100644': 98, '100755': 13 },
        regularFilesOnly: true,
        singleLinkFilesOnly: true,
        topLevelNodeModulesExcluded: true,
      },
    ]);
    if (process.platform === 'linux') {
      expect(audit.playwrightTopLevelNodeModulesAbsent).toBe(true);
      expect(audit.darwinOptionalFseventsPresent).toBe(false);
    } else {
      expect(process.platform).toBe('darwin');
      expect(audit.hostPlatform).toMatch(/^darwin-(?:arm64|x64)$/);
      expect(audit.darwinOptionalFseventsPresent
        || audit.playwrightTopLevelNodeModulesAbsent).toBe(true);
    }
    expect(Object.isFrozen(audit)).toBe(true);
    expect(Object.isFrozen(audit.packages)).toBe(true);
    expect(Object.isFrozen(audit.claims)).toBe(true);

    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain('node_modules/');
    expect(serialized).not.toMatch(/https?:\/\//);
    expect(serialized).not.toContain(fileURLToPath(new URL('../../../../', import.meta.url)));

    const source = readFileSync(new URL(
      './private-playwright-package-preflight-v049.mjs',
      import.meta.url,
    ), 'utf8');
    expect(source).not.toMatch(/(?:from|import\s*\()\s*['"]playwright(?:-core)?(?:\/|['"])/);
  });

  it('recomputes the locked tiny tree using the exact canonical protocol', () => {
    const fixture = createFixture();
    const result = verifyFixture(fixture);
    expect(result).toMatchObject({
      packageName: 'fixture-package',
      version: '1.0.0-test',
      treeDigest: fixture.binding.ownPackageTree.digest,
      regularFileCount: 3,
      expandedByteLength: fixture.binding.ownPackageTree.expandedByteLength,
      unixModeCounts: { '100644': 2, '100755': 1 },
      topLevelNodeModulesExcluded: true,
    });
    expect(result.entries.map((entry) => entry.path)).toEqual([
      'lib/data.txt', 'package.json', 'run.js',
    ]);
  });

  it('excludes only the package-root node_modules subtree from the own-package digest', () => {
    const fixture = createFixture();
    const dependencyRoot = path.join(fixture.packageRoot, 'node_modules', 'untrusted');
    mkdirSync(dependencyRoot, { recursive: true, mode: 0o755 });
    symlinkSync('/does/not/exist', path.join(dependencyRoot, 'ignored-link'));
    expect(verifyFixture(fixture).treeDigest).toBe(fixture.binding.ownPackageTree.digest);

    const nested = path.join(fixture.packageRoot, 'lib', 'node_modules');
    mkdirSync(nested, { mode: 0o755 });
    writeFileSync(path.join(nested, 'not-excluded'), 'extra', { mode: 0o644 });
    expect(() => verifyFixture(fixture)).toThrow(/own-package-expanded-size-bound/);
  });

  it('rejects a same-size content mutation by the canonical tree digest', () => {
    const fixture = createFixture();
    const filename = path.join(fixture.packageRoot, 'lib', 'data.txt');
    const original = readFileSync(filename);
    original[0] ^= 1;
    writeFileSync(filename, original, { mode: 0o644 });
    expect(() => verifyFixture(fixture)).toThrow(/own-package-tree-mismatch/);
  });

  it('rejects an extra regular file at the locked count or size bound', () => {
    const fixture = createFixture();
    writeFileSync(path.join(fixture.packageRoot, 'extra.txt'), 'x', { mode: 0o644 });
    expect(() => verifyFixture(fixture)).toThrow(/own-package-(?:expanded-size|file-count)-bound/);
  });

  it('rejects a mode mutation even when file bytes and size are unchanged', () => {
    const fixture = createFixture();
    chmodSync(path.join(fixture.packageRoot, 'lib', 'data.txt'), 0o600);
    expect(() => verifyFixture(fixture)).toThrow(/own-package-tree-mismatch/);
  });

  it('rejects a symlink anywhere inside the own-package tree', () => {
    const fixture = createFixture();
    symlinkSync('data.txt', path.join(fixture.packageRoot, 'lib', 'alias.txt'));
    expect(() => verifyFixture(fixture)).toThrow(/own-package-nonregular-or-linked-entry/);
  });

  it('rejects a hard-linked regular file even when the digest target is locked', () => {
    const fixture = createFixture();
    linkSync(
      path.join(fixture.packageRoot, 'lib', 'data.txt'),
      path.join(fixture.packageRoot, 'lib', 'hard-link.txt'),
    );
    expect(lstatSync(path.join(fixture.packageRoot, 'lib', 'data.txt')).nlink).toBe(2);
    expect(() => verifyFixture(fixture)).toThrow(/own-package-nonregular-or-linked-entry/);
  });

  it('rejects a symlinked package root before walking its contents', () => {
    const fixture = createFixture();
    const alias = path.join(fixture.root, 'package-alias');
    symlinkSync(fixture.packageRoot, alias);
    expect(() => __testOnlyVerifyOwnPackageTreeV049({
      packageRoot: alias,
      binding: fixture.binding,
      version: fixture.version,
    })).toThrow(/package-root-not-canonical-directory/);
  });

  it('rejects production arguments and closed-test-contract extensions', () => {
    const fixture = createFixture();
    expect(() => preflightPrivatePlaywrightPackagesV049({
      packageRoot: fixture.packageRoot,
    })).toThrow(/production-entry-accepts-no-input/);
    expect(() => __testOnlyVerifyOwnPackageTreeV049({
      packageRoot: fixture.packageRoot,
      binding: fixture.binding,
      version: fixture.version,
      extra: true,
    })).toThrow(/options differ from the closed contract/);
    expect(() => __testOnlyVerifyOwnPackageTreeV049({
      packageRoot: fixture.packageRoot,
      binding: fixture.binding,
      version: fixture.version,
      [Symbol('hidden')]: true,
    })).toThrow(/options differ from the closed contract/);
  });
});

function createFixture() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'tf-pw-preflight-v049-')));
  roots.push(root);
  const packageRoot = path.join(root, 'fixture-package');
  mkdirSync(path.join(packageRoot, 'lib'), { recursive: true, mode: 0o755 });
  writeFileSync(
    path.join(packageRoot, 'package.json'),
    '{"name":"fixture-package","version":"1.0.0-test"}\n',
    { mode: 0o644 },
  );
  writeFileSync(path.join(packageRoot, 'lib', 'data.txt'), 'locked bytes\n', { mode: 0o644 });
  writeFileSync(path.join(packageRoot, 'run.js'), '#!/usr/bin/env node\n', { mode: 0o755 });
  chmodSync(path.join(packageRoot, 'run.js'), 0o755);
  const version = '1.0.0-test';
  const tarballSha256 = `sha256:${'a'.repeat(64)}`;
  const descriptor = computeFixtureDescriptor(packageRoot, version, tarballSha256);
  return {
    root,
    packageRoot,
    version,
    binding: Object.freeze({
      packageName: 'fixture-package',
      tarballSha256,
      ownPackageTree: Object.freeze({
        schemaVersion: 'tf.npm-package-content-tree/1',
        digest: descriptor.digest,
        digestProtocol:
          'canonical-json-plus-lf-over-root-stripped-regular-path-mode-size-and-content-digest',
        regularFileCount: descriptor.entries.length,
        expandedByteLength: descriptor.entries.reduce((sum, entry) => sum + entry.sizeBytes, 0),
        unixModeCounts: descriptor.unixModeCounts,
        symlinkHardlinkOrSpecialCount: 0,
      }),
    }),
  };
}

function verifyFixture(fixture) {
  return __testOnlyVerifyOwnPackageTreeV049({
    packageRoot: fixture.packageRoot,
    binding: fixture.binding,
    version: fixture.version,
  });
}

function computeFixtureDescriptor(packageRoot, version, tarballSha256) {
  const paths = ['lib/data.txt', 'package.json', 'run.js'];
  const entries = paths.map((relativePath) => {
    const filename = path.join(packageRoot, ...relativePath.split('/'));
    const metadata = lstatSync(filename);
    const bytes = readFileSync(filename);
    return {
      mode: (metadata.mode & 0o177777).toString(8).padStart(6, '0'),
      path: relativePath,
      sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      sizeBytes: bytes.length,
      type: 'regular',
    };
  }).sort((left, right) => Buffer.compare(
    Buffer.from(left.path, 'utf8'),
    Buffer.from(right.path, 'utf8'),
  ));
  const unixModeCounts = {};
  for (const entry of entries) {
    unixModeCounts[entry.mode] = (unixModeCounts[entry.mode] ?? 0) + 1;
  }
  const preimage = {
    entries,
    package: 'fixture-package',
    schemaVersion: 'tf.npm-package-content-tree/1',
    tarballSha256,
    version,
  };
  return {
    digest: `sha256:${createHash('sha256').update(`${canonicalJson(preimage)}\n`).digest('hex')}`,
    entries,
    unixModeCounts,
  };
}

function canonicalJson(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  }
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}
