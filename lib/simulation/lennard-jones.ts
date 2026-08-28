import { digestValue, shortDigest } from './digest.ts';

export const ARGON_UNITS = {
  epsilonOverKelvin: 119.8,
  sigmaAngstrom: 3.405,
  timePicoseconds: 2.156,
} as const;

export type ParticleState = {
  x: number;
  y: number;
  ux: number;
  uy: number;
  vx: number;
  vy: number;
  fx: number;
  fy: number;
  x0: number;
  y0: number;
};

export type SimulationOptions = {
  count?: number;
  density?: number;
  temperatureKelvin?: number;
  timeStep?: number;
  cutoff?: number;
  thermostatTau?: number | null;
  seed?: number;
};

export type SimulationSnapshot = {
  schemaVersion: 'tf.observation/0.1';
  stateId: string;
  stateDigest: string;
  parentStateId: string | null;
  step: number;
  timeReduced: number;
  timePicoseconds: number;
  box: { width: number; height: number; unit: 'sigma' };
  particles: ReadonlyArray<{ x: number; y: number; vx: number; vy: number }>;
  metrics: {
    targetTemperatureKelvin: number;
    temperatureKelvin: number;
    temperatureReduced: number;
    kineticEnergyPerParticle: number;
    potentialEnergyPerParticle: number;
    totalEnergyPerParticle: number;
    pressureReduced: number;
    coordinationNumber: number;
    meanSquaredDisplacement: number;
    relativeEnergyDrift: number;
    densityReduced: number;
  };
  provenance: {
    engine: 'lj-2d-velocity-verlet';
    engineVersion: '0.1.0';
    seed: number;
    modelRole: 'solver';
    fidelity: 'reduced-unit-demonstration';
  };
};

export type SerializedSimulation = {
  schemaVersion: 'tf.module-state/0.3';
  stateId: string;
  stateDigest: string;
  parentStateId: string | null;
  step: number;
  options: Required<Omit<SimulationOptions, 'thermostatTau'>> & { thermostatTau: number | null };
  targetTemperatureReduced: number;
  box: { width: number; height: number };
  particles: ParticleState[];
  initialEnergy: number;
  stateNamespace: string;
  revision: number;
  branchCount: number;
};

export type CellThermalExchange = { indices: ReadonlyArray<number>; energyReduced: number };
export type AppliedCellThermalExchange = CellThermalExchange & { actualEnergyReduced: number; deltaPx: number; deltaPy: number };

type ForceSummary = { potential: number; virial: number; neighborPairs: number };

const DEFAULTS = {
  count: 96,
  density: 0.84,
  temperatureKelvin: 92,
  timeStep: 0.002,
  cutoff: 2.5,
  thermostatTau: 0.35,
  seed: 20260828,
} as const;

export class LennardJonesSimulation {
  readonly options: Required<Omit<SimulationOptions, 'thermostatTau'>> & { thermostatTau: number | null };
  readonly box: { width: number; height: number };
  private readonly particles: ParticleState[];
  private forceSummary: ForceSummary;
  private initialEnergy: number;
  private _step = 0;
  private _stateId: string;
  private _stateNamespace: string;
  private _parentStateId: string | null = null;
  private _revision = 0;
  private _branchCount = 0;
  private targetTemperatureReduced: number;

  constructor(options: SimulationOptions = {}) {
    this.options = Object.freeze({ ...DEFAULTS, ...options });
    if (!Number.isInteger(this.options.count) || this.options.count < 4) throw new Error('count must be an integer of at least 4');
    if (!(Number.isFinite(this.options.density) && this.options.density > 0 && this.options.density < 1.4)) throw new Error('density must be finite and in (0, 1.4)');
    if (!(Number.isFinite(this.options.temperatureKelvin) && this.options.temperatureKelvin > 0 && this.options.temperatureKelvin <= 600)) throw new Error('temperatureKelvin must be finite and in (0, 600]');
    if (!(Number.isFinite(this.options.timeStep) && this.options.timeStep > 0 && this.options.timeStep <= 0.01)) throw new Error('timeStep must be finite and in (0, 0.01]');
    if (!(Number.isFinite(this.options.cutoff) && this.options.cutoff > 1 && this.options.cutoff <= 4)) throw new Error('cutoff must be finite and in (1, 4]');
    if (this.options.thermostatTau !== null && !(Number.isFinite(this.options.thermostatTau) && this.options.thermostatTau > 0)) throw new Error('thermostatTau must be null or finite and positive');
    if (!Number.isSafeInteger(this.options.seed)) throw new Error('seed must be a safe integer');

    const columns = Math.ceil(Math.sqrt(this.options.count * 1.7));
    const rows = Math.ceil(this.options.count / columns);
    const area = this.options.count / this.options.density;
    const width = Math.sqrt(area * columns / rows);
    const height = area / width;
    if (this.options.cutoff > Math.min(width, height) / 2) throw new Error('cutoff exceeds the periodic minimum-image limit for this system size');
    this.box = Object.freeze({ width, height });
    this.targetTemperatureReduced = this.options.temperatureKelvin / ARGON_UNITS.epsilonOverKelvin;
    this._stateNamespace = `tfm-${this.options.seed.toString(36)}-${optionsFingerprint(this.options)}`;
    this._stateId = stateId(this._stateNamespace, 0, 0, 'initial');
    this.particles = this.initializeParticles(columns, rows);
    this.forceSummary = this.computeForces();
    this.initialEnergy = this.totalEnergy();
  }

