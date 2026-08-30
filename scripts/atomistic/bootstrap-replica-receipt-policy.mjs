import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  assertNoPositivePromotionClaims,
  canonicalJson,
  canonicalJsonBytes,
  parseJsonRejectDuplicateKeys,
  sha256,
} from './runtime-input-contract.mjs';

export const BOOTSTRAP_REPLICA_RECEIPT_SCHEMA_VERSION = 'tf.atomistic-bootstrap-replica-receipt/0.1';
export const BOOTSTRAP_REPLICA_RECEIPT_SCHEMA_PATH = 'schemas/atomistic-bootstrap-replica-receipt.schema.json';
export const BOOTSTRAP_REPLICA_VERIFIER_WORKFLOW_PATH = '.github/workflows/atomistic-bootstrap-verify.yml';
export const BOOTSTRAP_REPLICA_VERIFIER_IMPLEMENTATION_PATH = 'scripts/atomistic/verify-bootstrap-replicas.mjs';
export const EXPECTED_REPOSITORY = Object.freeze({ fullName: 'tony070926-sudo/tailing-future', id: 1_349_498_456 });
export const EXPECTED_BOOTSTRAP_WORKFLOW = Object.freeze({
  id: 344_903_345,
  path: '.github/workflows/atomistic-bootstrap.yml',
  name: 'Atomistic bootstrap predictions (non-promotional)',
  sourceRevision: '687755a5835b92b632fc116e9b73ab11c1eb6cb5',
  runtimeSourceRevision: 'f861b3e30572f1db366554a2e330d5d6c78bdb56',
  event: 'workflow_dispatch',
  ref: 'refs/heads/main',
});

export const EXPECTED_STABLE_INPUTS = deepFreeze({
  agreementProtocol: 'two-distinct-protected-main-runs-byte-identical-stable-input-roots/v1',
  byteIdenticalAcrossReplicas: true,
  sourceRevision: EXPECTED_BOOTSTRAP_WORKFLOW.runtimeSourceRevision,
  sourceManifestDigest: 'sha256:08b1ed2ae239ce5732cf565b5e7bd814727a99ad6e1e1a29aeaa21ea1ed529a1',
  materializationDigest: 'sha256:345d5e55227bbe873d567f5ea72b88db1f21c1d46e72f078db38e6a455d47721',
  runnerDigest: 'sha256:d6e83640f15926088c116312c27605570f9e9c8ba4e9a9988ef5bf4d3a974ed4',
  scientificPlanDigest: 'sha256:d3a58524029b51c598d00a7bb9f60b6479a9973a0f9907cbf94a31e61bf1c9c2',
  structureManifestFileDigest: 'sha256:9f870f62cd60b7021d874d1970c81ac8cb64a302e2c5fd4013464198fd11a25e',
  models: [
    {
      model: 'mattersim',
      runtimeInputDigest: 'sha256:203acc5ec09c2e76a819ff384573c2c0aca1316f90c53f2e735c98e9daab5c53',
      dependencyLockDigest: 'sha256:9c990909d1307bb32608d31b9ed217d2368c28e2048f6dec39e8dc4a2b63642b',
      wheelhouseManifestDigest: 'sha256:b59aa4fe8c32f4fedd3d5b5bd24af47f028f5200686b0d2ece08983c3da25fae',
      dependencyGraphDigest: 'sha256:089b3a59daaf10fef45086ea5e8d63a7bf143d2d99aefef6cb7451e34dc50da0',
      installedPathDigest: 'sha256:cf12e368061c2420f802592a8b732e4f510e15129144c4a56161766a0e5bb321',
      runtimeInstalledPathDigest: 'sha256:3c393f19d748b945a77683d5e722f3a3b49d49415652ba4c78380bc1c175d873',
    },
    {
      model: 'mace',
      runtimeInputDigest: 'sha256:6bb7f79c5380bb54b0d5ff972c3f22cc27623d131291d3a7c1b2c4efff826f47',
      dependencyLockDigest: 'sha256:ae4b21b6f6d8ad98edcf2d5e0d938cd563379f494cce0b4aaa2e987332147e33',
      wheelhouseManifestDigest: 'sha256:74f1ba47d35098df504884e8ee52d3fa9d471396607a4a316d22fa49ff443bc2',
      dependencyGraphDigest: 'sha256:27045fc8bfc4bf841b6164f1360c71450753329db1aa8e61e22cf0963f82246b',
      installedPathDigest: 'sha256:e880ee162447820b350b0056700656f903bb6ff782bea9b15fd0be24bc08e290',
      runtimeInstalledPathDigest: 'sha256:cc7c3b47516ab8d80d96243c14a648f39bc89ce9ae3b8ad894868fab2c9029e5',
    },
  ],
});

