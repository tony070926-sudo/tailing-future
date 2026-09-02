import type { Vector3 } from '../molecular/molecular-interactions.ts';

export type Int3 = Readonly<{ x: number; y: number; z: number }>;
export type CellVectors3 = readonly [Vector3, Vector3, Vector3];

export type WrappedPeriodicPosition = Readonly<{
  wrappedFractional: Vector3;
  image: Int3;
}>;

export type MinimumImageResult = Readonly<{
  displacementAngstrom: Vector3;
  distanceAngstrom: number;
  imageShiftForTarget: Int3;
}>;

export type NeighborAtomPosition = Readonly<{
  id: string;
  wrappedFractional: Vector3;
  image: Int3;
}>;

export type PeriodicNeighborPair = Readonly<{
  atomAId: string;
  atomBId: string;
  atomAIndex: number;
  atomBIndex: number;
  imageShiftForB: Int3;
  displacementAngstrom: Vector3;
  distanceAngstrom: number;
}>;

export type NeighborListSnapshot = Readonly<{
  pairs: ReadonlyArray<PeriodicNeighborPair>;
  rebuilt: boolean;
  buildCount: number;
  maximumDisplacementSinceBuildAngstrom: number;
}>;

type MatrixRows3 = readonly [Vector3, Vector3, Vector3];

const ZERO = Object.freeze({ x: 0, y: 0, z: 0 });
const MAXIMUM_CLOSEST_VECTOR_CANDIDATES = 1_000_000;
const CELL_DEGENERACY_LIMIT = 1e-8;
const MINIMUM_CELL_VECTOR_ANGSTROM = 1e-3;
const MAXIMUM_CELL_VECTOR_ANGSTROM = 1e6;
const MAXIMUM_ORIGIN_COMPONENT_ANGSTROM = 1e9;
const MAXIMUM_ABSOLUTE_IMAGE = 1_000_000_000;
const STABLE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

/**
 * A right-handed periodic cell using the column-vector convention H=[a b c].
 * Cartesian and fractional coordinates satisfy r = origin + Hs.
 *
 * Minimum-image displacements use an adaptive closest-lattice-vector search.
 * Component-wise fractional rounding is intentionally not used because it is
 * incorrect for a general skew cell.
 */
export class PeriodicCell {
  readonly originAngstrom: Vector3;
  readonly vectorsAngstrom: CellVectors3;
  readonly volumeAngstrom3: number;
  readonly shortestLatticeVectorAngstrom: number;
  readonly minimumImageRadiusAngstrom: number;
  private readonly inverseRows: MatrixRows3;

  constructor(vectorsAngstrom: CellVectors3, originAngstrom: Vector3 = ZERO) {
    const [a, b, c] = vectorsAngstrom.map(cloneFiniteVector) as [Vector3, Vector3, Vector3];
    this.originAngstrom = Object.freeze(cloneFiniteVector(originAngstrom));
    if ([this.originAngstrom.x, this.originAngstrom.y, this.originAngstrom.z]
      .some((value) => Math.abs(value) > MAXIMUM_ORIGIN_COMPONENT_ANGSTROM)) {
      throw new Error(`periodic cell origin components must not exceed ${MAXIMUM_ORIGIN_COMPONENT_ANGSTROM} angstrom`);
    }
    for (const vector of [a, b, c]) {
      const length = magnitude(vector);
      if (!(length >= MINIMUM_CELL_VECTOR_ANGSTROM && length <= MAXIMUM_CELL_VECTOR_ANGSTROM)) {
        throw new Error(`periodic cell vector lengths must be in [${MINIMUM_CELL_VECTOR_ANGSTROM}, ${MAXIMUM_CELL_VECTOR_ANGSTROM}] angstrom`);
      }
    }
    const determinant = dot(a, cross(b, c));
    if (!(Number.isFinite(determinant) && determinant > 0)) {
      throw new Error('periodic cell must be finite, non-singular and right-handed');
    }
    const scale = magnitude(a) * magnitude(b) * magnitude(c);
    if (!(Number.isFinite(scale) && scale > 0) || determinant / scale <= CELL_DEGENERACY_LIMIT) {
      throw new Error('periodic cell is singular or too ill-conditioned');
    }

    this.vectorsAngstrom = Object.freeze([Object.freeze(a), Object.freeze(b), Object.freeze(c)]) as CellVectors3;
    this.volumeAngstrom3 = determinant;
    this.inverseRows = Object.freeze([
      Object.freeze(scaleVector(cross(b, c), 1 / determinant)),
      Object.freeze(scaleVector(cross(c, a), 1 / determinant)),
      Object.freeze(scaleVector(cross(a, b), 1 / determinant)),
    ]) as MatrixRows3;
    if (!this.inverseRows.flatMap((row) => [row.x, row.y, row.z]).every(Number.isFinite)) {
      throw new Error('periodic cell inverse became non-finite');
    }
    this.shortestLatticeVectorAngstrom = this.findShortestNonzeroLatticeVector();
    if (!(Number.isFinite(this.shortestLatticeVectorAngstrom) && this.shortestLatticeVectorAngstrom > 0)) {
      throw new Error('periodic cell shortest lattice vector became non-finite');
    }
    this.minimumImageRadiusAngstrom = this.shortestLatticeVectorAngstrom / 2;
    Object.freeze(this);
  }

