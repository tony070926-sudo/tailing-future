import { canonicalJson, sha256DigestValue } from './canonical-json';
import { requireElementPair } from './element-catalog';
import {
  encodeStructureNativeJson,
  parseStructureNativeJsonBytes,
  STRUCTURE_MAX_FILE_BYTES,
  STRUCTURE_NATIVE_EXTENSION,
  type StructureTransportReceipt,
} from './strict-json';

export const STRUCTURE_DOCUMENT_SCHEMA_VERSION = 'tf.structure-document/0.1' as const;
export const STRUCTURE_VALIDATION_POLICY_VERSION = 'tf.structure-validation-policy/0.1' as const;
export const STRUCTURE_SOLVER_ADMISSION_POLICY_VERSION = 'tf.structure-solver-admission-policy/0.1' as const;
export const STRUCTURE_MAX_ATOMS = 4096;
export const STRUCTURE_MAX_CONNECTIONS = 8192;
export const STRUCTURE_COORDINATE_LIMIT_ANGSTROM = 10_000;
export const STRUCTURE_MIN_CELL_VECTOR_NORM_ANGSTROM = 1e-6;
export const STRUCTURE_MIN_NORMALIZED_TRIPLE_PRODUCT = 1e-12;
export const STRUCTURE_MAX_IMAGE_SHIFT = 16;

export type Vec3 = readonly [number, number, number];
export type StructureTopology = 'finite' | 'periodic-3d';
export type ConnectionOrder = 'unknown' | 'single' | 'double' | 'triple' | 'aromatic';
export type ConnectionProvenance = 'user-declared' | 'explicit-import';

export type IsotopeDeclaration = Readonly<{
  massNumber: number;
  dimension: 'dimensionless';
  basis: 'nucleon-count';
  status: 'user-declared-existence-unverified';
  projectVerified: false;
}>;

export type AtomicFormalChargeDeclaration = Readonly<{
  value: number;
  unit: 'elementary-charge';
  dimension: 'electric-charge';
  basis: 'formal-bookkeeping';
  status: 'user-declared-unverified';
  projectVerified: false;
}>;

export type StructureAtom = Readonly<{
  id: string;
  element: Readonly<{ atomicNumber: number; symbol: string }>;
  position: Readonly<{ x: number; y: number; z: number }>;
  isotope: IsotopeDeclaration | null;
  formalCharge: AtomicFormalChargeDeclaration | null;
}>;

export type StructureConnection = Readonly<{
  id: string;
  atomAId: string;
  atomBId: string;
  order: ConnectionOrder;
  provenance: ConnectionProvenance;
  role: 'display-only';
  energeticInteraction: false;
  imageShiftForB: Vec3;
}>;

export type StructureCell = Readonly<{
  convention: 'H=[a b c]-column-vectors';
  dimension: 'length';
  unit: 'angstrom';
  basis: 'structure-local-cartesian';
  vectors: readonly [Vec3, Vec3, Vec3];
}>;

export type ConnectionImageShiftFrame = Readonly<{
  dimension: 'dimensionless';
  unit: 'cell-lattice-coefficient';
  basis: 'integer-coefficients-of-declared-cell-columns';
  applicability: 'periodic-3d-only';
  finitePolicy: 'zero-required-not-applied';
  endpoint: 'B';
  equation: 'r_image=r_B+H*n';
}>;

export type FiniteSystemDeclaration = Readonly<{
  netCharge: null | Readonly<{
    value: number;
    unit: 'elementary-charge';
    dimension: 'electric-charge';
    basis: 'finite-system-electron-deficit';
    signConvention: 'Q=+1-means-one-electron-fewer-than-nuclear-charge';
    status: 'user-declared-unverified';
    projectVerified: false;
  }>;
  spinMultiplicity: null | Readonly<{
    value: number;
    dimension: 'dimensionless';
    basis: 'finite-system-2S-plus-1';
    status: 'user-declared-unverified';
    projectVerified: false;
  }>;
}>;

export type PeriodicCellFormalChargeDeclaration = Readonly<{
  value: number;
  unit: 'elementary-charge';
  dimension: 'electric-charge';
  basis: 'formal-bookkeeping-per-declared-cell';
  limitations: 'not-physical-partial-charge-background-electrostatic-solvability-electron-count-or-spin';
  status: 'user-declared-unverified';
  projectVerified: false;
}>;

export type StructureDocumentCore = Readonly<{
  schemaVersion: typeof STRUCTURE_DOCUMENT_SCHEMA_VERSION;
  documentId: string;
  title: string;
  topology: StructureTopology;
  classification: null | Readonly<{
    value: string;
    status: 'user-declared-unverified';
    projectVerified: false;
  }>;
  coordinateFrame: Readonly<{
    coordinateSystem: 'cartesian';
    dimension: 'length';
    unit: 'angstrom';
    basis: 'structure-local';
    inputTransform: 'none-preserve-input';
  }>;
  connectionImageShiftFrame: ConnectionImageShiftFrame;
  boundary: Readonly<{
    periodicAxes: readonly [boolean, boolean, boolean];
    cell: StructureCell | null;
  }>;
  finiteSystem: FiniteSystemDeclaration | null;
  periodicCellFormalCharge: PeriodicCellFormalChargeDeclaration | null;
  atoms: readonly StructureAtom[];
  connections: readonly StructureConnection[];
  provenance: Readonly<{
    source: null | Readonly<{
      identity: string;
      revision: string | null;
      status: 'user-declared-unverified';
      projectVerified: false;
    }>;
    license: Readonly<{
      spdxExpression: string;
      attribution: string | null;
      redistribution: 'unknown' | 'user-declared-allowed' | 'user-declared-prohibited';
      status: 'not-provided' | 'user-declared-unverified';
      projectVerified: false;
    }>;
  }>;
}>;

export type StructureDocument = StructureDocumentCore & Readonly<{
  semanticDigest: `sha256:${string}`;
}>;

type DeepMutable<T> = T extends object
  ? { -readonly [Key in keyof T]: DeepMutable<T[Key]> }
  : T;

export type StructureDocumentDraft = DeepMutable<StructureDocumentCore>;
export type { StructureTransportReceipt } from './strict-json';

