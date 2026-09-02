#!/usr/bin/env node

import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { PRIVATE_CHROMIUM_LOCK_V049 } from './chromium-v049-lock.mjs';

const AUDIT_SCHEMA_VERSION = 'tf.private-playwright-package-preflight/0.4.9';
const TREE_SCHEMA_VERSION = 'tf.npm-package-content-tree/1';
const TREE_DIGEST_PROTOCOL =
  'canonical-json-plus-lf-over-root-stripped-regular-path-mode-size-and-content-digest';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const PACKAGE_NAME = /^(?:playwright|playwright-core|fixture-package)$/;
const VERSION = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,63}$/;
const READ_BUFFER_BYTES = 64 * 1024;
const MAX_PACKAGE_LOCK_BYTES = 16 * 1024 * 1024;

const REPOSITORY_ROOT = path.resolve(fileURLToPath(new URL('../../../../', import.meta.url)));

/**
 * Verify the installed Playwright own-package payloads without importing or
 * executing either package. This production entry accepts no arguments.
 */
export function preflightPrivatePlaywrightPackagesV049(...args) {
  if (args.length !== 0) fail('production-entry-accepts-no-input');
  let stage = 'repository-layout';
  try {
    assertCanonicalDirectory(REPOSITORY_ROOT, 'repository-root');
    const bindings = validateProductionBindings();
    const playwrightRoot = path.join(REPOSITORY_ROOT, bindings.playwright.packagePath);
    const playwrightCoreRoot = path.join(REPOSITORY_ROOT, bindings.playwrightCore.packagePath);

    stage = 'host-excluded-dependency-policy';
    const hostPolicy = inspectHostExcludedDependencies(playwrightRoot, playwrightCoreRoot);

    stage = 'playwright-own-package-tree';
    const playwright = verifyOwnPackageTree({
      packageRoot: playwrightRoot,
      binding: bindings.playwright,
      version: PRIVATE_CHROMIUM_LOCK_V049.playwrightVersion,
    });

    stage = 'playwright-core-own-package-tree';
    const playwrightCore = verifyOwnPackageTree({
      packageRoot: playwrightCoreRoot,
      binding: bindings.playwrightCore,
      version: PRIVATE_CHROMIUM_LOCK_V049.playwrightVersion,
    });

    stage = 'package-declarations';
    verifyPackageDeclaration(playwrightRoot, playwright, 'playwright');
    verifyPackageDeclaration(playwrightCoreRoot, playwrightCore, 'playwright-core');

    stage = 'package-lock-bindings';
    verifyRepositoryPackageLock(bindings);

    stage = 'browsers-json';
    verifyBrowsersJson(playwrightCoreRoot, playwrightCore, bindings.playwrightCore);

    return createSafeAudit(playwright, playwrightCore, hostPolicy);
  } catch (error) {
    throw sanitizeFailure(error, stage);
  }
}

/**
 * Private tiny-fixture seam. It exists only to exercise the same regular-file,
 * link, mode, size, content-digest and closed-input checks without copying the
 * real packages. It never imports Playwright and does not produce release
 * evidence.
 */
export function __testOnlyVerifyOwnPackageTreeV049(options) {
  const normalized = validateTestOptions(options);
  return verifyOwnPackageTree(normalized);
}

function validateProductionBindings() {
  const lock = PRIVATE_CHROMIUM_LOCK_V049;
  if (lock === null || typeof lock !== 'object'
      || lock.schemaVersion !== 'tf.private-chromium-runtime-lock/0.4.9'
      || lock.playwrightVersion !== '1.62.1') {
    fail('runtime-lock-header-mismatch');
  }
  const bindings = lock.npmPackageLockBindings;
  if (!isClosedObject(bindings, ['playwright', 'playwrightCore'])) {
    fail('runtime-lock-package-bindings-shape');
  }
  validateProductionBinding(bindings.playwright, false);
  validateProductionBinding(bindings.playwrightCore, true);
  return bindings;
}

