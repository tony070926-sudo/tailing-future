import { sha256DigestValue } from './canonical-json';
import {
  canonicalizeConnection,
  connectionIdentityKey,
  deepFreeze,
  type StructureDocument,
  type Vec3,
} from './structure-document';

export const STRUCTURE_DISPLAY_RADIUS = 0.34;
export const STRUCTURE_CONNECTION_DISPLAY_RADIUS = 0.075;
export const STRUCTURE_CELL_DISPLAY_RADIUS = 0.035;

export type StructureRenderWarning = Readonly<{
  code: 'degenerate-display-segment-skipped';
  segmentId: string;
  segmentKind: 'explicit-display-connection' | 'input-cell-edge';
  message: string;
}>;

export type UploadedVec3 = readonly [number, number, number];

export type StructureRenderAtom = Readonly<{
  id: string;
  atomicNumber: number;
  symbol: string;
  exactPositionAngstrom: Vec3;
  uploadPosition: UploadedVec3;
  uploadColorRgb: UploadedVec3;
  uploadUniformRadius: number;
}>;

export type StructureRenderSegment = Readonly<{
  id: string;
  kind: 'explicit-display-connection' | 'input-cell-edge';
  sourceGeometry: 'canonical-undirected-finite-edge-representative' | 'canonical-undirected-periodic-edge-representative' | 'declared-cell-edge';
  exactRepresentativeStartAngstrom: Vec3;
  exactRepresentativeEndAngstrom: Vec3;
  uploadStart: UploadedVec3;
  uploadEnd: UploadedVec3;
  uploadRadius: number;
  displayOnly: true;
}>;

export type StructureRenderModel = Readonly<{
  schemaVersion: 'tf.structure-render-model/0.1';
  sourceSemanticDigest: `sha256:${string}`;
  projection: Readonly<{
    purpose: 'nonphysical-display-projection';
    axes: readonly ['x', 'y', 'z'];
    offsetAngstrom: readonly [0, 0, 0];
    displayUnitsPerAngstrom: 1;
    gpuConversion: 'IEEE-754-binary32-Math.fround-then-positive-zero-normalization';
    atomCoordinateTransformApplied: false;
    cellCoordinateTransformApplied: false;
    connectionRepresentative: 'canonical-undirected-finite-edge' | 'canonical-undirected-periodic-edge-orbit';
    connectionRepresentativeEquation: 'r_B' | 'r_B_image=r_B+H*n';
    connectionRepresentativeMayApplyWholeLatticeTranslation: boolean;
    connectionImageShiftDimension: 'dimensionless';
    connectionImageShiftUnit: 'cell-lattice-coefficient';
    connectionImageShiftBasis: 'integer-coefficients-of-declared-cell-columns';
    float32RoundingApplied: true;
    atomRadiusBasis: 'uniform-nonphysical-display-radius';
    colorBasis: 'deterministic-visual-only-derived-from-atomic-number';
  }>;
  atoms: readonly StructureRenderAtom[];
  connections: readonly StructureRenderSegment[];
  cellEdges: readonly StructureRenderSegment[];
  warnings: readonly StructureRenderWarning[];
  bounds: Readonly<{
    exactMinimumAngstrom: Vec3;
    exactMaximumAngstrom: Vec3;
    exactCenterAngstrom: Vec3;
    displayFramingRadius: number;
    displayFramingRadiusDimension: 'display-length';
    displayFramingRadiusUnit: 'display-unit';
    displayFramingRadiusBasis: 'coordinate-envelope-plus-uniform-nonphysical-atom-radius';
    uploadCenter: UploadedVec3;
    uploadFramingRadius: number;
    uploadCameraDistance: number;
    uploadCameraNear: number;
    uploadCameraFar: number;
    uploadCameraMinimumDistance: number;
    uploadCameraMaximumDistance: number;
    uploadInitialCameraPosition: UploadedVec3;
  }>;
  unavailableOutputs: Readonly<{
    energy: null;
    atomicForces: null;
    stress: null;
    physicalCharge: null;
    bondOrder: null;
    electronDensity: null;
    orbitals: null;
    velocity: null;
    trajectory: null;
    uncertainty: null;
    causalEffect: null;
  }>;
  renderDigest: `sha256:${string}`;
}>;

export class StructureRenderRefusal extends Error {
  readonly code: 'nonfinite-float32-upload' | 'nonfinite-camera-bound';
  readonly path: string;

  constructor(code: StructureRenderRefusal['code'], path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'StructureRenderRefusal';
    this.code = code;
    this.path = path;
  }
}

