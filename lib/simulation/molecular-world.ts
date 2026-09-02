import { digestValue, shortDigest } from './digest.ts';
import {
  createWaterDimerScene,
  evaluateClassicalPairInteraction,
  magnitude,
  type ChemicalElement,
  type MolecularAtom,
  type MolecularBond,
  type MolecularScene,
  type PairInteraction,
  type Vector3,
} from '../molecular/molecular-interactions.ts';

export const FORCE_TO_ACCELERATION_ANGSTROM_PER_PS2 = 100;
export const MASS_VELOCITY_SQUARED_TO_KJ_MOL = 0.01;

export const MOLECULAR_WORLD_OPTIONS = Object.freeze({
  scenario: 'water-dimer-2.9A-0deg-rest/v1',
  forceModel: 'tf-local-classical-tip3p-openmm-8.5.1-parameters-cross-only/v1',
  integrator: 'velocity-verlet-fixed-orientation/v1',
  constraint: 'fixed-body-frame-no-rotation',
  ensemble: 'isolated-constant-energy',
  boundary: 'vacuum',
  timeStepPicoseconds: 0.0005,
  maximumSteps: 10_000,
} as const);

export type WaterBodyId = 'water-a' | 'water-b';

export type AtomTopologyV04 = Readonly<{
  id: string;
  bodyId: WaterBodyId;
  label: string;
  element: ChemicalElement;
  chargeE: number;
  massDalton: number;
  displayRadiusAngstrom: number;
  fixedOffsetFromComAngstrom: Vector3;
}>;

export type MolecularTopologyV04 = Readonly<{
  atoms: ReadonlyArray<AtomTopologyV04>;
  bonds: ReadonlyArray<MolecularBond>;
}>;

export type RigidBodyStateV04 = Readonly<{
  id: WaterBodyId;
  centerOfMassAngstrom: Vector3;
  velocityAngstromPerPicosecond: Vector3;
}>;

export type MolecularWorldOptionsV04 = typeof MOLECULAR_WORLD_OPTIONS;

export type MolecularEnergyStatisticsV04 = Readonly<{
  sampleCount: number;
  timeSumPicoseconds: number;
  energySumKjMol: number;
  timeSquaredSumPicoseconds2: number;
  timeEnergySumKjMolPicoseconds: number;
  maximumAbsoluteExcursionKjMol: number;
}>;

export type MolecularActionV04 = Readonly<{
  schemaVersion: 'tf.molecular-action/0.4';
  actionId: string;
  kind: 'step' | 'branch';
  parentStateId: string;
  resultingStateId: string;
  appliedAtStep: number;
  parameters: Readonly<Record<string, number>>;
}>;

export type SerializedMolecularWorldV04 = Readonly<{
  schemaVersion: 'tf.molecular-world-state/0.4';
  worldId: 'tf.world/water-dimer-fixed-orientation-isolated-energy/v1';
  stateId: string;
  stateDigest: string;
  physicalDigest: string;
  parentStateId: string | null;
  stateNamespace: string;
  revision: number;
  actionCount: number;
  branchCount: number;
  step: number;
  options: MolecularWorldOptionsV04;
  topologyDigest: string;
  topology: MolecularTopologyV04;
  bodies: readonly [RigidBodyStateV04, RigidBodyStateV04];
  initialTotalEnergyKjMol: number;
  initialMomentumDaltonAngstromPerPicosecond: Vector3;
  initialCenterOfMassAngstrom: Vector3;
  energyReferenceKjMol: number;
  energyStatistics: MolecularEnergyStatisticsV04;
  lastAction: MolecularActionV04 | null;
}>;

export type MolecularAtomObservationV04 = Readonly<{
  id: string;
  bodyId: WaterBodyId;
  label: string;
  element: ChemicalElement;
  chargeE: number;
  massDalton: number;
  positionAngstrom: Vector3;
  velocityAngstromPerPicosecond: Vector3;
  forceKjMolAngstrom: Vector3;
}>;

export type MolecularBodyObservationV04 = RigidBodyStateV04 & Readonly<{
  massDalton: number;
  forceKjMolAngstrom: Vector3;
  unintegratedTorqueKjMol: Vector3;
}>;

export type MolecularObservationV04 = Readonly<{
  schemaVersion: 'tf.molecular-observation/0.4';
  worldId: SerializedMolecularWorldV04['worldId'];
  stateId: string;
  stateDigest: string;
  physicalDigest: string;
  parentStateId: string | null;
  step: number;
  timePicoseconds: number;
  options: MolecularWorldOptionsV04;
  topologyDigest: string;
  atoms: ReadonlyArray<MolecularAtomObservationV04>;
  bonds: ReadonlyArray<MolecularBond>;
  bodies: readonly [MolecularBodyObservationV04, MolecularBodyObservationV04];
  pairInteractions: ReadonlyArray<PairInteraction>;
  forceByAtomIdKjMolAngstrom: Readonly<Record<string, Vector3>>;
  energy: Readonly<{
    coulombKjMol: number;
    lennardJonesKjMol: number;
    potentialKjMol: number;
    kineticKjMol: number;
    totalKjMol: number;
    initialTotalKjMol: number;
    driftReferenceKjMol: number;
    absoluteExcursionKjMol: number;
    maximumAbsoluteExcursionKjMol: number;
    relativeDrift: number;
    maximumRelativeExcursion: number;
    linearDriftSlopeKjMolPerPicosecond: number;
    linearRelativeDriftRatePerPicosecond: number;
    driftSampleCount: number;
  }>;
  conservation: Readonly<{
    totalMassDalton: number;
    totalChargeE: number;
    totalMomentumDaltonAngstromPerPicosecond: Vector3;
    momentumResidual: number;
    centerOfMassAngstrom: Vector3;
    centerOfMassResidualAngstrom: number;
    internalForceResidualKjMolAngstrom: number;
    maximumBondResidualAngstrom: number;
    maximumAngleResidualDegrees: number;
  }>;
  cell: Readonly<{
    boundary: 'vacuum';
    periodicAxes: readonly [false, false, false];
    vectorsAngstrom: null;
  }>;
  thermodynamics: Readonly<{
    temperatureKelvin: null;
    pressure: null;
    status: 'not-defined-for-two-fixed-orientation-bodies';
  }>;
  stressKjMolAngstrom3: null;
  stressStatus: 'not-modeled-vacuum-two-body';
  numericalValidity: Readonly<{
    status: 'pass';
    energyDriftLimit: number;
    energyGateMetric: 'maximum-relative-excursion';
    momentumResidualLimit: number;
    internalForceResidualLimit: number;
    minimumCrossPairDistanceAngstrom: number;
  }>;
  provenance: Readonly<{
    solver: 'tf-fixed-orientation-rigid-body-vv';
    solverVersion: '0.4.0';
    modelRole: 'solver';
    fidelity: 'two-fixed-orientation-rigid-tip3p-parameterized-monomers-isolated-energy';
    forceModel: MolecularWorldOptionsV04['forceModel'];
    electronicStructureSolved: false;
    uncertaintyStatus: 'not-quantified';
  }>;
  boundaries: ReadonlyArray<string>;
}>;

