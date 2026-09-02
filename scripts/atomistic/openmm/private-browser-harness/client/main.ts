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
  AtomisticPrivateInstancingRuntimeV047,
  createAtomisticPrivateInstancingPlanV047,
} from '../../../../../lib/molecular/atomistic-private-instancing-runtime-v047.ts';
import {
  AtomisticThreeInstancedRuntimeV046,
} from '../../../../../lib/molecular/atomistic-three-instanced-runtime-v046.ts';
import {
  assertAtomisticPrivatePositionFrameMetadataV047,
  createAtomisticPrivatePositionFrameControllerV047,
  type AtomisticPrivatePositionFrameControllerV047,
  type AtomisticPrivatePositionFrameMetadataV047,
} from '../../../../../lib/simulation/atomistic-private-position-frame-v047.ts';
import {
  decodePrivatePositionPacketV047,
} from '../private-position-envelope-v046.mjs';

const body = document.body;
const canvas = requiredElement<HTMLCanvasElement>('atomistic-canvas');
const status = requiredElement<HTMLDivElement>('harness-status');
const evidenceNode = requiredElement<HTMLPreElement>('harness-evidence');
const disposeButton = requiredElement<HTMLButtonElement>('dispose-harness');

void boot().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : 'unknown private harness failure';
  body.dataset.harnessState = 'error';
  status.textContent = `验证失败：${message}`;
  evidenceNode.textContent = JSON.stringify({ state: 'error', message }, null, 2);
  console.error('private atomistic harness failed');
});

