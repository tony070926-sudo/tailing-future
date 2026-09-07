#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
} from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { parseJsonRejectDuplicateKeys } from '../atomistic/runtime-input-contract.mjs';

export const ADMISSION_LEDGER_PATH = 'evaluation/backend-migration/r18a-origin-main-admission-v0.1.json';
export const ADMISSION_SCHEMA_PATH = 'schemas/backend-migration-admission-v0.1.schema.json';
export const EXPECTED_ADMISSION_SCHEMA_RAW_DIGEST = 'sha256:6690812bec7ca8421460a2bd9b26c9eccf83cc98e6f4ff842c96f49e254f58fc';
export const EXPECTED_ADMISSION_LEDGER_RAW_DIGEST = 'sha256:8468e45d34780f4d8118ed4b470c6764fd69e771ad2de3a95e2fe2faecb067a7';

const LEGACY_COMMIT = '643b8b15f1a796c0ca4c34657d4b5edc68389354';
const MAIN_COMMIT = '307e6d723086fe41b6d89e9f9b4b532364ccaeff';
const LEGACY_INVENTORY_DIGEST = 'sha256:33d01f4018832e228e92a78c179ce75225aca37c6bff9c44cf389288ebd78463';
const MAIN_INVENTORY_DIGEST = 'sha256:9a7e966b67070e0b614cfa1f0c3e32af0ea8f14fe44946bcc806d3d5575fd8ed';
const MAIN_GITIGNORE_DIGEST = 'sha256:db60593548fb82833134148fefb780591e1e6dd8882b31cc0076d37572b0ca28';
const MAX_LEDGER_BYTES = 8 * 1024 * 1024;
const MAX_SCHEMA_BYTES = 1024 * 1024;
const MAX_SOURCE_FILE_BYTES = 128 * 1024 * 1024;
const MAX_SOURCE_FILES = 4096;
const TRUSTED_GIT = '/usr/bin/git';

export const R12_EXCLUDED_PATHS = Object.freeze([
  'evaluation/gas-kinetics/fixtures/hwang-so2-mechanism-catalog.json',
  'evaluation/reviews/2026-09-02-r12-defect-aware-gas-mechanism-catalog-review.md',
  'lib/knowledge/gas-mechanism-catalog.test.ts',
  'lib/knowledge/gas-mechanism-catalog.ts',
  'lib/knowledge/so2-gas-mechanism-catalog.ts',
  'schemas/gas-mechanism-catalog-query-result.schema.json',
  'schemas/gas-mechanism-catalog-query.schema.json',
  'schemas/gas-mechanism-catalog.schema.json',
  'scripts/gas-kinetics/mechanism-catalog-trust-roots.mjs',
]);

export const REQUIRED_CANDIDATE_PATHS = Object.freeze([
  'evaluation/backend-migration/r18a-origin-main-admission-v0.1.json',
  'schemas/backend-migration-admission-v0.1.schema.json',
  'scripts/backend-migration/verify-r18a-origin-main-admission.mjs',
  'scripts/backend-migration/verify-r18a-origin-main-admission.test.mjs',
]);

export const REQUIRED_REVIEW_INPUTS = Object.freeze([
  'evaluation/reviews/2026-09-07-backend-migration-admission-v0.1-preflight.json',
  'evaluation/reviews/2026-09-07-backend-migration-admission-v0.1-scope.md',
]);

export const ALLOWED_REVIEW_OUTPUTS = Object.freeze([
  'evaluation/reviews/2026-09-07-backend-migration-admission-v0.1-builder-gates.json',
  'evaluation/reviews/2026-09-07-backend-migration-admission-v0.1-final-review.json',
  'evaluation/reviews/2026-09-07-backend-migration-admission-v0.1-science-review.json',
  'evaluation/reviews/2026-09-07-backend-migration-admission-v0.1-software-review.json',
  'evaluation/reviews/2026-09-07-backend-migration-admission-v0.1-sota-review.json',
]);

