import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  FROZEN_FULL_CANDIDATE_RUNTIME_INPUTS,
  FULL_CANDIDATE_EXECUTION_PREFLIGHT_PATH,
  FULL_CANDIDATE_EXECUTION_PREFLIGHT_SCHEMA_PATH,
  inspectFullCandidateExecutionPreflightBytes,
  validateCheckedInFullCandidateExecutionPreflight,
  validateFullCandidateExecutionPreflightRepository,
  validateFullCandidateExecutionPreflightSchema,
  validateFullCandidateExecutionPreflightSemantics,
  validateFullCandidateSourceEvidenceProjection,
} from './full-candidate-execution-preflight-policy.mjs';
import { validateFullCandidateReceiptEnvelope } from './verify-full-candidate.mjs';

const root = process.cwd();
const preflightBytes = await readFile(path.join(root, FULL_CANDIDATE_EXECUTION_PREFLIGHT_PATH));
const schemaBytes = await readFile(
  path.join(root, FULL_CANDIDATE_EXECUTION_PREFLIGHT_SCHEMA_PATH),
);
const legacyReceiptSchemaBytes = await readFile(
  path.join(root, 'schemas/atomistic-full-candidate-receipt.schema.json'),
);
const runtimeLockPath = 'evaluation/atomistic/runtime-lock.json';
const signedReceiptPath =
  'evaluation/atomistic/evidence/r6e-verifier-33296529694/atomistic-bootstrap-replica-receipt.json';
const attestationPath =
  'evaluation/atomistic/evidence/r6e-verifier-33296529694/receipt-attestation.sigstore.jsonl';
const runtimeLockBytes = await readFile(path.join(root, runtimeLockPath));
const signedReceiptBytes = await readFile(path.join(root, signedReceiptPath));
const attestationBytes = await readFile(path.join(root, attestationPath));
const preflight = JSON.parse(preflightBytes);
const schema = JSON.parse(schemaBytes);
const runtimeLock = JSON.parse(runtimeLockBytes);
const signedReceipt = JSON.parse(signedReceiptBytes);

const clone = (value) => structuredClone(value);
const bytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');

