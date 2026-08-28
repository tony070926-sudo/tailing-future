import { describe, expect, it } from 'vitest';
import { gateNames, hasExactKeys, hasExactStatuses, normalizeReport, runtimeKeys } from './release-report.mjs';

const statuses = (value) => Object.fromEntries(gateNames.map((name) => [name, value]));

describe('release report policy', () => {
  it('rejects empty, missing and extra upstream gate sets', () => {
    expect(hasExactStatuses({}, 'success')).toBe(false);
    expect(hasExactStatuses({ ...statuses('success'), audit: undefined }, 'success')).toBe(false);
    expect(hasExactStatuses({ ...statuses('success'), forged: 'success' }, 'success')).toBe(false);
    expect(hasExactStatuses(statuses('success'), 'success')).toBe(true);
  });

  it('requires the exact runtime shape', () => {
    expect(hasExactKeys({}, runtimeKeys)).toBe(false);
    expect(hasExactKeys({ node: 'v24.0.0', platform: 'linux', architecture: 'x64' }, runtimeKeys)).toBe(true);
    expect(hasExactKeys({ node: 'v24.0.0', platform: 'linux', architecture: 'x64', injected: true }, runtimeKeys)).toBe(false);
  });

  it('normalizes only run-specific fields and still binds user-facing gaps', () => {
    const report = {
      generatedAt: 'local', sourceRevision: null, runtime: {}, upstreamGates: {},
      verification: { elapsedMs: 1, physics: { value: 7 } }, gaps: [{ recommendedChange: 'real' }],
    };
    const ci = {
      ...report, generatedAt: 'ci', sourceRevision: 'a'.repeat(40), runtime: { node: 'v24' },
      upstreamGates: statuses('success'), verification: { ...report.verification, elapsedMs: 2 },
    };
    expect(normalizeReport(report)).toEqual(normalizeReport(ci));
    expect(normalizeReport({ ...report, gaps: [{ recommendedChange: 'forged' }] })).not.toEqual(normalizeReport(ci));
  });
});
