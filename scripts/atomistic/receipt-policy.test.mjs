import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  CURRENT_PLAN_DIGEST,
  EXPECTED_ASSETS,
  EXPECTED_ATTESTATION_BUILD_TYPE,
  EXPECTED_ATTESTATION_ISSUER,
  EXPECTED_ATTESTATION_PREDICATE_TYPE,
  EXPECTED_ATTESTATION_RUNNER_ENVIRONMENT,
  EXPECTED_REPOSITORY,
  EXPECTED_REPOSITORY_ID,
  FULL_WORKFLOW_PATH,
  MATTERSIM_PROTOCOL,
  METRIC_REPORT_PROTOCOL,
  RANDOM_TP_IDS,
  RANDOM_TP_SMOKE_IDS,
  SMOKE_WORKFLOW_PATH,
  canonicalReceiptBytes,
  computeScientificValidationRoot,
  digestCanonical,
  expectedAttestationBuilderId,
  expectedAttestationSignerWorkflow,
  loadComparatorReceipt,
  validateComparatorPromotion,
  validateReceiptPath,
  validateReproductionReceipt,
} from './receipt-policy.mjs';

const SOURCE_SHA = '7'.repeat(40);
const FIXED_NOW = new Date('2026-08-29T00:00:00Z');
const temporaryDirectories = [];
const digest = (label) => `sha256:${Buffer.from(label).toString('hex').padEnd(64, '0').slice(0, 64)}`;
const sha256 = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const TRUSTED_EXECUTION_POLICY = Object.freeze({
  ready: true,
  errors: Object.freeze([]),
  runnerDigest: digest('runner'),
  containers: Object.freeze({ 'mattersim-v1.0.0-5m': digest('matter-container'), 'mace-mpa-0-medium': digest('mace-container') }),
  dependencyLocks: Object.freeze({ 'mattersim-v1.0.0-5m': digest('matter-lock'), 'mace-mpa-0-medium': digest('mace-lock') }),
  python: '3.12.13',
  platform: 'linux',
  architecture: 'x86_64',
  dtype: 'float32',
  device: 'cpu',
  batchSize: 1,
  threads: 1,
});
const POLICY_OPTIONS = Object.freeze({ now: FIXED_NOW, trustedExecutionPolicy: TRUSTED_EXECUTION_POLICY });

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('atomistic reproduction receipt schema and policy', () => {
  it('distinguishes plan, smoke and full without allowing plan or smoke promotion', () => {
    const plan = makePlanReceipt();
    const smoke = makeSmokeReceipt();
    const full = makeFullReceipt();

    expect(validateReproductionReceipt(plan, POLICY_OPTIONS)).toMatchObject({ ok: true });
    expect(validateReproductionReceipt(smoke, POLICY_OPTIONS)).toMatchObject({ ok: true });
    expect(validateReproductionReceipt(full, POLICY_OPTIONS)).toMatchObject({ ok: true });

    const smokeComparator = makeComparator(makeFullReceipt(), 'mattersim-1.0.0-5m');
    expect(validateComparatorPromotion(smokeComparator, smoke, promotionOptions(smoke))).toMatchObject({ ok: false, applicable: true });

    const forgedSmoke = structuredClone(smoke);
    forgedSmoke.claimEligible = true;
    expect(validateReproductionReceipt(forgedSmoke, POLICY_OPTIONS).ok).toBe(false);
  });

  it('binds promotion to verified signer certificate identity, strict CLI policy and trusted timestamps', () => {
    const receipt = makeFullReceipt();
    const comparator = makeComparator(receipt, 'mattersim-1.0.0-5m');
    const mutations = [
      (context) => { context.attestation.certificate.subjectAlternativeName = 'https://github.com/tony070926-sudo/tailing-future/.github/workflows/other.yml@refs/heads/main'; },
      (context) => { context.attestation.certificate.signerDigest = '8'.repeat(40); },
      (context) => { context.attestation.certificate.sourceDigest = '8'.repeat(40); },
      (context) => { context.attestation.certificate.runnerEnvironment = 'self-hosted'; },
      (context) => { context.attestation.verificationPolicy.signerWorkflow = 'tony070926-sudo/tailing-future/.github/workflows/other.yml'; },
      (context) => { context.attestation.verificationPolicy.denySelfHostedRunners = false; },
      (context) => { context.attestation.verifiedTimestamps = []; },
      (context) => { context.attestation.verifiedTimestamps = ['2026-08-28T16:02:00Z']; },
      (context) => { context.hardwareDigest = digest('untrusted-hardware'); },
    ];
    for (const mutate of mutations) {
      const options = promotionOptions(receipt);
      mutate(options.trustedPromotionContext);
      expect(validateComparatorPromotion(comparator, receipt, options).ok).toBe(false);
    }
  });

  it('accepts only a complete dual-model full receipt and binds both comparator promotions', () => {
    const receipt = makeFullReceipt();
    const matterSim = makeComparator(receipt, 'mattersim-1.0.0-5m');
    const mace = makeComparator(receipt, 'mace-mpa-0');

    expect(RANDOM_TP_IDS).toHaveLength(693);
    expect(RANDOM_TP_IDS[79]).toBe('random-TP-000079');
    expect(RANDOM_TP_IDS[80]).toBe('random-TP-000083');
    expect(RANDOM_TP_IDS.at(-1)).toBe('random-TP-000754');
    expect(validateReproductionReceipt(receipt, { ...POLICY_OPTIONS, expectedSourceRevision: SOURCE_SHA })).toEqual({ ok: true, applicable: true, errors: [] });
    expect(validateComparatorPromotion(matterSim, receipt, POLICY_OPTIONS).ok).toBe(false);
    expect(validateComparatorPromotion(matterSim, receipt, {
      ...POLICY_OPTIONS,
      trustedPromotionContext: { attestationCryptographicallyVerified: true, artifactDownloadedFromActionsApi: true },
    }).ok).toBe(false);
    expect(validateComparatorPromotion(matterSim, receipt, promotionOptions(receipt))).toEqual({ ok: true, applicable: true, errors: [] });
    expect(validateComparatorPromotion(mace, receipt, promotionOptions(receipt))).toEqual({ ok: true, applicable: true, errors: [] });

    const obsoleteContinuousIds = makeFullReceipt();
    const continuousIds = Array.from({ length: 693 }, (_, index) => `random-TP-${String(index).padStart(6, '0')}`);
    obsoleteContinuousIds.benchmark.recordIds = continuousIds;
    obsoleteContinuousIds.models.forEach((model) => { model.records.recordIds = [...continuousIds]; });
    expect(validateReproductionReceipt(obsoleteContinuousIds, POLICY_OPTIONS).ok).toBe(false);
  });

  it('fails closed when no concrete runner, container and dependency-lock trust roots are frozen', () => {
    expect(validateReproductionReceipt(makeFullReceipt(), { now: FIXED_NOW }).ok).toBe(false);

    const malformedTrustRoots = { ...TRUSTED_EXECUTION_POLICY, containers: {} };
    expect(validateReproductionReceipt(makeFullReceipt(), { now: FIXED_NOW, trustedExecutionPolicy: malformedTrustRoots }).ok).toBe(false);
  });

  it('rejects arbitrary package, checkpoint, dataset, runner, container and lock digest substitution', () => {
    const mutations = [
      (receipt) => { receipt.models[0].package.digest = digest('forged-package'); },
      (receipt) => { receipt.models[0].checkpointDigest = digest('forged-checkpoint'); },
      (receipt) => { receipt.benchmark.datasetDigest = digest('forged-dataset'); receipt.models.forEach((model) => { model.datasetDigest = receipt.benchmark.datasetDigest; }); },
      (receipt) => { receipt.benchmark.structureBundleDigest = digest('forged-structure-bundle'); },
      (receipt) => { receipt.benchmark.structureManifestFileDigest = digest('forged-structure-manifest-file'); },
      (receipt) => { receipt.benchmark.structureManifestRoot = digest('forged-structure-manifest-root'); },
      (receipt) => { receipt.models[0].runnerDigest = digest('forged-runner'); },
      (receipt) => { receipt.models[0].containerDigest = digest('forged-container'); },
      (receipt) => { receipt.models[0].dependencyLockDigest = digest('forged-lock'); },
    ];

    for (const mutate of mutations) {
      const receipt = makeFullReceipt();
      mutate(receipt);
      expect(validateReproductionReceipt(receipt, POLICY_OPTIONS).ok).toBe(false);
    }
  });

  it('rejects missing, duplicate, extra, failed and non-finite output evidence', () => {
    const missing = makeFullReceipt();
    missing.models[0].records.recordIds.pop();
    missing.models[0].records.produced -= 1;
    expect(validateReproductionReceipt(missing, POLICY_OPTIONS).ok).toBe(false);

    const duplicate = makeFullReceipt();
    duplicate.models[0].records.recordIds[692] = duplicate.models[0].records.recordIds[0];
    expect(validateReproductionReceipt(duplicate, POLICY_OPTIONS).ok).toBe(false);

    for (const field of ['missingIds', 'duplicateIds', 'extraIds', 'failedIds', 'nonfiniteIds']) {
      const receipt = makeFullReceipt();
      receipt.models[0].records[field].push('random-TP-000001');
      expect(validateReproductionReceipt(receipt, POLICY_OPTIONS).ok).toBe(false);
    }

    const nonfiniteMetric = makeFullReceipt();
    nonfiniteMetric.models[0].metrics.energy.mean = Number.NaN;
    expect(validateReproductionReceipt(nonfiniteMetric, POLICY_OPTIONS).ok).toBe(false);
  });

  it('rejects wrong workflow, SHA, attestation bundle, artifact and source repository', () => {
    const mutations = [
      (receipt) => { receipt.provenance.workflow.path = SMOKE_WORKFLOW_PATH; receipt.provenance.attestation.verifiedClaims.workflowPath = SMOKE_WORKFLOW_PATH; },
      (receipt) => { receipt.provenance.workflow.sha = '8'.repeat(40); },
      (receipt) => { receipt.provenance.attestation.verifiedClaims.sourceRevision = '8'.repeat(40); },
      (receipt) => { receipt.provenance.attestation.verifiedClaims.runAttempt += 1; },
      (receipt) => { receipt.provenance.attestation.bundle.dsseEnvelope.payload = 'tampered'; },
      (receipt) => { receipt.provenance.artifact.apiDigest = digest('wrong-api-artifact'); },
      (receipt) => { receipt.source.repository = 'external/vendor-results'; },
      (receipt) => { receipt.source.repositoryId = 1; },
    ];

    for (const mutate of mutations) {
      const receipt = makeFullReceipt();
      mutate(receipt);
      expect(validateReproductionReceipt(receipt, POLICY_OPTIONS).ok).toBe(false);
    }
  });

  it('requires the exact workflow builder, build type, hosted runner and predicate in receipt and trusted decoder claims', () => {
    const missingReceiptBuilder = makeFullReceipt();
    delete missingReceiptBuilder.provenance.attestation.verifiedClaims.builderId;
    expect(validateReproductionReceipt(missingReceiptBuilder, POLICY_OPTIONS).ok).toBe(false);

    const replacedReceiptBuilder = makeFullReceipt();
    replacedReceiptBuilder.provenance.attestation.verifiedClaims.builderId = 'https://github.com/actions/runner/github-hosted';
    expect(validateReproductionReceipt(replacedReceiptBuilder, POLICY_OPTIONS).ok).toBe(false);

    const replacedBuildType = makeFullReceipt();
    replacedBuildType.provenance.attestation.verifiedClaims.buildType = 'https://example.invalid/build/v1';
    expect(validateReproductionReceipt(replacedBuildType, POLICY_OPTIONS).ok).toBe(false);

    const selfHostedRunner = makeFullReceipt();
    selfHostedRunner.provenance.attestation.verifiedClaims.runnerEnvironment = 'self-hosted';
    expect(validateReproductionReceipt(selfHostedRunner, POLICY_OPTIONS).ok).toBe(false);

    const replacedReceiptPredicate = makeFullReceipt();
    replacedReceiptPredicate.provenance.attestation.verifiedClaims.predicateType = 'https://example.invalid/forged-predicate/v1';
    expect(validateReproductionReceipt(replacedReceiptPredicate, POLICY_OPTIONS).ok).toBe(false);

    const receipt = makeFullReceipt();
    const comparator = makeComparator(receipt, 'mattersim-1.0.0-5m');
    const missingDecodedBuilder = promotionOptions(receipt);
    delete missingDecodedBuilder.trustedPromotionContext.attestation.decodedVerifiedClaims.builderId;
    expect(validateComparatorPromotion(comparator, receipt, missingDecodedBuilder).errors.join('\n')).toMatch(/decoded claims/);

    const replacedDecodedPredicate = promotionOptions(receipt);
    replacedDecodedPredicate.trustedPromotionContext.attestation.decodedVerifiedClaims.predicateType = 'https://example.invalid/forged-predicate/v1';
    expect(validateComparatorPromotion(comparator, receipt, replacedDecodedPredicate).errors.join('\n')).toMatch(/decoded claims/);
  });

  it('rejects incomplete or forged hardware and execution provenance', () => {
    const wrongHardware = makeFullReceipt();
    wrongHardware.models[0].execution.hardwareId = 'another-host';
    expect(validateReproductionReceipt(wrongHardware, POLICY_OPTIONS).ok).toBe(false);

    const tooManyThreads = makeFullReceipt();
    tooManyThreads.models[0].execution.threads = tooManyThreads.hardware.cpu.logicalCores + 1;
    expect(validateReproductionReceipt(tooManyThreads, POLICY_OPTIONS).ok).toBe(false);

    const absentGpu = makeFullReceipt();
    absentGpu.models[0].execution.device = 'cuda';
    absentGpu.hardware.accelerators = [];
    expect(validateReproductionReceipt(absentGpu, POLICY_OPTIONS).ok).toBe(false);

    const missingVersion = makeFullReceipt();
    delete missingVersion.models[0].software.torch;
    expect(validateReproductionReceipt(missingVersion, POLICY_OPTIONS).ok).toBe(false);

    const wrongPlatform = makeFullReceipt();
    wrongPlatform.hardware.os = 'Darwin 25.0';
    wrongPlatform.hardware.architecture = 'arm64';
    expect(validateReproductionReceipt(wrongPlatform, POLICY_OPTIONS).ok).toBe(false);

    const contradictoryRunner = makeFullReceipt();
    contradictoryRunner.hardware.runnerClass = 'ephemeral-self-hosted';
    expect(validateReproductionReceipt(contradictoryRunner, POLICY_OPTIONS).errors.join('\n')).toMatch(/runnerClass/);
  });

  it('recomputes MatterSim protocol tolerance and forbids automatic MACE superiority', () => {
    const outsideTolerance = makeFullReceipt();
    outsideTolerance.models[0].metrics.force.mean = MATTERSIM_PROTOCOL.targets.forceVectorMaeEvPerAngstrom + MATTERSIM_PROTOCOL.tolerances.forceAbsolute + 0.0001;
    expect(validateReproductionReceipt(outsideTolerance, POLICY_OPTIONS).ok).toBe(false);

    const absoluteOnly = makeFullReceipt();
    absoluteOnly.models[0].metrics.force.mean = MATTERSIM_PROTOCOL.targets.forceVectorMaeEvPerAngstrom + 0.018;
    expect(validateReproductionReceipt(absoluteOnly, POLICY_OPTIONS).ok).toBe(false);

    const maceSuperiority = makeFullReceipt();
    maceSuperiority.models[1].superiorityClaimed = true;
    expect(validateReproductionReceipt(maceSuperiority, POLICY_OPTIONS).ok).toBe(false);

    const promoted = makeFullReceipt();
    const comparator = makeComparator(promoted, 'mace-mpa-0');
    comparator.superiorityClaimed = true;
    expect(validateComparatorPromotion(comparator, promoted, promotionOptions(promoted)).ok).toBe(false);
  });

  it('requires complete ordered HF7 reports and a valid worst record for both models', () => {
    const missingMaceQuantile = makeFullReceipt();
    delete missingMaceQuantile.models[1].metrics.stress.p95;
    expect(validateReproductionReceipt(missingMaceQuantile, POLICY_OPTIONS).errors.join('\n')).toMatch(/p95|required property/);

    const wrongWorstId = makeFullReceipt();
    wrongWorstId.models[0].metrics.energy.worst.id = 'random-TP-999999';
    wrongWorstId.scientificValidation.root = computeScientificValidationRoot(wrongWorstId);
    expect(validateReproductionReceipt(wrongWorstId, POLICY_OPTIONS).errors.join('\n')).toMatch(/worst ID/);

    const wrongWorstError = makeFullReceipt();
    wrongWorstError.models[1].metrics.force.worst.error = wrongWorstError.models[1].metrics.force.p99 - 0.0001;
    wrongWorstError.scientificValidation.root = computeScientificValidationRoot(wrongWorstError);
    expect(validateReproductionReceipt(wrongWorstError, POLICY_OPTIONS).errors.join('\n')).toMatch(/worst error/);

    const nonMonotone = makeFullReceipt();
    nonMonotone.models[0].metrics.stress.p95 = nonMonotone.models[0].metrics.stress.p90 - 0.0001;
    nonMonotone.scientificValidation.root = computeScientificValidationRoot(nonMonotone);
    expect(validateReproductionReceipt(nonMonotone, POLICY_OPTIONS).errors.join('\n')).toMatch(/quantiles are not monotone/);

    const duplicateIdProtocol = makeFullReceipt();
    duplicateIdProtocol.models[0].metrics.force.perIdMetricEvidenceRootProtocol = 'duplicate-records-allowed/v0';
    duplicateIdProtocol.scientificValidation.root = computeScientificValidationRoot(duplicateIdProtocol);
    expect(validateReproductionReceipt(duplicateIdProtocol, POLICY_OPTIONS).ok).toBe(false);
  });

  it('rejects stale artifacts and model-output digest collisions', () => {
    const expired = makeFullReceipt();
    expired.provenance.artifact.expiresAt = '2026-08-28T12:00:00Z';
    expect(validateReproductionReceipt(expired, POLICY_OPTIONS).ok).toBe(false);

    const collidedRoot = makeFullReceipt();
    collidedRoot.models[1].predictionMerkleRoot = collidedRoot.models[0].predictionMerkleRoot;
    expect(validateReproductionReceipt(collidedRoot, POLICY_OPTIONS).ok).toBe(false);

    const collidedBundle = makeFullReceipt();
    collidedBundle.models[1].resultBundleDigest = collidedBundle.models[0].resultBundleDigest;
    expect(validateReproductionReceipt(collidedBundle, POLICY_OPTIONS).ok).toBe(false);

    const impossibleTimestamp = makeFullReceipt();
    impossibleTimestamp.createdAt = '2026-02-31T16:00:00Z';
    expect(validateReproductionReceipt(impossibleTimestamp, POLICY_OPTIONS).ok).toBe(false);

    const futureCreation = makeFullReceipt();
    futureCreation.createdAt = '2026-08-29T00:00:01Z';
    expect(validateReproductionReceipt(futureCreation, POLICY_OPTIONS).errors.join('\n')).toMatch(/creation timestamp is in the future/);

    const futureVerification = makeFullReceipt();
    futureVerification.verification.verifiedAt = '2026-08-29T00:00:01Z';
    expect(validateReproductionReceipt(futureVerification, POLICY_OPTIONS).errors.join('\n')).toMatch(/verification timestamp is in the future/);

    const verificationAfterExpiry = makeFullReceipt();
    verificationAfterExpiry.provenance.artifact.expiresAt = '2026-08-28T16:00:30Z';
    expect(validateReproductionReceipt(verificationAfterExpiry, {
      ...POLICY_OPTIONS,
      now: new Date('2026-08-28T16:00:15Z'),
    }).errors.join('\n')).toMatch(/verification timestamp is not before artifact expiry/);
  });

  it('requires every comparator digest to match the receipt instead of trusting arbitrary registry values', () => {
    const receipt = makeFullReceipt();
    const base = makeComparator(receipt, 'mattersim-1.0.0-5m');
    const digestFields = [
      'packageDigest', 'checkpointDigest', 'datasetDigest', 'runnerDigest', 'containerDigest', 'dependencyLockDigest',
      'predictionMerkleRoot', 'resultBundleDigest', 'evidenceBundleDigest', 'independentVerifierDigest', 'artifactApiDigest', 'attestationBundleDigest',
      'attestationRawBundleDigest',
    ];
    for (const field of digestFields) {
      const comparator = { ...base, [field]: digest(`forged-${field}`) };
      expect(validateComparatorPromotion(comparator, receipt, promotionOptions(receipt)).ok).toBe(false);
    }
    expect(validateComparatorPromotion({ ...base, reproductionSourceRevision: '9'.repeat(40) }, receipt, promotionOptions(receipt)).ok).toBe(false);

    const forgedReceipt = structuredClone(receipt);
    forgedReceipt.models[0].predictionMerkleRoot = digest('coordinated-forged-root');
    forgedReceipt.scientificValidation.root = computeScientificValidationRoot(forgedReceipt);
    const forgedComparator = makeComparator(forgedReceipt, 'mattersim-1.0.0-5m');
    expect(validateComparatorPromotion(forgedComparator, forgedReceipt, promotionOptions(receipt)).ok).toBe(false);

    const trustedObservation = promotionOptions(receipt);
    const coordinatedForgeries = [
      (candidate) => {
        const forgedSha = '8'.repeat(40);
        candidate.source.revision = forgedSha;
        candidate.provenance.workflow.sha = forgedSha;
        candidate.provenance.attestation.verifiedClaims.sourceRevision = forgedSha;
        candidate.provenance.artifact.name = `tailing-atomistic-full-${forgedSha}-${candidate.provenance.workflow.runId}-${candidate.provenance.workflow.runAttempt}`;
        candidate.provenance.artifact.subjectName = `tailing-atomistic-full-${forgedSha}.tar.zst`;
        candidate.provenance.attestation.subjectName = candidate.provenance.artifact.subjectName;
        candidate.verification.artifactObservation.name = candidate.provenance.artifact.name;
      },
      (candidate) => {
        candidate.provenance.workflow.id += 1;
      },
      (candidate) => { candidate.source.treeDigest = digest('coordinated-forged-tree'); },
      (candidate) => {
        candidate.provenance.artifact.id += 1;
        candidate.verification.artifactObservation.id = candidate.provenance.artifact.id;
      },
      (candidate) => {
        candidate.provenance.artifact.apiDigest = digest('coordinated-forged-api-digest');
        candidate.verification.artifactObservation.apiDigest = candidate.provenance.artifact.apiDigest;
      },
      (candidate) => {
        candidate.provenance.attestation.bundle.dsseEnvelope.payload = 'coordinated-tamper';
        candidate.provenance.attestation.bundleDigest = digestCanonical(candidate.provenance.attestation.bundle);
      },
    ];
    for (const mutate of coordinatedForgeries) {
      const candidate = structuredClone(receipt);
      mutate(candidate);
      expect(validateReproductionReceipt(candidate, POLICY_OPTIONS).ok).toBe(true);
      expect(validateComparatorPromotion(makeComparator(candidate, 'mattersim-1.0.0-5m'), candidate, trustedObservation).ok).toBe(false);
    }
  });

  it('gates full promotion on structured invariance and finite-difference evidence without accelerated claims', () => {
    const missing = makeFullReceipt();
    delete missing.scientificValidation;
    expect(validateReproductionReceipt(missing, POLICY_OPTIONS).ok).toBe(false);

    const fakePassed = makeFullReceipt();
    fakePassed.scientificValidation.models[0].invariance.failedCases.push('random-TP-000000:translation');
    fakePassed.scientificValidation.root = computeScientificValidationRoot(fakePassed);
    expect(validateReproductionReceipt(fakePassed, POLICY_OPTIONS).ok).toBe(false);

    const incompleteCoverage = makeFullReceipt();
    incompleteCoverage.scientificValidation.models[0].invariance.cases = 39;
    incompleteCoverage.scientificValidation.root = computeScientificValidationRoot(incompleteCoverage);
    expect(validateReproductionReceipt(incompleteCoverage, POLICY_OPTIONS).ok).toBe(false);

    const overThreshold = makeFullReceipt();
    overThreshold.scientificValidation.models[0].invariance.maximumErrors.energyEv = 0.000100000001;
    overThreshold.scientificValidation.root = computeScientificValidationRoot(overThreshold);
    expect(validateReproductionReceipt(overThreshold, POLICY_OPTIONS).ok).toBe(false);

    const forceOutsideTolerance = makeFullReceipt();
    forceOutsideTolerance.scientificValidation.models[1].forceFiniteDifference.maximumNormalizedError = 1.000000001;
    forceOutsideTolerance.scientificValidation.root = computeScientificValidationRoot(forceOutsideTolerance);
    expect(validateReproductionReceipt(forceOutsideTolerance, POLICY_OPTIONS).ok).toBe(false);

    const automaticStressSign = makeFullReceipt();
    automaticStressSign.scientificValidation.models[0].stressFiniteDifference.automaticSignSelectionAllowed = true;
    automaticStressSign.scientificValidation.root = computeScientificValidationRoot(automaticStressSign);
    expect(validateReproductionReceipt(automaticStressSign, POLICY_OPTIONS).ok).toBe(false);

    const acceleratedClaim = makeFullReceipt();
    acceleratedClaim.scientificValidation.models[1].batchEquivalence.acceleratedBatchEligible = true;
    acceleratedClaim.scientificValidation.models[1].batchEquivalence.acceleratedExecutionClaimed = true;
    acceleratedClaim.scientificValidation.root = computeScientificValidationRoot(acceleratedClaim);
    expect(validateReproductionReceipt(acceleratedClaim, POLICY_OPTIONS).ok).toBe(false);

    const wrongRoot = makeFullReceipt();
    wrongRoot.scientificValidation.root = digest('forged-scientific-root');
    expect(validateReproductionReceipt(wrongRoot, POLICY_OPTIONS).ok).toBe(false);

    const smokeDisguise = makeSmokeReceipt();
    smokeDisguise.scientificValidation = structuredClone(makeFullReceipt().scientificValidation);
    expect(validateReproductionReceipt(smokeDisguise, POLICY_OPTIONS).ok).toBe(false);

    const receipt = makeFullReceipt();
    const comparator = makeComparator(receipt, 'mattersim-1.0.0-5m');
    for (const mutate of [
      (candidate) => { candidate.benchmark.datasetDigest = digest('another-structure-bundle'); },
      (candidate) => { candidate.benchmark.recordManifestDigest = digest('another-record-root'); },
      (candidate) => { candidate.benchmark.structureBundleDigest = digest('another-model-visible-structure-bundle'); },
      (candidate) => { candidate.benchmark.structureManifestFileDigest = digest('another-structure-manifest-file'); },
      (candidate) => { candidate.benchmark.structureManifestRoot = digest('another-structure-manifest-root'); },
      (candidate) => { candidate.runner.recordCodecDigest = digest('another-codec'); },
      (candidate) => { candidate.verification.independentVerifierDigest = digest('another-verifier'); },
      (candidate) => { candidate.models[0].predictionMerkleRoot = digest('another-prediction-root'); },
      (candidate) => { candidate.models[0].metrics.energy.mean = 0.2; },
      (candidate) => { candidate.models[0].protocolAcceptance.passed = false; },
      (candidate) => { candidate.models[0].records.produced = 692; },
    ]) {
      const changed = structuredClone(receipt);
      mutate(changed);
      expect(computeScientificValidationRoot(changed)).not.toBe(receipt.scientificValidation.root);
    }
    const externalObservationMismatch = promotionOptions(receipt);
    externalObservationMismatch.trustedPromotionContext.scientificValidationRoot = digest('unobserved-scientific-root');
    expect(validateComparatorPromotion(comparator, receipt, externalObservationMismatch).ok).toBe(false);

    const metricForgery = structuredClone(receipt);
    metricForgery.models[0].metrics.energy.mean = 0.2;
    metricForgery.scientificValidation.root = computeScientificValidationRoot(metricForgery);
    expect(validateReproductionReceipt(metricForgery, POLICY_OPTIONS).ok).toBe(true);
    expect(validateComparatorPromotion(makeComparator(metricForgery, 'mattersim-1.0.0-5m'), metricForgery, promotionOptions(receipt)).ok).toBe(false);

    const failedArtifact = makeFullReceipt();
    failedArtifact.models[0].metrics.energy.mean = 0.25;
    failedArtifact.scientificValidation.root = computeScientificValidationRoot(failedArtifact);
    const failedArtifactObservation = promotionOptions(failedArtifact);
    const forgedPassingReceipt = structuredClone(failedArtifact);
    forgedPassingReceipt.models[0].metrics.energy.mean = MATTERSIM_PROTOCOL.targets.energyMaeEvPerAtom;
    forgedPassingReceipt.scientificValidation.root = computeScientificValidationRoot(forgedPassingReceipt);
    expect(validateReproductionReceipt(forgedPassingReceipt, POLICY_OPTIONS).ok).toBe(true);
    expect(validateComparatorPromotion(makeComparator(forgedPassingReceipt, 'mattersim-1.0.0-5m'), forgedPassingReceipt, failedArtifactObservation).ok).toBe(false);

    const wrongDecodedClaims = promotionOptions(receipt);
    wrongDecodedClaims.trustedPromotionContext.attestation.decodedVerifiedClaims.workflowPath = '.github/workflows/untrusted-external.yml';
    wrongDecodedClaims.trustedPromotionContext.attestation.decodedVerifiedClaims.ref = 'refs/heads/untrusted-external';
    wrongDecodedClaims.trustedPromotionContext.attestation.decodedVerifiedClaims.builderId = 'https://github.com/actions/runner/github-hosted';
    expect(validateComparatorPromotion(comparator, receipt, wrongDecodedClaims).ok).toBe(false);

    const wrongRawAttestation = promotionOptions(receipt);
    wrongRawAttestation.trustedPromotionContext.attestation.rawBundleDigest = digest('different-raw-attestation-bytes');
    expect(validateComparatorPromotion(comparator, receipt, wrongRawAttestation).ok).toBe(false);

    const wrongRawReceipt = promotionOptions(receipt);
    wrongRawReceipt.trustedPromotionContext.receiptRawDigest = digest('different-raw-receipt-bytes');
    expect(validateComparatorPromotion(comparator, receipt, wrongRawReceipt).errors.join('\n')).toMatch(/receiptRawDigest/);

    const wrongCanonicalReceipt = promotionOptions(receipt);
    wrongCanonicalReceipt.trustedPromotionContext.receiptCanonicalDigest = digest('different-canonical-receipt');
    expect(validateComparatorPromotion(comparator, receipt, wrongCanonicalReceipt).errors.join('\n')).toMatch(/receiptCanonicalDigest/);

    const wrongMetricReport = promotionOptions(receipt);
    wrongMetricReport.trustedPromotionContext.modelOutputs['mace-mpa-0'].metricReports.force.reportDigest = digest('different-force-report');
    expect(validateComparatorPromotion(comparator, receipt, wrongMetricReport).errors.join('\n')).toMatch(/mace-mpa-0 output digests/);

    const wrongObservedWorst = promotionOptions(receipt);
    wrongObservedWorst.trustedPromotionContext.modelOutputs['mattersim-1.0.0-5m'].metricReports.energy.report.worst.id = RANDOM_TP_IDS[0];
    expect(validateComparatorPromotion(comparator, receipt, wrongObservedWorst).errors.join('\n')).toMatch(/mattersim-1.0.0-5m output digests/);
  });

  it('allows lower evidence classes without a receipt but never a reproduced comparator without one', () => {
    expect(validateComparatorPromotion({ id: 'mace-mpa-0', evidenceClass: 'auditable' }, null)).toEqual({ ok: true, applicable: false, errors: [] });
    expect(validateComparatorPromotion({ id: 'mace-mpa-0', evidenceClass: 'reproduced', receiptPath: 'bad.json' }, null).ok).toBe(false);
    expect(validateComparatorPromotion(
      { id: 'mattersim-1.0.0-5m', evidenceClass: 'reproduced', receiptPath: 'evaluation/atomistic/receipts/malformed.json' },
      { profile: 'full', models: [{ comparatorId: 'mattersim-1.0.0-5m' }] },
      POLICY_OPTIONS,
    ).ok).toBe(false);
  });

  it('accepts only canonical duplicate-free receipt bytes and rejects symlinked receipts', async () => {
    expect(validateReceiptPath('evaluation/atomistic/receipts/full-123.json')).toBe(true);
    expect(validateReceiptPath('../evaluation/atomistic/receipts/full.json')).toBe(false);
    expect(validateReceiptPath('evaluation/atomistic/receipts/../full.json')).toBe(false);
    expect(validateReceiptPath('evaluation\\atomistic\\receipts\\full.json')).toBe(false);

    const root = await mkdtemp(path.join(tmpdir(), 'tailing-receipt-policy-'));
    temporaryDirectories.push(root);
    const receiptDirectory = path.join(root, 'evaluation', 'atomistic', 'receipts');
    await mkdir(receiptDirectory, { recursive: true });
    const receipt = makeFullReceipt();
    const comparator = makeComparator(receipt, 'mattersim-1.0.0-5m');
    const regularPath = path.join(receiptDirectory, 'full.json');
    await writeFile(regularPath, canonicalReceiptBytes(receipt));
    comparator.receiptPath = 'evaluation/atomistic/receipts/full.json';
    expect(await loadComparatorReceipt(comparator, { root, ...promotionOptions(receipt) })).toMatchObject({ ok: true, applicable: true });

    const noncanonicalPath = path.join(receiptDirectory, 'noncanonical.json');
    await writeFile(noncanonicalPath, `${JSON.stringify(receipt)}\n`);
    comparator.receiptPath = 'evaluation/atomistic/receipts/noncanonical.json';
    const noncanonical = await loadComparatorReceipt(comparator, { root, ...promotionOptions(receipt) });
    expect(noncanonical.ok).toBe(false);
    expect(noncanonical.errors.join(' ')).toMatch(/not the required canonical JSON/);

    const canonicalText = canonicalReceiptBytes(receipt).toString('utf8');
    const duplicateText = canonicalText.replace(
      '{"benchmark":',
      `{"\\u0062enchmark":${JSON.stringify(receipt.benchmark)},"benchmark":`,
    );
    expect(JSON.parse(duplicateText)).toEqual(receipt);
    const duplicatePath = path.join(receiptDirectory, 'duplicate.json');
    await writeFile(duplicatePath, duplicateText);
    comparator.receiptPath = 'evaluation/atomistic/receipts/duplicate.json';
    const duplicate = await loadComparatorReceipt(comparator, { root, ...promotionOptions(receipt) });
    expect(duplicate.ok).toBe(false);
    expect(duplicate.errors.join(' ')).toMatch(/duplicate JSON key "benchmark"/);

    const linkPath = path.join(receiptDirectory, 'linked.json');
    await symlink(regularPath, linkPath);
    comparator.receiptPath = 'evaluation/atomistic/receipts/linked.json';
    const linked = await loadComparatorReceipt(comparator, { root, ...promotionOptions(receipt) });
    expect(linked.ok).toBe(false);
    expect(linked.errors.join(' ')).toMatch(/symlink/);

    const ancestorRoot = await mkdtemp(path.join(tmpdir(), 'tailing-receipt-policy-ancestor-'));
    temporaryDirectories.push(ancestorRoot);
    const externalReceiptDirectory = path.join(ancestorRoot, 'external-receipts');
    await mkdir(path.join(ancestorRoot, 'evaluation', 'atomistic'), { recursive: true });
    await mkdir(externalReceiptDirectory);
    await writeFile(path.join(externalReceiptDirectory, 'full.json'), canonicalReceiptBytes(receipt));
    await symlink(externalReceiptDirectory, path.join(ancestorRoot, 'evaluation', 'atomistic', 'receipts'));
    comparator.receiptPath = 'evaluation/atomistic/receipts/full.json';
    const escapedDirectory = await loadComparatorReceipt(comparator, { root: ancestorRoot, ...promotionOptions(receipt) });
    expect(escapedDirectory.ok).toBe(false);
    expect(escapedDirectory.errors.join(' ')).toMatch(/symlink ancestors/);
  });
});

