#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export const RUNTIME_INPUT_SCHEMA_VERSION = 'tf.atomistic-runtime-inputs/0.1';
export const RUNTIME_PLATFORM = 'linux/amd64';
export const PINNED_DOCKERFILE_FRONTEND = 'docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e';
export const PINNED_DOCKERFILE_FRONTEND_DIGEST = 'sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e';

const MODEL_IDS = Object.freeze({
  mattersim: 'mattersim-v1.0.0-5m',
  mace: 'mace-mpa-0-medium',
});
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const REVISION_PATTERN = /^[0-9a-f]{40}$/;
const NORMALIZED_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const VERSION_PATTERN = /^[A-Za-z0-9]+(?:[A-Za-z0-9.!+_-]*[A-Za-z0-9])?$/;
const MAX_INPUT_BYTES = Object.freeze({
  plan: 5_000_000,
  wheelhouseManifest: 100_000_000,
  dockerfile: 1_000_000,
  dockerignore: 1_000_000,
  dependencyLock: 10_000_000,
  runnerSource: 5_000_000,
  output: 150_000_000,
});

export const REVIEWED_RUNTIME_POLICY = deepFreeze({
  build: {
    cache: 'disabled',
    dependencySource: 'verified-local-wheelhouse-only',
    network: 'none',
    pull: false,
    provenance: 'disabled',
    sbom: 'disabled',
  },
  runtime: {
    capabilities: 'drop-all',
    network: 'none',
    noNewPrivileges: true,
    rootFilesystem: 'read-only',
    user: '65532:65532',
  },
});

const WHEELHOUSE_KEYS = Object.freeze([
  'architecture',
  'baseImage',
  'baseImageAmd64Digest',
  'dependencyGraphDigest',
  'dependencyRoots',
  'derivedWheelProvenance',
  'installedFileCount',
  'installedPathDigest',
  'lockDigest',
  'model',
  'modelId',
  'planDigest',
  'platform',
  'python',
  'resolverDigest',
  'resolverRuntime',
  'runtimeInstalledFileCount',
  'runtimeInstalledPathDigest',
  'schemaVersion',
  'startupHookRemovals',
  'wheelCount',
  'wheels',
]);
const WHEEL_KEYS = Object.freeze([
  'archiveMemberCount',
  'expandedSizeBytes',
  'filename',
  'generatedScripts',
  'installPathDigest',
  'name',
  'normalizedName',
  'providesExtras',
  'python31213Compatible',
  'requiresDist',
  'requiresPython',
  'sha256',
  'sizeBytes',
  'startupHookRemovals',
  'version',
]);
const STARTUP_HOOK_KEYS = Object.freeze([
  'archivePath',
  'installPath',
  'sha256',
  'sizeBytes',
  'wheelFilename',
]);
const DERIVED_WHEEL_KEYS = Object.freeze([
  'manifestDigest',
  'promotionEligible',
  'schemaVersion',
  'sourceSha256',
  'wheelFilename',
  'wheelSha256',
]);

/** Return compact recursive-key-sorted JSON, matching Python json.dumps separators/sort_keys. */
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

export function runnerIdentity(runModelBytes, runtimeContractBytes) {
  requireNonemptyBytes(runModelBytes, 'run_model.py');
  requireNonemptyBytes(runtimeContractBytes, 'runtime_contract.py');
  requireTextFile(runModelBytes, 'run_model.py');
  requireTextFile(runtimeContractBytes, 'runtime_contract.py');
  const files = [
    { name: 'run_model.py', sha256: sha256(runModelBytes) },
    { name: 'runtime_contract.py', sha256: sha256(runtimeContractBytes) },
  ].sort((left, right) => compareAscii(left.name, right.name));
  return { files, digest: sha256(Buffer.from(canonicalJson(files), 'utf8')) };
}

/**
 * Build the complete runtime-input contract without embedding its own digest.
 * All byte inputs must be Buffer/Uint8Array instances, so callers cannot
 * accidentally bind decoded or newline-normalized text.
 */
