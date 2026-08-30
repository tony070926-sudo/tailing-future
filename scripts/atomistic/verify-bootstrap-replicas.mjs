#!/usr/bin/env node

import { constants as fsConstants } from 'node:fs';
import { execFile } from 'node:child_process';
import {
  chmod, lstat, mkdir, mkdtemp, open, readdir, realpath, rm,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  buildRuntimeInputManifest,
  canonicalJson,
  canonicalJsonBytes,
  parseJsonRejectDuplicateKeys,
  sha256,
} from './runtime-input-contract.mjs';
import { buildContainerObservation } from './write-container-observation.mjs';
import {
  BOOTSTRAP_REPLICA_RECEIPT_SCHEMA_VERSION,
  EXPECTED_BOOTSTRAP_VERIFICATION,
  EXPECTED_BOOTSTRAP_WORKFLOW,
  EXPECTED_NUMERICAL_CONSISTENCY,
  EXPECTED_REPOSITORY as EXPECTED_RECEIPT_REPOSITORY,
  EXPECTED_RUN_SPECIFIC_OBSERVATIONS,
  EXPECTED_STABLE_INPUTS,
  bootstrapReplicaEvidenceFilesCommitment,
  canonicalBootstrapReplicaReceiptBytes,
  computeBootstrapStableInputsCommitment,
  validateBootstrapReplicaReceipt,
} from './bootstrap-replica-receipt-policy.mjs';

export const EXPECTED_REPOSITORY = 'tony070926-sudo/tailing-future';
export const EXPECTED_REPOSITORY_ID = 1_349_498_456;
export const EXPECTED_BOOTSTRAP_WORKFLOW_ID = 344_903_345;
export const EXPECTED_BOOTSTRAP_WORKFLOW_PATH = '.github/workflows/atomistic-bootstrap.yml';
export const EXPECTED_VERIFIER_WORKFLOW_PATH = '.github/workflows/atomistic-bootstrap-verify.yml';
export const EXPECTED_SOURCE_REVISION = '687755a5835b92b632fc116e9b73ab11c1eb6cb5';
export const EXPECTED_RUNTIME_SOURCE_REVISION = 'f861b3e30572f1db366554a2e330d5d6c78bdb56';
export const EXPECTED_SOURCE_DATE_EPOCH = 1_787_977_543;
export const EXPECTED_RUN_IDS = Object.freeze([33_242_996_794, 33_242_999_376]);
export const EXPECTED_RUNNER_DIGEST = 'sha256:d6e83640f15926088c116312c27605570f9e9c8ba4e9a9988ef5bf4d3a974ed4';
export const EXPECTED_SOURCE_MANIFEST_DIGEST = 'sha256:08b1ed2ae239ce5732cf565b5e7bd814727a99ad6e1e1a29aeaa21ea1ed529a1';
export const EXPECTED_MATERIALIZATION_DIGEST = 'sha256:345d5e55227bbe873d567f5ea72b88db1f21c1d46e72f078db38e6a455d47721';
export const EXPECTED_PLAN_DIGEST = 'sha256:d3a58524029b51c598d00a7bb9f60b6479a9973a0f9907cbf94a31e61bf1c9c2';
export const EXPECTED_STRUCTURE_MANIFEST_FILE_DIGEST = 'sha256:9f870f62cd60b7021d874d1970c81ac8cb64a302e2c5fd4013464198fd11a25e';
export const EXPECTED_STRUCTURE_MANIFEST_ROOT = 'sha256:b0a94b5424f9d4a2be7519265b8dbe89a478fa5b21a6c956c70ffe0c705078f7';
export const REPLICA_THRESHOLDS = Object.freeze({
  energyMaxEv: 0.0001,
  forceVectorMaxEvPerAngstrom: 0.0001,
  stressFrobeniusMaxEvPerAngstrom3: 0.00001,
});

const MODELS = Object.freeze(['mattersim', 'mace']);
const MODEL_IDS = Object.freeze({ mattersim: 'mattersim-v1.0.0-5m', mace: 'mace-mpa-0-medium' });
const MODEL_PACKAGES = Object.freeze({
  mattersim: Object.freeze({ checkpoint: 'sha256:e3df9fa708725e3d453140646c7d1838324b347a3d1214cf1440522146f872b5', package: 'sha256:1b5e46ba56efa5c1e93372ad32321300fa5e1f07dd9188a11b727bd578cf8d7f' }),
  mace: Object.freeze({ checkpoint: 'sha256:75428afe3a1d7d8062e19bcaabd5c433623cabf308242ec9fb493e38604fb638', package: 'sha256:b80407edf6b2a1ec8523668c2a36852d20927ce1c3c56b70983a9f2dc53233ad' }),
});
const SMOKE_IDS = Object.freeze([
  'random-TP-000000', 'random-TP-000005', 'random-TP-000010', 'random-TP-000095', 'random-TP-000125',
  'random-TP-000135', 'random-TP-000200', 'random-TP-000220', 'random-TP-000369', 'random-TP-000555',
]);
const CLAIM_KEYS = new Set(['promotionEligible', 'promotionTrustRoot', 'comparable', 'reproduced']);
const FORBIDDEN_EVIDENCE_KEYS = /^(?:referenceLabels?|referenceEnergy|referenceForces?|referenceStress|groundTruth|targets?|metrics?|receipts?|attestations?)$/i;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const REVISION = /^[0-9a-f]{40}$/;
const EXPECTED_JOB_STEPS = Object.freeze([
  [1, 'Set up job'],
  [2, 'Check out the dispatched revision without credentials'],
  [3, 'Install the pinned JavaScript runtime'],
  [4, 'Refuse non-main, non-Linux, or non-x86_64 dispatches'],
  [5, 'Create fresh, model-isolated working directories'],
  [6, 'Bind paths and runner constants from the frozen plan'],
  [7, 'Verify and pull the pinned Linux amd64 base and Dockerfile frontend'],
  [8, 'Fetch and hash-check the selected assets'],
  [9, 'Preprocess structures without mounting any model checkpoint'],
  [10, 'Download one fresh resolved wheelhouse in the online phase'],
  [11, 'Resolve an exact lock from the offline wheelhouse'],
  [12, 'Freeze and verify the exact resolved wheel set'],
  [13, 'Prove a cold, hash-locked install with no network'],
  [14, 'Build the isolated runtime image with no build-step network'],
  [15, 'Run checkpoint deserialization and smoke predictions in the final sandbox'],
  [16, 'Stage only non-promotional bootstrap outputs'],
  [17, 'Upload the allowlisted bootstrap bundle'],
  [33, 'Post Install the pinned JavaScript runtime'],
  [34, 'Post Check out the dispatched revision without credentials'],
  [35, 'Complete job'],
]);
const execFileAsync = promisify(execFile);
const modulePath = fileURLToPath(import.meta.url);
const moduleDirectory = path.dirname(modulePath);
const repositoryRoot = path.resolve(moduleDirectory, '../..');

export const EXPECTED_EVIDENCE = deepFreeze({
  33_242_996_794: {
    runNumber: 13,
    log: { sizeBytes: 120_087, digest: 'sha256:f4cec1a5c2510db7cc1ed349c190ce68ef9d7c1615b4c3d97dfff2a2b2a8b22d' },
    jobs: { mattersim: 99_075_425_745, mace: 99_075_425_834 },
    artifacts: {
      mattersim: { id: 9_711_953_689, sizeBytes: 108_337, digest: 'sha256:12035812d29f2794a449dbe1da932d7ffb8fe954e3c3b8188d4381b760d53384', expiresAt: '2026-09-05T08:25:36Z' },
      mace: { id: 9_711_940_176, sizeBytes: 50_326, digest: 'sha256:be8ff03de186f93658d2dd5a9f30402d9b08db9f991685641e0ae4ec2a7951fa', expiresAt: '2026-09-05T08:24:29Z' },
    },
  },
  33_242_999_376: {
    runNumber: 14,
    log: { sizeBytes: 119_943, digest: 'sha256:1786ee053f173d6101c07babeaea310e188ae5aa318f34390a6ab2eafa7f1036' },
    jobs: { mattersim: 99_075_752_494, mace: 99_075_752_422 },
    artifacts: {
      mattersim: { id: 9_711_987_070, sizeBytes: 108_348, digest: 'sha256:f298e09634006840583bb9be02dc9ff51cc35508d0bdea85cf9d2fe22d4bd3b8', expiresAt: '2026-09-05T08:28:12Z' },
      mace: { id: 9_711_979_645, sizeBytes: 50_320, digest: 'sha256:2180079d260b343f6ebfb3f3bcf19c9bd517056632c461bdeb2d0bfadaa69e53', expiresAt: '2026-09-05T08:27:36Z' },
    },
  },
});

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function fail(message) { throw new Error(`bootstrap replica verification failed: ${message}`); }
function requireValue(condition, message) { if (!condition) fail(message); }
function exactKeys(value, keys, label) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), `${label} must be an object`);
  requireValue(canonicalJson(Object.keys(value).sort()) === canonicalJson([...keys].sort()), `${label} keys differ from policy`);
}

