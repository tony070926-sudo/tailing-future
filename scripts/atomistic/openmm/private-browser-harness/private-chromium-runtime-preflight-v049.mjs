#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readlinkSync,
  readSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PRIVATE_CHROMIUM_LOCK_V049 } from './chromium-v049-lock.mjs';

const AUDIT_SCHEMA_VERSION = 'tf.private-chromium-runtime-preflight/0.4.9';
const TEST_LOCK_SCHEMA_VERSION = 'tf.private-chromium-runtime-preflight-test-lock/0.4.9';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const MODE = /^(?:040|100)[0-7]{3}$/;
const READ_BUFFER_BYTES = 1024 * 1024;
const MAXIMUM_PROC_STATUS_BYTES = 64 * 1024;
const MAXIMUM_MOUNTINFO_BYTES = 1024 * 1024;
const ZERO_CAPABILITY_VECTOR = '0000000000000000';
const LINUX_CAPABILITY_FIELDS = Object.freeze([
  'CapInh',
  'CapPrm',
  'CapEff',
  'CapBnd',
  'CapAmb',
]);

/**
 * Verify one root-owned frozen Linux Chromium distribution tree. This is a
 * checkpoint verifier, not proof that the host runtime or tree stays immutable
 * between checkpoints.
 */
export function preflightPrivateChromiumRuntimeV049(options) {
  const normalized = validateProductionOptions(options);
  const environment = productionEnvironment(normalized.runtimeRoot);
  const expectation = productionExpectation();
  return verifyRuntimeTree({
    ...normalized,
    environment,
    expectation,
    testFixture: false,
  });
}

/** Test-only seam for tiny trees; it cannot accept the production lock schema. */
export function __testOnlyPreflightPrivateChromiumRuntimeV049(options) {
  const normalized = validateTestOptions(options);
  return verifyRuntimeTree({
    ...normalized,
    testFixture: true,
  });
}

/** Test-only parser seam; it never reads process state or emits release evidence. */
export function __testOnlyVerifyLinuxProcessStatusV049(options) {
  if (!isClosedObject(options, ['processIdentity', 'status'])
      || typeof options.status !== 'string'
      || !isClosedObject(options.processIdentity, [
        'runningEffectiveGid', 'runningEffectiveUid', 'runningRealGid',
        'runningRealUid',
      ])) {
    throw new TypeError('test-only Linux process status options are invalid');
  }
  return verifyLinuxProcessStatus(options.status, options.processIdentity);
}

/** Test-only parser seam for the Linux process and read-only mount boundary. */
export function __testOnlyVerifyLinuxRuntimeBoundaryV049(options) {
  if (!isClosedObject(options, [
    'mountInfo', 'mountNamespaceIdentity', 'processIdentity', 'runtimeRoot', 'status',
  ])
      || typeof options.status !== 'string'
      || typeof options.mountInfo !== 'string'
      || typeof options.mountNamespaceIdentity !== 'string'
      || typeof options.runtimeRoot !== 'string'
      || !isClosedObject(options.processIdentity, [
        'runningEffectiveGid', 'runningEffectiveUid', 'runningRealGid',
        'runningRealUid',
      ])) {
    throw new TypeError('test-only Linux runtime boundary options are invalid');
  }
  return Object.freeze({
    ...verifyLinuxProcessStatus(options.status, options.processIdentity),
    ...verifyReadOnlyRuntimeMount(
      options.mountInfo,
      options.mountNamespaceIdentity,
      options.runtimeRoot,
    ),
  });
}

