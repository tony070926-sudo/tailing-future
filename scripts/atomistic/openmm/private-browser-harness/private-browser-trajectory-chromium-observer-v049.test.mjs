import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  INTERRUPTION_BARRIER_RENDERED_FRAME_COUNT_V049,
  assertPrivateBrowserTrajectoryLifecycleV049,
  assertPrivateBrowserTrajectoryObservationV049,
} from './private-browser-trajectory-chromium-observer-v049.mjs';

const PACKET_DIGEST = digest('1');
const OBSERVER_SOURCE = readFileSync(fileURLToPath(new URL(
  './private-browser-trajectory-chromium-observer-v049.mjs',
  import.meta.url,
)), 'utf8');

describe('V049 private Chromium observation contract', () => {
  it('locks interruption to the exact 37-frame client barrier', () => {
    expect(INTERRUPTION_BARRIER_RENDERED_FRAME_COUNT_V049).toBe(37);
    expect(OBSERVER_SOURCE).toContain("await waitForState(page, ['interruption-ready'");
    expect(OBSERVER_SOURCE).toContain(
      'renderedBeforeInterruption !== INTERRUPTION_BARRIER_RENDERED_FRAME_COUNT_V049',
    );
    expect(OBSERVER_SOURCE).toContain('firstCount !== priorRenderedCount');
  });

  it('requires the Chromium sandbox and forbids an explicit no-sandbox downgrade', () => {
    expect(OBSERVER_SOURCE).toMatch(/chromiumSandbox:\s*true/);
    expect(OBSERVER_SOURCE).toContain('process.getuid() === 0');
    expect(OBSERVER_SOURCE).not.toContain("'--no-sandbox'");
    expect(OBSERVER_SOURCE).not.toContain("'--disable-setuid-sandbox'");
  });

  it('reconstructs and deeply freezes exactly one aggregate browser observation', () => {
    const result = assertPrivateBrowserTrajectoryObservationV049(
      validObservation(),
      PACKET_DIGEST,
    );
    expect(result).toMatchObject({
      schemaVersion: 'tf.private-browser-webgl2-trajectory-observation/0.4.9',
      frameCount: 101,
      renderCount: 101,
      webgl2: true,
      browserPositionsOwnerRevoked: true,
      executionAuthenticityVerified: false,
      reproduced: false,
      publicDistributionEligible: false,
      cloudflareDistributionEligible: false,
    });
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.raycastFrameOrdinals)).toBe(true);
    expect(Object.isFrozen(result.raycastAtomIndices)).toBe(true);
  });

  it.each([
    ['token', '#token=' + 'a'.repeat(64)],
    ['url', 'http://127.0.0.1:31337/'],
    ['artifactPath', '/private/producer/positions.f64le'],
    ['coordinates', [0.1, 0.2, 0.3]],
    ['packetBytes', [84, 70, 80]],
  ])('rejects an extra sensitive %s field instead of forwarding it', (key, value) => {
    expect(() => assertPrivateBrowserTrajectoryObservationV049(
      { ...validObservation(), [key]: value },
      PACKET_DIGEST,
    )).toThrow(/exactly the locked keys/);
  });

  it.each([
    'createsSolverFrames',
    'interpolationApplied',
    'motionSynthesizedByThisBrowserAdapter',
    'forceConsumed',
    'velocityConsumed',
    'fieldsRendered',
    'electronicDensityRendered',
    'completePhysicalStateIncluded',
    'topologyLinksEnergetic',
    'executionAuthenticityVerified',
    'reproduced',
    'protectedMainArtifact',
    'attestedArtifact',
    'sourceLicenseForPublicDistributionVerified',
    'promotionEligible',
    'publicDistributionEligible',
    'cloudflareDistributionEligible',
    'securePhysicalErasureVerified',
  ])('rejects claim escalation through %s', (key) => {
    expect(() => assertPrivateBrowserTrajectoryObservationV049(
      { ...validObservation(), [key]: true },
      PACKET_DIGEST,
    )).toThrow(/exact boundary/);
  });

  it.each([
    ['webgl2', false],
    ['packetDigestWebCryptoVerified', false],
    ['aggregatePositionsDigestWebCryptoVerified', false],
    ['allFrameSliceDigestsWebCryptoVerified', false],
    ['allFramesRigidWaterGeometryVerified', false],
    ['allFramesUniqueOxygenAnchorsVerified', false],
    ['allFramesEightOctantCoverageVerified', false],
    ['browserGeometryValidatedFrameCount', 100],
    ['glNoErrorForAllFrames', false],
    ['objectIdentityStable', false],
    ['geometryIdentityStable', false],
    ['materialIdentityStable', false],
    ['instanceMatrixIdentityStable', false],
    ['instanceMatrixArrayIdentityStable', false],
    ['rendererGeometryAndTextureCountsStableAfterWarmup', false],
    ['webglOrWebgpuDrawExecuted', false],
    ['nonphysicalDisplayScale', false],
    ['revokedFrameAccessRejected', false],
    ['urlFragmentCredentialClearedBeforeRequest', false],
    ['sourceMotionProvenance', 'verified-openmm'],
    ['drawCallsMinimum', 1],
    ['drawCallsMaximum', 8],
    ['trianglesMinimum', 1],
    ['trianglesMaximum', Number.MAX_SAFE_INTEGER],
    ['finalFramePixelsDifferingFromLowerLeftReference', 128],
    ['raycastFrameOrdinals', [0, 38, 100]],
    ['raycastFrameOrdinals', [-0, 37, 100]],
    ['raycastAtomIndices', [0, 0, 1]],
    ['renderCount', 100],
  ])('rejects missing draw or integrity evidence in %s', (key, value) => {
    expect(() => assertPrivateBrowserTrajectoryObservationV049(
      { ...validObservation(), [key]: value },
      PACKET_DIGEST,
    )).toThrow(/exact boundary/);
  });

  it('rejects accessors, foreign prototypes, symbols, and missing keys', () => {
    const accessor = validObservation();
    Object.defineProperty(accessor, 'frameCount', { enumerable: true, get: () => 101 });
    const foreign = Object.assign(Object.create(null), validObservation());
    const symbol = validObservation();
    symbol[Symbol('secret')] = 'value';
    const missing = validObservation();
    Reflect.deleteProperty(missing, 'frameCount');
    for (const candidate of [accessor, foreign, symbol, missing]) {
      expect(() => assertPrivateBrowserTrajectoryObservationV049(candidate, PACKET_DIGEST))
        .toThrow();
    }
  });
});

