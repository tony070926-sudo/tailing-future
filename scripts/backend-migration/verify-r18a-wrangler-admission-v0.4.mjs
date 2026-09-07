#!/usr/bin/env node
// Explicit successor: old ledgers, tests and scientific/runtime bytes are history,
// not a renewable approval. The executing checker is externally frozen, not self-approved.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import { parseJsonRejectDuplicateKeys } from '../atomistic/runtime-input-contract.mjs';
import { regularBytes, createExecutionBudget, runBoundedCommand, requireSuccessfulCommand, assertCompleteCorpus } from '../mesoscale/pfhub7a_r18a_current_root.mjs';
import { inspectPortable as inspectV03, RECEIPT_PATH, TERMINAL_REVIEW_PATH } from './verify-r18a-origin-main-admission-v0.3.mjs';
import { R12_EXCLUDED_PATHS } from './verify-r18a-origin-main-admission.mjs';
import { DERIVED_REPORT_PATHS, REPORT_BYTE_LIMITS, capturedInputIdentity, checkDerivedReports } from '../derived-report-contract.mjs';

export { RECEIPT_PATH, TERMINAL_REVIEW_PATH };
export const INTEGRATION_BASE = '84f7720e9ac14fcb50fb54fdcb96d1df7473c365';
export const INTEGRATION_TREE = 'e673c40ee6144b510223caf8cf6d6b30bc4f9eb6';
export const SCIENTIFIC_CONTRACT_BASE = '307e6d723086fe41b6d89e9f9b4b532364ccaeff';
export const LEDGER_PATH = 'evaluation/backend-migration/r18a-wrangler-admission-v0.4.json';
export const SCHEMA_PATH = 'schemas/backend-migration-admission-v0.4.schema.json';
export const REVIEW_PATH = 'evaluation/reviews/2026-09-07-r18a-wrangler-integration-v0.4-review.md';
export const EXPECTED_LEDGER_HASH = '1dd99ff9ffc9f1fbacfedbaba7e98f0d4de3845918a41d8634b270aaacf8f4bd';
export const EXPECTED_SCHEMA_HASH = '53d9a512d32fe930c86082b1247cb75995707eda3d8465d65329ec6a962828fa';
export const BASE_RECORDS_HASH = 'cbfb32cd44ba74f44a68a933ff49ccc0e7d32daa0dfd0675a9123a74b0844310';
export const CONTROL_PATHS = Object.freeze([LEDGER_PATH, 'scripts/backend-migration/verify-r18a-wrangler-admission-v0.4.mjs']);
export const RECONCILED_PATHS = Object.freeze(['package.json', 'vitest.config.ts', 'scripts/release-cloudflare.mjs', 'scripts/release-cloudflare.test.mjs']);
export const ADDITION_PATHS = Object.freeze([
  SCHEMA_PATH,
  'scripts/backend-migration/verify-r18a-wrangler-admission-v0.4.test.mjs',
  'scripts/mesoscale/pfhub7a_r18a_current_root_v3.mjs',
  'scripts/mesoscale/pfhub7a_r18a_current_root_v3.test.mjs',
  'evaluation/reviews/2026-09-07-r18a-wrangler-integration-v0.4-plan.md',
  'docs/RELEASE_AUTHENTICATION.md',
  'evaluation/reviews/2026-09-07-wrangler-encrypted-release-review.md',
]);
export const HISTORICAL_TEST_PATHS = Object.freeze([
  'scripts/backend-migration/verify-r18a-origin-main-admission-v0.3.test.mjs',
  'scripts/mesoscale/pfhub7a_r18a_current_root_v2.test.mjs',
]);
const GIT_ENV = { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_REPLACE_OBJECTS: '1' };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sorted = values => [...values].sort();
const safePath = value => typeof value === 'string' && value.length <= 512 && !/^[\\/]|[\\\x00-\x1f\x7f]/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..');
const requireCondition = (condition, message) => { if (!condition) throw new Error(message); };
const executingCheckerBytes = regularBytes(fileURLToPath(import.meta.url));
const executingCheckerIdentity = { size: executingCheckerBytes.length, sha256: hash(executingCheckerBytes) };

