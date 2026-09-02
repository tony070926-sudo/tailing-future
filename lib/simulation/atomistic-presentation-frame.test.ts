import { beforeAll, describe, expect, it } from 'vitest';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';
import { digestValue } from './digest.ts';
import {
  ATOMISTIC_COMPONENT_COUNT_V045,
  ATOMISTIC_F32_FRAME_BYTE_LENGTH_V045,
  ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045,
  ATOMISTIC_PLAN_DIGEST_V045,
  ATOMISTIC_REFERENCE_BACKEND_MANIFEST_DIGEST_V045,
  ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045,
  ATOMISTIC_SYSTEM_DIGEST_V045,
  ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045,
  createAtomisticTrajectoryChunkV045,
  type AtomisticBinaryChannelV045,
  type AtomisticManifestArrayDescriptorV045,
  type AtomisticTrajectoryArtifactChannelV045,
  type AtomisticTrajectoryChunkInputV045,
  type AtomisticTrajectoryLineageV045,
} from './atomistic-trajectory-chunk.ts';
import {
  ATOMISTIC_PRESENTATION_CHANNELS_V046,
  ATOMISTIC_PRESENTATION_FRAME_VERSION_V046,
  ATOMISTIC_PRESENTATION_REVOCATION_RECEIPT_VERSION_V046,
  assertAtomisticPresentationFrameMetadataV046,
  createAtomisticPresentationFrameControllerV046,
  createAtomisticPresentationFrameV046,
  type AtomisticPresentationFrameInputV046,
} from './atomistic-presentation-frame.ts';
import {
  createAtomisticWorldSessionV045,
  getAtomisticWorldSessionFrameV045,
  type AtomisticWorldSessionInputV045,
  type AtomisticWorldSessionV045,
} from './atomistic-world-session.ts';

const CHANNELS = ATOMISTIC_PRESENTATION_CHANNELS_V046;
const UNITS = {
  positionsNanometer: 'nanometer',
  velocitiesNanometerPerPicosecond: 'nanometer-per-picosecond',
  potentialForcesKjMolNanometer: 'kilojoule-per-mole-per-nanometer',
} as const;

type RawChannels = Record<AtomisticBinaryChannelV045, Uint8Array>;

let baselineRaw: RawChannels;
let baselineSession: AtomisticWorldSessionV045;

beforeAll(() => {
  baselineRaw = rawChannels();
  baselineSession = worldSession('reference-a-session', baselineRaw);
});

