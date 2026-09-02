import { describe, expect, it } from 'vitest';
import { digestValue } from './digest.ts';
import {
  ATOMISTIC_F64_TRAJECTORY_BYTE_LENGTH_V045,
  ATOMISTIC_FORCE_SEMANTICS_V045,
  ATOMISTIC_PLAN_DIGEST_V045,
  ATOMISTIC_REFERENCE_BACKEND_MANIFEST_DIGEST_V045,
  ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045,
  ATOMISTIC_SYSTEM_DIGEST_V045,
  ATOMISTIC_VELOCITY_READBACK_SEMANTICS_V045,
  ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045,
  ATOMISTIC_WORLD_SOURCE_V045,
  createAtomisticTrajectoryChunkV045,
  createAtomisticVisualInterpolationV045,
  type AtomisticManifestArrayDescriptorV045,
  type AtomisticTrajectoryArtifactChannelV045,
  type AtomisticTrajectoryChunkInputV045,
  type AtomisticTrajectoryLineageV045,
} from './atomistic-trajectory-chunk.ts';
import {
  ATOMISTIC_EXPECTED_FINAL_STEP_V045,
  ATOMISTIC_EXPECTED_FRAME_COUNT_V045,
  ATOMISTIC_PRESENTATION_STATE_VERSION_V045,
  assertAtomisticPresentationStateV045,
  assertAtomisticWorldSessionV045,
  createAtomisticPresentationStateV045,
  createAtomisticWorldSessionV045,
  getAtomisticWorldSessionFrameV045,
  seekAtomisticPresentationV045,
  selectAtomisticPresentationAtomsV045,
  setAtomisticPresentationInterpolationV045,
  setAtomisticPresentationPlaybackV045,
  type AtomisticWorldSessionInputV045,
} from './atomistic-world-session.ts';

const CHANNELS = [
  'positionsNanometer',
  'velocitiesNanometerPerPicosecond',
  'potentialForcesKjMolNanometer',
] as const;

