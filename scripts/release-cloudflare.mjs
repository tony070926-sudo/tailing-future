import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  closeSync,
  constants as fileConstants,
  copyFileSync,
  fstatSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// Capture and erase Cloudflare credentials before any project-owned module is
// loaded. Only the final Wrangler child receives the validated copy.
const capturedCloudflareEnvironment = captureAndDeleteCloudflareEnvironment(process.env);

export const WRANGLER_VERSION = '4.127.0';
export const WRANGLER_LOCK_BIN_PATH = 'bin/wrangler.js';
export const WRANGLER_PACKAGE_BIN_PATH = './bin/wrangler.js';
export const EXPECTED_CLOUDFLARE_ACCOUNT_ID = '9755cd236862dadca7cf413336ee661b';
export const NPM_CI_ARGS = Object.freeze([
  'ci',
  '--ignore-scripts',
  '--no-audit',
  '--no-fund',
]);

const CLOUDFLARE_DEPLOY_KEYS = Object.freeze([
  'CLOUDFLARE_ACCOUNT_ID',
  'CLOUDFLARE_API_TOKEN',
]);
const WRANGLER_RESOLVED_URL = `https://registry.npmjs.org/wrangler/-/wrangler-${WRANGLER_VERSION}.tgz`;

export async function main({
  argv = process.argv,
  root = process.cwd(),
  sourceEnvironment = process.env,
  cloudflareEnvironment = capturedCloudflareEnvironment,
} = {}) {
  const checkOnly = argv.includes('--check-only');
  const scratchRoot = createCanonicalScratchRoot();
  try {
    const releaseInputs = resolveReleaseInputs(sourceEnvironment);
    replaceEnvironment(process.env, baseEnvironment(releaseInputs));
    const commandEnvironments = createPreflightEnvironments(releaseInputs, scratchRoot);
    const [
      githubPolicy,
      reportPolicy,
      comparatorPolicy,
      artifactPolicy,
    ] = await Promise.all([
      import('./github-release-policy.mjs'),
      import('./release-report.mjs'),
      import('./comparator-evidence-policy.mjs'),
      import('./release-artifact.mjs'),
    ]);
    const {
      releaseRepository,
      selectReleaseRun,
      sentinelWorkflow,
      validateArtifactListing,
      validateBranchProtection,
      validateWorkflowMetadata,
    } = githubPolicy;
    const {
      hasExactKeys,
      hasExactStatuses,
      reportsReleaseEquivalent,
      runtimeKeys,
    } = reportPolicy;
    const { validateComparatorEvidenceRegistry } = comparatorPolicy;
    const { validateExtractedReleaseArtifact } = artifactPolicy;

    const runGit = (args) => runText('git', args, { cwd: root, env: commandEnvironments.git });
    const runGh = (args) => runText('gh', args, { cwd: root, env: commandEnvironments.github });
    const fail = (message) => { throw new Error(`release blocked: ${message}`); };
    const assertBranchProtection = () => {
      let protection;
      try {
        protection = JSON.parse(runGh([
          'api',
          `repos/${releaseRepository.nameWithOwner}/branches/main/protection`,
        ]));
      } catch (error) {
        fail(`could not read current main protection (${publicError(error)})`);
      }
      const failures = validateBranchProtection(protection);
      if (failures.length) fail(failures.join('; '));
    };

    if (runGit(['status', '--porcelain'])) fail('working tree is not clean');
    if (runGit(['branch', '--show-current']) !== 'main') fail('release must originate from main');
    const head = runGit(['rev-parse', 'HEAD']);
    runGit(['fetch', '--quiet', 'origin', 'main']);
    const originMain = runGit(['rev-parse', 'refs/remotes/origin/main']);
    if (head !== originMain) fail('HEAD does not match origin/main');

    const registry = JSON.parse(readFileSync(path.join(root, 'evaluation/baselines/registry.json'), 'utf8'));
    const comparatorReceiptFailures = await validateComparatorEvidenceRegistry(registry, { root });
    if (comparatorReceiptFailures.length) fail(comparatorReceiptFailures.join('; '));

    let repository;
    let workflow;
    let runsPayload;
    try {
      repository = JSON.parse(runGh(['api', `repos/${releaseRepository.nameWithOwner}`]));
      workflow = JSON.parse(runGh(['api', `repos/${releaseRepository.nameWithOwner}/actions/workflows/${sentinelWorkflow.id}`]));
      runsPayload = JSON.parse(runGh([
        'api',
        `repos/${releaseRepository.nameWithOwner}/actions/workflows/${sentinelWorkflow.id}/runs?head_sha=${head}&event=push&branch=main&per_page=20`,
      ]));
    } catch (error) {
      fail(`could not read GitHub checks (${publicError(error)})`);
    }
    if (repository.id !== releaseRepository.id || repository.full_name !== releaseRepository.nameWithOwner) fail('authenticated GitHub repository does not match the pinned release repository');
    const workflowFailures = validateWorkflowMetadata(workflow);
    if (workflowFailures.length) fail(workflowFailures.join('; '));
    const successful = selectReleaseRun(runsPayload.workflow_runs, head);
    if (!successful) fail(`no successful Tailing Sentinel run exists for ${head}`);
    assertBranchProtection();

    let artifactPayload;
    try {
      artifactPayload = JSON.parse(runGh([
        'api',
        `repos/${releaseRepository.nameWithOwner}/actions/runs/${successful.id}/artifacts`,
      ]));
    } catch (error) {
      fail(`could not read Sentinel artifact metadata (${publicError(error)})`);
    }
    const { artifact, failures: artifactFailures } = validateArtifactListing(
      artifactPayload,
      successful,
      head,
    );
    if (artifactFailures.length || !artifact) fail(artifactFailures.join('; '));
    if (!Number.isSafeInteger(artifact.size_in_bytes)
        || artifact.size_in_bytes < 1
        || artifact.size_in_bytes > 5_000_000) {
      fail('Sentinel artifact size is invalid or exceeds the 5 MB release bound');
    }

    let archive;
    try {
      archive = execFileSync(
        'gh',
        ['api', `repos/${releaseRepository.nameWithOwner}/actions/artifacts/${artifact.id}/zip`],
        {
          cwd: root,
          encoding: null,
          env: commandEnvironments.github,
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: artifact.size_in_bytes + 1_000_000,
        },
      );
    } catch (error) {
      fail(`could not download the exact Sentinel artifact archive (${publicError(error)})`);
    }
    if (archive.length !== artifact.size_in_bytes) fail('downloaded Sentinel archive byte length differs from the artifact API');
    const archiveDigest = `sha256:${createHash('sha256').update(archive).digest('hex')}`;
    if (archiveDigest !== artifact.digest) fail('downloaded Sentinel archive digest differs from the artifact API');

    const localReport = JSON.parse(readFileSync(path.join(root, 'evaluation/latest-report.json'), 'utf8'));
    const archivePath = path.join(scratchRoot, 'artifact.zip');
    const extractedPath = path.join(scratchRoot, 'extracted');
    writeFileSync(archivePath, archive, { flag: 'wx', mode: 0o600 });
    mkdirSync(extractedPath, { mode: 0o700 });
    let ciReport;
    try {
      execFileSync(
        'python3',
        [
          path.join(root, 'scripts/safe_extract_zip.py'),
          '--archive',
          archivePath,
          '--output',
          extractedPath,
        ],
        {
          cwd: root,
          env: commandEnvironments.python,
          stdio: 'inherit',
        },
      );
      ({ report: ciReport } = await validateExtractedReleaseArtifact({
        root: extractedPath,
        commitSha: head,
      }));
    } catch (error) {
      fail(`could not validate the exact Sentinel release artifact (${publicError(error)})`);
    }
    const deployConfig = path.join(extractedPath, 'dist/server/wrangler.json');

    if (ciReport.sourceRevision !== head) fail('CI report is not bound to the release commit');
    if (ciReport.hardGateFailures.length || ciReport.verdict === 'reject') fail('CI Sentinel report is not releasable');
    if (!hasExactStatuses(ciReport.upstreamGates, 'success')) fail('CI report has incomplete or unexpected upstream gates');
    if (!hasExactKeys(ciReport.runtime, runtimeKeys)
        || !/^v24\./.test(ciReport.runtime.node)
        || ciReport.runtime.platform !== 'linux'
        || ciReport.runtime.architecture !== 'x64') {
      fail('CI report runtime is outside the locked Node 24 / Linux x64 release profile');
    }
    if (localReport.sourceRevision !== null) fail('checked-in report must identify itself as a local working-tree report');
    if (!hasExactStatuses(localReport.upstreamGates, 'not-reported-local')) fail('checked-in report contains missing, unexpected or forged upstream gate outcomes');
    if (!hasExactKeys(localReport.runtime, runtimeKeys)
        || localReport.runtime.node !== process.version
        || localReport.runtime.platform !== process.platform
        || localReport.runtime.architecture !== process.arch) {
      fail('checked-in report runtime does not match the release host');
    }
    if (!reportsReleaseEquivalent(localReport, ciReport)) {
      fail('checked-in report and successful CI artifact describe different source evidence');
    }

    console.log(`Release guard: PASS · commit ${head} · workflow ${sentinelWorkflow.id} · run ${successful.id}/attempt ${successful.run_attempt} · artifact ${artifact.id} ${artifact.digest} · report ${ciReport.artifactDigest}`);
    await executeDeployUnlessCheckOnly(checkOnly, async () => {
      const { wranglerEntry, environment: toolEnvironment } = rebuildWranglerTool({
        root,
        scratchRoot,
        sourceEnvironment: releaseInputs,
      });

      // Recheck mutable remote state after the networked tool rebuild and
      // immediately before the only process that receives Cloudflare secrets.
      if (runGit(['status', '--porcelain'])) fail('working tree changed before deployment');
      runGit(['fetch', '--quiet', 'origin', 'main']);
      if (runGit(['rev-parse', 'refs/remotes/origin/main']) !== head) fail('origin/main changed before deployment');
      assertBranchProtection();
      assertNoDeploymentCredentials(toolEnvironment);
      try {
        await validateExtractedReleaseArtifact({ root: extractedPath, commitSha: head });
      } catch (error) {
        fail(`validated release artifact changed before deployment (${publicError(error)})`);
      }
      const deployEnvironment = createWranglerDeployEnvironment(
        releaseInputs,
        cloudflareEnvironment,
        scratchRoot,
      );
      execFileSync(
        process.execPath,
        [wranglerEntry, 'deploy', '--config', deployConfig],
        {
          cwd: extractedPath,
          env: deployEnvironment,
          stdio: 'inherit',
        },
      );
    });
  } finally {
    rmSync(scratchRoot, { recursive: true, force: true });
  }
}

