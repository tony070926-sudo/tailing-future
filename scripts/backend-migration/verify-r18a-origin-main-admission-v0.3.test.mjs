import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { runInNewContext } from 'node:vm';
import Ajv2020 from 'ajv/dist/2020.js';
import { chmodSync, linkSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { captureInventory, compareSourceIdentity, CONTROL_PATHS, createGitCheckout, inspectPortable, INTEGRATION_BASE, LEDGER_PATH, RECEIPT_PATH, replayHistoricalTests, REPORT_HISTORY_PATH, REVIEW_HISTORY_PATHS, SCHEMA_PATH, SCIENTIFIC_CONTRACT_BASE, selectSourceInputRecords, sourceIdentity, TERMINAL_REVIEW_PATH, validateInventory, verifyAdmissionAtRoot, verifyDerivedReportsAtRoot } from './verify-r18a-origin-main-admission-v0.3.mjs';
import { buildPublicProductEvaluation, buildPublicSummary, capturedInputIdentity, checkDerivedReports, DERIVED_REPORT_PATHS, makeGenerationStatement, REPORT_BYTE_LIMITS } from '../derived-report-contract.mjs';
import { assertCompleteCorpus, regularBytes, requireSuccessfulCommand, runBoundedCommand } from '../mesoscale/pfhub7a_r18a_current_root.mjs';

const root = process.cwd();
const digest = 'd91e31d261bf77f99b17e810f5f51aab131dd5339e281839933e45fa79855e5c';
const historicalReceipt = { path: RECEIPT_PATH, mode: 0o444, size: 248778, sha256: digest };

describe('portable admission on the fixed upstream integration base', () => {
  it('mandatorily executes unchanged /0.2 and nested /0.1 historical tests', async () => {
    const result = await replayHistoricalTests(root);
    expect(result).toMatchObject({ status: 0, reconstructedMainFiles: 449, historicalBase: SCIENTIFIC_CONTRACT_BASE, historicalOnly: true, cleanupConfirmed: true });
    expect(result.stdout + result.stderr).toContain('20 passed (20)');
    console.log(JSON.stringify({ historicalReplayEvidence: result }));
  }, 130000);

  it('admits the actual tree with distinct scientific and integration provenance', () => {
    const result = verifyAdmissionAtRoot(root);
    expect(result).toMatchObject({ status: 'pass-portable-source-admission', integrationBaseCommit: INTEGRATION_BASE, scientificContractBaseCommit: SCIENTIFIC_CONTRACT_BASE, releaseEligible: false, historicalApprovalTransferred: false, failures: [] });
    expect(result.candidateTreeIdentity.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(result.candidateTreeIdentity.gitTreeOid).toMatch(/^[a-f0-9]{40}$/);
    expect(result.sourceInputIdentity.gitTreeOid).toMatch(/^[a-f0-9]{40}$/);
    expect(result.sourceInputIdentity.pathCount).toBe(result.candidateTreeIdentity.pathCount - result.derivedReports.presentPaths.length - (captureInventory(root, inspectPortable(root).ledger).some(record => record.path === TERMINAL_REVIEW_PATH) ? 1 : 0));
    expect(INTEGRATION_BASE).not.toBe(SCIENTIFIC_CONTRACT_BASE);
  });

  it('permits owner-write only for the exact historical source receipt', () => {
    for (const mode of [0o444, 0o644]) expect(compareSourceIdentity({ ...historicalReceipt, mode }, historicalReceipt)).toBe(true);
    for (const mode of [0o400, 0o600, 0o664, 0o646, 0o744, 0o4644, 0o2644, 0o1644]) expect(compareSourceIdentity({ ...historicalReceipt, mode }, historicalReceipt)).toBe(false);
    expect(compareSourceIdentity({ ...historicalReceipt, sha256: '0'.repeat(64) }, historicalReceipt)).toBe(false);
    expect(compareSourceIdentity({ ...historicalReceipt, mode: 0o644 }, { ...historicalReceipt, mode: 0o644 })).toBe(false);
    for (const file of ['private-runtime/receipt.json', 'newly-generated-receipt.json']) expect(compareSourceIdentity({ ...historicalReceipt, path: file, mode: 0o644 }, { ...historicalReceipt, path: file })).toBe(false);
  });

  it('rejects symlinks and multiple links before source bytes can be admitted', () => {
    const temporary = realpathSync(mkdtempSync(path.join(tmpdir(), 'tf-v03-source-contract-')));
    try {
      writeFileSync(path.join(temporary, 'regular'), 'synthetic\n');
      symlinkSync('regular', path.join(temporary, 'symlink'));
      expect(() => sourceIdentity(temporary, 'symlink')).toThrow('INPUT_NOT_REGULAR');
      linkSync(path.join(temporary, 'regular'), path.join(temporary, 'hardlink'));
      expect(() => sourceIdentity(temporary, 'regular')).toThrow('INPUT_NOT_REGULAR');
      expect(() => sourceIdentity(temporary, 'hardlink')).toThrow('INPUT_NOT_REGULAR');
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  });

  it('rejects missing, extra, duplicate, modified and renamed excluded identities', () => {
    const { ledger, old } = inspectPortable(root);
    const records = captureInventory(root, ledger);
    const validate = values => validateInventory(values, ledger, old.previous).join('\n');
    expect(validate(records.slice(1))).toContain('missing-source:');
    expect(validate([...records, records[0]])).toContain('duplicate-or-unsafe:');
    const extra = { path: 'scripts/hidden-unregistered.mjs', mode: 0o644, size: 1, sha256: 'a'.repeat(64) };
    expect(validate([...records, extra])).toContain('unaccounted-source:');
    expect(validate(records.map((record, index) => index ? record : { ...record, sha256: 'b'.repeat(64) }))).toContain('source-identity:');
    for (const control of CONTROL_PATHS) expect(validate(records.map(record => record.path === control ? { ...record, sha256: 'b'.repeat(64) } : record))).toContain(`control-identity:${control}`);
    const excluded = old.previous.entries.find(entry => entry.disposition === 'excluded-r12-redistribution-unresolved');
    expect(validate([...records, { ...extra, sha256: excluded.legacyIdentity.sha256 }])).toContain('R12-excluded:');
    expect(validate(records.map(record => record.path === DERIVED_REPORT_PATHS[0] ? { ...record, sha256: excluded.legacyIdentity.sha256 } : record))).toContain('R12-excluded:');
    for (const mode of [0o444, 0o664, 0o755, 0o4644]) expect(validate(records.map(record => record.path === DERIVED_REPORT_PATHS[0] ? { ...record, mode } : record))).toContain('derived-output-file-contract:');
    for (const file of REVIEW_HISTORY_PATHS) expect(validate(records.map(record => record.path === file ? { ...record, sha256: '0'.repeat(64) } : record))).toContain(`source-identity:${file}`);
  });

  it('has a closed schema that rejects changed provenance and claim escalation', () => {
    const { ledger } = inspectPortable(root);
    const validate = new Ajv2020({ strict: true, allErrors: true }).compile(JSON.parse(readFileSync(path.join(root, SCHEMA_PATH), 'utf8')));
    expect(validate(ledger)).toBe(true);
    for (const mutate of [
      value => { value.integrationBaseCommit = SCIENTIFIC_CONTRACT_BASE; },
      value => { value.scientificContractBaseCommit = INTEGRATION_BASE; },
      value => { value.claims.releaseEligible = true; },
      value => { value.claims.historicalApprovalTransferred = true; },
      value => { value.claims.convergenceVerified = true; },
      value => { value.claims.latestRemoteMainClaimed = true; },
      value => { value.extra = 'unregistered'; },
      value => { value.receiptPermissionPolicy.runtimeException = true; },
      value => { value.derivedReportPolicy.sourceAdmissionImpliesReportReadiness = true; },
      value => { value.derivedReportPolicy.terminalAttestationPath = 'evaluation/reviews/arbitrary.json'; },
      value => { value.reviewHistory.pop(); },
    ]) { const altered = structuredClone(ledger); mutate(altered); expect(validate(altered)).toBe(false); }
  });

  it('preserves all four upstream report bytes as history, not current constraints', () => {
    const { ledger } = inspectPortable(root);
    const history = JSON.parse(readFileSync(REPORT_HISTORY_PATH, 'utf8'));
    expect(history.files.map(record => record.path)).toEqual([...DERIVED_REPORT_PATHS]);
    for (const record of history.files) {
      const { utf8, ...identity } = record;
      expect(identity).toEqual(ledger.baseRecords.find(item => item.path === record.path));
      expect(Buffer.byteLength(utf8)).toBe(identity.size);
    }
  });

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

  it('admits complete, absent, partial and regenerated outputs without report readiness or input drift', () => {
    const checkout = createGitCheckout(root);
    const saved = new Map(DERIVED_REPORT_PATHS.map(file => [file, readFileSync(path.join(checkout.root, file))]));
    const restore = () => { for (const [file, bytes] of saved) writeFileSync(path.join(checkout.root, file), bytes, { mode: 0o644 }); };
    const reference = checkout.admission;
    const verify = state => {
      const result = verifyAdmissionAtRoot(checkout.root);
      expect(result).toMatchObject({ status: 'pass-portable-source-admission', sourceInputIdentity: reference.sourceInputIdentity, releaseEligible: false, derivedReports: { state, validated: false } });
      return result;
    };
    try {
      for (const file of DERIVED_REPORT_PATHS) {
        unlinkSync(path.join(checkout.root, file));
        expect(verify('partial').candidateTreeIdentity).not.toEqual(reference.candidateTreeIdentity);
        expect(verifyDerivedReportsAtRoot(checkout.root, null).status).toBe('abstain');
        restore();
      }
      for (const file of DERIVED_REPORT_PATHS) unlinkSync(path.join(checkout.root, file));
      verify('absent');
      writeFileSync(path.join(checkout.root, DERIVED_REPORT_PATHS[0]), '{}\n', { mode: 0o600 });
      verify('partial');
      restore();
      for (const file of DERIVED_REPORT_PATHS) writeFileSync(path.join(checkout.root, file), 'synthetic regenerated bytes\n');
      expect(verify('present-unvalidated').candidateTreeIdentity).not.toEqual(reference.candidateTreeIdentity);
      expect(verifyDerivedReportsAtRoot(checkout.root, null).status).toBe('abstain');
      restore();
      const target = path.join(checkout.root, DERIVED_REPORT_PATHS[0]);
      unlinkSync(target); symlinkSync(path.join(root, DERIVED_REPORT_PATHS[0]), target);
      expect(verifyAdmissionAtRoot(checkout.root).status).toBe('fail-closed');
      unlinkSync(target); restore();
      linkSync(target, path.join(checkout.root, 'synthetic-output-hardlink'));
      expect(verifyAdmissionAtRoot(checkout.root).status).toBe('fail-closed');
      unlinkSync(path.join(checkout.root, 'synthetic-output-hardlink'));
      const { ledger } = inspectPortable(checkout.root);
      const capturedInputs = new Map(selectSourceInputRecords(captureInventory(checkout.root, ledger)).map(record => {
        const content = readFileSync(path.join(checkout.root, record.path));
        return [record.path, { content, byteLength: content.length, mode: record.mode, digest: `sha256:${createHash('sha256').update(content).digest('hex')}` }];
      }));
      // Full source-tree binding with synthetic reports exercises protocol only.
      // Neither this unsigned statement nor this test runs the real evaluator.
      const report = { ...capturedInputIdentity(capturedInputs), sourceRevision: null, hardGateFailures: [], verdict: 'conditional', gaps: [] };
      const reportBytesByPath = new Map([
        ['evaluation/latest-report.json', Buffer.from(JSON.stringify(report))],
        ['evaluation/latest-report.md', Buffer.from(`Synthetic report\nVerdict: **CONDITIONAL**\n${report.artifactDigest}\n`)],
        ['evaluation/public-summary.json', buildPublicSummary(report)],
        ['evaluation/public-product-evaluation.json', buildPublicProductEvaluation(report, JSON.parse(capturedInputs.get('evaluation/current-scorecard.json').content), JSON.parse(capturedInputs.get('evaluation/baselines/registry.json').content))],
      ]);
      for (const [file, bytes] of reportBytesByPath) writeFileSync(path.join(checkout.root, file), bytes);
      const statement = makeGenerationStatement({ capturedInputs, expectedSourceRevision: null, reportBytesByPath, workerExitCode: 0 });
      expect(verifyDerivedReportsAtRoot(checkout.root, statement)).toMatchObject({ status: 'pass-derived-report-consistency', executionAuthenticated: false, releaseEligible: false, sourceVerifiedBeforeAndAfter: true });
      expect(verifyDerivedReportsAtRoot(checkout.root, null).status).toBe('abstain');
      expect(verifyDerivedReportsAtRoot(checkout.root, statement, 'a'.repeat(40)).status).toBe('abstain');
      writeFileSync(path.join(checkout.root, 'evaluation/latest-report.md'), Buffer.concat([reportBytesByPath.get('evaluation/latest-report.md'), Buffer.from('changed body\n')]));
      expect(verifyDerivedReportsAtRoot(checkout.root, statement).status).toBe('abstain');
      restore();
      writeFileSync(path.join(checkout.root, TERMINAL_REVIEW_PATH), '{"syntheticTerminal":true}\n');
      expect(verify('present-unvalidated').candidateTreeIdentity).not.toEqual(reference.candidateTreeIdentity);
      writeFileSync(path.join(checkout.root, `${TERMINAL_REVIEW_PATH}.extra`), '{}\n');
      expect(verifyAdmissionAtRoot(checkout.root).failures.join('\n')).toContain('unaccounted-source:');
    } finally { rmSync(checkout.root, { recursive: true, force: true }); }
  }, 130000);

  it('executes admission and unchanged Node29 in an actual uncorrected Git checkout, then rejects mutations', async () => {
    const checkout = createGitCheckout(root);
    try {
      expect(checkout).toMatchObject({ postCheckoutChmodPerformed: false, approvedReleaseCommit: false, receipt: { mode: 0o644, sha256: digest, size: 248778 } });
      expect(checkout.index.split('\0').filter(Boolean)).toHaveLength(checkout.admission.candidateTreeIdentity.pathCount);
      // Focused Node29 uses this explicitly external dependency reference only;
      // this is not a full-CI dependency-layout closure or a full-suite run.
      symlinkSync(realpathSync(path.join(root, 'node_modules')), path.join(checkout.root, 'node_modules'), 'dir');
      const command = [process.execPath, '--test', '--test-reporter=tap', 'scripts/mesoscale/pfhub7a_r18a_schema_gate_v3.node-test.mjs'];
      const node = await runBoundedCommand(command, { cwd: checkout.root, env: { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, LANG: 'C', LC_ALL: 'C' }, timeoutMs: 120000 });
      requireSuccessfulCommand(node, 'git-checkout-node29');
      assertCompleteCorpus('node', node.stdout + '\n' + node.stderr);
      expect(verifyAdmissionAtRoot(checkout.root).candidateTreeIdentity).toEqual(checkout.admission.candidateTreeIdentity);
      console.log(JSON.stringify({ gitCheckoutEvidence: { ...checkout, root: '<temporary-checkout>', dependencyLayout: 'external-reference-focused-only', command, node } }));
      const receipt = path.join(checkout.root, RECEIPT_PATH);
      const bytes = readFileSync(receipt);
      for (const mode of [0o744, 0o664, 0o646, 0o4644]) {
        chmodSync(receipt, mode);
        expect(verifyAdmissionAtRoot(checkout.root).status).toBe('fail-closed');
        chmodSync(receipt, 0o644);
      }
      writeFileSync(receipt, Buffer.concat([bytes, Buffer.from('\n')]));
      expect(verifyAdmissionAtRoot(checkout.root).status).toBe('fail-closed');
      writeFileSync(receipt, bytes);
      unlinkSync(receipt); symlinkSync(path.join(root, RECEIPT_PATH), receipt);
      expect(verifyAdmissionAtRoot(checkout.root).status).toBe('fail-closed');
      unlinkSync(receipt); writeFileSync(receipt, bytes, { mode: 0o644 });
      linkSync(receipt, path.join(checkout.root, 'synthetic-hardlink'));
      expect(verifyAdmissionAtRoot(checkout.root).status).toBe('fail-closed');
      unlinkSync(path.join(checkout.root, 'synthetic-hardlink'));
      writeFileSync(path.join(checkout.root, '.git/info/exclude'), '*\n');
      mkdirSync(path.join(checkout.root, 'synthetic-hidden'));
      writeFileSync(path.join(checkout.root, 'synthetic-hidden/.gitignore'), '*\n');
      writeFileSync(path.join(checkout.root, 'synthetic-hidden/source.mjs'), '// synthetic\n');
      expect(verifyAdmissionAtRoot(checkout.root).failures.join('\n')).toContain('unaccounted-source:');
      rmSync(path.join(checkout.root, 'synthetic-hidden'), { recursive: true });
      const checker = path.join(checkout.root, CONTROL_PATHS[1]);
      const checkerBytes = readFileSync(checker);
      writeFileSync(checker, Buffer.concat([checkerBytes, Buffer.from('\n// synthetic control mutation\n')]));
      expect(verifyAdmissionAtRoot(checkout.root).failures.join('\n')).toContain(`control-identity:${CONTROL_PATHS[1]}`);
      writeFileSync(checker, checkerBytes);
      writeFileSync(path.join(checkout.root, LEDGER_PATH), '{}\n');
      expect(verifyAdmissionAtRoot(checkout.root).failures.join('\n')).toContain('ADMISSION_NOT_FROZEN_OR_IDENTITY_MISMATCH');
    } finally { rmSync(checkout.root, { recursive: true, force: true }); }
  }, 250000);
});
