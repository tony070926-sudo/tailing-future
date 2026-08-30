import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  FULL_CANDIDATE_PLAN_PATH,
  FULL_CANDIDATE_PLAN_RAW_DIGEST,
  FULL_CANDIDATE_PLAN_SCHEMA_PATH,
  FULL_CANDIDATE_RECEIPT_SCHEMA_PATH,
  inspectFullCandidatePlanBytes,
  validateFullCandidateIdManifest,
  validateFullCandidatePlanRepository,
  validateFullCandidatePlanSchema,
  validateFullCandidatePlanSemantics,
} from './full-candidate-plan-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const planBytes = await readFile(path.join(root, FULL_CANDIDATE_PLAN_PATH));
const planText = planBytes.toString('utf8');
const plan = JSON.parse(planText);
const schema = JSON.parse(await readFile(path.join(root, FULL_CANDIDATE_PLAN_SCHEMA_PATH), 'utf8'));
const receiptSchema = JSON.parse(await readFile(path.join(root, FULL_CANDIDATE_RECEIPT_SCHEMA_PATH), 'utf8'));
const idManifestBytes = await readFile(path.join(root, 'evaluation/atomistic/random-tp-id-manifest.txt'));

const jsonBytes = (value) => Buffer.from(`${JSON.stringify(value, null, 2)}\n`, 'utf8');
const semanticFailures = (change) => {
  const candidate = structuredClone(plan);
  change(candidate);
  return validateFullCandidatePlanSemantics(candidate).join('\n');
};

