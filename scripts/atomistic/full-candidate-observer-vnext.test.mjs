import { execFileSync } from 'node:child_process';
import {
  chmod,
  link,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rename,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  OBSERVER_CONTRACT_PATH,
  OBSERVER_CONTRACT_RAW_DIGEST,
  OBSERVER_CONTRACT_SCHEMA_PATH,
  OBSERVER_RECEIPT_SCHEMA_PATH,
  OBSERVER_RANDOM_TP_ID_MANIFEST_PATH,
  OBSERVER_WORKFLOW_RAW_DIGEST,
  OBSERVER_WORKFLOW_SIZE_BYTES,
  OBSERVER_WORKFLOW_SOURCE_PATH,
  STRESS_SYMMETRY_ABSOLUTE_TOLERANCE,
  assessCalculatorNativeStressForSymmetry,
  buildFixtureReceipt,
  buildSyntheticCampaignFixture,
  canonicalScientificPayload,
  forceRichardson,
  inspectObserverContractBytes,
  inspectRandomTpIdManifestBytes,
  inspectObserverWorkflowSource,
  nextBinary64,
  passesAbsoluteRelative,
  passesStressSymmetry,
  sha256,
  stressRichardson,
  stressSymmetryResidual,
  validateDeterminismFixture,
  validateFixtureReceipt,
  validateObserverContractRepository,
  validateObserverContractSchema,
  validateObserverContractSemantics,
  validateObserverSourceSetRepository,
  validateObserverWorkflowSourceRepository,
  validateSyntheticCampaignFixture,
  validateSyntheticHostObservations,
} from './full-candidate-observer-vnext.mjs';
import { parseJsonRejectingDuplicateMembers } from './runtime-lock-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const contractBytes = await readFile(path.join(root, OBSERVER_CONTRACT_PATH));
const contractSchemaBytes = await readFile(path.join(root, OBSERVER_CONTRACT_SCHEMA_PATH));
const receiptSchemaBytes = await readFile(path.join(root, OBSERVER_RECEIPT_SCHEMA_PATH));
const workflowBytes = await readFile(path.join(root, OBSERVER_WORKFLOW_SOURCE_PATH));
const idManifestBytes = await readFile(path.join(root, OBSERVER_RANDOM_TP_ID_MANIFEST_PATH));
const contract = parseJsonRejectingDuplicateMembers(contractBytes);
const contractSchema = parseJsonRejectingDuplicateMembers(contractSchemaBytes);
const receiptSchema = parseJsonRejectingDuplicateMembers(receiptSchemaBytes);
const workflowSource = workflowBytes.toString('utf8');
const clone = (value) => structuredClone(value);
const FIXTURE_COMMAND_IN_SOURCE =
  'node scripts/atomistic/full-candidate-observer-vnext.mjs --emit-fixture';
const CHECKOUT_ACTION_IN_SOURCE =
  'actions/checkout@d23441a48e516b6c34aea4fa41551a30e30af803';
const reviewedSourceBytes = new Map([
  [OBSERVER_CONTRACT_PATH, contractBytes],
  [OBSERVER_WORKFLOW_SOURCE_PATH, workflowBytes],
  [OBSERVER_CONTRACT_SCHEMA_PATH, contractSchemaBytes],
  [OBSERVER_RECEIPT_SCHEMA_PATH, receiptSchemaBytes],
]);

async function createReviewedSourceRepository(prefix = 'tf-observer-sources-') {
  const temporary = await mkdtemp(path.join(os.tmpdir(), prefix));
  const canonicalTemporary = await realpath(temporary);
  for (const [relativePath, bytes] of reviewedSourceBytes) {
    const absolutePath = path.join(canonicalTemporary, ...relativePath.split('/'));
    await mkdir(path.dirname(absolutePath), { recursive: true });
    await writeFile(absolutePath, bytes, { mode: 0o644 });
  }
  execFileSync('/usr/bin/git', ['init', '-q'], { cwd: canonicalTemporary });
  execFileSync('/usr/bin/git', ['add', '--', ...reviewedSourceBytes.keys()], {
    cwd: canonicalTemporary,
  });
  return canonicalTemporary;
}