export function buildRuntimeInputManifest({
  model,
  scientificPlanBytes,
  wheelhouseManifestBytes,
  dockerfileBytes,
  dockerignoreBytes,
  dependencyLockBytes,
  runModelBytes,
  runtimeContractBytes,
  runtimeSourceRevision,
  sourceDateEpoch,
}) {
  requireModel(model);
  for (const [label, bytes] of [
    ['scientific plan', scientificPlanBytes],
    ['wheelhouse manifest', wheelhouseManifestBytes],
    ['Dockerfile', dockerfileBytes],
    ['.dockerignore', dockerignoreBytes],
    ['dependency lock', dependencyLockBytes],
    ['run_model.py', runModelBytes],
    ['runtime_contract.py', runtimeContractBytes],
  ]) requireNonemptyBytes(bytes, label);

  const plan = parseJsonRejectDuplicateKeys(scientificPlanBytes, 'scientific plan');
  if (!isPlainObject(plan)) throw new TypeError('scientific plan must be one JSON object');
  const wheelhouse = parseJsonRejectDuplicateKeys(wheelhouseManifestBytes, 'wheelhouse manifest');
  const wheelhouseProjection = projectWheelhouseManifest(wheelhouse, model);
  validateDockerfile(dockerfileBytes);
  validateDockerignore(dockerignoreBytes, model);
  validateDependencyLock(dependencyLockBytes, wheelhouseProjection);
  const runner = runnerIdentity(runModelBytes, runtimeContractBytes);
  const revision = requireRevision(runtimeSourceRevision);
  const epoch = requireSourceDateEpoch(sourceDateEpoch);
  const baseImage = parseBaseImage(wheelhouseProjection.baseImage);

  const manifest = {
    schemaVersion: RUNTIME_INPUT_SCHEMA_VERSION,
    model,
    modelId: MODEL_IDS[model],
    scientificPlan: {
      rawDigest: sha256(scientificPlanBytes),
      sizeBytes: scientificPlanBytes.length,
    },
    runtimeSource: {
      revision,
      sourceDateEpoch: epoch,
    },
    platform: RUNTIME_PLATFORM,
    baseImage: {
      reference: wheelhouseProjection.baseImage,
      indexDigest: baseImage.indexDigest,
      platformManifestDigest: wheelhouseProjection.baseImageAmd64Digest,
    },
    dockerfileFrontend: {
      reference: PINNED_DOCKERFILE_FRONTEND,
      manifestDigest: PINNED_DOCKERFILE_FRONTEND_DIGEST,
    },
    buildInputs: {
      dockerfile: fileIdentity(`${model}.Dockerfile`, dockerfileBytes),
      dockerignore: fileIdentity('.dockerignore', dockerignoreBytes),
      dependencyLock: fileIdentity(`${model}.requirements.lock`, dependencyLockBytes),
      wheelhouse: wheelhouseProjection,
      runner,
    },
    policy: REVIEWED_RUNTIME_POLICY,
  };
  const bytes = canonicalJsonBytes(manifest);
  return {
    manifest,
    bytes,
    fileDigest: sha256(bytes),
    runnerDigest: runner.digest,
  };
}

/**
 * Select the complete build-relevant resolver claim surface. Resolver identity,
 * resolver runtime, and its copy of planDigest are intentionally not returned.
 */
