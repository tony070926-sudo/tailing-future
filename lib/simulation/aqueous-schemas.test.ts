import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import aqueousActionSchema from '../../schemas/aqueous-action.schema.json' with { type: 'json' };
import aqueousObservationSchema from '../../schemas/aqueous-observation.schema.json' with { type: 'json' };
import aqueousWorldStateSchema from '../../schemas/aqueous-world-state.schema.json' with { type: 'json' };
import { createAqueousContractFixture } from './aqueous-topology.ts';

function validators() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictNumbers: true });
  ajv.addSchema(aqueousActionSchema);
  ajv.addSchema(aqueousWorldStateSchema);
  ajv.addSchema(aqueousObservationSchema);
  const validateAction = ajv.getSchema('https://tailing.future/schemas/aqueous-action/0.4.2');
  const validateWorld = ajv.getSchema('https://tailing.future/schemas/aqueous-world-state/0.4.2');
  const validateObservation = ajv.getSchema('https://tailing.future/schemas/aqueous-observation/0.4.2');
  if (!validateAction || !validateWorld || !validateObservation) throw new Error('aqueous schemas were not registered');
  return { validateAction, validateWorld, validateObservation };
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
  const lower = record.minimum !== undefined || record.exclusiveMinimum !== undefined;
  const upper = record.maximum !== undefined || record.exclusiveMaximum !== undefined;
  const own = numeric && (!lower || !upper) ? [path] : [];
  return Object.entries(record).reduce(
    (paths, [key, child]) => [...paths, ...unboundedNumericSchemaPaths(child, `${path}/${key}`)],
    own,
  );
}

function withoutKey(value: unknown, key: string) {
  const copy = structuredClone(value) as Record<string, unknown>;
  delete copy[key];
  return copy;
}

