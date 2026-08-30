import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  MINIMUM_SYSTEM_PATH,
  validateRuntimeFreezeEvidence,
  validateRuntimeFreezeProjection,
} from './runtime-freeze-evidence-policy.mjs';

export const RUNTIME_LOCK_PATH = 'evaluation/atomistic/runtime-lock.json';
export const RUNTIME_LOCK_SCHEMA_PATH = 'schemas/atomistic-runtime-lock.schema.json';
export const SCIENTIFIC_PLAN_PATH = 'evaluation/atomistic/reproduction-plan.json';
export const EXPECTED_RUNTIME_LOCK_RAW_DIGEST = 'sha256:b8c352aacfef3f74210d2dbf2002400887e35d21670f5f93da6a8003670bafa1';
export const EXPECTED_RUNTIME_LOCK_SEMANTIC_DIGEST = 'sha256:3f817d5536589d7d1eaeda32d27917ba590d517ee8172d6572b4bee90cc1193a';
export const EXPECTED_SCIENTIFIC_PLAN_RAW_DIGEST = 'sha256:d3a58524029b51c598d00a7bb9f60b6479a9973a0f9907cbf94a31e61bf1c9c2';

export const RUNTIME_LOCK_CONTROL_PATHS = Object.freeze([
  RUNTIME_LOCK_PATH,
  RUNTIME_LOCK_SCHEMA_PATH,
  'scripts/atomistic/runtime-lock-policy.mjs',
  'scripts/atomistic/runtime-lock-policy.test.mjs',
  'scripts/atomistic/runtime-freeze-evidence-policy.mjs',
  'scripts/atomistic/runtime-freeze-evidence-policy.test.mjs',
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
    path: 'scripts/atomistic/v2/run_model.py',
    sizeBytes: 35311,
    mode: '100644',
    sha256: 'sha256:f0f0e2dd09784de064f2ba552a90a390523cd9af4244c0853118317bb42a36bb',
  }),
  Object.freeze({
    path: 'scripts/atomistic/v2/runtime_contract.py',
    sizeBytes: 53577,
    mode: '100644',
    sha256: 'sha256:0a7f2e6e92cfdaeea0a9b532b152fa32c3a562500d7e1962a1573a8b072c34e2',
  }),
]);