export function projectWheelhouseManifest(manifest, model) {
  requireModel(model);
  requireExactKeys(manifest, WHEELHOUSE_KEYS, 'wheelhouse manifest');
  if (manifest.schemaVersion !== 'tf.atomistic-wheelhouse-manifest/0.1') throw new TypeError('wheelhouse manifest schemaVersion is unsupported');
  if (manifest.model !== model || manifest.modelId !== MODEL_IDS[model]) throw new TypeError('wheelhouse manifest model identity differs from the selected model');
  if (manifest.python !== '3.12.13' || manifest.platform !== 'linux' || manifest.architecture !== 'x86_64') {
    throw new TypeError('wheelhouse manifest runtime target must be Python 3.12.13 on Linux/x86_64');
  }
  parseBaseImage(manifest.baseImage);
  requireDigest(manifest.baseImageAmd64Digest, 'wheelhouse baseImageAmd64Digest');
  requireDigest(manifest.lockDigest, 'wheelhouse lockDigest');
  requireDigest(manifest.dependencyGraphDigest, 'wheelhouse dependencyGraphDigest');
  requireDigest(manifest.installedPathDigest, 'wheelhouse installedPathDigest');
  requireDigest(manifest.runtimeInstalledPathDigest, 'wheelhouse runtimeInstalledPathDigest');
  requireDigest(manifest.planDigest, 'wheelhouse planDigest metadata');
  requireDigest(manifest.resolverDigest, 'wheelhouse resolverDigest metadata');
  requireJsonTree(manifest.resolverRuntime, 'wheelhouse resolverRuntime metadata');

  const dependencyRoots = requireUniqueStringArray(manifest.dependencyRoots, 'wheelhouse dependencyRoots');
  if (dependencyRoots.length === 0) throw new TypeError('wheelhouse dependencyRoots must not be empty');
  const wheels = validateWheels(manifest.wheels);
  const startupHookRemovals = validateStartupHookRemovals(manifest.startupHookRemovals, 'wheelhouse startupHookRemovals');
  const flattenedRemovals = wheels.flatMap((wheel) => wheel.startupHookRemovals)
    .sort(compareStartupHooks);
  if (canonicalJson(startupHookRemovals) !== canonicalJson(flattenedRemovals)) {
    throw new TypeError('wheelhouse top-level startupHookRemovals differ from the exact per-wheel removals');
  }

  const wheelCount = requireSafeCount(manifest.wheelCount, 'wheelhouse wheelCount', { positive: true });
  const installedFileCount = requireSafeCount(manifest.installedFileCount, 'wheelhouse installedFileCount', { positive: true });
  const runtimeInstalledFileCount = requireSafeCount(manifest.runtimeInstalledFileCount, 'wheelhouse runtimeInstalledFileCount', { positive: true });
  if (wheelCount !== wheels.length) throw new TypeError('wheelhouse wheelCount differs from the exact wheels array');
  if (runtimeInstalledFileCount !== installedFileCount - startupHookRemovals.length) {
    throw new TypeError('wheelhouse runtime installed inventory count does not reflect startup-hook removals');
  }
  if (startupHookRemovals.length === 0 && manifest.runtimeInstalledPathDigest !== manifest.installedPathDigest) {
    throw new TypeError('wheelhouse unchanged runtime inventory must retain the installed path digest');
  }
  if (startupHookRemovals.length > 0 && manifest.runtimeInstalledPathDigest === manifest.installedPathDigest) {
    throw new TypeError('wheelhouse startup-hook removal must change the runtime installed path digest');
  }
  const derivedWheelProvenance = validateDerivedWheelProvenance(manifest.derivedWheelProvenance, model, wheels);

  return {
    schemaVersion: manifest.schemaVersion,
    model: manifest.model,
    modelId: manifest.modelId,
    python: manifest.python,
    platform: manifest.platform,
    architecture: manifest.architecture,
    baseImage: manifest.baseImage,
    baseImageAmd64Digest: manifest.baseImageAmd64Digest,
    lockDigest: manifest.lockDigest,
    wheelCount,
    dependencyRoots,
    dependencyGraphDigest: manifest.dependencyGraphDigest,
    derivedWheelProvenance,
    installedFileCount,
    installedPathDigest: manifest.installedPathDigest,
    startupHookRemovals,
    runtimeInstalledFileCount,
    runtimeInstalledPathDigest: manifest.runtimeInstalledPathDigest,
    wheels,
  };
}

