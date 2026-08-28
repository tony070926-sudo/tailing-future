import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { artifactContracts, canonicalCacheRoot, fetchCachedArtifact, verifyCachedArtifact } from './artifact-cache.mjs';
import { inspectRandomTp } from './dataset-manifest.mjs';

const root = process.cwd();
const plan = JSON.parse(await readFile(path.join(root, 'evaluation/atomistic/reproduction-plan.json'), 'utf8'));
const cacheArgumentIndex = process.argv.indexOf('--cache-root');
const cacheRoot = cacheArgumentIndex >= 0 ? process.argv[cacheArgumentIndex + 1] : process.env.TAILING_ATOMISTIC_CACHE;
if (!cacheRoot || !path.isAbsolute(cacheRoot)) throw new Error('Pass an absolute --cache-root or set TAILING_ATOMISTIC_CACHE.');
const canonicalRoot = await canonicalCacheRoot(cacheRoot);
const verifyOnly = process.argv.includes('--verify-only');
const modelArgumentIndex = process.argv.indexOf('--model');
const modelSelection = modelArgumentIndex >= 0 ? process.argv[modelArgumentIndex + 1] : 'all';
const modelPrefix = { mattersim: 'mattersim-v1.0.0-5m:', mace: 'mace-mpa-0-medium:' }[modelSelection];
if (modelSelection !== 'all' && !modelPrefix) throw new Error('--model must be mattersim, mace or omitted for all models.');
const artifacts = artifactContracts(plan).filter((artifact) => artifact.kind === 'dataset' || modelSelection === 'all' || artifact.id.startsWith(modelPrefix));
const verified = [];

for (const artifact of artifacts) {
  const result = verifyOnly
    ? await verifyCachedArtifact(canonicalRoot, artifact)
    : await fetchCachedArtifact(canonicalRoot, artifact);
  verified.push({
    id: result.id,
    kind: result.kind,
    cachePath: result.cachePath,
    sizeBytes: result.verifiedSizeBytes,
    sha256: result.verifiedSha256,
    sourceUrl: artifact.url,
    finalHost: result.finalHost ?? null,
  });
}

const benchmark = plan.benchmarks.find((entry) => entry.role === 'primary-like-for-like');
if (!benchmark?.cachePath) throw new Error('The primary atomistic benchmark is missing its cache path.');
const dataset = inspectRandomTp(await readFile(path.join(canonicalRoot, benchmark.cachePath)), benchmark.artifact.smokeIds);
for (const [key, expected] of Object.entries({
  frames: benchmark.artifact.frames,
  atoms: benchmark.artifact.atoms,
  elements: benchmark.artifact.elements,
  smokeElements: benchmark.artifact.smokeElements,
  idSetSha256: benchmark.artifact.idSetSha256,
  smokeManifestSha256: benchmark.artifact.smokeManifestSha256,
  recordManifestSha256: benchmark.artifact.recordManifestSha256,
  smokeRecordManifestSha256: benchmark.artifact.smokeRecordManifestSha256,
})) {
  if (dataset[key] !== expected) throw new Error(`${benchmark.id}: expected ${key}=${expected}, received ${dataset[key]}.`);
}

console.log(JSON.stringify({
  schemaVersion: 'tf.atomistic-cache-verification/0.1',
  mode: verifyOnly ? 'verify-only' : 'fetch-and-verify',
  modelSelection,
  cacheRoot: canonicalRoot,
  artifacts: verified,
  dataset: {
    id: benchmark.id,
    frames: dataset.frames,
    atoms: dataset.atoms,
    elements: dataset.elements,
    smokeElements: dataset.smokeElements,
    idSetSha256: dataset.idSetSha256,
    smokeManifestSha256: dataset.smokeManifestSha256,
    recordManifestSha256: dataset.recordManifestSha256,
    smokeRecordManifestSha256: dataset.smokeRecordManifestSha256,
  },
}, null, 2));
