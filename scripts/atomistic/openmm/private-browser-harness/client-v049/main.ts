import {
  AmbientLight,
  Color,
  DirectionalLight,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector3,
  WebGLRenderer,
} from 'three';
import {
  AtomisticPrivateBrowserTrajectoryInstancingRuntimeV049,
  createAtomisticPrivateBrowserTrajectoryInstancingPlanV049,
} from '../../../../../lib/molecular/atomistic-private-browser-trajectory-instancing-runtime-v049.ts';
import {
  AtomisticThreeInstancedRuntimeV046,
} from '../../../../../lib/molecular/atomistic-three-instanced-runtime-v046.ts';
import {
  assertAtomisticPrivateBrowserPositionTrajectoryMetadataV049,
  createAtomisticPrivateBrowserPositionTrajectoryControllerV049,
  type AtomisticPrivateBrowserPositionTrajectoryControllerV049,
} from '../../../../../lib/simulation/atomistic-private-browser-position-trajectory-v049.ts';
import {
  decodePrivatePositionTrajectoryPacketV049,
} from '../private-position-trajectory-envelope-v049.mjs';

const FRAME_COUNT = 101;
const INTERRUPTION_BARRIER_RENDERED_FRAME_COUNT = 37;
const FRAME_BYTE_LENGTH = 32_220;
const PACKET_MINIMUM_BYTES = 3_254_270;
const PACKET_MAXIMUM_BYTES = 3_319_804;
const DRAW_CALL_COUNT = 3;
const OH_DISTANCE_NANOMETER = 0.09572;
const HH_DISTANCE_NANOMETER = 0.15139006545247014;
const RIGID_WATER_RELATIVE_RESIDUAL_LIMIT = 1e-5;
const CELL_LENGTH_NANOMETER = 3;
const TARGET_RAYCAST_FRAMES = new Set([0, 37, 100]);
const DIGEST = /^sha256:(?!0{64}$)[0-9a-f]{64}$/;

const body = document.body;
const canvas = requiredElement<HTMLCanvasElement>('atomistic-canvas');
const statusNode = requiredElement<HTMLDivElement>('harness-status');
const evidenceNode = requiredElement<HTMLPreElement>('harness-evidence');
const continueButton = requiredElement<HTMLButtonElement>('continue-harness');
const disposeButton = requiredElement<HTMLButtonElement>('dispose-harness');
const abortController = new AbortController();

let generation = 1;
let cleanupRan = false;
let terminalReason: 'disposed' | 'context-lost' | 'error' | null = null;
let browserController: AtomisticPrivateBrowserPositionTrajectoryControllerV049 | null = null;
let coreRuntime: AtomisticPrivateBrowserTrajectoryInstancingRuntimeV049 | null = null;
let threeRuntime: AtomisticThreeInstancedRuntimeV046 | null = null;
let renderer: WebGLRenderer | null = null;
let scene: Scene | null = null;

Object.assign(body.dataset, {
  harnessState: 'booting',
  cleanupComplete: 'false',
  browserOwnerRevoked: 'false',
  runtimeDisposed: 'false',
  threeDisposed: 'false',
  rendererDisposed: 'false',
  contextRestoreRequiresNewCapability: 'false',
  webgl2: 'false',
  frameCount: String(FRAME_COUNT),
  framesRendered: '0',
  lastFrameOrdinal: '-1',
  interruptionBarrierFrameCount: String(INTERRUPTION_BARRIER_RENDERED_FRAME_COUNT),
  interruptionBarrierReached: 'false',
  packetDigestVerified: 'false',
  aggregateDigestVerified: 'false',
  allFrameDigestsVerified: 'false',
  executionAuthenticityVerified: 'false',
  reproduced: 'false',
  publicDistributionEligible: 'false',
  cloudflareDistributionEligible: 'false',
  performanceClaim: 'none',
});

disposeButton.addEventListener('click', () => terminate('disposed'), { once: true });
window.addEventListener('pagehide', () => terminate('disposed'), { once: true });
canvas.addEventListener('webglcontextlost', (event) => {
  event.preventDefault();
  if (cleanupRan) return;
  body.dataset.contextRestoreRequiresNewCapability = 'true';
  terminate('context-lost');
});
canvas.addEventListener('webglcontextrestored', () => {
  if (terminalReason === 'context-lost') {
    body.dataset.contextRestoreRequiresNewCapability = 'true';
    body.dataset.harnessState = 'context-lost';
  }
});