export function captureAndDeleteCloudflareEnvironment(environment) {
  const captured = {};
  for (const key of Object.keys(environment)) {
    if (!key.startsWith('CLOUDFLARE_')) continue;
    captured[key] = environment[key];
    delete environment[key];
  }
  return Object.freeze(captured);
}

export function createCanonicalScratchRoot() {
  return realpathSync(mkdtempSync(path.join(tmpdir(), 'tailing-release-')));
}

export function resolveReleaseInputs(sourceEnvironment, runAuthCommand = execFileSync) {
  const base = baseEnvironment(sourceEnvironment);
  const explicitTokens = [sourceEnvironment.GH_TOKEN, sourceEnvironment.GITHUB_TOKEN]
    .filter((value) => typeof value === 'string' && value.length > 0);
  if (explicitTokens.length === 2 && explicitTokens[0] !== explicitTokens[1]) {
    throw new Error('release blocked: GH_TOKEN and GITHUB_TOKEN disagree');
  }
  if (sourceEnvironment.GH_HOST && sourceEnvironment.GH_HOST !== 'github.com') {
    throw new Error('release blocked: GitHub release host must be github.com');
  }
  let githubToken = explicitTokens[0];
  if (!githubToken) {
    const authEnvironment = githubAuthDiscoveryEnvironment(sourceEnvironment);
    try {
      githubToken = runAuthCommand(
        'gh',
        ['auth', 'token', '--hostname', 'github.com'],
        {
          encoding: 'utf8',
          env: authEnvironment,
          stdio: ['ignore', 'pipe', 'pipe'],
          maxBuffer: 4096,
        },
      ).trim();
    } catch {
      throw new Error('release blocked: no GitHub token is available from the environment or existing gh login');
    }
  }
  validateGitHubToken(githubToken);
  return Object.freeze({
    ...base,
    GH_HOST: 'github.com',
    GH_TOKEN: githubToken,
    WRANGLER_OAUTH_CONFIG_PATH: wranglerOAuthConfigPath(sourceEnvironment),
  });
}