export const REMAINING_BLOCKERS = Object.freeze([
  'Non-R12 legacy backend capabilities are inventoried but not integrated or scientifically revalidated at the origin/main root.',
  'Forty-five conflicting paths require explicit versioned reconciliation without overwriting newer origin/main bytes.',
  'R16d-b exact CPython 3.12.13 passed a private diagnostic but still requires reusable release-tree provisioning and integration.',
  'R17b requires a versioned project-private runtime successor; its frozen shared-stdlib evidence remains historical and unchanged.',
  'R18 historical node:test dispatch and the R18a root .gitignore identity conflict require additive integration treatment.',
  'PFHub Benchmark 7 requires an additive exact upstream notice and source-provenance binding before integration.',
  'R12 redistribution rights remain unresolved and its nine payload paths are excluded rather than licensed or passed.',
  'Candidate-independent reviews and all full integration, evaluator, release and deployment gates remain incomplete.',
]);

const EXPECTED_COUNTS = Object.freeze({
  union: 939,
  identical: 106,
  conflicting: 45,
  pendingLegacyOnly: 481,
  excludedR12LegacyOnly: 9,
  mainOnly: 298,
  scientificCapabilitiesAdmitted: 0,
});

const EXPECTED_CLAIM_BOUNDARY = Object.freeze({
  inventoryComplete: true,
  migrationComplete: false,
  rightsCleared: false,
  scientificallyValidated: false,
  releaseEligible: false,
  deploymentEligible: false,
  industrialAuthority: false,
  causalEffectIdentified: false,
});

const EXPECTED_HISTORICAL_IDENTITY = Object.freeze({
  candidateId: 'r18a-successor-v3',
  fileCount: 17,
  canonicalCandidateSetDigest: 'sha256:be645d99fb86ed8c9d278a9ea9c6884ccbed9a982b11b21987a408ada1ecf344',
  candidateManifestDigest: 'sha256:3d5fc28623f2a22e7ddfb5d98850953916576e117a9bf8d9b24d4ccc51f19067',
  integrationStatus: 'historical-only-not-reproduced-at-origin-main-root',
  transferredApproval: false,
  conflictingPath: '.gitignore',
});

const EXPECTED_ROOTS = Object.freeze({
  legacy: Object.freeze({
    role: 'preserved-legacy-working-tree',
    commit: LEGACY_COMMIT,
    dirtySourceIncluded: true,
    pathCount: 641,
    totalBytes: 59531074,
    identityDigest: LEGACY_INVENTORY_DIGEST,
  }),
  main: Object.freeze({
    role: 'origin-main-release-base',
    commit: MAIN_COMMIT,
    dirtySourceIncluded: false,
    pathCount: 449,
    totalBytes: 10891323,
    identityDigest: MAIN_INVENTORY_DIGEST,
  }),
});

const EXPECTED_RELATION_CONTRACTS = Object.freeze({
  identical: Object.freeze({
    disposition: 'copied-identical',
    migrationStatus: 'baseline-byte-identical',
    rightsStatus: 'not-evaluated',
    payloadPresent: true,
  }),
  conflicting: Object.freeze({
    disposition: 'main-preserved-conflict',
    migrationStatus: 'pending-versioned-reconciliation',
    rightsStatus: 'not-evaluated',
    payloadPresent: true,
  }),
  'legacy-only': Object.freeze({
    disposition: 'pending-not-admitted',
    migrationStatus: 'pending-integration',
    rightsStatus: 'not-evaluated',
    payloadPresent: false,
  }),
  'main-only': Object.freeze({
    disposition: 'main-only-preserved',
    migrationStatus: 'baseline-main-only',
    rightsStatus: 'not-evaluated',
    payloadPresent: true,
  }),
});

const GIT_ENVIRONMENT = Object.freeze({
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_LITERAL_PATHSPECS: '1',
  GIT_NO_REPLACE_OBJECTS: '1',
  LANG: 'C',
  LC_ALL: 'C',
  PATH: '/usr/bin:/bin',
});

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function sameValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function addMismatch(failures, label, observed, expected) {
  if (!sameValue(observed, expected)) failures.push(`${label}: expected ${JSON.stringify(expected)}, observed ${JSON.stringify(observed)}`);
}

function safePath(relativePath) {
  return typeof relativePath === 'string'
    && relativePath.length > 0
    && relativePath.length <= 512
    && !relativePath.startsWith('/')
    && !relativePath.includes('\\')
    && !relativePath.includes('\0')
    && !/[\u0000-\u001f\u007f]/u.test(relativePath)
    && relativePath.split('/').every((part) => part !== '' && part !== '.' && part !== '..');
}