void boot(generation).catch(() => {
  if (body.dataset.harnessState === 'disposed'
    || body.dataset.harnessState === 'context-lost') return;
  terminate('error');
  body.dataset.harnessState = 'error';
  statusNode.textContent = '验证失败：私有轨迹或 WebGL2 证据门未通过。';
  evidenceNode.textContent = JSON.stringify({
    schemaVersion: 'tf.private-browser-webgl2-trajectory-error/0.4.9',
    status: 'rejected',
  });
  console.error('private trajectory WebGL2 harness rejected');
});

async function boot(runGeneration: number) {
  const fetched = await fetchOneTimeTrajectoryPacket(runGeneration);
  assertActive(runGeneration);
  let decoded: ReturnType<typeof decodePrivatePositionTrajectoryPacketV049> | null = null;
  let packetDigest = '';
  try {
    packetDigest = await webCryptoSha256(fetched.bytes);
    assertActive(runGeneration);
    requireEvidence(
      packetDigest === fetched.packetDigestHeader,
      'packet digest differs from the loopback response header',
    );
    body.dataset.packetDigestVerified = 'true';
    decoded = decodePrivatePositionTrajectoryPacketV049(fetched.bytes);
  } finally {
    fetched.bytes.fill(0);
  }
  if (decoded === null) throw new Error('private trajectory packet decode did not complete');

  let metadata: ReturnType<
    typeof assertAtomisticPrivateBrowserPositionTrajectoryMetadataV049
  > | null = null;
  try {
    metadata = assertAtomisticPrivateBrowserPositionTrajectoryMetadataV049(
      decoded.trajectoryMetadata,
    );
    const aggregateDigest = await webCryptoSha256(decoded.positionsBytes);
    assertActive(runGeneration);
    requireEvidence(
      aggregateDigest === metadata.positionChannel.sha256,
      'aggregate position digest differs from WebCrypto SHA-256',
    );
    body.dataset.aggregateDigestVerified = 'true';
    for (let frameOrdinal = 0; frameOrdinal < FRAME_COUNT; frameOrdinal += 1) {
      const frame = metadata.sequence.frames[frameOrdinal];
      const start = frameOrdinal * FRAME_BYTE_LENGTH;
      requireEvidence(
        frame.frameOrdinal === frameOrdinal
          && frame.byteOffset === start
          && frame.byteLength === FRAME_BYTE_LENGTH,
        'trajectory frame layout changed',
      );
      const frameDigest = await webCryptoSha256(
        decoded.positionsBytes.subarray(start, start + FRAME_BYTE_LENGTH),
      );
      assertActive(runGeneration);
      requireEvidence(
        frameDigest === frame.positionsDerivedF32Digest,
        'trajectory frame digest differs from WebCrypto SHA-256',
      );
      verifyBrowserWaterGeometry(
        decoded.positionsBytes.subarray(start, start + FRAME_BYTE_LENGTH),
      );
    }
    body.dataset.allFrameDigestsVerified = 'true';
    browserController = createAtomisticPrivateBrowserPositionTrajectoryControllerV049(
      metadata,
      decoded.positionsBytes,
    );
  } finally {
    decoded.positionsBytes.fill(0);
  }
  if (metadata === null || browserController === null) {
    throw new Error('private browser trajectory owner construction did not complete');
  }

  const plan = createAtomisticPrivateBrowserTrajectoryInstancingPlanV049(metadata);
  coreRuntime = new AtomisticPrivateBrowserTrajectoryInstancingRuntimeV049(plan);
  threeRuntime = new AtomisticThreeInstancedRuntimeV046(coreRuntime);
  scene = createScene(threeRuntime);
  const camera = createCamera();
  const context = requireWebGl2Context();
  renderer = new WebGLRenderer({
    canvas,
    context,
    alpha: false,
    antialias: true,
    preserveDrawingBuffer: true,
  });
  renderer.setPixelRatio(1);
  renderer.setSize(960, 640, false);
  body.dataset.webgl2 = 'true';

  const identities = captureIdentities(threeRuntime);
  const expectedTriangleCount = deriveInstancedTriangleCount(threeRuntime);
  const drawCalls: number[] = [];
  const triangles: number[] = [];
  const raycastFrameOrdinals: number[] = [];
  const raycastAtomIndices: number[] = [];
  let resourceBaseline: Readonly<{ geometries: number; textures: number }> | null = null;
  let resourcesStable = true;
  let strictSequence = true;
  let updateCount = 0;
  let uploadCount = 0;
  let renderCount = 0;
  let schedulerYieldCount = 0;

  body.dataset.harnessState = 'running';
  statusNode.textContent = '已验证轨迹摘要；正在逐帧上传并执行 WebGL2 draw…';
  for (let frameOrdinal = 0; frameOrdinal < FRAME_COUNT; frameOrdinal += 1) {
    await oneSchedulerYield(runGeneration);
    schedulerYieldCount += 1;
    assertActive(runGeneration);

    const frameHandle = browserController.handle.getFrameHandle(frameOrdinal);
    const update = coreRuntime.updatePrivatePositionFrameV049(frameHandle);
    requireEvidence(
      update.sourceFrameOrdinal === frameOrdinal
        && update.previousSourceFrameOrdinal === (frameOrdinal === 0 ? null : frameOrdinal - 1)
        && update.sourceFrameAdvanced === (frameOrdinal > 0)
        && update.sameSourceStateRepeated === false
        && update.createsSolverFrame === false
        && update.interpolationApplied === false
        && update.forceConsumed === false
        && update.velocityConsumed === false,
      'private trajectory core update sequence changed',
    );
    updateCount += 1;

    const upload = threeRuntime.syncFromCore();
    requireEvidence(
      upload.sourceFrameOrdinal === frameOrdinal
        && upload.sourceFrameDigest === update.sourceFrameDigest
        && upload.presentationFrameDigest === update.positionFrameDigest
        && upload.positionsDerivedF32Digest === update.positionsDerivedF32Digest
        && upload.webglOrWebgpuDrawExecuted === false
        && upload.createsTrajectoryFrame === false,
      'Three upload receipt changed or claimed a draw',
    );
    uploadCount += 1;

    const draw = drawFrame(renderer, scene, camera, context);
    requireEvidence(
      draw.calls === DRAW_CALL_COUNT && draw.triangles === expectedTriangleCount,
      'WebGL2 draw count differs from the locked Three geometry',
    );
    drawCalls.push(draw.calls);
    triangles.push(draw.triangles);
    renderCount += 1;
    requireEvidence(context.getError() === context.NO_ERROR, 'WebGL2 reported an error');

    if (resourceBaseline === null) {
      resourceBaseline = Object.freeze({ ...renderer.info.memory });
    } else if (renderer.info.memory.geometries !== resourceBaseline.geometries
      || renderer.info.memory.textures !== resourceBaseline.textures) {
      resourcesStable = false;
    }
    if (TARGET_RAYCAST_FRAMES.has(frameOrdinal)) {
      const atomIndex = verifyFrameRaycast(threeRuntime, coreRuntime);
      raycastFrameOrdinals.push(frameOrdinal);
      raycastAtomIndices.push(atomIndex);
    }
    strictSequence = strictSequence
      && updateCount === frameOrdinal + 1
      && uploadCount === frameOrdinal + 1
      && renderCount === frameOrdinal + 1;
    body.dataset.framesRendered = String(renderCount);
    body.dataset.lastFrameOrdinal = String(frameOrdinal);
    statusNode.textContent = `WebGL2：已绘制离散源帧 ${frameOrdinal + 1} / ${FRAME_COUNT}`;
    if (renderCount === INTERRUPTION_BARRIER_RENDERED_FRAME_COUNT) {
      await waitAtInterruptionBarrier(runGeneration);
    }
  }

  assertActive(runGeneration);
  const identitiesStable = compareIdentities(identities, threeRuntime);
  const nonBackgroundPixels = countNonBackgroundPixels(
    context,
    canvas.width,
    canvas.height,
  );
  const revocation = browserController.revoke();
  let revokedFrameAccessRejected = false;
  try {
    browserController.handle.copyFramePositionBytes(100);
  } catch {
    revokedFrameAccessRejected = true;
  }
  body.dataset.browserOwnerRevoked = String(revocation.status === 'revoked');

  requireEvidence(updateCount === FRAME_COUNT, 'core update count changed');
  requireEvidence(uploadCount === FRAME_COUNT && threeRuntime.uploadCount === FRAME_COUNT,
    'Three upload count changed');
  requireEvidence(renderCount === FRAME_COUNT && schedulerYieldCount === FRAME_COUNT,
    'render or scheduler yield count changed');
  requireEvidence(strictSequence, 'source frame sequence did not advance strictly');
  requireEvidence(resourcesStable, 'renderer resources grew after warmup');
  requireEvidence(identitiesStable.all, 'persistent Three object identity changed');
  requireEvidence(
    exactNumbers(raycastFrameOrdinals, [0, 37, 100])
      && exactNumbers(raycastAtomIndices, [0, 0, 0]),
    'actual raycast evidence changed',
  );
  requireEvidence(nonBackgroundPixels > 128, 'readPixels did not observe rendered geometry');
  requireEvidence(revocation.status === 'revoked' && revokedFrameAccessRejected,
    'browser trajectory owner did not fail closed after revocation');

  const observable = Object.freeze({
    schemaVersion: 'tf.private-browser-webgl2-trajectory-observation/0.4.9',
    status: 'local-real-webgl2-101-frame-trajectory-draw-observed-execution-unattested',
    sourceBoundary: 'digest-bound-private-trajectory-packet-may-be-synthetic-test-fixture',
    packetDigest,
    trajectoryMetadataDigest: metadata.metadataDigest,
    positionTrajectoryDigest: metadata.positionChannel.sha256,
    orderedPositionFrameDigest: metadata.sequence.orderedPositionFrameDigest,
    frameCount: FRAME_COUNT,
    firstSourceFrameOrdinal: 0,
    lastSourceFrameOrdinal: 100,
    webgl2: true,
    packetDigestWebCryptoVerified: true,
    aggregatePositionsDigestWebCryptoVerified: true,
    allFrameSliceDigestsWebCryptoVerified: true,
    browserGeometryValidatedFrameCount: FRAME_COUNT,
    allFramesRigidWaterGeometryVerified: true,
    allFramesUniqueOxygenAnchorsVerified: true,
    allFramesEightOctantCoverageVerified: true,
    browserGeometryGateMeaning:
      'noncollapsed-rigid-water-presentation-sanity-not-equilibrium-density-or-execution-proof',
    validatedFrameSliceCount: FRAME_COUNT,
    updateCount,
    uploadCount,
    renderCount,
    schedulerYieldCount,
    schedulerSemantics: 'request-animation-frame-yield-only-not-physical-time-or-interpolation',
    strictSourceFrameSequenceAdvanced: strictSequence,
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
    drawCallsMinimum: Math.min(...drawCalls),
    drawCallsMaximum: Math.max(...drawCalls),
    trianglesMinimum: Math.min(...triangles),
    trianglesMaximum: Math.max(...triangles),
    glNoErrorForAllFrames: true,
    persistentInstancedMeshCount: 3,
    oxygenInstanceCount: threeRuntime.oxygenAtoms.count,
    hydrogenInstanceCount: threeRuntime.hydrogenAtoms.count,
    topologyLinkInstanceCount: threeRuntime.topologyBonds.count,
    objectIdentityStable: identitiesStable.objects,
    geometryIdentityStable: identitiesStable.geometries,
    materialIdentityStable: identitiesStable.materials,
    instanceMatrixIdentityStable: identitiesStable.matrixAttributes,
    instanceMatrixArrayIdentityStable: identitiesStable.matrixArrays,
    rendererGeometryAndTextureCountsStableAfterWarmup: resourcesStable,
    raycastFrameOrdinals: Object.freeze([...raycastFrameOrdinals]),
    raycastAtomIndices: Object.freeze([...raycastAtomIndices]),
    finalFramePixelsDifferingFromLowerLeftReference: nonBackgroundPixels,
    browserPositionsOwnerRevoked: revocation.status === 'revoked',
    revokedFrameAccessRejected,
    urlFragmentCredentialClearedBeforeRequest: fetched.fragmentClearedBeforeRequest,
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
  });

  Object.assign(body.dataset, {
    harnessState: 'ready',
    frameCount: String(FRAME_COUNT),
    framesRendered: String(renderCount),
    lastFrameOrdinal: '100',
    meshIdentity: identitiesStable.objects ? 'stable' : 'changed',
    geometryIdentity: identitiesStable.geometries ? 'stable' : 'changed',
    materialIdentity: identitiesStable.materials ? 'stable' : 'changed',
    instanceMatrixIdentity: identitiesStable.matrixAttributes ? 'stable' : 'changed',
    instanceMatrixArrayIdentity: identitiesStable.matrixArrays ? 'stable' : 'changed',
    rendererResources: resourcesStable ? 'stable' : 'grew',
    raycast: 'pass',
    nonBackgroundPixels: String(nonBackgroundPixels),
  });
  statusNode.textContent = '101 个离散源帧已完成真实 WebGL2 draw；该结果不证明 OpenMM 执行真实性、复现或发布资格。';
  evidenceNode.textContent = JSON.stringify(observable, null, 2);
}

