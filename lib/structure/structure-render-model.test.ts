import { describe, expect, it } from 'vitest';
import {
  createDefaultStructureDraft,
  finalizeStructureDocument,
  type StructureDocumentDraft,
} from './structure-document';
import {
  StructureRenderRefusal,
  createStructureRenderModel,
  uploadFloat,
} from './structure-render-model';
import { ELEMENT_IDENTITIES } from './element-catalog';

describe('pure bounded structure render model', () => {
  it('preserves exact doubles and uses only explicit identity Float32 projection', () => {
    const draft = createDefaultStructureDraft();
    draft.atoms[0].position = { x: 1 / 3, y: 2 / 7, z: 10_000 };
    const document = finalizeStructureDocument(draft);
    const model = createStructureRenderModel(document);
    expect(model.atoms[0].exactPositionAngstrom).toEqual([1 / 3, 2 / 7, 10_000]);
    expect(model.atoms[0].uploadPosition).toEqual([Math.fround(1 / 3), Math.fround(2 / 7), Math.fround(10_000)]);
    expect(model.projection).toMatchObject({
      axes: ['x', 'y', 'z'],
      offsetAngstrom: [0, 0, 0],
      displayUnitsPerAngstrom: 1,
      gpuConversion: 'IEEE-754-binary32-Math.fround-then-positive-zero-normalization',
      atomCoordinateTransformApplied: false,
      cellCoordinateTransformApplied: false,
      connectionRepresentative: 'canonical-undirected-finite-edge',
      connectionRepresentativeEquation: 'r_B',
      connectionRepresentativeMayApplyWholeLatticeTranslation: false,
      connectionImageShiftDimension: 'dimensionless',
      connectionImageShiftUnit: 'cell-lattice-coefficient',
      connectionImageShiftBasis: 'integer-coefficients-of-declared-cell-columns',
      float32RoundingApplied: true,
      atomRadiusBasis: 'uniform-nonphysical-display-radius',
      colorBasis: 'deterministic-visual-only-derived-from-atomic-number',
    });
    expect(model.connections).toEqual([]);
    expect(model.cellEdges).toEqual([]);
    expect(model.renderDigest).toMatch(/^sha256:/);
    expect(Object.isFrozen(model)).toBe(true);
  });

  it('uses exactly rB+H*n and keeps maximum-shift uploads finite', () => {
    const draft = periodicDraft();
    draft.atoms[0].position = { x: 10_000, y: -10_000, z: 10_000 };
    draft.atoms[1].position = { x: -10_000, y: 10_000, z: -10_000 };
    draft.boundary.cell!.vectors = [[10_000, 1, 2], [3, 10_000, 4], [5, 6, 10_000]];
    draft.connections = [{
      id: 'edge-1', atomAId: 'atom-1', atomBId: 'atom-2', order: 'single',
      provenance: 'user-declared', role: 'display-only', energeticInteraction: false,
      imageShiftForB: [16, -16, 16],
    }];
    const model = createStructureRenderModel(finalizeStructureDocument(draft));
    expect(model.connections[0]).toMatchObject({
      sourceGeometry: 'canonical-undirected-periodic-edge-representative',
    });
    expect(model.projection).toMatchObject({
      connectionRepresentative: 'canonical-undirected-periodic-edge-orbit',
      connectionRepresentativeEquation: 'r_B_image=r_B+H*n',
      connectionRepresentativeMayApplyWholeLatticeTranslation: true,
    });
    expect(model.connections[0].exactRepresentativeEndAngstrom).toEqual([
      -10_000 + 10_000 * 16 + 3 * -16 + 5 * 16,
      10_000 + 1 * 16 + 10_000 * -16 + 6 * 16,
      -10_000 + 2 * 16 + 4 * -16 + 10_000 * 16,
    ]);
    expect(allNumbers(model).every(Number.isFinite)).toBe(true);
    expect(model.cellEdges).toHaveLength(12);
  });

  it('uses one canonical visual representative for semantically equivalent record and edge orientation', () => {
    const draft = periodicDraft();
    draft.connections = [{
      id: 'edge-1', atomAId: 'atom-1', atomBId: 'atom-2', order: 'single',
      provenance: 'user-declared', role: 'display-only', energeticInteraction: false,
      imageShiftForB: [1, 0, 0],
    }];
    const referenceDocument = finalizeStructureDocument(draft);
    const equivalent = structuredClone(draft);
    equivalent.atoms.reverse();
    equivalent.connections[0] = {
      ...equivalent.connections[0],
      atomAId: 'atom-2', atomBId: 'atom-1', imageShiftForB: [-1, 0, 0],
    };
    const equivalentDocument = finalizeStructureDocument(equivalent);
    expect(equivalentDocument.semanticDigest).toBe(referenceDocument.semanticDigest);
    expect(createStructureRenderModel(equivalentDocument)).toEqual(createStructureRenderModel(referenceDocument));
  });

  it('labels finite connections as finite edges with no lattice mapping', () => {
    const draft = createDefaultStructureDraft();
    draft.atoms.push({
      id: 'atom-2', element: { atomicNumber: 1, symbol: 'H' },
      position: { x: 1, y: 0, z: 0 }, isotope: null, formalCharge: null,
    });
    draft.connections = [{
      id: 'finite-edge', atomAId: 'atom-1', atomBId: 'atom-2', order: 'unknown',
      provenance: 'user-declared', role: 'display-only', energeticInteraction: false,
      imageShiftForB: [0, 0, 0],
    }];
    const model = createStructureRenderModel(finalizeStructureDocument(draft));
    expect(model.connections[0].sourceGeometry).toBe('canonical-undirected-finite-edge-representative');
    expect(model.projection).toMatchObject({
      connectionRepresentative: 'canonical-undirected-finite-edge',
      connectionRepresentativeEquation: 'r_B',
      connectionRepresentativeMayApplyWholeLatticeTranslation: false,
    });
  });

  it('admits every Z=1..118 identity into the render model without implying solver coverage', () => {
    const draft = createDefaultStructureDraft();
    draft.atoms = ELEMENT_IDENTITIES.map((identity, index) => ({
      id: `atom-${index + 1}`,
      element: { atomicNumber: identity.atomicNumber, symbol: identity.symbol },
      position: { x: index, y: 0, z: 0 },
      isotope: null,
      formalCharge: null,
    }));
    const model = createStructureRenderModel(finalizeStructureDocument(draft));
    expect(model.atoms).toHaveLength(118);
    expect(model.atoms.map((atom) => atom.atomicNumber).sort((a, b) => a - b)).toEqual(Array.from({ length: 118 }, (_, index) => index + 1));
    expect(Object.keys(model.unavailableOutputs).sort()).toEqual([
      'atomicForces', 'bondOrder', 'causalEffect', 'electronDensity', 'energy', 'orbitals',
      'physicalCharge', 'stress', 'trajectory', 'uncertainty', 'velocity',
    ]);
    expect(model.unavailableOutputs.causalEffect).toBeNull();
    expect(Object.values(model.unavailableOutputs).every((value) => value === null)).toBe(true);
  });

  it('skips a zero-length explicit segment with a warning and fabricates no replacement', () => {
    const draft = createDefaultStructureDraft();
    draft.atoms.push({
      id: 'atom-2', element: { atomicNumber: 1, symbol: 'H' },
      position: { x: 0, y: 0, z: 0 }, isotope: null, formalCharge: null,
    });
    draft.connections = [{
      id: 'overlap', atomAId: 'atom-1', atomBId: 'atom-2', order: 'unknown',
      provenance: 'user-declared', role: 'display-only', energeticInteraction: false,
      imageShiftForB: [0, 0, 0],
    }];
    const model = createStructureRenderModel(finalizeStructureDocument(draft));
    expect(model.connections).toEqual([]);
    expect(model.warnings).toEqual([expect.objectContaining({
      code: 'degenerate-display-segment-skipped',
      segmentId: 'overlap',
      segmentKind: 'explicit-display-connection',
    })]);
  });

  it('also skips a nonzero double segment that collapses to zero under explicit Float32 projection', () => {
    const draft = createDefaultStructureDraft();
    draft.atoms.push({
      id: 'atom-2', element: { atomicNumber: 1, symbol: 'H' },
      position: { x: 1e-50, y: 0, z: 0 }, isotope: null, formalCharge: null,
    });
    draft.connections = [{
      id: 'f32-overlap', atomAId: 'atom-1', atomBId: 'atom-2', order: 'unknown',
      provenance: 'user-declared', role: 'display-only', energeticInteraction: false,
      imageShiftForB: [0, 0, 0],
    }];
    const model = createStructureRenderModel(finalizeStructureDocument(draft));
    expect(model.connections).toEqual([]);
    expect(model.warnings[0]).toMatchObject({ segmentId: 'f32-overlap' });
  });

  it('normalizes only arithmetic-derived zeros for a valid right-handed signed cell', () => {
    const draft = periodicDraft();
    draft.boundary.cell!.vectors = [[-1, 0, 0], [-1, -1, 0], [-1, 0, 1]];
    const document = finalizeStructureDocument(draft);
    const model = createStructureRenderModel(document);
    expect(model.cellEdges).toHaveLength(12);
    expect(allNumbers(model).every((value) => !Object.is(value, -0))).toBe(true);
    expect(document.boundary.cell!.vectors).toEqual([[-1, 0, 0], [-1, -1, 0], [-1, 0, 1]]);
  });

  it('skips cell edges that collapse only after Float32 projection with explicit warnings', () => {
    const draft = periodicDraft();
    draft.boundary.cell!.vectors = [[1e-6, 0, 0], [10_000, 1, 0], [10_000, 0, 1]];
    const model = createStructureRenderModel(finalizeStructureDocument(draft));
    expect(model.cellEdges.length).toBeLessThan(12);
    expect(model.warnings.some((warning) => (
      warning.segmentKind === 'input-cell-edge'
      && warning.code === 'degenerate-display-segment-skipped'
    ))).toBe(true);
    for (const edge of model.cellEdges) expect(edge.uploadStart).not.toEqual(edge.uploadEnd);
  });

  it('refuses nonfinite uploads and normalizes either signed underflow zero to positive zero', () => {
    expectRefusal(() => uploadFloat(Number.POSITIVE_INFINITY, 'test'), 'nonfinite-float32-upload');
    expect(uploadFloat(-1e-50, 'test')).toBe(0);
    expect(Object.is(uploadFloat(-1e-50, 'test'), -0)).toBe(false);
    expect(uploadFloat(1e-50, 'test')).toBe(0);
  });

  it('renders a valid negative subnormal coordinate symmetrically while retaining its exact document value', () => {
    const draft = createDefaultStructureDraft();
    draft.atoms[0].position.x = -1e-50;
    const model = createStructureRenderModel(finalizeStructureDocument(draft));
    expect(model.atoms[0].exactPositionAngstrom[0]).toBe(-1e-50);
    expect(model.atoms[0].uploadPosition[0]).toBe(0);
    expect(Object.is(model.atoms[0].uploadPosition[0], -0)).toBe(false);
  });

  it('labels camera padding as visual-only display framing rather than an exact scientific radius', () => {
    const model = createStructureRenderModel(finalizeStructureDocument(createDefaultStructureDraft()));
    expect(model.bounds).toMatchObject({
      displayFramingRadiusDimension: 'display-length',
      displayFramingRadiusUnit: 'display-unit',
      displayFramingRadiusBasis: 'coordinate-envelope-plus-uniform-nonphysical-atom-radius',
    });
    expect(model.bounds).not.toHaveProperty('exactRadiusAngstrom');
  });
});

