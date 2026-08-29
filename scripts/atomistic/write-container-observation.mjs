#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const CONTAINER_OBSERVATION_SCHEMA_VERSION = 'tf.atomistic-container-observation/0.2';
export const RUNTIME_INPUT_SCHEMA_VERSION = 'tf.atomistic-runtime-inputs/0.1';
export const RUNTIME_PLATFORM = 'linux/amd64';
export const EVIDENCE_CLASS = 'bootstrap-not-reproduced';
export const RUN_SPECIFIC_SEMANTICS = 'run-specific-diagnostics-not-promotion-trust-roots/v1';
export const STABLE_INPUT_SEMANTICS = 'stable-runtime-input-reference/v1';

const MODEL_IDS = Object.freeze({
  mattersim: 'mattersim-v1.0.0-5m',
  mace: 'mace-mpa-0-medium',
});
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const REVISION_PATTERN = /^[0-9a-f]{40}$/;
const LOCAL_LOAD_METADATA_KEYS = Object.freeze([
  'buildx.build.ref',
  'containerimage.config.digest',
  'containerimage.digest',
  'image.name',
]);
const MANIFEST_METADATA_KEYS = Object.freeze([
  'buildx.build.provenance',
  'buildx.build.ref',
  'buildx.build.warnings',
  'containerimage.config.digest',
  'containerimage.descriptor',
  'containerimage.digest',
  'image.name',
]);
const DESCRIPTOR_KEYS = Object.freeze(['annotations', 'digest', 'mediaType', 'size']);
const DESCRIPTOR_ANNOTATION_KEYS = Object.freeze(['config.digest', 'org.opencontainers.image.created']);
const MANIFEST_MEDIA_TYPES = new Set([
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
]);
const INSPECT_REQUIRED_KEYS = Object.freeze([
  'Architecture',
  'Config',
  'Created',
  'Id',
  'Os',
  'RepoDigests',
  'RepoTags',
  'RootFS',
]);
const INSPECT_ALLOWED_KEYS = Object.freeze([
  'Architecture',
  'Author',
  'Comment',
  'Config',
  'Created',
  'Descriptor',
  'DockerVersion',
  'GraphDriver',
  'Id',
  'Metadata',
  'Os',
  'OsVersion',
  'Parent',
  'RepoDigests',
  'RepoTags',
  'RootFS',
  'Size',
  'Variant',
  'VirtualSize',
]);
const CONFIG_ALLOWED_KEYS = Object.freeze([
  'ArgsEscaped',
  'AttachStderr',
  'AttachStdin',
  'AttachStdout',
  'Cmd',
  'Domainname',
  'Entrypoint',
  'Env',
  'ExposedPorts',
  'Healthcheck',
  'Hostname',
  'Image',
  'Labels',
  'MacAddress',
  'NetworkDisabled',
  'OnBuild',
  'OpenStdin',
  'Shell',
  'StdinOnce',
  'StopSignal',
  'StopTimeout',
  'Tty',
  'User',
  'Volumes',
  'WorkingDir',
]);
const CONFIG_STRING_KEYS = Object.freeze([
  'Domainname',
  'Hostname',
  'Image',
  'MacAddress',
  'StopSignal',
  'User',
  'WorkingDir',
]);
const CONFIG_BOOLEAN_KEYS = Object.freeze([
  'ArgsEscaped',
  'AttachStderr',
  'AttachStdin',
  'AttachStdout',
  'NetworkDisabled',
  'OpenStdin',
  'StdinOnce',
  'Tty',
]);
const CONFIG_STRING_ARRAY_KEYS = Object.freeze(['Cmd', 'Entrypoint', 'Env', 'OnBuild', 'Shell']);
const HEALTHCHECK_ALLOWED_KEYS = Object.freeze(['Interval', 'Retries', 'StartInterval', 'StartPeriod', 'Test', 'Timeout']);
const ROOTFS_KEYS = Object.freeze(['Layers', 'Type']);
const RUNTIME_INPUT_KEYS = Object.freeze([
  'baseImage',
  'buildInputs',
  'dockerfileFrontend',
  'model',
  'modelId',
  'platform',
  'policy',
  'runtimeSource',
  'schemaVersion',
  'scientificPlan',
]);
const RUNTIME_SOURCE_KEYS = Object.freeze(['revision', 'sourceDateEpoch']);
const MAX_INPUT_BYTES = Object.freeze({
  runtimeInputManifest: 100_000_000,
  buildxMetadata: 5_000_000,
  imageInspect: 20_000_000,
  buildxVersion: 65_536,
  dockerServerVersion: 65_536,
  output: 20_000_000,
});

