import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SCRIPT = fileURLToPath(new URL('./run-protected-browser-namespace-v049.sh', import.meta.url));
const SOURCE = readFileSync(SCRIPT, 'utf8');

describe('V049 protected browser Linux namespace supervisor', () => {
  it('locks one ordered external CLI and never accepts an arbitrary command', () => {
    expect(SOURCE).toContain('[ "$#" -eq 16 ]');
    expect(SOURCE).toContain('[ "$1" = --repository-root ]');
    expect(SOURCE).toContain('[ "$3" = --artifact-root ]');
    expect(SOURCE).toContain('[ "$5" = --control-receipt ]');
    expect(SOURCE).toContain('[ "$7" = --source-revision ]');
    expect(SOURCE).toContain('[ "$9" = --session-id ]');
    expect(SOURCE).toContain('[ "${11}" = --runtime-root ]');
    expect(SOURCE).toContain('[ "${13}" = --mode ]');
    expect(SOURCE).toContain('[ "${15}" = --output ]');
    expect(SOURCE).not.toMatch(/--(?:command|exec|script|test-mode|synthetic)/u);
    expect(SOURCE).not.toContain('eval ');
    expect(SOURCE).not.toContain('"$@"');
  });

  it('hardcodes the only runner and its six argument pairs without forwarding output', () => {
    expect(SOURCE).toContain(
      'run-protected-private-browser-mode-v049.server.mjs',
    );
    const runnerInvocation = SOURCE.slice(SOURCE.indexOf('"$node_bin" "$runner_path"'));
    for (const argument of [
      '--artifact-root', '--control-receipt', '--source-revision',
      '--session-id', '--runtime-root', '--mode',
    ]) {
      expect(runnerInvocation).toContain(argument);
    }
    expect(runnerInvocation.split('\n').slice(0, 16).join('\n'))
      .not.toContain('--repository-root');
    expect(runnerInvocation.split('\n').slice(0, 16).join('\n')).not.toContain('--output');
    expect(SOURCE).toContain('happy-path|mid-playback-dispose|context-loss');
    expect(SOURCE).toContain('^/opt/tailing-private-chromium-');
  });

  it('requires the root Linux x64 toolchain and all three kernel namespaces', () => {
    expect(SOURCE).toContain('[ "$(uname -s)" = Linux ]');
    expect(SOURCE).toContain('[ "$(uname -m)" = x86_64 ]');
    expect(SOURCE).toContain('[ "$(id -u)" -eq 0 ]');
    for (const command of [
      'unshare', 'mount', 'ip', 'setpriv', 'timeout', 'sha256sum', 'aa-exec',
    ]) {
      expect(SOURCE).toMatch(new RegExp(`required_tools='[^']*\\b${command}\\b`, 'u'));
    }
    for (const flag of [
      '--mount', '--net', '--pid', '--fork', '--kill-child=KILL', '--mount-proc=/proc',
    ]) {
      expect(SOURCE).toContain(flag);
    }
    expect(SOURCE).toContain('"$mount_bin" --make-rprivate /');
  });

  it('bind-remounts the exact inputs read-only and creates only private tmpfs scratch', () => {
    expect(SOURCE).toContain('"$mount_bin" --bind -- "$bind_target" "$bind_target"');
    expect(SOURCE).toContain('remount,bind,ro,nosuid,nodev,$execution_policy');
    expect(SOURCE).toContain('bind_readonly "$repository_root" noexec');
    expect(SOURCE).toContain('bind_readonly "$artifact_root" noexec');
    expect(SOURCE).toContain('bind_readonly "$control_receipt" noexec');
    expect(SOURCE).toContain('bind_readonly "$node_runtime_root" exec');
    expect(SOURCE).toContain('bind_readonly "$rolldown_runtime_root" noexec');
    expect(SOURCE).toContain('bind_readonly "$runtime_root" exec');
    expect(SOURCE).toContain(
      '"$mount_bin" --bind -- "$rolldown_runtime_file" "$rolldown_target_file"',
    );
    expect(SOURCE).toContain(
      'remount,bind,ro,nosuid,nodev,exec -- "$rolldown_target_file"',
    );
    expect(SOURCE).toContain('-t tmpfs');
    expect(SOURCE).toContain('rw,nosuid,nodev,noexec,size=268435456');
    expect(SOURCE).toContain('findmnt_bin');
  });

  it('allows only loopback and drops every credential elevation path', () => {
    expect(SOURCE).toContain('"$ip_bin" link set dev lo up');
    expect(SOURCE).toContain('"$ip_bin" -o link show');
    expect(SOURCE).toContain('"$ip_bin" -o -4 route show table all');
    expect(SOURCE).toContain('"$ip_bin" -o -6 route show table all');
    for (const flag of [
      '--reuid=65534', '--regid=65534', '--clear-groups', '--inh-caps=-all',
      '--ambient-caps=-all', '--bounding-set=-all', '--no-new-privs',
    ]) {
      expect(SOURCE).toContain(flag);
    }
    expect(SOURCE).toContain(
      'exec "$aa_exec_bin" --profile="$app_armor_profile" --',
    );
    expect(SOURCE.indexOf('exec "$aa_exec_bin"'))
      .toBeLessThan(SOURCE.indexOf('--no-new-privs'));
    expect(SOURCE).toContain('grep -Fqx -- "$app_armor_profile (unconfined)"');
    expect(SOURCE).toContain('[ "$aa_exec_bin" = /usr/bin/aa-exec ]');
  });

  it('uses exactly the locked clean environment for the nonroot runner', () => {
    const environment = SOURCE.slice(SOURCE.indexOf('"$env_bin" -i'))
      .split('"$node_bin" "$runner_path"')[0];
    const keys = [...environment.matchAll(/^\s{6}([A-Z][A-Z0-9_]*)=/gmu)]
      .map((match) => match[1]);
    expect(keys).toEqual([
      'CI', 'HOME', 'LANG', 'LC_ALL', 'NODE_ENV', 'PATH',
      'TAILING_BROWSER_APPARMOR_PROFILE', 'TMPDIR', 'TZ', 'XDG_CACHE_HOME', 'XDG_CONFIG_HOME',
      'XDG_RUNTIME_DIR',
    ]);
    expect(SOURCE).not.toMatch(/(?:TEST_ONLY|SYNTHETIC|GITHUB_ENV|NODE_OPTIONS)=/u);
    expect(SOURCE).toContain('/opt/tailing-private-node-$runtime_suffix');
    expect(SOURCE).toContain('[ "$("$node_bin" --version)" = v24.16.0 ]');
  });

  it('opens only the exact locked Rolldown native binding inside the noexec repository', () => {
    expect(SOURCE).toContain(
      'node_modules/@rolldown/binding-linux-x64-gnu/rolldown-binding.linux-x64-gnu.node',
    );
    expect(SOURCE).toContain('[ "$("$stat_bin" -c %s -- "$rolldown_file")" -eq 19324672 ]');
    expect(SOURCE).toContain(
      'ae16856655924ebc41f231393c7f8b89566430a845d1f073fd9d6abf219db04b',
    );
    expect(SOURCE).not.toContain('bind_readonly "$repository_root" exec');
  });

  it('captures privately, bounds one link, publishes no-replace, and cleans descendants', () => {
    expect(SOURCE).toContain('mktemp_bin');
    expect(SOURCE).toContain('>"$temporary_output"');
    expect(SOURCE).toContain('-c %h -- "$temporary_output"');
    expect(SOURCE).toContain('[ "$output_size" -gt 0 ]');
    expect(SOURCE).toContain('[ "$output_size" -le 2000000 ]');
    expect(SOURCE).toContain('"$chmod_bin" 0444 -- "$temporary_output"');
    expect(SOURCE).toContain('"$ln_bin" -- "$temporary_output" "$output"');
    expect(SOURCE).toContain('/proc/[0-9]*/cmdline');
    expect(SOURCE).toContain('"$ss_bin" -H -l -x -n');
    expect(SOURCE).toContain('assert_no_lingering_private_runtime');
    expect(SOURCE).toContain('*"$node_runtime_root"*');
    expect(SOURCE).toContain('*"$rolldown_runtime_root"*');
    expect(SOURCE).not.toMatch(/(?:cgroup|hostRuntimeClosureVerified|immutableRuntimeSnapshotVerified)/u);
  });

  it('fails closed for missing, extra, reordered, and synthetic-looking invocations', () => {
    for (const argv of [
      [],
      ['--command', '/bin/true'],
      ['--output', '/tmp/result.json', '--mode', 'happy-path'],
      ['--repository-root', '/tmp', '--artifact-root', '/tmp', '--control-receipt', '/tmp/x',
        '--source-revision', 'a'.repeat(40), '--session-id', 'synthetic', '--runtime-root',
        '/opt/tailing-private-chromium-1-1', '--mode', 'happy-path', '--output', '/tmp/y',
        '--extra', 'value'],
    ]) {
      const result = spawnSync('/bin/sh', [SCRIPT, ...argv], {
        encoding: 'utf8',
        env: {
          ...process.env,
          TAILING_SYNTHETIC_TEST: '1',
        },
      });
      expect(result.status).not.toBe(0);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('protected browser namespace supervisor failed\n');
    }
  });

  it('is valid POSIX shell syntax', () => {
    const result = spawnSync('/bin/sh', ['-n', SCRIPT], { encoding: 'utf8' });
    expect(result.status, result.stderr).toBe(0);
  });
});
