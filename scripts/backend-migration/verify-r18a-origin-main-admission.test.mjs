import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chmodSync, copyFileSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ADMISSION_LEDGER_PATH,
  ADMISSION_SCHEMA_PATH,
  ALLOWED_REVIEW_OUTPUTS,
  EXPECTED_ADMISSION_LEDGER_RAW_DIGEST,
  EXPECTED_ADMISSION_SCHEMA_RAW_DIGEST,
  R12_EXCLUDED_PATHS,
  captureCurrentInventory,
  inspectAdmissionBytes,
  validateAdmissionSchema,
  validateAdmissionSemantics,
  validateCurrentInventory,
  validateLegacyOnlyFilesystemAbsence,
  verifyAdmissionAtRoot,
} from './verify-r18a-origin-main-admission.mjs';

const root = process.cwd();
const ledgerBytes = readFileSync(ADMISSION_LEDGER_PATH);
const schemaBytes = readFileSync(ADMISSION_SCHEMA_PATH);
const ledger = JSON.parse(ledgerBytes);
const schema = JSON.parse(schemaBytes);
const currentInventory = captureCurrentInventory(root);
const cloneLedger = () => structuredClone(ledger);
const digestHex = (bytes) => createHash('sha256').update(bytes).digest('hex');
const semanticFailures = (mutate) => {
  const candidate = cloneLedger();
  mutate(candidate);
  return [
    ...validateAdmissionSchema(candidate, schema),
    ...validateAdmissionSemantics(candidate),
  ].join('\n');
};
const entry = (candidate, entryPath) => candidate.entries.find((item) => item.path === entryPath);