function verifyRuntimeTree({ runtimeRoot, environment, expectation, testFixture }) {
  let stage = 'input-root';
  try {
    const runtimeRootMetadata = assertCanonicalDirectory(
      runtimeRoot,
      expectation.ownerUid,
      expectation.ownerGid,
      expectation.rootAndDirectoryMode,
      'runtime-root',
    );
    let trustedAncestors = [];
    if (environment.requireTrustedAncestors) {
      stage = 'trusted-ancestors';
      trustedAncestors = verifyTrustedAncestors(path.dirname(runtimeRoot));
    }

    stage = 'distribution-root';
    const rootChildren = sortedChildren(runtimeRoot);
    if (rootChildren.length !== 1 || rootChildren[0].name !== expectation.rootDirectory
        || !rootChildren[0].isDirectory() || rootChildren[0].isSymbolicLink()) {
      fail('runtime-root-children-mismatch');
    }
    const distributionRoot = path.join(runtimeRoot, expectation.rootDirectory);
    const distributionRootMetadata = assertCanonicalDirectory(
      distributionRoot,
      expectation.ownerUid,
      expectation.ownerGid,
      expectation.rootAndDirectoryMode,
      'distribution-root',
    );

    stage = 'frozen-tree-walk';
    const entries = [];
    const seenCasefolded = new Set();
    const executablePaths = new Set();
    let regularFileCount = 0;
    let directoryCount = 0;
    let expandedByteLength = 0;
    walk(distributionRoot, '');

    entries.sort((left, right) => Buffer.compare(
      Buffer.from(left.path, 'utf8'),
      Buffer.from(right.path, 'utf8'),
    ));
    if (regularFileCount !== expectation.regularFileCount
        || directoryCount !== expectation.directoryCount
        || entries.length !== expectation.regularFileCount + expectation.directoryCount
        || expandedByteLength !== expectation.expandedByteLength
        || canonicalJson([...executablePaths].sort())
          !== canonicalJson([...expectation.executableFiles.keys()].sort())) {
      fail('frozen-tree-cardinality-mismatch');
    }

    stage = 'frozen-tree-digest';
    const preimage = {
      distributionTreeDigest: expectation.distributionTreeDigest,
      entries,
      platform: expectation.platform,
      rootDirectory: expectation.rootDirectory,
      schemaVersion: expectation.schemaVersion,
    };
    const actualDigest = `sha256:${createHash('sha256')
      .update(`${canonicalJson(preimage)}\n`, 'utf8').digest('hex')}`;
    if (actualDigest !== expectation.digest) fail('frozen-tree-digest-mismatch');

    stage = 'main-executable';
    const mainExecutable = entries.find((entry) => entry.type === 'regular'
      && entry.path === expectation.mainExecutable.path);
    if (mainExecutable === undefined
        || mainExecutable.sizeBytes !== expectation.mainExecutable.sizeBytes
        || mainExecutable.sha256 !== expectation.mainExecutable.sha256
        || mainExecutable.mode !== expectation.executableFileMode) {
      fail('main-executable-mismatch');
    }

    stage = 'final-root-identity';
    assertSameDirectory(
      assertCanonicalDirectory(
        runtimeRoot,
        expectation.ownerUid,
        expectation.ownerGid,
        expectation.rootAndDirectoryMode,
        'runtime-root',
      ),
      runtimeRootMetadata,
    );
    assertSameDirectory(
      assertCanonicalDirectory(
        distributionRoot,
        expectation.ownerUid,
        expectation.ownerGid,
        expectation.rootAndDirectoryMode,
        'distribution-root',
      ),
      distributionRootMetadata,
    );
    if (environment.requireTrustedAncestors) {
      stage = 'final-trusted-ancestor-identity';
      assertTrustedAncestorsUnchanged(trustedAncestors);
    }

    return deepFreeze({
      schemaVersion: testFixture
        ? 'tf.private-chromium-runtime-preflight-test-audit/0.4.9'
        : AUDIT_SCHEMA_VERSION,
      profile: testFixture
        ? 'tiny-fixture-frozen-distribution-tree-checkpoint'
        : 'root-owned-frozen-distribution-tree-nonroot-checkpoint',
      testFixture,
      platform: expectation.platform,
      browserVersion: expectation.browserVersion,
      chromiumRevision: expectation.chromiumRevision,
      distributionTreeDigest: expectation.distributionTreeDigest,
      frozenRuntimeTreeDigest: actualDigest,
      regularFileCount,
      directoryCount,
      expandedByteLength,
      executableFileCount: executablePaths.size,
      ownerUid: expectation.ownerUid,
      ownerGid: expectation.ownerGid,
      rootAndDirectoryMode: expectation.rootAndDirectoryMode,
      executableFileMode: expectation.executableFileMode,
      otherFileMode: expectation.otherFileMode,
      runningRealUid: environment.runningRealUid,
      runningEffectiveUid: environment.runningEffectiveUid,
      runningSavedSetUid: environment.runningSavedSetUid,
      runningFilesystemUid: environment.runningFilesystemUid,
      runningRealGid: environment.runningRealGid,
      runningEffectiveGid: environment.runningEffectiveGid,
      runningSavedSetGid: environment.runningSavedSetGid,
      runningFilesystemGid: environment.runningFilesystemGid,
      supplementaryGroupCount: environment.supplementaryGroupCount,
      allLinuxCredentialIdsNonRoot: environment.allLinuxCredentialIdsNonRoot,
      allLinuxCredentialIdsExact: environment.allLinuxCredentialIdsExact,
      supplementaryGroupsAbsent: environment.supplementaryGroupsAbsent,
      allLinuxCapabilitySetsAbsent: environment.allLinuxCapabilitySetsAbsent,
      effectiveCapabilitiesAbsent: environment.allLinuxCapabilitySetsAbsent,
      noNewPrivilegesVerified: environment.noNewPrivilegesVerified,
      nonRootExecutionCredentialsVerified:
        environment.allLinuxCredentialIdsNonRoot
        && environment.allLinuxCredentialIdsExact
        && environment.supplementaryGroupsAbsent
        && environment.allLinuxCapabilitySetsAbsent
        && environment.noNewPrivilegesVerified,
      runtimeRootExactMountPointVerified: environment.runtimeRootExactMountPointVerified,
      runtimeRootReadOnlyMountVerified: environment.runtimeRootReadOnlyMountVerified,
      runtimeRootNosuidMountVerified: environment.runtimeRootNosuidMountVerified,
      runtimeRootNodevMountVerified: environment.runtimeRootNodevMountVerified,
      runtimeMountPrivatePropagationVerified:
        environment.runtimeMountPrivatePropagationVerified,
      mountNamespaceIdentityObserved: environment.mountNamespaceIdentityObserved,
      mountNamespaceIsolationVerified: environment.mountNamespaceIsolationVerified,
      dedicatedMountNamespaceVerified: false,
      rootOwnedFrozenDistributionTreeCheckpointVerified: !testFixture,
      frozenDistributionTreeCheckpointVerified: true,
      trustedAncestorCount: trustedAncestors.length,
      trustedAncestorDacModePolicyVerified: environment.requireTrustedAncestors,
      privilegedConcurrentMutationExcluded: false,
      ancestorRenameResistanceVerified: false,
      preAndPostExecutionVerificationRequired: true,
      completeHostRuntimeClosureVerified: false,
      immutableRuntimeSnapshotVerified: false,
      claims: {
        realBrowserExecutionVerified: false,
        executionAuthenticityVerified: false,
        reproduced: false,
        promotionEligible: false,
        publicDistributionEligible: false,
        cloudflareDistributionEligible: false,
      },
    });

    function walk(directory, relativeDirectory) {
      const directoryBefore = lstatSync(directory);
      const children = sortedChildren(directory);
      for (const child of children) {
        if (!isSafeChildName(child.name)) fail('frozen-tree-path-invalid');
        const relativePath = relativeDirectory === ''
          ? child.name
          : `${relativeDirectory}/${child.name}`;
        const casefolded = relativePath.toLocaleLowerCase('en-US');
        if (seenCasefolded.has(casefolded)) fail('frozen-tree-path-collision');
        seenCasefolded.add(casefolded);
        const absolutePath = path.join(directory, child.name);
        if (child.isDirectory() && !child.isSymbolicLink()) {
          directoryCount += 1;
          if (directoryCount > expectation.directoryCount) {
            fail('frozen-tree-directory-count-bound');
          }
          assertCanonicalDirectory(
            absolutePath,
            expectation.ownerUid,
            expectation.ownerGid,
            expectation.rootAndDirectoryMode,
            'tree-directory',
          );
          entries.push({
            mode: expectation.rootAndDirectoryMode,
            path: relativePath,
            type: 'directory',
          });
          walk(absolutePath, relativePath);
          continue;
        }
        if (!child.isFile() || child.isSymbolicLink()) {
          fail('frozen-tree-nonregular-entry');
        }
        regularFileCount += 1;
        if (regularFileCount > expectation.regularFileCount) {
          fail('frozen-tree-file-count-bound');
        }
        const executableExpectation = expectation.executableFiles.get(relativePath);
        const expectedMode = executableExpectation === undefined
          ? expectation.otherFileMode
          : expectation.executableFileMode;
        const hashed = hashFrozenRegularFile(
          absolutePath,
          expectation.ownerUid,
          expectation.ownerGid,
          expectedMode,
          expectation.expandedByteLength - expandedByteLength,
        );
        expandedByteLength += hashed.sizeBytes;
        if (!Number.isSafeInteger(expandedByteLength)
            || expandedByteLength > expectation.expandedByteLength) {
          fail('frozen-tree-expanded-size-bound');
        }
        if (executableExpectation !== undefined) {
          if (hashed.sizeBytes !== executableExpectation.sizeBytes
              || hashed.sha256 !== executableExpectation.sha256) {
            fail('frozen-tree-executable-mismatch');
          }
          executablePaths.add(relativePath);
        }
        entries.push({
          mode: hashed.mode,
          path: relativePath,
          sha256: hashed.sha256,
          sizeBytes: hashed.sizeBytes,
          type: 'regular',
        });
      }
      assertSameDirectory(lstatSync(directory), directoryBefore);
    }
  } catch (error) {
    throw sanitizeFailure(error, stage);
  }
}

