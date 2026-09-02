import { digestValue } from './digest.ts';

type Vector3Nanometer = Readonly<{ x: number; y: number; z: number }>;
type CellVectorsNanometer3 = readonly [
  Vector3Nanometer,
  Vector3Nanometer,
  Vector3Nanometer,
];

/**
 * v0.4.4 is a declarative seam between a physical system and a force backend.
 * It deliberately does not widen or parameterize the executable v0.4.2 world.
 * No function in this module executes OpenMM, PME, minimization, or dynamics.
 */

export const AQUEOUS_SYSTEM_SPEC_VERSION_V044 = 'tf.aqueous-system-spec/0.4.4' as const;
export const FORCE_BACKEND_MANIFEST_VERSION_V044 = 'tf.force-backend-manifest/0.4.4' as const;
export const OPENMM_TIP3P_CONTROL_PLAN_VERSION_V044 = 'tf.openmm-tip3p-control-plan/0.4.4' as const;

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const STABLE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const OPENMM_COMMIT = 'c6173db6e8edd705eb59172bd21e9ce69c572405' as const;
const OPENMM_RELEASE = '8.6.0' as const;
const WATER_COUNT = 895 as const;
const PARTICLE_COUNT = 2685 as const;
const WATER_MASS_DALTON = 18.015324 as const;
const TOTAL_MASS_DALTON = 16123.71498 as const;
const CELL_EDGE_NANOMETER = 3 as const;
const CELL_VOLUME_NANOMETER3 = 27 as const;
const NOMINAL_DENSITY_KG_M3 = 991.6318008523569 as const;
const DALTON_PER_NANOMETER3_TO_KG_PER_METER3 = 1.6605390666;
const NUMERIC_CLOSURE_TOLERANCE = 1e-9;
const CONTAINER_INDEX_DIGEST = 'sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7' as const;
const CONTAINER_PLATFORM_DIGEST = 'sha256:c00fc7b44d844b6da22861ec24af43968a5200eac4ec607b4725d585165d6b49' as const;
const OPENMM_WHEEL_DIGEST = 'sha256:e7acafe671fe40c502623886b15a97bcc948a83a4a995da0336b7ee3ab4b0221' as const;
const NUMPY_WHEEL_DIGEST = 'sha256:fd83c01228a688733f1ded5201c678f0c53ecc1006ffbc404db9f7a899ac6249' as const;
const OPENMM_WHEEL_URL = 'https://files.pythonhosted.org/packages/f1/ac/31ad62cb2066bf3ec805534d95724572fd26c372fb6b1c2403fc4f48875f/openmm-8.6.0-cp312-cp312-manylinux_2_34_x86_64.whl' as const;
const NUMPY_WHEEL_FILENAME = 'numpy-2.2.6-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl' as const;
const NUMPY_WHEEL_URL = 'https://files.pythonhosted.org/packages/8c/3d/1e1db36cfd41f895d266b103df00ca5b3cbe965184df824dec5c08c6b803/numpy-2.2.6-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl' as const;
export const AQUEOUS_FORCE_COMPONENT_COUNT_V044 = 8055 as const;

export type AqueousSourcePinV044 = Readonly<{
  id: string;
  role: 'coordinate-input' | 'parameter-input' | 'license-notices';
  owner: 'OpenMM';
  repository: 'https://github.com/openmm/openmm';
  release: '8.6.0';
  commit: typeof OPENMM_COMMIT;
  path: string;
  rawUrl: string;
  byteCount: number;
  sha256: string;
  evidenceStatus: 'pinned-expected-input-not-bundled';
  artifactFetchReceiptDigest: null;
  redistributionCleared: false;
}>;

export type ForceBackendManifestV044 = Readonly<{
  schemaVersion: typeof FORCE_BACKEND_MANIFEST_VERSION_V044;
  backendId: string;
  manifestDigest: string;
  role: 'canonical' | 'comparison';
  engine: Readonly<{
    name: 'OpenMM';
    version: '8.6.0';
    sourceCommit: typeof OPENMM_COMMIT;
    platform: 'Reference' | 'CPU';
    platformProperties: Readonly<{
      Threads: null | '1';
      precision: 'platform-native-no-Precision-property';
    }>;
  }>;
  runtime: Readonly<{
    os: 'linux';
    architecture: 'x86_64';
    pythonVersion: '3.12.11';
    numpyVersion: '2.2.6';
    packageIndex: 'https://pypi.org/simple';
    containerRegistry: 'docker.io';
    containerRepository: 'library/python';
    containerTag: '3.12.11-slim-bookworm';
    containerIndexDigest: string;
    containerPlatformDigest: string;
    openmmWheelFilename: 'openmm-8.6.0-cp312-cp312-manylinux_2_34_x86_64.whl';
    openmmWheelUrl: typeof OPENMM_WHEEL_URL;
    openmmWheelByteCount: 14428011;
    openmmWheelSha256: string;
    numpyWheelFilename: typeof NUMPY_WHEEL_FILENAME;
    numpyWheelUrl: typeof NUMPY_WHEEL_URL;
    numpyWheelByteCount: 16527618;
    numpyWheelSha256: string;
    environment: Readonly<{
      PYTHONHASHSEED: '0';
      TZ: 'UTC';
      LC_ALL: 'C.UTF-8';
      OPENMM_CPU_THREADS: null | '1';
    }>;
  }>;
  capabilities: Readonly<{
    cell: 'triclinic-3d-periodic';
    maximumParticles: number;
    potentialEnergy: true;
    atomicForces: true;
    forceSemantics: 'potential-force-excluding-constraint-impulses';
    velocities: true;
    pme: true;
    constraints: true;
    completeVirial: false;
    pressure: false;
    stress: false;
    electronicDensity: false;
  }>;
  determinism: Readonly<{
    scope:
      | 'same-host-same-container-fresh-process-exact-required'
      | 'fixed-coordinate-comparison-only-no-integration';
    executionMode:
      | 'canonical-reference-trajectory-and-fixed-coordinate-evaluation'
      | 'fixed-coordinate-evaluation-only-zero-integrated-steps';
    freeTrajectoryCrossPlatformEquality: false;
    randomSeedReconstructsPortableState: false;
  }>;
  fallbackPolicy: 'reject-no-algorithm-or-platform-fallback';
  evidence: Readonly<{
    status: 'planned-not-executed';
    externalExecutionPerformed: false;
    pmeExecutionPerformed: false;
    actualRuntimeInventory: null;
    prepareReceiptDigest: null;
    attestationBundleDigest: null;
  }>;
  license: Readonly<{
    apiReferenceCpuLicense: 'MIT';
    thirdPartyNoticesRequired: true;
    parameterAssetLicenseReviewed: false;
    coordinateAssetLicenseReviewed: false;
    redistributionCleared: false;
    licenseClearance: false;
  }>;
  claimBoundaries: Readonly<{
    locallyExecuted: false;
    openmmReproduced: false;
    bulkWaterValidated: false;
    interfaceSimulated: false;
    industrialPrediction: false;
    scorePromotionEligible: false;
  }>;
}>;

