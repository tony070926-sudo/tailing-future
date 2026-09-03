import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'node:crypto';
import {
  canonicalJson,
  parseJsonRejectDuplicateKeys,
} from './runtime-input-contract.mjs';
import {
  inspectFullCandidateProducerOutcomeBytes,
} from './full-candidate-producer-outcome-policy.mjs';
import {
  verifiedSuccessfulProducerJobProvenance,
} from './full-candidate-github-evidence-policy.mjs';

export const PRIVATE_FULL_CANDIDATE_HANDOFF_SCHEMA_VERSION =
  'tf.atomistic-private-full-candidate-handoff/0.1';
export const PRIVATE_FULL_CANDIDATE_ENVELOPE_SCHEMA_VERSION =
  'tf.atomistic-private-full-candidate-envelope/0.1';
export const PRIVATE_FULL_CANDIDATE_ENVELOPE_PATH =
  'private-handoff.envelope.json';
export const PRIVATE_FULL_CANDIDATE_OUTCOME_PATH =
  'manifests/producer-outcome.json';
export const PRIVATE_FULL_CANDIDATE_SCIENTIFIC_PATHS = Object.freeze([
  'manifests/structures.manifest.json',
  'predictions/predictions.jsonl',
]);
export const MAX_PRIVATE_FULL_CANDIDATE_ENVELOPE_BYTES = 15 * 1024 * 1024;

const CIPHER = 'aes-256-gcm';
const NONCE_BYTES = 12;
const TAG_BYTES = 16;
const MAX_PLAINTEXT_BYTES = 12 * 1024 * 1024;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const REVISION_PATTERN = /^[0-9a-f]{40}$/;
const KEY_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/;
const MODEL_SPECS = Object.freeze({
  mattersim: Object.freeze({
    modelId: 'mattersim-v1.0.0-5m',
    partitionId: 'mattersim-full-000',
  }),
  mace: Object.freeze({
    modelId: 'mace-mpa-0-medium',
    partitionId: 'mace-full-000',
  }),
});
const FILE_LIMITS = Object.freeze({
  [PRIVATE_FULL_CANDIDATE_OUTCOME_PATH]: 64 * 1024,
  [PRIVATE_FULL_CANDIDATE_SCIENTIFIC_PATHS[0]]: 64 * 1024,
  [PRIVATE_FULL_CANDIDATE_SCIENTIFIC_PATHS[1]]: 8 * 1024 * 1024,
});
const CLAIMS = Object.freeze({
  claimEligible: false,
  comparisonEligible: false,
  promotionEligible: false,
  reproduced: false,
  reproductionEligible: false,
  superiorityClaimAllowed: false,
});
const PUBLICATION_POLICY = Object.freeze({
  atomicNumbersPublicationLicenseCleared: false,
  encryptedPayloadRedistributionLicenseCleared: false,
  encryptedPayloadPublicationEligible: false,
  encryptionConfersPublicationOrRedistributionRights: false,
  publicArtifactPublicationEligible: false,
  decryptedPayloadMayBePublished: false,
  independentLabelBearingVerificationRequired: true,
  plaintextArtifactPublicationEligible: false,
  publicReceiptMayContainScientificArrays: false,
  restrictedPrivateStorageRequired: true,
  restrictedStorageAccessControlEvidenceRequired: true,
  restrictedStorageDeletionEvidenceRequired: true,
  restrictedStorageMaximumRetentionHours: 24,
  perModelPerRunKeyRotationEvidenceRequired: true,
});
const ENVELOPE_KEYS = Object.freeze([
  'authenticationTagBase64',
  'cipher',
  'ciphertextBase64',
  'claims',
  'keyId',
  'metadata',
  'nonceBase64',
  'plaintextSha256',
  'plaintextSizeBytes',
  'publicationPolicy',
  'schemaVersion',
]);
const METADATA_KEYS = Object.freeze([
  'jobId',
  'model',
  'modelId',
  'partitionId',
  'runAttempt',
  'sourceRevision',
  'workflowRunId',
]);
const HANDOFF_KEYS = Object.freeze(['files', 'metadata', 'schemaVersion']);
const FILE_KEYS = Object.freeze(['bytesBase64', 'path', 'sha256', 'sizeBytes']);

