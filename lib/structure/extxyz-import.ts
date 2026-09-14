import { sha256DigestBytes, sha256DigestValue } from './canonical-json';
import { ELEMENT_IDENTITIES } from './element-catalog';
import { createDefaultStructureDraft, createSolverAdmissionReceipt, createValidationReceipt, deepFreeze, finalizeStructureDocument, STRUCTURE_COORDINATE_LIMIT_ANGSTROM, STRUCTURE_MAX_ATOMS } from './structure-document';
import { STRUCTURE_MAX_FILE_BYTES } from './strict-json';

export const EXTXYZ_INTERPRETATION = 'angstrom-cartesian-explicit-pbc-geometry-only' as const;
export const EXTXYZ_PROFILE = 'tf.extxyz-geometry/0.1' as const;
const unsafeText = /[\u0000-\u0008\u000a-\u001f\u007f-\u009f\ufeff\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;
const decimal = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;
function trim(text: string): string {
  let start = 0, end = text.length;
  const horizontalSpace = (index: number) => text[index] === ' ' || text[index] === '\t';
  while (start < end && horizontalSpace(start)) start += 1;
  while (end > start && horizontalSpace(end - 1)) end -= 1;
  return text.slice(start, end);
}
function reject(reason: string): never { throw new Error(`extXYZ import: ${reason}`); }
function coordinate(token: string): number {
  if (!decimal.test(token)) reject('decimal geometry syntax');
  const value = Number(token);
  if (!Number.isFinite(value) || Object.is(value, -0)
    || (value === 0 && /[1-9]/.test(token.split(/[eE]/)[0]))
    || Math.abs(value) > STRUCTURE_COORDINATE_LIMIT_ANGSTROM) reject('geometry range, negative zero or underflow');
  return value;
}

// This deliberately narrow profile accepts ASCII key=value tokens, optionally
// double-quoted values without escapes. No general extXYZ metadata is inferred.
function headerFields(header: string): Map<string, string> {
  if (header.length > 8192 || unsafeText.test(header)) reject('header bounds or controls');
  const fields = new Map<string, string>();
  let cursor = 0;
  while (cursor < header.length) {
    while (header[cursor] === ' ' || header[cursor] === '\t') cursor += 1;
    if (cursor === header.length) break;
    const match = /^([A-Za-z]+)=/.exec(header.slice(cursor));
    if (!match) reject('header key=value grammar');
    const key = match[1];
    if (!['Properties', 'pbc', 'Lattice'].includes(key)) reject(`header key ${key} is unsupported by ${EXTXYZ_PROFILE}`);
    if (fields.has(key)) reject(`duplicate header key ${key}`);
    cursor += match[0].length;
    let value: string;
    if (header[cursor] === '"') {
      const end = header.indexOf('"', cursor + 1);
      if (end === -1) reject('unterminated header quote');
      value = header.slice(cursor + 1, end);
      cursor = end + 1;
    } else {
      const start = cursor;
      while (cursor < header.length && header[cursor] !== ' ' && header[cursor] !== '\t') cursor += 1;
      value = header.slice(start, cursor);
    }
    if (!value || /["'\\]/.test(value) || (cursor < header.length && header[cursor] !== ' ' && header[cursor] !== '\t')) reject('header value grammar');
    fields.set(key, value);
  }
  if (!fields.has('Properties') || !fields.has('pbc')) reject('explicit Properties and pbc required');
  return fields;
}

export function parseAndValidateExtXyz(bytes: Uint8Array, fileName: string | null, interpretation: typeof EXTXYZ_INTERPRETATION) {
  if (interpretation !== EXTXYZ_INTERPRETATION) reject('explicit Cartesian angstrom interpretation required');
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > STRUCTURE_MAX_FILE_BYTES) reject('byte limit or type');
  if (fileName !== null && (typeof fileName !== 'string' || fileName.length > 256 || unsafeText.test(fileName) || !/\.(xyz|extxyz)$/.test(fileName))) reject('filename');
  const snapshot = new Uint8Array(bytes);
  if (snapshot[0] === 0xef && snapshot[1] === 0xbb && snapshot[2] === 0xbf) reject('BOM');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(snapshot).replace(/\r\n/g, '\n');
  if (text.includes('\r')) reject('bare CR');
  const lines = text.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const countText = trim(lines[0] ?? '');
  if (!/^[1-9][0-9]*$/.test(countText)) reject('canonical positive count');
  const count = Number(countText);
  if (count > STRUCTURE_MAX_ATOMS || lines.length !== count + 2) reject('atom count or single-frame shape');
  const rawHeader = lines[1];
  const fields = headerFields(rawHeader);
  const periodic = fields.get('pbc') === 'T T T';
  if (!periodic && fields.get('pbc') !== 'F F F') reject('only explicit T T T or F F F pbc');
  if (periodic !== fields.has('Lattice')) reject('periodic requires Lattice; finite forbids Lattice');
  const parts = fields.get('Properties')!.split(':');
  if (parts.length % 3 !== 0) reject('Properties triples');
  const columns = new Map<string, number>();
  const shapes: Record<string, readonly [string, string]> = { species: ['S', '1'], Z: ['I', '1'], pos: ['R', '3'], id: ['S', '1'] };
  let width = 0;
  for (let i = 0; i < parts.length; i += 3) {
    const name = parts[i];
    if (!Object.hasOwn(shapes, name)) reject(`Properties field ${name} is unsupported by ${EXTXYZ_PROFILE}`);
    if (columns.has(name)) reject(`duplicate Properties field ${name}`);
    const [type, size] = shapes[name];
    if (parts[i + 1] !== type || parts[i + 2] !== size) reject(`Properties field ${name} requires ${type}:${size} in ${EXTXYZ_PROFILE}`);
    columns.set(name, width);
    width += Number(size);
  }
  if (!columns.has('pos') || (!columns.has('species') && !columns.has('Z'))) reject('pos and species or Z required');
  const draft = createDefaultStructureDraft();
  const rawSha256 = sha256DigestBytes(snapshot);
  draft.documentId = `extxyz-${rawSha256.slice(7, 47)}`;
  draft.title = 'Imported extXYZ geometry';
  if (periodic) {
    const tokens = trim(fields.get('Lattice')!).split(/[ \t]+/);
    if (tokens.length !== 9) reject('nine Lattice components required');
    const v = tokens.map(coordinate);
    draft.topology = 'periodic-3d';
    draft.finiteSystem = null;
    draft.boundary = { periodicAxes: [true, true, true], cell: {
      convention: 'H=[a b c]-column-vectors', dimension: 'length', unit: 'angstrom', basis: 'structure-local-cartesian',
      vectors: [[v[0], v[1], v[2]], [v[3], v[4], v[5]], [v[6], v[7], v[8]]],
    } };
  }
  draft.atoms = lines.slice(2).map((line, index) => {
    if (unsafeText.test(line)) reject('atom controls');
    const tokens = trim(line).split(/[ \t]+/);
    if (tokens.length !== width) reject('exact atom column count');
    const symbol = columns.has('species') ? tokens[columns.get('species')!] : null;
    const zToken = columns.has('Z') ? tokens[columns.get('Z')!] : null;
    if (zToken !== null && !/^[1-9][0-9]*$/.test(zToken)) reject('canonical atomic number');
    const identity = symbol !== null ? ELEMENT_IDENTITIES.find(e => e.symbol === symbol) : ELEMENT_IDENTITIES.find(e => e.atomicNumber === Number(zToken));
    if (!identity || (zToken !== null && identity.atomicNumber !== Number(zToken))) reject('canonical consistent species/Z required');
    const p = columns.get('pos')!;
    return { id: columns.has('id') ? tokens[columns.get('id')!] : `extxyz-row-${String(index + 1).padStart(4, '0')}`,
      element: { atomicNumber: identity.atomicNumber, symbol: identity.symbol },
      position: { x: coordinate(tokens[p]), y: coordinate(tokens[p + 1]), z: coordinate(tokens[p + 2]) }, isotope: null, formalCharge: null };
  });
  const document = finalizeStructureDocument(draft);
  const validationReceipt = createValidationReceipt(document);
  const base = { schemaVersion: 'tf.structure-extxyz-import-receipt/0.1' as const,
    format: 'extxyz-geometry-single-frame' as const, profile: EXTXYZ_PROFILE,
    fileName, byteLength: snapshot.byteLength, rawSha256, rawHeader, interpretation,
    numericRepresentation: 'decimal-to-binary64-rounded' as const,
    atomIdentity: columns.has('id') ? 'source-declared-unverified-not-persistent-physical-identity' as const : 'generated-file-row-not-persistent-physical-identity' as const,
    semanticDigest: document.semanticDigest,
    nativeExportLoss: 'extXYZ-header-formatting-and-transport-provenance-not-exported' as const };
  return deepFreeze({ document, validationReceipt, solverAdmissionReceipt: createSolverAdmissionReceipt(document, validationReceipt),
    transportReceipt: { ...base, receiptDigest: sha256DigestValue(base) } });
}

export type ExtXyzImportReceipt = ReturnType<typeof parseAndValidateExtXyz>['transportReceipt'];
