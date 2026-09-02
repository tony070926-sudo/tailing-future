import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  chmod, link, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rm, symlink,
  unlink, writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import Ajv2020 from 'ajv/dist/2020.js';
import { afterEach, describe, expect, it } from 'vitest';
import { canonicalJson, canonicalJsonBytes, sha256 } from '../../runtime-input-contract.mjs';
import {
  EXPECTED_INPUT_BASENAMES,
  MODE_ORDER,
  MODE_RECEIPT_SCHEMA_VERSION,
  PROTECTED_BROWSER_EVIDENCE_SCHEMA_VERSION,
  buildProtectedBrowserEvidence,
  writeNewAtomic,
} from './compose-protected-browser-evidence-v049.mjs';

const SOURCE_REVISION = '7'.repeat(40);
const OPENMM_REVISION = 'c6173db6e8edd705eb59172bd21e9ce69c572405';
const roots = [];

afterEach(async () => {
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

function digest(label) {
  return `sha256:${createHash('sha256').update(label).digest('hex')}`;
}

function withDigest(value, key) {
  return { ...value, [key]: sha256(canonicalJsonBytes(value)) };
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
  return withDigest({
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
      openmmGitRevision: OPENMM_REVISION,
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
      verifierRuntime: { nodeVersion: 'v24.16.0', platform: 'linux', architecture: 'x64' },
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
  }, 'receiptDigest');
}

function controlProjection(control) {
  return {
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
  };
}

const commonSource = Object.freeze({
  referenceARunReceiptDigest: digest('reference-a-receipt'),
  referenceARunArtifactDigest: digest('reference-a-artifact'),
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
});
const commonRuntime = Object.freeze({
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
  packagePreflightBeforeDigest: digest('package-preflight'),
  packagePreflightAfterDigest: digest('package-preflight'),
  packagePrePostMatched: true,
  runtimePreflightBeforeDigest: digest('runtime-preflight'),
  runtimePreflightAfterDigest: digest('runtime-preflight'),
  runtimePrePostMatched: true,
  hostRuntimeClosureVerified: false,
  immutableRuntimeSnapshotVerified: false,
});
const commonIsolation = Object.freeze({
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
});
const commonClient = Object.freeze({
  byteLength: 123_456,
  sha256: digest('client'),
  responseDigestVerified: true,
});

function modeDefinition(mode) {
  return mode === 'happy-path' ? {
    status: 'digest-locked-main-executable-private-trajectory-draw-observed',
    terminalState: 'disposed', browserDrawObserved: true, trajectoryCompleted: true,
    frameCount: 101,
    renderedFrameCount: 101,
  } : {
    status: 'digest-locked-main-executable-private-trajectory-interruption-failed-closed',
    terminalState: mode === 'context-loss' ? 'context-lost' : 'disposed',
    browserDrawObserved: true, trajectoryCompleted: false, frameCount: null,
    renderedFrameCount: 37,
  };
}

function makeModeReceipt(mode, control) {
  const definition = modeDefinition(mode);
  return withDigest({
    schemaVersion: MODE_RECEIPT_SCHEMA_VERSION,
    profile: 'protected-main-private-openmm-browser-mode-receipt',
    statusDomain: 'same-job-real-source-browser-observation-not-attestation-reproduction-or-release',
    sourceRevision: SOURCE_REVISION,
    mode,
    controlReceipt: controlProjection(control),
    source: { ...commonSource },
    browserRuntime: { ...commonRuntime },
    isolation: { ...commonIsolation },
    client: { ...commonClient },
    observation: {
      mode,
      status: definition.status,
      observationDigest: digest(`${mode}-observation`),
      terminalState: definition.terminalState,
      cleanupComplete: true,
      sourceOwnerRevoked: true,
      runtimeDisposed: true,
      threeDisposed: true,
      rendererDisposed: true,
      clientResponseDigestVerified: true,
      browserDrawObserved: definition.browserDrawObserved,
      trajectoryCompleted: definition.trajectoryCompleted,
      frameCount: definition.frameCount,
      renderedFrameCount: definition.renderedFrameCount,
    },
    cleanup: {
      listenerClosed: true,
      packetZeroized: true,
      tokenSourceBytesZeroized: true,
      tokenVerifierBytesZeroized: true,
      assetBytesZeroized: true,
      securePhysicalErasureVerified: false,
    },
    claims: {
      realOpenMmProducerOutputConsumed: true,
      realChromiumProcessObserved: true,
      executionAuthenticated: false,
      reproduced: false,
      promotionEligible: false,
      publicDistributionEligible: false,
      cloudflareDistributionEligible: false,
      sourceLicenseForPublicDistributionVerified: false,
    },
  }, 'receiptDigest');
}

function makeInputs() {
  const control = makeControlReceipt();
  return {
    controlReceiptBytes: canonicalJsonBytes(control),
    modeReceiptBytes: Object.fromEntries(MODE_ORDER.map((mode) => [
      mode, canonicalJsonBytes(makeModeReceipt(mode, control)),
    ])),
  };
}

function mutate(bytes, callback, digestKey = 'receiptDigest') {
  const value = JSON.parse(bytes);
  callback(value);
  if (digestKey !== null) {
    delete value[digestKey];
    return canonicalJsonBytes(withDigest(value, digestKey));
  }
  return canonicalJsonBytes(value);
}

describe('protected browser evidence composer', () => {
  it('composes the exact sanitized canonical evidence contract', () => {
    const result = buildProtectedBrowserEvidence(makeInputs());
    const schema = JSON.parse(readFileSync(fileURLToPath(new URL(
      '../../../../schemas/openmm-tip3p-protected-browser-evidence.schema.json', import.meta.url,
    )), 'utf8'));
    const validate = new Ajv2020({ strict: true, allErrors: true }).compile(schema);
    expect(validate(result.evidence), JSON.stringify(validate.errors)).toBe(true);
    const drawDenied = structuredClone(result.evidence);
    drawDenied.modeResults[1].browserDrawObserved = false;
    expect(validate(drawDenied)).toBe(false);
    const completedHappyDenied = structuredClone(result.evidence);
    completedHappyDenied.modeResults[0].trajectoryCompleted = false;
    expect(validate(completedHappyDenied)).toBe(false);
    const interruptedCompletionClaim = structuredClone(result.evidence);
    interruptedCompletionClaim.modeResults[2].trajectoryCompleted = true;
    expect(validate(interruptedCompletionClaim)).toBe(false);
    expect(result.evidence.schemaVersion).toBe(PROTECTED_BROWSER_EVIDENCE_SCHEMA_VERSION);
    expect(result.evidence.modeResults.map(({ mode }) => mode)).toEqual(MODE_ORDER);
    expect(result.evidence.isolation).toMatchObject({
      appArmorUserNamespaceProfileVerified: true,
      pidNamespaceKillBoundaryVerified: false,
      cgroupDrainVerified: false,
    });
    expect(result.evidence.source).toMatchObject({
      worldSessionDigest: commonSource.worldSessionDigest,
      privateTrajectoryMetadataDigest: commonSource.privateTrajectoryMetadataDigest,
      browserTrajectoryMetadataDigest: commonSource.browserTrajectoryMetadataDigest,
      positionsF32TrajectoryDigest: commonSource.positionsF32TrajectoryDigest,
      orderedPositionFrameDigest: commonSource.orderedPositionFrameDigest,
      browserPacketDigest: commonSource.browserPacketDigest,
    });
    expect(result.evidence.claims).toMatchObject({
      protectedWorkflowExecutionReported: true,
      allThreeModesPassed: true,
      executionAuthenticated: false,
      reproduced: false,
      promotionEligible: false,
      publicDistributionEligible: false,
      cloudflareDistributionEligible: false,
    });
    const { evidenceDigest, ...preimage } = result.evidence;
    expect(evidenceDigest).toBe(sha256(canonicalJsonBytes(preimage)));
    expect(result.bytes).toEqual(canonicalJsonBytes(result.evidence));
    const serialized = canonicalJson(result.evidence);
    for (const forbidden of [
      'packetDigest', 'positionTrajectoryDigest', 'positionsNanometer', 'token',
      'url', 'privatePath', 'sessionDigest', 'sourcePositionsArtifactDigest',
    ]) expect(serialized).not.toContain(forbidden);
  });

  it.each([
    ['source', (receipt) => { receipt.source.trajectoryDigest = digest('other'); }],
    ['browser trajectory binding', (receipt) => {
      receipt.source.browserTrajectoryMetadataDigest = digest('other-browser-metadata');
    }],
    ['runtime', (receipt) => { receipt.browserRuntime.browserVersion = 'other'; }],
    ['client', (receipt) => { receipt.client.sha256 = digest('other-client'); }],
    ['control', (receipt) => { receipt.controlReceipt.receiptDigest = digest('other-control'); }],
  ])('rejects cross-mode or control drift: %s', (_label, change) => {
    const inputs = makeInputs();
    inputs.modeReceiptBytes['context-loss'] = mutate(
      inputs.modeReceiptBytes['context-loss'], change,
    );
    expect(() => buildProtectedBrowserEvidence(inputs)).toThrow(/control|source|runtime|client/);
  });

  it.each([
    ['mode order', (receipt) => { receipt.mode = 'context-loss'; }],
    ['failed cleanup', (receipt) => { receipt.observation.cleanupComplete = false; }],
    ['wrong interruption barrier', (receipt) => { receipt.observation.renderedFrameCount = 37; }],
    ['draw observation denial', (receipt) => { receipt.observation.browserDrawObserved = false; }],
    ['trajectory completion denial', (receipt) => {
      receipt.observation.trajectoryCompleted = false;
    }],
    ['PID promotion', (receipt) => { receipt.isolation.pidNamespaceKillBoundaryVerified = true; }],
    ['cgroup promotion', (receipt) => { receipt.isolation.cgroupDrainVerified = true; }],
    ['authentication', (receipt) => { receipt.claims.executionAuthenticated = true; }],
    ['license', (receipt) => {
      receipt.claims.sourceLicenseForPublicDistributionVerified = true;
    }],
    ['sensitive URL', (receipt) => { receipt.observation.url = 'http://127.0.0.1/private'; }],
    ['coordinates', (receipt) => { receipt.source.coordinates = [[0, 0, 0]]; }],
  ])('rejects invalid or sensitive private mode receipt: %s', (_label, change) => {
    const inputs = makeInputs();
    inputs.modeReceiptBytes['happy-path'] = mutate(
      inputs.modeReceiptBytes['happy-path'], change,
    );
    expect(() => buildProtectedBrowserEvidence(inputs)).toThrow();
  });

  it('rejects an interrupted mode that claims trajectory completion', () => {
    const inputs = makeInputs();
    inputs.modeReceiptBytes['context-loss'] = mutate(
      inputs.modeReceiptBytes['context-loss'],
      (receipt) => { receipt.observation.trajectoryCompleted = true; },
    );
    expect(() => buildProtectedBrowserEvidence(inputs)).toThrow(/context-loss observation/);
  });

  it('rejects noncanonical, duplicate-key, and stale self-digest receipts', () => {
    const noncanonical = makeInputs();
    const value = JSON.parse(noncanonical.modeReceiptBytes['happy-path']);
    noncanonical.modeReceiptBytes['happy-path'] = Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
    expect(() => buildProtectedBrowserEvidence(noncanonical)).toThrow(/canonical JSON/);

    const duplicate = makeInputs();
    duplicate.modeReceiptBytes['happy-path'] = Buffer.from('{"mode":"a","mode":"b"}\n');
    expect(() => buildProtectedBrowserEvidence(duplicate)).toThrow(/duplicate JSON key/);

    const stale = makeInputs();
    stale.modeReceiptBytes['happy-path'] = mutate(
      stale.modeReceiptBytes['happy-path'],
      (receipt) => { receipt.observation.observationDigest = digest('stale'); },
      null,
    );
    expect(() => buildProtectedBrowserEvidence(stale)).toThrow(/stale self digest/);
  });
});

const cliPath = fileURLToPath(new URL('./compose-protected-browser-evidence-v049.mjs', import.meta.url));

async function stageCli() {
  const root = await realpath(await mkdtemp(path.join(os.tmpdir(), 'tf-browser-compose-')));
  roots.push(root);
  const privateRoot = path.join(root, 'private');
  const publicRoot = path.join(root, 'public');
  await mkdir(privateRoot);
  await mkdir(publicRoot);
  const inputs = makeInputs();
  const paths = {
    controlReceipt: path.join(privateRoot, EXPECTED_INPUT_BASENAMES.controlReceipt),
    happyPathReceipt: path.join(privateRoot, EXPECTED_INPUT_BASENAMES.happyPathReceipt),
    midPlaybackDisposeReceipt:
      path.join(privateRoot, EXPECTED_INPUT_BASENAMES.midPlaybackDisposeReceipt),
    contextLossReceipt: path.join(privateRoot, EXPECTED_INPUT_BASENAMES.contextLossReceipt),
    output: path.join(publicRoot, 'openmm-tip3p-protected-browser-evidence.json'),
  };
  await writeFile(paths.controlReceipt, inputs.controlReceiptBytes);
  await Promise.all(MODE_ORDER.map((mode, index) => writeFile(
    paths[['happyPathReceipt', 'midPlaybackDisposeReceipt', 'contextLossReceipt'][index]],
    inputs.modeReceiptBytes[mode],
  )));
  return { root, ...paths };
}

function cliArgs(paths) {
  return [
    '--control-receipt', paths.controlReceipt,
    '--happy-path-receipt', paths.happyPathReceipt,
    '--mid-playback-dispose-receipt', paths.midPlaybackDisposeReceipt,
    '--context-loss-receipt', paths.contextLossReceipt,
    '--output', paths.output,
  ];
}

describe('protected browser evidence composer CLI', () => {
  it('writes one canonical 0444 output and refuses overwrite', async () => {
    const paths = await stageCli();
    const first = spawnSync(process.execPath, [cliPath, ...cliArgs(paths)], { encoding: 'utf8' });
    expect(first.status, first.stderr).toBe(0);
    const bytes = await readFile(paths.output);
    expect(bytes).toEqual(canonicalJsonBytes(JSON.parse(bytes)));
    expect(JSON.parse(first.stdout).fileDigest).toBe(sha256(bytes));
    expect(Number((await lstat(paths.output)).mode & 0o777)).toBe(0o444);
    const second = spawnSync(process.execPath, [cliPath, ...cliArgs(paths)], { encoding: 'utf8' });
    expect(second.status).not.toBe(0);
    expect(second.stderr).toMatch(/EEXIST|exist/);
    expect(await readFile(paths.output)).toEqual(bytes);
  });

  it('removes its temporary inode when the bounded write fails', async () => {
    const paths = await stageCli();
    const operations = {
      chmod,
      link,
      lstat,
      unlink,
      open: async (filename, ...args) => {
        const handle = await open(filename, ...args);
        if (!String(filename).endsWith('.tmp')) return handle;
        return {
          stat: handle.stat.bind(handle),
          writeFile: async (bytes) => {
            await handle.writeFile(bytes.subarray(0, 7));
            throw new Error('injected temporary write failure');
          },
          sync: handle.sync.bind(handle),
          close: handle.close.bind(handle),
        };
      },
    };
    await expect(writeNewAtomic(paths.output, Buffer.from('complete\n'), operations))
      .rejects.toThrow(/injected temporary write failure/);
    expect(await readdir(path.dirname(paths.output))).toEqual([]);
  });

  it('removes its linked output inode when post-link directory fsync fails', async () => {
    const paths = await stageCli();
    const outputParent = path.dirname(paths.output);
    const operations = {
      chmod,
      link,
      lstat,
      unlink,
      open: async (filename, ...args) => {
        const handle = await open(filename, ...args);
        if (filename !== outputParent) return handle;
        return {
          sync: async () => { throw new Error('injected directory fsync failure'); },
          close: handle.close.bind(handle),
        };
      },
    };
    await expect(writeNewAtomic(paths.output, Buffer.from('complete\n'), operations))
      .rejects.toThrow(/injected directory fsync failure/);
    expect(await readdir(outputParent)).toEqual([]);
  });

  it('does not unlink a post-link path whose inode no longer belongs to this call', async () => {
    const paths = await stageCli();
    let replaced = false;
    const operations = {
      chmod,
      link,
      unlink,
      open,
      lstat: async (filename, options) => {
        if (filename === paths.output && !replaced) {
          replaced = true;
          await unlink(filename);
          await writeFile(filename, 'foreign output\n');
        }
        return lstat(filename, options);
      },
    };
    await expect(writeNewAtomic(paths.output, Buffer.from('owned output\n'), operations))
      .rejects.toThrow(/does not retain the temporary inode/);
    expect(await readFile(paths.output, 'utf8')).toBe('foreign output\n');
    expect((await readdir(path.dirname(paths.output))).sort()).toEqual([
      'openmm-tip3p-protected-browser-evidence.json',
    ]);
  });

  it('rejects missing flags, wrong basenames, symlinks, and hardlinks', async () => {
    const missing = await stageCli();
    let result = spawnSync(process.execPath, [cliPath, ...cliArgs(missing).slice(0, -2)], {
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/every locked CLI option/);

    const wrongBasename = await stageCli();
    const renamedInput = path.join(path.dirname(wrongBasename.happyPathReceipt), 'happy.json');
    await writeFile(renamedInput, await readFile(wrongBasename.happyPathReceipt));
    wrongBasename.happyPathReceipt = renamedInput;
    result = spawnSync(process.execPath, [cliPath, ...cliArgs(wrongBasename)], {
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/basename changed/);

    const symbolic = await stageCli();
    const target = path.join(symbolic.root, 'target.json');
    await writeFile(target, await readFile(symbolic.happyPathReceipt));
    await unlink(symbolic.happyPathReceipt);
    await symlink(target, symbolic.happyPathReceipt);
    result = spawnSync(process.execPath, [cliPath, ...cliArgs(symbolic)], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/symlink|canonical/);

    const hard = await stageCli();
    const hardTarget = path.join(hard.root, 'hard.json');
    await writeFile(hardTarget, await readFile(hard.contextLossReceipt));
    await unlink(hard.contextLossReceipt);
    await link(hardTarget, hard.contextLossReceipt);
    result = spawnSync(process.execPath, [cliPath, ...cliArgs(hard)], { encoding: 'utf8' });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toMatch(/single-link/);
  });
});