  fractionalToCartesian(fractional: Vector3): Vector3 {
    assertFiniteVector(fractional, 'fractional coordinate');
    return add(this.originAngstrom, this.latticeVector(fractional));
  }

  cartesianToFractional(cartesianAngstrom: Vector3): Vector3 {
    assertFiniteVector(cartesianAngstrom, 'Cartesian coordinate');
    const relative = subtract(cartesianAngstrom, this.originAngstrom);
    return {
      x: dot(this.inverseRows[0], relative),
      y: dot(this.inverseRows[1], relative),
      z: dot(this.inverseRows[2], relative),
    };
  }

  cartesianVectorToFractional(cartesianVectorAngstrom: Vector3): Vector3 {
    assertFiniteVector(cartesianVectorAngstrom, 'Cartesian vector');
    return {
      x: dot(this.inverseRows[0], cartesianVectorAngstrom),
      y: dot(this.inverseRows[1], cartesianVectorAngstrom),
      z: dot(this.inverseRows[2], cartesianVectorAngstrom),
    };
  }

  latticeVector(fractional: Vector3): Vector3 {
    assertFiniteVector(fractional, 'fractional vector');
    const [a, b, c] = this.vectorsAngstrom;
    return {
      x: a.x * fractional.x + b.x * fractional.y + c.x * fractional.z,
      y: a.y * fractional.x + b.y * fractional.y + c.y * fractional.z,
      z: a.z * fractional.x + b.z * fractional.y + c.z * fractional.z,
    };
  }

  wrapFractional(unwrappedFractional: Vector3): WrappedPeriodicPosition {
    assertFiniteVector(unwrappedFractional, 'unwrapped fractional coordinate');
    const x = wrapScalar(unwrappedFractional.x);
    const y = wrapScalar(unwrappedFractional.y);
    const z = wrapScalar(unwrappedFractional.z);
    return {
      wrappedFractional: { x: x.wrapped, y: y.wrapped, z: z.wrapped },
      image: { x: x.image, y: y.image, z: z.image },
    };
  }

  wrapCartesian(unwrappedCartesianAngstrom: Vector3): WrappedPeriodicPosition {
    return this.wrapFractional(this.cartesianToFractional(unwrappedCartesianAngstrom));
  }

  wrappedCartesian(position: WrappedPeriodicPosition): Vector3 {
    assertWrappedPeriodicPosition(position);
    return this.fractionalToCartesian(position.wrappedFractional);
  }

  unwrappedCartesian(position: WrappedPeriodicPosition): Vector3 {
    assertWrappedPeriodicPosition(position);
    return this.fractionalToCartesian(add(position.wrappedFractional, position.image));
  }

  minimumImageFromFractional(sourceWrappedFractional: Vector3, targetWrappedFractional: Vector3): MinimumImageResult {
    assertWrappedFractional(sourceWrappedFractional, 'source wrapped fractional coordinate');
    assertWrappedFractional(targetWrappedFractional, 'target wrapped fractional coordinate');
    const rawFractional = subtract(targetWrappedFractional, sourceWrappedFractional);
    const rawCartesian = this.latticeVector(rawFractional);
    return this.closestPeriodicImage(rawFractional, rawCartesian);
  }

  minimumImageFromCartesian(sourceCartesianAngstrom: Vector3, targetCartesianAngstrom: Vector3): MinimumImageResult {
    assertFiniteVector(sourceCartesianAngstrom, 'source Cartesian coordinate');
    assertFiniteVector(targetCartesianAngstrom, 'target Cartesian coordinate');
    const rawCartesian = subtract(targetCartesianAngstrom, sourceCartesianAngstrom);
    const rawFractional = {
      x: dot(this.inverseRows[0], rawCartesian),
      y: dot(this.inverseRows[1], rawCartesian),
      z: dot(this.inverseRows[2], rawCartesian),
    };
    return this.closestPeriodicImage(rawFractional, rawCartesian);
  }

