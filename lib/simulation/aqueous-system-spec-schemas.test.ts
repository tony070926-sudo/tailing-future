import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import legacyAqueousActionSchema from '../../schemas/aqueous-action.schema.json' with { type: 'json' };
import legacyAqueousWorldStateSchema from '../../schemas/aqueous-world-state.schema.json' with { type: 'json' };
import forceBackendManifestSchema from '../../schemas/aqueous-force-backend-manifest.schema.json' with { type: 'json' };
import aqueousSystemSpecSchema from '../../schemas/aqueous-system-spec.schema.json' with { type: 'json' };
import { createOpenMmTip3pControlPlanV044 } from './aqueous-system-spec.ts';
import { createAqueousContractFixture } from './aqueous-topology.ts';

const LOCKED_SYSTEM_DIGEST = 'sha256:e80bb9d1bd4bd8b774008b052b717cb758f16995e5164b36cda7102e2dbf6419';
const LOCKED_CELL_DIGEST = 'sha256:f136d08ebff520542682222b0d6beb499e4710c854cb7dba842496d2817e5b84';
const LOCKED_REFERENCE_MANIFEST_DIGEST = 'sha256:7f7104ea225819798c9c06eed382298c4d90ec19484f632fc6910832369882b9';
const LOCKED_CPU_MANIFEST_DIGEST = 'sha256:8bea1d8a2f48897d34594fb416f791aa8d94c02807857182681c32c9d6e0424b';
const ALTERNATE_VALID_DIGEST = `sha256:${'0'.repeat(64)}`;

function validators() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictNumbers: true });
  ajv.addSchema(forceBackendManifestSchema);
  ajv.addSchema(aqueousSystemSpecSchema);
  const validateBackend = ajv.getSchema(
    'https://tailing.future/schemas/aqueous-force-backend-manifest/0.4.4',
  );
  const validateSystem = ajv.getSchema(
    'https://tailing.future/schemas/aqueous-system-spec/0.4.4',
  );
  if (!validateBackend || !validateSystem) throw new Error('aqueous v0.4.4 schemas were not registered');
  return { validateBackend, validateSystem };
}

function legacyWorldValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: true, strictNumbers: true });
  ajv.addSchema(legacyAqueousActionSchema);
  return ajv.compile(legacyAqueousWorldStateSchema);
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
  const hasLower = record.minimum !== undefined || record.exclusiveMinimum !== undefined;
  const hasUpper = record.maximum !== undefined || record.exclusiveMaximum !== undefined;
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
    && (record.minItems === undefined || record.maxItems === undefined)
    ? [path]
    : [];
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

function cloneRecord<T>(value: T): T {
  return structuredClone(value);
}

function replaceAtPath<T>(value: T, path: readonly string[], replacement: unknown): T {
  const copy = structuredClone(value) as Record<string, unknown>;
  let cursor = copy;
  for (const key of path.slice(0, -1)) cursor = cursor[key] as Record<string, unknown>;
  cursor[path.at(-1)!] = replacement;
  return copy as T;
}