function comparePaths(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function identityRecords(ledger, side) {
  const key = side === 'legacy' ? 'legacyIdentity' : 'mainIdentity';
  return (ledger.entries ?? [])
    .filter((entry) => entry?.[key] !== null && entry?.[key] !== undefined)
    .map((entry) => ({ path: entry.path, ...entry[key] }))
    .sort((left, right) => comparePaths(left.path, right.path));
}

function inventoryDigest(records) {
  return sha256(Buffer.from(JSON.stringify(records), 'utf8'));
}

export function validateAdmissionSchema(ledger, schema) {
  try {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const validate = ajv.compile(schema);
    return validate(ledger)
      ? []
      : (validate.errors ?? []).map((error) => `admission.schema${error.instancePath || '/'}: ${error.message}`);
  } catch (error) {
    return [`admission.schema: schema compilation failed (${error instanceof Error ? error.message : String(error)})`];
  }
}

export function validateAdmissionSemantics(ledger) {
  const failures = [];
  if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) return ['admission.semantic: root must be an object'];

  addMismatch(failures, 'admission.schemaVersion', ledger.schemaVersion, 'tf.backend-migration-admission/0.1');
  addMismatch(failures, 'admission.profileId', ledger.profileId, 'r18a-origin-main-backend-migration-admission-v0.1');
  addMismatch(failures, 'admission.recordedOn', ledger.recordedOn, '2026-09-07');
  addMismatch(failures, 'admission.state', ledger.state, 'preparation-only-inventory-complete-migration-incomplete');
  addMismatch(
    failures,
    'admission.identityProtocol',
    ledger.identityProtocol,
    'sha256(JSON.stringify(lexicographically-sorted-{path,mode-lstat-and-511,size,sha256-hex}-records))/v1',
  );
  addMismatch(failures, 'admission.roots', ledger.roots, EXPECTED_ROOTS);
  addMismatch(failures, 'admission.counts', ledger.counts, EXPECTED_COUNTS);
  addMismatch(failures, 'admission.controlPlane.requiredCandidatePaths', ledger.controlPlane?.requiredCandidatePaths, REQUIRED_CANDIDATE_PATHS);
  addMismatch(failures, 'admission.controlPlane.requiredReviewInputs', ledger.controlPlane?.requiredReviewInputs, REQUIRED_REVIEW_INPUTS);
  addMismatch(failures, 'admission.controlPlane.allowedReviewOutputs', ledger.controlPlane?.allowedReviewOutputs, ALLOWED_REVIEW_OUTPUTS);
  addMismatch(failures, 'admission.historicalIdentity', ledger.historicalIdentity, EXPECTED_HISTORICAL_IDENTITY);
  addMismatch(failures, 'admission.claimBoundary', ledger.claimBoundary, EXPECTED_CLAIM_BOUNDARY);
  addMismatch(failures, 'admission.remainingBlockers', ledger.remainingBlockers, REMAINING_BLOCKERS);
  addMismatch(failures, 'admission.r12Exclusion', ledger.r12Exclusion, {
    roundId: 'R12',
    rightsStatus: 'unresolved',
    payloadPresent: false,
    licensed: false,
    releasePass: false,
    paths: R12_EXCLUDED_PATHS,
  });

  if (!Array.isArray(ledger.entries)) return [...failures, 'admission.entries: must be an array'];
  const paths = ledger.entries.map((entry) => entry?.path);
  if (paths.length !== EXPECTED_COUNTS.union) failures.push(`admission.entries: expected ${EXPECTED_COUNTS.union} entries, observed ${paths.length}`);
  if (new Set(paths).size !== paths.length) failures.push('admission.entries: duplicate path');
  if (!sameValue(paths, [...paths].sort((left, right) => comparePaths(String(left), String(right))))) failures.push('admission.entries: paths are not uniquely lexicographically sorted');

  const observed = {
    identical: 0,
    conflicting: 0,
    pendingLegacyOnly: 0,
    excludedR12LegacyOnly: 0,
    mainOnly: 0,
    scientificCapabilitiesAdmitted: 0,
  };
  const r12Set = new Set(R12_EXCLUDED_PATHS);

  for (const [index, entry] of ledger.entries.entries()) {
    const label = `admission.entries[${index}]`;
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      failures.push(`${label}: must be an object`);
      continue;
    }
    if (!safePath(entry.path)) failures.push(`${label}.path: unsafe repository-relative path`);
    const isR12 = r12Set.has(entry.path);
    const expected = EXPECTED_RELATION_CONTRACTS[entry.relation];
    if (!expected) failures.push(`${label}.relation: unknown relation ${JSON.stringify(entry.relation)}`);

    if (entry.relation === 'identical') {
      observed.identical += 1;
      if (!entry.legacyIdentity || !entry.mainIdentity || !sameValue(entry.legacyIdentity, entry.mainIdentity)) failures.push(`${label}: identical relation requires equal legacy and main identities`);
    } else if (entry.relation === 'conflicting') {
      observed.conflicting += 1;
      if (!entry.legacyIdentity || !entry.mainIdentity || sameValue(entry.legacyIdentity, entry.mainIdentity)) failures.push(`${label}: conflicting relation requires two different identities`);
    } else if (entry.relation === 'legacy-only') {
      if (!entry.legacyIdentity || entry.mainIdentity !== null) failures.push(`${label}: legacy-only relation requires only a legacy identity`);
      if (isR12) observed.excludedR12LegacyOnly += 1;
      else observed.pendingLegacyOnly += 1;
    } else if (entry.relation === 'main-only') {
      observed.mainOnly += 1;
      if (entry.legacyIdentity !== null || !entry.mainIdentity) failures.push(`${label}: main-only relation requires only a main identity`);
    }

    const expectedEntryContract = isR12
      ? {
          disposition: 'excluded-r12-redistribution-unresolved',
          migrationStatus: 'excluded-rights-unresolved',
          rightsStatus: 'unresolved',
          payloadPresent: false,
        }
      : expected;
    if (expectedEntryContract) {
      for (const [field, value] of Object.entries(expectedEntryContract)) addMismatch(failures, `${label}.${field}`, entry[field], value);
    }
    if (isR12 && entry.relation !== 'legacy-only') failures.push(`${label}: R12-excluded payload must remain legacy-only`);
    if (!isR12 && (entry.disposition === 'excluded-r12-redistribution-unresolved' || entry.rightsStatus === 'unresolved')) failures.push(`${label}: only the exact R12 path set may use unresolved exclusion status`);
    if (entry.scientificCapabilityAdmitted !== false) failures.push(`${label}.scientificCapabilityAdmitted: pending inventory cannot admit a scientific capability`);
    if (entry.scientificCapabilityAdmitted === true) observed.scientificCapabilitiesAdmitted += 1;
  }

  addMismatch(failures, 'admission.observedCounts', observed, {
    identical: EXPECTED_COUNTS.identical,
    conflicting: EXPECTED_COUNTS.conflicting,
    pendingLegacyOnly: EXPECTED_COUNTS.pendingLegacyOnly,
    excludedR12LegacyOnly: EXPECTED_COUNTS.excludedR12LegacyOnly,
    mainOnly: EXPECTED_COUNTS.mainOnly,
    scientificCapabilitiesAdmitted: EXPECTED_COUNTS.scientificCapabilitiesAdmitted,
  });

  const legacyRecords = identityRecords(ledger, 'legacy');
  const mainRecords = identityRecords(ledger, 'main');
  addMismatch(failures, 'admission.legacy.pathCount', legacyRecords.length, EXPECTED_ROOTS.legacy.pathCount);
  addMismatch(failures, 'admission.main.pathCount', mainRecords.length, EXPECTED_ROOTS.main.pathCount);
  addMismatch(failures, 'admission.legacy.totalBytes', legacyRecords.reduce((total, entry) => total + entry.size, 0), EXPECTED_ROOTS.legacy.totalBytes);
  addMismatch(failures, 'admission.main.totalBytes', mainRecords.reduce((total, entry) => total + entry.size, 0), EXPECTED_ROOTS.main.totalBytes);
  addMismatch(failures, 'admission.legacy.identityDigest', inventoryDigest(legacyRecords), EXPECTED_ROOTS.legacy.identityDigest);
  addMismatch(failures, 'admission.main.identityDigest', inventoryDigest(mainRecords), EXPECTED_ROOTS.main.identityDigest);
  const gitignoreEntry = ledger.entries.find((entry) => entry.path === '.gitignore');
  if (gitignoreEntry?.relation !== 'conflicting' || gitignoreEntry?.disposition !== 'main-preserved-conflict') failures.push('admission.r18a-gitignore: root .gitignore conflict is not explicit');
  return failures;
}

