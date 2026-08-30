import { createHash } from 'node:crypto';

export const FULL_CANDIDATE_EXPECTED_RECORDS = 693;
export const FULL_CANDIDATE_ATOMS_PER_FRAME = 16;
export const EV_PER_ANGSTROM3_TO_GPA = 160.21766208;
export const METRIC_EVIDENCE_DOMAIN = 'tf.atomistic-full-candidate.metric-evidence/v1';
export const PER_ID_METRIC_EVIDENCE_ROOT_PROTOCOL = 'sha256-merkle-canonical-json-array-model-id-metric-id-error-ascii-id-order-duplicate-id-forbidden/v1';
export const BINARY64_METRIC_EVIDENCE_ROOT_PROTOCOL = 'sha256-merkle-domain-separated-model-id-metric-id-ieee754-binary64-little-endian-ascii-id-order-duplicate-id-forbidden/v1';

const PREDICTION_SCHEMA = 'tf.atomistic-prediction/0.3';
const ID_PATTERN = /^random-TP-[0-9]{6}$/;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const MODEL_CONTRACTS = Object.freeze({
  'mattersim-v1.0.0-5m': Object.freeze({
    family: 'mattersim',
    assessment: 'protocol-equivalent-model-card-interval-check',
    targets: Object.freeze({
      energyMaeEvPerAtom: 0.199,
      forceVectorMaeEvPerAngstrom: 0.824,
      stressFrobeniusMaeGpa: 1.999,
    }),
    acceptedIntervals: Object.freeze({
      energyMaeEvPerAtom: Object.freeze([0.19502, 0.20298]),
      forceVectorMaeEvPerAngstrom: Object.freeze([0.80752, 0.84048]),
      stressFrobeniusMaeGpa: Object.freeze([1.95902, 2.03898]),
    }),
  }),
  'mace-mpa-0-medium': Object.freeze({
    family: 'mace',
    assessment: 'blind-engineering-baseline',
  }),
});

const VOIGT_COMPONENTS = Object.freeze([
  Object.freeze({ id: 'xx', index: 0 }),
  Object.freeze({ id: 'yy', index: 4 }),
  Object.freeze({ id: 'zz', index: 8 }),
  Object.freeze({ id: 'yz', index: 5 }),
  Object.freeze({ id: 'xz', index: 2 }),
  Object.freeze({ id: 'xy', index: 1 }),
]);

const METRIC_DEFINITIONS = Object.freeze({
  energy: Object.freeze({
    definition: 'absolute-total-energy-error-divided-by-frame-atom-count',
    unit: 'eV/atom',
  }),
  force: Object.freeze({
    definition: 'mean-per-atom-l2-vector-error-per-frame',
    unit: 'eV/angstrom',
  }),
  stressFrobenius: Object.freeze({
    definition: 'full-3x3-frobenius-error-in-gpa-per-frame',
    unit: 'GPa',
  }),
  stressSpectralNorm: Object.freeze({
    definition: 'symmetric-3x3-spectral-norm-error-in-gpa-per-frame',
    unit: 'GPa',
  }),
  stressUnweightedVoigt6L2: Object.freeze({
    definition: 'unweighted-voigt6-l2-error-in-gpa-per-frame',
    unit: 'GPa',
  }),
  stressComponent: Object.freeze({
    definition: 'absolute-stress-component-error-in-gpa-per-frame',
    unit: 'GPa',
  }),
});

/**
 * A finite-input port of CPython 3.12's math.fsum partials algorithm.
 *
 * JavaScript and CPython both use IEEE-754 binary64 round-to-nearest arithmetic
 * on the supported runtimes. The final half-even correction is essential: the
 * shorter ActiveState/Python recipe without it is not CPython compatible.
 */
