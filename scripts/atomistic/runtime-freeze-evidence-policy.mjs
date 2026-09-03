import { execFile as execFileCallback } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  realpath,
  rm,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import {
  inspectBootstrapReplicaReceiptBytes,
} from './bootstrap-replica-receipt-policy.mjs';
import {
  canonicalJson,
  parseJsonRejectDuplicateKeys,
  sha256,
} from './runtime-input-contract.mjs';

export const RUNTIME_FREEZE_EVIDENCE_DIRECTORY = 'evaluation/atomistic/evidence/r6e-verifier-33296529694';
export const RUNTIME_FREEZE_RECEIPT_PATH = `${RUNTIME_FREEZE_EVIDENCE_DIRECTORY}/atomistic-bootstrap-replica-receipt.json`;
export const RUNTIME_FREEZE_ATTESTATION_PATH = `${RUNTIME_FREEZE_EVIDENCE_DIRECTORY}/receipt-attestation.sigstore.jsonl`;
export const RUNTIME_FREEZE_TRUSTED_ROOT_PATH = `${RUNTIME_FREEZE_EVIDENCE_DIRECTORY}/trusted-root.jsonl`;

const REPOSITORY_FULL_NAME = 'tony070926-sudo/tailing-future';
const REPOSITORY_ID = 1_349_498_456;
const REPOSITORY_OWNER_ID = 288_004_538;
const REPOSITORY_URL = `https://github.com/${REPOSITORY_FULL_NAME}`;
const REPOSITORY_GIT_URI = `git+${REPOSITORY_URL}@refs/heads/main`;
const VERIFIER_WORKFLOW_PATH = '.github/workflows/atomistic-bootstrap-verify.yml';
const VERIFIER_IMPLEMENTATION_PATH = 'scripts/atomistic/verify-bootstrap-replicas.mjs';
const VERIFIER_REVISION = 'fb687f8cbe4841de496031415be0053bd0c7c510';
const BOOTSTRAP_SOURCE_REVISION = '687755a5835b92b632fc116e9b73ab11c1eb6cb5';
const VERIFIER_RUN_ID = 33_296_529_694;
const VERIFIER_RUN_ATTEMPT = 1;
const VERIFIER_REF = 'refs/heads/main';
const VERIFIER_EVENT = 'workflow_dispatch';
const VERIFIER_WORKFLOW_NAME = 'Atomistic bootstrap replica verifier (non-promotional)';
const CERTIFICATE_IDENTITY = `${REPOSITORY_URL}/${VERIFIER_WORKFLOW_PATH}@${VERIFIER_REF}`;
const INVOCATION_ID = `${REPOSITORY_URL}/actions/runs/${VERIFIER_RUN_ID}/attempts/${VERIFIER_RUN_ATTEMPT}`;
const OIDC_ISSUER = 'https://token.actions.githubusercontent.com';
const PREDICATE_TYPE = 'https://slsa.dev/provenance/v1';
const BUILD_TYPE = 'https://actions.github.io/buildtypes/workflow/v1';
const RUNNER_ENVIRONMENT = 'github-hosted';
const RECEIPT_SUBJECT_NAME = 'atomistic-bootstrap-replica-receipt.json';
const RECEIPT_RAW_DIGEST = 'sha256:d12b91beb970df2212a3cc69c58b044f9bd4059d13cf435cd23e608c55ad19c4';
const RECEIPT_SEMANTIC_DIGEST = 'sha256:ab6a7ea36118e388bc26fca532f571a34536156a0226d027708f793adbfad868';
const RECEIPT_SIZE_BYTES = 27_676;
const ATTESTATION_RAW_DIGEST = 'sha256:2200a92fadbb596e5b16ee7b66b097f2aa3fa7f756ff15066d2d2b4a4b85b542';
const ATTESTATION_SIZE_BYTES = 11_787;
const TRUSTED_ROOT_RAW_DIGEST = 'sha256:65ca537f6ed8a47fd0e560c421baa1f6c1efb8b25fc200d8c5c02c0e92eb2b9c';
const TRUSTED_ROOT_SIZE_BYTES = 34_634;
const REKOR_INTEGRATED_AT = '2026-08-30T06:17:17Z';
const REKOR_INTEGRATED_TIME_EPOCH = 1_788_070_637;
const ATTESTATION_MEDIA_TYPE = 'application/vnd.dev.sigstore.bundle.v0.3+json';
const execFile = promisify(execFileCallback);

export const MINIMUM_SYSTEM_PATH = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
].join(path.delimiter);

export const RUNTIME_FREEZE_GH_CHILD_PATH = ['/usr/bin', '/bin'].join(path.delimiter);

export const RUNTIME_FREEZE_GH_PATH_ENV = 'TAILING_RUNTIME_FREEZE_GH_PATH';

export const EXPECTED_RUNTIME_FREEZE_GH_CLI = deepFreeze({
  version: '2.98.0',
  releasedAt: '2026-08-20',
  releaseUrl: 'https://github.com/cli/cli/releases/tag/v2.98.0',
  releaseTagCommit: 'a255baf71d13fe5947a4eb7ad521ffd412d64cee',
  checksums: {
    url: 'https://github.com/cli/cli/releases/download/v2.98.0/gh_2.98.0_checksums.txt',
    sizeBytes: 1_950,
    sha256: 'sha256:275b90ae8a642fb8bdf4f21d7673e34643a445f7993f1821ac917ff8a2cc4db9',
  },
  platforms: {
    'darwin-arm64': {
      defaultPath: null,
      archiveName: 'gh_2.98.0_macOS_arm64.zip',
      archiveSha256: 'sha256:8cfb027cc5310675f2b830eac8f9865c1155a45ffcf9757f699fdd5a22046ca4',
      executableSizeBytes: 39_256_176,
      executableSha256: 'sha256:eedbfd5b8071027fe6326826eded48d274f1ec9d93f9239d9ba778ea1f479ac9',
    },
    'linux-x64': {
      defaultPath: '/usr/bin/gh',
      archiveName: 'gh_2.98.0_linux_amd64.deb',
      archiveSha256: 'sha256:f65a3fa2fa0eb2e97c445ee3f5e087a40aae03b64847f45a8f13805e504535d6',
      executableSizeBytes: 41_377_954,
      executableSha256: 'sha256:62885b97de6a0cd85e616cdd94bcda908bf5cf1018094385892b05cea3537163',
    },
  },
});

const EXACT_EVIDENCE_FILES = deepFreeze({
  receipt: {
    path: RUNTIME_FREEZE_RECEIPT_PATH,
    sizeBytes: RECEIPT_SIZE_BYTES,
    digest: RECEIPT_RAW_DIGEST,
  },
  attestation: {
    path: RUNTIME_FREEZE_ATTESTATION_PATH,
    sizeBytes: ATTESTATION_SIZE_BYTES,
    digest: ATTESTATION_RAW_DIGEST,
  },
  trustedRoot: {
    path: RUNTIME_FREEZE_TRUSTED_ROOT_PATH,
    sizeBytes: TRUSTED_ROOT_SIZE_BYTES,
    digest: TRUSTED_ROOT_RAW_DIGEST,
  },
});