function productionExpectation() {
  const lock = PRIVATE_CHROMIUM_LOCK_V049;
  const linux = lock.platforms?.['linux-x64'];
  if (lock.schemaVersion !== 'tf.private-chromium-runtime-lock/0.4.9'
      || linux?.frozenRuntimeTree?.schemaVersion
        !== 'tf.private-chromium-frozen-runtime-tree/0.4.9'
      || linux.runtimeTree?.schemaVersion !== 'tf.private-chromium-runtime-tree/0.4.9'
      || linux.runtimeTree.digest
        !== 'sha256:ef61b26dc6a3b390355d5a4c1ea60b9ae4839bb3add815fadb26c626e7fae658'
      || linux.frozenRuntimeTree.digest
        !== 'sha256:379be99b95a5b092c51dee46cc3053b08ec513618fe939a945df1f3a9a04adb3'
      || linux.frozenRuntimeTree.digestProtocol
        !== 'canonical-json-plus-lf-over-distribution-digest-and-root-stripped-frozen-path-type-mode-size-content-digest'
      || linux.frozenRuntimeTree.distributionTreeDigest !== linux.runtimeTree.digest
      || linux.frozenRuntimeTree.ownerUid !== 0
      || linux.frozenRuntimeTree.ownerGid !== 0
      || linux.frozenRuntimeTree.rootAndDirectoryMode !== '040555'
      || linux.frozenRuntimeTree.executableFileMode !== '100555'
      || linux.frozenRuntimeTree.otherFileMode !== '100444'
      || linux.frozenRuntimeTree.preAndPostExecutionVerificationRequired !== true
      || linux.frozenRuntimeTree.hostRuntimeClosureVerified !== false) {
    fail('production-lock-mismatch');
  }
  return normalizeExpectation({
    lockSchemaVersion: lock.schemaVersion,
    platform: 'linux-x64',
    browserVersion: lock.browserVersion,
    chromiumRevision: lock.chromiumRevision,
    rootDirectory: linux.archiveStructure.rootDirectory,
    schemaVersion: linux.frozenRuntimeTree.schemaVersion,
    distributionTreeDigest: linux.frozenRuntimeTree.distributionTreeDigest,
    digest: linux.frozenRuntimeTree.digest,
    regularFileCount: linux.runtimeTree.regularFileCount,
    directoryCount: linux.runtimeTree.directoryCount,
    expandedByteLength: linux.archiveStructure.expandedByteLength,
    ownerUid: linux.frozenRuntimeTree.ownerUid,
    ownerGid: linux.frozenRuntimeTree.ownerGid,
    rootAndDirectoryMode: linux.frozenRuntimeTree.rootAndDirectoryMode,
    executableFileMode: linux.frozenRuntimeTree.executableFileMode,
    otherFileMode: linux.frozenRuntimeTree.otherFileMode,
    executableFiles: linux.runtimeTree.executableFiles,
    mainExecutable: {
      path: linux.executableRelativePath.slice(`${linux.archiveStructure.rootDirectory}/`.length),
      sizeBytes: linux.executableByteLength,
      sha256: linux.executableSha256,
    },
  }, false);
}

