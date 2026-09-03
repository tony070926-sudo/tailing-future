import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdtemp, readFile, realpath, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { inspectRandomTp } from './dataset-manifest.mjs';
import {
  FULL_CANDIDATE_PRODUCER_WORKFLOW,
  FULL_CANDIDATE_REPOSITORY,
  FULL_CANDIDATE_REPOSITORY_ID,
  selectFirstProducerDispatch,
  terminalPartitionEvidenceFromGitHub,
  validateFirstProducerAttempt,
  validateFirstProducerJob,
} from './full-candidate-github-evidence-policy.mjs';
import { evaluateFullCandidateMetrics } from './full-candidate-metrics.mjs';
import { canonicalJsonBytes } from './write-container-observation.mjs';
import {
  FULL_CANDIDATE_RECEIPT_SCHEMA_DIGEST,
  FULL_CANDIDATE_VERIFIER_IMPLEMENTATION_DIGEST,
  MAX_FULL_PREDICTION_BYTES,
  computeCandidateEvidenceBundleDigest,
  inspectFrozenCandidateInputs,
  parseFullPredictionJsonl,
  validateFullCandidateReceipt,
  validateFullCandidateReceiptEnvelope,
  verifyFullCandidate,
} from './verify-full-candidate.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const candidatePlanBytes = await readFile(path.join(root, 'evaluation/atomistic/full-candidate-plan.json'));
const scientificPlanBytes = await readFile(path.join(root, 'evaluation/atomistic/reproduction-plan.json'));
const runtimeLockBytes = await readFile(path.join(root, 'evaluation/atomistic/runtime-lock.json'));
const receiptSchemaBytes = await readFile(path.join(root, 'schemas/atomistic-full-candidate-receipt.schema.json'));
const frozenIds = (await readFile(path.join(root, 'evaluation/atomistic/random-tp-id-manifest.txt'), 'utf8')).trimEnd().split('\n');
const cachedDatasetPath = path.join(root, '.atomistic-cache/atomistic/random-TP.xyz');
const SOURCE_REVISION = 'a'.repeat(40);
const SOURCE = Object.freeze({
  repository: 'tony070926-sudo/tailing-future',
  repositoryId: 1349498456,
  revision: SOURCE_REVISION,
  treeDigestProtocol: 'tf.git-source-tree/v1',
  treeDigest: digest('source-tree'),
});
const CREATED_AT = '2026-08-30T12:00:00Z';
const STRUCTURE_BUNDLE_DIGEST = 'sha256:d4ff1ee210abf80884e1526b1e2600e918103f3505a2a712bce57d6fba3a1b5c';
const STRUCTURE_MANIFEST_FILE_DIGEST = 'sha256:9f870f62cd60b7021d874d1970c81ac8cb64a302e2c5fd4013464198fd11a25e';
const FAKE_MANIFEST_BYTES = Buffer.alloc(1_147);
const VERIFIER_DERIVED_STRUCTURE_COMMITMENT = Object.freeze({
  status: 'verified',
  authority: 'independent-label-bearing-verifier',
  derivationProtocol: 'deterministic-label-stripping-from-frozen-raw-dataset/v1',
  rawDatasetDigest: 'sha256:c14473dcf4bd71e1ed11556ac9ff12b68e7a423d813f939bc9eedaef663054d9',
  structureManifestDigest: 'sha256:b0a94b5424f9d4a2be7519265b8dbe89a478fa5b21a6c956c70ffe0c705078f7',
  regeneratedStructureBundleDigest: STRUCTURE_BUNDLE_DIGEST,
  regeneratedStructureBundleBytes: 681_414,
  producerStructureBundleAttributed: false,
});
const MODEL = Object.freeze({
  mattersim: Object.freeze({
    modelId: 'mattersim-v1.0.0-5m',
    checkpoint: 'sha256:e3df9fa708725e3d453140646c7d1838324b347a3d1214cf1440522146f872b5',
    package: 'sha256:1b5e46ba56efa5c1e93372ad32321300fa5e1f07dd9188a11b727bd578cf8d7f',
  }),
  mace: Object.freeze({
    modelId: 'mace-mpa-0-medium',
    checkpoint: 'sha256:75428afe3a1d7d8062e19bcaabd5c433623cabf308242ec9fb493e38604fb638',
    package: 'sha256:b80407edf6b2a1ec8523668c2a36852d20927ce1c3c56b70983a9f2dc53233ad',
  }),
});
const TEST_PRODUCER_WORKFLOW = Object.freeze({
  ...FULL_CANDIDATE_PRODUCER_WORKFLOW,
  configured: true,
  id: 900_001,
});

function digest(value) {
  return 'sha256:' + createHash('sha256').update(value).digest('hex');
}

function references() {
  return frozenIds.map((id) => ({
    id,
    atomCount: 16,
    atomicNumbers: Array(16).fill(14),
    inputStructureDigest: digest('structure:' + id),
    energy: 0,
    forces: Array(48).fill(0),
    stress: Array(9).fill(0),
  }));
}

function predictions(model, refs, options = {}) {
  const spec = MODEL[model];
  const pass = options.pass !== false;
  const forceComponent = 0.824 / Math.sqrt(3);
  return refs.map((reference) => ({
    schemaVersion: 'tf.atomistic-prediction/0.3',
    id: reference.id,
    inputStructureDigest: reference.inputStructureDigest,
    atomCount: reference.atomCount,
    atomicNumbers: [...reference.atomicNumbers],
    modelId: spec.modelId,
    checkpointSha256: spec.checkpoint,
    packageSha256: spec.package,
    runnerSha256: 'sha256:d6e83640f15926088c116312c27605570f9e9c8ba4e9a9988ef5bf4d3a974ed4',
    environmentSha256: digest(model + ':environment'),
    status: 'success',
    energyEv: reference.energy + (pass ? 0.199 : 0.1) * reference.atomCount,
    forcesEvPerAngstrom: Array.from(
      { length: reference.atomCount },
      (_, atomIndex) => Array.from(
        { length: 3 },
        (_, componentIndex) => reference.forces[atomIndex * 3 + componentIndex] + forceComponent,
      ),
    ),
    stressAseEvPerAngstrom3: Array.from(
      { length: 3 },
      (_, rowIndex) => Array.from(
        { length: 3 },
        (_, columnIndex) => reference.stress[rowIndex * 3 + columnIndex]
          + (rowIndex === 0 && columnIndex === 0 ? 1.999 / 160.21766208 : 0),
      ),
    ),
  }));
}

