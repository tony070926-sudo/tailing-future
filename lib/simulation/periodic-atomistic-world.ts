import type { Vector3 } from '../molecular/molecular-interactions.ts';
import { digestValue, shortDigest } from './digest.ts';
import { DeterministicVerletNeighborList, PeriodicCell, type CellVectors3, type Int3 } from './periodic-cell.ts';
import {
  addTensor,
  canonicalizePeriodicTopology,
  evaluatePeriodicAtomisticForces,
  kineticEnergyKjMol,
  kineticTensorKjMolRelativeToVelocity,
  maximumRuleCutoff,
  scaleTensor,
  totalMomentumDaltonAngstromPerPicosecond,
  traceTensor,
  type NonbondedPairRuleV041,
  type PeriodicAtomStateV041,
  type PeriodicAtomTopologyV041,
  type PeriodicBondV041,
  type PeriodicForceEvaluationV041,
  type PeriodicPairInteractionV041,
  type PeriodicTopologyV041,
  type Tensor3,
} from './periodic-atomistic-kernel.ts';

export const FORCE_TO_ACCELERATION_ANGSTROM_PER_PS2 = 100;
export const MOLAR_GAS_CONSTANT_KJ_MOL_K = 0.008_314_462_618_153_24;

export type InitialPeriodicAtomV041 = PeriodicAtomTopologyV041 & Omit<PeriodicAtomStateV041, 'id'>;

export type PeriodicAtomisticConfigurationV041 = Readonly<{
  schemaVersion: 'tf.periodic-atomistic-configuration/0.4.1';
  worldId: string;
  scenarioId: string;
  modelName: string;
  modelVersion: string;
  cell: Readonly<{
    originAngstrom: Vector3;
    vectorsAngstrom: CellVectors3;
  }>;
  atoms: ReadonlyArray<InitialPeriodicAtomV041>;
  pairRules: ReadonlyArray<NonbondedPairRuleV041>;
  bonds: ReadonlyArray<PeriodicBondV041>;
  excludeBondedNonbonded: boolean;
  options: Readonly<{
    integrator: 'velocity-verlet-kdk/v1';
    ensemble: 'NVE';
    boundary: 'periodic-3d-fixed-cell';
    constraintAlgorithm: 'not-enabled';
    electrostatics: 'none' | 'minimum-image-force-shifted-reference';
    timeStepPicoseconds: number;
    maximumSteps: number;
    neighborSkinAngstrom: number;
    minimumAllowedPairDistanceAngstrom: number;
    maximumRelativeEnergyExcursion: number;
    momentumResidualLimit: number;
    internalForceResidualLimit: number;
    centerOfMassResidualAngstrom: number;
  }>;
  provenance: Readonly<{
    solver: 'tf-periodic-atomistic-vv';
    solverVersion: '0.4.1';
    parameterRole: 'local-classical-reference';
    externalEngineExecuted: false;
    electronicStructureSolved: false;
  }>;
}>;

export type PeriodicEnergyStatisticsV041 = Readonly<{
  sampleCount: number;
  timeSumPicoseconds: number;
  energySumKjMol: number;
  timeSquaredSumPicoseconds2: number;
  timeEnergySumKjMolPicoseconds: number;
  maximumAbsoluteExcursionKjMol: number;
}>;

export type PeriodicAtomisticActionV041 = Readonly<{
  schemaVersion: 'tf.periodic-atomistic-action/0.4.1';
  actionId: string;
  kind: 'step' | 'branch';
  parentStateId: string;
  resultingStateId: string;
  appliedAtStep: number;
  parameters: Readonly<Record<string, number>>;
}>;

export type SerializedPeriodicAtomisticWorldV041 = Readonly<{
  schemaVersion: 'tf.periodic-atomistic-world-state/0.4.1';
  worldId: string;
  stateId: string;
  stateDigest: string;
  physicalDigest: string;
  parentStateId: string | null;
  stateNamespace: string;
  revision: number;
  actionCount: number;
  branchCount: number;
  step: number;
  configurationDigest: string;
  topologyDigest: string;
  configuration: PeriodicAtomisticConfigurationV041;
  atoms: ReadonlyArray<PeriodicAtomStateV041>;
  initialTotalEnergyKjMol: number;
  initialMomentumDaltonAngstromPerPicosecond: Vector3;
  initialUnwrappedCenterOfMassAngstrom: Vector3;
  initialMassDalton: number;
  initialChargeE: number;
  energyReferenceKjMol: number;
  energyStatistics: PeriodicEnergyStatisticsV041;
  faceCrossingEvents: number;
  lastAction: PeriodicAtomisticActionV041 | null;
}>;

export type PeriodicAtomObservationV041 = PeriodicAtomTopologyV041 & PeriodicAtomStateV041 & Readonly<{
  wrappedPositionAngstrom: Vector3;
  unwrappedPositionAngstrom: Vector3;
  forceKjMolAngstrom: Vector3;
  localVirialKjMol: Tensor3;
}>;

export type PeriodicAtomisticObservationV041 = Readonly<{
  schemaVersion: 'tf.periodic-atomistic-observation/0.4.1';
  worldId: string;
  scenarioId: string;
  stateId: string;
  stateDigest: string;
  physicalDigest: string;
  parentStateId: string | null;
  step: number;
  timePicoseconds: number;
  configurationDigest: string;
  topologyDigest: string;
  atoms: ReadonlyArray<PeriodicAtomObservationV041>;
  bonds: ReadonlyArray<PeriodicBondV041>;
  pairInteractions: ReadonlyArray<PeriodicPairInteractionV041>;
  forceByAtomIdKjMolAngstrom: Readonly<Record<string, Vector3>>;
  energy: Readonly<{
    potentialKjMol: number;
    kineticKjMol: number;
    totalKjMol: number;
    initialTotalKjMol: number;
    absoluteExcursionKjMol: number;
    maximumAbsoluteExcursionKjMol: number;
    maximumRelativeExcursion: number;
    linearDriftSlopeKjMolPerPicosecond: number;
    linearRelativeDriftRatePerPicosecond: number;
    sampleCount: number;
  }>;
  cell: Readonly<{
    originAngstrom: Vector3;
    vectorsAngstrom: CellVectors3;
    volumeAngstrom3: number;
    shortestLatticeVectorAngstrom: number;
    periodicAxes: readonly [true, true, true];
  }>;
  thermodynamics: Readonly<{
    ensemble: 'NVE';
    temperatureKelvin: number;
    pressureKjMolAngstrom3: number;
    pressureSignConvention: 'positive-compression';
    degreesOfFreedom: number;
    kineticFrame: 'center-of-mass';
    status: 'instantaneous-fixed-cell-estimator';
  }>;
  stressKjMolAngstrom3: Tensor3;
  stressSignConvention: 'positive-tension';
  conservation: Readonly<{
    totalMassDalton: number;
    massResidualDalton: number;
    totalChargeE: number;
    chargeResidualE: number;
    totalMomentumDaltonAngstromPerPicosecond: Vector3;
    momentumResidual: number;
    unwrappedCenterOfMassAngstrom: Vector3;
    centerOfMassResidualAngstrom: number;
    internalForceResidualKjMolAngstrom: number;
  }>;
  neighborList: Readonly<{
    kind: 'deterministic-verlet-half-list-o-n2-reference-build';
    cutoffAngstrom: number;
    skinAngstrom: number;
    activePairCount: number;
    rebuildPolicy: 'maximum-unwrapped-displacement-at-skin-half';
    cacheExcludedFromPhysicalDigest: true;
  }>;
  events: Readonly<{
    faceCrossingCount: number;
  }>;
  numericalValidity: Readonly<{
    status: 'pass';
    minimumPairDistanceAngstrom: number | null;
    minimumAllowedPairDistanceAngstrom: number;
    maximumRelativeEnergyExcursionLimit: number;
    momentumResidualLimit: number;
    internalForceResidualLimit: number;
    centerOfMassResidualLimitAngstrom: number;
  }>;
  provenance: PeriodicAtomisticConfigurationV041['provenance'] & Readonly<{
    modelName: string;
    modelVersion: string;
    forceModelRole: 'solver';
    fidelity: 'local-fixed-cell-short-range-periodic-nve';
    uncertaintyStatus: 'not-quantified';
  }>;
  boundaries: ReadonlyArray<string>;
}>;

