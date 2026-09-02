import { describe, expect, it } from 'vitest';
import { createNaClTip3pFiniteSizeCalibrationWorldV042 } from './aqueous-dynamics-world.ts';
import {
  AQUEOUS_FORCE_COMPONENT_COUNT_V044,
  AQUEOUS_SYSTEM_SPEC_VERSION_V044,
  FORCE_BACKEND_MANIFEST_VERSION_V044,
  OPENMM_TIP3P_CONTROL_PLAN_VERSION_V044,
  assertForceEvaluationRequestV044,
  assertForceEvaluationV044,
  assertOpenMmTip3pControlPlanV044,
  canonicalizeAqueousSystemSpecV044,
  canonicalizeForceBackendManifestV044,
  createForceEvaluationRequestV044,
  createForceEvaluationV044,
  createOpenMmTip3pControlPlanV044,
  type ForceEvaluationRequestV044,
  type ForceEvaluationV044,
  type OpenMmTip3pControlPlanV044,
} from './aqueous-system-spec.ts';
import { createAqueousContractFixture } from './aqueous-topology.ts';
import { digestValue } from './digest.ts';

const EXPECTED_DIGESTS = Object.freeze({
  plan: 'sha256:ad07bc923c991746bcc5c9e048dff9b4065981b50c940b13c3f1654e4ffd1177',
  system: 'sha256:e80bb9d1bd4bd8b774008b052b717cb758f16995e5164b36cda7102e2dbf6419',
  cell: 'sha256:f136d08ebff520542682222b0d6beb499e4710c854cb7dba842496d2817e5b84',
  referenceBackend: 'sha256:7f7104ea225819798c9c06eed382298c4d90ec19484f632fc6910832369882b9',
  cpuBackend: 'sha256:8bea1d8a2f48897d34594fb416f791aa8d94c02807857182681c32c9d6e0424b',
  v042ContractTopology: 'sha256:f4b1817e6c9238a2bf72826e695e75d6a16428b4e40a6335535f674ad8a5d62d',
  v042DynamicsTopology: 'sha256:53efaac1f1e0bf643f0ab99bec32c02d9dfdf9a0eb32fafc8b9d371d45fda667',
  v042DynamicsConfiguration: 'sha256:37dc2a135bb5c7d76be2166d5967cafe7819c65663358754e487b21564e8187b',
});

type MutablePlan = DeepMutable<OpenMmTip3pControlPlanV044>;
const ZERO_DIGEST = `sha256:${'0'.repeat(64)}`;

