import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  FULL_CANDIDATE_PLAN_PATH,
  FULL_CANDIDATE_PLAN_RAW_DIGEST,
} from './full-candidate-plan-policy.mjs';
import {
  FULL_CANDIDATE_PRODUCER_WORKFLOW,
} from './full-candidate-github-evidence-policy.mjs';
import {
  canonicalJson,
  EXPECTED_RUNTIME_LOCK_RAW_DIGEST,
  EXPECTED_RUNTIME_LOCK_SEMANTIC_DIGEST,
  inspectRuntimeLockBytes,
  parseJsonRejectingDuplicateMembers,
  RUNTIME_LOCK_PATH,
  validateRuntimeLockSemantics,
} from './runtime-lock-policy.mjs';
import {
  EXPECTED_RUNTIME_FREEZE_EVIDENCE,
  inspectRuntimeFreezeReceiptBytes,
  parseSingleBundle,
  RUNTIME_FREEZE_ATTESTATION_PATH,
  RUNTIME_FREEZE_RECEIPT_PATH,
  validateRawBundleProjection,
  validateRuntimeFreezeProjection,
} from './runtime-freeze-evidence-policy.mjs';

export const FULL_CANDIDATE_EXECUTION_PREFLIGHT_PATH =
  'evaluation/atomistic/full-candidate-execution-preflight.json';
export const FULL_CANDIDATE_EXECUTION_PREFLIGHT_SCHEMA_PATH =
  'schemas/atomistic-full-candidate-execution-preflight.schema.json';
export const FULL_CANDIDATE_EXECUTION_PREFLIGHT_RAW_DIGEST =
  'sha256:886cf305df9418386c3087bf066cd8e9b83b316c127eaa41965c606b82f602aa';
export const FULL_CANDIDATE_EXECUTION_PREFLIGHT_SEMANTIC_DIGEST =
  'sha256:463fd9848dbde9f124d4a45ed0341271fac1102ee5ce72597191de5c8b930139';
export const FULL_CANDIDATE_EXECUTION_PREFLIGHT_SCHEMA_RAW_DIGEST =
  'sha256:43edb990b6a56f4f123c93cf94e71a781be8588c1ada30696b0dd32f33efef55';

export const FROZEN_FULL_CANDIDATE_RUNTIME_INPUTS = deepFreeze({
  mattersim: {
    modelId: 'mattersim-v1.0.0-5m',
    dependencyLock: {
      path: 'atomistic/locks/mattersim.requirements.lock',
      sizeBytes: 16_233,
      sha256: 'sha256:9c990909d1307bb32608d31b9ed217d2368c28e2048f6dec39e8dc4a2b63642b',
    },
    runtimeInputManifest: {
      path: 'evaluation/atomistic/runtime-inputs/mattersim.runtime-inputs.json',
      schemaVersion: 'tf.atomistic-runtime-inputs/0.2',
      sizeBytes: 157_190,
      sha256: 'sha256:203acc5ec09c2e76a819ff384573c2c0aca1316f90c53f2e735c98e9daab5c53',
    },
    wheelClosure: {
      platform: 'linux/amd64',
      python: '3.12.13',
      wheelCount: 157,
      wheelBytes: 675_408_593,
      dependencyGraphDigest: 'sha256:089b3a59daaf10fef45086ea5e8d63a7bf143d2d99aefef6cb7451e34dc50da0',
      installedPathDigest: 'sha256:cf12e368061c2420f802592a8b732e4f510e15129144c4a56161766a0e5bb321',
      runtimeInstalledPathDigest: 'sha256:3c393f19d748b945a77683d5e722f3a3b49d49415652ba4c78380bc1c175d873',
    },
    byteIdenticalAcrossAcceptedReplicas: true,
  },
  mace: {
    modelId: 'mace-mpa-0-medium',
    dependencyLock: {
      path: 'atomistic/locks/mace.requirements.lock',
      sizeBytes: 4_612,
      sha256: 'sha256:ae4b21b6f6d8ad98edcf2d5e0d938cd563379f494cce0b4aaa2e987332147e33',
    },
    runtimeInputManifest: {
      path: 'evaluation/atomistic/runtime-inputs/mace.runtime-inputs.json',
      schemaVersion: 'tf.atomistic-runtime-inputs/0.2',
      sizeBytes: 55_251,
      sha256: 'sha256:6bb7f79c5380bb54b0d5ff972c3f22cc27623d131291d3a7c1b2c4efff826f47',
    },
    wheelClosure: {
      platform: 'linux/amd64',
      python: '3.12.13',
      wheelCount: 44,
      wheelBytes: 294_237_409,
      dependencyGraphDigest: 'sha256:27045fc8bfc4bf841b6164f1360c71450753329db1aa8e61e22cf0963f82246b',
      installedPathDigest: 'sha256:e880ee162447820b350b0056700656f903bb6ff782bea9b15fd0be24bc08e290',
      runtimeInstalledPathDigest: 'sha256:cc7c3b47516ab8d80d96243c14a648f39bc89ce9ae3b8ad894868fab2c9029e5',
    },
    byteIdenticalAcrossAcceptedReplicas: true,
  },
});

const EXPECTED_RUN_IDS = Object.freeze([33_242_996_794, 33_242_999_376]);
const EXPECTED_SOURCE_REVISION = '687755a5835b92b632fc116e9b73ab11c1eb6cb5';
const EXPECTED_RUNTIME_SOURCE_REVISION = 'f861b3e30572f1db366554a2e330d5d6c78bdb56';
const EXPECTED_SCIENTIFIC_PLAN_DIGEST =
  'sha256:d3a58524029b51c598d00a7bb9f60b6479a9973a0f9907cbf94a31e61bf1c9c2';
const EXPECTED_RUNNER_DIGEST =
  'sha256:d6e83640f15926088c116312c27605570f9e9c8ba4e9a9988ef5bf4d3a974ed4';
const EXPECTED_SCIENTIFIC_PLAN_PATH = 'evaluation/atomistic/reproduction-plan.json';
const EXPECTED_RUNTIME_LOCK_SIZE_BYTES = 12_558;
const EXPECTED_RUNTIME_LOCK_STATE = 'bootstrap-runtime-frozen-not-reproduced';

const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

