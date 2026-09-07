import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { DERIVED_REPORT_PATHS, buildPublicProductEvaluation, buildPublicSummary, capturedInputIdentity, checkDerivedReports, makeGenerationStatement } from './derived-report-contract.mjs';

const digest = bytes => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const entry = content => ({ content, byteLength: content.length, digest: digest(content), mode: 0o644 });
// These are source fixtures for public projection, not a scientific result.
function fixture() {
  const capturedInputs = new Map(['evaluation/baselines/registry.json', 'evaluation/current-scorecard.json'].map(file => [file, entry(readFileSync(file))]));
  capturedInputs.set('scripts/synthetic-control.mjs', entry(Buffer.from('// protocol fixture only\n')));
  const report = { ...capturedInputIdentity(capturedInputs), sourceRevision: null, hardGateFailures: [], verdict: 'conditional', gaps: [] };
  const reportBytesByPath = new Map([
    ['evaluation/latest-report.json', Buffer.from(JSON.stringify(report))],
    ['evaluation/latest-report.md', Buffer.from(`# Synthetic protocol fixture\nVerdict: **CONDITIONAL**\n${report.artifactDigest}\nBody unchanged.\n`)],
    ['evaluation/public-summary.json', buildPublicSummary(report)],
    ['evaluation/public-product-evaluation.json', buildPublicProductEvaluation(report,
      JSON.parse(capturedInputs.get('evaluation/current-scorecard.json').content),
      JSON.parse(capturedInputs.get('evaluation/baselines/registry.json').content))],
  ]);
  const input = { capturedInputs, expectedSourceRevision: null, reportBytesByPath };
  input.generationEvidence = makeGenerationStatement({ ...input, workerExitCode: 0 });
  return input;
}
const abstains = input => {
  const result = checkDerivedReports(input);
  expect(result).toMatchObject({ status: 'abstain', releaseEligible: false, executionAuthenticated: false, scientificValidation: false });
  expect(result.reasons.length).toBeGreaterThan(0);
  return result.reasons.join('\n');
};
function editReport(input, edit) {
  const report = JSON.parse(input.reportBytesByPath.get('evaluation/latest-report.json'));
  edit(report);
  input.reportBytesByPath.set('evaluation/latest-report.json', Buffer.from(JSON.stringify(report)));
}

