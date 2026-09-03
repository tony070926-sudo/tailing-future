#!/usr/bin/env node

import { pathToFileURL } from 'node:url';
import {
  FULL_CANDIDATE_REGISTRATION_WORKFLOW,
  FULL_CANDIDATE_REPOSITORY,
  FULL_CANDIDATE_SENTINEL_WORKFLOW,
} from './full-candidate-github-evidence-policy.mjs';
import {
  FULL_CANDIDATE_REGISTRATION_MAX_LIST_ITEMS,
  FULL_CANDIDATE_REGISTRATION_PAGE_SIZE,
  FullCandidateRegistrationPolicyError,
  fullCandidateRegistrationRejection,
  validateFullCandidateRegistrationCapture,
} from './full-candidate-registration-policy.mjs';
import {
  canonicalJson,
  parseJsonRejectDuplicateKeys,
} from './runtime-input-contract.mjs';

export const FULL_CANDIDATE_REGISTRATION_HTTP_CONTRACT = Object.freeze({
  apiOrigin: 'https://api.github.com',
  apiVersion: '2022-11-28',
  hashAlgorithmApiVersion: '2026-03-10',
  maxResponseBytes: 10 * 1024 * 1024,
  method: 'GET',
  redirect: 'error',
  requestTimeoutMs: 20_000,
  userAgent: 'tailing-future-registration-inspector/0.1',
});

const REPOSITORY_PATH = `/repos/${FULL_CANDIDATE_REPOSITORY}`;
const REGISTRATION = FULL_CANDIDATE_REGISTRATION_WORKFLOW.registration;
const TOKEN_ENVIRONMENT_VARIABLE = 'GITHUB_TOKEN';
const REVISION_PATTERN = /^[0-9a-f]{40}$/;

/**
 * Read the fixed GitHub control-plane surface twice. No arguments, URLs, IDs,
 * methods, bodies, claims or scientific data may be supplied by the caller.
 */
export async function inspectFullCandidateRegistration() {
  let token = '';
  try {
    if (arguments.length !== 0) {
      throw policyError(
        'non-self-reporting-input-rejected',
        'registration inspection accepts no caller-supplied URL, method, body, identity, token, run, artifact or claim',
      );
    }
    token = requireToken(process.env[TOKEN_ENVIRONMENT_VARIABLE]);
    const startedAt = new Date().toISOString();
    const first = await collectSnapshot(token);
    const second = await collectSnapshot(token);
    const completedAt = new Date().toISOString();
    return validateFullCandidateRegistrationCapture({
      completedAt,
      passes: [first, second],
      startedAt,
    });
  } catch (error) {
    return fullCandidateRegistrationRejection(error, token);
  }
}

async function collectSnapshot(token) {
  const branch = await getJson(endpoint('branch'), token);
  const currentTreeOid = branch?.commit?.commit?.tree?.sha;
  if (!REVISION_PATTERN.test(currentTreeOid ?? '')) {
    throw policyError(
      'registration-current-main-invalid',
      'current main did not provide a valid tree identity',
    );
  }

  const [
    actor,
    branchProtection,
    checkRun,
    checkSuite,
    compare,
    currentTree,
    hashAlgorithm,
    jobs,
    registrationBlob,
    registrationCommit,
    registrationTree,
    repository,
    repositoryRuns,
    runAttempt,
    sentinelWorkflow,
    targetRuns,
    workflowByFilename,
    workflowById,
    workflows,
  ] = await Promise.all([
    getJson(endpoint('actor'), token),
    getJson(endpoint('branchProtection'), token),
    getJson(endpoint('checkRun'), token),
    getJson(endpoint('checkSuite'), token),
    getJson(endpoint('compare'), token),
    getJson(endpoint('tree', { treeOid: currentTreeOid }), token),
    getJson(endpoint('hashAlgorithm'), token),
    getPaginatedJson('jobs', 'jobs', token),
    getJson(endpoint('registrationBlob'), token),
    getJson(endpoint('registrationCommit'), token),
    getJson(endpoint('tree', { treeOid: REGISTRATION.treeOid }), token),
    getJson(endpoint('repository'), token),
    getPaginatedJson('repositoryRuns', 'workflow_runs', token),
    getJson(endpoint('runAttempt'), token),
    getJson(endpoint('sentinelWorkflow'), token),
    getPaginatedJson('targetRuns', 'workflow_runs', token),
    getJson(endpoint('workflowByFilename'), token),
    getJson(endpoint('workflowById'), token),
    getPaginatedJson('workflows', 'workflows', token),
  ]);

  return {
    actor,
    branch,
    branchProtection,
    checkRun,
    checkSuite,
    compare,
    currentTree,
    hashAlgorithm,
    jobs,
    registrationBlob,
    registrationCommit,
    registrationTree,
    repository,
    repositoryRuns,
    runAttempt,
    sentinelWorkflow,
    targetRuns,
    workflowByFilename,
    workflowById,
    workflows,
  };
}