function jsonl(records) {
  return Buffer.concat(records.map((record) => canonicalJsonBytes(record)));
}

function producer(jobId, runId = 101, runAttempt = 1) {
  return {
    repositoryId: 1349498456,
    revision: SOURCE_REVISION,
    workflowRunId: runId,
    runAttempt,
    jobId,
    hardwareId: 'github-hosted-' + jobId,
  };
}

function verifiedTerminalJob(conclusion, model, jobId) {
  const repository = {
    full_name: FULL_CANDIDATE_REPOSITORY,
    id: FULL_CANDIDATE_REPOSITORY_ID,
  };
  const run = {
    created_at: '2026-08-30T11:00:00Z',
    event: 'workflow_dispatch',
    head_branch: 'main',
    head_repository: repository,
    head_sha: SOURCE_REVISION,
    id: 101,
    name: TEST_PRODUCER_WORKFLOW.name,
    path: TEST_PRODUCER_WORKFLOW.path,
    repository,
    run_number: 1,
    workflow_id: TEST_PRODUCER_WORKFLOW.id,
  };
  const selected = selectFirstProducerDispatch({
    total_count: 1,
    workflow_runs: [run],
  }, TEST_PRODUCER_WORKFLOW, SOURCE_REVISION).selected;
  const attempt = validateFirstProducerAttempt(selected, {
    ...run,
    conclusion,
    run_attempt: 1,
    run_started_at: '2026-08-30T11:00:01Z',
    status: 'completed',
    updated_at: '2026-08-30T11:02:00Z',
  });
  return validateFirstProducerJob(attempt, {
    conclusion,
    head_sha: SOURCE_REVISION,
    id: jobId,
    name: model,
    run_attempt: 1,
    run_id: run.id,
    status: 'completed',
    workflow_name: run.name,
  }, model);
}

function producerScientificPayloadFiles(predictionBytes, manifestBytes = FAKE_MANIFEST_BYTES) {
  return new Map([
    ['manifests/structures.manifest.json', manifestBytes],
    ['predictions/predictions.jsonl', predictionBytes],
  ]);
}

function evidence(model, records, jobId, overrides = {}) {
  return {
    model,
    modelId: MODEL[model].modelId,
    status: 'complete',
    producer: producer(jobId),
    producerScientificPayloadFiles: producerScientificPayloadFiles(jsonl(records)),
    ...overrides,
  };
}

function incompleteBase() {
  return verifyFullCandidate({
    candidatePlanBytes,
    scientificPlanBytes,
    runtimeLockBytes,
    datasetBytes: Buffer.from('invalid-random-tp'),
    partitionEvidence: [
      { model: 'mattersim', modelId: MODEL.mattersim.modelId, status: 'not-started' },
      { model: 'mace', modelId: MODEL.mace.modelId, status: 'not-started' },
    ],
    source: SOURCE,
    createdAt: CREATED_AT,
  });
}

function completeRecords() {
  return {
    expected: 693,
    attempted: 693,
    succeeded: 693,
    missing: 0,
    extra: 0,
    duplicate: 0,
    failed: 0,
    nonfinite: 0,
    malformedRows: 0,
  };
}

function completeProducerScientificPayload(model, records) {
  const bytes = jsonl(records);
  const predictionFileDigest = digest(bytes);
  const files = [
    { path: 'manifests/structures.manifest.json', sizeBytes: 1_147, sha256: STRUCTURE_MANIFEST_FILE_DIGEST },
    { path: 'predictions/predictions.jsonl', sizeBytes: bytes.length, sha256: predictionFileDigest },
  ].map((entry) => ({
    ...entry,
    pathByteLength: Buffer.byteLength(entry.path, 'utf8'),
    pathSha256: digest(Buffer.from(entry.path, 'utf8')),
  })).sort((left, right) => left.pathSha256 < right.pathSha256 ? -1 : left.pathSha256 > right.pathSha256 ? 1 : 0);
  return {
    predictionSchemaVersion: 'tf.atomistic-prediction/0.3',
    predictionFileDigest,
    predictionBytes: bytes.length,
    predictionRecords: 693,
    environmentDigest: digest(model + ':environment'),
    producerStructureManifestFileDigest: STRUCTURE_MANIFEST_FILE_DIGEST,
    producerScientificPayloadEvidenceDigest: digest(canonicalJsonBytes({
      domain: 'tf.atomistic-full-candidate.producer-scientific-payload/v2',
      observedFileCount: 2,
      retainedFileCount: 2,
      truncated: false,
      overflowDigest: null,
      files,
    })),
    producerPayloadReferenceLabelsPresent: false,
    producerRawDatasetPresent: false,
    producerStructureBundlePresent: false,
    atomicNumbersPresent: true,
    atomicNumbersPublicationLicenseCleared: false,
    publicationEligible: false,
  };
}

