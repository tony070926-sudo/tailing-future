#!/usr/bin/env node

/**
 * Independent read-only verifier for the v0.4.11 Python semantic-import bundle.
 * It rebinds every normalized byte to the locked plan and never loads OpenMM
 * or invokes a solver.
 */

import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
} from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import process from 'node:process';
import Ajv2020 from 'ajv/dist/2020.js';
import { digestValue } from '../../../lib/simulation/digest.ts';
import { assertNaClWaterInterfacePlanV0410 } from '../../../lib/simulation/nacl-water-interface-system-v0410.ts';

const MAX_PATH_BYTES = 4_096;
const MAX_PLAN_BYTES = 8 * 1024 * 1024;
const MAX_RECEIPT_BYTES = 1024 * 1024;
const EXPECTED_PLAN_BYTES = 5_053_426;
const EXPECTED_PLAN_RAW_SHA256 =
  'sha256:473eaab96bb5d90c8ee2f298860aaec624a7124ad7fa99ef362ef9213c7334bd';
const EXPECTED_DIGESTS = Object.freeze({
  coordinatePayload: 'sha256:17631204745ab1bb264d2052c9cfefb6afbd989a6559d6de1ef5c091c1d8ae99',
  topology: 'sha256:e9d7293e55709ffe8e964c266fe936d597d30d2dd244b398e20b4d0239709183',
  coordinateConstruction: 'sha256:7b77acefe148d5e6adb4e27829589cb0e34e17d5cfe78fb0c83d0816ceb05fbb',
  system: 'sha256:d47785bc641fd6483c58b8549bf7c0dc7e116a5892c0c13864c98e87c712133a',
  coordinateSeed: 'sha256:beb7f2c4f997e2e8b8158a05d6083a7d6569bd1f11457f922844646cac0cc426',
  plan: 'sha256:f6f271d255de31ab655e62b7539b65e58a4e85994870232b675ef7b40f2fd0b8',
});
const SPECIES_CODES = Object.freeze({ 'Na+': 0, 'Cl-': 1, 'TIP3P-O': 2, 'TIP3P-H': 3 });
const EXPECTED_ROOT_INVENTORY = Object.freeze([
  'arrays',
  'manifests',
  'semantic-import-receipt.json',
]);
const EXPECTED_ARRAY_INVENTORY = Object.freeze([
  'cell-vectors.f64le',
  'formal-charges.f64le',
  'masses.f64le',
  'model-point-charges.f64le',
  'positions.f64le',
  'rigid-constraint-indices.u32le',
  'rigid-constraint-targets.f64le',
  'species-codes.u32le',
  'structural-bond-indices.u32le',
]);

function usage() {
  return 'usage: node verify-nacl-water-interface-import-v0411.mjs --plan /absolute/plan.json --bundle /absolute/import-directory';
}

function parseArguments(argv) {
  if (argv.length !== 4 || argv[0] !== '--plan' || argv[2] !== '--bundle') {
    throw new Error(usage());
  }
  return {
    plan: normalizedAbsolute(argv[1], 'plan'),
    bundle: normalizedAbsolute(argv[3], 'bundle'),
  };
}

function normalizedAbsolute(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.includes('\0')
      || Buffer.byteLength(value) > MAX_PATH_BYTES || !path.isAbsolute(value)
      || path.normalize(value) !== value || path.parse(value).root === value) {
    throw new Error(`${label} must be one normalized absolute path`);
  }
  return value;
}

function sameIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size
    && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}

function assertCanonicalDirectory(directory, label, expectedMode, expectedIdentity) {
  const metadata = lstatSync(directory, { bigint: true });
  if (!metadata.isDirectory() || metadata.isSymbolicLink() || realpathSync(directory) !== directory
      || (expectedMode !== undefined && expectedMode !== null
        && (metadata.mode & 0o777n) !== expectedMode)
      || (expectedIdentity !== undefined && !sameIdentity(metadata, expectedIdentity))) {
    throw new Error(`${label} is not the expected canonical directory`);
  }
  return metadata;
}

