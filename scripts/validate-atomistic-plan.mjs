import { createHash } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import path from 'node:path';
import Ajv2020 from 'ajv/dist/2020.js';

const root = process.cwd();
const readJson = async (relativePath) => JSON.parse(await readFile(path.join(root, relativePath), 'utf8'));
const plan = await readJson('evaluation/atomistic/reproduction-plan.json');
const schema = await readJson('schemas/atomistic-reproduction.schema.json');
const catalog = await readJson('evaluation/data/datasets.json');
const failures = [];

const ajv = new Ajv2020({ allErrors: true, validateFormats: false });
const validate = ajv.compile(schema);
if (!validate(plan)) failures.push(`schema: ${JSON.stringify(validate.errors)}`);

if (new Set(plan.models.map((model) => model.role)).size !== 2) failures.push('models: active and challenger roles must both be present');
for (const model of plan.models) {
  if (/\/main(?:\/|$)|\/master(?:\/|$)/.test(model.sourceUrl) || /\/main(?:\/|$)|\/master(?:\/|$)/.test(model.checkpoint.url)) failures.push(`${model.id}: mutable branch URL is forbidden`);
  if (!model.sourceUrl.includes(model.sourceCommit)) failures.push(`${model.id}: source URL is not bound to sourceCommit`);
  if (model.defaultAliasAllowed) failures.push(`${model.id}: default model aliases must remain disabled`);
  if (model.outputs.length !== 3) failures.push(`${model.id}: E/F/stress outputs are all required`);
  if (!model.package.url.endsWith(model.package.filename) || !model.package.cachePath.endsWith(model.package.filename)) failures.push(`${model.id}: package filename, URL and cache path disagree`);
  if (!model.intendedUse || model.outOfScope.length < 2 || !model.levelOfTheory || !model.energyConvention) failures.push(`${model.id}: model-use and energy-convention boundaries are incomplete`);
}

const uma = plan.excludedDefaults.find((entry) => entry.id === 'facebook-uma');
const requiredUmaRestrictions = ['critical infrastructure', 'transportation', 'heavy machinery', 'nuclear'];
if (!uma
  || uma.revision !== 'f611b917d9c68566bbbeccbb0aa0f7cad1696cb2'
  || uma.gating !== 'manual'
  || uma.industrialDefaultAllowed !== false
  || !requiredUmaRestrictions.every((category) => uma.restrictedCategories.includes(category))
  || uma.obligations.length < 4) failures.push('facebook-uma: fixed legal exclusion contract is incomplete');
else {
  const legalByKind = Object.fromEntries(uma.legalEvidence.map((evidence) => [evidence.kind, evidence]));
  if (legalByKind['model-card-and-embedded-use-policy']?.sha256 !== 'sha256:fb36209d8c19c5cc86d6bdf1402201159fc8883d7402ed349d2aa1fd3f0aa4ca') failures.push('facebook-uma: fixed README/use-policy digest mismatch');
  if (legalByKind.license?.sha256 !== 'sha256:9dbfc25ed718f486587677d3eab6212aae5044859473a1229f6a26f44e22c0b0') failures.push('facebook-uma: fixed license digest mismatch');
  if (legalByKind['acceptable-use-policy']?.sha256 !== null || !legalByKind['acceptable-use-policy']?.accessStatus.includes('identity-gated')) failures.push('facebook-uma: separately gated AUP must remain explicitly unresolved');
}

const primary = plan.benchmarks.find((benchmark) => benchmark.role === 'primary-like-for-like');
if (!primary) failures.push('benchmark: primary like-for-like benchmark is missing');
else {
  const expected = { frames: 693, atoms: 11088, elements: 89 };
  for (const [key, value] of Object.entries(expected)) if (primary.artifact[key] !== value) failures.push(`${primary.id}: expected ${key}=${value}`);
  if (!primary.artifact.sha256 || primary.artifact.smokeIds?.length !== 10) failures.push(`${primary.id}: digest or 10-frame smoke manifest is missing`);
}

const unresolved = plan.benchmarks.filter((benchmark) => benchmark.artifact.sha256 === null);
if (unresolved.some((benchmark) => benchmark.redistribute)) failures.push('benchmark: unresolved artifacts cannot be redistributable');
if (catalog.schemaVersion !== 'tf.dataset-catalog/0.1' || catalog.datasets.length < 4) failures.push('dataset catalog is incomplete');
for (const dataset of catalog.datasets) {
  if (!dataset.license || !dataset.source?.startsWith('https://') || !Array.isArray(dataset.requiredProvenance) || dataset.requiredProvenance.length < 4) failures.push(`${dataset.id}: incomplete license/source/provenance contract`);
  if (dataset.sha256 && !/^sha256:[0-9a-f]{64}$/.test(dataset.sha256)) failures.push(`${dataset.id}: malformed SHA-256`);
}

if (process.argv.includes('--verify-cache')) {
  const cacheRoot = process.env.TAILING_ATOMISTIC_CACHE;
  if (!cacheRoot || !path.isAbsolute(cacheRoot)) failures.push('cache: TAILING_ATOMISTIC_CACHE must be an absolute path');
  else {
    let canonicalCacheRoot;
    try { canonicalCacheRoot = await realpath(cacheRoot); } catch (error) { failures.push(`cache: root is unavailable (${error instanceof Error ? error.message : String(error)})`); }
    const artifacts = [
      ...plan.models.map((model) => ({ id: `${model.id} package`, ...model.package })),
      ...plan.models.map((model) => ({ id: model.id, cachePath: model.cachePath, ...model.checkpoint })),
      ...plan.benchmarks.filter((benchmark) => benchmark.artifact.sha256 && benchmark.cachePath).map((benchmark) => ({ id: benchmark.id, cachePath: benchmark.cachePath, ...benchmark.artifact })),
    ];
    for (const artifact of canonicalCacheRoot ? artifacts : []) {
      try {
        const absolutePath = path.resolve(canonicalCacheRoot, artifact.cachePath);
        const relativeToCache = path.relative(canonicalCacheRoot, absolutePath);
        if (relativeToCache.startsWith('..') || path.isAbsolute(relativeToCache)) throw new Error('cache path escapes TAILING_ATOMISTIC_CACHE');
        const canonicalArtifactPath = await realpath(absolutePath);
        const canonicalRelative = path.relative(canonicalCacheRoot, canonicalArtifactPath);
        if (canonicalRelative.startsWith('..') || path.isAbsolute(canonicalRelative)) throw new Error('cached artifact symlink escapes TAILING_ATOMISTIC_CACHE');
        const metadata = await stat(canonicalArtifactPath);
        if (artifact.sizeBytes && metadata.size !== artifact.sizeBytes) failures.push(`${artifact.id}: expected ${artifact.sizeBytes} bytes, found ${metadata.size}`);
        const digest = createHash('sha256').update(await readFile(canonicalArtifactPath)).digest('hex');
        if (`sha256:${digest}` !== artifact.sha256) failures.push(`${artifact.id}: cached SHA-256 mismatch`);
      } catch (error) {
        failures.push(`${artifact.id}: cached artifact unavailable (${error instanceof Error ? error.message : String(error)})`);
      }
    }
  }
}

if (failures.length) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  console.log(`Atomistic plan: VALID · ${plan.models.length} pinned models · ${plan.benchmarks.length} benchmarks · ${unresolved.length} intentionally blocked artifact(s) · ${process.argv.includes('--verify-cache') ? 'PACKAGE/CHECKPOINT/DATA BYTES VERIFIED' : 'MANIFEST ONLY'}`);
}