export function cpythonFsum(values) {
  if (values == null || typeof values[Symbol.iterator] !== 'function') throw new TypeError('fsum input must be iterable.');
  const partials = [];
  for (const value of values) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('fsum accepts finite numbers only.');
    let x = value;
    let write = 0;
    for (let read = 0; read < partials.length; read += 1) {
      let y = partials[read];
      if (Math.abs(x) < Math.abs(y)) [x, y] = [y, x];
      const hi = x + y;
      if (!Number.isFinite(hi)) throw new RangeError('fsum intermediate overflowed binary64.');
      const yr = hi - x;
      const lo = y - yr;
      if (lo !== 0) {
        partials[write] = lo;
        write += 1;
      }
      x = hi;
    }
    partials.length = write;
    if (x !== 0) partials.push(x);
  }

  let count = partials.length;
  if (count === 0) return 0;
  let hi = partials[count - 1];
  count -= 1;
  let lo = 0;
  while (count > 0) {
    const x = hi;
    const y = partials[count - 1];
    count -= 1;
    hi = x + y;
    const yr = hi - x;
    lo = y - yr;
    if (lo !== 0) break;
  }
  if (count > 0 && ((lo < 0 && partials[count - 1] < 0) || (lo > 0 && partials[count - 1] > 0))) {
    const doubled = lo * 2;
    const rounded = hi + doubled;
    const roundingDelta = rounded - hi;
    if (doubled === roundingDelta) hi = rounded;
  }
  return Object.is(hi, -0) ? 0 : hi;
}

export function hf7Quantile(values, probability) {
  if (!Array.isArray(values) || values.length === 0) throw new TypeError('HF7 requires at least one value.');
  if (typeof probability !== 'number' || !Number.isFinite(probability) || probability < 0 || probability > 1) throw new RangeError('HF7 probability must be in [0, 1].');
  const ordered = values.map((value) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError('HF7 accepts finite numbers only.');
    return value;
  }).sort((left, right) => left - right);
  if (ordered.length === 1) return ordered[0];
  const index = (ordered.length - 1) * probability;
  const lower = Math.floor(index);
  const fraction = index - lower;
  if (fraction === 0) return ordered[lower];
  return ordered[lower] + fraction * (ordered[lower + 1] - ordered[lower]);
}

export function binary64MetricEvidenceRoot(modelId, metricId, entries) {
  assertContext(modelId, 'modelId');
  assertContext(metricId, 'metricId');
  if (!Array.isArray(entries) || entries.length === 0) throw new TypeError('metric evidence requires at least one entry.');
  const ordered = entries.map((entry, index) => {
    if (!isPlainObject(entry) || !isAsciiId(entry.id)) throw new TypeError(`metric evidence entry ${index} has an invalid ID.`);
    if (typeof entry.error !== 'number' || !Number.isFinite(entry.error) || entry.error < 0) throw new TypeError(`${entry.id}: metric evidence error must be finite and non-negative.`);
    return { id: entry.id, error: Object.is(entry.error, -0) ? 0 : entry.error };
  }).sort((left, right) => asciiCompare(left.id, right.id));
  for (let index = 1; index < ordered.length; index += 1) {
    if (ordered[index - 1].id === ordered[index].id) throw new Error(`metric evidence contains duplicate ID ${ordered[index].id}.`);
  }

  let level = ordered.map(({ id, error }) => taggedHash('leaf', [
    encodedString(modelId), encodedString(metricId), encodedString(id), encodedFloat64(error),
  ]));
  while (level.length > 1) {
    const next = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      const right = level[index + 1] ?? left;
      next.push(taggedHash('node', [left, right]));
    }
    level = next;
  }
  const root = taggedHash('root', [
    encodedString(modelId), encodedString(metricId), encodedUint32(ordered.length), level[0],
  ]);
  return `sha256:${root.toString('hex')}`;
}

export function perIdMetricEvidenceRoot(modelId, metricId, entries) {
  assertContext(modelId, 'modelId');
  assertContext(metricId, 'metricId');
  const ordered = validateMetricEntries(entries);
  let level = ordered.map(({ id, error }) => createHash('sha256')
    .update(JSON.stringify([modelId, metricId, id, error]), 'utf8')
    .digest());
  while (level.length > 1) {
    const next = [];
    for (let index = 0; index < level.length; index += 2) {
      const left = level[index];
      const right = level[index + 1] ?? left;
      next.push(createHash('sha256').update(left).update(right).digest());
    }
    level = next;
  }
  return `sha256:${level[0].toString('hex')}`;
}

export const canonicalJsonMetricEvidenceRoot = perIdMetricEvidenceRoot;

