import { beforeAll, describe, expect, it } from 'vitest';
import {
  AQUEOUS_DYNAMICS_CONVERGENCE_ABSOLUTE_ENERGY_LIMIT_KJ_MOL_V042,
  AQUEOUS_DYNAMICS_CONVERGENCE_FORCE_COMPONENT_LIMIT_KJ_MOL_ANGSTROM_V042,
  AQUEOUS_DYNAMICS_CONVERGENCE_GATE_NAMES_V042,
  AQUEOUS_DYNAMICS_CONVERGENCE_RELATIVE_ENERGY_LIMIT_V042,
  AQUEOUS_DYNAMICS_FORCE_DIFFERENCE_LIMIT_KJ_MOL_ANGSTROM_V042,
  AQUEOUS_DYNAMICS_FORCE_DIFFERENCE_STEP_ANGSTROM_V042,
  assertAqueousDynamicsConvergenceVerificationV042,
  runAqueousDynamicsConvergenceVerificationV042,
  type AqueousDynamicsConvergenceReportV042,
} from './aqueous-dynamics-convergence.ts';
import { digestValue } from './digest.ts';

describe('v0.4.2 aqueous initial-snapshot convergence verification', () => {
  let report: AqueousDynamicsConvergenceReportV042;

  beforeAll(() => {
    report = runAqueousDynamicsConvergenceVerificationV042();
  }, 600_000);

  it('compares the locked loose Ewald/composer snapshot with the tighter direct sum', () => {
    expect(() => assertAqueousDynamicsConvergenceVerificationV042(report)).not.toThrow();
    expect(report.snapshot.step).toBe(0);
    expect(report.ewaldAndComposerComparison).toMatchObject({
      scope: 'single-locked-initial-snapshot-only',
      interpretation: 'empirical-finite-sum-comparison-not-a-strict-error-bound',
      looseSettings: {
        alphaInverseAngstrom: 0.4,
        realSpaceCutoffAngstrom: 9,
        reciprocalCutoffInverseAngstrom: 3,
      },
      tightSettings: {
        alphaInverseAngstrom: 0.45,
        realSpaceCutoffAngstrom: 18,
        reciprocalCutoffInverseAngstrom: 7,
      },
    });
    const comparison = report.ewaldAndComposerComparison;
    expect(comparison.energyKjMol.absoluteComposerDifference)
      .toBeLessThanOrEqual(AQUEOUS_DYNAMICS_CONVERGENCE_ABSOLUTE_ENERGY_LIMIT_KJ_MOL_V042);
    expect(comparison.energyKjMol.relativeComposerDifference)
      .toBeLessThanOrEqual(AQUEOUS_DYNAMICS_CONVERGENCE_RELATIVE_ENERGY_LIMIT_V042);
    expect(comparison.energyKjMol.relativeComposerDenominator).toBe(
      Math.max(1, Math.abs(comparison.energyKjMol.tightComposerTotalPotential)),
    );
    expect(comparison.energyKjMol.looseComposerDirectEwald)
      .toBe(comparison.energyKjMol.looseDirectEwald);
    expect(comparison.energyKjMol.tightComposerDirectEwald)
      .toBe(comparison.energyKjMol.tightDirectEwald);
    expect(comparison.maximumAbsoluteComposerForceComponentDifferenceKjMolAngstrom)
      .toBeLessThanOrEqual(
        AQUEOUS_DYNAMICS_CONVERGENCE_FORCE_COMPONENT_LIMIT_KJ_MOL_ANGSTROM_V042,
      );
    expect(comparison.forcesByAtom).toHaveLength(8);
    expect(new Set(comparison.forcesByAtom.map((entry) => entry.atomId)).size).toBe(8);
    for (const force of comparison.forcesByAtom) {
      expect(force.looseComposerDirectEwaldKjMolAngstrom)
        .toEqual(force.looseDirectEwaldKjMolAngstrom);
      expect(force.tightComposerDirectEwaldKjMolAngstrom)
        .toEqual(force.tightDirectEwaldKjMolAngstrom);
    }
    expect(comparison.workReceipt.looseDirectEwald.totalWorkUnitsConsumed).toBeGreaterThan(0);
    expect(comparison.workReceipt.tightDirectEwald.totalWorkUnitsConsumed)
      .toBeGreaterThan(comparison.workReceipt.looseDirectEwald.totalWorkUnitsConsumed);
    expect(comparison.workReceipt.totalReceiptedWorkUnits).toBe(
      comparison.workReceipt.looseDirectEwald.totalWorkUnitsConsumed
      + comparison.workReceipt.tightDirectEwald.totalWorkUnitsConsumed
      + comparison.workReceipt.looseComposerTotalWorkUnitsConsumed
      + comparison.workReceipt.tightComposerTotalWorkUnitsConsumed,
    );
    expect(comparison.comparisonDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it('executes a transparent five-point centered finite difference for all 24 force components', () => {
    const finiteDifference = report.composerFiniteDifference;
    expect(finiteDifference).toMatchObject({
      snapshotStep: 0,
      componentCount: 24,
      atomCount: 8,
      axesPerAtom: 3,
      stencil: 'five-point-centered-fourth-order',
      derivativeFormula: '[-E(+2h)+8E(+h)-8E(-h)+E(-2h)]/(12h)',
      forceConvention: 'force-is-negative-energy-gradient',
      gradientTarget:
        'raw-unconstrained-nonbonded-composer-potential-not-rattle-projected-force',
      stepAngstrom: AQUEOUS_DYNAMICS_FORCE_DIFFERENCE_STEP_ANGSTROM_V042,
      absoluteErrorLimitKjMolAngstrom:
        AQUEOUS_DYNAMICS_FORCE_DIFFERENCE_LIMIT_KJ_MOL_ANGSTROM_V042,
    });
    expect(finiteDifference.components).toHaveLength(24);
    expect(new Set(finiteDifference.components.map((entry) => `${entry.atomId}:${entry.axis}`)).size)
      .toBe(24);
    for (const component of finiteDifference.components) {
      expect(component.perturbations.map((entry) => entry.offsetSteps)).toEqual([-2, -1, 1, 2]);
      expect(component.perturbations).toHaveLength(4);
      expect(component.perturbations.every((entry) => entry.workUnitsConsumed > 0)).toBe(true);
      expect(component.absoluteErrorKjMolAngstrom)
        .toBeLessThanOrEqual(AQUEOUS_DYNAMICS_FORCE_DIFFERENCE_LIMIT_KJ_MOL_ANGSTROM_V042);
    }
    expect(finiteDifference.maximumAbsoluteErrorKjMolAngstrom)
      .toBeLessThanOrEqual(AQUEOUS_DYNAMICS_FORCE_DIFFERENCE_LIMIT_KJ_MOL_ANGSTROM_V042);
    expect(finiteDifference.workReceipt).toMatchObject({
      referenceEvaluationCount: 1,
      perturbationEvaluationCount: 96,
      deterministicOrder:
        'stable-atom-id-then-axis-then-offset-minus2-minus1-plus1-plus2',
    });
    const perturbationWork = finiteDifference.components.flatMap((component) => (
      component.perturbations.map((entry) => entry.workUnitsConsumed)
    )).reduce((sum, value) => sum + value, 0);
    expect(finiteDifference.workReceipt.perturbationEvaluationWorkUnitsConsumed)
      .toBe(perturbationWork);
    expect(finiteDifference.workReceipt.totalReceiptedWorkUnits).toBe(
      finiteDifference.workReceipt.referenceEvaluationWorkUnitsConsumed + perturbationWork,
    );
  });

  it('binds all evidence, is deeply frozen, and keeps claim boundaries explicit', () => {
    for (const gate of AQUEOUS_DYNAMICS_CONVERGENCE_GATE_NAMES_V042) {
      expect(report.gates[gate]).toBe(true);
    }
    expect(report.claimBoundaries).toEqual({
      finiteSizeCalibrationOnly: true,
      bulkClaim: false,
      diluteClaim: false,
      equilibriumClaim: false,
      externalEngineExecution: false,
      externalEngineReproduction: false,
      trajectoryEvidence: false,
      rigorousTruncationErrorBound: false,
      mechanicalObservableReceiptIncluded: false,
    });
    expect(report.verificationDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(report.snapshot.snapshotDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expectDeepFrozen(report);
    expect(() => {
      (report.gates as Record<string, boolean>).lockedInitialSnapshot = false;
    }).toThrow();
  });

  it('rejects outer and nested receipt tampering, including after an outer-digest refresh', () => {
    const outerTamper = structuredClone(report);
    (outerTamper.ewaldAndComposerComparison.energyKjMol as { absoluteComposerDifference: number })
      .absoluteComposerDifference += 1e-4;
    expect(() => assertAqueousDynamicsConvergenceVerificationV042(outerTamper))
      .toThrow('verification digest mismatch');

    const nestedTamper = structuredClone(report);
    (nestedTamper.ewaldAndComposerComparison.workReceipt as { totalReceiptedWorkUnits: number })
      .totalReceiptedWorkUnits += 1;
    const { verificationDigest: _oldDigest, ...payload } = nestedTamper;
    void _oldDigest;
    (nestedTamper as { verificationDigest: string }).verificationDigest = digestValue(payload);
    expect(() => assertAqueousDynamicsConvergenceVerificationV042(nestedTamper))
      .toThrow('Ewald comparison digest mismatch');
  });

  it('rejects consistently re-digested threshold and atom-axis namespace forgeries', () => {
    const thresholdForgery = structuredClone(report);
    (thresholdForgery.ewaldAndComposerComparison.thresholds as {
      absoluteEnergyDifferenceKjMol: number;
    }).absoluteEnergyDifferenceKjMol = 1;
    refreshComparisonDigest(thresholdForgery);
    refreshOuterDigest(thresholdForgery);
    freezeDeep(thresholdForgery);
    expect(() => assertAqueousDynamicsConvergenceVerificationV042(thresholdForgery))
      .toThrow('thresholds are not locked');

    const namespaceForgery = structuredClone(report);
    (namespaceForgery.composerFiniteDifference.components[0] as { atomId: string }).atomId =
      namespaceForgery.composerFiniteDifference.components[3].atomId;
    refreshFiniteDifferenceDigest(namespaceForgery);
    refreshOuterDigest(namespaceForgery);
    freezeDeep(namespaceForgery);
    expect(() => assertAqueousDynamicsConvergenceVerificationV042(namespaceForgery))
      .toThrow(/locked atom-axis order/);
  });
});

function expectDeepFrozen(value: unknown) {
  if (value && typeof value === 'object') {
    expect(Object.isFrozen(value)).toBe(true);
    for (const child of Object.values(value)) expectDeepFrozen(child);
  }
}

function refreshComparisonDigest(report: AqueousDynamicsConvergenceReportV042) {
  const comparison = report.ewaldAndComposerComparison;
  const { comparisonDigest: _oldDigest, ...payload } = comparison;
  void _oldDigest;
  (comparison as { comparisonDigest: string }).comparisonDigest = digestValue(payload);
}

function refreshFiniteDifferenceDigest(report: AqueousDynamicsConvergenceReportV042) {
  const section = report.composerFiniteDifference;
  const { verificationDigest: _oldDigest, ...payload } = section;
  void _oldDigest;
  (section as { verificationDigest: string }).verificationDigest = digestValue(payload);
}

function refreshOuterDigest(report: AqueousDynamicsConvergenceReportV042) {
  const { verificationDigest: _oldDigest, ...payload } = report;
  void _oldDigest;
  (report as { verificationDigest: string }).verificationDigest = digestValue(payload);
}

function freezeDeep<Value>(value: Value): Value {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) freezeDeep(child);
  }
  return value;
}
