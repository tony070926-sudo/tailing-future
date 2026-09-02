import { createHash } from 'node:crypto';
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  readSync,
  realpathSync,
} from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalJson,
  parseJsonRejectDuplicateKeys,
} from '../runtime-input-contract.mjs';
import {
  OPENMM_TIP3P_CONTROL_SHAPE,
  OPENMM_TIP3P_CONTROL_THRESHOLDS,
  assertReferenceReplayExact,
  computeAbsoluteEnergyExcursionPerWaterKjMol,
  computeCpuReferenceComparison,
  computeEnergyDriftSlopeKjMolPicosecond,
  computeForceGroupClosure,
  computeMaximumConstraintRelativeResidual,
  computeRelativeEnergyExcursion,
  decodeFloat64LittleEndian,
  decodeUint32LittleEndian,
  evaluateControlGates,
} from './control-metrics.mjs';

const DIGEST = /^sha256:[0-9a-f]{64}$/;
const SOURCE_REVISION = /^(?!0{40}$)[0-9a-f]{40}$/;
const MAX_JSON_BYTES = 4 * 1024 * 1024;
const MAX_ARRAY_BYTES = 1024 * 1024 * 1024;
const PRODUCER_STAGES = Object.freeze([
  'guard', 'inputs', 'runtime', 'prepare', 'reference-a', 'reference-b',
  'cpu-fixed-coordinate', 'manifest',
]);
const PRODUCER_ARTIFACT_ID = 'tf.openmm-pure-water-cold-start-pme-control/1';
export const OPENMM_TIP3P_EXPECTED_PLAN_DIGEST =
  'sha256:ad07bc923c991746bcc5c9e048dff9b4065981b50c940b13c3f1654e4ffd1177';
export const OPENMM_TIP3P_EXPECTED_SYSTEM_DIGEST =
  'sha256:e80bb9d1bd4bd8b774008b052b717cb758f16995e5164b36cda7102e2dbf6419';
const LOCKED_REFERENCE_BACKEND_DIGEST =
  'sha256:7f7104ea225819798c9c06eed382298c4d90ec19484f632fc6910832369882b9';
const LOCKED_CPU_BACKEND_DIGEST =
  'sha256:8bea1d8a2f48897d34594fb416f791aa8d94c02807857182681c32c9d6e0424b';
const LOCKED_CONTAINER_INDEX_DIGEST =
  'sha256:519591d6871b7bc437060736b9f7456b8731f1499a57e22e6c285135ae657bf7';
const LOCKED_CONTAINER_PLATFORM_DIGEST =
  'sha256:c00fc7b44d844b6da22861ec24af43968a5200eac4ec607b4725d585165d6b49';
const LOCKED_INPUTS = Object.freeze({
  license: Object.freeze({
    path: 'Licenses.txt',
    sizeBytes: 9_305,
    sha256: 'sha256:437b7168cc997abea3b5f2a9e0fb6894f96de77b9c69be428ccfcfe9bed58293',
  }),
  parameters: Object.freeze({
    path: 'tip3p.xml',
    sizeBytes: 19_070,
    sha256: 'sha256:3f4b188dbcb6c02863230eaca231e927fb6bf3307ce947d8a50d0f46f6dd83d9',
  }),
  coordinates: Object.freeze({
    path: 'tip3p.pdb',
    sizeBytes: 179_998,
    sha256: 'sha256:14fd37900d627c0e258d6086a14c6084e4bec1422e9d20fccfc83c3f814fd7ee',
  }),
});
const OPENMM_SOURCE_REVISION = 'c6173db6e8edd705eb59172bd21e9ce69c572405';
const STATE_ENERGY_ALIGNMENT =
  'openmm-state-potential-and-integrator-adjusted-kinetic-at-position-time';
const STATE_KINETIC_SEMANTICS =
  'ReferenceIntegrateVerletStepKernel-computeShiftedKineticEnergy-plus-half-dt-with-velocity-constraints-1e-4';
const LOCKED_VERIFIER_NODE_VERSION = 'v24.16.0';
const NON_PROMOTIONAL_PRODUCER_CLAIMS = Object.freeze({
  accepted: false,
  promotionEligible: false,
  protectedMainArtifact: false,
  reproduced: false,
  scientificPass: false,
});
const { particleCount, componentCount, sampleCount, comparisonSteps } =
  OPENMM_TIP3P_CONTROL_SHAPE;
export const OPENMM_TIP3P_REQUIRED_ARTIFACTS = Object.freeze([
  jsonArtifact('runtime-inventory', 'manifests/runtime-inventory.json'),
  jsonArtifact('prepare-receipt', 'manifests/prepare-receipt.json'),
  jsonArtifact('reference-a-run', 'manifests/reference-a-run.json'),
  jsonArtifact('reference-b-run', 'manifests/reference-b-run.json'),
  jsonArtifact('cpu-fixed-coordinate-run', 'manifests/cpu-fixed-coordinate-run.json'),
  arrayArtifact('cell', 'arrays/cell.f64le', 'float64-le', [9], 'nanometer'),
  arrayArtifact('masses', 'arrays/masses.f64le', 'float64-le', [particleCount], 'dalton'),
  arrayArtifact('constraints', 'arrays/constraints.u32le', 'uint32-le', [particleCount, 2], 'index'),
  arrayArtifact('constraint-targets', 'arrays/constraint-targets.f64le', 'float64-le', [particleCount], 'nanometer'),
  arrayArtifact('comparison-steps', 'arrays/comparison-steps.u32le', 'uint32-le', [5], 'step'),
  arrayArtifact('start-positions', 'arrays/start-positions.f64le', 'float64-le', [particleCount, 3], 'nanometer'),
  arrayArtifact('start-velocities', 'arrays/start-velocities.f64le', 'float64-le', [particleCount, 3], 'nanometer-per-picosecond'),
  ...referenceArtifacts('reference-a'),
  ...referenceArtifacts('reference-b'),
  arrayArtifact('cpu-readback-positions', 'arrays/cpu-readback-positions.f64le', 'float64-le', [5, particleCount, 3], 'nanometer'),
  arrayArtifact('cpu-readback-cells', 'arrays/cpu-readback-cells.f64le', 'float64-le', [5, 9], 'nanometer'),
  arrayArtifact('cpu-comparison-group-energies', 'arrays/cpu-comparison-group-energies.f64le', 'float64-le', [5, 5], 'kilojoule-per-mole'),
  arrayArtifact('cpu-comparison-group-forces', 'arrays/cpu-comparison-group-forces.f64le', 'float64-le', [5, 5, particleCount, 3], 'kilojoule-per-mole-per-nanometer'),
].sort(compareArtifactId));

const REQUIRED_BY_ID = new Map(OPENMM_TIP3P_REQUIRED_ARTIFACTS.map((entry) => [entry.id, entry]));
const PRODUCER_STAGE_BY_PATH = Object.freeze(Object.fromEntries([
  ['manifests/input-receipt.json', 'inputs'],
  ['manifests/producer-diagnostics.json', 'cpu-fixed-coordinate'],
  ...OPENMM_TIP3P_REQUIRED_ARTIFACTS.map((entry) => [entry.path, producerStageFor(entry)]),
].sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)));

export function computeArtifactBundleRoot(descriptors) {
  const identities = [...descriptors]
    .sort(compareArtifactId)
    .map(({ id, path: artifactPath, kind, dtype, shape, unit, sizeBytes, sha256: digest }) => ({
      id,
      path: artifactPath,
      kind,
      dtype,
      shape: [...shape],
      unit,
      sizeBytes,
      sha256: digest,
    }));
  return sha256(Buffer.from(canonicalJson({
    schemaVersion: 'tf.openmm-tip3p-artifact-bundle-root/0.4.5',
    artifacts: identities,
  }), 'utf8'));
}

export function inspectOpenMmTip3pArtifactManifest(manifest) {
  const failures = [];
  const fail = (message) => { if (failures.length < 256) failures.push(message); };
  if (!isPlainObject(manifest)) return { ok: false, failures: ['artifact manifest must be an object'] };
  assertExactKeys(manifest, [
    'schemaVersion', 'profile', 'systemDigest', 'planDigest', 'sourceRevision',
    'producerOutcomeDigest', 'artifacts', 'bundleRoot', 'publicationPolicy',
  ], 'artifact manifest', fail);
  if (manifest.schemaVersion !== 'tf.openmm-tip3p-artifact-manifest/0.4.5') {
    fail('artifact manifest schemaVersion is not 0.4.5');
  }
  if (manifest.profile !== 'openmm-tip3p-producer-internal-evidence') {
    fail('artifact manifest profile changed');
  }
  for (const field of ['systemDigest', 'planDigest', 'producerOutcomeDigest', 'bundleRoot']) {
    if (!DIGEST.test(manifest[field] ?? '')) fail(`artifact manifest ${field} is not a digest`);
  }
  if (!SOURCE_REVISION.test(manifest.sourceRevision ?? '')) fail('artifact manifest sourceRevision is invalid');
  if (!Array.isArray(manifest.artifacts)) {
    fail('artifact manifest artifacts must be an array');
    return { ok: false, failures };
  }
  if (manifest.artifacts.length !== OPENMM_TIP3P_REQUIRED_ARTIFACTS.length) {
    fail(`artifact manifest must contain exactly ${OPENMM_TIP3P_REQUIRED_ARTIFACTS.length} artifacts`);
  }
  const seenIds = new Set();
  const seenPaths = new Set();
  for (const descriptor of manifest.artifacts) {
    if (!isPlainObject(descriptor)) {
      fail('artifact descriptor must be an object');
      continue;
    }
    assertExactKeys(descriptor, ['id', 'path', 'kind', 'dtype', 'shape', 'unit', 'sizeBytes', 'sha256'],
      `artifact ${String(descriptor.id)}`, fail);
    const expected = REQUIRED_BY_ID.get(descriptor.id);
    if (!expected) {
      fail(`unexpected artifact id ${JSON.stringify(descriptor.id)}`);
      continue;
    }
    if (seenIds.has(descriptor.id)) fail(`duplicate artifact id ${descriptor.id}`);
    if (seenPaths.has(descriptor.path)) fail(`duplicate artifact path ${descriptor.path}`);
    seenIds.add(descriptor.id);
    seenPaths.add(descriptor.path);
    for (const field of ['path', 'kind', 'dtype', 'unit']) {
      if (descriptor[field] !== expected[field]) fail(`artifact ${descriptor.id} ${field} changed`);
    }
    if (canonicalJson(descriptor.shape) !== canonicalJson(expected.shape)) {
      fail(`artifact ${descriptor.id} shape changed`);
    }
    const expectedBytes = expected.kind === 'array' ? arrayByteCount(expected) : null;
    if (!Number.isSafeInteger(descriptor.sizeBytes) || descriptor.sizeBytes < 1
        || descriptor.sizeBytes > (expected.kind === 'array' ? MAX_ARRAY_BYTES : MAX_JSON_BYTES)) {
      fail(`artifact ${descriptor.id} sizeBytes is outside its bound`);
    }
    if (expectedBytes !== null && descriptor.sizeBytes !== expectedBytes) {
      fail(`artifact ${descriptor.id} sizeBytes does not match dtype and shape`);
    }
    if (!DIGEST.test(descriptor.sha256 ?? '')) fail(`artifact ${descriptor.id} sha256 is invalid`);
  }
  for (const expected of OPENMM_TIP3P_REQUIRED_ARTIFACTS) {
    if (!seenIds.has(expected.id)) fail(`required artifact ${expected.id} is missing`);
  }
  if (manifest.bundleRoot !== computeArtifactBundleRoot(manifest.artifacts)) {
    fail('artifact manifest bundleRoot is stale');
  }
  const expectedPublication = {
    profile: 'tf.openmm-tip3p-internal-evidence/0.4.5',
    rawScientificPayloadPublic: false,
    parameterAssetsPublic: false,
    coordinateAssetsPublic: false,
    serializedSystemPublic: false,
    containerPublic: false,
    licenseClearanceRequired: true,
    independentVerificationRequired: true,
    attestationRequiredForPromotion: true,
  };
  if (canonicalJson(manifest.publicationPolicy) !== canonicalJson(expectedPublication)) {
    fail('artifact manifest publicationPolicy changed');
  }
  return { ok: failures.length === 0, failures };
}