type MutableBody = {
  id: WaterBodyId;
  centerOfMassAngstrom: Vector3;
  velocityAngstromPerPicosecond: Vector3;
};

type EvaluatedWorld = {
  atoms: MolecularAtom[];
  pairInteractions: PairInteraction[];
  forceByAtomIdKjMolAngstrom: Record<string, Vector3>;
  bodyForceById: Record<WaterBodyId, Vector3>;
  bodyTorqueById: Record<WaterBodyId, Vector3>;
  coulombKjMol: number;
  lennardJonesKjMol: number;
  minimumCrossPairDistanceAngstrom: number;
};

const WORLD_ID = 'tf.world/water-dimer-fixed-orientation-isolated-energy/v1' as const;
const ENERGY_DRIFT_LIMIT = 1e-4;
const MOMENTUM_RESIDUAL_LIMIT = 1e-9;
const INTERNAL_FORCE_RESIDUAL_LIMIT = 1e-9;
const POSITION_DOMAIN = Object.freeze({ minimumOxygenSeparationAngstrom: 2.45, maximumOxygenSeparationAngstrom: 4.8 });
const WORLD_BOUNDARIES = Object.freeze([
  '两个刚性 TIP3P 水分子仅积分质心平移；分子取向固定，力矩只报告而不积分。',
  '真空孤立体系的定能、固定时间步 Velocity Verlet 演示；未定义周期体积或热力学系综，不是生产级分子动力学。',
  '势能和原子力仅来自跨分子固定电荷 Coulomb 与 O–O Lennard–Jones；没有极化、电子重排、断键或反应。',
  '温度、压力、应力和模型不确定度未对两个固定取向刚体定义；不得用于材料、工艺或安全决策。',
]);

const STATIC_WATER_SCENE = createWaterDimerScene();
const LOCKED_TOPOLOGY = createLockedTopology(STATIC_WATER_SCENE);
const TOPOLOGY_DIGEST = digestValue(LOCKED_TOPOLOGY);
const INITIAL_BODIES = createInitialBodies(STATIC_WATER_SCENE, LOCKED_TOPOLOGY);
const BASE_NAMESPACE = `tfmw-${shortDigest({ options: MOLECULAR_WORLD_OPTIONS, topologyDigest: TOPOLOGY_DIGEST })}`;

export class MolecularDynamicsWorld {
  readonly options = MOLECULAR_WORLD_OPTIONS;
  private bodies: [MutableBody, MutableBody];
  private _step = 0;
  private _stateId = '';
  private _stateDigest = '';
  private _physicalDigest = '';
  private _parentStateId: string | null = null;
  private _stateNamespace = BASE_NAMESPACE;
  private _revision = 0;
  private _actionCount = 0;
  private _branchCount = 0;
  private _lastAction: MolecularActionV04 | null = null;
  private initialTotalEnergyKjMol: number;
  private initialMomentumDaltonAngstromPerPicosecond: Vector3;
  private initialCenterOfMassAngstrom: Vector3;
  private energyReferenceKjMol: number;
  private energyStatistics: MolecularEnergyStatisticsV04;

  constructor() {
    this.bodies = cloneBodies(INITIAL_BODIES);
    const evaluated = evaluateRigidWaterBodies(this.bodies);
    this.initialTotalEnergyKjMol = potentialEnergy(evaluated) + kineticEnergy(this.bodies);
    this.initialMomentumDaltonAngstromPerPicosecond = totalMomentum(this.bodies);
    this.initialCenterOfMassAngstrom = systemCenterOfMass(this.bodies);
    this.energyReferenceKjMol = Math.max(Math.abs(this.initialTotalEnergyKjMol), 1);
    this.energyStatistics = initialEnergyStatistics(this.initialTotalEnergyKjMol);
    this.refreshIdentity();
    this.assertObservation(this.observe());
  }

  get stepCount() { return this._step; }

  advance(substeps = 1): MolecularObservationV04 {
    if (!Number.isInteger(substeps) || substeps < 1 || substeps > 1_000) {
      throw new Error('substeps must be an integer in [1, 1000]');
    }
    if (this._step + substeps > this.options.maximumSteps) throw new Error('maximum molecular trajectory length exceeded');
    const backup = this.captureMutableState();
    const parentStateId = this._stateId;
    try {
      for (let index = 0; index < substeps; index += 1) {
        this.bodies = integrateRigidWaterBodiesOneStep(this.bodies, this.options.timeStepPicoseconds);
        this._step += 1;
        this.recordEnergySample();
      }
      this._parentStateId = parentStateId;
      this._revision += 1;
      this._actionCount += 1;
      this._physicalDigest = physicalDigest(this._step, this.bodies);
      this._stateId = stateIdFor({
        namespace: this._stateNamespace,
        step: this._step,
        revision: this._revision,
        actionCount: this._actionCount,
        branchCount: this._branchCount,
        parentStateId,
        physicalDigest: this._physicalDigest,
      });
      this._lastAction = createAction({
        namespace: this._stateNamespace,
        ordinal: this._actionCount,
        kind: 'step',
        parentStateId,
        resultingStateId: this._stateId,
        appliedAtStep: this._step,
        parameters: { substeps },
      });
      this._stateDigest = serializedStateDigest(this.serializedStateWithoutDigest());
      const observation = this.observe();
      this.assertObservation(observation);
      return observation;
    } catch (error) {
      this.restoreMutableState(backup);
      throw error;
    }
  }

