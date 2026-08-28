import { loadComparatorReceipt } from './atomistic/receipt-policy.mjs';

export const REQUIRED_COMPARATOR_IDS = Object.freeze([
  'aido-cell-1.0',
  'equiformerv3-dens-oam',
  'tece-oam-rra-1.0',
  'mattersim-1.0.0-5m',
  'mace-mpa-0',
  'pfhub-benchmark-3',
  'cantera-3.2-cstr',
  'idaes-2.12',
]);

/**
 * Validate every registry promotion through the receipt policy. Entries below
 * reproduced are intentionally non-applicable; a reproduced entry must load a
 * full receipt and satisfy the independent trusted-promotion context supplied
 * by the caller. Omitting that out-of-band context therefore fails closed.
 */
export async function validateComparatorEvidenceRegistry(registry, options = {}) {
  const errors = [];
  if (registry?.schemaVersion !== 'tf.comparators/0.2' || !Array.isArray(registry?.comparators)) {
    return ['Comparator registry is missing or has an unsupported schema.'];
  }
  const now = options.now instanceof Date ? options.now : new Date(options.now ?? Date.now());
  const snapshotMatch = /^(20[0-9]{2})-([0-9]{2})-([0-9]{2})$/.exec(registry.snapshotDate ?? '');
  const snapshot = snapshotMatch ? new Date(`${registry.snapshotDate}T00:00:00.000Z`) : null;
  if (!Number.isFinite(now.getTime()) || !snapshot || !Number.isFinite(snapshot.getTime()) || snapshot.toISOString().slice(0, 10) !== registry.snapshotDate) {
    errors.push('Comparator registry snapshotDate is invalid.');
  } else {
    const currentUtcDay = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const ageDays = Math.floor((currentUtcDay - snapshot.getTime()) / 86_400_000);
    if (ageDays < 0) errors.push('Comparator registry snapshotDate is in the future.');
    if (ageDays > 45) errors.push(`Comparator registry snapshot is ${ageDays} days old; maximum is 45.`);
  }
  const seen = new Set();
  for (const comparator of registry.comparators) {
    const id = typeof comparator?.id === 'string' && comparator.id ? comparator.id : 'unknown comparator';
    if (!/^[a-z0-9][a-z0-9.-]*$/.test(id)) errors.push(`${id}: comparator ID must be lowercase ASCII.`);
    if (seen.has(id)) errors.push(`${id}: duplicate comparator ID.`);
    seen.add(id);
    const validation = await loadComparatorReceipt(comparator, options);
    if (!validation.ok) {
      const details = validation.errors.length ? validation.errors.join('; ') : 'unknown receipt-policy failure';
      errors.push(`${id}: reproduced promotion rejected (${details}).`);
    }
  }
  for (const id of REQUIRED_COMPARATOR_IDS) if (!seen.has(id)) errors.push(`${id}: required comparator is missing.`);
  return errors;
}