export async function verifyOpenMmTip3pArtifactDirectory({
  root,
  expectedSystemDigest,
  expectedPlanDigest,
  expectedSourceRevision,
  verifierDigest,
}) {
  if (process.version !== LOCKED_VERIFIER_NODE_VERSION) {
    throw new Error(`independent verifier requires Node ${LOCKED_VERIFIER_NODE_VERSION}`);
  }
  const canonicalRoot = realpathSync(root);
  if (path.resolve(root) !== canonicalRoot) throw new Error('artifact root must be canonical');
  const manifestBytes = readBoundedRegularFileAtMost(
    canonicalRoot, 'manifests/artifact-manifest.json', MAX_JSON_BYTES,
  );
  const manifest = parseCompactSortedAsciiJson(manifestBytes, 'artifact manifest');
  const manifestInspection = inspectOpenMmTip3pArtifactManifest(manifest);
  if (!manifestInspection.ok) throw new Error(manifestInspection.failures.join('\n'));
  if (expectedSystemDigest !== OPENMM_TIP3P_EXPECTED_SYSTEM_DIGEST
      || expectedPlanDigest !== OPENMM_TIP3P_EXPECTED_PLAN_DIGEST) {
    throw new Error('caller attempted to substitute the verifier system or plan lock');
  }
  if (manifest.systemDigest !== expectedSystemDigest) throw new Error('artifact systemDigest differs from lock');
  if (manifest.planDigest !== expectedPlanDigest) throw new Error('artifact planDigest differs from lock');
  if (manifest.sourceRevision !== expectedSourceRevision) throw new Error('artifact sourceRevision differs from lock');
  const derivedVerifierDigest = computeOpenMmTip3pVerifierDigest();
  if (verifierDigest !== derivedVerifierDigest) {
    throw new Error('verifierDigest differs from the exact local verifier source bundle');
  }

  const producerOutcomeBytes = readBoundedRegularFileAtMost(
    canonicalRoot, 'manifests/producer-outcome.json', MAX_JSON_BYTES,
  );
  if (sha256(producerOutcomeBytes) !== manifest.producerOutcomeDigest) {
    throw new Error('producer outcome bytes differ from artifact manifest binding');
  }
  const producerOutcome = parseCompactSortedAsciiJson(
    producerOutcomeBytes, 'producer outcome',
  );
  verifyCompleteProducerOutcome(producerOutcome, manifest, canonicalRoot);
  assertClosedArtifactDirectory(canonicalRoot, producerOutcome);

  const bytesById = new Map();
  const jsonById = new Map();
  const jsonBytesById = new Map();
  for (const descriptor of manifest.artifacts) {
    const bytes = readBoundedRegularFile(canonicalRoot, descriptor.path, descriptor.sizeBytes);
    if (bytes.length !== descriptor.sizeBytes || sha256(bytes) !== descriptor.sha256) {
      throw new Error(`artifact ${descriptor.id} bytes differ from manifest`);
    }
    bytesById.set(descriptor.id, bytes);
    if (descriptor.kind === 'canonical-json') {
      const value = parseCompactSortedAsciiJson(bytes, descriptor.id);
      jsonById.set(descriptor.id, value);
      jsonBytesById.set(descriptor.id, bytes);
    }
  }
  for (const [id, relativePath] of [
    ['input-receipt', 'manifests/input-receipt.json'],
    ['producer-diagnostics', 'manifests/producer-diagnostics.json'],
  ]) {
    const evidence = producerOutcome.evidence.find((record) => record.path === relativePath);
    if (!evidence) throw new Error(`producer outcome lacks ${relativePath}`);
    const bytes = readBoundedRegularFile(canonicalRoot, relativePath, evidence.sizeBytes);
    if (sha256(bytes) !== evidence.sha256) throw new Error(`${relativePath} differs from outcome`);
    jsonById.set(id, parseCompactSortedAsciiJson(bytes, id));
    jsonBytesById.set(id, bytes);
  }

  const scientific = verifyOpenMmTip3pArrayEvidence(bytesById);
  const administrative = verifyAdministrativeReceipts(
    jsonById, jsonBytesById, manifest, scientific.metrics, producerOutcome, bytesById,
  );
  const artifactManifestDigest = sha256(manifestBytes);
  const receiptWithoutDigest = {
    schemaVersion: 'tf.openmm-tip3p-control-receipt/0.4.5',
    profile: 'openmm-tip3p-independent-control-verification',
    statusDomain: 'independent-scientific-assessment-not-release-provenance',
    status: scientific.gateResult.status,
    systemDigest: manifest.systemDigest,
    planDigest: manifest.planDigest,
    sourceRevision: manifest.sourceRevision,
    producerOutcomeDigest: manifest.producerOutcomeDigest,
    artifactManifestDigest,
    payloadBundleRoot: manifest.bundleRoot,
    runtimeBindings: administrative.runtimeBindings,
    verification: {
      verifierDigest: derivedVerifierDigest,
      metricSource: 'independently-recomputed-from-complete-raw-arrays',
      producerMetricsTrusted: false,
      referenceReplayComparedAsRawBytes: true,
      cpuComparedAtReferenceCoordinatesOnly: true,
      authoritativeVelocityTimeGauge: 'openmm-verlet-raw-velocity-at-t-minus-dt-over-2',
      forceSemantics: 'potential-force-excluding-constraint-impulses',
      stateEnergyTemporalAlignment: STATE_ENERGY_ALIGNMENT,
      rawHalfStepVelocitiesSufficientToRecomputeStateKineticEnergy: false,
      executionAuthenticityVerified: false,
      verifierRuntime: {
        nodeVersion: process.version,
        platform: process.platform,
        architecture: process.arch,
      },
    },
    metrics: scientific.metrics,
    thresholds: OPENMM_TIP3P_CONTROL_THRESHOLDS,
    gates: { ...scientific.gateResult.gates, allPassed: scientific.gateResult.status === 'verified-pass' },
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
      scientificPass: scientific.gateResult.status === 'verified-pass',
      reproduced: false,
      bulkWaterValidated: false,
      interfaceSimulated: false,
      industrialPrediction: false,
      scorePromotionEligible: false,
    },
  };
  const receipt = Object.freeze({
    ...receiptWithoutDigest,
    receiptDigest: sha256(Buffer.from(`${canonicalJson(receiptWithoutDigest)}\n`, 'utf8')),
  });
  return receipt;
}

export function computeOpenMmTip3pVerifierDigest() {
  const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));
  const sourcePaths = [
    'package.json',
    'package-lock.json',
    'schemas/openmm-tip3p-control-receipt.schema.json',
    'scripts/atomistic/runtime-input-contract.mjs',
    'scripts/atomistic/openmm/control-metrics.mjs',
    'scripts/atomistic/openmm/verify-control.mjs',
    'scripts/atomistic/openmm/verify-control-cli.mjs',
  ];
  const files = sourcePaths.map((relativePath) => {
    const bytes = readFileSync(path.join(repositoryRoot, relativePath));
    return { path: relativePath, sizeBytes: bytes.length, sha256: sha256(bytes) };
  });
  return sha256(Buffer.from(`${canonicalJson({
    schemaVersion: 'tf.openmm-tip3p-verifier-source-bundle/0.4.5',
    files,
  })}\n`, 'utf8'));
}

