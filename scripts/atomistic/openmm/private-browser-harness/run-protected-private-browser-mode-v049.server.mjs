#!/usr/bin/env node

import {
  lstatSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { networkInterfaces } from 'node:os';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  canonicalJson,
  canonicalJsonBytes,
  sha256,
} from '../../runtime-input-contract.mjs';
import { PRIVATE_CHROMIUM_LOCK_V049 } from './chromium-v049-lock.mjs';
import {
  preflightPrivateChromiumRuntimeV049,
} from './private-chromium-runtime-preflight-v049.mjs';
import {
  preflightPrivatePlaywrightPackagesV049,
} from './private-playwright-package-preflight-v049.mjs';

export const PROTECTED_BROWSER_MODE_RECEIPT_SCHEMA_V049 =
  'tf.openmm-tip3p-protected-browser-mode-receipt/0.4.9';

const PROFILE = 'protected-main-private-openmm-browser-mode-receipt';
const STATUS_DOMAIN =
  'same-job-real-source-browser-observation-not-attestation-reproduction-or-release';
const MODES = Object.freeze([
  'happy-path',
  'mid-playback-dispose',
  'context-loss',
]);
const MODE_SET = new Set(MODES);
const SOURCE_REVISION = /^(?!0{40}$)[0-9a-f]{40}$/;
const DIGEST = /^sha256:(?!0{64}$)[0-9a-f]{64}$/;
const INTERRUPTION_BARRIER_RENDERED_FRAME_COUNT = 37;
const STABLE_SESSION = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const ENVIRONMENT_KEYS = Object.freeze([
  'CI',
  'HOME',
  'LANG',
  'LC_ALL',
  'NODE_ENV',
  'PATH',
  'TAILING_BROWSER_APPARMOR_PROFILE',
  'TMPDIR',
  'TZ',
  'XDG_CACHE_HOME',
  'XDG_CONFIG_HOME',
  'XDG_RUNTIME_DIR',
]);
const TOP_LEVEL_KEYS = Object.freeze([
  'browserRuntime', 'claims', 'cleanup', 'client', 'controlReceipt', 'isolation',
  'mode', 'observation', 'profile', 'receiptDigest', 'schemaVersion', 'source',
  'sourceRevision', 'statusDomain',
]);
const CONTROL_KEYS = Object.freeze([
  'allPassed', 'artifactManifestDigest', 'payloadBundleRoot', 'planDigest',
  'producerOutcomeDigest', 'receiptDigest', 'scientificPass', 'status',
  'systemDigest', 'verifierDigest',
]);
const SOURCE_KEYS = Object.freeze([
  'atomOrderDigest', 'browserPacketDigest', 'browserTrajectoryMetadataDigest',
  'cellDigest', 'frameCount', 'orderedFrameDigest', 'orderedPositionFrameDigest',
  'positionsF32TrajectoryDigest', 'positionsOnly', 'privateTrajectoryMetadataDigest',
  'referenceARunArtifactDigest', 'referenceARunReceiptDigest', 'topologyDigest',
  'trajectoryDigest', 'worldSessionDigest',
]);
const RUNTIME_KEYS = Object.freeze([
  'browserVersion', 'chromiumRevision', 'distributionTreeDigest',
  'frozenRuntimeTreeDigest', 'hostRuntimeClosureVerified',
  'immutableRuntimeSnapshotVerified', 'packagePrePostMatched',
  'packagePreflightAfterDigest', 'packagePreflightBeforeDigest',
  'playwrightCorePackageTreeDigest', 'playwrightPackageTreeDigest',
  'playwrightVersion', 'runtimePrePostMatched', 'runtimePreflightAfterDigest',
  'runtimePreflightBeforeDigest',
]);
const ISOLATION_KEYS = Object.freeze([
  'allCapabilitySetsEmpty', 'allCredentialIdsNonRoot',
  'appArmorUserNamespaceProfileVerified', 'cgroupDrainVerified',
  'forbiddenEnvironmentAbsent', 'noNewPrivilegesVerified',
  'noSupplementaryPrivilegeGroups', 'onlyLoopbackInterfacesVerified',
  'onlyLoopbackRoutesVerified', 'pidNamespaceKillBoundaryVerified', 'platform',
  'readOnlyRuntimeMountVerified', 'readOnlySourceMountVerified',
]);
const CLIENT_KEYS = Object.freeze(['byteLength', 'responseDigestVerified', 'sha256']);
const OBSERVATION_KEYS = Object.freeze([
  'browserDrawObserved', 'cleanupComplete', 'clientResponseDigestVerified',
  'frameCount', 'mode', 'observationDigest', 'renderedFrameCount', 'rendererDisposed',
  'runtimeDisposed', 'sourceOwnerRevoked', 'status',
  'terminalState', 'threeDisposed', 'trajectoryCompleted',
]);
const CLEANUP_KEYS = Object.freeze([
  'assetBytesZeroized', 'listenerClosed', 'packetZeroized',
  'securePhysicalErasureVerified', 'tokenSourceBytesZeroized',
  'tokenVerifierBytesZeroized',
]);
const CLAIM_KEYS = Object.freeze([
  'cloudflareDistributionEligible', 'executionAuthenticated',
  'promotionEligible', 'publicDistributionEligible',
  'realChromiumProcessObserved', 'realOpenMmProducerOutputConsumed', 'reproduced',
  'sourceLicenseForPublicDistributionVerified',
]);
const REPOSITORY_ROOT = realpathSync(fileURLToPath(new URL('../../../../', import.meta.url)));
const NODE_RUNTIME_ROOT = path.dirname(path.dirname(realpathSync(process.execPath)));
const ROLLDOWN_BINDING_PATH = path.join(
  REPOSITORY_ROOT,
  'node_modules/@rolldown/binding-linux-x64-gnu/rolldown-binding.linux-x64-gnu.node',
);
const ROLLDOWN_BINDING_SIZE = 19_324_672;
const ROLLDOWN_BINDING_DIGEST =
  'sha256:ae16856655924ebc41f231393c7f8b89566430a845d1f073fd9d6abf219db04b';
