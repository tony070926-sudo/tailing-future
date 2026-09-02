import { constants as fsConstants } from 'node:fs';
import { lstat, open, readdir } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { auditProductionDist } from './release-artifact.mjs';

const MAX_EVALUATION_INPUT_BYTES = 2 * 1024 * 1024;
const MAX_PUBLIC_PRODUCT_EVALUATION_BYTES = 32 * 1024;
const MAX_DIST_FILE_BYTES = 50 * 1024 * 1024;
const READ_CHUNK_BYTES = 64 * 1024;
const PUBLIC_PRODUCT_EVALUATION_VERSION = 'tf.public-product-evaluation/0.1';
const PUBLIC_SCORECARD_DIMENSION_IDS = Object.freeze([
  'contract',
  'data',
  'atomistic',
  'mesoscale',
  'continuum',
  'process',
  'coupling',
  'world_rollout',
  'uq_ood',
  'repro_cost',
  'visual_truth',
  'safety',
]);
const PUBLIC_COMPARATOR_IDS = Object.freeze([
  'aido-cell-1.0',
  'equiformerv3-dens-oam',
  'tece-oam-rra-1.0',
  'mattersim-1.0.0-5m',
  'mace-mpa-0',
  'openmm-8.5.1-tip3p-ions',
  'openmm-8.6.0-tip3p-control',
  'pfhub-benchmark-3',
  'cantera-3.2-cstr',
  'idaes-2.12',
]);
const PUBLIC_COMPARATOR_EVIDENCE_CLASSES = new Set([
  'claim',
  'auditable',
  'reference',
  'reproduced',
]);
const FORBIDDEN_EVALUATION_DIST_MARKERS = Object.freeze([
  'acceptanceTest',
  'baselineSnapshotDate',
  'claimOwner',
  'evidenceArtifacts',
  'hardGateFailures',
  'promotionFloor',
  'tf.comparators/0.2',
  'tf.scorecard/0.2',
]);

export async function auditPublicProductEvaluation({ root }) {
  const [scorecardBytes, registryBytes, publicSummaryBytes, publicProductBytes] =
    await Promise.all([
      readStableFile(
        path.join(root, 'evaluation/current-scorecard.json'),
        'evaluation/current-scorecard.json',
        MAX_EVALUATION_INPUT_BYTES,
      ),
      readStableFile(
        path.join(root, 'evaluation/baselines/registry.json'),
        'evaluation/baselines/registry.json',
        MAX_EVALUATION_INPUT_BYTES,
      ),
      readStableFile(
        path.join(root, 'evaluation/public-summary.json'),
        'evaluation/public-summary.json',
        MAX_PUBLIC_PRODUCT_EVALUATION_BYTES,
      ),
      readStableFile(
        path.join(root, 'evaluation/public-product-evaluation.json'),
        'evaluation/public-product-evaluation.json',
        MAX_PUBLIC_PRODUCT_EVALUATION_BYTES,
      ),
    ]);
  const scorecard = parseJson(scorecardBytes, 'evaluation/current-scorecard.json');
  const registry = parseJson(registryBytes, 'evaluation/baselines/registry.json');
  const publicSummary = parseJson(publicSummaryBytes, 'evaluation/public-summary.json');
  if (!publicSummary || typeof publicSummary !== 'object' || Array.isArray(publicSummary)
    || !/^sha256:[0-9a-f]{64}$/.test(publicSummary.artifactDigest ?? '')) {
    throw new Error('production public summary lacks a source artifact digest');
  }
  const expectedPublicProductBytes = encodePublicProductEvaluation(
    publicSummary.artifactDigest,
    scorecard,
    registry,
  );
  if (!publicProductBytes.equals(expectedPublicProductBytes)) {
    throw new Error(
      'production public product evaluation is not the canonical exact projection of the scorecard and comparator registry',
    );
  }

  const distFiles = await walkRegularFiles(root, 'dist');
  for (const relativePath of distFiles) {
    await scanStableFileForForbiddenMarkers(
      path.join(root, relativePath),
      relativePath,
      FORBIDDEN_EVALUATION_DIST_MARKERS,
    );
  }
  return Object.freeze({
    projectionByteLength: publicProductBytes.byteLength,
    scannedFileCount: distFiles.length,
    forbiddenMarkerCount: FORBIDDEN_EVALUATION_DIST_MARKERS.length,
  });
}

