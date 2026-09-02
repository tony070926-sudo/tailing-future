import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { digestValue } from '../simulation/digest.ts';
import {
  assertAtomisticPrivateBrowserPositionTrajectoryMetadataV049,
  createAtomisticPrivateBrowserOrderedPositionFrameDigestV049,
  createAtomisticPrivateBrowserPositionFrameDigestV049,
  createAtomisticPrivateBrowserPositionTrajectoryControllerV049,
  type AtomisticPrivateBrowserPositionTrajectoryFrameHandleV049,
  type AtomisticPrivateBrowserPositionTrajectoryMetadataV049,
} from '../simulation/atomistic-private-browser-position-trajectory-v049.ts';
import {
  createAtomisticPrivateBrowserPositionTrajectoryMetadataV049,
} from '../simulation/atomistic-private-browser-position-trajectory-v049-projector.server.ts';
import { createAtomisticPrivatePositionTrajectoryFixtureV048 } from
  '../simulation/atomistic-private-position-trajectory-v048.test-fixture.ts';
import { createAtomisticPrivatePositionTrajectoryControllerV048 } from
  '../simulation/atomistic-private-position-trajectory-v048.ts';
import { AtomisticThreeInstancedRuntimeV046 } from './atomistic-three-instanced-runtime-v046.ts';
import {
  AtomisticPrivateBrowserTrajectoryInstancingRuntimeV049,
  createAtomisticPrivateBrowserTrajectoryInstancingPlanV049,
  type AtomisticPrivateBrowserTrajectoryInstancingPlanV049,
} from './atomistic-private-browser-trajectory-instancing-runtime-v049.ts';

type MutableMetadata = {
  metadataDigest: string;
  binding: AtomisticPrivateBrowserPositionTrajectoryMetadataV049['binding'];
  sequence: {
    orderedPositionFrameDigest: string;
    frames: Array<{
      frameOrdinal: number;
      step: number;
      timePicoseconds: number;
      sourceFrameDigest: string;
      positionsDerivedF32Digest: string;
      byteOffset: number;
      byteLength: 32_220;
      positionFrameDigest: string;
    }>;
  };
  positionChannel: { sha256: string };
} & Record<string, unknown>;

let metadata: AtomisticPrivateBrowserPositionTrajectoryMetadataV049;
let positions: Uint8Array;

beforeAll(() => {
  // Explicitly synthetic test support: this proves projection/runtime behavior,
  // not a reproduced or authenticated OpenMM execution.
  const fixture = createAtomisticPrivatePositionTrajectoryFixtureV048(
    'v049-browser-instancing-explicit-synthetic',
  );
  let source: ReturnType<typeof createAtomisticPrivatePositionTrajectoryControllerV048> | null =
    null;
  try {
    source = createAtomisticPrivatePositionTrajectoryControllerV048(
      fixture.session,
      fixture.sourceFrames,
    );
    metadata = createAtomisticPrivateBrowserPositionTrajectoryMetadataV049(
      source.handle.metadata,
    );
    positions = new Uint8Array(3_254_220);
    for (let frameOrdinal = 0; frameOrdinal < 101; frameOrdinal += 1) {
      const frameBytes = source.handle.copyFramePositionBytes(frameOrdinal);
      try {
        positions.set(frameBytes, frameOrdinal * 32_220);
      } finally {
        frameBytes.fill(0);
      }
    }
  } finally {
    source?.revoke();
    for (const frame of fixture.sourceFrames) frame.positionsF64LeBytes.fill(0);
  }
}, 60_000);

afterAll(() => {
  positions.fill(0);
});

