import { createHash } from 'node:crypto';
import {
  chmodSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  __testOnlyPreflightPrivateChromiumRuntimeV049,
  __testOnlyVerifyLinuxRuntimeBoundaryV049,
  __testOnlyVerifyLinuxProcessStatusV049,
  preflightPrivateChromiumRuntimeV049,
} from './private-chromium-runtime-preflight-v049.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    restoreDirectoryWriteBits(root);
    rmSync(root, { recursive: true, force: true });
  }
});

describe('V049 private Chromium frozen-runtime preflight', () => {
  it('recomputes a locked tiny frozen tree using the production digest protocol', () => {
    const fixture = createFixture();
    const audit = verifyFixture(fixture);

    expect(audit).toEqual({
      schemaVersion: 'tf.private-chromium-runtime-preflight-test-audit/0.4.9',
      profile: 'tiny-fixture-frozen-distribution-tree-checkpoint',
      testFixture: true,
      platform: 'linux-x64',
      browserVersion: '151.0.7922.34-test',
      chromiumRevision: '1234-test',
      distributionTreeDigest: fixture.testLock.distributionTreeDigest,
      frozenRuntimeTreeDigest: fixture.testLock.digest,
      regularFileCount: 3,
      directoryCount: 1,
      expandedByteLength: fixture.testLock.expandedByteLength,
      executableFileCount: 1,
      ownerUid: fixture.uid,
      ownerGid: fixture.gid,
      rootAndDirectoryMode: '040555',
      executableFileMode: '100555',
      otherFileMode: '100444',
      runningRealUid: fixture.runningUid,
      runningEffectiveUid: fixture.runningUid,
      runningSavedSetUid: fixture.runningUid,
      runningFilesystemUid: fixture.runningUid,
      runningRealGid: fixture.runningGid,
      runningEffectiveGid: fixture.runningGid,
      runningSavedSetGid: fixture.runningGid,
      runningFilesystemGid: fixture.runningGid,
      supplementaryGroupCount: 0,
      allLinuxCredentialIdsNonRoot: true,
      allLinuxCredentialIdsExact: true,
      supplementaryGroupsAbsent: true,
      allLinuxCapabilitySetsAbsent: true,
      effectiveCapabilitiesAbsent: true,
      noNewPrivilegesVerified: true,
      nonRootExecutionCredentialsVerified: true,
      runtimeRootExactMountPointVerified: true,
      runtimeRootReadOnlyMountVerified: true,
      runtimeRootNosuidMountVerified: true,
      runtimeRootNodevMountVerified: true,
      runtimeMountPrivatePropagationVerified: true,
      mountNamespaceIdentityObserved: true,
      mountNamespaceIsolationVerified: false,
      dedicatedMountNamespaceVerified: false,
      rootOwnedFrozenDistributionTreeCheckpointVerified: false,
      frozenDistributionTreeCheckpointVerified: true,
      trustedAncestorCount: 0,
      trustedAncestorDacModePolicyVerified: false,
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
    expect(Object.isFrozen(audit)).toBe(true);
    expect(Object.isFrozen(audit.claims)).toBe(true);
    expect(JSON.stringify(audit)).not.toContain(fixture.root);
  });

  it('rejects a same-size content mutation', () => {
    const fixture = createFixture();
    const filename = path.join(fixture.distributionRoot, 'resources', 'value.txt');
    chmodSync(filename, 0o600);
    const bytes = readFileSync(filename);
    bytes[0] ^= 1;
    writeFileSync(filename, bytes, { mode: 0o444 });
    chmodSync(filename, 0o444);

    expect(() => verifyFixture(fixture)).toThrow(/frozen-tree-digest-mismatch/);
  });

  it('rejects extra and missing entries at the locked count bounds', () => {
    const extra = createFixture();
    chmodSync(extra.distributionRoot, 0o755);
    writeFileSync(path.join(extra.distributionRoot, 'extra.txt'), 'x', { mode: 0o444 });
    chmodSync(extra.distributionRoot, 0o555);
    expect(() => verifyFixture(extra)).toThrow(/frozen-tree-file-count-bound/);

    const missing = createFixture();
    chmodSync(missing.resourcesRoot, 0o755);
    rmSync(path.join(missing.resourcesRoot, 'value.txt'));
    chmodSync(missing.resourcesRoot, 0o555);
    expect(() => verifyFixture(missing)).toThrow(/frozen-tree-cardinality-mismatch/);
  });

  it('rejects file and directory mode mutations', () => {
    const fileFixture = createFixture();
    chmodSync(path.join(fileFixture.distributionRoot, 'README'), 0o644);
    expect(() => verifyFixture(fileFixture)).toThrow(/frozen-tree-file-identity-mismatch/);

    const directoryFixture = createFixture();
    chmodSync(directoryFixture.resourcesRoot, 0o755);
    expect(() => verifyFixture(directoryFixture)).toThrow(/tree-directory-not-canonical-directory/);
  });

  it('rejects symbolic links and hard-linked regular files', () => {
    const symbolic = createFixture();
    chmodSync(symbolic.resourcesRoot, 0o755);
    symlinkSync('value.txt', path.join(symbolic.resourcesRoot, 'alias'));
    chmodSync(symbolic.resourcesRoot, 0o555);
    expect(() => verifyFixture(symbolic)).toThrow(/frozen-tree-nonregular-entry/);

    const linked = createFixture();
    chmodSync(linked.resourcesRoot, 0o755);
    linkSync(
      path.join(linked.resourcesRoot, 'value.txt'),
      path.join(linked.resourcesRoot, 'linked.txt'),
    );
    chmodSync(linked.resourcesRoot, 0o555);
    expect(lstatSync(path.join(linked.resourcesRoot, 'value.txt')).nlink).toBe(2);
    expect(() => verifyFixture(linked)).toThrow(/frozen-tree-file-identity-mismatch/);
  });

  it('rejects owner mismatches and extra runtime-root children', () => {
    const owner = createFixture();
    owner.testLock = { ...owner.testLock, ownerUid: owner.uid + 1 };
    expect(() => verifyFixture(owner)).toThrow(/runtime-root-not-canonical-directory/);

    const extraRootChild = createFixture();
    chmodSync(extraRootChild.runtimeRoot, 0o755);
    mkdirSync(path.join(extraRootChild.runtimeRoot, 'other'), { mode: 0o555 });
    chmodSync(extraRootChild.runtimeRoot, 0o555);
    expect(() => verifyFixture(extraRootChild)).toThrow(/runtime-root-children-mismatch/);
  });

  it('keeps production and test entry contracts closed', () => {
    const fixture = createFixture();
    expect(() => preflightPrivateChromiumRuntimeV049({
      runtimeRoot: fixture.runtimeRoot,
      testLock: fixture.testLock,
    })).toThrow(/closed contract/);
    expect(() => __testOnlyPreflightPrivateChromiumRuntimeV049({
      runtimeRoot: fixture.runtimeRoot,
      environment: fixture.environment,
      testLock: fixture.testLock,
      extra: true,
    })).toThrow(/test-only Chromium runtime preflight options are invalid/);
    expect(() => __testOnlyPreflightPrivateChromiumRuntimeV049({
      runtimeRoot: fixture.runtimeRoot,
      environment: fixture.environment,
      testLock: fixture.testLock,
      [Symbol('hidden')]: true,
    })).toThrow(/test-only Chromium runtime preflight options are invalid/);
  });

  it('rejects root-like Linux credential vectors, capabilities, and missing no-new-privileges', () => {
    const identity = {
      runningRealUid: 1001,
      runningEffectiveUid: 1001,
      runningRealGid: 1001,
      runningEffectiveGid: 1001,
    };
    const valid = linuxStatus({});
    expect(__testOnlyVerifyLinuxProcessStatusV049({
      processIdentity: identity,
      status: valid,
    })).toEqual({
      runningSavedSetUid: 1001,
      runningFilesystemUid: 1001,
      runningSavedSetGid: 1001,
      runningFilesystemGid: 1001,
      supplementaryGroupCount: 0,
      allLinuxCredentialIdsNonRoot: true,
      allLinuxCredentialIdsExact: true,
      supplementaryGroupsAbsent: true,
      allLinuxCapabilitySetsAbsent: true,
      noNewPrivilegesVerified: true,
    });
    for (const status of [
      linuxStatus({ uid: '1001\t1001\t1001\t0' }),
      linuxStatus({ uid: '1001\t1001\t1002\t1001' }),
      linuxStatus({ gid: '1001\t0\t1001\t1001' }),
      linuxStatus({ groups: '1001' }),
      linuxStatus({ capInh: '0000000000000001' }),
      linuxStatus({ capPrm: '0000000000000001' }),
      linuxStatus({ capEff: '0000000000000001' }),
      linuxStatus({ capBnd: '0000000000000001' }),
      linuxStatus({ capAmb: '0000000000000001' }),
      linuxStatus({ noNewPrivs: '0' }),
      `${valid}CapEff:\t0000000000000000\n`,
    ]) {
      expect(() => __testOnlyVerifyLinuxProcessStatusV049({
        processIdentity: identity,
        status,
      })).toThrow(/private Chromium runtime preflight failed/);
    }
  });

  it('requires one exact private read-only nosuid nodev runtime mount', () => {
    const fixture = createFixture();
    const boundary = __testOnlyVerifyLinuxRuntimeBoundaryV049({
      processIdentity: {
        runningRealUid: fixture.runningUid,
        runningEffectiveUid: fixture.runningUid,
        runningRealGid: fixture.runningGid,
        runningEffectiveGid: fixture.runningGid,
      },
      status: linuxStatus({
        uid: Array(4).fill(fixture.runningUid).join('\t'),
        gid: Array(4).fill(fixture.runningGid).join('\t'),
      }),
      mountInfo: mountInfo(fixture.runtimeRoot),
      mountNamespaceIdentity: 'mnt:[4026533000]',
      runtimeRoot: fixture.runtimeRoot,
    });
    expect(boundary).toMatchObject({
      runtimeRootExactMountPointVerified: true,
      runtimeRootReadOnlyMountVerified: true,
      runtimeRootNosuidMountVerified: true,
      runtimeRootNodevMountVerified: true,
      runtimeMountPrivatePropagationVerified: true,
      mountNamespaceIdentityObserved: true,
      mountNamespaceIsolationVerified: false,
    });

    for (const [candidate, pattern] of [
      [mountInfo(fixture.runtimeRoot, 'rw,nosuid,nodev'), /not-readonly/],
      [mountInfo(fixture.runtimeRoot, 'ro,nodev'), /not-nosuid/],
      [mountInfo(fixture.runtimeRoot, 'ro,nosuid'), /not-nodev/],
      [mountInfo(fixture.runtimeRoot, 'ro,nosuid,nodev', 'shared:1'), /propagation/],
      [`${mountInfo(fixture.runtimeRoot)}${mountInfo(fixture.runtimeRoot)}`, /exact-mountpoint/],
    ]) {
      expect(() => __testOnlyVerifyLinuxRuntimeBoundaryV049({
        processIdentity: {
          runningRealUid: fixture.runningUid,
          runningEffectiveUid: fixture.runningUid,
          runningRealGid: fixture.runningGid,
          runningEffectiveGid: fixture.runningGid,
        },
        status: linuxStatus({
          uid: Array(4).fill(fixture.runningUid).join('\t'),
          gid: Array(4).fill(fixture.runningGid).join('\t'),
        }),
        mountInfo: candidate,
        mountNamespaceIdentity: 'mnt:[4026533000]',
        runtimeRoot: fixture.runtimeRoot,
      })).toThrow(pattern);
    }
  });
});

function createFixture() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'tf-runtime-preflight-v049-')));
  roots.push(root);
  const runtimeRoot = path.join(root, 'runtime');
  const distributionRoot = path.join(runtimeRoot, 'chrome-linux64');
  const resourcesRoot = path.join(distributionRoot, 'resources');
  mkdirSync(resourcesRoot, { recursive: true, mode: 0o755 });
  writeFileSync(path.join(distributionRoot, 'chrome'), '#!/bin/sh\nexit 0\n', { mode: 0o555 });
  writeFileSync(path.join(distributionRoot, 'README'), 'frozen runtime\n', { mode: 0o444 });
  writeFileSync(path.join(resourcesRoot, 'value.txt'), 'locked value\n', { mode: 0o444 });
  chmodSync(path.join(distributionRoot, 'chrome'), 0o555);
  chmodSync(path.join(distributionRoot, 'README'), 0o444);
  chmodSync(path.join(resourcesRoot, 'value.txt'), 0o444);
  chmodSync(resourcesRoot, 0o555);
  chmodSync(distributionRoot, 0o555);
  chmodSync(runtimeRoot, 0o555);

  const uid = lstatSync(runtimeRoot).uid;
  const gid = lstatSync(runtimeRoot).gid;
  const descriptor = computeDescriptor(distributionRoot);
  const chrome = descriptor.entries.find((entry) => entry.path === 'chrome');
  const distributionTreeDigest = `sha256:${'a'.repeat(64)}`;
  const schemaVersion = 'tf.private-chromium-frozen-runtime-tree-test/0.4.9';
  const digest = `sha256:${createHash('sha256').update(`${canonicalJson({
    distributionTreeDigest,
    entries: descriptor.entries,
    platform: 'linux-x64',
    rootDirectory: 'chrome-linux64',
    schemaVersion,
  })}\n`, 'utf8').digest('hex')}`;
  const runningUid = uid === 0 ? 1234 : uid;
  const runningGid = gid === 0 ? 1234 : gid;
  const testLock = {
    lockSchemaVersion: 'tf.private-chromium-runtime-preflight-test-lock/0.4.9',
    platform: 'linux-x64',
    browserVersion: '151.0.7922.34-test',
    chromiumRevision: '1234-test',
    rootDirectory: 'chrome-linux64',
    schemaVersion,
    distributionTreeDigest,
    digest,
    regularFileCount: 3,
    directoryCount: 1,
    expandedByteLength: descriptor.entries
      .filter((entry) => entry.type === 'regular')
      .reduce((sum, entry) => sum + entry.sizeBytes, 0),
    ownerUid: uid,
    ownerGid: gid,
    rootAndDirectoryMode: '040555',
    executableFileMode: '100555',
    otherFileMode: '100444',
    executableFiles: [{
      path: chrome.path,
      mode: '100755',
      sizeBytes: chrome.sizeBytes,
      sha256: chrome.sha256,
    }],
    mainExecutable: {
      path: chrome.path,
      sizeBytes: chrome.sizeBytes,
      sha256: chrome.sha256,
    },
  };
  return {
    root,
    runtimeRoot,
    distributionRoot,
    resourcesRoot,
    uid,
    gid,
    runningUid,
    runningGid,
    environment: {
      runningRealUid: runningUid,
      runningEffectiveUid: runningUid,
      runningSavedSetUid: runningUid,
      runningFilesystemUid: runningUid,
      runningRealGid: runningGid,
      runningEffectiveGid: runningGid,
      runningSavedSetGid: runningGid,
      runningFilesystemGid: runningGid,
      supplementaryGroupCount: 0,
      allLinuxCredentialIdsNonRoot: true,
      allLinuxCredentialIdsExact: true,
      supplementaryGroupsAbsent: true,
      allLinuxCapabilitySetsAbsent: true,
      noNewPrivilegesVerified: true,
      runtimeRootExactMountPointVerified: true,
      runtimeRootReadOnlyMountVerified: true,
      runtimeRootNosuidMountVerified: true,
      runtimeRootNodevMountVerified: true,
      runtimeMountPrivatePropagationVerified: true,
      mountNamespaceIdentityObserved: true,
      mountNamespaceIsolationVerified: false,
      requireTrustedAncestors: false,
    },
    testLock,
  };
}