async function boot() {
  const cleanupActions: Array<() => void> = [];
  let cleanupRan = false;
  const runCleanup = () => {
    if (cleanupRan) return false;
    cleanupRan = true;
    let cleanupFailed = false;
    for (const action of cleanupActions.reverse()) {
      try {
        action();
      } catch {
        cleanupFailed = true;
      }
    }
    body.dataset.cleanupComplete = String(!cleanupFailed);
    return !cleanupFailed;
  };

  try {
    const fetched = await fetchOneTimePacket();
    let decoded: ReturnType<typeof decodePrivatePositionPacketV047> | null = null;
    let transportPacketDigest = '';
    try {
      transportPacketDigest = await webCryptoSha256(fetched.bytes);
      if (transportPacketDigest !== fetched.packetDigestHeader) {
        throw new Error('loopback packet digest header differs from WebCrypto SHA-256');
      }
      decoded = decodePrivatePositionPacketV047(fetched.bytes);
    } finally {
      fetched.bytes.fill(0);
    }
    if (decoded === null) throw new Error('private position packet decode did not complete');

    let metadata: AtomisticPrivatePositionFrameMetadataV047 | null = null;
    let controller: AtomisticPrivatePositionFrameControllerV047 | null = null;
    try {
      const positionsWebCryptoDigest = await webCryptoSha256(decoded.positionsBytes);
      metadata = assertAtomisticPrivatePositionFrameMetadataV047(decoded.frameMetadata);
      if (positionsWebCryptoDigest !== metadata.positionChannel.sha256) {
        throw new Error('positions digest differs from independent WebCrypto SHA-256');
      }
      controller = createAtomisticPrivatePositionFrameControllerV047(
        metadata,
        decoded.positionsBytes,
      );
    } finally {
      decoded.positionsBytes.fill(0);
    }
    if (metadata === null || controller === null) {
      throw new Error('private position frame owner construction did not complete');
    }
    cleanupActions.push(() => { controller.revoke(); });

    const plan = createAtomisticPrivateInstancingPlanV047(metadata);
    const coreRuntime = new AtomisticPrivateInstancingRuntimeV047(plan);
    cleanupActions.push(() => { coreRuntime.dispose(); });
    const threeRuntime = new AtomisticThreeInstancedRuntimeV046(coreRuntime);
    const scene = new Scene();
    scene.background = new Color(0x02090b);
    scene.add(new AmbientLight(0xbfe9e4, 1.35));
    const keyLight = new DirectionalLight(0xffffff, 2.4);
    keyLight.position.set(4.2, 5.5, 6.5);
    scene.add(keyLight, threeRuntime.group);
    cleanupActions.push(() => {
      scene.remove(threeRuntime.group);
      threeRuntime.dispose();
    });

    const camera = new PerspectiveCamera(42, 960 / 640, 0.01, 50);
    camera.position.set(4.9, 4.15, 5.65);
    camera.lookAt(1.5, 1.5, 1.5);

    const context = canvas.getContext('webgl2', {
      alpha: false,
      antialias: true,
      depth: true,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
      stencil: false,
    });
    if (!context
      || typeof WebGL2RenderingContext === 'undefined'
      || !(context instanceof WebGL2RenderingContext)) {
      throw new Error('a real WebGL2 context is required');
    }
    const loseContext = context.getExtension('WEBGL_lose_context');
    cleanupActions.push(() => { loseContext?.loseContext(); });
    const renderer = new WebGLRenderer({
      canvas,
      context,
      alpha: false,
      antialias: true,
      preserveDrawingBuffer: false,
    });
    renderer.setPixelRatio(1);
    renderer.setSize(960, 640, false);
    cleanupActions.push(() => {
      renderer.renderLists.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    });

    const firstUpdate = coreRuntime.updatePrivatePositionFrameV047(controller.handle);
    const firstUpload = threeRuntime.syncFromCore();
    const identities = captureIdentities(threeRuntime);
    const firstDraw = draw(renderer, scene, camera, context);
    const memoryAfterFirstDraw = { ...renderer.info.memory };

    const repeatedUpdate = coreRuntime.updatePrivatePositionFrameV047(controller.handle);
    const repeatedUpload = threeRuntime.syncFromCore();
    const identitiesStable = sameIdentities(identities, threeRuntime);
    const revocation = controller.revoke();
    let revokedUpdateRejected = false;
    try {
      coreRuntime.updatePrivatePositionFrameV047(controller.handle);
    } catch {
      revokedUpdateRejected = true;
    }
    const secondDraw = draw(renderer, scene, camera, context);
    const memoryAfterSecondDraw = { ...renderer.info.memory };
    const resourceCountsStable = memoryAfterFirstDraw.geometries === memoryAfterSecondDraw.geometries
      && memoryAfterFirstDraw.textures === memoryAfterSecondDraw.textures;

    const snapshot = coreRuntime.snapshot();
    let raycast: ReturnType<typeof verifyActualRaycast>;
    try {
      raycast = verifyActualRaycast(
        threeRuntime,
        snapshot.displayPositionsNanometerByAtomIndex,
      );
    } finally {
      zeroCoreSnapshot(snapshot);
    }
    const nonBackgroundPixels = countNonBackgroundPixels(context, canvas.width, canvas.height);
    const webGlError = context.getError();

    requireEvidence(firstUpdate.sourceFrameOrdinal === metadata.binding.frameOrdinal,
      'core update frame binding changed');
    requireEvidence(
      repeatedUpdate.privateFrameMetadataDigest === firstUpdate.privateFrameMetadataDigest,
      'same-state repeat changed private frame metadata digest',
    );
    requireEvidence(firstUpload.webglOrWebgpuDrawExecuted === false
      && repeatedUpload.webglOrWebgpuDrawExecuted === false,
    'Three upload receipt must remain distinct from browser draw evidence');
    requireEvidence(firstDraw.calls > 0 && firstDraw.calls <= plan.drawCallBudget.hardLimit,
      'first measured draw calls exceeded the locked budget');
    requireEvidence(secondDraw.calls > 0 && secondDraw.calls <= plan.drawCallBudget.hardLimit,
      'second measured draw calls exceeded the locked budget');
    requireEvidence(firstDraw.triangles > 0 && secondDraw.triangles > 0,
      'WebGL2 did not rasterize atomistic triangles');
    requireEvidence(identitiesStable, 'persistent Three object identity changed');
    requireEvidence(resourceCountsStable,
      'renderer geometry or texture resource count grew on same-state repeat');
    requireEvidence(revocation.status === 'revoked' && revokedUpdateRejected,
      'browser positions owner revocation did not fail closed');
    requireEvidence(raycast.atomIndex === 0 && raycast.instanceId === 0,
      'actual raycast did not map instance zero to authoritative atom zero');
    requireEvidence(nonBackgroundPixels > 128, 'readPixels did not observe rendered geometry');
    requireEvidence(webGlError === context.NO_ERROR, `WebGL2 error ${webGlError} was observed`);

    const observable = Object.freeze({
    schemaVersion: 'tf.private-browser-webgl2-observation/0.4.7',
    status: 'local-real-webgl2-draw-observed-execution-unattested',
    sourceBoundary: 'digest-bound-private-packet-may-be-synthetic-test-fixture',
    packetDigest: transportPacketDigest,
    sessionDigest: metadata.binding.sessionDigest,
    sourceFrameOrdinal: metadata.binding.frameOrdinal,
    sourceFrameDigest: metadata.binding.frameDigest,
    privateFrameMetadataDigest: metadata.metadataDigest,
    positionsDerivedF32Digest: metadata.binding.positionsDerivedF32Digest,
    atomOrderDigest: metadata.binding.atomOrderDigest,
    cellDigest: metadata.binding.cellDigest,
    topologyDigest: metadata.binding.topologyDigest,
    webgl2: true,
    packetDigestWebCryptoVerified: true,
    positionsDigestWebCryptoVerified: true,
    measuredDrawCalls: [firstDraw.calls, secondDraw.calls],
    measuredTriangles: [firstDraw.triangles, secondDraw.triangles],
    persistentInstancedMeshCount: 3,
    oxygenInstanceCount: threeRuntime.oxygenAtoms.count,
    hydrogenInstanceCount: threeRuntime.hydrogenAtoms.count,
    topologyLinkInstanceCount: threeRuntime.topologyBonds.count,
    samePresentationStateRepeated: true,
    createsSecondTrajectoryFrame: false,
    objectIdentityStable: identitiesStable,
    rendererResourceCountsStable: resourceCountsStable,
    uploadCount: threeRuntime.uploadCount,
    actualRaycast: raycast,
    nonBackgroundPixels,
    browserPositionsOwnerRevoked: revocation.status === 'revoked',
    revokedUpdateRejected,
    webGlError,
    renderedChannel: 'digest-bound-source-position-f32-presentation-derivative-only',
    topologyLinksEnergetic: false,
    forcesRendered: false,
    velocitiesRendered: false,
    electronicDensityRendered: false,
    physicalWorldState: false,
    executionAuthenticityVerified: false,
    reproduced: false,
    publicDistributionEligible: false,
    cloudflareDistributionEligible: false,
    performanceClaim: null,
    securePhysicalErasureVerified: false,
    });

    Object.assign(body.dataset, {
    harnessState: 'ready',
    sourceKind: 'execution-unattested-may-be-synthetic',
    webgl2: 'true',
    renderCallsFirst: String(firstDraw.calls),
    renderCallsSecond: String(secondDraw.calls),
    renderTriangles: String(secondDraw.triangles),
    meshIdentity: identitiesStable ? 'stable' : 'changed',
    instanceMatrixIdentity: identitiesStable ? 'stable' : 'changed',
    rendererResources: resourceCountsStable ? 'stable' : 'grew',
    uploadCount: String(threeRuntime.uploadCount),
    raycast: 'pass',
    browserOwnerRevoked: String(revocation.status === 'revoked'),
    publicDistributionEligible: 'false',
    topologyLinksEnergetic: 'false',
    forcesRendered: 'false',
    });
    status.textContent = '真实 WebGL2 draw 已在本机观察；该结果仅证明私有渲染链，不证明 OpenMM 执行真实性、复现或发布资格。';
    evidenceNode.textContent = JSON.stringify(observable, null, 2);

    const cleanup = () => {
      if (!runCleanup()) return;
      body.dataset.harnessState = 'disposed';
      body.dataset.runtimeDisposed = 'true';
      disposeButton.disabled = true;
      status.textContent = '浏览器所有者副本已撤销，Three 资源已释放，WebGL context 已请求丢失；不声称 JS/GPU/OS 物理安全擦除。';
    };
    disposeButton.addEventListener('click', cleanup, { once: true });
    window.addEventListener('pagehide', cleanup, { once: true });
  } catch (error) {
    runCleanup();
    throw error;
  }
}