export const EXPECTED_NUMERICAL_CONSISTENCY = deepFreeze({
  protocol: 'bootstrap-cross-replica-physical-values-within-frozen-plan-invariance-thresholds/v1',
  toleranceSourcePlanDigest: EXPECTED_STABLE_INPUTS.scientificPlanDigest,
  tolerances: {
    maxAbsEnergyEv: 0.0001,
    maxForceVectorDifferenceEvPerAngstrom: 0.0001,
    maxStressFrobeniusDifferenceEvPerAngstrom3: 0.00001,
  },
  models: [
    {
      model: 'mattersim', recordsCompared: 10, physicalValuesByteIdentical: false, withinFrozenTolerance: true,
      maximumDifferences: {
        energyEv: 0.000016689300537109375,
        forceVectorEvPerAngstrom: 0.000009982310016373787,
        stressFrobeniusEvPerAngstrom3: 9.2911458539692e-7,
      },
    },
    {
      model: 'mace', recordsCompared: 10, physicalValuesByteIdentical: true, withinFrozenTolerance: true,
      maximumDifferences: { energyEv: 0, forceVectorEvPerAngstrom: 0, stressFrobeniusEvPerAngstrom3: 0 },
    },
  ],
});

export const EXPECTED_BOOTSTRAP_VERIFICATION = deepFreeze({
  verifierAcceptedReplicaCount: 2,
  runtimeLockAcceptedReplicaCountBeforeCommitF: 0,
  runtimeLockFreezeCandidate: true,
  runtimeLockFreezeAuthorized: false,
  externalReceiptAttestationRequired: true,
  scientificPromotionEligible: false,
  independentVerifierRequiredForScientificPromotion: true,
});

export const MODEL_BUNDLE_ALLOWLISTS = deepFreeze({
  mattersim: [
    'diagnostics/mattersim.buildx-metadata.json',
    'diagnostics/mattersim.buildx-version.txt',
    'diagnostics/mattersim.docker-server-version.txt',
    'diagnostics/mattersim.image-inspect.json',
    'diagnostics/run-diagnostics.json',
    'locks/mattersim.requirements.lock',
    'manifests/bootstrap-outcome.json',
    'manifests/fetched-assets.manifest.json',
    'manifests/mattersim.container-observation.json',
    'manifests/mattersim.runtime-inputs.json',
    'manifests/mattersim.wheelhouse.manifest.json',
    'manifests/pytorch-download-sources.json',
    'manifests/run-summary.json',
    'manifests/structures.manifest.json',
    'predictions/predictions.jsonl',
  ],
  mace: [
    'diagnostics/mace.buildx-metadata.json',
    'diagnostics/mace.buildx-version.txt',
    'diagnostics/mace.docker-server-version.txt',
    'diagnostics/mace.image-inspect.json',
    'diagnostics/run-diagnostics.json',
    'locks/mace.requirements.lock',
    'manifests/bootstrap-outcome.json',
    'manifests/fetched-assets.manifest.json',
    'manifests/mace.container-observation.json',
    'manifests/mace.runtime-inputs.json',
    'manifests/mace.wheelhouse.manifest.json',
    'manifests/python-hostlist.derived-wheel.manifest.json',
    'manifests/pytorch-download-sources.json',
    'manifests/run-summary.json',
    'manifests/structures.manifest.json',
    'predictions/predictions.jsonl',
  ],
});