  get stepCount() { return this._step; }

  setTargetTemperatureKelvin(kelvin: number) {
    if (!(kelvin >= 20 && kelvin <= 600)) throw new Error('temperature must be between 20 K and 600 K');
    const parentStateId = this._stateId;
    this.targetTemperatureReduced = kelvin / ARGON_UNITS.epsilonOverKelvin;
    this.commitMutation(parentStateId, `target-temperature:${kelvin}`);
  }

  advance(substeps = 1): SimulationSnapshot {
    if (!Number.isInteger(substeps) || substeps < 1 || substeps > 10_000) throw new Error('substeps must be an integer in [1, 10000]');
    for (let index = 0; index < substeps; index += 1) this.integrateOneStep();
    return this.observe();
  }

  observe(): SimulationSnapshot {
    const kinetic = this.kineticEnergy();
    const total = kinetic + this.forceSummary.potential;
    const temperature = this.temperatureReduced(kinetic);
    const area = this.box.width * this.box.height;
    const pressure = (this.particles.length * temperature + this.forceSummary.virial / 2) / area;
    const driftDenominator = Math.max(Math.abs(this.initialEnergy), 1e-12);
    return {
      schemaVersion: 'tf.observation/0.1',
      stateId: this._stateId,
      stateDigest: this.stateDigest(),
      parentStateId: this._parentStateId,
      step: this._step,
      timeReduced: this._step * this.options.timeStep,
      timePicoseconds: this._step * this.options.timeStep * ARGON_UNITS.timePicoseconds,
      box: { ...this.box, unit: 'sigma' },
      particles: this.particles.map(({ x, y, vx, vy }) => ({ x, y, vx, vy })),
      metrics: {
        targetTemperatureKelvin: this.targetTemperatureReduced * ARGON_UNITS.epsilonOverKelvin,
        temperatureKelvin: temperature * ARGON_UNITS.epsilonOverKelvin,
        temperatureReduced: temperature,
        kineticEnergyPerParticle: kinetic / this.particles.length,
        potentialEnergyPerParticle: this.forceSummary.potential / this.particles.length,
        totalEnergyPerParticle: total / this.particles.length,
        pressureReduced: pressure,
        coordinationNumber: (2 * this.forceSummary.neighborPairs) / this.particles.length,
        meanSquaredDisplacement: this.meanSquaredDisplacement(),
        relativeEnergyDrift: (total - this.initialEnergy) / driftDenominator,
        densityReduced: this.particles.length / area,
      },
      provenance: {
        engine: 'lj-2d-velocity-verlet',
        engineVersion: '0.1.0',
        seed: this.options.seed,
        modelRole: 'solver',
        fidelity: 'reduced-unit-demonstration',
      },
    };
  }

  serialize(): SerializedSimulation {
    return {
      schemaVersion: 'tf.module-state/0.3',
      stateId: this._stateId,
      stateDigest: this.stateDigest(),
      parentStateId: this._parentStateId,
      step: this._step,
      options: { ...this.options },
      targetTemperatureReduced: this.targetTemperatureReduced,
      box: { ...this.box },
      particles: this.particles.map((particle) => ({ ...particle })),
      initialEnergy: this.initialEnergy,
      stateNamespace: this._stateNamespace,
      revision: this._revision,
      branchCount: this._branchCount,
    };
  }

