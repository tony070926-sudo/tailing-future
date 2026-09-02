import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { lstatSync, readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { PRIVATE_CHROMIUM_LOCK_V049 } from './chromium-v049-lock.mjs';

const require = createRequire(import.meta.url);
const packageLock = JSON.parse(readFileSync(new URL(
  '../../../../package-lock.json',
  import.meta.url,
), 'utf8'));

describe('V049 exact private Chromium runtime lock', () => {
  it('matches the exact Playwright package and bundled Chromium revision', () => {
    const playwrightPackage = require('playwright/package.json');
    const browsers = JSON.parse(readFileSync(path.join(
      path.dirname(require.resolve('playwright-core/package.json')),
      'browsers.json',
    ), 'utf8'));
    const chromium = browsers.browsers.find((entry) => entry.name === 'chromium');

    expect(playwrightPackage.version).toBe(PRIVATE_CHROMIUM_LOCK_V049.playwrightVersion);
    expect(chromium).toMatchObject({
      revision: PRIVATE_CHROMIUM_LOCK_V049.chromiumRevision,
      browserVersion: PRIVATE_CHROMIUM_LOCK_V049.browserVersion,
      installByDefault: true,
    });
    for (const packageName of ['playwright', 'playwright-core']) {
      const lockKey = packageName === 'playwright' ? 'playwright' : 'playwrightCore';
      const binding = PRIVATE_CHROMIUM_LOCK_V049.npmPackageLockBindings[lockKey];
      expect(packageLock.packages[binding.packagePath]).toMatchObject({
        version: PRIVATE_CHROMIUM_LOCK_V049.playwrightVersion,
        resolved: binding.resolved,
        integrity: binding.integrity,
      });
      expect(binding.packageName).toBe(packageName);
      expect(binding.tarballByteLength).toBeGreaterThan(0);
      expect(binding.tarballSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(binding.ownPackageTree).toMatchObject({
        schemaVersion: 'tf.npm-package-content-tree/1',
        digest: expect.stringMatching(/^sha256:[0-9a-f]{64}$/),
        symlinkHardlinkOrSpecialCount: 0,
      });
      expect(computeInstalledOwnPackageTree(binding)).toEqual({
        digest: binding.ownPackageTree.digest,
        expandedByteLength: binding.ownPackageTree.expandedByteLength,
        regularFileCount: binding.ownPackageTree.regularFileCount,
        unixModeCounts: binding.ownPackageTree.unixModeCounts,
      });
      expect(Object.isFrozen(binding.ownPackageTree)).toBe(true);
    }
    expect(PRIVATE_CHROMIUM_LOCK_V049.npmPackageLockBindings.playwrightCore
      .browsersJsonSha256).toBe(
      'sha256:f306eed529599b1eaf2f8a85db9de2b23e1a3fe36c2b66434b7c9434fb627a99',
    );
    const browsersPath = path.join(
      path.dirname(require.resolve('playwright-core/package.json')),
      'browsers.json',
    );
    expect(`sha256:${createHash('sha256').update(readFileSync(browsersPath)).digest('hex')}`)
      .toBe(PRIVATE_CHROMIUM_LOCK_V049.npmPackageLockBindings.playwrightCore
        .browsersJsonSha256);
    expect(Object.isFrozen(PRIVATE_CHROMIUM_LOCK_V049.npmPackageLockBindings)).toBe(true);
  });

  it('locks exact Linux archive/executable bytes and forbids fallback claims', () => {
    expect(PRIVATE_CHROMIUM_LOCK_V049).toMatchObject({
      schemaVersion: 'tf.private-chromium-runtime-lock/0.4.9',
      browserDrawRequired: true,
      webgl2Required: true,
      systemChromeFallbackAllowed: false,
      floatingRevisionAllowed: false,
      distributionTreeIdentityOnly: true,
      hostSharedLibraryClosureLocked: false,
      immutableRuntimeSnapshotVerified: false,
      crossPlatformClaim: false,
      screenshotsTracesVideosOrHarPublishable: false,
      executionAuthenticityVerified: false,
      reproduced: false,
      promotionEligible: false,
      publicDistributionEligible: false,
      cloudflareDistributionEligible: false,
    });
    const linux = PRIVATE_CHROMIUM_LOCK_V049.platforms['linux-x64'];
    expect(linux.archiveDiscoveryUrl).toBe(
      'https://cdn.playwright.dev/builds/cft/151.0.7922.34/linux64/chrome-linux64.zip',
    );
    expect(linux.archiveUrl).toBe(
      'https://storage.googleapis.com/chrome-for-testing-public/151.0.7922.34/linux64/chrome-linux64.zip?generation=1784092744255039',
    );
    expect(linux.archiveObjectGeneration).toBe('1784092744255039');
    const archiveUrl = new URL(linux.archiveUrl);
    expect(archiveUrl.origin).toBe('https://storage.googleapis.com');
    expect([...archiveUrl.searchParams.entries()]).toEqual([
      ['generation', linux.archiveObjectGeneration],
    ]);
    expect(linux.archiveByteLength).toBe(193_282_658);
    expect(linux.executableByteLength).toBe(290_614_600);
    expect(linux.archiveSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(linux.executableSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(linux.archiveSha256).not.toBe(linux.executableSha256);
    expect(linux.archiveStructure).toEqual({
      rootDirectory: 'chrome-linux64',
      memberCount: 308,
      regularFileCount: 303,
      explicitDirectoryCount: 5,
      derivedDirectoryCount: 11,
      runtimeTreeEntryCount: 314,
      expandedByteLength: 406_847_046,
      compressedMemberByteLength: 193_220_360,
      endOfCentralDirectoryOffset: 193_282_636,
      centralDirectoryOffset: 193_249_650,
      centralDirectoryByteLength: 32_986,
      maximumMemberByteLength: 290_614_600,
      maximumPathUtf8Bytes: 83,
      maximumPathComponents: 5,
      compressionMethodCounts: { stored: 6, deflated: 302 },
      generalPurposeFlagCounts: { zero: 5, four: 303 },
      unixModeCounts: {
        '040755': 5,
        '100600': 2,
        '100644': 292,
        '100755': 9,
      },
      maximumPerMemberCompressionRatio: 5,
      maximumAggregateExpandedToArchiveRatio: 3,
      zip64Allowed: false,
      dataDescriptorAllowed: false,
      encryptedMembersAllowed: false,
      symlinksOrSpecialFilesAllowed: false,
      duplicateOrCollidingPathsAllowed: false,
    });
    expect(linux.runtimeTree).toMatchObject({
      schemaVersion: 'tf.private-chromium-runtime-tree/0.4.9',
      digest: 'sha256:ef61b26dc6a3b390355d5a4c1ea60b9ae4839bb3add815fadb26c626e7fae658',
      regularFileCount: 303,
      directoryCount: 11,
      entryCount: 314,
    });
    expect(linux.runtimeTree.executableFiles).toHaveLength(9);
    expect(linux.runtimeTree.executableFiles.find((entry) => entry.path === 'chrome'))
      .toEqual({
        path: 'chrome',
        mode: '100755',
        sizeBytes: 290_614_600,
        sha256: linux.executableSha256,
      });
    expect(linux.frozenRuntimeTree).toEqual({
      schemaVersion: 'tf.private-chromium-frozen-runtime-tree/0.4.9',
      digest: 'sha256:379be99b95a5b092c51dee46cc3053b08ec513618fe939a945df1f3a9a04adb3',
      digestProtocol:
        'canonical-json-plus-lf-over-distribution-digest-and-root-stripped-frozen-path-type-mode-size-content-digest',
      distributionTreeDigest: linux.runtimeTree.digest,
      ownerUid: 0,
      ownerGid: 0,
      rootAndDirectoryMode: '040555',
      executableFileMode: '100555',
      otherFileMode: '100444',
      preAndPostExecutionVerificationRequired: true,
      hostRuntimeClosureVerified: false,
    });
    expect(Object.isFrozen(PRIVATE_CHROMIUM_LOCK_V049)).toBe(true);
    expect(Object.isFrozen(linux)).toBe(true);
    expect(Object.isFrozen(linux.archiveStructure)).toBe(true);
    expect(Object.isFrozen(linux.runtimeTree.executableFiles)).toBe(true);
  });

  it('keeps the independent Python extraction policy byte-aligned with the JS lock', () => {
    const linux = PRIVATE_CHROMIUM_LOCK_V049.platforms['linux-x64'];
    const harnessDirectory = fileURLToPath(new URL('.', import.meta.url));
    const source = [
      'import json,sys',
      'sys.path.insert(0, sys.argv[1])',
      'import safe_extract_private_chromium_v049 as module',
      'p=module._PRODUCTION_POLICY',
      'print(json.dumps({',
      '"archiveByteLength":p.archive_bytes,',
      '"archiveMode":format(p.archive_mode,"04o"),',
      '"archiveSha256":p.archive_sha256,',
      '"directoryCount":p.expected_directory_count,',
      '"executableByteLength":p.executable_bytes,',
      '"executableMembers":sorted(p.executable_members),',
      '"executableSha256":p.executable_sha256,',
      '"expandedByteLength":p.expected_expanded_bytes,',
      '"fileCount":p.expected_file_count,',
      '"frozenTreeDigest":p.expected_frozen_tree_digest,',
      '"frozenTreeSchemaVersion":module._FROZEN_TREE_SCHEMA_VERSION,',
      '"maxNameBytes":p.max_name_bytes,',
      '"maxRelativePathComponents":p.max_path_components,',
      '"memberCount":p.expected_member_count,',
      '"requireCurrentUid":p.require_current_uid,',
      '"rootDirectory":p.root_directory,',
      '"treeDigest":p.expected_tree_digest,',
      '"treeSchemaVersion":p.tree_schema_version',
      '},sort_keys=True,separators=(",",":")))',
    ].join('\n');
    const policy = JSON.parse(execFileSync('python3', ['-c', source, harnessDirectory], {
      encoding: 'utf8',
    }));

    expect(policy).toEqual({
      archiveByteLength: linux.archiveByteLength,
      archiveMode: '0400',
      archiveSha256: linux.archiveSha256,
      directoryCount: linux.runtimeTree.directoryCount,
      executableByteLength: linux.executableByteLength,
      executableMembers: linux.runtimeTree.executableFiles.map((entry) => entry.path).sort(),
      executableSha256: linux.executableSha256,
      expandedByteLength: linux.archiveStructure.expandedByteLength,
      fileCount: linux.runtimeTree.regularFileCount,
      maxNameBytes: linux.archiveStructure.maximumPathUtf8Bytes,
      maxRelativePathComponents: linux.archiveStructure.maximumPathComponents - 1,
      memberCount: linux.archiveStructure.memberCount,
      requireCurrentUid: true,
      rootDirectory: linux.archiveStructure.rootDirectory,
      treeDigest: linux.runtimeTree.digest,
      treeSchemaVersion: linux.runtimeTree.schemaVersion,
      frozenTreeDigest: linux.frozenRuntimeTree.digest,
      frozenTreeSchemaVersion: linux.frozenRuntimeTree.schemaVersion,
    });
  });
});

function computeInstalledOwnPackageTree(binding) {
  const root = path.dirname(require.resolve(`${binding.packageName}/package.json`));
  const entries = [];
  let expandedByteLength = 0;
  const unixModeCounts = {};

  walk(root, '');
  entries.sort((left, right) => Buffer.compare(
    Buffer.from(left.path, 'utf8'),
    Buffer.from(right.path, 'utf8'),
  ));
  const preimage = {
    entries,
    package: binding.packageName,
    schemaVersion: binding.ownPackageTree.schemaVersion,
    tarballSha256: binding.tarballSha256,
    version: PRIVATE_CHROMIUM_LOCK_V049.playwrightVersion,
  };
  return {
    digest: `sha256:${createHash('sha256').update(`${canonicalJson(preimage)}\n`).digest('hex')}`,
    expandedByteLength,
    regularFileCount: entries.length,
    unixModeCounts,
  };

  function walk(directory, relativeDirectory) {
    const children = readdirSync(directory, { withFileTypes: true })
      .filter((child) => !(relativeDirectory === '' && child.name === 'node_modules'))
      .sort((left, right) => Buffer.compare(
        Buffer.from(left.name, 'utf8'),
        Buffer.from(right.name, 'utf8'),
      ));
    for (const child of children) {
      const relativePath = relativeDirectory === ''
        ? child.name
        : `${relativeDirectory}/${child.name}`;
      const absolutePath = path.join(directory, child.name);
      const metadata = lstatSync(absolutePath);
      if (metadata.isDirectory() && !metadata.isSymbolicLink()) {
        walk(absolutePath, relativePath);
        continue;
      }
      expect(metadata.isFile()).toBe(true);
      expect(metadata.isSymbolicLink()).toBe(false);
      const mode = (metadata.mode & 0o177777).toString(8).padStart(6, '0');
      const bytes = readFileSync(absolutePath);
      entries.push({
        mode,
        path: relativePath,
        sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
        sizeBytes: bytes.length,
        type: 'regular',
      });
      expandedByteLength += bytes.length;
      unixModeCounts[mode] = (unixModeCounts[mode] ?? 0) + 1;
    }
  }
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
