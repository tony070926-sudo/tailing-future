import { spawnSync } from 'node:child_process';
import {
  chmod,
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