  observe(): MolecularObservationV04 {
    const evaluated = evaluateRigidWaterBodies(this.bodies);
    const kineticKjMol = kineticEnergy(this.bodies);
    const potentialKjMol = potentialEnergy(evaluated);
    const totalKjMol = kineticKjMol + potentialKjMol;
    const absoluteExcursionKjMol = Math.abs(totalKjMol - this.initialTotalEnergyKjMol);
    const linearDriftSlopeKjMolPerPicosecond = energyDriftSlope(this.energyStatistics);
    const momentum = totalMomentum(this.bodies);
    const centerOfMass = systemCenterOfMass(this.bodies);
    const initialVelocity = scale(
      this.initialMomentumDaltonAngstromPerPicosecond,
      1 / totalBodyMassDalton(),
    );
    const expectedCenterOfMass = add(
      this.initialCenterOfMassAngstrom,
      scale(initialVelocity, this._step * this.options.timeStepPicoseconds),
    );
    const forceByAtomIdKjMolAngstrom = cloneVectorRecord(evaluated.forceByAtomIdKjMolAngstrom);
    const atomObservations = evaluated.atoms.map((atom) => ({
      id: atom.id,
      bodyId: atom.groupId as WaterBodyId,
      label: atom.label,
      element: atom.element,
      chargeE: atom.chargeE,
      massDalton: requireMass(atom.massDalton, atom.id),
      positionAngstrom: { ...atom.positionAngstrom },
      velocityAngstromPerPicosecond: { ...requireBody(this.bodies, atom.groupId as WaterBodyId).velocityAngstromPerPicosecond },
      forceKjMolAngstrom: { ...forceByAtomIdKjMolAngstrom[atom.id] },
    }));
    const geometry = geometryResiduals(atomObservations, LOCKED_TOPOLOGY.bonds);
    const bodyObservations = this.bodies.map((body) => ({
      id: body.id,
      centerOfMassAngstrom: { ...body.centerOfMassAngstrom },
      velocityAngstromPerPicosecond: { ...body.velocityAngstromPerPicosecond },
      massDalton: bodyMassDalton(body.id),
      forceKjMolAngstrom: { ...evaluated.bodyForceById[body.id] },
      unintegratedTorqueKjMol: { ...evaluated.bodyTorqueById[body.id] },
    })) as [MolecularBodyObservationV04, MolecularBodyObservationV04];

    return {
      schemaVersion: 'tf.molecular-observation/0.4',
      worldId: WORLD_ID,
      stateId: this._stateId,
      stateDigest: this._stateDigest,
      physicalDigest: this._physicalDigest,
      parentStateId: this._parentStateId,
      step: this._step,
      timePicoseconds: this._step * this.options.timeStepPicoseconds,
      options: { ...this.options },
      topologyDigest: TOPOLOGY_DIGEST,
      atoms: atomObservations,
      bonds: LOCKED_TOPOLOGY.bonds.map((bond) => ({ ...bond })),
      bodies: bodyObservations,
      pairInteractions: evaluated.pairInteractions.map(clonePairInteraction),
      forceByAtomIdKjMolAngstrom,
      energy: {
        coulombKjMol: evaluated.coulombKjMol,
        lennardJonesKjMol: evaluated.lennardJonesKjMol,
        potentialKjMol,
        kineticKjMol,
        totalKjMol,
        initialTotalKjMol: this.initialTotalEnergyKjMol,
        driftReferenceKjMol: this.energyReferenceKjMol,
        absoluteExcursionKjMol,
        maximumAbsoluteExcursionKjMol: this.energyStatistics.maximumAbsoluteExcursionKjMol,
        relativeDrift: (totalKjMol - this.initialTotalEnergyKjMol) / this.energyReferenceKjMol,
        maximumRelativeExcursion: this.energyStatistics.maximumAbsoluteExcursionKjMol / this.energyReferenceKjMol,
        linearDriftSlopeKjMolPerPicosecond,
        linearRelativeDriftRatePerPicosecond: linearDriftSlopeKjMolPerPicosecond / this.energyReferenceKjMol,
        driftSampleCount: this.energyStatistics.sampleCount,
      },
      conservation: {
        totalMassDalton: totalBodyMassDalton(),
        totalChargeE: atomObservations.reduce((sum, atom) => sum + atom.chargeE, 0),
        totalMomentumDaltonAngstromPerPicosecond: momentum,
        momentumResidual: magnitude(subtract(momentum, this.initialMomentumDaltonAngstromPerPicosecond)),
        centerOfMassAngstrom: centerOfMass,
        centerOfMassResidualAngstrom: magnitude(subtract(centerOfMass, expectedCenterOfMass)),
        internalForceResidualKjMolAngstrom: magnitude(add(
          evaluated.bodyForceById['water-a'],
          evaluated.bodyForceById['water-b'],
        )),
        maximumBondResidualAngstrom: geometry.maximumBondResidualAngstrom,
        maximumAngleResidualDegrees: geometry.maximumAngleResidualDegrees,
      },
      cell: { boundary: 'vacuum', periodicAxes: [false, false, false], vectorsAngstrom: null },
      thermodynamics: { temperatureKelvin: null, pressure: null, status: 'not-defined-for-two-fixed-orientation-bodies' },
      stressKjMolAngstrom3: null,
      stressStatus: 'not-modeled-vacuum-two-body',
      numericalValidity: {
        status: 'pass',
        energyDriftLimit: ENERGY_DRIFT_LIMIT,
        energyGateMetric: 'maximum-relative-excursion',
        momentumResidualLimit: MOMENTUM_RESIDUAL_LIMIT,
        internalForceResidualLimit: INTERNAL_FORCE_RESIDUAL_LIMIT,
        minimumCrossPairDistanceAngstrom: evaluated.minimumCrossPairDistanceAngstrom,
      },
      provenance: {
        solver: 'tf-fixed-orientation-rigid-body-vv',
        solverVersion: '0.4.0',
        modelRole: 'solver',
        fidelity: 'two-fixed-orientation-rigid-tip3p-parameterized-monomers-isolated-energy',
        forceModel: this.options.forceModel,
        electronicStructureSolved: false,
        uncertaintyStatus: 'not-quantified',
      },
      boundaries: [...WORLD_BOUNDARIES],
    };
  }

  serialize(): SerializedMolecularWorldV04 {
    return {
      ...this.serializedStateWithoutDigest(),
      stateDigest: this._stateDigest,
    };
  }

  clone(branchOrdinal: number): MolecularDynamicsWorld {
    if (!Number.isSafeInteger(branchOrdinal) || branchOrdinal < 1) {
      throw new Error('branch ordinal must be a positive safe integer');
    }
    const clone = MolecularDynamicsWorld.fromSerialized(this.serialize());
    const parentStateId = this._stateId;
    clone._stateNamespace = `${this._stateNamespace}-b${branchOrdinal.toString(36)}`;
    clone._parentStateId = parentStateId;
    clone._revision += 1;
    clone._actionCount += 1;
    clone._branchCount += 1;
    clone._physicalDigest = physicalDigest(clone._step, clone.bodies);
    clone._stateId = stateIdFor({
      namespace: clone._stateNamespace,
      step: clone._step,
      revision: clone._revision,
      actionCount: clone._actionCount,
      branchCount: clone._branchCount,
      parentStateId,
      physicalDigest: clone._physicalDigest,
    });
    clone._lastAction = createAction({
      namespace: clone._stateNamespace,
      ordinal: clone._actionCount,
      kind: 'branch',
      parentStateId,
      resultingStateId: clone._stateId,
      appliedAtStep: clone._step,
      parameters: { fromStep: clone._step, branchOrdinal },
    });
    clone._stateDigest = serializedStateDigest(clone.serializedStateWithoutDigest());
    clone.assertObservation(clone.observe());
    return clone;
  }

  static fromSerialized(state: SerializedMolecularWorldV04): MolecularDynamicsWorld {
    assertSerializedWorld(state);
    const world = new MolecularDynamicsWorld();
    world.bodies = cloneBodies(state.bodies);
    world._step = state.step;
    world._stateId = state.stateId;
    world._stateDigest = state.stateDigest;
    world._physicalDigest = state.physicalDigest;
    world._parentStateId = state.parentStateId;
    world._stateNamespace = state.stateNamespace;
    world._revision = state.revision;
    world._actionCount = state.actionCount;
    world._branchCount = state.branchCount;
    world._lastAction = state.lastAction ? cloneAction(state.lastAction) : null;
    world.initialTotalEnergyKjMol = state.initialTotalEnergyKjMol;
    world.initialMomentumDaltonAngstromPerPicosecond = { ...state.initialMomentumDaltonAngstromPerPicosecond };
    world.initialCenterOfMassAngstrom = { ...state.initialCenterOfMassAngstrom };
    world.energyReferenceKjMol = state.energyReferenceKjMol;
    world.energyStatistics = { ...state.energyStatistics };
    world.assertObservation(world.observe());
    return world;
  }

