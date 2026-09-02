import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, readFile, realpath } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { chromium } from 'playwright';
import { PRIVATE_CHROMIUM_LOCK_V049 } from './chromium-v049-lock.mjs';

const INPUT_KEYS = Object.freeze([
  'executablePath',
  'expectedClientByteLength',
  'expectedClientSha256',
  'expectedPacketDigest',
  'mode',
  'url',
]);
const OBSERVATION_KEYS = Object.freeze([
  'aggregatePositionsDigestWebCryptoVerified',
  'allFrameSliceDigestsWebCryptoVerified',
  'allFramesEightOctantCoverageVerified',
  'allFramesRigidWaterGeometryVerified',
  'allFramesUniqueOxygenAnchorsVerified',
  'attestedArtifact',
  'browserGeometryGateMeaning',
  'browserGeometryValidatedFrameCount',
  'browserPositionsOwnerRevoked',
  'cloudflareDistributionEligible',
  'completePhysicalStateIncluded',
  'createsSolverFrames',
  'drawCallsMaximum',
  'drawCallsMinimum',
  'electronicDensityRendered',
  'executionAuthenticityVerified',
  'fieldsRendered',
  'firstSourceFrameOrdinal',
  'forceConsumed',
  'frameCount',
  'geometryIdentityStable',
  'glNoErrorForAllFrames',
  'hydrogenInstanceCount',
  'instanceMatrixArrayIdentityStable',
  'instanceMatrixIdentityStable',
  'interpolationApplied',
  'lastSourceFrameOrdinal',
  'materialIdentityStable',
  'motionSynthesizedByThisBrowserAdapter',
  'nonphysicalDisplayScale',
  'finalFramePixelsDifferingFromLowerLeftReference',
  'objectIdentityStable',
  'orderedPositionFrameDigest',
  'oxygenInstanceCount',
  'packetDigest',
  'packetDigestWebCryptoVerified',
  'performanceClaim',
  'persistentInstancedMeshCount',
  'positionTrajectoryDigest',
  'promotionEligible',
  'protectedMainArtifact',
  'publicDistributionEligible',
  'raycastAtomIndices',
  'raycastFrameOrdinals',
  'renderCount',
  'rendererGeometryAndTextureCountsStableAfterWarmup',
  'reproduced',
  'revokedFrameAccessRejected',
  'schedulerSemantics',
  'schedulerYieldCount',
  'schemaVersion',
  'securePhysicalErasureVerified',
  'sameSourceStateRepeated',
  'sourceBoundary',
  'sourceMotionProvenance',
  'sourceLicenseForPublicDistributionVerified',
  'status',
  'strictSourceFrameSequenceAdvanced',
  'topologyLinkInstanceCount',
  'topologyLinksEnergetic',
  'trajectoryMetadataDigest',
  'trianglesMaximum',
  'trianglesMinimum',
  'updateCount',
  'uploadCount',
  'urlFragmentCredentialClearedBeforeRequest',
  'validatedFrameSliceCount',
  'velocityConsumed',
  'webgl2',
  'webglOrWebgpuDrawExecuted',
]);
const LIFECYCLE_KEYS = Object.freeze([
  'browserOwnerRevoked',
  'cleanupComplete',
  'contextRestoreRequiresNewCapability',
  'rendererDisposed',
  'runtimeDisposed',
  'state',
  'threeDisposed',
]);
const MODES = new Set(['happy-path', 'mid-playback-dispose', 'context-loss']);
const TOKEN = /^#token=[0-9a-f]{64}$/;
const DIGEST = /^sha256:(?!0{64}$)[0-9a-f]{64}$/;
const OBSERVATION_TIMEOUT_MS = 90_000;
const CLOSE_TIMEOUT_MS = 10_000;
export const INTERRUPTION_BARRIER_RENDERED_FRAME_COUNT_V049 = 37;
const require = createRequire(import.meta.url);

