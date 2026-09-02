import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import {
  OPENMM_TIP3P_CONTROL_SHAPE,
  encodeFloat64LittleEndian,
} from './control-metrics.mjs';
import {
  OPENMM_TIP3P_EXPECTED_PLAN_DIGEST,
  OPENMM_TIP3P_EXPECTED_SYSTEM_DIGEST,
  OPENMM_TIP3P_REQUIRED_ARTIFACTS,
  computeArtifactBundleRoot,
  computeOpenMmTip3pVerifierDigest,
  verifyOpenMmTip3pArtifactDirectory,
} from './verify-control.mjs';

export const SOURCE_REVISION = '7'.repeat(40);
const ARTIFACT_ID = 'tf.openmm-pure-water-cold-start-pme-control/1';
const OPENMM_REVISION = 'c6173db6e8edd705eb59172bd21e9ce69c572405';
const REFERENCE_BACKEND_DIGEST =
  'sha256:7f7104ea225819798c9c06eed382298c4d90ec19484f632fc6910832369882b9';
const CPU_BACKEND_DIGEST =
  'sha256:8bea1d8a2f48897d34594fb416f791aa8d94c02807857182681c32c9d6e0424b';
const CONTAINER_INDEX_DIGEST =
  'sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7';
const CONTAINER_PLATFORM_DIGEST =
  'sha256:c00fc7b44d844b6da22861ec24af43968a5200eac4ec607b4725d585165d6b49';
const STATE_ENERGY_ALIGNMENT =
  'openmm-state-potential-and-integrator-adjusted-kinetic-at-position-time';
const STATE_KINETIC_SEMANTICS =
  'ReferenceIntegrateVerletStepKernel-computeShiftedKineticEnergy-plus-half-dt-with-velocity-constraints-1e-4';
const NON_PROMOTIONAL_CLAIMS = Object.freeze({
  accepted: false,
  promotionEligible: false,
  protectedMainArtifact: false,
  reproduced: false,
  scientificPass: false,
});
const STAGES = [
  'guard', 'inputs', 'runtime', 'prepare', 'reference-a', 'reference-b',
  'cpu-fixed-coordinate', 'manifest',
];
const { particleCount, componentCount, sampleCount } = OPENMM_TIP3P_CONTROL_SHAPE;

export function verifyDirectory(root) {
  return verifyOpenMmTip3pArtifactDirectory({
    root,
    expectedSystemDigest: OPENMM_TIP3P_EXPECTED_SYSTEM_DIGEST,
    expectedPlanDigest: OPENMM_TIP3P_EXPECTED_PLAN_DIGEST,
    expectedSourceRevision: SOURCE_REVISION,
    verifierDigest: computeOpenMmTip3pVerifierDigest(),
  });
}

