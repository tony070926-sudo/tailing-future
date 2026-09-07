import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { isDeepStrictEqual } from 'node:util';
import { runInNewContext } from 'node:vm';
import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';
import { ADDITION_PATHS, CONTROL_PATHS, HISTORICAL_TEST_PATHS, INTEGRATION_BASE, INTEGRATION_TREE, LEDGER_PATH, RECEIPT_PATH, REVIEW_PATH, SCHEMA_PATH, SCIENTIFIC_CONTRACT_BASE, TERMINAL_REVIEW_PATH, assertHistoricalCorpus, captureInventory, compareSourceIdentity, createGitCheckout, inspectPortable, replayHistoricalTests, selectSourceInputRecords, sourceIdentity, validateInventory, verifyAdmissionAtRoot, verifyDerivedReportsAtRoot } from './verify-r18a-wrangler-admission-v0.4.mjs';
import { buildPublicProductEvaluation, buildPublicSummary, capturedInputIdentity, DERIVED_REPORT_PATHS, makeGenerationStatement } from '../derived-report-contract.mjs';
import { regularBytes } from '../mesoscale/pfhub7a_r18a_current_root.mjs';
import { inspectPortable as inspectV03, validateInventory as validateV03 } from './verify-r18a-origin-main-admission-v0.3.mjs';
import { checkDerivedReports, REPORT_BYTE_LIMITS } from '../derived-report-contract.mjs';

const root = process.cwd();
const hash = bytes => createHash('sha256').update(bytes).digest('hex');