export function summarizeMetricEntries(modelId, metricId, entries, definition, unit) {
  const ordered = validateMetricEntries(entries);
  const errors = ordered.map((entry) => entry.error);
  const ranked = [...ordered].sort((left, right) => right.error - left.error || asciiCompare(left.id, right.id));
  return {
    definition,
    unit,
    records: ordered.length,
    mean: cpythonFsum(errors) / ordered.length,
    p50: hf7Quantile(errors, 0.5),
    p90: hf7Quantile(errors, 0.9),
    p95: hf7Quantile(errors, 0.95),
    p99: hf7Quantile(errors, 0.99),
    worst: { id: ranked[0].id, error: ranked[0].error },
    perIdMetricEvidenceRoot: perIdMetricEvidenceRoot(modelId, metricId, ordered),
    binary64MetricEvidenceRoot: binary64MetricEvidenceRoot(modelId, metricId, ordered),
  };
}

export function computeRecordMetrics(modelId, prediction, reference) {
  const issues = validateMatchedRecord(modelId, prediction, reference);
  if (issues.length > 0) throw new TypeError(issues.join('; '));
  const atomCount = reference.atomCount;
  const forceNorms = [];
  for (let atom = 0; atom < atomCount; atom += 1) {
    const offset = atom * 3;
    const dx = prediction.forcesEvPerAngstrom[atom][0] - reference.forces[offset];
    const dy = prediction.forcesEvPerAngstrom[atom][1] - reference.forces[offset + 1];
    const dz = prediction.forcesEvPerAngstrom[atom][2] - reference.forces[offset + 2];
    forceNorms.push(Math.sqrt(cpythonFsum([dx * dx, dy * dy, dz * dz])));
  }
  const stressDelta = prediction.stressAseEvPerAngstrom3.flat().map((value, index) => value - reference.stress[index]);
  const frobenius = Math.sqrt(cpythonFsum(stressDelta.map((value) => value * value))) * EV_PER_ANGSTROM3_TO_GPA;
  const voigt = VOIGT_COMPONENTS.map(({ index }) => stressDelta[index]);
  const componentErrors = Object.fromEntries(VOIGT_COMPONENTS.map(({ id, index }) => [id, Math.abs(stressDelta[index]) * EV_PER_ANGSTROM3_TO_GPA]));
  return {
    id: reference.id,
    energyEvPerAtom: Math.abs(prediction.energyEv - reference.energy) / atomCount,
    forceVectorMeanEvPerAngstrom: cpythonFsum(forceNorms) / atomCount,
    stressFrobeniusGpa: frobenius,
    stressSpectralNormGpa: symmetricSpectralNorm3x3(stressDelta) * EV_PER_ANGSTROM3_TO_GPA,
    stressUnweightedVoigt6L2Gpa: Math.sqrt(cpythonFsum(voigt.map((value) => value * value))) * EV_PER_ANGSTROM3_TO_GPA,
    stressSixComponentAbsoluteGpa: componentErrors,
  };
}