const stageNames = ['guard', 'directories', 'bind', 'base-images', 'assets', 'preprocess', 'wheelhouse', 'resolve', 'freeze', 'cold-install', 'build', 'inference', 'publish'];
export const EXPECTED_REPLICA_RUNS = deepFreeze([
  {
    ordinal: 1,
    run: { id: 33_242_996_794, attempt: 1, event: 'workflow_dispatch', ref: 'refs/heads/main', headSha: EXPECTED_BOOTSTRAP_WORKFLOW.sourceRevision, status: 'completed', conclusion: 'success', createdAt: '2026-08-29T08:22:34Z', startedAt: '2026-08-29T08:22:34Z', updatedAt: '2026-08-29T08:25:41Z' },
    runLog: { downloadDigest: 'sha256:f4cec1a5c2510db7cc1ed349c190ce68ef9d7c1615b4c3d97dfff2a2b2a8b22d', sizeBytes: 120_087 },
    jobs: [
      { model: 'mattersim', id: 99_075_425_745, name: 'mattersim isolated bootstrap smoke', jobLogFileDigest: 'sha256:b4a7b842e2b7821d45a214f148d343402d8c7acb81ef79b4655874b14e5cdb17' },
      { model: 'mace', id: 99_075_425_834, name: 'mace isolated bootstrap smoke', jobLogFileDigest: 'sha256:22684025781e2beca8f3fac2ebc33e1fdad0e0d490eff60f78dc4fbba993c0ff' },
    ],
    artifacts: [
      {
        model: 'mattersim', id: 9_711_953_689, sizeBytes: 108_337,
        name: 'tailing-atomistic-bootstrap-mattersim-687755a5835b92b632fc116e9b73ab11c1eb6cb5-33242996794-1',
        digest: 'sha256:12035812d29f2794a449dbe1da932d7ffb8fe954e3c3b8188d4381b760d53384', expiresAt: '2026-09-05T08:25:36Z',
        fileCount: 15, expandedBytes: 417_700,
        criticalFiles: {
          runtimeInput: 'sha256:203acc5ec09c2e76a819ff384573c2c0aca1316f90c53f2e735c98e9daab5c53', dependencyLock: 'sha256:9c990909d1307bb32608d31b9ed217d2368c28e2048f6dec39e8dc4a2b63642b', wheelhouse: 'sha256:b59aa4fe8c32f4fedd3d5b5bd24af47f028f5200686b0d2ece08983c3da25fae', structureManifest: EXPECTED_STABLE_INPUTS.structureManifestFileDigest, predictions: 'sha256:480027fac0dc5a475675bf4f7e159221cf0cad7e70de2033287600f887c7a31b', runSummary: 'sha256:adb1baabd0854120cce57d0cdb7713de6240b1fc1d23b2cbc3c43946eb5b0adc', containerObservation: 'sha256:7326a41b10006f93fa5f5c3d0546a59b596eef9c705d100292cc7d4667720780',
        },
      },
      {
        model: 'mace', id: 9_711_940_176, sizeBytes: 50_326,
        name: 'tailing-atomistic-bootstrap-mace-687755a5835b92b632fc116e9b73ab11c1eb6cb5-33242996794-1',
        digest: 'sha256:be8ff03de186f93658d2dd5a9f30402d9b08db9f991685641e0ae4ec2a7951fa', expiresAt: '2026-09-05T08:24:29Z',
        fileCount: 16, expandedBytes: 169_916,
        criticalFiles: {
          runtimeInput: 'sha256:6bb7f79c5380bb54b0d5ff972c3f22cc27623d131291d3a7c1b2c4efff826f47', dependencyLock: 'sha256:ae4b21b6f6d8ad98edcf2d5e0d938cd563379f494cce0b4aaa2e987332147e33', wheelhouse: 'sha256:74f1ba47d35098df504884e8ee52d3fa9d471396607a4a316d22fa49ff443bc2', structureManifest: EXPECTED_STABLE_INPUTS.structureManifestFileDigest, predictions: 'sha256:69dd3c4b055c464006a98bbbc98d51e1b09bef8ef846f583db3239867ecb1966', runSummary: 'sha256:9c792a786f433d4516596c8ae88afe3bfd4613f57dc8071bf96400a26ce36e0e', containerObservation: 'sha256:0a6c66df4726534fc23b0cfd1790d020a05760c12571525f7998795788969a47',
        },
      },
    ],
  },
  {
    ordinal: 2,
    run: { id: 33_242_999_376, attempt: 1, event: 'workflow_dispatch', ref: 'refs/heads/main', headSha: EXPECTED_BOOTSTRAP_WORKFLOW.sourceRevision, status: 'completed', conclusion: 'success', createdAt: '2026-08-29T08:22:38Z', startedAt: '2026-08-29T08:22:38Z', updatedAt: '2026-08-29T08:28:15Z' },
    runLog: { downloadDigest: 'sha256:1786ee053f173d6101c07babeaea310e188ae5aa318f34390a6ab2eafa7f1036', sizeBytes: 119_943 },
    jobs: [
      { model: 'mattersim', id: 99_075_752_494, name: 'mattersim isolated bootstrap smoke', jobLogFileDigest: 'sha256:ff63a86ae45ad1cd07cb329081deb194bc9247fadc1aea614938549c283f2251' },
      { model: 'mace', id: 99_075_752_422, name: 'mace isolated bootstrap smoke', jobLogFileDigest: 'sha256:2e35544fc30dc61910e0fe92ce18e6264b136a080c27a9a85862e08dee929b34' },
    ],
    artifacts: [
      {
        model: 'mattersim', id: 9_711_987_070, sizeBytes: 108_348,
        name: 'tailing-atomistic-bootstrap-mattersim-687755a5835b92b632fc116e9b73ab11c1eb6cb5-33242999376-1',
        digest: 'sha256:f298e09634006840583bb9be02dc9ff51cc35508d0bdea85cf9d2fe22d4bd3b8', expiresAt: '2026-09-05T08:28:12Z',
        fileCount: 15, expandedBytes: 417_694,
        criticalFiles: {
          runtimeInput: 'sha256:203acc5ec09c2e76a819ff384573c2c0aca1316f90c53f2e735c98e9daab5c53', dependencyLock: 'sha256:9c990909d1307bb32608d31b9ed217d2368c28e2048f6dec39e8dc4a2b63642b', wheelhouse: 'sha256:b59aa4fe8c32f4fedd3d5b5bd24af47f028f5200686b0d2ece08983c3da25fae', structureManifest: EXPECTED_STABLE_INPUTS.structureManifestFileDigest, predictions: 'sha256:bc4593ff790695257cdaa462c3261fda86a2a880de228926b8a4f3598e3518e4', runSummary: 'sha256:8717622e8a256796102a1fcbddefdc8955af41bc67a682df26ce68413ccc36c6', containerObservation: 'sha256:d8ca113076644ef91f90d1e856d54a49bccd8c49f2ea802e2435f8adfa980904',
        },
      },
      {
        model: 'mace', id: 9_711_979_645, sizeBytes: 50_320,
        name: 'tailing-atomistic-bootstrap-mace-687755a5835b92b632fc116e9b73ab11c1eb6cb5-33242999376-1',
        digest: 'sha256:2180079d260b343f6ebfb3f3bcf19c9bd517056632c461bdeb2d0bfadaa69e53', expiresAt: '2026-09-05T08:27:36Z',
        fileCount: 16, expandedBytes: 169_918,
        criticalFiles: {
          runtimeInput: 'sha256:6bb7f79c5380bb54b0d5ff972c3f22cc27623d131291d3a7c1b2c4efff826f47', dependencyLock: 'sha256:ae4b21b6f6d8ad98edcf2d5e0d938cd563379f494cce0b4aaa2e987332147e33', wheelhouse: 'sha256:74f1ba47d35098df504884e8ee52d3fa9d471396607a4a316d22fa49ff443bc2', structureManifest: EXPECTED_STABLE_INPUTS.structureManifestFileDigest, predictions: 'sha256:987c96b76e1e8d089d1009f7d352bd26cee8a2dd0166d4f54c013982e98396b3', runSummary: 'sha256:4f44f94bb01e1e790f928beb56380c02912a05d40fbea4a962c41d275dd3d900', containerObservation: 'sha256:e1a499f1b7bd22b4f1fa8b0dc975c28c8f902be697b45b3e79df29f0b391d3b4',
        },
      },
    ],
  },
]);