export function expectedDependencyLockBytes(wheels) {
  const lines = [
    '# Generated from one reviewed cp312/Linux x86_64 wheelhouse.',
    '# Install only with --no-index --require-hashes --only-binary=:all:.',
  ];
  for (const wheel of wheels) {
    lines.push(`${wheel.normalizedName}==${wheel.version} \\`);
    lines.push(`    --hash=${wheel.sha256}`);
  }
  return Buffer.from(`${lines.join('\n')}\n`, 'utf8');
}

export async function runCli(argv = process.argv.slice(2)) {
  const { mode, options } = parseCli(argv);
  const expectedBasenames = {
    plan: 'reproduction-plan.json',
    wheelhouseManifest: `${options.model}.wheelhouse.manifest.json`,
    dockerfile: `${options.model}.Dockerfile`,
    dockerignore: '.dockerignore',
    dependencyLock: `${options.model}.requirements.lock`,
    runModel: 'run_model.py',
    runtimeContract: 'runtime_contract.py',
    output: `${options.model}.runtime-inputs.json`,
  };
  for (const [key, expected] of Object.entries(expectedBasenames)) {
    if (path.basename(options[key]) !== expected) throw new TypeError(`--${camelToKebab(key)} must name ${expected}`);
  }
  const [scientificPlanBytes, wheelhouseManifestBytes, dockerfileBytes, dockerignoreBytes, dependencyLockBytes, runModelBytes, runtimeContractBytes] = await Promise.all([
    readSafeRegularFile(options.plan, 'scientific plan', MAX_INPUT_BYTES.plan),
    readSafeRegularFile(options.wheelhouseManifest, 'wheelhouse manifest', MAX_INPUT_BYTES.wheelhouseManifest),
    readSafeRegularFile(options.dockerfile, 'Dockerfile', MAX_INPUT_BYTES.dockerfile),
    readSafeRegularFile(options.dockerignore, '.dockerignore', MAX_INPUT_BYTES.dockerignore),
    readSafeRegularFile(options.dependencyLock, 'dependency lock', MAX_INPUT_BYTES.dependencyLock),
    readSafeRegularFile(options.runModel, 'run_model.py', MAX_INPUT_BYTES.runnerSource),
    readSafeRegularFile(options.runtimeContract, 'runtime_contract.py', MAX_INPUT_BYTES.runnerSource),
  ]);
  const result = buildRuntimeInputManifest({
    model: options.model,
    scientificPlanBytes,
    wheelhouseManifestBytes,
    dockerfileBytes,
    dockerignoreBytes,
    dependencyLockBytes,
    runModelBytes,
    runtimeContractBytes,
    runtimeSourceRevision: options.runtimeSourceRevision,
    sourceDateEpoch: options.sourceDateEpoch,
  });
  if (mode === 'write-new') await writeNewFile(options.output, result.bytes);
  else {
    const actual = await readSafeRegularFile(options.output, 'runtime-input manifest', MAX_INPUT_BYTES.output);
    parseJsonRejectDuplicateKeys(actual, 'runtime-input manifest');
    if (!actual.equals(result.bytes)) {
      throw new Error(`runtime-input manifest differs from the exact canonical contract (expected ${result.fileDigest}, found ${sha256(actual)})`);
    }
  }
  process.stdout.write(canonicalJsonBytes({
    fileDigest: result.fileDigest,
    model: options.model,
    runnerDigest: result.runnerDigest,
  }));
  return result;
}