export type AqueousSystemSpecV044 = Readonly<{
  schemaVersion: typeof AQUEOUS_SYSTEM_SPEC_VERSION_V044;
  systemId: 'openmm-8.6-tip3p-895-water-pme-control';
  systemDigest: string;
  status: 'declarative-system-spec-not-execution';
  identity: Readonly<{
    scientificRole: 'cold-start-periodic-pure-water-engine-control-candidate';
    chemistry: 'rigid-tip3p-water';
    parameterFamilyId: 'openmm-amber14-tip3p-joung-cheatham-explicit-solvent';
    parameterBytesEqualToCurrent851Receipt: true;
    parameterByteEqualityImpliesExecution: false;
  }>;
  composition: Readonly<{
    waterMoleculeCount: number;
    sodiumIonCount: 0;
    chlorideIonCount: 0;
    residueCount: number;
    particleCount: number;
    topologyBondCount: number;
    rigidDistanceConstraintCount: number;
    intramolecularNonbondedExceptionCount: number;
    totalMassDalton: number;
    totalChargeE: 0;
    nominalDensityKgM3: number;
  }>;
  cell: Readonly<{
    kind: 'orthorhombic-periodic-cell';
    vectorsNanometer: CellVectorsNanometer3;
    volumeNanometer3: number;
    periodicAxes: readonly [true, true, true];
    originGauge: 'pdb-cryst1-origin-omitted-as-nonphysical';
    cellDigest: string;
  }>;
  inputs: Readonly<{
    sourcePins: ReadonlyArray<AqueousSourcePinV044>;
    authoritativeAtomOrder: 'pdb-record-order';
    coordinatePolicy: 'raw-pdb-coordinates-no-prewrap-or-reorder';
    expectedResidueName: 'HOH';
    expectedSiteOrderPerResidue: readonly ['O', 'H1', 'H2'];
    expectedRigidWaterGeometryNanometer: Readonly<{
      oxygenHydrogen: 0.09572;
      hydrogenHydrogen: 0.15139006545247014;
    }>;
    topologyCompilation: 'openmm-pdb-and-forcefield-loader-required';
    compiledTopologyDigest: null;
    serializedSystemDigest: null;
  }>;
  forceModel: Readonly<{
    nonbondedMethod: 'PME';
    cutoffNanometer: 1;
    constraints: 'HBonds';
    rigidWater: true;
    flexibleConstraints: false;
    removeCenterOfMassMotion: false;
    switchingFunction: false;
    switchDistanceNanometer: null;
    dispersionCorrection: true;
    ljpme: false;
    exceptionsUsePeriodicBoundaryConditions: false;
    pme: Readonly<{
      parameterApplicationMode: 'explicit-setPMEParameters-with-nonzero-alpha';
      designErrorTolerance: 0.0001;
      designErrorToleranceUsedByEngine: false;
      requestedAlphaInverseNanometer: 2.918423065872431;
      requestedGrid: readonly [90, 90, 90];
      contextReadbackRequiredForEachLane: true;
      contextValuesMayDifferFromRequestDueToPlatformRestrictions: true;
      sameLaneFreshProcessReadbacksMustMatch: true;
      cpuWarmupBeforeContextReadbackRequired: true;
      cpuWarmupOperation: 'getState-getEnergy-true-after-setPositions';
    }>;
    forceGroups: Readonly<{
      harmonicBond: 0;
      harmonicAngle: 1;
      nonbondedDirectAndLennardJones: 2;
      nonbondedReciprocal: 3;
    }>;
    zeroTermForceGroups: readonly [0, 1];
  }>;
  preparationPlan: Readonly<{
    canonicalPlatform: 'Reference';
    constraintTolerance: 1e-8;
    minimization: Readonly<{
      algorithm: 'OpenMM-LocalEnergyMinimizer-LBFGS';
      toleranceKjMolNanometer: 1;
      maximumIterationsArgument: 5000;
      iterationSemantics: 'OpenMM-maxIterations-argument-does-not-bound-total-reporter-callbacks-across-constraint-restarts';
      reporter: Readonly<{
        required: true;
        api: 'OpenMM-MinimizationReporter';
        globalCallbackOrdinalRequired: true;
        iterationIndexSemantics: 'optimizer-local-index-may-reset-after-constraint-restart';
        maximumReporterCallbacks: 20000;
        maximumConstraintRestarts: 3;
        wallClockTimeoutSeconds: 1800;
        budgetExhaustionOutcome: 'incomplete-no-production-start-state';
      }>;
      postconditions: Readonly<{
        termination: 'converged-postconditions-required-not-max-iterations-alone';
        finiteStateRequired: true;
        finalReporterObjectiveGradientRmsMaximumKjMolNanometer: 1;
        postMinimizationApplyConstraintsRequired: true;
        maximumConstraintRelativeResidual: 1e-8;
      }>;
    }>;
    velocityInitialization: Readonly<{
      method: 'OpenMM-setVelocitiesToTemperature';
      temperatureKelvin: 300;
      randomSeed: 20260901;
      operationOrder: readonly [
        'setVelocitiesToTemperature',
        'removeMassWeightedCenterOfMassVelocity',
        'applyVelocityConstraints',
      ];
      setVelocitiesToTemperatureInternalConstraintTolerance: 1e-5;
      removeMassWeightedCenterOfMassVelocity: true;
      applyVelocityConstraintsAfterCenterOfMassRemoval: true;
      explicitVelocityConstraintTolerance: 1e-8;
      centerOfMassVelocityFormula: 'norm(sum(m_i*v_i))/sum(m_i)';
      maximumCenterOfMassSpeedNanometerPerPicosecond: 1e-12;
      velocityConstraintResidualFormula: 'max(abs(dot(r_ij,v_j-v_i))/max(norm(r_ij)*norm(v_j-v_i),1e-12-nm2-ps))';
      maximumVelocityConstraintRelativeResidual: 1e-8;
      postconditionEvaluationPoint: 'after-explicit-applyVelocityConstraints';
      seedAloneIsReplayInput: false;
    }>;
    portableProductionStartStateRequired: true;
    productionStartStateDigest: null;
    repairPolicy: 'external-prepare-receipt-required-no-silent-local-repair';
  }>;
  dynamicsPlan: Readonly<{
    evidenceStatus: 'planned-not-executed';
    ensemble: 'NVE';
    integrator: 'OpenMM-VerletIntegrator';
    fixedTimeStepPicoseconds: 0.001;
    constraintTolerance: 1e-8;
    thermostat: null;
    barostat: null;
    fixedCell: true;
    integratedSteps: 1000;
    sampleStepSemantics: 'integrated-steps-from-portable-start-state-step-0';
    sampleStrideSteps: 10;
    expectedSampleCount: 101;
    finalTimePicoseconds: 1;
    velocityReadbackSemantics: 'prepared-step-0-then-raw-OpenMM-Verlet-half-step-velocities-no-resynchronization';
  }>;
  backendPlan: Readonly<{
    canonicalManifestDigest: string;
    comparisonManifestDigest: string;
    platformOrder: readonly ['Reference', 'CPU'];
    fallbackPolicy: 'reject';
    sharedPortableStartStateRequired: true;
    referenceReplay: 'two-same-host-same-container-fresh-processes-exact-101-frame-digest-required';
    cpuExecution: 'five-fixed-coordinate-evaluations-only-zero-integrated-steps';
    crossPlatformComparison: 'fixed-coordinate-energy-force-only';
  }>;
  acceptancePlan: Readonly<{
    maximumRelativeEnergyExcursion: 0.001;
    maximumConstraintRelativeResidual: 0.000001;
    maximumRelativePotentialEnergyDifference: 0.00001;
    maximumMedianPerParticleRelativeForceError: 0.0001;
    maximumGlobalRelativeForceL2Error: 0.0001;
    forceGroupEnergySumMustClose: true;
    forceGroupForceSumMustClose: true;
    referenceSameHostSameContainerExactReplayRequired: true;
    cpuExactReplayRequired: false;
    freeTrajectoryCrossPlatformEqualityRequired: false;
    metricDefinitions: Readonly<{
      energyExcursion: Readonly<{
        lane: 'Reference';
        sampleDomain: 'all-101-authoritative-samples';
        energyQuantity: 'potential-plus-kinetic-energy-kj-mol';
        formula: 'max(abs(totalEnergy_i-totalEnergy_0))/max(abs(totalEnergy_0),1-kj-mol)';
        denominatorFloorKjMol: 1;
      }>;
      constraintRelativeResidual: Readonly<{
        lane: 'Reference';
        sampleDomain: 'all-101-authoritative-samples-and-all-rigid-water-constraints';
        distanceGauge: 'minimum-image-distance-from-authoritative-periodic-cell';
        formula: 'max(abs(actualDistance-targetDistance)/targetDistance)';
      }>;
      cpuReferenceForceComparison: Readonly<{
        coordinateSteps: readonly [0, 10, 100, 500, 1000];
        coordinateIdentity: 'same-physical-coordinate-digest-atom-order-and-lane-prepare-receipts';
        particleDomain: 'all-2685-particles';
        vectorNorm: 'euclidean-l2';
        perParticleFormula: 'norm(cpu-reference)/max(norm(reference),1e-12-kj-mol-nm)';
        globalFormula: 'sqrt(sum(norm(cpu-reference)^2))/max(sqrt(sum(norm(reference)^2)),1e-12-kj-mol-nm)';
        denominatorFloorKjMolNanometer: 1e-12;
        medianConvention: 'sorted-middle-or-mean-of-two-middle-values';
        medianAggregation: 'maximum-of-per-step-particle-medians';
        globalAggregation: 'maximum-over-coordinate-steps';
      }>;
      cpuReferencePotentialEnergyComparison: Readonly<{
        coordinateSteps: readonly [0, 10, 100, 500, 1000];
        coordinateIdentity: 'same-physical-coordinate-digest-atom-order-and-lane-prepare-receipts';
        energyQuantity: 'potential-energy-kj-mol';
        perStepFormula: 'abs(cpu-reference)/max(abs(reference),1-kj-mol)';
        denominatorFloorKjMol: 1;
        aggregation: 'maximum-over-coordinate-steps';
      }>;
      forceGroupEnergyClosure: Readonly<{
        lanes: readonly ['Reference', 'CPU'];
        coordinateSteps: readonly [0, 10, 100, 500, 1000];
        coordinateIdentity: 'each-result-bound-to-lane-prepare-receipt-and-shared-physical-coordinate-digest';
        groups: readonly [0, 1, 2, 3];
        formula: 'abs(total-sum(groups))/max(abs(total),1-kj-mol)';
        sumOrder: 'ascending-force-group-0-1-2-3';
        aggregation: 'maximum-over-two-lanes-five-steps';
        maximumRelativeResidual: 1e-8;
      }>;
      forceGroupForceClosure: Readonly<{
        lanes: readonly ['Reference', 'CPU'];
        coordinateSteps: readonly [0, 10, 100, 500, 1000];
        coordinateIdentity: 'each-result-bound-to-lane-prepare-receipt-and-shared-physical-coordinate-digest';
        groups: readonly [0, 1, 2, 3];
        zeroTermGroups: readonly [0, 1];
        sumOrder: 'ascending-force-group-0-1-2-3';
        referenceCriterion: Readonly<{
          componentArithmetic: 'binary64-left-associated';
          formula: 'max-component-abs(total-sum(groups))/max(max-component-abs(total),1-kj-mol-nm)';
          maximumRelativeResidual: 1e-8;
        }>;
        cpuCriterion: Readonly<{
          componentArithmetic: 'round-each-input-and-left-associated-sum-to-ieee754-binary32';
          formula: 'max-ulp-distance(float32(total),float32-left-associated-sum(groups))';
          maximumUlpDistance: 2;
        }>;
      }>;
    }>;
  }>;
  evidenceSemantics: Readonly<{
    localTypeScriptDirectEwaldExecution: false;
    externalOpenmmExecution: false;
    externalPmeExecution: false;
    minimizationExecution: false;
    trajectoryExecution: false;
    selfDigestAuthenticityProof: false;
    protectedMainArtifact: false;
  }>;
  claimBoundaries: Readonly<{
    coldStartEngineControlProduced: false;
    equilibratedBulkWater: false;
    bulkWaterValidated: false;
    densityConverged: false;
    rdfOrDiffusionComputed: false;
    lowSaltValidated: false;
    naclInterfaceSimulated: false;
    dissolutionOrCrystallizationClaim: false;
    electronicStructureComputed: false;
    industrialPrediction: false;
    licenseClearance: false;
    scorePromotionEligible: false;
  }>;
}>;

export type OpenMmTip3pControlPlanV044 = Readonly<{
  schemaVersion: typeof OPENMM_TIP3P_CONTROL_PLAN_VERSION_V044;
  artifactId: 'tf.openmm-pure-water-cold-start-pme-control/1';
  status: 'planned-not-executed';
  system: AqueousSystemSpecV044;
  backends: readonly [ForceBackendManifestV044, ForceBackendManifestV044];
  boundaries: ReadonlyArray<string>;
  planDigest: string;
}>;

export interface ForceBackendV044 {
  readonly manifest: ForceBackendManifestV044;
  prepare(
    system: AqueousSystemSpecV044,
    signal?: AbortSignal,
  ): Promise<PreparedForceSystemV044>;
}

export interface PreparedForceSystemV044 {
  readonly receipt: ForceBackendPrepareReceiptV044;
  evaluate(request: ForceEvaluationRequestV044, signal?: AbortSignal): Promise<ForceEvaluationV044>;
  close(): Promise<void>;
}

export type ForceBackendPrepareReceiptV044 = Readonly<{
  schemaVersion: 'tf.force-backend-prepare-receipt/0.4.4';
  systemDigest: string;
  backendManifestDigest: string;
  compiledTopologyDigest: string;
  serializedSystemDigest: string;
  atomOrderDigest: string;
  runtimeInventoryScope: 'cpu-model-flags-microcode-kernel-glibc-loaded-libraries-openmm-plugins-platform-properties';
  runtimeInventoryDigest: string;
  portableProductionStartStateDigest: string;
  actualPmeContextParameters: Readonly<{
    platform: 'Reference' | 'CPU';
    alphaInverseNanometer: number;
    grid: readonly [number, number, number];
    warmupBeforeReadback: true;
    warmupOperation: 'getState-getEnergy-true-after-setPositions';
    readbackSource: 'OpenMM-NonbondedForce-getPMEParametersInContext';
    readbackDigest: string;
  }>;
  preparedSystemDigest: string;
  prepareReceiptDigest: string;
}>;

export type ForceEvaluationRequestV044 = Readonly<{
  schemaVersion: 'tf.force-evaluation-request/0.4.4';
  requestId: string;
  platform: 'Reference' | 'CPU';
  evaluationMode: 'fixed-coordinate-no-integration';
  integratedSteps: 0;
  systemDigest: string;
  preparedSystemDigest: string;
  physicalCoordinateDigest: string;
  atomOrderDigest: string;
  cellVectorsNanometer: CellVectorsNanometer3;
  positionArrayLayout: 'atom-major-xyz-float64-json-numbers';
  positionComponentsNanometer: ReadonlyArray<number>;
  positionComponentCount: typeof AQUEOUS_FORCE_COMPONENT_COUNT_V044;
  positionArrayDigest: string;
  evaluationOrdinal: number;
  requestedOutputs: readonly [
    'total-potential-energy',
    'force-group-potential-energies',
    'per-atom-total-potential-force',
    'per-atom-potential-force-groups',
  ];
  requestDigest: string;
}>;

export type ForceGroupComponentsV044 = Readonly<{
  total: ReadonlyArray<number>;
  harmonicBond: ReadonlyArray<number>;
  harmonicAngle: ReadonlyArray<number>;
  nonbondedDirectAndLennardJones: ReadonlyArray<number>;
  nonbondedReciprocal: ReadonlyArray<number>;
}>;

type ForceGroupDigestsV044 = Readonly<{
  total: string;
  harmonicBond: string;
  harmonicAngle: string;
  nonbondedDirectAndLennardJones: string;
  nonbondedReciprocal: string;
}>;