async function getPaginatedJson(kind, itemKey, token) {
  const first = await getJsonWithMetadata(endpoint(kind, { page: 1 }), token);
  const totalCount = first.payload?.total_count;
  if (!Number.isSafeInteger(totalCount)
      || totalCount < 0
      || totalCount > FULL_CANDIDATE_REGISTRATION_MAX_LIST_ITEMS) {
    throw policyError(
      'registration-pagination-invalid',
      `${kind} total_count is invalid or exceeds the auditable bound`,
    );
  }
  const dataPages = Math.ceil(totalCount / FULL_CANDIDATE_REGISTRATION_PAGE_SIZE);
  const terminalPage = dataPages + 1;
  const pages = [];
  for (let page = 1; page <= terminalPage; page += 1) {
    const request = endpoint(kind, { page });
    const result = page === 1
      ? first
      : await getJsonWithMetadata(request, token);
    const expectNext = page < dataPages;
    const expectedNext = expectNext ? endpoint(kind, { page: page + 1 }).url : null;
    validateLinkHeader(result.link, expectedNext, request.url, `${kind} page ${page}`);
    pages.push({ page, payload: result.payload });
  }
  return { itemKey, pages };
}

async function getJson(request, token) {
  return (await getJsonWithMetadata(request, token)).payload;
}

async function getJsonWithMetadata(request, token) {
  const requestUrl = validateRequest(request);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FULL_CANDIDATE_REGISTRATION_HTTP_CONTRACT.requestTimeoutMs);
  let response;
  try {
    response = await globalThis.fetch(requestUrl, {
      body: undefined,
      cache: 'no-store',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'Cache-Control': 'no-cache',
        'User-Agent': FULL_CANDIDATE_REGISTRATION_HTTP_CONTRACT.userAgent,
        'X-GitHub-Api-Version': request.apiVersion,
      },
      method: 'GET',
      redirect: 'error',
      signal: controller.signal,
    });
  } catch {
    clearTimeout(timeout);
    throw policyError('github-get-failed', `fixed GitHub GET ${request.label} failed`);
  }
  try {
    if (response?.redirected !== false || response.url !== requestUrl) {
      throw policyError('github-redirect-rejected', `fixed GitHub GET ${request.label} redirected or changed origin`);
    }
    if (response.status !== 200) {
      throw policyError('github-http-rejected', `fixed GitHub GET ${request.label} returned HTTP ${response.status}`);
    }
    const selectedApiVersion = response.headers?.get?.('x-github-api-version-selected');
    if ((selectedApiVersion !== null && selectedApiVersion !== request.apiVersion)
        || response.headers?.get?.('deprecation') !== null
        || response.headers?.get?.('sunset') !== null) {
      throw policyError(
        'github-api-version-rejected',
        `fixed GitHub GET ${request.label} selected a different or deprecated REST API version`,
      );
    }
    const contentType = response.headers?.get?.('content-type') ?? '';
    if (!/^application\/(?:[A-Za-z0-9.+-]*\+)?json(?:\s*;|$)/i.test(contentType)) {
      throw policyError('github-content-type-rejected', `fixed GitHub GET ${request.label} did not return JSON`);
    }
    const declaredLength = response.headers?.get?.('content-length');
    if (declaredLength !== null && declaredLength !== undefined && declaredLength !== '') {
      const length = Number(declaredLength);
      if (!Number.isSafeInteger(length)
          || length < 0
          || length > FULL_CANDIDATE_REGISTRATION_HTTP_CONTRACT.maxResponseBytes) {
        throw policyError('github-response-size-rejected', `fixed GitHub GET ${request.label} declared an invalid response size`);
      }
    }
    const bytes = await readBoundedBody(response, request.label);
    if (bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) {
      throw policyError('github-json-invalid', `fixed GitHub GET ${request.label} returned a forbidden UTF-8 BOM`);
    }
    let payload;
    try {
      payload = parseJsonRejectDuplicateKeys(bytes, `GitHub ${request.label}`);
    } catch {
      throw policyError('github-json-invalid', `fixed GitHub GET ${request.label} returned invalid strict JSON`);
    }
    if (payload === null || typeof payload !== 'object' || Array.isArray(payload)) {
      throw policyError('github-json-invalid', `fixed GitHub GET ${request.label} did not return a JSON object`);
    }
    return { link: response.headers.get('link'), payload };
  } finally {
    clearTimeout(timeout);
  }
}