describe('v0.4.6 digest-bound atomistic presentation frame', () => {
  it('performs deterministic F64LE to F32LE conversion and reuses the V045 receipt', () => {
    const firstInput = presentationInput(baselineSession, baselineRaw);
    const first = createAtomisticPresentationFrameV046(baselineSession, firstInput);
    const replay = createAtomisticPresentationFrameV046(
      baselineSession,
      presentationInput(baselineSession, baselineRaw),
    );

    expect(first.metadata).toEqual(replay.metadata);
    expect(first.metadata).toMatchObject({
      schemaVersion: ATOMISTIC_PRESENTATION_FRAME_VERSION_V046,
      status: 'local-f32-presentation-derivative-from-v045-execution-unattested-frame',
      sourceWorldSessionSchemaVersion: 'tf.atomistic-world-session/0.4.5',
      binding: {
        sessionId: baselineSession.sessionId,
        sessionDigest: baselineSession.sessionDigest,
        frameOrdinal: 0,
        frameDigest: getAtomisticWorldSessionFrameV045(baselineSession, 0).frameDigest,
        atomOrderDigest: baselineSession.atomOrder.atomOrderDigest,
        cellDigest: baselineSession.cell.cellDigest,
        atomCount: 2685,
        componentCountPerChannel: ATOMISTIC_COMPONENT_COUNT_V045,
      },
      conversion: {
        operation: 'per-component-f64le-to-f32le',
        sourceFiniteRequired: true,
        sourceNegativeZeroRejected: true,
        derivedNonfiniteRejected: true,
        derivedNegativeZeroRejected: true,
        interpolationApplied: false,
      },
      physicalWorldState: false,
      presentationOnly: true,
      renderFrameOnly: true,
      affectsSolverClock: false,
      sourceF64BytesRetained: false,
      scientificPrecisionImproved: false,
      executionAuthenticityVerified: false,
      promotionEligible: false,
      sourceLicenseForPublicDistributionVerified: false,
      publicDistributionEligible: false,
      conversionReceipt: {
        schemaVersion: 'tf.atomistic-gpu-f32-visual-frame/0.4.5',
        status: 'visual-derived-gpu-decode-receipt',
        physicalWorldState: false,
        presentationOnly: true,
      },
    });
    for (const channel of CHANNELS) {
      const expectedBytes = expectedF32Le(baselineRaw[channel]);
      expect(first.metadata.channels[channel]).toEqual({
        channel,
        unit: UNITS[channel],
        componentCount: ATOMISTIC_COMPONENT_COUNT_V045,
        source: {
          dtype: 'float64-le',
          shape: [2685, 3],
          byteLength: ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045,
          sha256: digestBytes(baselineRaw[channel]),
        },
        derived: {
          dtype: 'float32-le',
          shape: [2685, 3],
          byteLength: ATOMISTIC_F32_FRAME_BYTE_LENGTH_V045,
          sha256: digestBytes(expectedBytes),
        },
      });
      expect(first.copyChannelBytes(channel)).toEqual(expectedBytes);
      expect(first.metadata.conversionReceipt.channels[channel]).toMatchObject({
        sourceByteDigest: digestBytes(baselineRaw[channel]),
        derivedByteDigest: digestBytes(expectedBytes),
        sourceShape: [2685, 3],
        derivedShape: [2685, 3],
      });
    }
    const values = first.copyChannelFloat32('positionsNanometer');
    expect(values).toHaveLength(ATOMISTIC_COMPONENT_COUNT_V045);
    expect(values[0]).toBe(Math.fround(sourceValue(baselineRaw.positionsNanometer, 0)));
    expect(values[127]).toBe(Math.fround(sourceValue(baselineRaw.positionsNanometer, 127)));
    expect(() => assertAtomisticPresentationFrameMetadataV046(
      first.metadata,
      baselineSession,
    )).not.toThrow();
    expectSelfDigest(first.metadata, 'presentationFrameDigest');
    expectRecursivelyFrozen(first.metadata);
    expect(Object.isFrozen(first)).toBe(true);
    expectContainsNoArrayBufferView(first.metadata);
    const serializedHandle = JSON.stringify(first);
    expect(serializedHandle).not.toContain('publicPayload');
    expect(serializedHandle).not.toContain('f64LeBytes');
    expect(serializedHandle).not.toContain('copyChannelBytes');
    expect(serializedHandle).not.toContain('copyChannelFloat32');
  });

  it('defensively owns source bytes and returns independent F32 copies', () => {
    const callerInput = presentationInput(baselineSession, baselineRaw);
    const handle = createAtomisticPresentationFrameV046(baselineSession, callerInput);
    const expectedDigest = handle.metadata.channels.positionsNanometer.derived.sha256;
    const expectedFirst = handle.copyChannelFloat32('positionsNanometer')[0];

    callerInput.channels[0].f64LeBytes.fill(0xff);
    const byteCopy = handle.copyChannelBytes('positionsNanometer');
    byteCopy.fill(0);
    const floatCopy = handle.copyChannelFloat32('positionsNanometer');
    floatCopy.fill(999);

    const freshBytes = handle.copyChannelBytes('positionsNanometer');
    const freshFloat = handle.copyChannelFloat32('positionsNanometer');
    expect(digestBytes(freshBytes)).toBe(expectedDigest);
    expect(freshFloat[0]).toBe(expectedFirst);
    expect(freshBytes).not.toBe(byteCopy);
    expect(freshFloat).not.toBe(floatCopy);
  });

  it('lets only the owner idempotently revoke private F32 bytes while retaining metadata', () => {
    const controller = createAtomisticPresentationFrameControllerV046(
      baselineSession,
      presentationInput(baselineSession, baselineRaw),
    );
    const handle = controller.handle;
    const siblingHandle = createAtomisticPresentationFrameV046(
      baselineSession,
      presentationInput(baselineSession, baselineRaw),
    );
    const metadata = handle.metadata;
    const externalCopy = handle.copyChannelBytes('positionsNanometer');
    const externalDigest = digestBytes(externalCopy);
    expect(handle.lifecycle).toEqual({
      privateDerivedByteRetention: 'until-owner-revocation-or-handle-garbage-collection',
      ownerRevocationSemantics: 'idempotent-zero-fill-and-reference-clear',
      ownerRevocationAuthorityExposedOnReadHandle: false,
      externalCopiesRevokedOnOwnerRevocation: false,
    });
    expect(handle.isRevoked()).toBe(false);
    expect(Reflect.ownKeys(handle)).not.toContain('revoke');
    expect(Reflect.ownKeys(handle)).not.toContain('dispose');
    expect(Object.isFrozen(controller)).toBe(true);

    const receipt = controller.revoke();
    expect(receipt).toEqual({
      schemaVersion: ATOMISTIC_PRESENTATION_REVOCATION_RECEIPT_VERSION_V046,
      status: 'revoked',
      presentationFrameDigest: metadata.presentationFrameDigest,
      scope: 'handle-owned-derived-channel-buffers-only',
      idempotent: true,
      internalDerivedChannelCountZeroFilled: 3,
      internalDerivedByteLengthZeroFilled: 96_660,
      internalDerivedReferencesCleared: true,
      previouslyIssuedCopiesRevoked: false,
      rendererOrRuntimeCopiesRevoked: false,
      metadataRetainedForAudit: true,
      scientificEvidenceChanged: false,
      securePhysicalErasureVerified: false,
    });
    expect(Object.isFrozen(receipt)).toBe(true);
    expect(handle.isRevoked()).toBe(true);
    expect(handle.metadata).toBe(metadata);
    expect(() => assertAtomisticPresentationFrameMetadataV046(
      handle.metadata,
      baselineSession,
    )).not.toThrow();
    expect(digestBytes(externalCopy)).toBe(externalDigest);
    expect(() => handle.copyChannelBytes('positionsNanometer')).toThrow(/revoked/);
    expect(() => handle.copyChannelFloat32('positionsNanometer')).toThrow(/revoked/);
    expect(controller.revoke()).toBe(receipt);
    expect(siblingHandle.isRevoked()).toBe(false);
    expect(digestBytes(siblingHandle.copyChannelBytes('positionsNanometer'))).toBe(externalDigest);
  });

  it('rejects tampering, wrong digest or shape, missing channels, and channel reordering', () => {
    const tampered = presentationInput(baselineSession, baselineRaw);
    tampered.channels[0].f64LeBytes[0] ^= 1;
    expect(() => createAtomisticPresentationFrameV046(baselineSession, tampered))
      .toThrow(/source digest does not match frame/i);

    const wrongDigest = presentationInput(baselineSession, baselineRaw) as MutableInput;
    wrongDigest.channels[1].sourceByteDigest = digest('wrong-source');
    expect(() => createAtomisticPresentationFrameV046(
      baselineSession,
      wrongDigest as unknown as AtomisticPresentationFrameInputV046,
    )).toThrow(/source digest does not match frame/i);

    const wrongShape = presentationInput(baselineSession, baselineRaw) as MutableInput;
    wrongShape.channels[2].shape = [ATOMISTIC_COMPONENT_COUNT_V045, 1];
    expect(() => createAtomisticPresentationFrameV046(
      baselineSession,
      wrongShape as unknown as AtomisticPresentationFrameInputV046,
    )).toThrow(/dtype, shape, or unit changed/i);

    const missing = presentationInput(baselineSession, baselineRaw) as MutableInput;
    missing.channels.pop();
    expect(() => createAtomisticPresentationFrameV046(
      baselineSession,
      missing as unknown as AtomisticPresentationFrameInputV046,
    )).toThrow(/dense intrinsic array of length 3/i);

    const reordered = presentationInput(baselineSession, baselineRaw) as MutableInput;
    [reordered.channels[0], reordered.channels[1]] = [
      reordered.channels[1], reordered.channels[0],
    ];
    expect(() => createAtomisticPresentationFrameV046(
      baselineSession,
      reordered as unknown as AtomisticPresentationFrameInputV046,
    )).toThrow(/canonical order/i);
  });

  it('rejects a missing or out-of-order frame, wrong atom order or cell, and cross-session use', () => {
    const missingFrame = presentationInput(baselineSession, baselineRaw) as MutableInput;
    missingFrame.binding.frameOrdinal = 101;
    expect(() => createAtomisticPresentationFrameV046(
      baselineSession,
      missingFrame as unknown as AtomisticPresentationFrameInputV046,
    )).toThrow(/frame ordinal.*bounded/i);

    const outOfOrder = presentationInput(baselineSession, baselineRaw) as MutableInput;
    outOfOrder.binding.frameOrdinal = 1;
    expect(() => createAtomisticPresentationFrameV046(
      baselineSession,
      outOfOrder as unknown as AtomisticPresentationFrameInputV046,
    )).toThrow(/does not match the source session and frame/i);

    const wrongOrder = presentationInput(baselineSession, baselineRaw) as MutableInput;
    wrongOrder.binding.atomOrderDigest = digest('different-atom-order');
    expect(() => createAtomisticPresentationFrameV046(
      baselineSession,
      wrongOrder as unknown as AtomisticPresentationFrameInputV046,
    )).toThrow(/does not match the source session and frame/i);

    const wrongCell = presentationInput(baselineSession, baselineRaw) as MutableInput;
    wrongCell.binding.cellDigest = digest('different-cell');
    expect(() => createAtomisticPresentationFrameV046(
      baselineSession,
      wrongCell as unknown as AtomisticPresentationFrameInputV046,
    )).toThrow(/does not match the source session and frame/i);

    const otherSession = worldSession('cross-session', baselineRaw);
    expect(() => createAtomisticPresentationFrameV046(
      otherSession,
      presentationInput(baselineSession, baselineRaw),
    )).toThrow(/does not match the source session and frame/i);
  });

  it.each([
    ['NaN', Number.NaN, /must be finite/i],
    ['positive infinity', Number.POSITIVE_INFINITY, /must be finite/i],
    ['negative zero', -0, /not -0/i],
    ['F32 overflow', Number.MAX_VALUE, /overflowed/i],
    ['F32 negative-zero underflow', -Number.MIN_VALUE, /became negative zero/i],
  ] as const)('rejects %s in actual F64 source bytes', (_label, value, error) => {
    const raw = rawChannels();
    setSourceValue(raw.positionsNanometer, 91, value);
    const session = worldSession(`invalid-${String(_label).replaceAll(' ', '-')}`, raw);
    expect(() => createAtomisticPresentationFrameV046(
      session,
      presentationInput(session, raw),
    )).toThrow(error);
  });

  it('rejects metadata digest swaps, claim escalation, and validation against another session', () => {
    const metadata = structuredClone(
      createAtomisticPresentationFrameV046(
        baselineSession,
        presentationInput(baselineSession, baselineRaw),
      ).metadata,
    ) as unknown as DeepMutable<ReturnType<
      typeof createAtomisticPresentationFrameV046
    >['metadata']>;
    metadata.channels.positionsNanometer.derived.sha256 = digest('swapped-derived-payload');
    rehashMetadata(metadata);
    expect(() => assertAtomisticPresentationFrameMetadataV046(metadata, baselineSession))
      .toThrow(/receipt lineage changed/i);

    const promoted = structuredClone(metadata);
    promoted.channels.positionsNanometer.derived.sha256 =
      promoted.conversionReceipt.channels.positionsNanometer.derivedByteDigest;
    promoted.promotionEligible = true as false;
    rehashMetadata(promoted);
    expect(() => assertAtomisticPresentationFrameMetadataV046(promoted, baselineSession))
      .toThrow(/safety boundary changed/i);

    const validMetadata = createAtomisticPresentationFrameV046(
      baselineSession,
      presentationInput(baselineSession, baselineRaw),
    ).metadata;
    const otherSession = worldSession('metadata-cross-session', baselineRaw);
    expect(() => assertAtomisticPresentationFrameMetadataV046(validMetadata, otherSession))
      .toThrow(/does not match the source session and frame/i);
  });
});