function deriveInstancedTriangleCount(
  activeThreeRuntime: AtomisticThreeInstancedRuntimeV046,
) {
  let total = 0;
  for (const mesh of [
    activeThreeRuntime.oxygenAtoms,
    activeThreeRuntime.hydrogenAtoms,
    activeThreeRuntime.topologyBonds,
  ]) {
    const indexCount = mesh.geometry.getIndex()?.count
      ?? mesh.geometry.getAttribute('position')?.count;
    requireEvidence(
      Number.isSafeInteger(indexCount)
        && indexCount !== undefined
        && indexCount > 0
        && indexCount % 3 === 0
        && Number.isSafeInteger(mesh.count)
        && mesh.count > 0,
      'Three geometry does not have a bounded triangle-list layout',
    );
    total += (indexCount / 3) * mesh.count;
  }
  requireEvidence(
    Number.isSafeInteger(total) && total > 0,
    'derived Three triangle budget is invalid',
  );
  return total;
}

async function fetchOneTimeTrajectoryPacket(runGeneration: number) {
  const tokenMatch = /^#token=([0-9a-f]{64})$/.exec(location.hash);
  if (!tokenMatch) throw new Error('one-time loopback token is absent or malformed');
  let token = tokenMatch[1];
  history.replaceState(null, '', location.pathname);
  const fragmentClearedBeforeRequest = location.hash === ''
    && location.search === ''
    && location.pathname === '/';
  if (!fragmentClearedBeforeRequest) {
    token = '';
    throw new Error('one-time loopback fragment was not cleared before request');
  }
  const headers = new Headers({ Authorization: `Bearer ${token}` });
  token = '';
  const response = await fetch('/trajectory', {
    method: 'POST',
    headers,
    body: null,
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
    referrerPolicy: 'no-referrer',
    signal: abortController.signal,
  });
  assertActive(runGeneration);
  if (!response.ok
    || response.status !== 200
    || response.redirected
    || response.headers.get('content-type') !== 'application/octet-stream'
    || response.headers.has('access-control-allow-origin')) {
    throw new Error('one-time loopback trajectory response changed');
  }
  const packetDigestHeader = response.headers.get('x-private-packet-digest');
  if (typeof packetDigestHeader !== 'string' || !DIGEST.test(packetDigestHeader)) {
    throw new Error('one-time loopback packet digest header is invalid');
  }
  const contentLength = Number(response.headers.get('content-length'));
  if (!Number.isSafeInteger(contentLength)
    || contentLength < PACKET_MINIMUM_BYTES
    || contentLength > PACKET_MAXIMUM_BYTES) {
    throw new Error('one-time loopback trajectory Content-Length is outside its bound');
  }
  const bytes = new Uint8Array(await response.arrayBuffer());
  assertActive(runGeneration);
  if (bytes.byteLength !== contentLength) {
    bytes.fill(0);
    throw new Error('one-time loopback trajectory body differs from Content-Length');
  }
  return Object.freeze({
    bytes,
    packetDigestHeader,
    fragmentClearedBeforeRequest,
  });
}