export function verifyOpenMmTip3pArrayEvidence(bytesById) {
  const get = (id) => {
    const bytes = bytesById instanceof Map ? bytesById.get(id) : bytesById[id];
    if (!(bytes instanceof Uint8Array)) throw new Error(`raw artifact ${id} is missing`);
    return bytes;
  };
  const comparisonStepValues = decodeUint32LittleEndian(get('comparison-steps'), 5, 'comparison steps');
  if (!arrayEquals(comparisonStepValues, comparisonSteps)) throw new Error('comparison steps changed');
  const cell = decodeFloat64LittleEndian(get('cell'), 9, 'cell');
  const lockedCell = [3, 0, 0, 0, 3, 0, 0, 0, 3];
  if (!arrayEquals(cell, lockedCell)) throw new Error('authoritative periodic cell changed');
  const masses = decodeFloat64LittleEndian(get('masses'), particleCount, 'masses');
  const constraints = decodeUint32LittleEndian(get('constraints'), particleCount * 2, 'constraints');
  const constraintTargets = decodeFloat64LittleEndian(get('constraint-targets'), particleCount,
    'constraint targets');
  verifyLockedParticleAndConstraintTopology(masses, constraints, constraintTargets);

  const replayIds = [
    'sample-steps', 'sample-times', 'positions', 'velocities', 'potential-forces', 'energies',
    'comparison-group-energies', 'comparison-group-forces',
  ];
  assertReferenceReplayExact(replayIds.map((suffix) => ({
    name: suffix,
    referenceA: get(`reference-a-${suffix}`),
    referenceB: get(`reference-b-${suffix}`),
  })));
  const sampleSteps = decodeUint32LittleEndian(get('reference-a-sample-steps'), sampleCount,
    'Reference sample steps');
  const sampleTimes = decodeFloat64LittleEndian(get('reference-a-sample-times'), sampleCount,
    'Reference sample times');
  for (let index = 0; index < sampleCount; index += 1) {
    if (sampleSteps[index] !== index * 10) throw new Error('Reference sample steps are not 0..1000 by 10');
    if (Math.abs(sampleTimes[index] - index * 0.01) > 1e-15) {
      throw new Error('Reference sample times are not 0..1 ps by 0.01 ps');
    }
  }
  const referencePositionBytes = get('reference-a-positions');
  const referencePositions = decodeFloat64LittleEndian(
    referencePositionBytes, sampleCount * componentCount, 'Reference positions',
  );
  const referenceVelocities = decodeFloat64LittleEndian(
    get('reference-a-velocities'), sampleCount * componentCount, 'Reference velocities',
  );
  const referenceForces = decodeFloat64LittleEndian(
    get('reference-a-potential-forces'), sampleCount * componentCount, 'Reference potential forces',
  );
  if (!byteSliceEquals(get('start-positions'), get('reference-a-positions'), 0,
    componentCount * 8)) throw new Error('Reference step-0 positions differ from portable start state');
  if (!byteSliceEquals(get('start-velocities'), get('reference-a-velocities'), 0,
    componentCount * 8)) throw new Error('Reference step-0 velocities differ from portable start state');

  const referenceEnergyTriples = decodeFloat64LittleEndian(
    get('reference-a-energies'), sampleCount * 3, 'Reference energies',
  );
  const totalEnergies = new Float64Array(sampleCount);
  const potentialEnergies = new Float64Array(sampleCount);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const potential = referenceEnergyTriples[sample * 3];
    const kinetic = referenceEnergyTriples[sample * 3 + 1];
    const recordedTotal = referenceEnergyTriples[sample * 3 + 2];
    const recomputedTotal = potential + kinetic;
    if (Object.is(recordedTotal, recomputedTotal) === false && recordedTotal !== recomputedTotal) {
      throw new Error(`Reference total energy at sample ${sample} was not the binary64 potential+kinetic sum`);
    }
    potentialEnergies[sample] = potential;
    totalEnergies[sample] = recomputedTotal;
  }
  const productionStartDiagnostics = computeProductionStartDiagnostics({
    positions: referencePositions.subarray(0, componentCount),
    velocities: referenceVelocities.subarray(0, componentCount),
    masses,
    constraints,
    cell,
    kineticEnergyKjMol: referenceEnergyTriples[1],
  });

  verifyCpuCoordinateReadback(get, cell, referencePositionBytes);
  const referenceGroupEnergies = decodeFloat64LittleEndian(
    get('reference-a-comparison-group-energies'), 25, 'Reference group energies',
  );
  const referenceGroupForces = decodeFloat64LittleEndian(
    get('reference-a-comparison-group-forces'), 25 * componentCount, 'Reference group forces',
  );
  const cpuGroupEnergies = decodeFloat64LittleEndian(
    get('cpu-comparison-group-energies'), 25, 'CPU group energies',
  );
  const cpuGroupForces = decodeFloat64LittleEndian(
    get('cpu-comparison-group-forces'), 25 * componentCount, 'CPU group forces',
  );
  verifyZeroRigidWaterGroups(referenceGroupEnergies, referenceGroupForces, 'Reference');
  verifyZeroRigidWaterGroups(cpuGroupEnergies, cpuGroupForces, 'CPU');
  verifyReferenceComparisonSlices(referenceForces, potentialEnergies,
    referenceGroupEnergies, referenceGroupForces);

  const referenceComparisonEnergies = selectGroupTotals(referenceGroupEnergies, 1);
  const cpuComparisonEnergies = selectGroupTotals(cpuGroupEnergies, 1);
  const referenceComparisonForces = selectGroupTotals(referenceGroupForces, componentCount);
  const cpuComparisonForces = selectGroupTotals(cpuGroupForces, componentCount);
  const crossPlatform = computeCpuReferenceComparison({
    referencePotentialEnergyKjMol: referenceComparisonEnergies,
    cpuPotentialEnergyKjMol: cpuComparisonEnergies,
    referencePotentialForceKjMolNanometer: referenceComparisonForces,
    cpuPotentialForceKjMolNanometer: cpuComparisonForces,
  });
  const referenceClosure = computeForceGroupClosure({
    lane: 'Reference', energiesKjMol: referenceGroupEnergies,
    forcesKjMolNanometer: referenceGroupForces,
  });
  const cpuClosure = computeForceGroupClosure({
    lane: 'CPU', energiesKjMol: cpuGroupEnergies, forcesKjMolNanometer: cpuGroupForces,
  });
  const metrics = Object.freeze({
    referenceExactReplay: true,
    relativeEnergyExcursion: computeRelativeEnergyExcursion(totalEnergies),
    absoluteEnergyExcursionPerWaterKjMol:
      computeAbsoluteEnergyExcursionPerWaterKjMol(totalEnergies),
    energyDriftSlopeKjMolPicosecond:
      computeEnergyDriftSlopeKjMolPicosecond(totalEnergies, sampleTimes),
    maximumConstraintRelativeResidual: computeMaximumConstraintRelativeResidual({
      positionsNanometer: referencePositions,
      cellVectorsNanometer: cell,
      constraintParticleIndices: constraints,
      constraintTargetsNanometer: constraintTargets,
    }),
    maximumRelativePotentialEnergyDifference:
      crossPlatform.maximumRelativePotentialEnergyDifference,
    maximumMedianPerParticleRelativeForceError:
      crossPlatform.maximumMedianPerParticleRelativeForceError,
    maximumGlobalRelativeForceL2Error: crossPlatform.maximumGlobalRelativeForceL2Error,
    referenceMaximumEnergyGroupRelativeResidual: referenceClosure.maximumEnergyRelativeResidual,
    referenceMaximumForceGroupRelativeResidual: referenceClosure.maximumForceRelativeResidual,
    cpuMaximumEnergyGroupRelativeResidual: cpuClosure.maximumEnergyRelativeResidual,
    cpuMaximumForceGroupUlpDistanceFloat32: cpuClosure.maximumForceUlpDistanceFloat32,
    productionStartCenterOfMassSpeedNanometerPerPicosecond:
      productionStartDiagnostics.centerOfMassSpeedNanometerPerPicosecond,
    productionStartMassWeightedMomentumRelativeResidual:
      productionStartDiagnostics.massWeightedMomentumRelativeResidual,
    productionStartMaximumVelocityConstraintRelativeResidual:
      productionStartDiagnostics.maximumVelocityConstraintRelativeResidual,
    productionStartKineticTemperatureKelvin:
      productionStartDiagnostics.kineticTemperatureKelvin,
  });
  return Object.freeze({ metrics, gateResult: evaluateControlGates(metrics) });
}

function verifyCompleteProducerOutcome(outcome, manifest, root) {
  if (!isPlainObject(outcome)) throw new Error('producer outcome must be an object');
  assertExactKeys(outcome, [
    'schemaVersion', 'artifactId', 'planDigest', 'systemDigest', 'status',
    'statusDomain', 'terminalStage', 'stages', 'evidence', 'diagnosticMetrics',
    'diagnosticMetricsAreAcceptance', 'claims',
  ], 'producer outcome', (message) => { throw new Error(message); });
  if (outcome.schemaVersion !== 'tf.openmm-tip3p-producer-outcome/0.4.5'
      || outcome.artifactId !== PRODUCER_ARTIFACT_ID
      || outcome.planDigest !== manifest.planDigest
      || outcome.systemDigest !== manifest.systemDigest
      || outcome.status !== 'complete-pass'
      || outcome.statusDomain !== 'producer-execution-integrity-only-not-scientific-assessment'
      || outcome.terminalStage !== null
      || outcome.diagnosticMetricsAreAcceptance !== false) {
    throw new Error('producer outcome does not represent the locked complete non-scientific run');
  }
  if (canonicalJson(outcome.claims) !== canonicalJson(NON_PROMOTIONAL_PRODUCER_CLAIMS)) {
    throw new Error('producer outcome claims crossed the non-promotional boundary');
  }
  if (!Array.isArray(outcome.stages) || outcome.stages.length !== PRODUCER_STAGES.length) {
    throw new Error('producer outcome stage vector length changed');
  }
  for (let index = 0; index < PRODUCER_STAGES.length; index += 1) {
    const stage = outcome.stages[index];
    if (!isPlainObject(stage)
        || canonicalJson(Object.keys(stage).sort()) !== '["outcome","stage"]'
        || stage.stage !== PRODUCER_STAGES[index] || stage.outcome !== 'success') {
      throw new Error(`producer outcome stage ${index} is not the locked successful stage`);
    }
  }
  if (!isPlainObject(outcome.diagnosticMetrics)) {
    throw new Error('producer diagnostics must remain a producer-only object');
  }
  const expectedPaths = Object.keys(PRODUCER_STAGE_BY_PATH);
  if (!Array.isArray(outcome.evidence) || outcome.evidence.length !== expectedPaths.length) {
    throw new Error('producer outcome evidence set is incomplete');
  }
  const manifestByPath = new Map(manifest.artifacts.map((descriptor) => [descriptor.path, descriptor]));
  for (let index = 0; index < expectedPaths.length; index += 1) {
    const expectedPath = expectedPaths[index];
    const record = outcome.evidence[index];
    if (!isPlainObject(record)) throw new Error(`producer evidence ${index} must be an object`);
    assertExactKeys(record, ['path', 'stage', 'sizeBytes', 'sha256', 'stageOutcome'],
      `producer evidence ${index}`, (message) => { throw new Error(message); });
    if (record.path !== expectedPath
        || record.stage !== PRODUCER_STAGE_BY_PATH[expectedPath]
        || record.stageOutcome !== 'success'
        || !Number.isSafeInteger(record.sizeBytes) || record.sizeBytes < 1
        || record.sizeBytes > MAX_ARRAY_BYTES || !DIGEST.test(record.sha256 ?? '')) {
      throw new Error(`producer evidence ${index} identity or bound changed`);
    }
    const descriptor = manifestByPath.get(expectedPath);
    if (descriptor
        && (descriptor.sizeBytes !== record.sizeBytes || descriptor.sha256 !== record.sha256)) {
      throw new Error(`producer evidence ${expectedPath} differs from artifact manifest`);
    }
    if (digestBoundedRegularFile(root, expectedPath, record.sizeBytes) !== record.sha256) {
      throw new Error(`producer evidence ${expectedPath} differs from outcome bytes`);
    }
  }
}