function presentationInput(
  session: AtomisticWorldSessionV045,
  raw: RawChannels,
): MutableInput & AtomisticPresentationFrameInputV046 {
  const frame = getAtomisticWorldSessionFrameV045(session, 0);
  return {
    binding: {
      sessionId: session.sessionId,
      sessionDigest: session.sessionDigest,
      frameOrdinal: frame.frameOrdinal,
      frameDigest: frame.frameDigest,
      atomOrderDigest: session.atomOrder.atomOrderDigest,
      cellDigest: session.cell.cellDigest,
    },
    channels: CHANNELS.map((channel) => ({
      channel,
      dtype: 'float64-le' as const,
      shape: [2685, 3],
      unit: UNITS[channel],
      sourceByteDigest: digestBytes(raw[channel]),
      f64LeBytes: raw[channel].slice(),
    })) as MutableInput['channels'] & AtomisticPresentationFrameInputV046['channels'],
  };
}

function rawChannels(): RawChannels {
  return {
    positionsNanometer: f64LeBytes(0.125),
    velocitiesNanometerPerPicosecond: f64LeBytes(-0.375),
    potentialForcesKjMolNanometer: f64LeBytes(2.5),
  };
}

function f64LeBytes(seed: number) {
  const bytes = new Uint8Array(ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < ATOMISTIC_COMPONENT_COUNT_V045; index += 1) {
    const value = seed + ((index % 251) - 125) / 32;
    view.setFloat64(index * Float64Array.BYTES_PER_ELEMENT, value === 0 ? 0.25 : value, true);
  }
  return bytes;
}