describe('V049 private Chromium terminal lifecycle contract', () => {
  it.each([
    ['happy-path', 'disposed', false],
    ['mid-playback-dispose', 'disposed', false],
    ['context-loss', 'context-lost', true],
  ])('accepts exact cleanup for %s', (mode, state, restoreRequired) => {
    const result = assertPrivateBrowserTrajectoryLifecycleV049(mode, {
      state,
      cleanupComplete: true,
      browserOwnerRevoked: true,
      runtimeDisposed: true,
      threeDisposed: true,
      rendererDisposed: true,
      contextRestoreRequiresNewCapability: restoreRequired,
    });
    expect(result).toMatchObject({ state, contextRestoreRequiresNewCapability: restoreRequired });
    expect(Object.isFrozen(result)).toBe(true);
  });

  it.each([
    'cleanupComplete',
    'browserOwnerRevoked',
    'runtimeDisposed',
    'threeDisposed',
    'rendererDisposed',
  ])('rejects happy-path cleanup when %s is false', (key) => {
    expect(() => assertPrivateBrowserTrajectoryLifecycleV049('happy-path', {
      state: 'disposed',
      cleanupComplete: true,
      browserOwnerRevoked: true,
      runtimeDisposed: true,
      threeDisposed: true,
      rendererDisposed: true,
      contextRestoreRequiresNewCapability: false,
      [key]: false,
    })).toThrow(/exact boundary/);
  });

  it('rejects context restoration without a new capability and any extra field', () => {
    const base = {
      state: 'context-lost',
      cleanupComplete: true,
      browserOwnerRevoked: true,
      runtimeDisposed: true,
      threeDisposed: true,
      rendererDisposed: true,
      contextRestoreRequiresNewCapability: true,
    };
    expect(() => assertPrivateBrowserTrajectoryLifecycleV049('context-loss', {
      ...base,
      contextRestoreRequiresNewCapability: false,
    })).toThrow(/exact boundary/);
    expect(() => assertPrivateBrowserTrajectoryLifecycleV049('context-loss', {
      ...base,
      token: 'secret',
    })).toThrow(/exactly the locked keys/);
  });
});

