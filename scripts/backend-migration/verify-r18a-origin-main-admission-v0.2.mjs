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
import { createExecutionBudget, regularBytes, requireSuccessfulCommand, runBoundedCommand } from '../mesoscale/pfhub7a_r18a_current_root.mjs';
import { inspectAdmissionBytes, ADMISSION_LEDGER_PATH as OLD_LEDGER, ADMISSION_SCHEMA_PATH as OLD_SCHEMA, REQUIRED_CANDIDATE_PATHS, REQUIRED_REVIEW_INPUTS, ALLOWED_REVIEW_OUTPUTS, R12_EXCLUDED_PATHS } from './verify-r18a-origin-main-admission.mjs';

export const LEDGER_PATH = 'evaluation/backend-migration/r18a-origin-main-admission-v0.2.json';
export const SCHEMA_PATH = 'schemas/backend-migration-admission-v0.2.schema.json';
export const EXPECTED_LEDGER_HASH = '789eb6359676293f165edb7b21d55e6ebdf30366295a97459c38812e2e176011';
export const EXPECTED_SCHEMA_HASH = 'df7a30e50f1608904dc793eddfca23069b6d78f9f1a29e50ac7a67fea4e27684';
export const IMPORT_PATHS = Object.freeze([
  'scripts/mesoscale/pfhub7a_r18a_supervise_v3.py', 'scripts/mesoscale/pfhub7a_r18a_worker.py',
  'scripts/mesoscale/pfhub7a_r18a_oracle.py', 'scripts/mesoscale/pfhub7a_r18a_preflight_v3_test.py',
  'scripts/mesoscale/pfhub7a_r18a_schema_gate_v3.mjs', 'scripts/mesoscale/pfhub7a_r18a_schema_gate_v3.node-test.mjs',
  'scripts/mesoscale/r16c_json_integrity.mjs', 'schemas/pfhub7a-r18a-preflight-receipt-v0.3.schema.json',
  'evaluation/mesoscale/preregistrations/pfhub7a-r18a-independent-solver-preflight-v4-resolved.json',
  'evaluation/mesoscale/dependencies/pfhub7a-r18a-fipy/runtime-lock-v1.json',
  'evaluation/mesoscale/dependencies/pfhub7a-r17b-cas/benchmark7-aa4774ce.ipynb',
  'evaluation/mesoscale/fixtures/pfhub7a-r18a-independent-solver-preflight-v4-successor-v3-receipt.json',
]);
export const RECONCILED_PATHS = Object.freeze(['.gitignore', 'package.json', 'vitest.config.ts']);
export const HISTORICAL_PATHS = Object.freeze([...REQUIRED_CANDIDATE_PATHS, ...REQUIRED_REVIEW_INPUTS, ...ALLOWED_REVIEW_OUTPUTS]);
export const REVIEW_OUTPUTS = Object.freeze(['manifest', 'builder-gates', 'science-review', 'software-review', 'sota-review', 'final-review', 'successor-v2-manifest', 'successor-v2-builder-gates'].map(name => `evaluation/reviews/2026-09-07-r18a-current-main-execution-v0.1-${name}.json`));
const CONTROL_PATHS = [LEDGER_PATH, 'scripts/backend-migration/verify-r18a-origin-main-admission-v0.2.mjs'];
const ADDITION_PATHS = [SCHEMA_PATH, 'scripts/backend-migration/verify-r18a-origin-main-admission-v0.2.test.mjs', 'scripts/mesoscale/pfhub7a_r18a_current_root.mjs', 'scripts/mesoscale/pfhub7a_r18a_current_root.test.mjs', 'evaluation/mesoscale/dependencies/pfhub7a-r17b-cas/PFHub-LICENSE.md', 'evaluation/mesoscale/dependencies/pfhub7a-r17b-cas/pfhub7-source-provenance.json', 'evaluation/reviews/2026-09-07-r18a-current-main-execution-v0.1-scope.md', 'evaluation/reviews/2026-09-07-r18a-current-main-execution-v0.1-deadline-fix-scope.md'];
const GIT_ENV = { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null' };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const safePath = value => typeof value === 'string' && value.length <= 512 && !/^[\\/]|[\\\x00-\x1f\x7f]/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..');
const sorted = values => [...values].sort();
export function identity(root, relative) {
  if (!safePath(relative)) throw new Error('unsafe source path');
  const bytes = regularBytes(path.join(root, relative));
  return { path: relative, mode: lstatSync(path.join(root, relative)).mode & 0o777, size: bytes.length, sha256: hash(bytes) };
}