describe('full-candidate vNext fixture-only observer contract', () => {
  it('binds the exact contract, schemas, unregistered workflow source and unchanged v0.2 receipt', async () => {
    const inspected = inspectObserverContractBytes(contractBytes);
    expect(inspected.failures).toEqual([]);
    expect(inspected.rawDigest).toBe(OBSERVER_CONTRACT_RAW_DIGEST);
    expect(validateObserverContractSchema(contract, contractSchema)).toEqual([]);
    expect(validateObserverContractSemantics(contract)).toEqual([]);
    expect(inspectObserverWorkflowSource(workflowBytes)).toEqual([]);
    expect(workflowBytes).toHaveLength(OBSERVER_WORKFLOW_SIZE_BYTES);
    expect(sha256(workflowBytes)).toBe(OBSERVER_WORKFLOW_RAW_DIGEST);
    expect(OBSERVER_WORKFLOW_SOURCE_PATH.startsWith('.github/workflows/')).toBe(false);
    expect(inspectRandomTpIdManifestBytes(idManifestBytes).failures).toEqual([]);
    const mutatedIdManifest = Buffer.from(idManifestBytes.toString('utf8').replace(
      'random-TP-000000',
      'random-TP-999999',
    ));
    expect(inspectRandomTpIdManifestBytes(mutatedIdManifest).failures.join('\n'))
      .toMatch(/observer\.idManifest\.(?:rawDigest|ids\[1\])/);

    const result = await validateObserverContractRepository(contractBytes, {
      root,
      contractSchemaBytes,
      receiptSchemaBytes,
      workflowBytes,
      requireWorkflowGitIndex: false,
    });
    expect(result.failures).toEqual([]);
  });

  it('rejects duplicate decoded JSON members before schema or policy validation', () => {
    const duplicated = Buffer.from(contractBytes.toString('utf8').replace(
      '"schemaVersion": "tf.atomistic-full-candidate-observer-contract/0.1",',
      '"\\u0073chemaVersion": "forged",\n  "schemaVersion": "tf.atomistic-full-candidate-observer-contract/0.1",',
    ));
    expect(inspectObserverContractBytes(duplicated, { enforceFrozenDigest: false })
      .failures.join('\n')).toMatch(/strict JSON failed.*duplicate/i);
  });

  it.each([
    ['shared-host topology', (candidate) => { candidate.topology.sharedHost = false; }, /observer\.contract\.topology\.sharedHost/],
    ['four executions', (candidate) => { candidate.topology.requiredFreshContainerExecutions.value = 3; }, /observer\.contract\.topology\.requiredFreshContainerExecutions\.value/],
    ['execution order', (candidate) => { candidate.topology.executionOrder[2].sequence = 3; }, /observer\.contract\.topology\.executionOrder\[2\]\.sequence/],
    ['fresh container', (candidate) => { candidate.topology.executionOrder[0].freshContainerRequired = false; }, /observer\.contract\.topology\.executionOrder\[0\]\.freshContainerRequired/],
    ['authoritative 693', (candidate) => { candidate.topology.executionOrder[0].benchmarkPredictionRecords.value = 692; }, /observer\.contract\.topology\.executionOrder\[0\]\.benchmarkPredictionRecords\.value/],
    ['repeat 693', (candidate) => { candidate.topology.recordsPerModel.repeatValidation.value = 694; }, /observer\.contract\.topology\.recordsPerModel\.repeatValidation\.value/],
    ['metric denominator', (candidate) => { candidate.topology.recordsPerModel.metricDenominator.value = 1386; }, /observer\.contract\.topology\.recordsPerModel\.metricDenominator\.value/],
    ['determinism denominator', (candidate) => { candidate.topology.recordsPerModel.determinismDenominator.value = 1386; }, /observer\.contract\.topology\.recordsPerModel\.determinismDenominator\.value/],
    ['4044 requests', (candidate) => { candidate.topology.totals.adapterRequests.value = 4043; }, /observer\.contract\.topology\.totals\.adapterRequests\.value/],
    ['count unit', (candidate) => { candidate.topology.totals.adapterRequests.unit = 'record'; }, /observer\.contract\.topology\.totals\.adapterRequests\.unit/],
    ['count dimension', (candidate) => { candidate.topology.totals.adapterRequests.dimension = 'mystery'; }, /observer\.contract\.topology\.totals\.adapterRequests\.dimension/],
    ['count basis', (candidate) => { candidate.topology.totals.adapterRequests.basis = ''; }, /observer\.contract\.topology\.totals\.adapterRequests\.basis/],
    ['probe metric exclusion', (candidate) => { candidate.topology.probeRecordsExcludedFromMetricDenominator = false; }, /observer\.contract\.topology\.probeRecordsExcludedFromMetricDenominator/],
    ['probe determinism exclusion', (candidate) => { candidate.topology.probeRecordsExcludedFromDeterminismDenominator = false; }, /observer\.contract\.topology\.probeRecordsExcludedFromDeterminismDenominator/],
    ['ordinal zero authority', (candidate) => { candidate.topology.authoritativeExecutionOrdinal = 1; }, /observer\.contract\.topology\.authoritativeExecutionOrdinal/],
    ['repeat replacement', (candidate) => { candidate.topology.repeatMayReplaceAuthority = true; }, /observer\.contract\.topology\.repeatMayReplaceAuthority/],
    ['invariance count', (candidate) => { candidate.validation.invariancePerModel.requiredCases.value = 39; }, /observer\.contract\.validation\.invariancePerModel\.requiredCases\.value/],
    ['translation unit', (candidate) => { candidate.validation.invariancePerModel.translationFractionalShift.unit = 'angstrom'; }, /observer\.contract\.validation\.invariancePerModel\.translationFractionalShift\.unit/],
    ['translation dimension', (candidate) => { candidate.validation.invariancePerModel.translationFractionalShift.dimension = 'length'; }, /observer\.contract\.validation\.invariancePerModel\.translationFractionalShift\.dimension/],
    ['translation basis', (candidate) => { candidate.validation.invariancePerModel.translationFractionalShift.basis = ''; }, /observer\.contract\.validation\.invariancePerModel\.translationFractionalShift\.basis/],
    ['rotation unit', (candidate) => { candidate.validation.invariancePerModel.properRotation.unit = 'degree'; }, /observer\.contract\.validation\.invariancePerModel\.properRotation\.unit/],
    ['rotation dimension', (candidate) => { candidate.validation.invariancePerModel.properRotation.dimension = 'angle'; }, /observer\.contract\.validation\.invariancePerModel\.properRotation\.dimension/],
    ['rotation basis', (candidate) => { candidate.validation.invariancePerModel.properRotation.basis = ''; }, /observer\.contract\.validation\.invariancePerModel\.properRotation\.basis/],
    ['force case count', (candidate) => { candidate.validation.forceFiniteDifferencePerModel.requiredCases.value = 88; }, /observer\.contract\.validation\.forceFiniteDifferencePerModel\.requiredCases\.value/],
    ['force probes', (candidate) => { candidate.validation.forceFiniteDifferencePerModel.requiredEnergyProbes.value = 355; }, /observer\.contract\.validation\.forceFiniteDifferencePerModel\.requiredEnergyProbes\.value/],
    ['force sign', (candidate) => { candidate.validation.forceFiniteDifferencePerModel.centralDifference = 'F_h=(E(q+h)-E(q-h))/(2h)'; }, /observer\.contract\.validation\.forceFiniteDifferencePerModel\.centralDifference/],
    ['stress cases', (candidate) => { candidate.validation.stressFiniteDifferencePerModel.requiredCases.value = 59; }, /observer\.contract\.validation\.stressFiniteDifferencePerModel\.requiredCases\.value/],
    ['stress probes', (candidate) => { candidate.validation.stressFiniteDifferencePerModel.requiredEnergyProbes.value = 239; }, /observer\.contract\.validation\.stressFiniteDifferencePerModel\.requiredEnergyProbes\.value/],
    ['stress fixed Cartesian', (candidate) => { candidate.validation.stressFiniteDifferencePerModel.coordinateConvention = 'fixed-cartesian-coordinates'; }, /observer\.contract\.validation\.stressFiniteDifferencePerModel\.coordinateConvention/],
    ['stress shear basis', (candidate) => { candidate.validation.stressFiniteDifferencePerModel.strainBasis = 'full-off-diagonal'; }, /observer\.contract\.validation\.stressFiniteDifferencePerModel\.strainBasis/],
    ['post-hoc stress sign', (candidate) => { candidate.validation.stressFiniteDifferencePerModel.postHocSignSelectionAllowed = true; }, /observer\.contract\.validation\.stressFiniteDifferencePerModel\.postHocSignSelectionAllowed/],
    ['stress absolute tolerance', (candidate) => { candidate.validation.stressSymmetry.absoluteTolerance.value = 1e-9; }, /observer\.contract\.validation\.stressSymmetry\.absoluteTolerance\.value/],
    ['stress relative tolerance', (candidate) => { candidate.validation.stressSymmetry.relativeTolerance.value = 1e-8; }, /observer\.contract\.validation\.stressSymmetry\.relativeTolerance\.value/],
    ['pre-gate symmetrization', (candidate) => { candidate.validation.stressSymmetry.symmetrizationBeforeGateAllowed = true; }, /observer\.contract\.validation\.stressSymmetry\.symmetrizationBeforeGateAllowed/],
    ['ASE-derived raw source', (candidate) => { candidate.validation.stressSymmetry.sourceContract.aseAtomsGetStressVoigtFalseAcceptedAsRawSource = true; }, /observer\.contract\.validation\.stressSymmetry\.sourceContract\.aseAtomsGetStressVoigtFalseAcceptedAsRawSource/],
    ['determinism tolerance', (candidate) => { candidate.validation.determinismPerModel.numericToleranceAllowed = true; }, /observer\.contract\.validation\.determinismPerModel\.numericToleranceAllowed/],
    ['network', (candidate) => { candidate.isolationContract.network = 'bridge'; }, /observer\.contract\.isolationContract\.network/],
    ['label mount', (candidate) => { candidate.isolationContract.referenceLabelsMounted = true; }, /observer\.contract\.isolationContract\.referenceLabelsMounted/],
    ['self-report trust', (candidate) => { candidate.isolationContract.containerSelfReportTrusted = true; }, /observer\.contract\.isolationContract\.containerSelfReportTrusted/],
    ['resource provenance', (candidate) => { candidate.hostObservationContract.resourceLimitsStatus = 'resolved'; }, /observer\.contract\.hostObservationContract\.resourceLimitsStatus/],
    ['host provenance', (candidate) => { candidate.hostObservationContract.fieldProvenance.ordinal = 'container-self-report'; }, /observer\.contract\.hostObservationContract\.fieldProvenance\.ordinal/],
    ['claim', (candidate) => { candidate.outcomePolicy.claims.reproduced = true; }, /observer\.contract\.outcomePolicy\.claims\.reproduced/],
    ['publication', (candidate) => { candidate.publication.enabled = true; }, /observer\.contract\.publication\.enabled/],
    ['private execution right', (candidate) => { candidate.rightsPolicy.privateExecutionAllowed = true; }, /observer\.contract\.rightsPolicy\.privateExecutionAllowed/],
    ['aggregate publication right', (candidate) => { candidate.rightsPolicy.aggregatePublicationAllowed = true; }, /observer\.contract\.rightsPolicy\.aggregatePublicationAllowed/],
    ['runtime redistribution right', (candidate) => { candidate.rightsPolicy.runtimeRedistributionAllowed = true; }, /observer\.contract\.rightsPolicy\.runtimeRedistributionAllowed/],
    ['rights evidence', (candidate) => { candidate.rightsPolicy.evidenceBindings.datasetCatalog.licenseStatus = 'MIT'; }, /observer\.contract\.rightsPolicy\.evidenceBindings\.datasetCatalog\.licenseStatus/],
    ['frontend migration', (candidate) => { candidate.frontendBoundary.migrationAllowed = true; }, /observer\.contract\.frontendBoundary\.migrationAllowed/],
    ['legacy reinterpretation', (candidate) => { candidate.legacyReceiptBoundary.reinterpreted = true; }, /observer\.contract\.legacyReceiptBoundary\.reinterpreted/],
    ['excluded regime', (candidate) => { candidate.applicability.excludedRegimes.pop(); }, /observer\.contract\.applicability\.excludedRegimes/],
  ])('reports a leaf-specific failure for %s mutation', (_label, mutate, expected) => {
    const candidate = clone(contract);
    mutate(candidate);
    const failures = validateObserverContractSemantics(candidate).join('\n');
    expect(failures).toMatch(expected);
  });

  it('runs semantic projection even when the aggregate digest also changes', async () => {
    const candidate = clone(contract);
    candidate.topology.executionOrder[0].adapterRequests.value = 1328;
    const bytes = Buffer.from(`${JSON.stringify(candidate, null, 2)}\n`);
    const result = await validateObserverContractRepository(bytes, {
      root,
      contractSchemaBytes,
      receiptSchemaBytes,
      workflowBytes,
      requireWorkflowGitIndex: false,
    });
    expect(result.failures.join('\n')).toMatch(/observer\.contract\.rawDigest/);
    expect(result.failures.join('\n')).toMatch(/observer\.contract\.topology\.executionOrder\[0\]\.adapterRequests/);
  });
});