function validateProductionBinding(binding, core) {
  const expectedKeys = [
    'integrity', 'ownPackageTree', 'packageName', 'packagePath', 'resolved',
    'tarballByteLength', 'tarballSha256',
    ...(core ? ['browsersJsonSha256'] : []),
  ];
  const expectedName = core ? 'playwright-core' : 'playwright';
  if (!isClosedObject(binding, expectedKeys)
      || binding.packageName !== expectedName
      || binding.packagePath !== `node_modules/${expectedName}`
      || typeof binding.resolved !== 'string'
      || binding.resolved !== `https://registry.npmjs.org/${expectedName}/-/${expectedName}-1.62.1.tgz`
      || typeof binding.integrity !== 'string'
      || !binding.integrity.startsWith('sha512-')
      || !Number.isSafeInteger(binding.tarballByteLength)
      || binding.tarballByteLength < 1
      || !DIGEST.test(binding.tarballSha256)
      || (core && !DIGEST.test(binding.browsersJsonSha256))) {
    fail('runtime-lock-package-binding-mismatch');
  }
  validateTreeExpectation(binding.ownPackageTree);
}

function validateTreeExpectation(tree) {
  const keys = [
    'digest', 'digestProtocol', 'expandedByteLength', 'regularFileCount',
    'schemaVersion', 'symlinkHardlinkOrSpecialCount', 'unixModeCounts',
  ];
  if (!isClosedObject(tree, keys)
      || tree.schemaVersion !== TREE_SCHEMA_VERSION
      || tree.digestProtocol !== TREE_DIGEST_PROTOCOL
      || !DIGEST.test(tree.digest)
      || !Number.isSafeInteger(tree.regularFileCount) || tree.regularFileCount < 1
      || !Number.isSafeInteger(tree.expandedByteLength) || tree.expandedByteLength < 1
      || tree.symlinkHardlinkOrSpecialCount !== 0
      || tree.unixModeCounts === null || typeof tree.unixModeCounts !== 'object'
      || Array.isArray(tree.unixModeCounts)
      || Object.keys(tree.unixModeCounts).some((mode) => !/^100[0-7]{3}$/.test(mode))
      || Object.values(tree.unixModeCounts).some((count) =>
        !Number.isSafeInteger(count) || count < 1)
      || Object.values(tree.unixModeCounts).reduce((sum, count) => sum + count, 0)
        !== tree.regularFileCount) {
    fail('own-package-tree-lock-invalid');
  }
}

function verifyOwnPackageTree({ packageRoot, binding, version }) {
  assertCanonicalDirectory(packageRoot, 'package-root');
  const expectation = binding.ownPackageTree;
  validateTreeExpectation(expectation);
  if (!PACKAGE_NAME.test(binding.packageName) || !VERSION.test(version)
      || !DIGEST.test(binding.tarballSha256)) {
    fail('own-package-tree-identity-invalid');
  }

  const entries = [];
  const unixModeCounts = {};
  let expandedByteLength = 0;
  walk(packageRoot, '');
  entries.sort((left, right) => Buffer.compare(
    Buffer.from(left.path, 'utf8'),
    Buffer.from(right.path, 'utf8'),
  ));

  const preimage = {
    entries,
    package: binding.packageName,
    schemaVersion: TREE_SCHEMA_VERSION,
    tarballSha256: binding.tarballSha256,
    version,
  };
  const treeDigest = `sha256:${createHash('sha256')
    .update(`${canonicalJson(preimage)}\n`, 'utf8').digest('hex')}`;
  const sortedModeCounts = Object.fromEntries(Object.entries(unixModeCounts)
    .sort(([left], [right]) => left.localeCompare(right)));

  if (treeDigest !== expectation.digest
      || entries.length !== expectation.regularFileCount
      || expandedByteLength !== expectation.expandedByteLength
      || canonicalJson(sortedModeCounts) !== canonicalJson(expectation.unixModeCounts)) {
    fail('own-package-tree-mismatch');
  }

  return deepFreeze({
    packageName: binding.packageName,
    version,
    treeDigest,
    regularFileCount: entries.length,
    expandedByteLength,
    unixModeCounts: sortedModeCounts,
    topLevelNodeModulesExcluded: true,
    entries,
  });

  function walk(directory, relativeDirectory) {
    let children;
    try {
      children = readdirSync(directory, { withFileTypes: true });
    } catch {
      fail('own-package-directory-read-failed');
    }
    children.sort((left, right) => Buffer.compare(
      Buffer.from(left.name, 'utf8'),
      Buffer.from(right.name, 'utf8'),
    ));
    for (const child of children) {
      if (relativeDirectory === '' && child.name === 'node_modules') continue;
      if (!isSafeChildName(child.name)) fail('own-package-path-invalid');
      const relativePath = relativeDirectory === ''
        ? child.name
        : `${relativeDirectory}/${child.name}`;
      const absolutePath = path.join(directory, child.name);
      const metadata = lstatOrFail(absolutePath, 'own-package-entry-unavailable');
      if (metadata.isDirectory() && !metadata.isSymbolicLink()) {
        walk(absolutePath, relativePath);
        continue;
      }
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1) {
        fail('own-package-nonregular-or-linked-entry');
      }
      expandedByteLength += metadata.size;
      if (!Number.isSafeInteger(expandedByteLength)
          || expandedByteLength > expectation.expandedByteLength) {
        fail('own-package-expanded-size-bound');
      }
      const hashed = hashRegularFile(absolutePath, metadata);
      entries.push({
        mode: hashed.mode,
        path: relativePath,
        sha256: hashed.sha256,
        sizeBytes: hashed.sizeBytes,
        type: 'regular',
      });
      unixModeCounts[hashed.mode] = (unixModeCounts[hashed.mode] ?? 0) + 1;
      if (entries.length > expectation.regularFileCount) {
        fail('own-package-file-count-bound');
      }
    }
  }
}