export const EXPECTED_RUN_SPECIFIC_OBSERVATIONS = deepFreeze([
  { runId: 33_242_996_794, models: [
    { model: 'mattersim', dockerLocalConfigImageId: 'sha256:b01bb3abe2566227447aad314e338381a5b8f772b29fe954de9160ddfd6061d9', runtimeUuid: '4eb2659a-6e8f-494a-92d0-23e664238cec', generatedAt: '2026-08-29T08:25:34.957007+00:00', timingDigest: 'sha256:6240b9494a84f377462fc1e4961f7eec1eeee615e1cdca6f4d172663468686fd', environmentDigest: 'sha256:97a7dde902bc6e763a9320fc8db7a8da12b9a5db77099f77074db4134eec0cd8', predictionDigest: 'sha256:480027fac0dc5a475675bf4f7e159221cf0cad7e70de2033287600f887c7a31b' },
    { model: 'mace', dockerLocalConfigImageId: 'sha256:fa665ab5ce991bd30c895b9730a2a1519b82544669af5a82bd41f07d4bc91bcc', runtimeUuid: 'bf6c218d-e766-4289-8a1a-925e94845f48', generatedAt: '2026-08-29T08:24:28.657968+00:00', timingDigest: 'sha256:1786350661cba17f0fb926bf6ecd0ad74c3c9acd15aa7adca564e394a1f85a85', environmentDigest: 'sha256:0b2a51d7a691886030b7cc6a89648cd4abeadd2e7f54a24a2dbc86ad7e865e2a', predictionDigest: 'sha256:69dd3c4b055c464006a98bbbc98d51e1b09bef8ef846f583db3239867ecb1966' },
  ] },
  { runId: 33_242_999_376, models: [
    { model: 'mattersim', dockerLocalConfigImageId: 'sha256:5a5cf8ac16f567cef73f802a8f78f4d88aca6bb8a951388ba856aa7a7825591e', runtimeUuid: '37143e48-4536-4885-b9b3-a596242ce0ff', generatedAt: '2026-08-29T08:28:11.507480+00:00', timingDigest: 'sha256:428d977658fd4c407dd7646af1b4f3bb8b27ea3a4ceda9b7a47c2ce62cc61ce6', environmentDigest: 'sha256:c97838ba14031d19aa147956d65fc8ce214e66047002b18ae56b57c94674bf55', predictionDigest: 'sha256:bc4593ff790695257cdaa462c3261fda86a2a880de228926b8a4f3598e3518e4' },
    { model: 'mace', dockerLocalConfigImageId: 'sha256:d65f9455161eb2edd27f50b632a06dddcc96c796bd70ac1fb9e7d468b7172f2f', runtimeUuid: '65cced13-a90c-4396-99bb-9e49992cd3dc', generatedAt: '2026-08-29T08:27:35.751777+00:00', timingDigest: 'sha256:b510ec6208b49efd14af210ec08f06c963e657b6004cec7269a67fbe5afea367', environmentDigest: 'sha256:ae57fd79aaf015f5ad8166b8c88ac6d0211204ee060ca597867652dbd1058e21', predictionDigest: 'sha256:987c96b76e1e8d089d1009f7d352bd26cee8a2dd0166d4f54c013982e98396b3' },
  ] },
]);

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const schema = JSON.parse(await readFile(path.join(root, BOOTSTRAP_REPLICA_RECEIPT_SCHEMA_PATH), 'utf8'));
const validateSchema = new Ajv2020({ allErrors: true, strict: false, validateFormats: false }).compile(schema);
const MAX_RECEIPT_BYTES = 16 * 1024 * 1024;
const expectedModels = ['mattersim', 'mace'];
const claims = { evidenceClass: 'bootstrap-replica-verified-not-reproduced', promotionEligible: false, promotionTrustRoot: false, comparable: false, reproduced: false };

export function canonicalBootstrapReplicaJson(value) {
  return canonicalJson(value);
}

export function canonicalBootstrapReplicaReceiptBytes(receipt) {
  return canonicalJsonBytes(receipt);
}

export function sha256BootstrapReplica(value) {
  return sha256(value);
}

export function bootstrapReplicaEvidenceFilesCommitment(domain, files) {
  return sha256(Buffer.from(canonicalJson({ domain, files }), 'utf8'));
}

