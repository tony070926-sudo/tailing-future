import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalJson, canonicalJsonBytes, sha256 } from '../runtime-input-contract.mjs';
import {
  EXPECTED_EVIDENCE_FILES,
  EXPECTED_REPOSITORY,
  EXPECTED_REPOSITORY_ID,
  EXPECTED_RUNNER,
  EXPECTED_WORKFLOW_PATH,
  EXPECTED_WORKFLOW_REF,
  LOCKED_ACQUISITION_FILES,
  LOCKED_ENTRYPOINT,
  OPENMM_SOURCE_REVISION,
  PROTECTED_BROWSER_EVIDENCE_SCHEMA_VERSION,
  PROTECTED_CI_EVIDENCE_SCHEMA_VERSION,
  buildProtectedCiEvidence,
} from './write-ci-evidence.mjs';

const SOURCE_REVISION = '7'.repeat(40);
const IMAGE_DIGEST = `sha256:${'a'.repeat(64)}`;
const CONTAINER_ID = 'b'.repeat(64);
const IMAGE_ENVIRONMENT = Object.freeze([
  'PATH=/opt/tailing-venv/bin',
  'HOME=/tmp/tailing-home',
  'PYTHONNOUSERSITE=1',
  'PYTHONHASHSEED=0',
]);
const roots = [];

afterEach(async () => {
  for (const root of roots.splice(0)) {
    await rm(root, { recursive: true, force: true });
  }
});

