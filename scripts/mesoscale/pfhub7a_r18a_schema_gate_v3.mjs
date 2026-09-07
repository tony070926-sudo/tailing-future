#!/usr/bin/env node

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import Ajv2020 from 'ajv/dist/2020.js';
import { parseR16cJsonBytes } from './r16c_json_integrity.mjs';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../..');
const defaultReceipt = resolve(
  repositoryRoot,
  'evaluation/mesoscale/fixtures/pfhub7a-r18a-independent-solver-preflight-v4-successor-v3-receipt.json',
);
const schemaPath = resolve(
  repositoryRoot,
  'schemas/pfhub7a-r18a-preflight-receipt-v0.3.schema.json',
);
const specificationPath = resolve(
  repositoryRoot,
  'evaluation/mesoscale/preregistrations/pfhub7a-r18a-independent-solver-preflight-v4-resolved.json',
);
const runtimeLockPath = resolve(
  repositoryRoot,
  'evaluation/mesoscale/dependencies/pfhub7a-r18a-fipy/runtime-lock-v1.json',
);
const supervisorPath = resolve(repositoryRoot, 'scripts/mesoscale/pfhub7a_r18a_supervise_v3.py');
const workerPath = resolve(repositoryRoot, 'scripts/mesoscale/pfhub7a_r18a_worker.py');
const oraclePath = resolve(repositoryRoot, 'scripts/mesoscale/pfhub7a_r18a_oracle.py');
const formalReceiptIdentity = {
  byteSize: 248778,
  rawDigest: 'sha256:d91e31d261bf77f99b17e810f5f51aab131dd5339e281839933e45fa79855e5c',
};
const expectedInventoryIdentities = {
  moduleInventory: {
    recordCount: 731,
    recordsDigest: 'sha256:21e2d99f188c083b0c2e891bfe0825e33f781cdb2d7cc95615923cea0a91e345',
  },
  dyldInventory: {
    recordCount: 382,
    recordsDigest: 'sha256:bd414bbbbab56931e697891363d385d380e47653c171ac323a6b318569b82927',
  },
};
const registeredSyntheticModules = [
  '_cython_3_2_9',
  '_cython_3_3_0',
  'cython_runtime',
  'pyexpat.errors',
  'pyexpat.model',
  'typing.io',
  'typing.re',
  'xml.parsers.expat.errors',
  'xml.parsers.expat.model',
];

// Deliberately duplicated from the independently executed Python supervisor. A
// receipt cannot redirect an acceptance requirement to an arbitrary path and
// still pass this evaluator.
const acceptanceEvidenceLocators = {
  identityAndIsolation: [
    ['/frozenInputs', '/negativeProbes/6', '/negativeProbes/7'],
    ['/runtime/inputVerification', '/runtime/closure'],
    ['/runtime/address', '/runtime/closure/allRegularFilesLockedReadOnly'],
    ['/runtime/workerObservation/prefix', '/runtime/workerObservation/moduleInventory'],
    ['/runtime/workerObservation/dyldInventory', '/runtime/hostBoundary'],
    ['/runtime/workerObservation/versions'],
    ['/runtime/workerObservation/warningPolicy', '/negativeProbes/8'],
  ],
  scientificSemantics: [
    ['/scientificSemantics/executedTracks/0/mesh', '/scientificSemantics/executedTracks/1/mesh'],
    ['/scientificSemantics/preflightMatrix', '/scientificSemantics/executedTracks/*/steps'],
    ['/scientificSemantics/executedTracks/*/boundaryDefinition', '/scientificSemantics/cleanRoomOracle/comparisons/*/steps/*/boundaryDigestMatched'],
    ['/scientificSemantics/executedTracks/*/initialDigest', '/scientificSemantics/executedTracks/*/endpointDigest'],
    ['/scientificSemantics/executedTracks/*/steps'],
    ['/scientificSemantics/diagnostics/constantTwoDiscreteL2'],
    ['/scientificSemantics/literalSelfPreflight'],
    ['/scientificSemantics/boundaryCompatibility', '/scientificSemantics/diagnostics/analyticBoundaryTailMismatchAtExecutedFaces'],
  ],
  claimAndFailure: [
    ['/capabilityCeiling', '/promotionAuthorized'],
    ['$SUPERVISOR:main', '/negativeProbes'],
    ['$ORACLE:runtimeImportSentinel', '$SUPERVISOR:verify_worker_source', '/candidateSources/privateSnapshot'],
  ],
  resolvedSpecAndCleanRoomOracle: [
    ['/frozenInputs/preregistration'],
    ['/scientificSemantics/boundaryCompatibility', '/scientificSemantics/quantityRegistry', '/sourceMetadata', '/scientificSemantics/trackRegistry'],
    ['/scientificSemantics/linearSolver', '/scientificSemantics/cleanRoomOracle/comparisons'],
    ['/candidateSources/oracle', '/scientificSemantics/cleanRoomOracle/runtimeImportSentinelPassed'],
    ['/negativeProbes/0', '/negativeProbes/1', '/negativeProbes/2', '/negativeProbes/3', '/negativeProbes/4', '/negativeProbes/5'],
    ['$SCHEMA_GATE:forbidden-effective-receipt-values'],
  ],
};

