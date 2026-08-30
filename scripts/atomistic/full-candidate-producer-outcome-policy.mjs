import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  canonicalJson,
  parseJsonRejectDuplicateKeys,
} from './runtime-input-contract.mjs';

export const FULL_CANDIDATE_PRODUCER_OUTCOME_SCHEMA_PATH =
  'schemas/atomistic-full-candidate-producer-outcome.schema.json';
export const FULL_CANDIDATE_PRODUCER_OUTCOME_SCHEMA_RAW_DIGEST =
  'sha256:e3671d5fee2b68964c19bfac954fe99f9c72801c482008228b7dde4e0df85fa7';
export const FULL_CANDIDATE_PRODUCER_STAGES = Object.freeze([
  'guard',
  'directories',
  'bind',
  'base',
  'assets',
  'structures',
  'wheelhouse',
  'resolve',
  'freeze',
  'cold-install',
  'build',
  'inference',
]);

const MAX_OUTCOME_BYTES = 64 * 1024;
const MAX_REPORTED_FAILURES = 128;
const STAGE_OUTCOMES = new Set(['success', 'failure', 'cancelled', 'skipped']);
const TERMINAL_OUTCOMES = new Set(['failure', 'cancelled']);
const MODELS = new Set(['mattersim', 'mace']);
const CLAIM_KEYS = Object.freeze([
  'claimEligible',
  'comparisonEligible',
  'promotionEligible',
  'reproduced',
  'reproductionEligible',
  'superiorityClaimAllowed',
]);

const COMMON_EVIDENCE_RULES = Object.freeze({
  'diagnostics/failure-diagnostics.json': { stage: 'inference', category: 'failure' },
  'diagnostics/run-diagnostics.json': { stage: 'inference', category: 'control' },
  'manifests/fetched-assets.manifest.json': { stage: 'assets', category: 'control' },
  'manifests/pytorch-download-sources.json': { stage: 'wheelhouse', category: 'control' },
  'manifests/run-summary.json': { stage: 'inference', category: 'control' },
  'manifests/structures.manifest.json': { stage: 'structures', category: 'structureManifest' },
  'predictions/predictions.jsonl': { stage: 'inference', category: 'predictions' },
});

const COMMON_REQUIRED_FILES = Object.freeze({
  assets: Object.freeze(['manifests/fetched-assets.manifest.json']),
  structures: Object.freeze(['manifests/structures.manifest.json']),
  wheelhouse: Object.freeze(['manifests/pytorch-download-sources.json']),
  inference: Object.freeze([
    'diagnostics/run-diagnostics.json',
    'manifests/run-summary.json',
    'predictions/predictions.jsonl',
  ]),
});

const producerOutcomeSchemaBytes = await readFile(
  new URL('../../schemas/atomistic-full-candidate-producer-outcome.schema.json', import.meta.url),
);
if (sha256(producerOutcomeSchemaBytes) !== FULL_CANDIDATE_PRODUCER_OUTCOME_SCHEMA_RAW_DIGEST) {
  throw new Error('checked-in producer-outcome schema differs from its frozen raw digest');
}
const producerOutcomeSchema = parseJsonRejectDuplicateKeys(
  producerOutcomeSchemaBytes,
  'producer-outcome schema',
);
const schemaValidator = new Ajv2020({ allErrors: true, strict: true }).compile(producerOutcomeSchema);

/** Exact byte representation emitted by write_full_candidate_outcome.py. */
export function canonicalProducerOutcomeBytes(outcome) {
  const encoded = `${canonicalJson(outcome)}\n`;
  if (!/^[\x00-\x7f]*$/.test(encoded)) {
    throw new TypeError('producer outcome canonical JSON must contain ASCII bytes only');
  }
  return Buffer.from(encoded, 'ascii');
}