export function sourceIdentity(root, relative) {
  requireCondition(safePath(relative), 'UNSAFE_SOURCE_PATH');
  const filename = path.join(root, relative);
  const before = lstatSync(filename);
  const bytes = regularBytes(filename);
  const after = lstatSync(filename);
  requireCondition(before.dev === after.dev && before.ino === after.ino && before.size === after.size
    && before.mode === after.mode && before.nlink === after.nlink && before.mtimeMs === after.mtimeMs
    && before.ctimeMs === after.ctimeMs, 'SOURCE_PATH_CHANGED_DURING_READ');
  return { path: relative, mode: after.mode & 0o7777, size: bytes.length, sha256: hash(bytes) };
}

export function compareSourceIdentity(observed, expected) {
  if (observed.path !== expected.path || observed.size !== expected.size || observed.sha256 !== expected.sha256) return false;
  // The 84f Git checkout has 0644; the preserved historical receipt alone may
  // also be sealed 0444. This is not a runtime or newly generated receipt rule.
  if (expected.path === RECEIPT_PATH && expected.mode === 0o644 && expected.size === 248778
    && expected.sha256 === 'd91e31d261bf77f99b17e810f5f51aab131dd5339e281839933e45fa79855e5c') return [0o444, 0o644].includes(observed.mode);
  return observed.mode === expected.mode;
}

export function inspectPortable(root) {
  const old = inspectV03(root);
  const bytes = regularBytes(path.join(root, LEDGER_PATH));
  const schemaBytes = regularBytes(path.join(root, SCHEMA_PATH));
  requireCondition(hash(bytes) === EXPECTED_LEDGER_HASH && hash(schemaBytes) === EXPECTED_SCHEMA_HASH, 'ADMISSION_NOT_FROZEN_OR_IDENTITY_MISMATCH');
  const ledger = parseJsonRejectDuplicateKeys(bytes, 'Wrangler successor admission');
  const validate = new Ajv2020({ strict: true, allErrors: true }).compile(parseJsonRejectDuplicateKeys(schemaBytes, 'Wrangler successor schema'));
  requireCondition(validate(ledger), 'ADMISSION_SCHEMA:' + JSON.stringify(validate.errors));
  requireCondition(hash(Buffer.from(JSON.stringify(ledger.baseRecords))) === BASE_RECORDS_HASH, 'BASE_RECORDS_IDENTITY');
  const base = new Map(ledger.baseRecords.map(record => [record.path, record]));
  requireCondition(base.size === 517 && ledger.baseRecords.every(record => safePath(record.path))
    && isDeepStrictEqual(ledger.baseRecords.map(record => record.path), sorted(base.keys())), 'BASE_INVENTORY_SHAPE');
  for (const [records, expected] of [[ledger.reconciled, RECONCILED_PATHS], [ledger.additions, ADDITION_PATHS]]) {
    requireCondition(isDeepStrictEqual(sorted(records.map(record => record.path)), sorted(expected)), 'EXACT_ADMISSION_PATH_SET');
  }
  for (const entry of ledger.reconciled) requireCondition(entry.path === entry.before.path && entry.path === entry.after.path
    && isDeepStrictEqual(entry.before, base.get(entry.path)), 'RECONCILIATION_BASE_IDENTITY');
  requireCondition(ledger.additions.every(record => !base.has(record.path))
    && [...CONTROL_PATHS, REVIEW_PATH].every(file => !base.has(file)), 'NEW_PATH_OVERLAP');
  requireCondition(isDeepStrictEqual(ledger.controlFiles, CONTROL_PATHS)
    && isDeepStrictEqual(ledger.reviewOutputs, [REVIEW_PATH]), 'CONTROL_PATH_SET');
  return { ledger, old };
}