export type ForceEvaluationV044 = Readonly<{
  schemaVersion: 'tf.force-evaluation/0.4.4';
  requestDigest: string;
  platform: 'Reference' | 'CPU';
  evaluationMode: 'fixed-coordinate-no-integration';
  integratedSteps: 0;
  preparedSystemDigest: string;
  systemDigest: string;
  physicalCoordinateDigest: string;
  atomOrderDigest: string;
  evaluationOrdinal: number;
  potentialEnergyKjMol: number;
  potentialEnergyKjMolByGroup: Readonly<{
    harmonicBond: number;
    harmonicAngle: number;
    nonbondedDirectAndLennardJones: number;
    nonbondedReciprocal: number;
  }>;
  forceArrayLayout: 'atom-major-xyz-float64-json-numbers';
  forceSemantics: 'potential-force-excluding-constraint-impulses';
  forceComponentsKjMolNanometerByGroup: ForceGroupComponentsV044;
  forceComponentDigestsByGroup: ForceGroupDigestsV044;
  forceComponentCountPerGroup: typeof AQUEOUS_FORCE_COMPONENT_COUNT_V044;
  particleCount: typeof PARTICLE_COUNT;
  completeVirialKjMol: null;
  pressureBar: null;
  stressKjMolNanometer3: null;
  evaluationDigest: string;
}>;

export type ForceEvaluationRequestInputV044 = Readonly<Omit<
  ForceEvaluationRequestV044,
  'physicalCoordinateDigest' | 'positionComponentCount' | 'positionArrayDigest' | 'requestDigest'
>>;

export type ForceEvaluationValuesV044 = Readonly<{
  potentialEnergyKjMol: number;
  potentialEnergyKjMolByGroup: ForceEvaluationV044['potentialEnergyKjMolByGroup'];
  forceComponentsKjMolNanometerByGroup: ForceGroupComponentsV044;
}>;

const FORCE_ARRAY_LAYOUT_V044 = 'atom-major-xyz-float64-json-numbers' as const;
const FORCE_GROUP_KEYS_V044 = Object.freeze([
  'total',
  'harmonicBond',
  'harmonicAngle',
  'nonbondedDirectAndLennardJones',
  'nonbondedReciprocal',
] as const);
const POTENTIAL_ENERGY_GROUP_KEYS_V044 = Object.freeze([
  'harmonicBond',
  'harmonicAngle',
  'nonbondedDirectAndLennardJones',
  'nonbondedReciprocal',
] as const);
const REQUESTED_FORCE_OUTPUTS_V044 = Object.freeze([
  'total-potential-energy',
  'force-group-potential-energies',
  'per-atom-total-potential-force',
  'per-atom-potential-force-groups',
] as const);

/**
 * Creates only a canonical request envelope. It does not execute a backend.
 * All coordinate components are present in the envelope and bound by digest.
 */
export function createForceEvaluationRequestV044(
  input: ForceEvaluationRequestInputV044,
): ForceEvaluationRequestV044 {
  const clone = safePlainClone(input, 'force evaluation request input');
  assertExactKeys(clone, [
    'schemaVersion', 'requestId', 'platform', 'evaluationMode', 'integratedSteps',
    'systemDigest', 'preparedSystemDigest',
    'atomOrderDigest', 'cellVectorsNanometer', 'positionArrayLayout',
    'positionComponentsNanometer', 'evaluationOrdinal', 'requestedOutputs',
  ], 'force evaluation request input');
  const positionArrayDigest = componentArrayDigestV044(
    'positions-nanometer',
    clone.positionComponentsNanometer,
  );
  const physicalCoordinateDigest = digestValue({
    schemaVersion: 'tf.physical-coordinate/0.4.4',
    systemDigest: clone.systemDigest,
    atomOrderDigest: clone.atomOrderDigest,
    cellVectorsNanometer: clone.cellVectorsNanometer,
    positionArrayDigest,
  });
  const payload = {
    ...clone,
    physicalCoordinateDigest,
    positionComponentCount: AQUEOUS_FORCE_COMPONENT_COUNT_V044,
    positionArrayDigest,
  };
  return assertForceEvaluationRequestV044({
    ...payload,
    requestDigest: digestValue(payload),
  });
}

export function assertForceEvaluationRequestV044(
  candidate: unknown,
): ForceEvaluationRequestV044 {
  const clone = safePlainClone(
    candidate,
    'force evaluation request',
  ) as ForceEvaluationRequestV044;
  assertExactKeys(clone, [
    'schemaVersion', 'requestId', 'platform', 'evaluationMode', 'integratedSteps',
    'systemDigest', 'preparedSystemDigest',
    'physicalCoordinateDigest', 'atomOrderDigest', 'cellVectorsNanometer',
    'positionArrayLayout', 'positionComponentsNanometer', 'positionComponentCount',
    'positionArrayDigest', 'evaluationOrdinal', 'requestedOutputs', 'requestDigest',
  ], 'force evaluation request');
  if (clone.schemaVersion !== 'tf.force-evaluation-request/0.4.4') {
    throw new Error('force evaluation request requires schema 0.4.4');
  }
  assertOneOf(clone.platform, ['Reference', 'CPU'], 'force evaluation platform');
  if (clone.evaluationMode !== 'fixed-coordinate-no-integration'
    || clone.integratedSteps !== 0) {
    throw new Error('force evaluation requests are fixed-coordinate and integrate zero steps');
  }
  assertStableToken(clone.requestId, 'force evaluation requestId');
  assertDigest(clone.systemDigest, 'force evaluation systemDigest');
  assertDigest(clone.preparedSystemDigest, 'force evaluation preparedSystemDigest');
  assertDigest(clone.atomOrderDigest, 'force evaluation atomOrderDigest');
  assertDigest(clone.physicalCoordinateDigest, 'force evaluation physicalCoordinateDigest');
  assertDigest(clone.positionArrayDigest, 'force evaluation positionArrayDigest');
  assertDigest(clone.requestDigest, 'force evaluation requestDigest');
  const lockedSystem = createOpenMmTip3pControlPlanV044().system;
  if (clone.systemDigest !== lockedSystem.systemDigest) {
    throw new Error('force evaluation request systemDigest is not the locked system');
  }
  assertExactDeepValue(
    clone.cellVectorsNanometer,
    lockedSystem.cell.vectorsNanometer,
    'force evaluation cell vectors',
  );
  if (clone.positionArrayLayout !== FORCE_ARRAY_LAYOUT_V044
    || clone.positionComponentCount !== AQUEOUS_FORCE_COMPONENT_COUNT_V044) {
    throw new Error('force evaluation request position layout or count changed');
  }
  assertComponentArrayV044(clone.positionComponentsNanometer, 'position components');
  const expectedPositionDigest = componentArrayDigestV044(
    'positions-nanometer',
    clone.positionComponentsNanometer,
  );
  if (clone.positionArrayDigest !== expectedPositionDigest) {
    throw new Error('force evaluation request positionArrayDigest is stale');
  }
  const expectedPhysicalDigest = digestValue({
    schemaVersion: 'tf.physical-coordinate/0.4.4',
    systemDigest: clone.systemDigest,
    atomOrderDigest: clone.atomOrderDigest,
    cellVectorsNanometer: clone.cellVectorsNanometer,
    positionArrayDigest: clone.positionArrayDigest,
  });
  if (clone.physicalCoordinateDigest !== expectedPhysicalDigest) {
    throw new Error('force evaluation request physicalCoordinateDigest is stale');
  }
  assertInteger(clone.evaluationOrdinal, 0, 1_000_000_000, 'force evaluation ordinal');
  assertExactDeepValue(
    clone.requestedOutputs,
    REQUESTED_FORCE_OUTPUTS_V044,
    'force evaluation requested outputs',
  );
  const { requestDigest, ...payload } = clone;
  if (requestDigest !== digestValue(payload)) {
    throw new Error('force evaluation requestDigest is stale');
  }
  return deepFreeze(clone);
}

/** Creates and closes a force-result envelope; it never evaluates a force model. */
export function createForceEvaluationV044(
  request: ForceEvaluationRequestV044,
  values: ForceEvaluationValuesV044,
): ForceEvaluationV044 {
  const lockedRequest = assertForceEvaluationRequestV044(request);
  const clone = safePlainClone(values, 'force evaluation values');
  assertExactKeys(clone, [
    'potentialEnergyKjMol', 'potentialEnergyKjMolByGroup',
    'forceComponentsKjMolNanometerByGroup',
  ], 'force evaluation values');
  const forceComponentDigestsByGroup = Object.fromEntries(
    FORCE_GROUP_KEYS_V044.map((group) => [
      group,
      componentArrayDigestV044(`force-${group}-kj-mol-nanometer`,
        clone.forceComponentsKjMolNanometerByGroup[group]),
    ]),
  ) as ForceGroupDigestsV044;
  const payload = {
    schemaVersion: 'tf.force-evaluation/0.4.4' as const,
    requestDigest: lockedRequest.requestDigest,
    platform: lockedRequest.platform,
    evaluationMode: lockedRequest.evaluationMode,
    integratedSteps: lockedRequest.integratedSteps,
    preparedSystemDigest: lockedRequest.preparedSystemDigest,
    systemDigest: lockedRequest.systemDigest,
    physicalCoordinateDigest: lockedRequest.physicalCoordinateDigest,
    atomOrderDigest: lockedRequest.atomOrderDigest,
    evaluationOrdinal: lockedRequest.evaluationOrdinal,
    potentialEnergyKjMol: clone.potentialEnergyKjMol,
    potentialEnergyKjMolByGroup: clone.potentialEnergyKjMolByGroup,
    forceArrayLayout: FORCE_ARRAY_LAYOUT_V044,
    forceSemantics: 'potential-force-excluding-constraint-impulses' as const,
    forceComponentsKjMolNanometerByGroup: clone.forceComponentsKjMolNanometerByGroup,
    forceComponentDigestsByGroup,
    forceComponentCountPerGroup: AQUEOUS_FORCE_COMPONENT_COUNT_V044,
    particleCount: PARTICLE_COUNT,
    completeVirialKjMol: null,
    pressureBar: null,
    stressKjMolNanometer3: null,
  };
  return assertForceEvaluationV044({
    ...payload,
    evaluationDigest: digestValue(payload),
  }, lockedRequest);
}