/** Return compact recursive-key-sorted JSON plus no implicit newline. */
export function canonicalJson(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map((entry) => canonicalJson(entry)).join(',')}]`;
  if (isPlainObject(value)) {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  if (typeof value === 'number' && !Number.isFinite(value)) throw new TypeError('canonical JSON forbids non-finite numbers');
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError('canonical JSON contains an unsupported value');
  return encoded;
}

export function canonicalJsonBytes(value) {
  return Buffer.from(`${canonicalJson(value)}\n`, 'utf8');
}

export function sha256(value) {
  return `sha256:${createHash('sha256').update(value).digest('hex')}`;
}

/** Parse strict UTF-8 JSON while rejecting duplicate decoded object keys. */
export function parseJsonRejectDuplicateKeys(bytes, label = 'JSON input') {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) throw new TypeError(`${label} must be bytes`);
  let source;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new SyntaxError(`${label} is not strict UTF-8 JSON`, { cause: error });
  }
  let position = 0;
  const fail = (message) => { throw new SyntaxError(`${label}: ${message} at character ${position}`); };
  const skipWhitespace = () => {
    while (position < source.length && /[\u0009\u000a\u000d\u0020]/.test(source[position])) position += 1;
  };
  const parseString = () => {
    if (source[position] !== '"') fail('expected JSON string');
    const start = position;
    position += 1;
    while (position < source.length) {
      const code = source.charCodeAt(position);
      if (source[position] === '"') {
        position += 1;
        return JSON.parse(source.slice(start, position));
      }
      if (source[position] === '\\') {
        position += 1;
        const escape = source[position];
        if (!'"\\/bfnrtu'.includes(escape ?? '')) fail('invalid JSON string escape');
        if (escape === 'u') {
          if (!/^[0-9a-fA-F]{4}$/.test(source.slice(position + 1, position + 5))) fail('invalid JSON unicode escape');
          position += 5;
        } else position += 1;
        continue;
      }
      if (code < 0x20) fail('unescaped control character in JSON string');
      position += 1;
    }
    fail('unterminated JSON string');
  };
  const parseValue = (depth = 0) => {
    if (depth > 256) fail('JSON nesting exceeds 256 levels');
    skipWhitespace();
    if (source[position] === '{') {
      position += 1;
      skipWhitespace();
      const keys = new Set();
      if (source[position] === '}') {
        position += 1;
        return;
      }
      while (position < source.length) {
        const key = parseString();
        if (keys.has(key)) throw new SyntaxError(`${label}: duplicate JSON key ${JSON.stringify(key)} at character ${position}`);
        keys.add(key);
        skipWhitespace();
        if (source[position] !== ':') fail('expected colon after JSON object key');
        position += 1;
        parseValue(depth + 1);
        skipWhitespace();
        if (source[position] === '}') {
          position += 1;
          return;
        }
        if (source[position] !== ',') fail('expected comma or closing brace');
        position += 1;
        skipWhitespace();
      }
      fail('unterminated JSON object');
    }
    if (source[position] === '[') {
      position += 1;
      skipWhitespace();
      if (source[position] === ']') {
        position += 1;
        return;
      }
      while (position < source.length) {
        parseValue(depth + 1);
        skipWhitespace();
        if (source[position] === ']') {
          position += 1;
          return;
        }
        if (source[position] !== ',') fail('expected comma or closing bracket');
        position += 1;
      }
      fail('unterminated JSON array');
    }
    if (source[position] === '"') {
      parseString();
      return;
    }
    for (const literal of ['true', 'false', 'null']) {
      if (source.startsWith(literal, position)) {
        position += literal.length;
        return;
      }
    }
    const number = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?/.exec(source.slice(position));
    if (number) {
      position += number[0].length;
      return;
    }
    fail('expected JSON value');
  };
  parseValue();
  skipWhitespace();
  if (position !== source.length) fail('unexpected trailing JSON content');
  return JSON.parse(source);
}

/**
 * Validate and project run-local Docker evidence without promoting either OCI
 * digest to a cross-run identity. All raw inputs are byte-bound in the output.
 */
export function buildContainerObservation({
  model,
  runtimeSourceRevision,
  workflowRevision,
  sourceDateEpoch,
  runtimeInputManifestBytes,
  buildxMetadataBytes,
  imageInspectBytes,
  buildxVersionBytes,
  dockerServerVersionBytes,
}) {
  requireModel(model);
  const runtimeRevision = requireRevision(runtimeSourceRevision, 'runtimeSourceRevision');
  const executionRevision = requireRevision(workflowRevision, 'workflowRevision');
  const epoch = requireSourceDateEpoch(sourceDateEpoch);
  for (const [label, bytes] of [
    ['runtime-input manifest', runtimeInputManifestBytes],
    ['Buildx metadata', buildxMetadataBytes],
    ['Docker image inspect', imageInspectBytes],
    ['Buildx version', buildxVersionBytes],
    ['Docker server version', dockerServerVersionBytes],
  ]) requireNonemptyBytes(bytes, label);

  const runtimeInput = parseJsonRejectDuplicateKeys(runtimeInputManifestBytes, 'runtime-input manifest');
  validateRuntimeInputManifest(runtimeInput, runtimeInputManifestBytes, model, runtimeRevision, epoch);
  const metadata = parseJsonRejectDuplicateKeys(buildxMetadataBytes, 'Buildx metadata');
  const metadataClaims = validateBuildxMetadata(metadata, epoch, model, executionRevision);
  const inspectArray = parseJsonRejectDuplicateKeys(imageInspectBytes, 'Docker image inspect');
  const inspectClaims = validateImageInspect(inspectArray, metadataClaims, model, executionRevision, runtimeRevision, epoch);
  const buildxVersion = requireVersionText(buildxVersionBytes, 'Buildx version', { mustMentionBuildx: true });
  const dockerServerVersion = requireVersionText(dockerServerVersionBytes, 'Docker server version', { dockerServer: true });

  const observation = {
    schemaVersion: CONTAINER_OBSERVATION_SCHEMA_VERSION,
    model,
    platform: RUNTIME_PLATFORM,
    runtimeSourceRevision: runtimeRevision,
    workflowRevision: executionRevision,
    sourceDateEpoch: epoch,
    stableInputReference: {
      runtimeInputManifestDigest: sha256(runtimeInputManifestBytes),
      semantics: STABLE_INPUT_SEMANTICS,
    },
    runSpecificObservations: {
      semantics: RUN_SPECIFIC_SEMANTICS,
      configImageId: {
        digest: metadataClaims.configDigest,
        semantics: RUN_SPECIFIC_SEMANTICS,
      },
      exporterDigest: {
        digest: metadataClaims.exporterDigest,
        kind: metadataClaims.exporterDigestKind,
        semantics: RUN_SPECIFIC_SEMANTICS,
      },
      metadataProfile: metadataClaims.metadataProfile,
      manifestDescriptor: metadataClaims.manifestDescriptor,
      created: inspectClaims.created,
      rootfsDiffIds: inspectClaims.diffIds,
      buildReference: metadataClaims.buildReference,
      imageName: metadataClaims.imageName,
      buildxVersion,
      dockerServerVersion,
      registryPushClaim: false,
      sourceEvidence: {
        buildxMetadataDigest: sha256(buildxMetadataBytes),
        imageInspectDigest: sha256(imageInspectBytes),
        buildxVersionDigest: sha256(buildxVersionBytes),
        dockerServerVersionDigest: sha256(dockerServerVersionBytes),
      },
    },
    claims: {
      evidenceClass: EVIDENCE_CLASS,
      promotionEligible: false,
      comparable: false,
      reproduced: false,
    },
  };
  const bytes = canonicalJsonBytes(observation);
  return { observation, bytes, fileDigest: sha256(bytes) };
}

export async function runCli(argv = process.argv.slice(2)) {
  const { mode, options } = parseCli(argv);
  const expectedOutputName = `${options.model}.container-observation.json`;
  if (path.basename(options.output) !== expectedOutputName) {
    throw new TypeError(`--output must name ${expectedOutputName}`);
  }
  const entries = await Promise.all([
    readSafeRegularFile(options.runtimeInputManifest, 'runtime-input manifest', MAX_INPUT_BYTES.runtimeInputManifest),
    readSafeRegularFile(options.buildxMetadata, 'Buildx metadata', MAX_INPUT_BYTES.buildxMetadata),
    readSafeRegularFile(options.imageInspect, 'Docker image inspect', MAX_INPUT_BYTES.imageInspect),
    readSafeRegularFile(options.buildxVersion, 'Buildx version', MAX_INPUT_BYTES.buildxVersion),
    readSafeRegularFile(options.dockerServerVersion, 'Docker server version', MAX_INPUT_BYTES.dockerServerVersion),
  ]);
  requireDistinctFiles(entries);
  const result = buildContainerObservation({
    model: options.model,
    runtimeSourceRevision: options.runtimeSourceRevision,
    workflowRevision: options.workflowRevision,
    sourceDateEpoch: options.sourceDateEpoch,
    runtimeInputManifestBytes: entries[0].bytes,
    buildxMetadataBytes: entries[1].bytes,
    imageInspectBytes: entries[2].bytes,
    buildxVersionBytes: entries[3].bytes,
    dockerServerVersionBytes: entries[4].bytes,
  });
  if (mode === 'write-new') {
    await writeNewFile(options.output, result.bytes);
  } else {
    const output = await readSafeRegularFile(options.output, 'container observation', MAX_INPUT_BYTES.output);
    requireDistinctFiles([...entries, output]);
    parseJsonRejectDuplicateKeys(output.bytes, 'container observation');
    if (!output.bytes.equals(result.bytes)) {
      throw new Error(`container observation differs from the exact canonical contract (expected ${result.fileDigest}, found ${sha256(output.bytes)})`);
    }
  }
  process.stdout.write(canonicalJsonBytes({ fileDigest: result.fileDigest, model: options.model }));
  return result;
}

function validateRuntimeInputManifest(manifest, rawBytes, model, revision, epoch) {
  requireExactKeys(manifest, RUNTIME_INPUT_KEYS, 'runtime-input manifest');
  if (manifest.schemaVersion !== RUNTIME_INPUT_SCHEMA_VERSION) throw new TypeError('runtime-input manifest schemaVersion is unsupported');
  if (manifest.model !== model || manifest.modelId !== MODEL_IDS[model]) throw new TypeError('runtime-input manifest model identity differs from the selected model');
  if (manifest.platform !== RUNTIME_PLATFORM) throw new TypeError(`runtime-input manifest platform must be ${RUNTIME_PLATFORM}`);
  requireExactKeys(manifest.runtimeSource, RUNTIME_SOURCE_KEYS, 'runtime-input manifest runtimeSource');
  if (manifest.runtimeSource.revision !== revision) throw new TypeError('runtime-input manifest revision differs from the protected runtime source revision');
  if (manifest.runtimeSource.sourceDateEpoch !== epoch) throw new TypeError('runtime-input manifest sourceDateEpoch differs from the selected epoch');
  requireJsonTree(manifest.scientificPlan, 'runtime-input manifest scientificPlan');
  requireJsonTree(manifest.baseImage, 'runtime-input manifest baseImage');
  requireJsonTree(manifest.buildInputs, 'runtime-input manifest buildInputs');
  requireAllDigestClaims(manifest, 'runtime-input manifest');
  requireExactKeys(manifest.dockerfileFrontend, ['manifestDigest', 'reference'], 'runtime-input manifest dockerfileFrontend');
  requireBoundedString(manifest.dockerfileFrontend.reference, 'runtime-input manifest dockerfileFrontend.reference');
  const frontendDigest = requireDigest(manifest.dockerfileFrontend.manifestDigest, 'runtime-input manifest dockerfileFrontend.manifestDigest');
  if (!manifest.dockerfileFrontend.reference.endsWith(`@${frontendDigest}`)) {
    throw new TypeError('runtime-input manifest Dockerfile frontend reference differs from its manifest digest');
  }
  const expectedPolicy = {
    build: {
      cache: 'disabled',
      dependencySource: 'verified-local-wheelhouse-only',
      network: 'none',
      pull: false,
      provenance: 'disabled',
      sbom: 'disabled',
    },
    runtime: { capabilities: 'drop-all', network: 'none', noNewPrivileges: true, rootFilesystem: 'read-only', user: '65532:65532' },
  };
  if (canonicalJson(manifest.policy) !== canonicalJson(expectedPolicy)) throw new TypeError('runtime-input manifest policy differs from the reviewed offline build/runtime policy');
  const canonical = canonicalJsonBytes(manifest);
  if (!Buffer.from(rawBytes).equals(canonical)) throw new TypeError('runtime-input manifest must use exact canonical JSON plus one LF');
}

function validateBuildxMetadata(metadata, epoch, model, workflowRevision) {
  if (!isPlainObject(metadata)) throw new TypeError('Buildx metadata must be one JSON object');
  const metadataKeys = Object.keys(metadata).sort();
  const localLoadProfile = sameStringSet(metadataKeys, LOCAL_LOAD_METADATA_KEYS);
  const manifestProfile = sameStringSet(metadataKeys, MANIFEST_METADATA_KEYS);
  if (!localLoadProfile && !manifestProfile) throw new TypeError('Buildx metadata has an unexpected claim surface');
  const buildReference = requireBoundedString(metadata['buildx.build.ref'], 'Buildx build reference');
  const configDigest = requireDigest(metadata['containerimage.config.digest'], 'Buildx config digest');
  const exporterDigest = requireDigest(metadata['containerimage.digest'], 'Buildx exporter digest');
  const expectedImageName = `docker.io/library/tailing-atomistic-${model}-bootstrap:${workflowRevision}`;
  const imageName = requireBoundedString(metadata['image.name'], 'Buildx image name');
  if (imageName !== expectedImageName) throw new TypeError(`Buildx image name must be exactly ${expectedImageName}`);

  if (localLoadProfile) {
    if (exporterDigest !== configDigest) {
      throw new TypeError('Descriptor-free Docker exporter digest must equal the config image ID');
    }
    return {
      buildReference,
      configDigest,
      exporterDigest,
      exporterDigestKind: 'docker-image-config-alias',
      imageName,
      metadataProfile: 'docker-local-load',
      manifestDescriptor: null,
      created: null,
    };
  }

  if (!isEmptyObject(metadata['buildx.build.provenance'])) {
    throw new TypeError('Buildx metadata provenance must be an empty object for the manifest profile');
  }
  if (!isEmptyObject(metadata['buildx.build.warnings'])) {
    throw new TypeError('Buildx metadata warnings must be an empty object for the manifest profile');
  }
  requireExactKeys(metadata['containerimage.descriptor'], DESCRIPTOR_KEYS, 'Buildx manifest descriptor');
  const descriptor = metadata['containerimage.descriptor'];
  if (requireDigest(descriptor.digest, 'Buildx descriptor digest') !== exporterDigest) {
    throw new TypeError('Buildx exporter digest differs from its descriptor digest');
  }
  if (!MANIFEST_MEDIA_TYPES.has(descriptor.mediaType)) throw new TypeError('Buildx descriptor mediaType is not an allowlisted single-image manifest type');
  const sizeBytes = requireSafeInteger(descriptor.size, 'Buildx descriptor size', { positive: true });
  requireExactKeys(descriptor.annotations, DESCRIPTOR_ANNOTATION_KEYS, 'Buildx descriptor annotations');
  if (requireDigest(descriptor.annotations['config.digest'], 'Buildx descriptor config annotation') !== configDigest) {
    throw new TypeError('Buildx config digest differs from its descriptor annotation');
  }
  requireEpochTimestamp(descriptor.annotations['org.opencontainers.image.created'], epoch, 'Buildx descriptor created annotation');
  return {
    buildReference,
    configDigest,
    exporterDigest,
    exporterDigestKind: 'single-image-manifest',
    imageName,
    metadataProfile: 'single-image-manifest',
    manifestDescriptor: { mediaType: descriptor.mediaType, sizeBytes },
    created: descriptor.annotations['org.opencontainers.image.created'],
  };
}

function validateImageInspect(value, metadata, model, workflowRevision, runtimeRevision, epoch) {
  if (!Array.isArray(value) || value.length !== 1) throw new TypeError('Docker image inspect must contain exactly one image object');
  const inspect = value[0];
  requireAllowedKeys(inspect, INSPECT_ALLOWED_KEYS, INSPECT_REQUIRED_KEYS, 'Docker image inspect object');
  if (inspect.Os !== 'linux' || inspect.Architecture !== 'amd64') throw new TypeError('Docker image inspect platform must be exactly linux/amd64');
  if (Object.hasOwn(inspect, 'Variant') && inspect.Variant !== '' && inspect.Variant !== null) throw new TypeError('Docker image inspect must not declare a nonempty architecture variant');
  if (requireDigest(inspect.Id, 'Docker image inspect Id') !== metadata.configDigest) {
    throw new TypeError('Docker image inspect Id differs from Buildx containerimage.config.digest');
  }
  const created = requireEpochTimestamp(inspect.Created, epoch, 'Docker image inspect Created');
  if (metadata.created !== null) requireEpochTimestamp(metadata.created, epoch, 'Buildx descriptor created annotation');
  validateRegistryFields(inspect, model, workflowRevision);
  validateOptionalInspectClaims(inspect, metadata);
  validateConfig(inspect.Config, runtimeRevision);
  const diffIds = validateRootFS(inspect.RootFS);
  return { created, diffIds };
}

function validateRegistryFields(inspect, model, workflowRevision) {
  const tags = requireStringArray(inspect.RepoTags, 'Docker image inspect RepoTags', { allowEmpty: false, allowNull: false });
  const expectedTag = `tailing-atomistic-${model}-bootstrap:${workflowRevision}`;
  if (tags.length !== 1 || tags[0] !== expectedTag) throw new TypeError(`Docker image inspect RepoTags must contain only ${expectedTag}`);
  const repoDigests = requireStringArray(inspect.RepoDigests, 'Docker image inspect RepoDigests', { allowEmpty: true, allowNull: false });
  if (repoDigests.length !== 0) throw new TypeError('Docker image inspect must not carry a registry digest or registry-push claim');
}

function validateOptionalInspectClaims(inspect, metadata) {
  for (const key of ['Author', 'Comment', 'DockerVersion', 'OsVersion', 'Parent']) {
    if (Object.hasOwn(inspect, key)) requireNullableBoundedString(inspect[key], `Docker image inspect ${key}`);
  }
  for (const key of ['Size', 'VirtualSize']) {
    if (Object.hasOwn(inspect, key)) requireSafeInteger(inspect[key], `Docker image inspect ${key}`);
  }
  if (Object.hasOwn(inspect, 'GraphDriver')) {
    requireExactKeys(inspect.GraphDriver, ['Data', 'Name'], 'Docker image inspect GraphDriver');
    requireBoundedString(inspect.GraphDriver.Name, 'Docker image inspect GraphDriver.Name');
    if (!isPlainObject(inspect.GraphDriver.Data)) throw new TypeError('Docker image inspect GraphDriver.Data must be one object');
    for (const [key, value] of Object.entries(inspect.GraphDriver.Data)) {
      requireBoundedString(key, 'Docker image inspect GraphDriver.Data key');
      requireBoundedString(value, `Docker image inspect GraphDriver.Data.${key}`);
    }
  }
  if (Object.hasOwn(inspect, 'Metadata')) {
    requireExactKeys(inspect.Metadata, ['LastTagTime'], 'Docker image inspect Metadata');
    requireNullableBoundedString(inspect.Metadata.LastTagTime, 'Docker image inspect Metadata.LastTagTime');
  }
  if (metadata.metadataProfile === 'docker-local-load') {
    if (Object.hasOwn(inspect, 'Descriptor')) throw new TypeError('Docker local-load image inspect must not contain Descriptor');
  } else {
    if (metadata.metadataProfile !== 'single-image-manifest' || !Object.hasOwn(inspect, 'Descriptor') || inspect.Descriptor === null) {
      throw new TypeError('Docker manifest-profile image inspect Descriptor must be one object');
    }
    requireExactKeys(inspect.Descriptor, ['annotations', 'digest', 'mediaType', 'size'], 'Docker image inspect Descriptor');
    if (requireDigest(inspect.Descriptor.digest, 'Docker image inspect Descriptor.digest') !== metadata.exporterDigest) {
      throw new TypeError('Docker image inspect descriptor digest differs from Buildx exporter digest');
    }
    if (inspect.Descriptor.mediaType !== metadata.manifestDescriptor.mediaType
        || inspect.Descriptor.size !== metadata.manifestDescriptor.sizeBytes) {
      throw new TypeError('Docker image inspect descriptor differs from the Buildx manifest descriptor');
    }
    requireExactKeys(inspect.Descriptor.annotations, DESCRIPTOR_ANNOTATION_KEYS, 'Docker image inspect Descriptor.annotations');
    if (requireDigest(inspect.Descriptor.annotations['config.digest'], 'Docker image inspect Descriptor config annotation') !== metadata.configDigest) {
      throw new TypeError('Docker image inspect descriptor config annotation differs from Buildx config digest');
    }
    if (inspect.Descriptor.annotations['org.opencontainers.image.created'] !== metadata.created) {
      throw new TypeError('Docker image inspect descriptor created annotation differs from Buildx metadata');
    }
  }
}

function validateConfig(config, revision) {
  requireAllowedKeys(config, CONFIG_ALLOWED_KEYS, ['Labels'], 'Docker image inspect Config');
  for (const key of CONFIG_STRING_KEYS) {
    if (Object.hasOwn(config, key)) requireNullableBoundedString(config[key], `Docker image inspect Config.${key}`);
  }
  for (const key of CONFIG_BOOLEAN_KEYS) {
    if (Object.hasOwn(config, key) && typeof config[key] !== 'boolean') throw new TypeError(`Docker image inspect Config.${key} must be a boolean`);
  }
  for (const key of CONFIG_STRING_ARRAY_KEYS) {
    if (Object.hasOwn(config, key)) requireStringArray(config[key], `Docker image inspect Config.${key}`, { allowEmpty: true, allowNull: true });
  }
  for (const key of ['ExposedPorts', 'Volumes']) {
    if (!Object.hasOwn(config, key) || config[key] === null) continue;
    if (!isPlainObject(config[key])) throw new TypeError(`Docker image inspect Config.${key} must be null or one object`);
    for (const [entry, claim] of Object.entries(config[key])) {
      requireBoundedString(entry, `Docker image inspect Config.${key} key`);
      if (!isEmptyObject(claim)) throw new TypeError(`Docker image inspect Config.${key}.${entry} must be an empty object`);
    }
  }
  if (Object.hasOwn(config, 'StopTimeout') && config.StopTimeout !== null) requireSafeInteger(config.StopTimeout, 'Docker image inspect Config.StopTimeout');
  if (Object.hasOwn(config, 'Healthcheck') && config.Healthcheck !== null) validateHealthcheck(config.Healthcheck);
  requireExactKeys(config.Labels, ['org.opencontainers.image.revision', 'org.tailing-future.evidence-class'], 'Docker image inspect Config.Labels');
  if (config.Labels['org.opencontainers.image.revision'] !== revision) throw new TypeError('Docker image revision label differs from the protected runtime source revision');
  if (config.Labels['org.tailing-future.evidence-class'] !== EVIDENCE_CLASS) throw new TypeError(`Docker image evidence label must be exactly ${EVIDENCE_CLASS}`);
}

function validateHealthcheck(healthcheck) {
  requireAllowedKeys(healthcheck, HEALTHCHECK_ALLOWED_KEYS, ['Test'], 'Docker image inspect Config.Healthcheck');
  requireStringArray(healthcheck.Test, 'Docker image inspect Config.Healthcheck.Test', { allowEmpty: false, allowNull: false });
  for (const key of ['Interval', 'Retries', 'StartInterval', 'StartPeriod', 'Timeout']) {
    if (Object.hasOwn(healthcheck, key)) requireSafeInteger(healthcheck[key], `Docker image inspect Config.Healthcheck.${key}`);
  }
}

function validateRootFS(rootfs) {
  requireExactKeys(rootfs, ROOTFS_KEYS, 'Docker image inspect RootFS');
  if (rootfs.Type !== 'layers') throw new TypeError('Docker image inspect RootFS.Type must be exactly layers');
  if (!Array.isArray(rootfs.Layers) || rootfs.Layers.length === 0 || rootfs.Layers.length > 65_536) {
    throw new TypeError('Docker image inspect RootFS.Layers must be one bounded nonempty array of DiffIDs');
  }
  return rootfs.Layers.map((entry, index) => requireDigest(entry, `Docker image inspect RootFS DiffID[${index}]`));
}

function requireEpochTimestamp(value, epoch, label) {
  if (typeof value !== 'string' || value.length > 64) throw new TypeError(`${label} must be one bounded RFC3339 UTC timestamp`);
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?Z$/.exec(value);
  if (!match) throw new TypeError(`${label} must be one RFC3339 UTC timestamp`);
  const fraction = match[7] ?? '';
  if (fraction && !/^0+$/.test(fraction)) throw new TypeError(`${label} must represent an exact whole second`);
  const parsedMilliseconds = Date.parse(value);
  if (!Number.isFinite(parsedMilliseconds) || parsedMilliseconds !== epoch * 1000) throw new TypeError(`${label} differs from sourceDateEpoch`);
  const canonicalSecond = new Date(parsedMilliseconds).toISOString().replace('.000Z', 'Z');
  const statedSecond = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}Z`;
  if (canonicalSecond !== statedSecond) throw new TypeError(`${label} is not a valid calendar timestamp`);
  return value;
}

