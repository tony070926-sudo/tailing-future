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
  RANDOM_TP_AUTHORITY_REQUEST_MARKDOWN_PATH,
  RANDOM_TP_AUTHORITY_REQUEST_MARKDOWN_RAW_DIGEST,
  RANDOM_TP_AUTHORITY_REQUEST_PATH,
  RANDOM_TP_AUTHORITY_REQUEST_RAW_DIGEST,
  RANDOM_TP_AUTHORITY_REQUEST_SCHEMA_PATH,
  RANDOM_TP_AUTHORITY_REQUEST_SCHEMA_RAW_DIGEST,
  RANDOM_TP_AUTHORITY_REQUEST_SEMANTIC_DIGEST,
  inspectRandomTpAuthorityRequestBytes,
  renderRandomTpAuthorityRequestMarkdown,
  validateCheckedInRandomTpAuthorityRequest,
  validateRandomTpAuthorityRequestRepository,
} from './random-tp-authority-request-policy.mjs';
import {
  RANDOM_TP_PRIVATE_COMPUTE_SCOPE_DIGEST,
  RANDOM_TP_RIGHTS_DISPOSITION_PATH,
  RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_PATH,
  RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_RAW_DIGEST,
  sha256,
} from './random-tp-rights-disposition-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const requestBytes = await readFile(path.join(root, RANDOM_TP_AUTHORITY_REQUEST_PATH));
const requestText = requestBytes.toString('utf8');
const request = parseJsonRejectingDuplicateMembers(requestBytes);
const schemaBytes = await readFile(path.join(root, RANDOM_TP_AUTHORITY_REQUEST_SCHEMA_PATH));
const schema = parseJsonRejectingDuplicateMembers(schemaBytes);
const markdownBytes = await readFile(path.join(root, RANDOM_TP_AUTHORITY_REQUEST_MARKDOWN_PATH));
const rightsSchemaBytes = await readFile(path.join(root, RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_PATH));
const temporaryRoots = [];

const encode = (candidate) => Buffer.from(`${JSON.stringify(candidate, null, 2)}\n`, 'utf8');
const exactModeManifest = (relativePaths) => Object.fromEntries(
  relativePaths.map((relativePath) => [relativePath, 0o644]),
);
const expectDefaultDeny = (result) => {
  expect(result.authorizationPresent).toBe(false);
  expect(result.authorizesPrivateExecution).toBe(false);
  expect(result.registrationEligible).toBe(false);
  expect(result.dispatchEligible).toBe(false);
  expect(result.publicationEligible).toBe(false);
  expect(result.redistributionEligible).toBe(false);
  expect(result.frontendIngestionEligible).toBe(false);
  expect(result.scorePromotionEligible).toBe(false);
  expect(result.scientificClaimEligible).toBe(false);
  expect(Object.values(result.effectiveRights)).toEqual([false, false, false]);
};

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((temporaryRoot) => rm(temporaryRoot, {
    force: true,
    recursive: true,
  })));
});

