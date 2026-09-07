#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { constants as fsConstants } from 'node:fs';
import { lstat, open, readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import { load as loadYaml } from 'js-yaml';
import {
  canonicalJson,
  parseJsonRejectingDuplicateMembers,
} from './runtime-lock-policy.mjs';

export const OBSERVER_CONTRACT_PATH =
  'evaluation/atomistic/full-candidate-observer-contract-vnext.json';
export const OBSERVER_CONTRACT_SCHEMA_PATH =
  'schemas/atomistic-full-candidate-observer-contract.schema.json';
export const OBSERVER_RECEIPT_SCHEMA_PATH =
  'schemas/atomistic-full-candidate-host-observation.schema.json';
export const DETERMINISM_ROOTS_CONTRACT_PATH =
  'evaluation/atomistic/full-candidate-determinism-roots-v0.1.json';
export const DETERMINISM_ROOTS_CONTRACT_SCHEMA_PATH =
  'schemas/atomistic-full-candidate-determinism-roots.schema.json';
export const OBSERVER_WORKFLOW_SOURCE_PATH =
  'evaluation/atomistic/full-candidate-observer-vnext.workflow.yml';
export const OBSERVER_PREDECESSOR_PATH =
  'evaluation/atomistic/full-candidate-execution-preflight.json';
export const OBSERVER_RANDOM_TP_ID_MANIFEST_PATH =
  'evaluation/atomistic/random-tp-id-manifest.txt';
export const OBSERVER_RANDOM_TP_ID_MANIFEST_RAW_DIGEST =
  'sha256:4df1ba7cda1b0a31cdb0b3e2281ed535327d7b92ce381cd930c781cc8b800f91';
export const LEGACY_RECEIPT_SCHEMA_PATH =
  'schemas/atomistic-full-candidate-receipt.schema.json';
export const LEGACY_RECEIPT_SCHEMA_RAW_DIGEST =
  'sha256:f6dfdec4d81bd1467ec459f6e0153dee5fe877a17819de4704c0ae189dcc70aa';
export const OBSERVER_CONTRACT_RAW_DIGEST =
  'sha256:9fd93ded20bd013a0c6d61dfec48368fc7957725ee4f95f4fafa242c7f7f0759';
export const OBSERVER_CONTRACT_SEMANTIC_DIGEST =
  'sha256:9cd846d04f9d948ff5e0caf7c899f748f8191b73b56a44f943ee32952f6bddd3';
export const OBSERVER_CONTRACT_SCHEMA_RAW_DIGEST =
  'sha256:cf3d5d3d3531d08f17df46f69a78590d656afd80dbbaf2db61bcad6cb9a1eb53';
export const OBSERVER_RECEIPT_SCHEMA_RAW_DIGEST =
  'sha256:729477cccc0564534b2dad7c3d2bc8ba735aeda369245e9c343987cab90490dd';
export const OBSERVER_RECEIPT_SCHEMA_SEMANTIC_DIGEST =
  'sha256:a46bcff17daf993e4f3956f9deb75b595ade46bfb3056decca3d1453680005dd';
export const DETERMINISM_ROOTS_CONTRACT_RAW_DIGEST =
  'sha256:fa5a83d70e499bc2419b63300d24e46a802406b78d2fa4406e93a7e0a0f01735';
export const DETERMINISM_ROOTS_CONTRACT_SEMANTIC_DIGEST =
  'sha256:a77b573744ad05eda25326c8d1ac3b93cf4089e37af47b764cdd910ab93fc0f5';
export const DETERMINISM_ROOTS_CONTRACT_SCHEMA_RAW_DIGEST =
  'sha256:adf2e8a6a509bc0f79b6ef48b0215e48dc983c1998982f21c4f13ed8504eb891';
export const DETERMINISM_ROOTS_CONTRACT_SCHEMA_SEMANTIC_DIGEST =
  'sha256:0ec9f29bb4b712025f931e73e5acc33384415fb5d6bdad1233da45f1cab2a4b7';
export const OBSERVER_WORKFLOW_RAW_DIGEST =
  'sha256:70732b76447b339decf5a1a8296e59c9186377f64bd4cfb59e81f4cd405f265c';
export const OBSERVER_WORKFLOW_SIZE_BYTES = 641;
export const STRESS_SYMMETRY_ABSOLUTE_TOLERANCE = 1e-10;
export const STRESS_SYMMETRY_ABSOLUTE_TOLERANCE_BINARY64 =
  '0x3ddb7cdfd9d7bdbb';

const execFileAsync = promisify(execFile);
const EXPECTED_FILE_MODE_BIGINT = 0o644n;
const MAX_CONTRACT_BYTES = 1_000_000;
const MAX_SCHEMA_BYTES = 1_000_000;
const MAX_WORKFLOW_BYTES = 64_000;
const MAX_ID_MANIFEST_BYTES = 64_000;
const RANDOM_TP_RECORD_COUNT = 693;
const PREDICTION_RECORD_ATOM_COUNT = 16;
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/;
const CONTAINER_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const NETWORK_NAMESPACE_IDENTITY_PATTERN = /^net:\[[1-9][0-9]{0,19}\]$/;
const GIT_REVISION_PATTERN = /^[0-9a-f]{40}$/;
const EFFECTIVE_CAPABILITIES_PATTERN = /^0x[0-9a-f]{16}$/;
const NETWORK_PROOF_METHOD =
  'isolated Linux network namespace; loopback-only interface set; no non-loopback IPv4/IPv6 route; TEST-NET probes rejected; known host-control sockets absent';
const NETWORK_PROBE_IDENTITIES = Object.freeze([
  Object.freeze({ family: 'ipv4', address: '192.0.2.1', port: 9 }),
  Object.freeze({ family: 'ipv6', address: '2001:db8::1', port: 9 }),
]);
const NETWORK_PROBE_BLOCKED_ERRNOS = Object.freeze(new Set([1, 13, 97, 99, 100, 101, 113]));
const NETWORK_BOUNDARY_FIELDS = Object.freeze([
  'network_namespace',
  'effective_capabilities',
  'interfaces',
  'ipv4_routes',
  'ipv6_routes',
  'escape_sockets_absent',
]);
const GIT_EXECUTABLE = '/usr/bin/git';
const GIT_TIMEOUT_MS = 10_000;
const MAX_GIT_OUTPUT_BYTES = 5 * 1024 * 1024;
const RIGHTS_DATASET_CATALOG_PATH = 'evaluation/data/datasets.json';
const RIGHTS_REPRODUCTION_PLAN_PATH = 'evaluation/atomistic/reproduction-plan.json';
const RIGHTS_RUNTIME_LOCK_PATH = 'evaluation/atomistic/runtime-lock.json';
const RIGHTS_MACE_NOTICE_PATH = 'atomistic/locks/README.md';
const REVIEWED_SOURCE_SPECS = Object.freeze([
  Object.freeze({
    path: OBSERVER_CONTRACT_PATH,
    maximumBytes: MAX_CONTRACT_BYTES,
    digest: () => OBSERVER_CONTRACT_RAW_DIGEST,
  }),
  Object.freeze({
    path: OBSERVER_WORKFLOW_SOURCE_PATH,
    maximumBytes: MAX_WORKFLOW_BYTES,
    digest: () => OBSERVER_WORKFLOW_RAW_DIGEST,
  }),
  Object.freeze({
    path: OBSERVER_CONTRACT_SCHEMA_PATH,
    maximumBytes: MAX_SCHEMA_BYTES,
    digest: () => OBSERVER_CONTRACT_SCHEMA_RAW_DIGEST,
  }),
  Object.freeze({
    path: OBSERVER_RECEIPT_SCHEMA_PATH,
    maximumBytes: MAX_SCHEMA_BYTES,
    digest: () => OBSERVER_RECEIPT_SCHEMA_RAW_DIGEST,
  }),
  Object.freeze({
    path: DETERMINISM_ROOTS_CONTRACT_PATH,
    maximumBytes: MAX_CONTRACT_BYTES,
    digest: () => DETERMINISM_ROOTS_CONTRACT_RAW_DIGEST,
  }),
  Object.freeze({
    path: DETERMINISM_ROOTS_CONTRACT_SCHEMA_PATH,
    maximumBytes: MAX_SCHEMA_BYTES,
    digest: () => DETERMINISM_ROOTS_CONTRACT_SCHEMA_RAW_DIGEST,
  }),
]);
const CHECKOUT_ACTION =
  'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803';
const FIXTURE_COMMAND =
  'node scripts/atomistic/full-candidate-observer-vnext.mjs --emit-fixture';
const FIXTURE_EVIDENCE_CLASS =
  'synthetic-contract-fixture-not-model-output';
const FIXTURE_ABSTENTION_REASONS = Object.freeze([
  'synthetic-contract-fixture-only',
  'dispatch-disabled',
  'model-execution-not-observed',
  'host-resource-provenance-not-observed',
  'rights-not-cleared',
]);
const CLAIMS = Object.freeze({
  fullInferenceRun: false,
  claimEligible: false,
  comparisonEligible: false,
  promotionEligible: false,
  publicationEligible: false,
  reproductionEligible: false,
  reproduced: false,
  sota: false,
  dataLeakageCertified: false,
  causalClaimAllowed: false,
  industrialFitness: false,
});
const GIT_ENVIRONMENT = Object.freeze({
  GIT_CONFIG_GLOBAL: '/dev/null',
  GIT_CONFIG_NOSYSTEM: '1',
  GIT_CONFIG_SYSTEM: '/dev/null',
  GIT_LITERAL_PATHSPECS: '1',
  GIT_NO_LAZY_FETCH: '1',
  GIT_NO_REPLACE_OBJECTS: '1',
  GIT_OPTIONAL_LOCKS: '0',
  GIT_TERMINAL_PROMPT: '0',
  LANG: 'C',
  LC_ALL: 'C',
  PATH: '/usr/bin:/bin',
});

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const frozenContractBytes = await readFile(path.join(moduleRoot, OBSERVER_CONTRACT_PATH));
const FROZEN_CONTRACT = deepFreeze(
  parseJsonRejectingDuplicateMembers(frozenContractBytes),
);
const frozenDeterminismRootsContractBytes = await readFile(
  path.join(moduleRoot, DETERMINISM_ROOTS_CONTRACT_PATH),
);
const FROZEN_DETERMINISM_ROOTS_CONTRACT = deepFreeze(
  parseJsonRejectingDuplicateMembers(frozenDeterminismRootsContractBytes),
);
const frozenIdManifestBytes = await readFile(
  path.join(moduleRoot, OBSERVER_RANDOM_TP_ID_MANIFEST_PATH),
);
const frozenIdManifest = inspectRandomTpIdManifestBytes(frozenIdManifestBytes);
if (frozenIdManifest.failures.length) {
  throw new Error(frozenIdManifest.failures.join('\n'));
}
const randomTpIds = Object.freeze(frozenIdManifest.ids);

const EXPECTED_WORKFLOW_DOCUMENT = deepFreeze({
  name: 'Atomistic full candidate vNext fixture observer (unregistered)',
  on: {
    push: {
      'branches-ignore': ['**'],
      'tags-ignore': ['**'],
    },
  },
  permissions: {},
  jobs: {
    'fixture-contract-observer': {
      if: '${{ false }}',
      'runs-on': 'ubuntu-24.04',
      'timeout-minutes': 1,
      permissions: {},
      steps: [
        {
          name: 'Check out the fixture contract source',
          uses: CHECKOUT_ACTION,
          with: { 'persist-credentials': false },
        },
        {
          name: 'Emit the non-scientific fixture receipt',
          shell: 'bash',
          run: FIXTURE_COMMAND,
        },
      ],
    },
  },
});

export function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

export function inspectObserverContractBytes(
  bytes,
  { enforceFrozenDigest = true } = {},
) {
  const buffer = requireBytes(bytes, 'observer contract');
  const failures = [];
  let contract = null;
  let semanticDigest = null;
  if (buffer.length > MAX_CONTRACT_BYTES) {
    failures.push('observer.contract.raw: byte limit exceeded');
    return { contract, rawDigest: sha256(buffer), semanticDigest, failures };
  }
  try {
    contract = parseJsonRejectingDuplicateMembers(buffer);
    semanticDigest = sha256(Buffer.from(canonicalJson(contract), 'utf8'));
  } catch (error) {
    failures.push(`observer.contract.raw: strict JSON failed (${message(error)})`);
  }
  const rawDigest = sha256(buffer);
  if (enforceFrozenDigest && rawDigest !== OBSERVER_CONTRACT_RAW_DIGEST) {
    failures.push('observer.contract.rawDigest: exact reviewed bytes differ');
  }
  if (enforceFrozenDigest && semanticDigest !== OBSERVER_CONTRACT_SEMANTIC_DIGEST) {
    failures.push('observer.contract.semanticDigest: exact frozen semantics differ');
  }
  return { contract, rawDigest, semanticDigest, failures };
}

export function inspectDeterminismRootsContractBytes(
  bytes,
  { enforceFrozenDigest = true } = {},
) {
  const buffer = requireBytes(bytes, 'determinism roots contract');
  const failures = [];
  let contract = null;
  let semanticDigest = null;
  if (buffer.length > MAX_CONTRACT_BYTES) {
    return {
      contract,
      rawDigest: sha256(buffer),
      semanticDigest,
      failures: ['observer.determinismRoots.raw: byte limit exceeded'],
    };
  }
  try {
    contract = parseJsonRejectingDuplicateMembers(buffer);
    semanticDigest = sha256(Buffer.from(canonicalJson(contract), 'utf8'));
  } catch (error) {
    failures.push(`observer.determinismRoots.raw: strict JSON failed (${message(error)})`);
  }
  const rawDigest = sha256(buffer);
  if (enforceFrozenDigest && rawDigest !== DETERMINISM_ROOTS_CONTRACT_RAW_DIGEST) {
    failures.push('observer.determinismRoots.rawDigest: exact reviewed bytes differ');
  }
  if (enforceFrozenDigest
      && semanticDigest !== DETERMINISM_ROOTS_CONTRACT_SEMANTIC_DIGEST) {
    failures.push('observer.determinismRoots.semanticDigest: exact frozen semantics differ');
  }
  return { contract, rawDigest, semanticDigest, failures };
}

export function inspectDeterminismRootsSchemaBytes(
  bytes,
  { enforceFrozenDigest = true } = {},
) {
  return inspectFrozenJsonSchemaBytes(bytes, {
    label: 'observer.determinismRoots.schema',
    rawDigest: DETERMINISM_ROOTS_CONTRACT_SCHEMA_RAW_DIGEST,
    semanticDigest: DETERMINISM_ROOTS_CONTRACT_SCHEMA_SEMANTIC_DIGEST,
    enforceFrozenDigest,
  });
}

export function inspectObserverReceiptSchemaBytes(
  bytes,
  { enforceFrozenDigest = true } = {},
) {
  return inspectFrozenJsonSchemaBytes(bytes, {
    label: 'observer.receipt.schema',
    rawDigest: OBSERVER_RECEIPT_SCHEMA_RAW_DIGEST,
    semanticDigest: OBSERVER_RECEIPT_SCHEMA_SEMANTIC_DIGEST,
    enforceFrozenDigest,
  });
}

export function validateDeterminismRootsContractSchema(contract, schema) {
  try {
    const ajv = new Ajv2020({
      allErrors: true,
      strict: true,
      validateFormats: false,
      validateSchema: true,
    });
    const validate = ajv.compile(schema);
    if (validate(contract)) return [];
    return [`observer.determinismRoots.schema: ${JSON.stringify(validate.errors)}`];
  } catch (error) {
    return [
      `observer.determinismRoots.schema: strict AJV compilation failed (${message(error)})`,
    ];
  }
}

export function validateDeterminismRootsContractSemantics(contract) {
  const failures = [];
  compareTree(
    failures,
    'observer.determinismRoots',
    contract,
    FROZEN_DETERMINISM_ROOTS_CONTRACT,
  );
  if (!isRecord(contract)) return uniqueFailures(failures);

  compareValue(
    failures,
    'observer.determinismRoots.observerBoundary.rawDigest',
    contract.observerBoundary?.rawDigest,
    OBSERVER_CONTRACT_RAW_DIGEST,
  );
  const predictionFields = contract.inputContract?.predictionRecordFields;
  const scientificFields = contract.scientificProjection?.includedRecordFields;
  const environmentBindingFields = contract.inputContract?.environmentBindingFields;
  const hostObservationFields = contract.inputContract?.hostObservationFields;
  if (!Array.isArray(predictionFields) || new Set(predictionFields).size !== predictionFields.length) {
    failures.push('observer.determinismRoots.inputContract.predictionRecordFields: unique ordered fields required');
  }
  if (!Array.isArray(scientificFields) || new Set(scientificFields).size !== scientificFields.length) {
    failures.push('observer.determinismRoots.scientificProjection.includedRecordFields: unique ordered fields required');
  }
  if (!Array.isArray(environmentBindingFields)
      || new Set(environmentBindingFields).size !== environmentBindingFields.length) {
    failures.push('observer.determinismRoots.inputContract.environmentBindingFields: unique ordered fields required');
  }
  if (!Array.isArray(hostObservationFields)
      || new Set(hostObservationFields).size !== hostObservationFields.length) {
    failures.push('observer.determinismRoots.inputContract.hostObservationFields: unique ordered fields required');
  }
  if (Array.isArray(predictionFields) && Array.isArray(scientificFields)) {
    const excludedRecordFields = predictionFields.filter(
      (field) => !scientificFields.includes(field),
    );
    compareTree(
      failures,
      'observer.determinismRoots.scientificProjection.excludedRecordFields.derived',
      excludedRecordFields,
      ['environmentSha256'],
    );
  }
  compareTree(
    failures,
    'observer.determinismRoots.scientificProjection.topLevelFields',
    contract.scientificProjection?.topLevelFields,
    ['schemaVersion', 'records'],
  );
  for (const requiredField of [
    ...(contract.scientificProjection?.structureIdentityFields ?? []),
    ...(contract.scientificProjection?.modelIdentityFields ?? []),
    ...(contract.scientificProjection?.outputFields ?? []),
  ]) {
    if (!scientificFields?.includes(requiredField)) {
      failures.push(
        `observer.determinismRoots.scientificProjection.${requiredField}: committed field required`,
      );
    }
  }
  for (const requiredField of [
    'schemaVersion',
    'scientificRoot',
    'environmentSha256',
    'imageConfigDigest',
    'containerId',
    'networkNamespaceIdentity',
  ]) {
    if (!contract.provenanceProjection?.topLevelFields?.includes(requiredField)) {
      failures.push(
        `observer.determinismRoots.provenanceProjection.${requiredField}: committed field required`,
      );
    }
  }
  for (const [key, quantity] of Object.entries(contract.quantityContract ?? {})) {
    if (!isRecord(quantity)
        || typeof quantity.quantity !== 'string'
        || typeof quantity.unit !== 'string'
        || typeof quantity.dimension !== 'string'
        || typeof quantity.basis !== 'string') {
      failures.push(
        `observer.determinismRoots.quantityContract.${key}: quantity/unit/dimension/basis required`,
      );
    }
  }
  if (containsPositiveClaimBoolean(contract.claims)) {
    failures.push('observer.determinismRoots.claims: all claims must remain false');
  }
  return uniqueFailures(failures);
}

export function inspectRandomTpIdManifestBytes(bytes) {
  const buffer = requireBytes(bytes, 'Random-TP ID manifest');
  const failures = [];
  let text = '';
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (error) {
    failures.push(`observer.idManifest.raw: strict UTF-8 failed (${message(error)})`);
  }
  if (sha256(buffer) !== OBSERVER_RANDOM_TP_ID_MANIFEST_RAW_DIGEST) {
    failures.push('observer.idManifest.rawDigest: exact frozen ID manifest bytes differ');
  }
  if (!text.endsWith('\n') || text.endsWith('\n\n')) {
    failures.push('observer.idManifest.terminalNewline: exactly one terminal newline required');
  }
  const ids = text.endsWith('\n') ? text.slice(0, -1).split('\n') : text.split('\n');
  if (ids.length !== RANDOM_TP_RECORD_COUNT) {
    failures.push(`observer.idManifest.count: exactly ${RANDOM_TP_RECORD_COUNT} IDs required`);
  }
  ids.forEach((id, index) => {
    if (!/^random-TP-[0-9]{6}$/.test(id)) {
      failures.push(`observer.idManifest.ids[${index}]: canonical Random-TP ID required`);
    }
    if (index > 0 && ids[index - 1] >= id) {
      failures.push(`observer.idManifest.ids[${index}]: strict ASCII order and uniqueness required`);
    }
  });
  return { ids, failures: uniqueFailures(failures) };
}

export function validateObserverContractSchema(contract, schema) {
  try {
    const ajv = new Ajv2020({
      allErrors: true,
      strict: true,
      validateFormats: false,
      validateSchema: true,
    });
    const validate = ajv.compile(schema);
    if (validate(contract)) return [];
    return [`observer.contract.schema: ${JSON.stringify(validate.errors)}`];
  } catch (error) {
    return [`observer.contract.schema: strict AJV compilation failed (${message(error)})`];
  }
}

export function validateObserverContractSemantics(contract) {
  const failures = [];
  compareTree(failures, 'observer.contract', contract, FROZEN_CONTRACT);
  if (!isRecord(contract)) return failures;

  const topology = contract.topology;
  const order = topology?.executionOrder;
  if (!Array.isArray(order) || order.length !== 4) {
    failures.push('observer.contract.topology.executionOrder: exactly four executions required');
  } else {
    const containerKeys = order.map(({ model, ordinal }) => `${model}:${ordinal}`);
    if (new Set(containerKeys).size !== 4) {
      failures.push('observer.contract.topology.executionOrder: model/ordinal pairs must be unique');
    }
    order.forEach((entry, index) => {
      const derivedAdapterRequests = [
        'benchmarkPredictionRecords',
        'invarianceProbeRecords',
        'forceFiniteDifferenceEnergyProbeRecords',
        'stressFiniteDifferenceEnergyProbeRecords',
      ].reduce((sum, field) => sum + countValue(entry?.[field]), 0);
      compareValue(failures,
        `observer.contract.topology.executionOrder[${index}].adapterRequests.derivedValue`,
        countValue(entry?.adapterRequests), derivedAdapterRequests);
    });
    const derived = deriveAccounting(order);
    compareTree(failures, 'observer.contract.topology.derivedTotals', derived, {
      authoritativeBenchmarkPredictionRecords: 1386,
      repeatValidationBenchmarkPredictionRecords: 1386,
      invarianceProbeRecords: 80,
      forceFiniteDifferenceEnergyProbeRecords: 712,
      stressFiniteDifferenceEnergyProbeRecords: 480,
      adapterRequests: 4044,
    });
    for (const [field, expected] of Object.entries(derived)) {
      compareValue(failures, `observer.contract.topology.totals.${field}.value`,
        countValue(topology?.totals?.[field]), expected);
    }
  }

  const validation = contract.validation;
  compareValue(failures, 'observer.contract.validation.invariancePerModel.derivedCases',
    validation?.invariancePerModel?.structureIds?.length
      * validation?.invariancePerModel?.transformations?.length,
    countValue(validation?.invariancePerModel?.requiredCases));
  compareValue(failures,
    'observer.contract.validation.forceFiniteDifferencePerModel.derivedEnergyProbes',
    countValue(validation?.forceFiniteDifferencePerModel?.requiredCases)
      * countValue(validation?.forceFiniteDifferencePerModel?.energyProbesPerCase),
    countValue(validation?.forceFiniteDifferencePerModel?.requiredEnergyProbes));
  compareValue(failures,
    'observer.contract.validation.stressFiniteDifferencePerModel.derivedCases',
    validation?.stressFiniteDifferencePerModel?.structureIds?.length
      * validation?.stressFiniteDifferencePerModel?.voigtModes?.length,
    countValue(validation?.stressFiniteDifferencePerModel?.requiredCases));
  compareValue(failures,
    'observer.contract.validation.stressFiniteDifferencePerModel.derivedEnergyProbes',
    countValue(validation?.stressFiniteDifferencePerModel?.requiredCases)
      * countValue(validation?.stressFiniteDifferencePerModel?.energyProbesPerCase),
    countValue(validation?.stressFiniteDifferencePerModel?.requiredEnergyProbes));
  compareValue(failures,
    'observer.contract.validation.stressSymmetry.absoluteTolerance.value',
    validation?.stressSymmetry?.absoluteTolerance?.value,
    STRESS_SYMMETRY_ABSOLUTE_TOLERANCE);
  compareValue(failures,
    'observer.contract.validation.stressSymmetry.absoluteTolerance.ieee754Binary64Hex',
    validation?.stressSymmetry?.absoluteTolerance?.ieee754Binary64Hex,
    STRESS_SYMMETRY_ABSOLUTE_TOLERANCE_BINARY64);
  compareValue(failures,
    'observer.contract.validation.stressSymmetry.relativeTolerance.value',
    validation?.stressSymmetry?.relativeTolerance?.value, 0);

  for (const [key, quantity] of Object.entries(contract.quantityContract ?? {})) {
    if (!isRecord(quantity)
        || typeof quantity.quantity !== 'string'
        || typeof quantity.unit !== 'string'
        || typeof quantity.dimension !== 'string'
        || typeof quantity.basis !== 'string') {
      failures.push(`observer.contract.quantityContract.${key}: quantity/unit/dimension/basis required`);
    }
  }
  for (const [pathLabel, quantity] of [
    ['observer.contract.validation.invariancePerModel.translationFractionalShift',
      validation?.invariancePerModel?.translationFractionalShift],
    ['observer.contract.validation.invariancePerModel.properRotation',
      validation?.invariancePerModel?.properRotation],
  ]) {
    if (!isRecord(quantity)
        || !Array.isArray(quantity.value)
        || typeof quantity.unit !== 'string'
        || typeof quantity.dimension !== 'string'
        || typeof quantity.basis !== 'string') {
      failures.push(`${pathLabel}: value/unit/dimension/basis required`);
    }
  }
  for (const field of [
    'privateExecutionAllowed',
    'aggregatePublicationAllowed',
    'runtimeRedistributionAllowed',
  ]) {
    compareValue(failures, `observer.contract.rightsPolicy.${field}`,
      contract.rightsPolicy?.[field], false);
  }
  if (containsPositiveClaimBoolean(contract.outcomePolicy?.claims)) {
    failures.push('observer.contract.outcomePolicy.claims: all claims must remain false');
  }
  compareTree(failures, 'observer.contract.outcomePolicy.claims',
    contract.outcomePolicy?.claims, CLAIMS);
  compareTree(failures, 'observer.contract.outcomePolicy.fixtureAbstentionReasons',
    contract.outcomePolicy?.fixtureAbstentionReasons, FIXTURE_ABSTENTION_REASONS);
  return uniqueFailures(failures);
}

export function inspectObserverWorkflowSource(
  sourceOrBytes,
  { enforceFrozenDigest = true } = {},
) {
  const failures = [];
  let bytes;
  let source;
  try {
    bytes = typeof sourceOrBytes === 'string'
      ? Buffer.from(sourceOrBytes, 'utf8')
      : requireBytes(sourceOrBytes, 'observer workflow');
    if (bytes.length > MAX_WORKFLOW_BYTES) {
      failures.push('observer.workflow.raw: byte limit exceeded');
      return failures;
    }
    source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch (error) {
    return [`observer.workflow.raw: strict UTF-8 failed (${message(error)})`];
  }

  if (!/^"on":\s*$/m.test(source)) {
    failures.push('observer.workflow.on.quotedKey: the on key must be quoted exactly');
  }
  if (/(?:^|[,{])\s*on\s*:/m.test(source)) {
    failures.push('observer.workflow.on.unquotedKey: unquoted on is forbidden');
  }
  if (/(?:^|[,{])\s*<<\s*:/m.test(source)) {
    failures.push('observer.workflow.yaml.merge: merge keys are forbidden');
  }
  if (/(?:^|[\s:[{,])[&*][^\s[\]{},]+/m.test(source)) {
    failures.push('observer.workflow.yaml.anchorAlias: anchors and aliases are forbidden');
  }
  if (/\$\{\{\s*secrets\./.test(source)) {
    failures.push('observer.workflow.secrets: secret expressions are forbidden');
  }
  if (/upload-artifact@|artifact\s+upload/i.test(source)) {
    failures.push('observer.workflow.artifactUpload: artifact upload is forbidden');
  }
  if (/\b(?:docker|podman|singularity)\s+(?:run|create|start)\b|run_model\.py|--model\b/i.test(source)) {
    failures.push('observer.workflow.modelDispatch: container/model dispatch is forbidden');
  }

  let document;
  try {
    document = loadYaml(source, { json: false, schema: undefined });
  } catch (error) {
    failures.push(`observer.workflow.yaml: strict parse failed (${message(error)})`);
  }
  if (document !== undefined) {
    compareTree(failures, 'observer.workflow', document, EXPECTED_WORKFLOW_DOCUMENT);
  }

  if (enforceFrozenDigest) {
    if (bytes.length !== OBSERVER_WORKFLOW_SIZE_BYTES) {
      failures.push('observer.workflow.sizeBytes: exact reviewed byte length differs');
    }
    if (sha256(bytes) !== OBSERVER_WORKFLOW_RAW_DIGEST) {
      failures.push('observer.workflow.rawDigest: exact reviewed bytes differ');
    }
  }
  return uniqueFailures(failures);
}

export async function validateObserverSourceSetRepository(
  root,
  {
    requireGitIndex = true,
    afterReadForTest,
    afterFirstIndexReadForTest,
    beforeFinalIndexReadForTest,
  } = {},
) {
  const failures = [];
  const snapshots = new Map();
  try {
    validateSourceTestHooks({
      afterReadForTest,
      afterFirstIndexReadForTest,
      beforeFinalIndexReadForTest,
    });
    for (const spec of REVIEWED_SOURCE_SPECS) {
      const snapshot = await captureReviewedFile(root, spec, { afterReadForTest });
      snapshots.set(spec.path, snapshot);
      if (sha256(snapshot.bytes) !== spec.digest()) {
        failures.push(`observer.sources.${spec.path}.rawDigest: exact reviewed bytes differ`);
      }
    }
    if (requireGitIndex) {
      await bindReviewedSnapshotsToGit(root, [...snapshots.values()], {
        afterFirstIndexReadForTest,
        beforeFinalIndexReadForTest,
      });
    }
    for (const snapshot of snapshots.values()) await assertReviewedSnapshotCurrent(snapshot);
  } catch (error) {
    failures.push(`observer.sources.repositoryIdentity: ${message(error)}`);
  }
  return { snapshots, failures: uniqueFailures(failures) };
}

export async function validateObserverWorkflowSourceRepository(
  root,
  {
    requireGitIndex = true,
    enforceFrozenDigest = true,
    workflowBytes,
    afterReadForTest,
    beforeFinalIndexReadForTest,
  } = {},
) {
  const failures = [];
  let bytes = null;
  try {
    let snapshot = null;
    if (requireGitIndex || workflowBytes === undefined) {
      snapshot = await captureReviewedFile(root, REVIEWED_SOURCE_SPECS[1], {
        afterReadForTest,
      });
      bytes = snapshot.bytes;
      if (enforceFrozenDigest && sha256(bytes) !== OBSERVER_WORKFLOW_RAW_DIGEST) {
        failures.push('observer.workflow.rawDigest: exact reviewed bytes differ');
      }
      if (workflowBytes !== undefined && !bytes.equals(requireBytes(
        workflowBytes, 'provided observer workflow',
      ))) {
        failures.push('observer.workflow.providedBytes: differ from reviewed repository bytes');
      }
    } else {
      bytes = requireBytes(workflowBytes, 'provided observer workflow');
    }
    failures.push(...inspectObserverWorkflowSource(bytes, { enforceFrozenDigest }));
    if (requireGitIndex && snapshot) {
      await bindReviewedSnapshotsToGit(root, [snapshot], { beforeFinalIndexReadForTest });
      await assertReviewedSnapshotCurrent(snapshot);
    }
  } catch (error) {
    failures.push(`observer.workflow.repository: ${message(error)}`);
  }
  return { bytes, failures: uniqueFailures(failures) };
}

export async function validateObserverContractRepository(
  contractBytes,
  {
    root,
    contractSchemaBytes,
    receiptSchemaBytes,
    determinismContractBytes,
    determinismSchemaBytes,
    workflowBytes,
    idManifestBytes,
    enforceFrozenDigests = true,
    requireWorkflowGitIndex = false,
  } = {},
) {
  if (typeof root !== 'string' || !path.isAbsolute(root)) {
    throw new TypeError('observer repository root must be absolute');
  }
  const failures = [];
  let reviewedSnapshots = null;
  if (requireWorkflowGitIndex) {
    const sourceSet = await validateObserverSourceSetRepository(root, {
      requireGitIndex: true,
    });
    failures.push(...sourceSet.failures);
    reviewedSnapshots = sourceSet.snapshots;
  }
  const selectReviewedBytes = (relativePath, provided, label) => {
    const captured = reviewedSnapshots?.get(relativePath)?.bytes;
    if (captured && provided !== undefined
        && !captured.equals(requireBytes(provided, label))) {
      failures.push(`${label}.providedBytes: differ from reviewed repository bytes`);
    }
    return captured ?? provided;
  };
  const authoritativeContractBytes = selectReviewedBytes(
    OBSERVER_CONTRACT_PATH, contractBytes, 'observer.contract',
  );
  const inspected = inspectObserverContractBytes(authoritativeContractBytes, {
    enforceFrozenDigest: enforceFrozenDigests,
  });
  failures.push(...inspected.failures);

  let schema;
  try {
    const bytes = selectReviewedBytes(
      OBSERVER_CONTRACT_SCHEMA_PATH,
      contractSchemaBytes,
      'observer.contract.schema',
    ) ?? await readBoundedFile(
      root, OBSERVER_CONTRACT_SCHEMA_PATH, MAX_SCHEMA_BYTES,
    );
    if (bytes.length > MAX_SCHEMA_BYTES) {
      throw new Error('byte limit exceeded');
    }
    if (enforceFrozenDigests && sha256(bytes) !== OBSERVER_CONTRACT_SCHEMA_RAW_DIGEST) {
      failures.push('observer.contract.schema.rawDigest: exact reviewed bytes differ');
    }
    schema = parseJsonRejectingDuplicateMembers(bytes);
  } catch (error) {
    failures.push(`observer.contract.schema.raw: unavailable (${message(error)})`);
  }
  if (inspected.contract && schema) {
    failures.push(...validateObserverContractSchema(inspected.contract, schema));
    failures.push(...validateObserverContractSemantics(inspected.contract));
  }

  let determinismRootsContract = null;
  let determinismRootsSchema = null;
  try {
    const bytes = selectReviewedBytes(
      DETERMINISM_ROOTS_CONTRACT_PATH,
      determinismContractBytes,
      'observer.determinismRoots',
    ) ?? await readBoundedFile(
      root, DETERMINISM_ROOTS_CONTRACT_PATH, MAX_CONTRACT_BYTES,
    );
    const determinismInspection = inspectDeterminismRootsContractBytes(bytes, {
      enforceFrozenDigest: enforceFrozenDigests,
    });
    failures.push(...determinismInspection.failures);
    determinismRootsContract = determinismInspection.contract;
  } catch (error) {
    failures.push(`observer.determinismRoots.raw: unavailable (${message(error)})`);
  }
  try {
    const bytes = selectReviewedBytes(
      DETERMINISM_ROOTS_CONTRACT_SCHEMA_PATH,
      determinismSchemaBytes,
      'observer.determinismRoots.schema',
    ) ?? await readBoundedFile(
      root, DETERMINISM_ROOTS_CONTRACT_SCHEMA_PATH, MAX_SCHEMA_BYTES,
    );
    const inspectedSchema = inspectDeterminismRootsSchemaBytes(bytes, {
      enforceFrozenDigest: enforceFrozenDigests,
    });
    failures.push(...inspectedSchema.failures);
    determinismRootsSchema = inspectedSchema.schema;
  } catch (error) {
    failures.push(`observer.determinismRoots.schema.raw: unavailable (${message(error)})`);
  }
  if (determinismRootsContract && determinismRootsSchema) {
    failures.push(...validateDeterminismRootsContractSchema(
      determinismRootsContract,
      determinismRootsSchema,
    ));
    failures.push(...validateDeterminismRootsContractSemantics(
      determinismRootsContract,
    ));
  }

  try {
    const predecessorBytes = await readBoundedFile(
      root, OBSERVER_PREDECESSOR_PATH, MAX_CONTRACT_BYTES,
    );
    if (inspected.contract
        && sha256(predecessorBytes) !== inspected.contract.predecessor?.rawDigest) {
      failures.push('observer.contract.predecessor.rawDigest: actual predecessor bytes differ');
    }
  } catch (error) {
    failures.push(`observer.contract.predecessor.raw: unavailable (${message(error)})`);
  }

  try {
    const bytes = idManifestBytes ?? await readBoundedFile(
      root, OBSERVER_RANDOM_TP_ID_MANIFEST_PATH, MAX_ID_MANIFEST_BYTES,
    );
    if (bytes.length > MAX_ID_MANIFEST_BYTES) {
      failures.push('observer.idManifest.raw: byte limit exceeded');
    } else {
      failures.push(...inspectRandomTpIdManifestBytes(bytes).failures);
    }
  } catch (error) {
    failures.push(`observer.idManifest.raw: unavailable (${message(error)})`);
  }

  try {
    const legacyBytes = await readBoundedFile(
      root, LEGACY_RECEIPT_SCHEMA_PATH, MAX_SCHEMA_BYTES,
    );
    if (sha256(legacyBytes) !== LEGACY_RECEIPT_SCHEMA_RAW_DIGEST) {
      failures.push('observer.legacyReceiptBoundary.rawDigest: v0.2 receipt bytes changed');
    }
  } catch (error) {
    failures.push(`observer.legacyReceiptBoundary.raw: unavailable (${message(error)})`);
  }

  if (inspected.contract) {
    failures.push(...await validateRightsEvidenceBindings(inspected.contract, root));
  }

  const authoritativeWorkflowBytes = selectReviewedBytes(
    OBSERVER_WORKFLOW_SOURCE_PATH, workflowBytes, 'observer.workflow',
  );
  const workflowValidation = await validateObserverWorkflowSourceRepository(root, {
    requireGitIndex: false,
    enforceFrozenDigest: enforceFrozenDigests,
    workflowBytes: authoritativeWorkflowBytes,
  });
  failures.push(...workflowValidation.failures);
  const workflowSourceBytes = workflowValidation.bytes;

  let receiptSchema;
  let fixtureReceipt = null;
  try {
    const bytes = selectReviewedBytes(
      OBSERVER_RECEIPT_SCHEMA_PATH,
      receiptSchemaBytes,
      'observer.receipt.schema',
    ) ?? await readBoundedFile(
      root, OBSERVER_RECEIPT_SCHEMA_PATH, MAX_SCHEMA_BYTES,
    );
    const inspectedSchema = inspectObserverReceiptSchemaBytes(bytes, {
      enforceFrozenDigest: enforceFrozenDigests,
    });
    failures.push(...inspectedSchema.failures);
    receiptSchema = inspectedSchema.schema;
  } catch (error) {
    failures.push(`observer.receipt.schema.raw: unavailable or invalid (${message(error)})`);
  }
  if (inspected.contract && receiptSchema && workflowSourceBytes) {
    try {
      fixtureReceipt = buildFixtureReceipt(
        inspected.contract,
        workflowSourceBytes,
        determinismRootsContract ?? FROZEN_DETERMINISM_ROOTS_CONTRACT,
      );
      failures.push(...validateFixtureReceipt(
        fixtureReceipt,
        receiptSchema,
        inspected.contract,
        determinismRootsContract ?? FROZEN_DETERMINISM_ROOTS_CONTRACT,
      ));
    } catch (error) {
      failures.push(`observer.receipt.fixtureBuild: ${message(error)}`);
    }
  }

  return {
    contract: inspected.contract,
    determinismRootsContract,
    determinismRootsSchema,
    receiptSchema,
    fixtureReceipt,
    workflowBytes: workflowSourceBytes ?? null,
    failures: uniqueFailures(failures),
  };
}

async function validateRightsEvidenceBindings(contract, root) {
  const failures = [];
  const bindings = contract.rightsPolicy?.evidenceBindings;
  if (!isRecord(bindings)) {
    return ['observer.contract.rightsPolicy.evidenceBindings: required'];
  }
  let datasetCatalog;
  let reproductionPlan;
  let runtimeLock;
  try {
    const bytes = await readBoundedFile(root, RIGHTS_DATASET_CATALOG_PATH, MAX_CONTRACT_BYTES);
    compareValue(failures,
      'observer.contract.rightsPolicy.evidenceBindings.datasetCatalog.rawDigest.actual',
      sha256(bytes), bindings.datasetCatalog?.rawDigest);
    datasetCatalog = parseJsonRejectingDuplicateMembers(bytes);
  } catch (error) {
    failures.push(`observer.rights.datasetCatalog: unavailable (${message(error)})`);
  }
  if (datasetCatalog) {
    compareValue(failures, 'observer.rights.datasetCatalog.schemaVersion',
      datasetCatalog.schemaVersion, bindings.datasetCatalog?.schemaVersion);
    const dataset = datasetCatalog.datasets?.find(
      ({ id }) => id === bindings.datasetCatalog?.datasetId,
    );
    compareValue(failures, 'observer.rights.datasetCatalog.randomTp.sha256',
      dataset?.sha256, bindings.datasetCatalog?.datasetDigest);
    compareValue(failures, 'observer.rights.datasetCatalog.randomTp.license',
      dataset?.license, bindings.datasetCatalog?.licenseStatus);
    compareValue(failures, 'observer.rights.datasetCatalog.randomTp.redistribute',
      dataset?.redistribute, false);
  }
  try {
    const bytes = await readBoundedFile(root, RIGHTS_REPRODUCTION_PLAN_PATH, MAX_CONTRACT_BYTES);
    compareValue(failures,
      'observer.contract.rightsPolicy.evidenceBindings.reproductionPlan.rawDigest.actual',
      sha256(bytes), bindings.reproductionPlan?.rawDigest);
    reproductionPlan = parseJsonRejectingDuplicateMembers(bytes);
  } catch (error) {
    failures.push(`observer.rights.reproductionPlan: unavailable (${message(error)})`);
  }
  if (reproductionPlan) {
    compareValue(failures, 'observer.rights.reproductionPlan.schemaVersion',
      reproductionPlan.schemaVersion, bindings.reproductionPlan?.schemaVersion);
    for (const field of ['mattersim', 'mace']) {
      const expected = bindings.reproductionPlan?.[field];
      const model = reproductionPlan.models?.find(({ id }) => id === expected?.modelId);
      compareValue(failures, `observer.rights.reproductionPlan.${field}.packageVersion`,
        model?.package?.version, expected?.packageVersion);
      compareValue(failures, `observer.rights.reproductionPlan.${field}.sourceCommit`,
        model?.sourceCommit, expected?.sourceCommit);
      compareValue(failures, `observer.rights.reproductionPlan.${field}.license`,
        model?.license, expected?.codeAndModelLicense);
      compareValue(failures, `observer.rights.reproductionPlan.${field}.checkpointDigest`,
        model?.checkpoint?.sha256, expected?.checkpointDigest);
    }
  }
  try {
    const bytes = await readBoundedFile(root, RIGHTS_RUNTIME_LOCK_PATH, MAX_CONTRACT_BYTES);
    compareValue(failures,
      'observer.contract.rightsPolicy.evidenceBindings.runtimeLock.rawDigest.actual',
      sha256(bytes), bindings.runtimeLock?.rawDigest);
    runtimeLock = parseJsonRejectingDuplicateMembers(bytes);
  } catch (error) {
    failures.push(`observer.rights.runtimeLock: unavailable (${message(error)})`);
  }
  if (runtimeLock) {
    compareValue(failures, 'observer.rights.runtimeLock.schemaVersion',
      runtimeLock.schemaVersion, bindings.runtimeLock?.schemaVersion);
    compareValue(failures, 'observer.rights.runtimeLock.state',
      runtimeLock.state, bindings.runtimeLock?.state);
    compareValue(failures, 'observer.rights.runtimeLock.mattersimDependencyLockDigest',
      runtimeLock.identities?.dependencyLockDigests?.mattersim,
      bindings.runtimeLock?.mattersimDependencyLockDigest);
    compareValue(failures, 'observer.rights.runtimeLock.maceDependencyLockDigest',
      runtimeLock.identities?.dependencyLockDigests?.mace,
      bindings.runtimeLock?.maceDependencyLockDigest);
  }
  try {
    const bytes = await readBoundedFile(root, RIGHTS_MACE_NOTICE_PATH, MAX_CONTRACT_BYTES);
    compareValue(failures,
      'observer.contract.rightsPolicy.evidenceBindings.maceRuntimeLicenseNotice.rawDigest.actual',
      sha256(bytes), bindings.maceRuntimeLicenseNotice?.rawDigest);
    const source = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (!source.includes('`python-hostlist` 2.3.0 is GPL-2.0-or-later')) {
      failures.push('observer.rights.maceRuntimeLicenseNotice.pythonHostlist: exact GPL fact missing');
    }
  } catch (error) {
    failures.push(`observer.rights.maceRuntimeLicenseNotice: unavailable (${message(error)})`);
  }
  return uniqueFailures(failures);
}

export function stressSymmetryResidual(stress) {
  requireMatrix3(stress, 'stress');
  let maximum = 0;
  for (let i = 0; i < 3; i += 1) {
    for (let j = 0; j < 3; j += 1) {
      maximum = Math.max(maximum, Math.abs(stress[i][j] - stress[j][i]));
    }
  }
  return maximum;
}

export function passesStressSymmetry(stress) {
  return stressSymmetryResidual(stress) <= STRESS_SYMMETRY_ABSOLUTE_TOLERANCE;
}

export function assessCalculatorNativeStressForSymmetry(nativeStress) {
  if (Array.isArray(nativeStress)
      && nativeStress.length === 6
      && nativeStress.every((value) => Number.isFinite(value))) {
    return Object.freeze({
      sourceRepresentation: 'calculator-native-voigt6',
      sourceStatus: 'raw-full-3x3-unavailable',
      gateDecision: 'abstain',
      conversionAllowed: false,
      residual: null,
      reason: 'native-voigt6-cannot-establish-pre-conversion-antisymmetry',
    });
  }
  requireMatrix3(nativeStress, 'calculator-native stress');
  const residual = stressSymmetryResidual(nativeStress);
  const accepted = residual <= STRESS_SYMMETRY_ABSOLUTE_TOLERANCE;
  return Object.freeze({
    sourceRepresentation: 'calculator-native-full-3x3',
    sourceStatus: 'raw-full-3x3-observed',
    gateDecision: accepted ? 'pass' : 'fail',
    conversionAllowed: accepted,
    residual,
    reason: accepted ? null : 'raw-full-3x3-stress-symmetry-gate-failed',
  });
}

export function forceRichardson({
  energyPlusH,
  energyMinusH,
  energyPlusHalfH,
  energyMinusHalfH,
  h,
}) {
  requirePositiveFinite(h, 'force h');
  const values = [energyPlusH, energyMinusH, energyPlusHalfH, energyMinusHalfH];
  values.forEach((value, index) => requireFinite(value, `force energy ${index}`));
  const full = -(energyPlusH - energyMinusH) / (2 * h);
  const half = -(energyPlusHalfH - energyMinusHalfH) / h;
  return (4 * half - full) / 3;
}

export function stressRichardson({
  energyPlusH,
  energyMinusH,
  energyPlusHalfH,
  energyMinusHalfH,
  h,
  referenceVolume,
}) {
  requirePositiveFinite(h, 'stress h');
  requirePositiveFinite(referenceVolume, 'reference volume');
  const values = [energyPlusH, energyMinusH, energyPlusHalfH, energyMinusHalfH];
  values.forEach((value, index) => requireFinite(value, `stress energy ${index}`));
  const full = (energyPlusH - energyMinusH) / (2 * h * referenceVolume);
  const half = (energyPlusHalfH - energyMinusHalfH) / (h * referenceVolume);
  return (4 * half - full) / 3;
}

export function passesAbsoluteRelative(
  analytic,
  finiteDifference,
  absoluteTolerance,
  relativeTolerance,
) {
  [analytic, finiteDifference, absoluteTolerance, relativeTolerance]
    .forEach((value, index) => requireFinite(value, `tolerance input ${index}`));
  if (absoluteTolerance < 0 || relativeTolerance < 0) {
    throw new RangeError('tolerances must be non-negative');
  }
  return Math.abs(analytic - finiteDifference)
    <= absoluteTolerance
      + relativeTolerance * Math.max(Math.abs(analytic), Math.abs(finiteDifference));
}

export function nextBinary64(value, direction) {
  requireFinite(value, 'nextBinary64 value');
  if (![Number.NEGATIVE_INFINITY, Number.POSITIVE_INFINITY].includes(direction)) {
    throw new TypeError('nextBinary64 direction must be positive or negative infinity');
  }
  if (Object.is(value, -0)) value = 0;
  if (value === 0) return direction > 0 ? Number.MIN_VALUE : -Number.MIN_VALUE;
  const buffer = new ArrayBuffer(8);
  const view = new DataView(buffer);
  view.setFloat64(0, value, false);
  let bits = view.getBigUint64(0, false);
  const increment = (value > 0) === (direction > 0);
  bits = increment ? bits + 1n : bits - 1n;
  view.setBigUint64(0, bits, false);
  return view.getFloat64(0, false);
}

export function parsePredictionJsonlForDeterminism(bytes) {
  const buffer = requireBytes(bytes, 'prediction JSONL');
  const maximumBytes = FROZEN_DETERMINISM_ROOTS_CONTRACT
    .inputContract.maximumPredictionJsonlBytes.value;
  if (buffer.length === 0 || buffer.length > maximumBytes) {
    throw new TypeError(`prediction JSONL must contain 1..${maximumBytes} bytes`);
  }
  let source;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (error) {
    throw new TypeError(`prediction JSONL must be strict UTF-8 (${message(error)})`);
  }
  if (!source.endsWith('\n') || source.endsWith('\n\n') || source.includes('\r')) {
    throw new TypeError('prediction JSONL must use LF and exactly one terminal LF');
  }
  const lines = source.slice(0, -1).split('\n');
  if (lines.length !== RANDOM_TP_RECORD_COUNT || lines.some((line) => line.length === 0)) {
    throw new TypeError(`prediction JSONL must contain exactly ${RANDOM_TP_RECORD_COUNT} non-empty records`);
  }
  const records = lines.map((line, index) => {
    try {
      return parseJsonRejectingDuplicateMembers(Buffer.from(line, 'utf8'));
    } catch (error) {
      throw new TypeError(`prediction JSONL record ${index} is invalid (${message(error)})`);
    }
  });
  validateScientificPredictionRecords(records);
  return records;
}

export function parseExecutionProvenanceForDeterminism(bytes) {
  const buffer = requireBytes(bytes, 'execution provenance');
  const maximumBytes = FROZEN_DETERMINISM_ROOTS_CONTRACT
    .inputContract.maximumExecutionProvenanceBytes.value;
  if (buffer.length === 0 || buffer.length > maximumBytes) {
    throw new TypeError(`execution provenance must contain 1..${maximumBytes} bytes`);
  }
  let source;
  try {
    source = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch (error) {
    throw new TypeError(`execution provenance must be strict UTF-8 (${message(error)})`);
  }
  if (!source.endsWith('\n') || source.endsWith('\n\n') || source.includes('\r')) {
    throw new TypeError('execution provenance must use LF and exactly one terminal LF');
  }
  let provenance;
  try {
    provenance = parseJsonRejectingDuplicateMembers(buffer);
  } catch (error) {
    throw new TypeError(`execution provenance JSON is invalid (${message(error)})`);
  }
  validateExecutionProvenance(provenance);
  return provenance;
}

export function validateScientificPredictionRecords(records) {
  if (!Array.isArray(records) || records.length !== RANDOM_TP_RECORD_COUNT) {
    throw new TypeError(`scientific records must contain exactly ${RANDOM_TP_RECORD_COUNT} entries`);
  }
  requireDenseArray(records, RANDOM_TP_RECORD_COUNT, 'scientific records');
  const expectedFields = FROZEN_DETERMINISM_ROOTS_CONTRACT
    .inputContract.predictionRecordFields;
  let executionEnvironmentSha256 = null;
  let executionModelBinding = null;
  for (const [index, record] of records.entries()) {
    const label = `scientific records[${index}]`;
    requireExactKeysOrThrow(record, expectedFields, label);
    if (record.schemaVersion !== FROZEN_DETERMINISM_ROOTS_CONTRACT
      .inputContract.predictionSchemaVersion) {
      throw new TypeError(`${label}.schemaVersion is not the frozen prediction schema`);
    }
    if (record.status !== 'success') {
      throw new TypeError(`${label}.status must be success`);
    }
    if (record.id !== randomTpIds[index]) {
      throw new TypeError(`${label}.id differs from the frozen ASCII-ordered manifest`);
    }
    for (const field of [
      'inputStructureDigest',
      'checkpointSha256',
      'packageSha256',
      'runnerSha256',
      'environmentSha256',
    ]) {
      if (typeof record[field] !== 'string' || !DIGEST_PATTERN.test(record[field])) {
        throw new TypeError(`${label}.${field} must be one lowercase SHA-256 digest`);
      }
    }
    if (record.atomCount !== PREDICTION_RECORD_ATOM_COUNT) {
      throw new TypeError(`${label}.atomCount must equal ${PREDICTION_RECORD_ATOM_COUNT}`);
    }
    requireDenseArray(
      record.atomicNumbers,
      PREDICTION_RECORD_ATOM_COUNT,
      `${label}.atomicNumbers`,
    );
    record.atomicNumbers.forEach((atomicNumber, atomIndex) => {
      if (!Number.isSafeInteger(atomicNumber) || atomicNumber < 1 || atomicNumber > 118) {
        throw new TypeError(`${label}.atomicNumbers[${atomIndex}] must be an integer from 1 through 118`);
      }
    });
    requireFinite(record.energyEv, `${label}.energyEv`);
    requireDenseArray(
      record.forcesEvPerAngstrom,
      PREDICTION_RECORD_ATOM_COUNT,
      `${label}.forcesEvPerAngstrom`,
    );
    record.forcesEvPerAngstrom.forEach((force, atomIndex) => {
      requireDenseArray(force, 3, `${label}.forcesEvPerAngstrom[${atomIndex}]`);
      force.forEach((component, componentIndex) => requireFinite(
        component,
        `${label}.forcesEvPerAngstrom[${atomIndex}][${componentIndex}]`,
      ));
    });
    requireMatrix3(record.stressAseEvPerAngstrom3, `${label}.stressAseEvPerAngstrom3`);

    const modelBinding = FROZEN_DETERMINISM_ROOTS_CONTRACT.modelBindings.models.find(
      ({ modelId }) => modelId === record.modelId,
    );
    if (!modelBinding) throw new TypeError(`${label}.modelId is outside the frozen model set`);
    if (record.checkpointSha256 !== modelBinding.checkpointSha256
        || record.packageSha256 !== modelBinding.packageSha256
        || record.runnerSha256
          !== FROZEN_DETERMINISM_ROOTS_CONTRACT.modelBindings.runnerSha256) {
      throw new TypeError(`${label} model/checkpoint/package/runner identity is not frozen`);
    }
    if (executionModelBinding === null) executionModelBinding = modelBinding;
    if (modelBinding.modelId !== executionModelBinding.modelId) {
      throw new TypeError(`${label}.modelId differs within one model execution`);
    }
    if (executionEnvironmentSha256 === null) {
      executionEnvironmentSha256 = record.environmentSha256;
    }
    if (record.environmentSha256 !== executionEnvironmentSha256) {
      throw new TypeError(`${label}.environmentSha256 differs within one execution`);
    }
  }
  return records;
}

export function canonicalScientificPayload(recordsOrBytes) {
  const records = normalizePredictionRecordsInput(recordsOrBytes);
  return buildScientificProjectionBytes(records);
}

export function canonicalProvenancePayload(recordsOrBytes, executionProvenance) {
  const records = normalizePredictionRecordsInput(recordsOrBytes);
  const provenance = normalizeExecutionProvenanceInput(executionProvenance);
  const scientificBytes = buildScientificProjectionBytes(records);
  return buildProvenanceProjectionBytes(
    records,
    provenance,
    sha256(scientificBytes),
  );
}

export function canonicalDeterminismRoots(recordsOrBytes, executionProvenance) {
  const records = normalizePredictionRecordsInput(recordsOrBytes);
  const provenance = normalizeExecutionProvenanceInput(executionProvenance);
  const scientificBytes = buildScientificProjectionBytes(records);
  const scientificRoot = sha256(scientificBytes);
  const provenanceBytes = buildProvenanceProjectionBytes(
    records,
    provenance,
    scientificRoot,
  );
  return {
    scientific: {
      schemaVersion: FROZEN_DETERMINISM_ROOTS_CONTRACT.scientificProjection.schemaVersion,
      bytes: scientificBytes,
      root: scientificRoot,
    },
    provenance: {
      schemaVersion: FROZEN_DETERMINISM_ROOTS_CONTRACT.provenanceProjection.schemaVersion,
      bytes: provenanceBytes,
      root: sha256(provenanceBytes),
    },
  };
}

export function validateDeterminismFixture(
  authoritative,
  repeat,
  authoritativeProvenance,
  repeatProvenance,
) {
  const failures = [];
  if (!Array.isArray(authoritative) || authoritative.length !== 693) {
    failures.push('observer.fixture.determinism.authoritative.records: exactly 693 required');
  }
  if (!Array.isArray(repeat) || repeat.length !== 693) {
    failures.push('observer.fixture.determinism.repeat.records: exactly 693 required');
  }
  if (failures.length) return failures;
  let authoritativeRoots;
  let repeatRoots;
  try {
    authoritativeRoots = canonicalDeterminismRoots(
      authoritative,
      authoritativeProvenance,
    );
    repeatRoots = canonicalDeterminismRoots(repeat, repeatProvenance);
  } catch (error) {
    return [`observer.fixture.determinism.projections: ${message(error)}`];
  }
  if (!authoritativeRoots.scientific.bytes.equals(repeatRoots.scientific.bytes)) {
    failures.push('observer.fixture.determinism.canonicalScientificPayloadBytes: mismatch');
  }
  if (authoritativeRoots.scientific.root !== repeatRoots.scientific.root) {
    failures.push('observer.fixture.determinism.canonicalScientificPayloadRoot: mismatch');
  }
  if (authoritativeRoots.provenance.bytes.equals(repeatRoots.provenance.bytes)) {
    failures.push('observer.fixture.determinism.canonicalProvenancePayloadBytes: fresh executions must differ');
  }
  if (authoritativeRoots.provenance.root === repeatRoots.provenance.root) {
    failures.push('observer.fixture.determinism.canonicalProvenancePayloadRoot: fresh executions must differ');
  }
  if (authoritativeProvenance?.hostObservation?.containerId
      === repeatProvenance?.hostObservation?.containerId) {
    failures.push('observer.fixture.determinism.containerId: fresh executions must differ');
  }
  if (authoritativeProvenance?.hostObservation?.networkNamespaceIdentity
      === repeatProvenance?.hostObservation?.networkNamespaceIdentity) {
    failures.push('observer.fixture.determinism.networkNamespaceIdentity: fresh executions must differ');
  }
  return failures;
}

export function buildSyntheticCampaignFixture(contract = FROZEN_CONTRACT) {
  const provenanceFor = (model, ordinal, modelIndex) => {
    const containerId = `fixture-${model}-${ordinal}`;
    const networkNamespaceIdentity =
      `net:[${4_026_533_000 + modelIndex * 2 + ordinal}]`;
    const imageConfigDigest = `sha256:${'0'.repeat(64)}`;
    const modelBinding = FROZEN_DETERMINISM_ROOTS_CONTRACT.modelBindings.models.find(
      ({ model: candidate }) => candidate === model,
    );
    const fixed = FROZEN_DETERMINISM_ROOTS_CONTRACT
      .inputContract.environmentBindingFixedValues;
    const networkProof = () => ({
      egress_disabled: true,
      network_namespace: networkNamespaceIdentity,
      effective_capabilities: '0x0000000000000000',
      interfaces: ['lo'],
      ipv4_routes: [],
      ipv6_routes: [],
      probes: [
        {
          family: 'ipv4',
          address: '192.0.2.1',
          port: 9,
          blockedErrno: 101,
          blockedReason: 'Network is unreachable',
        },
        {
          family: 'ipv6',
          address: '2001:db8::1',
          port: 9,
          blockedErrno: 101,
          blockedReason: 'Network is unreachable',
        },
      ],
      escape_sockets_absent: true,
      method: 'isolated Linux network namespace; loopback-only interface set; no non-loopback IPv4/IPv6 route; TEST-NET probes rejected; known host-control sockets absent',
    });
    const environmentBinding = {
      planSha256: fixed.planSha256,
      runnerSha256: fixed.runnerSha256,
      pythonVersion: fixed.pythonVersion,
      pythonImplementation: fixed.pythonImplementation,
      system: fixed.system,
      machine: fixed.machine,
      device: fixed.device,
      dtype: fixed.dtype,
      batchSize: fixed.batchSize,
      threads: fixed.threads,
      adapter: modelBinding.adapter,
      numpyVersion: fixed.numpyVersion,
      torchVersion: fixed.torchVersion,
      installedDistributionsSha256: sha256(Buffer.from(
        `synthetic-installed-distributions:${model}`,
        'utf8',
      )),
      dependencyLockSha256: modelBinding.dependencyLockSha256,
      containerIdentity: {
        kind: 'docker-local-load-config-id',
        configImageId: imageConfigDigest,
        scope: 'run-specific',
        promotionTrustRoot: false,
        registryManifestDigest: null,
      },
      executionIdentityComplete: fixed.executionIdentityComplete,
      workflowRevision: '0'.repeat(40),
      runtimeSourceRevision: '0'.repeat(40),
      evidenceClass: fixed.evidenceClass,
      promotionEligible: fixed.promotionEligible,
      comparable: fixed.comparable,
      reproduced: fixed.reproduced,
      structureBundleSha256: fixed.structureBundleSha256,
      structureManifestFileSha256: fixed.structureManifestFileSha256,
      networkProofStart: networkProof(),
      networkProofEnd: networkProof(),
    };
    return {
      schemaVersion: FROZEN_DETERMINISM_ROOTS_CONTRACT
        .inputContract.executionProvenanceSchemaVersion,
      environmentBinding,
      environmentSha256: sha256(Buffer.from(canonicalJson(environmentBinding), 'utf8')),
      hostObservation: {
        imageConfigDigest,
        containerId,
        networkNamespaceIdentity,
      },
    };
  };
  const recordsFor = (modelBinding, executionProvenance) => randomTpIds.map(
    (id, index) => {
      const diagonal = index / 10_000;
      const shear = index / 20_000;
      return {
        schemaVersion: FROZEN_DETERMINISM_ROOTS_CONTRACT
          .inputContract.predictionSchemaVersion,
        id,
        inputStructureDigest: sha256(Buffer.from(`synthetic-structure:${id}`, 'utf8')),
        atomCount: PREDICTION_RECORD_ATOM_COUNT,
        atomicNumbers: Array.from(
          { length: PREDICTION_RECORD_ATOM_COUNT },
          (_, atomIndex) => (index + atomIndex) % 89 + 1,
        ),
        modelId: modelBinding.modelId,
        checkpointSha256: modelBinding.checkpointSha256,
        packageSha256: modelBinding.packageSha256,
        runnerSha256: FROZEN_DETERMINISM_ROOTS_CONTRACT.modelBindings.runnerSha256,
        environmentSha256: executionProvenance.environmentSha256,
        status: 'success',
        energyEv: index / 1_000,
        forcesEvPerAngstrom: Array.from(
          { length: PREDICTION_RECORD_ATOM_COUNT },
          (_, atomIndex) => [
            index / 100 + atomIndex / 10_000,
            -index / 200 - atomIndex / 20_000,
            index / 400 + atomIndex / 40_000,
          ],
        ),
        stressAseEvPerAngstrom3: [
          [diagonal, shear, -shear],
          [shear, diagonal / 2, shear / 2],
          [-shear, shear / 2, diagonal / 4],
        ],
      };
    },
  );
  const modelFixtures = FROZEN_DETERMINISM_ROOTS_CONTRACT.modelBindings.models.map(
    (modelBinding, modelIndex) => {
      const model = modelBinding.model;
      const authoritativeProvenance = provenanceFor(model, 0, modelIndex);
      const repeatProvenance = provenanceFor(model, 1, modelIndex);
      return {
        model,
        authoritativeOrdinal: 0,
        repeatOrdinal: 1,
        authoritativeContainerId: authoritativeProvenance.hostObservation.containerId,
        repeatContainerId: repeatProvenance.hostObservation.containerId,
        authoritativeOutput: `/fixture/${model}/0`,
        repeatOutput: `/fixture/${model}/1`,
        authoritativeProvenance,
        repeatProvenance,
        authoritative: recordsFor(modelBinding, authoritativeProvenance),
        repeat: recordsFor(modelBinding, repeatProvenance),
        invarianceCases: contract.validation.invariancePerModel.structureIds.flatMap(
          (id) => contract.validation.invariancePerModel.transformations.map(
            (transformation) => ({
              id,
              transformation,
              energyError: 0,
              forceVectorError: 0,
              stressFrobeniusError: 0,
              probeRecords: 1,
            }),
          ),
        ),
        forceFiniteDifferenceCases: Array.from({ length: 89 }, (_, elementIndex) => ({
          syntheticElementOrdinal: elementIndex + 1,
          selectionToken: `synthetic-selection-${String(elementIndex + 1).padStart(2, '0')}`,
          probeRecords: 4,
          normalizedError: 0,
        })),
        stressFiniteDifferenceCases:
          contract.validation.stressFiniteDifferencePerModel.structureIds.flatMap(
            (id) => contract.validation.stressFiniteDifferencePerModel.voigtModes.map((mode) => ({
              id,
              mode,
              probeRecords: 4,
              normalizedError: 0,
            })),
          ),
      };
    },
  );
  return {
    evidenceClass: FIXTURE_EVIDENCE_CLASS,
    models: modelFixtures,
    syntheticHostObservations: contract.topology.executionOrder.map((execution, index) => ({
      evidenceClass: FIXTURE_EVIDENCE_CLASS,
      repositoryId: 1_349_498_456,
      revision: 'fixture-not-run',
      workflowPath: OBSERVER_WORKFLOW_SOURCE_PATH,
      workflowBlobDigest: OBSERVER_WORKFLOW_RAW_DIGEST,
      workflowRunId: 'fixture-not-run',
      runAttempt: 0,
      jobId: 'fixture-not-run',
      runnerOs: 'linux',
      runnerArchitecture: 'amd64',
      runnerImage: 'fixture-not-observed',
      dockerServerVersion: 'fixture-not-observed',
      imagePlatformManifestDigest: `sha256:${'0'.repeat(64)}`,
      imageConfigDigest: `sha256:${'0'.repeat(64)}`,
      sequence: execution.sequence,
      model: execution.model,
      modelId: execution.modelId,
      ordinal: execution.ordinal,
      role: execution.role,
      containerId: `fixture-${execution.model}-${execution.ordinal}`,
      outputDirectory: `/fixture/${execution.model}/${execution.ordinal}`,
      startedAtMonotonicNs: index * 3_000_000_000 + 1,
      endedAtMonotonicNs: index * 3_000_000_000 + 2_000_000_001,
      exitCode: 0,
      argv: ['fixture-only-no-dispatch'],
      mounts: [],
      environmentKeyAllowlist: [],
      networkMode: 'none',
      readonlyRootfs: true,
      user: '65532:65532',
      capDrop: ['ALL'],
      securityOpt: ['no-new-privileges:true'],
      hostSocketsMounted: false,
      hostSecretsMounted: false,
      referenceLabelsMounted: false,
      writableMountCount: 1,
      gpuDeviceRequests: [],
      containerSelfReportTrusted: false,
      canaryObserved: false,
      readDenialProbeDenied: true,
      cpuQuotaCores: 1,
      memoryLimitBytes: 1_073_741_824,
      memoryPeakBytes: 536_870_912,
      pidsLimit: 128,
      cpuTimeSeconds: 1,
      wallTimeSeconds: 2,
      identityAssignmentAuthority:
        'host-observer-from-frozen-execution-order-not-container-self-report/v1',
      hostObservationSource: 'synthetic-host-observer-fixture-not-container-self-report',
    })),
  };
}

export function validateSyntheticCampaignFixture(fixture, contract = FROZEN_CONTRACT) {
  const failures = [];
  requireExactObjectKeys(failures, 'observer.fixture', fixture, [
    'evidenceClass', 'models', 'syntheticHostObservations',
  ]);
  if (fixture?.evidenceClass !== FIXTURE_EVIDENCE_CLASS) {
    failures.push('observer.fixture.evidenceClass: synthetic fixture class required');
  }
  if (!Array.isArray(fixture?.models) || fixture.models.length !== 2) {
    failures.push('observer.fixture.models: MatterSim and MACE fixtures required');
    return failures;
  }
  for (const [modelIndex, expectedModel] of ['mattersim', 'mace'].entries()) {
    const model = fixture.models[modelIndex];
    const prefix = `observer.fixture.models[${modelIndex}]`;
    requireExactObjectKeys(failures, prefix, model, [
      'model',
      'authoritativeOrdinal',
      'repeatOrdinal',
      'authoritativeContainerId',
      'repeatContainerId',
      'authoritativeOutput',
      'repeatOutput',
      'authoritativeProvenance',
      'repeatProvenance',
      'authoritative',
      'repeat',
      'invarianceCases',
      'forceFiniteDifferenceCases',
      'stressFiniteDifferenceCases',
    ]);
    compareValue(failures, `${prefix}.model`, model?.model, expectedModel);
    compareValue(failures, `${prefix}.authoritativeOrdinal`,
      model?.authoritativeOrdinal, 0);
    compareValue(failures, `${prefix}.repeatOrdinal`, model?.repeatOrdinal, 1);
    if (model?.authoritativeContainerId === model?.repeatContainerId) {
      failures.push(`${prefix}.containerIds: authoritative and repeat must be distinct`);
    }
    if (model?.authoritativeOutput === model?.repeatOutput) {
      failures.push(`${prefix}.outputDirectories: writable outputs must be distinct`);
    }
    const authoritativeObservation = fixture?.syntheticHostObservations?.[modelIndex * 2];
    const repeatObservation = fixture?.syntheticHostObservations?.[modelIndex * 2 + 1];
    compareValue(failures, `${prefix}.authoritativeContainerId`,
      model?.authoritativeContainerId, authoritativeObservation?.containerId);
    compareValue(failures, `${prefix}.repeatContainerId`,
      model?.repeatContainerId, repeatObservation?.containerId);
    compareValue(failures, `${prefix}.authoritativeOutput`,
      model?.authoritativeOutput, authoritativeObservation?.outputDirectory);
    compareValue(failures, `${prefix}.repeatOutput`,
      model?.repeatOutput, repeatObservation?.outputDirectory);
    compareValue(failures, `${prefix}.authoritativeProvenance.containerId`,
      model?.authoritativeProvenance?.hostObservation?.containerId,
      authoritativeObservation?.containerId);
    compareValue(failures, `${prefix}.repeatProvenance.containerId`,
      model?.repeatProvenance?.hostObservation?.containerId,
      repeatObservation?.containerId);
    compareValue(failures, `${prefix}.authoritativeProvenance.imageConfigDigest`,
      model?.authoritativeProvenance?.hostObservation?.imageConfigDigest,
      authoritativeObservation?.imageConfigDigest);
    compareValue(failures, `${prefix}.repeatProvenance.imageConfigDigest`,
      model?.repeatProvenance?.hostObservation?.imageConfigDigest,
      repeatObservation?.imageConfigDigest);
    validateBenchmarkFixtureRecords(failures, `${prefix}.authoritative`,
      model?.authoritative);
    validateBenchmarkFixtureRecords(failures, `${prefix}.repeat`, model?.repeat);
    failures.push(...validateDeterminismFixture(
      model?.authoritative,
      model?.repeat,
      model?.authoritativeProvenance,
      model?.repeatProvenance,
    ).map((failure) => failure.replace('observer.fixture.determinism', `${prefix}.determinism`)));
    validateCaseSet(failures, `${prefix}.invarianceCases`, model?.invarianceCases,
      contract.validation.invariancePerModel.structureIds.flatMap(
        (id) => contract.validation.invariancePerModel.transformations.map(
          (transformation) => `${id}:${transformation}`,
        ),
      ),
      (entry) => `${entry.id}:${entry.transformation}`,
      (entry) => entry.probeRecords === 1
        && finiteNonNegativeAtMost(entry.energyError, 0.0001)
        && finiteNonNegativeAtMost(entry.forceVectorError, 0.0001)
        && finiteNonNegativeAtMost(entry.stressFrobeniusError, 0.00001),
      ['id', 'transformation', 'energyError', 'forceVectorError',
        'stressFrobeniusError', 'probeRecords']);
    validateCaseSet(failures, `${prefix}.forceFiniteDifferenceCases`,
      model?.forceFiniteDifferenceCases,
      Array.from({ length: 89 }, (_, index) =>
        `${index + 1}:synthetic-selection-${String(index + 1).padStart(2, '0')}`),
      (entry) => `${entry.syntheticElementOrdinal}:${entry.selectionToken}`,
      (entry) => entry.probeRecords === 4
        && finiteNonNegativeAtMost(entry.normalizedError, 1),
      ['syntheticElementOrdinal', 'selectionToken', 'probeRecords', 'normalizedError']);
    validateCaseSet(failures, `${prefix}.stressFiniteDifferenceCases`,
      model?.stressFiniteDifferenceCases,
      contract.validation.stressFiniteDifferencePerModel.structureIds.flatMap(
        (id) => contract.validation.stressFiniteDifferencePerModel.voigtModes.map(
          (mode) => `${id}:${mode}`,
        ),
      ),
      (entry) => `${entry.id}:${entry.mode}`,
      (entry) => entry.probeRecords === 4
        && finiteNonNegativeAtMost(entry.normalizedError, 1),
      ['id', 'mode', 'probeRecords', 'normalizedError']);
  }
  failures.push(...validateSyntheticHostObservations(
    fixture?.syntheticHostObservations,
    contract,
  ));
  return uniqueFailures(failures);
}

export function validateSyntheticHostObservations(observations, contract = FROZEN_CONTRACT) {
  const failures = [];
  if (!Array.isArray(observations) || observations.length !== 4) {
    return ['observer.fixture.hostObservations: exactly four synthetic observations required'];
  }
  const containerIds = new Set();
  const outputs = new Set();
  let previousEnd = null;
  const allowedHostFields = [
    ...FROZEN_CONTRACT.hostObservationContract.requiredIdentityFields,
    'evidenceClass',
    'wallTimeSeconds',
    'identityAssignmentAuthority',
    'hostObservationSource',
    'hostSocketsMounted',
    'hostSecretsMounted',
    'referenceLabelsMounted',
    'writableMountCount',
    'gpuDeviceRequests',
    'containerSelfReportTrusted',
    'canaryObserved',
    'readDenialProbeDenied',
  ];
  observations.forEach((observation, index) => {
    const prefix = `observer.fixture.hostObservations[${index}]`;
    const expected = contract.topology.executionOrder[index];
    requireExactObjectKeys(failures, prefix, observation, allowedHostFields);
    compareValue(failures, `${prefix}.evidenceClass`,
      observation?.evidenceClass, FIXTURE_EVIDENCE_CLASS);
    compareValue(failures, `${prefix}.repositoryId`, observation?.repositoryId, 1_349_498_456);
    compareValue(failures, `${prefix}.revision`, observation?.revision, 'fixture-not-run');
    compareValue(failures, `${prefix}.workflowPath`,
      observation?.workflowPath, OBSERVER_WORKFLOW_SOURCE_PATH);
    compareValue(failures, `${prefix}.workflowBlobDigest`,
      observation?.workflowBlobDigest, OBSERVER_WORKFLOW_RAW_DIGEST);
    for (const field of ['workflowRunId', 'jobId']) {
      compareValue(failures, `${prefix}.${field}`, observation?.[field], 'fixture-not-run');
    }
    compareValue(failures, `${prefix}.runAttempt`, observation?.runAttempt, 0);
    compareValue(failures, `${prefix}.runnerOs`, observation?.runnerOs, 'linux');
    compareValue(failures, `${prefix}.runnerArchitecture`, observation?.runnerArchitecture, 'amd64');
    compareValue(failures, `${prefix}.runnerImage`, observation?.runnerImage,
      'fixture-not-observed');
    compareValue(failures, `${prefix}.dockerServerVersion`,
      observation?.dockerServerVersion, 'fixture-not-observed');
    for (const field of ['imagePlatformManifestDigest', 'imageConfigDigest']) {
      compareValue(failures, `${prefix}.${field}`, observation?.[field],
        `sha256:${'0'.repeat(64)}`);
    }
    compareValue(failures, `${prefix}.sequence`, observation?.sequence, expected.sequence);
    compareValue(failures, `${prefix}.model`, observation?.model, expected.model);
    compareValue(failures, `${prefix}.modelId`, observation?.modelId, expected.modelId);
    compareValue(failures, `${prefix}.ordinal`, observation?.ordinal, expected.ordinal);
    compareValue(failures, `${prefix}.role`, observation?.role, expected.role);
    compareValue(failures, `${prefix}.identityAssignmentAuthority`,
      observation?.identityAssignmentAuthority,
      'host-observer-from-frozen-execution-order-not-container-self-report/v1');
    compareValue(failures, `${prefix}.hostObservationSource`,
      observation?.hostObservationSource,
      'synthetic-host-observer-fixture-not-container-self-report');
    compareTree(failures, `${prefix}.argv`, observation?.argv, ['fixture-only-no-dispatch']);
    compareTree(failures, `${prefix}.mounts`, observation?.mounts, []);
    compareTree(failures, `${prefix}.environmentKeyAllowlist`,
      observation?.environmentKeyAllowlist, []);
    compareValue(failures, `${prefix}.exitCode`, observation?.exitCode, 0);
    compareValue(failures, `${prefix}.networkMode`, observation?.networkMode, 'none');
    compareValue(failures, `${prefix}.readonlyRootfs`, observation?.readonlyRootfs, true);
    compareValue(failures, `${prefix}.user`, observation?.user, '65532:65532');
    compareTree(failures, `${prefix}.capDrop`, observation?.capDrop, ['ALL']);
    compareTree(failures, `${prefix}.securityOpt`,
      observation?.securityOpt, ['no-new-privileges:true']);
    for (const field of [
      'hostSocketsMounted',
      'hostSecretsMounted',
      'referenceLabelsMounted',
      'containerSelfReportTrusted',
      'canaryObserved',
    ]) compareValue(failures, `${prefix}.${field}`, observation?.[field], false);
    compareValue(failures, `${prefix}.readDenialProbeDenied`,
      observation?.readDenialProbeDenied, true);
    compareValue(failures, `${prefix}.writableMountCount`,
      observation?.writableMountCount, 1);
    compareTree(failures, `${prefix}.gpuDeviceRequests`,
      observation?.gpuDeviceRequests, []);
    if (!Number.isSafeInteger(observation?.startedAtMonotonicNs)
        || !Number.isSafeInteger(observation?.endedAtMonotonicNs)
        || observation.startedAtMonotonicNs < 0
        || observation.endedAtMonotonicNs <= observation.startedAtMonotonicNs) {
      failures.push(`${prefix}.lifecycle: finite ordered host monotonic timestamps required`);
    } else {
      if (previousEnd !== null && previousEnd > observation.startedAtMonotonicNs) {
        failures.push(`${prefix}.startedAtMonotonicNs: sequential lifecycle overlap`);
      }
      previousEnd = observation.endedAtMonotonicNs;
      compareValue(failures, `${prefix}.wallTimeSeconds.derivedValue`,
        observation.wallTimeSeconds,
        (observation.endedAtMonotonicNs - observation.startedAtMonotonicNs) / 1e9);
    }
    for (const field of ['cpuQuotaCores', 'wallTimeSeconds']) {
      if (!Number.isFinite(observation?.[field]) || observation[field] <= 0) {
        failures.push(`${prefix}.${field}: finite positive host-observed value required`);
      }
    }
    for (const field of ['memoryLimitBytes', 'pidsLimit']) {
      if (!Number.isSafeInteger(observation?.[field]) || observation[field] <= 0) {
        failures.push(`${prefix}.${field}: positive integer host-observed value required`);
      }
    }
    if (!Number.isSafeInteger(observation?.memoryPeakBytes)
        || observation.memoryPeakBytes < 0) {
      failures.push(`${prefix}.memoryPeakBytes: non-negative integer host-observed value required`);
    }
    for (const field of ['cpuTimeSeconds']) {
      if (!Number.isFinite(observation?.[field]) || observation[field] < 0) {
        failures.push(`${prefix}.${field}: finite non-negative host-observed value required`);
      }
    }
    if (Number.isFinite(observation?.memoryPeakBytes)
        && Number.isFinite(observation?.memoryLimitBytes)
        && observation.memoryPeakBytes > observation.memoryLimitBytes) {
      failures.push(`${prefix}.memoryPeakBytes: exceeds memoryLimitBytes`);
    }
    if (typeof observation?.containerId !== 'string'
        || observation.containerId.trim().length === 0
        || containerIds.has(observation.containerId)) {
      failures.push(`${prefix}.containerId: distinct synthetic container ID required`);
    } else containerIds.add(observation.containerId);
    if (typeof observation?.outputDirectory !== 'string'
        || observation.outputDirectory.trim().length === 0
        || outputs.has(observation.outputDirectory)) {
      failures.push(`${prefix}.outputDirectory: distinct writable output required`);
    } else outputs.add(observation.outputDirectory);
  });
  return failures;
}

export function buildFixtureReceipt(
  contract = FROZEN_CONTRACT,
  workflowBytes = Buffer.from('', 'utf8'),
  determinismRootsContract = FROZEN_DETERMINISM_ROOTS_CONTRACT,
) {
  const determinismContractFailures = validateDeterminismRootsContractSemantics(
    determinismRootsContract,
  );
  if (determinismContractFailures.length) {
    throw new Error(
      `determinism roots contract failed: ${determinismContractFailures.join('; ')}`,
    );
  }
  const fixture = buildSyntheticCampaignFixture(contract);
  const fixtureFailures = validateSyntheticCampaignFixture(fixture, contract);
  if (fixtureFailures.length) {
    throw new Error(`synthetic observer fixture failed: ${fixtureFailures.join('; ')}`);
  }
  const below = nextBinary64(STRESS_SYMMETRY_ABSOLUTE_TOLERANCE,
    Number.NEGATIVE_INFINITY);
  const above = nextBinary64(STRESS_SYMMETRY_ABSOLUTE_TOLERANCE,
    Number.POSITIVE_INFINITY);
  const stressForResidual = (residual) => [
    [0, residual, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  const forcePolynomial = (q) => q ** 5 - 0.7 * q ** 4 + 0.2 * q ** 3
    + 1.1 * q ** 2 - 0.3 * q + 0.4;
  const q = 0.37;
  const forceH = 0.01;
  const forceAnalytic = -(5 * q ** 4 - 2.8 * q ** 3 + 0.6 * q ** 2
    + 2.2 * q - 0.3);
  const forceFiniteDifference = forceRichardson({
    energyPlusH: forcePolynomial(q + forceH),
    energyMinusH: forcePolynomial(q - forceH),
    energyPlusHalfH: forcePolynomial(q + forceH / 2),
    energyMinusHalfH: forcePolynomial(q - forceH / 2),
    h: forceH,
  });
  const volume = 7;
  const strainPolynomial = (strain) => volume
    * (0.9 * strain + 0.4 * strain ** 2 - 0.2 * strain ** 3
      + 0.15 * strain ** 5);
  const stressH = 0.002;
  const stressFiniteDifference = stressRichardson({
    energyPlusH: strainPolynomial(stressH),
    energyMinusH: strainPolynomial(-stressH),
    energyPlusHalfH: strainPolynomial(stressH / 2),
    energyMinusHalfH: strainPolynomial(-stressH / 2),
    h: stressH,
    referenceVolume: volume,
  });
  const determinismRootModels = fixture.models.map((model) => {
    const authoritativeRoots = canonicalDeterminismRoots(
      model.authoritative,
      model.authoritativeProvenance,
    );
    const repeatRoots = canonicalDeterminismRoots(
      model.repeat,
      model.repeatProvenance,
    );
    return {
      model: model.model,
      scientific: {
        schemaVersion: authoritativeRoots.scientific.schemaVersion,
        authoritativeRoot: authoritativeRoots.scientific.root,
        repeatRoot: repeatRoots.scientific.root,
        canonicalBytesEqual: authoritativeRoots.scientific.bytes.equals(
          repeatRoots.scientific.bytes,
        ),
        rootsEqual: authoritativeRoots.scientific.root
          === repeatRoots.scientific.root,
      },
      provenance: {
        schemaVersion: authoritativeRoots.provenance.schemaVersion,
        authoritativeRoot: authoritativeRoots.provenance.root,
        repeatRoot: repeatRoots.provenance.root,
        canonicalBytesEqual: authoritativeRoots.provenance.bytes.equals(
          repeatRoots.provenance.bytes,
        ),
        rootsEqual: authoritativeRoots.provenance.root
          === repeatRoots.provenance.root,
      },
    };
  });
  return {
    schemaVersion: 'tf.atomistic-full-candidate-host-observation/0.2',
    evidenceClass: FIXTURE_EVIDENCE_CLASS,
    hypothesisId: 'H-vNext-Scientific-Provenance-Roots/0.1',
    fixtureEpoch: '2026-09-07T00:00:00Z',
    contract: {
      path: OBSERVER_CONTRACT_PATH,
      schemaVersion: 'tf.atomistic-full-candidate-observer-contract/0.1',
      rawDigest: OBSERVER_CONTRACT_RAW_DIGEST,
    },
    determinismRootsContract: {
      path: DETERMINISM_ROOTS_CONTRACT_PATH,
      schemaVersion: determinismRootsContract.schemaVersion,
      rawDigest: DETERMINISM_ROOTS_CONTRACT_RAW_DIGEST,
    },
    execution: 'not-run',
    scientificDecision: 'abstain',
    abstentionReasons: [...FIXTURE_ABSTENTION_REASONS],
    workflowObservation: {
      path: OBSERVER_WORKFLOW_SOURCE_PATH,
      registeredUnderGithubWorkflows: false,
      dispatchReachable: false,
      allJobGuardsLiteralFalse: true,
      permissionsEmpty: true,
      secretsPresent: false,
      artifactUploadPresent: false,
      containerOrModelDispatchPresent: false,
      sourceDigest: workflowBytes.length > 0 ? sha256(workflowBytes) : OBSERVER_WORKFLOW_RAW_DIGEST,
    },
    plannedAccounting: {
      freshContainerExecutions: structuredClone(
        contract.topology.requiredFreshContainerExecutions,
      ),
      authoritativeRecordsPerModel: structuredClone(
        contract.topology.recordsPerModel.authoritative,
      ),
      repeatRecordsPerModel: structuredClone(
        contract.topology.recordsPerModel.repeatValidation,
      ),
      invarianceCasesPerModel: structuredClone(
        contract.validation.invariancePerModel.requiredCases,
      ),
      forceFiniteDifferenceCasesPerModel: structuredClone(
        contract.validation.forceFiniteDifferencePerModel.requiredCases,
      ),
      forceFiniteDifferenceEnergyProbesPerModel: structuredClone(
        contract.validation.forceFiniteDifferencePerModel.requiredEnergyProbes,
      ),
      stressFiniteDifferenceCasesPerModel: structuredClone(
        contract.validation.stressFiniteDifferencePerModel.requiredCases,
      ),
      stressFiniteDifferenceEnergyProbesPerModel: structuredClone(
        contract.validation.stressFiniteDifferencePerModel.requiredEnergyProbes,
      ),
      adapterRequestsTotal: structuredClone(contract.topology.totals.adapterRequests),
      metricDenominatorPerModel: structuredClone(
        contract.topology.recordsPerModel.metricDenominator,
      ),
      determinismDenominatorPerModel: structuredClone(
        contract.topology.recordsPerModel.determinismDenominator,
      ),
      probeRecordsExcludedFromMetricAndDeterminism: true,
      authoritativeOrdinal: 0,
      repeatMayReplaceAuthority: false,
    },
    contractChecks: {
      evidenceClass: 'synthetic-contract-arithmetic-checks-not-scientific-validation',
      accountingCasesChecked: {
        models: countQuantity(2, 'model', 'the fixed MatterSim and MACE lanes'),
        benchmarkRecordsPerModelPerExecution: structuredClone(
          contract.topology.executionOrder[0].benchmarkPredictionRecords,
        ),
        invarianceCasesTotal: structuredClone(contract.topology.totals.invarianceProbeRecords),
        forceFiniteDifferenceCasesTotal: countQuantity(
          178,
          'force-finite-difference-case',
          '89 preregistered element cases for each of two fixed models',
        ),
        forceFiniteDifferenceEnergyProbesTotal: structuredClone(
          contract.topology.totals.forceFiniteDifferenceEnergyProbeRecords,
        ),
        stressFiniteDifferenceCasesTotal: countQuantity(
          120,
          'stress-finite-difference-case',
          '10 structures times six strain modes for each of two fixed models',
        ),
        stressFiniteDifferenceEnergyProbesTotal: structuredClone(
          contract.topology.totals.stressFiniteDifferenceEnergyProbeRecords,
        ),
        adapterRequestsTotal: structuredClone(contract.topology.totals.adapterRequests),
      },
      stressSymmetryBoundary: {
        unit: 'eV/angstrom^3',
        dimension: 'energy-per-volume',
        basis: 'raw full-3x3 maximum antisymmetric component before symmetrization or conversion',
        nextDown: { value: below, accepted: passesStressSymmetry(stressForResidual(below)) },
        equal: {
          value: STRESS_SYMMETRY_ABSOLUTE_TOLERANCE,
          accepted: passesStressSymmetry(
            stressForResidual(STRESS_SYMMETRY_ABSOLUTE_TOLERANCE),
          ),
        },
        nextUp: { value: above, accepted: passesStressSymmetry(stressForResidual(above)) },
      },
      forceFiniteDifferenceOracle: {
        unit: 'eV/angstrom',
        dimension: 'energy-per-length',
        basis: 'closed-form synthetic polynomial derivative versus central Richardson',
        analytic: forceAnalytic,
        richardson: forceFiniteDifference,
        accepted: passesAbsoluteRelative(forceAnalytic, forceFiniteDifference, 0.02, 0.01),
      },
      stressFiniteDifferenceOracle: {
        unit: 'eV/angstrom^3',
        dimension: 'energy-per-volume',
        basis: 'closed-form synthetic strain-polynomial derivative at fixed reference volume versus central Richardson',
        analytic: 0.9,
        richardson: stressFiniteDifference,
        accepted: passesAbsoluteRelative(0.9, stressFiniteDifference, 0.005, 0.02),
      },
      determinismRootSeparation: {
        evidenceClass: 'synthetic-projection-fixture-not-observed-execution',
        executionObserved: false,
        models: determinismRootModels,
      },
      syntheticCampaignAccepted: true,
    },
    hostObservation: {
      status: 'not-observed-fixture-only',
      observerClass: 'same-job-label-separated-host-observer-not-independent-job-or-hardware',
      observedContainerExecutions: countQuantity(
        0,
        'container-execution',
        'fixture-only receipt contains no host-observed container execution',
      ),
      requiredIdentityFields: [...contract.hostObservationContract.requiredIdentityFields],
      fieldProvenance: structuredClone(contract.hostObservationContract.fieldProvenance),
      identityAssignmentAuthority:
        contract.hostObservationContract.identityAssignmentAuthority,
      lifecycleOrdering: contract.hostObservationContract.lifecycleOrdering,
      measuredValues: null,
      containerSelfReportTrusted: false,
      durableIndependentAttestationPresent: false,
    },
    resourceProvenance: {
      status: 'not-observed-fixture-only',
      finiteLimitsRequiredBeforeDispatch: true,
      limitsStatus: 'unresolved-dispatch-blocking',
      measurements: [],
      performanceThresholdClaimAllowed: false,
      throughputComparisonClaimAllowed: false,
    },
    rights: structuredClone(contract.rightsPolicy),
    applicability: structuredClone(contract.applicability),
    claims: { ...CLAIMS },
    publication: {
      enabled: false,
      allowedArtifactPaths: [],
      artifactUploadAllowed: false,
      privateExecutionAllowed: false,
      aggregatePublicationAllowed: false,
      runtimeRedistributionAllowed: false,
      aggregateReceiptRightsDispositionRecorded: false,
    },
  };
}

export function validateFixtureReceipt(
  receipt,
  schema,
  contract = FROZEN_CONTRACT,
  determinismRootsContract = FROZEN_DETERMINISM_ROOTS_CONTRACT,
) {
  const failures = [];
  try {
    const ajv = new Ajv2020({
      allErrors: true,
      strict: true,
      validateFormats: false,
      validateSchema: true,
    });
    const validate = ajv.compile(schema);
    if (!validate(receipt)) {
      failures.push(`observer.receipt.schema: ${JSON.stringify(validate.errors)}`);
    }
  } catch (error) {
    failures.push(`observer.receipt.schema: strict AJV compilation failed (${message(error)})`);
  }
  try {
    compareTree(
      failures,
      'observer.receipt',
      receipt,
      buildFixtureReceipt(contract, Buffer.from('', 'utf8'), determinismRootsContract),
    );
  } catch (error) {
    failures.push(`observer.receipt.fixtureProjection: ${message(error)}`);
  }
  compareValue(failures, 'observer.receipt.evidenceClass',
    receipt?.evidenceClass, FIXTURE_EVIDENCE_CLASS);
  compareValue(failures, 'observer.receipt.execution', receipt?.execution, 'not-run');
  compareValue(failures, 'observer.receipt.scientificDecision',
    receipt?.scientificDecision, 'abstain');
  compareTree(failures, 'observer.receipt.abstentionReasons',
    receipt?.abstentionReasons, FIXTURE_ABSTENTION_REASONS);
  compareTree(failures, 'observer.receipt.claims', receipt?.claims, CLAIMS);
  compareTree(failures, 'observer.receipt.applicability',
    receipt?.applicability, contract.applicability);
  compareTree(
    failures,
    'observer.receipt.determinismRootsContract',
    receipt?.determinismRootsContract,
    {
      path: DETERMINISM_ROOTS_CONTRACT_PATH,
      schemaVersion: determinismRootsContract.schemaVersion,
      rawDigest: DETERMINISM_ROOTS_CONTRACT_RAW_DIGEST,
    },
  );
  compareValue(failures, 'observer.receipt.hostObservation.observedContainerExecutions.value',
    receipt?.hostObservation?.observedContainerExecutions?.value, 0);
  compareValue(failures, 'observer.receipt.contractChecks.stressSymmetryBoundary.nextDown.accepted',
    receipt?.contractChecks?.stressSymmetryBoundary?.nextDown?.accepted, true);
  compareValue(failures, 'observer.receipt.contractChecks.stressSymmetryBoundary.equal.accepted',
    receipt?.contractChecks?.stressSymmetryBoundary?.equal?.accepted, true);
  compareValue(failures, 'observer.receipt.contractChecks.stressSymmetryBoundary.nextUp.accepted',
    receipt?.contractChecks?.stressSymmetryBoundary?.nextUp?.accepted, false);
  compareValue(failures, 'observer.receipt.contractChecks.forceFiniteDifferenceOracle.accepted',
    receipt?.contractChecks?.forceFiniteDifferenceOracle?.accepted, true);
  compareValue(failures, 'observer.receipt.contractChecks.stressFiniteDifferenceOracle.accepted',
    receipt?.contractChecks?.stressFiniteDifferenceOracle?.accepted, true);
  compareValue(
    failures,
    'observer.receipt.contractChecks.determinismRootSeparation.executionObserved',
    receipt?.contractChecks?.determinismRootSeparation?.executionObserved,
    false,
  );
  for (const [index, model] of (
    receipt?.contractChecks?.determinismRootSeparation?.models ?? []
  ).entries()) {
    compareValue(failures,
      `observer.receipt.contractChecks.determinismRootSeparation.models[${index}].scientific.canonicalBytesEqual`,
      model?.scientific?.canonicalBytesEqual, true);
    compareValue(failures,
      `observer.receipt.contractChecks.determinismRootSeparation.models[${index}].scientific.rootsEqual`,
      model?.scientific?.rootsEqual, true);
    compareValue(failures,
      `observer.receipt.contractChecks.determinismRootSeparation.models[${index}].provenance.canonicalBytesEqual`,
      model?.provenance?.canonicalBytesEqual, false);
    compareValue(failures,
      `observer.receipt.contractChecks.determinismRootSeparation.models[${index}].provenance.rootsEqual`,
      model?.provenance?.rootsEqual, false);
  }
  compareValue(failures, 'observer.receipt.publication.enabled',
    receipt?.publication?.enabled, false);
  for (const field of [
    'privateExecutionAllowed',
    'aggregatePublicationAllowed',
    'runtimeRedistributionAllowed',
  ]) {
    compareValue(failures, `observer.receipt.rights.${field}`,
      receipt?.rights?.[field], false);
    compareValue(failures, `observer.receipt.publication.${field}`,
      receipt?.publication?.[field], false);
  }
  if (containsPositiveClaimBoolean(receipt?.claims)) {
    failures.push('observer.receipt.claims: all claims must remain false');
  }
  return uniqueFailures(failures);
}

function deriveAccounting(order) {
  const total = (field, role) => order
    .filter((entry) => role === undefined || entry.role === role)
    .reduce((sum, entry) => sum + countValue(entry[field]), 0);
  const derivedAdapterRequests = order.reduce((sum, entry) => sum + [
    'benchmarkPredictionRecords',
    'invarianceProbeRecords',
    'forceFiniteDifferenceEnergyProbeRecords',
    'stressFiniteDifferenceEnergyProbeRecords',
  ].reduce((entrySum, field) => entrySum + countValue(entry[field]), 0), 0);
  return {
    authoritativeBenchmarkPredictionRecords:
      total('benchmarkPredictionRecords', 'authoritative'),
    repeatValidationBenchmarkPredictionRecords:
      total('benchmarkPredictionRecords', 'repeat-validation'),
    invarianceProbeRecords: total('invarianceProbeRecords'),
    forceFiniteDifferenceEnergyProbeRecords:
      total('forceFiniteDifferenceEnergyProbeRecords'),
    stressFiniteDifferenceEnergyProbeRecords:
      total('stressFiniteDifferenceEnergyProbeRecords'),
    adapterRequests: derivedAdapterRequests,
  };
}

function validateBenchmarkFixtureRecords(failures, pathLabel, records) {
  try {
    validateScientificPredictionRecords(records);
  } catch (error) {
    failures.push(`${pathLabel}: ${message(error)}`);
  }
}

function validateCaseSet(
  failures,
  pathLabel,
  cases,
  expectedKeys,
  keyOf,
  passes,
  allowedKeys,
) {
  const expectedCount = expectedKeys.length;
  if (!Array.isArray(cases) || cases.length !== expectedCount) {
    failures.push(`${pathLabel}.count: exactly ${expectedCount} cases required`);
    return;
  }
  const keys = cases.map(keyOf);
  if (new Set(keys).size !== expectedCount) {
    failures.push(`${pathLabel}.keys: every preregistered case must be unique`);
  }
  keys.forEach((key, index) => {
    compareValue(failures, `${pathLabel}[${index}].key`, key, expectedKeys[index]);
  });
  cases.forEach((entry, index) => {
    requireExactObjectKeys(failures, `${pathLabel}[${index}]`, entry, allowedKeys);
    if (!passes(entry)) failures.push(`${pathLabel}[${index}]: case failed its exact fixture gate`);
  });
}

function requireExactObjectKeys(failures, pathLabel, value, allowedKeys) {
  if (!isRecord(value)) {
    failures.push(`${pathLabel}: exact object required`);
    return;
  }
  const allowed = new Set(allowedKeys);
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) failures.push(`${pathLabel}.${key}: unexpected or forbidden leaf`);
  }
  for (const key of allowedKeys) {
    if (!Object.hasOwn(value, key)) failures.push(`${pathLabel}.${key}: required leaf missing`);
  }
}

function finiteNonNegativeAtMost(value, maximum) {
  return Number.isFinite(value) && value >= 0 && value <= maximum;
}

function countValue(quantity) {
  return isRecord(quantity) && Number.isSafeInteger(quantity.value)
    ? quantity.value
    : Number.NaN;
}

function countQuantity(value, unit, basis) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new TypeError('count quantity value must be one non-negative safe integer');
  }
  return { value, unit, dimension: 'count', basis };
}

function normalizePredictionRecordsInput(recordsOrBytes) {
  const records = Buffer.isBuffer(recordsOrBytes) || recordsOrBytes instanceof Uint8Array
    ? parsePredictionJsonlForDeterminism(recordsOrBytes)
    : recordsOrBytes;
  return validateScientificPredictionRecords(records);
}

function normalizeExecutionProvenanceInput(provenanceOrBytes) {
  return Buffer.isBuffer(provenanceOrBytes) || provenanceOrBytes instanceof Uint8Array
    ? parseExecutionProvenanceForDeterminism(provenanceOrBytes)
    : validateExecutionProvenance(provenanceOrBytes);
}

function buildScientificProjectionBytes(records) {
  const contract = FROZEN_DETERMINISM_ROOTS_CONTRACT.scientificProjection;
  const projection = normalizeScientificValue({
    schemaVersion: contract.schemaVersion,
    records: records.map((record) => Object.fromEntries(
      contract.includedRecordFields.map((field) => [field, record[field]]),
    )),
  });
  requireExactKeysOrThrow(projection, contract.topLevelFields, 'scientific projection');
  const bytes = Buffer.from(`${canonicalJson(projection)}\n`, 'utf8');
  if (bytes.length > contract.maximumCanonicalBytes.value) {
    throw new TypeError('canonical scientific projection exceeds its frozen byte bound');
  }
  return bytes;
}

function buildProvenanceProjectionBytes(records, executionProvenance, scientificRoot) {
  validateExecutionProvenance(executionProvenance, records);
  if (!DIGEST_PATTERN.test(scientificRoot)) {
    throw new TypeError('scientific root must be one lowercase SHA-256 digest');
  }
  const contract = FROZEN_DETERMINISM_ROOTS_CONTRACT.provenanceProjection;
  const projection = normalizeScientificValue({
    schemaVersion: contract.schemaVersion,
    scientificRoot,
    environmentSha256: executionProvenance.environmentSha256,
    imageConfigDigest: executionProvenance.hostObservation.imageConfigDigest,
    containerId: executionProvenance.hostObservation.containerId,
    networkNamespaceIdentity:
      executionProvenance.hostObservation.networkNamespaceIdentity,
  });
  requireExactKeysOrThrow(projection, contract.topLevelFields, 'provenance projection');
  const bytes = Buffer.from(`${canonicalJson(projection)}\n`, 'utf8');
  if (bytes.length > contract.maximumCanonicalBytes.value) {
    throw new TypeError('canonical provenance projection exceeds its frozen byte bound');
  }
  return bytes;
}

function validateExecutionProvenance(executionProvenance, records = null) {
  const expectedFields = FROZEN_DETERMINISM_ROOTS_CONTRACT
    .inputContract.executionProvenanceFields;
  requireExactKeysOrThrow(
    executionProvenance,
    expectedFields,
    'execution provenance',
  );
  const maximumBytes = FROZEN_DETERMINISM_ROOTS_CONTRACT
    .inputContract.maximumExecutionProvenanceBytes.value;
  if (Buffer.byteLength(canonicalJson(executionProvenance), 'utf8') + 1 > maximumBytes) {
    throw new TypeError(`execution provenance exceeds its ${maximumBytes}-byte bound`);
  }
  if (executionProvenance.schemaVersion !== FROZEN_DETERMINISM_ROOTS_CONTRACT
    .inputContract.executionProvenanceSchemaVersion) {
    throw new TypeError('execution provenance schemaVersion is not frozen');
  }
  const environmentBinding = executionProvenance.environmentBinding;
  requireExactKeysOrThrow(
    environmentBinding,
    FROZEN_DETERMINISM_ROOTS_CONTRACT.inputContract.environmentBindingFields,
    'execution provenance environmentBinding',
  );
  for (const [field, expected] of Object.entries(
    FROZEN_DETERMINISM_ROOTS_CONTRACT.inputContract.environmentBindingFixedValues,
  )) {
    if (!Object.is(environmentBinding[field], expected)) {
      throw new TypeError(`execution provenance environmentBinding.${field} is not frozen`);
    }
  }
  const compatibleModelBindings = FROZEN_DETERMINISM_ROOTS_CONTRACT
    .modelBindings.models.filter((modelBinding) => (
      environmentBinding.adapter === modelBinding.adapter
      && environmentBinding.dependencyLockSha256 === modelBinding.dependencyLockSha256
    ));
  if (compatibleModelBindings.length !== 1) {
    throw new TypeError(
      'execution provenance adapter/dependencyLockSha256 pair is outside the frozen model set',
    );
  }
  if (typeof environmentBinding.installedDistributionsSha256 !== 'string'
      || !DIGEST_PATTERN.test(environmentBinding.installedDistributionsSha256)) {
    throw new TypeError(
      'execution provenance environmentBinding.installedDistributionsSha256 must be one lowercase SHA-256 digest',
    );
  }
  for (const field of ['workflowRevision', 'runtimeSourceRevision']) {
    if (typeof environmentBinding[field] !== 'string'
        || !GIT_REVISION_PATTERN.test(environmentBinding[field])) {
      throw new TypeError(
        `execution provenance environmentBinding.${field} must be one lowercase 40-hex Git revision`,
      );
    }
  }
  validateContainerIdentity(environmentBinding.containerIdentity);
  validateNetworkProof(environmentBinding.networkProofStart, 'networkProofStart');
  validateNetworkProof(environmentBinding.networkProofEnd, 'networkProofEnd');
  for (const field of NETWORK_BOUNDARY_FIELDS) {
    if (canonicalJson(environmentBinding.networkProofStart[field])
        !== canonicalJson(environmentBinding.networkProofEnd[field])) {
      throw new TypeError(
        `execution provenance networkProofStart/networkProofEnd ${field} values disagree`,
      );
    }
  }
  if (typeof executionProvenance.environmentSha256 !== 'string'
      || !DIGEST_PATTERN.test(executionProvenance.environmentSha256)) {
    throw new TypeError(
      'execution provenance environmentSha256 must be one lowercase SHA-256 digest',
    );
  }
  const recomputedEnvironmentSha256 = sha256(Buffer.from(
    canonicalJson(environmentBinding),
    'utf8',
  ));
  if (executionProvenance.environmentSha256 !== recomputedEnvironmentSha256) {
    throw new TypeError('execution provenance environmentSha256 does not bind environmentBinding');
  }
  const hostObservation = executionProvenance.hostObservation;
  requireExactKeysOrThrow(
    hostObservation,
    FROZEN_DETERMINISM_ROOTS_CONTRACT.inputContract.hostObservationFields,
    'execution provenance hostObservation',
  );
  if (typeof hostObservation.imageConfigDigest !== 'string'
      || !DIGEST_PATTERN.test(hostObservation.imageConfigDigest)) {
    throw new TypeError('execution provenance hostObservation imageConfigDigest is malformed');
  }
  if (typeof hostObservation.containerId !== 'string'
      || !CONTAINER_ID_PATTERN.test(hostObservation.containerId)) {
    throw new TypeError('execution provenance hostObservation containerId is malformed or unbounded');
  }
  if (typeof hostObservation.networkNamespaceIdentity !== 'string'
      || !NETWORK_NAMESPACE_IDENTITY_PATTERN.test(
        hostObservation.networkNamespaceIdentity,
      )) {
    throw new TypeError('execution provenance host network namespace identity is malformed or unbounded');
  }
  if (hostObservation.imageConfigDigest
      !== environmentBinding.containerIdentity.configImageId) {
    throw new TypeError('execution provenance runner/host imageConfigDigest values disagree');
  }
  if (hostObservation.networkNamespaceIdentity
        !== environmentBinding.networkProofStart.network_namespace
      || hostObservation.networkNamespaceIdentity
        !== environmentBinding.networkProofEnd.network_namespace) {
    throw new TypeError('execution provenance runner/host network namespace values disagree');
  }
  if (records === null) return executionProvenance;
  if (!Array.isArray(records)) {
    throw new TypeError('execution provenance prediction binding requires validated records');
  }
  for (const [index, record] of records.entries()) {
    if (record.modelId !== compatibleModelBindings[0].modelId) {
      throw new TypeError(
        `scientific records[${index}].modelId is not bound to execution provenance adapter/lock identity`,
      );
    }
    if (record.environmentSha256 !== executionProvenance.environmentSha256) {
      throw new TypeError(
        `scientific records[${index}].environmentSha256 is not bound to execution provenance`,
      );
    }
  }
  return executionProvenance;
}

function validateContainerIdentity(containerIdentity) {
  const label = 'execution provenance environmentBinding.containerIdentity';
  requireExactKeysOrThrow(
    containerIdentity,
    FROZEN_DETERMINISM_ROOTS_CONTRACT.inputContract.containerIdentityFields,
    label,
  );
  const expected = {
    kind: 'docker-local-load-config-id',
    scope: 'run-specific',
    promotionTrustRoot: false,
    registryManifestDigest: null,
  };
  for (const [field, expectedValue] of Object.entries(expected)) {
    if (!Object.is(containerIdentity[field], expectedValue)) {
      throw new TypeError(`${label}.${field} is not frozen`);
    }
  }
  if (typeof containerIdentity.configImageId !== 'string'
      || !DIGEST_PATTERN.test(containerIdentity.configImageId)) {
    throw new TypeError(`${label}.configImageId must be one lowercase SHA-256 digest`);
  }
}

function validateNetworkProof(networkProof, field) {
  const label = `execution provenance environmentBinding.${field}`;
  requireExactKeysOrThrow(
    networkProof,
    FROZEN_DETERMINISM_ROOTS_CONTRACT.inputContract.networkProofFields,
    label,
  );
  if (networkProof.egress_disabled !== true
      || networkProof.escape_sockets_absent !== true) {
    throw new TypeError(`${label} must prove disabled egress and absent escape sockets`);
  }
  if (typeof networkProof.network_namespace !== 'string'
      || !NETWORK_NAMESPACE_IDENTITY_PATTERN.test(networkProof.network_namespace)) {
    throw new TypeError(`${label}.network_namespace is malformed or unbounded`);
  }
  if (typeof networkProof.effective_capabilities !== 'string'
      || !EFFECTIVE_CAPABILITIES_PATTERN.test(networkProof.effective_capabilities)) {
    throw new TypeError(`${label}.effective_capabilities is malformed or unbounded`);
  }
  const capabilityBits = BigInt(networkProof.effective_capabilities);
  if ((capabilityBits & (1n << 12n)) !== 0n || (capabilityBits & (1n << 21n)) !== 0n) {
    throw new TypeError(`${label}.effective_capabilities contains a forbidden capability`);
  }
  requireDenseArray(networkProof.interfaces, 1, `${label}.interfaces`);
  if (networkProof.interfaces[0] !== 'lo') {
    throw new TypeError(`${label}.interfaces must contain only loopback`);
  }
  validateNetworkRoutes(networkProof.ipv4_routes, 'ipv4', label);
  validateNetworkRoutes(networkProof.ipv6_routes, 'ipv6', label);
  requireDenseArray(
    networkProof.probes,
    NETWORK_PROBE_IDENTITIES.length,
    `${label}.probes`,
  );
  networkProof.probes.forEach((probe, index) => {
    const probeLabel = `${label}.probes[${index}]`;
    requireExactKeysOrThrow(
      probe,
      FROZEN_DETERMINISM_ROOTS_CONTRACT.inputContract.networkProbeFields,
      probeLabel,
    );
    const expected = NETWORK_PROBE_IDENTITIES[index];
    for (const identityField of ['family', 'address', 'port']) {
      if (!Object.is(probe[identityField], expected[identityField])) {
        throw new TypeError(`${probeLabel}.${identityField} is not the frozen probe target`);
      }
    }
    if (!Number.isSafeInteger(probe.blockedErrno)
        || !NETWORK_PROBE_BLOCKED_ERRNOS.has(probe.blockedErrno)) {
      throw new TypeError(`${probeLabel}.blockedErrno is not an accepted finite errno`);
    }
    if (typeof probe.blockedReason !== 'string'
        || probe.blockedReason.length === 0
        || Buffer.byteLength(probe.blockedReason, 'utf8') > 256
        || /[\u0000-\u001f\u007f]/u.test(probe.blockedReason)) {
      throw new TypeError(`${probeLabel}.blockedReason is malformed or unbounded`);
    }
  });
  if (networkProof.method !== NETWORK_PROOF_METHOD) {
    throw new TypeError(`${label}.method is not frozen`);
  }
}

function validateNetworkRoutes(routes, family, parentLabel) {
  const label = `${parentLabel}.${family}_routes`;
  requireBoundedDenseArray(routes, 64, label);
  routes.forEach((route, index) => {
    if (typeof route !== 'string'
        || route.length === 0
        || Buffer.byteLength(route, 'utf8') > 1024
        || !/^[\x09\x20-\x7e]+$/u.test(route)) {
      throw new TypeError(`${label}[${index}] is malformed or unbounded`);
    }
    const fields = route.trim().split(/\s+/u);
    const interfaceName = family === 'ipv4' ? fields[0] : fields.at(-1);
    if (interfaceName !== 'lo') {
      throw new TypeError(`${label}[${index}] contains a non-loopback route`);
    }
  });
}

function requireExactKeysOrThrow(value, expectedKeys, label) {
  if (!isRecord(value)) throw new TypeError(`${label} must be an exact object`);
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  if (actualKeys.length !== sortedExpected.length
      || actualKeys.some((key, index) => key !== sortedExpected[index])) {
    throw new TypeError(`${label} has missing, extra or schema-drifted fields`);
  }
}

function requireDenseArray(value, length, label) {
  if (!Array.isArray(value) || value.length !== length) {
    throw new TypeError(`${label} must be one dense array of length ${length}`);
  }
  const keys = Object.keys(value);
  if (keys.length !== length
      || keys.some((key, index) => key !== String(index))) {
    throw new TypeError(`${label} must not contain holes or extra properties`);
  }
}

function requireBoundedDenseArray(value, maximumLength, label) {
  if (!Array.isArray(value) || value.length > maximumLength) {
    throw new TypeError(`${label} must be one dense array of at most ${maximumLength} entries`);
  }
  const keys = Object.keys(value);
  if (keys.length !== value.length
      || keys.some((key, index) => key !== String(index))) {
    throw new TypeError(`${label} must not contain holes or extra properties`);
  }
}

function normalizeScientificValue(value) {
  if (typeof value === 'number') {
    requireFinite(value, 'scientific payload number');
    return Object.is(value, -0) ? 0 : value;
  }
  if (Array.isArray(value)) return value.map((entry) => normalizeScientificValue(entry));
  if (isRecord(value)) {
    return Object.fromEntries(Object.entries(value).map(
      ([key, entry]) => [key, normalizeScientificValue(entry)],
    ));
  }
  if (value === null || ['string', 'boolean'].includes(typeof value)) return value;
  throw new TypeError('scientific payload contains an unsupported value');
}

function requireMatrix3(value, label) {
  requireDenseArray(value, 3, `${label} full 3x3 matrix`);
  value.forEach((row, rowIndex) => {
    requireDenseArray(row, 3, `${label}[${rowIndex}]`);
    row.forEach((entry, columnIndex) => requireFinite(
      entry,
      `${label}[${rowIndex}][${columnIndex}]`,
    ));
  });
}

function requirePositiveFinite(value, label) {
  requireFinite(value, label);
  if (value <= 0) throw new RangeError(`${label} must be positive`);
}

function requireFinite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
}

function containsPositiveClaimBoolean(value) {
  return isRecord(value) && Object.values(value).some((entry) => entry === true);
}

function compareValue(failures, pathLabel, actual, expected) {
  if (!Object.is(actual, expected)) {
    failures.push(`${pathLabel}: expected ${display(expected)}; received ${display(actual)}`);
  }
}

function compareTree(failures, pathLabel, actual, expected) {
  if (Array.isArray(expected)) {
    if (!Array.isArray(actual)) {
      failures.push(`${pathLabel}: expected an array`);
      return;
    }
    if (actual.length !== expected.length) {
      failures.push(`${pathLabel}.length: expected ${expected.length}; received ${actual.length}`);
    }
    const count = Math.min(actual.length, expected.length);
    for (let index = 0; index < count; index += 1) {
      compareTree(failures, `${pathLabel}[${index}]`, actual[index], expected[index]);
    }
    return;
  }
  if (isRecord(expected)) {
    if (!isRecord(actual)) {
      failures.push(`${pathLabel}: expected an object`);
      return;
    }
    for (const key of Object.keys(expected)) {
      if (!Object.hasOwn(actual, key)) failures.push(`${pathLabel}.${key}: required leaf missing`);
      else compareTree(failures, `${pathLabel}.${key}`, actual[key], expected[key]);
    }
    for (const key of Object.keys(actual)) {
      if (!Object.hasOwn(expected, key)) failures.push(`${pathLabel}.${key}: unexpected leaf`);
    }
    return;
  }
  compareValue(failures, pathLabel, actual, expected);
}

function display(value) {
  try { return canonicalJson(value); } catch { return String(value); }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function uniqueFailures(failures) {
  return [...new Set(failures)];
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    Object.values(value).forEach((entry) => deepFreeze(entry));
  }
  return value;
}

function requireBytes(value, label) {
  if (!Buffer.isBuffer(value) && !(value instanceof Uint8Array)) {
    throw new TypeError(`${label} must be bytes`);
  }
  return Buffer.from(value);
}

function inspectFrozenJsonSchemaBytes(bytes, {
  label,
  rawDigest: expectedRawDigest,
  semanticDigest: expectedSemanticDigest,
  enforceFrozenDigest,
}) {
  const buffer = requireBytes(bytes, label);
  const rawDigest = sha256(buffer);
  const failures = [];
  let schema = null;
  let semanticDigest = null;
  if (buffer.length === 0 || buffer.length > MAX_SCHEMA_BYTES) {
    failures.push(`${label}.raw: byte limit exceeded`);
    return { schema, rawDigest, semanticDigest, failures };
  }
  try {
    schema = parseJsonRejectingDuplicateMembers(buffer);
    semanticDigest = sha256(Buffer.from(canonicalJson(schema), 'utf8'));
    const ajv = new Ajv2020({ strict: true, validateSchema: true });
    ajv.compile(schema);
  } catch (error) {
    failures.push(`${label}.raw: strict JSON/schema failed (${message(error)})`);
  }
  if (enforceFrozenDigest && rawDigest !== expectedRawDigest) {
    failures.push(`${label}.rawDigest: exact reviewed bytes differ`);
  }
  if (enforceFrozenDigest && semanticDigest !== expectedSemanticDigest) {
    failures.push(`${label}.semanticDigest: exact frozen semantics differ`);
  }
  return { schema, rawDigest, semanticDigest, failures };
}

function message(error) {
  return error instanceof Error ? error.message : String(error);
}

async function readBoundedFile(root, relativePath, maximumBytes) {
  const bytes = await readFile(path.join(root, ...relativePath.split('/')));
  if (bytes.length > maximumBytes) throw new Error(`${relativePath} exceeds its byte limit`);
  return bytes;
}

async function captureReviewedFile(root, spec, { afterReadForTest } = {}) {
  if (typeof root !== 'string' || !path.isAbsolute(root) || path.resolve(root) !== root) {
    throw new TypeError('repository root must be one absolute normalized path');
  }
  const rootMetadata = await lstat(root, { bigint: true });
  if (!rootMetadata.isDirectory() || rootMetadata.isSymbolicLink()) {
    throw new Error('repository root must be one real directory');
  }
  if (await realpath(root) !== root) throw new Error('repository root crosses a symlink boundary');
  const absolutePath = path.join(root, ...spec.path.split('/'));
  const before = await lstat(absolutePath, { bigint: true });
  assertReviewedRegularFile(before, spec);
  if (await realpath(absolutePath) !== absolutePath) {
    throw new Error(`${spec.path} crosses a symlink boundary`);
  }
  if (typeof fsConstants.O_NOFOLLOW !== 'number') throw new Error('O_NOFOLLOW unavailable');
  const handle = await open(absolutePath, fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW);
  let bytes;
  try {
    const openedBefore = await handle.stat({ bigint: true });
    if (!sameReviewedIdentity(before, openedBefore)) {
      throw new Error(`${spec.path} changed before its descriptor read`);
    }
    bytes = await readExactDescriptor(handle, Number(before.size), spec.path);
    if (afterReadForTest) await afterReadForTest(spec.path, absolutePath);
    const openedAfter = await handle.stat({ bigint: true });
    const pathAfter = await lstat(absolutePath, { bigint: true });
    if (!sameReviewedIdentity(before, openedAfter)
        || !sameReviewedIdentity(before, pathAfter)) {
      throw new Error(`${spec.path} changed during its descriptor read`);
    }
    assertReviewedRegularFile(pathAfter, spec);
    if (await realpath(absolutePath) !== absolutePath) {
      throw new Error(`${spec.path} crossed a symlink boundary during its read`);
    }
  } finally {
    await handle.close();
  }
  return Object.freeze({
    path: spec.path,
    absolutePath,
    bytes,
    identity: before,
  });
}

async function assertReviewedSnapshotCurrent(snapshot) {
  const spec = REVIEWED_SOURCE_SPECS.find(({ path: candidate }) => candidate === snapshot.path);
  if (!spec) throw new Error(`unrecognized reviewed source path: ${snapshot.path}`);
  const current = await lstat(snapshot.absolutePath, { bigint: true });
  assertReviewedRegularFile(current, spec);
  if (!sameReviewedIdentity(snapshot.identity, current)) {
    throw new Error(`${snapshot.path} changed after Git binding`);
  }
  if (await realpath(snapshot.absolutePath) !== snapshot.absolutePath) {
    throw new Error(`${snapshot.path} crossed a symlink boundary after Git binding`);
  }
}

function assertReviewedRegularFile(metadata, spec) {
  if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.nlink !== 1n) {
    throw new Error(`${spec.path} must be one regular single-link non-symlink file`);
  }
  if ((metadata.mode & 0o7777n) !== EXPECTED_FILE_MODE_BIGINT) {
    throw new Error(`${spec.path} filesystem mode must be exactly mode-0644`);
  }
  if (metadata.size < 1n || metadata.size > BigInt(spec.maximumBytes)) {
    throw new Error(`${spec.path} is empty or exceeds its byte limit`);
  }
}

function sameReviewedIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

async function readExactDescriptor(handle, expectedBytes, relativePath) {
  const bytes = Buffer.allocUnsafe(expectedBytes);
  let offset = 0;
  while (offset < expectedBytes) {
    const { bytesRead } = await handle.read(bytes, offset, expectedBytes - offset, offset);
    if (bytesRead === 0) throw new Error(`${relativePath} became shorter during read`);
    offset += bytesRead;
  }
  const probe = Buffer.allocUnsafe(1);
  if ((await handle.read(probe, 0, 1, expectedBytes)).bytesRead !== 0) {
    throw new Error(`${relativePath} grew during read`);
  }
  return bytes;
}

async function bindReviewedSnapshotsToGit(
  root,
  snapshots,
  { afterFirstIndexReadForTest, beforeFinalIndexReadForTest } = {},
) {
  const topLevel = decodeGitLine(
    await runGitBytes(root, ['rev-parse', '--show-toplevel']),
    'Git top-level path',
  );
  if (topLevel !== root || await realpath(topLevel) !== root) {
    throw new Error('repository root is not the exact Git worktree top level');
  }
  const objectFormat = decodeGitLine(
    await runGitBytes(root, ['rev-parse', '--show-object-format']),
    'Git object format',
  );
  if (!['sha1', 'sha256'].includes(objectFormat)) {
    throw new Error(`unsupported Git object format: ${objectFormat}`);
  }
  const paths = snapshots.map(({ path: relativePath }) => relativePath);
  const firstIndexBytes = await readGitEntries(root, paths);
  const indexEntries = parseGitIndexEntries(firstIndexBytes, paths, objectFormat);
  if (afterFirstIndexReadForTest) await afterFirstIndexReadForTest(root);
  for (const snapshot of snapshots) {
    const entry = indexEntries.get(snapshot.path);
    const blobBytes = await runGitBytes(root, ['cat-file', 'blob', entry.blobOid]);
    if (!blobBytes.equals(snapshot.bytes)) {
      throw new Error(`${snapshot.path} Git index blob differs from reviewed bytes`);
    }
    if (gitBlobOid(snapshot.bytes, objectFormat) !== entry.blobOid) {
      throw new Error(`${snapshot.path} Git index object ID differs from reviewed bytes`);
    }
  }
  const treeOid = decodeGitLine(
    await runGitBytes(root, ['write-tree']),
    'staged tree object ID',
  );
  requireGitObjectId(treeOid, objectFormat, 'staged tree object ID');
  const treeEntries = parseGitTreeEntries(
    await runGitBytes(root, ['ls-tree', '-z', '--full-tree', treeOid, '--', ...paths]),
    paths,
    objectFormat,
  );
  for (const relativePath of paths) {
    if (treeEntries.get(relativePath).blobOid !== indexEntries.get(relativePath).blobOid) {
      throw new Error(`${relativePath} staged tree entry differs from its first index entry`);
    }
  }
  if (beforeFinalIndexReadForTest) await beforeFinalIndexReadForTest(root);
  const finalIndexBytes = await readGitEntries(root, paths);
  if (!finalIndexBytes.equals(firstIndexBytes)) {
    throw new Error('reviewed Git index entries changed during validation');
  }
  for (const snapshot of snapshots) await assertReviewedSnapshotCurrent(snapshot);
  return Object.freeze({ treeOid });
}

async function readGitEntries(root, paths) {
  return runGitBytes(root, ['ls-files', '--stage', '-z', '--full-name', '--', ...paths]);
}

function parseGitIndexEntries(bytes, expectedPaths, objectFormat) {
  return parseGitRecords(bytes, expectedPaths, (record) => {
    const match = /^(\d{6}) ([0-9a-f]+) ([0-3])\t([^\0]+)$/.exec(record);
    if (!match || match[1] !== '100644' || match[3] !== '0') {
      throw new Error('each reviewed Git index entry must be one stage-0 mode-100644 blob');
    }
    requireGitObjectId(match[2], objectFormat, 'Git index blob object ID');
    return { path: match[4], blobOid: match[2] };
  }, 'Git index');
}

function parseGitTreeEntries(bytes, expectedPaths, objectFormat) {
  return parseGitRecords(bytes, expectedPaths, (record) => {
    const match = /^(\d{6}) ([a-z]+) ([0-9a-f]+)\t([^\0]+)$/.exec(record);
    if (!match || match[1] !== '100644' || match[2] !== 'blob') {
      throw new Error('each reviewed staged-tree entry must be one mode-100644 blob');
    }
    requireGitObjectId(match[3], objectFormat, 'staged tree blob object ID');
    return { path: match[4], blobOid: match[3] };
  }, 'staged tree');
}

function parseGitRecords(bytes, expectedPaths, parseRecord, label) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 2 || bytes.at(-1) !== 0) {
    throw new Error(`${label} entries are not NUL terminated`);
  }
  let decoded;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, -1));
  } catch (error) {
    throw new Error(`${label} entries are not strict UTF-8`, { cause: error });
  }
  const records = decoded.split('\0');
  if (records.length !== expectedPaths.length) {
    throw new Error(`${label} must contain exactly ${expectedPaths.length} reviewed entries`);
  }
  const expected = new Set(expectedPaths);
  const entries = new Map();
  for (const record of records) {
    const entry = parseRecord(record);
    if (!expected.has(entry.path) || entries.has(entry.path)) {
      throw new Error(`${label} contains an unexpected or duplicate reviewed path`);
    }
    entries.set(entry.path, entry);
  }
  if (entries.size !== expected.size) throw new Error(`${label} is missing a reviewed path`);
  return entries;
}