describe('v0.4.5 execution-unattested atomistic world session', () => {
  it('reports scientific verified-pass while explicitly denying authenticity and promotion', () => {
    const first = createAtomisticWorldSessionV045(sessionInput());
    const replay = createAtomisticWorldSessionV045(sessionInput());

    expect(first).toEqual(replay);
    expect(first).not.toBe(replay);
    expect(first).toMatchObject({
      status: 'scientific-self-consistency-verified-execution-unattested-session',
      verificationBoundary: 'independent-scientific-assessment-not-execution-attestation',
      source: ATOMISTIC_WORLD_SOURCE_V045,
      forceSemantics: ATOMISTIC_FORCE_SEMANTICS_V045,
      executionAuthenticityVerified: false,
      promotionEligible: false,
      immutableScientificEvidence: true,
      presentationControlsMutateScientificEvidence: false,
      verification: {
        schemaVersion: 'tf.openmm-tip3p-control-receipt/0.4.5',
        statusDomain: 'independent-scientific-assessment-not-release-provenance',
        status: 'verified-pass',
        systemDigest: ATOMISTIC_SYSTEM_DIGEST_V045,
        planDigest: ATOMISTIC_PLAN_DIGEST_V045,
        executionAuthenticityVerified: false,
        promotionEligible: false,
      },
      trajectory: {
        firstStep: 0,
        finalStep: ATOMISTIC_EXPECTED_FINAL_STEP_V045,
        fixedTimeStepPicoseconds: 0.001,
        sampleStrideSteps: 10,
        frameCount: ATOMISTIC_EXPECTED_FRAME_COUNT_V045,
        integratedSteps: 1000,
        monolithicF64ArtifactByteLength: ATOMISTIC_F64_TRAJECTORY_BYTE_LENGTH_V045,
        velocityTemporalAlignment: ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045,
        velocityReadbackSemantics: ATOMISTIC_VELOCITY_READBACK_SEMANTICS_V045,
        stateEnergyTemporalAlignment: ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045,
      },
    });
    expect(first.trajectory.chunks).toHaveLength(1);
    expect(first.trajectory.chunkDigests).toEqual([first.trajectory.chunks[0].chunkDigest]);
    expect(first.trajectory.orderedFrameDigest).toBe(digestValue({
      schemaVersion: 'tf.atomistic-ordered-frame-set/0.4.5',
      source: ATOMISTIC_WORLD_SOURCE_V045,
      trajectoryDigest: first.trajectory.trajectoryDigest,
      frameDigests: first.trajectory.chunks[0].frames.map((frame) => frame.frameDigest),
    }));
    expect(first.trajectory.chunks[0].lineage).toMatchObject({
      planDigest: first.verification.planDigest,
      sourceRevision: first.verification.sourceRevision,
      producerOutcomeDigest: first.verification.producerOutcomeDigest,
      artifactManifestDigest: first.verification.artifactManifestDigest,
      prepareReceiptDigest: first.preparation.prepareReceiptDigest,
      prepareReceiptArtifactDigest: first.preparation.prepareReceiptArtifactDigest,
      referenceARunReceiptDigest: first.trajectory.referenceARunReceiptDigest,
      referenceARunArtifactDigest: first.trajectory.referenceARunArtifactDigest,
      integratedSteps: 1000,
      executionAuthenticityVerified: false,
      promotionEligible: false,
    });
    expect(getAtomisticWorldSessionFrameV045(first, 100)).toMatchObject({
      frameOrdinal: 100,
      step: 1000,
      timePicoseconds: 1.0000000000000007,
      source: ATOMISTIC_WORLD_SOURCE_V045,
      executionAuthenticityVerified: false,
      promotionEligible: false,
    });
    expect(JSON.stringify(first)).not.toMatch(/authenticated|reproduced/i);
    expectSelfDigest(first, 'sessionDigest');
    expectRecursivelyFrozen(first);
    expect(() => assertAtomisticWorldSessionV045(first)).not.toThrow();
  });

  it('rejects legacy 51/50 chunking and true authenticity or promotion claims', () => {
    const legacy = sessionInput() as DeepMutable<AtomisticWorldSessionInputV045>;
    const monolith = legacy.trajectory.chunks[0];
    const first51 = structuredClone(monolith);
    const final50 = structuredClone(monolith);
    first51.frames = first51.frames.slice(0, 51);
    final50.frames = final50.frames.slice(51);
    legacy.trajectory.chunks = [first51, final50];
    expect(() => createAtomisticWorldSessionV045(legacy))
      .toThrow(/one 101-frame monolithic trajectory chunk/i);

    const forgedAuthenticity = sessionInput() as DeepMutable<AtomisticWorldSessionInputV045>;
    forgedAuthenticity.verification.executionAuthenticityVerified = true as false;
    expect(() => createAtomisticWorldSessionV045(forgedAuthenticity))
      .toThrow(/execution and promotion disabled/i);

    const promoted = sessionInput() as DeepMutable<AtomisticWorldSessionInputV045>;
    promoted.verification.promotionEligible = true as false;
    expect(() => createAtomisticWorldSessionV045(promoted))
      .toThrow(/execution and promotion disabled/i);

    const valid = createAtomisticWorldSessionV045(sessionInput());
    const forgedOutput = structuredClone(valid) as unknown as DeepMutable<typeof valid>;
    forgedOutput.promotionEligible = true as false;
    rehashSession(forgedOutput);
    expect(() => assertAtomisticWorldSessionV045(forgedOutput))
      .toThrow(/execution-unattested boundary/i);
  });

  it('rejects receipt/manifest swaps, malformed cells, and stale ordered-frame identity', () => {
    const crossRun = sessionInput() as DeepMutable<AtomisticWorldSessionInputV045>;
    crossRun.trajectory.referenceARunReceiptDigest = digest('cross-run-receipt');
    expect(() => createAtomisticWorldSessionV045(crossRun)).toThrow(/lineage/i);

    const crossManifest = sessionInput() as DeepMutable<AtomisticWorldSessionInputV045>;
    crossManifest.verification.artifactManifestDigest = digest('cross-manifest');
    expect(() => createAtomisticWorldSessionV045(crossManifest)).toThrow(/lineage/i);

    const wrongCell = sessionInput() as DeepMutable<AtomisticWorldSessionInputV045>;
    wrongCell.cell.vectorsNanometer[2].z = 2;
    expect(() => createAtomisticWorldSessionV045(wrongCell)).toThrow(/cell vectors/i);

    const stale = structuredClone(
      createAtomisticWorldSessionV045(sessionInput()),
    ) as unknown as DeepMutable<ReturnType<typeof createAtomisticWorldSessionV045>>;
    stale.trajectory.orderedFrameDigest = digest('invented-order');
    rehashSession(stale);
    expect(() => assertAtomisticWorldSessionV045(stale)).toThrow(/ordered frame digest/i);
  });
});

