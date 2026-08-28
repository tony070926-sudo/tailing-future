import { createHash } from 'node:crypto';
import { access, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import Ajv2020 from 'ajv/dist/2020.js';
import {
  runThermochemicalVerification,
  ThermochemicalWorld,
} from '../lib/simulation/thermochemical-world.ts';

const root = process.cwd();
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
const scorecard = await readJson('evaluation/current-scorecard.json');
const registry = await readJson('evaluation/baselines/registry.json');
const worldSchema = await readJson('schemas/world-state.schema.json');
const actionSchema = await readJson('schemas/action.schema.json');
const evaluationSchema = await readJson('schemas/evaluation-report.schema.json');
const hardGateFailures = [...scorecard.hardGateFailures];

const upstreamGates = Object.fromEntries(
  ['install', 'lint', 'typecheck', 'test', 'build', 'audit'].map((name) => [name, process.env[`TAILING_${name.toUpperCase()}_STATUS`] ?? 'not-reported-local']),
);
for (const [name, status] of Object.entries(upstreamGates)) {
  if (status !== 'not-reported-local' && status !== 'success') hardGateFailures.push(`Upstream ${name} gate ended with ${status}.`);
}

const totalWeight = scorecard.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
if (totalWeight !== 100) hardGateFailures.push(`Scorecard weights must total 100; received ${totalWeight}.`);

const evidenceManifest = {};
for (const dimension of scorecard.dimensions) {
  if (!Number.isInteger(dimension.score) || dimension.score < 0 || dimension.score > 4) hardGateFailures.push(`${dimension.id}: evidence score must be an integer from 0 to 4.`);
  if (!Number.isInteger(dimension.promotionFloor) || dimension.promotionFloor < 0 || dimension.promotionFloor > 4) hardGateFailures.push(`${dimension.id}: promotion floor must be an integer from 0 to 4.`);
  if (dimension.score < dimension.promotionFloor) hardGateFailures.push(`${dimension.id}: E${dimension.score} is below the R1 promotion floor E${dimension.promotionFloor}.`);
  if (dimension.score > 0 && (!Array.isArray(dimension.evidence) || dimension.evidence.length === 0)) hardGateFailures.push(`${dimension.id}: non-zero score has no evidence statement.`);
  if (dimension.score > 0 && (!Array.isArray(dimension.evidenceArtifacts) || dimension.evidenceArtifacts.length === 0)) hardGateFailures.push(`${dimension.id}: non-zero score has no executable evidence artifact.`);
  if (!dimension.acceptanceTest) hardGateFailures.push(`${dimension.id}: next iteration lacks an acceptance test.`);
  for (const relativePath of dimension.evidenceArtifacts ?? []) {
    try {
      await access(path.join(root, relativePath));
      if (!(relativePath in evidenceManifest)) evidenceManifest[relativePath] = await fileDigest(relativePath);
    } catch {
      hardGateFailures.push(`${dimension.id}: evidence artifact is missing: ${relativePath}.`);
    }
  }
}

if (registry.snapshotDate !== scorecard.baselineSnapshotDate) hardGateFailures.push('Comparator registry and candidate scorecard use different snapshot dates.');
for (const comparator of registry.comparators) {
  for (const key of ['id', 'name', 'scope', 'source', 'revision', 'evidenceClass', 'claimOwner', 'comparable', 'reason']) {
    if (!(key in comparator) || comparator[key] === '') hardGateFailures.push(`${comparator.id ?? 'unknown comparator'}: missing ${key}.`);
  }
  for (const key of ['sourceCommit', 'sourceDigest', 'benchmarkCommit', 'checkpointDigest', 'datasetDigest', 'runnerDigest']) {
    if (!(key in comparator)) hardGateFailures.push(`${comparator.id ?? 'unknown comparator'}: missing explicit ${key} field.`);
  }
  if (!/^sha256:[0-9a-f]{64}$/.test(comparator.sourceDigest ?? '')) hardGateFailures.push(`${comparator.id}: sourceDigest must be a concrete SHA-256 digest.`);
  for (const key of ['sourceCommit', 'benchmarkCommit']) {
    if (comparator[key] !== null && !/^[0-9a-f]{40}$/.test(comparator[key])) hardGateFailures.push(`${comparator.id}: ${key} must be null or a full Git commit.`);
  }
  for (const key of ['checkpointDigest', 'datasetDigest', 'runnerDigest']) {
    if (comparator[key] !== null && !/^sha256:[0-9a-f]{64}$/.test(comparator[key])) hardGateFailures.push(`${comparator.id}: ${key} must be null or a concrete SHA-256 digest.`);
  }
  if (!['claim', 'auditable', 'reference', 'reproduced'].includes(comparator.evidenceClass)) hardGateFailures.push(`${comparator.id}: invalid evidence class.`);
  if (comparator.evidenceClass !== 'reproduced' && comparator.comparable) hardGateFailures.push(`${comparator.id}: only locally reproduced evidence can enter numeric ranking.`);
  if (comparator.evidenceClass === 'reproduced' && (!comparator.runnerDigest || !comparator.datasetDigest)) hardGateFailures.push(`${comparator.id}: reproduced evidence lacks runner or dataset digest.`);
}

const snapshotAgeDays = Math.floor((Date.now() - Date.parse(`${registry.snapshotDate}T00:00:00Z`)) / 86_400_000);
if (snapshotAgeDays > 45) hardGateFailures.push(`Comparator registry is ${snapshotAgeDays} days old; refresh and review it before promotion.`);

const verificationStarted = performance.now();
let physicsVerification = null;
try {
  physicsVerification = runThermochemicalVerification();
  const checks = [
    ['Fourier heat-mode relative L2 error', physicsVerification.heatModeRelativeL2Error < 2e-3, physicsVerification.heatModeRelativeL2Error],
    ['Periodic heat-field energy residual', Math.abs(physicsVerification.heatEnergyResidual) < 5e-12, physicsVerification.heatEnergyResidual],
    ['Closed coupled-world relative energy residual', physicsVerification.coupledEnergyResidual < 2e-3, physicsVerification.coupledEnergyResidual],
    ['Closed coupled-world momentum residual', physicsVerification.momentumResidual < 1e-9, physicsVerification.momentumResidual],
    ['Species conservation residual', physicsVerification.speciesResidual === 0, physicsVerification.speciesResidual],
    ['Mass conservation residual', physicsVerification.massResidual === 0, physicsVerification.massResidual],
    ['Non-trivial interface exchange', physicsVerification.interfaceEnergyMoved > 0, physicsVerification.interfaceEnergyMoved],
    ['Coupling particle coverage', physicsVerification.couplingCoverage >= 0.9, physicsVerification.couplingCoverage],
    ['Non-trivial reaction trajectory', physicsVerification.reactionCount > 0, physicsVerification.reactionCount],
    ['Heat-operator closure residual', physicsVerification.heatClosureResidual < 1e-8, physicsVerification.heatClosureResidual],
    ['Particle-field exchange closure residual', physicsVerification.exchangeClosureResidual < 1e-8, physicsVerification.exchangeClosureResidual],
    ['Reaction closure residual', physicsVerification.reactionClosureResidual < 1e-10, physicsVerification.reactionClosureResidual],
    ['Deterministic full-state replay', physicsVerification.deterministicReplay === true, physicsVerification.deterministicReplay],
    ['Locked trajectory remains in domain', physicsVerification.inDomain === true, physicsVerification.inDomain],
  ];
  for (const [label, passed, value] of checks) if (!passed) hardGateFailures.push(`${label} failed with ${String(value)}.`);
} catch (error) {
  hardGateFailures.push(`Thermochemical verification crashed: ${error instanceof Error ? error.message : String(error)}.`);
}

let schemaVerification = { world: false, action: false, actionMutationCorpus: false, runtimeActionSemantics: false };
try {
  const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true });
  const validateWorld = ajv.compile(worldSchema);
  const validateAction = ajv.compile(actionSchema);
  const sample = new ThermochemicalWorld({ count: 64, gridWidth: 5, gridHeight: 3, seed: 20260828 });
  sample.injectCentralHeatPulse(15);
  const serialized = sample.serialize();
  const invalidActions = [
    { ...serialized.lastAction, kind: 'step', parameters: { deltaKelvin: -999, unknown: 'accepted' } },
    { ...serialized.lastAction, kind: 'set_field_temperature', parameters: { temperatureKelvin: 181, externalEnergyReduced: 0 } },
    { ...serialized.lastAction, kind: 'inject_heat_pulse', parameters: { deltaKelvin: 0, externalEnergyReduced: 0 } },
    { ...serialized.lastAction, kind: 'branch', parameters: { fromStep: -1, branchOrdinal: 0 } },
  ];
  let runtimeActionSemantics = false;
  const crossKindState = structuredClone(serialized);
  crossKindState.lastAction = { ...crossKindState.lastAction, kind: 'step', parameters: { substeps: 1 } };
  try {
    ThermochemicalWorld.fromSerialized(crossKindState);
  } catch (error) {
    runtimeActionSemantics = error instanceof Error && error.message.includes('step action does not match its state transition');
  }
  schemaVerification = {
    world: validateWorld(serialized),
    action: validateAction(serialized.lastAction),
    actionMutationCorpus: invalidActions.every((action) => !validateAction(action)),
    runtimeActionSemantics,
  };
  if (!schemaVerification.world) hardGateFailures.push(`World-state schema validation failed: ${JSON.stringify(validateWorld.errors)}.`);
  if (!schemaVerification.action) hardGateFailures.push(`Action schema validation failed: ${JSON.stringify(validateAction.errors)}.`);
  if (!schemaVerification.actionMutationCorpus) hardGateFailures.push('Action schema accepted an invalid per-kind mutation.');
  if (!schemaVerification.runtimeActionSemantics) hardGateFailures.push('Runtime action semantics accepted or misclassified a cross-kind mutation.');
} catch (error) {
  hardGateFailures.push(`Schema verification crashed: ${error instanceof Error ? error.message : String(error)}.`);
}
const verificationElapsedMs = performance.now() - verificationStarted;