function decodeGitLine(bytes, label) {
  if (!Buffer.isBuffer(bytes) || bytes.length < 2 || bytes.at(-1) !== 0x0a
      || bytes.subarray(0, -1).includes(0x0a)) {
    throw new Error(`${label} must be exactly one LF-terminated line`);
  }
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, -1));
}

function requireGitObjectId(value, objectFormat, label) {
  const length = objectFormat === 'sha1' ? 40 : 64;
  if (!new RegExp(`^[0-9a-f]{${length}}$`).test(value)) {
    throw new Error(`${label} is not one full ${objectFormat} object ID`);
  }
}

function gitBlobOid(bytes, objectFormat) {
  return createHash(objectFormat)
    .update(Buffer.from(`blob ${bytes.length}\0`, 'ascii'))
    .update(bytes)
    .digest('hex');
}

async function runGitBytes(root, args) {
  const { stdout } = await execFileAsync(GIT_EXECUTABLE, [
    '--no-replace-objects', '-C', root, ...args,
  ], {
    cwd: root,
    encoding: 'buffer',
    env: GIT_ENVIRONMENT,
    maxBuffer: MAX_GIT_OUTPUT_BYTES,
    timeout: GIT_TIMEOUT_MS,
    windowsHide: true,
  });
  return Buffer.from(stdout);
}

