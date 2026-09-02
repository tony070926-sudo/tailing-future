import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { validateComparatorEvidenceRegistry } from './comparator-evidence-policy.mjs';

const registry = JSON.parse(await readFile(new URL('../evaluation/baselines/registry.json', import.meta.url), 'utf8'));
const frozenNow = new Date('2026-09-02T12:00:00.000Z');

describe('comparator evidence registry policy', () => {
  it('accepts the checked-in non-promoted comparator registry', async () => {
    await expect(validateComparatorEvidenceRegistry(registry, { now: frozenNow })).resolves.toEqual([]);
  });

  it('rejects a digest-shaped reproduced claim with no receipt', async () => {
    const forged = structuredClone(registry);
    const comparator = forged.comparators.find((entry) => entry.id === 'mattersim-1.0.0-5m');
    Object.assign(comparator, {
      evidenceClass: 'reproduced',
      comparable: true,
      runnerDigest: `sha256:${'a'.repeat(64)}`,
      receiptPath: 'evaluation/atomistic/receipts/forged.json',
    });
    const failures = await validateComparatorEvidenceRegistry(forged, { now: frozenNow });
    expect(failures.join('\n')).toMatch(/mattersim-1\.0\.0-5m.*receipt load failed/);
  });

  it('rejects duplicate comparator identities', async () => {
    const duplicated = structuredClone(registry);
    duplicated.comparators.push(structuredClone(duplicated.comparators[0]));
    expect((await validateComparatorEvidenceRegistry(duplicated, { now: frozenNow })).join('\n')).toMatch(/duplicate comparator ID/);
  });

  it('rejects empty, missing, future-dated and Unicode-lookalike comparator sets', async () => {
    const empty = { ...structuredClone(registry), comparators: [] };
    expect((await validateComparatorEvidenceRegistry(empty, { now: frozenNow })).join('\n')).toMatch(/aido-cell-1\.0: required comparator is missing/);

    const missing = structuredClone(registry);
    missing.comparators = missing.comparators.filter((entry) => entry.id !== 'aido-cell-1.0');
    expect((await validateComparatorEvidenceRegistry(missing, { now: frozenNow })).join('\n')).toMatch(/aido-cell-1\.0: required comparator is missing/);

    const future = { ...structuredClone(registry), snapshotDate: '2026-09-03' };
    expect((await validateComparatorEvidenceRegistry(future, { now: frozenNow })).join('\n')).toMatch(/in the future/);

    const lookalike = structuredClone(registry);
    lookalike.comparators[0].id = 'aido-ce\u043Bl-1.0';
    const failures = (await validateComparatorEvidenceRegistry(lookalike, { now: frozenNow })).join('\n');
    expect(failures).toMatch(/lowercase ASCII/);
    expect(failures).toMatch(/aido-cell-1\.0: required comparator is missing/);
  });
});