export function createPreflightEnvironments(sourceEnvironment, scratchRoot) {
  const base = baseEnvironment(sourceEnvironment);
  const directories = createIsolatedDirectories(scratchRoot, 'preflight');
  validateGitHubToken(sourceEnvironment.GH_TOKEN);
  if (sourceEnvironment.GH_HOST !== 'github.com') {
    throw new Error('release blocked: isolated GitHub checks require the pinned github.com host');
  }
  const shared = {
    ...base,
    HOME: directories.home,
    XDG_CONFIG_HOME: directories.config,
    XDG_CACHE_HOME: directories.cache,
    TMPDIR: directories.temp,
  };
  const git = Object.freeze({
    ...shared,
    GIT_CONFIG_NOSYSTEM: '1',
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
  });
  const python = Object.freeze({
    ...shared,
    PYTHONDONTWRITEBYTECODE: '1',
    PYTHONHASHSEED: '0',
    PYTHONNOUSERSITE: '1',
  });
  const github = {
    ...shared,
    GH_CONFIG_DIR: path.join(directories.config, 'gh'),
    GH_HOST: 'github.com',
    GH_PAGER: 'cat',
    GH_PROMPT_DISABLED: '1',
    GH_TOKEN: sourceEnvironment.GH_TOKEN,
  };
  mkdirSync(github.GH_CONFIG_DIR, { recursive: true, mode: 0o700 });
  for (const environment of [git, python, github]) assertNoCloudflareVariables(environment);
  return Object.freeze({ git, python, github: Object.freeze(github) });
}