function validateSourceTestHooks({
  afterReadForTest,
  afterFirstIndexReadForTest,
  beforeFinalIndexReadForTest,
}) {
  for (const [name, value] of Object.entries({
    afterReadForTest,
    afterFirstIndexReadForTest,
    beforeFinalIndexReadForTest,
  })) {
    if (value !== undefined && typeof value !== 'function') {
      throw new TypeError(`${name} must be one function`);
    }
  }
}

async function emitFixtureCli() {
  const root = process.cwd();
  const [contractBytes, contractSchemaBytes, receiptSchemaBytes, workflowBytes] =
    await Promise.all([
      readBoundedFile(root, OBSERVER_CONTRACT_PATH, MAX_CONTRACT_BYTES),
      readBoundedFile(root, OBSERVER_CONTRACT_SCHEMA_PATH, MAX_SCHEMA_BYTES),
      readBoundedFile(root, OBSERVER_RECEIPT_SCHEMA_PATH, MAX_SCHEMA_BYTES),
      captureReviewedFile(root, REVIEWED_SOURCE_SPECS[1]).then(({ bytes }) => bytes),
    ]);
  const repository = await validateObserverContractRepository(contractBytes, {
    root,
    contractSchemaBytes,
    receiptSchemaBytes,
    workflowBytes,
    requireWorkflowGitIndex: true,
  });
  if (repository.failures.length) throw new Error(repository.failures.join('\n'));
  const receipt = buildFixtureReceipt(
    repository.contract,
    workflowBytes,
    repository.determinismRootsContract,
  );
  const receiptFailures = validateFixtureReceipt(
    receipt,
    parseJsonRejectingDuplicateMembers(receiptSchemaBytes),
    repository.contract,
    repository.determinismRootsContract,
  );
  if (receiptFailures.length) throw new Error(receiptFailures.join('\n'));
  process.stdout.write(`${canonicalJson(receipt)}\n`);
}

const invokedAsScript = process.argv[1]
  && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;
if (invokedAsScript) {
  if (process.argv.length === 3 && process.argv[2] === '--emit-fixture') {
    emitFixtureCli().catch((error) => {
      process.stderr.write(`Observer fixture failed: ${message(error)}\n`);
      process.exitCode = 1;
    });
  } else {
    process.stderr.write('Usage: full-candidate-observer-vnext.mjs --emit-fixture\n');
    process.exitCode = 2;
  }
}