export function evaluateFullCandidateMetrics(modelId, predictionRecords, referenceRecords) {
  const expectedRecords = FULL_CANDIDATE_EXPECTED_RECORDS;
  const predictions = Array.isArray(predictionRecords) ? predictionRecords : [];
  const references = Array.isArray(referenceRecords) ? referenceRecords : [];
  const contract = MODEL_CONTRACTS[modelId];
  const globalErrors = [];
  if (!Array.isArray(predictionRecords)) globalErrors.push('predictionRecords must be an array');
  if (!Array.isArray(referenceRecords)) globalErrors.push('referenceRecords must be an array');
  if (!contract) globalErrors.push(`unsupported modelId ${JSON.stringify(modelId)}`);

  const referenceById = new Map();
  const referenceInvalidIds = new Set();
  const referenceDuplicateIds = new Set();
  references.forEach((record, index) => {
    const issues = validateReferenceRecord(record, index);
    const id = isPlainObject(record) && typeof record.id === 'string' ? record.id : `record-index-${index}`;
    if (issues.length > 0) referenceInvalidIds.add(id);
    if (isPlainObject(record) && isAsciiId(record.id)) {
      if (referenceById.has(record.id)) referenceDuplicateIds.add(record.id);
      else referenceById.set(record.id, record);
    }
  });
  if (references.length !== expectedRecords) globalErrors.push(`reference record count ${references.length} differs from ${expectedRecords}`);
  if (referenceDuplicateIds.size > 0) globalErrors.push('reference IDs are duplicated');
  if (referenceInvalidIds.size > 0) globalErrors.push('reference records are invalid');

  const predictionIndexesById = new Map();
  const invalidRecordIndexes = [];
  predictions.forEach((record, index) => {
    if (!isPlainObject(record) || !isAsciiId(record.id)) {
      invalidRecordIndexes.push(index);
      return;
    }
    const indexes = predictionIndexesById.get(record.id) ?? [];
    indexes.push(index);
    predictionIndexesById.set(record.id, indexes);
  });
  const duplicateIds = sortedIds([...predictionIndexesById.entries()].filter(([, indexes]) => indexes.length > 1).map(([id]) => id));
  const extraIds = sortedIds([...predictionIndexesById.keys()].filter((id) => !referenceById.has(id)));
  const missingIds = sortedIds([...referenceById.keys()].filter((id) => !predictionIndexesById.has(id)));
  const failedIds = new Set();
  const nonfiniteIds = new Set();
  const structureMismatchIds = new Set();
  const schemaMismatchIds = new Set();
  const modelMismatchIds = new Set();
  const shapeInvalidIds = new Set();
  const asymmetricStressIds = new Set();
  const invalidIds = new Set([...duplicateIds, ...extraIds]);
  const validationErrors = [];
  const validPairs = [];

  for (const [id, indexes] of predictionIndexesById.entries()) {
    const reference = referenceById.get(id);
    if (!reference) continue;
    let uniqueMetrics = null;
    for (const index of indexes) {
      const prediction = predictions[index];
      const classified = classifyMatchedRecord(modelId, prediction, reference);
      for (const issue of classified.issues) validationErrors.push(`${id} prediction ${index}: ${issue}`);
      if (classified.failed) failedIds.add(id);
      if (classified.nonfinite) nonfiniteIds.add(id);
      if (classified.structureMismatch) structureMismatchIds.add(id);
      if (classified.schemaMismatch) schemaMismatchIds.add(id);
      if (classified.modelMismatch) modelMismatchIds.add(id);
      if (classified.shapeInvalid) shapeInvalidIds.add(id);
      if (classified.asymmetricStress) asymmetricStressIds.add(id);
      if (classified.issues.length > 0) invalidIds.add(id);
      else if (indexes.length === 1) {
        try {
          uniqueMetrics = computeRecordMetrics(modelId, prediction, reference);
          if (!recordMetricsAreFinite(uniqueMetrics)) throw new RangeError('computed metric is non-finite');
        } catch (error) {
          validationErrors.push(`${id} prediction ${index}: metric computation failed: ${error.message}`);
          nonfiniteIds.add(id);
          invalidIds.add(id);
        }
      }
    }
    if (indexes.length === 1 && uniqueMetrics !== null && !invalidIds.has(id)) validPairs.push({ prediction: predictions[indexes[0]], reference, metrics: uniqueMetrics });
  }

  const coverageErrors = [];
  if (predictions.length !== expectedRecords) coverageErrors.push(`prediction record count ${predictions.length} differs from ${expectedRecords}`);
  if (missingIds.length > 0) coverageErrors.push(`missing prediction IDs: ${missingIds.join(', ')}`);
  if (extraIds.length > 0) coverageErrors.push(`extra prediction IDs: ${extraIds.join(', ')}`);
  if (duplicateIds.length > 0) coverageErrors.push(`duplicate prediction IDs: ${duplicateIds.join(', ')}`);
  if (invalidRecordIndexes.length > 0) coverageErrors.push(`prediction records with invalid IDs at indexes: ${invalidRecordIndexes.join(', ')}`);

  // These are deliberately ID-level counts. Raw JSONL row count remains
  // `produced`; malformed rows and unexpected IDs are not misreported as
  // attempted or failed frozen IDs.
  const attemptedExpectedIds = [...predictionIndexesById.keys()].filter((id) => referenceById.has(id)).length;
  const validExpectedIds = validPairs.length;
  const missingExpectedIds = missingIds.length;
  const failedExpectedIds = attemptedExpectedIds - validExpectedIds;
  const unexpectedDistinctIds = extraIds.length;
  const duplicatedDistinctIds = duplicateIds.length;
  const malformedRows = invalidRecordIndexes.length;
  const nonfiniteExpectedIds = nonfiniteIds.size;
  const idLevelInvariants = {
    attemptedPlusMissingEqualsExpected: attemptedExpectedIds + missingExpectedIds === expectedRecords,
    validPlusFailedEqualsAttempted: validExpectedIds + failedExpectedIds === attemptedExpectedIds,
    nonfiniteWithinFailed: nonfiniteExpectedIds <= failedExpectedIds,
  };
  if (!Object.values(idLevelInvariants).every(Boolean)) coverageErrors.push('ID-level coverage count invariants failed');

  const coverage = {
    expected: expectedRecords,
    referenceRecords: references.length,
    produced: predictions.length,
    uniqueProducedIds: predictionIndexesById.size,
    valid: validPairs.length,
    attemptedExpectedIds,
    validExpectedIds,
    missingExpectedIds,
    failedExpectedIds,
    unexpectedDistinctIds,
    duplicatedDistinctIds,
    malformedRows,
    nonfiniteExpectedIds,
    idLevelInvariants,
    complete: false,
    recordIds: sortedIds([...predictionIndexesById.keys()]),
    missingIds,
    extraIds,
    duplicateIds,
    failedIds: sortedIds(failedIds),
    nonfiniteIds: sortedIds(nonfiniteIds),
    structureMismatchIds: sortedIds(structureMismatchIds),
    schemaMismatchIds: sortedIds(schemaMismatchIds),
    modelMismatchIds: sortedIds(modelMismatchIds),
    shapeInvalidIds: sortedIds(shapeInvalidIds),
    asymmetricStressIds: sortedIds(asymmetricStressIds),
    invalidIds: sortedIds(invalidIds),
    invalidRecordIndexes,
    referenceInvalidIds: sortedIds(referenceInvalidIds),
    referenceDuplicateIds: sortedIds(referenceDuplicateIds),
  };
  coverage.complete = Boolean(contract)
    && globalErrors.length === 0
    && validationErrors.length === 0
    && coverage.referenceRecords === expectedRecords
    && coverage.produced === expectedRecords
    && coverage.uniqueProducedIds === expectedRecords
    && coverage.valid === expectedRecords
    && coverage.missingIds.length === 0
    && coverage.extraIds.length === 0
    && coverage.duplicateIds.length === 0
    && coverage.invalidRecordIndexes.length === 0
    && Object.values(coverage.idLevelInvariants).every(Boolean);

  const result = {
    modelId,
    coverage,
    validation: {
      valid: coverage.complete,
      errors: [...globalErrors, ...coverageErrors, ...validationErrors],
    },
    metrics: null,
    assessment: null,
    claimEligible: false,
    promotionEligible: false,
    comparisonEligible: false,
    reproductionEligible: false,
    reproduced: false,
    superiorityClaimAllowed: false,
  };
  if (!coverage.complete) return result;

  const perStructure = validPairs
    .map(({ metrics: recordMetrics }) => recordMetrics)
    .sort((left, right) => asciiCompare(left.id, right.id));
  const entries = (selector) => perStructure.map((record) => ({ id: record.id, error: selector(record) }));
  const componentReports = Object.fromEntries(VOIGT_COMPONENTS.map(({ id }) => [id, summarizeMetricEntries(
    modelId,
    `stress-six-component-${id}`,
    entries((record) => record.stressSixComponentAbsoluteGpa[id]),
    `${METRIC_DEFINITIONS.stressComponent.definition}:${id}`,
    METRIC_DEFINITIONS.stressComponent.unit,
  )]));
  const diagnosticMetricReports = {
    spectralNorm: summarizeMetricEntries(modelId, 'stress-spectral-norm', entries((record) => record.stressSpectralNormGpa), METRIC_DEFINITIONS.stressSpectralNorm.definition, METRIC_DEFINITIONS.stressSpectralNorm.unit),
    unweightedVoigt6L2: summarizeMetricEntries(modelId, 'stress-unweighted-voigt6-l2', entries((record) => record.stressUnweightedVoigt6L2Gpa), METRIC_DEFINITIONS.stressUnweightedVoigt6L2.definition, METRIC_DEFINITIONS.stressUnweightedVoigt6L2.unit),
    sixComponent: componentReports,
  };
  const metrics = {
    model: contract.family,
    definitionId: 'mattersim-model-card-frobenius/v1',
    aggregation: 'equal-weight-structure-mean-float64',
    summation: 'ascii-id-order-python-3.12-math-fsum-divide-by-693/v1',
    quantileMethod: 'Hyndman-Fan-7-linear',
    energy: summarizeMetricEntries(modelId, 'energy', entries((record) => record.energyEvPerAtom), METRIC_DEFINITIONS.energy.definition, METRIC_DEFINITIONS.energy.unit),
    force: summarizeMetricEntries(modelId, 'force', entries((record) => record.forceVectorMeanEvPerAngstrom), METRIC_DEFINITIONS.force.definition, METRIC_DEFINITIONS.force.unit),
    stress: summarizeMetricEntries(modelId, 'stress-frobenius', entries((record) => record.stressFrobeniusGpa), METRIC_DEFINITIONS.stressFrobenius.definition, METRIC_DEFINITIONS.stressFrobenius.unit),
    stressDiagnostics: {
      spectralNormMeanGpa: diagnosticMetricReports.spectralNorm.mean,
      voigt6L2MeanGpa: diagnosticMetricReports.unweightedVoigt6L2.mean,
      sixComponentMaeGpa: VOIGT_COMPONENTS.map(({ id }) => componentReports[id].mean),
      voigtOrder: VOIGT_COMPONENTS.map(({ id }) => id),
      reports: diagnosticMetricReports,
    },
  };
  result.metrics = metrics;
  result.perStructure = perStructure;
  result.diagnosticMetricReports = diagnosticMetricReports;
  result.assessment = assessModel(contract, metrics);
  return result;
}