function validateWheels(value) {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError('wheelhouse wheels must be a nonempty array');
  const wheels = value.map((wheel, index) => {
    const label = `wheelhouse wheels[${index}]`;
    requireExactKeys(wheel, WHEEL_KEYS, label);
    requireSafeFilename(wheel.filename, `${label}.filename`, '.whl');
    requireBoundedString(wheel.name, `${label}.name`);
    if (typeof wheel.normalizedName !== 'string' || !NORMALIZED_NAME_PATTERN.test(wheel.normalizedName)) throw new TypeError(`${label}.normalizedName is malformed`);
    if (typeof wheel.version !== 'string' || !VERSION_PATTERN.test(wheel.version)) throw new TypeError(`${label}.version is malformed`);
    if (wheel.requiresPython !== null) requireBoundedString(wheel.requiresPython, `${label}.requiresPython`);
    if (wheel.python31213Compatible !== true) throw new TypeError(`${label} must declare Python 3.12.13 compatibility`);
    requireSafeCount(wheel.sizeBytes, `${label}.sizeBytes`, { positive: true });
    requireSafeCount(wheel.expandedSizeBytes, `${label}.expandedSizeBytes`, { positive: true });
    requireSafeCount(wheel.archiveMemberCount, `${label}.archiveMemberCount`, { positive: true });
    requireDigest(wheel.sha256, `${label}.sha256`);
    requireDigest(wheel.installPathDigest, `${label}.installPathDigest`);
    // METADATA may repeat byte-identical Requires-Dist rows (torchmetrics does);
    // preserving the exact ordered list binds that upstream fact without
    // confusing it with a duplicate identity or JSON member.
    const requiresDist = requireUniqueStringArray(wheel.requiresDist, `${label}.requiresDist`, { allowEmpty: true, unique: false });
    const providesExtras = requireUniqueStringArray(wheel.providesExtras, `${label}.providesExtras`, { allowEmpty: true });
    if (!isAsciiSorted(providesExtras)) throw new TypeError(`${label}.providesExtras must be sorted`);
    const generatedScripts = requireUniqueStringArray(wheel.generatedScripts, `${label}.generatedScripts`, { allowEmpty: true });
    if (!isAsciiSorted(generatedScripts)) throw new TypeError(`${label}.generatedScripts must be sorted`);
    for (const script of generatedScripts) requireSafePosixPath(script, `${label}.generatedScripts`);
    const startupHookRemovals = validateStartupHookRemovals(wheel.startupHookRemovals, `${label}.startupHookRemovals`, wheel.filename);
    return {
      filename: wheel.filename,
      name: wheel.name,
      normalizedName: wheel.normalizedName,
      version: wheel.version,
      requiresPython: wheel.requiresPython,
      python31213Compatible: wheel.python31213Compatible,
      sizeBytes: wheel.sizeBytes,
      expandedSizeBytes: wheel.expandedSizeBytes,
      archiveMemberCount: wheel.archiveMemberCount,
      sha256: wheel.sha256,
      requiresDist,
      providesExtras,
      installPathDigest: wheel.installPathDigest,
      generatedScripts,
      startupHookRemovals,
    };
  });
  const names = wheels.map((wheel) => wheel.normalizedName);
  const filenames = wheels.map((wheel) => wheel.filename);
  requireUnique(names, 'wheelhouse normalized wheel names');
  requireUnique(filenames, 'wheelhouse wheel filenames');
  if (!isAsciiSorted(names)) throw new TypeError('wheelhouse wheels must be sorted by normalizedName');
  return wheels;
}

function validateStartupHookRemovals(value, label, enclosingWheelFilename = null) {
  if (!Array.isArray(value)) throw new TypeError(`${label} must be an array`);
  const removals = value.map((entry, index) => {
    const itemLabel = `${label}[${index}]`;
    requireExactKeys(entry, STARTUP_HOOK_KEYS, itemLabel);
    requireSafePosixPath(entry.archivePath, `${itemLabel}.archivePath`);
    requireSafePosixPath(entry.installPath, `${itemLabel}.installPath`);
    requireSafeFilename(entry.wheelFilename, `${itemLabel}.wheelFilename`, '.whl');
    requireSafeCount(entry.sizeBytes, `${itemLabel}.sizeBytes`, { positive: true });
    requireDigest(entry.sha256, `${itemLabel}.sha256`);
    if (enclosingWheelFilename !== null && entry.wheelFilename !== enclosingWheelFilename) {
      throw new TypeError(`${itemLabel}.wheelFilename differs from its enclosing wheel`);
    }
    return {
      archivePath: entry.archivePath,
      installPath: entry.installPath,
      sha256: entry.sha256,
      sizeBytes: entry.sizeBytes,
      wheelFilename: entry.wheelFilename,
    };
  });
  if (!isSorted(removals, compareStartupHooks)) throw new TypeError(`${label} must be sorted by wheelFilename and installPath`);
  requireUnique(removals.map((entry) => `${entry.wheelFilename}\0${entry.installPath}`), label);
  return removals;
}

