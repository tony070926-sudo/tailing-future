import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  FULL_CANDIDATE_PRODUCER_STAGES,
  canonicalProducerOutcomeBytes,
} from './full-candidate-producer-outcome-policy.mjs';
import {
  FULL_CANDIDATE_PRODUCER_WORKFLOW,
  FULL_CANDIDATE_REPOSITORY,
  FULL_CANDIDATE_REPOSITORY_ID,
  selectFirstProducerDispatch,
  validateFirstProducerAttempt,
  validateFirstProducerJob,
} from './full-candidate-github-evidence-policy.mjs';
import {
  PRIVATE_FULL_CANDIDATE_ENVELOPE_SCHEMA_VERSION,
  PRIVATE_FULL_CANDIDATE_OUTCOME_PATH,
  PRIVATE_FULL_CANDIDATE_SCIENTIFIC_PATHS,
  createPrivateFullCandidateHandoff,
  disposePrivateFullCandidateHandoff,
  openPrivateFullCandidateHandoff,
} from './private-full-candidate-handoff.mjs';
import { canonicalJson } from './runtime-input-contract.mjs';

const producerOutcomeSchemaBytes = await readFile(new URL(
  '../../schemas/atomistic-full-candidate-producer-outcome.schema.json',
  import.meta.url,
));
const SOURCE_REVISION = '1234567890abcdef1234567890abcdef12345678';
const KEY_ID = 'tf-v05-private-handoff-test-key';
const KEY = Buffer.alloc(32, 0x39);
const MANIFEST_BYTES = Buffer.from('{"privateStructureCommitment":true}\n', 'ascii');
const PREDICTION_BYTES = Buffer.from(
  '{"sensitive-test-marker":"must-remain-encrypted","values":[1,2,3]}\n',
  'ascii',
);
const EXPECTED_CLAIMS = Object.freeze({
  claimEligible: false,
  comparisonEligible: false,
  promotionEligible: false,
  reproduced: false,
  reproductionEligible: false,
  superiorityClaimAllowed: false,
});
const EXPECTED_PUBLICATION_POLICY = Object.freeze({
  atomicNumbersPublicationLicenseCleared: false,
  encryptedPayloadRedistributionLicenseCleared: false,
  encryptedPayloadPublicationEligible: false,
  encryptionConfersPublicationOrRedistributionRights: false,
  publicArtifactPublicationEligible: false,
  decryptedPayloadMayBePublished: false,
  independentLabelBearingVerificationRequired: true,
  plaintextArtifactPublicationEligible: false,
  publicReceiptMayContainScientificArrays: false,
  restrictedPrivateStorageRequired: true,
  restrictedStorageAccessControlEvidenceRequired: true,
  restrictedStorageDeletionEvidenceRequired: true,
  restrictedStorageMaximumRetentionHours: 24,
  perModelPerRunKeyRotationEvidenceRequired: true,
});
const PRODUCER_WORKFLOW = Object.freeze({
  ...FULL_CANDIDATE_PRODUCER_WORKFLOW,
  configured: true,
  id: 900_001,
});