function createScene(runtime: AtomisticThreeInstancedRuntimeV046) {
  const nextScene = new Scene();
  nextScene.background = new Color(0x02090b);
  nextScene.add(new AmbientLight(0xbfe9e4, 1.35));
  const keyLight = new DirectionalLight(0xffffff, 2.4);
  keyLight.position.set(4.2, 5.5, 6.5);
  nextScene.add(keyLight, runtime.group);
  return nextScene;
}

function createCamera() {
  const camera = new PerspectiveCamera(42, 960 / 640, 0.01, 50);
  camera.position.set(4.9, 4.15, 5.65);
  camera.lookAt(1.5, 1.5, 1.5);
  return camera;
}

function requireWebGl2Context() {
  const context = canvas.getContext('webgl2', {
    alpha: false,
    antialias: true,
    depth: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true,
    stencil: false,
  });
  if (!context || typeof WebGL2RenderingContext === 'undefined'
    || !(context instanceof WebGL2RenderingContext)) {
    throw new Error('a real WebGL2 context is required');
  }
  return context;
}

function drawFrame(
  activeRenderer: WebGLRenderer,
  activeScene: Scene,
  camera: PerspectiveCamera,
  context: WebGL2RenderingContext,
) {
  activeRenderer.info.reset();
  activeRenderer.render(activeScene, camera);
  context.finish();
  return Object.freeze({
    calls: activeRenderer.info.render.calls,
    triangles: activeRenderer.info.render.triangles,
  });
}