export function parsePositiveInteger(raw, label) {
  const text = String(raw ?? '');
  requireValue(/^[1-9][0-9]*$/.test(text), `${label} must be a canonical positive integer`);
  const value = Number(text);
  requireValue(Number.isSafeInteger(value), `${label} is outside the safe integer range`);
  return value;
}

export function assertNonPromotionalTree(value, label = '$', depth = 0, seen = new WeakSet()) {
  requireValue(depth <= 64, `${label} exceeds the supported nesting depth`);
  if (typeof value === 'number') requireValue(Number.isFinite(value), `${label} contains a non-finite number`);
  if (value === null || typeof value !== 'object') return;
  requireValue(!seen.has(value), `${label} contains a cycle`);
  seen.add(value);
  if (Array.isArray(value)) value.forEach((entry, index) => assertNonPromotionalTree(entry, `${label}[${index}]`, depth + 1, seen));
  else {
    for (const [key, entry] of Object.entries(value)) {
      if (CLAIM_KEYS.has(key)) requireValue(entry === false, `${label}.${key} must be exactly false`);
      if (FORBIDDEN_EVIDENCE_KEYS.test(key)) fail(`${label}.${key} is forbidden in bootstrap-only evidence`);
      assertNonPromotionalTree(entry, `${label}.${key}`, depth + 1, seen);
    }
  }
  seen.delete(value);
}

export function artifactAllowlist(model) {
  requireValue(MODELS.includes(model), 'unknown model allowlist');
  const files = [
    `diagnostics/${model}.buildx-version.txt`,
    `diagnostics/${model}.docker-server-version.txt`,
    `diagnostics/${model}.buildx-metadata.json`,
    `diagnostics/${model}.image-inspect.json`,
    'diagnostics/run-diagnostics.json',
    `locks/${model}.requirements.lock`,
    'manifests/bootstrap-outcome.json',
    'manifests/fetched-assets.manifest.json',
    `manifests/${model}.container-observation.json`,
    `manifests/${model}.runtime-inputs.json`,
    `manifests/${model}.wheelhouse.manifest.json`,
    'manifests/pytorch-download-sources.json',
    'manifests/run-summary.json',
    'manifests/structures.manifest.json',
    'predictions/predictions.jsonl',
  ];
  if (model === 'mace') files.push('manifests/python-hostlist.derived-wheel.manifest.json');
  return Object.freeze(files.sort());
}

function safeArchivePath(name, seen, caseFolded) {
  requireValue(typeof name === 'string' && name.length > 0 && Buffer.byteLength(name) <= 4096, 'ZIP member path is empty or too long');
  requireValue(!/[\u0000-\u001f\u007f\\]/.test(name) && /^[\x20-\x7e]+$/.test(name), `ZIP member has a control, backslash, or non-ASCII path: ${JSON.stringify(name)}`);
  requireValue(!name.startsWith('/') && !/^[A-Za-z]:/.test(name), `ZIP member has an absolute path: ${name}`);
  const parts = name.split('/');
  requireValue(parts.every((part) => part !== '' && part !== '.' && part !== '..'), `ZIP member has an unsafe path: ${name}`);
  requireValue(path.posix.normalize(name) === name, `ZIP member path is not normalized: ${name}`);
  requireValue(!seen.has(name), `ZIP contains duplicate path ${name}`);
  const folded = name.toLowerCase();
  requireValue(!caseFolded.has(folded), `ZIP contains case-folding path collision ${name}`);
  seen.add(name); caseFolded.add(folded);
}

export function inspectZipCentralDirectory(bytes, options = {}) {
  requireValue(Buffer.isBuffer(bytes) || bytes instanceof Uint8Array, 'ZIP must be bytes');
  const buffer = Buffer.from(bytes);
  requireValue(buffer.length >= 22 && buffer.length <= (options.maxArchiveBytes ?? 10_000_000), 'ZIP size is outside policy');
  const minimum = Math.max(0, buffer.length - 65_557);
  let eocd = -1;
  for (let offset = buffer.length - 22; offset >= minimum; offset -= 1) {
    if (buffer.readUInt32LE(offset) === 0x06054b50) { eocd = offset; break; }
  }
  requireValue(eocd >= 0, 'ZIP end-of-central-directory record is missing');
  const disk = buffer.readUInt16LE(eocd + 4);
  const centralDisk = buffer.readUInt16LE(eocd + 6);
  const diskEntries = buffer.readUInt16LE(eocd + 8);
  const entries = buffer.readUInt16LE(eocd + 10);
  const centralSize = buffer.readUInt32LE(eocd + 12);
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  const commentLength = buffer.readUInt16LE(eocd + 20);
  requireValue(disk === 0 && centralDisk === 0 && diskEntries === entries && entries > 0 && entries <= 64, 'ZIP disk or member count is outside policy');
  requireValue(commentLength === 0 && eocd + 22 === buffer.length, 'ZIP comments or trailing bytes are forbidden');
  requireValue(centralOffset !== 0xffffffff && centralSize !== 0xffffffff && centralOffset + centralSize === eocd, 'ZIP64 or malformed central directory is forbidden');
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const seen = new Set(); const caseFolded = new Set(); const records = [];
  let cursor = centralOffset; let expanded = 0;
  for (let index = 0; index < entries; index += 1) {
    requireValue(cursor + 46 <= eocd && buffer.readUInt32LE(cursor) === 0x02014b50, 'ZIP central-directory entry is malformed');
    const versionMadeBy = buffer.readUInt16LE(cursor + 4);
    const flags = buffer.readUInt16LE(cursor + 8);
    const method = buffer.readUInt16LE(cursor + 10);
    const crc32 = buffer.readUInt32LE(cursor + 16);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const sizeBytes = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const entryCommentLength = buffer.readUInt16LE(cursor + 32);
    const diskStart = buffer.readUInt16LE(cursor + 34);
    const externalAttributes = buffer.readUInt32LE(cursor + 38);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const end = cursor + 46 + nameLength + extraLength + entryCommentLength;
    requireValue(end <= eocd && nameLength > 0 && extraLength === 0 && entryCommentLength === 0, 'ZIP extra fields or entry comments are forbidden');
    requireValue(flags === 0x0008 && diskStart === 0, 'ZIP flags must select only one signed data descriptor');
    requireValue(method === 8, 'ZIP entries must use the reviewed deflate method');
    requireValue(compressedSize !== 0xffffffff && sizeBytes !== 0xffffffff && localOffset !== 0xffffffff, 'ZIP64 entry is forbidden');
    const nameBytes = buffer.subarray(cursor + 46, cursor + 46 + nameLength);
    let name;
    try { name = decoder.decode(nameBytes); } catch { fail('ZIP member name is not strict UTF-8'); }
    safeArchivePath(name, seen, caseFolded);
    requireValue(localOffset + 30 <= centralOffset && buffer.readUInt32LE(localOffset) === 0x04034b50, `ZIP local header is missing for ${name}`);
    requireValue(buffer.readUInt16LE(localOffset + 6) === flags && buffer.readUInt16LE(localOffset + 8) === method, `ZIP local flags or method differ for ${name}`);
    requireValue(buffer.readUInt32LE(localOffset + 14) === 0 && buffer.readUInt32LE(localOffset + 18) === 0 && buffer.readUInt32LE(localOffset + 22) === 0, `ZIP data-descriptor local sizes must be zero for ${name}`);
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    requireValue(localExtraLength === 0 && localOffset + 30 + localNameLength + compressedSize + 16 <= centralOffset, `ZIP member data or local extra field is out of bounds for ${name}`);
    requireValue(buffer.subarray(localOffset + 30, localOffset + 30 + localNameLength).equals(nameBytes), `ZIP local and central names differ for ${name}`);
    const unixMode = externalAttributes >>> 16;
    const creator = versionMadeBy >>> 8;
    if (options.requireMode !== undefined) requireValue(creator === 3 && unixMode === options.requireMode, `ZIP member ${name} is not mode ${options.requireMode.toString(8)}`);
    else requireValue(unixMode === 0 || (unixMode & 0o170000) === 0o100000, `ZIP member ${name} is not regular`);
    expanded += sizeBytes;
    requireValue(expanded <= (options.maxExpandedBytes ?? 50_000_000), 'ZIP expanded size exceeds policy');
    records.push({ name, sizeBytes, compressedSize, unixMode, localOffset, crc32, flags, method, localNameLength });
    cursor = end;
  }
  requireValue(cursor === eocd, 'ZIP central directory has unparsed bytes');
  const localRecords = [...records].sort((left, right) => left.localOffset - right.localOffset);
  requireValue(localRecords[0].localOffset === 0, 'ZIP local records must start at byte zero');
  for (let index = 0; index < localRecords.length; index += 1) {
    const record = localRecords[index];
    const descriptor = record.localOffset + 30 + record.localNameLength + record.compressedSize;
    requireValue(buffer.readUInt32LE(descriptor) === 0x08074b50, `ZIP signed data descriptor is missing for ${record.name}`);
    requireValue(buffer.readUInt32LE(descriptor + 4) === record.crc32 && buffer.readUInt32LE(descriptor + 8) === record.compressedSize && buffer.readUInt32LE(descriptor + 12) === record.sizeBytes, `ZIP data descriptor differs from the central directory for ${record.name}`);
    const expectedNext = index + 1 < localRecords.length ? localRecords[index + 1].localOffset : centralOffset;
    requireValue(descriptor + 16 === expectedNext, `ZIP contains a gap or overlap after ${record.name}`);
  }
  if (options.allowedPaths) requireValue(canonicalJson(records.map((entry) => entry.name).sort()) === canonicalJson([...options.allowedPaths].sort()), 'ZIP member allowlist differs from policy');
  return Object.freeze(records.map((record) => Object.freeze({ name: record.name, sizeBytes: record.sizeBytes, compressedSize: record.compressedSize, unixMode: record.unixMode })));
}

