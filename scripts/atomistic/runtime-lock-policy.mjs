import { constants as fsConstants } from 'node:fs';
import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstat, open, realpath } from 'node:fs/promises';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { promisify } from 'node:util';

export const RUNTIME_LOCK_PATH = 'evaluation/atomistic/runtime-lock.json';
export const RUNTIME_LOCK_SCHEMA_PATH = 'schemas/atomistic-runtime-lock.schema.json';
export const SCIENTIFIC_PLAN_PATH = 'evaluation/atomistic/reproduction-plan.json';
export const EXPECTED_RUNTIME_LOCK_RAW_DIGEST = 'sha256:79e72ba821cfaac298a4898a9b09bd4f0159d3560cdf8f2ac5ba4b005402f6fe';
export const EXPECTED_RUNTIME_LOCK_SEMANTIC_DIGEST = 'sha256:56b5c9370b9117555989300d547bd428d6e565acc64ff2d31f02a9e62eef6e5e';
export const EXPECTED_SCIENTIFIC_PLAN_RAW_DIGEST = 'sha256:d3a58524029b51c598d00a7bb9f60b6479a9973a0f9907cbf94a31e61bf1c9c2';

export const RUNTIME_LOCK_CONTROL_PATHS = Object.freeze([
  RUNTIME_LOCK_PATH,
  RUNTIME_LOCK_SCHEMA_PATH,
  'scripts/atomistic/runtime-lock-policy.mjs',
  'scripts/atomistic/runtime-lock-policy.test.mjs',
  'scripts/validate-atomistic-runtime-lock.mjs',
]);

export const EXPECTED_RUNTIME_SOURCE_FILES = Object.freeze([
  Object.freeze({
    path: '.dockerignore',
    sizeBytes: 338,
    mode: '100644',
    sha256: 'sha256:9d49b6272e10c9c791f6c1288f6df858141bda4613085cc3a811d6edd4aa3ab3',
  }),
  Object.freeze({
    path: 'atomistic/containers/mace.Dockerfile',
    sizeBytes: 3338,
    mode: '100644',
    sha256: 'sha256:d97f48e8d8d75c2b4d22acf46ec5aa7ba21cb2acd59db7a4745e2021f4438b5f',
  }),
  Object.freeze({
    path: 'atomistic/containers/mattersim.Dockerfile',
    sizeBytes: 3533,
    mode: '100644',
    sha256: 'sha256:d672230adbc540391e8be4424aca24c50e473ca46a5a244d06838f55cc288455',
  }),
  Object.freeze({
    path: 'scripts/atomistic/run_model.py',
    sizeBytes: 31874,
    mode: '100644',
    sha256: 'sha256:82704e552e7d5f0a2cdbb0603676429931997653568db70ab016533690c2efd8',
  }),
  Object.freeze({
    path: 'scripts/atomistic/runtime_contract.py',
    sizeBytes: 47702,
    mode: '100644',
    sha256: 'sha256:d1d94c6ee1b256a16c485e1760ea13ebddf24ef0e34ccde7d3682b9c9ceecc61',
  }),
]);

export const EXPECTED_DOCKERIGNORE_LINES = Object.freeze([
  '**',
  '!.dockerignore',
  '!atomistic/',
  '!atomistic/containers/',
  '!atomistic/containers/mattersim.Dockerfile',
  '!atomistic/containers/mace.Dockerfile',
  '!atomistic/locks/',
  '!atomistic/locks/mattersim.requirements.lock',
  '!atomistic/locks/mace.requirements.lock',
  '!scripts/',
  '!scripts/atomistic/',
  '!scripts/atomistic/run_model.py',
  '!scripts/atomistic/runtime_contract.py',
]);

const EXPECTED_RUNTIME_SOURCE = Object.freeze({
  revision: '9a67f4509588d242838c736a580b6ec5badc18f9',
  commitTimestamp: 1787966917,
  sourceManifestDigest: 'sha256:b6d9fcd82a4f1ea0b8ba2f75659551432edcaf2388c6225549c0b064878ac112',
  sourceManifestProtocol: 'sha256-canonical-json-ordered-path-mode-size-sha256/v1',
  files: EXPECTED_RUNTIME_SOURCE_FILES,
});

