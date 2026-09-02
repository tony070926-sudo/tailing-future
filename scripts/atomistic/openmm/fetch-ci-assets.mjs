#!/usr/bin/env node

import { createHash, randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  fsyncSync,
  fstatSync,
  linkSync,
  lstatSync,
  openSync,
  readdirSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const OPENMM_SOURCE_COMMIT = 'c6173db6e8edd705eb59172bd21e9ce69c572405';
export const FETCH_TIMEOUT_MILLISECONDS = 120_000;
export const ACQUISITION_MANIFEST_FILENAME = 'openmm-ci-acquisition-manifest.json';

const MANIFEST_SCHEMA_VERSION = 'tf.openmm-ci-acquisition-manifest/0.4.5';
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,191}$/;

function lockedAsset(record) {
  return Object.freeze(record);
}

export const LOCKED_CI_ASSETS = Object.freeze([
  lockedAsset({
    id: 'openmm-license-notices',
    role: 'license-notices',
    assetClass: 'raw-license-notice',
    destination: 'input-root',
    filename: 'Licenses.txt',
    url: `https://raw.githubusercontent.com/openmm/openmm/${OPENMM_SOURCE_COMMIT}/docs-source/licenses/Licenses.txt`,
    host: 'raw.githubusercontent.com',
    pathname: `/openmm/openmm/${OPENMM_SOURCE_COMMIT}/docs-source/licenses/Licenses.txt`,
    sizeBytes: 9_305,
    sha256: 'sha256:437b7168cc997abea3b5f2a9e0fb6894f96de77b9c69be428ccfcfe9bed58293',
    sourceCommit: OPENMM_SOURCE_COMMIT,
  }),
  lockedAsset({
    id: 'openmm-tip3p-parameters',
    role: 'parameter-input',
    assetClass: 'parameter',
    destination: 'input-root',
    filename: 'tip3p.xml',
    url: `https://raw.githubusercontent.com/openmm/openmm/${OPENMM_SOURCE_COMMIT}/wrappers/python/openmm/app/data/amber14/tip3p.xml`,
    host: 'raw.githubusercontent.com',
    pathname: `/openmm/openmm/${OPENMM_SOURCE_COMMIT}/wrappers/python/openmm/app/data/amber14/tip3p.xml`,
    sizeBytes: 19_070,
    sha256: 'sha256:3f4b188dbcb6c02863230eaca231e927fb6bf3307ce947d8a50d0f46f6dd83d9',
    sourceCommit: OPENMM_SOURCE_COMMIT,
  }),
  lockedAsset({
    id: 'openmm-tip3p-coordinates',
    role: 'coordinate-input',
    assetClass: 'coordinate',
    destination: 'input-root',
    filename: 'tip3p.pdb',
    url: `https://raw.githubusercontent.com/openmm/openmm/${OPENMM_SOURCE_COMMIT}/wrappers/python/openmm/app/data/tip3p.pdb`,
    host: 'raw.githubusercontent.com',
    pathname: `/openmm/openmm/${OPENMM_SOURCE_COMMIT}/wrappers/python/openmm/app/data/tip3p.pdb`,
    sizeBytes: 179_998,
    sha256: 'sha256:14fd37900d627c0e258d6086a14c6084e4bec1422e9d20fccfc83c3f814fd7ee',
    sourceCommit: OPENMM_SOURCE_COMMIT,
  }),
  lockedAsset({
    id: 'openmm-runtime-wheel',
    role: 'runtime-wheel',
    assetClass: 'runtime-wheel',
    destination: 'wheelhouse',
    filename: 'openmm-8.6.0-cp312-cp312-manylinux_2_34_x86_64.whl',
    url: 'https://files.pythonhosted.org/packages/f1/ac/31ad62cb2066bf3ec805534d95724572fd26c372fb6b1c2403fc4f48875f/openmm-8.6.0-cp312-cp312-manylinux_2_34_x86_64.whl',
    host: 'files.pythonhosted.org',
    pathname: '/packages/f1/ac/31ad62cb2066bf3ec805534d95724572fd26c372fb6b1c2403fc4f48875f/openmm-8.6.0-cp312-cp312-manylinux_2_34_x86_64.whl',
    sizeBytes: 14_428_011,
    sha256: 'sha256:e7acafe671fe40c502623886b15a97bcc948a83a4a995da0336b7ee3ab4b0221',
    sourceCommit: OPENMM_SOURCE_COMMIT,
  }),
  lockedAsset({
    id: 'numpy-runtime-wheel',
    role: 'runtime-wheel',
    assetClass: 'runtime-wheel',
    destination: 'wheelhouse',
    filename: 'numpy-2.2.6-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl',
    url: 'https://files.pythonhosted.org/packages/8c/3d/1e1db36cfd41f895d266b103df00ca5b3cbe965184df824dec5c08c6b803/numpy-2.2.6-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl',
    host: 'files.pythonhosted.org',
    pathname: '/packages/8c/3d/1e1db36cfd41f895d266b103df00ca5b3cbe965184df824dec5c08c6b803/numpy-2.2.6-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl',
    sizeBytes: 16_527_618,
    sha256: 'sha256:fd83c01228a688733f1ded5201c678f0c53ecc1006ffbc404db9f7a899ac6249',
    sourceCommit: null,
  }),
]);