function expectedF32Le(source: Uint8Array) {
  const sourceView = new DataView(source.buffer, source.byteOffset, source.byteLength);
  const output = new Uint8Array(ATOMISTIC_F32_FRAME_BYTE_LENGTH_V045);
  const outputView = new DataView(output.buffer);
  for (let index = 0; index < ATOMISTIC_COMPONENT_COUNT_V045; index += 1) {
    outputView.setFloat32(
      index * Float32Array.BYTES_PER_ELEMENT,
      sourceView.getFloat64(index * Float64Array.BYTES_PER_ELEMENT, true),
      true,
    );
  }
  return output;
}

function sourceValue(source: Uint8Array, index: number) {
  return new DataView(source.buffer, source.byteOffset, source.byteLength)
    .getFloat64(index * Float64Array.BYTES_PER_ELEMENT, true);
}

function setSourceValue(source: Uint8Array, index: number, value: number) {
  new DataView(source.buffer, source.byteOffset, source.byteLength)
    .setFloat64(index * Float64Array.BYTES_PER_ELEMENT, value, true);
}

function worldSession(sessionId: string, raw: RawChannels): AtomisticWorldSessionV045 {
  const frameLineage = lineage(sessionId);
  const input: AtomisticWorldSessionInputV045 = {
    sessionId,
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
      portableProductionStartStateDigest: digest(`${sessionId}-portable-start-state`),
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
      chunks: [createAtomisticTrajectoryChunkV045(chunkInput(frameLineage, raw))],
    },
  };
  return createAtomisticWorldSessionV045(input);
}