const sourceEvidenceProjectionCases = [
  ['repository', (candidate) => { candidate.sourceEvidence.repository = 'forged/repository'; }, /preflight\.sourceEvidence\.repository/],
  ['repository ID', (candidate) => { candidate.sourceEvidence.repositoryId += 1; }, /preflight\.sourceEvidence\.repositoryId/],
  ['source revision', (candidate) => { candidate.sourceEvidence.sourceRevision = '1'.repeat(40); }, /preflight\.sourceEvidence\.sourceRevision/],
  ['source ref', (candidate) => { candidate.sourceEvidence.sourceRef = 'refs/heads/forged'; }, /preflight\.sourceEvidence\.sourceRef/],
  ['workflow path', (candidate) => { candidate.sourceEvidence.workflow.path = '.github/workflows/forged.yml'; }, /preflight\.sourceEvidence\.workflow\.path/],
  ['workflow ID', (candidate) => { candidate.sourceEvidence.workflow.id += 1; }, /preflight\.sourceEvidence\.workflow\.id/],
  ['workflow event', (candidate) => { candidate.sourceEvidence.workflow.event = 'push'; }, /preflight\.sourceEvidence\.workflow\.event/],
  ['replica clone', (candidate) => { candidate.sourceEvidence.replicas[1] = clone(candidate.sourceEvidence.replicas[0]); }, /preflight\.sourceEvidence\.replicas\[1\]\.runId/],
  ['replica attempt', (candidate) => { candidate.sourceEvidence.replicas[0].runAttempt = 2; }, /preflight\.sourceEvidence\.replicas\[0\]\.runAttempt/],
  ['replica conclusion', (candidate) => { candidate.sourceEvidence.replicas[1].conclusion = 'failure'; }, /preflight\.sourceEvidence\.replicas\[1\]\.conclusion/],
  ['swapped model artifacts', (candidate) => {
    const artifacts = candidate.sourceEvidence.replicas[0].artifacts;
    [artifacts.mattersim, artifacts.mace] = [clone(artifacts.mace), clone(artifacts.mattersim)];
  }, /preflight\.sourceEvidence\.replicas\[0\]\.artifacts\.mattersim\.id/],
  ['runtime-lock path', (candidate) => { candidate.sourceEvidence.evidenceChain.runtimeLock.path = 'forged-runtime-lock.json'; }, /preflight\.sourceEvidence\.evidenceChain\.runtimeLock\.path/],
  ['runtime-lock size', (candidate) => { candidate.sourceEvidence.evidenceChain.runtimeLock.sizeBytes += 1; }, /preflight\.sourceEvidence\.evidenceChain\.runtimeLock\.sizeBytes/],
  ['runtime-lock raw digest', (candidate) => { candidate.sourceEvidence.evidenceChain.runtimeLock.rawDigest = `sha256:${'0'.repeat(64)}`; }, /preflight\.sourceEvidence\.evidenceChain\.runtimeLock\.rawDigest/],
  ['signed-receipt path', (candidate) => { candidate.sourceEvidence.evidenceChain.signedReceipt.path = 'forged-receipt.json'; }, /preflight\.sourceEvidence\.evidenceChain\.signedReceipt\.path/],
  ['signed-receipt status', (candidate) => { candidate.sourceEvidence.evidenceChain.signedReceipt.status = 'forged'; }, /preflight\.sourceEvidence\.evidenceChain\.signedReceipt\.status/],
  ['signed-receipt semantic digest', (candidate) => { candidate.sourceEvidence.evidenceChain.signedReceipt.semanticDigest = `sha256:${'0'.repeat(64)}`; }, /preflight\.sourceEvidence\.evidenceChain\.signedReceipt\.semanticDigest/],
  ['attestation path', (candidate) => { candidate.sourceEvidence.evidenceChain.attestation.path = 'forged-attestation.jsonl'; }, /preflight\.sourceEvidence\.evidenceChain\.attestation\.path/],
  ['attestation subject name', (candidate) => { candidate.sourceEvidence.evidenceChain.attestation.subjectName = 'forged.json'; }, /preflight\.sourceEvidence\.evidenceChain\.attestation\.subjectName/],
  ['attestation subject digest', (candidate) => { candidate.sourceEvidence.evidenceChain.attestation.subjectDigest = `sha256:${'0'.repeat(64)}`; }, /preflight\.sourceEvidence\.evidenceChain\.attestation\.subjectDigest/],
];

for (const index of [0, 1]) {
  for (const model of ['mattersim', 'mace']) {
    for (const [field, replacement] of [
      ['id', (value) => value + 1],
      ['name', (value) => `${value}-forged`],
      ['archiveBytes', (value) => value + 1],
      ['archiveDigest', () => `sha256:${'0'.repeat(64)}`],
      ['expiresAt', () => '2026-09-07T00:00:00Z'],
    ]) {
      sourceEvidenceProjectionCases.push([
        `replica ${index} ${model} ${field}`,
        (candidate) => {
          const artifact = candidate.sourceEvidence.replicas[index].artifacts[model];
          artifact[field] = replacement(artifact[field]);
        },
        new RegExp(`preflight\\.sourceEvidence\\.replicas\\[${index}\\]\\.artifacts\\.${model}\\.${field}`),
      ]);
    }
  }
}