function digest(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function evidenceRecord(path, stage, bytes = Buffer.from('control')) {
  return {
    path,
    sha256: digest(bytes),
    sizeBytes: bytes.length,
    stage,
    stageOutcome: 'success',
  };
}

function evidenceRules(model) {
  const rules = new Map([
    ['diagnostics/run-diagnostics.json', ['inference', 'control']],
    ['manifests/fetched-assets.manifest.json', ['assets', 'control']],
    ['manifests/pytorch-download-sources.json', ['wheelhouse', 'control']],
    ['manifests/run-summary.json', ['inference', 'control']],
    ['manifests/structures.manifest.json', ['structures', 'structureManifest']],
    ['predictions/predictions.jsonl', ['inference', 'predictions']],
    [`diagnostics/${model}.buildx-metadata.json`, ['build', 'control']],
    [`diagnostics/${model}.buildx-version.txt`, ['build', 'control']],
    [`diagnostics/${model}.docker-server-version.txt`, ['build', 'control']],
    [`diagnostics/${model}.image-inspect.json`, ['build', 'control']],
    [`locks/${model}.requirements.lock`, ['resolve', 'control']],
    [`manifests/${model}.container-observation.json`, ['build', 'control']],
    [`manifests/${model}.runtime-inputs.json`, ['resolve', 'control']],
    [`manifests/${model}.wheelhouse.manifest.json`, ['resolve', 'control']],
  ]);
  if (model === 'mace') {
    rules.set('manifests/python-hostlist.derived-wheel.manifest.json', ['wheelhouse', 'control']);
  }
  return rules;
}

function completeOutcome(model = 'mattersim') {
  const rules = evidenceRules(model);
  const control = [...rules]
    .filter(([, [, category]]) => category === 'control')
    .map(([path, [stage]]) => evidenceRecord(path, stage))
    .sort((left, right) => left.path < right.path ? -1 : 1);
  return {
    claims: {
      claimEligible: false,
      comparisonEligible: false,
      promotionEligible: false,
      reproduced: false,
      reproductionEligible: false,
      superiorityClaimAllowed: false,
    },
    commitSha: SOURCE_REVISION,
    evidence: {
      control,
      failure: [],
      partial: [],
      predictions: evidenceRecord('predictions/predictions.jsonl', 'inference', PREDICTION_BYTES),
      structureManifest: evidenceRecord('manifests/structures.manifest.json', 'structures', MANIFEST_BYTES),
    },
    evidenceClass: 'producer-output-awaiting-independent-verification',
    statusDomain: 'producer-execution-only-not-scientific-assessment',
    model,
    outputPath: 'manifests/producer-outcome.json',
    partitionId: `${model}-full-000`,
    profile: 'full-candidate-producer',
    publicationPolicy: {
      administrativeEvidenceArtifactPublicationEligible: false,
      atomicNumbersPublicationLicenseCleared: false,
      forbiddenMemberClasses: [
        'raw-dataset',
        'raw-structure-records',
        'positions-cell-pbc',
        'reference-labels-targets',
        'scientific-metrics',
        'receipts-attestations',
        'model-checkpoints',
      ],
      independentLabelBearingVerificationRequired: true,
      profile: 'tf.atomistic-full-candidate-producer-evidence-inventory/0.2',
      scientificArtifactExactPaths: [...PRIVATE_FULL_CANDIDATE_SCIENTIFIC_PATHS],
      scientificArtifactPublicationEligible: false,
      workingDirectoryIsPublicArtifact: false,
    },
    runAttempt: 1,
    runId: 321,
    schemaVersion: 'tf.atomistic-full-candidate-producer-outcome/0.2',
    stages: FULL_CANDIDATE_PRODUCER_STAGES.map((stage) => ({ outcome: 'success', stage })),
    status: 'complete',
    terminalStage: null,
  };
}

function notStartedOutcome() {
  const outcome = completeOutcome();
  outcome.status = 'not-started';
  outcome.stages = outcome.stages.map(({ stage }) => ({ outcome: 'skipped', stage }));
  outcome.evidence = {
    control: [],
    failure: [],
    partial: [],
    predictions: null,
    structureManifest: null,
  };
  return outcome;
}

function filesFor(outcome, includeScience = true) {
  return new Map([
    [PRIVATE_FULL_CANDIDATE_OUTCOME_PATH, canonicalProducerOutcomeBytes(outcome)],
    ...(includeScience ? [
      [PRIVATE_FULL_CANDIDATE_SCIENTIFIC_PATHS[0], MANIFEST_BYTES],
      [PRIVATE_FULL_CANDIDATE_SCIENTIFIC_PATHS[1], PREDICTION_BYTES],
    ] : []),
  ]);
}

function verifiedJob({
  jobConclusion = 'success',
  jobId = 654,
  model = 'mattersim',
  workflowConclusion = 'failure',
} = {}) {
  const repository = {
    full_name: FULL_CANDIDATE_REPOSITORY,
    id: FULL_CANDIDATE_REPOSITORY_ID,
  };
  const run = {
    created_at: '2026-09-03T06:10:00Z',
    event: 'workflow_dispatch',
    head_branch: 'main',
    head_repository: repository,
    head_sha: SOURCE_REVISION,
    id: 321,
    name: PRODUCER_WORKFLOW.name,
    path: PRODUCER_WORKFLOW.path,
    repository,
    run_number: 1,
    workflow_id: PRODUCER_WORKFLOW.id,
  };
  const selected = selectFirstProducerDispatch({
    total_count: 1,
    workflow_runs: [run],
  }, PRODUCER_WORKFLOW, SOURCE_REVISION).selected;
  const attempt = validateFirstProducerAttempt(selected, {
    ...run,
    conclusion: workflowConclusion,
    run_attempt: 1,
    run_started_at: '2026-09-03T06:10:01Z',
    status: 'completed',
    updated_at: '2026-09-03T06:12:00Z',
  });
  return validateFirstProducerJob(attempt, {
    conclusion: jobConclusion,
    head_sha: SOURCE_REVISION,
    id: jobId,
    name: model,
    run_attempt: 1,
    run_id: run.id,
    status: 'completed',
    workflow_name: run.name,
  }, model);
}

function create(overrides = {}) {
  const outcome = overrides.outcome ?? completeOutcome(overrides.model);
  const model = overrides.model ?? outcome.model;
  return createPrivateFullCandidateHandoff({
    files: overrides.files ?? filesFor(outcome),
    key: overrides.key ?? KEY,
    keyId: overrides.keyId ?? KEY_ID,
    producerOutcomeSchemaBytes,
    verifiedProducerJob: overrides.verifiedProducerJob ?? verifiedJob({ model }),
    ...(overrides.unexpectedOptions ?? {}),
  });
}

function open(envelopeBytes, overrides = {}) {
  return openPrivateFullCandidateHandoff({
    envelopeBytes,
    expectedKeyId: overrides.expectedKeyId ?? KEY_ID,
    key: overrides.key ?? KEY,
    producerOutcomeSchemaBytes,
    verifiedProducerJob: overrides.verifiedProducerJob ?? verifiedJob({
      model: overrides.model ?? 'mattersim',
    }),
    ...(overrides.unexpectedOptions ?? {}),
  });
}

function canonicalBytes(value) {
  return Buffer.from(`${canonicalJson(value)}\n`, 'ascii');
}

describe('private full-candidate handoff', () => {
  it('round-trips an exact successful model job even when the workflow overall failed', () => {
    const createProof = verifiedJob({ workflowConclusion: 'failure' });
    const envelope = create({ verifiedProducerJob: createProof });
    const opened = open(envelope.bytes, {
      verifiedProducerJob: verifiedJob({ workflowConclusion: 'failure' }),
    });
    expect(envelope.digest).toBe(digest(envelope.bytes));
    expect(opened.metadata).toEqual({
      jobId: 654,
      model: 'mattersim',
      modelId: 'mattersim-v1.0.0-5m',
      partitionId: 'mattersim-full-000',
      runAttempt: 1,
      sourceRevision: SOURCE_REVISION,
      workflowRunId: 321,
    });
    expect([...opened.producerScientificPayloadFiles.keys()]).toEqual(PRIVATE_FULL_CANDIDATE_SCIENTIFIC_PATHS);
    expect(opened.producerScientificPayloadFiles.get(PRIVATE_FULL_CANDIDATE_SCIENTIFIC_PATHS[0])).toEqual(MANIFEST_BYTES);
    expect(opened.producerScientificPayloadFiles.get(PRIVATE_FULL_CANDIDATE_SCIENTIFIC_PATHS[1])).toEqual(PREDICTION_BYTES);
    expect(opened.outcome.status).toBe('complete');
    disposePrivateFullCandidateHandoff(opened);
  });

  it('marks the encrypted envelope restricted and grants no publication or redistribution rights', () => {
    const first = create();
    const second = create();
    expect(first.bytes.toString('ascii')).not.toContain('must-remain-encrypted');
    expect(first.bytes.toString('ascii')).not.toContain('privateStructureCommitment');
    expect(first.bytes.equals(second.bytes)).toBe(false);
    const parsed = JSON.parse(first.bytes);
    expect(parsed.schemaVersion).toBe(PRIVATE_FULL_CANDIDATE_ENVELOPE_SCHEMA_VERSION);
    expect(parsed.claims).toEqual(EXPECTED_CLAIMS);
    expect(parsed.publicationPolicy).toEqual(EXPECTED_PUBLICATION_POLICY);
    expect(parsed.cipher).toBe('aes-256-gcm');
    expect(Buffer.from(parsed.nonceBase64, 'base64')).toHaveLength(12);
    expect(Buffer.from(parsed.authenticationTagBase64, 'base64')).toHaveLength(16);
    expect(KEY).toHaveLength(32);
  });

  it('best-effort clears returned scientific buffers and supports repeated disposal', () => {
    const opened = open(create().bytes);
    const returnedBuffers = [...opened.producerScientificPayloadFiles.values()];
    expect(returnedBuffers).toHaveLength(2);
    expect(returnedBuffers.every((bytes) => bytes.some((byte) => byte !== 0))).toBe(true);

    disposePrivateFullCandidateHandoff(opened);
    expect(opened.producerScientificPayloadFiles.size).toBe(0);
    expect(returnedBuffers.every((bytes) => bytes.every((byte) => byte === 0))).toBe(true);
    expect(() => disposePrivateFullCandidateHandoff(opened)).not.toThrow();
    expect(opened.producerScientificPayloadFiles.size).toBe(0);
  });

  it('never clears caller-owned keys, envelope bytes or input file buffers', () => {
    const outcome = completeOutcome();
    const inputFiles = filesFor(outcome);
    const inputSnapshots = new Map(
      [...inputFiles].map(([path, bytes]) => [path, Buffer.from(bytes)]),
    );
    const createKey = Buffer.from(KEY);
    const createKeySnapshot = Buffer.from(createKey);
    const envelope = create({ files: inputFiles, key: createKey, outcome });
    expect(createKey).toEqual(createKeySnapshot);
    for (const [path, bytes] of inputFiles) expect(bytes).toEqual(inputSnapshots.get(path));

    const envelopeInput = Buffer.from(envelope.bytes);
    const envelopeSnapshot = Buffer.from(envelopeInput);
    const openKey = Buffer.from(KEY);
    const openKeySnapshot = Buffer.from(openKey);
    const opened = open(envelopeInput, { key: openKey });
    expect(envelopeInput).toEqual(envelopeSnapshot);
    expect(openKey).toEqual(openKeySnapshot);
    disposePrivateFullCandidateHandoff(opened);
    expect(envelopeInput).toEqual(envelopeSnapshot);
    expect(openKey).toEqual(openKeySnapshot);
    for (const [path, bytes] of inputFiles) expect(bytes).toEqual(inputSnapshots.get(path));

    const wrongOpenKey = Buffer.alloc(32, 0x40);
    const wrongOpenKeySnapshot = Buffer.from(wrongOpenKey);
    expect(() => open(envelopeInput, { key: wrongOpenKey })).toThrow(/authentication failed/);
    expect(wrongOpenKey).toEqual(wrongOpenKeySnapshot);
    expect(envelopeInput).toEqual(envelopeSnapshot);

    const invalidCreateKey = Buffer.alloc(31, 0x41);
    const invalidCreateKeySnapshot = Buffer.from(invalidCreateKey);
    expect(() => create({ files: inputFiles, key: invalidCreateKey, outcome })).toThrow(
      /key must contain exactly 32 bytes/,
    );
    expect(invalidCreateKey).toEqual(invalidCreateKeySnapshot);
    for (const [path, bytes] of inputFiles) expect(bytes).toEqual(inputSnapshots.get(path));
  });

  it('keeps terminal producer states out of the private scientific handoff', () => {
    const outcome = notStartedOutcome();
    expect(() => create({
      files: filesFor(outcome, false),
      outcome,
    })).toThrow(/requires a complete producer outcome/);
  });

  it('rejects attempt two and unvalidated provenance at the private boundary', () => {
    const attemptTwo = completeOutcome();
    attemptTwo.runAttempt = 2;
    expect(() => create({
      files: filesFor(attemptTwo),
      outcome: attemptTwo,
    })).toThrow(/provenance differs/);

    expect(() => create({
      verifiedProducerJob: {
        ...verifiedJob(),
        runAttempt: 2,
      },
    })).toThrow(/requires the exact validated successful model job/);
  });

  it('rejects failed jobs, fictitious job IDs and cloned job proofs', () => {
    expect(() => create({
      verifiedProducerJob: verifiedJob({ jobConclusion: 'failure' }),
    })).toThrow(/requires the exact validated successful model job/);

    const successfulJob = verifiedJob();
    for (const forged of [
      { ...successfulJob, jobId: 999 },
      structuredClone(successfulJob),
      JSON.parse(JSON.stringify(successfulJob)),
    ]) {
      expect(() => create({ verifiedProducerJob: forged })).toThrow(
        /requires the exact validated successful model job/,
      );
    }
    expect(() => create({ unexpectedOptions: { jobId: 999 } })).toThrow(
      /unexpected or self-reported provenance options/,
    );

    const envelope = create();
    expect(() => open(envelope.bytes, {
      verifiedProducerJob: verifiedJob({ jobId: 999 }),
    })).toThrow(/differs from the independently validated successful producer job/);
  });

  it('authenticates metadata, ciphertext, key identity and key bytes', () => {
    const envelope = create();
    const metadataTamper = JSON.parse(envelope.bytes);
    metadataTamper.metadata.jobId += 1;
    expect(() => open(canonicalBytes(metadataTamper))).toThrow(/provenance differs/);

    const ciphertextTamper = JSON.parse(envelope.bytes);
    ciphertextTamper.ciphertextBase64 = `${ciphertextTamper.ciphertextBase64[0] === 'A' ? 'B' : 'A'}${ciphertextTamper.ciphertextBase64.slice(1)}`;
    expect(() => open(canonicalBytes(ciphertextTamper))).toThrow(/authentication failed/);
    expect(() => open(envelope.bytes, { key: Buffer.alloc(32, 0x40) })).toThrow(/authentication failed/);
    expect(() => open(envelope.bytes, { expectedKeyId: 'different-key' })).toThrow(/key ID differs/);
  });

  it('rejects duplicate envelope keys before decryption', () => {
    const envelope = create().bytes.toString('ascii');
    const duplicate = Buffer.from(envelope.replace(
      '"cipher":"aes-256-gcm"',
      '"cipher":"aes-256-gcm","\\u0063ipher":"aes-256-gcm"',
    ), 'ascii');
    expect(() => open(duplicate)).toThrow(/duplicate JSON key "cipher"/);
  });

  it('rejects undeclared files, false file digests and self-reported provenance drift', () => {
    const outcome = completeOutcome();
    const extra = filesFor(outcome);
    extra.set('metrics/forbidden.json', Buffer.from('{}'));
    expect(() => create({ files: extra, outcome })).toThrow(/file count is outside policy|unknown or duplicate path/);

    outcome.evidence.predictions.sha256 = digest(Buffer.from('forged'));
    expect(() => create({ files: filesFor(outcome), outcome })).toThrow(/differs from producer-declared size or digest/);

    const wrongRevision = completeOutcome();
    wrongRevision.commitSha = 'a'.repeat(40);
    expect(() => create({ files: filesFor(wrongRevision), outcome: wrongRevision })).toThrow(/provenance differs/);
  });
});