describe('v0.4.5 world presentation controls', () => {
  it('keeps playback, seek, selection, and interpolation outside scientific evidence', () => {
    const session = createAtomisticWorldSessionV045(sessionInput());
    const sessionSnapshot = structuredClone(session);
    const initial = createAtomisticPresentationStateV045(session);
    const playing = setAtomisticPresentationPlaybackV045(session, initial, 'playing', 2);
    const sought = seekAtomisticPresentationV045(session, playing, 73);
    const selected = selectAtomisticPresentationAtomsV045(session, sought, [0, 17, 2684]);
    const frameA = getAtomisticWorldSessionFrameV045(session, 20);
    const frameB = getAtomisticWorldSessionFrameV045(session, 21);
    const interpolation = createAtomisticVisualInterpolationV045(frameA, frameB, 0.4);
    const interpolated = setAtomisticPresentationInterpolationV045(
      session,
      selected,
      interpolation,
    );

    expect(initial).toMatchObject({
      schemaVersion: ATOMISTIC_PRESENTATION_STATE_VERSION_V045,
      role: 'presentation-only-no-physical-world-state',
      playback: { mode: 'paused', playbackRate: 1, affectsSolverClock: false },
      physicalWorldState: false,
      presentationOnly: true,
    });
    expect(interpolated).toMatchObject({
      revision: 4,
      seek: { frameOrdinal: 20, frameDigest: frameA.frameDigest, changesPhysicalState: false },
      interpolation: {
        status: 'presentation-only-between-scientific-evidence-frames',
        forceDisplay: 'disabled-between-scientific-evidence-frames',
        physicalWorldState: false,
        presentationOnly: true,
      },
    });
    expect(session).toEqual(sessionSnapshot);
    expect(() => assertAtomisticPresentationStateV045(interpolated, session)).not.toThrow();
    expect(() => assertAtomisticWorldSessionV045(interpolated)).toThrow();
  });
});

function sessionInput(): AtomisticWorldSessionInputV045 {
  const frameLineage = lineage();
  return {
    sessionId: 'reference-a-session',
    system: {
      schemaVersion: 'tf.aqueous-system-spec/0.4.4',
      systemId: 'openmm-8.6-tip3p-895-water-pme-control',
      systemDigest: ATOMISTIC_SYSTEM_DIGEST_V045,
    },
    backend: {
      engine: 'OpenMM',
      engineVersion: '8.6.0',
      platform: 'Reference',
      lane: 'reference-a',
      backendManifestDigest: ATOMISTIC_REFERENCE_BACKEND_MANIFEST_DIGEST_V045,
    },
    preparation: {
      prepareReceiptDigest: frameLineage.prepareReceiptDigest,
      prepareReceiptArtifactDigest: frameLineage.prepareReceiptArtifactDigest,
      serializedSystemDigest: frameLineage.serializedSystemDigest,
      portableProductionStartStateDigest: digest('portable-start-state'),
    },
    verification: {
      schemaVersion: 'tf.openmm-tip3p-control-receipt/0.4.5',
      statusDomain: 'independent-scientific-assessment-not-release-provenance',
      status: 'verified-pass',
      systemDigest: ATOMISTIC_SYSTEM_DIGEST_V045,
      planDigest: ATOMISTIC_PLAN_DIGEST_V045,
      sourceRevision: frameLineage.sourceRevision,
      producerOutcomeDigest: frameLineage.producerOutcomeDigest,
      artifactManifestDigest: frameLineage.artifactManifestDigest,
      controlReceiptDigest: frameLineage.controlReceiptDigest,
      verifierDigest: frameLineage.verifierDigest,
      payloadBundleRoot: frameLineage.payloadBundleRoot,
      executionAuthenticityVerified: false,
      promotionEligible: false,
    },
    atomOrder: {
      authority: 'pdb-record-order',
      atomOrderDigest: frameLineage.atomOrderDigest,
      particleCount: 2685,
      indexing: 'zero-based-render-index-maps-one-to-one-to-authoritative-order',
    },
    cell: {
      kind: 'orthorhombic-periodic-cell',
      vectorsNanometer: [
        { x: 3, y: 0, z: 0 },
        { x: 0, y: 3, z: 0 },
        { x: 0, y: 0, z: 3 },
      ],
      periodicAxes: [true, true, true],
      volumeNanometer3: 27,
      cellDigest: frameLineage.cellDigest,
    },
    topology: {
      topologyDigest: frameLineage.topologyDigest,
      particleCount: 2685,
      topologyBondCount: 1790,
      rigidDistanceConstraintCount: 2685,
      topologyRole: 'identity-and-adjacency-not-dynamic-bond-order',
    },
    trajectory: {
      referenceARunReceiptDigest: frameLineage.referenceARunReceiptDigest,
      referenceARunArtifactDigest: frameLineage.referenceARunArtifactDigest,
      trajectoryDigest: frameLineage.trajectoryDigest,
      chunks: [createAtomisticTrajectoryChunkV045(chunkInput(frameLineage))],
    },
  };
}

