export const gateNames = Object.freeze(['install', 'lint', 'typecheck', 'test', 'atomistic', 'build', 'audit']);
export const runtimeKeys = Object.freeze(['architecture', 'node', 'platform']);
export const physicsAbsoluteTolerance = 1e-12;
export const physicsRelativeTolerance = 2e-3;

const portablePhysicsMetrics = new Set([
  'verification.physics.analyticExchangeClosureResidual',
  'verification.physics.analyticExchangeDifferenceError',
  'verification.physics.analyticExchangeMatrix.equalTemperatureEnergyExchange',
  'verification.physics.analyticExchangeMatrix.maximumDifferenceRatioError',
  'verification.physics.analyticExchangeMatrix.maximumRelativeClosureResidual',
  'verification.physics.analyticExchangeMatrix.maximumSemigroupError',
  'verification.physics.analyticExchangeMatrix.maximumTemperatureError',
  'verification.physics.coupledEnergyResidual',
  'verification.physics.couplingCoverage',
  'verification.physics.ensemble.energyResidualTail.maximum',
  'verification.physics.ensemble.energyResidualTail.p50',
  'verification.physics.ensemble.energyResidualTail.p95',
  'verification.physics.ensemble.energyResidualTail.p99',
  'verification.physics.ensemble.maximumEnergyResidual',
  'verification.physics.ensemble.maximumMomentumResidual',
  'verification.physics.ensemble.maximumRawParticleMomentumResidual',
  'verification.physics.ensemble.minimumCouplingCoverage',
  'verification.physics.exchangeClosureRelative',
  'verification.physics.exchangeClosureResidual',
  'verification.physics.forcedReactionClosureResidual',
  'verification.physics.fourierMaximumEnergyResidual',
  'verification.physics.fourierMinimumObservedOrder',
  'verification.physics.gridEnergySpread',
  'verification.physics.gridHeatCapacitySpread',
  'verification.physics.heatClosureRelative',
  'verification.physics.heatClosureResidual',
  'verification.physics.heatEnergyResidual',
  'verification.physics.heatModeRelativeL2Error',
  'verification.physics.interfaceEnergyMoved',
  'verification.physics.maximumOperatorClosureRelative',
  'verification.physics.minimumCouplingCoverage',
  'verification.physics.momentumResidual',
  'verification.physics.rawParticleMomentumResidual',
  'verification.physics.reactionClosureRelative',
  'verification.physics.reactionClosureResidual',
]);

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

export function reportsReleaseEquivalent(left, right) {
  return releaseValuesEqual(normalizeReport(left), normalizeReport(right), []);
}

function releaseValuesEqual(left, right, path) {
  if (Object.is(left, right)) return true;

  if (typeof left === 'number' && typeof right === 'number') {
    if (!Number.isFinite(left) || !Number.isFinite(right) || !isPortablePhysicsMetric(path)) return false;
    const difference = Math.abs(left - right);
    const scale = Math.max(Math.abs(left), Math.abs(right));
    return difference <= physicsAbsoluteTolerance || difference <= physicsRelativeTolerance * scale;
  }

  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return false;
  if (Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) {
    return left.length === right.length
      && left.every((value, index) => releaseValuesEqual(value, right[index], [...path, index]));
  }

  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  return JSON.stringify(leftKeys) === JSON.stringify(rightKeys)
    && leftKeys.every((key) => releaseValuesEqual(left[key], right[key], [...path, key]));
}

function isPortablePhysicsMetric(path) {
  return portablePhysicsMetrics.has(path.join('.'));
}