function assertClosedArtifactDirectory(root, outcome) {
  const expected = new Set([
    ...outcome.evidence.map((record) => record.path),
    'manifests/producer-outcome.json',
    'manifests/artifact-manifest.json',
  ]);
  const topLevel = readdirSync(root, { withFileTypes: true });
  if (topLevel.length !== 2
      || !topLevel.every((entry) => entry.isDirectory() && ['arrays', 'manifests'].includes(entry.name))) {
    throw new Error('artifact root must contain only the arrays and manifests directories');
  }
  const actual = [];
  for (const directory of ['arrays', 'manifests']) {
    for (const entry of readdirSync(path.join(root, directory), { withFileTypes: true })) {
      if (!entry.isFile()) throw new Error(`artifact output ${directory}/${entry.name} is not a file`);
      actual.push(`${directory}/${entry.name}`);
    }
  }
  actual.sort();
  const locked = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(locked)) {
    throw new Error('artifact output tree contains missing or unexpected files');
  }
}

function verifyAdministrativeReceipts(
  jsonById, jsonBytesById, manifest, scientificMetrics, producerOutcome, bytesById,
) {
  const input = requirePlainObject(jsonById.get('input-receipt'), 'input receipt');
  const runtime = requirePlainObject(jsonById.get('runtime-inventory'), 'runtime inventory');
  const prepare = requirePlainObject(jsonById.get('prepare-receipt'), 'prepare receipt');
  const referenceA = requirePlainObject(jsonById.get('reference-a-run'), 'Reference A receipt');
  const referenceB = requirePlainObject(jsonById.get('reference-b-run'), 'Reference B receipt');
  const cpu = requirePlainObject(jsonById.get('cpu-fixed-coordinate-run'), 'CPU receipt');
  const diagnostics = requirePlainObject(
    jsonById.get('producer-diagnostics'), 'producer diagnostics',
  );

  for (const [id, receipt, digestKey, label] of [
    ['input-receipt', input, 'receiptDigest', 'input receipt'],
    ['runtime-inventory', runtime, 'inventoryDigest', 'runtime inventory'],
    ['prepare-receipt', prepare, 'receiptDigest', 'prepare receipt'],
    ['reference-a-run', referenceA, 'runReceiptDigest', 'Reference A receipt'],
    ['reference-b-run', referenceB, 'runReceiptDigest', 'Reference B receipt'],
    ['cpu-fixed-coordinate-run', cpu, 'runReceiptDigest', 'CPU receipt'],
    ['producer-diagnostics', diagnostics, 'diagnosticsDigest', 'producer diagnostics'],
  ]) {
    verifyPythonCanonicalSelfDigest(
      jsonBytesById.get(id), receipt, digestKey, label,
    );
  }
  verifyLockedInputReceipt(input, manifest);
  verifyLockedRuntimeInventory(runtime, manifest);
  for (const [name, receipt] of [['prepare', prepare], ['Reference A', referenceA],
    ['Reference B', referenceB], ['CPU', cpu]]) {
    if (receipt.artifactId !== PRODUCER_ARTIFACT_ID
        || receipt.systemDigest !== manifest.systemDigest
        || receipt.planDigest !== manifest.planDigest) {
      throw new Error(`${name} receipt is not bound to the artifact system and plan`);
    }
    if (receipt.status !== 'complete') throw new Error(`${name} receipt is not complete`);
    assertNonPromotionalClaims(receipt.claims, `${name} receipt`);
  }
  assertNonPromotionalClaims(diagnostics.claims, 'producer diagnostics');
  if (diagnostics.schemaVersion !== 'tf.openmm-tip3p-producer-diagnostics/0.4.5'
      || diagnostics.artifactId !== PRODUCER_ARTIFACT_ID
      || diagnostics.planDigest !== manifest.planDigest
      || diagnostics.systemDigest !== manifest.systemDigest
      || diagnostics.statusDomain !== 'producer-diagnostics-only-independent-verifier-required'
      || diagnostics.thresholdsApplied !== false || diagnostics.acceptanceDecision !== null) {
    throw new Error('producer diagnostics crossed its non-acceptance boundary');
  }
  if (canonicalJson(producerOutcome.diagnosticMetrics) !== canonicalJson(diagnostics)) {
    throw new Error('producer outcome diagnosticMetrics differ from the bound diagnostics file');
  }

  if (prepare.schemaVersion !== 'tf.openmm-tip3p-prepare-receipt/0.4.5'
      || prepare.systemId !== 'openmm-8.6-tip3p-895-water-pme-control'
      || prepare.backendManifestDigest !== LOCKED_REFERENCE_BACKEND_DIGEST
      || prepare.runtimeInventoryDigest !== runtime.inventoryDigest) {
    throw new Error('prepare receipt identity or runtime/backend parent changed');
  }
  const digests = ['compiledTopologyDigest', 'serializedSystemDigest', 'atomOrderDigest'];
  for (const key of digests) {
    if (!DIGEST.test(prepare[key] ?? '')
        || referenceA[key] !== prepare[key] || referenceB[key] !== prepare[key]
        || cpu[key] !== prepare[key]) {
      throw new Error(`${key} differs across prepare, Reference, and CPU receipts`);
    }
  }
  if (referenceA.prepareReceiptDigest !== prepare.receiptDigest
      || referenceB.prepareReceiptDigest !== prepare.receiptDigest
      || cpu.prepareReceiptDigest !== prepare.receiptDigest
      || cpu.referenceRunReceiptDigest !== referenceA.runReceiptDigest) {
    throw new Error('prepare/Reference/CPU parent receipt chain is incomplete');
  }

  if (referenceA.lane !== 'reference-a' || referenceB.lane !== 'reference-b'
      || cpu.lane !== 'cpu-fixed-coordinate') throw new Error('execution lane identities changed');
  verifyReferenceReceipt(referenceA, 'a', manifest);
  verifyReferenceReceipt(referenceB, 'b', manifest);
  if (referenceA.processId === referenceB.processId || referenceA.processId === cpu.processId
      || referenceB.processId === cpu.processId) {
    throw new Error('Reference A, Reference B, and CPU must use distinct fresh process IDs');
  }
  if (referenceA.forceSemantics !== 'potential-force-excluding-constraint-impulses'
      || referenceB.forceSemantics !== 'potential-force-excluding-constraint-impulses'
      || cpu.forceSemantics !== 'potential-force-excluding-constraint-impulses') {
    throw new Error('execution receipts do not preserve force semantics');
  }
  if (referenceA.velocityTemporalAlignment !== 'openmm-verlet-raw-velocity-at-t-minus-dt-over-2'
      || referenceB.velocityTemporalAlignment !== 'openmm-verlet-raw-velocity-at-t-minus-dt-over-2') {
    throw new Error('Reference velocity temporal alignment is missing');
  }
  if (cpu.comparisonMode !== 'fixed-reference-a-coordinates-no-integration-no-projection'
      || cpu.warmupEnergyEvaluationCompletedBeforePmeReadback !== true
      || cpu.coordinateReadbackMatchedReferenceInput !== true
      || cpu.fixedCoordinateComparisonOnly !== true || cpu.freeTrajectoryExecution !== false
      || cpu.integratedSteps !== 0 || cpu.platform !== 'CPU'
      || cpu.backendManifestDigest !== LOCKED_CPU_BACKEND_DIGEST
      || cpu.positionsEnforcePeriodicBox !== false
      || cpu.fallbackPolicy !== 'reject-no-algorithm-or-platform-fallback') {
    throw new Error('CPU fixed-coordinate or PME warm-up evidence is incomplete');
  }
  assertProcessId(cpu.processId, 'CPU processId');
  assertExactArrayDescriptors(cpu.arrays, [
    'cpu-readback-positions', 'cpu-readback-cells',
    'cpu-comparison-group-energies', 'cpu-comparison-group-forces',
  ], manifest, 'CPU');

  const topology = prepare.topology;
  if (!isPlainObject(topology)
      || topology.waterMoleculeCount !== 895 || topology.particleCount !== 2685
      || topology.topologyBondCount !== 1790 || topology.constraintCount !== 2685
      || topology.exceptionCount !== 2685 || topology.harmonicBondTermCount !== 0
      || topology.harmonicAngleTermCount !== 0 || topology.nonbondedForceCount !== 1
      || topology.centerOfMassRemoverCount !== 0 || topology.totalForceCount !== 3
      || canonicalJson(prepare.forceClassCounts)
        !== '{"HarmonicAngleForce":1,"HarmonicBondForce":1,"NonbondedForce":1}') {
    throw new Error('prepare receipt topology inventory differs from locked rigid TIP3P system');
  }
  if (prepare.forceSemantics !== 'potential-force-excluding-constraint-impulses'
      || prepare.velocitySemantics !== 'raw-openmm-verlet-half-step-associated-velocity'
      || prepare.energyTemporalAlignment !== STATE_ENERGY_ALIGNMENT
      || prepare.stateKineticEnergySemantics !== STATE_KINETIC_SEMANTICS
      || prepare.rawHalfStepVelocitiesSufficientToRecomputeStateKineticEnergy !== false) {
    throw new Error('prepare receipt force, velocity, or State-energy semantics changed');
  }
  assertExactArrayDescriptors(prepare.arrays, [
    'cell', 'masses', 'constraints', 'constraint-targets', 'comparison-steps',
    'start-positions', 'start-velocities',
  ], manifest, 'prepare');
  const manifestById = new Map(manifest.artifacts.map((entry) => [entry.id, entry]));
  const portableStartDigest = digestPythonStringRecord({
    cellSha256: manifestById.get('cell').sha256,
    positionSha256: manifestById.get('start-positions').sha256,
    velocitySha256: manifestById.get('start-velocities').sha256,
    atomOrderDigest: prepare.atomOrderDigest,
  });
  if (prepare.portableProductionStartStateDigest !== portableStartDigest
      || referenceA.portableProductionStartStateDigest !== portableStartDigest
      || referenceB.portableProductionStartStateDigest !== portableStartDigest) {
    throw new Error('portable production start-state digest differs across lanes');
  }

  const minimization = prepare.minimization;
  if (!isPlainObject(minimization) || minimization.terminalGradientRmsKjMolNanometer > 1
      || minimization.maximumConstraintRelativeResidual > 1e-8
      || minimization.allPositionsFinite !== true || minimization.allForcesFinite !== true
      || minimization.allEnergiesFinite !== true || minimization.reporterObservedTerminalState !== true
      || minimization.algorithm !== 'OpenMM-LocalEnergyMinimizer-LBFGS'
      || minimization.toleranceKjMolNanometer !== 1
      || minimization.maximumIterationsArgument !== 5_000
      || minimization.maximumIterationsPerRestraintCycle !== 5_000
      || minimization.postMinimizationApplyConstraintsPerformed !== true
      || minimization.postconditionsAreProducerDiagnosticsOnly !== true) {
    throw new Error('prepare minimization postconditions are incomplete');
  }
  verifyMinimizationReporter(minimization.reporter);
  const reporter = minimization.reporter;
  if (minimization.iterationSemantics
        !== 'OpenMM-maxIterations-argument-does-not-bound-total-reporter-callbacks-across-constraint-restarts'
      || minimization.reporterTerminalStateInterpretation
        !== 'last-successful-lbfgs-iterate-before-openmm-internal-final-constraint-projection'
      || minimization.reporterTerminalOptimizerPositionSha256 !== reporter.lastPositionSha256
      || !DIGEST.test(minimization.postInternalConstraintProjectionPositionSha256 ?? '')
      || minimization.terminalReporterConstraintRelativeResidual
        !== reporter.lastArguments['max constraint error']
      || minimization.terminalGradientRmsKjMolNanometer
        !== reporter.lastObjectiveGradientRmsKjMolNanometer
      || !Number.isFinite(minimization.postInternalMinimizerPotentialEnergyKjMol)
      || !Number.isFinite(
        minimization.maximumReporterToPostInternalProjectionComponentDisplacementNanometer,
      )
      || minimization.maximumReporterToPostInternalProjectionComponentDisplacementNanometer < 0) {
    throw new Error('prepare minimization reporter/final-projection lineage changed');
  }
  const startEnergies = decodeFloat64LittleEndian(
    bytesById.get('reference-a-energies'), sampleCount * 3, 'Reference energies for prepare binding',
  );
  const startForces = decodeFloat64LittleEndian(
    bytesById.get('reference-a-potential-forces'), sampleCount * componentCount,
    'Reference forces for prepare binding',
  );
  let squaredStartForce = 0;
  for (let index = 0; index < componentCount; index += 1) {
    squaredStartForce += startForces[index] * startForces[index];
  }
  const startForceRms = Math.sqrt(squaredStartForce / componentCount);
  if (!approximatelyEqual(minimization.postPotentialEnergyKjMol, startEnergies[0], 1e-13, 1e-12)
      || !approximatelyEqual(
        minimization.postPotentialForceComponentRmsKjMolNanometer,
        startForceRms, 1e-13, 1e-12,
      )) {
    throw new Error('prepare post-minimization energy/force differs from Reference step 0 raw arrays');
  }

  const velocity = prepare.velocityInitialization;
  if (!isPlainObject(velocity)
      || velocity.sequence !== 'set-temperature-remove-mass-weighted-com-apply-velocity-constraints'
      || velocity.method !== 'OpenMM-setVelocitiesToTemperature'
      || velocity.temperatureKelvin !== 300 || velocity.randomSeed !== 20_260_901
      || canonicalJson(velocity.operationOrder) !== '["setVelocitiesToTemperature","removeMassWeightedCenterOfMassVelocity","applyVelocityConstraints"]'
      || canonicalJson(velocity.operationSequence) !== '["OpenMM-setVelocitiesToTemperature","remove-mass-weighted-center-of-mass-velocity","OpenMM-setVelocities","OpenMM-applyVelocityConstraints"]'
      || velocity.setVelocitiesToTemperatureInternalConstraintTolerance !== 1e-5
      || velocity.explicitVelocityConstraintTolerance !== 1e-8
      || velocity.removeMassWeightedCenterOfMassVelocity !== true
      || velocity.applyVelocityConstraintsAfterCenterOfMassRemoval !== true
      || velocity.postconditionEvaluationPoint !== 'after-explicit-applyVelocityConstraints'
      || velocity.seedAloneIsReplayInput !== false
      || velocity.velocityConstraintRelativeResidual > 1e-8
      || velocity.massWeightedMomentumRelativeResidual > 1e-12
      || !Number.isFinite(velocity.actualKineticTemperatureKelvin)) {
    throw new Error('prepare velocity postconditions are incomplete');
  }
  for (const [receiptKey, metricKey] of [
    ['finalCenterOfMassSpeedNanometerPerPicosecond',
      'productionStartCenterOfMassSpeedNanometerPerPicosecond'],
    ['massWeightedMomentumRelativeResidual',
      'productionStartMassWeightedMomentumRelativeResidual'],
    ['finalVelocityConstraintRelativeResidual',
      'productionStartMaximumVelocityConstraintRelativeResidual'],
    ['actualKineticTemperatureKelvin', 'productionStartKineticTemperatureKelvin'],
  ]) {
    if (!approximatelyEqual(velocity[receiptKey], scientificMetrics[metricKey], 1e-12, 1e-14)) {
      throw new Error(`prepare ${receiptKey} differs from independently recomputed start state`);
    }
  }

  verifyCpuCoordinateReceipts(cpu, bytesById);
  verifyPreparePmeReceipt(prepare, referenceA);
  assertExactPmeMatch(referenceA, referenceB, 'Reference A/B');
  const referencePlatform = platformBinding(runtime, 'Reference', referenceA);
  const referenceReplayPlatform = platformBinding(runtime, 'Reference', referenceB);
  if (canonicalJson(referencePlatform) !== canonicalJson(referenceReplayPlatform)) {
    throw new Error('Reference A/B independently read platform bindings differ');
  }
  const cpuPlatform = platformBinding(runtime, 'CPU', cpu);
  return {
    runtimeBindings: {
      baseImageIndexDigest: runtime.containerIndexDigest,
      baseImagePlatformDigest: runtime.containerPlatformDigest,
      derivedContainerImageDigest: null,
      pythonVersion: runtime.pythonVersion,
      numpyVersion: runtime.numpyVersion,
      openmmDistributionVersion: runtime.openmmDistributionVersion,
      openmmFullVersion: runtime.openmmFullVersion,
      openmmGitRevision: runtime.openmmGitRevision,
      openmmReleaseFlag: runtime.openmmReleaseFlag,
      referencePlatform,
      cpuPlatform,
    },
  };
}

