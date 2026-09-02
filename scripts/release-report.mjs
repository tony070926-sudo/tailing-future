import { assertAqueousFoundationVerification } from '../lib/simulation/aqueous-foundation-verification.ts';
import { assertPeriodicAtomisticVerification } from '../lib/simulation/periodic-verification.ts';

export const gateNames = Object.freeze(['install', 'lint', 'typecheck', 'test', 'atomistic_manifest', 'build', 'audit']);
export const runtimeKeys = Object.freeze(['architecture', 'node', 'platform']);
export const physicsAbsoluteTolerance = 1e-12;
export const physicsRelativeTolerance = 2e-3;

const missingPath = Symbol('missing-path');
const digestPattern = /^sha256:(?!0{64}$)[0-9a-f]{64}$/;

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

const portableMetricAbsoluteTolerances = new Map([
  ['verification.aqueousFoundation.triclinicForceCheck.netForceKjMolAngstrom', 1e-15],
  ['verification.molecular.linearRelativeDriftRatePerPicosecond', 1e-12],
  ['verification.molecular.maximumCenterOfMassResidualAngstrom', 1e-12],
  ['verification.molecular.maximumInternalForceResidualKjMolAngstrom', 1e-12],
  ['verification.molecular.maximumMomentumResidual', 1e-12],
  ['verification.periodicAtomistic.maximumResiduals.centerOfMassAngstrom', 1e-12],
  ['verification.periodicAtomistic.maximumResiduals.internalForceKjMolAngstrom', 1e-12],
  ['verification.periodicAtomistic.maximumResiduals.momentumDaltonAngstromPerPicosecond', 1e-11],
]);

const requiredPortableSectionPaths = Object.freeze([
  'verification.aqueousFoundation',
  'verification.molecular',
  'verification.periodicAtomistic',
]);

const periodicDigestKeys = Object.freeze([
  'configuration',
  'topology',
  'physicalState',
  'replayPhysicalState',
  'fullState',
  'replayFullState',
  'observation',
  'replayObservation',
  'physicalTrajectory',
  'replayPhysicalTrajectory',
  'fullStateTrajectory',
  'replayFullStateTrajectory',
  'observationCheckpoints',
  'replayObservationCheckpoints',
  'verificationEvidence',
]);

