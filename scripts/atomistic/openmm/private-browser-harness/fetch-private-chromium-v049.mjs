#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  linkSync,
  lstatSync,
  openSync,
  readSync,
  readdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { PRIVATE_CHROMIUM_LOCK_V049 } from './chromium-v049-lock.mjs';

export const PRIVATE_CHROMIUM_ARCHIVE_FILENAME_V049 = 'chrome-linux64-v049.zip';
export const PRIVATE_CHROMIUM_FETCH_TIMEOUT_MILLISECONDS_V049 = 300_000;
export const PRIVATE_CHROMIUM_READER_CANCEL_TIMEOUT_MILLISECONDS_V049 = 1_000;

const AUDIT_SCHEMA_VERSION = 'tf.private-chromium-archive-acquisition-audit/0.4.9';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const TEST_LOCK_SCHEMA_VERSION = 'tf.private-chromium-runtime-lock-test/0.4.9';

const PRODUCTION_ARCHIVE_LOCK = deepFreeze({
  lockSchemaVersion: PRIVATE_CHROMIUM_LOCK_V049.schemaVersion,
  platform: 'linux-x64',
  playwrightVersion: PRIVATE_CHROMIUM_LOCK_V049.playwrightVersion,
  chromiumRevision: PRIVATE_CHROMIUM_LOCK_V049.chromiumRevision,
  browserVersion: PRIVATE_CHROMIUM_LOCK_V049.browserVersion,
  archiveUrl: PRIVATE_CHROMIUM_LOCK_V049.platforms['linux-x64'].archiveUrl,
  archiveByteLength: PRIVATE_CHROMIUM_LOCK_V049.platforms['linux-x64'].archiveByteLength,
  archiveSha256: PRIVATE_CHROMIUM_LOCK_V049.platforms['linux-x64'].archiveSha256,
});

/**
 * Acquire the one Linux Chromium archive pinned by chromium-v049-lock.mjs.
 *
 * Callers cannot supply a URL, size, digest, filename, or alternate lock. The
 * returned object intentionally contains no filesystem path or source URL.
 */
export async function fetchPrivateChromiumV049(options) {
  const normalized = validateClosedOptions(options, false);
  return acquireArchive({
    ...normalized,
    fetchImpl: globalThis.fetch,
    archiveLock: PRODUCTION_ARCHIVE_LOCK,
    maximumTestArchiveBytes: undefined,
    testFixture: false,
  });
}

/**
 * Test-only seam for exercising the complete streaming and filesystem path
 * with tiny offline fixtures. It rejects non-test lock schemas and archives
 * larger than 1 MiB. Production code must use fetchPrivateChromiumV049().
 */
export async function fetchPrivateChromiumV049ForTest(options) {
  const normalized = validateClosedOptions(options, true);
  const archiveLock = validateTestLock(normalized.testLock);
  return acquireArchive({
    outputDirectory: normalized.outputDirectory,
    fetchImpl: normalized.fetchImpl,
    archiveLock,
    maximumTestArchiveBytes: 1024 * 1024,
    testFixture: true,
  });
}