describe('Random-TP private-execution authority request v0.1', () => {
  it('accepts the exact checked-in request while keeping every authority effect closed', async () => {
    const result = await validateCheckedInRandomTpAuthorityRequest({ root });

    expect(result.valid, result.failures.join('\n')).toBe(true);
    expect(result.failures).toEqual([]);
    expect(result.rawDigest).toBe(RANDOM_TP_AUTHORITY_REQUEST_RAW_DIGEST);
    expect(result.semanticDigest).toBe(RANDOM_TP_AUTHORITY_REQUEST_SEMANTIC_DIGEST);
    expect(sha256(schemaBytes)).toBe(RANDOM_TP_AUTHORITY_REQUEST_SCHEMA_RAW_DIGEST);
    expect(sha256(markdownBytes)).toBe(RANDOM_TP_AUTHORITY_REQUEST_MARKDOWN_RAW_DIGEST);
    expect(sha256(rightsSchemaBytes)).toBe(RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_RAW_DIGEST);
    expect(request.exactPrivateComputeScope.scopeDigest)
      .toBe(RANDOM_TP_PRIVATE_COMPUTE_SCOPE_DIGEST);
    expect(request.exactPrivateComputeScope.benchmark.frameCount).toEqual({
      value: 693,
      unit: 'frame',
      dimension: 'count',
      basis: 'every frozen ASCII-ordered Random-TP identifier',
    });
    expect(request.exactPrivateComputeScope.requestBudget.totalMaximumRequests).toEqual({
      value: 4044,
      unit: 'prediction-request',
      dimension: 'count',
      basis: 'sum of the five exact preregistered request classes',
    });
    expect(markdownBytes.toString('utf8'))
      .toBe(renderRandomTpAuthorityRequestMarkdown(request));
    expectDefaultDeny(result);
  });

  it('rejects malformed, duplicate-member, invalid-UTF8 and trailing JSON', async () => {
    const duplicate = requestText.replace(
      '  "schemaVersion": "tf.atomistic-random-tp-private-execution-authority-request/0.1",',
      '  "schemaVersion": "tf.atomistic-random-tp-private-execution-authority-request/0.1",\n  "schemaVersion": "tf.atomistic-random-tp-private-execution-authority-request/0.1",',
    );
    const candidates = [
      Buffer.from('{"schemaVersion":', 'utf8'),
      Buffer.from(duplicate, 'utf8'),
      Buffer.concat([Buffer.from('{"value":"', 'utf8'), Buffer.from([0xff]), Buffer.from('"}', 'utf8')]),
      Buffer.concat([requestBytes, Buffer.from('not-json', 'utf8')]),
    ];

    for (const candidate of candidates) {
      const inspection = inspectRandomTpAuthorityRequestBytes(candidate, {
        enforceCheckedInBytes: false,
      });
      expect(inspection.request).toBeNull();
      expect(inspection.failures.join('\n')).toMatch(/invalid or duplicate-member JSON/);
    }
  });

  it('rejects request, both schemas, Markdown and rights-disposition byte drift', async () => {
    const mutations = [
      [RANDOM_TP_AUTHORITY_REQUEST_SCHEMA_PATH, Buffer.concat([schemaBytes, Buffer.from(' ')])],
      [RANDOM_TP_AUTHORITY_REQUEST_MARKDOWN_PATH, Buffer.concat([markdownBytes, Buffer.from(' ')])],
      [RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_PATH, Buffer.from('{}\n', 'utf8')],
      [RANDOM_TP_RIGHTS_DISPOSITION_PATH, Buffer.concat([
        await readFile(path.join(root, RANDOM_TP_RIGHTS_DISPOSITION_PATH)),
        Buffer.from(' '),
      ])],
    ];
    for (const [relativePath, bytes] of mutations) {
      const result = await validateRandomTpAuthorityRequestRepository(requestBytes, {
        root,
        fileOverrides: { [relativePath]: bytes },
        fileOverrideModes: exactModeManifest([relativePath]),
        requestFileMode: 0o644,
      });
      expect(result.valid).toBe(false);
      expect(result.failures.join('\n')).toMatch(/rawDigest|deterministic projection/);
      expectDefaultDeny(result);
    }

    const changedRequest = Buffer.concat([requestBytes, Buffer.from(' ')]);
    const result = await validateRandomTpAuthorityRequestRepository(changedRequest, { root });
    expect(result.valid).toBe(false);
    expect(result.failures).toContain('authority-request.rawDigest: exact reviewed bytes differ');
    expectDefaultDeny(result);
  });

  it('requires exact mode metadata for every repository byte override', async () => {
    for (const fileOverrideModes of [null, {
      [RANDOM_TP_AUTHORITY_REQUEST_SCHEMA_PATH]: 0o755,
    }]) {
      const result = await validateRandomTpAuthorityRequestRepository(requestBytes, {
        root,
        fileOverrides: { [RANDOM_TP_AUTHORITY_REQUEST_SCHEMA_PATH]: schemaBytes },
        fileOverrideModes,
        requestFileMode: 0o644,
      });
      expect(result.valid).toBe(false);
      expect(result.failures).toContain(
        'authority-request.schema.raw: unavailable or invalid (override source mode must be exact 0644)',
      );
      expectDefaultDeny(result);
    }
  });

  it('rejects every parseable non-object or structurally unsafe root without throwing', async () => {
    const candidates = [
      null,
      false,
      0,
      '',
      [],
      {},
      { exactPrivateComputeScope: null },
      { exactPrivateComputeScope: { models: null } },
    ];

    for (const candidate of candidates) {
      const result = await validateRandomTpAuthorityRequestRepository(encode(candidate), {
        root,
        enforceCheckedInBytes: false,
      });
      expect(result.valid).toBe(false);
      expect(result.failures.length).toBeGreaterThan(0);
      expectDefaultDeny(result);
    }
  });

  it('rejects unsafe mode, symlink and hard-link policy inputs', async () => {
    const cases = [
      async (temporaryRoot) => {
        await chmod(path.join(temporaryRoot, RANDOM_TP_AUTHORITY_REQUEST_PATH), 0o4644);
      },
      async (temporaryRoot) => {
        await chmod(path.join(temporaryRoot, RANDOM_TP_AUTHORITY_REQUEST_SCHEMA_PATH), 0o600);
      },
      async (temporaryRoot) => {
        await chmod(path.join(temporaryRoot, RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_PATH), 0o600);
      },
      async (temporaryRoot) => {
        await rm(path.join(temporaryRoot, RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_PATH));
      },
      async (temporaryRoot) => {
        const markdownPath = path.join(temporaryRoot, RANDOM_TP_AUTHORITY_REQUEST_MARKDOWN_PATH);
        await rm(markdownPath);
        await symlink(
          path.join(temporaryRoot, RANDOM_TP_AUTHORITY_REQUEST_PATH),
          markdownPath,
        );
      },
      async (temporaryRoot) => {
        const rightsPath = path.join(temporaryRoot, RANDOM_TP_RIGHTS_DISPOSITION_PATH);
        await link(rightsPath, `${rightsPath}.hardlink`);
      },
      async (temporaryRoot) => {
        const rightsSchemaPath = path.join(
          temporaryRoot,
          RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_PATH,
        );
        await rm(rightsSchemaPath);
        await symlink(
          path.join(temporaryRoot, RANDOM_TP_AUTHORITY_REQUEST_SCHEMA_PATH),
          rightsSchemaPath,
        );
      },
      async (temporaryRoot) => {
        const rightsSchemaPath = path.join(
          temporaryRoot,
          RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_PATH,
        );
        await link(rightsSchemaPath, `${rightsSchemaPath}.hardlink`);
      },
    ];

    for (const mutateFiles of cases) {
      const temporaryRoot = await copyPolicyFiles();
      await mutateFiles(temporaryRoot);
      const result = await validateCheckedInRandomTpAuthorityRequest({ root: temporaryRoot });
      expect(result.valid).toBe(false);
      expect(result.failures.join('\n')).toMatch(/unavailable|unsafe|schema\.raw|markdown\.raw/);
      expectDefaultDeny(result);
    }
  });

  it('returns a denial envelope for a structurally invalid checked-in request', async () => {
    const temporaryRoot = await copyPolicyFiles();
    const target = path.join(temporaryRoot, RANDOM_TP_AUTHORITY_REQUEST_PATH);
    await rm(target);
    await copyFile(path.join(root, RANDOM_TP_AUTHORITY_REQUEST_SCHEMA_PATH), target);
    await chmod(target, 0o644);

    const result = await validateCheckedInRandomTpAuthorityRequest({ root: temporaryRoot });
    expect(result.valid).toBe(false);
    expect(result.failures.length).toBeGreaterThan(0);
    expectDefaultDeny(result);
  });

  it('re-audits Markdown and the bound rights schema after validation', async () => {
    for (const relativePath of [
      RANDOM_TP_AUTHORITY_REQUEST_MARKDOWN_PATH,
      RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_PATH,
    ]) {
      const temporaryRoot = await copyPolicyFiles();
      const target = path.join(temporaryRoot, relativePath);
      const result = await validateCheckedInRandomTpAuthorityRequest({
        root: temporaryRoot,
        beforeFinalAuditForTest: async () => appendFile(target, ' '),
      });

      expect(result.valid).toBe(false);
      expect(result.failures.join('\n')).toMatch(
        /authority-request\.repositorySnapshot\..*: bound file changed after snapshot/,
      );
      expectDefaultDeny(result);
    }
  });
});