export function assertForceEvaluationV044(
  candidate: unknown,
  request: ForceEvaluationRequestV044,
): ForceEvaluationV044 {
  const lockedRequest = assertForceEvaluationRequestV044(request);
  const clone = safePlainClone(candidate, 'force evaluation') as ForceEvaluationV044;
  assertExactKeys(clone, [
    'schemaVersion', 'requestDigest', 'platform', 'evaluationMode', 'integratedSteps',
    'preparedSystemDigest', 'systemDigest',
    'physicalCoordinateDigest', 'atomOrderDigest', 'evaluationOrdinal',
    'potentialEnergyKjMol', 'potentialEnergyKjMolByGroup', 'forceArrayLayout',
    'forceSemantics',
    'forceComponentsKjMolNanometerByGroup', 'forceComponentDigestsByGroup',
    'forceComponentCountPerGroup', 'particleCount', 'completeVirialKjMol',
    'pressureBar', 'stressKjMolNanometer3', 'evaluationDigest',
  ], 'force evaluation');
  if (clone.schemaVersion !== 'tf.force-evaluation/0.4.4') {
    throw new Error('force evaluation requires schema 0.4.4');
  }
  for (const key of [
    'requestDigest', 'preparedSystemDigest', 'systemDigest', 'physicalCoordinateDigest',
    'atomOrderDigest', 'evaluationDigest',
  ] as const) assertDigest(clone[key], `force evaluation ${key}`);
  for (const key of [
    'requestDigest', 'platform', 'evaluationMode', 'integratedSteps',
    'preparedSystemDigest', 'systemDigest', 'physicalCoordinateDigest',
    'atomOrderDigest', 'evaluationOrdinal',
  ] as const) {
    if (clone[key] !== lockedRequest[key]) {
      throw new Error(`force evaluation ${key} differs from its request`);
    }
  }
  if (!Number.isFinite(clone.potentialEnergyKjMol)) {
    throw new Error('force evaluation potential energy must be finite');
  }
  assertExactKeys(
    clone.potentialEnergyKjMolByGroup,
    POTENTIAL_ENERGY_GROUP_KEYS_V044,
    'force evaluation energy groups',
  );
  for (const group of POTENTIAL_ENERGY_GROUP_KEYS_V044) {
    if (!Number.isFinite(clone.potentialEnergyKjMolByGroup[group])) {
      throw new Error(`force evaluation ${group} energy must be finite`);
    }
  }
  assertExactKeys(
    clone.forceComponentsKjMolNanometerByGroup,
    FORCE_GROUP_KEYS_V044,
    'force evaluation component groups',
  );
  assertExactKeys(
    clone.forceComponentDigestsByGroup,
    FORCE_GROUP_KEYS_V044,
    'force evaluation component digests',
  );
  if (clone.forceArrayLayout !== FORCE_ARRAY_LAYOUT_V044
    || clone.forceSemantics !== 'potential-force-excluding-constraint-impulses'
    || clone.forceComponentCountPerGroup !== AQUEOUS_FORCE_COMPONENT_COUNT_V044
    || clone.particleCount !== PARTICLE_COUNT) {
    throw new Error('force evaluation array layout, component count, or particle count changed');
  }
  for (const group of FORCE_GROUP_KEYS_V044) {
    const components = clone.forceComponentsKjMolNanometerByGroup[group];
    assertComponentArrayV044(components, `force evaluation ${group} components`);
    assertDigest(clone.forceComponentDigestsByGroup[group], `force evaluation ${group} digest`);
    const expected = componentArrayDigestV044(`force-${group}-kj-mol-nanometer`, components);
    if (clone.forceComponentDigestsByGroup[group] !== expected) {
      throw new Error(`force evaluation ${group} component digest is stale`);
    }
  }
  if (clone.completeVirialKjMol !== null || clone.pressureBar !== null
    || clone.stressKjMolNanometer3 !== null) {
    throw new Error('force evaluation cannot claim virial, pressure, or stress');
  }
  assertForceGroupClosureV044(clone, clone.platform);
  const { evaluationDigest, ...payload } = clone;
  if (evaluationDigest !== digestValue(payload)) {
    throw new Error('force evaluation evaluationDigest is stale');
  }
  return deepFreeze(clone);
}

const PLAN_BOUNDARIES = Object.freeze([
  'This object is a declarative OpenMM 8.6 PME control plan; no OpenMM Context, PME calculation, minimization, or trajectory is executed by this module.',
  'Reference and CPU are separate OpenMM platforms. Reference exact replay is limited to fresh processes on the same host and pinned container; CPU performs only five fixed-coordinate evaluations and integrates zero steps.',
  'The nonzero explicit PME alpha and requested grid make the design error tolerance non-operative in OpenMM; each platform Context must return and receipt its actual parameters separately, and CPU readback follows an energy warm-up after setting positions.',
  'Reported atomic forces are potential forces only and exclude constraint impulses; rigid TIP3P groups 0 and 1 contain zero terms, energy closure is separate, and CPU force closure uses an explicit binary32 ULP gate.',
  'Raw OpenMM Verlet velocities retain their half-step timing; integratedSteps counts calls completed from the portable step-0 state and is not a synchronized-velocity label.',
  'The pinned pure-water box contains no ions, so it does not execute or validate Joung-Cheatham Na/Cl behavior despite loading a compatible combined parameter file.',
  'The cold-start one-picosecond plan is not equilibration, bulk-water validation, finite-size convergence, RDF, diffusion, interface, dissolution, or industrial evidence.',
  'Source and self digests bind bytes and payloads but do not prove execution, provenance authenticity, attestation, redistribution rights, or license clearance.',
]);

export function createOpenMmTip3pControlPlanV044(): OpenMmTip3pControlPlanV044 {
  const reference = canonicalizeForceBackendManifestV044(backendInput('Reference'));
  const cpu = canonicalizeForceBackendManifestV044(backendInput('CPU'));
  const system = canonicalizeAqueousSystemSpecV044(systemInput(reference, cpu));
  const payload = {
    schemaVersion: OPENMM_TIP3P_CONTROL_PLAN_VERSION_V044,
    artifactId: 'tf.openmm-pure-water-cold-start-pme-control/1' as const,
    status: 'planned-not-executed' as const,
    system,
    backends: [reference, cpu] as const,
    boundaries: [...PLAN_BOUNDARIES],
  };
  return deepFreeze({ ...payload, planDigest: digestValue(payload) });
}

export function canonicalizeForceBackendManifestV044(
  input: Omit<ForceBackendManifestV044, 'manifestDigest'>,
): ForceBackendManifestV044 {
  const clone = safePlainClone(input, 'force backend manifest');
  assertExactKeys(clone, [
    'schemaVersion', 'backendId', 'role', 'engine', 'runtime', 'capabilities',
    'determinism', 'fallbackPolicy', 'evidence', 'license', 'claimBoundaries',
  ], 'force backend manifest');
  if (clone.schemaVersion !== FORCE_BACKEND_MANIFEST_VERSION_V044) {
    throw new Error('force backend manifest requires schema 0.4.4');
  }
  assertStableToken(clone.backendId, 'backendId');
  assertOneOf(clone.role, ['canonical', 'comparison'], 'backend role');
  const expectedBackendId = clone.role === 'canonical'
    ? 'openmm-8.6.0-reference-pme'
    : 'openmm-8.6.0-cpu-pme';
  if (clone.backendId !== expectedBackendId) {
    throw new Error('backendId must identify the locked OpenMM platform lane');
  }
  assertBackendEngine(clone.engine, clone.role);
  assertBackendRuntime(clone.runtime, clone.engine.platform);
  assertBackendCapabilities(clone.capabilities);
  assertBackendDeterminism(clone.determinism, clone.engine.platform);
  if (clone.fallbackPolicy !== 'reject-no-algorithm-or-platform-fallback') {
    throw new Error('force backend manifest must reject all fallback');
  }
  assertAllFalseExecution(clone.evidence);
  assertBackendLicense(clone.license);
  assertAllFalseClaims(clone.claimBoundaries, 'force backend claim boundaries', [
    'locallyExecuted', 'openmmReproduced', 'bulkWaterValidated',
    'interfaceSimulated', 'industrialPrediction', 'scorePromotionEligible',
  ]);
  const canonical = {
    ...clone,
    engine: { ...clone.engine, platformProperties: { ...clone.engine.platformProperties } },
    runtime: { ...clone.runtime, environment: { ...clone.runtime.environment } },
    capabilities: { ...clone.capabilities },
    determinism: { ...clone.determinism },
    evidence: { ...clone.evidence },
    license: { ...clone.license },
    claimBoundaries: { ...clone.claimBoundaries },
  };
  return deepFreeze({ ...canonical, manifestDigest: digestValue(canonical) });
}

export function canonicalizeAqueousSystemSpecV044(
  input: Omit<AqueousSystemSpecV044, 'systemDigest'>,
): AqueousSystemSpecV044 {
  const clone = safePlainClone(input, 'aqueous system spec');
  assertExactKeys(clone, [
    'schemaVersion', 'systemId', 'status', 'identity', 'composition', 'cell',
    'inputs', 'forceModel', 'preparationPlan', 'dynamicsPlan', 'backendPlan',
    'acceptancePlan', 'evidenceSemantics', 'claimBoundaries',
  ], 'aqueous system spec');
  if (clone.schemaVersion !== AQUEOUS_SYSTEM_SPEC_VERSION_V044
    || clone.systemId !== 'openmm-8.6-tip3p-895-water-pme-control'
    || clone.status !== 'declarative-system-spec-not-execution') {
    throw new Error('aqueous system spec identity or status is not the locked 0.4.4 control');
  }
  assertSystemIdentity(clone.identity);
  assertComposition(clone.composition);
  assertCell(clone.cell);
  assertSystemInputs(clone.inputs);
  assertForceModel(clone.forceModel);
  assertPreparationPlan(clone.preparationPlan);
  assertDynamicsPlan(clone.dynamicsPlan);
  assertBackendPlan(clone.backendPlan);
  assertAcceptancePlan(clone.acceptancePlan);
  assertAllFalseClaims(clone.evidenceSemantics, 'system evidence semantics', [
    'localTypeScriptDirectEwaldExecution', 'externalOpenmmExecution',
    'externalPmeExecution', 'minimizationExecution', 'trajectoryExecution',
    'selfDigestAuthenticityProof', 'protectedMainArtifact',
  ]);
  assertAllFalseClaims(clone.claimBoundaries, 'system claim boundaries', [
    'coldStartEngineControlProduced', 'equilibratedBulkWater', 'bulkWaterValidated',
    'densityConverged', 'rdfOrDiffusionComputed', 'lowSaltValidated',
    'naclInterfaceSimulated', 'dissolutionOrCrystallizationClaim',
    'electronicStructureComputed', 'industrialPrediction', 'licenseClearance',
    'scorePromotionEligible',
  ]);
  const canonical = {
    ...structuredClone(clone),
    inputs: {
      ...structuredClone(clone.inputs),
      sourcePins: [...clone.inputs.sourcePins]
        .sort((left, right) => compareAscii(left.id, right.id)),
    },
  };
  return deepFreeze({ ...canonical, systemDigest: digestValue(canonical) });
}

export function assertOpenMmTip3pControlPlanV044(
  candidate: unknown,
): OpenMmTip3pControlPlanV044 {
  const clone = safePlainClone(candidate, 'OpenMM TIP3P control plan') as OpenMmTip3pControlPlanV044;
  const expected = createOpenMmTip3pControlPlanV044();
  if (digestValue(clone) !== digestValue(expected)) {
    throw new Error('OpenMM TIP3P control plan is not the exact locked plan');
  }
  assertExactDeepValue(clone, expected, 'OpenMM TIP3P control plan');
  return deepFreeze(clone);
}

