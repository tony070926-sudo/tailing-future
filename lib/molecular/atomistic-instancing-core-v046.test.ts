import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { getAtomisticWorldSessionFrameV045, type AtomisticWorldSessionV045 }
  from '../simulation/atomistic-world-session.ts';
import type { AtomisticPresentationFrameHandleV046 }
  from '../simulation/atomistic-presentation-frame.ts';
import {
  ATOMISTIC_INSTANCING_BODY_DRAW_CALL_LIMIT_V046,
  ATOMISTIC_INSTANCING_PARTICLE_COUNT_V046,
  ATOMISTIC_INSTANCING_TOPOLOGY_BOND_COUNT_V046,
  AtomisticInstancingRuntimeV046,
  computeAtomisticInstancingDrawCallUpperBoundV046,
  createAtomisticInstancingPlanV046,
  resolveAtomIndexSelectionV046,
  resolveAtomInstanceSelectionV046,
} from './atomistic-instancing-core-v046.ts';
import {
  createAtomisticInstancingPresentationControllerV046,
  createAtomisticInstancingPresentationHandleV046,
  createAtomisticInstancingWorldFixtureV046,
  digestAtomisticInstancingFixtureBytesV046,
} from './atomistic-instancing-v046.test-fixture.ts';

describe('v0.4.6 digest-bound atomistic instancing core', () => {
  it('derives exact topology and 101 frame bindings from a validated V045 session', () => {
    const fixture = createAtomisticInstancingWorldFixtureV046('inventory');
    const plan = createAtomisticInstancingPlanV046(fixture.session);
    expect(plan.sourceBinding).toMatchObject({
      sourceVersion: 'tf.atomistic-world-session/0.4.5',
      sessionId: fixture.session.sessionId,
      sessionDigest: fixture.session.sessionDigest,
      trajectoryDigest: fixture.session.trajectory.trajectoryDigest,
      atomOrderDigest: fixture.session.atomOrder.atomOrderDigest,
      cellDigest: fixture.session.cell.cellDigest,
      topologyDigest: fixture.session.topology.topologyDigest,
      executionAuthenticityVerified: false,
      promotionEligible: false,
      sourceLicenseForPublicDistributionVerified: false,
      publicDistributionEligible: false,
    });
    expect(plan.inventory).toEqual({
      waterMoleculeCount: 895, particleCount: 2_685, oxygenCount: 895,
      hydrogenCount: 1_790, topologyBondCount: 1_790, frameCount: 101,
    });
    expect(plan.atomBatches.map((batch) => [batch.batchId, batch.instanceCount])).toEqual([
      ['atom:O', 895], ['atom:H', 1_790],
    ]);
    expect(plan.bondBatches[0]).toMatchObject({
      batchId: 'bond:water-oh-topology', instanceCount: 1_790, energeticInteraction: false,
      semanticRole: 'topology-adjacency-and-rigid-distance-constraint-not-energetic-bond',
      periodicPlacement: 'source-unwrapped-oxygen-anchor-plus-cubic-minimum-image-internal-sites',
    });
    expect(plan.bondBatches[0].atomIndexPairsByInstance.slice(0, 4)).toEqual([
      [0, 1], [0, 2], [3, 4], [3, 5],
    ]);
    expect(plan.frameBindings).toHaveLength(101);
    expect(plan.frameBindings[0]).toMatchObject({
      frameOrdinal: 0,
      frameDigest: getAtomisticWorldSessionFrameV045(fixture.session, 0).frameDigest,
      positionsSourceF64Digest:
        digestAtomisticInstancingFixtureBytesV046(fixture.raw.positionsNanometer),
      topologyDigest: fixture.session.topology.topologyDigest,
      positionsShape: [2_685, 3],
    });
    expect(Object.isFrozen(plan)).toBe(true);
    expect(Object.isFrozen(plan.atomBatches[0].atomIndicesByInstance)).toBe(true);
  });

  it('uses three body draw calls and five with overlays, below the locked limit', () => {
    const plan = createAtomisticInstancingPlanV046(
      createAtomisticInstancingWorldFixtureV046('calls').session,
    );
    const body = computeAtomisticInstancingDrawCallUpperBoundV046(plan, {
      atoms: true, topologyBonds: true, selectionOverlay: false, periodicCellOverlay: false,
    });
    const all = computeAtomisticInstancingDrawCallUpperBoundV046(plan, {
      atoms: true, topologyBonds: true, selectionOverlay: true, periodicCellOverlay: true,
    });
    expect(body.upperBound).toBe(3);
    expect(all.upperBound).toBe(5);
    expect(all.upperBound).toBeLessThanOrEqual(ATOMISTIC_INSTANCING_BODY_DRAW_CALL_LIMIT_V046);
    expect(all.boundary).toBe('static-upper-bound-not-measured-fps-or-runtime-performance');
  });

  it('keeps selection stable and binds it to atom-order and topology digests', () => {
    const fixture = createAtomisticInstancingWorldFixtureV046('selection');
    const plan = createAtomisticInstancingPlanV046(fixture.session);
    const runtime = new AtomisticInstancingRuntimeV046(plan);
    const oxygen = resolveAtomInstanceSelectionV046(plan, 'atom:O', 0);
    const hydrogen = resolveAtomInstanceSelectionV046(plan, 'atom:H', 0);
    expect(oxygen).toEqual({
      batchId: 'atom:O', instanceId: 0, atomIndex: 0,
      atomId: 'tip3p-water-0:O', moleculeId: 'tip3p-water-0', element: 'O',
      atomOrderDigest: fixture.session.atomOrder.atomOrderDigest,
      topologyDigest: fixture.session.topology.topologyDigest,
      mappingSemantics: 'stable-instance-to-authoritative-zero-based-pdb-record-order',
    });
    expect(hydrogen).toMatchObject({ atomIndex: 1, atomId: 'tip3p-water-0:H1' });
    runtime.update(createAtomisticInstancingPresentationHandleV046(fixture, 0));
    runtime.update(createAtomisticInstancingPresentationHandleV046(fixture, 100));
    expect(resolveAtomInstanceSelectionV046(plan, 'atom:O', 0)).toEqual(oxygen);
    expect(resolveAtomInstanceSelectionV046(plan, 'atom:H', 0)).toEqual(hydrogen);
    expect(resolveAtomIndexSelectionV046(plan, 2)).toMatchObject({
      batchId: 'atom:H', instanceId: 1, atomIndex: 2, atomId: 'tip3p-water-0:H2',
    });
    expect(() => resolveAtomInstanceSelectionV046(plan, 'atom:O', 895)).toThrow(
      /outside the declared batch/,
    );
  });

  it('reconstructs an intact O-H link through the locked cubic periodic face', () => {
    const fixture = createAtomisticInstancingWorldFixtureV046('periodic');
    const plan = createAtomisticInstancingPlanV046(fixture.session);
    const runtime = new AtomisticInstancingRuntimeV046(plan);
    const handle = createAtomisticInstancingPresentationHandleV046(fixture, 0);
    const receipt = runtime.update(handle);
    const snapshot = runtime.snapshot();
    expect(receipt).toMatchObject({
      sourceFrameOrdinal: 0,
      sourceFrameDigest: handle.metadata.binding.frameDigest,
      presentationFrameDigest: handle.metadata.presentationFrameDigest,
      positionsSourceF64Digest: handle.metadata.channels.positionsNanometer.source.sha256,
      positionsDerivedF32Digest: handle.metadata.channels.positionsNanometer.derived.sha256,
      positionGauge: 'source-unwrapped-oxygen-anchor-with-cubic-minimum-image-internal-sites',
      atomicUpdate: true, physicalWorldState: false, forcesConsumed: false,
      velocitiesConsumed: false, fieldsConsumed: false,
      publicDistributionEligible: false, performanceClaim: null,
    });
    expect(Object.isFrozen(receipt)).toBe(true);
    const displayed = snapshot.displayPositionsNanometerByAtomIndex;
    expect(displayed[0]).toBeCloseTo(2.98, 5);
    expect(displayed[3]).toBeCloseTo(3.07572, 5);
    expect(displayed[3] - displayed[0]).toBeCloseTo(0.09572, 5);
    const firstBond = snapshot.topologyBondMatrices.subarray(0, 16);
    expect(Math.hypot(firstBond[4], firstBond[5], firstBond[6])).toBeCloseTo(0.09572, 5);
    expect(firstBond[12]).toBeCloseTo((2.98 + 3.07572) / 2, 5);
  });

  it('owns runtime buffers privately and exposes mutation-isolated snapshots', () => {
    const fixture = createAtomisticInstancingWorldFixtureV046('ownership');
    const runtime = new AtomisticInstancingRuntimeV046(
      createAtomisticInstancingPlanV046(fixture.session),
    );
    const handle = createAtomisticInstancingPresentationHandleV046(fixture, 0);
    runtime.update(handle);
    const first = runtime.snapshot();
    const expectedPosition = first.displayPositionsNanometerByAtomIndex[0];
    const expectedMatrix = first.atomMatricesByBatch[0].matrices[0];
    first.displayPositionsNanometerByAtomIndex[0] = 123_456;
    first.atomMatricesByBatch[0].matrices[0] = 123_456;
    first.topologyBondMatrices[0] = 123_456;
    handle.copyChannelBytes('positionsNanometer').fill(0xff);
    const fresh = runtime.snapshot();
    expect(fresh.ownership).toBe('fresh-copy-snapshot-mutation-does-not-affect-runtime');
    expect(fresh.presentationFrameDigest).toBe(handle.metadata.presentationFrameDigest);
    expect(fresh.positionsDerivedF32Digest).toBe(
      handle.metadata.channels.positionsNanometer.derived.sha256,
    );
    expect(fresh.publicDistributionEligible).toBe(false);
    expect(fresh.displayPositionsNanometerByAtomIndex[0]).toBe(expectedPosition);
    expect(fresh.atomMatricesByBatch[0].matrices[0]).toBe(expectedMatrix);
    expect(fresh.topologyBondMatrices[0]).not.toBe(123_456);
    expect(fresh.atomMatricesByBatch[0].matrices).toHaveLength(895 * 16);
    expect(fresh.atomMatricesByBatch[1].matrices).toHaveLength(1_790 * 16);
    expect(fresh.topologyBondMatrices).toHaveLength(1_790 * 16);
    expect(fresh.displayPositionsNanometerByAtomIndex).toHaveLength(2_685 * 3);
  });

  it('fails closed on a tampered session instead of caller-composed topology', () => {
    const fixture = createAtomisticInstancingWorldFixtureV046('session-gate');
    const tampered = structuredClone(fixture.session) as unknown as {
      topology: { topologyBondCount: number };
    };
    tampered.topology.topologyBondCount = 1_789;
    expect(() => createAtomisticInstancingPlanV046(
      tampered as unknown as AtomisticWorldSessionV045,
    )).toThrow();
    expect(() => createAtomisticInstancingPlanV046({} as AtomisticWorldSessionV045)).toThrow();
  });

  it('rejects cross-session, altered-byte, and SharedArrayBuffer handles atomically', () => {
    const fixture = createAtomisticInstancingWorldFixtureV046('runtime-gates');
    const runtime = new AtomisticInstancingRuntimeV046(
      createAtomisticInstancingPlanV046(fixture.session),
    );
    const valid = createAtomisticInstancingPresentationHandleV046(fixture, 0);
    runtime.update(valid);
    const stable = runtime.snapshot();
    const other = createAtomisticInstancingWorldFixtureV046('other-session');
    expect(() => runtime.update(
      createAtomisticInstancingPresentationHandleV046(other, 0),
    )).toThrow(/source session|bound/i);

    const revoked = createAtomisticInstancingPresentationControllerV046(fixture, 100);
    revoked.revoke();
    expect(() => runtime.update(revoked.handle)).toThrow(/revoked/);

    const altered = valid.copyChannelBytes('positionsNanometer');
    altered[0] ^= 1;
    const forged = Object.freeze({
      ...valid,
      copyChannelBytes: () => altered.slice(),
    }) as AtomisticPresentationFrameHandleV046;
    expect(() => runtime.update(forged)).toThrow(/derived digest/);
    if (typeof SharedArrayBuffer !== 'undefined') {
      const source = valid.copyChannelBytes('positionsNanometer');
      const shared = new Uint8Array(new SharedArrayBuffer(source.byteLength));
      shared.set(source);
      const sharedHandle = Object.freeze({
        ...valid,
        copyChannelBytes: () => shared,
      }) as AtomisticPresentationFrameHandleV046;
      expect(() => runtime.update(sharedHandle)).toThrow(/stable ArrayBuffer|shared or resizable/);
    }
    const after = runtime.snapshot();
    expect(after.sourceFrameDigest).toBe(stable.sourceFrameDigest);
    expect(after.presentationFrameDigest).toBe(stable.presentationFrameDigest);
    expect(after.atomMatricesByBatch[0].matrices).toEqual(stable.atomMatricesByBatch[0].matrices);
    expect(after.atomMatricesByBatch[1].matrices).toEqual(stable.atomMatricesByBatch[1].matrices);
    expect(after.topologyBondMatrices).toEqual(stable.topologyBondMatrices);
    expect(after.displayPositionsNanometerByAtomIndex).toEqual(
      stable.displayPositionsNanometerByAtomIndex,
    );
  });

  it('keeps unsupported science and public distribution unavailable', () => {
    const plan = createAtomisticInstancingPlanV046(
      createAtomisticInstancingWorldFixtureV046('boundaries').session,
    );
    expect(plan.scientificBoundary).toEqual({
      renderedPhysicalChannel: 'digest-bound-source-position-f32-presentation-derivative-only',
      topologyLayoutAuthority: 'locked-tip3p-pdb-o-h-h-record-order-two-oh-links-per-water',
      topologyBondMeaning: 'adjacency-and-rigid-constraint-not-energetic-bond-or-bond-order',
      forceLayer: null, velocityLayer: null, fieldLayer: null, electronicDensityLayer: null,
      motionSynthesis: null, frameInterpolation: null,
      forceSemanticsIfLaterIntegrated: 'total-potential-force-excluding-constraint-impulses',
      velocitySemanticsIfLaterIntegrated:
        'raw-openmm-verlet-half-step-not-consumed-by-this-plan',
      systemClaim: '895-tip3p-water-pme-control-not-bulk-water-not-solution-not-nacl',
      framesCreatedByThisModule: false, publicDistributionEligible: false,
    });
  });

  it('creates no Three.js import or per-atom Mesh, Geometry, or Material', () => {
    const source = readFileSync(new URL('./atomistic-instancing-core-v046.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/from ['"]three/);
    expect(source).not.toMatch(
      /new\s+(?:[A-Za-z0-9_$]+\.)?(?:Mesh|InstancedMesh|\w*Geometry|\w*Material)\s*\(/,
    );
    expect(ATOMISTIC_INSTANCING_PARTICLE_COUNT_V046).toBe(2_685);
    expect(ATOMISTIC_INSTANCING_TOPOLOGY_BOND_COUNT_V046).toBe(1_790);
  });
});
