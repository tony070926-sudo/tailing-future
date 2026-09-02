import { describe, expect, it } from 'vitest';
import Ajv2020 from 'ajv/dist/2020.js';
import molecularActionSchema from '../../schemas/molecular-action.schema.json' with { type: 'json' };
import molecularObservationSchema from '../../schemas/molecular-observation.schema.json' with { type: 'json' };
import molecularWorldStateSchema from '../../schemas/molecular-world-state.schema.json' with { type: 'json' };
import { createWaterDimerScene, magnitude, type Vector3 } from '../molecular/molecular-interactions';
import { digestValue, shortDigest } from './digest';
import {
  createInitialRigidWaterBodies,
  evaluateRigidWaterBodies,
  FORCE_TO_ACCELERATION_ANGSTROM_PER_PS2,
  integrateRigidWaterBodiesOneStep,
  MASS_VELOCITY_SQUARED_TO_KJ_MOL,
  MolecularDynamicsWorld,
  type RigidBodyStateV04,
} from './molecular-world';

describe('fixed-orientation rigid TIP3P translational world', () => {
  it('validates strict world, observation and action contracts', () => {
    const ajv = new Ajv2020({ allErrors: true, strict: true });
    const validateWorld = ajv.compile(molecularWorldStateSchema);
    const validateObservation = ajv.compile(molecularObservationSchema);
    const validateAction = ajv.compile(molecularActionSchema);
    const world = new MolecularDynamicsWorld();
    const initialState = world.serialize();
    expect(validateWorld(initialState), JSON.stringify(validateWorld.errors)).toBe(true);
    expect(validateObservation(world.observe()), JSON.stringify(validateObservation.errors)).toBe(true);
    world.advance(3);
    const steppedState = world.serialize();
    expect(validateWorld(steppedState), JSON.stringify(validateWorld.errors)).toBe(true);
    expect(validateObservation(world.observe()), JSON.stringify(validateObservation.errors)).toBe(true);
    expect(validateAction(steppedState.lastAction), JSON.stringify(validateAction.errors)).toBe(true);
    expect(validateWorld({ ...steppedState, unexpected: true })).toBe(false);
    expect(validateObservation({ ...world.observe(), stressStatus: 'calculated' })).toBe(false);
    expect(validateAction({ ...steppedState.lastAction, parameters: { substeps: 0 } })).toBe(false);
  });

  it('starts from the exact audited static water geometry and shared pair kernel', () => {
    const staticScene = createWaterDimerScene();
    const observation = new MolecularDynamicsWorld().observe();
    expect(observation.atoms).toHaveLength(6);
    expect(observation.pairInteractions).toHaveLength(9);
    for (const atom of staticScene.atoms) {
      const dynamic = observation.atoms.find((candidate) => candidate.id === atom.id);
      expect(dynamic).toBeDefined();
      expect(distance(dynamic!.positionAngstrom, atom.positionAngstrom)).toBeLessThan(3e-16);
      expect(dynamic!.chargeE).toBe(atom.chargeE);
      expect(dynamic!.massDalton).toBe(atom.massDalton);
      expect(magnitude(dynamic!.velocityAngstromPerPicosecond)).toBe(0);
      expect(distance(dynamic!.forceKjMolAngstrom, staticScene.forceByAtomIdKjMolAngstrom[atom.id]!)).toBeLessThan(1e-12);
    }
    expect(observation.energy.coulombKjMol).toBeCloseTo(staticScene.energy.coulombKjMol, 13);
    expect(observation.energy.lennardJonesKjMol).toBeCloseTo(staticScene.energy.lennardJonesKjMol!, 13);
    expect(observation.energy.kineticKjMol).toBe(0);
    expect(observation.conservation.totalChargeE).toBeCloseTo(0, 14);
    expect(observation.provenance.electronicStructureSolved).toBe(false);
  });

  it('locks the real-unit acceleration and kinetic-energy conversions', () => {
    expect(FORCE_TO_ACCELERATION_ANGSTROM_PER_PS2).toBe(100);
    expect(MASS_VELOCITY_SQUARED_TO_KJ_MOL).toBe(0.01);
    const bodies = createInitialRigidWaterBodies().map((body, index) => ({
      ...body,
      velocityAngstromPerPicosecond: { x: index === 0 ? 1 : -1, y: 0, z: 0 },
    })) as [RigidBodyStateV04, RigidBodyStateV04];
    const totalMass = new MolecularDynamicsWorld().observe().conservation.totalMassDalton;
    const expectedKinetic = 0.5 * MASS_VELOCITY_SQUARED_TO_KJ_MOL * totalMass;
    const momentum = bodies.reduce((sum, body) => sum + body.velocityAngstromPerPicosecond.x, 0);
    expect(momentum).toBe(0);
    expect(expectedKinetic).toBeCloseTo(0.18015324, 12);
  });

  it('matches the negative potential gradient for each translated body axis', () => {
    const bodies = createInitialRigidWaterBodies();
    const evaluated = evaluateRigidWaterBodies(bodies);
    const step = 1e-5;
    for (const axis of ['x', 'y', 'z'] as const) {
      const plus = translatedBodies(bodies, 'water-b', axis, step);
      const minus = translatedBodies(bodies, 'water-b', axis, -step);
      const numericalForce = -(potential(plus) - potential(minus)) / (2 * step);
      expect(Math.abs(numericalForce - evaluated.bodyForceById['water-b'][axis])).toBeLessThan(2e-5);
    }
  });

  it('performs the exact kick-drift-kick update for one step', () => {
    const timeStep = 0.0005;
    const initial = createInitialRigidWaterBodies();
    const current = evaluateRigidWaterBodies(initial);
    const mass = new MolecularDynamicsWorld().observe().bodies[0].massDalton;
    const halfVelocity = scale(current.bodyForceById['water-a'], 0.5 * timeStep * 100 / mass);
    const expectedCenter = add(initial[0].centerOfMassAngstrom, scale(halfVelocity, timeStep));
    const drifted = [
      { ...initial[0], centerOfMassAngstrom: expectedCenter, velocityAngstromPerPicosecond: halfVelocity },
      {
        ...initial[1],
        centerOfMassAngstrom: add(initial[1].centerOfMassAngstrom, scale(halfVelocity, -timeStep)),
        velocityAngstromPerPicosecond: scale(halfVelocity, -1),
      },
    ] as [RigidBodyStateV04, RigidBodyStateV04];
    const nextForce = evaluateRigidWaterBodies(drifted).bodyForceById['water-a'];
    const expectedVelocity = add(halfVelocity, scale(nextForce, 0.5 * timeStep * 100 / mass));
    const actual = integrateRigidWaterBodiesOneStep(initial, timeStep);
    expect(distance(actual[0].centerOfMassAngstrom, expectedCenter)).toBeLessThan(1e-15);
    expect(distance(actual[0].velocityAngstromPerPicosecond, expectedVelocity)).toBeLessThan(1e-15);
  });

  it('is deterministic and separates physical identity from action history', () => {
    const first = new MolecularDynamicsWorld();
    const second = new MolecularDynamicsWorld();
    expect(first.advance(300)).toEqual(second.advance(300));

    const batched = new MolecularDynamicsWorld();
    const incremental = new MolecularDynamicsWorld();
    batched.advance(3);
    incremental.advance();
    incremental.advance();
    incremental.advance();
    expect(batched.observe().physicalDigest).toBe(incremental.observe().physicalDigest);
    expect(batched.observe().stateDigest).not.toBe(incremental.observe().stateDigest);
    expect(batched.observe().atoms).toEqual(incremental.observe().atoms);
  });

  it('replays from serialization and gives sibling branches distinct lineage', () => {
    const world = new MolecularDynamicsWorld();
    world.advance(250);
    const replay = MolecularDynamicsWorld.fromSerialized(world.serialize());
    expect(replay.advance(80)).toEqual(world.advance(80));

    const firstBranch = world.clone(1);
    const secondBranch = world.clone(2);
    expect(firstBranch.observe().physicalDigest).toBe(secondBranch.observe().physicalDigest);
    expect(firstBranch.observe().stateDigest).not.toBe(secondBranch.observe().stateDigest);
    expect(firstBranch.observe().parentStateId).toBe(world.observe().stateId);
    expect(world.clone(1).serialize()).toEqual(firstBranch.serialize());
  });

  it('has second-order trajectory convergence under time-step refinement', () => {
    const finalTime = 0.02;
    const steps = [0.001, 0.0005, 0.00025, 0.000125];
    const results = steps.map((timeStep) => integrateFor(createInitialRigidWaterBodies(), timeStep, Math.round(finalTime / timeStep)));
    const reference = results.at(-1)!;
    const errors = results.slice(0, -1).map((bodies) => stateError(bodies, reference));
    expect(errors[0] / errors[1]).toBeGreaterThan(3.5);
    expect(errors[1] / errors[2]).toBeGreaterThan(3.5);
  });

  it('is time reversible within the locked numerical tolerance', () => {
    const initial = createInitialRigidWaterBodies();
    const forward = integrateFor(initial, 0.0005, 600);
    const reversed = forward.map((body) => ({
      ...body,
      velocityAngstromPerPicosecond: scale(body.velocityAngstromPerPicosecond, -1),
    })) as [RigidBodyStateV04, RigidBodyStateV04];
    const returned = integrateFor(reversed, 0.0005, 600);
    for (let index = 0; index < 2; index += 1) {
      expect(distance(returned[index].centerOfMassAngstrom, initial[index].centerOfMassAngstrom)).toBeLessThan(1e-10);
      expect(distance(returned[index].velocityAngstromPerPicosecond, initial[index].velocityAngstromPerPicosecond)).toBeLessThan(1e-9);
    }
  });

  it('keeps isolated-system energy, momentum, COM and rigid geometry inside locked gates for 10,000 steps', () => {
    const world = new MolecularDynamicsWorld();
    const replay = new MolecularDynamicsWorld();
    let maximumDrift = 0;
    let maximumMomentumResidual = 0;
    let maximumCenterResidual = 0;
    for (let index = 0; index < 100; index += 1) {
      const frame = world.advance(100);
      replay.advance(100);
      maximumDrift = Math.max(maximumDrift, Math.abs(frame.energy.relativeDrift));
      maximumMomentumResidual = Math.max(maximumMomentumResidual, frame.conservation.momentumResidual);
      maximumCenterResidual = Math.max(maximumCenterResidual, frame.conservation.centerOfMassResidualAngstrom);
      expect(frame.conservation.maximumBondResidualAngstrom).toBeLessThan(1e-12);
      expect(frame.conservation.maximumAngleResidualDegrees).toBeLessThan(1e-10);
    }
    expect(world.stepCount).toBe(10_000);
    expect(maximumDrift).toBeLessThan(1e-4);
    expect(maximumMomentumResidual).toBeLessThan(1e-9);
    expect(maximumCenterResidual).toBeLessThan(1e-9);
    const finalFrame = world.observe();
    expect(finalFrame.energy.maximumRelativeExcursion).toBeLessThan(1e-4);
    expect(finalFrame.energy.driftSampleCount).toBe(10_001);
    expect(finalFrame.energy.driftReferenceKjMol).toBeGreaterThan(0);
    expect(Number.isFinite(finalFrame.energy.linearDriftSlopeKjMolPerPicosecond)).toBe(true);
    expect(replay.serialize()).toEqual(world.serialize());
    expect(replay.observe()).toEqual(finalFrame);
    const before = world.serialize();
    expect(() => world.advance()).toThrow('maximum molecular trajectory length');
    expect(world.serialize()).toEqual(before);
  });

  it('rejects tampering and rolls back a failed numerical transition byte-for-byte', () => {
    const world = new MolecularDynamicsWorld();
    world.advance(4);
    const digestTamper = structuredClone(world.serialize());
    (digestTamper.bodies[0].centerOfMassAngstrom as { x: number }).x += 0.1;
    expect(() => MolecularDynamicsWorld.fromSerialized(digestTamper)).toThrow('physical digest mismatch');

    const topologyTamper = structuredClone(world.serialize());
    (topologyTamper.topology.atoms[0] as { chargeE: number }).chargeE += 0.1;
    expect(() => MolecularDynamicsWorld.fromSerialized(topologyTamper)).toThrow('topology digest mismatch');

    const internal = world as unknown as { bodies: [
      { centerOfMassAngstrom: Vector3 },
      { centerOfMassAngstrom: Vector3 },
    ] };
    internal.bodies[1].centerOfMassAngstrom = { ...internal.bodies[0].centerOfMassAngstrom };
    const before = world.serialize();
    expect(() => world.advance()).toThrow();
    expect(world.serialize()).toEqual(before);
  });

  it('rejects a recomputed action whose substep count contradicts the parent transition', () => {
    const world = new MolecularDynamicsWorld();
    world.advance(3);
    const tampered = structuredClone(world.serialize());
    const mutableAction = tampered.lastAction! as {
      kind: 'step' | 'branch';
      parentStateId: string;
      resultingStateId: string;
      appliedAtStep: number;
      parameters: Record<string, number>;
      actionId: string;
    };
    mutableAction.parameters = { substeps: 2 };
    const actionFingerprint = shortDigest({
      kind: tampered.lastAction!.kind,
      parentStateId: tampered.lastAction!.parentStateId,
      resultingStateId: tampered.lastAction!.resultingStateId,
      appliedAtStep: tampered.lastAction!.appliedAtStep,
      parameters: tampered.lastAction!.parameters,
    });
    mutableAction.actionId = `${tampered.stateNamespace}-a${tampered.actionCount.toString(36).padStart(5, '0')}-${actionFingerprint}`;
    (tampered as { stateDigest: string }).stateDigest = recomputeSerializedDigest(tampered);
    expect(() => MolecularDynamicsWorld.fromSerialized(tampered)).toThrow('step action does not match its state transition');
  });

  it('rejects a recomputed branch whose source step contradicts the parent transition', () => {
    const world = new MolecularDynamicsWorld();
    world.advance(3);
    const tampered = structuredClone(world.clone(1).serialize());
    const mutableAction = tampered.lastAction! as {
      kind: 'step' | 'branch';
      parentStateId: string;
      resultingStateId: string;
      appliedAtStep: number;
      parameters: Record<string, number>;
      actionId: string;
    };
    mutableAction.parameters = { fromStep: 2, branchOrdinal: 1 };
    const actionFingerprint = shortDigest({
      kind: mutableAction.kind,
      parentStateId: mutableAction.parentStateId,
      resultingStateId: mutableAction.resultingStateId,
      appliedAtStep: mutableAction.appliedAtStep,
      parameters: mutableAction.parameters,
    });
    mutableAction.actionId = `${tampered.stateNamespace}-a${tampered.actionCount.toString(36).padStart(5, '0')}-${actionFingerprint}`;
    (tampered as { stateDigest: string }).stateDigest = recomputeSerializedDigest(tampered);
    expect(() => MolecularDynamicsWorld.fromSerialized(tampered)).toThrow('branch action does not match its state transition');
  });

  it('rejects a recomputed state that translates the locked initial center of mass', () => {
    const tampered = structuredClone(new MolecularDynamicsWorld().serialize());
    for (const body of tampered.bodies) (body.centerOfMassAngstrom as { x: number }).x += 1;
    (tampered as { physicalDigest: string }).physicalDigest = digestValue({
      schemaVersion: 'tf.molecular-physical-state/0.4',
      step: tampered.step,
      options: tampered.options,
      topologyDigest: tampered.topologyDigest,
      bodies: tampered.bodies,
    });
    const suffix = shortDigest({
      digest: tampered.physicalDigest,
      parentStateId: tampered.parentStateId,
      revision: tampered.revision,
      actionCount: tampered.actionCount,
      branchCount: tampered.branchCount,
    });
    (tampered as { stateId: string }).stateId = `${tampered.stateNamespace}-s000000r0000-${suffix}`;
    (tampered as { stateDigest: string }).stateDigest = recomputeSerializedDigest(tampered);
    expect(() => MolecularDynamicsWorld.fromSerialized(tampered)).toThrow('initial molecular state');
  });

  it('hard-stops a transition whose center of mass was displaced out of contract', () => {
    const world = new MolecularDynamicsWorld();
    const internal = world as unknown as { bodies: [
      { centerOfMassAngstrom: { x: number; y: number; z: number } },
      { centerOfMassAngstrom: { x: number; y: number; z: number } },
    ] };
    for (const body of internal.bodies) body.centerOfMassAngstrom.x += 1;
    expect(() => world.advance()).toThrow('center-of-mass residual');
  });
});