export const analyzeFullCandidateMetrics = evaluateFullCandidateMetrics;

function assessModel(contract, metrics) {
  if (contract.family === 'mace') {
    return {
      model: 'mace',
      assessment: contract.assessment,
      status: 'baseline-recorded',
      publishedRandomTpTargetAvailable: false,
      fitOffsetScaleOrSignAfterObservationApplied: false,
      superiorityClaimed: false,
    };
  }
  const actual = {
    energyMaeEvPerAtom: metrics.energy.mean,
    forceVectorMaeEvPerAngstrom: metrics.force.mean,
    stressFrobeniusMaeGpa: metrics.stress.mean,
  };
  const checks = Object.fromEntries(Object.entries(contract.acceptedIntervals).map(([metric, interval]) => [metric, actual[metric] >= interval[0] && actual[metric] <= interval[1]]));
  return {
    model: 'mattersim',
    assessment: contract.assessment,
    status: Object.values(checks).every(Boolean) ? 'passed' : 'failed',
    conjunction: 'energy-and-force-and-stress',
    metricPass: {
      energy: checks.energyMaeEvPerAtom,
      force: checks.forceVectorMaeEvPerAngstrom,
      stress: checks.stressFrobeniusMaeGpa,
    },
    targets: contract.targets,
    acceptedIntervals: contract.acceptedIntervals,
    officialOrBitExactClaimAllowed: false,
  };
}