function backendInput(platform: 'Reference' | 'CPU'): Omit<ForceBackendManifestV044, 'manifestDigest'> {
  const cpu = platform === 'CPU';
  return {
    schemaVersion: FORCE_BACKEND_MANIFEST_VERSION_V044,
    backendId: `openmm-8.6.0-${platform.toLowerCase()}-pme`,
    role: cpu ? 'comparison' : 'canonical',
    engine: {
      name: 'OpenMM',
      version: OPENMM_RELEASE,
      sourceCommit: OPENMM_COMMIT,
      platform,
      platformProperties: {
        Threads: cpu ? '1' : null,
        precision: 'platform-native-no-Precision-property',
      },
    },
    runtime: {
      os: 'linux',
      architecture: 'x86_64',
      pythonVersion: '3.12.11',
      numpyVersion: '2.2.6',
      packageIndex: 'https://pypi.org/simple',
      containerRegistry: 'docker.io',
      containerRepository: 'library/python',
      containerTag: '3.12.11-slim-bookworm',
      containerIndexDigest: CONTAINER_INDEX_DIGEST,
      containerPlatformDigest: CONTAINER_PLATFORM_DIGEST,
      openmmWheelFilename: 'openmm-8.6.0-cp312-cp312-manylinux_2_34_x86_64.whl',
      openmmWheelUrl: OPENMM_WHEEL_URL,
      openmmWheelByteCount: 14428011,
      openmmWheelSha256: OPENMM_WHEEL_DIGEST,
      numpyWheelFilename: NUMPY_WHEEL_FILENAME,
      numpyWheelUrl: NUMPY_WHEEL_URL,
      numpyWheelByteCount: 16527618,
      numpyWheelSha256: NUMPY_WHEEL_DIGEST,
      environment: {
        PYTHONHASHSEED: '0',
        TZ: 'UTC',
        LC_ALL: 'C.UTF-8',
        OPENMM_CPU_THREADS: cpu ? '1' : null,
      },
    },
    capabilities: {
      cell: 'triclinic-3d-periodic',
      maximumParticles: PARTICLE_COUNT,
      potentialEnergy: true,
      atomicForces: true,
      forceSemantics: 'potential-force-excluding-constraint-impulses',
      velocities: true,
      pme: true,
      constraints: true,
      completeVirial: false,
      pressure: false,
      stress: false,
      electronicDensity: false,
    },
    determinism: {
      scope: cpu
        ? 'fixed-coordinate-comparison-only-no-integration'
        : 'same-host-same-container-fresh-process-exact-required',
      executionMode: cpu
        ? 'fixed-coordinate-evaluation-only-zero-integrated-steps'
        : 'canonical-reference-trajectory-and-fixed-coordinate-evaluation',
      freeTrajectoryCrossPlatformEquality: false,
      randomSeedReconstructsPortableState: false,
    },
    fallbackPolicy: 'reject-no-algorithm-or-platform-fallback',
    evidence: {
      status: 'planned-not-executed',
      externalExecutionPerformed: false,
      pmeExecutionPerformed: false,
      actualRuntimeInventory: null,
      prepareReceiptDigest: null,
      attestationBundleDigest: null,
    },
    license: {
      apiReferenceCpuLicense: 'MIT',
      thirdPartyNoticesRequired: true,
      parameterAssetLicenseReviewed: false,
      coordinateAssetLicenseReviewed: false,
      redistributionCleared: false,
      licenseClearance: false,
    },
    claimBoundaries: {
      locallyExecuted: false,
      openmmReproduced: false,
      bulkWaterValidated: false,
      interfaceSimulated: false,
      industrialPrediction: false,
      scorePromotionEligible: false,
    },
  };
}

function systemInput(
  reference: ForceBackendManifestV044,
  cpu: ForceBackendManifestV044,
): Omit<AqueousSystemSpecV044, 'systemDigest'> {
  const sourcePins = openMmSourcePins();
  const vectorsNanometer: CellVectorsNanometer3 = [
    { x: CELL_EDGE_NANOMETER, y: 0, z: 0 },
    { x: 0, y: CELL_EDGE_NANOMETER, z: 0 },
    { x: 0, y: 0, z: CELL_EDGE_NANOMETER },
  ];
  const cellPayload = {
    kind: 'orthorhombic-periodic-cell' as const,
    vectorsNanometer,
    volumeNanometer3: CELL_VOLUME_NANOMETER3,
    periodicAxes: [true, true, true] as const,
    originGauge: 'pdb-cryst1-origin-omitted-as-nonphysical' as const,
  };
  if (cellVolumeNanometer3(vectorsNanometer) !== CELL_VOLUME_NANOMETER3) {
    throw new Error('system-plan cell determinant changed');
  }
  return {
    schemaVersion: AQUEOUS_SYSTEM_SPEC_VERSION_V044,
    systemId: 'openmm-8.6-tip3p-895-water-pme-control',
    status: 'declarative-system-spec-not-execution',
    identity: {
      scientificRole: 'cold-start-periodic-pure-water-engine-control-candidate',
      chemistry: 'rigid-tip3p-water',
      parameterFamilyId: 'openmm-amber14-tip3p-joung-cheatham-explicit-solvent',
      parameterBytesEqualToCurrent851Receipt: true,
      parameterByteEqualityImpliesExecution: false,
    },
    composition: {
      waterMoleculeCount: WATER_COUNT,
      sodiumIonCount: 0,
      chlorideIonCount: 0,
      residueCount: WATER_COUNT,
      particleCount: PARTICLE_COUNT,
      topologyBondCount: 2 * WATER_COUNT,
      rigidDistanceConstraintCount: PARTICLE_COUNT,
      intramolecularNonbondedExceptionCount: PARTICLE_COUNT,
      totalMassDalton: TOTAL_MASS_DALTON,
      totalChargeE: 0,
      nominalDensityKgM3: NOMINAL_DENSITY_KG_M3,
    },
    cell: { ...cellPayload, cellDigest: digestValue(cellPayload) },
    inputs: {
      sourcePins,
      authoritativeAtomOrder: 'pdb-record-order',
      coordinatePolicy: 'raw-pdb-coordinates-no-prewrap-or-reorder',
      expectedResidueName: 'HOH',
      expectedSiteOrderPerResidue: ['O', 'H1', 'H2'],
      expectedRigidWaterGeometryNanometer: {
        oxygenHydrogen: 0.09572,
        hydrogenHydrogen: 0.15139006545247014,
      },
      topologyCompilation: 'openmm-pdb-and-forcefield-loader-required',
      compiledTopologyDigest: null,
      serializedSystemDigest: null,
    },
    forceModel: {
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
    },
    preparationPlan: {
      canonicalPlatform: 'Reference',
      constraintTolerance: 1e-8,
      minimization: {
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
      },
      velocityInitialization: {
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
      },
      portableProductionStartStateRequired: true,
      productionStartStateDigest: null,
      repairPolicy: 'external-prepare-receipt-required-no-silent-local-repair',
    },
    dynamicsPlan: {
      evidenceStatus: 'planned-not-executed',
      ensemble: 'NVE',
      integrator: 'OpenMM-VerletIntegrator',
      fixedTimeStepPicoseconds: 0.001,
      constraintTolerance: 1e-8,
      thermostat: null,
      barostat: null,
      fixedCell: true,
      integratedSteps: 1000,
      sampleStepSemantics: 'integrated-steps-from-portable-start-state-step-0',
      sampleStrideSteps: 10,
      expectedSampleCount: 101,
      finalTimePicoseconds: 1,
      velocityReadbackSemantics: 'prepared-step-0-then-raw-OpenMM-Verlet-half-step-velocities-no-resynchronization',
    },
    backendPlan: {
      canonicalManifestDigest: reference.manifestDigest,
      comparisonManifestDigest: cpu.manifestDigest,
      platformOrder: ['Reference', 'CPU'],
      fallbackPolicy: 'reject',
      sharedPortableStartStateRequired: true,
      referenceReplay: 'two-same-host-same-container-fresh-processes-exact-101-frame-digest-required',
      cpuExecution: 'five-fixed-coordinate-evaluations-only-zero-integrated-steps',
      crossPlatformComparison: 'fixed-coordinate-energy-force-only',
    },
    acceptancePlan: {
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
    },
    evidenceSemantics: {
      localTypeScriptDirectEwaldExecution: false,
      externalOpenmmExecution: false,
      externalPmeExecution: false,
      minimizationExecution: false,
      trajectoryExecution: false,
      selfDigestAuthenticityProof: false,
      protectedMainArtifact: false,
    },
    claimBoundaries: {
      coldStartEngineControlProduced: false,
      equilibratedBulkWater: false,
      bulkWaterValidated: false,
      densityConverged: false,
      rdfOrDiffusionComputed: false,
      lowSaltValidated: false,
      naclInterfaceSimulated: false,
      dissolutionOrCrystallizationClaim: false,
      electronicStructureComputed: false,
      industrialPrediction: false,
      licenseClearance: false,
      scorePromotionEligible: false,
    },
  };
}

function openMmSourcePins(): AqueousSourcePinV044[] {
  return [
    sourcePin(
      'openmm-8.6-licenses',
      'license-notices',
      'docs-source/licenses/Licenses.txt',
      9305,
      'sha256:437b7168cc997abea3b5f2a9e0fb6894f96de77b9c69be428ccfcfe9bed58293',
    ),
    sourcePin(
      'openmm-8.6-tip3p-parameters',
      'parameter-input',
      'wrappers/python/openmm/app/data/amber14/tip3p.xml',
      19070,
      'sha256:3f4b188dbcb6c02863230eaca231e927fb6bf3307ce947d8a50d0f46f6dd83d9',
    ),
    sourcePin(
      'openmm-8.6-tip3p-water-box',
      'coordinate-input',
      'wrappers/python/openmm/app/data/tip3p.pdb',
      179998,
      'sha256:14fd37900d627c0e258d6086a14c6084e4bec1422e9d20fccfc83c3f814fd7ee',
    ),
  ];
}

function sourcePin(
  id: string,
  role: AqueousSourcePinV044['role'],
  path: string,
  byteCount: number,
  sha256: string,
): AqueousSourcePinV044 {
  return {
    id,
    role,
    owner: 'OpenMM',
    repository: 'https://github.com/openmm/openmm',
    release: OPENMM_RELEASE,
    commit: OPENMM_COMMIT,
    path,
    rawUrl: `https://raw.githubusercontent.com/openmm/openmm/${OPENMM_COMMIT}/${path}`,
    byteCount,
    sha256,
    evidenceStatus: 'pinned-expected-input-not-bundled',
    artifactFetchReceiptDigest: null,
    redistributionCleared: false,
  };
}

function assertBackendEngine(value: ForceBackendManifestV044['engine'], role: ForceBackendManifestV044['role']) {
  assertExactKeys(value, ['name', 'version', 'sourceCommit', 'platform', 'platformProperties'], 'backend engine');
  assertExactKeys(value.platformProperties, ['Threads', 'precision'], 'backend platform properties');
  if (value.name !== 'OpenMM' || value.version !== OPENMM_RELEASE || value.sourceCommit !== OPENMM_COMMIT) {
    throw new Error('backend engine must be the locked OpenMM 8.6 source');
  }
  if ((role === 'canonical' && (value.platform !== 'Reference' || value.platformProperties.Threads !== null))
    || (role === 'comparison' && (value.platform !== 'CPU' || value.platformProperties.Threads !== '1'))
    || value.platformProperties.precision !== 'platform-native-no-Precision-property') {
    throw new Error('backend platform, role, properties, or precision label is inconsistent');
  }
}

function assertBackendRuntime(value: ForceBackendManifestV044['runtime'], platform: 'Reference' | 'CPU') {
  assertExactKeys(value, [
    'os', 'architecture', 'pythonVersion', 'numpyVersion', 'packageIndex',
    'containerRegistry', 'containerRepository', 'containerTag',
    'containerIndexDigest', 'containerPlatformDigest', 'openmmWheelFilename',
    'openmmWheelUrl', 'openmmWheelByteCount', 'openmmWheelSha256',
    'numpyWheelFilename', 'numpyWheelUrl', 'numpyWheelByteCount',
    'numpyWheelSha256', 'environment',
  ], 'backend runtime');
  assertExactKeys(value.environment, ['PYTHONHASHSEED', 'TZ', 'LC_ALL', 'OPENMM_CPU_THREADS'], 'backend environment');
  for (const digest of [
    value.containerIndexDigest,
    value.containerPlatformDigest,
    value.openmmWheelSha256,
    value.numpyWheelSha256,
  ]) assertDigest(digest, 'backend runtime digest');
  if (value.os !== 'linux' || value.architecture !== 'x86_64'
    || value.pythonVersion !== '3.12.11' || value.numpyVersion !== '2.2.6'
    || value.packageIndex !== 'https://pypi.org/simple'
    || value.containerRegistry !== 'docker.io'
    || value.containerRepository !== 'library/python'
    || value.containerTag !== '3.12.11-slim-bookworm'
    || value.containerIndexDigest !== CONTAINER_INDEX_DIGEST
    || value.containerPlatformDigest !== CONTAINER_PLATFORM_DIGEST
    || value.openmmWheelFilename !== 'openmm-8.6.0-cp312-cp312-manylinux_2_34_x86_64.whl'
    || value.openmmWheelUrl !== OPENMM_WHEEL_URL || value.openmmWheelByteCount !== 14428011
    || value.openmmWheelSha256 !== OPENMM_WHEEL_DIGEST
    || value.numpyWheelFilename !== NUMPY_WHEEL_FILENAME
    || value.numpyWheelUrl !== NUMPY_WHEEL_URL || value.numpyWheelByteCount !== 16527618
    || value.numpyWheelSha256 !== NUMPY_WHEEL_DIGEST
    || value.environment.PYTHONHASHSEED !== '0' || value.environment.TZ !== 'UTC'
    || value.environment.LC_ALL !== 'C.UTF-8'
    || value.environment.OPENMM_CPU_THREADS !== (platform === 'CPU' ? '1' : null)) {
    throw new Error('backend runtime is not the locked Linux control runtime');
  }
}