const claimFiles = ['app/page.tsx', 'app/layout.tsx', 'README.md'];
const forbiddenClaims = [/industrial[- ]grade/i, /scientifically validated/i, /已达到.{0,8}SOTA/i, /工业级预测/, /真实材料预测/];
for (const relativePath of claimFiles) {
  let content = '';
  try { content = await readFile(path.join(root, relativePath), 'utf8'); } catch { continue; }
  for (const pattern of forbiddenClaims) if (pattern.test(content)) hardGateFailures.push(`${relativePath}: unsupported product claim matches ${pattern}.`);
}

const applicationFiles = await collectFiles(path.join(root, 'app'));
if (applicationFiles.some((file) => /[/\\]api[/\\].*(control|plc|dcs|sis)/i.test(file))) hardGateFailures.push('A direct industrial-control endpoint exists inside the public application.');

const weightedScore = scorecard.dimensions.reduce((sum, dimension) => sum + dimension.weight * dimension.score / 4, 0);
const gaps = scorecard.dimensions
  .filter((dimension) => dimension.score < 3)
  .map((dimension) => {
    const severity = dimension.score < dimension.promotionFloor ? 'P0' : dimension.score === 0 ? 'P1' : dimension.score === 1 ? 'P1' : 'P2';
    const roadmapBoost = ({ atomistic: 300, mesoscale: 200, process: 100 })[dimension.id] ?? 0;
    return {
      severity,
      dimension: dimension.id,
      evidence: dimension.evidence.length ? dimension.evidence.join('; ') : 'No executable evidence in the current candidate.',
      recommendedChange: dimension.nextAction,
      acceptanceTest: dimension.acceptanceTest,
      priority: (4 - dimension.score) * dimension.weight + roadmapBoost + (severity === 'P0' ? 100 : 0),
    };
  })
  .sort((left, right) => right.priority - left.priority)
  .slice(0, 3)
  .map(({ severity, dimension, evidence, recommendedChange, acceptanceTest }) => ({ severity, dimension, evidence, recommendedChange, acceptanceTest }));