type MutablePeriodicAtom = {
  id: string;
  wrappedFractional: Vector3;
  image: Int3;
  velocityAngstromPerPicosecond: Vector3;
};

type MutableWorldBackup = {
  atoms: MutablePeriodicAtom[];
  step: number;
  stateId: string;
  stateDigest: string;
  physicalDigest: string;
  parentStateId: string | null;
  stateNamespace: string;
  revision: number;
  actionCount: number;
  branchCount: number;
  energyStatistics: PeriodicEnergyStatisticsV041;
  faceCrossingEvents: number;
  lastAction: PeriodicAtomisticActionV041 | null;
};

const STABLE_TOKEN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,127}$/;
const WORLD_BOUNDARIES = Object.freeze([
  '本地固定晶胞三维周期 NVE 校准内核；不含 thermostat、barostat、外力或隐藏的质心速度清除。',
  '非键项采用显式 force-shift 截断；minimum-image Coulomb 仅是短程参考接口，不是 Ewald、PME 或生产级周期静电。',
  'SHAKE/RATTLE 尚未启用；当前校准体系没有刚性约束，不得声称为周期水模型。',
  '没有执行 OpenMM、LAMMPS、MatterSim 或 MACE；没有电子密度、反应、断键、溶解或结晶。',
  '瞬时 pressure/stress 来自 kinetic tensor 与 pair virial；per-atom virial 只是等分配局部 proxy，不是唯一的原子 Cauchy 应力。',
  '当前确定性证据限定在锁定 Node 运行时内；跨操作系统与 CPU 架构的 bit-exact 黄金摘要矩阵尚未建立。',
  'SHA-256 摘要用于完整性与可重放语义校验，不是来源真实性签名；签名的 append-only action log 尚未实现。',
]);

export class PeriodicAtomisticWorld {
  readonly configuration: PeriodicAtomisticConfigurationV041;
  readonly configurationDigest: string;
  readonly topologyDigest: string;
  readonly topology: PeriodicTopologyV041;
  readonly cell: PeriodicCell;
  private neighborList: DeterministicVerletNeighborList;
  private atoms: MutablePeriodicAtom[];
  private _step = 0;
  private _stateId = '';
  private _stateDigest = '';
  private _physicalDigest = '';
  private _parentStateId: string | null = null;
  private _stateNamespace: string;
  private _revision = 0;
  private _actionCount = 0;
  private _branchCount = 0;
  private _lastAction: PeriodicAtomisticActionV041 | null = null;
  private initialTotalEnergyKjMol: number;
  private initialMomentumDaltonAngstromPerPicosecond: Vector3;
  private initialUnwrappedCenterOfMassAngstrom: Vector3;
  private initialMassDalton: number;
  private initialChargeE: number;
  private energyReferenceKjMol: number;
  private energyStatistics: PeriodicEnergyStatisticsV041;
  private faceCrossingEvents = 0;

  constructor(configuration: PeriodicAtomisticConfigurationV041) {
    this.configuration = deepFreeze(canonicalizeConfiguration(configuration));
    this.cell = new PeriodicCell(this.configuration.cell.vectorsAngstrom, this.configuration.cell.originAngstrom);
    this.topology = canonicalizePeriodicTopology({
      atoms: this.configuration.atoms.map(topologyFromInitialAtom),
      pairRules: this.configuration.pairRules,
      bonds: this.configuration.bonds,
      excludeBondedNonbonded: this.configuration.excludeBondedNonbonded,
    });
    this.configurationDigest = digestValue(this.configuration);
    this.topologyDigest = digestValue({
      cell: this.configuration.cell,
      topology: this.topology,
      options: this.configuration.options,
      modelName: this.configuration.modelName,
      modelVersion: this.configuration.modelVersion,
    });
    this._stateNamespace = `tfpaw-${shortDigest({ worldId: this.configuration.worldId, configurationDigest: this.configurationDigest })}`;
    this.atoms = this.configuration.atoms.map(stateFromInitialAtom);
    this.neighborList = this.createNeighborList();
    const initialEvaluation = this.evaluateForces();
    this.initialTotalEnergyKjMol = initialEvaluation.potentialEnergyKjMol + kineticEnergyKjMol(this.topology, this.atoms);
    this.initialMomentumDaltonAngstromPerPicosecond = totalMomentumDaltonAngstromPerPicosecond(this.topology, this.atoms);
    this.initialMassDalton = this.topology.atoms.reduce((sum, atom) => sum + atom.massDalton, 0);
    this.initialChargeE = this.topology.atoms.reduce((sum, atom) => sum + atom.chargeE, 0);
    this.initialUnwrappedCenterOfMassAngstrom = this.unwrappedCenterOfMass();
    this.energyReferenceKjMol = Math.max(Math.abs(this.initialTotalEnergyKjMol), 1);
    this.energyStatistics = initialEnergyStatistics(this.initialTotalEnergyKjMol);
    this.refreshIdentity();
    this.assertObservation(this.observe());
  }

  get stepCount() { return this._step; }

  advance(substeps = 1): PeriodicAtomisticObservationV041 {
    if (!Number.isSafeInteger(substeps) || substeps < 1 || substeps > 1_000) {
      throw new Error('periodic atomistic substeps must be an integer in [1, 1000]');
    }
    if (this._step + substeps > this.configuration.options.maximumSteps) {
      throw new Error('maximum periodic atomistic trajectory length exceeded');
    }
    const backup = this.captureMutableState();
    const parentStateId = this._stateId;
    const fromStep = this._step;
    try {
      for (let index = 0; index < substeps; index += 1) {
        const evaluated = this.integrateOneStep();
        this._step += 1;
        this.recordEnergySample(evaluated);
        this.assertObservation(this.observe());
      }
      this._parentStateId = parentStateId;
      this._revision += 1;
      this._actionCount += 1;
      this._physicalDigest = this.computePhysicalDigest();
      this._stateId = this.computeStateId();
      this._lastAction = this.createAction('step', parentStateId, {
        substeps,
        fromStep,
        toStep: this._step,
      });
      this._stateDigest = this.computeStateDigest();
      const observation = this.observe();
      this.assertObservation(observation);
      return observation;
    } catch (error) {
      this.restoreMutableState(backup);
      throw error;
    }
  }

