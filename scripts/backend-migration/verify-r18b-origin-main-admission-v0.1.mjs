import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, lstatSync, mkdtempSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import { parseJsonRejectDuplicateKeys } from '../atomistic/runtime-input-contract.mjs';
import { regularBytes, createExecutionBudget, runBoundedCommand, requireSuccessfulCommand } from '../mesoscale/pfhub7a_r18a_current_root.mjs';
import { R12_EXCLUDED_PATHS } from './verify-r18a-origin-main-admission.mjs';
import { DERIVED_REPORT_PATHS, REPORT_BYTE_LIMITS } from '../derived-report-contract.mjs';

export const BASE = 'dc6e7f1af19f5398eb03b94d8ffaee2182d07f55';
export const TREE = '5522f1ee4eb9a3cf83176afeb874e504c11347d0';
export const OLD_BASE = '84f7720e9ac14fcb50fb54fdcb96d1df7473c365';
export const OLD_TREE = 'e673c40ee6144b510223caf8cf6d6b30bc4f9eb6';
export const COMPATIBILITY_FILES = Object.freeze([
  'scripts/backend-migration/verify-r18a-wrangler-admission-v0.4.test.mjs',
  'scripts/mesoscale/pfhub7a_r18a_current_root_v3.test.mjs',
]);
const numericBoundary = { legacyNumericEntryScope: 'version-bound-history-only', newR18bNumericExecutionEnabled: false };
export const LEDGER = 'evaluation/backend-migration/r18b-origin-main-admission-v0.1.json';
export const SCHEMA = 'schemas/backend-migration-r18b-admission-v0.1.schema.json';
export const CHECKER = 'scripts/backend-migration/verify-r18b-origin-main-admission-v0.1.mjs';
export const REVIEW = 'evaluation/reviews/2026-09-10-custom-lab-dynamics-v01-review.json';
export const EXPECTED_LEDGER_SHA256 = '917ed9e36dd3c7ee803cf1aad12689530d03f16a60ab2ef7cadc64fb60e363f0';
export const HISTORY_FILES = Object.freeze([
  'scripts/backend-migration/verify-r18a-origin-main-admission-v0.3.test.mjs',
  'scripts/mesoscale/pfhub7a_r18a_current_root_v2.test.mjs',
  'scripts/backend-migration/verify-r18a-origin-main-admission-v0.2.test.mjs',
  'scripts/backend-migration/verify-r18a-origin-main-admission.test.mjs',
  'scripts/mesoscale/pfhub7a_r18a_schema_gate_v3.node-test.mjs',
]);
const GIT_ENV = { PATH: '/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_REPLACE_OBJECTS: '1', GIT_LITERAL_PATHSPECS: '1' };
export const flags = () => ({ releaseEligible: false, deploymentEligible: false, scientificPromotionEligible: false, historicalApprovalTransferred: false, approvalAuthenticated: false });
export const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const executing = regularBytes(fileURLToPath(import.meta.url));
const need = (condition, code) => { if (!condition) throw new Error(code); };
function lexicallyPresent(filename) {
  try { lstatSync(filename); return true; } catch (error) { if (error.code === 'ENOENT') return false; throw error; }
}
export const safePath = value => typeof value === 'string' && value.length <= 512 && !/^[\\/]|[\\\x00-\x1f\x7f]/.test(value) && value.split('/').every(part => part && part !== '.' && part !== '..');
export function identity(root, relative) {
  need(safePath(relative), 'UNSAFE_PATH');
  const bytes = regularBytes(path.join(root, relative));
  return { path: relative, mode: lstatSync(path.join(root, relative)).mode & 0o7777, size: bytes.length, sha256: hash(bytes) };
}
export function verifyMaterialized(root, records, budget) {
  for (const record of records) { budget.assertRemaining(); need(isDeepStrictEqual(identity(root, record.path), record), 'HISTORY_MATERIALIZATION'); }
}
function git(root, args, timeout = 30000) {
  return execFileSync('/usr/bin/git', args, { cwd: root, env: GIT_ENV, timeout, maxBuffer: 128 * 1024 * 1024 });
}
export function validateDependencyInputs(ledger) {
  need(Array.isArray(ledger.dependencies)
    && isDeepStrictEqual(ledger.dependencies.map(record => record.path).sort(), ['package-lock.json', 'package.json']), 'DEPENDENCY_PATH_SET');
  for (const record of ledger.dependencies) {
    const inputs = ledger.inputs.filter(input => input.path === record.path);
    need(inputs.length === 1 && isDeepStrictEqual(inputs[0], record), 'DEPENDENCY_INPUT_IDENTITY:' + record.path);
  }
}
export function baseRecords(root, budget = null) {
  const invoke = args => git(root, args, budget ? Math.min(30000, budget.remainingMs()) : 30000);
  need(invoke(['cat-file', '-t', BASE]).toString().trim() === 'commit', 'BASE_COMMIT_REQUIRED');
  need(invoke(['rev-parse', `${BASE}^{tree}`]).toString().trim() === TREE, 'BASE_TREE_MISMATCH');
  const entries = invoke(['ls-tree', '-rz', '--full-tree', BASE]).toString().split('\0').filter(Boolean);
  need(entries.length === 527, 'BASE_COUNT');
  const parsed = entries.map(entry => {
    const match = /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/.exec(entry);
    need(match && safePath(match[3]), 'BASE_ENTRY');
    return match;
  });
  const batch = execFileSync('/usr/bin/git', ['cat-file', '--batch'], { cwd: root, env: GIT_ENV, timeout: budget ? Math.min(30000, budget.remainingMs()) : 30000, maxBuffer: 128 * 1024 * 1024, input: parsed.map(match => match[2]).join('\n') + '\n' });
  let offset = 0;
  const records = parsed.map(match => {
    const newline = batch.indexOf(10, offset); need(newline >= offset, 'BASE_BATCH_HEADER');
    const header = /^(\w{40}) blob (\d+)$/.exec(batch.subarray(offset, newline).toString());
    need(header && header[1] === match[2], 'BASE_BATCH_OBJECT');
    const length = Number(header[2]); need(Number.isSafeInteger(length) && length >= 0, 'BASE_BATCH_SIZE');
    offset = newline + 1; const bytes = batch.subarray(offset, offset + length);
    need(bytes.length === length && batch[offset + length] === 10, 'BASE_BATCH_FRAMING'); offset += length + 1;
    return { path: match[3], mode: match[1] === '100755' ? 0o755 : 0o644, size: bytes.length, sha256: hash(bytes) };
  });
  need(offset === batch.length, 'BASE_BATCH_TRAILING');
  budget?.assertRemaining();
  return records.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
}
export function readPolicy(root, budget = null) {
  budget?.assertRemaining();
  const bytes = regularBytes(path.join(root, LEDGER));
  need(hash(bytes) === EXPECTED_LEDGER_SHA256, 'LEDGER_IDENTITY');
  const ledger = parseJsonRejectDuplicateKeys(bytes, 'R18b ledger');
  const expectedSchema = ledger.inputs?.find(record => record.path === SCHEMA);
  need(expectedSchema && isDeepStrictEqual(identity(root, SCHEMA), expectedSchema), 'SCHEMA_IDENTITY');
  const schema = parseJsonRejectDuplicateKeys(regularBytes(path.join(root, SCHEMA)), 'R18b schema');
  need(new Ajv2020({ strict: true, allErrors: true }).compile(schema)(ledger), 'LEDGER_SCHEMA');
  need(ledger.baseCommit === BASE && ledger.baseTree === TREE && isDeepStrictEqual(ledger.controls, [LEDGER, CHECKER, REVIEW]), 'LEDGER_POLICY');
  need(ledger.bindingRevision === 3, 'BINDING_REVISION');
  need(new Set(ledger.inputs.map(record => record.path)).size === 40, 'INPUT_PATH_SET');
  validateDependencyInputs(ledger);
  budget?.assertRemaining();
  return ledger;
}
export function inventory(root, base) {
  need(isDeepStrictEqual(identity(root, '.gitignore'), base.find(record => record.path === '.gitignore')), 'ROOT_IGNORE_IDENTITY');
  const excludes = regularBytes(path.join(root, '.gitignore')).toString().split('\n').filter(line => line && !line.startsWith('#')).map(line => `--exclude=${line}`);
  const paths = git(root, ['-c', 'core.excludesFile=/dev/null', 'ls-files', '--cached', '--others', ...excludes, '-z']).toString().split('\0').filter(Boolean);
  need(paths.length <= 4096 && paths.length === new Set(paths).size, 'INVENTORY_DUPLICATE_OR_LIMIT');
  return paths.sort().flatMap(relative => {
    if (DERIVED_REPORT_PATHS.includes(relative) && !lexicallyPresent(path.join(root, relative))) return [];
    return [identity(root, relative)];
  });
}
export function validateRecords(records, base, ledger, forbiddenHashes) {
  const expected = new Map([...base, ...ledger.inputs].map(record => [record.path, record]));
  const failures = []; const seen = new Set();
  for (const record of records) {
    if (!safePath(record.path) || seen.has(record.path)) failures.push(`duplicate-or-unsafe:${record.path}`);
    seen.add(record.path);
    if (R12_EXCLUDED_PATHS.includes(record.path) || forbiddenHashes.includes(record.sha256)) failures.push(`R12-excluded:${record.path}`);
    if (DERIVED_REPORT_PATHS.includes(record.path)) {
      if (![0o600, 0o644].includes(record.mode) || record.size > REPORT_BYTE_LIMITS[record.path]) failures.push(`derived-output:${record.path}`);
    } else if (expected.has(record.path)) {
      const wanted = expected.get(record.path);
      const receiptException = record.path === 'evaluation/mesoscale/fixtures/pfhub7a-r18a-independent-solver-preflight-v4-successor-v3-receipt.json' && record.sha256 === 'd91e31d261bf77f99b17e810f5f51aab131dd5339e281839933e45fa79855e5c' && record.size === 248778 && [0o444, 0o644].includes(record.mode);
      if (!isDeepStrictEqual(receiptException ? { ...record, mode: wanted.mode } : record, wanted)) failures.push(`source-identity:${record.path}`);
    } else if (!ledger.controls.includes(record.path)) failures.push(`unaccounted-source:${record.path}`);
    else if (record.mode !== 0o644 || record.size > 128 * 1024) failures.push(`control-contract:${record.path}`);
  }
  for (const relative of [...expected.keys(), LEDGER, CHECKER]) if (!DERIVED_REPORT_PATHS.includes(relative) && !seen.has(relative)) failures.push(`missing-source:${relative}`);
  return failures;
}
export function verifySource(root) {
  try {
    const ledger = readPolicy(root); const base = baseRecords(root);
    need(hash(regularBytes(path.join(root, CHECKER))) === hash(executing), 'CHECKER_IDENTITY');
    const old = parseJsonRejectDuplicateKeys(git(root, ['show', `${BASE}:evaluation/backend-migration/r18a-origin-main-admission-v0.1.json`]), 'old ledger');
    const forbiddenHashes = old.entries.filter(entry => R12_EXCLUDED_PATHS.includes(entry.path)).map(entry => entry.legacyIdentity.sha256);
    const records = inventory(root, base);
    const failures = validateRecords(records, base, ledger, forbiddenHashes);
    for (const entry of old.entries.filter(entry => entry.relation === 'legacy-only' && !base.some(record => record.path === entry.path))) if (lexicallyPresent(path.join(root, entry.path))) failures.push(`legacy-only-present:${entry.path}`);
    const review = records.find(record => record.path === REVIEW);
    if (review) {
      const parsed = parseJsonRejectDuplicateKeys(regularBytes(path.join(root, REVIEW), 128 * 1024), 'final review');
      need(parsed && typeof parsed === 'object' && !Array.isArray(parsed), 'REVIEW_JSON_OBJECT');
    }
    const sourceInputs = records.filter(record => !DERIVED_REPORT_PATHS.includes(record.path));
    return { status: failures.length ? 'fail-closed' : 'source-consistent', bindingRevision: ledger.bindingRevision, reviewState: review ? 'present-unvalidated' : 'absent', records, observedTreeDigest: hash(JSON.stringify(records)), sourceInputDigest: hash(JSON.stringify(sourceInputs)), observedOutputs: records.filter(record => DERIVED_REPORT_PATHS.includes(record.path)), sourceInputExclusions: [...DERIVED_REPORT_PATHS], evaluatorLegacyTerminalExclusionApplied: false, failures, ...numericBoundary, ...flags() };
  } catch (error) { return { status: 'fail-closed', failures: [error.message], ...numericBoundary, ...flags() }; }
}
export function validateManifest(records, manifest) {
  need(manifest && Object.keys(manifest).length === 1 && Array.isArray(manifest.files), 'MANIFEST_SHAPE');
  need(records.some(record => record.path === REVIEW), 'FINAL_REVIEW_REQUIRED');
  for (const record of manifest.files) need(record && isDeepStrictEqual(Object.keys(record).sort(), ['mode', 'path', 'sha256', 'size']) && safePath(record.path) && Number.isSafeInteger(record.size) && record.size >= 0 && Number.isInteger(record.mode) && /^[a-f0-9]{64}$/.test(record.sha256), 'MANIFEST_RECORD');
  need(new Set(manifest.files.map(record => record.path)).size === manifest.files.length, 'MANIFEST_DUPLICATE');
  need(isDeepStrictEqual(records.filter(record => !DERIVED_REPORT_PATHS.includes(record.path)), manifest.files), 'MANIFEST_DRIFT');
  return { status: 'matches-unauthenticated-manifest', observedOutputs: records.filter(record => DERIVED_REPORT_PATHS.includes(record.path)), ...flags() };
}
export function verifyManifest(root, filename) {
  const result = verifySource(root); need(result.status === 'source-consistent', 'SOURCE_REQUIRED');
  return validateManifest(result.records, parseJsonRejectDuplicateKeys(regularBytes(filename), 'external manifest'));
}

// Read the fixed registration grammar as data, never execute a test module.
export function historicalNames(root, budget = null) {
  const sources = HISTORY_FILES.map(file => {
    budget?.assertRemaining();
    const bytes = git(root, ['show', OLD_BASE + ':' + file], budget ? Math.min(30000, budget.remainingMs()) : 30000);
    budget?.assertRemaining();
    return bytes.toString('utf8');
  });
  const files = sources.slice(0, 4).map((source, index) => {
    const suite = /^describe\('([^']+)'/m.exec(source)?.[1];
    need(suite, 'STATIC_SUITE');
    return [...source.matchAll(/^  it\('([^']+)'/gm)].map(match => ({ file: HISTORY_FILES[index], suite, name: match[1] }));
  });
  const node = [...sources[4].matchAll(/^test\('([^']+)'/gm)].map(match => match[1]);
  const cases = sources[4].slice(sources[4].indexOf('const historicalMutationCases = ['), sources[4].indexOf('for (const mutationCase'));
  const mutations = [...cases.matchAll(/testId: '([^']+)'/g)].map(match => match[1]);
  need(isDeepStrictEqual(files.map(list => list.length), [10, 5, 5, 20]) && mutations.length === 10 && node.length === 19, 'STATIC_CORPUS');
  const compatibility = COMPATIBILITY_FILES.map(file => {
    budget?.assertRemaining();
    const source = git(root, ['show', BASE + ':' + file], budget ? Math.min(30000, budget.remainingMs()) : 30000).toString('utf8');
    budget?.assertRemaining();
    const suite = /^describe\('([^']+)'/m.exec(source)?.[1];
    need(suite, 'STATIC_COMPATIBILITY_SUITE');
    return [...source.matchAll(/^  it\('([^']+)'/gm)].map(match => ({ file, suite, name: match[1] }));
  });
  need(isDeepStrictEqual(compatibility.map(list => list.length), [12, 5]), 'STATIC_COMPATIBILITY_CORPUS');
  return { outer: compatibility.flat(), old15: [...files[0], ...files[1]], v02: files[2], v01: files[3], node: [...mutations, ...node] };
}
const cleanText = text => {
  need(typeof text === 'string' && !text.includes('\ufffd'), 'HISTORY_TEXT_ENCODING');
  return text.replace(/\x1b\[[0-9;]*m/g, '');
};
function jsonEvidence(text, key) {
  const values = cleanText(text).split('\n').filter(line => line.trim().startsWith('{')).flatMap(line => {
    const parsed = parseJsonRejectDuplicateKeys(Buffer.from(line.trim()), 'history log');
    return Object.hasOwn(parsed, key) ? [parsed[key]] : [];
  });
  need(values.length === 1, 'HISTORY_EVIDENCE:' + key);
  return values[0];
}
function corpus(text, tuples, files) {
  const lines = cleanText(text).split('\n').filter(line => !line.trim().startsWith('{')).map(line => line.trim());
  const fileSummaries = lines.filter(line => /^Test Files\b/.test(line));
  const testSummaries = lines.filter(line => /^Tests\b/.test(line));
  need(fileSummaries.length === 1 && new RegExp('^Test Files\\s+' + files + ' passed \\(' + files + '\\)$').test(fileSummaries[0]), 'CORPUS_FILE_SUMMARY');
  need(testSummaries.length === 1 && new RegExp('^Tests\\s+' + tuples.length + ' passed \\(' + tuples.length + '\\)$').test(testSummaries[0]), 'CORPUS_TEST_SUMMARY');
  const results = lines.filter(line => /^[✓✔×↓-](?:\s|$)/.test(line));
  const expected = tuples.map(item => item.file + ' > ' + item.suite + ' > ' + item.name).sort();
  const actual = results.map(line => {
    need(/^[✓✔] /.test(line), 'CORPUS_NONPASS');
    return line.slice(2).replace(/\s+\d+(?:\.\d+)?ms$/, '');
  }).sort();
  need(new Set(actual).size === actual.length && isDeepStrictEqual(actual, expected), 'CORPUS_EXACT_PASS_SET');
}
function cleanup(value) {
  need(value?.cleanupConfirmed === true && value.cleanup?.directChildExitObserved === true
    && value.cleanup?.pipesClosed === true && value.cleanup?.processGroupAbsent === true, 'CLEANUP_UNCERTAIN');
}
// The frozen /0.4 helper selects default reporter for this layer only.
// Slow details expose an optional short-name subset, not a complete name corpus.
function default15Corpus(text, tuples) {
  const lines = cleanText(text).split('\n').filter(line => !line.trim().startsWith('{'));
  const summary = (prefix, count) => {
    const selected = lines.map(line => line.trim()).filter(line => new RegExp('^' + prefix + '\\b').test(line));
    need(selected.length === 1 && new RegExp('^' + prefix + '\\s+' + count + ' passed \\(' + count + '\\)$').test(selected[0]), 'DEFAULT15_SUMMARY:' + prefix);
  };
  summary('Test Files', 2); summary('Tests', 15);
  const expectedFiles = new Map([[HISTORY_FILES[0], 10], [HISTORY_FILES[1], 5]]);
  const observedFiles = new Set(); const seenDetails = new Set(); const observedSlowDetails = [];
  let currentFile = null; let summariesStarted = false;
  for (const line of lines) {
    if (/^(?:Test Files|Tests)\b/.test(line.trim())) {
      need(observedFiles.size === 2, 'DEFAULT15_SUMMARY_ORDER');
      summariesStarted = true; currentFile = null;
      continue;
    }
    if (!/^[✓✔×↓-](?:\s|$)/.test(line.trim())) continue;
    need(!summariesStarted, 'DEFAULT15_LATE_RESULT');
    need(/^[✓✔] /.test(line.trim()), 'DEFAULT15_NONPASS');
    const file = /^ [✓✔] (.+) \((\d+) tests\) (0|[1-9]\d*)ms$/.exec(line);
    if (file) {
      need(expectedFiles.get(file[1]) === Number(file[2]) && !observedFiles.has(file[1]), 'DEFAULT15_EXACT_FILE_SET');
      need(Number.isSafeInteger(Number(file[3])) && Number(file[3]) <= 120000, 'DEFAULT15_DURATION');
      currentFile = file[1]; observedFiles.add(currentFile);
      continue;
    }
    // One describe level gives five spaces. The renderer inserts two before ms.
    const detail = /^ {5}[✓✔] (.+)  (0|[1-9]\d*)ms$/.exec(line);
    need(detail && currentFile !== null, 'DEFAULT15_DETAIL_CONTEXT');
    const registered = tuples.filter(item => item.file === currentFile && item.name === detail[1]);
    need(registered.length === 1, 'DEFAULT15_DETAIL_NAME');
    const key = currentFile + '\0' + detail[1];
    need(!seenDetails.has(key), 'DEFAULT15_DETAIL_DUPLICATE');
    const displayedDurationMs = Number(detail[2]);
    // Raw duration >300 can round to exactly 300; displayed values are integers.
    need(Number.isSafeInteger(displayedDurationMs) && displayedDurationMs >= 300 && displayedDurationMs <= 120000, 'DEFAULT15_DURATION');
    seenDetails.add(key); observedSlowDetails.push({ ...registered[0], displayedDurationMs });
  }
  need(observedFiles.size === 2, 'DEFAULT15_EXACT_FILE_SET');
  return observedSlowDetails;
}
function timing(value, maximum, outputCap = null) {
  need(Number.isInteger(value?.timeoutMs) && value.timeoutMs > 0 && value.timeoutMs <= maximum
    && value.stopGraceMs === 1000 && Number.isFinite(value.elapsedMs) && value.elapsedMs >= 0
    && value.elapsedMs < value.timeoutMs, 'HISTORY_TIMING');
  if (outputCap !== null) need(value.maxOutputBytes === outputCap, 'HISTORY_OUTPUT_CAP');
}
function fullLifecycle(value, maximum, outputCap) {
  requireSuccessfulCommand(value, 'history-command');
  need(Number.isInteger(value.pid) && value.pid > 0 && value.signal === null && value.error === null
    && value.stopReason === null && value.killError === null && value.timedOut === false
    && value.outputTruncated === false && value.graceExpired === false, 'HISTORY_RAW_STATUS');
  cleanup(value);
  timing(value, maximum, outputCap);
}
function nodeCorpus(text, names) {
  const lines = cleanText(text).split('\n').map(line => line.trim());
  need(lines.filter(line => /^TAP version /.test(line)).join() === 'TAP version 13', 'NODE_TAP_VERSION');
  need(lines.filter(line => /^\d+\.\./.test(line)).join() === '1..29', 'NODE_PLAN');
  for (const [key, count] of Object.entries({ tests: 29, suites: 0, pass: 29, fail: 0, cancelled: 0, skipped: 0, todo: 0 })) {
    need(isDeepStrictEqual(lines.filter(line => line.startsWith('# ' + key + ' ')), ['# ' + key + ' ' + count]), 'NODE_COUNTS:' + key);
  }
  need(isDeepStrictEqual(lines.filter(line => line.startsWith('# Subtest: ')), names.map(name => '# Subtest: ' + name)), 'NODE_SUBTEST_SET');
  need(isDeepStrictEqual(lines.filter(line => /^(?:not )?ok\b/.test(line)), names.map((name, index) => 'ok ' + (index + 1) + ' - ' + name)), 'NODE_RESULT_SET');
}
export function validateHistory(result, names, nodePath) {
  fullLifecycle(result, 300000, 16 * 1024 * 1024);
  const text = result.stdout + '\n' + result.stderr;
  corpus(text, names.outer, 2);
  const old15 = jsonEvidence(text, 'exact84fHistoricalReplayEvidence');
  fullLifecycle(old15, 120000, 8 * 1024 * 1024);
  need(old15.commit === OLD_BASE && old15.tree === OLD_TREE && old15.pathCount === 517
    && old15.historicalOnly === true && old15.postCheckoutChmodPerformed === false
    && old15.dependencyLayout === 'external-reference-focused-only'
    && old15.releaseEligible === false && old15.historicalApprovalTransferred === false
    && isDeepStrictEqual(old15.counts, { oldAdmissionTests: 10, oldCurrentRootTests: 5, nestedV02Tests: 5, nestedV01Tests: 20, nodeTests: 29 }), 'OLD15_PROVENANCE');
  need(isDeepStrictEqual(old15.command, [nodePath, 'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts', ...HISTORY_FILES.slice(0, 2), '--reporter=default']), 'OLD15_COMMAND');
  const oldText = old15.stdout + '\n' + old15.stderr;
  const observedSlowDetails = default15Corpus(oldText, names.old15);
  const v02 = jsonEvidence(oldText, 'historicalReplayEvidence');
  fullLifecycle(v02, 120000, 8 * 1024 * 1024);
  need(v02.historicalBase === '307e6d723086fe41b6d89e9f9b4b532364ccaeff'
    && v02.reconstructedMainFiles === 449 && v02.reconstructedImports === 41
    && v02.historicalOnly === true, 'V02_PROVENANCE');
  need(isDeepStrictEqual(v02.command, [nodePath, 'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts', HISTORY_FILES[2], '--reporter=verbose']), 'V02_COMMAND');
  const middleText = v02.stdout + '\n' + v02.stderr;
  corpus(middleText, names.v02, 1);
  const v01 = jsonEvidence(middleText, 'historicalReplayEvidence');
  need(v01.exitCode === 0 && v01.historicalOnly === true
    && v01.reconstructedMainFiles === 449 && v01.reconstructedHistoricalFiles === 11, 'V01_PROVENANCE');
  cleanup(v01.lifecycle);
  timing(v01.lifecycle, 120000);
  need(isDeepStrictEqual(v01.command, [nodePath, 'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts', HISTORY_FILES[3], '--reporter=verbose']), 'V01_COMMAND');
  corpus(v01.stdout + '\n' + v01.stderr, names.v01, 1);
  const checkout = jsonEvidence(oldText, 'gitCheckoutEvidence');
  need(checkout.treeOid === OLD_TREE && checkout.admission?.candidateTreeIdentity?.gitTreeOid === OLD_TREE
    && checkout.admission?.candidateTreeIdentity?.pathCount === 517
    && checkout.admission?.status === 'pass-portable-source-admission'
    && checkout.admission?.releaseEligible === false && checkout.approvedReleaseCommit === false
    && checkout.postCheckoutChmodPerformed === false
    && checkout.dependencyLayout === 'external-reference-focused-only', 'NODE_CHECKOUT_PROVENANCE');
  need(isDeepStrictEqual(checkout.command, [nodePath, '--test', '--test-reporter=tap', HISTORY_FILES[4]]), 'NODE_COMMAND');
  fullLifecycle(checkout.node, 120000, 16 * 1024 * 1024);
  nodeCorpus(checkout.node.stdout + '\n' + checkout.node.stderr, names.node);
  return {
    outer: 17, old15: 15, v02: 5, v01: 20, node: 29,
    default15Observation: { completeIndividualNameCorpusClaimed: false,
      individualNameObservationPolicy: 'optional-slow-details-only', observedSlowDetails, staticRegistrations: names.old15,
      observedFiles: [{ file: HISTORY_FILES[0], tests: 10 }, { file: HISTORY_FILES[1], tests: 5 }],
      preparationBudgetMs: 120000, childMaximumMs: 120000, enclosingTestTimeoutMs: 130000,
      sharedInner120000DeadlineClaimed: false },
    containmentScope: 'recorded-original-process-groups', fullDescendantContainmentVerified: false,
    innerObservation: 'The v0.2 helper emits only exitCode and a lifecycle subset for its v0.1 child. Omitted PID/truncation/raw status remain unobserved; constraints derive from the pinned requireSuccessfulCommand success path.',
    ...flags(),
  };
}

// Portable policy is not a local executable or full dependency byte attestation.
export function validateRuntimeObservation(observed, policy) {
  need(observed && isDeepStrictEqual(Object.keys(observed).sort(), ['arch', 'path', 'platform', 'sha256', 'version']), 'RUNTIME_OBSERVATION');
  need(observed.version === policy.node.version, 'NODE_VERSION');
  need(typeof observed.path === 'string' && path.isAbsolute(observed.path)
    && /^[a-f0-9]{64}$/.test(observed.sha256) && typeof observed.platform === 'string'
    && typeof observed.arch === 'string', 'RUNTIME_OBSERVATION');
  return { runtimeObserved: true, crossPlatformByteEquivalence: false, ...flags() };
}
export function observeRuntime(root, policy, budget) {
  budget.assertRemaining();
  const executable = realpathSync(process.execPath);
  const runtime = { version: process.versions.node, path: executable,
    sha256: hash(regularBytes(executable)), platform: process.platform, arch: process.arch };
  validateRuntimeObservation(runtime, policy);
  for (const record of policy.dependencies) {
    budget.assertRemaining();
    need(isDeepStrictEqual(identity(root, record.path), record), 'DEPENDENCY_IDENTITY');
  }
  const locked = parseJsonRejectDuplicateKeys(regularBytes(path.join(root, 'package-lock.json')), 'dependency lock');
  const installedPath = realpathSync(path.join(root, 'node_modules/.package-lock.json'));
  const installedBytes = regularBytes(installedPath);
  const installed = parseJsonRejectDuplicateKeys(installedBytes, 'installed metadata');
  const tools = ['vitest', 'vite', 'ajv'].map(name => {
    budget.assertRemaining();
    const relative = 'node_modules/' + name;
    const filename = realpathSync(path.join(root, relative, 'package.json'));
    const bytes = regularBytes(filename);
    const metadata = parseJsonRejectDuplicateKeys(bytes, 'installed tool metadata');
    need(typeof locked.packages?.[relative]?.version === 'string'
      && metadata.version === locked.packages[relative].version
      && installed.packages?.[relative]?.version === metadata.version, 'INSTALLED_TOOL_VERSION:' + name);
    return { name, version: metadata.version, path: filename, sizeBytes: bytes.length, sha256: hash(bytes) };
  });
  budget.assertRemaining();
  return { ...runtime, installedMetadata: { path: installedPath, sizeBytes: installedBytes.length, sha256: hash(installedBytes) },
    tools, dependencyByteClosureVerified: false, localExternalPinAuthenticated: false, ...flags() };
}

// A caller may tighten, but never replace or extend, the fixed acceptance cap.
// The deadline is in this process's performance.now() coordinate system.
export function createHistoryBudget(deadlineMs = undefined) {
  need(deadlineMs === undefined || (typeof deadlineMs === 'number' && Number.isFinite(deadlineMs)), 'HISTORY_DEADLINE_INVALID');
  const internal = createExecutionBudget(300000);
  const externalRemaining = () => {
    if (deadlineMs === undefined) return Infinity;
    const remaining = deadlineMs - performance.now();
    need(Number.isFinite(remaining) && remaining > 0, 'HISTORY_DEADLINE_EXCEEDED');
    return remaining;
  };
  const assertRemaining = () => { internal.assertRemaining(); externalRemaining(); };
  const remainingMs = () => Math.max(1, Math.floor(Math.min(internal.remainingMs(), externalRemaining())));
  assertRemaining();
  return { elapsedMs: internal.elapsedMs, assertRemaining, remainingMs };
}

// Filesystem evidence is retained in both paths; only process cleanup is required.
// A persisted observation is never a terminal success or an execution authority.
export async function replayHistory(root, evidenceParent = tmpdir(), deadlineMs = undefined) {
  const budget = createHistoryBudget(deadlineMs);
  let directory = null; let checkout = null; let child = null; let phase = 'create-evidence';
  try {
    directory = realpathSync(mkdtempSync(path.join(evidenceParent, 'r18b-history-')));
    checkout = path.join(directory, 'checkout');
    budget.assertRemaining();
    const policy = readPolicy(root, budget);
    const runtime = observeRuntime(root, policy, budget);
    const names = historicalNames(root, budget);
    baseRecords(root, budget);
    phase = 'materialize';
    git(root, ['clone', '--quiet', '--shared', '--no-checkout', '--no-hardlinks', '--', root, checkout], budget.remainingMs());
    git(checkout, ['-c', 'core.autocrlf=false', 'checkout', '--quiet', '--detach', BASE], budget.remainingMs());
    const historical = baseRecords(checkout, budget);
    verifyMaterialized(checkout, historical, budget);
    budget.assertRemaining();
    symlinkSync(realpathSync(path.join(root, 'node_modules')), path.join(checkout, 'node_modules'), 'dir');
    const command = [process.execPath, 'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts', ...COMPATIBILITY_FILES, '--reporter=verbose'];
    const start = { command, base: BASE, tree: TREE, runtime, terminalSuccess: false, ...flags() };
    writeFileSync(path.join(directory, 'start.json'), JSON.stringify(start), { flag: 'wx' });
    budget.assertRemaining();
    phase = 'child';
    child = await runBoundedCommand(command, { cwd: checkout, env: { PATH: path.dirname(process.execPath) + ':/usr/bin:/bin', LANG: 'C', LC_ALL: 'C', NO_COLOR: '1' }, timeoutMs: budget.remainingMs(), maxOutputBytes: 16 * 1024 * 1024 });
    phase = 'persist-logs';
    // Preserve returned text even on failure; this is not original raw buffers.
    writeFileSync(path.join(directory, 'stdout.log'), child.stdout, { flag: 'wx' });
    writeFileSync(path.join(directory, 'stderr.log'), child.stderr, { flag: 'wx' });
    budget.assertRemaining();
    phase = 'validate';
    const corpusResult = validateHistory(child, names, process.execPath);
    budget.assertRemaining();
    phase = 'persist-observations';
    const observations = {
      status: 'history-observations-complete', terminalSuccess: false, corpus: corpusResult,
      child: { ...child, stdout: undefined, stderr: undefined }, runtime,
      logEncoding: 'UTF-8 text returned by the pinned bounded helper; original raw buffers unavailable',
      logs: ['stdout', 'stderr'].map(stream => ({ path: stream + '.log',
        sizeBytes: Buffer.byteLength(child[stream], 'utf8'), sha256: hash(Buffer.from(child[stream], 'utf8')) })),
      ownCheckoutRetained: existsSync(checkout), filesystemEvidenceDisposalPerformed: false,
      elapsedMsBeforeFinalPersistence: budget.elapsedMs(), ...flags(),
    };
    need(observations.ownCheckoutRetained, 'OWN_CHECKOUT_MISSING');
    writeFileSync(path.join(directory, 'observations.json'), JSON.stringify(observations), { flag: 'wx' });
    phase = 'final-budget';
    budget.assertRemaining();
    return { ...observations, status: 'pass-history', terminalSuccess: true,
      elapsedMs: budget.elapsedMs(), directory, terminalAuthority: 'Returned result only; an external caller must bind actual completion and frozen inputs.' };
  } catch (error) {
    const failure = {
      status: 'fail-stop', reason: String(error.message ?? error), phase, directory,
      ownCheckoutRetained: checkout !== null && existsSync(checkout),
      child: child ? { ...child, stdout: undefined, stderr: undefined } : null,
      elapsedMs: budget.elapsedMs(), noRetry: true, terminalSuccess: false,
      fullDescendantContainmentVerified: false, innerTemporaryPreservationGuaranteed: false, ...flags(),
    };
    try {
      need(directory !== null, 'EVIDENCE_DIRECTORY_NOT_CREATED');
      writeFileSync(path.join(directory, 'failure.json'), JSON.stringify(failure), { flag: 'wx' });
    } catch (persistenceError) {
      failure.failureEvidencePersisted = false;
      failure.persistenceReason = String(persistenceError.message ?? persistenceError);
    }
    throw Object.assign(new Error('HISTORY_FAIL_STOP:' + failure.reason), { evidence: failure });
  }
}