function productionEnvironment(runtimeRoot) {
  if (process.platform !== 'linux' || process.arch !== 'x64'
      || typeof process.getuid !== 'function' || typeof process.geteuid !== 'function'
      || typeof process.getgid !== 'function' || typeof process.getegid !== 'function') {
    fail('production-host-must-be-nonroot-linux-x64');
  }
  const processIdentity = {
    runningRealUid: process.getuid(),
    runningEffectiveUid: process.geteuid(),
    runningRealGid: process.getgid(),
    runningEffectiveGid: process.getegid(),
  };
  if (Object.values(processIdentity).some((identifier) =>
    !Number.isSafeInteger(identifier) || identifier < 1)) {
    fail('production-host-must-be-nonroot-linux-x64');
  }
  const linuxStatus = readAndVerifyLinuxProcessStatus(processIdentity);
  const mountBoundary = readAndVerifyReadOnlyRuntimeMount(runtimeRoot);
  return Object.freeze({
    ...processIdentity,
    ...linuxStatus,
    ...mountBoundary,
    requireTrustedAncestors: true,
  });
}

function validateProductionOptions(options) {
  if (!isClosedObject(options, ['runtimeRoot']) || typeof options.runtimeRoot !== 'string') {
    throw new TypeError('private Chromium runtime preflight options differ from the closed contract');
  }
  return { runtimeRoot: options.runtimeRoot };
}