export function computeBootstrapStableInputsCommitment(stableInputs) {
  const projection = Object.fromEntries(
    Object.entries(stableInputs ?? {}).filter(([key]) => key !== 'commitment'),
  );
  return sha256(Buffer.from(canonicalJson({ domain: 'tf.atomistic-bootstrap-stable-inputs/v1', ...projection }), 'utf8'));
}

export function parseBootstrapReplicaReceiptBytes(bytes, label = 'bootstrap replica receipt') {
  const buffer = toBuffer(bytes, label);
  if (buffer.length > MAX_RECEIPT_BYTES) throw new SyntaxError(`${label} exceeds ${MAX_RECEIPT_BYTES} bytes`);
  const receipt = parseJsonRejectDuplicateKeys(buffer, label);
  assertFinite(receipt, '$', new WeakSet());
  const expected = canonicalBootstrapReplicaReceiptBytes(receipt);
  if (!buffer.equals(expected)) throw new SyntaxError(`${label} is not sorted canonical JSON with exactly one trailing LF`);
  return receipt;
}

export function inspectBootstrapReplicaReceiptBytes(bytes, options = {}) {
  let buffer;
  try { buffer = toBuffer(bytes, 'bootstrap replica receipt'); }
  catch (error) { return { receipt: null, rawDigest: null, semanticDigest: null, failures: [error.message] }; }
  const rawDigest = sha256(buffer);
  try {
    const receipt = parseBootstrapReplicaReceiptBytes(buffer);
    return {
      receipt,
      rawDigest,
      semanticDigest: sha256(Buffer.from(canonicalJson(receipt), 'utf8')),
      failures: validateBootstrapReplicaReceipt(receipt, options).errors,
    };
  } catch (error) {
    return { receipt: null, rawDigest, semanticDigest: null, failures: [error instanceof Error ? error.message : String(error)] };
  }
}

export function validateBootstrapReplicaReceipt(receipt, options = {}) {
  const errors = [];
  try { assertFinite(receipt, '$', new WeakSet()); }
  catch (error) { errors.push(error.message); }
  try { assertNoPositivePromotionClaims(receipt, 'bootstrap replica receipt'); }
  catch (error) { errors.push(error.message); }
  rejectSelfAuthorizationClaims(receipt, '$', errors, new WeakSet());
  let schemaOk = false;
  try { schemaOk = validateSchema(receipt); }
  catch (error) { errors.push(`schema validator crashed: ${error instanceof Error ? error.message : String(error)}`); }
  if (!schemaOk) {
    for (const error of validateSchema.errors ?? []) errors.push(`schema${error.instancePath || '/'}: ${error.message}`);
    return result(errors);
  }

  compare(errors, 'repository', receipt.repository, EXPECTED_REPOSITORY);
  compare(errors, 'bootstrapWorkflow', receipt.bootstrapWorkflow, EXPECTED_BOOTSTRAP_WORKFLOW);
  validateTrustedVerifier(receipt.verifier, options, errors);
  rejectSelfReferenceFields(receipt, '$', errors, new WeakSet());
  compare(errors, 'claims', receipt.claims, claims);
  compare(errors, 'verification', receipt.verification, EXPECTED_BOOTSTRAP_VERIFICATION);
  validateReplicas(receipt, options, errors);
  validateStableInputs(receipt, errors);
  validateNumericalConsistency(receipt.numericalConsistency, errors);
  validateRunSpecific(receipt, errors);
  validateTimes(receipt, options.now ?? Date.now(), options.requireArtifactsLiveAtValidation === true, errors);
  return result(errors);
}

function validateTrustedVerifier(verifier, options, errors) {
  const required = [
    ['expectedVerifierRevision', verifier.workflow.revision],
    ['expectedVerifierRunId', verifier.workflow.runId],
    ['expectedVerifierRunAttempt', verifier.workflow.runAttempt],
    ['expectedVerifierScriptDigest', verifier.implementation.sha256],
  ];
  for (const [option, actual] of required) {
    if (options[option] === undefined) errors.push(`trusted verifier option ${option} is required`);
    else if (actual !== options[option]) errors.push(`verifier ${option.replace(/^expectedVerifier/, '')} does not match the trusted value`);
  }
  if (options.expectedVerifierWorkflowId !== undefined && verifier.workflow.id !== options.expectedVerifierWorkflowId) errors.push('verifier workflow ID does not match the trusted value');
  if (verifier.workflow.revision === EXPECTED_BOOTSTRAP_WORKFLOW.sourceRevision || verifier.workflow.revision === EXPECTED_BOOTSTRAP_WORKFLOW.runtimeSourceRevision) errors.push('verifier revision must postdate and be distinct from S and P');
}