describe('v0.4.4 declarative OpenMM TIP3P control plan', () => {
  it('is deterministic, exactly digested, deeply frozen, and accepted by the exact validator', () => {
    const first = createOpenMmTip3pControlPlanV044();
    const replay = createOpenMmTip3pControlPlanV044();

    expect(first).toEqual(replay);
    expect(first).not.toBe(replay);
    expect(first.schemaVersion).toBe(OPENMM_TIP3P_CONTROL_PLAN_VERSION_V044);
    expect(first.artifactId).toBe('tf.openmm-pure-water-cold-start-pme-control/1');
    expect(first.system.schemaVersion).toBe(AQUEOUS_SYSTEM_SPEC_VERSION_V044);
    expect(first.backends.every(
      (backend) => backend.schemaVersion === FORCE_BACKEND_MANIFEST_VERSION_V044,
    )).toBe(true);
    expect(first.planDigest).toBe(EXPECTED_DIGESTS.plan);
    expect(first.system.systemDigest).toBe(EXPECTED_DIGESTS.system);
    expect(first.system.cell.cellDigest).toBe(EXPECTED_DIGESTS.cell);
    expect(first.backends.map((backend) => backend.manifestDigest)).toEqual([
      EXPECTED_DIGESTS.referenceBackend,
      EXPECTED_DIGESTS.cpuBackend,
    ]);
    expect(first.system.backendPlan).toMatchObject({
      canonicalManifestDigest: EXPECTED_DIGESTS.referenceBackend,
      comparisonManifestDigest: EXPECTED_DIGESTS.cpuBackend,
    });
    expectSelfDigest(first, 'planDigest');
    expectSelfDigest(first.system, 'systemDigest');
    expectSelfDigest(first.system.cell, 'cellDigest');
    for (const backend of first.backends) expectSelfDigest(backend, 'manifestDigest');
    expectRecursivelyFrozen(first);
    expect(() => assertOpenMmTip3pControlPlanV044(first)).not.toThrow();
    expect(() => assertOpenMmTip3pControlPlanV044(replay)).not.toThrow();
  });

  it('returns an isolated deeply frozen validated clone instead of blessing the caller object', () => {
    const callerOwned = mutablePlan();
    const validated = assertOpenMmTip3pControlPlanV044(callerOwned);
    const lockedSnapshot = structuredClone(validated);

    expect(validated).toEqual(callerOwned);
    expect(validated).not.toBe(callerOwned);
    expect(validated.system).not.toBe(callerOwned.system);
    expectRecursivelyFrozen(validated);
    expect(Object.isFrozen(callerOwned)).toBe(false);

    Reflect.set(callerOwned.system.composition, 'waterMoleculeCount', 1);
    callerOwned.boundaries[0] = 'caller mutation after validation';
    expect(validated).toEqual(lockedSnapshot);
    expect(validated.system.composition.waterMoleculeCount).toBe(895);
    expect(validated.boundaries[0]).not.toBe(callerOwned.boundaries[0]);
  });

  it('pins the exact 895-water, 2685-particle, 27 nm3 neutral control and explicit PME plan', () => {
    const { system } = createOpenMmTip3pControlPlanV044();

    expect(system.status).toBe('declarative-system-spec-not-execution');
    expect(system.identity).toEqual({
      scientificRole: 'cold-start-periodic-pure-water-engine-control-candidate',
      chemistry: 'rigid-tip3p-water',
      parameterFamilyId: 'openmm-amber14-tip3p-joung-cheatham-explicit-solvent',
      parameterBytesEqualToCurrent851Receipt: true,
      parameterByteEqualityImpliesExecution: false,
    });
    expect(system.composition).toEqual({
      waterMoleculeCount: 895,
      sodiumIonCount: 0,
      chlorideIonCount: 0,
      residueCount: 895,
      particleCount: 2685,
      topologyBondCount: 1790,
      rigidDistanceConstraintCount: 2685,
      intramolecularNonbondedExceptionCount: 2685,
      totalMassDalton: 16123.71498,
      totalChargeE: 0,
      nominalDensityKgM3: 991.6318008523569,
    });
    expect(Math.abs(system.composition.totalMassDalton - (18.015324 * 895)))
      .toBeLessThan(1e-9);
    expect(system.cell).toEqual({
      kind: 'orthorhombic-periodic-cell',
      vectorsNanometer: [
        { x: 3, y: 0, z: 0 },
        { x: 0, y: 3, z: 0 },
        { x: 0, y: 0, z: 3 },
      ],
      volumeNanometer3: 27,
      periodicAxes: [true, true, true],
      originGauge: 'pdb-cryst1-origin-omitted-as-nonphysical',
      cellDigest: EXPECTED_DIGESTS.cell,
    });
    expect(system.inputs.expectedRigidWaterGeometryNanometer).toEqual({
      oxygenHydrogen: 0.09572,
      hydrogenHydrogen: 0.15139006545247014,
    });
    expect(system.forceModel).toEqual({
      nonbondedMethod: 'PME',
      cutoffNanometer: 1,
      constraints: 'HBonds',
      rigidWater: true,
      flexibleConstraints: false,
      removeCenterOfMassMotion: false,
      switchingFunction: false,
      switchDistanceNanometer: null,
      dispersionCorrection: true,
      ljpme: false,
      exceptionsUsePeriodicBoundaryConditions: false,
      pme: {
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
      },
      forceGroups: {
        harmonicBond: 0,
        harmonicAngle: 1,
        nonbondedDirectAndLennardJones: 2,
        nonbondedReciprocal: 3,
      },
      zeroTermForceGroups: [0, 1],
    });
    expect(system.dynamicsPlan).toMatchObject({
      evidenceStatus: 'planned-not-executed',
      ensemble: 'NVE',
      integrator: 'OpenMM-VerletIntegrator',
      fixedTimeStepPicoseconds: 0.001,
      constraintTolerance: 1e-8,
      integratedSteps: 1000,
      sampleStepSemantics: 'integrated-steps-from-portable-start-state-step-0',
      sampleStrideSteps: 10,
      expectedSampleCount: 101,
      finalTimePicoseconds: 1,
      velocityReadbackSemantics: 'prepared-step-0-then-raw-OpenMM-Verlet-half-step-velocities-no-resynchronization',
    });
    expect(system.acceptancePlan).toEqual({
      maximumRelativeEnergyExcursion: 0.001,
      maximumConstraintRelativeResidual: 0.000001,
      maximumRelativePotentialEnergyDifference: 0.00001,
      maximumMedianPerParticleRelativeForceError: 0.0001,
      maximumGlobalRelativeForceL2Error: 0.0001,
      forceGroupEnergySumMustClose: true,
      forceGroupForceSumMustClose: true,
      referenceSameHostSameContainerExactReplayRequired: true,
      cpuExactReplayRequired: false,
      freeTrajectoryCrossPlatformEqualityRequired: false,
      metricDefinitions: {
        energyExcursion: {
          lane: 'Reference',
          sampleDomain: 'all-101-authoritative-samples',
          energyQuantity: 'potential-plus-kinetic-energy-kj-mol',
          formula: 'max(abs(totalEnergy_i-totalEnergy_0))/max(abs(totalEnergy_0),1-kj-mol)',
          denominatorFloorKjMol: 1,
        },
        constraintRelativeResidual: {
          lane: 'Reference',
          sampleDomain: 'all-101-authoritative-samples-and-all-rigid-water-constraints',
          distanceGauge: 'minimum-image-distance-from-authoritative-periodic-cell',
          formula: 'max(abs(actualDistance-targetDistance)/targetDistance)',
        },
        cpuReferenceForceComparison: {
          coordinateSteps: [0, 10, 100, 500, 1000],
          coordinateIdentity: 'same-physical-coordinate-digest-atom-order-and-lane-prepare-receipts',
          particleDomain: 'all-2685-particles',
          vectorNorm: 'euclidean-l2',
          perParticleFormula: 'norm(cpu-reference)/max(norm(reference),1e-12-kj-mol-nm)',
          globalFormula: 'sqrt(sum(norm(cpu-reference)^2))/max(sqrt(sum(norm(reference)^2)),1e-12-kj-mol-nm)',
          denominatorFloorKjMolNanometer: 1e-12,
          medianConvention: 'sorted-middle-or-mean-of-two-middle-values',
          medianAggregation: 'maximum-of-per-step-particle-medians',
          globalAggregation: 'maximum-over-coordinate-steps',
        },
        cpuReferencePotentialEnergyComparison: {
          coordinateSteps: [0, 10, 100, 500, 1000],
          coordinateIdentity: 'same-physical-coordinate-digest-atom-order-and-lane-prepare-receipts',
          energyQuantity: 'potential-energy-kj-mol',
          perStepFormula: 'abs(cpu-reference)/max(abs(reference),1-kj-mol)',
          denominatorFloorKjMol: 1,
          aggregation: 'maximum-over-coordinate-steps',
        },
        forceGroupEnergyClosure: {
          lanes: ['Reference', 'CPU'],
          coordinateSteps: [0, 10, 100, 500, 1000],
          coordinateIdentity: 'each-result-bound-to-lane-prepare-receipt-and-shared-physical-coordinate-digest',
          groups: [0, 1, 2, 3],
          formula: 'abs(total-sum(groups))/max(abs(total),1-kj-mol)',
          sumOrder: 'ascending-force-group-0-1-2-3',
          aggregation: 'maximum-over-two-lanes-five-steps',
          maximumRelativeResidual: 1e-8,
        },
        forceGroupForceClosure: {
          lanes: ['Reference', 'CPU'],
          coordinateSteps: [0, 10, 100, 500, 1000],
          coordinateIdentity: 'each-result-bound-to-lane-prepare-receipt-and-shared-physical-coordinate-digest',
          groups: [0, 1, 2, 3],
          zeroTermGroups: [0, 1],
          sumOrder: 'ascending-force-group-0-1-2-3',
          referenceCriterion: {
            componentArithmetic: 'binary64-left-associated',
            formula: 'max-component-abs(total-sum(groups))/max(max-component-abs(total),1-kj-mol-nm)',
            maximumRelativeResidual: 1e-8,
          },
          cpuCriterion: {
            componentArithmetic: 'round-each-input-and-left-associated-sum-to-ieee754-binary32',
            formula: 'max-ulp-distance(float32(total),float32-left-associated-sum(groups))',
            maximumUlpDistance: 2,
          },
        },
      },
    });
    expect(createOpenMmTip3pControlPlanV044().boundaries.join('\n')).toMatch(
      /design error tolerance non-operative.*Context must return and receipt/i,
    );
  });

  it('keeps Reference canonical/exact and CPU comparison-only without platform fallback', () => {
    const plan = createOpenMmTip3pControlPlanV044();
    const [reference, cpu] = plan.backends;

    expect(reference).toMatchObject({
      backendId: 'openmm-8.6.0-reference-pme',
      role: 'canonical',
      engine: {
        name: 'OpenMM',
        version: '8.6.0',
        sourceCommit: 'c6173db6e8edd705eb59172bd21e9ce69c572405',
        platform: 'Reference',
        platformProperties: {
          Threads: null,
          precision: 'platform-native-no-Precision-property',
        },
      },
      determinism: {
        scope: 'same-host-same-container-fresh-process-exact-required',
        executionMode: 'canonical-reference-trajectory-and-fixed-coordinate-evaluation',
        freeTrajectoryCrossPlatformEquality: false,
        randomSeedReconstructsPortableState: false,
      },
      fallbackPolicy: 'reject-no-algorithm-or-platform-fallback',
    });
    expect(reference.runtime).toEqual({
      os: 'linux',
      architecture: 'x86_64',
      pythonVersion: '3.12.11',
      numpyVersion: '2.2.6',
      packageIndex: 'https://pypi.org/simple',
      containerRegistry: 'docker.io',
      containerRepository: 'library/python',
      containerTag: '3.12.11-slim-bookworm',
      containerIndexDigest: 'sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7',
      containerPlatformDigest: 'sha256:c00fc7b44d844b6da22861ec24af43968a5200eac4ec607b4725d585165d6b49',
      openmmWheelFilename: 'openmm-8.6.0-cp312-cp312-manylinux_2_34_x86_64.whl',
      openmmWheelUrl: 'https://files.pythonhosted.org/packages/f1/ac/31ad62cb2066bf3ec805534d95724572fd26c372fb6b1c2403fc4f48875f/openmm-8.6.0-cp312-cp312-manylinux_2_34_x86_64.whl',
      openmmWheelByteCount: 14428011,
      openmmWheelSha256: 'sha256:e7acafe671fe40c502623886b15a97bcc948a83a4a995da0336b7ee3ab4b0221',
      numpyWheelFilename: 'numpy-2.2.6-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl',
      numpyWheelUrl: 'https://files.pythonhosted.org/packages/8c/3d/1e1db36cfd41f895d266b103df00ca5b3cbe965184df824dec5c08c6b803/numpy-2.2.6-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl',
      numpyWheelByteCount: 16527618,
      numpyWheelSha256: 'sha256:fd83c01228a688733f1ded5201c678f0c53ecc1006ffbc404db9f7a899ac6249',
      environment: {
        PYTHONHASHSEED: '0',
        TZ: 'UTC',
        LC_ALL: 'C.UTF-8',
        OPENMM_CPU_THREADS: null,
      },
    });
    expect(cpu).toMatchObject({
      backendId: 'openmm-8.6.0-cpu-pme',
      role: 'comparison',
      engine: {
        name: 'OpenMM',
        version: '8.6.0',
        sourceCommit: 'c6173db6e8edd705eb59172bd21e9ce69c572405',
        platform: 'CPU',
        platformProperties: {
          Threads: '1',
          precision: 'platform-native-no-Precision-property',
        },
      },
      determinism: {
        scope: 'fixed-coordinate-comparison-only-no-integration',
        executionMode: 'fixed-coordinate-evaluation-only-zero-integrated-steps',
        freeTrajectoryCrossPlatformEquality: false,
        randomSeedReconstructsPortableState: false,
      },
      fallbackPolicy: 'reject-no-algorithm-or-platform-fallback',
    });
    expect(cpu.runtime).toEqual({
      ...reference.runtime,
      environment: {
        ...reference.runtime.environment,
        OPENMM_CPU_THREADS: '1',
      },
    });
    expect(reference.capabilities.maximumParticles).toBe(2685);
    expect(cpu.capabilities.maximumParticles).toBe(2685);
    expect(plan.system.backendPlan).toMatchObject({
      platformOrder: ['Reference', 'CPU'],
      fallbackPolicy: 'reject',
      sharedPortableStartStateRequired: true,
      referenceReplay: 'two-same-host-same-container-fresh-processes-exact-101-frame-digest-required',
      cpuExecution: 'five-fixed-coordinate-evaluations-only-zero-integrated-steps',
      crossPlatformComparison: 'fixed-coordinate-energy-force-only',
    });
    expect(plan.system.acceptancePlan.referenceSameHostSameContainerExactReplayRequired)
      .toBe(true);
    expect(plan.boundaries.join('\n')).toMatch(/same host and pinned container/i);
    expect(plan.boundaries.join('\n')).toMatch(/CPU performs only five fixed-coordinate evaluations/i);
  });

  it('locks minimization budgets and postconditions, two-pass velocity projection, and raw half-step velocity semantics', () => {
    const { system, backends } = createOpenMmTip3pControlPlanV044();

    expect(system.preparationPlan.minimization).toEqual({
      algorithm: 'OpenMM-LocalEnergyMinimizer-LBFGS',
      toleranceKjMolNanometer: 1,
      maximumIterationsArgument: 5000,
      iterationSemantics: 'OpenMM-maxIterations-argument-does-not-bound-total-reporter-callbacks-across-constraint-restarts',
      reporter: {
        required: true,
        api: 'OpenMM-MinimizationReporter',
        globalCallbackOrdinalRequired: true,
        iterationIndexSemantics: 'optimizer-local-index-may-reset-after-constraint-restart',
        maximumReporterCallbacks: 20000,
        maximumConstraintRestarts: 3,
        wallClockTimeoutSeconds: 1800,
        budgetExhaustionOutcome: 'incomplete-no-production-start-state',
      },
      postconditions: {
        termination: 'converged-postconditions-required-not-max-iterations-alone',
        finiteStateRequired: true,
        finalReporterObjectiveGradientRmsMaximumKjMolNanometer: 1,
        postMinimizationApplyConstraintsRequired: true,
        maximumConstraintRelativeResidual: 1e-8,
      },
    });
    expect(system.preparationPlan.velocityInitialization).toEqual({
      method: 'OpenMM-setVelocitiesToTemperature',
      temperatureKelvin: 300,
      randomSeed: 20260901,
      operationOrder: [
        'setVelocitiesToTemperature',
        'removeMassWeightedCenterOfMassVelocity',
        'applyVelocityConstraints',
      ],
      setVelocitiesToTemperatureInternalConstraintTolerance: 1e-5,
      removeMassWeightedCenterOfMassVelocity: true,
      applyVelocityConstraintsAfterCenterOfMassRemoval: true,
      explicitVelocityConstraintTolerance: 1e-8,
      centerOfMassVelocityFormula: 'norm(sum(m_i*v_i))/sum(m_i)',
      maximumCenterOfMassSpeedNanometerPerPicosecond: 1e-12,
      velocityConstraintResidualFormula: 'max(abs(dot(r_ij,v_j-v_i))/max(norm(r_ij)*norm(v_j-v_i),1e-12-nm2-ps))',
      maximumVelocityConstraintRelativeResidual: 1e-8,
      postconditionEvaluationPoint: 'after-explicit-applyVelocityConstraints',
      seedAloneIsReplayInput: false,
    });
    expect(system.dynamicsPlan).toMatchObject({
      integratedSteps: 1000,
      sampleStepSemantics: 'integrated-steps-from-portable-start-state-step-0',
      velocityReadbackSemantics: 'prepared-step-0-then-raw-OpenMM-Verlet-half-step-velocities-no-resynchronization',
    });
    expect(backends.every(
      (backend) => backend.capabilities.forceSemantics
        === 'potential-force-excluding-constraint-impulses',
    )).toBe(true);
  });

  it('pins all three primary-source assets while keeping execution, science, and license claims false', () => {
    const plan = createOpenMmTip3pControlPlanV044();
    const commit = 'c6173db6e8edd705eb59172bd21e9ce69c572405';

    expect(plan.system.inputs.sourcePins).toEqual([
      {
        id: 'openmm-8.6-licenses',
        role: 'license-notices',
        owner: 'OpenMM',
        repository: 'https://github.com/openmm/openmm',
        release: '8.6.0',
        commit,
        path: 'docs-source/licenses/Licenses.txt',
        rawUrl: `https://raw.githubusercontent.com/openmm/openmm/${commit}/docs-source/licenses/Licenses.txt`,
        byteCount: 9305,
        sha256: 'sha256:437b7168cc997abea3b5f2a9e0fb6894f96de77b9c69be428ccfcfe9bed58293',
        evidenceStatus: 'pinned-expected-input-not-bundled',
        artifactFetchReceiptDigest: null,
        redistributionCleared: false,
      },
      {
        id: 'openmm-8.6-tip3p-parameters',
        role: 'parameter-input',
        owner: 'OpenMM',
        repository: 'https://github.com/openmm/openmm',
        release: '8.6.0',
        commit,
        path: 'wrappers/python/openmm/app/data/amber14/tip3p.xml',
        rawUrl: `https://raw.githubusercontent.com/openmm/openmm/${commit}/wrappers/python/openmm/app/data/amber14/tip3p.xml`,
        byteCount: 19070,
        sha256: 'sha256:3f4b188dbcb6c02863230eaca231e927fb6bf3307ce947d8a50d0f46f6dd83d9',
        evidenceStatus: 'pinned-expected-input-not-bundled',
        artifactFetchReceiptDigest: null,
        redistributionCleared: false,
      },
      {
        id: 'openmm-8.6-tip3p-water-box',
        role: 'coordinate-input',
        owner: 'OpenMM',
        repository: 'https://github.com/openmm/openmm',
        release: '8.6.0',
        commit,
        path: 'wrappers/python/openmm/app/data/tip3p.pdb',
        rawUrl: `https://raw.githubusercontent.com/openmm/openmm/${commit}/wrappers/python/openmm/app/data/tip3p.pdb`,
        byteCount: 179998,
        sha256: 'sha256:14fd37900d627c0e258d6086a14c6084e4bec1422e9d20fccfc83c3f814fd7ee',
        evidenceStatus: 'pinned-expected-input-not-bundled',
        artifactFetchReceiptDigest: null,
        redistributionCleared: false,
      },
    ]);
    expectOnlyFalse(plan.system.evidenceSemantics);
    expectOnlyFalse(plan.system.claimBoundaries);
    for (const source of plan.system.inputs.sourcePins) {
      expect(source.redistributionCleared).toBe(false);
    }
    for (const backend of plan.backends) {
      expect(backend.evidence).toEqual({
        status: 'planned-not-executed',
        externalExecutionPerformed: false,
        pmeExecutionPerformed: false,
        actualRuntimeInventory: null,
        prepareReceiptDigest: null,
        attestationBundleDigest: null,
      });
      expectOnlyFalse(backend.claimBoundaries);
      expect(backend.license).toEqual({
        apiReferenceCpuLicense: 'MIT',
        thirdPartyNoticesRequired: true,
        parameterAssetLicenseReviewed: false,
        coordinateAssetLicenseReviewed: false,
        redistributionCleared: false,
        licenseClearance: false,
      });
    }
    expect(plan.boundaries.join('\n')).toMatch(/no OpenMM Context, PME calculation, minimization, or trajectory/i);
    expect(plan.boundaries.join('\n')).toMatch(/not equilibration, bulk-water validation/i);
    expect(plan.boundaries.join('\n')).toMatch(/do not prove execution.*redistribution rights/i);
  });

  it('round-trips the locked manifest and system canonicalizers without widening v0.4.2', () => {
    const plan = createOpenMmTip3pControlPlanV044();
    const referenceInput = withoutKey(plan.backends[0], 'manifestDigest');
    const cpuInput = withoutKey(plan.backends[1], 'manifestDigest');
    const systemInput = withoutKey(plan.system, 'systemDigest');
    systemInput.inputs.sourcePins.reverse();
    systemInput.forceModel.forceGroups = {
      nonbondedReciprocal: 3,
      nonbondedDirectAndLennardJones: 2,
      harmonicAngle: 1,
      harmonicBond: 0,
    };

    expect(canonicalizeForceBackendManifestV044(referenceInput)).toEqual(plan.backends[0]);
    expect(canonicalizeForceBackendManifestV044(cpuInput)).toEqual(plan.backends[1]);
    const canonicalSystem = canonicalizeAqueousSystemSpecV044(systemInput);
    expect(canonicalSystem).toEqual(plan.system);
    expect(canonicalSystem.systemDigest).toBe(plan.system.systemDigest);
  });

  it('makes both canonicalizers reject extra negative claims, -0, undefined, holes, and aliases', () => {
    const plan = createOpenMmTip3pControlPlanV044();

    const systemBogusClaim = withoutKey(plan.system, 'systemDigest');
    Reflect.set(systemBogusClaim.claimBoundaries, 'bogus', false);
    expect(() => canonicalizeAqueousSystemSpecV044(systemBogusClaim))
      .toThrow(/exactly the locked keys/);
    const backendBogusClaim = withoutKey(plan.backends[0], 'manifestDigest');
    Reflect.set(backendBogusClaim.claimBoundaries, 'bogus', false);
    expect(() => canonicalizeForceBackendManifestV044(backendBogusClaim))
      .toThrow(/exactly the locked keys/);

    const systemNegativeZero = withoutKey(plan.system, 'systemDigest');
    Reflect.set(systemNegativeZero.cell.vectorsNanometer[0], 'y', -0);
    expect(() => canonicalizeAqueousSystemSpecV044(systemNegativeZero))
      .toThrow(/canonical plain-data tree/);
    const backendNegativeZero = withoutKey(plan.backends[0], 'manifestDigest');
    Reflect.set(backendNegativeZero.capabilities, 'maximumParticles', -0);
    expect(() => canonicalizeForceBackendManifestV044(backendNegativeZero))
      .toThrow(/canonical plain-data tree/);

    const systemUndefined = withoutKey(plan.system, 'systemDigest');
    Reflect.set(systemUndefined, 'status', undefined);
    expect(() => canonicalizeAqueousSystemSpecV044(systemUndefined))
      .toThrow(/canonical plain-data tree/);
    const backendUndefined = withoutKey(plan.backends[0], 'manifestDigest');
    Reflect.set(backendUndefined, 'backendId', undefined);
    expect(() => canonicalizeForceBackendManifestV044(backendUndefined))
      .toThrow(/canonical plain-data tree/);

    const systemHole = withoutKey(plan.system, 'systemDigest');
    Reflect.deleteProperty(systemHole.inputs.sourcePins, 1);
    expect(() => canonicalizeAqueousSystemSpecV044(systemHole))
      .toThrow(/canonical plain-data tree/);
    const backendHole = withoutKey(plan.backends[0], 'manifestDigest');
    Reflect.set(backendHole.runtime, 'sparseProbe', Array(1));
    expect(() => canonicalizeForceBackendManifestV044(backendHole))
      .toThrow(/canonical plain-data tree/);

    const systemAlias = withoutKey(plan.system, 'systemDigest');
    systemAlias.cell.vectorsNanometer[1] = systemAlias.cell.vectorsNanometer[0];
    expect(() => canonicalizeAqueousSystemSpecV044(systemAlias))
      .toThrow(/canonical plain-data tree/);
    const backendAlias = withoutKey(plan.backends[0], 'manifestDigest');
    Reflect.set(backendAlias.runtime, 'environment', backendAlias.engine.platformProperties);
    expect(() => canonicalizeForceBackendManifestV044(backendAlias))
      .toThrow(/canonical plain-data tree/);
  });

  it.each([
    ['PME changed to a direct method', (candidate: MutablePlan) => {
      Reflect.set(candidate.system.forceModel, 'nonbondedMethod', 'DirectEwald');
    }],
    ['CPU determinism promoted to exact replay', (candidate: MutablePlan) => {
      Reflect.set(
        candidate.backends[1].determinism,
        'scope',
        'same-host-same-container-fresh-process-exact-required',
      );
      Reflect.set(candidate.system.acceptancePlan, 'cpuExactReplayRequired', true);
    }],
    ['execution evidence promoted to true', (candidate: MutablePlan) => {
      Reflect.set(candidate.backends[0].evidence, 'externalExecutionPerformed', true);
      Reflect.set(candidate.backends[0].evidence, 'pmeExecutionPerformed', true);
      Reflect.set(candidate.system.evidenceSemantics, 'externalOpenmmExecution', true);
      Reflect.set(candidate.system.evidenceSemantics, 'trajectoryExecution', true);
    }],
    ['license and redistribution claims promoted', (candidate: MutablePlan) => {
      Reflect.set(candidate.backends[0].license, 'parameterAssetLicenseReviewed', true);
      Reflect.set(candidate.backends[0].license, 'coordinateAssetLicenseReviewed', true);
      Reflect.set(candidate.backends[0].license, 'redistributionCleared', true);
      Reflect.set(candidate.backends[0].license, 'licenseClearance', true);
      Reflect.set(candidate.system.inputs.sourcePins[0], 'redistributionCleared', true);
      Reflect.set(candidate.system.claimBoundaries, 'licenseClearance', true);
    }],
    ['a pinned source digest drifts', (candidate: MutablePlan) => {
      candidate.system.inputs.sourcePins[2].sha256 = `sha256:${'0'.repeat(64)}`;
    }],
  ])('rejects %s even after every affected outer self-digest is recomputed', (_, mutate) => {
    const candidate = mutablePlan();
    mutate(candidate);
    rehashPlan(candidate);

    expect(candidate.planDigest).toBe(selfDigest(candidate, 'planDigest'));
    expect(candidate.system.systemDigest).toBe(selfDigest(candidate.system, 'systemDigest'));
    for (const backend of candidate.backends) {
      expect(backend.manifestDigest).toBe(selfDigest(backend, 'manifestDigest'));
    }
    expect(() => assertOpenMmTip3pControlPlanV044(candidate)).toThrow(/exact locked plan/);
  });

  it('rejects hostile accessors without invoking them, symbols, cycles, and non-finite values', () => {
    let getterCalls = 0;
    const accessor = mutablePlan();
    Object.defineProperty(accessor, 'status', {
      configurable: true,
      enumerable: true,
      get: () => {
        getterCalls += 1;
        return 'planned-not-executed';
      },
    });
    expect(() => assertOpenMmTip3pControlPlanV044(accessor)).toThrow(/canonical plain-data tree/);
    expect(getterCalls).toBe(0);

    const symbolic = mutablePlan() as unknown as Record<PropertyKey, unknown>;
    symbolic[Symbol('hidden-claim')] = true;
    expect(() => assertOpenMmTip3pControlPlanV044(symbolic)).toThrow(/canonical plain-data tree/);

    const cyclic = mutablePlan() as unknown as { self?: unknown };
    cyclic.self = cyclic;
    expect(() => assertOpenMmTip3pControlPlanV044(cyclic)).toThrow(/canonical plain-data tree/);

    const nonfinite = mutablePlan();
    Reflect.set(nonfinite.system.composition, 'nominalDensityKgM3', Number.NaN);
    expect(() => assertOpenMmTip3pControlPlanV044(nonfinite)).toThrow(/canonical plain-data tree/);

    const exoticArray = mutablePlan();
    const inheritedClaim = Object.create(Array.prototype) as unknown as Record<string, unknown>;
    inheritedClaim.inheritedClaim = true;
    Object.setPrototypeOf(exoticArray.boundaries, inheritedClaim);
    expect(() => assertOpenMmTip3pControlPlanV044(exoticArray))
      .toThrow(/canonical plain-data tree/);
  });

  it('creates and validates digest-bound 8055-component requests and complete force-group evaluations', () => {
    const plan = createOpenMmTip3pControlPlanV044();
    const positions = Array.from({ length: AQUEOUS_FORCE_COMPONENT_COUNT_V044 }, () => 0);
    const request = createForceEvaluationRequestV044({
      schemaVersion: 'tf.force-evaluation-request/0.4.4',
      requestId: 'shape-fixture-0001',
      platform: 'Reference',
      evaluationMode: 'fixed-coordinate-no-integration',
      integratedSteps: 0,
      systemDigest: plan.system.systemDigest,
      preparedSystemDigest: ZERO_DIGEST,
      atomOrderDigest: ZERO_DIGEST,
      cellVectorsNanometer: plan.system.cell.vectorsNanometer,
      positionArrayLayout: 'atom-major-xyz-float64-json-numbers',
      positionComponentsNanometer: positions,
      evaluationOrdinal: 0,
      requestedOutputs: [
        'total-potential-energy',
        'force-group-potential-energies',
        'per-atom-total-potential-force',
        'per-atom-potential-force-groups',
      ],
    });
    const forceComponents = {
      total: Array.from({ length: AQUEOUS_FORCE_COMPONENT_COUNT_V044 }, () => 0),
      harmonicBond: Array.from({ length: AQUEOUS_FORCE_COMPONENT_COUNT_V044 }, () => 0),
      harmonicAngle: Array.from({ length: AQUEOUS_FORCE_COMPONENT_COUNT_V044 }, () => 0),
      nonbondedDirectAndLennardJones: Array.from(
        { length: AQUEOUS_FORCE_COMPONENT_COUNT_V044 },
        () => 0,
      ),
      nonbondedReciprocal: Array.from(
        { length: AQUEOUS_FORCE_COMPONENT_COUNT_V044 },
        () => 0,
      ),
    };
    const evaluation = createForceEvaluationV044(request, {
      potentialEnergyKjMol: 0,
      potentialEnergyKjMolByGroup: {
        harmonicBond: 0,
        harmonicAngle: 0,
        nonbondedDirectAndLennardJones: 0,
        nonbondedReciprocal: 0,
      },
      forceComponentsKjMolNanometerByGroup: forceComponents,
    });

    const exactComponentCount: 8055 = AQUEOUS_FORCE_COMPONENT_COUNT_V044;
    expect(exactComponentCount).toBe(8055);
    expect(AQUEOUS_FORCE_COMPONENT_COUNT_V044).toBe(8055);
    expect(request.positionArrayLayout).toBe('atom-major-xyz-float64-json-numbers');
    expect(request.positionComponentsNanometer).toHaveLength(8055);
    expect(request.requestedOutputs).toEqual([
      'total-potential-energy',
      'force-group-potential-energies',
      'per-atom-total-potential-force',
      'per-atom-potential-force-groups',
    ]);
    expect(Object.keys(evaluation.potentialEnergyKjMolByGroup)).toEqual([
      'harmonicBond',
      'harmonicAngle',
      'nonbondedDirectAndLennardJones',
      'nonbondedReciprocal',
    ]);
    expect(Object.keys(evaluation.forceComponentsKjMolNanometerByGroup)).toEqual([
      'total',
      'harmonicBond',
      'harmonicAngle',
      'nonbondedDirectAndLennardJones',
      'nonbondedReciprocal',
    ]);
    for (const components of Object.values(
      evaluation.forceComponentsKjMolNanometerByGroup,
    )) expect(components).toHaveLength(8055);
    expect(evaluation.forceComponentCountPerGroup).toBe(8055);
    expect(evaluation.forceArrayLayout).toBe('atom-major-xyz-float64-json-numbers');
    expect(evaluation.forceSemantics).toBe(
      'potential-force-excluding-constraint-impulses',
    );
    expect(evaluation.platform).toBe('Reference');
    expect(evaluation.evaluationMode).toBe('fixed-coordinate-no-integration');
    expect(evaluation.integratedSteps).toBe(0);
    expect(evaluation.particleCount).toBe(2685);
    expect(() => assertForceEvaluationRequestV044(request)).not.toThrow();
    expect(() => assertForceEvaluationV044(evaluation, request)).not.toThrow();
    expectRecursivelyFrozen(request);
    expectRecursivelyFrozen(evaluation);
  });

  it('rejects truncated, non-finite, stale-digest, cross-request, and non-closing force envelopes', () => {
    const request = forceRequestFixture();
    const evaluation = forceEvaluationFixture(request);

    const truncatedRequest = structuredClone(request) as DeepMutable<ForceEvaluationRequestV044>;
    truncatedRequest.positionComponentsNanometer.pop();
    expect(() => assertForceEvaluationRequestV044(truncatedRequest)).toThrow(/exactly 8055/);

    const nonfiniteRequest = structuredClone(request) as DeepMutable<ForceEvaluationRequestV044>;
    nonfiniteRequest.positionComponentsNanometer[0] = Number.POSITIVE_INFINITY;
    expect(() => assertForceEvaluationRequestV044(nonfiniteRequest))
      .toThrow(/canonical plain-data tree/);

    const stalePositionDigest = structuredClone(request) as DeepMutable<ForceEvaluationRequestV044>;
    stalePositionDigest.positionComponentsNanometer[0] = 1;
    expect(() => assertForceEvaluationRequestV044(stalePositionDigest))
      .toThrow(/positionArrayDigest is stale/);

    const truncatedForces = structuredClone(evaluation) as DeepMutable<ForceEvaluationV044>;
    truncatedForces.forceComponentsKjMolNanometerByGroup.total.pop();
    expect(() => assertForceEvaluationV044(truncatedForces, request)).toThrow(/exactly 8055/);

    const staleForceDigest = structuredClone(evaluation) as DeepMutable<ForceEvaluationV044>;
    staleForceDigest.forceComponentsKjMolNanometerByGroup.total[0] = 1;
    expect(() => assertForceEvaluationV044(staleForceDigest, request))
      .toThrow(/component digest is stale/);

    const crossRequest = forceRequestFixture(1);
    expect(() => assertForceEvaluationV044(evaluation, crossRequest))
      .toThrow(/requestDigest differs from its request/);

    const nonClosing = forceEvaluationFixture(request);
    const rehashed = structuredClone(nonClosing) as DeepMutable<ForceEvaluationV044>;
    rehashed.potentialEnergyKjMol = 1;
    rehashed.evaluationDigest = selfDigest(rehashed, 'evaluationDigest');
    expect(() => assertForceEvaluationV044(rehashed, request)).toThrow(/energy groups do not close/);
  });

  it('uses separate energy closure plus Reference-relative and CPU-binary32-ULP force criteria', () => {
    const referenceRequest = forceRequestFixture(0, 'Reference');
    const cpuRequest = forceRequestFixture(0, 'CPU');
    const values = (totalFirst: number, directFirst: number) => {
      const zeroComponents = () => Array.from(
        { length: AQUEOUS_FORCE_COMPONENT_COUNT_V044 },
        () => 0,
      );
      const total = zeroComponents();
      const direct = zeroComponents();
      total[0] = totalFirst;
      direct[0] = directFirst;
      return {
        potentialEnergyKjMol: 0,
        potentialEnergyKjMolByGroup: {
          harmonicBond: 0,
          harmonicAngle: 0,
          nonbondedDirectAndLennardJones: 0,
          nonbondedReciprocal: 0,
        },
        forceComponentsKjMolNanometerByGroup: {
          total,
          harmonicBond: zeroComponents(),
          harmonicAngle: zeroComponents(),
          nonbondedDirectAndLennardJones: direct,
          nonbondedReciprocal: zeroComponents(),
        },
      };
    };

    expect(() => createForceEvaluationV044(referenceRequest, values(1.00000002, 1)))
      .toThrow(/Reference force groups.*1e-8/);
    expect(() => createForceEvaluationV044(referenceRequest, values(1e40, 1e40)))
      .not.toThrow();
    expect(() => createForceEvaluationV044(cpuRequest, values(1e40, 1e40)))
      .toThrow(/finite binary32 components/);
    expect(() => createForceEvaluationV044(cpuRequest, values(1.000000238418579, 1)))
      .not.toThrow();
    expect(() => createForceEvaluationV044(cpuRequest, values(1.0000003576278687, 1)))
      .toThrow(/two binary32 ULPs/);

    const energyDoesNotClose = values(0, 0);
    energyDoesNotClose.potentialEnergyKjMol = 1;
    expect(() => createForceEvaluationV044(cpuRequest, energyDoesNotClose))
      .toThrow(/energy groups.*separate relative tolerance/);
  });

  it('rejects force integration and nonzero rigid TIP3P group-0 or group-1 terms', () => {
    const request = forceRequestFixture();
    const integrated = structuredClone(request) as DeepMutable<ForceEvaluationRequestV044>;
    integrated.integratedSteps = 1 as never;
    expect(() => assertForceEvaluationRequestV044(integrated))
      .toThrow(/fixed-coordinate and integrate zero steps/);

    const zeroTermViolation = forceEvaluationFixture(request);
    const rehashed = structuredClone(zeroTermViolation) as DeepMutable<ForceEvaluationV044>;
    rehashed.potentialEnergyKjMol = 1;
    rehashed.potentialEnergyKjMolByGroup.harmonicBond = 1;
    rehashed.evaluationDigest = selfDigest(rehashed, 'evaluationDigest');
    expect(() => assertForceEvaluationV044(rehashed, request))
      .toThrow(/groups 0 and 1 must have zero energy terms/);
  });

  it('does not change the locked v0.4.2 topology and executable-world configuration digests', () => {
    const contract = createAqueousContractFixture();
    const dynamics = createNaClTip3pFiniteSizeCalibrationWorldV042().serialize();

    expect(contract.topology.topologyDigest).toBe(EXPECTED_DIGESTS.v042ContractTopology);
    expect(dynamics.topologyDigest).toBe(EXPECTED_DIGESTS.v042DynamicsTopology);
    expect(dynamics.configurationDigest).toBe(EXPECTED_DIGESTS.v042DynamicsConfiguration);
    expect(dynamics.configuration.topologyDigest).toBe(EXPECTED_DIGESTS.v042DynamicsTopology);
  });
});

