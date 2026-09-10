import { describe, it, expect } from 'vitest';
import { DefaultReporter } from 'vitest/node';
import { readFileSync, mkdtempSync, writeFileSync, symlinkSync, linkSync, rmSync, mkdirSync, copyFileSync, chmodSync, unlinkSync, realpathSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import path from 'node:path';
import { tmpdir } from 'node:os';
import Ajv2020 from 'ajv/dist/2020.js';
import { parseJsonRejectDuplicateKeys } from '../atomistic/runtime-input-contract.mjs';
import { runBoundedCommand } from '../mesoscale/pfhub7a_r18a_current_root.mjs';
import { BASE, TREE, OLD_BASE, OLD_TREE, COMPATIBILITY_FILES, REVIEW, LEDGER, CHECKER, SCHEMA, HISTORY_FILES, hash, identity, verifyMaterialized, readPolicy, validateDependencyInputs, baseRecords, verifySource, validateRecords, validateManifest, historicalNames, validateHistory, replayHistory, createHistoryBudget, flags, validateRuntimeObservation, observeRuntime } from './verify-r18b-origin-main-admission-v0.1.mjs';
import { R12_EXCLUDED_PATHS } from './verify-r18a-origin-main-admission.mjs';
import { selectProjectSourceFiles } from '../source-scope.mjs';
import { DERIVED_REPORT_PATHS } from '../derived-report-contract.mjs';
import { verifyAdmissionAtRoot as verifyLegacyAdmission } from './verify-r18a-wrangler-admission-v0.4.mjs';

const root = process.cwd();
const SOURCE_FIXTURE_WATCHDOG_MS = 60_000;
const record = (relative, sha = 'a'.repeat(64)) => ({ path: relative, mode: 0o644, size: 1, sha256: sha });
const policy = { inputs: [record('new.json')], controls: [LEDGER, CHECKER, REVIEW] };
const baseline = [record('old.json'), ...policy.inputs, record(LEDGER), record(CHECKER)];
const check = records => validateRecords(records, [record('old.json')], policy, ['f'.repeat(64)]);
const goodLife = () => ({ cleanupConfirmed: true, cleanup: { directChildExitObserved: true, pipesClosed: true, processGroupAbsent: true } });
const successful = (stdout = '', cap = 16 * 1024 * 1024) => ({ pid: 123, status: 0, signal: null, error: null, stopReason: null, timedOut: false, outputTruncated: false, killError: null, graceExpired: false, ...goodLife(), timeoutMs: 120000, elapsedMs: 1, stopGraceMs: 1000, maxOutputBytes: cap, stdout, stderr: '' });

function historyFixture(names) {
  const verbose = (list, files) => list.map(item => ' ✓ ' + item.file + ' > ' + item.suite + ' > ' + item.name + ' 1ms').join('\n')
    + '\nTest Files ' + files + ' passed (' + files + ')\nTests ' + list.length + ' passed (' + list.length + ')';
  const vitest = file => [process.execPath, 'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts', file, '--reporter=verbose'];
  const inner = { command: vitest(HISTORY_FILES[3]), exitCode: 0, historicalOnly: true, reconstructedMainFiles: 449, reconstructedHistoricalFiles: 11,
    lifecycle: { ...goodLife(), stopGraceMs: 1000, timeoutMs: 120000, elapsedMs: 1 }, stdout: verbose(names.v01, 1), stderr: '' };
  const middle = { ...successful(verbose(names.v02, 1), 8 * 1024 * 1024), command: vitest(HISTORY_FILES[2]),
    historicalBase: '307e6d723086fe41b6d89e9f9b4b532364ccaeff', reconstructedMainFiles: 449, reconstructedImports: 41, historicalOnly: true };
  const node = successful('TAP version 13\n' + names.node.map((name, i) => '# Subtest: ' + name + '\nok ' + (i + 1) + ' - ' + name).join('\n')
    + '\n1..29\n# tests 29\n# suites 0\n# pass 29\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0');
  const checkout = { command: [process.execPath, '--test', '--test-reporter=tap', HISTORY_FILES[4]], node, treeOid: OLD_TREE,
    admission: { status: 'pass-portable-source-admission', releaseEligible: false, candidateTreeIdentity: { gitTreeOid: OLD_TREE, pathCount: 517 } },
    approvedReleaseCommit: false, postCheckoutChmodPerformed: false, dependencyLayout: 'external-reference-focused-only' };
  const outer = successful(verbose(names.outer, 2));
  const old15 = { ...successful(' ✓ ' + HISTORY_FILES[0] + ' (10 tests) 1ms\n ✓ ' + HISTORY_FILES[1] + ' (5 tests) 1ms\nTest Files 2 passed (2)\nTests 15 passed (15)', 8 * 1024 * 1024),
    command: [process.execPath, 'node_modules/vitest/vitest.mjs', 'run', '--config', 'vitest.config.ts', ...HISTORY_FILES.slice(0, 2), '--reporter=default'],
    commit: OLD_BASE, tree: OLD_TREE, pathCount: 517, historicalOnly: true, postCheckoutChmodPerformed: false,
    dependencyLayout: 'external-reference-focused-only', releaseEligible: false, historicalApprovalTransferred: false,
    counts: { oldAdmissionTests: 10, oldCurrentRootTests: 5, nestedV02Tests: 5, nestedV01Tests: 20, nodeTests: 29 } };
  return { inner, middle, checkout, outer, old15 };
}
function encodeHistory(fixture) {
  const middle = { ...fixture.middle, stdout: fixture.middle.stdout + '\n' + JSON.stringify({ historicalReplayEvidence: fixture.inner }) };
  const old15 = { ...fixture.old15, stdout: fixture.old15.stdout + '\n' + JSON.stringify({ historicalReplayEvidence: middle })
    + '\n' + JSON.stringify({ gitCheckoutEvidence: fixture.checkout }) };
  return { ...fixture.outer, stdout: fixture.outer.stdout + '\n' + JSON.stringify({ exact84fHistoricalReplayEvidence: old15 }) };
}

// Actual installed reporter methods, inert tasks only: no collection or history.
function renderedDefault15(names, durations = new Map(), order = HISTORY_FILES.slice(0, 2)) {
  const lines = []; const reporter = new DefaultReporter({ isTTY: false, summary: false });
  reporter.ctx = { config: { slowTestThreshold: 300, hideSkippedTests: false }, logger: { log: line => lines.push(line) } };
  for (const file of order) {
    const fileTask = { name: file, filepath: '/inert/' + file, result: { state: 'pass', duration: 900 } };
    const suiteTask = { name: names.old15.find(item => item.file === file).suite, suite: fileTask };
    const children = names.old15.filter(item => item.file === file).map(item => {
      const duration = durations.get(item.name) ?? 1;
      return { type: 'test', task: { name: item.name, suite: suiteTask, file: fileTask, result: { state: 'pass', duration } },
        options: {}, result: () => ({ state: 'passed' }), diagnostic: () => ({ duration }) };
    });
    reporter.printTestModule({ task: fileTask, project: { name: '' }, state: () => 'passed', meta: () => ({}), diagnostic: () => ({}),
      children: [{ type: 'suite', task: suiteTask, state: () => 'passed', children }] });
  }
  return lines.join('\n').replace(/\x1b\[[0-9;]*m/g, '') + '\n Test Files  2 passed (2)\n      Tests  15 passed (15)';
}

describe('R18b no-history synthetic/unit checks', () => {
  it('A01 fixed git base and actual unapproved source consistency', () => {
    expect(BASE).toBe('dc6e7f1af19f5398eb03b94d8ffaee2182d07f55'); expect(TREE).toBe('5522f1ee4eb9a3cf83176afeb874e504c11347d0');
    expect(baseRecords(root)).toHaveLength(527);
    const result = verifySource(root);
    expect(result).toMatchObject({ status: 'source-consistent', ...flags() });
    expect(['absent', 'present-unvalidated']).toContain(result.reviewState);
    expect(result.failures).toEqual([]);
  });
  it('A02 exact inventory and filesystem type boundaries', () => {
    expect(check(baseline)).toEqual([]);
    for (const bad of [baseline.slice(1), [...baseline, baseline[0]], [...baseline, record('unexpected')], baseline.map((r, i) => i ? r : { ...r, mode: 0o755 }), baseline.map((r, i) => i ? r : { ...r, size: 2 }), baseline.map((r, i) => i ? r : { ...r, sha256: 'b'.repeat(64) }), [...baseline, record('../unsafe')]]) expect(check(bad).length).toBeGreaterThan(0);
    const temporary = mkdtempSync(path.join(tmpdir(), 'r18b-unit-files-'));
    try { writeFileSync(path.join(temporary, 'file'), 'x'); symlinkSync('file', path.join(temporary, 'sym')); expect(() => identity(temporary, 'sym')).toThrow(); linkSync(path.join(temporary, 'file'), path.join(temporary, 'hard')); expect(() => identity(temporary, 'file')).toThrow(); } finally { rmSync(temporary, { recursive: true, force: true }); }
  });
  it('A03 renamed forbidden digest also rejects control and derived placement', () => {
    for (const name of ['renamed', REVIEW, 'evaluation/latest-report.json']) expect(check([...baseline, record(name, 'f'.repeat(64))]).join('\n')).toContain('R12-excluded');
  });
  it('A04 strict ledger schema and unauthenticated manifests', () => {
    const ledger = readPolicy(root); const schema = JSON.parse(readFileSync(path.join(root, SCHEMA)));
    const validate = new Ajv2020({ strict: true }).compile(schema);
    expect(validate(ledger)).toBe(true);
    for (const mutation of [value => { value.approved = true; }, value => { value.baseCommit = '0'.repeat(40); }, value => { value.controls.push('extra'); }]) { const copy = structuredClone(ledger); mutation(copy); expect(validate(copy)).toBe(false); }
    expect(() => parseJsonRejectDuplicateKeys(Buffer.from('{"files":[],"files":[]}'), 'synthetic')).toThrow();
    expect(() => validateManifest([...baseline, record(REVIEW)], { files: [...baseline, record(REVIEW)], approved: true })).toThrow('MANIFEST_SHAPE');
  });
  it('A05 final review required only for full manifest and all flags remain false', () => {
    expect(() => validateManifest(baseline, { files: baseline })).toThrow('FINAL_REVIEW_REQUIRED');
    const records = [...baseline, record(REVIEW)];
    expect(validateManifest(records, { files: records })).toMatchObject(flags());
    expect(() => validateManifest(records, { files: [...records, records[0]] })).toThrow('MANIFEST_DUPLICATE');
    expect(() => validateManifest(records, { files: records.slice(1) })).toThrow('MANIFEST_DRIFT');
  });
  it('snapshot overlays and the historical final review remain exact inputs, not exemptions', () => {
    const ledger = readPolicy(root);
    const base = baseRecords(root);
    const current = verifySource(root);
    const paths = [
      'package.json',
      'package-lock.json',
      'lib/simulation/atomistic-private-oxygen-minimum-distance-v048.ts',
      'lib/simulation/atomistic-private-oxygen-minimum-distance-v048.test.ts',
      'lib/simulation/atomistic-private-position-trajectory-v048.ts',
      'lib/simulation/atomistic-private-position-trajectory-v048.test.ts',
      'lib/simulation/atomistic-private-position-trajectory-v048.test-fixture.ts',
      'lib/simulation/atomistic-private-position-trajectory-v048.fixture-hash.test.ts',
      'lib/simulation/atomistic-world-session.ts',
      'lib/simulation/atomistic-world-session.test.ts',
      'evaluation/reviews/2026-09-08-r18b-source-admission-v0.1-final-review.json',
    ];
    expect(ledger.inputs).toHaveLength(45);
    expect(current.status).toBe('source-consistent');
    expect(current.failures).toEqual([]);
    expect(REVIEW).toBe('evaluation/reviews/2026-09-10-custom-ar-branch-comparison-v01-review.json');
    for (const relative of paths) {
      expect(ledger.inputs.filter(row => row.path === relative)).toEqual([identity(root, relative)]);
      expect(validateRecords(current.records.filter(row => row.path !== relative), base, ledger, []).join('\n')).toContain('missing-source:' + relative);
      const changed = current.records.map(row => row.path === relative ? { ...row, sha256: '0'.repeat(64) } : row);
      expect(validateRecords(changed, base, ledger, []).join('\n')).toContain('source-identity:' + relative);
      const unregistered = { ...ledger, inputs: ledger.inputs.filter(row => row.path !== relative) };
      expect(validateRecords(current.records, base, unregistered, []).join('\n')).toContain(
        (base.some(row => row.path === relative) ? 'source-identity:' : 'unaccounted-source:') + relative,
      );
    }
    const withoutSuccessor = current.records.filter(row => row.path !== REVIEW);
    expect(() => validateManifest(withoutSuccessor, { files: withoutSuccessor })).toThrow('FINAL_REVIEW_REQUIRED');
    expect(current).toMatchObject(flags());
  });
  it('dependency policy production validation rejects missing duplicate and disagreeing exact inputs', () => {
    const ledger = readPolicy(root);
    expect(() => validateDependencyInputs(ledger)).not.toThrow();
    for (const mutate of [
      value => { value.dependencies.pop(); },
      value => { value.dependencies[1] = structuredClone(value.dependencies[0]); },
      value => { value.dependencies[1].path = 'other.json'; },
    ]) {
      const value = structuredClone(ledger); mutate(value);
      expect(() => validateDependencyInputs(value)).toThrow('DEPENDENCY_PATH_SET');
    }
    for (const dependency of ledger.dependencies) {
      for (const mutate of [
        value => { value.inputs = value.inputs.filter(row => row.path !== dependency.path); },
        value => { value.inputs.push(structuredClone(dependency)); },
        value => { value.dependencies.find(row => row.path === dependency.path).sha256 = '0'.repeat(64); },
        value => { value.inputs.find(row => row.path === dependency.path).size += 1; },
        value => { value.inputs.find(row => row.path === dependency.path).mode = 0o755; },
      ]) {
        const value = structuredClone(ledger); mutate(value);
        expect(() => validateDependencyInputs(value)).toThrow('DEPENDENCY_INPUT_IDENTITY:' + dependency.path);
      }
    }
  });
  it('A06 exact layered corpus rejects every known malformed envelope', () => {
    const names = historicalNames(root);
    expect([names.outer.length, names.old15.length, names.v02.length, names.v01.length, names.node.length]).toEqual([17, 15, 5, 20, 29]);
    const original = historyFixture(names);
    expect(validateHistory(encodeHistory(original), names, process.execPath)).toMatchObject({ outer: 17, old15: 15, v02: 5, v01: 20, node: 29, fullDescendantContainmentVerified: false });
    const cases = [];
    for (const [field, tuples] of [['outer', names.outer], ['middle', names.v02], ['inner', names.v01]]) {
      cases.push(
        [field + '-suffix', value => { value[field].stdout = value[field].stdout.replace(tuples[0].name, tuples[0].name + ' WRONG'); }],
        [field + '-file-suite', value => { value[field].stdout = value[field].stdout.replace(tuples[0].file + ' > ' + tuples[0].suite, 'wrong.mjs > wrong suite'); }],
        [field + '-missing', value => { value[field].stdout = value[field].stdout.replace(tuples[0].name, 'wrong name'); }],
        [field + '-duplicate', value => { value[field].stdout += '\n ✓ ' + tuples[0].file + ' > ' + tuples[0].suite + ' > ' + tuples[0].name; }],
        [field + '-nonpass', value => { value[field].stdout = value[field].stdout.replace('✓', '×'); }],
      );
    }
    cases.push(
      ['extra-outer', value => { value.outer.stdout += '\n ✓ unknown.mjs > unknown suite > unregistered test'; }],
      ['summary-duplicate', value => { value.outer.stdout += '\nTests 17 passed (17)'; }],
      ['summary-skip', value => { value.outer.stdout = value.outer.stdout.replace('17 passed (17)', '17 passed | 1 skipped (18)'); }],
      ['node-not-ok', value => { value.checkout.node.stdout = value.checkout.node.stdout.replace('\nok 1 -', '\nnot ok 1 -'); }],
      ['node-extra-subtest', value => { value.checkout.node.stdout += '\n# Subtest: unregistered'; }],
      ['node-extra-result', value => { value.checkout.node.stdout += '\nok 30 - unregistered'; }],
      ['node-plan', value => { value.checkout.node.stdout = value.checkout.node.stdout.replace('1..29', '1..30'); }],
      ['node-plan-duplicate', value => { value.checkout.node.stdout += '\n1..29'; }],
      ['node-contradictory-summary', value => { value.checkout.node.stdout += '\n# fail 1'; }],
      ['middle-base', value => { value.middle.historicalBase = '0'.repeat(40); }],
      ['middle-count', value => { value.middle.reconstructedMainFiles = 0; }],
      ['middle-timing-absent', value => { delete value.middle.timeoutMs; }],
      ['middle-time-negative', value => { value.middle.elapsedMs = -1; }],
      ['middle-time-late', value => { value.middle.elapsedMs = 120001; }],
      ['middle-grace', value => { value.middle.graceExpired = true; }],
      ['middle-cap', value => { value.middle.maxOutputBytes *= 2; }],
      ['inner-count', value => { value.inner.reconstructedHistoricalFiles = 0; }],
      ['inner-command', value => { value.inner.command[4] = 'wrong-config'; }],
      ['inner-cleanup', value => { value.inner.lifecycle.cleanup.pipesClosed = false; }],
      ['node-tree', value => { value.checkout.treeOid = '0'.repeat(40); }],
      ['outer-nonzero', value => { value.outer.status = 1; }],
      ['outer-truncated', value => { value.outer.outputTruncated = true; }],
      ['outer-cleanup', value => { value.outer.cleanupConfirmed = false; }],
      ['encoding', value => { value.outer.stdout += '\ufffd'; }],
    );
    for (const [id, mutate] of cases) {
      const fixture = structuredClone(original);
      mutate(fixture);
      expect(fixture, id).not.toEqual(original);
      expect(() => validateHistory(encodeHistory(fixture), names, process.execPath), id).toThrow();
    }
    console.log(JSON.stringify({ syntheticHistoryControls: { positive: 1, negative: cases.length, testIds: cases.map(([id]) => id), realHistoricalRuns: 0 } }));
  });
  it('R03 default15 observation has an exact wrapper and no invented individual names', () => {
    const names = historicalNames(root); const original = historyFixture(names);
    const passed = validateHistory(encodeHistory(original), names, process.execPath);
    expect(passed.default15Observation).toMatchObject({ completeIndividualNameCorpusClaimed: false, observedSlowDetails: [], staticRegistrations: names.old15, sharedInner120000DeadlineClaimed: false });
    const cases = [
      ['new-base-in-old-wrapper', f => { f.old15.commit = BASE; }],
      ['new-tree-in-old-wrapper', f => { f.old15.tree = TREE; }],
      ['new-tree-in-node', f => { f.checkout.treeOid = TREE; }],
      ['wrapper-path-count', f => { f.old15.pathCount = 527; }],
      ['wrapper-counts', f => { f.old15.counts.oldAdmissionTests = 0; }],
      ['wrapper-claim', f => { f.old15.releaseEligible = true; }],
      ['wrapper-transfer', f => { f.old15.historicalApprovalTransferred = true; }],
      ['wrapper-history', f => { f.old15.historicalOnly = false; }],
      ['wrapper-chmod', f => { f.old15.postCheckoutChmodPerformed = true; }],
      ['wrapper-dependency', f => { f.old15.dependencyLayout = 'claimed-complete'; }],
      ['wrapper-command', f => { f.old15.command[5] = COMPATIBILITY_FILES[0]; }],
      ['wrapper-reporter', f => { f.old15.command[f.old15.command.length - 1] = '--reporter=verbose'; }],
      ['wrapper-cap', f => { f.old15.maxOutputBytes *= 2; }],
      ['wrapper-timing', f => { f.old15.timeoutMs = 120001; }],
      ['wrapper-elapsed', f => { f.old15.elapsedMs = -1; }],
      ['wrapper-cleanup', f => { f.old15.cleanup.pipesClosed = false; }],
      ['wrapper-raw', f => { delete f.old15.pid; }],
      ['default-file-duplicate', f => { f.old15.stdout += '\n ✓ ' + HISTORY_FILES[0] + ' (10 tests)'; }],
      ['default-file-unknown', f => { f.old15.stdout = f.old15.stdout.replace(HISTORY_FILES[0], 'unknown.mjs'); }],
      ['default-file-count', f => { f.old15.stdout = f.old15.stdout.replace('(10 tests)', '(11 tests)'); }],
      ['default-nonpass', f => { f.old15.stdout = f.old15.stdout.replace('✓', '×'); }],
      ['default-skip', f => { f.old15.stdout = f.old15.stdout.replace('✓', '↓'); }],
      ['default-todo', f => { f.old15.stdout = f.old15.stdout.replace('(5 tests)', '(5 tests | 1 todo)'); }],
      ['default-summary-duplicate', f => { f.old15.stdout += '\nTests 15 passed (15)'; }],
      ['default-file-summary-duplicate', f => { f.old15.stdout += '\nTest Files 2 passed (2)'; }],
      ['default-summary-contradiction', f => { f.old15.stdout = f.old15.stdout.replace('15 passed (15)', '14 passed | 1 failed (15)'); }],
      ['default-invented-name', f => { f.old15.stdout += '\n ✓ ' + names.old15[0].file + ' > ' + names.old15[0].suite + ' > ' + names.old15[0].name; }],
    ];
    for (const [id, mutate] of cases) { const f = structuredClone(original); mutate(f); expect(f, id).not.toEqual(original); expect(() => validateHistory(encodeHistory(f), names, process.execPath), id).toThrow(); }
    const raw = encodeHistory(original);
    for (const [id, altered] of [
      ['missing-wrapper', { ...raw, stdout: raw.stdout.replace('exact84fHistoricalReplayEvidence', 'unknownEvidence') }],
      ['malformed-wrapper', { ...raw, stdout: raw.stdout + '\n{"exact84fHistoricalReplayEvidence":' }],
      ['duplicate-wrapper', { ...raw, stdout: raw.stdout + '\n' + JSON.stringify({ exact84fHistoricalReplayEvidence: original.old15 }) }],
    ]) expect(() => validateHistory(altered, names, process.execPath), id).toThrow();
    console.log(JSON.stringify({ reconciliationDefaultReporterControls: { positive: 1, negatives: cases.length + 3, realHistoricalRuns: 0, completeIndividualNameCorpusClaimed: false } }));
  });
  it('R03 slow details use the installed renderer and preserve only observed short names', () => {
    const names = historicalNames(root); const first = names.old15[0]; const second = names.old15.find(item => item.file === HISTORY_FILES[1]);
    const controls = [
      ['fast-only', new Map(), HISTORY_FILES.slice(0, 2), []],
      ['partial-slow', new Map([[first.name, 601]]), HISTORY_FILES.slice(0, 2), [{ ...first, displayedDurationMs: 601 }]],
      ['both-file-contexts', new Map([[first.name, 601], [second.name, 750]]), HISTORY_FILES.slice(0, 2), [{ ...first, displayedDurationMs: 601 }, { ...second, displayedDurationMs: 750 }]],
      ['reversed-file-order', new Map([[first.name, 601], [second.name, 750]]), HISTORY_FILES.slice(0, 2).reverse(), [{ ...second, displayedDurationMs: 750 }, { ...first, displayedDurationMs: 601 }]],
      ['rounded-threshold', new Map([[first.name, 300.1]]), HISTORY_FILES.slice(0, 2), [{ ...first, displayedDurationMs: 300 }]],
    ];
    const checked = [];
    for (const [id, durations, order, expected] of controls) {
      const fixture = historyFixture(names); fixture.old15.stdout = renderedDefault15(names, durations, order);
      const observation = validateHistory(encodeHistory(fixture), names, process.execPath).default15Observation;
      expect(observation.observedSlowDetails, id).toEqual(expected);
      expect(observation.completeIndividualNameCorpusClaimed, id).toBe(false);
      expect(observation.staticRegistrations, id).toEqual(names.old15);
      checked.push({ id, observedSlowDetails: observation.observedSlowDetails });
    }
    const text = renderedDefault15(names, new Map([[first.name, 601]]));
    const detail = '     ✓ ' + first.name + '  601ms';
    expect(text).toContain(detail);
    const removed = text.replace('\n' + detail, '');
    const cases = [
      ['wrong-file', text.replace(first.name + '  601ms', second.name + '  601ms')],
      ['unknown-name', text.replace(first.name + '  601ms', 'unregistered  601ms')],
      ['duplicate-detail', text.replace(detail, detail + '\n' + detail)],
      ['orphan-detail', detail + '\n' + removed],
      ['late-detail', removed + '\n' + detail],
      ['between-summaries', removed.replace('      Tests', detail + '\n      Tests')],
      ['wrong-indent', text.replace(detail, detail.slice(2))],
      ['tab-indent', text.replace(detail, '\t' + detail.trimStart())],
      ['verbose-name', text.replace(first.name + '  601ms', first.file + ' > ' + first.suite + ' > ' + first.name + '  601ms')],
      ['failed-detail', text.replace(detail, detail.replace('✓', '×'))],
      ['skipped-detail', text.replace(detail, detail.replace('✓', '↓'))],
      ['todo-detail', text.replace(detail, detail.replace('✓', '-'))],
      ['below-threshold', text.replace('601ms', '299ms')],
      ['fractional-display', text.replace('601ms', '300.1ms')],
      ['negative-duration', text.replace('601ms', '-601ms')],
      ['missing-duration', text.replace('  601ms', '')],
      ['leading-zero', text.replace('601ms', '0601ms')],
      ['unsafe-integer', text.replace('601ms', '9007199254740992ms')],
      ['over-child-limit', text.replace('601ms', '120001ms')],
      ['retry-suffix', text.replace('601ms', '601ms (retry x1)')],
      ['repeat-suffix', text.replace('601ms', '601ms (repeat x1)')],
      ['heap-suffix', text.replace('601ms', '601ms 10 MB heap used')],
      ['single-duration-space', text.replace('  601ms', ' 601ms')],
      ['file-after-summary', text + '\n ✓ ' + HISTORY_FILES[0] + ' (10 tests) 900ms'],
      ['missing-file', text.replace(/^ ✓ .*\(5 tests\) 900ms\n/m, '')],
      ['early-summary', ' Test Files  2 passed (2)\n' + text.replace(' Test Files  2 passed (2)\n', '')],
    ];
    for (const [id, mutated] of cases) {
      expect(mutated, id).not.toBe(text);
      const fixture = historyFixture(names); fixture.old15.stdout = mutated;
      expect(() => validateHistory(encodeHistory(fixture), names, process.execPath), id).toThrow();
    }
    console.log(JSON.stringify({ installedDefaultReporterControls: { productionRenderer: 'vitest/node DefaultReporter.printTestModule', inertTasksOnly: true,
      positive: controls.length, checked, negative: cases.length, negativeTestIds: cases.map(([id]) => id), actualHistoricalRuns: 0 } }));
  });
  it('R04 valid legacy argv fails exact old admission before bootstrap or child work', async () => {
    const source = readFileSync(path.join(root, 'scripts/mesoscale/pfhub7a_r18a_current_root_v3.mjs'), 'utf8');
    const extract = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start))).replace(/^export /, '');
    const admission = extract('export function requireCurrentAdmission(', 'export function requireUnchangedCandidate(');
    const parse = extract('function parseArguments(', 'export function persistExecutionEvidence(');
    const run = extract('export async function runCurrentRoot(', '\nif (process.argv[1]');
    let admissions = 0; let laterWork = 0;
    const forbidden = () => { laterWork += 1; throw new Error('UNREACHABLE_LATER_WORK'); };
    const context = { ROOT: root, Error, Date, NUMERICAL_BUDGET_MS: 600000, STOP_GRACE_MS: 1000,
      INTEGRATION_BASE: OLD_BASE, SCIENTIFIC_CONTRACT_BASE: '307e6d723086fe41b6d89e9f9b4b532364ccaeff',
      requireCondition: (condition, reason) => { if (!condition) throw new Error(reason); },
      verifyAdmissionAtRoot: target => { admissions += 1; return verifyLegacyAdmission(target); },
      createExecutionBudget: () => ({ assertRemaining() {}, elapsedMs: () => 0 }),
      persistExecutionEvidence: (value, directory) => { expect(directory).toBeUndefined(); return value; },
      regularBytes: forbidden, verifyBootstrap: forbidden, verifyWheels: forbidden, mkdirSync: forbidden, mkdtempSync: forbidden, runBoundedCommand: forbidden,
    };
    const execute = runInNewContext(admission + '\n' + parse + '\n' + run + '\nrunCurrentRoot', context, { timeout: 1000 });
    const result = await execute(['--python-source', '/synthetic/never-read', '--wheelhouse', '/synthetic/never-read-wheels']);
    expect(result.status).toBe('abstain'); expect(result.reason).toContain('CURRENT_ADMISSION_FAILED:');
    expect(result.reason).toContain('unaccounted-source:'); expect(result.commands).toEqual([]);
    expect(admissions).toBe(1); expect(laterWork).toBe(0);
    expect(verifySource(root)).toMatchObject({ legacyNumericEntryScope: 'version-bound-history-only', newR18bNumericExecutionEnabled: false });
    const incomingPackage = execFileSync('/usr/bin/git', ['show', BASE + ':package.json'], { cwd: root });
    const currentPackage = JSON.parse(readFileSync(path.join(root, 'package.json')));
    expect(currentPackage.overrides).toEqual({ 'miniflare@5.20260826.0-alpha': { sharp: '0.35.4' } });
    const { overrides, ...unchangedPackage } = currentPackage;
    expect(Object.keys(overrides)).toEqual(['miniflare@5.20260826.0-alpha']);
    expect(unchangedPackage).toEqual(JSON.parse(incomingPackage));
    expect(JSON.parse(incomingPackage).scripts['r18a:validate']).toBe('node scripts/mesoscale/pfhub7a_r18a_current_root_v3.mjs');
    console.log(JSON.stringify({ legacyNumericBoundary: { legitimateArgv: true, observedAdmissionCalls: admissions, bootstrapOrChildCalls: laterWork, status: result.status, scope: 'exact-production inert orchestration plus actual read-only old admission; no numeric execution' } }));
  });
  it('A07 bounded synthetic child failures never claim successful cleanup beyond original group', async () => {
    // Invoke the actual pre-child materialization check with manufactured drift.
    const actual = identity(root, 'vitest.config.ts');
    expect(() => verifyMaterialized(root, [{ ...actual, sha256: '0'.repeat(64) }], { assertRemaining() {} })).toThrow('HISTORY_MATERIALIZATION');
    expect(() => verifyMaterialized(root, [actual], { assertRemaining() { throw new Error('SYNTHETIC_BUDGET_EXPIRED'); } })).toThrow('SYNTHETIC_BUDGET_EXPIRED');
    for (const [program, timeout, output] of [['process.exit(3)', 3000, 4096], ['setInterval(()=>{},1000)', 200, 4096], ['process.stdout.write("x".repeat(8192))', 3000, 64]]) {
      const result = await runBoundedCommand([process.execPath, '-e', program], { cwd: root, env: { PATH: '/usr/bin:/bin' }, timeoutMs: timeout, maxOutputBytes: output });
      expect(result.cleanupConfirmed).toBe(true);
      if (!result.cleanupConfirmed) throw new Error('FAIL_STOP_UNCERTAIN_SYNTHETIC_CHILD');
      expect(result.status !== 0 || result.timedOut || result.outputTruncated).toBe(true);
    }
  }, 15000);
  it('A08 default discovery changes only the two historical suites, no scientific dispatch', () => {
    const config = readFileSync(path.join(root, 'vitest.config.ts'), 'utf8');
    expect(config).toContain("'scripts/backend-migration/verify-r18a-origin-main-admission-v0.3.test.mjs'");
    expect(config).toContain("'scripts/mesoscale/pfhub7a_r18a_current_root_v2.test.mjs'");
    const incoming = execFileSync('/usr/bin/git', ['show', BASE + ':vitest.config.ts'], { cwd: root, encoding: 'utf8' });
    const selected = text => [...text.matchAll(/^\s+'([^']+)',?$/gm)].map(match => match[1]);
    expect(selected(config).filter(file => !selected(incoming).includes(file))).toEqual(COMPATIBILITY_FILES);
    const checkerText = readFileSync(path.join(root, CHECKER), 'utf8');
    expect(checkerText).not.toMatch(/python3|FiPy|pfhub7a_r18b_tiny_verify\.py/);
  });
  it('A09 derived outputs may regenerate but no review is exempt', () => {
    const records = [...baseline, record(REVIEW), record('evaluation/latest-report.json')];
    const manifest = { files: records.slice(0, -1) };
    expect(validateManifest(records, manifest).observedOutputs).toHaveLength(1);
    expect(validateManifest(records.slice(0, -1), manifest).status).toBe('matches-unauthenticated-manifest');
    expect(() => validateManifest(records.map(r => r.path === REVIEW ? { ...r, sha256: 'c'.repeat(64) } : r), manifest)).toThrow();
  });
  it('A10 exact record mode/byte identity never transfers approval', () => {
    const records = [...baseline, record(REVIEW)];
    expect(Object.values(flags()).every(value => value === false)).toBe(true);
    expect(() => validateManifest(records, { files: records.map(r => ({ ...r, mode: 0o444 })) })).toThrow();
  });
});