describe('derived report byte consistency, not execution or scientific authentication', () => {
  it('accepts complete synthetic source-bound projections without granting readiness or release', () => {
    const result = checkDerivedReports(fixture());
    expect(result).toMatchObject({ status: 'pass-derived-report-consistency', releaseEligible: false, executionAuthenticated: false, scientificValidation: false, reasons: [] });
    expect(result.outputIdentities).toHaveLength(4);
  });

  it.each([['all absent', [...DERIVED_REPORT_PATHS]], ...DERIVED_REPORT_PATHS.map(file => [`missing ${file}`, [file]]), ['partial publication', DERIVED_REPORT_PATHS.slice(0, 2)]])('%s abstains', (_name, missing) => {
    const input = fixture();
    for (const file of missing) input.reportBytesByPath.delete(file);
    expect(abstains(input)).toContain('FOUR_REPORTS_REQUIRED');
  });

  it.each(DERIVED_REPORT_PATHS)('detects any changed output bytes: %s', file => {
    const input = fixture();
    input.reportBytesByPath.set(file, Buffer.concat([input.reportBytesByPath.get(file), Buffer.from('\n')]));
    expect(abstains(input)).toContain('GENERATION_SOURCE_OR_OUTPUT_MISMATCH');
  });

  it('detects Markdown body changes even if verdict and source digest survive', () => {
    const input = fixture();
    const file = 'evaluation/latest-report.md';
    input.reportBytesByPath.set(file, Buffer.from(input.reportBytesByPath.get(file).toString().replace('Body unchanged.', 'Body materially altered.')));
    expect(abstains(input)).toContain('GENERATION_SOURCE_OR_OUTPUT_MISMATCH');
  });

  it.each(['sourceManifest', 'sourceFileCount', 'artifactDigest', 'sourceRevision'])('rejects a stale %s even with a refreshed byte statement', field => {
    const input = fixture();
    editReport(input, report => { report[field] = field === 'sourceManifest' ? {} : field === 'sourceFileCount' ? 999 : field === 'sourceRevision' ? 'a'.repeat(40) : `sha256:${'a'.repeat(64)}`; });
    input.generationEvidence = makeGenerationStatement({ ...input, workerExitCode: 0 });
    expect(abstains(input)).toContain('not bound to the frozen source snapshot');
  });

  it.each(DERIVED_REPORT_PATHS.filter(file => file.endsWith('.json')))('rejects duplicate decoded JSON keys in %s', file => {
    const input = fixture();
    const original = input.reportBytesByPath.get(file).toString();
    const mutated = original.replace('{', '{"duplicate":1,"dupli\\u0063ate":2,');
    input.reportBytesByPath.set(file, Buffer.from(mutated));
    expect(abstains(input)).toContain('duplicate JSON key');
  });

  it('rejects absent, unsuccessful, wrong-revision and extra-field generation evidence', () => {
    for (const mutate of [
      input => { delete input.generationEvidence; },
      input => { input.generationEvidence.workerExitCode = 1; },
      input => { input.generationEvidence.sourceRevision = 'a'.repeat(40); },
      input => { input.generationEvidence.publicationVerified = false; },
      input => { input.generationEvidence.executionAuthenticated = true; },
      input => { input.generationEvidence.extra = true; },
    ]) { const input = fixture(); mutate(input); abstains(input); }
  });

  it('rejects altered public projections even if the unsigned byte statement is refreshed', () => {
    for (const file of ['evaluation/public-summary.json', 'evaluation/public-product-evaluation.json']) {
      const input = fixture();
      const altered = JSON.parse(input.reportBytesByPath.get(file));
      if (file.endsWith('public-summary.json')) altered.verdict = 'accept';
      else altered.scorecard.dimensions[0].score = (altered.scorecard.dimensions[0].score + 1) % 5;
      input.reportBytesByPath.set(file, Buffer.from(`${JSON.stringify(altered, null, 2)}\n`));
      input.generationEvidence = makeGenerationStatement({ ...input, workerExitCode: 0 });
      expect(abstains(input)).toContain('PROJECTION_MISMATCH');
    }
  });

  it('rejects changed captured source or control, bad captured digest, and mode drift', () => {
    for (const mutate of [
      input => { input.capturedInputs.set('scripts/synthetic-control.mjs', entry(Buffer.from('// changed control\n'))); },
      input => { input.capturedInputs.get('evaluation/current-scorecard.json').digest = `sha256:${'0'.repeat(64)}`; },
      input => { input.capturedInputs.get('scripts/synthetic-control.mjs').mode = 0o444; },
    ]) { const input = fixture(); mutate(input); abstains(input); }
  });

  it('rejects worker reject/nonzero rather than treating output presence as success', () => {
    const input = fixture();
    editReport(input, report => { report.verdict = 'reject'; report.hardGateFailures = ['synthetic failure']; });
    input.generationEvidence = makeGenerationStatement({ ...input, workerExitCode: 1 });
    expect(abstains(input)).toContain('GENERATION_NOT_SUCCESSFUL');
    input.generationEvidence = makeGenerationStatement({ ...input, workerExitCode: 0 });
    expect(abstains(input)).toContain('exit/report mismatch');
  });

  it('rejects empty and invalid UTF-8 output rather than replacing bytes', () => {
    for (const bytes of [Buffer.alloc(0), Buffer.from([0xff])]) {
      const input = fixture();
      input.reportBytesByPath.set('evaluation/latest-report.md', bytes);
      abstains(input);
    }
  });
});
