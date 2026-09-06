import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

const encoder = new TextEncoder();

/** RFC-8259-compatible deterministic JSON: object keys sort; arrays never do. */
export function canonicalJson(value: unknown): string {
  return serialize(value, new Set());
}

export function sha256DigestBytes(bytes: Uint8Array): `sha256:${string}` {
  return `sha256:${bytesToHex(sha256(bytes))}`;
}

export function sha256DigestValue(value: unknown): `sha256:${string}` {
  return sha256DigestBytes(encoder.encode(canonicalJson(value)));
}

function serialize(value: unknown, ancestors: Set<object>): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || Object.is(value, -0)) {
      throw new TypeError('Canonical JSON accepts finite numbers other than negative zero.');
    }
    return JSON.stringify(value);
  }
  if (typeof value !== 'object') {
    throw new TypeError(`Canonical JSON cannot encode ${typeof value}.`);
  }
  if (ancestors.has(value)) throw new TypeError('Canonical JSON cannot encode cycles.');
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype) {
        throw new TypeError('Canonical JSON arrays must have Array.prototype.');
      }
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const keys = Reflect.ownKeys(descriptors);
      if (keys.some((key) => typeof key !== 'string')) {
        throw new TypeError('Canonical JSON arrays cannot have symbol keys.');
      }
      const entries: string[] = [];
      for (let index = 0; index < value.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
          throw new TypeError('Canonical JSON arrays must be dense data arrays.');
        }
        entries.push(serialize(descriptor.value, ancestors));
      }
      const allowedKeys = new Set(['length', ...Array.from({ length: value.length }, (_, index) => String(index))]);
      const extra = (keys as string[]).find((key) => !allowedKeys.has(key));
      if (extra !== undefined) throw new TypeError('Canonical JSON arrays cannot have extra properties.');
      return `[${entries.join(',')}]`;
    }
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('Canonical JSON records must have a plain or null prototype.');
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== 'string')) {
      throw new TypeError('Canonical JSON records cannot have symbol keys.');
    }
    const entries = (keys as string[]).sort().map((key) => {
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
        throw new TypeError('Canonical JSON records must contain enumerable defined data properties.');
      }
      return `${JSON.stringify(key)}:${serialize(descriptor.value, ancestors)}`;
    });
    return `{${entries.join(',')}}`;
  } finally {
    ancestors.delete(value);
  }
}
