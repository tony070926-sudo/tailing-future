import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import {
  FULL_CANDIDATE_PRODUCER_OUTCOME_SCHEMA_RAW_DIGEST,
  FULL_CANDIDATE_PRODUCER_STAGES,
  canonicalProducerOutcomeBytes,
  inspectFullCandidateProducerOutcomeBytes,
} from './full-candidate-producer-outcome-policy.mjs';

const schemaBytes = await readFile(new URL(
  '../../schemas/atomistic-full-candidate-producer-outcome.schema.json',
  import.meta.url,
));
const DIGEST = `sha256:${'1'.repeat(64)}`;
const COMMIT = '1234567890abcdef1234567890abcdef12345678';

function evidenceRecord(path, stage, stageOutcome = 'success', sha256 = DIGEST) {
  return { path, sha256, sizeBytes: 1, stage, stageOutcome };
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
    .sort((left, right) => asciiCompare(left.path, right.path));
  return {
    claims: {
      claimEligible: false,
      comparisonEligible: false,
      promotionEligible: false,
      reproduced: false,
      reproductionEligible: false,
      superiorityClaimAllowed: false,
    },
    commitSha: COMMIT,
    evidence: {
      control,
      failure: [],
      partial: [],
      predictions: evidenceRecord('predictions/predictions.jsonl', 'inference'),
      structureManifest: evidenceRecord('manifests/structures.manifest.json', 'structures'),
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
      scientificArtifactExactPaths: [
        'manifests/structures.manifest.json',
        'predictions/predictions.jsonl',
      ],
      scientificArtifactPublicationEligible: false,
      workingDirectoryIsPublicArtifact: false,
    },
    runAttempt: 1,
    runId: 123,
    schemaVersion: 'tf.atomistic-full-candidate-producer-outcome/0.2',
    stages: FULL_CANDIDATE_PRODUCER_STAGES.map((stage) => ({ outcome: 'success', stage })),
    status: 'complete',
    terminalStage: null,
  };
}

function failedBuildOutcome() {
  const outcome = completeOutcome();
  const buildIndex = FULL_CANDIDATE_PRODUCER_STAGES.indexOf('build');
  outcome.stages = outcome.stages.map((record, index) => ({
    ...record,
    outcome: index < buildIndex ? 'success' : index === buildIndex ? 'failure' : 'skipped',
  }));
  outcome.status = 'failed';
  outcome.terminalStage = 'build';
  outcome.evidence.control = outcome.evidence.control.filter((record) => (
    FULL_CANDIDATE_PRODUCER_STAGES.indexOf(record.stage) < buildIndex
  ));
  outcome.evidence.predictions = null;
  outcome.evidence.partial = [evidenceRecord(
    'diagnostics/mattersim.buildx-version.txt',
    'build',
    'failure',
  )];
  return outcome;
}

function inspect(outcome, observedSchemaBytes = schemaBytes) {
  return inspectFullCandidateProducerOutcomeBytes(
    canonicalProducerOutcomeBytes(outcome),
    observedSchemaBytes,
  );
}