function verifyFrameRaycast(
  activeThreeRuntime: AtomisticThreeInstancedRuntimeV046,
  activeCoreRuntime: AtomisticPrivateBrowserTrajectoryInstancingRuntimeV049,
) {
  const snapshot = activeCoreRuntime.snapshot();
  try {
    const positions = snapshot.displayPositionsNanometerByAtomIndex;
    const center = new Vector3(positions[0], positions[1], positions[2]);
    activeThreeRuntime.group.updateMatrixWorld(true);
    const raycaster = new Raycaster(
      center.clone().add(new Vector3(0, 0, 0.12)),
      new Vector3(0, 0, -1),
      0,
      0.24,
    );
    const hit = raycaster.intersectObject(activeThreeRuntime.oxygenAtoms, false)
      .find((candidate) => candidate.instanceId === 0);
    if (!hit) throw new Error('actual Three raycaster did not hit oxygen instance zero');
    const mapped = activeThreeRuntime.resolveRaycastIntersection(hit);
    if (!mapped || mapped.selection.atomIndex !== 0 || mapped.selection.instanceId !== 0) {
      throw new Error('actual Three raycast did not resolve authoritative atom zero');
    }
    return mapped.selection.atomIndex;
  } finally {
    zeroSnapshot(snapshot);
  }
}

