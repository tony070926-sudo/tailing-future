import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import { describe, expect, it } from 'vitest';
import {
  OPENMM_TIP3P_REQUIRED_ARTIFACTS,
  computeArtifactBundleRoot,
} from './verify-control.mjs';

const ajv = new Ajv2020({ allErrors: true, strict: true });
const artifactSchema = JSON.parse(await readFile(
  new URL('../../../schemas/openmm-tip3p-artifact-manifest.schema.json', import.meta.url), 'utf8',
));
const receiptSchema = JSON.parse(await readFile(
  new URL('../../../schemas/openmm-tip3p-control-receipt.schema.json', import.meta.url), 'utf8',
));
const outcomeSchema = JSON.parse(await readFile(
  new URL('../../../schemas/openmm-tip3p-producer-outcome.schema.json', import.meta.url), 'utf8',
));
const validateArtifact = ajv.compile(artifactSchema);
const validateReceipt = ajv.compile(receiptSchema);
const validateOutcome = ajv.compile(outcomeSchema);

describe('OpenMM TIP3P v0.4.5 evidence schemas', () => {
  it('accepts the exact non-public artifact inventory and rejects shape or policy widening', () => {
    const manifest = makeManifest();
    expectValidation(validateArtifact, manifest, true);

    const wrongShape = structuredClone(manifest);
    wrongShape.artifacts.find((entry) => entry.id === 'reference-a-positions').shape = [100, 2685, 3];
    expectValidation(validateArtifact, wrongShape, true);
    // JSON Schema owns syntax; the independent semantic policy owns the exact locked shape.

    const publicPayload = structuredClone(manifest);
    publicPayload.publicationPolicy.rawScientificPayloadPublic = true;
    expectValidation(validateArtifact, publicPayload, false);

    const extra = structuredClone(manifest);
    extra.artifacts[0].unexpected = true;
    expectValidation(validateArtifact, extra, false);
  });

  it('accepts only independently recomputed non-promotional pass/fail receipts', () => {
    const receipt = makeReceipt();
    expectValidation(validateReceipt, receipt, true);

    const promoted = structuredClone(receipt);
    promoted.publicationPolicy.promotionEligible = true;
    expectValidation(validateReceipt, promoted, false);

    const producerTrusted = structuredClone(receipt);
    producerTrusted.verification.producerMetricsTrusted = true;
    expectValidation(validateReceipt, producerTrusted, false);

    const authenticatedWithoutAttestation = structuredClone(receipt);
    authenticatedWithoutAttestation.claims.openmmExecutionAuthenticated = true;
    expectValidation(validateReceipt, authenticatedWithoutAttestation, false);

    const hiddenFailedGate = structuredClone(receipt);
    hiddenFailedGate.gates.cpuReferenceGlobalForce = false;
    expectValidation(validateReceipt, hiddenFailedGate, false);

    const contradictory = structuredClone(receipt);
    contradictory.status = 'verified-fail';
    expectValidation(validateReceipt, contradictory, false);
  });

  it('keeps atomic producer completion separate from scientific acceptance', () => {
    const outcome = makeOutcome();
    expectValidation(validateOutcome, outcome, true);

    const promotional = structuredClone(outcome);
    promotional.claims.scientificPass = true;
    expectValidation(validateOutcome, promotional, false);

    const reordered = structuredClone(outcome);
    [reordered.stages[0], reordered.stages[1]] = [reordered.stages[1], reordered.stages[0]];
    expectValidation(validateOutcome, reordered, false);
  });
});

function makeOutcome() {
  const stages = [
    'guard', 'inputs', 'runtime', 'prepare', 'reference-a', 'reference-b',
    'cpu-fixed-coordinate', 'manifest',
  ].map((stage) => ({ stage, outcome: 'success' }));
  return {
    schemaVersion: 'tf.openmm-tip3p-producer-outcome/0.4.5',
    artifactId: 'tf.openmm-pure-water-cold-start-pme-control/1',
    planDigest: digest('plan'),
    systemDigest: digest('system'),
    status: 'complete-pass',
    statusDomain: 'producer-execution-integrity-only-not-scientific-assessment',
    terminalStage: null,
    stages,
    evidence: [],
    diagnosticMetrics: {},
    diagnosticMetricsAreAcceptance: false,
    claims: {
      scientificPass: false,
      accepted: false,
      reproduced: false,
      promotionEligible: false,
      protectedMainArtifact: false,
    },
  };
}

function makeManifest() {
  const artifacts = OPENMM_TIP3P_REQUIRED_ARTIFACTS.map((expected) => ({
    ...expected,
    shape: [...expected.shape],
    sizeBytes: expected.kind === 'array'
      ? expected.shape.reduce((product, value) => product * value, 1)
        * (expected.dtype === 'float64-le' ? 8 : 4)
      : 3,
    sha256: digest(expected.id),
  }));
  return {
    schemaVersion: 'tf.openmm-tip3p-artifact-manifest/0.4.5',
    profile: 'openmm-tip3p-producer-internal-evidence',
    systemDigest: digest('system'),
    planDigest: digest('plan'),
    sourceRevision: '7'.repeat(40),
    producerOutcomeDigest: digest('outcome'),
    artifacts,
    bundleRoot: computeArtifactBundleRoot(artifacts),
    publicationPolicy: {
      profile: 'tf.openmm-tip3p-internal-evidence/0.4.5',
      rawScientificPayloadPublic: false,
      parameterAssetsPublic: false,
      coordinateAssetsPublic: false,
      serializedSystemPublic: false,
      containerPublic: false,
      licenseClearanceRequired: true,
      independentVerificationRequired: true,
      attestationRequiredForPromotion: true,
    },
  };
}