  private recordEnergySample() {
    const evaluated = evaluateRigidWaterBodies(this.bodies);
    const totalKjMol = potentialEnergy(evaluated) + kineticEnergy(this.bodies);
    const timePicoseconds = this._step * this.options.timeStepPicoseconds;
    this.energyStatistics = {
      sampleCount: this.energyStatistics.sampleCount + 1,
      timeSumPicoseconds: this.energyStatistics.timeSumPicoseconds + timePicoseconds,
      energySumKjMol: this.energyStatistics.energySumKjMol + totalKjMol,
      timeSquaredSumPicoseconds2: this.energyStatistics.timeSquaredSumPicoseconds2 + timePicoseconds ** 2,
      timeEnergySumKjMolPicoseconds: this.energyStatistics.timeEnergySumKjMolPicoseconds + timePicoseconds * totalKjMol,
      maximumAbsoluteExcursionKjMol: Math.max(
        this.energyStatistics.maximumAbsoluteExcursionKjMol,
        Math.abs(totalKjMol - this.initialTotalEnergyKjMol),
      ),
    };
  }

  private refreshIdentity() {
    this._physicalDigest = physicalDigest(this._step, this.bodies);
    this._stateId = stateIdFor({
      namespace: this._stateNamespace,
      step: this._step,
      revision: this._revision,
      actionCount: this._actionCount,
      branchCount: this._branchCount,
      parentStateId: this._parentStateId,
      physicalDigest: this._physicalDigest,
    });
    this._stateDigest = serializedStateDigest(this.serializedStateWithoutDigest());
  }

  private serializedStateWithoutDigest(): Omit<SerializedMolecularWorldV04, 'stateDigest'> {
    return {
      schemaVersion: 'tf.molecular-world-state/0.4',
      worldId: WORLD_ID,
      stateId: this._stateId,
      physicalDigest: this._physicalDigest,
      parentStateId: this._parentStateId,
      stateNamespace: this._stateNamespace,
      revision: this._revision,
      actionCount: this._actionCount,
      branchCount: this._branchCount,
      step: this._step,
      options: { ...this.options },
      topologyDigest: TOPOLOGY_DIGEST,
      topology: cloneTopology(LOCKED_TOPOLOGY),
      bodies: cloneBodies(this.bodies),
      initialTotalEnergyKjMol: this.initialTotalEnergyKjMol,
      initialMomentumDaltonAngstromPerPicosecond: { ...this.initialMomentumDaltonAngstromPerPicosecond },
      initialCenterOfMassAngstrom: { ...this.initialCenterOfMassAngstrom },
      energyReferenceKjMol: this.energyReferenceKjMol,
      energyStatistics: { ...this.energyStatistics },
      lastAction: this._lastAction ? cloneAction(this._lastAction) : null,
    };
  }

  private assertObservation(observation: MolecularObservationV04) {
    assertFiniteTree(observation, 'molecular observation');
    if (observation.energy.maximumRelativeExcursion > ENERGY_DRIFT_LIMIT) {
      throw new Error('molecular trajectory energy drift exceeded the locked isolated-energy gate');
    }
    if (observation.conservation.momentumResidual > MOMENTUM_RESIDUAL_LIMIT) {
      throw new Error('molecular trajectory momentum residual exceeded the locked gate');
    }
    if (observation.conservation.internalForceResidualKjMolAngstrom > INTERNAL_FORCE_RESIDUAL_LIMIT) {
      throw new Error('molecular trajectory internal force closure exceeded the locked gate');
    }
    if (observation.conservation.centerOfMassResidualAngstrom > MOMENTUM_RESIDUAL_LIMIT) {
      throw new Error('molecular trajectory center-of-mass residual exceeded the locked gate');
    }
    if (observation.conservation.maximumBondResidualAngstrom > 1e-12
        || observation.conservation.maximumAngleResidualDegrees > 1e-10) {
      throw new Error('fixed water geometry changed during molecular trajectory');
    }
    const oxygenSeparation = oxygenDistance(observation.atoms);
    if (oxygenSeparation < POSITION_DOMAIN.minimumOxygenSeparationAngstrom
        || oxygenSeparation > POSITION_DOMAIN.maximumOxygenSeparationAngstrom) {
      throw new Error('molecular trajectory left the locked separation domain');
    }
  }

  private captureMutableState() {
    return {
      bodies: cloneBodies(this.bodies),
      step: this._step,
      stateId: this._stateId,
      stateDigest: this._stateDigest,
      physicalDigest: this._physicalDigest,
      parentStateId: this._parentStateId,
      revision: this._revision,
      actionCount: this._actionCount,
      branchCount: this._branchCount,
      energyStatistics: { ...this.energyStatistics },
      lastAction: this._lastAction ? cloneAction(this._lastAction) : null,
    };
  }

  private restoreMutableState(state: ReturnType<MolecularDynamicsWorld['captureMutableState']>) {
    this.bodies = cloneBodies(state.bodies);
    this._step = state.step;
    this._stateId = state.stateId;
    this._stateDigest = state.stateDigest;
    this._physicalDigest = state.physicalDigest;
    this._parentStateId = state.parentStateId;
    this._revision = state.revision;
    this._actionCount = state.actionCount;
    this._branchCount = state.branchCount;
    this.energyStatistics = { ...state.energyStatistics };
    this._lastAction = state.lastAction ? cloneAction(state.lastAction) : null;
  }
}

export function createInitialRigidWaterBodies(): readonly [RigidBodyStateV04, RigidBodyStateV04] {
  return cloneBodies(INITIAL_BODIES);
}

export function evaluateRigidWaterBodies(
  bodies: ReadonlyArray<RigidBodyStateV04>,
): EvaluatedWorld {
  assertBodies(bodies);
  const atoms = atomsFromBodies(bodies);
  const forceByAtomIdKjMolAngstrom = Object.fromEntries(
    atoms.map((atom) => [atom.id, { x: 0, y: 0, z: 0 } satisfies Vector3]),
  );
  const pairInteractions: PairInteraction[] = [];
  let coulombKjMol = 0;
  let lennardJonesKjMol = 0;
  let minimumCrossPairDistanceAngstrom = Number.POSITIVE_INFINITY;
  const waterA = atoms.filter((atom) => atom.groupId === 'water-a');
  const waterB = atoms.filter((atom) => atom.groupId === 'water-b');
  for (const source of waterA) {
    for (const target of waterB) {
      const interaction = evaluateClassicalPairInteraction(
        source,
        target,
        source.element === 'O' && target.element === 'O',
      );
      pairInteractions.push(interaction);
      coulombKjMol += interaction.coulombEnergyKjMol;
      lennardJonesKjMol += interaction.lennardJonesEnergyKjMol;
      minimumCrossPairDistanceAngstrom = Math.min(minimumCrossPairDistanceAngstrom, interaction.distanceAngstrom);
      forceByAtomIdKjMolAngstrom[target.id] = add(
        forceByAtomIdKjMolAngstrom[target.id],
        interaction.forceOnTargetKjMolAngstrom,
      );
      forceByAtomIdKjMolAngstrom[source.id] = subtract(
        forceByAtomIdKjMolAngstrom[source.id],
        interaction.forceOnTargetKjMolAngstrom,
      );
    }
  }
  const bodyForceById = {
    'water-a': sumVectors(waterA.map((atom) => forceByAtomIdKjMolAngstrom[atom.id])),
    'water-b': sumVectors(waterB.map((atom) => forceByAtomIdKjMolAngstrom[atom.id])),
  };
  const bodyTorqueById = {
    'water-a': sumVectors(waterA.map((atom) => cross(
      requireTopologyAtom(atom.id).fixedOffsetFromComAngstrom,
      forceByAtomIdKjMolAngstrom[atom.id],
    ))),
    'water-b': sumVectors(waterB.map((atom) => cross(
      requireTopologyAtom(atom.id).fixedOffsetFromComAngstrom,
      forceByAtomIdKjMolAngstrom[atom.id],
    ))),
  };
  assertFiniteTree({
    atoms,
    pairInteractions,
    forceByAtomIdKjMolAngstrom,
    bodyForceById,
    bodyTorqueById,
    coulombKjMol,
    lennardJonesKjMol,
    minimumCrossPairDistanceAngstrom,
  }, 'evaluated rigid water state');
  return {
    atoms,
    pairInteractions,
    forceByAtomIdKjMolAngstrom,
    bodyForceById,
    bodyTorqueById,
    coulombKjMol,
    lennardJonesKjMol,
    minimumCrossPairDistanceAngstrom,
  };
}