const sourceFiles = await collectFiles(root);
const artifactDigest = createHash('sha256');
for (const absolutePath of sourceFiles) {
  const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
  const content = await readFile(absolutePath);
  artifactDigest.update(`${relativePath.length}:${relativePath}:${content.length}:`);
  artifactDigest.update(content);
}

const upstreamReported = Object.values(upstreamGates).every((status) => status === 'success');
let verdict = hardGateFailures.length > 0 ? 'reject' : weightedScore >= 60 && upstreamReported ? 'accept' : 'conditional';
const report = {
  schemaVersion: 'tf.evaluation/0.2',
  candidateVersion: scorecard.candidateVersion,
  generatedAt: new Date().toISOString(),
  baselineSnapshotDate: registry.snapshotDate,
  artifactDigest: `sha256:${artifactDigest.digest('hex')}`,
  sourceFileCount: sourceFiles.length,
  runtime: { node: process.version, platform: process.platform, architecture: process.arch },
  upstreamGates,
  verification: {
    physics: physicsVerification,
    schemas: schemaVerification,
    elapsedMs: Number(verificationElapsedMs.toFixed(2)),
  },
  evidenceManifest,
  weightedScore: Number(weightedScore.toFixed(2)),
  hardGateFailures,
  dimensions: scorecard.dimensions,
  comparators: registry.comparators,
  gaps,
  verdict,
};

