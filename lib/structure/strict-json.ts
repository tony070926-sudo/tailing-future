import { sha256DigestBytes } from './canonical-json';

export const STRUCTURE_NATIVE_MEDIA_TYPE = 'application/vnd.tailing-future.structure+json';
export const STRUCTURE_NATIVE_EXTENSION = '.tfstructure.json';
export const STRUCTURE_MAX_FILE_BYTES = 16_777_216;
export const STRUCTURE_MAX_JSON_NESTING_DEPTH = 128;

export type StructureTransportReceipt = Readonly<{
  schemaVersion: 'tf.structure-transport-receipt/0.1';
  format: 'tfstructure-native-json';
  mediaType: typeof STRUCTURE_NATIVE_MEDIA_TYPE;
  fileName: string | null;
  byteLength: number;
  rawSha256: `sha256:${string}`;
}>;

export class StrictJsonError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'StrictJsonError';
    this.code = code;
  }
}

export function parseStructureNativeJsonBytes(
  bytes: Uint8Array,
  fileName: string | null = null,
): Readonly<{ value: unknown; transportReceipt: StructureTransportReceipt }> {
  if (!(bytes instanceof Uint8Array)) throw new StrictJsonError('bytes-required', 'Input must be a Uint8Array.');
  if (bytes.byteLength > STRUCTURE_MAX_FILE_BYTES) {
    throw new StrictJsonError('byte-limit', `Native structure file exceeds ${STRUCTURE_MAX_FILE_BYTES} bytes.`);
  }
  // Everything below consumes one private snapshot. This keeps decoded content,
  // byte length, and the raw receipt bound even when the caller supplied a view
  // backed by mutable shared memory.
  const snapshot = new Uint8Array(bytes.byteLength);
  snapshot.set(bytes);
  if (snapshot.byteLength >= 3 && snapshot[0] === 0xef && snapshot[1] === 0xbb && snapshot[2] === 0xbf) {
    throw new StrictJsonError('bom-forbidden', 'UTF-8 BOM is forbidden.');
  }
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(snapshot);
  } catch {
    throw new StrictJsonError('invalid-utf8', 'Native structure JSON must be valid UTF-8.');
  }
  if (text.startsWith('\ufeff')) throw new StrictJsonError('bom-forbidden', 'Unicode BOM is forbidden.');
  if (text.includes('\u0000')) throw new StrictJsonError('nul-forbidden', 'NUL characters are forbidden.');
  scanStrictJson(text);
  let value: unknown;
  try {
    value = JSON.parse(text) as unknown;
  } catch {
    throw new StrictJsonError('json-syntax', 'Native structure file is not one complete JSON value.');
  }
  assertSafeParsedTree(value, '$', new Set());
  return {
    value,
    transportReceipt: Object.freeze({
      schemaVersion: 'tf.structure-transport-receipt/0.1',
      format: 'tfstructure-native-json',
      mediaType: STRUCTURE_NATIVE_MEDIA_TYPE,
      fileName,
      byteLength: snapshot.byteLength,
      rawSha256: sha256DigestBytes(snapshot),
    }),
  };
}