export function inspectFullCandidateExecutionPreflightBytes(
  bytes,
  { enforceCheckedInBytes = true } = {},
) {
  const buffer = toBuffer(bytes);
  const rawDigest = sha256(buffer);
  const failures = [];
  let preflight = null;
  let semanticDigest = null;
  try {
    preflight = parseJsonRejectingDuplicateMembers(buffer);
    semanticDigest = sha256(Buffer.from(canonicalJson(preflight), 'utf8'));
  } catch (error) {
    failures.push(`full-candidate-execution-preflight.raw: invalid or duplicate-member JSON (${message(error)})`);
  }
  if (enforceCheckedInBytes && rawDigest !== FULL_CANDIDATE_EXECUTION_PREFLIGHT_RAW_DIGEST) {
    failures.push('full-candidate-execution-preflight.raw: frozen byte digest mismatch');
  }
  return { preflight, rawDigest, semanticDigest, failures };
}

export function validateFullCandidateExecutionPreflightSchema(preflight, schema) {
  const failures = [];
  try {
    const ajv = new Ajv2020({
      allErrors: true,
      strict: true,
      validateFormats: false,
      validateSchema: true,
    });
    const validate = ajv.compile(schema);
    if (!validate(preflight)) {
      failures.push(`full-candidate-execution-preflight.schema: ${JSON.stringify(validate.errors)}`);
    }
  } catch (error) {
    failures.push(`full-candidate-execution-preflight.schema: strict AJV compilation failed (${message(error)})`);
  }
  return failures;
}