function validObservation() {
  return {
    schemaVersion: 'tf.private-browser-webgl2-trajectory-observation/0.4.9',
    status: 'local-real-webgl2-101-frame-trajectory-draw-observed-execution-unattested',
    sourceBoundary: 'digest-bound-private-trajectory-packet-may-be-synthetic-test-fixture',
    packetDigest: PACKET_DIGEST,
    trajectoryMetadataDigest: digest('2'),
    positionTrajectoryDigest: digest('3'),
    orderedPositionFrameDigest: digest('4'),
    frameCount: 101,
    firstSourceFrameOrdinal: 0,
    lastSourceFrameOrdinal: 100,
    webgl2: true,
    packetDigestWebCryptoVerified: true,
    aggregatePositionsDigestWebCryptoVerified: true,
    allFrameSliceDigestsWebCryptoVerified: true,
    browserGeometryValidatedFrameCount: 101,
    allFramesRigidWaterGeometryVerified: true,
    allFramesUniqueOxygenAnchorsVerified: true,
    allFramesEightOctantCoverageVerified: true,
    browserGeometryGateMeaning:
      'noncollapsed-rigid-water-presentation-sanity-not-equilibrium-density-or-execution-proof',
    validatedFrameSliceCount: 101,
    updateCount: 101,
    uploadCount: 101,
    renderCount: 101,
    schedulerYieldCount: 101,
    schedulerSemantics: 'request-animation-frame-yield-only-not-physical-time-or-interpolation',
    strictSourceFrameSequenceAdvanced: true,
    sameSourceStateRepeated: false,
    createsSolverFrames: false,
    interpolationApplied: false,
    motionSynthesizedByThisBrowserAdapter: false,
    sourceMotionProvenance: 'unverified-may-be-synthetic',
    forceConsumed: false,
    velocityConsumed: false,
    fieldsRendered: false,
    electronicDensityRendered: false,
    completePhysicalStateIncluded: false,
    nonphysicalDisplayScale: true,
    drawCallsMinimum: 3,
    drawCallsMaximum: 3,
    trianglesMinimum: 554_900,
    trianglesMaximum: 554_900,
    glNoErrorForAllFrames: true,
    persistentInstancedMeshCount: 3,
    oxygenInstanceCount: 895,
    hydrogenInstanceCount: 1_790,
    topologyLinkInstanceCount: 1_790,
    objectIdentityStable: true,
    geometryIdentityStable: true,
    materialIdentityStable: true,
    instanceMatrixIdentityStable: true,
    instanceMatrixArrayIdentityStable: true,
    rendererGeometryAndTextureCountsStableAfterWarmup: true,
    raycastFrameOrdinals: [0, 37, 100],
    raycastAtomIndices: [0, 0, 0],
    finalFramePixelsDifferingFromLowerLeftReference: 12_345,
    browserPositionsOwnerRevoked: true,
    revokedFrameAccessRejected: true,
    urlFragmentCredentialClearedBeforeRequest: true,
    webglOrWebgpuDrawExecuted: true,
    topologyLinksEnergetic: false,
    performanceClaim: null,
    executionAuthenticityVerified: false,
    reproduced: false,
    protectedMainArtifact: false,
    attestedArtifact: false,
    sourceLicenseForPublicDistributionVerified: false,
    promotionEligible: false,
    publicDistributionEligible: false,
    cloudflareDistributionEligible: false,
    securePhysicalErasureVerified: false,
  };
}

function digest(character) {
  return `sha256:${character.repeat(64)}`;
}