function inertHistory(scenario) {
  const source = readFileSync(path.join(root, CHECKER), 'utf8');
  const body = source.slice(source.indexOf('export async function replayHistory(')).replace(/^export /, '');
  const files = new Map(); let present = false; let elapsed = 0; let children = 0;
  const names = historicalNames(root);
  const original = encodeHistory(historyFixture(names));
  const budget = { remainingMs: () => 300000, elapsedMs: () => elapsed,
    assertRemaining() { if (elapsed >= 300000) throw new Error('SYNTHETIC_LATE_BUDGET'); } };
  const context = {
    path, Buffer, process: { execPath: process.execPath }, BASE, TREE, HISTORY_FILES, COMPATIBILITY_FILES, hash, flags,
    createHistoryBudget: () => budget, readPolicy: () => ({}), observeRuntime: () => ({ observedOnly: true }),
    historicalNames: () => names, baseRecords: () => [], validateHistory,
    need: (condition, reason) => { if (!condition) throw new Error(reason); },
    mkdtempSync: () => '/synthetic/owned-history', realpathSync: value => value,
    existsSync: () => present, symlinkSync() {},
    git(_root, args) { if (args[0] === 'clone') present = true; },
    verifyMaterialized() { if (scenario === 'materialization') throw new Error('SYNTHETIC_MATERIALIZATION'); },
    writeFileSync(filename, bytes) {
      if ((scenario === 'stdout-persistence' && filename.endsWith('/stdout.log'))
        || (scenario === 'observations-persistence' && filename.endsWith('/observations.json'))
        || (scenario === 'failure-persistence' && filename.endsWith('/failure.json'))) throw new Error('SYNTHETIC_WRITE_ERROR');
      files.set(filename, bytes);
      if (scenario === 'late-budget' && filename.endsWith('/observations.json')) elapsed = 300001;
    },
    async runBoundedCommand() {
      children += 1;
      const value = structuredClone(original);
      if (['cleanup-uncertain', 'failure-persistence'].includes(scenario)) value.cleanupConfirmed = false;
      return value;
    },
  };
  const run = runInNewContext(body + '\nreplayHistory', context, { timeout: 1000 });
  return { run: () => run('/synthetic/source', '/synthetic/evidence'),
    inspect: () => ({ files, present, children }) };
}