export function makeProducerDirectory({
  tamperRuntimeSelfDigest = false,
  tamperReferenceParent = false,
  positionLayout = 'collapsed-verifier-fixture',
} = {}) {
  const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'tf-openmm-directory-verifier-')));
  mkdirSync(path.join(root, 'arrays'));
  mkdirSync(path.join(root, 'manifests'));

  if (!['collapsed-verifier-fixture', 'synthetic-spatial-render-fixture'].includes(positionLayout)) {
    throw new Error('test fixture position layout is invalid');
  }
  const arrayBytes = makePassingArrayEvidence(positionLayout);
  const descriptorById = new Map();
  for (const expected of OPENMM_TIP3P_REQUIRED_ARTIFACTS) {
    if (expected.kind !== 'array') continue;
    const bytes = Buffer.from(arrayBytes.get(expected.id));
    writeArtifact(root, expected.path, bytes);
    descriptorById.set(expected.id, descriptorFor(expected, bytes));
  }

  const input = withSelfDigest({
    schemaVersion: 'tf.openmm-tip3p-input-receipt/0.4.5',
    artifactId: ARTIFACT_ID,
    planDigest: OPENMM_TIP3P_EXPECTED_PLAN_DIGEST,
    systemDigest: OPENMM_TIP3P_EXPECTED_SYSTEM_DIGEST,
    networkAccessUsed: false,
    sources: [
      inputSource('coordinates', 'tip3p.pdb', 179_998,
        'sha256:14fd37900d627c0e258d6086a14c6084e4bec1422e9d20fccfc83c3f814fd7ee'),
      inputSource('license', 'Licenses.txt', 9_305,
        'sha256:437b7168cc997abea3b5f2a9e0fb6894f96de77b9c69be428ccfcfe9bed58293'),
      inputSource('parameters', 'tip3p.xml', 19_070,
        'sha256:3f4b188dbcb6c02863230eaca231e927fb6bf3307ce947d8a50d0f46f6dd83d9'),
    ],
    claims: NON_PROMOTIONAL_CLAIMS,
  }, 'receiptDigest');
  writeCanonical(root, 'manifests/input-receipt.json', input);

  const runtime = withSelfDigest({
    schemaVersion: 'tf.openmm-runtime-inventory/0.4.5',
    artifactId: ARTIFACT_ID,
    planDigest: OPENMM_TIP3P_EXPECTED_PLAN_DIGEST,
    systemDigest: OPENMM_TIP3P_EXPECTED_SYSTEM_DIGEST,
    scope: 'cpu-model-flags-microcode-kernel-glibc-loaded-libraries-openmm-plugins-platform-properties',
    containerIndexDigest: CONTAINER_INDEX_DIGEST,
    containerPlatformDigest: CONTAINER_PLATFORM_DIGEST,
    pythonVersion: '3.12.11',
    numpyVersion: '2.2.6',
    openmmDistributionVersion: '8.6.0',
    openmmFullVersion: '8.6.0.dev-c6173db',
    openmmGitRevision: OPENMM_REVISION,
    openmmReleaseFlag: false,
    actualContextProperties: 'recorded-per-lane-after-context-creation',
    python: {
      version: '3.12.11', implementation: 'CPython', executable: '/usr/local/bin/python3',
      flags: { dontWriteBytecode: true, ignoreEnvironment: false, noUserSite: true, safePath: true },
    },
    host: {
      system: 'Linux', machine: 'x86_64', kernelRelease: 'fixture', kernelVersion: 'fixture',
      glibc: ['glibc', '2.41'], cpu: [],
    },
    packages: { numpy: '2.2.6', openmm: '8.6.0' },
    openmm: {
      defaultPluginsDirectory: '/opt/openmm/plugins', pluginLoadFailures: [],
      platforms: [{ index: 0, name: 'Reference', propertyNames: [], speed: 1 },
        { index: 1, name: 'CPU', propertyNames: ['Threads', 'DeterministicForces'], speed: 2 }],
    },
    loadedLibraries: [],
    pluginLoadFailures: [],
    claims: NON_PROMOTIONAL_CLAIMS,
  }, 'inventoryDigest');
  if (tamperRuntimeSelfDigest) runtime.inventoryDigest = digest('stale-runtime-self-digest');
  writeCanonical(root, 'manifests/runtime-inventory.json', runtime);

  const compiledTopologyDigest = digest('compiled-topology');
  const serializedSystemDigest = digest('serialized-system');
  const atomOrderDigest = digest('atom-order');
  const prepareArrayIds = [
    'cell', 'masses', 'constraints', 'constraint-targets', 'comparison-steps',
    'start-positions', 'start-velocities',
  ];
  const portableStartDigest = sha256(pythonCanonicalBytes({
    cellSha256: descriptorById.get('cell').sha256,
    positionSha256: descriptorById.get('start-positions').sha256,
    velocitySha256: descriptorById.get('start-velocities').sha256,
    atomOrderDigest,
  }));
  const kineticTemperatureKelvin = 20
    / ((3 * particleCount - particleCount - 3) * 0.00831446261815324);
  const prepare = withSelfDigest({
    schemaVersion: 'tf.openmm-tip3p-prepare-receipt/0.4.5',
    artifactId: ARTIFACT_ID,
    planDigest: OPENMM_TIP3P_EXPECTED_PLAN_DIGEST,
    status: 'complete',
    systemId: 'openmm-8.6-tip3p-895-water-pme-control',
    systemDigest: OPENMM_TIP3P_EXPECTED_SYSTEM_DIGEST,
    backendManifestDigest: REFERENCE_BACKEND_DIGEST,
    runtimeInventoryDigest: runtime.inventoryDigest,
    compiledTopologyDigest,
    serializedSystemDigest,
    atomOrderDigest,
    forceClassCounts: { HarmonicAngleForce: 1, HarmonicBondForce: 1, NonbondedForce: 1 },
    topology: {
      waterMoleculeCount: 895, particleCount: 2_685, topologyBondCount: 1_790,
      constraintCount: 2_685, exceptionCount: 2_685, harmonicBondTermCount: 0,
      harmonicAngleTermCount: 0, nonbondedForceCount: 1, centerOfMassRemoverCount: 0,
      totalForceCount: 3,
    },
    actualContextProperties: {},
    pmeWarmupAndReadback: pmeReadback({}),
    minimization: {
      algorithm: 'OpenMM-LocalEnergyMinimizer-LBFGS', toleranceKjMolNanometer: 1,
      maximumIterationsArgument: 5_000, maximumIterationsPerRestraintCycle: 5_000,
      iterationSemantics:
        'OpenMM-maxIterations-argument-does-not-bound-total-reporter-callbacks-across-constraint-restarts',
      prePotentialEnergyKjMol: -90, postInternalMinimizerPotentialEnergyKjMol: -100,
      terminalGradientRmsKjMolNanometer: 0.5, maximumConstraintRelativeResidual: 0,
      postPotentialEnergyKjMol: -100,
      prePotentialForceComponentRmsKjMolNanometer: 1,
      postPotentialForceComponentRmsKjMolNanometer: 1,
      preConstraintRelativeResidual: 0, preApplyConstraintsRelativeResidual: 0,
      postApplyConstraintsRelativeResidual: 0,
      allPositionsFinite: true, allForcesFinite: true, allEnergiesFinite: true,
      reporterObservedTerminalState: true, postMinimizationApplyConstraintsPerformed: true,
      reporterTerminalStateInterpretation:
        'last-successful-lbfgs-iterate-before-openmm-internal-final-constraint-projection',
      reporterTerminalOptimizerPositionSha256: digest('minimizer-position'),
      postInternalConstraintProjectionPositionSha256: digest('post-projection-position'),
      maximumReporterToPostInternalProjectionComponentDisplacementNanometer: 0,
      terminalReporterConstraintRelativeResidual: 0,
      postconditionsAreProducerDiagnosticsOnly: true,
      reporter: {
        reportCount: 1, restraintCycles: 1, maximumIterationIndex: 0, lastIterationIndex: 0,
        lastArguments: {
          'max constraint error': 0,
          'restraint energy': 0,
          'restraint strength': 1,
          'system energy': -100,
        },
        lastPositionSha256: digest('minimizer-position'),
        lastObjectiveGradientRmsKjMolNanometer: 0.5, globalCallbackOrdinal: 0,
        maximumReporterCallbacks: 20_000, maximumConstraintRestarts: 3,
        wallClockTimeoutSeconds: 1_800, constraintRestartCount: 0,
        budgetExhaustion: null, reporterNeverStoppedMinimizationEarly: true,
      },
    },
    velocityInitialization: {
      method: 'OpenMM-setVelocitiesToTemperature', temperatureKelvin: 300,
      randomSeed: 20_260_901,
      operationOrder: [
        'setVelocitiesToTemperature', 'removeMassWeightedCenterOfMassVelocity',
        'applyVelocityConstraints',
      ],
      operationSequence: [
        'OpenMM-setVelocitiesToTemperature', 'remove-mass-weighted-center-of-mass-velocity',
        'OpenMM-setVelocities', 'OpenMM-applyVelocityConstraints',
      ],
      setVelocitiesToTemperatureInternalConstraintTolerance: 1e-5,
      removeMassWeightedCenterOfMassVelocity: true,
      applyVelocityConstraintsAfterCenterOfMassRemoval: true,
      explicitVelocityConstraintTolerance: 1e-8,
      constraintTolerance: 1e-8,
      firstVelocityConstraintRelativeResidual: 0,
      removedCenterOfMassVelocityNanometerPerPicosecond: [0, 0, 0],
      postconditionEvaluationPoint: 'after-explicit-applyVelocityConstraints',
      seedAloneIsReplayInput: false,
      sequence: 'set-temperature-remove-mass-weighted-com-apply-velocity-constraints',
      velocityConstraintRelativeResidual: 0,
      massWeightedMomentumRelativeResidual: 0,
      finalVelocityConstraintRelativeResidual: 0,
      finalCenterOfMassVelocityNanometerPerPicosecond: [0, 0, 0],
      finalCenterOfMassSpeedNanometerPerPicosecond: 0,
      centerOfMassVelocityFormula: 'norm(sum(m_i*v_i))/sum(m_i)',
      maximumCenterOfMassSpeedNanometerPerPicosecond: 1e-12,
      velocityConstraintResidualFormula:
        'max(abs(dot(r_ij,v_j-v_i))/max(norm(r_ij)*norm(v_j-v_i),1e-12-nm2-ps))',
      maximumVelocityConstraintRelativeResidual: 1e-8,
      actualKineticTemperatureKelvin: kineticTemperatureKelvin,
    },
    forceSemantics: 'potential-force-excluding-constraint-impulses',
    velocitySemantics: 'raw-openmm-verlet-half-step-associated-velocity',
    energyTemporalAlignment: STATE_ENERGY_ALIGNMENT,
    stateKineticEnergySemantics: STATE_KINETIC_SEMANTICS,
    rawHalfStepVelocitiesSufficientToRecomputeStateKineticEnergy: false,
    portableProductionStartStateDigest: portableStartDigest,
    arrays: descriptors(descriptorById, prepareArrayIds),
    claims: NON_PROMOTIONAL_CLAIMS,
  }, 'receiptDigest');
  writeCanonical(root, 'manifests/prepare-receipt.json', prepare);

  const referenceA = referenceReceipt({
    replica: 'a', processId: 101, parentDigest: prepare.receiptDigest, portableStartDigest,
    compiledTopologyDigest, serializedSystemDigest, atomOrderDigest, descriptorById,
  });
  const referenceB = referenceReceipt({
    replica: 'b', processId: 102,
    parentDigest: tamperReferenceParent ? digest('substituted-parent') : prepare.receiptDigest,
    portableStartDigest, compiledTopologyDigest, serializedSystemDigest, atomOrderDigest,
    descriptorById,
  });
  writeCanonical(root, 'manifests/reference-a-run.json', referenceA);
  writeCanonical(root, 'manifests/reference-b-run.json', referenceB);

  const cpu = cpuReceipt({
    processId: 103, prepareDigest: prepare.receiptDigest,
    referenceDigest: referenceA.runReceiptDigest,
    compiledTopologyDigest, serializedSystemDigest, atomOrderDigest, descriptorById, arrayBytes,
  });
  writeCanonical(root, 'manifests/cpu-fixed-coordinate-run.json', cpu);

  const diagnostics = withSelfDigest({
    schemaVersion: 'tf.openmm-tip3p-producer-diagnostics/0.4.5',
    artifactId: ARTIFACT_ID,
    planDigest: OPENMM_TIP3P_EXPECTED_PLAN_DIGEST,
    systemDigest: OPENMM_TIP3P_EXPECTED_SYSTEM_DIGEST,
    statusDomain: 'producer-diagnostics-only-independent-verifier-required',
    thresholdsApplied: false,
    acceptanceDecision: null,
    metrics: {
      referenceRelativeEnergyExcursion: 0,
      referenceMaximumConstraintRelativeResidual: 0,
      cpuReferenceMaximumRelativePotentialEnergyDifference: 0,
      cpuReferenceMaximumMedianPerParticleRelativeForceError: 0,
      cpuReferenceMaximumGlobalRelativeForceL2Error: 0,
      referenceMaximumRelativeGroupEnergyClosureResidual: 0,
      referenceMaximumRelativeGroupForceClosureResidual: 0,
      cpuMaximumRelativeGroupEnergyClosureResidual: 0,
      cpuMaximumRelativeGroupForceClosureResidual: 0,
    },
    referenceReplay: referenceReplayDiagnostic(arrayBytes),
    claims: NON_PROMOTIONAL_CLAIMS,
  }, 'diagnosticsDigest');
  writeCanonical(root, 'manifests/producer-diagnostics.json', diagnostics);

  for (const expected of OPENMM_TIP3P_REQUIRED_ARTIFACTS) {
    if (expected.kind !== 'canonical-json') continue;
    const bytes = readFileSync(path.join(root, expected.path));
    descriptorById.set(expected.id, descriptorFor(expected, bytes));
  }
  const artifactDescriptors = [...descriptorById.values()]
    .sort((left, right) => left.id.localeCompare(right.id));

  const evidencePaths = [
    ...OPENMM_TIP3P_REQUIRED_ARTIFACTS.map((entry) => entry.path),
    'manifests/input-receipt.json', 'manifests/producer-diagnostics.json',
  ].sort();
  const evidence = evidencePaths.map((relativePath) => {
    const bytes = readFileSync(path.join(root, relativePath));
    return {
      path: relativePath,
      stage: stageFor(relativePath),
      sizeBytes: bytes.length,
      sha256: sha256(bytes),
      stageOutcome: 'success',
    };
  });
  const outcome = {
    schemaVersion: 'tf.openmm-tip3p-producer-outcome/0.4.5',
    artifactId: ARTIFACT_ID,
    planDigest: OPENMM_TIP3P_EXPECTED_PLAN_DIGEST,
    systemDigest: OPENMM_TIP3P_EXPECTED_SYSTEM_DIGEST,
    status: 'complete-pass',
    statusDomain: 'producer-execution-integrity-only-not-scientific-assessment',
    terminalStage: null,
    stages: STAGES.map((stage) => ({ stage, outcome: 'success' })),
    evidence,
    diagnosticMetrics: diagnostics,
    diagnosticMetricsAreAcceptance: false,
    claims: NON_PROMOTIONAL_CLAIMS,
  };
  const outcomeBytes = pythonCanonicalBytes(outcome);
  writeArtifact(root, 'manifests/producer-outcome.json', outcomeBytes);

  const manifest = {
    schemaVersion: 'tf.openmm-tip3p-artifact-manifest/0.4.5',
    profile: 'openmm-tip3p-producer-internal-evidence',
    systemDigest: OPENMM_TIP3P_EXPECTED_SYSTEM_DIGEST,
    planDigest: OPENMM_TIP3P_EXPECTED_PLAN_DIGEST,
    sourceRevision: SOURCE_REVISION,
    producerOutcomeDigest: sha256(outcomeBytes),
    artifacts: artifactDescriptors,
    bundleRoot: computeArtifactBundleRoot(artifactDescriptors),
    publicationPolicy: {
      profile: 'tf.openmm-tip3p-internal-evidence/0.4.5',
      rawScientificPayloadPublic: false, parameterAssetsPublic: false,
      coordinateAssetsPublic: false, serializedSystemPublic: false, containerPublic: false,
      licenseClearanceRequired: true, independentVerificationRequired: true,
      attestationRequiredForPromotion: true,
    },
  };
  writeCanonical(root, 'manifests/artifact-manifest.json', manifest);
  return { root };
}