export function createWranglerDeployEnvironment(
  sourceEnvironment,
  cloudflareEnvironment,
  scratchRoot,
) {
  const keys = Object.keys(cloudflareEnvironment).sort();
  const usesEnvironmentCredentials = arraysEqual(keys, CLOUDFLARE_DEPLOY_KEYS);
  const usesOAuthConfig = keys.length === 0;
  if (!usesEnvironmentCredentials && !usesOAuthConfig) {
    throw new Error('release blocked: Cloudflare environment authentication requires exactly CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN');
  }
  const base = baseEnvironment(sourceEnvironment);
  const directories = createIsolatedDirectories(scratchRoot, 'wrangler');
  const deploymentEnvironment = {
    ...base,
    HOME: directories.home,
    XDG_CONFIG_HOME: directories.config,
    XDG_CACHE_HOME: directories.cache,
    TMPDIR: directories.temp,
    WRANGLER_SEND_METRICS: 'false',
    WRANGLER_WRITE_LOGS: 'false',
  };
  if (usesEnvironmentCredentials) {
    const accountId = cloudflareEnvironment.CLOUDFLARE_ACCOUNT_ID;
    const apiToken = cloudflareEnvironment.CLOUDFLARE_API_TOKEN;
    if (!/^[0-9a-f]{32}$/.test(accountId ?? '')) {
      throw new Error('release blocked: CLOUDFLARE_ACCOUNT_ID must be 32 lowercase hexadecimal characters');
    }
    if (accountId !== EXPECTED_CLOUDFLARE_ACCOUNT_ID) {
      throw new Error('release blocked: CLOUDFLARE_ACCOUNT_ID does not match the pinned Tailing Future account');
    }
    if (typeof apiToken !== 'string'
        || apiToken.length < 20
        || apiToken.length > 512
        || /[^\x21-\x7e]/.test(apiToken)) {
      throw new Error('release blocked: CLOUDFLARE_API_TOKEN is missing or malformed');
    }
    deploymentEnvironment.CLOUDFLARE_ACCOUNT_ID = accountId;
    deploymentEnvironment.CLOUDFLARE_API_TOKEN = apiToken;
  } else {
    deploymentEnvironment.CLOUDFLARE_ACCOUNT_ID = EXPECTED_CLOUDFLARE_ACCOUNT_ID;
    installWranglerOAuthConfig(
      sourceEnvironment.WRANGLER_OAUTH_CONFIG_PATH,
      directories.config,
    );
  }
  assertNoGitHubCredentials(deploymentEnvironment);
  return Object.freeze(deploymentEnvironment);
}

