import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  BOOTSTRAP_REPLICA_RECEIPT_SCHEMA_PATH,
  BOOTSTRAP_REPLICA_RECEIPT_SCHEMA_VERSION,
  BOOTSTRAP_REPLICA_VERIFIER_IMPLEMENTATION_PATH,
  BOOTSTRAP_REPLICA_VERIFIER_WORKFLOW_PATH,
  EXPECTED_BOOTSTRAP_WORKFLOW,
  EXPECTED_BOOTSTRAP_VERIFICATION,
  EXPECTED_NUMERICAL_CONSISTENCY,
  EXPECTED_REPLICA_RUNS,
  EXPECTED_REPOSITORY,
  EXPECTED_RUN_SPECIFIC_OBSERVATIONS,
  EXPECTED_STABLE_INPUTS,
  MODEL_BUNDLE_ALLOWLISTS,
  bootstrapReplicaEvidenceFilesCommitment,
  canonicalBootstrapReplicaJson,
  canonicalBootstrapReplicaReceiptBytes,
  computeBootstrapStableInputsCommitment,
  inspectBootstrapReplicaReceiptBytes,
  parseBootstrapReplicaReceiptBytes,
  sha256BootstrapReplica,
  validateBootstrapReplicaReceipt,
} from './bootstrap-replica-receipt-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const digest = (character) => `sha256:${character.repeat(64)}`;
const verifierTrust = Object.freeze({
  expectedVerifierRevision: 'a'.repeat(40),
  expectedVerifierRunId: 40_000_000_001,
  expectedVerifierRunAttempt: 1,
  expectedVerifierScriptDigest: digest('f'),
  expectedVerifierWorkflowId: 355_000_001,
});
const now = new Date('2026-08-30T00:00:00Z');
const stages = Object.freeze(Object.fromEntries(['guard', 'directories', 'bind', 'base-images', 'assets', 'preprocess', 'wheelhouse', 'resolve', 'freeze', 'cold-install', 'build', 'inference', 'publish'].map((stage) => [stage, 'success'])));