const schemaMutationCases = [
  ['energy-error unit', (candidate) => { candidate.quantityContract.energyError.unit = 'eV'; }, /preflight\.quantityContract\.energyError\.unit/],
  ['40 invariance cases', (candidate) => { candidate.preregisteredValidation.invariancePerModel.requiredCases.value = 39; }, /preflight\.validation\.invariance\.requiredCases/],
  ['89 force cases', (candidate) => { candidate.preregisteredValidation.forceFiniteDifferencePerModel.requiredCases.value = 88; }, /preflight\.validation\.forceFiniteDifference\.requiredCases/],
  ['force finite-difference steps', (candidate) => { candidate.preregisteredValidation.forceFiniteDifferencePerModel.steps.values = [0.02, 0.01]; }, /preflight\.validation\.forceFiniteDifference\.steps/],
  ['force finite-difference method', (candidate) => { candidate.preregisteredValidation.forceFiniteDifferencePerModel.method = 'central-difference'; }, /preflight\.validation\.forceFiniteDifference\.method/],
  ['force absolute tolerance', (candidate) => { candidate.preregisteredValidation.forceFiniteDifferencePerModel.absoluteTolerance.value = 0.03; }, /preflight\.validation\.forceFiniteDifference\.absoluteTolerance/],
  ['force relative tolerance', (candidate) => { candidate.preregisteredValidation.forceFiniteDifferencePerModel.relativeTolerance.value = 0.02; }, /preflight\.validation\.forceFiniteDifference\.relativeTolerance/],
  ['60 stress cases', (candidate) => { candidate.preregisteredValidation.stressFiniteDifferencePerModel.requiredCases.value = 59; }, /preflight\.validation\.stressFiniteDifference\.requiredCases/],
  ['stress finite-difference steps', (candidate) => { candidate.preregisteredValidation.stressFiniteDifferencePerModel.strainSteps.values = [0.004, 0.002]; }, /preflight\.validation\.stressFiniteDifference\.strainSteps/],
  ['stress finite-difference method', (candidate) => { candidate.preregisteredValidation.stressFiniteDifferencePerModel.method = 'central-difference'; }, /preflight\.validation\.stressFiniteDifference\.method/],
  ['stress absolute tolerance', (candidate) => { candidate.preregisteredValidation.stressFiniteDifferencePerModel.absoluteTolerance.value = 0.006; }, /preflight\.validation\.stressFiniteDifference\.absoluteTolerance/],
  ['stress relative tolerance', (candidate) => { candidate.preregisteredValidation.stressFiniteDifferencePerModel.relativeTolerance.value = 0.03; }, /preflight\.validation\.stressFiniteDifference\.relativeTolerance/],
  ['post-hoc stress sign selection', (candidate) => { candidate.preregisteredValidation.stressFiniteDifferencePerModel.postHocSignSelectionAllowed = true; }, /preflight\.validation\.stressFiniteDifference\.postHocSignSelectionAllowed/],
  ['four container executions', (candidate) => { candidate.candidateTopology.requiredContainerExecutionsTotal = 3; }, /preflight\.topology\.requiredContainerExecutionsTotal/],
  ['authoritative prediction total', (candidate) => { candidate.candidateTopology.authoritativePredictionRecordsTotal = 693; }, /preflight\.topology\.authoritativePredictionRecordsTotal/],
  ['repeat-validation prediction total', (candidate) => { candidate.candidateTopology.repeatValidationPredictionRecordsTotal = 693; }, /preflight\.topology\.repeatValidationPredictionRecordsTotal/],
  ['container read-denial probe', (candidate) => { candidate.candidateTopology.labelAccess.containerReadDenialProbeRequired = false; }, /preflight\.topology\.labelAccess\.containerReadDenialProbeRequired/],
  ['exact mount/environment allowlist', (candidate) => { candidate.candidateTopology.labelAccess.exactMountAndEnvironmentAllowlistRequired = false; }, /preflight\.topology\.labelAccess\.exactMountAndEnvironmentAllowlistRequired/],
  ['source artifact identity', (candidate) => { candidate.sourceEvidence.replicas[0].artifacts.mattersim.id += 1; }, /preflight\.sourceEvidence\.replicas\[0\]\.artifacts\.mattersim\.id/],
  ['signed evidence-chain digest', (candidate) => { candidate.sourceEvidence.evidenceChain.signedReceipt.rawDigest = `sha256:${'0'.repeat(64)}`; }, /preflight\.sourceEvidence\.evidenceChain\.signedReceipt\.rawDigest/],
  ['model-slot swap', (candidate) => { candidate.trackedRuntimeInputs.mattersim = clone(candidate.trackedRuntimeInputs.mace); }, /preflight\.trackedRuntimeInputs\.mattersim/],
  ['dispatch-gate rename', (candidate) => { delete candidate.dispatchGates.labelIsolationCanaryPassed; candidate.dispatchGates.renamedGate = false; }, /preflight\.dispatchGates(?:\.labelIsolationCanaryPassed)?/],
  ['claim rename', (candidate) => { delete candidate.claims.dataLeakageCertified; candidate.claims.renamedClaim = false; }, /preflight\.claims(?:\.dataLeakageCertified)?/],
  ['forbidden-class rewrite', (candidate) => { candidate.candidateTopology.publication.forbiddenClasses[0] = 'safe-data'; }, /preflight\.topology\.publication\.forbiddenClasses/],
];

