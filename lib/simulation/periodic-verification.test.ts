import { beforeAll, describe, expect, it } from 'vitest';
import {
  assertPeriodicAtomisticVerification,
  PERIODIC_ATOMISTIC_VERIFICATION_GATE_NAMES,
  PERIODIC_ATOMISTIC_VERIFICATION_STEPS,
  runPeriodicAtomisticVerification,
  type PeriodicAtomisticVerificationReportV041,
} from './periodic-verification.ts';

describe('periodic atomistic executable verification', () => {
  let report: PeriodicAtomisticVerificationReportV041;

  beforeAll(() => {
    report = runPeriodicAtomisticVerification();
  }, 120_000);

  it('executes the locked 10,000-step Argon trajectory and independent deterministic replay', () => {
    expect(() => assertPeriodicAtomisticVerification(report)).not.toThrow();
    expect(report.fixture).toMatchObject({
      scenarioId: 'periodic-fcc-argon-calibration/v1',
      atomCount: 32,
      stepsExecuted: PERIODIC_ATOMISTIC_VERIFICATION_STEPS,
      independentReplayStepsExecuted: PERIODIC_ATOMISTIC_VERIFICATION_STEPS,
      energySampleCount: PERIODIC_ATOMISTIC_VERIFICATION_STEPS + 1,
    });
    expect(report.fixture.finalTimePicoseconds).toBe(10);
    expect(report.faceCrossings).toBeGreaterThan(0);
    expect(report.rebuilds).toBeGreaterThan(1);
    expect(report.runtimeMutationEvidence.casesExecuted).toBeGreaterThanOrEqual(10);
    expect(report.runtimeMutationEvidence.casesRejected).toBe(report.runtimeMutationEvidence.casesExecuted);
    expect(report.runtimeMutationEvidence.unexpectedlyAcceptedCaseIds).toEqual([]);
    for (const gate of PERIODIC_ATOMISTIC_VERIFICATION_GATE_NAMES) expect(report[gate]).toBe(true);
    expect(report.maximumResiduals.relativeEnergyExcursion).toBeLessThanOrEqual(report.thresholds.relativeEnergyExcursion);
    expect(report.maximumResiduals.momentumDaltonAngstromPerPicosecond)
      .toBeLessThanOrEqual(report.thresholds.momentumDaltonAngstromPerPicosecond);
    expect(report.maximumResiduals.internalForceKjMolAngstrom)
      .toBeLessThanOrEqual(report.thresholds.internalForceKjMolAngstrom);
    expect(report.maximumResiduals.centerOfMassAngstrom).toBeLessThanOrEqual(report.thresholds.centerOfMassAngstrom);
    expect(report.maximumResiduals.massDalton).toBe(0);
    expect(report.maximumResiduals.chargeE).toBe(0);
    expect(report.digests.physicalState).toBe(report.digests.replayPhysicalState);
    expect(report.digests.fullState).toBe(report.digests.replayFullState);
    expect(report.digests.observation).toBe(report.digests.replayObservation);
    expect(report.digests.physicalTrajectory).toBe(report.digests.replayPhysicalTrajectory);
    expect(report.digests.fullStateTrajectory).toBe(report.digests.replayFullStateTrajectory);
    expect(report.digests.observationCheckpoints).toBe(report.digests.replayObservationCheckpoints);
    expect(report.digests.verificationEvidence).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(report.digestSemantics).toEqual({
      algorithm: 'SHA-256',
      purpose: 'deterministic-integrity-and-replay-comparison',
      authenticity: 'not-provided',
      signed: false,
    });
    expect(Object.isFrozen(report)).toBe(true);
    expect(Object.isFrozen(report.maximumResiduals)).toBe(true);
  });

  it('rejects a report whose evidence was changed after execution', () => {
    const tampered = structuredClone(report);
    (tampered as { faceCrossings: number }).faceCrossings += 1;
    expect(() => assertPeriodicAtomisticVerification(tampered)).toThrow('evidence digest mismatch');
  });
});