function makePlanReceipt() {
  return {
    schemaVersion: 'tf.atomistic-reproduction-receipt/0.1',
    profile: 'plan',
    claimEligible: false,
    status: 'planned-not-run',
    createdAt: '2026-08-28T16:00:00Z',
    plan: { schemaVersion: 'tf.atomistic-reproduction/0.2', digest: CURRENT_PLAN_DIGEST },
    source: { repository: EXPECTED_REPOSITORY, repositoryId: EXPECTED_REPOSITORY_ID, revision: SOURCE_SHA, treeDigest: digest('tree') },
  };
}

function makeSmokeReceipt() {
  return makeExecutedReceipt({
    profile: 'smoke',
    claimEligible: false,
    status: 'smoke-passed',
    workflowPath: SMOKE_WORKFLOW_PATH,
    event: 'pull_request',
    ref: 'refs/pull/42/merge',
    ids: [...RANDOM_TP_SMOKE_IDS],
    atoms: 160,
    elements: 89,
    recordManifestDigest: digest('smoke-record-manifest'),
  });
}

function makeFullReceipt() {
  return makeExecutedReceipt({
    profile: 'full',
    claimEligible: true,
    status: 'verified',
    workflowPath: FULL_WORKFLOW_PATH,
    event: 'workflow_dispatch',
    ref: 'refs/heads/main',
    ids: [...RANDOM_TP_IDS],
    atoms: 11088,
    elements: 89,
    recordManifestDigest: EXPECTED_ASSETS.recordManifestDigest,
  });
}

