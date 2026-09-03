#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import {
  FULL_CANDIDATE_PRODUCER_WORKFLOW,
  fullCandidateGitHubRejection,
  producerWorkflowNotPinnedError,
} from './full-candidate-github-evidence-policy.mjs';
import { canonicalJson } from './runtime-input-contract.mjs';

/**
 * Report only the currently implemented GitHub campaign readiness boundary.
 * This entry point deliberately accepts no credentials, run IDs, source claims,
 * artifact metadata or scientific payloads. Network transport remains absent
 * until a producer workflow has been merged and its GitHub-assigned ID has been
 * locked by a later independently reviewed change.
 */
export function inspectFullCandidateGitHubReadiness(options = {}) {
  try {
    requireEmptyOptions(options);
    if (FULL_CANDIDATE_PRODUCER_WORKFLOW.configured !== true) {
      throw producerWorkflowNotPinnedError();
    }
    const error = new Error(
      'The restricted private handoff verifier has not been implemented or independently reviewed.',
    );
    error.code = 'restricted-private-verifier-unavailable';
    throw error;
  } catch (error) {
    return fullCandidateGitHubRejection(error);
  }
}

function requireEmptyOptions(options) {
  const validObject = options !== null
    && typeof options === 'object'
    && !Array.isArray(options)
    && [Object.prototype, null].includes(Object.getPrototypeOf(options));
  if (!validObject || Object.keys(options).length !== 0) {
    const error = new Error(
      'Readiness inspection accepts no caller-supplied source, run, credential, artifact, job, hardware or scientific claims.',
    );
    error.code = 'non-self-reporting-input-rejected';
    throw error;
  }
}

function isDirectInvocation() {
  const scriptPath = process.argv[1];
  return typeof scriptPath === 'string' && import.meta.url === pathToFileURL(scriptPath).href;
}

if (isDirectInvocation()) {
  const options = process.argv.length === 2
    ? {}
    : { commandLineArgumentsPresent: true };
  process.stdout.write(`${canonicalJson(inspectFullCandidateGitHubReadiness(options))}\n`);
  process.exitCode = 1;
}
