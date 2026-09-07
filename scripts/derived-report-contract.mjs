import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { parseJsonRejectDuplicateKeys } from './atomistic/runtime-input-contract.mjs';

const MAX_PUBLIC_SUMMARY_BYTES = 4 * 1024;
const MAX_PUBLIC_PRODUCT_EVALUATION_BYTES = 32 * 1024;
const PUBLIC_PRODUCT_EVALUATION_VERSION = 'tf.public-product-evaluation/0.1';
const PUBLIC_SCORECARD_DIMENSION_IDS = Object.freeze([
  'contract',
  'data',
  'atomistic',
  'mesoscale',
  'continuum',
  'process',
  'coupling',
  'world_rollout',
  'uq_ood',
  'repro_cost',
  'visual_truth',
  'safety',
]);
const PUBLIC_COMPARATOR_IDS = Object.freeze([
  'aido-cell-1.0',
  'equiformerv3-dens-oam',
  'tece-oam-rra-1.0',
  'mattersim-1.0.0-5m',
  'mace-mpa-0',
  'openmm-8.5.1-tip3p-ions',
  'openmm-8.6.0-tip3p-control',
  'pfhub-benchmark-3',
  'cantera-3.2-cstr',
  'idaes-2.12',
]);
const PUBLIC_COMPARATOR_EVIDENCE_CLASSES = new Set([
  'claim',
  'auditable',
  'reference',
  'reproduced',
]);
const PUBLIC_GAP_DIMENSIONS = new Set([
  'contract',
  'data',
  'atomistic',
  'mesoscale',
  'continuum',
  'process',
  'coupling',
  'world_rollout',
  'uq_ood',
  'repro_cost',
  'visual_truth',
  'safety',
]);
const PUBLIC_GAP_SEVERITIES = new Set(['P0', 'P1', 'P2', 'P3']);

export function computeArtifactDigest(relativePaths, entries) {
  const digest = createHash('sha256');
  for (const relativePath of relativePaths) {
    const entry = entries.get(relativePath);
    digest.update(`${relativePath.length}:${relativePath}:${formatMode(entry.mode)}:${entry.byteLength}:${entry.digest}\n`);
  }
  return `sha256:${digest.digest('hex')}`;
}

function formatMode(mode) {
  if (!Number.isInteger(mode) || mode < 0 || mode > 0o7777) {
    throw new Error(`Evaluator source mode is invalid: ${String(mode)}.`);
  }
  return mode.toString(8).padStart(4, '0');
}

export function validateWorkerReport(reportJson, reportMarkdown, relativePaths, manifest, digest, workerStatus, expectedRevision) {
  let report;
  try {
    report = parseJsonRejectDuplicateKeys(reportJson, 'evaluator report');
  } catch {
    throw new Error('Evaluator worker produced malformed JSON.');
  }
  if (report.artifactDigest !== digest
    || report.sourceFileCount !== relativePaths.length
    || JSON.stringify(report.sourceManifest) !== JSON.stringify(manifest)
    || report.sourceRevision !== expectedRevision) {
    throw new Error('Evaluator worker report is not bound to the frozen source snapshot.');
  }
  if (!Array.isArray(report.hardGateFailures) || !['accept', 'conditional', 'reject'].includes(report.verdict)) {
    throw new Error('Evaluator worker report has an invalid verdict contract.');
  }
  const successful = workerStatus === 0 && report.hardGateFailures.length === 0 && report.verdict !== 'reject';
  const rejected = Number.isInteger(workerStatus) && workerStatus !== 0 && report.hardGateFailures.length > 0 && report.verdict === 'reject';
  if (!successful && !rejected) throw new Error(`Evaluator worker exit/report mismatch (${String(workerStatus)} / ${String(report.verdict)}).`);
  const markdown = reportMarkdown.toString('utf8');
  if (!markdown.includes(`Verdict: **${report.verdict.toUpperCase()}**`) || !markdown.includes(report.artifactDigest)) {
    throw new Error('Evaluator Markdown is not bound to the JSON verdict and artifact.');
  }
  return report;
}