async function fetchOneTimePacket() {
  const tokenMatch = /^#token=([0-9a-f]{64})$/.exec(location.hash);
  if (!tokenMatch) throw new Error('one-time loopback token is absent or malformed');
  let token = tokenMatch[1];
  history.replaceState(null, '', location.pathname);
  try {
    const response = await fetch('/frame', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store',
      credentials: 'omit',
      redirect: 'error',
      referrerPolicy: 'no-referrer',
    });
    if (!response.ok
      || response.status !== 200
      || response.headers.get('content-type') !== 'application/octet-stream'
      || response.headers.has('access-control-allow-origin')) {
      throw new Error('one-time loopback frame response changed');
    }
    const packetDigestHeader = response.headers.get('x-private-packet-digest');
    if (!packetDigestHeader || !/^sha256:[0-9a-f]{64}$/.test(packetDigestHeader)) {
      throw new Error('one-time loopback packet digest header is absent');
    }
    const contentLength = Number(response.headers.get('content-length'));
    if (!Number.isSafeInteger(contentLength)
      || contentLength < 32_268
      || contentLength > 128 * 1024) {
      throw new Error('one-time loopback packet Content-Length is outside its bound');
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== contentLength) {
      bytes.fill(0);
      throw new Error('one-time loopback packet body differs from Content-Length');
    }
    return { bytes, packetDigestHeader };
  } finally {
    token = '';
  }
}

function draw(
  renderer: WebGLRenderer,
  scene: Scene,
  camera: PerspectiveCamera,
  context: WebGL2RenderingContext,
) {
  renderer.info.reset();
  renderer.render(scene, camera);
  context.finish();
  return Object.freeze({
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
  });
}