const SERVER_ONLY_STUB_URL = `data:text/javascript,${encodeURIComponent(
  "if(typeof process==='undefined'||process.release?.name!=='node'||typeof window!=='undefined'){throw new Error('server-only boundary violated')}export{};",
)}`;
let serverOnlyHookRegistered = false;

/**
 * Execute exactly one protected private browser mode. All scientific inputs
 * are read through the production OpenMM loader; no fixture, injected
 * implementation, alternate browser executable, or authenticity flag exists.
 */
export async function runProtectedPrivateBrowserModeV049(options) {
  const input = validateRunOptions(options);
  let stage = 'process-boundary';
  let materialization = null;
  let harness = null;
  let observation = null;
  let source = null;
  let client = null;
  let cleanup = null;
  let primaryFailure = null;
  const cleanupFailures = [];
  let packageBefore;
  let runtimeBefore;
  let packageAfter;
  let runtimeAfter;

  const isolation = inspectProtectedProcessBoundary(input);
  try {
    stage = 'playwright-package-preflight-before';
    packageBefore = preflightPrivatePlaywrightPackagesV049();
    stage = 'chromium-runtime-preflight-before';
    runtimeBefore = preflightPrivateChromiumRuntimeV049({ runtimeRoot: input.runtimeRoot });

    stage = 'server-only-module-registration';
    registerServerOnlyMarkerHook();
    stage = 'protected-module-load';
    const loader = await import(
      '../../../../lib/simulation/openmm-world-session-loader-implementation.server.mjs'
    );
    const harnessModule = await import(
      './private-openmm-webgl2-trajectory-harness-v049.server.mjs'
    );
    const projectorModule = await import(
      '../../../../lib/simulation/atomistic-private-browser-position-trajectory-v049-projector.server.ts'
    );
    // This import executes Playwright code and therefore must stay after both
    // package and frozen-runtime preflights above.
    const observerModule = await import(
      './private-browser-trajectory-chromium-observer-v049.mjs'
    );

    stage = 'real-openmm-source-materialization';
    materialization = await loader.loadOpenMmTip3pPrivatePositionTrajectoryV048({
      artifactRoot: input.artifactRoot,
      independentControlReceiptPath: input.controlReceipt,
      expectedSourceRevision: input.sourceRevision,
      sessionId: input.sessionId,
    });
    const sourceLineage = projectSourceLineage(
      materialization,
      input.sourceRevision,
      projectorModule,
    );

    stage = 'private-browser-harness';
    harness = await harnessModule.startPrivateOpenMmWebGl2TrajectoryHarnessV049(
      materialization,
    );
    source = validateHarnessSource(harness.sourceAudit, sourceLineage);
    client = validateClientBuild(harness.clientBuildAudit);

    stage = 'real-chromium-observation';
    observation = await observerModule.observePrivateBrowserTrajectoryWithChromiumV049({
      executablePath: path.join(input.runtimeRoot, 'chrome-linux64', 'chrome'),
      expectedClientByteLength: client.byteLength,
      expectedClientSha256: client.sha256,
      expectedPacketDigest: harness.sourceAudit.packetDigest,
      mode: input.mode,
      url: harness.url,
    });
  } catch (error) {
    primaryFailure = new Error(`protected private browser mode failed: ${stage}`, { cause: error });
  } finally {
    if (harness !== null) {
      try {
        await harness.close();
        cleanup = validateHarnessCleanup(harness.lifecycle());
      } catch (error) {
        cleanupFailures.push(new Error('harness-cleanup', { cause: error }));
      }
    }
    if (materialization !== null) {
      try {
        registerServerOnlyMarkerHook();
        const loader = await import(
          '../../../../lib/simulation/openmm-world-session-loader-implementation.server.mjs'
        );
        loader.revokeOpenMmTip3pPrivatePositionTrajectoryV048(materialization);
      } catch (error) {
        cleanupFailures.push(new Error('source-revocation', { cause: error }));
      }
    }
    if (runtimeBefore !== undefined) {
      try {
        packageAfter = preflightPrivatePlaywrightPackagesV049();
        runtimeAfter = preflightPrivateChromiumRuntimeV049({ runtimeRoot: input.runtimeRoot });
      } catch (error) {
        cleanupFailures.push(new Error('postflight', { cause: error }));
      }
    }
  }

  if (primaryFailure !== null || cleanupFailures.length !== 0
      || observation === null || source === null || client === null || cleanup === null
      || packageBefore === undefined || packageAfter === undefined
      || runtimeBefore === undefined || runtimeAfter === undefined) {
    throw new Error('protected private browser mode failed: execution-or-cleanup');
  }

  const browserRuntime = projectRuntime(
    packageBefore,
    packageAfter,
    runtimeBefore,
    runtimeAfter,
  );
  const projectedObservation = projectObservation(
    input.mode,
    observation,
    harness.sourceAudit,
  );
  const preimage = {
    schemaVersion: PROTECTED_BROWSER_MODE_RECEIPT_SCHEMA_V049,
    profile: PROFILE,
    statusDomain: STATUS_DOMAIN,
    sourceRevision: input.sourceRevision,
    mode: input.mode,
    controlReceipt: source.controlReceipt,
    source: source.source,
    browserRuntime,
    isolation,
    client: {
      ...client,
      responseDigestVerified: projectedObservation.clientResponseDigestVerified,
    },
    observation: projectedObservation,
    cleanup,
    claims: {
      realOpenMmProducerOutputConsumed: true,
      realChromiumProcessObserved: true,
      executionAuthenticated: false,
      reproduced: false,
      promotionEligible: false,
      publicDistributionEligible: false,
      cloudflareDistributionEligible: false,
      sourceLicenseForPublicDistributionVerified: false,
    },
  };
  const receipt = assertProtectedPrivateBrowserModeReceiptV049({
    ...preimage,
    receiptDigest: sha256(canonicalJsonBytes(preimage)),
  });
  assertNoSensitiveOutput(receipt, input);
  return receipt;
}