function referenceReceipt({
  replica, processId, parentDigest, portableStartDigest, compiledTopologyDigest,
  serializedSystemDigest, atomOrderDigest, descriptorById,
}) {
  const prefix = `reference-${replica}`;
  return withSelfDigest({
    schemaVersion: 'tf.openmm-tip3p-reference-run/0.4.5', artifactId: ARTIFACT_ID,
    planDigest: OPENMM_TIP3P_EXPECTED_PLAN_DIGEST, status: 'complete', lane: prefix,
    platform: 'Reference', systemDigest: OPENMM_TIP3P_EXPECTED_SYSTEM_DIGEST,
    backendManifestDigest: REFERENCE_BACKEND_DIGEST, replica, processId,
    freshProcessRequired: true, compiledTopologyDigest, serializedSystemDigest, atomOrderDigest,
    prepareReceiptDigest: parentDigest, portableProductionStartStateDigest: portableStartDigest,
    startPositionSha256: descriptorById.get('start-positions').sha256,
    startVelocitySha256: descriptorById.get('start-velocities').sha256,
    integrator: 'OpenMM-VerletIntegrator', timeStepPicoseconds: 0.001,
    integratedSteps: 1_000, sampleCount: 101, sampleStrideSteps: 10,
    actualContextProperties: {}, pmeWarmupAndReadback: pmeReadback({}),
    actualPmeContextParameters: pmeParameters(), platformProperties: {},
    forceSemantics: 'potential-force-excluding-constraint-impulses',
    velocitySemantics: 'raw-openmm-verlet-half-step-associated-velocity',
    velocityReadbackSemantics:
      'prepared-step-0-then-raw-OpenMM-Verlet-half-step-velocities-no-resynchronization',
    velocityTemporalAlignment: 'openmm-verlet-raw-velocity-at-t-minus-dt-over-2',
    energyColumnOrder: ['potential', 'kinetic', 'total'],
    energyTemporalAlignment: STATE_ENERGY_ALIGNMENT,
    stateKineticEnergySemantics: STATE_KINETIC_SEMANTICS,
    rawHalfStepVelocitiesSufficientToRecomputeStateKineticEnergy: false,
    groupOrder: [
      'total', 'harmonic-bond', 'harmonic-angle',
      'nonbonded-direct-and-lennard-jones', 'nonbonded-reciprocal',
    ],
    positionsEnforcePeriodicBox: false, integrationForceGroupsMask: 15,
    determinism: {
      scope: 'same-host-same-container-fresh-process-exact-required',
      executionMode: 'canonical-reference-trajectory-and-fixed-coordinate-evaluation',
      freeTrajectoryCrossPlatformEquality: false,
      randomSeedReconstructsPortableState: false,
    },
    fallbackPolicy: 'reject-no-algorithm-or-platform-fallback',
    arrays: descriptors(descriptorById, [
      `${prefix}-sample-steps`, `${prefix}-sample-times`, `${prefix}-positions`,
      `${prefix}-velocities`, `${prefix}-potential-forces`, `${prefix}-energies`,
      `${prefix}-comparison-group-energies`, `${prefix}-comparison-group-forces`,
    ]),
    claims: NON_PROMOTIONAL_CLAIMS,
  }, 'runReceiptDigest');
}