function fixture() {
  const replicas = EXPECTED_REPLICA_RUNS.map((expected, runIndex) => {
    const runLogFiles = runIndex === 0
      ? [
        evidence('0_mace isolated bootstrap smoke.txt', 257_029, expected.jobs[1].jobLogFileDigest),
        evidence('1_mattersim isolated bootstrap smoke.txt', 357_156, expected.jobs[0].jobLogFileDigest),
        evidence('mace isolated bootstrap smoke/system.txt', 599, digest('1')),
        evidence('mattersim isolated bootstrap smoke/system.txt', 599, digest('2')),
      ]
      : [
        evidence('0_mattersim isolated bootstrap smoke.txt', 357_099, expected.jobs[0].jobLogFileDigest),
        evidence('1_mace isolated bootstrap smoke.txt', 257_023, expected.jobs[1].jobLogFileDigest),
        evidence('mace isolated bootstrap smoke/system.txt', 599, digest('3')),
        evidence('mattersim isolated bootstrap smoke/system.txt', 599, digest('4')),
      ];
    const jobs = expected.jobs.map((job, modelIndex) => ({
      model: job.model,
      id: job.id,
      name: job.name,
      status: 'completed',
      conclusion: 'success',
      runnerLabel: 'ubuntu-24.04',
      startedAt: runIndex === 0 ? '2026-08-29T08:22:40Z' : '2026-08-29T08:25:43Z',
      completedAt: runIndex === 0
        ? (modelIndex === 0 ? '2026-08-29T08:25:40Z' : '2026-08-29T08:24:33Z')
        : (modelIndex === 0 ? '2026-08-29T08:28:14Z' : '2026-08-29T08:27:41Z'),
      reviewedStages: structuredClone(stages),
    }));
    const artifacts = expected.artifacts.map((artifact, modelIndex) => {
      const model = artifact.model;
      const files = bundleFiles(model, artifact, EXPECTED_RUN_SPECIFIC_OBSERVATIONS[runIndex].models[modelIndex].timingDigest);
      return {
        model,
        id: artifact.id,
        name: artifact.name,
        sizeBytes: artifact.sizeBytes,
        apiDigest: artifact.digest,
        downloadDigest: artifact.digest,
        createdAt: runIndex === 0 ? '2026-08-29T08:24:00Z' : '2026-08-29T08:27:00Z',
        updatedAt: runIndex === 0 ? '2026-08-29T08:24:01Z' : '2026-08-29T08:27:01Z',
        expiresAt: artifact.expiresAt,
        expired: false,
        workflowRun: { id: expected.run.id, repositoryId: EXPECTED_REPOSITORY.id, headRepositoryId: EXPECTED_REPOSITORY.id, headBranch: 'main', headSha: EXPECTED_BOOTSTRAP_WORKFLOW.sourceRevision },
        uploadBinding: { jobId: jobs[modelIndex].id, jobName: jobs[modelIndex].name, publishStep: 'Upload the allowlisted bootstrap bundle', conclusion: 'success', jobLogFileDigest: expected.jobs[modelIndex].jobLogFileDigest },
        bundle: {
          fileCount: artifact.fileCount,
          expandedBytes: artifact.expandedBytes,
          files,
          filesCommitment: bootstrapReplicaEvidenceFilesCommitment(`tf.atomistic-bootstrap-bundle-files/${expected.run.id}/${model}/v1`, files),
          criticalFiles: structuredClone(artifact.criticalFiles),
          contentAudit: { metricsPresent: false, referenceLabelsPresent: false, receiptPresent: false, attestationPresent: false, predictionsOnly: true },
        },
      };
    });
    return {
      ordinal: expected.ordinal,
      run: structuredClone(expected.run),
      runLog: {
        downloadDigest: expected.runLog.downloadDigest,
        sizeBytes: expected.runLog.sizeBytes,
        fileCount: 4,
        files: runLogFiles,
        filesCommitment: bootstrapReplicaEvidenceFilesCommitment(`tf.github-actions-run-log-files/${expected.run.id}/v1`, runLogFiles),
      },
      jobs,
      artifacts,
    };
  });
  const stableInputs = structuredClone(EXPECTED_STABLE_INPUTS);
  stableInputs.commitment = computeBootstrapStableInputsCommitment(stableInputs);
  return {
    schemaVersion: BOOTSTRAP_REPLICA_RECEIPT_SCHEMA_VERSION,
    profile: 'bootstrap-two-replica',
    status: 'verified-stable-input-agreement',
    createdAt: '2026-08-29T09:00:00Z',
    repository: structuredClone(EXPECTED_REPOSITORY),
    bootstrapWorkflow: structuredClone(EXPECTED_BOOTSTRAP_WORKFLOW),
    verifier: {
      workflow: { id: verifierTrust.expectedVerifierWorkflowId, path: BOOTSTRAP_REPLICA_VERIFIER_WORKFLOW_PATH, revision: verifierTrust.expectedVerifierRevision, runId: verifierTrust.expectedVerifierRunId, runAttempt: verifierTrust.expectedVerifierRunAttempt, event: 'workflow_dispatch', ref: 'refs/heads/main' },
      implementation: { path: BOOTSTRAP_REPLICA_VERIFIER_IMPLEMENTATION_PATH, sha256: verifierTrust.expectedVerifierScriptDigest },
    },
    replicas,
    stableInputs,
    numericalConsistency: structuredClone(EXPECTED_NUMERICAL_CONSISTENCY),
    candidateBundle: { profile: 'bootstrap-predictions-only', exactAllowlistRequired: true, metricsPresent: false, referenceLabelsPresent: false, receiptPresent: false, attestationPresent: false },
    verification: structuredClone(EXPECTED_BOOTSTRAP_VERIFICATION),
    runSpecificObservations: {
      semantics: 'run-specific-observations-not-promotion-trust-roots/v1',
      excludedFromStableInputs: ['dockerLocalConfigImageId', 'runtimeUuid', 'generatedAt', 'timingDigest', 'environmentDigest', 'predictionDigest'],
      replicas: structuredClone(EXPECTED_RUN_SPECIFIC_OBSERVATIONS),
    },
    claims: { evidenceClass: 'bootstrap-replica-verified-not-reproduced', promotionEligible: false, promotionTrustRoot: false, comparable: false, reproduced: false },
  };
}

