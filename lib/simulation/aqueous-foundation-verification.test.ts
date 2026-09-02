import { beforeAll, describe, expect, it } from 'vitest';
import {
  AQUEOUS_FOUNDATION_GATE_NAMES,
  assertAqueousFoundationVerification,
  runAqueousFoundationVerification,
  type AqueousFoundationVerificationReportV042,
} from './aqueous-foundation-verification.ts';

describe('foundation-only aqueous verification aggregate', () => {
  let report: AqueousFoundationVerificationReportV042;

  beforeAll(() => {
    report = runAqueousFoundationVerification();
  });

  it('executes every direct-Ewald and rigid-constraint gate', () => {
    expect(() => assertAqueousFoundationVerification(report)).not.toThrow();
    expect(AQUEOUS_FOUNDATION_GATE_NAMES).toHaveLength(15);
    for (const gateName of AQUEOUS_FOUNDATION_GATE_NAMES) expect(report.gates[gateName]).toBe(true);

    expect(report.naclPointChargeReference.absoluteEnergyErrorKjMol).toBeLessThanOrEqual(1e-8);
    expect(report.triclinicForceCheck.maximumAbsoluteForceErrorKjMolAngstrom).toBeLessThanOrEqual(5e-8);
    expect(report.alphaCutoffCheck.tightAbsoluteErrorKjMol)
      .toBeLessThan(report.alphaCutoffCheck.mediumAbsoluteErrorKjMol);
    expect(report.alphaCutoffCheck.mediumAbsoluteErrorKjMol)
      .toBeLessThan(report.alphaCutoffCheck.looseAbsoluteErrorKjMol);
    expect(report.alphaCutoffCheck.maximumAlphaAbsoluteErrorKjMol).toBeLessThanOrEqual(1e-9);

    expect(report.rejectionEvidence.nonNeutral).toMatch(/electrically neutral/);
    expect(report.rejectionEvidence.relativePermittivity).toMatch(/locked to 1/);
    expect(report.rejectionEvidence.ewaldRealWorkBudget).toMatch(/real-space work-unit limit exceeded/);
    expect(report.rejectionEvidence.ewaldReciprocalWorkBudget).toMatch(/reciprocal-space work-unit limit exceeded/);
    expect(report.rejectionEvidence.inconsistentPeriodicConstraintLoop).toMatch(/inconsistent periodic image loop/);
    expect(report.rejectionEvidence.rigidWorkBudget).toMatch(/work units/);
    expect(report.hugeImageGaugeCheck.ewald).toMatchObject({
      commonImage: { x: 1_000_000_000, y: -1_000_000_000, z: 1_000_000_000 },
      exactEvaluationEquality: true,
    });
    expect(report.hugeImageGaugeCheck.ewald.gaugedEvaluationDigest)
      .toBe(report.hugeImageGaugeCheck.ewald.referenceEvaluationDigest);
    expect(report.hugeImageGaugeCheck.rigidTip3p).toMatchObject({
      commonImage: { x: 100_000_000, y: -100_000_000, z: 100_000_000 },
      exactNormalizedResultEquality: true,
    });
    expect(report.hugeImageGaugeCheck.rigidTip3p.normalizedGaugedResultDigest)
      .toBe(report.hugeImageGaugeCheck.rigidTip3p.referenceResultDigest);
  });

  it('binds the exact TIP3P constraint fixture and explicit non-execution boundaries', () => {
    expect(report.sourcePins.openmmTip3p).toEqual({
      product: 'OpenMM',
      version: '8.5.1',
      repository: 'https://github.com/openmm/openmm',
      tag: '8.5.1',
      sourceCommit: 'f7fa0c27c1f8d943c339d67b3bf22f026d0bd8b5',
      pinClass: 'immutable-git-commit-path-size-and-sha256-metadata',
      assets: [
        {
          role: 'bare-tip3p-xml',
          filePath: 'wrappers/python/openmm/app/data/tip3p.xml',
          sizeBytes: 891,
          sha256: 'sha256:607f0fc9566c3770db2d9eb579fed68c4157578445eed1ec0aa7dccc23d57a6c',
          sourceUrl: 'https://github.com/openmm/openmm/blob/f7fa0c27c1f8d943c339d67b3bf22f026d0bd8b5/wrappers/python/openmm/app/data/tip3p.xml',
        },
        {
          role: 'amber14-tip3p-xml',
          filePath: 'wrappers/python/openmm/app/data/amber14/tip3p.xml',
          sizeBytes: 19_070,
          sha256: 'sha256:3f4b188dbcb6c02863230eaca231e927fb6bf3307ce947d8a50d0f46f6dd83d9',
          sourceUrl: 'https://github.com/openmm/openmm/blob/f7fa0c27c1f8d943c339d67b3bf22f026d0bd8b5/wrappers/python/openmm/app/data/amber14/tip3p.xml',
        },
      ],
      executionPerformed: false,
    });
    expect(report.tip3pConstraintFixture.targetDistancesAngstrom).toEqual({
      oh1: 0.9572,
      oh2: 0.9572,
      hh: 1.5139006545247014,
    });
    expect(report.tip3pConstraintFixture.periodicFaceCrossing).toBe(true);
    expect(report.tip3pConstraintFixture.maximumPositionResidualAngstrom).toBeLessThanOrEqual(1e-12);
    expect(report.tip3pConstraintFixture.maximumVelocityDerivativeResidualAngstrom2PerPicosecond)
      .toBeLessThanOrEqual(1e-12);
    expect(report.tip3pConstraintFixture.maximumCenterOfMassPositionChangeAngstrom).toBeLessThanOrEqual(1e-10);
    expect(report.tip3pConstraintFixture.centerOfMassMomentumChangeDaltonAngstromPerPicosecond)
      .toBeLessThanOrEqual(1e-10);

    expect(report.status).toBe('foundation-only-not-reproduction');
    expect(report.boundaries).toMatchObject({
      naclWaterTrajectory: false,
      pmeExecution: false,
      openmmExecution: false,
      intramolecularExclusions: false,
      virialOrStress: false,
      fullVelocityVerletRattleIntegrator: false,
      constraintImpulseEnergyAudit: false,
      licenseClearance: false,
      externalModelReproduction: false,
      scorePromotionEligible: false,
    });
    expect(report.boundaries.statements.join('\n')).toMatch(/No NaCl-water trajectory/);
    expect(report.boundaries.statements.join('\n')).toMatch(/source-integrity metadata/);
  });

  it('is deterministic, deeply frozen and detects post-run evidence changes', () => {
    const replay = runAqueousFoundationVerification();
    expect(replay).toEqual(report);
    expect(replay.verificationDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(Object.isFrozen(replay)).toBe(true);
    expect(Object.isFrozen(replay.tip3pConstraintFixture.targetDistancesAngstrom)).toBe(true);

    const tampered = structuredClone(report);
    (tampered.naclPointChargeReference as { observedCellEnergyKjMol: number }).observedCellEnergyKjMol += 1;
    expect(() => assertAqueousFoundationVerification(tampered)).toThrow(/digest mismatch/);
  });
});