export function createGitHubTransport({ token, fetchImpl = globalThis.fetch, apiBase = 'https://api.github.com' } = {}) {
  requireValue(typeof token === 'string' && token.length >= 1 && token.length <= 4096 && !/[\r\n\0]/.test(token), 'GITHUB_TOKEN is missing or malformed');
  requireValue(typeof fetchImpl === 'function', 'fetch implementation is unavailable');
  const base = new URL(apiBase);
  requireValue(base.protocol === 'https:' && base.hostname === 'api.github.com' && base.pathname === '/', 'GitHub API base must be https://api.github.com');
  const request = async (url, { maxBytes, allowRedirect = false }) => {
    let current = new URL(url, base);
    requireValue(current.protocol === 'https:' && current.hostname === 'api.github.com', 'initial GitHub request host is forbidden');
    for (let redirects = 0; redirects <= 3; redirects += 1) {
      const apiRequest = current.hostname === 'api.github.com';
      const response = await fetchImpl(current, {
        method: 'GET', redirect: 'manual', signal: AbortSignal.timeout(120_000),
        headers: apiRequest ? {
          Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`,
          'User-Agent': 'tailing-future-bootstrap-replica-verifier/0.1', 'X-GitHub-Api-Version': '2022-11-28',
        } : { 'User-Agent': 'tailing-future-bootstrap-replica-verifier/0.1' },
      });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        requireValue(allowRedirect && redirects < 3, 'unexpected or excessive GitHub download redirect');
        const location = response.headers.get('location');
        requireValue(location, 'GitHub redirect omitted Location');
        const next = new URL(location, current);
        const allowed = next.protocol === 'https:' && (next.hostname === 'results-receiver.actions.githubusercontent.com' || /^productionresultssa[0-9]+\.blob\.core\.windows\.net$/.test(next.hostname));
        requireValue(allowed && next.username === '' && next.password === '' && next.port === '' && next.hash === '', `GitHub redirect target is forbidden: ${next.host}`);
        current = next;
        continue;
      }
      requireValue(response.status === 200, `GitHub request returned HTTP ${response.status}`);
      const advertised = response.headers.get('content-length');
      if (advertised !== null) requireValue(Number.isSafeInteger(Number(advertised)) && Number(advertised) >= 0 && Number(advertised) <= maxBytes, 'GitHub response Content-Length exceeds policy');
      const chunks = []; let total = 0;
      requireValue(response.body, 'GitHub response body is missing');
      for await (const chunk of response.body) {
        total += chunk.length;
        requireValue(total <= maxBytes, 'GitHub response exceeded the streaming byte limit');
        chunks.push(Buffer.from(chunk));
      }
      return Buffer.concat(chunks, total);
    }
    fail('GitHub redirect loop exceeded policy');
  };
  return Object.freeze({
    async json(endpoint, maxBytes = 5_000_000) {
      const bytes = await request(endpoint, { maxBytes, allowRedirect: false });
      return parseJsonRejectDuplicateKeys(bytes, `GitHub API ${endpoint}`);
    },
    async download(endpoint, maxBytes) { return request(endpoint, { maxBytes, allowRedirect: true }); },
  });
}

export function validateRunMetadata(run, runId) {
  const expected = EXPECTED_EVIDENCE[runId];
  requireValue(expected, `run ${runId} is not one of the two frozen replicas`);
  requireValue(run?.id === runId && run?.run_number === expected.runNumber && run?.run_attempt === 1, `run ${runId} identity or attempt differs`);
  requireValue(run.workflow_id === EXPECTED_BOOTSTRAP_WORKFLOW_ID && run.path === EXPECTED_BOOTSTRAP_WORKFLOW_PATH, `run ${runId} workflow differs`);
  requireValue(run.event === 'workflow_dispatch' && run.status === 'completed' && run.conclusion === 'success', `run ${runId} did not complete successfully by manual dispatch`);
  requireValue(run.head_branch === 'main' && run.head_sha === EXPECTED_SOURCE_REVISION, `run ${runId} is not protected-main source S`);
  for (const identity of [run.repository, run.head_repository]) requireValue(identity?.id === EXPECTED_REPOSITORY_ID && identity?.full_name === EXPECTED_REPOSITORY, `run ${runId} repository identity differs`);
  for (const key of ['created_at', 'run_started_at', 'updated_at']) requireTimestamp(run[key], `run ${runId}.${key}`);
}

function requireTimestamp(value, label) {
  requireValue(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) && Number.isFinite(Date.parse(value)), `${label} is not a timestamp`);
  return value;
}

export function validateJobs(payload, runId) {
  requireValue(payload?.total_count === 2 && Array.isArray(payload.jobs) && payload.jobs.length === 2, `run ${runId} must contain exactly two jobs`);
  const byModel = {};
  for (const job of payload.jobs) {
    const model = MODELS.find((candidate) => job.name === `${candidate} isolated bootstrap smoke`);
    requireValue(model && !byModel[model], `run ${runId} has an unexpected or duplicate job`);
    requireValue(job.id === EXPECTED_EVIDENCE[runId].jobs[model] && job.run_id === runId && job.run_attempt === 1 && job.head_sha === EXPECTED_SOURCE_REVISION, `run ${runId} ${model} job identity differs`);
    requireValue(job.status === 'completed' && job.conclusion === 'success' && job.workflow_name === 'Atomistic bootstrap predictions (non-promotional)', `run ${runId} ${model} job did not succeed`);
    requireValue(job.runner_group_name === 'GitHub Actions' && /^GitHub Actions [1-9][0-9]*$/.test(job.runner_name), `run ${runId} ${model} job was not GitHub-hosted`);
    requireValue(canonicalJson(job.labels) === canonicalJson(['ubuntu-24.04']), `run ${runId} ${model} runner labels differ`);
    requireTimestamp(job.started_at, `run ${runId} ${model} job started_at`); requireTimestamp(job.completed_at, `run ${runId} ${model} job completed_at`);
    requireValue(Array.isArray(job.steps) && job.steps.length === EXPECTED_JOB_STEPS.length && job.steps.every((step, index) => step.status === 'completed' && step.conclusion === 'success' && step.number === EXPECTED_JOB_STEPS[index][0] && step.name === EXPECTED_JOB_STEPS[index][1]), `run ${runId} ${model} job steps differ or failed`);
    byModel[model] = job;
  }
  return byModel;
}

export function validateArtifacts(payload, runId, now = new Date()) {
  requireValue(payload?.total_count === 2 && Array.isArray(payload.artifacts) && payload.artifacts.length === 2, `run ${runId} must contain exactly two artifacts`);
  const byModel = {};
  for (const artifact of payload.artifacts) {
    const model = MODELS.find((candidate) => artifact.name === `tailing-atomistic-bootstrap-${candidate}-${EXPECTED_SOURCE_REVISION}-${runId}-1`);
    requireValue(model && !byModel[model], `run ${runId} has an unexpected or duplicate artifact`);
    const expected = EXPECTED_EVIDENCE[runId].artifacts[model];
    requireValue(artifact.id === expected.id && artifact.size_in_bytes === expected.sizeBytes && artifact.digest === expected.digest, `run ${runId} ${model} artifact identity, size, or digest differs`);
    requireValue(artifact.expired === false && artifact.expires_at === expected.expiresAt && Date.parse(artifact.expires_at) > now.getTime(), `run ${runId} ${model} artifact is expired or expiry drifted`);
    requireValue(artifact.workflow_run?.id === runId && artifact.workflow_run?.head_sha === EXPECTED_SOURCE_REVISION && artifact.workflow_run?.repository_id === EXPECTED_REPOSITORY_ID && artifact.workflow_run?.head_repository_id === EXPECTED_REPOSITORY_ID, `run ${runId} ${model} artifact workflow binding differs`);
    const expectedDownload = `https://api.github.com/repos/${EXPECTED_REPOSITORY}/actions/artifacts/${expected.id}/zip`;
    requireValue(artifact.archive_download_url === expectedDownload, `run ${runId} ${model} artifact download URL differs`);
    requireTimestamp(artifact.created_at, `artifact ${artifact.id}.created_at`); requireTimestamp(artifact.updated_at, `artifact ${artifact.id}.updated_at`);
    byModel[model] = artifact;
  }
  return byModel;
}

export function verifyLogBindings(text, runId, artifacts) {
  requireValue(typeof text === 'string' && text.length > 0 && text.length <= 2_000_000 && !text.includes('\0'), `run ${runId} log text is invalid`);
  const plain = text.replace(/\u001b\[[0-9;]*m/g, '');
  for (const [model, artifact] of Object.entries(artifacts)) {
    requireValue(MODELS.includes(model) && artifact, `run ${runId} log binding model is invalid`);
    const digest = artifact.digest.slice(7); const size = artifact.size_in_bytes;
    const snippets = [
      `name: ${artifact.name}`,
      `Uploaded bytes ${size}`,
      `SHA256 digest of uploaded artifact zip is ${digest}`,
      `Final size is ${size} bytes. Artifact ID is ${artifact.id}`,
      `Artifact ID ${artifact.id}`,
      `actions/runs/${runId}/artifacts/${artifact.id}`,
    ];
    for (const snippet of snippets) requireValue(plain.includes(snippet), `run ${runId} ${model} log omits ${snippet}`);
  }
}

export function comparePredictionReplicas(left, right, model) {
  requireValue(Array.isArray(left) && Array.isArray(right) && left.length === 10 && right.length === 10, `${model} must contain two ten-record prediction sets`);
  const maxima = { energyMaxEv: 0, forceVectorMaxEvPerAngstrom: 0, stressFrobeniusMaxEvPerAngstrom3: 0 };
  for (let index = 0; index < 10; index += 1) {
    const a = left[index]; const b = right[index];
    requireValue(a.id === b.id && a.inputStructureDigest === b.inputStructureDigest && canonicalJson(a.atomicNumbers) === canonicalJson(b.atomicNumbers), `${model} replica inputs differ at ${index}`);
    const strip = (record) => Object.fromEntries(Object.entries(record).filter(([key]) => !['environmentSha256', 'energyEv', 'forcesEvPerAngstrom', 'stressAseEvPerAngstrom3'].includes(key)));
    requireValue(canonicalJson(strip(a)) === canonicalJson(strip(b)), `${model} replica non-numerical predictions differ at ${a.id}`);
    const energy = Math.abs(a.energyEv - b.energyEv);
    let force = 0;
    for (let atom = 0; atom < 16; atom += 1) force = Math.max(force, Math.hypot(...a.forcesEvPerAngstrom[atom].map((value, axis) => value - b.forcesEvPerAngstrom[atom][axis])));
    let stressSquared = 0;
    for (let row = 0; row < 3; row += 1) for (let column = 0; column < 3; column += 1) stressSquared += (a.stressAseEvPerAngstrom3[row][column] - b.stressAseEvPerAngstrom3[row][column]) ** 2;
    maxima.energyMaxEv = Math.max(maxima.energyMaxEv, energy);
    maxima.forceVectorMaxEvPerAngstrom = Math.max(maxima.forceVectorMaxEvPerAngstrom, force);
    maxima.stressFrobeniusMaxEvPerAngstrom3 = Math.max(maxima.stressFrobeniusMaxEvPerAngstrom3, Math.sqrt(stressSquared));
  }
  if (model === 'mace') requireValue(Object.values(maxima).every((value) => value === 0), 'MACE numerical predictions are not identical across replicas');
  for (const [key, threshold] of Object.entries(REPLICA_THRESHOLDS)) requireValue(maxima[key] <= threshold + Number.EPSILON, `${model} ${key} exceeds the frozen replica threshold`);
  return Object.freeze(maxima);
}

const PREDICTION_KEYS = Object.freeze([
  'atomCount', 'atomicNumbers', 'checkpointSha256', 'energyEv', 'environmentSha256', 'forcesEvPerAngstrom',
  'id', 'inputStructureDigest', 'modelId', 'packageSha256', 'runnerSha256', 'schemaVersion', 'status',
  'stressAseEvPerAngstrom3',
]);

export function parseAndValidatePredictions(bytes, model) {
  requireValue(MODELS.includes(model), 'prediction model is unknown');
  requireValue(Buffer.isBuffer(bytes) && bytes.length > 0 && bytes.length <= 1_000_000, `${model} predictions size is outside policy`);
  requireValue(bytes[bytes.length - 1] === 0x0a && !bytes.subarray(0, bytes.length - 1).includes(0x0d), `${model} predictions must be JSONL with LF endings`);
  const lines = bytes.subarray(0, bytes.length - 1).toString('utf8').split('\n');
  requireValue(lines.length === 10 && lines.every((line) => line.length > 0), `${model} predictions must contain exactly ten records`);
  const records = lines.map((line, index) => {
    const record = parseJsonRejectDuplicateKeys(Buffer.from(line), `${model} prediction ${index}`);
    exactKeys(record, PREDICTION_KEYS, `${model} prediction ${index}`);
    assertNonPromotionalTree(record, `${model} prediction ${index}`);
    requireValue(line === canonicalJson(record), `${model} prediction ${index} is not canonical JSON`);
    requireValue(record.schemaVersion === 'tf.atomistic-prediction/0.3' && record.status === 'success', `${model} prediction ${index} schema or status differs`);
    requireValue(record.id === SMOKE_IDS[index] && record.modelId === MODEL_IDS[model], `${model} prediction ${index} identity differs`);
    requireValue(record.atomCount === 16 && Array.isArray(record.atomicNumbers) && record.atomicNumbers.length === 16 && record.atomicNumbers.every((value) => Number.isSafeInteger(value) && value >= 1 && value <= 118), `${model} prediction ${index} atomic numbers are invalid`);
    requireValue(DIGEST.test(record.inputStructureDigest) && DIGEST.test(record.environmentSha256), `${model} prediction ${index} input/environment digest is invalid`);
    requireValue(record.checkpointSha256 === MODEL_PACKAGES[model].checkpoint && record.packageSha256 === MODEL_PACKAGES[model].package && record.runnerSha256 === EXPECTED_RUNNER_DIGEST, `${model} prediction ${index} immutable model or runner digest differs`);
    requireValue(Number.isFinite(record.energyEv), `${model} prediction ${index} energy is non-finite`);
    requireValue(Array.isArray(record.forcesEvPerAngstrom) && record.forcesEvPerAngstrom.length === 16 && record.forcesEvPerAngstrom.every((row) => Array.isArray(row) && row.length === 3 && row.every(Number.isFinite)), `${model} prediction ${index} forces are not finite 16x3 vectors`);
    requireValue(Array.isArray(record.stressAseEvPerAngstrom3) && record.stressAseEvPerAngstrom3.length === 3 && record.stressAseEvPerAngstrom3.every((row) => Array.isArray(row) && row.length === 3 && row.every(Number.isFinite)), `${model} prediction ${index} stress is not a finite 3x3 tensor`);
    for (let row = 0; row < 3; row += 1) for (let column = 0; column < 3; column += 1) requireValue(Math.abs(record.stressAseEvPerAngstrom3[row][column] - record.stressAseEvPerAngstrom3[column][row]) <= Number.EPSILON, `${model} prediction ${index} stress is not symmetric`);
    return record;
  });
  requireValue(new Set(records.map((record) => record.id)).size === 10, `${model} prediction IDs are duplicated`);
  return records;
}

async function readBoundedRegularFile(filename, maximumBytes, label) {
  const absolute = path.resolve(filename);
  requireValue(absolute === filename && await realpath(absolute) === absolute, `${label} path is not canonical`);
  const beforePath = await lstat(absolute, { bigint: true });
  requireValue(beforePath.isFile() && !beforePath.isSymbolicLink() && beforePath.nlink === 1n && beforePath.size > 0n && beforePath.size <= BigInt(maximumBytes), `${label} is not one bounded regular file`);
  const handle = await open(absolute, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const before = await handle.stat({ bigint: true });
    requireValue(before.dev === beforePath.dev && before.ino === beforePath.ino && before.size === beforePath.size, `${label} changed before read`);
    const bytes = await handle.readFile();
    requireValue(BigInt(bytes.length) === before.size, `${label} changed during read`);
    const after = await handle.stat({ bigint: true });
    const afterPath = await lstat(absolute, { bigint: true });
    for (const field of ['dev', 'ino', 'size', 'mode', 'mtimeNs', 'ctimeNs']) requireValue(before[field] === after[field] && after[field] === afterPath[field], `${label} changed during read`);
    return bytes;
  } finally { await handle.close(); }
}

async function writeExclusive(filename, bytes) {
  const handle = await open(filename, fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | fsConstants.O_NOFOLLOW, 0o600);
  try { await handle.writeFile(bytes); await handle.sync(); } finally { await handle.close(); }
}

export async function extractZipWithSafeHelper(archivePath, outputDirectory, options = {}) {
  const root = path.resolve(options.repositoryRoot ?? repositoryRoot);
  const helper = path.join(root, 'scripts/safe_extract_zip.py');
  const helperBytes = await readBoundedRegularFile(await realpath(helper), 100_000, 'safe ZIP extractor');
  requireValue(sha256(helperBytes) === 'sha256:e6b1a46b1ba471c888402cd75987819b18097d0bc6d2f87f5d1469f3d6a7caa0', 'safe ZIP extractor digest differs');
  try {
    await execFileAsync('python3', ['-B', helper, '--archive', archivePath, '--output', outputDirectory], {
      cwd: root, env: { PATH: process.env.PATH, LC_ALL: 'C', PYTHONDONTWRITEBYTECODE: '1' }, timeout: 60_000, maxBuffer: 65_536,
    });
  } catch (error) { fail(`safe ZIP extraction failed: ${error instanceof Error ? error.message : String(error)}`); }
}

export async function scanExtractedFiles(root, allowedPaths, label) {
  const canonicalRoot = await realpath(root);
  requireValue(canonicalRoot === path.resolve(root), `${label} extraction root is not canonical`);
  const allowed = new Set(allowedPaths); const files = []; const bytesByPath = new Map();
  const stack = [{ directory: canonicalRoot, prefix: '' }];
  while (stack.length > 0) {
    const { directory, prefix } = stack.pop();
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const relative = prefix ? `${prefix}/${entry.name}` : entry.name;
      const folded = relative.toLowerCase();
      requireValue(!/[\u0000-\u001f\u007f\\]/.test(relative) && /^[\x20-\x7e]+$/.test(relative) && path.posix.normalize(relative) === relative, `${label} extracted an unsafe path`);
      requireValue([...files].every((file) => file.path.toLowerCase() !== folded), `${label} extracted a case-folding collision`);
      const absolute = path.join(canonicalRoot, ...relative.split('/'));
      const metadata = await lstat(absolute, { bigint: true });
      requireValue(!metadata.isSymbolicLink() && await realpath(absolute) === absolute, `${label} extracted a link or noncanonical entry`);
      if (metadata.isDirectory()) { stack.push({ directory: absolute, prefix: relative }); continue; }
      requireValue(metadata.isFile() && metadata.nlink === 1n && allowed.has(relative) && metadata.size > 0n && metadata.size <= 16_777_216n, `${label} extracted an unknown, linked, empty, or oversized file ${relative}`);
      const bytes = await readBoundedRegularFile(absolute, 16_777_216, `${label}/${relative}`);
      bytesByPath.set(relative, bytes);
      files.push({ path: relative, sizeBytes: bytes.length, sha256: sha256(bytes) });
    }
  }
  files.sort((left, right) => left.path < right.path ? -1 : left.path > right.path ? 1 : 0);
  requireValue(canonicalJson(files.map((file) => file.path)) === canonicalJson([...allowedPaths].sort()), `${label} extracted file allowlist differs`);
  return { files, bytesByPath, expandedBytes: files.reduce((sum, file) => sum + file.sizeBytes, 0) };
}

function parseJsonEvidence(bytes, label) {
  const value = parseJsonRejectDuplicateKeys(bytes, label);
  assertNonPromotionalTree(value, label);
  return value;
}

export async function verifyExactArtifactContracts(bundle, model, options = {}) {
  const root = path.resolve(options.repositoryRoot ?? repositoryRoot);
  const readRoot = (relative, maximum = 5_000_000) => readBoundedRegularFile(path.join(root, relative), maximum, relative);
  const [scientificPlanBytes, dockerfileBytes, dockerignoreBytes, runModelBytes, runtimeContractBytes] = await Promise.all([
    readRoot('evaluation/atomistic/reproduction-plan.json'), readRoot(`atomistic/containers/${model}.Dockerfile`), readRoot('.dockerignore'),
    readRoot('scripts/atomistic/v2/run_model.py'), readRoot('scripts/atomistic/v2/runtime_contract.py'),
  ]);
  requireValue(sha256(scientificPlanBytes) === EXPECTED_PLAN_DIGEST, 'current scientific plan differs from S');
  const get = (name) => { const bytes = bundle.bytesByPath.get(name); requireValue(bytes, `${model} bundle omits ${name}`); return bytes; };
  const runtime = buildRuntimeInputManifest({
    model, scientificPlanBytes, wheelhouseManifestBytes: get(`manifests/${model}.wheelhouse.manifest.json`),
    dockerfileBytes, dockerignoreBytes, dependencyLockBytes: get(`locks/${model}.requirements.lock`), runModelBytes, runtimeContractBytes,
    runtimeSourceRevision: EXPECTED_RUNTIME_SOURCE_REVISION, sourceDateEpoch: EXPECTED_SOURCE_DATE_EPOCH,
  });
  requireValue(runtime.bytes.equals(get(`manifests/${model}.runtime-inputs.json`)), `${model} runtime-input manifest failed exact reconstruction`);
  requireValue(runtime.runnerDigest === EXPECTED_RUNNER_DIGEST, `${model} runner digest differs`);
  const observation = buildContainerObservation({
    model, runtimeSourceRevision: EXPECTED_RUNTIME_SOURCE_REVISION, workflowRevision: EXPECTED_SOURCE_REVISION, sourceDateEpoch: EXPECTED_SOURCE_DATE_EPOCH,
    runtimeInputManifestBytes: get(`manifests/${model}.runtime-inputs.json`),
    buildxMetadataBytes: get(`diagnostics/${model}.buildx-metadata.json`), imageInspectBytes: get(`diagnostics/${model}.image-inspect.json`),
    buildxVersionBytes: get(`diagnostics/${model}.buildx-version.txt`), dockerServerVersionBytes: get(`diagnostics/${model}.docker-server-version.txt`),
  });
  requireValue(observation.bytes.equals(get(`manifests/${model}.container-observation.json`)), `${model} container observation failed exact reconstruction`);
  return { runtime, observation };
}

export function validateBundleContent(bundle, model, runId) {
  const get = (name) => { const bytes = bundle.bytesByPath.get(name); requireValue(bytes, `${model} bundle omits ${name}`); return bytes; };
  const jsonPaths = [...bundle.bytesByPath.keys()].filter((name) => name.endsWith('.json'));
  const json = new Map(jsonPaths.map((name) => [name, parseJsonEvidence(get(name), `${runId}/${model}/${name}`)]));
  const predictions = parseAndValidatePredictions(get('predictions/predictions.jsonl'), model);
  const outcome = json.get('manifests/bootstrap-outcome.json');
  requireValue(outcome.schemaVersion === 'tf.atomistic-bootstrap-outcome/0.1' && outcome.model === model && outcome.commitSha === EXPECTED_SOURCE_REVISION && outcome.runId === runId && outcome.runAttempt === 1 && outcome.status === 'success' && outcome.inferenceSucceeded === true && outcome.predictionsPresent === true && outcome.failureStage === null && outcome.evidenceClass === 'bootstrap-not-reproduced', `${runId}/${model} bootstrap outcome differs`);
  requireValue(canonicalJson(outcome.publishedFiles) === canonicalJson(artifactAllowlist(model)), `${runId}/${model} bootstrap outcome allowlist differs`);
  requireValue(Array.isArray(outcome.stages) && outcome.stages.length === 12 && outcome.stages.every((stage) => stage.outcome === 'success'), `${runId}/${model} bootstrap stages differ`);
  const summary = json.get('manifests/run-summary.json');
  requireValue(summary.schemaVersion === 'tf.atomistic-run-summary/0.3' && summary.mode === 'smoke' && summary.status === 'PREDICTIONS_ONLY_NOT_REPRODUCED' && summary.modelId === MODEL_IDS[model] && summary.workflowRevision === EXPECTED_SOURCE_REVISION && summary.runtimeSourceRevision === EXPECTED_RUNTIME_SOURCE_REVISION && summary.evidenceClass === 'bootstrap-not-reproduced', `${runId}/${model} run summary identity differs`);
  requireValue(summary.counts?.predictionRecords === 10 && summary.counts?.expectedRecords === 10 && summary.counts?.atomsPerFrame === 16 && summary.counts?.structureFrames === 693 && summary.counts?.structureAtoms === 11_088 && summary.counts?.structureElements === 89, `${runId}/${model} run summary counts differ`);
  requireValue(summary.files?.predictions?.sha256 === sha256(get('predictions/predictions.jsonl')) && summary.files.predictions.records === 10 && summary.files.predictions.schemaVersion === 'tf.atomistic-prediction/0.3', `${runId}/${model} prediction file binding differs`);
  requireValue(summary.files?.diagnostics?.sha256 === sha256(get('diagnostics/run-diagnostics.json')), `${runId}/${model} diagnostics file binding differs`);
  requireValue(summary.structureIntegrity?.structureManifestSha256 === EXPECTED_STRUCTURE_MANIFEST_ROOT && summary.structureIntegrity?.selectedRecords === 10, `${runId}/${model} structure integrity differs`);
  requireValue(summary.actualExecution?.batchSize === 1 && summary.actualExecution?.threads === 1 && summary.actualExecution?.dtype === 'float32' && summary.actualExecution?.device === 'cpu', `${runId}/${model} execution settings differ`);
  const runtimeInput = json.get(`manifests/${model}.runtime-inputs.json`);
  requireValue(runtimeInput.runtimeSource?.runtimeSourceRevision === EXPECTED_RUNTIME_SOURCE_REVISION && runtimeInput.runtimeSource?.materializationDigest === EXPECTED_MATERIALIZATION_DIGEST && runtimeInput.buildInputs?.runner?.digest === EXPECTED_RUNNER_DIGEST && runtimeInput.scientificPlan?.rawDigest === EXPECTED_PLAN_DIGEST, `${runId}/${model} stable runtime roots differ`);
  const structuresBytes = get('manifests/structures.manifest.json'); const structures = json.get('manifests/structures.manifest.json');
  requireValue(sha256(structuresBytes) === EXPECTED_STRUCTURE_MANIFEST_FILE_DIGEST && structures.structureManifestSha256 === EXPECTED_STRUCTURE_MANIFEST_ROOT && canonicalJson(structures.smoke?.ids) === canonicalJson(SMOKE_IDS), `${runId}/${model} structure manifest differs`);
  const diagnostics = json.get('diagnostics/run-diagnostics.json');
  requireValue(diagnostics.schemaVersion === 'tf.atomistic-run-diagnostic/0.3' && diagnostics.modelId === MODEL_IDS[model] && diagnostics.status === 'PREDICTIONS_ONLY_NOT_REPRODUCED' && diagnostics.workflowRevision === EXPECTED_SOURCE_REVISION && diagnostics.runtimeSourceRevision === EXPECTED_RUNTIME_SOURCE_REVISION && diagnostics.predictionObjectsContainReferenceLabels === false, `${runId}/${model} diagnostics identity differs`);
  requireValue(predictions.every((record) => record.environmentSha256 === summary.environment?.environmentSha256), `${runId}/${model} prediction environment binding differs`);
  const observation = json.get(`manifests/${model}.container-observation.json`);
  requireValue(observation.stableInputReference?.runtimeInputManifestDigest === sha256(get(`manifests/${model}.runtime-inputs.json`)) && observation.runSpecificObservations?.configImageId?.digest === summary.environment?.containerIdentity?.configImageId, `${runId}/${model} container observation binding differs`);
  if (model === 'mace') {
    const derived = get('manifests/python-hostlist.derived-wheel.manifest.json');
    requireValue(runtimeInput.buildInputs?.wheelhouse?.derivedWheelProvenance?.manifestDigest === sha256(derived), `${runId}/${model} derived wheel provenance differs`);
  }
  return { predictions, json, summary, diagnostics, runtimeInput, observation };
}

export function expectedLogAllowlist(runId) {
  requireValue(EXPECTED_RUN_IDS.includes(runId), 'log allowlist run is not frozen');
  const mainLogs = runId === EXPECTED_RUN_IDS[0]
    ? ['0_mace isolated bootstrap smoke.txt', '1_mattersim isolated bootstrap smoke.txt']
    : ['0_mattersim isolated bootstrap smoke.txt', '1_mace isolated bootstrap smoke.txt'];
  return [
    ...mainLogs,
    'mace isolated bootstrap smoke/system.txt',
    'mattersim isolated bootstrap smoke/system.txt',
  ];
}

export function validateArtifactPublicationSnapshot(initial, reread, runId, publicationNow) {
  validateArtifacts(initial, runId, publicationNow);
  validateArtifacts(reread, runId, publicationNow);
  requireValue(canonicalJson(reread) === canonicalJson(initial), `run ${runId} artifact metadata changed before receipt publication`);
}

export function verifyPerJobLogBindings(logBundle, runId, artifacts) {
  const result = {};
  for (const model of MODELS) {
    const name = logBundle.files.find((file) => new RegExp(`^[0-9]+_${model} isolated bootstrap smoke\\.txt$`).test(file.path));
    requireValue(name, `run ${runId} omits the ${model} job log`);
    const bytes = logBundle.bytesByPath.get(name.path);
    let text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail(`run ${runId} ${model} job log is not strict UTF-8`); }
    verifyLogBindings(text, runId, { [model]: artifacts[model] });
    result[model] = { path: name.path, digest: name.sha256 };
  }
  return result;
}

const REVIEWED_STAGES = Object.freeze({
  guard: 'success', directories: 'success', bind: 'success', 'base-images': 'success', assets: 'success', preprocess: 'success',
  wheelhouse: 'success', resolve: 'success', freeze: 'success', 'cold-install': 'success', build: 'success', inference: 'success', publish: 'success',
});

function verifierContext(environment) {
  const context = {
    repository: environment.GITHUB_REPOSITORY,
    repositoryId: parsePositiveInteger(environment.GITHUB_REPOSITORY_ID, 'GITHUB_REPOSITORY_ID'),
    revision: environment.GITHUB_SHA,
    runId: parsePositiveInteger(environment.GITHUB_RUN_ID, 'GITHUB_RUN_ID'),
    runAttempt: parsePositiveInteger(environment.GITHUB_RUN_ATTEMPT, 'GITHUB_RUN_ATTEMPT'),
    event: environment.GITHUB_EVENT_NAME,
    ref: environment.GITHUB_REF,
    workflowRef: environment.GITHUB_WORKFLOW_REF,
    workflowName: environment.GITHUB_WORKFLOW,
  };
  requireValue(context.repository === EXPECTED_REPOSITORY && context.repositoryId === EXPECTED_REPOSITORY_ID, 'verifier repository context differs');
  requireValue(REVISION.test(context.revision) && ![EXPECTED_SOURCE_REVISION, EXPECTED_RUNTIME_SOURCE_REVISION].includes(context.revision), 'verifier revision must be a distinct 40-hex Commit V');
  requireValue(context.runAttempt === 1 && context.event === 'workflow_dispatch' && context.ref === 'refs/heads/main', 'verifier must be first-attempt protected-main workflow_dispatch');
  requireValue(context.workflowRef === `${EXPECTED_REPOSITORY}/${EXPECTED_VERIFIER_WORKFLOW_PATH}@refs/heads/main`, 'verifier workflow ref differs');
  requireValue(context.workflowName === 'Atomistic bootstrap replica verifier (non-promotional)', 'verifier workflow name differs');
  return context;
}

async function materializeZip(bytes, temporary, name, allowedPaths, options) {
  const archive = path.join(temporary, `${name}.zip`); const output = path.join(temporary, `${name}-extracted`);
  await writeExclusive(archive, bytes); await mkdir(output, { mode: 0o700 });
  const inspect = options.inspectZip ?? inspectZipCentralDirectory;
  inspect(bytes, { allowedPaths, requireMode: options.requireMode, maxArchiveBytes: options.maxArchiveBytes ?? 10_000_000, maxExpandedBytes: 50_000_000 });
  const extract = options.extractArchive ?? extractZipWithSafeHelper;
  await extract(archive, output, { repositoryRoot: options.repositoryRoot ?? repositoryRoot });
  return scanExtractedFiles(output, allowedPaths, name);
}

function criticalFiles(bundle, model) {
  const digest = (name) => bundle.files.find((file) => file.path === name)?.sha256;
  return {
    runtimeInput: digest(`manifests/${model}.runtime-inputs.json`), dependencyLock: digest(`locks/${model}.requirements.lock`),
    wheelhouse: digest(`manifests/${model}.wheelhouse.manifest.json`), structureManifest: digest('manifests/structures.manifest.json'),
    predictions: digest('predictions/predictions.jsonl'), runSummary: digest('manifests/run-summary.json'),
    containerObservation: digest(`manifests/${model}.container-observation.json`),
  };
}

function receiptRun(run) {
  return { id: run.id, attempt: run.run_attempt, event: run.event, ref: `refs/heads/${run.head_branch}`, headSha: run.head_sha, status: run.status, conclusion: run.conclusion, createdAt: run.created_at, startedAt: run.run_started_at, updatedAt: run.updated_at };
}

function receiptJob(job, model) {
  return { model, id: job.id, name: job.name, status: job.status, conclusion: job.conclusion, runnerLabel: job.labels[0], startedAt: job.started_at, completedAt: job.completed_at, reviewedStages: { ...REVIEWED_STAGES } };
}

function receiptArtifact(artifact, runId, model, job, logBinding, bundle) {
  return {
    model, id: artifact.id, name: artifact.name, sizeBytes: artifact.size_in_bytes, apiDigest: artifact.digest, downloadDigest: artifact.digest,
    createdAt: artifact.created_at, updatedAt: artifact.updated_at, expiresAt: artifact.expires_at, expired: false,
    workflowRun: { id: runId, repositoryId: EXPECTED_REPOSITORY_ID, headRepositoryId: EXPECTED_REPOSITORY_ID, headBranch: 'main', headSha: EXPECTED_SOURCE_REVISION },
    uploadBinding: { jobId: job.id, jobName: job.name, publishStep: 'Upload the allowlisted bootstrap bundle', conclusion: 'success', jobLogFileDigest: logBinding.digest },
    bundle: {
      fileCount: bundle.files.length, expandedBytes: bundle.expandedBytes, files: bundle.files,
      filesCommitment: bootstrapReplicaEvidenceFilesCommitment(`tf.atomistic-bootstrap-bundle-files/${runId}/${model}/v1`, bundle.files),
      criticalFiles: criticalFiles(bundle, model),
      contentAudit: { metricsPresent: false, referenceLabelsPresent: false, receiptPresent: false, attestationPresent: false, predictionsOnly: true },
    },
  };
}

export async function verifyBootstrapReplicas(options = {}) {
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  requireValue(Number.isFinite(now.getTime()), 'verification clock is invalid');
  const environment = options.environment ?? process.env;
  const context = options.context ?? verifierContext(environment);
  const runIds = options.runIds ?? EXPECTED_RUN_IDS;
  requireValue(canonicalJson(runIds) === canonicalJson(EXPECTED_RUN_IDS) && new Set(runIds).size === 2, 'only the two frozen source runs in ascending order are accepted');
  const transport = options.transport ?? createGitHubTransport({ token: environment.GITHUB_TOKEN, fetchImpl: options.fetchImpl, apiBase: environment.GITHUB_API_URL ?? 'https://api.github.com' });
  const root = path.resolve(options.repositoryRoot ?? repositoryRoot);
  const [repo, bootstrapWorkflow, verifierWorkflow, verifierBytes] = await Promise.all([
    transport.json(`/repos/${EXPECTED_REPOSITORY}`),
    transport.json(`/repos/${EXPECTED_REPOSITORY}/actions/workflows/${EXPECTED_BOOTSTRAP_WORKFLOW_ID}`),
    options.verifierWorkflowMetadata ?? transport.json(`/repos/${EXPECTED_REPOSITORY}/actions/workflows/atomistic-bootstrap-verify.yml`),
    readBoundedRegularFile(await realpath(modulePath), 2_000_000, 'verifier implementation'),
  ]);
  requireValue(repo?.id === EXPECTED_REPOSITORY_ID && repo?.full_name === EXPECTED_REPOSITORY, 'repository API identity differs');
  requireValue(bootstrapWorkflow?.id === EXPECTED_BOOTSTRAP_WORKFLOW_ID && bootstrapWorkflow?.path === EXPECTED_BOOTSTRAP_WORKFLOW_PATH && bootstrapWorkflow?.name === 'Atomistic bootstrap predictions (non-promotional)' && bootstrapWorkflow?.state === 'active', 'bootstrap workflow API identity differs');
  requireValue(Number.isSafeInteger(verifierWorkflow?.id) && verifierWorkflow.id > 0 && verifierWorkflow.path === EXPECTED_VERIFIER_WORKFLOW_PATH && verifierWorkflow.name === 'Atomistic bootstrap replica verifier (non-promotional)' && verifierWorkflow.state === 'active', 'verifier workflow API identity differs');
  const verifierScriptDigest = sha256(verifierBytes);
  const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'tailing-bootstrap-replica-verifier-')));
  const replicas = []; const bundlesByRun = new Map(); const artifactPayloads = new Map();
  try {
    for (const [ordinalIndex, runId] of runIds.entries()) {
      const expected = EXPECTED_EVIDENCE[runId];
      const [run, jobsPayload, artifactsPayload, logBytes] = await Promise.all([
        transport.json(`/repos/${EXPECTED_REPOSITORY}/actions/runs/${runId}`),
        transport.json(`/repos/${EXPECTED_REPOSITORY}/actions/runs/${runId}/jobs?filter=all&per_page=100`),
        transport.json(`/repos/${EXPECTED_REPOSITORY}/actions/runs/${runId}/artifacts?per_page=100`),
        transport.download(`/repos/${EXPECTED_REPOSITORY}/actions/runs/${runId}/attempts/1/logs`, 2_000_000),
      ]);
      validateRunMetadata(run, runId); const jobs = validateJobs(jobsPayload, runId); const artifacts = validateArtifacts(artifactsPayload, runId, now);
      artifactPayloads.set(runId, artifactsPayload);
      requireValue(logBytes.length === expected.log.sizeBytes && sha256(logBytes) === expected.log.digest, `run ${runId} log archive bytes differ`);
      const logBundle = await materializeZip(logBytes, temporary, `run-${runId}-logs`, expectedLogAllowlist(runId), { ...options, requireMode: undefined });
      const logBindings = verifyPerJobLogBindings(logBundle, runId, artifacts);
      const modelBundles = {};
      for (const model of MODELS) {
        const artifact = artifacts[model];
        const archiveBytes = await transport.download(artifact.archive_download_url, 2_000_000);
        requireValue(archiveBytes.length === artifact.size_in_bytes && sha256(archiveBytes) === artifact.digest, `run ${runId} ${model} downloaded archive differs from API bytes`);
        const bundle = await materializeZip(archiveBytes, temporary, `run-${runId}-${model}`, artifactAllowlist(model), { ...options, requireMode: 0o100444 });
        bundle.content = validateBundleContent(bundle, model, runId);
        const contractVerifier = options.contractVerifier ?? verifyExactArtifactContracts;
        await contractVerifier(bundle, model, { repositoryRoot: root });
        modelBundles[model] = bundle;
      }
      requireValue(modelBundles.mattersim.bytesByPath.get('manifests/structures.manifest.json').equals(modelBundles.mace.bytesByPath.get('manifests/structures.manifest.json')), `run ${runId} model structure manifests differ`);
      bundlesByRun.set(runId, modelBundles);
      replicas.push({
        ordinal: ordinalIndex + 1, run: receiptRun(run),
        runLog: { downloadDigest: sha256(logBytes), sizeBytes: logBytes.length, fileCount: logBundle.files.length, files: logBundle.files, filesCommitment: bootstrapReplicaEvidenceFilesCommitment(`tf.github-actions-run-log-files/${runId}/v1`, logBundle.files) },
        jobs: MODELS.map((model) => receiptJob(jobs[model], model)),
        artifacts: MODELS.map((model) => receiptArtifact(artifacts[model], runId, model, jobs[model], logBindings[model], modelBundles[model])),
      });
    }
    const stablePaths = (model) => [
      `locks/${model}.requirements.lock`, `manifests/${model}.runtime-inputs.json`,
      `manifests/${model}.wheelhouse.manifest.json`, 'manifests/pytorch-download-sources.json', 'manifests/structures.manifest.json',
      ...(model === 'mace' ? ['manifests/python-hostlist.derived-wheel.manifest.json'] : []),
    ];
    for (const model of MODELS) for (const filename of stablePaths(model)) requireValue(bundlesByRun.get(runIds[0])[model].bytesByPath.get(filename).equals(bundlesByRun.get(runIds[1])[model].bytesByPath.get(filename)), `${model} stable input ${filename} differs across replicas`);
    const publicationSnapshots = new Map();
    for (const runId of runIds) {
      publicationSnapshots.set(runId, await transport.json(`/repos/${EXPECTED_REPOSITORY}/actions/runs/${runId}/artifacts?per_page=100`));
    }
    const publicationNow = options.publicationNow instanceof Date ? options.publicationNow : new Date(options.publicationNow ?? (options.now === undefined ? Date.now() : now.getTime()));
    requireValue(Number.isFinite(publicationNow.getTime()) && publicationNow.getTime() >= now.getTime(), 'publication clock is invalid or moved backwards');
    for (const runId of runIds) validateArtifactPublicationSnapshot(artifactPayloads.get(runId), publicationSnapshots.get(runId), runId, publicationNow);
    const numericalModels = MODELS.map((model) => {
      const maxima = comparePredictionReplicas(bundlesByRun.get(runIds[0])[model].content.predictions, bundlesByRun.get(runIds[1])[model].content.predictions, model);
      return { model, recordsCompared: 10, physicalValuesByteIdentical: Object.values(maxima).every((value) => value === 0), withinFrozenTolerance: true, maximumDifferences: { energyEv: maxima.energyMaxEv, forceVectorEvPerAngstrom: maxima.forceVectorMaxEvPerAngstrom, stressFrobeniusEvPerAngstrom3: maxima.stressFrobeniusMaxEvPerAngstrom3 } };
    });
    const firstBundles = bundlesByRun.get(runIds[0]);
    const firstRuntimeInputs = Object.fromEntries(MODELS.map((model) => [model, firstBundles[model].content.runtimeInput]));
    const lockBytes = await readBoundedRegularFile(await realpath(path.join(root, 'evaluation/atomistic/runtime-lock.json')), 1_000_000, 'runtime discovery lock');
    const lock = parseJsonEvidence(lockBytes, 'runtime discovery lock');
    requireValue(lock.schemaVersion === 'tf.atomistic-runtime-lock/0.2' && lock.state === 'discovery-not-frozen' && lock.runtimeSource?.runtimeSourceRevision === EXPECTED_RUNTIME_SOURCE_REVISION, 'runtime discovery lock identity differs');
    const actualSourceManifestDigest = sha256(Buffer.from(canonicalJson(lock.runtimeSource.files), 'utf8'));
    const stableInputs = {
      agreementProtocol: 'two-distinct-protected-main-runs-byte-identical-stable-input-roots/v1', byteIdenticalAcrossReplicas: true,
      sourceRevision: firstRuntimeInputs.mattersim.runtimeSource.runtimeSourceRevision,
      sourceManifestDigest: actualSourceManifestDigest,
      materializationDigest: firstRuntimeInputs.mattersim.runtimeSource.materializationDigest,
      runnerDigest: firstRuntimeInputs.mattersim.buildInputs.runner.digest,
      scientificPlanDigest: firstRuntimeInputs.mattersim.scientificPlan.rawDigest,
      structureManifestFileDigest: sha256(firstBundles.mattersim.bytesByPath.get('manifests/structures.manifest.json')),
      models: MODELS.map((model) => ({
        model,
        runtimeInputDigest: sha256(firstBundles[model].bytesByPath.get(`manifests/${model}.runtime-inputs.json`)),
        dependencyLockDigest: sha256(firstBundles[model].bytesByPath.get(`locks/${model}.requirements.lock`)),
        wheelhouseManifestDigest: sha256(firstBundles[model].bytesByPath.get(`manifests/${model}.wheelhouse.manifest.json`)),
        dependencyGraphDigest: firstRuntimeInputs[model].buildInputs.wheelhouse.dependencyGraphDigest,
        installedPathDigest: firstRuntimeInputs[model].buildInputs.wheelhouse.installedPathDigest,
        runtimeInstalledPathDigest: firstRuntimeInputs[model].buildInputs.wheelhouse.runtimeInstalledPathDigest,
      })),
    };
    requireValue(canonicalJson(stableInputs) === canonicalJson(EXPECTED_STABLE_INPUTS), 'observed stable inputs differ from the frozen bootstrap replica contract');
    stableInputs.commitment = computeBootstrapStableInputsCommitment(stableInputs);
    const observedRunSpecific = runIds.map((runId) => ({
      runId,
      models: MODELS.map((model) => {
        const bundle = bundlesByRun.get(runId)[model]; const { summary, diagnostics, observation, predictions } = bundle.content;
        const predictionDigest = sha256(bundle.bytesByPath.get('predictions/predictions.jsonl'));
        const timingDigest = sha256(bundle.bytesByPath.get('diagnostics/run-diagnostics.json'));
        const configImageId = observation.runSpecificObservations.configImageId.digest;
        requireValue(summary.runId === diagnostics.runId && typeof summary.generatedAt === 'string', `${runId}/${model} runtime UUID or generatedAt differs across evidence`);
        requireValue(summary.environment.containerIdentity.configImageId === configImageId, `${runId}/${model} container ID differs across evidence`);
        requireValue(predictions.every((prediction) => prediction.environmentSha256 === summary.environment.environmentSha256), `${runId}/${model} environment digest differs across predictions`);
        return { model, dockerLocalConfigImageId: configImageId, runtimeUuid: summary.runId, generatedAt: summary.generatedAt, timingDigest, environmentDigest: summary.environment.environmentSha256, predictionDigest };
      }),
    }));
    requireValue(canonicalJson(observedRunSpecific) === canonicalJson(EXPECTED_RUN_SPECIFIC_OBSERVATIONS), 'observed run-specific evidence differs from the frozen audit');
    const receipt = {
      schemaVersion: BOOTSTRAP_REPLICA_RECEIPT_SCHEMA_VERSION, profile: 'bootstrap-two-replica', status: 'verified-stable-input-agreement', createdAt: publicationNow.toISOString(),
      repository: { ...EXPECTED_RECEIPT_REPOSITORY }, bootstrapWorkflow: { ...EXPECTED_BOOTSTRAP_WORKFLOW },
      verifier: { workflow: { id: verifierWorkflow.id, path: EXPECTED_VERIFIER_WORKFLOW_PATH, revision: context.revision, runId: context.runId, runAttempt: context.runAttempt, event: context.event, ref: context.ref }, implementation: { path: 'scripts/atomistic/verify-bootstrap-replicas.mjs', sha256: verifierScriptDigest } },
      replicas, stableInputs,
      numericalConsistency: { protocol: EXPECTED_NUMERICAL_CONSISTENCY.protocol, toleranceSourcePlanDigest: EXPECTED_PLAN_DIGEST, tolerances: structuredClone(EXPECTED_NUMERICAL_CONSISTENCY.tolerances), models: numericalModels },
      candidateBundle: { profile: 'bootstrap-predictions-only', exactAllowlistRequired: true, metricsPresent: false, referenceLabelsPresent: false, receiptPresent: false, attestationPresent: false },
      verification: structuredClone(EXPECTED_BOOTSTRAP_VERIFICATION),
      runSpecificObservations: { semantics: 'run-specific-observations-not-promotion-trust-roots/v1', excludedFromStableInputs: ['dockerLocalConfigImageId', 'runtimeUuid', 'generatedAt', 'timingDigest', 'environmentDigest', 'predictionDigest'], replicas: observedRunSpecific },
      claims: { evidenceClass: 'bootstrap-replica-verified-not-reproduced', promotionEligible: false, promotionTrustRoot: false, comparable: false, reproduced: false },
    };
    requireValue(canonicalJson(receipt.numericalConsistency) === canonicalJson(EXPECTED_NUMERICAL_CONSISTENCY), 'measured numerical consistency differs from the frozen observed values');
    const validationOptions = { now: publicationNow, expectedVerifierRevision: context.revision, expectedVerifierRunId: context.runId, expectedVerifierRunAttempt: context.runAttempt, expectedVerifierScriptDigest: verifierScriptDigest, expectedVerifierWorkflowId: verifierWorkflow.id, requireArtifactsLiveAtValidation: true };
    const validation = (options.receiptValidator ?? validateBootstrapReplicaReceipt)(receipt, validationOptions);
    requireValue(validation?.ok === true, `receipt policy rejected verifier output: ${(validation?.errors ?? ['unknown error']).join('; ')}`);
    return { receipt, bytes: (options.receiptSerializer ?? canonicalBootstrapReplicaReceiptBytes)(receipt), verifierScriptDigest, verifierWorkflowId: verifierWorkflow.id };
  } finally {
    if (options.keepTemporary !== true) await rm(temporary, { recursive: true, force: false });
  }
}