export async function fetchCiAssets({ inputRoot, wheelhouse, manifestPath, fetchImpl = globalThis.fetch }) {
  return fetchAssetSet({
    inputRoot,
    wheelhouse,
    manifestPath,
    fetchImpl,
    assets: LOCKED_CI_ASSETS,
  });
}

// This lower-level export exists so the security and failure behavior can be
// tested with tiny offline byte fixtures. The CLI and fetchCiAssets() never
// accept a substituted asset set.
export async function fetchAssetSet({ inputRoot, wheelhouse, manifestPath, fetchImpl, assets }) {
  if (typeof fetchImpl !== 'function') throw new TypeError('fetchImpl must be a function');
  const normalizedAssets = validateAssetSet(assets);
  const roots = validateDestinations(inputRoot, wheelhouse, manifestPath);
  const records = [];

  for (const asset of normalizedAssets) {
    const destinationRoot = asset.destination === 'input-root'
      ? roots.inputRoot
      : roots.wheelhouse;
    const record = await fetchOneAsset(asset, destinationRoot, fetchImpl);
    records.push(record);
  }

  assertClosedDirectory(
    roots.inputRoot,
    normalizedAssets.filter((asset) => asset.destination === 'input-root')
      .map((asset) => asset.filename),
    'input root',
  );
  assertClosedDirectory(
    roots.wheelhouse,
    normalizedAssets.filter((asset) => asset.destination === 'wheelhouse')
      .map((asset) => asset.filename),
    'wheelhouse',
  );

  const manifestWithoutDigest = {
    schemaVersion: MANIFEST_SCHEMA_VERSION,
    profile: 'protected-ci-online-byte-acquisition',
    openmmSourceCommit: OPENMM_SOURCE_COMMIT,
    networkAccessUsed: true,
    redirectPolicy: 'error',
    timeoutMilliseconds: FETCH_TIMEOUT_MILLISECONDS,
    sizePolicy: 'streamed-exact-byte-count-no-unbounded-buffer',
    sources: records.sort((left, right) => left.id < right.id ? -1 : left.id > right.id ? 1 : 0),
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
      executionAuthenticated: false,
      reproduced: false,
      promotionEligible: false,
    },
  };
  const manifestDigest = sha256(Buffer.from(`${canonicalJson(manifestWithoutDigest)}\n`, 'ascii'));
  const manifest = { ...manifestWithoutDigest, manifestDigest };
  writeNewReadOnlyFile(
    roots.manifestPath,
    Buffer.from(`${canonicalJson(manifest)}\n`, 'ascii'),
  );
  assertSingleLinkReadOnlyFile(roots.manifestPath, undefined, 'acquisition manifest');
  return Object.freeze(manifest);
}