async function readBoundedBody(response, label) {
  if (!response.body || typeof response.body.getReader !== 'function') {
    throw policyError('github-response-body-invalid', `fixed GitHub GET ${label} returned no readable body`);
  }
  const reader = response.body.getReader();
  const chunks = [];
  let total = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!(value instanceof Uint8Array) || value.length === 0) {
        throw policyError('github-response-body-invalid', `fixed GitHub GET ${label} returned an invalid body chunk`);
      }
      total += value.length;
      if (total > FULL_CANDIDATE_REGISTRATION_HTTP_CONTRACT.maxResponseBytes) {
        throw policyError('github-response-size-rejected', `fixed GitHub GET ${label} exceeded the response byte bound`);
      }
      chunks.push(Buffer.from(value));
    }
  } catch (error) {
    if (error instanceof FullCandidateRegistrationPolicyError) throw error;
    throw policyError('github-get-failed', `fixed GitHub GET ${label} response body failed`);
  } finally {
    reader.releaseLock?.();
  }
  if (total === 0) throw policyError('github-response-body-invalid', `fixed GitHub GET ${label} returned an empty body`);
  return Buffer.concat(chunks, total);
}

function validateLinkHeader(header, expectedNextUrl, currentUrl, label) {
  if (header === null || header === undefined || header === '') {
    if (expectedNextUrl !== null) {
      throw policyError('registration-pagination-invalid', `${label} omitted the required next-page link`);
    }
    return;
  }
  if (typeof header !== 'string' || header.length > 8_192 || /[\u0000-\u001f\u007f]/.test(header)) {
    throw policyError('registration-pagination-invalid', `${label} returned a malformed Link header`);
  }
  const relations = new Map();
  for (const part of header.split(',')) {
    const match = /^\s*<([^<>]+)>\s*;\s*rel="([a-z]+)"\s*$/.exec(part);
    if (!match || relations.has(match[2])) {
      throw policyError('registration-pagination-invalid', `${label} returned an ambiguous Link header`);
    }
    let linked;
    try {
      linked = new URL(match[1]);
    } catch {
      throw policyError('registration-pagination-invalid', `${label} returned a malformed Link URL`);
    }
    const current = new URL(currentUrl);
    if (linked.protocol !== 'https:'
        || linked.origin !== FULL_CANDIDATE_REGISTRATION_HTTP_CONTRACT.apiOrigin
        || linked.username !== ''
        || linked.password !== ''
        || linked.hash !== ''
        || canonicalRepositoryPath(linked.pathname) !== canonicalRepositoryPath(current.pathname)
        || linked.searchParams.size !== 2
        || linked.searchParams.get('per_page') !== String(FULL_CANDIDATE_REGISTRATION_PAGE_SIZE)
        || !/^(?:[1-9]|[1-9][0-9]|100)$/.test(linked.searchParams.get('page') ?? '')) {
      throw policyError('registration-pagination-invalid', `${label} returned an off-contract Link URL`);
    }
    relations.set(match[2], linked.href);
  }
  const next = relations.get('next') ?? null;
  if ((next === null) !== (expectedNextUrl === null)
      || (next !== null && !sameUrlQuery(next, expectedNextUrl))) {
    throw policyError('registration-pagination-invalid', `${label} next-page link differs from the fixed endpoint`);
  }
}

function sameUrlQuery(left, right) {
  const leftUrl = new URL(left);
  const rightUrl = new URL(right);
  if (leftUrl.origin !== rightUrl.origin
      || canonicalRepositoryPath(leftUrl.pathname) !== canonicalRepositoryPath(rightUrl.pathname)) return false;
  const leftParameters = [...leftUrl.searchParams.entries()].sort();
  const rightParameters = [...rightUrl.searchParams.entries()].sort();
  return canonicalJson(leftParameters) === canonicalJson(rightParameters);
}

function canonicalRepositoryPath(pathname) {
  const numericPrefix = `/repositories/1349498456/`;
  if (pathname.startsWith(numericPrefix)) {
    return `${REPOSITORY_PATH}/${pathname.slice(numericPrefix.length)}`;
  }
  return pathname;
}

