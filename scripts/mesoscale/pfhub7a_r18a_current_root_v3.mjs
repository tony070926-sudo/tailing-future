#!/usr/bin/env node
// Versioned integration evidence; historical runner and numerical sources stay unchanged.
import { createHash } from 'node:crypto';
import { chmodSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { parseR16cJsonBytes } from './r16c_json_integrity.mjs';
import { NUMERICAL_BUDGET_MS, STOP_GRACE_MS, createExecutionBudget, regularBytes, verifyBootstrap, verifyWheels, assertCompleteCorpus, requireSuccessfulCommand, runBoundedCommand } from './pfhub7a_r18a_current_root.mjs';
import { verifyAdmissionAtRoot, INTEGRATION_BASE, SCIENTIFIC_CONTRACT_BASE } from '../backend-migration/verify-r18a-wrangler-admission-v0.4.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function requireCondition(condition, code) { if (!condition) throw new Error(code); }
export function requireCurrentAdmission(root) {
  const result = verifyAdmissionAtRoot(root);
  requireCondition(result.status === 'pass-portable-source-admission' && result.integrationBaseCommit === INTEGRATION_BASE && result.scientificContractBaseCommit === SCIENTIFIC_CONTRACT_BASE && result.sourceInputIdentity?.sha256 && result.sourceInputIdentity?.gitTreeOid && result.candidateTreeIdentity?.sha256, 'CURRENT_ADMISSION_FAILED:' + JSON.stringify(result.failures));
  return result;
}
export function requireUnchangedCandidate(before, after) {
  requireCondition([before, after].every(result => result.status === 'pass-portable-source-admission' && result.integrationBaseCommit === INTEGRATION_BASE && result.scientificContractBaseCommit === SCIENTIFIC_CONTRACT_BASE && result.sourceInputIdentity?.sha256 && result.sourceInputIdentity?.gitTreeOid && result.candidateTreeIdentity?.sha256) && isDeepStrictEqual(before.sourceInputIdentity, after.sourceInputIdentity), 'CANDIDATE_CHANGED_DURING_RUN');
  return { observedTreeUnchanged: isDeepStrictEqual(before.candidateTreeIdentity, after.candidateTreeIdentity) };
}
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LOCK_PATH = 'evaluation/mesoscale/dependencies/pfhub7a-r18a-fipy/runtime-lock-v1.json';
const LOCK_HASH = 'cd7f8e8a47d67596c025a8035890e99f5a367be562289e84ae4f6d87e79c08ee';
const RECEIPT_HASH = 'd91e31d261bf77f99b17e810f5f51aab131dd5339e281839933e45fa79855e5c';
const SOURCE_HASHES = {
  'scripts/mesoscale/pfhub7a_r18a_supervise_v3.py': '8d7f001b9cd2d865f62a4ce7ba9b70040b6544eeb7847f0afdcb2eaa66ca61af',
  'scripts/mesoscale/pfhub7a_r18a_worker.py': '3ad9a7c9d7ef6c968042acd7c365c2ef2e3ed049ecdb531240aa1d527f03568f',
  'scripts/mesoscale/pfhub7a_r18a_oracle.py': '32bf106747aa04015c91fea4ae9293961325f7d217b2a8560ab6d3a0c1656539',
  'scripts/mesoscale/pfhub7a_r18a_preflight_v3_test.py': '39d74e28460d45b39655754be2ec9328d41d6952f443cbf433117daa387542b3',
  'scripts/mesoscale/pfhub7a_r18a_schema_gate_v3.mjs': '0d5c9e6f877202b03c1dfa4ef0e089a295ee4b90ce734d2850f0725c97f85946',
  'scripts/mesoscale/pfhub7a_r18a_schema_gate_v3.node-test.mjs': '4eb343ea1dbd1a35bb7178f84eff6532ea25c57018dad06173ee608d422294e6',
};

function parseArguments(args) {
  const result = {};
  requireCondition(args.length === 4, 'USAGE: --python-source ABSOLUTE_ROOT --wheelhouse ABSOLUTE_DIRECTORY');
  for (let index = 0; index < args.length; index += 2) {
    requireCondition(['--python-source', '--wheelhouse'].includes(args[index]) && !result[args[index]] && args[index + 1], 'ARGUMENTS_INVALID');
    result[args[index]] = args[index + 1];
  }
  requireCondition(result['--python-source'] && result['--wheelhouse'], 'INPUTS_REQUIRED');
  return result;
}

export function persistExecutionEvidence(evidence, runDirectory) {
  if (!runDirectory) return evidence;
  evidence.evidencePath = path.join(runDirectory, 'execution.json');
  evidence.evidencePersisted = true;
  try { writeFileSync(evidence.evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx', mode: 0o600 }); }
  catch (error) {
    if (evidence.reason) evidence.priorReason = evidence.reason;
    evidence.status = 'abstain';
    evidence.evidencePersisted = false;
    evidence.reason = `EVIDENCE_PERSISTENCE_FAILED:${error instanceof Error ? error.message : String(error)}`;
  }
  return evidence;
}

export async function runCurrentRoot(args) {
  const started = Date.now();
  const budget = createExecutionBudget(NUMERICAL_BUDGET_MS);
  const evidence = { schemaVersion: 'tf.r18a-current-root-execution/0.4', scientificContractBaseCommit: '307e6d723086fe41b6d89e9f9b4b532364ccaeff', integrationBaseCommit: null, candidateTreeIdentity: null, sourceInputIdentity: null, startedAt: new Date(started).toISOString(), status: 'abstain', releaseEligible: false, historicalCandidateIdentityTransferred: false, convergenceVerified: false, physicalValidation: false, reproduced: false, scientificPromotionEligible: false, commands: [] };
  let runDirectory;
  try {
    budget.assertRemaining();
    const inputs = parseArguments(args);
    const admitted = requireCurrentAdmission(ROOT);
    evidence.integrationBaseCommit = admitted.integrationBaseCommit;
    evidence.candidateTreeIdentity = admitted.candidateTreeIdentity;
    evidence.sourceInputIdentity = admitted.sourceInputIdentity;
    requireCondition(process.platform === 'darwin' && process.arch === 'arm64', 'DARWIN_ARM64_REQUIRED');
    const lockBytes = regularBytes(path.join(ROOT, LOCK_PATH));
    requireCondition(hash(lockBytes) === LOCK_HASH && lockBytes.length === 7411, 'LOCK_IDENTITY_MISMATCH');
    const lock = parseR16cJsonBytes(lockBytes, { label: 'frozen runtime lock' });
    for (const [relative, expected] of Object.entries(SOURCE_HASHES)) requireCondition(hash(regularBytes(path.join(ROOT, relative))) === expected, `SOURCE_IDENTITY_MISMATCH:${relative}`);
    const source = inputs['--python-source'];
    const wheels = inputs['--wheelhouse'];
    const records = verifyBootstrap(source, lock, budget);
    evidence.bootstrap = { ...lock.bootstrapSource.canonicalClosure, verifiedBeforeExecution: true };
    evidence.wheels = verifyWheels(wheels, lock, budget);
    // Never execute the caller's directory: copy only verified regular files.
    // In particular, caller sitecustomize and pre-existing bytecode are omitted.
    const runtimeParent = path.join(ROOT, '.tf-runtime');
    try { mkdirSync(runtimeParent, { mode: 0o700 }); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    requireCondition(lstatSync(runtimeParent).isDirectory() && !lstatSync(runtimeParent).isSymbolicLink(), 'RUNTIME_PARENT_INVALID');
    runDirectory = mkdtempSync(path.join(runtimeParent, 'r18a-current-root-'));
    const cleanBootstrap = path.join(runDirectory, 'bootstrap');
    for (const record of records) {
      budget.assertRemaining();
      const bytes = regularBytes(path.join(source, record.path));
      requireCondition(bytes.length === record.byteSize && `sha256:${hash(bytes)}` === record.rawDigest, 'BOOTSTRAP_CHANGED_BEFORE_COPY');
      const destination = path.join(cleanBootstrap, record.path);
      mkdirSync(path.dirname(destination), { recursive: true, mode: 0o700 });
      writeFileSync(destination, bytes, { flag: 'wx', mode: record.path === 'bin/python3.12' ? 0o555 : 0o444 });
    }
    verifyBootstrap(cleanBootstrap, lock, budget);
    const seal = directory => { budget.assertRemaining(); for (const name of readdirSync(directory)) { const child = path.join(directory, name); if (lstatSync(child).isDirectory()) seal(child); } chmodSync(directory, 0o555); };
    seal(cleanBootstrap);
    const python = path.join(cleanBootstrap, 'bin/python3.12');
    const environment = { PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`, LANG: 'C', LC_ALL: 'C', TZ: 'UTC', TF_R18A_PYTHON_SOURCE: cleanBootstrap, TF_R18A_WHEELHOUSE: wheels };
    const execute = async (label, command) => {
      const result = await runBoundedCommand(command, { cwd: ROOT, env: environment, timeoutMs: budget.remainingMs() });
      const { status, ...details } = result;
      evidence.commands.push({ label, command, ...details, exitCode: status });
      requireSuccessfulCommand(result, label);
      budget.assertRemaining();
      return `${result.stdout}\n${result.stderr}`;
    };
    const pythonOutput = await execute('python-21', [python, '-I', '-S', '-B', '-W', 'error', 'scripts/mesoscale/pfhub7a_r18a_preflight_v3_test.py']);
    assertCompleteCorpus('python', pythonOutput);
    const nodeOutput = await execute('node-29', [process.execPath, '--test', '--test-reporter=tap', 'scripts/mesoscale/pfhub7a_r18a_schema_gate_v3.node-test.mjs']);
    assertCompleteCorpus('node', nodeOutput);
    evidence.receipts = [];
    for (const index of [1, 2]) {
      const output = path.join(runDirectory, `receipt-${index}.json`);
      await execute(`supervisor-${index}`, [python, '-I', '-S', '-B', '-W', 'error', 'scripts/mesoscale/pfhub7a_r18a_supervise_v3.py', '--python-source', cleanBootstrap, '--wheelhouse', wheels, '--output', output]);
      const bytes = regularBytes(output);
      requireCondition(bytes.length === 248778 && hash(bytes) === RECEIPT_HASH, 'FORMAL_RECEIPT_MISMATCH');
      evidence.receipts.push({ path: output, byteSize: bytes.length, rawDigest: `sha256:${hash(bytes)}` });
      await execute(`schema-${index}`, [process.execPath, 'scripts/mesoscale/pfhub7a_r18a_schema_gate_v3.mjs', output]);
    }
    // FINAL_BUDGET_CHECK_BEGIN: tested as this exact production code block.
    budget.assertRemaining();
    verifyBootstrap(cleanBootstrap, lock, budget);
    for (const [relative, expected] of Object.entries(SOURCE_HASHES)) requireCondition(hash(regularBytes(path.join(ROOT, relative))) === expected, 'SOURCE_CHANGED_DURING_RUN');
    budget.assertRemaining();
    const admittedAfter = requireCurrentAdmission(ROOT);
    const change = requireUnchangedCandidate(admitted, admittedAfter);
    evidence.observedTreeAfter = admittedAfter.candidateTreeIdentity;
    evidence.observedTreeUnchanged = change.observedTreeUnchanged;
    evidence.sourceInputVerifiedBeforeAndAfter = true;
    budget.assertRemaining();
    evidence.status = 'pass-bounded-current-root-execution';
    // FINAL_BUDGET_CHECK_END
  } catch (error) { evidence.reason = error instanceof Error ? error.message : String(error); }
  evidence.elapsedMs = budget.elapsedMs();
  evidence.budget = { clock: 'monotonic-performance.now', scientificAcceptanceMs: NUMERICAL_BUDGET_MS, stopGraceMs: STOP_GRACE_MS, stopGraceExtendsAcceptance: false };
  return persistExecutionEvidence(evidence, runDirectory);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runCurrentRoot(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify({ ...result, commands: result.commands.map(({ stdout, stderr, ...command }) => ({ ...command, stdoutBytes: Buffer.byteLength(stdout ?? ''), stderrBytes: Buffer.byteLength(stderr ?? '') })) })}\n`);
  if (result.status !== 'pass-bounded-current-root-execution') process.exitCode = 1;
}