describe('backend migration admission v0.1', () => {
  it('rejects an empty inventory and an actual Git tree missing its trusted source inventory', () => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'tf-admission-empty-git-'));
    try {
      execFileSync('/usr/bin/git', ['init', '--quiet', temporaryRoot], { stdio: 'ignore' });
      writeFileSync(path.join(temporaryRoot, '.git/info/exclude'), '*\n');
      for (const [relativePath, bytes] of [[ADMISSION_LEDGER_PATH, ledgerBytes], [ADMISSION_SCHEMA_PATH, schemaBytes]]) {
        const destination = path.join(temporaryRoot, relativePath);
        mkdirSync(path.dirname(destination), { recursive: true });
        writeFileSync(destination, bytes);
      }
      expect(validateCurrentInventory(ledger, []).join('\n'))
        .toContain('admission.currentInventory.main-path-missing: README.md');
      const result = verifyAdmissionAtRoot(temporaryRoot);
      expect(result).toMatchObject({ status: 'fail-closed', releaseEligible: false, currentPathCount: 0 });
      expect(result.failures.join('\n')).toContain('admission.currentInventory.main-path-missing: README.md');
      expect(result.failures.join('\n')).toContain(`admission.currentInventory.required-control-missing: ${ADMISSION_LEDGER_PATH}`);
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('does not let repository-local or unregistered nested ignore rules hide new sources', () => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'tf-admission-ignore-authority-'));
    try {
      execFileSync('/usr/bin/git', ['init', '--quiet', temporaryRoot], { stdio: 'ignore' });
      for (const record of currentInventory) {
        const destination = path.join(temporaryRoot, record.path);
        mkdirSync(path.dirname(destination), { recursive: true });
        copyFileSync(path.join(root, record.path), destination);
        chmodSync(destination, record.mode);
      }
      execFileSync('/usr/bin/git', ['-C', temporaryRoot, 'add', '--force', '--all'], { stdio: 'ignore' });
      expect(verifyAdmissionAtRoot(temporaryRoot)).toMatchObject({ status: 'pass-preparation-only', failures: [] });

      // Bound main rules still exclude ordinary untracked dependencies.
      mkdirSync(path.join(temporaryRoot, 'node_modules'), { recursive: true });
      writeFileSync(path.join(temporaryRoot, 'node_modules/synthetic.txt'), 'synthetic dependency');
      expect(verifyAdmissionAtRoot(temporaryRoot)).toMatchObject({ status: 'pass-preparation-only', failures: [] });

      const unaccountedPath = 'lib/knowledge/unaccounted-ignore-fixture.ts';
      mkdirSync(path.dirname(path.join(temporaryRoot, unaccountedPath)), { recursive: true });
      writeFileSync(path.join(temporaryRoot, unaccountedPath), '// synthetic test source only\n');
      const expectedFailure = `admission.currentInventory.unaccounted-source: ${unaccountedPath}`;
      expect(verifyAdmissionAtRoot(temporaryRoot).failures.join('\n')).toContain(expectedFailure);

      writeFileSync(path.join(temporaryRoot, '.git/info/exclude'), `${unaccountedPath}\n`);
      expect(verifyAdmissionAtRoot(temporaryRoot).failures.join('\n')).toContain(expectedFailure);

      writeFileSync(path.join(temporaryRoot, 'lib/knowledge/.gitignore'), '*\n');
      const nestedResult = verifyAdmissionAtRoot(temporaryRoot);
      expect(nestedResult).toMatchObject({ status: 'fail-closed', releaseEligible: false });
      expect(nestedResult.failures.join('\n')).toContain(expectedFailure);
      expect(nestedResult.failures.join('\n'))
        .toContain('admission.currentInventory.unaccounted-source: lib/knowledge/.gitignore');

      writeFileSync(path.join(temporaryRoot, '.gitignore'), '*\n');
      expect(verifyAdmissionAtRoot(temporaryRoot).failures.join('\n'))
        .toContain('main root .gitignore identity differs');
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('retains a capture failure and does not mistake it for an empty valid inventory', () => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'tf-admission-no-git-'));
    try {
      for (const [relativePath, bytes] of [[ADMISSION_LEDGER_PATH, ledgerBytes], [ADMISSION_SCHEMA_PATH, schemaBytes]]) {
        const destination = path.join(temporaryRoot, relativePath);
        mkdirSync(path.dirname(destination), { recursive: true });
        writeFileSync(destination, bytes);
      }
      const result = verifyAdmissionAtRoot(temporaryRoot);
      expect(result).toMatchObject({ status: 'fail-closed', releaseEligible: false, currentPathCount: 0 });
      expect(result.failures.join('\n')).toContain('admission.currentInventory: capture failed');
      expect(result.failures.join('\n')).toContain('admission.currentInventory.main-path-missing: README.md');
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('validates the frozen ledger, schema and actual preparation tree while remaining release-ineligible', () => {
    const result = verifyAdmissionAtRoot(root);
    expect(result).toMatchObject({
      status: 'pass-preparation-only',
      releaseEligible: false,
      ledgerRawDigest: EXPECTED_ADMISSION_LEDGER_RAW_DIGEST,
      schemaRawDigest: EXPECTED_ADMISSION_SCHEMA_RAW_DIGEST,
      currentPathCount: currentInventory.length,
      failures: [],
    });
    expect(currentInventory.length).toBeGreaterThanOrEqual(455);
    expect(currentInventory.length).toBeLessThanOrEqual(460);
    expect(ledger.claimBoundary).toMatchObject({
      inventoryComplete: true,
      migrationComplete: false,
      rightsCleared: false,
      scientificallyValidated: false,
      releaseEligible: false,
      deploymentEligible: false,
      industrialAuthority: false,
      causalEffectIdentified: false,
    });
  });

  it('pins both raw files and rejects a byte-only ledger rewrite', () => {
    expect(digestHex(ledgerBytes)).toBe(EXPECTED_ADMISSION_LEDGER_RAW_DIGEST.slice('sha256:'.length));
    expect(digestHex(schemaBytes)).toBe(EXPECTED_ADMISSION_SCHEMA_RAW_DIGEST.slice('sha256:'.length));
    const rewritten = Buffer.from(`${ledgerBytes.toString('utf8').trimEnd()}  \n`, 'utf8');
    expect(inspectAdmissionBytes(rewritten, schemaBytes).failures.join('\n')).toMatch(/frozen ledger byte digest mismatch/);
  });

  it('rejects duplicate decoded JSON members before schema or semantic validation', () => {
    const text = ledgerBytes.toString('utf8');
    const duplicate = Buffer.from(text.replace(
      '"schemaVersion": "tf.backend-migration-admission/0.1",',
      '"schemaVersion": "tf.backend-migration-admission/0.1",\n  "\\u0073chemaVersion": "tf.backend-migration-admission/0.1",',
    ));
    expect(inspectAdmissionBytes(duplicate, schemaBytes).failures.join('\n')).toMatch(/duplicate JSON key "schemaVersion"/);
  });

  it('rejects a missing entry and the forged completeness counts it causes', () => {
    const failures = semanticFailures((candidate) => { candidate.entries.pop(); });
    expect(failures).toMatch(/must NOT have fewer than 939 items|expected 939 entries/);
    expect(failures).toMatch(/observedCounts|pathCount|identityDigest/);
  });

  it('rejects duplicate paths even when the array length remains 939', () => {
    const failures = semanticFailures((candidate) => { candidate.entries[1] = structuredClone(candidate.entries[0]); });
    expect(failures).toMatch(/duplicate path/);
    expect(failures).toMatch(/identityDigest|observedCounts/);
  });

  it('rejects changed content identities and modes', () => {
    const shaFailures = semanticFailures((candidate) => {
      entry(candidate, 'README.md').mainIdentity.sha256 = '0'.repeat(64);
    });
    expect(shaFailures).toMatch(/main.identityDigest/);
    const modeFailures = semanticFailures((candidate) => {
      entry(candidate, 'README.md').mainIdentity.mode = 0o600;
    });
    expect(modeFailures).toMatch(/main.identityDigest/);
  });

  it('rejects unknown dispositions rather than treating them as implicitly safe', () => {
    const failures = semanticFailures((candidate) => {
      entry(candidate, 'README.md').disposition = 'implicitly-safe';
    });
    expect(failures).toMatch(/must be equal to one of the allowed values|disposition/);
  });

  it('keeps all nine R12 paths absent, rights-unresolved, unlicensed and not passed', () => {
    expect(ledger.r12Exclusion).toEqual({
      roundId: 'R12',
      rightsStatus: 'unresolved',
      payloadPresent: false,
      licensed: false,
      releasePass: false,
      paths: R12_EXCLUDED_PATHS,
    });
    for (const excludedPath of R12_EXCLUDED_PATHS) {
      expect(entry(ledger, excludedPath)).toMatchObject({
        relation: 'legacy-only',
        disposition: 'excluded-r12-redistribution-unresolved',
        migrationStatus: 'excluded-rights-unresolved',
        rightsStatus: 'unresolved',
        payloadPresent: false,
        scientificCapabilityAdmitted: false,
      });
      expect(currentInventory.some((record) => record.path === excludedPath)).toBe(false);
    }
  });

  it('rejects R12 inclusion and excluded-to-licensed mutations', () => {
    const inclusion = semanticFailures((candidate) => {
      candidate.r12Exclusion.payloadPresent = true;
      entry(candidate, R12_EXCLUDED_PATHS[0]).payloadPresent = true;
    });
    expect(inclusion).toMatch(/r12Exclusion|payloadPresent/);
    const licensed = semanticFailures((candidate) => { candidate.r12Exclusion.licensed = true; });
    expect(licensed).toMatch(/r12Exclusion|licensed/);
  });

  it('rejects a pending-to-admitted scientific-capability mutation', () => {
    const failures = semanticFailures((candidate) => {
      const pending = candidate.entries.find((item) => item.disposition === 'pending-not-admitted');
      pending.scientificCapabilityAdmitted = true;
      candidate.counts.scientificCapabilitiesAdmitted = 1;
    });
    expect(failures).toMatch(/scientificCapabilityAdmitted|pending inventory cannot admit/);
    expect(failures).toMatch(/scientificCapabilitiesAdmitted/);
  });

  it('rejects an unaccounted source and does not exempt the review directory by prefix', () => {
    const unexpected = [...currentInventory, {
      path: 'lib/knowledge/unaccounted-backend.ts', mode: 0o644, size: 9, sha256: digestHex('synthetic'),
    }];
    expect(validateCurrentInventory(ledger, unexpected).join('\n')).toMatch(/unaccounted-source: lib\/knowledge\/unaccounted-backend\.ts/);
    const broadReviewEscape = [...currentInventory, {
      path: 'evaluation/reviews/unlisted-payload.json', mode: 0o644, size: 9, sha256: digestHex('synthetic'),
    }];
    expect(validateCurrentInventory(ledger, broadReviewEscape).join('\n')).toMatch(/unaccounted-source: evaluation\/reviews\/unlisted-payload\.json/);
  });

  it('rejects a renamed excluded payload by digest using only a synthetic test identity', () => {
    const candidate = cloneLedger();
    const syntheticBytes = Buffer.from('synthetic-excluded-payload-for-test-only', 'utf8');
    const syntheticDigest = digestHex(syntheticBytes);
    entry(candidate, R12_EXCLUDED_PATHS[0]).legacyIdentity.sha256 = syntheticDigest;
    const allowedReviewPath = ALLOWED_REVIEW_OUTPUTS[0];
    const renamed = [...currentInventory.filter((record) => record.path !== allowedReviewPath), {
      path: allowedReviewPath,
      mode: 0o644,
      size: syntheticBytes.length,
      sha256: syntheticDigest,
    }];
    expect(validateCurrentInventory(candidate, renamed).join('\n')).toMatch(/renamed-excluded-payload: evaluation\/reviews\/2026-09-07-backend-migration-admission-v0\.1-builder-gates\.json/);
  });

  it('detects ignored or otherwise unenumerated legacy-only payloads directly on the filesystem', () => {
    const temporaryRoot = mkdtempSync(path.join(tmpdir(), 'tf-admission-filesystem-'));
    try {
      const excludedPath = R12_EXCLUDED_PATHS[0];
      const destination = path.join(temporaryRoot, excludedPath);
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, 'synthetic excluded fixture only');
      expect(validateLegacyOnlyFilesystemAbsence(temporaryRoot, ledger).join('\n'))
        .toMatch(/legacy-only-payload-present: evaluation\/gas-kinetics\/fixtures\/hwang-so2-mechanism-catalog\.json/);
    } finally {
      rmSync(temporaryRoot, { force: true, recursive: true });
    }
  });

  it('rejects preserved-main drift including latest-main frontend bytes', () => {
    const mutated = currentInventory.map((record) => record.path === 'app/page.tsx'
      ? { ...record, sha256: 'f'.repeat(64) }
      : record);
    expect(validateCurrentInventory(ledger, mutated).join('\n')).toMatch(/main-identity-drift: app\/page\.tsx/);
  });

  it('keeps the R18a .gitignore conflict and historical approval non-transfer explicit', () => {
    expect(entry(ledger, '.gitignore')).toMatchObject({ relation: 'conflicting', disposition: 'main-preserved-conflict' });
    expect(ledger.historicalIdentity).toMatchObject({
      fileCount: 17,
      integrationStatus: 'historical-only-not-reproduced-at-origin-main-root',
      transferredApproval: false,
      conflictingPath: '.gitignore',
    });
    const failures = semanticFailures((candidate) => { candidate.historicalIdentity.transferredApproval = true; });
    expect(failures).toMatch(/historicalIdentity|transferredApproval/);
  });

  it('rejects forged inventory roots even if the top-level complete flag stays true', () => {
    const failures = semanticFailures((candidate) => {
      candidate.roots.legacy.identityDigest = `sha256:${'0'.repeat(64)}`;
      candidate.roots.main.pathCount = 450;
    });
    expect(failures).toMatch(/admission.roots|legacy.identityDigest|main.pathCount/);
  });

  it('rejects any attempt to turn preparation status into release eligibility', () => {
    const failures = semanticFailures((candidate) => {
      candidate.claimBoundary.releaseEligible = true;
      candidate.claimBoundary.migrationComplete = true;
    });
    expect(failures).toMatch(/claimBoundary/);
  });
});
