import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { digestValue } from '../../../lib/simulation/digest.ts';
import { createNaClWaterInterfacePlanV0410 } from '../../../lib/simulation/nacl-water-interface-system-v0410.ts';
import { exportNaClWaterInterfacePlanV0411 } from './export-nacl-water-interface-plan-v0411.mjs';
import { verifyImportBundle } from './verify-nacl-water-interface-import-v0411.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const IMPORTER = path.join(HERE, 'nacl_water_interface_import_v0411.py');

function without(value, ...keys) {
  const clone = { ...value };
  for (const key of keys) delete clone[key];
  return clone;
}

function coordinateDigest(seed) {
  return digestValue(seed.atoms.map((atom) => ({
    atomIndex: atom.atomIndex,
    atomId: atom.atomId,
    positionNanometer: atom.positionNanometer,
  })));
}

function topologyDigest(seed) {
  return digestValue({
    atomIdentity: seed.atoms.map((atom) => ({
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
    structuralBonds: seed.structuralBonds,
    rigidConstraints: seed.rigidConstraints,
  });
}

function attackerReseal(plan) {
  const coordinatePayload = coordinateDigest(plan.coordinateSeed);
  const topology = topologyDigest(plan.coordinateSeed);
  plan.coordinateSeed.constructionReceipt.coordinatePayloadDigest = coordinatePayload;
  plan.coordinateSeed.constructionReceipt.topologyDigest = topology;
  const coordinateConstruction = digestValue(without(
    plan.coordinateSeed,
    'systemDigest',
    'seedDigest',
  ));
  plan.system.coordinateContract.coordinatePayloadDigest = coordinatePayload;
  plan.system.coordinateContract.topologyDigest = topology;
  plan.system.coordinateContract.coordinateConstructionDigest = coordinateConstruction;
  plan.system.systemDigest = digestValue(without(plan.system, 'systemDigest'));
  plan.coordinateSeed.systemDigest = plan.system.systemDigest;
  plan.coordinateSeed.seedDigest = digestValue(without(plan.coordinateSeed, 'seedDigest'));
  plan.planDigest = digestValue({
    system: plan.system,
    coordinateSeed: plan.coordinateSeed,
  });
  return plan;
}

function writeReadOnly(filename, bytes) {
  writeFileSync(filename, bytes, { flag: 'wx', mode: 0o400 });
  chmodSync(filename, 0o444);
}

function invokeRejected(planPath, outputPath) {
  const result = spawnSync(
    'python3',
    [IMPORTER, '--plan', planPath, '--output', outputPath],
    { encoding: 'utf8' },
  );
  expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(1);
  expect(existsSync(outputPath)).toBe(false);
  return result.stderr;
}

describe('NaCl{100}-water v0.4.11 cross-language semantic import', () => {
  let root;
  let planPath;
  let bundlePath;

  beforeAll(() => {
    root = mkdtempSync(path.join(realpathSync(tmpdir()), 'tf-v0411-cross-language-'));
    planPath = path.join(root, 'plan.json');
    bundlePath = path.join(root, 'bundle');
    exportNaClWaterInterfacePlanV0411(planPath);
    execFileSync(
      'python3',
      [IMPORTER, '--plan', planPath, '--output', bundlePath],
      { encoding: 'utf8' },
    );
  }, 120_000);

  afterAll(() => {
    for (const directory of [
      bundlePath,
      path.join(bundlePath, 'arrays'),
      path.join(bundlePath, 'manifests'),
    ]) {
      try {
        chmodSync(directory, 0o700);
      } catch {
        // A failed setup may not have created every owned test directory.
      }
    }
    rmSync(root, { recursive: true, force: true });
  });

  it('rebinds every Python artifact byte to the exact TypeScript plan', () => {
    expect(verifyImportBundle(planPath, bundlePath)).toMatchObject({
      schemaVersion: 'tf.nacl-water-interface-import-verification/0.4.11',
      status: 'verified-pass',
      planDigest: 'sha256:f6f271d255de31ab655e62b7539b65e58a4e85994870232b675ef7b40f2fd0b8',
      openmmImported: false,
      solverInvoked: false,
      promotionEligible: false,
      publicReleaseEligible: false,
    });
  }, 60_000);

  it('rejects a normalized array mutation even if the file is returned to read-only mode', () => {
    const positionPath = path.join(bundlePath, 'arrays/positions.f64le');
    const original = readFileSync(positionPath);
    const changed = Buffer.from(original);
    changed[0] ^= 1;
    chmodSync(positionPath, 0o600);
    writeFileSync(positionPath, changed);
    chmodSync(positionPath, 0o444);
    try {
      expect(() => verifyImportBundle(planPath, bundlePath)).toThrow(/descriptor/);
    } finally {
      chmodSync(positionPath, 0o600);
      writeFileSync(positionPath, original);
      chmodSync(positionPath, 0o444);
    }
  });

  it('rejects an artifact changed after its individual read', () => {
    const positionPath = path.join(bundlePath, 'arrays/positions.f64le');
    const original = readFileSync(positionPath);
    const changed = Buffer.from(original);
    changed[0] ^= 1;
    const originalReadFileSync = fs.readFileSync;
    let descriptorReads = 0;
    let mutationPerformed = false;
    fs.readFileSync = (...arguments_) => {
      if (typeof arguments_[0] === 'number') {
        descriptorReads += 1;
        if (descriptorReads === 7) {
          chmodSync(positionPath, 0o600);
          writeFileSync(positionPath, changed);
          chmodSync(positionPath, 0o444);
          mutationPerformed = true;
        }
      }
      return originalReadFileSync(...arguments_);
    };
    syncBuiltinESMExports();
    try {
      expect(() => verifyImportBundle(planPath, bundlePath)).toThrow(/changed after verification/);
      expect(mutationPerformed).toBe(true);
    } finally {
      fs.readFileSync = originalReadFileSync;
      syncBuiltinESMExports();
      chmodSync(positionPath, 0o600);
      writeFileSync(positionPath, original);
      chmodSync(positionPath, 0o444);
    }
  });

  it('rejects receipt claim escalation and a non-closed bundle inventory', () => {
    const receiptPath = path.join(bundlePath, 'semantic-import-receipt.json');
    const original = readFileSync(receiptPath);
    const changed = JSON.parse(original);
    changed.execution.solverInvoked = true;
    chmodSync(receiptPath, 0o600);
    writeFileSync(receiptPath, `${JSON.stringify(changed)}\n`);
    chmodSync(receiptPath, 0o444);
    try {
      expect(() => verifyImportBundle(planPath, bundlePath)).toThrow(/schema/);
    } finally {
      chmodSync(receiptPath, 0o600);
      writeFileSync(receiptPath, original);
      chmodSync(receiptPath, 0o444);
    }

    const extra = path.join(bundlePath, 'unexpected');
    chmodSync(bundlePath, 0o700);
    writeReadOnly(extra, Buffer.from('x'));
    chmodSync(bundlePath, 0o555);
    try {
      expect(() => verifyImportBundle(planPath, bundlePath)).toThrow(/inventory/);
    } finally {
      chmodSync(bundlePath, 0o700);
      chmodSync(extra, 0o600);
      rmSync(extra);
      chmodSync(bundlePath, 0o555);
    }
  });

  it('rejects symlinked bundle roots', () => {
    const alias = path.join(root, 'bundle-alias');
    symlinkSync(bundlePath, alias, 'dir');
    expect(() => verifyImportBundle(planPath, alias)).toThrow(/canonical directory/);
  });

  it('rejects attacker-resealed coordinates, gates, swapped digests and duplicate keys', () => {
    const mutations = [
      (plan) => {
        plan.coordinateSeed.atoms[0].positionNanometer.x += 0.01;
        return attackerReseal(plan);
      },
      (plan) => {
        plan.system.prerequisiteGates[0].status = 'satisfied';
        return attackerReseal(plan);
      },
      (plan) => {
        const coordinate = plan.coordinateSeed.constructionReceipt.coordinatePayloadDigest;
        plan.coordinateSeed.constructionReceipt.coordinatePayloadDigest =
          plan.coordinateSeed.constructionReceipt.topologyDigest;
        plan.coordinateSeed.constructionReceipt.topologyDigest = coordinate;
        return plan;
      },
    ];
    for (const [index, mutate] of mutations.entries()) {
      const candidate = mutate(structuredClone(createNaClWaterInterfacePlanV0410()));
      const candidatePath = path.join(root, `malicious-${index}.json`);
      writeReadOnly(candidatePath, Buffer.from(`${JSON.stringify(candidate)}\n`));
      expect(invokeRejected(candidatePath, path.join(root, `rejected-${index}`)))
        .toMatch(/locked exporter artifact/);
    }

    const duplicatePath = path.join(root, 'duplicate-key.json');
    const original = readFileSync(planPath, 'utf8');
    writeReadOnly(
      duplicatePath,
      Buffer.from(`{"planDigest":"${createNaClWaterInterfacePlanV0410().planDigest}",${original.slice(1)}`),
    );
    expect(invokeRejected(duplicatePath, path.join(root, 'duplicate-rejected')))
      .toMatch(/duplicate JSON key/);
  }, 60_000);

  it('refuses an existing output without changing its sentinel', () => {
    const existing = path.join(root, 'existing');
    writeReadOnly(existing, Buffer.from('preserve'));
    const result = spawnSync(
      'python3',
      [IMPORTER, '--plan', planPath, '--output', existing],
      { encoding: 'utf8' },
    );
    expect(result.status).toBe(1);
    expect(readFileSync(existing, 'utf8')).toBe('preserve');
  }, 60_000);
});
