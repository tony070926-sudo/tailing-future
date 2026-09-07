#!/usr/bin/env node
// Explicit Darwin scientific gate. Ordinary CI runs its contracts, not this run.
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { chmodSync, closeSync, constants, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseR16cJsonBytes } from './r16c_json_integrity.mjs';

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
export const NUMERICAL_BUDGET_MS = 600_000;
export const STOP_GRACE_MS = 1000;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function requireCondition(condition, code) { if (!condition) throw new Error(code); }

// This clock utility does not emit scientific claims or accept runtime inputs.
// The production entry point always supplies the fixed numerical allowance.
export function createExecutionBudget(limitMs, now = () => performance.now()) {
  requireCondition(Number.isFinite(limitMs) && limitMs > 0, 'BUDGET_INVALID');
  const began = now();
  const elapsedMs = () => now() - began;
  const assertRemaining = () => {
    const elapsed = elapsedMs();
    requireCondition(Number.isFinite(elapsed) && elapsed >= 0 && elapsed < limitMs, 'AGGREGATE_BUDGET_EXCEEDED');
  };
  const remainingMs = () => {
    const elapsed = elapsedMs();
    requireCondition(Number.isFinite(elapsed) && elapsed >= 0 && elapsed < limitMs, 'AGGREGATE_BUDGET_EXCEEDED');
    return Math.max(1, Math.floor(limitMs - elapsed));
  };
  return { elapsedMs, assertRemaining, remainingMs };
}

