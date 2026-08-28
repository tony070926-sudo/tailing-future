import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export const FROZEN_PLAN_SEMANTIC_DIGEST = 'sha256:f9c8f8989e556a55bb9901c8879b6c3f3230ddc246b44bd57dfe1474e9efa354';
export const FROZEN_PLAN_RAW_DIGEST = 'sha256:d3a58524029b51c598d00a7bb9f60b6479a9973a0f9907cbf94a31e61bf1c9c2';

export const FROZEN_MODEL_CONTRACTS = Object.freeze({
  'mattersim-v1.0.0-5m': Object.freeze({
    role: 'active',
    evidenceClass: 'auditable',
    sourceCommit: '40a1eb8f1189a53af310957b4f2c5dfbfe68d647',
    sourceUrl: 'https://github.com/microsoft/mattersim/tree/40a1eb8f1189a53af310957b4f2c5dfbfe68d647',
    license: 'MIT',
    package: Object.freeze({
      name: 'mattersim',
      version: '1.2.5',
      filename: 'mattersim-1.2.5-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl',
      url: 'https://files.pythonhosted.org/packages/63/00/5ebc37661b3333793b2861827439cc8e2a3129dd0c9694d54028328650ef/mattersim-1.2.5-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl',
      sizeBytes: 755919,
      sha256: 'sha256:1b5e46ba56efa5c1e93372ad32321300fa5e1f07dd9188a11b727bd578cf8d7f',
      pythonTag: 'cp312',
      abiTag: 'cp312',
      platformTag: 'manylinux_2_17_x86_64.manylinux2014_x86_64',
      requiresPython: '>=3.12',
      cachePath: 'atomistic/packages/mattersim-1.2.5-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl',
    }),
    checkpoint: Object.freeze({
      url: 'https://raw.githubusercontent.com/microsoft/mattersim/40a1eb8f1189a53af310957b4f2c5dfbfe68d647/pretrained_models/mattersim-v1.0.0-5M.pth',
      sizeBytes: 91176875,
      sha256: 'sha256:e3df9fa708725e3d453140646c7d1838324b347a3d1214cf1440522146f872b5',
    }),
    outputs: Object.freeze(['energy_eV', 'forces_eV_per_angstrom', 'stress_eV_per_angstrom3']),
    defaultAliasAllowed: false,
    cachePath: 'atomistic/mattersim-v1.0.0-5M.pth',
  }),
  'mace-mpa-0-medium': Object.freeze({
    role: 'challenger',
    evidenceClass: 'auditable',
    sourceCommit: '4d2da09413ac1407f37cdbb6b81fa28e4c15655e',
    sourceUrl: 'https://github.com/ACEsuit/mace/tree/4d2da09413ac1407f37cdbb6b81fa28e4c15655e',
    license: 'MIT',
    package: Object.freeze({
      name: 'mace-torch',
      version: '0.3.16',
      filename: 'mace_torch-0.3.16-py3-none-any.whl',
      url: 'https://files.pythonhosted.org/packages/6d/4d/07293363e4abe6484c9ee4d705e5953421a6b6e2a74e4d7fb58abea729cf/mace_torch-0.3.16-py3-none-any.whl',
      sizeBytes: 316021,
      sha256: 'sha256:b80407edf6b2a1ec8523668c2a36852d20927ce1c3c56b70983a9f2dc53233ad',
      pythonTag: 'py3',
      abiTag: 'none',
      platformTag: 'any',
      requiresPython: '>=3.9',
      cachePath: 'atomistic/packages/mace_torch-0.3.16-py3-none-any.whl',
    }),
    checkpoint: Object.freeze({
      url: 'https://github.com/ACEsuit/mace-foundations/releases/download/mace_mpa_0/mace-mpa-0-medium.model',
      sizeBytes: 79462305,
      sha256: 'sha256:75428afe3a1d7d8062e19bcaabd5c433623cabf308242ec9fb493e38604fb638',
    }),
    outputs: Object.freeze(['energy_eV', 'forces_eV_per_angstrom', 'stress_eV_per_angstrom3']),
    defaultAliasAllowed: false,
    cachePath: 'atomistic/mace-mpa-0-medium.model',
  }),
});

export const FROZEN_PRIMARY_BENCHMARK = Object.freeze({
  id: 'mattersim-random-tp',
  role: 'primary-like-for-like',
  evidenceClass: 'auditable',
  source: 'https://github.com/microsoft/mattersim/blob/40a1eb8f1189a53af310957b4f2c5dfbfe68d647/data/benchmarks/random-TP.xyz',
  sourceCommit: '40a1eb8f1189a53af310957b4f2c5dfbfe68d647',
  redistribute: false,
  cachePath: 'atomistic/random-TP.xyz',
  artifact: Object.freeze({
    url: 'https://raw.githubusercontent.com/microsoft/mattersim/40a1eb8f1189a53af310957b4f2c5dfbfe68d647/data/benchmarks/random-TP.xyz',
    sizeBytes: 1514015,
    sha256: 'sha256:c14473dcf4bd71e1ed11556ac9ff12b68e7a423d813f939bc9eedaef663054d9',
  }),
});