async function acquireArchive({
  outputDirectory,
  fetchImpl,
  archiveLock,
  maximumTestArchiveBytes,
  testFixture,
}) {
  let stage = 'input-validation';
  let outputRoot;
  let temporaryPath;
  let destinationPath;
  let descriptor;
  let descriptorIdentity;
  let reader;
  let destinationCreated = false;
  let completed = false;
  let safeAudit;
  let primaryFailure;
  const cleanupFailures = [];

  try {
    validateArchiveLock(archiveLock, maximumTestArchiveBytes);
    outputRoot = canonicalPrivateEmptyDirectory(outputDirectory);
    destinationPath = path.join(outputRoot, PRIVATE_CHROMIUM_ARCHIVE_FILENAME_V049);
    temporaryPath = path.join(outputRoot, `.chromium-v049-${randomUUID()}.partial`);

    stage = 'exclusive-private-file-create';
    descriptor = openSync(
      temporaryPath,
      fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_RDWR
        | (fsConstants.O_NOFOLLOW ?? 0),
      0o600,
    );
    descriptorIdentity = fstatSync(descriptor);
    assertWritablePrivateFile(descriptorIdentity);

    stage = 'network-request';
    const response = await fetchImpl(archiveLock.archiveUrl, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: {
        accept: 'application/zip, application/octet-stream',
        'accept-encoding': 'identity',
      },
      signal: AbortSignal.timeout(PRIVATE_CHROMIUM_FETCH_TIMEOUT_MILLISECONDS_V049),
    });

    stage = 'response-validation';
    validateResponse(response, archiveLock);
    reader = response.body.getReader();

    stage = 'bounded-stream';
    const digest = createHash('sha256');
    let consumedBytes = 0;
    while (true) {
      const result = await reader.read();
      if (result === null || typeof result !== 'object'
          || typeof result.done !== 'boolean') {
        fail('invalid-stream-result');
      }
      if (result.done) {
        if (result.value !== undefined) fail('terminal-stream-value');
        break;
      }
      if (!(result.value instanceof Uint8Array) || result.value.byteLength === 0) {
        fail('invalid-stream-chunk');
      }
      consumedBytes += result.value.byteLength;
      if (!Number.isSafeInteger(consumedBytes)
          || consumedBytes > archiveLock.archiveByteLength) {
        fail('stream-size-bound');
      }
      digest.update(result.value);
      writeAll(descriptor, result.value, descriptorIdentity);
    }

    if (consumedBytes !== archiveLock.archiveByteLength) fail('stream-size-mismatch');
    const actualDigest = `sha256:${digest.digest('hex')}`;
    if (actualDigest !== archiveLock.archiveSha256) fail('archive-digest-mismatch');

    stage = 'private-file-finalization';
    fsyncSync(descriptor);
    fchmodSync(descriptor, 0o400);
    const finalizedIdentity = fstatSync(descriptor);
    assertFinalPrivateFile(finalizedIdentity, descriptorIdentity, archiveLock.archiveByteLength);
    assertNamedPartial(temporaryPath, descriptorIdentity, archiveLock.archiveByteLength);

    stage = 'exclusive-publication';
    linkSync(temporaryPath, destinationPath);
    destinationCreated = true;
    unlinkSync(temporaryPath);
    temporaryPath = undefined;
    fsyncDirectory(outputRoot);
    assertPublishedArchive(
      outputRoot,
      destinationPath,
      descriptorIdentity,
      archiveLock.archiveByteLength,
    );

    stage = 'published-archive-digest';
    const publishedDigest = hashDescriptor(descriptor, archiveLock.archiveByteLength);
    if (publishedDigest !== archiveLock.archiveSha256) {
      fail('published-archive-digest-mismatch');
    }
    assertPublishedArchive(
      outputRoot,
      destinationPath,
      descriptorIdentity,
      archiveLock.archiveByteLength,
    );

    completed = true;
    safeAudit = createSafeAudit(archiveLock, testFixture);
  } catch (error) {
    primaryFailure = sanitizeFailure(error, stage);
  } finally {
    if (reader !== undefined && !completed) {
      try {
        await cancelReaderBounded(reader);
      } catch {
        // Preserve the closed, stage-only primary error.
      }
    }
    if (descriptor !== undefined) {
      try {
        closeSync(descriptor);
      } catch {
        cleanupFailures.push('descriptor-close');
      }
    }
    if (!completed || cleanupFailures.length > 0) {
      cleanupKnownPartial(destinationPath, descriptorIdentity, destinationCreated, cleanupFailures);
      cleanupCreatedPath(temporaryPath, descriptorIdentity, cleanupFailures);
      if (outputRoot !== undefined) {
        try {
          fsyncDirectory(outputRoot);
        } catch {
          cleanupFailures.push('directory-sync');
        }
      }
    }
  }

  if (cleanupFailures.length > 0) fail('partial-cleanup-failed');
  if (primaryFailure !== undefined) throw primaryFailure;
  if (!completed || safeAudit === undefined) {
    throw new Error('private Chromium archive acquisition failed: unknown');
  }
  return safeAudit;
}