function requireAllDigestClaims(value, label, depth = 0) {
  if (depth > 64) throw new TypeError(`${label} exceeds the supported nesting depth`);
  if (Array.isArray(value)) {
    for (const entry of value) requireAllDigestClaims(entry, label, depth + 1);
    return;
  }
  if (!isPlainObject(value)) return;
  for (const [key, entry] of Object.entries(value)) {
    if (/(?:digest|sha256)$/i.test(key)) requireDigest(entry, `${label}.${key}`);
    else requireAllDigestClaims(entry, label, depth + 1);
  }
}

function requireVersionText(bytes, label, { mustMentionBuildx = false, dockerServer = false } = {}) {
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new TypeError(`${label} is not strict UTF-8`, { cause: error });
  }
  if (!text.endsWith('\n') || text.includes('\r') || text.includes('\0') || text.slice(0, -1).includes('\n')) {
    throw new TypeError(`${label} must be exactly one LF-terminated line`);
  }
  const value = text.slice(0, -1);
  if (value.length === 0 || value.length > 16_384 || !/^[\u0020-\u007e]+$/.test(value)) throw new TypeError(`${label} must be one bounded printable ASCII line`);
  if (mustMentionBuildx && !/buildx/i.test(value)) throw new TypeError(`${label} must identify Docker Buildx`);
  if (dockerServer && !/^[0-9]+(?:\.[0-9]+){1,3}(?:[-+][A-Za-z0-9._-]+)?$/.test(value)) throw new TypeError(`${label} must be one explicit Docker server version`);
  return value;
}