function cpuReceipt({
  processId, prepareDigest, referenceDigest, compiledTopologyDigest, serializedSystemDigest,
  atomOrderDigest, descriptorById, arrayBytes,
}) {
  const cellBytes = arrayBytes.get('cell');
  const trajectory = arrayBytes.get('reference-a-positions');
  const frameBytes = componentCount * 8;
  const frames = [0, 1, 10, 50, 100];
  return withSelfDigest({
    schemaVersion: 'tf.openmm-tip3p-cpu-fixed-coordinate-run/0.4.5',
    artifactId: ARTIFACT_ID, planDigest: OPENMM_TIP3P_EXPECTED_PLAN_DIGEST,
    status: 'complete', lane: 'cpu-fixed-coordinate', platform: 'CPU',
    systemDigest: OPENMM_TIP3P_EXPECTED_SYSTEM_DIGEST,
    backendManifestDigest: CPU_BACKEND_DIGEST, processId,
    fixedCoordinateComparisonOnly: true, freeTrajectoryExecution: false, integratedSteps: 0,
    compiledTopologyDigest, serializedSystemDigest, atomOrderDigest,
    prepareReceiptDigest: prepareDigest, referenceRunReceiptDigest: referenceDigest,
    actualContextProperties: { DeterministicForces: 'true', Threads: '1' },
    pmeWarmupAndReadback: pmeReadback({ DeterministicForces: 'true', Threads: '1' }),
    actualPmeContextParameters: pmeParameters(),
    platformProperties: { DeterministicForces: 'true', Threads: '1' },
    comparisonMode: 'fixed-reference-a-coordinates-no-integration-no-projection',
    warmupEnergyEvaluationCompletedBeforePmeReadback: true,
    coordinateReadbackMatchedReferenceInput: true,
    coordinateReceipts: [0, 10, 100, 500, 1_000].map((step, index) => {
      const source = trajectory.subarray(frames[index] * frameBytes, (frames[index] + 1) * frameBytes);
      return {
        step, sourceReferenceFrameIndex: frames[index],
        setPositionSha256: sha256(source), getPositionSha256: sha256(source),
        setCellSha256: sha256(cellBytes), getCellSha256: sha256(cellBytes),
        warmupPotentialEnergyKjMol: -100,
      };
    }),
    forceSemantics: 'potential-force-excluding-constraint-impulses',
    groupOrder: [
      'total', 'harmonic-bond', 'harmonic-angle',
      'nonbonded-direct-and-lennard-jones', 'nonbonded-reciprocal',
    ],
    positionsEnforcePeriodicBox: false,
    determinism: {
      scope: 'fixed-coordinate-comparison-only-no-integration',
      executionMode: 'fixed-coordinate-evaluation-only-zero-integrated-steps',
      freeTrajectoryCrossPlatformEquality: false,
      randomSeedReconstructsPortableState: false,
    },
    fallbackPolicy: 'reject-no-algorithm-or-platform-fallback',
    arrays: descriptors(descriptorById, [
      'cpu-readback-positions', 'cpu-readback-cells',
      'cpu-comparison-group-energies', 'cpu-comparison-group-forces',
    ]),
    claims: NON_PROMOTIONAL_CLAIMS,
  }, 'runReceiptDigest');
}