/**
 * Drive one already-started V049 loopback capability with the exact pinned
 * Chromium executable. No screenshot, video, trace, HAR, browser profile, URL,
 * token, port, coordinate, or packet byte is returned from this observer.
 */
export async function observePrivateBrowserTrajectoryWithChromiumV049(input) {
  let validated = null;
  let executableAudit = null;
  let browser = null;
  let context = null;
  let page = null;
  let consoleErrorCount = 0;
  let pageErrorCount = 0;
  let unexpectedRequestCount = 0;
  let clientJavaScriptResponseDigestVerified = false;
  let result = null;
  let failure = null;
  let failureStage = 'input-validation';
  try {
    validated = validateInput(input);
    assertNoPlaywrightDebugEnvironment();
    assertChromiumSandboxHostPreconditions();
    failureStage = 'playwright-runtime-audit';
    await verifyPlaywrightRuntimeVersion();
    failureStage = 'prelaunch-executable-audit';
    executableAudit = await verifyLockedExecutableFile(validated.executablePath);
    failureStage = 'browser-launch';
    browser = await chromium.launch({
      executablePath: validated.executablePath,
      headless: true,
      chromiumSandbox: true,
      args: [
        '--disable-background-networking',
        '--disable-component-update',
        '--disable-default-apps',
        '--disable-domain-reliability',
        '--disable-sync',
        '--metrics-recording-only',
        '--no-first-run',
      ],
    });
    if (browser.version() !== PRIVATE_CHROMIUM_LOCK_V049.browserVersion) {
      throw new Error('launched Chromium version differs from the exact V049 lock');
    }
    failureStage = 'postlaunch-executable-audit';
    const postLaunchAudit = await verifyLockedExecutableFile(validated.executablePath);
    if (!sameExecutableAudit(executableAudit, postLaunchAudit)) {
      throw new Error('private Chromium executable changed across launch');
    }
    executableAudit = Object.freeze({
      ...executableAudit,
      mainExecutableIdentityStableAcrossLaunch: true,
    });
    failureStage = 'browser-context';
    context = await browser.newContext({
      acceptDownloads: false,
      bypassCSP: false,
      colorScheme: 'dark',
      deviceScaleFactor: 1,
      javaScriptEnabled: true,
      locale: 'en-US',
      offline: false,
      reducedMotion: 'reduce',
      serviceWorkers: 'block',
      timezoneId: 'UTC',
      viewport: { width: 1_360, height: 820 },
    });
    const expectedOrigin = new URL(validated.url).origin;
    await context.route('**/*', async (route) => {
      const request = route.request();
      const requestUrl = new URL(request.url());
      const routeKey = `${request.method()} ${requestUrl.pathname}`;
      const allowed = requestUrl.origin === expectedOrigin
        && requestUrl.search === ''
        && requestUrl.hash === ''
        && (routeKey === 'GET /'
          || routeKey === 'GET /client.js'
          || routeKey === 'POST /trajectory');
      if (!allowed) {
        unexpectedRequestCount += 1;
        await route.abort('blockedbyclient');
        return;
      }
      await route.continue();
    });
    page = await context.newPage();
    page.on('console', (message) => {
      if (message.type() === 'error') consoleErrorCount += 1;
    });
    page.on('pageerror', () => { pageErrorCount += 1; });
    failureStage = 'private-page-navigation';
    const clientResponsePromise = page.waitForResponse((response) => {
      const responseUrl = new URL(response.url());
      return response.request().method() === 'GET'
        && responseUrl.origin === expectedOrigin
        && responseUrl.pathname === '/client.js'
        && responseUrl.search === ''
        && responseUrl.hash === '';
    }, { timeout: OBSERVATION_TIMEOUT_MS });
    await page.goto(validated.url, {
      waitUntil: 'domcontentloaded',
      timeout: OBSERVATION_TIMEOUT_MS,
    });
    failureStage = 'browser-client-response-audit';
    const clientResponse = await clientResponsePromise;
    const clientResponseBytes = await clientResponse.body();
    try {
      if (clientResponse.status() !== 200
        || clientResponseBytes.byteLength !== validated.expectedClientByteLength
        || `sha256:${createHash('sha256').update(clientResponseBytes).digest('hex')}`
          !== validated.expectedClientSha256) {
        throw new Error('browser client response differs from the in-memory build audit');
      }
      clientJavaScriptResponseDigestVerified = true;
    } finally {
      clientResponseBytes.fill(0);
    }

    if (validated.mode === 'happy-path') {
      failureStage = 'happy-path-observation';
      await waitForState(page, ['interruption-ready', 'error', 'context-lost']);
      if (await bodyState(page) !== 'interruption-ready'
          || await renderedFrameCount(page) !== INTERRUPTION_BARRIER_RENDERED_FRAME_COUNT_V049) {
        throw new Error('private browser happy path missed the exact interruption barrier');
      }
      await assertCredentialFragmentCleared(page, expectedOrigin);
      await page.getByRole('button', { name: /Continue from audited frame 37 barrier/i }).click();
      await waitForState(page, ['ready', 'error', 'context-lost']);
      const state = await bodyState(page);
      if (state !== 'ready') throw new Error(`private browser finished in ${state}`);
      await assertCredentialFragmentCleared(page, expectedOrigin);
      const observable = assertPrivateBrowserTrajectoryObservationV049(
        await readBrowserObservationJson(page),
        validated.expectedPacketDigest,
      );
      await page.getByRole('button', { name: /Dispose GPU/i }).click();
      await waitForState(page, ['disposed', 'error']);
      if (await bodyState(page) !== 'disposed') {
        throw new Error('private browser happy-path disposal failed');
      }
      const lifecycle = await assertTerminalStateRemainsStable(
        page,
        validated.mode,
        'disposed',
      );
      result = createResult(
        validated,
        executableAudit,
        observable,
        lifecycle,
        clientJavaScriptResponseDigestVerified,
        101,
      );
    } else {
      failureStage = 'interruption-observation';
      await waitForState(page, ['interruption-ready', 'error', 'context-lost']);
      const barrierState = await bodyState(page);
      if (barrierState !== 'interruption-ready') {
        throw new Error(`private browser interruption missed audited exact barrier: ${barrierState}`);
      }
      await assertCredentialFragmentCleared(page, expectedOrigin);
      const renderedBeforeInterruption = await renderedFrameCount(page);
      if (renderedBeforeInterruption !== INTERRUPTION_BARRIER_RENDERED_FRAME_COUNT_V049) {
        throw new Error('private browser interruption frame count changed');
      }
      if (validated.mode === 'mid-playback-dispose') {
        await page.getByRole('button', { name: /Dispose GPU/i }).click();
        await waitForState(page, ['disposed', 'error']);
        if (await bodyState(page) !== 'disposed') {
          throw new Error('private browser mid-playback disposal failed');
        }
      } else {
        const lossTriggered = await page.evaluate(() => {
          const canvas = document.getElementById('atomistic-canvas');
          if (!(canvas instanceof HTMLCanvasElement)) return false;
          const gl = canvas.getContext('webgl2');
          const extension = gl?.getExtension('WEBGL_lose_context');
          if (!extension) return false;
          extension.loseContext();
          return true;
        });
        if (!lossTriggered) throw new Error('WEBGL_lose_context is unavailable');
        await waitForState(page, ['context-lost', 'error']);
        if (await bodyState(page) !== 'context-lost') {
          throw new Error('private browser context loss did not fail closed');
        }
        await page.evaluate(() => {
          const canvas = document.getElementById('atomistic-canvas');
          if (!(canvas instanceof HTMLCanvasElement)) return;
          canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.restoreContext();
        });
      }
      const terminalState = validated.mode === 'context-loss' ? 'context-lost' : 'disposed';
      const lifecycle = await assertTerminalStateRemainsStable(
        page,
        validated.mode,
        terminalState,
        renderedBeforeInterruption,
      );
      result = createResult(
        validated,
        executableAudit,
        null,
        lifecycle,
        clientJavaScriptResponseDigestVerified,
        renderedBeforeInterruption,
      );
    }

    if (consoleErrorCount !== 0 || pageErrorCount !== 0 || unexpectedRequestCount !== 0) {
      throw new Error('private browser emitted a console, page, or network boundary error');
    }
  } catch (error) {
    failure = error;
  }

  const cleanupFailures = [];
  await closeBounded('page', () => page?.close({ runBeforeUnload: false }), cleanupFailures);
  await closeBounded('context', () => context?.close(), cleanupFailures);
  await closeBounded('browser', () => browser?.close(), cleanupFailures);
  if (page !== null && !page.isClosed()) cleanupFailures.push(new Error('page remained open'));
  if (browser !== null && browser.isConnected()) {
    cleanupFailures.push(new Error('browser remained connected'));
  }
  if (failure !== null || cleanupFailures.length !== 0 || result === null) {
    const cleanupSuffix = cleanupFailures.length === 0 ? '' : '-cleanup';
    throw new Error(`private Chromium V049 observation rejected at ${failureStage}${cleanupSuffix}`);
  }
  return result;
}

function validateInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.getPrototypeOf(input) !== Object.prototype) {
    throw new TypeError('private Chromium observer input must be one plain record');
  }
  const descriptors = Object.getOwnPropertyDescriptors(input);
  const keys = Reflect.ownKeys(descriptors);
  if (keys.some((key) => typeof key !== 'string')
    || keys.length !== INPUT_KEYS.length
    || keys.sort().some((key, index) => key !== INPUT_KEYS[index])) {
    throw new TypeError('private Chromium observer input keys changed');
  }
  for (const key of keys) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !('value' in descriptor)) {
      throw new TypeError('private Chromium observer input must use enumerable data fields');
    }
  }
  const executablePath = descriptors.executablePath.value;
  const expectedClientByteLength = descriptors.expectedClientByteLength.value;
  const expectedClientSha256 = descriptors.expectedClientSha256.value;
  const expectedPacketDigest = descriptors.expectedPacketDigest.value;
  const mode = descriptors.mode.value;
  const url = descriptors.url.value;
  if (typeof executablePath !== 'string' || !path.isAbsolute(executablePath)
    || executablePath.includes('\0') || executablePath.length > 4_096) {
    throw new TypeError('private Chromium observer executable path is invalid');
  }
  if (typeof expectedPacketDigest !== 'string' || !DIGEST.test(expectedPacketDigest)) {
    throw new TypeError('private Chromium observer packet digest is invalid');
  }
  if (!Number.isSafeInteger(expectedClientByteLength)
    || expectedClientByteLength < 1
    || expectedClientByteLength > 2 * 1024 * 1024
    || typeof expectedClientSha256 !== 'string'
    || !DIGEST.test(expectedClientSha256)) {
    throw new TypeError('private Chromium observer client build identity is invalid');
  }
  if (typeof mode !== 'string' || !MODES.has(mode)) {
    throw new TypeError('private Chromium observer mode is invalid');
  }
  if (typeof url !== 'string' || url.length > 512) {
    throw new TypeError('private Chromium observer URL is invalid');
  }
  const parsed = new URL(url);
  if (parsed.protocol !== 'http:' || parsed.hostname !== '127.0.0.1'
    || !/^\d{1,5}$/.test(parsed.port) || Number(parsed.port) < 1 || Number(parsed.port) > 65_535
    || parsed.pathname !== '/' || parsed.search !== '' || !TOKEN.test(parsed.hash)
    || parsed.username !== '' || parsed.password !== '') {
    throw new TypeError('private Chromium observer requires one tokenized IPv4 loopback root URL');
  }
  return Object.freeze({
    executablePath,
    expectedClientByteLength,
    expectedClientSha256,
    expectedPacketDigest,
    mode,
    url,
  });
}

