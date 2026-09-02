import 'server-only';

// Private Node implementation. Production consumers must enter through the
// `server-only` TypeScript facade; tests import this file only to exercise the
// runtime boundary without teaching Vitest a client-unsafe marker alias.
import { createHash } from "node:crypto";
import {
  closeSync,
  constants as fsConstants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  realpathSync
} from "node:fs";
import path from "node:path";
import { isProxy } from "node:util/types";
import {
  canonicalJson,
  parseJsonRejectDuplicateKeys
} from "../../scripts/atomistic/runtime-input-contract.mjs";
import {
  decodeFloat64LittleEndian,
  decodeUint32LittleEndian
} from "../../scripts/atomistic/openmm/control-metrics.mjs";
import {
  OPENMM_TIP3P_EXPECTED_PLAN_DIGEST,
  OPENMM_TIP3P_EXPECTED_SYSTEM_DIGEST,
  computeOpenMmTip3pVerifierDigest,
  verifyOpenMmTip3pArtifactDirectory
} from "../../scripts/atomistic/openmm/verify-control.mjs";
import {
  ATOMISTIC_COMPONENT_COUNT_V045,
  ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045,
  ATOMISTIC_F64_TRAJECTORY_BYTE_LENGTH_V045,
  ATOMISTIC_PARTICLE_COUNT_V045,
  ATOMISTIC_REFERENCE_BACKEND_MANIFEST_DIGEST_V045,
  ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045,
  ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045,
  ATOMISTIC_TRAJECTORY_INTEGRATED_STEPS_V045,
  ATOMISTIC_TRAJECTORY_SAMPLE_STRIDE_STEPS_V045,
  ATOMISTIC_TRAJECTORY_TIME_STEP_PS_V045,
  ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045,
  createAtomisticTrajectoryChunkV045
} from "./atomistic-trajectory-chunk.ts";
import {
  createAtomisticWorldSessionV045,
  getAtomisticWorldSessionFrameV045
} from "./atomistic-world-session.ts";
import {
  createAtomisticPresentationFrameControllerV046
} from "./atomistic-presentation-frame.ts";
import {
  createAtomisticPrivatePositionTrajectoryControllerV048
} from "./atomistic-private-position-trajectory-v048.ts";
import { digestValue } from "./digest.ts";
if (typeof process === "undefined" || process.release?.name !== "node" || typeof window !== "undefined") {
  throw new Error("OpenMM world-session loading is restricted to a private Node server runtime");
}
if (!Number.isInteger(fsConstants.O_NOFOLLOW)) {
  throw new Error("OpenMM world-session loading requires filesystem O_NOFOLLOW support");
}
const SOURCE_REVISION = /^(?!0{40}$)[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const STABLE_SESSION_ID = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const MAXIMUM_RECEIPT_BYTES = 4 * 1024 * 1024;
const UINT8_ARRAY_FILL = Uint8Array.prototype.fill;
const MATERIALIZATION_VERSION = "tf.openmm-tip3p-world-session-materialization/0.4.5";
const PRESENTATION_MATERIALIZATION_VERSION =
  "tf.openmm-tip3p-private-presentation-frame-materialization/0.4.6";
const POSITION_TRAJECTORY_MATERIALIZATION_VERSION =
  "tf.openmm-tip3p-private-position-trajectory-materialization/0.4.8";
const PRIVATE_PRESENTATION_CONTROLLERS = /* @__PURE__ */ new WeakMap();
const PRIVATE_PRESENTATION_REVOCATION_RECEIPTS = /* @__PURE__ */ new WeakMap();
const REVOKED_PRIVATE_PRESENTATION_MATERIALIZATIONS = /* @__PURE__ */ new WeakSet();
const PRIVATE_POSITION_TRAJECTORY_CONTROLLERS = /* @__PURE__ */ new WeakMap();
const PRIVATE_POSITION_TRAJECTORY_REVOCATION_RECEIPTS = /* @__PURE__ */ new WeakMap();
const REVOKED_PRIVATE_POSITION_TRAJECTORY_MATERIALIZATIONS = /* @__PURE__ */ new WeakSet();
const DIGEST_BOUND_ARTIFACT_IDS = Object.freeze([
  "cell",
  "constraints",
  "constraint-targets",
  "prepare-receipt",
  "reference-a-run",
  "reference-a-sample-steps",
  "reference-a-sample-times",
  "reference-a-positions",
  "reference-a-velocities",
  "reference-a-potential-forces",
  "reference-a-energies"
]);
const TRAJECTORY_CHANNELS = Object.freeze([
  ["positionsNanometer", "reference-a-positions"],
  ["velocitiesNanometerPerPicosecond", "reference-a-velocities"],
  ["potentialForcesKjMolNanometer", "reference-a-potential-forces"],
  ["sampleSteps", "reference-a-sample-steps"],
  ["sampleTimes", "reference-a-sample-times"],
  ["energies", "reference-a-energies"]
]);
const VECTOR_CHANNELS = Object.freeze([
  ["positionsNanometer", "reference-a-positions"],
  ["velocitiesNanometerPerPicosecond", "reference-a-velocities"],
  ["potentialForcesKjMolNanometer", "reference-a-potential-forces"]
]);
const VECTOR_UNITS = Object.freeze({
  positionsNanometer: "nanometer",
  velocitiesNanometerPerPicosecond: "nanometer-per-picosecond",
  potentialForcesKjMolNanometer: "kilojoule-per-mole-per-nanometer"
});
async function loadOpenMmTip3pWorldSessionV045(input) {
  const { materialization } = await materializePrivateOpenMmTip3pSnapshot(
    validateInput(input),
    { kind: "world-session" }
  );
  return materialization;
}
async function loadOpenMmTip3pPresentationFrameV046(input) {
  const validated = validatePresentationInput(input);
  const { materialization: worldSessionMaterialization, presentationFrameController } =
    await materializePrivateOpenMmTip3pSnapshot(validated, {
      kind: "v046-presentation-frame",
      frameOrdinal: validated.frameOrdinal
    });
  if (presentationFrameController === null) {
    throw new Error("private OpenMM presentation frame capability was not materialized");
  }
  const payload = {
    schemaVersion: PRESENTATION_MATERIALIZATION_VERSION,
    runtimeBoundary: "node-server-only-private-artifact-filesystem",
    evidenceBoundary:
      "scientific-self-consistency-verified-against-same-digest-bound-artifacts-execution-unattested",
    worldSessionMaterialization,
    presentationFrameMetadata: presentationFrameController.handle.metadata,
    sourceArtifactF64BytesReachableFromReturn: false,
    serializedBinaryPayloadExposed: false,
    privateDerivedF32BytesRetainedUntilOwnerRevocationOrCapabilityGc: true,
    explicitPrivateDerivedF32OwnerRevocationSupported: true,
    executionAuthenticityVerified: false,
    reproduced: false,
    protectedMainArtifact: false,
    attestedArtifact: false,
    sourceLicenseForPublicDistributionVerified: false,
    promotionEligible: false,
    publicDistributionEligible: false,
    cloudflareDistributionEligible: false,
    publicPayload: null
  };
  const presentationMaterialization = deepFreeze({
    ...payload,
    materializationDigest: digestValue(payload)
  });
  assertNoBinaryPayload(presentationMaterialization);
  PRIVATE_PRESENTATION_CONTROLLERS.set(presentationMaterialization, presentationFrameController);
  return presentationMaterialization;
}
async function loadOpenMmTip3pPrivatePositionTrajectoryV048(input) {
  const validated = validateInput(input);
  const {
    materialization: worldSessionMaterialization,
    positionTrajectoryController
  } = await materializePrivateOpenMmTip3pSnapshot(validated, {
    kind: "v048-position-trajectory"
  });
  if (positionTrajectoryController === null) {
    throw new Error("private OpenMM position trajectory capability was not materialized");
  }
  let controllerRegistered = false;
  try {
    const payload = {
      schemaVersion: POSITION_TRAJECTORY_MATERIALIZATION_VERSION,
      runtimeBoundary: "node-server-only-private-artifact-filesystem",
      evidenceBoundary:
        "one-stable-digest-bound-reference-a-snapshot-scientifically-checked-execution-unattested",
      worldSessionMaterialization,
      positionTrajectoryMetadata: positionTrajectoryController.handle.metadata,
      sourceArtifactF64BytesReachableFromReturn: false,
      serializedBinaryPayloadExposed: false,
      privateDerivedF32BytesRetainedUntilOwnerRevocationOrCapabilityGc: true,
      explicitPrivateDerivedF32OwnerRevocationSupported: true,
      singleStableArtifactSnapshot: true,
      positionsOnlyDerivative: true,
      executionAuthenticityVerified: false,
      reproduced: false,
      protectedMainArtifact: false,
      attestedArtifact: false,
      sourceLicenseForPublicDistributionVerified: false,
      promotionEligible: false,
      publicDistributionEligible: false,
      cloudflareDistributionEligible: false,
      publicPayload: null
    };
    const trajectoryMaterialization = deepFreeze({
      ...payload,
      materializationDigest: digestValue(payload)
    });
    assertNoBinaryPayload(trajectoryMaterialization);
    PRIVATE_POSITION_TRAJECTORY_CONTROLLERS.set(
      trajectoryMaterialization,
      positionTrajectoryController
    );
    controllerRegistered = true;
    return trajectoryMaterialization;
  } finally {
    if (!controllerRegistered) positionTrajectoryController.revoke();
  }
}
function getOpenMmTip3pPresentationFrameHandleV046(materialization) {
  requirePrivatePresentationMaterializationObject(materialization);
  if (REVOKED_PRIVATE_PRESENTATION_MATERIALIZATIONS.has(materialization)) {
    throw new Error("private presentation capability has been revoked");
  }
  const controller = PRIVATE_PRESENTATION_CONTROLLERS.get(materialization);
  if (!controller) {
    throw new Error("private presentation capability requires the original materialization object");
  }
  if (controller.handle.isRevoked()) {
    PRIVATE_PRESENTATION_CONTROLLERS.delete(materialization);
    PRIVATE_PRESENTATION_REVOCATION_RECEIPTS.set(materialization, controller.revoke());
    REVOKED_PRIVATE_PRESENTATION_MATERIALIZATIONS.add(materialization);
    throw new Error("private presentation capability has been revoked");
  }
  return controller.handle;
}
function revokeOpenMmTip3pPresentationFrameV046(materialization) {
  requirePrivatePresentationMaterializationObject(materialization);
  const existingReceipt = PRIVATE_PRESENTATION_REVOCATION_RECEIPTS.get(materialization);
  if (existingReceipt) return existingReceipt;
  const controller = PRIVATE_PRESENTATION_CONTROLLERS.get(materialization);
  if (!controller) {
    throw new Error("private presentation revocation requires the original materialization object");
  }
  const revocationReceipt = controller.revoke();
  PRIVATE_PRESENTATION_CONTROLLERS.delete(materialization);
  PRIVATE_PRESENTATION_REVOCATION_RECEIPTS.set(materialization, revocationReceipt);
  REVOKED_PRIVATE_PRESENTATION_MATERIALIZATIONS.add(materialization);
  return revocationReceipt;
}
function getOpenMmTip3pPrivatePositionTrajectoryHandleV048(materialization) {
  requirePrivatePositionTrajectoryMaterializationObject(materialization);
  if (REVOKED_PRIVATE_POSITION_TRAJECTORY_MATERIALIZATIONS.has(materialization)) {
    throw new Error("private position trajectory capability has been revoked");
  }
  const controller = PRIVATE_POSITION_TRAJECTORY_CONTROLLERS.get(materialization);
  if (!controller) {
    throw new Error("private position trajectory capability requires the original materialization object");
  }
  if (controller.handle.isRevoked()) {
    PRIVATE_POSITION_TRAJECTORY_CONTROLLERS.delete(materialization);
    PRIVATE_POSITION_TRAJECTORY_REVOCATION_RECEIPTS.set(materialization, controller.revoke());
    REVOKED_PRIVATE_POSITION_TRAJECTORY_MATERIALIZATIONS.add(materialization);
    throw new Error("private position trajectory capability has been revoked");
  }
  return controller.handle;
}
function revokeOpenMmTip3pPrivatePositionTrajectoryV048(materialization) {
  requirePrivatePositionTrajectoryMaterializationObject(materialization);
  const existingReceipt = PRIVATE_POSITION_TRAJECTORY_REVOCATION_RECEIPTS.get(materialization);
  if (existingReceipt) return existingReceipt;
  const controller = PRIVATE_POSITION_TRAJECTORY_CONTROLLERS.get(materialization);
  if (!controller) {
    throw new Error("private position trajectory revocation requires the original materialization object");
  }
  const receipt = controller.revoke();
  PRIVATE_POSITION_TRAJECTORY_CONTROLLERS.delete(materialization);
  PRIVATE_POSITION_TRAJECTORY_REVOCATION_RECEIPTS.set(materialization, receipt);
  REVOKED_PRIVATE_POSITION_TRAJECTORY_MATERIALIZATIONS.add(materialization);
  return receipt;
}
function requirePrivatePresentationMaterializationObject(materialization) {
  if (materialization === null || typeof materialization !== "object" || isProxy(materialization)) {
    throw new Error("private presentation capability requires the original materialization object");
  }
}
function requirePrivatePositionTrajectoryMaterializationObject(materialization) {
  if (materialization === null || typeof materialization !== "object" || isProxy(materialization)) {
    throw new Error("private position trajectory capability requires the original materialization object");
  }
}
async function materializePrivateOpenMmTip3pSnapshot(validated, mode) {
  validateMaterializationMode(mode);
  let artifactBytes = null;
  const privateByteBuffers = [];
  const privateNumericArrays = [];
  try {
  const rootBefore = inspectCanonicalArtifactRoot(validated.artifactRoot);
  assertReceiptOutsideArtifactRoot(
    validated.artifactRoot,
    validated.independentControlReceiptPath
  );
  const receiptBytesBefore = retainPrivateByteBuffer(
    privateByteBuffers,
    readStableIndependentReceipt(validated.independentControlReceiptPath)
  );
  const criticalDirectoriesBefore = ["arrays", "manifests"].map((relativePath) =>
    inspectCanonicalArtifactDirectory(validated.artifactRoot, relativePath));
  const verifierDigest = computeOpenMmTip3pVerifierDigest();
  const liveReceiptUnknown = await verifyOpenMmTip3pArtifactDirectory({
    root: validated.artifactRoot,
    expectedSystemDigest: OPENMM_TIP3P_EXPECTED_SYSTEM_DIGEST,
    expectedPlanDigest: OPENMM_TIP3P_EXPECTED_PLAN_DIGEST,
    expectedSourceRevision: validated.expectedSourceRevision,
    verifierDigest
  });
  assertArtifactRootUnchanged(validated.artifactRoot, rootBefore);
  assertArtifactDirectoriesUnchanged(criticalDirectoriesBefore);
  const receiptBytesAfter = retainPrivateByteBuffer(
    privateByteBuffers,
    readStableIndependentReceipt(validated.independentControlReceiptPath)
  );
  if (!receiptBytesBefore.equals(receiptBytesAfter)) {
    throw new Error("independent control receipt changed across live verification");
  }
  const liveReceiptBytes = retainPrivateByteBuffer(privateByteBuffers, Buffer.from(
    `${canonicalJson(liveReceiptUnknown)}
`,
    "ascii"
  ));
  if (!receiptBytesBefore.equals(liveReceiptBytes)) {
    throw new Error("external receipt bytes differ from the canonical live-verifier receipt");
  }
  const receipt = parseJsonRecord(liveReceiptBytes, "canonical live-verifier receipt");
  validateIndependentReceiptBoundary(
    receipt,
    validated.expectedSourceRevision,
    verifierDigest
  );
  const artifactManifestBytes = retainPrivateByteBuffer(
    privateByteBuffers,
    readStableArtifactAtMost(
      validated.artifactRoot,
      "manifests/artifact-manifest.json",
      MAXIMUM_RECEIPT_BYTES
    )
  );
  const manifest = parseJsonRecord(artifactManifestBytes, "digest-bound artifact manifest");
  const canonicalManifestBytes = retainPrivateByteBuffer(
    privateByteBuffers,
    Buffer.from(`${canonicalJson(manifest)}
`, "ascii")
  );
  if (!artifactManifestBytes.equals(canonicalManifestBytes)) {
    throw new Error("digest-bound artifact manifest is not canonical JSON bytes");
  }
  if (sha256Digest(artifactManifestBytes) !== requireDigest(receipt, "artifactManifestDigest", "control receipt")) {
    throw new Error("second-read artifact manifest bytes differ from the control receipt");
  }
  validateManifestLineage(manifest, receipt, validated.expectedSourceRevision);
  const descriptorsById = indexManifestDescriptors(manifest);
  artifactBytes = {};
  for (const id of DIGEST_BOUND_ARTIFACT_IDS) {
    const descriptor = requireDescriptor(descriptorsById, id);
    const bytes = readStableArtifact(
      validated.artifactRoot,
      requireString(descriptor, "path", `digest-bound artifact descriptor ${id}`, 4096),
      descriptor.sizeBytes
    );
    artifactBytes[id] = bytes;
    validateCapturedArtifact(id, bytes, descriptorsById);
  }
  assertArtifactRootUnchanged(validated.artifactRoot, rootBefore);
  assertArtifactDirectoriesUnchanged(criticalDirectoriesBefore);
  const artifactManifestBytesAfterArtifacts = retainPrivateByteBuffer(
    privateByteBuffers,
    readStableArtifactAtMost(
      validated.artifactRoot,
      "manifests/artifact-manifest.json",
      MAXIMUM_RECEIPT_BYTES
    )
  );
  try {
    if (!artifactManifestBytes.equals(artifactManifestBytesAfterArtifacts)) {
      throw new Error("digest-bound artifact manifest changed during artifact reading");
    }
  } finally {
    artifactManifestBytesAfterArtifacts.fill(0);
  }
  const receiptBytesAfterArtifacts = retainPrivateByteBuffer(
    privateByteBuffers,
    readStableIndependentReceipt(validated.independentControlReceiptPath)
  );
  if (!receiptBytesBefore.equals(receiptBytesAfterArtifacts)) {
    throw new Error("independent control receipt changed during digest-bound artifact reading");
  }
  const prepare = parseJsonRecord(artifactBytes["prepare-receipt"], "digest-bound prepare receipt");
  const referenceA = parseJsonRecord(artifactBytes["reference-a-run"], "digest-bound Reference A receipt");
  const prepareDescriptor = requireDescriptor(descriptorsById, "prepare-receipt");
  const referenceADescriptor = requireDescriptor(descriptorsById, "reference-a-run");
  validateProducerReceiptLineage(prepare, referenceA, receipt, prepareDescriptor, referenceADescriptor);
  const cellValues = retainPrivateNumericArray(privateNumericArrays, decodeFloat64LittleEndian(
    artifactBytes.cell,
    9,
    "digest-bound second-read authoritative cell"
  ));
  const lockedCell = [3, 0, 0, 0, 3, 0, 0, 0, 3];
  if (lockedCell.some((value, index) => cellValues[index] !== value)) {
    throw new Error("digest-bound second-read cell differs from the locked periodic cell");
  }
  for (const [, id] of VECTOR_CHANNELS) {
    const validatedVector = decodeFloat64LittleEndian(
      artifactBytes[id],
      ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045 * ATOMISTIC_COMPONENT_COUNT_V045,
      `digest-bound second-read ${id}`
    );
    validatedVector.fill(0);
  }
  const sampleSteps = retainPrivateNumericArray(privateNumericArrays, decodeUint32LittleEndian(
    artifactBytes["reference-a-sample-steps"],
    ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045,
    "digest-bound second-read Reference A sample steps"
  ));
  const sampleTimes = retainPrivateNumericArray(privateNumericArrays, decodeFloat64LittleEndian(
    artifactBytes["reference-a-sample-times"],
    ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045,
    "digest-bound second-read Reference A sample times"
  ));
  const energies = retainPrivateNumericArray(privateNumericArrays, decodeFloat64LittleEndian(
    artifactBytes["reference-a-energies"],
    ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045 * 3,
    "digest-bound second-read Reference A energies"
  ));
  const artifactManifestDescriptors = Object.fromEntries(
    TRAJECTORY_CHANNELS.map(([channel, id]) => [
      channel,
      requireDescriptor(descriptorsById, id)
    ])
  );
  const trajectoryDigest = digestValue({
    schemaVersion: "tf.openmm-reference-a-trajectory-evidence-root/0.4.5",
    artifactManifestDigest: requireDigest(receipt, "artifactManifestDigest", "control receipt"),
    payloadBundleRoot: requireDigest(receipt, "payloadBundleRoot", "control receipt"),
    referenceARunReceiptDigest: requireDigest(referenceA, "runReceiptDigest", "Reference A receipt"),
    referenceARunArtifactDigest: referenceADescriptor.sha256,
    artifacts: TRAJECTORY_CHANNELS.map(([channel]) => ({
      channel,
      manifestDescriptor: artifactManifestDescriptors[channel]
    }))
  });
  const lineage = buildLineage({
    receipt,
    prepare,
    referenceA,
    prepareDescriptor,
    referenceADescriptor,
    cellDescriptor: requireDescriptor(descriptorsById, "cell"),
    trajectoryDigest
  });
  const frames = Array.from(
    { length: ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045 },
    (_, frameOrdinal) => {
      const energyOffset = frameOrdinal * 3;
      const potentialKjMol = energies[energyOffset];
      const kineticKjMol = energies[energyOffset + 1];
      const totalKjMol = energies[energyOffset + 2];
      if (totalKjMol !== potentialKjMol + kineticKjMol) {
        throw new Error(`digest-bound second-read Reference A energy frame ${frameOrdinal} does not close exactly`);
      }
      const byteOffset = frameOrdinal * ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045;
      return {
        step: sampleSteps[frameOrdinal],
        timePicoseconds: sampleTimes[frameOrdinal],
        frameByteDigests: Object.fromEntries(VECTOR_CHANNELS.map(([channel, id]) => [
          channel,
          sha256Digest(artifactBytes[id].subarray(
            byteOffset,
            byteOffset + ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045
          ))
        ])),
        energy: { potentialKjMol, kineticKjMol, totalKjMol }
      };
    }
  );
  const chunk = createAtomisticTrajectoryChunkV045({
    chunkId: "reference-a-monolithic-trajectory",
    lineage,
    firstFrameOrdinal: 0,
    sampleStrideSteps: ATOMISTIC_TRAJECTORY_SAMPLE_STRIDE_STEPS_V045,
    fixedTimeStepPicoseconds: ATOMISTIC_TRAJECTORY_TIME_STEP_PS_V045,
    artifactManifestDescriptors,
    frames
  });
  validateChunkAgainstCapturedBytes(chunk, artifactBytes);
  const topology = requireRecord(prepare.topology, "prepare topology");
  const topologyParticleCount = requireInteger(topology, "particleCount", "prepare topology");
  const topologyBondCount = requireInteger(topology, "topologyBondCount", "prepare topology");
  const rigidDistanceConstraintCount = requireInteger(
    topology,
    "constraintCount",
    "prepare topology"
  );
  if (topologyParticleCount !== ATOMISTIC_PARTICLE_COUNT_V045 || topologyBondCount !== 1790 || rigidDistanceConstraintCount !== ATOMISTIC_PARTICLE_COUNT_V045) {
    throw new Error("digest-bound second-read topology counts differ from the locked session topology");
  }
  const session = createAtomisticWorldSessionV045({
    sessionId: validated.sessionId,
    system: {
      schemaVersion: "tf.aqueous-system-spec/0.4.4",
      systemId: "openmm-8.6-tip3p-895-water-pme-control",
      systemDigest: OPENMM_TIP3P_EXPECTED_SYSTEM_DIGEST
    },
    backend: {
      engine: "OpenMM",
      engineVersion: "8.6.0",
      platform: "Reference",
      lane: "reference-a",
      backendManifestDigest: ATOMISTIC_REFERENCE_BACKEND_MANIFEST_DIGEST_V045
    },
    preparation: {
      prepareReceiptDigest: lineage.prepareReceiptDigest,
      prepareReceiptArtifactDigest: lineage.prepareReceiptArtifactDigest,
      serializedSystemDigest: lineage.serializedSystemDigest,
      portableProductionStartStateDigest: requireDigest(
        prepare,
        "portableProductionStartStateDigest",
        "prepare receipt"
      )
    },
    verification: {
      schemaVersion: "tf.openmm-tip3p-control-receipt/0.4.5",
      statusDomain: "independent-scientific-assessment-not-release-provenance",
      status: "verified-pass",
      systemDigest: OPENMM_TIP3P_EXPECTED_SYSTEM_DIGEST,
      planDigest: OPENMM_TIP3P_EXPECTED_PLAN_DIGEST,
      sourceRevision: validated.expectedSourceRevision,
      producerOutcomeDigest: lineage.producerOutcomeDigest,
      artifactManifestDigest: lineage.artifactManifestDigest,
      controlReceiptDigest: lineage.controlReceiptDigest,
      verifierDigest: lineage.verifierDigest,
      payloadBundleRoot: lineage.payloadBundleRoot,
      executionAuthenticityVerified: false,
      promotionEligible: false
    },
    atomOrder: {
      authority: "pdb-record-order",
      atomOrderDigest: lineage.atomOrderDigest,
      particleCount: ATOMISTIC_PARTICLE_COUNT_V045,
      indexing: "zero-based-render-index-maps-one-to-one-to-authoritative-order"
    },
    cell: {
      kind: "orthorhombic-periodic-cell",
      vectorsNanometer: [
        { x: cellValues[0], y: cellValues[1], z: cellValues[2] },
        { x: cellValues[3], y: cellValues[4], z: cellValues[5] },
        { x: cellValues[6], y: cellValues[7], z: cellValues[8] }
      ],
      periodicAxes: [true, true, true],
      volumeNanometer3: 27,
      cellDigest: lineage.cellDigest
    },
    topology: {
      topologyDigest: lineage.topologyDigest,
      particleCount: ATOMISTIC_PARTICLE_COUNT_V045,
      topologyBondCount: 1790,
      rigidDistanceConstraintCount: ATOMISTIC_PARTICLE_COUNT_V045,
      topologyRole: "identity-and-adjacency-not-dynamic-bond-order"
    },
    trajectory: {
      referenceARunReceiptDigest: lineage.referenceARunReceiptDigest,
      referenceARunArtifactDigest: lineage.referenceARunArtifactDigest,
      trajectoryDigest,
      chunks: [chunk]
    }
  });
  const materializationPayload = {
    schemaVersion: MATERIALIZATION_VERSION,
    runtimeBoundary: "node-server-only-private-artifact-filesystem",
    evidenceBoundary: "scientific-self-consistency-verified-against-same-digest-bound-artifacts-execution-unattested",
    session,
    executionAuthenticityVerified: false,
    promotionEligible: false,
    rawScientificPayloadExposed: false,
    privateArtifactBytesRetained: false,
    cloudflareDistributionEligible: false,
    publicPayload: null
  };
  const materialization = {
    ...materializationPayload,
    materializationDigest: digestValue(materializationPayload)
  };
  assertNoBinaryPayload(materialization);
  const frozenMaterialization = deepFreeze(materialization);
  const presentationFrameController = mode.kind === "v046-presentation-frame"
    ? createPrivatePresentationFrameController(
      frozenMaterialization.session,
      mode.frameOrdinal,
      artifactBytes
    )
    : null;
  const positionTrajectoryController = mode.kind === "v048-position-trajectory"
    ? createPrivatePositionTrajectoryController(
      frozenMaterialization.session,
      artifactBytes
    )
    : null;
  return Object.freeze({
    materialization: frozenMaterialization,
    presentationFrameController,
    positionTrajectoryController
  });
  } finally {
    for (const bytes of privateByteBuffers) bytes.fill(0);
    for (const values of privateNumericArrays) values.fill(0);
    zeroizeCapturedArtifactBytes(artifactBytes);
  }
}
function validateMaterializationMode(mode) {
  if (mode === null || typeof mode !== "object" || isProxy(mode)) {
    throw new Error("private OpenMM materialization mode is invalid");
  }
  if (mode.kind === "world-session" || mode.kind === "v048-position-trajectory") {
    if (Reflect.ownKeys(mode).length !== 1) {
      throw new Error("private OpenMM materialization mode has unexpected fields");
    }
    return;
  }
  if (mode.kind !== "v046-presentation-frame"
    || Reflect.ownKeys(mode).length !== 2
    || !Number.isSafeInteger(mode.frameOrdinal)
    || mode.frameOrdinal < 0
    || mode.frameOrdinal >= ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045) {
    throw new Error("private OpenMM materialization mode is invalid");
  }
}
function validateInput(input) {
  const value = requireExactRecord(
    input,
    ["artifactRoot", "independentControlReceiptPath", "expectedSourceRevision", "sessionId"],
    "OpenMM world-session loader input"
  );
  const artifactRoot = requireString(value, "artifactRoot", "loader input", 4096);
  const independentControlReceiptPath = requireString(
    value,
    "independentControlReceiptPath",
    "loader input",
    4096
  );
  const expectedSourceRevision = requireString(
    value,
    "expectedSourceRevision",
    "loader input",
    40
  );
  const sessionId = requireString(value, "sessionId", "loader input", 128);
  if (!SOURCE_REVISION.test(expectedSourceRevision)) {
    throw new Error("expected source revision must be a nonzero lowercase Git commit ID");
  }
  if (!STABLE_SESSION_ID.test(sessionId)) {
    throw new Error("sessionId must be one stable nonempty token");
  }
  if (!path.isAbsolute(artifactRoot) || path.normalize(artifactRoot) !== artifactRoot) {
    throw new Error("artifact root must be a normalized absolute path");
  }
  if (!path.isAbsolute(independentControlReceiptPath) || path.normalize(independentControlReceiptPath) !== independentControlReceiptPath) {
    throw new Error("independent control receipt path must be a normalized absolute path");
  }
  return { artifactRoot, independentControlReceiptPath, expectedSourceRevision, sessionId };
}
function validatePresentationInput(input) {
  const value = requireExactRecord(
    input,
    [
      "artifactRoot",
      "independentControlReceiptPath",
      "expectedSourceRevision",
      "sessionId",
      "frameOrdinal"
    ],
    "OpenMM private presentation frame loader input"
  );
  const frameOrdinal = value.frameOrdinal;
  if (!Number.isSafeInteger(frameOrdinal)
    || Object.is(frameOrdinal, -0)
    || frameOrdinal < 0
    || frameOrdinal >= ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045) {
    throw new Error("frameOrdinal must be one safe integer from 0 through 100");
  }
  const validated = validateInput({
    artifactRoot: value.artifactRoot,
    independentControlReceiptPath: value.independentControlReceiptPath,
    expectedSourceRevision: value.expectedSourceRevision,
    sessionId: value.sessionId
  });
  return { ...validated, frameOrdinal };
}
function inspectCanonicalArtifactRoot(artifactRoot) {
  const canonical = realpathSync(artifactRoot);
  const metadata = lstatSync(artifactRoot, { bigint: true });
  if (canonical !== artifactRoot || !metadata.isDirectory() || metadata.isSymbolicLink()) {
    throw new Error("artifact root must be one canonical real directory");
  }
  return metadata;
}
function assertArtifactRootUnchanged(artifactRoot, before) {
  const after = lstatSync(artifactRoot, { bigint: true });
  if (realpathSync(artifactRoot) !== artifactRoot || !after.isDirectory() || after.isSymbolicLink() || !sameStableIdentity(before, after)) {
    throw new Error("artifact root identity changed across live verification");
  }
}
function inspectCanonicalArtifactDirectory(artifactRoot, relativePath) {
  const absolute = resolveCanonicalArtifactPath(artifactRoot, relativePath);
  const metadata = lstatSync(absolute, { bigint: true });
  if (realpathSync(absolute) !== absolute
    || !metadata.isDirectory()
    || metadata.isSymbolicLink()) {
    throw new Error(`artifact ${relativePath} directory must be one canonical real directory`);
  }
  return { absolute, metadata, relativePath };
}
function assertArtifactDirectoriesUnchanged(directoriesBefore) {
  for (const { absolute, metadata, relativePath } of directoriesBefore) {
    const after = lstatSync(absolute, { bigint: true });
    if (realpathSync(absolute) !== absolute
      || !after.isDirectory()
      || after.isSymbolicLink()
      || !sameStableIdentity(metadata, after)) {
      throw new Error(`artifact ${relativePath} directory identity changed during materialization`);
    }
  }
}
function assertReceiptOutsideArtifactRoot(artifactRoot, receiptPath) {
  if (receiptPath === artifactRoot || receiptPath.startsWith(`${artifactRoot}${path.sep}`)) {
    throw new Error("independent control receipt must remain outside the producer artifact root");
  }
}
function readStableIndependentReceipt(receiptPath) {
  if (realpathSync(receiptPath) !== receiptPath) {
    throw new Error("independent control receipt must use one canonical non-symlink path");
  }
  const pathBefore = lstatSync(receiptPath, { bigint: true });
  if (!pathBefore.isFile() || pathBefore.isSymbolicLink() || pathBefore.nlink !== BigInt(1) || pathBefore.size < BigInt(1) || pathBefore.size > BigInt(MAXIMUM_RECEIPT_BYTES) || pathBefore.size > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("independent control receipt must be one bounded single-link regular file");
  }
  const descriptor = openSync(
    receiptPath,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW
  );
  let bytes = null;
  let readCompleted = false;
  let readFailed = false;
  let readFailure;
  try {
    const descriptorBefore = fstatSync(descriptor, { bigint: true });
    if (!descriptorBefore.isFile() || descriptorBefore.nlink !== BigInt(1) || !sameStableIdentity(pathBefore, descriptorBefore)) {
      throw new Error("independent control receipt changed before its bounded read");
    }
    bytes = Buffer.alloc(Number(descriptorBefore.size));
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, null);
      if (count === 0) throw new Error("independent control receipt ended during its bounded read");
      offset += count;
    }
    const overflowProbe = Buffer.alloc(1);
    try {
      if (readSync(descriptor, overflowProbe, 0, 1, null) !== 0) {
        throw new Error("independent control receipt exceeded its verified size");
      }
    } finally {
      overflowProbe.fill(0);
    }
    const descriptorAfter = fstatSync(descriptor, { bigint: true });
    const pathAfter = lstatSync(receiptPath, { bigint: true });
    if (realpathSync(receiptPath) !== receiptPath || !pathAfter.isFile() || pathAfter.isSymbolicLink() || pathAfter.nlink !== BigInt(1) || !sameStableIdentity(pathBefore, descriptorAfter) || !sameStableIdentity(descriptorAfter, pathAfter)) {
      throw new Error("independent control receipt changed during its bounded read");
    }
    readCompleted = true;
  } catch (error) {
    readFailed = true;
    readFailure = error;
  }
  let closeFailed = false;
  let closeFailure;
  try {
    closeSync(descriptor);
  } catch (error) {
    closeFailed = true;
    closeFailure = error;
  }
  if ((!readCompleted || closeFailed) && bytes !== null) bytes.fill(0);
  if (readFailed && closeFailed) {
    throw new AggregateError(
      [readFailure, closeFailure],
      "independent control receipt read failed and descriptor close also failed",
      { cause: readFailure }
    );
  }
  if (readFailed) throw readFailure;
  if (closeFailed) {
    throw new Error("independent control receipt descriptor close failed", {
      cause: closeFailure
    });
  }
  return bytes;
}
function readStableArtifactAtMost(artifactRoot, relativePath, maximumSize) {
  const absolute = resolveCanonicalArtifactPath(artifactRoot, relativePath);
  const metadata = lstatSync(absolute, { bigint: true });
  if (metadata.size < BigInt(1) || metadata.size > BigInt(maximumSize) || metadata.size > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`digest-bound artifact ${relativePath} is outside its byte bound`);
  }
  return readStableArtifact(artifactRoot, relativePath, Number(metadata.size));
}
function readStableArtifact(artifactRoot, relativePath, expectedSize) {
  if (!Number.isSafeInteger(expectedSize) || expectedSize < 1 || expectedSize > 1024 * 1024 * 1024) {
    throw new Error(`digest-bound artifact ${relativePath} has an invalid byte length`);
  }
  const absolute = resolveCanonicalArtifactPath(artifactRoot, relativePath);
  const pathBefore = lstatSync(absolute, { bigint: true });
  if (realpathSync(absolute) !== absolute || !pathBefore.isFile() || pathBefore.isSymbolicLink() || pathBefore.nlink !== BigInt(1) || pathBefore.size !== BigInt(expectedSize)) {
    throw new Error(`digest-bound artifact ${relativePath} is not its canonical single-link file`);
  }
  const descriptor = openSync(
    absolute,
    fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW
  );
  let bytes = null;
  let readCompleted = false;
  let readFailed = false;
  let readFailure;
  try {
    const descriptorBefore = fstatSync(descriptor, { bigint: true });
    if (!descriptorBefore.isFile() || descriptorBefore.nlink !== BigInt(1) || !sameStableIdentity(pathBefore, descriptorBefore)) {
      throw new Error(`digest-bound artifact ${relativePath} changed before its second read`);
    }
    bytes = Buffer.alloc(expectedSize);
    let offset = 0;
    while (offset < bytes.length) {
      const count = readSync(descriptor, bytes, offset, bytes.length - offset, null);
      if (count === 0) {
        throw new Error(`digest-bound artifact ${relativePath} ended during its second read`);
      }
      offset += count;
    }
    const overflowProbe = Buffer.alloc(1);
    try {
      if (readSync(descriptor, overflowProbe, 0, 1, null) !== 0) {
        throw new Error(`digest-bound artifact ${relativePath} exceeded its verified size`);
      }
    } finally {
      UINT8_ARRAY_FILL.call(overflowProbe, 0);
    }
    const descriptorAfter = fstatSync(descriptor, { bigint: true });
    const pathAfter = lstatSync(absolute, { bigint: true });
    if (realpathSync(absolute) !== absolute || !pathAfter.isFile() || pathAfter.isSymbolicLink() || pathAfter.nlink !== BigInt(1) || !sameStableIdentity(pathBefore, descriptorAfter) || !sameStableIdentity(descriptorAfter, pathAfter)) {
      throw new Error(`digest-bound artifact ${relativePath} changed during its second read`);
    }
    readCompleted = true;
  } catch (error) {
    readFailed = true;
    readFailure = error;
  }
  let closeFailed = false;
  let closeFailure;
  try {
    closeSync(descriptor);
  } catch (error) {
    closeFailed = true;
    closeFailure = error;
  }
  if ((!readCompleted || closeFailed) && bytes !== null) {
    UINT8_ARRAY_FILL.call(bytes, 0);
  }
  if (readFailed && closeFailed) {
    throw new AggregateError(
      [readFailure, closeFailure],
      `digest-bound artifact ${relativePath} read failed and descriptor close also failed`,
      { cause: readFailure }
    );
  }
  if (readFailed) throw readFailure;
  if (closeFailed) {
    throw new Error(`digest-bound artifact ${relativePath} descriptor close failed`, {
      cause: closeFailure
    });
  }
  return bytes;
}
function resolveCanonicalArtifactPath(artifactRoot, relativePath) {
  if (typeof relativePath !== "string" || relativePath.includes("\\") || relativePath.startsWith("/") || path.posix.normalize(relativePath) !== relativePath) {
    throw new Error(`digest-bound artifact path ${JSON.stringify(relativePath)} is not canonical`);
  }
  const absolute = path.resolve(artifactRoot, relativePath);
  if (absolute === artifactRoot || !absolute.startsWith(`${artifactRoot}${path.sep}`)) {
    throw new Error(`digest-bound artifact path ${relativePath} escapes its root`);
  }
  return absolute;
}
function sameStableIdentity(left, right) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size && left.mode === right.mode && left.nlink === right.nlink && left.mtimeNs === right.mtimeNs && left.ctimeNs === right.ctimeNs;
}
function validateIndependentReceiptBoundary(receipt, expectedSourceRevision, expectedVerifierDigest) {
  const verification = requireRecord(receipt.verification, "control receipt verification");
  const gates = requireRecord(receipt.gates, "control receipt gates");
  const publication = requireRecord(receipt.publicationPolicy, "control receipt publication policy");
  const claims = requireRecord(receipt.claims, "control receipt claims");
  if (receipt.schemaVersion !== "tf.openmm-tip3p-control-receipt/0.4.5" || receipt.statusDomain !== "independent-scientific-assessment-not-release-provenance" || receipt.status !== "verified-pass" || receipt.systemDigest !== OPENMM_TIP3P_EXPECTED_SYSTEM_DIGEST || receipt.planDigest !== OPENMM_TIP3P_EXPECTED_PLAN_DIGEST || receipt.sourceRevision !== expectedSourceRevision || gates.allPassed !== true || verification.verifierDigest !== expectedVerifierDigest || verification.executionAuthenticityVerified !== false || publication.licenseClearance !== false || publication.rawPayloadPublic !== false || publication.cloudflareDistributionEligible !== false || publication.protectedMainArtifact !== false || publication.attestedArtifact !== false || publication.promotionEligible !== false || claims.openmmExecutionAuthenticated !== false || claims.scientificPass !== true || claims.reproduced !== false || claims.scorePromotionEligible !== false) {
    throw new Error("control receipt crossed the verified-but-execution-unattested boundary");
  }
  const receiptDigest = requireDigest(receipt, "receiptDigest", "control receipt");
  const withoutDigest = { ...receipt };
  delete withoutDigest.receiptDigest;
  if (receiptDigest !== sha256Digest(Buffer.from(`${canonicalJson(withoutDigest)}
`, "utf8"))) {
    throw new Error("control receipt self-digest is stale");
  }
}
function validateManifestLineage(manifest, receipt, expectedSourceRevision) {
  if (manifest.schemaVersion !== "tf.openmm-tip3p-artifact-manifest/0.4.5" || manifest.profile !== "openmm-tip3p-producer-internal-evidence" || manifest.systemDigest !== OPENMM_TIP3P_EXPECTED_SYSTEM_DIGEST || manifest.planDigest !== OPENMM_TIP3P_EXPECTED_PLAN_DIGEST || manifest.sourceRevision !== expectedSourceRevision || manifest.producerOutcomeDigest !== receipt.producerOutcomeDigest || manifest.bundleRoot !== receipt.payloadBundleRoot) {
    throw new Error("digest-bound second-read manifest lineage differs from the control receipt");
  }
}
function indexManifestDescriptors(manifest) {
  if (!Array.isArray(manifest.artifacts)) {
    throw new Error("digest-bound second-read manifest artifacts must be an array");
  }
  const descriptors = /* @__PURE__ */ new Map();
  for (let index = 0; index < manifest.artifacts.length; index += 1) {
    const descriptor = requireExactRecord(
      manifest.artifacts[index],
      ["id", "path", "kind", "dtype", "shape", "unit", "sizeBytes", "sha256"],
      `digest-bound second-read artifact descriptor ${index}`
    );
    const id = requireString(descriptor, "id", `digest-bound second-read artifact descriptor ${index}`, 256);
    if (descriptors.has(id)) throw new Error(`digest-bound second-read artifact descriptor ${id} repeats`);
    descriptors.set(id, descriptor);
  }
  return descriptors;
}
function validateCapturedArtifact(id, bytes, descriptorsById) {
  const descriptor = requireDescriptor(descriptorsById, id);
  if (descriptor.sizeBytes !== bytes.length || descriptor.sha256 !== sha256Digest(bytes)) {
    throw new Error(`digest-bound second-read artifact ${id} bytes differ from its manifest descriptor`);
  }
}
function validateProducerReceiptLineage(prepare, referenceA, receipt, prepareDescriptor, referenceADescriptor) {
  if (prepare.schemaVersion !== "tf.openmm-tip3p-prepare-receipt/0.4.5" || prepare.status !== "complete" || prepare.systemId !== "openmm-8.6-tip3p-895-water-pme-control" || prepare.systemDigest !== OPENMM_TIP3P_EXPECTED_SYSTEM_DIGEST || prepare.planDigest !== OPENMM_TIP3P_EXPECTED_PLAN_DIGEST || prepare.backendManifestDigest !== ATOMISTIC_REFERENCE_BACKEND_MANIFEST_DIGEST_V045 || referenceA.schemaVersion !== "tf.openmm-tip3p-reference-run/0.4.5" || referenceA.status !== "complete" || referenceA.lane !== "reference-a" || referenceA.platform !== "Reference" || referenceA.systemDigest !== OPENMM_TIP3P_EXPECTED_SYSTEM_DIGEST || referenceA.planDigest !== OPENMM_TIP3P_EXPECTED_PLAN_DIGEST || referenceA.backendManifestDigest !== ATOMISTIC_REFERENCE_BACKEND_MANIFEST_DIGEST_V045 || referenceA.prepareReceiptDigest !== prepare.receiptDigest || referenceA.compiledTopologyDigest !== prepare.compiledTopologyDigest || referenceA.serializedSystemDigest !== prepare.serializedSystemDigest || referenceA.atomOrderDigest !== prepare.atomOrderDigest || referenceA.portableProductionStartStateDigest !== prepare.portableProductionStartStateDigest || prepareDescriptor.id !== "prepare-receipt" || prepareDescriptor.path !== "manifests/prepare-receipt.json" || prepareDescriptor.kind !== "canonical-json" || referenceADescriptor.id !== "reference-a-run" || referenceADescriptor.path !== "manifests/reference-a-run.json" || referenceADescriptor.kind !== "canonical-json" || !DIGEST.test(prepareDescriptor.sha256) || !DIGEST.test(referenceADescriptor.sha256) || receipt.status !== "verified-pass") {
    throw new Error("digest-bound second-read prepare and Reference A receipt lineage changed");
  }
  for (const [record, key, label] of [
    [prepare, "receiptDigest", "prepare receipt"],
    [prepare, "compiledTopologyDigest", "prepare receipt"],
    [prepare, "serializedSystemDigest", "prepare receipt"],
    [prepare, "atomOrderDigest", "prepare receipt"],
    [prepare, "portableProductionStartStateDigest", "prepare receipt"],
    [referenceA, "runReceiptDigest", "Reference A receipt"]
  ]) {
    requireDigest(record, key, label);
  }
  if (!DIGEST.test(prepareDescriptor.sha256) || !DIGEST.test(referenceADescriptor.sha256)) {
    throw new Error("digest-bound second-read producer receipt artifact digests are invalid");
  }
}
function buildLineage({
  receipt,
  prepare,
  referenceA,
  prepareDescriptor,
  referenceADescriptor,
  cellDescriptor,
  trajectoryDigest
}) {
  const verification = requireRecord(receipt.verification, "control receipt verification");
  return {
    systemDigest: OPENMM_TIP3P_EXPECTED_SYSTEM_DIGEST,
    planDigest: OPENMM_TIP3P_EXPECTED_PLAN_DIGEST,
    sourceRevision: requireString(receipt, "sourceRevision", "control receipt", 40),
    backendManifestDigest: ATOMISTIC_REFERENCE_BACKEND_MANIFEST_DIGEST_V045,
    serializedSystemDigest: requireDigest(prepare, "serializedSystemDigest", "prepare receipt"),
    prepareReceiptDigest: requireDigest(prepare, "receiptDigest", "prepare receipt"),
    prepareReceiptArtifactDigest: prepareDescriptor.sha256,
    referenceARunReceiptDigest: requireDigest(referenceA, "runReceiptDigest", "Reference A receipt"),
    referenceARunArtifactDigest: referenceADescriptor.sha256,
    producerOutcomeDigest: requireDigest(receipt, "producerOutcomeDigest", "control receipt"),
    artifactManifestDigest: requireDigest(receipt, "artifactManifestDigest", "control receipt"),
    controlReceiptDigest: requireDigest(receipt, "receiptDigest", "control receipt"),
    verifierDigest: requireDigest(verification, "verifierDigest", "control receipt verification"),
    payloadBundleRoot: requireDigest(receipt, "payloadBundleRoot", "control receipt"),
    trajectoryDigest,
    atomOrderDigest: requireDigest(prepare, "atomOrderDigest", "prepare receipt"),
    cellDigest: cellDescriptor.sha256,
    topologyDigest: requireDigest(prepare, "compiledTopologyDigest", "prepare receipt"),
    integratedSteps: ATOMISTIC_TRAJECTORY_INTEGRATED_STEPS_V045,
    velocityTemporalAlignment: ATOMISTIC_VELOCITY_TEMPORAL_ALIGNMENT_V045,
    stateEnergyTemporalAlignment: ATOMISTIC_STATE_ENERGY_TEMPORAL_ALIGNMENT_V045,
    executionAuthenticityVerified: false,
    promotionEligible: false
  };
}
function validateChunkAgainstCapturedBytes(chunk, artifacts) {
  for (let frameOrdinal = 0; frameOrdinal < chunk.frames.length; frameOrdinal += 1) {
    const frame = chunk.frames[frameOrdinal];
    for (const [channel, id] of VECTOR_CHANNELS) {
      const source = frame.arrays[channel];
      const rawDigest = sha256Digest(artifacts[id].subarray(
        source.byteOffset,
        source.byteOffset + source.byteLength
      ));
      if (source.frameByteDigest !== rawDigest) {
        throw new Error(`frame ${frameOrdinal} ${channel} digest differs from second-read bytes`);
      }
    }
    for (const [channel, id] of [
      ["sampleSteps", "reference-a-sample-steps"],
      ["sampleTimes", "reference-a-sample-times"],
      ["energies", "reference-a-energies"]
    ]) {
      const source = frame.metadataSources[channel];
      const rawDigest = sha256Digest(artifacts[id].subarray(
        source.byteOffset,
        source.byteOffset + source.byteLength
      ));
      if (source.frameByteDigest !== rawDigest) {
        throw new Error(`frame ${frameOrdinal} ${channel} digest differs from second-read bytes`);
      }
    }
  }
}
function createPrivatePresentationFrameController(session, frameOrdinal, artifacts) {
  if (artifacts === null || typeof artifacts !== "object") {
    throw new Error("private presentation frame requires one captured artifact snapshot");
  }
  const frame = getAtomisticWorldSessionFrameV045(session, frameOrdinal);
  const expectedByteOffset = frameOrdinal * ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045;
  const privateFrameBytes = [];
  try {
    const channels = VECTOR_CHANNELS.map(([channel, id]) => {
      const source = frame.arrays[channel];
      const artifact = artifacts[id];
      const manifestDescriptor = session.trajectory.chunks[0].artifacts[channel].manifestDescriptor;
      if (!Buffer.isBuffer(artifact)
        || artifact.byteLength !== ATOMISTIC_F64_TRAJECTORY_BYTE_LENGTH_V045
        || source.sourceArtifactId !== id
        || source.sourceArtifactPath !== manifestDescriptor.path
        || source.sourceArtifactDigest !== manifestDescriptor.sha256
        || source.sourceArtifactDigest !== sha256Digest(artifact)
        || source.sourceArtifactByteLength !== ATOMISTIC_F64_TRAJECTORY_BYTE_LENGTH_V045
        || source.byteOffset !== expectedByteOffset
        || source.byteLength !== ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045) {
        throw new Error(`private presentation ${channel} source layout differs from the captured snapshot`);
      }
      const exactFrameBytes = new Uint8Array(ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045);
      exactFrameBytes.set(artifact.subarray(source.byteOffset, source.byteOffset + source.byteLength));
      privateFrameBytes.push(exactFrameBytes);
      if (sha256Digest(exactFrameBytes) !== source.frameByteDigest) {
        throw new Error(`private presentation ${channel} frame digest differs from the captured snapshot`);
      }
      return {
        channel,
        dtype: "float64-le",
        shape: [ATOMISTIC_PARTICLE_COUNT_V045, 3],
        unit: VECTOR_UNITS[channel],
        sourceByteDigest: source.frameByteDigest,
        f64LeBytes: exactFrameBytes
      };
    });
    return createAtomisticPresentationFrameControllerV046(session, {
      binding: {
        sessionId: session.sessionId,
        sessionDigest: session.sessionDigest,
        frameOrdinal,
        frameDigest: frame.frameDigest,
        atomOrderDigest: session.atomOrder.atomOrderDigest,
        cellDigest: session.cell.cellDigest
      },
      channels
    });
  } finally {
    for (const bytes of privateFrameBytes) bytes.fill(0);
  }
}
function createPrivatePositionTrajectoryController(session, artifacts) {
  if (artifacts === null || typeof artifacts !== "object") {
    throw new Error("private position trajectory requires one captured artifact snapshot");
  }
  validateCapturedRigidTip3pConstraints(artifacts);
  const positionArtifact = artifacts["reference-a-positions"];
  if (!Buffer.isBuffer(positionArtifact)
    || positionArtifact.byteLength !== ATOMISTIC_F64_TRAJECTORY_BYTE_LENGTH_V045) {
    throw new Error("private position trajectory source artifact layout changed");
  }
  const sourceFrames = [];
  try {
    for (let frameOrdinal = 0; frameOrdinal < ATOMISTIC_TRAJECTORY_FRAME_COUNT_V045;
      frameOrdinal += 1) {
      const frame = getAtomisticWorldSessionFrameV045(session, frameOrdinal);
      const source = frame.arrays.positionsNanometer;
      const expectedByteOffset = frameOrdinal * ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045;
      if (source.byteOffset !== expectedByteOffset
        || source.byteLength !== ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045) {
        throw new Error(`private position trajectory frame ${frameOrdinal} layout changed`);
      }
      const bytes = new Uint8Array(ATOMISTIC_F64_FRAME_BYTE_LENGTH_V045);
      bytes.set(positionArtifact.subarray(
        source.byteOffset,
        source.byteOffset + source.byteLength
      ));
      sourceFrames.push({
        frameOrdinal,
        sourcePositionsF64Digest: source.frameByteDigest,
        positionsF64LeBytes: bytes
      });
    }
    return createAtomisticPrivatePositionTrajectoryControllerV048(session, sourceFrames);
  } finally {
    for (const frame of sourceFrames) UINT8_ARRAY_FILL.call(frame.positionsF64LeBytes, 0);
  }
}
function validateCapturedRigidTip3pConstraints(artifacts) {
  const constraintBytes = artifacts.constraints;
  const targetBytes = artifacts["constraint-targets"];
  if (!Buffer.isBuffer(constraintBytes) || !Buffer.isBuffer(targetBytes)) {
    throw new Error("private position trajectory requires captured constraint artifacts");
  }
  let constraints = null;
  let targets = null;
  try {
    constraints = decodeUint32LittleEndian(
      constraintBytes,
      ATOMISTIC_PARTICLE_COUNT_V045 * 2,
      "digest-bound second-read position trajectory constraints"
    );
    targets = decodeFloat64LittleEndian(
      targetBytes,
      ATOMISTIC_PARTICLE_COUNT_V045,
      "digest-bound second-read position trajectory constraint targets"
    );
    const seen = Array.from({ length: 895 }, () => /* @__PURE__ */ new Set());
    for (let index = 0; index < ATOMISTIC_PARTICLE_COUNT_V045; index += 1) {
      const first = constraints[index * 2];
      const second = constraints[index * 2 + 1];
      if (first === second || first >= ATOMISTIC_PARTICLE_COUNT_V045
        || second >= ATOMISTIC_PARTICLE_COUNT_V045
        || Math.floor(first / 3) !== Math.floor(second / 3)) {
        throw new Error(`private position trajectory constraint ${index} topology changed`);
      }
      const water = Math.floor(first / 3);
      const pair = [first % 3, second % 3].sort((left, right) => left - right).join("-");
      if (!["0-1", "0-2", "1-2"].includes(pair) || seen[water].has(pair)) {
        throw new Error(`private position trajectory constraint ${index} pair changed`);
      }
      seen[water].add(pair);
      const expected = pair === "1-2" ? 0.15139006545247014 : 0.09572;
      if (Math.abs(targets[index] - expected) > 1e-12) {
        throw new Error(`private position trajectory constraint ${index} target changed`);
      }
    }
    if (seen.some((pairs) => pairs.size !== 3)) {
      throw new Error("private position trajectory constraints do not cover every water");
    }
  } finally {
    if (constraints !== null) constraints.fill(0);
    if (targets !== null) targets.fill(0);
  }
}
function retainPrivateNumericArray(retained, values) {
  retained.push(values);
  return values;
}
function retainPrivateByteBuffer(retained, bytes) {
  retained.push(bytes);
  return bytes;
}
function zeroizeCapturedArtifactBytes(artifacts) {
  if (artifacts === null || typeof artifacts !== "object") return;
  for (const bytes of Object.values(artifacts)) {
    if (Buffer.isBuffer(bytes)) bytes.fill(0);
  }
}
function parseJsonRecord(bytes, label) {
  return requireRecord(parseJsonRejectDuplicateKeys(bytes, label), label);
}
function requireDescriptor(descriptorsById, id) {
  const descriptor = descriptorsById.get(id);
  if (!descriptor) throw new Error(`digest-bound second-read artifact descriptor ${id} is missing`);
  if (!Number.isSafeInteger(descriptor.sizeBytes) || descriptor.sizeBytes < 1 || !DIGEST.test(typeof descriptor.sha256 === "string" ? descriptor.sha256 : "")) {
    throw new Error(`digest-bound second-read artifact descriptor ${id} has an invalid size or digest`);
  }
  if (descriptor.id !== id) {
    throw new Error(`digest-bound second-read artifact descriptor ${id} identity changed`);
  }
  return descriptor;
}
function requireExactRecord(value, expectedKeys, label) {
  const record = requireRecord(value, label);
  const descriptors = Object.getOwnPropertyDescriptors(record);
  const ownKeys = Reflect.ownKeys(descriptors);
  if (ownKeys.some((key) => typeof key !== "string")) {
    throw new Error(`${label} must contain only locked string keys`);
  }
  const actual = ownKeys.sort(compareAscii);
  const expected = [...expectedKeys].sort(compareAscii);
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new Error(`${label} must contain exactly the locked keys`);
  }
  for (const key of actual) {
    const descriptor = descriptors[key];
    if (!descriptor.enumerable || !("value" in descriptor) || descriptor.value === void 0) {
      throw new Error(`${label}.${key} must be one enumerable defined data property`);
    }
  }
  return record;
}
function requireRecord(value, label) {
  if (value === null || typeof value !== "object" || isProxy(value) || Array.isArray(value)) {
    throw new Error(`${label} must be a plain record`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new Error(`${label} must be a plain record`);
  }
  return value;
}
function requireString(record, key, label, maximumLength) {
  const value = record[key];
  if (typeof value !== "string" || value.length < 1 || value.length > maximumLength) {
    throw new Error(`${label}.${key} must be one bounded nonempty string`);
  }
  return value;
}
function requireDigest(record, key, label) {
  const value = record[key];
  if (typeof value !== "string" || !DIGEST.test(value)) {
    throw new Error(`${label}.${key} must be one SHA-256 digest`);
  }
  return value;
}
function requireInteger(record, key, label) {
  const value = record[key];
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error(`${label}.${key} must be one nonnegative safe integer`);
  }
  return value;
}
function sha256Digest(bytes) {
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}
function assertNoBinaryPayload(value) {
  const seen = /* @__PURE__ */ new WeakSet();
  const visit = (entry) => {
    if (entry === null || typeof entry !== "object") return;
    if (entry instanceof ArrayBuffer || ArrayBuffer.isView(entry) || typeof SharedArrayBuffer !== "undefined" && entry instanceof SharedArrayBuffer) {
      throw new Error("world-session materialization attempted to expose private binary payload");
    }
    if (seen.has(entry)) return;
    seen.add(entry);
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(entry))) {
      if ("value" in descriptor) visit(descriptor.value);
    }
  };
  visit(value);
}
function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const descriptor of Object.values(Object.getOwnPropertyDescriptors(value))) {
      if ("value" in descriptor) deepFreeze(descriptor.value);
    }
  }
  return value;
}
function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}
export {
  getOpenMmTip3pPrivatePositionTrajectoryHandleV048,
  getOpenMmTip3pPresentationFrameHandleV046,
  loadOpenMmTip3pPrivatePositionTrajectoryV048,
  loadOpenMmTip3pPresentationFrameV046,
  loadOpenMmTip3pWorldSessionV045,
  revokeOpenMmTip3pPrivatePositionTrajectoryV048,
  revokeOpenMmTip3pPresentationFrameV046
};