function validateTestOptions(options) {
  if (!isClosedObject(options, ['environment', 'runtimeRoot', 'testLock'])
      || typeof options.runtimeRoot !== 'string'
      || !isClosedObject(options.environment, [
        'allLinuxCapabilitySetsAbsent', 'allLinuxCredentialIdsExact',
        'allLinuxCredentialIdsNonRoot', 'mountNamespaceIdentityObserved',
        'mountNamespaceIsolationVerified',
        'noNewPrivilegesVerified', 'requireTrustedAncestors',
        'runningEffectiveGid', 'runningEffectiveUid', 'runningFilesystemGid',
        'runningFilesystemUid', 'runningRealGid', 'runningRealUid',
        'runningSavedSetGid', 'runningSavedSetUid', 'runtimeMountPrivatePropagationVerified',
        'runtimeRootExactMountPointVerified', 'runtimeRootNodevMountVerified',
        'runtimeRootNosuidMountVerified', 'runtimeRootReadOnlyMountVerified',
        'supplementaryGroupCount', 'supplementaryGroupsAbsent',
      ])
      || !Number.isSafeInteger(options.environment.runningRealUid)
      || options.environment.runningRealUid < 1
      || !Number.isSafeInteger(options.environment.runningEffectiveUid)
      || options.environment.runningEffectiveUid < 1
      || !Number.isSafeInteger(options.environment.runningRealGid)
      || options.environment.runningRealGid < 1
      || !Number.isSafeInteger(options.environment.runningEffectiveGid)
      || options.environment.runningEffectiveGid < 1
      || !Number.isSafeInteger(options.environment.runningSavedSetUid)
      || options.environment.runningSavedSetUid < 1
      || !Number.isSafeInteger(options.environment.runningFilesystemUid)
      || options.environment.runningFilesystemUid < 1
      || !Number.isSafeInteger(options.environment.runningSavedSetGid)
      || options.environment.runningSavedSetGid < 1
      || !Number.isSafeInteger(options.environment.runningFilesystemGid)
      || options.environment.runningFilesystemGid < 1
      || options.environment.runningEffectiveUid !== options.environment.runningRealUid
      || options.environment.runningSavedSetUid !== options.environment.runningRealUid
      || options.environment.runningFilesystemUid !== options.environment.runningRealUid
      || options.environment.runningEffectiveGid !== options.environment.runningRealGid
      || options.environment.runningSavedSetGid !== options.environment.runningRealGid
      || options.environment.runningFilesystemGid !== options.environment.runningRealGid
      || options.environment.supplementaryGroupCount !== 0
      || options.environment.allLinuxCredentialIdsNonRoot !== true
      || options.environment.allLinuxCredentialIdsExact !== true
      || options.environment.supplementaryGroupsAbsent !== true
      || options.environment.allLinuxCapabilitySetsAbsent !== true
      || options.environment.noNewPrivilegesVerified !== true
      || options.environment.runtimeRootExactMountPointVerified !== true
      || options.environment.runtimeRootReadOnlyMountVerified !== true
      || options.environment.runtimeRootNosuidMountVerified !== true
      || options.environment.runtimeRootNodevMountVerified !== true
      || options.environment.runtimeMountPrivatePropagationVerified !== true
      || options.environment.mountNamespaceIdentityObserved !== true
      || options.environment.mountNamespaceIsolationVerified !== false
      || options.environment.requireTrustedAncestors !== false) {
    throw new TypeError('test-only Chromium runtime preflight options are invalid');
  }
  const expectation = normalizeExpectation(options.testLock, true);
  return {
    runtimeRoot: options.runtimeRoot,
    environment: Object.freeze({ ...options.environment }),
    expectation,
  };
}

function normalizeExpectation(value, testOnly) {
  const keys = [
    'browserVersion', 'chromiumRevision', 'digest', 'directoryCount',
    'distributionTreeDigest', 'executableFileMode', 'executableFiles',
    'expandedByteLength', 'lockSchemaVersion', 'mainExecutable', 'otherFileMode',
    'ownerGid', 'ownerUid', 'platform', 'regularFileCount', 'rootAndDirectoryMode',
    'rootDirectory', 'schemaVersion',
  ];
  if (!isClosedObject(value, keys)
      || (testOnly
        ? value.lockSchemaVersion !== TEST_LOCK_SCHEMA_VERSION
        : value.lockSchemaVersion !== 'tf.private-chromium-runtime-lock/0.4.9')
      || value.platform !== 'linux-x64'
      || typeof value.browserVersion !== 'string'
      || typeof value.chromiumRevision !== 'string'
      || typeof value.rootDirectory !== 'string'
      || !isSafeChildName(value.rootDirectory)
      || typeof value.schemaVersion !== 'string'
      || !DIGEST.test(value.distributionTreeDigest)
      || !DIGEST.test(value.digest)
      || !Number.isSafeInteger(value.regularFileCount) || value.regularFileCount < 1
      || !Number.isSafeInteger(value.directoryCount) || value.directoryCount < 0
      || !Number.isSafeInteger(value.expandedByteLength) || value.expandedByteLength < 1
      || !Number.isSafeInteger(value.ownerUid) || value.ownerUid < 0
      || !Number.isSafeInteger(value.ownerGid) || value.ownerGid < 0
      || !MODE.test(value.rootAndDirectoryMode)
      || !MODE.test(value.executableFileMode)
      || !MODE.test(value.otherFileMode)
      || !Array.isArray(value.executableFiles) || value.executableFiles.length < 1
      || !isClosedObject(value.mainExecutable, ['path', 'sha256', 'sizeBytes'])) {
    fail('runtime-tree-expectation-invalid');
  }
  if (testOnly && (value.regularFileCount > 64 || value.directoryCount > 32
      || value.expandedByteLength > 1024 * 1024)) {
    fail('test-runtime-tree-bound-exceeded');
  }
  const executableFiles = new Map();
  for (const entry of value.executableFiles) {
    if (!isClosedObject(entry, ['mode', 'path', 'sha256', 'sizeBytes'])
        || !isSafeRelativePath(entry.path)
        || entry.mode !== '100755'
        || !DIGEST.test(entry.sha256)
        || !Number.isSafeInteger(entry.sizeBytes) || entry.sizeBytes < 1
        || executableFiles.has(entry.path)) {
      fail('runtime-tree-executable-lock-invalid');
    }
    executableFiles.set(entry.path, Object.freeze({ ...entry }));
  }
  if (!isSafeRelativePath(value.mainExecutable.path)
      || !DIGEST.test(value.mainExecutable.sha256)
      || !Number.isSafeInteger(value.mainExecutable.sizeBytes)
      || !executableFiles.has(value.mainExecutable.path)) {
    fail('runtime-tree-main-executable-lock-invalid');
  }
  return Object.freeze({
    ...value,
    executableFiles,
    mainExecutable: Object.freeze({ ...value.mainExecutable }),
  });
}