function verifyFixture(fixture) {
  return __testOnlyPreflightPrivateChromiumRuntimeV049({
    runtimeRoot: fixture.runtimeRoot,
    environment: fixture.environment,
    testLock: fixture.testLock,
  });
}

function computeDescriptor(distributionRoot) {
  const entries = [];
  walk(distributionRoot, '');
  entries.sort((left, right) => Buffer.compare(
    Buffer.from(left.path, 'utf8'),
    Buffer.from(right.path, 'utf8'),
  ));
  return { entries };

  function walk(directory, relativeDirectory) {
    const children = readdirSync(directory, { withFileTypes: true });
    for (const child of children) {
      const relativePath = relativeDirectory === ''
        ? child.name
        : `${relativeDirectory}/${child.name}`;
      const filename = path.join(directory, child.name);
      if (child.isDirectory()) {
        entries.push({
          mode: fullMode(lstatSync(filename)),
          path: relativePath,
          type: 'directory',
        });
        walk(filename, relativePath);
      } else {
        const bytes = readFileSync(filename);
        entries.push({
          mode: fullMode(lstatSync(filename)),
          path: relativePath,
          sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
          sizeBytes: bytes.length,
          type: 'regular',
        });
      }
    }
  }
}

function restoreDirectoryWriteBits(root) {
  let metadata;
  try {
    metadata = lstatSync(root);
  } catch {
    return;
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()) return;
  chmodSync(root, 0o700);
  for (const child of readdirSync(root, { withFileTypes: true })) {
    if (child.isDirectory() && !child.isSymbolicLink()) {
      restoreDirectoryWriteBits(path.join(root, child.name));
    }
  }
}

