import { afterEach, describe, expect, it } from 'vitest';
import { digestValue, shortDigest } from './digest.ts';

const originalObjectToJson = Object.getOwnPropertyDescriptor(Object.prototype, 'toJSON');
const originalArrayToJson = Object.getOwnPropertyDescriptor(Array.prototype, 'toJSON');

afterEach(() => {
  restoreDescriptor(Object.prototype, 'toJSON', originalObjectToJson);
  restoreDescriptor(Array.prototype, 'toJSON', originalArrayToJson);
});

describe('canonical scientific digest', () => {
  it('is independent of record insertion order and retains JSON undefined-array semantics', () => {
    expect(digestValue({ b: 2, a: 1, omitted: undefined })).toBe(digestValue({ a: 1, b: 2 }));
    expect(digestValue([1, undefined, 3])).toBe(digestValue([1, null, 3]));
    expect(shortDigest({ b: 2, a: 1 })).toHaveLength(16);
  });

  it('ignores inherited Object and Array toJSON pollution without collapsing namespaces', () => {
    Object.defineProperty(Object.prototype, 'toJSON', {
      configurable: true,
      value: () => null,
    });
    Object.defineProperty(Array.prototype, 'toJSON', {
      configurable: true,
      value: () => null,
    });
    expect(digestValue({ namespace: 'configuration' })).not.toBe(digestValue(null));
    expect(digestValue({ namespace: 'configuration' }))
      .not.toBe(digestValue({ namespace: 'topology' }));
    expect(digestValue(['configuration'])).not.toBe(digestValue(null));
  });

  it('rejects accessors without invoking them', () => {
    let calls = 0;
    const hostile = {} as Record<string, unknown>;
    Object.defineProperty(hostile, 'payload', {
      enumerable: true,
      get: () => {
        calls += 1;
        return 'side effect';
      },
    });
    expect(() => digestValue(hostile)).toThrow(/accessor/);
    expect(calls).toBe(0);

    const hostileArray = [0];
    Object.defineProperty(hostileArray, '0', {
      enumerable: true,
      get: () => {
        calls += 1;
        return 1;
      },
    });
    expect(() => digestValue(hostileArray)).toThrow(/accessor/);
    expect(calls).toBe(0);
  });

  it('rejects hidden, symbolic, exotic, cyclic, callable, and non-finite payloads', () => {
    const hidden = { visible: true };
    Object.defineProperty(hidden, 'hidden', { value: true, enumerable: false });
    expect(() => digestValue(hidden)).toThrow(/non-enumerable/);

    const symbolic = { visible: true } as Record<PropertyKey, unknown>;
    symbolic[Symbol('hidden')] = true;
    expect(() => digestValue(symbolic)).toThrow(/symbol/);
    const decoratedArray = [1] as number[] & { metadata?: boolean };
    decoratedArray.metadata = true;
    expect(() => digestValue(decoratedArray)).toThrow(/non-index/);
    expect(() => digestValue(new Date(0))).toThrow(/Object\.prototype/);

    const cyclic: { self?: unknown } = {};
    cyclic.self = cyclic;
    expect(() => digestValue(cyclic)).toThrow(/cycles/);
    expect(() => digestValue({ callable: () => null })).toThrow(/function/);
    expect(() => digestValue({ nonfinite: Number.NaN })).toThrow(/finite/);
    expect(digestValue(Array(2))).toBe(digestValue([null, null]));
  });
});

function restoreDescriptor(target: object, key: PropertyKey, descriptor?: PropertyDescriptor) {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else Reflect.deleteProperty(target, key);
}