export function validateWranglerLock(packageJson, packageLock) {
  const rootLock = packageLock?.packages?.[''];
  const wranglerLock = packageLock?.packages?.['node_modules/wrangler'];
  if (packageJson?.devDependencies?.wrangler !== WRANGLER_VERSION
      || rootLock?.devDependencies?.wrangler !== WRANGLER_VERSION
      || wranglerLock?.version !== WRANGLER_VERSION
      || wranglerLock?.resolved !== WRANGLER_RESOLVED_URL
      || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(wranglerLock?.integrity ?? '')
      || wranglerLock?.bin?.wrangler !== WRANGLER_LOCK_BIN_PATH) {
    throw new Error(`release blocked: package-lock does not pin Wrangler ${WRANGLER_VERSION} exactly`);
  }
}

export function validateInstalledWranglerManifest(installedPackage) {
  if (installedPackage?.version !== WRANGLER_VERSION
      || installedPackage?.bin?.wrangler !== WRANGLER_PACKAGE_BIN_PATH) {
    throw new Error(`release blocked: rebuilt Wrangler manifest is not the exact ${WRANGLER_VERSION} package`);
  }
}

export async function executeDeployUnlessCheckOnly(checkOnly, deploy) {
  if (checkOnly) return false;
  await deploy();
  return true;
}

function rebuildWranglerTool({ root, scratchRoot, sourceEnvironment }) {
  const packageJson = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8'));
  const packageLock = JSON.parse(readFileSync(path.join(root, 'package-lock.json'), 'utf8'));
  validateWranglerLock(packageJson, packageLock);

  const toolRoot = path.join(scratchRoot, 'tool');
  mkdirSync(toolRoot, { mode: 0o700 });
  copyFileSync(path.join(root, 'package.json'), path.join(toolRoot, 'package.json'));
  copyFileSync(path.join(root, 'package-lock.json'), path.join(toolRoot, 'package-lock.json'));
  const base = baseEnvironment(sourceEnvironment);
  const directories = createIsolatedDirectories(scratchRoot, 'npm');
  const userConfig = path.join(directories.config, 'npmrc');
  const globalConfig = path.join(directories.config, 'global-npmrc');
  writeFileSync(userConfig, '', { flag: 'wx', mode: 0o600 });
  writeFileSync(globalConfig, '', { flag: 'wx', mode: 0o600 });
  const environment = Object.freeze({
    ...base,
    HOME: directories.home,
    XDG_CONFIG_HOME: directories.config,
    XDG_CACHE_HOME: directories.cache,
    TMPDIR: directories.temp,
    NPM_CONFIG_AUDIT: 'false',
    NPM_CONFIG_CACHE: directories.cache,
    NPM_CONFIG_FUND: 'false',
    NPM_CONFIG_GLOBALCONFIG: globalConfig,
    NPM_CONFIG_IGNORE_SCRIPTS: 'true',
    NPM_CONFIG_UPDATE_NOTIFIER: 'false',
    NPM_CONFIG_USERCONFIG: userConfig,
  });
  assertNoDeploymentCredentials(environment);
  execFileSync('npm', NPM_CI_ARGS, {
    cwd: toolRoot,
    env: environment,
    stdio: 'inherit',
  });

  const installedPackagePath = path.join(toolRoot, 'node_modules/wrangler/package.json');
  const wranglerEntry = path.join(toolRoot, 'node_modules/wrangler/bin/wrangler.js');
  const installedPackage = JSON.parse(readFileSync(installedPackagePath, 'utf8'));
  const packageMetadata = lstatSync(installedPackagePath);
  const entryMetadata = lstatSync(wranglerEntry);
  validateInstalledWranglerManifest(installedPackage);
  if (!packageMetadata.isFile()
      || packageMetadata.isSymbolicLink()
      || packageMetadata.nlink !== 1
      || !entryMetadata.isFile()
      || entryMetadata.isSymbolicLink()
      || entryMetadata.nlink !== 1) {
    throw new Error(`release blocked: rebuilt Wrangler is not the exact regular-file ${WRANGLER_VERSION} package`);
  }
  const actualVersion = runText(process.execPath, [wranglerEntry, '--version'], {
    cwd: toolRoot,
    env: environment,
  });
  if (actualVersion !== WRANGLER_VERSION) {
    throw new Error(`release blocked: rebuilt Wrangler reported ${JSON.stringify(actualVersion)} instead of ${WRANGLER_VERSION}`);
  }
  return { wranglerEntry, environment };
}

