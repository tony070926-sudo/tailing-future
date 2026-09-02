import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  OPENMM_TIP3P_CONTROL_SHAPE,
  encodeFloat64LittleEndian,
} from './control-metrics.mjs';
import {
  OPENMM_TIP3P_REQUIRED_ARTIFACTS,
  computeArtifactBundleRoot,
  inspectOpenMmTip3pArtifactManifest,
  verifyOpenMmTip3pArrayEvidence,
} from './verify-control.mjs';

const { particleCount, componentCount, sampleCount } = OPENMM_TIP3P_CONTROL_SHAPE;

describe('OpenMM TIP3P independent verifier boundary', () => {
  it('accepts only a complete exact replay and independently passing raw-array bundle', () => {
    const evidence = makePassingArrayEvidence();
    const verified = verifyOpenMmTip3pArrayEvidence(evidence);
    expect(verified.gateResult.status).toBe('verified-pass');
    expect(verified.metrics).toMatchObject({
      referenceExactReplay: true,
      relativeEnergyExcursion: 0,
      maximumConstraintRelativeResidual: expect.any(Number),
      maximumRelativePotentialEnergyDifference: 0,
      maximumMedianPerParticleRelativeForceError: 0,
      maximumGlobalRelativeForceL2Error: 0,
      referenceMaximumForceGroupRelativeResidual: 0,
      cpuMaximumForceGroupUlpDistanceFloat32: 0,
    });
    expect(verified.metrics.maximumConstraintRelativeResidual).toBeLessThan(1e-12);
  });

  it('rejects replay mutation, nonzero rigid-water groups, CPU coordinate drift and stale total energy', () => {
    const mutations = [
      (evidence) => {
        const bytes = evidence.get('reference-b-positions').slice();
        bytes[17] ^= 1;
        evidence.set('reference-b-positions', bytes);
      },
      (evidence) => {
        const values = decodeValues(evidence.get('reference-a-comparison-group-forces'));
        values[componentCount] = 1;
        const bytes = encodeFloat64LittleEndian(values);
        evidence.set('reference-a-comparison-group-forces', bytes);
        evidence.set('reference-b-comparison-group-forces', bytes);
      },
      (evidence) => {
        const values = decodeValues(evidence.get('cpu-readback-positions'));
        values[0] = 0.01;
        evidence.set('cpu-readback-positions', encodeFloat64LittleEndian(values));
      },
      (evidence) => {
        const values = decodeValues(evidence.get('reference-a-energies'));
        values[2] += 1;
        const bytes = encodeFloat64LittleEndian(values);
        evidence.set('reference-a-energies', bytes);
        evidence.set('reference-b-energies', bytes);
      },
      (evidence) => {
        const values = decodeUint32Values(evidence.get('constraints'));
        values[2] = values[0];
        values[3] = values[1];
        evidence.set('constraints', encodeUint32LittleEndian(values));
      },
    ];
    for (const mutate of mutations) {
      const evidence = makePassingArrayEvidence();
      mutate(evidence);
      expect(() => verifyOpenMmTip3pArrayEvidence(evidence)).toThrow();
    }
  });

  it('locks the exact artifact set, descriptor shapes, bundle root and non-public policy', () => {
    const manifest = makeManifest();
    expect(inspectOpenMmTip3pArtifactManifest(manifest)).toEqual({ ok: true, failures: [] });

    const duplicate = structuredClone(manifest);
    duplicate.artifacts[1] = structuredClone(duplicate.artifacts[0]);
    duplicate.bundleRoot = computeArtifactBundleRoot(duplicate.artifacts);
    expect(inspectOpenMmTip3pArtifactManifest(duplicate).ok).toBe(false);

    const changedShape = structuredClone(manifest);
    changedShape.artifacts.find((entry) => entry.id === 'reference-a-positions').shape[0] = 100;
    changedShape.bundleRoot = computeArtifactBundleRoot(changedShape.artifacts);
    expect(inspectOpenMmTip3pArtifactManifest(changedShape).failures.join('\n')).toMatch(/shape changed/);

    const publicPayload = structuredClone(manifest);
    publicPayload.publicationPolicy.rawScientificPayloadPublic = true;
    expect(inspectOpenMmTip3pArtifactManifest(publicPayload).failures.join('\n')).toMatch(/publicationPolicy/);
  });
});