function validateClosedOptions(options, testOnly) {
  if (options === null || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('private Chromium acquisition options must be one closed object');
  }
  const prototype = Object.getPrototypeOf(options);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new TypeError('private Chromium acquisition options have an invalid prototype');
  }
  if (Object.getOwnPropertySymbols(options).length !== 0) {
    throw new TypeError('private Chromium acquisition options must not contain symbol keys');
  }
  const descriptors = Object.getOwnPropertyDescriptors(options);
  const keys = Object.keys(descriptors).sort();
  const required = testOnly
    ? ['fetchImpl', 'outputDirectory', 'testLock']
    : ['outputDirectory'];
  const allowed = required;
  if (keys.some((key) => !allowed.includes(key))
      || required.some((key) => descriptors[key] === undefined)) {
    throw new TypeError('private Chromium acquisition option keys differ from the closed contract');
  }
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true) {
      throw new TypeError('private Chromium acquisition options must be enumerable data properties');
    }
  }
  if (testOnly && typeof options.fetchImpl !== 'function') {
    throw new TypeError('private Chromium acquisition fetchImpl must be a function');
  }
  return testOnly
    ? {
        outputDirectory: options.outputDirectory,
        fetchImpl: options.fetchImpl,
        testLock: options.testLock,
      }
    : { outputDirectory: options.outputDirectory };
}

function validateTestLock(testLock) {
  if (testLock === null || typeof testLock !== 'object' || Array.isArray(testLock)
      || (Object.getPrototypeOf(testLock) !== Object.prototype
        && Object.getPrototypeOf(testLock) !== null)
      || Object.getOwnPropertySymbols(testLock).length !== 0) {
    throw new TypeError('test archive lock must be one closed object');
  }
  const expectedKeys = [
    'archiveByteLength', 'archiveSha256', 'archiveUrl', 'browserVersion',
    'chromiumRevision', 'lockSchemaVersion', 'platform', 'playwrightVersion',
  ].sort();
  const descriptors = Object.getOwnPropertyDescriptors(testLock);
  if (canonicalJson(Object.keys(descriptors).sort()) !== canonicalJson(expectedKeys)
      || Object.values(descriptors).some((descriptor) =>
        !Object.hasOwn(descriptor, 'value') || descriptor.enumerable !== true)) {
    throw new TypeError('test archive lock keys differ from the closed contract');
  }
  if (testLock.lockSchemaVersion !== TEST_LOCK_SCHEMA_VERSION) {
    throw new TypeError('test archive lock schema is invalid');
  }
  return deepFreeze({ ...testLock });
}

function validateArchiveLock(lock, maximumTestArchiveBytes) {
  const expectedKeys = [
    'archiveByteLength', 'archiveSha256', 'archiveUrl', 'browserVersion',
    'chromiumRevision', 'lockSchemaVersion', 'platform', 'playwrightVersion',
  ].sort();
  if (lock === null || typeof lock !== 'object' || Array.isArray(lock)
      || canonicalJson(Object.keys(lock).sort()) !== canonicalJson(expectedKeys)) {
    fail('invalid-archive-lock');
  }
  if (lock.platform !== 'linux-x64'
      || typeof lock.lockSchemaVersion !== 'string'
      || typeof lock.playwrightVersion !== 'string'
      || typeof lock.chromiumRevision !== 'string'
      || typeof lock.browserVersion !== 'string'
      || !Number.isSafeInteger(lock.archiveByteLength)
      || lock.archiveByteLength < 1
      || !DIGEST.test(lock.archiveSha256)) {
    fail('invalid-archive-lock');
  }
  if (maximumTestArchiveBytes !== undefined
      && lock.archiveByteLength > maximumTestArchiveBytes) {
    fail('test-archive-size-bound');
  }
  assertExactLockedHttpsUrl(lock.archiveUrl, lock.archiveUrl, 'invalid-archive-lock-url');
}

function canonicalPrivateEmptyDirectory(value) {
  if (typeof value !== 'string' || !path.isAbsolute(value)
      || path.normalize(value) !== value) {
    fail('output-directory-not-normalized-absolute');
  }
  let metadata;
  try {
    metadata = lstatSync(value);
  } catch {
    fail('output-directory-unavailable');
  }
  if (!metadata.isDirectory() || metadata.isSymbolicLink()
      || realpathSync(value) !== value || !statSync(value).isDirectory()) {
    fail('output-directory-not-canonical-real-directory');
  }
  if ((metadata.mode & 0o077) !== 0
      || (typeof process.getuid === 'function' && metadata.uid !== process.getuid())) {
    fail('output-directory-not-private-owned-directory');
  }
  if (readdirSync(value).length !== 0) fail('output-directory-not-empty');
  return value;
}