function hashFrozenRegularFile(filename, ownerUid, ownerGid, expectedMode, maximumBytes) {
  const pathMetadata = lstatSync(filename);
  assertFrozenRegularFile(pathMetadata, ownerUid, ownerGid, expectedMode, maximumBytes);
  const descriptor = openSync(
    filename,
    fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
  );
  try {
    const before = fstatSync(descriptor);
    assertSameRegularFile(before, pathMetadata);
    const digest = createHash('sha256');
    const buffer = Buffer.allocUnsafe(Math.min(READ_BUFFER_BYTES, Math.max(1, before.size)));
    let offset = 0;
    while (offset < before.size) {
      const count = readSync(
        descriptor,
        buffer,
        0,
        Math.min(buffer.length, before.size - offset),
        offset,
      );
      if (count < 1) fail('frozen-tree-file-read-short');
      digest.update(buffer.subarray(0, count));
      offset += count;
    }
    const after = fstatSync(descriptor);
    const finalPathMetadata = lstatSync(filename);
    assertSameRegularFile(after, before);
    assertSameRegularFile(finalPathMetadata, before);
    return {
      mode: expectedMode,
      sha256: `sha256:${digest.digest('hex')}`,
      sizeBytes: offset,
    };
  } finally {
    closeSync(descriptor);
  }
}

function assertFrozenRegularFile(metadata, ownerUid, ownerGid, expectedMode, maximumBytes) {
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1
      || metadata.uid !== ownerUid || metadata.gid !== ownerGid
      || fullMode(metadata) !== expectedMode
      || !Number.isSafeInteger(metadata.size) || metadata.size < 0
      || metadata.size > maximumBytes) {
    fail('frozen-tree-file-identity-mismatch');
  }
}

function assertCanonicalDirectory(directory, ownerUid, ownerGid, expectedMode, label) {
  if (typeof directory !== 'string' || !path.isAbsolute(directory)
      || path.normalize(directory) !== directory) {
    fail(`${label}-not-canonical-directory`);
  }
  const metadata = lstatSync(directory);
  if (!metadata.isDirectory() || metadata.isSymbolicLink()
      || metadata.uid !== ownerUid || metadata.gid !== ownerGid
      || fullMode(metadata) !== expectedMode || realpathSync(directory) !== directory) {
    fail(`${label}-not-canonical-directory`);
  }
  return metadata;
}

function readAndVerifyLinuxProcessStatus(processIdentity) {
  let status;
  try {
    status = readFileSync('/proc/self/status', 'utf8');
  } catch {
    fail('linux-process-status-unavailable');
  }
  return verifyLinuxProcessStatus(status, processIdentity);
}

function verifyLinuxProcessStatus(status, processIdentity) {
  if (Buffer.byteLength(status, 'utf8') < 1
      || Buffer.byteLength(status, 'utf8') > MAXIMUM_PROC_STATUS_BYTES
      || status.includes('\0')) {
    fail('linux-process-status-invalid');
  }
  const uid = parseLinuxStatusDecimalVector(status, 'Uid');
  const gid = parseLinuxStatusDecimalVector(status, 'Gid');
  const supplementaryGroups = parseLinuxStatusOptionalDecimalVector(status, 'Groups');
  if (uid.length !== 4 || gid.length !== 4
      || uid[0] !== processIdentity.runningRealUid
      || uid[1] !== processIdentity.runningEffectiveUid
      || gid[0] !== processIdentity.runningRealGid
      || gid[1] !== processIdentity.runningEffectiveGid
      || [...uid, ...gid].some((identifier) => identifier < 1)
      || uid.some((identifier) => identifier !== processIdentity.runningRealUid)
      || gid.some((identifier) => identifier !== processIdentity.runningRealGid)
      || supplementaryGroups.length !== 0) {
    fail('linux-process-credential-vector-mismatch');
  }
  for (const field of LINUX_CAPABILITY_FIELDS) {
    const capability = exactLinuxStatusValue(status, field);
    if (!/^[0-9A-Fa-f]{16}$/.test(capability)
        || capability.toLowerCase() !== ZERO_CAPABILITY_VECTOR) {
      fail('linux-capability-set-present');
    }
  }
  if (exactLinuxStatusValue(status, 'NoNewPrivs') !== '1') {
    fail('linux-no-new-privileges-not-set');
  }
  return Object.freeze({
    runningSavedSetUid: uid[2],
    runningFilesystemUid: uid[3],
    runningSavedSetGid: gid[2],
    runningFilesystemGid: gid[3],
    supplementaryGroupCount: supplementaryGroups.length,
    allLinuxCredentialIdsNonRoot: true,
    allLinuxCredentialIdsExact: true,
    supplementaryGroupsAbsent: true,
    allLinuxCapabilitySetsAbsent: true,
    noNewPrivilegesVerified: true,
  });
}

