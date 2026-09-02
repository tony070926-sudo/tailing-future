import { createHash } from 'node:crypto';
import {
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
import { afterEach, describe, expect, it } from 'vitest';
import {
  ACQUISITION_MANIFEST_FILENAME,
  FETCH_TIMEOUT_MILLISECONDS,
  LOCKED_CI_ASSETS,
  OPENMM_SOURCE_COMMIT,
  fetchAssetSet,
} from './fetch-ci-assets.mjs';

const roots = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    // Vitest owns these fresh temporary trees. Recursive cleanup is deliberately
    // confined to the exact path returned by mkdtempSync().
    rmSync(root, { recursive: true, force: true });
  }
});

describe('protected-CI OpenMM asset acquisition', () => {
  it('hard-codes exactly the three OpenMM inputs and two Linux wheels', () => {
    expect(ACQUISITION_MANIFEST_FILENAME).toBe('openmm-ci-acquisition-manifest.json');
    expect(LOCKED_CI_ASSETS).toHaveLength(5);
    expect(LOCKED_CI_ASSETS.map((asset) => [
      asset.destination, asset.filename, asset.sizeBytes, asset.sha256,
    ])).toEqual([
      ['input-root', 'Licenses.txt', 9_305,
        'sha256:437b7168cc997abea3b5f2a9e0fb6894f96de77b9c69be428ccfcfe9bed58293'],
      ['input-root', 'tip3p.xml', 19_070,
        'sha256:3f4b188dbcb6c02863230eaca231e927fb6bf3307ce947d8a50d0f46f6dd83d9'],
      ['input-root', 'tip3p.pdb', 179_998,
        'sha256:14fd37900d627c0e258d6086a14c6084e4bec1422e9d20fccfc83c3f814fd7ee'],
      ['wheelhouse', 'openmm-8.6.0-cp312-cp312-manylinux_2_34_x86_64.whl', 14_428_011,
        'sha256:e7acafe671fe40c502623886b15a97bcc948a83a4a995da0336b7ee3ab4b0221'],
      ['wheelhouse',
        'numpy-2.2.6-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl',
        16_527_618,
        'sha256:fd83c01228a688733f1ded5201c678f0c53ecc1006ffbc404db9f7a899ac6249'],
    ]);
    expect(LOCKED_CI_ASSETS.slice(0, 4).every(
      (asset) => asset.sourceCommit === OPENMM_SOURCE_COMMIT,
    )).toBe(true);
    expect(LOCKED_CI_ASSETS.every((asset) => new URL(asset.url).protocol === 'https:')).toBe(true);
  });

  it('streams the closed set, writes 0444 single-link files, and emits a canonical manifest', async () => {
    const fixture = createFixture();
    const calls = [];
    const manifest = await fetchAssetSet({
      ...fixture,
      assets: fixture.assets,
      fetchImpl: makeFetch(fixture.assets, calls),
    });

    expect(calls).toHaveLength(5);
    for (const call of calls) {
      expect(call.options).toMatchObject({
        method: 'GET', redirect: 'error', cache: 'no-store', credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      expect(call.options.headers).toEqual({
        accept: 'application/octet-stream', 'accept-encoding': 'identity',
      });
      expect(call.options.signal).toBeInstanceOf(AbortSignal);
    }
    expect(manifest).toMatchObject({
      schemaVersion: 'tf.openmm-ci-acquisition-manifest/0.4.5',
      networkAccessUsed: true,
      redirectPolicy: 'error',
      timeoutMilliseconds: FETCH_TIMEOUT_MILLISECONDS,
      publicationPolicy: {
        redistributionCleared: false,
        rawAssetsRedistributionCleared: false,
        coordinateAssetsRedistributionCleared: false,
        parameterAssetsRedistributionCleared: false,
        runtimeWheelsRedistributionCleared: false,
        rawAssetsPublic: false,
        coordinateAssetsPublic: false,
        parameterAssetsPublic: false,
        runtimeWheelsPublic: false,
        publicationEligible: false,
      },
      claims: {
        executionAuthenticated: false, reproduced: false, promotionEligible: false,
      },
    });
    expect(manifest.sources).toHaveLength(5);
    for (const asset of fixture.assets) {
      const root = asset.destination === 'input-root' ? fixture.inputRoot : fixture.wheelhouse;
      const metadata = lstatSync(path.join(root, asset.filename));
      expect(metadata.isFile()).toBe(true);
      expect(metadata.nlink).toBe(1);
      expect(metadata.mode & 0o777).toBe(0o444);
    }
    const manifestBytes = readFileSync(fixture.manifestPath, 'ascii');
    expect(manifestBytes.endsWith('\n')).toBe(true);
    expect(manifestBytes.trimEnd()).toBe(canonicalJson(JSON.parse(manifestBytes)));
    expect(lstatSync(fixture.manifestPath).mode & 0o777).toBe(0o444);
  });

  it('rejects a same-size byte mutation by SHA-256', async () => {
    const fixture = createFixture();
    const mutated = new Map(fixture.assets.map((asset) => [asset.url, asset.bytes]));
    const first = fixture.assets[0];
    mutated.set(first.url, Buffer.from(first.bytes.map((value, index) => index === 0 ? value ^ 1 : value)));
    await expect(fetchAssetSet({
      ...fixture,
      assets: fixture.assets,
      fetchImpl: makeFetch(fixture.assets, [], { bodies: mutated }),
    })).rejects.toThrow(/digest differs/);
    expect(() => lstatSync(fixture.manifestPath)).toThrow();
  });

  it.each([
    ['short', (bytes) => bytes.subarray(0, bytes.length - 1)],
    ['long', (bytes) => Buffer.concat([bytes, Buffer.from('x')])],
  ])('rejects a %s response at the streaming size boundary', async (_label, mutate) => {
    const fixture = createFixture();
    const first = fixture.assets[0];
    const bodies = new Map(fixture.assets.map((asset) => [asset.url, asset.bytes]));
    bodies.set(first.url, mutate(first.bytes));
    await expect(fetchAssetSet({
      ...fixture,
      assets: fixture.assets,
      fetchImpl: makeFetch(fixture.assets, [], { bodies, omitContentLength: true }),
    })).rejects.toThrow(/size|streaming size bound/);
  });

  it('requests redirect:error and rejects an HTTP redirect response', async () => {
    const fixture = createFixture();
    let observedOptions;
    await expect(fetchAssetSet({
      ...fixture,
      assets: fixture.assets,
      fetchImpl: async (_url, options) => {
        observedOptions = options;
        return response({ status: 302, url: fixture.assets[0].url, bytes: Buffer.from('') });
      },
    })).rejects.toThrow(/exactly 200/);
    expect(observedOptions.redirect).toBe('error');
  });

  it('rejects a final response URL whose host or path drifted', async () => {
    const fixture = createFixture();
    const first = fixture.assets[0];
    await expect(fetchAssetSet({
      ...fixture,
      assets: fixture.assets,
      fetchImpl: async () => response({
        status: 200,
        url: 'https://evil.example.invalid/substituted',
        bytes: first.bytes,
      }),
    })).rejects.toThrow(/host or path differs/);
  });

  it('refuses an extra file before any network request', async () => {
    const fixture = createFixture();
    writeFileSync(path.join(fixture.inputRoot, 'extra'), 'unexpected');
    let calls = 0;
    await expect(fetchAssetSet({
      ...fixture,
      assets: fixture.assets,
      fetchImpl: async () => { calls += 1; },
    })).rejects.toThrow(/input root must be empty/);
    expect(calls).toBe(0);
  });

  it('refuses symlinked roots and hard-linked preexisting output', async () => {
    const fixture = createFixture();
    const linkedRoot = path.join(fixture.root, 'linked-input');
    symlinkSync(fixture.inputRoot, linkedRoot);
    await expect(fetchAssetSet({
      ...fixture,
      inputRoot: linkedRoot,
      assets: fixture.assets,
      fetchImpl: makeFetch(fixture.assets),
    })).rejects.toThrow(/canonical real directory/);

    const other = path.join(fixture.root, 'other');
    writeFileSync(other, 'occupied');
    linkSync(other, path.join(fixture.wheelhouse, 'hard-link'));
    await expect(fetchAssetSet({
      ...fixture,
      assets: fixture.assets,
      fetchImpl: makeFetch(fixture.assets),
    })).rejects.toThrow(/wheelhouse must be empty/);
  });

  it('refuses to overwrite an existing manifest', async () => {
    const fixture = createFixture();
    writeFileSync(fixture.manifestPath, 'existing');
    let calls = 0;
    await expect(fetchAssetSet({
      ...fixture,
      assets: fixture.assets,
      fetchImpl: async () => { calls += 1; },
    })).rejects.toThrow(/already exists/);
    expect(calls).toBe(0);
    expect(readFileSync(fixture.manifestPath, 'utf8')).toBe('existing');
  });

  it('refuses an unlocked acquisition manifest filename before network access', async () => {
    const fixture = createFixture();
    let calls = 0;
    await expect(fetchAssetSet({
      ...fixture,
      manifestPath: path.join(fixture.root, 'different-name.json'),
      assets: fixture.assets,
      fetchImpl: async () => { calls += 1; },
    })).rejects.toThrow(/manifest filename must be openmm-ci-acquisition-manifest\.json/);
    expect(calls).toBe(0);
  });

  it('produces byte-identical manifests across fresh destination roots', async () => {
    const first = createFixture();
    const second = createFixture();
    await fetchAssetSet({
      ...first,
      assets: first.assets,
      fetchImpl: makeFetch(first.assets),
    });
    await fetchAssetSet({
      ...second,
      assets: second.assets,
      fetchImpl: makeFetch(second.assets),
    });
    expect(readFileSync(first.manifestPath)).toEqual(readFileSync(second.manifestPath));
  });
});

function createFixture() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'tf-openmm-fetch-')));
  roots.push(root);
  const inputRoot = path.join(root, 'inputs');
  const wheelhouse = path.join(root, 'wheelhouse');
  mkdirSync(inputRoot, { mode: 0o700 });
  mkdirSync(wheelhouse, { mode: 0o700 });
  const definitions = [
    ['license', 'license-notices', 'raw-license-notice', 'input-root', 'Licenses.txt', 'license'],
    ['parameters', 'parameter-input', 'parameter', 'input-root', 'tip3p.xml', 'parameters'],
    ['coordinates', 'coordinate-input', 'coordinate', 'input-root', 'tip3p.pdb', 'coordinates'],
    ['openmm-wheel', 'runtime-wheel', 'runtime-wheel', 'wheelhouse', 'openmm.whl', 'openmm-wheel'],
    ['numpy-wheel', 'runtime-wheel', 'runtime-wheel', 'wheelhouse', 'numpy.whl', 'numpy-wheel'],
  ];
  const assets = definitions.map(([id, role, assetClass, destination, filename, body]) => {
    const bytes = Buffer.from(body, 'ascii');
    const pathname = `/locked/${filename}`;
    const record = {
      id,
      role,
      assetClass,
      destination,
      filename,
      url: `https://fixtures.example.invalid${pathname}`,
      host: 'fixtures.example.invalid',
      pathname,
      sizeBytes: bytes.length,
      sha256: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
      sourceCommit: destination === 'input-root' ? OPENMM_SOURCE_COMMIT : null,
    };
    Object.defineProperty(record, 'bytes', { value: bytes, enumerable: false });
    return Object.freeze(record);
  });
  return {
    root,
    inputRoot,
    wheelhouse,
    manifestPath: path.join(root, ACQUISITION_MANIFEST_FILENAME),
    assets,
  };
}

function makeFetch(assets, calls = [], options = {}) {
  const bodies = options.bodies ?? new Map(assets.map((asset) => [asset.url, asset.bytes]));
  return async (url, fetchOptions) => {
    calls.push({ url, options: fetchOptions });
    const asset = assets.find((candidate) => candidate.url === url);
    if (asset === undefined) throw new Error(`unexpected URL ${url}`);
    const bytes = bodies.get(url);
    return response({
      status: 200,
      url,
      bytes,
      contentLength: options.omitContentLength ? null : String(bytes.length),
    });
  };
}

function response({ status, url, bytes, contentLength = String(bytes.length) }) {
  const stream = new ReadableStream({
    start(controller) {
      const split = Math.max(1, Math.floor(bytes.length / 2));
      controller.enqueue(new Uint8Array(bytes.subarray(0, split)));
      if (split < bytes.length) controller.enqueue(new Uint8Array(bytes.subarray(split)));
      controller.close();
    },
  });
  const headers = new Headers();
  if (contentLength !== null) headers.set('content-length', contentLength);
  return {
    ok: status >= 200 && status < 300,
    status,
    redirected: false,
    url,
    headers,
    body: stream,
  };
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