describe.sequential('V049 private browser trajectory instancing runtime', () => {
  it('projects 0 -> 37 -> 37 -> 100 atomically and integrates structurally with Three V046', () => {
    const controller = createAtomisticPrivateBrowserPositionTrajectoryControllerV049(
      metadata,
      positions,
    );
    const plan = createAtomisticPrivateBrowserTrajectoryInstancingPlanV049(metadata);
    const core = new AtomisticPrivateBrowserTrajectoryInstancingRuntimeV049(plan);
    const three = new AtomisticThreeInstancedRuntimeV046(core);
    const identities = captureThreeIdentities(three);
    try {
      expect(plan).toMatchObject({
        role: 'sanitized-private-discrete-position-trajectory-gpu-instancing-plan-no-solver',
        inventory: {
          waterMoleculeCount: 895,
          oxygenCount: 895,
          hydrogenCount: 1_790,
          topologyLinkCount: 1_790,
          frameCount: 101,
        },
        scientificBoundary: {
          topologyLinksEnergetic: false,
          forceLayer: null,
          velocityLayer: null,
          electronicDensityLayer: null,
          createsSolverFrames: false,
          completePhysicalStateIncluded: false,
        },
      });

      const first = core.updatePrivatePositionFrameV049(controller.handle.getFrameHandle(0));
      expect(first).toMatchObject({
        previousSourceFrameOrdinal: null,
        sourceFrameOrdinal: 0,
        positionFrameDigest: metadata.sequence.frames[0].positionFrameDigest,
        sourceFrameAdvanced: false,
        sameSourceStateRepeated: false,
        atomicUpdate: true,
        createsSolverFrame: false,
        interpolationApplied: false,
        forceConsumed: false,
        velocityConsumed: false,
      });
      const upload0 = three.syncFromCore();
      expect(upload0).toMatchObject({
        sourceFrameOrdinal: 0,
        presentationFrameDigest: metadata.sequence.frames[0].positionFrameDigest,
        persistentInstancedMeshCount: 3,
        uploadedAtomInstanceCount: 2_685,
        uploadedTopologyBondInstanceCount: 1_790,
        webglOrWebgpuDrawExecuted: false,
        createsTrajectoryFrame: false,
      });

      const frame37 = core.updatePrivatePositionFrameV049(controller.handle.getFrameHandle(37));
      expect(frame37).toMatchObject({
        previousSourceFrameOrdinal: 0,
        sourceFrameOrdinal: 37,
        sourceFrameAdvanced: true,
        sameSourceStateRepeated: false,
      });
      three.syncFromCore();
      const beforeRepeat = core.snapshot();
      const repeat37 = core.updatePrivatePositionFrameV049(controller.handle.getFrameHandle(37));
      expect(repeat37).toMatchObject({
        previousSourceFrameOrdinal: 37,
        sourceFrameOrdinal: 37,
        sourceFrameAdvanced: false,
        sameSourceStateRepeated: true,
        createsSolverFrame: false,
        interpolationApplied: false,
      });
      three.syncFromCore();
      const afterRepeat = core.snapshot();
      expect(afterRepeat.displayPositionsNanometerByAtomIndex)
        .toEqual(beforeRepeat.displayPositionsNanometerByAtomIndex);
      expect(afterRepeat.atomMatricesByBatch[0].matrices)
        .toEqual(beforeRepeat.atomMatricesByBatch[0].matrices);
      zeroSnapshot(beforeRepeat);
      zeroSnapshot(afterRepeat);

      const frame100 = core.updatePrivatePositionFrameV049(controller.handle.getFrameHandle(100));
      expect(frame100).toMatchObject({
        previousSourceFrameOrdinal: 37,
        sourceFrameOrdinal: 100,
        sourceFrameAdvanced: true,
        sameSourceStateRepeated: false,
      });
      three.syncFromCore();
      expect(sameThreeIdentities(identities, three)).toBe(true);
      expect(three.uploadCount).toBe(4);
      expect(core.resolveAtomInstanceSelection('atom:O', 0)).toMatchObject({
        atomIndex: 0,
        atomId: 'tip3p-water-0:O',
        element: 'O',
      });
      expect(core.resolveAtomInstanceSelection('atom:H', 1_789)).toMatchObject({
        atomIndex: 2_684,
        atomId: 'tip3p-water-894:H2',
        element: 'H',
      });
    } finally {
      three.dispose();
      core.dispose();
      controller.revoke();
    }
    expect(three.disposed).toBe(true);
    expect(core.disposed).toBe(true);
  }, 30_000);

  it('keeps snapshots fresh and finite while applying the locked 3 nm minimum image', () => {
    const shifted = positions.slice();
    const shiftedView = new DataView(shifted.buffer);
    shiftedView.setFloat32(12, shiftedView.getFloat32(12, true) + 3, true);
    const shiftedMetadata = metadataForChangedFrame(shifted, 0);
    const controller = createAtomisticPrivateBrowserPositionTrajectoryControllerV049(
      shiftedMetadata,
      shifted,
    );
    const core = new AtomisticPrivateBrowserTrajectoryInstancingRuntimeV049(
      createAtomisticPrivateBrowserTrajectoryInstancingPlanV049(shiftedMetadata),
    );
    try {
      core.updatePrivatePositionFrameV049(controller.handle.getFrameHandle(0));
      const first = core.snapshot();
      const second = core.snapshot();
      expect(first.atomMatricesByBatch[0].matrices).not.toBe(second.atomMatricesByBatch[0].matrices);
      expect(first.topologyBondMatrices).not.toBe(second.topologyBondMatrices);
      for (const array of snapshotArrays(first)) {
        expect(array.every((value) => Number.isFinite(value))).toBe(true);
      }
      const oxygenX = first.displayPositionsNanometerByAtomIndex[0];
      const hydrogenX = first.displayPositionsNanometerByAtomIndex[3];
      expect(hydrogenX - oxygenX).toBeCloseTo(0.09572, 5);
      expect(Math.hypot(
        first.topologyBondMatrices[4],
        first.topologyBondMatrices[5],
        first.topologyBondMatrices[6],
      )).toBeCloseTo(0.09572, 5);
      first.atomMatricesByBatch[0].matrices.fill(0);
      first.topologyBondMatrices.fill(0);
      first.displayPositionsNanometerByAtomIndex.fill(0);
      expect(second.atomMatricesByBatch[0].matrices.some((value) => value !== 0)).toBe(true);
      expect(second.displayPositionsNanometerByAtomIndex.some((value) => value !== 0)).toBe(true);
      zeroSnapshot(first);
      zeroSnapshot(second);
    } finally {
      core.dispose();
      controller.revoke();
      shifted.fill(0);
    }
  }, 30_000);

  it('rejects foreign plans, wrong bindings, corrupted bytes, and revoked handles atomically', () => {
    const controller = createAtomisticPrivateBrowserPositionTrajectoryControllerV049(
      metadata,
      positions,
    );
    const plan = createAtomisticPrivateBrowserTrajectoryInstancingPlanV049(metadata);
    expect(() => new AtomisticPrivateBrowserTrajectoryInstancingRuntimeV049(
      structuredClone(plan) as AtomisticPrivateBrowserTrajectoryInstancingPlanV049,
    )).toThrow(/factory identity/);
    const core = new AtomisticPrivateBrowserTrajectoryInstancingRuntimeV049(plan);
    try {
      core.updatePrivatePositionFrameV049(controller.handle.getFrameHandle(0));
      const before = core.snapshot();
      let wrongBindingCopyCalls = 0;
      const source37 = controller.handle.getFrameHandle(37);
      const wrongBinding = {
        ...source37,
        binding: {
          ...source37.binding,
          sessionDigest: digestValue({ wrong: 'trajectory-binding' }),
        },
        copyPositionBytes() {
          wrongBindingCopyCalls += 1;
          return source37.copyPositionBytes();
        },
      } as AtomisticPrivateBrowserPositionTrajectoryFrameHandleV049;
      expect(() => core.updatePrivatePositionFrameV049(wrongBinding)).toThrow(/not bound/);
      expect(wrongBindingCopyCalls).toBe(0);

      const corrupted = {
        ...source37,
        copyPositionBytes() {
          const bytes = source37.copyPositionBytes();
          bytes[17] ^= 1;
          return bytes;
        },
      } as AtomisticPrivateBrowserPositionTrajectoryFrameHandleV049;
      expect(() => core.updatePrivatePositionFrameV049(corrupted)).toThrow(/bytes changed/);

      const revoked100 = controller.handle.getFrameHandle(100);
      controller.revoke();
      expect(() => core.updatePrivatePositionFrameV049(revoked100)).toThrow(/active frame handle/);
      const after = core.snapshot();
      expect(after.sourceFrameOrdinal).toBe(before.sourceFrameOrdinal);
      expect(after.presentationFrameDigest).toBe(before.presentationFrameDigest);
      expect(after.displayPositionsNanometerByAtomIndex)
        .toEqual(before.displayPositionsNanometerByAtomIndex);
      zeroSnapshot(before);
      zeroSnapshot(after);
    } finally {
      core.dispose();
      controller.revoke();
    }
  }, 30_000);

  it('zero-fills current and staging buffers on idempotent dispose', async () => {
    const originalFill = Float32Array.prototype.fill;
    const fills: Array<{ length: number; allZero: boolean }> = [];
    Float32Array.prototype.fill = function auditedFill(...args) {
      const result = originalFill.apply(this, args);
      fills.push({ length: this.length, allZero: this.every((value) => value === 0) });
      return result;
    };
    let auditedModule: typeof import(
      './atomistic-private-browser-trajectory-instancing-runtime-v049.ts'
    );
    try {
      // @ts-expect-error Vitest query imports intentionally create an isolated module instance.
      auditedModule = await import('./atomistic-private-browser-trajectory-instancing-runtime-v049.ts?dispose-zeroization-audit');
    } finally {
      Float32Array.prototype.fill = originalFill;
    }
    const controller = createAtomisticPrivateBrowserPositionTrajectoryControllerV049(
      metadata,
      positions,
    );
    const core = new auditedModule.AtomisticPrivateBrowserTrajectoryInstancingRuntimeV049(
      auditedModule.createAtomisticPrivateBrowserTrajectoryInstancingPlanV049(metadata),
    );
    core.updatePrivatePositionFrameV049(controller.handle.getFrameHandle(0));
    fills.length = 0;
    core.dispose();
    const firstDisposeFillCount = fills.length;
    core.dispose();
    expect(fills).toHaveLength(firstDisposeFillCount);
    expect(fills.every((entry) => entry.allZero)).toBe(true);
    for (const length of [895 * 16, 1_790 * 16, 8_055]) {
      expect(fills.some((entry) => entry.length === length)).toBe(true);
    }
    expect(core.disposed).toBe(true);
    expect(() => core.snapshot()).toThrow(/disposed/);
    expect(() => core.resolveAtomInstanceSelection('atom:O', 0)).toThrow(/disposed/);
    expect(() => core.updatePrivatePositionFrameV049(controller.handle.getFrameHandle(0)))
      .toThrow(/disposed/);
    controller.revoke();
  }, 30_000);
});