describe('explicit 84f + Wrangler source admission /0.4, not scientific promotion', () => {
  it('mandatorily executes exact 84f admission10 + runner5, nested5 + 20 and Node29', async () => {
    let result;
    try { result = await replayHistoricalTests(root); }
    catch (error) {
      console.log(JSON.stringify({ failedHistoricalReplayEvidence: error.historicalExecution ?? null }));
      throw error;
    }
    expect(result).toMatchObject({ status: 0, commit: INTEGRATION_BASE, tree: INTEGRATION_TREE, pathCount: 517,
      historicalOnly: true, postCheckoutChmodPerformed: false, cleanupConfirmed: true,
      counts: { oldAdmissionTests: 10, oldCurrentRootTests: 5, nestedV02Tests: 5, nestedV01Tests: 20, nodeTests: 29 },
      releaseEligible: false, historicalApprovalTransferred: false });
    console.log(JSON.stringify({ exact84fHistoricalReplayEvidence: result }));
  }, 130000);

  it('rejects exactly the unadmitted four-file Wrangler combination under preserved /0.3', () => {
    const { ledger } = inspectPortable(root);
    const old = inspectV03(root);
    const imported = ['scripts/release-cloudflare.mjs', 'scripts/release-cloudflare.test.mjs',
      'docs/RELEASE_AUTHENTICATION.md', 'evaluation/reviews/2026-09-07-wrangler-encrypted-release-review.md'];
    const rows = [...ledger.baseRecords.filter(record => !imported.includes(record.path)),
      ...imported.map(file => sourceIdentity(root, file))].sort((a, b) => a.path.localeCompare(b.path));
    expect(validateV03(rows, old.ledger, old.old.previous).sort()).toEqual([
      'source-identity:scripts/release-cloudflare.mjs',
      'source-identity:scripts/release-cloudflare.test.mjs',
      'unaccounted-source:docs/RELEASE_AUTHENTICATION.md',
      'unaccounted-source:evaluation/reviews/2026-09-07-wrangler-encrypted-release-review.md',
    ].sort());
  });

  it('admits the actual candidate with separate complete-tree and source-input identities', () => {
    const result = verifyAdmissionAtRoot(root);
    expect(result).toMatchObject({ schemaVersion: 'tf.backend-migration-admission-gate/0.4',
      status: 'pass-portable-source-admission', integrationBaseCommit: INTEGRATION_BASE,
      scientificContractBaseCommit: SCIENTIFIC_CONTRACT_BASE, failures: [],
      currentReviewInInputIdentity: true, oldTerminalBytesPinned: true,
      historicalTestsExecutedByAdmission: false, currentRunSuccessClaimed: false,
      executionAuthenticated: false, reproduced: false, physicalValidation: false, convergenceVerified: false,
      scientificPromotionEligible: false, releaseEligible: false, historicalApprovalTransferred: false });
    expect(result.candidateTreeIdentity.pathCount).toBe(527);
    expect(result.sourceInputIdentity.pathCount).toBe(522);
    expect(result.derivedReports.validated).toBe(false);
    expect(result.sourceInputIdentity.gitTreeOid).toMatch(/^[a-f0-9]{40}$/);
  });

  it('closes schema, base history, exact reconciliation and claim escalation', () => {
    const { ledger } = inspectPortable(root);
    const validate = new Ajv2020({ strict: true, allErrors: true }).compile(JSON.parse(readFileSync(SCHEMA_PATH, 'utf8')));
    expect(validate(ledger)).toBe(true);
    for (const mutate of [
      value => { value.integrationBaseCommit = SCIENTIFIC_CONTRACT_BASE; },
      value => { value.integrationBaseTree = '0'.repeat(40); },
      value => { value.claims.releaseEligible = true; },
      value => { value.claims.reproduced = true; },
      value => { value.claims.historicalApprovalTransferred = true; },
      value => { value.policy.numericalAcceptanceMs += 1; },
      value => { value.policy.ciTimeoutMinutes += 1; },
      value => { value.policy.currentReviewIsEvaluatorInput = false; },
      value => { value.policy.extraExclusion = REVIEW_PATH; },
      value => { value.reviewOutputs.push('evaluation/reviews/extra.md'); },
      value => { value.controlFiles.push('scripts/arbitrary.mjs'); },
      value => { value.baseRecords.pop(); },
      value => { value.additions.pop(); },
      value => { value.reconciled[0].extra = true; },
      value => { value.extra = true; },
    ]) { const altered = structuredClone(ledger); mutate(altered); expect(validate(altered)).toBe(false); }
    expect(ledger.reconciled.every(item => item.path === item.before.path && item.path === item.after.path)).toBe(true);
    expect(ledger.additions.map(item => item.path).sort()).toEqual([...ADDITION_PATHS].sort());
  });

  it('pins every old source except four named deltas and keeps selectors / budgets unchanged', () => {
    const { ledger } = inspectPortable(root);
    const delta = new Set(ledger.reconciled.map(item => item.path));
    for (const record of ledger.baseRecords.filter(item => !delta.has(item.path) && !DERIVED_REPORT_PATHS.includes(item.path))) {
      expect(compareSourceIdentity(sourceIdentity(root, record.path), record), record.path).toBe(true);
    }
    const baseFile = file => execFileSync('/usr/bin/git', ['show', INTEGRATION_BASE + ':' + file], { encoding: 'utf8', timeout: 30000 });
    const packageBefore = JSON.parse(baseFile('package.json'));
    const packageAfter = JSON.parse(readFileSync('package.json', 'utf8'));
    packageBefore.scripts['r18a:validate'] = 'node scripts/mesoscale/pfhub7a_r18a_current_root_v3.mjs';
    expect(packageAfter).toEqual(packageBefore);
    const before = baseFile('vitest.config.ts');
    const after = readFileSync('vitest.config.ts', 'utf8');
    const excludes = source => [...source.matchAll(/^\s+'([^']+)',?$/gm)].map(match => match[1]);
    expect(excludes(after).filter(file => !excludes(before).includes(file))).toEqual(HISTORICAL_TEST_PATHS);
    expect(after).toContain('testTimeout: 20_000');
    expect(after).toContain('fileParallelism: false');
    expect(readFileSync('.github/workflows/evaluate.yml', 'utf8')).toBe(baseFile('.github/workflows/evaluate.yml'));
    const runner = readFileSync('scripts/mesoscale/pfhub7a_r18a_current_root_v3.mjs', 'utf8');
    expect(runner).toBe(baseFile('scripts/mesoscale/pfhub7a_r18a_current_root_v2.mjs')
      .replaceAll('verify-r18a-origin-main-admission-v0.3', 'verify-r18a-wrangler-admission-v0.4')
      .replaceAll('tf.r18a-current-root-execution/0.3', 'tf.r18a-current-root-execution/0.4'));
  });

  it('rejects missing, extra, duplicate, changed, excluded and unregistered-control records', () => {
    const { ledger, old } = inspectPortable(root);
    const records = captureInventory(root, ledger);
    const validate = values => validateInventory(values, ledger, old.old.previous).join('\n');
    expect(validate(records)).toBe('');
    expect(validate([...records].reverse())).toContain('source-inventory-order');
    const extra = { path: 'scripts/unregistered.mjs', mode: 0o644, size: 1, sha256: 'a'.repeat(64) };
    expect(validate([...records, extra])).toContain('unaccounted-source:');
    expect(validate([...records, records[0]])).toContain('duplicate-or-unsafe:');
    for (const missing of [LEDGER_PATH, REVIEW_PATH, ...ADDITION_PATHS]) expect(validate(records.filter(record => record.path !== missing))).toContain('missing-source:' + missing);
    for (const file of [...ledger.reconciled.map(item => item.path), ...ADDITION_PATHS, TERMINAL_REVIEW_PATH]) {
      expect(validate(records.map(record => record.path === file ? { ...record, sha256: 'b'.repeat(64) } : record))).toContain('source-identity:' + file);
    }
    for (const file of CONTROL_PATHS) expect(validate(records.map(record => record.path === file ? { ...record, sha256: 'b'.repeat(64) } : record))).toContain('control-identity:' + file);
    for (const file of [...CONTROL_PATHS, REVIEW_PATH]) {
      for (const mode of [0o444, 0o600, 0o664, 0o755, 0o4644]) expect(validate(records.map(record => record.path === file ? { ...record, mode } : record))).toContain('control-file-contract:' + file);
    }
    const excluded = old.old.previous.entries.find(entry => entry.disposition === 'excluded-r12-redistribution-unresolved');
    expect(validate([...records, { ...extra, sha256: excluded.legacyIdentity.sha256 }])).toContain('R12-excluded:');
  });

  it('rejects symlinks, parent symlinks, hardlinks, unsafe paths and receipt permission widening', () => {
    const temporary = realpathSync(mkdtempSync(path.join(tmpdir(), 'tf-v04-source-contract-')));
    try {
      writeFileSync(path.join(temporary, 'regular'), 'synthetic\n');
      symlinkSync('regular', path.join(temporary, 'symlink'));
      expect(() => sourceIdentity(temporary, 'symlink')).toThrow('INPUT_NOT_REGULAR');
      mkdirSync(path.join(temporary, 'real'));
      writeFileSync(path.join(temporary, 'real/file'), 'synthetic\n');
      symlinkSync('real', path.join(temporary, 'parent'));
      expect(() => sourceIdentity(temporary, 'parent/file')).toThrow();
      linkSync(path.join(temporary, 'regular'), path.join(temporary, 'hardlink'));
      expect(() => sourceIdentity(temporary, 'regular')).toThrow('INPUT_NOT_REGULAR');
      for (const file of ['../outside', '/absolute', 'a/../b', 'a\\b']) expect(() => sourceIdentity(temporary, file)).toThrow('UNSAFE_SOURCE_PATH');
    } finally { rmSync(temporary, { recursive: true, force: true }); }
    const { ledger } = inspectPortable(root);
    const receipt = ledger.baseRecords.find(record => record.path === RECEIPT_PATH);
    for (const mode of [0o444, 0o644]) expect(compareSourceIdentity({ ...receipt, mode }, receipt)).toBe(true);
    for (const mode of [0o400, 0o600, 0o664, 0o744, 0o4644]) expect(compareSourceIdentity({ ...receipt, mode }, receipt)).toBe(false);
    expect(compareSourceIdentity({ ...receipt, path: 'new-receipt', mode: 0o444 }, { ...receipt, path: 'new-receipt' })).toBe(false);
  });

  it('includes all new reviews and controls in input identity with no extra selector exclusion', () => {
    const { ledger } = inspectPortable(root);
    const records = captureInventory(root, ledger);
    const inputs = new Set(selectSourceInputRecords(records).map(record => record.path));
    for (const file of [...ADDITION_PATHS, ...CONTROL_PATHS, REVIEW_PATH]) expect(inputs.has(file), file).toBe(true);
    expect(inputs.has(TERMINAL_REVIEW_PATH)).toBe(false);
    expect(records.filter(record => !inputs.has(record.path)).map(record => record.path).sort()).toEqual([...DERIVED_REPORT_PATHS, TERMINAL_REVIEW_PATH].sort());
  });

  it('requires actual nonzero historical counts and successful nested children', () => {
    const pass = { status: 0, signal: null, error: null, timedOut: false, stopped: false, outputTruncated: false, killError: null, cleanupConfirmed: true, stdout: '', stderr: '' };
    const nested = { ...pass, historicalOnly: true, historicalBase: SCIENTIFIC_CONTRACT_BASE, stdout: 'Tests 5 passed (5)\n20 passed (20)' };
    const node = { ...pass, stdout: '# tests 29\n# pass 29\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0\n' };
    const make = () => ({ ...pass, stdout: 'verify-r18a-origin-main-admission-v0.3.test.mjs (10 tests)\npfhub7a_r18a_current_root_v2.test.mjs (5 tests)\nTests 15 passed (15)\n'
      + JSON.stringify({ historicalReplayEvidence: nested }) + '\n' + JSON.stringify({ gitCheckoutEvidence: { node } }) });
    expect(assertHistoricalCorpus(make()).nodeTests).toBe(29);
    for (const mutate of [
      value => { value.status = 1; },
      value => { value.cleanupConfirmed = false; },
      value => { value.stdout = value.stdout.replace('15 passed (15)', '0 passed (0)'); },
      value => { value.stdout = value.stdout.replace('(10 tests)', '(0 tests)'); },
      value => { value.stdout += '\n1 skipped'; },
      value => { value.stdout = value.stdout.replace('20 passed (20)', '19 passed (20)'); },
      value => { value.stdout = value.stdout.replace('# tests 29', '# tests 0'); },
      value => { value.stdout += '\n' + JSON.stringify({ historicalReplayEvidence: nested }); },
      value => { value.stdout = value.stdout.replaceAll('"cleanupConfirmed":true', '"cleanupConfirmed":false'); },
    ]) { const altered = make(); mutate(altered); expect(() => assertHistoricalCorpus(altered)).toThrow(); }
  });

  it('checks a real current Git checkout, hidden-source mutations and exact historical terminal bytes', () => {
    const checkout = createGitCheckout(root);
    try {
      expect(checkout).toMatchObject({ postCheckoutChmodPerformed: false, approvedReleaseCommit: false, receipt: { mode: 0o644 } });
      expect(checkout.admission.sourceInputIdentity).toEqual(verifyAdmissionAtRoot(root).sourceInputIdentity);
      const terminal = path.join(checkout.root, TERMINAL_REVIEW_PATH);
      const bytes = readFileSync(terminal);
      writeFileSync(terminal, '{}\n');
      expect(verifyAdmissionAtRoot(checkout.root).failures).toContain('source-identity:' + TERMINAL_REVIEW_PATH);
      writeFileSync(terminal, bytes);
      const extra = path.join(checkout.root, 'scripts/unregistered.mjs');
      writeFileSync(extra, 'synthetic\n');
      writeFileSync(path.join(checkout.root, '.git/info/exclude'), 'scripts/unregistered.mjs\n');
      expect(verifyAdmissionAtRoot(checkout.root).failures).toContain('unaccounted-source:scripts/unregistered.mjs');
      unlinkSync(extra);
      writeFileSync(path.join(checkout.root, 'scripts/.gitignore'), 'unregistered.mjs\n');
      writeFileSync(extra, 'synthetic\n');
      expect(verifyAdmissionAtRoot(checkout.root).failures).toContain('unaccounted-source:scripts/unregistered.mjs');
      unlinkSync(extra); unlinkSync(path.join(checkout.root, 'scripts/.gitignore'));
      const review = path.join(checkout.root, REVIEW_PATH);
      const before = verifyAdmissionAtRoot(checkout.root);
      writeFileSync(review, Buffer.concat([readFileSync(review), Buffer.from('\nSynthetic private-test-only review update.\n')]));
      const after = verifyAdmissionAtRoot(checkout.root);
      expect(after.status).toBe('pass-portable-source-admission');
      expect(after.sourceInputIdentity).not.toEqual(before.sourceInputIdentity);
      expect(after.releaseEligible).toBe(false);
      unlinkSync(review);
      expect(verifyAdmissionAtRoot(checkout.root).status).toBe('fail-closed');
    } finally { rmSync(checkout.root, { recursive: true, force: true }); }
  }, 130000);

  it('tests the exact production report check against bidirectional legal POSIX receipt-mode drift', () => {
    const checkout = createGitCheckout(root);
    const receipt = path.join(checkout.root, RECEIPT_PATH);
    const source = readFileSync(path.join(root, CONTROL_PATHS[1]), 'utf8');
    const begin = source.indexOf('export function verifyDerivedReportsAtRoot(');
    const end = source.indexOf('\nfunction attachObjects(', begin);
    expect(begin).toBeGreaterThan(0); expect(end).toBeGreaterThan(begin);
    const exactFunction = source.slice(begin, end).replace(/^export /, '');
    const hash = bytes => createHash('sha256').update(bytes).digest('hex');
    const inputForMode = mode => {
      chmodSync(receipt, mode);
      const { ledger } = inspectPortable(checkout.root);
      const capturedInputs = new Map(selectSourceInputRecords(captureInventory(checkout.root, ledger)).map(record => {
        const content = regularBytes(path.join(checkout.root, record.path));
        return [record.path, { content, byteLength: content.length, digest: `sha256:${hash(content)}`, mode: record.mode }];
      }));
      const report = { ...capturedInputIdentity(capturedInputs), sourceRevision: null, hardGateFailures: [], verdict: 'conditional', gaps: [] };
      const reportBytesByPath = new Map([
        ['evaluation/latest-report.json', Buffer.from(JSON.stringify(report))],
        ['evaluation/latest-report.md', Buffer.from(`Synthetic protocol only\nVerdict: **CONDITIONAL**\n${report.artifactDigest}\n`)],
        ['evaluation/public-summary.json', buildPublicSummary(report)],
        ['evaluation/public-product-evaluation.json', buildPublicProductEvaluation(report, JSON.parse(capturedInputs.get('evaluation/current-scorecard.json').content), JSON.parse(capturedInputs.get('evaluation/baselines/registry.json').content))],
      ]);
      for (const [file, bytes] of reportBytesByPath) writeFileSync(path.join(checkout.root, file), bytes);
      return makeGenerationStatement({ capturedInputs, expectedSourceRevision: null, reportBytesByPath, workerExitCode: 0 });
    };
    try {
      for (const mode of [0o644, 0o444]) {
        const statement = inputForMode(mode);
        const before = verifyAdmissionAtRoot(checkout.root);
        const stable = verifyDerivedReportsAtRoot(checkout.root, statement);
        expect(stable).toMatchObject({ status: 'pass-derived-report-consistency', evaluatorInputVerifiedBeforeAndAfter: true, executionAuthenticated: false, releaseEligible: false });
        const targetMode = mode === 0o644 ? 0o444 : 0o644;
        const context = { Map, path, Buffer, hash, regularBytes, captureInventory, inspectPortable, selectSourceInputRecords, capturedInputIdentity,
          verifyAdmissionAtRoot, isDeepStrictEqual, DERIVED_REPORT_PATHS, REPORT_BYTE_LIMITS,
          requireCondition: (condition, reason) => { if (!condition) throw new Error(reason); },
          checkDerivedReports: args => {
            const result = checkDerivedReports(args);
            expect(result.status).toBe('pass-derived-report-consistency');
            chmodSync(receipt, targetMode);
            return result;
          } };
        // Only a private VM dependency injects the filesystem change; this is
        // the exact production function, without a production bypass or flag.
        const execute = code => runInNewContext(`${code}\nverifyDerivedReportsAtRoot`, context, { timeout: 1000 });
        const observed = execute(exactFunction)(checkout.root, statement);
        expect(observed).toMatchObject({ status: 'abstain', releaseEligible: false, reasons: ['POSIX_INPUT_CHANGED_DURING_REPORT_CHECK'] });
        expect(observed.sourceVerifiedBeforeAndAfter).not.toBe(true);
        expect(verifyAdmissionAtRoot(checkout.root).sourceInputIdentity).toEqual(before.sourceInputIdentity);
        // A test-only private negative control removes exactly the new guard.
        // It must incorrectly pass, proving this test exercises that guard.
        const guard = "    requireCondition(isDeepStrictEqual(capturedInputIdentity(capturedInputs), capturedInputIdentity(capturedAfter)), 'POSIX_INPUT_CHANGED_DURING_REPORT_CHECK');";
        expect(exactFunction.split(guard)).toHaveLength(2);
        inputForMode(mode);
        expect(execute(exactFunction.replace(guard, ''))(checkout.root, statement).status).toBe('pass-derived-report-consistency');
        console.log(JSON.stringify({ posixDriftRegression: { fromMode: mode, toMode: targetMode, productionStatus: observed.status, reason: observed.reasons[0], negativeControlWithoutGuard: 'incorrect-pass', syntheticProtocolOnly: true, executionAuthenticated: false, releaseEligible: false } }));
      }
    } finally { rmSync(checkout.root, { recursive: true, force: true }); }
  }, 150000);


  it('separates current report consistency from history and rejects stale review / report / revision', () => {
    const checkout = createGitCheckout(root);
    try {
      const { ledger } = inspectPortable(checkout.root);
      const capturedInputs = new Map(selectSourceInputRecords(captureInventory(checkout.root, ledger)).map(record => {
        const content = regularBytes(path.join(checkout.root, record.path));
        return [record.path, { content, byteLength: content.length, digest: 'sha256:' + hash(content), mode: record.mode }];
      }));
      const report = { ...capturedInputIdentity(capturedInputs), sourceRevision: null, hardGateFailures: [], verdict: 'conditional', gaps: [] };
      const reportBytesByPath = new Map([
        ['evaluation/latest-report.json', Buffer.from(JSON.stringify(report))],
        ['evaluation/latest-report.md', Buffer.from('Synthetic protocol only\nVerdict: **CONDITIONAL**\n' + report.artifactDigest + '\n')],
        ['evaluation/public-summary.json', buildPublicSummary(report)],
        ['evaluation/public-product-evaluation.json', buildPublicProductEvaluation(report, JSON.parse(capturedInputs.get('evaluation/current-scorecard.json').content), JSON.parse(capturedInputs.get('evaluation/baselines/registry.json').content))],
      ]);
      const restore = () => { for (const [file, bytes] of reportBytesByPath) writeFileSync(path.join(checkout.root, file), bytes); };
      restore();
      const statement = makeGenerationStatement({ capturedInputs, expectedSourceRevision: null, reportBytesByPath, workerExitCode: 0 });
      expect(verifyDerivedReportsAtRoot(checkout.root, statement)).toMatchObject({ status: 'pass-derived-report-consistency', releaseEligible: false, executionAuthenticated: false, evaluatorInputVerifiedBeforeAndAfter: true });
      expect(verifyDerivedReportsAtRoot(checkout.root, null).status).toBe('abstain');
      expect(verifyDerivedReportsAtRoot(checkout.root, statement, INTEGRATION_BASE).status).toBe('abstain');
      writeFileSync(path.join(checkout.root, DERIVED_REPORT_PATHS[0]), '{}\n');
      expect(verifyAdmissionAtRoot(checkout.root).status).toBe('pass-portable-source-admission');
      expect(verifyDerivedReportsAtRoot(checkout.root, statement).status).toBe('abstain');
      restore();
      const receipt = path.join(checkout.root, RECEIPT_PATH);
      chmodSync(receipt, 0o444);
      expect(verifyAdmissionAtRoot(checkout.root).status).toBe('pass-portable-source-admission');
      expect(verifyDerivedReportsAtRoot(checkout.root, statement).status).toBe('abstain');
      chmodSync(receipt, 0o644);
      writeFileSync(path.join(checkout.root, REVIEW_PATH), 'Synthetic changed review\n');
      expect(verifyAdmissionAtRoot(checkout.root).status).toBe('pass-portable-source-admission');
      expect(verifyDerivedReportsAtRoot(checkout.root, statement).status).toBe('abstain');
      for (const file of DERIVED_REPORT_PATHS) unlinkSync(path.join(checkout.root, file));
      expect(verifyAdmissionAtRoot(checkout.root).derivedReports.state).toBe('absent');
      expect(verifyDerivedReportsAtRoot(checkout.root, statement).status).toBe('abstain');
    } finally { rmSync(checkout.root, { recursive: true, force: true }); }
  }, 130000);
});
