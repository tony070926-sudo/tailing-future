import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import periodicActionSchema from '../../schemas/periodic-atomistic-action.schema.json' with { type: 'json' };
import periodicObservationSchema from '../../schemas/periodic-atomistic-observation.schema.json' with { type: 'json' };
import periodicWorldStateSchema from '../../schemas/periodic-atomistic-world-state.schema.json' with { type: 'json' };
import { createPeriodicArgonCalibrationWorld } from './periodic-atomistic-world.ts';

function validators() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictNumbers: true });
  const validateWorld = ajv.compile(periodicWorldStateSchema);
  const validateAction = ajv.compile(periodicActionSchema);
  const validateObservation = ajv.compile(periodicObservationSchema);
  const validateNonbondedPotential = ajv.getSchema(
    'https://tailing.future/schemas/periodic-atomistic-world-state/0.4.1#/$defs/nonbondedPotential',
  );
  const validateBondedPotential = ajv.getSchema(
    'https://tailing.future/schemas/periodic-atomistic-world-state/0.4.1#/$defs/bondedPotential',
  );
  if (!validateNonbondedPotential || !validateBondedPotential) {
    throw new Error('periodic atomistic potential definitions were not registered');
  }
  return { validateWorld, validateAction, validateObservation, validateNonbondedPotential, validateBondedPotential };
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
  const hasLowerBound = record.minimum !== undefined || record.exclusiveMinimum !== undefined;
  const hasUpperBound = record.maximum !== undefined || record.exclusiveMaximum !== undefined;
  const own = numeric && (!hasLowerBound || !hasUpperBound) ? [path] : [];
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