/**
 * Encrypt the exact internal producer outcome and any declared scientific files.
 * The returned canonical JSON is ciphertext-only, but encryption does not grant
 * publication or redistribution rights.  The envelope remains eligible only for
 * a separately validated restricted-private storage channel.
 */
export function createPrivateFullCandidateHandoff({
  files,
  key,
  keyId,
  producerOutcomeSchemaBytes,
  verifiedProducerJob,
  ...unexpectedOptions
}) {
  requireValue(
    Object.keys(unexpectedOptions).length === 0,
    'private handoff create received unexpected or self-reported provenance options',
  );
  const provenance = verifiedSuccessfulProducerJobProvenance(verifiedProducerJob);
  const metadata = validateMetadata({
    ...provenance,
    partitionId: MODEL_SPECS[provenance.model]?.partitionId,
  });
  const encryptionKey = copyKey(key);
  let additionalAuthenticatedData;
  let authenticationTag;
  let ciphertext;
  let ciphertextFinal;
  let ciphertextUpdate;
  let envelopeBytes;
  let nonce;
  let plaintextBytes;
  let returnedEnvelope = false;
  try {
    const validated = validateHandoffFiles(files, metadata, producerOutcomeSchemaBytes);
    const handoff = {
      files: validated.fileRecords,
      metadata,
      schemaVersion: PRIVATE_FULL_CANDIDATE_HANDOFF_SCHEMA_VERSION,
    };
    plaintextBytes = canonicalLfBytes(handoff);
    requireValue(
      plaintextBytes.length > 0 && plaintextBytes.length <= MAX_PLAINTEXT_BYTES,
      'private handoff plaintext size is outside policy',
    );
    nonce = randomBytes(NONCE_BYTES);
    additionalAuthenticatedData = envelopeAdditionalAuthenticatedData({ keyId, metadata });
    const cipher = createCipheriv(CIPHER, encryptionKey, nonce, { authTagLength: TAG_BYTES });
    cipher.setAAD(additionalAuthenticatedData, { plaintextLength: plaintextBytes.length });
    ciphertextUpdate = cipher.update(plaintextBytes);
    ciphertextFinal = cipher.final();
    ciphertext = Buffer.concat([ciphertextUpdate, ciphertextFinal]);
    authenticationTag = cipher.getAuthTag();
    const envelope = {
      authenticationTagBase64: authenticationTag.toString('base64'),
      cipher: CIPHER,
      ciphertextBase64: ciphertext.toString('base64'),
      claims: structuredClone(CLAIMS),
      keyId: validateKeyId(keyId),
      metadata,
      nonceBase64: nonce.toString('base64'),
      plaintextSha256: sha256(plaintextBytes),
      plaintextSizeBytes: plaintextBytes.length,
      publicationPolicy: structuredClone(PUBLICATION_POLICY),
      schemaVersion: PRIVATE_FULL_CANDIDATE_ENVELOPE_SCHEMA_VERSION,
    };
    envelopeBytes = canonicalLfBytes(envelope);
    requireValue(
      envelopeBytes.length <= MAX_PRIVATE_FULL_CANDIDATE_ENVELOPE_BYTES,
      'private handoff envelope exceeds the restricted transfer byte limit',
    );
    const createdEnvelope = Object.freeze({
      bytes: envelopeBytes,
      digest: sha256(envelopeBytes),
      metadata: Object.freeze(structuredClone(metadata)),
      plaintextDigest: envelope.plaintextSha256,
      plaintextSizeBytes: envelope.plaintextSizeBytes,
    });
    returnedEnvelope = true;
    return createdEnvelope;
  } finally {
    additionalAuthenticatedData?.fill(0);
    authenticationTag?.fill(0);
    ciphertext?.fill(0);
    ciphertextFinal?.fill(0);
    ciphertextUpdate?.fill(0);
    encryptionKey.fill(0);
    if (!returnedEnvelope) envelopeBytes?.fill(0);
    nonce?.fill(0);
    plaintextBytes?.fill(0);
  }
}