function requireJsonTree(value, label, depth = 0) {
  if (depth > 64) throw new TypeError(`${label} exceeds the supported nesting depth`);
  if (value === null || typeof value === 'boolean') return;
  if (typeof value === 'string') {
    requireBoundedString(value, label);
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${label} contains a non-finite number`);
    return;
  }
  if (Array.isArray(value)) {
    if (value.length > 100_000) throw new TypeError(`${label} contains an oversized array`);
    for (const entry of value) requireJsonTree(entry, label, depth + 1);
    return;
  }
  if (isPlainObject(value)) {
    if (Object.keys(value).length > 100_000) throw new TypeError(`${label} contains an oversized object`);
    for (const [key, entry] of Object.entries(value)) {
      requireBoundedString(key, `${label} key`);
      requireJsonTree(entry, label, depth + 1);
    }
    return;
  }
  throw new TypeError(`${label} contains a non-JSON value`);
}

function requireExactKeys(value, expected, label, { optional = [] } = {}) {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be one JSON object`);
  const optionalSet = new Set(optional);
  const required = expected.filter((key) => !optionalSet.has(key));
  const actual = Object.keys(value).sort();
  const allowed = [...expected].sort();
  if (actual.some((key) => !allowed.includes(key)) || required.some((key) => !Object.hasOwn(value, key))) {
    throw new TypeError(`${label} has an unexpected claim surface`);
  }
}