function encodePublicProductEvaluation(sourceArtifactDigest, scorecard, registry) {
  if (!/^sha256:[0-9a-f]{64}$/.test(sourceArtifactDigest ?? '')) {
    throw new Error('production public product projection lacks a source artifact digest');
  }
  if (!scorecard || typeof scorecard !== 'object' || Array.isArray(scorecard)
    || !isPublicIdentifier(scorecard.candidateVersion, 128)
    || !Array.isArray(scorecard.dimensions)
    || scorecard.dimensions.length !== PUBLIC_SCORECARD_DIMENSION_IDS.length) {
    throw new Error('production scorecard cannot enter the public product projection');
  }
  const dimensions = scorecard.dimensions.map((dimension, index) => {
    const expectedId = PUBLIC_SCORECARD_DIMENSION_IDS[index];
    if (!dimension || typeof dimension !== 'object' || Array.isArray(dimension)
      || dimension.id !== expectedId
      || !isPublicText(dimension.displayLabel, 96)
      || !Number.isSafeInteger(dimension.weight)
      || dimension.weight < 0
      || dimension.weight > 100
      || !Number.isSafeInteger(dimension.score)
      || dimension.score < 0
      || dimension.score > 4
      || !isPublicText(dimension.summary, 256)) {
      throw new Error(`production scorecard dimension cannot enter the public product projection: ${expectedId}`);
    }
    return {
      id: dimension.id,
      displayLabel: dimension.displayLabel,
      weight: dimension.weight,
      score: dimension.score,
      summary: dimension.summary,
    };
  });
  if (dimensions.reduce((total, dimension) => total + dimension.weight, 0) !== 100) {
    throw new Error('production public scorecard weights must total 100');
  }
  if (!registry || typeof registry !== 'object' || Array.isArray(registry)
    || !/^\d{4}-\d{2}-\d{2}$/.test(registry.snapshotDate ?? '')
    || !Array.isArray(registry.comparators)
    || registry.comparators.length !== PUBLIC_COMPARATOR_IDS.length) {
    throw new Error('production comparator registry cannot enter the public product projection');
  }
  const items = registry.comparators.map((comparator, index) => {
    const expectedId = PUBLIC_COMPARATOR_IDS[index];
    if (!comparator || typeof comparator !== 'object' || Array.isArray(comparator)
      || comparator.id !== expectedId
      || !isPublicText(comparator.name, 128)
      || !isPublicText(comparator.scope, 256)
      || !PUBLIC_COMPARATOR_EVIDENCE_CLASSES.has(comparator.evidenceClass)) {
      throw new Error(`production comparator cannot enter the public product projection: ${expectedId}`);
    }
    return {
      id: comparator.id,
      name: comparator.name,
      scope: comparator.scope,
      evidenceClass: comparator.evidenceClass,
    };
  });
  const projection = {
    schemaVersion: PUBLIC_PRODUCT_EVALUATION_VERSION,
    sourceArtifactDigest,
    scorecard: {
      candidateVersion: scorecard.candidateVersion,
      dimensions,
    },
    comparators: {
      snapshotDate: registry.snapshotDate,
      items,
    },
  };
  const bytes = Buffer.from(`${JSON.stringify(projection, null, 2)}\n`, 'utf8');
  if (bytes.length < 2
    || bytes.length > MAX_PUBLIC_PRODUCT_EVALUATION_BYTES
    || bytes.includes(0)) {
    throw new Error('production public product projection exceeds its byte contract');
  }
  return bytes;
}

function isPublicIdentifier(value, maximumLength) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maximumLength
    && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value);
}

function isPublicText(value, maximumLength) {
  return typeof value === 'string'
    && value.length > 0
    && value.length <= maximumLength
    && !/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/u.test(value);
}

function parseJson(bytes, relativePath) {
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    throw new Error(`production evaluation input is malformed JSON: ${relativePath}`);
  }
}

async function walkRegularFiles(root, relativeDirectory) {
  const output = [];
  async function visit(relativePath) {
    const absolutePath = path.join(root, relativePath);
    const metadata = await lstat(absolutePath);
    if (metadata.isSymbolicLink() || (!metadata.isDirectory() && !metadata.isFile())) {
      throw new Error(`production evaluation scan path is not a regular file/directory: ${relativePath}`);
    }
    if (metadata.isFile()) {
      if (metadata.nlink !== 1) {
        throw new Error(`production evaluation scan file has multiple hard links: ${relativePath}`);
      }
      output.push(relativePath);
      return;
    }
    const entries = await readdir(absolutePath);
    for (const entry of entries.sort()) await visit(path.posix.join(relativePath, entry));
  }
  await visit(relativeDirectory);
  return output.sort();
}

