import { createHash } from 'node:crypto';

export const R16C_CANONICAL_JSON_PROFILE =
  'tf.rfc8785-ijson-safeinteger-no-negative-zero-lf/1';
export const R16C_MAXIMUM_JSON_DEPTH = 128;
export const R16C_MAXIMUM_JSON_NODES = 262_144;
export const R16C_MAXIMUM_STRING_CODE_UNITS = 1_048_576;

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function assertUnicodeScalarString(value, label) {
  if (value.length > R16C_MAXIMUM_STRING_CODE_UNITS) {
    throw new TypeError(
      `${label} exceeds ${R16C_MAXIMUM_STRING_CODE_UNITS} UTF-16 code units`,
    );
  }
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (!(next >= 0xdc00 && next <= 0xdfff)) {
        throw new TypeError(`${label} contains a lone high surrogate`);
      }
      index += 1;
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      throw new TypeError(`${label} contains a lone low surrogate`);
    }
  }
}

function assertIJsonValue(value, label, depth, state) {
  state.nodes += 1;
  if (state.nodes > R16C_MAXIMUM_JSON_NODES) {
    throw new TypeError(`${label} exceeds ${R16C_MAXIMUM_JSON_NODES} JSON nodes`);
  }
  if (depth > R16C_MAXIMUM_JSON_DEPTH) {
    throw new TypeError(`${label} exceeds ${R16C_MAXIMUM_JSON_DEPTH} JSON levels`);
  }
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    assertUnicodeScalarString(value, label);
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${label} is not finite`);
    if (Object.is(value, -0)) throw new TypeError(`${label} is negative zero`);
    if (Number.isInteger(value) && !Number.isSafeInteger(value)) {
      throw new TypeError(`${label} is an unsafe integer`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertIJsonValue(entry, `${label}[${index}]`, depth + 1, state));
    return;
  }
  if (!isPlainObject(value)) {
    throw new TypeError(`${label} is not an I-JSON value`);
  }
  for (const [key, entry] of Object.entries(value)) {
    state.nodes += 1;
    if (state.nodes > R16C_MAXIMUM_JSON_NODES) {
      throw new TypeError(`${label} exceeds ${R16C_MAXIMUM_JSON_NODES} JSON nodes`);
    }
    assertUnicodeScalarString(key, `${label} key`);
    assertIJsonValue(entry, `${label}.${key}`, depth + 1, state);
  }
}

/** RFC 8785/JCS serialization for already parsed I-JSON, plus local safety rules. */
export function canonicalR16cJson(value) {
  assertIJsonValue(value, '$', 0, { nodes: 0 });
  const encode = (entry) => {
    if (entry === null) return 'null';
    if (Array.isArray(entry)) return `[${entry.map(encode).join(',')}]`;
    if (isPlainObject(entry)) {
      return `{${Object.keys(entry)
        .sort()
        .map((key) => `${JSON.stringify(key)}:${encode(entry[key])}`)
        .join(',')}}`;
    }
    return JSON.stringify(entry);
  };
  return encode(value);
}

export function canonicalR16cJsonBytes(value) {
  return Buffer.from(`${canonicalR16cJson(value)}\n`, 'utf8');
}

export function r16cSha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function scanJsonWithoutDuplicateKeys(source, label, maximumDepth) {
  let position = 0;
  const fail = (message) => {
    throw new SyntaxError(`${label}: ${message} at character ${position}`);
  };
  const skipWhitespace = () => {
    while (
      position < source.length &&
      /[\u0009\u000a\u000d\u0020]/.test(source[position])
    ) position += 1;
  };
  const parseString = () => {
    if (source[position] !== '"') fail('expected JSON string');
    const start = position;
    position += 1;
    while (position < source.length) {
      const code = source.charCodeAt(position);
      if (source[position] === '"') {
        position += 1;
        return JSON.parse(source.slice(start, position));
      }
      if (source[position] === '\\') {
        position += 1;
        const escape = source[position];
        if (!'"\\/bfnrtu'.includes(escape ?? '')) {
          fail('invalid JSON string escape');
        }
        if (escape === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(source.slice(position + 1, position + 5))) {
            fail('invalid JSON Unicode escape');
          }
          position += 5;
        } else position += 1;
        continue;
      }
      if (code < 0x20) fail('unescaped control character in JSON string');
      position += 1;
    }
    fail('unterminated JSON string');
  };
  const parseValue = (depth = 0) => {
    if (depth > maximumDepth) fail(`JSON nesting exceeds ${maximumDepth} levels`);
    skipWhitespace();
    if (source[position] === '{') {
      position += 1;
      skipWhitespace();
      const keys = new Set();
      if (source[position] === '}') {
        position += 1;
        return;
      }
      while (position < source.length) {
        const key = parseString();
        if (keys.has(key)) {
          throw new SyntaxError(
            `${label}: duplicate JSON key ${JSON.stringify(key)} at character ${position}`,
          );
        }
        keys.add(key);
        skipWhitespace();
        if (source[position] !== ':') fail('expected colon after JSON object key');
        position += 1;
        parseValue(depth + 1);
        skipWhitespace();
        if (source[position] === '}') {
          position += 1;
          return;
        }
        if (source[position] !== ',') fail('expected comma or closing brace');
        position += 1;
        skipWhitespace();
      }
      fail('unterminated JSON object');
    }
    if (source[position] === '[') {
      position += 1;
      skipWhitespace();
      if (source[position] === ']') {
        position += 1;
        return;
      }
      while (position < source.length) {
        parseValue(depth + 1);
        skipWhitespace();
        if (source[position] === ']') {
          position += 1;
          return;
        }
        if (source[position] !== ',') fail('expected comma or closing bracket');
        position += 1;
      }
      fail('unterminated JSON array');
    }
    if (source[position] === '"') {
      parseString();
      return;
    }
    for (const literal of ['true', 'false', 'null']) {
      if (source.startsWith(literal, position)) {
        position += literal.length;
        return;
      }
    }
    const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(
      source.slice(position),
    );
    if (number) {
      position += number[0].length;
      return;
    }
    fail('expected JSON value');
  };
  parseValue();
  skipWhitespace();
  if (position !== source.length) fail('unexpected trailing JSON content');
}

/** Byte-first parser: strict UTF-8 and duplicate detection precede JSON.parse. */
export function parseR16cJsonBytes(
  bytes,
  {
    label = 'R16c JSON',
    maximumDepth = R16C_MAXIMUM_JSON_DEPTH,
    requireCanonical = false,
  } = {},
) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) {
    throw new TypeError(`${label} must be bytes`);
  }
  if (!Number.isSafeInteger(maximumDepth) || maximumDepth < 1) {
    throw new TypeError(`${label} maximumDepth must be a positive safe integer`);
  }
  let source;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new SyntaxError(`${label} is not strict UTF-8`, { cause: error });
  }
  scanJsonWithoutDuplicateKeys(source, label, maximumDepth);
  const value = JSON.parse(source);
  assertIJsonValue(value, label, 0, { nodes: 0 });
  if (requireCanonical) {
    const canonical = canonicalR16cJsonBytes(value);
    if (!Buffer.from(bytes).equals(canonical)) {
      throw new SyntaxError(
        `${label} is not exact ${R16C_CANONICAL_JSON_PROFILE} bytes`,
      );
    }
  }
  return value;
}