describe('periodic atomistic v0.4.1 executable schemas', () => {
  it('keeps every declared object closed and every runtime top-level field required', () => {
    const { validateWorld, validateAction, validateObservation } = validators();
    for (const schema of [periodicWorldStateSchema, periodicActionSchema, periodicObservationSchema]) {
      expect(openObjectSchemaPaths(schema)).toEqual([]);
      expect(unboundedNumericSchemaPaths(schema)).toEqual([]);
    }

    const world = createPeriodicArgonCalibrationWorld();
    world.advance();
    const state = world.serialize();
    const action = state.lastAction!;
    const observation = world.observe();
    for (const key of periodicWorldStateSchema.required) expect(validateWorld(withoutKey(state, key))).toBe(false);
    for (const key of periodicActionSchema.required) expect(validateAction(withoutKey(action, key))).toBe(false);
    for (const key of periodicObservationSchema.required) expect(validateObservation(withoutKey(observation, key))).toBe(false);
  });

  it('accepts exact initial, stepped and branched runtime envelopes', () => {
    const { validateWorld, validateAction, validateObservation } = validators();
    const world = createPeriodicArgonCalibrationWorld();

    expect(validateWorld(world.serialize()), JSON.stringify(validateWorld.errors)).toBe(true);
    expect(validateObservation(world.observe()), JSON.stringify(validateObservation.errors)).toBe(true);

    world.advance(3);
    const steppedState = world.serialize();
    expect(validateWorld(steppedState), JSON.stringify(validateWorld.errors)).toBe(true);
    expect(validateObservation(world.observe()), JSON.stringify(validateObservation.errors)).toBe(true);
    expect(validateAction(steppedState.lastAction), JSON.stringify(validateAction.errors)).toBe(true);

    const branch = world.clone(7);
    const branchState = branch.serialize();
    expect(validateWorld(branchState), JSON.stringify(validateWorld.errors)).toBe(true);
    expect(validateObservation(branch.observe()), JSON.stringify(validateObservation.errors)).toBe(true);
    expect(validateAction(branchState.lastAction), JSON.stringify(validateAction.errors)).toBe(true);
  });

  it('closes every tested envelope, nested object, vector, tensor and action parameter set', () => {
    const { validateWorld, validateAction, validateObservation } = validators();
    const world = createPeriodicArgonCalibrationWorld();
    world.advance(2);
    const state = world.serialize();
    const observation = world.observe();
    const action = state.lastAction!;

    expect(validateWorld({ ...state, unexpected: true })).toBe(false);
    expect(validateWorld({ ...state, neighborListBuildEvents: 1 })).toBe(false);
    expect(validateWorld({
      ...state,
      configuration: { ...state.configuration, unexpected: true },
    })).toBe(false);
    expect(validateWorld({
      ...state,
      atoms: [{ ...state.atoms[0], image: { ...state.atoms[0].image, fourth: 0 } }, ...state.atoms.slice(1)],
    })).toBe(false);

    expect(validateObservation({
      ...observation,
      atoms: [{ ...observation.atoms[0], localVirialKjMol: { ...observation.atoms[0].localVirialKjMol, extra: 0 } }, ...observation.atoms.slice(1)],
    })).toBe(false);
    expect(validateObservation({
      ...observation,
      energy: { ...observation.energy, untrackedKjMol: 0 },
    })).toBe(false);
    expect(validateObservation({
      ...observation,
      neighborList: { ...observation.neighborList, buildEvents: 1 },
    })).toBe(false);
    expect(validateObservation({
      ...observation,
      thermodynamics: { ...observation.thermodynamics, kineticFrame: 'laboratory' },
    })).toBe(false);
    expect(validateObservation({
      ...observation,
      forceByAtomIdKjMolAngstrom: { ...observation.forceByAtomIdKjMolAngstrom, '非-ascii': { x: 0, y: 0, z: 0 } },
    })).toBe(false);

    expect(validateAction({
      ...action,
      parameters: { ...action.parameters, unexpected: 1 },
    })).toBe(false);
    expect(validateAction({
      ...action,
      parameters: { substeps: 2, fromStep: 0 },
    })).toBe(false);
    expect(validateAction({
      ...action,
      kind: 'branch',
      parameters: { substeps: 2, fromStep: 0, toStep: 2 },
    })).toBe(false);
  });

  it('rejects non-finite, out-of-domain and non-ASCII identity data', () => {
    const { validateWorld, validateObservation } = validators();
    const world = createPeriodicArgonCalibrationWorld();
    const state = world.serialize();
    const observation = world.observe();

    expect(validateWorld({
      ...state,
      atoms: [{
        ...state.atoms[0],
        velocityAngstromPerPicosecond: { ...state.atoms[0].velocityAngstromPerPicosecond, x: Number.NaN },
      }, ...state.atoms.slice(1)],
    })).toBe(false);
    expect(validateWorld({
      ...state,
      atoms: [{ ...state.atoms[0], wrappedFractional: { ...state.atoms[0].wrappedFractional, z: 1 } }, ...state.atoms.slice(1)],
    })).toBe(false);
    expect(validateWorld({
      ...state,
      atoms: [{ ...state.atoms[0], image: { ...state.atoms[0].image, x: 1000000001 } }, ...state.atoms.slice(1)],
    })).toBe(false);
    expect(validateWorld({ ...state, stateDigest: 'sha256:ABC' })).toBe(false);
    expect(validateWorld({
      ...state,
      configuration: {
        ...state.configuration,
        atoms: [{ ...state.configuration.atoms[0], id: '氯-1' }, ...state.configuration.atoms.slice(1)],
      },
    })).toBe(false);
    expect(validateObservation({
      ...observation,
      stressKjMolAngstrom3: { ...observation.stressKjMolAngstrom3, xy: Number.POSITIVE_INFINITY },
    })).toBe(false);
    expect(validateObservation({
      ...observation,
      thermodynamics: { ...observation.thermodynamics, temperatureKelvin: -1 },
    })).toBe(false);
  });

  it('uses closed discriminated unions for all declared radial potential families', () => {
    const { validateNonbondedPotential, validateBondedPotential } = validators();
    const nonbondedPotentials = [
      { kind: 'coulomb-minimum-image-reference', relativePermittivity: 78.4 },
      { kind: 'lennard-jones-12-6', epsilonKjMol: 0.997, sigmaAngstrom: 3.405 },
      {
        kind: 'buckingham-exp-6',
        exponentialPrefactorKjMol: 1000,
        decayInverseAngstrom: 2.5,
        dispersionKjMolAngstrom6: 30,
      },
      {
        kind: 'morse',
        wellDepthKjMol: 400,
        widthInverseAngstrom: 2,
        equilibriumDistanceAngstrom: 1.5,
        energyZero: 'minimum',
      },
    ];
    expect(nonbondedPotentials.every((potential) => validateNonbondedPotential(potential))).toBe(true);
    expect(validateBondedPotential({
      kind: 'harmonic-bond',
      forceConstantKjMolAngstrom2: 1000,
      equilibriumDistanceAngstrom: 1,
    })).toBe(true);
    expect(validateBondedPotential(nonbondedPotentials[3])).toBe(true);

    expect(validateNonbondedPotential({
      kind: 'lennard-jones-12-6',
      epsilonKjMol: 1,
      sigmaAngstrom: 3,
      relativePermittivity: 1,
    })).toBe(false);
    expect(validateNonbondedPotential({
      kind: 'buckingham-exp-6',
      exponentialPrefactorKjMol: 1000,
      decayInverseAngstrom: 2.5,
      dispersionKjMolAngstrom6: -1,
    })).toBe(false);
    expect(validateNonbondedPotential({ kind: 'neural-network', model: 'opaque' })).toBe(false);
    expect(validateBondedPotential({
      kind: 'coulomb-minimum-image-reference',
      relativePermittivity: 1,
    })).toBe(false);
  });
});