export function encodeStructureNativeJson(value: unknown): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value)}\n`);
}

function scanStrictJson(source: string): void {
  let index = 0;
  const fail = (code: string, message: string): never => {
    throw new StrictJsonError(code, `${message} (offset ${index}).`);
  };
  const whitespace = () => {
    while (index < source.length && /[\u0009\u000a\u000d\u0020]/.test(source[index])) index += 1;
  };
  const readStringToken = (): string => {
    if (source[index] !== '"') fail('json-syntax', 'Expected string');
    const start = index;
    index += 1;
    while (index < source.length) {
      const code = source.charCodeAt(index);
      if (code === 0x22) {
        index += 1;
        try {
          return JSON.parse(source.slice(start, index)) as string;
        } catch {
          return fail('json-syntax', 'Invalid JSON string');
        }
      }
      if (code < 0x20) fail('json-syntax', 'Unescaped control character in string');
      if (code === 0x5c) {
        index += 1;
        if (index >= source.length) fail('json-syntax', 'Unterminated escape');
        if (source[index] === 'u') {
          const hex = source.slice(index + 1, index + 5);
          if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail('json-syntax', 'Invalid Unicode escape');
          index += 5;
          continue;
        }
        if (!/["\\/bfnrt]/.test(source[index])) fail('json-syntax', 'Invalid JSON escape');
      }
      index += 1;
    }
    return fail('json-syntax', 'Unterminated string');
  };
  const readValue = (depth: number): void => {
    if (depth > STRUCTURE_MAX_JSON_NESTING_DEPTH) {
      fail('nesting-depth', `JSON nesting exceeds ${STRUCTURE_MAX_JSON_NESTING_DEPTH}`);
    }
    whitespace();
    if (source[index] === '{') {
      index += 1;
      whitespace();
      const decodedKeys = new Set<string>();
      if (source[index] === '}') { index += 1; return; }
      while (index < source.length) {
        whitespace();
        const key = readStringToken();
        if (key.includes('\u0000')) fail('nul-forbidden', 'Decoded object keys cannot contain NUL');
        if (decodedKeys.has(key)) fail('duplicate-key', `Duplicate decoded object key ${JSON.stringify(key)}`);
        decodedKeys.add(key);
        whitespace();
        if (source[index] !== ':') fail('json-syntax', 'Expected colon');
        index += 1;
        readValue(depth + 1);
        whitespace();
        if (source[index] === '}') { index += 1; return; }
        if (source[index] !== ',') fail('json-syntax', 'Expected comma or object close');
        index += 1;
      }
      fail('json-syntax', 'Unterminated object');
    }
    if (source[index] === '[') {
      index += 1;
      whitespace();
      if (source[index] === ']') { index += 1; return; }
      while (index < source.length) {
        readValue(depth + 1);
        whitespace();
        if (source[index] === ']') { index += 1; return; }
        if (source[index] !== ',') fail('json-syntax', 'Expected comma or array close');
        index += 1;
      }
      fail('json-syntax', 'Unterminated array');
    }
    if (source[index] === '"') { readStringToken(); return; }
    const tail = source.slice(index);
    const literal = /^(true|false|null)/.exec(tail);
    if (literal) { index += literal[0].length; return; }
    const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(tail);
    if (number) { index += number[0].length; return; }
    fail('json-syntax', 'Expected JSON value');
  };
  whitespace();
  readValue(0);
  whitespace();
  if (index !== source.length) fail('trailing-data', 'Trailing data after JSON value');
}

function assertSafeParsedTree(value: unknown, path: string, ancestors: Set<object>): void {
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new StrictJsonError('nonfinite-number', `${path} is not finite.`);
    if (Object.is(value, -0)) throw new StrictJsonError('negative-zero', `${path} contains forbidden negative zero.`);
    return;
  }
  if (typeof value === 'string') {
    if (value.includes('\u0000')) throw new StrictJsonError('nul-forbidden', `${path} contains a decoded NUL character.`);
    return;
  }
  if (value === null || typeof value === 'boolean') return;
  if (typeof value !== 'object') throw new StrictJsonError('unsafe-value', `${path} contains an unsupported value.`);
  if (ancestors.has(value)) throw new StrictJsonError('cycle', `${path} contains a cycle.`);
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      for (let index = 0; index < value.length; index += 1) {
        assertSafeParsedTree(value[index], `${path}[${index}]`, ancestors);
      }
      return;
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) {
      throw new StrictJsonError('prototype', `${path} is not a plain JSON record.`);
    }
    for (const [key, child] of Object.entries(value)) {
      if (key.includes('\u0000')) {
        throw new StrictJsonError('nul-forbidden', `${path} contains a decoded NUL character in an object key.`);
      }
      if (key === '__proto__' || key === 'prototype' || key === 'constructor') {
        throw new StrictJsonError('prototype-key', `${path}.${key} is forbidden.`);
      }
      assertSafeParsedTree(child, `${path}.${key}`, ancestors);
    }
  } finally {
    ancestors.delete(value);
  }
}