function assertBackendCapabilities(value: ForceBackendManifestV044['capabilities']) {
  assertExactKeys(value, [
    'cell', 'maximumParticles', 'potentialEnergy', 'atomicForces', 'forceSemantics', 'velocities',
    'pme', 'constraints', 'completeVirial', 'pressure', 'stress', 'electronicDensity',
  ], 'backend capabilities');
  assertInteger(value.maximumParticles, PARTICLE_COUNT, 1_000_000, 'backend maximumParticles');
  if (value.cell !== 'triclinic-3d-periodic' || value.maximumParticles !== PARTICLE_COUNT
    || !value.potentialEnergy || !value.atomicForces || !value.velocities
    || value.forceSemantics !== 'potential-force-excluding-constraint-impulses'
    || !value.pme || !value.constraints || value.completeVirial || value.pressure
    || value.stress || value.electronicDensity) {
    throw new Error('backend capabilities do not match the locked force-only PME boundary');
  }
}

function assertBackendDeterminism(
  value: ForceBackendManifestV044['determinism'],
  platform: 'Reference' | 'CPU',
) {
  assertExactKeys(value, [
    'scope', 'executionMode', 'freeTrajectoryCrossPlatformEquality',
    'randomSeedReconstructsPortableState',
  ], 'backend determinism');
  const expectedScope = platform === 'Reference'
    ? 'same-host-same-container-fresh-process-exact-required'
    : 'fixed-coordinate-comparison-only-no-integration';
  const expectedExecutionMode = platform === 'Reference'
    ? 'canonical-reference-trajectory-and-fixed-coordinate-evaluation'
    : 'fixed-coordinate-evaluation-only-zero-integrated-steps';
  if (value.scope !== expectedScope || value.executionMode !== expectedExecutionMode
    || value.freeTrajectoryCrossPlatformEquality
    || value.randomSeedReconstructsPortableState) {
    throw new Error('backend determinism boundary is inconsistent with the OpenMM platform');
  }
}

function assertAllFalseExecution(value: ForceBackendManifestV044['evidence']) {
  assertExactKeys(value, [
    'status', 'externalExecutionPerformed', 'pmeExecutionPerformed',
    'actualRuntimeInventory', 'prepareReceiptDigest', 'attestationBundleDigest',
  ], 'backend evidence');
  if (value.status !== 'planned-not-executed' || value.externalExecutionPerformed
    || value.pmeExecutionPerformed || value.actualRuntimeInventory !== null
    || value.prepareReceiptDigest !== null || value.attestationBundleDigest !== null) {
    throw new Error('backend contract cannot contain execution or attestation evidence');
  }
}

function assertBackendLicense(value: ForceBackendManifestV044['license']) {
  assertExactKeys(value, [
    'apiReferenceCpuLicense', 'thirdPartyNoticesRequired', 'parameterAssetLicenseReviewed',
    'coordinateAssetLicenseReviewed', 'redistributionCleared', 'licenseClearance',
  ], 'backend license');
  if (value.apiReferenceCpuLicense !== 'MIT' || !value.thirdPartyNoticesRequired
    || value.parameterAssetLicenseReviewed || value.coordinateAssetLicenseReviewed
    || value.redistributionCleared || value.licenseClearance) {
    throw new Error('backend license boundary must remain uncleared with notices required');
  }
}

function assertSystemIdentity(value: AqueousSystemSpecV044['identity']) {
  assertExactKeys(value, [
    'scientificRole', 'chemistry', 'parameterFamilyId',
    'parameterBytesEqualToCurrent851Receipt', 'parameterByteEqualityImpliesExecution',
  ], 'system identity');
  if (value.scientificRole !== 'cold-start-periodic-pure-water-engine-control-candidate'
    || value.chemistry !== 'rigid-tip3p-water'
    || value.parameterFamilyId !== 'openmm-amber14-tip3p-joung-cheatham-explicit-solvent'
    || !value.parameterBytesEqualToCurrent851Receipt
    || value.parameterByteEqualityImpliesExecution) {
    throw new Error('system identity overstates or changes the locked parameter family');
  }
}

function assertComposition(value: AqueousSystemSpecV044['composition']) {
  assertExactKeys(value, [
    'waterMoleculeCount', 'sodiumIonCount', 'chlorideIonCount', 'residueCount',
    'particleCount', 'topologyBondCount', 'rigidDistanceConstraintCount',
    'intramolecularNonbondedExceptionCount', 'totalMassDalton', 'totalChargeE',
    'nominalDensityKgM3',
  ], 'system composition');
  if (value.waterMoleculeCount !== WATER_COUNT || value.sodiumIonCount !== 0
    || value.chlorideIonCount !== 0 || value.residueCount !== WATER_COUNT
    || value.particleCount !== 3 * WATER_COUNT || value.topologyBondCount !== 2 * WATER_COUNT
    || value.rigidDistanceConstraintCount !== 3 * WATER_COUNT
    || value.intramolecularNonbondedExceptionCount !== 3 * WATER_COUNT
    || value.totalMassDalton !== TOTAL_MASS_DALTON || value.totalChargeE !== 0
    || value.nominalDensityKgM3 !== NOMINAL_DENSITY_KG_M3) {
    throw new Error('system composition does not close to the pinned 895-water source');
  }
  if (Math.abs(WATER_MASS_DALTON * WATER_COUNT - value.totalMassDalton)
    > NUMERIC_CLOSURE_TOLERANCE) {
    throw new Error('system total mass does not close to the parameter receipt');
  }
  const derivedDensity = value.totalMassDalton
    * DALTON_PER_NANOMETER3_TO_KG_PER_METER3
    / CELL_VOLUME_NANOMETER3;
  if (Math.abs(derivedDensity - value.nominalDensityKgM3) > NUMERIC_CLOSURE_TOLERANCE) {
    throw new Error('system nominal density does not close to its mass and cell volume');
  }
}

function assertCell(value: AqueousSystemSpecV044['cell']) {
  assertExactKeys(value, [
    'kind', 'vectorsNanometer', 'volumeNanometer3', 'periodicAxes', 'originGauge', 'cellDigest',
  ], 'system cell');
  if (value.kind !== 'orthorhombic-periodic-cell'
    || value.originGauge !== 'pdb-cryst1-origin-omitted-as-nonphysical'
    || JSON.stringify(value.periodicAxes) !== '[true,true,true]') {
    throw new Error('system cell boundary is not the locked three-dimensional periodic cell');
  }
  assertExactDeepValue(value.vectorsNanometer, [
    { x: CELL_EDGE_NANOMETER, y: 0, z: 0 },
    { x: 0, y: CELL_EDGE_NANOMETER, z: 0 },
    { x: 0, y: 0, z: CELL_EDGE_NANOMETER },
  ], 'system cell vectorsNanometer');
  if (cellVolumeNanometer3(value.vectorsNanometer) !== CELL_VOLUME_NANOMETER3
    || value.volumeNanometer3 !== CELL_VOLUME_NANOMETER3) {
    throw new Error('system cell volume does not match the pinned CRYST1 record');
  }
  const { cellDigest, ...payload } = value;
  assertDigest(cellDigest, 'cellDigest');
  if (cellDigest !== digestValue(payload)) throw new Error('system cellDigest is stale');
}

function assertSystemInputs(value: AqueousSystemSpecV044['inputs']) {
  assertExactKeys(value, [
    'sourcePins', 'authoritativeAtomOrder', 'coordinatePolicy', 'expectedResidueName',
    'expectedSiteOrderPerResidue', 'expectedRigidWaterGeometryNanometer',
    'topologyCompilation', 'compiledTopologyDigest', 'serializedSystemDigest',
  ], 'system inputs');
  assertExactKeys(value.expectedRigidWaterGeometryNanometer, [
    'oxygenHydrogen', 'hydrogenHydrogen',
  ], 'expected rigid-water geometry');
  if (!Array.isArray(value.sourcePins) || value.sourcePins.length !== 3) {
    throw new Error('system inputs require the three locked source pins');
  }
  const sorted = [...value.sourcePins].sort((left, right) => compareAscii(left.id, right.id));
  const expectedPins = openMmSourcePins().sort((left, right) => compareAscii(left.id, right.id));
  if (digestValue(sorted) !== digestValue(expectedPins)) {
    throw new Error('system input source pins do not match the locked primary-source bytes');
  }
  assertExactDeepValue(sorted, expectedPins, 'system input source pins');
  for (const source of value.sourcePins) {
    assertExactKeys(source, [
      'id', 'role', 'owner', 'repository', 'release', 'commit', 'path', 'rawUrl',
      'byteCount', 'sha256', 'evidenceStatus', 'artifactFetchReceiptDigest',
      'redistributionCleared',
    ], `source pin ${source.id}`);
    assertDigest(source.sha256, `source pin ${source.id} digest`);
    if (source.evidenceStatus !== 'pinned-expected-input-not-bundled'
      || source.artifactFetchReceiptDigest !== null || source.redistributionCleared) {
      throw new Error(`source pin ${source.id} must remain an unbundled expected input`);
    }
  }
  if (value.authoritativeAtomOrder !== 'pdb-record-order'
    || value.coordinatePolicy !== 'raw-pdb-coordinates-no-prewrap-or-reorder'
    || value.expectedResidueName !== 'HOH'
    || JSON.stringify(value.expectedSiteOrderPerResidue) !== '["O","H1","H2"]'
    || value.expectedRigidWaterGeometryNanometer.oxygenHydrogen !== 0.09572
    || value.expectedRigidWaterGeometryNanometer.hydrogenHydrogen
      !== 0.15139006545247014
    || value.topologyCompilation !== 'openmm-pdb-and-forcefield-loader-required'
    || value.compiledTopologyDigest !== null || value.serializedSystemDigest !== null) {
    throw new Error('system input compiler status must remain pinned and unexecuted');
  }
}

