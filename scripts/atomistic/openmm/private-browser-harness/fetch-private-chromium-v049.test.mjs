import { createHash } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  linkSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PRIVATE_CHROMIUM_LOCK_V049 } from './chromium-v049-lock.mjs';
import {
  PRIVATE_CHROMIUM_ARCHIVE_FILENAME_V049,
  PRIVATE_CHROMIUM_FETCH_TIMEOUT_MILLISECONDS_V049,
  PRIVATE_CHROMIUM_READER_CANCEL_TIMEOUT_MILLISECONDS_V049,
  fetchPrivateChromiumV049,
  fetchPrivateChromiumV049ForTest,
} from './fetch-private-chromium-v049.mjs';

const roots = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('V049 private Linux Chromium archive acquisition', () => {
  it('binds the production request to the exact immutable Linux archive lock', async () => {
    const outputDirectory = createOutputDirectory();
    let observed;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, options) => {
      observed = { url, options };
      return makeResponse({
        bytes: Buffer.alloc(0),
        url,
        status: 302,
        contentLength: '0',
      });
    });
    await expect(fetchPrivateChromiumV049({
      outputDirectory,
    })).rejects.toThrow(/http-status-not-200/);

    expect(observed.url).toBe(
      'https://storage.googleapis.com/chrome-for-testing-public/151.0.7922.34/linux64/chrome-linux64.zip?generation=1784092744255039',
    );
    expect(observed.url).toBe(
      PRIVATE_CHROMIUM_LOCK_V049.platforms['linux-x64'].archiveUrl,
    );
    expect(PRIVATE_CHROMIUM_LOCK_V049.platforms['linux-x64']).toMatchObject({
      archiveByteLength: 193_282_658,
      archiveSha256: 'sha256:ae8736ac28bc69278551500f219fc749575648263c43ec5990749eff43b9fcf8',
    });
    expect(observed.options).toMatchObject({
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: {
        accept: 'application/zip, application/octet-stream',
        'accept-encoding': 'identity',
      },
    });
    expect(observed.options.signal).toBeInstanceOf(AbortSignal);
    expect(PRIVATE_CHROMIUM_FETCH_TIMEOUT_MILLISECONDS_V049).toBe(300_000);
    expect(PRIVATE_CHROMIUM_READER_CANCEL_TIMEOUT_MILLISECONDS_V049).toBe(1_000);
    expect(readdirSync(outputDirectory)).toEqual([]);
  });

  it('streams a tiny locked fixture into a canonical private single-link file', async () => {
    const fixture = createFixture();
    const calls = [];
    const audit = await fetchTiny(fixture, makeFetch(fixture, calls));

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(fixture.lock.archiveUrl);
    expect(calls[0].options.redirect).toBe('error');
    expect(calls[0].options.headers['accept-encoding']).toBe('identity');
    const archivePath = path.join(fixture.outputDirectory, PRIVATE_CHROMIUM_ARCHIVE_FILENAME_V049);
    expect(readFileSync(archivePath)).toEqual(fixture.bytes);
    const metadata = lstatSync(archivePath);
    expect(metadata.isFile()).toBe(true);
    expect(metadata.isSymbolicLink()).toBe(false);
    expect(metadata.nlink).toBe(1);
    expect(metadata.mode & 0o777).toBe(0o400);
    expect(realpathSync(archivePath)).toBe(archivePath);
    expect(readdirSync(fixture.outputDirectory)).toEqual([
      PRIVATE_CHROMIUM_ARCHIVE_FILENAME_V049,
    ]);
    expect(audit).toEqual({
      schemaVersion: 'tf.private-chromium-archive-acquisition-test-audit/0.4.9',
      profile: 'offline-test-fixture-private-chromium-archive-acquisition',
      platform: 'linux-x64',
      playwrightVersion: '1.62.1-test',
      chromiumRevision: '1234-test',
      browserVersion: '151.0.7922.34-test',
      archiveFilename: PRIVATE_CHROMIUM_ARCHIVE_FILENAME_V049,
      archiveByteLength: fixture.bytes.length,
      archiveSha256: fixture.lock.archiveSha256,
      testFixture: true,
      productionAcquisitionEvidence: false,
      networkAccessVerified: false,
      globalFetchImplementationIdentityVerified: false,
      freshProcessRuntimeVerified: false,
      lockedHttpsUrlRequested: false,
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
    expect(Object.isFrozen(audit)).toBe(true);
    expect(Object.isFrozen(audit.claims)).toBe(true);
    const serialized = JSON.stringify(audit);
    expect(serialized).not.toContain(fixture.outputDirectory);
    expect(serialized).not.toContain(fixture.lock.archiveUrl);
    expect(serialized).not.toMatch(/https?:\/\//);
  });

  it('rehashes the published descriptor and removes same-inode stream tampering', async () => {
    const fixture = createFixture();
    let readCount = 0;
    const split = Math.floor(fixture.bytes.length / 2);
    await expect(fetchTiny(fixture, async (url) => ({
      ...makeResponse({ bytes: fixture.bytes, url }),
      body: {
        getReader() {
          return {
            async read() {
              readCount += 1;
              if (readCount === 1) {
                return {
                  done: false,
                  value: new Uint8Array(fixture.bytes.subarray(0, split)),
                };
              }
              if (readCount === 2) {
                const partialName = readdirSync(fixture.outputDirectory)
                  .find((name) => name.endsWith('.partial'));
                expect(partialName).toBeTypeOf('string');
                const descriptor = openSync(
                  path.join(fixture.outputDirectory, partialName),
                  'r+',
                );
                try {
                  writeSync(descriptor, Buffer.from('X'), 0, 1, 0);
                } finally {
                  closeSync(descriptor);
                }
                return {
                  done: false,
                  value: new Uint8Array(fixture.bytes.subarray(split)),
                };
              }
              return { done: true, value: undefined };
            },
            async cancel() {},
          };
        },
      },
    }))).rejects.toThrow(/published-archive-digest-mismatch/);
    expect(readdirSync(fixture.outputDirectory)).toEqual([]);
  });

  it.each([
    ['HTTP redirect', { status: 302 }, /http-status-not-200/],
    ['redirected flag', { redirected: true }, /redirect-forbidden/],
    ['final URL drift', { url: 'https://evil.example.invalid/chromium.zip' },
      /final-response-url-mismatch/],
    ['encoded body', { contentEncoding: 'gzip' }, /encoded-response-forbidden/],
    ['missing Content-Length', { contentLength: null }, /content-length-mismatch/],
    ['wrong Content-Length', { contentLength: '999' }, /content-length-mismatch/],
  ])('rejects %s and removes the private partial', async (_label, override, pattern) => {
    const fixture = createFixture();
    await expect(fetchTiny(fixture, async (url) => makeResponse({
      bytes: fixture.bytes,
      url,
      ...override,
    }))).rejects.toThrow(pattern);
    expect(readdirSync(fixture.outputDirectory)).toEqual([]);
  });

  it.each([
    ['short', (bytes) => bytes.subarray(0, bytes.length - 1), /stream-size-mismatch/],
    ['long', (bytes) => Buffer.concat([bytes, Buffer.from('x')]), /stream-size-bound/],
    ['same-size digest mutation', (bytes) =>
      Buffer.from(bytes.map((value, index) => index === 0 ? value ^ 1 : value)),
    /archive-digest-mismatch/],
  ])('rejects a %s stream and removes the partial file', async (_label, mutate, pattern) => {
    const fixture = createFixture();
    const body = mutate(fixture.bytes);
    await expect(fetchTiny(fixture, async (url) => makeResponse({
      bytes: body,
      url,
      contentLength: String(fixture.bytes.length),
    }))).rejects.toThrow(pattern);
    expect(readdirSync(fixture.outputDirectory)).toEqual([]);
  });

  it('cancels a failing stream and cleans bytes written before the failure', async () => {
    const fixture = createFixture();
    let reads = 0;
    let cancelled = 0;
    const response = makeResponse({ bytes: fixture.bytes, url: fixture.lock.archiveUrl });
    response.body = {
      getReader() {
        return {
          async read() {
            reads += 1;
            if (reads === 1) {
              return { done: false, value: new Uint8Array(fixture.bytes.subarray(0, 5)) };
            }
            throw new Error(`untrusted failure ${fixture.outputDirectory}`);
          },
          async cancel() {
            cancelled += 1;
          },
        };
      },
    };
    await expect(fetchTiny(fixture, async () => response))
      .rejects.toThrow(/^private Chromium archive acquisition failed: bounded-stream$/);
    expect(cancelled).toBe(1);
    expect(readdirSync(fixture.outputDirectory)).toEqual([]);
  });

  it('refuses symlinked, nonempty hard-linked, and non-private output directories before fetch', async () => {
    const fixture = createFixture();
    const linkedDirectory = path.join(fixture.root, 'linked-output');
    symlinkSync(fixture.outputDirectory, linkedDirectory);
    let calls = 0;
    await expect(fetchPrivateChromiumV049ForTest({
      outputDirectory: linkedDirectory,
      fetchImpl: async () => { calls += 1; },
      testLock: fixture.lock,
    })).rejects.toThrow(/not-canonical-real-directory/);

    const external = path.join(fixture.root, 'external');
    writeFileSync(external, 'occupied', { mode: 0o600 });
    linkSync(external, path.join(fixture.outputDirectory, 'hard-link'));
    await expect(fetchTiny(fixture, async () => { calls += 1; }))
      .rejects.toThrow(/output-directory-not-empty/);
    expect(readFileSync(external, 'utf8')).toBe('occupied');

    const second = createFixture();
    chmodSync(second.outputDirectory, 0o755);
    await expect(fetchTiny(second, async () => { calls += 1; }))
      .rejects.toThrow(/not-private-owned-directory/);
    expect(calls).toBe(0);
  });

  it('does not follow or overwrite a symlink injected at the final filename', async () => {
    const fixture = createFixture();
    const external = path.join(fixture.root, 'external-target');
    writeFileSync(external, 'do-not-overwrite', { mode: 0o600 });
    await expect(fetchTiny(fixture, async (url) => {
      symlinkSync(external, path.join(
        fixture.outputDirectory,
        PRIVATE_CHROMIUM_ARCHIVE_FILENAME_V049,
      ));
      return makeResponse({ bytes: fixture.bytes, url });
    })).rejects.toThrow(/exclusive-publication/);
    expect(readFileSync(external, 'utf8')).toBe('do-not-overwrite');
    expect(readdirSync(fixture.outputDirectory).filter((name) => name.endsWith('.partial')))
      .toEqual([]);
  });

  it('detects and removes a hard link to its partial file before publication', async () => {
    const fixture = createFixture();
    await expect(fetchTiny(fixture, async (url) => {
      const partial = readdirSync(fixture.outputDirectory)
        .find((name) => name.endsWith('.partial'));
      expect(partial).toBeTypeOf('string');
      linkSync(
        path.join(fixture.outputDirectory, partial),
        path.join(fixture.outputDirectory, PRIVATE_CHROMIUM_ARCHIVE_FILENAME_V049),
      );
      return makeResponse({ bytes: fixture.bytes, url });
    })).rejects.toThrow(/partial-file-identity-changed/);
    expect(readdirSync(fixture.outputDirectory)).toEqual([]);
  });

  it('rejects extra keys, accessors, symbols, and test-lock extension before network access', async () => {
    const fixture = createFixture();
    let calls = 0;
    const fetchImpl = async () => { calls += 1; };
    await expect(fetchPrivateChromiumV049({
      outputDirectory: fixture.outputDirectory,
      fetchImpl,
      archiveUrl: fixture.lock.archiveUrl,
    })).rejects.toThrow(/option keys differ/);

    const accessorOptions = {};
    Object.defineProperty(accessorOptions, 'outputDirectory', {
      enumerable: true,
      get() { return fixture.outputDirectory; },
    });
    await expect(fetchPrivateChromiumV049(accessorOptions))
      .rejects.toThrow(/enumerable data properties/);

    await expect(fetchPrivateChromiumV049({
      outputDirectory: fixture.outputDirectory,
      [Symbol('hidden')]: true,
    })).rejects.toThrow(/symbol keys/);

    await expect(fetchPrivateChromiumV049ForTest({
      outputDirectory: fixture.outputDirectory,
      fetchImpl,
      testLock: { ...fixture.lock, extra: true },
    })).rejects.toThrow(/test archive lock keys differ/);
    expect(calls).toBe(0);
    expect(readdirSync(fixture.outputDirectory)).toEqual([]);
  });
});

function createOutputDirectory() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'tf-chromium-v049-fetch-')));
  roots.push(root);
  const outputDirectory = path.join(root, 'output');
  mkdirSync(outputDirectory, { mode: 0o700 });
  return outputDirectory;
}