function metadataForChangedFrame(bytes: Uint8Array, frameOrdinal: number) {
  const candidate = structuredClone(metadata) as unknown as MutableMetadata;
  const frame = candidate.sequence.frames[frameOrdinal];
  frame.positionsDerivedF32Digest = digestBytes(bytes.subarray(
    frame.byteOffset,
    frame.byteOffset + frame.byteLength,
  ));
  const framePayload = {
    frameOrdinal: frame.frameOrdinal,
    step: frame.step,
    timePicoseconds: frame.timePicoseconds,
    sourceFrameDigest: frame.sourceFrameDigest,
    positionsDerivedF32Digest: frame.positionsDerivedF32Digest,
    byteOffset: frame.byteOffset,
    byteLength: frame.byteLength,
  };
  frame.positionFrameDigest = createAtomisticPrivateBrowserPositionFrameDigestV049(
    candidate.binding,
    framePayload,
  );
  candidate.sequence.orderedPositionFrameDigest =
    createAtomisticPrivateBrowserOrderedPositionFrameDigestV049(candidate.sequence.frames);
  candidate.positionChannel.sha256 = digestBytes(bytes);
  const payload = { ...candidate };
  Reflect.deleteProperty(payload, 'metadataDigest');
  candidate.metadataDigest = digestValue(payload);
  return assertAtomisticPrivateBrowserPositionTrajectoryMetadataV049(candidate);
}