function validateResponse(response, lock) {
  if (response === null || typeof response !== 'object') fail('missing-response');
  if (response.status !== 200 || response.ok !== true) fail('http-status-not-200');
  if (response.redirected !== false) fail('redirect-forbidden');
  assertExactLockedHttpsUrl(response.url, lock.archiveUrl, 'final-response-url-mismatch');
  if (response.body === null || typeof response.body?.getReader !== 'function') {
    fail('response-body-not-readable-stream');
  }
  const headersGet = response.headers?.get;
  if (typeof headersGet !== 'function') fail('response-headers-unavailable');
  const contentEncoding = headersGet.call(response.headers, 'content-encoding');
  if (contentEncoding !== null && contentEncoding !== undefined
      && contentEncoding !== '' && contentEncoding.toLowerCase() !== 'identity') {
    fail('encoded-response-forbidden');
  }
  const contentLength = headersGet.call(response.headers, 'content-length');
  if (contentLength !== String(lock.archiveByteLength)) {
    fail('content-length-mismatch');
  }
}

function assertExactLockedHttpsUrl(candidate, lockedUrl, errorCode) {
  let parsedCandidate;
  let parsedLock;
  try {
    parsedCandidate = new URL(candidate);
    parsedLock = new URL(lockedUrl);
  } catch {
    fail(errorCode);
  }
  for (const parsed of [parsedCandidate, parsedLock]) {
    if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== ''
        || parsed.port !== '' || parsed.hash !== '') {
      fail(errorCode);
    }
  }
  if (parsedCandidate.href !== parsedLock.href) fail(errorCode);
}

function assertWritablePrivateFile(metadata) {
  if (!metadata.isFile() || metadata.nlink !== 1 || (metadata.mode & 0o777) !== 0o600) {
    fail('exclusive-private-file-identity');
  }
}

function assertFinalPrivateFile(metadata, identity, expectedSize) {
  if (!sameIdentity(metadata, identity) || !metadata.isFile() || metadata.nlink !== 1
      || metadata.size !== expectedSize || (metadata.mode & 0o777) !== 0o400) {
    fail('final-private-file-identity');
  }
}

function assertNamedPartial(temporaryPath, identity, expectedSize) {
  const metadata = lstatSync(temporaryPath);
  if (!sameIdentity(metadata, identity) || !metadata.isFile() || metadata.isSymbolicLink()
      || metadata.nlink !== 1 || metadata.size !== expectedSize
      || (metadata.mode & 0o777) !== 0o400 || realpathSync(temporaryPath) !== temporaryPath) {
    fail('named-partial-file-identity');
  }
}

function assertPublishedArchive(outputRoot, destinationPath, identity, expectedSize) {
  const entries = readdirSync(outputRoot);
  if (entries.length !== 1 || entries[0] !== PRIVATE_CHROMIUM_ARCHIVE_FILENAME_V049) {
    fail('published-directory-not-closed');
  }
  const metadata = lstatSync(destinationPath);
  if (!sameIdentity(metadata, identity) || !metadata.isFile() || metadata.isSymbolicLink()
      || metadata.nlink !== 1 || metadata.size !== expectedSize
      || (metadata.mode & 0o777) !== 0o400 || realpathSync(destinationPath) !== destinationPath) {
    fail('published-private-file-identity');
  }
}

function writeAll(descriptor, bytes, identity) {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const count = writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
    if (count < 1) fail('file-write-no-progress');
    offset += count;
    const current = fstatSync(descriptor);
    if (!sameIdentity(current, identity) || !current.isFile() || current.nlink !== 1
        || (current.mode & 0o777) !== 0o600) {
      fail('partial-file-identity-changed');
    }
  }
}