function makeReceipt() {
  return {
    schemaVersion: 'tf.openmm-tip3p-control-receipt/0.4.5',
    profile: 'openmm-tip3p-independent-control-verification',
    statusDomain: 'independent-scientific-assessment-not-release-provenance',
    status: 'verified-pass',
    systemDigest: digest('system'),
    planDigest: digest('plan'),
    sourceRevision: '7'.repeat(40),
    producerOutcomeDigest: digest('outcome'),
    artifactManifestDigest: digest('manifest'),
    payloadBundleRoot: digest('bundle'),
    runtimeBindings: {
      baseImageIndexDigest: digest('index'),
      baseImagePlatformDigest: digest('platform'),
      derivedContainerImageDigest: null,
      pythonVersion: '3.12.11',
      numpyVersion: '2.2.6',
      openmmDistributionVersion: '8.6.0',
      openmmFullVersion: '8.6.0.dev-c6173db',
      openmmGitRevision: 'c6173db6e8edd705eb59172bd21e9ce69c572405',
      openmmReleaseFlag: false,
      referencePlatform: platform('Reference'),
      cpuPlatform: platform('CPU'),
    },
    verification: {
      verifierDigest: digest('verifier'),
      metricSource: 'independently-recomputed-from-complete-raw-arrays',
      producerMetricsTrusted: false,
      referenceReplayComparedAsRawBytes: true,
      cpuComparedAtReferenceCoordinatesOnly: true,
      authoritativeVelocityTimeGauge: 'openmm-verlet-raw-velocity-at-t-minus-dt-over-2',
      forceSemantics: 'potential-force-excluding-constraint-impulses',
      stateEnergyTemporalAlignment:
        'openmm-state-potential-and-integrator-adjusted-kinetic-at-position-time',
      rawHalfStepVelocitiesSufficientToRecomputeStateKineticEnergy: false,
      executionAuthenticityVerified: false,
      verifierRuntime: {
        nodeVersion: 'v24.16.0',
        platform: 'linux',
        architecture: 'x64',
      },
    },
    metrics: {
      referenceExactReplay: true,
      relativeEnergyExcursion: 1e-4,
      absoluteEnergyExcursionPerWaterKjMol: 1e-5,
      energyDriftSlopeKjMolPicosecond: 1e-6,
      maximumConstraintRelativeResidual: 1e-8,
      maximumRelativePotentialEnergyDifference: 1e-6,
      maximumMedianPerParticleRelativeForceError: 1e-5,
      maximumGlobalRelativeForceL2Error: 1e-5,
      referenceMaximumEnergyGroupRelativeResidual: 1e-10,
      referenceMaximumForceGroupRelativeResidual: 1e-10,
      cpuMaximumEnergyGroupRelativeResidual: 1e-10,
      cpuMaximumForceGroupUlpDistanceFloat32: 1,
      productionStartCenterOfMassSpeedNanometerPerPicosecond: 1e-14,
      productionStartMassWeightedMomentumRelativeResidual: 1e-14,
      productionStartMaximumVelocityConstraintRelativeResidual: 1e-10,
      productionStartKineticTemperatureKelvin: 299.9,
    },
    thresholds: {
      maximumRelativeEnergyExcursion: 0.001,
      maximumConstraintRelativeResidual: 0.000001,
      maximumRelativePotentialEnergyDifference: 0.00001,
      maximumMedianPerParticleRelativeForceError: 0.0001,
      maximumGlobalRelativeForceL2Error: 0.0001,
      referenceEnergyGroupMaximumRelativeResidual: 1e-8,
      referenceForceGroupMaximumRelativeResidual: 1e-8,
      cpuEnergyGroupMaximumRelativeResidual: 1e-8,
      cpuForceGroupMaximumUlpDistanceFloat32: 2,
      maximumProductionStartCenterOfMassSpeedNanometerPerPicosecond: 1e-12,
      maximumProductionStartVelocityConstraintRelativeResidual: 1e-8,
    },
    gates: {
      referenceExactReplay: true,
      referenceEnergyExcursion: true,
      referenceConstraintResidual: true,
      cpuReferencePotentialEnergy: true,
      cpuReferenceMedianParticleForce: true,
      cpuReferenceGlobalForce: true,
      referenceEnergyGroupClosure: true,
      referenceForceGroupClosure: true,
      cpuEnergyGroupClosure: true,
      cpuForceGroupClosure: true,
      productionStartCenterOfMass: true,
      productionStartVelocityConstraints: true,
      allPassed: true,
    },
    publicationPolicy: {
      licenseClearance: false,
      rawPayloadPublic: false,
      cloudflareDistributionEligible: false,
      protectedMainArtifact: false,
      attestedArtifact: false,
      promotionEligible: false,
    },
    claims: {
      openmmExecutionReportedByProducer: true,
      openmmExecutionAuthenticated: false,
      scientificPass: true,
      reproduced: false,
      bulkWaterValidated: false,
      interfaceSimulated: false,
      industrialPrediction: false,
      scorePromotionEligible: false,
    },
    receiptDigest: digest('receipt'),
  };
}

function platform(name) {
  return {
    name,
    pmeAlphaInverseNanometer: 2.918423065872431,
    pmeGrid: [90, 90, 90],
    pluginLoadFailures: [],
    properties: name === 'CPU' ? { Threads: '1', DeterministicForces: 'true' } : {},
  };
}

function expectValidation(validate, value, expected) {
  expect(validate(value), JSON.stringify(validate.errors)).toBe(expected);
}

function digest(label) {
  return `sha256:${createHash('sha256').update(label).digest('hex')}`;
}