export function buildPublicSummary(report) {
  if (!Array.isArray(report.gaps) || report.gaps.length > 3) {
    throw new Error('Evaluator report gaps cannot be projected into the bounded public summary.');
  }
  const gaps = report.gaps.map((gap) => {
    if (!gap || typeof gap !== 'object'
      || !PUBLIC_GAP_SEVERITIES.has(gap.severity)
      || !PUBLIC_GAP_DIMENSIONS.has(gap.dimension)) {
      throw new Error('Evaluator report contains an invalid public gap identifier.');
    }
    return { severity: gap.severity, dimension: gap.dimension };
  });
  if (new Set(gaps.map((gap) => gap.dimension)).size !== gaps.length) {
    throw new Error('Evaluator report contains duplicate public gap identifiers.');
  }
  const summary = {
    artifactDigest: report.artifactDigest,
    verdict: report.verdict,
    gaps,
  };
  const bytes = Buffer.from(`${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  if (bytes.length > MAX_PUBLIC_SUMMARY_BYTES) throw new Error('Evaluator public summary exceeds its size limit.');
  return bytes;
}

export function capturedJson(entries, relativePath) {
  const entry = entries.get(relativePath);
  if (!entry || !Buffer.isBuffer(entry.content)) {
    throw new Error(`Evaluator public product projection source is missing: ${relativePath}.`);
  }
  try {
    return parseJsonRejectDuplicateKeys(entry.content, relativePath);
  } catch {
    throw new Error(`Evaluator public product projection source is malformed: ${relativePath}.`);
  }
}

export function buildPublicProductEvaluation(report, scorecard, registry) {
  if (!report || typeof report !== 'object'
    || !/^sha256:[0-9a-f]{64}$/.test(report.artifactDigest ?? '')) {
    throw new Error('Evaluator public product projection lacks a bound source artifact digest.');
  }
  if (!scorecard || typeof scorecard !== 'object' || Array.isArray(scorecard)
    || !isPublicIdentifier(scorecard.candidateVersion, 128)
    || !Array.isArray(scorecard.dimensions)
    || scorecard.dimensions.length !== PUBLIC_SCORECARD_DIMENSION_IDS.length) {
    throw new Error('Evaluator scorecard cannot enter the public product projection.');
  }
  const dimensions = scorecard.dimensions.map((dimension, index) => {
    const expectedId = PUBLIC_SCORECARD_DIMENSION_IDS[index];
    if (!dimension || typeof dimension !== 'object' || Array.isArray(dimension)
      || dimension.id !== expectedId
      || !isPublicText(dimension.displayLabel, 96)
      || !Number.isSafeInteger(dimension.weight)
      || dimension.weight < 0
      || dimension.weight > 100
      || !Number.isSafeInteger(dimension.score)
      || dimension.score < 0
      || dimension.score > 4
      || !isPublicText(dimension.summary, 256)) {
      throw new Error(`Evaluator scorecard dimension cannot enter the public product projection: ${expectedId}.`);
    }
    return {
      id: dimension.id,
      displayLabel: dimension.displayLabel,
      weight: dimension.weight,
      score: dimension.score,
      summary: dimension.summary,
    };
  });
  if (dimensions.reduce((total, dimension) => total + dimension.weight, 0) !== 100) {
    throw new Error('Evaluator public scorecard weights must total 100.');
  }
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)
    || !/^\d{4}-\d{2}-\d{2}$/.test(registry.snapshotDate ?? '')
    || !Array.isArray(registry.comparators)
    || registry.comparators.length !== PUBLIC_COMPARATOR_IDS.length) {
    throw new Error('Evaluator comparator registry cannot enter the public product projection.');
  }
  const items = registry.comparators.map((comparator, index) => {
    const expectedId = PUBLIC_COMPARATOR_IDS[index];
    if (!comparator || typeof comparator !== 'object' || Array.isArray(comparator)
      || comparator.id !== expectedId
      || !isPublicText(comparator.name, 128)
      || !isPublicText(comparator.scope, 256)
      || !PUBLIC_COMPARATOR_EVIDENCE_CLASSES.has(comparator.evidenceClass)) {
      throw new Error(`Evaluator comparator cannot enter the public product projection: ${expectedId}.`);
    }
    return {
      id: comparator.id,
      name: comparator.name,
      scope: comparator.scope,
      evidenceClass: comparator.evidenceClass,
    };
  });
  const projection = {
    schemaVersion: PUBLIC_PRODUCT_EVALUATION_VERSION,
    sourceArtifactDigest: report.artifactDigest,
    scorecard: {
      candidateVersion: scorecard.candidateVersion,
      dimensions,
    },
    comparators: {
      snapshotDate: registry.snapshotDate,
      items,
    },
  };
  const bytes = Buffer.from(`${JSON.stringify(projection, null, 2)}\n`, 'utf8');
  if (bytes.length < 2
    || bytes.length > MAX_PUBLIC_PRODUCT_EVALUATION_BYTES
    || bytes.includes(0)) {
    throw new Error('Evaluator public product projection exceeds its byte contract.');
  }
  return bytes;
}

function isPublicIdentifier(value, maximumLength) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maximumLength
    && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

function isPublicText(value, maximumLength) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maximumLength
    && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value);
}


export const DERIVED_REPORT_PATHS = Object.freeze([
  'evaluation/latest-report.json',
  'evaluation/latest-report.md',
  'evaluation/public-product-evaluation.json',
  'evaluation/public-summary.json',
]);
export const REPORT_BYTE_LIMITS = Object.freeze({
  'evaluation/latest-report.json': 16 * 1024 * 1024,
  'evaluation/latest-report.md': 2 * 1024 * 1024,
  'evaluation/public-product-evaluation.json': MAX_PUBLIC_PRODUCT_EVALUATION_BYTES,
  'evaluation/public-summary.json': MAX_PUBLIC_SUMMARY_BYTES,
});
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const requireCondition = (condition, code) => { if (!condition) throw new Error(code); };

// Captured input must come from a stable filesystem read by the caller, never
// from the report's self-declared manifest. Keep the evaluator's mode-sensitive
// digest distinct from admission's Git-mode-normalized sourceInputIdentity.
export function capturedInputIdentity(entries) {
  requireCondition(entries instanceof Map && entries.size > 0, 'CAPTURED_INPUT_REQUIRED');
  const paths = [...entries.keys()].sort();
  for (const file of paths) {
    const entry = entries.get(file);
    requireCondition(typeof file === 'string' && Buffer.isBuffer(entry?.content)
      && entry.byteLength === entry.content.length
      && entry.digest === `sha256:${sha256(entry.content)}`, 'CAPTURED_INPUT_IDENTITY');
  }
  return {
    artifactDigest: computeArtifactDigest(paths, entries),
    sourceFileCount: paths.length,
    sourceManifest: Object.fromEntries(paths.map(file => [file, entries.get(file).digest])),
  };
}

export function reportOutputIdentities(reportBytesByPath) {
  requireCondition(reportBytesByPath instanceof Map
    && isDeepStrictEqual([...reportBytesByPath.keys()].sort(), [...DERIVED_REPORT_PATHS]), 'FOUR_REPORTS_REQUIRED');
  return DERIVED_REPORT_PATHS.map(file => {
    const bytes = reportBytesByPath.get(file);
    requireCondition(Buffer.isBuffer(bytes) && bytes.length > 0
      && bytes.length <= REPORT_BYTE_LIMITS[file], `REPORT_BYTES_INVALID:${file}`);
    // Reject invalid UTF-8, including Markdown, without silently replacing it.
    new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (file.endsWith('.json')) parseJsonRejectDuplicateKeys(bytes, file);
    return { path: file, size: bytes.length, sha256: sha256(bytes) };
  });
}

// This unsigned statement binds bytes to an observed publication, not to an
// authenticated execution. The outer gate must separately observe the real
// command, terminal exit status and frozen logs. Never feed this back to inputs.
export function makeGenerationStatement({ capturedInputs, expectedSourceRevision, reportBytesByPath, workerExitCode }) {
  requireCondition(expectedSourceRevision === null || /^[0-9a-f]{40}$/.test(expectedSourceRevision), 'SOURCE_REVISION_INVALID');
  requireCondition(Number.isInteger(workerExitCode), 'WORKER_EXIT_REQUIRED');
  return {
    schemaVersion: 'tf.derived-report-generation/0.1',
    sourceIdentity: capturedInputIdentity(capturedInputs),
    sourceRevision: expectedSourceRevision,
    workerExitCode,
    outputs: reportOutputIdentities(reportBytesByPath),
    publicationVerified: true,
    executionAuthenticated: false,
    releaseEligible: false,
  };
}

export function checkDerivedReports({ capturedInputs, expectedSourceRevision, reportBytesByPath, generationEvidence }) {
  const result = { schemaVersion: 'tf.derived-report-consistency/0.1', status: 'abstain',
    releaseEligible: false, executionAuthenticated: false, scientificValidation: false, reasons: [] };
  try {
    const identity = capturedInputIdentity(capturedInputs);
    result.inputIdentity = identity;
    result.outputIdentities = reportOutputIdentities(reportBytesByPath);
    requireCondition(generationEvidence !== undefined && generationEvidence !== null, 'GENERATION_EVIDENCE_REQUIRED');
    requireCondition(generationEvidence.workerExitCode === 0, 'GENERATION_NOT_SUCCESSFUL');
    const expected = makeGenerationStatement({ capturedInputs, expectedSourceRevision, reportBytesByPath, workerExitCode: 0 });
    requireCondition(isDeepStrictEqual(generationEvidence, expected), 'GENERATION_SOURCE_OR_OUTPUT_MISMATCH');
    const report = validateWorkerReport(reportBytesByPath.get(DERIVED_REPORT_PATHS[0]),
      reportBytesByPath.get(DERIVED_REPORT_PATHS[1]), [...capturedInputs.keys()].sort(),
      identity.sourceManifest, identity.artifactDigest, 0, expectedSourceRevision);
    requireCondition(reportBytesByPath.get('evaluation/public-summary.json').equals(buildPublicSummary(report)), 'PUBLIC_SUMMARY_PROJECTION_MISMATCH');
    requireCondition(reportBytesByPath.get('evaluation/public-product-evaluation.json').equals(buildPublicProductEvaluation(report,
      capturedJson(capturedInputs, 'evaluation/current-scorecard.json'),
      capturedJson(capturedInputs, 'evaluation/baselines/registry.json'))), 'PUBLIC_PRODUCT_PROJECTION_MISMATCH');
    result.status = 'pass-derived-report-consistency';
  } catch (error) { result.reasons.push(String(error.message ?? error)); }
  return result;
}