function platformBinding(runtime, platform, receipt) {
  const expectedProperties = platform === 'CPU'
    ? { Threads: '1', DeterministicForces: receipt.platformProperties?.DeterministicForces }
    : {};
  if (!Array.isArray(runtime.pluginLoadFailures) || runtime.pluginLoadFailures.length !== 0) {
    throw new Error('OpenMM plugin load failures are not empty');
  }
  if (receipt.platform !== platform || !isPlainObject(receipt.actualPmeContextParameters)
      || receipt.actualPmeContextParameters.alphaInverseNanometer <= 0
      || canonicalJson(receipt.actualPmeContextParameters.grid) !== '[90,90,90]') {
    throw new Error(`${platform} Context PME readback is incomplete`);
  }
  const warmup = requirePlainObject(receipt.pmeWarmupAndReadback, `${platform} PME warmup`);
  if (warmup.warmupOperation !== 'getState-getEnergy-true-after-setPositions'
      || canonicalJson(warmup.actualPmeContextParameters)
        !== canonicalJson(receipt.actualPmeContextParameters)
      || canonicalJson(warmup.platformProperties) !== canonicalJson(receipt.platformProperties)
      || canonicalJson(receipt.actualContextProperties) !== canonicalJson(receipt.platformProperties)
      || canonicalJson(warmup.cellNanometer) !== '[[3,0,0],[0,3,0],[0,0,3]]') {
    throw new Error(`${platform} PME warmup/readback receipt changed`);
  }
  if (platform === 'CPU' && receipt.platformProperties?.Threads !== '1') {
    throw new Error('CPU platform did not use one thread');
  }
  return {
    name: platform,
    pmeAlphaInverseNanometer: receipt.actualPmeContextParameters.alphaInverseNanometer,
    pmeGrid: [...receipt.actualPmeContextParameters.grid],
    pluginLoadFailures: [...runtime.pluginLoadFailures],
    properties: expectedProperties,
  };
}

function verifyPythonCanonicalSelfDigest(bytes, receipt, digestKey, label) {
  if (!(bytes instanceof Uint8Array) || !DIGEST.test(receipt[digestKey] ?? '')) {
    throw new Error(`${label} lacks its raw self-digest evidence`);
  }
  const body = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength - 1).toString('ascii');
  if (body[0] !== '{' || body.at(-1) !== '}') throw new Error(`${label} is not a JSON object`);
  const members = splitTopLevelObjectMembers(body, label);
  const retained = [];
  let removed = 0;
  for (const member of members) {
    const parsed = JSON.parse(`{${member}}`);
    const keys = Object.keys(parsed);
    if (keys.length !== 1) throw new Error(`${label} has an invalid top-level member`);
    if (keys[0] === digestKey) removed += 1;
    else retained.push(member);
  }
  if (removed !== 1) throw new Error(`${label} must contain exactly one ${digestKey}`);
  const preimage = Buffer.from(`{${retained.join(',')}}\n`, 'ascii');
  if (sha256(preimage) !== receipt[digestKey]) {
    throw new Error(`${label} ${digestKey} does not match its Python canonical raw preimage`);
  }
}