export function validateFullCandidateExecutionPreflightSemantics(preflight) {
  const failures = [];
  if (!isRecord(preflight)) {
    return ['full-candidate-execution-preflight.semantic: root must be an object'];
  }
  let semanticDigest = null;
  try {
    semanticDigest = sha256(Buffer.from(canonicalJson(preflight), 'utf8'));
  } catch (error) {
    failures.push(`full-candidate-execution-preflight.semantic: canonicalization failed (${message(error)})`);
  }
  if (semanticDigest !== FULL_CANDIDATE_EXECUTION_PREFLIGHT_SEMANTIC_DIGEST) {
    failures.push('full-candidate-execution-preflight.semantic: exact frozen contract digest mismatch');
  }
  compare(failures, 'preflight.schemaVersion', preflight.schemaVersion,
    'tf.atomistic-full-candidate-execution-preflight/0.1');
  compare(failures, 'preflight.status', preflight.status,
    'frozen-topology-and-runtime-inputs-not-executable');
  compare(failures, 'preflight.predecessor.path', preflight.predecessor?.path,
    FULL_CANDIDATE_PLAN_PATH);
  compare(failures, 'preflight.predecessor.rawDigest', preflight.predecessor?.rawDigest,
    FULL_CANDIDATE_PLAN_RAW_DIGEST);
  compare(failures, 'preflight.trackedRuntimeInputs', preflight.trackedRuntimeInputs,
    FROZEN_FULL_CANDIDATE_RUNTIME_INPUTS);
  for (const model of ['mattersim', 'mace']) {
    compare(failures, `preflight.trackedRuntimeInputs.${model}`,
      preflight.trackedRuntimeInputs?.[model], FROZEN_FULL_CANDIDATE_RUNTIME_INPUTS[model]);
  }

  const topology = preflight.candidateTopology;
  compare(failures, 'preflight.topology.profile', topology?.profile,
    'single-shared-host-sequential-isolated-model-lanes-central-verifier/v1');
  compare(failures, 'preflight.topology.sharedHost', topology?.sharedHost, true);
  compare(failures, 'preflight.topology.producerJobCount', topology?.producerJobCount, 1);
  compare(failures, 'preflight.topology.requiredContainerExecutionsTotal',
    topology?.requiredContainerExecutionsTotal, 4);
  compare(failures, 'preflight.topology.authoritativePredictionRecordsTotal',
    topology?.authoritativePredictionRecordsTotal, 1_386);
  compare(failures, 'preflight.topology.repeatValidationPredictionRecordsTotal',
    topology?.repeatValidationPredictionRecordsTotal, 1_386);
  for (const key of [
    'independentJobClaimAllowed',
    'independentHardwareClaimAllowed',
    'independentReplicaClaimAllowed',
  ]) compare(failures, `preflight.topology.${key}`, topology?.[key], false);
  compare(failures, 'preflight.topology.containerLanes', topology?.containerLanes, [
    {
      order: 0,
      model: 'mattersim',
      modelId: 'mattersim-v1.0.0-5m',
      freshContainerExecutionsRequired: 2,
      recordsPerContainerExecution: 693,
      authoritativeExecutionOrdinal: 0,
      repeatValidationExecutionOrdinal: 1,
      distinctContainerExecutionIdsRequired: true,
    },
    {
      order: 1,
      model: 'mace',
      modelId: 'mace-mpa-0-medium',
      freshContainerExecutionsRequired: 2,
      recordsPerContainerExecution: 693,
      authoritativeExecutionOrdinal: 0,
      repeatValidationExecutionOrdinal: 1,
      distinctContainerExecutionIdsRequired: true,
    },
  ]);
  compare(failures, 'preflight.topology.containerIsolation.network',
    topology?.containerIsolation?.network, 'none');
  compare(failures, 'preflight.topology.containerIsolation.referenceLabelsMounted',
    topology?.containerIsolation?.referenceLabelsMounted, false);
  compare(failures, 'preflight.topology.containerIsolation.sharedWritableMountBetweenModelLanes',
    topology?.containerIsolation?.sharedWritableMountBetweenModelLanes, false);
  compare(failures, 'preflight.topology.labelAccess.modelContainers',
    topology?.labelAccess?.modelContainers, false);
  compare(failures, 'preflight.topology.labelAccess.containerReadDenialProbeRequired',
    topology?.labelAccess?.containerReadDenialProbeRequired, true);
  compare(failures, 'preflight.topology.labelAccess.exactMountAndEnvironmentAllowlistRequired',
    topology?.labelAccess?.exactMountAndEnvironmentAllowlistRequired, true);
  compare(failures,
    'preflight.topology.labelAccess.centralVerifierStartsAfterAllFourContainerExecutionsExit',
    topology?.labelAccess?.centralVerifierStartsAfterAllFourContainerExecutionsExit, true);
  compare(failures, 'preflight.topology.centralVerification.trustPredictionEnvironmentSelfReport',
    topology?.centralVerification?.trustPredictionEnvironmentSelfReport, false);
  compare(failures, 'preflight.topology.centralVerification.offlineRecomputationAfterRunnerDisposalAvailable',
    topology?.centralVerification?.offlineRecomputationAfterRunnerDisposalAvailable, false);
  compare(failures, 'preflight.topology.publication.enabled', topology?.publication?.enabled, false);
  compare(failures, 'preflight.topology.publication.allowedArtifactPaths',
    topology?.publication?.allowedArtifactPaths, []);
  compare(failures, 'preflight.topology.publication.forbiddenClasses',
    topology?.publication?.forbiddenClasses, [
      'raw-dataset',
      'structure-bundle',
      'atomic-number-array',
      'reference-label',
      'per-record-prediction',
      'per-record-latency',
      'checkpoint',
      'runtime-container',
      'unsanitized-traceback',
    ]);

  const validation = preflight.preregisteredValidation;
  compare(failures, 'preflight.quantityContract.energyError.unit',
    preflight.quantityContract?.energyError?.unit, 'eV/atom');
  compare(failures, 'preflight.validation.invariance.requiredCases',
    validation?.invariancePerModel?.requiredCases?.value, 40);
  compare(failures, 'preflight.validation.forceFiniteDifference.requiredCases',
    validation?.forceFiniteDifferencePerModel?.requiredCases?.value, 89);
  compare(failures, 'preflight.validation.forceFiniteDifference.steps',
    validation?.forceFiniteDifferencePerModel?.steps?.values, [0.01, 0.005]);
  compare(failures, 'preflight.validation.forceFiniteDifference.method',
    validation?.forceFiniteDifferencePerModel?.method,
    'central-difference-with-Richardson-extrapolation');
  compare(failures, 'preflight.validation.forceFiniteDifference.absoluteTolerance',
    validation?.forceFiniteDifferencePerModel?.absoluteTolerance?.value, 0.02);
  compare(failures, 'preflight.validation.forceFiniteDifference.relativeTolerance',
    validation?.forceFiniteDifferencePerModel?.relativeTolerance?.value, 0.01);
  compare(failures, 'preflight.validation.stressFiniteDifference.requiredCases',
    validation?.stressFiniteDifferencePerModel?.requiredCases?.value, 60);
  compare(failures, 'preflight.validation.stressFiniteDifference.strainSteps',
    validation?.stressFiniteDifferencePerModel?.strainSteps?.values, [0.002, 0.001]);
  compare(failures, 'preflight.validation.stressFiniteDifference.method',
    validation?.stressFiniteDifferencePerModel?.method,
    'fixed-fractional-coordinates-engineering-shear-half-basis-central-difference-with-Richardson-extrapolation');
  compare(failures, 'preflight.validation.stressFiniteDifference.absoluteTolerance',
    validation?.stressFiniteDifferencePerModel?.absoluteTolerance?.value, 0.005);
  compare(failures, 'preflight.validation.stressFiniteDifference.relativeTolerance',
    validation?.stressFiniteDifferencePerModel?.relativeTolerance?.value, 0.02);
  compare(failures, 'preflight.validation.stressFiniteDifference.postHocSignSelectionAllowed',
    validation?.stressFiniteDifferencePerModel?.postHocSignSelectionAllowed, false);
  compare(failures, 'preflight.validation.stressSymmetryTolerance.status',
    validation?.stressSymmetryTolerance?.status,
    'unresolved-versioned-contract-required');
  compare(failures, 'preflight.validation.stressSymmetryTolerance.dispatchBlockedUntilUnified',
    validation?.stressSymmetryTolerance?.dispatchBlockedUntilUnified, true);

  const falseDispatchGates = isRecord(preflight.dispatchGates)
    && Object.keys(preflight.dispatchGates).length === 8
    && Object.values(preflight.dispatchGates).every((value) => value === false);
  if (!falseDispatchGates) failures.push('preflight.dispatchGates: every frozen gate must remain false');
  for (const key of [
    'vNextPlanReceiptAndProvenanceSchemasReviewed',
    'executableWorkflowAndObserverReviewed',
    'labelIsolationCanaryPassed',
    'allScientificValidationImplementationsPresent',
    'aggregateReceiptRightsDispositionRecorded',
    'ociManifestAndConfigTrustRootsAvailable',
    'firstMainSentinelSuccessForExecutableRevision',
    'dispatchEligible',
  ]) compare(failures, `preflight.dispatchGates.${key}`, preflight.dispatchGates?.[key], false);
  const falseClaims = isRecord(preflight.claims)
    && Object.keys(preflight.claims).length === 9
    && Object.values(preflight.claims).every((value) => value === false);
  if (!falseClaims) failures.push('preflight.claims: every claim must remain false');
  for (const key of [
    'fullInferenceRun',
    'claimEligible',
    'comparisonEligible',
    'promotionEligible',
    'reproductionEligible',
    'reproduced',
    'sota',
    'dataLeakageCertified',
    'industrialFitness',
  ]) compare(failures, `preflight.claims.${key}`, preflight.claims?.[key], false);
  rejectPositiveClaimLikeBooleans(preflight, failures);

  const replicas = preflight.sourceEvidence?.replicas;
  if (!Array.isArray(replicas) || replicas.length !== 2) {
    failures.push('preflight.sourceEvidence.replicas: exactly two accepted bootstrap replicas are required');
  } else {
    compare(failures, 'preflight.sourceEvidence.runIds', replicas.map(({ runId }) => runId),
      EXPECTED_RUN_IDS);
    if (!replicas.every(({ runAttempt, conclusion }) => runAttempt === 1 && conclusion === 'success')) {
      failures.push('preflight.sourceEvidence.replicas: only successful attempt-one observations are accepted');
    }
  }
  compare(failures, 'preflight.sourceEvidence.sourceRevision',
    preflight.sourceEvidence?.sourceRevision, EXPECTED_SOURCE_REVISION);
  return failures;
}