function parseCli(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index]; const value = argv[index + 1];
    requireValue(['--run-id-1', '--run-id-2', '--output'].includes(flag) && value !== undefined && options[flag] === undefined, 'usage: verify-bootstrap-replicas.mjs --run-id-1 ID --run-id-2 ID --output ABSOLUTE.json');
    options[flag] = value;
  }
  requireValue(Object.keys(options).length === 3, 'usage: verify-bootstrap-replicas.mjs --run-id-1 ID --run-id-2 ID --output ABSOLUTE.json');
  const runIds = [parsePositiveInteger(options['--run-id-1'], '--run-id-1'), parsePositiveInteger(options['--run-id-2'], '--run-id-2')];
  const output = options['--output'];
  requireValue(path.isAbsolute(output) && path.resolve(output) === output && path.extname(output) === '.json', '--output must be one normalized absolute JSON path');
  return { runIds, output };
}

async function writeReceiptOutput(output, bytes) {
  const parent = path.dirname(output);
  requireValue(await realpath(parent) === parent, 'receipt output parent is not canonical');
  const parentMetadata = await lstat(parent, { bigint: true });
  requireValue(parentMetadata.isDirectory() && !parentMetadata.isSymbolicLink(), 'receipt output parent is not a real directory');
  await writeExclusive(output, bytes); await chmod(output, 0o444);
  const reread = await readBoundedRegularFile(output, 1_048_576, 'receipt output');
  requireValue(reread.equals(bytes), 'receipt output changed after write');
}

export async function runCli(argv = process.argv.slice(2), environment = process.env) {
  const { runIds, output } = parseCli(argv);
  const result = await verifyBootstrapReplicas({ runIds, environment });
  await writeReceiptOutput(output, result.bytes);
  process.stdout.write(canonicalJsonBytes({ receiptPath: output, receiptDigest: sha256(result.bytes), sizeBytes: result.bytes.length }));
  return result;
}

if (process.argv[1] && pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url) {
  runCli().catch((error) => { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; });
}
