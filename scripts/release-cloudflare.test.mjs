import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import {
  chmod,
  link,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  realpath,
  rm,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import {
  captureAndDeleteCloudflareEnvironment,
  createCanonicalScratchRoot,
  createPreflightEnvironments,
  createWranglerDeployEnvironment,
  executeDeployUnlessCheckOnly,
  EXPECTED_CLOUDFLARE_ACCOUNT_ID,
  NPM_CI_ARGS,
  resolveReleaseInputs,
  runWranglerDeployment,
  validateInstalledWranglerManifest,
  validateWranglerLock,
  WRANGLER_LOCK_BIN_PATH,
  WRANGLER_PACKAGE_BIN_PATH,
  WRANGLER_VERSION,
} from './release-cloudflare.mjs';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseScript = path.join(repositoryRoot, 'scripts/release-cloudflare.mjs');
const temporaryRoots = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, {
    recursive: true,
    force: true,
  })));
});

describe('Cloudflare release process boundaries', () => {
  it('canonicalizes the scratch root before passing paths to the strict ZIP extractor', async () => {
    const root = createCanonicalScratchRoot();
    temporaryRoots.push(root);
    expect(path.resolve(await realpath(root))).toBe(root);
  });

  it('statically imports only Node builtins and scrubs Cloudflare credentials before local imports', async () => {
    const source = await readFile(releaseScript, 'utf8');
    const staticSpecifiers = [...source.matchAll(/from '([^']+)';/g)]
      .map((match) => match[1]);

    expect(staticSpecifiers.length).toBeGreaterThan(0);
    expect(staticSpecifiers.every((specifier) => specifier.startsWith('node:'))).toBe(true);
    const captureIndex = source.indexOf(
      'captureAndDeleteCloudflareEnvironment(process.env)',
    );
    const scrubIndex = source.indexOf(
      'replaceEnvironment(process.env, baseEnvironment(releaseInputs))',
    );
    const firstLocalImport = source.indexOf("import('./github-release-policy.mjs')");
    expect(captureIndex).toBeGreaterThan(-1);
    expect(scrubIndex).toBeGreaterThan(captureIndex);
    expect(firstLocalImport).toBeGreaterThan(scrubIndex);
    expect(source.match(/actions\/artifacts\/\$\{artifact\.id\}\/zip/g)).toHaveLength(1);
    const deployBoundary = source.indexOf('await executeDeployUnlessCheckOnly(checkOnly');
    expect(source.indexOf('rebuildWranglerTool({', deployBoundary)).toBeGreaterThan(deployBoundary);
    expect(source.indexOf('createWranglerDeployEnvironment(', deployBoundary))
      .toBeGreaterThan(deployBoundary);
  });

  it('captures every Cloudflare variable and erases it from the importing process', () => {
    const child = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `await import(${JSON.stringify(new URL('./release-cloudflare.mjs', import.meta.url).href)});\n`
          + "process.stdout.write(JSON.stringify(Object.keys(process.env).filter((key) => key.startsWith('CLOUDFLARE_'))));",
      ],
      {
        encoding: 'utf8',
        env: {
          PATH: process.env.PATH,
          CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
          CLOUDFLARE_API_TOKEN: 't'.repeat(32),
          CLOUDFLARE_UNREVIEWED_SECRET: 'must-not-survive',
        },
      },
    );
    expect(child.status, child.stderr).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual([]);

    const environment = {
      PATH: '/usr/bin:/bin',
      CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
      CLOUDFLARE_API_TOKEN: 't'.repeat(32),
      CLOUDFLARE_EXTRA: 'secret',
      UNRELATED: 'preserved',
    };
    const captured = captureAndDeleteCloudflareEnvironment(environment);
    expect(captured).toEqual({
      CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
      CLOUDFLARE_API_TOKEN: 't'.repeat(32),
      CLOUDFLARE_EXTRA: 'secret',
    });
    expect(Object.isFrozen(captured)).toBe(true);
    expect(environment).toEqual({ PATH: '/usr/bin:/bin', UNRELATED: 'preserved' });
  });

  it('resolves an existing gh login with an explicit environment that contains no deployment secret', () => {
    let invocation;
    const resolved = resolveReleaseInputs({
      PATH: '/usr/bin:/bin',
      HOME: '/users/release',
      XDG_CONFIG_HOME: '/users/release/.config',
      GH_CONFIG_DIR: '/users/release/.config/gh',
      CLOUDFLARE_API_TOKEN: 'must-not-cross',
      AWS_SECRET_ACCESS_KEY: 'must-not-cross',
      NPM_TOKEN: 'must-not-cross',
    }, (command, args, options) => {
      invocation = { command, args, options };
      return 'github-token-from-existing-login\n';
    });

    expect(invocation.command).toBe('gh');
    expect(invocation.args).toEqual(['auth', 'token', '--hostname', 'github.com']);
    expect(Object.keys(invocation.options.env).sort()).toEqual([
      'CI',
      'GH_CONFIG_DIR',
      'GH_HOST',
      'GH_PAGER',
      'GH_PROMPT_DISABLED',
      'HOME',
      'LANG',
      'LC_ALL',
      'NO_COLOR',
      'PATH',
      'XDG_CONFIG_HOME',
    ]);
    expect(resolved.GH_TOKEN).toBe('github-token-from-existing-login');
    expect(resolved.GH_HOST).toBe('github.com');
    expect(resolved.WRANGLER_OAUTH_CONFIG_PATH).toBe(
      '/users/release/.config/.wrangler/config/default.toml',
    );
    expect(resolved.WRANGLER_ENCRYPTED_OAUTH_CONFIG_PATH).toBe(
      '/users/release/.config/.wrangler/config/default.enc',
    );
    expect(Object.values(invocation.options.env)).not.toContain('must-not-cross');
    expect(() => resolveReleaseInputs({
      PATH: '/usr/bin:/bin',
      GH_HOST: 'github.example.invalid',
      GH_TOKEN: 'github-secret',
    })).toThrow(/github\.com/);
  });

  it('uses separate strict allowlist environments for Git, GitHub and Python', async () => {
    const root = await temporaryRoot();
    const environments = createPreflightEnvironments({
      PATH: '/usr/bin:/bin',
      GH_TOKEN: 'github-secret',
      GH_HOST: 'github.com',
      HOME: '/private/user',
      CLOUDFLARE_API_TOKEN: 'cloudflare-secret',
      NPM_TOKEN: 'npm-secret',
      AWS_SECRET_ACCESS_KEY: 'aws-secret',
    }, root);

    expect(Object.keys(environments.git).sort()).toEqual([
      'CI',
      'GIT_CONFIG_NOSYSTEM',
      'GIT_OPTIONAL_LOCKS',
      'GIT_TERMINAL_PROMPT',
      'HOME',
      'LANG',
      'LC_ALL',
      'NO_COLOR',
      'PATH',
      'TMPDIR',
      'XDG_CACHE_HOME',
      'XDG_CONFIG_HOME',
    ]);
    expect(Object.keys(environments.python).sort()).toEqual([
      'CI',
      'HOME',
      'LANG',
      'LC_ALL',
      'NO_COLOR',
      'PATH',
      'PYTHONDONTWRITEBYTECODE',
      'PYTHONHASHSEED',
      'PYTHONNOUSERSITE',
      'TMPDIR',
      'XDG_CACHE_HOME',
      'XDG_CONFIG_HOME',
    ]);
    expect(Object.keys(environments.github).sort()).toEqual([
      'CI',
      'GH_CONFIG_DIR',
      'GH_HOST',
      'GH_PAGER',
      'GH_PROMPT_DISABLED',
      'GH_TOKEN',
      'HOME',
      'LANG',
      'LC_ALL',
      'NO_COLOR',
      'PATH',
      'TMPDIR',
      'XDG_CACHE_HOME',
      'XDG_CONFIG_HOME',
    ]);
    expect(environments.github.GH_TOKEN).toBe('github-secret');
    expect(environments.git.HOME).not.toBe('/private/user');
    for (const environment of Object.values(environments)) {
      expect(Object.keys(environment).some((key) => key.startsWith('CLOUDFLARE_')))
        .toBe(false);
      expect(environment.NPM_TOKEN).toBeUndefined();
      expect(environment.AWS_SECRET_ACCESS_KEY).toBeUndefined();
    }
    expect(environments.git.GH_TOKEN).toBeUndefined();
    expect(environments.python.GH_TOKEN).toBeUndefined();
  });

  it('passes only validated Cloudflare credentials to Wrangler with a second fresh home', async () => {
    const root = await temporaryRoot();
    const source = {
      PATH: '/usr/bin:/bin',
      GH_TOKEN: 'github-secret',
      GH_HOST: 'github.com',
      NPM_TOKEN: 'npm-secret',
    };
    const preflight = createPreflightEnvironments(source, root);
    const deployment = createWranglerDeployEnvironment(source, {
      CLOUDFLARE_ACCOUNT_ID: EXPECTED_CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_API_TOKEN: 't'.repeat(32),
    }, root);

    expect(Object.keys(deployment).sort()).toEqual([
      'CI',
      'CLOUDFLARE_ACCOUNT_ID',
      'CLOUDFLARE_API_TOKEN',
      'HOME',
      'LANG',
      'LC_ALL',
      'NO_COLOR',
      'PATH',
      'TMPDIR',
      'WRANGLER_SEND_METRICS',
      'WRANGLER_WRITE_LOGS',
      'XDG_CACHE_HOME',
      'XDG_CONFIG_HOME',
    ]);
    expect(deployment.HOME).not.toBe(preflight.git.HOME);
    expect(deployment.XDG_CACHE_HOME).not.toBe(preflight.git.XDG_CACHE_HOME);
    expect(deployment.GH_TOKEN).toBeUndefined();
    expect(deployment.NPM_TOKEN).toBeUndefined();
    expect(() => createWranglerDeployEnvironment(source, {}, root)).toThrow(/no bounded Wrangler OAuth/);
    expect(() => createWranglerDeployEnvironment(source, {
      CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32),
      CLOUDFLARE_API_TOKEN: 't'.repeat(32),
      CLOUDFLARE_UNREVIEWED_SECRET: 'secret',
    }, root)).toThrow(/requires exactly/);
    expect(() => createWranglerDeployEnvironment(source, {
      CLOUDFLARE_ACCOUNT_ID: 'not-an-account-id',
      CLOUDFLARE_API_TOKEN: 't'.repeat(32),
    }, root)).toThrow(/ACCOUNT_ID/);
    const wrongWellFormedAccount = EXPECTED_CLOUDFLARE_ACCOUNT_ID === 'a'.repeat(32)
      ? 'b'.repeat(32)
      : 'a'.repeat(32);
    expect(() => createWranglerDeployEnvironment(source, {
      CLOUDFLARE_ACCOUNT_ID: wrongWellFormedAccount,
      CLOUDFLARE_API_TOKEN: 't'.repeat(32),
    }, root)).toThrow(/pinned Tailing Future account/);
  });

  it('copies only a bounded regular Wrangler OAuth config into the final isolated XDG home', async () => {
    const root = await temporaryRoot();
    const sourceConfig = path.join(root, 'source', 'default.toml');
    const oauthBytes = [
      `oauth_token = "${'o'.repeat(48)}"`,
      'expiration_time = "2026-08-29T00:00:00.000Z"',
      `refresh_token = "${'r'.repeat(48)}"`,
      'scopes = ["account:read", "workers:write"]',
      '',
    ].join('\n');
    await mkdir(path.dirname(sourceConfig), { recursive: true });
    await writeFile(sourceConfig, oauthBytes, { mode: 0o600 });
    const source = {
      PATH: '/usr/bin:/bin',
      GH_TOKEN: 'github-secret',
      GH_HOST: 'github.com',
      WRANGLER_OAUTH_CONFIG_PATH: sourceConfig,
    };

    const deployment = createWranglerDeployEnvironment(source, {}, root);
    const copiedConfig = path.join(
      deployment.XDG_CONFIG_HOME,
      '.wrangler',
      'config',
      'default.toml',
    );
    expect(await readFile(copiedConfig, 'utf8')).toBe(oauthBytes);
    expect(Object.keys(deployment).filter((key) => key.startsWith('CLOUDFLARE_')))
      .toEqual(['CLOUDFLARE_ACCOUNT_ID']);
    expect(deployment.CLOUDFLARE_ACCOUNT_ID).toBe(EXPECTED_CLOUDFLARE_ACCOUNT_ID);
    expect(deployment.GH_TOKEN).toBeUndefined();

    const malformedRoot = await temporaryRoot();
    const malformedConfig = path.join(malformedRoot, 'source', 'default.toml');
    await mkdir(path.dirname(malformedConfig), { recursive: true });
    await writeFile(malformedConfig, 'oauth_token = "not-a-complete-config"\n', {
      mode: 0o600,
    });
    expect(() => createWranglerDeployEnvironment({
      ...source,
      WRANGLER_OAUTH_CONFIG_PATH: malformedConfig,
    }, {}, malformedRoot)).toThrow(/unexpected structure/);

    await writeFile(malformedConfig, oauthBytes);
    await chmod(malformedConfig, 0o644);
    expect(() => createWranglerDeployEnvironment({
      ...source,
      WRANGLER_OAUTH_CONFIG_PATH: malformedConfig,
    }, {}, malformedRoot)).toThrow(/regular 0600-style/);

    const symlinkRoot = await temporaryRoot();
    const realConfig = path.join(symlinkRoot, 'source', 'real.toml');
    const linkedConfig = path.join(symlinkRoot, 'source', 'default.toml');
    await mkdir(path.dirname(realConfig), { recursive: true });
    await writeFile(realConfig, oauthBytes, { mode: 0o600 });
    await symlink(realConfig, linkedConfig);
    expect(() => createWranglerDeployEnvironment({
      ...source,
      WRANGLER_OAUTH_CONFIG_PATH: linkedConfig,
    }, {}, symlinkRoot)).toThrow(/regular 0600-style/);
  });

  it('requires the locked Wrangler package and the hardened npm install arguments', async () => {
    const packageJson = JSON.parse(await readFile(
      path.join(repositoryRoot, 'package.json'),
      'utf8',
    ));
    const packageLock = JSON.parse(await readFile(
      path.join(repositoryRoot, 'package-lock.json'),
      'utf8',
    ));

    expect(WRANGLER_VERSION).toBe('4.127.0');
    expect(WRANGLER_LOCK_BIN_PATH).toBe('bin/wrangler.js');
    expect(WRANGLER_PACKAGE_BIN_PATH).toBe('./bin/wrangler.js');
    expect(NPM_CI_ARGS).toEqual([
      'ci',
      '--ignore-scripts',
      '--no-audit',
      '--no-fund',
    ]);
    expect(() => validateWranglerLock(packageJson, packageLock)).not.toThrow();

    for (const mutate of [
      (manifest) => { manifest.devDependencies.wrangler = '^4.127.0'; },
      (_manifest, lock) => { lock.packages[''].devDependencies.wrangler = '^4.127.0'; },
      (_manifest, lock) => { lock.packages['node_modules/wrangler'].version = '4.126.0'; },
      (_manifest, lock) => { lock.packages['node_modules/wrangler'].resolved = 'https://evil.invalid/wrangler.tgz'; },
      (_manifest, lock) => { lock.packages['node_modules/wrangler'].integrity = 'sha256-invalid'; },
      (_manifest, lock) => { lock.packages['node_modules/wrangler'].bin.wrangler = '../escape.js'; },
    ]) {
      const changedManifest = structuredClone(packageJson);
      const changedLock = structuredClone(packageLock);
      mutate(changedManifest, changedLock);
      expect(() => validateWranglerLock(changedManifest, changedLock)).toThrow(/pin Wrangler/);
    }

    const installedManifest = JSON.parse(await readFile(
      path.join(repositoryRoot, 'node_modules/wrangler/package.json'),
      'utf8',
    ));
    expect(() => validateInstalledWranglerManifest(installedManifest)).not.toThrow();
    for (const mutate of [
      (manifest) => { manifest.version = '4.126.0'; },
      (manifest) => { manifest.bin.wrangler = 'bin/wrangler.js'; },
      (manifest) => { delete manifest.bin.wrangler; },
    ]) {
      const changedManifest = structuredClone(installedManifest);
      mutate(changedManifest);
      expect(() => validateInstalledWranglerManifest(changedManifest)).toThrow(
        /rebuilt Wrangler manifest/,
      );
    }
  });

  it('isolates the encrypted default profile and selects the native keyring only in the final child', async () => {
    const fixture = await encryptedFixture();
    const resolved = resolveReleaseInputs({
      PATH: '/usr/bin:/bin', GH_TOKEN: 'github-secret',
      XDG_CONFIG_HOME: fixture.sourceRoot,
      WRANGLER_PROFILE: 'untrusted', CLOUDFLARE_ENV: 'staging',
    });
    const preflight = createPreflightEnvironments(resolved, fixture.scratch);
    const environment = createWranglerDeployEnvironment({
      ...fixture.source, WRANGLER_PROFILE: 'untrusted',
      NODE_OPTIONS: '--untrusted', CLOUDFLARE_ENV: 'staging',
    }, {}, fixture.scratch);
    const target = encryptedTarget(environment);
    expect(await readFile(target)).toEqual(fixture.bytes);
    expect(environment.XDG_CONFIG_HOME.startsWith(await realpath(fixture.scratch))).toBe(false);
    expect(environment.HOME).not.toContain(fixture.sourceRoot);
    expect(environment.CLOUDFLARE_AUTH_USE_KEYRING).toBe('true');
    expect(environment.CLOUDFLARE_ACCOUNT_ID).toBe(EXPECTED_CLOUDFLARE_ACCOUNT_ID);
    expect(environment.WRANGLER_PROFILE).toBeUndefined();
    expect(environment.CLOUDFLARE_ENV).toBeUndefined();
    expect(environment.NODE_OPTIONS).toBeUndefined();
    expect(environment.GH_TOKEN).toBeUndefined();
    expect(environment.CLOUDFLARE_API_TOKEN).toBeUndefined();
    expect((await lstat(target)).mode & 0o777).toBe(0o600);
    expect((await lstat(path.dirname(environment.XDG_CONFIG_HOME))).mode & 0o777).toBe(0o700);
    for (const child of Object.values(preflight)) {
      expect(child.CLOUDFLARE_AUTH_USE_KEYRING).toBeUndefined();
      expect(child.XDG_CONFIG_HOME).not.toBe(environment.XDG_CONFIG_HOME);
    }
    const logs = [];
    let invocation;
    runWranglerDeployment('/locked/wrangler.js', '/artifact/wrangler.json', '/artifact', environment,
      (command, args, options) => { invocation = { command, args, options }; },
      (message) => logs.push(message));
    expect(invocation.args).toEqual([
      '/locked/wrangler.js', 'deploy', '--config', '/artifact/wrangler.json', '--profile', 'default',
    ]);
    expect(invocation.options.env).toBe(environment);
    expect(logs.at(-1)).toMatch(/unchanged credentials/);
    await expect(lstat(fixture.guard)).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(fixture.sourcePath)).toEqual(fixture.bytes);
  });

  it('never accepts caller-supplied keyring controls across the Cloudflare allowlist', async () => {
    const fixture = await encryptedFixture();
    for (const credentials of [
      { CLOUDFLARE_AUTH_USE_KEYRING: 'true' },
      { CLOUDFLARE_ACCOUNT_ID: EXPECTED_CLOUDFLARE_ACCOUNT_ID,
        CLOUDFLARE_API_TOKEN: 't'.repeat(32), CLOUDFLARE_AUTH_USE_KEYRING: 'false' },
    ]) {
      expect(() => createWranglerDeployEnvironment(fixture.source, credentials, fixture.scratch))
        .toThrow(/requires exactly/);
    }
  });

  it.each(['success', 'exit-failure', 'unknown-outcome'])('retains encrypted refresh state after %s and blocks reuse of the original profile', async (outcome) => {
    const fixture = await encryptedFixture();
    const environment = createWranglerDeployEnvironment(fixture.source, {}, fixture.scratch);
    const refreshed = envelopeBytes('new-refresh-state');
    const logs = [];
    const deploy = () => runWranglerDeployment('wrangler.js', 'artifact.json', '/artifact', environment, () => {
      writeFileSync(encryptedTarget(environment), refreshed);
      if (outcome !== 'success') {
        const error = new Error('synthetic deployment failure');
        if (outcome === 'exit-failure') error.status = 1;
        throw error;
      }
    }, (message) => logs.push(message));
    if (outcome === 'success') expect(deploy).not.toThrow();
    else expect(deploy).toThrow(/synthetic deployment failure/);
    expect(await readFile(encryptedTarget(environment))).toEqual(refreshed);
    expect(await readFile(fixture.sourcePath)).toEqual(fixture.bytes);
    expect(logs.at(-1)).toMatch(/requires reconciliation/);
    expect(logs.join('\n')).not.toContain(refreshed.toString());
    const nextScratch = await temporaryRoot();
    expect(() => createWranglerDeployEnvironment(fixture.source, {}, nextScratch))
      .toThrow(/requires reconciliation/);
  });

  it('preserves refreshed ciphertext and a concurrent change to the original independently', async () => {
    const fixture = await encryptedFixture();
    const environment = createWranglerDeployEnvironment(fixture.source, {}, fixture.scratch);
    const concurrent = envelopeBytes('concurrent-native-login');
    const refreshed = envelopeBytes('isolated-refresh');
    runWranglerDeployment('wrangler.js', 'artifact.json', '/artifact', environment, () => {
      writeFileSync(fixture.sourcePath, concurrent);
      writeFileSync(encryptedTarget(environment), refreshed);
    }, () => {});
    expect(await readFile(fixture.sourcePath)).toEqual(concurrent);
    expect(await readFile(encryptedTarget(environment))).toEqual(refreshed);
  });

  it.each(['unknown-exit', 'partial-refresh', 'new-guard-entry', 'new-session-entry', 'replaced-file'])('retains rather than recursively removes uncertain state: %s', async (change) => {
    const fixture = await encryptedFixture();
    const environment = createWranglerDeployEnvironment(fixture.source, {}, fixture.scratch);
    const target = encryptedTarget(environment);
    const logs = [];
    if (change === 'replaced-file') {
      await rm(target);
      await writeFile(target, fixture.bytes, { mode: 0o600 });
    }
    const deploy = () => runWranglerDeployment('wrangler.js', 'artifact.json', '/artifact', environment, () => {
      if (change === 'unknown-exit') throw new Error('unknown child status');
      if (change === 'partial-refresh') writeFileSync(target, '{');
      if (change === 'new-guard-entry') mkdirSync(path.join(fixture.guard, 'unrelated'));
      if (change === 'new-session-entry') writeFileSync(path.join(environment.XDG_CONFIG_HOME, 'unrelated'), 'user work');
    }, (message) => logs.push(message));
    if (change === 'unknown-exit') expect(deploy).toThrow(/unknown child status/);
    else expect(deploy).not.toThrow();
    expect((await lstat(fixture.guard)).isDirectory()).toBe(true);
    expect((await lstat(target)).isFile()).toBe(true);
    expect(logs.at(-1)).toMatch(/requires reconciliation/);
    expect(await readFile(fixture.sourcePath)).toEqual(fixture.bytes);
  });

  it('keeps durable encrypted state when the general release scratch is removed', async () => {
    const fixture = await encryptedFixture();
    const environment = createWranglerDeployEnvironment(fixture.source, {}, fixture.scratch);
    await rm(fixture.scratch, { recursive: true });
    expect(await readFile(encryptedTarget(environment))).toEqual(fixture.bytes);
    expect((await lstat(fixture.guard)).isDirectory()).toBe(true);
  });

  it.each(['lstatSync', 'readdirSync'])('retains the complete session when cleanup directory inspection throws: %s', async (method) => {
    const fixture = await encryptedFixture();
    // Fault injection is confined to a fresh Node process and synthetic files;
    // production code has no injectable filesystem or credential test hook.
    const program = `
      import fs from 'node:fs';
      import path from 'node:path';
      import { syncBuiltinESMExports } from 'node:module';
      import { createWranglerDeployEnvironment, runWranglerDeployment } from ${JSON.stringify(new URL('./release-cloudflare.mjs', import.meta.url).href)};
      const input = JSON.parse(process.argv[1]);
      const originalBytes = fs.readFileSync(input.source.WRANGLER_ENCRYPTED_OAUTH_CONFIG_PATH);
      const environment = createWranglerDeployEnvironment(input.source, {}, input.scratch);
      const target = path.join(environment.XDG_CONFIG_HOME, '.wrangler', 'config', 'default.enc');
      const original = fs[input.method];
      let injected = 0;
      fs[input.method] = (...args) => {
        if (args[0] === path.dirname(target) && injected === 0) {
          injected += 1;
          throw Object.assign(new Error('synthetic directory inspection failure'), { code: 'EIO' });
        }
        return original(...args);
      };
      syncBuiltinESMExports();
      const logs = [];
      try {
        runWranglerDeployment('synthetic-wrangler', 'synthetic-artifact', '/artifact', environment, () => {}, message => logs.push(message));
      } finally {
        fs[input.method] = original;
        syncBuiltinESMExports();
      }
      process.stdout.write(JSON.stringify({
        injected,
        retained: fs.existsSync(target) && fs.readFileSync(target).equals(originalBytes),
        guardRetained: fs.existsSync(input.guard),
        originalUnchanged: fs.readFileSync(input.source.WRANGLER_ENCRYPTED_OAUTH_CONFIG_PATH).equals(originalBytes),
        reconciliationReported: logs.at(-1)?.includes('requires reconciliation') === true,
      }));
    `;
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', program,
      JSON.stringify({ source: fixture.source, scratch: fixture.scratch, guard: fixture.guard, method })], {
      encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 10_000,
    });
    expect(child.status, child.stderr).toBe(0);
    expect(JSON.parse(child.stdout)).toEqual({
      injected: 1, retained: true, guardRetained: true,
      originalUnchanged: true, reconciliationReported: true,
    });
  });

  it.each([true, false])('checks retained-session guards before any legacy OAuth fallback (encrypted path supplied: %s)', async (includeEncryptedPath) => {
    const fixture = await encryptedFixture();
    const environment = createWranglerDeployEnvironment(fixture.source, {}, fixture.scratch);
    const legacyBytes = [
      `oauth_token = "${'o'.repeat(48)}"`,
      'expiration_time = "2026-08-29T00:00:00.000Z"',
      `refresh_token = "${'r'.repeat(48)}"`,
      'scopes = ["account:read", "workers:write"]', '',
    ].join('\n');
    await writeFile(fixture.source.WRANGLER_OAUTH_CONFIG_PATH, legacyBytes, { mode: 0o600 });
    await rm(fixture.sourcePath);
    const source = { ...fixture.source };
    if (!includeEncryptedPath) delete source.WRANGLER_ENCRYPTED_OAUTH_CONFIG_PATH;
    const nextScratch = await temporaryRoot();
    expect(() => createWranglerDeployEnvironment(source, {}, nextScratch))
      .toThrow(/requires reconciliation/);
    expect(await readFile(encryptedTarget(environment))).toEqual(fixture.bytes);
    expect(await readFile(source.WRANGLER_OAUTH_CONFIG_PATH, 'utf8')).toBe(legacyBytes);

    // An explicitly selected, independently validated API token is a separate
    // authentication source, not reuse of the unresolved OAuth profile.
    const tokenEnvironment = createWranglerDeployEnvironment(source, {
      CLOUDFLARE_ACCOUNT_ID: EXPECTED_CLOUDFLARE_ACCOUNT_ID,
      CLOUDFLARE_API_TOKEN: 't'.repeat(32),
    }, await temporaryRoot());
    expect(tokenEnvironment.CLOUDFLARE_API_TOKEN).toBe('t'.repeat(32));
    expect((await lstat(fixture.guard)).isDirectory()).toBe(true);
  });

  it('preserves refreshed synthetic ciphertext when its release process is killed before finally', async () => {
    const fixture = await encryptedFixture();
    const refreshed = envelopeBytes('synthetic-refreshed-before-sigkill');
    const program = `
      import fs from 'node:fs';
      import path from 'node:path';
      import { createWranglerDeployEnvironment, runWranglerDeployment } from ${JSON.stringify(new URL('./release-cloudflare.mjs', import.meta.url).href)};
      const input = JSON.parse(process.argv[1]);
      const environment = createWranglerDeployEnvironment(input.source, {}, input.scratch);
      runWranglerDeployment('synthetic-wrangler', 'synthetic-artifact', '/artifact', environment, () => {
        fs.writeFileSync(path.join(environment.XDG_CONFIG_HOME, '.wrangler', 'config', 'default.enc'), input.refreshed);
        fs.writeSync(1, JSON.stringify(environment.XDG_CONFIG_HOME));
        process.kill(process.pid, 'SIGKILL');
      }, () => {});
    `;
    const child = spawnSync(process.execPath, ['--input-type=module', '--eval', program,
      JSON.stringify({ source: fixture.source, scratch: fixture.scratch, refreshed: refreshed.toString() })], {
      encoding: 'utf8', env: { PATH: process.env.PATH }, timeout: 10_000,
    });
    expect(child.status).toBeNull();
    expect(child.signal, child.stderr).toBe('SIGKILL');
    const configHome = JSON.parse(child.stdout);
    await rm(fixture.scratch, { recursive: true });
    expect(await readFile(encryptedTarget({ XDG_CONFIG_HOME: configHome }))).toEqual(refreshed);
    expect(await readFile(fixture.sourcePath)).toEqual(fixture.bytes);
    expect((await lstat(fixture.guard)).isDirectory()).toBe(true);
    expect(() => createWranglerDeployEnvironment(fixture.source, {}, fixture.scratch))
      .toThrow(/requires reconciliation/);
  });

  it.each(['empty', 'oversized', 'invalid-json', 'wrong-version', 'wrong-algorithm', 'extra-key',
    'duplicate-key', 'escaped-key', 'bad-iv', 'bad-tag', 'bad-base64', 'empty-ciphertext',
    'public-mode', 'special-mode', 'hardlink', 'symlink', 'directory'])('rejects unsafe encrypted profile %s without falling back to plaintext', async (kind) => {
    const fixture = await encryptedFixture();
    const value = JSON.parse(fixture.bytes);
    const replacements = {
      empty: Buffer.alloc(0), oversized: Buffer.alloc(16_385, 'a'), 'invalid-json': '{',
      'duplicate-key': fixture.bytes.toString().replace('"v": 1', '"v": 1, "v": 1'),
      'escaped-key': fixture.bytes.toString().replace('"v"', '"\\u0076"'),
    };
    if (kind in replacements) await writeFile(fixture.sourcePath, replacements[kind]);
    else if (kind === 'public-mode') await chmod(fixture.sourcePath, 0o644);
    else if (kind === 'special-mode') await chmod(fixture.sourcePath, 0o4600);
    else if (kind === 'hardlink') await link(fixture.sourcePath, `${fixture.sourcePath}.link`);
    else if (kind === 'symlink') {
      await writeFile(`${fixture.sourcePath}.real`, fixture.bytes, { mode: 0o600 });
      await rm(fixture.sourcePath);
      await symlink(`${fixture.sourcePath}.real`, fixture.sourcePath);
    } else if (kind === 'directory') {
      await rm(fixture.sourcePath);
      await mkdir(fixture.sourcePath);
    } else {
      if (kind === 'wrong-version') value.v = 2;
      if (kind === 'wrong-algorithm') value.alg = 'AES-128-GCM';
      if (kind === 'extra-key') value.other = 'not-allowed';
      if (kind === 'bad-iv') value.iv = Buffer.alloc(11).toString('base64');
      if (kind === 'bad-tag') value.tag = Buffer.alloc(15).toString('base64');
      if (kind === 'bad-base64') value.ciphertext = 'YQ';
      if (kind === 'empty-ciphertext') value.ciphertext = '';
      await writeFile(fixture.sourcePath, JSON.stringify(value));
    }
    expect(() => createWranglerDeployEnvironment(fixture.source, {}, fixture.scratch))
      .toThrow(/valid bounded envelope/);
    await expect(lstat(fixture.guard)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('rejects recovery inside the repository or release scratch and a writable source directory', async () => {
    const fixture = await encryptedFixture();
    expect(() => createWranglerDeployEnvironment(fixture.source, {}, fixture.scratch, fixture.sourceRoot))
      .toThrow(/outside the repository/);
    expect(() => createWranglerDeployEnvironment(fixture.source, {}, fixture.sourceRoot))
      .toThrow(/outside the repository/);
    await chmod(path.dirname(fixture.sourcePath), 0o777);
    expect(() => createWranglerDeployEnvironment(fixture.source, {}, fixture.scratch))
      .toThrow(/private directory/);
  });

  it('does not validate credentials, reinstall tools or run Wrangler in check-only mode', async () => {
    let deploymentCalls = 0;
    await expect(executeDeployUnlessCheckOnly(true, async () => {
      deploymentCalls += 1;
      throw new Error('deployment callback must not run');
    })).resolves.toBe(false);
    expect(deploymentCalls).toBe(0);

    await expect(executeDeployUnlessCheckOnly(false, async () => {
      deploymentCalls += 1;
    })).resolves.toBe(true);
    expect(deploymentCalls).toBe(1);
  });
});

async function temporaryRoot() {
  const root = await mkdtemp(path.join(tmpdir(), 'tailing-release-cloudflare-test-'));
  temporaryRoots.push(root);
  return root;
}

function envelopeBytes(payload = 'synthetic-opaque-ciphertext') {
  return Buffer.from(JSON.stringify({
    v: 1, alg: 'AES-256-GCM', iv: Buffer.alloc(12, 1).toString('base64'),
    tag: Buffer.alloc(16, 2).toString('base64'), ciphertext: Buffer.from(payload).toString('base64'),
  }, null, '\t'));
}

function encryptedTarget(environment) {
  return path.join(environment.XDG_CONFIG_HOME, '.wrangler', 'config', 'default.enc');
}

async function encryptedFixture() {
  const sourceRoot = await temporaryRoot();
  const scratch = await temporaryRoot();
  const sourcePath = path.join(sourceRoot, '.wrangler', 'config', 'default.enc');
  const bytes = envelopeBytes();
  await mkdir(path.dirname(sourcePath), { recursive: true, mode: 0o700 });
  await writeFile(sourcePath, bytes, { mode: 0o600 });
  return {
    sourceRoot, scratch, sourcePath, bytes,
    guard: path.join(path.dirname(sourcePath), '.tailing-release-auth'),
    source: {
      PATH: '/usr/bin:/bin', GH_TOKEN: 'github-secret', GH_HOST: 'github.com',
      WRANGLER_ENCRYPTED_OAUTH_CONFIG_PATH: sourcePath,
      WRANGLER_OAUTH_CONFIG_PATH: path.join(path.dirname(sourcePath), 'default.toml'),
    },
  };
}