const FROZEN_INVARIANCE_TRANSFORMS = Object.freeze({
  translationFractionalShift: Object.freeze([0.173, 0.271, 0.389]),
  translationConvention: 'row-cell-r-prime=r+[0.173,0.271,0.389]@A0-no-wrap-cell-unchanged/v1',
  permutation: 'reverse-atom-order/v1',
  permutationComparison: 'inverse-permute-forces-energy-and-stress-unchanged/v1',
  properRotation: Object.freeze([[0, -1, 0], [1, 0, 0], [0, 0, 1]]),
  rotationConvention: 'column-vector-R-row-positions-and-cell-right-multiply-R-transpose/v1',
  rotationComparison: 'force-back=F_rot@R-stress-back=R-transpose@S_rot@R-energy-unchanged/v1',
  periodicImageShift: 'zero-based-atom-i-r_i-prime=r_i+A0[i-mod-3]-cell-unchanged-no-wrap/v1',
  periodicImageComparison: 'energy-force-and-stress-unchanged/v1',
});

const FROZEN_METRIC_REPORT_PROTOCOL = Object.freeze({
  summation: 'ascii-id-order-python-3.12-math-fsum-divide-by-693/v1',
  quantileMethod: 'Hyndman-Fan-7-linear',
  quantiles: Object.freeze([0.5, 0.9, 0.95, 0.99]),
  reportedStatistics: Object.freeze(['mean', 'p50', 'p90', 'p95', 'p99', 'worst']),
  worstTieBreak: 'error-descending-then-ascii-id-ascending',
  perIdMetricEvidenceRootProtocol: 'sha256-merkle-canonical-json-array-model-id-metric-id-error-ascii-id-order-duplicate-id-forbidden/v1',
  reportDefinitions: Object.freeze({
    energy: Object.freeze({ definition: 'absolute-total-energy-error-divided-by-frame-atom-count', unit: 'eV/atom' }),
    force: Object.freeze({ definition: 'mean-per-atom-l2-vector-error-per-frame', unit: 'eV/angstrom' }),
    stress: Object.freeze({ definition: 'full-3x3-frobenius-error-in-gpa-per-frame', unit: 'GPa' }),
  }),
});

const compare = (failures, label, actual, expected) => {
  if (!isDeepStrictEqual(actual, expected)) failures.push(`${label}: frozen value mismatch`);
};

export function validateFrozenAtomisticPlan(plan) {
  const failures = [];
  let semanticDigest;
  try {
    semanticDigest = `sha256:${createHash('sha256').update(canonicalJson(plan), 'utf8').digest('hex')}`;
  } catch (error) {
    failures.push(`plan.semantic: canonicalization failed (${error instanceof Error ? error.message : String(error)})`);
  }
  if (semanticDigest !== FROZEN_PLAN_SEMANTIC_DIGEST) failures.push('plan.semantic: frozen preregistration digest mismatch');
  const expectedIds = Object.keys(FROZEN_MODEL_CONTRACTS);
  const models = Array.isArray(plan?.models) ? plan.models : [];
  compare(failures, 'models: exact ordered identities', models.map((model) => model?.id), expectedIds);

  for (const id of expectedIds) {
    const matches = models.filter((model) => model?.id === id);
    if (matches.length !== 1) {
      failures.push(`${id}: expected exactly one frozen model entry`);
      continue;
    }
    const actual = matches[0];
    const expected = FROZEN_MODEL_CONTRACTS[id];
    for (const field of ['role', 'evidenceClass', 'sourceCommit', 'sourceUrl', 'license', 'package', 'checkpoint', 'outputs', 'defaultAliasAllowed', 'cachePath']) {
      compare(failures, `${id}.${field}`, actual[field], expected[field]);
    }
  }

  const primaryMatches = Array.isArray(plan?.benchmarks)
    ? plan.benchmarks.filter((benchmark) => benchmark?.role === 'primary-like-for-like')
    : [];
  if (primaryMatches.length !== 1) failures.push('benchmark: expected exactly one frozen primary-like-for-like entry');
  else {
    const primary = primaryMatches[0];
    for (const field of ['id', 'role', 'evidenceClass', 'source', 'sourceCommit', 'redistribute', 'cachePath']) {
      compare(failures, `benchmark.${field}`, primary[field], FROZEN_PRIMARY_BENCHMARK[field]);
    }
    for (const field of ['url', 'sizeBytes', 'sha256']) {
      compare(failures, `benchmark.artifact.${field}`, primary.artifact?.[field], FROZEN_PRIMARY_BENCHMARK.artifact[field]);
    }
  }

  const invariance = plan?.protocol?.invariance;
  for (const [field, expected] of Object.entries(FROZEN_INVARIANCE_TRANSFORMS)) {
    compare(failures, `protocol.invariance.${field}`, invariance?.[field], expected);
  }
  const metrics = plan?.protocol?.metrics;
  for (const [field, expected] of Object.entries(FROZEN_METRIC_REPORT_PROTOCOL)) {
    compare(failures, `protocol.metrics.${field}`, metrics?.[field], expected);
  }
  return failures;
}

export function validateFrozenAtomisticPlanBytes(bytes) {
  const actual = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
  return actual === FROZEN_PLAN_RAW_DIGEST
    ? []
    : ['plan.raw: frozen preregistration byte digest mismatch'];
}

function canonicalJson(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  const encoded = JSON.stringify(value);
  if (encoded === undefined) throw new TypeError('unsupported value in canonical JSON');
  return encoded;
}