function pmeParameters() {
  return {
    alphaInverseNanometer: 2.918423065872431,
    grid: [90, 90, 90],
    readbackSource: 'OpenMM-NonbondedForce-getPMEParametersInContext',
  };
}

function referenceReplayDiagnostic(arrayBytes) {
  const suffixes = [
    'sample-steps', 'sample-times', 'positions', 'velocities', 'potential-forces', 'energies',
    'comparison-group-energies', 'comparison-group-forces',
  ];
  return {
    arrays: suffixes.map((suffix) => {
      const referenceASha256 = sha256(arrayBytes.get(`reference-a-${suffix}`));
      const referenceBSha256 = sha256(arrayBytes.get(`reference-b-${suffix}`));
      return {
        arraySuffix: `${suffix}.${suffix.includes('steps') ? 'u32le' : 'f64le'}`,
        referenceASha256,
        referenceBSha256,
        bytewiseEqual: referenceASha256 === referenceBSha256,
      };
    }),
    allEightArraysBytewiseEqual: true,
  };
}

function pmeReadback(platformProperties) {
  return {
    warmupOperation: 'getState-getEnergy-true-after-setPositions',
    warmupPotentialEnergyKjMol: -100,
    actualPmeContextParameters: pmeParameters(),
    cellNanometer: [[3, 0, 0], [0, 3, 0], [0, 0, 3]],
    platformProperties,
  };
}