function captureIdentities(runtime: AtomisticThreeInstancedRuntimeV046) {
  return Object.freeze({
    group: runtime.group,
    oxygen: runtime.oxygenAtoms,
    hydrogen: runtime.hydrogenAtoms,
    topology: runtime.topologyBonds,
    oxygenGeometry: runtime.oxygenAtoms.geometry,
    hydrogenGeometry: runtime.hydrogenAtoms.geometry,
    topologyGeometry: runtime.topologyBonds.geometry,
    oxygenMaterial: runtime.oxygenAtoms.material,
    hydrogenMaterial: runtime.hydrogenAtoms.material,
    topologyMaterial: runtime.topologyBonds.material,
    oxygenMatrix: runtime.oxygenAtoms.instanceMatrix,
    hydrogenMatrix: runtime.hydrogenAtoms.instanceMatrix,
    topologyMatrix: runtime.topologyBonds.instanceMatrix,
    oxygenMatrixArray: runtime.oxygenAtoms.instanceMatrix.array,
    hydrogenMatrixArray: runtime.hydrogenAtoms.instanceMatrix.array,
    topologyMatrixArray: runtime.topologyBonds.instanceMatrix.array,
  });
}

function compareIdentities(
  identities: ReturnType<typeof captureIdentities>,
  runtime: AtomisticThreeInstancedRuntimeV046,
) {
  const objects = identities.group === runtime.group
    && identities.oxygen === runtime.oxygenAtoms
    && identities.hydrogen === runtime.hydrogenAtoms
    && identities.topology === runtime.topologyBonds;
  const geometries = identities.oxygenGeometry === runtime.oxygenAtoms.geometry
    && identities.hydrogenGeometry === runtime.hydrogenAtoms.geometry
    && identities.topologyGeometry === runtime.topologyBonds.geometry;
  const materials = identities.oxygenMaterial === runtime.oxygenAtoms.material
    && identities.hydrogenMaterial === runtime.hydrogenAtoms.material
    && identities.topologyMaterial === runtime.topologyBonds.material;
  const matrixAttributes = identities.oxygenMatrix === runtime.oxygenAtoms.instanceMatrix
    && identities.hydrogenMatrix === runtime.hydrogenAtoms.instanceMatrix
    && identities.topologyMatrix === runtime.topologyBonds.instanceMatrix;
  const matrixArrays = identities.oxygenMatrixArray === runtime.oxygenAtoms.instanceMatrix.array
    && identities.hydrogenMatrixArray === runtime.hydrogenAtoms.instanceMatrix.array
    && identities.topologyMatrixArray === runtime.topologyBonds.instanceMatrix.array;
  return Object.freeze({
    objects,
    geometries,
    materials,
    matrixAttributes,
    matrixArrays,
    all: objects && geometries && materials && matrixAttributes && matrixArrays,
  });
}