// Mechanical process lifecycle only: no scientific bypass or receipt approval.
export async function runBoundedCommand(command, { cwd, env, timeoutMs, maxOutputBytes = 16 * 1024 * 1024 }) {
  requireCondition(Array.isArray(command) && command.length > 0 && command.every(value => typeof value === 'string'), 'COMMAND_INVALID');
  requireCondition(Number.isInteger(timeoutMs) && timeoutMs > 0 && timeoutMs <= NUMERICAL_BUDGET_MS, 'COMMAND_TIMEOUT_INVALID');
  requireCondition(Number.isInteger(maxOutputBytes) && maxOutputBytes > 0 && maxOutputBytes <= 16 * 1024 * 1024, 'OUTPUT_LIMIT_INVALID');
  const began = performance.now();
  return new Promise(resolve => {
    const child = spawn(command[0], command.slice(1), { cwd, env, detached: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const stdout = []; const stderr = [];
    let bytesKept = 0; let done = false; let graceTimer;
    let stopReason = null; let killError = null; let timedOut = false; let outputTruncated = false;
    let directChildExitObserved = false; let pipesClosed = false; let observedStatus = null; let observedSignal = null;
    let graceExpired = false; let timeout;
    const finish = (status, signal, error = null) => {
      if (done) return;
      done = true; clearTimeout(timeout); clearTimeout(graceTimer);
      let processGroupAbsent = !child.pid;
      if (child.pid) {
        try { process.kill(-child.pid, 0); }
        catch (probeError) { processGroupAbsent = probeError.code === 'ESRCH'; }
      }
      const cleanupConfirmed = directChildExitObserved && pipesClosed && processGroupAbsent;
      resolve({ pid: child.pid ?? null, status, signal, error, stopReason, timedOut,
        killError, outputTruncated, graceExpired, cleanupConfirmed,
        cleanup: { directChildExitObserved, pipesClosed, processGroupAbsent,
          scope: 'Direct child and original process group only; escaped descendants and OS-level isolation are not verified.' },
        elapsedMs: performance.now() - began, timeoutMs, stopGraceMs: STOP_GRACE_MS, maxOutputBytes,
        stdout: Buffer.concat(stdout).toString('utf8'), stderr: Buffer.concat(stderr).toString('utf8') });
    };
    const stop = reason => {
      if (done || stopReason) return;
      stopReason = reason;
      if (child.pid) {
        try { process.kill(-child.pid, 'SIGKILL'); }
        catch (error) { if (error.code !== 'ESRCH') killError = error.message; }
      }
      // Returning failure does not depend on a descendant closing inherited pipes.
      graceTimer = setTimeout(() => {
        graceExpired = true; outputTruncated = true;
        child.stdout.destroy(); child.stderr.destroy(); child.unref();
        finish(observedStatus, observedSignal, 'STOP_GRACE_EXCEEDED');
      }, STOP_GRACE_MS);
    };
    const receive = (chunks, bytes) => {
      if (done) return;
      const available = Math.max(0, maxOutputBytes - bytesKept);
      const kept = bytes.subarray(0, available);
      if (kept.length) { chunks.push(kept); bytesKept += kept.length; }
      if (bytes.length > available) { outputTruncated = true; stop('OUTPUT_LIMIT_EXCEEDED'); }
    };
    timeout = setTimeout(() => { timedOut = true; stop('TIMEOUT'); }, timeoutMs);
    child.stdout.on('data', bytes => receive(stdout, bytes));
    child.stderr.on('data', bytes => receive(stderr, bytes));
    child.stdout.on('error', error => stop(`STDOUT_ERROR:${error.message}`));
    child.stderr.on('error', error => stop(`STDERR_ERROR:${error.message}`));
    child.on('exit', (status, signal) => { directChildExitObserved = true; observedStatus = status; observedSignal = signal; });
    child.on('error', error => finish(null, null, error.message));
    child.on('close', (status, signal) => { pipesClosed = true; finish(status, signal); });
  });
}

export function requireSuccessfulCommand(result, label) {
  requireCondition(result.status === 0 && !result.signal && !result.error && !result.stopReason
    && !result.timedOut && !result.killError && !result.outputTruncated && result.cleanupConfirmed,
  `COMMAND_FAILED:${label}`);
}

export function regularBytes(filename, maximum = 128 * 1024 * 1024) {
  const absolute = path.resolve(filename);
  for (let parent = path.dirname(absolute); parent !== path.dirname(parent); parent = path.dirname(parent)) {
    requireCondition(!lstatSync(parent).isSymbolicLink(), 'INPUT_ANCESTOR_SYMLINK');
  }
  const before = lstatSync(absolute, { bigint: true });
  requireCondition(before.isFile() && !before.isSymbolicLink() && before.nlink === 1n && before.size <= BigInt(maximum), 'INPUT_NOT_REGULAR');
  const fd = openSync(absolute, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const opened = fstatSync(fd, { bigint: true });
    const bytes = readFileSync(fd);
    const after = fstatSync(fd, { bigint: true });
    const same = (a, b) => ['dev', 'ino', 'mode', 'nlink', 'size', 'mtimeNs', 'ctimeNs'].every(key => a[key] === b[key]);
    requireCondition(same(before, opened) && same(opened, after) && bytes.length === Number(after.size), 'INPUT_CHANGED');
    return bytes;
  } finally { closeSync(fd); }
}

export function verifyBootstrap(source, lock, budget) {
  budget?.assertRemaining();
  requireCondition(path.isAbsolute(source) && !lstatSync(source).isSymbolicLink(), 'BOOTSTRAP_ABSOLUTE_REGULAR_ROOT_REQUIRED');
  const selected = ['bin/python3.12'];
  const walk = (relative, depth = 0) => {
    budget?.assertRemaining();
    requireCondition(depth < 32 && selected.length < 4096, 'BOOTSTRAP_LIMIT');
    const absolute = path.join(source, relative);
    requireCondition(lstatSync(absolute).isDirectory() && !lstatSync(absolute).isSymbolicLink(), 'BOOTSTRAP_DIRECTORY');
    for (const name of readdirSync(absolute).sort()) {
      if (name === 'site-packages' || name === '__pycache__' || /\.(?:pyc|pyo)$/.test(name)) continue;
      const child = path.join(relative, name);
      const stat = lstatSync(path.join(source, child));
      requireCondition(!stat.isSymbolicLink(), 'BOOTSTRAP_SYMLINK');
      if (stat.isDirectory()) walk(child, depth + 1);
      else { requireCondition(stat.isFile(), 'BOOTSTRAP_SPECIAL_FILE'); selected.push(child); }
    }
  };
  walk('lib/python3.12');
  const expected = lock.bootstrapSource.canonicalClosure;
  requireCondition(selected.length === expected.recordCount, 'BOOTSTRAP_CLOSURE_MISMATCH');
  selected.sort((a, b) => Buffer.compare(Buffer.from(a), Buffer.from(b)));
  let totalBytes = 0;
  const records = selected.map(relative => {
    budget?.assertRemaining();
    const bytes = regularBytes(path.join(source, relative));
    totalBytes += bytes.length;
    requireCondition(totalBytes <= expected.byteSize, 'BOOTSTRAP_CLOSURE_MISMATCH');
    return { byteSize: bytes.length, path: relative, rawDigest: `sha256:${hash(bytes)}` };
  });
  budget?.assertRemaining();
  requireCondition(records.length === expected.recordCount && records.reduce((sum, record) => sum + record.byteSize, 0) === expected.byteSize && `sha256:${hash(Buffer.from(JSON.stringify(records)))}` === expected.recordsDigest, 'BOOTSTRAP_CLOSURE_MISMATCH');
  const executable = records.find(record => record.path === 'bin/python3.12');
  requireCondition(executable.byteSize === lock.bootstrapSource.pythonExecutable.byteSize && executable.rawDigest === lock.bootstrapSource.pythonExecutable.rawDigest, 'BOOTSTRAP_EXECUTABLE_MISMATCH');
  return records;
}

export function verifyWheels(wheelhouse, lock, budget) {
  requireCondition(path.isAbsolute(wheelhouse) && lstatSync(wheelhouse).isDirectory() && !lstatSync(wheelhouse).isSymbolicLink(), 'WHEELHOUSE_ABSOLUTE_DIRECTORY_REQUIRED');
  return lock.wheelhouse.distributions.map(wheel => {
    budget?.assertRemaining();
    const bytes = regularBytes(path.join(wheelhouse, wheel.filename));
    budget?.assertRemaining();
    requireCondition(bytes.length === wheel.byteSize && `sha256:${hash(bytes)}` === wheel.rawDigest, 'WHEEL_IDENTITY_MISMATCH');
    return { path: wheel.filename, byteSize: bytes.length, rawDigest: wheel.rawDigest };
  });
}

export function assertCompleteCorpus(kind, output) {
  if (kind === 'python') {
    requireCondition(/Ran 21 tests\b/.test(output) && /\nOK\s*$/.test(output) && !/skipped|expected failures|unexpected success/i.test(output), 'PYTHON_CORPUS_INCOMPLETE');
  } else {
    for (const [field, count] of [['tests', 29], ['pass', 29], ['fail', 0], ['cancelled', 0], ['skipped', 0], ['todo', 0]]) {
      requireCondition(new RegExp(`^# ${field} ${count}$`, 'm').test(output), 'NODE_CORPUS_INCOMPLETE');
    }
  }
}

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

export async function runCurrentRoot(args) {
  const started = Date.now();
  const budget = createExecutionBudget(NUMERICAL_BUDGET_MS);
  const evidence = { schemaVersion: 'tf.r18a-current-root-execution/0.1', baseCommit: '307e6d723086fe41b6d89e9f9b4b532364ccaeff', startedAt: new Date(started).toISOString(), status: 'abstain', releaseEligible: false, historicalCandidateIdentityTransferred: false, convergenceVerified: false, physicalValidation: false, reproduced: false, scientificPromotionEligible: false, commands: [] };
  let runDirectory;
  try {
    budget.assertRemaining();
    const inputs = parseArguments(args);
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
    evidence.status = 'pass-bounded-current-root-execution';
    // FINAL_BUDGET_CHECK_END
  } catch (error) { evidence.reason = error instanceof Error ? error.message : String(error); }
  evidence.elapsedMs = budget.elapsedMs();
  evidence.budget = { clock: 'monotonic-performance.now', scientificAcceptanceMs: NUMERICAL_BUDGET_MS, stopGraceMs: STOP_GRACE_MS, stopGraceExtendsAcceptance: false };
  if (runDirectory) { evidence.evidencePath = path.join(runDirectory, 'execution.json'); writeFileSync(evidence.evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, { flag: 'wx', mode: 0o600 }); }
  return evidence;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runCurrentRoot(process.argv.slice(2));
  process.stdout.write(`${JSON.stringify({ ...result, commands: result.commands.map(({ stdout, stderr, ...command }) => ({ ...command, stdoutBytes: Buffer.byteLength(stdout ?? ''), stderrBytes: Buffer.byteLength(stderr ?? '') })) })}\n`);
  if (result.status !== 'pass-bounded-current-root-execution') process.exitCode = 1;
}