function projectSourceLineage(materialization, sourceRevision, projectorModule) {
  const world = materialization?.worldSessionMaterialization;
  const session = world?.session;
  const verification = session?.verification;
  const metadata = materialization?.positionTrajectoryMetadata;
  if (materialization?.schemaVersion
      !== 'tf.openmm-tip3p-private-position-trajectory-materialization/0.4.8'
      || materialization.positionsOnlyDerivative !== true
      || materialization.executionAuthenticityVerified !== false
      || materialization.reproduced !== false
      || materialization.protectedMainArtifact !== false
      || materialization.publicPayload !== null
      || world?.schemaVersion !== 'tf.openmm-tip3p-world-session-materialization/0.4.5'
      || session?.schemaVersion !== 'tf.atomistic-world-session/0.4.5'
      || session.status !== 'scientific-self-consistency-verified-execution-unattested-session'
      || verification?.schemaVersion !== 'tf.openmm-tip3p-control-receipt/0.4.5'
      || verification.status !== 'verified-pass'
      || verification.sourceRevision !== sourceRevision
      || verification.executionAuthenticityVerified !== false
      || metadata?.schemaVersion !== 'tf.atomistic-private-position-trajectory/0.4.8'
      || metadata.inventory?.frameCount !== 101
      || metadata.scientificBoundary?.motionSynthesizedByThisAdapter !== false
      || metadata.scientificBoundary?.solverFrameOriginVerified !== false) {
    throw new Error('real OpenMM materialization crossed its conservative boundary');
  }
  const controlReceipt = {
    receiptDigest: verification.controlReceiptDigest,
    systemDigest: verification.systemDigest,
    planDigest: verification.planDigest,
    producerOutcomeDigest: verification.producerOutcomeDigest,
    artifactManifestDigest: verification.artifactManifestDigest,
    payloadBundleRoot: verification.payloadBundleRoot,
    verifierDigest: verification.verifierDigest,
    status: 'verified-pass',
    allPassed: true,
    scientificPass: true,
  };
  const source = {
    referenceARunReceiptDigest: session.trajectory.referenceARunReceiptDigest,
    referenceARunArtifactDigest: session.trajectory.referenceARunArtifactDigest,
    worldSessionDigest: session.sessionDigest,
    trajectoryDigest: session.trajectory.trajectoryDigest,
    orderedFrameDigest: session.trajectory.orderedFrameDigest,
    atomOrderDigest: session.atomOrder.atomOrderDigest,
    cellDigest: session.cell.cellDigest,
    topologyDigest: session.topology.topologyDigest,
    frameCount: 101,
    positionsOnly: true,
  };
  for (const value of [
    controlReceipt.receiptDigest,
    controlReceipt.systemDigest,
    controlReceipt.planDigest,
    controlReceipt.producerOutcomeDigest,
    controlReceipt.artifactManifestDigest,
    controlReceipt.payloadBundleRoot,
    controlReceipt.verifierDigest,
    source.referenceARunReceiptDigest,
    source.referenceARunArtifactDigest,
    source.worldSessionDigest,
    source.trajectoryDigest,
    source.orderedFrameDigest,
    source.atomOrderDigest,
    source.cellDigest,
    source.topologyDigest,
  ]) requireDigest(value, 'source lineage');
  const browserMetadata =
    projectorModule.createAtomisticPrivateBrowserPositionTrajectoryMetadataV049(metadata);
  if (browserMetadata?.binding?.sourceTrajectoryMetadataDigest !== metadata.metadataDigest
      || browserMetadata.positionChannel?.sha256
        !== metadata.sequence.derivedPositionsF32TrajectoryDigest) {
    throw new Error('browser position projection is not bound to the real materialization');
  }
  requireDigest(browserMetadata.metadataDigest, 'browser position projection metadata');
  requireDigest(
    browserMetadata.sequence?.orderedPositionFrameDigest,
    'browser ordered position frames',
  );
  return Object.freeze({ controlReceipt, source, metadata, browserMetadata });
}

function validateHarnessSource(audit, lineage) {
  if (audit?.schemaVersion !== 'tf.private-openmm-webgl2-trajectory-source-audit/0.4.9'
      || audit.frameCount !== 101 || audit.sourceHandleRevokedBeforeListen !== true
      || audit.sourceArtifactF64BytesIncluded !== false || audit.velocitiesIncluded !== false
      || audit.forcesIncluded !== false || audit.energiesIncluded !== false
      || audit.executionAuthenticityVerified !== false || audit.reproduced !== false
      || audit.protectedMainArtifact !== false || audit.publicDistributionEligible !== false
      || audit.cloudflareDistributionEligible !== false
      || audit.positionTrajectoryDigest
        !== lineage.metadata.sequence.derivedPositionsF32TrajectoryDigest
      || audit.privateTrajectoryMetadataDigest !== lineage.browserMetadata.metadataDigest
      || audit.orderedPositionFrameDigest
        !== lineage.browserMetadata.sequence.orderedPositionFrameDigest) {
    throw new Error('private browser harness source differs from the real materialization');
  }
  for (const value of [audit.packetDigest, audit.privateTrajectoryMetadataDigest,
    audit.positionTrajectoryDigest, audit.orderedPositionFrameDigest]) {
    requireDigest(value, 'private browser harness source');
  }
  return Object.freeze({
    controlReceipt: lineage.controlReceipt,
    source: {
      ...lineage.source,
      privateTrajectoryMetadataDigest: lineage.metadata.metadataDigest,
      browserTrajectoryMetadataDigest: audit.privateTrajectoryMetadataDigest,
      positionsF32TrajectoryDigest: audit.positionTrajectoryDigest,
      orderedPositionFrameDigest: audit.orderedPositionFrameDigest,
      browserPacketDigest: audit.packetDigest,
    },
  });
}