function validateReferenceRecord(record, index) {
  const issues = [];
  if (!isPlainObject(record)) return [`reference ${index} is not an object`];
  if (!isAsciiId(record.id)) issues.push('reference ID is invalid');
  if (!Number.isSafeInteger(record.atomCount) || record.atomCount !== FULL_CANDIDATE_ATOMS_PER_FRAME) issues.push(`reference atomCount must be ${FULL_CANDIDATE_ATOMS_PER_FRAME}`);
  if (!validAtomicNumbers(record.atomicNumbers, record.atomCount)) issues.push('reference atomicNumbers are invalid');
  if (!DIGEST_PATTERN.test(record.inputStructureDigest ?? '')) issues.push('reference inputStructureDigest is invalid');
  if (!Number.isFinite(record.energy)) issues.push('reference energy is non-finite');
  if (!flatFiniteVector(record.forces, record.atomCount * 3)) issues.push('reference forces are not a finite flat atomCount*3 vector');
  if (!flatFiniteVector(record.stress, 9)) issues.push('reference stress is not a finite flat 3x3 tensor');
  else if (!symmetricFlatStress(record.stress)) issues.push('reference stress is not symmetric');
  return issues;
}

function validateMatchedRecord(modelId, prediction, reference) {
  return classifyMatchedRecord(modelId, prediction, reference).issues;
}