function makePassingArrayEvidence() {
  const evidence = new Map();
  const cell = Float64Array.from([3, 0, 0, 0, 3, 0, 0, 0, 3]);
  const masses = new Float64Array(particleCount);
  const constraints = new Uint32Array(particleCount * 2);
  const targets = new Float64Array(particleCount);
  const oxygenHydrogenDistance = 0.09572;
  const angle = 1.82421813418;
  const hydrogenHydrogenDistance = 2 * oxygenHydrogenDistance * Math.sin(angle / 2);
  for (let water = 0; water < particleCount / 3; water += 1) {
    const base = water * 3;
    masses.set([15.99943, 1.007947, 1.007947], base);
    const pairs = [[base, base + 1], [base, base + 2], [base + 1, base + 2]];
    for (let local = 0; local < pairs.length; local += 1) {
      const constraint = base + local;
      constraints[constraint * 2] = pairs[local][0];
      constraints[constraint * 2 + 1] = pairs[local][1];
      targets[constraint] = local === 2 ? hydrogenHydrogenDistance : oxygenHydrogenDistance;
    }
  }
  const steps = Uint32Array.from({ length: sampleCount }, (_, index) => index * 10);
  const times = Float64Array.from({ length: sampleCount }, (_, index) => index * 0.01);
  const positions = new Float64Array(sampleCount * componentCount);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const sampleOffset = sample * componentCount;
    for (let water = 0; water < particleCount / 3; water += 1) {
      const offset = sampleOffset + water * 9;
      positions[offset + 3] = oxygenHydrogenDistance;
      positions[offset + 6] = oxygenHydrogenDistance * Math.cos(angle);
      positions[offset + 7] = oxygenHydrogenDistance * Math.sin(angle);
    }
  }
  const velocities = new Float64Array(sampleCount * componentCount);
  const forces = new Float64Array(sampleCount * componentCount).fill(1);
  const energies = new Float64Array(sampleCount * 3);
  for (let sample = 0; sample < sampleCount; sample += 1) {
    energies[sample * 3] = -100;
    energies[sample * 3 + 1] = 10;
    energies[sample * 3 + 2] = -90;
  }
  const groupEnergies = new Float64Array(25);
  const groupForces = new Float64Array(25 * componentCount);
  for (let step = 0; step < 5; step += 1) {
    const energyOffset = step * 5;
    groupEnergies[energyOffset] = -100;
    groupEnergies[energyOffset + 3] = -70;
    groupEnergies[energyOffset + 4] = -30;
    const forceOffset = step * 5 * componentCount;
    groupForces.fill(1, forceOffset, forceOffset + componentCount);
    groupForces.fill(0.75, forceOffset + 3 * componentCount, forceOffset + 4 * componentCount);
    groupForces.fill(0.25, forceOffset + 4 * componentCount, forceOffset + 5 * componentCount);
  }
  const cpuPositions = new Float64Array(5 * componentCount);
  for (let step = 0; step < 5; step += 1) {
    const sample = [0, 1, 10, 50, 100][step];
    cpuPositions.set(
      positions.subarray(sample * componentCount, (sample + 1) * componentCount),
      step * componentCount,
    );
  }
  const cpuCells = new Float64Array(5 * 9);
  for (let step = 0; step < 5; step += 1) cpuCells.set(cell, step * 9);

  evidence.set('cell', encodeFloat64LittleEndian(cell));
  evidence.set('masses', encodeFloat64LittleEndian(masses));
  evidence.set('constraints', encodeUint32LittleEndian(constraints));
  evidence.set('constraint-targets', encodeFloat64LittleEndian(targets));
  evidence.set('comparison-steps', encodeUint32LittleEndian([0, 10, 100, 500, 1000]));
  evidence.set('start-positions', encodeFloat64LittleEndian(positions.subarray(0, componentCount)));
  evidence.set('start-velocities', encodeFloat64LittleEndian(velocities.subarray(0, componentCount)));
  for (const prefix of ['reference-a', 'reference-b']) {
    evidence.set(`${prefix}-sample-steps`, encodeUint32LittleEndian(steps));
    evidence.set(`${prefix}-sample-times`, encodeFloat64LittleEndian(times));
    evidence.set(`${prefix}-positions`, encodeFloat64LittleEndian(positions));
    evidence.set(`${prefix}-velocities`, encodeFloat64LittleEndian(velocities));
    evidence.set(`${prefix}-potential-forces`, encodeFloat64LittleEndian(forces));
    evidence.set(`${prefix}-energies`, encodeFloat64LittleEndian(energies));
    evidence.set(`${prefix}-comparison-group-energies`, encodeFloat64LittleEndian(groupEnergies));
    evidence.set(`${prefix}-comparison-group-forces`, encodeFloat64LittleEndian(groupForces));
  }
  evidence.set('cpu-readback-positions', encodeFloat64LittleEndian(cpuPositions));
  evidence.set('cpu-readback-cells', encodeFloat64LittleEndian(cpuCells));
  evidence.set('cpu-comparison-group-energies', encodeFloat64LittleEndian(groupEnergies));
  evidence.set('cpu-comparison-group-forces', encodeFloat64LittleEndian(groupForces));
  return evidence;
}