describe('atomistic full-candidate frozen plan policy', () => {
  it('accepts the exact checked-in plan, strict schema and every bound repository root', async () => {
    expect(validateFullCandidatePlanSchema(plan, schema)).toEqual([]);
    const result = await validateFullCandidatePlanRepository(planBytes, { root });
    expect(result.rawDigest).toBe(FULL_CANDIDATE_PLAN_RAW_DIGEST);
    expect(result.failures).toEqual([]);
  });

  it('integrates the frozen, not-run candidate state into atomistic validation output', () => {
    const output = execFileSync(process.execPath, ['scripts/validate-atomistic-plan.mjs'], {
      cwd: root,
      encoding: 'utf8',
    });
    expect(output).toMatch(/FULL CANDIDATE FROZEN 693×2 — NOT RUN/);
    expect(output).toMatch(/PLAN ONLY — NO INFERENCE/);
  });

  it('rejects raw-only rewrites and duplicate or escape-equivalent JSON members before last-wins parsing', () => {
    const rewritten = Buffer.from(`${planText.trimEnd()}  \n`, 'utf8');
    expect(JSON.parse(rewritten.toString('utf8'))).toEqual(plan);
    expect(inspectFullCandidatePlanBytes(rewritten).failures).toContain('candidate-plan.raw: frozen byte digest mismatch');

    for (const duplicate of [
      planText.replace(
        '  "status": "frozen-candidate-contract-not-run",',
        '  "status": "complete-pass",\n  "status": "frozen-candidate-contract-not-run",',
      ),
      planText.replace(
        '  "status": "frozen-candidate-contract-not-run",',
        '  "\\u0073tatus": "complete-pass",\n  "status": "frozen-candidate-contract-not-run",',
      ),
    ]) {
      expect(JSON.parse(duplicate)).toEqual(plan);
      expect(inspectFullCandidatePlanBytes(Buffer.from(duplicate)).failures.join('\n')).toMatch(/duplicate JSON member/);
    }
  });

  it('rejects coherent metric, accepted-interval and complete-partition drift', () => {
    const mutations = [
      (candidate) => { candidate.metrics.stressGateError = 'spectral-norm'; },
      (candidate) => { candidate.metrics.binary64MetricEvidenceRootProtocol = 'sha256-of-report/v0'; },
      (candidate) => { candidate.acceptance.mattersim.acceptedIntervals.energyMaeEvPerAtom = [0, 1]; },
      (candidate) => { candidate.acceptance.mattersim.conjunction = 'energy-or-force-or-stress'; },
      (candidate) => { candidate.execution.partitioning.partitions.reverse(); },
      (candidate) => { candidate.execution.partitioning.partitions[0].expectedRecords = 692; },
      (candidate) => { candidate.execution.partitioning.partitions[0].selection = 'first-693-records'; },
    ];
    for (const [index, mutation] of mutations.entries()) {
      expect(semanticFailures(mutation), `mutation ${index}`).toMatch(/exact frozen contract|metrics|acceptance|execution|partitions/);
    }
  });

  it('rejects claim, SOTA boundary and pending-gate drift even when internally coherent', () => {
    const mutations = [
      (candidate) => { candidate.resultPolicy.claims.claimEligible = true; },
      (candidate) => { candidate.resultPolicy.claims.comparisonEligible = true; },
      (candidate) => { candidate.acceptance.mace.superiorityClaimAllowed = true; },
      (candidate) => { candidate.claimBoundaries.currentSotaClaimAllowed = true; },
      (candidate) => { candidate.claimBoundaries.randomTpIsMatbenchWbm = true; },
      (candidate) => { candidate.claimBoundaries.matterSimInterpretation = 'official-bit-exact'; },
      (candidate) => { candidate.scientificGatesPending.shift(); },
    ];
    for (const [index, mutation] of mutations.entries()) {
      expect(semanticFailures(mutation), `mutation ${index}`).toMatch(/exact frozen contract|requires exact false|claims|acceptance|claimBoundaries|scientificGatesPending/);
    }
  });

  it('uses strict AJV and freezes the schema bytes against permissive drift', async () => {
    const schemaWithUnknownKeyword = structuredClone(schema);
    schemaWithUnknownKeyword.permissiveFutureMode = true;
    expect(validateFullCandidatePlanSchema(plan, schemaWithUnknownKeyword).join('\n')).toMatch(/strict AJV compilation failed/);

    const schemaWithChangedTitle = structuredClone(schema);
    schemaWithChangedTitle.title = 'Permissive lookalike schema';
    const result = await validateFullCandidatePlanRepository(planBytes, {
      root,
      fileOverrides: { [FULL_CANDIDATE_PLAN_SCHEMA_PATH]: jsonBytes(schemaWithChangedTitle) },
    });
    expect(result.failures.join('\n')).toMatch(/candidate-plan\.schema\.rawDigest/);

    const planWithExtraProperty = structuredClone(plan);
    planWithExtraProperty.unreviewed = true;
    expect(validateFullCandidatePlanSchema(planWithExtraProperty, schema).join('\n')).toMatch(/additionalProperties/);

    const receiptSchemaWithUnknownKeyword = structuredClone(receiptSchema);
    receiptSchemaWithUnknownKeyword.permissiveFutureMode = true;
    const receiptResult = await validateFullCandidatePlanRepository(planBytes, {
      root,
      fileOverrides: { [FULL_CANDIDATE_RECEIPT_SCHEMA_PATH]: jsonBytes(receiptSchemaWithUnknownKeyword) },
    });
    expect(receiptResult.failures.join('\n')).toMatch(/candidate-receipt\.schema\.rawDigest/);
    expect(receiptResult.failures.join('\n')).toMatch(/candidate-receipt\.schema: strict AJV compilation failed/);
  });

  it('recomputes and rejects drift in scientific-plan, runtime-lock and ID-manifest bytes', async () => {
    const scientificPath = 'evaluation/atomistic/reproduction-plan.json';
    const runtimePath = 'evaluation/atomistic/runtime-lock.json';
    const [scientificBytes, runtimeBytes] = await Promise.all([
      readFile(path.join(root, scientificPath)),
      readFile(path.join(root, runtimePath)),
    ]);
    const result = await validateFullCandidatePlanRepository(planBytes, {
      root,
      fileOverrides: {
        [scientificPath]: Buffer.concat([scientificBytes, Buffer.from(' ')]),
        [runtimePath]: Buffer.concat([runtimeBytes, Buffer.from(' ')]),
        'evaluation/atomistic/random-tp-id-manifest.txt': Buffer.from(idManifestBytes.toString('utf8').replace('random-TP-000001', 'random-TP-999999')),
      },
    });
    expect(result.failures.join('\n')).toMatch(/scientific-plan\.rawDigest/);
    expect(result.failures.join('\n')).toMatch(/runtime-lock\.rawDigest/);
    expect(result.failures.join('\n')).toMatch(/id-manifest\.rawDigest/);
  });

  it('requires exactly 693 unique, strictly ASCII-sorted frozen IDs', () => {
    expect(validateFullCandidateIdManifest(idManifestBytes, plan)).toEqual([]);
    const ids = idManifestBytes.toString('utf8').trimEnd().split('\n');
    [ids[0], ids[1]] = [ids[1], ids[0]];
    const failures = validateFullCandidateIdManifest(Buffer.from(`${ids.join('\n')}\n`), plan).join('\n');
    expect(failures).toMatch(/rawDigest/);
    expect(failures).toMatch(/not strictly ASCII sorted/);
  });

  it('rejects runtime identity and catalog root/license drift independently of candidate-plan prose', async () => {
    const runtimePath = 'evaluation/atomistic/runtime-lock.json';
    const catalogPath = 'evaluation/data/datasets.json';
    const runtime = JSON.parse(await readFile(path.join(root, runtimePath), 'utf8'));
    runtime.identities.dependencyLockDigests.mattersim = `sha256:${'a'.repeat(64)}`;
    runtime.freezeEvidence.sourceReceipt.stableInputsCommitment = `sha256:${'b'.repeat(64)}`;
    const catalog = JSON.parse(await readFile(path.join(root, catalogPath), 'utf8'));
    const randomTp = catalog.datasets.find((dataset) => dataset.id === 'mattersim-random-tp');
    catalog.frozenAt = '2026-08-28';
    randomTp.license = 'MIT';
    randomTp.redistribute = true;
    randomTp.structureManifestSha256 = `sha256:${'c'.repeat(64)}`;
    randomTp.labelManifestSha256 = `sha256:${'d'.repeat(64)}`;

    const result = await validateFullCandidatePlanRepository(planBytes, {
      root,
      fileOverrides: {
        [runtimePath]: jsonBytes(runtime),
        [catalogPath]: jsonBytes(catalog),
      },
    });
    const failures = result.failures.join('\n');
    expect(failures).toMatch(/dataset-catalog\.frozenAt/);
    expect(failures).toMatch(/stableInputsCommitment/);
    expect(failures).toMatch(/dependencyLockDigest/);
    expect(failures).toMatch(/NOASSERTION and redistribute=false/);
    expect(failures).toMatch(/structureManifestDigest/);
    expect(failures).toMatch(/labelManifestDigest/);
  });
});