export function validateFullCandidateSourceEvidenceProjection(
  preflight,
  runtimeLock,
  receipt,
  {
    runtimeLockRawDigest = EXPECTED_RUNTIME_LOCK_RAW_DIGEST,
    runtimeLockSemanticDigest = EXPECTED_RUNTIME_LOCK_SEMANTIC_DIGEST,
    receiptRawDigest = EXPECTED_RUNTIME_FREEZE_EVIDENCE.sourceReceipt.rawDigest,
    receiptSemanticDigest = EXPECTED_RUNTIME_FREEZE_EVIDENCE.sourceReceipt.semanticDigest,
    attestationRawDigest = EXPECTED_RUNTIME_FREEZE_EVIDENCE.attestation.rawDigest,
    runtimeLockSizeBytes = EXPECTED_RUNTIME_LOCK_SIZE_BYTES,
    receiptSizeBytes = EXPECTED_RUNTIME_FREEZE_EVIDENCE.sourceReceipt.sizeBytes,
    attestationSizeBytes = EXPECTED_RUNTIME_FREEZE_EVIDENCE.attestation.sizeBytes,
  } = {},
) {
  const failures = [];
  const source = preflight?.sourceEvidence;
  if (!isRecord(source)) return ['preflight.sourceEvidence: exact signed-source projection is required'];

  compare(failures, 'preflight.sourceEvidence.classification', source.classification,
    'auditable-bootstrap-input-freeze-not-full-inference');
  compare(failures, 'preflight.sourceEvidence.repository', source.repository,
    receipt?.repository?.fullName);
  compare(failures, 'preflight.sourceEvidence.repositoryId', source.repositoryId,
    receipt?.repository?.id);
  compare(failures, 'preflight.sourceEvidence.sourceRevision', source.sourceRevision,
    receipt?.bootstrapWorkflow?.sourceRevision);
  compare(failures, 'preflight.sourceEvidence.sourceRef', source.sourceRef,
    receipt?.bootstrapWorkflow?.ref);
  compare(failures, 'preflight.sourceEvidence.workflow.path', source.workflow?.path,
    receipt?.bootstrapWorkflow?.path);
  compare(failures, 'preflight.sourceEvidence.workflow.id', source.workflow?.id,
    receipt?.bootstrapWorkflow?.id);
  compare(failures, 'preflight.sourceEvidence.workflow.event', source.workflow?.event,
    receipt?.bootstrapWorkflow?.event);

  const runtimeLockBinding = source.evidenceChain?.runtimeLock;
  for (const [key, expected] of Object.entries({
    path: RUNTIME_LOCK_PATH,
    schemaVersion: 'tf.atomistic-runtime-lock/0.3',
    sizeBytes: runtimeLockSizeBytes,
    rawDigest: runtimeLockRawDigest,
    semanticDigest: runtimeLockSemanticDigest,
    state: EXPECTED_RUNTIME_LOCK_STATE,
  })) compare(failures, `preflight.sourceEvidence.evidenceChain.runtimeLock.${key}`,
    runtimeLockBinding?.[key], expected);
  compare(failures, 'preflight.sourceEvidence.evidenceChain.runtimeLock.schemaVersionProjection',
    runtimeLockBinding?.schemaVersion, runtimeLock?.schemaVersion);
  compare(failures, 'preflight.sourceEvidence.evidenceChain.runtimeLock.stateProjection',
    runtimeLockBinding?.state, runtimeLock?.state);

  const expectedReceipt = EXPECTED_RUNTIME_FREEZE_EVIDENCE.sourceReceipt;
  const receiptBinding = source.evidenceChain?.signedReceipt;
  for (const [key, expected] of Object.entries({
    ...expectedReceipt,
    sizeBytes: receiptSizeBytes,
    rawDigest: receiptRawDigest,
    semanticDigest: receiptSemanticDigest,
  })) compare(failures, `preflight.sourceEvidence.evidenceChain.signedReceipt.${key}`,
    receiptBinding?.[key], expected);
  compare(failures, 'preflight.sourceEvidence.evidenceChain.signedReceipt.lockProjection',
    receiptBinding, runtimeLock?.freezeEvidence?.sourceReceipt);
  compare(failures, 'preflight.sourceEvidence.evidenceChain.signedReceipt.schemaVersionProjection',
    receiptBinding?.schemaVersion, receipt?.schemaVersion);
  compare(failures, 'preflight.sourceEvidence.evidenceChain.signedReceipt.statusProjection',
    receiptBinding?.status, receipt?.status);
  compare(failures, 'preflight.sourceEvidence.evidenceChain.signedReceipt.stableInputsCommitmentProjection',
    receiptBinding?.stableInputsCommitment, receipt?.stableInputs?.commitment);

  const expectedAttestation = EXPECTED_RUNTIME_FREEZE_EVIDENCE.attestation;
  const attestationBinding = source.evidenceChain?.attestation;
  const attestationProjection = {
    path: RUNTIME_FREEZE_ATTESTATION_PATH,
    mediaType: expectedAttestation.mediaType,
    sizeBytes: attestationSizeBytes,
    rawDigest: attestationRawDigest,
    subjectName: expectedAttestation.subjectName,
    subjectDigest: expectedAttestation.subjectDigest,
  };
  for (const [key, expected] of Object.entries(attestationProjection)) {
    compare(failures, `preflight.sourceEvidence.evidenceChain.attestation.${key}`,
      attestationBinding?.[key], expected);
  }
  for (const [key, lockKey] of Object.entries({
    path: 'bundlePath',
    mediaType: 'mediaType',
    sizeBytes: 'sizeBytes',
    rawDigest: 'rawDigest',
    subjectName: 'subjectName',
    subjectDigest: 'subjectDigest',
  })) compare(failures, `preflight.sourceEvidence.evidenceChain.attestation.${key}.lockProjection`,
    attestationBinding?.[key], runtimeLock?.freezeEvidence?.attestation?.[lockKey]);
  compare(failures, 'preflight.sourceEvidence.evidenceChain.attestation.receiptSubjectDigest',
    attestationBinding?.subjectDigest, receiptBinding?.rawDigest);

  const sourceReplicas = source.replicas;
  const receiptReplicas = receipt?.replicas;
  if (!Array.isArray(sourceReplicas) || sourceReplicas.length !== 2) {
    failures.push('preflight.sourceEvidence.replicas: exactly two source replicas are required');
    return uniqueSorted(failures);
  }
  if (!Array.isArray(receiptReplicas) || receiptReplicas.length !== 2) {
    failures.push('preflight.sourceEvidence.receipt.replicas: signed receipt must contain exactly two replicas');
    return uniqueSorted(failures);
  }
  const lockObservations = runtimeLock?.replication?.observations;
  if (!Array.isArray(lockObservations) || lockObservations.length !== 2) {
    failures.push('preflight.sourceEvidence.runtimeLock.observations: runtime lock must contain exactly two observations');
  }

  for (const [index, receiptReplica] of receiptReplicas.entries()) {
    const sourceReplica = sourceReplicas[index];
    const lockObservation = lockObservations?.[index];
    const prefix = `preflight.sourceEvidence.replicas[${index}]`;
    compare(failures, `${prefix}.runId`, sourceReplica?.runId, receiptReplica?.run?.id);
    compare(failures, `${prefix}.runAttempt`, sourceReplica?.runAttempt, receiptReplica?.run?.attempt);
    compare(failures, `${prefix}.conclusion`, sourceReplica?.conclusion,
      receiptReplica?.run?.conclusion);
    compare(failures, `${prefix}.runId.lockProjection`, sourceReplica?.runId,
      lockObservation?.runId);
    compare(failures, `${prefix}.runAttempt.lockProjection`, sourceReplica?.runAttempt,
      lockObservation?.runAttempt);
    compare(failures, `${prefix}.conclusion.lockProjection`, sourceReplica?.conclusion,
      lockObservation?.conclusion);
    compare(failures, `${prefix}.sourceRevision.receiptProjection`, source.sourceRevision,
      receiptReplica?.run?.headSha);
    compare(failures, `${prefix}.sourceRef.receiptProjection`, source.sourceRef,
      receiptReplica?.run?.ref);
    compare(failures, `${prefix}.sourceRevision.lockProjection`, source.sourceRevision,
      lockObservation?.repositoryRevision);
    compare(failures, `${prefix}.sourceRef.lockProjection`, source.sourceRef,
      lockObservation?.ref);
    compare(failures, `${prefix}.workflowId.lockProjection`, source.workflow?.id,
      lockObservation?.workflowId);

    const receiptArtifacts = receiptReplica?.artifacts;
    if (!Array.isArray(receiptArtifacts) || receiptArtifacts.length !== 2) {
      failures.push(`${prefix}.receiptArtifacts: exactly two model artifacts are required`);
      continue;
    }
    const artifactByModel = new Map();
    for (const artifact of receiptArtifacts) {
      if (!['mattersim', 'mace'].includes(artifact?.model) || artifactByModel.has(artifact.model)) {
        failures.push(`${prefix}.receiptArtifacts: model keys must be exactly mattersim and mace`);
      } else artifactByModel.set(artifact.model, artifact);
    }
    for (const model of ['mattersim', 'mace']) {
      const artifact = artifactByModel.get(model);
      const sourceArtifact = sourceReplica?.artifacts?.[model];
      const artifactPrefix = `${prefix}.artifacts.${model}`;
      if (!artifact) {
        failures.push(`${artifactPrefix}: signed receipt artifact is missing`);
        continue;
      }
      compare(failures, `${artifactPrefix}.receiptApiDownloadDigest`, artifact.apiDigest,
        artifact.downloadDigest);
      compare(failures, `${artifactPrefix}.id`, sourceArtifact?.id, artifact.id);
      compare(failures, `${artifactPrefix}.name`, sourceArtifact?.name, artifact.name);
      compare(failures, `${artifactPrefix}.archiveBytes`, sourceArtifact?.archiveBytes,
        artifact.sizeBytes);
      compare(failures, `${artifactPrefix}.archiveDigest`, sourceArtifact?.archiveDigest,
        artifact.downloadDigest);
      compare(failures, `${artifactPrefix}.expiresAt`, sourceArtifact?.expiresAt,
        artifact.expiresAt);
      compare(failures, `${artifactPrefix}.expiredAtCapture`, artifact.expired, false);
      compare(failures, `${artifactPrefix}.workflowRun.id`, artifact.workflowRun?.id,
        sourceReplica?.runId);
      compare(failures, `${artifactPrefix}.workflowRun.headSha`, artifact.workflowRun?.headSha,
        source.sourceRevision);
      compare(failures, `${artifactPrefix}.workflowRun.repositoryId`,
        artifact.workflowRun?.repositoryId, source.repositoryId);
    }
  }

  const stableModels = receipt?.stableInputs?.models;
  if (!Array.isArray(stableModels) || stableModels.length !== 2) {
    failures.push('preflight.sourceEvidence.receipt.stableInputs.models: exactly two models are required');
  } else {
    const stableByModel = new Map(stableModels.map((entry) => [entry?.model, entry]));
    if (stableByModel.size !== 2 || !stableByModel.has('mattersim') || !stableByModel.has('mace')) {
      failures.push('preflight.sourceEvidence.receipt.stableInputs.models: model keys must be exactly mattersim and mace');
    }
    for (const model of ['mattersim', 'mace']) {
      const stable = stableByModel.get(model);
      const runtimeInput = preflight?.trackedRuntimeInputs?.[model];
      compare(failures, `preflight.trackedRuntimeInputs.${model}.dependencyLock.receiptProjection`,
        runtimeInput?.dependencyLock?.sha256, stable?.dependencyLockDigest);
      compare(failures, `preflight.trackedRuntimeInputs.${model}.runtimeInputManifest.receiptProjection`,
        runtimeInput?.runtimeInputManifest?.sha256, stable?.runtimeInputDigest);
      compare(failures, `preflight.trackedRuntimeInputs.${model}.dependencyGraph.receiptProjection`,
        runtimeInput?.wheelClosure?.dependencyGraphDigest, stable?.dependencyGraphDigest);
      compare(failures, `preflight.trackedRuntimeInputs.${model}.installedPath.receiptProjection`,
        runtimeInput?.wheelClosure?.installedPathDigest, stable?.installedPathDigest);
      compare(failures, `preflight.trackedRuntimeInputs.${model}.runtimeInstalledPath.receiptProjection`,
        runtimeInput?.wheelClosure?.runtimeInstalledPathDigest, stable?.runtimeInstalledPathDigest);
      compare(failures, `preflight.trackedRuntimeInputs.${model}.dependencyLock.runtimeLockProjection`,
        runtimeInput?.dependencyLock?.sha256,
        runtimeLock?.identities?.dependencyLockDigests?.[model]);
      compare(failures, `preflight.trackedRuntimeInputs.${model}.runtimeInputManifest.runtimeLockProjection`,
        runtimeInput?.runtimeInputManifest?.sha256,
        runtimeLock?.identities?.runtimeInputManifestDigests?.[model]);
      compare(failures, `preflight.trackedRuntimeInputs.${model}.byteIdentical.receiptProjection`,
        runtimeInput?.byteIdenticalAcrossAcceptedReplicas,
        receipt?.stableInputs?.byteIdenticalAcrossReplicas);
    }
  }
  compare(failures, 'preflight.sourceEvidence.receipt.runnerDigest.runtimeLockProjection',
    receipt?.stableInputs?.runnerDigest, runtimeLock?.identities?.runnerDigest);
  compare(failures, 'preflight.sourceEvidence.receipt.scientificPlanDigest',
    receipt?.stableInputs?.scientificPlanDigest, EXPECTED_SCIENTIFIC_PLAN_DIGEST);
  return uniqueSorted(failures);
}

