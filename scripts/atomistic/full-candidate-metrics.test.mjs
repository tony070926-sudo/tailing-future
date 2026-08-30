import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  BINARY64_METRIC_EVIDENCE_ROOT_PROTOCOL,
  EV_PER_ANGSTROM3_TO_GPA,
  PER_ID_METRIC_EVIDENCE_ROOT_PROTOCOL,
  binary64MetricEvidenceRoot,
  computeRecordMetrics,
  cpythonFsum,
  evaluateFullCandidateMetrics,
  hf7Quantile,
  perIdMetricEvidenceRoot,
  summarizeMetricEntries,
} from './full-candidate-metrics.mjs';

const MATTERSIM = 'mattersim-v1.0.0-5m';
const MACE = 'mace-mpa-0-medium';
const zeros = (length) => Array(length).fill(0);
const idAt = (index) => `random-TP-${String(index).padStart(6, '0')}`;
const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

function referenceAt(index) {
  const id = idAt(index);
  return {
    id,
    atomCount: 16,
    atomicNumbers: Array(16).fill(14),
    inputStructureDigest: digest(`structure:${id}`),
    energy: 0,
    forces: zeros(48),
    stress: zeros(9),
  };
}

function predictionFor(reference, modelId = MATTERSIM) {
  return {
    schemaVersion: 'tf.atomistic-prediction/0.3',
    status: 'success',
    id: reference.id,
    modelId,
    atomCount: reference.atomCount,
    atomicNumbers: [...reference.atomicNumbers],
    inputStructureDigest: reference.inputStructureDigest,
    energyEv: reference.energy,
    forcesEvPerAngstrom: Array.from({ length: reference.atomCount }, () => [0, 0, 0]),
    stressAseEvPerAngstrom3: Array.from({ length: 3 }, () => [0, 0, 0]),
  };
}

function fullFixture(modelId = MATTERSIM) {
  const references = Array.from({ length: 693 }, (_, index) => referenceAt(index));
  return { references, predictions: references.map((reference) => predictionFor(reference, modelId)) };
}

function littleEndianHex(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeDoubleLE(value);
  return bytes.toString('hex');
}

describe('CPython-compatible finite fsum and HF7', () => {
  it('matches precomputed Python 3.12 binary64 golden cases, including cancellation and half-even correction', () => {
    const cases = [
      [[], '0000000000000000'],
      [[1e100, 1, -1e100], '000000000000f03f'],
      [[1e16, 1, -1e16], '000000000000f03f'],
      [[1, 2 ** -53, 2 ** -53], '010000000000f03f'],
      [[2 ** 53, 1, 1, -(2 ** 53)], '0000000000000040'],
      [Array.from({ length: 693 }, (_, index) => (index % 2 ? -1 : 1) * (index + 1) / 10), '9899999999594140'],
    ];
    for (const [values, expectedHex] of cases) expect(littleEndianHex(cpythonFsum(values))).toBe(expectedHex);
    expect(() => cpythonFsum([Number.POSITIVE_INFINITY])).toThrow(/finite/);
  });

  it('implements Hyndman-Fan type 7 linear quantiles', () => {
    expect(hf7Quantile([30, 0, 20, 10], 0.5)).toBe(15);
    expect(hf7Quantile([30, 0, 20, 10], 0.9)).toBeCloseTo(27, 14);
    expect(hf7Quantile([30, 0, 20, 10], 0.95)).toBeCloseTo(28.5, 14);
    expect(hf7Quantile([30, 0, 20, 10], 0.99)).toBeCloseTo(29.7, 14);
  });
});

