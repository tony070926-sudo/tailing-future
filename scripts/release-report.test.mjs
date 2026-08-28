import { describe, expect, it } from 'vitest';
import {
  gateNames,
  hasExactKeys,
  hasExactStatuses,
  normalizeReport,
  reportsReleaseEquivalent,
  runtimeKeys,
} from './release-report.mjs';

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

  it('allows bounded cross-platform physics noise but keeps discrete evidence exact', () => {
    const report = {
      generatedAt: 'local', sourceRevision: null, runtime: {}, upstreamGates: {},
      verification: {
        elapsedMs: 1,
        physics: {
          coupledEnergyResidual: 4.849e-5,
          momentumResidual: 9.18e-14,
          reactionCount: 35,
          ensemble: { seeds: [73, 97], horizonSteps: 5000 },
        },
      },
      sourceManifest: { 'source.ts': 'sha256:real' },
      gaps: [{ recommendedChange: 'real' }],
    };
    const ci = {
      ...report,
      generatedAt: 'ci',
      sourceRevision: 'a'.repeat(40),
      runtime: { node: 'v24' },
      upstreamGates: statuses('success'),
      verification: {
        elapsedMs: 2,
        physics: {
          ...report.verification.physics,
          coupledEnergyResidual: 4.845e-5,
          momentumResidual: 1.16e-13,
        },
      },
    };

    expect(reportsReleaseEquivalent(report, ci)).toBe(true);
    expect(reportsReleaseEquivalent(report, {
      ...ci,
      verification: { ...ci.verification, physics: { ...ci.verification.physics, coupledEnergyResidual: 4.8e-5 } },
    })).toBe(false);
    expect(reportsReleaseEquivalent(report, {
      ...ci,
      verification: { ...ci.verification, physics: { ...ci.verification.physics, reactionCount: 36 } },
    })).toBe(false);
    expect(reportsReleaseEquivalent(report, {
      ...ci,
      verification: {
        ...ci.verification,
        physics: { ...ci.verification.physics, ensemble: { ...ci.verification.physics.ensemble, horizonSteps: 5001 } },
      },
    })).toBe(false);
    expect(reportsReleaseEquivalent(report, {
      ...ci,
      verification: {
        ...ci.verification,
        physics: { ...ci.verification.physics, ensemble: { ...ci.verification.physics.ensemble, seeds: [97, 73] } },
      },
    })).toBe(false);
    expect(reportsReleaseEquivalent(report, {
      ...ci,
      verification: { ...ci.verification, physics: { ...ci.verification.physics, injectedMetric: 1 } },
    })).toBe(false);
  });

  it('accepts the observed macOS/Linux R2 continuous-metric variance', () => {
    const localPhysics = {
      coupledEnergyResidual: 0.00004849491976821505,
      exchangeClosureRelative: 3.4807669308201827e-12,
      exchangeClosureResidual: 5.662129966277352e-10,
      fourierMaximumEnergyResidual: 1.0362081563168122e-15,
      fourierMinimumObservedOrder: 1.9133821882919244,
      heatClosureRelative: 2.9313829203488066e-13,
      heatClosureResidual: 4.7684522996860323e-11,
      interfaceEnergyMoved: 297.29397388458176,
      momentumResidual: 2.085203252048161e-14,
      rawParticleMomentumResidual: 1.350215678031751e-13,
      reactionClosureRelative: 8.026356255560663e-16,
      reactionClosureResidual: 1.3056396241939439e-13,
      ensemble: {
        energyResidualTail: {
          maximum: 0.00005369341443928261,
          p50: 0.00003938393649304396,
          p95: 0.00005187394130440896,
          p99: 0.00005332951981230788,
        },
        maximumEnergyResidual: 0.00005369341443928261,
        maximumMomentumResidual: 9.180878372997513e-14,
        maximumRawParticleMomentumResidual: 1.350215678031751e-13,
      },
    };
    const ciPhysics = {
      coupledEnergyResidual: 0.00004845030834919124,
      exchangeClosureRelative: 3.474770427424661e-12,
      exchangeClosureResidual: 5.652375512088526e-10,
      fourierMaximumEnergyResidual: 1.0362081563168124e-15,
      fourierMinimumObservedOrder: 1.913382188292019,
      heatClosureRelative: 2.970258360657411e-13,
      heatClosureResidual: 4.831690603168681e-11,
      interfaceEnergyMoved: 297.29723324315637,
      momentumResidual: 1.9250500822631998e-14,
      rawParticleMomentumResidual: 3.892264281827444e-14,
      reactionClosureRelative: 9.51869438670151e-16,
      reactionClosureResidual: 1.5483968274221382e-13,
      ensemble: {
        energyResidualTail: {
          maximum: 0.000053696613061944386,
          p50: 0.000039442991764918175,
          p95: 0.000051860406412480785,
          p99: 0.000053329371732051666,
        },
        maximumEnergyResidual: 0.000053696613061944386,
        maximumMomentumResidual: 1.158612715107467e-13,
        maximumRawParticleMomentumResidual: 1.5730641130799312e-13,
      },
    };
    const local = { generatedAt: 'local', sourceRevision: null, runtime: {}, upstreamGates: {}, verification: { elapsedMs: 1, physics: localPhysics } };
    const ci = { generatedAt: 'ci', sourceRevision: 'a'.repeat(40), runtime: {}, upstreamGates: statuses('success'), verification: { elapsedMs: 2, physics: ciPhysics } };

    expect(reportsReleaseEquivalent(local, ci)).toBe(true);
  });

  it('fails closed immediately outside the declared continuous-metric tolerance', () => {
    const report = {
      generatedAt: 'local', sourceRevision: null, runtime: {}, upstreamGates: {},
      verification: { elapsedMs: 1, physics: { coupledEnergyResidual: 100 } },
    };
    const ci = {
      ...report, generatedAt: 'ci', sourceRevision: 'a'.repeat(40), upstreamGates: statuses('success'),
      verification: { elapsedMs: 2, physics: { coupledEnergyResidual: 100.2 } },
    };

    expect(reportsReleaseEquivalent(report, ci)).toBe(true);
    expect(reportsReleaseEquivalent(report, {
      ...ci,
      verification: { ...ci.verification, physics: { coupledEnergyResidual: 100.21 } },
    })).toBe(false);
  });

  it('keeps manifests, report shape and non-physics numbers exact', () => {
    const report = {
      generatedAt: 'local', sourceRevision: null, runtime: {}, upstreamGates: {},
      weightedScore: 41,
      verification: { elapsedMs: 1, physics: { value: 7 } },
      sourceManifest: { 'source.ts': 'sha256:real' },
    };
    const ci = {
      ...report, generatedAt: 'ci', sourceRevision: 'a'.repeat(40), runtime: { node: 'v24' },
      upstreamGates: statuses('success'), verification: { ...report.verification, elapsedMs: 2 },
    };

    expect(reportsReleaseEquivalent(report, { ...ci, weightedScore: 41.01 })).toBe(false);
    expect(reportsReleaseEquivalent(report, { ...ci, sourceManifest: { 'source.ts': 'sha256:forged' } })).toBe(false);
    expect(reportsReleaseEquivalent(report, { ...ci, verdict: 'accept' })).toBe(false);
    expect(reportsReleaseEquivalent(report, { ...ci, injected: true })).toBe(false);
  });
});