const pointerCardinalities = new Map([
  ['/frozenInputs', 1],
  ['/negativeProbes', 1],
  ['/negativeProbes/0', 1],
  ['/negativeProbes/1', 1],
  ['/negativeProbes/2', 1],
  ['/negativeProbes/3', 1],
  ['/negativeProbes/4', 1],
  ['/negativeProbes/5', 1],
  ['/negativeProbes/6', 1],
  ['/negativeProbes/7', 1],
  ['/negativeProbes/8', 1],
  ['/runtime/inputVerification', 1],
  ['/runtime/closure', 1],
  ['/runtime/address', 1],
  ['/runtime/closure/allRegularFilesLockedReadOnly', 1],
  ['/runtime/workerObservation/prefix', 1],
  ['/runtime/workerObservation/moduleInventory', 1],
  ['/runtime/workerObservation/dyldInventory', 1],
  ['/runtime/hostBoundary', 1],
  ['/runtime/workerObservation/versions', 1],
  ['/runtime/workerObservation/warningPolicy', 1],
  ['/scientificSemantics/executedTracks/0/mesh', 1],
  ['/scientificSemantics/executedTracks/1/mesh', 1],
  ['/scientificSemantics/preflightMatrix', 1],
  ['/scientificSemantics/executedTracks/*/steps', 2],
  ['/scientificSemantics/executedTracks/*/boundaryDefinition', 2],
  ['/scientificSemantics/cleanRoomOracle/comparisons/*/steps/*/boundaryDigestMatched', 4],
  ['/scientificSemantics/executedTracks/*/initialDigest', 2],
  ['/scientificSemantics/executedTracks/*/endpointDigest', 2],
  ['/scientificSemantics/diagnostics/constantTwoDiscreteL2', 1],
  ['/scientificSemantics/literalSelfPreflight', 1],
  ['/scientificSemantics/boundaryCompatibility', 1],
  ['/scientificSemantics/diagnostics/analyticBoundaryTailMismatchAtExecutedFaces', 1],
  ['/capabilityCeiling', 1],
  ['/promotionAuthorized', 1],
  ['/candidateSources/privateSnapshot', 1],
  ['/frozenInputs/preregistration', 1],
  ['/scientificSemantics/quantityRegistry', 1],
  ['/sourceMetadata', 1],
  ['/scientificSemantics/trackRegistry', 1],
  ['/scientificSemantics/linearSolver', 1],
  ['/scientificSemantics/cleanRoomOracle/comparisons', 1],
  ['/candidateSources/oracle', 1],
  ['/scientificSemantics/cleanRoomOracle/runtimeImportSentinelPassed', 1],
]);

const forbiddenEffectiveReceiptValues = [
  'pfhubOfficial',
  'dimensionless-rate',
  '2015-09-09',
  '0.000012204318378837',
  '/private/tmp/',
  '/Users/',
];

const parse = (path, label) => parseR16cJsonBytes(readFileSync(path), {
  label,
  maximumDepth: 64,
  requireCanonical: false,
});

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