  clone(branchOrdinal: number): LennardJonesSimulation {
    if (!Number.isSafeInteger(branchOrdinal) || branchOrdinal < 1) throw new Error('branch ordinal must be a positive safe integer');
    const parentStateId = this._stateId;
    const clone = LennardJonesSimulation.fromSerialized(this.serialize());
    clone._branchCount = this._branchCount + 1;
    clone._parentStateId = parentStateId;
    clone._stateNamespace = `${this._stateNamespace}-b${branchOrdinal.toString(36)}`;
    clone._revision += 1;
    clone._stateId = stateId(clone._stateNamespace, clone._step, clone._revision, `${parentStateId}|branch:${branchOrdinal}`);
    return clone;
  }

  static fromSerialized(state: SerializedSimulation): LennardJonesSimulation {
    if (state.schemaVersion !== 'tf.module-state/0.3') throw new Error('unsupported module-state schema');
    assertSerializedSimulationPayload(state);
    const rootNamespace = `tfm-${state.options.seed.toString(36)}-${optionsFingerprint(state.options)}`;
    if (!state.stateNamespace.match(new RegExp(`^${escapeRegExp(rootNamespace)}(?:-b[0-9a-z]+)*$`))) throw new Error('serialized module namespace is invalid');
    if (!isStateIdFor(state.stateId, state.stateNamespace, state.step, state.revision)) throw new Error('serialized module-state identity is inconsistent');
    if (serializedSimulationDigest(state) !== state.stateDigest) throw new Error('serialized module-state digest mismatch');

    const simulation = new LennardJonesSimulation(state.options);
    simulation.particles.splice(0, simulation.particles.length, ...state.particles.map((particle) => ({ ...particle })));
    simulation._step = state.step;
    simulation._stateId = state.stateId;
    simulation._stateNamespace = state.stateNamespace;
    simulation._parentStateId = state.parentStateId;
    simulation._revision = state.revision;
    simulation._branchCount = state.branchCount;
    simulation.targetTemperatureReduced = state.targetTemperatureReduced;
    simulation.initialEnergy = state.initialEnergy;
    simulation.forceSummary = simulation.computeForces();
    if (simulation.stateDigest() !== state.stateDigest) throw new Error('serialized module-state digest mismatch');
    return simulation;
  }

  totalForce() {
    return this.particles.reduce((sum, particle) => ({ x: sum.x + particle.fx, y: sum.y + particle.fy }), { x: 0, y: 0 });
  }

  exchangeCellThermalEnergies(exchanges: ReadonlyArray<CellThermalExchange>): AppliedCellThermalExchange[] {
    if (exchanges.length === 0) return [];
    const seen = new Set<number>();
    for (const exchange of exchanges) {
      if (exchange.indices.length < 2) throw new Error('cell thermal exchange requires at least two particles');
      if (!Number.isFinite(exchange.energyReduced)) throw new Error('cell thermal exchange must be finite');
      for (const index of exchange.indices) {
        if (!Number.isInteger(index) || index < 0 || index >= this.particles.length) throw new Error('cell thermal exchange targets an invalid particle');
        if (seen.has(index)) throw new Error('a particle may only appear once per exchange batch');
        seen.add(index);
      }
    }

    const backup = [...seen].map((index) => ({ index, vx: this.particles[index].vx, vy: this.particles[index].vy }));
    const results: AppliedCellThermalExchange[] = [];
    try {
      for (const exchange of exchanges) {
        const meanVx = exchange.indices.reduce((sum, index) => sum + this.particles[index].vx, 0) / exchange.indices.length;
        const meanVy = exchange.indices.reduce((sum, index) => sum + this.particles[index].vy, 0) / exchange.indices.length;
        const before = exchange.indices.reduce((sum, index) => {
          const particle = this.particles[index];
          return sum + 0.5 * ((particle.vx - meanVx) ** 2 + (particle.vy - meanVy) ** 2);
        }, 0);
        const requested = Math.max(exchange.energyReduced, -before * 0.95);
        if (Math.abs(requested) < 1e-15 || before < 1e-15) {
          results.push({ ...exchange, actualEnergyReduced: 0, deltaPx: 0, deltaPy: 0 });
          continue;
        }
        const scale = Math.sqrt((before + requested) / before);
        let deltaPx = 0;
        let deltaPy = 0;
        for (const index of exchange.indices) {
          const particle = this.particles[index];
          const previousVx = particle.vx;
          const previousVy = particle.vy;
          particle.vx = meanVx + (particle.vx - meanVx) * scale;
          particle.vy = meanVy + (particle.vy - meanVy) * scale;
          deltaPx += particle.vx - previousVx;
          deltaPy += particle.vy - previousVy;
        }
        const after = exchange.indices.reduce((sum, index) => {
          const particle = this.particles[index];
          return sum + 0.5 * ((particle.vx - meanVx) ** 2 + (particle.vy - meanVy) ** 2);
        }, 0);
        results.push({
          ...exchange,
          actualEnergyReduced: after - before,
          deltaPx,
          deltaPy,
        });
      }
    } catch (error) {
      for (const saved of backup) {
        this.particles[saved.index].vx = saved.vx;
        this.particles[saved.index].vy = saved.vy;
      }
      throw error;
    }
    this.commitMutation(this._stateId, `thermal-exchange:${digestValue(exchanges)}`);
    return results;
  }