  assertNeighborRadius(cutoffPlusSkinAngstrom: number) {
    if (!(Number.isFinite(cutoffPlusSkinAngstrom) && cutoffPlusSkinAngstrom > 0)) {
      throw new Error('neighbor radius must be finite and positive');
    }
    if (2 * cutoffPlusSkinAngstrom >= this.shortestLatticeVectorAngstrom) {
      throw new Error('2 × (cutoff + skin) must be strictly smaller than the shortest nonzero lattice vector');
    }
  }

  private closestPeriodicImage(rawFractional: Vector3, rawCartesian: Vector3): MinimumImageResult {
    const initialTranslation = roundVector(rawFractional);
    assertInt3(initialTranslation, 'minimum-image lattice translation');
    let bestTranslation = initialTranslation;
    let bestDisplacement = subtract(rawCartesian, this.latticeVector(initialTranslation));
    let bestDistanceSquared = magnitudeSquared(bestDisplacement);
    const bestRadius = Math.sqrt(bestDistanceSquared);
    const epsilon = Math.max(1, bestRadius) * Number.EPSILON * 64;
    const bounds = this.inverseRows.map((row, index) => {
      const center = component(rawFractional, index);
      const reach = magnitude(row) * (bestRadius + epsilon);
      return [Math.ceil(center - reach), Math.floor(center + reach)] as const;
    });
    const candidateCount = bounds.reduce((count, [lower, upper]) => count * (upper - lower + 1), 1);
    if (!Number.isSafeInteger(candidateCount) || candidateCount > MAXIMUM_CLOSEST_VECTOR_CANDIDATES) {
      throw new Error('periodic cell closest-vector search exceeds the locked candidate bound');
    }

    for (let nx = bounds[0][0]; nx <= bounds[0][1]; nx += 1) {
      for (let ny = bounds[1][0]; ny <= bounds[1][1]; ny += 1) {
        for (let nz = bounds[2][0]; nz <= bounds[2][1]; nz += 1) {
          const translation = { x: nx, y: ny, z: nz };
          const displacement = subtract(rawCartesian, this.latticeVector(translation));
          const distanceSquared = magnitudeSquared(displacement);
          const tolerance = Math.max(Number.MIN_VALUE, bestDistanceSquared, distanceSquared) * Number.EPSILON * 128;
          if (
            distanceSquared < bestDistanceSquared - tolerance
            || (
              Math.abs(distanceSquared - bestDistanceSquared) <= tolerance
              && compareOrientedTieDisplacement(displacement, bestDisplacement, rawCartesian, tolerance) < 0
            )
          ) {
            bestDistanceSquared = distanceSquared;
            bestDisplacement = displacement;
            bestTranslation = translation;
          }
        }
      }
    }

    return {
      displacementAngstrom: bestDisplacement,
      distanceAngstrom: Math.sqrt(bestDistanceSquared),
      imageShiftForTarget: negateInt3(bestTranslation),
    };
  }

  private findShortestNonzeroLatticeVector() {
    const [a, b, c] = this.vectorsAngstrom;
    let bestVector = a;
    let bestIndex = { x: 1, y: 0, z: 0 };
    for (const [vector, index] of [
      [b, { x: 0, y: 1, z: 0 }],
      [c, { x: 0, y: 0, z: 1 }],
    ] as const) {
      if (magnitudeSquared(vector) < magnitudeSquared(bestVector)) {
        bestVector = vector;
        bestIndex = index;
      }
    }

    const initialRadius = magnitude(bestVector);
    const bounds = this.inverseRows.map((row) => Math.ceil(magnitude(row) * initialRadius + Number.EPSILON * 64));
    const candidateCount = (2 * bounds[0] + 1) * (2 * bounds[1] + 1) * (2 * bounds[2] + 1);
    if (!Number.isSafeInteger(candidateCount) || candidateCount > MAXIMUM_CLOSEST_VECTOR_CANDIDATES) {
      throw new Error('periodic cell shortest-vector search exceeds the locked candidate bound');
    }

    let bestSquared = magnitudeSquared(bestVector);
    for (let nx = -bounds[0]; nx <= bounds[0]; nx += 1) {
      for (let ny = -bounds[1]; ny <= bounds[1]; ny += 1) {
        for (let nz = -bounds[2]; nz <= bounds[2]; nz += 1) {
          if (nx === 0 && ny === 0 && nz === 0) continue;
          const index = { x: nx, y: ny, z: nz };
          const vector = this.latticeVector(index);
          const squared = magnitudeSquared(vector);
          const tolerance = Math.max(Number.MIN_VALUE, bestSquared, squared) * Number.EPSILON * 128;
          if (squared < bestSquared - tolerance || (Math.abs(squared - bestSquared) <= tolerance && compareInt3(index, bestIndex) < 0)) {
            bestSquared = squared;
            bestVector = vector;
            bestIndex = index;
          }
        }
      }
    }
    return Math.sqrt(bestSquared);
  }
}

