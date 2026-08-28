import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { hasExactKeys, hasExactStatuses, normalizeReport, runtimeKeys } from './release-report.mjs';

const run = (command, args, options = {}) => execFileSync(command, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...options }).trim();
const fail = (message) => { throw new Error(`release blocked: ${message}`); };

if (run('git', ['status', '--porcelain'])) fail('working tree is not clean');
if (run('git', ['branch', '--show-current']) !== 'main') fail('release must originate from main');
const head = run('git', ['rev-parse', 'HEAD']);
run('git', ['fetch', '--quiet', 'origin', 'main']);
const originMain = run('git', ['rev-parse', 'refs/remotes/origin/main']);
if (head !== originMain) fail('HEAD does not match origin/main');

let runs;
try {
  runs = JSON.parse(run('gh', ['run', 'list', '--workflow', 'Tailing Sentinel', '--commit', head, '--limit', '20', '--json', 'databaseId,status,conclusion,headSha,url,event,headBranch,workflowName,createdAt']));
} catch (error) {
  fail(`could not read GitHub checks (${error instanceof Error ? error.message : String(error)})`);
}
const successful = runs.find((item) => item.headSha === head
  && item.status === 'completed'
  && item.conclusion === 'success'
  && item.event === 'push'
  && item.headBranch === 'main'
  && item.workflowName === 'Tailing Sentinel');
if (!successful) fail(`no successful Tailing Sentinel run exists for ${head}`);

const localReport = JSON.parse(readFileSync('evaluation/latest-report.json', 'utf8'));
const artifactDirectory = mkdtempSync(path.join(tmpdir(), 'tailing-release-'));
let ciReport;
try {
  run('gh', ['run', 'download', String(successful.databaseId), '--name', `tailing-sentinel-${head}`, '--dir', artifactDirectory]);
  const flatReport = path.join(artifactDirectory, 'latest-report.json');
  const nestedReport = path.join(artifactDirectory, 'evaluation', 'latest-report.json');
  const reportPath = existsSync(flatReport) ? flatReport : nestedReport;
  if (!existsSync(reportPath)) fail('successful CI run did not publish latest-report.json');
  ciReport = JSON.parse(readFileSync(reportPath, 'utf8'));
} finally {
  rmSync(artifactDirectory, { recursive: true, force: true });
}

if (ciReport.sourceRevision !== head) fail('CI report is not bound to the release commit');
if (ciReport.hardGateFailures.length || ciReport.verdict === 'reject') fail('CI Sentinel report is not releasable');
if (!hasExactStatuses(ciReport.upstreamGates, 'success')) fail('CI report has incomplete or unexpected upstream gates');
if (!hasExactKeys(ciReport.runtime, runtimeKeys)
  || !/^v24\./.test(ciReport.runtime.node)
  || ciReport.runtime.platform !== 'linux'
  || ciReport.runtime.architecture !== 'x64') fail('CI report runtime is outside the locked Node 24 / Linux x64 release profile');
if (localReport.sourceRevision !== null) fail('checked-in report must identify itself as a local working-tree report');
if (!hasExactStatuses(localReport.upstreamGates, 'not-reported-local')) fail('checked-in report contains missing, unexpected or forged upstream gate outcomes');
if (!hasExactKeys(localReport.runtime, runtimeKeys)
  || localReport.runtime.node !== process.version
  || localReport.runtime.platform !== process.platform
  || localReport.runtime.architecture !== process.arch) fail('checked-in report runtime does not match the release host');
if (JSON.stringify(normalizeReport(localReport)) !== JSON.stringify(normalizeReport(ciReport))) {
  fail('checked-in report and successful CI artifact describe different source evidence');
}

console.log(`Release guard: PASS · commit ${head} · CI ${successful.databaseId} · report ${ciReport.artifactDigest}`);
if (process.argv.includes('--check-only')) process.exit(0);

const releaseEnvironment = { ...process.env, NEXT_PUBLIC_TAILING_COMMIT_SHA: head };
execFileSync('npm', ['run', 'build'], { stdio: 'inherit', env: releaseEnvironment });
if (run('git', ['status', '--porcelain'])) fail('build changed tracked release sources');
run('git', ['fetch', '--quiet', 'origin', 'main']);
if (run('git', ['rev-parse', 'refs/remotes/origin/main']) !== head) fail('origin/main changed during the release build');
execFileSync('npx', ['wrangler', 'deploy', '--config', 'dist/server/wrangler.json'], { stdio: 'inherit', env: releaseEnvironment });
