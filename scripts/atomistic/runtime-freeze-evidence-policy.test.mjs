import { execFile as execFileCallback } from 'node:child_process';
import {
  access,
  chmod,
  copyFile,
  link,
  lstat,
  mkdir,
  mkdtemp,
  open,
  readFile,
  realpath,
  rm,
  symlink,
  unlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { beforeAll, describe, expect, it } from 'vitest';
import { canonicalJsonBytes } from './runtime-input-contract.mjs';
import {
  EXPECTED_RUNTIME_FREEZE_GH_CLI,
  MINIMUM_SYSTEM_PATH,
  RUNTIME_FREEZE_GH_CHILD_PATH,
  RUNTIME_FREEZE_GH_PATH_ENV,
  RUNTIME_FREEZE_ATTESTATION_PATH,
  RUNTIME_FREEZE_EVIDENCE_DIRECTORY,
  RUNTIME_FREEZE_RECEIPT_PATH,
  RUNTIME_FREEZE_TRUSTED_ROOT_PATH,
  attestationVerificationArguments,
  inspectRuntimeFreezeReceiptBytes,
  parseSingleBundle,
  readExactEvidenceFiles,
  runPinnedGhOfflineVerifier,
  validateRawBundleProjection,
  validateRuntimeFreezeEvidence,
  validateRuntimeFreezeProjection,
  validateVerifierGitHistory,
  verifyAttestationOffline,
} from './runtime-freeze-evidence-policy.mjs';
import {
  RUNTIME_LOCK_PATH,
  parseJsonRejectingDuplicateMembers,
} from './runtime-lock-policy.mjs';

const execFile = promisify(execFileCallback);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const lock = parseJsonRejectingDuplicateMembers(await readFile(path.join(root, RUNTIME_LOCK_PATH)));
const receiptBytes = await readFile(path.join(root, RUNTIME_FREEZE_RECEIPT_PATH));
const bundleBytes = await readFile(path.join(root, RUNTIME_FREEZE_ATTESTATION_PATH));
const trustedRootBytes = await readFile(path.join(root, RUNTIME_FREEZE_TRUSTED_ROOT_PATH));
const bundle = parseSingleBundle(bundleBytes);
let verifiedGhOutput;
let integrationResult;

beforeAll(async () => {
  integrationResult = await validateRuntimeFreezeEvidence(lock, {
    root,
    runGh: async (args, options) => {
      verifiedGhOutput = await runPinnedGhOfflineVerifier(args, options);
      return verifiedGhOutput;
    },
  });
}, 30_000);

describe('externally attested runtime-freeze evidence', () => {
  it('accepts the exact receipt, V Git blobs/history, offline bundle, custom root, and lock projection', () => {
    expect(integrationResult.failures).toEqual([]);
    expect(integrationResult.ok).toBe(true);
    expect(Buffer.isBuffer(verifiedGhOutput)).toBe(true);
  });

  it('pins every lock projection and keeps OCI diagnostics outside the stable roots', () => {
    expect(validateRuntimeFreezeProjection(lock, integrationResult.receipt)).toEqual([]);
    const changes = [
      (candidate) => { candidate.freezeEvidence.verifier.workflow.gitBlobOid = '0'.repeat(40); },
      (candidate) => { candidate.freezeEvidence.sourceReceipt.semanticDigest = sha('1'); },
      (candidate) => { candidate.freezeEvidence.artifact.archiveDigest = sha('2'); },
      (candidate) => { candidate.freezeEvidence.attestation.attestationId += 1; },
      (candidate) => { candidate.freezeEvidence.attestation.rekorIntegratedTimeEpoch += 1; },
      (candidate) => { candidate.freezeEvidence.trustedRoot.nonAuthoritativeSnapshot = false; },
      (candidate) => { candidate.identities.runnerDigest = sha('3'); },
      (candidate) => { candidate.identities.ociImages.mattersim.configDigest = sha('4'); },
      (candidate) => { candidate.replication.observations[0].evidenceAttestedAt = '2026-08-30T06:17:18Z'; },
      (candidate) => { candidate.replication.observations[1].acceptanceReceiptRawDigest = sha('5'); },
    ];
    for (const [index, change] of changes.entries()) {
      const candidate = structuredClone(lock);
      change(candidate);
      expect(validateRuntimeFreezeProjection(candidate, integrationResult.receipt), `projection mutation ${index}`).not.toEqual([]);
    }
  });

  it('reuses the V receipt policy and rejects duplicate, escaped-duplicate, trailing, noncanonical, and semantic rewrites', () => {
    expect(inspectRuntimeFreezeReceiptBytes(receiptBytes).failures).toEqual([]);
    const text = receiptBytes.toString('utf8');
    const duplicate = Buffer.from(text.replace('{"bootstrapWorkflow":', '{"profile":"forged","bootstrapWorkflow":'));
    expect(inspectRuntimeFreezeReceiptBytes(duplicate).failures.join('\n')).toMatch(/duplicate JSON key "profile"/);
    const escapedDuplicate = Buffer.from(text.replace('{"bootstrapWorkflow":', '{"\\u0070rofile":"forged","bootstrapWorkflow":'));
    expect(inspectRuntimeFreezeReceiptBytes(escapedDuplicate).failures.join('\n')).toMatch(/duplicate JSON key "profile"/);
    expect(inspectRuntimeFreezeReceiptBytes(Buffer.from(`${text}\n`)).failures.join('\n')).toMatch(/digest|canonical JSON/);
    const receipt = JSON.parse(text);
    expect(inspectRuntimeFreezeReceiptBytes(Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`)).failures.join('\n')).toMatch(/digest|canonical JSON/);
    receipt.status = 'forged-stable-input-agreement';
    expect(inspectRuntimeFreezeReceiptBytes(canonicalJsonBytes(receipt)).failures.join('\n')).toMatch(/digest|status|contract/);
  });

  it('accepts Rekor v1 distinct global/shard-local indices and rejects index, proof, checkpoint, body, and SET tampering', () => {
    expect(lock.freezeEvidence.attestation.transparencyLog.globalLogIndex)
      .not.toBe(lock.freezeEvidence.attestation.transparencyLog.inclusionProofLogIndex);
    expect(validateRawBundleProjection(lock, bundle)).toEqual([]);
    const mutations = [
      (candidate) => { candidate.verificationMaterial.tlogEntries[0].logIndex = '2647884656'; },
      (candidate) => { candidate.verificationMaterial.tlogEntries[0].integratedTime = '1788070638'; },
      (candidate) => { candidate.verificationMaterial.tlogEntries[0].inclusionProof.logIndex = '2525980394'; },
      (candidate) => { candidate.verificationMaterial.tlogEntries[0].inclusionProof.logIndex = candidate.verificationMaterial.tlogEntries[0].inclusionProof.treeSize; },
      (candidate) => { candidate.verificationMaterial.tlogEntries[0].inclusionProof.treeSize = '2525980414'; },
      (candidate) => { candidate.verificationMaterial.tlogEntries[0].inclusionProof.rootHash = Buffer.alloc(32).toString('base64'); },
      (candidate) => { candidate.verificationMaterial.tlogEntries[0].inclusionProof.checkpoint.envelope = candidate.verificationMaterial.tlogEntries[0].inclusionProof.checkpoint.envelope.replace('\n2525980413\n', '\n2525980414\n'); },
      (candidate) => { candidate.verificationMaterial.tlogEntries[0].inclusionProof.checkpoint.envelope = candidate.verificationMaterial.tlogEntries[0].inclusionProof.checkpoint.envelope.replace('LxShnheCrgeQmKw8BGv8CEDGlrqFGM03YfxEgjA4XYM=', Buffer.alloc(32).toString('base64')); },
      (candidate) => { delete candidate.verificationMaterial.tlogEntries[0].inclusionPromise.signedEntryTimestamp; },
      (candidate) => { delete candidate.verificationMaterial.tlogEntries[0].canonicalizedBody; },
    ];
    for (const [index, change] of mutations.entries()) {
      const candidate = structuredClone(bundle);
      change(candidate);
      expect(validateRawBundleProjection(lock, candidate), `Rekor mutation ${index}`).not.toEqual([]);
    }
  });

  it('reads only exact regular, single-link evidence files beneath the canonical evidence directory', async () => {
    expect(Object.keys(await readExactEvidenceFiles(root)).sort()).toEqual(['attestation', 'receipt', 'trustedRoot']);
    const mutations = [
      async (temporaryRoot) => {
        const candidate = path.join(temporaryRoot, RUNTIME_FREEZE_TRUSTED_ROOT_PATH);
        await chmod(candidate, 0o644);
        const bytes = await readFile(candidate);
        bytes[0] ^= 1;
        await writeFile(candidate, bytes);
      },
      async (temporaryRoot) => {
        const candidate = path.join(temporaryRoot, RUNTIME_FREEZE_RECEIPT_PATH);
        await unlink(candidate);
        await symlink(path.join(root, RUNTIME_FREEZE_RECEIPT_PATH), candidate);
      },
      async (temporaryRoot) => {
        const candidate = path.join(temporaryRoot, RUNTIME_FREEZE_RECEIPT_PATH);
        const backing = path.join(temporaryRoot, RUNTIME_FREEZE_EVIDENCE_DIRECTORY, 'receipt-hardlink-backing.json');
        await unlink(candidate);
        await writeFile(backing, receiptBytes);
        await link(backing, candidate);
      },
    ];
    for (const [index, mutate] of mutations.entries()) {
      const temporaryRoot = await copyEvidenceFixture();
      try {
        await mutate(temporaryRoot);
        await expect(readExactEvidenceFiles(temporaryRoot), `evidence mutation ${index}`).rejects.toThrow(/digest|symlink|hard link/);
      } finally {
        await rm(temporaryRoot, { recursive: true, force: true });
      }
    }
  });

  it('forces Git replacement refs off, verifies V is the direct child of S and reads V blobs rather than the worktree', async () => {
    const environments = [];
    const passThrough = async (args, options) => {
      environments.push(options.env);
      return execFile('git', args, options);
    };
    expect(await validateVerifierGitHistory(root, passThrough)).toEqual([]);
    expect(environments.length).toBeGreaterThan(4);
    expect(environments.every((environment) => environment.GIT_NO_REPLACE_OBJECTS === '1')).toBe(true);
    expect(environments.every((environment) => environment.PATH === MINIMUM_SYSTEM_PATH)).toBe(true);
    expect(environments.every((environment) => !environment.PATH.includes('node_modules') && !environment.PATH.includes(root))).toBe(true);

    const forgedParent = async (args, options) => {
      const result = await execFile('git', args, options);
      if (args[0] === 'show' && args.includes('--format=%P')) return { ...result, stdout: Buffer.from(`${'f'.repeat(40)}\n`) };
      return result;
    };
    expect((await validateVerifierGitHistory(root, forgedParent)).join('\n')).toMatch(/verifierParents/);

    const disconnectedHead = async (args, options) => {
      if (args[0] === 'merge-base' && args[1] === '--is-ancestor') throw new Error('not an ancestor');
      return execFile('git', args, options);
    };
    expect((await validateVerifierGitHistory(root, disconnectedHead)).join('\n')).toMatch(/HEAD ancestor/);
  });

  it('invokes offline gh verification with all identity pins and accepts exactly one result', async () => {
    const expectedFlags = [
      '--repo', '--hostname', '--bundle', '--custom-trusted-root', '--cert-identity', '--cert-oidc-issuer',
      '--deny-self-hosted-runners', '--predicate-type', '--signer-digest', '--source-digest', '--source-ref', '--format',
    ];
    const args = attestationVerificationArguments(root);
    for (const flag of expectedFlags) expect(args).toContain(flag);
    expect(args.slice(args.indexOf('--hostname'), args.indexOf('--hostname') + 2))
      .toEqual(['--hostname', 'github.com']);
    expect(args).not.toContain('--signer-workflow');
    let called = 0;
    let temporaryStateRoot;
    const failures = await verifyAttestationOffline(root, lock, async (actualArgs, options) => {
      called += 1;
      expect(options.env.TZ).toBe('UTC');
      temporaryStateRoot = path.dirname(options.env.GH_CONFIG_DIR);
      expect(temporaryStateRoot.startsWith(path.join(tmpdir(), 'tf-gh-offline-'))).toBe(true);
      expect(options.cwd).toBe(temporaryStateRoot);
      expect(options.timeout).toBe(30_000);
      expect(options.killSignal).toBe('SIGKILL');
      expect(options.shell).toBe(false);
      expect(options.env.XDG_STATE_HOME).toBe(path.join(temporaryStateRoot, 'state'));
      expect(options.env.XDG_CACHE_HOME).toBe(path.join(temporaryStateRoot, 'cache'));
      expect(options.env.GH_CONFIG_DIR).toBe(path.join(temporaryStateRoot, 'config'));
      expect(temporaryStateRoot.startsWith(path.join(root, '.git'))).toBe(false);
      expect(Object.hasOwn(options.env, 'HOME')).toBe(false);
      expect(options.env.PATH).toBe(RUNTIME_FREEZE_GH_CHILD_PATH);
      expect(options.env.PATH).toBe('/usr/bin:/bin');
      expect(options.env.PATH).not.toContain('node_modules');
      expect(options.env.PATH).not.toContain(root);
      expect(options.env.GH_TELEMETRY).toBe('0');
      expect(options.env.HTTPS_PROXY).toBe('http://127.0.0.1:1');
      for (const name of [
        'GH_TOKEN', 'GITHUB_TOKEN', 'GH_HOST', 'GH_REPO', 'GH_PAGER',
        'PAGER', 'EDITOR', 'VISUAL',
      ]) expect(Object.hasOwn(options.env, name), name).toBe(false);

      const temporaryPaths = {
        receipt: actualArgs[2],
        attestation: actualArgs[actualArgs.indexOf('--bundle') + 1],
        trustedRoot: actualArgs[actualArgs.indexOf('--custom-trusted-root') + 1],
      };
      expect(actualArgs).toEqual(attestationVerificationArguments(root, temporaryPaths));
      const expectedBytes = { receipt: receiptBytes, attestation: bundleBytes, trustedRoot: trustedRootBytes };
      for (const [name, temporaryPath] of Object.entries(temporaryPaths)) {
        expect(path.dirname(temporaryPath)).toBe(path.join(temporaryStateRoot, 'evidence'));
        expect(temporaryPath.startsWith(root)).toBe(false);
        const metadata = await lstat(temporaryPath);
        expect(metadata.isFile()).toBe(true);
        expect(metadata.nlink).toBe(1);
        expect(metadata.mode & 0o777).toBe(0o400);
        expect(await readFile(temporaryPath)).toEqual(expectedBytes[name]);
      }
      const stateMetadata = await lstat(temporaryStateRoot);
      expect(stateMetadata.isDirectory()).toBe(true);
      expect(stateMetadata.mode & 0o777).toBe(0o700);
      await mkdir(options.env.XDG_STATE_HOME, { recursive: true });
      await writeFile(path.join(options.env.XDG_STATE_HOME, 'cleanup-sentinel'), 'owned temporary state\n');
      return verifiedGhOutput;
    });
    expect(called).toBe(1);
    expect(failures).toEqual([]);
    await expect(access(temporaryStateRoot)).rejects.toThrow();
  });

  it('executes only the fixed absolute digest-pinned gh copy and ignores PATH decoys', async () => {
    expect(EXPECTED_RUNTIME_FREEZE_GH_CLI).toEqual({
      version: '2.98.0',
      releasedAt: '2026-08-20',
      releaseUrl: 'https://github.com/cli/cli/releases/tag/v2.98.0',
      releaseTagCommit: 'a255baf71d13fe5947a4eb7ad521ffd412d64cee',
      checksums: {
        url: 'https://github.com/cli/cli/releases/download/v2.98.0/gh_2.98.0_checksums.txt',
        sizeBytes: 1_950,
        sha256: 'sha256:275b90ae8a642fb8bdf4f21d7673e34643a445f7993f1821ac917ff8a2cc4db9',
      },
      platforms: {
        'darwin-arm64': {
          defaultPath: null,
          archiveName: 'gh_2.98.0_macOS_arm64.zip',
          archiveSha256: 'sha256:8cfb027cc5310675f2b830eac8f9865c1155a45ffcf9757f699fdd5a22046ca4',
          executableSizeBytes: 39_256_176,
          executableSha256: 'sha256:eedbfd5b8071027fe6326826eded48d274f1ec9d93f9239d9ba778ea1f479ac9',
        },
        'linux-x64': {
          defaultPath: '/usr/bin/gh',
          archiveName: 'gh_2.98.0_linux_amd64.deb',
          archiveSha256: 'sha256:f65a3fa2fa0eb2e97c445ee3f5e087a40aae03b64847f45a8f13805e504535d6',
          executableSizeBytes: 41_377_954,
          executableSha256: 'sha256:62885b97de6a0cd85e616cdd94bcda908bf5cf1018094385892b05cea3537163',
        },
      },
    });
    const platformKey = `${process.platform}-${process.arch}`;
    const platformLock = EXPECTED_RUNTIME_FREEZE_GH_CLI.platforms[platformKey];
    expect(platformLock).toBeDefined();
    expect(platformLock.executableSha256).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(platformLock.archiveSha256).toMatch(/^sha256:[0-9a-f]{64}$/);

    const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'tf-gh-path-decoy-'));
    const decoy = path.join(temporaryRoot, 'gh');
    const previousPath = process.env.PATH;
    try {
      await writeFile(decoy, '#!/bin/sh\nexit 89\n');
      await chmod(decoy, 0o700);
      process.env.PATH = temporaryRoot;
      const result = await validateRuntimeFreezeEvidence(lock, { root });
      expect(result.failures).toEqual([]);
      expect(result.ok).toBe(true);
    } finally {
      if (previousPath === undefined) delete process.env.PATH;
      else process.env.PATH = previousPath;
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('rejects a same-size wrong gh binary before execution', async () => {
    const platformKey = `${process.platform}-${process.arch}`;
    const configuredPath = process.env[RUNTIME_FREEZE_GH_PATH_ENV]
      ?? EXPECTED_RUNTIME_FREEZE_GH_CLI.platforms[platformKey]?.defaultPath;
    expect(path.isAbsolute(configuredPath)).toBe(true);
    const temporaryRoot = await mkdtemp(path.join(await realpath(tmpdir()), 'tf-gh-wrong-binary-'));
    const wrongPath = path.join(temporaryRoot, 'gh');
    try {
      await copyFile(configuredPath, wrongPath);
      await chmod(wrongPath, 0o755);
      const handle = await open(wrongPath, 'r+');
      try {
        const firstByte = Buffer.alloc(1);
        expect((await handle.read(firstByte, 0, 1, 0)).bytesRead).toBe(1);
        firstByte[0] ^= 1;
        expect((await handle.write(firstByte, 0, 1, 0)).bytesWritten).toBe(1);
        await handle.sync();
      } finally {
        await handle.close();
      }
      const failures = await verifyAttestationOffline(root, lock, (args, options) => (
        runPinnedGhOfflineVerifier(args, options, wrongPath)
      ));
      expect(failures.join('\n')).toMatch(/offline gh verification failed.*digest differs from the exact platform lock/);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('rejects relative, wrong-mode, symlinked, symlink-ancestor, and hard-linked gh locators', async () => {
    const platformKey = `${process.platform}-${process.arch}`;
    const configuredPath = process.env[RUNTIME_FREEZE_GH_PATH_ENV]
      ?? EXPECTED_RUNTIME_FREEZE_GH_CLI.platforms[platformKey]?.defaultPath;
    expect(path.isAbsolute(configuredPath)).toBe(true);
    const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'tf-gh-locator-negative-'));
    const finalSymlink = path.join(temporaryRoot, 'gh-symlink');
    const directorySymlink = path.join(temporaryRoot, 'bin-link');
    const wrongMode = path.join(temporaryRoot, 'gh-wrong-mode');
    const hardLinkBacking = path.join(temporaryRoot, 'gh-backing');
    const hardLink = path.join(temporaryRoot, 'gh-hardlink');
    try {
      await symlink(configuredPath, finalSymlink);
      await symlink(path.dirname(configuredPath), directorySymlink);
      await copyFile(configuredPath, wrongMode);
      await chmod(wrongMode, 0o700);
      await copyFile(configuredPath, hardLinkBacking);
      await chmod(hardLinkBacking, 0o755);
      await link(hardLinkBacking, hardLink);
      const cases = [
        ['relative', 'gh', /normalized absolute path/],
        ['wrong mode', wrongMode, /regular single-link executable/],
        ['final symlink', finalSymlink, /regular single-link executable/],
        [
          'symlink ancestor',
          path.join(directorySymlink, path.basename(configuredPath)),
          /canonical and contain no symlink locator/,
        ],
        ['hard link', hardLink, /regular single-link executable/],
      ];
      for (const [label, candidatePath, expectedFailure] of cases) {
        const failures = await verifyAttestationOffline(root, lock, (args, options) => (
          runPinnedGhOfflineVerifier(args, options, candidatePath)
        ));
        expect(failures.join('\n'), label).toMatch(expectedFailure);
      }
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('rejects non-byte injected verifier outputs instead of unwrapping command objects', async () => {
    for (const [index, output] of [
      null,
      2,
      {},
      { stdout: verifiedGhOutput },
      [verifiedGhOutput],
    ].entries()) {
      const failures = await verifyAttestationOffline(root, lock, async () => output);
      expect(failures.join('\n'), `non-byte verifier output ${index}`)
        .toMatch(/offline gh verification failed.*must be bytes or a string/);
    }
  });

  it('accepts only the three explicit byte/string verifier output representations', async () => {
    for (const output of [
      verifiedGhOutput,
      new Uint8Array(verifiedGhOutput),
      verifiedGhOutput.toString('utf8'),
    ]) {
      expect(await verifyAttestationOffline(root, lock, async () => output)).toEqual([]);
    }
  });

  it('snapshots an injected Uint8Array before its caller can mutate the backing bytes', async () => {
    const transient = new Uint8Array(verifiedGhOutput);
    let mutated = false;
    const verification = verifyAttestationOffline(root, lock, async () => {
      setTimeout(() => {
        transient.fill(0);
        mutated = true;
      }, 0);
      return transient;
    });
    expect(await verification).toEqual([]);
    expect(mutated).toBe(true);
  });

  it('fails closed if gh-time code mutates or truncates a private snapshot and always removes its root', async () => {
    const mutations = [
      async (receiptPath) => {
        const bytes = await readFile(receiptPath);
        bytes[0] ^= 1;
        await writeFile(receiptPath, bytes);
      },
      async (receiptPath) => {
        const bytes = await readFile(receiptPath);
        await writeFile(receiptPath, bytes.subarray(0, bytes.length - 1));
      },
    ];
    for (const [index, mutate] of mutations.entries()) {
      let temporaryStateRoot;
      const failures = await verifyAttestationOffline(root, lock, async (args, options) => {
        temporaryStateRoot = path.dirname(options.env.GH_CONFIG_DIR);
        const receiptPath = args[2];
        await chmod(receiptPath, 0o600);
        await mutate(receiptPath);
        await chmod(receiptPath, 0o400);
        return verifiedGhOutput;
      });
      expect(failures.join('\n'), `temporary snapshot mutation ${index}`).toMatch(/offline gh verification failed.*temporary snapshot (?:digest|size) changed/);
      await expect(access(temporaryStateRoot)).rejects.toThrow();
    }
  });

  it('direct offline verification cannot bypass changed worktree evidence with caller-supplied bytes', async () => {
    const temporaryRoot = await copyEvidenceFixture();
    let called = 0;
    try {
      const callerSuppliedSnapshot = await readExactEvidenceFiles(temporaryRoot);
      const trustedRootPath = path.join(temporaryRoot, RUNTIME_FREEZE_TRUSTED_ROOT_PATH);
      const bytes = await readFile(trustedRootPath);
      bytes[0] ^= 1;
      await chmod(trustedRootPath, 0o600);
      await writeFile(trustedRootPath, bytes);
      const failures = await verifyAttestationOffline(temporaryRoot, lock, async () => {
        called += 1;
        return verifiedGhOutput;
      }, callerSuppliedSnapshot);
      expect(called).toBe(0);
      expect(failures.join('\n')).toMatch(/exact evidence validation failed.*byte digest mismatch/);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('top-level validation gives gh the initially verified bytes even if the worktree changes before gh runs', async () => {
    const temporaryRoot = await copyEvidenceFixture();
    let worktreeChanged = false;
    try {
      const result = await validateRuntimeFreezeEvidence(lock, {
        root: temporaryRoot,
        runGit: async (args, options) => {
          if (!worktreeChanged) {
            worktreeChanged = true;
            const worktreeReceipt = path.join(temporaryRoot, RUNTIME_FREEZE_RECEIPT_PATH);
            const bytes = await readFile(worktreeReceipt);
            bytes[0] ^= 1;
            await chmod(worktreeReceipt, 0o600);
            await writeFile(worktreeReceipt, bytes);
          }
          return execFile('git', args, { ...options, cwd: root });
        },
        runGh: async (args) => {
          expect(worktreeChanged).toBe(true);
          expect(await readFile(args[2])).toEqual(receiptBytes);
          expect(args[2].startsWith(temporaryRoot)).toBe(false);
          return verifiedGhOutput;
        },
      });
      expect(result.failures).toEqual([]);
      expect(result.ok).toBe(true);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('cleans its unique gh state root when offline verification fails', async () => {
    let temporaryStateRoot;
    const failures = await verifyAttestationOffline(root, lock, async (_args, options) => {
      temporaryStateRoot = path.dirname(options.env.GH_CONFIG_DIR);
      await mkdir(options.env.XDG_CACHE_HOME, { recursive: true });
      await writeFile(path.join(options.env.XDG_CACHE_HOME, 'failure-sentinel'), 'owned temporary cache\n');
      throw new Error('injected gh failure');
    });
    expect(failures.join('\n')).toMatch(/offline gh verification failed.*injected gh failure/);
    await expect(access(temporaryStateRoot)).rejects.toThrow();
  });

  it('rejects wrapper, bundle, media type, certificate, subject, predicate, runner, invocation, and tlog-time drift', async () => {
    const verified = JSON.parse(verifiedGhOutput.toString('utf8'));
    const mutations = [
      (candidate) => { candidate.splice(0); },
      (candidate) => { candidate.push(structuredClone(candidate[0])); },
      (candidate) => { candidate[0].unexpected = false; },
      (candidate) => { candidate[0].attestation.unexpected = false; },
      (candidate) => { candidate[0].attestation.bundle_url = 'https://example.invalid/bundle'; },
      (candidate) => { candidate[0].attestation.initiator = 'forged'; },
      (candidate) => { candidate[0].attestation.bundle.mediaType = 'application/example'; },
      (candidate) => { candidate[0].verificationResult.unexpected = false; },
      (candidate) => { candidate[0].verificationResult.mediaType = 'application/example'; },
      (candidate) => { candidate[0].verificationResult.signature.certificate.githubWorkflowSHA = 'f'.repeat(40); },
      (candidate) => { candidate[0].verificationResult.signature.certificate.subjectAlternativeName = 'https://example.invalid/forged'; },
      (candidate) => { candidate[0].verificationResult.statement.subject[0].digest.sha256 = '0'.repeat(64); },
      (candidate) => { candidate[0].verificationResult.statement.predicateType = 'https://example.invalid/predicate'; },
      (candidate) => { candidate[0].verificationResult.statement.predicate.buildDefinition.internalParameters.github.runner_environment = 'self-hosted'; },
      (candidate) => { candidate[0].verificationResult.statement.predicate.runDetails.metadata.invocationId = 'https://example.invalid/run'; },
      (candidate) => { candidate[0].verificationResult.verifiedTimestamps[0].timestamp = '2026-08-30T06:17:18Z'; },
    ];
    for (const [index, mutate] of mutations.entries()) {
      const candidate = structuredClone(verified);
      mutate(candidate);
      const failures = await verifyAttestationOffline(root, lock, async () => Buffer.from(JSON.stringify(candidate)));
      expect(failures, `gh result mutation ${index}`).not.toEqual([]);
    }
  });
});

async function copyEvidenceFixture() {
  const temporaryRoot = await mkdtemp(path.join(tmpdir(), 'tf-runtime-freeze-evidence-'));
  const destinationDirectory = path.join(temporaryRoot, RUNTIME_FREEZE_EVIDENCE_DIRECTORY);
  await mkdir(destinationDirectory, { recursive: true });
  for (const relativePath of [RUNTIME_FREEZE_RECEIPT_PATH, RUNTIME_FREEZE_ATTESTATION_PATH, RUNTIME_FREEZE_TRUSTED_ROOT_PATH]) {
    await copyFile(path.join(root, relativePath), path.join(temporaryRoot, relativePath));
  }
  return temporaryRoot;
}

function sha(character) {
  return `sha256:${character.repeat(64)}`;
}