export type StructureValidationReceipt = Readonly<{
  schemaVersion: 'tf.structure-validation-receipt/0.1';
  documentSchemaVersion: typeof STRUCTURE_DOCUMENT_SCHEMA_VERSION;
  semanticDigest: `sha256:${string}`;
  validationPolicyVersion: typeof STRUCTURE_VALIDATION_POLICY_VERSION;
  valid: true;
  issueCount: 0;
  receiptDigest: `sha256:${string}`;
}>;

export const NULL_SCIENTIFIC_OUTPUTS = Object.freeze({
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
});

export type SolverAdmissionChannel = Readonly<{
  channel: 'classical-atomistic' | 'machine-learned-interatomic' | 'electronic-structure';
  semanticDigest: `sha256:${string}`;
  validationReceiptDigest: `sha256:${string}`;
  policyVersion: typeof STRUCTURE_SOLVER_ADMISSION_POLICY_VERSION;
  decision: 'abstain';
  reason: 'representation-only-not-evaluated-not-invoked';
  attempted: false;
  solverInvoked: false;
  backend: null;
  outputs: typeof NULL_SCIENTIFIC_OUTPUTS;
}>;

export type StructureSolverAdmissionReceipt = Readonly<{
  schemaVersion: 'tf.structure-solver-admission-receipt/0.1';
  semanticDigest: `sha256:${string}`;
  validationReceiptDigest: `sha256:${string}`;
  policyVersion: typeof STRUCTURE_SOLVER_ADMISSION_POLICY_VERSION;
  channels: readonly [SolverAdmissionChannel, SolverAdmissionChannel, SolverAdmissionChannel];
  receiptDigest: `sha256:${string}`;
}>;

export type SolverInvocationSentinels = Readonly<{
  classicalAtomistic?: () => never;
  machineLearnedInteratomic?: () => never;
  electronicStructure?: () => never;
}>;

export class StructureValidationError extends Error {
  readonly code: string;
  readonly path: string;

  constructor(code: string, path: string, message: string) {
    super(`${path}: ${message}`);
    this.name = 'StructureValidationError';
    this.code = code;
    this.path = path;
  }
}

export function createDefaultStructureDraft(): StructureDocumentDraft {
  return {
    schemaVersion: STRUCTURE_DOCUMENT_SCHEMA_VERSION,
    documentId: 'custom-structure-1',
    title: 'Untitled custom structure',
    topology: 'finite',
    classification: null,
    coordinateFrame: {
      coordinateSystem: 'cartesian',
      dimension: 'length',
      unit: 'angstrom',
      basis: 'structure-local',
      inputTransform: 'none-preserve-input',
    },
    connectionImageShiftFrame: {
      dimension: 'dimensionless',
      unit: 'cell-lattice-coefficient',
      basis: 'integer-coefficients-of-declared-cell-columns',
      applicability: 'periodic-3d-only',
      finitePolicy: 'zero-required-not-applied',
      endpoint: 'B',
      equation: 'r_image=r_B+H*n',
    },
    boundary: { periodicAxes: [false, false, false], cell: null },
    finiteSystem: { netCharge: null, spinMultiplicity: null },
    periodicCellFormalCharge: null,
    atoms: [{
      id: 'atom-1',
      element: { atomicNumber: 6, symbol: 'C' },
      position: { x: 0, y: 0, z: 0 },
      isotope: null,
      formalCharge: null,
    }],
    connections: [],
    provenance: {
      source: null,
      license: {
        spdxExpression: 'NOASSERTION',
        attribution: null,
        redistribution: 'unknown',
        status: 'not-provided',
        projectVerified: false,
      },
    },
  };
}

export function makeIsotopeDeclaration(massNumber: number): IsotopeDeclaration {
  return {
    massNumber,
    dimension: 'dimensionless',
    basis: 'nucleon-count',
    status: 'user-declared-existence-unverified',
    projectVerified: false,
  };
}

export function makeAtomicFormalCharge(value: number): AtomicFormalChargeDeclaration {
  return {
    value,
    unit: 'elementary-charge',
    dimension: 'electric-charge',
    basis: 'formal-bookkeeping',
    status: 'user-declared-unverified',
    projectVerified: false,
  };
}

export function makeFiniteNetCharge(value: number): NonNullable<FiniteSystemDeclaration['netCharge']> {
  return {
    value,
    unit: 'elementary-charge',
    dimension: 'electric-charge',
    basis: 'finite-system-electron-deficit',
    signConvention: 'Q=+1-means-one-electron-fewer-than-nuclear-charge',
    status: 'user-declared-unverified',
    projectVerified: false,
  };
}

export function makeSpinMultiplicity(value: number): NonNullable<FiniteSystemDeclaration['spinMultiplicity']> {
  return {
    value,
    dimension: 'dimensionless',
    basis: 'finite-system-2S-plus-1',
    status: 'user-declared-unverified',
    projectVerified: false,
  };
}

export function makePeriodicCellFormalCharge(value: number): PeriodicCellFormalChargeDeclaration {
  return {
    value,
    unit: 'elementary-charge',
    dimension: 'electric-charge',
    basis: 'formal-bookkeeping-per-declared-cell',
    limitations: 'not-physical-partial-charge-background-electrostatic-solvability-electron-count-or-spin',
    status: 'user-declared-unverified',
    projectVerified: false,
  };
}

export function finalizeStructureDocument(input: unknown): StructureDocument {
  const top = readRecord(input, '$');
  const hasDigest = Object.hasOwn(top, 'semanticDigest');
  assertExactKeys(top, '$', [
    'schemaVersion', 'documentId', 'title', 'topology', 'classification', 'coordinateFrame',
    'connectionImageShiftFrame', 'boundary', 'finiteSystem', 'periodicCellFormalCharge', 'atoms', 'connections', 'provenance',
    ...(hasDigest ? ['semanticDigest'] : []),
  ]);
  const core = validateCore(top);
  const computed = computeStructureSemanticDigest(core);
  if (hasDigest && readDigest(top.semanticDigest, '$.semanticDigest') !== computed) {
    fail('semantic-digest-mismatch', '$.semanticDigest', 'Digest does not match validated document semantics.');
  }
  return deepFreeze({ ...core, semanticDigest: computed });
}

