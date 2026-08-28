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
  schemaVersion: 'tf.world/0.1';
  stateId: string;
  parentStateId: string | null;
  step: number;
  options: Required<Omit<SimulationOptions, 'thermostatTau'>> & { thermostatTau: number | null };
  box: { width: number; height: number };
  particles: ParticleState[];
  initialEnergy: number;
  stateNamespace: string;
};

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
  readonly particles: ParticleState[];
  private forceSummary: ForceSummary;
  private initialEnergy: number;
  private _step = 0;
  private _stateId: string;
  private _stateNamespace: string;
  private _parentStateId: string | null = null;
  private targetTemperatureReduced: number;

  constructor(options: SimulationOptions = {}) {
    this.options = { ...DEFAULTS, ...options };
    if (this.options.count < 4) throw new Error('count must be at least 4');
    if (!(this.options.density > 0 && this.options.density < 1.4)) throw new Error('density must be in (0, 1.4)');
    if (!(this.options.timeStep > 0 && this.options.timeStep <= 0.01)) throw new Error('timeStep must be in (0, 0.01]');
    if (!(this.options.cutoff > 1 && this.options.cutoff <= 4)) throw new Error('cutoff must be in (1, 4]');

    const columns = Math.ceil(Math.sqrt(this.options.count * 1.7));
    const rows = Math.ceil(this.options.count / columns);
    const spacing = Math.sqrt(1 / (this.options.density * Math.sqrt(3) / 2));
    this.box = { width: columns * spacing, height: rows * spacing * Math.sqrt(3) / 2 };
    this.targetTemperatureReduced = this.options.temperatureKelvin / ARGON_UNITS.epsilonOverKelvin;
    this._stateNamespace = `tf-${this.options.seed.toString(36)}`;
    this._stateId = stateId(this._stateNamespace, 0);
    this.particles = this.initializeParticles(columns, rows, spacing);
    this.forceSummary = this.computeForces();
    this.initialEnergy = this.totalEnergy();
  }

  get stepCount() { return this._step; }

  setTargetTemperatureKelvin(kelvin: number) {
    if (!(kelvin >= 20 && kelvin <= 600)) throw new Error('temperature must be between 20 K and 600 K');
    this.targetTemperatureReduced = kelvin / ARGON_UNITS.epsilonOverKelvin;
    this.options.temperatureKelvin = kelvin;
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

  serialize(parentStateId: string | null = this._parentStateId): SerializedSimulation {
    return {
      schemaVersion: 'tf.world/0.1',
      stateId: this._stateId,
      parentStateId,
      step: this._step,
      options: { ...this.options },
      box: { ...this.box },
      particles: this.particles.map((particle) => ({ ...particle })),
      initialEnergy: this.initialEnergy,
      stateNamespace: this._stateNamespace,
    };
  }

  clone(): LennardJonesSimulation {
    const clone = LennardJonesSimulation.fromSerialized(this.serialize(this._stateId));
    clone._parentStateId = this._stateId;
    clone._stateNamespace = `${this._stateNamespace}-b${this._step.toString(36)}`;
    clone._stateId = stateId(clone._stateNamespace, clone._step);
    return clone;
  }

  static fromSerialized(state: SerializedSimulation): LennardJonesSimulation {
    if (state.schemaVersion !== 'tf.world/0.1') throw new Error('unsupported world state schema');
    const simulation = new LennardJonesSimulation(state.options);
    if (state.particles.length !== simulation.particles.length) throw new Error('particle count does not match options');
    simulation.particles.splice(0, simulation.particles.length, ...state.particles.map((particle) => ({ ...particle })));
    simulation._step = state.step;
    simulation._stateId = state.stateId;
    simulation._stateNamespace = state.stateNamespace;
    simulation._parentStateId = state.parentStateId;
    simulation.initialEnergy = state.initialEnergy;
    simulation.forceSummary = simulation.computeForces();
    return simulation;
  }

  totalForce() {
    return this.particles.reduce((sum, particle) => ({ x: sum.x + particle.fx, y: sum.y + particle.fy }), { x: 0, y: 0 });
  }

  private initializeParticles(columns: number, rows: number, spacing: number) {
    const random = makeRandom(this.options.seed);
    const particles: ParticleState[] = [];
    for (let row = 0; row < rows && particles.length < this.options.count; row += 1) {
      for (let column = 0; column < columns && particles.length < this.options.count; column += 1) {
        const x = wrap((column + 0.5 + (row % 2) * 0.5) * spacing, this.box.width);
        const y = (row + 0.5) * spacing * Math.sqrt(3) / 2;
        const angle = random() * Math.PI * 2;
        const speed = Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12)));
        particles.push({ x, y, ux: x, uy: y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, fx: 0, fy: 0, x0: x, y0: y });
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
    const dt = this.options.timeStep;
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
    this._parentStateId = this._stateId;
    this._step += 1;
    this._stateId = stateId(this._stateNamespace, this._step);
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

function stateId(namespace: string, step: number) { return `${namespace}-s${step.toString(36).padStart(6, '0')}`; }

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