/**
 * Authenticate and decrypt one ciphertext-only producer handoff. The caller is
 * responsible for keeping the returned byte map inside the private verifier and
 * disposing it with disposePrivateFullCandidateHandoff(). JavaScript cannot
 * prove that immutable strings or VM/runtime copies have been erased.
 */
export function openPrivateFullCandidateHandoff({
  envelopeBytes,
  expectedKeyId,
  key,
  producerOutcomeSchemaBytes,
  verifiedProducerJob,
  ...unexpectedOptions
}) {
  requireValue(
    Object.keys(unexpectedOptions).length === 0,
    'private handoff open received unexpected or self-reported provenance options',
  );
  const expectedProvenance = verifiedSuccessfulProducerJobProvenance(
    verifiedProducerJob,
  );
  const bytes = toBufferView(envelopeBytes, 'private handoff envelope');
  requireValue(
    bytes.length > 0 && bytes.length <= MAX_PRIVATE_FULL_CANDIDATE_ENVELOPE_BYTES,
    'private handoff envelope size is outside policy',
  );
  const envelope = parseJsonRejectDuplicateKeys(bytes, 'private handoff envelope');
  exactKeys(envelope, ENVELOPE_KEYS, 'private handoff envelope');
  requireValue(
    equalsCanonicalLfBytesAndClear(bytes, envelope),
    'private handoff envelope is not canonical JSON with exactly one LF',
  );
  requireValue(
    envelope.schemaVersion === PRIVATE_FULL_CANDIDATE_ENVELOPE_SCHEMA_VERSION,
    'private handoff envelope schema version differs',
  );
  requireValue(envelope.cipher === CIPHER, 'private handoff cipher differs');
  requireValue(sameCanonical(envelope.claims, CLAIMS), 'private handoff claims are not all false');
  requireValue(
    sameCanonical(envelope.publicationPolicy, PUBLICATION_POLICY),
    'private handoff publication policy differs',
  );
  requireValue(validateKeyId(envelope.keyId) === validateKeyId(expectedKeyId), 'private handoff key ID differs');
  const metadata = validateMetadata(envelope.metadata);
  requireValue(
    metadata.workflowRunId === expectedProvenance.workflowRunId
      && metadata.runAttempt === expectedProvenance.runAttempt
      && metadata.sourceRevision === expectedProvenance.sourceRevision
      && metadata.jobId === expectedProvenance.jobId
      && metadata.model === expectedProvenance.model
      && metadata.modelId === expectedProvenance.modelId,
    'private handoff provenance differs from the independently validated successful producer job',
  );
  requireValue(
    Number.isSafeInteger(envelope.plaintextSizeBytes)
      && envelope.plaintextSizeBytes > 0
      && envelope.plaintextSizeBytes <= MAX_PLAINTEXT_BYTES,
    'private handoff plaintext size is outside policy',
  );
  requireValue(DIGEST_PATTERN.test(envelope.plaintextSha256), 'private handoff plaintext digest is invalid');
  let additionalAuthenticatedData;
  let authenticationTag;
  let ciphertext;
  let decryptionKey;
  let nonce;
  let plaintextFinal;
  let plaintextBytes;
  let plaintextUpdate;
  let decodedFiles;
  let producerScientificPayloadFiles;
  let returnedHandoff = false;
  try {
    nonce = decodeCanonicalBase64(
      envelope.nonceBase64,
      NONCE_BYTES,
      NONCE_BYTES,
      'private handoff nonce',
    );
    authenticationTag = decodeCanonicalBase64(
      envelope.authenticationTagBase64,
      TAG_BYTES,
      TAG_BYTES,
      'private handoff authentication tag',
    );
    ciphertext = decodeCanonicalBase64(
      envelope.ciphertextBase64,
      envelope.plaintextSizeBytes,
      envelope.plaintextSizeBytes,
      'private handoff ciphertext',
    );
    decryptionKey = copyKey(key);
    const decipher = createDecipheriv(CIPHER, decryptionKey, nonce, { authTagLength: TAG_BYTES });
    additionalAuthenticatedData = envelopeAdditionalAuthenticatedData({
      keyId: envelope.keyId,
      metadata,
    });
    decipher.setAAD(additionalAuthenticatedData, { plaintextLength: envelope.plaintextSizeBytes });
    decipher.setAuthTag(authenticationTag);
    try {
      plaintextUpdate = decipher.update(ciphertext);
      plaintextFinal = decipher.final();
      plaintextBytes = Buffer.concat([plaintextUpdate, plaintextFinal]);
    } catch (error) {
      throw new Error('private handoff authentication failed', { cause: error });
    }
    requireValue(
      plaintextBytes.length === envelope.plaintextSizeBytes
        && sha256(plaintextBytes) === envelope.plaintextSha256,
      'private handoff plaintext size or digest differs after authentication',
    );
    const handoff = parseJsonRejectDuplicateKeys(plaintextBytes, 'private handoff plaintext');
    exactKeys(handoff, HANDOFF_KEYS, 'private handoff plaintext');
    requireValue(
      equalsCanonicalLfBytesAndClear(plaintextBytes, handoff),
      'private handoff plaintext is not canonical JSON with exactly one LF',
    );
    requireValue(
      handoff.schemaVersion === PRIVATE_FULL_CANDIDATE_HANDOFF_SCHEMA_VERSION,
      'private handoff plaintext schema version differs',
    );
    requireValue(
      sameCanonical(handoff.metadata, metadata),
      'private handoff plaintext metadata differs from authenticated envelope metadata',
    );
    decodedFiles = decodeFileRecords(handoff.files);
    const validated = validateHandoffFiles(decodedFiles, metadata, producerOutcomeSchemaBytes);
    producerScientificPayloadFiles = new Map();
    for (const path of PRIVATE_FULL_CANDIDATE_SCIENTIFIC_PATHS) {
      if (!decodedFiles.has(path)) continue;
      producerScientificPayloadFiles.set(path, decodedFiles.get(path));
      decodedFiles.delete(path);
    }
    zeroByteMap(decodedFiles);
    decodedFiles = undefined;
    const openedHandoff = Object.freeze({
      bestEffortZeroizationOnly: true,
      metadata: Object.freeze(structuredClone(metadata)),
      outcome: structuredClone(validated.outcome),
      producerScientificPayloadFiles,
      plaintextDigest: envelope.plaintextSha256,
      plaintextSizeBytes: envelope.plaintextSizeBytes,
    });
    returnedHandoff = true;
    return openedHandoff;
  } finally {
    additionalAuthenticatedData?.fill(0);
    authenticationTag?.fill(0);
    ciphertext?.fill(0);
    decryptionKey?.fill(0);
    nonce?.fill(0);
    plaintextFinal?.fill(0);
    plaintextBytes?.fill(0);
    plaintextUpdate?.fill(0);
    if (decodedFiles) zeroByteMap(decodedFiles);
    if (!returnedHandoff && producerScientificPayloadFiles) {
      zeroByteMap(producerScientificPayloadFiles);
    }
  }
}