function lineage(): AtomisticTrajectoryLineageV045 {
  return {
    systemDigest: ATOMISTIC_SYSTEM_DIGEST_V045,
    planDigest: ATOMISTIC_PLAN_DIGEST_V045,
    sourceRevision: '1234567890abcdef1234567890abcdef12345678',
    backendManifestDigest: ATOMISTIC_REFERENCE_BACKEND_MANIFEST_DIGEST_V045,
    serializedSystemDigest: digest('serialized-system'),
    prepareReceiptDigest: digest('prepare-receipt'),
    prepareReceiptArtifactDigest: digest('prepare-receipt-artifact'),
    referenceARunReceiptDigest: digest('reference-a-run-receipt'),
    referenceARunArtifactDigest: digest('reference-a-run-artifact'),
    producerOutcomeDigest: digest('producer-outcome'),
    artifactManifestDigest: digest('artifact-manifest'),
    controlReceiptDigest: digest('control-receipt'),
    verifierDigest: digest('independent-verifier'),
    payloadBundleRoot: digest('payload-bundle-root'),
    trajectoryDigest: digest('trajectory'),
    atomOrderDigest: digest('atom-order'),
    cellDigest: digest('cell'),
    topologyDigest: digest('topology'),
    integratedSteps: 1000,
    velocityTemporalAlignment: ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045,
    stateEnergyTemporalAlignment: ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045,
    executionAuthenticityVerified: false,
    promotionEligible: false,
  };
}

function chunkInput(frameLineage: AtomisticTrajectoryLineageV045): AtomisticTrajectoryChunkInputV045 {
  return {
    chunkId: 'reference-a-monolithic-trajectory',
    lineage: { ...frameLineage },
    firstFrameOrdinal: 0,
    sampleStrideSteps: 10,
    fixedTimeStepPicoseconds: 0.001,
    artifactManifestDescriptors: artifactManifestDescriptors(),
    frames: Array.from({ length: 101 }, (_, ordinal) => {
      const step = ordinal * 10;
      const potentialKjMol = -100 + ordinal / 10;
      const kineticKjMol = 50 + ordinal / 20;
      return {
        step,
        timePicoseconds: step === 1000 ? 1.0000000000000007 : step * 0.001,
        frameByteDigests: channelDigests(`frame-${ordinal}`),
        energy: {
          potentialKjMol,
          kineticKjMol,
          totalKjMol: potentialKjMol + kineticKjMol,
        },
      };
    }),
  };
}

function artifactManifestDescriptors(): Record<
  AtomisticTrajectoryArtifactChannelV045,
  AtomisticManifestArrayDescriptorV045
> {
  return {
    positionsNanometer: descriptor('reference-a-positions', 'arrays/reference-a-positions.f64le',
      'float64-le', [101, 2685, 3], 'nanometer', 6_508_440),
    velocitiesNanometerPerPicosecond: descriptor(
      'reference-a-velocities', 'arrays/reference-a-velocities.f64le',
      'float64-le', [101, 2685, 3], 'nanometer-per-picosecond', 6_508_440,
    ),
    potentialForcesKjMolNanometer: descriptor(
      'reference-a-potential-forces', 'arrays/reference-a-potential-forces.f64le',
      'float64-le', [101, 2685, 3], 'kilojoule-per-mole-per-nanometer', 6_508_440,
    ),
    sampleSteps: descriptor('reference-a-sample-steps', 'arrays/reference-a-sample-steps.u32le',
      'uint32-le', [101], 'step', 404),
    sampleTimes: descriptor('reference-a-sample-times', 'arrays/reference-a-sample-times.f64le',
      'float64-le', [101], 'picosecond', 808),
    energies: descriptor('reference-a-energies', 'arrays/reference-a-energies.f64le',
      'float64-le', [101, 3], 'kilojoule-per-mole', 2424),
  };
}

function descriptor(
  id: string,
  path: string,
  dtype: 'float64-le' | 'uint32-le',
  shape: number[],
  unit: AtomisticManifestArrayDescriptorV045['unit'],
  sizeBytes: number,
): AtomisticManifestArrayDescriptorV045 {
  return { id, path, kind: 'array', dtype, shape, unit, sizeBytes, sha256: digest(`artifact-${id}`) };
}

function channelDigests(prefix: string) {
  return Object.fromEntries(CHANNELS.map((channel) => [
    channel,
    digest(`${prefix}-${channel}`),
  ])) as Record<(typeof CHANNELS)[number], string>;
}

function digest(label: string) {
  return digestValue({ fixture: label });
}

function rehashSession(session: Record<string, unknown>) {
  const payload = { ...session };
  Reflect.deleteProperty(payload, 'sessionDigest');
  session.sessionDigest = digestValue(payload);
}

function expectSelfDigest(value: object, digestKey: string) {
  const clone = structuredClone(value) as Record<string, unknown>;
  const digestValueFromObject = clone[digestKey];
  Reflect.deleteProperty(clone, digestKey);
  expect(digestValueFromObject).toBe(digestValue(clone));
}

function expectRecursivelyFrozen(value: unknown) {
  if (!value || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectRecursivelyFrozen(child);
}

type DeepMutable<T> = T extends object
  ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
  : T;
