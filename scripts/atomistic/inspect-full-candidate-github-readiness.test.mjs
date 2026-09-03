import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  inspectFullCandidateGitHubReadiness,
} from './inspect-full-candidate-github-readiness.mjs';
import {
  fullCandidateGitHubRejection,
} from './full-candidate-github-evidence-policy.mjs';

const schema = JSON.parse(await readFile(new URL(
  '../../schemas/atomistic-full-candidate-github-readiness.schema.json',
  import.meta.url,
), 'utf8'));
const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);

describe('full-candidate GitHub readiness boundary', () => {
  it('fails closed before credentials, transport or dispatch when workflow ID is not pinned', () => {
    const result = inspectFullCandidateGitHubReadiness();
    expect(result).toMatchObject({
      claims: {
        claimEligible: false,
        comparisonEligible: false,
        promotionEligible: false,
        reproduced: false,
        reproductionEligible: false,
        superiorityClaimAllowed: false,
      },
      rejection: { code: 'producer-workflow-not-pinned' },
      status: 'rejected',
    });
    expect(validate(result), JSON.stringify(validate.errors)).toBe(true);
  });

  it('rejects every caller attempt to choose provenance or submit secrets', () => {
    for (const input of [
      { runId: 123 },
      { githubToken: 'must-not-be-read' },
      { source: { revision: 'a'.repeat(40) } },
      { artifact: { id: 1 } },
      { producer: { jobId: 2 } },
    ]) {
      const result = inspectFullCandidateGitHubReadiness(input);
      expect(result).toMatchObject({
        rejection: { code: 'non-self-reporting-input-rejected' },
        status: 'rejected',
      });
      expect(JSON.stringify(result)).not.toContain('must-not-be-read');
      expect(validate(result), JSON.stringify(validate.errors)).toBe(true);
    }
  });

  it('rejects command-line provenance and secret arguments rather than ignoring them', () => {
    const child = spawnSync(process.execPath, [
      fileURLToPath(new URL('./inspect-full-candidate-github-readiness.mjs', import.meta.url)),
      '--run-id',
      '123',
      '--github-token',
      'must-not-be-read',
    ], { encoding: 'utf8' });
    expect(child.status).toBe(1);
    expect(child.stderr).toBe('');
    expect(child.stdout).not.toContain('must-not-be-read');
    const result = JSON.parse(child.stdout);
    expect(result.rejection.code).toBe('non-self-reporting-input-rejected');
    expect(validate(result), JSON.stringify(validate.errors)).toBe(true);
  });

  it('normalizes arbitrary errors to a schema-total fail-closed rejection', () => {
    for (const result of [
      fullCandidateGitHubRejection(new Error(''), 'NOT VALID'),
      fullCandidateGitHubRejection(null, ''),
      fullCandidateGitHubRejection({ code: 123 }, 456),
    ]) {
      expect(result.rejection.code).toBe('github-control-plane-rejected');
      expect(result.rejection.message.length).toBeGreaterThan(0);
      expect(validate(result), JSON.stringify(validate.errors)).toBe(true);
    }
  });
});