/**
 * Best-effort clearing for mutable byte buffers returned by open(). This cannot
 * erase strings or copies retained by the JavaScript engine or native runtime.
 */
export function disposePrivateFullCandidateHandoff(handoff) {
  const files = handoff?.producerScientificPayloadFiles;
  requireValue(files instanceof Map, 'private handoff disposal target is invalid');
  zeroByteMap(files);
}

function validateHandoffFiles(files, metadata, producerOutcomeSchemaBytes) {
  requireValue(files instanceof Map, 'private handoff files must be a Map of byte values');
  requireValue(
    files.size >= 1 && files.size <= 1 + PRIVATE_FULL_CANDIDATE_SCIENTIFIC_PATHS.length,
    'private handoff file count is outside policy',
  );
  const observedPaths = [...files.keys()];
  requireValue(
    observedPaths.every((path) => Object.hasOwn(FILE_LIMITS, path))
      && new Set(observedPaths).size === observedPaths.length,
    'private handoff contains an unknown or duplicate path',
  );
  requireValue(files.has(PRIVATE_FULL_CANDIDATE_OUTCOME_PATH), 'private handoff omits producer outcome');
  const fileRecords = observedPaths.sort(asciiCompare).map((path) => {
    const fileBytes = toBufferView(files.get(path), `private handoff file ${path}`);
    requireValue(
      fileBytes.length > 0 && fileBytes.length <= FILE_LIMITS[path],
      `private handoff file ${path} size is outside policy`,
    );
    return {
      bytesBase64: fileBytes.toString('base64'),
      path,
      sha256: sha256(fileBytes),
      sizeBytes: fileBytes.length,
    };
  });
  const outcomeBytes = toBufferView(files.get(PRIVATE_FULL_CANDIDATE_OUTCOME_PATH));
  const inspected = inspectFullCandidateProducerOutcomeBytes(
    outcomeBytes,
    producerOutcomeSchemaBytes,
  );
  requireValue(
    inspected.failures.length === 0,
    `private handoff producer outcome is invalid: ${inspected.failures.join('; ')}`,
  );
  const outcome = inspected.outcome;
  requireValue(
    outcome.status === 'complete',
    'private handoff requires a complete producer outcome from the successful model job',
  );
  requireValue(
    outcome.model === metadata.model
      && outcome.partitionId === metadata.partitionId
      && outcome.commitSha === metadata.sourceRevision
      && outcome.runId === metadata.workflowRunId
      && outcome.runAttempt === metadata.runAttempt,
    'private handoff producer outcome provenance differs from authenticated metadata',
  );
  const declaredScientificEvidence = scientificEvidenceRecords(outcome);
  const expectedPaths = [PRIVATE_FULL_CANDIDATE_OUTCOME_PATH, ...declaredScientificEvidence.keys()]
    .sort(asciiCompare);
  requireValue(
    sameCanonical(observedPaths, expectedPaths),
    'private handoff file set differs from producer-declared scientific evidence',
  );
  for (const [path, evidence] of declaredScientificEvidence) {
    const record = fileRecords.find((candidate) => candidate.path === path);
    requireValue(
      record?.sizeBytes === evidence.sizeBytes && record?.sha256 === evidence.sha256,
      `private handoff file ${path} differs from producer-declared size or digest`,
    );
  }
  return { fileRecords, outcome };
}

