import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { validateFrozenAtomisticPlan, validateFrozenAtomisticPlanBytes } from './plan-policy.mjs';

const planBytes = await readFile(new URL('../../evaluation/atomistic/reproduction-plan.json', import.meta.url));
const planText = planBytes.toString('utf8');
const plan = JSON.parse(planText);
const mutated = (change) => {
  const candidate = structuredClone(plan);
  change(candidate);
  return validateFrozenAtomisticPlan(candidate);
};

describe('frozen atomistic preregistration contract', () => {
  it('accepts the checked-in frozen identities and transforms', () => {
    expect(validateFrozenAtomisticPlan(plan)).toEqual([]);
    expect(validateFrozenAtomisticPlanBytes(planBytes)).toEqual([]);
  });

  it('rejects coherent replacement of an active model source and checkpoint', () => {
    const failures = mutated((candidate) => {
      const model = candidate.models[0];
      model.sourceCommit = 'a'.repeat(40);
      model.sourceUrl = `https://github.com/example/other/tree/${model.sourceCommit}`;
      model.checkpoint = {
        url: `https://raw.githubusercontent.com/example/other/${model.sourceCommit}/model.pth`,
        sizeBytes: 91176875,
        sha256: `sha256:${'b'.repeat(64)}`,
      };
    });
    expect(failures.join('\n')).toMatch(/sourceCommit|sourceUrl|checkpoint/);
  });

  it('rejects a coherently renamed package and a model reorder', () => {
    const packageFailures = mutated((candidate) => {
      const pkg = candidate.models[1].package;
      pkg.name = 'other-package';
      pkg.version = '9.9.9';
      pkg.filename = 'other_package-9.9.9-py3-none-any.whl';
      pkg.url = `https://files.pythonhosted.org/packages/00/00/${pkg.filename}`;
      pkg.cachePath = `atomistic/packages/${pkg.filename}`;
      pkg.sha256 = `sha256:${'c'.repeat(64)}`;
    });
    expect(packageFailures.join('\n')).toMatch(/package/);
    expect(mutated((candidate) => candidate.models.reverse()).join('\n')).toMatch(/ordered identities/);
  });

  it('rejects replacement of the primary benchmark even when its fields remain well formed', () => {
    const failures = mutated((candidate) => {
      const benchmark = candidate.benchmarks[0];
      benchmark.id = 'lookalike-random-tp';
      benchmark.sourceCommit = 'd'.repeat(40);
      benchmark.source = `https://github.com/example/data/blob/${benchmark.sourceCommit}/random-TP.xyz`;
      benchmark.artifact.url = `https://raw.githubusercontent.com/example/data/${benchmark.sourceCommit}/random-TP.xyz`;
      benchmark.artifact.sha256 = `sha256:${'e'.repeat(64)}`;
      benchmark.artifact.sizeBytes += 1;
    });
    expect(failures.join('\n')).toMatch(/benchmark\.(id|source|sourceCommit|artifact)/);
  });

  it('rejects identity and zero transforms', () => {
    const failures = mutated((candidate) => {
      candidate.protocol.invariance.translationFractionalShift = [0, 0, 0];
      candidate.protocol.invariance.properRotation = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    });
    expect(failures.join('\n')).toMatch(/translationFractionalShift/);
    expect(failures.join('\n')).toMatch(/properRotation/);
  });

  it('rejects claim, energy-convention and license semantic drift', () => {
    for (const change of [
      (candidate) => { candidate.models[0].energyConvention = 'Use any convenient energy convention without disclosure.'; },
      (candidate) => { candidate.benchmarks[0].license = 'Unrestricted redistribution is assumed.'; },
      (candidate) => { candidate.protocol.randomTpAcceptance.claimBoundary = 'Treat this as official and bit-exact.'; },
    ]) expect(mutated(change).join('\n')).toMatch(/plan\.semantic/);
  });

  it('rejects deterministic metric-report protocol drift', () => {
    const failures = mutated((candidate) => {
      candidate.protocol.metrics.summation = 'native-array-reduce';
      candidate.protocol.metrics.reportDefinitions.force.unit = 'arbitrary';
      candidate.protocol.metrics.reportedStatistics.pop();
      candidate.protocol.metrics.perIdMetricEvidenceRootProtocol = 'duplicate-records-allowed/v0';
    });
    expect(failures.join('\n')).toMatch(/plan\.semantic/);
  });

  it('rejects duplicate JSON members even when last-wins parsing preserves semantics', () => {
    const duplicate = planText.replace(
      '  "schemaVersion": "tf.atomistic-reproduction/0.2",',
      '  "schemaVersion": "tf.atomistic-reproduction/forged",\n  "schemaVersion": "tf.atomistic-reproduction/0.2",',
    );
    expect(JSON.parse(duplicate)).toEqual(plan);
    expect(validateFrozenAtomisticPlanBytes(Buffer.from(duplicate))).toEqual([
      'plan.raw: frozen preregistration byte digest mismatch',
    ]);
  });
});
