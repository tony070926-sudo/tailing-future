#!/usr/bin/env node

/**
 * Materialize the exact v0.4.10 NaCl{100}-water plan as one immutable JSON
 * input for the independent Python semantic importer. This exports no solver
 * result and performs no OpenMM import or dynamics.
 */

import { createHash, randomUUID } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fchmodSync,
  fstatSync,
  fsyncSync,
  lstatSync,
  linkSync,
  openSync,
  realpathSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import { createNaClWaterInterfacePlanV0410 } from '../../../lib/simulation/nacl-water-interface-system-v0410.ts';

export const MAX_PLAN_BYTES = 8 * 1024 * 1024;
export const EXPECTED_PLAN_BYTE_COUNT = 5_053_426;
export const EXPECTED_PLAN_RAW_SHA256 =
  'sha256:473eaab96bb5d90c8ee2f298860aaec624a7124ad7fa99ef362ef9213c7334bd';
export const EXPECTED_PLAN_DIGEST =
  'sha256:f6f271d255de31ab655e62b7539b65e58a4e85994870232b675ef7b40f2fd0b8';

const EXPORT_SUMMARY = Object.freeze({
  schemaVersion: 'tf.nacl-water-interface-plan-export/0.4.11',
  byteCount: EXPECTED_PLAN_BYTE_COUNT,
  rawSha256: EXPECTED_PLAN_RAW_SHA256,
  planDigest: EXPECTED_PLAN_DIGEST,
  solverImportPerformed: false,
});

function usage() {
  return 'usage: node export-nacl-water-interface-plan-v0411.mjs --output /absolute/path/plan.json';
}

function normalizedAbsoluteOutput(value) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')
      || !path.isAbsolute(value) || path.normalize(value) !== value
      || value.endsWith(path.sep) || path.parse(value).root === value
      || path.basename(value).length === 0) {
    throw new Error('output must be one normalized absolute file path');
  }
  return value;
}

function parseArguments(argv) {
  if (argv.length !== 2 || argv[0] !== '--output') throw new Error(usage());
  return normalizedAbsoluteOutput(argv[1]);
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino;
}

function openRealParent(parent) {
  const before = lstatSync(parent, { bigint: true });
  if (!before.isDirectory() || before.isSymbolicLink() || realpathSync(parent) !== parent) {
    throw new Error('output parent must be one real canonical non-symlink directory');
  }
  const descriptor = openSync(
    parent,
    fsConstants.O_RDONLY | fsConstants.O_DIRECTORY | (fsConstants.O_NOFOLLOW ?? 0),
  );
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    const after = lstatSync(parent, { bigint: true });
    if (!opened.isDirectory() || !after.isDirectory() || after.isSymbolicLink()
        || !sameIdentity(before, opened) || !sameIdentity(opened, after)
        || realpathSync(parent) !== parent) {
      throw new Error('output parent identity changed while it was opened');
    }
    return { descriptor, identity: opened };
  } catch (error) {
    closeSync(descriptor);
    throw error;
  }
}

function assertPinnedParent(parent, identity) {
  const current = lstatSync(parent, { bigint: true });
  if (!current.isDirectory() || current.isSymbolicLink()
      || !sameIdentity(current, identity) || realpathSync(parent) !== parent) {
    throw new Error('output parent identity changed during publication');
  }
}

function assertRegularFile(metadata, { identity, links, mode, size }, label) {
  if (!metadata.isFile() || metadata.isSymbolicLink()
      || (identity && !sameIdentity(metadata, identity))
      || (links !== undefined && metadata.nlink !== links)
      || (mode !== undefined && (metadata.mode & 0o777n) !== mode)
      || (size !== undefined && metadata.size !== size)) {
    throw new Error(`${label} is not the expected bounded regular file`);
  }
}

function createLockedPlanBytes() {
  const plan = createNaClWaterInterfacePlanV0410();
  const bytes = Buffer.from(`${JSON.stringify(plan)}\n`, 'utf8');
  if (bytes.length < 1 || bytes.length > MAX_PLAN_BYTES || bytes.includes(0)) {
    throw new Error('serialized interface plan exceeds its byte contract');
  }
  const rawSha256 = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  if (bytes.length !== EXPECTED_PLAN_BYTE_COUNT || rawSha256 !== EXPECTED_PLAN_RAW_SHA256
      || plan.planDigest !== EXPECTED_PLAN_DIGEST) {
    throw new Error('serialized interface plan differs from the locked v0.4.11 bytes or digests');
  }
  return bytes;
}