function inputSource(role, sourcePath, sizeBytes, sourceDigest) {
  return {
    role, path: sourcePath, sizeBytes, sha256: sourceDigest, sourceCommit: OPENMM_REVISION,
    explicitRuntimeInput: true, redistributionCleared: false,
  };
}

function descriptors(byId, ids) {
  return [...ids].sort().map((id) => structuredClone(byId.get(id)));
}

function descriptorFor(expected, bytes) {
  return {
    ...expected,
    shape: [...expected.shape],
    sizeBytes: bytes.length,
    sha256: sha256(bytes),
  };
}

function withSelfDigest(value, digestKey) {
  const digestValue = sha256(pythonCanonicalBytes(value));
  return { ...value, [digestKey]: digestValue };
}

function writeCanonical(root, relativePath, value) {
  writeArtifact(root, relativePath, pythonCanonicalBytes(value));
}

function writeArtifact(root, relativePath, bytes) {
  writeFileSync(path.join(root, relativePath), bytes, { flag: 'wx' });
}

// Python json.dumps(sort_keys=True, separators=(",", ":"), ensure_ascii=True)
// style for this fixture's finite JSON number domain, including padded exponents and one LF.
function pythonCanonicalBytes(value) {
  return Buffer.from(`${pythonCanonicalJson(value)}\n`, 'ascii');
}