  observe(): PeriodicAtomisticObservationV041 {
    const evaluated = this.evaluateForces();
    const kineticKjMol = kineticEnergyKjMol(this.topology, this.atoms);
    const totalKjMol = evaluated.potentialEnergyKjMol + kineticKjMol;
    const absoluteExcursionKjMol = Math.abs(totalKjMol - this.initialTotalEnergyKjMol);
    const slope = energyDriftSlope(this.energyStatistics);
    const momentum = totalMomentumDaltonAngstromPerPicosecond(this.topology, this.atoms);
    const centerOfMassVelocity = scale(momentum, 1 / this.initialMassDalton);
    const thermalKineticTensor = kineticTensorKjMolRelativeToVelocity(this.topology, this.atoms, centerOfMassVelocity);
    const thermalKineticEnergy = 0.5 * traceTensor(thermalKineticTensor);
    const mechanicalTensor = addTensor(thermalKineticTensor, evaluated.virialKjMol);
    const stress = scaleTensor(mechanicalTensor, -1 / this.cell.volumeAngstrom3);
    const pressure = -traceTensor(stress) / 3;
    const centerOfMass = this.unwrappedCenterOfMass();
    const expectedCenterOfMass = add(
      this.initialUnwrappedCenterOfMassAngstrom,
      scale(this.initialMomentumDaltonAngstromPerPicosecond, this.timePicoseconds / this.initialMassDalton),
    );
    const topologyById = new Map(this.topology.atoms.map((atom) => [atom.id, atom]));
    const atoms = this.atoms.map((state) => {
      const topology = requireMap(topologyById, state.id, 'periodic topology atom');
      return {
        ...topology,
        id: state.id,
        wrappedFractional: { ...state.wrappedFractional },
        image: { ...state.image },
        velocityAngstromPerPicosecond: { ...state.velocityAngstromPerPicosecond },
        wrappedPositionAngstrom: this.cell.wrappedCartesian(state),
        unwrappedPositionAngstrom: this.cell.unwrappedCartesian(state),
        forceKjMolAngstrom: { ...evaluated.forceByAtomIdKjMolAngstrom[state.id] },
        localVirialKjMol: { ...evaluated.perAtomVirialKjMol[state.id] },
      };
    });
    const totalMass = this.topology.atoms.reduce((sum, atom) => sum + atom.massDalton, 0);
    const totalCharge = this.topology.atoms.reduce((sum, atom) => sum + atom.chargeE, 0);
    const activeNonbondedPairs = evaluated.pairInteractions.filter((pair) => pair.role === 'nonbonded').length;

    return {
      schemaVersion: 'tf.periodic-atomistic-observation/0.4.1',
      worldId: this.configuration.worldId,
      scenarioId: this.configuration.scenarioId,
      stateId: this._stateId,
      stateDigest: this._stateDigest,
      physicalDigest: this._physicalDigest,
      parentStateId: this._parentStateId,
      step: this._step,
      timePicoseconds: this.timePicoseconds,
      configurationDigest: this.configurationDigest,
      topologyDigest: this.topologyDigest,
      atoms,
      bonds: this.topology.bonds.map(cloneBond),
      pairInteractions: evaluated.pairInteractions.map(clonePairInteraction),
      forceByAtomIdKjMolAngstrom: cloneVectorRecord(evaluated.forceByAtomIdKjMolAngstrom),
      energy: {
        potentialKjMol: evaluated.potentialEnergyKjMol,
        kineticKjMol,
        totalKjMol,
        initialTotalKjMol: this.initialTotalEnergyKjMol,
        absoluteExcursionKjMol,
        maximumAbsoluteExcursionKjMol: this.energyStatistics.maximumAbsoluteExcursionKjMol,
        maximumRelativeExcursion: this.energyStatistics.maximumAbsoluteExcursionKjMol / this.energyReferenceKjMol,
        linearDriftSlopeKjMolPerPicosecond: slope,
        linearRelativeDriftRatePerPicosecond: slope / this.energyReferenceKjMol,
        sampleCount: this.energyStatistics.sampleCount,
      },
      cell: {
        originAngstrom: { ...this.cell.originAngstrom },
        vectorsAngstrom: this.cell.vectorsAngstrom.map((vector) => ({ ...vector })) as unknown as CellVectors3,
        volumeAngstrom3: this.cell.volumeAngstrom3,
        shortestLatticeVectorAngstrom: this.cell.shortestLatticeVectorAngstrom,
        periodicAxes: [true, true, true],
      },
      thermodynamics: {
        ensemble: 'NVE',
        temperatureKelvin: 2 * thermalKineticEnergy / ((3 * this.atoms.length - 3) * MOLAR_GAS_CONSTANT_KJ_MOL_K),
        pressureKjMolAngstrom3: pressure,
        pressureSignConvention: 'positive-compression',
        degreesOfFreedom: 3 * this.atoms.length - 3,
        kineticFrame: 'center-of-mass',
        status: 'instantaneous-fixed-cell-estimator',
      },
      stressKjMolAngstrom3: stress,
      stressSignConvention: 'positive-tension',
      conservation: {
        totalMassDalton: totalMass,
        massResidualDalton: Math.abs(totalMass - this.initialMassDalton),
        totalChargeE: totalCharge,
        chargeResidualE: Math.abs(totalCharge - this.initialChargeE),
        totalMomentumDaltonAngstromPerPicosecond: momentum,
        momentumResidual: magnitude(subtract(momentum, this.initialMomentumDaltonAngstromPerPicosecond)),
        unwrappedCenterOfMassAngstrom: centerOfMass,
        centerOfMassResidualAngstrom: magnitude(subtract(centerOfMass, expectedCenterOfMass)),
        internalForceResidualKjMolAngstrom: evaluated.internalForceResidualKjMolAngstrom,
      },
      neighborList: {
        kind: 'deterministic-verlet-half-list-o-n2-reference-build',
        cutoffAngstrom: maximumRuleCutoff(this.topology),
        skinAngstrom: this.configuration.options.neighborSkinAngstrom,
        activePairCount: activeNonbondedPairs,
        rebuildPolicy: 'maximum-unwrapped-displacement-at-skin-half',
        cacheExcludedFromPhysicalDigest: true,
      },
      events: { faceCrossingCount: this.faceCrossingEvents },
      numericalValidity: {
        status: 'pass',
        minimumPairDistanceAngstrom: evaluated.minimumPairDistanceAngstrom,
        minimumAllowedPairDistanceAngstrom: this.configuration.options.minimumAllowedPairDistanceAngstrom,
        maximumRelativeEnergyExcursionLimit: this.configuration.options.maximumRelativeEnergyExcursion,
        momentumResidualLimit: this.configuration.options.momentumResidualLimit,
        internalForceResidualLimit: this.configuration.options.internalForceResidualLimit,
        centerOfMassResidualLimitAngstrom: this.configuration.options.centerOfMassResidualAngstrom,
      },
      provenance: {
        ...this.configuration.provenance,
        modelName: this.configuration.modelName,
        modelVersion: this.configuration.modelVersion,
        forceModelRole: 'solver',
        fidelity: 'local-fixed-cell-short-range-periodic-nve',
        uncertaintyStatus: 'not-quantified',
      },
      boundaries: [...WORLD_BOUNDARIES],
    };
  }

  serialize(): SerializedPeriodicAtomisticWorldV041 {
    return { ...this.serializedStateWithoutDigest(), stateDigest: this._stateDigest };
  }

  clone(branchOrdinal: number): PeriodicAtomisticWorld {
    if (!Number.isSafeInteger(branchOrdinal) || branchOrdinal < 1) throw new Error('branch ordinal must be a positive safe integer');
    const clone = PeriodicAtomisticWorld.fromSerialized(this.serialize());
    const parentStateId = this._stateId;
    clone._stateNamespace = `tfpaw-${shortDigest({ parentNamespace: this._stateNamespace, branchOrdinal })}`;
    clone._parentStateId = parentStateId;
    clone._revision += 1;
    clone._actionCount += 1;
    clone._branchCount += 1;
    clone._physicalDigest = clone.computePhysicalDigest();
    clone._stateId = clone.computeStateId();
    clone._lastAction = clone.createAction('branch', parentStateId, { fromStep: clone._step, branchOrdinal });
    clone._stateDigest = clone.computeStateDigest();
    clone.assertObservation(clone.observe());
    return clone;
  }