function completeReceipt(options = {}) {
  const matterPass = options.matterPass !== false;
  const refs = references();
  const matterRecords = predictions('mattersim', refs, { pass: matterPass });
  const maceRecords = predictions('mace', refs);
  const matterResult = evaluateFullCandidateMetrics(MODEL.mattersim.modelId, matterRecords, refs);
  const maceResult = evaluateFullCandidateMetrics(MODEL.mace.modelId, maceRecords, refs);
  const receipt = incompleteBase();
  receipt.outcome = matterResult.assessment.status === 'passed' ? 'complete-pass' : 'complete-fail';
  receipt.partitions = [
    {
      partitionId: 'mattersim-full-000',
      model: 'mattersim',
      modelId: MODEL.mattersim.modelId,
      partitionIndex: 0,
      partitionCount: 1,
      status: 'complete',
      records: completeRecords(),
      producer: producer(11),
      producerScientificPayload: completeProducerScientificPayload('mattersim', matterRecords),
    },
    {
      partitionId: 'mace-full-000',
      model: 'mace',
      modelId: MODEL.mace.modelId,
      partitionIndex: 0,
      partitionCount: 1,
      status: 'complete',
      records: completeRecords(),
      producer: producer(12),
      producerScientificPayload: completeProducerScientificPayload('mace', maceRecords),
    },
  ];
  receipt.verification = {
    status: 'verified-complete',
    verifierClass: 'independent-label-bearing-verifier',
    implementationDigest: FULL_CANDIDATE_VERIFIER_IMPLEMENTATION_DIGEST,
    candidatePlanBindingVerified: true,
    frozenBindingsVerified: true,
    producerScientificPayloadReferenceLabelsAbsent: true,
    producerScientificPayloadStructureBundleAbsent: true,
    verifierReferenceLabelsLoaded: true,
    metricRecomputationIndependent: true,
    metricEvaluationComplete: true,
    mixedRunAttemptsObserved: false,
    integrityErrors: [],
  };
  receipt.verifierDerivedStructureCommitment = structuredClone(
    VERIFIER_DERIVED_STRUCTURE_COMMITMENT,
  );
  receipt.metrics = { models: [matterResult.metrics, maceResult.metrics] };
  receipt.assessments = { mattersim: matterResult.assessment, mace: maceResult.assessment };
  delete receipt.partialMetrics;
  receipt.evidenceBundleDigest = computeCandidateEvidenceBundleDigest(receipt);
  return receipt;
}

function invalidVerificationOptions(overrides = {}) {
  const refs = references();
  return {
    candidatePlanBytes,
    scientificPlanBytes,
    runtimeLockBytes,
    datasetBytes: Buffer.from('invalid-random-tp'),
    partitionEvidence: [
      evidence('mattersim', predictions('mattersim', refs), 11),
      evidence('mace', predictions('mace', refs), 12),
    ],
    source: SOURCE,
    createdAt: CREATED_AT,
    ...overrides,
  };
}

describe('R7b1 v0.2 full-candidate prediction parser', () => {
  const refs = references();
  const spec = {
    model: 'mattersim',
    modelId: MODEL.mattersim.modelId,
    checkpointDigest: MODEL.mattersim.checkpoint,
    packageDigest: MODEL.mattersim.package,
  };

  it('requires canonical JSON, exact fields and one valid environment digest on every line', () => {
    const base = predictions('mattersim', refs);
    const invalidEnvironment = structuredClone(base);
    invalidEnvironment[0].environmentSha256 = 'NOT-A-DIGEST';
    expect(parseFullPredictionJsonl(jsonl(invalidEnvironment), spec).errors.join('\n')).toMatch(
      /environment digest is invalid|every record/,
    );

    const nonCanonical = Buffer.from(JSON.stringify(base[0]) + '\n', 'utf8');
    expect(parseFullPredictionJsonl(nonCanonical, spec).errors.join('\n')).toMatch(/not canonical JSON/);

    const unknown = structuredClone(base);
    unknown[0].debugValue = 1;
    const unknownParsed = parseFullPredictionJsonl(jsonl(unknown), spec);
    expect(unknownParsed.errors.join('\n')).toMatch(/extra or missing fields/);
    expect(unknownParsed.referenceLabelsPresent).toBeNull();

    const leaked = structuredClone(base);
    leaked[0].referenceEnergyEv = 0;
    expect(parseFullPredictionJsonl(jsonl(leaked), spec).referenceLabelsPresent).toBe(true);

    const malformed = parseFullPredictionJsonl(Buffer.from('[]\n', 'utf8'), spec);
    expect(malformed.malformedRows).toBe(1);
    expect(malformed.records).toEqual([]);
  });

  it('rejects duplicate members and wrong immutable model roots', () => {
    const base = predictions('mattersim', refs);
    const duplicate = Buffer.from(jsonl([base[0]]).toString().replace('{', '{"id":"random-TP-999999",'));
    expect(parseFullPredictionJsonl(duplicate, spec).errors.join('\n')).toMatch(/duplicate JSON key/);
    const wrongRunner = structuredClone(base);
    wrongRunner[0].runnerSha256 = digest('wrong-runner');
    expect(parseFullPredictionJsonl(jsonl(wrongRunner), spec).errors.join('\n')).toMatch(/runner digest differs/);
  });
});