function parseLinuxStatusDecimalVector(status, key) {
  const value = exactLinuxStatusValue(status, key);
  const parts = value.split(/\s+/u);
  if (parts.some((part) => !/^(?:0|[1-9][0-9]*)$/.test(part))) {
    fail('linux-process-status-invalid');
  }
  const identifiers = parts.map((part) => Number(part));
  if (identifiers.some((identifier) => !Number.isSafeInteger(identifier))) {
    fail('linux-process-status-invalid');
  }
  return identifiers;
}

function parseLinuxStatusOptionalDecimalVector(status, key) {
  const value = exactLinuxStatusValue(status, key, true);
  if (value === '') return [];
  const parts = value.split(/\s+/u);
  if (parts.some((part) => !/^(?:0|[1-9][0-9]*)$/.test(part))) {
    fail('linux-process-status-invalid');
  }
  const identifiers = parts.map((part) => Number(part));
  if (identifiers.some((identifier) => !Number.isSafeInteger(identifier))) {
    fail('linux-process-status-invalid');
  }
  return identifiers;
}

function exactLinuxStatusValue(status, key, allowEmpty = false) {
  const prefix = `${key}:`;
  const matches = status.split('\n').filter((line) => line.startsWith(prefix));
  if (matches.length !== 1) fail('linux-process-status-invalid');
  const value = matches[0].slice(prefix.length).trim();
  if (!allowEmpty && value.length === 0) fail('linux-process-status-invalid');
  return value;
}

function readAndVerifyReadOnlyRuntimeMount(runtimeRoot) {
  let mountInfo;
  let mountNamespaceIdentity;
  try {
    mountInfo = readFileSync('/proc/self/mountinfo', 'utf8');
    mountNamespaceIdentity = readlinkSync('/proc/self/ns/mnt');
  } catch {
    fail('linux-mount-boundary-unavailable');
  }
  return verifyReadOnlyRuntimeMount(mountInfo, mountNamespaceIdentity, runtimeRoot);
}

function verifyReadOnlyRuntimeMount(mountInfo, mountNamespaceIdentity, runtimeRoot) {
  if (typeof mountInfo !== 'string' || Buffer.byteLength(mountInfo, 'utf8') < 1
      || Buffer.byteLength(mountInfo, 'utf8') > MAXIMUM_MOUNTINFO_BYTES
      || mountInfo.includes('\0')
      || typeof mountNamespaceIdentity !== 'string'
      || !/^mnt:\[[1-9][0-9]*\]$/.test(mountNamespaceIdentity)
      || typeof runtimeRoot !== 'string' || !path.isAbsolute(runtimeRoot)
      || path.normalize(runtimeRoot) !== runtimeRoot) {
    fail('linux-mount-boundary-invalid');
  }
  const matches = [];
  for (const line of mountInfo.split('\n')) {
    if (line === '') continue;
    const fields = line.split(' ');
    const separator = fields.indexOf('-');
    if (separator < 6 || fields.length < separator + 4
        || !/^[1-9][0-9]*$/.test(fields[0])
        || !/^(?:0|[1-9][0-9]*):(?:0|[1-9][0-9]*)$/.test(fields[2])) {
      fail('linux-mountinfo-invalid');
    }
    const mountPoint = decodeMountInfoPath(fields[4]);
    if (mountPoint !== runtimeRoot) continue;
    const mountOptions = fields[5].split(',');
    const optionalFields = fields.slice(6, separator);
    matches.push({ mountOptions, optionalFields });
  }
  if (matches.length !== 1) fail('runtime-root-exact-mountpoint-mismatch');
  const [{ mountOptions, optionalFields }] = matches;
  if (!mountOptions.includes('ro') || mountOptions.includes('rw')) {
    fail('runtime-root-mount-not-readonly');
  }
  if (!mountOptions.includes('nosuid')) fail('runtime-root-mount-not-nosuid');
  if (!mountOptions.includes('nodev')) fail('runtime-root-mount-not-nodev');
  if (optionalFields.some((field) => /^(?:shared|master|propagate_from):/.test(field)
      || field === 'unbindable')) {
    fail('runtime-root-mount-propagation-not-private');
  }
  return Object.freeze({
    runtimeRootExactMountPointVerified: true,
    runtimeRootReadOnlyMountVerified: true,
    runtimeRootNosuidMountVerified: true,
    runtimeRootNodevMountVerified: true,
    runtimeMountPrivatePropagationVerified: true,
    mountNamespaceIdentityObserved: true,
    mountNamespaceIsolationVerified: false,
  });
}