  static fromSerialized(state: SerializedPeriodicAtomisticWorldV041): PeriodicAtomisticWorld {
    assertSerializedWorld(state);
    const world = new PeriodicAtomisticWorld(state.configuration);
    if (digestValue({
      initialTotalEnergyKjMol: world.initialTotalEnergyKjMol,
      initialMomentumDaltonAngstromPerPicosecond: world.initialMomentumDaltonAngstromPerPicosecond,
      initialUnwrappedCenterOfMassAngstrom: world.initialUnwrappedCenterOfMassAngstrom,
      initialMassDalton: world.initialMassDalton,
      initialChargeE: world.initialChargeE,
      energyReferenceKjMol: world.energyReferenceKjMol,
    }) !== digestValue({
      initialTotalEnergyKjMol: state.initialTotalEnergyKjMol,
      initialMomentumDaltonAngstromPerPicosecond: state.initialMomentumDaltonAngstromPerPicosecond,
      initialUnwrappedCenterOfMassAngstrom: state.initialUnwrappedCenterOfMassAngstrom,
      initialMassDalton: state.initialMassDalton,
      initialChargeE: state.initialChargeE,
      energyReferenceKjMol: state.energyReferenceKjMol,
    })) {
      throw new Error('periodic atomistic initial reference metadata is inconsistent with configuration');
    }
    while (world._step < state.step) world.advance(Math.min(1_000, state.step - world._step));
    if (digestValue({
      atoms: world.atoms.map(cloneState),
      energyStatistics: world.energyStatistics,
      faceCrossingEvents: world.faceCrossingEvents,
    }) !== digestValue({
      atoms: state.atoms.map(cloneState),
      energyStatistics: state.energyStatistics,
      faceCrossingEvents: state.faceCrossingEvents,
    })) {
      throw new Error('periodic atomistic serialized trajectory payload does not match deterministic replay');
    }
    world.atoms = state.atoms.map(cloneState);
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
    world.initialUnwrappedCenterOfMassAngstrom = { ...state.initialUnwrappedCenterOfMassAngstrom };
    world.initialMassDalton = state.initialMassDalton;
    world.initialChargeE = state.initialChargeE;
    world.energyReferenceKjMol = state.energyReferenceKjMol;
    world.energyStatistics = { ...state.energyStatistics };
    world.faceCrossingEvents = state.faceCrossingEvents;
    world.neighborList = world.createNeighborList();
    world.evaluateForces();
    world.assertObservation(world.observe());
    return world;
  }

  private get timePicoseconds() { return this._step * this.configuration.options.timeStepPicoseconds; }

  neighborCacheDiagnostics() {
    return {
      buildCount: this.neighborList.buildCount,
      role: 'ephemeral-cache-diagnostic' as const,
      serialized: false as const,
      includedInPhysicalDigest: false as const,
    };
  }

  private createNeighborList() {
    return new DeterministicVerletNeighborList(
      this.cell,
      maximumRuleCutoff(this.topology),
      this.configuration.options.neighborSkinAngstrom,
    );
  }

  private evaluateForces() {
    return evaluatePeriodicAtomisticForces(this.cell, this.topology, this.atoms, this.neighborList);
  }

  private integrateOneStep() {
    const dt = this.configuration.options.timeStepPicoseconds;
    const topologyById = new Map(this.topology.atoms.map((atom) => [atom.id, atom]));
    const current = this.evaluateForces();
    this.atoms = this.atoms.map((state) => {
      const mass = requireMap(topologyById, state.id, 'integrator topology atom').massDalton;
      const acceleration = scale(current.forceByAtomIdKjMolAngstrom[state.id], FORCE_TO_ACCELERATION_ANGSTROM_PER_PS2 / mass);
      return { ...state, velocityAngstromPerPicosecond: add(state.velocityAngstromPerPicosecond, scale(acceleration, dt / 2)) };
    });
    this.atoms = this.atoms.map((state) => {
      const fractionalDrift = this.cell.cartesianVectorToFractional(scale(state.velocityAngstromPerPicosecond, dt));
      const localWrap = this.cell.wrapFractional(add(state.wrappedFractional, fractionalDrift));
      const image = addImages(state.image, localWrap.image);
      this.faceCrossingEvents += imageCrossings(state.image, image);
      return { ...state, wrappedFractional: localWrap.wrappedFractional, image };
    });
    const next = this.evaluateForces();
    this.atoms = this.atoms.map((state) => {
      const mass = requireMap(topologyById, state.id, 'integrator topology atom').massDalton;
      const acceleration = scale(next.forceByAtomIdKjMolAngstrom[state.id], FORCE_TO_ACCELERATION_ANGSTROM_PER_PS2 / mass);
      return { ...state, velocityAngstromPerPicosecond: add(state.velocityAngstromPerPicosecond, scale(acceleration, dt / 2)) };
    });
    return next;
  }

  private recordEnergySample(evaluated: PeriodicForceEvaluationV041) {
    const total = evaluated.potentialEnergyKjMol + kineticEnergyKjMol(this.topology, this.atoms);
    const time = this.timePicoseconds;
    this.energyStatistics = {
      sampleCount: this.energyStatistics.sampleCount + 1,
      timeSumPicoseconds: this.energyStatistics.timeSumPicoseconds + time,
      energySumKjMol: this.energyStatistics.energySumKjMol + total,
      timeSquaredSumPicoseconds2: this.energyStatistics.timeSquaredSumPicoseconds2 + time ** 2,
      timeEnergySumKjMolPicoseconds: this.energyStatistics.timeEnergySumKjMolPicoseconds + time * total,
      maximumAbsoluteExcursionKjMol: Math.max(
        this.energyStatistics.maximumAbsoluteExcursionKjMol,
        Math.abs(total - this.initialTotalEnergyKjMol),
      ),
    };
  }

  private unwrappedCenterOfMass() {
    const topologyById = new Map(this.topology.atoms.map((atom) => [atom.id, atom]));
    const weighted = this.atoms.reduce((sum, state) => {
      const mass = requireMap(topologyById, state.id, 'center-of-mass topology atom').massDalton;
      return add(sum, scale(this.cell.unwrappedCartesian(state), mass));
    }, { x: 0, y: 0, z: 0 });
    return scale(weighted, 1 / this.topology.atoms.reduce((sum, atom) => sum + atom.massDalton, 0));
  }

  private assertObservation(observation: PeriodicAtomisticObservationV041) {
    const limits = this.configuration.options;
    if (!allFinite(observation)) throw new Error('periodic atomistic observation contains a non-finite number');
    const currentRelativeExcursion = observation.energy.absoluteExcursionKjMol / this.energyReferenceKjMol;
    if (observation.energy.maximumRelativeExcursion > limits.maximumRelativeEnergyExcursion
      || currentRelativeExcursion > limits.maximumRelativeEnergyExcursion) {
      throw new Error('periodic atomistic NVE maximum energy excursion exceeded the locked limit');
    }
    const excursionTolerance = Math.max(1, observation.energy.absoluteExcursionKjMol) * Number.EPSILON * 128;
    if (observation.energy.maximumAbsoluteExcursionKjMol + excursionTolerance < observation.energy.absoluteExcursionKjMol) {
      throw new Error('periodic atomistic energy statistics do not cover the current state');
    }
    if (observation.conservation.momentumResidual > limits.momentumResidualLimit) {
      throw new Error('periodic atomistic momentum residual exceeded the locked limit');
    }
    if (observation.conservation.internalForceResidualKjMolAngstrom > limits.internalForceResidualLimit) {
      throw new Error('periodic atomistic internal-force residual exceeded the locked limit');
    }
    if (observation.conservation.centerOfMassResidualAngstrom > limits.centerOfMassResidualAngstrom) {
      throw new Error('periodic atomistic center-of-mass residual exceeded the locked limit');
    }
    if (
      observation.numericalValidity.minimumPairDistanceAngstrom !== null
      && observation.numericalValidity.minimumPairDistanceAngstrom < limits.minimumAllowedPairDistanceAngstrom
    ) {
      throw new Error('periodic atomistic pair distance crossed the locked validity floor');
    }
    if (observation.conservation.massResidualDalton !== 0 || observation.conservation.chargeResidualE !== 0) {
      throw new Error('periodic atomistic mass or charge closure failed');
    }
  }