function validateClientBuild(audit) {
  if (audit?.schemaVersion !== 'tf.private-browser-trajectory-client-build-audit/0.4.9'
      || !Number.isSafeInteger(audit.clientByteLength) || audit.clientByteLength < 1
      || audit.clientByteLength > 2 * 1024 * 1024
      || audit.nodeBuiltinsIncluded !== false || audit.privateLoaderIncluded !== false
      || audit.serverIncluded !== false || audit.writtenToFilesystem !== false
      || audit.sourceMapsIncluded !== false || audit.publicDistributionEligible !== false
      || audit.cloudflareDistributionEligible !== false) {
    throw new Error('private browser client build crossed its boundary');
  }
  requireDigest(audit.clientSha256, 'private browser client');
  return Object.freeze({ byteLength: audit.clientByteLength, sha256: audit.clientSha256 });
}

function projectRuntime(packageBefore, packageAfter, runtimeBefore, runtimeAfter) {
  const packagePrePostMatched = canonicalJson(packageBefore) === canonicalJson(packageAfter);
  const runtimePrePostMatched = canonicalJson(runtimeBefore) === canonicalJson(runtimeAfter);
  if (!packagePrePostMatched || !runtimePrePostMatched
      || packageBefore.schemaVersion !== 'tf.private-playwright-package-preflight/0.4.9'
      || runtimeBefore.schemaVersion !== 'tf.private-chromium-runtime-preflight/0.4.9'
      || runtimeBefore.frozenDistributionTreeCheckpointVerified !== true
      || runtimeBefore.rootOwnedFrozenDistributionTreeCheckpointVerified !== true
      || runtimeBefore.nonRootExecutionCredentialsVerified !== true
      || runtimeBefore.completeHostRuntimeClosureVerified !== false
      || runtimeBefore.immutableRuntimeSnapshotVerified !== false) {
    throw new Error('browser package or runtime pre/post checkpoint changed');
  }
  const packages = new Map(packageBefore.packages.map((entry) => [entry.packageName, entry]));
  const playwright = packages.get('playwright');
  const playwrightCore = packages.get('playwright-core');
  requireDigest(playwright?.treeDigest, 'Playwright package tree');
  requireDigest(playwrightCore?.treeDigest, 'Playwright core package tree');
  return Object.freeze({
    playwrightVersion: packageBefore.playwrightVersion,
    browserVersion: runtimeBefore.browserVersion,
    chromiumRevision: runtimeBefore.chromiumRevision,
    playwrightPackageTreeDigest: playwright.treeDigest,
    playwrightCorePackageTreeDigest: playwrightCore.treeDigest,
    distributionTreeDigest: runtimeBefore.distributionTreeDigest,
    frozenRuntimeTreeDigest: runtimeBefore.frozenRuntimeTreeDigest,
    packagePreflightBeforeDigest: sha256(canonicalJsonBytes(packageBefore)),
    packagePreflightAfterDigest: sha256(canonicalJsonBytes(packageAfter)),
    packagePrePostMatched: true,
    runtimePreflightBeforeDigest: sha256(canonicalJsonBytes(runtimeBefore)),
    runtimePreflightAfterDigest: sha256(canonicalJsonBytes(runtimeAfter)),
    runtimePrePostMatched: true,
    hostRuntimeClosureVerified: false,
    immutableRuntimeSnapshotVerified: false,
  });
}

function projectObservation(mode, value, sourceAudit) {
  const interrupted = mode !== 'happy-path';
  const expectedRenderedFrameCount = interrupted
    ? INTERRUPTION_BARRIER_RENDERED_FRAME_COUNT : 101;
  const expectedStatus = interrupted
    ? 'digest-locked-main-executable-private-trajectory-interruption-failed-closed'
    : 'digest-locked-main-executable-private-trajectory-draw-observed';
  const expectedTerminal = mode === 'context-loss' ? 'context-lost' : 'disposed';
  if (value?.schemaVersion !== 'tf.private-browser-chromium-run-observation/0.4.9'
      || value.mode !== mode || value.status !== expectedStatus
      || value.clientJavaScriptResponseDigestVerified !== true
      || value.packetBytesIncluded !== false || value.coordinateBytesIncluded !== false
      || value.executionAuthenticityVerified !== false || value.reproduced !== false
      || value.protectedMainArtifact !== false || value.publicDistributionEligible !== false
      || value.cloudflareDistributionEligible !== false
      || value.lifecycle?.state !== expectedTerminal
      || value.lifecycle.cleanupComplete !== true
      || value.lifecycle.browserOwnerRevoked !== true
      || value.lifecycle.runtimeDisposed !== true
      || value.lifecycle.threeDisposed !== true
      || value.lifecycle.rendererDisposed !== true
      || value.lifecycle.contextRestoreRequiresNewCapability !== (mode === 'context-loss')
      || value.renderedFrameCount !== expectedRenderedFrameCount
      || (interrupted ? value.browserObservation !== null
        : value.browserObservation?.frameCount !== 101)
      || (!interrupted && value.browserObservation?.packetDigest !== sourceAudit.packetDigest)
      || (!interrupted && value.browserObservation?.webglOrWebgpuDrawExecuted !== true)) {
    throw new Error('Chromium observation differs from the exact mode boundary');
  }
  return Object.freeze({
    mode,
    status: expectedStatus,
    observationDigest: sha256(canonicalJsonBytes(value)),
    terminalState: expectedTerminal,
    cleanupComplete: true,
    sourceOwnerRevoked: true,
    runtimeDisposed: true,
    threeDisposed: true,
    rendererDisposed: true,
    clientResponseDigestVerified: true,
    browserDrawObserved: true,
    trajectoryCompleted: !interrupted,
    frameCount: interrupted ? null : 101,
    renderedFrameCount: expectedRenderedFrameCount,
  });
}