describe('aqueous v0.4.2 closed schemas', () => {
  it('compiles strictly, closes objects, bounds numbers and requires every envelope field', () => {
    const { validateAction, validateWorld, validateObservation } = validators();
    for (const schema of [aqueousActionSchema, aqueousWorldStateSchema, aqueousObservationSchema]) {
      expect(openObjectSchemaPaths(schema)).toEqual([]);
      expect(unboundedNumericSchemaPaths(schema)).toEqual([]);
    }
    const fixture = createAqueousContractFixture();
    for (const key of aqueousWorldStateSchema.required) expect(validateWorld(withoutKey(fixture.state, key))).toBe(false);
    for (const key of aqueousActionSchema.required) expect(validateAction(withoutKey(fixture.actions[0], key))).toBe(false);
    for (const key of aqueousObservationSchema.required) {
      expect(validateObservation(withoutKey(fixture.observation, key))).toBe(false);
    }
  });

  it('accepts the neutral water plus Na/Cl contract and all five typed actions', () => {
    const { validateAction, validateWorld, validateObservation } = validators();
    const fixture = createAqueousContractFixture();
    expect(validateWorld(fixture.state), JSON.stringify(validateWorld.errors)).toBe(true);
    expect(validateObservation(fixture.observation), JSON.stringify(validateObservation.errors)).toBe(true);
    expect(fixture.actions.every((action) => validateAction(action)), JSON.stringify(validateAction.errors)).toBe(true);
    expect(fixture.topology.atoms.some((atom) => atom.lennardJones.epsilonKjMol === 0)).toBe(true);
    expect(fixture.topology.atoms.find((atom) => atom.identity.siteName === 'H1')?.lennardJones.sigmaAngstrom).toBe(10);
  });

  it('rejects v0.4.1, undeclared fields, invalid periodic positions and forged physics receipts', () => {
    const { validateWorld, validateObservation } = validators();
    const { state, observation } = createAqueousContractFixture();
    const worldMutations = [
      { ...state, schemaVersion: 'tf.aqueous-world-state/0.4.1' },
      { ...state, unexpected: true },
      { ...state, topology: { ...state.topology, schemaVersion: 'tf.aqueous-topology/0.4.1' } },
      { ...state, topology: { ...state.topology, shortRangeNonbonded: { ...state.topology.shortRangeNonbonded, mixingRule: 'geometric' } } },
      { ...state, topology: { ...state.topology, electrostatics: { ...state.topology.electrostatics, neutralityToleranceE: 1e-4 } } },
      { ...state, topology: { ...state.topology, electrostatics: { ...state.topology.electrostatics, electrostaticConstantKjMolAngstromE2: 1 } } },
      { ...state, topology: { ...state.topology, electrostatics: { ...state.topology.electrostatics, maximumRealSpaceWorkUnits: 10_000_001 } } },
      { ...state, topology: { ...state.topology, parameterReceipt: { ...state.topology.parameterReceipt, familyId: 'forged-family' } } },
      { ...state, topology: { ...state.topology, sourcePins: [{ ...state.topology.sourcePins[0], owner: 'ForgedOwner' }] } },
      { ...state, topology: { ...state.topology, sourcePins: [...state.topology.sourcePins, { ...state.topology.sourcePins[0], id: 'extra-source-pin' }] } },
      { ...state, topology: { ...state.topology, atoms: [{ ...state.topology.atoms[0], lennardJones: { ...state.topology.atoms[0].lennardJones, epsilonKjMol: -1 } }, ...state.topology.atoms.slice(1)] } },
      { ...state, periodicCell: { ...state.periodicCell, boundary: { ...state.periodicCell.boundary, x: 'open' } } },
      { ...state, atoms: [{ ...state.atoms[0], position: { ...state.atoms[0].position, wrappedFractional: { ...state.atoms[0].position.wrappedFractional, x: 1 } } }, ...state.atoms.slice(1)] },
      { ...state, atoms: [{ ...state.atoms[0], position: { ...state.atoms[0].position, image: { ...state.atoms[0].position.image, x: 1000000001 } } }, ...state.atoms.slice(1)] },
    ];
    for (const candidate of worldMutations) expect(validateWorld(candidate)).toBe(false);

    const observationMutations = [
      { ...observation, schemaVersion: 'tf.aqueous-observation/0.4.1' },
      { ...observation, energy: { ...observation.energy, untrackedKjMol: 0 } },
      { ...observation, energy: { ...observation.energy, constraintEnergyKjMol: 0 } },
      { ...observation, mechanicalObservables: { ...observation.mechanicalObservables, pressureBar: 1 } },
      { ...observation, uncertainty: { ...observation.uncertainty, epistemic: 0.1 } },
      { ...observation, forceComponentsByAtomId: { ...observation.forceComponentsByAtomId, '非-ascii': observation.forceComponentsByAtomId['water-o'] } },
      { ...observation, thermodynamics: { ...observation.thermodynamics, constraintDegreesOfFreedom: -1 } },
    ];
    for (const candidate of observationMutations) expect(validateObservation(candidate)).toBe(false);
  });

  it('rejects cross-kind action parameters and caller-authored runtime consumption', () => {
    const { validateAction } = validators();
    const { actions } = createAqueousContractFixture();
    const advance = actions[0];
    const mutations = [
      { ...advance, schemaVersion: 'tf.aqueous-action/0.4.1' },
      { ...advance, kind: 'restore' },
      { ...advance, parameters: { ...advance.parameters, forceEvaluations: 2 } },
      { ...advance, parameters: { ...advance.parameters, substeps: 1001 } },
      { ...advance, parameters: { ...advance.parameters, budget: { ...advance.parameters.budget, withinBudget: false } } },
      { ...advance, parameters: { ...advance.parameters, budget: { ...advance.parameters.budget, requestedWorkUnits: 1000001 } } },
      { ...advance, unexpected: true },
    ];
    for (const candidate of mutations) expect(validateAction(candidate)).toBe(false);
  });
});
