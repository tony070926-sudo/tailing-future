import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DETERMINISM_ROOTS_CONTRACT_PATH,
  DETERMINISM_ROOTS_CONTRACT_RAW_DIGEST,
  DETERMINISM_ROOTS_CONTRACT_SCHEMA_PATH,
  DETERMINISM_ROOTS_CONTRACT_SCHEMA_RAW_DIGEST,
  DETERMINISM_ROOTS_CONTRACT_SCHEMA_SEMANTIC_DIGEST,
  DETERMINISM_ROOTS_CONTRACT_SEMANTIC_DIGEST,
  OBSERVER_CONTRACT_PATH,
  OBSERVER_CONTRACT_RAW_DIGEST,
  OBSERVER_CONTRACT_SCHEMA_PATH,
  OBSERVER_RECEIPT_SCHEMA_PATH,
  OBSERVER_RECEIPT_SCHEMA_RAW_DIGEST,
  OBSERVER_RECEIPT_SCHEMA_SEMANTIC_DIGEST,
  OBSERVER_RANDOM_TP_ID_MANIFEST_PATH,
  OBSERVER_WORKFLOW_RAW_DIGEST,
  OBSERVER_WORKFLOW_SIZE_BYTES,
  OBSERVER_WORKFLOW_SOURCE_PATH,
  STRESS_SYMMETRY_ABSOLUTE_TOLERANCE,
  assessCalculatorNativeStressForSymmetry,
  buildFixtureReceipt,
  buildSyntheticCampaignFixture,
  canonicalDeterminismRoots,
  canonicalProvenancePayload,
  canonicalScientificPayload,
  forceRichardson,
  inspectDeterminismRootsContractBytes,
  inspectDeterminismRootsSchemaBytes,
  inspectObserverContractBytes,
  inspectObserverReceiptSchemaBytes,
  inspectRandomTpIdManifestBytes,
  inspectObserverWorkflowSource,
  nextBinary64,
  parseExecutionProvenanceForDeterminism,
  parsePredictionJsonlForDeterminism,
  passesAbsoluteRelative,
  passesStressSymmetry,
  sha256,
  stressRichardson,
  stressSymmetryResidual,
  validateDeterminismFixture,
  validateDeterminismRootsContractSchema,
  validateDeterminismRootsContractSemantics,
  validateFixtureReceipt,
  validateObserverContractRepository,
  validateObserverContractSchema,
  validateObserverContractSemantics,
  validateObserverSourceSetRepository,
  validateObserverWorkflowSourceRepository,
  validateScientificPredictionRecords,
  validateSyntheticCampaignFixture,
  validateSyntheticHostObservations,
} from './full-candidate-observer-vnext.mjs';
import {
  canonicalJson,
  parseJsonRejectingDuplicateMembers,
} from './runtime-lock-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const contractBytes = await readFile(path.join(root, OBSERVER_CONTRACT_PATH));
const contractSchemaBytes = await readFile(path.join(root, OBSERVER_CONTRACT_SCHEMA_PATH));
const receiptSchemaBytes = await readFile(path.join(root, OBSERVER_RECEIPT_SCHEMA_PATH));
const determinismContractBytes = await readFile(
  path.join(root, DETERMINISM_ROOTS_CONTRACT_PATH),
);
const determinismSchemaBytes = await readFile(
  path.join(root, DETERMINISM_ROOTS_CONTRACT_SCHEMA_PATH),
);
const workflowBytes = await readFile(path.join(root, OBSERVER_WORKFLOW_SOURCE_PATH));
const idManifestBytes = await readFile(path.join(root, OBSERVER_RANDOM_TP_ID_MANIFEST_PATH));
const frozenRunnerSource = await readFile(
  path.join(root, 'scripts/atomistic/v2/run_model.py'),
  'utf8',
);
const frozenRuntimeContractSource = await readFile(
  path.join(root, 'scripts/atomistic/v2/runtime_contract.py'),
  'utf8',
);
const contract = parseJsonRejectingDuplicateMembers(contractBytes);
const contractSchema = parseJsonRejectingDuplicateMembers(contractSchemaBytes);
const receiptSchema = parseJsonRejectingDuplicateMembers(receiptSchemaBytes);
const determinismContract = parseJsonRejectingDuplicateMembers(determinismContractBytes);
const determinismSchema = parseJsonRejectingDuplicateMembers(determinismSchemaBytes);
const workflowSource = workflowBytes.toString('utf8');
const clone = (value) => structuredClone(value);
const predictionJsonl = (records) => Buffer.from(
  `${records.map((record) => canonicalJson(record)).join('\n')}\n`,
  'utf8',
);
const provenanceJson = (provenance) => Buffer.from(
  `${canonicalJson(provenance)}\n`,
  'utf8',
);
const rebindExecutionProvenance = (records, provenance, mutate) => {
  mutate(provenance.environmentBinding, provenance.hostObservation);
  provenance.environmentSha256 = sha256(Buffer.from(
    canonicalJson(provenance.environmentBinding),
    'utf8',
  ));
  records.forEach((record) => {
    record.environmentSha256 = provenance.environmentSha256;
  });
};
const canonicalBytesWithSpans = (value, capture) => {
  const chunks = [];
  const spans = [];
  let offset = 0;
  const append = (source) => {
    chunks.push(source);
    offset += Buffer.byteLength(source, 'utf8');
  };
  const visit = (entry, pathParts) => {
    if (entry === null) {
      append('null');
      return;
    }
    if (Array.isArray(entry)) {
      append('[');
      entry.forEach((child, index) => {
        if (index > 0) append(',');
        visit(child, [...pathParts, index]);
      });
      append(']');
      return;
    }
    if (typeof entry === 'object') {
      append('{');
      Object.keys(entry).sort().forEach((key, index) => {
        if (index > 0) append(',');
        append(`${JSON.stringify(key)}:`);
        visit(entry[key], [...pathParts, key]);
      });
      append('}');
      return;
    }
    if (typeof entry === 'number' && !Number.isFinite(entry)) {
      throw new TypeError('non-finite scalar in test canonicalizer');
    }
    const normalized = typeof entry === 'number' && Object.is(entry, -0) ? 0 : entry;
    const encoded = JSON.stringify(normalized);
    if (encoded === undefined) throw new TypeError('unsupported scalar in test canonicalizer');
    const start = offset;
    append(encoded);
    if (capture(pathParts, normalized)) {
      spans.push({ pathParts, start, end: offset, value: normalized });
    }
  };
  visit(value, []);
  return { bytes: Buffer.from(chunks.join(''), 'utf8'), spans };
};
const sha256WithReplacement = (bytes, { start, end }, replacement) => {
  const hash = createHash('sha256');
  hash.update(bytes.subarray(0, start));
  hash.update(Buffer.from(replacement, 'utf8'));
  hash.update(bytes.subarray(end));
  return `sha256:${hash.digest('hex')}`;
};
const FIXTURE_COMMAND_IN_SOURCE =
  'node scripts/atomistic/full-candidate-observer-vnext.mjs --emit-fixture';
const CHECKOUT_ACTION_IN_SOURCE =
  'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803';
const reviewedSourceBytes = new Map([
  [OBSERVER_CONTRACT_PATH, contractBytes],
  [OBSERVER_WORKFLOW_SOURCE_PATH, workflowBytes],
  [OBSERVER_CONTRACT_SCHEMA_PATH, contractSchemaBytes],
  [OBSERVER_RECEIPT_SCHEMA_PATH, receiptSchemaBytes],
  [DETERMINISM_ROOTS_CONTRACT_PATH, determinismContractBytes],
  [DETERMINISM_ROOTS_CONTRACT_SCHEMA_PATH, determinismSchemaBytes],
]);

async function createReviewedSourceRepository(prefix = 'tf-observer-sources-') {
  const temporary = await mkdtemp(path.join(os.tmpdir(), prefix));
  const canonicalTemporary = await realpath(temporary);
  for (const [relativePath, bytes] of reviewedSourceBytes) {
    const absolutePath = path.join(canonicalTemporary, ...relativePath.split('/'));
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, bytes, { mode: 0o644 });
  }
  execFileSync('/usr/bin/git', ['init', '-q'], { cwd: canonicalTemporary });
  execFileSync('/usr/bin/git', ['add', '--', ...reviewedSourceBytes.keys()], {
    cwd: canonicalTemporary,
  });
  return canonicalTemporary;
}