describe('R7b1 v0.2 frozen verifier and failure receipts', () => {
  it('does not export the unsafe low-level receipt assembler', async () => {
    const verifierModule = await import('./verify-full-candidate.mjs');
    expect(verifierModule).not.toHaveProperty('assembleFullCandidateReceipt');
  });

  it('maps missing or unknown producer states to schema-valid incomplete evidence', () => {
    const options = invalidVerificationOptions();
    delete options.partitionEvidence[0].status;
    options.partitionEvidence[1].status = 'banana';
    const receipt = verifyFullCandidate(options);
    expect(receipt.outcome).toBe('incomplete');
    expect(receipt.partitions.map((partition) => partition.status)).toEqual(['failed', 'failed']);
    expect(receipt.verification.integrityErrors.join('\n')).toMatch(/status is missing or unsupported/);
    expect(validateFullCandidateReceipt(receipt, receiptSchemaBytes, options).ok).toBe(true);
  });

  it('rejects attempt two at core campaign admission even when both models agree', () => {
    const options = invalidVerificationOptions();
    for (const partition of options.partitionEvidence) partition.producer.runAttempt = 2;
    const receipt = verifyFullCandidate(options);

    expect(receipt.outcome).toBe('incomplete');
    expect(receipt.verification.integrityErrors.join('\n')).toMatch(
      /producer identity is malformed/,
    );
    expect(receipt.partitions.every((partition) => partition.producer === undefined)).toBe(true);
    expect(validateFullCandidateReceipt(receipt, receiptSchemaBytes, options)).toEqual({
      errors: [],
      ok: true,
    });
  });

  it.each([
    ['failure', 'failed', 'github-job-failure-before-restricted-handoff'],
    ['cancelled', 'cancelled', 'github-job-cancelled-before-restricted-handoff'],
    ['timed_out', 'failed', 'github-job-timed-out-before-restricted-handoff'],
    ['not-started', 'not-started', 'github-job-not-started'],
  ])('exactly recomputes GitHub %s terminal evidence as incomplete', (origin, expectedStatus, expectedCode) => {
    const observation = origin === 'not-started'
      ? null
      : verifiedTerminalJob(origin, 'mattersim', 11);
    const options = invalidVerificationOptions({
      partitionEvidence: [
        terminalPartitionEvidenceFromGitHub({ conclusion: origin, model: 'mattersim', observation }),
        terminalPartitionEvidenceFromGitHub({ conclusion: 'not-started', model: 'mace', observation: null }),
      ],
    });
    const receipt = verifyFullCandidate(options);

    expect(receipt.outcome).toBe('incomplete');
    expect(receipt.partitions.map(({ status }) => status)).toEqual([expectedStatus, 'not-started']);
    expect(receipt.partitions[0].termination.code).toBe(expectedCode);
    expect(receipt.partitions[0].rejectedProducerScientificPayload.observedFileCount).toBe(0);
    expect(receipt).not.toHaveProperty('metrics');
    expect(receipt).not.toHaveProperty('assessments');
    expect(receipt).not.toHaveProperty('evidenceBundleDigest');
    expect(validateFullCandidateReceipt(receipt, receiptSchemaBytes, options)).toEqual({
      errors: [],
      ok: true,
    });
  });

  it('retains failed and cancelled producer provenance plus rejected payload observations', () => {
    const options = invalidVerificationOptions();
    options.partitionEvidence[0].status = 'failed';
    options.partitionEvidence[0].termination = { code: 'gpu-failure', message: 'Producer stopped after partial output.' };
    options.partitionEvidence[1].status = 'cancelled';
    const receipt = verifyFullCandidate(options);
    expect(receipt.partitions[0]).toMatchObject({
      status: 'failed',
      records: { attempted: 0, extra: 693, malformedRows: 0 },
      producer: { jobId: 11 },
      rejectedProducerScientificPayload: { observedFileCount: 2, predictionRecordsObserved: 693 },
    });
    expect(receipt.partitions[1]).toMatchObject({
      status: 'cancelled',
      producer: { jobId: 12 },
      rejectedProducerScientificPayload: { observedFileCount: 2 },
    });
    expect(validateFullCandidateReceipt(receipt, receiptSchemaBytes, options).ok).toBe(true);
  });

  it('publishes schema-valid incomplete receipts for empty and oversized prediction payloads', () => {
    const refs = references();
    const options = invalidVerificationOptions({
      partitionEvidence: [
        evidence('mattersim', predictions('mattersim', refs), 11, {
          producerScientificPayloadFiles: producerScientificPayloadFiles(Buffer.alloc(0)),
        }),
        evidence('mace', predictions('mace', refs), 12, {
          producerScientificPayloadFiles: producerScientificPayloadFiles(Buffer.alloc(MAX_FULL_PREDICTION_BYTES + 1)),
        }),
      ],
    });
    const receipt = verifyFullCandidate(options);
    expect(receipt.outcome).toBe('incomplete');
    expect(receipt.partitions.map((partition) => partition.status)).toEqual(['invalid', 'invalid']);
    expect(receipt.partitions[0].rejectedProducerScientificPayload.predictionBytesObserved).toBe(0);
    expect(receipt.partitions[1].rejectedProducerScientificPayload.predictionBytesObserved).toBe(MAX_FULL_PREDICTION_BYTES + 1);
    expect(validateFullCandidateReceipt(receipt, receiptSchemaBytes, options)).toEqual({ ok: true, errors: [] });
  });

  it('normalizes rejected paths and observed schema versions into schema-valid failure evidence', () => {
    const refs = references();
    const longSchemaRecords = predictions('mace', refs).map((record) => ({
      ...record,
      schemaVersion: 'x'.repeat(129),
    }));
    const options = invalidVerificationOptions();
    options.partitionEvidence[0] = {
      ...options.partitionEvidence[0],
      status: 'failed',
      producerScientificPayloadFiles: new Map([['', Buffer.from('observed-invalid-path')]]),
    };
    options.partitionEvidence[1] = {
      ...options.partitionEvidence[1],
      producerScientificPayloadFiles: producerScientificPayloadFiles(jsonl(longSchemaRecords)),
    };
    const receipt = verifyFullCandidate(options);
    expect(receipt.partitions[0].rejectedProducerScientificPayload.observedFileNames).toEqual([
      '<empty-or-non-string-path>',
    ]);
    expect(receipt.partitions[1].producerScientificPayload.predictionSchemaVersion).toBe('unavailable');
    expect(validateFullCandidateReceiptEnvelope(receipt, receiptSchemaBytes)).toEqual({
      ok: true,
      errors: [],
    });
    expect(validateFullCandidateReceipt(receipt, receiptSchemaBytes, options).errors.join('\n')).toMatch(
      /requires frozen raw inputs and observed producer scientific payload bytes/,
    );
  });

  it('rejects structure-bundle, raw-dataset and label-like producer payload paths', () => {
    const options = invalidVerificationOptions();
    options.partitionEvidence[0].producerScientificPayloadFiles.set(
      'structures/structures.jsonl',
      Buffer.from('locally-regenerated-structure-bytes'),
    );
    options.partitionEvidence[1].producerScientificPayloadFiles.set(
      'labels/reference.jsonl',
      Buffer.from('forbidden-label-like-bytes'),
    );
    options.partitionEvidence[1].producerScientificPayloadFiles.set(
      'raw-dataset/random-TP.xyz',
      Buffer.from('forbidden-raw-dataset-bytes'),
    );
    const receipt = verifyFullCandidate(options);
    expect(receipt.outcome).toBe('incomplete');
    expect(receipt.partitions.map((partition) => partition.status)).toEqual(['invalid', 'invalid']);
    expect(receipt.partitions[0].rejectedProducerScientificPayload).toMatchObject({
      producerStructureBundlePresent: true,
    });
    expect(receipt.partitions[1].rejectedProducerScientificPayload).toMatchObject({
      producerPayloadReferenceLabelsPresent: true,
      producerRawDatasetPresent: true,
    });
    expect(receipt.verification.integrityErrors.join('\n')).toMatch(
      /paths expose forbidden labels, raw data or a structure bundle/,
    );
    expect(validateFullCandidateReceipt(receipt, receiptSchemaBytes, options)).toEqual({
      ok: true,
      errors: [],
    });
  });

  it('classifies full long paths while disclosing only truncated names and binds their suffixes', () => {
    const prefix = 'x'.repeat(256);
    const sensitive = invalidVerificationOptions();
    sensitive.partitionEvidence[0].status = 'failed';
    sensitive.partitionEvidence[0].producerScientificPayloadFiles = new Map([
      [`${prefix}/structures/structures.jsonl`, Buffer.from('same-bytes')],
    ]);
    sensitive.partitionEvidence[1].status = 'cancelled';
    sensitive.partitionEvidence[1].producerScientificPayloadFiles = new Map([
      [`${prefix}/raw-dataset/random-TP.xyz`, Buffer.from('same-bytes')],
    ]);
    const benign = invalidVerificationOptions();
    benign.partitionEvidence[0].status = 'failed';
    benign.partitionEvidence[0].producerScientificPayloadFiles = new Map([
      [`${prefix}/ordinary-a.json`, Buffer.from('same-bytes')],
    ]);
    benign.partitionEvidence[1].status = 'cancelled';
    benign.partitionEvidence[1].producerScientificPayloadFiles = new Map([
      [`${prefix}/ordinary-b.json`, Buffer.from('same-bytes')],
    ]);

    const sensitiveReceipt = verifyFullCandidate(sensitive);
    const benignReceipt = verifyFullCandidate(benign);
    expect(sensitiveReceipt.partitions[0].rejectedProducerScientificPayload).toMatchObject({
      observedFileNames: [prefix],
      producerStructureBundlePresent: true,
    });
    expect(sensitiveReceipt.partitions[1].rejectedProducerScientificPayload).toMatchObject({
      observedFileNames: [prefix],
      producerRawDatasetPresent: true,
    });
    expect(sensitiveReceipt.partitions[0].rejectedProducerScientificPayload.producerScientificPayloadEvidenceDigest)
      .not.toBe(benignReceipt.partitions[0].rejectedProducerScientificPayload.producerScientificPayloadEvidenceDigest);
    expect(sensitiveReceipt.partitions[1].rejectedProducerScientificPayload.producerScientificPayloadEvidenceDigest)
      .not.toBe(benignReceipt.partitions[1].rejectedProducerScientificPayload.producerScientificPayloadEvidenceDigest);
    expect(validateFullCandidateReceipt(sensitiveReceipt, receiptSchemaBytes, sensitive)).toEqual({
      ok: true,
      errors: [],
    });
  });

  it('rejects ill-formed UTF-16 paths and keeps their full identities collision-resistant', () => {
    const prefix = 'x'.repeat(256);
    const malformed = (suffix) => {
      const options = invalidVerificationOptions();
      options.partitionEvidence[0].status = 'failed';
      options.partitionEvidence[0].producerScientificPayloadFiles = new Map([
        [`${prefix}${suffix}`, Buffer.from('same-bytes')],
      ]);
      return options;
    };
    const first = malformed('\uD800');
    const second = malformed('\uD801');
    const replacementCharacter = malformed('\uFFFD');
    const firstReceipt = verifyFullCandidate(first);
    const secondReceipt = verifyFullCandidate(second);
    const replacementReceipt = verifyFullCandidate(replacementCharacter);

    for (const receipt of [firstReceipt, secondReceipt]) {
      expect(receipt.partitions[0].rejectedProducerScientificPayload.observedFileNames).toEqual([
        '<invalid-utf16-path>',
      ]);
      expect(receipt.verification.integrityErrors.join('\n')).toMatch(/non-canonical UTF-8 path/);
      expect(validateFullCandidateReceiptEnvelope(receipt, receiptSchemaBytes)).toEqual({
        ok: true,
        errors: [],
      });
    }
    const digests = [firstReceipt, secondReceipt, replacementReceipt].map(
      (receipt) => receipt.partitions[0].rejectedProducerScientificPayload
        .producerScientificPayloadEvidenceDigest,
    );
    expect(new Set(digests).size).toBe(3);
    expect(validateFullCandidateReceipt(firstReceipt, receiptSchemaBytes, first).errors.join('\n')).toMatch(
      /requires frozen raw inputs and observed producer scientific payload bytes/,
    );
    expect(validateFullCandidateReceipt(replacementReceipt, receiptSchemaBytes, replacementCharacter)).toEqual({
      ok: true,
      errors: [],
    });
  });

  it('bounds authoritative payload maps while committing overflow members', () => {
    const overflowMap = (lastPath) => new Map([
      ...Array.from({ length: 32 }, (_, index) => [
        `extra/member-${String(index).padStart(2, '0')}.bin`,
        Buffer.from(`member-${index}`),
      ]),
      [lastPath, Buffer.from('overflow-member')],
    ]);
    const first = invalidVerificationOptions();
    first.partitionEvidence[0].status = 'failed';
    first.partitionEvidence[0].producerScientificPayloadFiles = overflowMap(
      'structures/structures.jsonl',
    );
    const second = invalidVerificationOptions();
    second.partitionEvidence[0].status = 'failed';
    second.partitionEvidence[0].producerScientificPayloadFiles = overflowMap(
      'ordinary/overflow.bin',
    );

    const firstReceipt = verifyFullCandidate(first);
    const secondReceipt = verifyFullCandidate(second);
    expect(firstReceipt.partitions[0].rejectedProducerScientificPayload).toMatchObject({
      observedFileCount: 33,
      producerStructureBundlePresent: true,
    });
    expect(firstReceipt.partitions[0].rejectedProducerScientificPayload.producerScientificPayloadEvidenceDigest)
      .not.toBe(secondReceipt.partitions[0].rejectedProducerScientificPayload.producerScientificPayloadEvidenceDigest);
    expect(firstReceipt.verification.integrityErrors.join('\n')).toMatch(/32-file inspection limit/);
    expect(validateFullCandidateReceiptEnvelope(firstReceipt, receiptSchemaBytes)).toEqual({
      ok: true,
      errors: [],
    });
    expect(validateFullCandidateReceipt(firstReceipt, receiptSchemaBytes, first).errors.join('\n')).toMatch(
      /requires frozen raw inputs and observed producer scientific payload bytes/,
    );
  });

  it('never ignores producer termination attached to complete evidence', () => {
    const options = invalidVerificationOptions();
    options.partitionEvidence[0].termination = {
      code: 'producer-failed',
      message: 'The producer reported a terminal failure.',
    };
    const receipt = verifyFullCandidate(options);
    expect(receipt.partitions[0].status).toBe('invalid');
    expect(receipt.verification.integrityErrors.join('\n')).toMatch(/contradicts its producer termination/);
    expect(validateFullCandidateReceipt(receipt, receiptSchemaBytes, options)).toEqual({ ok: true, errors: [] });
  });

  it('returns a valid incomplete receipt instead of throwing for corrupt plan or dataset bytes', () => {
    const options = {
      ...invalidVerificationOptions(),
      candidatePlanBytes: Buffer.from('{"broken":'),
      datasetBytes: Buffer.from('not-random-tp'),
    };
    const receipt = verifyFullCandidate(options);
    expect(receipt.outcome).toBe('incomplete');
    expect(receipt.verification).toMatchObject({
      candidatePlanBindingVerified: false,
      frozenBindingsVerified: false,
      metricEvaluationComplete: false,
    });
    expect(validateFullCandidateReceipt(receipt, receiptSchemaBytes, options).ok).toBe(true);
  });

  it('rejects calendar-invalid UTC timestamps instead of accepting Date.parse rollover', () => {
    const options = invalidVerificationOptions({ createdAt: '2026-02-31T12:00:00Z' });
    const receipt = verifyFullCandidate(options);
    expect(receipt.createdAt).toBe('2000-01-01T00:00:00Z');
    expect(receipt.verification.integrityErrors.join('\n')).toMatch(/creation timestamp is invalid/);
    expect(validateFullCandidateReceiptEnvelope(receipt, receiptSchemaBytes)).toEqual({
      ok: true,
      errors: [],
    });
    expect(validateFullCandidateReceipt(receipt, receiptSchemaBytes, options).errors.join('\n')).toMatch(
      /requires frozen raw inputs and observed producer scientific payload bytes/,
    );
  });

  it('detects duplicate plan members and every frozen input drift before completion', () => {
    const duplicatePlan = Buffer.from(candidatePlanBytes.toString().replace(
      '  "schemaVersion": "tf.atomistic-full-candidate-plan/0.2",',
      '  "schemaVersion": "forged",\n  "schemaVersion": "tf.atomistic-full-candidate-plan/0.2",',
    ));
    const inspected = inspectFrozenCandidateInputs({
      candidatePlanBytes: duplicatePlan,
      scientificPlanBytes: Buffer.concat([scientificPlanBytes, Buffer.from(' ')]),
      runtimeLockBytes: Buffer.concat([runtimeLockBytes, Buffer.from(' ')]),
      datasetBytes: Buffer.from('not-random-tp'),
    });
    expect(inspected.errors.join('\n')).toMatch(/duplicate JSON key|raw digest|scientific plan|runtime lock|dataset inspection failed/);
  });
});