describe('unregistered observer workflow source policy', () => {
  it.each([
    ['unquoted on', (source) => source.replace('"on":', 'on:'), /observer\.workflow\.on\.quotedKey/],
    ['manual event', (source) => source.replace('  push:\n', '  workflow_dispatch: {}\n  push:\n'), /observer\.workflow\.on\.workflow_dispatch/],
    ['input-controlled guard', (source) => source.replace('${{ false }}', '${{ inputs.enable }}'), /observer\.workflow\.jobs\.fixture-contract-observer\.if/],
    ['always guard', (source) => source.replace('${{ false }}', '${{ always() }}'), /observer\.workflow\.jobs\.fixture-contract-observer\.if/],
    ['needs edge', (source) => source.replace('    if: ${{ false }}\n', '    if: ${{ false }}\n    needs: surprise\n'), /observer\.workflow\.jobs\.fixture-contract-observer\.needs/],
    ['extra step', (source) => source.replace('      - name: Emit the non-scientific fixture receipt\n', '      - name: Surprise\n        run: true\n      - name: Emit the non-scientific fixture receipt\n'), /observer\.workflow\.jobs\.fixture-contract-observer\.steps/],
    ['extra job', (source) => `${source}\n  surprise:\n    if: \${{ false }}\n    runs-on: ubuntu-24.04\n    steps: []\n`, /observer\.workflow\.jobs\.surprise/],
    ['secret expression', (source) => source.replace('shell: bash', 'env:\n          X: ${{ secrets.X }}\n        shell: bash'), /observer\.workflow\.secrets/],
    ['artifact upload', (source) => source.replace('uses: actions/checkout@', 'uses: actions/upload-artifact@'), /observer\.workflow\.artifactUpload/],
    ['container dispatch', (source) => source.replace(FIXTURE_COMMAND_IN_SOURCE, 'docker run forbidden'), /observer\.workflow\.modelDispatch/],
    ['merge key', (source) => source.replace('    if: ${{ false }}\n', '    <<: *defaults\n    if: ${{ false }}\n'), /observer\.workflow\.yaml\.merge/],
    ['anchor', (source) => source.replace('permissions: {}\n\njobs:', 'permissions: &permissions {}\n\njobs:'), /observer\.workflow\.yaml\.anchorAlias/],
    ['non-cyclic alias', (source) => source.replace('    permissions: {}', '    permissions: *permissions'), /observer\.workflow\.yaml\.anchorAlias/],
    ['punctuation anchor', (source) => source.replace('permissions: {}\n\njobs:', 'permissions: &.x {}\n\njobs:'), /observer\.workflow\.yaml\.anchorAlias/],
    ['punctuation alias', (source) => source.replace('    permissions: {}', '    permissions: *!x'), /observer\.workflow\.yaml\.anchorAlias/],
  ])('rejects %s without letting raw digest failure mask its path', (_label, mutate, expected) => {
    const failures = inspectObserverWorkflowSource(mutate(workflowSource)).join('\n');
    expect(failures).toMatch(expected);
    expect(failures).toMatch(/observer\.workflow\.rawDigest/);
  });

  it('binds a regular mode-0644 file to the exact stage-0 Git blob', async () => {
    const duplicatedKey = workflowSource.replace(
      'permissions: {}\n\njobs:',
      'permissions: {}\npermissions: {}\n\njobs:',
    );
    expect(inspectObserverWorkflowSource(duplicatedKey).join('\n'))
      .toMatch(/strict parse failed.*duplicated mapping key/i);
    const inlineMerge = workflowSource.replace(
      '    permissions: {}',
      '    permissions: { <<: { contents: read } }',
    );
    expect(inspectObserverWorkflowSource(inlineMerge).join('\n'))
      .toMatch(/observer\.workflow\.yaml\.merge/);
    const nonCyclicAlias = workflowSource
      .replace('permissions: {}\n\njobs:', 'permissions: &emptyPermissions {}\n\njobs:')
      .replace('    permissions: {}', '    permissions: *emptyPermissions');
    expect(inspectObserverWorkflowSource(nonCyclicAlias).join('\n'))
      .toMatch(/observer\.workflow\.yaml\.anchorAlias/);
    const reusableCall = workflowSource.replace(
      `uses: ${CHECKOUT_ACTION_IN_SOURCE}`,
      'uses: owner/repository/.github/workflows/reusable.yml@0123456789012345678901234567890123456789',
    );
    expect(inspectObserverWorkflowSource(reusableCall).join('\n'))
      .toMatch(/observer\.workflow\.jobs\.fixture-contract-observer\.steps\[0\]\.uses/);

    const temporary = await mkdtemp(path.join(os.tmpdir(), 'tf-observer-workflow-'));
    try {
      const canonicalTemporary = await realpath(temporary);
      const workflowPath = path.join(canonicalTemporary, ...OBSERVER_WORKFLOW_SOURCE_PATH.split('/'));
      await mkdir(path.dirname(workflowPath), { recursive: true });
      await writeFile(workflowPath, workflowBytes, { mode: 0o644 });
      execFileSync('/usr/bin/git', ['init', '-q'], { cwd: canonicalTemporary });
      execFileSync('/usr/bin/git', ['add', '--', OBSERVER_WORKFLOW_SOURCE_PATH], { cwd: canonicalTemporary });
      const accepted = await validateObserverWorkflowSourceRepository(canonicalTemporary);
      expect(accepted.failures).toEqual([]);

      await writeFile(workflowPath, Buffer.from(workflowSource.replace('${{ false }}', '${{ true }}')));
      const drifted = await validateObserverWorkflowSourceRepository(canonicalTemporary);
      expect(drifted.failures.join('\n')).toMatch(/observer\.workflow\.jobs\.fixture-contract-observer\.if/);
      expect(drifted.failures.join('\n')).toMatch(/observer\.workflow\.repository:.*Git index blob differs/);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('rejects non-0644, symlink and hard-linked workflow descriptors', async () => {
    const temporary = await mkdtemp(path.join(os.tmpdir(), 'tf-observer-file-'));
    try {
      const canonicalTemporary = await realpath(temporary);
      const workflowPath = path.join(canonicalTemporary, ...OBSERVER_WORKFLOW_SOURCE_PATH.split('/'));
      await mkdir(path.dirname(workflowPath), { recursive: true });
      await writeFile(workflowPath, workflowBytes, { mode: 0o644 });
      await chmod(workflowPath, 0o600);
      expect((await validateObserverWorkflowSourceRepository(canonicalTemporary, {
        requireGitIndex: false,
      })).failures.join('\n')).toMatch(/mode-0644/);

      await rm(workflowPath);
      const target = path.join(canonicalTemporary, 'workflow-target.yml');
      await writeFile(target, workflowBytes, { mode: 0o644 });
      await symlink(target, workflowPath);
      expect((await validateObserverWorkflowSourceRepository(canonicalTemporary, {
        requireGitIndex: false,
      })).failures.join('\n')).toMatch(/regular single-link/);

      await rm(workflowPath);
      await link(target, workflowPath);
      expect((await validateObserverWorkflowSourceRepository(canonicalTemporary, {
        requireGitIndex: false,
      })).failures.join('\n')).toMatch(/regular single-link/);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('binds all four reviewed sources to descriptors, stage-0 blobs and one staged tree', async () => {
    const temporary = await createReviewedSourceRepository();
    try {
      expect((await validateObserverSourceSetRepository(temporary)).failures).toEqual([]);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('rejects a reviewed source path replacement after descriptor read', async () => {
    const temporary = await createReviewedSourceRepository('tf-observer-source-race-');
    try {
      let replaced = false;
      const result = await validateObserverSourceSetRepository(temporary, {
        requireGitIndex: false,
        afterReadForTest: async (relativePath, absolutePath) => {
          if (relativePath !== OBSERVER_CONTRACT_PATH || replaced) return;
          replaced = true;
          await rename(absolutePath, `${absolutePath}.prior`);
          await writeFile(absolutePath, contractBytes, { mode: 0o644 });
        },
      });
      expect(result.failures.join('\n')).toMatch(/contract-vnext\.json changed during its descriptor read/);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('rejects an index blob that differs from exact reviewed worktree bytes', async () => {
    const temporary = await createReviewedSourceRepository('tf-observer-index-');
    try {
      const contractPath = path.join(temporary, ...OBSERVER_CONTRACT_PATH.split('/'));
      const mutated = Buffer.from(contractBytes.toString('utf8').replace(
        '"status": "executable-definition-fixture-only-dispatch-disabled"',
        '"status": "forged"',
      ));
      await writeFile(contractPath, mutated);
      execFileSync('/usr/bin/git', ['add', '--', OBSERVER_CONTRACT_PATH], { cwd: temporary });
      await writeFile(contractPath, contractBytes);
      const result = await validateObserverSourceSetRepository(temporary);
      expect(result.failures.join('\n')).toMatch(/contract-vnext\.json Git index blob differs/);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('rejects a staged-tree change after the first exact index read', async () => {
    const temporary = await createReviewedSourceRepository('tf-observer-tree-race-');
    try {
      const result = await validateObserverSourceSetRepository(temporary, {
        afterFirstIndexReadForTest: async (repositoryRoot) => {
          const workflowPath = path.join(
            repositoryRoot,
            ...OBSERVER_WORKFLOW_SOURCE_PATH.split('/'),
          );
          await writeFile(workflowPath, Buffer.from(`${workflowSource}\n`));
          execFileSync('/usr/bin/git', ['add', '--', OBSERVER_WORKFLOW_SOURCE_PATH], {
            cwd: repositoryRoot,
          });
        },
      });
      expect(result.failures.join('\n')).toMatch(/staged tree entry differs/);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('rejects an index change before the final index reread', async () => {
    const temporary = await createReviewedSourceRepository('tf-observer-final-index-race-');
    try {
      const result = await validateObserverSourceSetRepository(temporary, {
        beforeFinalIndexReadForTest: async (repositoryRoot) => {
          const receiptSchemaPath = path.join(
            repositoryRoot,
            ...OBSERVER_RECEIPT_SCHEMA_PATH.split('/'),
          );
          await writeFile(receiptSchemaPath, Buffer.from(`${receiptSchemaBytes.toString('utf8')}\n`));
          execFileSync('/usr/bin/git', ['add', '--', OBSERVER_RECEIPT_SCHEMA_PATH], {
            cwd: repositoryRoot,
          });
        },
      });
      expect(result.failures.join('\n')).toMatch(/reviewed Git index entries changed/);
    } finally {
      await rm(temporary, { recursive: true, force: true });
    }
  });

  it('rejects mode, symlink and hard-link identities for any reviewed source', async () => {
    for (const kind of ['mode', 'symlink', 'hardlink']) {
      const temporary = await createReviewedSourceRepository(`tf-observer-${kind}-`);
      try {
        const schemaPath = path.join(
          temporary,
          ...OBSERVER_CONTRACT_SCHEMA_PATH.split('/'),
        );
        if (kind === 'mode') {
          await chmod(schemaPath, 0o600);
        } else {
          const target = path.join(temporary, `schema-${kind}-target.json`);
          await writeFile(target, contractSchemaBytes, { mode: 0o644 });
          await rm(schemaPath);
          if (kind === 'symlink') await symlink(target, schemaPath);
          else await link(target, schemaPath);
        }
        const result = await validateObserverSourceSetRepository(temporary, {
          requireGitIndex: false,
        });
        expect(result.failures.join('\n')).toMatch(
          kind === 'mode' ? /mode-0644/ : /regular single-link non-symlink/,
        );
      } finally {
        await rm(temporary, { recursive: true, force: true });
      }
    }
  });
});

describe('fixture-only numerical and observation behavior', () => {
  it('applies the raw full-3x3 symmetry gate at nextDown, equal and nextUp', () => {
    const below = nextBinary64(STRESS_SYMMETRY_ABSOLUTE_TOLERANCE, Number.NEGATIVE_INFINITY);
    const above = nextBinary64(STRESS_SYMMETRY_ABSOLUTE_TOLERANCE, Number.POSITIVE_INFINITY);
    const tensor = (residual) => [[0, residual, 0], [0, 0, 0], [0, 0, 0]];
    expect(stressSymmetryResidual(tensor(below))).toBe(below);
    expect(passesStressSymmetry(tensor(below))).toBe(true);
    expect(passesStressSymmetry(tensor(STRESS_SYMMETRY_ABSOLUTE_TOLERANCE))).toBe(true);
    expect(passesStressSymmetry(tensor(above))).toBe(false);
    expect(() => stressSymmetryResidual([[0]])).toThrow(/full 3x3/);
    expect(() => stressSymmetryResidual([[0, 0, 0], [0, Number.NaN, 0], [0, 0, 0]]))
      .toThrow(/finite/);
  });

  it('rejects calculator-native asymmetry before ASE Voigt canonicalization', () => {
    const native = [
      [0, 2 * STRESS_SYMMETRY_ABSOLUTE_TOLERANCE, 0],
      [0, 0, 0],
      [0, 0, 0],
    ];
    const aseStyleSymmetricRoundTrip = native.map((row, i) => row.map(
      (value, j) => (value + native[j][i]) / 2,
    ));
    expect(assessCalculatorNativeStressForSymmetry(native)).toMatchObject({
      sourceRepresentation: 'calculator-native-full-3x3',
      gateDecision: 'fail',
      conversionAllowed: false,
    });
    expect(passesStressSymmetry(aseStyleSymmetricRoundTrip)).toBe(true);
    expect(assessCalculatorNativeStressForSymmetry([0, 0, 0, 0, 0, 0])).toEqual({
      sourceRepresentation: 'calculator-native-voigt6',
      sourceStatus: 'raw-full-3x3-unavailable',
      gateDecision: 'abstain',
      conversionAllowed: false,
      residual: null,
      reason: 'native-voigt6-cannot-establish-pre-conversion-antisymmetry',
    });
  });

  it('computes central Richardson force/stress with the preregistered signs and bases', () => {
    const q = 0.37;
    const h = 0.01;
    const energy = (value) => value ** 5 - 0.7 * value ** 4 + 0.2 * value ** 3
      + 1.1 * value ** 2 - 0.3 * value + 0.4;
    const analyticForce = -(5 * q ** 4 - 2.8 * q ** 3 + 0.6 * q ** 2
      + 2.2 * q - 0.3);
    const derivedForce = forceRichardson({
      energyPlusH: energy(q + h),
      energyMinusH: energy(q - h),
      energyPlusHalfH: energy(q + h / 2),
      energyMinusHalfH: energy(q - h / 2),
      h,
    });
    expect(passesAbsoluteRelative(analyticForce, derivedForce, 0.02, 0.01)).toBe(true);
    expect(passesAbsoluteRelative(analyticForce, -derivedForce, 0.02, 0.01)).toBe(false);

    const volume = 7;
    const strainEnergy = (strain) => volume
      * (0.9 * strain + 0.4 * strain ** 2 - 0.2 * strain ** 3
        + 0.15 * strain ** 5);
    const strainH = 0.002;
    const derivedStress = stressRichardson({
      energyPlusH: strainEnergy(strainH),
      energyMinusH: strainEnergy(-strainH),
      energyPlusHalfH: strainEnergy(strainH / 2),
      energyMinusHalfH: strainEnergy(-strainH / 2),
      h: strainH,
      referenceVolume: volume,
    });
    expect(passesAbsoluteRelative(0.9, derivedStress, 0.005, 0.02)).toBe(true);
    expect(passesAbsoluteRelative(0.9, -derivedStress, 0.005, 0.02)).toBe(false);
  });

  it('requires exact 693/40/89x4/60x4 fixture accounting and distinct authority', () => {
    const fixture = buildSyntheticCampaignFixture(contract);
    expect(validateSyntheticCampaignFixture(fixture, contract)).toEqual([]);

    const mutations = [
      [(candidate) => { candidate.models[0].authoritative.pop(); }, /authoritative\.records/],
      [(candidate) => { candidate.models[0].authoritative[0].id = 'fake-id'; }, /authoritative\[0\]\.id/],
      [(candidate) => { candidate.models[0].authoritative[0].referenceEnergy = 123; }, /authoritative\[0\]\.referenceEnergy/],
      [(candidate) => { candidate.models[0].secret = 'forbidden'; }, /models\[0\]\.secret/],
      [(candidate) => { candidate.models[0].invarianceCases.pop(); }, /invarianceCases\.count/],
      [(candidate) => { candidate.models[0].invarianceCases[0].id = 'fake-id'; }, /invarianceCases\[0\]\.key/],
      [(candidate) => { candidate.models[0].invarianceCases[0].energyError = Number.NEGATIVE_INFINITY; }, /invarianceCases\[0\]/],
      [(candidate) => { candidate.models[0].forceFiniteDifferenceCases[0].probeRecords = 3; }, /forceFiniteDifferenceCases\[0\]/],
      [(candidate) => { candidate.models[0].forceFiniteDifferenceCases[0].selectionToken = 'fake'; }, /forceFiniteDifferenceCases\[0\]\.key/],
      [(candidate) => { candidate.models[0].forceFiniteDifferenceCases[0].normalizedError = Number.NEGATIVE_INFINITY; }, /forceFiniteDifferenceCases\[0\]/],
      [(candidate) => { candidate.models[0].stressFiniteDifferenceCases[1] = clone(candidate.models[0].stressFiniteDifferenceCases[0]); }, /stressFiniteDifferenceCases\.keys/],
      [(candidate) => { candidate.models[0].stressFiniteDifferenceCases[0].id = 'fake-id'; }, /stressFiniteDifferenceCases\[0\]\.key/],
      [(candidate) => { candidate.models[1].authoritativeOrdinal = 1; }, /authoritativeOrdinal/],
      [(candidate) => { candidate.models[1].repeatContainerId = candidate.models[1].authoritativeContainerId; }, /containerIds/],
      [(candidate) => { candidate.models[1].repeatOutput = candidate.models[1].authoritativeOutput; }, /outputDirectories/],
      [(candidate) => { candidate.models[1].authoritativeContainerId = candidate.models[0].authoritativeContainerId; }, /models\[1\]\.authoritativeContainerId/],
      [(candidate) => { candidate.models[1].authoritativeOutput = candidate.syntheticHostObservations[0].outputDirectory; }, /models\[1\]\.authoritativeOutput/],
      [(candidate) => {
        candidate.models[1].authoritativeContainerId = candidate.models[0].authoritativeContainerId;
        candidate.syntheticHostObservations[2].containerId = candidate.models[0].authoritativeContainerId;
      }, /hostObservations\[2\]\.containerId/],
      [(candidate) => {
        candidate.models[1].authoritativeOutput = candidate.models[0].authoritativeOutput;
        candidate.syntheticHostObservations[2].outputDirectory = candidate.models[0].authoritativeOutput;
      }, /hostObservations\[2\]\.outputDirectory/],
      [(candidate) => { candidate.syntheticHostObservations[0].containerId = ''; }, /hostObservations\[0\]\.containerId/],
      [(candidate) => { candidate.syntheticHostObservations[0].outputDirectory = ''; }, /hostObservations\[0\]\.outputDirectory/],
      [(candidate) => { candidate.syntheticHostObservations[0].memoryLimitBytes = 0.5; }, /hostObservations\[0\]\.memoryLimitBytes/],
      [(candidate) => { candidate.syntheticHostObservations[0].pidsLimit = 0.5; }, /hostObservations\[0\]\.pidsLimit/],
    ];
    for (const [mutate, expected] of mutations) {
      const candidate = clone(fixture);
      mutate(candidate);
      expect(validateSyntheticCampaignFixture(candidate, contract).join('\n')).toMatch(expected);
    }
  });

  it('compares all 693 canonical leaves even after a coherent repeat-root recomputation', () => {
    const fixture = buildSyntheticCampaignFixture(contract).models[0];
    expect(validateDeterminismFixture(fixture.authoritative, fixture.repeat)).toEqual([]);
    fixture.repeat[692].energy = nextBinary64(
      fixture.repeat[692].energy,
      Number.POSITIVE_INFINITY,
    );
    const forgedRepeatRoot = sha256(canonicalScientificPayload(fixture.repeat));
    expect(forgedRepeatRoot).not.toBe(sha256(canonicalScientificPayload(fixture.authoritative)));
    expect(validateDeterminismFixture(fixture.authoritative, fixture.repeat).join('\n'))
      .toMatch(/canonicalScientificPayloadBytes/);
  });

  it.each([
    ['network', (observations) => { observations[0].networkMode = 'bridge'; }, /hostObservations\[0\]\.networkMode/],
    ['labels', (observations) => { observations[0].referenceLabelsMounted = true; }, /hostObservations\[0\]\.referenceLabelsMounted/],
    ['canary', (observations) => { observations[0].canaryObserved = true; }, /hostObservations\[0\]\.canaryObserved/],
    ['denial probe', (observations) => { observations[0].readDenialProbeDenied = false; }, /hostObservations\[0\]\.readDenialProbeDenied/],
    ['extra writable mount', (observations) => { observations[0].writableMountCount = 2; }, /hostObservations\[0\]\.writableMountCount/],
    ['GPU', (observations) => { observations[0].gpuDeviceRequests = ['gpu']; }, /hostObservations\[0\]\.gpuDeviceRequests/],
    ['self-report', (observations) => { observations[0].containerSelfReportTrusted = true; }, /hostObservations\[0\]\.containerSelfReportTrusted/],
    ['unknown secret', (observations) => { observations[0].secret = 'forbidden'; }, /hostObservations\[0\]\.secret/],
    ['unknown reference labels', (observations) => { observations[0].referenceLabels = [1, 2, 3]; }, /hostObservations\[0\]\.referenceLabels/],
    ['sequence mapping', (observations) => { observations[0].sequence = 1; }, /hostObservations\[0\]\.sequence/],
    ['model mapping', (observations) => { observations[0].model = 'mace'; }, /hostObservations\[0\]\.model/],
    ['model identity mapping', (observations) => { observations[0].modelId = 'mace-mpa-0-medium'; }, /hostObservations\[0\]\.modelId/],
    ['ordinal mapping', (observations) => { observations[0].ordinal = 1; }, /hostObservations\[0\]\.ordinal/],
    ['role mapping', (observations) => { observations[0].role = 'repeat-validation'; }, /hostObservations\[0\]\.role/],
    ['time inversion', (observations) => { observations[0].endedAtMonotonicNs = observations[0].startedAtMonotonicNs; }, /hostObservations\[0\]\.lifecycle/],
    ['lifecycle overlap', (observations) => { observations[1].startedAtMonotonicNs = observations[0].endedAtMonotonicNs - 1; }, /hostObservations\[1\]\.startedAtMonotonicNs/],
    ['container assignment source', (observations) => { observations[0].identityAssignmentAuthority = 'container-self-report'; }, /hostObservations\[0\]\.identityAssignmentAuthority/],
    ['unbounded memory', (observations) => { observations[0].memoryLimitBytes = Number.POSITIVE_INFINITY; }, /hostObservations\[0\]\.memoryLimitBytes/],
    ['peak above limit', (observations) => { observations[0].memoryPeakBytes = observations[0].memoryLimitBytes + 1; }, /hostObservations\[0\]\.memoryPeakBytes/],
    ['reused container', (observations) => { observations[1].containerId = observations[0].containerId; }, /hostObservations\[1\]\.containerId/],
    ['shared output', (observations) => { observations[1].outputDirectory = observations[0].outputDirectory; }, /hostObservations\[1\]\.outputDirectory/],
  ])('fails closed on synthetic host %s mutation', (_label, mutate, expected) => {
    const observations = buildSyntheticCampaignFixture(contract).syntheticHostObservations;
    mutate(observations);
    expect(validateSyntheticHostObservations(observations, contract).join('\n')).toMatch(expected);
  });

  it('emits only a schema-valid not-run abstention with all claims false', () => {
    const receipt = buildFixtureReceipt(contract, workflowBytes);
    expect(validateFixtureReceipt(receipt, receiptSchema, contract)).toEqual([]);
    expect(receipt).toMatchObject({
      evidenceClass: 'synthetic-contract-fixture-not-model-output',
      execution: 'not-run',
      scientificDecision: 'abstain',
      hostObservation: {
        status: 'not-observed-fixture-only',
        observedContainerExecutions: { value: 0 },
      },
      resourceProvenance: { status: 'not-observed-fixture-only', measurements: [] },
      rights: {
        status: 'rights-not-cleared',
        privateExecutionAllowed: false,
        aggregatePublicationAllowed: false,
        runtimeRedistributionAllowed: false,
      },
      publication: {
        enabled: false,
        allowedArtifactPaths: [],
        privateExecutionAllowed: false,
        aggregatePublicationAllowed: false,
        runtimeRedistributionAllowed: false,
      },
    });
    expect(Object.values(receipt.claims).every((value) => value === false)).toBe(true);

    const leafMutations = [
      [(candidate) => { candidate.contract.rawDigest = `sha256:${'0'.repeat(64)}`; }, /observer\.receipt\.contract\.rawDigest/],
      [(candidate) => { candidate.workflowObservation.sourceDigest = `sha256:${'1'.repeat(64)}`; }, /observer\.receipt\.workflowObservation\.sourceDigest/],
      [(candidate) => { candidate.plannedAccounting.adapterRequestsTotal.value = 4043; }, /observer\.receipt\.plannedAccounting\.adapterRequestsTotal\.value/],
      [(candidate) => { candidate.contractChecks.stressSymmetryBoundary.nextDown.value = 0; }, /observer\.receipt\.contractChecks\.stressSymmetryBoundary\.nextDown\.value/],
      [(candidate) => { candidate.contractChecks.forceFiniteDifferenceOracle.richardson = 0; }, /observer\.receipt\.contractChecks\.forceFiniteDifferenceOracle\.richardson/],
      [(candidate) => { candidate.hostObservation.requiredIdentityFields[0] = 'forged'; }, /observer\.receipt\.hostObservation\.requiredIdentityFields\[0\]/],
      [(candidate) => { candidate.resourceProvenance.limitsStatus = 'resolved'; }, /observer\.receipt\.resourceProvenance\.limitsStatus/],
      [(candidate) => { candidate.rights.privateExecutionAllowed = true; }, /observer\.receipt\.rights\.privateExecutionAllowed/],
      [(candidate) => { candidate.rights.aggregatePublicationAllowed = true; }, /observer\.receipt\.rights\.aggregatePublicationAllowed/],
      [(candidate) => { candidate.rights.runtimeRedistributionAllowed = true; }, /observer\.receipt\.rights\.runtimeRedistributionAllowed/],
    ];
    for (const [mutate, expected] of leafMutations) {
      const candidate = clone(receipt);
      mutate(candidate);
      expect(validateFixtureReceipt(candidate, receiptSchema, contract).join('\n'))
        .toMatch(expected);
    }
  });

  it.each([
    ['execution promotion', (receipt) => { receipt.execution = 'complete'; }, /observer\.receipt\.(?:schema|execution)/],
    ['scientific pass', (receipt) => { receipt.scientificDecision = 'pass'; }, /observer\.receipt\.(?:schema|scientificDecision)/],
    ['claim', (receipt) => { receipt.claims.reproduced = true; }, /observer\.receipt\.(?:schema|claims)/],
    ['host run', (receipt) => { receipt.hostObservation.observedContainerExecutions.value = 4; }, /observer\.receipt\.(?:schema|hostObservation)/],
    ['stress boundary', (receipt) => { receipt.contractChecks.stressSymmetryBoundary.nextUp.accepted = true; }, /observer\.receipt\.(?:schema|contractChecks)/],
    ['publication', (receipt) => { receipt.publication.enabled = true; }, /observer\.receipt\.(?:schema|publication)/],
    ['private execution right', (receipt) => { receipt.rights.privateExecutionAllowed = true; }, /observer\.receipt\.(?:schema|rights)/],
    ['aggregate publication right', (receipt) => { receipt.rights.aggregatePublicationAllowed = true; }, /observer\.receipt\.(?:schema|rights)/],
    ['runtime redistribution right', (receipt) => { receipt.rights.runtimeRedistributionAllowed = true; }, /observer\.receipt\.(?:schema|rights)/],
    ['excluded regimes', (receipt) => { receipt.applicability.excludedRegimes = []; }, /observer\.receipt\.(?:schema|applicability)/],
  ])('rejects fixture receipt %s mutation', (_label, mutate, expected) => {
    const receipt = buildFixtureReceipt(contract, workflowBytes);
    mutate(receipt);
    expect(validateFixtureReceipt(receipt, receiptSchema, contract).join('\n')).toMatch(expected);
  });
});