function recomputeSerializedDigest(state: ReturnType<MolecularDynamicsWorld['serialize']>) {
  const withoutDigest = Object.fromEntries(Object.entries(state).filter(([key]) => key !== 'stateDigest'));
  return digestValue(withoutDigest);
}

function potential(bodies: ReadonlyArray<RigidBodyStateV04>) {
  const evaluated = evaluateRigidWaterBodies(bodies);
  return evaluated.coulombKjMol + evaluated.lennardJonesKjMol;
}

function translatedBodies(
  bodies: ReadonlyArray<RigidBodyStateV04>,
  id: RigidBodyStateV04['id'],
  axis: keyof Vector3,
  amount: number,
) {
  return bodies.map((body) => ({
    ...body,
    centerOfMassAngstrom: {
      ...body.centerOfMassAngstrom,
      [axis]: body.centerOfMassAngstrom[axis] + (body.id === id ? amount : 0),
    },
  })) as [RigidBodyStateV04, RigidBodyStateV04];
}

function integrateFor(
  initial: ReadonlyArray<RigidBodyStateV04>,
  timeStep: number,
  steps: number,
) {
  let bodies = initial.map((body) => ({
    ...body,
    centerOfMassAngstrom: { ...body.centerOfMassAngstrom },
    velocityAngstromPerPicosecond: { ...body.velocityAngstromPerPicosecond },
  })) as [RigidBodyStateV04, RigidBodyStateV04];
  for (let index = 0; index < steps; index += 1) bodies = integrateRigidWaterBodiesOneStep(bodies, timeStep);
  return bodies;
}

function stateError(
  actual: ReadonlyArray<RigidBodyStateV04>,
  reference: ReadonlyArray<RigidBodyStateV04>,
) {
  return Math.sqrt(actual.reduce((sum, body, index) => (
    sum
    + distance(body.centerOfMassAngstrom, reference[index].centerOfMassAngstrom) ** 2
    + distance(body.velocityAngstromPerPicosecond, reference[index].velocityAngstromPerPicosecond) ** 2
  ), 0));
}

function distance(a: Vector3, b: Vector3) {
  return Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
}

function add(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function scale(vector: Vector3, factor: number): Vector3 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}