function makeManifest() {
  const descriptors = OPENMM_TIP3P_REQUIRED_ARTIFACTS.map((expected) => {
    const sizeBytes = expected.kind === 'canonical-json'
      ? 3
      : expected.shape.reduce((product, value) => product * value, 1)
        * (expected.dtype === 'float64-le' ? 8 : 4);
    return {
      ...expected,
      shape: [...expected.shape],
      sizeBytes,
      sha256: digest(expected.id),
    };
  });
  return {
    schemaVersion: 'tf.openmm-tip3p-artifact-manifest/0.4.5',
    profile: 'openmm-tip3p-producer-internal-evidence',
    systemDigest: digest('system'),
    planDigest: digest('plan'),
    sourceRevision: '7'.repeat(40),
    producerOutcomeDigest: digest('outcome'),
    artifacts: descriptors,
    bundleRoot: computeArtifactBundleRoot(descriptors),
    publicationPolicy: {
      profile: 'tf.openmm-tip3p-internal-evidence/0.4.5',
      rawScientificPayloadPublic: false,
      parameterAssetsPublic: false,
      coordinateAssetsPublic: false,
      serializedSystemPublic: false,
      containerPublic: false,
      licenseClearanceRequired: true,
      independentVerificationRequired: true,
      attestationRequiredForPromotion: true,
    },
  };
}

function encodeUint32LittleEndian(values) {
  const bytes = new Uint8Array(values.length * 4);
  const view = new DataView(bytes.buffer);
  for (let index = 0; index < values.length; index += 1) view.setUint32(index * 4, values[index], true);
  return bytes;
}

function decodeValues(bytes) {
  const values = new Float64Array(bytes.byteLength / 8);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < values.length; index += 1) values[index] = view.getFloat64(index * 8, true);
  return values;
}

function decodeUint32Values(bytes) {
  const values = new Uint32Array(bytes.byteLength / 4);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  for (let index = 0; index < values.length; index += 1) values[index] = view.getUint32(index * 4, true);
  return values;
}

function digest(label) {
  return `sha256:${createHash('sha256').update(label).digest('hex')}`;
}