function fullMode(metadata) {
  return (metadata.mode & 0o177777).toString(8).padStart(6, '0');
}

function canonicalJson(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function linuxStatus({
  uid = '1001\t1001\t1001\t1001',
  gid = '1001\t1001\t1001\t1001',
  groups = '',
  capInh = '0000000000000000',
  capPrm = '0000000000000000',
  capEff = '0000000000000000',
  capBnd = '0000000000000000',
  capAmb = '0000000000000000',
  noNewPrivs = '1',
}) {
  return [
    'Name:\tnode',
    `Uid:\t${uid}`,
    `Gid:\t${gid}`,
    `Groups:\t${groups}`,
    `CapInh:\t${capInh}`,
    `CapPrm:\t${capPrm}`,
    `CapEff:\t${capEff}`,
    `CapBnd:\t${capBnd}`,
    `CapAmb:\t${capAmb}`,
    `NoNewPrivs:\t${noNewPrivs}`,
    '',
  ].join('\n');
}

function mountInfo(runtimeRoot, options = 'ro,nosuid,nodev', optional = '') {
  const encoded = runtimeRoot
    .replaceAll('\\', '\\134')
    .replaceAll(' ', '\\040')
    .replaceAll('\t', '\\011')
    .replaceAll('\n', '\\012');
  const optionalField = optional === '' ? '' : `${optional} `;
  return `42 41 0:99 / ${encoded} ${options} ${optionalField}- tmpfs none rw\n`;
}
