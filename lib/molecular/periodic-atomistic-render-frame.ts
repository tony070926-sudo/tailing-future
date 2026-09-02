import type { Vector3 } from './molecular-interactions.ts';
import type { Int3 } from '../simulation/periodic-cell.ts';
import type { PeriodicAtomisticObservationV041, PeriodicAtomObservationV041 } from '../simulation/periodic-atomistic-world.ts';

export type PeriodicRenderAtom = Readonly<{
  id: string;
  label: string;
  element: string;
  wrappedPositionAngstrom: Vector3;
  unwrappedPositionAngstrom: Vector3;
  wrappedFractional: Vector3;
  image: Int3;
  velocityAngstromPerPicosecond: Vector3;
  forceKjMolAngstrom: Vector3;
  localVirialTraceKjMol: number;
}>;

export type PeriodicRenderNeighborEdge = Readonly<{
  id: string;
  atomAId: string;
  atomBId: string;
  imageShiftForB: Int3;
  atomAPositionAngstrom: Vector3;
  atomBImagePositionAngstrom: Vector3;
  distanceAngstrom: number;
  energyKjMol: number;
  forceOnBKjMolAngstrom: Vector3;
}>;

export type PeriodicAtomisticRenderFrame = Readonly<{
  scenarioId: string;
  stateId: string;
  stateDigest: string;
  physicalDigest: string;
  step: number;
  timePicoseconds: number;
  atoms: ReadonlyArray<PeriodicRenderAtom>;
  neighborEdges: ReadonlyArray<PeriodicRenderNeighborEdge>;
  cell: Readonly<{
    originAngstrom: Vector3;
    vectorsAngstrom: readonly [Vector3, Vector3, Vector3];
    verticesAngstrom: ReadonlyArray<Vector3>;
  }>;
}>;

export function createPeriodicAtomisticRenderFrame(
  observation: PeriodicAtomisticObservationV041,
): PeriodicAtomisticRenderFrame {
  const atoms = observation.atoms.map(renderAtom);
  const byId = new Map(atoms.map((atom) => [atom.id, atom]));
  const vectors = observation.cell.vectorsAngstrom;
  const neighborEdges = observation.pairInteractions
    .filter((pair) => pair.role === 'nonbonded')
    .map((pair) => {
      const atomA = requireMap(byId, pair.atomAId, 'render atom A');
      const atomB = requireMap(byId, pair.atomBId, 'render atom B');
      return {
        id: pair.id,
        atomAId: pair.atomAId,
        atomBId: pair.atomBId,
        imageShiftForB: { ...pair.imageShiftForB },
        atomAPositionAngstrom: { ...atomA.wrappedPositionAngstrom },
        atomBImagePositionAngstrom: add(atomB.wrappedPositionAngstrom, latticeVector(vectors, pair.imageShiftForB)),
        distanceAngstrom: pair.distanceAngstrom,
        energyKjMol: pair.energyKjMol,
        forceOnBKjMolAngstrom: { ...pair.forceOnBKjMolAngstrom },
      };
    });
  return {
    scenarioId: observation.scenarioId,
    stateId: observation.stateId,
    stateDigest: observation.stateDigest,
    physicalDigest: observation.physicalDigest,
    step: observation.step,
    timePicoseconds: observation.timePicoseconds,
    atoms,
    neighborEdges,
    cell: {
      originAngstrom: { ...observation.cell.originAngstrom },
      vectorsAngstrom: vectors.map((vector) => ({ ...vector })) as unknown as [Vector3, Vector3, Vector3],
      verticesAngstrom: cellVertices(observation.cell.originAngstrom, vectors),
    },
  };
}

/** Breaks a wrapped trail whenever the integer image changes, so a face crossing
 * is never rendered as a false line through the entire periodic cell. */
export function buildWrappedTrajectorySegments(
  frames: ReadonlyArray<PeriodicAtomisticRenderFrame>,
  atomId: string,
) {
  const segments: Vector3[][] = [];
  let current: Vector3[] = [];
  let previousImage: Int3 | null = null;
  for (const frame of frames) {
    const atom = frame.atoms.find((candidate) => candidate.id === atomId);
    if (!atom) continue;
    if (previousImage && !sameImage(previousImage, atom.image)) {
      if (current.length > 0) segments.push(current);
      current = [];
    }
    current.push({ ...atom.wrappedPositionAngstrom });
    previousImage = atom.image;
  }
  if (current.length > 0) segments.push(current);
  return segments;
}

function renderAtom(atom: PeriodicAtomObservationV041): PeriodicRenderAtom {
  return {
    id: atom.id,
    label: atom.label,
    element: atom.element,
    wrappedPositionAngstrom: { ...atom.wrappedPositionAngstrom },
    unwrappedPositionAngstrom: { ...atom.unwrappedPositionAngstrom },
    wrappedFractional: { ...atom.wrappedFractional },
    image: { ...atom.image },
    velocityAngstromPerPicosecond: { ...atom.velocityAngstromPerPicosecond },
    forceKjMolAngstrom: { ...atom.forceKjMolAngstrom },
    localVirialTraceKjMol: atom.localVirialKjMol.xx + atom.localVirialKjMol.yy + atom.localVirialKjMol.zz,
  };
}

function cellVertices(origin: Vector3, vectors: readonly [Vector3, Vector3, Vector3]) {
  const [a, b, c] = vectors;
  return [
    origin,
    add(origin, a),
    add(origin, b),
    add(add(origin, a), b),
    add(origin, c),
    add(add(origin, a), c),
    add(add(origin, b), c),
    add(add(add(origin, a), b), c),
  ].map((vertex) => ({ ...vertex }));
}

function latticeVector(vectors: readonly [Vector3, Vector3, Vector3], image: Int3) {
  return add(add(scale(vectors[0], image.x), scale(vectors[1], image.y)), scale(vectors[2], image.z));
}

function sameImage(left: Int3, right: Int3) {
  return left.x === right.x && left.y === right.y && left.z === right.z;
}

function requireMap<K, V>(map: ReadonlyMap<K, V>, key: K, label: string) {
  const value = map.get(key);
  if (value === undefined) throw new Error(`${label} is missing`);
  return value;
}

function add(left: Vector3, right: Vector3): Vector3 { return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z }; }
function scale(vector: Vector3, factor: number): Vector3 { return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor }; }