function splitTopLevelObjectMembers(body, label) {
  const members = [];
  let start = 1;
  let depth = 1;
  let inString = false;
  let escaped = false;
  for (let index = 1; index < body.length - 1; index += 1) {
    const character = body[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
      continue;
    }
    if (character === '"') inString = true;
    else if (character === '{' || character === '[') depth += 1;
    else if (character === '}' || character === ']') depth -= 1;
    else if (character === ',' && depth === 1) {
      members.push(body.slice(start, index));
      start = index + 1;
    }
    if (depth < 1) throw new Error(`${label} has invalid top-level nesting`);
  }
  if (inString || depth !== 1 || start >= body.length - 1) {
    throw new Error(`${label} has an invalid top-level object encoding`);
  }
  members.push(body.slice(start, -1));
  return members;
}

function verifyLockedInputReceipt(input, manifest) {
  if (input.schemaVersion !== 'tf.openmm-tip3p-input-receipt/0.4.5'
      || input.artifactId !== PRODUCER_ARTIFACT_ID
      || input.planDigest !== manifest.planDigest || input.systemDigest !== manifest.systemDigest
      || input.networkAccessUsed !== false) {
    throw new Error('input receipt identity, lock, or offline execution claim changed');
  }
  assertNonPromotionalClaims(input.claims, 'input receipt');
  if (!Array.isArray(input.sources) || input.sources.length !== 3) {
    throw new Error('input receipt must contain the three locked source records');
  }
  const byRole = new Map(input.sources.map((record) => [record?.role, record]));
  if (byRole.size !== 3) throw new Error('input receipt source roles repeat');
  for (const [role, locked] of Object.entries(LOCKED_INPUTS)) {
    const record = requirePlainObject(byRole.get(role), `${role} input source`);
    assertExactKeysOrThrow(record, [
      'role', 'path', 'sizeBytes', 'sha256', 'sourceCommit',
      'explicitRuntimeInput', 'redistributionCleared',
    ], `${role} input source`);
    if (record.role !== role || record.path !== locked.path
        || record.sizeBytes !== locked.sizeBytes || record.sha256 !== locked.sha256
        || record.sourceCommit !== OPENMM_SOURCE_REVISION
        || record.explicitRuntimeInput !== true || record.redistributionCleared !== false) {
      throw new Error(`${role} input source differs from the locked byte identity or license boundary`);
    }
  }
}

function verifyLockedRuntimeInventory(runtime, manifest) {
  if (runtime.schemaVersion !== 'tf.openmm-runtime-inventory/0.4.5'
      || runtime.artifactId !== PRODUCER_ARTIFACT_ID
      || runtime.planDigest !== manifest.planDigest || runtime.systemDigest !== manifest.systemDigest
      || runtime.containerIndexDigest !== LOCKED_CONTAINER_INDEX_DIGEST
      || runtime.containerPlatformDigest !== LOCKED_CONTAINER_PLATFORM_DIGEST
      || runtime.pythonVersion !== '3.12.11' || runtime.numpyVersion !== '2.2.6'
      || runtime.openmmDistributionVersion !== '8.6.0'
      || runtime.openmmFullVersion !== '8.6.0.dev-c6173db'
      || runtime.openmmGitRevision !== OPENMM_SOURCE_REVISION
      || runtime.openmmReleaseFlag !== false
      || runtime.actualContextProperties !== 'recorded-per-lane-after-context-creation') {
    throw new Error('runtime inventory differs from the locked base image and package runtime');
  }
  assertNonPromotionalClaims(runtime.claims, 'runtime inventory');
  const python = requirePlainObject(runtime.python, 'runtime Python inventory');
  if (python.version !== '3.12.11' || python.implementation !== 'CPython'
      || typeof python.executable !== 'string' || !python.executable.startsWith('/')
      || canonicalJson(python.flags)
        !== '{"dontWriteBytecode":true,"ignoreEnvironment":false,"noUserSite":true,"safePath":true}') {
    throw new Error('runtime Python identity or isolation flags changed');
  }
  if (runtime.host?.system !== 'Linux' || !['x86_64', 'AMD64'].includes(runtime.host?.machine)
      || runtime.packages?.openmm !== '8.6.0' || runtime.packages?.numpy !== '2.2.6'
      || !Array.isArray(runtime.loadedLibraries)
      || !Array.isArray(runtime.openmm?.pluginLoadFailures)
      || runtime.openmm.pluginLoadFailures.length !== 0
      || !Array.isArray(runtime.openmm?.platforms)) {
    throw new Error('runtime host, package, library, or OpenMM plugin inventory changed');
  }
  const platformNames = runtime.openmm.platforms.map((entry) => entry?.name);
  if (!platformNames.includes('Reference') || !platformNames.includes('CPU')) {
    throw new Error('runtime inventory lacks Reference or CPU platform');
  }
}

function verifyReferenceReceipt(receipt, replica, manifest) {
  const prefix = `reference-${replica}`;
  if (receipt.schemaVersion !== 'tf.openmm-tip3p-reference-run/0.4.5'
      || receipt.replica !== replica || receipt.lane !== prefix || receipt.platform !== 'Reference'
      || receipt.backendManifestDigest !== LOCKED_REFERENCE_BACKEND_DIGEST
      || receipt.freshProcessRequired !== true || receipt.integrator !== 'OpenMM-VerletIntegrator'
      || receipt.timeStepPicoseconds !== 0.001 || receipt.integratedSteps !== 1_000
      || receipt.sampleCount !== 101 || receipt.sampleStrideSteps !== 10
      || receipt.positionsEnforcePeriodicBox !== false || receipt.integrationForceGroupsMask !== 15
      || receipt.fallbackPolicy !== 'reject-no-algorithm-or-platform-fallback'
      || receipt.velocitySemantics !== 'raw-openmm-verlet-half-step-associated-velocity'
      || receipt.velocityReadbackSemantics
        !== 'prepared-step-0-then-raw-OpenMM-Verlet-half-step-velocities-no-resynchronization'
      || receipt.energyTemporalAlignment !== STATE_ENERGY_ALIGNMENT
      || receipt.stateKineticEnergySemantics !== STATE_KINETIC_SEMANTICS
      || receipt.rawHalfStepVelocitiesSufficientToRecomputeStateKineticEnergy !== false
      || canonicalJson(receipt.energyColumnOrder) !== '["potential","kinetic","total"]'
      || canonicalJson(receipt.groupOrder)
        !== '["total","harmonic-bond","harmonic-angle","nonbonded-direct-and-lennard-jones","nonbonded-reciprocal"]') {
    throw new Error(`Reference ${replica.toUpperCase()} execution/cadence semantics changed`);
  }
  assertProcessId(receipt.processId, `Reference ${replica.toUpperCase()} processId`);
  const ids = [
    'sample-steps', 'sample-times', 'positions', 'velocities', 'potential-forces', 'energies',
    'comparison-group-energies', 'comparison-group-forces',
  ].map((suffix) => `${prefix}-${suffix}`);
  assertExactArrayDescriptors(receipt.arrays, ids, manifest, `Reference ${replica.toUpperCase()}`);
  const byId = new Map(manifest.artifacts.map((entry) => [entry.id, entry]));
  if (receipt.startPositionSha256 !== byId.get('start-positions').sha256
      || receipt.startVelocitySha256 !== byId.get('start-velocities').sha256) {
    throw new Error(`Reference ${replica.toUpperCase()} start bytes differ from prepare`);
  }
}

function assertExactArrayDescriptors(actual, ids, manifest, label) {
  if (!Array.isArray(actual)) throw new Error(`${label} arrays must be a list`);
  const byId = new Map(manifest.artifacts.map((entry) => [entry.id, entry]));
  const expected = [...ids].sort().map((id) => {
    const descriptor = byId.get(id);
    if (!descriptor) throw new Error(`${label} manifest descriptor ${id} is missing`);
    return descriptor;
  });
  if (canonicalJson(actual) !== canonicalJson(expected)) {
    throw new Error(`${label} source array descriptors differ from the artifact manifest`);
  }
}

function verifyMinimizationReporter(value) {
  const reporter = requirePlainObject(value, 'minimization reporter');
  const argumentsRecord = requirePlainObject(
    reporter.lastArguments, 'minimization reporter arguments',
  );
  if (!Number.isSafeInteger(reporter.reportCount) || reporter.reportCount < 1
      || reporter.reportCount >= 20_000
      || !Number.isSafeInteger(reporter.restraintCycles) || reporter.restraintCycles < 1
      || reporter.restraintCycles > 4
      || reporter.constraintRestartCount !== reporter.restraintCycles - 1
      || reporter.maximumReporterCallbacks !== 20_000
      || reporter.maximumConstraintRestarts !== 3
      || reporter.wallClockTimeoutSeconds !== 1_800
      || reporter.globalCallbackOrdinal !== reporter.reportCount - 1
      || reporter.budgetExhaustion !== null
      || reporter.reporterNeverStoppedMinimizationEarly !== true
      || !Number.isSafeInteger(reporter.maximumIterationIndex)
      || reporter.maximumIterationIndex < 0 || reporter.maximumIterationIndex >= 5_000
      || !Number.isSafeInteger(reporter.lastIterationIndex)
      || reporter.lastIterationIndex < 0 || reporter.lastIterationIndex >= 5_000
      || !Number.isFinite(reporter.lastObjectiveGradientRmsKjMolNanometer)
      || reporter.lastObjectiveGradientRmsKjMolNanometer > 1
      || !DIGEST.test(reporter.lastPositionSha256 ?? '')
      || canonicalJson(Object.keys(argumentsRecord).sort())
        !== '["max constraint error","restraint energy","restraint strength","system energy"]'
      || Object.values(argumentsRecord).some((entry) => !Number.isFinite(entry))
      || argumentsRecord['max constraint error'] < 0
      || argumentsRecord['max constraint error'] > 1e-4) {
    throw new Error('minimization reporter budgets or terminal evidence changed');
  }
}