function lineage(prefix: string): AtomisticTrajectoryLineageV045 {
  return {
    systemDigest: ATOMISTIC_SYSTEM_DIGEST_V045,
    planDigest: ATOMISTIC_PLAN_DIGEST_V045,
    sourceRevision: '1234567890abcdef1234567890abcdef12345678',
    backendManifestDigest: ATOMISTIC_REFERENCE_BACKEND_MANIFEST_DIGEST_V045,
    serializedSystemDigest: digest(`${prefix}-serialized-system`),
    prepareReceiptDigest: digest(`${prefix}-prepare-receipt`),
    prepareReceiptArtifactDigest: digest(`${prefix}-prepare-receipt-artifact`),
    referenceARunReceiptDigest: digest(`${prefix}-reference-a-run-receipt`),
    referenceARunArtifactDigest: digest(`${prefix}-reference-a-run-artifact`),
    producerOutcomeDigest: digest(`${prefix}-producer-outcome`),
    artifactManifestDigest: digest(`${prefix}-artifact-manifest`),
    controlReceiptDigest: digest(`${prefix}-control-receipt`),
    verifierDigest: digest(`${prefix}-independent-verifier`),
    payloadBundleRoot: digest(`${prefix}-payload-bundle-root`),
    trajectoryDigest: digest(`${prefix}-trajectory`),
    atomOrderDigest: digest(`${prefix}-atom-order`),
    cellDigest: digest(`${prefix}-cell`),
    topologyDigest: digest(`${prefix}-topology`),
    integratedSteps: 1000,
    velocityTemporalAlignment: ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045,
    stateEnergyTemporalAlignment: ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045,
    executionAuthenticityVerified: false,
    promotionEligible: false,
  };
}

