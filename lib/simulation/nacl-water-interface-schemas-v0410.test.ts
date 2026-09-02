import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import interfaceActionSchema from '../../schemas/nacl-water-interface-action.schema.json' with { type: 'json' };
import interfaceCoordinateSeedSchema from '../../schemas/nacl-water-interface-coordinate-seed.schema.json' with { type: 'json' };
import interfaceObservationSchema from '../../schemas/nacl-water-interface-observation.schema.json' with { type: 'json' };
import interfacePlanSchema from '../../schemas/nacl-water-interface-plan.schema.json' with { type: 'json' };
import interfaceSystemSchema from '../../schemas/nacl-water-interface-system.schema.json' with { type: 'json' };
import { createOpenMmTip3pControlPlanV044 } from './aqueous-system-spec.ts';
import {
  assertNaClWaterInterfacePlanV0410,
  createNaClWaterInterfaceActionV0410,
  createNaClWaterInterfacePlanV0410,
  observeNaClWaterInterfaceActionV0410,
} from './nacl-water-interface-system-v0410.ts';

function validators() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictNumbers: true });
  ajv.addSchema(interfaceSystemSchema);
  ajv.addSchema(interfaceCoordinateSeedSchema);
  ajv.addSchema(interfacePlanSchema);
  ajv.addSchema(interfaceActionSchema);
  ajv.addSchema(interfaceObservationSchema);
  const validateSystem = ajv.getSchema(
    'https://tailing.future/schemas/nacl-water-interface-system/0.4.10',
  );
  const validateAction = ajv.getSchema(
    'https://tailing.future/schemas/nacl-water-interface-action/0.4.10',
  );
  const validateObservation = ajv.getSchema(
    'https://tailing.future/schemas/nacl-water-interface-observation/0.4.10',
  );
  const validateCoordinateSeed = ajv.getSchema(
    'https://tailing.future/schemas/nacl-water-interface-coordinate-seed/0.4.10',
  );
  const validatePlan = ajv.getSchema(
    'https://tailing.future/schemas/nacl-water-interface-plan/0.4.10',
  );
  if (!validateSystem || !validateCoordinateSeed || !validatePlan
    || !validateAction || !validateObservation) {
    throw new Error('NaCl-water interface v0.4.10 schemas were not registered');
  }
  return {
    validateSystem,
    validateCoordinateSeed,
    validatePlan,
    validateAction,
    validateObservation,
  };
}