function captureThreeIdentities(runtime: AtomisticThreeInstancedRuntimeV046) {
  return {
    group: runtime.group,
    oxygen: runtime.oxygenAtoms,
    hydrogen: runtime.hydrogenAtoms,
    links: runtime.topologyBonds,
    oxygenMatrix: runtime.oxygenAtoms.instanceMatrix,
    hydrogenMatrix: runtime.hydrogenAtoms.instanceMatrix,
    linkMatrix: runtime.topologyBonds.instanceMatrix,
  };
}

function sameThreeIdentities(
  expected: ReturnType<typeof captureThreeIdentities>,
  runtime: AtomisticThreeInstancedRuntimeV046,
) {
  return expected.group === runtime.group
    && expected.oxygen === runtime.oxygenAtoms
    && expected.hydrogen === runtime.hydrogenAtoms
    && expected.links === runtime.topologyBonds
    && expected.oxygenMatrix === runtime.oxygenAtoms.instanceMatrix
    && expected.hydrogenMatrix === runtime.hydrogenAtoms.instanceMatrix
    && expected.linkMatrix === runtime.topologyBonds.instanceMatrix;
}

function snapshotArrays(snapshot: ReturnType<
  AtomisticPrivateBrowserTrajectoryInstancingRuntimeV049['snapshot']
>) {
  return [
    snapshot.atomMatricesByBatch[0].matrices,
    snapshot.atomMatricesByBatch[1].matrices,
    snapshot.topologyBondMatrices,
    snapshot.displayPositionsNanometerByAtomIndex,
  ];
}

function zeroSnapshot(snapshot: ReturnType<
  AtomisticPrivateBrowserTrajectoryInstancingRuntimeV049['snapshot']
>) {
  for (const values of snapshotArrays(snapshot)) values.fill(0);
}

function digestBytes(bytes: Uint8Array) {
  return `sha256:${bytesToHex(sha256(bytes))}`;
}