describe('binary64 metric evidence', () => {
  const entries = [
    { id: idAt(2), error: 2.5 },
    { id: idAt(0), error: 0 },
    { id: idAt(1), error: 1.25 },
  ];

  it('is order-independent but changes for every bound numeric or context field', () => {
    const root = binary64MetricEvidenceRoot(MATTERSIM, 'energy', entries);
    const legacyRoot = perIdMetricEvidenceRoot(MATTERSIM, 'energy', entries);
    expect(root).toBe('sha256:2661dcbde9b718065d66dd36b3422367ae6b61e3cd1dc25adf0fe4287bcbe66a');
    expect(legacyRoot).toBe('sha256:227dffd10636178d66f92fa3aeecdaee2e030cfd94215f805f8445a2a8621de2');
    expect(binary64MetricEvidenceRoot(MATTERSIM, 'energy', [...entries].reverse())).toBe(root);
    expect(perIdMetricEvidenceRoot(MATTERSIM, 'energy', [...entries].reverse())).toBe(legacyRoot);
    expect(binary64MetricEvidenceRoot(MATTERSIM, 'energy', entries.map((entry) => entry.id === idAt(1) ? { ...entry, error: entry.error + Number.EPSILON } : entry))).not.toBe(root);
    expect(binary64MetricEvidenceRoot(MACE, 'energy', entries)).not.toBe(root);
    expect(binary64MetricEvidenceRoot(MATTERSIM, 'force', entries)).not.toBe(root);
    expect(binary64MetricEvidenceRoot(MATTERSIM, 'energy', entries.map((entry) => entry.id === idAt(1) ? { ...entry, id: idAt(3) } : entry))).not.toBe(root);
    expect(perIdMetricEvidenceRoot(MATTERSIM, 'energy', entries.map((entry) => entry.id === idAt(1) ? { ...entry, error: entry.error + Number.EPSILON } : entry))).not.toBe(legacyRoot);
    expect(perIdMetricEvidenceRoot(MACE, 'energy', entries)).not.toBe(legacyRoot);
    expect(perIdMetricEvidenceRoot(MATTERSIM, 'force', entries)).not.toBe(legacyRoot);
    expect(() => binary64MetricEvidenceRoot(MATTERSIM, 'energy', [...entries, entries[0]])).toThrow(/duplicate/);
    expect(() => perIdMetricEvidenceRoot(MATTERSIM, 'energy', [...entries, entries[0]])).toThrow(/duplicate/);
  });

  it('locks worst-error ties to ascending ASCII IDs', () => {
    const report = summarizeMetricEntries(MATTERSIM, 'energy', [
      { id: idAt(2), error: 3 },
      { id: idAt(0), error: 3 },
      { id: idAt(1), error: 1 },
    ], 'test', 'eV/atom');
    expect(report.worst).toEqual({ id: idAt(0), error: 3 });
    expect(report.perIdMetricEvidenceRoot).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(report.binary64MetricEvidenceRoot).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(PER_ID_METRIC_EVIDENCE_ROOT_PROTOCOL).toMatch(/canonical-json-array/);
    expect(BINARY64_METRIC_EVIDENCE_ROOT_PROTOCOL).toMatch(/ieee754-binary64-little-endian/);
  });
});