  private initializeParticles(columns: number, rows: number) {
    const random = makeRandom(this.options.seed);
    const particles: ParticleState[] = [];
    const spacingX = this.box.width / columns;
    const spacingY = this.box.height / rows;
    for (let row = 0; row < rows && particles.length < this.options.count; row += 1) {
      for (let column = 0; column < columns && particles.length < this.options.count; column += 1) {
        const x = wrap((column + 0.5 + (row % 2) * 0.5) * spacingX, this.box.width);
        const y = (row + 0.5) * spacingY;
        // A 12-sample Irwin-Hall draw avoids engine-specific sin/log
        // implementations, so the seeded initial world is identical during
        // Node SSR and browser hydration. The global rescale below still sets
        // the requested kinetic temperature exactly.
        let vx = -6;
        let vy = -6;
        for (let sample = 0; sample < 12; sample += 1) {
          vx += random();
          vy += random();
        }
        particles.push({ x, y, ux: x, uy: y, vx, vy, fx: 0, fy: 0, x0: x, y0: y });
      }
    }

    const meanVx = particles.reduce((sum, particle) => sum + particle.vx, 0) / particles.length;
    const meanVy = particles.reduce((sum, particle) => sum + particle.vy, 0) / particles.length;
    particles.forEach((particle) => { particle.vx -= meanVx; particle.vy -= meanVy; });
    const kinetic = particles.reduce((sum, particle) => sum + 0.5 * (particle.vx ** 2 + particle.vy ** 2), 0);
    const currentTemperature = (2 * kinetic) / Math.max(2 * particles.length - 2, 1);
    const scale = Math.sqrt(this.targetTemperatureReduced / Math.max(currentTemperature, 1e-12));
    particles.forEach((particle) => { particle.vx *= scale; particle.vy *= scale; });
    return particles;
  }

  private integrateOneStep() {
    const particleBackup = this.particles.map((particle) => ({ ...particle }));
    const forceSummaryBackup = { ...this.forceSummary };
    const parentStateId = this._stateId;
    const dt = this.options.timeStep;
    try {
      for (const particle of this.particles) {
        particle.vx += 0.5 * particle.fx * dt;
        particle.vy += 0.5 * particle.fy * dt;
        const dx = particle.vx * dt;
        const dy = particle.vy * dt;
        particle.ux += dx;
        particle.uy += dy;
        particle.x = wrap(particle.x + dx, this.box.width);
        particle.y = wrap(particle.y + dy, this.box.height);
      }

      this.forceSummary = this.computeForces();
      for (const particle of this.particles) {
        particle.vx += 0.5 * particle.fx * dt;
        particle.vy += 0.5 * particle.fy * dt;
      }

      if (this.options.thermostatTau !== null) this.applyThermostat();
    } catch (error) {
      this.particles.splice(0, this.particles.length, ...particleBackup);
      this.forceSummary = forceSummaryBackup;
      throw error;
    }
    this._step += 1;
    this.commitMutation(parentStateId, `integrate:${this._step}`);
  }