/** Parse and validate one untrusted producer-outcome payload without throwing. */
export function inspectFullCandidateProducerOutcomeBytes(bytes, schemaBytes) {
  const failures = [];
  const addFailure = failureCollector(failures);
  validateSchemaBinding(schemaBytes, addFailure);
  let buffer;
  try {
    buffer = toBuffer(bytes);
  } catch (error) {
    addFailure(`producer-outcome.raw: ${error instanceof Error ? error.message : String(error)}`);
    return { outcome: null, failures };
  }
  if (buffer.length === 0) {
    addFailure('producer-outcome.raw: payload is empty');
    return { outcome: null, failures };
  }
  if (buffer.length > MAX_OUTCOME_BYTES) {
    addFailure(`producer-outcome.raw: payload exceeds the ${MAX_OUTCOME_BYTES}-byte limit`);
    return { outcome: null, failures };
  }
  if ([...buffer].some((byte) => byte > 0x7f)) {
    addFailure('producer-outcome.raw: writer output must be ASCII JSON');
  }

  let outcome;
  try {
    outcome = parseJsonRejectDuplicateKeys(buffer, 'producer outcome');
  } catch (error) {
    addFailure(`producer-outcome.raw: invalid or duplicate-key JSON (${error instanceof Error ? error.message : String(error)})`);
    return { outcome: null, failures };
  }

  try {
    if (!buffer.equals(canonicalProducerOutcomeBytes(outcome))) {
      addFailure('producer-outcome.raw: writer output is not canonical ASCII JSON with exactly one trailing LF');
    }
  } catch (error) {
    addFailure(`producer-outcome.raw: canonical ASCII JSON could not be derived (${error instanceof Error ? error.message : String(error)})`);
  }

  if (!schemaValidator(outcome)) {
    for (const error of schemaValidator.errors ?? []) {
      addFailure(formatSchemaFailure(error));
    }
  }
  for (const failure of validateFullCandidateProducerOutcomeSemantics(outcome)) addFailure(failure);
  return { outcome, failures };
}

export function validateFullCandidateProducerOutcomeBytes(bytes, schemaBytes) {
  return inspectFullCandidateProducerOutcomeBytes(bytes, schemaBytes).failures;
}

/** Cross-field policy beyond the JSON schema. Always returns failures. */
export function validateFullCandidateProducerOutcomeSemantics(outcome) {
  const failures = [];
  const addFailure = failureCollector(failures);
  if (!isPlainObject(outcome)) {
    addFailure('producer-outcome.semantic: top level must be an object');
    return failures;
  }

  const stageSummary = deriveStageSummary(outcome.stages, addFailure);
  if (stageSummary) {
    if (outcome.status !== stageSummary.status) {
      addFailure(`producer-outcome.status: declared ${JSON.stringify(outcome.status)} does not match derived ${stageSummary.status}`);
    }
    if (outcome.terminalStage !== stageSummary.terminalStage) {
      addFailure(`producer-outcome.terminalStage: declared ${JSON.stringify(outcome.terminalStage)} does not match derived ${JSON.stringify(stageSummary.terminalStage)}`);
    }
  }

  for (const key of CLAIM_KEYS) {
    if (!isPlainObject(outcome.claims) || outcome.claims[key] !== false) {
      addFailure(`producer-outcome.claims.${key}: must be exactly false`);
    }
  }

  validateEvidence(outcome, stageSummary, addFailure);
  return failures;
}

function deriveStageSummary(stages, addFailure) {
  if (!Array.isArray(stages) || stages.length !== FULL_CANDIDATE_PRODUCER_STAGES.length) {
    addFailure(`producer-outcome.stages: exactly ${FULL_CANDIDATE_PRODUCER_STAGES.length} ordered stages are required`);
    return null;
  }
  const outcomes = [];
  let structurallyValid = true;
  for (let index = 0; index < FULL_CANDIDATE_PRODUCER_STAGES.length; index += 1) {
    const expectedStage = FULL_CANDIDATE_PRODUCER_STAGES[index];
    const record = stages[index];
    if (!isPlainObject(record)) {
      addFailure(`producer-outcome.stages[${index}]: must be an object for ${expectedStage}`);
      structurallyValid = false;
      outcomes.push(null);
      continue;
    }
    if (record.stage !== expectedStage) {
      addFailure(`producer-outcome.stages[${index}].stage: must be ${expectedStage}`);
      structurallyValid = false;
    }
    if (!STAGE_OUTCOMES.has(record.outcome)) {
      addFailure(`producer-outcome.stages[${index}].outcome: unsupported outcome ${JSON.stringify(record.outcome)}`);
      structurallyValid = false;
      outcomes.push(null);
      continue;
    }
    outcomes.push(record.outcome);
  }
  if (!structurallyValid) return null;
  if (outcomes.every((outcome) => outcome === 'success')) {
    return stageSummary('complete', null, null, outcomes);
  }
  if (outcomes.every((outcome) => outcome === 'skipped')) {
    return stageSummary('not-started', null, null, outcomes);
  }

  const terminalIndex = outcomes.findIndex((outcome) => outcome !== 'success');
  const terminalOutcome = outcomes[terminalIndex];
  if (!TERMINAL_OUTCOMES.has(terminalOutcome)) {
    addFailure('producer-outcome.stages: first non-success stage must be failure or cancelled');
    return null;
  }
  for (let index = terminalIndex + 1; index < outcomes.length; index += 1) {
    if (outcomes[index] !== 'skipped') {
      addFailure(`producer-outcome.stages[${index}]: every stage after ${terminalOutcome} must be skipped`);
    }
  }
  return stageSummary(
    terminalOutcome === 'failure' ? 'failed' : 'cancelled',
    FULL_CANDIDATE_PRODUCER_STAGES[terminalIndex],
    terminalIndex,
    outcomes,
  );
}