function validateReplicas(receipt, options, errors) {
  if (receipt.replicas[0].run.id === receipt.replicas[1].run.id) errors.push('replica run IDs must be distinct');
  for (let index = 0; index < EXPECTED_REPLICA_RUNS.length; index += 1) {
    const actual = receipt.replicas[index];
    const expected = EXPECTED_REPLICA_RUNS[index];
    compare(errors, `replicas[${index}].ordinal`, actual.ordinal, expected.ordinal);
    compare(errors, `replicas[${index}].run`, actual.run, expected.run);
    compare(errors, `replicas[${index}].runLog.downloadDigest`, actual.runLog.downloadDigest, expected.runLog.downloadDigest);
    compare(errors, `replicas[${index}].runLog.sizeBytes`, actual.runLog.sizeBytes, expected.runLog.sizeBytes);
    validateEvidenceFiles(actual.runLog.files, actual.runLog.fileCount, undefined, `replicas[${index}].runLog`, errors);
    const expectedLogCommitment = bootstrapReplicaEvidenceFilesCommitment(`tf.github-actions-run-log-files/${actual.run.id}/v1`, actual.runLog.files);
    compare(errors, `replicas[${index}].runLog.filesCommitment`, actual.runLog.filesCommitment, expectedLogCommitment);

    for (let modelIndex = 0; modelIndex < expectedModels.length; modelIndex += 1) {
      const model = expectedModels[modelIndex];
      const job = actual.jobs[modelIndex];
      const expectedJob = expected.jobs[modelIndex];
      compare(errors, `replicas[${index}].jobs[${modelIndex}].model`, job.model, model);
      compare(errors, `replicas[${index}].jobs[${modelIndex}].id`, job.id, expectedJob.id);
      compare(errors, `replicas[${index}].jobs[${modelIndex}].name`, job.name, expectedJob.name);
      for (const stage of stageNames) if (job.reviewedStages[stage] !== 'success') errors.push(`replicas[${index}].jobs[${modelIndex}] stage ${stage} did not succeed`);

      const artifact = actual.artifacts[modelIndex];
      const expectedArtifact = expected.artifacts[modelIndex];
      for (const [field, expectedValue] of Object.entries({ model, id: expectedArtifact.id, name: expectedArtifact.name, sizeBytes: expectedArtifact.sizeBytes, apiDigest: expectedArtifact.digest, downloadDigest: expectedArtifact.digest, expiresAt: expectedArtifact.expiresAt })) {
        compare(errors, `replicas[${index}].artifacts[${modelIndex}].${field}`, artifact[field], expectedValue);
      }
      if (artifact.apiDigest !== artifact.downloadDigest) errors.push(`replicas[${index}].artifacts[${modelIndex}] API and downloaded archive digests differ`);
      compare(errors, `replicas[${index}].artifacts[${modelIndex}].workflowRun`, artifact.workflowRun, { id: actual.run.id, repositoryId: EXPECTED_REPOSITORY.id, headRepositoryId: EXPECTED_REPOSITORY.id, headBranch: 'main', headSha: EXPECTED_BOOTSTRAP_WORKFLOW.sourceRevision });
      compare(errors, `replicas[${index}].artifacts[${modelIndex}].uploadBinding`, artifact.uploadBinding, { jobId: job.id, jobName: job.name, publishStep: 'Upload the allowlisted bootstrap bundle', conclusion: 'success', jobLogFileDigest: expectedJob.jobLogFileDigest });
      if (!actual.runLog.files.some((file) => file.sha256 === artifact.uploadBinding.jobLogFileDigest)) errors.push(`replicas[${index}].artifacts[${modelIndex}] upload binding is absent from the run-log ZIP`);
      compare(errors, `replicas[${index}].artifacts[${modelIndex}].bundle.fileCount`, artifact.bundle.fileCount, expectedArtifact.fileCount);
      compare(errors, `replicas[${index}].artifacts[${modelIndex}].bundle.expandedBytes`, artifact.bundle.expandedBytes, expectedArtifact.expandedBytes);
      validateEvidenceFiles(artifact.bundle.files, artifact.bundle.fileCount, MODEL_BUNDLE_ALLOWLISTS[model], `replicas[${index}].artifacts[${modelIndex}].bundle`, errors, artifact.bundle.expandedBytes);
      compare(errors, `replicas[${index}].artifacts[${modelIndex}].bundle.filesCommitment`, artifact.bundle.filesCommitment, bootstrapReplicaEvidenceFilesCommitment(`tf.atomistic-bootstrap-bundle-files/${actual.run.id}/${model}/v1`, artifact.bundle.files));
      compare(errors, `replicas[${index}].artifacts[${modelIndex}].bundle.criticalFiles`, artifact.bundle.criticalFiles, expectedArtifact.criticalFiles);
      validateCriticalFiles(artifact.bundle, model, `replicas[${index}].artifacts[${modelIndex}]`, errors);
    }
  }
  if (receipt.replicas[0].run.id >= receipt.replicas[1].run.id) errors.push('replicas must be ordered by ascending distinct run ID');
}

function validateEvidenceFiles(files, declaredCount, allowlist, label, errors, expectedExpandedBytes) {
  const paths = files.map((file) => file.path);
  if (new Set(paths).size !== paths.length) errors.push(`${label} contains duplicate paths`);
  if (paths.some((entry, index) => index > 0 && paths[index - 1] >= entry)) errors.push(`${label} paths are not strict ASCII order`);
  if (files.length !== declaredCount) errors.push(`${label} file count disagrees with files`);
  if (allowlist) compare(errors, `${label}.allowlist`, paths, allowlist);
  if (expectedExpandedBytes !== undefined && files.reduce((sum, file) => sum + file.sizeBytes, 0) !== expectedExpandedBytes) errors.push(`${label} expanded byte total disagrees with files`);
}

