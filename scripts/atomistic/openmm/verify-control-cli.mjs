#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import {
  chmodSync,
  closeSync,
  constants as fsConstants,
  fsyncSync,
  linkSync,
  openSync,
  readFileSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { canonicalJson } from '../runtime-input-contract.mjs';
import {
  OPENMM_TIP3P_EXPECTED_PLAN_DIGEST,
  OPENMM_TIP3P_EXPECTED_SYSTEM_DIGEST,
  computeOpenMmTip3pVerifierDigest,
  verifyOpenMmTip3pArtifactDirectory,
} from './verify-control.mjs';

const SOURCE_REVISION = /^(?!0{40}$)[0-9a-f]{40}$/;

function parseArguments(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 2) {
    const key = argv[index];
    const value = argv[index + 1];
    if (!['--artifact-root', '--output', '--expected-source-revision'].includes(key)
        || typeof value !== 'string' || value.length === 0 || values.has(key)) {
      throw new Error('usage: verify-control-cli.mjs --artifact-root ABS --output ABS --expected-source-revision GIT_SHA');
    }
    values.set(key, value);
  }
  if (values.size !== 3 || argv.length !== 6) {
    throw new Error('all three verifier arguments are required exactly once');
  }
  const artifactRoot = normalizedAbsolute(values.get('--artifact-root'), 'artifact root');
  const output = normalizedAbsolute(values.get('--output'), 'receipt output');
  const expectedSourceRevision = values.get('--expected-source-revision');
  if (!SOURCE_REVISION.test(expectedSourceRevision)) {
    throw new Error('expected source revision must be a nonzero lowercase Git commit ID');
  }
  if (output === artifactRoot || output.startsWith(`${artifactRoot}${path.sep}`)) {
    throw new Error('independent receipt output must remain outside the producer artifact root');
  }
  return { artifactRoot, output, expectedSourceRevision };
}

function normalizedAbsolute(value, label) {
  if (!path.isAbsolute(value) || path.normalize(value) !== value) {
    throw new Error(`${label} must be a normalized absolute path`);
  }
  return value;
}

function validateReceipt(receipt) {
  const schemaPath = fileURLToPath(new URL(
    '../../../schemas/openmm-tip3p-control-receipt.schema.json', import.meta.url,
  ));
  const schema = JSON.parse(readFileSync(schemaPath, 'utf8'));
  const validate = new Ajv2020({ allErrors: true, strict: true }).compile(schema);
  if (!validate(receipt)) {
    throw new Error(`independent receipt failed its schema: ${JSON.stringify(validate.errors)}`);
  }
}

function writeNewAtomicReceipt(output, receipt) {
  const parent = path.dirname(output);
  if (realpathSync(parent) !== parent) throw new Error('receipt output parent must be canonical');
  const temporary = path.join(parent, `.${path.basename(output)}.${randomUUID()}.tmp`);
  const descriptor = openSync(temporary, fsConstants.O_CREAT | fsConstants.O_EXCL
    | fsConstants.O_WRONLY | fsConstants.O_NOFOLLOW, 0o600);
  try {
    writeFileSync(descriptor, `${canonicalJson(receipt)}\n`, { encoding: 'ascii' });
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    chmodSync(temporary, 0o444);
    linkSync(temporary, output);
    const directoryDescriptor = openSync(parent, fsConstants.O_RDONLY | fsConstants.O_DIRECTORY);
    try {
      fsyncSync(directoryDescriptor);
    } finally {
      closeSync(directoryDescriptor);
    }
  } finally {
    unlinkSync(temporary);
  }
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const verifierDigest = computeOpenMmTip3pVerifierDigest();
  const receipt = await verifyOpenMmTip3pArtifactDirectory({
    root: options.artifactRoot,
    expectedSystemDigest: OPENMM_TIP3P_EXPECTED_SYSTEM_DIGEST,
    expectedPlanDigest: OPENMM_TIP3P_EXPECTED_PLAN_DIGEST,
    expectedSourceRevision: options.expectedSourceRevision,
    verifierDigest,
  });
  validateReceipt(receipt);
  writeNewAtomicReceipt(options.output, receipt);
  process.stdout.write(`${canonicalJson({
    output: options.output,
    receiptDigest: receipt.receiptDigest,
    status: receipt.status,
    verifierDigest,
  })}\n`);
}

await main();