function verifyCpuCoordinateReceipts(cpu, bytesById) {
  if (!Array.isArray(cpu.coordinateReceipts) || cpu.coordinateReceipts.length !== 5) {
    throw new Error('CPU coordinate receipt count changed');
  }
  const referencePositions = bytesById.get('reference-a-positions');
  const cell = bytesById.get('cell');
  const frameBytes = componentCount * 8;
  const frameIndices = [0, 1, 10, 50, 100];
  for (let index = 0; index < comparisonSteps.length; index += 1) {
    const record = requirePlainObject(cpu.coordinateReceipts[index], `CPU coordinate ${index}`);
    const frame = frameIndices[index];
    const expectedPositionDigest = sha256(referencePositions.subarray(
      frame * frameBytes, (frame + 1) * frameBytes,
    ));
    if (record.step !== comparisonSteps[index] || record.sourceReferenceFrameIndex !== frame
        || record.setPositionSha256 !== expectedPositionDigest
        || record.getPositionSha256 !== expectedPositionDigest
        || record.setCellSha256 !== sha256(cell) || record.getCellSha256 !== sha256(cell)
        || !Number.isFinite(record.warmupPotentialEnergyKjMol)) {
      throw new Error(`CPU coordinate receipt ${index} is not bound to Reference A bytes`);
    }
  }
}

function assertExactPmeMatch(left, right, label) {
  if (canonicalJson(left.actualPmeContextParameters)
      !== canonicalJson(right.actualPmeContextParameters)
      || canonicalJson(left.platformProperties) !== canonicalJson(right.platformProperties)) {
    throw new Error(`${label} fresh-process PME/platform readbacks differ`);
  }
}

function verifyPreparePmeReceipt(prepare, reference) {
  const warmup = requirePlainObject(prepare.pmeWarmupAndReadback, 'prepare PME warmup');
  if (warmup.warmupOperation !== 'getState-getEnergy-true-after-setPositions'
      || canonicalJson(warmup.actualPmeContextParameters)
        !== canonicalJson(reference.actualPmeContextParameters)
      || canonicalJson(warmup.platformProperties) !== canonicalJson(prepare.actualContextProperties)
      || canonicalJson(warmup.cellNanometer) !== '[[3,0,0],[0,3,0],[0,0,3]]') {
    throw new Error('prepare and Reference fresh-process PME readbacks differ');
  }
}

function assertProcessId(value, label) {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error(`${label} is invalid`);
}

function assertNonPromotionalClaims(value, label) {
  if (canonicalJson(value) !== canonicalJson(NON_PROMOTIONAL_PRODUCER_CLAIMS)) {
    throw new Error(`${label} crossed the locked non-promotional claims boundary`);
  }
}

function assertExactKeysOrThrow(value, expected, label) {
  assertExactKeys(value, expected, label, (message) => { throw new Error(message); });
}

function digestPythonStringRecord(value) {
  return sha256(Buffer.from(`${canonicalJson(value)}\n`, 'ascii'));
}

function approximatelyEqual(left, right, relativeTolerance, absoluteTolerance) {
  return Number.isFinite(left) && Number.isFinite(right)
    && Math.abs(left - right) <= Math.max(
      absoluteTolerance, relativeTolerance * Math.max(Math.abs(left), Math.abs(right)),
    );
}

function computeProductionStartDiagnostics({
  positions, velocities, masses, constraints, cell, kineticEnergyKjMol,
}) {
  if (!arrayEquals(cell, [3, 0, 0, 0, 3, 0, 0, 0, 3])) {
    throw new Error('production-start diagnostics require the locked orthorhombic cell');
  }
  const momentum = [0, 0, 0];
  let totalMass = 0;
  let momentumMagnitudeSum = 0;
  for (let particle = 0; particle < particleCount; particle += 1) {
    const mass = masses[particle];
    const offset = particle * 3;
    const particleMomentum = [
      mass * velocities[offset],
      mass * velocities[offset + 1],
      mass * velocities[offset + 2],
    ];
    totalMass += mass;
    for (let axis = 0; axis < 3; axis += 1) momentum[axis] += particleMomentum[axis];
    momentumMagnitudeSum += Math.hypot(...particleMomentum);
  }
  const momentumNorm = Math.hypot(...momentum);
  const centerOfMassSpeedNanometerPerPicosecond = momentumNorm / totalMass;
  const massWeightedMomentumRelativeResidual = momentumMagnitudeSum === 0
    ? 0
    : momentumNorm / momentumMagnitudeSum;
  let maximumVelocityConstraintRelativeResidual = 0;
  for (let constraint = 0; constraint < particleCount; constraint += 1) {
    const first = constraints[constraint * 2];
    const second = constraints[constraint * 2 + 1];
    const firstOffset = first * 3;
    const secondOffset = second * 3;
    const displacement = [0, 1, 2].map((axis) => {
      const raw = positions[secondOffset + axis] - positions[firstOffset + axis];
      return raw - 3 * Math.floor(raw / 3 + 0.5);
    });
    const relativeVelocity = [0, 1, 2].map((axis) => (
      velocities[secondOffset + axis] - velocities[firstOffset + axis]
    ));
    const distance = Math.hypot(...displacement);
    if (!(distance > 0)) throw new Error(`production-start constraint ${constraint} has zero distance`);
    const relativeSpeed = Math.hypot(...relativeVelocity);
    const projection = Math.abs(displacement.reduce(
      (sum, value, axis) => sum + value * relativeVelocity[axis], 0,
    ));
    maximumVelocityConstraintRelativeResidual = Math.max(
      maximumVelocityConstraintRelativeResidual,
      projection / Math.max(distance * relativeSpeed, 1e-12),
    );
  }
  const kineticTemperatureKelvin = 2 * kineticEnergyKjMol
    / ((3 * particleCount - particleCount - 3) * 0.00831446261815324);
  for (const value of [centerOfMassSpeedNanometerPerPicosecond,
    massWeightedMomentumRelativeResidual, maximumVelocityConstraintRelativeResidual,
    kineticTemperatureKelvin]) {
    if (!Number.isFinite(value)) throw new Error('production-start diagnostic is non-finite');
  }
  return {
    centerOfMassSpeedNanometerPerPicosecond,
    massWeightedMomentumRelativeResidual,
    maximumVelocityConstraintRelativeResidual,
    kineticTemperatureKelvin,
  };
}

function verifyLockedParticleAndConstraintTopology(masses, constraints, targets) {
  const oxygenMass = 15.99943;
  const hydrogenMass = 1.007947;
  const oxygenHydrogenDistance = 0.09572;
  const hydrogenHydrogenDistance = 0.15139006545247014;
  const seenPairs = Array.from({ length: 895 }, () => new Set());
  let totalMass = 0;
  for (let water = 0; water < 895; water += 1) {
    const base = water * 3;
    const lockedMasses = [oxygenMass, hydrogenMass, hydrogenMass];
    for (let local = 0; local < 3; local += 1) {
      const mass = masses[base + local];
      if (Math.abs(mass - lockedMasses[local]) > 1e-12) {
        throw new Error(`particle mass or O-H-H atom order changed at water ${water}`);
      }
      totalMass += mass;
    }
  }
  if (Math.abs(totalMass - 16123.71498) > 1e-8) {
    throw new Error('total mass differs from locked system');
  }
  for (let index = 0; index < particleCount; index += 1) {
    const first = constraints[index * 2];
    const second = constraints[index * 2 + 1];
    if (first === second || first >= particleCount || second >= particleCount
        || Math.floor(first / 3) !== Math.floor(second / 3)) {
      throw new Error(`constraint ${index} is not an intramolecular TIP3P pair`);
    }
    const water = Math.floor(first / 3);
    const localPair = [first % 3, second % 3].sort((left, right) => left - right);
    const pairKey = `${localPair[0]}-${localPair[1]}`;
    if (!['0-1', '0-2', '1-2'].includes(pairKey) || seenPairs[water].has(pairKey)) {
      throw new Error(`constraint ${index} duplicates or changes the TIP3P pair coverage`);
    }
    seenPairs[water].add(pairKey);
    const expectedTarget = pairKey === '1-2'
      ? hydrogenHydrogenDistance
      : oxygenHydrogenDistance;
    if (Math.abs(targets[index] - expectedTarget) > 1e-12) {
      throw new Error(`constraint ${index} target differs from locked TIP3P geometry`);
    }
  }
  if (seenPairs.some((pairs) => pairs.size !== 3)) {
    throw new Error('constraint array does not cover all three rigid pairs in every water');
  }
}

function verifyCpuCoordinateReadback(get, cell, referencePositionBytes) {
  const cpuPositions = get('cpu-readback-positions');
  const cpuCells = get('cpu-readback-cells');
  const componentBytes = componentCount * 8;
  for (let index = 0; index < comparisonSteps.length; index += 1) {
    const sampleIndex = comparisonSteps[index] / 10;
    if (!byteSliceEquals(cpuPositions, referencePositionBytes,
      index * componentBytes, componentBytes, sampleIndex * componentBytes)) {
      throw new Error(`CPU coordinate readback differs from Reference A step ${comparisonSteps[index]}`);
    }
    const cellValues = decodeFloat64LittleEndian(
      cpuCells.subarray(index * 9 * 8, (index + 1) * 9 * 8), 9, `CPU cell ${index}`,
    );
    if (!arrayEquals(cellValues, cell)) throw new Error(`CPU cell readback ${index} changed`);
  }
}

function verifyZeroRigidWaterGroups(energies, forces, lane) {
  for (let step = 0; step < 5; step += 1) {
    for (const groupIndex of [1, 2]) {
      if (energies[step * 5 + groupIndex] !== 0) {
        throw new Error(`${lane} rigid-water group ${groupIndex - 1} energy is not zero`);
      }
      const offset = (step * 5 + groupIndex) * componentCount;
      for (let component = 0; component < componentCount; component += 1) {
        if (forces[offset + component] !== 0) {
          throw new Error(`${lane} rigid-water group ${groupIndex - 1} force is not zero`);
        }
      }
    }
  }
}

function verifyReferenceComparisonSlices(forces, potentialEnergies, groupEnergies, groupForces) {
  for (let index = 0; index < comparisonSteps.length; index += 1) {
    const sample = comparisonSteps[index] / 10;
    if (groupEnergies[index * 5] !== potentialEnergies[sample]) {
      throw new Error(`Reference group-total energy differs from sampled energy at step ${comparisonSteps[index]}`);
    }
    const sampleForceOffset = sample * componentCount;
    const groupForceOffset = index * 5 * componentCount;
    for (let component = 0; component < componentCount; component += 1) {
      if (groupForces[groupForceOffset + component] !== forces[sampleForceOffset + component]) {
        throw new Error(`Reference group-total force differs from sampled force at step ${comparisonSteps[index]}`);
      }
    }
  }
}