function validateDerivedWheelProvenance(value, model, wheels) {
  if (model === 'mattersim') {
    if (value !== null) throw new TypeError('MatterSim wheelhouse must not declare derived-wheel provenance');
    return null;
  }
  requireExactKeys(value, DERIVED_WHEEL_KEYS, 'MACE derivedWheelProvenance');
  if (value.schemaVersion !== 'tf.python-hostlist-derived-wheel-provenance/0.1' || value.promotionEligible !== false) {
    throw new TypeError('MACE derivedWheelProvenance identity or promotion boundary is invalid');
  }
  for (const field of ['manifestDigest', 'sourceSha256', 'wheelSha256']) requireDigest(value[field], `MACE derivedWheelProvenance.${field}`);
  requireSafeFilename(value.wheelFilename, 'MACE derivedWheelProvenance.wheelFilename', '.whl');
  const hostlist = wheels.filter((wheel) => wheel.normalizedName === 'python-hostlist');
  if (hostlist.length !== 1 || hostlist[0].filename !== value.wheelFilename || hostlist[0].sha256 !== value.wheelSha256) {
    throw new TypeError('MACE derivedWheelProvenance does not bind the exact python-hostlist wheel');
  }
  return {
    schemaVersion: value.schemaVersion,
    manifestDigest: value.manifestDigest,
    sourceSha256: value.sourceSha256,
    wheelFilename: value.wheelFilename,
    wheelSha256: value.wheelSha256,
    promotionEligible: value.promotionEligible,
  };
}

function validateDockerfile(bytes) {
  const text = requireTextFile(bytes, 'Dockerfile');
  const expected = `# syntax=${PINNED_DOCKERFILE_FRONTEND}\n`;
  if (!text.startsWith(expected)) throw new TypeError('Dockerfile must use the exact reviewed digest-pinned frontend on its first line');
  if (text.indexOf('\n', expected.length) === -1) throw new TypeError('Dockerfile lacks a build body after the pinned frontend');
}

function validateDockerignore(bytes, model) {
  const text = requireTextFile(bytes, '.dockerignore');
  const lines = text.slice(0, -1).split('\n');
  if (lines[0] !== '**') throw new TypeError('.dockerignore must begin with the deny-all ** rule');
  const rules = new Set();
  for (const [index, line] of lines.entries()) {
    if (line === '' || line.startsWith('#')) continue;
    if (rules.has(line)) throw new TypeError(`.dockerignore contains duplicate rule ${JSON.stringify(line)}`);
    rules.add(line);
    if (index === 0) continue;
    if (!/^![A-Za-z0-9._/-]+$/.test(line)) throw new TypeError(`.dockerignore contains unsafe or unsupported rule ${JSON.stringify(line)}`);
    requireSafePosixPath(line.slice(1).replace(/\/$/, ''), '.dockerignore allow rule');
  }
  const required = [
    '!.dockerignore',
    `!atomistic/containers/${model}.Dockerfile`,
    `!atomistic/locks/${model}.requirements.lock`,
    '!scripts/atomistic/run_model.py',
    '!scripts/atomistic/runtime_contract.py',
  ];
  const missing = required.filter((rule) => !rules.has(rule));
  if (missing.length > 0) throw new TypeError(`.dockerignore omits required build inputs: ${missing.join(', ')}`);
}

function validateDependencyLock(bytes, wheelhouse) {
  requireTextFile(bytes, 'dependency lock');
  const expected = expectedDependencyLockBytes(wheelhouse.wheels);
  if (!Buffer.from(bytes).equals(expected)) throw new TypeError('dependency lock bytes differ from the exact sorted wheelhouse lock');
  const digest = sha256(bytes);
  if (digest !== wheelhouse.lockDigest) throw new TypeError('dependency lock digest differs from wheelhouse lockDigest');
}