export function integrateRigidWaterBodiesOneStep(
  bodies: ReadonlyArray<RigidBodyStateV04>,
  timeStepPicoseconds: number,
): [RigidBodyStateV04, RigidBodyStateV04] {
  assertBodies(bodies);
  if (!(Number.isFinite(timeStepPicoseconds) && timeStepPicoseconds > 0 && timeStepPicoseconds <= 0.002)) {
    throw new Error('time step must be finite and in (0, 0.002] ps');
  }
  const currentEvaluation = evaluateRigidWaterBodies(bodies);
  const halfStepped = bodies.map((body) => ({
    id: body.id,
    centerOfMassAngstrom: { ...body.centerOfMassAngstrom },
    velocityAngstromPerPicosecond: add(
      body.velocityAngstromPerPicosecond,
      scale(
        currentEvaluation.bodyForceById[body.id],
        0.5 * timeStepPicoseconds * FORCE_TO_ACCELERATION_ANGSTROM_PER_PS2 / bodyMassDalton(body.id),
      ),
    ),
  })) as [RigidBodyStateV04, RigidBodyStateV04];
  const drifted = halfStepped.map((body) => ({
    ...body,
    centerOfMassAngstrom: add(
      body.centerOfMassAngstrom,
      scale(body.velocityAngstromPerPicosecond, timeStepPicoseconds),
    ),
  })) as [RigidBodyStateV04, RigidBodyStateV04];
  const nextEvaluation = evaluateRigidWaterBodies(drifted);
  const next = drifted.map((body) => ({
    id: body.id,
    centerOfMassAngstrom: { ...body.centerOfMassAngstrom },
    velocityAngstromPerPicosecond: add(
      body.velocityAngstromPerPicosecond,
      scale(
        nextEvaluation.bodyForceById[body.id],
        0.5 * timeStepPicoseconds * FORCE_TO_ACCELERATION_ANGSTROM_PER_PS2 / bodyMassDalton(body.id),
      ),
    ),
  })) as [RigidBodyStateV04, RigidBodyStateV04];
  assertBodies(next);
  return next;
}

export function createSceneFromMolecularObservation(observation: MolecularObservationV04): MolecularScene {
  const staticScene = createWaterDimerScene();
  const atoms: MolecularAtom[] = observation.atoms.map((atom) => ({
    id: atom.id,
    label: atom.label,
    element: atom.element,
    groupId: atom.bodyId,
    chargeE: atom.chargeE,
    chargeKind: 'partial',
    massDalton: atom.massDalton,
    positionAngstrom: { ...atom.positionAngstrom },
    displayRadiusAngstrom: requireTopologyAtom(atom.id).displayRadiusAngstrom,
  }));
  return {
    ...staticScene,
    name: '水二聚体平移动力学',
    modelName: 'TF local VV solver · OpenMM 8.5.1 TIP3P parameter snapshot',
    modelSummary: '本地 TypeScript 求解器采用 OpenMM 8.5.1 TIP3P 参数快照；两个固定取向刚性 H₂O 的质心由 Velocity Verlet 推进，每帧坐标、速度、原子力与能量来自同一状态。没有执行 OpenMM、MatterSim 或 MACE。',
    atoms,
    bonds: observation.bonds.map((bond) => ({ ...bond })),
    pairInteractions: observation.pairInteractions.map(clonePairInteraction),
    forceByAtomIdKjMolAngstrom: cloneVectorRecord(observation.forceByAtomIdKjMolAngstrom),
    energy: {
      coulombKjMol: observation.energy.coulombKjMol,
      lennardJonesKjMol: observation.energy.lennardJonesKjMol,
      totalKjMol: observation.energy.potentialKjMol,
      label: '当前帧的跨分子经典势能',
    },
    stateId: observation.stateId,
    stateDigest: observation.stateDigest,
    parameters: [
      { label: '物理时间', value: `${observation.timePicoseconds.toFixed(6)} ps` },
      { label: '固定时间步', value: `${observation.options.timeStepPicoseconds.toFixed(7)} ps` },
      { label: '积分器', value: 'Velocity Verlet · isolated constant energy' },
      { label: '刚性约束', value: '固定 body-frame 取向；只积分质心平移' },
      { label: '总能量', value: `${observation.energy.totalKjMol.toFixed(8)} kJ/mol` },
      { label: '最大相对能量偏移', value: observation.energy.maximumRelativeExcursion.toExponential(3) },
      { label: 'OLS 相对漂移率', value: `${observation.energy.linearRelativeDriftRatePerPicosecond.toExponential(3)} ps⁻¹` },
    ],
    sources: [
      ...staticScene.sources,
      {
        title: 'Hairer et al. (2003), Geometric numerical integration illustrated by Störmer–Verlet',
        url: 'https://doi.org/10.1017/S0962492902000144',
        role: 'primary-paper',
      },
    ],
    boundaries: [...observation.boundaries],
    metadata: {
      ...staticScene.metadata,
      dynamicsStep: observation.step,
      timePicoseconds: observation.timePicoseconds,
      kineticEnergyKjMol: observation.energy.kineticKjMol,
      totalEnergyKjMol: observation.energy.totalKjMol,
      relativeEnergyDrift: observation.energy.relativeDrift,
      maximumRelativeEnergyExcursion: observation.energy.maximumRelativeExcursion,
      linearRelativeEnergyDriftRatePerPicosecond: observation.energy.linearRelativeDriftRatePerPicosecond,
      maximumUnintegratedTorqueKjMol: Math.max(...observation.bodies.map((body) => magnitude(body.unintegratedTorqueKjMol))),
    },
  };
}

