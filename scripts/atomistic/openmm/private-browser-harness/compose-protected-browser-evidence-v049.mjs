#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { constants as fsConstants, readFileSync } from 'node:fs';
import { chmod, link, lstat, open, realpath, unlink } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  canonicalJson,
  canonicalJsonBytes,
  parseJsonRejectDuplicateKeys,
  sha256,
} from '../../runtime-input-contract.mjs';

export const MODE_RECEIPT_SCHEMA_VERSION =
  'tf.openmm-tip3p-protected-browser-mode-receipt/0.4.9';
export const PROTECTED_BROWSER_EVIDENCE_SCHEMA_VERSION =
  'tf.openmm-tip3p-protected-browser-evidence/0.4.9';

export const MODE_ORDER = Object.freeze([
  'happy-path',
  'mid-playback-dispose',
  'context-loss',
]);

export const EXPECTED_INPUT_BASENAMES = Object.freeze({
  controlReceipt: 'openmm-tip3p-control-receipt.json',
  happyPathReceipt: 'openmm-tip3p-protected-browser-happy-path-receipt.json',
  midPlaybackDisposeReceipt:
    'openmm-tip3p-protected-browser-mid-playback-dispose-receipt.json',
  contextLossReceipt: 'openmm-tip3p-protected-browser-context-loss-receipt.json',
});

const OUTPUT_BASENAME = 'openmm-tip3p-protected-browser-evidence.json';
const DIGEST = /^sha256:(?!0{64}$)[0-9a-f]{64}$/;
const SOURCE_REVISION = /^(?!0{40}$)[0-9a-f]{40}$/;
const CONTROL_MAX_BYTES = 8_000_000;
const MODE_MAX_BYTES = 2 * 1024 * 1024;
const OUTPUT_MAX_BYTES = 2 * 1024 * 1024;
const ATOMIC_FILE_OPERATIONS = Object.freeze({ chmod, link, lstat, open, unlink });