export function inspectSuccessor(root) {
  const old = inspectAdmissionBytes(regularBytes(path.join(root, OLD_LEDGER)), regularBytes(path.join(root, OLD_SCHEMA)));
  if (old.failures.length) throw new Error(`historical-admission-integrity: ${old.failures.join('; ')}`);
  const bytes = regularBytes(path.join(root, LEDGER_PATH));
  const schemaBytes = regularBytes(path.join(root, SCHEMA_PATH));
  if (hash(bytes) !== EXPECTED_LEDGER_HASH || hash(schemaBytes) !== EXPECTED_SCHEMA_HASH) throw new Error('successor frozen ledger/schema identity mismatch');
  const ledger = parseJsonRejectDuplicateKeys(bytes, 'successor admission');
  const schema = parseJsonRejectDuplicateKeys(schemaBytes, 'successor schema');
  const errors = validateSemantics(ledger, old.ledger, schema);
  if (errors.length) throw new Error(errors.join('; '));
  return { ledger, previous: old.ledger };
}

export function validateSemantics(ledger, previous, schema) {
  const failures = [];
  const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
  if (!validate(ledger)) return [`schema: ${JSON.stringify(validate.errors)}`];
  for (const [field, expected] of [['historicalFiles', HISTORICAL_PATHS], ['imports', IMPORT_PATHS], ['reconciled', RECONCILED_PATHS], ['additions', ADDITION_PATHS]]) {
    if (!isDeepStrictEqual(sorted(ledger[field].map(record => record.path)), sorted(expected))) failures.push(`${field}: exact path set mismatch`);
  }
  if (!isDeepStrictEqual(ledger.controlFiles, CONTROL_PATHS) || !isDeepStrictEqual(ledger.reviewOutputs, REVIEW_OUTPUTS)) failures.push('control/review paths changed');
  const all = [...ledger.historicalFiles, ...ledger.imports, ...ledger.reconciled, ...ledger.additions].map(record => record.path);
  if (new Set(all).size !== all.length) failures.push('duplicate identity path');
  for (const record of ledger.imports) {
    const expected = previous.entries.find(entry => entry.path === record.path);
    const observed = { mode: record.mode, size: record.size, sha256: record.sha256 };
    if (!expected || expected.mainIdentity || !isDeepStrictEqual(expected.legacyIdentity, observed) || R12_EXCLUDED_PATHS.includes(record.path)) failures.push(`import identity: ${record.path}`);
  }
  return failures;
}