function makeExecutedReceipt({ profile, claimEligible, status, workflowPath, event, ref, ids, atoms, elements, recordManifestDigest }) {
  const runnerDigest = digest('runner');
  const matterContainer = digest('matter-container');
  const maceContainer = digest('mace-container');
  const matterLock = digest('matter-lock');
  const maceLock = digest('mace-lock');
  const evidenceBundleDigest = digest(`${profile}-evidence-bundle`);
  const artifactApiDigest = digest(`${profile}-api-artifact`);
  const runId = 987654321;
  const runAttempt = 2;
  const hardwareId = 'runner-linux-x64-01';
  const models = [
    makeModel({
      comparatorId: 'mattersim-1.0.0-5m', modelId: 'mattersim-v1.0.0-5m', role: 'active',
      resultClass: profile === 'full' ? 'REPRODUCED_MODEL_CARD_PROTOCOL' : 'smoke-only', status: profile === 'full' ? 'complete' : 'smoke-complete',
      packageName: 'mattersim', packageVersion: '1.2.5', packageDigest: EXPECTED_ASSETS.models['mattersim-1.0.0-5m'].packageDigest,
      checkpointDigest: EXPECTED_ASSETS.models['mattersim-1.0.0-5m'].checkpointDigest,
      containerDigest: matterContainer, dependencyLockDigest: matterLock, runnerDigest, hardwareId, ids, atoms, elements,
      root: digest('matter-root'), resultBundle: digest('matter-result-bundle'), e3nn: '0.5.8',
      metrics: profile === 'full'
        ? makeFullMetrics('mattersim', {
          energy: MATTERSIM_PROTOCOL.targets.energyMaeEvPerAtom,
          force: MATTERSIM_PROTOCOL.targets.forceVectorMaeEvPerAngstrom,
          stress: MATTERSIM_PROTOCOL.targets.stressFrobeniusMaeGpa,
        })
        : { ...MATTERSIM_PROTOCOL.targets },
      protocolAcceptance: { targets: { ...MATTERSIM_PROTOCOL.targets }, tolerances: { ...MATTERSIM_PROTOCOL.tolerances }, passed: true },
    }),
    makeModel({
      comparatorId: 'mace-mpa-0', modelId: 'mace-mpa-0-medium', role: 'challenger',
      resultClass: profile === 'full' ? 'ENGINEERING_BASELINE_COMPLETE' : 'smoke-only', status: profile === 'full' ? 'complete' : 'smoke-complete',
      packageName: 'mace-torch', packageVersion: '0.3.16', packageDigest: EXPECTED_ASSETS.models['mace-mpa-0'].packageDigest,
      checkpointDigest: EXPECTED_ASSETS.models['mace-mpa-0'].checkpointDigest,
      containerDigest: maceContainer, dependencyLockDigest: maceLock, runnerDigest, hardwareId, ids, atoms, elements,
      root: digest('mace-root'), resultBundle: digest('mace-result-bundle'), e3nn: '0.4.4',
      metrics: profile === 'full'
        ? makeFullMetrics('mace', { energy: 0.25, force: 0.9, stress: 2.2 })
        : { energyMaeEvPerAtom: 0.25, forceVectorMaeEvPerAngstrom: 0.9, stressFrobeniusMaeGpa: 2.2 },
      protocolAcceptance: null,
    }),
  ];

  const bundle = {
    mediaType: 'application/vnd.dev.sigstore.bundle.v0.3+json',
    verificationMaterial: { certificate: 'synthetic-test-certificate' },
    dsseEnvelope: { payload: 'synthetic-test-payload', signatures: [{ sig: 'synthetic-test-signature' }] },
  };
  const receipt = {
    schemaVersion: 'tf.atomistic-reproduction-receipt/0.1',
    profile,
    claimEligible,
    status,
    createdAt: '2026-08-28T16:00:00Z',
    plan: { schemaVersion: 'tf.atomistic-reproduction/0.2', digest: CURRENT_PLAN_DIGEST },
    source: { repository: EXPECTED_REPOSITORY, repositoryId: EXPECTED_REPOSITORY_ID, revision: SOURCE_SHA, treeDigest: digest('tree') },
    benchmark: {
      id: 'mattersim-random-tp', datasetDigest: EXPECTED_ASSETS.datasetDigest,
      idSetDigest: profile === 'full' ? EXPECTED_ASSETS.idSetDigest : EXPECTED_ASSETS.smokeIdSetDigest,
      recordManifestDigest,
      structureBundleDigest: EXPECTED_ASSETS.structureBundleDigest,
      structureManifestFileDigest: EXPECTED_ASSETS.structureManifestFileDigest,
      structureManifestRoot: profile === 'full' ? EXPECTED_ASSETS.structureManifestRoot : EXPECTED_ASSETS.smokeStructureManifestRoot,
      frames: ids.length, atoms, elements, recordIds: [...ids],
    },
    runner: {
      digest: runnerDigest,
      recordCodecDigest: digest('record-codec'),
      containers: { 'mattersim-v1.0.0-5m': matterContainer, 'mace-mpa-0-medium': maceContainer },
      dependencyLocks: { 'mattersim-v1.0.0-5m': matterLock, 'mace-mpa-0-medium': maceLock },
    },
    hardware: {
      id: hardwareId,
      runnerClass: 'github-hosted',
      os: 'Linux Ubuntu 24.04.3 LTS',
      architecture: 'x64',
      kernel: 'Linux 6.8.0-test',
      cpu: { model: 'Synthetic x86_64 CPU', logicalCores: 16 },
      memoryBytes: 68719476736,
      accelerators: [{ kind: 'gpu', model: 'Synthetic CUDA GPU', count: 1, driver: '580.65', runtime: 'CUDA 12.8' }],
      containerRuntime: { name: 'docker', version: '28.3.3' },
    },
    models,
    provenance: {
      workflow: { path: workflowPath, id: 123456, runId, runAttempt, event, ref, sha: SOURCE_SHA },
      artifact: {
        id: 246810,
        name: `tailing-atomistic-${profile}-${SOURCE_SHA}-${runId}-${runAttempt}`,
        apiDigest: artifactApiDigest,
        subjectName: `tailing-atomistic-${profile}-${SOURCE_SHA}.tar.zst`,
        subjectDigest: evidenceBundleDigest,
        expiresAt: '2099-01-01T00:00:00Z',
        expired: false,
      },
      attestation: {
        bundle,
        bundleDigest: digestCanonical(bundle),
        rawBundleDigest: digest(`${profile}-raw-attestation-bundle`),
        subjectName: `tailing-atomistic-${profile}-${SOURCE_SHA}.tar.zst`,
        subjectDigest: evidenceBundleDigest,
        verified: true,
        verifiedClaims: {
          issuer: 'https://token.actions.githubusercontent.com',
          repository: EXPECTED_REPOSITORY,
          repositoryId: EXPECTED_REPOSITORY_ID,
          workflowPath,
          runId,
          runAttempt,
          sourceRevision: SOURCE_SHA,
          event,
          ref,
          builderId: expectedAttestationBuilderId(workflowPath, ref),
          buildType: EXPECTED_ATTESTATION_BUILD_TYPE,
          runnerEnvironment: EXPECTED_ATTESTATION_RUNNER_ENVIRONMENT,
          predicateType: EXPECTED_ATTESTATION_PREDICATE_TYPE,
        },
      },
    },
    verification: {
      verdict: 'pass',
      verifiedAt: '2026-08-28T16:01:00Z',
      independentVerifierDigest: digest('independent-verifier'),
      artifactObservation: {
        id: 246810,
        name: `tailing-atomistic-${profile}-${SOURCE_SHA}-${runId}-${runAttempt}`,
        apiDigest: artifactApiDigest,
        expiresAt: '2099-01-01T00:00:00Z',
        expired: false,
      },
      checks: {
        recordCompleteness: true, finiteOutputs: true, digestBindings: true, merkleVerified: true,
        metricsRecomputed: true, provenanceVerified: true, attestationVerified: true, networkIsolationVerified: true,
      },
    },
    cost: {
      measured: {
        wallSeconds: 1200.5, cpuSeconds: 2400.25, gpuSeconds: 0,
        peakHostMemoryBytes: 17179869184, peakAcceleratorMemoryBytes: 0,
        inputBytes: 173000000, outputBytes: 25000000,
      },
      estimated: {
        isEstimate: true, currency: 'USD', amount: 3.75,
        method: 'Measured accelerator seconds multiplied by the frozen hourly rate.',
        pricingSourceDigest: digest('pricing-source'), priceSnapshotAt: '2026-08-28T15:00:00Z',
      },
      actualBilledUsd: null,
    },
    evidenceBundleDigest,
  };
  if (profile === 'full') {
    receipt.scientificValidation = {
      status: 'passed',
      root: digest('pending-scientific-root'),
      models: [
        makeScientificModel('mattersim-1.0.0-5m'),
        makeScientificModel('mace-mpa-0'),
      ],
    };
    receipt.scientificValidation.root = computeScientificValidationRoot(receipt);
  }
  return receipt;
}

