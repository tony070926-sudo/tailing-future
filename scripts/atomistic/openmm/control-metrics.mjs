const PARTICLE_COUNT = 2685;
const COMPONENT_COUNT = PARTICLE_COUNT * 3;
const SAMPLE_COUNT = 101;
const COMPARISON_STEPS = Object.freeze([0, 10, 100, 500, 1000]);
const GROUP_COUNT_WITH_TOTAL = 5;

export const OPENMM_TIP3P_CONTROL_SHAPE = Object.freeze({
  particleCount: PARTICLE_COUNT,
  componentCount: COMPONENT_COUNT,
  sampleCount: SAMPLE_COUNT,
  comparisonSteps: COMPARISON_STEPS,
  groupCountWithTotal: GROUP_COUNT_WITH_TOTAL,
});

export const OPENMM_TIP3P_CONTROL_THRESHOLDS = Object.freeze({
  maximumRelativeEnergyExcursion: 1e-3,
  maximumConstraintRelativeResidual: 1e-6,
  maximumRelativePotentialEnergyDifference: 1e-5,
  maximumMedianPerParticleRelativeForceError: 1e-4,
  maximumGlobalRelativeForceL2Error: 1e-4,
  referenceEnergyGroupMaximumRelativeResidual: 1e-8,
  referenceForceGroupMaximumRelativeResidual: 1e-8,
  cpuEnergyGroupMaximumRelativeResidual: 1e-8,
  cpuForceGroupMaximumUlpDistanceFloat32: 2,
  maximumProductionStartCenterOfMassSpeedNanometerPerPicosecond: 1e-12,
  maximumProductionStartVelocityConstraintRelativeResidual: 1e-8,
});

export function decodeFloat64LittleEndian(bytes, expectedLength, label = 'float64 array') {
  const view = boundedByteView(bytes, expectedLength * 8, label);
  const values = new Float64Array(expectedLength);
  const data = new DataView(view.buffer, view.byteOffset, view.byteLength);
  try {
    for (let index = 0; index < expectedLength; index += 1) {
      const value = data.getFloat64(index * 8, true);
      if (!Number.isFinite(value)) throw new Error(`${label}[${index}] must be finite`);
      if (Object.is(value, -0)) throw new Error(`${label}[${index}] must use canonical positive zero`);
      values[index] = value;
    }
    return values;
  } catch (error) {
    values.fill(0);
    throw error;
  }
}

export function decodeUint32LittleEndian(bytes, expectedLength, label = 'uint32 array') {
  const view = boundedByteView(bytes, expectedLength * 4, label);
  const values = new Uint32Array(expectedLength);
  const data = new DataView(view.buffer, view.byteOffset, view.byteLength);
  for (let index = 0; index < expectedLength; index += 1) {
    values[index] = data.getUint32(index * 4, true);
  }
  return values;
}

export function encodeFloat64LittleEndian(values) {
  const bytes = new Uint8Array(values.length * 8);
  const data = new DataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1) {
    const value = Number(values[index]);
    if (!Number.isFinite(value)) throw new Error(`float64 input[${index}] must be finite`);
    data.setFloat64(index * 8, value === 0 ? 0 : value, true);
  }
  return bytes;
}

export function computeRelativeEnergyExcursion(totalEnergyKjMol) {
  assertFiniteArray(totalEnergyKjMol, SAMPLE_COUNT, 'Reference total energy');
  const initial = totalEnergyKjMol[0];
  const denominator = Math.max(Math.abs(initial), 1);
  let maximum = 0;
  for (const energy of totalEnergyKjMol) {
    maximum = Math.max(maximum, Math.abs(energy - initial) / denominator);
  }
  return maximum;
}

export function computeAbsoluteEnergyExcursionPerWaterKjMol(totalEnergyKjMol) {
  assertFiniteArray(totalEnergyKjMol, SAMPLE_COUNT, 'Reference total energy');
  const initial = totalEnergyKjMol[0];
  let maximum = 0;
  for (const energy of totalEnergyKjMol) maximum = Math.max(maximum, Math.abs(energy - initial));
  return maximum / 895;
}