describe('R18b no-history synthetic/unit checks regression coverage', () => {
  it('D01-D05 an absolute caller deadline only tightens the fixed internal acceptance cap', async () => {
    for (const invalid of [null, NaN, Infinity, -Infinity, '300000', {}, () => 300000]) {
      expect(() => createHistoryBudget(invalid)).toThrow('HISTORY_DEADLINE_INVALID');
      await expect(replayHistory('/unused-source', '/unused-evidence', invalid)).rejects.toThrow('HISTORY_DEADLINE_INVALID');
    }
    expect(() => createHistoryBudget(performance.now() - 1)).toThrow('HISTORY_DEADLINE_EXCEEDED');
    const source = readFileSync(path.join(root, CHECKER), 'utf8');
    const body = source.slice(source.indexOf('export function createHistoryBudget('), source.indexOf('// Filesystem evidence is retained')).replace(/^export /, '');
    let now = 1000;
    const construct = runInNewContext(body + '\ncreateHistoryBudget', {
      performance: { now: () => now },
      need: (condition, reason) => { if (!condition) throw new Error(reason); },
      createExecutionBudget(limit) {
        expect(limit).toBe(300000);
        const began = now;
        const elapsedMs = () => now - began;
        const assertRemaining = () => { if (elapsedMs() >= limit) throw new Error('SYNTHETIC_INTERNAL_DEADLINE'); };
        return { elapsedMs, assertRemaining, remainingMs: () => { assertRemaining(); return Math.max(1, Math.floor(limit - elapsedMs())); } };
      },
    }, { timeout: 1000 });
    const defaultCap = construct(); const nearer = construct(1500); const farther = construct(900000);
    expect(defaultCap.remainingMs()).toBe(300000);
    expect(nearer.remainingMs()).toBe(500);
    expect(farther.remainingMs()).toBe(300000);
    now = 1499.5;
    expect(nearer.remainingMs()).toBe(1); nearer.assertRemaining();
    now = 1500;
    expect(() => nearer.remainingMs()).toThrow('HISTORY_DEADLINE_EXCEEDED');
    expect(() => nearer.assertRemaining()).toThrow('HISTORY_DEADLINE_EXCEEDED');
    expect(() => construct(now)).toThrow('HISTORY_DEADLINE_EXCEEDED');
    now = 301000;
    for (const budget of [defaultCap, farther]) {
      expect(() => budget.remainingMs()).toThrow('SYNTHETIC_INTERNAL_DEADLINE');
      expect(() => budget.assertRemaining()).toThrow('SYNTHETIC_INTERNAL_DEADLINE');
    }
    console.log(JSON.stringify({ sharedDeadlineControls: { ids: ['D01', 'D02', 'D03', 'D04', 'D05'], invalidValues: 7, realHistoricalRuns: 0 } }));
  });

  it('portable runtime observations do not turn host paths or platform hashes into approval', () => {
    const policy = { node: { version: '24.16.0' } };
    for (const [filename, platform, arch] of [['/opt/hostedtoolcache/node/24.16.0/x64/bin/node', 'linux', 'x64'], ['/another/mac/bin/node', 'darwin', 'arm64']]) {
      const observed = { path: filename, platform, arch, version: '24.16.0', sha256: 'a'.repeat(64) };
      expect(validateRuntimeObservation(observed, policy)).toMatchObject({ crossPlatformByteEquivalence: false, ...flags() });
      expect(() => validateRuntimeObservation({ ...observed, version: '24.15.0' }, policy)).toThrow('NODE_VERSION');
      expect(() => validateRuntimeObservation({ ...observed, approved: true }, policy)).toThrow('RUNTIME_OBSERVATION');
    }
    const policyOnDisk = readPolicy(root);
    expect(policyOnDisk.dependencies.map(item => item.path)).toEqual(['package.json', 'package-lock.json']);
    expect(Object.keys(policyOnDisk.node)).toEqual(['version']);
    const observed = observeRuntime(root, policyOnDisk, { assertRemaining() {} });
    expect(observed).toMatchObject({ version: '24.16.0', dependencyByteClosureVerified: false, localExternalPinAuthenticated: false, ...flags() });
  });

  it('exact production orchestration retains checkout and cannot persist terminal success before failure', async () => {
    const scenarios = ['pass', 'materialization', 'stdout-persistence', 'observations-persistence', 'late-budget', 'cleanup-uncertain', 'failure-persistence'];
    for (const scenario of scenarios) {
      const fixture = inertHistory(scenario);
      if (scenario === 'pass') {
        const result = await fixture.run();
        expect(result).toMatchObject({ status: 'pass-history', terminalSuccess: true, ownCheckoutRetained: true, filesystemEvidenceDisposalPerformed: false, ...flags() });
      } else {
        let caught;
        try { await fixture.run(); } catch (error) { caught = error; }
        expect(caught, scenario).toBeDefined();
        expect(caught.evidence, scenario).toMatchObject({ status: 'fail-stop', terminalSuccess: false, ownCheckoutRetained: true, noRetry: true, ...flags() });
        if (scenario === 'failure-persistence') expect(caught.evidence).toMatchObject({ failureEvidencePersisted: false, persistenceReason: 'SYNTHETIC_WRITE_ERROR' });
      }
      const state = fixture.inspect();
      expect(state.present, scenario).toBe(true);
      expect(state.children, scenario).toBe(scenario === 'materialization' ? 0 : 1);
      expect([...state.files.keys()].some(file => file.endsWith('/result.json')), scenario).toBe(false);
      for (const [filename, bytes] of state.files) {
        if (!filename.endsWith('.json')) continue;
        const record = JSON.parse(bytes);
        expect(record.status, scenario).not.toBe('pass-history');
        expect(record.terminalSuccess, scenario).toBe(false);
      }
    }
    console.log(JSON.stringify({ exactProductionHistoryVm: { scenarios, realHistoricalRuns: 0, sourceFunction: 'replayHistory' } }));
  });

  it('current production entry rejects actual inventory, control, review and package drift in a private Git fixture', () => {
    const diagnosticStarted = performance.now();
    const phaseElapsedMs = {};
    let phase = 'clone+checkout';
    let phaseStarted = diagnosticStarted;
    const nextPhase = name => { const now = performance.now(); phaseElapsedMs[phase] = now - phaseStarted; phase = name; phaseStarted = now; };
    const outer = realpathSync(mkdtempSync(path.join(tmpdir(), 'r18b-private-source-fixture-')));
    const target = path.join(outer, 'checkout');
    const git = (...args) => execFileSync('/usr/bin/git', args, { cwd: outer, encoding: 'utf8', timeout: 30000, stdio: ['pipe', 'pipe', 'pipe'], env: { PATH: '/usr/bin:/bin', GIT_CONFIG_NOSYSTEM: '1', GIT_CONFIG_GLOBAL: '/dev/null', GIT_NO_REPLACE_OBJECTS: '1' } });
    const mustFail = reason => expect(verifySource(target).failures.join('\n')).toContain(reason);
    try {
      git('clone', '--quiet', '--shared', '--no-hardlinks', '--no-checkout', '--', root, target);
      git('-C', target, '-c', 'core.autocrlf=false', 'checkout', '--quiet', '--detach', BASE);
      nextPhase('copy/source-negatives');
      const current = verifySource(root);
      expect(current.status).toBe('source-consistent');
      for (const row of current.records) {
        const dest = path.join(target, row.path);
        mkdirSync(path.dirname(dest), { recursive: true });
        copyFileSync(path.join(root, row.path), dest);
        chmodSync(dest, row.mode);
      }
      symlinkSync(realpathSync(path.join(root, 'node_modules')), path.join(target, 'node_modules'), 'dir');
      expect(verifySource(target).status).toBe('source-consistent');
      // This is a disposable test index, never staging the user's candidate.
      const extra = 'scripts/r18b-unregistered-synthetic.mjs';
      writeFileSync(path.join(target, extra), '// synthetic');
      mustFail('unaccounted-source:' + extra);
      const globalRules = path.join(outer, 'synthetic-global-ignore');
      const globalConfig = path.join(outer, 'synthetic-gitconfig');
      writeFileSync(globalRules, '*\n');
      writeFileSync(globalConfig, '[core]\n\texcludesFile = ' + globalRules + '\n');
      const priorGlobal = process.env.GIT_CONFIG_GLOBAL;
      try { process.env.GIT_CONFIG_GLOBAL = globalConfig; mustFail('unaccounted-source:' + extra); }
      finally { if (priorGlobal === undefined) delete process.env.GIT_CONFIG_GLOBAL; else process.env.GIT_CONFIG_GLOBAL = priorGlobal; }
      git('-C', target, 'add', '--', extra);
      mustFail('unaccounted-source:' + extra);
      git('-C', target, 'update-index', '--force-remove', '--', extra);
      unlinkSync(path.join(target, extra));
      writeFileSync(path.join(target, '.git/info/exclude'), '*\n');
      mkdirSync(path.join(target, 'synthetic-nested'));
      writeFileSync(path.join(target, 'synthetic-nested/.gitignore'), '*\n');
      writeFileSync(path.join(target, 'synthetic-nested/hidden.mjs'), '// synthetic');
      mustFail('unaccounted-source:synthetic-nested/hidden.mjs');
      rmSync(path.join(target, 'synthetic-nested'), { recursive: true });
      const forbidden = path.join(target, R12_EXCLUDED_PATHS[0]);
      mkdirSync(path.dirname(forbidden), { recursive: true });
      writeFileSync(forbidden, 'Harmless synthetic marker, no R12 content.\n');
      mustFail('R12-excluded:');
      unlinkSync(forbidden);
      for (const [relative, reason] of [[LEDGER, 'LEDGER_IDENTITY'], [SCHEMA, 'SCHEMA_IDENTITY'], [CHECKER, 'CHECKER_IDENTITY'], ['package.json', 'source-identity:package.json'], ['package-lock.json', 'source-identity:package-lock.json']]) {
        const filename = path.join(target, relative); const bytes = readFileSync(filename);
        writeFileSync(filename, Buffer.concat([bytes, Buffer.from('\n')]));
        mustFail(reason);
        writeFileSync(filename, bytes);
      }
      // Metadata-only fixture: do not mutate the shared installed dependency tree.
      nextPhase('runtime-negatives');
      unlinkSync(path.join(target, 'node_modules'));
      for (const relative of ['node_modules/.package-lock.json', 'node_modules/vitest/package.json', 'node_modules/vite/package.json', 'node_modules/ajv/package.json']) {
        mkdirSync(path.dirname(path.join(target, relative)), { recursive: true });
        copyFileSync(path.join(root, relative), path.join(target, relative));
      }
      const runtimePolicy = readPolicy(target); const clock = { assertRemaining() {} };
      expect(observeRuntime(target, runtimePolicy, clock).dependencyByteClosureVerified).toBe(false);
      for (const relative of ['package.json', 'package-lock.json']) {
        const filename = path.join(target, relative); const bytes = readFileSync(filename);
        writeFileSync(filename, Buffer.concat([bytes, Buffer.from('\n')]));
        expect(() => observeRuntime(target, runtimePolicy, clock)).toThrow('DEPENDENCY_IDENTITY');
        writeFileSync(filename, bytes);
      }
      const toolFile = path.join(target, 'node_modules/vitest/package.json'); const toolBytes = readFileSync(toolFile);
      writeFileSync(toolFile, JSON.stringify({ ...JSON.parse(toolBytes), version: '0.0.0' }));
      expect(() => observeRuntime(target, runtimePolicy, clock)).toThrow('INSTALLED_TOOL_VERSION:vitest');
      writeFileSync(toolFile, toolBytes);
      const installedFile = path.join(target, 'node_modules/.package-lock.json'); const installedBytes = readFileSync(installedFile);
      const installed = JSON.parse(installedBytes); installed.packages['node_modules/vite'].version = '0.0.0';
      writeFileSync(installedFile, JSON.stringify(installed));
      expect(() => observeRuntime(target, runtimePolicy, clock)).toThrow('INSTALLED_TOOL_VERSION:vite');
      writeFileSync(installedFile, installedBytes);
      const review = path.join(target, REVIEW);
      nextPhase('review+missingobject');
      const savedReview = current.records.some(row => row.path === REVIEW) ? readFileSync(review) : null;
      writeFileSync(review, '{"status":"pending","P1":["synthetic"]}\n');
      expect(verifySource(target)).toMatchObject({ status: 'source-consistent', reviewState: 'present-unvalidated', ...flags() });
      const beforeReviewChange = verifySource(target);
      const records = beforeReviewChange.records;
      const manifest = { files: records.filter(row => !DERIVED_REPORT_PATHS.includes(row.path)) };
      expect(beforeReviewChange.bindingRevision).toBe(4);
      expect(beforeReviewChange.sourceInputDigest).toBe(hash(JSON.stringify(manifest.files)));
      expect(validateManifest(records, manifest)).toMatchObject(flags());
      writeFileSync(review, '{"status":"failed"}\n');
      const afterReviewChange = verifySource(target);
      expect(afterReviewChange).toMatchObject({ status: 'source-consistent', bindingRevision: 4, ...flags() });
      expect(afterReviewChange.records.find(row => row.path === REVIEW)).toEqual(identity(target, REVIEW));
      expect(afterReviewChange.records.find(row => row.path === REVIEW)).not.toEqual(records.find(row => row.path === REVIEW));
      expect(afterReviewChange.records.filter(row => row.path !== REVIEW)).toEqual(records.filter(row => row.path !== REVIEW));
      expect(afterReviewChange.sourceInputDigest).toBe(hash(JSON.stringify(afterReviewChange.records.filter(row => !DERIVED_REPORT_PATHS.includes(row.path)))));
      expect(afterReviewChange.sourceInputDigest).not.toBe(beforeReviewChange.sourceInputDigest);
      expect(() => validateManifest(afterReviewChange.records, manifest)).toThrow('MANIFEST_DRIFT');
      writeFileSync(review, '{"x":1,"x":2}\n');
      expect(verifySource(target).status).toBe('fail-closed');
      writeFileSync(review, '{}\n'); chmodSync(review, 0o755);
      mustFail('control-contract:' + REVIEW);
      chmodSync(review, 0o644); unlinkSync(review); symlinkSync(path.join(root, CHECKER), review);
      expect(verifySource(target).status).toBe('fail-closed');
      unlinkSync(review);
      if (savedReview) writeFileSync(review, savedReview);
      const alternate = path.join(target, '.git/objects/info/alternates'); const originalAlternate = readFileSync(alternate);
      writeFileSync(alternate, '\n');
      expect(verifySource(target).status).toBe('fail-closed');
      writeFileSync(alternate, originalAlternate);
      expect(verifySource(target).status).toBe('source-consistent');
    } finally {
      nextPhase('cleanup');
      try { rmSync(outer, { recursive: true, force: true }); }
      finally {
        const ended = performance.now();
        phaseElapsedMs[phase] = ended - phaseStarted;
        console.log(JSON.stringify({ privateSourceFixtureDiagnostic: { phaseElapsedMs, totalElapsedMs: ended - diagnosticStarted, testTimeoutMs: SOURCE_FIXTURE_WATCHDOG_MS, timingOnly: true } }));
      }
    }
  }, SOURCE_FIXTURE_WATCHDOG_MS);

  it('wrong tree and expired source-name reads use the exact production checks without running history', () => {
    const source = readFileSync(path.join(root, CHECKER), 'utf8');
    const body = source.slice(source.indexOf('export function baseRecords('), source.indexOf('export function readPolicy(')).replace(/^export /, '');
    const inspect = runInNewContext(body + '\nbaseRecords', {
      BASE, TREE, need: (condition, reason) => { if (!condition) throw new Error(reason); },
      git: (_root, args) => Buffer.from(args[0] === 'cat-file' ? 'commit\n' : '0'.repeat(40) + '\n'),
    }, { timeout: 1000 });
    expect(() => inspect('/synthetic')).toThrow('BASE_TREE_MISMATCH');
    expect(() => historicalNames(root, { assertRemaining() { throw new Error('SYNTHETIC_DEADLINE'); } })).toThrow('SYNTHETIC_DEADLINE');
    expect(selectProjectSourceFiles([REVIEW, 'evaluation/reviews/2026-09-08-r18b-tiny-prerequisite-review.json', SCHEMA, CHECKER])).toHaveLength(4);
  });
});

