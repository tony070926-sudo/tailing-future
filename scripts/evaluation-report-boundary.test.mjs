import { readFileSync } from 'node:fs';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';

const schema = JSON.parse(readFileSync('schemas/evaluation-report.schema.json', 'utf8'));
const report = JSON.parse(readFileSync('evaluation/latest-report.json', 'utf8'));
const validate = new Ajv2020({
  allErrors: true,
  allowUnionTypes: true,
  validateFormats: false,
}).compile(schema);

function mutated(change) {
  const candidate = structuredClone(report);
  change(candidate.verification.aqueousFoundation);
  return candidate;
}

describe('aqueous foundation evaluation-report boundary', () => {
  it('accepts the generated foundation-only report', () => {
    expect(report.verification.aqueousFoundation).not.toBeNull();
    expect(validate(report), JSON.stringify(validate.errors)).toBe(true);
  });

  it('requires direct v0.4.4 execution-plan and v0.4.10 interface-contract evidence', () => {
    const keys = [
      'aqueousSystemSpec',
      'aqueousForceBackends',
      'aqueousControlPlanSemantics',
      'naclWaterInterfaceContract',
      'naclWaterInterfaceImportContract',
    ];
    for (const key of keys) expect(report.verification.schemas[key], key).toBe(true);
    for (const key of keys) {
      const candidate = structuredClone(report);
      delete candidate.verification.schemas[key];
      expect(validate(candidate), key).toBe(false);
    }
  });

  it('rejects promotion, reproduction, missing-digest and failed-gate drift', () => {
    const candidates = [
      mutated((aqueous) => { aqueous.boundaries.scorePromotionEligible = true; }),
      mutated((aqueous) => { aqueous.boundaries.openmmExecution = true; }),
      mutated((aqueous) => { aqueous.status = 'locally-reproduced'; }),
      mutated((aqueous) => { delete aqueous.verificationDigest; }),
      mutated((aqueous) => { aqueous.gates.naclRocksaltMadelung = false; }),
      mutated((aqueous) => {
        aqueous.boundaries.statements[0] = 'OpenMM PME reproduced a NaCl-water trajectory.';
      }),
    ];
    for (const candidate of candidates) expect(validate(candidate)).toBe(false);
  });

  it('rejects immutable OpenMM source-pin drift', () => {
    const candidate = mutated((aqueous) => {
      aqueous.sourcePins.openmmTip3p.assets[1].sha256 = `sha256:${'0'.repeat(64)}`;
    });
    expect(validate(candidate)).toBe(false);
  });
});