function hashRegularFile(filename, pathMetadata) {
  const descriptor = openOrFail(
    filename,
    fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
    'own-package-file-open-failed',
  );
  try {
    const before = fstatSync(descriptor);
    assertSameRegularFile(before, pathMetadata);
    const digest = createHash('sha256');
    const buffer = Buffer.allocUnsafe(READ_BUFFER_BYTES);
    let consumed = 0;
    while (true) {
      const count = readSync(descriptor, buffer, 0, buffer.length, null);
      if (count === 0) break;
      consumed += count;
      if (!Number.isSafeInteger(consumed) || consumed > pathMetadata.size) {
        fail('own-package-file-size-changed');
      }
      digest.update(buffer.subarray(0, count));
    }
    const after = fstatSync(descriptor);
    assertSameRegularFile(after, pathMetadata);
    if (consumed !== pathMetadata.size) fail('own-package-file-size-changed');
    return {
      mode: (after.mode & 0o177777).toString(8).padStart(6, '0'),
      sha256: `sha256:${digest.digest('hex')}`,
      sizeBytes: consumed,
    };
  } finally {
    closeSync(descriptor);
  }
}

function verifyPackageDeclaration(packageRoot, tree, expectedName) {
  const entry = tree.entries.find((candidate) => candidate.path === 'package.json');
  if (entry === undefined || entry.sizeBytes > 128 * 1024) {
    fail('package-declaration-not-bound');
  }
  const bytes = readBoundRegularBytes(path.join(packageRoot, 'package.json'), entry);
  let declaration;
  try {
    declaration = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('package-declaration-invalid-json');
  }
  if (declaration === null || typeof declaration !== 'object' || Array.isArray(declaration)
      || declaration.name !== expectedName
      || declaration.version !== PRIVATE_CHROMIUM_LOCK_V049.playwrightVersion) {
    fail('package-declaration-mismatch');
  }
}

function verifyRepositoryPackageLock(bindings) {
  const packageLockPath = path.join(REPOSITORY_ROOT, 'package-lock.json');
  const metadata = lstatOrFail(packageLockPath, 'package-lock-unavailable');
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1
      || metadata.size < 1 || metadata.size > MAX_PACKAGE_LOCK_BYTES) {
    fail('package-lock-not-private-regular-input');
  }
  const bytes = readBoundRegularBytes(packageLockPath, {
    mode: (metadata.mode & 0o177777).toString(8).padStart(6, '0'),
    sha256: undefined,
    sizeBytes: metadata.size,
  });
  let packageLock;
  try {
    packageLock = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('package-lock-invalid-json');
  }
  for (const binding of [bindings.playwright, bindings.playwrightCore]) {
    const entry = packageLock?.packages?.[binding.packagePath];
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)
        || entry.version !== PRIVATE_CHROMIUM_LOCK_V049.playwrightVersion
        || entry.resolved !== binding.resolved || entry.integrity !== binding.integrity) {
      fail('package-lock-binding-mismatch');
    }
  }
}