function pythonCanonicalJson(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(pythonCanonicalJson).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => (
      `${JSON.stringify(key)}:${pythonCanonicalJson(value[key])}`
    )).join(',')}}`;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('fixture JSON contains a non-finite number');
    const magnitude = Math.abs(value);
    const initial = !Number.isInteger(value) && magnitude !== 0 && magnitude < 1e-4
      ? value.toExponential()
      : JSON.stringify(value);
    return initial.replace(/e([+-]?)(\d+)$/, (_match, sign, digits) => (
      `e${sign === '-' ? '-' : '+'}${digits.padStart(2, '0')}`
    ));
  }
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError('fixture JSON contains an unsupported value');
  return encoded;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function stageFor(relativePath) {
  if (relativePath === 'manifests/input-receipt.json') return 'inputs';
  if (relativePath === 'manifests/runtime-inventory.json') return 'runtime';
  if (relativePath === 'manifests/prepare-receipt.json'
      || ['cell', 'masses', 'constraints', 'constraint-targets', 'comparison-steps',
        'start-positions', 'start-velocities'].some((id) => (
        relativePath === OPENMM_TIP3P_REQUIRED_ARTIFACTS.find((entry) => entry.id === id)?.path
      ))) return 'prepare';
  if (relativePath.includes('reference-a-')) return 'reference-a';
  if (relativePath.includes('reference-b-')) return 'reference-b';
  return 'cpu-fixed-coordinate';
}

function makePassingArrayEvidence(positionLayout) {
  const evidence = new Map();
  const cell = Float64Array.from([3, 0, 0, 0, 3, 0, 0, 0, 3]);
  const masses = new Float64Array(particleCount);
  const constraints = new Uint32Array(particleCount * 2);
  const targets = new Float64Array(particleCount);
  const oxygenHydrogenDistance = 0.09572;
  const angle = 1.82421813418;
  const hydrogenHydrogenDistance = 2 * oxygenHydrogenDistance * Math.sin(angle / 2);
  for (let water = 0; water < particleCount / 3; water += 1) {
    const base = water * 3;
    masses.set([15.99943, 1.007947, 1.007947], base);
    const pairs = [[base, base + 1], [base, base + 2], [base + 1, base + 2]];
    for (let local = 0; local < pairs.length; local += 1) {
      const constraint = base + local;
      constraints[constraint * 2] = pairs[local][0];
      constraints[constraint * 2 + 1] = pairs[local][1];
      targets[constraint] = local === 2 ? hydrogenHydrogenDistance : oxygenHydrogenDistance;
    }
  }
  const steps = Uint32Array.from({ length: sampleCount }, (_, index) => index * 10);
  const times = Float64Array.from({ length: sampleCount }, (_, index) => index * 0.01);
  const positions = new Float64Array(sampleCount * componentCount);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const sampleOffset = sample * componentCount;
    const translation = sample / 65_536;
    for (let water = 0; water < particleCount / 3; water += 1) {
      const offset = sampleOffset + water * 9;
      const spatial = positionLayout === 'synthetic-spatial-render-fixture';
      const x = spatial ? 0.12 + (water % 10) * 0.285 : 0;
      const y = spatial ? 0.12 + (Math.floor(water / 10) % 10) * 0.285 : 0;
      const z = spatial ? 0.15 + Math.floor(water / 100) * 0.32 : 0;
      positions[offset] = x + translation;
      positions[offset + 1] = y + (spatial ? translation : 0);
      positions[offset + 2] = z + (spatial ? translation : 0);
      positions[offset + 3] = x + translation + oxygenHydrogenDistance;
      positions[offset + 4] = y + (spatial ? translation : 0);
      positions[offset + 5] = z + (spatial ? translation : 0);
      positions[offset + 6] = x + translation + oxygenHydrogenDistance * Math.cos(angle);
      positions[offset + 7] = y + (spatial ? translation : 0)
        + oxygenHydrogenDistance * Math.sin(angle);
      positions[offset + 8] = z + (spatial ? translation : 0);
    }
  }
  const velocities = new Float64Array(sampleCount * componentCount);
  const forces = new Float64Array(sampleCount * componentCount);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const start = sample * componentCount;
    const end = start + componentCount;
    velocities.fill(sample / 1_024, start, end);
    forces.fill(1 + sample / 128, start, end);
  }
  const energies = new Float64Array(sampleCount * 3);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    energies[sample * 3] = -100;
    energies[sample * 3 + 1] = 10;
    energies[sample * 3 + 2] = -90;
  }
  const groupEnergies = new Float64Array(25);
  const groupForces = new Float64Array(25 * componentCount);
  const comparisonSamples = [0, 1, 10, 50, 100];
  for (let step = 0; step < 5; step += 1) {
    const energyOffset = step * 5;
    groupEnergies[energyOffset] = -100;
    groupEnergies[energyOffset + 3] = -70;
    groupEnergies[energyOffset + 4] = -30;
    const forceOffset = step * 5 * componentCount;
    const forceValue = 1 + comparisonSamples[step] / 128;
    groupForces.fill(forceValue, forceOffset, forceOffset + componentCount);
    groupForces.fill(
      forceValue * 0.75,
      forceOffset + 3 * componentCount,
      forceOffset + 4 * componentCount,
    );
    groupForces.fill(
      forceValue * 0.25,
      forceOffset + 4 * componentCount,
      forceOffset + 5 * componentCount,
    );
  }
  const cpuPositions = new Float64Array(5 * componentCount);
  for (let step = 0; step < 5; step += 1) {
    const sample = [0, 1, 10, 50, 100][step];
    cpuPositions.set(
      positions.subarray(sample * componentCount, (sample + 1) * componentCount),
      step * componentCount,
    );
  }
  const cpuCells = new Float64Array(5 * 9);
  for (let step = 0; step < 5; step += 1) cpuCells.set(cell, step * 9);

  evidence.set('cell', encodeFloat64LittleEndian(cell));
  evidence.set('masses', encodeFloat64LittleEndian(masses));
  evidence.set('constraints', encodeUint32LittleEndian(constraints));
  evidence.set('constraint-targets', encodeFloat64LittleEndian(targets));
  evidence.set('comparison-steps', encodeUint32LittleEndian([0, 10, 100, 500, 1_000]));
  evidence.set('start-positions', encodeFloat64LittleEndian(positions.subarray(0, componentCount)));
  evidence.set('start-velocities', encodeFloat64LittleEndian(velocities.subarray(0, componentCount)));
  for (const prefix of ['reference-a', 'reference-b']) {
    evidence.set(`${prefix}-sample-steps`, encodeUint32LittleEndian(steps));
    evidence.set(`${prefix}-sample-times`, encodeFloat64LittleEndian(times));
    evidence.set(`${prefix}-positions`, encodeFloat64LittleEndian(positions));
    evidence.set(`${prefix}-velocities`, encodeFloat64LittleEndian(velocities));
    evidence.set(`${prefix}-potential-forces`, encodeFloat64LittleEndian(forces));
    evidence.set(`${prefix}-energies`, encodeFloat64LittleEndian(energies));
    evidence.set(`${prefix}-comparison-group-energies`, encodeFloat64LittleEndian(groupEnergies));
    evidence.set(`${prefix}-comparison-group-forces`, encodeFloat64LittleEndian(groupForces));
  }
  evidence.set('cpu-readback-positions', encodeFloat64LittleEndian(cpuPositions));
  evidence.set('cpu-readback-cells', encodeFloat64LittleEndian(cpuCells));
  evidence.set('cpu-comparison-group-energies', encodeFloat64LittleEndian(groupEnergies));
  evidence.set('cpu-comparison-group-forces', encodeFloat64LittleEndian(groupForces));
  return evidence;
}

function encodeUint32LittleEndian(values) {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1) view.setUint32(index * 4, values[index], true);
  return bytes;
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function digest(label) {
  return sha256(Buffer.from(label));
}