function evidence(filePath, sizeBytes, sha256) {
  return { path: filePath, sizeBytes, sha256 };
}

function bundleFiles(model, artifact, timingDigest) {
  const criticalPaths = {
    [`manifests/${model}.runtime-inputs.json`]: artifact.criticalFiles.runtimeInput,
    [`locks/${model}.requirements.lock`]: artifact.criticalFiles.dependencyLock,
    [`manifests/${model}.wheelhouse.manifest.json`]: artifact.criticalFiles.wheelhouse,
    'manifests/structures.manifest.json': artifact.criticalFiles.structureManifest,
    'predictions/predictions.jsonl': artifact.criticalFiles.predictions,
    'manifests/run-summary.json': artifact.criticalFiles.runSummary,
    [`manifests/${model}.container-observation.json`]: artifact.criticalFiles.containerObservation,
    'diagnostics/run-diagnostics.json': timingDigest,
  };
  const files = MODEL_BUNDLE_ALLOWLISTS[model].map((filePath, index) => evidence(filePath, 1, criticalPaths[filePath] ?? digest(String((index % 8) + 1))));
  files[0].sizeBytes = artifact.expandedBytes - files.length + 1;
  return files;
}

const validate = (receipt, options = {}) => validateBootstrapReplicaReceipt(receipt, { now, ...verifierTrust, ...options });