/**
 * Deterministic Verlet half-list. The O(N²) build is intentionally retained as
 * the auditable reference implementation; the cached list is rebuilt when any
 * unwrapped atom displacement reaches skin/2. A spatial bin accelerator can be
 * introduced later only if it reproduces this exact canonical pair set.
 */
export class DeterministicVerletNeighborList {
  readonly cutoffAngstrom: number;
  readonly skinAngstrom: number;
  private readonly cell: PeriodicCell;
  private cachedPairIds: ReadonlyArray<readonly [string, string]> = [];
  private referencePositionById: ReadonlyMap<string, WrappedPeriodicPosition> | null = null;
  private atomIdsAtBuild: ReadonlyArray<string> = [];
  private _buildCount = 0;

  constructor(cell: PeriodicCell, cutoffAngstrom: number, skinAngstrom: number) {
    if (!(Number.isFinite(cutoffAngstrom) && cutoffAngstrom > 0)) throw new Error('cutoff must be finite and positive');
    if (!(Number.isFinite(skinAngstrom) && skinAngstrom > 0)) throw new Error('neighbor skin must be finite and positive');
    cell.assertNeighborRadius(cutoffAngstrom + skinAngstrom);
    this.cell = cell;
    this.cutoffAngstrom = cutoffAngstrom;
    this.skinAngstrom = skinAngstrom;
  }

  get buildCount() { return this._buildCount; }

  assertCompatible(cell: PeriodicCell, requiredCutoffAngstrom: number) {
    if (cell !== this.cell) throw new Error('neighbor list belongs to a different periodic cell instance');
    if (!(Number.isFinite(requiredCutoffAngstrom) && requiredCutoffAngstrom > 0)) {
      throw new Error('required neighbor-list cutoff must be finite and positive');
    }
    if (this.cutoffAngstrom + Math.max(1, requiredCutoffAngstrom) * Number.EPSILON * 64 < requiredCutoffAngstrom) {
      throw new Error('neighbor-list cutoff is smaller than a topology pair-rule cutoff');
    }
  }

  update(atoms: ReadonlyArray<NeighborAtomPosition>): NeighborListSnapshot {
    const indexed = canonicalizeNeighborAtoms(atoms);
    let maximumDisplacement = this.maximumDisplacementSinceBuild(indexed);
    const ids = indexed.map(({ atom }) => atom.id);
    const rebuilt = this.referencePositionById === null
      || ids.length !== this.atomIdsAtBuild.length
      || ids.some((id, index) => id !== this.atomIdsAtBuild[index])
      || maximumDisplacement + Math.max(1, this.skinAngstrom) * Number.EPSILON * 64 >= this.skinAngstrom / 2;

    if (rebuilt) {
      this.rebuild(indexed);
      maximumDisplacement = 0;
    }

    return {
      pairs: this.activePairs(indexed),
      rebuilt,
      buildCount: this._buildCount,
      maximumDisplacementSinceBuildAngstrom: maximumDisplacement,
    };
  }

  reset() {
    this.cachedPairIds = [];
    this.referencePositionById = null;
    this.atomIdsAtBuild = [];
    this._buildCount = 0;
  }

  private rebuild(indexed: ReadonlyArray<IndexedNeighborAtom>) {
    const listRadius = this.cutoffAngstrom + this.skinAngstrom;
    const pairs: Array<readonly [string, string]> = [];
    for (let aIndex = 0; aIndex < indexed.length; aIndex += 1) {
      for (let bIndex = aIndex + 1; bIndex < indexed.length; bIndex += 1) {
        const atomA = indexed[aIndex].atom;
        const atomB = indexed[bIndex].atom;
        const image = this.cell.minimumImageFromFractional(atomA.wrappedFractional, atomB.wrappedFractional);
        if (image.distanceAngstrom <= listRadius) pairs.push([atomA.id, atomB.id]);
      }
    }
    this.cachedPairIds = pairs;
    this.referencePositionById = new Map(indexed.map(({ atom }) => [atom.id, {
      wrappedFractional: { ...atom.wrappedFractional },
      image: { ...atom.image },
    }]));
    this.atomIdsAtBuild = indexed.map(({ atom }) => atom.id);
    this._buildCount += 1;
  }