function digest(label) {
  return `sha256:${createHash('sha256').update(label).digest('hex')}`;
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

function makeControlReceipt() {
  const receipt = {
    schemaVersion: 'tf.openmm-tip3p-control-receipt/0.4.5',
    profile: 'openmm-tip3p-independent-control-verification',
    statusDomain: 'independent-scientific-assessment-not-release-provenance',
    status: 'verified-pass',
    systemDigest: digest('system'),
    planDigest: digest('plan'),
    sourceRevision: SOURCE_REVISION,
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
      openmmGitRevision: OPENMM_SOURCE_REVISION,
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
  };
  return withSelfDigest(receipt, 'receiptDigest');
}

function makeAcquisitionManifest() {
  const expected = new Map(LOCKED_ACQUISITION_FILES.map((record) => [record.id, record]));
  const sources = [...expected.values()].map((record) => ({
    id: record.id,
    role: record.role,
    assetClass: record.assetClass,
    destination: record.destination,
    filename: record.filename,
    sourceCommit: record.sourceCommit,
    url: record.url,
    sizeBytes: record.sizeBytes,
    sha256: record.sha256,
    networkAccessUsed: true,
    redirectFollowed: false,
    redistributionCleared: false,
    publicationEligible: false,
  }));
  const manifest = {
    schemaVersion: 'tf.openmm-ci-acquisition-manifest/0.4.5',
    profile: 'protected-ci-online-byte-acquisition',
    openmmSourceCommit: OPENMM_SOURCE_REVISION,
    networkAccessUsed: true,
    redirectPolicy: 'error',
    timeoutMilliseconds: 120_000,
    sizePolicy: 'streamed-exact-byte-count-no-unbounded-buffer',
    sources,
    publicationPolicy: {
      redistributionCleared: false,
      rawAssetsRedistributionCleared: false,
      coordinateAssetsRedistributionCleared: false,
      parameterAssetsRedistributionCleared: false,
      runtimeWheelsRedistributionCleared: false,
      rawAssetsPublic: false,
      coordinateAssetsPublic: false,
      parameterAssetsPublic: false,
      runtimeWheelsPublic: false,
      publicationEligible: false,
    },
    claims: {
      executionAuthenticated: false,
      reproduced: false,
      promotionEligible: false,
    },
  };
  return withSelfDigest(manifest, 'manifestDigest');
}

function makeProtectedBrowserEvidence(control = makeControlReceipt()) {
  const evidence = {
    schemaVersion: PROTECTED_BROWSER_EVIDENCE_SCHEMA_VERSION,
    profile: 'protected-main-private-openmm-positions-three-mode-browser-evidence',
    statusDomain: 'protected-ci-browser-observation-not-execution-attestation-reproduction-or-release',
    sourceRevision: SOURCE_REVISION,
    controlReceipt: {
      receiptDigest: control.receiptDigest,
      systemDigest: control.systemDigest,
      planDigest: control.planDigest,
      producerOutcomeDigest: control.producerOutcomeDigest,
      artifactManifestDigest: control.artifactManifestDigest,
      payloadBundleRoot: control.payloadBundleRoot,
      verifierDigest: control.verification.verifierDigest,
      status: 'verified-pass',
      allPassed: true,
      scientificPass: true,
    },
    source: {
      referenceARunReceiptDigest: digest('reference-a-run-receipt'),
      referenceARunArtifactDigest: digest('reference-a-run-artifact'),
      worldSessionDigest: digest('world-session'),
      trajectoryDigest: digest('trajectory'),
      orderedFrameDigest: digest('ordered-frames'),
      atomOrderDigest: digest('atom-order'),
      cellDigest: digest('cell'),
      topologyDigest: digest('topology'),
      privateTrajectoryMetadataDigest: digest('private-trajectory-metadata'),
      browserTrajectoryMetadataDigest: digest('browser-trajectory-metadata'),
      positionsF32TrajectoryDigest: digest('positions-f32-trajectory'),
      orderedPositionFrameDigest: digest('ordered-position-frames'),
      browserPacketDigest: digest('browser-packet'),
      frameCount: 101,
      positionsOnly: true,
    },
    browserRuntime: {
      playwrightVersion: '1.62.1',
      browserVersion: '151.0.7922.34',
      chromiumRevision: '1234',
      playwrightPackageTreeDigest:
        'sha256:5981dbf5b0604778dfe94c03564da904f13ba2289340fd1f695211922de1dc3f',
      playwrightCorePackageTreeDigest:
        'sha256:c3d1a9f4d8c8a2f5251c323aa3a4cb4202ba86f7ba4ff6330c1fa0e634f7c357',
      distributionTreeDigest:
        'sha256:ef61b26dc6a3b390355d5a4c1ea60b9ae4839bb3add815fadb26c626e7fae658',
      frozenRuntimeTreeDigest:
        'sha256:379be99b95a5b092c51dee46cc3053b08ec513618fe939a945df1f3a9a04adb3',
      allModePrePostCheckpointsMatched: true,
      hostRuntimeClosureVerified: false,
      immutableRuntimeSnapshotVerified: false,
    },
    isolation: {
      platform: 'linux-x64',
      allCredentialIdsNonRoot: true,
      allCapabilitySetsEmpty: true,
      appArmorUserNamespaceProfileVerified: true,
      noNewPrivilegesVerified: true,
      noSupplementaryPrivilegeGroups: true,
      forbiddenEnvironmentAbsent: true,
      onlyLoopbackInterfacesVerified: true,
      onlyLoopbackRoutesVerified: true,
      readOnlySourceMountVerified: true,
      readOnlyRuntimeMountVerified: true,
      pidNamespaceKillBoundaryVerified: false,
      cgroupDrainVerified: false,
    },
    client: {
      byteLength: 123_456,
      sha256: digest('browser-client'),
      responseDigestVerifiedInAllModes: true,
    },
    modeResults: [
      {
        mode: 'happy-path',
        status: 'digest-locked-main-executable-private-trajectory-draw-observed',
        observationDigest: digest('happy-path-observation'),
        terminalState: 'disposed',
        cleanupComplete: true,
        sourceOwnerRevoked: true,
        runtimeDisposed: true,
        threeDisposed: true,
        rendererDisposed: true,
        clientResponseDigestVerified: true,
        browserDrawObserved: true,
        trajectoryCompleted: true,
        frameCount: 101,
        renderedFrameCount: 101,
      },
      {
        mode: 'mid-playback-dispose',
        status: 'digest-locked-main-executable-private-trajectory-interruption-failed-closed',
        observationDigest: digest('mid-playback-dispose-observation'),
        terminalState: 'disposed',
        cleanupComplete: true,
        sourceOwnerRevoked: true,
        runtimeDisposed: true,
        threeDisposed: true,
        rendererDisposed: true,
        clientResponseDigestVerified: true,
        browserDrawObserved: true,
        trajectoryCompleted: false,
        frameCount: null,
        renderedFrameCount: 37,
      },
      {
        mode: 'context-loss',
        status: 'digest-locked-main-executable-private-trajectory-interruption-failed-closed',
        observationDigest: digest('context-loss-observation'),
        terminalState: 'context-lost',
        cleanupComplete: true,
        sourceOwnerRevoked: true,
        runtimeDisposed: true,
        threeDisposed: true,
        rendererDisposed: true,
        clientResponseDigestVerified: true,
        browserDrawObserved: true,
        trajectoryCompleted: false,
        frameCount: null,
        renderedFrameCount: 37,
      },
    ],
    crossMode: {
      sameSourceLineage: true,
      sameTrajectoryBinding: true,
      sameClientBytes: true,
      sameFrozenRuntimeTree: true,
      threeFreshCapabilities: true,
    },
    cleanup: {
      allListenersClosed: true,
      allPacketsZeroized: true,
      allTokenVerifierBytesZeroized: true,
      allAssetsZeroized: true,
      securePhysicalErasureVerified: false,
    },
    publicationPolicy: {
      artifactClass: 'non-sensitive-administrative-browser-evidence-only',
      rawScientificPayloadPublished: false,
      runtimeInputsPublished: false,
      browserArtifactsPublished: false,
      publicDistributionEligible: false,
      cloudflareDistributionEligible: false,
      licenseClearance: false,
      attested: false,
    },
    claims: {
      protectedWorkflowExecutionReported: true,
      realOpenMmProducerOutputConsumed: true,
      allThreeModesPassed: true,
      realBrowserDrawObserved: true,
      executionAuthenticated: false,
      reproduced: false,
      hostRuntimeClosureVerified: false,
      immutableRuntimeSnapshotVerified: false,
      promotionEligible: false,
      publicDistributionEligible: false,
      cloudflareDistributionEligible: false,
    },
  };
  return withSelfDigest(evidence, 'evidenceDigest');
}

function withSelfDigest(value, key) {
  return { ...value, [key]: sha256(canonicalJsonBytes(value)) };
}

function producerArguments() {
  return [
    '--input-root', '/inputs',
    '--output-root', '/work/output',
    '--source-revision', SOURCE_REVISION,
  ];
}

function makeImageInspect() {
  return [{
    Id: IMAGE_DIGEST,
    Os: 'linux',
    Architecture: 'amd64',
    Config: {
      User: '65532:65532',
      WorkingDir: '/work',
      Env: [...IMAGE_ENVIRONMENT],
      Entrypoint: [...LOCKED_ENTRYPOINT],
      Cmd: ['python3'],
      Labels: { 'org.opencontainers.image.revision': SOURCE_REVISION },
    },
    Descriptor: { annotations: { 'config.digest': IMAGE_DIGEST } },
  }];
}

function mountFixtures() {
  return [
    {
      Type: 'bind', Source: '/private/openmm-inputs', Destination: '/inputs',
      Mode: 'ro', RW: false, Propagation: 'rprivate',
    },
    {
      Type: 'bind', Source: '/private/openmm-output', Destination: '/work/output',
      Mode: 'rw', RW: true, Propagation: 'rprivate',
    },
  ];
}

function makeContainerInspect(status) {
  const args = producerArguments();
  return [{
    Id: CONTAINER_ID,
    Image: IMAGE_DIGEST,
    Platform: 'linux',
    Path: LOCKED_ENTRYPOINT[0],
    Args: [...LOCKED_ENTRYPOINT.slice(1), ...args],
    Config: {
      User: '65532:65532',
      WorkingDir: '/work',
      Env: [...IMAGE_ENVIRONMENT],
      Entrypoint: [...LOCKED_ENTRYPOINT],
      Cmd: args,
      Labels: { 'org.opencontainers.image.revision': SOURCE_REVISION },
    },
    HostConfig: {
      NetworkMode: 'none',
      ReadonlyRootfs: true,
      CapAdd: null,
      CapDrop: ['ALL'],
      SecurityOpt: ['no-new-privileges=true'],
      Privileged: false,
      Devices: [],
      DeviceRequests: null,
      PidsLimit: 128,
      Memory: 8 * 1024 * 1024 * 1024,
      MemorySwap: 8 * 1024 * 1024 * 1024,
      NanoCpus: 2_000_000_000,
      Tmpfs: {},
      VolumesFrom: null,
      RestartPolicy: { Name: 'no', MaximumRetryCount: 0 },
      PublishAllPorts: false,
      PortBindings: {},
      Links: null,
      ExtraHosts: null,
      Dns: [],
      DnsOptions: [],
      DnsSearch: [],
      Binds: null,
      Mounts: [
        {
          Type: 'bind', Source: '/private/openmm-inputs', Target: '/inputs', ReadOnly: true,
        },
        {
          Type: 'bind', Source: '/private/openmm-output', Target: '/work/output', ReadOnly: false,
        },
      ],
    },
    Mounts: mountFixtures(),
    State: status === 'created' ? {
      Status: 'created', Running: false, Paused: false, Restarting: false,
      OOMKilled: false, Dead: false, ExitCode: 0, Error: '',
    } : {
      Status: 'exited', Running: false, Paused: false, Restarting: false,
      OOMKilled: false, Dead: false, ExitCode: 0, Error: '',
    },
  }];
}

function makeOptions() {
  return {
    repository: EXPECTED_REPOSITORY,
    repositoryId: EXPECTED_REPOSITORY_ID,
    workflowPath: EXPECTED_WORKFLOW_PATH,
    workflowRef: EXPECTED_WORKFLOW_REF,
    sourceRevision: SOURCE_REVISION,
    runId: '9876543210',
    runAttempt: '2',
    runnerName: EXPECTED_RUNNER.name,
    runnerOs: EXPECTED_RUNNER.os,
    runnerArch: EXPECTED_RUNNER.architecture,
  };
}

function makeInputBytes() {
  const control = makeControlReceipt();
  return {
    'buildx-version.txt': Buffer.from('github.com/docker/buildx v0.28.0 abcdef\n'),
    'container-create-inspect.json': canonicalJsonBytes(makeContainerInspect('created')),
    'container-final-inspect.json': canonicalJsonBytes(makeContainerInspect('exited')),
    'docker-version.txt': Buffer.from('Docker version 28.4.0, build abcdef\n'),
    'image-inspect.json': canonicalJsonBytes(makeImageInspect()),
    'openmm-ci-acquisition-manifest.json': canonicalJsonBytes(makeAcquisitionManifest()),
    'openmm-tip3p-control-receipt.json': canonicalJsonBytes(control),
    'openmm-tip3p-protected-browser-evidence.json': canonicalJsonBytes(
      makeProtectedBrowserEvidence(control),
    ),
  };
}

function build(inputBytes = makeInputBytes(), options = makeOptions()) {
  return buildProtectedCiEvidence({ options, inputBytes });
}

function mutateCanonical(bytes, mutate, selfDigestKey = null) {
  const value = JSON.parse(bytes);
  mutate(value);
  if (selfDigestKey !== null) {
    delete value[selfDigestKey];
    return canonicalJsonBytes(withSelfDigest(value, selfDigestKey));
  }
  return canonicalJsonBytes(value);
}

const evidenceSchemaPath = fileURLToPath(new URL(
  '../../../schemas/openmm-tip3p-protected-ci-evidence.schema.json', import.meta.url,
));

describe('protected OpenMM CI evidence envelope', () => {
  it('accepts the closed protected run, validates the strict schema and binds every raw file', () => {
    const inputBytes = makeInputBytes();
    const result = build(inputBytes);
    const validate = new Ajv2020({ allErrors: true, strict: true }).compile(
      JSON.parse(readFileSync(evidenceSchemaPath, 'utf8')),
    );
    expect(validate(result.evidence), JSON.stringify(validate.errors)).toBe(true);
    expect(result.evidence.schemaVersion).toBe(PROTECTED_CI_EVIDENCE_SCHEMA_VERSION);
    expect(result.evidence.files.map((record) => record.path)).toEqual(EXPECTED_EVIDENCE_FILES);
    expect(EXPECTED_EVIDENCE_FILES).toHaveLength(8);
    expect(EXPECTED_EVIDENCE_FILES.length + 1).toBe(9);
    for (const record of result.evidence.files) {
      expect(record).toEqual({
        path: record.path,
        sizeBytes: inputBytes[record.path].length,
        sha256: sha256(inputBytes[record.path]),
      });
    }
    const { evidenceDigest, ...preimage } = result.evidence;
    expect(evidenceDigest).toBe(sha256(canonicalJsonBytes(preimage)));
    expect(result.bytes).toEqual(canonicalJsonBytes(result.evidence));
    expect(result.evidence.claims).toEqual({
      attestationPending: true,
      executionAuthenticated: false,
      reproduced: false,
      promotionEligible: false,
    });
    expect(result.evidence.publicationPolicy).toMatchObject({
      rawScientificPayloadEphemeral: true,
      rawScientificPayloadPublished: false,
      cloudflareDistributionEligible: false,
    });
    const browserReceipt = JSON.parse(
      inputBytes['openmm-tip3p-protected-browser-evidence.json'],
    );
    expect(result.evidence.browserEvidence).toEqual({
      evidenceDigest: browserReceipt.evidenceDigest,
      sourceRevision: SOURCE_REVISION,
      controlReceiptDigest: browserReceipt.controlReceipt.receiptDigest,
      allThreeModesPassed: true,
      protectedWorkflowExecutionReported: true,
      executionAuthenticated: false,
      reproduced: false,
      promotionEligible: false,
    });
    const schemaLeak = structuredClone(result.evidence);
    schemaLeak.browserEvidence.url = 'http://127.0.0.1/private';
    expect(validate(schemaLeak)).toBe(false);
    expect(result.evidence.container.mounts).toEqual([
      { destination: '/inputs', type: 'bind', readWrite: false },
      { destination: '/work/output', type: 'bind', readWrite: true },
    ]);
    expect(canonicalJson(result.evidence)).not.toContain('/private/openmm-');
  });

  it.each([
    ['status', (receipt) => { receipt.status = 'verified-fail'; }],
    ['allPassed', (receipt) => { receipt.gates.allPassed = false; }],
    ['scientific claim', (receipt) => { receipt.claims.scientificPass = false; }],
  ])('rejects a non-passing control receipt: %s', (_label, mutate) => {
    const inputs = makeInputBytes();
    inputs['openmm-tip3p-control-receipt.json'] = mutateCanonical(
      inputs['openmm-tip3p-control-receipt.json'], mutate, 'receiptDigest',
    );
    expect(() => build(inputs)).toThrow(/schema|verified scientific pass/);
  });

  it.each([
    ['execution authentication', (receipt) => {
      receipt.verification.executionAuthenticityVerified = true;
    }],
    ['reproduced claim', (receipt) => { receipt.claims.reproduced = true; }],
    ['promotion claim', (receipt) => { receipt.claims.scorePromotionEligible = true; }],
  ])('rejects a positive unauthenticated claim: %s', (_label, mutate) => {
    const inputs = makeInputBytes();
    inputs['openmm-tip3p-control-receipt.json'] = mutateCanonical(
      inputs['openmm-tip3p-control-receipt.json'], mutate, 'receiptDigest',
    );
    expect(() => build(inputs)).toThrow(/schema|unauthenticated|non-promotional/);
  });

  it('rejects public/Cloudflare eligibility in either control or acquisition evidence', () => {
    const control = makeInputBytes();
    control['openmm-tip3p-control-receipt.json'] = mutateCanonical(
      control['openmm-tip3p-control-receipt.json'],
      (receipt) => { receipt.publicationPolicy.cloudflareDistributionEligible = true; },
      'receiptDigest',
    );
    expect(() => build(control)).toThrow(/schema|publication policy/);

    const acquisition = makeInputBytes();
    acquisition['openmm-ci-acquisition-manifest.json'] = mutateCanonical(
      acquisition['openmm-ci-acquisition-manifest.json'],
      (manifest) => { manifest.publicationPolicy.rawAssetsPublic = true; },
      'manifestDigest',
    );
    expect(() => build(acquisition)).toThrow(/private non-promotional boundary/);
  });

  it('requires canonical, self-digested browser evidence bound to this source and control receipt', () => {
    const noncanonical = makeInputBytes();
    const parsed = JSON.parse(noncanonical['openmm-tip3p-protected-browser-evidence.json']);
    noncanonical['openmm-tip3p-protected-browser-evidence.json'] = Buffer.from(
      `${JSON.stringify(parsed, null, 2)}\n`,
    );
    expect(() => build(noncanonical)).toThrow(/canonical JSON/);

    const stale = makeInputBytes();
    stale['openmm-tip3p-protected-browser-evidence.json'] = mutateCanonical(
      stale['openmm-tip3p-protected-browser-evidence.json'],
      (receipt) => { receipt.source.frameCount = 100; },
    );
    expect(() => build(stale)).toThrow(/frame count|stale self digest/);

    const sourceDrift = makeInputBytes();
    sourceDrift['openmm-tip3p-protected-browser-evidence.json'] = mutateCanonical(
      sourceDrift['openmm-tip3p-protected-browser-evidence.json'],
      (receipt) => { receipt.sourceRevision = '8'.repeat(40); },
      'evidenceDigest',
    );
    expect(() => build(sourceDrift)).toThrow(/identity or source revision/);

    const controlDrift = makeInputBytes();
    controlDrift['openmm-tip3p-protected-browser-evidence.json'] = mutateCanonical(
      controlDrift['openmm-tip3p-protected-browser-evidence.json'],
      (receipt) => { receipt.controlReceipt.receiptDigest = digest('other control'); },
      'evidenceDigest',
    );
    expect(() => build(controlDrift)).toThrow(/bound to the OpenMM control receipt/);

    const zeroSourceDigest = makeInputBytes();
    zeroSourceDigest['openmm-tip3p-protected-browser-evidence.json'] = mutateCanonical(
      zeroSourceDigest['openmm-tip3p-protected-browser-evidence.json'],
      (receipt) => { receipt.source.worldSessionDigest = `sha256:${'0'.repeat(64)}`; },
      'evidenceDigest',
    );
    expect(() => build(zeroSourceDigest)).toThrow(/worldSessionDigest/);

    const oversizedClient = makeInputBytes();
    oversizedClient['openmm-tip3p-protected-browser-evidence.json'] = mutateCanonical(
      oversizedClient['openmm-tip3p-protected-browser-evidence.json'],
      (receipt) => { receipt.client.byteLength = 2 * 1024 * 1024 + 1; },
      'evidenceDigest',
    );
    expect(() => build(oversizedClient)).toThrow(/client byte/);

    const duplicateKey = makeInputBytes();
    duplicateKey['openmm-tip3p-protected-browser-evidence.json'] = Buffer.from(
      '{"schemaVersion":"one","schemaVersion":"two"}\n',
    );
    expect(() => build(duplicateKey)).toThrow(/duplicate JSON key/);
  });

  it.each([
    ['host runtime closure', (receipt) => {
      receipt.browserRuntime.hostRuntimeClosureVerified = true;
    }],
    ['host runtime closure claim', (receipt) => {
      receipt.claims.hostRuntimeClosureVerified = true;
    }],
    ['authenticated execution', (receipt) => { receipt.claims.executionAuthenticated = true; }],
    ['reproduction', (receipt) => { receipt.claims.reproduced = true; }],
    ['promotion', (receipt) => { receipt.claims.promotionEligible = true; }],
    ['public claim', (receipt) => { receipt.claims.publicDistributionEligible = true; }],
    ['Cloudflare claim', (receipt) => {
      receipt.claims.cloudflareDistributionEligible = true;
    }],
    ['public policy', (receipt) => {
      receipt.publicationPolicy.publicDistributionEligible = true;
    }],
    ['raw scientific payload publication', (receipt) => {
      receipt.publicationPolicy.rawScientificPayloadPublished = true;
    }],
    ['browser artifact publication', (receipt) => {
      receipt.publicationPolicy.browserArtifactsPublished = true;
    }],
    ['Cloudflare policy', (receipt) => {
      receipt.publicationPolicy.cloudflareDistributionEligible = true;
    }],
    ['license clearance', (receipt) => {
      receipt.publicationPolicy.licenseClearance = true;
    }],
  ])('rejects browser evidence claim escalation: %s', (_label, mutate) => {
    const inputs = makeInputBytes();
    inputs['openmm-tip3p-protected-browser-evidence.json'] = mutateCanonical(
      inputs['openmm-tip3p-protected-browser-evidence.json'], mutate, 'evidenceDigest',
    );
    expect(() => build(inputs)).toThrow(/runtime identity|claims|publication policy/);
  });

  it('requires the exact ordered three-mode pass and distinct observation digests', () => {
    const reordered = makeInputBytes();
    reordered['openmm-tip3p-protected-browser-evidence.json'] = mutateCanonical(
      reordered['openmm-tip3p-protected-browser-evidence.json'],
      (receipt) => { receipt.modeResults.reverse(); },
      'evidenceDigest',
    );
    expect(() => build(reordered)).toThrow(/mode happy-path/);

    const failed = makeInputBytes();
    failed['openmm-tip3p-protected-browser-evidence.json'] = mutateCanonical(
      failed['openmm-tip3p-protected-browser-evidence.json'],
      (receipt) => { receipt.modeResults[0].cleanupComplete = false; },
      'evidenceDigest',
    );
    expect(() => build(failed)).toThrow(/mode happy-path/);

    const wrongBarrier = makeInputBytes();
    wrongBarrier['openmm-tip3p-protected-browser-evidence.json'] = mutateCanonical(
      wrongBarrier['openmm-tip3p-protected-browser-evidence.json'],
      (receipt) => { receipt.modeResults[1].renderedFrameCount = 0; },
      'evidenceDigest',
    );
    expect(() => build(wrongBarrier)).toThrow(/mode mid-playback-dispose/);

    const drawDenied = makeInputBytes();
    drawDenied['openmm-tip3p-protected-browser-evidence.json'] = mutateCanonical(
      drawDenied['openmm-tip3p-protected-browser-evidence.json'],
      (receipt) => { receipt.modeResults[1].browserDrawObserved = false; },
      'evidenceDigest',
    );
    expect(() => build(drawDenied)).toThrow(/mode mid-playback-dispose/);

    const interruptedCompletion = makeInputBytes();
    interruptedCompletion['openmm-tip3p-protected-browser-evidence.json'] = mutateCanonical(
      interruptedCompletion['openmm-tip3p-protected-browser-evidence.json'],
      (receipt) => { receipt.modeResults[2].trajectoryCompleted = true; },
      'evidenceDigest',
    );
    expect(() => build(interruptedCompletion)).toThrow(/mode context-loss/);

    const duplicate = makeInputBytes();
    duplicate['openmm-tip3p-protected-browser-evidence.json'] = mutateCanonical(
      duplicate['openmm-tip3p-protected-browser-evidence.json'],
      (receipt) => {
        receipt.modeResults[2].observationDigest = receipt.modeResults[1].observationDigest;
      },
      'evidenceDigest',
    );
    expect(() => build(duplicate)).toThrow(/three distinct observation digests/);

    const aggregateClaimFailed = makeInputBytes();
    aggregateClaimFailed['openmm-tip3p-protected-browser-evidence.json'] = mutateCanonical(
      aggregateClaimFailed['openmm-tip3p-protected-browser-evidence.json'],
      (receipt) => { receipt.claims.allThreeModesPassed = false; },
      'evidenceDigest',
    );
    expect(() => build(aggregateClaimFailed)).toThrow(/browser claims/);
  });

  it.each([
    ['private path', (receipt) => { receipt.privatePath = '/private/runtime'; }],
    ['coordinates', (receipt) => { receipt.source.coordinates = [[0, 0, 0]]; }],
    ['token', (receipt) => { receipt.client.token = 'secret'; }],
    ['URL', (receipt) => { receipt.modeResults[0].url = 'http://127.0.0.1/secret'; }],
  ])('rejects extra sensitive browser evidence fields: %s', (_label, mutate) => {
    const inputs = makeInputBytes();
    inputs['openmm-tip3p-protected-browser-evidence.json'] = mutateCanonical(
      inputs['openmm-tip3p-protected-browser-evidence.json'], mutate, 'evidenceDigest',
    );
    expect(() => build(inputs)).toThrow(/unexpected or missing fields/);
  });

  it('rejects an extra in-memory evidence input instead of silently omitting it', () => {
    const inputs = makeInputBytes();
    inputs['browser-debug.log'] = Buffer.from('sensitive\n');
    expect(() => build(inputs)).toThrow(/exactly the eight locked inputs/);
  });

  it('rejects image identity and unsuccessful final process state', () => {
    const architecture = makeInputBytes();
    architecture['image-inspect.json'] = mutateCanonical(
      architecture['image-inspect.json'], (inspect) => { inspect[0].Architecture = 'arm64'; },
    );
    expect(() => build(architecture)).toThrow(/Linux\/amd64/);

    const failed = makeInputBytes();
    failed['container-final-inspect.json'] = mutateCanonical(
      failed['container-final-inspect.json'], (inspect) => { inspect[0].State.ExitCode = 1; },
    );
    expect(() => build(failed)).toThrow(/successful non-OOM exit/);

    const oom = makeInputBytes();
    oom['container-final-inspect.json'] = mutateCanonical(
      oom['container-final-inspect.json'], (inspect) => { inspect[0].State.OOMKilled = true; },
    );
    expect(() => build(oom)).toThrow(/successful non-OOM exit/);

    const staleCreateError = makeInputBytes();
    staleCreateError['container-create-inspect.json'] = mutateCanonical(
      staleCreateError['container-create-inspect.json'],
      (inspect) => { inspect[0].State.Error = 'previous create error'; },
    );
    expect(() => build(staleCreateError)).toThrow(/untouched created container/);
  });

  it.each([
    ['network', (inspect) => { inspect[0].HostConfig.NetworkMode = 'bridge'; }],
    ['privilege', (inspect) => { inspect[0].HostConfig.Privileged = true; }],
    ['pids', (inspect) => { inspect[0].HostConfig.PidsLimit = 129; }],
    ['memory', (inspect) => { inspect[0].HostConfig.Memory = 1024; }],
    ['cpus', (inspect) => { inspect[0].HostConfig.NanoCpus = 1_000_000_000; }],
    ['capabilities', (inspect) => { inspect[0].HostConfig.CapDrop = []; }],
    ['no-new-privileges', (inspect) => { inspect[0].HostConfig.SecurityOpt = []; }],
  ])('rejects container security drift: %s', (_label, mutate) => {
    const inputs = makeInputBytes();
    inputs['container-create-inspect.json'] = mutateCanonical(
      inputs['container-create-inspect.json'], mutate,
    );
    expect(() => build(inputs)).toThrow(/security limits/);
  });

  it.each([
    ['created', 'container-create-inspect.json'],
    ['final', 'container-final-inspect.json'],
  ])('rejects %s-container runtime environment injection', (_label, filename) => {
    const inputs = makeInputBytes();
    inputs[filename] = mutateCanonical(inputs[filename], (inspect) => {
      inspect[0].Config.Env.push('LD_PRELOAD=/inputs/untrusted.so');
    });
    expect(() => build(inputs)).toThrow(/runtime environment.*locked vector/);
  });

  it.each([
    ['added capability', (inspect) => { inspect[0].HostConfig.CapAdd = ['SYS_ADMIN']; }],
    ['mapped device', (inspect) => {
      inspect[0].HostConfig.Devices = [{
        PathOnHost: '/dev/kvm', PathInContainer: '/dev/kvm', CgroupPermissions: 'rwm',
      }];
    }],
    ['device request', (inspect) => {
      inspect[0].HostConfig.DeviceRequests = [{ Driver: 'nvidia', Count: -1 }];
    }],
  ])('rejects container privilege/device injection: %s', (_label, mutate) => {
    const inputs = makeInputBytes();
    inputs['container-create-inspect.json'] = mutateCanonical(
      inputs['container-create-inspect.json'], mutate,
    );
    expect(() => build(inputs)).toThrow(/CapAdd|Devices|DeviceRequests/);
  });

  it.each([
    ['restart mode', (inspect) => {
      inspect[0].HostConfig.RestartPolicy.Name = 'always';
    }, /restart policy/],
    ['restart count', (inspect) => {
      inspect[0].HostConfig.RestartPolicy.MaximumRetryCount = 1;
    }, /restart policy/],
    ['publish all ports', (inspect) => {
      inspect[0].HostConfig.PublishAllPorts = true;
    }, /publish ports/],
    ['port binding', (inspect) => {
      inspect[0].HostConfig.PortBindings = { '80/tcp': [{ HostPort: '8080' }] };
    }, /PortBindings/],
    ['legacy link', (inspect) => {
      inspect[0].HostConfig.Links = ['database:database'];
    }, /Links/],
    ['extra host', (inspect) => {
      inspect[0].HostConfig.ExtraHosts = ['host.docker.internal:host-gateway'];
    }, /ExtraHosts/],
    ['DNS server', (inspect) => {
      inspect[0].HostConfig.Dns = ['8.8.8.8'];
    }, /Dns/],
    ['DNS option', (inspect) => {
      inspect[0].HostConfig.DnsOptions = ['use-vc'];
    }, /DnsOptions/],
    ['DNS search', (inspect) => {
      inspect[0].HostConfig.DnsSearch = ['example.invalid'];
    }, /DnsSearch/],
  ])('rejects restart, port, or host injection: %s', (_label, mutate, error) => {
    const inputs = makeInputBytes();
    inputs['container-create-inspect.json'] = mutateCanonical(
      inputs['container-create-inspect.json'], mutate,
    );
    expect(() => build(inputs)).toThrow(error);
  });

  it('rejects extra, writable-input, or create/final-divergent mounts', () => {
    const extra = makeInputBytes();
    extra['container-create-inspect.json'] = mutateCanonical(
      extra['container-create-inspect.json'], (inspect) => {
        inspect[0].Mounts.push({
          Type: 'bind', Source: '/private/extra', Destination: '/extra', Mode: 'ro', RW: false,
        });
        inspect[0].HostConfig.Mounts.push({
          Type: 'bind', Source: '/private/extra', Target: '/extra', ReadOnly: true,
        });
      },
    );
    expect(() => build(extra)).toThrow(/exactly two mounts/);

    const writable = makeInputBytes();
    writable['container-create-inspect.json'] = mutateCanonical(
      writable['container-create-inspect.json'], (inspect) => {
        inspect[0].Mounts[0].RW = true;
        inspect[0].Mounts[0].Mode = 'rw';
        inspect[0].HostConfig.Mounts[0].ReadOnly = false;
      },
    );
    expect(() => build(writable)).toThrow(/read-only/);

    const divergent = makeInputBytes();
    divergent['container-final-inspect.json'] = mutateCanonical(
      divergent['container-final-inspect.json'], (inspect) => {
        inspect[0].Mounts[1].Source = '/private/other-output';
        inspect[0].HostConfig.Mounts[1].Source = '/private/other-output';
      },
    );
    expect(() => build(divergent)).toThrow(/create\/final.*mount/);
  });

  it('rejects source SHA drift across control, image, and acquisition receipts', () => {
    const control = makeInputBytes();
    control['openmm-tip3p-control-receipt.json'] = mutateCanonical(
      control['openmm-tip3p-control-receipt.json'],
      (receipt) => { receipt.sourceRevision = '8'.repeat(40); }, 'receiptDigest',
    );
    expect(() => build(control)).toThrow(/source revision/);

    const image = makeInputBytes();
    image['image-inspect.json'] = mutateCanonical(
      image['image-inspect.json'],
      (inspect) => { inspect[0].Config.Labels['org.opencontainers.image.revision'] = '8'.repeat(40); },
    );
    expect(() => build(image)).toThrow(/revision label/);

    const acquisition = makeInputBytes();
    acquisition['openmm-ci-acquisition-manifest.json'] = mutateCanonical(
      acquisition['openmm-ci-acquisition-manifest.json'],
      (manifest) => { manifest.openmmSourceCommit = '8'.repeat(40); }, 'manifestDigest',
    );
    expect(() => build(acquisition)).toThrow(/identity, source/);
  });

  it.each([
    ['repository', { repository: 'attacker/fork' }],
    ['repository ID', { repositoryId: '1' }],
    ['workflow path', { workflowPath: '.github/workflows/other.yml' }],
    ['workflow ref', { workflowRef: 'refs/pull/1/merge' }],
    ['runner', { runnerName: 'self-hosted' }],
  ])('rejects protected source/repository context drift: %s', (_label, changed) => {
    expect(() => build(makeInputBytes(), { ...makeOptions(), ...changed }))
      .toThrow(/repository|workflow|runner/);
  });

  it('rejects stale self digests, non-JSON numbers, and duplicate keys', () => {
    const stale = makeInputBytes();
    stale['openmm-tip3p-control-receipt.json'] = mutateCanonical(
      stale['openmm-tip3p-control-receipt.json'],
      (receipt) => { receipt.metrics.energyDriftSlopeKjMolPicosecond = 2e-6; },
    );
    expect(() => build(stale)).toThrow(/stale self digest/);

    const staleAcquisition = makeInputBytes();
    staleAcquisition['openmm-ci-acquisition-manifest.json'] = mutateCanonical(
      staleAcquisition['openmm-ci-acquisition-manifest.json'],
      (manifest) => { manifest.manifestDigest = digest('stale acquisition'); },
    );
    expect(() => build(staleAcquisition)).toThrow(/stale self digest/);

    const nan = makeInputBytes();
    nan['image-inspect.json'] = Buffer.from('[{"Id":NaN}]\n');
    expect(() => build(nan)).toThrow(/JSON|expected/);

    const duplicate = makeInputBytes();
    duplicate['openmm-ci-acquisition-manifest.json'] = Buffer.from(
      '{"schemaVersion":"one","schemaVersion":"two"}\n',
    );
    expect(() => build(duplicate)).toThrow(/duplicate JSON key/);
  });
});

const cliPath = fileURLToPath(new URL('./write-ci-evidence.mjs', import.meta.url));

function cliArguments(paths) {
  return [
    '--evidence-root', paths.evidenceRoot,
    '--output', paths.output,
    '--repository', EXPECTED_REPOSITORY,
    '--repository-id', EXPECTED_REPOSITORY_ID,
    '--workflow-path', EXPECTED_WORKFLOW_PATH,
    '--workflow-ref', EXPECTED_WORKFLOW_REF,
    '--source-revision', SOURCE_REVISION,
    '--run-id', '9876543210',
    '--run-attempt', '2',
    '--runner-name', EXPECTED_RUNNER.name,
    '--runner-os', EXPECTED_RUNNER.os,
    '--runner-arch', EXPECTED_RUNNER.architecture,
  ];
}

async function stageCliFixture() {
  const root = await realpath(await mkdtemp(
    path.join(os.tmpdir(), 'tf-openmm-ci-evidence-'),
  ));
  roots.push(root);
  const evidenceRoot = path.join(root, 'private-evidence');
  const publishRoot = path.join(root, 'publish');
  await mkdir(evidenceRoot);
  await mkdir(publishRoot);
  const inputBytes = makeInputBytes();
  await Promise.all(EXPECTED_EVIDENCE_FILES.map((filename) => (
    writeFile(path.join(evidenceRoot, filename), inputBytes[filename])
  )));
  return {
    root,
    evidenceRoot,
    publishRoot,
    output: path.join(publishRoot, 'openmm-tip3p-protected-ci-evidence.json'),
  };
}

describe('protected OpenMM CI evidence filesystem and CLI boundary', () => {
  it('writes one canonical 0444 file and refuses overwrite', async () => {
    const paths = await stageCliFixture();
    const first = spawnSync(process.execPath, [cliPath, ...cliArguments(paths)], { encoding: 'utf8' });
    expect(first.status, first.stderr).toBe(0);
    expect(first.stderr).toBe('');
    const bytes = await readFile(paths.output);
    const summary = JSON.parse(first.stdout);
    expect(summary.fileDigest).toBe(sha256(bytes));
    expect(summary.evidenceDigest).toBe(JSON.parse(bytes).evidenceDigest);
    expect(bytes).toEqual(canonicalJsonBytes(JSON.parse(bytes)));
    expect(Number((await lstat(paths.output)).mode & 0o777)).toBe(0o444);

    const overwrite = spawnSync(process.execPath, [cliPath, ...cliArguments(paths)], {
      encoding: 'utf8',
    });
    expect(overwrite.status).not.toBe(0);
    expect(overwrite.stderr).toMatch(/EEXIST|exist/);
  });

  it('rejects extra entries, symlinks, and hardlinks in the closed evidence root', async () => {
    const extra = await stageCliFixture();
    await writeFile(path.join(extra.evidenceRoot, 'extra.txt'), 'x');
    let result = spawnSync(process.execPath, [cliPath, ...cliArguments(extra)], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/exactly the eight locked/);

    const symbolic = await stageCliFixture();
    const symbolicPath = path.join(symbolic.evidenceRoot, 'docker-version.txt');
    const symbolicTarget = path.join(symbolic.root, 'docker-version-source.txt');
    await writeFile(symbolicTarget, 'Docker version 28.4.0, build abcdef\n');
    await unlink(symbolicPath);
    await symlink(symbolicTarget, symbolicPath);
    result = spawnSync(process.execPath, [cliPath, ...cliArguments(symbolic)], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/eight locked|symlink|canonical/);

    const hard = await stageCliFixture();
    const hardPath = path.join(hard.evidenceRoot, 'docker-version.txt');
    const hardTarget = path.join(hard.root, 'docker-version-source.txt');
    await writeFile(hardTarget, 'Docker version 28.4.0, build abcdef\n');
    await unlink(hardPath);
    await link(hardTarget, hardPath);
    result = spawnSync(process.execPath, [cliPath, ...cliArguments(hard)], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/single-link regular file/);
  });

  it('requires the exact CLI vector and leaves private evidence writable only by the job', async () => {
    const paths = await stageCliFixture();
    const missing = cliArguments(paths).slice(0, -2);
    const result = spawnSync(process.execPath, [cliPath, ...missing], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/every locked CLI option/);
    await chmod(paths.evidenceRoot, 0o700);
    expect(Number((await lstat(paths.evidenceRoot)).mode & 0o777)).toBe(0o700);
  });
});