export const EXPECTED_RUNTIME_FREEZE_EVIDENCE = deepFreeze({
  protocol: 'externally-attested-bootstrap-runtime-freeze/v1',
  verifier: {
    repositoryFullName: REPOSITORY_FULL_NAME,
    repositoryId: REPOSITORY_ID,
    workflow: {
      path: VERIFIER_WORKFLOW_PATH,
      id: 345_720_281,
      name: VERIFIER_WORKFLOW_NAME,
      revision: VERIFIER_REVISION,
      gitBlobOid: 'f07254a46f02ad3fedca2aefa1dc76a90cb93e41',
      sizeBytes: 11_808,
      sha256: 'sha256:39a2ebedeaf136b127cb66c20e89f121e211085985b14d3c40fd7dc9eb5626eb',
      ref: VERIFIER_REF,
      event: VERIFIER_EVENT,
      runId: VERIFIER_RUN_ID,
      runAttempt: VERIFIER_RUN_ATTEMPT,
      runStatus: 'completed',
      runConclusion: 'success',
      runCreatedAt: '2026-08-30T06:16:38Z',
      runUpdatedAt: '2026-08-30T06:17:19Z',
    },
    implementation: {
      path: VERIFIER_IMPLEMENTATION_PATH,
      gitBlobOid: '27d5e0885f67dbe2c9196618ed13840ddc1c5b9b',
      sizeBytes: 66_134,
      sha256: 'sha256:877e57767b13d52a9abe41236a3ea3ac1f2b41a616b5acac4b891df4e9cb6441',
    },
  },
  sourceReceipt: {
    path: RUNTIME_FREEZE_RECEIPT_PATH,
    schemaVersion: 'tf.atomistic-bootstrap-replica-receipt/0.1',
    sizeBytes: RECEIPT_SIZE_BYTES,
    rawDigest: RECEIPT_RAW_DIGEST,
    semanticDigest: RECEIPT_SEMANTIC_DIGEST,
    createdAt: '2026-08-30T06:17:07.843Z',
    status: 'verified-stable-input-agreement',
    stableInputsCommitment: 'sha256:b4183913307ca0810813c66a3963de1cb20f63ae2000121f9d1016eac94fbfcb',
  },
  artifact: {
    id: 9_727_579_469,
    name: 'tailing-atomistic-bootstrap-replica-receipt-fb687f8cbe4841de496031415be0053bd0c7c510-33296529694-1',
    sizeBytes: 6_811,
    archiveDigest: 'sha256:61a191224f5b1922a118302919f6e8cc192c3ba7cee5b3b5c30d3ed98ab5ba8a',
    createdAt: '2026-08-30T06:17:08Z',
    updatedAt: '2026-08-30T06:17:08Z',
    expiresAt: '2026-09-06T06:17:08Z',
    apiExpiredAtCapture: false,
  },
  attestation: {
    attestationId: 43_928_932,
    repository: {
      fullName: REPOSITORY_FULL_NAME,
      id: REPOSITORY_ID,
    },
    bundlePath: RUNTIME_FREEZE_ATTESTATION_PATH,
    mediaType: ATTESTATION_MEDIA_TYPE,
    sizeBytes: ATTESTATION_SIZE_BYTES,
    rawDigest: ATTESTATION_RAW_DIGEST,
    subjectName: RECEIPT_SUBJECT_NAME,
    subjectDigest: RECEIPT_RAW_DIGEST,
    predicateType: PREDICATE_TYPE,
    buildType: BUILD_TYPE,
    certificateIdentity: CERTIFICATE_IDENTITY,
    oidcIssuer: OIDC_ISSUER,
    sourceRepository: REPOSITORY_URL,
    sourceRef: VERIFIER_REF,
    sourceRevision: VERIFIER_REVISION,
    runnerEnvironment: RUNNER_ENVIRONMENT,
    invocationId: INVOCATION_ID,
    rekorIntegratedAt: REKOR_INTEGRATED_AT,
    rekorIntegratedTimeEpoch: REKOR_INTEGRATED_TIME_EPOCH,
    transparencyLog: {
      globalLogIndex: 2_647_884_657,
      inclusionProofLogIndex: 2_525_980_395,
      treeSize: 2_525_980_413,
      integratedTimeEpoch: REKOR_INTEGRATED_TIME_EPOCH,
      indexSemantics: 'rekor-v1-global-entry-index-and-shard-local-inclusion-proof-index/v1',
      checkpoint: {
        origin: 'rekor.sigstore.dev - 1193050959916656506',
        treeId: '1193050959916656506',
        treeSize: 2_525_980_413,
        rootHash: 'LxShnheCrgeQmKw8BGv8CEDGlrqFGM03YfxEgjA4XYM=',
      },
    },
  },
  trustedRoot: {
    path: RUNTIME_FREEZE_TRUSTED_ROOT_PATH,
    sizeBytes: TRUSTED_ROOT_SIZE_BYTES,
    rawDigest: TRUSTED_ROOT_RAW_DIGEST,
    semantics: 'offline-verification-root-snapshot-not-runtime-promotion-trust-root/v1',
    nonAuthoritativeSnapshot: true,
  },
  receiptVerification: {
    verifierAcceptedReplicaCount: 2,
    runtimeLockAcceptedReplicaCountBeforeCommitF: 0,
    runtimeLockFreezeCandidate: true,
    runtimeLockFreezeAuthorized: false,
    externalReceiptAttestationRequired: true,
    scientificPromotionEligible: false,
    independentVerifierRequiredForScientificPromotion: true,
  },
});

export const EXPECTED_FROZEN_RUNTIME_IDENTITIES = deepFreeze({
  runnerDigest: 'sha256:d6e83640f15926088c116312c27605570f9e9c8ba4e9a9988ef5bf4d3a974ed4',
  dependencyLockDigests: {
    mattersim: 'sha256:9c990909d1307bb32608d31b9ed217d2368c28e2048f6dec39e8dc4a2b63642b',
    mace: 'sha256:ae4b21b6f6d8ad98edcf2d5e0d938cd563379f494cce0b4aaa2e987332147e33',
  },
  runtimeInputManifestDigests: {
    mattersim: 'sha256:203acc5ec09c2e76a819ff384573c2c0aca1316f90c53f2e735c98e9daab5c53',
    mace: 'sha256:6bb7f79c5380bb54b0d5ff972c3f22cc27623d131291d3a7c1b2c4efff826f47',
  },
  ociImages: {
    identitySemantics: 'run-specific-diagnostics-not-promotion-trust-roots/v1',
    promotionTrustRoot: false,
    mattersim: { manifestDigest: null, configDigest: null },
    mace: { manifestDigest: null, configDigest: null },
  },
});

export const EXPECTED_FROZEN_RUNTIME_OBSERVATIONS = deepFreeze([
  {
    ordinal: 1,
    repositoryRevision: BOOTSTRAP_SOURCE_REVISION,
    ref: VERIFIER_REF,
    protectedMain: true,
    workflowId: 344_903_345,
    runId: 33_242_996_794,
    runAttempt: 1,
    observedAt: '2026-08-29T08:25:41Z',
    evidenceAttestedAt: REKOR_INTEGRATED_AT,
    conclusion: 'success',
    stableInputsCommitment: EXPECTED_RUNTIME_FREEZE_EVIDENCE.sourceReceipt.stableInputsCommitment,
    acceptanceReceiptRawDigest: RECEIPT_RAW_DIGEST,
    identities: stableObservationIdentities(),
  },
  {
    ordinal: 2,
    repositoryRevision: BOOTSTRAP_SOURCE_REVISION,
    ref: VERIFIER_REF,
    protectedMain: true,
    workflowId: 344_903_345,
    runId: 33_242_999_376,
    runAttempt: 1,
    observedAt: '2026-08-29T08:28:15Z',
    evidenceAttestedAt: REKOR_INTEGRATED_AT,
    conclusion: 'success',
    stableInputsCommitment: EXPECTED_RUNTIME_FREEZE_EVIDENCE.sourceReceipt.stableInputsCommitment,
    acceptanceReceiptRawDigest: RECEIPT_RAW_DIGEST,
    identities: stableObservationIdentities(),
  },
]);

/**
 * Verify the complete, checked-in Commit F evidence chain. This function never
 * consults GitHub or Sigstore over the network: the receipt, bundle and trusted
 * root are exact checked-in bytes, and `gh attestation verify` receives both
 * `--bundle` and `--custom-trusted-root`.
 */
