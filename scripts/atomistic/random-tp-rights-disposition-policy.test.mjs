import {
  appendFile,
  chmod,
  copyFile,
  link,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv2020 from 'ajv/dist/2020.js';
import { afterEach, describe, expect, it } from 'vitest';
import { parseJsonRejectingDuplicateMembers } from './runtime-lock-policy.mjs';
import {
  EXPECTED_LOCAL_EVIDENCE,
  EXPECTED_RIGHTS_DECISIONS,
  RANDOM_TP_PRIVATE_COMPUTE_SCOPE_DIGEST,
  RANDOM_TP_RIGHTS_DISPOSITION_PATH,
  RANDOM_TP_RIGHTS_DISPOSITION_RAW_DIGEST,
  RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_PATH,
  RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_RAW_DIGEST,
  RANDOM_TP_RIGHTS_DISPOSITION_SEMANTIC_DIGEST,
  assessRightsAuthority,
  computePrivateComputeScopeDigest,
  inspectRandomTpRightsDispositionBytes,
  sha256,
  validateCheckedInRandomTpRightsDisposition,
  validateRandomTpRightsDispositionRepository,
  validateRandomTpRightsDispositionSchema,
} from './random-tp-rights-disposition-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const dispositionBytes = await readFile(path.join(root, RANDOM_TP_RIGHTS_DISPOSITION_PATH));
const dispositionText = dispositionBytes.toString('utf8');
const disposition = parseJsonRejectingDuplicateMembers(dispositionBytes);
const schemaBytes = await readFile(path.join(root, RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_PATH));
const schemaText = schemaBytes.toString('utf8');
const schema = parseJsonRejectingDuplicateMembers(schemaBytes);
const temporaryRoots = [];
const standaloneValidate = new Ajv2020({
  allErrors: true,
  strict: true,
  validateFormats: false,
  validateSchema: true,
}).compile(schema);

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((temporaryRoot) => rm(temporaryRoot, {
    force: true,
    recursive: true,
  })));
});

const encode = (candidate) => Buffer.from(`${JSON.stringify(candidate, null, 2)}\n`, 'utf8');
const mutate = async (change, options = {}) => {
  const candidate = structuredClone(disposition);
  change(candidate);
  return validateRandomTpRightsDispositionRepository(encode(candidate), {
    root,
    enforceCheckedInBytes: false,
    ...options,
  });
};
const expectDefaultDeny = (result) => {
  expect(result.rightsCleared).toBe(false);
  expect(result.dispatchEligible).toBe(false);
  expect(result.authority.authorizesRights).toBe(false);
  expect(result.authority.authorizationUsableForV01).toBe(false);
  expect(Object.values(result.effectiveRights)).toEqual([false, false, false]);
};
const decisionAllowedValues = (candidate) => Object.values(candidate.decisions)
  .map(({ allowed }) => allowed);