  private refreshIdentity() {
    this._physicalDigest = this.computePhysicalDigest();
    this._stateId = this.computeStateId();
    this._stateDigest = this.computeStateDigest();
  }

  private computePhysicalDigest() {
    return digestValue({
      schemaVersion: 'tf.periodic-atomistic-physical/0.4.1',
      worldId: this.configuration.worldId,
      topologyDigest: this.topologyDigest,
      step: this._step,
      atoms: physicalDigestAtoms(this.atoms),
    });
  }

  private computeStateId() {
    return `${this._stateNamespace}-s${this._step.toString(36)}-r${this._revision.toString(36)}-${shortDigest({
      parentStateId: this._parentStateId,
      actionCount: this._actionCount,
      branchCount: this._branchCount,
      physicalDigest: this._physicalDigest,
    })}`;
  }

  private createAction(kind: PeriodicAtomisticActionV041['kind'], parentStateId: string, parameters: Readonly<Record<string, number>>) {
    const action = {
      schemaVersion: 'tf.periodic-atomistic-action/0.4.1' as const,
      actionId: '',
      kind,
      parentStateId,
      resultingStateId: this._stateId,
      appliedAtStep: this._step,
      parameters: { ...parameters },
    };
    return { ...action, actionId: digestValue({ ...action, actionId: undefined }) };
  }

  private serializedStateWithoutDigest(): Omit<SerializedPeriodicAtomisticWorldV041, 'stateDigest'> {
    return {
      schemaVersion: 'tf.periodic-atomistic-world-state/0.4.1',
      worldId: this.configuration.worldId,
      stateId: this._stateId,
      physicalDigest: this._physicalDigest,
      parentStateId: this._parentStateId,
      stateNamespace: this._stateNamespace,
      revision: this._revision,
      actionCount: this._actionCount,
      branchCount: this._branchCount,
      step: this._step,
      configurationDigest: this.configurationDigest,
      topologyDigest: this.topologyDigest,
      configuration: cloneConfiguration(this.configuration),
      atoms: this.atoms.map(cloneState),
      initialTotalEnergyKjMol: this.initialTotalEnergyKjMol,
      initialMomentumDaltonAngstromPerPicosecond: { ...this.initialMomentumDaltonAngstromPerPicosecond },
      initialUnwrappedCenterOfMassAngstrom: { ...this.initialUnwrappedCenterOfMassAngstrom },
      initialMassDalton: this.initialMassDalton,
      initialChargeE: this.initialChargeE,
      energyReferenceKjMol: this.energyReferenceKjMol,
      energyStatistics: { ...this.energyStatistics },
      faceCrossingEvents: this.faceCrossingEvents,
      lastAction: this._lastAction ? cloneAction(this._lastAction) : null,
    };
  }

  private computeStateDigest() {
    return digestValue(this.serializedStateWithoutDigest());
  }

  private captureMutableState(): MutableWorldBackup {
    return {
      atoms: this.atoms.map(cloneState),
      step: this._step,
      stateId: this._stateId,
      stateDigest: this._stateDigest,
      physicalDigest: this._physicalDigest,
      parentStateId: this._parentStateId,
      stateNamespace: this._stateNamespace,
      revision: this._revision,
      actionCount: this._actionCount,
      branchCount: this._branchCount,
      energyStatistics: { ...this.energyStatistics },
      faceCrossingEvents: this.faceCrossingEvents,
      lastAction: this._lastAction ? cloneAction(this._lastAction) : null,
    };
  }

  private restoreMutableState(backup: MutableWorldBackup) {
    this.atoms = backup.atoms.map(cloneState);
    this._step = backup.step;
    this._stateId = backup.stateId;
    this._stateDigest = backup.stateDigest;
    this._physicalDigest = backup.physicalDigest;
    this._parentStateId = backup.parentStateId;
    this._stateNamespace = backup.stateNamespace;
    this._revision = backup.revision;
    this._actionCount = backup.actionCount;
    this._branchCount = backup.branchCount;
    this.energyStatistics = { ...backup.energyStatistics };
    this.faceCrossingEvents = backup.faceCrossingEvents;
    this._lastAction = backup.lastAction ? cloneAction(backup.lastAction) : null;
    this.neighborList = this.createNeighborList();
    this.evaluateForces();
  }
}

export function createPeriodicArgonCalibrationConfiguration(): PeriodicAtomisticConfigurationV041 {
  const cellsPerAxis = 2;
  const conventionalCellAngstrom = 5.26;
  const boxLength = cellsPerAxis * conventionalCellAngstrom;
  const basis = [
    { x: 0, y: 0, z: 0 },
    { x: 0, y: 0.5, z: 0.5 },
    { x: 0.5, y: 0, z: 0.5 },
    { x: 0.5, y: 0.5, z: 0 },
  ];
  const positions: Vector3[] = [];
  for (let x = 0; x < cellsPerAxis; x += 1) {
    for (let y = 0; y < cellsPerAxis; y += 1) {
      for (let z = 0; z < cellsPerAxis; z += 1) {
        for (const offset of basis) {
          positions.push({
            x: (x + offset.x) / cellsPerAxis,
            y: (y + offset.y) / cellsPerAxis,
            z: (z + offset.z) / cellsPerAxis,
          });
        }
      }
    }
  }
  const perturbations = positions.map((_, index) => ({
    x: 0.035 * Math.sin(index * 1.7 + 0.2),
    y: 0.035 * Math.cos(index * 1.3 + 0.7),
    z: 0.035 * Math.sin(index * 0.9 + 1.1),
  }));
  const meanPerturbation = scale(perturbations.reduce(add, { x: 0, y: 0, z: 0 }), 1 / perturbations.length);
  const atoms = positions.map((position, index) => ({
    id: `Ar-${index.toString().padStart(2, '0')}`,
    label: `Ar ${index + 1}`,
    element: 'Ar',
    atomType: 'Ar',
    massDalton: 39.948,
    chargeE: 0,
    wrappedFractional: position,
    image: { x: 0, y: 0, z: 0 },
    velocityAngstromPerPicosecond: add({ x: 1.15, y: 0, z: 0 }, subtract(perturbations[index], meanPerturbation)),
  }));

  return {
    schemaVersion: 'tf.periodic-atomistic-configuration/0.4.1',
    worldId: 'tf.world/periodic-fcc-argon-short-range-nve/v1',
    scenarioId: 'periodic-fcc-argon-calibration/v1',
    modelName: 'tf-local-force-shifted-lj-argon-calibration',
    modelVersion: '0.4.1',
    cell: {
      originAngstrom: { x: -boxLength / 2, y: -boxLength / 2, z: -boxLength / 2 },
      vectorsAngstrom: [
        { x: boxLength, y: 0, z: 0 },
        { x: 0, y: boxLength, z: 0 },
        { x: 0, y: 0, z: boxLength },
      ],
    },
    atoms,
    pairRules: [{
      id: 'Ar-Ar-force-shifted',
      atomTypes: ['Ar', 'Ar'],
      cutoffAngstrom: 4.5,
      terms: [{ kind: 'lennard-jones-12-6', epsilonKjMol: 0.997, sigmaAngstrom: 3.405 }],
    }],
    bonds: [],
    excludeBondedNonbonded: true,
    options: {
      integrator: 'velocity-verlet-kdk/v1',
      ensemble: 'NVE',
      boundary: 'periodic-3d-fixed-cell',
      constraintAlgorithm: 'not-enabled',
      electrostatics: 'none',
      timeStepPicoseconds: 0.001,
      maximumSteps: 10_000,
      neighborSkinAngstrom: 0.35,
      minimumAllowedPairDistanceAngstrom: 2.6,
      maximumRelativeEnergyExcursion: 5e-4,
      momentumResidualLimit: 1e-8,
      internalForceResidualLimit: 1e-9,
      centerOfMassResidualAngstrom: 1e-9,
    },
    provenance: {
      solver: 'tf-periodic-atomistic-vv',
      solverVersion: '0.4.1',
      parameterRole: 'local-classical-reference',
      externalEngineExecuted: false,
      electronicStructureSolved: false,
    },
  };
}