export async function validateRuntimeFreezeEvidence(lock, options = {}) {
  const root = path.resolve(options.root ?? process.cwd());
  const failures = [];
  let receipt = null;
  let bundle = null;

  compare(failures, 'freezeEvidence', lock?.freezeEvidence, EXPECTED_RUNTIME_FREEZE_EVIDENCE);
  compare(failures, 'identities', lock?.identities, EXPECTED_FROZEN_RUNTIME_IDENTITIES);
  compare(failures, 'replication.acceptedProtectedMainReplicas', lock?.replication?.acceptedProtectedMainReplicas, 2);
  compare(failures, 'replication.observations', lock?.replication?.observations, EXPECTED_FROZEN_RUNTIME_OBSERVATIONS);

  let evidenceFiles;
  try {
    evidenceFiles = await readExactEvidenceFiles(root);
  } catch (error) {
    failures.push(`runtime-freeze.evidence-files: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (evidenceFiles) {
    const receiptInspection = inspectRuntimeFreezeReceiptBytes(evidenceFiles.receipt.bytes);
    receipt = receiptInspection.receipt;
    compare(failures, 'sourceReceipt.rawDigest', receiptInspection.rawDigest, RECEIPT_RAW_DIGEST);
    compare(failures, 'sourceReceipt.semanticDigest', receiptInspection.semanticDigest, RECEIPT_SEMANTIC_DIGEST);
    failures.push(...receiptInspection.failures.map((failure) => `sourceReceipt.policy: ${failure}`));
    if (receipt) failures.push(...validateReceiptProjection(lock, receipt));

    try {
      bundle = parseSingleBundle(evidenceFiles.attestation.bytes);
      failures.push(...validateRawBundleProjection(lock, bundle));
    } catch (error) {
      failures.push(`runtime-freeze.attestation-bundle: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  failures.push(...await validateVerifierGitHistory(root, options.runGit));

  if (evidenceFiles) {
    failures.push(...await verifyAttestationSnapshotOffline(root, lock, options.runGh, evidenceFiles));
  }

  return {
    ok: failures.length === 0,
    failures: [...new Set(failures)],
    receipt,
    bundle,
  };
}

export function validateRuntimeFreezeProjection(lock, receipt) {
  const failures = [];
  compare(failures, 'freezeEvidence', lock?.freezeEvidence, EXPECTED_RUNTIME_FREEZE_EVIDENCE);
  compare(failures, 'identities', lock?.identities, EXPECTED_FROZEN_RUNTIME_IDENTITIES);
  compare(failures, 'replication.acceptedProtectedMainReplicas', lock?.replication?.acceptedProtectedMainReplicas, 2);
  compare(failures, 'replication.observations', lock?.replication?.observations, EXPECTED_FROZEN_RUNTIME_OBSERVATIONS);
  if (receipt) failures.push(...validateReceiptProjection(lock, receipt));
  return failures;
}

export function inspectRuntimeFreezeReceiptBytes(bytes) {
  let buffer;
  try { buffer = toBuffer(bytes, 'runtime-freeze source receipt'); }
  catch (error) { return { receipt: null, rawDigest: null, semanticDigest: null, failures: [error.message] }; }
  const failures = [];
  if (buffer.length !== RECEIPT_SIZE_BYTES) failures.push('sourceReceipt.sizeBytes: exact runtime-freeze receipt size mismatch');
  if (sha256(buffer) !== RECEIPT_RAW_DIGEST) failures.push('sourceReceipt.rawDigest: exact runtime-freeze receipt byte digest mismatch');
  const inspection = inspectBootstrapReplicaReceiptBytes(buffer, {
    expectedVerifierRevision: VERIFIER_REVISION,
    expectedVerifierRunId: VERIFIER_RUN_ID,
    expectedVerifierRunAttempt: VERIFIER_RUN_ATTEMPT,
    expectedVerifierScriptDigest: EXPECTED_RUNTIME_FREEZE_EVIDENCE.verifier.implementation.sha256,
    expectedVerifierWorkflowId: EXPECTED_RUNTIME_FREEZE_EVIDENCE.verifier.workflow.id,
    now: REKOR_INTEGRATED_AT,
    requireArtifactsLiveAtValidation: false,
  });
  failures.push(...inspection.failures);
  if (inspection.semanticDigest !== RECEIPT_SEMANTIC_DIGEST) failures.push('sourceReceipt.semanticDigest: exact runtime-freeze receipt semantic digest mismatch');
  return { ...inspection, failures: [...new Set(failures)] };
}

export async function validateVerifierGitHistory(root = process.cwd(), injectedRunGit) {
  const repositoryRoot = path.resolve(root);
  const failures = [];
  const runGit = injectedRunGit ?? defaultRunGit;
  try {
    const verifierType = decodeAscii(await commandStdout(runGit, ['cat-file', '-t', VERIFIER_REVISION], gitOptions(repositoryRoot))).trim();
    compare(failures, 'runtime-freeze.git.verifierObjectType', verifierType, 'commit');
    const sourceType = decodeAscii(await commandStdout(runGit, ['cat-file', '-t', BOOTSTRAP_SOURCE_REVISION], gitOptions(repositoryRoot))).trim();
    compare(failures, 'runtime-freeze.git.sourceObjectType', sourceType, 'commit');
    const parents = decodeAscii(await commandStdout(runGit, ['show', '-s', '--format=%P', VERIFIER_REVISION], gitOptions(repositoryRoot))).trim();
    compare(failures, 'runtime-freeze.git.verifierParents', parents, BOOTSTRAP_SOURCE_REVISION);
    await commandStdout(runGit, ['merge-base', '--is-ancestor', VERIFIER_REVISION, 'HEAD'], gitOptions(repositoryRoot));

    for (const expected of [
      EXPECTED_RUNTIME_FREEZE_EVIDENCE.verifier.workflow,
      EXPECTED_RUNTIME_FREEZE_EVIDENCE.verifier.implementation,
    ]) {
      const blob = await readCommitBlob(runGit, repositoryRoot, VERIFIER_REVISION, expected.path);
      compare(failures, `runtime-freeze.git.${expected.path}.mode`, blob.mode, '100644');
      compare(failures, `runtime-freeze.git.${expected.path}.gitBlobOid`, blob.gitBlobOid, expected.gitBlobOid);
      compare(failures, `runtime-freeze.git.${expected.path}.sizeBytes`, blob.bytes.length, expected.sizeBytes);
      compare(failures, `runtime-freeze.git.${expected.path}.sha256`, sha256(blob.bytes), expected.sha256);
    }
  } catch (error) {
    failures.push(`runtime-freeze.git: unable to verify V as S's direct child/HEAD ancestor and read exact V blobs (${error instanceof Error ? error.message : String(error)})`);
  }
  return failures;
}

export async function verifyAttestationOffline(root, lock, injectedRunGh) {
  const repositoryRoot = path.resolve(root);
  let evidenceFiles;
  try {
    evidenceFiles = await readExactEvidenceFiles(repositoryRoot);
  } catch (error) {
    return [`runtime-freeze.attestation: exact evidence validation failed (${error instanceof Error ? error.message : String(error)})`];
  }
  return verifyAttestationSnapshotOffline(repositoryRoot, lock, injectedRunGh, evidenceFiles);
}

async function verifyAttestationSnapshotOffline(root, lock, injectedRunGh, verifiedEvidenceFiles) {
  const repositoryRoot = path.resolve(root);
  const failures = [];
  const runGh = injectedRunGh ?? defaultRunGh;
  let evidenceFiles;
  try {
    evidenceFiles = normalizeVerifiedEvidenceFiles(verifiedEvidenceFiles);
  } catch (error) {
    return [`runtime-freeze.attestation: exact evidence validation failed (${error instanceof Error ? error.message : String(error)})`];
  }
  let ghStateRoot;
  let output;
  let verificationError;
  let cleanupError;
  try {
    ghStateRoot = await mkdtemp(path.join(tmpdir(), 'tf-gh-offline-'));
    await chmod(ghStateRoot, 0o700);
    const temporaryEvidencePaths = await materializeVerifiedEvidenceFiles(ghStateRoot, evidenceFiles);
    const args = attestationVerificationArguments(repositoryRoot, temporaryEvidencePaths);
    output = normalizeVerifierStdout(
      await runGh(args, ghOptions(ghStateRoot)),
      'gh attestation verifier output',
    );
    await assertMaterializedEvidenceFilesUnchanged(temporaryEvidencePaths, evidenceFiles);
  } catch (error) {
    verificationError = error;
  } finally {
    if (ghStateRoot) {
      try {
        await rm(ghStateRoot, { recursive: true, force: true });
      } catch (error) {
        cleanupError = error;
      }
    }
  }
  if (verificationError || cleanupError) {
    const details = [verificationError, cleanupError && new Error(`temporary evidence cleanup failed: ${cleanupError.message ?? String(cleanupError)}`)]
      .filter(Boolean)
      .map((error) => error instanceof Error ? error.message : String(error))
      .join('; ');
    return [`runtime-freeze.attestation: offline gh verification failed (${details})`];
  }

  let results;
  try {
    const bytes = toBuffer(output, 'gh attestation verification output');
    if (bytes.length < 2 || bytes.length > 5 * 1024 * 1024) throw new Error('gh JSON output is outside the bounded size');
    results = parseJsonRejectDuplicateKeys(bytes, 'gh attestation verification output');
  } catch (error) {
    return [`runtime-freeze.attestation: gh returned invalid duplicate-member JSON (${error instanceof Error ? error.message : String(error)})`];
  }
  if (!Array.isArray(results) || results.length !== 1) {
    return ['runtime-freeze.attestation: gh must verify exactly one attestation result'];
  }

  const wrapper = results[0];
  requireExactObjectKeys(
    failures,
    'attestation.ghResult',
    wrapper,
    ['attestation', 'verificationResult'],
  );
  const attestationWrapper = wrapper?.attestation;
  requireExactObjectKeys(
    failures,
    'attestation.ghResult.attestation',
    attestationWrapper,
    ['bundle', 'bundle_url', 'initiator'],
  );
  compare(
    failures,
    'attestation.ghResult.attestation.bundle',
    attestationWrapper?.bundle,
    parseSingleBundle(evidenceFiles.attestation.bytes),
  );
  compare(failures, 'attestation.ghResult.attestation.bundle_url', attestationWrapper?.bundle_url, '');
  compare(failures, 'attestation.ghResult.attestation.initiator', attestationWrapper?.initiator, '');

  const result = wrapper?.verificationResult;
  requireExactObjectKeys(
    failures,
    'attestation.ghResult.verificationResult',
    result,
    ['mediaType', 'signature', 'statement', 'verifiedIdentity', 'verifiedTimestamps'],
  );
  compare(
    failures,
    'attestation.ghResult.verificationResult.mediaType',
    result?.mediaType,
    'application/vnd.dev.sigstore.verificationresult+json;version=0.1',
  );
  const certificate = result?.signature?.certificate;
  const statement = result?.statement;
  const predicate = statement?.predicate;
  const buildDefinition = predicate?.buildDefinition;
  const runDetails = predicate?.runDetails;
  compare(failures, 'attestation.certificate', certificate, expectedCertificate());
  compare(failures, 'attestation.statement', statement, expectedStatement());
  compare(failures, 'attestation.verifiedIdentity.subjectAlternativeName', result?.verifiedIdentity?.subjectAlternativeName, { subjectAlternativeName: CERTIFICATE_IDENTITY });
  compare(failures, 'attestation.verifiedIdentity.runnerEnvironment', result?.verifiedIdentity?.runnerEnvironment, RUNNER_ENVIRONMENT);

  const timestamps = result?.verifiedTimestamps;
  if (!Array.isArray(timestamps) || timestamps.length !== 1) {
    failures.push('attestation.verifiedTimestamps: exactly one transparency-log timestamp is required');
  } else {
    compare(failures, 'attestation.verifiedTimestamps[0].type', timestamps[0]?.type, 'Tlog');
    compare(failures, 'attestation.verifiedTimestamps[0].uri', timestamps[0]?.uri, 'https://rekor.sigstore.dev');
    const timestampEpoch = Date.parse(timestamps[0]?.timestamp);
    if (!Number.isFinite(timestampEpoch)) failures.push('attestation.verifiedTimestamps[0].timestamp: invalid timestamp');
    else {
      compare(failures, 'attestation.verifiedTimestamps[0].timestamp.epoch', timestampEpoch / 1000, REKOR_INTEGRATED_TIME_EPOCH);
      compare(failures, 'attestation.verifiedTimestamps[0].timestamp.normalized', new Date(timestampEpoch).toISOString(), '2026-08-30T06:17:17.000Z');
    }
  }

  // Repeat the promotion-critical statement checks explicitly so future edits
  // cannot accidentally weaken the exact whole-object comparison above.
  compare(failures, 'attestation.subject', statement?.subject, [{ name: RECEIPT_SUBJECT_NAME, digest: { sha256: RECEIPT_RAW_DIGEST.slice('sha256:'.length) } }]);
  compare(failures, 'attestation.predicateType', statement?.predicateType, PREDICATE_TYPE);
  compare(failures, 'attestation.buildType', buildDefinition?.buildType, BUILD_TYPE);
  compare(failures, 'attestation.runnerEnvironment', buildDefinition?.internalParameters?.github?.runner_environment, RUNNER_ENVIRONMENT);
  compare(failures, 'attestation.invocationId', runDetails?.metadata?.invocationId, INVOCATION_ID);
  compare(failures, 'attestation.freezeEvidence', lock?.freezeEvidence?.attestation, EXPECTED_RUNTIME_FREEZE_EVIDENCE.attestation);
  return failures;
}

export function attestationVerificationArguments(root = process.cwd(), evidencePaths = {}) {
  const repositoryRoot = path.resolve(root);
  const receiptPath = evidencePaths.receipt ?? path.join(repositoryRoot, RUNTIME_FREEZE_RECEIPT_PATH);
  const attestationPath = evidencePaths.attestation ?? path.join(repositoryRoot, RUNTIME_FREEZE_ATTESTATION_PATH);
  const trustedRootPath = evidencePaths.trustedRoot ?? path.join(repositoryRoot, RUNTIME_FREEZE_TRUSTED_ROOT_PATH);
  return [
    'attestation', 'verify', receiptPath,
    '--repo', REPOSITORY_FULL_NAME,
    '--hostname', 'github.com',
    '--bundle', attestationPath,
    '--custom-trusted-root', trustedRootPath,
    '--cert-identity', CERTIFICATE_IDENTITY,
    '--cert-oidc-issuer', OIDC_ISSUER,
    '--deny-self-hosted-runners',
    '--predicate-type', PREDICATE_TYPE,
    '--signer-digest', VERIFIER_REVISION,
    '--source-digest', VERIFIER_REVISION,
    '--source-ref', VERIFIER_REF,
    '--format', 'json',
  ];
}

export async function readExactEvidenceFiles(root) {
  const output = {};
  for (const [name, expected] of Object.entries(EXACT_EVIDENCE_FILES)) {
    const bytes = await readExactRegularFile(root, expected.path, expected.sizeBytes);
    const actualDigest = sha256(bytes);
    if (actualDigest !== expected.digest) throw new Error(`${expected.path} byte digest mismatch`);
    output[name] = { ...expected, bytes };
  }
  return output;
}

function normalizeVerifiedEvidenceFiles(evidenceFiles) {
  const output = {};
  for (const [name, expected] of Object.entries(EXACT_EVIDENCE_FILES)) {
    const candidate = evidenceFiles?.[name];
    const bytes = toBuffer(candidate?.bytes, `${name} verified evidence bytes`);
    if (bytes.length !== expected.sizeBytes) throw new Error(`${expected.path} size mismatch`);
    if (sha256(bytes) !== expected.digest) throw new Error(`${expected.path} byte digest mismatch`);
    output[name] = { ...expected, bytes: Buffer.from(bytes) };
  }
  return output;
}

async function materializeVerifiedEvidenceFiles(stateRoot, evidenceFiles) {
  const rootMetadata = await lstat(stateRoot);
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink() || (rootMetadata.mode & 0o777) !== 0o700) {
    throw new Error('temporary verification root must be a private 0700 directory');
  }
  const evidenceRoot = path.join(stateRoot, 'evidence');
  await mkdir(evidenceRoot, { mode: 0o700 });
  await chmod(evidenceRoot, 0o700);
  const paths = {};
  for (const [name, expected] of Object.entries(EXACT_EVIDENCE_FILES)) {
    const target = path.join(evidenceRoot, path.basename(expected.path));
    const handle = await open(
      target,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o400,
    );
    try {
      await handle.writeFile(evidenceFiles[name].bytes);
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmod(target, 0o400);
    paths[name] = target;
  }
  await assertMaterializedEvidenceFilesUnchanged(paths, evidenceFiles);
  return paths;
}

async function assertMaterializedEvidenceFilesUnchanged(paths, evidenceFiles) {
  for (const [name, expected] of Object.entries(EXACT_EVIDENCE_FILES)) {
    const target = paths[name];
    const before = await lstat(target);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1) {
      throw new Error(`${expected.path} temporary snapshot is not a regular single-link file`);
    }
    if ((before.mode & 0o777) !== 0o400) throw new Error(`${expected.path} temporary snapshot is not read-only`);
    if (before.size !== expected.sizeBytes) throw new Error(`${expected.path} temporary snapshot size changed`);
    const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    let bytes;
    try {
      const opened = await handle.stat();
      if (!opened.isFile() || opened.dev !== before.dev || opened.ino !== before.ino || opened.size !== expected.sizeBytes) {
        throw new Error(`${expected.path} temporary snapshot changed while being opened`);
      }
      bytes = await handle.readFile();
      const afterRead = await handle.stat();
      if (afterRead.dev !== opened.dev || afterRead.ino !== opened.ino || afterRead.size !== opened.size) {
        throw new Error(`${expected.path} temporary snapshot changed while being read`);
      }
    } finally {
      await handle.close();
    }
    const after = await lstat(target);
    if (!after.isFile() || after.isSymbolicLink() || after.nlink !== 1
        || after.dev !== before.dev || after.ino !== before.ino || after.size !== before.size
        || (after.mode & 0o777) !== 0o400) {
      throw new Error(`${expected.path} temporary snapshot metadata changed after gh verification`);
    }
    if (bytes.length !== expected.sizeBytes) throw new Error(`${expected.path} temporary snapshot size changed after gh verification`);
    if (sha256(bytes) !== expected.digest) throw new Error(`${expected.path} temporary snapshot digest changed after gh verification`);
    if (!bytes.equals(evidenceFiles[name].bytes)) throw new Error(`${expected.path} temporary snapshot bytes changed after gh verification`);
  }
}

async function readExactRegularFile(root, relativePath, exactSize) {
  const canonicalRoot = await realpath(root);
  const expectedCanonicalEvidenceRoot = path.join(canonicalRoot, ...RUNTIME_FREEZE_EVIDENCE_DIRECTORY.split('/'));
  const evidenceRoot = path.join(root, ...RUNTIME_FREEZE_EVIDENCE_DIRECTORY.split('/'));
  const candidate = path.join(root, ...relativePath.split('/'));
  const [canonicalEvidenceRoot, metadata] = await Promise.all([realpath(evidenceRoot), lstat(candidate)]);
  if (canonicalEvidenceRoot !== expectedCanonicalEvidenceRoot) throw new Error('runtime-freeze evidence directory contains a symlink ancestor');
  if (!metadata.isFile() || metadata.isSymbolicLink()) throw new Error(`${relativePath} must be a regular non-symlink file`);
  if (metadata.nlink !== 1) throw new Error(`${relativePath} must not be a hard link`);
  if (metadata.size !== exactSize) throw new Error(`${relativePath} size mismatch`);
  const handle = await open(candidate, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const openedMetadata = await handle.stat();
    if (!openedMetadata.isFile() || openedMetadata.dev !== metadata.dev || openedMetadata.ino !== metadata.ino || openedMetadata.size !== exactSize) {
      throw new Error(`${relativePath} changed while being opened`);
    }
    const canonicalCandidate = await realpath(candidate);
    if (canonicalCandidate !== path.join(canonicalRoot, ...relativePath.split('/'))) throw new Error(`${relativePath} is not canonical beneath the repository root`);
    const bytes = await handle.readFile();
    if (bytes.length !== exactSize) throw new Error(`${relativePath} changed while being read`);
    return bytes;
  } finally {
    await handle.close();
  }
}

function validateReceiptProjection(lock, receipt) {
  const failures = [];
  const sourceReceipt = {
    path: RUNTIME_FREEZE_RECEIPT_PATH,
    schemaVersion: receipt?.schemaVersion,
    sizeBytes: RECEIPT_SIZE_BYTES,
    rawDigest: RECEIPT_RAW_DIGEST,
    semanticDigest: RECEIPT_SEMANTIC_DIGEST,
    createdAt: receipt?.createdAt,
    status: receipt?.status,
    stableInputsCommitment: receipt?.stableInputs?.commitment,
  };
  compare(failures, 'freezeEvidence.sourceReceipt', lock?.freezeEvidence?.sourceReceipt, sourceReceipt);
  compare(failures, 'freezeEvidence.verifier.repositoryFullName', lock?.freezeEvidence?.verifier?.repositoryFullName, receipt?.repository?.fullName);
  compare(failures, 'freezeEvidence.verifier.repositoryId', lock?.freezeEvidence?.verifier?.repositoryId, receipt?.repository?.id);
  compare(failures, 'freezeEvidence.verifier.workflow.path', lock?.freezeEvidence?.verifier?.workflow?.path, receipt?.verifier?.workflow?.path);
  compare(failures, 'freezeEvidence.verifier.workflow.id', lock?.freezeEvidence?.verifier?.workflow?.id, receipt?.verifier?.workflow?.id);
  compare(failures, 'freezeEvidence.verifier.workflow.revision', lock?.freezeEvidence?.verifier?.workflow?.revision, receipt?.verifier?.workflow?.revision);
  compare(failures, 'freezeEvidence.verifier.workflow.ref', lock?.freezeEvidence?.verifier?.workflow?.ref, receipt?.verifier?.workflow?.ref);
  compare(failures, 'freezeEvidence.verifier.workflow.event', lock?.freezeEvidence?.verifier?.workflow?.event, receipt?.verifier?.workflow?.event);
  compare(failures, 'freezeEvidence.verifier.workflow.runId', lock?.freezeEvidence?.verifier?.workflow?.runId, receipt?.verifier?.workflow?.runId);
  compare(failures, 'freezeEvidence.verifier.workflow.runAttempt', lock?.freezeEvidence?.verifier?.workflow?.runAttempt, receipt?.verifier?.workflow?.runAttempt);
  compare(failures, 'freezeEvidence.verifier.implementation.path', lock?.freezeEvidence?.verifier?.implementation?.path, receipt?.verifier?.implementation?.path);
  compare(failures, 'freezeEvidence.verifier.implementation.sha256', lock?.freezeEvidence?.verifier?.implementation?.sha256, receipt?.verifier?.implementation?.sha256);
  compare(failures, 'freezeEvidence.receiptVerification', lock?.freezeEvidence?.receiptVerification, receipt?.verification);

  const stableModels = new Map((receipt?.stableInputs?.models ?? []).map((model) => [model.model, model]));
  const projectedIdentities = {
    runnerDigest: receipt?.stableInputs?.runnerDigest,
    dependencyLockDigests: {
      mattersim: stableModels.get('mattersim')?.dependencyLockDigest,
      mace: stableModels.get('mace')?.dependencyLockDigest,
    },
    runtimeInputManifestDigests: {
      mattersim: stableModels.get('mattersim')?.runtimeInputDigest,
      mace: stableModels.get('mace')?.runtimeInputDigest,
    },
    ociImages: EXPECTED_FROZEN_RUNTIME_IDENTITIES.ociImages,
  };
  compare(failures, 'identities.receiptProjection', lock?.identities, projectedIdentities);
  const projectedObservations = (receipt?.replicas ?? []).map((replica) => ({
    ordinal: replica.ordinal,
    repositoryRevision: replica.run.headSha,
    ref: replica.run.ref,
    protectedMain: true,
    workflowId: receipt?.bootstrapWorkflow?.id,
    runId: replica.run.id,
    runAttempt: replica.run.attempt,
    observedAt: replica.run.updatedAt,
    evidenceAttestedAt: EXPECTED_RUNTIME_FREEZE_EVIDENCE.attestation.rekorIntegratedAt,
    conclusion: replica.run.conclusion,
    stableInputsCommitment: receipt?.stableInputs?.commitment,
    acceptanceReceiptRawDigest: RECEIPT_RAW_DIGEST,
    identities: stableObservationIdentities(projectedIdentities),
  }));
  compare(failures, 'replication.observations.receiptProjection', lock?.replication?.observations, projectedObservations);
  compare(failures, 'replication.acceptedProtectedMainReplicas.receiptProjection', lock?.replication?.acceptedProtectedMainReplicas, receipt?.verification?.verifierAcceptedReplicaCount);

  const receiptCreated = Date.parse(receipt?.createdAt);
  const artifactCreated = Date.parse(lock?.freezeEvidence?.artifact?.createdAt);
  const artifactUpdated = Date.parse(lock?.freezeEvidence?.artifact?.updatedAt);
  const signed = Date.parse(lock?.freezeEvidence?.attestation?.rekorIntegratedAt);
  const expires = Date.parse(lock?.freezeEvidence?.artifact?.expiresAt);
  if (![receiptCreated, artifactCreated, artifactUpdated, signed, expires].every(Number.isFinite)) {
    failures.push('runtime-freeze.historical-times: every receipt, artifact, signing and expiry timestamp must be valid');
  } else if (!(receiptCreated < artifactCreated && artifactCreated <= artifactUpdated && artifactUpdated < signed && signed < expires)) {
    failures.push('runtime-freeze.historical-times: expected receipt < artifact creation <= update < signed < expiry ordering');
  }
  compare(failures, 'freezeEvidence.attestation.rekorIntegratedTimeEpoch', signed / 1000, lock?.freezeEvidence?.attestation?.rekorIntegratedTimeEpoch);
  compare(failures, 'freezeEvidence.attestation.transparencyLog.integratedTimeEpoch', lock?.freezeEvidence?.attestation?.transparencyLog?.integratedTimeEpoch, lock?.freezeEvidence?.attestation?.rekorIntegratedTimeEpoch);
  return failures;
}

export function parseSingleBundle(bytes) {
  const buffer = toBuffer(bytes, 'attestation bundle');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  if (!text.endsWith('\n') || text.endsWith('\n\n')) throw new SyntaxError('attestation bundle must be exactly one JSON line followed by one LF');
  const lines = text.slice(0, -1).split('\n');
  if (lines.length !== 1 || lines[0].length === 0) throw new SyntaxError('attestation bundle must contain exactly one nonempty JSON value');
  return parseJsonRejectDuplicateKeys(Buffer.from(lines[0], 'utf8'), 'attestation bundle');
}

export function validateRawBundleProjection(lock, bundle) {
  const failures = [];
  compare(failures, 'attestation.bundle.mediaType', bundle?.mediaType, ATTESTATION_MEDIA_TYPE);
  const entries = bundle?.verificationMaterial?.tlogEntries;
  if (!Array.isArray(entries) || entries.length !== 1) {
    failures.push('attestation.bundle.tlogEntries: exactly one transparency-log entry is required');
    return failures;
  }
  const entry = entries[0];
  compare(failures, 'attestation.bundle.kindVersion', entry?.kindVersion, { kind: 'dsse', version: '0.0.1' });
  compare(failures, 'attestation.bundle.logId', entry?.logId, { keyId: 'wNI9atQGlz+VWfO6LRygH4QUfY/8W4RFwiT5i5WRgB0=' });
  if (!isCanonicalBase64(entry?.canonicalizedBody) || Buffer.from(entry.canonicalizedBody, 'base64').length === 0) {
    failures.push('attestation.bundle.canonicalizedBody: canonical nonempty Rekor body is required');
  }
  const checkpoint = parseCheckpoint(entry?.inclusionProof?.checkpoint?.envelope, failures);
  const projection = {
    globalLogIndex: parseCanonicalSafeInteger(entry?.logIndex, 'global log index', failures),
    inclusionProofLogIndex: parseCanonicalSafeInteger(entry?.inclusionProof?.logIndex, 'inclusion-proof log index', failures),
    treeSize: parseCanonicalSafeInteger(entry?.inclusionProof?.treeSize, 'transparency-log tree size', failures),
    integratedTimeEpoch: parseCanonicalSafeInteger(entry?.integratedTime, 'integrated time', failures),
    indexSemantics: 'rekor-v1-global-entry-index-and-shard-local-inclusion-proof-index/v1',
    checkpoint,
  };
  compare(failures, 'freezeEvidence.attestation.transparencyLog', lock?.freezeEvidence?.attestation?.transparencyLog, projection);
  compare(failures, 'attestation.bundle.integratedTimeEpoch', projection.integratedTimeEpoch, REKOR_INTEGRATED_TIME_EPOCH);
  if (projection.globalLogIndex === projection.inclusionProofLogIndex) failures.push('attestation.bundle.logIndex: Rekor v1 global and shard-local indices unexpectedly collapse to one value');
  if (!Number.isSafeInteger(projection.inclusionProofLogIndex) || !Number.isSafeInteger(projection.treeSize)
      || projection.inclusionProofLogIndex >= projection.treeSize) {
    failures.push('attestation.bundle.inclusionProof.logIndex: shard-local index must be smaller than treeSize');
  }
  compare(failures, 'attestation.bundle.inclusionProof.treeSize.checkpoint', projection.treeSize, checkpoint?.treeSize);
  compare(failures, 'attestation.bundle.inclusionProof.rootHash.checkpoint', entry?.inclusionProof?.rootHash, checkpoint?.rootHash);
  const signedEntryTimestamp = entry?.inclusionPromise?.signedEntryTimestamp;
  if (typeof signedEntryTimestamp !== 'string' || !isCanonicalBase64(signedEntryTimestamp) || Buffer.from(signedEntryTimestamp, 'base64').length === 0) {
    failures.push('attestation.bundle.inclusionPromise.signedEntryTimestamp: a canonical nonempty Rekor SET is required');
  }
  return failures;
}

function parseCheckpoint(envelope, failures) {
  if (typeof envelope !== 'string') {
    failures.push('attestation.bundle.inclusionProof.checkpoint: signed checkpoint envelope is required');
    return null;
  }
  const lines = envelope.split('\n');
  if (lines.length !== 6 || lines[3] !== '' || lines[5] !== '') {
    failures.push('attestation.bundle.inclusionProof.checkpoint: malformed signed-note envelope');
    return null;
  }
  const origin = lines[0];
  const originMatch = /^rekor\.sigstore\.dev - ([1-9][0-9]*)$/.exec(origin);
  if (!originMatch) failures.push('attestation.bundle.inclusionProof.checkpoint: unexpected origin or tree ID');
  const treeSize = parseCanonicalSafeInteger(lines[1], 'checkpoint tree size', failures);
  const rootHash = lines[2];
  if (!isCanonicalBase64(rootHash) || Buffer.from(rootHash, 'base64').length !== 32) failures.push('attestation.bundle.inclusionProof.checkpoint: root hash is not canonical SHA-256 base64');
  if (!/^— rekor\.sigstore\.dev [A-Za-z0-9+/]+={0,2}$/.test(lines[4])) failures.push('attestation.bundle.inclusionProof.checkpoint: signed-note signature is missing or malformed');
  return {
    origin,
    treeId: originMatch?.[1] ?? null,
    treeSize,
    rootHash,
  };
}

async function readCommitBlob(runGit, root, revision, relativePath) {
  const treeOutput = await commandStdout(runGit, ['ls-tree', '-z', revision, '--', relativePath], gitOptions(root));
  const treeBytes = toBuffer(treeOutput, 'git ls-tree output');
  const treeText = new TextDecoder('utf-8', { fatal: true }).decode(treeBytes);
  if (!treeText.endsWith('\0') || treeText.indexOf('\0') !== treeText.length - 1) throw new Error(`V tree does not contain exactly one path: ${relativePath}`);
  const separator = treeText.indexOf('\t');
  if (separator <= 0 || treeText.slice(separator + 1, -1) !== relativePath) throw new Error(`V tree path differs: ${relativePath}`);
  const metadata = /^([0-7]{6}) blob ([0-9a-f]{40})$/.exec(treeText.slice(0, separator));
  if (!metadata) throw new Error(`V tree entry is not one regular blob: ${relativePath}`);
  const [, mode, gitBlobOid] = metadata;
  const blobOutput = await commandStdout(runGit, ['cat-file', 'blob', gitBlobOid], gitOptions(root));
  const bytes = toBuffer(blobOutput, 'git cat-file blob output');
  if (bytes.length < 1 || bytes.length > 1024 * 1024) throw new Error(`V blob is outside the bounded size: ${relativePath}`);
  const recomputedOid = createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`, 'utf8')).update(bytes).digest('hex');
  if (recomputedOid !== gitBlobOid) throw new Error(`V blob object ID mismatch: ${relativePath}`);
  return { mode, gitBlobOid, bytes };
}

function expectedCertificate() {
  return {
    certificateIssuer: 'CN=sigstore-intermediate,O=sigstore.dev',
    subjectAlternativeName: CERTIFICATE_IDENTITY,
    issuer: OIDC_ISSUER,
    githubWorkflowTrigger: VERIFIER_EVENT,
    githubWorkflowSHA: VERIFIER_REVISION,
    githubWorkflowName: VERIFIER_WORKFLOW_NAME,
    githubWorkflowRepository: REPOSITORY_FULL_NAME,
    githubWorkflowRef: VERIFIER_REF,
    buildSignerURI: CERTIFICATE_IDENTITY,
    buildSignerDigest: VERIFIER_REVISION,
    runnerEnvironment: RUNNER_ENVIRONMENT,
    sourceRepositoryURI: REPOSITORY_URL,
    sourceRepositoryDigest: VERIFIER_REVISION,
    sourceRepositoryRef: VERIFIER_REF,
    sourceRepositoryIdentifier: String(REPOSITORY_ID),
    sourceRepositoryOwnerURI: 'https://github.com/tony070926-sudo',
    sourceRepositoryOwnerIdentifier: String(REPOSITORY_OWNER_ID),
    buildConfigURI: CERTIFICATE_IDENTITY,
    buildConfigDigest: VERIFIER_REVISION,
    buildTrigger: VERIFIER_EVENT,
    runInvocationURI: INVOCATION_ID,
    sourceRepositoryVisibilityAtSigning: 'public',
  };
}

function expectedStatement() {
  return {
    _type: 'https://in-toto.io/Statement/v1',
    subject: [{ name: RECEIPT_SUBJECT_NAME, digest: { sha256: RECEIPT_RAW_DIGEST.slice('sha256:'.length) } }],
    predicateType: PREDICATE_TYPE,
    predicate: {
      buildDefinition: {
        buildType: BUILD_TYPE,
        externalParameters: { workflow: { path: VERIFIER_WORKFLOW_PATH, ref: VERIFIER_REF, repository: REPOSITORY_URL } },
        internalParameters: { github: { event_name: VERIFIER_EVENT, repository_id: String(REPOSITORY_ID), repository_owner_id: String(REPOSITORY_OWNER_ID), runner_environment: RUNNER_ENVIRONMENT } },
        resolvedDependencies: [{ uri: REPOSITORY_GIT_URI, digest: { gitCommit: VERIFIER_REVISION } }],
      },
      runDetails: { builder: { id: CERTIFICATE_IDENTITY }, metadata: { invocationId: INVOCATION_ID } },
    },
  };
}

function stableObservationIdentities(identities = EXPECTED_FROZEN_RUNTIME_IDENTITIES) {
  return {
    runnerDigest: identities.runnerDigest,
    dependencyLockDigests: { ...identities.dependencyLockDigests },
    runtimeInputManifestDigests: { ...identities.runtimeInputManifestDigests },
  };
}

function parseCanonicalSafeInteger(value, label, failures) {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(value)) {
    failures.push(`attestation.bundle.${label}: expected a canonical non-negative integer string`);
    return null;
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    failures.push(`attestation.bundle.${label}: integer exceeds the safe range`);
    return null;
  }
  return parsed;
}

function isCanonicalBase64(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) return false;
  try { return Buffer.from(value, 'base64').toString('base64') === value; }
  catch { return false; }
}

function compare(failures, label, actual, expected) {
  try {
    if (canonicalJson(actual) !== canonicalJson(expected)) failures.push(`${label}: exact runtime-freeze evidence mismatch`);
  } catch (error) {
    failures.push(`${label}: unable to compare runtime-freeze evidence (${error instanceof Error ? error.message : String(error)})`);
  }
}

function requireExactObjectKeys(failures, label, value, expectedKeys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...expectedKeys].sort())) {
    failures.push(`${label}: exact object keys mismatch`);
  }
}

async function commandStdout(command, args, options) {
  const result = await command(args, options);
  if (Buffer.isBuffer(result) || result instanceof Uint8Array || typeof result === 'string') return result;
  if (result && Object.hasOwn(result, 'stdout')) return result.stdout;
  throw new TypeError('injected command must return stdout bytes/string or an object with stdout');
}

async function defaultRunGit(args, options) {
  return execFile('git', args, options);
}

async function defaultRunGh(args, options) {
  return runPinnedGhOfflineVerifier(args, options);
}

/**
 * Execute only a byte-pinned GitHub CLI copied into the already-private gh
 * state root. The configured source path is an absolute locator; PATH is not
 * consulted, and the copied single-link executable is checked before and
 * after both the version probe and offline attestation verification.
 */
export async function runPinnedGhOfflineVerifier(
  args,
  options,
  configuredPath = process.env[RUNTIME_FREEZE_GH_PATH_ENV],
) {
  const stateRoot = ghStateRootFromOptions(options);
  const executable = await materializePinnedGhExecutable(stateRoot, configuredPath);
  const versionResult = await execFile(executable.path, ['version'], options);
  const versionOutput = execFileStdout(versionResult, 'pinned gh version output');
  const expectedVersionOutput = Buffer.from(
    `gh version ${EXPECTED_RUNTIME_FREEZE_GH_CLI.version} (${EXPECTED_RUNTIME_FREEZE_GH_CLI.releasedAt})\n`
      + `${EXPECTED_RUNTIME_FREEZE_GH_CLI.releaseUrl}\n`,
    'utf8',
  );
  if (!versionOutput.equals(expectedVersionOutput)) {
    throw new Error('pinned gh version output differs from the exact runtime-freeze policy');
  }
  await assertPinnedGhExecutable(executable);
  const verificationResult = await execFile(executable.path, args, options);
  const verificationOutput = execFileStdout(verificationResult, 'pinned gh attestation verification output');
  await assertPinnedGhExecutable(executable);
  return verificationOutput;
}

async function materializePinnedGhExecutable(stateRoot, configuredPath) {
  const platformKey = `${process.platform}-${process.arch}`;
  const expected = EXPECTED_RUNTIME_FREEZE_GH_CLI.platforms[platformKey];
  if (!expected) throw new Error(`unsupported pinned gh platform ${platformKey}`);
  const sourcePath = configuredPath ?? expected.defaultPath;
  if (typeof sourcePath !== 'string' || !path.isAbsolute(sourcePath) || path.normalize(sourcePath) !== sourcePath) {
    throw new Error(`${RUNTIME_FREEZE_GH_PATH_ENV} must name one normalized absolute path`);
  }

  const stateMetadata = await lstat(stateRoot);
  if (!stateMetadata.isDirectory() || stateMetadata.isSymbolicLink() || (stateMetadata.mode & 0o777) !== 0o700) {
    throw new Error('pinned gh state root must be one private 0700 directory');
  }
  const sourceBefore = await lstat(sourcePath, { bigint: true });
  if (!sourceBefore.isFile() || sourceBefore.isSymbolicLink() || sourceBefore.nlink !== 1n
      || sourceBefore.size !== BigInt(expected.executableSizeBytes)
      || (sourceBefore.mode & 0o777n) !== 0o755n) {
    throw new Error('configured gh is not the exact bounded regular single-link executable');
  }
  const sourceCanonicalPath = await realpath(sourcePath);
  if (sourceCanonicalPath !== sourcePath) {
    throw new Error('configured gh path must be canonical and contain no symlink locator');
  }

  const executableRoot = path.join(stateRoot, 'verifier-bin');
  await mkdir(executableRoot, { mode: 0o700 });
  await chmod(executableRoot, 0o700);
  const executablePath = path.join(executableRoot, 'gh');
  const sourceHandle = await open(sourceCanonicalPath, constants.O_RDONLY | constants.O_NOFOLLOW);
  let targetHandle;
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let offset = 0;
  try {
    targetHandle = await open(
      executablePath,
      constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL | constants.O_NOFOLLOW,
      0o500,
    );
    const sourceOpened = await sourceHandle.stat({ bigint: true });
    if (!sameFileIdentity(sourceBefore, sourceOpened)) throw new Error('configured gh changed before its private copy');
    while (offset < expected.executableSizeBytes) {
      const length = Math.min(buffer.length, expected.executableSizeBytes - offset);
      const { bytesRead } = await sourceHandle.read(buffer, 0, length, offset);
      if (bytesRead === 0) throw new Error('configured gh became shorter while copied');
      const chunk = buffer.subarray(0, bytesRead);
      hash.update(chunk);
      let written = 0;
      while (written < bytesRead) {
        const result = await targetHandle.write(chunk, written, bytesRead - written, offset + written);
        if (result.bytesWritten === 0) throw new Error('private gh copy made no write progress');
        written += result.bytesWritten;
      }
      offset += bytesRead;
    }
    const sourceAfter = await sourceHandle.stat({ bigint: true });
    if (!sameFileIdentity(sourceBefore, sourceAfter)) throw new Error('configured gh changed while copied');
    await targetHandle.sync();
  } finally {
    buffer.fill(0);
    await Promise.all([
      sourceHandle.close(),
      targetHandle?.close(),
    ]);
  }
  const digest = `sha256:${hash.digest('hex')}`;
  if (digest !== expected.executableSha256) {
    throw new Error('configured gh executable digest differs from the exact platform lock');
  }
  await chmod(executablePath, 0o500);
  const executable = Object.freeze({
    path: executablePath,
    expected,
    sourceCanonicalPath,
  });
  await assertPinnedGhExecutable(executable);
  return executable;
}

async function assertPinnedGhExecutable(executable) {
  const before = await lstat(executable.path, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size !== BigInt(executable.expected.executableSizeBytes)
      || (before.mode & 0o777n) !== 0o500n) {
    throw new Error('private gh copy is not the exact 0500 regular single-link executable');
  }
  const handle = await open(executable.path, constants.O_RDONLY | constants.O_NOFOLLOW);
  const hash = createHash('sha256');
  const buffer = Buffer.allocUnsafe(1024 * 1024);
  let offset = 0;
  try {
    const opened = await handle.stat({ bigint: true });
    if (!sameFileIdentity(before, opened)) throw new Error('private gh copy changed before verification');
    while (offset < executable.expected.executableSizeBytes) {
      const length = Math.min(buffer.length, executable.expected.executableSizeBytes - offset);
      const { bytesRead } = await handle.read(buffer, 0, length, offset);
      if (bytesRead === 0) throw new Error('private gh copy became shorter during verification');
      hash.update(buffer.subarray(0, bytesRead));
      offset += bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    if (!sameFileIdentity(before, after)) throw new Error('private gh copy changed during verification');
  } finally {
    buffer.fill(0);
    await handle.close();
  }
  if (`sha256:${hash.digest('hex')}` !== executable.expected.executableSha256) {
    throw new Error('private gh copy digest differs from the exact platform lock');
  }
}

function ghStateRootFromOptions(options) {
  const configRoot = options?.env?.GH_CONFIG_DIR;
  if (typeof configRoot !== 'string' || !path.isAbsolute(configRoot)
      || path.basename(configRoot) !== 'config') {
    throw new Error('pinned gh requires an absolute private GH_CONFIG_DIR');
  }
  return path.dirname(configRoot);
}

function execFileStdout(result, label) {
  if (!result || typeof result !== 'object' || !Object.hasOwn(result, 'stdout')) {
    throw new TypeError(`${label} is absent`);
  }
  return normalizeVerifierStdout(result.stdout, label);
}

function normalizeVerifierStdout(value, label) {
  if (Buffer.isBuffer(value)) return Buffer.from(value);
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  throw new TypeError(`${label} must be bytes or a string`);
}

function sameFileIdentity(left, right) {
  return left.isFile() && right.isFile()
    && left.dev === right.dev
    && left.ino === right.ino
    && left.size === right.size
    && left.nlink === right.nlink
    && left.mode === right.mode
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

function gitOptions(root) {
  return {
    cwd: root,
    encoding: null,
    maxBuffer: 5 * 1024 * 1024,
    env: {
      PATH: MINIMUM_SYSTEM_PATH,
      GIT_CONFIG_NOSYSTEM: '1',
      GIT_CONFIG_SYSTEM: '/dev/null',
      GIT_CONFIG_GLOBAL: '/dev/null',
      GIT_NO_REPLACE_OBJECTS: '1',
      GIT_OPTIONAL_LOCKS: '0',
      LC_ALL: 'C',
    },
  };
}

function ghOptions(stateRoot) {
  return {
    cwd: stateRoot,
    encoding: null,
    maxBuffer: 5 * 1024 * 1024,
    timeout: 30_000,
    killSignal: 'SIGKILL',
    shell: false,
    windowsHide: true,
    env: {
      PATH: RUNTIME_FREEZE_GH_CHILD_PATH,
      GH_CONFIG_DIR: path.join(stateRoot, 'config'),
      XDG_STATE_HOME: path.join(stateRoot, 'state'),
      XDG_CACHE_HOME: path.join(stateRoot, 'cache'),
      GH_PROMPT_DISABLED: '1',
      GH_TELEMETRY: '0',
      GH_NO_UPDATE_NOTIFIER: '1',
      GH_NO_EXTENSION_UPDATE_NOTIFIER: '1',
      HTTP_PROXY: 'http://127.0.0.1:1',
      HTTPS_PROXY: 'http://127.0.0.1:1',
      ALL_PROXY: 'http://127.0.0.1:1',
      NO_PROXY: '',
      LC_ALL: 'C',
      TZ: 'UTC',
    },
  };
}

function decodeAscii(value) {
  return new TextDecoder('ascii', { fatal: true }).decode(toBuffer(value, 'command output'));
}

function toBuffer(value, label) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  if (typeof value === 'string') return Buffer.from(value, 'utf8');
  throw new TypeError(`${label} must be bytes or a string`);
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