function scientificEvidenceRecords(outcome) {
  const evidence = outcome.evidence;
  const records = [
    evidence.predictions,
    evidence.structureManifest,
    ...evidence.control,
    ...evidence.partial,
    ...evidence.failure,
  ].filter((record) => record && PRIVATE_FULL_CANDIDATE_SCIENTIFIC_PATHS.includes(record.path));
  return new Map(records.map((record) => [record.path, record]));
}

function decodeFileRecords(records) {
  requireValue(Array.isArray(records) && records.length >= 1 && records.length <= 3, 'private handoff files array is outside policy');
  const files = new Map();
  let fileBytes;
  let previous = null;
  try {
    for (const [index, record] of records.entries()) {
      exactKeys(record, FILE_KEYS, `private handoff files[${index}]`);
      requireValue(
        typeof record.path === 'string'
          && Object.hasOwn(FILE_LIMITS, record.path)
          && (previous === null || previous < record.path)
          && !files.has(record.path),
        'private handoff file paths are not unique and strictly ASCII sorted',
      );
      requireValue(
        Number.isSafeInteger(record.sizeBytes)
          && record.sizeBytes > 0
          && record.sizeBytes <= FILE_LIMITS[record.path],
        `private handoff file ${record.path} declared size is outside policy`,
      );
      requireValue(DIGEST_PATTERN.test(record.sha256), `private handoff file ${record.path} digest is invalid`);
      fileBytes = decodeCanonicalBase64(
        record.bytesBase64,
        record.sizeBytes,
        record.sizeBytes,
        `private handoff file ${record.path}`,
      );
      requireValue(sha256(fileBytes) === record.sha256, `private handoff file ${record.path} digest differs`);
      files.set(record.path, fileBytes);
      fileBytes = undefined;
      previous = record.path;
    }
    return files;
  } catch (error) {
    fileBytes?.fill(0);
    zeroByteMap(files);
    throw error;
  }
}