export function computeEnergyDriftSlopeKjMolPicosecond(totalEnergyKjMol, timesPicoseconds) {
  assertFiniteArray(totalEnergyKjMol, SAMPLE_COUNT, 'Reference total energy');
  assertFiniteArray(timesPicoseconds, SAMPLE_COUNT, 'Reference sample times');
  const meanTime = mean(timesPicoseconds);
  const meanEnergy = mean(totalEnergyKjMol);
  let numerator = 0;
  let denominator = 0;
  for (let index = 0; index < SAMPLE_COUNT; index += 1) {
    const centeredTime = timesPicoseconds[index] - meanTime;
    numerator += centeredTime * (totalEnergyKjMol[index] - meanEnergy);
    denominator += centeredTime * centeredTime;
  }
  if (!(denominator > 0)) throw new Error('Reference sample times must span a nonzero interval');
  return numerator / denominator;
}

export function computeMaximumConstraintRelativeResidual({
  positionsNanometer,
  cellVectorsNanometer,
  constraintParticleIndices,
  constraintTargetsNanometer,
}) {
  assertFiniteArray(positionsNanometer, SAMPLE_COUNT * COMPONENT_COUNT, 'Reference positions');
  assertFiniteArray(cellVectorsNanometer, 9, 'periodic cell');
  if (!(constraintParticleIndices instanceof Uint32Array)
      || constraintParticleIndices.length !== PARTICLE_COUNT * 2) {
    throw new Error(`constraint particle indices must contain ${PARTICLE_COUNT * 2} uint32 values`);
  }
  assertFiniteArray(constraintTargetsNanometer, PARTICLE_COUNT, 'constraint targets');
  const inverseCell = inverse3x3(cellVectorsNanometer);
  let maximum = 0;
  for (let sample = 0; sample < SAMPLE_COUNT; sample += 1) {
    const sampleOffset = sample * COMPONENT_COUNT;
    for (let constraint = 0; constraint < PARTICLE_COUNT; constraint += 1) {
      const first = constraintParticleIndices[constraint * 2];
      const second = constraintParticleIndices[constraint * 2 + 1];
      if (first >= PARTICLE_COUNT || second >= PARTICLE_COUNT || first === second) {
        throw new Error(`constraint ${constraint} has invalid particle indices`);
      }
      const firstOffset = sampleOffset + first * 3;
      const secondOffset = sampleOffset + second * 3;
      const delta = [
        positionsNanometer[secondOffset] - positionsNanometer[firstOffset],
        positionsNanometer[secondOffset + 1] - positionsNanometer[firstOffset + 1],
        positionsNanometer[secondOffset + 2] - positionsNanometer[firstOffset + 2],
      ];
      const fractional = multiply3x3Vector(inverseCell, delta);
      for (let axis = 0; axis < 3; axis += 1) fractional[axis] -= Math.round(fractional[axis]);
      const minimumImage = multiply3x3Vector(cellVectorsNanometer, fractional);
      const distance = Math.hypot(...minimumImage);
      const target = constraintTargetsNanometer[constraint];
      if (!(target > 0)) throw new Error(`constraint target ${constraint} must be positive`);
      maximum = Math.max(maximum, Math.abs(distance - target) / target);
    }
  }
  return maximum;
}