  private computeForces(): ForceSummary {
    this.particles.forEach((particle) => { particle.fx = 0; particle.fy = 0; });
    const cutoffSquared = this.options.cutoff ** 2;
    let potential = 0;
    let virial = 0;
    let neighborPairs = 0;

    for (let i = 0; i < this.particles.length; i += 1) {
      for (let j = i + 1; j < this.particles.length; j += 1) {
        const first = this.particles[i];
        const second = this.particles[j];
        const dx = minimumImage(second.x - first.x, this.box.width);
        const dy = minimumImage(second.y - first.y, this.box.height);
        const distanceSquared = dx * dx + dy * dy;
        if (distanceSquared >= cutoffSquared) continue;
        if (distanceSquared < 0.45 ** 2) throw new Error('unstable state: particle overlap');

        const distance = Math.sqrt(distanceSquared);
        const radialDerivative = forceShiftedRadialDerivative(distance, this.options.cutoff);
        const forceCoefficient = radialDerivative / distance;
        const fx = forceCoefficient * dx;
        const fy = forceCoefficient * dy;
        first.fx += fx;
        first.fy += fy;
        second.fx -= fx;
        second.fy -= fy;
        potential += forceShiftedPotential(distance, this.options.cutoff);
        virial += -forceCoefficient * distanceSquared;
        if (distanceSquared < 1.45 ** 2) neighborPairs += 1;
      }
    }

    return { potential, virial, neighborPairs };
  }

  private applyThermostat() {
    const kinetic = this.kineticEnergy();
    const currentTemperature = this.temperatureReduced(kinetic);
    const tau = this.options.thermostatTau;
    if (tau === null || currentTemperature <= 1e-12) return;
    const rawScale = Math.sqrt(1 + (this.options.timeStep / tau) * (this.targetTemperatureReduced / currentTemperature - 1));
    const scale = Math.min(1.015, Math.max(0.985, rawScale));
    this.particles.forEach((particle) => { particle.vx *= scale; particle.vy *= scale; });
  }

  private kineticEnergy() {
    return this.particles.reduce((sum, particle) => sum + 0.5 * (particle.vx ** 2 + particle.vy ** 2), 0);
  }

  private temperatureReduced(kinetic = this.kineticEnergy()) {
    return (2 * kinetic) / Math.max(2 * this.particles.length - 2, 1);
  }

  private totalEnergy() { return this.kineticEnergy() + this.forceSummary.potential; }

  private stateDigest() {
    return serializedSimulationDigest({
      schemaVersion: 'tf.module-state/0.3',
      stateId: this._stateId,
      parentStateId: this._parentStateId,
      step: this._step,
      stateNamespace: this._stateNamespace,
      revision: this._revision,
      branchCount: this._branchCount,
      targetTemperatureReduced: this.targetTemperatureReduced,
      options: this.options,
      box: this.box,
      particles: this.particles,
      initialEnergy: this.initialEnergy,
    });
  }

  private commitMutation(parentStateId: string, transition: string) {
    this._parentStateId = parentStateId;
    this._revision += 1;
    this._stateId = stateId(this._stateNamespace, this._step, this._revision, `${parentStateId}|${transition}`);
  }

  private meanSquaredDisplacement() {
    return this.particles.reduce((sum, particle) => sum + (particle.ux - particle.x0) ** 2 + (particle.uy - particle.y0) ** 2, 0) / this.particles.length;
  }
}

function makeRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

function wrap(value: number, extent: number) { return ((value % extent) + extent) % extent; }

function minimumImage(delta: number, extent: number) { return delta - extent * Math.round(delta / extent); }

function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function stateId(namespace: string, step: number, revision: number, transition: string) {
  return `${namespace}-s${step.toString(36).padStart(6, '0')}r${revision.toString(36).padStart(4, '0')}-${shortDigest(transition)}`;
}

function isStateIdFor(candidate: string, namespace: string, step: number, revision: number) {
  const prefix = `${namespace}-s${step.toString(36).padStart(6, '0')}r${revision.toString(36).padStart(4, '0')}-`;
  return new RegExp(`^${escapeRegExp(prefix)}[0-9a-f]{16}$`).test(candidate);
}

function optionsFingerprint(options: Required<Omit<SimulationOptions, 'thermostatTau'>> & { thermostatTau: number | null }) {
  return shortDigest([options.count, options.density, options.temperatureKelvin, options.timeStep, options.cutoff, options.thermostatTau ?? 'nve']);
}

function serializedSimulationDigest(state: Omit<SerializedSimulation, 'stateDigest'> | SerializedSimulation) {
  return digestValue({
    schemaVersion: state.schemaVersion,
    stateId: state.stateId,
    parentStateId: state.parentStateId,
    step: state.step,
    stateNamespace: state.stateNamespace,
    revision: state.revision,
    branchCount: state.branchCount,
    targetTemperatureReduced: state.targetTemperatureReduced,
    options: {
      count: state.options.count,
      density: state.options.density,
      temperatureKelvin: state.options.temperatureKelvin,
      timeStep: state.options.timeStep,
      cutoff: state.options.cutoff,
      thermostatTau: state.options.thermostatTau,
      seed: state.options.seed,
    },
    box: { width: state.box.width, height: state.box.height },
    particles: state.particles.map((particle) => ({
      x: particle.x,
      y: particle.y,
      ux: particle.ux,
      uy: particle.uy,
      vx: particle.vx,
      vy: particle.vy,
      fx: particle.fx,
      fy: particle.fy,
      x0: particle.x0,
      y0: particle.y0,
    })),
    initialEnergy: state.initialEnergy,
  });
}