function classifyMatchedRecord(modelId, prediction, reference) {
  const classified = {
    issues: [], failed: false, nonfinite: false, structureMismatch: false,
    schemaMismatch: false, modelMismatch: false, shapeInvalid: false, asymmetricStress: false,
  };
  if (!isPlainObject(prediction)) {
    classified.issues.push('prediction is not an object');
    classified.shapeInvalid = true;
    return classified;
  }
  if (prediction.schemaVersion !== PREDICTION_SCHEMA) {
    classified.issues.push(`schemaVersion must equal ${PREDICTION_SCHEMA}`);
    classified.schemaMismatch = true;
  }
  if (prediction.status !== 'success') {
    classified.issues.push('status is not success');
    classified.failed = true;
  }
  if (prediction.modelId !== modelId) {
    classified.issues.push('modelId differs from the requested model');
    classified.modelMismatch = true;
  }
  if (prediction.id !== reference.id) {
    classified.issues.push('ID differs from the reference');
    classified.structureMismatch = true;
  }
  if (prediction.atomCount !== reference.atomCount) {
    classified.issues.push('atomCount differs from the reference');
    classified.structureMismatch = true;
  }
  if (!validAtomicNumbers(prediction.atomicNumbers, prediction.atomCount)) {
    classified.issues.push('atomicNumbers are invalid');
    classified.structureMismatch = true;
  } else if (!equalNumberArrays(prediction.atomicNumbers, reference.atomicNumbers)) {
    classified.issues.push('atomicNumbers differ from the reference');
    classified.structureMismatch = true;
  }
  if (!DIGEST_PATTERN.test(prediction.inputStructureDigest ?? '') || prediction.inputStructureDigest !== reference.inputStructureDigest) {
    classified.issues.push('inputStructureDigest differs from the reference');
    classified.structureMismatch = true;
  }
  if (typeof prediction.energyEv !== 'number' || !Number.isFinite(prediction.energyEv)) {
    classified.issues.push('energyEv is non-finite');
    classified.nonfinite = true;
  }
  if (!nestedFiniteMatrix(prediction.forcesEvPerAngstrom, reference.atomCount, 3)) {
    classified.issues.push('forcesEvPerAngstrom is not a finite atomCount*3 matrix');
    classified.shapeInvalid = true;
    if (containsNonfinite(prediction.forcesEvPerAngstrom)) classified.nonfinite = true;
  }
  if (!nestedFiniteMatrix(prediction.stressAseEvPerAngstrom3, 3, 3)) {
    classified.issues.push('stressAseEvPerAngstrom3 is not a finite 3x3 tensor');
    classified.shapeInvalid = true;
    if (containsNonfinite(prediction.stressAseEvPerAngstrom3)) classified.nonfinite = true;
  } else if (!symmetricNestedStress(prediction.stressAseEvPerAngstrom3)) {
    classified.issues.push('stressAseEvPerAngstrom3 is not symmetric');
    classified.asymmetricStress = true;
  }
  return classified;
}

function validateMetricEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0) throw new TypeError('metric report requires at least one entry.');
  const ordered = entries.map((entry, index) => {
    if (!isPlainObject(entry) || !isAsciiId(entry.id)) throw new TypeError(`metric entry ${index} has an invalid ID.`);
    if (typeof entry.error !== 'number' || !Number.isFinite(entry.error) || entry.error < 0) throw new TypeError(`${entry.id}: metric error must be finite and non-negative.`);
    return { id: entry.id, error: Object.is(entry.error, -0) ? 0 : entry.error };
  }).sort((left, right) => asciiCompare(left.id, right.id));
  for (let index = 1; index < ordered.length; index += 1) if (ordered[index - 1].id === ordered[index].id) throw new Error(`metric entries contain duplicate ID ${ordered[index].id}.`);
  return ordered;
}

function recordMetricsAreFinite(metrics) {
  return [
    metrics.energyEvPerAtom,
    metrics.forceVectorMeanEvPerAngstrom,
    metrics.stressFrobeniusGpa,
    metrics.stressSpectralNormGpa,
    metrics.stressUnweightedVoigt6L2Gpa,
    ...Object.values(metrics.stressSixComponentAbsoluteGpa),
  ].every((value) => typeof value === 'number' && Number.isFinite(value) && value >= 0);
}