export function computeCpuReferenceComparison({
  referencePotentialEnergyKjMol,
  cpuPotentialEnergyKjMol,
  referencePotentialForceKjMolNanometer,
  cpuPotentialForceKjMolNanometer,
}) {
  const stepCount = COMPARISON_STEPS.length;
  assertFiniteArray(referencePotentialEnergyKjMol, stepCount, 'Reference comparison energy');
  assertFiniteArray(cpuPotentialEnergyKjMol, stepCount, 'CPU comparison energy');
  assertFiniteArray(referencePotentialForceKjMolNanometer, stepCount * COMPONENT_COUNT,
    'Reference comparison force');
  assertFiniteArray(cpuPotentialForceKjMolNanometer, stepCount * COMPONENT_COUNT,
    'CPU comparison force');

  let maximumRelativePotentialEnergyDifference = 0;
  let maximumMedianPerParticleRelativeForceError = 0;
  let maximumGlobalRelativeForceL2Error = 0;
  const perStep = [];
  for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
    const referenceEnergy = referencePotentialEnergyKjMol[stepIndex];
    const cpuEnergy = cpuPotentialEnergyKjMol[stepIndex];
    const relativePotentialEnergyDifference = Math.abs(cpuEnergy - referenceEnergy)
      / Math.max(Math.abs(referenceEnergy), 1);
    maximumRelativePotentialEnergyDifference = Math.max(
      maximumRelativePotentialEnergyDifference,
      relativePotentialEnergyDifference,
    );

    const particleErrors = new Float64Array(PARTICLE_COUNT);
    let differenceSquared = 0;
    let referenceSquared = 0;
    const stepOffset = stepIndex * COMPONENT_COUNT;
    for (let particle = 0; particle < PARTICLE_COUNT; particle += 1) {
      const offset = stepOffset + particle * 3;
      let particleDifferenceSquared = 0;
      let particleReferenceSquared = 0;
      for (let axis = 0; axis < 3; axis += 1) {
        const reference = referencePotentialForceKjMolNanometer[offset + axis];
        const difference = cpuPotentialForceKjMolNanometer[offset + axis] - reference;
        particleDifferenceSquared += difference * difference;
        particleReferenceSquared += reference * reference;
      }
      differenceSquared += particleDifferenceSquared;
      referenceSquared += particleReferenceSquared;
      particleErrors[particle] = Math.sqrt(particleDifferenceSquared)
        / Math.max(Math.sqrt(particleReferenceSquared), 1e-12);
    }
    particleErrors.sort();
    const medianPerParticleRelativeForceError = particleErrors[Math.floor(PARTICLE_COUNT / 2)];
    const globalRelativeForceL2Error = Math.sqrt(differenceSquared)
      / Math.max(Math.sqrt(referenceSquared), 1e-12);
    maximumMedianPerParticleRelativeForceError = Math.max(
      maximumMedianPerParticleRelativeForceError,
      medianPerParticleRelativeForceError,
    );
    maximumGlobalRelativeForceL2Error = Math.max(
      maximumGlobalRelativeForceL2Error,
      globalRelativeForceL2Error,
    );
    perStep.push(Object.freeze({
      step: COMPARISON_STEPS[stepIndex],
      relativePotentialEnergyDifference,
      medianPerParticleRelativeForceError,
      globalRelativeForceL2Error,
    }));
  }
  return Object.freeze({
    maximumRelativePotentialEnergyDifference,
    maximumMedianPerParticleRelativeForceError,
    maximumGlobalRelativeForceL2Error,
    perStep: Object.freeze(perStep),
  });
}