describe('full-candidate metric formulas', () => {
  it('matches a hand-computed energy, force and stress example with all diagnostics', () => {
    const reference = referenceAt(0);
    const prediction = predictionFor(reference);
    prediction.energyEv = 32;
    prediction.forcesEvPerAngstrom = Array.from({ length: 16 }, () => [3, 4, 0]);
    prediction.stressAseEvPerAngstrom3 = [[1, 0, 0], [0, 2, 0], [0, 0, 2]];
    const metrics = computeRecordMetrics(MATTERSIM, prediction, reference);
    expect(metrics.energyEvPerAtom).toBe(2);
    expect(metrics.forceVectorMeanEvPerAngstrom).toBe(5);
    expect(metrics.stressFrobeniusGpa).toBeCloseTo(3 * EV_PER_ANGSTROM3_TO_GPA, 12);
    expect(metrics.stressSpectralNormGpa).toBeCloseTo(2 * EV_PER_ANGSTROM3_TO_GPA, 12);
    expect(metrics.stressUnweightedVoigt6L2Gpa).toBeCloseTo(3 * EV_PER_ANGSTROM3_TO_GPA, 12);
    expect(metrics.stressSixComponentAbsoluteGpa).toEqual({
      xx: EV_PER_ANGSTROM3_TO_GPA,
      yy: 2 * EV_PER_ANGSTROM3_TO_GPA,
      zz: 2 * EV_PER_ANGSTROM3_TO_GPA,
      yz: 0,
      xz: 0,
      xy: 0,
    });

    prediction.stressAseEvPerAngstrom3 = [[0, 1, 0], [1, 0, 0], [0, 0, 0]];
    const shear = computeRecordMetrics(MATTERSIM, prediction, reference);
    expect(shear.stressFrobeniusGpa).toBeCloseTo(Math.sqrt(2) * EV_PER_ANGSTROM3_TO_GPA, 12);
    expect(shear.stressSpectralNormGpa).toBeCloseTo(EV_PER_ANGSTROM3_TO_GPA, 12);
    expect(shear.stressUnweightedVoigt6L2Gpa).toBeCloseTo(EV_PER_ANGSTROM3_TO_GPA, 12);
  });

  it('reports full diagnostics and applies the MatterSim three-way AND gate', () => {
    const { references, predictions } = fullFixture();
    for (const prediction of predictions) {
      prediction.energyEv = 0.199 * 16;
      prediction.forcesEvPerAngstrom = Array.from({ length: 16 }, () => [0.824, 0, 0]);
      prediction.stressAseEvPerAngstrom3[0][0] = 1.999 / EV_PER_ANGSTROM3_TO_GPA;
    }
    const result = evaluateFullCandidateMetrics(MATTERSIM, predictions, references);
    expect(result.coverage).toMatchObject({
      expected: 693,
      produced: 693,
      valid: 693,
      attemptedExpectedIds: 693,
      validExpectedIds: 693,
      missingExpectedIds: 0,
      failedExpectedIds: 0,
      unexpectedDistinctIds: 0,
      duplicatedDistinctIds: 0,
      malformedRows: 0,
      nonfiniteExpectedIds: 0,
      complete: true,
    });
    expect(result.assessment.metricPass).toEqual({ energy: true, force: true, stress: true });
    expect(result.assessment.status).toBe('passed');
    expect(result.metrics.stressDiagnostics.voigtOrder).toEqual(['xx', 'yy', 'zz', 'yz', 'xz', 'xy']);
    expect(result.metrics.stressDiagnostics.sixComponentMaeGpa).toHaveLength(6);
    expect(Object.keys(result.diagnosticMetricReports.sixComponent)).toEqual(['xx', 'yy', 'zz', 'yz', 'xz', 'xy']);
    expect(result.metrics.stressDiagnostics.reports).toEqual(result.diagnosticMetricReports);
    expect(result.metrics.stressDiagnostics.spectralNormMeanGpa).toBe(result.metrics.stressDiagnostics.reports.spectralNorm.mean);
    expect(result.metrics.stressDiagnostics.voigt6L2MeanGpa).toBe(result.metrics.stressDiagnostics.reports.unweightedVoigt6L2.mean);
    expect(result.metrics.stressDiagnostics.sixComponentMaeGpa).toEqual(
      result.metrics.stressDiagnostics.voigtOrder.map((id) => result.metrics.stressDiagnostics.reports.sixComponent[id].mean),
    );
    for (const report of [
      result.metrics.stressDiagnostics.reports.spectralNorm,
      result.metrics.stressDiagnostics.reports.unweightedVoigt6L2,
      ...Object.values(result.metrics.stressDiagnostics.reports.sixComponent),
    ]) {
      expect(report).toMatchObject({ records: 693 });
      expect(report.perIdMetricEvidenceRoot).toMatch(/^sha256:[0-9a-f]{64}$/);
      expect(report.binary64MetricEvidenceRoot).toMatch(/^sha256:[0-9a-f]{64}$/);
    }
    expect(result.perStructure).toHaveLength(693);
    expect(result.metrics.summation).toBe('ascii-id-order-python-3.12-math-fsum-divide-by-693/v1');
    expect(result.metrics.energy).toMatchObject({ records: 693 });
    expect(result.metrics.energy.perIdMetricEvidenceRoot).not.toBe(result.metrics.energy.binary64MetricEvidenceRoot);

    predictions[0].energyEv = 160;
    const failed = evaluateFullCandidateMetrics(MATTERSIM, predictions, references);
    expect(failed.assessment.metricPass.force).toBe(true);
    expect(failed.assessment.metricPass.stress).toBe(true);
    expect(failed.assessment.metricPass.energy).toBe(false);
    expect(failed.assessment.status).toBe('failed');
  });

  it('keeps MACE a blind baseline with no superiority assessment', () => {
    const { references, predictions } = fullFixture(MACE);
    const result = evaluateFullCandidateMetrics(MACE, predictions, references);
    expect(result.coverage.complete).toBe(true);
    expect(result.assessment).toEqual({
      model: 'mace',
      assessment: 'blind-engineering-baseline',
      status: 'baseline-recorded',
      publishedRandomTpTargetAvailable: false,
      fitOffsetScaleOrSignAfterObservationApplied: false,
      superiorityClaimed: false,
    });
    expect(result.superiorityClaimAllowed).toBe(false);
  });
});