describe('full-candidate vNext fixture-only observer contract', () => {
  it('binds the exact contract, schemas, unregistered workflow source and unchanged v0.2 receipt', async () => {
    const inspected = inspectObserverContractBytes(contractBytes);
    expect(inspected.failures).toEqual([]);
    expect(inspected.rawDigest).toBe(OBSERVER_CONTRACT_RAW_DIGEST);
    expect(validateObserverContractSchema(contract, contractSchema)).toEqual([]);
    expect(validateObserverContractSemantics(contract)).toEqual([]);
    expect(inspectObserverWorkflowSource(workflowBytes)).toEqual([]);
    expect(workflowBytes).toHaveLength(OBSERVER_WORKFLOW_SIZE_BYTES);
    expect(sha256(workflowBytes)).toBe(OBSERVER_WORKFLOW_RAW_DIGEST);
    expect(OBSERVER_WORKFLOW_SOURCE_PATH.startsWith('.github/workflows/')).toBe(false);
    expect(inspectRandomTpIdManifestBytes(idManifestBytes).failures).toEqual([]);
    const determinismInspection = inspectDeterminismRootsContractBytes(
      determinismContractBytes,
    );
    expect(determinismInspection.failures).toEqual([]);
    expect(determinismInspection.rawDigest).toBe(DETERMINISM_ROOTS_CONTRACT_RAW_DIGEST);
    expect(determinismInspection.semanticDigest)
      .toBe(DETERMINISM_ROOTS_CONTRACT_SEMANTIC_DIGEST);
    expect(sha256(determinismSchemaBytes))
      .toBe(DETERMINISM_ROOTS_CONTRACT_SCHEMA_RAW_DIGEST);
    expect(sha256(Buffer.from(canonicalJson(determinismSchema), 'utf8')))
      .toBe(DETERMINISM_ROOTS_CONTRACT_SCHEMA_SEMANTIC_DIGEST);
    expect(sha256(Buffer.from(canonicalJson(receiptSchema), 'utf8')))
      .toBe(OBSERVER_RECEIPT_SCHEMA_SEMANTIC_DIGEST);
    expect(validateDeterminismRootsContractSchema(
      determinismContract,
      determinismSchema,
    )).toEqual([]);
    expect(validateDeterminismRootsContractSemantics(determinismContract)).toEqual([]);
    const mutatedIdManifest = Buffer.from(idManifestBytes.toString('utf8').replace(
      'random-TP-000000',
      'random-TP-999999',
    ));
    expect(inspectRandomTpIdManifestBytes(mutatedIdManifest).failures.join('\n'))
      .toMatch(/observer\.idManifest\.(?:rawDigest|ids\[1\])/);

    const result = await validateObserverContractRepository(contractBytes, {
      root,
      contractSchemaBytes,
      receiptSchemaBytes,
      determinismContractBytes,
      determinismSchemaBytes,
      workflowBytes,
      requireWorkflowGitIndex: false,
    });
    expect(result.failures).toEqual([]);
  });

  it('rejects duplicate decoded JSON members before schema or policy validation', () => {
    const duplicated = Buffer.from(contractBytes.toString('utf8').replace(
      '"schemaVersion": "tf.atomistic-full-candidate-observer-contract/0.1",',
      '"\\u0073chemaVersion": "forged",\n  "schemaVersion": "tf.atomistic-full-candidate-observer-contract/0.1",',
    ));
    expect(inspectObserverContractBytes(duplicated, { enforceFrozenDigest: false })
      .failures.join('\n')).toMatch(/strict JSON failed.*duplicate/i);
  });

  it('binds determinism-root raw and semantic bytes and rejects duplicate contract/schema members', () => {
    const whitespaceDrift = Buffer.concat([
      determinismContractBytes,
      Buffer.from(' ', 'utf8'),
    ]);
    const whitespaceInspection = inspectDeterminismRootsContractBytes(whitespaceDrift);
    expect(whitespaceInspection.failures.join('\n')).toMatch(/rawDigest/);
    expect(whitespaceInspection.failures.join('\n')).not.toMatch(/semanticDigest/);

    const keyReorderedBytes = Buffer.from(JSON.stringify(Object.fromEntries(
      Object.entries(determinismContract).reverse(),
    )), 'utf8');
    const keyReorderedInspection = inspectDeterminismRootsContractBytes(
      keyReorderedBytes,
    );
    expect(keyReorderedInspection.rawDigest).not.toBe(DETERMINISM_ROOTS_CONTRACT_RAW_DIGEST);
    expect(keyReorderedInspection.semanticDigest)
      .toBe(DETERMINISM_ROOTS_CONTRACT_SEMANTIC_DIGEST);
    expect(keyReorderedInspection.failures.join('\n')).toMatch(/rawDigest/);
    expect(keyReorderedInspection.failures.join('\n')).not.toMatch(/semanticDigest/);

    const semanticDrift = Buffer.from(determinismContractBytes.toString('utf8').replace(
      'Define closed, bounded and separately rooted',
      'Define closed, bounded and distinctly rooted',
    ));
    const semanticInspection = inspectDeterminismRootsContractBytes(semanticDrift);
    expect(semanticInspection.failures.join('\n')).toMatch(/rawDigest/);
    expect(semanticInspection.failures.join('\n')).toMatch(/semanticDigest/);

    const duplicateContract = Buffer.from(determinismContractBytes.toString('utf8').replace(
      '"schemaVersion": "tf.atomistic-full-candidate-determinism-roots/0.1",',
      '"schemaVersion": "forged",\n  "schemaVersion": "tf.atomistic-full-candidate-determinism-roots/0.1",',
    ));
    expect(inspectDeterminismRootsContractBytes(
      duplicateContract,
      { enforceFrozenDigest: false },
    ).failures.join('\n')).toMatch(/strict JSON failed.*duplicate/i);
    expect(inspectDeterminismRootsContractBytes(Buffer.alloc(1_000_001)).failures.join('\n'))
      .toMatch(/byte limit exceeded/);

    const duplicateSchema = Buffer.from(determinismSchemaBytes.toString('utf8').replace(
      '"$schema": "https://json-schema.org/draft/2020-12/schema",',
      '"$schema": "forged",\n  "$schema": "https://json-schema.org/draft/2020-12/schema",',
    ));
    expect(() => parseJsonRejectingDuplicateMembers(duplicateSchema)).toThrow(/duplicate/i);
  });

  it('strictly binds and bounds the determinism-root schema bytes', () => {
    const baseline = inspectDeterminismRootsSchemaBytes(determinismSchemaBytes);
    expect(baseline.failures).toEqual([]);
    expect(baseline.rawDigest).toBe(DETERMINISM_ROOTS_CONTRACT_SCHEMA_RAW_DIGEST);
    expect(baseline.semanticDigest)
      .toBe(DETERMINISM_ROOTS_CONTRACT_SCHEMA_SEMANTIC_DIGEST);

    const whitespace = inspectDeterminismRootsSchemaBytes(Buffer.concat([
      determinismSchemaBytes,
      Buffer.from(' ', 'utf8'),
    ]));
    expect(whitespace.failures.join('\n')).toMatch(/rawDigest/);
    expect(whitespace.failures.join('\n')).not.toMatch(/semanticDigest/);
    const semantic = inspectDeterminismRootsSchemaBytes(Buffer.from(
      determinismSchemaBytes.toString('utf8').replace(
        'Closed, fixture-only and dispatch-disabled rules',
        'Closed, fixture-only, strictly dispatch-disabled rules',
      ),
    ));
    expect(semantic.failures.join('\n')).toMatch(/rawDigest/);
    expect(semantic.failures.join('\n')).toMatch(/semanticDigest/);
    const duplicate = inspectDeterminismRootsSchemaBytes(Buffer.from(
      determinismSchemaBytes.toString('utf8').replace(
        '"$schema": "https://json-schema.org/draft/2020-12/schema",',
        '"$schema": "forged",\n  "$schema": "https://json-schema.org/draft/2020-12/schema",',
      ),
    ));
    expect(duplicate.failures.join('\n')).toMatch(/strict JSON\/schema failed.*duplicate/i);
    expect(inspectDeterminismRootsSchemaBytes(Buffer.alloc(1_000_001)).failures.join('\n'))
      .toMatch(/byte limit exceeded/);
  });

  it('strictly binds and bounds the changed host-observation schema bytes', () => {
    const baseline = inspectObserverReceiptSchemaBytes(receiptSchemaBytes);
    expect(baseline.failures).toEqual([]);
    expect(baseline.rawDigest).toBe(OBSERVER_RECEIPT_SCHEMA_RAW_DIGEST);
    expect(baseline.semanticDigest).toBe(OBSERVER_RECEIPT_SCHEMA_SEMANTIC_DIGEST);

    const whitespace = inspectObserverReceiptSchemaBytes(Buffer.concat([
      receiptSchemaBytes,
      Buffer.from(' ', 'utf8'),
    ]));
    expect(whitespace.failures.join('\n')).toMatch(/rawDigest/);
    expect(whitespace.failures.join('\n')).not.toMatch(/semanticDigest/);
    const semantic = inspectObserverReceiptSchemaBytes(Buffer.from(
      receiptSchemaBytes.toString('utf8').replace(
        'A fixture-only, non-scientific and non-promotional receipt.',
        'A strict fixture-only, non-scientific and non-promotional receipt.',
      ),
    ));
    expect(semantic.failures.join('\n')).toMatch(/rawDigest/);
    expect(semantic.failures.join('\n')).toMatch(/semanticDigest/);
    const duplicate = inspectObserverReceiptSchemaBytes(Buffer.from(
      receiptSchemaBytes.toString('utf8').replace(
        '"$schema": "https://json-schema.org/draft/2020-12/schema",',
        '"$schema": "forged",\n  "$schema": "https://json-schema.org/draft/2020-12/schema",',
      ),
    ));
    expect(duplicate.failures.join('\n')).toMatch(/strict JSON\/schema failed.*duplicate/i);
    expect(inspectObserverReceiptSchemaBytes(Buffer.alloc(1_000_001)).failures.join('\n'))
      .toMatch(/byte limit exceeded/);
  });

  it.each([
    ['shared-host topology', (candidate) => { candidate.topology.sharedHost = false; }, /observer\.contract\.topology\.sharedHost/],
    ['four executions', (candidate) => { candidate.topology.requiredFreshContainerExecutions.value = 3; }, /observer\.contract\.topology\.requiredFreshContainerExecutions\.value/],
    ['execution order', (candidate) => { candidate.topology.executionOrder[2].sequence = 3; }, /observer\.contract\.topology\.executionOrder\[2\]\.sequence/],
    ['fresh container', (candidate) => { candidate.topology.executionOrder[0].freshContainerRequired = false; }, /observer\.contract\.topology\.executionOrder\[0\]\.freshContainerRequired/],
    ['authoritative 693', (candidate) => { candidate.topology.executionOrder[0].benchmarkPredictionRecords.value = 692; }, /observer\.contract\.topology\.executionOrder\[0\]\.benchmarkPredictionRecords\.value/],
    ['repeat 693', (candidate) => { candidate.topology.recordsPerModel.repeatValidation.value = 694; }, /observer\.contract\.topology\.recordsPerModel\.repeatValidation\.value/],
    ['metric denominator', (candidate) => { candidate.topology.recordsPerModel.metricDenominator.value = 1386; }, /observer\.contract\.topology\.recordsPerModel\.metricDenominator\.value/],
    ['determinism denominator', (candidate) => { candidate.topology.recordsPerModel.determinismDenominator.value = 1386; }, /observer\.contract\.topology\.recordsPerModel\.determinismDenominator\.value/],
    ['4044 requests', (candidate) => { candidate.topology.totals.adapterRequests.value = 4043; }, /observer\.contract\.topology\.totals\.adapterRequests\.value/],
    ['count unit', (candidate) => { candidate.topology.totals.adapterRequests.unit = 'record'; }, /observer\.contract\.topology\.totals\.adapterRequests\.unit/],
    ['count dimension', (candidate) => { candidate.topology.totals.adapterRequests.dimension = 'mystery'; }, /observer\.contract\.topology\.totals\.adapterRequests\.dimension/],
    ['count basis', (candidate) => { candidate.topology.totals.adapterRequests.basis = ''; }, /observer\.contract\.topology\.totals\.adapterRequests\.basis/],
    ['probe metric exclusion', (candidate) => { candidate.topology.probeRecordsExcludedFromMetricDenominator = false; }, /observer\.contract\.topology\.probeRecordsExcludedFromMetricDenominator/],
    ['probe determinism exclusion', (candidate) => { candidate.topology.probeRecordsExcludedFromDeterminismDenominator = false; }, /observer\.contract\.topology\.probeRecordsExcludedFromDeterminismDenominator/],
    ['ordinal zero authority', (candidate) => { candidate.topology.authoritativeExecutionOrdinal = 1; }, /observer\.contract\.topology\.authoritativeExecutionOrdinal/],
    ['repeat replacement', (candidate) => { candidate.topology.repeatMayReplaceAuthority = true; }, /observer\.contract\.topology\.repeatMayReplaceAuthority/],
    ['invariance count', (candidate) => { candidate.validation.invariancePerModel.requiredCases.value = 39; }, /observer\.contract\.validation\.invariancePerModel\.requiredCases\.value/],
    ['translation unit', (candidate) => { candidate.validation.invariancePerModel.translationFractionalShift.unit = 'angstrom'; }, /observer\.contract\.validation\.invariancePerModel\.translationFractionalShift\.unit/],
    ['translation dimension', (candidate) => { candidate.validation.invariancePerModel.translationFractionalShift.dimension = 'length'; }, /observer\.contract\.validation\.invariancePerModel\.translationFractionalShift\.dimension/],
    ['translation basis', (candidate) => { candidate.validation.invariancePerModel.translationFractionalShift.basis = ''; }, /observer\.contract\.validation\.invariancePerModel\.translationFractionalShift\.basis/],
    ['rotation unit', (candidate) => { candidate.validation.invariancePerModel.properRotation.unit = 'degree'; }, /observer\.contract\.validation\.invariancePerModel\.properRotation\.unit/],
    ['rotation dimension', (candidate) => { candidate.validation.invariancePerModel.properRotation.dimension = 'angle'; }, /observer\.contract\.validation\.invariancePerModel\.properRotation\.dimension/],
    ['rotation basis', (candidate) => { candidate.validation.invariancePerModel.properRotation.basis = ''; }, /observer\.contract\.validation\.invariancePerModel\.properRotation\.basis/],
    ['force case count', (candidate) => { candidate.validation.forceFiniteDifferencePerModel.requiredCases.value = 88; }, /observer\.contract\.validation\.forceFiniteDifferencePerModel\.requiredCases\.value/],
    ['force probes', (candidate) => { candidate.validation.forceFiniteDifferencePerModel.requiredEnergyProbes.value = 355; }, /observer\.contract\.validation\.forceFiniteDifferencePerModel\.requiredEnergyProbes\.value/],
    ['force sign', (candidate) => { candidate.validation.forceFiniteDifferencePerModel.centralDifference = 'F_h=(E(q+h)-E(q-h))/(2h)'; }, /observer\.contract\.validation\.forceFiniteDifferencePerModel\.centralDifference/],
    ['stress cases', (candidate) => { candidate.validation.stressFiniteDifferencePerModel.requiredCases.value = 59; }, /observer\.contract\.validation\.stressFiniteDifferencePerModel\.requiredCases\.value/],
    ['stress probes', (candidate) => { candidate.validation.stressFiniteDifferencePerModel.requiredEnergyProbes.value = 239; }, /observer\.contract\.validation\.stressFiniteDifferencePerModel\.requiredEnergyProbes\.value/],
    ['stress fixed Cartesian', (candidate) => { candidate.validation.stressFiniteDifferencePerModel.coordinateConvention = 'fixed-cartesian-coordinates'; }, /observer\.contract\.validation\.stressFiniteDifferencePerModel\.coordinateConvention/],
    ['stress shear basis', (candidate) => { candidate.validation.stressFiniteDifferencePerModel.strainBasis = 'full-off-diagonal'; }, /observer\.contract\.validation\.stressFiniteDifferencePerModel\.strainBasis/],
    ['post-hoc stress sign', (candidate) => { candidate.validation.stressFiniteDifferencePerModel.postHocSignSelectionAllowed = true; }, /observer\.contract\.validation\.stressFiniteDifferencePerModel\.postHocSignSelectionAllowed/],
    ['stress absolute tolerance', (candidate) => { candidate.validation.stressSymmetry.absoluteTolerance.value = 1e-9; }, /observer\.contract\.validation\.stressSymmetry\.absoluteTolerance\.value/],
    ['stress relative tolerance', (candidate) => { candidate.validation.stressSymmetry.relativeTolerance.value = 1e-8; }, /observer\.contract\.validation\.stressSymmetry\.relativeTolerance\.value/],
    ['pre-gate symmetrization', (candidate) => { candidate.validation.stressSymmetry.symmetrizationBeforeGateAllowed = true; }, /observer\.contract\.validation\.stressSymmetry\.symmetrizationBeforeGateAllowed/],
    ['ASE-derived raw source', (candidate) => { candidate.validation.stressSymmetry.sourceContract.aseAtomsGetStressVoigtFalseAcceptedAsRawSource = true; }, /observer\.contract\.validation\.stressSymmetry\.sourceContract\.aseAtomsGetStressVoigtFalseAcceptedAsRawSource/],
    ['determinism tolerance', (candidate) => { candidate.validation.determinismPerModel.numericToleranceAllowed = true; }, /observer\.contract\.validation\.determinismPerModel\.numericToleranceAllowed/],
    ['network', (candidate) => { candidate.isolationContract.network = 'bridge'; }, /observer\.contract\.isolationContract\.network/],
    ['label mount', (candidate) => { candidate.isolationContract.referenceLabelsMounted = true; }, /observer\.contract\.isolationContract\.referenceLabelsMounted/],
    ['self-report trust', (candidate) => { candidate.isolationContract.containerSelfReportTrusted = true; }, /observer\.contract\.isolationContract\.containerSelfReportTrusted/],
    ['resource provenance', (candidate) => { candidate.hostObservationContract.resourceLimitsStatus = 'resolved'; }, /observer\.contract\.hostObservationContract\.resourceLimitsStatus/],
    ['host provenance', (candidate) => { candidate.hostObservationContract.fieldProvenance.ordinal = 'container-self-report'; }, /observer\.contract\.hostObservationContract\.fieldProvenance\.ordinal/],
    ['claim', (candidate) => { candidate.outcomePolicy.claims.reproduced = true; }, /observer\.contract\.outcomePolicy\.claims\.reproduced/],
    ['publication', (candidate) => { candidate.publication.enabled = true; }, /observer\.contract\.publication\.enabled/],
    ['private execution right', (candidate) => { candidate.rightsPolicy.privateExecutionAllowed = true; }, /observer\.contract\.rightsPolicy\.privateExecutionAllowed/],
    ['aggregate publication right', (candidate) => { candidate.rightsPolicy.aggregatePublicationAllowed = true; }, /observer\.contract\.rightsPolicy\.aggregatePublicationAllowed/],
    ['runtime redistribution right', (candidate) => { candidate.rightsPolicy.runtimeRedistributionAllowed = true; }, /observer\.contract\.rightsPolicy\.runtimeRedistributionAllowed/],
    ['rights evidence', (candidate) => { candidate.rightsPolicy.evidenceBindings.datasetCatalog.licenseStatus = 'MIT'; }, /observer\.contract\.rightsPolicy\.evidenceBindings\.datasetCatalog\.licenseStatus/],
    ['frontend migration', (candidate) => { candidate.frontendBoundary.migrationAllowed = true; }, /observer\.contract\.frontendBoundary\.migrationAllowed/],
    ['legacy reinterpretation', (candidate) => { candidate.legacyReceiptBoundary.reinterpreted = true; }, /observer\.contract\.legacyReceiptBoundary\.reinterpreted/],
    ['excluded regime', (candidate) => { candidate.applicability.excludedRegimes.pop(); }, /observer\.contract\.applicability\.excludedRegimes/],
  ])('reports a leaf-specific failure for %s mutation', (_label, mutate, expected) => {
    const candidate = clone(contract);
    mutate(candidate);
    const failures = validateObserverContractSemantics(candidate).join('\n');
    expect(failures).toMatch(expected);
  });

  it('runs semantic projection even when the aggregate digest also changes', async () => {
    const candidate = clone(contract);
    candidate.topology.executionOrder[0].adapterRequests.value = 1328;
    const bytes = Buffer.from(`${JSON.stringify(candidate, null, 2)}\n`);
    const result = await validateObserverContractRepository(bytes, {
      root,
      contractSchemaBytes,
      receiptSchemaBytes,
      workflowBytes,
      requireWorkflowGitIndex: false,
    });
    expect(result.failures.join('\n')).toMatch(/observer\.contract\.rawDigest/);
    expect(result.failures.join('\n')).toMatch(/observer\.contract\.topology\.executionOrder\[0\]\.adapterRequests/);
  });

  it.each([
    ['scientific field omission', (candidate) => {
      candidate.scientificProjection.includedRecordFields.pop();
    }, /scientificProjection/],
    ['provenance field omission', (candidate) => {
      candidate.provenanceProjection.topLevelFields.pop();
    }, /provenanceProjection/],
    ['environment reclassified as scientific', (candidate) => {
      candidate.scientificProjection.includedRecordFields.push('environmentSha256');
    }, /scientificProjection/],
    ['nonfinite permission', (candidate) => {
      candidate.inputContract.nonfiniteNumbersAllowed = true;
    }, /nonfiniteNumbersAllowed/],
    ['nonfinite byte bound', (candidate) => {
      candidate.inputContract.maximumExecutionProvenanceBytes.value = Number.NaN;
    }, /maximumExecutionProvenanceBytes/],
    ['scientific byte unit', (candidate) => {
      candidate.scientificProjection.maximumCanonicalBytes.unit = 'record';
    }, /maximumCanonicalBytes.*unit/],
    ['force basis', (candidate) => {
      candidate.quantityContract.forcesEvPerAngstrom.basis = '';
    }, /quantityContract.*forcesEvPerAngstrom.*basis/],
    ['dispatch claim', (candidate) => {
      candidate.claims.dispatchEligible = true;
    }, /claims/],
    ['schema extension', (candidate) => {
      candidate.unreviewed = true;
    }, /unreviewed/],
  ])('fails closed on determinism-root contract %s', (_label, mutate, expected) => {
    const candidate = clone(determinismContract);
    mutate(candidate);
    expect(validateDeterminismRootsContractSchema(candidate, determinismSchema).join('\n'))
      .toMatch(expected);
    expect(validateDeterminismRootsContractSemantics(candidate).join('\n'))
      .toMatch(expected);
  });
});