  private activePairs(indexed: ReadonlyArray<IndexedNeighborAtom>) {
    const byId = new Map(indexed.map((entry) => [entry.atom.id, entry]));
    const pairs: PeriodicNeighborPair[] = [];
    for (const [atomAId, atomBId] of this.cachedPairIds) {
      const atomA = byId.get(atomAId);
      const atomB = byId.get(atomBId);
      if (!atomA || !atomB) throw new Error('neighbor-list atom identity changed without rebuild');
      const image = this.cell.minimumImageFromFractional(atomA.atom.wrappedFractional, atomB.atom.wrappedFractional);
      if (image.distanceAngstrom <= this.cutoffAngstrom) {
        pairs.push({
          atomAId,
          atomBId,
          atomAIndex: atomA.originalIndex,
          atomBIndex: atomB.originalIndex,
          imageShiftForB: image.imageShiftForTarget,
          displacementAngstrom: image.displacementAngstrom,
          distanceAngstrom: image.distanceAngstrom,
        });
      }
    }
    return pairs;
  }

  private maximumDisplacementSinceBuild(indexed: ReadonlyArray<IndexedNeighborAtom>) {
    if (!this.referencePositionById) return Number.POSITIVE_INFINITY;
    let maximum = 0;
    for (const { atom } of indexed) {
      const reference = this.referencePositionById.get(atom.id);
      if (!reference) return Number.POSITIVE_INFINITY;
      const imageDelta = subtractInt3(atom.image, reference.image);
      if (Math.abs(imageDelta.x) > 1 || Math.abs(imageDelta.y) > 1 || Math.abs(imageDelta.z) > 1) return Number.POSITIVE_INFINITY;
      const fractionalDelta = {
        x: imageDelta.x + atom.wrappedFractional.x - reference.wrappedFractional.x,
        y: imageDelta.y + atom.wrappedFractional.y - reference.wrappedFractional.y,
        z: imageDelta.z + atom.wrappedFractional.z - reference.wrappedFractional.z,
      };
      maximum = Math.max(maximum, magnitude(this.cell.latticeVector(fractionalDelta)));
    }
    return maximum;
  }
}

export function enumeratePeriodicNeighborPairsOracle(
  cell: PeriodicCell,
  atoms: ReadonlyArray<NeighborAtomPosition>,
  cutoffAngstrom: number,
) {
  if (!(Number.isFinite(cutoffAngstrom) && cutoffAngstrom > 0)) throw new Error('cutoff must be finite and positive');
  cell.assertNeighborRadius(cutoffAngstrom);
  const indexed = canonicalizeNeighborAtoms(atoms);
  const pairs: PeriodicNeighborPair[] = [];
  for (let aIndex = 0; aIndex < indexed.length; aIndex += 1) {
    for (let bIndex = aIndex + 1; bIndex < indexed.length; bIndex += 1) {
      const atomA = indexed[aIndex];
      const atomB = indexed[bIndex];
      const image = cell.minimumImageFromFractional(atomA.atom.wrappedFractional, atomB.atom.wrappedFractional);
      if (image.distanceAngstrom <= cutoffAngstrom) {
        pairs.push({
          atomAId: atomA.atom.id,
          atomBId: atomB.atom.id,
          atomAIndex: atomA.originalIndex,
          atomBIndex: atomB.originalIndex,
          imageShiftForB: image.imageShiftForTarget,
          displacementAngstrom: image.displacementAngstrom,
          distanceAngstrom: image.distanceAngstrom,
        });
      }
    }
  }
  return pairs;
}

type IndexedNeighborAtom = Readonly<{ atom: NeighborAtomPosition; originalIndex: number }>;

function canonicalizeNeighborAtoms(atoms: ReadonlyArray<NeighborAtomPosition>) {
  const seen = new Set<string>();
  return atoms.map((atom, originalIndex) => {
    if (!STABLE_TOKEN.test(atom.id) || seen.has(atom.id)) throw new Error('periodic atom IDs must be unique ASCII stable tokens');
    seen.add(atom.id);
    assertWrappedPeriodicPosition(atom);
    return { atom, originalIndex };
  }).sort((left, right) => compareStableToken(left.atom.id, right.atom.id));
}