function chunkInput(
  frameLineage: AtomisticTrajectoryLineageV045,
  raw: RawChannels,
): AtomisticTrajectoryChunkInputV045 {
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
        frameByteDigests: (ordinal === 0
          ? Object.fromEntries(CHANNELS.map((channel) => [channel, digestBytes(raw[channel])]))
          : Object.fromEntries(CHANNELS.map((channel) => [
            channel,
            digest(`frame-${ordinal}-${channel}`),
          ]))) as Record<AtomisticBinaryChannelV045, string>,
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

function digestBytes(bytes: Uint8Array) {
  return `sha256:${bytesToHex(sha256(bytes))}`;
}

function digest(label: string) {
  return digestValue({ fixture: label });
}

function rehashMetadata(metadata: Record<string, unknown>) {
  const payload = { ...metadata };
  Reflect.deleteProperty(payload, 'presentationFrameDigest');
  metadata.presentationFrameDigest = digestValue(payload);
}

function expectSelfDigest(value: object, digestKey: string) {
  const clone = structuredClone(value) as Record<string, unknown>;
  const actual = clone[digestKey];
  Reflect.deleteProperty(clone, digestKey);
  expect(actual).toBe(digestValue(clone));
}

function expectRecursivelyFrozen(value: unknown) {
  if (!value || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectRecursivelyFrozen(child);
}

function expectContainsNoArrayBufferView(value: unknown) {
  if (!value || typeof value !== 'object') return;
  expect(ArrayBuffer.isView(value)).toBe(false);
  for (const child of Object.values(value)) expectContainsNoArrayBufferView(child);
}

type MutableInput = {
  binding: {
    sessionId: string;
    sessionDigest: string;
    frameOrdinal: number;
    frameDigest: string;
    atomOrderDigest: string;
    cellDigest: string;
  };
  channels: Array<{
    channel: AtomisticBinaryChannelV045;
    dtype: 'float64-le';
    shape: number[];
    unit: (typeof UNITS)[AtomisticBinaryChannelV045];
    sourceByteDigest: string;
    f64LeBytes: Uint8Array;
  }>;
};

type DeepMutable<T> = T extends ReadonlyArray<infer U>
  ? DeepMutable<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
    : T;