function createIsolatedDirectories(scratchRoot, prefix) {
  const base = path.join(scratchRoot, prefix);
  const directories = {
    home: path.join(base, 'home'),
    config: path.join(base, 'config'),
    cache: path.join(base, 'cache'),
    temp: path.join(base, 'tmp'),
  };
  for (const directory of Object.values(directories)) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
  }
  return directories;
}

function baseEnvironment(sourceEnvironment) {
  if (typeof sourceEnvironment.PATH !== 'string' || sourceEnvironment.PATH.length === 0) {
    throw new Error('release blocked: PATH is unavailable');
  }
  return Object.freeze({
    PATH: sourceEnvironment.PATH,
    CI: '1',
    LANG: 'C',
    LC_ALL: 'C',
    NO_COLOR: '1',
  });
}

function githubAuthDiscoveryEnvironment(sourceEnvironment) {
  const environment = {
    ...baseEnvironment(sourceEnvironment),
    GH_HOST: 'github.com',
    GH_PAGER: 'cat',
    GH_PROMPT_DISABLED: '1',
  };
  for (const key of ['HOME', 'XDG_CONFIG_HOME', 'GH_CONFIG_DIR']) {
    const value = sourceEnvironment[key];
    if (typeof value !== 'string' || value.length === 0) continue;
    if (!path.isAbsolute(value)) {
      throw new Error(`release blocked: ${key} must be absolute for existing gh login discovery`);
    }
    environment[key] = value;
  }
  assertNoCloudflareVariables(environment);
  return Object.freeze(environment);
}

function validateGitHubToken(token) {
  if (typeof token !== 'string'
      || token.length < 10
      || token.length > 512
      || /[^\x21-\x7e]/.test(token)) {
    throw new Error('release blocked: GitHub token is missing or malformed');
  }
}

function wranglerOAuthConfigPath(sourceEnvironment) {
  const xdgConfigHome = sourceEnvironment.XDG_CONFIG_HOME;
  if (typeof xdgConfigHome === 'string' && xdgConfigHome.length > 0) {
    if (!path.isAbsolute(xdgConfigHome)) return null;
    return path.join(xdgConfigHome, '.wrangler', 'config', 'default.toml');
  }
  const home = sourceEnvironment.HOME;
  if (typeof home !== 'string' || !path.isAbsolute(home)) return null;
  const configHome = process.platform === 'darwin'
    ? path.join(home, 'Library', 'Preferences')
    : path.join(home, '.config');
  return path.join(configHome, '.wrangler', 'config', 'default.toml');
}