function createFixture() {
  const outputDirectory = createOutputDirectory();
  const root = path.dirname(outputDirectory);
  const bytes = Buffer.from('tiny locked chromium archive fixture', 'ascii');
  return {
    root,
    outputDirectory,
    bytes,
    lock: Object.freeze({
      lockSchemaVersion: 'tf.private-chromium-runtime-lock-test/0.4.9',
      platform: 'linux-x64',
      playwrightVersion: '1.62.1-test',
      chromiumRevision: '1234-test',
      browserVersion: '151.0.7922.34-test',
      archiveUrl: 'https://fixtures.example.invalid/chromium.zip',
      archiveByteLength: bytes.length,
      archiveSha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    }),
  };
}

function fetchTiny(fixture, fetchImpl) {
  return fetchPrivateChromiumV049ForTest({
    outputDirectory: fixture.outputDirectory,
    fetchImpl,
    testLock: fixture.lock,
  });
}

function makeFetch(fixture, calls = []) {
  return async (url, options) => {
    calls.push({ url, options });
    return makeResponse({ bytes: fixture.bytes, url });
  };
}

function makeResponse({
  bytes,
  url,
  status = 200,
  redirected = false,
  contentEncoding,
  contentLength = String(bytes.length),
}) {
  const headers = new Headers();
  if (contentEncoding !== undefined) headers.set('content-encoding', contentEncoding);
  if (contentLength !== null) headers.set('content-length', contentLength);
  const split = Math.max(1, Math.floor(bytes.length / 2));
  const body = new ReadableStream({
    start(controller) {
      if (bytes.length > 0) {
        controller.enqueue(new Uint8Array(bytes.subarray(0, split)));
        if (split < bytes.length) {
          controller.enqueue(new Uint8Array(bytes.subarray(split)));
        }
      }
      controller.close();
    },
  });
  return {
    ok: status === 200,
    status,
    redirected,
    url,
    headers,
    body,
  };
}