export async function validateFullCandidateExecutionPreflightRepository(
  preflightBytes,
  { root = process.cwd(), enforceCheckedInBytes = true, fileOverrides = {} } = {},
) {
  const inspection = inspectFullCandidateExecutionPreflightBytes(
    preflightBytes,
    { enforceCheckedInBytes },
  );
  const failures = [...inspection.failures];
  const { preflight } = inspection;
  if (!preflight) return { ...inspection, failures };
  failures.push(...validateFullCandidateExecutionPreflightSemantics(preflight));

  const readPolicyFile = async (relativePath) => {
    if (Object.hasOwn(fileOverrides, relativePath)) return toBuffer(fileOverrides[relativePath]);
    return readFile(path.join(root, relativePath));
  };
  let schemaBytes;
  let predecessorBytes;
  let scientificPlanBytes;
  let runtimeLockBytes;
  let receiptBytes;
  let attestationBytes;
  try {
    [
      schemaBytes,
      predecessorBytes,
      scientificPlanBytes,
      runtimeLockBytes,
      receiptBytes,
      attestationBytes,
    ] = await Promise.all([
      readPolicyFile(FULL_CANDIDATE_EXECUTION_PREFLIGHT_SCHEMA_PATH),
      readPolicyFile(FULL_CANDIDATE_PLAN_PATH),
      readPolicyFile(EXPECTED_SCIENTIFIC_PLAN_PATH),
      readPolicyFile(RUNTIME_LOCK_PATH),
      readPolicyFile(RUNTIME_FREEZE_RECEIPT_PATH),
      readPolicyFile(RUNTIME_FREEZE_ATTESTATION_PATH),
    ]);
  } catch (error) {
    failures.push(`full-candidate-execution-preflight.repository: bound control file unavailable (${message(error)})`);
    return { ...inspection, failures };
  }
  compare(failures, 'preflight.schema.rawDigest', sha256(schemaBytes),
    FULL_CANDIDATE_EXECUTION_PREFLIGHT_SCHEMA_RAW_DIGEST);
  compare(failures, 'preflight.predecessor.fileDigest', sha256(predecessorBytes),
    FULL_CANDIDATE_PLAN_RAW_DIGEST);
  compare(failures, 'preflight.scientificPlan.fileDigest', sha256(scientificPlanBytes),
    EXPECTED_SCIENTIFIC_PLAN_DIGEST);
  const schema = parseBoundJson(schemaBytes, 'preflight.schema', failures);
  if (schema) failures.push(...validateFullCandidateExecutionPreflightSchema(preflight, schema));
  const predecessor = parseBoundJson(predecessorBytes, 'preflight.predecessor', failures);
  const scientificPlan = parseBoundJson(scientificPlanBytes, 'preflight.scientificPlan', failures);
  if (predecessor && scientificPlan) {
    validateScientificPlanBridge(preflight, predecessor, scientificPlan, failures);
  }

  const runtimeLockInspection = inspectRuntimeLockBytes(runtimeLockBytes);
  failures.push(...runtimeLockInspection.failures.map(
    (failure) => `preflight.sourceEvidence.runtimeLock.policy: ${failure}`,
  ));
  if (runtimeLockInspection.lock) {
    failures.push(...validateRuntimeLockSemantics(runtimeLockInspection.lock).map(
      (failure) => `preflight.sourceEvidence.runtimeLock.policy: ${failure}`,
    ));
  }
  const receiptInspection = inspectRuntimeFreezeReceiptBytes(receiptBytes);
  failures.push(...receiptInspection.failures.map(
    (failure) => `preflight.sourceEvidence.signedReceipt.policy: ${failure}`,
  ));
  if (runtimeLockInspection.lock && receiptInspection.receipt) {
    failures.push(...validateRuntimeFreezeProjection(
      runtimeLockInspection.lock,
      receiptInspection.receipt,
    ).map((failure) => `preflight.sourceEvidence.runtimeFreezeProjection: ${failure}`));
  }
  try {
    const bundle = parseSingleBundle(attestationBytes);
    if (runtimeLockInspection.lock) {
      failures.push(...validateRawBundleProjection(runtimeLockInspection.lock, bundle).map(
        (failure) => `preflight.sourceEvidence.attestation.policy: ${failure}`,
      ));
    }
  } catch (error) {
    failures.push(`preflight.sourceEvidence.attestation.policy: invalid exact bundle (${message(error)})`);
  }
  if (runtimeLockInspection.lock && receiptInspection.receipt) {
    failures.push(...validateFullCandidateSourceEvidenceProjection(
      preflight,
      runtimeLockInspection.lock,
      receiptInspection.receipt,
      {
        runtimeLockRawDigest: runtimeLockInspection.rawDigest,
        runtimeLockSemanticDigest: runtimeLockInspection.semanticDigest,
        receiptRawDigest: receiptInspection.rawDigest,
        receiptSemanticDigest: receiptInspection.semanticDigest,
        attestationRawDigest: sha256(attestationBytes),
        runtimeLockSizeBytes: runtimeLockBytes.length,
        receiptSizeBytes: receiptBytes.length,
        attestationSizeBytes: attestationBytes.length,
      },
    ));
  }

  for (const model of ['mattersim', 'mace']) {
    const binding = FROZEN_FULL_CANDIDATE_RUNTIME_INPUTS[model];
    let lockBytes;
    let manifestBytes;
    try {
      [lockBytes, manifestBytes] = await Promise.all([
        readPolicyFile(binding.dependencyLock.path),
        readPolicyFile(binding.runtimeInputManifest.path),
      ]);
    } catch (error) {
      failures.push(`preflight.${model}: tracked runtime input unavailable (${message(error)})`);
      continue;
    }
    validateBoundFile(failures, `preflight.${model}.dependencyLock`, lockBytes,
      binding.dependencyLock);
    validateBoundFile(failures, `preflight.${model}.runtimeInputManifest`, manifestBytes,
      binding.runtimeInputManifest);
    const manifest = parseBoundJson(manifestBytes, `preflight.${model}.runtimeInputManifest`, failures);
    if (manifest) validateRuntimeInputManifest(model, manifest, binding, failures);
  }

  compare(failures, 'preflight.producerWorkflow.configured',
    FULL_CANDIDATE_PRODUCER_WORKFLOW.configured, false);
  compare(failures, 'preflight.producerWorkflow.id', FULL_CANDIDATE_PRODUCER_WORKFLOW.id, null);
  return { ...inspection, failures: uniqueSorted(failures) };
}