function validateCriticalFiles(bundle, model, label, errors) {
  const paths = {
    runtimeInput: `manifests/${model}.runtime-inputs.json`,
    dependencyLock: `locks/${model}.requirements.lock`,
    wheelhouse: `manifests/${model}.wheelhouse.manifest.json`,
    structureManifest: 'manifests/structures.manifest.json',
    predictions: 'predictions/predictions.jsonl',
    runSummary: 'manifests/run-summary.json',
    containerObservation: `manifests/${model}.container-observation.json`,
  };
  for (const [field, filePath] of Object.entries(paths)) {
    const file = bundle.files.find((entry) => entry.path === filePath);
    if (!file || file.sha256 !== bundle.criticalFiles[field]) errors.push(`${label} ${field} digest is not cross-bound to ${filePath}`);
  }
}

function validateStableInputs(receipt, errors) {
  const expected = { ...EXPECTED_STABLE_INPUTS, commitment: computeBootstrapStableInputsCommitment(EXPECTED_STABLE_INPUTS) };
  compare(errors, 'stableInputs', receipt.stableInputs, expected);
  compare(errors, 'stableInputs.commitment', receipt.stableInputs.commitment, computeBootstrapStableInputsCommitment(receipt.stableInputs));
  for (const replica of receipt.replicas) for (const artifact of replica.artifacts) {
    const stable = EXPECTED_STABLE_INPUTS.models.find((entry) => entry.model === artifact.model);
    for (const [field, expectedDigest] of Object.entries({ runtimeInput: stable.runtimeInputDigest, dependencyLock: stable.dependencyLockDigest, wheelhouse: stable.wheelhouseManifestDigest, structureManifest: EXPECTED_STABLE_INPUTS.structureManifestFileDigest })) {
      if (artifact.bundle.criticalFiles[field] !== expectedDigest) errors.push(`${replica.run.id}/${artifact.model} stable ${field} root drifted`);
    }
  }
}

function validateNumericalConsistency(actual, errors) {
  compare(errors, 'numericalConsistency', actual, EXPECTED_NUMERICAL_CONSISTENCY);
  for (const model of actual.models) {
    const values = model.maximumDifferences;
    if (values.energyEv > actual.tolerances.maxAbsEnergyEv || values.forceVectorEvPerAngstrom > actual.tolerances.maxForceVectorDifferenceEvPerAngstrom || values.stressFrobeniusEvPerAngstrom3 > actual.tolerances.maxStressFrobeniusDifferenceEvPerAngstrom3) errors.push(`${model.model} cross-run numerical differences exceed frozen plan tolerances`);
    const allZero = values.energyEv === 0 && values.forceVectorEvPerAngstrom === 0 && values.stressFrobeniusEvPerAngstrom3 === 0;
    if (model.physicalValuesByteIdentical !== allZero) errors.push(`${model.model} physicalValuesByteIdentical disagrees with the measured maxima`);
  }
}

function validateRunSpecific(receipt, errors) {
  compare(errors, 'runSpecificObservations.replicas', receipt.runSpecificObservations.replicas, EXPECTED_RUN_SPECIFIC_OBSERVATIONS);
  const stableText = canonicalJson(receipt.stableInputs);
  const uuids = new Set();
  for (let runIndex = 0; runIndex < receipt.runSpecificObservations.replicas.length; runIndex += 1) {
    const observation = receipt.runSpecificObservations.replicas[runIndex];
    compare(errors, `runSpecificObservations.replicas[${runIndex}].runId`, observation.runId, receipt.replicas[runIndex].run.id);
    for (let modelIndex = 0; modelIndex < observation.models.length; modelIndex += 1) {
      const model = observation.models[modelIndex];
      compare(errors, `runSpecificObservations.replicas[${runIndex}].models[${modelIndex}].model`, model.model, expectedModels[modelIndex]);
      compare(errors, `runSpecificObservations.replicas[${runIndex}].models[${modelIndex}].predictionDigest`, model.predictionDigest, receipt.replicas[runIndex].artifacts[modelIndex].bundle.criticalFiles.predictions);
      const timingFile = receipt.replicas[runIndex].artifacts[modelIndex].bundle.files.find((file) => file.path === 'diagnostics/run-diagnostics.json');
      if (!timingFile || timingFile.sha256 !== model.timingDigest) errors.push(`${observation.runId}/${model.model} timing digest is not cross-bound to run diagnostics`);
      if (uuids.has(model.runtimeUuid)) errors.push('run-specific runtime UUIDs must be distinct');
      uuids.add(model.runtimeUuid);
      for (const value of [model.dockerLocalConfigImageId, model.runtimeUuid, model.generatedAt, model.timingDigest, model.environmentDigest, model.predictionDigest]) if (stableText.includes(value)) errors.push(`${observation.runId}/${model.model} run-specific observation contaminated stableInputs`);
    }
  }
}