export function validateCurrentInventory(ledger, currentRecords) {
  const failures = [];
  if (!Array.isArray(currentRecords)) return ['admission.currentInventory: must be an array'];
  const byPath = new Map();
  for (const record of currentRecords) {
    if (!record || !safePath(record.path) || byPath.has(record.path)) {
      failures.push('admission.currentInventory: malformed or duplicate path');
      continue;
    }
    byPath.set(record.path, record);
  }
  const ledgerByPath = new Map((ledger.entries ?? []).map((entry) => [entry.path, entry]));
  const allowedControlPaths = new Set([
    ...REQUIRED_CANDIDATE_PATHS,
    ...REQUIRED_REVIEW_INPUTS,
    ...ALLOWED_REVIEW_OUTPUTS,
  ]);
  const excludedDigests = new Set((ledger.entries ?? [])
    .filter((entry) => R12_EXCLUDED_PATHS.includes(entry.path))
    .map((entry) => entry.legacyIdentity?.sha256)
    .filter(Boolean));

  for (const record of currentRecords) {
    if (excludedDigests.has(record.sha256)) {
      failures.push(`admission.currentInventory.renamed-excluded-payload: ${record.path}`);
      continue;
    }
    const entry = ledgerByPath.get(record.path);
    if (!entry && !allowedControlPaths.has(record.path)) {
      failures.push(`admission.currentInventory.unaccounted-source: ${record.path}`);
      continue;
    }
    if (entry?.mainIdentity && !sameValue(
      { mode: record.mode, size: record.size, sha256: record.sha256 },
      entry.mainIdentity,
    )) failures.push(`admission.currentInventory.main-identity-drift: ${record.path}`);
    if (entry && !entry.mainIdentity) failures.push(`admission.currentInventory.legacy-only-payload-present: ${record.path}`);
  }

  for (const entry of ledger.entries ?? []) {
    if (entry.mainIdentity && !byPath.has(entry.path)) failures.push(`admission.currentInventory.main-path-missing: ${entry.path}`);
    if (!entry.mainIdentity && byPath.has(entry.path)) failures.push(`admission.currentInventory.legacy-only-payload-present: ${entry.path}`);
  }
  for (const requiredPath of [...REQUIRED_CANDIDATE_PATHS, ...REQUIRED_REVIEW_INPUTS]) {
    if (!byPath.has(requiredPath)) failures.push(`admission.currentInventory.required-control-missing: ${requiredPath}`);
  }
  return failures;
}