const portableDigestGroups = Object.freeze([
  Object.freeze([
    'verification.aqueousFoundation.hugeImageGaugeCheck.ewald.referenceEvaluationDigest',
    'verification.aqueousFoundation.hugeImageGaugeCheck.ewald.gaugedEvaluationDigest',
  ]),
  Object.freeze(['verification.aqueousFoundation.verificationDigest']),
  Object.freeze(['verification.periodicAtomistic.digests.configuration']),
  Object.freeze([
    'verification.periodicAtomistic.digests.physicalState',
    'verification.periodicAtomistic.digests.replayPhysicalState',
  ]),
  Object.freeze([
    'verification.periodicAtomistic.digests.fullState',
    'verification.periodicAtomistic.digests.replayFullState',
  ]),
  Object.freeze([
    'verification.periodicAtomistic.digests.observation',
    'verification.periodicAtomistic.digests.replayObservation',
  ]),
  Object.freeze([
    'verification.periodicAtomistic.digests.physicalTrajectory',
    'verification.periodicAtomistic.digests.replayPhysicalTrajectory',
  ]),
  Object.freeze([
    'verification.periodicAtomistic.digests.fullStateTrajectory',
    'verification.periodicAtomistic.digests.replayFullStateTrajectory',
  ]),
  Object.freeze([
    'verification.periodicAtomistic.digests.observationCheckpoints',
    'verification.periodicAtomistic.digests.replayObservationCheckpoints',
  ]),
  Object.freeze(['verification.periodicAtomistic.digests.verificationEvidence']),
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
  if (!hasValidPortableEvidence(left) || !hasValidPortableEvidence(right)) return false;
  return releaseValuesEqual(
    normalizePortableEvidence(normalizeReport(left)),
    normalizePortableEvidence(normalizeReport(right)),
    [],
  );
}

function releaseValuesEqual(left, right, path) {
  if (Object.is(left, right)) return true;

  if (typeof left === 'number' && typeof right === 'number') {
    const tolerance = portableMetricTolerance(path);
    if (!Number.isFinite(left) || !Number.isFinite(right) || tolerance === null) return false;
    const difference = Math.abs(left - right);
    const scale = Math.max(Math.abs(left), Math.abs(right));
    return difference <= tolerance.absolute || difference <= tolerance.relative * scale;
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

function portableMetricTolerance(path) {
  const key = path.join('.');
  const absolute = portableMetricAbsoluteTolerances.get(key);
  if (absolute !== undefined) return { absolute, relative: physicsRelativeTolerance };
  if (isPortablePhysicsMetric(path)) {
    return { absolute: physicsAbsoluteTolerance, relative: physicsRelativeTolerance };
  }
  return null;
}

function hasValidPortableEvidence(report) {
  if (!hasValidPortableMetrics(report)) return false;
  try {
    if (requiredPortableSectionPaths.some((path) => !isRecord(readPath(report, path)))) return false;
    const aqueous = readPath(report, 'verification.aqueousFoundation');
    const periodic = readPath(report, 'verification.periodicAtomistic');
    assertAqueousFoundationVerification(aqueous);
    assertPeriodicAtomisticVerification(periodic);
    if (!hasExactKeys(periodic.digests, periodicDigestKeys)) return false;
  } catch {
    return false;
  }

  for (const group of portableDigestGroups) {
    const values = group.map((path) => readPath(report, path));
    if (values.some((value) => typeof value !== 'string' || !digestPattern.test(value))
        || values.some((value) => value !== values[0])) return false;
  }
  return true;
}

function hasValidPortableMetrics(report) {
  const aqueousNetForce = readPath(
    report,
    'verification.aqueousFoundation.triclinicForceCheck.netForceKjMolAngstrom',
  );
  if (!withinInclusive(aqueousNetForce, 0, 1e-12)) return false;

  const molecularDrift = readPath(
    report,
    'verification.molecular.linearRelativeDriftRatePerPicosecond',
  );
  if (typeof molecularDrift !== 'number' || !Number.isFinite(molecularDrift)) return false;
  for (const path of [
    'verification.molecular.maximumCenterOfMassResidualAngstrom',
    'verification.molecular.maximumInternalForceResidualKjMolAngstrom',
    'verification.molecular.maximumMomentumResidual',
  ]) {
    const residual = readPath(report, path);
    if (!withinInclusive(residual, 0, 1e-9)) return false;
  }

  for (const [residualPath, thresholdPath] of [
    [
      'verification.periodicAtomistic.maximumResiduals.centerOfMassAngstrom',
      'verification.periodicAtomistic.thresholds.centerOfMassAngstrom',
    ],
    [
      'verification.periodicAtomistic.maximumResiduals.internalForceKjMolAngstrom',
      'verification.periodicAtomistic.thresholds.internalForceKjMolAngstrom',
    ],
    [
      'verification.periodicAtomistic.maximumResiduals.momentumDaltonAngstromPerPicosecond',
      'verification.periodicAtomistic.thresholds.momentumDaltonAngstromPerPicosecond',
    ],
  ]) {
    const residual = readPath(report, residualPath);
    const threshold = readPath(report, thresholdPath);
    if (!withinInclusive(threshold, 0, Number.POSITIVE_INFINITY)
        || threshold === 0
        || !withinInclusive(residual, 0, threshold)) return false;
  }
  return true;
}

function normalizePortableEvidence(report) {
  const normalized = structuredClone(report);
  portableDigestGroups.forEach((group, index) => {
    if (group.every((path) => readPath(normalized, path) !== missingPath)) {
      group.forEach((path) => writePath(normalized, path, `<platform-derived-digest:${index}>`));
    }
  });
  return normalized;
}

function readPath(value, dottedPath) {
  let current = value;
  for (const segment of dottedPath.split('.')) {
    if (current === null || typeof current !== 'object'
        || !Object.prototype.hasOwnProperty.call(current, segment)) return missingPath;
    current = current[segment];
  }
  return current;
}

function writePath(value, dottedPath, replacement) {
  const segments = dottedPath.split('.');
  let current = value;
  for (const segment of segments.slice(0, -1)) current = current[segment];
  current[segments.at(-1)] = replacement;
}

function withinInclusive(value, minimum, maximum) {
  return typeof value === 'number'
    && Number.isFinite(value)
    && value >= minimum
    && value <= maximum;
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