describe('full-candidate shared-host execution preflight', () => {
  it('validates the checked-in preflight, schema, and four byte-frozen runtime inputs', async () => {
    const result = await validateCheckedInFullCandidateExecutionPreflight({ root });
    expect(result.valid, result.failures.join('\n')).toBe(true);
    expect(result.rawDigest).toBe(
      'sha256:886cf305df9418386c3087bf066cd8e9b83b316c127eaa41965c606b82f602aa',
    );
    expect(result.semanticDigest).toBe(
      'sha256:463fd9848dbde9f124d4a45ed0341271fac1102ee5ce72597191de5c8b930139',
    );
    expect(preflight.trackedRuntimeInputs).toEqual(FROZEN_FULL_CANDIDATE_RUNTIME_INPUTS);
  });

  it('keeps this artifact explicitly non-executable and claim-negative', () => {
    expect(preflight.status).toBe('frozen-topology-and-runtime-inputs-not-executable');
    expect(preflight.dispatchGates.dispatchEligible).toBe(false);
    expect(Object.values(preflight.dispatchGates).every((value) => value === false)).toBe(true);
    expect(Object.values(preflight.claims).every((value) => value === false)).toBe(true);
    expect(preflight.candidateTopology.publication).toMatchObject({
      enabled: false,
      allowedArtifactPaths: [],
      aggregateReceiptRightsDispositionRequired: true,
      runtimeRedistributionAllowed: false,
    });
  });

  it.each([
    ['shared host hidden', (candidate) => { candidate.candidateTopology.sharedHost = false; }, /preflight\.topology\.sharedHost/],
    ['independent job claim', (candidate) => { candidate.candidateTopology.independentJobClaimAllowed = true; }, /preflight\.topology\.independentJobClaimAllowed/],
    ['independent hardware claim', (candidate) => { candidate.candidateTopology.independentHardwareClaimAllowed = true; }, /preflight\.topology\.independentHardwareClaimAllowed/],
    ['independent replica claim', (candidate) => { candidate.candidateTopology.independentReplicaClaimAllowed = true; }, /preflight\.topology\.independentReplicaClaimAllowed/],
    ['model label access', (candidate) => { candidate.candidateTopology.labelAccess.modelContainers = true; }, /preflight\.topology\.labelAccess\.modelContainers/],
    ['label mount', (candidate) => { candidate.candidateTopology.containerIsolation.referenceLabelsMounted = true; }, /preflight\.topology\.containerIsolation\.referenceLabelsMounted/],
    ['network enabled', (candidate) => { candidate.candidateTopology.containerIsolation.network = 'bridge'; }, /preflight\.topology\.containerIsolation\.network/],
    ['shared writable mount', (candidate) => { candidate.candidateTopology.containerIsolation.sharedWritableMountBetweenModelLanes = true; }, /preflight\.topology\.containerIsolation\.sharedWritableMountBetweenModelLanes/],
    ['missing repeat container', (candidate) => { candidate.candidateTopology.containerLanes[0].freshContainerExecutionsRequired = 1; }, /preflight\.topology\.containerLanes/],
    ['reused container execution ID allowed', (candidate) => { candidate.candidateTopology.containerLanes[1].distinctContainerExecutionIdsRequired = false; }, /preflight\.topology\.containerLanes/],
    ['environment self-report trusted', (candidate) => { candidate.candidateTopology.centralVerification.trustPredictionEnvironmentSelfReport = true; }, /preflight\.topology\.centralVerification\.trustPredictionEnvironmentSelfReport/],
    ['publication enabled', (candidate) => { candidate.candidateTopology.publication.enabled = true; }, /preflight\.topology\.publication\.enabled/],
    ['artifact path allowlisted', (candidate) => { candidate.candidateTopology.publication.allowedArtifactPaths = ['predictions.jsonl']; }, /preflight\.topology\.publication\.allowedArtifactPaths/],
    ['dispatch enabled', (candidate) => { candidate.dispatchGates.dispatchEligible = true; }, /preflight\.dispatchGates\.dispatchEligible/],
    ['full run claimed', (candidate) => { candidate.claims.fullInferenceRun = true; }, /preflight\.claims\.fullInferenceRun/],
    ['reproduction claimed', (candidate) => { candidate.claims.reproduced = true; }, /preflight\.claims\.reproduced/],
    ['stress tolerance falsely closed', (candidate) => {
      candidate.preregisteredValidation.stressSymmetryTolerance.status = 'resolved';
      candidate.preregisteredValidation.stressSymmetryTolerance.dispatchBlockedUntilUnified = false;
    }, /preflight\.validation\.stressSymmetryTolerance\.(?:status|dispatchBlockedUntilUnified)/],
  ])('rejects %s mutation at its expected policy path', async (
    _label,
    mutate,
    expectedFailure,
  ) => {
    const candidate = clone(preflight);
    mutate(candidate);
    const result = await validateFullCandidateExecutionPreflightRepository(bytes(candidate), {
      root,
      enforceCheckedInBytes: false,
    });
    expect(result.failures.join('\n')).toMatch(expectedFailure);
  });

  it('rejects swapped or cloned model lanes', () => {
    const swapped = clone(preflight);
    swapped.candidateTopology.containerLanes.reverse();
    expect(validateFullCandidateExecutionPreflightSemantics(swapped).join('\n'))
      .toMatch(/containerLanes|exact frozen contract/);

    const cloned = clone(preflight);
    cloned.candidateTopology.containerLanes[1] = clone(
      cloned.candidateTopology.containerLanes[0],
    );
    expect(validateFullCandidateExecutionPreflightSemantics(cloned).join('\n'))
      .toMatch(/containerLanes|exact frozen contract/);
  });

  it.each(sourceEvidenceProjectionCases)(
    'rejects %s with a field-specific signed-source projection failure',
    (_label, mutate, expectedFailure) => {
      const candidate = clone(preflight);
      mutate(candidate);
      expect(validateFullCandidateExecutionPreflightSchema(candidate, schema)).not.toEqual([]);
      expect(validateFullCandidateSourceEvidenceProjection(
        candidate,
        runtimeLock,
        signedReceipt,
      ).join('\n')).toMatch(expectedFailure);
    },
  );

  it('rejects a synchronously forged bootstrap SHA through per-replica receipt projection', () => {
    const candidate = clone(preflight);
    const forgedReceipt = clone(signedReceipt);
    const verifierRevision = runtimeLock.freezeEvidence.attestation.sourceRevision;
    candidate.sourceEvidence.sourceRevision = verifierRevision;
    forgedReceipt.bootstrapWorkflow.sourceRevision = verifierRevision;
    expect(validateFullCandidateSourceEvidenceProjection(
      candidate,
      runtimeLock,
      forgedReceipt,
    ).join('\n')).toMatch(/replicas\[0\]\.sourceRevision\.receiptProjection/);
  });

  it('rejects a signed-receipt API/download digest fork before projection', () => {
    const forgedReceipt = clone(signedReceipt);
    forgedReceipt.replicas[0].artifacts[0].apiDigest = `sha256:${'0'.repeat(64)}`;
    expect(validateFullCandidateSourceEvidenceProjection(
      preflight,
      runtimeLock,
      forgedReceipt,
    ).join('\n')).toMatch(/replicas\[0\]\.artifacts\.mattersim\.receiptApiDownloadDigest/);
  });

  it('rejects byte changes in every tracked lock and runtime manifest', async () => {
    for (const binding of Object.values(FROZEN_FULL_CANDIDATE_RUNTIME_INPUTS)) {
      for (const file of [binding.dependencyLock, binding.runtimeInputManifest]) {
        const original = await readFile(path.join(root, file.path));
        const changed = Buffer.from(original);
        changed[Math.floor(changed.length / 2)] ^= 1;
        const result = await validateFullCandidateExecutionPreflightRepository(preflightBytes, {
          root,
          fileOverrides: { [file.path]: changed },
        });
        expect(result.failures.join('\n')).toMatch(/SHA-256 differs|invalid or duplicate-member JSON/);
      }
    }
  });

  it('rejects runtime closure and policy drift even when repository bytes are overridden', async () => {
    const binding = FROZEN_FULL_CANDIDATE_RUNTIME_INPUTS.mace;
    const manifest = JSON.parse(await readFile(path.join(root, binding.runtimeInputManifest.path)));
    manifest.policy.runtime.network = 'bridge';
    const result = await validateFullCandidateExecutionPreflightRepository(preflightBytes, {
      root,
      fileOverrides: { [binding.runtimeInputManifest.path]: bytes(manifest) },
    });
    expect(result.failures.join('\n')).toMatch(/SHA-256 differs|runtimePolicy/);
  });

  it.each([
    ['runtime lock', runtimeLockPath, () => {
      const changed = clone(runtimeLock);
      changed.state = 'forged-state';
      return bytes(changed);
    }, /sourceEvidence\.evidenceChain\.runtimeLock\.rawDigest/],
    ['signed receipt', signedReceiptPath, () => Buffer.from(
      signedReceiptBytes.toString('utf8').replace(
        'verified-stable-input-agreement',
        'xerified-stable-input-agreement',
      ),
      'utf8',
    ), /sourceEvidence\.evidenceChain\.signedReceipt\.rawDigest/],
    ['attestation', attestationPath, () => Buffer.from(
      attestationBytes.toString('utf8').replace('application/vnd.dev.sigstore.bundle.v0.3+json', 'application/vnd.dev.sigstore.bundle.v0.4+json'),
      'utf8',
    ), /sourceEvidence\.evidenceChain\.attestation\.rawDigest/],
  ])('rejects a byte change in the %s evidence-chain file', async (
    _label,
    file,
    mutateBytes,
    expectedFailure,
  ) => {
    const result = await validateFullCandidateExecutionPreflightRepository(preflightBytes, {
      root,
      fileOverrides: { [file]: mutateBytes() },
    });
    expect(result.failures.join('\n')).toMatch(expectedFailure);
  });

  it.each(schemaMutationCases)('schema and field policy reject %s', async (
    _label,
    mutate,
    expectedFailure,
  ) => {
    const candidate = clone(preflight);
    mutate(candidate);
    expect(validateFullCandidateExecutionPreflightSchema(candidate, schema)).not.toEqual([]);
    const result = await validateFullCandidateExecutionPreflightRepository(bytes(candidate), {
      root,
      enforceCheckedInBytes: false,
    });
    expect(result.failures.join('\n')).toMatch(expectedFailure);
  });

  it('rejects permissive schema drift through the bound schema digest', async () => {
    expect(validateFullCandidateExecutionPreflightSchema(preflight, schema)).toEqual([]);
    const permissive = clone(schema);
    permissive.properties.candidateTopology.properties.sharedHost = { type: 'boolean' };
    expect(validateFullCandidateExecutionPreflightSchema(
      { ...preflight, candidateTopology: { ...preflight.candidateTopology, sharedHost: false } },
      permissive,
    )).toEqual([]);
    const repositoryResult = await validateFullCandidateExecutionPreflightRepository(
      preflightBytes,
      {
        root,
        fileOverrides: {
          [FULL_CANDIDATE_EXECUTION_PREFLIGHT_SCHEMA_PATH]: bytes(permissive),
        },
      },
    );
    expect(repositoryResult.failures.join('\n')).toMatch(/schema\.rawDigest/);
  });

  it('rejects duplicate JSON members before semantic or schema validation', () => {
    const duplicated = Buffer.from(
      preflightBytes.toString('utf8').replace(
        '"schemaVersion": "tf.atomistic-full-candidate-execution-preflight/0.1",',
        '"schemaVersion": "forged",\n  "schemaVersion": "tf.atomistic-full-candidate-execution-preflight/0.1",',
      ),
      'utf8',
    );
    expect(inspectFullCandidateExecutionPreflightBytes(duplicated, {
      enforceCheckedInBytes: false,
    }).failures.join('\n')).toMatch(/duplicate-member JSON/);
  });

  it('executes the v0.2 same-job rejection instead of reinterpreting its contract', () => {
    const revision = 'a'.repeat(40);
    const sharedProducer = {
      repositoryId: 1349498456,
      revision,
      workflowRunId: 1,
      runAttempt: 1,
      jobId: 7,
    };
    const receipt = {
      source: { repositoryId: 1349498456, revision },
      partitions: [
        {
          partitionId: 'mattersim-full-000',
          model: 'mattersim',
          modelId: 'mattersim-v1.0.0-5m',
          producer: sharedProducer,
        },
        {
          partitionId: 'mace-full-000',
          model: 'mace',
          modelId: 'mace-mpa-0-medium',
          producer: { ...sharedProducer },
        },
      ],
      verification: { mixedRunAttemptsObserved: false },
    };
    expect(validateFullCandidateReceiptEnvelope(receipt, legacyReceiptSchemaBytes).errors.join('\n'))
      .toMatch(/producer job IDs are not distinct/);
  });
});