export function validateLegacyOnlyFilesystemAbsence(root, ledger) {
  const failures = [];
  const canonicalRoot = path.resolve(root);
  for (const entry of ledger.entries ?? []) {
    if (entry.mainIdentity !== null) continue;
    if (!safePath(entry.path)) {
      failures.push(`admission.currentFilesystem.unsafe-legacy-only-path: ${JSON.stringify(entry.path)}`);
      continue;
    }
    const absolutePath = path.resolve(canonicalRoot, entry.path);
    try {
      lstatSync(absolutePath);
      failures.push(`admission.currentFilesystem.legacy-only-payload-present: ${entry.path}`);
    } catch (error) {
      if (error?.code !== 'ENOENT') failures.push(`admission.currentFilesystem.path-check-failed: ${entry.path}`);
    }
  }
  return failures;
}

export function inspectAdmissionBytes(ledgerBytes, schemaBytes) {
  const failures = [];
  let ledger = null;
  let schema = null;
  const ledgerRawDigest = sha256(ledgerBytes);
  const schemaRawDigest = sha256(schemaBytes);
  try {
    ledger = parseJsonRejectDuplicateKeys(ledgerBytes, 'backend migration admission ledger');
  } catch (error) {
    failures.push(`admission.raw: invalid or duplicate-member JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  try {
    schema = parseJsonRejectDuplicateKeys(schemaBytes, 'backend migration admission schema');
  } catch (error) {
    failures.push(`admission.schema.raw: invalid or duplicate-member JSON (${error instanceof Error ? error.message : String(error)})`);
  }
  if (ledgerRawDigest !== EXPECTED_ADMISSION_LEDGER_RAW_DIGEST) failures.push('admission.raw: frozen ledger byte digest mismatch');
  if (schemaRawDigest !== EXPECTED_ADMISSION_SCHEMA_RAW_DIGEST) failures.push('admission.schema.raw: frozen schema byte digest mismatch');
  if (ledger && schema) failures.push(...validateAdmissionSchema(ledger, schema));
  if (ledger) failures.push(...validateAdmissionSemantics(ledger));
  return { ledger, schema, ledgerRawDigest, schemaRawDigest, failures };
}

export function captureCurrentInventory(root) {
  // Only the already-bound main root rules may exclude untracked paths.
  // Pass the captured rules as arguments: Git must not reread mutable local,
  // global or nested ignore files after this identity check.
  const ignoreBytes = readStableRegularFile(root, '.gitignore', 64 * 1024);
  if (sha256(ignoreBytes) !== MAIN_GITIGNORE_DIGEST) throw new Error('main root .gitignore identity differs');
  const excludeArguments = ignoreBytes.toString('utf8').split('\n')
    .filter((line) => line.length > 0 && !line.startsWith('#'))
    .map((line) => `--exclude=${line}`);
  const output = execFileSync(
    TRUSTED_GIT,
    ['-c', 'core.excludesFile=/dev/null', 'ls-files', '--cached', '--others', ...excludeArguments, '-z'],
    { cwd: root, encoding: 'utf8', env: GIT_ENVIRONMENT, stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 16 * 1024 * 1024 },
  );
  const paths = output.split('\0').filter(Boolean);
  if (paths.length > MAX_SOURCE_FILES || new Set(paths).size !== paths.length) throw new Error('current Git inventory is oversized or contains duplicate paths');
  return paths.sort(comparePaths).map((relativePath) => {
    if (!safePath(relativePath)) throw new Error(`current Git inventory contains unsafe path ${JSON.stringify(relativePath)}`);
    const bytes = readStableRegularFile(root, relativePath, MAX_SOURCE_FILE_BYTES);
    const metadata = lstatSync(path.join(root, relativePath));
    return {
      path: relativePath,
      mode: metadata.mode & 0o777,
      size: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  });
}

export function verifyAdmissionAtRoot(root) {
  const canonicalRoot = path.resolve(root);
  const ledgerBytes = readStableRegularFile(canonicalRoot, ADMISSION_LEDGER_PATH, MAX_LEDGER_BYTES);
  const schemaBytes = readStableRegularFile(canonicalRoot, ADMISSION_SCHEMA_PATH, MAX_SCHEMA_BYTES);
  const inspection = inspectAdmissionBytes(ledgerBytes, schemaBytes);
  let currentRecords = [];
  try {
    currentRecords = captureCurrentInventory(canonicalRoot);
  } catch (error) {
    inspection.failures.push(`admission.currentInventory: capture failed (${error instanceof Error ? error.message : String(error)})`);
  }
  // An empty successful Git capture is evidence of missing required paths,
  // never a reason to skip completeness. Capture failures remain recorded too.
  if (inspection.ledger) {
    inspection.failures.push(...validateCurrentInventory(inspection.ledger, currentRecords));
    inspection.failures.push(...validateLegacyOnlyFilesystemAbsence(canonicalRoot, inspection.ledger));
  }
  return {
    schemaVersion: 'tf.backend-migration-admission-gate/0.1',
    status: inspection.failures.length === 0 ? 'pass-preparation-only' : 'fail-closed',
    releaseEligible: false,
    ledgerRawDigest: inspection.ledgerRawDigest,
    schemaRawDigest: inspection.schemaRawDigest,
    currentPathCount: currentRecords.length,
    failures: inspection.failures,
  };
}

function readStableRegularFile(root, relativePath, maximumBytes) {
  if (!safePath(relativePath)) throw new TypeError(`unsafe read path ${JSON.stringify(relativePath)}`);
  const absolutePath = path.resolve(root, relativePath);
  if (path.relative(root, absolutePath).startsWith('..')) throw new TypeError(`read path escapes root ${JSON.stringify(relativePath)}`);
  const before = lstatSync(absolutePath, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size > BigInt(maximumBytes)) {
    throw new TypeError(`source path is not one bounded regular file: ${relativePath}`);
  }
  const descriptor = openSync(absolutePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    if (!sameFileIdentity(before, opened)) throw new Error(`source path changed before read: ${relativePath}`);
    const bytes = readFileSync(descriptor);
    const after = fstatSync(descriptor, { bigint: true });
    if (bytes.length !== Number(before.size) || !sameFileIdentity(before, after)) throw new Error(`source path changed during read: ${relativePath}`);
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function sameFileIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.uid === right.uid
    && left.gid === right.gid
    && left.rdev === right.rdev
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

const invokedUrl = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedUrl === import.meta.url) {
  try {
    const result = verifyAdmissionAtRoot(process.cwd());
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (result.failures.length > 0) process.exitCode = 1;
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