export function validateStructureDocument(input: unknown): StructureDocument {
  const record = readRecord(input, '$');
  if (!Object.hasOwn(record, 'semanticDigest')) {
    fail('semantic-digest-required', '$.semanticDigest', 'A native structure document must carry its semantic digest.');
  }
  return finalizeStructureDocument(record);
}

export function createValidationReceipt(document: StructureDocument): StructureValidationReceipt {
  const validated = validateStructureDocument(document);
  const base = {
    schemaVersion: 'tf.structure-validation-receipt/0.1' as const,
    documentSchemaVersion: STRUCTURE_DOCUMENT_SCHEMA_VERSION,
    semanticDigest: validated.semanticDigest,
    validationPolicyVersion: STRUCTURE_VALIDATION_POLICY_VERSION,
    valid: true as const,
    issueCount: 0 as const,
  };
  return deepFreeze({ ...base, receiptDigest: sha256DigestValue(base) });
}

/**
 * Sentinels are accepted only so tests can prove this fixed abstention policy
 * never reaches any injected invocation boundary. They are intentionally unread.
 */
export function createSolverAdmissionReceipt(
  document: StructureDocument,
  validationReceipt: StructureValidationReceipt,
  _zeroCallSentinels: SolverInvocationSentinels = {},
): StructureSolverAdmissionReceipt {
  void _zeroCallSentinels;
  const validatedDocument = validateStructureDocument(document);
  const receiptSnapshot = snapshotAndValidateValidationReceipt(validationReceipt);
  if (receiptSnapshot.semanticDigest !== validatedDocument.semanticDigest) {
    fail('receipt-digest-mismatch', '$.validationReceipt.semanticDigest', 'Receipt is not bound to this document.');
  }
  const makeChannel = (channel: SolverAdmissionChannel['channel']): SolverAdmissionChannel => ({
    channel,
    semanticDigest: validatedDocument.semanticDigest,
    validationReceiptDigest: receiptSnapshot.receiptDigest,
    policyVersion: STRUCTURE_SOLVER_ADMISSION_POLICY_VERSION,
    decision: 'abstain',
    reason: 'representation-only-not-evaluated-not-invoked',
    attempted: false,
    solverInvoked: false,
    backend: null,
    outputs: NULL_SCIENTIFIC_OUTPUTS,
  });
  const base = {
    schemaVersion: 'tf.structure-solver-admission-receipt/0.1' as const,
    semanticDigest: validatedDocument.semanticDigest,
    validationReceiptDigest: receiptSnapshot.receiptDigest,
    policyVersion: STRUCTURE_SOLVER_ADMISSION_POLICY_VERSION,
    channels: [
      makeChannel('classical-atomistic'),
      makeChannel('machine-learned-interatomic'),
      makeChannel('electronic-structure'),
    ] as const,
  };
  return deepFreeze({ ...base, receiptDigest: sha256DigestValue(base) });
}

function snapshotAndValidateValidationReceipt(receipt: StructureValidationReceipt): StructureValidationReceipt {
  let cloned: unknown;
  try {
    // structuredClone rejects Proxy objects. The source record is inspected first
    // so accessors are never evaluated as part of the clone.
    const source = readRecord(receipt, '$.validationReceipt');
    assertExactKeys(source, '$.validationReceipt', [
      'schemaVersion', 'documentSchemaVersion', 'semanticDigest', 'validationPolicyVersion',
      'valid', 'issueCount', 'receiptDigest',
    ]);
    cloned = structuredClone(source);
  } catch (error) {
    if (error instanceof StructureValidationError) throw error;
    fail('invalid-validation-receipt', '$.validationReceipt', 'Validation receipt must be a cloneable plain data record.');
  }
  const snapshot = readRecord(cloned, '$.validationReceipt');
  assertExactKeys(snapshot, '$.validationReceipt', [
    'schemaVersion', 'documentSchemaVersion', 'semanticDigest', 'validationPolicyVersion',
    'valid', 'issueCount', 'receiptDigest',
  ]);
  const expectedBase = {
    schemaVersion: 'tf.structure-validation-receipt/0.1' as const,
    documentSchemaVersion: STRUCTURE_DOCUMENT_SCHEMA_VERSION,
    semanticDigest: readDigest(snapshot.semanticDigest, '$.validationReceipt.semanticDigest'),
    validationPolicyVersion: STRUCTURE_VALIDATION_POLICY_VERSION,
    valid: true as const,
    issueCount: 0 as const,
  };
  if (
    snapshot.schemaVersion !== expectedBase.schemaVersion
    || snapshot.documentSchemaVersion !== expectedBase.documentSchemaVersion
    || snapshot.validationPolicyVersion !== expectedBase.validationPolicyVersion
    || snapshot.valid !== true
    || snapshot.issueCount !== 0
    || readDigest(snapshot.receiptDigest, '$.validationReceipt.receiptDigest') !== sha256DigestValue(expectedBase)
  ) {
    fail('invalid-validation-receipt', '$.validationReceipt', 'Validation receipt fields or self-digest are invalid.');
  }
  return deepFreeze({
    ...expectedBase,
    receiptDigest: readDigest(snapshot.receiptDigest, '$.validationReceipt.receiptDigest'),
  });
}

export function parseAndValidateStructureNativeJson(
  bytes: Uint8Array,
  fileName: string | null,
): Readonly<{
  document: StructureDocument;
  transportReceipt: StructureTransportReceipt;
  validationReceipt: StructureValidationReceipt;
  solverAdmissionReceipt: StructureSolverAdmissionReceipt;
}> {
  if (fileName !== null && !fileName.endsWith(STRUCTURE_NATIVE_EXTENSION)) {
    fail('native-extension', '$.transport.fileName', `Only ${STRUCTURE_NATIVE_EXTENSION} transport is accepted.`);
  }
  const parsed = parseStructureNativeJsonBytes(bytes, fileName);
  const document = validateStructureDocument(parsed.value);
  const validationReceipt = createValidationReceipt(document);
  return deepFreeze({
    document,
    transportReceipt: parsed.transportReceipt,
    validationReceipt,
    solverAdmissionReceipt: createSolverAdmissionReceipt(document, validationReceipt),
  });
}