const EXPECTED_BUILD_CONTRACT = Object.freeze({
  schemaVersion: 'tf.atomistic-runtime-inputs/0.1',
  platform: 'linux/amd64',
  baseImage: Object.freeze({
    reference: 'python:3.12.13-slim-bookworm@sha256:4766d8b510c428e595d74b9cc5bbb2fae8e26316fffb4adc89908d79aacd58a2',
    indexDigest: 'sha256:4766d8b510c428e595d74b9cc5bbb2fae8e26316fffb4adc89908d79aacd58a2',
    platformManifestDigest: 'sha256:6e13e65c55e33adf203d77ee371cf8bf5d81bd4902ef07565721f46bf44917af',
  }),
  dockerfileFrontend: Object.freeze({
    reference: 'docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e',
    manifestDigest: 'sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e',
  }),
  networkPolicy: 'fetch-online-build-and-run-offline',
  provenanceEnabled: false,
  sbomEnabled: false,
  runtimeInputManifestProtocol: 'sha256-canonical-json-plus-lf-tf.atomistic-runtime-inputs-0.1/v1',
});

const DISCOVERY_EVIDENCE_CLASS = 'discovery-only-not-reproduced';
const OCI_IDENTITY_SEMANTICS = 'run-specific-diagnostics-not-promotion-trust-roots/v1';
const INDEPENDENCE_PROTOCOL = 'distinct-github-run-id-and-attempt-protected-main-identical-promotion-roots/v1';
const MAX_POLICY_FILE_BYTES = 1024 * 1024;
const execFile = promisify(execFileCallback);

const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

export function canonicalJson(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('non-finite number in canonical JSON');
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError('unsupported value in canonical JSON');
  return encoded;
}

export function parseJsonRejectingDuplicateMembers(bytes) {
  const buffer = toBuffer(bytes);
  if (buffer.length > MAX_POLICY_FILE_BYTES) throw new SyntaxError('JSON exceeds the policy size limit');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  assertJsonHasNoDuplicateMembers(text);
  return JSON.parse(text);
}