export function captureInventory(root, ledger) {
  requireCondition(isDeepStrictEqual(sourceIdentity(root, '.gitignore'), ledger.baseRecords.find(record => record.path === '.gitignore')), 'ROOT_IGNORE_IDENTITY');
  // Only the exact unchanged root ignore rules apply. Nested .gitignore,
  // .git/info/exclude and global excludes cannot hide unregistered source.
  const excludes = regularBytes(path.join(root, '.gitignore')).toString('utf8').split('\n')
    .filter(line => line && !line.startsWith('#')).map(line => '--exclude=' + line);
  const output = execFileSync('/usr/bin/git', ['-c', 'core.excludesFile=/dev/null', 'ls-files', '--cached', '--others', ...excludes, '-z'],
    { cwd: root, env: GIT_ENV, encoding: 'utf8', timeout: 30000, maxBuffer: 16 * 1024 * 1024 });
  const files = output.split('\0').filter(Boolean);
  requireCondition(files.length <= 4096 && files.length === new Set(files).size, 'SOURCE_INVENTORY_LIMIT_OR_DUPLICATE');
  return sorted(files).flatMap(file => {
    if (DERIVED_REPORT_PATHS.includes(file)) {
      try { lstatSync(path.join(root, file)); } catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    }
    return [sourceIdentity(root, file)];
  });
}

export function validateInventory(records, ledger, previous) {
  const expected = new Map([...ledger.baseRecords.filter(record => !DERIVED_REPORT_PATHS.includes(record.path)),
    ...ledger.reconciled.map(record => record.after), ...ledger.additions].map(record => [record.path, record]));
  const excluded = new Set(previous.entries.filter(entry => R12_EXCLUDED_PATHS.includes(entry.path)).map(entry => entry.legacyIdentity.sha256));
  const failures = []; const seen = new Set();
  if (!isDeepStrictEqual(records.map(record => record.path), sorted(records.map(record => record.path)))) failures.push('source-inventory-order');
  for (const record of records) {
    if (!safePath(record.path) || seen.has(record.path)) failures.push('duplicate-or-unsafe:' + record.path);
    seen.add(record.path);
    if (R12_EXCLUDED_PATHS.includes(record.path) || excluded.has(record.sha256)) failures.push('R12-excluded:' + record.path);
    if (DERIVED_REPORT_PATHS.includes(record.path)) {
      if (![0o600, 0o644].includes(record.mode) || record.size > REPORT_BYTE_LIMITS[record.path]) failures.push('derived-output-file-contract:' + record.path);
    } else if (expected.has(record.path)) {
      if (!compareSourceIdentity(record, expected.get(record.path))) failures.push('source-identity:' + record.path);
    } else if (![...CONTROL_PATHS, REVIEW_PATH].includes(record.path)) failures.push('unaccounted-source:' + record.path);
    else {
      if (record.mode !== 0o644 || record.size === 0 || record.size > 2 * 1024 * 1024) failures.push('control-file-contract:' + record.path);
      if (record.path === LEDGER_PATH && record.sha256 !== EXPECTED_LEDGER_HASH) failures.push('control-identity:' + record.path);
      if (record.path === CONTROL_PATHS[1] && (record.size !== executingCheckerIdentity.size || record.sha256 !== executingCheckerIdentity.sha256)) failures.push('control-identity:' + record.path);
    }
  }
  for (const file of [...expected.keys(), ...CONTROL_PATHS, REVIEW_PATH]) if (!seen.has(file)) failures.push('missing-source:' + file);
  return failures;
}