export function exportStructureNativeJson(document: StructureDocument): Uint8Array {
  const revalidated = finalizeStructureDocument(document);
  const bytes = encodeStructureNativeJson(revalidated);
  if (bytes.byteLength > STRUCTURE_MAX_FILE_BYTES) {
    fail('export-byte-limit', '$.transport', `Encoded native document exceeds ${STRUCTURE_MAX_FILE_BYTES} bytes.`);
  }
  return bytes;
}

export function structureDocumentToDraft(document: StructureDocument): StructureDocumentDraft {
  const draft = structuredClone(document) as unknown as Record<string, unknown>;
  delete draft.semanticDigest;
  return draft as unknown as StructureDocumentDraft;
}

export function computeStructureSemanticDigest(core: StructureDocumentCore): `sha256:${string}` {
  const atomRecords = [...core.atoms].sort((left, right) => asciiCompare(left.id, right.id));
  const connectionRecords = core.connections.map(canonicalizeConnection).sort((left, right) => (
    asciiCompare(connectionIdentityKey(left), connectionIdentityKey(right))
    || asciiCompare(left.id, right.id)
  ));
  return sha256DigestValue({ ...core, atoms: atomRecords, connections: connectionRecords });
}

export function canonicalizeConnection(connection: StructureConnection): StructureConnection {
  const shift = connection.imageShiftForB;
  if (connection.atomAId < connection.atomBId) return connection;
  if (connection.atomAId > connection.atomBId) {
    return {
      ...connection,
      atomAId: connection.atomBId,
      atomBId: connection.atomAId,
      imageShiftForB: [negateInteger(shift[0]), negateInteger(shift[1]), negateInteger(shift[2])],
    };
  }
  const negated: Vec3 = [negateInteger(shift[0]), negateInteger(shift[1]), negateInteger(shift[2])];
  if (compareIntegerVector(shift, negated) <= 0) return connection;
  return { ...connection, imageShiftForB: negated };
}

export function connectionIdentityKey(connection: StructureConnection): string {
  const canonical = canonicalizeConnection(connection);
  return canonicalJson([
    canonical.atomAId,
    canonical.atomBId,
    canonical.imageShiftForB[0],
    canonical.imageShiftForB[1],
    canonical.imageShiftForB[2],
  ]);
}

function validateCore(top: Record<string, unknown>): StructureDocumentCore {
  expectConstant(top.schemaVersion, STRUCTURE_DOCUMENT_SCHEMA_VERSION, '$.schemaVersion');
  const topology = readEnum(top.topology, '$.topology', ['finite', 'periodic-3d'] as const);
  const atomsInput = readArray(top.atoms, '$.atoms', 1, STRUCTURE_MAX_ATOMS);
  const atoms = atomsInput.map((atom, index) => validateAtom(atom, `$.atoms[${index}]`));
  const atomIds = new Set<string>();
  for (const atom of atoms) {
    if (atomIds.has(atom.id)) fail('duplicate-atom-id', '$.atoms', `Duplicate atom ID ${atom.id}.`);
    atomIds.add(atom.id);
  }
  const boundary = validateBoundary(top.boundary, topology);
  const finiteSystem = validateFiniteSystem(top.finiteSystem, topology, atoms);
  const periodicCellFormalCharge = validatePeriodicCharge(top.periodicCellFormalCharge, topology);
  validateFormalChargeEquality(atoms, topology, finiteSystem, periodicCellFormalCharge);
  const connectionsInput = readArray(top.connections, '$.connections', 0, STRUCTURE_MAX_CONNECTIONS);
  const connections = connectionsInput.map((connection, index) => (
    validateConnection(connection, `$.connections[${index}]`, topology, atomIds)
  ));
  const connectionIds = new Set<string>();
  const edgeKeys = new Set<string>();
  for (const connection of connections) {
    if (connectionIds.has(connection.id)) fail('duplicate-connection-id', '$.connections', `Duplicate connection ID ${connection.id}.`);
    connectionIds.add(connection.id);
    const key = connectionIdentityKey(connection);
    if (edgeKeys.has(key)) fail('duplicate-undirected-edge', '$.connections', `Duplicate undirected edge ${key}.`);
    edgeKeys.add(key);
  }
  return {
    schemaVersion: STRUCTURE_DOCUMENT_SCHEMA_VERSION,
    documentId: readStableId(top.documentId, '$.documentId'),
    title: readString(top.title, '$.title', 1, 160),
    topology,
    classification: validateClassification(top.classification),
    coordinateFrame: validateCoordinateFrame(top.coordinateFrame),
    connectionImageShiftFrame: validateConnectionImageShiftFrame(top.connectionImageShiftFrame),
    boundary,
    finiteSystem,
    periodicCellFormalCharge,
    atoms,
    connections,
    provenance: validateProvenance(top.provenance),
  };
}

function validateAtom(value: unknown, path: string): StructureAtom {
  const atom = readRecord(value, path);
  assertExactKeys(atom, path, ['id', 'element', 'position', 'isotope', 'formalCharge']);
  const element = readRecord(atom.element, `${path}.element`);
  assertExactKeys(element, `${path}.element`, ['atomicNumber', 'symbol']);
  const atomicNumber = readInteger(element.atomicNumber, `${path}.element.atomicNumber`, 1, 118);
  const symbol = readString(element.symbol, `${path}.element.symbol`, 1, 2);
  try {
    requireElementPair(atomicNumber, symbol);
  } catch {
    fail('element-pair', `${path}.element`, `Z=${atomicNumber} and symbol=${symbol} are not an exact catalog pair.`);
  }
  const position = readRecord(atom.position, `${path}.position`);
  assertExactKeys(position, `${path}.position`, ['x', 'y', 'z']);
  const isotope = atom.isotope === null ? null : validateIsotope(atom.isotope, atomicNumber, `${path}.isotope`);
  const formalCharge = atom.formalCharge === null
    ? null
    : validateAtomicFormalCharge(atom.formalCharge, `${path}.formalCharge`);
  return {
    id: readStableId(atom.id, `${path}.id`),
    element: { atomicNumber, symbol },
    position: {
      x: readLength(position.x, `${path}.position.x`),
      y: readLength(position.y, `${path}.position.y`),
      z: readLength(position.z, `${path}.position.z`),
    },
    isotope,
    formalCharge,
  };
}

