#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import {
  chmod,
  link,
  lstat,
  open,
  readdir,
  realpath,
  unlink,
} from 'node:fs/promises';
import { constants as fsConstants, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  canonicalJson,
  canonicalJsonBytes,
  parseJsonRejectDuplicateKeys,
  sha256,
} from '../runtime-input-contract.mjs';

export const PROTECTED_CI_EVIDENCE_SCHEMA_VERSION =
  'tf.openmm-tip3p-protected-ci-evidence/0.4.9';
export const PROTECTED_BROWSER_EVIDENCE_SCHEMA_VERSION =
  'tf.openmm-tip3p-protected-browser-evidence/0.4.9';
export const EXPECTED_REPOSITORY = 'tony070926-sudo/tailing-future';
export const EXPECTED_REPOSITORY_ID = '1349498456';
export const EXPECTED_WORKFLOW_PATH = '.github/workflows/openmm-tip3p-protected.yml';
export const EXPECTED_WORKFLOW_REF = 'refs/heads/main';
export const EXPECTED_RUNNER = Object.freeze({
  name: 'ubuntu-24.04',
  os: 'Linux',
  architecture: 'X64',
});
export const OPENMM_SOURCE_REVISION = 'c6173db6e8edd705eb59172bd21e9ce69c572405';

export const EXPECTED_EVIDENCE_FILES = Object.freeze([
  'buildx-version.txt',
  'container-create-inspect.json',
  'container-final-inspect.json',
  'docker-version.txt',
  'image-inspect.json',
  'openmm-ci-acquisition-manifest.json',
  'openmm-tip3p-control-receipt.json',
  'openmm-tip3p-protected-browser-evidence.json',
]);

export const LOCKED_ACQUISITION_FILES = Object.freeze([
  Object.freeze({
    id: 'numpy-runtime-wheel',
    role: 'runtime-wheel',
    assetClass: 'runtime-wheel',
    destination: 'wheelhouse',
    filename: 'numpy-2.2.6-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl',
    sourceCommit: null,
    url: 'https://files.pythonhosted.org/packages/8c/3d/1e1db36cfd41f895d266b103df00ca5b3cbe965184df824dec5c08c6b803/numpy-2.2.6-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl',
    sizeBytes: 16_527_618,
    sha256: 'sha256:fd83c01228a688733f1ded5201c678f0c53ecc1006ffbc404db9f7a899ac6249',
  }),
  Object.freeze({
    id: 'openmm-license-notices',
    role: 'license-notices',
    assetClass: 'raw-license-notice',
    destination: 'input-root',
    filename: 'Licenses.txt',
    sourceCommit: OPENMM_SOURCE_REVISION,
    url: `https://raw.githubusercontent.com/openmm/openmm/${OPENMM_SOURCE_REVISION}/docs-source/licenses/Licenses.txt`,
    sizeBytes: 9_305,
    sha256: 'sha256:437b7168cc997abea3b5f2a9e0fb6894f96de77b9c69be428ccfcfe9bed58293',
  }),
  Object.freeze({
    id: 'openmm-runtime-wheel',
    role: 'runtime-wheel',
    assetClass: 'runtime-wheel',
    destination: 'wheelhouse',
    filename: 'openmm-8.6.0-cp312-cp312-manylinux_2_34_x86_64.whl',
    sourceCommit: OPENMM_SOURCE_REVISION,
    url: 'https://files.pythonhosted.org/packages/f1/ac/31ad62cb2066bf3ec805534d95724572fd26c372fb6b1c2403fc4f48875f/openmm-8.6.0-cp312-cp312-manylinux_2_34_x86_64.whl',
    sizeBytes: 14_428_011,
    sha256: 'sha256:e7acafe671fe40c502623886b15a97bcc948a83a4a995da0336b7ee3ab4b0221',
  }),
  Object.freeze({
    id: 'openmm-tip3p-coordinates',
    role: 'coordinate-input',
    assetClass: 'coordinate',
    destination: 'input-root',
    filename: 'tip3p.pdb',
    sourceCommit: OPENMM_SOURCE_REVISION,
    url: `https://raw.githubusercontent.com/openmm/openmm/${OPENMM_SOURCE_REVISION}/wrappers/python/openmm/app/data/tip3p.pdb`,
    sizeBytes: 179_998,
    sha256: 'sha256:14fd37900d627c0e258d6086a14c6084e4bec1422e9d20fccfc83c3f814fd7ee',
  }),
  Object.freeze({
    id: 'openmm-tip3p-parameters',
    role: 'parameter-input',
    assetClass: 'parameter',
    destination: 'input-root',
    filename: 'tip3p.xml',
    sourceCommit: OPENMM_SOURCE_REVISION,
    url: `https://raw.githubusercontent.com/openmm/openmm/${OPENMM_SOURCE_REVISION}/wrappers/python/openmm/app/data/amber14/tip3p.xml`,
    sizeBytes: 19_070,
    sha256: 'sha256:3f4b188dbcb6c02863230eaca231e927fb6bf3307ce947d8a50d0f46f6dd83d9',
  }),
]);

export const LOCKED_ENTRYPOINT = Object.freeze([
  '/usr/bin/env',
  '-u',
  'PYTHONPATH',
  '-u',
  'PYTHONHOME',
  '-u',
  'PYTHONSTARTUP',
  '-u',
  'PYTHONUSERBASE',
  '/opt/tailing-venv/bin/python',
  '-P',
  '-s',
  '-B',
  '-m',
  'producer',
]);

const SOURCE_REVISION = /^(?!0{40}$)[0-9a-f]{40}$/;
const DIGEST = /^sha256:(?!0{64}$)[0-9a-f]{64}$/;
const CONTAINER_ID = /^[0-9a-f]{64}$/;
const POSITIVE_DECIMAL = /^[1-9][0-9]{0,31}$/;
const PROTECTED_BROWSER_MODES = Object.freeze([
  'happy-path',
  'mid-playback-dispose',
  'context-loss',
]);
const MAX_BYTES = Object.freeze({
  'buildx-version.txt': 65_536,
  'container-create-inspect.json': 20_000_000,
  'container-final-inspect.json': 20_000_000,
  'docker-version.txt': 65_536,
  'image-inspect.json': 20_000_000,
  'openmm-ci-acquisition-manifest.json': 2_000_000,
  'openmm-tip3p-control-receipt.json': 8_000_000,
  'openmm-tip3p-protected-browser-evidence.json': 2_000_000,
});