function parseBaseImage(value) {
  if (typeof value !== 'string' || value.length > 512 || value.includes('..') || value.includes('\\') || /[\u0000-\u0020\u007f]/.test(value)) {
    throw new TypeError('wheelhouse baseImage is unsafe or malformed');
  }
  const match = /^([a-z0-9]+(?:[._/-][a-z0-9]+)*(?::[A-Za-z0-9](?:[A-Za-z0-9._-]*[A-Za-z0-9])?)?)@(sha256:[0-9a-f]{64})$/.exec(value);
  if (!match) throw new TypeError('wheelhouse baseImage must carry an exact sha256 index digest');
  return { referenceWithoutDigest: match[1], indexDigest: match[2] };
}

function fileIdentity(name, bytes) {
  return { name, sizeBytes: bytes.length, sha256: sha256(bytes) };
}

function requireModel(model) {
  if (!Object.hasOwn(MODEL_IDS, model)) throw new TypeError('model must be exactly mattersim or mace');
}

function requireRevision(value) {
  if (typeof value !== 'string' || !REVISION_PATTERN.test(value)) throw new TypeError('runtimeSourceRevision must be a full lowercase 40-hex Git revision');
  return value;
}

function requireSourceDateEpoch(value) {
  const raw = typeof value === 'number' ? String(value) : value;
  if (typeof raw !== 'string' || !/^(?:0|[1-9][0-9]{0,11})$/.test(raw)) throw new TypeError('sourceDateEpoch must be one canonical non-negative integer');
  const parsed = Number(raw);
  if (!Number.isSafeInteger(parsed) || parsed > 253_402_300_799) throw new TypeError('sourceDateEpoch is outside the supported Unix timestamp range');
  return parsed;
}

function requireDigest(value, label) {
  if (typeof value !== 'string' || !DIGEST_PATTERN.test(value)) throw new TypeError(`${label} must be a lowercase sha256 digest`);
  return value;
}

function requireSafeCount(value, label, { positive = false } = {}) {
  if (!Number.isSafeInteger(value) || value < (positive ? 1 : 0)) throw new TypeError(`${label} must be a ${positive ? 'positive' : 'non-negative'} safe integer`);
  return value;
}

function requireExactKeys(value, expected, label) {
  if (!isPlainObject(value)) throw new TypeError(`${label} must be one JSON object`);
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (actual.length !== wanted.length || actual.some((key, index) => key !== wanted[index])) {
    throw new TypeError(`${label} has an unexpected claim surface`);
  }
}

function requireJsonTree(value, label, depth = 0) {
  if (depth > 64) throw new TypeError(`${label} exceeds the supported nesting depth`);
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError(`${label} contains a non-finite number`);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) requireJsonTree(entry, label, depth + 1);
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, entry] of Object.entries(value)) {
      if (/^[\u0000-\u001f\u007f]/.test(key)) throw new TypeError(`${label} contains an unsafe key`);
      requireJsonTree(entry, label, depth + 1);
    }
    return;
  }
  throw new TypeError(`${label} contains a non-JSON value`);
}

function requireUniqueStringArray(value, label, { allowEmpty = false, unique = true } = {}) {
  if (!Array.isArray(value) || (!allowEmpty && value.length === 0)) throw new TypeError(`${label} must be ${allowEmpty ? 'an' : 'a nonempty'} array`);
  const output = value.map((entry, index) => {
    requireBoundedString(entry, `${label}[${index}]`);
    return entry;
  });
  if (unique) requireUnique(output, label);
  return output;
}

function requireBoundedString(value, label) {
  if (typeof value !== 'string' || value.length === 0 || value.length > 16_384 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) {
    throw new TypeError(`${label} must be one bounded control-free string`);
  }
  return value;
}

