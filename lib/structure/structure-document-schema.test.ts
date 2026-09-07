import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import structureSchema from '../../schemas/structure-document.schema.json' with { type: 'json' };
import { createDefaultStructureDraft, finalizeStructureDocument } from './structure-document';

describe('tf.structure-document/0.1 closed additive schema', () => {
  it('compiles in strict Draft 2020-12 and accepts the runtime-produced document', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true, strictNumbers: true });
    const validate = ajv.compile(structureSchema);
    const document = finalizeStructureDocument(createDefaultStructureDraft());
    expect(validate(document), JSON.stringify(validate.errors)).toBe(true);
    expect(structureSchema.$id).toBe('https://tailing.future/schemas/structure-document/0.1');
  });

  it('matches runtime Unicode code-point bounds for astral strings', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true, strictNumbers: true });
    const validate = ajv.compile(structureSchema);
    const exactDraft = createDefaultStructureDraft();
    exactDraft.title = '🧪'.repeat(160);
    const exact = finalizeStructureDocument(exactDraft);
    expect(validate(exact), JSON.stringify(validate.errors)).toBe(true);

    const overflow = structuredClone(exact) as { title: string };
    overflow.title += '🧪';
    expect(validate(overflow)).toBe(false);
  });

  it('closes every object and bounds every array and numeric schema', () => {
    expect(findOpenObjects(structureSchema)).toEqual([]);
    expect(findUnboundedArrays(structureSchema)).toEqual([]);
    expect(findUnboundedNumbers(structureSchema)).toEqual([]);
  });

  it('rejects unknown fields and topology/PBC mismatches', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true, strictNumbers: true });
    const validate = ajv.compile(structureSchema);
    const document = structuredClone(finalizeStructureDocument(createDefaultStructureDraft())) as Record<string, unknown>;
    document.unexpected = true;
    expect(validate(document)).toBe(false);
    const mismatch = structuredClone(finalizeStructureDocument(createDefaultStructureDraft())) as unknown as {
      boundary: { periodicAxes: boolean[] };
    };
    mismatch.boundary.periodicAxes = [true, false, false];
    expect(validate(mismatch)).toBe(false);
  });
});

function findOpenObjects(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((entry, index) => findOpenObjects(entry, `${path}[${index}]`));
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const own = record.type === 'object' && record.additionalProperties !== false ? [path] : [];
  return own.concat(Object.entries(record).flatMap(([key, entry]) => findOpenObjects(entry, `${path}.${key}`)));
}

function findUnboundedArrays(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((entry, index) => findUnboundedArrays(entry, `${path}[${index}]`));
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const own = record.type === 'array'
    && (typeof record.maxItems !== 'number' || typeof record.minItems !== 'number') ? [path] : [];
  return own.concat(Object.entries(record).flatMap(([key, entry]) => findUnboundedArrays(entry, `${path}.${key}`)));
}

function findUnboundedNumbers(value: unknown, path = '$'): string[] {
  if (Array.isArray(value)) return value.flatMap((entry, index) => findUnboundedNumbers(entry, `${path}[${index}]`));
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const numeric = record.type === 'number' || record.type === 'integer';
  const own = numeric && (typeof record.minimum !== 'number' || typeof record.maximum !== 'number') ? [path] : [];
  return own.concat(Object.entries(record).flatMap(([key, entry]) => findUnboundedNumbers(entry, `${path}.${key}`)));
}