const EXPECTED_PUBLICATION_POLICY = Object.freeze({
  licenseClearance: false,
  rawPayloadPublic: false,
  cloudflareDistributionEligible: false,
  protectedMainArtifact: false,
  attestedArtifact: false,
  promotionEligible: false,
});

const PROTECTED_PUBLICATION_POLICY = Object.freeze({
  artifactClass: 'non-sensitive-administrative-evidence-only',
  rawScientificPayloadEphemeral: true,
  rawScientificPayloadPublished: false,
  runtimeInputsPublished: false,
  cloudflareDistributionEligible: false,
  licenseClearance: false,
  attested: false,
});

const PROTECTED_CLAIMS = Object.freeze({
  attestationPending: true,
  executionAuthenticated: false,
  reproduced: false,
  promotionEligible: false,
});

const PROTECTED_BROWSER_PUBLICATION_POLICY = Object.freeze({
  artifactClass: 'non-sensitive-administrative-browser-evidence-only',
  rawScientificPayloadPublished: false,
  runtimeInputsPublished: false,
  browserArtifactsPublished: false,
  publicDistributionEligible: false,
  cloudflareDistributionEligible: false,
  licenseClearance: false,
  attested: false,
});

const PROTECTED_BROWSER_CLAIMS = Object.freeze({
  protectedWorkflowExecutionReported: true,
  realOpenMmProducerOutputConsumed: true,
  allThreeModesPassed: true,
  realBrowserDrawObserved: true,
  executionAuthenticated: false,
  reproduced: false,
  hostRuntimeClosureVerified: false,
  immutableRuntimeSnapshotVerified: false,
  promotionEligible: false,
  publicDistributionEligible: false,
  cloudflareDistributionEligible: false,
});

const LOCKED_BROWSER_RUNTIME = Object.freeze({
  playwrightVersion: '1.62.1',
  browserVersion: '151.0.7922.34',
  chromiumRevision: '1234',
  playwrightPackageTreeDigest:
    'sha256:5981dbf5b0604778dfe94c03564da904f13ba2289340fd1f695211922de1dc3f',
  playwrightCorePackageTreeDigest:
    'sha256:c3d1a9f4d8c8a2f5251c323aa3a4cb4202ba86f7ba4ff6330c1fa0e634f7c357',
  distributionTreeDigest:
    'sha256:ef61b26dc6a3b390355d5a4c1ea60b9ae4839bb3add815fadb26c626e7fae658',
  frozenRuntimeTreeDigest:
    'sha256:379be99b95a5b092c51dee46cc3053b08ec513618fe939a945df1f3a9a04adb3',
  allModePrePostCheckpointsMatched: true,
  hostRuntimeClosureVerified: false,
  immutableRuntimeSnapshotVerified: false,
});

const LOCKED_BROWSER_ISOLATION = Object.freeze({
  platform: 'linux-x64',
  allCredentialIdsNonRoot: true,
  allCapabilitySetsEmpty: true,
  appArmorUserNamespaceProfileVerified: true,
  noNewPrivilegesVerified: true,
  noSupplementaryPrivilegeGroups: true,
  forbiddenEnvironmentAbsent: true,
  onlyLoopbackInterfacesVerified: true,
  onlyLoopbackRoutesVerified: true,
  readOnlySourceMountVerified: true,
  readOnlyRuntimeMountVerified: true,
  pidNamespaceKillBoundaryVerified: false,
  cgroupDrainVerified: false,
});

const LOCKED_BROWSER_CROSS_MODE = Object.freeze({
  sameSourceLineage: true,
  sameTrajectoryBinding: true,
  sameClientBytes: true,
  sameFrozenRuntimeTree: true,
  threeFreshCapabilities: true,
});

const LOCKED_BROWSER_CLEANUP = Object.freeze({
  allListenersClosed: true,
  allPacketsZeroized: true,
  allTokenVerifierBytesZeroized: true,
  allAssetsZeroized: true,
  securePhysicalErasureVerified: false,
});

const LOCKED_SECURITY = Object.freeze({
  networkMode: 'none',
  readOnlyRootFilesystem: true,
  capDrop: Object.freeze(['ALL']),
  noNewPrivileges: true,
  privileged: false,
  pidsLimit: 128,
  memoryBytes: 8 * 1024 * 1024 * 1024,
  memorySwapBytes: 8 * 1024 * 1024 * 1024,
  nanoCpus: 2_000_000_000,
});

let validators;