export function createPeriodicArgonCalibrationWorld() {
  return new PeriodicAtomisticWorld(createPeriodicArgonCalibrationConfiguration());
}

function canonicalizeConfiguration(configuration: PeriodicAtomisticConfigurationV041): PeriodicAtomisticConfigurationV041 {
  if (!configuration || configuration.schemaVersion !== 'tf.periodic-atomistic-configuration/0.4.1') {
    throw new Error('unsupported periodic atomistic configuration schema');
  }
  for (const [label, value] of [
    ['worldId', configuration.worldId],
    ['scenarioId', configuration.scenarioId],
    ['modelName', configuration.modelName],
    ['modelVersion', configuration.modelVersion],
  ] as const) {
    if (!STABLE_TOKEN.test(value)) throw new Error(`${label} must be an ASCII stable token`);
  }
  const cell = new PeriodicCell(configuration.cell.vectorsAngstrom, configuration.cell.originAngstrom);
  const topology = canonicalizePeriodicTopology({
    atoms: configuration.atoms.map(topologyFromInitialAtom),
    pairRules: configuration.pairRules,
    bonds: configuration.bonds,
    excludeBondedNonbonded: configuration.excludeBondedNonbonded,
  });
  const stateById = new Map(configuration.atoms.map((atom) => [atom.id, stateFromInitialAtom(atom)]));
  const atoms = topology.atoms.map((atom) => {
    const state = requireMap(stateById, atom.id, 'initial periodic atom');
    assertInitialState(state);
    return { ...atom, ...cloneState(state) };
  });
  const options = configuration.options;
  if (options.integrator !== 'velocity-verlet-kdk/v1' || options.ensemble !== 'NVE'
    || options.boundary !== 'periodic-3d-fixed-cell' || options.constraintAlgorithm !== 'not-enabled') {
    throw new Error('periodic atomistic v0.4.1 supports only fixed-cell unconstrained NVE Velocity Verlet');
  }
  assertRange('timeStepPicoseconds', options.timeStepPicoseconds, 1e-7, 0.01);
  if (!Number.isSafeInteger(options.maximumSteps) || options.maximumSteps < 1 || options.maximumSteps > 1_000_000) {
    throw new Error('maximumSteps must be a safe integer in [1, 1000000]');
  }
  assertRange('neighborSkinAngstrom', options.neighborSkinAngstrom, 1e-4, 10);
  assertRange('minimumAllowedPairDistanceAngstrom', options.minimumAllowedPairDistanceAngstrom, 1e-4, 100);
  const minimumPairRuleCutoff = Math.min(...topology.pairRules.map((rule) => rule.cutoffAngstrom));
  if (Number.isFinite(minimumPairRuleCutoff)
    && options.minimumAllowedPairDistanceAngstrom > minimumPairRuleCutoff) {
    throw new Error('minimumAllowedPairDistanceAngstrom must not exceed the smallest pair-rule cutoff');
  }
  assertRange('maximumRelativeEnergyExcursion', options.maximumRelativeEnergyExcursion, 1e-12, 0.1);
  assertRange('momentumResidualLimit', options.momentumResidualLimit, 1e-15, 1);
  assertRange('internalForceResidualLimit', options.internalForceResidualLimit, 1e-15, 1);
  assertRange('centerOfMassResidualAngstrom', options.centerOfMassResidualAngstrom, 1e-15, 1);
  cell.assertNeighborRadius(maximumRuleCutoff(topology) + options.neighborSkinAngstrom);
  if (options.electrostatics !== 'none' && options.electrostatics !== 'minimum-image-force-shifted-reference') {
    throw new Error('periodic atomistic electrostatics option is unsupported');
  }
  const usesCoulomb = topology.pairRules.some((rule) => rule.terms.some((term) => term.kind === 'coulomb-minimum-image-reference'));
  if (usesCoulomb !== (options.electrostatics === 'minimum-image-force-shifted-reference')) {
    throw new Error('electrostatics option must explicitly match minimum-image Coulomb term usage');
  }
  const charge = topology.atoms.reduce((sum, atom) => sum + atom.chargeE, 0);
  if (usesCoulomb && Math.abs(charge) > 1e-12) throw new Error('minimum-image Coulomb reference requires a neutral periodic cell');
  if (!configuration.provenance || configuration.provenance.solver !== 'tf-periodic-atomistic-vv'
    || configuration.provenance.solverVersion !== '0.4.1'
    || configuration.provenance.parameterRole !== 'local-classical-reference'
    || configuration.provenance.externalEngineExecuted !== false
    || configuration.provenance.electronicStructureSolved !== false) {
    throw new Error('periodic atomistic provenance contract is invalid');
  }
  return {
    schemaVersion: configuration.schemaVersion,
    worldId: configuration.worldId,
    scenarioId: configuration.scenarioId,
    modelName: configuration.modelName,
    modelVersion: configuration.modelVersion,
    cell: {
      originAngstrom: { ...cell.originAngstrom },
      vectorsAngstrom: cell.vectorsAngstrom.map((vector) => ({ ...vector })) as unknown as CellVectors3,
    },
    atoms,
    pairRules: topology.pairRules.map((rule) => ({ ...rule, atomTypes: [...rule.atomTypes] as [string, string], terms: rule.terms.map((term) => ({ ...term })) })),
    bonds: topology.bonds.map(cloneBond),
    excludeBondedNonbonded: topology.excludeBondedNonbonded,
    options: { ...options },
    provenance: { ...configuration.provenance },
  };
}

