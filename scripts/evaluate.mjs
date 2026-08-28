import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
const scorecard = await readJson('evaluation/current-scorecard.json');
const registry = await readJson('evaluation/baselines/registry.json');
const hardGateFailures = [...scorecard.hardGateFailures];

const totalWeight = scorecard.dimensions.reduce((sum, dimension) => sum + dimension.weight, 0);
if (totalWeight !== 100) hardGateFailures.push(`Scorecard weights must total 100; received ${totalWeight}.`);
for (const dimension of scorecard.dimensions) {
  if (!Number.isInteger(dimension.score) || dimension.score < 0 || dimension.score > 4) hardGateFailures.push(`${dimension.id}: evidence score must be an integer from 0 to 4.`);
  if (dimension.score > 0 && (!Array.isArray(dimension.evidence) || dimension.evidence.length === 0)) hardGateFailures.push(`${dimension.id}: non-zero score has no evidence.`);
  if (!dimension.acceptanceTest) hardGateFailures.push(`${dimension.id}: next iteration lacks an acceptance test.`);
}

if (registry.snapshotDate !== scorecard.baselineSnapshotDate) hardGateFailures.push('Comparator registry and candidate scorecard use different snapshot dates.');
for (const comparator of registry.comparators) {
  for (const key of ['id', 'name', 'scope', 'source', 'revision', 'evidence', 'reason']) {
    if (!comparator[key]) hardGateFailures.push(`${comparator.id ?? 'unknown comparator'}: missing ${key}.`);
  }
  if (comparator.evidence === 'vendor_reported' && comparator.comparable) hardGateFailures.push(`${comparator.id}: vendor-reported evidence cannot enter a numeric ranking.`);
}

const snapshotAgeDays = Math.floor((Date.now() - Date.parse(`${registry.snapshotDate}T00:00:00Z`)) / 86_400_000);
if (snapshotAgeDays > 45) hardGateFailures.push(`Comparator registry is ${snapshotAgeDays} days old; refresh and review it before promotion.`);

const claimFiles = ['app/page.tsx', 'app/layout.tsx', 'README.md'];
const forbiddenClaims = [/industrial[- ]grade/i, /scientifically validated/i, /已达到.{0,8}SOTA/i, /工业级预测/];
for (const relativePath of claimFiles) {
  let content = '';
  try { content = await readFile(path.join(root, relativePath), 'utf8'); } catch { continue; }
  for (const pattern of forbiddenClaims) {
    if (pattern.test(content)) hardGateFailures.push(`${relativePath}: unsupported product claim matches ${pattern}.`);
  }
}

const weightedScore = scorecard.dimensions.reduce((sum, dimension) => sum + dimension.weight * dimension.score / 4, 0);
const severityByDimension = { contract: 'P0', atomistic: 'P0', coupling: 'P0', process: 'P1', data: 'P1', uq_ood: 'P1' };
const gaps = scorecard.dimensions
  .filter((dimension) => dimension.score < 3)
  .map((dimension) => ({
    severity: severityByDimension[dimension.id] ?? (dimension.score === 0 ? 'P1' : 'P2'),
    dimension: dimension.id,
    evidence: dimension.evidence.length ? dimension.evidence.join('; ') : 'No executable evidence in the current candidate.',
    recommendedChange: dimension.nextAction,
    acceptanceTest: dimension.acceptanceTest,
    priority: (4 - dimension.score) * dimension.weight * (severityByDimension[dimension.id] === 'P0' ? 2 : 1),
  }))
  .sort((left, right) => right.priority - left.priority)
  .slice(0, 3)
  .map(({ severity, dimension, evidence, recommendedChange, acceptanceTest }) => ({ severity, dimension, evidence, recommendedChange, acceptanceTest }));

const digestFiles = [
  'package.json', 'package-lock.json', 'vite.config.ts',
  'app/page.tsx', 'app/layout.tsx', 'app/globals.css',
  'lib/simulation/lennard-jones.ts',
  'evaluation/current-scorecard.json', 'evaluation/baselines/registry.json',
];
const digest = createHash('sha256');
for (const relativePath of digestFiles) digest.update(await readFile(path.join(root, relativePath)));

const verdict = hardGateFailures.length > 0 ? 'reject' : weightedScore >= 60 ? 'accept' : 'conditional';
const report = {
  schemaVersion: 'tf.evaluation/0.1',
  candidateVersion: scorecard.candidateVersion,
  generatedAt: new Date().toISOString(),
  baselineSnapshotDate: registry.snapshotDate,
  artifactDigest: `sha256:${digest.digest('hex')}`,
  runtime: { node: process.version, platform: process.platform, architecture: process.arch },
  weightedScore: Number(weightedScore.toFixed(2)),
  hardGateFailures,
  dimensions: scorecard.dimensions,
  comparators: registry.comparators,
  gaps,
  verdict,
};

const markdown = [
  `# Tailing Sentinel — ${report.candidateVersion}`,
  '',
  `- Verdict: **${verdict.toUpperCase()}**`,
  `- Evidence maturity: **${report.weightedScore.toFixed(2)} / 100** (not a SOTA score)`,
  `- Comparator snapshot: **${report.baselineSnapshotDate}**`,
  `- Artifact: \`${report.artifactDigest}\``,
  '',
  '## Hard gates',
  '',
  ...(hardGateFailures.length ? hardGateFailures.map((failure) => `- FAIL — ${failure}`) : ['- PASS — no preregistered hard-gate failure in the lightweight R0 suite.']),
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
  'This score measures evidence and engineering maturity only. Vendor-reported capabilities are not treated as reproduced numerical baselines, and the R0 browser solver is not a real-material or industrial-process predictor.',
  '',
].join('\n');

await writeFile(path.join(root, 'evaluation/latest-report.json'), `${JSON.stringify(report, null, 2)}\n`);
await writeFile(path.join(root, 'evaluation/latest-report.md'), markdown);

console.log(`Tailing Sentinel: ${verdict.toUpperCase()} · ${report.weightedScore.toFixed(2)}/100 · ${gaps.length} next gaps`);
if (hardGateFailures.length) {
  for (const failure of hardGateFailures) console.error(`HARD GATE: ${failure}`);
  process.exitCode = 1;
}