function validateHarnessCleanup(value) {
  if (value?.listenerClosed !== true || value.consumed !== true || value.finalized !== true
      || value.packetZeroized !== true || value.tokenSourceBytesZeroized !== true
      || value.tokenVerifierBytesZeroized !== true || value.assetBytesZeroized !== true
      || value.openSocketCount !== 0 || value.sessionTimerActive !== false
      || value.lingerTimerActive !== false || value.publicDistributionEligible !== false
      || value.cloudflareDistributionEligible !== false
      || value.securePhysicalErasureVerified !== false) {
    throw new Error('private browser harness cleanup did not close');
  }
  return Object.freeze({
    listenerClosed: true,
    packetZeroized: true,
    tokenSourceBytesZeroized: true,
    tokenVerifierBytesZeroized: true,
    assetBytesZeroized: true,
    securePhysicalErasureVerified: false,
  });
}

function inspectProtectedProcessBoundary(input) {
  if (process.platform !== 'linux' || process.arch !== 'x64'
      || process.version !== 'v24.16.0'
      || typeof process.getuid !== 'function' || typeof process.geteuid !== 'function'
      || typeof process.getgid !== 'function' || typeof process.getegid !== 'function') {
    throw new Error('protected browser mode requires Linux x64');
  }
  validateExactEnvironment(process.env, input);
  const runtimeIdentity = protectedRuntimeIdentity(input.runtimeRoot);
  if (NODE_RUNTIME_ROOT !== runtimeIdentity.nodeRuntimeRoot) {
    throw new Error('protected browser Node executable is outside the frozen runtime');
  }
  const nodeMetadata = lstatSync(realpathSync(process.execPath));
  if (!nodeMetadata.isFile() || nodeMetadata.isSymbolicLink() || nodeMetadata.nlink !== 1
      || nodeMetadata.uid !== 0 || nodeMetadata.gid !== 0
      || (nodeMetadata.mode & 0o777) !== 0o555) {
    throw new Error('protected browser Node executable is not root-frozen');
  }
  const rolldownMetadata = lstatSync(ROLLDOWN_BINDING_PATH);
  if (!rolldownMetadata.isFile() || rolldownMetadata.isSymbolicLink()
      || rolldownMetadata.nlink !== 1 || rolldownMetadata.uid !== 0
      || rolldownMetadata.gid !== 0 || (rolldownMetadata.mode & 0o777) !== 0o444
      || rolldownMetadata.size !== ROLLDOWN_BINDING_SIZE
      || sha256(readFileSync(ROLLDOWN_BINDING_PATH)) !== ROLLDOWN_BINDING_DIGEST) {
    throw new Error('protected browser Rolldown native binding is not exact and root-frozen');
  }
  const status = readFileSync('/proc/self/status', 'utf8');
  const uid = statusVector(status, 'Uid');
  const gid = statusVector(status, 'Gid');
  if (uid.length !== 4 || gid.length !== 4
      || uid[0] !== process.getuid() || uid[1] !== process.geteuid()
      || gid[0] !== process.getgid() || gid[1] !== process.getegid()
      || [...uid, ...gid].some((identifier) => identifier < 1)) {
    throw new Error('protected browser credentials are not exact nonroot credentials');
  }
  for (const key of ['CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb']) {
    if (!/^0{16}$/.test(statusValue(status, key))) {
      throw new Error('protected browser capability set is nonempty');
    }
  }
  if (statusValue(status, 'NoNewPrivs') !== '1'
      || statusValue(status, 'Groups', true) !== '') {
    throw new Error('protected browser no-new-privileges or group boundary failed');
  }
  const appArmorLabel = readFileSync('/proc/self/attr/current', 'utf8');
  if (Buffer.byteLength(appArmorLabel, 'utf8') > 512 || appArmorLabel.includes('\0')
      || appArmorLabel.trim() !== `${runtimeIdentity.appArmorProfile} (unconfined)`) {
    throw new Error('protected browser AppArmor user-namespace profile is not active');
  }
  const interfaceNames = readdirSync('/sys/class/net').sort();
  const addresses = networkInterfaces();
  if (canonicalJson(interfaceNames) !== canonicalJson(['lo'])
      || canonicalJson(Object.keys(addresses).sort()) !== canonicalJson(['lo'])
      || !Array.isArray(addresses.lo) || addresses.lo.length < 1
      || addresses.lo.some((address) => address.internal !== true)) {
    throw new Error('protected browser network namespace is not loopback-only');
  }
  const ipv4Routes = readFileSync('/proc/net/route', 'utf8').trim().split('\n').slice(1)
    .filter((line) => line.trim() !== '');
  const ipv6Routes = readFileSync('/proc/net/ipv6_route', 'utf8').trim().split('\n')
    .filter((line) => line.trim() !== '');
  if (ipv4Routes.some((line) => line.trim().split(/\s+/u)[0] !== 'lo')
      || ipv6Routes.some((line) => line.trim().split(/\s+/u).at(-1) !== 'lo')) {
    throw new Error('protected browser namespace exposes a non-loopback route');
  }
  const mounts = parseMountInfo(readFileSync('/proc/self/mountinfo', 'utf8'));
  if (!exactReadOnlyMount(mounts, REPOSITORY_ROOT, true)
      || !exactReadOnlyMount(mounts, input.artifactRoot, true)
      || !exactReadOnlyMount(mounts, input.controlReceipt, true)
      || !exactReadOnlyMount(mounts, input.runtimeRoot, false)
      || !exactReadOnlyMount(mounts, runtimeIdentity.nodeRuntimeRoot, false)
      || !exactReadOnlyMount(mounts, runtimeIdentity.rolldownRuntimeRoot, true)
      || !exactReadOnlyMount(mounts, ROLLDOWN_BINDING_PATH, false)) {
    throw new Error('protected browser source or runtime is not an exact read-only mount');
  }
  return Object.freeze({
    platform: 'linux-x64',
    allCredentialIdsNonRoot: true,
    allCapabilitySetsEmpty: true,
    noNewPrivilegesVerified: true,
    noSupplementaryPrivilegeGroups: true,
    appArmorUserNamespaceProfileVerified: true,
    forbiddenEnvironmentAbsent: true,
    onlyLoopbackInterfacesVerified: true,
    onlyLoopbackRoutesVerified: true,
    readOnlySourceMountVerified: true,
    readOnlyRuntimeMountVerified: true,
    pidNamespaceKillBoundaryVerified: false,
    cgroupDrainVerified: false,
  });
}

