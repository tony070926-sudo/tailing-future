import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  chmodSync,
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  EXPECTED_PLAN_BYTE_COUNT,
  EXPECTED_PLAN_DIGEST,
  EXPECTED_PLAN_RAW_SHA256,
  MAX_PLAN_BYTES,
  exportNaClWaterInterfacePlanV0411,
} from './export-nacl-water-interface-plan-v0411.mjs';

const cliPath = fileURLToPath(new URL('./export-nacl-water-interface-plan-v0411.mjs', import.meta.url));
const roots = [];
const expectedSummary = Object.freeze({
  schemaVersion: 'tf.nacl-water-interface-plan-export/0.4.11',
  byteCount: EXPECTED_PLAN_BYTE_COUNT,
  rawSha256: EXPECTED_PLAN_RAW_SHA256,
  planDigest: EXPECTED_PLAN_DIGEST,
  solverImportPerformed: false,
});

function temporaryRoot() {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'tf-nacl-plan-export-v0411-')));
  roots.push(root);
  return root;
}

function captureError(action) {
  try {
    action();
  } catch (error) {
    return error;
  }
  throw new Error('expected action to fail');
}

afterEach(() => {
  for (const root of roots.splice(0)) {
    // Vitest owns these fresh trees; cleanup is confined to mkdtempSync output.
    rmSync(root, { recursive: true, force: true });
  }
});

describe('v0.4.11 NaCl-water interface plan exporter', () => {
  it('publishes the locked raw bytes as one fsynced 0444 single-link regular file', () => {
    const root = temporaryRoot();
    const output = path.join(root, 'plan.json');
    const summary = exportNaClWaterInterfacePlanV0411(output);
    const bytes = readFileSync(output);
    const metadata = lstatSync(output);

    expect(summary).toEqual(expectedSummary);
    expect(Object.isFrozen(summary)).toBe(true);
    expect(bytes.length).toBe(EXPECTED_PLAN_BYTE_COUNT);
    expect(bytes.length).toBeLessThanOrEqual(MAX_PLAN_BYTES);
    expect(bytes.at(-1)).toBe(0x0a);
    expect(bytes.includes(0)).toBe(false);
    expect(`sha256:${createHash('sha256').update(bytes).digest('hex')}`)
      .toBe(EXPECTED_PLAN_RAW_SHA256);
    expect(JSON.parse(bytes.toString('utf8')).planDigest).toBe(EXPECTED_PLAN_DIGEST);
    expect(metadata.isFile()).toBe(true);
    expect(metadata.isSymbolicLink()).toBe(false);
    expect(metadata.nlink).toBe(1);
    expect(metadata.mode & 0o777).toBe(0o444);
    expect(metadata.size).toBe(EXPECTED_PLAN_BYTE_COUNT);
    expect(realpathSync(output)).toBe(output);
  });

  it('rejects an existing output without changing or deleting it', () => {
    const root = temporaryRoot();
    const output = path.join(root, 'plan.json');
    const sentinel = Buffer.from('pre-existing bytes\n');
    writeFileSync(output, sentinel);
    chmodSync(output, 0o640);
    const before = lstatSync(output, { bigint: true });

    const error = captureError(() => exportNaClWaterInterfacePlanV0411(output));
    const after = lstatSync(output, { bigint: true });
    expect(error.code).toBe('EEXIST');
    expect(readFileSync(output)).toEqual(sentinel);
    expect(after.dev).toBe(before.dev);
    expect(after.ino).toBe(before.ino);
    expect(after.mode & 0o777n).toBe(0o640n);
    expect(readdirSync(root)).toEqual(['plan.json']);
  });

  it('rejects symlink parents and preserves symlink output targets', () => {
    const root = temporaryRoot();
    const realParent = path.join(root, 'real-parent');
    const linkedParent = path.join(root, 'linked-parent');
    mkdirSync(realParent);
    symlinkSync(realParent, linkedParent, 'dir');

    expect(() => exportNaClWaterInterfacePlanV0411(path.join(linkedParent, 'plan.json')))
      .toThrow(/real canonical non-symlink directory/);
    expect(existsSync(path.join(realParent, 'plan.json'))).toBe(false);

    const sentinel = path.join(root, 'sentinel.txt');
    const output = path.join(realParent, 'plan.json');
    writeFileSync(sentinel, 'keep me\n');
    symlinkSync(sentinel, output);
    const error = captureError(() => exportNaClWaterInterfacePlanV0411(output));
    expect(error.code).toBe('EEXIST');
    expect(lstatSync(output).isSymbolicLink()).toBe(true);
    expect(readFileSync(sentinel, 'utf8')).toBe('keep me\n');
    expect(readdirSync(realParent)).toEqual(['plan.json']);
  });

  it('rejects relative and lexically non-normalized output paths', () => {
    const root = temporaryRoot();
    expect(() => exportNaClWaterInterfacePlanV0411('relative/plan.json'))
      .toThrow(/normalized absolute file path/);
    expect(() => exportNaClWaterInterfacePlanV0411(`${root}/nested/../plan.json`))
      .toThrow(/normalized absolute file path/);
    expect(() => exportNaClWaterInterfacePlanV0411(`${root}/`))
      .toThrow(/normalized absolute file path/);
    expect(existsSync(path.join(root, 'plan.json'))).toBe(false);
  });

  it('prints only the fixed non-solver summary after CLI publication', () => {
    const root = temporaryRoot();
    const output = path.join(root, 'cli-plan.json');
    const result = spawnSync(process.execPath, [cliPath, '--output', output], {
      encoding: 'utf8',
      timeout: 30_000,
    });

    expect(result.status).toBe(0);
    expect(result.error).toBeUndefined();
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(`${JSON.stringify(expectedSummary)}\n`);
    expect(JSON.parse(result.stdout)).toEqual(expectedSummary);
    expect(lstatSync(output).mode & 0o777).toBe(0o444);
  });
});