const LOCKED_PLAN_BYTES = createLockedPlanBytes();

function writeAll(descriptor, bytes) {
  let offset = 0;
  while (offset < bytes.length) {
    const written = writeSync(descriptor, bytes, offset, bytes.length - offset);
    if (written < 1) throw new Error('interface plan write made no progress');
    offset += written;
  }
}

function removeOwnedTemporary(temporary, identity, parentDescriptor) {
  if (!identity) return;
  try {
    const current = lstatSync(temporary, { bigint: true });
    if (!current.isFile() || current.isSymbolicLink() || !sameIdentity(current, identity)) return;
    unlinkSync(temporary);
    fsyncSync(parentDescriptor);
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      // Failure cleanup is best effort and must never widen into deleting the output path.
    }
  }
}

export function exportNaClWaterInterfacePlanV0411(outputPath) {
  const output = normalizedAbsoluteOutput(outputPath);
  const parent = path.dirname(output);
  const temporary = path.join(parent, `.${path.basename(output)}.${randomUUID()}.tmp`);
  const { descriptor: parentDescriptor, identity: parentIdentity } = openRealParent(parent);
  let temporaryDescriptor;
  let temporaryIdentity;
  try {
    assertPinnedParent(parent, parentIdentity);
    temporaryDescriptor = openSync(
      temporary,
      fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL
        | (fsConstants.O_NOFOLLOW ?? 0),
      0o600,
    );
    temporaryIdentity = fstatSync(temporaryDescriptor, { bigint: true });
    assertRegularFile(temporaryIdentity, { links: 1n, size: 0n }, 'temporary output');

    writeAll(temporaryDescriptor, LOCKED_PLAN_BYTES);
    fchmodSync(temporaryDescriptor, 0o444);
    const prepared = fstatSync(temporaryDescriptor, { bigint: true });
    assertRegularFile(prepared, {
      identity: temporaryIdentity,
      links: 1n,
      mode: 0o444n,
      size: BigInt(LOCKED_PLAN_BYTES.length),
    }, 'prepared output');
    fsyncSync(temporaryDescriptor);

    assertPinnedParent(parent, parentIdentity);
    const temporaryPathStat = lstatSync(temporary, { bigint: true });
    assertRegularFile(temporaryPathStat, {
      identity: temporaryIdentity,
      links: 1n,
      mode: 0o444n,
      size: BigInt(LOCKED_PLAN_BYTES.length),
    }, 'temporary output path');

    // link(2) is the create-only publication point: an existing file, directory,
    // or symlink at output causes EEXIST and is never removed by this exporter.
    linkSync(temporary, output);
    const linkedOutput = lstatSync(output, { bigint: true });
    assertRegularFile(linkedOutput, {
      identity: temporaryIdentity,
      links: 2n,
      mode: 0o444n,
      size: BigInt(LOCKED_PLAN_BYTES.length),
    }, 'linked output');

    unlinkSync(temporary);
    const published = lstatSync(output, { bigint: true });
    assertRegularFile(published, {
      identity: temporaryIdentity,
      links: 1n,
      mode: 0o444n,
      size: BigInt(LOCKED_PLAN_BYTES.length),
    }, 'published output');
    assertPinnedParent(parent, parentIdentity);
    fsyncSync(temporaryDescriptor);
    fsyncSync(parentDescriptor);

    const persisted = lstatSync(output, { bigint: true });
    assertRegularFile(persisted, {
      identity: temporaryIdentity,
      links: 1n,
      mode: 0o444n,
      size: BigInt(LOCKED_PLAN_BYTES.length),
    }, 'persisted output');
    return EXPORT_SUMMARY;
  } catch (error) {
    if (temporaryDescriptor !== undefined) {
      try {
        closeSync(temporaryDescriptor);
      } catch {
        // Preserve the publication error; cleanup remains confined to our inode.
      }
      temporaryDescriptor = undefined;
    }
    removeOwnedTemporary(temporary, temporaryIdentity, parentDescriptor);
    throw error;
  } finally {
    try {
      if (temporaryDescriptor !== undefined) closeSync(temporaryDescriptor);
    } finally {
      closeSync(parentDescriptor);
    }
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    const result = exportNaClWaterInterfacePlanV0411(parseArguments(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
