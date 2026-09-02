import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import contractActionSchema from '../../schemas/aqueous-action.schema.json' with { type: 'json' };
import contractObservationSchema from '../../schemas/aqueous-observation.schema.json' with { type: 'json' };
import contractWorldStateSchema from '../../schemas/aqueous-world-state.schema.json' with { type: 'json' };
import dynamicsActionSchema from '../../schemas/aqueous-dynamics-action.schema.json' with { type: 'json' };
import dynamicsObservationSchema from '../../schemas/aqueous-dynamics-observation.schema.json' with { type: 'json' };
import dynamicsWorldStateSchema from '../../schemas/aqueous-dynamics-world-state.schema.json' with { type: 'json' };
import { createNaClTip3pFiniteSizeCalibrationWorldV042 } from './aqueous-dynamics-world.ts';
import { createAqueousContractFixture } from './aqueous-topology.ts';

const FIXED_ATOM_IDS = [
  'chloride-cl',
  'sodium-na',
  'water-a-h1',
  'water-a-h2',
  'water-a-o',
  'water-b-h1',
  'water-b-h2',
  'water-b-o',
] as const;

function validators() {
  const compileStandalone = (schema: object) =>
    new Ajv2020({ allErrors: true, strict: true, strictNumbers: true }).compile(schema);
  return {
    validateAction: compileStandalone(dynamicsActionSchema),
    validateWorld: compileStandalone(dynamicsWorldStateSchema),
    validateObservation: compileStandalone(dynamicsObservationSchema),
  };
}

