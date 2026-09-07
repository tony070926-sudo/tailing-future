#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import { parseJsonRejectDuplicateKeys } from '../atomistic/runtime-input-contract.mjs';
import { regularBytes, createExecutionBudget, runBoundedCommand, requireSuccessfulCommand } from '../mesoscale/pfhub7a_r18a_current_root.mjs';
import { inspectSuccessor as inspectV02 } from './verify-r18a-origin-main-admission-v0.2.mjs';
import { R12_EXCLUDED_PATHS } from './verify-r18a-origin-main-admission.mjs';
import { DERIVED_REPORT_PATHS, REPORT_BYTE_LIMITS, capturedInputIdentity, checkDerivedReports } from '../derived-report-contract.mjs';

export const INTEGRATION_BASE = 'a63415c174dcfaa0dc5370ecc777b6ccdcda86aa';
export const SCIENTIFIC_CONTRACT_BASE = '307e6d723086fe41b6d89e9f9b4b532364ccaeff';
export const LEDGER_PATH = 'evaluation/backend-migration/r18a-origin-main-admission-v0.3.json';
export const SCHEMA_PATH = 'schemas/backend-migration-admission-v0.3.schema.json';
export const CONFIG_SNAPSHOT_PATH = 'evaluation/backend-migration/r18a-v0.2-historical-config-snapshot-v0.1.json';
export const PREVIOUS_FINAL_REVIEW = 'evaluation/reviews/2026-09-07-r18a-current-main-execution-v0.1-final-review.json';
export const RECEIPT_PATH = 'evaluation/mesoscale/fixtures/pfhub7a-r18a-independent-solver-preflight-v4-successor-v3-receipt.json';
export const REPORT_HISTORY_PATH = 'evaluation/backend-migration/r18a-a63415c-report-history-v0.1.json';
export const TERMINAL_REVIEW_PATH = 'evaluation/reviews/2026-09-07-r18a-portable-main-admission-v0.3-successor-v2-final-review.json';
// Source-admission pins, not approval; the preserved previous review abstains.
export const EXPECTED_LEDGER_HASH = 'a02ed15bacbdca32b6f390536719ed77419ece909ec7fe435105bd2e8303ec86';
export const EXPECTED_SCHEMA_HASH = '9efff3af296872d22f94dfbde94516b911a04518f2a1fed3b6bd3bcc745e4ac6';
export const UPSTREAM_PATHS = Object.freeze([
  'docs/ATOMISTIC_REPRODUCTION.md',
  'evaluation/atomistic/full-candidate-determinism-roots-v0.1.json',
  'evaluation/latest-report.json', 'evaluation/latest-report.md',
  'evaluation/public-product-evaluation.json', 'evaluation/public-summary.json',
  'evaluation/reviews/2026-09-07-v05-scientific-provenance-roots-review.md',
  'schemas/atomistic-full-candidate-determinism-roots.schema.json',
  'schemas/atomistic-full-candidate-host-observation.schema.json',
  'scripts/atomistic/full-candidate-observer-vnext.mjs',
  'scripts/atomistic/full-candidate-observer-vnext.test.mjs',
  'scripts/evaluate-observer-snapshot.test.mjs', 'scripts/evaluate-worker.mjs',
]);
export const CONFIG_PATHS = Object.freeze(['.gitignore', 'package.json', 'vitest.config.ts']);
export const RECONCILED_PATHS = Object.freeze([...CONFIG_PATHS, 'scripts/source-scope.mjs', 'scripts/source-scope.test.mjs', 'scripts/evaluate.mjs', 'scripts/evaluate-launcher.test.mjs']);
export const CONTROL_PATHS = Object.freeze([LEDGER_PATH, 'scripts/backend-migration/verify-r18a-origin-main-admission-v0.3.mjs']);
export const ADDITION_PATHS = Object.freeze([
  SCHEMA_PATH, CONFIG_SNAPSHOT_PATH,
  'scripts/backend-migration/verify-r18a-origin-main-admission-v0.3.test.mjs',
  'scripts/mesoscale/pfhub7a_r18a_current_root_v2.mjs',
  'scripts/mesoscale/pfhub7a_r18a_current_root_v2.test.mjs',
  'evaluation/reviews/2026-09-07-r18a-portable-main-admission-v0.3-scope.md',
  REPORT_HISTORY_PATH, 'scripts/derived-report-contract.mjs', 'scripts/derived-report-contract.test.mjs',
  'evaluation/reviews/2026-09-07-r18a-portable-main-admission-v0.3-successor-v2-scope.md',
]);
export const REVIEW_HISTORY_PATHS = Object.freeze(['manifest', 'builder-gates', 'science-review', 'software-review', 'sota-review', 'final-review'].map(name => `evaluation/reviews/2026-09-07-r18a-portable-main-admission-v0.3-${name}.json`));
export const REVIEW_PATHS = Object.freeze(['manifest', 'builder-gates', 'science-review', 'software-review', 'sota-review', 'final-review'].map(name => `evaluation/reviews/2026-09-07-r18a-portable-main-admission-v0.3-successor-v2-${name}.json`));
const GIT_ENV = { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
// Bind a target tree's checker to this executing module, without a recursive
// embedded self-hash. The frozen external candidate manifest binds this module.
const executingCheckerBytes = regularBytes(fileURLToPath(import.meta.url));
const executingCheckerIdentity = { size: executingCheckerBytes.length, sha256: hash(executingCheckerBytes) };
const sorted = values => [...values].sort();
const safePath = value => typeof value === 'string' && value.length <= 512 && !/^[\\/]|[\\\x00-\x1f\x7f]/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..');
const requireCondition = (condition, message) => { if (!condition) throw new Error(message); };

export function sourceIdentity(root, relative) {
  requireCondition(safePath(relative), 'UNSAFE_SOURCE_PATH');
  const bytes = regularBytes(path.join(root, relative));
  return { path: relative, mode: lstatSync(path.join(root, relative)).mode & 0o7777, size: bytes.length, sha256: hash(bytes) };
}

export function compareSourceIdentity(observed, expected) {
  if (observed.path !== expected.path || observed.size !== expected.size || observed.sha256 !== expected.sha256) return false;
  if (observed.path === RECEIPT_PATH) {
    return expected.mode === 0o444 && [0o444, 0o644].includes(observed.mode)
      && expected.size === 248778 && expected.sha256 === 'd91e31d261bf77f99b17e810f5f51aab131dd5339e281839933e45fa79855e5c';
  }
  return observed.mode === expected.mode;
}

export function inspectPortable(root) {
  const old = inspectV02(root);
  const bytes = regularBytes(path.join(root, LEDGER_PATH));
  const schemaBytes = regularBytes(path.join(root, SCHEMA_PATH));
  requireCondition(hash(bytes) === EXPECTED_LEDGER_HASH && hash(schemaBytes) === EXPECTED_SCHEMA_HASH, 'ADMISSION_NOT_FROZEN_OR_IDENTITY_MISMATCH');
  const ledger = parseJsonRejectDuplicateKeys(bytes, 'portable admission');
  const schema = parseJsonRejectDuplicateKeys(schemaBytes, 'portable admission schema');
  const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
  requireCondition(validate(ledger), `ADMISSION_SCHEMA:${JSON.stringify(validate.errors)}`);
  requireCondition(ledger.state === 'frozen-for-independent-review' && ledger.previousFinalReview !== null, 'PREVIOUS_FINAL_REVIEW_REQUIRED');
  requireCondition(ledger.integrationBaseCommit === INTEGRATION_BASE && ledger.scientificContractBaseCommit === SCIENTIFIC_CONTRACT_BASE, 'BASE_IDENTITY_MISMATCH');
  for (const [records, expected] of [[ledger.reconciled, RECONCILED_PATHS], [ledger.additions, ADDITION_PATHS], [ledger.reviewHistory, REVIEW_HISTORY_PATHS]]) requireCondition(isDeepStrictEqual(sorted(records.map(record => record.path)), sorted(expected)), 'EXACT_ADMISSION_PATH_SET');
  requireCondition(isDeepStrictEqual(ledger.controlFiles, CONTROL_PATHS) && isDeepStrictEqual(ledger.reviewOutputs, REVIEW_PATHS) && isDeepStrictEqual(ledger.upstreamPaths, UPSTREAM_PATHS), 'CONTROL_PATH_SET');
  requireCondition(ledger.baseRecords.length === 452 && ledger.baseRecords.every(record => record.mode === 0o644), 'BASE_INVENTORY_SHAPE');
  const main = new Set(ledger.baseRecords.map(record => record.path));
  requireCondition(main.size === 452 && UPSTREAM_PATHS.every(file => main.has(file)), 'UPSTREAM_CLOSURE_INCOMPLETE');
  const sourcePaths = [...ledger.imports, ...ledger.additions, ...ledger.reviewHistory].map(record => record.path);
  requireCondition(new Set(sourcePaths).size === sourcePaths.length && sourcePaths.every(file => !main.has(file)), 'DUPLICATE_OR_OVERLAPPING_IMPORT');
  requireCondition(ledger.previousFinalReview.path === PREVIOUS_FINAL_REVIEW && ledger.imports.some(record => isDeepStrictEqual(record, ledger.previousFinalReview)), 'PREVIOUS_FINAL_REVIEW_BINDING');
  const historical = [...old.ledger.historicalFiles, ...old.ledger.imports, ...old.ledger.additions];
  for (const expected of historical) requireCondition(ledger.imports.some(record => isDeepStrictEqual(record, expected)), `HISTORICAL_INPUT_MISMATCH:${expected.path}`);
  const snapshot = parseJsonRejectDuplicateKeys(regularBytes(path.join(root, CONFIG_SNAPSHOT_PATH)), 'historical config snapshot');
  requireCondition(snapshot.historicalBaseCommit === SCIENTIFIC_CONTRACT_BASE && snapshot.oldLedgerSha256 === '789eb6359676293f165edb7b21d55e6ebdf30366295a97459c38812e2e176011', 'HISTORICAL_CONFIG_BASE');
  requireCondition(snapshot.files.length === 3 && isDeepStrictEqual(sorted(snapshot.files.map(record => record.path)), sorted(CONFIG_PATHS)), 'HISTORICAL_CONFIG_SCOPE');
  for (const record of snapshot.files) {
    const bytes = Buffer.from(record.utf8, 'utf8');
    const expected = old.ledger.reconciled.find(item => item.path === record.path);
    requireCondition(bytes.length === expected.size && hash(bytes) === expected.sha256 && record.mode === expected.mode && record.size === expected.size && record.sha256 === expected.sha256, 'HISTORICAL_CONFIG_IDENTITY');
  }
  const reportHistory = parseJsonRejectDuplicateKeys(regularBytes(path.join(root, REPORT_HISTORY_PATH)), 'historical reports');
  requireCondition(isDeepStrictEqual(Object.keys(reportHistory).sort(), ['files', 'historicalBaseCommit', 'schemaVersion'])
    && reportHistory.schemaVersion === 'tf.derived-report-history/0.1'
    && reportHistory.historicalBaseCommit === INTEGRATION_BASE
    && isDeepStrictEqual(sorted(reportHistory.files.map(record => record.path)), [...DERIVED_REPORT_PATHS]), 'HISTORICAL_REPORT_SCOPE');
  for (const record of reportHistory.files) {
    const { utf8, ...identity } = record;
    const bytes = Buffer.from(utf8, 'utf8');
    requireCondition(isDeepStrictEqual(identity, ledger.baseRecords.find(item => item.path === record.path))
      && bytes.length === identity.size && hash(bytes) === identity.sha256, 'HISTORICAL_REPORT_IDENTITY');
  }
  return { ledger, old, snapshot };
}

export function captureInventory(root, ledger) {
  const expected = ledger.reconciled.find(record => record.path === '.gitignore');
  requireCondition(isDeepStrictEqual(sourceIdentity(root, '.gitignore'), expected), 'ROOT_IGNORE_IDENTITY');
  const excludes = regularBytes(path.join(root, '.gitignore')).toString('utf8').split('\n').filter(line => line && !line.startsWith('#')).map(line => `--exclude=${line}`);
  const output = execFileSync('/usr/bin/git', ['-c', 'core.excludesFile=/dev/null', 'ls-files', '--cached', '--others', ...excludes, '-z'], { cwd: root, env: GIT_ENV, encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
  const files = output.split('\0').filter(Boolean);
  requireCondition(files.length <= 4096 && files.length === new Set(files).size, 'SOURCE_INVENTORY_LIMIT_OR_DUPLICATE');
  return sorted(files).flatMap(file => {
    // Git --cached still names a deleted derived report. Only these four
    // missing files are optional; unsafe present entries must still reject.
    if (DERIVED_REPORT_PATHS.includes(file)) {
      try { lstatSync(path.join(root, file)); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    }
    return [sourceIdentity(root, file)];
  });
}

export function validateInventory(records, ledger, previous) {
  const expected = new Map([...ledger.baseRecords.filter(record => !DERIVED_REPORT_PATHS.includes(record.path)), ...ledger.reconciled, ...ledger.imports, ...ledger.additions, ...ledger.reviewHistory].map(record => [record.path, record]));
  const failures = []; const seen = new Set();
  const excluded = new Set(previous.entries.filter(entry => R12_EXCLUDED_PATHS.includes(entry.path)).map(entry => entry.legacyIdentity.sha256));
  for (const record of records) {
    if (!safePath(record.path) || seen.has(record.path)) failures.push(`duplicate-or-unsafe:${record.path}`);
    seen.add(record.path);
    if (R12_EXCLUDED_PATHS.includes(record.path) || excluded.has(record.sha256)) failures.push(`R12-excluded:${record.path}`);
    if (DERIVED_REPORT_PATHS.includes(record.path)) {
      if (![0o600, 0o644].includes(record.mode) || record.size > REPORT_BYTE_LIMITS[record.path]) failures.push(`derived-output-file-contract:${record.path}`);
    }
    else if (expected.has(record.path)) { if (!compareSourceIdentity(record, expected.get(record.path))) failures.push(`source-identity:${record.path}`); }
    else if (![...ledger.controlFiles, ...ledger.reviewOutputs].includes(record.path)) failures.push(`unaccounted-source:${record.path}`);
    else {
      if (record.mode !== 0o644) failures.push(`control-mode:${record.path}`);
      if (record.path === LEDGER_PATH && record.sha256 !== EXPECTED_LEDGER_HASH) failures.push(`control-identity:${record.path}`);
      if (record.path === CONTROL_PATHS[1] && (record.size !== executingCheckerIdentity.size || record.sha256 !== executingCheckerIdentity.sha256)) failures.push(`control-identity:${record.path}`);
    }
  }
  for (const file of [...expected.keys(), ...ledger.controlFiles]) if (!seen.has(file)) failures.push(`missing-source:${file}`);
  return failures;
}

export function selectSourceInputRecords(records) {
  return records.filter(record => !DERIVED_REPORT_PATHS.includes(record.path) && record.path !== TERMINAL_REVIEW_PATH);
}

const gitObjectHash = (kind, bytes) => createHash('sha1').update(Buffer.from(`${kind} ${bytes.length}\0`)).update(bytes).digest('hex');
function buildGitTree(root, records, writeObject) {
  const tree = new Map();
  for (const record of records) {
    const parts = record.path.split('/'); let cursor = tree;
    for (const part of parts.slice(0, -1)) { if (!cursor.has(part)) cursor.set(part, new Map()); cursor = cursor.get(part); requireCondition(cursor instanceof Map, 'TREE_PATH_COLLISION'); }
    const bytes = regularBytes(path.join(root, record.path));
    requireCondition(bytes.length === record.size && hash(bytes) === record.sha256, 'TREE_SOURCE_CHANGED');
    const oid = gitObjectHash('blob', bytes);
    writeObject?.('blob', bytes, oid);
    cursor.set(parts.at(-1), { oid });
  }
  const encode = directory => {
    const entries = [...directory.entries()].map(([name, value]) => value instanceof Map ? { name, directory: true, oid: encode(value) } : { name, directory: false, oid: value.oid });
    entries.sort((a, b) => Buffer.compare(Buffer.from(a.name + (a.directory ? '/' : '')), Buffer.from(b.name + (b.directory ? '/' : ''))));
    const bytes = Buffer.concat(entries.map(entry => Buffer.concat([Buffer.from(`${entry.directory ? '40000' : '100644'} ${entry.name}\0`), Buffer.from(entry.oid, 'hex')])));
    const oid = gitObjectHash('tree', bytes); writeObject?.('tree', bytes, oid); return oid;
  };
  return encode(tree);
}

export function verifyAdmissionAtRoot(root) {
  try {
    const { ledger, old } = inspectPortable(root);
    const records = captureInventory(root, ledger);
    const failures = validateInventory(records, ledger, old.previous);
    for (const entry of old.previous.entries) {
      if (entry.mainIdentity || ledger.imports.some(record => record.path === entry.path)) continue;
      try { lstatSync(path.join(root, entry.path)); failures.push(`pending-or-excluded-present:${entry.path}`); }
      catch (error) { if (error.code !== 'ENOENT') failures.push(`absence-check:${entry.path}`); }
    }
    // Source identity uses Git modes; actual POSIX modes were checked separately.
    const identify = rows => {
      const canonical = rows.map(({ path: file, size, sha256 }) => ({ path: file, gitMode: '100644', size, sha256 }));
      return { algorithm: 'sha256-UTF8-JSON-path-gitMode-size-sha256/v1', pathCount: canonical.length, sha256: hash(Buffer.from(JSON.stringify(canonical))), gitTreeOid: buildGitTree(root, rows) };
    };
    const presentOutputs = DERIVED_REPORT_PATHS.filter(file => records.some(record => record.path === file));
    return { schemaVersion: 'tf.backend-migration-admission-gate/0.3', lifecycleRevision: 'successor-v2', status: failures.length ? 'fail-closed' : 'pass-portable-source-admission', integrationBaseCommit: INTEGRATION_BASE, scientificContractBaseCommit: SCIENTIFIC_CONTRACT_BASE,
      // Preserve the old field's complete observed-tree semantics. This is not
      // Git HEAD, nor a release-approved tree. Input identity has its own name.
      candidateTreeIdentity: identify(records), sourceInputIdentity: identify(selectSourceInputRecords(records)),
      derivedReports: { state: presentOutputs.length === 4 ? 'present-unvalidated' : presentOutputs.length ? 'partial' : 'absent', presentPaths: presentOutputs, validated: false },
      terminalAttestationInInputIdentity: false, releaseEligible: false, historicalApprovalTransferred: false, failures };
  } catch (error) { return { status: 'fail-closed', releaseEligible: false, failures: [String(error.message ?? error)] }; }
}

export function verifyDerivedReportsAtRoot(root, generationEvidence, expectedSourceRevision = null) {
  try {
    const before = verifyAdmissionAtRoot(root);
    requireCondition(before.status === 'pass-portable-source-admission', 'SOURCE_ADMISSION_REQUIRED');
    const { ledger } = inspectPortable(root);
    const captureInputs = () => new Map(selectSourceInputRecords(captureInventory(root, ledger)).map(record => {
      const bytes = regularBytes(path.join(root, record.path));
      requireCondition(bytes.length === record.size && hash(bytes) === record.sha256, 'INPUT_CHANGED_DURING_REPORT_CHECK');
      return [record.path, { content: bytes, byteLength: bytes.length, digest: `sha256:${hash(bytes)}`, mode: record.mode }];
    }));
    const capturedInputs = captureInputs();
    const readReports = () => new Map(DERIVED_REPORT_PATHS.map(file => [file, regularBytes(path.join(root, file), REPORT_BYTE_LIMITS[file])]));
    const reportBytesByPath = readReports();
    const result = checkDerivedReports({ capturedInputs, expectedSourceRevision, reportBytesByPath, generationEvidence });
    const after = verifyAdmissionAtRoot(root);
    requireCondition(after.status === 'pass-portable-source-admission' && isDeepStrictEqual(before.sourceInputIdentity, after.sourceInputIdentity), 'INPUT_CHANGED_DURING_REPORT_CHECK');
    const readback = readReports();
    requireCondition(DERIVED_REPORT_PATHS.every(file => reportBytesByPath.get(file).equals(readback.get(file))), 'REPORT_CHANGED_DURING_CHECK');
    // Portable admission deliberately equates source receipt 0444 and 0644.
    // Evaluator identity does not: recapture actual path/bytes/size/POSIX mode
    // after report readback before claiming current-input consistency.
    const capturedAfter = captureInputs();
    requireCondition(isDeepStrictEqual(capturedInputIdentity(capturedInputs), capturedInputIdentity(capturedAfter)), 'POSIX_INPUT_CHANGED_DURING_REPORT_CHECK');
    return { ...result, sourceInputIdentity: after.sourceInputIdentity, sourceVerifiedBeforeAndAfter: true, evaluatorInputVerifiedBeforeAndAfter: true };
  } catch (error) { return { status: 'abstain', releaseEligible: false, executionAuthenticated: false, reasons: [String(error.message ?? error)] }; }
}

function attachObjects(root, temporary, budget) {
  const common = execFileSync('/usr/bin/git', ['rev-parse', '--git-common-dir'], { cwd: root, env: GIT_ENV, encoding: 'utf8', timeout: Math.min(30000, budget.remainingMs()) }).trim();
  const objects = realpathSync(path.resolve(root, common, 'objects'));
  mkdirSync(path.join(temporary, '.git/objects/info'), { recursive: true });
  writeFileSync(path.join(temporary, '.git/objects/info/alternates'), `${objects}\n`, { flag: 'wx' });
}

export async function replayHistoricalTests(root) {
  const budget = createExecutionBudget(120000);
  const { ledger, old, snapshot } = inspectPortable(root);
  const temporary = realpathSync(mkdtempSync(path.join(tmpdir(), 'tf-admission-v03-history-')));
  const put = (record, bytes) => {
    budget.assertRemaining(); requireCondition(bytes.length === record.size && hash(bytes) === record.sha256, `HISTORY_BYTE_MISMATCH:${record.path}`);
    const destination = path.join(temporary, record.path); mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, bytes, { flag: 'wx', mode: record.mode }); chmodSync(destination, record.mode);
  };
  try {
    for (const entry of old.previous.entries.filter(entry => entry.mainIdentity)) {
      const config = snapshot.files.find(record => record.path === entry.path);
      if (config) put(config, Buffer.from(config.utf8, 'utf8'));
      else put({ path: entry.path, ...entry.mainIdentity }, execFileSync('/usr/bin/git', ['show', `${SCIENTIFIC_CONTRACT_BASE}:${entry.path}`], { cwd: root, env: GIT_ENV, timeout: Math.min(30000, budget.remainingMs()), maxBuffer: 128 * 1024 * 1024 }));
    }
    for (const record of ledger.imports) put(record, regularBytes(path.join(root, record.path)));
    execFileSync('/usr/bin/git', ['init', '--quiet', temporary], { env: GIT_ENV, timeout: budget.remainingMs() });
    attachObjects(root, temporary, budget);
    execFileSync('/usr/bin/git', ['-C', temporary, 'add', '--force', '--all'], { env: GIT_ENV, timeout: budget.remainingMs() });
    symlinkSync(realpathSync(path.join(root, 'node_modules')), path.join(temporary, 'node_modules'), 'dir');
    const command = [process.execPath, 'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts', 'scripts/backend-migration/verify-r18a-origin-main-admission-v0.2.test.mjs', '--reporter=verbose'];
    const result = await runBoundedCommand(command, { cwd: temporary, env: { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, NO_COLOR: '1', LANG: 'C', LC_ALL: 'C' }, timeoutMs: budget.remainingMs(), maxOutputBytes: 8 * 1024 * 1024 });
    requireSuccessfulCommand(result, 'historical-v02-and-nested-v01'); budget.assertRemaining();
    const output = `${result.stdout}\n${result.stderr}`;
    requireCondition(/Tests\s+5 passed \(5\)/.test(output) && output.includes('20 passed (20)') && !/\bskipped\b/i.test(output), 'HISTORICAL_CORPUS_INCOMPLETE');
    return { command, historicalBase: SCIENTIFIC_CONTRACT_BASE, reconstructedMainFiles: 449, reconstructedImports: ledger.imports.length, historicalOnly: true, ...result };
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

// Genuine Git tree/index checkout, without commits or post-checkout chmod.
// The caller owns this explicitly returned temporary checkout and its cleanup.
export function createGitCheckout(root) {
  const budget = createExecutionBudget(120000);
  const admitted = verifyAdmissionAtRoot(root); requireCondition(admitted.status === 'pass-portable-source-admission', 'CHECKOUT_SOURCE_NOT_ADMITTED');
  budget.assertRemaining();
  const { ledger } = inspectPortable(root); const records = captureInventory(root, ledger);
  const temporary = realpathSync(mkdtempSync(path.join(tmpdir(), 'tf-admission-v03-checkout-')));
  try {
    execFileSync('/usr/bin/git', ['init', '--quiet', temporary], { env: GIT_ENV, timeout: budget.remainingMs() });
    attachObjects(root, temporary, budget);
    const treeOid = buildGitTree(root, records, (kind, bytes, expected) => {
      const observed = execFileSync('/usr/bin/git', ['hash-object', '-w', '-t', kind, '--stdin'], { cwd: temporary, env: GIT_ENV, input: bytes, encoding: 'utf8', timeout: budget.remainingMs(), maxBuffer: 128 * 1024 * 1024 }).trim();
      requireCondition(observed === expected, 'GIT_OBJECT_IDENTITY');
    });
    requireCondition(treeOid === admitted.candidateTreeIdentity.gitTreeOid, 'CANDIDATE_TREE_CHANGED');
    execFileSync('/usr/bin/git', ['read-tree', treeOid], { cwd: temporary, env: GIT_ENV, timeout: budget.remainingMs() });
    execFileSync('/usr/bin/git', ['checkout-index', '--all'], { cwd: temporary, env: GIT_ENV, timeout: budget.remainingMs() });
    const index = execFileSync('/usr/bin/git', ['ls-files', '--stage', '-z'], { cwd: temporary, env: GIT_ENV, encoding: 'utf8', timeout: budget.remainingMs() });
    requireCondition(index.split('\0').filter(Boolean).every(record => record.startsWith('100644 ')), 'CHECKOUT_INDEX_MODE');
    const receipt = sourceIdentity(temporary, RECEIPT_PATH); requireCondition(receipt.mode === 0o644, 'CHECKOUT_NOT_ORDINARY_0644');
    const result = verifyAdmissionAtRoot(temporary); requireCondition(result.status === 'pass-portable-source-admission' && isDeepStrictEqual(result.candidateTreeIdentity, admitted.candidateTreeIdentity), 'CHECKOUT_ADMISSION_FAILED');
    budget.assertRemaining();
    return { root: temporary, treeOid, index, receipt, admission: result, processUmask: process.umask(), postCheckoutChmodPerformed: false, approvedReleaseCommit: false };
  } catch (error) { rmSync(temporary, { recursive: true, force: true }); throw error; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let result;
  const args = process.argv.slice(2);
  try {
    if (args.length === 0) result = verifyAdmissionAtRoot(process.cwd());
    else {
      requireCondition(args.length === 3 && args[0] === '--derived-reports' && args[1] === '--generation-evidence' && path.isAbsolute(args[2]), 'USAGE: --derived-reports --generation-evidence ABSOLUTE_EXTERNAL_JSON');
      const sourceRoot = realpathSync(process.cwd());
      const evidenceFile = realpathSync(args[2]);
      requireCondition(!evidenceFile.startsWith(`${sourceRoot}${path.sep}`), 'GENERATION_EVIDENCE_MUST_BE_OUTSIDE_SOURCE_TREE');
      result = verifyDerivedReportsAtRoot(sourceRoot, parseJsonRejectDuplicateKeys(regularBytes(args[2], 2 * 1024 * 1024), 'generation statement'), process.env.GITHUB_SHA ?? null);
    }
  } catch (error) { result = { status: 'abstain', releaseEligible: false, reasons: [String(error.message ?? error)] }; }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!['pass-portable-source-admission', 'pass-derived-report-consistency'].includes(result.status)) process.exitCode = 1;
}