export function computeForceGroupClosure({ lane, energiesKjMol, forcesKjMolNanometer }) {
  if (lane !== 'Reference' && lane !== 'CPU') throw new Error('lane must be Reference or CPU');
  const stepCount = COMPARISON_STEPS.length;
  assertFiniteArray(energiesKjMol, stepCount * GROUP_COUNT_WITH_TOTAL, `${lane} group energies`);
  assertFiniteArray(forcesKjMolNanometer,
    stepCount * GROUP_COUNT_WITH_TOTAL * COMPONENT_COUNT, `${lane} group forces`);
  let maximumEnergyRelativeResidual = 0;
  let maximumForceRelativeResidual = 0;
  let maximumForceUlpDistanceFloat32 = 0;
  for (let stepIndex = 0; stepIndex < stepCount; stepIndex += 1) {
    const energyOffset = stepIndex * GROUP_COUNT_WITH_TOTAL;
    let groupEnergySum = 0;
    for (let group = 1; group < GROUP_COUNT_WITH_TOTAL; group += 1) {
      groupEnergySum += energiesKjMol[energyOffset + group];
    }
    const totalEnergy = energiesKjMol[energyOffset];
    maximumEnergyRelativeResidual = Math.max(
      maximumEnergyRelativeResidual,
      Math.abs(totalEnergy - groupEnergySum) / Math.max(Math.abs(totalEnergy), 1),
    );

    const stepOffset = stepIndex * GROUP_COUNT_WITH_TOTAL * COMPONENT_COUNT;
    const totalOffset = stepOffset;
    let maximumTotalComponent = 0;
    let maximumComponentDifference = 0;
    for (let component = 0; component < COMPONENT_COUNT; component += 1) {
      const total = forcesKjMolNanometer[totalOffset + component];
      maximumTotalComponent = Math.max(maximumTotalComponent, Math.abs(total));
      if (lane === 'Reference') {
        let sum = 0;
        for (let group = 1; group < GROUP_COUNT_WITH_TOTAL; group += 1) {
          sum += forcesKjMolNanometer[stepOffset + group * COMPONENT_COUNT + component];
        }
        maximumComponentDifference = Math.max(maximumComponentDifference, Math.abs(total - sum));
      } else {
        let sum = Math.fround(0);
        for (let group = 1; group < GROUP_COUNT_WITH_TOTAL; group += 1) {
          sum = Math.fround(sum + Math.fround(
            forcesKjMolNanometer[stepOffset + group * COMPONENT_COUNT + component],
          ));
        }
        const distance = float32UlpDistance(Math.fround(total), sum);
        maximumForceUlpDistanceFloat32 = Math.max(maximumForceUlpDistanceFloat32, distance);
      }
    }
    if (lane === 'Reference') {
      maximumForceRelativeResidual = Math.max(
        maximumForceRelativeResidual,
        maximumComponentDifference / Math.max(maximumTotalComponent, 1),
      );
    }
  }
  return Object.freeze({
    lane,
    maximumEnergyRelativeResidual,
    maximumForceRelativeResidual: lane === 'Reference' ? maximumForceRelativeResidual : null,
    maximumForceUlpDistanceFloat32: lane === 'CPU' ? maximumForceUlpDistanceFloat32 : null,
  });
}

export function assertReferenceReplayExact(namedBytePairs) {
  if (!Array.isArray(namedBytePairs) || namedBytePairs.length === 0) {
    throw new Error('Reference replay requires at least one named byte pair');
  }
  for (const pair of namedBytePairs) {
    if (!pair || typeof pair !== 'object' || typeof pair.name !== 'string') {
      throw new Error('Reference replay byte pair must have a name');
    }
    const left = boundedByteView(pair.referenceA, undefined, `${pair.name} Reference A`);
    const right = boundedByteView(pair.referenceB, undefined, `${pair.name} Reference B`);
    if (left.byteLength !== right.byteLength) {
      throw new Error(`Reference replay differs for ${pair.name}: byte length`);
    }
    for (let index = 0; index < left.byteLength; index += 1) {
      if (left[index] !== right[index]) {
        throw new Error(`Reference replay differs for ${pair.name} at byte ${index}`);
      }
    }
  }
  return true;
}