export async function validateCheckedInFullCandidateExecutionPreflight({ root = process.cwd() } = {}) {
  const bytes = await readFile(path.join(root, FULL_CANDIDATE_EXECUTION_PREFLIGHT_PATH));
  const result = await validateFullCandidateExecutionPreflightRepository(bytes, { root });
  return { ...result, valid: result.failures.length === 0 };
}

function validateBoundFile(failures, label, bytes, binding) {
  if (bytes.length !== binding.sizeBytes) failures.push(`${label}: size differs`);
  if (sha256(bytes) !== binding.sha256) failures.push(`${label}: SHA-256 differs`);
}

function validateRuntimeInputManifest(model, manifest, binding, failures) {
  compare(failures, `preflight.${model}.manifest.schemaVersion`, manifest.schemaVersion,
    binding.runtimeInputManifest.schemaVersion);
  compare(failures, `preflight.${model}.manifest.model`, manifest.model, model);
  compare(failures, `preflight.${model}.manifest.modelId`, manifest.modelId, binding.modelId);
  compare(failures, `preflight.${model}.manifest.platform`, manifest.platform, 'linux/amd64');
  compare(failures, `preflight.${model}.manifest.scientificPlan.rawDigest`,
    manifest.scientificPlan?.rawDigest, EXPECTED_SCIENTIFIC_PLAN_DIGEST);
  compare(failures, `preflight.${model}.manifest.runtimeSourceRevision`,
    manifest.runtimeSource?.runtimeSourceRevision, EXPECTED_RUNTIME_SOURCE_REVISION);
  compare(failures, `preflight.${model}.manifest.runner.digest`,
    manifest.buildInputs?.runner?.digest, EXPECTED_RUNNER_DIGEST);
  compare(failures, `preflight.${model}.manifest.dependencyLock`,
    manifest.buildInputs?.dependencyLock,
    {
      name: path.basename(binding.dependencyLock.path),
      sha256: binding.dependencyLock.sha256,
      sizeBytes: binding.dependencyLock.sizeBytes,
    });
  const wheelhouse = manifest.buildInputs?.wheelhouse;
  compare(failures, `preflight.${model}.manifest.wheelCount`,
    wheelhouse?.wheelCount, binding.wheelClosure.wheelCount);
  const wheelBytes = Array.isArray(wheelhouse?.wheels)
    ? wheelhouse.wheels.reduce((sum, wheel) => sum + (Number.isSafeInteger(wheel?.sizeBytes)
      ? wheel.sizeBytes : 0), 0)
    : null;
  compare(failures, `preflight.${model}.manifest.wheelBytes`,
    wheelBytes, binding.wheelClosure.wheelBytes);
  compare(failures, `preflight.${model}.manifest.lockDigest`,
    wheelhouse?.lockDigest, binding.dependencyLock.sha256);
  for (const key of [
    'dependencyGraphDigest',
    'installedPathDigest',
    'runtimeInstalledPathDigest',
  ]) compare(failures, `preflight.${model}.manifest.${key}`,
    wheelhouse?.[key], binding.wheelClosure[key]);
  compare(failures, `preflight.${model}.manifest.runtimePolicy`, manifest.policy?.runtime, {
    capabilities: 'drop-all',
    network: 'none',
    noNewPrivileges: true,
    rootFilesystem: 'read-only',
    user: '65532:65532',
  });
  compare(failures, `preflight.${model}.manifest.claims`, manifest.claims, {
    comparable: false,
    evidenceClass: 'discovery-only-not-reproduced',
    promotionEligible: false,
    reproduced: false,
  });
}