function createLockedTopology(scene: MolecularScene): MolecularTopologyV04 {
  const atoms = scene.atoms.map((atom) => {
    const bodyId = atom.groupId as WaterBodyId;
    const bodyAtoms = scene.atoms.filter((candidate) => candidate.groupId === bodyId);
    const centerOfMass = weightedCenterOfMass(bodyAtoms);
    return {
      id: atom.id,
      bodyId,
      label: atom.label,
      element: atom.element,
      chargeE: atom.chargeE,
      massDalton: requireMass(atom.massDalton, atom.id),
      displayRadiusAngstrom: atom.displayRadiusAngstrom,
      fixedOffsetFromComAngstrom: subtract(atom.positionAngstrom, centerOfMass),
    };
  });
  return {
    atoms,
    bonds: scene.bonds.map((bond) => ({ ...bond })),
  };
}

function createInitialBodies(
  scene: MolecularScene,
  topology: MolecularTopologyV04,
): [RigidBodyStateV04, RigidBodyStateV04] {
  const bodies = (['water-a', 'water-b'] as const).map((id) => {
    const atoms = scene.atoms.filter((atom) => atom.groupId === id);
    if (topology.atoms.filter((atom) => atom.bodyId === id).length !== 3) throw new Error('locked water topology is incomplete');
    return {
      id,
      centerOfMassAngstrom: weightedCenterOfMass(atoms),
      velocityAngstromPerPicosecond: { x: 0, y: 0, z: 0 },
    };
  });
  return bodies as [RigidBodyStateV04, RigidBodyStateV04];
}

function atomsFromBodies(bodies: ReadonlyArray<RigidBodyStateV04>): MolecularAtom[] {
  return LOCKED_TOPOLOGY.atoms.map((topology) => {
    const body = requireBody(bodies, topology.bodyId);
    return {
      id: topology.id,
      label: topology.label,
      element: topology.element,
      groupId: topology.bodyId,
      chargeE: topology.chargeE,
      chargeKind: 'partial',
      massDalton: topology.massDalton,
      positionAngstrom: add(body.centerOfMassAngstrom, topology.fixedOffsetFromComAngstrom),
      displayRadiusAngstrom: topology.displayRadiusAngstrom,
    };
  });
}

function kineticEnergy(bodies: ReadonlyArray<RigidBodyStateV04>) {
  return 0.5 * MASS_VELOCITY_SQUARED_TO_KJ_MOL * bodies.reduce((sum, body) => (
    sum + bodyMassDalton(body.id) * dot(body.velocityAngstromPerPicosecond, body.velocityAngstromPerPicosecond)
  ), 0);
}

function initialEnergyStatistics(initialTotalEnergyKjMol: number): MolecularEnergyStatisticsV04 {
  return {
    sampleCount: 1,
    timeSumPicoseconds: 0,
    energySumKjMol: initialTotalEnergyKjMol,
    timeSquaredSumPicoseconds2: 0,
    timeEnergySumKjMolPicoseconds: 0,
    maximumAbsoluteExcursionKjMol: 0,
  };
}

function energyDriftSlope(statistics: MolecularEnergyStatisticsV04) {
  if (statistics.sampleCount < 2) return 0;
  const denominator = statistics.sampleCount * statistics.timeSquaredSumPicoseconds2
    - statistics.timeSumPicoseconds ** 2;
  if (!(denominator > 0)) return 0;
  return (
    statistics.sampleCount * statistics.timeEnergySumKjMolPicoseconds
    - statistics.timeSumPicoseconds * statistics.energySumKjMol
  ) / denominator;
}

function potentialEnergy(evaluated: EvaluatedWorld) {
  return evaluated.coulombKjMol + evaluated.lennardJonesKjMol;
}

function totalMomentum(bodies: ReadonlyArray<RigidBodyStateV04>): Vector3 {
  return sumVectors(bodies.map((body) => scale(body.velocityAngstromPerPicosecond, bodyMassDalton(body.id))));
}

function systemCenterOfMass(bodies: ReadonlyArray<RigidBodyStateV04>): Vector3 {
  const totalMass = totalBodyMassDalton();
  return scale(sumVectors(bodies.map((body) => scale(body.centerOfMassAngstrom, bodyMassDalton(body.id)))), 1 / totalMass);
}

function weightedCenterOfMass(atoms: ReadonlyArray<MolecularAtom>): Vector3 {
  const mass = atoms.reduce((sum, atom) => sum + requireMass(atom.massDalton, atom.id), 0);
  if (!(mass > 0)) throw new Error('water body mass must be positive');
  return scale(sumVectors(atoms.map((atom) => scale(atom.positionAngstrom, requireMass(atom.massDalton, atom.id)))), 1 / mass);
}

function bodyMassDalton(id: WaterBodyId) {
  return LOCKED_TOPOLOGY.atoms
    .filter((atom) => atom.bodyId === id)
    .reduce((sum, atom) => sum + atom.massDalton, 0);
}

function totalBodyMassDalton() {
  return bodyMassDalton('water-a') + bodyMassDalton('water-b');
}

function physicalDigest(step: number, bodies: ReadonlyArray<RigidBodyStateV04>) {
  return digestValue({
    schemaVersion: 'tf.molecular-physical-state/0.4',
    step,
    options: MOLECULAR_WORLD_OPTIONS,
    topologyDigest: TOPOLOGY_DIGEST,
    bodies,
  });
}

function stateIdFor({
  namespace,
  step,
  revision,
  actionCount,
  branchCount,
  parentStateId,
  physicalDigest: digest,
}: {
  namespace: string;
  step: number;
  revision: number;
  actionCount: number;
  branchCount: number;
  parentStateId: string | null;
  physicalDigest: string;
}) {
  const suffix = shortDigest({ digest, parentStateId, revision, actionCount, branchCount });
  return `${namespace}-s${step.toString(36).padStart(6, '0')}r${revision.toString(36).padStart(4, '0')}-${suffix}`;
}

function createAction({
  namespace,
  ordinal,
  kind,
  parentStateId,
  resultingStateId,
  appliedAtStep,
  parameters,
}: {
  namespace: string;
  ordinal: number;
  kind: MolecularActionV04['kind'];
  parentStateId: string;
  resultingStateId: string;
  appliedAtStep: number;
  parameters: Readonly<Record<string, number>>;
}): MolecularActionV04 {
  const fingerprint = shortDigest({ kind, parentStateId, resultingStateId, appliedAtStep, parameters });
  return {
    schemaVersion: 'tf.molecular-action/0.4',
    actionId: `${namespace}-a${ordinal.toString(36).padStart(5, '0')}-${fingerprint}`,
    kind,
    parentStateId,
    resultingStateId,
    appliedAtStep,
    parameters: { ...parameters },
  };
}

function serializedStateDigest(state: Omit<SerializedMolecularWorldV04, 'stateDigest'>) {
  return digestValue(state);
}