describe('Random-TP rights disposition v0.1', () => {
  it('accepts the exact checked-in abstention while keeping every right and dispatch closed', async () => {
    const result = await validateCheckedInRandomTpRightsDisposition({ root });

    expect(result.valid, result.failures.join('\n')).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.rawDigest)
      .toBe('sha256:32e0134c25553ab7a415ffab526b4bb82a81e487f1dae3424c25b841faf9962f');
    expect(result.semanticDigest)
      .toBe('sha256:edfaf76141afd65221f674f55c806568f3b7aab57eea9b62d2dabc9c67866cd3');
    expect(sha256(schemaBytes))
      .toBe('sha256:7c1f5c781c87cc3dfbfa0349be3b77a0529e23f569b1b4a213595bc0d606297c');
    expect(RANDOM_TP_PRIVATE_COMPUTE_SCOPE_DIGEST)
      .toBe('sha256:c73cbb22ae3f7c57579d55c1242f6a0434eb79fb0489cd8799fceff67b8e3c91');
    expect(result.rawDigest).toBe(RANDOM_TP_RIGHTS_DISPOSITION_RAW_DIGEST);
    expect(result.semanticDigest).toBe(RANDOM_TP_RIGHTS_DISPOSITION_SEMANTIC_DIGEST);
    expect(sha256(schemaBytes)).toBe(RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_RAW_DIGEST);
    expect(result.blockers).toEqual(Object.values(EXPECTED_RIGHTS_DECISIONS)
      .flatMap(({ reasonCodes }) => reasonCodes));
    expect(new Set(result.blockers).size).toBe(9);
    expect(result.authority.blockers).toContain('QUALIFIED_RIGHTS_REVIEW_NOT_RECORDED');
    expectDefaultDeny(result);
  });

  it('binds the official Git SHA-1 blob separately from the project-frozen SHA-256', () => {
    expect(disposition.bindings.dataset.gitObjectFormat).toBe('sha1');
    expect(disposition.bindings.dataset.gitBlobOid)
      .toBe('79bddf16aac8f8f5559fe2218867a7817fad4219');
    expect(disposition.bindings.dataset.gitBlobOid).toMatch(/^[0-9a-f]{40}$/);
    expect(disposition.bindings.dataset.gitBlobOidIsSha256).toBe(false);
    expect(disposition.bindings.dataset.contentsApiSha256FieldPresent).toBe(false);
    expect(disposition.bindings.dataset.contentsApiResponseDigest).toBeNull();
    expect(disposition.bindings.dataset.projectFrozenSha256)
      .toBe('sha256:c14473dcf4bd71e1ed11556ac9ff12b68e7a423d813f939bc9eedaef663054d9');
  });

  it('makes the v0.1 schema structurally incapable of representing an allowed decision', () => {
    expect(validateRandomTpRightsDispositionSchema(disposition, schema)).toEqual([]);
    expect(schema.const).toEqual(disposition);
    expect(Object.values(schema.const.decisions).every(
      ({ allowed, disposition: outcome }) => allowed === false && outcome === 'abstain',
    )).toBe(true);
    expect(schema.const.authorityGate.authorizationRecord).toBeNull();
    expect(Object.values(schema.const.effects)).not.toContain(true);
    expect(Object.values(schema.const.claims)).not.toContain(true);
  });

  it('makes standalone strict AJV reject scope, slot, checkpoint, and source-list drift', () => {
    const cases = [
      (candidate) => {
        candidate.intendedPrivateComputeScope.contract.environment.networkDuringModelExecution =
          'allowlisted-egress';
      },
      (candidate) => {
        const privateDecision = candidate.decisions.privateExecution;
        candidate.decisions.privateExecution = candidate.decisions.aggregatePublication;
        candidate.decisions.aggregatePublication = privateDecision;
      },
      (candidate) => {
        candidate.bindings.checkpoints.mattersim = structuredClone(
          candidate.bindings.checkpoints.mace,
        );
      },
      (candidate) => {
        candidate.evidenceReview.sources.push(structuredClone(
          candidate.evidenceReview.sources.at(-1),
        ));
      },
    ];

    for (const candidateMutation of cases) {
      const candidate = structuredClone(disposition);
      candidateMutation(candidate);
      expect(standaloneValidate(candidate)).toBe(false);
    }
  });

  it('rejects malformed or duplicate-member disposition, schema, and bound evidence JSON', async () => {
    const malformed = await validateRandomTpRightsDispositionRepository(
      Buffer.from('{"schemaVersion":', 'utf8'),
      { root, enforceCheckedInBytes: false },
    );
    expect(malformed.valid).toBe(false);
    expect(malformed.failures.join('\n')).toMatch(/invalid or duplicate-member JSON/);
    expectDefaultDeny(malformed);

    const duplicateDisposition = dispositionText.replace(
      '  "schemaVersion": "tf.atomistic-random-tp-rights-disposition/0.1",',
      '  "schemaVersion": "tf.atomistic-random-tp-rights-disposition/0.1",\n  "schemaVersion": "tf.atomistic-random-tp-rights-disposition/0.1",',
    );
    const duplicateInspection = inspectRandomTpRightsDispositionBytes(
      Buffer.from(duplicateDisposition, 'utf8'),
      { enforceCheckedInBytes: false },
    );
    expect(duplicateInspection.disposition).toBeNull();
    expect(duplicateInspection.failures.join('\n')).toMatch(/duplicate-member JSON/);

    const duplicateSchema = schemaText.replace(
      '  "$schema": "https://json-schema.org/draft/2020-12/schema",',
      '  "$schema": "https://json-schema.org/draft/2020-12/schema",\n  "$schema": "https://json-schema.org/draft/2020-12/schema",',
    );
    const schemaResult = await validateRandomTpRightsDispositionRepository(
      dispositionBytes,
      { root, fileOverrides: { [RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_PATH]: duplicateSchema } },
    );
    expect(schemaResult.valid).toBe(false);
    expect(schemaResult.failures.join('\n')).toMatch(/schema\.raw: unavailable or invalid.*duplicate/i);
    expectDefaultDeny(schemaResult);

    const catalogPath = disposition.bindings.localEvidence.datasetCatalog.path;
    const catalogText = (await readFile(path.join(root, catalogPath))).toString('utf8');
    const duplicateCatalog = catalogText.replace(
      '  "schemaVersion": "tf.dataset-catalog/0.1",',
      '  "schemaVersion": "tf.dataset-catalog/0.1",\n  "schemaVersion": "tf.dataset-catalog/0.1",',
    );
    const evidenceResult = await validateRandomTpRightsDispositionRepository(
      dispositionBytes,
      { root, fileOverrides: { [catalogPath]: duplicateCatalog } },
    );
    expect(evidenceResult.valid).toBe(false);
    expect(evidenceResult.failures.join('\n')).toMatch(/datasetCatalog: invalid or duplicate-member JSON/);
    expectDefaultDeny(evidenceResult);

    const invalidUtf8Inspection = inspectRandomTpRightsDispositionBytes(
      Buffer.concat([Buffer.from('{"value":"', 'utf8'), Buffer.from([0xff]), Buffer.from('"}', 'utf8')]),
      { enforceCheckedInBytes: false },
    );
    expect(invalidUtf8Inspection.disposition).toBeNull();
    expect(invalidUtf8Inspection.failures.join('\n')).toMatch(/invalid or duplicate-member JSON/);

    const trailingInspection = inspectRandomTpRightsDispositionBytes(
      Buffer.concat([dispositionBytes, Buffer.from('not-json', 'utf8')]),
      { enforceCheckedInBytes: false },
    );
    expect(trailingInspection.disposition).toBeNull();
    expect(trailingInspection.failures.join('\n')).toMatch(/invalid or duplicate-member JSON/);
  });

  it('rejects unsafe mode, symlink, and hard-link policy inputs', async () => {
    const cases = [
      async (temporaryRoot) => {
        await chmod(path.join(temporaryRoot, RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_PATH), 0o600);
      },
      async (temporaryRoot) => {
        const schemaPath = path.join(temporaryRoot, RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_PATH);
        await rm(schemaPath);
        await symlink(
          path.join(temporaryRoot, RANDOM_TP_RIGHTS_DISPOSITION_PATH),
          schemaPath,
        );
      },
      async (temporaryRoot) => {
        const target = path.join(
          temporaryRoot,
          EXPECTED_LOCAL_EVIDENCE.datasetCatalog.path,
        );
        await link(target, `${target}.hardlink`);
      },
    ];

    for (const mutatePolicyFiles of cases) {
      const temporaryRoot = await copyBoundPolicyFiles();
      await mutatePolicyFiles(temporaryRoot);
      const result = await validateCheckedInRandomTpRightsDisposition({ root: temporaryRoot });
      expect(result.valid).toBe(false);
      expect(result.failures.join('\n')).toMatch(/unavailable or unsafe|schema\.raw: unavailable/);
      expectDefaultDeny(result);
    }
  });

  it('re-audits every file identity after cross-file validation to close TOCTOU drift', async () => {
    const temporaryRoot = await copyBoundPolicyFiles();
    const targetPath = path.join(
      temporaryRoot,
      EXPECTED_LOCAL_EVIDENCE.datasetCatalog.path,
    );
    const result = await validateCheckedInRandomTpRightsDisposition({
      root: temporaryRoot,
      beforeFinalAuditForTest: async () => appendFile(targetPath, ' '),
    });

    expect(result.valid).toBe(false);
    expect(result.failures.join('\n')).toMatch(
      /repositorySnapshot\.evaluation\/data\/datasets\.json: bound file changed after snapshot/,
    );
    expectDefaultDeny(result);
  });

  it('rejects dataset, checkpoint, runtime, and local-evidence identity drift', async () => {
    const cases = [
      ['dataset revision', (candidate) => {
        candidate.bindings.dataset.revision = 'f'.repeat(40);
      }, /bindings\.dataset/],
      ['dataset Git blob OID', (candidate) => {
        candidate.bindings.dataset.gitBlobOid = 'e'.repeat(40);
      }, /bindings\.dataset/],
      ['project-frozen dataset digest', (candidate) => {
        candidate.bindings.dataset.projectFrozenSha256 = `sha256:${'d'.repeat(64)}`;
      }, /bindings\.dataset/],
      ['MatterSim checkpoint digest', (candidate) => {
        candidate.bindings.checkpoints.mattersim.sha256 = `sha256:${'c'.repeat(64)}`;
      }, /bindings\.checkpoints/],
      ['MACE checkpoint identity', (candidate) => {
        candidate.bindings.checkpoints.mace.modelId = 'mace-mpa-0-small';
      }, /bindings\.checkpoints/],
      ['runtime platform', (candidate) => {
        candidate.bindings.runtime.platform = 'linux/arm64';
      }, /bindings\.runtime/],
      ['runtime runner digest', (candidate) => {
        candidate.bindings.runtime.runnerDigest = `sha256:${'b'.repeat(64)}`;
      }, /bindings\.runtime/],
      ['bound local evidence digest', (candidate) => {
        candidate.bindings.localEvidence.runtimeLock.rawDigest = `sha256:${'a'.repeat(64)}`;
      }, /bindings\.localEvidence/],
    ];

    for (const [label, change, expectedFailure] of cases) {
      const result = await mutate(change);
      expect(result.valid, label).toBe(false);
      expect(result.failures.join('\n'), label).toMatch(expectedFailure);
      expect(decisionAllowedValues(result.disposition), label).toEqual([false, false, false]);
      expectDefaultDeny(result);
    }
  });

  it('rejects local evidence drift even when the disposition bytes remain exact', async () => {
    const catalogPath = disposition.bindings.localEvidence.datasetCatalog.path;
    const catalog = parseJsonRejectingDuplicateMembers(await readFile(path.join(root, catalogPath)));
    const randomTp = catalog.datasets.find(({ id }) => id === 'mattersim-random-tp');
    randomTp.sourceCommit = 'f'.repeat(40);

    const result = await validateRandomTpRightsDispositionRepository(dispositionBytes, {
      root,
      fileOverrides: { [catalogPath]: encode(catalog) },
    });
    expect(result.valid).toBe(false);
    expect(result.failures.join('\n')).toMatch(/datasetCatalog\.rawDigest/);
    expect(result.failures.join('\n')).toMatch(/datasetCatalog\.sourceCommit/);
    expectDefaultDeny(result);
  });

  it('rejects self-consistently re-digested attempts to widen purpose, network, access, or retention', async () => {
    const changes = [
      (contract) => { contract.purposeId = 'general-private-model-use'; },
      (contract) => { contract.environment.networkDuringModelExecution = 'allowlisted-egress'; },
      (contract) => { contract.access.currentlyAuthorizedPrincipals = ['implementation-builder']; },
      (contract) => { contract.retention.basis = 'thirty-days'; },
      (contract) => { contract.excludedUses = contract.excludedUses.slice(1); },
    ];

    for (const [index, change] of changes.entries()) {
      const result = await mutate((candidate) => {
        change(candidate.intendedPrivateComputeScope.contract);
        candidate.intendedPrivateComputeScope.scopeDigest = computePrivateComputeScopeDigest(
          candidate.intendedPrivateComputeScope.contract,
        );
      });
      expect(result.valid, `scope mutation ${index}`).toBe(false);
      expect(result.failures.join('\n'), `scope mutation ${index}`)
        .toMatch(/privateScope|frozen v0\.1 contract digest/);
      expect(decisionAllowedValues(result.disposition)).toEqual([false, false, false]);
      expectDefaultDeny(result);
    }
    expect(computePrivateComputeScopeDigest(disposition.intendedPrivateComputeScope.contract))
      .toBe(RANDOM_TP_PRIVATE_COMPUTE_SCOPE_DIGEST);
  });

  it('rejects decision swapping, slot substitution, reason duplication, and coupled representation', async () => {
    const cases = [
      (candidate) => {
        const privateRightId = candidate.decisions.privateExecution.rightId;
        candidate.decisions.privateExecution.rightId = candidate.decisions.aggregatePublication.rightId;
        candidate.decisions.aggregatePublication.rightId = privateRightId;
      },
      (candidate) => {
        candidate.decisions.aggregatePublication = structuredClone(candidate.decisions.privateExecution);
      },
      (candidate) => {
        candidate.decisions.runtimeRedistribution.reasonCodes[2] =
          candidate.decisions.runtimeRedistribution.reasonCodes[1];
      },
      (candidate) => {
        candidate.independence.representation = 'one-coupled-rights-slot';
      },
    ];

    for (const [index, change] of cases.entries()) {
      const result = await mutate(change);
      expect(result.valid, `decision mutation ${index}`).toBe(false);
      expect(result.failures.join('\n'), `decision mutation ${index}`)
        .toMatch(/decisions|reasonEvidence|independence|schema/);
      expect(decisionAllowedValues(result.disposition)).toEqual([false, false, false]);
      expectDefaultDeny(result);
    }
  });

  it('keeps missing, expired, untrusted, self-authored, and wrong-scope authority fail closed', () => {
    const baseRecord = {
      principalId: 'external-rights-reviewer',
      authorityClass: 'qualified-rights-reviewer-with-recorded-mandate',
      documentDigest: `sha256:${'a'.repeat(64)}`,
      scopeDigest: RANDOM_TP_PRIVATE_COMPUTE_SCOPE_DIGEST,
      issuedAt: '2026-09-03T00:00:00.000Z',
      expiresAt: '2026-09-05T00:00:00.000Z',
      trustVerified: true,
      signatureVerified: true,
      independentFromImplementation: true,
      authoredByImplementation: false,
    };
    const cases = [
      ['missing', null, {}, 'QUALIFIED_RIGHTS_REVIEW_NOT_RECORDED'],
      ['malformed', {}, { now: '2026-09-04T00:00:00.000Z' }, 'RIGHTS_AUTHORITY_RECORD_MALFORMED'],
      ['missing clock', baseRecord, {}, 'RIGHTS_AUTHORITY_TIME_REQUIRED'],
      ['expired', { ...baseRecord, expiresAt: '2026-09-04T00:00:00.000Z' }, { now: '2026-09-04T00:00:00.000Z' }, 'RIGHTS_AUTHORITY_EXPIRED'],
      ['untrusted', { ...baseRecord, trustVerified: false }, { now: '2026-09-04T00:00:00.000Z' }, 'RIGHTS_AUTHORITY_UNTRUSTED'],
      ['self-authored', {
        ...baseRecord,
        principalId: 'implementation-builder',
        independentFromImplementation: false,
        authoredByImplementation: true,
      }, {
        now: '2026-09-04T00:00:00.000Z',
        implementationPrincipals: ['implementation-builder'],
      }, 'RIGHTS_AUTHORITY_SELF_AUTHORED'],
      ['wrong scope', { ...baseRecord, scopeDigest: `sha256:${'b'.repeat(64)}` }, { now: '2026-09-04T00:00:00.000Z' }, 'RIGHTS_AUTHORITY_SCOPE_MISMATCH'],
    ];

    for (const [label, record, options, expectedBlocker] of cases) {
      const result = assessRightsAuthority(record, options);
      expect(result.blockers, label).toContain(expectedBlocker);
      expect(result.authorizesRights, label).toBe(false);
      expect(result.authorizationUsableForV01, label).toBe(false);
      expect(Object.values(result.effectiveRights), label).toEqual([false, false, false]);
    }
    const otherwiseWellFormed = assessRightsAuthority(baseRecord, {
      now: '2026-09-04T00:00:00.000Z',
    });
    expect(otherwiseWellFormed.blockers).toEqual(['VERSIONED_RIGHTS_MIGRATION_REQUIRED']);
    expect(otherwiseWellFormed.authorizesRights).toBe(false);
  });

  it('rejects an authority-record injection without changing any decision to an allowed grant', async () => {
    const result = await mutate((candidate) => {
      candidate.authorityGate.authorizationRecord = {
        principalId: 'external-rights-reviewer',
        authorityClass: 'qualified-rights-reviewer-with-recorded-mandate',
        documentDigest: `sha256:${'a'.repeat(64)}`,
        scopeDigest: RANDOM_TP_PRIVATE_COMPUTE_SCOPE_DIGEST,
        issuedAt: '2026-09-03T00:00:00.000Z',
        expiresAt: '2026-09-05T00:00:00.000Z',
        trustVerified: true,
        signatureVerified: true,
        independentFromImplementation: true,
        authoredByImplementation: false,
      };
    });

    expect(result.valid).toBe(false);
    expect(result.failures.join('\n')).toMatch(/forbids authority injection|schema/);
    expect(decisionAllowedValues(result.disposition)).toEqual([false, false, false]);
    expect(result.authority.blockers).toContain('VERSIONED_RIGHTS_MIGRATION_REQUIRED');
    expectDefaultDeny(result);
  });
});

async function copyBoundPolicyFiles() {
  const temporaryRoot = await realpath(
    await mkdtemp(path.join(tmpdir(), 'tailing-rights-policy-')),
  );
  temporaryRoots.push(temporaryRoot);
  const relativePaths = [
    RANDOM_TP_RIGHTS_DISPOSITION_PATH,
    RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_PATH,
    ...Object.values(EXPECTED_LOCAL_EVIDENCE).map(({ path: relativePath }) => relativePath),
  ];
  for (const relativePath of relativePaths) {
    const destination = path.join(temporaryRoot, relativePath);
    await mkdir(path.dirname(destination), { recursive: true });
    await copyFile(path.join(root, relativePath), destination);
    await chmod(destination, 0o644);
  }
  return temporaryRoot;
}