const CONTROL_KEYS = Object.freeze([
  'receiptDigest', 'systemDigest', 'planDigest', 'producerOutcomeDigest',
  'artifactManifestDigest', 'payloadBundleRoot', 'verifierDigest', 'status',
  'allPassed', 'scientificPass',
]);
const SOURCE_DIGEST_KEYS = Object.freeze([
  'referenceARunReceiptDigest', 'referenceARunArtifactDigest', 'trajectoryDigest',
  'orderedFrameDigest', 'atomOrderDigest', 'cellDigest', 'topologyDigest',
  'worldSessionDigest', 'privateTrajectoryMetadataDigest',
  'browserTrajectoryMetadataDigest', 'positionsF32TrajectoryDigest',
  'orderedPositionFrameDigest', 'browserPacketDigest',
]);
const SOURCE_KEYS = Object.freeze([
  ...SOURCE_DIGEST_KEYS, 'frameCount', 'positionsOnly',
]);
const RUNTIME_KEYS = Object.freeze([
  'playwrightVersion', 'browserVersion', 'chromiumRevision',
  'playwrightPackageTreeDigest', 'playwrightCorePackageTreeDigest',
  'distributionTreeDigest', 'frozenRuntimeTreeDigest', 'packagePreflightBeforeDigest',
  'packagePreflightAfterDigest', 'packagePrePostMatched', 'runtimePreflightBeforeDigest',
  'runtimePreflightAfterDigest', 'runtimePrePostMatched', 'hostRuntimeClosureVerified',
  'immutableRuntimeSnapshotVerified',
]);
const ISOLATION = Object.freeze({
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
const LOCKED_RUNTIME = Object.freeze({
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
});
const MODE_DEFINITIONS = Object.freeze({
  'happy-path': Object.freeze({
    status: 'digest-locked-main-executable-private-trajectory-draw-observed',
    terminalState: 'disposed',
    browserDrawObserved: true,
    trajectoryCompleted: true,
    frameCount: 101,
    renderedFrameCount: 101,
  }),
  'mid-playback-dispose': Object.freeze({
    status: 'digest-locked-main-executable-private-trajectory-interruption-failed-closed',
    terminalState: 'disposed',
    browserDrawObserved: true,
    trajectoryCompleted: false,
    frameCount: null,
    renderedFrameCount: 37,
  }),
  'context-loss': Object.freeze({
    status: 'digest-locked-main-executable-private-trajectory-interruption-failed-closed',
    terminalState: 'context-lost',
    browserDrawObserved: true,
    trajectoryCompleted: false,
    frameCount: null,
    renderedFrameCount: 37,
  }),
});
const MODE_CLEANUP = Object.freeze({
  listenerClosed: true,
  packetZeroized: true,
  tokenSourceBytesZeroized: true,
  tokenVerifierBytesZeroized: true,
  assetBytesZeroized: true,
  securePhysicalErasureVerified: false,
});
const PUBLICATION_POLICY = Object.freeze({
  artifactClass: 'non-sensitive-administrative-browser-evidence-only',
  rawScientificPayloadPublished: false,
  runtimeInputsPublished: false,
  browserArtifactsPublished: false,
  publicDistributionEligible: false,
  cloudflareDistributionEligible: false,
  licenseClearance: false,
  attested: false,
});
const PUBLIC_CLAIMS = Object.freeze({
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

let validators;

function schemaValidators() {
  if (validators) return validators;
  const controlPath = fileURLToPath(new URL(
    '../../../../schemas/openmm-tip3p-control-receipt.schema.json', import.meta.url,
  ));
  const outputPath = fileURLToPath(new URL(
    '../../../../schemas/openmm-tip3p-protected-browser-evidence.schema.json', import.meta.url,
  ));
  const ajv = new Ajv2020({ allErrors: true, strict: true });
  validators = Object.freeze({
    control: ajv.compile(JSON.parse(readFileSync(controlPath, 'utf8'))),
    output: ajv.compile(JSON.parse(readFileSync(outputPath, 'utf8'))),
  });
  return validators;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function exactObject(value, keys, label) {
  if (!isPlainObject(value)
      || canonicalJson(Object.keys(value).sort()) !== canonicalJson([...keys].sort())) {
    throw new TypeError(`${label} has unexpected or missing fields`);
  }
  return value;
}

function parseCanonical(bytes, label, maximum) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    throw new TypeError(`${label} bytes are missing`);
  }
  if (bytes.length < 1 || bytes.length > maximum) {
    throw new TypeError(`${label} is outside its byte bound`);
  }
  const value = parseJsonRejectDuplicateKeys(bytes, label);
  if (!Buffer.from(bytes).equals(canonicalJsonBytes(value))) {
    throw new TypeError(`${label} must use exact canonical JSON plus one LF`);
  }
  return value;
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new TypeError(`${label} must be a SHA-256 digest`);
  }
}

function controlProjection(control) {
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

function validateControl(bytes) {
  const control = parseCanonical(bytes, 'OpenMM control receipt', CONTROL_MAX_BYTES);
  if (!isPlainObject(control)) throw new TypeError('OpenMM control receipt must be a JSON object');
  const validate = schemaValidators().control;
  if (!validate(control)) {
    throw new TypeError(`OpenMM control receipt failed schema validation: ${JSON.stringify(validate.errors)}`);
  }
  const { receiptDigest, ...preimage } = control;
  if (sha256(canonicalJsonBytes(preimage)) !== receiptDigest) {
    throw new TypeError('OpenMM control receipt has a stale self digest');
  }
  if (!SOURCE_REVISION.test(control.sourceRevision ?? '')
      || control.status !== 'verified-pass' || control.gates?.allPassed !== true
      || control.claims?.scientificPass !== true
      || control.verification?.executionAuthenticityVerified !== false
      || control.claims?.openmmExecutionAuthenticated !== false
      || control.claims?.reproduced !== false
      || control.claims?.scorePromotionEligible !== false
      || control.publicationPolicy?.licenseClearance !== false
      || control.publicationPolicy?.rawPayloadPublic !== false
      || control.publicationPolicy?.cloudflareDistributionEligible !== false
      || control.publicationPolicy?.promotionEligible !== false) {
    throw new TypeError('OpenMM control receipt is not one private non-promotional verified pass');
  }
  return control;
}

function validateModeReceipt(bytes, expectedMode, expectedControl, sourceRevision) {
  const receipt = exactObject(parseCanonical(
    bytes, `${expectedMode} mode receipt`, MODE_MAX_BYTES,
  ), [
    'schemaVersion', 'profile', 'statusDomain', 'sourceRevision', 'mode', 'controlReceipt',
    'source', 'browserRuntime', 'isolation', 'client', 'observation', 'cleanup', 'claims',
    'receiptDigest',
  ], `${expectedMode} mode receipt`);
  if (receipt.schemaVersion !== MODE_RECEIPT_SCHEMA_VERSION
      || receipt.profile !== 'protected-main-private-openmm-browser-mode-receipt'
      || receipt.statusDomain
        !== 'same-job-real-source-browser-observation-not-attestation-reproduction-or-release'
      || receipt.sourceRevision !== sourceRevision || receipt.mode !== expectedMode) {
    throw new TypeError(`${expectedMode} mode receipt identity changed`);
  }
  exactObject(receipt.controlReceipt, CONTROL_KEYS, `${expectedMode} control binding`);
  if (canonicalJson(receipt.controlReceipt) !== canonicalJson(expectedControl)) {
    throw new TypeError(`${expectedMode} mode receipt differs from the OpenMM control receipt`);
  }

  const source = exactObject(receipt.source, SOURCE_KEYS, `${expectedMode} source`);
  for (const key of SOURCE_DIGEST_KEYS) assertDigest(source[key], `${expectedMode} ${key}`);
  if (source.frameCount !== 101 || source.positionsOnly !== true) {
    throw new TypeError(`${expectedMode} source boundary changed`);
  }

  const runtime = exactObject(receipt.browserRuntime, RUNTIME_KEYS, `${expectedMode} runtime`);
  for (const [key, value] of Object.entries(LOCKED_RUNTIME)) {
    if (runtime[key] !== value) throw new TypeError(`${expectedMode} runtime ${key} changed`);
  }
  for (const key of [
    'packagePreflightBeforeDigest', 'packagePreflightAfterDigest',
    'runtimePreflightBeforeDigest', 'runtimePreflightAfterDigest',
  ]) assertDigest(runtime[key], `${expectedMode} ${key}`);
  if (runtime.packagePrePostMatched !== true || runtime.runtimePrePostMatched !== true
      || runtime.packagePreflightBeforeDigest !== runtime.packagePreflightAfterDigest
      || runtime.runtimePreflightBeforeDigest !== runtime.runtimePreflightAfterDigest
      || runtime.hostRuntimeClosureVerified !== false
      || runtime.immutableRuntimeSnapshotVerified !== false) {
    throw new TypeError(`${expectedMode} runtime pre/post or closure boundary changed`);
  }

  exactObject(receipt.isolation, Object.keys(ISOLATION), `${expectedMode} isolation`);
  if (canonicalJson(receipt.isolation) !== canonicalJson(ISOLATION)) {
    throw new TypeError(`${expectedMode} isolation boundary changed`);
  }
  const client = exactObject(
    receipt.client, ['byteLength', 'sha256', 'responseDigestVerified'], `${expectedMode} client`,
  );
  if (!Number.isSafeInteger(client.byteLength) || client.byteLength < 1
      || client.byteLength > 2 * 1024 * 1024 || !DIGEST.test(client.sha256 ?? '')
      || client.responseDigestVerified !== true) {
    throw new TypeError(`${expectedMode} client binding changed`);
  }

  const definition = MODE_DEFINITIONS[expectedMode];
  const observation = exactObject(receipt.observation, [
    'mode', 'status', 'observationDigest', 'terminalState', 'cleanupComplete',
    'sourceOwnerRevoked', 'runtimeDisposed', 'threeDisposed', 'rendererDisposed',
    'clientResponseDigestVerified', 'browserDrawObserved', 'frameCount',
    'renderedFrameCount', 'trajectoryCompleted',
  ], `${expectedMode} observation`);
  assertDigest(observation.observationDigest, `${expectedMode} observationDigest`);
  if (observation.mode !== expectedMode || observation.status !== definition.status
      || observation.terminalState !== definition.terminalState
      || observation.cleanupComplete !== true || observation.sourceOwnerRevoked !== true
      || observation.runtimeDisposed !== true || observation.threeDisposed !== true
      || observation.rendererDisposed !== true
      || observation.clientResponseDigestVerified !== true
      || observation.browserDrawObserved !== definition.browserDrawObserved
      || observation.trajectoryCompleted !== definition.trajectoryCompleted
      || observation.frameCount !== definition.frameCount
      || observation.renderedFrameCount !== definition.renderedFrameCount) {
    throw new TypeError(`${expectedMode} observation did not pass its exact boundary`);
  }
  exactObject(receipt.cleanup, Object.keys(MODE_CLEANUP), `${expectedMode} cleanup`);
  if (canonicalJson(receipt.cleanup) !== canonicalJson(MODE_CLEANUP)) {
    throw new TypeError(`${expectedMode} cleanup boundary changed`);
  }
  const claims = exactObject(receipt.claims, [
    'realOpenMmProducerOutputConsumed', 'realChromiumProcessObserved',
    'executionAuthenticated', 'reproduced', 'promotionEligible', 'publicDistributionEligible',
    'cloudflareDistributionEligible', 'sourceLicenseForPublicDistributionVerified',
  ], `${expectedMode} claims`);
  const expectedClaims = {
    realOpenMmProducerOutputConsumed: true,
    realChromiumProcessObserved: true,
    executionAuthenticated: false,
    reproduced: false,
    promotionEligible: false,
    publicDistributionEligible: false,
    cloudflareDistributionEligible: false,
    sourceLicenseForPublicDistributionVerified: false,
  };
  if (canonicalJson(claims) !== canonicalJson(expectedClaims)) {
    throw new TypeError(`${expectedMode} claims crossed their conservative boundary`);
  }
  const { receiptDigest, ...preimage } = receipt;
  assertDigest(receiptDigest, `${expectedMode} receiptDigest`);
  if (sha256(canonicalJsonBytes(preimage)) !== receiptDigest) {
    throw new TypeError(`${expectedMode} mode receipt has a stale self digest`);
  }
  return receipt;
}

function identicalAcrossModes(receipts, key, label) {
  const expected = canonicalJson(receipts[0][key]);
  if (receipts.some((receipt) => canonicalJson(receipt[key]) !== expected)) {
    throw new TypeError(`${label} differs across browser modes`);
  }
}

export function buildProtectedBrowserEvidence({ controlReceiptBytes, modeReceiptBytes }) {
  const control = validateControl(controlReceiptBytes);
  exactObject(modeReceiptBytes, MODE_ORDER, 'mode receipt bytes');
  const expectedControl = controlProjection(control);
  const receipts = MODE_ORDER.map((mode) => validateModeReceipt(
    modeReceiptBytes[mode], mode, expectedControl, control.sourceRevision,
  ));
  for (const [key, label] of [
    ['controlReceipt', 'control receipt binding'],
    ['source', 'source lineage'],
    ['browserRuntime', 'browser runtime'],
    ['isolation', 'isolation receipt'],
    ['client', 'client bytes'],
  ]) identicalAcrossModes(receipts, key, label);
  if (new Set(receipts.map((receipt) => receipt.receiptDigest)).size !== 3
      || new Set(receipts.map((receipt) => receipt.observation.observationDigest)).size !== 3) {
    throw new TypeError('the three modes must have distinct receipt and observation digests');
  }

  const shared = receipts[0];
  const preimage = {
    schemaVersion: PROTECTED_BROWSER_EVIDENCE_SCHEMA_VERSION,
    profile: 'protected-main-private-openmm-positions-three-mode-browser-evidence',
    statusDomain: 'protected-ci-browser-observation-not-execution-attestation-reproduction-or-release',
    sourceRevision: control.sourceRevision,
    controlReceipt: { ...expectedControl },
    source: { ...shared.source },
    browserRuntime: {
      ...LOCKED_RUNTIME,
      allModePrePostCheckpointsMatched: true,
      hostRuntimeClosureVerified: false,
      immutableRuntimeSnapshotVerified: false,
    },
    isolation: { ...ISOLATION },
    client: {
      byteLength: shared.client.byteLength,
      sha256: shared.client.sha256,
      responseDigestVerifiedInAllModes: true,
    },
    modeResults: receipts.map((receipt) => ({ ...receipt.observation })),
    crossMode: {
      sameSourceLineage: true,
      sameTrajectoryBinding: true,
      sameClientBytes: true,
      sameFrozenRuntimeTree: true,
      threeFreshCapabilities: true,
    },
    cleanup: {
      allListenersClosed: true,
      allPacketsZeroized: true,
      allTokenVerifierBytesZeroized: true,
      allAssetsZeroized: true,
      securePhysicalErasureVerified: false,
    },
    publicationPolicy: { ...PUBLICATION_POLICY },
    claims: { ...PUBLIC_CLAIMS },
  };
  const evidence = { ...preimage, evidenceDigest: sha256(canonicalJsonBytes(preimage)) };
  const validate = schemaValidators().output;
  if (!validate(evidence)) {
    throw new TypeError(`protected browser evidence failed schema validation: ${JSON.stringify(validate.errors)}`);
  }
  const bytes = canonicalJsonBytes(evidence);
  if (bytes.length > OUTPUT_MAX_BYTES) throw new TypeError('protected browser evidence is too large');
  return { evidence, bytes, fileDigest: sha256(bytes) };
}

function normalizedAbsolute(value, label) {
  if (typeof value !== 'string' || !path.isAbsolute(value)
      || path.normalize(value) !== value || path.resolve(value) !== value) {
    throw new TypeError(`${label} must be a normalized absolute path`);
  }
  return value;
}

function sameStat(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mode === right.mode && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

async function readAtMost(handle, maximum, label) {
  const chunks = [];
  let total = 0;
  while (total <= maximum) {
    const remaining = Math.min(64 * 1024, maximum + 1 - total);
    if (remaining < 1) break;
    const buffer = Buffer.allocUnsafe(remaining);
    const { bytesRead } = await handle.read(buffer, 0, remaining, null);
    if (bytesRead === 0) break;
    chunks.push(buffer.subarray(0, bytesRead));
    total += bytesRead;
  }
  if (total > maximum) throw new TypeError(`${label} exceeds its byte bound`);
  return Buffer.concat(chunks, total);
}

async function readSafe(filename, label, maximum) {
  const absolute = normalizedAbsolute(filename, `${label} path`);
  if (await realpath(absolute) !== absolute) throw new TypeError(`${label} must not traverse a symlink`);
  const before = await lstat(absolute, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size < 1n || before.size > BigInt(maximum)) {
    throw new TypeError(`${label} must be one bounded single-link regular file`);
  }
  const handle = await open(absolute, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const bytes = await readAtMost(handle, maximum, label);
    const descriptor = await handle.stat({ bigint: true });
    const after = await lstat(absolute, { bigint: true });
    if (!sameStat(before, descriptor) || !sameStat(after, descriptor)
        || BigInt(bytes.length) !== after.size || await realpath(absolute) !== absolute) {
      throw new Error(`${label} changed during its bounded read`);
    }
    return { absolute, bytes, dev: after.dev, ino: after.ino };
  } finally {
    await handle.close();
  }
}

function inodeIdentity(stat) {
  return Object.freeze({ dev: stat.dev, ino: stat.ino });
}

function matchesInode(stat, identity) {
  return identity !== null && stat.dev === identity.dev && stat.ino === identity.ino;
}

async function unlinkOwnedPath(filename, identity, operations) {
  if (identity === null) return;
  let current;
  try {
    current = await operations.lstat(filename, { bigint: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return;
    throw error;
  }
  if (!current.isFile() || current.isSymbolicLink() || !matchesInode(current, identity)) return;
  await operations.unlink(filename);
}

export async function writeNewAtomic(filename, bytes, operations = ATOMIC_FILE_OPERATIONS) {
  const output = normalizedAbsolute(filename, 'output');
  if (path.basename(output) !== OUTPUT_BASENAME) {
    throw new TypeError(`output must name ${OUTPUT_BASENAME}`);
  }
  const parent = path.dirname(output);
  if (await realpath(parent) !== parent) throw new TypeError('output parent must not traverse a symlink');
  const parentBefore = await lstat(parent, { bigint: true });
  if (!parentBefore.isDirectory() || parentBefore.isSymbolicLink()) {
    throw new TypeError('output parent must be one real directory');
  }
  const temporary = path.join(parent, `.${OUTPUT_BASENAME}.${randomUUID()}.tmp`);
  let handle = null;
  let temporaryIdentity = null;
  let outputIdentity = null;
  try {
    handle = await operations.open(
      temporary,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL
        | (fsConstants.O_NOFOLLOW ?? 0),
      0o600,
    );
    const opened = await handle.stat({ bigint: true });
    if (!opened.isFile() || opened.isSymbolicLink() || opened.nlink !== 1n) {
      throw new Error('temporary browser evidence identity changed after open');
    }
    temporaryIdentity = inodeIdentity(opened);
    await handle.writeFile(bytes);
    await handle.sync();
    await handle.close();
    handle = null;
    await operations.chmod(temporary, 0o444);
    await operations.link(temporary, output);
    outputIdentity = temporaryIdentity;
    const linked = await operations.lstat(output, { bigint: true });
    if (!linked.isFile() || linked.isSymbolicLink() || linked.nlink !== 2n
        || !matchesInode(linked, outputIdentity)) {
      throw new Error('linked browser evidence output does not retain the temporary inode');
    }
    await unlinkOwnedPath(temporary, temporaryIdentity, operations);
    try {
      await operations.lstat(temporary, { bigint: true });
      throw new Error('temporary browser evidence path remained after owned-inode unlink');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    const published = await operations.lstat(output, { bigint: true });
    const parentAfter = await operations.lstat(parent, { bigint: true });
    if (!published.isFile() || published.isSymbolicLink() || published.nlink !== 1n
        || !matchesInode(published, outputIdentity)
        || (published.mode & 0o777n) !== 0o444n || published.size !== BigInt(bytes.length)
        || parentBefore.dev !== parentAfter.dev || parentBefore.ino !== parentAfter.ino) {
      throw new Error('published browser evidence identity, mode, or size changed');
    }
    const directoryHandle = await operations.open(
      parent, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY,
    );
    try {
      await directoryHandle.sync();
    } finally {
      await directoryHandle.close();
    }
  } catch (error) {
    if (handle !== null) {
      try { await handle.close(); } catch { /* cleanup continues by inode */ }
      handle = null;
    }
    const cleanupErrors = [];
    for (const [target, identity] of [
      [output, outputIdentity],
      [temporary, temporaryIdentity],
    ]) {
      try {
        await unlinkOwnedPath(target, identity, operations);
      } catch (cleanupError) {
        cleanupErrors.push(cleanupError);
      }
    }
    if (cleanupErrors.length !== 0) {
      throw new AggregateError(
        [error, ...cleanupErrors],
        'atomic browser evidence write failed and owned-path cleanup was incomplete',
      );
    }
    throw error;
  }
}

export function parseArguments(argv) {
  const flags = new Map([
    ['--control-receipt', 'controlReceipt'],
    ['--happy-path-receipt', 'happyPathReceipt'],
    ['--mid-playback-dispose-receipt', 'midPlaybackDisposeReceipt'],
    ['--context-loss-receipt', 'contextLossReceipt'],
    ['--output', 'output'],
  ]);
  if (argv.length !== flags.size * 2) {
    throw new TypeError('composer requires every locked CLI option exactly once');
  }
  const options = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = flags.get(argv[index]);
    const value = argv[index + 1];
    if (!key || typeof value !== 'string' || value.length === 0 || Object.hasOwn(options, key)) {
      throw new TypeError(`unknown, duplicate, missing, or valueless CLI option ${JSON.stringify(argv[index])}`);
    }
    options[key] = normalizedAbsolute(value, key);
  }
  for (const [key, basename] of Object.entries(EXPECTED_INPUT_BASENAMES)) {
    if (path.basename(options[key]) !== basename) throw new TypeError(`${key} basename changed`);
  }
  if (path.basename(options.output) !== OUTPUT_BASENAME) throw new TypeError('output basename changed');
  const inputPaths = Object.keys(EXPECTED_INPUT_BASENAMES).map((key) => options[key]);
  if (new Set([...inputPaths, options.output]).size !== inputPaths.length + 1
      || inputPaths.some((input) => {
        const privateDirectory = path.dirname(input);
        return path.dirname(options.output) === privateDirectory
          || options.output.startsWith(`${privateDirectory}${path.sep}`);
      })) {
    throw new TypeError('output must remain distinct from and outside private receipt directories');
  }
  return options;
}

export async function runCli(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const inputKeys = Object.keys(EXPECTED_INPUT_BASENAMES);
  const reads = await Promise.all(inputKeys.map((key) => readSafe(
    options[key], key, key === 'controlReceipt' ? CONTROL_MAX_BYTES : MODE_MAX_BYTES,
  )));
  const identities = new Set(reads.map((record) => `${record.dev}:${record.ino}`));
  if (identities.size !== reads.length) throw new TypeError('input receipts alias one inode');
  const byKey = Object.fromEntries(reads.map((record, index) => [inputKeys[index], record.bytes]));
  const result = buildProtectedBrowserEvidence({
    controlReceiptBytes: byKey.controlReceipt,
    modeReceiptBytes: {
      'happy-path': byKey.happyPathReceipt,
      'mid-playback-dispose': byKey.midPlaybackDisposeReceipt,
      'context-loss': byKey.contextLossReceipt,
    },
  });
  await writeNewAtomic(options.output, result.bytes);
  process.stdout.write(canonicalJsonBytes({
    evidenceDigest: result.evidence.evidenceDigest,
    fileDigest: result.fileDigest,
  }));
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