export function captureInventory(root, ledger) {
  const expectedIgnore = ledger.reconciled.find(record => record.path === '.gitignore');
  if (!isDeepStrictEqual(identity(root, '.gitignore'), expectedIgnore)) throw new Error('reconciled root ignore identity mismatch');
  const excludes = regularBytes(path.join(root, '.gitignore')).toString('utf8').split('\n').filter(line => line && !line.startsWith('#')).map(line => `--exclude=${line}`);
  const output = execFileSync('/usr/bin/git', ['-c', 'core.excludesFile=/dev/null', 'ls-files', '--cached', '--others', ...excludes, '-z'], { cwd: root, env: GIT_ENV, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
  const files = output.split('\0').filter(Boolean);
  if (files.length > 4096 || new Set(files).size !== files.length) throw new Error('invalid source inventory');
  return sorted(files).map(file => identity(root, file));
}

export function validateInventory(records, ledger, previous) {
  const errors = [];
  const expected = new Map(previous.entries.filter(entry => entry.mainIdentity).map(entry => [entry.path, { path: entry.path, ...entry.mainIdentity }]));
  for (const record of [...ledger.historicalFiles, ...ledger.imports, ...ledger.reconciled, ...ledger.additions]) expected.set(record.path, record);
  const control = new Set(ledger.controlFiles);
  const outputs = new Set(ledger.reviewOutputs);
  const excluded = new Set(previous.entries.filter(entry => R12_EXCLUDED_PATHS.includes(entry.path)).map(entry => entry.legacyIdentity.sha256));
  const seen = new Set();
  for (const record of records) {
    if (!safePath(record.path) || seen.has(record.path)) errors.push(`duplicate/unsafe: ${record.path}`);
    seen.add(record.path);
    if (excluded.has(record.sha256) || R12_EXCLUDED_PATHS.includes(record.path)) errors.push(`R12-excluded: ${record.path}`);
    if (expected.has(record.path)) { if (!isDeepStrictEqual(record, expected.get(record.path))) errors.push(`identity-drift: ${record.path}`); }
    else if (!control.has(record.path) && !outputs.has(record.path)) errors.push(`unaccounted-source: ${record.path}`);
  }
  for (const file of [...expected.keys(), ...control]) if (!seen.has(file)) errors.push(`missing-source: ${file}`);
  return errors;
}

export function verifyAdmissionAtRoot(root) {
  try {
    const { ledger, previous } = inspectSuccessor(root);
    const records = captureInventory(root, ledger);
    const failures = validateInventory(records, ledger, previous);
    for (const entry of previous.entries) {
      if (entry.mainIdentity || IMPORT_PATHS.includes(entry.path)) continue;
      try { lstatSync(path.join(root, entry.path)); failures.push(`pending-or-excluded-present: ${entry.path}`); }
      catch (error) { if (error.code !== 'ENOENT') failures.push(`absence-check: ${entry.path}`); }
    }
    return { schemaVersion: 'tf.backend-migration-admission-gate/0.2', status: failures.length ? 'fail-closed' : 'pass-bounded-integration-inventory', releaseEligible: false, historicalCandidateIdentityTransferred: false, currentPathCount: records.length, failures };
  } catch (error) { return { status: 'fail-closed', releaseEligible: false, failures: [String(error.message ?? error)] }; }
}

export async function replayHistoricalTests(root) {
  const budget = createExecutionBudget(120000);
  const { ledger, previous } = inspectSuccessor(root);
  const temporary = realpathSync(mkdtempSync(path.join(tmpdir(), 'tf-admission-historical-')));
  const writeVerified = (record, bytes) => {
    if (bytes.length !== record.size || hash(bytes) !== record.sha256) throw new Error(`historical input identity mismatch: ${record.path}`);
    const destination = path.join(temporary, record.path);
    mkdirSync(path.dirname(destination), { recursive: true });
    writeFileSync(destination, bytes, { flag: 'wx', mode: record.mode }); chmodSync(destination, record.mode);
  };
  try {
    // Resolve pinned Git blobs, never copy potentially modified current main files.
    for (const entry of previous.entries.filter(entry => entry.mainIdentity)) {
      budget.assertRemaining();
      const bytes = execFileSync('/usr/bin/git', ['show', `${ledger.baseCommit}:${entry.path}`], { cwd: root, env: GIT_ENV, maxBuffer: 128 * 1024 * 1024 });
      writeVerified({ path: entry.path, ...entry.mainIdentity }, bytes);
    }
    for (const record of ledger.historicalFiles) {
      budget.assertRemaining();
      if (!isDeepStrictEqual(identity(root, record.path), record)) throw new Error(`historical preserved identity mismatch: ${record.path}`);
      writeVerified(record, regularBytes(path.join(root, record.path)));
    }
    execFileSync('/usr/bin/git', ['init', '--quiet', temporary], { env: GIT_ENV });
    execFileSync('/usr/bin/git', ['-C', temporary, 'add', '--force', '--all'], { env: GIT_ENV });
    symlinkSync(realpathSync(path.join(root, 'node_modules')), path.join(temporary, 'node_modules'), 'dir');
    const command = [process.execPath, 'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts', 'scripts/backend-migration/verify-r18a-origin-main-admission.test.mjs', '--reporter=verbose'];
    const result = await runBoundedCommand(command, { cwd: temporary, timeoutMs: budget.remainingMs(), maxOutputBytes: 8 * 1024 * 1024, env: { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, LANG: 'C', LC_ALL: 'C', NO_COLOR: '1' } });
    const output = `${result.stdout}\n${result.stderr}`;
    requireSuccessfulCommand(result, 'mandatory-historical-suite');
    if (!/Tests\s+20 passed \(20\)/.test(output) || /\bskipped\b/i.test(output)) throw new Error(`mandatory historical suite failed: ${output}`);
    budget.assertRemaining();
    return { command, reconstructedMainFiles: 449, reconstructedHistoricalFiles: 11, exitCode: result.status, stdout: result.stdout, stderr: result.stderr, lifecycle: { timeoutMs: result.timeoutMs, stopGraceMs: result.stopGraceMs, elapsedMs: result.elapsedMs, cleanupConfirmed: result.cleanupConfirmed, cleanup: result.cleanup }, historicalOnly: true };
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = verifyAdmissionAtRoot(process.cwd());
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status === 'fail-closed') process.exitCode = 1;
}