function assertSerializedWorld(state: SerializedPeriodicAtomisticWorldV041) {
  if (!state || state.schemaVersion !== 'tf.periodic-atomistic-world-state/0.4.1') throw new Error('unsupported periodic atomistic world-state schema');
  const configuration = canonicalizeConfiguration(state.configuration);
  const configurationDigest = digestValue(configuration);
  if (configurationDigest !== state.configurationDigest) throw new Error('periodic atomistic configuration digest mismatch');
  if (state.worldId !== configuration.worldId) throw new Error('periodic atomistic world identity is inconsistent');
  const topology = canonicalizePeriodicTopology({
    atoms: configuration.atoms.map(topologyFromInitialAtom),
    pairRules: configuration.pairRules,
    bonds: configuration.bonds,
    excludeBondedNonbonded: configuration.excludeBondedNonbonded,
  });
  const topologyDigest = digestValue({
    cell: configuration.cell,
    topology,
    options: configuration.options,
    modelName: configuration.modelName,
    modelVersion: configuration.modelVersion,
  });
  if (topologyDigest !== state.topologyDigest) throw new Error('periodic atomistic topology digest mismatch');
  if (!Number.isSafeInteger(state.step) || state.step < 0 || state.step > configuration.options.maximumSteps) throw new Error('periodic atomistic step is invalid');
  for (const value of [state.revision, state.actionCount, state.branchCount, state.faceCrossingEvents]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('periodic atomistic state counter is invalid');
  }
  if (state.revision !== state.actionCount || state.branchCount > state.actionCount) {
    throw new Error('periodic atomistic lineage counters are inconsistent');
  }
  const stepActionCount = state.actionCount - state.branchCount;
  if ((stepActionCount === 0 && state.step !== 0)
    || (stepActionCount > 0 && (state.step < stepActionCount || state.step > 1_000 * stepActionCount))) {
    throw new Error('periodic atomistic step and action counts are inconsistent');
  }
  if (!STABLE_TOKEN.test(state.stateNamespace)) throw new Error('periodic atomistic state namespace is invalid');
  const baseNamespace = `tfpaw-${shortDigest({ worldId: configuration.worldId, configurationDigest })}`;
  if ((state.branchCount === 0 && state.stateNamespace !== baseNamespace)
    || (state.branchCount > 0 && state.stateNamespace === baseNamespace)) {
    throw new Error('periodic atomistic branch count and namespace are inconsistent');
  }
  assertInitialStateArray(topology, state.atoms);
  const expectedPhysicalDigest = digestValue({
    schemaVersion: 'tf.periodic-atomistic-physical/0.4.1',
    worldId: configuration.worldId,
    topologyDigest,
    step: state.step,
    atoms: physicalDigestAtoms(state.atoms),
  });
  if (expectedPhysicalDigest !== state.physicalDigest) throw new Error('periodic atomistic physical digest mismatch');
  const expectedStateId = `${state.stateNamespace}-s${state.step.toString(36)}-r${state.revision.toString(36)}-${shortDigest({
    parentStateId: state.parentStateId,
    actionCount: state.actionCount,
    branchCount: state.branchCount,
    physicalDigest: state.physicalDigest,
  })}`;
  if (expectedStateId !== state.stateId) throw new Error('periodic atomistic state identity is inconsistent');
  assertActionSemantics(state);
  for (const value of [
    state.initialTotalEnergyKjMol,
    state.initialMassDalton,
    state.initialChargeE,
    state.energyReferenceKjMol,
    ...Object.values(state.initialMomentumDaltonAngstromPerPicosecond),
    ...Object.values(state.initialUnwrappedCenterOfMassAngstrom),
    ...Object.values(state.energyStatistics),
  ]) {
    if (!Number.isFinite(value)) throw new Error('periodic atomistic serialized scalar is non-finite');
  }
  if (!Number.isSafeInteger(state.energyStatistics.sampleCount) || state.energyStatistics.sampleCount !== state.step + 1) {
    throw new Error('periodic atomistic energy sample count is inconsistent');
  }
  const expectedTimeSum = configuration.options.timeStepPicoseconds * state.step * (state.step + 1) / 2;
  const expectedTimeSquaredSum = configuration.options.timeStepPicoseconds ** 2
    * state.step * (state.step + 1) * (2 * state.step + 1) / 6;
  if (!nearlyEqual(state.energyStatistics.timeSumPicoseconds, expectedTimeSum)
    || !nearlyEqual(state.energyStatistics.timeSquaredSumPicoseconds2, expectedTimeSquaredSum)) {
    throw new Error('periodic atomistic energy time statistics are inconsistent');
  }
  if (state.energyReferenceKjMol !== Math.max(Math.abs(state.initialTotalEnergyKjMol), 1)
    || state.energyStatistics.maximumAbsoluteExcursionKjMol < 0) {
    throw new Error('periodic atomistic energy reference metadata is inconsistent');
  }
  if (state.step === 0) assertZeroStepState(configuration, state);
  const withoutDigest = canonicalSerializedPayload(state);
  if (digestValue(withoutDigest) !== state.stateDigest) throw new Error('periodic atomistic state digest mismatch');
}

function assertActionSemantics(state: SerializedPeriodicAtomisticWorldV041) {
  if (state.actionCount === 0) {
    if (state.lastAction !== null || state.step !== 0 || state.revision !== 0 || state.parentStateId !== null) {
      throw new Error('periodic atomistic initial action lineage is inconsistent');
    }
    return;
  }
  const action = state.lastAction;
  if (!action || action.schemaVersion !== 'tf.periodic-atomistic-action/0.4.1'
    || action.parentStateId !== state.parentStateId || action.resultingStateId !== state.stateId
    || action.appliedAtStep !== state.step) {
    throw new Error('periodic atomistic last action is inconsistent');
  }
  const expectedActionId = digestValue({ ...action, actionId: undefined });
  if (expectedActionId !== action.actionId) throw new Error('periodic atomistic action digest mismatch');
  if (action.kind === 'step') {
    if (state.actionCount - state.branchCount < 1) throw new Error('periodic atomistic step action lineage is inconsistent');
    if (Object.keys(action.parameters).sort().join(',') !== 'fromStep,substeps,toStep') {
      throw new Error('periodic atomistic step action parameters are not closed');
    }
    const { substeps, fromStep, toStep } = action.parameters;
    if (!Number.isSafeInteger(substeps) || substeps < 1 || !Number.isSafeInteger(fromStep)
      || fromStep < 0 || toStep !== state.step || fromStep + substeps !== state.step) {
      throw new Error('periodic atomistic step action semantics are inconsistent');
    }
  } else if (action.kind === 'branch') {
    if (state.branchCount < 1) throw new Error('periodic atomistic branch action lineage is inconsistent');
    if (Object.keys(action.parameters).sort().join(',') !== 'branchOrdinal,fromStep') {
      throw new Error('periodic atomistic branch action parameters are not closed');
    }
    if (action.parameters.fromStep !== state.step || !Number.isSafeInteger(action.parameters.branchOrdinal)
      || action.parameters.branchOrdinal < 1) {
      throw new Error('periodic atomistic branch action semantics are inconsistent');
    }
  } else {
    throw new Error('periodic atomistic action kind is unsupported');
  }
}

function canonicalSerializedPayload(state: SerializedPeriodicAtomisticWorldV041): Omit<SerializedPeriodicAtomisticWorldV041, 'stateDigest'> {
  return {
    schemaVersion: state.schemaVersion,
    worldId: state.worldId,
    stateId: state.stateId,
    physicalDigest: state.physicalDigest,
    parentStateId: state.parentStateId,
    stateNamespace: state.stateNamespace,
    revision: state.revision,
    actionCount: state.actionCount,
    branchCount: state.branchCount,
    step: state.step,
    configurationDigest: state.configurationDigest,
    topologyDigest: state.topologyDigest,
    configuration: cloneConfiguration(state.configuration),
    atoms: state.atoms.map(cloneState),
    initialTotalEnergyKjMol: state.initialTotalEnergyKjMol,
    initialMomentumDaltonAngstromPerPicosecond: { ...state.initialMomentumDaltonAngstromPerPicosecond },
    initialUnwrappedCenterOfMassAngstrom: { ...state.initialUnwrappedCenterOfMassAngstrom },
    initialMassDalton: state.initialMassDalton,
    initialChargeE: state.initialChargeE,
    energyReferenceKjMol: state.energyReferenceKjMol,
    energyStatistics: { ...state.energyStatistics },
    faceCrossingEvents: state.faceCrossingEvents,
    lastAction: state.lastAction ? cloneAction(state.lastAction) : null,
  };
}