describe('full-candidate scientific and provenance projection roots', () => {
  it('accepts the exact rich environment preimage shape emitted by the frozen v2 runner', () => {
    const fixture = buildSyntheticCampaignFixture(contract).models[0];
    const environmentBinding = fixture.authoritativeProvenance.environmentBinding;
    expect(Object.keys(environmentBinding).sort())
      .toEqual([...determinismContract.inputContract.environmentBindingFields].sort());
    expect(Object.keys(environmentBinding.containerIdentity).sort())
      .toEqual([...determinismContract.inputContract.containerIdentityFields].sort());
    expect(Object.keys(environmentBinding.networkProofStart).sort())
      .toEqual([...determinismContract.inputContract.networkProofFields].sort());
    expect(Object.keys(environmentBinding.networkProofEnd).sort())
      .toEqual([...determinismContract.inputContract.networkProofFields].sort());
    environmentBinding.networkProofStart.probes.forEach((probe) => {
      expect(Object.keys(probe).sort())
        .toEqual([...determinismContract.inputContract.networkProbeFields].sort());
    });
    expect(environmentBinding).not.toHaveProperty('containerId');
    expect(fixture.authoritativeProvenance.environmentSha256).toBe(sha256(Buffer.from(
      canonicalJson(environmentBinding),
      'utf8',
    )));

    const block = frozenRunnerSource.match(
      /        environment_binding = \{([\s\S]*?)\n        \}\n        environment_sha256/,
    );
    expect(block).not.toBeNull();
    const claimsOffset = block[1].indexOf('**claims');
    expect(claimsOffset).toBeGreaterThan(0);
    const explicitKeys = [...block[1].matchAll(/"([A-Za-z0-9_]+)"\s*:/g)];
    const runnerFields = [
      ...explicitKeys.filter((match) => match.index < claimsOffset).map((match) => match[1]),
      'evidenceClass',
      'promotionEligible',
      'comparable',
      'reproduced',
      ...explicitKeys.filter((match) => match.index > claimsOffset).map((match) => match[1]),
    ];
    expect(runnerFields).toEqual(
      determinismContract.inputContract.environmentBindingFields,
    );
    expect(frozenRuntimeContractSource).toMatch(
      /def canonical_json_bytes[\s\S]*?allow_nan=False[\s\S]*?separators=\(",", ":"\)[\s\S]*?sort_keys=True/,
    );
    expect(() => canonicalProvenancePayload(
      fixture.authoritative,
      fixture.authoritativeProvenance,
    )).not.toThrow();
  });

  it('matches the frozen v2 Python environment digest for both model bindings', () => {
    const pythonSource = [
      'import json, runpy, sys',
      'runtime = runpy.run_path(sys.argv[1])',
      'value = json.load(sys.stdin)',
      'sys.stdout.write(runtime["sha256_json"](value))',
    ].join('; ');
    const fixture = buildSyntheticCampaignFixture(contract);
    for (const model of fixture.models) {
      const provenance = model.authoritativeProvenance;
      const reorderedBinding = Object.fromEntries(
        Object.entries(provenance.environmentBinding).reverse(),
      );
      const pythonDigest = execFileSync('python3', [
        '-c',
        pythonSource,
        path.join(root, 'scripts/atomistic/v2/runtime_contract.py'),
      ], {
        encoding: 'utf8',
        env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
        input: `${JSON.stringify(reorderedBinding)}\n`,
        timeout: 10_000,
      }).trim();
      expect(pythonDigest).toBe(provenance.environmentSha256);
      expect(pythonDigest).toBe(sha256(Buffer.from(
        canonicalJson(provenance.environmentBinding),
        'utf8',
      )));
    }
  });

  it('canonicalizes environment-binding key reorder without changing its semantic digest', () => {
    const fixture = buildSyntheticCampaignFixture(contract).models[0];
    const reorderedProvenance = clone(fixture.authoritativeProvenance);
    reorderedProvenance.environmentBinding = Object.fromEntries(
      Object.entries(reorderedProvenance.environmentBinding).reverse(),
    );
    expect(Object.keys(reorderedProvenance.environmentBinding))
      .not.toEqual(Object.keys(fixture.authoritativeProvenance.environmentBinding));
    expect(sha256(Buffer.from(
      canonicalJson(reorderedProvenance.environmentBinding),
      'utf8',
    ))).toBe(fixture.authoritativeProvenance.environmentSha256);
    expect(canonicalProvenancePayload(
      fixture.authoritative,
      reorderedProvenance,
    )).toEqual(canonicalProvenancePayload(
      fixture.authoritative,
      fixture.authoritativeProvenance,
    ));
  });

  it('keeps scientific bytes/root stable across fresh-container provenance and changes the provenance bytes/root', () => {
    const fixture = buildSyntheticCampaignFixture(contract).models[0];
    const authoritative = canonicalDeterminismRoots(
      fixture.authoritative,
      fixture.authoritativeProvenance,
    );
    const repeat = canonicalDeterminismRoots(
      fixture.repeat,
      fixture.repeatProvenance,
    );

    expect(authoritative.scientific.bytes).toEqual(repeat.scientific.bytes);
    expect(authoritative.scientific.root).toBe(repeat.scientific.root);
    expect(authoritative.provenance.bytes).not.toEqual(repeat.provenance.bytes);
    expect(authoritative.provenance.root).not.toBe(repeat.provenance.root);
    expect(authoritative.scientific.bytes.toString('utf8')).not.toContain(
      fixture.authoritativeProvenance.environmentSha256,
    );
    expect(authoritative.scientific.bytes.toString('utf8')).not.toContain(
      fixture.authoritativeProvenance.hostObservation.containerId,
    );
    expect(authoritative.scientific.bytes.toString('utf8')).not.toContain(
      fixture.authoritativeProvenance.hostObservation.networkNamespaceIdentity,
    );
    expect(authoritative.provenance.bytes.toString('utf8')).toContain(
      fixture.authoritativeProvenance.environmentSha256,
    );
    expect(authoritative.provenance.bytes.toString('utf8')).toContain(
      fixture.authoritativeProvenance.hostObservation.containerId,
    );
    expect(authoritative.provenance.bytes.toString('utf8')).toContain(
      fixture.authoritativeProvenance.hostObservation.networkNamespaceIdentity,
    );
    const containerOnlyRecords = clone(fixture.authoritative);
    const containerOnlyProvenance = clone(fixture.authoritativeProvenance);
    rebindExecutionProvenance(
      containerOnlyRecords,
      containerOnlyProvenance,
      (_environmentBinding, hostObservation) => {
        hostObservation.containerId = 'fixture-mattersim-container-only';
      },
    );
    const containerOnly = canonicalDeterminismRoots(
      containerOnlyRecords,
      containerOnlyProvenance,
    );
    expect(containerOnly.scientific.bytes).toEqual(authoritative.scientific.bytes);
    expect(containerOnly.scientific.root).toBe(authoritative.scientific.root);
    expect(containerOnly.provenance.root).not.toBe(authoritative.provenance.root);

    const namespaceOnlyRecords = clone(fixture.authoritative);
    const namespaceOnlyProvenance = clone(fixture.authoritativeProvenance);
    rebindExecutionProvenance(
      namespaceOnlyRecords,
      namespaceOnlyProvenance,
      (environmentBinding, hostObservation) => {
        environmentBinding.networkProofStart.network_namespace = 'net:[4026533999]';
        environmentBinding.networkProofEnd.network_namespace = 'net:[4026533999]';
        hostObservation.networkNamespaceIdentity =
          environmentBinding.networkProofStart.network_namespace;
      },
    );
    const namespaceOnly = canonicalDeterminismRoots(
      namespaceOnlyRecords,
      namespaceOnlyProvenance,
    );
    expect(namespaceOnly.scientific.bytes).toEqual(authoritative.scientific.bytes);
    expect(namespaceOnly.scientific.root).toBe(authoritative.scientific.root);
    expect(namespaceOnly.provenance.root).not.toBe(authoritative.provenance.root);

    const imageOnlyRecords = clone(fixture.authoritative);
    const imageOnlyProvenance = clone(fixture.authoritativeProvenance);
    rebindExecutionProvenance(
      imageOnlyRecords,
      imageOnlyProvenance,
      (environmentBinding, hostObservation) => {
        environmentBinding.containerIdentity.configImageId = `sha256:${'e'.repeat(64)}`;
        hostObservation.imageConfigDigest =
          environmentBinding.containerIdentity.configImageId;
      },
    );
    const imageOnly = canonicalDeterminismRoots(
      imageOnlyRecords,
      imageOnlyProvenance,
    );
    expect(imageOnly.scientific.bytes).toEqual(authoritative.scientific.bytes);
    expect(imageOnly.scientific.root).toBe(authoritative.scientific.root);
    expect(imageOnly.provenance.root).not.toBe(authoritative.provenance.root);
    expect(validateDeterminismFixture(
      fixture.authoritative,
      fixture.repeat,
      fixture.authoritativeProvenance,
      fixture.repeatProvenance,
    )).toEqual([]);
  });

  it('normalizes signed zero in every scientific numeric shape', () => {
    const fixture = buildSyntheticCampaignFixture(contract).models[0];
    const positive = clone(fixture.authoritative);
    const negative = clone(fixture.authoritative);
    positive[0].energyEv = 0;
    negative[0].energyEv = -0;
    for (let atom = 0; atom < 16; atom += 1) {
      for (let component = 0; component < 3; component += 1) {
        positive[0].forcesEvPerAngstrom[atom][component] = 0;
        negative[0].forcesEvPerAngstrom[atom][component] = -0;
      }
    }
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        positive[0].stressAseEvPerAngstrom3[row][column] = 0;
        negative[0].stressAseEvPerAngstrom3[row][column] = -0;
      }
    }
    expect(canonicalScientificPayload(negative)).toEqual(
      canonicalScientificPayload(positive),
    );
    expect(sha256(canonicalScientificPayload(negative))).toBe(
      sha256(canonicalScientificPayload(positive)),
    );
  });

  it('commits every structure identity and all 40,194 energy/force/stress scalars or fails closed', () => {
    const fixture = buildSyntheticCampaignFixture(contract).models[0];
    const scientificRecords = fixture.authoritative.map((record) => Object.fromEntries(
      determinismContract.scientificProjection.includedRecordFields.map(
        (field) => [field, record[field]],
      ),
    ));
    const projected = {
      schemaVersion: determinismContract.scientificProjection.schemaVersion,
      records: scientificRecords,
    };
    const committedFields = new Set([
      'id',
      'inputStructureDigest',
      'atomCount',
      'atomicNumbers',
      'modelId',
      'checkpointSha256',
      'packageSha256',
      'runnerSha256',
      'energyEv',
      'forcesEvPerAngstrom',
      'stressAseEvPerAngstrom3',
    ]);
    const traced = canonicalBytesWithSpans(projected, (pathParts) => (
      pathParts[0] === 'records'
        && Number.isSafeInteger(pathParts[1])
        && committedFields.has(pathParts[2])
    ));
    const canonicalBytes = Buffer.concat([traced.bytes, Buffer.from('\n')]);
    const productionBytes = canonicalScientificPayload(fixture.authoritative);
    expect(canonicalBytes).toEqual(productionBytes);
    expect(JSON.parse(productionBytes.toString('utf8')))
      .toEqual(JSON.parse(canonicalJson(projected)));
    const outputSpans = traced.spans.filter(({ pathParts }) => [
      'energyEv',
      'forcesEvPerAngstrom',
      'stressAseEvPerAngstrom3',
    ].includes(pathParts[2]));
    expect(outputSpans).toHaveLength(693 * (1 + 16 * 3 + 3 * 3));
    const structureRootSpans = traced.spans.filter(({ pathParts }) => [
      'inputStructureDigest',
      'atomicNumbers',
    ].includes(pathParts[2]));
    expect(structureRootSpans).toHaveLength(693 * (1 + 16));
    const baselineRoot = sha256(productionBytes);
    for (const span of [...structureRootSpans, ...outputSpans]) {
      let replacement;
      if (span.pathParts[2] === 'inputStructureDigest') {
        const digest = span.value;
        replacement = JSON.stringify(`${digest.slice(0, -1)}${digest.endsWith('0') ? '1' : '0'}`);
      } else if (span.pathParts[2] === 'atomicNumbers') {
        replacement = JSON.stringify(span.value === 118 ? 117 : span.value + 1);
      } else {
        replacement = JSON.stringify(nextBinary64(
          span.value,
          Number.POSITIVE_INFINITY,
        ));
      }
      expect(sha256WithReplacement(canonicalBytes, span, replacement))
        .not.toBe(baselineRoot);
    }

    const changedRoot = (mutate) => {
      const candidate = clone(fixture.authoritative);
      mutate(candidate);
      return sha256(canonicalScientificPayload(candidate));
    };
    expect(changedRoot((records) => {
      records[0].inputStructureDigest = `sha256:${'a'.repeat(64)}`;
    })).not.toBe(baselineRoot);
    expect(changedRoot((records) => {
      records[0].atomicNumbers[0] += 1;
    })).not.toBe(baselineRoot);
    for (const recordIndex of [0, 346, 692]) {
      expect(changedRoot((records) => {
        records[recordIndex].energyEv = nextBinary64(
          records[recordIndex].energyEv,
          Number.POSITIVE_INFINITY,
        );
      })).not.toBe(baselineRoot);
    }
    for (let atom = 0; atom < 16; atom += 1) {
      for (let component = 0; component < 3; component += 1) {
        expect(changedRoot((records) => {
          records[346].forcesEvPerAngstrom[atom][component] = nextBinary64(
            records[346].forcesEvPerAngstrom[atom][component],
            Number.POSITIVE_INFINITY,
          );
        })).not.toBe(baselineRoot);
      }
    }
    for (let row = 0; row < 3; row += 1) {
      for (let column = 0; column < 3; column += 1) {
        expect(changedRoot((records) => {
          records[346].stressAseEvPerAngstrom3[row][column] = nextBinary64(
            records[346].stressAseEvPerAngstrom3[row][column],
            Number.POSITIVE_INFINITY,
          );
        })).not.toBe(baselineRoot);
      }
    }
    const failClosedIdentityMutations = {
      id: 'random-TP-999999',
      atomCount: 15,
      modelId: 'mace-mpa-0-medium',
      checkpointSha256: `sha256:${'a'.repeat(64)}`,
      packageSha256: `sha256:${'a'.repeat(64)}`,
      runnerSha256: `sha256:${'a'.repeat(64)}`,
    };
    for (const record of fixture.authoritative) {
      for (const [field, mutation] of Object.entries(failClosedIdentityMutations)) {
        const original = record[field];
        record[field] = mutation;
        expect(() => validateScientificPredictionRecords(fixture.authoritative)).toThrow();
        record[field] = original;
      }
    }
    expect(validateScientificPredictionRecords(fixture.authoritative))
      .toBe(fixture.authoritative);
    const otherModelFixture = buildSyntheticCampaignFixture(contract).models[1];
    expect(canonicalDeterminismRoots(
      fixture.authoritative,
      fixture.authoritativeProvenance,
    ).scientific.root).not.toBe(canonicalDeterminismRoots(
      otherModelFixture.authoritative,
      otherModelFixture.authoritativeProvenance,
    ).scientific.root);
  }, 120_000);

  it('rejects missing, extra, duplicate, malformed, nonfinite and schema-drifted prediction input', () => {
    const records = buildSyntheticCampaignFixture(contract).models[0].authoritative;
    const mutations = [
      (candidate) => { candidate.pop(); },
      (candidate) => { candidate.push(clone(candidate.at(-1))); },
      (candidate) => { candidate[1].id = candidate[0].id; },
      (candidate) => { delete candidate[0].energyEv; },
      (candidate) => { candidate[0].unknown = false; },
      (candidate) => { candidate[0].schemaVersion = 'tf.atomistic-prediction/0.4'; },
      (candidate) => { candidate[0].energyEv = Number.NaN; },
      (candidate) => { candidate[0].forcesEvPerAngstrom[0][0] = Number.POSITIVE_INFINITY; },
      (candidate) => { candidate[0].stressAseEvPerAngstrom3[0][0] = Number.NEGATIVE_INFINITY; },
      (candidate) => { candidate[0].forcesEvPerAngstrom[0].pop(); },
      (candidate) => { delete candidate[0].forcesEvPerAngstrom[0][1]; },
      (candidate) => { candidate[0].forcesEvPerAngstrom[0].extra = 0; },
      (candidate) => { candidate[0].stressAseEvPerAngstrom3.pop(); },
      (candidate) => { delete candidate[0].stressAseEvPerAngstrom3[0][1]; },
      (candidate) => { candidate[0].stressAseEvPerAngstrom3[0].extra = 0; },
      (candidate) => { candidate[0].stressAseEvPerAngstrom3.extra = 0; },
      (candidate) => { delete candidate[0].atomicNumbers[1]; },
      (candidate) => { candidate[0].atomicNumbers.extra = 1; },
      (candidate) => { candidate.extra = false; },
      (candidate) => { candidate[0].environmentSha256 = `sha256:${'f'.repeat(64)}`; },
    ];
    for (const mutate of mutations) {
      const candidate = clone(records);
      mutate(candidate);
      expect(() => canonicalScientificPayload(candidate)).toThrow();
    }

    const bytes = predictionJsonl(records);
    expect(canonicalScientificPayload(parsePredictionJsonlForDeterminism(bytes)))
      .toEqual(canonicalScientificPayload(records));
    const firstLineEnd = bytes.indexOf(0x0a);
    const firstLine = bytes.subarray(0, firstLineEnd).toString('utf8');
    const duplicateMemberLine = firstLine.replace(
      '"energyEv":0',
      '"energyEv":0,"energyEv":0',
    );
    const duplicateMemberBytes = Buffer.concat([
      Buffer.from(duplicateMemberLine, 'utf8'),
      bytes.subarray(firstLineEnd),
    ]);
    expect(() => parsePredictionJsonlForDeterminism(duplicateMemberBytes))
      .toThrow(/duplicate/i);
    expect(() => parsePredictionJsonlForDeterminism(bytes.subarray(0, -1)))
      .toThrow(/terminal LF/);
    expect(() => parsePredictionJsonlForDeterminism(Buffer.from([0xff, 0x0a])))
      .toThrow(/UTF-8/);
    expect(() => parsePredictionJsonlForDeterminism(Buffer.alloc(8_388_609)))
      .toThrow(/1\.\.8388608 bytes/);
  });

  it('keeps excluded environment data fully validated and closed in the provenance projection', () => {
    const fixture = buildSyntheticCampaignFixture(contract).models[0];
    expect(canonicalProvenancePayload(
      fixture.authoritative,
      fixture.authoritativeProvenance,
    )).toEqual(canonicalDeterminismRoots(
      fixture.authoritative,
      fixture.authoritativeProvenance,
    ).provenance.bytes);

    const outerProvenanceMutations = [
      (candidate) => { delete candidate.environmentSha256; },
      (candidate) => { candidate.extra = 'forbidden'; },
      (candidate) => { candidate.schemaVersion = 'tf.atomistic-full-candidate-execution-provenance/0.2'; },
      (candidate) => { candidate.environmentSha256 = `sha256:${'f'.repeat(64)}`; },
    ];
    for (const mutate of outerProvenanceMutations) {
      const candidate = clone(fixture.authoritativeProvenance);
      mutate(candidate);
      expect(() => canonicalProvenancePayload(fixture.authoritative, candidate)).toThrow();
    }

    const environmentBindingMutations = [
      (binding) => { delete binding.planSha256; },
      (binding) => { binding.extra = false; },
      (binding) => { binding.planSha256 = `sha256:${'f'.repeat(64)}`; },
      (binding) => { binding.runnerSha256 = `sha256:${'f'.repeat(64)}`; },
      (binding) => { binding.adapter = 'unfrozen-adapter/v1'; },
      (binding) => {
        binding.dependencyLockSha256 =
          determinismContract.modelBindings.models[1].dependencyLockSha256;
      },
      (binding) => {
        binding.adapter = determinismContract.modelBindings.models[1].adapter;
        binding.dependencyLockSha256 =
          determinismContract.modelBindings.models[1].dependencyLockSha256;
      },
      (binding) => { binding.installedDistributionsSha256 = 'sha256:BAD'; },
      (binding) => { binding.workflowRevision = 'ABC'; },
      (binding) => { binding.batchSize = Number.NaN; },
      (binding) => { delete binding.containerIdentity.kind; },
      (binding) => { binding.containerIdentity.extra = false; },
      (binding) => { binding.containerIdentity.kind = 'oci-manifest'; },
      (binding) => { binding.containerIdentity.configImageId = 'sha256:BAD'; },
      (binding) => { binding.containerIdentity.promotionTrustRoot = true; },
      (binding) => {
        binding.containerIdentity.registryManifestDigest =
          `sha256:${'a'.repeat(64)}`;
      },
      (binding) => { delete binding.networkProofStart.egress_disabled; },
      (binding) => { binding.networkProofStart.extra = false; },
      (binding) => { binding.networkProofStart.egress_disabled = false; },
      (binding) => { binding.networkProofStart.network_namespace = 'host-net'; },
      (binding) => { binding.networkProofStart.effective_capabilities = '0x0'; },
      (binding) => {
        binding.networkProofStart.effective_capabilities =
          '0x0000000000001000';
      },
      (binding) => { binding.networkProofStart.interfaces.push('eth0'); },
      (binding) => { binding.networkProofStart.ipv4_routes.push('eth0 route'); },
      (binding) => {
        binding.networkProofStart.ipv6_routes.length = 1;
        delete binding.networkProofStart.ipv6_routes[0];
      },
      (binding) => { binding.networkProofStart.ipv4_routes.extra = false; },
      (binding) => { delete binding.networkProofStart.probes[0].family; },
      (binding) => { binding.networkProofStart.probes[0].extra = false; },
      (binding) => { binding.networkProofStart.probes[0].family = 'ipv6'; },
      (binding) => { binding.networkProofStart.probes[0].port = Number.NaN; },
      (binding) => { binding.networkProofStart.probes[0].blockedErrno = Number.NaN; },
      (binding) => { binding.networkProofStart.probes[0].blockedErrno = 2; },
      (binding) => { binding.networkProofStart.probes[0].blockedReason = ''; },
      (binding) => { binding.networkProofStart.probes[0].blockedReason = 'x'.repeat(257); },
      (binding) => { binding.networkProofStart.escape_sockets_absent = false; },
      (binding) => { binding.networkProofStart.method = 'schema-drift'; },
      (binding) => {
        binding.networkProofEnd.network_namespace = 'net:[4026533999]';
      },
    ];
    for (const mutate of environmentBindingMutations) {
      const records = clone(fixture.authoritative);
      const candidate = clone(fixture.authoritativeProvenance);
      expect(() => {
        rebindExecutionProvenance(records, candidate, mutate);
        canonicalProvenancePayload(records, candidate);
      }).toThrow();
    }

    const hostObservationMutations = [
      (candidate) => { candidate.hostObservation.imageConfigDigest = `sha256:${'f'.repeat(64)}`; },
      (candidate) => { candidate.hostObservation.containerId = ''; },
      (candidate) => { candidate.hostObservation.networkNamespaceIdentity = 'net:[42]'; },
      (candidate) => { candidate.hostObservation.extra = false; },
    ];
    for (const mutate of hostObservationMutations) {
      const candidate = clone(fixture.authoritativeProvenance);
      mutate(candidate);
      expect(() => canonicalProvenancePayload(fixture.authoritative, candidate)).toThrow();
    }

    const bytes = provenanceJson(fixture.authoritativeProvenance);
    expect(parseExecutionProvenanceForDeterminism(bytes))
      .toEqual(fixture.authoritativeProvenance);
    expect(canonicalProvenancePayload(fixture.authoritative, bytes))
      .toEqual(canonicalProvenancePayload(
        fixture.authoritative,
        fixture.authoritativeProvenance,
      ));
    const duplicateTopLevel = Buffer.from(bytes.toString('utf8').replace(
      '"environmentSha256":',
      `"environmentSha256":"sha256:${'0'.repeat(64)}","environmentSha256":`,
    ));
    expect(() => parseExecutionProvenanceForDeterminism(duplicateTopLevel))
      .toThrow(/duplicate/i);
    const duplicateNested = Buffer.from(bytes.toString('utf8').replace(
      '"runnerSha256":',
      `"runnerSha256":"sha256:${'0'.repeat(64)}","runnerSha256":`,
    ));
    expect(() => parseExecutionProvenanceForDeterminism(duplicateNested))
      .toThrow(/duplicate/i);
    expect(() => parseExecutionProvenanceForDeterminism(bytes.subarray(0, -1)))
      .toThrow(/terminal LF/);
    expect(() => parseExecutionProvenanceForDeterminism(Buffer.from([0xff, 0x0a])))
      .toThrow(/UTF-8/);
    expect(() => parseExecutionProvenanceForDeterminism(Buffer.from('{"x":NaN}\n')))
      .toThrow(/invalid/);
    expect(() => parseExecutionProvenanceForDeterminism(Buffer.alloc(16_385)))
      .toThrow(/1\.\.16384 bytes/);
  });
});