function captureIdentities(runtime: AtomisticThreeInstancedRuntimeV046) {
  return Object.freeze({
    oxygen: runtime.oxygenAtoms,
    hydrogen: runtime.hydrogenAtoms,
    topology: runtime.topologyBonds,
    atomGeometry: runtime.oxygenAtoms.geometry,
    bondGeometry: runtime.topologyBonds.geometry,
    oxygenMaterial: runtime.oxygenAtoms.material,
    hydrogenMaterial: runtime.hydrogenAtoms.material,
    topologyMaterial: runtime.topologyBonds.material,
    oxygenMatrix: runtime.oxygenAtoms.instanceMatrix,
    hydrogenMatrix: runtime.hydrogenAtoms.instanceMatrix,
    topologyMatrix: runtime.topologyBonds.instanceMatrix,
  });
}

function sameIdentities(
  identities: ReturnType<typeof captureIdentities>,
  runtime: AtomisticThreeInstancedRuntimeV046,
) {
  return identities.oxygen === runtime.oxygenAtoms
    && identities.hydrogen === runtime.hydrogenAtoms
    && identities.topology === runtime.topologyBonds
    && identities.atomGeometry === runtime.oxygenAtoms.geometry
    && identities.atomGeometry === runtime.hydrogenAtoms.geometry
    && identities.bondGeometry === runtime.topologyBonds.geometry
    && identities.oxygenMaterial === runtime.oxygenAtoms.material
    && identities.hydrogenMaterial === runtime.hydrogenAtoms.material
    && identities.topologyMaterial === runtime.topologyBonds.material
    && identities.oxygenMatrix === runtime.oxygenAtoms.instanceMatrix
    && identities.hydrogenMatrix === runtime.hydrogenAtoms.instanceMatrix
    && identities.topologyMatrix === runtime.topologyBonds.instanceMatrix;
}

function verifyActualRaycast(
  runtime: AtomisticThreeInstancedRuntimeV046,
  positions: Float32Array,
) {
  const center = new Vector3(positions[0], positions[1], positions[2]);
  runtime.group.updateMatrixWorld(true);
  const raycaster = new Raycaster(
    center.clone().add(new Vector3(0, 0, 0.12)),
    new Vector3(0, 0, -1),
    0,
    0.24,
  );
  const hit = raycaster.intersectObject(runtime.oxygenAtoms, false)
    .find((candidate) => candidate.instanceId === 0);
  if (!hit) throw new Error('actual Three raycaster did not hit oxygen instance zero');
  const mapped = runtime.resolveRaycastIntersection(hit);
  if (!mapped) throw new Error('actual Three raycast hit did not resolve to one atom');
  return Object.freeze({
    instanceId: hit.instanceId,
    atomIndex: mapped.selection.atomIndex,
    atomId: mapped.selection.atomId,
    moleculeId: mapped.selection.moleculeId,
    atomOrderDigest: mapped.selection.atomOrderDigest,
    topologyDigest: mapped.selection.topologyDigest,
  });
}

function countNonBackgroundPixels(
  context: WebGL2RenderingContext,
  width: number,
  height: number,
) {
  const pixels = new Uint8Array(width * height * 4);
  context.readPixels(0, 0, width, height, context.RGBA, context.UNSIGNED_BYTE, pixels);
  const reference = [pixels[0], pixels[1], pixels[2], pixels[3]];
  let changed = 0;
  for (let offset = 4; offset < pixels.length; offset += 4) {
    if (pixels[offset] !== reference[0]
      || pixels[offset + 1] !== reference[1]
      || pixels[offset + 2] !== reference[2]
      || pixels[offset + 3] !== reference[3]) {
      changed += 1;
    }
  }
  pixels.fill(0);
  return changed;
}

function zeroCoreSnapshot(
  snapshot: ReturnType<AtomisticPrivateInstancingRuntimeV047['snapshot']>,
) {
  snapshot.atomMatricesByBatch[0].matrices.fill(0);
  snapshot.atomMatricesByBatch[1].matrices.fill(0);
  snapshot.topologyBondMatrices.fill(0);
  snapshot.displayPositionsNanometerByAtomIndex.fill(0);
}

function requireEvidence(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function webCryptoSha256(bytes: Uint8Array) {
  if (!globalThis.crypto?.subtle) throw new Error('WebCrypto SHA-256 is unavailable');
  const copy = bytes.slice();
  try {
    const digest = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', copy));
    const hex = [...digest].map((value) => value.toString(16).padStart(2, '0')).join('');
    digest.fill(0);
    return `sha256:${hex}`;
  } finally {
    copy.fill(0);
  }
}

function requiredElement<T extends HTMLElement>(id: string) {
  const element = document.getElementById(id);
  if (!(element instanceof HTMLElement)) throw new Error(`required element ${id} is absent`);
  return element as T;
}