describe('coverage and strict prediction validation', () => {
  function expectIdLevelInvariants(coverage) {
    expect(coverage.attemptedExpectedIds + coverage.missingExpectedIds).toBe(693);
    expect(coverage.validExpectedIds + coverage.failedExpectedIds).toBe(coverage.attemptedExpectedIds);
    expect(coverage.nonfiniteExpectedIds).toBeLessThanOrEqual(coverage.failedExpectedIds);
    expect(coverage.idLevelInvariants).toEqual({
      attemptedPlusMissingEqualsExpected: true,
      validPlusFailedEqualsAttempted: true,
      nonfiniteWithinFailed: true,
    });
  }

  it('preserves 692, 694, duplicate and extra evidence without fabricating metrics', () => {
    const { references, predictions } = fullFixture();
    const partial = evaluateFullCandidateMetrics(MATTERSIM, predictions.slice(0, -1), references);
    expect(partial.coverage).toMatchObject({ produced: 692, valid: 692, complete: false, missingIds: [idAt(692)] });
    expect(partial.metrics).toBeNull();

    const extra = predictionFor({ ...referenceAt(999999), id: idAt(999999) });
    const overfull = evaluateFullCandidateMetrics(MATTERSIM, [...predictions, extra], references);
    expect(overfull.coverage).toMatchObject({ produced: 694, complete: false, extraIds: [idAt(999999)] });
    expect(overfull.metrics).toBeNull();

    const duplicate = evaluateFullCandidateMetrics(MATTERSIM, [...predictions, { ...predictions[0] }], references);
    expect(duplicate.coverage.duplicateIds).toEqual([idAt(0)]);
    expect(duplicate.coverage.complete).toBe(false);

    const replaced = evaluateFullCandidateMetrics(MATTERSIM, [...predictions.slice(0, -1), extra], references);
    expect(replaced.coverage.missingIds).toEqual([idAt(692)]);
    expect(replaced.coverage.extraIds).toEqual([idAt(999999)]);
  });

  it('classifies nonfinite, structure, schema, model, shape and symmetry failures', () => {
    const cases = [
      ['nonfiniteIds', (prediction) => { prediction.energyEv = Number.NaN; }],
      ['structureMismatchIds', (prediction) => { prediction.inputStructureDigest = digest('wrong'); }],
      ['schemaMismatchIds', (prediction) => { prediction.schemaVersion = 'tf.atomistic-prediction/0.2'; }],
      ['modelMismatchIds', (prediction) => { prediction.modelId = MACE; }],
      ['shapeInvalidIds', (prediction) => { prediction.forcesEvPerAngstrom = [[0, 0, 0]]; }],
      ['asymmetricStressIds', (prediction) => { prediction.stressAseEvPerAngstrom3[0][1] = 1; }],
    ];
    for (const [field, mutate] of cases) {
      const { references, predictions } = fullFixture();
      mutate(predictions[0]);
      const result = evaluateFullCandidateMetrics(MATTERSIM, predictions, references);
      expect(result.coverage[field]).toEqual([idAt(0)]);
      expect(result.coverage.complete).toBe(false);
      expect(result.metrics).toBeNull();
    }
  });

  it('keeps malformed, extra, duplicate and nonfinite evidence in honest ID-level counters', () => {
    const malformedFixture = fullFixture();
    malformedFixture.predictions[0] = { ...malformedFixture.predictions[0], id: 'malformed-id' };
    const malformed = evaluateFullCandidateMetrics(MATTERSIM, malformedFixture.predictions, malformedFixture.references);
    expect(malformed.coverage).toMatchObject({
      attemptedExpectedIds: 692,
      validExpectedIds: 692,
      missingExpectedIds: 1,
      failedExpectedIds: 0,
      unexpectedDistinctIds: 0,
      duplicatedDistinctIds: 0,
      malformedRows: 1,
      nonfiniteExpectedIds: 0,
    });
    expectIdLevelInvariants(malformed.coverage);

    const extraFixture = fullFixture();
    const extraRecord = predictionFor(referenceAt(999999));
    const extra = evaluateFullCandidateMetrics(MATTERSIM, [...extraFixture.predictions, extraRecord], extraFixture.references);
    expect(extra.coverage).toMatchObject({
      attemptedExpectedIds: 693,
      validExpectedIds: 693,
      missingExpectedIds: 0,
      failedExpectedIds: 0,
      unexpectedDistinctIds: 1,
      duplicatedDistinctIds: 0,
      malformedRows: 0,
      nonfiniteExpectedIds: 0,
    });
    expectIdLevelInvariants(extra.coverage);

    const duplicateFixture = fullFixture();
    const duplicate = evaluateFullCandidateMetrics(
      MATTERSIM,
      [...duplicateFixture.predictions, { ...duplicateFixture.predictions[0] }],
      duplicateFixture.references,
    );
    expect(duplicate.coverage).toMatchObject({
      attemptedExpectedIds: 693,
      validExpectedIds: 692,
      missingExpectedIds: 0,
      failedExpectedIds: 1,
      unexpectedDistinctIds: 0,
      duplicatedDistinctIds: 1,
      malformedRows: 0,
      nonfiniteExpectedIds: 0,
    });
    expectIdLevelInvariants(duplicate.coverage);

    const nonfiniteFixture = fullFixture();
    nonfiniteFixture.predictions[0].energyEv = Number.NaN;
    const nonfinite = evaluateFullCandidateMetrics(MATTERSIM, nonfiniteFixture.predictions, nonfiniteFixture.references);
    expect(nonfinite.coverage).toMatchObject({
      attemptedExpectedIds: 693,
      validExpectedIds: 692,
      missingExpectedIds: 0,
      failedExpectedIds: 1,
      unexpectedDistinctIds: 0,
      duplicatedDistinctIds: 0,
      malformedRows: 0,
      nonfiniteExpectedIds: 1,
    });
    expectIdLevelInvariants(nonfinite.coverage);
  });

  it('turns finite-input arithmetic overflow into incomplete evidence instead of throwing', () => {
    const { references, predictions } = fullFixture();
    predictions[0].forcesEvPerAngstrom[0] = [Number.MAX_VALUE, Number.MAX_VALUE, Number.MAX_VALUE];
    const result = evaluateFullCandidateMetrics(MATTERSIM, predictions, references);
    expect(result.coverage.nonfiniteIds).toEqual([idAt(0)]);
    expect(result.coverage.complete).toBe(false);
    expect(result.metrics).toBeNull();
    expect(result.validation.errors.join('\n')).toMatch(/metric computation failed/);
  });
});