// Exactly the unchanged 84f selector: all NEW review documents are inputs.
// The old terminal selector remains excluded here, but its bytes are pinned
// as an ordinary historical base record above (not a renewable attestation).
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
    const failures = validateInventory(records, ledger, old.old.previous);
    for (const entry of old.old.previous.entries) {
      if (entry.mainIdentity || ledger.baseRecords.some(record => record.path === entry.path)) continue;
      try { lstatSync(path.join(root, entry.path)); failures.push('pending-or-excluded-present:' + entry.path); }
      catch (error) { if (error.code !== 'ENOENT') failures.push('absence-check:' + entry.path); }
    }
    const identify = rows => {
      const canonical = rows.map(({ path: file, size, sha256 }) => ({ path: file, gitMode: '100644', size, sha256 }));
      return { algorithm: 'sha256-UTF8-JSON-path-gitMode-size-sha256/v1', pathCount: canonical.length,
        sha256: hash(Buffer.from(JSON.stringify(canonical))), gitTreeOid: buildGitTree(root, rows) };
    };
    const presentOutputs = DERIVED_REPORT_PATHS.filter(file => records.some(record => record.path === file));
    return { schemaVersion: 'tf.backend-migration-admission-gate/0.4', hypothesis: ledger.hypothesis,
      status: failures.length ? 'fail-closed' : 'pass-portable-source-admission',
      integrationBaseCommit: INTEGRATION_BASE, scientificContractBaseCommit: SCIENTIFIC_CONTRACT_BASE,
      candidateTreeIdentity: identify(records), sourceInputIdentity: identify(selectSourceInputRecords(records)),
      derivedReports: { state: presentOutputs.length === 4 ? 'present-unvalidated' : presentOutputs.length ? 'partial' : 'absent', presentPaths: presentOutputs, validated: false },
      currentReviewInInputIdentity: true, oldTerminalBytesPinned: true,
      historicalTestsExecutedByAdmission: false, currentRunSuccessClaimed: false,
      executionAuthenticated: false, reproduced: false, physicalValidation: false, convergenceVerified: false,
      scientificPromotionEligible: false, releaseEligible: false, historicalApprovalTransferred: false, failures };
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
  const common = execFileSync('/usr/bin/git', ['rev-parse', '--git-common-dir'],
    { cwd: root, env: GIT_ENV, encoding: 'utf8', timeout: Math.min(30000, budget.remainingMs()) }).trim();
  const objects = realpathSync(path.resolve(root, common, 'objects'));
  requireCondition(!/[\r\n]/.test(objects), 'OBJECT_DIRECTORY_INVALID');
  mkdirSync(path.join(temporary, '.git/objects/info'), { recursive: true });
  writeFileSync(path.join(temporary, '.git/objects/info/alternates'), objects + '\n', { flag: 'wx' });
}

export function createHistoricalCheckout(root) {
  const budget = createExecutionBudget(120000);
  const { ledger } = inspectPortable(root);
  const temporary = realpathSync(mkdtempSync(path.join(tmpdir(), 'tf-admission-v04-history-')));
  try {
    execFileSync('/usr/bin/git', ['init', '--quiet', temporary], { env: GIT_ENV, timeout: budget.remainingMs() });
    attachObjects(root, temporary, budget);
    const observedTree = execFileSync('/usr/bin/git', ['rev-parse', INTEGRATION_BASE + '^{tree}'],
      { cwd: temporary, env: GIT_ENV, encoding: 'utf8', timeout: budget.remainingMs() }).trim();
    requireCondition(observedTree === INTEGRATION_TREE, 'HISTORICAL_GIT_TREE_IDENTITY');
    execFileSync('/usr/bin/git', ['read-tree', INTEGRATION_TREE], { cwd: temporary, env: GIT_ENV, timeout: budget.remainingMs() });
    execFileSync('/usr/bin/git', ['checkout-index', '--all'], { cwd: temporary, env: GIT_ENV, timeout: budget.remainingMs() });
    const observed = captureInventory(temporary, ledger);
    requireCondition(isDeepStrictEqual(observed, ledger.baseRecords), 'HISTORICAL_CHECKOUT_BYTES_OR_MODES');
    budget.assertRemaining();
    return { root: temporary, commit: INTEGRATION_BASE, tree: INTEGRATION_TREE, pathCount: observed.length,
      postCheckoutChmodPerformed: false, historicalOnly: true };
  } catch (error) { rmSync(temporary, { recursive: true, force: true }); throw error; }
}

