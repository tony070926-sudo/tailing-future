import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  PROTECTED_BROWSER_MODE_RECEIPT_SCHEMA_V049,
  assertProtectedPrivateBrowserModeReceiptV049,
  parseProtectedPrivateBrowserModeArgumentsV049,
} from './run-protected-private-browser-mode-v049.server.mjs';
import {
  canonicalJsonBytes,
  sha256,
} from '../../runtime-input-contract.mjs';
import { PRIVATE_CHROMIUM_LOCK_V049 } from './chromium-v049-lock.mjs';

const SOURCE_PATH = fileURLToPath(new URL(
  './run-protected-private-browser-mode-v049.server.mjs',
  import.meta.url,
));
const SOURCE = readFileSync(SOURCE_PATH, 'utf8');
const REVISION = 'a'.repeat(40);
const temporaryRoots = [];

afterEach(() => {
  for (const root of temporaryRoots.splice(0).reverse()) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe('V049 protected private browser mode receipt', () => {
  it.each([
    ['happy-path', 'disposed', true, 101, 101],
    ['mid-playback-dispose', 'disposed', false, null, 37],
    ['context-loss', 'context-lost', false, null, 37],
  ])('accepts one exact %s receipt', (
    mode, terminalState, trajectoryCompleted, frameCount, renderedFrameCount,
  ) => {
    const receipt = makeReceipt(mode);
    expect(assertProtectedPrivateBrowserModeReceiptV049(receipt)).toEqual(receipt);
    expect(receipt.observation).toMatchObject({
      terminalState, browserDrawObserved: true, trajectoryCompleted, frameCount,
      renderedFrameCount,
    });
    expect(Object.isFrozen(assertProtectedPrivateBrowserModeReceiptV049(receipt))).toBe(true);
  });

  it('rejects a refreshed digest over promotional, authenticated, or reproduced claims', () => {
    for (const key of [
      'executionAuthenticated',
      'reproduced',
      'promotionEligible',
      'publicDistributionEligible',
      'cloudflareDistributionEligible',
      'sourceLicenseForPublicDistributionVerified',
    ]) {
      const receipt = structuredClone(makeReceipt('happy-path'));
      receipt.claims[key] = true;
      refreshDigest(receipt);
      expect(() => assertProtectedPrivateBrowserModeReceiptV049(receipt)).toThrow(
        /exact boundary/,
      );
    }
  });

  it('rejects stale self-digests, extra fields, accessors, and wrong mode semantics', () => {
    const stale = structuredClone(makeReceipt('happy-path'));
    stale.client.byteLength += 1;
    expect(() => assertProtectedPrivateBrowserModeReceiptV049(stale)).toThrow(/self digest/);

    const extra = structuredClone(makeReceipt('happy-path'));
    extra.url = 'http://127.0.0.1:1234/#token=secret';
    refreshDigest(extra);
    expect(() => assertProtectedPrivateBrowserModeReceiptV049(extra)).toThrow(/keys/);

    const accessor = structuredClone(makeReceipt('happy-path'));
    Object.defineProperty(accessor, 'mode', { enumerable: true, get: () => 'happy-path' });
    expect(() => assertProtectedPrivateBrowserModeReceiptV049(accessor)).toThrow(/properties/);

    const wrongMode = structuredClone(makeReceipt('mid-playback-dispose'));
    wrongMode.observation.frameCount = 101;
    refreshDigest(wrongMode);
    expect(() => assertProtectedPrivateBrowserModeReceiptV049(wrongMode)).toThrow(/exact boundary/);

    const wrongBarrier = structuredClone(makeReceipt('context-loss'));
    wrongBarrier.observation.renderedFrameCount = 0;
    refreshDigest(wrongBarrier);
    expect(() => assertProtectedPrivateBrowserModeReceiptV049(wrongBarrier))
      .toThrow(/exact boundary/);

    const falseDraw = structuredClone(makeReceipt('mid-playback-dispose'));
    falseDraw.observation.browserDrawObserved = false;
    refreshDigest(falseDraw);
    expect(() => assertProtectedPrivateBrowserModeReceiptV049(falseDraw))
      .toThrow(/exact boundary/);

    const falseCompletion = structuredClone(makeReceipt('happy-path'));
    falseCompletion.observation.trajectoryCompleted = false;
    refreshDigest(falseCompletion);
    expect(() => assertProtectedPrivateBrowserModeReceiptV049(falseCompletion))
      .toThrow(/exact boundary/);

    const interruptedCompletion = structuredClone(makeReceipt('context-loss'));
    interruptedCompletion.observation.trajectoryCompleted = true;
    refreshDigest(interruptedCompletion);
    expect(() => assertProtectedPrivateBrowserModeReceiptV049(interruptedCompletion))
      .toThrow(/exact boundary/);
  });

  it('keeps PID/cgroup, host closure, and immutable-runtime claims conservative', () => {
    const receipt = makeReceipt('happy-path');
    expect(receipt.isolation).toMatchObject({
      pidNamespaceKillBoundaryVerified: false,
      cgroupDrainVerified: false,
    });
    expect(receipt.browserRuntime).toMatchObject({
      hostRuntimeClosureVerified: false,
      immutableRuntimeSnapshotVerified: false,
    });
  });

  it('binds the locked package/runtime trees and equal pre/post checkpoints', () => {
    for (const [key, value] of [
      ['playwrightPackageTreeDigest', digest('0')],
      ['playwrightCorePackageTreeDigest', digest('0')],
      ['distributionTreeDigest', digest('0')],
      ['frozenRuntimeTreeDigest', digest('0')],
      ['packagePreflightAfterDigest', digest('0')],
      ['runtimePreflightAfterDigest', digest('0')],
    ]) {
      const receipt = structuredClone(makeReceipt('happy-path'));
      receipt.browserRuntime[key] = value;
      refreshDigest(receipt);
      expect(() => assertProtectedPrivateBrowserModeReceiptV049(receipt)).toThrow(
        /exact boundary/,
      );
    }
  });
});

describe('V049 protected mode production entry', () => {
  it('accepts exactly six flags and never accepts an executable or authenticity input', () => {
    const paths = makeInputPaths();
    const parsed = parseProtectedPrivateBrowserModeArgumentsV049([
      '--artifact-root', paths.artifactRoot,
      '--control-receipt', paths.controlReceipt,
      '--source-revision', REVISION,
      '--session-id', 'protected-openmm-v049-session',
      '--runtime-root', paths.runtimeRoot,
      '--mode', 'happy-path',
    ]);
    expect(parsed).toEqual({
      artifactRoot: paths.artifactRoot,
      controlReceipt: paths.controlReceipt,
      sourceRevision: REVISION,
      sessionId: 'protected-openmm-v049-session',
      runtimeRoot: paths.runtimeRoot,
      mode: 'happy-path',
    });
    for (const injected of ['--executable-path', '--execution-authenticated', '--test-lock']) {
      expect(() => parseProtectedPrivateBrowserModeArgumentsV049([
        '--artifact-root', paths.artifactRoot,
        '--control-receipt', paths.controlReceipt,
        '--source-revision', REVISION,
        '--session-id', 'protected-openmm-v049-session',
        '--runtime-root', paths.runtimeRoot,
        injected, 'true',
      ])).toThrow();
    }
  });

  it('rejects duplicate, missing, noncanonical, and unsupported mode inputs', () => {
    const paths = makeInputPaths();
    expect(() => parseProtectedPrivateBrowserModeArgumentsV049([])).toThrow(/six/);
    expect(() => parseProtectedPrivateBrowserModeArgumentsV049([
      '--artifact-root', paths.artifactRoot,
      '--artifact-root', paths.artifactRoot,
      '--source-revision', REVISION,
      '--session-id', 'session',
      '--runtime-root', paths.runtimeRoot,
      '--mode', 'happy-path',
    ])).toThrow(/invalid flag/);
    expect(() => parseProtectedPrivateBrowserModeArgumentsV049([
      '--artifact-root', `${paths.artifactRoot}/../${path.basename(paths.artifactRoot)}`,
      '--control-receipt', paths.controlReceipt,
      '--source-revision', REVISION,
      '--session-id', 'session',
      '--runtime-root', paths.runtimeRoot,
      '--mode', 'invented-mode',
    ])).toThrow();
    expect(() => parseProtectedPrivateBrowserModeArgumentsV049([
      '--artifact-root', paths.artifactRoot,
      '--control-receipt', paths.controlReceipt,
      '--source-revision', REVISION,
      '--session-id', 'path/like-session',
      '--runtime-root', paths.runtimeRoot,
      '--mode', 'happy-path',
    ])).toThrow(/revision, session, or mode/);
  });

  it('runs both preflights before dynamically importing the Playwright observer', () => {
    const packageCall = SOURCE.indexOf(
      'packageBefore = preflightPrivatePlaywrightPackagesV049();',
    );
    const runtimeCall = SOURCE.indexOf(
      'runtimeBefore = preflightPrivateChromiumRuntimeV049',
    );
    const observerImport = SOURCE.indexOf(
      "const observerModule = await import(\n      './private-browser-trajectory-chromium-observer-v049.mjs'",
    );
    expect(packageCall).toBeGreaterThan(0);
    expect(runtimeCall).toBeGreaterThan(packageCall);
    expect(observerImport).toBeGreaterThan(runtimeCall);
    expect(SOURCE).not.toMatch(/^import .*private-browser-trajectory-chromium-observer/mu);
  });

  it('independently recomputes and binds the browser position projection', () => {
    expect(SOURCE).toContain(
      'createAtomisticPrivateBrowserPositionTrajectoryMetadataV049(metadata)',
    );
    expect(SOURCE).toContain(
      'audit.privateTrajectoryMetadataDigest !== lineage.browserMetadata.metadataDigest',
    );
    expect(SOURCE).toContain(
      'lineage.browserMetadata.sequence.orderedPositionFrameDigest',
    );
    expect(SOURCE).toContain(
      'browserMetadata?.binding?.sourceTrajectoryMetadataDigest !== metadata.metadataDigest',
    );
  });

  it('locks the Node version and exact clean PATH at the process boundary', () => {
    expect(SOURCE).toContain("process.version !== 'v24.16.0'");
    expect(SOURCE).toContain(
      '`${path.dirname(realpathSync(process.execPath))}:/usr/bin:/bin`',
    );
    expect(SOURCE).toContain('environment.PATH !== expectedPath');
    expect(SOURCE).toContain("readFileSync('/proc/self/attr/current', 'utf8')");
    expect(SOURCE).toContain("['CapInh', 'CapPrm', 'CapEff', 'CapBnd', 'CapAmb']");
    expect(SOURCE).toContain('`${runtimeIdentity.appArmorProfile} (unconfined)`');
    expect(SOURCE).toContain(
      'environment.TAILING_BROWSER_APPARMOR_PROFILE !== runtimeIdentity.appArmorProfile',
    );
  });

  it('derives the only browser executable from the locked runtime root', () => {
    expect(SOURCE).toContain(
      "executablePath: path.join(input.runtimeRoot, 'chrome-linux64', 'chrome')",
    );
    expect(SOURCE).not.toContain("['--executable-path'");
    expect(SOURCE).not.toContain('TF_PRIVATE_CHROMIUM_EXECUTABLE');
  });

  it('requires repository code, scientific source, control receipt, and runtime mounts read-only', () => {
    expect(SOURCE).toContain('exactReadOnlyMount(mounts, REPOSITORY_ROOT, true)');
    expect(SOURCE).toContain('exactReadOnlyMount(mounts, input.artifactRoot, true)');
    expect(SOURCE).toContain('exactReadOnlyMount(mounts, input.controlReceipt, true)');
    expect(SOURCE).toContain('exactReadOnlyMount(mounts, input.runtimeRoot, false)');
    expect(SOURCE).toContain(
      'exactReadOnlyMount(mounts, runtimeIdentity.nodeRuntimeRoot, false)',
    );
    expect(SOURCE).toContain(
      'exactReadOnlyMount(mounts, runtimeIdentity.rolldownRuntimeRoot, true)',
    );
    expect(SOURCE).toContain('exactReadOnlyMount(mounts, ROLLDOWN_BINDING_PATH, false)');
  });

  it('accepts only the exact root-frozen Rolldown binding exec carve-out', () => {
    expect(SOURCE).toContain('ROLLDOWN_BINDING_SIZE = 19_324_672');
    expect(SOURCE).toContain(
      'sha256:ae16856655924ebc41f231393c7f8b89566430a845d1f073fd9d6abf219db04b',
    );
    expect(SOURCE).toContain('rolldownMetadata.nlink !== 1');
    expect(SOURCE).toContain('(rolldownMetadata.mode & 0o777) !== 0o444');
  });

  it('emits only canonical receipt bytes and a fixed failure message', () => {
    expect(SOURCE).toContain('process.stdout.write(canonicalJsonBytes(receipt));');
    expect(SOURCE).toContain("process.stderr.write('protected private browser mode failed\\n');");
    expect(SOURCE).not.toContain('process.stdout.write(`TF_PRIVATE_MANUAL_URL=');
  });
});

function makeReceipt(mode) {
  const interrupted = mode !== 'happy-path';
  const preimage = {
    schemaVersion: PROTECTED_BROWSER_MODE_RECEIPT_SCHEMA_V049,
    profile: 'protected-main-private-openmm-browser-mode-receipt',
    statusDomain:
      'same-job-real-source-browser-observation-not-attestation-reproduction-or-release',
    sourceRevision: REVISION,
    mode,
    controlReceipt: {
      receiptDigest: digest('1'),
      systemDigest: digest('2'),
      planDigest: digest('3'),
      producerOutcomeDigest: digest('4'),
      artifactManifestDigest: digest('5'),
      payloadBundleRoot: digest('6'),
      verifierDigest: digest('7'),
      status: 'verified-pass',
      allPassed: true,
      scientificPass: true,
    },
    source: {
      referenceARunReceiptDigest: digest('8'),
      referenceARunArtifactDigest: digest('9'),
      worldSessionDigest: digest('f'),
      trajectoryDigest: digest('a'),
      orderedFrameDigest: digest('b'),
      atomOrderDigest: digest('c'),
      cellDigest: digest('d'),
      topologyDigest: digest('e'),
      privateTrajectoryMetadataDigest: digest('1'),
      browserTrajectoryMetadataDigest: digest('2'),
      positionsF32TrajectoryDigest: digest('3'),
      orderedPositionFrameDigest: digest('4'),
      browserPacketDigest: digest('5'),
      frameCount: 101,
      positionsOnly: true,
    },
    browserRuntime: {
      playwrightVersion: PRIVATE_CHROMIUM_LOCK_V049.playwrightVersion,
      browserVersion: PRIVATE_CHROMIUM_LOCK_V049.browserVersion,
      chromiumRevision: PRIVATE_CHROMIUM_LOCK_V049.chromiumRevision,
      playwrightPackageTreeDigest:
        PRIVATE_CHROMIUM_LOCK_V049.npmPackageLockBindings.playwright.ownPackageTree.digest,
      playwrightCorePackageTreeDigest:
        PRIVATE_CHROMIUM_LOCK_V049.npmPackageLockBindings.playwrightCore.ownPackageTree.digest,
      distributionTreeDigest:
        PRIVATE_CHROMIUM_LOCK_V049.platforms['linux-x64'].runtimeTree.digest,
      frozenRuntimeTreeDigest:
        PRIVATE_CHROMIUM_LOCK_V049.platforms['linux-x64'].frozenRuntimeTree.digest,
      packagePreflightBeforeDigest: digest('4'),
      packagePreflightAfterDigest: digest('4'),
      packagePrePostMatched: true,
      runtimePreflightBeforeDigest: digest('5'),
      runtimePreflightAfterDigest: digest('5'),
      runtimePrePostMatched: true,
      hostRuntimeClosureVerified: false,
      immutableRuntimeSnapshotVerified: false,
    },
    isolation: {
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
    },
    client: {
      byteLength: 4096,
      sha256: digest('6'),
      responseDigestVerified: true,
    },
    observation: {
      mode,
      status: interrupted
        ? 'digest-locked-main-executable-private-trajectory-interruption-failed-closed'
        : 'digest-locked-main-executable-private-trajectory-draw-observed',
      observationDigest: digest(mode === 'happy-path' ? '7'
        : mode === 'mid-playback-dispose' ? '8' : '9'),
      terminalState: mode === 'context-loss' ? 'context-lost' : 'disposed',
      cleanupComplete: true,
      sourceOwnerRevoked: true,
      runtimeDisposed: true,
      threeDisposed: true,
      rendererDisposed: true,
      clientResponseDigestVerified: true,
      browserDrawObserved: true,
      trajectoryCompleted: !interrupted,
      frameCount: interrupted ? null : 101,
      renderedFrameCount: interrupted ? 37 : 101,
    },
    cleanup: {
      listenerClosed: true,
      packetZeroized: true,
      tokenSourceBytesZeroized: true,
      tokenVerifierBytesZeroized: true,
      assetBytesZeroized: true,
      securePhysicalErasureVerified: false,
    },
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
  return { ...preimage, receiptDigest: sha256(canonicalJsonBytes(preimage)) };
}

function refreshDigest(receipt) {
  const preimage = { ...receipt };
  delete preimage.receiptDigest;
  receipt.receiptDigest = sha256(canonicalJsonBytes(preimage));
}

function digest(character) {
  return `sha256:${character.repeat(64)}`;
}

function makeInputPaths() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'tf-v049-mode-cli-')));
  temporaryRoots.push(root);
  const artifactRoot = path.join(root, 'artifact');
  const runtimeRoot = path.join(root, 'runtime');
  mkdirSync(artifactRoot);
  mkdirSync(runtimeRoot);
  const controlReceipt = path.join(root, 'control-receipt.json');
  writeFileSync(controlReceipt, '{}\n', { flag: 'wx' });
  return { artifactRoot, runtimeRoot, controlReceipt };
}