function validateIsotope(value: unknown, atomicNumber: number, path: string): IsotopeDeclaration {
  const isotope = readRecord(value, path);
  assertExactKeys(isotope, path, ['massNumber', 'dimension', 'basis', 'status', 'projectVerified']);
  const massNumber = readInteger(isotope.massNumber, `${path}.massNumber`, atomicNumber, 400);
  expectConstant(isotope.dimension, 'dimensionless', `${path}.dimension`);
  expectConstant(isotope.basis, 'nucleon-count', `${path}.basis`);
  expectConstant(isotope.status, 'user-declared-existence-unverified', `${path}.status`);
  expectConstant(isotope.projectVerified, false, `${path}.projectVerified`);
  return makeIsotopeDeclaration(massNumber);
}

function validateAtomicFormalCharge(value: unknown, path: string): AtomicFormalChargeDeclaration {
  const charge = readRecord(value, path);
  assertExactKeys(charge, path, ['value', 'unit', 'dimension', 'basis', 'status', 'projectVerified']);
  const chargeValue = readSafeInteger(charge.value, `${path}.value`);
  expectConstant(charge.unit, 'elementary-charge', `${path}.unit`);
  expectConstant(charge.dimension, 'electric-charge', `${path}.dimension`);
  expectConstant(charge.basis, 'formal-bookkeeping', `${path}.basis`);
  expectConstant(charge.status, 'user-declared-unverified', `${path}.status`);
  expectConstant(charge.projectVerified, false, `${path}.projectVerified`);
  return makeAtomicFormalCharge(chargeValue);
}

function validateBoundary(value: unknown, topology: StructureTopology): StructureDocumentCore['boundary'] {
  const boundary = readRecord(value, '$.boundary');
  assertExactKeys(boundary, '$.boundary', ['periodicAxes', 'cell']);
  const axes = readArray(boundary.periodicAxes, '$.boundary.periodicAxes', 3, 3);
  const periodicAxes = axes.map((axis, index) => readBoolean(axis, `$.boundary.periodicAxes[${index}]`)) as unknown as [boolean, boolean, boolean];
  const expected = topology === 'finite' ? [false, false, false] : [true, true, true];
  if (periodicAxes.some((axis, index) => axis !== expected[index])) {
    fail('topology-pbc-mismatch', '$.boundary.periodicAxes', 'Partial periodicity and topology/PBC mismatches are not supported.');
  }
  if (topology === 'finite') {
    if (boundary.cell !== null) fail('finite-cell', '$.boundary.cell', 'Finite topology requires cell=null.');
    return { periodicAxes, cell: null };
  }
  if (boundary.cell === null) fail('periodic-cell', '$.boundary.cell', 'periodic-3d requires a cell.');
  return { periodicAxes, cell: validateCell(boundary.cell) };
}

function validateCell(value: unknown): StructureCell {
  const cell = readRecord(value, '$.boundary.cell');
  assertExactKeys(cell, '$.boundary.cell', ['convention', 'dimension', 'unit', 'basis', 'vectors']);
  expectConstant(cell.convention, 'H=[a b c]-column-vectors', '$.boundary.cell.convention');
  expectConstant(cell.dimension, 'length', '$.boundary.cell.dimension');
  expectConstant(cell.unit, 'angstrom', '$.boundary.cell.unit');
  expectConstant(cell.basis, 'structure-local-cartesian', '$.boundary.cell.basis');
  const inputVectors = readArray(cell.vectors, '$.boundary.cell.vectors', 3, 3);
  const vectors = inputVectors.map((vector, column) => readLengthVector(vector, `$.boundary.cell.vectors[${column}]`)) as unknown as [Vec3, Vec3, Vec3];
  const norms = vectors.map(vectorNorm);
  norms.forEach((norm, index) => {
    if (!Number.isFinite(norm) || norm < STRUCTURE_MIN_CELL_VECTOR_NORM_ANGSTROM) {
      fail('cell-vector-too-small', `$.boundary.cell.vectors[${index}]`, `Cell-vector norm must be at least ${STRUCTURE_MIN_CELL_VECTOR_NORM_ANGSTROM} angstrom.`);
    }
  });
  const determinant = determinantColumns(vectors[0], vectors[1], vectors[2]);
  if (!Number.isFinite(determinant) || determinant <= 0) {
    fail('cell-handedness', '$.boundary.cell.vectors', 'Cell determinant must be finite and positive in cubic angstrom.');
  }
  const normalizedTripleProduct = determinant / (norms[0] * norms[1] * norms[2]);
  if (!Number.isFinite(normalizedTripleProduct) || normalizedTripleProduct <= STRUCTURE_MIN_NORMALIZED_TRIPLE_PRODUCT) {
    fail('cell-near-singular', '$.boundary.cell.vectors', `Normalized triple product must be greater than ${STRUCTURE_MIN_NORMALIZED_TRIPLE_PRODUCT}.`);
  }
  return {
    convention: 'H=[a b c]-column-vectors',
    dimension: 'length',
    unit: 'angstrom',
    basis: 'structure-local-cartesian',
    vectors,
  };
}