export function inspectRuntimeLockBytes(bytes, { enforceCheckedInBytes = true } = {}) {
  const buffer = toBuffer(bytes);
  const rawDigest = sha256(buffer);
  const failures = [];
  let lock = null;
  let semanticDigest = null;
  try {
    lock = parseJsonRejectingDuplicateMembers(buffer);
    semanticDigest = sha256(Buffer.from(canonicalJson(lock), 'utf8'));
  } catch (error) {
    failures.push(`runtime-lock.raw: invalid or duplicate-member JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  if (enforceCheckedInBytes && rawDigest !== EXPECTED_RUNTIME_LOCK_RAW_DIGEST) {
    failures.push('runtime-lock.raw: checked-in byte digest mismatch');
  }
  return { lock, rawDigest, semanticDigest, failures };
}

export function validateRuntimeLockBytes(bytes, options) {
  return inspectRuntimeLockBytes(bytes, options).failures;
}

export function validateRuntimeLockSemantics(lock) {
  const failures = [];
  if (!lock || typeof lock !== 'object' || Array.isArray(lock)) return ['runtime-lock.semantic: root must be an object'];

  compare(failures, 'schemaVersion', lock.schemaVersion, 'tf.atomistic-runtime-lock/0.1');
  compare(failures, 'scientificPlan', lock.scientificPlan, {
    path: SCIENTIFIC_PLAN_PATH,
    rawDigest: EXPECTED_SCIENTIFIC_PLAN_RAW_DIGEST,
  });
  compare(failures, 'runtimeSource', lock.runtimeSource, EXPECTED_RUNTIME_SOURCE);
  compare(failures, 'plannedBuildContract', lock.plannedBuildContract, EXPECTED_BUILD_CONTRACT);
  compare(failures, 'replication.requiredIndependentProtectedMainReplicas', lock.replication?.requiredIndependentProtectedMainReplicas, 2);
  compare(failures, 'replication.independenceProtocol', lock.replication?.independenceProtocol, INDEPENDENCE_PROTOCOL);
  compare(failures, 'identities.ociImages.identitySemantics', lock.identities?.ociImages?.identitySemantics, OCI_IDENTITY_SEMANTICS);
  compare(failures, 'identities.ociImages.promotionTrustRoot', lock.identities?.ociImages?.promotionTrustRoot, false);
  for (const claim of ['promotionEligible', 'comparable', 'reproduced']) compare(failures, `claims.${claim}`, lock.claims?.[claim], false);

  for (const model of ['mattersim', 'mace']) {
    for (const field of ['manifestDigest', 'configDigest']) {
      if (lock.identities?.ociImages?.[model]?.[field] !== null) {
        failures.push(`identities.ociImages.${model}.${field}: run-specific OCI diagnostics may not become promotion roots`);
      }
    }
  }

  if (lock.state === 'discovery-not-frozen') validateDiscoveryState(lock, failures);
  else failures.push('state: R6a accepts discovery-not-frozen only; freezing requires a separately controlled verifier receipt');

  if (lock.state === 'discovery-not-frozen') {
    let actualSemanticDigest = null;
    try { actualSemanticDigest = sha256(Buffer.from(canonicalJson(lock), 'utf8')); }
    catch { /* the specific structural failure is reported above or by the schema */ }
    if (actualSemanticDigest !== EXPECTED_RUNTIME_LOCK_SEMANTIC_DIGEST) {
      failures.push('runtime-lock.semantic: exact discovery contract digest mismatch');
    }
  }
  return failures;
}

export async function recomputeRuntimeSourceIdentity(root = process.cwd()) {
  const snapshot = await readRuntimeSourceSnapshot(root);
  const files = snapshot.map(({ path: relativePath, sizeBytes, mode, sha256: digest }) => ({
    path: relativePath,
    sizeBytes,
    mode,
    sha256: digest,
  }));
  const runnerFiles = snapshot
    .filter((entry) => entry.path === 'scripts/atomistic/run_model.py' || entry.path === 'scripts/atomistic/runtime_contract.py')
    .map((entry) => ({ name: path.posix.basename(entry.path), sha256: entry.sha256 }))
    .sort((left, right) => left.name.localeCompare(right.name));
  return {
    files,
    fileDigests: Object.fromEntries(files.map((entry) => [entry.path, entry.sha256])),
    runnerDigest: sha256(Buffer.from(canonicalJson(runnerFiles), 'utf8')),
    buildContextSourceDigest: sha256(Buffer.from(canonicalJson(files), 'utf8')),
  };
}

export async function validateRuntimeLockRepository(lock, lockBytes, { root = process.cwd() } = {}) {
  const failures = [];
  let snapshot;
  try {
    snapshot = await readRuntimeSourceSnapshot(root);
  } catch (error) {
    return [`runtime-source: unable to read the bounded source set (${error instanceof Error ? error.message : String(error)})`];
  }
  const actualFiles = snapshot.map(({ path: relativePath, sizeBytes, mode, sha256: digest }) => ({
    path: relativePath,
    sizeBytes,
    mode,
    sha256: digest,
  }));
  compare(failures, 'runtime-source.files', actualFiles, EXPECTED_RUNTIME_SOURCE_FILES);
  compare(failures, 'runtime-source.declaration', lock?.runtimeSource?.files, actualFiles);
  const actualSourceManifestDigest = sha256(Buffer.from(canonicalJson(actualFiles), 'utf8'));
  compare(failures, 'runtime-source.sourceManifestDigest', actualSourceManifestDigest, EXPECTED_RUNTIME_SOURCE.sourceManifestDigest);
  compare(failures, 'runtime-source.declaredSourceManifestDigest', lock?.runtimeSource?.sourceManifestDigest, actualSourceManifestDigest);

  let planBytes;
  try {
    planBytes = await readBoundedRegularFile(root, SCIENTIFIC_PLAN_PATH);
  } catch (error) {
    failures.push(`scientific-plan: unable to read (${error instanceof Error ? error.message : String(error)})`);
  }
  if (planBytes) {
    const actualPlanDigest = sha256(planBytes);
    compare(failures, 'scientific-plan.rawDigest', actualPlanDigest, EXPECTED_SCIENTIFIC_PLAN_RAW_DIGEST);
    compare(failures, 'scientific-plan.declaredRawDigest', lock?.scientificPlan?.rawDigest, actualPlanDigest);
  }

  const dockerignore = snapshot.find((entry) => entry.path === '.dockerignore')?.bytes.toString('utf8') ?? '';
  const dockerignoreLines = dockerignore.endsWith('\n') ? dockerignore.slice(0, -1).split('\n') : [];
  compare(failures, '.dockerignore.allowlist', dockerignoreLines, EXPECTED_DOCKERIGNORE_LINES);
  for (const source of EXPECTED_RUNTIME_SOURCE_FILES) {
    if (!isAllowedRuntimeBuildContextPath(source.path, dockerignoreLines)) failures.push(`${source.path}: declared runtime source is outside the bounded build-context allowlist`);
  }
  for (const controlPath of RUNTIME_LOCK_CONTROL_PATHS) {
    if (isAllowedRuntimeBuildContextPath(controlPath, dockerignoreLines)) failures.push(`${controlPath}: runtime-lock control file entered the Docker build-context allowlist`);
  }

  const buffer = toBuffer(lockBytes);
  const lockText = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  const circularNeedles = runtimeLockCircularReferenceNeedles(buffer, lock);
  if (RUNTIME_LOCK_CONTROL_PATHS.some((controlPath) => lockText.includes(controlPath))) {
    failures.push('runtime-lock: lock bytes contain their own control-file path');
  }
  for (const entry of snapshot) {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(entry.bytes);
    const matched = circularNeedles.find((needle) => text.includes(needle));
    if (matched) failures.push(`${entry.path}: circular runtime-lock reference detected (${describeNeedle(matched)})`);
  }
  return failures;
}

export async function validateRuntimeSourceCommit(lock, { root = process.cwd() } = {}) {
  const failures = [];
  const revision = lock?.runtimeSource?.revision;
  if (!/^[0-9a-f]{40}$/.test(revision ?? '')) return ['runtime-source.git: full revision is required'];
  const gitOptions = {
    cwd: root,
    encoding: null,
    maxBuffer: 5 * 1024 * 1024,
    env: {
      PATH: process.env.PATH,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_NO_REPLACE_OBJECTS: '1',
      GIT_OPTIONAL_LOCKS: '0',
      LC_ALL: 'C',
    },
  };
  try {
    await execFile('git', ['cat-file', '-e', `${revision}^{commit}`], gitOptions);
    await execFile('git', ['merge-base', '--is-ancestor', revision, 'HEAD'], gitOptions);
    const { stdout: timestampBytes } = await execFile('git', ['show', '-s', '--format=%ct', revision], gitOptions);
    const timestamp = Number(timestampBytes.toString('ascii').trim());
    compare(failures, 'runtime-source.git.commitTimestamp', timestamp, lock.runtimeSource.commitTimestamp);
    for (const source of EXPECTED_RUNTIME_SOURCE_FILES) {
      const { stdout: treeBytes } = await execFile('git', ['ls-tree', '-z', revision, '--', source.path], gitOptions);
      const expectedTreePrefix = `${source.mode} blob `;
      const treeText = treeBytes.toString('utf8');
      if (!treeText.startsWith(expectedTreePrefix) || !treeText.endsWith(`\t${source.path}\0`)) {
        failures.push(`${source.path}: R5 commit tree mode or path differs from the runtime lock`);
        continue;
      }
      const { stdout: blobBytes } = await execFile('git', ['cat-file', 'blob', `${revision}:${source.path}`], gitOptions);
      if (blobBytes.length !== source.sizeBytes || sha256(blobBytes) !== source.sha256) {
        failures.push(`${source.path}: R5 commit blob differs from the runtime lock`);
      }
    }
  } catch (error) {
    failures.push(`runtime-source.git: unable to verify the R5 commit object and ancestry (${error instanceof Error ? error.message : String(error)})`);
  }
  return failures;
}

export async function validateAtomisticRuntimeLock(lockBytes, { root = process.cwd(), enforceCheckedInBytes = true } = {}) {
  const inspection = inspectRuntimeLockBytes(lockBytes, { enforceCheckedInBytes });
  const failures = [...inspection.failures];
  if (inspection.lock) {
    failures.push(...validateRuntimeLockSemantics(inspection.lock));
    failures.push(...await validateRuntimeLockRepository(inspection.lock, lockBytes, { root }));
    failures.push(...await validateRuntimeSourceCommit(inspection.lock, { root }));
  }
  return { ...inspection, failures };
}

export function isAllowedRuntimeBuildContextPath(relativePath, dockerignoreLines = EXPECTED_DOCKERIGNORE_LINES) {
  if (!Array.isArray(dockerignoreLines) || dockerignoreLines[0] !== '**') return false;
  const normalized = relativePath.replaceAll('\\', '/').replace(/^\.\//, '');
  const explicitLeaves = new Set(dockerignoreLines
    .filter((line) => line.startsWith('!') && !line.endsWith('/'))
    .map((line) => line.slice(1).replace(/^\.\//, '')));
  return explicitLeaves.has(normalized);
}

function validateDiscoveryState(lock, failures) {
  compare(failures, 'claims.evidenceClass', lock.claims?.evidenceClass, DISCOVERY_EVIDENCE_CLASS);
  for (const [label, value] of promotionRootEntries(lock.identities)) {
    if (value !== null) failures.push(`${label}: discovery identity must remain null until independent replication`);
  }
  const observations = lock.replication?.observations;
  if (!Array.isArray(observations) || observations.length !== 0) failures.push('replication.observations: discovery state must not contain observations');
}

function promotionRootEntries(identities) {
  return [
    ['identities.runnerDigest', identities?.runnerDigest],
    ['identities.dependencyLockDigests.mattersim', identities?.dependencyLockDigests?.mattersim],
    ['identities.dependencyLockDigests.mace', identities?.dependencyLockDigests?.mace],
    ['identities.runtimeInputManifestDigests.mattersim', identities?.runtimeInputManifestDigests?.mattersim],
    ['identities.runtimeInputManifestDigests.mace', identities?.runtimeInputManifestDigests?.mace],
  ];
}

async function readRuntimeSourceSnapshot(root) {
  const snapshot = [];
  for (const expected of EXPECTED_RUNTIME_SOURCE_FILES) {
    const { bytes, mode } = await readBoundedRegularFileWithMetadata(root, expected.path);
    snapshot.push({ path: expected.path, sizeBytes: bytes.length, mode, sha256: sha256(bytes), bytes });
  }
  return snapshot;
}

async function readBoundedRegularFile(root, relativePath) {
  return (await readBoundedRegularFileWithMetadata(root, relativePath)).bytes;
}

async function readBoundedRegularFileWithMetadata(root, relativePath) {
  const resolvedRoot = path.resolve(root);
  const canonicalRoot = await realpath(resolvedRoot);
  const absolutePath = path.resolve(canonicalRoot, relativePath);
  if (absolutePath !== canonicalRoot && !absolutePath.startsWith(`${canonicalRoot}${path.sep}`)) throw new Error(`path escapes root: ${relativePath}`);
  if (await realpath(absolutePath) !== absolutePath) throw new Error(`path must not traverse a symlink: ${relativePath}`);
  const before = await lstat(absolutePath, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size < 1n || before.size > BigInt(MAX_POLICY_FILE_BYTES)) {
    throw new Error(`not one bounded, single-link regular file: ${relativePath}`);
  }
  let handle;
  try {
    handle = await open(absolutePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.nlink !== after.nlink
        || before.size !== after.size || before.mode !== after.mode
        || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
        || BigInt(bytes.length) !== before.size) throw new Error(`file changed while read: ${relativePath}`);
    return { bytes, mode: (Number(before.mode) & 0o177777).toString(8) };
  } finally {
    await handle?.close();
  }
}

function runtimeLockCircularReferenceNeedles(lockBytes, lock) {
  const rawDigest = sha256(lockBytes);
  const semanticDigest = lock ? sha256(Buffer.from(canonicalJson(lock), 'utf8')) : null;
  const gitBlobDigest = createHash('sha1')
    .update(Buffer.from(`blob ${lockBytes.length}\0`, 'utf8'))
    .update(lockBytes)
    .digest('hex');
  const digests = [rawDigest, EXPECTED_RUNTIME_LOCK_RAW_DIGEST, semanticDigest, EXPECTED_RUNTIME_LOCK_SEMANTIC_DIGEST]
    .filter(Boolean)
    .flatMap((digest) => [digest, digest.slice('sha256:'.length)]);
  return [...new Set([
    'tf.atomistic-runtime-lock/0.1',
    'runtime-lock.json',
    gitBlobDigest,
    ...RUNTIME_LOCK_CONTROL_PATHS,
    ...RUNTIME_LOCK_CONTROL_PATHS.map((entry) => path.posix.basename(entry)),
    ...digests,
  ])];
}

function describeNeedle(needle) {
  if (/^[0-9a-f]{40}$/.test(needle)) return 'runtime-lock Git blob digest';
  if (/^(?:sha256:)?[0-9a-f]{64}$/.test(needle)) return 'runtime-lock file or semantic digest';
  return 'runtime-lock schema or control path';
}

function compare(failures, label, actual, expected) {
  if (!isDeepStrictEqual(actual, expected)) failures.push(`${label}: exact runtime-lock contract mismatch`);
}

function toBuffer(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof Uint8Array) return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (typeof bytes === 'string') return Buffer.from(bytes, 'utf8');
  throw new TypeError('runtime-lock bytes must be a string, Buffer, or Uint8Array');
}

function assertJsonHasNoDuplicateMembers(text) {
  let offset = 0;
  const fail = (message) => { throw new SyntaxError(`${message} at byte-like offset ${offset}`); };
  const whitespace = () => { while (/[\t\n\r ]/.test(text[offset] ?? '')) offset += 1; };
  const parseString = () => {
    if (text[offset] !== '"') fail('expected JSON string');
    const start = offset;
    offset += 1;
    while (offset < text.length) {
      const character = text[offset];
      if (character === '"') {
        offset += 1;
        return JSON.parse(text.slice(start, offset));
      }
      if (character === '\\') {
        offset += 1;
        const escape = text[offset];
        if (!'"\\/bfnrtu'.includes(escape ?? '')) fail('invalid JSON escape');
        if (escape === 'u') {
          const digits = text.slice(offset + 1, offset + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(digits)) fail('invalid Unicode escape');
          offset += 4;
        }
        offset += 1;
        continue;
      }
      if (character.charCodeAt(0) < 0x20) fail('unescaped control character');
      offset += 1;
    }
    fail('unterminated JSON string');
  };
  const parseValue = (depth = 0) => {
    if (depth > 256) fail('JSON nesting exceeds 256 levels');
    whitespace();
    const character = text[offset];
    if (character === '{') return parseObject(depth + 1);
    if (character === '[') return parseArray(depth + 1);
    if (character === '"') { parseString(); return; }
    for (const literal of ['true', 'false', 'null']) {
      if (text.startsWith(literal, offset)) { offset += literal.length; return; }
    }
    const number = text.slice(offset).match(/^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/);
    if (number) { offset += number[0].length; return; }
    fail('expected JSON value');
  };
  const parseObject = (depth) => {
    if (depth > 256) fail('JSON nesting exceeds 256 levels');
    offset += 1;
    whitespace();
    const keys = new Set();
    if (text[offset] === '}') { offset += 1; return; }
    while (offset < text.length) {
      whitespace();
      const key = parseString();
      if (keys.has(key)) fail(`duplicate JSON member ${JSON.stringify(key)}`);
      keys.add(key);
      whitespace();
      if (text[offset] !== ':') fail('expected colon');
      offset += 1;
      parseValue(depth);
      whitespace();
      if (text[offset] === '}') { offset += 1; return; }
      if (text[offset] !== ',') fail('expected comma or closing brace');
      offset += 1;
    }
    fail('unterminated JSON object');
  };
  const parseArray = (depth) => {
    if (depth > 256) fail('JSON nesting exceeds 256 levels');
    offset += 1;
    whitespace();
    if (text[offset] === ']') { offset += 1; return; }
    while (offset < text.length) {
      parseValue(depth);
      whitespace();
      if (text[offset] === ']') { offset += 1; return; }
      if (text[offset] !== ',') fail('expected comma or closing bracket');
      offset += 1;
    }
    fail('unterminated JSON array');
  };
  parseValue();
  whitespace();
  if (offset !== text.length) fail('trailing JSON data');
}