function assertSerializedSimulationPayload(state: SerializedSimulation) {
  assertExactKeys(state, [
    'schemaVersion', 'stateId', 'stateDigest', 'parentStateId', 'step', 'options', 'targetTemperatureReduced',
    'box', 'particles', 'initialEnergy', 'stateNamespace', 'revision', 'branchCount',
  ], 'serialized module state');
  assertExactKeys(state.options, ['count', 'density', 'temperatureKelvin', 'timeStep', 'cutoff', 'thermostatTau', 'seed'], 'serialized module options');
  assertExactKeys(state.box, ['width', 'height'], 'serialized module box');

  if (typeof state.stateId !== 'string' || typeof state.stateNamespace !== 'string' || !/^sha256:[0-9a-f]{64}$/.test(state.stateDigest)) {
    throw new Error('serialized module identity metadata is invalid');
  }
  if (state.parentStateId !== null && typeof state.parentStateId !== 'string') throw new Error('serialized module parent identity is invalid');
  if (!Number.isSafeInteger(state.step) || state.step < 0 || !Number.isSafeInteger(state.revision) || state.revision < 0 || !Number.isSafeInteger(state.branchCount) || state.branchCount < 0) {
    throw new Error('serialized module counters are invalid');
  }
  const numericOptions = [state.options.count, state.options.density, state.options.temperatureKelvin, state.options.timeStep, state.options.cutoff, state.options.seed];
  if (!numericOptions.every(Number.isFinite) || (state.options.thermostatTau !== null && !Number.isFinite(state.options.thermostatTau))) {
    throw new Error('serialized module options must be finite');
  }
  if (!Number.isSafeInteger(state.options.count) || state.options.count < 4 || !Array.isArray(state.particles) || state.particles.length !== state.options.count) {
    throw new Error('particle count does not match options');
  }
  if (![state.box.width, state.box.height].every(Number.isFinite) || !(state.box.width > 0 && state.box.height > 0)) throw new Error('serialized module box is invalid');
  if (!Number.isFinite(state.targetTemperatureReduced) || state.targetTemperatureReduced <= 0 || !Number.isFinite(state.initialEnergy)) throw new Error('serialized module energy metadata is invalid');
  state.particles.forEach((particle) => {
    assertExactKeys(particle, ['x', 'y', 'ux', 'uy', 'vx', 'vy', 'fx', 'fy', 'x0', 'y0'], 'serialized particle state');
    if (![particle.x, particle.y, particle.ux, particle.uy, particle.vx, particle.vy, particle.fx, particle.fy, particle.x0, particle.y0].every(Number.isFinite)) {
      throw new Error('serialized module particle state must be finite');
    }
  });
}

function assertExactKeys(value: object, expected: readonly string[], label: string) {
  const keys = Object.keys(value).sort();
  const sortedExpected = [...expected].sort();
  if (keys.length !== sortedExpected.length || keys.some((key, index) => key !== sortedExpected[index])) throw new Error(`${label} has unexpected fields`);
}

export function lennardJonesPotential(distance: number) {
  if (!(distance > 0)) throw new Error('distance must be positive');
  const inverseSix = (1 / distance) ** 6;
  return 4 * (inverseSix ** 2 - inverseSix);
}

export function lennardJonesRadialDerivative(distance: number) {
  if (!(distance > 0)) throw new Error('distance must be positive');
  const inverse = 1 / distance;
  const inverseSix = inverse ** 6;
  return 24 * inverse * (inverseSix - 2 * inverseSix ** 2);
}

export function forceShiftedPotential(distance: number, cutoff = 2.5) {
  if (distance >= cutoff) return 0;
  return lennardJonesPotential(distance)
    - lennardJonesPotential(cutoff)
    - (distance - cutoff) * lennardJonesRadialDerivative(cutoff);
}

export function forceShiftedRadialDerivative(distance: number, cutoff = 2.5) {
  if (distance >= cutoff) return 0;
  return lennardJonesRadialDerivative(distance) - lennardJonesRadialDerivative(cutoff);
}
