import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdtempSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseR16cJsonBytes } from './r16c_json_integrity.mjs';
import {
  runGate,
  validateR18aReceipt,
} from './pfhub7a_r18a_schema_gate_v3.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const receiptPath = process.env.TF_R18A_RECEIPT
  ? resolve(process.env.TF_R18A_RECEIPT)
  : resolve(
    repositoryRoot,
    'evaluation/mesoscale/fixtures/pfhub7a-r18a-independent-solver-preflight-v4-successor-v3-receipt.json',
  );
const specificationPath = resolve(
  repositoryRoot,
  'evaluation/mesoscale/preregistrations/pfhub7a-r18a-independent-solver-preflight-v4-resolved.json',
);
const lockPath = resolve(
  repositoryRoot,
  'evaluation/mesoscale/dependencies/pfhub7a-r18a-fipy/runtime-lock-v1.json',
);
const parse = (path, label) => parseR16cJsonBytes(readFileSync(path), {
  label,
  maximumDepth: 64,
});
const receipt = parse(receiptPath, 'R18a successor test receipt');
const specification = parse(specificationPath, 'R18a test specification');
const runtimeLock = parse(lockPath, 'R18a test runtime lock');

const canonicalize = (value) => {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
};
const digestRecords = (records) => `sha256:${createHash('sha256')
  .update(JSON.stringify(canonicalize(records)))
  .digest('hex')}`;

