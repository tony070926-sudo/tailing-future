import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { digestValue } from '../lib/simulation/digest.ts';
import { PERIODIC_ATOMISTIC_VERIFICATION_GATE_NAMES } from '../lib/simulation/periodic-verification.ts';
import {
  gateNames,
  hasExactKeys,
  hasExactStatuses,
  normalizeReport,
  reportsReleaseEquivalent,
  runtimeKeys,
} from './release-report.mjs';

const statuses = (value) => Object.fromEntries(gateNames.map((name) => [name, value]));
const checkedInReport = () => JSON.parse(readFileSync(
  new URL('../evaluation/latest-report.json', import.meta.url),
  'utf8',
));

function checkedInReleasePair() {
  const local = checkedInReport();
  const ci = structuredClone(local);
  ci.generatedAt = 'ci';
  ci.sourceRevision = 'a'.repeat(40);
  ci.runtime = { architecture: 'x64', node: 'v24.16.0', platform: 'linux' };
  ci.upstreamGates = statuses('success');
  ci.verification.elapsedMs += 1;
  return { local, ci };
}

function refreshAqueousDigest(section) {
  const { verificationDigest: _verificationDigest, ...payload } = section;
  void _verificationDigest;
  section.verificationDigest = digestValue(payload);
}

function refreshPeriodicDigest(section) {
  const { verificationEvidence: _verificationEvidence, ...digests } = section.digests;
  void _verificationEvidence;
  section.digests.verificationEvidence = digestValue({
    schemaVersion: 'tf.periodic-atomistic-verification-evidence/0.4.1',
    fixture: section.fixture,
    gates: Object.fromEntries(PERIODIC_ATOMISTIC_VERIFICATION_GATE_NAMES.map(
      (name) => [name, section[name]],
    )),
    maximumResiduals: section.maximumResiduals,
    thresholds: section.thresholds,
    faceCrossings: section.faceCrossings,
    rebuilds: section.rebuilds,
    mutationEvidence: section.runtimeMutationEvidence,
    digestSemantics: section.digestSemantics,
    digests,
  });
}

