import { describe, expect, it } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { captureInventory, inspectSuccessor, LEDGER_PATH, replayHistoricalTests, SCHEMA_PATH, validateInventory, validateSemantics, verifyAdmissionAtRoot } from './verify-r18a-origin-main-admission-v0.2.mjs';

const root = process.cwd();
describe('fixed-base R18a admission successor', () => {
  it('executes every unchanged historical preparation test in the reconstructed pinned tree', async () => {
    const evidence = await replayHistoricalTests(root);
    expect(evidence).toMatchObject({ reconstructedMainFiles: 449, reconstructedHistoricalFiles: 11, exitCode: 0, historicalOnly: true });
    expect(evidence.lifecycle).toMatchObject({ cleanupConfirmed: true, stopGraceMs: 1000 });
    expect(evidence.lifecycle.timeoutMs).toBeLessThanOrEqual(120000);
    console.log(JSON.stringify({ historicalReplayEvidence: evidence }));
  }, 120000);
  it('validates the actual current tree without transferring historical approval', () => {
    expect(verifyAdmissionAtRoot(root)).toMatchObject({ status: 'pass-bounded-integration-inventory', releaseEligible: false, historicalCandidateIdentityTransferred: false, failures: [] });
  });
  it('rejects missing, extra, duplicate, mutated and renamed excluded source identities', () => {
    const { ledger, previous } = inspectSuccessor(root);
    const records = captureInventory(root, ledger);
    expect(validateInventory(records.slice(1), ledger, previous).join('\n')).toContain('missing-source:');
    expect(validateInventory([...records, records[0]], ledger, previous).join('\n')).toContain('duplicate/unsafe:');
    const extra = { path: 'evaluation/reviews/unregistered.json', mode: 0o644, size: 1, sha256: 'a'.repeat(64) };
    expect(validateInventory([...records, extra], ledger, previous).join('\n')).toContain('unaccounted-source:');
    expect(validateInventory(records.map((record, index) => index ? record : { ...record, sha256: 'b'.repeat(64) }), ledger, previous).join('\n')).toContain('identity-drift:');
    const excluded = previous.entries.find(entry => entry.disposition === 'excluded-r12-redistribution-unresolved');
    expect(validateInventory([...records, { ...extra, sha256: excluded.legacyIdentity.sha256 }], ledger, previous).join('\n')).toContain('R12-excluded:');
  });
  it('rejects unknown imports, forged quantities and promoted scientific or historical claims', () => {
    const { ledger, previous } = inspectSuccessor(root);
    const schema = JSON.parse(readFileSync(SCHEMA_PATH));
    for (const mutate of [
      value => { value.imports[0].sha256 = '0'.repeat(64); },
      value => { value.imports[0].path = 'lib/knowledge/unapproved.ts'; },
      value => { value.claims.historicalApprovalTransferred = true; },
      value => { value.claims.convergenceVerified = true; },
      value => { value.claims.releaseEligible = true; },
      value => { value.counts.pendingNonR12LegacyOnly = 0; },
    ]) { const altered = structuredClone(ledger); mutate(altered); expect(validateSemantics(altered, previous, schema).length).toBeGreaterThan(0); }
  });
  it('cannot hide new sources with local ignore rules and cannot mutate the frozen ledger', () => {
    const { ledger } = inspectSuccessor(root);
    const records = captureInventory(root, ledger);
    const temporary = realpathSync(mkdtempSync(path.join(tmpdir(), 'tf-admission-successor-')));
    try {
      execFileSync('/usr/bin/git', ['init', '--quiet', temporary]);
      for (const record of records) { const destination = path.join(temporary, record.path); mkdirSync(path.dirname(destination), { recursive: true }); copyFileSync(path.join(root, record.path), destination); }
      expect(verifyAdmissionAtRoot(temporary).failures).toEqual([]);
      writeFileSync(path.join(temporary, '.git/info/exclude'), '*\n');
      writeFileSync(path.join(temporary, 'scripts/hidden-new-source.mjs'), '// synthetic source\n');
      expect(verifyAdmissionAtRoot(temporary).failures.join('\n')).toContain('unaccounted-source: scripts/hidden-new-source.mjs');
      writeFileSync(path.join(temporary, LEDGER_PATH), '{}\n');
      expect(verifyAdmissionAtRoot(temporary).failures.join('\n')).toContain('frozen ledger/schema identity mismatch');
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  });
});