function verifyBrowserWaterGeometry(frameBytes: Uint8Array) {
  if (frameBytes.byteLength !== FRAME_BYTE_LENGTH) {
    throw new Error('browser water geometry frame byte length changed');
  }
  const positions = new DataView(
    frameBytes.buffer,
    frameBytes.byteOffset,
    frameBytes.byteLength,
  );
  const bitBuffer = new ArrayBuffer(4);
  const bitView = new DataView(bitBuffer);
  const oxygenKeys = new Set<string>();
  const octants = [0, 0, 0, 0, 0, 0, 0, 0];
  let maximumResidual = 0;
  for (let water = 0; water < 895; water += 1) {
    const offset = water * 9;
    const oxygen = readPoint(positions, offset);
    const hydrogen1 = minimumImageSite(oxygen, readPoint(positions, offset + 3));
    const hydrogen2 = minimumImageSite(oxygen, readPoint(positions, offset + 6));
    maximumResidual = Math.max(
      maximumResidual,
      relativeResidual(pointDistance(oxygen, hydrogen1), OH_DISTANCE_NANOMETER),
      relativeResidual(pointDistance(oxygen, hydrogen2), OH_DISTANCE_NANOMETER),
      relativeResidual(pointDistance(hydrogen1, hydrogen2), HH_DISTANCE_NANOMETER),
    );
    const wrapped = oxygen.map(wrapCell) as [number, number, number];
    oxygenKeys.add(wrapped.map((value) => float32BitKey(value, bitView)).join(':'));
    const octant = (wrapped[0] >= 1.5 ? 4 : 0)
      + (wrapped[1] >= 1.5 ? 2 : 0)
      + (wrapped[2] >= 1.5 ? 1 : 0);
    octants[octant] += 1;
  }
  if (oxygenKeys.size !== 895
    || octants.some((count) => count < 1)
    || !Number.isFinite(maximumResidual)
    || maximumResidual > RIGID_WATER_RELATIVE_RESIDUAL_LIMIT) {
    throw new Error('browser water geometry failed its noncollapsed rigid presentation gate');
  }
}

function readPoint(view: DataView, componentOffset: number): [number, number, number] {
  const point = [
    view.getFloat32(componentOffset * 4, true),
    view.getFloat32((componentOffset + 1) * 4, true),
    view.getFloat32((componentOffset + 2) * 4, true),
  ] as [number, number, number];
  if (point.some((value) => !Number.isFinite(value) || Object.is(value, -0))) {
    throw new Error('browser water geometry contains an invalid coordinate');
  }
  return point;
}

function minimumImageSite(
  oxygen: Readonly<[number, number, number]>,
  site: Readonly<[number, number, number]>,
): [number, number, number] {
  return [
    oxygen[0] + minimumImage(site[0] - oxygen[0]),
    oxygen[1] + minimumImage(site[1] - oxygen[1]),
    oxygen[2] + minimumImage(site[2] - oxygen[2]),
  ];
}

function minimumImage(value: number) {
  return value - CELL_LENGTH_NANOMETER * Math.round(value / CELL_LENGTH_NANOMETER);
}

function wrapCell(value: number) {
  const wrapped = ((value % CELL_LENGTH_NANOMETER) + CELL_LENGTH_NANOMETER)
    % CELL_LENGTH_NANOMETER;
  return Object.is(wrapped, -0) ? 0 : wrapped;
}

function relativeResidual(value: number, target: number) {
  return Math.abs(value - target) / target;
}

function pointDistance(
  left: Readonly<[number, number, number]>,
  right: Readonly<[number, number, number]>,
) {
  return Math.hypot(
    right[0] - left[0],
    right[1] - left[1],
    right[2] - left[2],
  );
}

function float32BitKey(value: number, view: DataView) {
  view.setFloat32(0, value, true);
  return view.getUint32(0, true).toString(16).padStart(8, '0');
}

function countNonBackgroundPixels(
  context: WebGL2RenderingContext,
  width: number,
  height: number,
) {
  const pixels = new Uint8Array(width * height * 4);
  try {
    context.readPixels(0, 0, width, height, context.RGBA, context.UNSIGNED_BYTE, pixels);
    const reference = [pixels[0], pixels[1], pixels[2], pixels[3]];
    let changed = 0;
    for (let offset = 4; offset < pixels.length; offset += 4) {
      if (pixels[offset] !== reference[0]
        || pixels[offset + 1] !== reference[1]
        || pixels[offset + 2] !== reference[2]
        || pixels[offset + 3] !== reference[3]) changed += 1;
    }
    return changed;
  } finally {
    pixels.fill(0);
  }
}

function zeroSnapshot(
  snapshot: ReturnType<AtomisticPrivateBrowserTrajectoryInstancingRuntimeV049['snapshot']>,
) {
  snapshot.atomMatricesByBatch[0].matrices.fill(0);
  snapshot.atomMatricesByBatch[1].matrices.fill(0);
  snapshot.topologyBondMatrices.fill(0);
  snapshot.displayPositionsNanometerByAtomIndex.fill(0);
}

async function oneSchedulerYield(runGeneration: number) {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  assertActive(runGeneration);
}