function requireSafeFilename(value, label, suffix = '') {
  requireBoundedString(value, label);
  if (value !== path.posix.basename(value) || value === '.' || value === '..' || value.includes('\\') || (suffix && !value.endsWith(suffix))) {
    throw new TypeError(`${label} is not a safe ${suffix || 'regular'} filename`);
  }
}

function requireSafePosixPath(value, label) {
  requireBoundedString(value, label);
  if (value.startsWith('/') || value.endsWith('/') || value.includes('\\') || value.includes('//')) throw new TypeError(`${label} is not one safe relative POSIX path`);
  const parts = value.split('/');
  if (parts.some((part) => part === '' || part === '.' || part === '..')) throw new TypeError(`${label} is not one safe relative POSIX path`);
}

function requireNonemptyBytes(value, label) {
  if ((!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) || value.length === 0) throw new TypeError(`${label} must be nonempty bytes`);
}

function requireTextFile(bytes, label) {
  requireNonemptyBytes(bytes, label);
  let text;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    throw new TypeError(`${label} is not strict UTF-8`, { cause: error });
  }
  if (text.includes('\0') || text.includes('\r') || !text.endsWith('\n')) throw new TypeError(`${label} must contain strict LF-terminated text without NUL or CR bytes`);
  return text;
}

function requireUnique(values, label) {
  if (new Set(values).size !== values.length) throw new TypeError(`${label} contains duplicates`);
}

function isAsciiSorted(values) {
  return isSorted(values, compareAscii);
}

function isSorted(values, comparator) {
  return values.every((value, index) => index === 0 || comparator(values[index - 1], value) <= 0);
}

function compareAscii(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareStartupHooks(left, right) {
  return compareAscii(left.wheelFilename, right.wheelFilename) || compareAscii(left.installPath, right.installPath);
}

function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const entry of Object.values(value)) deepFreeze(entry);
  }
  return value;
}

async function readSafeRegularFile(filename, label, maxBytes) {
  const absolute = path.resolve(filename);
  const canonical = await realpath(absolute);
  if (canonical !== absolute) throw new TypeError(`${label} path must be canonical and must not traverse a symlink`);
  const before = await lstat(absolute, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n || before.size < 1n || before.size > BigInt(maxBytes)) {
    throw new TypeError(`${label} must be one bounded, single-link regular file`);
  }
  const flags = fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0);
  const handle = await open(absolute, flags);
  try {
    const bytes = await handle.readFile();
    const after = await handle.stat({ bigint: true });
    if (before.dev !== after.dev || before.ino !== after.ino || before.size !== after.size || before.mtimeNs !== after.mtimeNs) {
      throw new Error(`${label} changed during verification`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

async function writeNewFile(filename, bytes) {
  const absolute = path.resolve(filename);
  const parent = path.dirname(absolute);
  if (await realpath(parent) !== parent) throw new TypeError('output parent path must be canonical and must not traverse a symlink');
  const flags = fsConstants.O_WRONLY | fsConstants.O_CREAT | fsConstants.O_EXCL | (fsConstants.O_NOFOLLOW ?? 0);
  const handle = await open(absolute, flags, 0o644);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

function parseCli(argv) {
  const allowedModes = new Set(['write-new', 'verify-exact']);
  const mode = argv[0];
  if (!allowedModes.has(mode)) throw new TypeError('usage: runtime-input-contract.mjs <write-new|verify-exact> [required options]');
  const flagMap = new Map([
    ['--model', 'model'],
    ['--plan', 'plan'],
    ['--wheelhouse-manifest', 'wheelhouseManifest'],
    ['--dockerfile', 'dockerfile'],
    ['--dockerignore', 'dockerignore'],
    ['--dependency-lock', 'dependencyLock'],
    ['--run-model', 'runModel'],
    ['--runtime-contract', 'runtimeContract'],
    ['--runtime-source-revision', 'runtimeSourceRevision'],
    ['--source-date-epoch', 'sourceDateEpoch'],
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