type DeepMutable<Value> = Value extends readonly [unknown, ...unknown[]]
  ? { -readonly [Key in keyof Value]: DeepMutable<Value[Key]> }
  : Value extends ReadonlyArray<infer Entry>
    ? DeepMutable<Entry>[]
  : Value extends object
    ? { -readonly [Key in keyof Value]: DeepMutable<Value[Key]> }
    : Value;

function mutablePlan(): MutablePlan {
  return structuredClone(createOpenMmTip3pControlPlanV044()) as MutablePlan;
}

function forceRequestFixture(
  evaluationOrdinal = 0,
  platform: 'Reference' | 'CPU' = 'Reference',
) {
  const plan = createOpenMmTip3pControlPlanV044();
  return createForceEvaluationRequestV044({
    schemaVersion: 'tf.force-evaluation-request/0.4.4',
    requestId: `force-fixture-${evaluationOrdinal}`,
    platform,
    evaluationMode: 'fixed-coordinate-no-integration',
    integratedSteps: 0,
    systemDigest: plan.system.systemDigest,
    preparedSystemDigest: ZERO_DIGEST,
    atomOrderDigest: ZERO_DIGEST,
    cellVectorsNanometer: plan.system.cell.vectorsNanometer,
    positionArrayLayout: 'atom-major-xyz-float64-json-numbers',
    positionComponentsNanometer: Array.from(
      { length: AQUEOUS_FORCE_COMPONENT_COUNT_V044 },
      () => 0,
    ),
    evaluationOrdinal,
    requestedOutputs: [
      'total-potential-energy',
      'force-group-potential-energies',
      'per-atom-total-potential-force',
      'per-atom-potential-force-groups',
    ],
  });
}