function deletePath(value, dottedPath) {
  const segments = dottedPath.split('.');
  let current = value;
  for (const segment of segments.slice(0, -1)) current = current[segment];
  delete current[segments.at(-1)];
}

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
    const { local: report, ci } = checkedInReleasePair();
    report.verification.physics.coupledEnergyResidual = 4.849e-5;
    report.verification.physics.momentumResidual = 9.18e-14;
    ci.verification.physics.coupledEnergyResidual = 4.845e-5;
    ci.verification.physics.momentumResidual = 1.16e-13;

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
    const { local, ci } = checkedInReleasePair();
    const { ensemble: localEnsemble, ...localScalars } = localPhysics;
    const { ensemble: ciEnsemble, ...ciScalars } = ciPhysics;
    Object.assign(local.verification.physics, localScalars);
    Object.assign(local.verification.physics.ensemble, localEnsemble);
    Object.assign(ci.verification.physics, ciScalars);
    Object.assign(ci.verification.physics.ensemble, ciEnsemble);

    expect(reportsReleaseEquivalent(local, ci)).toBe(true);
  });

  it('allows only self-consistent portable atomistic evidence and preserves replay bindings', () => {
    const { local, ci } = checkedInReleasePair();

    const aqueous = ci.verification.aqueousFoundation;
    aqueous.triclinicForceCheck.netForceKjMolAngstrom = 7.993605777301127e-15;
    const gaugeDigest = digestValue({ platform: 'linux', evidence: 'huge-image-gauge' });
    aqueous.hugeImageGaugeCheck.ewald.referenceEvaluationDigest = gaugeDigest;
    aqueous.hugeImageGaugeCheck.ewald.gaugedEvaluationDigest = gaugeDigest;
    refreshAqueousDigest(aqueous);

    Object.assign(ci.verification.molecular, {
      linearRelativeDriftRatePerPicosecond: 7.448374106946162e-8,
      maximumCenterOfMassResidualAngstrom: 3.581197024701545e-15,
      maximumInternalForceResidualKjMolAngstrom: 2.1408600746742132e-14,
      maximumMomentumResidual: 1.7667607975809916e-13,
    });

    const periodic = ci.verification.periodicAtomistic;
    Object.assign(periodic.maximumResiduals, {
      centerOfMassAngstrom: 1.8194113260979968e-14,
      internalForceKjMolAngstrom: 8.047788858239505e-15,
      momentumDaltonAngstromPerPicosecond: 5.229694387198813e-12,
    });
    periodic.digests.configuration = digestValue({ platform: 'linux', evidence: 'configuration' });
    for (const [primary, replay] of [
      ['physicalState', 'replayPhysicalState'],
      ['fullState', 'replayFullState'],
      ['observation', 'replayObservation'],
      ['physicalTrajectory', 'replayPhysicalTrajectory'],
      ['fullStateTrajectory', 'replayFullStateTrajectory'],
      ['observationCheckpoints', 'replayObservationCheckpoints'],
    ]) {
      const pairedDigest = digestValue({ platform: 'linux', evidence: primary });
      periodic.digests[primary] = pairedDigest;
      periodic.digests[replay] = pairedDigest;
    }
    refreshPeriodicDigest(periodic);

    expect(reportsReleaseEquivalent(local, ci)).toBe(true);

    const outsideTolerance = structuredClone(ci);
    outsideTolerance.verification.periodicAtomistic.maximumResiduals
      .momentumDaltonAngstromPerPicosecond += 2e-11;
    refreshPeriodicDigest(outsideTolerance.verification.periodicAtomistic);
    expect(reportsReleaseEquivalent(local, outsideTolerance)).toBe(false);

    const aqueousOverLimit = structuredClone(ci);
    aqueousOverLimit.verification.aqueousFoundation.triclinicForceCheck
      .netForceKjMolAngstrom = 1.01e-12;
    refreshAqueousDigest(aqueousOverLimit.verification.aqueousFoundation);
    expect(reportsReleaseEquivalent(local, aqueousOverLimit)).toBe(false);

    const negativeMolecularResidual = structuredClone(ci);
    negativeMolecularResidual.verification.molecular.maximumMomentumResidual = -1e-15;
    expect(reportsReleaseEquivalent(local, negativeMolecularResidual)).toBe(false);

    const nonFiniteDrift = structuredClone(ci);
    nonFiniteDrift.verification.molecular.linearRelativeDriftRatePerPicosecond = Number.NaN;
    expect(reportsReleaseEquivalent(local, nonFiniteDrift)).toBe(false);

    const periodicOverLimit = structuredClone(ci);
    periodicOverLimit.verification.periodicAtomistic.maximumResiduals
      .momentumDaltonAngstromPerPicosecond = periodicOverLimit.verification
        .periodicAtomistic.thresholds.momentumDaltonAngstromPerPicosecond * 1.01;
    refreshPeriodicDigest(periodicOverLimit.verification.periodicAtomistic);
    expect(reportsReleaseEquivalent(local, periodicOverLimit)).toBe(false);

    for (const replay of [
      'replayPhysicalState',
      'replayFullState',
      'replayObservation',
      'replayPhysicalTrajectory',
      'replayFullStateTrajectory',
      'replayObservationCheckpoints',
    ]) {
      const brokenReplay = structuredClone(ci);
      brokenReplay.verification.periodicAtomistic.digests[replay] = digestValue({
        platform: 'linux', evidence: `broken-${replay}`,
      });
      refreshPeriodicDigest(brokenReplay.verification.periodicAtomistic);
      expect(reportsReleaseEquivalent(local, brokenReplay), replay).toBe(false);
    }

    const brokenAqueousPair = structuredClone(ci);
    brokenAqueousPair.verification.aqueousFoundation.hugeImageGaugeCheck.ewald
      .gaugedEvaluationDigest = digestValue({ platform: 'linux', evidence: 'broken-gauge' });
    refreshAqueousDigest(brokenAqueousPair.verification.aqueousFoundation);
    expect(reportsReleaseEquivalent(local, brokenAqueousPair)).toBe(false);

    const zeroDigest = structuredClone(ci);
    zeroDigest.verification.periodicAtomistic.digests.configuration = `sha256:${'0'.repeat(64)}`;
    refreshPeriodicDigest(zeroDigest.verification.periodicAtomistic);
    expect(reportsReleaseEquivalent(local, zeroDigest)).toBe(false);

    const invalidSelfDigest = structuredClone(ci);
    invalidSelfDigest.verification.aqueousFoundation.verificationDigest = `sha256:${'f'.repeat(64)}`;
    expect(reportsReleaseEquivalent(local, invalidSelfDigest)).toBe(false);

    const invalidPeriodicSelfDigest = structuredClone(ci);
    invalidPeriodicSelfDigest.verification.periodicAtomistic.digests.verificationEvidence =
      `sha256:${'e'.repeat(64)}`;
    expect(reportsReleaseEquivalent(local, invalidPeriodicSelfDigest)).toBe(false);

    const malformedDigestLocal = structuredClone(local);
    const malformedDigestCi = structuredClone(ci);
    for (const report of [malformedDigestLocal, malformedDigestCi]) {
      report.verification.periodicAtomistic.digests.configuration = 'sha256:not-a-digest';
      refreshPeriodicDigest(report.verification.periodicAtomistic);
    }
    expect(reportsReleaseEquivalent(malformedDigestLocal, malformedDigestCi)).toBe(false);

    const changedTopology = structuredClone(ci);
    changedTopology.verification.periodicAtomistic.digests.topology = digestValue({
      platform: 'linux', evidence: 'changed-topology',
    });
    refreshPeriodicDigest(changedTopology.verification.periodicAtomistic);
    expect(reportsReleaseEquivalent(local, changedTopology)).toBe(false);

    const unknownDigest = structuredClone(ci);
    unknownDigest.verification.periodicAtomistic.digests.unknown = digestValue({
      platform: 'linux', evidence: 'unknown',
    });
    refreshPeriodicDigest(unknownDigest.verification.periodicAtomistic);
    expect(reportsReleaseEquivalent(local, unknownDigest)).toBe(false);

    const sameUnknownLocal = structuredClone(local);
    const sameUnknownCi = structuredClone(ci);
    const sameUnknown = digestValue({ evidence: 'same-unknown' });
    for (const report of [sameUnknownLocal, sameUnknownCi]) {
      report.verification.periodicAtomistic.digests.unknown = sameUnknown;
      refreshPeriodicDigest(report.verification.periodicAtomistic);
    }
    expect(reportsReleaseEquivalent(sameUnknownLocal, sameUnknownCi)).toBe(false);
  });

  it('requires every portable evidence section, metric and digest group', () => {
    expect(reportsReleaseEquivalent({}, {})).toBe(false);

    for (const path of [
      'verification.aqueousFoundation',
      'verification.molecular',
      'verification.periodicAtomistic',
      'verification.aqueousFoundation.triclinicForceCheck.netForceKjMolAngstrom',
      'verification.molecular.linearRelativeDriftRatePerPicosecond',
      'verification.molecular.maximumCenterOfMassResidualAngstrom',
      'verification.molecular.maximumInternalForceResidualKjMolAngstrom',
      'verification.molecular.maximumMomentumResidual',
      'verification.periodicAtomistic.maximumResiduals.centerOfMassAngstrom',
      'verification.periodicAtomistic.maximumResiduals.internalForceKjMolAngstrom',
      'verification.periodicAtomistic.maximumResiduals.momentumDaltonAngstromPerPicosecond',
    ]) {
      const { local, ci } = checkedInReleasePair();
      deletePath(local, path);
      deletePath(ci, path);
      expect(reportsReleaseEquivalent(local, ci), path).toBe(false);
    }

    for (const path of [
      'verification.aqueousFoundation.hugeImageGaugeCheck.ewald.referenceEvaluationDigest',
      'verification.aqueousFoundation.verificationDigest',
      'verification.periodicAtomistic.digests.configuration',
      'verification.periodicAtomistic.digests.physicalState',
      'verification.periodicAtomistic.digests.fullState',
      'verification.periodicAtomistic.digests.observation',
      'verification.periodicAtomistic.digests.physicalTrajectory',
      'verification.periodicAtomistic.digests.fullStateTrajectory',
      'verification.periodicAtomistic.digests.observationCheckpoints',
      'verification.periodicAtomistic.digests.verificationEvidence',
    ]) {
      const { local, ci } = checkedInReleasePair();
      deletePath(local, path);
      deletePath(ci, path);
      expect(reportsReleaseEquivalent(local, ci), path).toBe(false);
    }
  });

  it('fails closed immediately outside the declared continuous-metric tolerance', () => {
    const { local: report, ci } = checkedInReleasePair();
    report.verification.physics.coupledEnergyResidual = 100;
    ci.verification.physics.coupledEnergyResidual = 100.2;

    expect(reportsReleaseEquivalent(report, ci)).toBe(true);
    expect(reportsReleaseEquivalent(report, {
      ...ci,
      verification: { ...ci.verification, physics: { coupledEnergyResidual: 100.21 } },
    })).toBe(false);
  });

  it('keeps manifests, report shape and non-physics numbers exact', () => {
    const { local: report, ci } = checkedInReleasePair();
    const sourcePath = Object.keys(ci.sourceManifest)[0];
    const evidencePath = Object.keys(ci.evidenceManifest)[0];

    expect(reportsReleaseEquivalent(report, ci)).toBe(true);
    expect(reportsReleaseEquivalent(report, { ...ci, weightedScore: 41.01 })).toBe(false);
    expect(reportsReleaseEquivalent(report, {
      ...ci,
      artifactDigest: digestValue({ evidence: 'forged-artifact' }),
    })).toBe(false);
    expect(reportsReleaseEquivalent(report, {
      ...ci,
      sourceManifest: { ...ci.sourceManifest, [sourcePath]: digestValue({ evidence: 'forged-source' }) },
    })).toBe(false);
    expect(reportsReleaseEquivalent(report, {
      ...ci,
      evidenceManifest: {
        ...ci.evidenceManifest,
        [evidencePath]: digestValue({ evidence: 'forged-evidence' }),
      },
    })).toBe(false);
    expect(reportsReleaseEquivalent(report, { ...ci, schemaVersion: 'tf.evaluation/forged' })).toBe(false);
    expect(reportsReleaseEquivalent(report, { ...ci, hardGateFailures: ['forged'] })).toBe(false);
    expect(reportsReleaseEquivalent(report, { ...ci, verdict: 'accept' })).toBe(false);
    expect(reportsReleaseEquivalent(report, { ...ci, injected: true })).toBe(false);
  });
});