function schemaValidators() {
  if (validators) return validators;
  const controlPath = fileURLToPath(new URL(
    '../../../schemas/openmm-tip3p-control-receipt.schema.json', import.meta.url,
  ));
  const evidencePath = fileURLToPath(new URL(
    '../../../schemas/openmm-tip3p-protected-ci-evidence.schema.json', import.meta.url,
  ));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  validators = Object.freeze({
    control: ajv.compile(JSON.parse(readFileSync(controlPath, 'utf8'))),
    evidence: ajv.compile(JSON.parse(readFileSync(evidencePath, 'utf8'))),
  });
  return validators;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function requirePlainObject(value, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be a JSON object`);
  return value;
}

function requireExactObjectKeys(value, keys, label) {
  const record = requirePlainObject(value, label);
  if (canonicalJson(Object.keys(record).sort()) !== canonicalJson([...keys].sort())) {
    throw new TypeError(`${label} has unexpected or missing fields`);
  }
  return record;
}

function requireExactStringArray(value, expected, label) {
  if (!Array.isArray(value) || canonicalJson(value) !== canonicalJson(expected)) {
    throw new TypeError(`${label} differs from the locked vector`);
  }
}

function requireNullOrEmptyArray(value, label) {
  if (value !== null && (!Array.isArray(value) || value.length !== 0)) {
    throw new TypeError(`${label} must be null or an empty array`);
  }
}

function requireNullOrEmptyObject(value, label) {
  if (value !== null && (!isPlainObject(value) || Object.keys(value).length !== 0)) {
    throw new TypeError(`${label} must be null or an empty object`);
  }
}

function requireSingleInspect(value, label) {
  if (!Array.isArray(value) || value.length !== 1 || !isPlainObject(value[0])) {
    throw new TypeError(`${label} must be one Docker inspect record`);
  }
  return value[0];
}

function parseJson(bytes, label) {
  return parseJsonRejectDuplicateKeys(bytes, label);
}

function parseCanonicalJson(bytes, label) {
  const value = parseJson(bytes, label);
  if (!Buffer.from(bytes).equals(canonicalJsonBytes(value))) {
    throw new TypeError(`${label} must use exact canonical JSON plus one LF`);
  }
  return value;
}

function validateControlReceipt(bytes, sourceRevision) {
  const receipt = requirePlainObject(
    parseCanonicalJson(bytes, 'OpenMM control receipt'), 'OpenMM control receipt',
  );
  const validate = schemaValidators().control;
  if (!validate(receipt)) {
    throw new TypeError(`OpenMM control receipt failed schema validation: ${JSON.stringify(validate.errors)}`);
  }
  const { receiptDigest, ...preimage } = receipt;
  if (!DIGEST.test(receiptDigest ?? '')
      || sha256(canonicalJsonBytes(preimage)) !== receiptDigest) {
    throw new TypeError('OpenMM control receipt has a stale self digest');
  }
  if (receipt.sourceRevision !== sourceRevision) {
    throw new TypeError('OpenMM control receipt source revision differs from the workflow SHA');
  }
  if (receipt.status !== 'verified-pass' || receipt.gates?.allPassed !== true
      || receipt.claims?.scientificPass !== true) {
    throw new TypeError('OpenMM control receipt is not an independently verified scientific pass');
  }
  if (receipt.verification?.executionAuthenticityVerified !== false
      || receipt.claims?.openmmExecutionAuthenticated !== false
      || receipt.claims?.reproduced !== false
      || receipt.claims?.scorePromotionEligible !== false
      || receipt.runtimeBindings?.derivedContainerImageDigest !== null) {
    throw new TypeError('OpenMM control receipt crossed its unauthenticated or non-promotional boundary');
  }
  if (canonicalJson(receipt.publicationPolicy) !== canonicalJson(EXPECTED_PUBLICATION_POLICY)) {
    throw new TypeError('OpenMM control receipt publication policy is not private and non-promotional');
  }
  if (receipt.verification?.verifierRuntime?.platform !== 'linux'
      || receipt.verification?.verifierRuntime?.architecture !== 'x64') {
    throw new TypeError('OpenMM control receipt was not produced by the locked Linux/x64 verifier lane');
  }
  return receipt;
}

function controlReceiptProjection(control) {
  return {
    receiptDigest: control.receiptDigest,
    systemDigest: control.systemDigest,
    planDigest: control.planDigest,
    producerOutcomeDigest: control.producerOutcomeDigest,
    artifactManifestDigest: control.artifactManifestDigest,
    payloadBundleRoot: control.payloadBundleRoot,
    verifierDigest: control.verification.verifierDigest,
    status: 'verified-pass',
    allPassed: true,
    scientificPass: true,
  };
}

function validateProtectedBrowserEvidence(bytes, sourceRevision, control) {
  const evidence = requireExactObjectKeys(
    parseCanonicalJson(bytes, 'protected browser evidence'),
    [
      'browserRuntime', 'claims', 'cleanup', 'client', 'controlReceipt', 'crossMode',
      'evidenceDigest', 'isolation', 'modeResults', 'profile', 'publicationPolicy',
      'schemaVersion', 'source', 'sourceRevision', 'statusDomain',
    ],
    'protected browser evidence',
  );
  if (evidence.schemaVersion !== PROTECTED_BROWSER_EVIDENCE_SCHEMA_VERSION
      || evidence.profile !== 'protected-main-private-openmm-positions-three-mode-browser-evidence'
      || evidence.statusDomain
        !== 'protected-ci-browser-observation-not-execution-attestation-reproduction-or-release'
      || evidence.sourceRevision !== sourceRevision) {
    throw new TypeError('protected browser evidence identity or source revision changed');
  }

  const expectedControl = controlReceiptProjection(control);
  requireExactObjectKeys(
    evidence.controlReceipt, Object.keys(expectedControl), 'protected browser control receipt binding',
  );
  if (canonicalJson(evidence.controlReceipt) !== canonicalJson(expectedControl)) {
    throw new TypeError('protected browser evidence is not bound to the OpenMM control receipt');
  }

  const source = requireExactObjectKeys(evidence.source, [
    'atomOrderDigest', 'browserPacketDigest', 'browserTrajectoryMetadataDigest',
    'cellDigest', 'frameCount', 'orderedFrameDigest', 'orderedPositionFrameDigest',
    'positionsF32TrajectoryDigest', 'positionsOnly', 'privateTrajectoryMetadataDigest',
    'referenceARunArtifactDigest', 'referenceARunReceiptDigest', 'topologyDigest',
    'trajectoryDigest', 'worldSessionDigest',
  ], 'protected browser source binding');
  for (const key of [
    'atomOrderDigest', 'browserPacketDigest', 'browserTrajectoryMetadataDigest',
    'cellDigest', 'orderedFrameDigest', 'orderedPositionFrameDigest',
    'positionsF32TrajectoryDigest', 'privateTrajectoryMetadataDigest',
    'referenceARunArtifactDigest', 'referenceARunReceiptDigest', 'topologyDigest',
    'trajectoryDigest', 'worldSessionDigest',
  ]) {
    if (!DIGEST.test(source[key] ?? '')) {
      throw new TypeError(`protected browser source ${key} is not a SHA-256 digest`);
    }
  }
  if (source.frameCount !== 101 || source.positionsOnly !== true) {
    throw new TypeError('protected browser source frame count or positions-only boundary changed');
  }

  requireExactObjectKeys(
    evidence.browserRuntime,
    Object.keys(LOCKED_BROWSER_RUNTIME),
    'protected browser runtime binding',
  );
  if (canonicalJson(evidence.browserRuntime) !== canonicalJson(LOCKED_BROWSER_RUNTIME)) {
    throw new TypeError('protected browser runtime identity or host-closure boundary changed');
  }
  requireExactObjectKeys(
    evidence.isolation, Object.keys(LOCKED_BROWSER_ISOLATION), 'protected browser isolation receipt',
  );
  if (canonicalJson(evidence.isolation) !== canonicalJson(LOCKED_BROWSER_ISOLATION)) {
    throw new TypeError('protected browser isolation receipt changed');
  }

  const client = requireExactObjectKeys(
    evidence.client,
    ['byteLength', 'responseDigestVerifiedInAllModes', 'sha256'],
    'protected browser client binding',
  );
  if (!Number.isSafeInteger(client.byteLength) || client.byteLength < 1
      || client.byteLength > 2 * 1024 * 1024 || !DIGEST.test(client.sha256 ?? '')
      || client.responseDigestVerifiedInAllModes !== true) {
    throw new TypeError('protected browser client byte or response-digest binding changed');
  }

  if (!Array.isArray(evidence.modeResults)
      || evidence.modeResults.length !== PROTECTED_BROWSER_MODES.length) {
    throw new TypeError('protected browser evidence must contain exactly three mode results');
  }
  const expectedModeTerminals = ['disposed', 'disposed', 'context-lost'];
  const observationDigests = new Set();
  evidence.modeResults.forEach((candidate, index) => {
    const mode = requireExactObjectKeys(candidate, [
      'browserDrawObserved', 'cleanupComplete', 'clientResponseDigestVerified', 'frameCount',
      'mode', 'observationDigest', 'renderedFrameCount', 'rendererDisposed',
      'runtimeDisposed', 'sourceOwnerRevoked',
      'status', 'terminalState', 'threeDisposed', 'trajectoryCompleted',
    ], `protected browser mode result ${index}`);
    const expectedMode = PROTECTED_BROWSER_MODES[index];
    const expectedStatus = index === 0
      ? 'digest-locked-main-executable-private-trajectory-draw-observed'
      : 'digest-locked-main-executable-private-trajectory-interruption-failed-closed';
    if (mode.mode !== expectedMode || mode.status !== expectedStatus
        || !DIGEST.test(mode.observationDigest ?? '')
        || mode.terminalState !== expectedModeTerminals[index]
        || mode.cleanupComplete !== true || mode.sourceOwnerRevoked !== true
        || mode.runtimeDisposed !== true || mode.threeDisposed !== true
        || mode.rendererDisposed !== true || mode.clientResponseDigestVerified !== true
        || mode.browserDrawObserved !== true
        || mode.trajectoryCompleted !== (index === 0)
        || mode.frameCount !== (index === 0 ? 101 : null)
        || mode.renderedFrameCount !== (index === 0 ? 101 : 37)) {
      throw new TypeError(`protected browser mode ${expectedMode} did not pass its locked boundary`);
    }
    observationDigests.add(mode.observationDigest);
  });
  if (observationDigests.size !== PROTECTED_BROWSER_MODES.length) {
    throw new TypeError('protected browser modes must bind three distinct observation digests');
  }

  for (const [value, expected, label] of [
    [evidence.crossMode, LOCKED_BROWSER_CROSS_MODE, 'protected browser cross-mode receipt'],
    [evidence.cleanup, LOCKED_BROWSER_CLEANUP, 'protected browser cleanup receipt'],
    [evidence.publicationPolicy, PROTECTED_BROWSER_PUBLICATION_POLICY,
      'protected browser publication policy'],
    [evidence.claims, PROTECTED_BROWSER_CLAIMS, 'protected browser claims'],
  ]) {
    requireExactObjectKeys(value, Object.keys(expected), label);
    if (canonicalJson(value) !== canonicalJson(expected)) {
      throw new TypeError(`${label} changed`);
    }
  }

  const { evidenceDigest, ...preimage } = evidence;
  if (!DIGEST.test(evidenceDigest ?? '')
      || sha256(canonicalJsonBytes(preimage)) !== evidenceDigest) {
    throw new TypeError('protected browser evidence has a stale self digest');
  }
  return evidence;
}

function validateAcquisitionManifest(bytes) {
  const manifest = requirePlainObject(
    parseCanonicalJson(bytes, 'acquisition manifest'), 'acquisition manifest',
  );
  const expectedKeys = [
    'claims', 'manifestDigest', 'networkAccessUsed', 'openmmSourceCommit', 'profile',
    'publicationPolicy', 'redirectPolicy', 'schemaVersion', 'sizePolicy', 'sources',
    'timeoutMilliseconds',
  ].sort();
  if (canonicalJson(Object.keys(manifest).sort()) !== canonicalJson(expectedKeys)
      || manifest.schemaVersion !== 'tf.openmm-ci-acquisition-manifest/0.4.5'
      || manifest.profile !== 'protected-ci-online-byte-acquisition'
      || manifest.openmmSourceCommit !== OPENMM_SOURCE_REVISION
      || manifest.networkAccessUsed !== true
      || manifest.redirectPolicy !== 'error'
      || manifest.timeoutMilliseconds !== 120_000
      || manifest.sizePolicy !== 'streamed-exact-byte-count-no-unbounded-buffer'
      || !Array.isArray(manifest.sources) || manifest.sources.length !== 5) {
    throw new TypeError('acquisition manifest identity, source, policy, or source count changed');
  }
  const expectedPublicationPolicy = {
    redistributionCleared: false,
    rawAssetsRedistributionCleared: false,
    coordinateAssetsRedistributionCleared: false,
    parameterAssetsRedistributionCleared: false,
    runtimeWheelsRedistributionCleared: false,
    rawAssetsPublic: false,
    coordinateAssetsPublic: false,
    parameterAssetsPublic: false,
    runtimeWheelsPublic: false,
    publicationEligible: false,
  };
  if (canonicalJson(manifest.publicationPolicy) !== canonicalJson(expectedPublicationPolicy)
      || canonicalJson(manifest.claims) !== canonicalJson({
        executionAuthenticated: false,
        reproduced: false,
        promotionEligible: false,
      })) {
    throw new TypeError('acquisition manifest crossed its private non-promotional boundary');
  }
  const sourceKeys = [
    'assetClass', 'destination', 'filename', 'id', 'networkAccessUsed',
    'publicationEligible', 'redirectFollowed', 'redistributionCleared', 'role',
    'sha256', 'sizeBytes', 'sourceCommit', 'url',
  ].sort();
  const projected = manifest.sources.map((raw, index) => {
    const record = requirePlainObject(raw, `acquisition source ${index}`);
    if (canonicalJson(Object.keys(record).sort()) !== canonicalJson(sourceKeys)
        || record.networkAccessUsed !== true || record.redirectFollowed !== false
        || record.redistributionCleared !== false || record.publicationEligible !== false) {
      throw new TypeError(`acquisition source ${index} changed its closed receipt or claims`);
    }
    return Object.fromEntries(Object.keys(LOCKED_ACQUISITION_FILES[0]).map((key) => (
      [key, record[key]]
    )));
  });
  if (canonicalJson(projected) !== canonicalJson(LOCKED_ACQUISITION_FILES)) {
    throw new TypeError('acquisition source path, URL, size, digest, or identity changed');
  }
  const { manifestDigest, ...manifestPreimage } = manifest;
  if (!DIGEST.test(manifestDigest ?? '')
      || sha256(canonicalJsonBytes(manifestPreimage)) !== manifestDigest) {
    throw new TypeError('acquisition manifest has a stale self digest');
  }
  return {
    schemaVersion: manifest.schemaVersion,
    openmmSourceCommit: manifest.openmmSourceCommit,
    networkAccessUsed: true,
    sourceCount: 5,
    manifestDigest,
    lockedSourcesDigest: sha256(canonicalJsonBytes(LOCKED_ACQUISITION_FILES)),
  };
}

function validateImageInspect(bytes, sourceRevision) {
  const image = requireSingleInspect(parseJson(bytes, 'image inspect'), 'image inspect');
  const config = requirePlainObject(image.Config, 'image Config');
  if (!DIGEST.test(image.Id ?? '') || image.Os !== 'linux' || image.Architecture !== 'amd64') {
    throw new TypeError('image inspect does not bind one Linux/amd64 config digest');
  }
  if (config.User !== '65532:65532' || config.WorkingDir !== '/work') {
    throw new TypeError('image user or working directory changed');
  }
  if (!Array.isArray(config.Env) || config.Env.some((entry) => typeof entry !== 'string')) {
    throw new TypeError('image runtime environment is not one explicit string vector');
  }
  requireExactStringArray(config.Entrypoint, LOCKED_ENTRYPOINT, 'image entrypoint');
  if (config.Labels?.['org.opencontainers.image.revision'] !== sourceRevision) {
    throw new TypeError('image revision label differs from the workflow SHA');
  }
  if (image.Descriptor?.annotations?.['config.digest'] !== undefined
      && image.Descriptor.annotations['config.digest'] !== image.Id) {
    throw new TypeError('image descriptor config digest differs from image Id');
  }
  return image;
}

function producerArguments(sourceRevision) {
  return [
    '--input-root', '/inputs',
    '--output-root', '/work/output',
    '--source-revision', sourceRevision,
  ];
}

function validateSecurity(hostConfig, label) {
  const value = requirePlainObject(hostConfig, `${label} HostConfig`);
  const security = {
    networkMode: value.NetworkMode,
    readOnlyRootFilesystem: value.ReadonlyRootfs,
    capDrop: Array.isArray(value.CapDrop) ? [...value.CapDrop].sort() : value.CapDrop,
    noNewPrivileges: Array.isArray(value.SecurityOpt)
      && value.SecurityOpt.length === 1
      && ['no-new-privileges', 'no-new-privileges:true', 'no-new-privileges=true']
        .includes(value.SecurityOpt[0]),
    privileged: value.Privileged,
    pidsLimit: value.PidsLimit,
    memoryBytes: value.Memory,
    memorySwapBytes: value.MemorySwap,
    nanoCpus: value.NanoCpus,
  };
  if (canonicalJson(security) !== canonicalJson(LOCKED_SECURITY)) {
    throw new TypeError(`${label} container security limits differ from the lock`);
  }
  if (value.Tmpfs !== null && value.Tmpfs !== undefined
      && (!isPlainObject(value.Tmpfs) || Object.keys(value.Tmpfs).length !== 0)) {
    throw new TypeError(`${label} container has an unexpected tmpfs mount`);
  }
  if (Array.isArray(value.VolumesFrom) && value.VolumesFrom.length !== 0) {
    throw new TypeError(`${label} container has an unexpected volumes-from mount`);
  }
  requireNullOrEmptyArray(value.CapAdd, `${label} CapAdd`);
  requireNullOrEmptyArray(value.Devices, `${label} Devices`);
  requireNullOrEmptyArray(value.DeviceRequests, `${label} DeviceRequests`);
  requireNullOrEmptyArray(value.Links, `${label} Links`);
  requireNullOrEmptyArray(value.ExtraHosts, `${label} ExtraHosts`);
  requireNullOrEmptyArray(value.Dns, `${label} Dns`);
  requireNullOrEmptyArray(value.DnsOptions, `${label} DnsOptions`);
  requireNullOrEmptyArray(value.DnsSearch, `${label} DnsSearch`);
  requireNullOrEmptyObject(value.PortBindings, `${label} PortBindings`);
  const restartPolicy = requirePlainObject(value.RestartPolicy, `${label} RestartPolicy`);
  if (canonicalJson(restartPolicy) !== canonicalJson({ Name: 'no', MaximumRetryCount: 0 })) {
    throw new TypeError(`${label} container restart policy is not exactly disabled`);
  }
  if (value.PublishAllPorts !== false) {
    throw new TypeError(`${label} container must not publish ports`);
  }
  return security;
}

function validateMounts(container, label) {
  if (!Array.isArray(container.Mounts) || container.Mounts.length !== 2) {
    throw new TypeError(`${label} container must have exactly two mounts`);
  }
  const mounts = container.Mounts.map((raw, index) => {
    const mount = requirePlainObject(raw, `${label} mount ${index}`);
    if (mount.Type !== 'bind' || !['/inputs', '/work/output'].includes(mount.Destination)
        || typeof mount.Source !== 'string' || !path.isAbsolute(mount.Source)
        || path.normalize(mount.Source) !== mount.Source) {
      throw new TypeError(`${label} mount ${index} is not one locked canonical bind mount`);
    }
    if (mount.Destination === '/inputs'
        && (mount.RW !== false
          || !['', 'ro'].includes(String(mount.Mode ?? '')))) {
      throw new TypeError(`${label} /inputs mount must be read-only`);
    }
    if (mount.Destination === '/work/output'
        && (mount.RW !== true || !['', 'rw'].includes(String(mount.Mode ?? '')))) {
      throw new TypeError(`${label} /work/output mount must be read-write`);
    }
    return {
      source: mount.Source,
      destination: mount.Destination,
      type: mount.Type,
      readWrite: mount.RW,
    };
  }).sort((left, right) => left.destination.localeCompare(right.destination));
  if (mounts[0].destination !== '/inputs' || mounts[1].destination !== '/work/output'
      || mounts[0].source === mounts[1].source) {
    throw new TypeError(`${label} container mount destinations or sources changed`);
  }
  const binds = container.HostConfig?.Binds;
  if (binds !== null && binds !== undefined
      && (!Array.isArray(binds) || binds.length !== 0)) {
    throw new TypeError(`${label} HostConfig contains unexpected legacy volume binds`);
  }
  const hostMounts = container.HostConfig?.Mounts;
  if (!Array.isArray(hostMounts) || hostMounts.length !== 2) {
    throw new TypeError(`${label} HostConfig must contain exactly two --mount records`);
  }
  const projectedHostMounts = hostMounts.map((raw, index) => {
    const mount = requirePlainObject(raw, `${label} HostConfig mount ${index}`);
    if (mount.Type !== 'bind' || typeof mount.Source !== 'string'
        || !path.isAbsolute(mount.Source) || path.normalize(mount.Source) !== mount.Source
        || !['/inputs', '/work/output'].includes(mount.Target)
        || mount.ReadOnly !== (mount.Target === '/inputs')) {
      throw new TypeError(`${label} HostConfig mount ${index} changed source, target, or access`);
    }
    return {
      source: mount.Source,
      destination: mount.Target,
      type: mount.Type,
      readWrite: !mount.ReadOnly,
    };
  }).sort((left, right) => left.destination.localeCompare(right.destination));
  if (canonicalJson(projectedHostMounts) !== canonicalJson(mounts)) {
    throw new TypeError(`${label} HostConfig --mount vector differs from inspected mounts`);
  }
  return mounts;
}

function validateContainerInspect(
  bytes, label, sourceRevision, imageId, imageEnvironment, expectedStatus,
) {
  const container = requireSingleInspect(parseJson(bytes, label), label);
  const config = requirePlainObject(container.Config, `${label} Config`);
  const state = requirePlainObject(container.State, `${label} State`);
  if (!CONTAINER_ID.test(container.Id ?? '') || container.Image !== imageId
      || container.Platform !== 'linux') {
    throw new TypeError(`${label} container/image/platform identity changed`);
  }
  if (config.User !== '65532:65532' || config.WorkingDir !== '/work'
      || config.Labels?.['org.opencontainers.image.revision'] !== sourceRevision) {
    throw new TypeError(`${label} container config user, workdir, or source label changed`);
  }
  requireExactStringArray(config.Env, imageEnvironment, `${label} runtime environment`);
  requireExactStringArray(config.Entrypoint, LOCKED_ENTRYPOINT, `${label} entrypoint`);
  const argumentsVector = producerArguments(sourceRevision);
  requireExactStringArray(config.Cmd, argumentsVector, `${label} producer arguments`);
  if (container.Path !== LOCKED_ENTRYPOINT[0]) {
    throw new TypeError(`${label} executable path differs from the image entrypoint`);
  }
  requireExactStringArray(
    container.Args, [...LOCKED_ENTRYPOINT.slice(1), ...argumentsVector], `${label} process arguments`,
  );
  const security = validateSecurity(container.HostConfig, label);
  const mounts = validateMounts(container, label);
  if (expectedStatus === 'created') {
    if (state.Status !== 'created' || state.Running !== false || state.Paused !== false
        || state.Restarting !== false || state.OOMKilled !== false || state.Dead !== false
        || state.ExitCode !== 0 || !['', undefined].includes(state.Error)) {
      throw new TypeError('container create inspect is not one untouched created container');
    }
  } else if (state.Status !== 'exited' || state.Running !== false || state.Paused !== false
      || state.Restarting !== false || state.OOMKilled !== false || state.Dead !== false
      || state.ExitCode !== 0 || !['', undefined].includes(state.Error)) {
    throw new TypeError('container final inspect is not one successful non-OOM exit');
  }
  return { container, security, mounts };
}

function requireSingleAsciiLine(bytes, label) {
  const value = Buffer.from(bytes).toString('ascii');
  if (!Buffer.from(value, 'ascii').equals(Buffer.from(bytes))
      || !/^[\x20-\x7e]{1,4096}\n$/.test(value)) {
    throw new TypeError(`${label} must be one bounded printable ASCII line plus LF`);
  }
  return value.slice(0, -1);
}

function fileRecords(inputBytes) {
  return EXPECTED_EVIDENCE_FILES.map((filename) => {
    const bytes = inputBytes[filename];
    if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
      throw new TypeError(`${filename} bytes are missing`);
    }
    if (bytes.length < 1 || bytes.length > MAX_BYTES[filename]) {
      throw new TypeError(`${filename} is outside its byte bound`);
    }
    return { path: filename, sizeBytes: bytes.length, sha256: sha256(bytes) };
  });
}

function validateOptions(options) {
  requirePlainObject(options, 'protected CI options');
  if (options.repository !== EXPECTED_REPOSITORY
      || options.repositoryId !== EXPECTED_REPOSITORY_ID
      || options.workflowPath !== EXPECTED_WORKFLOW_PATH
      || options.workflowRef !== EXPECTED_WORKFLOW_REF) {
    throw new TypeError('protected CI repository, repository ID, workflow path, or ref changed');
  }
  if (!SOURCE_REVISION.test(options.sourceRevision ?? '')) {
    throw new TypeError('source revision must be a nonzero lowercase Git commit ID');
  }
  if (!POSITIVE_DECIMAL.test(options.runId ?? '')) {
    throw new TypeError('run ID must be one positive canonical decimal string');
  }
  if (!POSITIVE_DECIMAL.test(options.runAttempt ?? '')
      || Number(options.runAttempt) > 1_000_000) {
    throw new TypeError('run attempt must be one bounded positive canonical integer');
  }
  if (options.runnerName !== EXPECTED_RUNNER.name || options.runnerOs !== EXPECTED_RUNNER.os
      || options.runnerArch !== EXPECTED_RUNNER.architecture) {
    throw new TypeError('protected CI runner identity changed');
  }
}

export function buildProtectedCiEvidence({ options, inputBytes }) {
  validateOptions(options);
  requirePlainObject(inputBytes, 'protected CI evidence bytes');
  if (canonicalJson(Object.keys(inputBytes).sort()) !== canonicalJson(EXPECTED_EVIDENCE_FILES)) {
    throw new TypeError('protected CI evidence bytes must contain exactly the eight locked inputs');
  }
  const records = fileRecords(inputBytes);
  const acquisition = validateAcquisitionManifest(
    inputBytes['openmm-ci-acquisition-manifest.json'],
  );
  const control = validateControlReceipt(
    inputBytes['openmm-tip3p-control-receipt.json'], options.sourceRevision,
  );
  const browser = validateProtectedBrowserEvidence(
    inputBytes['openmm-tip3p-protected-browser-evidence.json'],
    options.sourceRevision,
    control,
  );
  const image = validateImageInspect(inputBytes['image-inspect.json'], options.sourceRevision);
  const created = validateContainerInspect(
    inputBytes['container-create-inspect.json'], 'container create inspect',
    options.sourceRevision, image.Id, image.Config.Env, 'created',
  );
  const final = validateContainerInspect(
    inputBytes['container-final-inspect.json'], 'container final inspect',
    options.sourceRevision, image.Id, image.Config.Env, 'exited',
  );
  if (created.container.Id !== final.container.Id
      || canonicalJson(created.security) !== canonicalJson(final.security)
      || canonicalJson(created.mounts) !== canonicalJson(final.mounts)) {
    throw new TypeError('create/final container identity, security, or mount receipts differ');
  }
  const publicMounts = created.mounts.map(({ destination, type, readWrite }) => ({
    destination, type, readWrite,
  }));
  const dockerVersion = requireSingleAsciiLine(inputBytes['docker-version.txt'], 'Docker version');
  const buildxVersion = requireSingleAsciiLine(inputBytes['buildx-version.txt'], 'Buildx version');
  const preimage = {
    schemaVersion: PROTECTED_CI_EVIDENCE_SCHEMA_VERSION,
    profile: 'openmm-tip3p-protected-ci-non-sensitive-administrative-evidence',
    statusDomain: 'protected-ci-run-record-not-attestation-reproduction-or-release',
    repository: {
      fullName: options.repository,
      id: options.repositoryId,
    },
    workflow: {
      path: options.workflowPath,
      ref: options.workflowRef,
      sourceRevision: options.sourceRevision,
      runId: options.runId,
      runAttempt: Number(options.runAttempt),
    },
    runner: { ...EXPECTED_RUNNER },
    files: records,
    acquisition,
    container: {
      imageConfigDigest: image.Id,
      platform: 'linux/amd64',
      user: '65532:65532',
      containerId: created.container.Id,
      entrypoint: [...LOCKED_ENTRYPOINT],
      producerArguments: producerArguments(options.sourceRevision),
      security: created.security,
      mounts: publicMounts,
      finalState: {
        status: 'exited',
        exitCode: 0,
        oomKilled: false,
        dead: false,
      },
    },
    controlReceipt: {
      receiptDigest: control.receiptDigest,
      sourceRevision: control.sourceRevision,
      systemDigest: control.systemDigest,
      planDigest: control.planDigest,
      producerOutcomeDigest: control.producerOutcomeDigest,
      artifactManifestDigest: control.artifactManifestDigest,
      payloadBundleRoot: control.payloadBundleRoot,
      verifierDigest: control.verification.verifierDigest,
      status: 'verified-pass',
      allPassed: true,
      scientificPass: true,
      executionAuthenticated: false,
      reproduced: false,
      promotionEligible: false,
    },
    browserEvidence: {
      evidenceDigest: browser.evidenceDigest,
      sourceRevision: browser.sourceRevision,
      controlReceiptDigest: browser.controlReceipt.receiptDigest,
      allThreeModesPassed: true,
      protectedWorkflowExecutionReported: true,
      executionAuthenticated: false,
      reproduced: false,
      promotionEligible: false,
    },
    toolchain: { dockerVersion, buildxVersion },
    publicationPolicy: { ...PROTECTED_PUBLICATION_POLICY },
    claims: { ...PROTECTED_CLAIMS },
  };
  const evidence = { ...preimage, evidenceDigest: sha256(canonicalJsonBytes(preimage)) };
  const validate = schemaValidators().evidence;
  if (!validate(evidence)) {
    throw new TypeError(`protected CI evidence failed schema validation: ${JSON.stringify(validate.errors)}`);
  }
  const bytes = canonicalJsonBytes(evidence);
  return { evidence, bytes, fileDigest: sha256(bytes) };
}

function normalizedAbsolute(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value) || path.normalize(value) !== value
      || path.resolve(value) !== value) {
    throw new TypeError(`${label} must be a normalized absolute path`);
  }
  return value;
}

async function readAtMost(handle, maximum, label) {
  const chunks = [];
  let total = 0;
  while (total <= maximum) {
    const remaining = Math.min(64 * 1024, maximum + 1 - total);
    if (remaining <= 0) break;
    const buffer = Buffer.allocUnsafe(remaining);
    const { bytesRead } = await handle.read(buffer, 0, remaining, null);
    if (bytesRead === 0) break;
    chunks.push(buffer.subarray(0, bytesRead));
    total += bytesRead;
  }
  if (total > maximum) throw new TypeError(`${label} exceeds its byte bound`);
  return Buffer.concat(chunks, total);
}

function sameStat(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mode === right.mode && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

async function readSafeRegularFile(filename, label, maximum) {
  const absolute = normalizedAbsolute(filename, `${label} path`);
  if (await realpath(absolute) !== absolute) {
    throw new TypeError(`${label} path must be canonical and must not traverse a symlink`);
  }
  const before = await lstat(absolute, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size < 1n || before.size > BigInt(maximum)) {
    throw new TypeError(`${label} must be one bounded, single-link regular file`);
  }
  const handle = await open(absolute, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const bytes = await readAtMost(handle, maximum, label);
    const descriptorStat = await handle.stat({ bigint: true });
    const after = await lstat(absolute, { bigint: true });
    if (await realpath(absolute) !== absolute || !after.isFile() || after.isSymbolicLink()
        || after.nlink !== 1n || !sameStat(before, descriptorStat) || !sameStat(after, descriptorStat)
        || BigInt(bytes.length) !== after.size) {
      throw new Error(`${label} changed during its bounded read`);
    }
    return { absolute, bytes, dev: after.dev, ino: after.ino };
  } finally {
    await handle.close();
  }
}

async function readEvidenceRoot(evidenceRoot) {
  const root = normalizedAbsolute(evidenceRoot, 'evidence root');
  if (await realpath(root) !== root) {
    throw new TypeError('evidence root must be canonical and must not traverse a symlink');
  }
  const before = await lstat(root, { bigint: true });
  if (!before.isDirectory() || before.isSymbolicLink()) {
    throw new TypeError('evidence root must be one real directory');
  }
  const entries = await readdir(root, { withFileTypes: true });
  const names = entries.map((entry) => entry.name).sort();
  if (canonicalJson(names) !== canonicalJson(EXPECTED_EVIDENCE_FILES)
      || entries.some((entry) => !entry.isFile())) {
    throw new TypeError('evidence root must contain exactly the eight locked regular files');
  }
  const records = await Promise.all(EXPECTED_EVIDENCE_FILES.map((filename) => (
    readSafeRegularFile(path.join(root, filename), filename, MAX_BYTES[filename])
  )));
  const identities = new Set(records.map((record) => `${record.dev}:${record.ino}`));
  if (identities.size !== records.length) throw new TypeError('evidence files alias one inode');
  const after = await lstat(root, { bigint: true });
  const finalNames = (await readdir(root)).sort();
  if (!sameStat(before, after)
      || canonicalJson(finalNames) !== canonicalJson(EXPECTED_EVIDENCE_FILES)) {
    throw new Error('evidence root changed during its bounded read');
  }
  return Object.fromEntries(records.map((record, index) => (
    [EXPECTED_EVIDENCE_FILES[index], record.bytes]
  )));
}

async function writeNewAtomic(output, bytes) {
  const absolute = normalizedAbsolute(output, 'output');
  if (path.basename(absolute) !== 'openmm-tip3p-protected-ci-evidence.json') {
    throw new TypeError('output must name openmm-tip3p-protected-ci-evidence.json');
  }
  const parent = path.dirname(absolute);
  if (await realpath(parent) !== parent) {
    throw new TypeError('output parent must be canonical and must not traverse a symlink');
  }
  const parentBefore = await lstat(parent, { bigint: true });
  if (!parentBefore.isDirectory() || parentBefore.isSymbolicLink()) {
    throw new TypeError('output parent must be one real directory');
  }
  const temporary = path.join(parent, `.${path.basename(absolute)}.${randomUUID()}.tmp`);
  const handle = await open(
    temporary,
    fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL
      | (fsConstants.O_NOFOLLOW ?? 0),
    0o600,
  );
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await chmod(temporary, 0o444);
    await link(temporary, absolute);
    await unlink(temporary);
    const published = await lstat(absolute, { bigint: true });
    const parentAfter = await lstat(parent, { bigint: true });
    if (!published.isFile() || published.isSymbolicLink() || published.nlink !== 1n
        || (published.mode & 0o777n) !== 0o444n || published.size !== BigInt(bytes.length)
        || parentBefore.dev !== parentAfter.dev || parentBefore.ino !== parentAfter.ino) {
      throw new Error('published evidence file identity, mode, or size changed');
    }
    const directoryHandle = await open(parent, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY);
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } catch (error) {
    try {
      await unlink(temporary);
    } catch {
      // The temporary is normally removed immediately after the no-overwrite link.
    }
    throw error;
  }
}

export function parseArguments(argv) {
  const flags = new Map([
    ['--evidence-root', 'evidenceRoot'],
    ['--output', 'output'],
    ['--repository', 'repository'],
    ['--repository-id', 'repositoryId'],
    ['--workflow-path', 'workflowPath'],
    ['--workflow-ref', 'workflowRef'],
    ['--source-revision', 'sourceRevision'],
    ['--run-id', 'runId'],
    ['--run-attempt', 'runAttempt'],
    ['--runner-name', 'runnerName'],
    ['--runner-os', 'runnerOs'],
    ['--runner-arch', 'runnerArch'],
  ]);
  if (argv.length !== flags.size * 2) {
    throw new TypeError('write-ci-evidence requires every locked CLI option exactly once');
  }
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const key = flags.get(flag);
    const value = argv[index + 1];
    if (!key || typeof value !== 'string' || value.length === 0 || Object.hasOwn(options, key)) {
      throw new TypeError(`unknown, duplicate, missing, or valueless CLI option ${JSON.stringify(flag)}`);
    }
    options[key] = value;
  }
  options.evidenceRoot = normalizedAbsolute(options.evidenceRoot, 'evidence root');
  options.output = normalizedAbsolute(options.output, 'output');
  if (options.output === options.evidenceRoot
      || options.output.startsWith(`${options.evidenceRoot}${path.sep}`)) {
    throw new TypeError('published evidence output must remain outside the private evidence root');
  }
  validateOptions(options);
  return options;
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const inputBytes = await readEvidenceRoot(options.evidenceRoot);
  const result = buildProtectedCiEvidence({ options, inputBytes });
  await writeNewAtomic(options.output, result.bytes);
  process.stdout.write(canonicalJsonBytes({
    evidenceDigest: result.evidence.evidenceDigest,
    fileDigest: result.fileDigest,
    output: options.output,
  }));
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