async function copyPolicyFiles() {
  const temporaryRoot = await realpath(
    await mkdtemp(path.join(tmpdir(), 'tf-authority-request-test-')),
  );
  temporaryRoots.push(temporaryRoot);
  for (const relativePath of [
    RANDOM_TP_AUTHORITY_REQUEST_PATH,
    RANDOM_TP_AUTHORITY_REQUEST_SCHEMA_PATH,
    RANDOM_TP_AUTHORITY_REQUEST_MARKDOWN_PATH,
    RANDOM_TP_RIGHTS_DISPOSITION_PATH,
    RANDOM_TP_RIGHTS_DISPOSITION_SCHEMA_PATH,
  ]) {
    const target = path.join(temporaryRoot, relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await copyFile(path.join(root, relativePath), target);
    await chmod(target, 0o644);
  }
  return temporaryRoot;
}

  it('uses an exact strict 2020-12 schema with no granting state', () => {
    const validate = new Ajv2020({
      allErrors: true,
      strict: true,
      validateFormats: false,
      validateSchema: true,
    }).compile(schema);

    expect(schema.$schema).toBe('https://json-schema.org/draft/2020-12/schema');
    expect(schema.const).toEqual(request);
    expect(validate(request)).toBe(true);
    const granted = structuredClone(request);
    granted.effects.privateModelExecutionAuthorized = true;
    expect(validate(granted)).toBe(false);
  });

  it.each([
    ['grant injection', (candidate) => {
      candidate.grant = { allowed: true };
    }, /semantic|schema/],
    ['dispatch injection', (candidate) => {
      candidate.requestSemantics.requestMayDispatchWorkflow = true;
    }, /requestSemantics|semantic|schema/],
    ['authorization record injection', (candidate) => {
      candidate.authorizationState.authorizationRecord = {
        principalId: 'self',
        signature: 'forged',
      };
    }, /authorizationState|semantic|schema/],
    ['scope digest drift', (candidate) => {
      candidate.exactPrivateComputeScope.scopeDigest = `sha256:${'0'.repeat(64)}`;
    }, /privateScope\.scopeDigest|semantic|schema/],
    ['dataset drift', (candidate) => {
      candidate.exactPrivateComputeScope.benchmark.datasetId = 'different-dataset';
    }, /benchmark\.identity|semantic|schema/],
    ['checkpoint drift', (candidate) => {
      candidate.exactPrivateComputeScope.models[0].checkpointSha256 =
        `sha256:${'1'.repeat(64)}`;
    }, /privateScope\.models|semantic|schema/],
    ['runtime drift', (candidate) => {
      candidate.exactPrivateComputeScope.runtime.platform = 'linux/arm64';
    }, /privateScope\.runtime|semantic|schema/],
    ['request-budget drift', (candidate) => {
      candidate.exactPrivateComputeScope.requestBudget.totalMaximumRequests.value = 4045;
    }, /requestBudget|semantic|schema/],
    ['publication propagation', (candidate) => {
      candidate.rightsIndependence.aggregatePublicationRequested = true;
    }, /rightsIndependence|semantic|schema/],
    ['redistribution propagation', (candidate) => {
      candidate.requestSemantics.requestMayRedistributeRuntimeOrCheckpoints = true;
    }, /requestSemantics|semantic|schema/],
    ['score promotion', (candidate) => {
      candidate.effects.scorePromotionEligible = true;
    }, /effects|semantic|schema/],
  ])('rejects %s without opening any right', async (_label, change, expectedFailure) => {
    const candidate = structuredClone(request);
    change(candidate);
    const result = await validateRandomTpAuthorityRequestRepository(encode(candidate), {
      root,
      enforceCheckedInBytes: false,
    });

    expect(result.valid).toBe(false);
    expect(result.failures.join('\n')).toMatch(expectedFailure);
    expectDefaultDeny(result);
  });