describe('aqueous system and force backend v0.4.4 schemas', () => {
  it('compiles in strict Draft 2020-12 mode and closes and bounds every declared container', () => {
    validators();
    for (const schema of [forceBackendManifestSchema, aqueousSystemSpecSchema]) {
      expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
      expect(openObjectSchemaPaths(schema)).toEqual([]);
      expect(unboundedNumericSchemaPaths(schema)).toEqual([]);
      expect(unboundedArraySchemaPaths(schema)).toEqual([]);
    }
  });

  it('accepts only the locked declarative system and its Reference then CPU backend plans', () => {
    const { validateBackend, validateSystem } = validators();
    const plan = createOpenMmTip3pControlPlanV044();

    expect(validateSystem(plan.system), JSON.stringify(validateSystem.errors)).toBe(true);
    expect(
      plan.backends.every((backend) => validateBackend(backend)),
      JSON.stringify(validateBackend.errors),
    ).toBe(true);
    expect(plan.backends.map((backend) => backend.engine.platform)).toEqual(['Reference', 'CPU']);
    expect(plan.backends.map((backend) => backend.role)).toEqual(['canonical', 'comparison']);
    expect(plan.backends.every((backend) => backend.capabilities.maximumParticles === 2685)).toBe(true);
    expect(plan.system.systemDigest).toBe(LOCKED_SYSTEM_DIGEST);
    expect(plan.system.cell.cellDigest).toBe(LOCKED_CELL_DIGEST);
    expect(plan.backends.map((backend) => backend.manifestDigest)).toEqual([
      LOCKED_REFERENCE_MANIFEST_DIGEST,
      LOCKED_CPU_MANIFEST_DIGEST,
    ]);
    expect(plan.system.backendPlan.canonicalManifestDigest).toBe(LOCKED_REFERENCE_MANIFEST_DIGEST);
    expect(plan.system.backendPlan.comparisonManifestDigest).toBe(LOCKED_CPU_MANIFEST_DIGEST);
    expect(plan.backends[0].determinism.scope).toBe(
      'same-host-same-container-fresh-process-exact-required',
    );
    expect(plan.backends[1].determinism).toMatchObject({
      scope: 'fixed-coordinate-comparison-only-no-integration',
      executionMode: 'fixed-coordinate-evaluation-only-zero-integrated-steps',
    });
    expect(plan.system.backendPlan.referenceReplay).toBe(
      'two-same-host-same-container-fresh-processes-exact-101-frame-digest-required',
    );
    expect(plan.backends[0].runtime).toMatchObject({
      packageIndex: 'https://pypi.org/simple',
      containerRegistry: 'docker.io',
      containerRepository: 'library/python',
      containerTag: '3.12.11-slim-bookworm',
      openmmWheelUrl: 'https://files.pythonhosted.org/packages/f1/ac/31ad62cb2066bf3ec805534d95724572fd26c372fb6b1c2403fc4f48875f/openmm-8.6.0-cp312-cp312-manylinux_2_34_x86_64.whl',
      openmmWheelByteCount: 14428011,
      numpyWheelFilename: 'numpy-2.2.6-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl',
      numpyWheelUrl: 'https://files.pythonhosted.org/packages/8c/3d/1e1db36cfd41f895d266b103df00ca5b3cbe965184df824dec5c08c6b803/numpy-2.2.6-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl',
      numpyWheelByteCount: 16527618,
    });
    expect(plan.system.forceModel.nonbondedMethod).toBe('PME');
    expect(plan.system.forceModel.pme).toEqual({
      parameterApplicationMode: 'explicit-setPMEParameters-with-nonzero-alpha',
      designErrorTolerance: 0.0001,
      designErrorToleranceUsedByEngine: false,
      requestedAlphaInverseNanometer: 2.918423065872431,
      requestedGrid: [90, 90, 90],
      contextReadbackRequiredForEachLane: true,
      contextValuesMayDifferFromRequestDueToPlatformRestrictions: true,
      sameLaneFreshProcessReadbacksMustMatch: true,
      cpuWarmupBeforeContextReadbackRequired: true,
      cpuWarmupOperation: 'getState-getEnergy-true-after-setPositions',
    });
    expect(plan.system.acceptancePlan.referenceSameHostSameContainerExactReplayRequired).toBe(true);
    expect(plan.system.acceptancePlan.maximumRelativePotentialEnergyDifference).toBe(0.00001);
    expect(plan.system.acceptancePlan.maximumGlobalRelativeForceL2Error).toBe(0.0001);
    expect(plan.system.acceptancePlan.metricDefinitions.forceGroupEnergyClosure.lanes).toEqual([
      'Reference',
      'CPU',
    ]);
    expect(plan.system.acceptancePlan.metricDefinitions.forceGroupForceClosure.sumOrder).toBe(
      'ascending-force-group-0-1-2-3',
    );
    expect(plan.system.acceptancePlan.metricDefinitions.forceGroupForceClosure).toMatchObject({
      zeroTermGroups: [0, 1],
      referenceCriterion: { maximumRelativeResidual: 1e-8 },
      cpuCriterion: {
        componentArithmetic: 'round-each-input-and-left-associated-sum-to-ieee754-binary32',
        maximumUlpDistance: 2,
      },
    });
    expect(plan.system.preparationPlan.minimization).toMatchObject({
      maximumIterationsArgument: 5000,
      iterationSemantics: 'OpenMM-maxIterations-argument-does-not-bound-total-reporter-callbacks-across-constraint-restarts',
      reporter: { required: true, maximumReporterCallbacks: 20000 },
      postconditions: { maximumConstraintRelativeResidual: 1e-8 },
    });
    expect(plan.system.preparationPlan.velocityInitialization.operationOrder).toEqual([
      'setVelocitiesToTemperature',
      'removeMassWeightedCenterOfMassVelocity',
      'applyVelocityConstraints',
    ]);
    expect(plan.system.dynamicsPlan).toMatchObject({
      integratedSteps: 1000,
      velocityReadbackSemantics: 'prepared-step-0-then-raw-OpenMM-Verlet-half-step-velocities-no-resynchronization',
    });
    expect(plan.system.inputs.expectedRigidWaterGeometryNanometer).toEqual({
      oxygenHydrogen: 0.09572,
      hydrogenHydrogen: 0.15139006545247014,
    });
    expect(plan.system.inputs.sourcePins.every(
      (pin) => pin.evidenceStatus === 'pinned-expected-input-not-bundled'
        && pin.artifactFetchReceiptDigest === null,
    )).toBe(true);

    for (const key of Object.keys(plan.system)) {
      expect(validateSystem(withoutKey(plan.system, key))).toBe(false);
    }
    for (const key of Object.keys(plan.backends[0])) {
      expect(validateBackend(withoutKey(plan.backends[0], key))).toBe(false);
    }
  });

  it('keeps the declarative v0.4.4 contracts isolated from the executable v0.4.2 world schema', () => {
    const { validateBackend, validateSystem } = validators();
    const validateLegacyWorld = legacyWorldValidator();
    const plan = createOpenMmTip3pControlPlanV044();
    const legacy = createAqueousContractFixture();

    expect(validateSystem(legacy.state)).toBe(false);
    expect(validateBackend(legacy.state.topology)).toBe(false);
    expect(validateLegacyWorld(plan.system)).toBe(false);
    expect(validateLegacyWorld(plan.backends[0])).toBe(false);
  });

  it('rejects extra keys and out-of-bound container or numeric data', () => {
    const { validateBackend, validateSystem } = validators();
    const plan = createOpenMmTip3pControlPlanV044();

    const systemExtra = cloneRecord(plan.system) as typeof plan.system & { unexpected?: boolean };
    systemExtra.unexpected = true;
    expect(validateSystem(systemExtra)).toBe(false);

    const nestedSystemExtra = cloneRecord(plan.system) as unknown as Record<string, Record<string, unknown>>;
    nestedSystemExtra.forceModel.unexpected = true;
    expect(validateSystem(nestedSystemExtra)).toBe(false);

    const backendExtra = cloneRecord(plan.backends[0]) as typeof plan.backends[0] & { unexpected?: boolean };
    backendExtra.unexpected = true;
    expect(validateBackend(backendExtra)).toBe(false);

    const nestedBackendExtra = cloneRecord(plan.backends[0]) as unknown as Record<string, Record<string, unknown>>;
    nestedBackendExtra.runtime.unexpected = true;
    expect(validateBackend(nestedBackendExtra)).toBe(false);

    const shortSources = cloneRecord(plan.system) as unknown as {
      inputs: { sourcePins: unknown[] };
    };
    shortSources.inputs.sourcePins.pop();
    expect(validateSystem(shortSources)).toBe(false);

    const nonfiniteDensity = cloneRecord(plan.system) as unknown as {
      composition: { nominalDensityKgM3: number };
    };
    nonfiniteDensity.composition.nominalDensityKgM3 = Number.NaN;
    expect(validateSystem(nonfiniteDensity)).toBe(false);

    const oversizedBackend = cloneRecord(plan.backends[0]) as unknown as {
      capabilities: { maximumParticles: number };
    };
    oversizedBackend.capabilities.maximumParticles = 2686;
    expect(validateBackend(oversizedBackend)).toBe(false);
  });

  it('rejects well-formed substitutions for every locked system and backend digest', () => {
    const { validateBackend, validateSystem } = validators();
    const plan = createOpenMmTip3pControlPlanV044();

    for (const candidate of [
      replaceAtPath(plan.system, ['systemDigest'], ALTERNATE_VALID_DIGEST),
      replaceAtPath(plan.system, ['cell', 'cellDigest'], ALTERNATE_VALID_DIGEST),
      replaceAtPath(
        plan.system,
        ['backendPlan', 'canonicalManifestDigest'],
        ALTERNATE_VALID_DIGEST,
      ),
      replaceAtPath(
        plan.system,
        ['backendPlan', 'comparisonManifestDigest'],
        ALTERNATE_VALID_DIGEST,
      ),
    ]) expect(validateSystem(candidate)).toBe(false);

    expect(validateBackend(
      replaceAtPath(plan.backends[0], ['manifestDigest'], ALTERNATE_VALID_DIGEST),
    )).toBe(false);
    expect(validateBackend(
      replaceAtPath(plan.backends[1], ['manifestDigest'], ALTERNATE_VALID_DIGEST),
    )).toBe(false);
  });

  it('rejects forged runtime provenance, replay scope and closed metric definitions', () => {
    const { validateBackend, validateSystem } = validators();
    const plan = createOpenMmTip3pControlPlanV044();

    for (const candidate of [
      replaceAtPath(plan.backends[0], ['runtime', 'packageIndex'], 'https://mirror.invalid/simple'),
      replaceAtPath(plan.backends[0], ['runtime', 'containerRegistry'], 'registry.invalid'),
      replaceAtPath(plan.backends[0], ['runtime', 'containerRepository'], 'forged/python'),
      replaceAtPath(plan.backends[0], ['runtime', 'containerTag'], 'latest'),
      replaceAtPath(plan.backends[0], ['runtime', 'openmmWheelFilename'], 'openmm-forged.whl'),
      replaceAtPath(
        plan.backends[0],
        ['runtime', 'openmmWheelUrl'],
        'https://files.pythonhosted.org/forged-openmm.whl',
      ),
      replaceAtPath(plan.backends[0], ['runtime', 'openmmWheelByteCount'], 14428012),
      replaceAtPath(plan.backends[0], ['runtime', 'numpyWheelFilename'], 'numpy-forged.whl'),
      replaceAtPath(
        plan.backends[0],
        ['runtime', 'numpyWheelUrl'],
        'https://files.pythonhosted.org/forged-numpy.whl',
      ),
      replaceAtPath(plan.backends[0], ['runtime', 'numpyWheelByteCount'], 16527619),
      replaceAtPath(
        plan.backends[0],
        ['determinism', 'scope'],
        'same-container-fresh-process-exact-required',
      ),
      replaceAtPath(
        plan.backends[1],
        ['determinism', 'executionMode'],
        'cpu-free-trajectory',
      ),
    ]) expect(validateBackend(candidate)).toBe(false);

    for (const candidate of [
      replaceAtPath(
        plan.system,
        ['backendPlan', 'referenceReplay'],
        'two-fresh-processes-exact-101-frame-digest-required',
      ),
      replaceAtPath(
        plan.system,
        ['acceptancePlan', 'metricDefinitions', 'energyExcursion', 'energyQuantity'],
        'potential-energy-only',
      ),
      replaceAtPath(
        plan.system,
        ['acceptancePlan', 'metricDefinitions', 'energyExcursion', 'formula'],
        'unspecified',
      ),
      replaceAtPath(
        plan.system,
        ['acceptancePlan', 'metricDefinitions', 'constraintRelativeResidual', 'distanceGauge'],
        'raw-cartesian-distance',
      ),
      replaceAtPath(
        plan.system,
        ['acceptancePlan', 'metricDefinitions', 'cpuReferenceForceComparison', 'vectorNorm'],
        'componentwise-maximum',
      ),
      replaceAtPath(
        plan.system,
        ['acceptancePlan', 'metricDefinitions', 'cpuReferenceForceComparison', 'coordinateSteps'],
        [0, 1000],
      ),
      replaceAtPath(
        plan.system,
        ['acceptancePlan', 'metricDefinitions', 'cpuReferenceForceComparison', 'globalAggregation'],
        'mean-over-coordinate-steps',
      ),
      replaceAtPath(
        plan.system,
        ['acceptancePlan', 'metricDefinitions', 'cpuReferencePotentialEnergyComparison', 'aggregation'],
        'mean-over-coordinate-steps',
      ),
      replaceAtPath(
        plan.system,
        ['acceptancePlan', 'metricDefinitions', 'forceGroupEnergyClosure', 'lanes'],
        ['Reference'],
      ),
      replaceAtPath(
        plan.system,
        ['acceptancePlan', 'metricDefinitions', 'forceGroupForceClosure', 'sumOrder'],
        'unspecified',
      ),
      replaceAtPath(
        plan.system,
        ['acceptancePlan', 'metricDefinitions', 'forceGroupEnergyClosure', 'aggregation'],
        'maximum-over-reference-only',
      ),
      replaceAtPath(
        plan.system,
        ['acceptancePlan', 'metricDefinitions', 'forceGroupForceClosure', 'referenceCriterion', 'maximumRelativeResidual'],
        1e-6,
      ),
      replaceAtPath(
        plan.system,
        ['acceptancePlan', 'metricDefinitions', 'forceGroupForceClosure', 'cpuCriterion', 'maximumUlpDistance'],
        16,
      ),
      replaceAtPath(
        plan.system,
        ['preparationPlan', 'minimization', 'maximumIterationsArgument'],
        20000,
      ),
      replaceAtPath(
        plan.system,
        ['preparationPlan', 'minimization', 'iterationSemantics'],
        'global-hard-cap',
      ),
      replaceAtPath(
        plan.system,
        ['preparationPlan', 'velocityInitialization', 'applyVelocityConstraintsAfterCenterOfMassRemoval'],
        false,
      ),
      replaceAtPath(
        plan.system,
        ['dynamicsPlan', 'velocityReadbackSemantics'],
        'synchronized-full-step',
      ),
    ]) expect(validateSystem(candidate)).toBe(false);
  });

  it('rejects platform swaps, PME substitutions and forged execution or clearance claims', () => {
    const { validateBackend, validateSystem } = validators();
    const plan = createOpenMmTip3pControlPlanV044();

    const swappedReference = cloneRecord(plan.backends[0]) as unknown as {
      engine: { platform: string };
    };
    swappedReference.engine.platform = 'CPU';
    expect(validateBackend(swappedReference)).toBe(false);

    const forgedCpuRole = cloneRecord(plan.backends[1]) as unknown as { role: string };
    forgedCpuRole.role = 'canonical';
    expect(validateBackend(forgedCpuRole)).toBe(false);

    const forgedCpuThreading = cloneRecord(plan.backends[1]) as unknown as {
      runtime: { environment: { OPENMM_CPU_THREADS: null } };
    };
    forgedCpuThreading.runtime.environment.OPENMM_CPU_THREADS = null;
    expect(validateBackend(forgedCpuThreading)).toBe(false);

    expect(validateBackend(replaceAtPath(
      plan.backends[1],
      ['capabilities', 'forceSemantics'],
      'complete-force-including-constraint-impulses',
    ))).toBe(false);

    const substitutedPme = cloneRecord(plan.system) as unknown as {
      forceModel: { nonbondedMethod: string };
    };
    substitutedPme.forceModel.nonbondedMethod = 'CutoffPeriodic';
    expect(validateSystem(substitutedPme)).toBe(false);

    const changedPmeGrid = cloneRecord(plan.system) as unknown as {
      forceModel: { pme: { requestedGrid: number[] } };
    };
    changedPmeGrid.forceModel.pme.requestedGrid = [64, 64, 64];
    expect(validateSystem(changedPmeGrid)).toBe(false);

    for (const candidate of [
      replaceAtPath(
        plan.system,
        ['forceModel', 'pme', 'parameterApplicationMode'],
        'automatic-error-tolerance',
      ),
      replaceAtPath(plan.system, ['forceModel', 'pme', 'requestedAlphaInverseNanometer'], 0),
      replaceAtPath(plan.system, ['forceModel', 'pme', 'designErrorTolerance'], 0.001),
      replaceAtPath(plan.system, ['forceModel', 'pme', 'designErrorToleranceUsedByEngine'], true),
      replaceAtPath(plan.system, ['forceModel', 'pme', 'contextReadbackRequiredForEachLane'], false),
      replaceAtPath(
        plan.system,
        ['forceModel', 'pme', 'contextValuesMayDifferFromRequestDueToPlatformRestrictions'],
        false,
      ),
      replaceAtPath(
        plan.system,
        ['forceModel', 'pme', 'sameLaneFreshProcessReadbacksMustMatch'],
        false,
      ),
      replaceAtPath(
        plan.system,
        ['forceModel', 'pme', 'cpuWarmupBeforeContextReadbackRequired'],
        false,
      ),
      replaceAtPath(
        plan.system,
        ['forceModel', 'pme', 'cpuWarmupOperation'],
        'readback-before-warmup',
      ),
      replaceAtPath(plan.system, ['forceModel', 'zeroTermForceGroups'], [0]),
    ]) expect(validateSystem(candidate)).toBe(false);

    const changedRigidGeometry = cloneRecord(plan.system) as unknown as {
      inputs: { expectedRigidWaterGeometryNanometer: { oxygenHydrogen: number } };
    };
    changedRigidGeometry.inputs.expectedRigidWaterGeometryNanometer.oxygenHydrogen = 0.1;
    expect(validateSystem(changedRigidGeometry)).toBe(false);

    const forgedSystemExecution = cloneRecord(plan.system) as unknown as {
      evidenceSemantics: { externalOpenmmExecution: boolean };
    };
    forgedSystemExecution.evidenceSemantics.externalOpenmmExecution = true;
    expect(validateSystem(forgedSystemExecution)).toBe(false);

    const forgedDynamicsExecution = cloneRecord(plan.system) as unknown as {
      dynamicsPlan: { evidenceStatus: string };
    };
    forgedDynamicsExecution.dynamicsPlan.evidenceStatus = 'executed';
    expect(validateSystem(forgedDynamicsExecution)).toBe(false);

    const forgedBackendExecution = cloneRecord(plan.backends[0]) as unknown as {
      evidence: { externalExecutionPerformed: boolean };
    };
    forgedBackendExecution.evidence.externalExecutionPerformed = true;
    expect(validateBackend(forgedBackendExecution)).toBe(false);

    const forgedClearance = cloneRecord(plan.system) as unknown as {
      claimBoundaries: { licenseClearance: boolean };
    };
    forgedClearance.claimBoundaries.licenseClearance = true;
    expect(validateSystem(forgedClearance)).toBe(false);

    const forgedFetchReceipt = cloneRecord(plan.system) as unknown as {
      inputs: { sourcePins: Array<{ artifactFetchReceiptDigest: string | null }> };
    };
    forgedFetchReceipt.inputs.sourcePins[0].artifactFetchReceiptDigest = `sha256:${'0'.repeat(64)}`;
    expect(validateSystem(forgedFetchReceipt)).toBe(false);
  });
});