export function createStructureRenderModel(document: StructureDocument): StructureRenderModel {
  const warnings: StructureRenderWarning[] = [];
  const points: Vec3[] = [];
  const orderedAtoms = [...document.atoms].sort((left, right) => asciiCompare(left.id, right.id));
  const atoms = orderedAtoms.map((atom, index): StructureRenderAtom => {
    const exactPositionAngstrom: Vec3 = [atom.position.x, atom.position.y, atom.position.z];
    points.push(exactPositionAngstrom);
    return {
      id: atom.id,
      atomicNumber: atom.element.atomicNumber,
      symbol: atom.element.symbol,
      exactPositionAngstrom,
      uploadPosition: uploadVec3(exactPositionAngstrom, `atoms[${index}].position`),
      uploadColorRgb: elementDisplayColor(atom.element.atomicNumber),
      uploadUniformRadius: uploadFloat(STRUCTURE_DISPLAY_RADIUS, `atoms[${index}].radius`),
    };
  });
  const atomById = new Map(document.atoms.map((atom) => [atom.id, atom] as const));
  const orderedConnections = document.connections
    .map(canonicalizeConnection)
    .sort((left, right) => (
      asciiCompare(connectionIdentityKey(left), connectionIdentityKey(right))
      || asciiCompare(left.id, right.id)
    ));
  const connections: StructureRenderSegment[] = [];
  for (const [index, connection] of orderedConnections.entries()) {
    const atomA = atomById.get(connection.atomAId)!;
    const atomB = atomById.get(connection.atomBId)!;
    const exactStartAngstrom: Vec3 = [atomA.position.x, atomA.position.y, atomA.position.z];
    let exactEndAngstrom: Vec3 = [atomB.position.x, atomB.position.y, atomB.position.z];
    if (document.boundary.cell) {
      const [a, b, c] = document.boundary.cell.vectors;
      const [na, nb, nc] = connection.imageShiftForB;
      exactEndAngstrom = [
        normalizeDerivedZero(exactEndAngstrom[0] + a[0] * na + b[0] * nb + c[0] * nc),
        normalizeDerivedZero(exactEndAngstrom[1] + a[1] * na + b[1] * nb + c[1] * nc),
        normalizeDerivedZero(exactEndAngstrom[2] + a[2] * na + b[2] * nb + c[2] * nc),
      ];
    }
    points.push(exactStartAngstrom, exactEndAngstrom);
    const uploadStart = uploadVec3(exactStartAngstrom, `connections[${index}].start`);
    const uploadEnd = uploadVec3(exactEndAngstrom, `connections[${index}].end`);
    if (vectorsEqual(exactStartAngstrom, exactEndAngstrom) || vectorsEqual(uploadStart, uploadEnd)) {
      warnings.push({
        code: 'degenerate-display-segment-skipped',
        segmentId: connection.id,
        segmentKind: 'explicit-display-connection',
        message: 'Explicit display connection has zero exact or Float32-projected length and was skipped without fabricating geometry.',
      });
      continue;
    }
    connections.push({
      id: connection.id,
      kind: 'explicit-display-connection',
      sourceGeometry: document.topology === 'periodic-3d'
        ? 'canonical-undirected-periodic-edge-representative'
        : 'canonical-undirected-finite-edge-representative',
      exactRepresentativeStartAngstrom: exactStartAngstrom,
      exactRepresentativeEndAngstrom: exactEndAngstrom,
      uploadStart,
      uploadEnd,
      uploadRadius: uploadFloat(STRUCTURE_CONNECTION_DISPLAY_RADIUS, `connections[${index}].radius`),
      displayOnly: true,
    });
  }
  const cellEdges = document.boundary.cell
    ? createCellEdges(document.boundary.cell.vectors, points, warnings)
    : [];
  const bounds = createBounds(points);
  const periodicConnectionRepresentation = document.topology === 'periodic-3d';
  const base = {
    schemaVersion: 'tf.structure-render-model/0.1' as const,
    sourceSemanticDigest: document.semanticDigest,
    projection: {
      purpose: 'nonphysical-display-projection' as const,
      axes: ['x', 'y', 'z'] as const,
      offsetAngstrom: [0, 0, 0] as const,
      displayUnitsPerAngstrom: 1 as const,
      gpuConversion: 'IEEE-754-binary32-Math.fround-then-positive-zero-normalization' as const,
      atomCoordinateTransformApplied: false as const,
      cellCoordinateTransformApplied: false as const,
      connectionRepresentative: periodicConnectionRepresentation
        ? 'canonical-undirected-periodic-edge-orbit' as const
        : 'canonical-undirected-finite-edge' as const,
      connectionRepresentativeEquation: periodicConnectionRepresentation
        ? 'r_B_image=r_B+H*n' as const
        : 'r_B' as const,
      connectionRepresentativeMayApplyWholeLatticeTranslation: periodicConnectionRepresentation,
      connectionImageShiftDimension: 'dimensionless' as const,
      connectionImageShiftUnit: 'cell-lattice-coefficient' as const,
      connectionImageShiftBasis: 'integer-coefficients-of-declared-cell-columns' as const,
      float32RoundingApplied: true as const,
      atomRadiusBasis: 'uniform-nonphysical-display-radius' as const,
      colorBasis: 'deterministic-visual-only-derived-from-atomic-number' as const,
    },
    atoms,
    connections,
    cellEdges,
    warnings,
    bounds,
    unavailableOutputs: {
      energy: null,
      atomicForces: null,
      stress: null,
      physicalCharge: null,
      bondOrder: null,
      electronDensity: null,
      orbitals: null,
      velocity: null,
      trajectory: null,
      uncertainty: null,
      causalEffect: null,
    },
  };
  return deepFreeze({ ...base, renderDigest: sha256DigestValue(base) });
}

