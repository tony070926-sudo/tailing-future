import { describe, expect, it, vi } from 'vitest';
import { canonicalJson } from './canonical-json';
import {
  STRUCTURE_MAX_ATOMS,
  STRUCTURE_MAX_CONNECTIONS,
  createDefaultStructureDraft,
  createSolverAdmissionReceipt,
  createValidationReceipt,
  exportStructureNativeJson,
  finalizeStructureDocument,
  makeAtomicFormalCharge,
  makeFiniteNetCharge,
  makePeriodicCellFormalCharge,
  makeSpinMultiplicity,
  parseAndValidateStructureNativeJson,
  deepFreeze,
  type StructureDocumentDraft,
} from './structure-document';

describe('tf.structure-document/0.1 semantic validation', () => {
  it('deep-freezes a deterministic default without inventing source or license clearance', () => {
    const first = finalizeStructureDocument(createDefaultStructureDraft());
    const replay = finalizeStructureDocument(createDefaultStructureDraft());
    expect(first).toEqual(replay);
    expect(first.semanticDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.provenance).toEqual({
      source: null,
      license: {
        spdxExpression: 'NOASSERTION',
        attribution: null,
        redistribution: 'unknown',
        status: 'not-provided',
        projectVerified: false,
      },
    });
    expect(first.connectionImageShiftFrame).toEqual({
      dimension: 'dimensionless',
      unit: 'cell-lattice-coefficient',
      basis: 'integer-coefficients-of-declared-cell-columns',
      applicability: 'periodic-3d-only',
      finitePolicy: 'zero-required-not-applied',
      endpoint: 'B',
      equation: 'r_image=r_B+H*n',
    });
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.atoms)).toBe(true);
    expect(Object.isFrozen(first.atoms[0].position)).toBe(true);

    const contradictoryLicense = createDefaultStructureDraft();
    contradictoryLicense.provenance.license.spdxExpression = 'MIT';
    expectCode(contradictoryLicense, 'not-provided requires NOASSERTION');
  });

  it('rejects invalid element pairing, duplicate IDs, unknown fields, -0, and exact bound overflow', () => {
    const mismatch = createDefaultStructureDraft();
    mismatch.atoms[0].element.symbol = 'N';
    expectCode(mismatch, 'exact catalog pair');

    const duplicate = createDefaultStructureDraft();
    duplicate.atoms.push(structuredClone(duplicate.atoms[0]));
    expectCode(duplicate, 'Duplicate atom ID');

    const unknown = createDefaultStructureDraft() as unknown as { atoms: Array<Record<string, unknown>> };
    unknown.atoms[0].mass = 12;
    expectCode(unknown, 'Expected exactly fields');

    const negativeZero = createDefaultStructureDraft();
    negativeZero.atoms[0].position.x = -0;
    expectCode(negativeZero, 'Negative zero');

    for (const coordinate of [-10_000, 10_000]) {
      const exact = createDefaultStructureDraft();
      exact.atoms[0].position.x = coordinate;
      expect(() => finalizeStructureDocument(exact)).not.toThrow();
    }
    const overflow = createDefaultStructureDraft();
    overflow.atoms[0].position.x = 10_000.000_001;
    expectCode(overflow, 'Expected -10000..10000');
  });

  it('accepts 4096 atoms and 8192 unique edges, then rejects 4097/8193', () => {
    const maximum = makeFiniteDraft(STRUCTURE_MAX_ATOMS);
    maximum.connections = makeUniqueFiniteConnections(maximum, STRUCTURE_MAX_CONNECTIONS);
    expect(finalizeStructureDocument(maximum).atoms).toHaveLength(STRUCTURE_MAX_ATOMS);
    expect(finalizeStructureDocument(maximum).connections).toHaveLength(STRUCTURE_MAX_CONNECTIONS);

    const tooManyAtoms = makeFiniteDraft(STRUCTURE_MAX_ATOMS + 1);
    expectCode(tooManyAtoms, 'Expected 1..4096 entries');
    const tooManyConnections = makeFiniteDraft(STRUCTURE_MAX_ATOMS);
    tooManyConnections.connections = [
      ...makeUniqueFiniteConnections(tooManyConnections, STRUCTURE_MAX_CONNECTIONS),
      connection('edge-overflow', 'atom-1', 'atom-2'),
    ];
    expectCode(tooManyConnections, 'Expected 0..8192 entries');
  }, 20_000);

  it('enforces finite/periodic topology and exact cell conditioning thresholds', () => {
    const partial = createPeriodicDraft();
    partial.boundary.periodicAxes = [true, false, true];
    expectCode(partial, 'Partial periodicity');

    const finiteCell = createDefaultStructureDraft();
    finiteCell.boundary.cell = periodicCell([[1, 0, 0], [0, 1, 0], [0, 0, 1]]);
    expectCode(finiteCell, 'cell=null');

    const zero = createPeriodicDraft();
    zero.boundary.cell!.vectors[0] = [0, 0, 0];
    expectCode(zero, 'at least 0.000001');

    const tooSmall = createPeriodicDraft();
    tooSmall.boundary.cell!.vectors[0] = [0.999e-6, 0, 0];
    expectCode(tooSmall, 'at least 0.000001');

    const exactMinimum = createPeriodicDraft();
    exactMinimum.boundary.cell!.vectors = [[1e-6, 0, 0], [0, 1, 0], [0, 0, 1]];
    expect(() => finalizeStructureDocument(exactMinimum)).not.toThrow();

    const leftHanded = createPeriodicDraft();
    leftHanded.boundary.cell!.vectors[2] = [0, 0, -1];
    expectCode(leftHanded, 'positive');

    const nearSingular = createPeriodicDraft();
    nearSingular.boundary.cell!.vectors = [[1, 0, 0], [0, 1, 0], [1, 1, 1e-13]];
    expectCode(nearSingular, 'Normalized triple product');
  });

  it('treats only atom and undirected-edge record order as unordered semantic sets', () => {
    const draft = createPeriodicDraft(3);
    draft.atoms[0].position = { x: 1, y: 2, z: 3 };
    draft.atoms[1].position = { x: 4, y: 5, z: 6 };
    draft.boundary.cell!.vectors = [[10, 0, 0], [0, 11, 0], [0, 0, 12]];
    draft.connections = [
      connection('edge-a', 'atom-1', 'atom-2', [1, 0, 0]),
      connection('edge-b', 'atom-2', 'atom-3', [0, 1, 0]),
    ];
    const reference = finalizeStructureDocument(draft);

    const recordPermutation = structuredClone(draft);
    recordPermutation.atoms.reverse();
    recordPermutation.connections.reverse();
    expect(finalizeStructureDocument(recordPermutation).semanticDigest).toBe(reference.semanticDigest);

    const endpointPermutation = structuredClone(draft);
    endpointPermutation.connections[0] = connection('edge-a', 'atom-2', 'atom-1', [-1, 0, 0]);
    expect(finalizeStructureDocument(endpointPermutation).semanticDigest).toBe(reference.semanticDigest);

    const coordinatePermutation = structuredClone(draft);
    coordinatePermutation.atoms[0].position = { x: 2, y: 1, z: 3 };
    expect(finalizeStructureDocument(coordinatePermutation).semanticDigest).not.toBe(reference.semanticDigest);

    const cellColumnPermutation = structuredClone(draft);
    cellColumnPermutation.boundary.cell!.vectors = [[0, 11, 0], [0, 0, 12], [10, 0, 0]];
    expect(finalizeStructureDocument(cellColumnPermutation).semanticDigest).not.toBe(reference.semanticDigest);
  });

  it('enforces missing endpoints, topology-neutral undirected identity, image shifts, and self-edge rules', () => {
    const missing = createDefaultStructureDraft();
    missing.connections = [connection('missing', 'atom-1', 'atom-x')];
    expectCode(missing, 'does not exist');

    const finiteShift = makeFiniteDraft(2);
    finiteShift.connections = [connection('shift', 'atom-1', 'atom-2', [1, 0, 0])];
    expectCode(finiteShift, 'Finite connections require zero');

    const maxShift = createPeriodicDraft(2);
    maxShift.connections = [connection('max', 'atom-1', 'atom-2', [16, -16, 16])];
    expect(() => finalizeStructureDocument(maxShift)).not.toThrow();
    maxShift.connections[0].imageShiftForB[0] = 17;
    expectCode(maxShift, 'Expected -16..16');

    const duplicate = createPeriodicDraft(2);
    duplicate.connections = [
      connection('one', 'atom-1', 'atom-2', [1, -2, 3]),
      connection('two', 'atom-2', 'atom-1', [-1, 2, -3]),
    ];
    expectCode(duplicate, 'Duplicate undirected edge');

    const finiteDuplicate = makeFiniteDraft(2);
    finiteDuplicate.connections = [
      connection('finite-one', 'atom-1', 'atom-2'),
      connection('finite-two', 'atom-2', 'atom-1'),
    ];
    expectCode(finiteDuplicate, 'Duplicate undirected edge');
    let finiteDiagnostic: string | null = null;
    try {
      finalizeStructureDocument(finiteDuplicate);
    } catch (error) {
      if (!(error instanceof Error)) throw error;
      finiteDiagnostic = error.message;
    }
    expect(finiteDiagnostic).not.toBeNull();
    expect(finiteDiagnostic).not.toContain('periodic');

    const zeroSelf = createPeriodicDraft();
    zeroSelf.connections = [connection('self', 'atom-1', 'atom-1', [0, 0, 0])];
    expectCode(zeroSelf, 'Zero-shift self');
    zeroSelf.connections[0].imageShiftForB = [1, 0, 0];
    expect(() => finalizeStructureDocument(zeroSelf)).not.toThrow();
  });

  it('keeps finite charge/spin separate from periodic per-cell formal bookkeeping', () => {
    const hPlus = makeFiniteDraft(1);
    hPlus.finiteSystem = { netCharge: makeFiniteNetCharge(1), spinMultiplicity: makeSpinMultiplicity(1) };
    expect(() => finalizeStructureDocument(hPlus)).not.toThrow();

    const hMinus = makeFiniteDraft(1);
    hMinus.finiteSystem = { netCharge: makeFiniteNetCharge(-1), spinMultiplicity: makeSpinMultiplicity(1) };
    expect(() => finalizeStructureDocument(hMinus)).not.toThrow();

    const neutralDoublet = makeFiniteDraft(1);
    neutralDoublet.finiteSystem = { netCharge: makeFiniteNetCharge(0), spinMultiplicity: makeSpinMultiplicity(2) };
    expect(() => finalizeStructureDocument(neutralDoublet)).not.toThrow();

    const neutralSinglet = makeFiniteDraft(1);
    neutralSinglet.finiteSystem = { netCharge: makeFiniteNetCharge(0), spinMultiplicity: makeSpinMultiplicity(1) };
    expectCode(neutralSinglet, 'Multiplicity violates');

    const heliumTriplet = makeFiniteDraft(1, 2, 'He');
    heliumTriplet.finiteSystem = { netCharge: makeFiniteNetCharge(0), spinMultiplicity: makeSpinMultiplicity(3) };
    expect(() => finalizeStructureDocument(heliumTriplet)).not.toThrow();
    heliumTriplet.finiteSystem.spinMultiplicity = makeSpinMultiplicity(2);
    expectCode(heliumTriplet, 'Multiplicity violates');

    const periodic = createPeriodicDraft();
    periodic.atoms[0].formalCharge = makeAtomicFormalCharge(1);
    periodic.periodicCellFormalCharge = makePeriodicCellFormalCharge(1);
    expect(finalizeStructureDocument(periodic).periodicCellFormalCharge?.limitations).toMatch(/not-physical/);
    periodic.finiteSystem = { netCharge: makeFiniteNetCharge(0), spinMultiplicity: null };
    expectCode(periodic, 'rejects finite-system');
  });

  it('sums 4096 safe-integer formal charges exactly with BigInt', () => {
    const draft = makeFiniteDraft(4096);
    const charge = Number.MAX_SAFE_INTEGER;
    draft.atoms.forEach((atom, index) => {
      atom.formalCharge = makeAtomicFormalCharge(index < 2048 ? charge : -charge);
    });
    draft.finiteSystem = { netCharge: makeFiniteNetCharge(0), spinMultiplicity: null };
    expect(() => finalizeStructureDocument(draft)).not.toThrow();
    draft.atoms[4095].formalCharge = makeAtomicFormalCharge(-charge + 1);
    expectCode(draft, 'Exact atomic formal-charge sum');
  });

  it('creates three digest-bound fixed abstentions and never calls injected sentinels', () => {
    const document = finalizeStructureDocument(createDefaultStructureDraft());
    const validation = createValidationReceipt(document);
    const sentinels = {
      classicalAtomistic: vi.fn(() => { throw new Error('must not call'); }),
      machineLearnedInteratomic: vi.fn(() => { throw new Error('must not call'); }),
      electronicStructure: vi.fn(() => { throw new Error('must not call'); }),
    };
    const receipt = createSolverAdmissionReceipt(document, validation, sentinels);
    expect(receipt.channels).toHaveLength(3);
    expect(receipt.channels.every((channel) => (
      channel.semanticDigest === document.semanticDigest
      && channel.validationReceiptDigest === validation.receiptDigest
      && channel.decision === 'abstain'
      && channel.attempted === false
      && channel.solverInvoked === false
      && channel.backend === null
      && Object.values(channel.outputs).every((output) => output === null)
    ))).toBe(true);
    expect(sentinels.classicalAtomistic).not.toHaveBeenCalled();
    expect(sentinels.machineLearnedInteratomic).not.toHaveBeenCalled();
    expect(sentinels.electronicStructure).not.toHaveBeenCalled();
  });

  it('snapshots only exact plain validation receipts before binding admission evidence', () => {
    const document = finalizeStructureDocument(createDefaultStructureDraft());
    const validation = createValidationReceipt(document);
    const accessor = { ...validation } as Record<string, unknown>;
    Object.defineProperty(accessor, 'semanticDigest', { enumerable: true, get: () => validation.semanticDigest });
    expect(() => createSolverAdmissionReceipt(document, accessor as never)).toThrow('Properties must be enumerable defined data properties');
    expect(() => createSolverAdmissionReceipt(document, { ...validation, extra: true } as never)).toThrow('Expected exactly fields');
    expect(() => createSolverAdmissionReceipt(document, new Proxy(validation, {}) as never)).toThrow('cloneable plain data record');

    const mutable = { ...validation };
    const receipt = createSolverAdmissionReceipt(document, mutable);
    mutable.semanticDigest = `sha256:${'1'.repeat(64)}`;
    expect(receipt.validationReceiptDigest).toBe(validation.receiptDigest);
    expect(new Set(receipt.channels.map((channel) => channel.validationReceiptDigest))).toEqual(new Set([validation.receiptDigest]));
  });

  it('uses JSON Schema Unicode code-point length semantics at astral boundaries', () => {
    const exact = createDefaultStructureDraft();
    exact.title = '🧪'.repeat(160);
    expect(finalizeStructureDocument(exact).title).toBe(exact.title);
    exact.title += '🧪';
    expectCode(exact, '1..160 Unicode code points');
  });

  it('stops Unicode code-point validation at the declared bound without materializing a large array', () => {
    const originalIterator = String.prototype[Symbol.iterator];
    let nextCalls = 0;
    const iterator = vi.spyOn(String.prototype, Symbol.iterator).mockImplementation(function (this: string) {
      const source = originalIterator.call(this);
      return {
        next() {
          nextCalls += 1;
          return source.next();
        },
        [Symbol.iterator]() { return this; },
      } as StringIterator<string>;
    });
    const draft = createDefaultStructureDraft();
    draft.title = 'x'.repeat(1_000_000);
    expectCode(draft, '1..160 Unicode code points');
    iterator.mockRestore();
    expect(nextCalls).toBeLessThan(1_000);
  });

  it('rejects drift in the machine-readable image-shift dimension, unit, basis, endpoint, or equation', () => {
    const draft = createDefaultStructureDraft();
    draft.connectionImageShiftFrame.unit = 'fractional-coordinate' as never;
    expectCode(draft, 'cell-lattice-coefficient');
  });

  it('rejects pseudo-index array properties instead of omitting them from validation or digests', () => {
    const draft = createDefaultStructureDraft();
    Object.defineProperty(draft.atoms, '4294967295', { value: draft.atoms[0], enumerable: true, configurable: true });
    expectCode(draft, 'Array extra properties');

    const decorated = [1];
    Object.defineProperty(decorated, '4294967295', { value: 2, enumerable: true, configurable: true });
    expect(() => canonicalJson(decorated)).toThrow('Canonical JSON arrays cannot have extra properties');
  });

  it('deep-freezes hidden and symbol-owned descendants of its exported generic helper', () => {
    const hidden = { value: 1 };
    const symbol = { value: 2 };
    const key = Symbol('child');
    const root = { visible: {} } as Record<PropertyKey, unknown>;
    Object.defineProperty(root, 'hidden', { value: hidden });
    root[key] = symbol;
    deepFreeze(root);
    expect(Object.isFrozen(root)).toBe(true);
    expect(Object.isFrozen(hidden)).toBe(true);
    expect(Object.isFrozen(symbol)).toBe(true);
  });

  it('requires a semantic digest in a native document while keeping builder finalization additive', () => {
    const draft = createDefaultStructureDraft();
    expect(() => finalizeStructureDocument(draft)).not.toThrow();
    const bytes = new TextEncoder().encode(JSON.stringify(draft));
    expect(() => parseAndValidateStructureNativeJson(bytes, 'missing-digest.tfstructure.json'))
      .toThrow('must carry its semantic digest');
    const complete = finalizeStructureDocument(draft);
    const completeBytes = new TextEncoder().encode(JSON.stringify(complete));
    expect(() => parseAndValidateStructureNativeJson(completeBytes, 'structure.cif'))
      .toThrow('Only .tfstructure.json');
  });

  it('round-trips native export, rejects NUL, and persists the maximum semantic cardinality', () => {
    const document = finalizeStructureDocument(createDefaultStructureDraft());
    const bytes = exportStructureNativeJson(document);
    const imported = parseAndValidateStructureNativeJson(bytes, 'roundtrip.tfstructure.json');
    expect(imported.document).toEqual(document);
    expect(imported.transportReceipt.byteLength).toBe(bytes.byteLength);

    const nul = createDefaultStructureDraft();
    nul.title = 'bad\u0000title';
    expectCode(nul, 'NUL characters are forbidden');

    const maximum = makeFiniteDraft(STRUCTURE_MAX_ATOMS);
    maximum.connections = makeUniqueFiniteConnections(maximum, STRUCTURE_MAX_CONNECTIONS);
    const maximumDocument = finalizeStructureDocument(maximum);
    const maximumBytes = exportStructureNativeJson(maximumDocument);
    expect(maximumBytes.byteLength).toBeLessThanOrEqual(16_777_216);
    const maximumRoundTrip = parseAndValidateStructureNativeJson(maximumBytes, 'maximum.tfstructure.json');
    expect(maximumRoundTrip.document.semanticDigest).toBe(maximumDocument.semanticDigest);
    expect(maximumRoundTrip.document.atoms).toHaveLength(STRUCTURE_MAX_ATOMS);
    expect(maximumRoundTrip.document.connections).toHaveLength(STRUCTURE_MAX_CONNECTIONS);
  }, 40_000);
});