function decodeMountInfoPath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')) {
    fail('linux-mountinfo-invalid');
  }
  let decoded = '';
  for (let index = 0; index < value.length; index += 1) {
    if (value[index] !== '\\') {
      decoded += value[index];
      continue;
    }
    const escape = value.slice(index, index + 4);
    const replacement = Object.freeze({
      '\\011': '\t',
      '\\012': '\n',
      '\\040': ' ',
      '\\134': '\\',
    })[escape];
    if (replacement === undefined) fail('linux-mountinfo-invalid');
    decoded += replacement;
    index += 3;
  }
  return decoded;
}

function verifyTrustedAncestors(start) {
  let current = start;
  const trustedAncestors = [];
  while (true) {
    const metadata = lstatSync(current);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()
        || metadata.uid !== 0 || metadata.gid !== 0
        || (metadata.mode & 0o022) !== 0 || realpathSync(current) !== current) {
      fail('runtime-ancestor-not-root-owned-readonly');
    }
    trustedAncestors.push(Object.freeze({ current, metadata }));
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return Object.freeze(trustedAncestors);
}

function assertTrustedAncestorsUnchanged(trustedAncestors) {
  for (const ancestor of trustedAncestors) {
    const metadata = lstatSync(ancestor.current);
    if (realpathSync(ancestor.current) !== ancestor.current) {
      fail('runtime-ancestor-changed');
    }
    assertSameDirectory(metadata, ancestor.metadata);
  }
}

function sortedChildren(directory) {
  return readdirSync(directory, { withFileTypes: true }).sort((left, right) => Buffer.compare(
    Buffer.from(left.name, 'utf8'),
    Buffer.from(right.name, 'utf8'),
  ));
}

function assertSameRegularFile(actual, expected) {
  if (!actual.isFile() || actual.isSymbolicLink() || actual.nlink !== 1
      || actual.dev !== expected.dev || actual.ino !== expected.ino
      || actual.mode !== expected.mode || actual.uid !== expected.uid
      || actual.gid !== expected.gid || actual.size !== expected.size) {
    fail('frozen-tree-file-changed');
  }
}

function assertSameDirectory(actual, expected) {
  if (!actual.isDirectory() || actual.isSymbolicLink()
      || actual.dev !== expected.dev || actual.ino !== expected.ino
      || actual.mode !== expected.mode || actual.uid !== expected.uid
      || actual.gid !== expected.gid) {
    fail('frozen-tree-directory-changed');
  }
}

function fullMode(metadata) {
  return (metadata.mode & 0o177777).toString(8).padStart(6, '0');
}

function isSafeChildName(name) {
  return typeof name === 'string' && name.length > 0 && name !== '.' && name !== '..'
    && !name.includes('/') && !name.includes('\\') && !name.includes('\0')
    && !name.includes('\uFFFD');
}

function isSafeRelativePath(value) {
  if (typeof value !== 'string' || value.length === 0 || value.startsWith('/')
      || value.includes('\\') || value.includes('\0')) return false;
  const parts = value.split('/');
  return parts.every((part) => isSafeChildName(part)) && parts.join('/') === value;
}

function isClosedObject(value, expectedKeys) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || (Object.getPrototypeOf(value) !== Object.prototype
        && Object.getPrototypeOf(value) !== null)
      || Object.getOwnPropertySymbols(value).length !== 0) {
    return false;
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  return canonicalJson(Object.keys(descriptors).sort())
      === canonicalJson([...expectedKeys].sort())
    && Object.values(descriptors).every((descriptor) =>
      Object.hasOwn(descriptor, 'value') && descriptor.enumerable === true);
}

function sanitizeFailure(error, stage) {
  if (error instanceof Error
      && /^private Chromium runtime preflight failed: [a-z0-9-]+$/.test(error.message)) {
    return error;
  }
  return new Error(`private Chromium runtime preflight failed: ${stage}`);
}

function fail(code) {
  throw new Error(`private Chromium runtime preflight failed: ${code}`);
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

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function main() {
  try {
    if (process.argv.length !== 4 || process.argv[2] !== '--runtime-root') {
      fail('cli-arguments-invalid');
    }
    const audit = preflightPrivateChromiumRuntimeV049({
      runtimeRoot: process.argv[3],
    });
    process.stdout.write(`${canonicalJson(audit)}\n`);
  } catch {
    process.stderr.write('private Chromium runtime preflight failed\n');
    process.exitCode = 1;
  }
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