describe('mandatory unchanged pinned-base history', () => {
  it('A06/A07 actual dc6e17 + default84f15 + 5 + 20 and Node29, never a tiny PDE', async () => {
    const result = await replayHistory(root);
    expect(result.status).toBe('pass-history');
    console.log(JSON.stringify({ r18bHistory: result }));
  }, 305000);
});

describe('custom laboratory branch comparison binding revision 4', () => {
  it('rejects revision and exact input drift without running history', () => {
    const ledger=readPolicy(root), base=baseRecords(root), current=verifySource(root);
    expect(current.status).toBe('source-consistent');
    expect(current.bindingRevision).toBe(4);
    expect(ledger.bindingRevision).toBe(4);
    const validate=new Ajv2020({strict:true}).compile(JSON.parse(readFileSync(path.join(root,SCHEMA))));
    for(const revision of [undefined,1,2,3,5,'4',null]) {
      const changed={...ledger,bindingRevision:revision};
      if(revision===undefined)delete changed.bindingRevision;
      expect(validate(changed)).toBe(false);
    }
    expect(ledger.inputs).toHaveLength(45);
    expect(ledger.inputs.some(r=>r.path==='evaluation/reviews/2026-09-08-r18b-trajectory-snapshot-final-review.json')).toBe(true);
    for(const relative of [
      'evaluation/reviews/2026-09-09-custom-lab-main-v01-review.json',
      'evaluation/reviews/2026-09-10-custom-lab-dynamics-v01-review.json',
      'lib/structure/custom-ar-branch-comparison.ts',
      'lib/structure/custom-ar-branch-comparison.test.ts',
      'lib/structure/custom-ar-branch-comparison-component.test.ts',
      'app/components/custom-ar-branch-comparison.tsx',
      'lib/structure/ar-vv-core.ts',
      'lib/structure/ar-vv-adapter.ts',
      'lib/structure/ar-vv-core.test.ts',
      'lib/structure/custom-ar-dynamics-session.ts',
      'lib/structure/custom-ar-dynamics-session.test.ts',
      'lib/structure/custom-ar-dynamics-workbench.test.ts',
      'app/components/custom-ar-dynamics-controls.tsx',
    ]) expect(ledger.inputs.filter(r=>r.path===relative)).toEqual([identity(root,relative)]);
    for(const entry of ledger.inputs) {
      expect(validateRecords(current.records.filter(r=>r.path!==entry.path),base,ledger,[])).toContain('missing-source:'+entry.path);
      for(const mutation of [{sha256:'0'.repeat(64)},{mode:entry.mode===420?493:420}])
        expect(validateRecords(current.records.map(r=>r.path===entry.path?{...r,...mutation}:r),base,ledger,[])).toContain('source-identity:'+entry.path);
    }
    expect(validateRecords([...current.records,record('unexpected-source.ts')],base,ledger,[])).toContain('unaccounted-source:unexpected-source.ts');
    const manifest={files:current.records.filter(r=>!DERIVED_REPORT_PATHS.includes(r.path))};
    expect(validateManifest(current.records,manifest)).toMatchObject(flags());
    expect(current.sourceInputDigest).toBe(hash(JSON.stringify(manifest.files)));
    const changed=current.records.map(r=>r.path===REVIEW?{...r,sha256:'f'.repeat(64)}:r);
    expect(hash(JSON.stringify(changed.filter(r=>!DERIVED_REPORT_PATHS.includes(r.path))))).not.toBe(current.sourceInputDigest);
    expect(()=>validateManifest(changed,manifest)).toThrow('MANIFEST_DRIFT');
    expect(current).toMatchObject(flags());
  });
});