export function uploadFloat(value: number, path: string): number {
  const uploaded = Math.fround(value);
  if (!Number.isFinite(uploaded)) {
    throw new StructureRenderRefusal('nonfinite-float32-upload', path, 'Float32 conversion is not finite.');
  }
  return uploaded === 0 ? 0 : uploaded;
}

function uploadVec3(vector: Vec3, path: string): UploadedVec3 {
  return [
    uploadFloat(vector[0], `${path}[0]`),
    uploadFloat(vector[1], `${path}[1]`),
    uploadFloat(vector[2], `${path}[2]`),
  ];
}

function createCellEdges(
  vectors: readonly [Vec3, Vec3, Vec3],
  points: Vec3[],
  warnings: StructureRenderWarning[],
): StructureRenderSegment[] {
  const [a, b, c] = vectors;
  const vertex = (na: number, nb: number, nc: number): Vec3 => [
    normalizeDerivedZero(a[0] * na + b[0] * nb + c[0] * nc),
    normalizeDerivedZero(a[1] * na + b[1] * nb + c[1] * nc),
    normalizeDerivedZero(a[2] * na + b[2] * nb + c[2] * nc),
  ];
  const segments: StructureRenderSegment[] = [];
  let id = 0;
  for (let axis = 0; axis < 3; axis += 1) {
    for (let u = 0; u <= 1; u += 1) {
      for (let v = 0; v <= 1; v += 1) {
        const startIndex = [0, 0, 0];
        const endIndex = [0, 0, 0];
        const otherAxes = [0, 1, 2].filter((candidate) => candidate !== axis);
        startIndex[otherAxes[0]] = u;
        startIndex[otherAxes[1]] = v;
        endIndex[otherAxes[0]] = u;
        endIndex[otherAxes[1]] = v;
        endIndex[axis] = 1;
        const exactStartAngstrom = vertex(startIndex[0], startIndex[1], startIndex[2]);
        const exactEndAngstrom = vertex(endIndex[0], endIndex[1], endIndex[2]);
        points.push(exactStartAngstrom, exactEndAngstrom);
        const uploadStart = uploadVec3(exactStartAngstrom, `cellEdges[${id}].start`);
        const uploadEnd = uploadVec3(exactEndAngstrom, `cellEdges[${id}].end`);
        if (vectorsEqual(uploadStart, uploadEnd)) {
          warnings.push({
            code: 'degenerate-display-segment-skipped',
            segmentId: `cell-edge-${id}`,
            segmentKind: 'input-cell-edge',
            message: 'Input cell edge collapsed under Float32 display projection and was skipped without fabricating geometry.',
          });
          id += 1;
          continue;
        }
        segments.push({
          id: `cell-edge-${id}`,
          kind: 'input-cell-edge',
          sourceGeometry: 'declared-cell-edge',
          exactRepresentativeStartAngstrom: exactStartAngstrom,
          exactRepresentativeEndAngstrom: exactEndAngstrom,
          uploadStart,
          uploadEnd,
          uploadRadius: uploadFloat(STRUCTURE_CELL_DISPLAY_RADIUS, `cellEdges[${id}].radius`),
          displayOnly: true,
        });
        id += 1;
      }
    }
  }
  return segments;
}