function expectCode(draft: unknown, message: string) {
  expect(() => finalizeStructureDocument(draft)).toThrow(message);
}

function makeFiniteDraft(count: number, atomicNumber = 1, symbol = 'H'): StructureDocumentDraft {
  const draft = createDefaultStructureDraft();
  draft.atoms = Array.from({ length: count }, (_, index) => ({
    id: `atom-${index + 1}`,
    element: { atomicNumber, symbol },
    position: { x: index % 100, y: Math.floor(index / 100) % 100, z: Math.floor(index / 10_000) },
    isotope: null,
    formalCharge: null,
  }));
  return draft;
}

function createPeriodicDraft(count = 1): StructureDocumentDraft {
  const draft = makeFiniteDraft(count);
  draft.topology = 'periodic-3d';
  draft.boundary = {
    periodicAxes: [true, true, true],
    cell: periodicCell([[10, 0, 0], [0, 10, 0], [0, 0, 10]]),
  };
  draft.finiteSystem = null;
  draft.periodicCellFormalCharge = null;
  return draft;
}

function periodicCell(vectors: [[number, number, number], [number, number, number], [number, number, number]]) {
  return {
    convention: 'H=[a b c]-column-vectors' as const,
    dimension: 'length' as const,
    unit: 'angstrom' as const,
    basis: 'structure-local-cartesian' as const,
    vectors,
  };
}

function connection(
  id: string,
  atomAId: string,
  atomBId: string,
  imageShiftForB: [number, number, number] = [0, 0, 0],
): StructureDocumentDraft['connections'][number] {
  return {
    id,
    atomAId,
    atomBId,
    order: 'unknown',
    provenance: 'user-declared',
    role: 'display-only',
    energeticInteraction: false,
    imageShiftForB,
  };
}

function makeUniqueFiniteConnections(draft: StructureDocumentDraft, count: number) {
  const edges: StructureDocumentDraft['connections'] = [];
  for (let left = 0; left < draft.atoms.length && edges.length < count; left += 1) {
    for (let right = left + 1; right < draft.atoms.length && edges.length < count; right += 1) {
      edges.push(connection(`edge-${edges.length + 1}`, draft.atoms[left].id, draft.atoms[right].id));
    }
  }
  return edges;
}