function makeScientificModel(comparatorId) {
  return {
    comparatorId,
    invariance: {
      status: 'passed',
      structureIds: [...RANDOM_TP_SMOKE_IDS],
      transformations: ['translation', 'permutation', 'proper-rotation', 'periodic-image'],
      cases: 40,
      protocol: {
        translationFractionalShift: [0.173, 0.271, 0.389],
        permutation: 'reverse-atom-order/v1',
        properRotation: [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
        periodicImageShift: 'zero-based-atom-i-r_i-prime=r_i+A0[i-mod-3]-cell-unchanged-no-wrap/v1',
      },
      failedCases: [],
      maximumErrors: { energyEv: 0.00005, forceVectorEvPerAngstrom: 0.00005, stressFrobeniusEvPerAngstrom3: 0.000005 },
      evidenceRoot: digest(`${comparatorId}-invariance-evidence`),
    },
    forceFiniteDifference: {
      status: 'passed',
      elements: 89,
      cases: 89,
      selection: 'for-each-element-in-frozen-set-lexicographically-first-id-containing-element-lowest-zero-based-atom-index-axis-Z-modulo-3/v1',
      axisConvention: 'zero-based-x0-y1-z2',
      displacement: 'cartesian-coordinate-plus-minus-h-fixed-cell-and-other-coordinates/v1',
      stepsAngstrom: [0.01, 0.005],
      centralDifference: 'F_h=-(E(q+h)-E(q-h))/(2h)',
      richardson: 'four-f-half-minus-f-full-over-three',
      absoluteToleranceEvPerAngstrom: 0.02,
      relativeTolerance: 0.01,
      scale: 'max(abs(analytic-force-component),abs(richardson-finite-difference))',
      rule: 'absolute-error-less-than-or-equal-to-absolute-plus-relative-times-scale',
      allPass: 'exactly-89-element-selections-each-pass-no-drop-no-reselection',
      failedCases: [],
      maximumNormalizedError: 0.5,
      evidenceRoot: digest(`${comparatorId}-force-fd-evidence`),
    },
    stressFiniteDifference: {
      status: 'passed',
      structureIds: [...RANDOM_TP_SMOKE_IDS],
      voigtModes: ['xx', 'yy', 'zz', 'yz', 'xz', 'xy'],
      cases: 60,
      deformation: 'A_plus_minus=A0@(I_plus_minus_hE_mode)',
      coordinateConvention: 'fixed-fractional-coordinates',
      strainBasis: 'diagonal-one-engineering-shear-symmetric-one-half',
      referenceVolume: 'V0=abs(det(A0))',
      strainSteps: [0.002, 0.001],
      centralDifference: 'sigma_h=(E(+h)-E(-h))/(2hV0)',
      richardson: 'sigma=(4sigma_h_over_2-sigma_h)/3',
      comparison: 'same-sign-corresponding-ASE-stress-component-no-sign-selection',
      absoluteToleranceEvPerAngstrom3: 0.005,
      relativeTolerance: 0.02,
      scale: 'max(abs(analytic-ASE-component),abs(richardson-finite-difference))',
      rule: 'absolute-error-less-than-or-equal-to-absolute-plus-relative-times-scale',
      allPass: 'exactly-10-structures-times-6-modes-pass-no-drop',
      automaticSignSelectionAllowed: false,
      failedCases: [],
      maximumNormalizedError: 0.5,
      evidenceRoot: digest(`${comparatorId}-stress-fd-evidence`),
    },
    batchEquivalence: {
      canonicalBatchSize: 1,
      status: 'not-run-canonical-batch1-only',
      acceleratedBatchEligible: false,
      acceleratedExecutionClaimed: false,
    },
  };
}

function makeFullMetrics(modelLabel, means) {
  const reports = Object.fromEntries(['energy', 'force', 'stress'].map((metric) => {
    const mean = means[metric];
    return [metric, {
      ...METRIC_REPORT_PROTOCOL.reports[metric],
      aggregation: METRIC_REPORT_PROTOCOL.aggregation,
      summation: METRIC_REPORT_PROTOCOL.summation,
      quantileMethod: METRIC_REPORT_PROTOCOL.quantileMethod,
      mean,
      p50: mean * 0.8,
      p90: mean * 1.2,
      p95: mean * 1.3,
      p99: mean * 1.5,
      worst: { id: RANDOM_TP_IDS.at(-1), error: mean * 2 },
      worstTieBreak: METRIC_REPORT_PROTOCOL.worstTieBreak,
      perIdMetricEvidenceRoot: digest(`${modelLabel}-${metric}-per-id-metric-evidence`),
      perIdMetricEvidenceRootProtocol: METRIC_REPORT_PROTOCOL.perIdMetricEvidenceRootProtocol,
    }];
  }));
  return { definitionId: METRIC_REPORT_PROTOCOL.definitionId, ...reports };
}

function makeModel({ comparatorId, modelId, role, resultClass, status, packageName, packageVersion, packageDigest, checkpointDigest, containerDigest, dependencyLockDigest, runnerDigest, hardwareId, ids, atoms, elements, root, resultBundle, e3nn, metrics, protocolAcceptance }) {
  return {
    comparatorId,
    modelId,
    role,
    resultClass,
    status,
    package: { name: packageName, version: packageVersion, digest: packageDigest },
    checkpointDigest,
    datasetDigest: EXPECTED_ASSETS.datasetDigest,
    runnerDigest,
    containerDigest,
    dependencyLockDigest,
    predictionMerkleRoot: root,
    resultBundleDigest: resultBundle,
    records: {
      expected: ids.length,
      produced: ids.length,
      atoms,
      elements,
      recordIds: [...ids],
      missingIds: [], duplicateIds: [], extraIds: [], failedIds: [], nonfiniteIds: [],
    },
    software: { python: '3.12.13', torch: '2.8.0+cpu', ase: '3.28.0', e3nn },
    execution: { hardwareId, threads: 1, batchSize: 1, dtype: 'float32', device: 'cpu', seed: 20260828, deterministic: true },
    metrics,
    protocolAcceptance,
    superiorityClaimed: false,
  };
}

function makeComparator(receipt, comparatorId) {
  const model = receipt.models.find((entry) => entry.comparatorId === comparatorId);
  return {
    id: comparatorId,
    evidenceClass: 'reproduced',
    comparable: true,
    receiptPath: `evaluation/atomistic/receipts/${comparatorId}.json`,
    resultClass: model.resultClass,
    superiorityClaimed: false,
    packageDigest: model.package.digest,
    checkpointDigest: model.checkpointDigest,
    datasetDigest: receipt.benchmark.datasetDigest,
    runnerDigest: receipt.runner.digest,
    containerDigest: model.containerDigest,
    dependencyLockDigest: model.dependencyLockDigest,
    predictionMerkleRoot: model.predictionMerkleRoot,
    resultBundleDigest: model.resultBundleDigest,
    evidenceBundleDigest: receipt.evidenceBundleDigest,
    independentVerifierDigest: receipt.verification.independentVerifierDigest,
    reproductionSourceRevision: receipt.source.revision,
    artifactApiDigest: receipt.provenance.artifact.apiDigest,
    attestationBundleDigest: receipt.provenance.attestation.bundleDigest,
    attestationRawBundleDigest: receipt.provenance.attestation.rawBundleDigest,
  };
}

function promotionOptions(receipt) {
  const { workflow, artifact, attestation } = receipt.provenance;
  const receiptBytes = canonicalReceiptBytes(receipt);
  return {
    ...POLICY_OPTIONS,
    receiptBytes,
    trustedPromotionContext: {
      attestationCryptographicallyVerified: true,
      artifactDownloadedFromActionsApi: true,
      receiptRawDigest: sha256(receiptBytes),
      receiptCanonicalDigest: digestCanonical(receipt),
      source: { revision: receipt.source.revision, treeDigest: receipt.source.treeDigest },
      hardwareDigest: digestCanonical(receipt.hardware),
      workflow: { ...workflow },
      artifact: { ...artifact },
      attestation: {
        bundleDigest: attestation.bundleDigest,
        rawBundleDigest: attestation.rawBundleDigest,
        subjectName: attestation.subjectName,
        subjectDigest: attestation.subjectDigest,
        decodedVerifiedClaims: structuredClone(attestation.verifiedClaims),
        certificate: {
          issuer: EXPECTED_ATTESTATION_ISSUER,
          subjectAlternativeName: expectedAttestationBuilderId(workflow.path, workflow.ref),
          sourceRepository: EXPECTED_REPOSITORY,
          repositoryId: EXPECTED_REPOSITORY_ID,
          sourceDigest: workflow.sha,
          sourceRef: workflow.ref,
          signerWorkflow: expectedAttestationSignerWorkflow(workflow.path),
          signerDigest: workflow.sha,
          runId: workflow.runId,
          runAttempt: workflow.runAttempt,
          runnerEnvironment: EXPECTED_ATTESTATION_RUNNER_ENVIRONMENT,
        },
        verificationPolicy: {
          repository: EXPECTED_REPOSITORY,
          signerWorkflow: expectedAttestationSignerWorkflow(workflow.path),
          signerDigest: workflow.sha,
          sourceDigest: workflow.sha,
          sourceRef: workflow.ref,
          predicateType: EXPECTED_ATTESTATION_PREDICATE_TYPE,
          denySelfHostedRunners: true,
        },
        verifiedTimestamps: ['2026-08-28T16:00:30Z'],
      },
      evidenceBundleDigest: receipt.evidenceBundleDigest,
      recordCodecDigest: receipt.runner.recordCodecDigest,
      independentVerifierDigest: receipt.verification.independentVerifierDigest,
      pricingSourceDigest: receipt.cost.estimated.pricingSourceDigest,
      scientificValidationRoot: receipt.scientificValidation?.root,
      structureInputs: {
        bundleDigest: receipt.benchmark.structureBundleDigest,
        manifestFileDigest: receipt.benchmark.structureManifestFileDigest,
        manifestRoot: receipt.benchmark.structureManifestRoot,
      },
      modelOutputs: Object.fromEntries(receipt.models.map((model) => [model.comparatorId, {
        predictionMerkleRoot: model.predictionMerkleRoot,
        resultBundleDigest: model.resultBundleDigest,
        modelReceiptDigest: digestCanonical(model),
        metricsDigest: digestCanonical(model.metrics),
        metricReports: model.metrics.definitionId
          ? Object.fromEntries(['energy', 'force', 'stress'].map((metric) => [metric, {
            report: structuredClone(model.metrics[metric]),
            reportDigest: digestCanonical(model.metrics[metric]),
            perIdMetricEvidenceRoot: model.metrics[metric].perIdMetricEvidenceRoot,
          }]))
          : {},
      }])),
    },
  };
}