const sourceIdentity = (path, logicalPath) => {
  const payload = readFileSync(path);
  return {
    path: logicalPath,
    byteSize: payload.byteLength,
    rawDigest: `sha256:${createHash('sha256').update(payload).digest('hex')}`,
  };
};

const rawIdentity = (payload) => ({
  byteSize: payload.byteLength,
  rawDigest: `sha256:${createHash('sha256').update(payload).digest('hex')}`,
});

const mutatedSourceDigest = (path, replacements) => {
  let source = readFileSync(path, 'utf8');
  for (const [before, after] of replacements) {
    assert.equal(source.split(before).length - 1, 1, `semantic mutant target is not unique: ${before}`);
    source = source.replace(before, after);
  }
  return rawIdentity(Buffer.from(source, 'utf8')).rawDigest;
};

const resolveJsonPointer = (root, pointer) => {
  assert.match(pointer, /^\//u, 'evidence JSON pointer must start with /');
  assert.doesNotMatch(pointer, /~(?:[^01]|$)/u, 'evidence JSON pointer contains an invalid escape');
  const tokens = pointer.slice(1).split('/').map((token) => token
    .replaceAll('~1', '/')
    .replaceAll('~0', '~'));
  let frontier = [root];
  for (const token of tokens) {
    const next = [];
    for (const value of frontier) {
      if (token === '*') {
        assert.ok(Array.isArray(value), `wildcard target is not an array: ${pointer}`);
        next.push(...value);
      } else if (Array.isArray(value)) {
        assert.match(token, /^(?:0|[1-9][0-9]*)$/u, `array token is not canonical: ${pointer}`);
        const index = Number(token);
        assert.ok(index < value.length, `array target is missing: ${pointer}`);
        next.push(value[index]);
      } else {
        assert.ok(value !== null && typeof value === 'object', `object target is not traversable: ${pointer}`);
        assert.ok(Object.hasOwn(value, token), `object target is missing: ${pointer}`);
        next.push(value[token]);
      }
    }
    frontier = next;
  }
  return frontier;
};

const forbiddenReceiptFailures = (receipt) => {
  const effectiveReceipt = structuredClone(receipt);
  delete effectiveReceipt.acceptanceMatrix;
  const serialized = JSON.stringify(effectiveReceipt);
  return forbiddenEffectiveReceiptValues
    .filter((forbidden) => serialized.includes(forbidden))
    .map((forbidden) => `forbidden or non-normalized receipt value: ${forbidden}`);
};

function resolveAcceptanceEvidence(receipt) {
  const failures = [];
  const expectedSupervisor = sourceIdentity(supervisorPath, '$SUPERVISOR');
  const expectedOracle = sourceIdentity(oraclePath, '$ORACLE');
  const supervisorSource = readFileSync(supervisorPath, 'utf8');
  const oracleSource = readFileSync(oraclePath, 'utf8');
  const checkPseudoLocator = (locator) => {
    if (locator === '$SUPERVISOR:main') {
      return isDeepStrictEqual(receipt.candidateSources?.supervisor, expectedSupervisor)
        && (supervisorSource.match(/^def main\(/gmu) ?? []).length === 1;
    }
    if (locator === '$SUPERVISOR:verify_worker_source') {
      return isDeepStrictEqual(receipt.candidateSources?.supervisor, expectedSupervisor)
        && (supervisorSource.match(/^def verify_worker_source\(/gmu) ?? []).length === 1;
    }
    if (locator === '$ORACLE:runtimeImportSentinel') {
      return isDeepStrictEqual(receipt.candidateSources?.oracle, {
        ...expectedOracle,
        staticRestrictionPassed: true,
      })
        && receipt.scientificSemantics?.cleanRoomOracle?.runtimeImportSentinelPassed === true
        && (oracleSource.match(/forbidden = tuple\(/gu) ?? []).length === 2;
    }
    if (locator === '$SCHEMA_GATE:forbidden-effective-receipt-values') {
      return forbiddenReceiptFailures(receipt).length === 0;
    }
    return false;
  };

  for (const acceptance of receipt.acceptanceMatrix ?? []) {
    for (const locator of acceptance.evidenceLocators ?? []) {
      if (locator.startsWith('/')) {
        const expectedCount = pointerCardinalities.get(locator);
        if (expectedCount === undefined) {
          failures.push(`${acceptance.acceptanceId}: unregistered evidence pointer ${locator}`);
          continue;
        }
        try {
          const resolvedValues = resolveJsonPointer(receipt, locator);
          if (resolvedValues.length !== expectedCount) {
            failures.push(`${acceptance.acceptanceId}: ${locator} resolved ${resolvedValues.length}, expected ${expectedCount}`);
          }
        } catch (error) {
          failures.push(`${acceptance.acceptanceId}: ${error.message}`);
        }
      } else if (!checkPseudoLocator(locator)) {
        failures.push(`${acceptance.acceptanceId}: pseudo-locator did not resolve: ${locator}`);
      }
    }
  }
  return failures;
}

export function validateR18aReceipt(receipt, specification, runtimeLock) {
  const failures = [];
  const check = (condition, message) => {
    if (!condition) failures.push(message);
  };

  check(
    isDeepStrictEqual(receipt.scientificSemantics.trackRegistry, specification.boundarySemantics.tracks),
    'track registry must exactly equal the frozen three-track registry',
  );
  const expectedAcceptance = [];
  for (const [group, requirements] of Object.entries(specification.acceptanceTests)) {
    requirements.forEach((requirement, index) => {
      expectedAcceptance.push({
        acceptanceId: `r18a.${group}.${String(index + 1).padStart(2, '0')}`,
        group,
        ordinal: index + 1,
        requirement,
        evidenceLocators: acceptanceEvidenceLocators[group][index],
        passed: true,
      });
    });
  }
  check(
    isDeepStrictEqual(receipt.acceptanceMatrix, expectedAcceptance),
    'acceptance matrix IDs, groups, order, text, evidence locators, or pass states differ from effective v4',
  );
  const expectedProbeDescriptors = [
    ['reaction-time-level', 'in-memory-worker-source-ast-mutant', 'reaction eta.old at n -> eta at n+1 expression', 'WORKER_REACTION_TIME_LEVEL'],
    ['source-time-level', 'executed-full-clean-room-source-mutant', 'manufactured source time_old -> time_new', 'ORACLE_ASSEMBLY'],
    ['exact-trace-time-level', 'executed-full-clean-room-source-mutant', 'boundary values time_new -> time_old', 'ORACLE_ASSEMBLY'],
    ['periodic-wrap', 'executed-full-clean-room-source-mutant', 'left periodic modulo NX -> modulo NX-1', 'ORACLE_ASSEMBLY'],
    ['dirichlet-factor-of-two', 'executed-full-clean-room-source-mutant', 'bottom and top Dirichlet 2*ry contributions -> ry', 'ORACLE_ASSEMBLY'],
    ['track-provenance-boolean', 'worker-result-semantic-mutant', 'exact-trace metricSpecifiedByPfhub false -> true', 'WORKER_TRACK_PROVENANCE'],
    ['duplicate-json-literal', 'strict-json-byte-mutant', 'duplicate literal key', 'JSON_DUPLICATE_KEY'],
    ['duplicate-json-escaped', 'strict-json-byte-mutant', 'escape-equivalent duplicate key', 'JSON_DUPLICATE_KEY'],
    ['non-allowlisted-warning', 'executed-worker-warning-mutant', 'emit one non-allowlisted RuntimeWarning', 'WARNING_NOT_ALLOWLISTED'],
  ];
  check(
    isDeepStrictEqual(receipt.negativeProbes.map((probe) => [
      probe.probeId,
      probe.probeMode,
      probe.mutation,
      probe.reasonCode,
    ]), expectedProbeDescriptors)
      && receipt.negativeProbes.every((probe) => probe.status === 'expected-abstention'),
    'negative probe IDs, modes, mutations, reasons, order, or statuses changed',
  );
  const expectedMutantDigests = [
    mutatedSourceDigest(workerPath, [[
      'reaction = -4.0 * eta.old * (eta.old - 1.0) * (eta.old - 0.5)',
      'reaction = -4.0 * eta * (eta - 1.0) * (eta - 0.5)',
    ]]),
    mutatedSourceDigest(oraclePath, [[
      'source = manufactured_source(x_cell, y_cell, time_old)',
      'source = manufactured_source(x_cell, y_cell, time_new)',
    ]]),
    mutatedSourceDigest(oraclePath, [[
      'bottom, top = boundary_values(track, time_new)',
      'bottom, top = boundary_values(track, time_old)',
    ]]),
    mutatedSourceDigest(oraclePath, [[
      'matrix[row, j * NX + ((i - 1) % NX)] = -rx',
      'matrix[row, j * NX + ((i - 1) % (NX - 1))] = -rx',
    ]]),
    mutatedSourceDigest(oraclePath, [
      ['rhs[row] += 2.0 * ry * bottom[i]', 'rhs[row] += ry * bottom[i]'],
      ['rhs[row] += 2.0 * ry * top[i]', 'rhs[row] += ry * top[i]'],
    ]),
  ];
  check(
    isDeepStrictEqual(receipt.negativeProbes.slice(0, 5).map(({ mutatedSourceDigest: digest }) => digest), expectedMutantDigests),
    'semantic mutant source digests do not derive from current candidate source transforms',
  );
  check(
    !Object.hasOwn(receipt.negativeProbes[0], 'observation')
      && receipt.negativeProbes.slice(1, 5).every((probe) => probe.observation !== undefined)
      && receipt.negativeProbes.slice(5).every((probe) => (
        !Object.hasOwn(probe, 'mutatedSourceDigest') && !Object.hasOwn(probe, 'observation')
      ))
      && receipt.negativeProbes[1].observation.maximumRhsAbsoluteDifference > 2e-13
      && receipt.negativeProbes[2].observation.boundaryDigestMismatchCount > 0
      && receipt.negativeProbes[3].observation.maximumMatrixAbsoluteDifference > 2e-13
      && receipt.negativeProbes[4].observation.maximumRhsAbsoluteDifference > 2e-13,
    'semantic mutant rejection modes or full-system signals are not evidenced',
  );
  check(
    receipt.scientificSemantics.equation === specification.officialProblem.equation
      && receipt.scientificSemantics.timeIntegrator === specification.implementation.timeIntegrator,
    'equation or time-integrator semantics differ from effective v4',
  );
  check(
    isDeepStrictEqual(receipt.scientificSemantics.quantityRegistry, specification.quantityRegistry),
    'quantity registry must exactly equal the frozen dimensionless registry',
  );
  check(
    isDeepStrictEqual(receipt.scientificSemantics.boundaryCompatibility, {
      initialBoundaryCompatibility: specification.boundarySemantics.initialBoundaryCompatibility,
      alphaConservativeIntervalForT0To8:
        specification.boundarySemantics.alphaConservativeIntervalForT0To8,
      conservativeBoundaryTraceMismatchUpperBound:
        specification.boundarySemantics.conservativeBoundaryTraceMismatchUpperBound,
      upperBoundInterpretation: specification.boundarySemantics.upperBoundInterpretation,
    }),
    'boundary compatibility and outward-rounded analytic bound must exactly equal the frozen values',
  );
  check(
    isDeepStrictEqual(receipt.capabilityCeiling, specification.capabilityCeiling),
    'capability ceiling must exactly equal the frozen all-false ceiling',
  );
  check(isDeepStrictEqual(receipt.runtime.inputVerification, {
    verifiedBeforeExecution: true,
    pythonSource: {
      logicalRoot: '$PYTHON_SOURCE_ROOT',
      executable: runtimeLock.bootstrapSource.pythonExecutable,
      canonicalClosure: runtimeLock.bootstrapSource.canonicalClosure,
    },
    wheelhouse: {
      logicalRoot: '$WHEELHOUSE',
      wheels: runtimeLock.wheelhouse.distributions.map((item) => ({
        name: item.name,
        version: item.version,
        filename: item.filename,
        byteSize: item.byteSize,
        rawDigest: item.rawDigest,
      })),
      expandedClosure: runtimeLock.wheelhouse.expandedClosure,
    },
  }), 'runtime input verification must exactly project the frozen logical roots and hashes');
  check(
    isDeepStrictEqual(receipt.crossScaleBridge, specification.crossScaleBridge),
    'cross-scale abstention must exactly equal the frozen declaration',
  );
  check(
    isDeepStrictEqual(receipt.causalPolicy, specification.causalPolicy),
    'causal abstention must exactly equal the frozen declaration',
  );
  check(
    isDeepStrictEqual(receipt.sourceMetadata, specification.sotaEvidence.map((item) => ({
      classification: item.classification,
      name: item.name,
      date: item.date,
      revision: item.revision,
      url: item.url,
      rawDigest: item.rawDigest,
    }))),
    'source metadata must exactly project the frozen references',
  );
  check(
    isDeepStrictEqual(receipt.globalRepositoryBlockers, specification.globalRepositoryBlockers),
    'global repository blockers differ from effective v4',
  );

  const trackIds = receipt.scientificSemantics.trackRegistry.map(({ trackId }) => trackId);
  check(
    JSON.stringify(trackIds) === JSON.stringify([
      'official-literal',
      'literal-self',
      'exact-trace-companion',
    ]),
    'track order or identity changed',
  );
  const executed = receipt.scientificSemantics.executedTracks;
  check(
    isDeepStrictEqual(executed.map(({ trackId }) => trackId), [
      'official-literal',
      'exact-trace-companion',
    ]),
    'executed track order or identity changed',
  );
  check(isDeepStrictEqual(receipt.scientificSemantics.preflightMatrix, {
    Nx: 8, Ny: 4, dx: 0.125, dy: 0.125, dt: 0.01, stepCount: 2, finalTime: 0.02,
  }), 'preflight matrix changed');
  check(executed[0]?.problemUsesOfficialLiteralBoundary === true, 'official-literal boundary provenance changed');
  check(executed[0]?.metricSpecifiedByPfhub === true, 'official-literal metric provenance changed');
  check(executed[0]?.strictMms === false, 'official-literal must not be strict MMS');
  check(isDeepStrictEqual(executed[0]?.boundaryDefinition, {
    type: 'literal Dirichlet face values', bottom: 1, top: 0, evaluationTime: 'all registered times',
  }), 'official-literal boundary definition changed');
  check(executed[1]?.problemUsesOfficialLiteralBoundary === false, 'exact-trace boundary provenance changed');
  check(executed[1]?.metricSpecifiedByPfhub === false, 'exact-trace metric provenance changed');
  check(executed[1]?.strictMms === true, 'exact-trace strict MMS flag changed');
  check(executed[1]?.requiredLabel === 'non-PFHub exact-trace companion', 'non-PFHub label changed');
  check(isDeepStrictEqual(executed[1]?.boundaryDefinition, {
    type: 'manufactured-field face traces',
    evaluationTime: 't_(n+1)',
    requiredLabel: 'non-PFHub exact-trace companion',
  }), 'exact-trace boundary definition changed');
  check(executed[0]?.initialDigest === executed[1]?.initialDigest, 'executed tracks do not share the frozen initial field');
  check(executed[0]?.endpointDigest !== executed[1]?.endpointDigest, 'executed track endpoints are not distinct');
  check(
    executed[0]?.steps?.every((step, index) => step.stepIndex === index + 1
      && step.timeOld === index * 0.01
      && step.timeNew === (index + 1) * 0.01
      && step.solveCount === 1),
    'official-literal exact step schedule or solve count changed',
  );
  check(
    executed[1]?.steps?.every((step, index) => step.stepIndex === index + 1
      && step.timeOld === index * 0.01
      && step.timeNew === (index + 1) * 0.01
      && step.solveCount === 1),
    'exact-trace exact step schedule or solve count changed',
  );
  const comparisons = receipt.scientificSemantics.cleanRoomOracle.comparisons;
  check(
    isDeepStrictEqual(comparisons.map(({ trackId }) => trackId), [
      'official-literal',
      'exact-trace-companion',
    ]) && comparisons.every((comparison) => (
      isDeepStrictEqual(comparison.steps.map(({ stepIndex }) => stepIndex), [1, 2])
    )),
    'clean-room comparison track or step identity changed',
  );
  for (let trackIndex = 0; trackIndex < executed.length; trackIndex += 1) {
    const workerTrack = executed[trackIndex];
    const comparison = comparisons[trackIndex];
    check(
      comparison.workerInitialDigest === workerTrack.initialDigest
        && comparison.oracleInitialDigest === workerTrack.initialDigest,
      `${workerTrack.trackId} worker/oracle initial digest is not cross-bound`,
    );
    let expectedWorkerOld = workerTrack.initialDigest;
    let expectedOracleOld = comparison.oracleInitialDigest;
    for (let stepIndex = 0; stepIndex < workerTrack.steps.length; stepIndex += 1) {
      const workerStep = workerTrack.steps[stepIndex];
      const comparisonStep = comparison.steps[stepIndex];
      check(
        workerStep.oldStateDigest === expectedWorkerOld
          && comparisonStep.workerOldStateDigest === workerStep.oldStateDigest
          && comparisonStep.workerMatrixDigest === workerStep.matrixDigest
          && comparisonStep.workerRhsDigest === workerStep.rhsDigest
          && comparisonStep.workerEndpointDigest === workerStep.endpointDigest
          && comparisonStep.workerBoundaryDigest === workerStep.boundaryDigest,
        `${workerTrack.trackId} worker step ${stepIndex + 1} digest chain is not cross-bound`,
      );
      check(
        comparisonStep.oracleOldStateDigest === expectedOracleOld
          && comparisonStep.workerBoundaryDigest === comparisonStep.oracleBoundaryDigest
          && comparisonStep.boundaryDigestMatched === true,
        `${workerTrack.trackId} oracle step ${stepIndex + 1} digest chain or boundary comparison is not cross-bound`,
      );
      expectedWorkerOld = workerStep.endpointDigest;
      expectedOracleOld = comparisonStep.oracleEndpointDigest;
    }
    check(
      comparison.workerEndpointDigest === workerTrack.endpointDigest
        && comparison.workerEndpointDigest === expectedWorkerOld
        && comparison.oracleEndpointDigest === expectedOracleOld,
      `${workerTrack.trackId} terminal digest chain is not cross-bound`,
    );
  }

  const expectedSupervisor = sourceIdentity(supervisorPath, '$SUPERVISOR');
  const expectedWorker = sourceIdentity(workerPath, '$WORKER');
  const expectedOracle = sourceIdentity(oraclePath, '$ORACLE');
  check(
    isDeepStrictEqual(receipt.candidateSources.supervisor, expectedSupervisor),
    'receipt supervisor identity differs from current candidate bytes',
  );
  check(
    isDeepStrictEqual(receipt.candidateSources.worker, expectedWorker),
    'receipt worker identity differs from current candidate bytes',
  );
  check(
    isDeepStrictEqual(receipt.candidateSources.oracle, {
      ...expectedOracle,
      staticRestrictionPassed: true,
    }),
    'receipt oracle identity differs from current candidate bytes',
  );
  const snapshotRecords = [
    { byteSize: expectedOracle.byteSize, path: 'oracle.py', rawDigest: expectedOracle.rawDigest },
    { byteSize: expectedWorker.byteSize, path: 'worker.py', rawDigest: expectedWorker.rawDigest },
  ];
  check(
    receipt.candidateSources.privateSnapshot.addressDigest === digestRecords(snapshotRecords),
    'private candidate snapshot address differs from current worker and oracle bytes',
  );

  for (const inventoryName of ['moduleInventory', 'dyldInventory']) {
    const inventory = receipt.runtime.workerObservation[inventoryName];
    check(inventory.recordCount === inventory.records.length, `${inventoryName} record count mismatch`);
    check(inventory.recordsDigest === digestRecords(inventory.records), `${inventoryName} digest mismatch`);
    check(
      inventory.recordCount === expectedInventoryIdentities[inventoryName].recordCount
        && inventory.recordsDigest === expectedInventoryIdentities[inventoryName].recordsDigest,
      `${inventoryName} identity differs from the frozen successor observation`,
    );
  }
  check(
    isDeepStrictEqual(receipt.candidateSources.worker, receipt.runtime.workerObservation.worker),
    'executed worker path, size, or digest differs from candidate snapshot identity',
  );
  const moduleRecords = receipt.runtime.workerObservation.moduleInventory.records;
  const moduleNames = moduleRecords.map(({ module }) => module);
  const bytewiseSortedUniqueModuleNames = [...new Set(moduleNames)]
    .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right)));
  check(
    isDeepStrictEqual(moduleNames, bytewiseSortedUniqueModuleNames),
    'module inventory names are not unique and UTF-8-bytewise ordered',
  );
  check(
    isDeepStrictEqual(moduleRecords
      .filter(({ classification }) => classification === 'registered-synthetic-no-origin')
      .map(({ module }) => module), registeredSyntheticModules),
    'registered origin-less module set differs from the exact successor allowlist',
  );
  check(
    isDeepStrictEqual(moduleRecords.filter(({ classification }) => classification === 'worker'), [{
      module: '__main__',
      classification: 'worker',
      origin: '$WORKER',
      byteSize: receipt.candidateSources.worker.byteSize,
      rawDigest: receipt.candidateSources.worker.rawDigest,
    }]),
    'module inventory does not contain exactly one candidate-bound __main__ worker triple',
  );
  check(
    moduleRecords
      .filter(({ classification }) => classification === 'namespace')
      .every(({ locations }) => locations.length > 0
        && isDeepStrictEqual(locations, [...new Set(locations)]
          .sort((left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right))))),
    'namespace locations are empty, duplicated, or not UTF-8-bytewise ordered',
  );
  check(
    receipt.runtime.workerObservation.dyldInventory.records
      .every(({ index }, position) => index === position),
    'dyld inventory indices are not unique, contiguous, and ordered',
  );
  check(
    receipt.runtime.workerObservation.warningPolicy.records.every((record) => (
      record.category === 'DeprecationWarning'
      && record.origin === '$RUNTIME/lib/python3.12/site-packages/fipy/tools/numerix.py'
      && record.line === 61
      && record.message === runtimeLock.warningPolicy.allowlist[0].message
    )),
    'warning record differs from the exact frozen allowlist',
  );

  failures.push(...forbiddenReceiptFailures(receipt));
  failures.push(...resolveAcceptanceEvidence(receipt));
  check(receipt.sourceMetadata[1]?.date === '2018-03-07', 'historical CHiMaD commit date changed');
  check(receipt.promotionAuthorized === false, 'preflight cannot authorize promotion');
  check(receipt.abstention === null, 'pass receipt must not contain an abstention payload');
  return failures;
}

