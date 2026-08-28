export const gateNames = Object.freeze(['install', 'lint', 'typecheck', 'test', 'atomistic', 'build', 'audit']);
export const runtimeKeys = Object.freeze(['architecture', 'node', 'platform']);

export function normalizeReport(report) {
  return {
    ...report,
    generatedAt: '<run-specific>',
    sourceRevision: '<run-specific>',
    runtime: '<run-specific>',
    upstreamGates: '<run-specific>',
    verification: { ...report.verification, elapsedMs: '<run-specific>' },
  };
}

export function hasExactStatuses(statuses, expected) {
  return hasExactKeys(statuses, gateNames) && gateNames.every((name) => statuses[name] === expected);
}

export function hasExactKeys(value, expectedKeys) {
  return value !== null
    && typeof value === 'object'
    && !Array.isArray(value)
    && JSON.stringify(Object.keys(value).sort()) === JSON.stringify([...expectedKeys].sort());
}