function validateFiniteSystem(
  value: unknown,
  topology: StructureTopology,
  atoms: readonly StructureAtom[],
): FiniteSystemDeclaration | null {
  if (topology === 'periodic-3d') {
    if (value !== null) fail('periodic-finite-fields', '$.finiteSystem', 'periodic-3d rejects finite-system charge and spin.');
    return null;
  }
  const finite = readRecord(value, '$.finiteSystem');
  assertExactKeys(finite, '$.finiteSystem', ['netCharge', 'spinMultiplicity']);
  let netCharge: FiniteSystemDeclaration['netCharge'] = null;
  if (finite.netCharge !== null) {
    const charge = readRecord(finite.netCharge, '$.finiteSystem.netCharge');
    assertExactKeys(charge, '$.finiteSystem.netCharge', [
      'value', 'unit', 'dimension', 'basis', 'signConvention', 'status', 'projectVerified',
    ]);
    netCharge = makeFiniteNetCharge(readSafeInteger(charge.value, '$.finiteSystem.netCharge.value'));
    expectConstant(charge.unit, netCharge.unit, '$.finiteSystem.netCharge.unit');
    expectConstant(charge.dimension, netCharge.dimension, '$.finiteSystem.netCharge.dimension');
    expectConstant(charge.basis, netCharge.basis, '$.finiteSystem.netCharge.basis');
    expectConstant(charge.signConvention, netCharge.signConvention, '$.finiteSystem.netCharge.signConvention');
    expectConstant(charge.status, netCharge.status, '$.finiteSystem.netCharge.status');
    expectConstant(charge.projectVerified, false, '$.finiteSystem.netCharge.projectVerified');
  }
  let spinMultiplicity: FiniteSystemDeclaration['spinMultiplicity'] = null;
  if (finite.spinMultiplicity !== null) {
    if (netCharge === null) {
      fail('spin-needs-charge', '$.finiteSystem.spinMultiplicity', 'A spin declaration requires an explicit finite-system net charge; no neutral value is inferred.');
    }
    const spin = readRecord(finite.spinMultiplicity, '$.finiteSystem.spinMultiplicity');
    assertExactKeys(spin, '$.finiteSystem.spinMultiplicity', ['value', 'dimension', 'basis', 'status', 'projectVerified']);
    spinMultiplicity = makeSpinMultiplicity(readInteger(spin.value, '$.finiteSystem.spinMultiplicity.value', 1, Number.MAX_SAFE_INTEGER));
    expectConstant(spin.dimension, spinMultiplicity.dimension, '$.finiteSystem.spinMultiplicity.dimension');
    expectConstant(spin.basis, spinMultiplicity.basis, '$.finiteSystem.spinMultiplicity.basis');
    expectConstant(spin.status, spinMultiplicity.status, '$.finiteSystem.spinMultiplicity.status');
    expectConstant(spin.projectVerified, false, '$.finiteSystem.spinMultiplicity.projectVerified');
  }
  if (netCharge !== null) {
    const nuclearCharge = atoms.reduce((sum, atom) => sum + BigInt(atom.element.atomicNumber), BigInt(0));
    const electronCount = nuclearCharge - BigInt(netCharge.value);
    if (electronCount < BigInt(0)) fail('negative-electron-count', '$.finiteSystem.netCharge', 'N=sum(Z)-Q must be non-negative.');
    if (spinMultiplicity !== null) {
      const unpaired = BigInt(spinMultiplicity.value - 1);
      if (unpaired > electronCount || (electronCount - unpaired) % BigInt(2) !== BigInt(0)) {
        fail('invalid-spin-multiplicity', '$.finiteSystem.spinMultiplicity', 'Multiplicity violates M-1<=N or even N-(M-1).');
      }
    }
  }
  return { netCharge, spinMultiplicity };
}

function validatePeriodicCharge(
  value: unknown,
  topology: StructureTopology,
): PeriodicCellFormalChargeDeclaration | null {
  if (topology === 'finite') {
    if (value !== null) fail('finite-periodic-charge', '$.periodicCellFormalCharge', 'Finite topology rejects per-cell formal charge.');
    return null;
  }
  if (value === null) return null;
  const charge = readRecord(value, '$.periodicCellFormalCharge');
  assertExactKeys(charge, '$.periodicCellFormalCharge', [
    'value', 'unit', 'dimension', 'basis', 'limitations', 'status', 'projectVerified',
  ]);
  const declaration = makePeriodicCellFormalCharge(readSafeInteger(charge.value, '$.periodicCellFormalCharge.value'));
  expectConstant(charge.unit, declaration.unit, '$.periodicCellFormalCharge.unit');
  expectConstant(charge.dimension, declaration.dimension, '$.periodicCellFormalCharge.dimension');
  expectConstant(charge.basis, declaration.basis, '$.periodicCellFormalCharge.basis');
  expectConstant(charge.limitations, declaration.limitations, '$.periodicCellFormalCharge.limitations');
  expectConstant(charge.status, declaration.status, '$.periodicCellFormalCharge.status');
  expectConstant(charge.projectVerified, false, '$.periodicCellFormalCharge.projectVerified');
  return declaration;
}

function validateFormalChargeEquality(
  atoms: readonly StructureAtom[],
  topology: StructureTopology,
  finiteSystem: FiniteSystemDeclaration | null,
  periodicCharge: PeriodicCellFormalChargeDeclaration | null,
): void {
  const aggregate = topology === 'finite' ? finiteSystem?.netCharge : periodicCharge;
  if (aggregate === null || aggregate === undefined || atoms.some((atom) => atom.formalCharge === null)) return;
  const exactSum = atoms.reduce((sum, atom) => sum + BigInt(atom.formalCharge!.value), BigInt(0));
  if (exactSum !== BigInt(aggregate.value)) {
    fail('formal-charge-sum', '$.atoms', 'Exact atomic formal-charge sum does not equal the declared aggregate.');
  }
}