export function runGate(receiptPath = defaultReceipt) {
  const schema = parse(schemaPath, 'R18a receipt schema');
  const specification = parse(specificationPath, 'R18a effective v4 preregistration');
  const runtimeLock = parse(runtimeLockPath, 'R18a runtime lock');
  const receiptPayload = readFileSync(receiptPath);
  const receipt = parseR16cJsonBytes(receiptPayload, {
    label: 'R18a candidate receipt',
    maximumDepth: 64,
    requireCanonical: false,
  });
  const ajv = new Ajv2020({ allErrors: true, strict: true, validateFormats: false });
  const validate = ajv.compile(schema);
  const valid = validate(receipt);
  const schemaErrors = valid ? [] : validate.errors.map((error) => (
    `${error.instancePath || '/'} ${error.message}`
  ));
  const semanticErrors = [];
  if (!isDeepStrictEqual(rawIdentity(receiptPayload), formalReceiptIdentity)) {
    semanticErrors.push('receipt bytes differ from the frozen formal successor identity');
  }
  if (valid) semanticErrors.push(...validateR18aReceipt(receipt, specification, runtimeLock));
  return { status: schemaErrors.length === 0 && semanticErrors.length === 0 ? 'pass' : 'fail', schemaErrors, semanticErrors };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  assert.ok(process.argv.length <= 3, 'usage: pfhub7a_r18a_schema_gate.mjs [receipt.json]');
  const result = runGate(process.argv[2] ? resolve(process.argv[2]) : defaultReceipt);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (result.status !== 'pass') process.exitCode = 1;
}