describe('bootstrap replica receipt policy', () => {
  it('accepts the exact bootstrap-only two-replica receipt and strict schema', async () => {
    const receipt = fixture();
    expect(validate(receipt)).toEqual({ ok: true, errors: [] });
    const schema = JSON.parse(await readFile(path.join(root, BOOTSTRAP_REPLICA_RECEIPT_SCHEMA_PATH), 'utf8'));
    const schemaValidator = new Ajv2020({ allErrors: true, strict: false, validateFormats: false }).compile(schema);
    expect(schemaValidator(receipt), JSON.stringify(schemaValidator.errors)).toBe(true);
    const bytes = canonicalBootstrapReplicaReceiptBytes(receipt);
    expect(bytes.at(-1)).toBe(0x0a);
    expect(bytes.at(-2)).not.toBe(0x0a);
    expect(parseBootstrapReplicaReceiptBytes(bytes)).toEqual(receipt);
    expect(inspectBootstrapReplicaReceiptBytes(bytes, { now, ...verifierTrust })).toMatchObject({ receipt, rawDigest: sha256BootstrapReplica(bytes), failures: [] });
  });

  it('requires a separately trusted verifier identity and rejects S/P reuse', () => {
    const receipt = fixture();
    expect(validateBootstrapReplicaReceipt(receipt, { now }).errors.join('\n')).toMatch(/expectedVerifierRevision/);
    for (const [option, value] of [
      ['expectedVerifierRevision', 'b'.repeat(40)],
      ['expectedVerifierRunId', 40_000_000_002],
      ['expectedVerifierRunAttempt', 2],
      ['expectedVerifierScriptDigest', digest('e')],
      ['expectedVerifierWorkflowId', 355_000_002],
    ]) expect(validate(receipt, { [option]: value }).ok, option).toBe(false);
    for (const revision of [EXPECTED_BOOTSTRAP_WORKFLOW.sourceRevision, EXPECTED_BOOTSTRAP_WORKFLOW.runtimeSourceRevision]) {
      const candidate = fixture();
      candidate.verifier.workflow.revision = revision;
      expect(validate(candidate, { expectedVerifierRevision: revision }).errors.join('\n')).toMatch(/distinct from S and P/);
    }
  });

  it('rejects every repository, workflow, run, job, artifact, bundle and commitment mutation', () => {
    const mutations = [
      (r) => { r.repository.id += 1; },
      (r) => { r.bootstrapWorkflow.id += 1; },
      (r) => { r.bootstrapWorkflow.path = '.github/workflows/atomistic-full.yml'; },
      (r) => { r.bootstrapWorkflow.sourceRevision = 'b'.repeat(40); },
      (r) => { r.bootstrapWorkflow.runtimeSourceRevision = 'c'.repeat(40); },
      (r) => { r.verifier.workflow.path = '.github/workflows/atomistic-bootstrap.yml'; },
      (r) => { r.verifier.implementation.path = 'scripts/atomistic/receipt-policy.mjs'; },
      (r) => { r.replicas.reverse(); },
      (r) => { r.replicas[0].run.id += 1; },
      (r) => { r.replicas[0].run.attempt = 2; },
      (r) => { r.replicas[0].run.conclusion = 'failure'; },
      (r) => { r.replicas[0].jobs[0].id += 1; },
      (r) => { r.replicas[0].jobs[0].name = 'mace isolated bootstrap smoke'; },
      (r) => { r.replicas[0].jobs[0].conclusion = 'failure'; },
      (r) => { r.replicas[0].jobs[0].reviewedStages.inference = 'failure'; },
      (r) => { r.replicas[0].artifacts[0].id += 1; },
      (r) => { r.replicas[0].artifacts[0].name += '-forged'; },
      (r) => { r.replicas[0].artifacts[0].apiDigest = digest('a'); },
      (r) => { r.replicas[0].artifacts[0].downloadDigest = digest('b'); },
      (r) => { r.replicas[0].artifacts[0].expired = true; },
      (r) => { r.replicas[0].artifacts[0].workflowRun.id += 1; },
      (r) => { r.replicas[0].artifacts[0].uploadBinding.jobId += 1; },
      (r) => { r.replicas[0].artifacts[0].uploadBinding.jobLogFileDigest = digest('c'); },
      (r) => { r.replicas[0].artifacts[0].bundle.files.pop(); },
      (r) => { r.replicas[0].artifacts[0].bundle.files.push(structuredClone(r.replicas[0].artifacts[0].bundle.files[0])); },
      (r) => { [r.replicas[0].artifacts[0].bundle.files[0], r.replicas[0].artifacts[0].bundle.files[1]] = [r.replicas[0].artifacts[0].bundle.files[1], r.replicas[0].artifacts[0].bundle.files[0]]; },
      (r) => { r.replicas[0].artifacts[0].bundle.files[0].sha256 = digest('d'); },
      (r) => { r.replicas[0].artifacts[0].bundle.expandedBytes += 1; },
      (r) => { r.replicas[0].artifacts[0].bundle.criticalFiles.runtimeInput = digest('e'); },
      (r) => { r.replicas[0].runLog.downloadDigest = digest('f'); },
      (r) => { r.replicas[0].runLog.filesCommitment = digest('0'); },
    ];
    for (const [index, mutate] of mutations.entries()) {
      const candidate = fixture();
      mutate(candidate);
      expect(validate(candidate).ok, `mutation ${index}`).toBe(false);
    }
  });

  it('rejects stable-root drift, run-specific contamination and false agreement', () => {
    const mutations = [
      (r) => { r.stableInputs.runnerDigest = digest('a'); },
      (r) => { r.stableInputs.sourceManifestDigest = digest('b'); },
      (r) => { r.stableInputs.materializationDigest = digest('c'); },
      (r) => { r.stableInputs.scientificPlanDigest = digest('d'); },
      (r) => { r.stableInputs.structureManifestFileDigest = digest('e'); },
      (r) => { r.stableInputs.models[0].runtimeInputDigest = digest('f'); },
      (r) => { r.stableInputs.models[1].dependencyLockDigest = digest('1'); },
      (r) => { r.stableInputs.models[0].wheelhouseManifestDigest = digest('2'); },
      (r) => { r.stableInputs.byteIdenticalAcrossReplicas = false; },
      (r) => { r.stableInputs.commitment = digest('3'); },
      (r) => { r.runSpecificObservations.replicas[0].models[0].dockerLocalConfigImageId = r.stableInputs.runnerDigest; },
      (r) => { r.runSpecificObservations.replicas[0].models[0].runtimeUuid = r.runSpecificObservations.replicas[1].models[0].runtimeUuid; },
      (r) => { r.runSpecificObservations.replicas[0].models[0].predictionDigest = digest('4'); },
      (r) => { r.runSpecificObservations.replicas[0].models[0].timingDigest = digest('5'); },
    ];
    for (const [index, mutate] of mutations.entries()) {
      const candidate = fixture();
      mutate(candidate);
      expect(validate(candidate).ok, `stable mutation ${index}`).toBe(false);
    }
  });

  it('enforces the frozen numerical tolerance record for MatterSim and exact MACE values', () => {
    const mutations = [
      (r) => { r.numericalConsistency.tolerances.maxAbsEnergyEv = 1; },
      (r) => { r.numericalConsistency.models[0].maximumDifferences.energyEv = 0.001; },
      (r) => { r.numericalConsistency.models[0].withinFrozenTolerance = false; },
      (r) => { r.numericalConsistency.models[0].physicalValuesByteIdentical = true; },
      (r) => { r.numericalConsistency.models[1].maximumDifferences.forceVectorEvPerAngstrom = 1e-12; },
      (r) => { r.numericalConsistency.models[1].physicalValuesByteIdentical = false; },
      (r) => { r.numericalConsistency.models.reverse(); },
    ];
    for (const [index, mutate] of mutations.entries()) {
      const candidate = fixture();
      mutate(candidate);
      expect(validate(candidate).ok, `numerical mutation ${index}`).toBe(false);
    }
  });

  it('recursively requires all promotion/comparison/reproduction claims to be exact false', () => {
    for (const key of ['promotionEligible', 'promotionTrustRoot', 'comparable', 'reproduced']) for (const value of [true, null, 0, 'false']) {
      const candidate = fixture();
      candidate.claims[key] = value;
      expect(validate(candidate).errors.join('\n'), `${key}=${String(value)}`).toMatch(/exactly false|schema/);
    }
    const nested = fixture();
    nested.replicas[0].artifacts[0].bundle.files[0].promotionTrustRoot = true;
    expect(validate(nested).errors.join('\n')).toMatch(/exactly false/);
  });

  it('keeps verifier acceptance distinct from runtime-lock authorization, scientific promotion and full receipts', () => {
    const mutations = [
      (r) => { r.schemaVersion = 'tf.atomistic-reproduction-receipt/0.1'; },
      (r) => { r.profile = 'full'; },
      (r) => { r.verification.verifierAcceptedReplicaCount = 1; },
      (r) => { r.verification.runtimeLockAcceptedReplicaCountBeforeCommitF = 2; },
      (r) => { r.verification.runtimeLockFreezeCandidate = false; },
      (r) => { r.verification.runtimeLockFreezeAuthorized = true; },
      (r) => { r.verification.externalReceiptAttestationRequired = false; },
      (r) => { r.verification.scientificPromotionEligible = true; },
      (r) => { r.verification.independentVerifierRequiredForScientificPromotion = false; },
      (r) => { r.claims.evidenceClass = 'reproduced'; },
      (r) => { r.candidateBundle.metricsPresent = true; },
      (r) => { r.candidateBundle.referenceLabelsPresent = true; },
      (r) => { r.candidateBundle.receiptPresent = true; },
      (r) => { r.candidateBundle.attestationPresent = true; },
      (r) => { r.receiptDigest = digest('a'); },
      (r) => { r.attestation = {}; },
    ];
    for (const [index, mutate] of mutations.entries()) {
      const candidate = fixture();
      mutate(candidate);
      expect(validate(candidate).ok, `boundary mutation ${index}`).toBe(false);
    }
  });

  it('recursively rejects every attempted Commit F or runtime-lock self-authorization', () => {
    for (const key of ['runtimeLockFreezeAuthorized', 'runtimeLockFreezeApproved', 'runtimeLockAuthorized', 'commitFAuthorized', 'commitFApproved']) {
      for (const value of [true, null, 0, 'false']) {
        const candidate = fixture();
        if (key === 'runtimeLockFreezeAuthorized') candidate.verification[key] = value;
        else candidate.runSpecificObservations.replicas[0].models[0][key] = value;
        expect(validate(candidate).errors.join('\n'), `${key}=${String(value)}`).toMatch(/cannot self-authorize|schema/);
      }
    }
  });

  it('keeps a correctly created historical receipt valid after source artifacts expire', () => {
    expect(validate(fixture(), { now: new Date('2026-09-06T00:00:00Z') })).toEqual({ ok: true, errors: [] });
  });

  it('fails after source artifact expiry when live-artifact validation is explicitly required', () => {
    expect(validate(fixture(), { now: new Date('2026-09-06T00:00:00Z'), requireArtifactsLiveAtValidation: true }).errors.join('\n')).toMatch(/expired at live validation time/);
  });

  it('rejects invalid receipt-time ordering and non-finite object values', () => {
    const beforeRuns = fixture();
    beforeRuns.createdAt = '2026-08-29T08:00:00Z';
    expect(validate(beforeRuns).ok).toBe(false);
    const expiredBeforeReceipt = fixture();
    expiredBeforeReceipt.replicas[0].artifacts[0].expiresAt = '2026-08-29T08:30:00Z';
    expect(validate(expiredBeforeReceipt).errors.join('\n')).toMatch(/invalid receipt-time ordering/);
    const badJobTime = fixture();
    badJobTime.replicas[0].jobs[0].completedAt = '2026-08-29T08:00:00Z';
    expect(validate(badJobTime).ok).toBe(false);
    const nonfinite = fixture();
    nonfinite.numericalConsistency.models[0].maximumDifferences.energyEv = Number.NaN;
    expect(validate(nonfinite).errors.join('\n')).toMatch(/non-finite/);
  });

  it('rejects duplicate keys, escape-equivalent duplicates, non-finite JSON and every noncanonical byte rewrite', () => {
    const receipt = fixture();
    const text = canonicalBootstrapReplicaReceiptBytes(receipt).toString('utf8');
    const duplicate = text.replace('{"bootstrapWorkflow":', '{"profile":"forged","bootstrapWorkflow":');
    expect(() => parseBootstrapReplicaReceiptBytes(Buffer.from(duplicate))).toThrow(/duplicate JSON key/);
    const escaped = text.replace('{"bootstrapWorkflow":', '{"\\u0070rofile":"forged","bootstrapWorkflow":');
    expect(() => parseBootstrapReplicaReceiptBytes(Buffer.from(escaped))).toThrow(/duplicate JSON key/);
    expect(() => parseBootstrapReplicaReceiptBytes(Buffer.from('{"x":1e400}\n'))).toThrow(/non-finite/);
    expect(() => parseBootstrapReplicaReceiptBytes(Buffer.from(JSON.stringify(receipt)))).toThrow(/canonical JSON/);
    expect(() => parseBootstrapReplicaReceiptBytes(Buffer.from(`${canonicalBootstrapReplicaJson(receipt)}\n\n`))).toThrow(/canonical JSON/);
    expect(() => parseBootstrapReplicaReceiptBytes(Buffer.from([0xff, 0x0a]))).toThrow(/strict UTF-8/);
  });
});
