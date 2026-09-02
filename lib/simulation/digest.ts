import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

const encoder = new TextEncoder();

export function digestValue(value: unknown) {
  return `sha256:${bytesToHex(sha256(encoder.encode(serializeDigestValue(value, new Set()))))}`;
}

export function shortDigest(value: unknown) {
  return digestValue(value).slice('sha256:'.length, 'sha256:'.length + 16);
}

function serializeDigestValue(value: unknown, ancestors: Set<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('digest values must contain only finite numbers');
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new TypeError(`digest values cannot contain ${typeof value} values`);
  }
  if (ancestors.has(value)) throw new TypeError('digest values cannot contain cycles');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const ownKeys = Reflect.ownKeys(descriptors);
      if (ownKeys.some((key) => typeof key !== 'string')) {
        throw new TypeError('digest arrays cannot contain symbol keys');
      }
      const unexpectedKey = (ownKeys as string[]).find((key) => (
        key !== 'length' && !isCanonicalArrayIndex(key, value.length)
      ));
      if (unexpectedKey !== undefined) {
        throw new TypeError('digest arrays cannot contain non-index properties');
      }
      const entries: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor) {
          entries.push('null');
          continue;
        }
        if (!descriptor.enumerable) {
          throw new TypeError('digest array elements cannot be non-enumerable');
        }
        if (!('value' in descriptor)) {
          throw new TypeError('digest arrays cannot contain accessor elements');
        }
        entries.push(descriptor.value === undefined
          ? 'null'
          : serializeDigestValue(descriptor.value, ancestors));
      }
      return `[${entries.join(',')}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('digest records must have Object.prototype or null prototype');
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const ownKeys = Reflect.ownKeys(descriptors);
    if (ownKeys.some((key) => typeof key !== 'string')) {
      throw new TypeError('digest records cannot contain symbol keys');
    }
    const entries: string[] = [];
    for (const key of (ownKeys as string[]).sort()) {
      const descriptor = descriptors[key];
      if (!descriptor.enumerable) {
        throw new TypeError('digest records cannot contain non-enumerable properties');
      }
      if (!('value' in descriptor)) {
        throw new TypeError('digest records cannot contain accessor properties');
      }
      if (descriptor.value === undefined) continue;
      entries.push(`${JSON.stringify(key)}:${serializeDigestValue(descriptor.value, ancestors)}`);
    }
    return `{${entries.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}

function isCanonicalArrayIndex(key: string, length: number) {
  const index = Number(key);
  return Number.isInteger(index) && index >= 0 && index < length && String(index) === key;
}