function assertSerializedWorld(state: SerializedMolecularWorldV04) {
  assertExactKeys(state as unknown as Record<string, unknown>, [
    'schemaVersion', 'worldId', 'stateId', 'stateDigest', 'physicalDigest', 'parentStateId',
    'stateNamespace', 'revision', 'actionCount', 'branchCount', 'step', 'options',
    'topologyDigest', 'topology', 'bodies', 'initialTotalEnergyKjMol',
    'initialMomentumDaltonAngstromPerPicosecond', 'initialCenterOfMassAngstrom',
    'energyReferenceKjMol', 'energyStatistics', 'lastAction',
  ], 'molecular world state');
  if (state.schemaVersion !== 'tf.molecular-world-state/0.4' || state.worldId !== WORLD_ID) {
    throw new Error('unsupported molecular world state');
  }
  if (JSON.stringify(state.options) !== JSON.stringify(MOLECULAR_WORLD_OPTIONS)) throw new Error('molecular world options are not locked');
  if (state.topologyDigest !== TOPOLOGY_DIGEST || JSON.stringify(state.topology) !== JSON.stringify(LOCKED_TOPOLOGY)) {
    throw new Error('molecular topology digest mismatch');
  }
  if (!Number.isSafeInteger(state.step) || state.step < 0 || state.step > MOLECULAR_WORLD_OPTIONS.maximumSteps) throw new Error('molecular step is invalid');
  for (const [label, value] of [
    ['revision', state.revision],
    ['actionCount', state.actionCount],
    ['branchCount', state.branchCount],
  ] as const) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${label} is invalid`);
  }
  if (!new RegExp(`^${escapeRegExp(BASE_NAMESPACE)}(?:-b[0-9a-z]+)*$`).test(state.stateNamespace)) {
    throw new Error('molecular state namespace is invalid');
  }
  assertBodies(state.bodies);
  assertEnergyStatistics(state.energyStatistics, state.step, state.options.timeStepPicoseconds);
  assertFiniteTree(state, 'serialized molecular world');
  const expectedPhysicalDigest = physicalDigest(state.step, state.bodies);
  if (state.physicalDigest !== expectedPhysicalDigest) throw new Error('molecular physical digest mismatch');
  const restoredEnergy = potentialEnergy(evaluateRigidWaterBodies(state.bodies)) + kineticEnergy(state.bodies);
  if (state.energyStatistics.maximumAbsoluteExcursionKjMol + 1e-12
      < Math.abs(restoredEnergy - state.initialTotalEnergyKjMol)) {
    throw new Error('molecular energy envelope excludes the restored state');
  }
  const expectedStateId = stateIdFor({
    namespace: state.stateNamespace,
    step: state.step,
    revision: state.revision,
    actionCount: state.actionCount,
    branchCount: state.branchCount,
    parentStateId: state.parentStateId,
    physicalDigest: state.physicalDigest,
  });
  if (state.stateId !== expectedStateId) throw new Error('molecular state identity is inconsistent');
  const { stateDigest, ...withoutDigest } = state;
  if (serializedStateDigest(withoutDigest) !== stateDigest) throw new Error('molecular state digest mismatch');
  const initial = new MolecularDynamicsWorld().serialize();
  for (const key of [
    'initialTotalEnergyKjMol',
    'initialMomentumDaltonAngstromPerPicosecond',
    'initialCenterOfMassAngstrom',
    'energyReferenceKjMol',
  ] as const) {
    if (JSON.stringify(state[key]) !== JSON.stringify(initial[key])) throw new Error(`molecular ${key} reference mismatch`);
  }
  if (state.actionCount === 0) {
    if (state.lastAction !== null || state.parentStateId !== null || state.revision !== 0 || state.step !== 0) {
      throw new Error('initial molecular state lineage is inconsistent');
    }
    if (JSON.stringify(state.bodies) !== JSON.stringify(INITIAL_BODIES)) {
      throw new Error('initial molecular state does not match the locked body state');
    }
    if (JSON.stringify(state.energyStatistics) !== JSON.stringify(initialEnergyStatistics(state.initialTotalEnergyKjMol))) {
      throw new Error('initial molecular energy statistics do not match the locked state');
    }
  } else {
    if (!state.lastAction) throw new Error('molecular action history is missing');
    assertAction(state.lastAction, state);
  }
}

function assertAction(action: MolecularActionV04, state: SerializedMolecularWorldV04) {
  assertExactKeys(action as unknown as Record<string, unknown>, [
    'schemaVersion', 'actionId', 'kind', 'parentStateId', 'resultingStateId', 'appliedAtStep', 'parameters',
  ], 'molecular action');
  if (action.schemaVersion !== 'tf.molecular-action/0.4'
      || !['step', 'branch'].includes(action.kind)
      || action.parentStateId !== state.parentStateId
      || action.resultingStateId !== state.stateId
      || action.appliedAtStep !== state.step) {
    throw new Error('molecular action lineage is inconsistent');
  }
  const parameterKeys = action.kind === 'step' ? ['substeps'] : ['branchOrdinal', 'fromStep'];
  assertExactKeys(action.parameters as Record<string, unknown>, parameterKeys, 'molecular action parameters');
  const parentStep = stepFromStateId(action.parentStateId);
  if (action.kind === 'step') {
    const substeps = action.parameters.substeps;
    if (!Number.isSafeInteger(substeps) || substeps < 1 || substeps > 1_000
        || parentStep + substeps !== state.step) {
      throw new Error('molecular step action does not match its state transition');
    }
  } else {
    const fromStep = action.parameters.fromStep;
    const branchOrdinal = action.parameters.branchOrdinal;
    if (!Number.isSafeInteger(fromStep) || fromStep < 0 || fromStep > MOLECULAR_WORLD_OPTIONS.maximumSteps
        || !Number.isSafeInteger(branchOrdinal) || branchOrdinal < 1
        || fromStep !== state.step || parentStep !== state.step) {
      throw new Error('molecular branch action does not match its state transition');
    }
  }
  const expected = createAction({
    namespace: state.stateNamespace,
    ordinal: state.actionCount,
    kind: action.kind,
    parentStateId: action.parentStateId,
    resultingStateId: action.resultingStateId,
    appliedAtStep: action.appliedAtStep,
    parameters: action.parameters,
  });
  if (JSON.stringify(expected) !== JSON.stringify(action)) throw new Error('molecular action identity is inconsistent');
}

function stepFromStateId(stateId: string) {
  const match = /-s([0-9a-z]{6})r[0-9a-z]{4}-[0-9a-f]{16}$/.exec(stateId);
  if (!match) throw new Error('molecular parent state ID is malformed');
  const step = Number.parseInt(match[1], 36);
  if (!Number.isSafeInteger(step) || step < 0 || step > MOLECULAR_WORLD_OPTIONS.maximumSteps) {
    throw new Error('molecular parent state step is invalid');
  }
  return step;
}

function assertBodies(bodies: ReadonlyArray<RigidBodyStateV04>) {
  if (!Array.isArray(bodies) || bodies.length !== 2 || bodies[0]?.id !== 'water-a' || bodies[1]?.id !== 'water-b') {
    throw new Error('molecular world requires the two locked water bodies in canonical order');
  }
  for (const body of bodies) {
    assertExactKeys(body as unknown as Record<string, unknown>, [
      'id', 'centerOfMassAngstrom', 'velocityAngstromPerPicosecond',
    ], `body ${body.id}`);
    assertVector(body.centerOfMassAngstrom, `${body.id} center`);
    assertVector(body.velocityAngstromPerPicosecond, `${body.id} velocity`);
  }
}

function assertEnergyStatistics(
  statistics: MolecularEnergyStatisticsV04,
  step: number,
  timeStepPicoseconds: number,
) {
  assertExactKeys(statistics as unknown as Record<string, unknown>, [
    'sampleCount', 'timeSumPicoseconds', 'energySumKjMol', 'timeSquaredSumPicoseconds2',
    'timeEnergySumKjMolPicoseconds', 'maximumAbsoluteExcursionKjMol',
  ], 'molecular energy statistics');
  if (statistics.sampleCount !== step + 1 || !Number.isSafeInteger(statistics.sampleCount)) {
    throw new Error('molecular energy sample count does not match the trajectory step');
  }
  if (statistics.maximumAbsoluteExcursionKjMol < 0) throw new Error('molecular energy envelope is invalid');
  const expectedTimeSum = timeStepPicoseconds * step * (step + 1) / 2;
  const expectedTimeSquaredSum = timeStepPicoseconds ** 2 * step * (step + 1) * (2 * step + 1) / 6;
  const tolerance = 1e-11 * Math.max(1, expectedTimeSquaredSum);
  if (Math.abs(statistics.timeSumPicoseconds - expectedTimeSum) > tolerance
      || Math.abs(statistics.timeSquaredSumPicoseconds2 - expectedTimeSquaredSum) > tolerance) {
    throw new Error('molecular energy sampling timeline is inconsistent');
  }
}

function assertFiniteTree(value: unknown, label: string) {
  const visit = (item: unknown, path: string) => {
    if (typeof item === 'number' && !Number.isFinite(item)) throw new Error(`${label} contains non-finite number at ${path}`);
    if (Array.isArray(item)) item.forEach((entry, index) => visit(entry, `${path}[${index}]`));
    else if (item && typeof item === 'object') Object.entries(item).forEach(([key, entry]) => visit(entry, `${path}.${key}`));
  };
  visit(value, '$');
}

function assertExactKeys(value: Record<string, unknown>, expected: ReadonlyArray<string>, label: string) {
  const actual = Object.keys(value).sort();
  const locked = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(locked)) throw new Error(`${label} has unexpected keys`);
}

function assertVector(vector: Vector3, label: string) {
  assertExactKeys(vector as unknown as Record<string, unknown>, ['x', 'y', 'z'], label);
  if (![vector.x, vector.y, vector.z].every(Number.isFinite)) throw new Error(`${label} must be finite`);
}

function geometryResiduals(atoms: ReadonlyArray<MolecularAtomObservationV04>, bonds: ReadonlyArray<MolecularBond>) {
  const atomById = new Map(atoms.map((atom) => [atom.id, atom]));
  const maximumBondResidualAngstrom = Math.max(...bonds.map((bond) => {
    const a = requireObservedAtom(atomById, bond.atomAId);
    const b = requireObservedAtom(atomById, bond.atomBId);
    return Math.abs(magnitude(subtract(a.positionAngstrom, b.positionAngstrom)) - bond.lengthAngstrom);
  }));
  const staticById = new Map(STATIC_WATER_SCENE.atoms.map((atom) => [atom.id, atom]));
  const maximumAngleResidualDegrees = Math.max(...(['water-a', 'water-b'] as const).map((bodyId) => {
    const current = angleDegrees(
      requireObservedAtom(atomById, `${bodyId}-h1`).positionAngstrom,
      requireObservedAtom(atomById, `${bodyId}-o`).positionAngstrom,
      requireObservedAtom(atomById, `${bodyId}-h2`).positionAngstrom,
    );
    const reference = angleDegrees(
      requireStaticAtom(staticById, `${bodyId}-h1`).positionAngstrom,
      requireStaticAtom(staticById, `${bodyId}-o`).positionAngstrom,
      requireStaticAtom(staticById, `${bodyId}-h2`).positionAngstrom,
    );
    return Math.abs(current - reference);
  }));
  return { maximumBondResidualAngstrom, maximumAngleResidualDegrees };
}

function angleDegrees(a: Vector3, vertex: Vector3, b: Vector3) {
  const first = subtract(a, vertex);
  const second = subtract(b, vertex);
  const denominator = magnitude(first) * magnitude(second);
  const cosine = Math.max(-1, Math.min(1, dot(first, second) / denominator));
  return Math.acos(cosine) * 180 / Math.PI;
}

function oxygenDistance(atoms: ReadonlyArray<MolecularAtomObservationV04>) {
  const byId = new Map(atoms.map((atom) => [atom.id, atom]));
  return magnitude(subtract(
    requireObservedAtom(byId, 'water-a-o').positionAngstrom,
    requireObservedAtom(byId, 'water-b-o').positionAngstrom,
  ));
}

function requireObservedAtom(map: ReadonlyMap<string, MolecularAtomObservationV04>, id: string) {
  const atom = map.get(id);
  if (!atom) throw new Error(`missing observed atom ${id}`);
  return atom;
}

function requireStaticAtom(map: ReadonlyMap<string, MolecularAtom>, id: string) {
  const atom = map.get(id);
  if (!atom) throw new Error(`missing static atom ${id}`);
  return atom;
}

function requireTopologyAtom(id: string) {
  const atom = LOCKED_TOPOLOGY.atoms.find((candidate) => candidate.id === id);
  if (!atom) throw new Error(`missing topology atom ${id}`);
  return atom;
}

function requireBody(bodies: ReadonlyArray<RigidBodyStateV04>, id: WaterBodyId) {
  const body = bodies.find((candidate) => candidate.id === id);
  if (!body) throw new Error(`missing rigid body ${id}`);
  return body;
}

function requireMass(value: number | null, atomId: string) {
  if (!(typeof value === 'number' && Number.isFinite(value) && value > 0)) throw new Error(`missing finite mass for ${atomId}`);
  return value;
}

function cloneBodies(bodies: ReadonlyArray<RigidBodyStateV04>): [MutableBody, MutableBody] {
  if (bodies.length !== 2) throw new Error('expected two rigid bodies');
  return bodies.map((body) => ({
    id: body.id,
    centerOfMassAngstrom: { ...body.centerOfMassAngstrom },
    velocityAngstromPerPicosecond: { ...body.velocityAngstromPerPicosecond },
  })) as [MutableBody, MutableBody];
}

function cloneTopology(topology: MolecularTopologyV04): MolecularTopologyV04 {
  return {
    atoms: topology.atoms.map((atom) => ({
      ...atom,
      fixedOffsetFromComAngstrom: { ...atom.fixedOffsetFromComAngstrom },
    })),
    bonds: topology.bonds.map((bond) => ({ ...bond })),
  };
}

function cloneAction(action: MolecularActionV04): MolecularActionV04 {
  return { ...action, parameters: { ...action.parameters } };
}

function clonePairInteraction(interaction: PairInteraction): PairInteraction {
  return { ...interaction, forceOnTargetKjMolAngstrom: { ...interaction.forceOnTargetKjMolAngstrom } };
}

function cloneVectorRecord(record: Readonly<Record<string, Vector3>>) {
  return Object.fromEntries(Object.entries(record).map(([key, vector]) => [key, { ...vector }]));
}

function add(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtract(a: Vector3, b: Vector3): Vector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function scale(vector: Vector3, factor: number): Vector3 {
  return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor };
}

function dot(a: Vector3, b: Vector3) {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function cross(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

function sumVectors(vectors: ReadonlyArray<Vector3>): Vector3 {
  return vectors.reduce<Vector3>((sum, vector) => add(sum, vector), { x: 0, y: 0, z: 0 });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