function createBounds(points: readonly Vec3[]): StructureRenderModel['bounds'] {
  if (points.length === 0) throw new StructureRenderRefusal('nonfinite-camera-bound', 'bounds', 'At least one validated atom is required.');
  const minimum: [number, number, number] = [...points[0]];
  const maximum: [number, number, number] = [...points[0]];
  for (const point of points) {
    for (let axis = 0; axis < 3; axis += 1) {
      minimum[axis] = Math.min(minimum[axis], point[axis]);
      maximum[axis] = Math.max(maximum[axis], point[axis]);
    }
  }
  const center: Vec3 = [
    normalizeDerivedZero((minimum[0] + maximum[0]) / 2),
    normalizeDerivedZero((minimum[1] + maximum[1]) / 2),
    normalizeDerivedZero((minimum[2] + maximum[2]) / 2),
  ];
  let radius = STRUCTURE_DISPLAY_RADIUS;
  for (const point of points) radius = Math.max(radius, Math.sqrt(squaredDistance(point, center)) + STRUCTURE_DISPLAY_RADIUS);
  const distance = Math.max(2, radius * 2.8);
  const near = Math.max(1e-4, distance / 100_000);
  const far = Math.max(100, distance + radius * 8);
  const minimumDistance = Math.max(near * 4, 0.001);
  const maximumDistance = Math.max(distance * 20, minimumDistance * 2);
  for (const [path, value] of [['radius', radius], ['distance', distance], ['near', near], ['far', far]] as const) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new StructureRenderRefusal('nonfinite-camera-bound', `bounds.${path}`, 'Camera bound must be finite and positive.');
    }
  }
  return {
    exactMinimumAngstrom: minimum,
    exactMaximumAngstrom: maximum,
    exactCenterAngstrom: center,
    displayFramingRadius: radius,
    displayFramingRadiusDimension: 'display-length',
    displayFramingRadiusUnit: 'display-unit',
    displayFramingRadiusBasis: 'coordinate-envelope-plus-uniform-nonphysical-atom-radius',
    uploadCenter: uploadVec3(center, 'bounds.center'),
    uploadFramingRadius: uploadFloat(radius, 'bounds.radius'),
    uploadCameraDistance: uploadFloat(distance, 'bounds.cameraDistance'),
    uploadCameraNear: uploadFloat(near, 'bounds.cameraNear'),
    uploadCameraFar: uploadFloat(far, 'bounds.cameraFar'),
    uploadCameraMinimumDistance: uploadFloat(minimumDistance, 'bounds.cameraMinimumDistance'),
    uploadCameraMaximumDistance: uploadFloat(maximumDistance, 'bounds.cameraMaximumDistance'),
    uploadInitialCameraPosition: uploadVec3([
      normalizeDerivedZero(center[0] + distance * 0.72),
      normalizeDerivedZero(center[1] + distance * 0.5),
      normalizeDerivedZero(center[2] + distance),
    ], 'bounds.initialCameraPosition'),
  };
}

function elementDisplayColor(atomicNumber: number): UploadedVec3 {
  const hue = ((atomicNumber * 137.50776405003785) % 360) / 360;
  const saturation = 0.58;
  const lightness = 0.55;
  const chroma = (1 - Math.abs(2 * lightness - 1)) * saturation;
  const scaled = hue * 6;
  const x = chroma * (1 - Math.abs((scaled % 2) - 1));
  const [red, green, blue] = scaled < 1 ? [chroma, x, 0]
    : scaled < 2 ? [x, chroma, 0]
      : scaled < 3 ? [0, chroma, x]
        : scaled < 4 ? [0, x, chroma]
          : scaled < 5 ? [x, 0, chroma]
            : [chroma, 0, x];
  const match = lightness - chroma / 2;
  return [
    uploadFloat(red + match, `elementColor[${atomicNumber}].r`),
    uploadFloat(green + match, `elementColor[${atomicNumber}].g`),
    uploadFloat(blue + match, `elementColor[${atomicNumber}].b`),
  ];
}

function squaredDistance(left: Vec3, right: Vec3): number {
  const dx = left[0] - right[0];
  const dy = left[1] - right[1];
  const dz = left[2] - right[2];
  return dx * dx + dy * dy + dz * dz;
}

function vectorsEqual(left: Vec3, right: Vec3): boolean {
  return left[0] === right[0] && left[1] === right[1] && left[2] === right[2];
}

function normalizeDerivedZero(value: number): number {
  return value === 0 ? 0 : value;
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}
