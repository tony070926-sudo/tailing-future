import { describe, expect, it } from 'vitest';
import {
  createNaclRocksaltScene,
  createWaterDimerScene,
  type MolecularScene,
  type Vector3,
} from '../../lib/molecular/molecular-interactions';
import {
  MOLECULAR_REFERENCE_CONTRACTS,
  deriveMolecularReferenceGeometry,
  deriveWaterDonorAcceptorAxis,
  deriveWaterValenceFrames,
} from './molecular-visual-guides';

describe('molecular visual guide derivation', () => {
  it('builds two finite, normalized water frames with the declared ideal lone-pair convention', () => {
    const frames = deriveWaterValenceFrames(createWaterDimerScene());
    expect(frames).toHaveLength(2);
    frames.forEach((frame) => {
      [...frame.bondDirections, ...frame.lonePairDirections].forEach((direction) => {
        expect(length(direction)).toBeCloseTo(1, 12);
        expect(Object.values(direction).every(Number.isFinite)).toBe(true);
      });
      expect(angleDegrees(frame.lonePairDirections[0], frame.lonePairDirections[1])).toBeCloseTo(109.4712, 4);
    });
  });

  it('is covariant under a rigid rotation and translation of the scene coordinates', () => {
    const source = createWaterDimerScene({ oxygenSeparationAngstrom: 3.1, donorAngleDegrees: 17 });
    const radians = 37 * Math.PI / 180;
    const translation = { x: 2.3, y: -1.7, z: 0.8 };
    const rotate = (vector: Vector3): Vector3 => ({
      x: vector.x * Math.cos(radians) - vector.y * Math.sin(radians),
      y: vector.x * Math.sin(radians) + vector.y * Math.cos(radians),
      z: vector.z,
    });
    const transform = (vector: Vector3): Vector3 => add(rotate(vector), translation);
    const transformed: MolecularScene = {
      ...source,
      atoms: source.atoms.map((atom) => ({ ...atom, positionAngstrom: transform(atom.positionAngstrom) })),
    };
    const originalFrames = deriveWaterValenceFrames(source);
    const transformedFrames = deriveWaterValenceFrames(transformed);
    expect(transformedFrames).toHaveLength(originalFrames.length);
    originalFrames.forEach((frame) => {
      const transformedFrame = transformedFrames.find((candidate) => candidate.oxygenAtomId === frame.oxygenAtomId);
      expect(transformedFrame).toBeDefined();
      expectVectorClose(transformedFrame!.oxygenPositionAngstrom, transform(frame.oxygenPositionAngstrom));
      frame.bondDirections.forEach((direction, index) => expectVectorClose(transformedFrame!.bondDirections[index], rotate(direction)));
      frame.lonePairDirections.forEach((direction, index) => expectVectorClose(transformedFrame!.lonePairDirections[index], rotate(direction)));
    });
  });

  it('fails safely for a degenerate water group instead of emitting non-finite guides', () => {
    const source = createWaterDimerScene();
    const oxygen = source.atoms.find((atom) => atom.id === 'water-a-o')!;
    const degenerate: MolecularScene = {
      ...source,
      atoms: source.atoms.map((atom) => atom.groupId === 'water-a' && atom.element === 'H'
        ? { ...atom, positionAngstrom: oxygen.positionAngstrom }
        : atom),
    };
    const frames = deriveWaterValenceFrames(degenerate);
    expect(frames.map((frame) => frame.oxygenAtomId)).toEqual(['water-b-o']);
    expect(deriveWaterDonorAcceptorAxis(degenerate, frames)).toBeNull();
  });

  it('selects the nearest derived lone-pair axis and reports rather than invents alignment', () => {
    const guide = deriveWaterDonorAcceptorAxis(createWaterDimerScene());
    expect(guide).not.toBeNull();
    expect(guide!.donorHydrogenAcceptorAngleDegrees).toBeCloseTo(180, 8);
    expect(guide!.lonePairToContactAngleDegrees).toBeGreaterThan(60);
    expect(guide!.lonePairToContactAngleDegrees).toBeLessThan(80);
    expect(guide!.axesCollinearWithinFiveDegrees).toBe(false);
    expect(angleDegrees(guide!.selectedLonePairDirection, guide!.acceptorToHydrogenDirection))
      .toBeCloseTo(guide!.lonePairToContactAngleDegrees, 10);
  });

  it('returns no electronic reference primitives for NaCl and keeps scene identity untouched', () => {
    const scene = createNaclRocksaltScene({ selectedDisplacementAngstrom: 0.14 });
    const before = JSON.stringify(scene);
    const identity = { stateId: scene.stateId, stateDigest: scene.stateDigest, energy: scene.energy, force: scene.forceByAtomIdKjMolAngstrom };
    const derived = deriveMolecularReferenceGeometry(scene);
    expect(derived.waterValenceFrames).toEqual([]);
    expect(derived.waterDonorAcceptorAxis).toBeNull();
    expect(derived.coordinationEdges).toHaveLength(12);
    expect(JSON.stringify(scene)).toBe(before);
    expect({ stateId: scene.stateId, stateDigest: scene.stateDigest, energy: scene.energy, force: scene.forceByAtomIdKjMolAngstrom })
      .toEqual(identity);
  });

  it('classifies geometry and qualitative electronic references separately and excludes both from energy', () => {
    expect(MOLECULAR_REFERENCE_CONTRACTS.geometry).toEqual({
      role: 'geometry-reference',
      quantitative: false,
      electronicStructureSolved: false,
      participatesInEnergy: false,
    });
    expect(MOLECULAR_REFERENCE_CONTRACTS.qualitativeElectronic).toEqual({
      role: 'qualitative-electronic-reference',
      quantitative: false,
      electronicStructureSolved: false,
      participatesInEnergy: false,
    });
  });
});

function length(vector: Vector3) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function angleDegrees(first: Vector3, second: Vector3) {
  const cosine = (first.x * second.x + first.y * second.y + first.z * second.z) / (length(first) * length(second));
  return Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI;
}

function add(first: Vector3, second: Vector3): Vector3 {
  return { x: first.x + second.x, y: first.y + second.y, z: first.z + second.z };
}

function expectVectorClose(actual: Vector3, expected: Vector3) {
  expect(actual.x).toBeCloseTo(expected.x, 10);
  expect(actual.y).toBeCloseTo(expected.y, 10);
  expect(actual.z).toBeCloseTo(expected.z, 10);
}
