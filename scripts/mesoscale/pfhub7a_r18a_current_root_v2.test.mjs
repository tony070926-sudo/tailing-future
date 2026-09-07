import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import path from 'node:path';
import { persistExecutionEvidence, requireCurrentAdmission, requireUnchangedCandidate } from './pfhub7a_r18a_current_root_v2.mjs';
import { createExecutionBudget, NUMERICAL_BUDGET_MS, STOP_GRACE_MS } from './pfhub7a_r18a_current_root.mjs';
import { INTEGRATION_BASE, SCIENTIFIC_CONTRACT_BASE } from '../backend-migration/verify-r18a-origin-main-admission-v0.3.mjs';

describe('versioned current-tree runner contract, without numerical execution', () => {
  it('retains machine-readable abstention when execution evidence cannot be persisted', () => {
    const temporary = realpathSync(mkdtempSync(path.join(tmpdir(), 'tf-v03-evidence-contract-')));
    try {
      const filename = path.join(temporary, 'execution.json');
      writeFileSync(filename, 'pre-existing evidence\n');
      const result = persistExecutionEvidence({ status: 'abstain', reason: 'ORIGINAL_FAILURE', releaseEligible: false }, temporary);
      expect(result).toMatchObject({ status: 'abstain', evidencePersisted: false, priorReason: 'ORIGINAL_FAILURE', releaseEligible: false });
      expect(result.reason).toContain('EVIDENCE_PERSISTENCE_FAILED:');
      expect(readFileSync(filename, 'utf8')).toBe('pre-existing evidence\n');
      const otherwisePassing = persistExecutionEvidence({ status: 'pass-bounded-current-root-execution', releaseEligible: false }, temporary);
      expect(otherwisePassing.status).toBe('abstain');
      expect(() => JSON.stringify(otherwisePassing)).not.toThrow();
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  });

  it('abstains with unknown integration identity when caller inputs are missing', () => {
    const result = spawnSync(process.execPath, ['scripts/mesoscale/pfhub7a_r18a_current_root_v2.mjs'], { encoding: 'utf8', timeout: 30000 });
    expect(result.status).toBe(1);
    const evidence = JSON.parse(result.stdout);
    expect(evidence).toMatchObject({ schemaVersion: 'tf.r18a-current-root-execution/0.3', scientificContractBaseCommit: SCIENTIFIC_CONTRACT_BASE, integrationBaseCommit: null, candidateTreeIdentity: null, sourceInputIdentity: null, status: 'abstain', releaseEligible: false, scientificPromotionEligible: false, commands: [] });
    expect(evidence).not.toHaveProperty('baseCommit');
    expect(evidence.budget).toMatchObject({ scientificAcceptanceMs: 600000, stopGraceMs: 1000, stopGraceExtendsAcceptance: false });
  });

  it('obtains integration identity from actual source admission rather than Git HEAD alone', () => {
    const admitted = requireCurrentAdmission(process.cwd());
    expect(admitted.integrationBaseCommit).toBe(INTEGRATION_BASE);
    expect(admitted.scientificContractBaseCommit).toBe(SCIENTIFIC_CONTRACT_BASE);
    expect(admitted.candidateTreeIdentity.gitTreeOid).toMatch(/^[a-f0-9]{40}$/);
    expect(() => requireCurrentAdmission('/nonexistent-r18a-source')).toThrow('CURRENT_ADMISSION_FAILED');
  });

  it('rejects stale bases, failed admission, missing identities and before/after drift', () => {
    const admitted = requireCurrentAdmission(process.cwd());
    expect(() => requireUnchangedCandidate(admitted, structuredClone(admitted))).not.toThrow();
    const outputsChanged = structuredClone(admitted);
    outputsChanged.candidateTreeIdentity.sha256 = 'e'.repeat(64);
    expect(requireUnchangedCandidate(admitted, outputsChanged)).toEqual({ observedTreeUnchanged: false });
    for (const mutate of [
      value => { value.integrationBaseCommit = SCIENTIFIC_CONTRACT_BASE; },
      value => { value.scientificContractBaseCommit = INTEGRATION_BASE; },
      value => { value.status = 'fail-closed'; },
      value => { value.sourceInputIdentity = null; },
      value => { value.sourceInputIdentity.sha256 = '0'.repeat(64); },
      value => { value.sourceInputIdentity.gitTreeOid = '0'.repeat(40); },
      value => { value.sourceInputIdentity.pathCount += 1; },
    ]) { const altered = structuredClone(admitted); mutate(altered); expect(() => requireUnchangedCandidate(admitted, altered)).toThrow('CANDIDATE_CHANGED_DURING_RUN'); }
  });

  it('tests the exact production final block: late admission and candidate drift cannot mark success', () => {
    const source = readFileSync(new URL('./pfhub7a_r18a_current_root_v2.mjs', import.meta.url), 'utf8');
    const block = source.match(/\/\/ FINAL_BUDGET_CHECK_BEGIN:[^\n]*\n([\s\S]*?)\/\/ FINAL_BUDGET_CHECK_END/);
    expect(block).not.toBeNull();
    const admitted = requireCurrentAdmission(process.cwd());
    for (const scenario of ['pass', 'late-admission', 'changed-candidate', 'failed-admission']) {
      let elapsed = 0;
      const evidence = { status: 'abstain' };
      const after = structuredClone(admitted);
      if (scenario === 'changed-candidate') after.sourceInputIdentity.sha256 = '0'.repeat(64);
      const context = { budget: createExecutionBudget(50, () => elapsed), evidence, admitted, cleanBootstrap: 'synthetic', lock: {}, ROOT: '/synthetic', path,
        SOURCE_HASHES: { fixture: 'expected' }, verifyBootstrap: () => { elapsed = 20; }, regularBytes: () => Buffer.from('synthetic'), hash: () => 'expected', requireUnchangedCandidate,
        requireCurrentAdmission: () => { elapsed = scenario === 'late-admission' ? 51 : 40; if (scenario === 'failed-admission') throw new Error('CURRENT_ADMISSION_FAILED'); return after; },
        requireCondition: (condition, reason) => { if (!condition) throw new Error(reason); } };
      const execute = () => runInNewContext(block[1], context, { timeout: 1000 });
      if (scenario === 'pass') { execute(); expect(evidence).toMatchObject({ status: 'pass-bounded-current-root-execution', sourceInputVerifiedBeforeAndAfter: true, observedTreeUnchanged: true }); }
      else { expect(execute).toThrow(); expect(evidence.status).toBe('abstain'); }
    }
    expect(NUMERICAL_BUDGET_MS).toBe(600000);
    expect(STOP_GRACE_MS).toBe(1000);
  });
});