function assertInitialStateArray(topology: PeriodicTopologyV041, states: ReadonlyArray<PeriodicAtomStateV041>) {
  const topologyIds = new Set(topology.atoms.map((atom) => atom.id));
  const stateIds = new Set<string>();
  for (const [index, state] of states.entries()) {
    if (!topologyIds.has(state.id) || stateIds.has(state.id)) throw new Error('serialized periodic atom identities do not match topology');
    if (state.id !== topology.atoms[index]?.id) throw new Error('serialized periodic atoms are not in canonical topology order');
    stateIds.add(state.id);
    assertInitialState(state);
  }
  if (stateIds.size !== topologyIds.size) throw new Error('serialized periodic atom count does not match topology');
}

function assertInitialState(state: PeriodicAtomStateV041) {
  if (!state || !STABLE_TOKEN.test(state.id)) throw new Error('initial periodic atom ID is invalid');
  if (![state.wrappedFractional.x, state.wrappedFractional.y, state.wrappedFractional.z]
    .every((value) => Number.isFinite(value) && value >= 0 && value < 1)) {
    throw new Error('initial wrapped fractional coordinate must be in [0, 1)');
  }
  if (![state.image.x, state.image.y, state.image.z].every((value) => Number.isSafeInteger(value) && Math.abs(value) <= 1_000_000_000)) {
    throw new Error('initial periodic image must be a bounded safe integer');
  }
  if (!state.velocityAngstromPerPicosecond || ![
    state.velocityAngstromPerPicosecond.x,
    state.velocityAngstromPerPicosecond.y,
    state.velocityAngstromPerPicosecond.z,
  ].every(Number.isFinite)) throw new Error('initial periodic velocity must contain finite x, y and z');
}

function initialEnergyStatistics(initialEnergy: number): PeriodicEnergyStatisticsV041 {
  return {
    sampleCount: 1,
    timeSumPicoseconds: 0,
    energySumKjMol: initialEnergy,
    timeSquaredSumPicoseconds2: 0,
    timeEnergySumKjMolPicoseconds: 0,
    maximumAbsoluteExcursionKjMol: 0,
  };
}

function energyDriftSlope(statistics: PeriodicEnergyStatisticsV041) {
  const denominator = statistics.sampleCount * statistics.timeSquaredSumPicoseconds2 - statistics.timeSumPicoseconds ** 2;
  if (denominator === 0) return 0;
  return (statistics.sampleCount * statistics.timeEnergySumKjMolPicoseconds
    - statistics.timeSumPicoseconds * statistics.energySumKjMol) / denominator;
}

function topologyFromInitialAtom(atom: InitialPeriodicAtomV041): PeriodicAtomTopologyV041 {
  return { id: atom.id, label: atom.label, element: atom.element, atomType: atom.atomType, massDalton: atom.massDalton, chargeE: atom.chargeE };
}

function stateFromInitialAtom(atom: InitialPeriodicAtomV041): MutablePeriodicAtom {
  return {
    id: atom.id,
    wrappedFractional: { ...atom.wrappedFractional },
    image: { ...atom.image },
    velocityAngstromPerPicosecond: { ...atom.velocityAngstromPerPicosecond },
  };
}

function cloneState(state: PeriodicAtomStateV041): MutablePeriodicAtom {
  return {
    id: state.id,
    wrappedFractional: { ...state.wrappedFractional },
    image: { ...state.image },
    velocityAngstromPerPicosecond: { ...state.velocityAngstromPerPicosecond },
  };
}

function cloneBond(bond: PeriodicBondV041): PeriodicBondV041 {
  return { ...bond, imageShiftForB: { ...bond.imageShiftForB }, potential: { ...bond.potential } };
}

function clonePairInteraction(pair: PeriodicPairInteractionV041): PeriodicPairInteractionV041 {
  return {
    ...pair,
    imageShiftForB: { ...pair.imageShiftForB },
    displacementAngstrom: { ...pair.displacementAngstrom },
    energyByKindKjMol: { ...pair.energyByKindKjMol },
    forceOnBKjMolAngstrom: { ...pair.forceOnBKjMolAngstrom },
    pairVirialKjMol: { ...pair.pairVirialKjMol },
  };
}

function cloneAction(action: PeriodicAtomisticActionV041): PeriodicAtomisticActionV041 {
  return { ...action, parameters: { ...action.parameters } };
}

function cloneConfiguration(configuration: PeriodicAtomisticConfigurationV041): PeriodicAtomisticConfigurationV041 {
  return structuredClone(configuration);
}

function cloneVectorRecord(record: Readonly<Record<string, Vector3>>) {
  return Object.fromEntries(Object.entries(record).map(([id, vector]) => [id, { ...vector }]));
}

function compareStates(left: PeriodicAtomStateV041, right: PeriodicAtomStateV041) {
  return left.id < right.id ? -1 : left.id > right.id ? 1 : 0;
}

function physicalDigestAtoms(states: ReadonlyArray<PeriodicAtomStateV041>) {
  const ordered = [...states].sort(compareStates);
  const anchor = ordered[0]?.image;
  if (!anchor) throw new Error('periodic atomistic physical digest requires at least one atom');
  return ordered.map((state) => ({
    id: state.id,
    wrappedFractional: { ...state.wrappedFractional },
    relativeImageToAnchor: {
      x: state.image.x - anchor.x,
      y: state.image.y - anchor.y,
      z: state.image.z - anchor.z,
    },
    velocityAngstromPerPicosecond: { ...state.velocityAngstromPerPicosecond },
  }));
}

function assertZeroStepState(
  configuration: PeriodicAtomisticConfigurationV041,
  state: SerializedPeriodicAtomisticWorldV041,
) {
  const expectedAtoms = configuration.atoms.map(stateFromInitialAtom).sort(compareStates);
  const actualAtoms = state.atoms.map(cloneState).sort(compareStates);
  if (digestValue(actualAtoms) !== digestValue(expectedAtoms)
    || digestValue(state.energyStatistics) !== digestValue(initialEnergyStatistics(state.initialTotalEnergyKjMol))
    || state.faceCrossingEvents !== 0) {
    throw new Error('periodic atomistic zero-step state is inconsistent with its configuration');
  }
}

function nearlyEqual(left: number, right: number) {
  return Math.abs(left - right) <= Math.max(1, Math.abs(left), Math.abs(right)) * Number.EPSILON * 256;
}

function imageCrossings(before: Int3, after: Int3) {
  return Math.abs(after.x - before.x) + Math.abs(after.y - before.y) + Math.abs(after.z - before.z);
}

function addImages(left: Int3, right: Int3): Int3 {
  const result = { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z };
  if (![result.x, result.y, result.z].every((value) => Number.isSafeInteger(value) && Math.abs(value) <= 1_000_000_000)) {
    throw new Error('periodic image crossed the locked bounded integer domain');
  }
  return result;
}

function assertRange(label: string, value: number, minimum: number, maximum: number) {
  if (!(Number.isFinite(value) && value >= minimum && value <= maximum)) throw new Error(`${label} must be finite and in [${minimum}, ${maximum}]`);
}

function requireMap<K, V>(map: ReadonlyMap<K, V>, key: K, label: string) {
  const value = map.get(key);
  if (value === undefined) throw new Error(`${label} is missing`);
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}

function allFinite(value: unknown): boolean {
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every(allFinite);
  if (value && typeof value === 'object') return Object.values(value).every(allFinite);
  return true;
}

function add(left: Vector3, right: Vector3): Vector3 { return { x: left.x + right.x, y: left.y + right.y, z: left.z + right.z }; }
function subtract(left: Vector3, right: Vector3): Vector3 { return { x: left.x - right.x, y: left.y - right.y, z: left.z - right.z }; }
function scale(vector: Vector3, factor: number): Vector3 { return { x: vector.x * factor, y: vector.y * factor, z: vector.z * factor }; }
function magnitude(vector: Vector3) { return Math.hypot(vector.x, vector.y, vector.z); }