const withMutant = (mutate, callback) => {
  const directory = mkdtempSync(join(tmpdir(), 'tf-r18a-schema-'));
  try {
    const mutant = structuredClone(receipt);
    mutate(mutant);
    const path = join(directory, 'mutant.json');
    writeFileSync(path, JSON.stringify(mutant));
    callback(path, mutant);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
};

// This semantic-only harness is local to the test module. Production runGate
// always applies schema validation and the frozen receipt byte identity.
const runTestOnlySemanticGate = (path) => {
  const mutant = parse(path, 'R18a test-only semantic mutant');
  const semanticErrors = validateR18aReceipt(mutant, specification, runtimeLock);
  return {
    status: semanticErrors.length === 0 ? 'pass' : 'fail',
    semanticErrors,
  };
};

const assertSemanticMutationFails = (mutate, pattern) => withMutant(mutate, (path) => {
  const result = runTestOnlySemanticGate(path);
  assert.equal(result.status, 'fail');
  assert.match(result.semanticErrors.join('\n'), pattern);
});

const setPointerValue = (root, pointer, value) => {
  const tokens = pointer.slice(1).split('/');
  const property = tokens.pop();
  let parent = root;
  for (const token of tokens) parent = parent[token];
  parent[property] = value;
};

const quantityPath = '/scientificSemantics/quantityRegistry';
const quantityReason = 'quantity registry must exactly equal the frozen dimensionless registry';
const historicalMutationCases = [
  {
    testId: 'r18a.prefreeze-p1.bound.rounded-down',
    field: '/scientificSemantics/boundaryCompatibility/conservativeBoundaryTraceMismatchUpperBound/decimalOutwardUpper',
    value: '0.000012204318378837',
    expectedReason: 'boundary compatibility and outward-rounded analytic bound must exactly equal the frozen values',
  },
  {
    testId: 'r18a.prefreeze-p1.dimension.source',
    field: `${quantityPath}/source/dimension`,
    value: 'dimensionless-rate',
    expectedReason: quantityReason,
  },
  {
    testId: 'r18a.prefreeze-p1.dimension.kappa',
    field: `${quantityPath}/kappa/dimension`,
    value: 'reduced-length^2/reduced-time',
    expectedReason: quantityReason,
  },
  {
    testId: 'r18a.prefreeze-p1.dimension.discrete-l2',
    field: `${quantityPath}/discreteL2/dimension`,
    value: 'dimensionless-times-reduced-length',
    expectedReason: quantityReason,
  },
  {
    testId: 'r18a.prefreeze-p1.dimension.algebraic-residual-l2',
    field: `${quantityPath}/algebraicResidualL2/dimension`,
    value: 'solver-equation-residual',
    expectedReason: quantityReason,
  },
  {
    testId: 'r18a.prefreeze-p1.basis.source',
    field: `${quantityPath}/source/basis`,
    value: 'change in reduced eta per reduced time',
    expectedReason: quantityReason,
  },
  {
    testId: 'r18a.prefreeze-p1.basis.kappa',
    field: `${quantityPath}/kappa/basis`,
    value: 'coefficient multiplying the reduced-coordinate Laplacian in the registered nondimensional PDE',
    expectedReason: quantityReason,
  },
  {
    testId: 'r18a.prefreeze-p1.basis.discrete-l2',
    field: `${quantityPath}/discreteL2/basis`,
    value: 'square root of the cell sum of squared eta differences times dx*dy; no domain normalization',
    expectedReason: quantityReason,
  },
  {
    testId: 'r18a.prefreeze-p1.basis.algebraic-residual-l2',
    field: `${quantityPath}/algebraicResidualL2/basis`,
    value: 'Euclidean norm of the frozen FiPy assembled linear-system residual; diagnostic for this algebraic solve only',
    expectedReason: quantityReason,
  },
  {
    testId: 'r18a.prefreeze-p1.source-date.historical-commit',
    field: '/sourceMetadata/1/date',
    value: '2015-09-09',
    expectedReason: 'historical CHiMaD commit date changed',
  },
];

for (const mutationCase of historicalMutationCases) {
  test(mutationCase.testId, (context) => {
    withMutant(
      (mutant) => setPointerValue(mutant, mutationCase.field, mutationCase.value),
      (path) => {
        const result = runTestOnlySemanticGate(path);
        const observedReason = result.semanticErrors
          .find((reason) => reason === mutationCase.expectedReason) ?? null;
        assert.equal(result.status, 'fail');
        assert.equal(observedReason, mutationCase.expectedReason);
        context.diagnostic(`MUTATION_EVIDENCE ${JSON.stringify({
          testId: mutationCase.testId,
          mutatedField: mutationCase.field,
          mutatedValue: mutationCase.value,
          expectedReason: mutationCase.expectedReason,
          observedReason,
          assertionOutcome: 'pass',
        })}`);
      },
    );
  });
}

test('formal successor receipt passes strict schema, identity, locator, and semantic gates', () => {
  assert.deepEqual(runGate(receiptPath), {
    status: 'pass', schemaErrors: [], semanticErrors: [],
  });
});

test('formal receipt identity rejects a one-byte whitespace mutation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tf-r18a-identity-'));
  try {
    const path = join(directory, 'receipt.json');
    writeFileSync(path, Buffer.concat([readFileSync(receiptPath), Buffer.from(' ')]));
    const result = runGate(path);
    assert.equal(result.status, 'fail');
    assert.match(result.semanticErrors.join('\n'), /frozen formal successor identity/u);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test('legacy identity-bypass argument cannot make mutated production bytes pass', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tf-r18a-legacy-bypass-'));
  try {
    const path = join(directory, 'receipt.json');
    writeFileSync(path, Buffer.concat([readFileSync(receiptPath), Buffer.from(' ')]));
    const result = runGate(path, { allowUnfrozenMutation: true });
    assert.equal(result.status, 'fail');
    assert.match(result.semanticErrors.join('\n'), /frozen formal successor identity/u);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test('formal receipt identity is content-bound rather than temporary-path-bound', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tf-r18a-identity-copy-'));
  try {
    const path = join(directory, 'receipt.json');
    writeFileSync(path, readFileSync(receiptPath));
    assert.deepEqual(runGate(path), {
      status: 'pass', schemaErrors: [], semanticErrors: [],
    });
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});

test('capability escalation and provenance rewrites are rejected', () => {
  withMutant(
    (mutant) => { mutant.capabilityCeiling.reproduced = true; },
    (path) => {
      const result = runGate(path);
      assert.equal(result.status, 'fail');
      assert.match(result.schemaErrors.join('\n'), /must be equal to constant/u);
    },
  );
  assertSemanticMutationFails(
    (mutant) => { mutant.scientificSemantics.executedTracks[1].metricSpecifiedByPfhub = true; },
    /exact-trace metric provenance/u,
  );
});

test('acceptance matrix deletion, text, locator, and pass-state rewrites are rejected', () => {
  withMutant(
    (mutant) => { mutant.acceptanceMatrix.pop(); },
    (path) => assert.match(
      runGate(path).schemaErrors.join('\n'),
      /fewer than 24 items/u,
    ),
  );
  assertSemanticMutationFails(
    (mutant) => { mutant.acceptanceMatrix[0].requirement += ' mutated'; },
    /acceptance matrix IDs, groups, order, text/u,
  );
  assertSemanticMutationFails(
    (mutant) => { mutant.acceptanceMatrix[0].evidenceLocators[0] = '/garbage'; },
    /evidence locators/u,
  );
  withMutant(
    (mutant) => { mutant.acceptanceMatrix[0].passed = false; },
    (path) => assert.match(
      runGate(path).schemaErrors.join('\n'),
      /must be equal to constant/u,
    ),
  );
});

test('acceptance evidence resolver rejects a missing target', () => {
  withMutant(
    (mutant) => { delete mutant.runtime.address; },
    (path) => assert.match(
      runTestOnlySemanticGate(path).semanticErrors.join('\n'),
      /object target is missing/u,
    ),
  );
});

test('acceptance evidence resolver rejects wildcard cardinality drift', () => {
  withMutant(
    (mutant) => {
      mutant.scientificSemantics.executedTracks.push(
        structuredClone(mutant.scientificSemantics.executedTracks[0]),
      );
      mutant.scientificSemantics.cleanRoomOracle.comparisons.push(
        structuredClone(mutant.scientificSemantics.cleanRoomOracle.comparisons[0]),
      );
    },
    (path) => assert.match(
      runTestOnlySemanticGate(path).semanticErrors.join('\n'),
      /resolved 3, expected 2/u,
    ),
  );
});

test('acceptance evidence resolver rejects a pseudo-locator identity predicate failure', () => {
  withMutant(
    (mutant) => { mutant.candidateSources.supervisor.rawDigest = `sha256:${'0'.repeat(64)}`; },
    (path) => assert.match(
      runTestOnlySemanticGate(path).semanticErrors.join('\n'),
      /pseudo-locator did not resolve/u,
    ),
  );
});

test('rich semantic probes bind modes, reasons, transforms, and measured signals', () => {
  assertSemanticMutationFails(
    (mutant) => { mutant.negativeProbes[1].probeMode = 'worker-result-semantic-mutant'; },
    /negative probe IDs, modes, mutations/u,
  );
  assertSemanticMutationFails(
    (mutant) => { mutant.negativeProbes[0].mutatedSourceDigest = `sha256:${'0'.repeat(64)}`; },
    /source digests do not derive/u,
  );
  assertSemanticMutationFails(
    (mutant) => { mutant.negativeProbes[3].observation.maximumMatrixAbsoluteDifference = 0; },
    /full-system signals/u,
  );
  assertSemanticMutationFails(
    (mutant) => { mutant.negativeProbes[8].observation = {
      maximumMatrixAbsoluteDifference: 1,
      maximumRhsAbsoluteDifference: 1,
      maximumEndpointAbsoluteDifference: 1,
      boundaryDigestMismatchCount: 1,
    }; },
    /full-system signals/u,
  );
});

test('effective equation and source metadata rewrites are rejected', () => {
  assertSemanticMutationFails(
    (mutant) => { mutant.scientificSemantics.equation += ' mutated'; },
    /equation or time-integrator/u,
  );
  assertSemanticMutationFails(
    (mutant) => { mutant.sourceMetadata[0].name += ' mutated'; },
    /source metadata/u,
  );
});

test('executed and comparison track identity rewrites are rejected', () => {
  assertSemanticMutationFails(
    (mutant) => { mutant.scientificSemantics.executedTracks[0].trackId = 'exact-trace-companion'; },
    /executed track order or identity/u,
  );
  assertSemanticMutationFails(
    (mutant) => {
      mutant.scientificSemantics.cleanRoomOracle.comparisons[0].trackId = 'exact-trace-companion';
    },
    /comparison track or step identity/u,
  );
});

test('candidate source and executed worker triples are fully bound', () => {
  assertSemanticMutationFails(
    (mutant) => { mutant.candidateSources.supervisor.rawDigest = `sha256:${'0'.repeat(64)}`; },
    /supervisor identity differs/u,
  );
  assertSemanticMutationFails(
    (mutant) => { mutant.runtime.workerObservation.worker.byteSize += 1; },
    /executed worker path, size, or digest/u,
  );
  assertSemanticMutationFails(
    (mutant) => {
      const record = mutant.runtime.workerObservation.moduleInventory.records
        .find(({ classification }) => classification === 'worker');
      record.origin = '$RUNTIME/fake-worker.py';
      mutant.runtime.workerObservation.moduleInventory.recordsDigest = digestRecords(
        mutant.runtime.workerObservation.moduleInventory.records,
      );
    },
    /moduleInventory identity differs|candidate-bound __main__ worker triple/u,
  );
});

test('module inventory truncation cannot be hidden by recomputing count and digest', () => {
  assertSemanticMutationFails(
    (mutant) => {
      const inventory = mutant.runtime.workerObservation.moduleInventory;
      inventory.records.pop();
      inventory.recordCount = inventory.records.length;
      inventory.recordsDigest = digestRecords(inventory.records);
    },
    /moduleInventory identity differs/u,
  );
});

test('module and dyld inventory ordering and uniqueness are enforced', () => {
  assertSemanticMutationFails(
    (mutant) => {
      const inventory = mutant.runtime.workerObservation.moduleInventory;
      [inventory.records[0], inventory.records[1]] = [inventory.records[1], inventory.records[0]];
      inventory.recordsDigest = digestRecords(inventory.records);
    },
    /moduleInventory identity differs|module inventory names/u,
  );
  assertSemanticMutationFails(
    (mutant) => {
      const inventory = mutant.runtime.workerObservation.dyldInventory;
      inventory.records[1].index = 0;
      inventory.recordsDigest = digestRecords(inventory.records);
    },
    /dyldInventory identity differs|dyld inventory indices/u,
  );
});

test('worker step and comparison digest chains are cross-bound', () => {
  assertSemanticMutationFails(
    (mutant) => {
      mutant.scientificSemantics.executedTracks[0].steps[1].oldStateDigest = `sha256:${'0'.repeat(64)}`;
    },
    /worker step 2 digest chain/u,
  );
  assertSemanticMutationFails(
    (mutant) => {
      mutant.scientificSemantics.cleanRoomOracle.comparisons[0].steps[0].workerRhsDigest = `sha256:${'0'.repeat(64)}`;
    },
    /worker step 1 digest chain/u,
  );
  assertSemanticMutationFails(
    (mutant) => {
      mutant.scientificSemantics.cleanRoomOracle.comparisons[0].steps[1].oracleOldStateDigest = `sha256:${'0'.repeat(64)}`;
    },
    /oracle step 2 digest chain/u,
  );
  assertSemanticMutationFails(
    (mutant) => {
      mutant.scientificSemantics.cleanRoomOracle.comparisons[0].oracleEndpointDigest = `sha256:${'0'.repeat(64)}`;
    },
    /terminal digest chain/u,
  );
});

test('legacy provenance field is rejected by schema', () => {
  withMutant(
    (mutant) => { mutant.scientificSemantics.trackRegistry[0].pfhubOfficial = true; },
    (path) => assert.match(
      runGate(path).schemaErrors.join('\n'),
      /additional properties/u,
    ),
  );
});

test('inventory digest canonicalization is independent of object insertion order', () => {
  const mutant = structuredClone(receipt);
  const original = mutant.runtime.workerObservation.moduleInventory.records[0];
  mutant.runtime.workerObservation.moduleInventory.records[0] = Object.fromEntries(
    Object.entries(original).reverse(),
  );
  const failures = validateR18aReceipt(mutant, specification, runtimeLock);
  assert.equal(failures.some((failure) => failure.includes('moduleInventory digest mismatch')), false);
});

test('duplicate JSON members are rejected before Ajv or identity checks', () => {
  const directory = mkdtempSync(join(tmpdir(), 'tf-r18a-duplicate-'));
  try {
    const path = join(directory, 'duplicate.json');
    const text = readFileSync(receiptPath, 'utf8').replace(
      '"status":"pass"',
      '"status":"pass","status":"pass"',
    );
    writeFileSync(path, text);
    assert.throws(() => runGate(path), /duplicate JSON key/u);
  } finally {
    rmSync(directory, { force: true, recursive: true });
  }
});