function validateExactEnvironment(environment, input) {
  const runtimeIdentity = protectedRuntimeIdentity(input.runtimeRoot);
  if (canonicalJson(Object.keys(environment).sort()) !== canonicalJson(ENVIRONMENT_KEYS)) {
    throw new Error('protected browser environment key set changed');
  }
  if (environment.CI !== '1' || environment.NODE_ENV !== 'production'
      || environment.TZ !== 'UTC' || environment.LANG !== 'C.UTF-8'
      || environment.LC_ALL !== 'C.UTF-8'
      || environment.TAILING_BROWSER_APPARMOR_PROFILE !== runtimeIdentity.appArmorProfile) {
    throw new Error('protected browser environment values changed');
  }
  const scratchPaths = ['HOME', 'TMPDIR', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME', 'XDG_RUNTIME_DIR'];
  const identities = new Set();
  for (const key of scratchPaths) {
    const directory = environment[key];
    if (!isCanonicalAbsolute(directory) || realpathSync(directory) !== directory) {
      throw new Error('protected browser scratch path is not canonical');
    }
    const metadata = lstatSync(directory);
    if (!metadata.isDirectory() || metadata.isSymbolicLink()
        || metadata.uid !== process.geteuid() || (metadata.mode & 0o777) !== 0o700) {
      throw new Error('protected browser scratch directory is not private');
    }
    const identity = `${metadata.dev}:${metadata.ino}`;
    if (identities.has(identity)) throw new Error('protected browser scratch directories alias');
    identities.add(identity);
    for (const protectedPath of [
      REPOSITORY_ROOT, input.artifactRoot, input.controlReceipt, input.runtimeRoot,
      NODE_RUNTIME_ROOT, runtimeIdentity.rolldownRuntimeRoot,
    ]) {
      if (directory === protectedPath || directory.startsWith(`${protectedPath}${path.sep}`)) {
        throw new Error('protected browser scratch overlaps an input');
      }
    }
  }
  const expectedPath = `${path.dirname(realpathSync(process.execPath))}:/usr/bin:/bin`;
  if (environment.PATH !== expectedPath) {
    throw new Error('protected browser PATH differs from the exact Node runtime path');
  }
}

function parseMountInfo(text) {
  if (Buffer.byteLength(text, 'utf8') > 4 * 1024 * 1024 || text.includes('\0')) {
    throw new Error('mountinfo is outside its bound');
  }
  return text.trim().split('\n').filter(Boolean).map((line) => {
    const fields = line.split(' ');
    if (fields.length < 10 || !fields.includes('-')) throw new Error('mountinfo is malformed');
    return {
      mountPoint: decodeMountField(fields[4]),
      options: new Set(fields[5].split(',')),
    };
  });
}

function decodeMountField(value) {
  return value.replace(/\\([0-7]{3})/gu, (_match, digits) =>
    String.fromCharCode(Number.parseInt(digits, 8)));
}

function exactReadOnlyMount(mounts, filename, noExec) {
  const matches = mounts.filter((mount) => mount.mountPoint === filename);
  return matches.length === 1 && matches[0].options.has('ro')
    && (noExec ? matches[0].options.has('noexec') : !matches[0].options.has('noexec'));
}

function protectedRuntimeIdentity(chromiumRuntimeRoot) {
  const match = /^\/opt\/tailing-private-chromium-([1-9][0-9]{0,31})-([1-9][0-9]{0,9})$/u
    .exec(chromiumRuntimeRoot);
  if (match === null) throw new Error('protected browser runtime identity is invalid');
  const suffix = `${match[1]}-${match[2]}`;
  return Object.freeze({
    appArmorProfile: `tailing-future-chromium-${suffix}`,
    nodeRuntimeRoot: `/opt/tailing-private-node-${suffix}`,
    rolldownRuntimeRoot: `/opt/tailing-private-rolldown-${suffix}`,
  });
}

function statusValue(status, key, allowEmpty = false) {
  if (Buffer.byteLength(status, 'utf8') > 64 * 1024 || status.includes('\0')) {
    throw new Error('Linux status is outside its bound');
  }
  const prefix = `${key}:`;
  const matches = status.split('\n').filter((line) => line.startsWith(prefix));
  if (matches.length !== 1) throw new Error('Linux status key is not unique');
  const value = matches[0].slice(prefix.length).trim();
  if (!allowEmpty && value === '') throw new Error('Linux status value is empty');
  return value;
}

function statusVector(status, key) {
  const value = statusValue(status, key);
  const parts = value.split(/\s+/u);
  if (parts.some((part) => !/^(?:0|[1-9][0-9]*)$/.test(part))) {
    throw new Error('Linux credential vector is invalid');
  }
  return parts.map(Number);
}

function registerServerOnlyMarkerHook() {
  if (serverOnlyHookRegistered) return;
  registerHooks({
    resolve(specifier, context, nextResolve) {
      if (specifier === 'server-only') return { shortCircuit: true, url: SERVER_ONLY_STUB_URL };
      return nextResolve(specifier, context);
    },
  });
  serverOnlyHookRegistered = true;
}

function validateRunOptions(options) {
  const value = exactRecord(options, [
    'artifactRoot', 'controlReceipt', 'mode', 'runtimeRoot', 'sessionId',
    'sourceRevision',
  ], 'protected browser mode options');
  for (const key of ['artifactRoot', 'controlReceipt', 'runtimeRoot']) {
    if (!isCanonicalAbsolute(value[key]) || realpathSync(value[key]) !== value[key]) {
      throw new TypeError(`protected browser ${key} must be a canonical absolute path`);
    }
  }
  if (!lstatSync(value.artifactRoot).isDirectory()
      || !lstatSync(value.runtimeRoot).isDirectory()
      || !lstatSync(value.controlReceipt).isFile()
      || value.controlReceipt === value.artifactRoot
      || value.controlReceipt.startsWith(`${value.artifactRoot}${path.sep}`)) {
    throw new TypeError('protected browser source roots are invalid');
  }
  if (!SOURCE_REVISION.test(value.sourceRevision) || !STABLE_SESSION.test(value.sessionId)
      || !MODE_SET.has(value.mode)) {
    throw new TypeError('protected browser revision, session, or mode is invalid');
  }
  return Object.freeze(value);
}

export function parseProtectedPrivateBrowserModeArgumentsV049(argv) {
  const flags = new Map([
    ['--artifact-root', 'artifactRoot'],
    ['--control-receipt', 'controlReceipt'],
    ['--source-revision', 'sourceRevision'],
    ['--session-id', 'sessionId'],
    ['--runtime-root', 'runtimeRoot'],
    ['--mode', 'mode'],
  ]);
  if (!Array.isArray(argv) || argv.length !== 12) {
    throw new TypeError('protected browser mode requires exactly six flag/value pairs');
  }
  const result = {};
  for (let index = 0; index < argv.length; index += 2) {
    const key = flags.get(argv[index]);
    const value = argv[index + 1];
    if (!key || typeof value !== 'string' || value === '' || Object.hasOwn(result, key)) {
      throw new TypeError('protected browser mode CLI contains an invalid flag');
    }
    result[key] = value;
  }
  if (Object.keys(result).length !== flags.size) {
    throw new TypeError('protected browser mode CLI is incomplete');
  }
  return validateRunOptions(result);
}

export function assertProtectedPrivateBrowserModeReceiptV049(candidate) {
  const receipt = exactRecord(candidate, TOP_LEVEL_KEYS, 'protected browser mode receipt');
  const control = exactRecord(receipt.controlReceipt, CONTROL_KEYS, 'controlReceipt');
  const source = exactRecord(receipt.source, SOURCE_KEYS, 'source');
  const runtime = exactRecord(receipt.browserRuntime, RUNTIME_KEYS, 'browserRuntime');
  const isolation = exactRecord(receipt.isolation, ISOLATION_KEYS, 'isolation');
  const client = exactRecord(receipt.client, CLIENT_KEYS, 'client');
  const observation = exactRecord(receipt.observation, OBSERVATION_KEYS, 'observation');
  const cleanup = exactRecord(receipt.cleanup, CLEANUP_KEYS, 'cleanup');
  const claims = exactRecord(receipt.claims, CLAIM_KEYS, 'claims');
  const interrupted = receipt.mode !== 'happy-path';
  const expectedStatus = interrupted
    ? 'digest-locked-main-executable-private-trajectory-interruption-failed-closed'
    : 'digest-locked-main-executable-private-trajectory-draw-observed';
  const expectedTerminal = receipt.mode === 'context-loss' ? 'context-lost' : 'disposed';
  if (receipt.schemaVersion !== PROTECTED_BROWSER_MODE_RECEIPT_SCHEMA_V049
      || receipt.profile !== PROFILE || receipt.statusDomain !== STATUS_DOMAIN
      || !SOURCE_REVISION.test(receipt.sourceRevision) || !MODE_SET.has(receipt.mode)
      || control.status !== 'verified-pass' || control.allPassed !== true
      || control.scientificPass !== true || source.frameCount !== 101
      || source.positionsOnly !== true
      || runtime.playwrightVersion !== PRIVATE_CHROMIUM_LOCK_V049.playwrightVersion
      || runtime.browserVersion !== PRIVATE_CHROMIUM_LOCK_V049.browserVersion
      || runtime.chromiumRevision !== PRIVATE_CHROMIUM_LOCK_V049.chromiumRevision
      || runtime.playwrightPackageTreeDigest
        !== PRIVATE_CHROMIUM_LOCK_V049.npmPackageLockBindings.playwright.ownPackageTree.digest
      || runtime.playwrightCorePackageTreeDigest
        !== PRIVATE_CHROMIUM_LOCK_V049.npmPackageLockBindings.playwrightCore.ownPackageTree.digest
      || runtime.distributionTreeDigest
        !== PRIVATE_CHROMIUM_LOCK_V049.platforms['linux-x64'].runtimeTree.digest
      || runtime.frozenRuntimeTreeDigest
        !== PRIVATE_CHROMIUM_LOCK_V049.platforms['linux-x64'].frozenRuntimeTree.digest
      || runtime.packagePreflightBeforeDigest !== runtime.packagePreflightAfterDigest
      || runtime.runtimePreflightBeforeDigest !== runtime.runtimePreflightAfterDigest
      || runtime.packagePrePostMatched !== true || runtime.runtimePrePostMatched !== true
      || runtime.hostRuntimeClosureVerified !== false
      || runtime.immutableRuntimeSnapshotVerified !== false
      || isolation.platform !== 'linux-x64'
      || isolation.allCredentialIdsNonRoot !== true
      || isolation.allCapabilitySetsEmpty !== true
      || isolation.appArmorUserNamespaceProfileVerified !== true
      || isolation.noNewPrivilegesVerified !== true
      || isolation.noSupplementaryPrivilegeGroups !== true
      || isolation.forbiddenEnvironmentAbsent !== true
      || isolation.onlyLoopbackInterfacesVerified !== true
      || isolation.onlyLoopbackRoutesVerified !== true
      || isolation.readOnlySourceMountVerified !== true
      || isolation.readOnlyRuntimeMountVerified !== true
      || isolation.pidNamespaceKillBoundaryVerified !== false
      || isolation.cgroupDrainVerified !== false
      || !Number.isSafeInteger(client.byteLength) || client.byteLength < 1
      || client.byteLength > 2 * 1024 * 1024 || client.responseDigestVerified !== true
      || observation.mode !== receipt.mode
      || observation.status !== expectedStatus || observation.terminalState !== expectedTerminal
      || observation.cleanupComplete !== true || observation.sourceOwnerRevoked !== true
      || observation.runtimeDisposed !== true || observation.threeDisposed !== true
      || observation.rendererDisposed !== true
      || observation.clientResponseDigestVerified !== true
      || observation.browserDrawObserved !== true
      || observation.trajectoryCompleted !== !interrupted
      || observation.frameCount !== (interrupted ? null : 101)
      || observation.renderedFrameCount !== (interrupted
        ? INTERRUPTION_BARRIER_RENDERED_FRAME_COUNT : 101)
      || cleanup.listenerClosed !== true || cleanup.packetZeroized !== true
      || cleanup.tokenSourceBytesZeroized !== true
      || cleanup.tokenVerifierBytesZeroized !== true || cleanup.assetBytesZeroized !== true
      || cleanup.securePhysicalErasureVerified !== false
      || claims.realOpenMmProducerOutputConsumed !== true
      || claims.realChromiumProcessObserved !== true
      || claims.executionAuthenticated !== false || claims.reproduced !== false
      || claims.promotionEligible !== false || claims.publicDistributionEligible !== false
      || claims.cloudflareDistributionEligible !== false
      || claims.sourceLicenseForPublicDistributionVerified !== false) {
    throw new Error('protected browser mode receipt failed its exact boundary');
  }
  for (const digest of [
    control.receiptDigest,
    control.systemDigest,
    control.planDigest,
    control.producerOutcomeDigest,
    control.artifactManifestDigest,
    control.payloadBundleRoot,
    control.verifierDigest,
    source.referenceARunReceiptDigest,
    source.referenceARunArtifactDigest,
    source.worldSessionDigest,
    source.trajectoryDigest,
    source.orderedFrameDigest,
    source.atomOrderDigest,
    source.cellDigest,
    source.topologyDigest,
    source.privateTrajectoryMetadataDigest,
    source.browserTrajectoryMetadataDigest,
    source.positionsF32TrajectoryDigest,
    source.orderedPositionFrameDigest,
    source.browserPacketDigest,
    runtime.playwrightPackageTreeDigest,
    runtime.playwrightCorePackageTreeDigest,
    runtime.distributionTreeDigest,
    runtime.frozenRuntimeTreeDigest,
    runtime.packagePreflightBeforeDigest,
    runtime.packagePreflightAfterDigest,
    runtime.runtimePreflightBeforeDigest,
    runtime.runtimePreflightAfterDigest,
    client.sha256,
    observation.observationDigest,
    receipt.receiptDigest,
  ]) requireDigest(digest, 'protected browser mode receipt');
  const { receiptDigest, ...preimage } = receipt;
  if (receiptDigest !== sha256(canonicalJsonBytes(preimage))) {
    throw new Error('protected browser mode receipt self digest is stale');
  }
  return deepFreeze(receipt);
}

function exactRecord(value, expectedKeys, label) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)
      || (Object.getPrototypeOf(value) !== Object.prototype
        && Object.getPrototypeOf(value) !== null)
      || Object.getOwnPropertySymbols(value).length !== 0) {
    throw new TypeError(`${label} must be one plain record`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (canonicalJson(Object.keys(descriptors).sort())
      !== canonicalJson([...expectedKeys].sort())
      || Object.values(descriptors).some((descriptor) =>
        !descriptor.enumerable || !Object.hasOwn(descriptor, 'value')
        || descriptor.value === undefined)) {
    throw new TypeError(`${label} keys or properties changed`);
  }
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => (
    [key, descriptor.value]
  )));
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new Error(`${label} digest is invalid`);
  }
}

function isCanonicalAbsolute(value) {
  return typeof value === 'string' && path.isAbsolute(value)
    && path.normalize(value) === value && !value.includes('\0');
}

function assertNoSensitiveOutput(receipt, input) {
  const text = canonicalJson(receipt);
  for (const forbidden of [
    input.artifactRoot, input.controlReceipt, input.runtimeRoot, input.sessionId,
    '127.0.0.1:', '#token=', 'coordinates', 'packetDigest', 'sourcePositionsArtifactDigest',
  ]) {
    if (text.includes(forbidden)) {
      throw new Error('protected browser mode receipt contains private transport material');
    }
  }
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

async function main() {
  try {
    const options = parseProtectedPrivateBrowserModeArgumentsV049(process.argv.slice(2));
    const receipt = await runProtectedPrivateBrowserModeV049(options);
    process.stdout.write(canonicalJsonBytes(receipt));
  } catch {
    process.stderr.write('protected private browser mode failed\n');
    process.exitCode = 1;
  }
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  await main();
}
