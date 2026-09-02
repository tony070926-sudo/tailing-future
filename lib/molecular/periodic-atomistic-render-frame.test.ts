import { describe, expect, it } from 'vitest';
import { createPeriodicArgonCalibrationWorld } from '../simulation/periodic-atomistic-world.ts';
import { buildWrappedTrajectorySegments, createPeriodicAtomisticRenderFrame } from './periodic-atomistic-render-frame.ts';

describe('periodic atomistic render adapter', () => {
  it('derives every visible atom, neighbor image and fixed cell vertex from one immutable observation', () => {
    const world = createPeriodicArgonCalibrationWorld();
    const observation = world.observe();
    const before = world.serialize();
    const frame = createPeriodicAtomisticRenderFrame(observation);
    expect(frame.stateDigest).toBe(observation.stateDigest);
    expect(frame.physicalDigest).toBe(observation.physicalDigest);
    expect(frame.atoms).toHaveLength(32);
    expect(frame.cell.verticesAngstrom).toHaveLength(8);
    expect(frame.neighborEdges).toHaveLength(observation.neighborList.activePairCount);
    for (const edge of frame.neighborEdges) {
      const delta = subtract(edge.atomBImagePositionAngstrom, edge.atomAPositionAngstrom);
      expect(Math.hypot(delta.x, delta.y, delta.z)).toBeCloseTo(edge.distanceAngstrom, 11);
    }
    expect(world.serialize()).toEqual(before);
  });

  it('breaks wrapped trails at face crossings instead of drawing a false cell-spanning diagonal', () => {
    const world = createPeriodicArgonCalibrationWorld();
    const frames = [createPeriodicAtomisticRenderFrame(world.observe())];
    let crossed = false;
    for (let batch = 0; batch < 12 && !crossed; batch += 1) {
      const observation = world.advance(100);
      frames.push(createPeriodicAtomisticRenderFrame(observation));
      crossed = observation.events.faceCrossingCount > 0;
    }
    expect(crossed).toBe(true);
    const atomWithCrossing = frames.at(-1)!.atoms.find((atom, index) => {
      const initial = frames[0].atoms[index];
      return atom.image.x !== initial.image.x || atom.image.y !== initial.image.y || atom.image.z !== initial.image.z;
    });
    expect(atomWithCrossing).toBeDefined();
    const segments = buildWrappedTrajectorySegments(frames, atomWithCrossing!.id);
    expect(segments.length).toBeGreaterThan(1);
  });
});

function subtract(left: { x: number; y: number; z: number }, right: { x: number; y: number; z: number }) {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}