function assertNoPlaywrightDebugEnvironment() {
  const debug = process.env.DEBUG ?? '';
  const debugFile = process.env.DEBUG_FILE ?? '';
  const playwrightDebug = process.env.PWDEBUG ?? '';
  if (debug !== '' || debugFile !== ''
    || (playwrightDebug !== '' && playwrightDebug !== '0')) {
    throw new Error('Playwright debug logging is forbidden for private capability URLs');
  }
}

function assertChromiumSandboxHostPreconditions() {
  if (process.platform === 'linux'
    && typeof process.getuid === 'function'
    && process.getuid() === 0) {
    throw new Error('private Chromium must run as a non-root Linux user with its sandbox enabled');
  }
}

async function verifyPlaywrightRuntimeVersion() {
  const packagePath = require.resolve('playwright/package.json');
  const packageText = await readFile(packagePath, 'utf8');
  if (Buffer.byteLength(packageText, 'utf8') < 2
    || Buffer.byteLength(packageText, 'utf8') > 256 * 1024) {
    throw new Error('Playwright package metadata is outside its byte bound');
  }
  const packageMetadata = JSON.parse(packageText);
  if (!packageMetadata || Object.getPrototypeOf(packageMetadata) !== Object.prototype
    || packageMetadata.name !== 'playwright'
    || packageMetadata.version !== PRIVATE_CHROMIUM_LOCK_V049.playwrightVersion) {
    throw new Error('runtime Playwright package differs from the exact V049 lock');
  }
}

