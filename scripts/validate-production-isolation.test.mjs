import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { auditPublicProductEvaluation } from './validate-production-isolation.mjs';

const temporaryRoots = [];
const artifactDigest = `sha256:${'a'.repeat(64)}`;
const dimensionIds = [
  'contract', 'data', 'atomistic', 'mesoscale', 'continuum', 'process',
  'coupling', 'world_rollout', 'uq_ood', 'repro_cost', 'visual_truth', 'safety',
];
const dimensionWeights = [8, 8, 12, 8, 10, 10, 14, 8, 8, 6, 4, 4];
const comparatorIds = [
  'aido-cell-1.0', 'equiformerv3-dens-oam', 'tece-oam-rra-1.0',
  'mattersim-1.0.0-5m', 'mace-mpa-0', 'openmm-8.5.1-tip3p-ions',
  'openmm-8.6.0-tip3p-control', 'pfhub-benchmark-3', 'cantera-3.2-cstr',
  'idaes-2.12',
];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
    force: true,
    recursive: true,
  })));
});

describe('production public product evaluation isolation', () => {
  it('accepts only the canonical allowlisted projection and scans clean dist bytes', async () => {
    const root = await fixture();
    const result = await auditPublicProductEvaluation({ root });
    const projection = JSON.parse(await readFile(
      path.join(root, 'evaluation/public-product-evaluation.json'),
      'utf8',
    ));

    expect(result).toMatchObject({ scannedFileCount: 1, forbiddenMarkerCount: 8 });
    expect(Object.keys(projection)).toEqual([
      'schemaVersion', 'sourceArtifactDigest', 'scorecard', 'comparators',
    ]);
    expect(Object.keys(projection.scorecard.dimensions[0])).toEqual([
      'id', 'displayLabel', 'weight', 'score', 'summary',
    ]);
    expect(Object.keys(projection.comparators.items[0])).toEqual([
      'id', 'name', 'scope', 'evidenceClass',
    ]);
    for (const forbidden of [
      'private evidence', 'private/path', 'private acceptance', 'private reason',
      'claimOwner', 'checkpointDigest',
    ]) expect(JSON.stringify(projection)).not.toContain(forbidden);
  });

  it('rejects projection drift and source drift independently', async () => {
    const projectionDrift = await fixture();
    const projectionPath = path.join(
      projectionDrift,
      'evaluation/public-product-evaluation.json',
    );
    const projection = JSON.parse(await readFile(projectionPath, 'utf8'));
    projection.scorecard.dimensions[0].score = 4;
    await writeFile(projectionPath, `${JSON.stringify(projection, null, 2)}\n`);
    await expect(auditPublicProductEvaluation({ root: projectionDrift }))
      .rejects.toThrow(/canonical exact projection/);

    const sourceDrift = await fixture();
    const registryPath = path.join(sourceDrift, 'evaluation/baselines/registry.json');
    const registry = JSON.parse(await readFile(registryPath, 'utf8'));
    registry.comparators[0].name = 'Changed public comparator';
    await writeFile(registryPath, `${JSON.stringify(registry, null, 2)}\n`);
    await expect(auditPublicProductEvaluation({ root: sourceDrift }))
      .rejects.toThrow(/canonical exact projection/);
  });

  it('rejects a forbidden full-evaluation field across a scan chunk boundary', async () => {
    const root = await fixture();
    const marker = Buffer.from('evidenceArtifacts', 'utf8');
    await writeFile(path.join(root, 'dist/client.js'), Buffer.concat([
      Buffer.alloc(64 * 1024 - 5, 0x61),
      marker,
    ]));

    await expect(auditPublicProductEvaluation({ root }))
      .rejects.toThrow(/forbidden full-evaluation field/);
  });
});

async function fixture() {
  const root = await mkdtemp(path.join(tmpdir(), 'tailing-production-evaluation-'));
  temporaryRoots.push(root);
  await mkdir(path.join(root, 'evaluation/baselines'), { recursive: true });
  await mkdir(path.join(root, 'dist'), { recursive: true });
  const scorecard = scorecardFixture();
  const registry = registryFixture();
  const projection = publicProjection(scorecard, registry);
  await Promise.all([
    writeFile(
      path.join(root, 'evaluation/current-scorecard.json'),
      `${JSON.stringify(scorecard, null, 2)}\n`,
    ),
    writeFile(
      path.join(root, 'evaluation/baselines/registry.json'),
      `${JSON.stringify(registry, null, 2)}\n`,
    ),
    writeFile(
      path.join(root, 'evaluation/public-summary.json'),
      `${JSON.stringify({ artifactDigest, verdict: 'conditional', gaps: [] }, null, 2)}\n`,
    ),
    writeFile(
      path.join(root, 'evaluation/public-product-evaluation.json'),
      `${JSON.stringify(projection, null, 2)}\n`,
    ),
    writeFile(path.join(root, 'dist/client.js'), 'export default {};\n'),
  ]);
  return root;
}

function scorecardFixture() {
  return {
    schemaVersion: 'tf.scorecard/test',
    candidateVersion: 'test-candidate-1',
    baselineSnapshotDate: '2026-08-29',
    hardGateFailures: [],
    dimensions: dimensionIds.map((id, index) => ({
      id,
      label: `private label ${id}`,
      displayLabel: `Public ${id}`,
      weight: dimensionWeights[index],
      score: index % 5,
      promotionFloor: 0,
      summary: `Public summary ${id}`,
      evidence: ['private evidence'],
      evidenceArtifacts: ['private/path'],
      nextAction: 'private next action',
      acceptanceTest: 'private acceptance',
    })),
  };
}

function registryFixture() {
  return {
    schemaVersion: 'tf.comparators/test',
    snapshotDate: '2026-08-29',
    policy: 'private policy',
    comparators: comparatorIds.map((id, index) => ({
      id,
      name: `Public comparator ${index + 1}`,
      scope: `Public scope ${index + 1}`,
      source: 'https://private.invalid/source',
      revision: 'private revision',
      evidenceClass: index === 0 ? 'claim' : index < 5 ? 'auditable' : 'reference',
      claimOwner: 'private owner',
      comparable: false,
      checkpointDigest: `sha256:${String(index + 1).repeat(64).slice(0, 64)}`,
      reason: 'private reason',
    })),
  };
}

function publicProjection(scorecard, registry) {
  return {
    schemaVersion: 'tf.public-product-evaluation/0.1',
    sourceArtifactDigest: artifactDigest,
    scorecard: {
      candidateVersion: scorecard.candidateVersion,
      dimensions: scorecard.dimensions.map((dimension) => ({
        id: dimension.id,
        displayLabel: dimension.displayLabel,
        weight: dimension.weight,
        score: dimension.score,
        summary: dimension.summary,
      })),
    },
    comparators: {
      snapshotDate: registry.snapshotDate,
      items: registry.comparators.map((comparator) => ({
        id: comparator.id,
        name: comparator.name,
        scope: comparator.scope,
        evidenceClass: comparator.evidenceClass,
      })),
    },
  };
}