function periodicDraft(): StructureDocumentDraft {
  const draft = createDefaultStructureDraft();
  draft.atoms.push({
    id: 'atom-2', element: { atomicNumber: 8, symbol: 'O' },
    position: { x: 1, y: 1, z: 1 }, isotope: null, formalCharge: null,
  });
  draft.topology = 'periodic-3d';
  draft.boundary = {
    periodicAxes: [true, true, true],
    cell: {
      convention: 'H=[a b c]-column-vectors', dimension: 'length', unit: 'angstrom',
      basis: 'structure-local-cartesian', vectors: [[10, 0, 0], [0, 10, 0], [0, 0, 10]],
    },
  };
  draft.finiteSystem = null;
  return draft;
}

function allNumbers(value: unknown): number[] {
  if (typeof value === 'number') return [value];
  if (Array.isArray(value)) return value.flatMap(allNumbers);
  if (value && typeof value === 'object') return Object.values(value).flatMap(allNumbers);
  return [];
}

function expectRefusal(callback: () => unknown, code: StructureRenderRefusal['code']) {
  try {
    callback();
    throw new Error('Expected render refusal.');
  } catch (error) {
    expect(error).toBeInstanceOf(StructureRenderRefusal);
    expect((error as StructureRenderRefusal).code).toBe(code);
  }
}
