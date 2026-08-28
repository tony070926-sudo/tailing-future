import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

const encoder = new TextEncoder();

export function digestValue(value: unknown) {
  return `sha256:${bytesToHex(sha256(encoder.encode(JSON.stringify(value))))}`;
}

export function shortDigest(value: unknown) {
  return digestValue(value).slice('sha256:'.length, 'sha256:'.length + 16);
}
