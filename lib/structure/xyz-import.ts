import { sha256DigestBytes, sha256DigestValue } from './canonical-json';
import { ELEMENT_IDENTITIES } from './element-catalog';
import { createDefaultStructureDraft, createSolverAdmissionReceipt, createValidationReceipt, deepFreeze, finalizeStructureDocument, STRUCTURE_MAX_ATOMS, STRUCTURE_COORDINATE_LIMIT_ANGSTROM } from './structure-document';
import { STRUCTURE_MAX_FILE_BYTES } from './strict-json';

export const XYZ_INTERPRETATION = 'angstrom-finite-nonperiodic-comment-uninterpreted' as const;
const unsafeText = /[\u0000-\u0008\u000a-\u001f\u007f-\u009f\ufeff\u2028\u2029\u202a-\u202e\u2066-\u2069]/u;
const decimal = /^[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;
function strip(text: string): string {
  let start = 0, end = text.length;
  const isHorizontalAsciiSpace = (index: number) => text[index] === ' ' || text[index] === '\t';
  while (start < end && isHorizontalAsciiSpace(start)) start += 1;
  while (end > start && isHorizontalAsciiSpace(end - 1)) end -= 1;
  return text.slice(start, end);
}
function reject(reason: string): never { throw new Error(`XYZ import: ${reason}`); }

export function parseAndValidateXyz(bytes: Uint8Array, fileName: string | null, interpretation: typeof XYZ_INTERPRETATION) {
  if (interpretation !== XYZ_INTERPRETATION) reject('explicit interpretation required');
  if (!(bytes instanceof Uint8Array) || bytes.byteLength > STRUCTURE_MAX_FILE_BYTES) reject('byte limit or type');
  if (fileName !== null && (typeof fileName !== 'string' || fileName.length > 256 || unsafeText.test(fileName) || !fileName.endsWith('.xyz'))) reject('filename');
  const snapshot = new Uint8Array(bytes.byteLength);
  snapshot.set(bytes);
  if (snapshot[0] === 0xef && snapshot[1] === 0xbb && snapshot[2] === 0xbf) reject('BOM');
  const text = new TextDecoder('utf-8', { fatal: true }).decode(snapshot);
  const normalized = text.replace(/\r\n/g, '\n');
  if (normalized.includes('\r')) reject('bare CR');
  const lines = normalized.split('\n');
  if (lines.at(-1) === '') lines.pop();
  const countText = strip(lines[0] ?? '');
  if (!/^[1-9][0-9]*$/.test(countText)) reject('canonical positive count');
  const count = Number(countText);
  if (count > STRUCTURE_MAX_ATOMS || lines.length !== count + 2) reject('atom count or single-frame shape');
  const comment = lines[1];
  if (unsafeText.test(comment) || comment.includes('=')) reject('unsupported comment syntax');
  const coordinate = (token: string) => {
    if (!decimal.test(token)) reject('decimal coordinate syntax');
    const value = Number(token);
    const mantissa = token.split(/[eE]/)[0];
    if (!Number.isFinite(value) || Object.is(value, -0) || (value === 0 && /[1-9]/.test(mantissa))
      || Math.abs(value) > STRUCTURE_COORDINATE_LIMIT_ANGSTROM) reject('coordinate range, negative zero or underflow');
    return value;
  };
  const draft = createDefaultStructureDraft();
  const rawSha256 = sha256DigestBytes(snapshot);
  draft.documentId = `xyz-${rawSha256.slice(7, 47)}`;
  draft.title = 'Imported plain XYZ structure';
  draft.atoms = lines.slice(2).map((line, index) => {
    const tokens = strip(line).split(/[ \t]+/);
    if (tokens.length !== 4) reject('exactly four atom columns required');
    const identity = ELEMENT_IDENTITIES.find(element => element.symbol === tokens[0]);
    if (!identity) reject('canonical element required');
    return { id: `xyz-row-${String(index + 1).padStart(4, '0')}`,
      element: { atomicNumber: identity.atomicNumber, symbol: identity.symbol },
      position: { x: coordinate(tokens[1]), y: coordinate(tokens[2]), z: coordinate(tokens[3]) },
      isotope: null, formalCharge: null };
  });
  const document = finalizeStructureDocument(draft);
  const validationReceipt = createValidationReceipt(document);
  const base = { schemaVersion: 'tf.structure-xyz-import-receipt/0.1' as const,
    format: 'plain-xyz-single-frame' as const, fileName, byteLength: snapshot.byteLength, rawSha256, comment,
    interpretation, numericRepresentation: 'decimal-to-binary64-rounded' as const,
    atomIdentity: 'generated-file-row-not-persistent-physical-identity' as const,
    semanticDigest: document.semanticDigest,
    omittedProperties: ['cell', 'periodicity-metadata', 'bonds', 'charge', 'spin', 'isotopes', 'scientific-source', 'license'] as const,
    nativeExportLoss: 'XYZ-comment-and-transport-receipt-not-exported' as const };
  return deepFreeze({ document, validationReceipt,
    solverAdmissionReceipt: createSolverAdmissionReceipt(document, validationReceipt),
    transportReceipt: { ...base, receiptDigest: sha256DigestValue(base) } });
}

export type XyzImportReceipt = ReturnType<typeof parseAndValidateXyz>['transportReceipt'];
