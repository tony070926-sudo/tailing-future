import type { MolecularScene, Vector3 } from '../../lib/molecular/molecular-interactions';

export const MOLECULAR_REFERENCE_CONTRACTS = Object.freeze({
  geometry: Object.freeze({
    role: 'geometry-reference' as const,
    quantitative: false,
    electronicStructureSolved: false,
    participatesInEnergy: false,
  }),
  qualitativeElectronic: Object.freeze({
    role: 'qualitative-electronic-reference' as const,
    quantitative: false,
    electronicStructureSolved: false,
    participatesInEnergy: false,
  }),
});

export type WaterValenceFrame = Readonly<{
  oxygenAtomId: string;
  oxygenPositionAngstrom: Vector3;
  hydrogenAtomIds: readonly [string, string];
  bondDirections: readonly [Vector3, Vector3];
  lonePairDirections: readonly [Vector3, Vector3];
}>;

export type WaterDonorAcceptorAxisGuide = Readonly<{
  acceptorOxygenAtomId: string;
  donorHydrogenAtomId: string;
  donorOxygenAtomId: string;
  acceptorPositionAngstrom: Vector3;
  donorHydrogenPositionAngstrom: Vector3;
  donorOxygenPositionAngstrom: Vector3;
  selectedLonePairDirection: Vector3;
  acceptorToHydrogenDirection: Vector3;
  donorBondDirection: Vector3;
  lonePairToContactAngleDegrees: number;
  donorHydrogenAcceptorAngleDegrees: number;
  axesCollinearWithinFiveDegrees: boolean;
}>;

export type CoordinationEdge = Readonly<{ atomAId: string; atomBId: string }>;

export type MolecularReferenceGeometry = Readonly<{
  waterValenceFrames: ReadonlyArray<WaterValenceFrame>;
  waterDonorAcceptorAxis: WaterDonorAcceptorAxisGuide | null;
  coordinationEdges: ReadonlyArray<CoordinationEdge>;
}>;

export function deriveMolecularReferenceGeometry(scene: MolecularScene): MolecularReferenceGeometry {
  const waterValenceFrames = deriveWaterValenceFrames(scene);
  return {
    waterValenceFrames,
    waterDonorAcceptorAxis: deriveWaterDonorAcceptorAxis(scene, waterValenceFrames),
    coordinationEdges: deriveCoordinationEdges(scene),
  };
}

export function deriveWaterValenceFrames(scene: MolecularScene): ReadonlyArray<WaterValenceFrame> {
  if (scene.kind !== 'water-dimer') return [];
  const frames: WaterValenceFrame[] = [];
  const oxygenAtoms = scene.atoms
    .filter((atom) => atom.element === 'O')
    .sort((first, second) => first.id.localeCompare(second.id));

  oxygenAtoms.forEach((oxygen) => {
    const hydrogens = scene.atoms
      .filter((atom) => atom.groupId === oxygen.groupId && atom.element === 'H')
      .sort((first, second) => first.id.localeCompare(second.id));
    if (hydrogens.length !== 2) return;
    const firstBond = normalize(subtract(hydrogens[0].positionAngstrom, oxygen.positionAngstrom));
    const secondBond = normalize(subtract(hydrogens[1].positionAngstrom, oxygen.positionAngstrom));
    const bisector = normalize(add(firstBond, secondBond));
    const normal = normalize(cross(firstBond, secondBond));
    if ([firstBond, secondBond, bisector, normal].some((vector) => !isFiniteUnitDirection(vector))) return;

    const idealHalfAngle = 54.7356 * Math.PI / 180;
    const lonePairAlongBisector = scale(bisector, -Math.cos(idealHalfAngle));
    const lonePairOutOfPlane = scale(normal, Math.sin(idealHalfAngle));
    const firstLonePair = normalize(add(lonePairAlongBisector, lonePairOutOfPlane));
    const secondLonePair = normalize(subtract(lonePairAlongBisector, lonePairOutOfPlane));
    if (!isFiniteUnitDirection(firstLonePair) || !isFiniteUnitDirection(secondLonePair)) return;

    frames.push({
      oxygenAtomId: oxygen.id,
      oxygenPositionAngstrom: oxygen.positionAngstrom,
      hydrogenAtomIds: [hydrogens[0].id, hydrogens[1].id],
      bondDirections: [firstBond, secondBond],
      lonePairDirections: [firstLonePair, secondLonePair],
    });
  });
  return frames;
}