function assertWrappedPeriodicPosition(position: WrappedPeriodicPosition) {
  assertWrappedFractional(position.wrappedFractional, 'wrapped fractional coordinate');
  assertInt3(position.image, 'periodic image');
}

function assertWrappedFractional(vector: Vector3, label: string) {
  assertFiniteVector(vector, label);
  if (vector.x < 0 || vector.x >= 1 || vector.y < 0 || vector.y >= 1 || vector.z < 0 || vector.z >= 1) {
    throw new Error(`${label} must be in [0, 1) on every axis`);
  }
}

function assertInt3(value: Int3, label: string) {
  if (![value.x, value.y, value.z].every((component) => Number.isSafeInteger(component) && Math.abs(component) <= MAXIMUM_ABSOLUTE_IMAGE)) {
    throw new Error(`${label} must contain bounded safe integers`);
  }
}

function wrapScalar(value: number) {
  const image = Math.floor(value);
  const wrapped = value - image;
  if (!(wrapped >= 0 && wrapped < 1) || !Number.isSafeInteger(image) || Math.abs(image) > MAXIMUM_ABSOLUTE_IMAGE) {
    throw new Error('periodic image exceeds the bounded safe integer domain');
  }
  return { wrapped: Object.is(wrapped, -0) ? 0 : wrapped, image: Object.is(image, -0) ? 0 : image };
}

function cloneFiniteVector(vector: Vector3) {
  assertFiniteVector(vector, 'vector');
  return {
    x: Object.is(vector.x, -0) ? 0 : vector.x,
    y: Object.is(vector.y, -0) ? 0 : vector.y,
    z: Object.is(vector.z, -0) ? 0 : vector.z,
  };
}

function assertFiniteVector(vector: Vector3, label: string) {
  if (!vector || ![vector.x, vector.y, vector.z].every(Number.isFinite)) throw new Error(`${label} must be finite`);
}

function roundVector(vector: Vector3): Int3 {
  return { x: Math.round(vector.x), y: Math.round(vector.y), z: Math.round(vector.z) };
}

function negateInt3(vector: Int3): Int3 {
  return {
    x: vector.x === 0 ? 0 : -vector.x,
    y: vector.y === 0 ? 0 : -vector.y,
    z: vector.z === 0 ? 0 : -vector.z,
  };
}

function compareInt3(left: Int3, right: Int3) {
  return left.x - right.x || left.y - right.y || left.z - right.z;
}

function compareStableToken(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareOrientedTieDisplacement(left: Vector3, right: Vector3, raw: Vector3, tolerance: number) {
  const orientation = Math.abs(raw.x) > tolerance ? Math.sign(raw.x)
    : Math.abs(raw.y) > tolerance ? Math.sign(raw.y)
      : Math.abs(raw.z) > tolerance ? Math.sign(raw.z) : 1;
  const dx = orientation * (left.x - right.x);
  if (Math.abs(dx) > tolerance) return dx;
  const dy = orientation * (left.y - right.y);
  if (Math.abs(dy) > tolerance) return dy;
  const dz = orientation * (left.z - right.z);
  return Math.abs(dz) > tolerance ? dz : 0;
}

function component(vector: Vector3, index: number) {
  return index === 0 ? vector.x : index === 1 ? vector.y : vector.z;
}

function subtractInt3(left: Int3, right: Int3): Int3 {
  const result = { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
  if (![result.x, result.y, result.z].every(Number.isSafeInteger)) throw new Error('periodic image delta exceeds the safe integer domain');
  return result;
}

function add(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
}

function subtract(left: Vector3, right: Vector3): Vector3 {
  return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z };
}

function scaleVector(vector: Vector3, factor: number): Vector3 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

function dot(left: Vector3, right: Vector3) {
  return left.x * right.x + left.y * right.y + left.z * right.z;
}

function cross(left: Vector3, right: Vector3): Vector3 {
  return {
    x: left.y * right.z - left.z * right.y,
    y: left.z * right.x - left.x * right.z,
    z: left.x * right.y - left.y * right.x,
  };
}

function magnitudeSquared(vector: Vector3) {
  return dot(vector, vector);
}

function magnitude(vector: Vector3) {
  return Math.sqrt(magnitudeSquared(vector));
}