// Parse structured evidence emitted by the preserved historical tests; never
// accept a stale saved report or a matching textual substring as child success.
export function assertHistoricalCorpus(result) {
  requireSuccessfulCommand(result, 'historical-v03-and-current-root-v2');
  const output = result.stdout + '\n' + result.stderr;
  requireCondition(/Tests\s+15 passed \(15\)/.test(output)
    && /verify-r18a-origin-main-admission-v0\.3\.test\.mjs.*\(10 tests\)/.test(output)
    && /pfhub7a_r18a_current_root_v2\.test\.mjs.*\(5 tests\)/.test(output)
    && !/\b[1-9]\d* skipped\b|\b[1-9]\d* failed\b/.test(output), 'HISTORICAL_TOP_CORPUS_INCOMPLETE');
  const evidence = output.split('\n').filter(line => line.startsWith('{"'))
    .map(line => { try { return JSON.parse(line); } catch { return null; } }).filter(Boolean);
  const replay = evidence.filter(value => value.historicalReplayEvidence);
  const git = evidence.filter(value => value.gitCheckoutEvidence);
  requireCondition(replay.length === 1 && git.length === 1, 'HISTORICAL_EVIDENCE_CARDINALITY');
  const nested = replay[0].historicalReplayEvidence;
  requireSuccessfulCommand(nested, 'nested-v02-v01');
  requireCondition(nested.historicalOnly === true && nested.historicalBase === SCIENTIFIC_CONTRACT_BASE
    && /Tests\s+5 passed \(5\)/.test(nested.stdout + '\n' + nested.stderr)
    && (nested.stdout + nested.stderr).includes('20 passed (20)')
    && !/\bskipped\b/i.test(nested.stdout + nested.stderr), 'HISTORICAL_NESTED_CORPUS_INCOMPLETE');
  const node = git[0].gitCheckoutEvidence.node;
  requireSuccessfulCommand(node, 'historical-checkout-node29');
  assertCompleteCorpus('node', node.stdout + '\n' + node.stderr);
  return { oldAdmissionTests: 10, oldCurrentRootTests: 5, nestedV02Tests: 5, nestedV01Tests: 20, nodeTests: 29 };
}

export async function replayHistoricalTests(root) {
  // 120 s is the existing historical child budget. No physics/CI timeout changes.
  const checkout = createHistoricalCheckout(root);
  try {
    symlinkSync(realpathSync(path.join(root, 'node_modules')), path.join(checkout.root, 'node_modules'), 'dir');
    const command = [process.execPath, 'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts',
      ...HISTORICAL_TEST_PATHS, '--reporter=default'];
    const result = await runBoundedCommand(command, { cwd: checkout.root,
      env: { PATH: path.dirname(process.execPath) + ':/usr/bin:/bin', NO_COLOR: '1', LANG: 'C', LC_ALL: 'C' },
      timeoutMs: 120000, maxOutputBytes: 8 * 1024 * 1024 });
    let counts;
    try { counts = assertHistoricalCorpus(result); }
    catch (error) {
      // Preserve failed child facts for the enclosing test's external log.
      // A failed/missing corpus never returns an admitted replay result.
      error.historicalExecution = { ...checkout, command, ...result };
      throw error;
    }
    return { ...checkout, root: '<temporary-exact-84f-checkout>', command, counts,
      dependencyLayout: 'external-reference-focused-only', ...result, releaseEligible: false, historicalApprovalTransferred: false };
  } finally { rmSync(checkout.root, { recursive: true, force: true }); }
}

// Genuine Git tree/index checkout, without commits or post-checkout chmod.
// The caller owns this explicitly returned temporary checkout and its cleanup.
export function createGitCheckout(root) {
  const budget = createExecutionBudget(120000);
  const admitted = verifyAdmissionAtRoot(root); requireCondition(admitted.status === 'pass-portable-source-admission', 'CHECKOUT_SOURCE_NOT_ADMITTED');
  budget.assertRemaining();
  const { ledger } = inspectPortable(root); const records = captureInventory(root, ledger);
  const temporary = realpathSync(mkdtempSync(path.join(tmpdir(), 'tf-admission-v04-checkout-')));
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