function verifyBrowsersJson(packageRoot, tree, binding) {
  const entry = tree.entries.find((candidate) => candidate.path === 'browsers.json');
  if (entry === undefined || entry.sha256 !== binding.browsersJsonSha256
      || entry.sizeBytes > 256 * 1024) {
    fail('browsers-json-digest-mismatch');
  }
  const bytes = readBoundRegularBytes(path.join(packageRoot, 'browsers.json'), entry);
  let browsers;
  try {
    browsers = JSON.parse(bytes.toString('utf8'));
  } catch {
    fail('browsers-json-invalid-json');
  }
  const chromium = Array.isArray(browsers?.browsers)
    ? browsers.browsers.filter((candidate) => candidate?.name === 'chromium')
    : [];
  if (chromium.length !== 1
      || chromium[0].revision !== PRIVATE_CHROMIUM_LOCK_V049.chromiumRevision
      || chromium[0].browserVersion !== PRIVATE_CHROMIUM_LOCK_V049.browserVersion
      || chromium[0].installByDefault !== true) {
    fail('browsers-json-chromium-binding-mismatch');
  }
}

function readBoundRegularBytes(filename, expected) {
  const metadata = lstatOrFail(filename, 'bound-file-unavailable');
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1
      || metadata.size !== expected.sizeBytes
      || (metadata.mode & 0o177777).toString(8).padStart(6, '0') !== expected.mode) {
    fail('bound-file-identity-mismatch');
  }
  const descriptor = openOrFail(
    filename,
    fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0),
    'bound-file-open-failed',
  );
  try {
    const before = fstatSync(descriptor);
    assertSameRegularFile(before, metadata);
    const bytes = Buffer.allocUnsafe(metadata.size);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, null);
      if (count < 1) fail('bound-file-read-short');
      offset += count;
    }
    const after = fstatSync(descriptor);
    assertSameRegularFile(after, metadata);
    if (expected.sha256 !== undefined
        && `sha256:${createHash('sha256').update(bytes).digest('hex')}` !== expected.sha256) {
      fail('bound-file-digest-mismatch');
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function inspectHostExcludedDependencies(playwrightRoot, playwrightCoreRoot) {
  const coreNodeModules = path.join(playwrightCoreRoot, 'node_modules');
  if (pathExists(coreNodeModules)) fail('playwright-core-top-level-node-modules-present');
  const playwrightNodeModules = path.join(playwrightRoot, 'node_modules');
  if (process.platform === 'linux') {
    if (pathExists(playwrightNodeModules)) fail('linux-playwright-node-modules-present');
    return deepFreeze({
      hostPlatform: `linux-${validatedArchitecture()}`,
      playwrightTopLevelNodeModulesAbsent: true,
      darwinOptionalFseventsPresent: false,
      incompleteHostClosure: true,
    });
  }
  if (process.platform !== 'darwin') fail('unsupported-host-platform');
  let fseventsPresent = false;
  if (pathExists(playwrightNodeModules)) {
    assertCanonicalDirectory(playwrightNodeModules, 'playwright-node-modules');
    const children = readdirSync(playwrightNodeModules).sort();
    if (canonicalJson(children) !== canonicalJson(['fsevents'])) {
      fail('darwin-playwright-node-modules-not-fsevents-only');
    }
    assertCanonicalDirectory(path.join(playwrightNodeModules, 'fsevents'), 'fsevents-root');
    fseventsPresent = true;
  }
  return deepFreeze({
    hostPlatform: `darwin-${validatedArchitecture()}`,
    playwrightTopLevelNodeModulesAbsent: !fseventsPresent,
    darwinOptionalFseventsPresent: fseventsPresent,
    incompleteHostClosure: true,
  });
}

function validatedArchitecture() {
  if (process.arch !== 'x64' && process.arch !== 'arm64') {
    fail('unsupported-host-architecture');
  }
  return process.arch;
}

function createSafeAudit(playwright, playwrightCore, hostPolicy) {
  const summarize = (tree) => ({
    packageName: tree.packageName,
    version: tree.version,
    treeDigest: tree.treeDigest,
    regularFileCount: tree.regularFileCount,
    expandedByteLength: tree.expandedByteLength,
    unixModeCounts: tree.unixModeCounts,
    regularFilesOnly: true,
    singleLinkFilesOnly: true,
    topLevelNodeModulesExcluded: true,
  });
  return deepFreeze({
    schemaVersion: AUDIT_SCHEMA_VERSION,
    profile: 'read-only-own-package-content-preflight',
    lockSchemaVersion: PRIVATE_CHROMIUM_LOCK_V049.schemaVersion,
    playwrightVersion: PRIVATE_CHROMIUM_LOCK_V049.playwrightVersion,
    chromiumRevision: PRIVATE_CHROMIUM_LOCK_V049.chromiumRevision,
    browserVersion: PRIVATE_CHROMIUM_LOCK_V049.browserVersion,
    hostPlatform: hostPolicy.hostPlatform,
    packages: [summarize(playwright), summarize(playwrightCore)],
    packageLockBindingsMatched: true,
    browsersJsonSha256:
      PRIVATE_CHROMIUM_LOCK_V049.npmPackageLockBindings.playwrightCore.browsersJsonSha256,
    browsersJsonDigestMatched: true,
    chromiumDeclarationMatched: true,
    playwrightTopLevelNodeModulesAbsent: hostPolicy.playwrightTopLevelNodeModulesAbsent,
    darwinOptionalFseventsPresent: hostPolicy.darwinOptionalFseventsPresent,
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
}

function validateTestOptions(options) {
  if (!isClosedObject(options, ['binding', 'packageRoot', 'version'])) {
    throw new TypeError('test-only own-package options differ from the closed contract');
  }
  const binding = options.binding;
  if (!isClosedObject(binding, ['ownPackageTree', 'packageName', 'tarballSha256'])
      || !PACKAGE_NAME.test(binding.packageName)
      || !DIGEST.test(binding.tarballSha256)
      || !VERSION.test(options.version)) {
    throw new TypeError('test-only own-package binding is invalid');
  }
  validateTreeExpectation(binding.ownPackageTree);
  return {
    packageRoot: options.packageRoot,
    binding,
    version: options.version,
  };
}

function assertCanonicalDirectory(directory, label) {
  const metadata = lstatOrFail(directory, `${label}-unavailable`);
  if (!path.isAbsolute(directory) || path.normalize(directory) !== directory
      || !metadata.isDirectory() || metadata.isSymbolicLink()
      || realpathSync(directory) !== directory) {
    fail(`${label}-not-canonical-directory`);
  }
}

function assertSameRegularFile(actual, expected) {
  if (!actual.isFile() || actual.isSymbolicLink() || actual.nlink !== 1
      || actual.dev !== expected.dev || actual.ino !== expected.ino
      || actual.size !== expected.size || actual.mode !== expected.mode) {
    fail('regular-file-identity-changed');
  }
}

function lstatOrFail(filename, code) {
  try {
    return lstatSync(filename);
  } catch {
    fail(code);
  }
}

function openOrFail(filename, flags, code) {
  try {
    return openSync(filename, flags);
  } catch {
    fail(code);
  }
}

function pathExists(filename) {
  try {
    lstatSync(filename);
    return true;
  } catch (error) {
    if (error?.code === 'ENOENT') return false;
    fail('excluded-dependency-path-unavailable');
  }
}

function isSafeChildName(name) {
  return typeof name === 'string' && name.length > 0 && name !== '.' && name !== '..'
    && !name.includes('/') && !name.includes('\\') && !name.includes('\0')
    && !name.includes('\uFFFD');
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
      && /^private Playwright package preflight failed: [a-z0-9-]+$/.test(error.message)) {
    return error;
  }
  return new Error(`private Playwright package preflight failed: ${stage}`);
}

function fail(code) {
  throw new Error(`private Playwright package preflight failed: ${code}`);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
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

function main() {
  try {
    if (process.argv.length !== 2) fail('cli-arguments-forbidden');
    const audit = preflightPrivatePlaywrightPackagesV049();
    process.stdout.write(`${canonicalJson(audit)}\n`);
  } catch {
    process.stderr.write('private Playwright package preflight failed\n');
    process.exitCode = 1;
  }
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main();
}