function assertForceModel(value: AqueousSystemSpecV044['forceModel']) {
  assertExactKeys(value, [
    'nonbondedMethod', 'cutoffNanometer', 'constraints', 'rigidWater',
    'flexibleConstraints', 'removeCenterOfMassMotion', 'switchingFunction',
    'switchDistanceNanometer', 'dispersionCorrection', 'ljpme',
    'exceptionsUsePeriodicBoundaryConditions', 'pme', 'forceGroups', 'zeroTermForceGroups',
  ], 'force model');
  assertExactKeys(value.pme, [
    'parameterApplicationMode', 'designErrorTolerance',
    'designErrorToleranceUsedByEngine', 'requestedAlphaInverseNanometer',
    'requestedGrid', 'contextReadbackRequiredForEachLane',
    'contextValuesMayDifferFromRequestDueToPlatformRestrictions',
    'sameLaneFreshProcessReadbacksMustMatch', 'cpuWarmupBeforeContextReadbackRequired',
    'cpuWarmupOperation',
  ], 'PME settings');
  assertExactKeys(value.forceGroups, [
    'harmonicBond', 'harmonicAngle', 'nonbondedDirectAndLennardJones',
    'nonbondedReciprocal',
  ], 'force groups');
  if (value.nonbondedMethod !== 'PME' || value.cutoffNanometer !== 1
    || value.constraints !== 'HBonds' || !value.rigidWater || value.flexibleConstraints
    || value.removeCenterOfMassMotion || value.switchingFunction
    || value.switchDistanceNanometer !== null || !value.dispersionCorrection || value.ljpme
    || value.exceptionsUsePeriodicBoundaryConditions
    || value.pme.parameterApplicationMode
      !== 'explicit-setPMEParameters-with-nonzero-alpha'
    || value.pme.designErrorTolerance !== 0.0001
    || value.pme.designErrorToleranceUsedByEngine
    || value.pme.requestedAlphaInverseNanometer !== 2.918423065872431
    || !value.pme.contextReadbackRequiredForEachLane
    || !value.pme.contextValuesMayDifferFromRequestDueToPlatformRestrictions
    || !value.pme.sameLaneFreshProcessReadbacksMustMatch
    || !value.pme.cpuWarmupBeforeContextReadbackRequired
    || value.pme.cpuWarmupOperation !== 'getState-getEnergy-true-after-setPositions') {
    throw new Error('force model is not the locked explicit-PME control configuration');
  }
  assertExactDeepValue(value.pme.requestedGrid, [90, 90, 90], 'PME requested grid');
  assertExactDeepValue(value.forceGroups, {
    harmonicBond: 0,
    harmonicAngle: 1,
    nonbondedDirectAndLennardJones: 2,
    nonbondedReciprocal: 3,
  }, 'force groups');
  assertExactDeepValue(value.zeroTermForceGroups, [0, 1], 'zero-term force groups');
}

function assertPreparationPlan(value: AqueousSystemSpecV044['preparationPlan']) {
  assertExactKeys(value, [
    'canonicalPlatform', 'constraintTolerance', 'minimization',
    'velocityInitialization', 'portableProductionStartStateRequired',
    'productionStartStateDigest', 'repairPolicy',
  ], 'preparation plan');
  assertExactKeys(value.minimization, [
    'algorithm', 'toleranceKjMolNanometer', 'maximumIterationsArgument',
    'iterationSemantics', 'reporter', 'postconditions',
  ], 'minimization plan');
  assertExactKeys(value.minimization.reporter, [
    'required', 'api', 'globalCallbackOrdinalRequired', 'iterationIndexSemantics',
    'maximumReporterCallbacks', 'maximumConstraintRestarts', 'wallClockTimeoutSeconds',
    'budgetExhaustionOutcome',
  ], 'minimization reporter plan');
  assertExactKeys(value.minimization.postconditions, [
    'termination', 'finiteStateRequired',
    'finalReporterObjectiveGradientRmsMaximumKjMolNanometer',
    'postMinimizationApplyConstraintsRequired', 'maximumConstraintRelativeResidual',
  ], 'minimization postconditions');
  assertExactKeys(value.velocityInitialization, [
    'method', 'temperatureKelvin', 'randomSeed', 'operationOrder',
    'setVelocitiesToTemperatureInternalConstraintTolerance',
    'removeMassWeightedCenterOfMassVelocity',
    'applyVelocityConstraintsAfterCenterOfMassRemoval', 'explicitVelocityConstraintTolerance',
    'centerOfMassVelocityFormula',
    'maximumCenterOfMassSpeedNanometerPerPicosecond',
    'velocityConstraintResidualFormula', 'maximumVelocityConstraintRelativeResidual',
    'postconditionEvaluationPoint', 'seedAloneIsReplayInput',
  ], 'velocity initialization plan');
  if (value.canonicalPlatform !== 'Reference' || value.constraintTolerance !== 1e-8
    || value.minimization.algorithm !== 'OpenMM-LocalEnergyMinimizer-LBFGS'
    || value.minimization.toleranceKjMolNanometer !== 1
    || value.minimization.maximumIterationsArgument !== 5000
    || value.minimization.iterationSemantics
      !== 'OpenMM-maxIterations-argument-does-not-bound-total-reporter-callbacks-across-constraint-restarts'
    || !value.minimization.reporter.required
    || value.minimization.reporter.api !== 'OpenMM-MinimizationReporter'
    || !value.minimization.reporter.globalCallbackOrdinalRequired
    || value.minimization.reporter.iterationIndexSemantics
      !== 'optimizer-local-index-may-reset-after-constraint-restart'
    || value.minimization.reporter.maximumReporterCallbacks !== 20000
    || value.minimization.reporter.maximumConstraintRestarts !== 3
    || value.minimization.reporter.wallClockTimeoutSeconds !== 1800
    || value.minimization.reporter.budgetExhaustionOutcome
      !== 'incomplete-no-production-start-state'
    || value.minimization.postconditions.termination
      !== 'converged-postconditions-required-not-max-iterations-alone'
    || !value.minimization.postconditions.finiteStateRequired
    || value.minimization.postconditions.finalReporterObjectiveGradientRmsMaximumKjMolNanometer
      !== 1
    || !value.minimization.postconditions.postMinimizationApplyConstraintsRequired
    || value.minimization.postconditions.maximumConstraintRelativeResidual !== 1e-8
    || value.velocityInitialization.method !== 'OpenMM-setVelocitiesToTemperature'
    || value.velocityInitialization.temperatureKelvin !== 300
    || value.velocityInitialization.randomSeed !== 20260901
    || JSON.stringify(value.velocityInitialization.operationOrder)
      !== '["setVelocitiesToTemperature","removeMassWeightedCenterOfMassVelocity","applyVelocityConstraints"]'
    || value.velocityInitialization.setVelocitiesToTemperatureInternalConstraintTolerance !== 1e-5
    || !value.velocityInitialization.removeMassWeightedCenterOfMassVelocity
    || !value.velocityInitialization.applyVelocityConstraintsAfterCenterOfMassRemoval
    || value.velocityInitialization.explicitVelocityConstraintTolerance !== 1e-8
    || value.velocityInitialization.centerOfMassVelocityFormula
      !== 'norm(sum(m_i*v_i))/sum(m_i)'
    || value.velocityInitialization.maximumCenterOfMassSpeedNanometerPerPicosecond !== 1e-12
    || value.velocityInitialization.velocityConstraintResidualFormula
      !== 'max(abs(dot(r_ij,v_j-v_i))/max(norm(r_ij)*norm(v_j-v_i),1e-12-nm2-ps))'
    || value.velocityInitialization.maximumVelocityConstraintRelativeResidual !== 1e-8
    || value.velocityInitialization.postconditionEvaluationPoint
      !== 'after-explicit-applyVelocityConstraints'
    || value.velocityInitialization.seedAloneIsReplayInput
    || !value.portableProductionStartStateRequired
    || value.productionStartStateDigest !== null
    || value.repairPolicy !== 'external-prepare-receipt-required-no-silent-local-repair') {
    throw new Error('preparation plan is not the locked external Reference preparation');
  }
}

function assertDynamicsPlan(value: AqueousSystemSpecV044['dynamicsPlan']) {
  assertExactKeys(value, [
    'evidenceStatus', 'ensemble', 'integrator', 'fixedTimeStepPicoseconds',
    'constraintTolerance', 'thermostat', 'barostat', 'fixedCell', 'integratedSteps',
    'sampleStepSemantics', 'sampleStrideSteps', 'expectedSampleCount',
    'finalTimePicoseconds', 'velocityReadbackSemantics',
  ], 'dynamics plan');
  if (value.evidenceStatus !== 'planned-not-executed' || value.ensemble !== 'NVE'
    || value.integrator !== 'OpenMM-VerletIntegrator'
    || value.fixedTimeStepPicoseconds !== 0.001 || value.constraintTolerance !== 1e-8
    || value.thermostat !== null || value.barostat !== null || !value.fixedCell
    || value.integratedSteps !== 1000
    || value.sampleStepSemantics !== 'integrated-steps-from-portable-start-state-step-0'
    || value.sampleStrideSteps !== 10 || value.expectedSampleCount !== 101
    || value.finalTimePicoseconds !== 1
    || value.velocityReadbackSemantics
      !== 'prepared-step-0-then-raw-OpenMM-Verlet-half-step-velocities-no-resynchronization') {
    throw new Error('dynamics plan is not the locked one-picosecond NVE control');
  }
}

function assertBackendPlan(value: AqueousSystemSpecV044['backendPlan']) {
  assertExactKeys(value, [
    'canonicalManifestDigest', 'comparisonManifestDigest', 'platformOrder',
    'fallbackPolicy', 'sharedPortableStartStateRequired', 'referenceReplay',
    'cpuExecution', 'crossPlatformComparison',
  ], 'backend plan');
  assertDigest(value.canonicalManifestDigest, 'canonical manifest digest');
  assertDigest(value.comparisonManifestDigest, 'comparison manifest digest');
  const expectedCanonicalDigest = canonicalizeForceBackendManifestV044(
    backendInput('Reference'),
  ).manifestDigest;
  const expectedComparisonDigest = canonicalizeForceBackendManifestV044(
    backendInput('CPU'),
  ).manifestDigest;
  if (value.canonicalManifestDigest !== expectedCanonicalDigest
    || value.comparisonManifestDigest !== expectedComparisonDigest
    || JSON.stringify(value.platformOrder) !== '["Reference","CPU"]'
    || value.fallbackPolicy !== 'reject' || !value.sharedPortableStartStateRequired
    || value.referenceReplay
      !== 'two-same-host-same-container-fresh-processes-exact-101-frame-digest-required'
    || value.cpuExecution !== 'five-fixed-coordinate-evaluations-only-zero-integrated-steps'
    || value.crossPlatformComparison !== 'fixed-coordinate-energy-force-only') {
    throw new Error('backend lane plan or no-fallback policy changed');
  }
}

function assertAcceptancePlan(value: AqueousSystemSpecV044['acceptancePlan']) {
  assertExactKeys(value, [
    'maximumRelativeEnergyExcursion', 'maximumConstraintRelativeResidual',
    'maximumRelativePotentialEnergyDifference',
    'maximumMedianPerParticleRelativeForceError',
    'maximumGlobalRelativeForceL2Error', 'forceGroupEnergySumMustClose',
    'forceGroupForceSumMustClose',
    'referenceSameHostSameContainerExactReplayRequired', 'cpuExactReplayRequired',
    'freeTrajectoryCrossPlatformEqualityRequired', 'metricDefinitions',
  ], 'acceptance plan');
  if (value.maximumRelativeEnergyExcursion !== 0.001
    || value.maximumConstraintRelativeResidual !== 0.000001
    || value.maximumRelativePotentialEnergyDifference !== 0.00001
    || value.maximumMedianPerParticleRelativeForceError !== 0.0001
    || value.maximumGlobalRelativeForceL2Error !== 0.0001
    || !value.forceGroupEnergySumMustClose || !value.forceGroupForceSumMustClose
    || !value.referenceSameHostSameContainerExactReplayRequired
    || value.cpuExactReplayRequired || value.freeTrajectoryCrossPlatformEqualityRequired) {
    throw new Error('acceptance plan thresholds or determinism semantics changed');
  }
  assertExactDeepValue(value.metricDefinitions, {
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
  }, 'acceptance metric definitions');
}