describe('full-candidate producer-outcome policy', () => {
  it('accepts exact complete and not-started outcomes against frozen schema bytes', () => {
    expect(FULL_CANDIDATE_PRODUCER_OUTCOME_SCHEMA_RAW_DIGEST).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(inspect(completeOutcome()).failures).toEqual([]);
    expect(inspect(completeOutcome('mace')).failures).toEqual([]);

    const notStarted = completeOutcome();
    notStarted.status = 'not-started';
    notStarted.stages = notStarted.stages.map((record) => ({ ...record, outcome: 'skipped' }));
    notStarted.evidence = {
      control: [], failure: [], partial: [], predictions: null, structureManifest: null,
    };
    expect(inspect(notStarted).failures).toEqual([]);
  });

  it('requires exact frozen schema bytes and strict Ajv schema validation', () => {
    const outcome = completeOutcome();
    outcome.forged = true;
    const failures = inspect(outcome, Buffer.concat([schemaBytes, Buffer.from('\n')])).failures.join('\n');
    expect(failures).toMatch(/schema\.raw: bytes differ/);
    expect(failures).toMatch(/producer-outcome\.schema.*additionalProperties/);
  });

  it('rejects a failed stage whose evidence for that stage claims success', () => {
    const outcome = failedBuildOutcome();
    outcome.evidence.partial[0].stageOutcome = 'success';
    const failures = inspect(outcome).failures.join('\n');
    expect(failures).toMatch(/stageOutcome.*does not match stages outcome "failure"/);
    expect(failures).toMatch(/belongs in partial|schema/);
  });

  it('rejects evidence files belonging to a skipped stage after failure', () => {
    const outcome = failedBuildOutcome();
    outcome.evidence.control.push(evidenceRecord('manifests/run-summary.json', 'inference'));
    outcome.evidence.control.sort((left, right) => asciiCompare(left.path, right.path));
    const failures = inspect(outcome).failures.join('\n');
    expect(failures).toMatch(/evidence from skipped post-terminal stage inference is forbidden/);
    expect(failures).toMatch(/stageOutcome.*does not match stages outcome "skipped"/);
  });

  it('rejects a forged terminal stage and partial evidence assigned to the wrong stage', () => {
    const outcome = failedBuildOutcome();
    outcome.terminalStage = 'resolve';
    outcome.evidence.partial[0].stage = 'resolve';
    const failures = inspect(outcome).failures.join('\n');
    expect(failures).toMatch(/terminalStage.*does not match derived "build"/);
    expect(failures).toMatch(/partial\[0\]\.stage.*does not match allowlisted stage build/);
  });

  it('rejects model-specific evidence paths from the other model', () => {
    const outcome = completeOutcome('mattersim');
    const record = outcome.evidence.control.find((entry) => (
      entry.path === 'diagnostics/mattersim.buildx-version.txt'
    ));
    record.path = 'diagnostics/mace.buildx-version.txt';
    outcome.evidence.control.sort((left, right) => asciiCompare(left.path, right.path));
    const failures = inspect(outcome).failures.join('\n');
    expect(failures).toMatch(/outside the mattersim producer allowlist/);
    expect(failures).toMatch(/missing required file diagnostics\/mattersim\.buildx-version\.txt/);
  });

  it('rejects duplicate paths and evidence arrays outside strict ASCII order', () => {
    const duplicate = completeOutcome();
    duplicate.evidence.control.push({
      ...duplicate.evidence.control[0],
      sha256: `sha256:${'2'.repeat(64)}`,
    });
    duplicate.evidence.control.sort((left, right) => asciiCompare(left.path, right.path));
    expect(inspect(duplicate).failures.join('\n')).toMatch(/duplicate evidence path|unique and strictly ASCII sorted/);

    const unordered = completeOutcome();
    [unordered.evidence.control[0], unordered.evidence.control[1]] = [
      unordered.evidence.control[1], unordered.evidence.control[0],
    ];
    expect(inspect(unordered).failures.join('\n')).toMatch(/unique and strictly ASCII sorted/);
  });

  it('rejects noncanonical writer bytes and duplicate decoded JSON keys', () => {
    const outcome = completeOutcome();
    const noncanonical = Buffer.from(`${JSON.stringify(outcome, null, 2)}\n`, 'ascii');
    expect(inspectFullCandidateProducerOutcomeBytes(noncanonical, schemaBytes).failures.join('\n')).toMatch(
      /not canonical ASCII JSON with exactly one trailing LF/,
    );

    const canonical = canonicalProducerOutcomeBytes(outcome).toString('ascii');
    const duplicate = Buffer.from(canonical.replace(
      '"profile":"full-candidate-producer"',
      '"profile":"full-candidate-producer","\\u0070rofile":"full-candidate-producer"',
    ), 'ascii');
    expect(inspectFullCandidateProducerOutcomeBytes(duplicate, schemaBytes).failures.join('\n')).toMatch(
      /duplicate JSON key "profile"/,
    );
  });

  it('requires complete evidence for every successful stage and fixes all claims false', () => {
    const outcome = completeOutcome();
    outcome.evidence.control = outcome.evidence.control.filter((record) => (
      record.path !== 'manifests/fetched-assets.manifest.json'
    ));
    outcome.claims.promotionEligible = true;
    const failures = inspect(outcome).failures.join('\n');
    expect(failures).toMatch(/successful assets stage is missing required file/);
    expect(failures).toMatch(/claims\.promotionEligible: must be exactly false/);
  });
});

function asciiCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