describe('unregistered observer workflow source policy', () => {
  it.each([
    ['unquoted on', (source) => source.replace('"on":', 'on:'), /observer\.workflow\.on\.quotedKey/],
    ['manual event', (source) => source.replace('  push:\n', '  workflow_dispatch: {}\n  push:\n'), /observer\.workflow\.on\.workflow_dispatch/],
    ['input-controlled guard', (source) => source.replace('${{ false }}', '${{ inputs.enable }}'), /observer\.workflow\.jobs\.fixture-contract-observer\.if/],
    ['always guard', (source) => source.replace('${{ false }}', '${{ always() }}'), /observer\.workflow\.jobs\.fixture-contract-observer\.if/],
    ['needs edge', (source) => source.replace('    if: ${{ false }}\n', '    if: ${{ false }}\n    needs: surprise\n'), /observer\.workflow\.jobs\.fixture-contract-observer\.needs/],
    ['extra step', (source) => source.replace('      - name: Emit the non-scientific fixture receipt\n', '      - name: Surprise\n        run: true\n      - name: Emit the non-scientific fixture receipt\n'), /observer\.workflow\.jobs\.fixture-contract-observer\.steps/],
    ['extra job', (source) => `${source}\n  surprise:\n    if: \${{ false }}\n    runs-on: ubuntu-24.04\n    steps: []\n`, /observer\.workflow\.jobs\.surprise/],
    ['secret expression', (source) => source.replace('shell: bash', 'env:\n          X: ${{ secrets.X }}\n        shell: bash'), /observer\.workflow\.secrets/],
    ['artifact upload', (source) => source.replace('uses: actions/checkout@', 'uses: actions/upload-artifact@'), /observer\.workflow\.artifactUpload/],
    ['container dispatch', (source) => source.replace(FIXTURE_COMMAND_IN_SOURCE, 'docker run forbidden'), /observer\.workflow\.modelDispatch/],
    ['merge key', (source) => source.replace('    if: ${{ false }}\n', '    <<: *defaults\n    if: ${{ false }}\n'), /observer\.workflow\.yaml\.merge/],
    ['anchor', (source) => source.replace('permissions: {}\n\njobs:', 'permissions: &permissions {}\n\njobs:'), /observer\.workflow\.yaml\.anchorAlias/],
    ['non-cyclic alias', (source) => source.replace('    permissions: {}', '    permissions: *permissions'), /observer\.workflow\.yaml\.anchorAlias/],
    ['punctuation anchor', (source) => source.replace('permissions: {}\n\njobs:', 'permissions: &.x {}\n\njobs:'), /observer\.workflow\.yaml\.anchorAlias/],
    ['punctuation alias', (source) => source.replace('    permissions: {}', '    permissions: *!x'), /observer\.workflow\.yaml\.anchorAlias/],
  ])('rejects %s without letting raw digest failure mask its path', (_label, mutate, expected) => {
    const failures = inspectObserverWorkflowSource(mutate(workflowSource)).join('\n');
    expect(failures).toMatch(expected);
    expect(failures).toMatch(/observer\.workflow\.rawDigest/);
  });

  it('binds a regular mode-0644 file to the exact stage-0 Git blob', async () => {
    const duplicatedKey = workflowSource.replace(
      'permissions: {}\n\njobs:',
      'permissions: {}\npermissions: {}\n\njobs:',
    );
    expect(inspectObserverWorkflowSource(duplicatedKey).join('\n'))
      .toMatch(/strict parse failed.*duplicated mapping key/i);
    const inlineMerge = workflowSource.replace(
      '    permissions: {}',
      '    permissions: { <<: { contents: read } }',
    );
    expect(inspectObserverWorkflowSource(inlineMerge).join('\n'))
      .toMatch(/observer\.workflow\.yaml\.merge/);
    const nonCyclicAlias = workflowSource
      .replace('permissions: {}\n\njobs:', 'permissions: &emptyPermissions {}\n\njobs:')
      .replace('    permissions: {}', '    permissions: *emptyPermissions');
    expect(inspectObserverWorkflowSource(nonCyclicAlias).join('\n'))
      .toMatch(/observer\.workflow\.yaml\.anchorAlias/);
    const reusableCall = workflowSource.replace(
      `uses: ${CHECKOUT_ACTION_IN_SOURCE}`,
      'uses: owner/repository/.github/workflows/reusable.yml@0123456789012345678901234567890123456789',
    );
    expect(inspectObserverWorkflowSource(reusableCall).join('\n'))
      .toMatch(/observer\.workflow\.jobs\.fixture-contract-observer\.steps\[0\]\.uses/);

    const temporary = await mkdtemp(path.join(os.tmpdir(), 'tf-observer-workflow-'));
    try {
      const canonicalTemporary = await realpath(temporary);
      const workflowPath = path.join(canonicalTemporary, ...OBSERVER_WORKFLOW_SOURCE_PATH.split('/'));
      await mkdir(path.dirname(workflowPath), { recursive: true });
      await writeFile(workflowPath, workflowBytes, { mode: 0o644 });
      execFileSync('/usr/bin/git', ['init', '-q'], { cwd: canonicalTemporary });
      execFileSync('/usr/bin/git', ['add', '--', OBSERVER_WORKFLOW_SOURCE_PATH], { cwd: canonicalTemporary });
      const accepted = await validateObserverWorkflowSourceRepository(canonicalTemporary);
      expect(accepted.failures).toEqual([]);

      await writeFile(workflowPath, Buffer.from(workflowSource.replace('${{ false }}', '${{ true }}')));
      const drifted = await validateObserverWorkflowSourceRepository(canonicalTemporary);
      expect(drifted.failures.join('\n')).toMatch(/observer\.workflow\.jobs\.fixture-contract-observer\.if/);
      expect(drifted.failures.join('\n')).toMatch(/observer\.workflow\.repository:.*Git index blob differs/);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('rejects non-0644, symlink and hard-linked workflow descriptors', async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'tf-observer-file-'));
    try {
      const canonicalTemporary = await realpath(temporary);
      const workflowPath = path.join(canonicalTemporary, ...OBSERVER_WORKFLOW_SOURCE_PATH.split('/'));
      await mkdir(path.dirname(workflowPath), { recursive: true });
      await writeFile(workflowPath, workflowBytes, { mode: 0o644 });
      await chmod(workflowPath, 0o600);
      expect((await validateObserverWorkflowSourceRepository(canonicalTemporary, {
        requireGitIndex: false,
      })).failures.join('\n')).toMatch(/mode-0644/);

      await rm(workflowPath);
      const target = path.join(canonicalTemporary, 'workflow-target.yml');
      await writeFile(target, workflowBytes, { mode: 0o644 });
      await symlink(target, workflowPath);
      expect((await validateObserverWorkflowSourceRepository(canonicalTemporary, {
        requireGitIndex: false,
      })).failures.join('\n')).toMatch(/regular single-link/);

      await rm(workflowPath);
      await link(target, workflowPath);
      expect((await validateObserverWorkflowSourceRepository(canonicalTemporary, {
        requireGitIndex: false,
      })).failures.join('\n')).toMatch(/regular single-link/);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('binds all six reviewed sources to descriptors, stage-0 blobs and one staged tree', async () => {
    const temporary = await createReviewedSourceRepository();
    try {
      expect((await validateObserverSourceSetRepository(temporary)).failures).toEqual([]);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('rejects a reviewed source path replacement after descriptor read', async () => {
    const temporary = await createReviewedSourceRepository('tf-observer-source-race-');
    try {
      let replaced = false;
      const result = await validateObserverSourceSetRepository(temporary, {
        requireGitIndex: false,
        afterReadForTest: async (relativePath, absolutePath) => {
          if (relativePath !== OBSERVER_CONTRACT_PATH || replaced) return;
          replaced = true;
          await rename(absolutePath, `${absolutePath}.prior`);
          await writeFile(absolutePath, contractBytes, { mode: 0o644 });
        },
      });
      expect(result.failures.join('\n')).toMatch(/contract-vnext\.json changed during its descriptor read/);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('rejects an index blob that differs from exact reviewed worktree bytes', async () => {
    const temporary = await createReviewedSourceRepository('tf-observer-index-');
    try {
      const contractPath = path.join(temporary, ...OBSERVER_CONTRACT_PATH.split('/'));
      const mutated = Buffer.from(contractBytes.toString('utf8').replace(
        '"status": "executable-definition-fixture-only-dispatch-disabled"',
        '"status": "forged"',
      ));
      await writeFile(contractPath, mutated);
      execFileSync('/usr/bin/git', ['add', '--', OBSERVER_CONTRACT_PATH], { cwd: temporary });
      await writeFile(contractPath, contractBytes);
      const result = await validateObserverSourceSetRepository(temporary);
      expect(result.failures.join('\n')).toMatch(/contract-vnext\.json Git index blob differs/);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('rejects a staged-tree change after the first exact index read', async () => {
    const temporary = await createReviewedSourceRepository('tf-observer-tree-race-');
    try {
      const result = await validateObserverSourceSetRepository(temporary, {
        afterFirstIndexReadForTest: async (repositoryRoot) => {
          const workflowPath = path.join(
            repositoryRoot,
            ...OBSERVER_WORKFLOW_SOURCE_PATH.split('/'),
          );
          await writeFile(workflowPath, Buffer.from(`${workflowSource}\n`));
          execFileSync('/usr/bin/git', ['add', '--', OBSERVER_WORKFLOW_SOURCE_PATH], {
            cwd: repositoryRoot,
          });
        },
      });
      expect(result.failures.join('\n')).toMatch(/staged tree entry differs/);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('rejects an index change before the final index reread', async () => {
    const temporary = await createReviewedSourceRepository('tf-observer-final-index-race-');
    try {
      const result = await validateObserverSourceSetRepository(temporary, {
        beforeFinalIndexReadForTest: async (repositoryRoot) => {
          const receiptSchemaPath = path.join(
            repositoryRoot,
            ...OBSERVER_RECEIPT_SCHEMA_PATH.split('/'),
          );
          await writeFile(receiptSchemaPath, Buffer.from(`${receiptSchemaBytes.toString('utf8')}\n`));
          execFileSync('/usr/bin/git', ['add', '--', OBSERVER_RECEIPT_SCHEMA_PATH], {
            cwd: repositoryRoot,
          });
        },
      });
      expect(result.failures.join('\n')).toMatch(/reviewed Git index entries changed/);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('rejects mode, symlink and hard-link identities for any reviewed source', async () => {
    for (const kind of ['mode', 'symlink', 'hardlink']) {
      const temporary = await createReviewedSourceRepository(`tf-observer-${kind}-`);
      try {
        const schemaPath = path.join(
          temporary,
          ...OBSERVER_CONTRACT_SCHEMA_PATH.split('/'),
        );
        if (kind === 'mode') {
          await chmod(schemaPath, 0o600);
        } else {
          const target = path.join(temporary, `schema-${kind}-target.json`);
          await writeFile(target, contractSchemaBytes, { mode: 0o644 });
          await rm(schemaPath);
          if (kind === 'symlink') await symlink(target, schemaPath);
          else await link(target, schemaPath);
        }
        const result = await validateObserverSourceSetRepository(temporary, {
          requireGitIndex: false,
        });
        expect(result.failures.join('\n')).toMatch(
          kind === 'mode' ? /mode-0644/ : /regular single-link non-symlink/,
        );
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    }
  });
});

describe('fixture-only numerical and observation behavior', () => {
  it('applies the raw full-3x3 symmetry gate at nextDown, equal and nextUp', () => {
    const below = nextBinary64(STRESS_SYMMETRY_ABSOLUTE_TOLERANCE, Number.NEGATIVE_INFINITY);
    const above = nextBinary64(STRESS_SYMMETRY_ABSOLUTE_TOLERANCE, Number.POSITIVE_INFINITY);
    const tensor = (residual) => [[0, residual, 0], [0, 0, 0], [0, 0, 0]];
    expect(stressSymmetryResidual(tensor(below))).toBe(below);
    expect(passesStressSymmetry(tensor(below))).toBe(true);
    expect(passesStressSymmetry(tensor(STRESS_SYMMETRY_ABSOLUTE_TOLERANCE))).toBe(true);
    expect(passesStressSymmetry(tensor(above))).toBe(false);
    expect(() => stressSymmetryResidual([[0]])).toThrow(/full 3x3/);
    expect(() => stressSymmetryResidual([[0, 0, 0], [0, Number.NaN, 0], [0, 0, 0]]))
      .toThrow(/finite/);
  });

  it('rejects calculator-native asymmetry before ASE Voigt canonicalization', () => {
    const native = [
      [0, 2 * STRESS_SYMMETRY_ABSOLUTE_TOLERANCE, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const aseStyleSymmetricRoundTrip = native.map((row, i) => row.map(
      (value, j) => (value + native[j][i]) / 2,
    ));
    expect(assessCalculatorNativeStressForSymmetry(native)).toMatchObject({
      sourceRepresentation: 'calculator-native-full-3x3',
      gateDecision: 'fail',
      conversionAllowed: false,
    });
    expect(passesStressSymmetry(aseStyleSymmetricRoundTrip)).toBe(true);
    expect(assessCalculatorNativeStressForSymmetry([0, 0, 0, 0, 0, 0])).toEqual({
      sourceRepresentation: 'calculator-native-voigt6',
      sourceStatus: 'raw-full-3x3-unavailable',
      gateDecision: 'abstain',
      conversionAllowed: false,
      residual: null,
      reason: 'native-voigt6-cannot-establish-pre-conversion-antisymmetry',
    });
  });

  it('computes central Richardson force/stress with the preregistered signs and bases', () => {
    const q = 0.37;
    const h = 0.01;
    const energy = (value) => value ** 5 - 0.7 * value ** 4 + 0.2 * value ** 3
      + 1.1 * value ** 2 - 0.3 * value + 0.4;
    const analyticForce = -(5 * q ** 4 - 2.8 * q ** 3 + 0.6 * q ** 2
      + 2.2 * q - 0.3);
    const derivedForce = forceRichardson({
      energyPlusH: energy(q + h),
      energyMinusH: energy(q - h),
      energyPlusHalfH: energy(q + h / 2),
      energyMinusHalfH: energy(q - h / 2),
      h,
    });
    expect(passesAbsoluteRelative(analyticForce, derivedForce, 0.02, 0.01)).toBe(true);
    expect(passesAbsoluteRelative(analyticForce, -derivedForce, 0.02, 0.01)).toBe(false);

    const volume = 7;
    const strainEnergy = (strain) => volume
      * (0.9 * strain + 0.4 * strain ** 2 - 0.2 * strain ** 3
        + 0.15 * strain ** 5);
    const strainH = 0.002;
    const derivedStress = stressRichardson({
      energyPlusH: strainEnergy(strainH),
      energyMinusH: strainEnergy(-strainH),
      energyPlusHalfH: strainEnergy(strainH / 2),
      energyMinusHalfH: strainEnergy(-strainH / 2),
      h: strainH,
      referenceVolume: volume,
    });
    expect(passesAbsoluteRelative(0.9, derivedStress, 0.005, 0.02)).toBe(true);
    expect(passesAbsoluteRelative(0.9, -derivedStress, 0.005, 0.02)).toBe(false);
  });

  it('requires exact 693/40/89x4/60x4 fixture accounting and distinct authority', () => {
    const fixture = buildSyntheticCampaignFixture(contract);
    expect(validateSyntheticCampaignFixture(fixture, contract)).toEqual([]);

    const mutations = [
      [(candidate) => { candidate.models[0].authoritative.pop(); }, /authoritative: scientific records must contain exactly/],
      [(candidate) => { candidate.models[0].authoritative[0].id = 'fake-id'; }, /authoritative: scientific records\[0\]\.id/],
      [(candidate) => { candidate.models[0].authoritative[0].referenceEnergy = 123; }, /authoritative: scientific records\[0\].*schema-drifted/],
      [(candidate) => { candidate.models[0].secret = 'forbidden'; }, /models\[0\]\.secret/],
      [(candidate) => { candidate.models[0].invarianceCases.pop(); }, /invarianceCases\.count/],
      [(candidate) => { candidate.models[0].invarianceCases[0].id = 'fake-id'; }, /invarianceCases\[0\]\.key/],
      [(candidate) => { candidate.models[0].invarianceCases[0].energyError = Number.NEGATIVE_INFINITY; }, /invarianceCases\[0\]/],
      [(candidate) => { candidate.models[0].forceFiniteDifferenceCases[0].probeRecords = 3; }, /forceFiniteDifferenceCases\[0\]/],
      [(candidate) => { candidate.models[0].forceFiniteDifferenceCases[0].selectionToken = 'fake'; }, /forceFiniteDifferenceCases\[0\]\.key/],
      [(candidate) => { candidate.models[0].forceFiniteDifferenceCases[0].normalizedError = Number.NEGATIVE_INFINITY; }, /forceFiniteDifferenceCases\[0\]/],
      [(candidate) => { candidate.models[0].stressFiniteDifferenceCases[1] = clone(candidate.models[0].stressFiniteDifferenceCases[0]); }, /stressFiniteDifferenceCases\.keys/],
      [(candidate) => { candidate.models[0].stressFiniteDifferenceCases[0].id = 'fake-id'; }, /stressFiniteDifferenceCases\[0\]\.key/],
      [(candidate) => { candidate.models[1].authoritativeOrdinal = 1; }, /authoritativeOrdinal/],
      [(candidate) => { candidate.models[1].repeatContainerId = candidate.models[1].authoritativeContainerId; }, /containerIds/],
      [(candidate) => { candidate.models[1].repeatOutput = candidate.models[1].authoritativeOutput; }, /outputDirectories/],
      [(candidate) => { candidate.models[1].authoritativeContainerId = candidate.models[0].authoritativeContainerId; }, /models\[1\]\.authoritativeContainerId/],
      [(candidate) => { candidate.models[1].authoritativeOutput = candidate.syntheticHostObservations[0].outputDirectory; }, /models\[1\]\.authoritativeOutput/],
      [(candidate) => {
        candidate.models[1].authoritativeContainerId = candidate.models[0].authoritativeContainerId;
        candidate.syntheticHostObservations[2].containerId = candidate.models[0].authoritativeContainerId;
      }, /hostObservations\[2\]\.containerId/],
      [(candidate) => {
        candidate.models[1].authoritativeOutput = candidate.models[0].authoritativeOutput;
        candidate.syntheticHostObservations[2].outputDirectory = candidate.models[0].authoritativeOutput;
      }, /hostObservations\[2\]\.outputDirectory/],
      [(candidate) => { candidate.syntheticHostObservations[0].containerId = ''; }, /hostObservations\[0\]\.containerId/],
      [(candidate) => { candidate.syntheticHostObservations[0].outputDirectory = ''; }, /hostObservations\[0\]\.outputDirectory/],
      [(candidate) => { candidate.syntheticHostObservations[0].memoryLimitBytes = 0.5; }, /hostObservations\[0\]\.memoryLimitBytes/],
      [(candidate) => { candidate.syntheticHostObservations[0].pidsLimit = 0.5; }, /hostObservations\[0\]\.pidsLimit/],
    ];
    for (const [mutate, expected] of mutations) {
      const candidate = clone(fixture);
      mutate(candidate);
      expect(validateSyntheticCampaignFixture(candidate, contract).join('\n')).toMatch(expected);
    }
  });

  it('compares all 693 canonical leaves even after a coherent repeat-root recomputation', () => {
    const fixture = buildSyntheticCampaignFixture(contract).models[0];
    expect(validateDeterminismFixture(
      fixture.authoritative,
      fixture.repeat,
      fixture.authoritativeProvenance,
      fixture.repeatProvenance,
    )).toEqual([]);
    fixture.repeat[692].energyEv = nextBinary64(
      fixture.repeat[692].energyEv,
      Number.POSITIVE_INFINITY,
    );
    const forgedRepeatRoot = sha256(canonicalScientificPayload(fixture.repeat));
    expect(forgedRepeatRoot).not.toBe(sha256(canonicalScientificPayload(fixture.authoritative)));
    expect(validateDeterminismFixture(
      fixture.authoritative,
      fixture.repeat,
      fixture.authoritativeProvenance,
      fixture.repeatProvenance,
    ).join('\n'))
      .toMatch(/canonicalScientificPayloadBytes/);
  });

  it.each([
    ['network', (observations) => { observations[0].networkMode = 'bridge'; }, /hostObservations\[0\]\.networkMode/],
    ['labels', (observations) => { observations[0].referenceLabelsMounted = true; }, /hostObservations\[0\]\.referenceLabelsMounted/],
    ['canary', (observations) => { observations[0].canaryObserved = true; }, /hostObservations\[0\]\.canaryObserved/],
    ['denial probe', (observations) => { observations[0].readDenialProbeDenied = false; }, /hostObservations\[0\]\.readDenialProbeDenied/],
    ['extra writable mount', (observations) => { observations[0].writableMountCount = 2; }, /hostObservations\[0\]\.writableMountCount/],
    ['GPU', (observations) => { observations[0].gpuDeviceRequests = ['gpu']; }, /hostObservations\[0\]\.gpuDeviceRequests/],
    ['self-report', (observations) => { observations[0].containerSelfReportTrusted = true; }, /hostObservations\[0\]\.containerSelfReportTrusted/],
    ['unknown secret', (observations) => { observations[0].secret = 'forbidden'; }, /hostObservations\[0\]\.secret/],
    ['unknown reference labels', (observations) => { observations[0].referenceLabels = [1, 2, 3]; }, /hostObservations\[0\]\.referenceLabels/],
    ['sequence mapping', (observations) => { observations[0].sequence = 1; }, /hostObservations\[0\]\.sequence/],
    ['model mapping', (observations) => { observations[0].model = 'mace'; }, /hostObservations\[0\]\.model/],
    ['model identity mapping', (observations) => { observations[0].modelId = 'mace-mpa-0-medium'; }, /hostObservations\[0\]\.modelId/],
    ['ordinal mapping', (observations) => { observations[0].ordinal = 1; }, /hostObservations\[0\]\.ordinal/],
    ['role mapping', (observations) => { observations[0].role = 'repeat-validation'; }, /hostObservations\[0\]\.role/],
    ['time inversion', (observations) => { observations[0].endedAtMonotonicNs = observations[0].startedAtMonotonicNs; }, /hostObservations\[0\]\.lifecycle/],
    ['lifecycle overlap', (observations) => { observations[1].startedAtMonotonicNs = observations[0].endedAtMonotonicNs - 1; }, /hostObservations\[1\]\.startedAtMonotonicNs/],
    ['container assignment source', (observations) => { observations[0].identityAssignmentAuthority = 'container-self-report'; }, /hostObservations\[0\]\.identityAssignmentAuthority/],
    ['unbounded memory', (observations) => { observations[0].memoryLimitBytes = Number.POSITIVE_INFINITY; }, /hostObservations\[0\]\.memoryLimitBytes/],
    ['peak above limit', (observations) => { observations[0].memoryPeakBytes = observations[0].memoryLimitBytes + 1; }, /hostObservations\[0\]\.memoryPeakBytes/],
    ['reused container', (observations) => { observations[1].containerId = observations[0].containerId; }, /hostObservations\[1\]\.containerId/],
    ['shared output', (observations) => { observations[1].outputDirectory = observations[0].outputDirectory; }, /hostObservations\[1\]\.outputDirectory/],
  ])('fails closed on synthetic host %s mutation', (_label, mutate, expected) => {
    const observations = buildSyntheticCampaignFixture(contract).syntheticHostObservations;
    mutate(observations);
    expect(validateSyntheticHostObservations(observations, contract).join('\n')).toMatch(expected);
  });

  it('emits only a schema-valid not-run abstention with all claims false', () => {
    const receipt = buildFixtureReceipt(contract, workflowBytes);
    expect(validateFixtureReceipt(receipt, receiptSchema, contract)).toEqual([]);
    expect(receipt).toMatchObject({
      evidenceClass: 'synthetic-contract-fixture-not-model-output',
      execution: 'not-run',
      scientificDecision: 'abstain',
      hostObservation: {
        status: 'not-observed-fixture-only',
        observedContainerExecutions: { value: 0 },
      },
      resourceProvenance: { status: 'not-observed-fixture-only', measurements: [] },
      rights: {
        status: 'rights-not-cleared',
        privateExecutionAllowed: false,
        aggregatePublicationAllowed: false,
        runtimeRedistributionAllowed: false,
      },
      publication: {
        enabled: false,
        allowedArtifactPaths: [],
        privateExecutionAllowed: false,
        aggregatePublicationAllowed: false,
        runtimeRedistributionAllowed: false,
      },
    });
    expect(Object.values(receipt.claims).every((value) => value === false)).toBe(true);

    const leafMutations = [
      [(candidate) => { candidate.contract.rawDigest = `sha256:${'0'.repeat(64)}`; }, /observer\.receipt\.contract\.rawDigest/],
      [(candidate) => { candidate.workflowObservation.sourceDigest = `sha256:${'1'.repeat(64)}`; }, /observer\.receipt\.workflowObservation\.sourceDigest/],
      [(candidate) => { candidate.plannedAccounting.adapterRequestsTotal.value = 4043; }, /observer\.receipt\.plannedAccounting\.adapterRequestsTotal\.value/],
      [(candidate) => { candidate.contractChecks.stressSymmetryBoundary.nextDown.value = 0; }, /observer\.receipt\.contractChecks\.stressSymmetryBoundary\.nextDown\.value/],
      [(candidate) => { candidate.contractChecks.forceFiniteDifferenceOracle.richardson = 0; }, /observer\.receipt\.contractChecks\.forceFiniteDifferenceOracle\.richardson/],
      [(candidate) => { candidate.hostObservation.requiredIdentityFields[0] = 'forged'; }, /observer\.receipt\.hostObservation\.requiredIdentityFields\[0\]/],
      [(candidate) => { candidate.resourceProvenance.limitsStatus = 'resolved'; }, /observer\.receipt\.resourceProvenance\.limitsStatus/],
      [(candidate) => { candidate.rights.privateExecutionAllowed = true; }, /observer\.receipt\.rights\.privateExecutionAllowed/],
      [(candidate) => { candidate.rights.aggregatePublicationAllowed = true; }, /observer\.receipt\.rights\.aggregatePublicationAllowed/],
      [(candidate) => { candidate.rights.runtimeRedistributionAllowed = true; }, /observer\.receipt\.rights\.runtimeRedistributionAllowed/],
    ];
    for (const [mutate, expected] of leafMutations) {
      const candidate = clone(receipt);
      mutate(candidate);
      expect(validateFixtureReceipt(candidate, receiptSchema, contract).join('\n'))
        .toMatch(expected);
    }
  });

  it.each([
    ['execution promotion', (receipt) => { receipt.execution = 'complete'; }, /observer\.receipt\.(?:schema|execution)/],
    ['scientific pass', (receipt) => { receipt.scientificDecision = 'pass'; }, /observer\.receipt\.(?:schema|scientificDecision)/],
    ['claim', (receipt) => { receipt.claims.reproduced = true; }, /observer\.receipt\.(?:schema|claims)/],
    ['host run', (receipt) => { receipt.hostObservation.observedContainerExecutions.value = 4; }, /observer\.receipt\.(?:schema|hostObservation)/],
    ['stress boundary', (receipt) => { receipt.contractChecks.stressSymmetryBoundary.nextUp.accepted = true; }, /observer\.receipt\.(?:schema|contractChecks)/],
    ['publication', (receipt) => { receipt.publication.enabled = true; }, /observer\.receipt\.(?:schema|publication)/],
    ['private execution right', (receipt) => { receipt.rights.privateExecutionAllowed = true; }, /observer\.receipt\.(?:schema|rights)/],
    ['aggregate publication right', (receipt) => { receipt.rights.aggregatePublicationAllowed = true; }, /observer\.receipt\.(?:schema|rights)/],
    ['runtime redistribution right', (receipt) => { receipt.rights.runtimeRedistributionAllowed = true; }, /observer\.receipt\.(?:schema|rights)/],
    ['excluded regimes', (receipt) => { receipt.applicability.excludedRegimes = []; }, /observer\.receipt\.(?:schema|applicability)/],
    ['extra field', (receipt) => { receipt.unreviewed = false; }, /observer\.receipt\.schema/],
    ['nonfinite number', (receipt) => {
      receipt.contractChecks.stressSymmetryBoundary.nextDown.value = Number.NaN;
    }, /observer\.receipt\.(?:schema|contractChecks)/],
  ])('rejects fixture receipt %s mutation', (_label, mutate, expected) => {
    const receipt = buildFixtureReceipt(contract, workflowBytes);
    mutate(receipt);
    expect(validateFixtureReceipt(receipt, receiptSchema, contract).join('\n')).toMatch(expected);
  });
});