export function evaluateControlGates(metrics) {
  const thresholds = OPENMM_TIP3P_CONTROL_THRESHOLDS;
  const gates = Object.freeze({
    referenceExactReplay: metrics.referenceExactReplay === true,
    referenceEnergyExcursion:
      metrics.relativeEnergyExcursion <= thresholds.maximumRelativeEnergyExcursion,
    referenceConstraintResidual:
      metrics.maximumConstraintRelativeResidual <= thresholds.maximumConstraintRelativeResidual,
    cpuReferencePotentialEnergy:
      metrics.maximumRelativePotentialEnergyDifference
        <= thresholds.maximumRelativePotentialEnergyDifference,
    cpuReferenceMedianParticleForce:
      metrics.maximumMedianPerParticleRelativeForceError
        <= thresholds.maximumMedianPerParticleRelativeForceError,
    cpuReferenceGlobalForce:
      metrics.maximumGlobalRelativeForceL2Error
        <= thresholds.maximumGlobalRelativeForceL2Error,
    referenceEnergyGroupClosure:
      metrics.referenceMaximumEnergyGroupRelativeResidual
        <= thresholds.referenceEnergyGroupMaximumRelativeResidual,
    referenceForceGroupClosure:
      metrics.referenceMaximumForceGroupRelativeResidual
        <= thresholds.referenceForceGroupMaximumRelativeResidual,
    cpuEnergyGroupClosure:
      metrics.cpuMaximumEnergyGroupRelativeResidual
        <= thresholds.cpuEnergyGroupMaximumRelativeResidual,
    cpuForceGroupClosure:
      metrics.cpuMaximumForceGroupUlpDistanceFloat32
        <= thresholds.cpuForceGroupMaximumUlpDistanceFloat32,
    productionStartCenterOfMass:
      metrics.productionStartCenterOfMassSpeedNanometerPerPicosecond
        <= thresholds.maximumProductionStartCenterOfMassSpeedNanometerPerPicosecond,
    productionStartVelocityConstraints:
      metrics.productionStartMaximumVelocityConstraintRelativeResidual
        <= thresholds.maximumProductionStartVelocityConstraintRelativeResidual,
  });
  return Object.freeze({
    status: Object.values(gates).every(Boolean) ? 'verified-pass' : 'verified-fail',
    gates,
  });
}

export function float32UlpDistance(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return Number.POSITIVE_INFINITY;
  if (Object.is(left, right) || left === right) return 0;
  const buffer = new ArrayBuffer(4);
  const view = new DataView(buffer);
  const ordered = (value) => {
    view.setFloat32(0, value, false);
    const bits = view.getUint32(0, false);
    return (bits & 0x80000000) !== 0 ? (0x80000000 - (bits & 0x7fffffff)) : 0x80000000 + bits;
  };
  return Math.abs(ordered(left) - ordered(right));
}

function boundedByteView(bytes, expectedByteLength, label) {
  if (!(bytes instanceof Uint8Array)) throw new TypeError(`${label} must be a Uint8Array`);
  if (expectedByteLength !== undefined && bytes.byteLength !== expectedByteLength) {
    throw new Error(`${label} must contain exactly ${expectedByteLength} bytes`);
  }
  return bytes;
}

function assertFiniteArray(values, expectedLength, label) {
  if (!ArrayBuffer.isView(values) && !Array.isArray(values)) {
    throw new TypeError(`${label} must be an array or typed array`);
  }
  if (values.length !== expectedLength) {
    throw new Error(`${label} must contain exactly ${expectedLength} values`);
  }
  for (let index = 0; index < values.length; index += 1) {
    if (!Number.isFinite(values[index])) throw new Error(`${label}[${index}] must be finite`);
  }
}

function mean(values) {
  let sum = 0;
  for (const value of values) sum += value;
  return sum / values.length;
}

function inverse3x3(matrix) {
  const [a, b, c, d, e, f, g, h, i] = matrix;
  const A = e * i - f * h;
  const B = f * g - d * i;
  const C = d * h - e * g;
  const determinant = a * A + b * B + c * C;
  if (!Number.isFinite(determinant) || Math.abs(determinant) <= Number.EPSILON) {
    throw new Error('periodic cell must be finite and invertible');
  }
  return [
    A / determinant,
    (c * h - b * i) / determinant,
    (b * f - c * e) / determinant,
    B / determinant,
    (a * i - c * g) / determinant,
    (c * d - a * f) / determinant,
    C / determinant,
    (b * g - a * h) / determinant,
    (a * e - b * d) / determinant,
  ];
}

function multiply3x3Vector(matrix, vector) {
  return [
    matrix[0] * vector[0] + matrix[1] * vector[1] + matrix[2] * vector[2],
    matrix[3] * vector[0] + matrix[4] * vector[1] + matrix[5] * vector[2],
    matrix[6] * vector[0] + matrix[7] * vector[1] + matrix[8] * vector[2],
  ];
}