describe('R7b1 v0.2 receipt schema and semantic validator', () => {
  it('accepts non-promotional complete pass and complete metric failure receipts', () => {
    const passed = completeReceipt();
    expect(passed.outcome).toBe('complete-pass');
    expect(passed.assessments.mattersim.metricPass).toEqual({ energy: true, force: true, stress: true });
    expect(validateFullCandidateReceiptEnvelope(passed, receiptSchemaBytes)).toEqual({ ok: true, errors: [] });

    const failed = completeReceipt({ matterPass: false });
    expect(failed.outcome).toBe('complete-fail');
    expect(failed.assessments.mattersim.metricPass).toEqual({ energy: false, force: true, stress: true });
    expect(validateFullCandidateReceiptEnvelope(failed, receiptSchemaBytes)).toEqual({ ok: true, errors: [] });
  });

  it('binds validation to the exact frozen schema bytes', () => {
    const receipt = completeReceipt();
    expect(validateFullCandidateReceiptEnvelope(receipt, {} ).errors.join('\n')).toMatch(/raw bytes are required/);
    expect(validateFullCandidateReceiptEnvelope(receipt, Buffer.from('{}\n')).errors.join('\n')).toMatch(/schema raw digest differs/);
    expect(FULL_CANDIDATE_RECEIPT_SCHEMA_DIGEST).toBe(digest(receiptSchemaBytes));
  });

  it('never treats an envelope-only complete receipt as authoritative evidence', () => {
    const receipt = completeReceipt();
    receipt.metrics.models[1].energy.mean = 999;
    receipt.metrics.models[0].energy.binary64MetricEvidenceRoot = digest('forged-metric-root');
    receipt.evidenceBundleDigest = computeCandidateEvidenceBundleDigest(receipt);
    for (const inputs of [undefined, {}, Buffer.from('not-inputs'), new Map()]) {
      expect(validateFullCandidateReceipt(receipt, receiptSchemaBytes, inputs).errors.join('\n')).toMatch(
        /requires frozen raw inputs and observed producer scientific payload bytes/,
      );
    }
  });

  it('uses exact recomputation for incomplete receipts without needing the frozen dataset cache', () => {
    const options = invalidVerificationOptions();
    const receipt = verifyFullCandidate(options);
    expect(validateFullCandidateReceipt(receipt, receiptSchemaBytes, options)).toEqual({ ok: true, errors: [] });

    const forged = structuredClone(receipt);
    forged.partitions[0].records.extra -= 1;
    expect(validateFullCandidateReceiptEnvelope(forged, receiptSchemaBytes)).toEqual({ ok: true, errors: [] });
    expect(validateFullCandidateReceipt(forged, receiptSchemaBytes, options).errors.join('\n')).toMatch(
      /differs from the independently recomputed frozen-input result/,
    );

    const missingRawDataset = { ...options };
    delete missingRawDataset.datasetBytes;
    expect(validateFullCandidateReceipt(receipt, receiptSchemaBytes, missingRawDataset).errors.join('\n')).toMatch(
      /requires frozen raw inputs and observed producer scientific payload bytes/,
    );
  });

  it('returns validation errors instead of throwing for malformed receipt shapes', () => {
    for (const malformed of [null, 7, { outcome: 7, partitions: [null] }]) {
      expect(() => validateFullCandidateReceiptEnvelope(malformed, receiptSchemaBytes)).not.toThrow();
      expect(validateFullCandidateReceiptEnvelope(malformed, receiptSchemaBytes).ok).toBe(false);
      expect(() => validateFullCandidateReceipt(malformed, receiptSchemaBytes, {})).not.toThrow();
      expect(validateFullCandidateReceipt(malformed, receiptSchemaBytes, {}).ok).toBe(false);
    }
  });

  it('rejects forged producer provenance even after recomputing the public evidence digest', () => {
    const receipt = completeReceipt();
    receipt.partitions[0].producer.revision = 'b'.repeat(40);
    receipt.partitions[1].producer.jobId = receipt.partitions[0].producer.jobId;
    receipt.evidenceBundleDigest = computeCandidateEvidenceBundleDigest(receipt);
    const errors = validateFullCandidateReceiptEnvelope(receipt, receiptSchemaBytes).errors.join('\n');
    expect(errors).toMatch(/producer provenance/);
    expect(errors).toMatch(/job IDs are not distinct/);
  });

  it('rejects an envelope whose coherent producer provenance uses attempt two', () => {
    const receipt = completeReceipt();
    for (const partition of receipt.partitions) partition.producer.runAttempt = 2;
    receipt.evidenceBundleDigest = computeCandidateEvidenceBundleDigest(receipt);
    expect(validateFullCandidateReceiptEnvelope(receipt, receiptSchemaBytes).errors.join('\n')).toMatch(
      /not bound to workflow attempt one/,
    );
  });

  it('binds verifier, termination and exact producer-payload evidence digests', () => {
    const implementation = completeReceipt();
    implementation.verification.implementationDigest = digest('different-verifier');
    implementation.evidenceBundleDigest = computeCandidateEvidenceBundleDigest(implementation);
    expect(validateFullCandidateReceiptEnvelope(implementation, receiptSchemaBytes).errors.join('\n')).toMatch(
      /implementation digest/,
    );

    const payload = completeReceipt();
    payload.partitions[0].producerScientificPayload.producerScientificPayloadEvidenceDigest = digest('different-producer-payload');
    payload.evidenceBundleDigest = computeCandidateEvidenceBundleDigest(payload);
    expect(validateFullCandidateReceiptEnvelope(payload, receiptSchemaBytes).errors.join('\n')).toMatch(
      /producer scientific payload evidence digest/,
    );

    const termination = incompleteBase();
    termination.partitions[0].termination.message = 'Tampered after verification.';
    expect(validateFullCandidateReceiptEnvelope(termination, receiptSchemaBytes).errors.join('\n')).toMatch(
      /termination evidence digest/,
    );
  });

  it('derives every MatterSim metricPass bit and status from the frozen intervals', () => {
    const receipt = completeReceipt({ matterPass: false });
    receipt.assessments.mattersim.metricPass = { energy: true, force: false, stress: true };
    receipt.evidenceBundleDigest = computeCandidateEvidenceBundleDigest(receipt);
    expect(validateFullCandidateReceiptEnvelope(receipt, receiptSchemaBytes).errors.join('\n')).toMatch(/metricPass/);
  });

  it('rejects claim, diagnostic summary, bundle digest and outcome forgery', () => {
    const claim = completeReceipt();
    claim.claims.promotionEligible = true;
    expect(validateFullCandidateReceiptEnvelope(claim, receiptSchemaBytes).ok).toBe(false);

    const diagnostic = completeReceipt();
    diagnostic.metrics.models[0].stressDiagnostics.spectralNormMeanGpa += 1;
    diagnostic.evidenceBundleDigest = computeCandidateEvidenceBundleDigest(diagnostic);
    expect(validateFullCandidateReceiptEnvelope(diagnostic, receiptSchemaBytes).errors.join('\n')).toMatch(/diagnostic summaries/);

    const bundle = completeReceipt();
    bundle.evidenceBundleDigest = digest('forged');
    expect(validateFullCandidateReceiptEnvelope(bundle, receiptSchemaBytes).errors.join('\n')).toMatch(/bundle digest/);

    const structureCommitment = completeReceipt();
    structureCommitment.verifierDerivedStructureCommitment.producerStructureBundleAttributed = true;
    structureCommitment.evidenceBundleDigest = computeCandidateEvidenceBundleDigest(
      structureCommitment,
    );
    expect(validateFullCandidateReceiptEnvelope(
      structureCommitment,
      receiptSchemaBytes,
    ).errors.join('\n')).toMatch(/verifier-derived structure commitment|schema/);

    const outcome = completeReceipt();
    outcome.outcome = 'complete-fail';
    expect(validateFullCandidateReceiptEnvelope(outcome, receiptSchemaBytes).ok).toBe(false);
  });
});