describe('NaCl{100}-water interface v0.4.10 closed schemas', () => {
  const plan = createNaClWaterInterfacePlanV0410();

  it('compiles standalone in strict Draft 2020-12 and closes every typed object and container', () => {
    validators();
    for (const schema of [
      interfaceSystemSchema,
      interfaceCoordinateSeedSchema,
      interfacePlanSchema,
      interfaceActionSchema,
      interfaceObservationSchema,
    ]) {
      expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(openObjectSchemaPaths(schema)).toEqual([]);
      expect(unboundedNumericSchemaPaths(schema)).toEqual([]);
      expect(unboundedArraySchemaPaths(schema)).toEqual([]);
    }
  });

  it('accepts the exact locked system and all three deterministic action decisions', () => {
    const {
      validateSystem,
      validateCoordinateSeed,
      validatePlan,
      validateAction,
      validateObservation,
    } = validators();
    expect(validateSystem(plan.system), JSON.stringify(validateSystem.errors)).toBe(true);
    expect(
      validateCoordinateSeed(plan.coordinateSeed),
      JSON.stringify(validateCoordinateSeed.errors),
    ).toBe(true);
    expect(validatePlan(plan), JSON.stringify(validatePlan.errors)).toBe(true);
    for (const [index, kind] of [
      'inspect-coordinate-seed',
      'request-interface-preparation',
      'request-mobile-interface-dynamics',
    ].entries()) {
      const action = createNaClWaterInterfaceActionV0410(
        kind as Parameters<typeof createNaClWaterInterfaceActionV0410>[0],
        `schema-action-${index}`,
        plan,
      );
      const observation = observeNaClWaterInterfaceActionV0410(action, plan);
      expect(validateAction(action), JSON.stringify(validateAction.errors)).toBe(true);
      expect(validateObservation(observation), JSON.stringify(validateObservation.errors)).toBe(true);
    }
  });

  it('rejects identity, source, composition, gate, claim and digest substitutions', () => {
    const { validateSystem } = validators();
    const mutations: Array<(system: Record<string, unknown>) => void> = [
      (system) => { system.status = 'executed'; },
      (system) => {
        ((system.composition as Record<string, unknown>).particleCount as number) += 1;
      },
      (system) => {
        ((system.crystalConstruction as Record<string, unknown>).latticeConstantNanometer as number)
          += 0.00001;
      },
      (system) => {
        ((system.sourcePins as Array<Record<string, unknown>>)[0]).sha256 = `sha256:${'0'.repeat(64)}`;
      },
      (system) => {
        (system.prerequisiteGates as Array<Record<string, unknown>>).pop();
      },
      (system) => {
        (system.claimBoundaries as Record<string, unknown>).interfaceDynamicsSimulated = true;
      },
      (system) => { system.unexpected = true; },
    ];
    for (const mutate of mutations) {
      const candidate = structuredClone(plan.system) as unknown as Record<string, unknown>;
      mutate(candidate);
      expect(validateSystem(candidate)).toBe(false);
    }
    expect(validateSystem(createOpenMmTip3pControlPlanV044().system)).toBe(false);
  });

  it('bounds the full 6,336-site payload and rejects truncated or malformed topology', () => {
    const { validateCoordinateSeed, validatePlan } = validators();
    const mutations: Array<(seed: Record<string, unknown>) => void> = [
      (seed) => { (seed.atoms as unknown[]).pop(); },
      (seed) => {
        ((seed.atoms as Array<Record<string, unknown>>)[0]).atomIndex = 6336;
      },
      (seed) => {
        const position = ((seed.atoms as Array<Record<string, unknown>>)[0])
          .positionNanometer as Record<string, unknown>;
        position.x = 3.38412;
      },
      (seed) => {
        ((seed.atoms as Array<Record<string, unknown>>)[0]).modelPointChargeE = 0.25;
      },
      (seed) => { (seed.structuralBonds as unknown[]).pop(); },
      (seed) => { (seed.rigidConstraints as unknown[]).pop(); },
      (seed) => {
        (seed.constructionReceipt as Record<string, unknown>).atomCount = 6335;
      },
      (seed) => { seed.unexpected = true; },
    ];
    for (const mutate of mutations) {
      const candidate = structuredClone(plan.coordinateSeed) as unknown as Record<string, unknown>;
      mutate(candidate);
      expect(validateCoordinateSeed(candidate)).toBe(false);
    }

    const wrongPlan = structuredClone(plan) as unknown as Record<string, unknown>;
    wrongPlan.planDigest = `sha256:${'0'.repeat(64)}`;
    expect(validatePlan(wrongPlan)).toBe(false);
    const truncatedPlan = structuredClone(plan) as unknown as Record<string, unknown>;
    delete truncatedPlan.coordinateSeed;
    expect(validatePlan(truncatedPlan)).toBe(false);
  });

  it('treats JSON Schema as a structural prefilter and leaves semantic digest binding to the exact validator', () => {
    const { validatePlan } = validators();
    const structurallyValidButSemanticallyForged = structuredClone(plan) as unknown as Record<string, unknown>;
    const atoms = ((structurallyValidButSemanticallyForged.coordinateSeed as Record<string, unknown>)
      .atoms as Array<Record<string, unknown>>);
    const firstPosition = atoms[0].positionNanometer as Record<string, number>;
    firstPosition.x += 0.00001;
    atoms[0].species = 'TIP3P-H';
    atoms[1].atomIndex = 0;

    expect(validatePlan(structurallyValidButSemanticallyForged)).toBe(true);
    expect(() => assertNaClWaterInterfacePlanV0410(
      structurallyValidButSemanticallyForged,
    )).toThrow(/self digest is invalid/);
  });

  it('rejects malformed bindings, unlisted actions and forged solver/evidence observations', () => {
    const { validateAction, validateObservation } = validators();
    const action = createNaClWaterInterfaceActionV0410(
      'request-mobile-interface-dynamics',
      'schema-negative',
      plan,
    );
    const observation = observeNaClWaterInterfaceActionV0410(action, plan);

    for (const candidate of [
      { ...action, parentSystemDigest: `sha256:${'0'.repeat(64)}` },
      { ...action, requestedSeedDigest: `sha256:${'0'.repeat(64)}` },
      { ...action, kind: 'advance' },
      { ...action, extra: true },
      withoutKey(action, 'actionDigest'),
    ]) expect(validateAction(candidate)).toBe(false);

    for (const candidate of [
      { ...observation, solverInvoked: true },
      { ...observation, stateMutationPerformed: true },
      { ...observation, outcome: 'accepted-read-only-inspection' },
      { ...observation, unmetGateIds: [] },
      { ...observation, unavailableEvidence: ['interface-dynamics'] },
      { ...observation, extra: true },
      withoutKey(observation, 'observationDigest'),
    ]) expect(validateObservation(candidate)).toBe(false);
  });
});

function withoutKey<T extends object>(value: T, key: string) {
  const copy = { ...value } as Record<string, unknown>;
  delete copy[key];
  return copy;
}

function openObjectSchemaPaths(value: unknown, path = '#'): string[] {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const own = record.type === 'object' && record.additionalProperties !== false ? [path] : [];
  return Object.entries(record).reduce(
    (paths, [key, child]) => [...paths, ...openObjectSchemaPaths(child, `${path}/${key}`)],
    own,
  );
}

function unboundedNumericSchemaPaths(value: unknown, path = '#'): string[] {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const numeric = record.type === 'number' || record.type === 'integer';
  const hasLower = record.minimum !== undefined || record.exclusiveMinimum !== undefined
    || record.const !== undefined;
  const hasUpper = record.maximum !== undefined || record.exclusiveMaximum !== undefined
    || record.const !== undefined;
  const own = numeric && (!hasLower || !hasUpper) ? [path] : [];
  return Object.entries(record).reduce(
    (paths, [key, child]) => [...paths, ...unboundedNumericSchemaPaths(child, `${path}/${key}`)],
    own,
  );
}

function unboundedArraySchemaPaths(value: unknown, path = '#'): string[] {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const own = record.type === 'array'
    && record.const === undefined
    && (record.minItems === undefined || record.maxItems === undefined)
    ? [path]
    : [];
  return Object.entries(record).reduce(
    (paths, [key, child]) => [...paths, ...unboundedArraySchemaPaths(child, `${path}/${key}`)],
    own,
  );
}