function componentArrayDigestV044(label: string, components: ReadonlyArray<number>) {
  return digestValue({
    schemaVersion: 'tf.component-array-digest/0.4.4',
    label,
    layout: FORCE_ARRAY_LAYOUT_V044,
    componentCount: AQUEOUS_FORCE_COMPONENT_COUNT_V044,
    components,
  });
}

function assertComponentArrayV044(value: unknown, label: string): asserts value is ReadonlyArray<number> {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype
    || value.length !== AQUEOUS_FORCE_COMPONENT_COUNT_V044) {
    throw new Error(`${label} must contain exactly 8055 intrinsic-array components`);
  }
  for (let index = 0; index < value.length; index += 1) {
    const component = value[index];
    if (!Number.isFinite(component) || Object.is(component, -0)) {
      throw new Error(`${label}[${index}] must be finite and cannot be negative zero`);
    }
  }
}

function assertForceGroupClosureV044(
  value: ForceEvaluationV044,
  platform: 'Reference' | 'CPU',
) {
  const groups = value.potentialEnergyKjMolByGroup;
  if (groups.harmonicBond !== 0 || groups.harmonicAngle !== 0) {
    throw new Error('rigid TIP3P force groups 0 and 1 must have zero energy terms');
  }
  const energySum = groups.harmonicBond + groups.harmonicAngle
    + groups.nonbondedDirectAndLennardJones + groups.nonbondedReciprocal;
  const energyRelativeResidual = Math.abs(value.potentialEnergyKjMol - energySum)
    / Math.max(Math.abs(value.potentialEnergyKjMol), 1);
  if (!Number.isFinite(energyRelativeResidual) || energyRelativeResidual > 1e-8) {
    throw new Error('force evaluation energy groups do not close at the separate relative tolerance');
  }
  const forces = value.forceComponentsKjMolNanometerByGroup;
  let maximumTotalComponent = 0;
  let maximumComponentResidual = 0;
  let maximumCpuUlpDistance = 0;
  for (let index = 0; index < AQUEOUS_FORCE_COMPONENT_COUNT_V044; index += 1) {
    const total = forces.total[index];
    if (forces.harmonicBond[index] !== 0 || forces.harmonicAngle[index] !== 0) {
      throw new Error('rigid TIP3P force groups 0 and 1 must have zero force components');
    }
    const sum = forces.harmonicBond[index] + forces.harmonicAngle[index]
      + forces.nonbondedDirectAndLennardJones[index] + forces.nonbondedReciprocal[index];
    maximumTotalComponent = Math.max(maximumTotalComponent, Math.abs(total));
    maximumComponentResidual = Math.max(maximumComponentResidual, Math.abs(total - sum));
    if (platform === 'CPU') {
      const cpuSum = [
        forces.harmonicBond[index],
        forces.harmonicAngle[index],
        forces.nonbondedDirectAndLennardJones[index],
        forces.nonbondedReciprocal[index],
      ].reduce((accumulator, component) => Math.fround(
        Math.fround(accumulator) + Math.fround(component),
      ), 0);
      const totalFloat32 = Math.fround(total);
      if (!Number.isFinite(totalFloat32) || !Number.isFinite(cpuSum)) {
        throw new Error('CPU force-group closure requires finite binary32 components');
      }
      maximumCpuUlpDistance = Math.max(
        maximumCpuUlpDistance,
        float32UlpDistance(totalFloat32, cpuSum),
      );
    }
  }
  if (platform === 'Reference') {
    const forceRelativeResidual = maximumComponentResidual / Math.max(maximumTotalComponent, 1);
    if (!Number.isFinite(forceRelativeResidual) || forceRelativeResidual > 1e-8) {
      throw new Error('Reference force groups do not close at relative tolerance 1e-8');
    }
  } else if (maximumCpuUlpDistance > 2) {
    throw new Error('CPU force groups do not close within two binary32 ULPs');
  }
}

const FLOAT32_BITS_BUFFER_V044 = new ArrayBuffer(4);
const FLOAT32_BITS_VIEW_V044 = new DataView(FLOAT32_BITS_BUFFER_V044);

function float32UlpDistance(left: number, right: number) {
  return Math.abs(float32OrderedInteger(left) - float32OrderedInteger(right));
}

function float32OrderedInteger(value: number) {
  FLOAT32_BITS_VIEW_V044.setFloat32(0, value, false);
  const bits = FLOAT32_BITS_VIEW_V044.getUint32(0, false);
  return (bits & 0x80000000) === 0
    ? 0x80000000 + bits
    : 0x80000000 - (bits & 0x7fffffff);
}

function assertAllFalseClaims(value: object, label: string, expectedKeys: ReadonlyArray<string>) {
  assertExactKeys(value, expectedKeys, label);
  const entries = Object.entries(value);
  if (entries.length === 0 || entries.some(([, flag]) => flag !== false)) {
    throw new Error(`${label} must contain only explicit false values`);
  }
}

function safePlainClone<T>(value: T, label: string): T {
  try {
    assertBoundedPlainDataTree(value);
    void digestValue(value);
  } catch (error) {
    throw new Error(`${label} is not a canonical plain-data tree`, { cause: error });
  }
  const clone = structuredClone(value);
  assertStrictCanonicalTree(clone, label);
  return clone;
}

function assertBoundedPlainDataTree(value: unknown): void {
  const seen = new Set<object>();
  let nodes = 0;
  const visit = (node: unknown, depth: number): void => {
    nodes += 1;
    if (nodes > 100_000) throw new TypeError('plain-data tree exceeds 100000 nodes');
    if (depth > 64) throw new TypeError('plain-data tree exceeds depth 64');
    if (node === null || typeof node === 'boolean') return;
    if (typeof node === 'string') {
      if (node.length > 1_000_000) throw new TypeError('plain-data strings exceed 1000000 code units');
      return;
    }
    if (typeof node === 'number') {
      if (!Number.isFinite(node) || Object.is(node, -0)) {
        throw new TypeError('plain-data numbers must be finite and cannot be negative zero');
      }
      return;
    }
    if (typeof node !== 'object') throw new TypeError('plain-data tree has a non-JSON value');
    if (seen.has(node)) throw new TypeError('plain-data tree cannot contain cycles or aliases');
    seen.add(node);
    const descriptors = Object.getOwnPropertyDescriptors(node);
    const keys = Reflect.ownKeys(descriptors);
    if (keys.some((key) => typeof key !== 'string')) {
      throw new TypeError('plain-data tree cannot contain symbol keys');
    }
    if (Array.isArray(node)) {
      if (Object.getPrototypeOf(node) !== Array.prototype) {
        throw new TypeError('plain-data arrays must use the intrinsic Array prototype');
      }
      if (node.length > 100_000) throw new TypeError('plain-data arrays exceed 100000 items');
      const stringKeys = keys as string[];
      if (stringKeys.some((key) => key !== 'length'
        && !(Number.isInteger(Number(key)) && String(Number(key)) === key
          && Number(key) >= 0 && Number(key) < node.length))) {
        throw new TypeError('plain-data arrays cannot contain decorated keys');
      }
      for (let index = 0; index < node.length; index += 1) {
        const descriptor = descriptors[String(index)];
        if (!descriptor || !descriptor.enumerable || !('value' in descriptor)) {
          throw new TypeError('plain-data arrays must be dense enumerable data arrays');
        }
        visit(descriptor.value, depth + 1);
      }
      return;
    }
    const prototype = Object.getPrototypeOf(node);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError('plain-data records must have a plain prototype');
    }
    if (keys.length > 10_000) throw new TypeError('plain-data records exceed 10000 keys');
    for (const key of keys as string[]) {
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !('value' in descriptor) || descriptor.value === undefined) {
        throw new TypeError('plain-data records require enumerable defined data properties');
      }
      visit(descriptor.value, depth + 1);
    }
  };
  visit(value, 0);
}

function assertStrictCanonicalTree(value: unknown, label: string, depth = 0): void {
  if (depth > 64) throw new Error(`${label} exceeds the maximum canonical depth`);
  if (value === undefined) throw new Error(`${label} cannot contain undefined`);
  if (typeof value === 'number' && Object.is(value, -0)) {
    throw new Error(`${label} cannot contain negative zero`);
  }
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      if (!Object.hasOwn(value, index)) throw new Error(`${label} cannot contain sparse arrays`);
      assertStrictCanonicalTree(value[index], `${label}[${index}]`, depth + 1);
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    assertStrictCanonicalTree(child, `${label}.${key}`, depth + 1);
  }
}

function assertExactKeys(value: unknown, expected: ReadonlyArray<string>, label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be a plain record with exactly the locked keys`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain record with exactly the locked keys`);
  }
  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== 'string')) {
    throw new Error(`${label} must contain only locked string keys`);
  }
  const actual = [...keys as string[]].sort(compareAscii);
  const locked = [...expected].sort(compareAscii);
  if (actual.length !== locked.length || actual.some((key, index) => key !== locked[index])) {
    throw new Error(`${label} must contain exactly the locked keys`);
  }
}

function assertStableToken(value: unknown, label: string) {
  if (typeof value !== 'string' || !STABLE_TOKEN.test(value)) {
    throw new Error(`${label} must be a stable ASCII token`);
  }
}

function assertDigest(value: unknown, label: string) {
  if (typeof value !== 'string' || !DIGEST.test(value)) throw new Error(`${label} is invalid`);
}

function assertOneOf<T>(value: T, allowed: ReadonlyArray<T>, label: string) {
  if (!allowed.includes(value)) throw new Error(`${label} is not allowed`);
}

function assertInteger(value: unknown, minimum: number, maximum: number, label: string) {
  if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${label} must be a bounded safe integer`);
  }
}

function assertExactDeepValue(actual: unknown, expected: unknown, label: string): void {
  if (Object.is(actual, expected)) return;
  if (Array.isArray(actual) || Array.isArray(expected)) {
    if (!Array.isArray(actual) || !Array.isArray(expected) || actual.length !== expected.length) {
      throw new Error(`${label} is not the exact locked plan`);
    }
    for (let index = 0; index < expected.length; index += 1) {
      if (!Object.hasOwn(actual, index) || !Object.hasOwn(expected, index)) {
        throw new Error(`${label} is not the exact locked plan`);
      }
      assertExactDeepValue(actual[index], expected[index], `${label}[${index}]`);
    }
    return;
  }
  if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
    const actualKeys = Object.keys(actual).sort(compareAscii);
    const expectedKeys = Object.keys(expected).sort(compareAscii);
    if (actualKeys.length !== expectedKeys.length
      || actualKeys.some((key, index) => key !== expectedKeys[index])) {
      throw new Error(`${label} is not the exact locked plan`);
    }
    const actualRecord = actual as Record<string, unknown>;
    const expectedRecord = expected as Record<string, unknown>;
    for (const key of expectedKeys) {
      assertExactDeepValue(actualRecord[key], expectedRecord[key], `${label}.${key}`);
    }
    return;
  }
  throw new Error(`${label} is not the exact locked plan`);
}

function compareAscii(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function cellVolumeNanometer3([a, b, c]: CellVectorsNanometer3) {
  for (const vector of [a, b, c]) {
    if (![vector.x, vector.y, vector.z].every(Number.isFinite)) {
      throw new Error('system-plan cell vectors must contain only finite nanometer values');
    }
  }
  const determinant = a.x * (b.y * c.z - b.z * c.y)
    - b.x * (a.y * c.z - a.z * c.y)
    + c.x * (a.y * b.z - a.z * b.y);
  if (!(determinant > 0)) {
    throw new Error('system-plan cell must be finite, non-singular, and right-handed');
  }
  return determinant;
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