function installWranglerOAuthConfig(sourcePath, isolatedConfigHome) {
  if (typeof sourcePath !== 'string' || !path.isAbsolute(sourcePath)) {
    throw new Error('release blocked: no bounded Wrangler OAuth config is available');
  }
  let descriptor;
  let before;
  let bytes;
  let after;
  try {
    descriptor = openSync(
      sourcePath,
      fileConstants.O_RDONLY | (fileConstants.O_NOFOLLOW ?? 0),
    );
    before = fstatSync(descriptor);
    if (!before.isFile()
        || before.nlink !== 1
        || (before.mode & 0o777) !== 0o600
        || before.size < 1
        || before.size > 16_384) {
      throw new Error('unsafe metadata');
    }
    bytes = readFileSync(descriptor);
    after = fstatSync(descriptor);
  } catch {
    throw new Error('release blocked: Wrangler OAuth config must be an exact regular 0600-style file of at most 16 KiB');
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
  if (bytes.length !== before.size
      || after.dev !== before.dev
      || after.ino !== before.ino
      || after.size !== before.size
      || after.mtimeMs !== before.mtimeMs) {
    throw new Error('release blocked: Wrangler OAuth config changed while it was read');
  }
  validateWranglerOAuthBytes(bytes);
  const targetDirectory = path.join(isolatedConfigHome, '.wrangler', 'config');
  const targetPath = path.join(targetDirectory, 'default.toml');
  mkdirSync(targetDirectory, { recursive: true, mode: 0o700 });
  writeFileSync(targetPath, bytes, { flag: 'wx', mode: 0o600 });
  const targetMetadata = lstatSync(targetPath);
  if (!targetMetadata.isFile()
      || targetMetadata.isSymbolicLink()
      || targetMetadata.nlink !== 1
      || (targetMetadata.mode & 0o777) !== 0o600
      || targetMetadata.size !== bytes.length) {
    throw new Error('release blocked: isolated Wrangler OAuth config failed post-copy validation');
  }
}

function validateWranglerOAuthBytes(bytes) {
  const text = bytes.toString('utf8');
  if (!Buffer.from(text, 'utf8').equals(bytes) || text.includes('\0')) {
    throw new Error('release blocked: Wrangler OAuth config is not canonical UTF-8 text');
  }
  const keys = [...text.matchAll(/^([A-Za-z_][A-Za-z0-9_]*)\s*=/gm)]
    .map((match) => match[1])
    .sort();
  const expected = ['expiration_time', 'oauth_token', 'refresh_token', 'scopes'];
  if (!arraysEqual(keys, expected)
      || !/^oauth_token\s*=\s*"[^"\r\n]{20,512}"\s*$/m.test(text)
      || !/^refresh_token\s*=\s*"[^"\r\n]{20,512}"\s*$/m.test(text)
      || !/^expiration_time\s*=\s*"[^"\r\n]{10,128}"\s*$/m.test(text)
      || !/^scopes\s*=\s*\[[^\r\n]*\]\s*$/m.test(text)) {
    throw new Error('release blocked: Wrangler OAuth config has an unexpected structure');
  }
}

function replaceEnvironment(environment, replacement) {
  for (const key of Object.keys(environment)) delete environment[key];
  for (const [key, value] of Object.entries(replacement)) environment[key] = value;
}

function assertNoCloudflareVariables(environment) {
  if (Object.keys(environment).some((key) => key.startsWith('CLOUDFLARE_'))) {
    throw new Error('release blocked: Cloudflare credentials crossed a pre-deployment process boundary');
  }
}

function assertNoGitHubCredentials(environment) {
  if (Object.keys(environment).some((key) => [
    'GH_TOKEN',
    'GITHUB_TOKEN',
    'GITHUB_PAT',
  ].includes(key))) {
    throw new Error('release blocked: GitHub credentials crossed into the deployment tool boundary');
  }
}

function assertNoDeploymentCredentials(environment) {
  assertNoCloudflareVariables(environment);
  assertNoGitHubCredentials(environment);
}

function arraysEqual(left, right) {
  return left.length === right.length
    && left.every((value, index) => value === right[index]);
}

function runText(command, args, { cwd, env }) {
  if (!env || typeof env !== 'object') throw new Error('release blocked: child process environment must be explicit');
  return execFileSync(command, args, {
    cwd,
    encoding: 'utf8',
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function publicError(error) {
  return error instanceof Error ? error.message : String(error);
}

const invokedPath = process.argv[1]
  ? pathToFileURL(path.resolve(process.argv[1])).href
  : null;
if (invokedPath === import.meta.url) await main();