function stageSummary(status, terminalStage, terminalIndex, outcomes) {
  return {
    status,
    terminalStage,
    terminalIndex,
    outcomes,
    outcomeByStage: new Map(FULL_CANDIDATE_PRODUCER_STAGES.map((stage, index) => [stage, outcomes[index]])),
  };
}

function validateEvidence(outcome, stageSummaryValue, addFailure) {
  if (!isPlainObject(outcome.evidence)) {
    addFailure('producer-outcome.evidence: must be an object');
    return;
  }
  const evidenceItems = [];
  addSingularEvidence(evidenceItems, outcome.evidence.predictions, 'predictions', addFailure);
  addSingularEvidence(evidenceItems, outcome.evidence.structureManifest, 'structureManifest', addFailure);
  for (const category of ['control', 'partial', 'failure']) {
    const records = outcome.evidence[category];
    if (!Array.isArray(records)) {
      addFailure(`producer-outcome.evidence.${category}: must be an array`);
      continue;
    }
    validateStrictPathOrder(records, category, addFailure);
    records.forEach((record, index) => evidenceItems.push({
      category,
      label: `producer-outcome.evidence.${category}[${index}]`,
      record,
    }));
  }

  const rules = evidenceRules(outcome.model);
  if (!MODELS.has(outcome.model)) {
    addFailure(`producer-outcome.model: no evidence allowlist exists for ${JSON.stringify(outcome.model)}`);
  }
  const observedPaths = new Set();
  for (const item of evidenceItems) {
    const { category, label, record } = item;
    if (!isPlainObject(record)) {
      addFailure(`${label}: evidence record must be an object`);
      continue;
    }
    const evidencePath = record.path;
    if (typeof evidencePath !== 'string' || !/^[\x21-\x7e]+$/.test(evidencePath) || evidencePath.includes('\\')) {
      addFailure(`${label}.path: must be one printable ASCII path without backslashes`);
      continue;
    }
    if (observedPaths.has(evidencePath)) {
      addFailure(`${label}.path: duplicate evidence path ${evidencePath}`);
    }
    observedPaths.add(evidencePath);

    const rule = rules.get(evidencePath);
    if (!rule) {
      addFailure(`${label}.path: ${evidencePath} is outside the ${String(outcome.model)} producer allowlist`);
      continue;
    }
    if (record.stage !== rule.stage) {
      addFailure(`${label}.stage: ${JSON.stringify(record.stage)} does not match allowlisted stage ${rule.stage}`);
    }
    if (!stageSummaryValue) continue;
    const actualOutcome = stageSummaryValue.outcomeByStage.get(rule.stage);
    if (record.stageOutcome !== actualOutcome) {
      addFailure(`${label}.stageOutcome: ${JSON.stringify(record.stageOutcome)} does not match stages outcome ${JSON.stringify(actualOutcome)}`);
    }
    const stageIndex = FULL_CANDIDATE_PRODUCER_STAGES.indexOf(rule.stage);
    if (actualOutcome === 'skipped' || (
      stageSummaryValue.terminalIndex !== null
      && stageIndex > stageSummaryValue.terminalIndex
    )) {
      addFailure(`${label}.path: evidence from skipped post-terminal stage ${rule.stage} is forbidden`);
    }
    const expectedCategory = evidenceCategory(rule, actualOutcome);
    if (expectedCategory === null) {
      addFailure(`${label}: ${evidencePath} is forbidden for ${rule.stage}=${String(actualOutcome)}`);
    } else if (category !== expectedCategory) {
      addFailure(`${label}: ${evidencePath} belongs in ${expectedCategory}, not ${category}`);
    }
  }

  if (stageSummaryValue) {
    const requiredFiles = requiredFilesForModel(outcome.model);
    for (const [stage, paths] of requiredFiles) {
      if (stageSummaryValue.outcomeByStage.get(stage) !== 'success') continue;
      for (const requiredPath of paths) {
        if (!observedPaths.has(requiredPath)) {
          addFailure(`producer-outcome.evidence: successful ${stage} stage is missing required file ${requiredPath}`);
        }
      }
    }
  }
}