export const EXPECTED_RUNTIME_SOURCE_MATERIALIZATIONS = Object.freeze([
  Object.freeze({
    name: 'run_model.py',
    sourcePath: 'scripts/atomistic/v2/run_model.py',
    buildPath: 'scripts/atomistic/run_model.py',
    standardContainerPath: '/opt/tailing-venv/lib/python3.12/site-packages/run_model.py',
    sizeBytes: 35311,
    mode: '100644',
    sha256: 'sha256:f0f0e2dd09784de064f2ba552a90a390523cd9af4244c0853118317bb42a36bb',
  }),
  Object.freeze({
    name: 'runtime_contract.py',
    sourcePath: 'scripts/atomistic/v2/runtime_contract.py',
    buildPath: 'scripts/atomistic/runtime_contract.py',
    standardContainerPath: '/opt/tailing-venv/lib/python3.12/site-packages/runtime_contract.py',
    sizeBytes: 53577,
    mode: '100644',
    sha256: 'sha256:0a7f2e6e92cfdaeea0a9b532b152fa32c3a562500d7e1962a1573a8b072c34e2',
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
  runtimeSourceRevision: 'f861b3e30572f1db366554a2e330d5d6c78bdb56',
  sourceDateEpoch: 1787977543,
  sourceManifestProtocol: 'sha256-canonical-json-ordered-path-mode-size-sha256/v1',
  sourceManifestDigest: 'sha256:08b1ed2ae239ce5732cf565b5e7bd814727a99ad6e1e1a29aeaa21ea1ed529a1',
  files: EXPECTED_RUNTIME_SOURCE_FILES,
  materializationProtocol: 'sha256-canonical-json-ordered-runtime-materializations/v1',
  materializationDigest: 'sha256:345d5e55227bbe873d567f5ea72b88db1f21c1d46e72f078db38e6a455d47721',
  materializations: EXPECTED_RUNTIME_SOURCE_MATERIALIZATIONS,
});

const EXPECTED_BUILD_CONTRACT = Object.freeze({
  schemaVersion: 'tf.atomistic-runtime-inputs/0.2',
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
  runtimeInputManifestProtocol: 'sha256-canonical-json-plus-lf-tf.atomistic-runtime-inputs-0.2/v1',
});

const FROZEN_STATE = 'bootstrap-runtime-frozen-not-reproduced';
const FROZEN_EVIDENCE_CLASS = 'runtime-frozen-not-reproduced';
const OCI_IDENTITY_SEMANTICS = 'run-specific-diagnostics-not-promotion-trust-roots/v1';
const INDEPENDENCE_PROTOCOL = 'distinct-github-run-id-and-attempt-protected-main-identical-promotion-roots/v1';
const NON_PROMOTIONAL_BOOLEAN_KEYS = new Set(['promotionEligible', 'promotionTrustRoot', 'comparable', 'reproduced']);
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

  compare(failures, 'schemaVersion', lock.schemaVersion, 'tf.atomistic-runtime-lock/0.3');
  compare(failures, 'state', lock.state, FROZEN_STATE);
  compare(failures, 'scientificPlan', lock.scientificPlan, {
    path: SCIENTIFIC_PLAN_PATH,
    rawDigest: EXPECTED_SCIENTIFIC_PLAN_RAW_DIGEST,
  });
  compare(failures, 'runtimeSource', lock.runtimeSource, EXPECTED_RUNTIME_SOURCE);
  compare(failures, 'plannedBuildContract', lock.plannedBuildContract, EXPECTED_BUILD_CONTRACT);
  compare(failures, 'replication.requiredIndependentProtectedMainReplicas', lock.replication?.requiredIndependentProtectedMainReplicas, 2);
  compare(failures, 'replication.acceptedProtectedMainReplicas', lock.replication?.acceptedProtectedMainReplicas, 2);
  compare(failures, 'replication.independenceProtocol', lock.replication?.independenceProtocol, INDEPENDENCE_PROTOCOL);
  compare(failures, 'identities.ociImages.identitySemantics', lock.identities?.ociImages?.identitySemantics, OCI_IDENTITY_SEMANTICS);
  compare(failures, 'identities.ociImages.promotionTrustRoot', lock.identities?.ociImages?.promotionTrustRoot, false);
  compare(failures, 'claims', lock.claims, {
    evidenceClass: FROZEN_EVIDENCE_CLASS,
    promotionEligible: false,
    promotionTrustRoot: false,
    comparable: false,
    reproduced: false,
  });
  rejectPositivePromotionClaims(lock, failures);

  for (const model of ['mattersim', 'mace']) {
    for (const field of ['manifestDigest', 'configDigest']) {
      if (lock.identities?.ociImages?.[model]?.[field] !== null) {
        failures.push(`identities.ociImages.${model}.${field}: run-specific OCI diagnostics may not become promotion roots`);
      }
    }
  }

  failures.push(...validateRuntimeFreezeProjection(lock));
  let actualSemanticDigest = null;
  try { actualSemanticDigest = sha256(Buffer.from(canonicalJson(lock), 'utf8')); }
  catch { /* the specific structural failure is reported above or by the schema */ }
  if (actualSemanticDigest !== EXPECTED_RUNTIME_LOCK_SEMANTIC_DIGEST) {
    failures.push('runtime-lock.semantic: exact frozen contract digest mismatch');
  }
  return failures;
}

export async function recomputeRuntimeSourceIdentity(
  root = process.cwd(),
  runtimeSourceRevision = EXPECTED_RUNTIME_SOURCE.runtimeSourceRevision,
) {
  const snapshot = await readRuntimeSourceCommitSnapshot(root, runtimeSourceRevision);
  const files = sourceFileProjection(snapshot);
  const materializations = materializationProjection(snapshot);
  const runnerFiles = materializations.map(({ name, standardContainerPath, sizeBytes, sha256: digest }) => ({
    name,
    standardContainerPath,
    sizeBytes,
    sha256: digest,
  })).sort((left, right) => compareAscii(left.name, right.name));
  const runnerDigest = sha256(Buffer.from(canonicalJson(runnerFiles), 'utf8'));
  const sourceManifestDigest = sha256(Buffer.from(canonicalJson(files), 'utf8'));
  const materializationDigest = sha256(Buffer.from(canonicalJson(materializations), 'utf8'));
  return {
    files,
    materializations,
    fileDigests: Object.fromEntries(files.map((entry) => [entry.path, entry.sha256])),
    sourceManifestDigest,
    materializationDigest,
    runner: {
      implementation: 'tf.atomistic-runner/v2',
      files: runnerFiles,
      digest: runnerDigest,
    },
    runnerDigest,
    buildContextSourceDigest: sourceManifestDigest,
  };
}

export async function validateRuntimeLockRepository(lock, lockBytes, { root = process.cwd() } = {}) {
  const failures = [];
  let snapshot;
  try {
    snapshot = await readRuntimeSourceCommitSnapshot(root, lock?.runtimeSource?.runtimeSourceRevision);
  } catch (error) {
    return [`runtime-source.git: unable to read the bounded P source blobs (${error instanceof Error ? error.message : String(error)})`];
  }
  const actualFiles = sourceFileProjection(snapshot);
  const actualMaterializations = materializationProjection(snapshot);
  compare(failures, 'runtime-source.files', actualFiles, EXPECTED_RUNTIME_SOURCE_FILES);
  compare(failures, 'runtime-source.declaredFiles', lock?.runtimeSource?.files, actualFiles);
  const actualSourceManifestDigest = sha256(Buffer.from(canonicalJson(actualFiles), 'utf8'));
  compare(failures, 'runtime-source.sourceManifestDigest', actualSourceManifestDigest, EXPECTED_RUNTIME_SOURCE.sourceManifestDigest);
  compare(failures, 'runtime-source.declaredSourceManifestDigest', lock?.runtimeSource?.sourceManifestDigest, actualSourceManifestDigest);
  compare(failures, 'runtime-source.materializations', actualMaterializations, EXPECTED_RUNTIME_SOURCE_MATERIALIZATIONS);
  compare(failures, 'runtime-source.declaredMaterializations', lock?.runtimeSource?.materializations, actualMaterializations);
  const actualMaterializationDigest = sha256(Buffer.from(canonicalJson(actualMaterializations), 'utf8'));
  compare(failures, 'runtime-source.materializationDigest', actualMaterializationDigest, EXPECTED_RUNTIME_SOURCE.materializationDigest);
  compare(failures, 'runtime-source.declaredMaterializationDigest', lock?.runtimeSource?.materializationDigest, actualMaterializationDigest);

  let planEntry;
  try {
    planEntry = await readCommitBlob(
      root,
      lock?.runtimeSource?.runtimeSourceRevision,
      SCIENTIFIC_PLAN_PATH,
    );
  } catch (error) {
    failures.push(`scientific-plan.git: unable to read the P blob (${error instanceof Error ? error.message : String(error)})`);
  }
  if (planEntry) {
    const actualPlanDigest = planEntry.sha256;
    compare(failures, 'scientific-plan.rawDigest', actualPlanDigest, EXPECTED_SCIENTIFIC_PLAN_RAW_DIGEST);
    compare(failures, 'scientific-plan.declaredRawDigest', lock?.scientificPlan?.rawDigest, actualPlanDigest);
  }

  const dockerignore = snapshot.find((entry) => entry.path === '.dockerignore')?.bytes.toString('utf8') ?? '';
  const dockerignoreLines = dockerignore.endsWith('\n') ? dockerignore.slice(0, -1).split('\n') : [];
  compare(failures, '.dockerignore.allowlist', dockerignoreLines, EXPECTED_DOCKERIGNORE_LINES);
  for (const source of EXPECTED_RUNTIME_SOURCE_FILES.slice(0, 3)) {
    if (!isAllowedRuntimeBuildContextPath(source.path, dockerignoreLines)) failures.push(`${source.path}: declared build source is outside the bounded build-context allowlist`);
  }
  for (const materialization of actualMaterializations) {
    if (isAllowedRuntimeBuildContextPath(materialization.sourcePath, dockerignoreLines)) failures.push(`${materialization.sourcePath}: versioned source must remain inert outside the Docker build context`);
    if (!isAllowedRuntimeBuildContextPath(materialization.buildPath, dockerignoreLines)) failures.push(`${materialization.buildPath}: materialized runner is outside the Docker build-context allowlist`);
    if (path.posix.basename(materialization.sourcePath) !== materialization.name
        || path.posix.basename(materialization.buildPath) !== materialization.name
        || path.posix.basename(materialization.standardContainerPath) !== materialization.name) {
      failures.push(`${materialization.name}: source, build, and standard-container basenames must agree`);
    }
  }
  const expectedCopy = `COPY --chmod=0444 ${actualMaterializations.map((entry) => entry.buildPath).join(' ')} /opt/tailing-venv/lib/python3.12/site-packages/`;
  for (const dockerfilePath of ['atomistic/containers/mattersim.Dockerfile', 'atomistic/containers/mace.Dockerfile']) {
    const dockerfile = snapshot.find((entry) => entry.path === dockerfilePath)?.bytes.toString('utf8') ?? '';
    if (dockerfile.split(expectedCopy).length !== 2) failures.push(`${dockerfilePath}: P Dockerfile does not materialize the exact runner pair once`);
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
  const revision = lock?.runtimeSource?.runtimeSourceRevision;
  if (!/^[0-9a-f]{40}$/.test(revision ?? '')) return ['runtime-source.git: full revision is required'];
  const options = runtimeSourceGitOptions(root);
  try {
    compare(failures, 'runtime-source.git.runtimeSourceRevision', revision, EXPECTED_RUNTIME_SOURCE.runtimeSourceRevision);
    const { stdout: typeBytes } = await execFile('git', ['cat-file', '-t', revision], options);
    compare(failures, 'runtime-source.git.objectType', typeBytes.toString('ascii').trim(), 'commit');
    await execFile('git', ['merge-base', '--is-ancestor', revision, 'HEAD'], options);
    const { stdout: timestampBytes } = await execFile('git', ['show', '-s', '--format=%ct', revision], options);
    const timestamp = Number(timestampBytes.toString('ascii').trim());
    compare(failures, 'runtime-source.git.sourceDateEpoch', timestamp, lock.runtimeSource.sourceDateEpoch);
    const snapshot = await readRuntimeSourceCommitSnapshot(root, revision);
    const actualFiles = sourceFileProjection(snapshot);
    compare(failures, 'runtime-source.git.files', actualFiles, EXPECTED_RUNTIME_SOURCE_FILES);
    compare(failures, 'runtime-source.git.declaredFiles', lock.runtimeSource.files, actualFiles);
    const actualMaterializations = materializationProjection(snapshot);
    compare(failures, 'runtime-source.git.materializations', actualMaterializations, EXPECTED_RUNTIME_SOURCE_MATERIALIZATIONS);
    compare(failures, 'runtime-source.git.declaredMaterializations', lock.runtimeSource.materializations, actualMaterializations);
    compare(
      failures,
      'runtime-source.git.sourceManifestDigest',
      sha256(Buffer.from(canonicalJson(actualFiles), 'utf8')),
      lock.runtimeSource.sourceManifestDigest,
    );
    compare(
      failures,
      'runtime-source.git.materializationDigest',
      sha256(Buffer.from(canonicalJson(actualMaterializations), 'utf8')),
      lock.runtimeSource.materializationDigest,
    );
  } catch (error) {
    failures.push(`runtime-source.git: unable to verify the P commit object, ancestry, tree, and blobs (${error instanceof Error ? error.message : String(error)})`);
  }
  return failures;
}

export async function validateAtomisticRuntimeLock(lockBytes, {
  root = process.cwd(),
  enforceCheckedInBytes = true,
  runGit,
  runGh,
} = {}) {
  const inspection = inspectRuntimeLockBytes(lockBytes, { enforceCheckedInBytes });
  const failures = [...inspection.failures];
  if (inspection.lock) {
    failures.push(...validateRuntimeLockSemantics(inspection.lock));
    failures.push(...await validateRuntimeLockRepository(inspection.lock, lockBytes, { root }));
    failures.push(...await validateRuntimeSourceCommit(inspection.lock, { root }));
    const freezeEvidence = await validateRuntimeFreezeEvidence(inspection.lock, { root, runGit, runGh });
    failures.push(...freezeEvidence.failures);
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

function rejectPositivePromotionClaims(value, failures, location = '$', seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) {
    failures.push(`${location}: cyclic value is not valid runtime-lock JSON`);
    return;
  }
  seen.add(value);
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectPositivePromotionClaims(entry, failures, `${location}[${index}]`, seen));
  } else {
    for (const [key, entry] of Object.entries(value)) {
      const childLocation = `${location}.${key}`;
      if (NON_PROMOTIONAL_BOOLEAN_KEYS.has(key) && entry !== false) {
        failures.push(`${childLocation}: non-promotional runtime lock requires exact false`);
      }
      rejectPositivePromotionClaims(entry, failures, childLocation, seen);
    }
  }
  seen.delete(value);
}

function sourceFileProjection(snapshot) {
  return snapshot.map(({ path: relativePath, sizeBytes, mode, sha256: digest }) => ({
    path: relativePath,
    sizeBytes,
    mode,
    sha256: digest,
  }));
}

function materializationProjection(snapshot) {
  return EXPECTED_RUNTIME_SOURCE_MATERIALIZATIONS.map((expected) => {
    const source = snapshot.find((entry) => entry.path === expected.sourcePath);
    if (!source) throw new Error(`P source blob is absent: ${expected.sourcePath}`);
    return {
      name: expected.name,
      sourcePath: expected.sourcePath,
      buildPath: expected.buildPath,
      standardContainerPath: expected.standardContainerPath,
      sizeBytes: source.sizeBytes,
      mode: source.mode,
      sha256: source.sha256,
    };
  });
}

async function readRuntimeSourceCommitSnapshot(root, revision) {
  if (!/^[0-9a-f]{40}$/.test(revision ?? '')) throw new Error('full runtimeSourceRevision is required');
  const snapshot = [];
  for (const expected of EXPECTED_RUNTIME_SOURCE_FILES) {
    snapshot.push(await readCommitBlob(root, revision, expected.path));
  }
  return snapshot;
}

async function readCommitBlob(root, revision, relativePath) {
  const options = runtimeSourceGitOptions(root);
  const { stdout: treeBytes } = await execFile('git', ['ls-tree', '-z', revision, '--', relativePath], options);
  const treeText = new TextDecoder('utf-8', { fatal: true }).decode(treeBytes);
  if (!treeText.endsWith('\0') || treeText.indexOf('\0') !== treeText.length - 1) {
    throw new Error(`P tree does not contain exactly one source path: ${relativePath}`);
  }
  const separator = treeText.indexOf('\t');
  if (separator <= 0 || treeText.slice(separator + 1, -1) !== relativePath) {
    throw new Error(`P tree source path differs: ${relativePath}`);
  }
  const metadata = treeText.slice(0, separator).match(/^([0-7]{6}) (blob) ([0-9a-f]{40})$/);
  if (!metadata) throw new Error(`P tree source is not one regular blob: ${relativePath}`);
  const [, mode, , objectId] = metadata;
  const { stdout: blobBytes } = await execFile('git', ['cat-file', 'blob', objectId], options);
  if (blobBytes.length < 1 || blobBytes.length > MAX_POLICY_FILE_BYTES) {
    throw new Error(`P blob is outside the bounded size: ${relativePath}`);
  }
  const actualObjectId = createHash('sha1')
    .update(Buffer.from(`blob ${blobBytes.length}\0`, 'utf8'))
    .update(blobBytes)
    .digest('hex');
  if (actualObjectId !== objectId) throw new Error(`P blob object ID mismatch: ${relativePath}`);
  return {
    path: relativePath,
    sizeBytes: blobBytes.length,
    mode,
    sha256: sha256(blobBytes),
    bytes: blobBytes,
  };
}

export function runtimeSourceGitOptions(root) {
  return {
    cwd: root,
    encoding: null,
    maxBuffer: 5 * 1024 * 1024,
    env: {
      PATH: MINIMUM_SYSTEM_PATH,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_NO_REPLACE_OBJECTS: '1',
      GIT_OPTIONAL_LOCKS: '0',
      LC_ALL: 'C',
    },
  };
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
    'tf.atomistic-runtime-lock/0.3',
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

function compareAscii(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
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