function validateMetadata(value) {
  exactKeys(value, METADATA_KEYS, 'private handoff metadata');
  const spec = MODEL_SPECS[value.model];
  requireValue(
    spec
      && value.modelId === spec.modelId
      && value.partitionId === spec.partitionId,
    'private handoff model identity differs',
  );
  requireValue(REVISION_PATTERN.test(value.sourceRevision ?? ''), 'private handoff source revision is invalid');
  for (const key of ['workflowRunId', 'jobId']) {
    requireValue(Number.isSafeInteger(value[key]) && value[key] > 0, `private handoff ${key} is invalid`);
  }
  requireValue(value.runAttempt === 1, 'private handoff runAttempt must be exactly one');
  return Object.freeze({
    jobId: value.jobId,
    model: value.model,
    modelId: value.modelId,
    partitionId: value.partitionId,
    runAttempt: value.runAttempt,
    sourceRevision: value.sourceRevision,
    workflowRunId: value.workflowRunId,
  });
}

function envelopeAdditionalAuthenticatedData({ keyId, metadata }) {
  return Buffer.from(canonicalJson({
    cipher: CIPHER,
    claims: CLAIMS,
    keyId: validateKeyId(keyId),
    metadata,
    publicationPolicy: PUBLICATION_POLICY,
    schemaVersion: PRIVATE_FULL_CANDIDATE_ENVELOPE_SCHEMA_VERSION,
  }), 'ascii');
}

function copyKey(value) {
  requireValue(Buffer.isBuffer(value) || value instanceof Uint8Array, 'private handoff key must be bytes');
  const key = Buffer.from(value);
  try {
    requireValue(key.length === 32, 'private handoff key must contain exactly 32 bytes');
    return key;
  } catch (error) {
    key.fill(0);
    throw error;
  }
}

function validateKeyId(value) {
  requireValue(typeof value === 'string' && KEY_ID_PATTERN.test(value), 'private handoff key ID is invalid');
  return value;
}

function decodeCanonicalBase64(value, minimumBytes, maximumBytes, label) {
  requireValue(
    typeof value === 'string'
      && value.length > 0
      && /^[A-Za-z0-9+/]+={0,2}$/.test(value),
    `${label} is not canonical base64`,
  );
  const bytes = Buffer.from(value, 'base64');
  try {
    requireValue(
      bytes.toString('base64') === value
        && bytes.length >= minimumBytes
        && bytes.length <= maximumBytes,
      `${label} decoded size or canonical encoding differs`,
    );
    return bytes;
  } catch (error) {
    bytes.fill(0);
    throw error;
  }
}

function exactKeys(value, expected, label) {
  requireValue(isPlainObject(value), `${label} must be an object`);
  requireValue(
    sameCanonical(Object.keys(value).sort(asciiCompare), expected),
    `${label} keys differ from policy`,
  );
}

function canonicalLfBytes(value) {
  const encoded = `${canonicalJson(value)}\n`;
  requireValue(/^[\x00-\x7f]*$/.test(encoded), 'private handoff canonical form must be ASCII');
  return Buffer.from(encoded, 'ascii');
}

function equalsCanonicalLfBytesAndClear(bytes, value) {
  const expected = canonicalLfBytes(value);
  try {
    return bytes.equals(expected);
  } finally {
    expected.fill(0);
  }
}

function toBufferView(value, label = 'private handoff file') {
  if (Buffer.isBuffer(value)) return value;
  if (value instanceof Uint8Array) return Buffer.from(value.buffer, value.byteOffset, value.byteLength);
  throw new TypeError(`${label} must be supplied as bytes`);
}

function zeroByteMap(files) {
  for (const bytes of files.values()) {
    if (Buffer.isBuffer(bytes) || bytes instanceof Uint8Array) bytes.fill(0);
  }
  files.clear();
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function sameCanonical(left, right) {
  return canonicalJson(left) === canonicalJson(right);
}

function asciiCompare(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function requireValue(condition, message) {
  if (!condition) throw new Error(`private full-candidate handoff rejected: ${message}`);
}