function requireAllowedKeys(value, allowedKeys, requiredKeys, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be one JSON object`);
  const allowed = new Set(allowedKeys);
  const unexpected = Object.keys(value).filter((key) => !allowed.has(key));
  const missing = requiredKeys.filter((key) => !Object.hasOwn(value, key));
  if (unexpected.length > 0 || missing.length > 0) throw new TypeError(`${label} has an unexpected claim surface`);
}

function requireStringArray(value, label, { allowEmpty = false, allowNull = false } = {}) {
  if (value === null && allowNull) return null;
  if (!Array.isArray(value) || value.length > 65_536 || (!allowEmpty && value.length === 0)) {
    throw new TypeError(`${label} must be ${allowEmpty ? 'a bounded' : 'a bounded nonempty'} string array${allowNull ? ' or null' : ''}`);
  }
  return value.map((entry, index) => requireBoundedString(entry, `${label}[${index}]`));
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) throw new TypeError(`${label} must be a lowercase sha256 digest`);
  return value;
}

function requireRevision(value, label) {
  if (typeof value !== 'string' || !REVISION_PATTERN.test(value)) throw new TypeError(`${label} must be a full lowercase 40-hex Git revision`);
  return value;
}

function requireSourceDateEpoch(value) {
  const raw = typeof value === 'number' ? String(value) : value;
  if (typeof raw !== 'string' || !/^(?:0|[1-9][0-9]{0,11})$/.test(raw)) throw new TypeError('sourceDateEpoch must be one canonical non-negative integer');
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed > 253_402_300_799) throw new TypeError('sourceDateEpoch is outside the supported Unix timestamp range');
  return parsed;
}

function requireModel(value) {
  if (!Object.hasOwn(MODEL_IDS, value)) throw new TypeError('model must be exactly mattersim or mace');
}

function requireSafeInteger(value, label, { positive = false } = {}) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) throw new TypeError(`${label} must be a ${positive ? 'positive' : 'non-negative'} safe integer`);
  return value;
}

function requireBoundedString(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 16_384 || /[\u0000-\u001f\u007f]/.test(value)) {
    throw new TypeError(`${label} must be one bounded control-free string`);
  }
  return value;
}

function requireNullableBoundedString(value, label) {
  if (value === null) return null;
  if (value === '') return value;
  return requireBoundedString(value, label);
}

function requireNonemptyBytes(value, label) {
  if ((!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) || value.length === 0) throw new TypeError(`${label} must be nonempty bytes`);
}

function isEmptyObject(value) {
  return isPlainObject(value) && Object.keys(value).length === 0;
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function sameStringSet(actual, expected) {
  const sortedExpected = [...expected].sort();
  return actual.length === expected.length
    && actual.every((value, index) => value === sortedExpected[index]);
}

function requireLexicallyCanonicalPath(filename, label) {
  if (typeof filename !== 'string' || filename.length === 0 || filename.includes('\0')) throw new TypeError(`${label} path must be a nonempty string`);
  if (path.normalize(filename) !== filename || filename.split(path.sep).some((part) => part === '.' || part === '..')) {
    throw new TypeError(`${label} path aliases are forbidden; use one lexically canonical path`);
  }
  return path.resolve(filename);
}

async function readSafeRegularFile(filename, label, maxBytes) {
  const absolute = requireLexicallyCanonicalPath(filename, label);
  let canonical;
  try {
    canonical = await realpath(absolute);
  } catch (error) {
    throw new TypeError(`${label} must resolve to one existing regular file`, { cause: error });
  }
  if (canonical !== absolute) throw new TypeError(`${label} path must be canonical and must not traverse a symlink`);
  const before = await lstat(absolute, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size < 1n || before.size > BigInt(maxBytes)) {
    throw new TypeError(`${label} must be one bounded, single-link regular file`);
  }
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  const handle = await open(absolute, flags);
  try {
    const bytes = await readAtMost(handle, maxBytes, label);
    const after = await handle.stat({ bigint: true });
    let afterCanonical;
    let afterPath;
    try {
      afterCanonical = await realpath(absolute);
      afterPath = await lstat(absolute, { bigint: true });
    } catch (error) {
      throw new Error(`${label} path changed during verification`, { cause: error });
    }
    if (afterCanonical !== absolute || !afterPath.isFile() || afterPath.isSymbolicLink() || afterPath.nlink !== 1n
        || before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size
        || before.mode !== after.mode || before.mtimeNs !== after.mtimeNs || before.ctimeNs !== after.ctimeNs
        || afterPath.dev !== after.dev || afterPath.ino !== after.ino || afterPath.size !== after.size
        || afterPath.mode !== after.mode || afterPath.mtimeNs !== after.mtimeNs || afterPath.ctimeNs !== after.ctimeNs
        || BigInt(bytes.length) !== after.size) {
      throw new Error(`${label} changed during verification`);
    }
    return { absolute, bytes, dev: after.dev, ino: after.ino };
  } finally {
    await handle.close();
  }
}

export async function readAtMost(handle, maxBytes, label) {
  const chunks = [];
  let total = 0;
  while (total <= maxBytes) {
    const remaining = Math.min(64 * 1024, maxBytes + 1 - total);
    if (remaining <= 0) break;
    const buffer = Buffer.allocUnsafe(remaining);
    const { bytesRead } = await handle.read(buffer, 0, remaining, null);
    if (bytesRead === 0) break;
    chunks.push(buffer.subarray(0, bytesRead));
    total += bytesRead;
  }
  if (total > maxBytes) throw new TypeError(`${label} exceeds its byte limit during verification`);
  return Buffer.concat(chunks, total);
}

function requireDistinctFiles(entries) {
  const paths = new Set();
  const identities = new Set();
  for (const entry of entries) {
    const identity = `${entry.dev}:${entry.ino}`;
    if (paths.has(entry.absolute) || identities.has(identity)) throw new TypeError('input/output path aliases are forbidden');
    paths.add(entry.absolute);
    identities.add(identity);
  }
}

async function writeNewFile(filename, bytes) {
  const absolute = requireLexicallyCanonicalPath(filename, 'output');
  const parent = path.dirname(absolute);
  if (await realpath(parent) !== parent) throw new TypeError('output parent path must be canonical and must not traverse a symlink');
  const parentBefore = await lstat(parent, { bigint: true });
  if (!parentBefore.isDirectory() || parentBefore.isSymbolicLink()) throw new TypeError('output parent must be one real directory');
  const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0);
  const handle = await open(absolute, flags, 0o644);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
    const outputStat = await handle.stat({ bigint: true });
    const parentAfter = await lstat(parent, { bigint: true });
    const outputPath = await lstat(absolute, { bigint: true });
    if (await realpath(parent) !== parent || await realpath(absolute) !== absolute
        || parentBefore.dev !== parentAfter.dev || parentBefore.ino !== parentAfter.ino
        || !outputPath.isFile() || outputPath.isSymbolicLink() || outputPath.nlink !== 1n
        || outputPath.dev !== outputStat.dev || outputPath.ino !== outputStat.ino
        || outputPath.size !== outputStat.size || outputPath.mode !== outputStat.mode
        || BigInt(bytes.length) !== outputStat.size) {
      throw new Error('output path changed during publication');
    }
  } finally {
    await handle.close();
  }
}

function parseCli(argv) {
  const allowedModes = new Set(['write-new', 'verify-exact']);
  const mode = argv[0];
  if (!allowedModes.has(mode)) throw new TypeError('usage: write-container-observation.mjs <write-new|verify-exact> [required options]');
  const flagMap = new Map([
    ['--model', 'model'],
    ['--runtime-source-revision', 'runtimeSourceRevision'],
    ['--workflow-revision', 'workflowRevision'],
    ['--source-date-epoch', 'sourceDateEpoch'],
    ['--runtime-input-manifest', 'runtimeInputManifest'],
    ['--buildx-metadata', 'buildxMetadata'],
    ['--image-inspect', 'imageInspect'],
    ['--buildx-version', 'buildxVersion'],
    ['--docker-server-version', 'dockerServerVersion'],
    ['--output', 'output'],
  ]);
  const options = {};
  for (let index = 1; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    const key = flagMap.get(flag);
    if (!key || value === undefined || value.startsWith('--')) throw new TypeError(`unknown, missing, or valueless CLI option ${JSON.stringify(flag)}`);
    if (Object.hasOwn(options, key)) throw new TypeError(`duplicate CLI option ${flag}`);
    options[key] = value;
  }
  const missing = [...flagMap.values()].filter((key) => !Object.hasOwn(options, key));
  if (missing.length > 0) throw new TypeError(`missing required CLI options: ${missing.map(camelToKebab).join(', ')}`);
  requireModel(options.model);
  return { mode, options };
}

function camelToKebab(value) {
  return value.replace(/[A-Z]/g, (character) => `-${character.toLowerCase()}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  runCli().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