async function fetchOneAsset(asset, destinationRoot, fetchImpl) {
  const destination = path.join(destinationRoot, asset.filename);
  const temporary = path.join(destinationRoot, `.${asset.filename}.${randomUUID()}.tmp`);
  const descriptor = openSync(
    temporary,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW,
    0o600,
  );
  let descriptorOpen = true;
  let reader;
  try {
    const response = await fetchImpl(asset.url, {
      method: 'GET',
      redirect: 'error',
      cache: 'no-store',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      headers: {
        accept: 'application/octet-stream',
        'accept-encoding': 'identity',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MILLISECONDS),
    });
    validateResponse(response, asset);
    reader = response.body.getReader();
    const digest = createHash('sha256');
    let consumed = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array) || value.byteLength === 0) {
        throw new Error(`${asset.filename}: response stream emitted an invalid chunk`);
      }
      consumed += value.byteLength;
      if (consumed > asset.sizeBytes) {
        throw new Error(`${asset.filename}: response exceeded its locked streaming size bound`);
      }
      digest.update(value);
      writeAll(descriptor, value);
    }
    if (consumed !== asset.sizeBytes) {
      throw new Error(`${asset.filename}: response size differs from its locked byte count`);
    }
    const actualDigest = `sha256:${digest.digest('hex')}`;
    if (actualDigest !== asset.sha256) {
      throw new Error(`${asset.filename}: response digest differs from its locked SHA-256`);
    }
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptorOpen = false;
    chmodSync(temporary, 0o444);
    linkSync(temporary, destination);
    unlinkSync(temporary);
    fsyncDirectory(destinationRoot);
    assertSingleLinkReadOnlyFile(destination, asset.sizeBytes, asset.filename);
    return {
      id: asset.id,
      role: asset.role,
      assetClass: asset.assetClass,
      destination: asset.destination,
      filename: asset.filename,
      sourceCommit: asset.sourceCommit,
      url: asset.url,
      sizeBytes: asset.sizeBytes,
      sha256: asset.sha256,
      networkAccessUsed: true,
      redirectFollowed: false,
      redistributionCleared: false,
      publicationEligible: false,
    };
  } catch (error) {
    if (reader !== undefined) {
      try {
        await reader.cancel();
      } catch {
        // Preserve the primary integrity failure.
      }
    }
    throw error;
  } finally {
    if (descriptorOpen) closeSync(descriptor);
    try {
      unlinkSync(temporary);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

function validateResponse(response, asset) {
  if (response === null || typeof response !== 'object') {
    throw new Error(`${asset.filename}: fetch returned no response`);
  }
  if (response.status !== 200 || response.ok !== true) {
    throw new Error(`${asset.filename}: HTTP response must be exactly 200`);
  }
  if (response.redirected !== false) {
    throw new Error(`${asset.filename}: redirects are forbidden`);
  }
  assertExactUrl(response.url, asset, `${asset.filename} final response`);
  if (response.body === null || typeof response.body?.getReader !== 'function') {
    throw new Error(`${asset.filename}: response lacks a readable byte stream`);
  }
  const contentEncoding = response.headers?.get?.('content-encoding');
  if (contentEncoding !== null && contentEncoding !== undefined
      && contentEncoding !== '' && contentEncoding.toLowerCase() !== 'identity') {
    throw new Error(`${asset.filename}: encoded response bodies are forbidden`);
  }
  const contentLength = response.headers?.get?.('content-length');
  if (contentLength !== null && contentLength !== undefined && contentLength !== '') {
    if (!/^(?:0|[1-9][0-9]*)$/.test(contentLength)
        || Number(contentLength) !== asset.sizeBytes) {
      throw new Error(`${asset.filename}: Content-Length differs from the locked byte count`);
    }
  }
}

function validateAssetSet(assets) {
  if (!Array.isArray(assets) || assets.length < 1) throw new TypeError('assets must be a nonempty array');
  const ids = new Set();
  const destinations = new Set();
  return assets.map((asset) => {
    if (asset === null || typeof asset !== 'object' || Array.isArray(asset)) {
      throw new TypeError('asset specification must be an object');
    }
    const expectedKeys = [
      'assetClass', 'destination', 'filename', 'host', 'id', 'pathname', 'role',
      'sha256', 'sizeBytes', 'sourceCommit', 'url',
    ].sort();
    if (canonicalJson(Object.keys(asset).sort()) !== canonicalJson(expectedKeys)) {
      throw new Error('asset specification keys differ from the closed acquisition contract');
    }
    if (!/^[a-z][a-z0-9-]{0,95}$/.test(asset.id) || ids.has(asset.id)) {
      throw new Error('asset IDs must be unique lowercase tokens');
    }
    ids.add(asset.id);
    if (!['input-root', 'wheelhouse'].includes(asset.destination)
        || !SAFE_FILENAME.test(asset.filename)) {
      throw new Error(`${asset.id}: destination or filename is invalid`);
    }
    const destinationIdentity = `${asset.destination}/${asset.filename}`;
    if (destinations.has(destinationIdentity)) throw new Error('asset destinations must be unique');
    destinations.add(destinationIdentity);
    if (!Number.isSafeInteger(asset.sizeBytes) || asset.sizeBytes < 1
        || asset.sizeBytes > 64 * 1024 * 1024 || !DIGEST.test(asset.sha256)) {
      throw new Error(`${asset.id}: size or digest is invalid`);
    }
    if (asset.sourceCommit !== null
        && !/^(?!0{40}$)[0-9a-f]{40}$/.test(asset.sourceCommit)) {
      throw new Error(`${asset.id}: source commit is invalid`);
    }
    for (const field of ['role', 'assetClass', 'host', 'pathname', 'url']) {
      if (typeof asset[field] !== 'string' || asset[field].length === 0) {
        throw new Error(`${asset.id}: ${field} is invalid`);
      }
    }
    assertExactUrl(asset.url, asset, `${asset.id} source`);
    return Object.freeze({ ...asset });
  });
}

function assertExactUrl(rawUrl, asset, label) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`${label}: URL is invalid`);
  }
  if (parsed.protocol !== 'https:' || parsed.username !== '' || parsed.password !== ''
      || parsed.port !== '' || parsed.hostname !== asset.host || parsed.pathname !== asset.pathname
      || parsed.search !== '' || parsed.hash !== '' || parsed.href !== asset.url) {
    throw new Error(`${label}: HTTPS host or path differs from the lock`);
  }
}