async function webCryptoSha256(bytes: Uint8Array) {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto SHA-256 is unavailable');
  const copy = bytes.slice();
  try {
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', copy));
    try {
      const hex = [...digest]
        .map((value) => value.toString(16).padStart(2, '0'))
        .join('');
      return `sha256:${hex}`;
    } finally {
      digest.fill(0);
    }
  } finally {
    copy.fill(0);
  }
}

function terminate(reason: 'disposed' | 'context-lost' | 'error') {
  if (cleanupRan) return;
  cleanupRan = true;
  terminalReason = reason;
  generation += 1;
  abortController.abort();
  const failures: unknown[] = [];

  let ownerRevoked = browserController === null;
  if (browserController !== null) {
    try {
      ownerRevoked = browserController.revoke().status === 'revoked';
    } catch (error) {
      failures.push(error);
    }
  }
  body.dataset.browserOwnerRevoked = String(ownerRevoked);

  let runtimeDisposed = coreRuntime === null;
  if (coreRuntime !== null) {
    try {
      coreRuntime.dispose();
      runtimeDisposed = coreRuntime.disposed;
    } catch (error) {
      failures.push(error);
    }
  }
  body.dataset.runtimeDisposed = String(runtimeDisposed);

  let threeDisposed = threeRuntime === null;
  if (threeRuntime !== null) {
    try {
      scene?.remove(threeRuntime.group);
      threeRuntime.dispose();
      threeDisposed = threeRuntime.disposed;
    } catch (error) {
      failures.push(error);
    }
  }
  body.dataset.threeDisposed = String(threeDisposed);

  let rendererDisposed = renderer === null;
  if (renderer !== null) {
    try {
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      rendererDisposed = true;
    } catch (error) {
      failures.push(error);
    }
  }
  body.dataset.rendererDisposed = String(rendererDisposed);

  browserController = null;
  coreRuntime = null;
  threeRuntime = null;
  renderer = null;
  scene = null;
  body.dataset.cleanupComplete = String(failures.length === 0
    && ownerRevoked && runtimeDisposed && threeDisposed && rendererDisposed);
  body.dataset.harnessState = reason;
  continueButton.disabled = true;
  disposeButton.disabled = true;
  if (reason === 'disposed') {
    statusNode.textContent = '浏览器所有者副本已撤销，CPU 与 Three 资源已释放；不声称 JS、GPU 或操作系统物理安全擦除。';
  } else if (reason === 'context-lost') {
    body.dataset.contextRestoreRequiresNewCapability = 'true';
    statusNode.textContent = 'WebGL context 已丢失并触发失败关闭；恢复 context 不会恢复轨迹能力。';
  }
}

async function waitAtInterruptionBarrier(runGeneration: number) {
  assertActive(runGeneration);
  requireEvidence(
    body.dataset.framesRendered === String(INTERRUPTION_BARRIER_RENDERED_FRAME_COUNT),
    'private browser interruption barrier frame count changed',
  );
  body.dataset.interruptionBarrierReached = 'true';
  body.dataset.harnessState = 'interruption-ready';
  statusNode.textContent = `WebGL2：已在第 ${INTERRUPTION_BARRIER_RENDERED_FRAME_COUNT} 帧审计屏障暂停`;
  continueButton.disabled = false;
  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      continueButton.removeEventListener('click', onContinue);
      abortController.signal.removeEventListener('abort', onAbort);
      action();
    };
    const onContinue = () => finish(resolve);
    const onAbort = () => finish(() => reject(
      new Error('private browser interruption barrier terminated'),
    ));
    continueButton.addEventListener('click', onContinue, { once: true });
    abortController.signal.addEventListener('abort', onAbort, { once: true });
    if (abortController.signal.aborted) onAbort();
  });
  assertActive(runGeneration);
  continueButton.disabled = true;
  body.dataset.harnessState = 'running';
  statusNode.textContent = '第 37 帧审计屏障已释放；继续逐帧执行 WebGL2 draw…';
}

function assertActive(runGeneration: number) {
  if (cleanupRan || generation !== runGeneration || abortController.signal.aborted) {
    throw new Error('private browser trajectory run is no longer active');
  }
}

function exactNumbers(value: ReadonlyArray<number>, expected: ReadonlyArray<number>) {
  return value.length === expected.length
    && value.every((entry, index) => Object.is(entry, expected[index]));
}

function requireEvidence(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function requiredElement<T extends HTMLElement>(id: string) {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) throw new Error(`required element ${id} is absent`);
  return element as T;
}
