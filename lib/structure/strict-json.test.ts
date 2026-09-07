import { describe, expect, it, vi } from 'vitest';
import {
  STRUCTURE_MAX_FILE_BYTES,
  STRUCTURE_MAX_JSON_NESTING_DEPTH,
  StrictJsonError,
  parseStructureNativeJsonBytes,
} from './strict-json';
import { sha256DigestBytes } from './canonical-json';

const encoder = new TextEncoder();

describe('browser-safe duplicate-aware native JSON parser', () => {
  it('returns a separate raw transport receipt bound to exact bytes', () => {
    const bytes = encoder.encode('{"a":1,"nested":{"b":2}}');
    const parsed = parseStructureNativeJsonBytes(bytes, 'sample.tfstructure.json');
    expect(parsed.value).toEqual({ a: 1, nested: { b: 2 } });
    expect(parsed.transportReceipt).toMatchObject({
      schemaVersion: 'tf.structure-transport-receipt/0.1',
      format: 'tfstructure-native-json',
      fileName: 'sample.tfstructure.json',
      byteLength: bytes.length,
    });
    expect(parsed.transportReceipt.rawSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
  });

  it.each([
    ['decoded escaped duplicate', '{"a":1,"\\u0061":2}', 'duplicate-key'],
    ['nested decoded duplicate', '{"x":{"a":1,"\\u0061":2}}', 'duplicate-key'],
    ['trailing token', '{"a":1} true', 'trailing-data'],
    ['NUL', '{"a":"\u0000"}', 'nul-forbidden'],
    ['escaped decoded NUL', '{"a":"\\u0000"}', 'nul-forbidden'],
    ['escaped decoded NUL root key', '{"\\u0000":1}', 'nul-forbidden'],
    ['escaped decoded NUL nested key', '{"x":{"a\\u0000b":1}}', 'nul-forbidden'],
    ['overflow number', '{"a":1e400}', 'nonfinite-number'],
    ['negative zero', '{"a":[0,-0]}', 'negative-zero'],
    ['prototype key', '{"__proto__":1}', 'prototype-key'],
    ['constructor key', '{"x":{"constructor":1}}', 'prototype-key'],
  ])('rejects %s', (_label, source, code) => {
    expectErrorCode(() => parseStructureNativeJsonBytes(encoder.encode(source)), code);
  });

  it('rejects BOM, bad UTF-8, and over-limit input before decode', () => {
    expectErrorCode(() => parseStructureNativeJsonBytes(new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d])), 'bom-forbidden');
    expectErrorCode(() => parseStructureNativeJsonBytes(new Uint8Array([0xc3, 0x28])), 'invalid-utf8');
    expectErrorCode(
      () => parseStructureNativeJsonBytes(new Uint8Array(STRUCTURE_MAX_FILE_BYTES + 1).fill(0xff)),
      'byte-limit',
    );
  });

  it('rejects excessive nesting with a stable parser error before browser stack exhaustion', () => {
    const source = `${'['.repeat(STRUCTURE_MAX_JSON_NESTING_DEPTH + 1)}0${']'.repeat(STRUCTURE_MAX_JSON_NESTING_DEPTH + 1)}`;
    expectErrorCode(() => parseStructureNativeJsonBytes(encoder.encode(source)), 'nesting-depth');
  });

  it('binds decode and raw receipt to one private snapshot of shared input bytes', () => {
    const shared = new Uint8Array(new SharedArrayBuffer(7));
    shared.set(encoder.encode('{"a":1}'));
    const expected = sha256DigestBytes(new Uint8Array(shared));
    const decode = TextDecoder.prototype.decode;
    const decoderSpy = vi.spyOn(TextDecoder.prototype, 'decode').mockImplementation(function (this: TextDecoder, input, options) {
      const decoded = decode.call(this, input, options);
      shared[5] = '2'.charCodeAt(0);
      return decoded;
    });
    const parsed = parseStructureNativeJsonBytes(shared);
    decoderSpy.mockRestore();
    expect(parsed.value).toEqual({ a: 1 });
    expect(parsed.transportReceipt.rawSha256).toBe(expected);
    expect(new TextDecoder().decode(shared)).toBe('{"a":2}');
  });
});

function expectErrorCode(callback: () => unknown, code: string) {
  try {
    callback();
    throw new Error('Expected parser rejection.');
  } catch (error) {
    expect(error).toBeInstanceOf(StrictJsonError);
    expect((error as StrictJsonError).code).toBe(code);
  }
}