function endpoint(kind, parameters = {}) {
  const page = parameters.page;
  let path;
  let apiVersion = FULL_CANDIDATE_REGISTRATION_HTTP_CONTRACT.apiVersion;
  switch (kind) {
    case 'actor': path = '/user'; break;
    case 'repository': path = REPOSITORY_PATH; break;
    case 'hashAlgorithm':
      path = `${REPOSITORY_PATH}/hash-algorithm`;
      apiVersion = FULL_CANDIDATE_REGISTRATION_HTTP_CONTRACT.hashAlgorithmApiVersion;
      break;
    case 'branch': path = `${REPOSITORY_PATH}/branches/main`; break;
    case 'branchProtection': path = `${REPOSITORY_PATH}/branches/main/protection`; break;
    case 'compare': path = `${REPOSITORY_PATH}/compare/${REGISTRATION.revision}...main`; break;
    case 'registrationCommit': path = `${REPOSITORY_PATH}/commits/${REGISTRATION.revision}`; break;
    case 'tree':
      if (!REVISION_PATTERN.test(parameters.treeOid ?? '')) {
        throw policyError('registration-source-tree-invalid', 'tree request identity is invalid');
      }
      path = `${REPOSITORY_PATH}/git/trees/${parameters.treeOid}?recursive=1`;
      break;
    case 'registrationBlob': path = `${REPOSITORY_PATH}/git/blobs/${REGISTRATION.gitBlobOid}`; break;
    case 'workflowById': path = `${REPOSITORY_PATH}/actions/workflows/${FULL_CANDIDATE_REGISTRATION_WORKFLOW.id}`; break;
    case 'workflowByFilename': path = `${REPOSITORY_PATH}/actions/workflows/atomistic-full-candidate.yml`; break;
    case 'sentinelWorkflow': path = `${REPOSITORY_PATH}/actions/workflows/${FULL_CANDIDATE_SENTINEL_WORKFLOW.id}`; break;
    case 'runAttempt':
      path = `${REPOSITORY_PATH}/actions/runs/${FULL_CANDIDATE_REGISTRATION_WORKFLOW.sentinel.runId}/attempts/1`;
      break;
    case 'checkRun':
      path = `${REPOSITORY_PATH}/check-runs/${FULL_CANDIDATE_REGISTRATION_WORKFLOW.sentinel.checkRunId}`;
      break;
    case 'checkSuite':
      path = `${REPOSITORY_PATH}/check-suites/${FULL_CANDIDATE_REGISTRATION_WORKFLOW.sentinel.checkSuiteId}`;
      break;
    case 'workflows':
      path = paginatedPath(`${REPOSITORY_PATH}/actions/workflows`, page);
      break;
    case 'targetRuns':
      path = paginatedPath(
        `${REPOSITORY_PATH}/actions/workflows/${FULL_CANDIDATE_REGISTRATION_WORKFLOW.id}/runs`,
        page,
      );
      break;
    case 'repositoryRuns':
      path = paginatedPath(`${REPOSITORY_PATH}/actions/runs`, page);
      break;
    case 'jobs':
      path = paginatedPath(
        `${REPOSITORY_PATH}/actions/runs/${FULL_CANDIDATE_REGISTRATION_WORKFLOW.sentinel.runId}/attempts/1/jobs`,
        page,
      );
      break;
    default:
      throw policyError('github-endpoint-rejected', 'GitHub endpoint is outside the fixed registration allowlist');
  }
  const url = new URL(path, FULL_CANDIDATE_REGISTRATION_HTTP_CONTRACT.apiOrigin);
  return Object.freeze({ apiVersion, kind, label: kind, url: url.href });
}

function paginatedPath(basePath, page) {
  if (!Number.isSafeInteger(page) || page < 1 || page > 100) {
    throw policyError('registration-pagination-invalid', 'GitHub page number is outside the fixed bound');
  }
  return `${basePath}?per_page=${FULL_CANDIDATE_REGISTRATION_PAGE_SIZE}&page=${page}`;
}

function validateRequest(request) {
  if (!request || typeof request !== 'object'
      || !['2022-11-28', '2026-03-10'].includes(request.apiVersion)
      || typeof request.label !== 'string'
      || typeof request.url !== 'string') {
    throw policyError('github-request-rejected', 'GitHub request is outside the fixed GET-only contract');
  }
  const url = new URL(request.url);
  if (url.protocol !== 'https:'
      || url.origin !== FULL_CANDIDATE_REGISTRATION_HTTP_CONTRACT.apiOrigin
      || url.username !== ''
      || url.password !== ''
      || url.hash !== '') {
    throw policyError('github-request-rejected', 'GitHub request origin differs from the fixed API origin');
  }
  return url.href;
}

function requireToken(value) {
  if (typeof value !== 'string'
      || value.length < 1
      || value.length > 4_096
      || /[^\x21-\x7e]/.test(value)) {
    throw policyError(
      'github-token-unavailable',
      `${TOKEN_ENVIRONMENT_VARIABLE} must contain one nonempty visible-ASCII GitHub credential`,
    );
  }
  return value;
}

function policyError(code, message) {
  return new FullCandidateRegistrationPolicyError(code, message);
}

function isDirectInvocation() {
  const scriptPath = process.argv[1];
  return typeof scriptPath === 'string' && import.meta.url === pathToFileURL(scriptPath).href;
}

if (isDirectInvocation()) {
  const result = process.argv.length === 2
    ? await inspectFullCandidateRegistration()
    : await inspectFullCandidateRegistration({ commandLineArgumentsPresent: true });
  process.stdout.write(`${canonicalJson(result)}\n`);
  process.exitCode = result.status === 'verified-registration-only' ? 0 : 1;
}