function validateConnection(
  value: unknown,
  path: string,
  topology: StructureTopology,
  atomIds: ReadonlySet<string>,
): StructureConnection {
  const connection = readRecord(value, path);
  assertExactKeys(connection, path, [
    'id', 'atomAId', 'atomBId', 'order', 'provenance', 'role', 'energeticInteraction', 'imageShiftForB',
  ]);
  const atomAId = readStableId(connection.atomAId, `${path}.atomAId`);
  const atomBId = readStableId(connection.atomBId, `${path}.atomBId`);
  if (!atomIds.has(atomAId)) fail('missing-endpoint', `${path}.atomAId`, `Atom ${atomAId} does not exist.`);
  if (!atomIds.has(atomBId)) fail('missing-endpoint', `${path}.atomBId`, `Atom ${atomBId} does not exist.`);
  const shiftInput = readArray(connection.imageShiftForB, `${path}.imageShiftForB`, 3, 3);
  const shift = shiftInput.map((component, index) => (
    readInteger(component, `${path}.imageShiftForB[${index}]`, -STRUCTURE_MAX_IMAGE_SHIFT, STRUCTURE_MAX_IMAGE_SHIFT)
  )) as unknown as Vec3;
  const zeroShift = shift.every((component) => component === 0);
  if (topology === 'finite' && !zeroShift) fail('finite-image-shift', `${path}.imageShiftForB`, 'Finite connections require zero image shift.');
  if (atomAId === atomBId && zeroShift) fail('zero-self-edge', path, 'Zero-shift self connections are forbidden.');
  return {
    id: readStableId(connection.id, `${path}.id`),
    atomAId,
    atomBId,
    order: readEnum(connection.order, `${path}.order`, ['unknown', 'single', 'double', 'triple', 'aromatic'] as const),
    provenance: readEnum(connection.provenance, `${path}.provenance`, ['user-declared', 'explicit-import'] as const),
    role: expectConstant(connection.role, 'display-only', `${path}.role`),
    energeticInteraction: expectConstant(connection.energeticInteraction, false, `${path}.energeticInteraction`),
    imageShiftForB: shift,
  };
}

function validateClassification(value: unknown): StructureDocumentCore['classification'] {
  if (value === null) return null;
  const declaration = readRecord(value, '$.classification');
  assertExactKeys(declaration, '$.classification', ['value', 'status', 'projectVerified']);
  return {
    value: readString(declaration.value, '$.classification.value', 1, 128),
    status: expectConstant(declaration.status, 'user-declared-unverified', '$.classification.status'),
    projectVerified: expectConstant(declaration.projectVerified, false, '$.classification.projectVerified'),
  };
}

function validateCoordinateFrame(value: unknown): StructureDocumentCore['coordinateFrame'] {
  const frame = readRecord(value, '$.coordinateFrame');
  assertExactKeys(frame, '$.coordinateFrame', ['coordinateSystem', 'dimension', 'unit', 'basis', 'inputTransform']);
  return {
    coordinateSystem: expectConstant(frame.coordinateSystem, 'cartesian', '$.coordinateFrame.coordinateSystem'),
    dimension: expectConstant(frame.dimension, 'length', '$.coordinateFrame.dimension'),
    unit: expectConstant(frame.unit, 'angstrom', '$.coordinateFrame.unit'),
    basis: expectConstant(frame.basis, 'structure-local', '$.coordinateFrame.basis'),
    inputTransform: expectConstant(frame.inputTransform, 'none-preserve-input', '$.coordinateFrame.inputTransform'),
  };
}

function validateConnectionImageShiftFrame(value: unknown): ConnectionImageShiftFrame {
  const frame = readRecord(value, '$.connectionImageShiftFrame');
  assertExactKeys(frame, '$.connectionImageShiftFrame', [
    'dimension', 'unit', 'basis', 'applicability', 'finitePolicy', 'endpoint', 'equation',
  ]);
  return {
    dimension: expectConstant(frame.dimension, 'dimensionless', '$.connectionImageShiftFrame.dimension'),
    unit: expectConstant(frame.unit, 'cell-lattice-coefficient', '$.connectionImageShiftFrame.unit'),
    basis: expectConstant(frame.basis, 'integer-coefficients-of-declared-cell-columns', '$.connectionImageShiftFrame.basis'),
    applicability: expectConstant(frame.applicability, 'periodic-3d-only', '$.connectionImageShiftFrame.applicability'),
    finitePolicy: expectConstant(frame.finitePolicy, 'zero-required-not-applied', '$.connectionImageShiftFrame.finitePolicy'),
    endpoint: expectConstant(frame.endpoint, 'B', '$.connectionImageShiftFrame.endpoint'),
    equation: expectConstant(frame.equation, 'r_image=r_B+H*n', '$.connectionImageShiftFrame.equation'),
  };
}

function validateProvenance(value: unknown): StructureDocumentCore['provenance'] {
  const provenance = readRecord(value, '$.provenance');
  assertExactKeys(provenance, '$.provenance', ['source', 'license']);
  let source: StructureDocumentCore['provenance']['source'] = null;
  if (provenance.source !== null) {
    const declaration = readRecord(provenance.source, '$.provenance.source');
    assertExactKeys(declaration, '$.provenance.source', ['identity', 'revision', 'status', 'projectVerified']);
    source = {
      identity: readString(declaration.identity, '$.provenance.source.identity', 1, 512),
      revision: declaration.revision === null ? null : readString(declaration.revision, '$.provenance.source.revision', 1, 256),
      status: expectConstant(declaration.status, 'user-declared-unverified', '$.provenance.source.status'),
      projectVerified: expectConstant(declaration.projectVerified, false, '$.provenance.source.projectVerified'),
    };
  }
  const license = readRecord(provenance.license, '$.provenance.license');
  assertExactKeys(license, '$.provenance.license', [
    'spdxExpression', 'attribution', 'redistribution', 'status', 'projectVerified',
  ]);
  const spdxExpression = readString(license.spdxExpression, '$.provenance.license.spdxExpression', 1, 256);
  const attribution = license.attribution === null ? null : readString(license.attribution, '$.provenance.license.attribution', 1, 2048);
  const redistribution = readEnum(license.redistribution, '$.provenance.license.redistribution', [
    'unknown', 'user-declared-allowed', 'user-declared-prohibited',
  ] as const);
  const status = readEnum(license.status, '$.provenance.license.status', ['not-provided', 'user-declared-unverified'] as const);
  if (status === 'not-provided' && (
    spdxExpression !== 'NOASSERTION' || attribution !== null || redistribution !== 'unknown'
  )) {
    fail('license-not-provided', '$.provenance.license', 'not-provided requires NOASSERTION, null attribution, and unknown redistribution.');
  }
  return {
    source,
    license: {
      spdxExpression,
      attribution,
      redistribution,
      status,
      projectVerified: expectConstant(license.projectVerified, false, '$.provenance.license.projectVerified'),
    },
  };
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) fail('record', path, 'Expected a JSON object.');
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) fail('prototype', path, 'Expected a plain record.');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some((key) => typeof key !== 'string')) fail('symbol-key', path, 'Symbol keys are forbidden.');
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
      fail('unsafe-property', `${path}.${key}`, 'Properties must be enumerable defined data properties.');
    }
    if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
      fail('prototype-key', `${path}.${key}`, 'Prototype-affecting keys are forbidden.');
    }
  }
  return value as Record<string, unknown>;
}

