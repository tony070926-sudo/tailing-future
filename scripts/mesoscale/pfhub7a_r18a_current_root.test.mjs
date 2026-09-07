import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';
import { assertCompleteCorpus, createExecutionBudget, NUMERICAL_BUDGET_MS, STOP_GRACE_MS, regularBytes, requireSuccessfulCommand, runBoundedCommand, verifyBootstrap, verifyWheels } from './pfhub7a_r18a_current_root.mjs';

const syntheticCommand = (code, timeoutMs = 2000, extra = {}) => runBoundedCommand(
  [process.execPath, '-e', code],
  { cwd: process.cwd(), env: { PATH: '/usr/bin:/bin' }, timeoutMs, ...extra },
);
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

describe('explicit R18a numerical gate contracts (not a numerical run)', () => {
  it('fails closed with a machine-readable abstention when caller inputs are absent', () => {
    const result = spawnSync(process.execPath, ['scripts/mesoscale/pfhub7a_r18a_current_root.mjs'], { encoding: 'utf8' });
    expect(result.status).toBe(1);
    expect(JSON.parse(result.stdout)).toMatchObject({ status: 'abstain', releaseEligible: false, scientificPromotionEligible: false });
  });
  it('requires complete unskipped acceptance corpora', () => {
    expect(() => assertCompleteCorpus('python', 'Ran 21 tests in 2s\n\nOK\n')).not.toThrow();
    for (const output of ['Ran 20 tests\nOK\n', 'Ran 21 tests\nOK (skipped=1)\n', 'Ran 21 tests\nFAILED\n']) expect(() => assertCompleteCorpus('python', output)).toThrow();
    const complete = '# tests 29\n# pass 29\n# fail 0\n# cancelled 0\n# skipped 0\n# todo 0';
    expect(() => assertCompleteCorpus('node', complete)).not.toThrow();
    expect(() => assertCompleteCorpus('node', complete.replace('# skipped 0', '# skipped 1'))).toThrow();
    expect(() => assertCompleteCorpus('node', complete.replace('# tests 29', '# tests 28'))).toThrow();
    expect(NUMERICAL_BUDGET_MS).toBe(600000);
  });
  it('rejects a fake caller executable before it could execute, and rejects links and altered wheels', () => {
    const directory = realpathSync(mkdtempSync(path.join(tmpdir(), 'tf-r18a-runner-contract-')));
    try {
      mkdirSync(path.join(directory, 'bin')); mkdirSync(path.join(directory, 'lib/python3.12'), { recursive: true });
      writeFileSync(path.join(directory, 'bin/python3.12'), '#!/bin/sh\nexit 0\n', { mode: 0o755 });
      expect(() => verifyBootstrap(directory, { bootstrapSource: { canonicalClosure: { recordCount: 747 } } })).toThrow('BOOTSTRAP_CLOSURE_MISMATCH');
      symlinkSync(path.join(directory, 'bin/python3.12'), path.join(directory, 'linked'));
      expect(() => regularBytes(path.join(directory, 'linked'))).toThrow();
      expect(() => verifyWheels(directory, { wheelhouse: { distributions: [{ filename: 'bin/python3.12', byteSize: 0, rawDigest: 'sha256:wrong' }] } })).toThrow('WHEEL_IDENTITY_MISMATCH');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
  it('accepts complete normal execution and explicitly confirmed cleanup', async () => {
    const result = await syntheticCommand("process.stdout.write('normal completion'); process.stderr.write('diagnostic');");
    expect(result).toMatchObject({ status: 0, stdout: 'normal completion', stderr: 'diagnostic', cleanupConfirmed: true, timedOut: false, outputTruncated: false });
    expect(() => requireSuccessfulCommand(result, 'normal')).not.toThrow();
    expect(() => requireSuccessfulCommand({ ...result, cleanupConfirmed: false }, 'unconfirmed')).toThrow('COMMAND_FAILED');
  });
  it('enforces a deadline even for a finite child that handles SIGTERM', async () => {
    const result = await syntheticCommand("process.on('SIGTERM', () => {}); process.stdout.write('finite handler'); setTimeout(() => process.exit(0), 2200);", 300);
    expect(result.stdout).toContain('finite handler');
    expect(result.timedOut).toBe(true);
    expect(result.stopReason).toBe('TIMEOUT');
    expect(result.elapsedMs).toBeLessThan(300 + STOP_GRACE_MS + 600);
    expect(() => requireSuccessfulCommand(result, 'finite-handler')).toThrow('COMMAND_FAILED');
  });
  it('returns failure without waiting indefinitely for a finite detached pipe holder', async () => {
    const result = await syntheticCommand("const {spawn}=require('node:child_process'); const child=spawn(process.execPath,['-e','setTimeout(()=>process.exit(0),1800)'],{detached:true,stdio:['ignore',process.stdout,process.stderr]});child.unref();process.stdout.write('finite pipe holder');", 300);
    expect(result.stdout).toContain('finite pipe holder');
    expect(result.timedOut).toBe(true);
    expect(result.elapsedMs).toBeLessThan(300 + STOP_GRACE_MS + 500);
    expect(result).toMatchObject({ graceExpired: true, outputTruncated: true, cleanupConfirmed: false });
    expect(() => requireSuccessfulCommand(result, 'held-pipe')).toThrow('COMMAND_FAILED');
    await delay(1900); // The deliberately detached fixture has a finite lifetime.
  });
  it('records termination failure, returns by its stop deadline and never accepts unconfirmed cleanup', async () => {
    const actualKill = process.kill.bind(process);
    const mockedKill = vi.spyOn(process, 'kill').mockImplementation((pid, signal) => {
      if (signal === 'SIGKILL') { const error = new Error('synthetic EPERM'); error.code = 'EPERM'; throw error; }
      return actualKill(pid, signal);
    });
    let result;
    try {
      result = await syntheticCommand("process.stdout.write('finite kill-failure fixture'); setTimeout(() => process.exit(0), 2300);", 300);
      expect(result.stdout).toContain('finite kill-failure fixture');
      expect(result).toMatchObject({ timedOut: true, killError: 'synthetic EPERM', graceExpired: true, cleanupConfirmed: false });
      expect(result.elapsedMs).toBeLessThan(300 + STOP_GRACE_MS + 500);
      expect(() => requireSuccessfulCommand(result, 'kill-failure')).toThrow('COMMAND_FAILED');
    } finally {
      mockedKill.mockRestore();
      if (result?.pid) { try { actualKill(-result.pid, 'SIGKILL'); } catch (error) { if (error.code !== 'ESRCH') throw error; } }
      await delay(50);
    }
  });
  it('rejects combined output overflow with bounded retained bytes', async () => {
    const result = await syntheticCommand("process.stdout.write('x'.repeat(65536)); setTimeout(()=>process.exit(0),1000);", 2000, { maxOutputBytes: 1024 });
    expect(result).toMatchObject({ stopReason: 'OUTPUT_LIMIT_EXCEEDED', outputTruncated: true });
    expect(Buffer.byteLength(result.stdout) + Buffer.byteLength(result.stderr)).toBeLessThanOrEqual(1024);
    expect(() => requireSuccessfulCommand(result, 'overflow')).toThrow('COMMAND_FAILED');
  });
  it('shares one monotonic allowance across commands rather than resetting it', async () => {
    let elapsed = 0;
    const budget = createExecutionBudget(100, () => elapsed);
    requireSuccessfulCommand(await syntheticCommand("process.stdout.write('first');"), 'first');
    elapsed = 70;
    expect(budget.remainingMs()).toBe(30);
    requireSuccessfulCommand(await syntheticCommand("process.stdout.write('second');"), 'second');
    elapsed = 101;
    expect(() => budget.assertRemaining()).toThrow('AGGREGATE_BUDGET_EXCEEDED');
    expect(() => budget.remainingMs()).toThrow('AGGREGATE_BUDGET_EXCEEDED');
    expect(NUMERICAL_BUDGET_MS).toBe(600000);
    expect(STOP_GRACE_MS).toBe(1000);
  });
  it('tests the actual final-verification block: late source verification cannot mark success', () => {
    const source = readFileSync(new URL('./pfhub7a_r18a_current_root.mjs', import.meta.url), 'utf8');
    const match = source.match(/\/\/ FINAL_BUDGET_CHECK_BEGIN:[^\n]*\n([\s\S]*?)\/\/ FINAL_BUDGET_CHECK_END/);
    expect(match).not.toBeNull();
    for (const finalElapsed of [49, 51]) {
      let elapsed = 0;
      const evidence = { status: 'abstain' };
      const context = { budget: createExecutionBudget(50, () => elapsed), evidence, cleanBootstrap: 'synthetic', lock: {}, ROOT: '/synthetic', path,
        SOURCE_HASHES: { 'fixture-source': 'expected' }, verifyBootstrap: () => { elapsed = 30; },
        regularBytes: () => { elapsed = finalElapsed; return Buffer.from('synthetic'); }, hash: () => 'expected',
        requireCondition: (condition, reason) => { if (!condition) throw new Error(reason); } };
      const executeExactBlock = () => runInNewContext(match[1], context, { timeout: 1000 });
      if (finalElapsed < 50) { executeExactBlock(); expect(evidence.status).toBe('pass-bounded-current-root-execution'); }
      else { expect(executeExactBlock).toThrow('AGGREGATE_BUDGET_EXCEEDED'); expect(evidence.status).toBe('abstain'); }
    }
  });
});