function symmetricSpectralNorm3x3(matrix) {
  const a00 = matrix[0]; const a01 = matrix[1]; const a02 = matrix[2];
  const a11 = matrix[4]; const a12 = matrix[5]; const a22 = matrix[8];
  const offDiagonalSquared = a01 * a01 + a02 * a02 + a12 * a12;
  if (offDiagonalSquared === 0) return Math.max(Math.abs(a00), Math.abs(a11), Math.abs(a22));
  const mean = (a00 + a11 + a22) / 3;
  const centeredSquared = (a00 - mean) ** 2 + (a11 - mean) ** 2 + (a22 - mean) ** 2 + 2 * offDiagonalSquared;
  const scale = Math.sqrt(centeredSquared / 6);
  if (scale === 0) return Math.abs(mean);
  const b00 = (a00 - mean) / scale;
  const b01 = a01 / scale;
  const b02 = a02 / scale;
  const b11 = (a11 - mean) / scale;
  const b12 = a12 / scale;
  const b22 = (a22 - mean) / scale;
  const determinant = b00 * (b11 * b22 - b12 * b12)
    - b01 * (b01 * b22 - b12 * b02)
    + b02 * (b01 * b12 - b11 * b02);
  const angle = Math.acos(Math.max(-1, Math.min(1, determinant / 2))) / 3;
  const largest = mean + 2 * scale * Math.cos(angle);
  const smallest = mean + 2 * scale * Math.cos(angle + (2 * Math.PI / 3));
  const middle = 3 * mean - largest - smallest;
  return Math.max(Math.abs(largest), Math.abs(middle), Math.abs(smallest));
}

function taggedHash(tag, chunks) {
  const hash = createHash('sha256');
  hash.update(`${METRIC_EVIDENCE_DOMAIN}\0${tag}\0`, 'utf8');
  chunks.forEach((chunk) => hash.update(chunk));
  return hash.digest();
}

function encodedString(value) {
  const bytes = Buffer.from(value, 'ascii');
  return Buffer.concat([encodedUint32(bytes.length), bytes]);
}

function encodedUint32(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new RangeError('uint32 value is outside range.');
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}

function encodedFloat64(value) {
  const bytes = Buffer.alloc(8);
  bytes.writeDoubleLE(Object.is(value, -0) ? 0 : value);
  return bytes;
}

function assertContext(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 128 || !/^[\x21-\x7e]+$/.test(value)) throw new TypeError(`${label} must be non-empty printable ASCII.`);
}

function isAsciiId(value) {
  return typeof value === 'string' && ID_PATTERN.test(value);
}

function asciiCompare(left, right) {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

function sortedIds(values) {
  return [...values].sort(asciiCompare);
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validAtomicNumbers(values, atomCount) {
  return Number.isSafeInteger(atomCount) && atomCount > 0 && Array.isArray(values) && values.length === atomCount
    && values.every((value) => Number.isSafeInteger(value) && value >= 1 && value <= 118);
}

function equalNumberArrays(left, right) {
  return Array.isArray(left) && Array.isArray(right) && left.length === right.length && left.every((value, index) => value === right[index]);
}

function flatFiniteVector(value, length) {
  return Array.isArray(value) && value.length === length && value.every((entry) => typeof entry === 'number' && Number.isFinite(entry));
}

function nestedFiniteMatrix(value, rows, columns) {
  return Array.isArray(value) && value.length === rows
    && value.every((row) => Array.isArray(row) && row.length === columns && row.every((entry) => typeof entry === 'number' && Number.isFinite(entry)));
}

function containsNonfinite(value) {
  if (!Array.isArray(value)) return false;
  return value.flat(Infinity).some((entry) => typeof entry === 'number' && !Number.isFinite(entry));
}

function symmetricFlatStress(value) {
  return Math.abs(value[1] - value[3]) <= Number.EPSILON
    && Math.abs(value[2] - value[6]) <= Number.EPSILON
    && Math.abs(value[5] - value[7]) <= Number.EPSILON;
}

function symmetricNestedStress(value) {
  return Math.abs(value[0][1] - value[1][0]) <= Number.EPSILON
    && Math.abs(value[0][2] - value[2][0]) <= Number.EPSILON
    && Math.abs(value[1][2] - value[2][1]) <= Number.EPSILON;
}