function forceEvaluationFixture(request = forceRequestFixture()) {
  const zeroComponents = () => Array.from(
    { length: AQUEOUS_FORCE_COMPONENT_COUNT_V044 },
    () => 0,
  );
  return createForceEvaluationV044(request, {
    potentialEnergyKjMol: 0,
    potentialEnergyKjMolByGroup: {
      harmonicBond: 0,
      harmonicAngle: 0,
      nonbondedDirectAndLennardJones: 0,
      nonbondedReciprocal: 0,
    },
    forceComponentsKjMolNanometerByGroup: {
      total: zeroComponents(),
      harmonicBond: zeroComponents(),
      harmonicAngle: zeroComponents(),
      nonbondedDirectAndLennardJones: zeroComponents(),
      nonbondedReciprocal: zeroComponents(),
    },
  });
}

function withoutKey<Value extends object, Key extends keyof Value>(
  value: Value,
  key: Key,
): DeepMutable<Omit<Value, Key>> {
  const clone = structuredClone(value) as unknown as Record<PropertyKey, unknown>;
  Reflect.deleteProperty(clone, key);
  return clone as DeepMutable<Omit<Value, Key>>;
}

function selfDigest<Value extends object, Key extends keyof Value>(value: Value, key: Key) {
  return digestValue(withoutKey(value, key));
}

function expectSelfDigest<Value extends object, Key extends keyof Value>(value: Value, key: Key) {
  expect(value[key]).toBe(selfDigest(value, key));
}

function rehashPlan(candidate: MutablePlan) {
  for (const backend of candidate.backends) {
    backend.manifestDigest = selfDigest(backend, 'manifestDigest');
  }
  candidate.system.backendPlan.canonicalManifestDigest = candidate.backends[0].manifestDigest;
  candidate.system.backendPlan.comparisonManifestDigest = candidate.backends[1].manifestDigest;
  candidate.system.cell.cellDigest = selfDigest(candidate.system.cell, 'cellDigest');
  candidate.system.systemDigest = selfDigest(candidate.system, 'systemDigest');
  candidate.planDigest = selfDigest(candidate, 'planDigest');
}

function expectOnlyFalse(value: object) {
  const entries = Object.entries(value);
  expect(entries.length).toBeGreaterThan(0);
  for (const [name, flag] of entries) expect(flag, name).toBe(false);
}

function expectRecursivelyFrozen(value: unknown) {
  if (!value || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value as Record<string, unknown>)) {
    expectRecursivelyFrozen(child);
  }
}