async function verifyLockedExecutableFile(executablePath) {
  const platformKey = `${process.platform}-${process.arch}`;
  const expected = PRIVATE_CHROMIUM_LOCK_V049.platforms[platformKey];
  if (!expected) throw new Error(`unsupported private Chromium platform ${platformKey}`);
  const canonicalPath = await realpath(executablePath);
  if (canonicalPath !== executablePath
    || !canonicalPath.endsWith(`/${expected.executableRelativePath}`)) {
    throw new Error('private Chromium executable path differs from the platform lock');
  }
  const before = await lstat(canonicalPath, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
    || before.size !== BigInt(expected.executableByteLength)) {
    throw new Error('private Chromium executable is not one exact bounded regular file');
  }
  const handle = await open(canonicalPath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  let digest;
  try {
    const opened = await handle.stat({ bigint: true });
    if (!sameIdentity(before, opened)) throw new Error('private Chromium executable changed before read');
    const hash = createHash('sha256');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let offset = 0;
    try {
      while (offset < Number(before.size)) {
        const length = Math.min(buffer.length, Number(before.size) - offset);
        const { bytesRead } = await handle.read(buffer, 0, length, offset);
        if (bytesRead === 0) throw new Error('private Chromium executable became shorter');
        hash.update(buffer.subarray(0, bytesRead));
        offset += bytesRead;
      }
      digest = `sha256:${hash.digest('hex')}`;
    } finally {
      buffer.fill(0);
    }
    const after = await handle.stat({ bigint: true });
    if (!sameIdentity(before, after)) throw new Error('private Chromium executable changed during read');
  } finally {
    await handle.close();
  }
  if (digest !== expected.executableSha256) {
    throw new Error('private Chromium executable digest differs from the platform lock');
  }
  return Object.freeze({
    platform: process.platform,
    architecture: process.arch,
    browserVersion: PRIVATE_CHROMIUM_LOCK_V049.browserVersion,
    playwrightVersion: PRIVATE_CHROMIUM_LOCK_V049.playwrightVersion,
    chromiumRevision: PRIVATE_CHROMIUM_LOCK_V049.chromiumRevision,
    executableByteLength: expected.executableByteLength,
    executableSha256: expected.executableSha256,
    playwrightPackageDeclaredVersionMatched: true,
    mainExecutableDigestVerified: true,
    immutableRuntimeSnapshotVerified: false,
    runtimeTreeDigestVerified: false,
    archiveDigestVerifiedByObserver: false,
  });
}

async function waitForState(page, states) {
  await page.waitForFunction(
    (allowed) => allowed.includes(document.body?.dataset.harnessState ?? ''),
    states,
    { timeout: OBSERVATION_TIMEOUT_MS },
  );
}

function bodyState(page) {
  return page.evaluate(() => document.body.dataset.harnessState ?? 'absent');
}

async function lifecycleState(page) {
  return page.evaluate(() => Object.freeze({
    state: document.body.dataset.harnessState ?? 'absent',
    cleanupComplete: document.body.dataset.cleanupComplete === 'true',
    browserOwnerRevoked: document.body.dataset.browserOwnerRevoked === 'true',
    runtimeDisposed: document.body.dataset.runtimeDisposed === 'true',
    threeDisposed: document.body.dataset.threeDisposed === 'true',
    rendererDisposed: document.body.dataset.rendererDisposed === 'true',
    contextRestoreRequiresNewCapability:
      document.body.dataset.contextRestoreRequiresNewCapability === 'true',
  }));
}

async function readBrowserObservationJson(page) {
  const text = await page.locator('#harness-evidence').textContent();
  if (typeof text !== 'string'
    || Buffer.byteLength(text, 'utf8') < 2
    || Buffer.byteLength(text, 'utf8') > 64 * 1024) {
    throw new Error('private browser observation text is outside its byte bound');
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('private browser observation text is not JSON');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('private browser observation is not one record');
  }
  return value;
}

function createResult(
  validated,
  executableAudit,
  browserObservation,
  lifecycle,
  clientJavaScriptResponseDigestVerified,
  renderedFrameCountValue,
) {
  return deepFreeze({
    schemaVersion: 'tf.private-browser-chromium-run-observation/0.4.9',
    status: validated.mode === 'happy-path'
      ? 'digest-locked-main-executable-private-trajectory-draw-observed'
      : 'digest-locked-main-executable-private-trajectory-interruption-failed-closed',
    mode: validated.mode,
    executableAudit,
    clientJavaScriptByteLength: validated.expectedClientByteLength,
    clientJavaScriptSha256: validated.expectedClientSha256,
    clientJavaScriptResponseDigestVerified,
    renderedFrameCount: renderedFrameCountValue,
    browserObservation,
    lifecycle,
    screenshotIncluded: false,
    videoIncluded: false,
    traceIncluded: false,
    harIncluded: false,
    browserProfileIncluded: false,
    packetBytesIncluded: false,
    coordinateBytesIncluded: false,
    performanceClaim: null,
    crossPlatformClaim: false,
    immutableChromiumRuntimeSnapshotVerified: false,
    chromiumRuntimeTreeDigestVerified: false,
    executionAuthenticityVerified: false,
    reproduced: false,
    protectedMainArtifact: false,
    attestedArtifact: false,
    sourceLicenseForPublicDistributionVerified: false,
    promotionEligible: false,
    publicDistributionEligible: false,
    cloudflareDistributionEligible: false,
  });
}

export function assertPrivateBrowserTrajectoryObservationV049(candidate, expectedPacketDigest) {
  if (typeof expectedPacketDigest !== 'string' || !DIGEST.test(expectedPacketDigest)) {
    throw new TypeError('expected private browser packet digest is invalid');
  }
  const value = snapshotExactPlainRecord(
    candidate,
    OBSERVATION_KEYS,
    'private browser trajectory observation',
  );
  for (const key of [
    'trajectoryMetadataDigest',
    'positionTrajectoryDigest',
    'orderedPositionFrameDigest',
  ]) assertDigest(value[key], `private browser trajectory observation ${key}`);
  if (value.schemaVersion !== 'tf.private-browser-webgl2-trajectory-observation/0.4.9'
    || value.status
      !== 'local-real-webgl2-101-frame-trajectory-draw-observed-execution-unattested'
    || value.sourceBoundary
      !== 'digest-bound-private-trajectory-packet-may-be-synthetic-test-fixture'
    || value.packetDigest !== expectedPacketDigest
    || value.frameCount !== 101
    || value.firstSourceFrameOrdinal !== 0
    || value.lastSourceFrameOrdinal !== 100
    || value.validatedFrameSliceCount !== 101
    || value.updateCount !== 101
    || value.uploadCount !== 101
    || value.renderCount !== 101
    || value.schedulerYieldCount !== 101
    || value.schedulerSemantics
      !== 'request-animation-frame-yield-only-not-physical-time-or-interpolation'
    || value.webgl2 !== true
    || value.packetDigestWebCryptoVerified !== true
    || value.aggregatePositionsDigestWebCryptoVerified !== true
    || value.allFrameSliceDigestsWebCryptoVerified !== true
    || value.browserGeometryValidatedFrameCount !== 101
    || value.allFramesRigidWaterGeometryVerified !== true
    || value.allFramesUniqueOxygenAnchorsVerified !== true
    || value.allFramesEightOctantCoverageVerified !== true
    || value.browserGeometryGateMeaning
      !== 'noncollapsed-rigid-water-presentation-sanity-not-equilibrium-density-or-execution-proof'
    || value.strictSourceFrameSequenceAdvanced !== true
    || value.sameSourceStateRepeated !== false
    || value.createsSolverFrames !== false
    || value.interpolationApplied !== false
    || value.motionSynthesizedByThisBrowserAdapter !== false
    || value.sourceMotionProvenance !== 'unverified-may-be-synthetic'
    || value.forceConsumed !== false
    || value.velocityConsumed !== false
    || value.fieldsRendered !== false
    || value.electronicDensityRendered !== false
    || value.completePhysicalStateIncluded !== false
    || value.nonphysicalDisplayScale !== true
    || value.drawCallsMinimum !== 3
    || value.drawCallsMaximum !== 3
    || value.trianglesMinimum !== 554_900
    || value.trianglesMaximum !== 554_900
    || value.glNoErrorForAllFrames !== true
    || value.persistentInstancedMeshCount !== 3
    || value.oxygenInstanceCount !== 895
    || value.hydrogenInstanceCount !== 1_790
    || value.topologyLinkInstanceCount !== 1_790
    || value.objectIdentityStable !== true
    || value.geometryIdentityStable !== true
    || value.materialIdentityStable !== true
    || value.instanceMatrixIdentityStable !== true
    || value.instanceMatrixArrayIdentityStable !== true
    || value.rendererGeometryAndTextureCountsStableAfterWarmup !== true
    || !exactArray(value.raycastFrameOrdinals, [0, 37, 100])
    || !exactArray(value.raycastAtomIndices, [0, 0, 0])
    || !isSafeIntegerInRange(
      value.finalFramePixelsDifferingFromLowerLeftReference,
      129,
      960 * 640,
    )
    || value.browserPositionsOwnerRevoked !== true
    || value.revokedFrameAccessRejected !== true
    || value.urlFragmentCredentialClearedBeforeRequest !== true
    || value.webglOrWebgpuDrawExecuted !== true
    || value.topologyLinksEnergetic !== false
    || value.performanceClaim !== null
    || value.executionAuthenticityVerified !== false
    || value.reproduced !== false
    || value.protectedMainArtifact !== false
    || value.attestedArtifact !== false
    || value.sourceLicenseForPublicDistributionVerified !== false
    || value.promotionEligible !== false
    || value.publicDistributionEligible !== false
    || value.cloudflareDistributionEligible !== false
    || value.securePhysicalErasureVerified !== false) {
    throw new Error('private browser trajectory observation failed its exact boundary');
  }
  return deepFreeze({
    ...value,
    raycastFrameOrdinals: [...value.raycastFrameOrdinals],
    raycastAtomIndices: [...value.raycastAtomIndices],
  });
}

export function assertPrivateBrowserTrajectoryLifecycleV049(mode, candidate) {
  if (typeof mode !== 'string' || !MODES.has(mode)) {
    throw new TypeError('private browser terminal lifecycle mode is invalid');
  }
  const lifecycle = snapshotExactPlainRecord(
    candidate,
    LIFECYCLE_KEYS,
    'private browser terminal lifecycle',
  );
  const contextLoss = mode === 'context-loss';
  if (lifecycle.state !== (contextLoss ? 'context-lost' : 'disposed')
    || lifecycle.cleanupComplete !== true
    || lifecycle.browserOwnerRevoked !== true
    || lifecycle.runtimeDisposed !== true
    || lifecycle.threeDisposed !== true
    || lifecycle.rendererDisposed !== true
    || lifecycle.contextRestoreRequiresNewCapability !== contextLoss) {
    throw new Error('private browser terminal lifecycle failed its exact boundary');
  }
  return deepFreeze({ ...lifecycle });
}

async function assertTerminalStateRemainsStable(
  page,
  mode,
  expectedState,
  priorRenderedCount = null,
) {
  assertPrivateBrowserTrajectoryLifecycleV049(mode, await lifecycleState(page));
  const firstCount = await renderedFrameCount(page);
  if (firstCount < 0
    || (priorRenderedCount === null && firstCount !== 101)
    || (priorRenderedCount !== null
      && priorRenderedCount !== INTERRUPTION_BARRIER_RENDERED_FRAME_COUNT_V049)
    || (priorRenderedCount !== null && firstCount !== priorRenderedCount)) {
    throw new Error('private browser terminal frame counter differs from its exact boundary');
  }
  await page.waitForTimeout(1_000);
  const secondCount = await renderedFrameCount(page);
  if (await bodyState(page) !== expectedState || secondCount !== firstCount) {
    throw new Error('private browser resumed drawing after terminal revocation');
  }
  return assertPrivateBrowserTrajectoryLifecycleV049(mode, await lifecycleState(page));
}

async function assertCredentialFragmentCleared(page, expectedOrigin) {
  if (page.url() !== `${expectedOrigin}/`) {
    throw new Error('private browser retained or changed its capability URL');
  }
}

async function renderedFrameCount(page) {
  return page.evaluate(() => {
    const value = Number(document.body.dataset.framesRendered ?? 'NaN');
    return Number.isSafeInteger(value) && value >= 0 && value <= 101 ? value : -1;
  });
}

async function closeBounded(label, action, failures) {
  let timer = null;
  try {
    await Promise.race([
      Promise.resolve().then(action),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} close timeout`)), CLOSE_TIMEOUT_MS);
      }),
    ]);
  } catch (error) {
    failures.push(error);
  } finally {
    if (timer !== null) clearTimeout(timer);
  }
}

function snapshotExactPlainRecord(candidate, expectedKeys, label) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)
    || Object.getPrototypeOf(candidate) !== Object.prototype) {
    throw new TypeError(`${label} must be one plain record`);
  }
  const descriptors = Object.getOwnPropertyDescriptors(candidate);
  const keys = Reflect.ownKeys(descriptors);
  const actual = keys.filter((key) => typeof key === 'string').sort();
  const expected = [...expectedKeys].sort();
  if (actual.length !== keys.length || actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])) {
    throw new TypeError(`${label} must contain exactly the locked keys`);
  }
  const snapshot = Object.create(null);
  for (const key of actual) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
      throw new TypeError(`${label}.${key} must be one enumerable defined data property`);
    }
    snapshot[key] = descriptor.value;
  }
  return snapshot;
}

function assertDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST.test(value)) {
    throw new Error(`${label} is invalid`);
  }
}

function exactArray(value, expected) {
  return Array.isArray(value)
    && Object.getPrototypeOf(value) === Array.prototype
    && value.length === expected.length
    && value.every((item, index) => Object.is(item, expected[index]));
}

function isSafeIntegerInRange(value, minimum, maximum) {
  return Number.isSafeInteger(value) && !Object.is(value, -0)
    && value >= minimum && value <= maximum;
}

function sameExecutableAudit(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.mode === right.mode
    && left.nlink === right.nlink && left.uid === right.uid && left.gid === right.gid
    && left.size === right.size && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}