async function readStableFile(absolutePath, relativePath, maximumBytes) {
  const before = await lstat(absolutePath, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
    || before.size < 1n || before.size > BigInt(maximumBytes)) {
    throw new Error(`production evaluation input is not one bounded regular file: ${relativePath}`);
  }
  const handle = await open(absolutePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  try {
    const opened = await handle.stat({ bigint: true });
    if (!sameIdentity(before, opened)) {
      throw new Error(`production evaluation input changed before read: ${relativePath}`);
    }
    const bytes = Buffer.allocUnsafe(Number(before.size));
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(bytes, offset, bytes.length - offset, offset);
      if (bytesRead === 0) {
        throw new Error(`production evaluation input became shorter during read: ${relativePath}`);
      }
      offset += bytesRead;
    }
    const probe = Buffer.allocUnsafe(1);
    try {
      if ((await handle.read(probe, 0, 1, bytes.length)).bytesRead !== 0) {
        throw new Error(`production evaluation input grew during read: ${relativePath}`);
      }
    } finally {
      probe.fill(0);
    }
    const after = await handle.stat({ bigint: true });
    if (!sameIdentity(before, after)) {
      throw new Error(`production evaluation input changed during read: ${relativePath}`);
    }
    return bytes;
  } finally {
    await handle.close();
  }
}

async function scanStableFileForForbiddenMarkers(
  absolutePath,
  relativePath,
  markerStrings,
) {
  const before = await lstat(absolutePath, { bigint: true });
  if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1n
    || before.size > BigInt(MAX_DIST_FILE_BYTES)) {
    throw new Error(`production evaluation dist path is not one bounded regular file: ${relativePath}`);
  }
  const handle = await open(absolutePath, fsConstants.O_RDONLY | (fsConstants.O_NOFOLLOW ?? 0));
  const markers = markerStrings.map((marker) => Buffer.from(marker, 'utf8'));
  const maximumMarkerBytes = markers.reduce(
    (maximum, marker) => Math.max(maximum, marker.byteLength),
    0,
  );
  const chunk = Buffer.allocUnsafe(
    Math.max(1, Math.min(READ_CHUNK_BYTES, Number(before.size) || 1)),
  );
  let carry = Buffer.alloc(0);
  try {
    const opened = await handle.stat({ bigint: true });
    if (!sameIdentity(before, opened)) {
      throw new Error(`production evaluation dist path changed before scan: ${relativePath}`);
    }
    let offset = 0;
    while (offset < Number(before.size)) {
      const { bytesRead } = await handle.read(
        chunk,
        0,
        Math.min(chunk.length, Number(before.size) - offset),
        offset,
      );
      if (bytesRead === 0) {
        throw new Error(`production evaluation dist path became shorter during scan: ${relativePath}`);
      }
      const bytes = chunk.subarray(0, bytesRead);
      const window = carry.length ? Buffer.concat([carry, bytes]) : bytes;
      for (const marker of markers) {
        if (window.indexOf(marker) !== -1) {
          throw new Error(`production dist contains a forbidden full-evaluation field: ${relativePath}`);
        }
      }
      carry.fill(0);
      const retainedBytes = Math.min(Math.max(0, maximumMarkerBytes - 1), window.length);
      carry = Buffer.from(window.subarray(window.length - retainedBytes));
      if (window !== bytes) window.fill(0);
      offset += bytesRead;
    }
    const probe = Buffer.allocUnsafe(1);
    try {
      if ((await handle.read(probe, 0, 1, Number(before.size))).bytesRead !== 0) {
        throw new Error(`production evaluation dist path grew during scan: ${relativePath}`);
      }
    } finally {
      probe.fill(0);
    }
    const after = await handle.stat({ bigint: true });
    if (!sameIdentity(before, after)) {
      throw new Error(`production evaluation dist path changed during scan: ${relativePath}`);
    }
  } finally {
    chunk.fill(0);
    carry.fill(0);
    await handle.close();
  }
}

function sameIdentity(left, right) {
  return left.dev === right.dev
    && left.ino === right.ino
    && left.mode === right.mode
    && left.nlink === right.nlink
    && left.size === right.size
    && left.mtimeNs === right.mtimeNs
    && left.ctimeNs === right.ctimeNs;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  const root = process.cwd();
  const result = await auditProductionDist({ root });
  const evaluation = await auditPublicProductEvaluation({ root });
  console.log(
    `Production isolation: PASS · ${result.fileCount} files · ${result.totalBytes} bytes · ${result.contentRootDigest} · public evaluation ${evaluation.projectionByteLength} bytes / ${evaluation.forbiddenMarkerCount} forbidden fields absent`,
  );
}