function assertExactKeys(record: Record<string, unknown>, path: string, keys: readonly string[]): void {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    fail('closed-record', path, `Expected exactly fields ${expected.join(', ')}.`);
  }
}

function readArray(value: unknown, path: string, minimum: number, maximum: number): unknown[] {
  if (!Array.isArray(value)) fail('array', path, 'Expected an array.');
  if (Object.getPrototypeOf(value) !== Array.prototype) fail('array-prototype', path, 'Expected a plain JSON array.');
  if (value.length < minimum || value.length > maximum) fail('array-bounds', path, `Expected ${minimum}..${maximum} entries.`);
  const descriptors = Object.getOwnPropertyDescriptors(value);
  for (let index = 0; index < value.length; index += 1) {
    const descriptor = descriptors[String(index)];
    if (!descriptor || !descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
      fail('dense-array', `${path}[${index}]`, 'Arrays must contain dense defined data entries.');
    }
  }
  const allowedKeys = new Set(['length', ...Array.from({ length: value.length }, (_, index) => String(index))]);
  const extra = Reflect.ownKeys(descriptors).find((key) => typeof key !== 'string' || !allowedKeys.has(key));
  if (extra !== undefined) fail('array-property', path, 'Array extra properties and symbol keys are forbidden.');
  return value;
}

function readLengthVector(value: unknown, path: string): Vec3 {
  const vector = readArray(value, path, 3, 3);
  return [
    readLength(vector[0], `${path}[0]`),
    readLength(vector[1], `${path}[1]`),
    readLength(vector[2], `${path}[2]`),
  ];
}

function readLength(value: unknown, path: string): number {
  return readFiniteNumber(value, path, -STRUCTURE_COORDINATE_LIMIT_ANGSTROM, STRUCTURE_COORDINATE_LIMIT_ANGSTROM);
}

function readFiniteNumber(value: unknown, path: string, minimum: number, maximum: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail('finite-number', path, 'Expected a finite number.');
  if (Object.is(value, -0)) fail('negative-zero', path, 'Negative zero is forbidden.');
  if (value < minimum || value > maximum) fail('numeric-bounds', path, `Expected ${minimum}..${maximum}.`);
  return value;
}

function readInteger(value: unknown, path: string, minimum: number, maximum: number): number {
  const number = readFiniteNumber(value, path, minimum, maximum);
  if (!Number.isInteger(number)) fail('integer', path, 'Expected an integer.');
  return number;
}

function readSafeInteger(value: unknown, path: string): number {
  const number = readInteger(value, path, Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER);
  if (!Number.isSafeInteger(number)) fail('safe-integer', path, 'Expected a safe integer.');
  return number;
}

function readStableId(value: unknown, path: string): string {
  const id = readString(value, path, 1, 64);
  if (!/^[A-Za-z][A-Za-z0-9._:-]{0,63}$/.test(id)) fail('stable-ascii-id', path, 'Expected a bounded stable ASCII identifier.');
  return id;
}

function readString(value: unknown, path: string, minimum: number, maximum: number): string {
  if (typeof value !== 'string') {
    fail('string-bounds', path, `Expected a string of ${minimum}..${maximum} Unicode code points.`);
  }
  let codePointLength = 0;
  for (const codePoint of value) {
    codePointLength += 1;
    if (codePoint === '\u0000') fail('nul-forbidden', path, 'NUL characters are forbidden in document strings.');
    if (codePointLength > maximum) {
      fail('string-bounds', path, `Expected a string of ${minimum}..${maximum} Unicode code points.`);
    }
  }
  if (codePointLength < minimum) {
    fail('string-bounds', path, `Expected a string of ${minimum}..${maximum} Unicode code points.`);
  }
  return value;
}

function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') fail('boolean', path, 'Expected a boolean.');
  return value;
}

function readEnum<const T extends readonly string[]>(value: unknown, path: string, allowed: T): T[number] {
  if (typeof value !== 'string' || !(allowed as readonly string[]).includes(value)) {
    fail('enum', path, `Expected one of ${allowed.join(', ')}.`);
  }
  return value as T[number];
}

function readDigest(value: unknown, path: string): `sha256:${string}` {
  if (typeof value !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(value)) fail('digest', path, 'Expected a lowercase SHA-256 digest.');
  return value as `sha256:${string}`;
}

function expectConstant<const T extends string | boolean>(value: unknown, expected: T, path: string): T {
  if (value !== expected) fail('constant', path, `Expected ${JSON.stringify(expected)}.`);
  return expected;
}

function determinantColumns(a: Vec3, b: Vec3, c: Vec3): number {
  return a[0] * (b[1] * c[2] - b[2] * c[1])
    - b[0] * (a[1] * c[2] - a[2] * c[1])
    + c[0] * (a[1] * b[2] - a[2] * b[1]);
}

function vectorNorm(vector: Vec3): number {
  return Math.hypot(vector[0], vector[1], vector[2]);
}

function compareIntegerVector(left: Vec3, right: Vec3): number {
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

function negateInteger(value: number): number {
  return value === 0 ? 0 : -value;
}

function asciiCompare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function fail(code: string, path: string, message: string): never {
  throw new StructureValidationError(code, path, message);
}

export function deepFreeze<T>(value: T): Readonly<T> {
  const seen = new WeakSet<object>();
  const freeze = (candidate: unknown): void => {
    if (candidate === null || typeof candidate !== 'object' || seen.has(candidate)) return;
    seen.add(candidate);
    for (const key of Reflect.ownKeys(candidate)) {
      const descriptor = Object.getOwnPropertyDescriptor(candidate, key);
      if (descriptor && 'value' in descriptor) freeze(descriptor.value);
    }
    Object.freeze(candidate);
  };
  freeze(value);
  return value;
}