function validateDestinations(inputRoot, wheelhouse, manifestPath) {
  const canonicalInputRoot = canonicalEmptyDirectory(inputRoot, 'input root');
  const canonicalWheelhouse = canonicalEmptyDirectory(wheelhouse, 'wheelhouse');
  if (isWithin(canonicalInputRoot, canonicalWheelhouse)
      || isWithin(canonicalWheelhouse, canonicalInputRoot)) {
    throw new Error('input root and wheelhouse must be separate, non-nested directories');
  }
  const canonicalManifestPath = normalizedAbsolutePath(manifestPath, 'manifest path');
  if (path.basename(canonicalManifestPath) !== ACQUISITION_MANIFEST_FILENAME) {
    throw new Error(`acquisition manifest filename must be ${ACQUISITION_MANIFEST_FILENAME}`);
  }
  if (isWithin(canonicalInputRoot, canonicalManifestPath)
      || isWithin(canonicalWheelhouse, canonicalManifestPath)) {
    throw new Error('acquisition manifest must remain outside both asset roots');
  }
  const manifestParent = path.dirname(canonicalManifestPath);
  if (realpathSync(manifestParent) !== manifestParent || !statSync(manifestParent).isDirectory()) {
    throw new Error('manifest parent must be one canonical real directory');
  }
  try {
    lstatSync(canonicalManifestPath);
    throw new Error('acquisition manifest output already exists');
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }
  return {
    inputRoot: canonicalInputRoot,
    wheelhouse: canonicalWheelhouse,
    manifestPath: canonicalManifestPath,
  };
}