try {
  const ajv = new Ajv2020({ allErrors: true, allowUnionTypes: true, validateFormats: false });
  const validateReport = ajv.compile(evaluationSchema);
  if (!validateReport(report)) {
    hardGateFailures.push(`Evaluation-report schema validation failed: ${JSON.stringify(validateReport.errors)}.`);
    verdict = 'reject';
    report.verdict = verdict;
  }
} catch (error) {
  hardGateFailures.push(`Evaluation-report schema verification crashed: ${error instanceof Error ? error.message : String(error)}.`);
  verdict = 'reject';
  report.verdict = verdict;
}

const markdown = [
  `# Tailing Sentinel — ${report.candidateVersion}`,
  '',
  `- Verdict: **${verdict.toUpperCase()}**`,
  `- Evidence maturity: **${report.weightedScore.toFixed(2)} / 100** (not a SOTA score)`,
  `- Comparator snapshot: **${report.baselineSnapshotDate}**`,
  `- Artifact: \`${report.artifactDigest}\` across ${report.sourceFileCount} source files`,
  '',
  '## Hard gates',
  '',
  ...(hardGateFailures.length ? hardGateFailures.map((failure) => `- FAIL — ${failure}`) : ['- PASS — executable R1 physics, schema, evidence and promotion-floor gates passed.']),
  '',
  '## Executable verification',
  '',
  physicsVerification
    ? `- Fourier L2: ${physicsVerification.heatModeRelativeL2Error.toExponential(3)}; coupled energy residual: ${physicsVerification.coupledEnergyResidual.toExponential(3)}; momentum residual: ${physicsVerification.momentumResidual.toExponential(3)}.`
    : '- Physics verification unavailable.',
  `- World/action schemas and negative mutation corpus: ${schemaVerification.world && schemaVerification.action && schemaVerification.actionMutationCorpus && schemaVerification.runtimeActionSemantics ? 'PASS' : 'FAIL'}; evaluator runtime: ${verificationElapsedMs.toFixed(1)} ms.`,
  '',
  '## Next iteration gaps',
  '',
  ...gaps.flatMap((gap, index) => [
    `${index + 1}. **${gap.severity} · ${gap.dimension}** — ${gap.recommendedChange}`,
    `   - Evidence: ${gap.evidence}`,
    `   - Acceptance: ${gap.acceptanceTest}`,
  ]),
  '',
  '## Interpretation boundary',
  '',
  'This score measures evidence and engineering maturity only. CLAIM and AUDITABLE comparator records are not treated as locally reproduced numerical baselines. R1 is a reduced-unit thermochemical verification world, not a real-material, reactor or industrial-process predictor.',
  '',
].join('\n');

await writeFile(path.join(root, 'evaluation/latest-report.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(root, 'evaluation/latest-report.md'), markdown);

console.log(`Tailing Sentinel: ${verdict.toUpperCase()} · ${report.weightedScore.toFixed(2)}/100 · ${gaps.length} next gaps`);
if (hardGateFailures.length) {
  for (const failure of hardGateFailures) console.error(`HARD GATE: ${failure}`);
  process.exitCode = 1;
}

async function fileDigest(relativePath) {
  const content = await readFile(path.join(root, relativePath));
  return `sha256:${createHash('sha256').update(content).digest('hex')}`;
}

async function collectFiles(directory) {
  const excludedDirectories = new Set(['.git', '.next', '.playwright-cli', '.wrangler', 'dist', 'node_modules', 'output']);
  const files = [];
  let entries;
  try { entries = await readdir(directory, { withFileTypes: true }); } catch { return files; }
  for (const entry of entries) {
    if (entry.isDirectory() && excludedDirectories.has(entry.name)) continue;
    const absolutePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolutePath));
      continue;
    }
    if (!entry.isFile()) continue;
    const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
    if (relativePath === 'evaluation/latest-report.json' || relativePath === 'evaluation/latest-report.md') continue;
    const metadata = await stat(absolutePath);
    if (metadata.size > 8 * 1024 * 1024) continue;
    files.push(absolutePath);
  }
  return files.sort();
}