it.skipIf(!existsSync(cachedDatasetPath))(
  'verifies the actual frozen Random-TP bytes and exact label-free producer payload end to end',
  async () => {
    const temporary = await realpath(await mkdtemp(path.join(os.tmpdir(), 'tailing-r7a-verifier-')));
    try {
      execFileSync('python3', [
        path.join(root, 'scripts/atomistic/prepare_structures.py'),
        '--dataset', cachedDatasetPath,
        '--output', temporary,
        '--plan', path.join(root, 'evaluation/atomistic/reproduction-plan.json'),
      ], { cwd: root, stdio: 'pipe' });
      const [datasetBytes, structureBytes, manifestBytes] = await Promise.all([
        readFile(cachedDatasetPath),
        readFile(path.join(temporary, 'structures.jsonl')),
        readFile(path.join(temporary, 'structures.manifest.json')),
      ]);
      const refs = inspectRandomTp(datasetBytes).records;
      const partitionEvidence = [
        evidence('mattersim', predictions('mattersim', refs), 11, {
          producerScientificPayloadFiles: producerScientificPayloadFiles(jsonl(predictions('mattersim', refs)), manifestBytes),
        }),
        evidence('mace', predictions('mace', refs), 12, {
          producerScientificPayloadFiles: producerScientificPayloadFiles(jsonl(predictions('mace', refs)), manifestBytes),
        }),
      ];
      const verificationInputs = {
        candidatePlanBytes,
        scientificPlanBytes,
        runtimeLockBytes,
        datasetBytes,
        partitionEvidence,
        source: SOURCE,
        createdAt: CREATED_AT,
      };
      const receipt = verifyFullCandidate(verificationInputs);
      expect(receipt.outcome).toBe('complete-pass');
      expect(receipt.partitions.map((partition) => partition.status)).toEqual(['complete', 'complete']);
      expect(receipt.verification.integrityErrors).toEqual([]);
      expect(receipt.verifierDerivedStructureCommitment).toEqual(
        VERIFIER_DERIVED_STRUCTURE_COMMITMENT,
      );
      expect(receipt.partitions[0].producerScientificPayload).toMatchObject({
        producerStructureBundlePresent: false,
        atomicNumbersPresent: true,
        atomicNumbersPublicationLicenseCleared: false,
        publicationEligible: false,
      });
      expect(receipt.partitions[0].producerScientificPayload).not.toHaveProperty(
        'structureBundleDigest',
      );
      expect(validateFullCandidateReceipt(receipt, receiptSchemaBytes, verificationInputs)).toEqual({ ok: true, errors: [] });

      const missingRawDataset = { ...verificationInputs };
      delete missingRawDataset.datasetBytes;
      expect(validateFullCandidateReceipt(receipt, receiptSchemaBytes, missingRawDataset).errors.join('\n')).toMatch(
        /requires frozen raw inputs and observed producer scientific payload bytes/,
      );

      const structurePollutedInputs = {
        ...verificationInputs,
        partitionEvidence: [
          {
            ...partitionEvidence[0],
            producerScientificPayloadFiles: new Map([
              ...partitionEvidence[0].producerScientificPayloadFiles,
              ['structures/structures.jsonl', structureBytes],
            ]),
          },
          partitionEvidence[1],
        ],
      };
      const structurePolluted = verifyFullCandidate(structurePollutedInputs);
      expect(structurePolluted.outcome).toBe('incomplete');
      expect(structurePolluted.partitions[0].status).toBe('invalid');
      expect(structurePolluted.partitions[0].rejectedProducerScientificPayload).toMatchObject({
        producerStructureBundlePresent: true,
      });
      expect(structurePolluted.partitions[0].rejectedProducerScientificPayload).not.toHaveProperty(
        'structureBundleDigest',
      );
      expect(structurePolluted.verifierDerivedStructureCommitment).toEqual(
        VERIFIER_DERIVED_STRUCTURE_COMMITMENT,
      );
      expect(validateFullCandidateReceipt(
        structurePolluted,
        receiptSchemaBytes,
        structurePollutedInputs,
      )).toEqual({ ok: true, errors: [] });

      const completeFailInputs = {
        ...verificationInputs,
        partitionEvidence: [
          evidence('mattersim', predictions('mattersim', refs, { pass: false }), 11, {
            producerScientificPayloadFiles: producerScientificPayloadFiles(
              jsonl(predictions('mattersim', refs, { pass: false })),
              manifestBytes,
            ),
          }),
          partitionEvidence[1],
        ],
      };
      const completeFail = verifyFullCandidate(completeFailInputs);
      expect(completeFail.outcome).toBe('complete-fail');
      expect(validateFullCandidateReceipt(
        completeFail,
        receiptSchemaBytes,
        completeFailInputs,
      )).toEqual({ ok: true, errors: [] });

      const forgedMetrics = structuredClone(receipt);
      forgedMetrics.metrics.models[0].energy.p50 = 999;
      forgedMetrics.metrics.models[0].energy.worst = { id: 'random-TP-999999', error: 999 };
      forgedMetrics.metrics.models[0].energy.binary64MetricEvidenceRoot = digest('forged-energy-root');
      forgedMetrics.metrics.models[1].energy.mean = 999;
      forgedMetrics.metrics.models[1].stressDiagnostics.reports.spectralNorm.p99 = 999;
      forgedMetrics.evidenceBundleDigest = computeCandidateEvidenceBundleDigest(forgedMetrics);
      expect(validateFullCandidateReceipt(forgedMetrics, receiptSchemaBytes, verificationInputs).errors.join('\n')).toMatch(
        /differs from the independently recomputed frozen-input result/,
      );

      const contradictoryInputs = {
        ...verificationInputs,
        partitionEvidence: [
          {
            ...partitionEvidence[0],
            termination: { code: 'producer-failed', message: 'Producer reported failure.' },
          },
          partitionEvidence[1],
        ],
      };
      const contradictory = verifyFullCandidate(contradictoryInputs);
      expect(contradictory.outcome).toBe('incomplete');
      expect(contradictory.partitions.map((partition) => partition.status)).toEqual(['invalid', 'complete']);
      expect(validateFullCandidateReceipt(contradictory, receiptSchemaBytes, contradictoryInputs)).toEqual({
        ok: true,
        errors: [],
      });

      const globallyInvalidInputs = {
        candidatePlanBytes,
        scientificPlanBytes,
        runtimeLockBytes,
        datasetBytes,
        partitionEvidence: [
          { ...partitionEvidence[0], unexpectedEvidenceField: true },
          partitionEvidence[1],
        ],
        source: { ...SOURCE, unexpectedSourceField: true },
        createdAt: 'invalid-timestamp',
      };
      const globallyInvalid = verifyFullCandidate(globallyInvalidInputs);
      expect(globallyInvalid.outcome).toBe('incomplete');
      expect(globallyInvalid.partitions.map((partition) => partition.status)).toEqual(['invalid', 'complete']);
      expect(validateFullCandidateReceiptEnvelope(globallyInvalid, receiptSchemaBytes)).toEqual({ ok: true, errors: [] });
      expect(validateFullCandidateReceipt(globallyInvalid, receiptSchemaBytes, globallyInvalidInputs).errors.join('\n')).toMatch(
        /requires frozen raw inputs and observed producer scientific payload bytes/,
      );
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  },
  30_000,
);