export function deriveWaterDonorAcceptorAxis(
  scene: MolecularScene,
  frames: ReadonlyArray<WaterValenceFrame> = deriveWaterValenceFrames(scene),
): WaterDonorAcceptorAxisGuide | null {
  if (scene.kind !== 'water-dimer') return null;
  const guide = scene.guides.find((candidate) => candidate.kind === 'hydrogen-bond-guide');
  if (!guide) return null;
  const acceptor = scene.atoms.find((atom) => atom.id === guide.atomAId);
  const donorHydrogen = scene.atoms.find((atom) => atom.id === guide.atomBId);
  const donorOxygen = donorHydrogen
    ? scene.atoms.find((atom) => atom.groupId === donorHydrogen.groupId && atom.element === 'O')
    : undefined;
  const acceptorFrame = acceptor ? frames.find((frame) => frame.oxygenAtomId === acceptor.id) : undefined;
  if (!acceptor || !donorHydrogen || !donorOxygen || !acceptorFrame) return null;

  const acceptorToHydrogenDirection = normalize(subtract(donorHydrogen.positionAngstrom, acceptor.positionAngstrom));
  const donorBondDirection = normalize(subtract(donorHydrogen.positionAngstrom, donorOxygen.positionAngstrom));
  if (!isFiniteUnitDirection(acceptorToHydrogenDirection) || !isFiniteUnitDirection(donorBondDirection)) return null;

  const candidates = acceptorFrame.lonePairDirections
    .map((direction) => ({ direction, angle: angleBetweenDegrees(direction, acceptorToHydrogenDirection) }))
    .filter((candidate) => Number.isFinite(candidate.angle))
    .sort((first, second) => first.angle - second.angle);
  const selected = candidates[0];
  if (!selected) return null;
  const donorHydrogenAcceptorAngleDegrees = angleBetweenDegrees(
    subtract(donorOxygen.positionAngstrom, donorHydrogen.positionAngstrom),
    subtract(acceptor.positionAngstrom, donorHydrogen.positionAngstrom),
  );
  if (!Number.isFinite(donorHydrogenAcceptorAngleDegrees)) return null;

  return {
    acceptorOxygenAtomId: acceptor.id,
    donorHydrogenAtomId: donorHydrogen.id,
    donorOxygenAtomId: donorOxygen.id,
    acceptorPositionAngstrom: acceptor.positionAngstrom,
    donorHydrogenPositionAngstrom: donorHydrogen.positionAngstrom,
    donorOxygenPositionAngstrom: donorOxygen.positionAngstrom,
    selectedLonePairDirection: selected.direction,
    acceptorToHydrogenDirection,
    donorBondDirection,
    lonePairToContactAngleDegrees: selected.angle,
    donorHydrogenAcceptorAngleDegrees,
    axesCollinearWithinFiveDegrees: selected.angle <= 5,
  };
}

export function deriveCoordinationEdges(scene: MolecularScene): ReadonlyArray<CoordinationEdge> {
  if (scene.kind !== 'nacl-rocksalt') return [];
  const selected = scene.atoms.find((atom) => atom.id === scene.defaultSelectedAtomId);
  if (!selected) return [];
  const neighborIds = scene.guides
    .filter((guide) => guide.kind === 'coordination-guide')
    .map((guide) => guide.atomAId === selected.id ? guide.atomBId : guide.atomAId)
    .filter((atomId, index, all) => all.indexOf(atomId) === index);
  const atomById = new Map(scene.atoms.map((atom) => [atom.id, atom]));
  const edges: CoordinationEdge[] = [];
  for (let first = 0; first < neighborIds.length; first += 1) {
    const firstAtom = atomById.get(neighborIds[first]);
    if (!firstAtom) continue;
    const firstDirection = normalize(subtract(firstAtom.positionAngstrom, selected.positionAngstrom));
    if (!isFiniteUnitDirection(firstDirection)) continue;
    for (let second = first + 1; second < neighborIds.length; second += 1) {
      const secondAtom = atomById.get(neighborIds[second]);
      if (!secondAtom) continue;
      const secondDirection = normalize(subtract(secondAtom.positionAngstrom, selected.positionAngstrom));
      if (!isFiniteUnitDirection(secondDirection) || dot(firstDirection, secondDirection) < -0.45) continue;
      edges.push({ atomAId: firstAtom.id, atomBId: secondAtom.id });
    }
  }
  return edges;
}

function angleBetweenDegrees(first: Vector3, second: Vector3) {
  const firstLength = length(first);
  const secondLength = length(second);
  if (!Number.isFinite(firstLength) || !Number.isFinite(secondLength) || firstLength <= 0 || secondLength <= 0) {
    return Number.NaN;
  }
  return Math.acos(clamp(dot(first, second) / (firstLength * secondLength), -1, 1)) * 180 / Math.PI;
}

function add(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(vector: Vector3, factor: number): Vector3 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function dot(a: Vector3, b: Vector3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function length(vector: Vector3) {
  return Math.hypot(vector.x, vector.y, vector.z);
}

function normalize(vector: Vector3): Vector3 {
  const vectorLength = length(vector);
  if (!Number.isFinite(vectorLength) || vectorLength <= 0) return { x: 0, y: 0, z: 0 };
  return scale(vector, 1 / vectorLength);
}

function isFiniteUnitDirection(vector: Vector3) {
  return Number.isFinite(vector.x)
    && Number.isFinite(vector.y)
    && Number.isFinite(vector.z)
    && Math.abs(length(vector) - 1) < 1e-10;
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}