function addSingularEvidence(target, record, category, addFailure) {
  if (record === null || record === undefined) return;
  if (!isPlainObject(record)) {
    addFailure(`producer-outcome.evidence.${category}: must be null or one evidence object`);
    return;
  }
  target.push({ category, label: `producer-outcome.evidence.${category}`, record });
}

function validateStrictPathOrder(records, category, addFailure) {
  let previous = null;
  for (let index = 0; index < records.length; index += 1) {
    const current = isPlainObject(records[index]) ? records[index].path : null;
    if (typeof current !== 'string') continue;
    if (previous !== null && previous >= current) {
      addFailure(`producer-outcome.evidence.${category}: paths must be unique and strictly ASCII sorted`);
      return;
    }
    previous = current;
  }
}

function evidenceRules(model) {
  const rules = new Map(Object.entries(COMMON_EVIDENCE_RULES));
  if (!MODELS.has(model)) return rules;
  for (const [evidencePath, stage] of [
    [`diagnostics/${model}.buildx-metadata.json`, 'build'],
    [`diagnostics/${model}.buildx-version.txt`, 'build'],
    [`diagnostics/${model}.docker-server-version.txt`, 'build'],
    [`diagnostics/${model}.image-inspect.json`, 'build'],
    [`locks/${model}.requirements.lock`, 'resolve'],
    [`manifests/${model}.container-observation.json`, 'build'],
    [`manifests/${model}.runtime-inputs.json`, 'resolve'],
    [`manifests/${model}.wheelhouse.manifest.json`, 'resolve'],
  ]) {
    rules.set(evidencePath, { stage, category: 'control' });
  }
  if (model === 'mace') {
    rules.set('manifests/python-hostlist.derived-wheel.manifest.json', {
      stage: 'wheelhouse',
      category: 'control',
    });
  }
  return rules;
}

function requiredFilesForModel(model) {
  if (!MODELS.has(model)) return new Map();
  const required = new Map(Object.entries(COMMON_REQUIRED_FILES));
  required.set('resolve', Object.freeze([
    `locks/${model}.requirements.lock`,
    `manifests/${model}.runtime-inputs.json`,
    `manifests/${model}.wheelhouse.manifest.json`,
  ]));
  required.set('build', Object.freeze([
    `diagnostics/${model}.buildx-metadata.json`,
    `diagnostics/${model}.buildx-version.txt`,
    `diagnostics/${model}.docker-server-version.txt`,
    `diagnostics/${model}.image-inspect.json`,
    `manifests/${model}.container-observation.json`,
  ]));
  if (model === 'mace') {
    required.set('wheelhouse', Object.freeze([
      ...COMMON_REQUIRED_FILES.wheelhouse,
      'manifests/python-hostlist.derived-wheel.manifest.json',
    ]));
  }
  return required;
}

function evidenceCategory(rule, stageOutcome) {
  if (rule.category === 'failure') {
    return TERMINAL_OUTCOMES.has(stageOutcome) ? 'failure' : null;
  }
  if (TERMINAL_OUTCOMES.has(stageOutcome)) return 'partial';
  if (stageOutcome !== 'success') return null;
  return rule.category;
}

function formatSchemaFailure(error) {
  const location = error.instancePath || '/';
  return `producer-outcome.schema${location}: ${error.keyword} ${error.message ?? 'validation failed'}`;
}

function validateSchemaBinding(schemaBytes, addFailure) {
  let observed;
  try {
    observed = toBuffer(schemaBytes, 'producer-outcome schema');
  } catch (error) {
    addFailure(`producer-outcome.schema.raw: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  if (
    sha256(observed) !== FULL_CANDIDATE_PRODUCER_OUTCOME_SCHEMA_RAW_DIGEST
    || !observed.equals(producerOutcomeSchemaBytes)
  ) {
    addFailure('producer-outcome.schema.raw: bytes differ from the frozen producer-outcome schema');
  }
}

function failureCollector(failures) {
  return (message) => {
    if (failures.length >= MAX_REPORTED_FAILURES || failures.includes(message)) return;
    failures.push(message);
  };
}

function toBuffer(bytes, label = 'producer outcome') {
  if (Buffer.isBuffer(bytes)) return Buffer.from(bytes);
  if (bytes instanceof Uint8Array) return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  throw new TypeError(`${label} must be supplied as bytes`);
}

function sha256(bytes) {
  return `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