function selectGroupTotals(values, componentsPerGroup) {
  const output = new Float64Array(5 * componentsPerGroup);
  for (let step = 0; step < 5; step += 1) {
    const sourceOffset = step * 5 * componentsPerGroup;
    output.set(values.subarray(sourceOffset, sourceOffset + componentsPerGroup), step * componentsPerGroup);
  }
  return output;
}

function parseCompactSortedAsciiJson(bytes, label) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 3 || bytes.byteLength > MAX_JSON_BYTES) {
    throw new Error(`${label} is outside the bounded JSON byte domain`);
  }
  const buffer = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (buffer[buffer.length - 1] !== 0x0a || buffer[buffer.length - 2] === 0x0a
      || buffer.includes(0x0d)) {
    throw new Error(`${label} must end in exactly one LF and contain no CR`);
  }
  for (const byte of buffer) {
    if (byte > 0x7f) throw new Error(`${label} must use ASCII JSON bytes`);
  }
  const body = buffer.subarray(0, buffer.length - 1).toString('ascii');
  let inString = false;
  let escaped = false;
  for (const character of body) {
    if (inString) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') inString = false;
    } else if (character === '"') inString = true;
    else if (/\s/.test(character)) throw new Error(`${label} contains non-canonical whitespace`);
  }
  if (inString || escaped) throw new Error(`${label} contains an unterminated JSON string`);
  const value = parseJsonRejectDuplicateKeys(buffer, label);
  assertRecursivelySortedJsonKeys(value, label);
  return value;
}

function assertRecursivelySortedJsonKeys(value, label) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error(`${label} contains a non-finite number`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => assertRecursivelySortedJsonKeys(entry, `${label}[${index}]`));
    return;
  }
  if (!isPlainObject(value)) throw new Error(`${label} contains a non-JSON object`);
  const keys = Object.keys(value);
  if (keys.some((key) => /^(?:0|[1-9][0-9]*)$/.test(key))
      || canonicalJson(keys) !== canonicalJson([...keys].sort())) {
    throw new Error(`${label} object keys are not in Python sort_keys order`);
  }
  for (const key of keys) assertRecursivelySortedJsonKeys(value[key], `${label}.${key}`);
}

function readBoundedRegularFileAtMost(root, relativePath, maximumSize) {
  const absolute = path.resolve(root, relativePath);
  const metadata = lstatSync(absolute, { bigint: true });
  if (metadata.size < 1n || metadata.size > BigInt(maximumSize)
      || metadata.size > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`artifact ${relativePath} is outside its byte bound`);
  }
  return readBoundedRegularFile(root, relativePath, Number(metadata.size));
}

function digestBoundedRegularFile(root, relativePath, expectedSize) {
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 1 || expectedSize > MAX_ARRAY_BYTES) {
    throw new Error(`artifact ${relativePath} has an invalid outcome size`);
  }
  if (typeof relativePath !== 'string' || relativePath.includes('\\')
      || path.posix.normalize(relativePath) !== relativePath || relativePath.startsWith('/')) {
    throw new Error(`artifact path ${JSON.stringify(relativePath)} is not canonical`);
  }
  const absolute = path.resolve(root, relativePath);
  if (absolute === root || !absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error(`artifact path ${relativePath} escapes its root`);
  }
  const pathStat = lstatSync(absolute, { bigint: true });
  if (!pathStat.isFile() || pathStat.isSymbolicLink() || pathStat.nlink !== 1n
      || pathStat.size !== BigInt(expectedSize) || realpathSync(absolute) !== absolute) {
    throw new Error(`artifact ${relativePath} is not the expected canonical regular file`);
  }
  const descriptor = openSync(absolute, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const before = fstatSync(descriptor, { bigint: true });
    const digest = createHash('sha256');
    const chunk = Buffer.alloc(Math.min(expectedSize, 1024 * 1024));
    let consumed = 0;
    while (consumed < expectedSize) {
      const count = readSync(descriptor, chunk, 0, Math.min(chunk.length, expectedSize - consumed), null);
      if (count === 0) throw new Error(`artifact ${relativePath} changed while hashed`);
      digest.update(chunk.subarray(0, count));
      consumed += count;
    }
    if (readSync(descriptor, Buffer.alloc(1), 0, 1, null) !== 0) {
      throw new Error(`artifact ${relativePath} exceeded its verified size`);
    }
    const after = fstatSync(descriptor, { bigint: true });
    const afterPath = lstatSync(absolute, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
        || before.mode !== after.mode || before.mtimeNs !== after.mtimeNs
        || before.ctimeNs !== after.ctimeNs || afterPath.dev !== after.dev
        || afterPath.ino !== after.ino || afterPath.size !== after.size) {
      throw new Error(`artifact ${relativePath} changed during bounded hashing`);
    }
    return `sha256:${digest.digest('hex')}`;
  } finally {
    closeSync(descriptor);
  }
}

function readBoundedRegularFile(root, relativePath, expectedSize) {
  if (typeof relativePath !== 'string' || relativePath.includes('\\')
      || path.posix.normalize(relativePath) !== relativePath || relativePath.startsWith('/')) {
    throw new Error(`artifact path ${JSON.stringify(relativePath)} is not canonical`);
  }
  const absolute = path.resolve(root, relativePath);
  if (absolute === root || !absolute.startsWith(`${root}${path.sep}`)) {
    throw new Error(`artifact path ${relativePath} escapes its root`);
  }
  const pathStat = lstatSync(absolute, { bigint: true });
  if (!pathStat.isFile() || pathStat.isSymbolicLink() || pathStat.nlink !== 1n
      || pathStat.size !== BigInt(expectedSize) || realpathSync(absolute) !== absolute) {
    throw new Error(`artifact ${relativePath} is not the expected canonical regular file`);
  }
  const descriptor = openSync(absolute, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  try {
    const before = fstatSync(descriptor, { bigint: true });
    const bytes = Buffer.alloc(expectedSize);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, null);
      if (count === 0) throw new Error(`artifact ${relativePath} changed while read`);
      offset += count;
    }
    if (readSync(descriptor, Buffer.alloc(1), 0, 1, null) !== 0) {
      throw new Error(`artifact ${relativePath} exceeded its verified size`);
    }
    const after = fstatSync(descriptor, { bigint: true });
    const afterPath = lstatSync(absolute, { bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
        || before.mode !== after.mode || before.mtimeNs !== after.mtimeNs
        || before.ctimeNs !== after.ctimeNs || afterPath.dev !== after.dev
        || afterPath.ino !== after.ino || afterPath.size !== after.size) {
      throw new Error(`artifact ${relativePath} changed during bounded read`);
    }
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

function referenceArtifacts(prefix) {
  return [
    arrayArtifact(`${prefix}-sample-steps`, `arrays/${prefix}-sample-steps.u32le`, 'uint32-le', [sampleCount], 'step'),
    arrayArtifact(`${prefix}-sample-times`, `arrays/${prefix}-sample-times.f64le`, 'float64-le', [sampleCount], 'picosecond'),
    arrayArtifact(`${prefix}-positions`, `arrays/${prefix}-positions.f64le`, 'float64-le', [sampleCount, particleCount, 3], 'nanometer'),
    arrayArtifact(`${prefix}-velocities`, `arrays/${prefix}-velocities.f64le`, 'float64-le', [sampleCount, particleCount, 3], 'nanometer-per-picosecond'),
    arrayArtifact(`${prefix}-potential-forces`, `arrays/${prefix}-potential-forces.f64le`, 'float64-le', [sampleCount, particleCount, 3], 'kilojoule-per-mole-per-nanometer'),
    arrayArtifact(`${prefix}-energies`, `arrays/${prefix}-energies.f64le`, 'float64-le', [sampleCount, 3], 'kilojoule-per-mole'),
    arrayArtifact(`${prefix}-comparison-group-energies`, `arrays/${prefix}-comparison-group-energies.f64le`, 'float64-le', [5, 5], 'kilojoule-per-mole'),
    arrayArtifact(`${prefix}-comparison-group-forces`, `arrays/${prefix}-comparison-group-forces.f64le`, 'float64-le', [5, 5, particleCount, 3], 'kilojoule-per-mole-per-nanometer'),
  ];
}

function producerStageFor(descriptor) {
  if (descriptor.id === 'runtime-inventory') return 'runtime';
  if (descriptor.id === 'prepare-receipt'
      || ['cell', 'masses', 'constraints', 'constraint-targets', 'comparison-steps',
        'start-positions', 'start-velocities'].includes(descriptor.id)) return 'prepare';
  if (descriptor.id.startsWith('reference-a-')) return 'reference-a';
  if (descriptor.id.startsWith('reference-b-')) return 'reference-b';
  if (descriptor.id === 'cpu-fixed-coordinate-run' || descriptor.id.startsWith('cpu-')) {
    return 'cpu-fixed-coordinate';
  }
  throw new Error(`no producer stage exists for ${descriptor.id}`);
}

function jsonArtifact(id, artifactPath) {
  return Object.freeze({ id, path: artifactPath, kind: 'canonical-json', dtype: 'canonical-json',
    shape: Object.freeze([]), unit: 'canonical-json-bytes' });
}

function arrayArtifact(id, artifactPath, dtype, shape, unit) {
  return Object.freeze({ id, path: artifactPath, kind: 'array', dtype,
    shape: Object.freeze(shape), unit });
}

function arrayByteCount(descriptor) {
  const bytesPerValue = descriptor.dtype === 'float64-le' ? 8 : 4;
  return descriptor.shape.reduce((product, value) => product * value, 1) * bytesPerValue;
}

function compareArtifactId(left, right) {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function byteSliceEquals(left, right, leftOffset, byteCount, rightOffset = 0) {
  if (leftOffset + byteCount > left.byteLength || rightOffset + byteCount > right.byteLength) return false;
  for (let index = 0; index < byteCount; index += 1) {
    if (left[leftOffset + index] !== right[rightOffset + index]) return false;
  }
  return true;
}

function arrayEquals(left, right) {
  if (left.length !== right.length) return false;
  for (let index = 0; index < left.length; index += 1) if (left[index] !== right[index]) return false;
  return true;
}

function assertExactKeys(value, expected, label, fail) {
  const actual = Object.keys(value).sort();
  const locked = [...expected].sort();
  if (canonicalJson(actual) !== canonicalJson(locked)) fail(`${label} keys changed`);
}

function requirePlainObject(value, label) {
  if (!isPlainObject(value)) throw new Error(`${label} must be a plain object`);
  return value;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}