function validateTimes(receipt, nowValue, requireArtifactsLiveAtValidation, errors) {
  const now = nowValue instanceof Date ? nowValue : new Date(nowValue);
  if (!Number.isFinite(now.getTime())) { errors.push('policy clock is invalid'); return; }
  const created = parseTimestamp(receipt.createdAt, 'createdAt', errors);
  if (created > now.getTime()) errors.push('receipt creation time is in the future');
  const latestRun = Math.max(...receipt.replicas.map((replica) => parseTimestamp(replica.run.updatedAt, 'run.updatedAt', errors)));
  if (created < latestRun) errors.push('receipt creation predates completion of a source run');
  for (const [runIndex, replica] of receipt.replicas.entries()) {
    const runCreated = parseTimestamp(replica.run.createdAt, `replicas[${runIndex}].run.createdAt`, errors);
    const runStarted = parseTimestamp(replica.run.startedAt, `replicas[${runIndex}].run.startedAt`, errors);
    const runUpdated = parseTimestamp(replica.run.updatedAt, `replicas[${runIndex}].run.updatedAt`, errors);
    if (!(runCreated <= runStarted && runStarted <= runUpdated)) errors.push(`replicas[${runIndex}] run timestamps are out of order`);
    for (const [jobIndex, job] of replica.jobs.entries()) {
      const started = parseTimestamp(job.startedAt, `replicas[${runIndex}].jobs[${jobIndex}].startedAt`, errors);
      const completed = parseTimestamp(job.completedAt, `replicas[${runIndex}].jobs[${jobIndex}].completedAt`, errors);
      if (!(runCreated <= started && started <= completed && completed <= runUpdated)) errors.push(`replicas[${runIndex}].jobs[${jobIndex}] timestamps are outside the run`);
    }
    for (const [artifactIndex, artifact] of replica.artifacts.entries()) {
      const artifactCreated = parseTimestamp(artifact.createdAt, `replicas[${runIndex}].artifacts[${artifactIndex}].createdAt`, errors);
      const artifactUpdated = parseTimestamp(artifact.updatedAt, `replicas[${runIndex}].artifacts[${artifactIndex}].updatedAt`, errors);
      const expires = parseTimestamp(artifact.expiresAt, `replicas[${runIndex}].artifacts[${artifactIndex}].expiresAt`, errors);
      if (!(runCreated <= artifactCreated && artifactCreated <= artifactUpdated && artifactUpdated <= runUpdated)) errors.push(`replicas[${runIndex}].artifacts[${artifactIndex}] timestamps are outside the run`);
      if (!(artifactUpdated < created && created < expires)) errors.push(`replicas[${runIndex}].artifacts[${artifactIndex}] has an invalid receipt-time ordering`);
      if (requireArtifactsLiveAtValidation && now.getTime() >= expires) errors.push(`replicas[${runIndex}].artifacts[${artifactIndex}] is expired at live validation time`);
    }
  }
}

function parseTimestamp(value, label, errors) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) { errors.push(`${label} is not a valid timestamp`); return Number.NaN; }
  return parsed;
}

function rejectSelfReferenceFields(value, label, errors, seen) {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  const forbidden = new Set(['receiptDigest', 'selfDigest', 'receiptArtifact', 'receiptArtifactId', 'attestation', 'attestationBundle']);
  if (Array.isArray(value)) value.forEach((entry, index) => rejectSelfReferenceFields(entry, `${label}[${index}]`, errors, seen));
  else for (const [key, entry] of Object.entries(value)) {
    if (forbidden.has(key)) errors.push(`${label}.${key} creates a forbidden receipt self-reference or embedded attestation`);
    rejectSelfReferenceFields(entry, `${label}.${key}`, errors, seen);
  }
}

function rejectSelfAuthorizationClaims(value, label, errors, seen) {
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) return;
  seen.add(value);
  const authorizationKeys = new Set([
    'runtimeLockFreezeAuthorized',
    'runtimeLockFreezeApproved',
    'runtimeLockAuthorized',
    'commitFAuthorized',
    'commitFApproved',
  ]);
  if (Array.isArray(value)) value.forEach((entry, index) => rejectSelfAuthorizationClaims(entry, `${label}[${index}]`, errors, seen));
  else for (const [key, entry] of Object.entries(value)) {
    if (authorizationKeys.has(key) && entry !== false) errors.push(`${label}.${key} must be exactly false because a bootstrap receipt cannot self-authorize Commit F or a runtime-lock freeze`);
    rejectSelfAuthorizationClaims(entry, `${label}.${key}`, errors, seen);
  }
}

function assertFinite(value, label, seen) {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${label} contains a non-finite number`);
    return;
  }
  if (!value || typeof value !== 'object') return;
  if (seen.has(value)) throw new TypeError(`${label} contains a cycle`);
  seen.add(value);
  if (Array.isArray(value)) value.forEach((entry, index) => assertFinite(entry, `${label}[${index}]`, seen));
  else for (const [key, entry] of Object.entries(value)) assertFinite(entry, `${label}.${key}`, seen);
  seen.delete(value);
}

function compare(errors, label, actual, expected) {
  try { if (canonicalJson(actual) !== canonicalJson(expected)) errors.push(`${label} does not match the frozen bootstrap replica contract`); }
  catch (error) { errors.push(`${label} cannot be compared (${error instanceof Error ? error.message : String(error)})`); }
}

function toBuffer(value, label) {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError(`${label} must be bytes`);
}

function result(errors) {
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