function canonicalEmptyDirectory(value, label) {
  const absolute = normalizedAbsolutePath(value, label);
  const metadata = lstatSync(absolute);
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || realpathSync(absolute) !== absolute) {
    throw new Error(`${label} must be one canonical real directory`);
  }
  if (readdirSync(absolute).length !== 0) throw new Error(`${label} must be empty`);
  return absolute;
}

function normalizedAbsolutePath(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.normalize(value) !== value) {
    throw new Error(`${label} must be a normalized absolute path`);
  }
  return value;
}

function isWithin(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith(`..${path.sep}`) && relative !== '..'
    && !path.isAbsolute(relative));
}

function assertClosedDirectory(root, expectedNames, label) {
  const expected = [...expectedNames].sort();
  const actual = readdirSync(root).sort();
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} contains missing or unexpected files`);
  }
  for (const filename of expected) {
    assertSingleLinkReadOnlyFile(path.join(root, filename), undefined, filename);
  }
}

function assertSingleLinkReadOnlyFile(filename, expectedSize, label) {
  const metadata = lstatSync(filename);
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1
      || realpathSync(filename) !== filename || (metadata.mode & 0o777) !== 0o444
      || (expectedSize !== undefined && metadata.size !== expectedSize)) {
    throw new Error(`${label}: output is not the expected canonical single-link 0444 file`);
  }
}

function writeNewReadOnlyFile(filename, bytes) {
  const parent = path.dirname(filename);
  const temporary = path.join(parent, `.${path.basename(filename)}.${randomUUID()}.tmp`);
  const descriptor = openSync(
    temporary,
    fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW,
    0o600,
  );
  let descriptorOpen = true;
  try {
    writeAll(descriptor, bytes);
    fsyncSync(descriptor);
    closeSync(descriptor);
    descriptorOpen = false;
    chmodSync(temporary, 0o444);
    linkSync(temporary, filename);
    unlinkSync(temporary);
    fsyncDirectory(parent);
  } finally {
    if (descriptorOpen) closeSync(descriptor);
    try {
      unlinkSync(temporary);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
  }
}

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.byteLength) {
    const count = writeSync(descriptor, bytes, offset, bytes.byteLength - offset);
    if (count < 1) throw new Error('file write made no progress');
    offset += count;
  }
  const metadata = fstatSync(descriptor);
  if (!metadata.isFile() || metadata.nlink !== 1) {
    throw new Error('temporary output file identity changed while writing');
  }
}

function fsyncDirectory(directory) {
  const descriptor = openSync(directory, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY);
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function canonicalJson(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) =>
      `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new TypeError('canonical JSON cannot contain a non-finite number');
  }
  if (!['string', 'number', 'boolean'].includes(typeof value)) {
    throw new TypeError('canonical JSON contains an unsupported value');
  }
  return JSON.stringify(value);
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!['--input-root', '--wheelhouse', '--manifest'].includes(key)
        || typeof value !== 'string' || value.length === 0 || values.has(key)) {
      throw new Error('usage: fetch-ci-assets.mjs --input-root ABS --wheelhouse ABS --manifest ABS');
    }
    values.set(key, value);
  }
  if (argv.length !== 6 || values.size !== 3) {
    throw new Error('all three acquisition arguments are required exactly once');
  }
  return {
    inputRoot: values.get('--input-root'),
    wheelhouse: values.get('--wheelhouse'),
    manifestPath: values.get('--manifest'),
  };
}

async function main() {
  const manifest = await fetchCiAssets(parseArguments(process.argv.slice(2)));
  process.stdout.write(`${canonicalJson({
    manifestDigest: manifest.manifestDigest,
    sourceCount: manifest.sources.length,
  })}\n`);
}

if (process.argv[1]
    && pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`OpenMM CI asset acquisition failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
