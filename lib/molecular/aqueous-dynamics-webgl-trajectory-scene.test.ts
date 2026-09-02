import { beforeAll, describe, expect, it } from 'vitest';
import { digestValue } from '../simulation/digest.ts';
import {
  createAqueousDynamicsRenderTrajectoryV043,
  type AqueousDynamicsRenderTrajectoryV043,
} from './aqueous-dynamics-render-frame.ts';
import {
  assertAqueousDynamicsWebglSceneV043,
  createAqueousDynamicsWebglSceneFromTrajectoryV043,
  type AqueousDynamicsWebglSceneV043,
} from './aqueous-dynamics-webgl-scene.ts';

type Mutable<Value> = { -readonly [Key in keyof Value]: Value[Key] };

let trajectory: AqueousDynamicsRenderTrajectoryV043;

beforeAll(() => {
  trajectory = createAqueousDynamicsRenderTrajectoryV043(10);
});

describe('aqueous dynamics v0.4.3 exact-trajectory WebGL projection', () => {
  it('binds selected exact endpoints to their trajectory bundle and sample digests', () => {
    for (const sampleIndex of [0, 5, 10]) {
      const sample = trajectory.samples[sampleIndex];
      const scene = createAqueousDynamicsWebglSceneFromTrajectoryV043(
        trajectory,
        sampleIndex,
        'water-a-o',
      );

      expect(scene).toMatchObject({
        schemaVersion: 'tf.aqueous-dynamics-webgl-scene/0.4.3',
        stateId: sample.stateId,
        stateDigest: sample.stateDigest,
        physicalDigest: sample.physicalDigest,
        step: sample.step,
        timePicoseconds: sample.timePicoseconds,
        sourceBinding: {
          renderDigest: sample.renderFrame.renderDigest,
          observationDigest: sample.observationDigest,
          stateDigest: sample.stateDigest,
          physicalDigest: sample.physicalDigest,
          step: sample.step,
          trajectoryDigest: trajectory.trajectoryDigest,
          trajectoryBundleDigest: trajectory.bundleDigest,
          trajectorySampleDigest: sample.sampleDigest,
          trajectorySampleIndex: sampleIndex,
          selectedAtomId: 'water-a-o',
        },
      });
      expect(scene.sourceBinding.coordinateGauge).toBe(scene.projection.coordinateGauge);
      expect(scene.sourceBindingDigest).toBe(digestValue(scene.sourceBinding));
      const { sceneDigest, ...payload } = scene;
      expect(sceneDigest).toBe(digestValue(payload));
      expect(() => assertAqueousDynamicsWebglSceneV043(
        scene,
        trajectory,
        sampleIndex,
        'water-a-o',
      )).not.toThrow();
    }
  });

  it('uses exact source-unwrapped coordinates in one fixed display gauge epoch', () => {
    for (const sampleIndex of [0, 5, 10]) {
      const sample = trajectory.samples[sampleIndex];
      const scene = createAqueousDynamicsWebglSceneFromTrajectoryV043(
        trajectory,
        sampleIndex,
      );
      expect(scene.projection.coordinateGauge).toMatchObject({
        kind: 'source-unwrapped-fixed-trajectory-epoch-gauge',
        gaugeEpoch: 0,
        gaugeEpochBoundary: 'source-unwrapped-images-no-display-rebase',
        sourceCoordinate: 'molecule-anchor-unwrapped-plus-minimum-image-internal-sites',
        globalLatticeImageShift: { x: 0, y: 0, z: 0 },
      });
      expect(scene.atomSpheres).toHaveLength(8);
      for (const sphere of scene.atomSpheres) {
        const molecule = sample.renderFrame.molecules
          .find((candidate) => candidate.id === sphere.moleculeId)!;
        const placement = molecule.continuousAtoms
          .find((candidate) => candidate.atomId === sphere.atomId)!;
        const gauge = scene.projection.coordinateGauge.moleculeLatticeShifts
          .find((entry) => entry.moleculeId === molecule.id)!;
        expect(sphere.positionAngstrom).toEqual({
          x: placement.positionAngstrom.x + gauge.translationAngstrom.x,
          y: placement.positionAngstrom.y + gauge.translationAngstrom.y,
          z: placement.positionAngstrom.z + gauge.translationAngstrom.z,
        });
      }
      for (const molecule of sample.renderFrame.molecules) {
        const gauge = scene.projection.coordinateGauge.moleculeLatticeShifts
          .find((entry) => entry.moleculeId === molecule.id)!;
        const anchor = sample.renderFrame.atoms.find((atom) => atom.id === gauge.anchorAtomId)!;
        const anchorSphere = scene.atomSpheres.find((atom) => atom.atomId === gauge.anchorAtomId)!;
        expect(gauge.latticeImageShift).toEqual(anchor.image);
        expect(anchorSphere.positionAngstrom).toEqual(anchor.unwrappedPositionAngstrom);
      }
    }
  });

  it('moves only the display selection while preserving every trajectory digest', () => {
    const before = structuredClone(trajectory);
    const unselected = createAqueousDynamicsWebglSceneFromTrajectoryV043(trajectory, 7);
    const selected = createAqueousDynamicsWebglSceneFromTrajectoryV043(
      trajectory,
      7,
      'sodium-na',
    );
    expect(selected.stateDigest).toBe(unselected.stateDigest);
    expect(selected.physicalDigest).toBe(unselected.physicalDigest);
    expect(selected.sourceBinding.trajectorySampleDigest)
      .toBe(unselected.sourceBinding.trajectorySampleDigest);
    expect(selected.sceneDigest).not.toBe(unselected.sceneDigest);
    expect(trajectory).toEqual(before);
  });

  it('rejects an unbranded trajectory clone before scene projection', () => {
    const clone = deepFreeze(structuredClone(trajectory));
    expect(() => createAqueousDynamicsWebglSceneFromTrajectoryV043(clone, 0))
      .toThrow(/created or independently replay-validated locally/);
  });

  it('rejects a frozen scene forgery even after its outer scene digest is recomputed', () => {
    const scene = createAqueousDynamicsWebglSceneFromTrajectoryV043(
      trajectory,
      4,
      'chloride-cl',
    );
    const forged = structuredClone(scene) as Mutable<AqueousDynamicsWebglSceneV043>;
    const spheres = forged.atomSpheres as Array<Mutable<typeof forged.atomSpheres[number]>>;
    const position = spheres[0].positionAngstrom as Mutable<typeof spheres[0]['positionAngstrom']>;
    position.x += 1e-6;
    const { sceneDigest: _oldDigest, ...payload } = forged;
    void _oldDigest;
    forged.sceneDigest = digestValue(payload);
    deepFreeze(forged);
    expect(() => assertAqueousDynamicsWebglSceneV043(
      forged,
      trajectory,
      4,
      'chloride-cl',
    )).toThrow(/positionAngstrom\.x primitive value is not exact/);
  });

  it('rejects invalid display sample indices without changing the trajectory', () => {
    const digestBefore = trajectory.bundleDigest;
    expect(() => createAqueousDynamicsWebglSceneFromTrajectoryV043(trajectory, -1))
      .toThrow(/outside the executed endpoint range/);
    expect(() => createAqueousDynamicsWebglSceneFromTrajectoryV043(trajectory, 11))
      .toThrow(/outside the executed endpoint range/);
    expect(() => createAqueousDynamicsWebglSceneFromTrajectoryV043(trajectory, 1.5))
      .toThrow(/outside the executed endpoint range/);
    expect(trajectory.bundleDigest).toBe(digestBefore);
  });
});

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