function readBoundedRegularFile(
  filename,
  maximumBytes,
  expectedMode = 0o444n,
  snapshots = undefined,
) {
  const before = lstatSync(filename, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
      || before.size < 1n || before.size > BigInt(maximumBytes)
      || (expectedMode !== undefined && expectedMode !== null
        && (before.mode & 0o777n) !== expectedMode)) {
    throw new Error(`${path.basename(filename)} is not one bounded single-link read-only file`);
  }
  const descriptor = openSync(filename, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(descriptor, { bigint: true });
    if (!sameIdentity(before, opened)) throw new Error(`${path.basename(filename)} changed while opening`);
    const bytes = readFileSync(descriptor);
    const closed = fstatSync(descriptor, { bigint: true });
    const after = lstatSync(filename, { bigint: true });
    if (!sameIdentity(opened, closed) || !sameIdentity(opened, after)
        || BigInt(bytes.length) !== opened.size) {
      throw new Error(`${path.basename(filename)} changed while reading`);
    }
    if (snapshots !== undefined) {
      snapshots.push(Object.freeze({
        filename,
        identity: after,
        expectedMode,
      }));
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function assertStableRegularFileSnapshot(snapshot) {
  const metadata = lstatSync(snapshot.filename, { bigint: true });
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1n
      || (snapshot.expectedMode !== undefined && snapshot.expectedMode !== null
        && (metadata.mode & 0o777n) !== snapshot.expectedMode)
      || !sameIdentity(metadata, snapshot.identity)) {
    throw new Error(`${path.basename(snapshot.filename)} changed after verification`);
  }
}

function assertClosedBundleInventory(bundlePath) {
  if (readdirSync(bundlePath).sort().join('\0') !== [...EXPECTED_ROOT_INVENTORY].sort().join('\0')
      || readdirSync(path.join(bundlePath, 'arrays')).sort().join('\0') !== EXPECTED_ARRAY_INVENTORY.join('\0')
      || readdirSync(path.join(bundlePath, 'manifests')).join('\0') !== 'identity-ledger.json') {
    throw new Error('semantic-import bundle inventory is not closed');
  }
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function without(value, ...keys) {
  const clone = { ...value };
  for (const key of keys) delete clone[key];
  return clone;
}

function canonicalText(value) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && !Number.isFinite(value)) throw new Error('canonical value is non-finite');
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalText).join(',')}]`;
  return `{${Object.keys(value).sort().map(
    (key) => `${JSON.stringify(key)}:${canonicalText(value[key])}`,
  ).join(',')}}`;
}

function recomputePlanDigests(plan) {
  const { system, coordinateSeed } = plan;
  const coordinatePayload = coordinateSeed.atoms.map((atom) => ({
    atomIndex: atom.atomIndex,
    atomId: atom.atomId,
    positionNanometer: atom.positionNanometer,
  }));
  const topology = {
    atomIdentity: coordinateSeed.atoms.map((atom) => ({
      atomIndex: atom.atomIndex,
      atomId: atom.atomId,
      moleculeId: atom.moleculeId,
      residueId: atom.residueId,
      element: atom.element,
      species: atom.species,
      phase: atom.phase,
      formalChargeE: atom.formalChargeE,
      modelPointChargeE: atom.modelPointChargeE,
      massDalton: atom.massDalton,
      crystalSite: atom.crystalSite,
      waterSite: atom.waterSite,
    })),
    structuralBonds: coordinateSeed.structuralBonds,
    rigidConstraints: coordinateSeed.rigidConstraints,
  };
  return {
    coordinatePayload: digestValue(coordinatePayload),
    topology: digestValue(topology),
    coordinateConstruction: digestValue(without(coordinateSeed, 'systemDigest', 'seedDigest')),
    system: digestValue(without(system, 'systemDigest')),
    coordinateSeed: digestValue(without(coordinateSeed, 'seedDigest')),
    plan: digestValue({ system, coordinateSeed }),
  };
}

function sameDigestSet(actual, expected) {
  return Object.keys(expected).length === Object.keys(actual).length
    && Object.entries(expected).every(([key, value]) => actual[key] === value);
}

function assertExactArray(actual, expected, label) {
  if (actual.length !== expected.length) throw new Error(`${label} length changed`);
  for (let index = 0; index < actual.length; index += 1) {
    if (!Object.is(actual[index], expected[index])) {
      throw new Error(`${label}[${index}] differs from the locked plan`);
    }
  }
}

function decodeFloat64(bytes, expectedCount, label) {
  if (bytes.length !== expectedCount * 8) throw new Error(`${label} byte length changed`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: expectedCount }, (_, index) => {
    const value = view.getFloat64(index * 8, true);
    if (!Number.isFinite(value) || Object.is(value, -0)) throw new Error(`${label} contains invalid float64`);
    return value;
  });
}

function decodeUint32(bytes, expectedCount, label) {
  if (bytes.length !== expectedCount * 4) throw new Error(`${label} byte length changed`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Array.from({ length: expectedCount }, (_, index) => view.getUint32(index * 4, true));
}

function expectedIdentityLedger(atoms) {
  return atoms.map((atom) => ({
    atomIndex: atom.atomIndex,
    atomId: atom.atomId,
    moleculeId: atom.moleculeId,
    residueId: atom.residueId,
    element: atom.element,
    species: atom.species,
    phase: atom.phase,
    crystalSite: atom.crystalSite,
    waterSite: atom.waterSite,
  }));
}

function assertArtifactBytes(plan, descriptors, artifactBytes) {
  const atoms = plan.coordinateSeed.atoms;
  const flattened = (records, keys) => records.flatMap((record) => keys.map((key) => record[key]));
  const vectors = plan.system.periodicCell.vectorsNanometer;
  const expected = new Map([
    ['cell-vectors', flattened(vectors, ['x', 'y', 'z'])],
    ['positions', atoms.flatMap((atom) => [
      atom.positionNanometer.x,
      atom.positionNanometer.y,
      atom.positionNanometer.z,
    ])],
    ['masses', atoms.map((atom) => atom.massDalton)],
    ['formal-charges', atoms.map((atom) => atom.formalChargeE)],
    ['model-point-charges', atoms.map((atom) => atom.modelPointChargeE)],
    ['species-codes', atoms.map((atom) => SPECIES_CODES[atom.species])],
    ['structural-bond-indices', plan.coordinateSeed.structuralBonds.flatMap(
      (bond) => [bond.atomAIndex, bond.atomBIndex],
    )],
    ['rigid-constraint-indices', plan.coordinateSeed.rigidConstraints.flatMap(
      (constraint) => [constraint.atomAIndex, constraint.atomBIndex],
    )],
    ['rigid-constraint-targets', plan.coordinateSeed.rigidConstraints.map(
      (constraint) => constraint.targetDistanceNanometer,
    )],
  ]);
  for (const descriptor of descriptors.slice(0, -1)) {
    const bytes = artifactBytes.get(descriptor.id);
    const values = descriptor.dtype === 'float64-le'
      ? decodeFloat64(bytes, expected.get(descriptor.id).length, descriptor.id)
      : decodeUint32(bytes, expected.get(descriptor.id).length, descriptor.id);
    assertExactArray(values, expected.get(descriptor.id), descriptor.id);
  }
  const ledgerBytes = artifactBytes.get('identity-ledger');
  const ledger = JSON.parse(ledgerBytes.toString('utf8'));
  const expectedLedger = expectedIdentityLedger(atoms);
  const expectedWire = Buffer.from(`${canonicalText(expectedLedger)}\n`, 'utf8');
  if (!ledgerBytes.equals(expectedWire) || digestValue(ledger) !== digestValue(expectedLedger)) {
    throw new Error('identity ledger does not exactly project the locked plan');
  }
}

function verifyImportBundle(planPath, bundlePath) {
  const fileSnapshots = [];
  const planParentPath = path.dirname(planPath);
  const arraysPath = path.join(bundlePath, 'arrays');
  const manifestsPath = path.join(bundlePath, 'manifests');
  const planParentIdentity = assertCanonicalDirectory(planParentPath, 'plan parent');
  const bundleIdentity = assertCanonicalDirectory(bundlePath, 'bundle', 0o555n);
  const arraysIdentity = assertCanonicalDirectory(arraysPath, 'array directory', 0o555n);
  const manifestsIdentity = assertCanonicalDirectory(manifestsPath, 'manifest directory', 0o555n);
  assertClosedBundleInventory(bundlePath);

  const planBytes = readBoundedRegularFile(planPath, MAX_PLAN_BYTES, 0o444n, fileSnapshots);
  if (planBytes.length !== EXPECTED_PLAN_BYTES || sha256(planBytes) !== EXPECTED_PLAN_RAW_SHA256) {
    throw new Error('plan wire identity changed');
  }
  const plan = assertNaClWaterInterfacePlanV0410(JSON.parse(planBytes.toString('utf8')));
  const recomputed = recomputePlanDigests(plan);
  if (!sameDigestSet(recomputed, EXPECTED_DIGESTS)) {
    throw new Error('JavaScript digest dependency graph changed');
  }

  const receiptPath = path.join(bundlePath, 'semantic-import-receipt.json');
  const receiptBytes = readBoundedRegularFile(
    receiptPath,
    MAX_RECEIPT_BYTES,
    0o444n,
    fileSnapshots,
  );
  const receipt = JSON.parse(receiptBytes.toString('utf8'));
  const receiptSchemaPath = fileURLToPath(
    new URL('../../../schemas/nacl-water-interface-import-receipt.schema.json', import.meta.url),
  );
  const receiptSchema = JSON.parse(
    readBoundedRegularFile(
      receiptSchemaPath,
      MAX_RECEIPT_BYTES,
      null,
      fileSnapshots,
    ).toString('utf8'),
  );
  const validate = new Ajv2020({ strict: true, strictNumbers: true, allErrors: true }).compile(receiptSchema);
  if (!validate(receipt)) throw new Error(`receipt schema failed: ${JSON.stringify(validate.errors)}`);
  if (!receiptBytes.equals(Buffer.from(`${canonicalText(receipt)}\n`, 'utf8'))) {
    throw new Error('receipt wire is not exact canonical JSON plus one LF');
  }
  if (receipt.subject.byteCount !== planBytes.length
      || receipt.subject.rawSha256 !== sha256(planBytes)
      || receipt.subject.canonicalValueSha256 !== digestValue(plan)
      || !sameDigestSet(receipt.digests.expected, EXPECTED_DIGESTS)
      || !sameDigestSet(receipt.digests.recomputed, recomputed)) {
    throw new Error('receipt is not bound to the exact plan and six-level digest graph');
  }

  const importerSourcePath = fileURLToPath(
    new URL('./nacl_water_interface_import_v0411.py', import.meta.url),
  );
  const importerSource = readBoundedRegularFile(
    importerSourcePath,
    2 * 1024 * 1024,
    null,
    fileSnapshots,
  );
  if (receipt.verifier.sourceSha256 !== sha256(importerSource)) {
    throw new Error('receipt importer source digest changed');
  }
  const artifactBytes = new Map();
  for (const descriptor of receipt.normalizedArtifacts.artifacts) {
    const filename = path.join(bundlePath, descriptor.path);
    const bytes = readBoundedRegularFile(filename, MAX_PLAN_BYTES, 0o444n, fileSnapshots);
    if (bytes.length !== descriptor.sizeBytes || sha256(bytes) !== descriptor.sha256) {
      throw new Error(`${descriptor.id} descriptor does not match its bytes`);
    }
    artifactBytes.set(descriptor.id, bytes);
  }
  if (receipt.normalizedArtifacts.semanticRoot
      !== digestValue(receipt.normalizedArtifacts.artifacts)) {
    throw new Error('normalized semantic root is invalid');
  }
  assertArtifactBytes(plan, receipt.normalizedArtifacts.artifacts, artifactBytes);

  const stablePreimage = Object.fromEntries([
    'subject', 'canonicalization', 'verifier', 'digests', 'semanticAudit',
    'normalizedArtifacts', 'prerequisiteGates', 'sourceEvidence', 'execution', 'claims',
  ].map((key) => [key, receipt[key]]));
  if (receipt.stableEvidenceDigest !== digestValue(stablePreimage)
      || receipt.receiptDigest !== digestValue(without(receipt, 'receiptDigest'))) {
    throw new Error('stable-evidence or receipt self digest is invalid');
  }
  const result = Object.freeze({
    schemaVersion: 'tf.nacl-water-interface-import-verification/0.4.11',
    status: 'verified-pass',
    planDigest: EXPECTED_DIGESTS.plan,
    receiptDigest: receipt.receiptDigest,
    semanticRoot: receipt.normalizedArtifacts.semanticRoot,
    openmmImported: false,
    solverInvoked: false,
    promotionEligible: false,
    publicReleaseEligible: false,
  });
  for (const snapshot of fileSnapshots) assertStableRegularFileSnapshot(snapshot);
  assertCanonicalDirectory(planParentPath, 'plan parent', undefined, planParentIdentity);
  assertCanonicalDirectory(bundlePath, 'bundle', 0o555n, bundleIdentity);
  assertCanonicalDirectory(arraysPath, 'array directory', 0o555n, arraysIdentity);
  assertCanonicalDirectory(manifestsPath, 'manifest directory', 0o555n, manifestsIdentity);
  assertClosedBundleInventory(bundlePath);
  return result;
}

export { verifyImportBundle };

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  try {
    process.stdout.write(`${JSON.stringify(verifyImportBundle(
      ...Object.values(parseArguments(process.argv.slice(2))),
    ))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