function validateScientificPlanBridge(preflight, predecessor, scientificPlan, failures) {
  compare(failures, 'preflight.predecessor.scientificPlan.path',
    predecessor.bindings?.scientificPlan?.path, EXPECTED_SCIENTIFIC_PLAN_PATH);
  compare(failures, 'preflight.predecessor.scientificPlan.rawDigest',
    predecessor.bindings?.scientificPlan?.rawDigest, EXPECTED_SCIENTIFIC_PLAN_DIGEST);

  const benchmark = predecessor.bindings?.benchmark;
  const topology = preflight.candidateTopology;
  const validation = preflight.preregisteredValidation;
  compare(failures, 'preflight.bridge.completeness.requiredModels',
    validation?.completeness?.requiredModels?.value, topology?.containerLanes?.length);
  compare(failures, 'preflight.bridge.completeness.recordsPerModel',
    validation?.completeness?.recordsPerModel?.value, benchmark?.frames);
  compare(failures, 'preflight.bridge.completeness.requiredTotalPredictions',
    validation?.completeness?.requiredTotalPredictions?.value,
    benchmark?.frames * topology?.containerLanes?.length);
  compare(failures, 'preflight.bridge.completeness.atomsPerFrame',
    validation?.completeness?.atomsPerFrame?.value, benchmark?.atomsPerFrame);
  compare(failures, 'preflight.bridge.topology.authoritativePredictionRecordsTotal',
    topology?.authoritativePredictionRecordsTotal,
    validation?.completeness?.requiredTotalPredictions?.value);

  const determinism = validation?.determinismPerModel;
  compare(failures, 'preflight.bridge.determinism.containerExecutionsTotal',
    topology?.requiredContainerExecutionsTotal,
    determinism?.freshContainersOnSameRunner?.value * topology?.containerLanes?.length);
  compare(failures, 'preflight.bridge.determinism.recordsPerContainer',
    determinism?.recordsPerContainer?.value, benchmark?.frames);
  compare(failures, 'preflight.bridge.determinism.authoritativePredictionRecordsTotal',
    determinism?.authoritativePredictionRecordsTotal?.value,
    topology?.authoritativePredictionRecordsTotal);
  compare(failures, 'preflight.bridge.determinism.repeatValidationPredictionRecordsTotal',
    determinism?.repeatValidationPredictionRecordsTotal?.value,
    topology?.repeatValidationPredictionRecordsTotal);

  const metrics = scientificPlan.protocol?.metrics;
  compare(failures, 'preflight.bridge.energyError.unit',
    preflight.quantityContract?.energyError?.unit, metrics?.reportDefinitions?.energy?.unit);
  compare(failures, 'preflight.bridge.forceError.unit',
    preflight.quantityContract?.forceError?.unit, metrics?.reportDefinitions?.force?.unit);
  compare(failures, 'preflight.bridge.stressError.unit',
    preflight.quantityContract?.stressError?.unit, metrics?.reportDefinitions?.stress?.unit);
  compare(failures, 'preflight.bridge.stressUnitConversion.value',
    preflight.quantityContract?.stressUnitConversion?.value, metrics?.evA3ToGpa);

  const invariance = scientificPlan.protocol?.invariance;
  compare(failures, 'preflight.bridge.invariance.requiredCases',
    validation?.invariancePerModel?.requiredCases?.value,
    invariance?.structureIds?.length * 4);
  compare(failures, 'preflight.bridge.invariance.maximumEnergyError',
    validation?.invariancePerModel?.maximumEnergyError?.value,
    invariance?.thresholds?.energyMaxEv);
  compare(failures, 'preflight.bridge.invariance.maximumForceVectorError',
    validation?.invariancePerModel?.maximumForceVectorError?.value,
    invariance?.thresholds?.forceVectorMaxEvPerAngstrom);
  compare(failures, 'preflight.bridge.invariance.maximumStressFrobeniusError',
    validation?.invariancePerModel?.maximumStressFrobeniusError?.value,
    invariance?.thresholds?.stressFrobeniusMaxEvPerAngstrom3);

  const forceFiniteDifference = invariance?.forceFiniteDifference;
  compare(failures, 'preflight.bridge.forceFiniteDifference.selection',
    validation?.forceFiniteDifferencePerModel?.selection,
    forceFiniteDifference?.selection);
  compare(failures, 'preflight.bridge.forceFiniteDifference.steps',
    validation?.forceFiniteDifferencePerModel?.steps?.values,
    forceFiniteDifference?.stepsAngstrom);
  compare(failures, 'preflight.bridge.forceFiniteDifference.absoluteTolerance',
    validation?.forceFiniteDifferencePerModel?.absoluteTolerance?.value,
    forceFiniteDifference?.absoluteToleranceEvPerAngstrom);
  compare(failures, 'preflight.bridge.forceFiniteDifference.relativeTolerance',
    validation?.forceFiniteDifferencePerModel?.relativeTolerance?.value,
    forceFiniteDifference?.relativeTolerance);

  const stressFiniteDifference = invariance?.stressFiniteDifference;
  compare(failures, 'preflight.bridge.stressFiniteDifference.requiredCases',
    validation?.stressFiniteDifferencePerModel?.requiredCases?.value,
    stressFiniteDifference?.structureIds?.length * stressFiniteDifference?.voigtModes?.length);
  compare(failures, 'preflight.bridge.stressFiniteDifference.strainSteps',
    validation?.stressFiniteDifferencePerModel?.strainSteps?.values,
    stressFiniteDifference?.strainSteps);
  compare(failures, 'preflight.bridge.stressFiniteDifference.absoluteTolerance',
    validation?.stressFiniteDifferencePerModel?.absoluteTolerance?.value,
    stressFiniteDifference?.absoluteToleranceEvPerAngstrom3);
  compare(failures, 'preflight.bridge.stressFiniteDifference.relativeTolerance',
    validation?.stressFiniteDifferencePerModel?.relativeTolerance?.value,
    stressFiniteDifference?.relativeTolerance);
  compare(failures, 'preflight.bridge.stressFiniteDifference.postHocSignSelectionAllowed',
    validation?.stressFiniteDifferencePerModel?.postHocSignSelectionAllowed,
    stressFiniteDifference?.automaticSignSelectionAllowed);
}

function rejectPositiveClaimLikeBooleans(value, failures, trail = 'preflight') {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => rejectPositiveClaimLikeBooleans(entry, failures, `${trail}[${index}]`));
    return;
  }
  if (!isRecord(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    const nextTrail = `${trail}.${key}`;
    if (entry === true && /(?:claimAllowed|eligible|reproduced|sota|certified|industrialFitness)$/i.test(key)) {
      failures.push(`${nextTrail}: positive claim-like boolean is forbidden`);
    }
    rejectPositiveClaimLikeBooleans(entry, failures, nextTrail);
  }
}

function parseBoundJson(bytes, label, failures) {
  try {
    return parseJsonRejectingDuplicateMembers(bytes);
  } catch (error) {
    failures.push(`${label}: invalid or duplicate-member JSON (${message(error)})`);
    return null;
  }
}

function compare(failures, label, actual, expected) {
  if (!isDeepStrictEqual(actual, expected)) failures.push(`${label}: differs from the frozen value`);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right, 'en'));
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function toBuffer(value) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  throw new TypeError('full-candidate execution preflight bytes must be a Buffer, Uint8Array or string');
}

function message(error) {
  return error instanceof Error ? error.message : String(error);
}