function openObjectSchemaPaths(value: unknown, path = '#'): string[] {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const applicatorOverlay = /\/(?:allOf\/\d+|if|then|else)(?:\/|$)/u.test(path);
  const own =
    record.type === 'object' && record.additionalProperties !== false && !applicatorOverlay
      ? [path]
      : [];
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

function unboundedArraySchemaPaths(value: unknown, path = '#'): string[] {
  if (!value || typeof value !== 'object') return [];
  const record = value as Record<string, unknown>;
  const own = record.type === 'array' && record.maxItems === undefined ? [path] : [];
  return Object.entries(record).reduce(
    (paths, [key, child]) => [...paths, ...unboundedArraySchemaPaths(child, `${path}/${key}`)],
    own,
  );
}

function withoutKey(value: unknown, key: string) {
  const copy = structuredClone(value) as Record<string, unknown>;
  delete copy[key];
  return copy;
}

function mutateAtPath(
  value: unknown,
  path: ReadonlyArray<string>,
  mutation: (current: unknown) => unknown,
) {
  type Container = Record<string, unknown> | unknown[];
  const copy = structuredClone(value) as Container;
  let cursor = copy;
  const read = (container: Container, key: string) => {
    if (Array.isArray(container)) {
      if (!/^\d+$/u.test(key)) throw new Error(`test mutation path is not an array index at ${key}`);
      return container[Number(key)];
    }
    return container[key];
  };
  for (const key of path.slice(0, -1)) {
    const child = read(cursor, key);
    if (!child || typeof child !== 'object') {
      throw new Error(`test mutation path is not a container at ${key}`);
    }
    cursor = child as Container;
  }
  const leaf = path.at(-1);
  if (!leaf) throw new Error('test mutation path cannot be empty');
  if (Array.isArray(cursor)) {
    if (!/^\d+$/u.test(leaf)) throw new Error(`test mutation leaf is not an array index at ${leaf}`);
    const index = Number(leaf);
    cursor[index] = mutation(cursor[index]);
  } else {
    cursor[leaf] = mutation(cursor[leaf]);
  }
  return copy;
}

function rejectAll(validate: (value: unknown) => boolean, candidates: ReadonlyArray<unknown>) {
  for (const candidate of candidates) expect(validate(candidate)).toBe(false);
}

describe('v0.4.2 solver-driven aqueous dynamics schemas', () => {
  it('uses distinct IDs, compiles each public schema standalone, closes objects and bounds values', () => {
    validators();
    expect(dynamicsActionSchema.$id).not.toBe(contractActionSchema.$id);
    expect(dynamicsWorldStateSchema.$id).not.toBe(contractWorldStateSchema.$id);
    expect(dynamicsObservationSchema.$id).not.toBe(contractObservationSchema.$id);

    for (const schema of [
      dynamicsActionSchema,
      dynamicsWorldStateSchema,
      dynamicsObservationSchema,
    ]) {
      expect(openObjectSchemaPaths(schema)).toEqual([]);
      expect(unboundedNumericSchemaPaths(schema)).toEqual([]);
      expect(unboundedArraySchemaPaths(schema)).toEqual([]);
      expect(JSON.stringify(schema)).not.toContain('"$ref":"https://');
    }
  });

  it('accepts the exact advance request plus initial and one-step state and observation payloads', () => {
    const { validateAction, validateWorld, validateObservation } = validators();
    const world = createNaClTip3pFiniteSizeCalibrationWorldV042();
    const initialState = world.serialize();
    const initialObservation = world.observe();
    const oneStepObservation = world.advance({ kind: 'advance', substeps: 1 });
    const oneStepState = world.serialize();

    expect(validateAction({ kind: 'advance', substeps: 1 }), JSON.stringify(validateAction.errors))
      .toBe(true);
    expect(validateWorld(initialState), JSON.stringify(validateWorld.errors)).toBe(true);
    expect(validateObservation(initialObservation), JSON.stringify(validateObservation.errors))
      .toBe(true);
    expect(validateWorld(oneStepState), JSON.stringify(validateWorld.errors)).toBe(true);
    expect(validateObservation(oneStepObservation), JSON.stringify(validateObservation.errors))
      .toBe(true);
    expect(oneStepState.lastIntegrationReceipt?.initialEvaluation
      .constraintJacobianRankReceipt.workUnitsConsumed).toBe(651);
    expect(oneStepState.lastIntegrationReceipt?.workReceipt
      .composerEndpointRankAuditWorkUnits).toBe(1_302);

    const topology = initialState.configuration.topology;
    expect(topology.atoms.map(({ id }) => id)).toEqual(FIXED_ATOM_IDS);
    expect(topology.molecules).toHaveLength(4);
    expect(topology.molecules.filter(({ kind }) => kind === 'rigid-tip3p-water')).toHaveLength(2);
    expect(topology.molecules.filter(({ kind }) => kind === 'monatomic-ion')).toHaveLength(2);
    expect(topology.residues).toHaveLength(4);
    expect(topology.constraints).toHaveLength(6);
    expect(topology.nonbondedExceptions).toHaveLength(6);
    expect(
      topology.nonbondedExceptions.every(
        ({ coulomb, lennardJones }) =>
          coulomb.mode === 'exclude' && lennardJones.mode === 'exclude',
      ),
    ).toBe(true);
    expect(initialObservation.atoms.map(({ id }) => id)).toEqual(FIXED_ATOM_IDS);
    expect(initialObservation.forceField.atomOrder).toEqual(FIXED_ATOM_IDS);
    expect(initialObservation.forceField.atoms.map(({ id }) => id)).toEqual(FIXED_ATOM_IDS);
    expect(Object.keys(initialObservation.forceField.forceByAtomIdKjMolAngstrom)).toEqual(
      FIXED_ATOM_IDS,
    );
    expect(initialObservation.forceField.nonbondedExceptionScales).toHaveLength(6);
    expect(
      initialObservation.forceField.nonbondedExceptionScales.every(
        ({ coulombScale, lennardJonesScale }) =>
          coulombScale === 0 && lennardJonesScale === 0,
      ),
    ).toBe(true);
    expect(initialObservation.forceField.lennardJonesInteractions).toHaveLength(28);
    expect(
      new Set(initialObservation.forceField.lennardJonesInteractions.map(({ id }) => id)).size,
    ).toBe(28);
  });

  it('requires every top-level field in all three dynamic envelopes', () => {
    const { validateAction, validateWorld, validateObservation } = validators();
    const world = createNaClTip3pFiniteSizeCalibrationWorldV042();
    const state = world.serialize();
    const observation = world.observe();
    const action = { kind: 'advance', substeps: 1 };

    for (const key of dynamicsActionSchema.required) {
      expect(validateAction(withoutKey(action, key))).toBe(false);
    }
    for (const key of dynamicsWorldStateSchema.required) {
      expect(validateWorld(withoutKey(state, key))).toBe(false);
    }
    for (const key of dynamicsObservationSchema.required) {
      expect(validateObservation(withoutKey(observation, key))).toBe(false);
    }
  });

  it('rejects contract-only payloads, extra keys and non-finite numbers', () => {
    const { validateAction, validateWorld, validateObservation } = validators();
    const contract = createAqueousContractFixture();
    const world = createNaClTip3pFiniteSizeCalibrationWorldV042();
    const state = world.serialize();
    const observation = world.observe();

    rejectAll(validateAction, [
      contract.actions[0],
      { kind: 'advance', substeps: 1, unexpected: true },
      { kind: 'advance', substeps: 2 },
    ]);
    rejectAll(validateWorld, [
      contract.state,
      { ...state, unexpected: true },
      mutateAtPath(state, ['configuration', 'integration'], (current) => ({
        ...(current as object),
        unexpected: true,
      })),
      { ...state, timePicoseconds: Number.NaN },
      mutateAtPath(state, ['energyStatistics', 'energySumKjMol'], () => Number.POSITIVE_INFINITY),
    ]);
    rejectAll(validateObservation, [
      contract.observation,
      { ...observation, unexpected: true },
      mutateAtPath(observation, ['forceField', 'workReceipt'], (current) => ({
        ...(current as object),
        unexpected: true,
      })),
      mutateAtPath(observation, ['energy', 'totalKjMol'], () => Number.NEGATIVE_INFINITY),
      mutateAtPath(observation, ['forceField', 'netForceKjMolAngstrom', 'x'], () => Number.NaN),
    ]);
  });

  it('rejects forged status, pressure, integration receipts, rank and work claims', () => {
    const { validateWorld, validateObservation } = validators();
    const world = createNaClTip3pFiniteSizeCalibrationWorldV042();
    world.advance();
    const state = world.serialize();
    const observation = world.observe();

    rejectAll(validateWorld, [
      { ...state, status: 'contract-only-no-dynamics' },
      mutateAtPath(
        state,
        ['configuration', 'degreesOfFreedom', 'constraintJacobianRank'],
        () => 5,
      ),
      mutateAtPath(
        state,
        ['configuration', 'degreesOfFreedom', 'rankWorkUnitsConsumed'],
        () => 650,
      ),
      mutateAtPath(
        state,
        [
          'lastIntegrationReceipt',
          'initialEvaluation',
          'constraintJacobianRankReceipt',
          'rank',
        ],
        () => 5,
      ),
      mutateAtPath(
        state,
        [
          'lastIntegrationReceipt',
          'finalEvaluation',
          'constraintJacobianRankReceipt',
          'workUnitsConsumed',
        ],
        () => 650,
      ),
      mutateAtPath(
        state,
        ['lastIntegrationReceipt', 'workReceipt', 'composerEndpointRankAuditWorkUnits'],
        () => 1_301,
      ),
      mutateAtPath(
        state,
        ['lastIntegrationReceipt', 'workReceipt', 'totalIntegrationWorkUnits'],
        () => 1_100_001,
      ),
      mutateAtPath(state, ['lastIntegrationReceipt'], (current) => ({
        ...(current as object),
        unexpected: true,
      })),
    ]);

    rejectAll(validateObservation, [
      { ...observation, status: 'pass' },
      mutateAtPath(observation, ['mechanicalObservables', 'pressureBar'], () => 1),
      mutateAtPath(
        observation,
        ['forceField', 'mechanicalObservables', 'pressureBar'],
        () => 1,
      ),
      mutateAtPath(observation, ['constraints', 'jacobianRank'], () => 5),
      mutateAtPath(observation, ['constraints', 'rankWorkUnitsConsumed'], () => 650),
      mutateAtPath(
        observation,
        ['integration', 'lastStepComposerEndpointRankAuditWorkUnitsConsumed'],
        () => 1_301,
      ),
      mutateAtPath(
        observation,
        ['integration', 'lastStepWorkUnitsConsumed'],
        () => 1_100_001,
      ),
      mutateAtPath(
        observation,
        [
          'integration',
          'lastIntegrationReceipt',
          'finalEvaluation',
          'constraintJacobianRankReceipt',
          'workUnitsConsumed',
        ],
        () => 652,
      ),
    ]);
  });

  it('rejects topology, atom-universe, exclusion and LJ-universe forgeries', () => {
    const { validateWorld, validateObservation } = validators();
    const world = createNaClTip3pFiniteSizeCalibrationWorldV042();
    const state = world.serialize();
    const observation = world.observe();
    const stateWithFiveConstraints = mutateAtPath(
      state,
      ['configuration', 'topology', 'constraints'],
      (current) => (current as unknown[]).slice(0, 5),
    );
    const stateWithFiveConstraintsAndExceptions = mutateAtPath(
      stateWithFiveConstraints,
      ['configuration', 'topology', 'nonbondedExceptions'],
      (current) => (current as unknown[]).slice(0, 5),
    );
    const observationWithFiveConstraints = mutateAtPath(
      observation,
      ['topology', 'constraints'],
      (current) => (current as unknown[]).slice(0, 5),
    );
    const observationWithFiveConstraintsAndExceptions = mutateAtPath(
      observationWithFiveConstraints,
      ['topology', 'nonbondedExceptions'],
      (current) => (current as unknown[]).slice(0, 5),
    );

    rejectAll(validateWorld, [
      stateWithFiveConstraintsAndExceptions,
      mutateAtPath(state, ['atoms', '1'], () => structuredClone(state.atoms[0])),
      mutateAtPath(state, ['configuration', 'topology', 'atoms', '1'], () =>
        structuredClone(state.configuration.topology.atoms[0]),
      ),
      mutateAtPath(state, ['configuration', 'topology', 'topologyId'], () => 'forged'),
      mutateAtPath(
        state,
        ['configuration', 'topology', 'nonbondedExceptions', '0', 'coulomb'],
        () => ({ mode: 'scale', scale: 1 }),
      ),
    ]);
    rejectAll(validateObservation, [
      observationWithFiveConstraintsAndExceptions,
      mutateAtPath(observation, ['atoms', '1'], () =>
        structuredClone(observation.atoms[0]),
      ),
      mutateAtPath(observation, ['forceField', 'atoms', '1'], () =>
        structuredClone(observation.forceField.atoms[0]),
      ),
      mutateAtPath(
        observation,
        ['forceField', 'nonbondedExceptionScales', '0', 'coulombScale'],
        () => 1,
      ),
      mutateAtPath(observation, ['forceField', 'lennardJonesInteractions', '0', 'id'], () =>
        'lj:forged:pair',
      ),
    ]);
  });

  it('locks initial/noninitial lifecycle and initial/final composer receipt roles', () => {
    const { validateWorld, validateObservation } = validators();
    const world = createNaClTip3pFiniteSizeCalibrationWorldV042();
    const initialState = world.serialize();
    const initialObservation = world.observe();
    const oneStepObservation = world.advance();
    const oneStepState = world.serialize();

    rejectAll(validateWorld, [
      mutateAtPath(initialState, ['lastIntegrationReceipt'], () =>
        structuredClone(oneStepState.lastIntegrationReceipt),
      ),
      mutateAtPath(initialState, ['lastAction'], () => structuredClone(oneStepState.lastAction)),
      mutateAtPath(oneStepState, ['lastIntegrationReceipt'], () => null),
      mutateAtPath(oneStepState, ['lastAction'], () => null),
      mutateAtPath(
        oneStepState,
        ['lastIntegrationReceipt', 'initialEvaluation', 'stage'],
        () => 'final',
      ),
      mutateAtPath(
        oneStepState,
        ['lastIntegrationReceipt', 'finalEvaluation', 'evaluationOrdinal'],
        () => 1,
      ),
    ]);
    rejectAll(validateObservation, [
      mutateAtPath(initialObservation, ['integration', 'lastStepResultDigest'], () =>
        oneStepObservation.integration.lastStepResultDigest,
      ),
      mutateAtPath(initialObservation, ['integration', 'lastIntegrationReceipt'], () =>
        structuredClone(oneStepObservation.integration.lastIntegrationReceipt),
      ),
      mutateAtPath(oneStepObservation, ['integration', 'lastStepResultDigest'], () => null),
      mutateAtPath(oneStepObservation, ['integration', 'lastIntegrationReceipt'], () => null),
      mutateAtPath(
        oneStepObservation,
        ['integration', 'lastIntegrationReceipt', 'initialEvaluation', 'evaluationOrdinal'],
        () => 2,
      ),
      mutateAtPath(
        oneStepObservation,
        ['integration', 'lastIntegrationReceipt', 'finalEvaluation', 'stage'],
        () => 'initial',
      ),
    ]);
  });

  it('documents integration-work arithmetic as semantic-validator scope', () => {
    const { validateWorld, validateObservation } = validators();
    const world = createNaClTip3pFiniteSizeCalibrationWorldV042();
    const observation = world.advance();
    const state = world.serialize();
    const stateWithArithmeticMismatch = mutateAtPath(
      state,
      ['lastIntegrationReceipt', 'workReceipt', 'solverIntegratorWorkUnits'],
      (current) => Number(current) + 1,
    );
    const observationWithArithmeticMismatch = mutateAtPath(
      observation,
      ['integration', 'lastStepSolverWorkUnitsConsumed'],
      (current) => Number(current) + 1,
    );

    expect(
      validateWorld(stateWithArithmeticMismatch),
      JSON.stringify(validateWorld.errors),
    ).toBe(true);
    expect(
      validateObservation(observationWithArithmeticMismatch),
      JSON.stringify(validateObservation.errors),
    ).toBe(true);
    expect(dynamicsWorldStateSchema.$comment).toContain('Semantic-validator scope');
    expect(dynamicsWorldStateSchema.$comment).toContain('solverIntegratorWorkUnits');
    expect(dynamicsObservationSchema.$comment).toContain('Semantic-validator scope');
    expect(
      dynamicsObservationSchema.$defs.forceField.properties.lennardJonesInteractions.$comment,
    ).toContain('Semantic-validator scope');
  });
});