function hashDescriptor(descriptor, expectedBytes) {
  const digest = createHash('sha256');
  const chunk = Buffer.allocUnsafe(Math.min(1024 * 1024, expectedBytes));
  let offset = 0;
  while (offset < expectedBytes) {
    const count = readSync(
      descriptor,
      chunk,
      0,
      Math.min(chunk.byteLength, expectedBytes - offset),
      offset,
    );
    if (count < 1) fail('published-archive-read-no-progress');
    digest.update(chunk.subarray(0, count));
    offset += count;
  }
  if (readSync(descriptor, chunk, 0, 1, expectedBytes) !== 0) {
    fail('published-archive-size-changed');
  }
  return `sha256:${digest.digest('hex')}`;
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function cleanupKnownPartial(destinationPath, identity, destinationCreated, failures) {
  if (destinationPath === undefined) return;
  let shouldUnlink = false;
  if (identity !== undefined) {
    try {
      shouldUnlink = sameIdentity(lstatSync(destinationPath), identity);
    } catch (error) {
      if (error?.code !== 'ENOENT') failures.push('destination-inspection');
    }
  }
  if (shouldUnlink) {
    cleanupCreatedPath(destinationPath, identity, failures);
  } else if (destinationCreated) {
    failures.push('destination-identity-changed');
  }
}

function cleanupCreatedPath(filename, identity, failures) {
  if (filename === undefined || identity === undefined) return;
  try {
    if (!sameIdentity(lstatSync(filename), identity)) {
      failures.push('created-path-identity-changed');
      return;
    }
    unlinkSync(filename);
  } catch (error) {
    if (error?.code !== 'ENOENT') failures.push('file-unlink');
  }
}

async function cancelReaderBounded(reader) {
  let timeout;
  try {
    await Promise.race([
      Promise.resolve().then(() => reader.cancel()),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('reader cancel timeout')),
          PRIVATE_CHROMIUM_READER_CANCEL_TIMEOUT_MILLISECONDS_V049,
        );
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

function fsyncDirectory(directory) {
  const descriptor = openSync(
    directory,
    fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | (fsConstants.O_NOFOLLOW ?? 0),
  );
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function createSafeAudit(lock, testFixture) {
  return deepFreeze({
    schemaVersion: testFixture
      ? 'tf.private-chromium-archive-acquisition-test-audit/0.4.9'
      : AUDIT_SCHEMA_VERSION,
    profile: testFixture
      ? 'offline-test-fixture-private-chromium-archive-acquisition'
      : 'private-pinned-linux-chromium-archive-acquisition',
    platform: 'linux-x64',
    playwrightVersion: lock.playwrightVersion,
    chromiumRevision: lock.chromiumRevision,
    browserVersion: lock.browserVersion,
    archiveFilename: PRIVATE_CHROMIUM_ARCHIVE_FILENAME_V049,
    archiveByteLength: lock.archiveByteLength,
    archiveSha256: lock.archiveSha256,
    testFixture,
    productionAcquisitionEvidence: !testFixture,
    networkAccessVerified: false,
    globalFetchImplementationIdentityVerified: false,
    freshProcessRuntimeVerified: false,
    lockedHttpsUrlRequested: !testFixture,
    redirectPolicy: 'error',
    redirectFollowed: false,
    identityContentEncodingVerified: true,
    exactContentLengthVerified: true,
    streamedSizeBoundVerified: true,
    responseStreamDigestVerified: true,
    publishedArchiveDigestVerified: true,
    archiveDigestVerified: true,
    canonicalEmptyOutputDirectoryVerified: true,
    exclusiveNoFollowCreateVerified: true,
    privateSingleLinkFileVerified: true,
    outputFileMode: '0400',
    claims: {
      realChromiumExecutionVerified: false,
      executionAuthenticityVerified: false,
      reproduced: false,
      promotionEligible: false,
      publicDistributionEligible: false,
      cloudflareDistributionEligible: false,
    },
  });
}

function sanitizeFailure(error, stage) {
  if (error instanceof Error
      && /^private Chromium archive acquisition failed: [a-z0-9-]+$/.test(error.message)) {
    return error;
  }
  return new Error(`private Chromium archive acquisition failed: ${stage}`);
}

function fail(code) {
  throw new Error(`private Chromium archive acquisition failed: ${code}`);
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

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== '--output-directory'
      || typeof argv[1] !== 'string' || argv[1].length === 0) {
    throw new Error('usage: fetch-private-chromium-v049.mjs --output-directory ABS');
  }
  return argv[1];
}

async function main() {
  try {
    const outputDirectory = parseArguments(process.argv.slice(2));
    const audit = await fetchPrivateChromiumV049({
      outputDirectory,
    });
    process.stdout.write(`${canonicalJson(audit)}\n`);
  } catch {
    process.stderr.write('private Chromium archive acquisition failed\n');
    process.exitCode = 1;
  }
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
