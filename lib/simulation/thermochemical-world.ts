import {
  ARGON_UNITS,
  LennardJonesSimulation,
  type SerializedSimulation,
} from './lennard-jones.ts';

export type ParticleSpecies = 'A' | 'B';

export type ThermochemicalWorldOptions = {
  count?: number;
  density?: number;
  temperatureKelvin?: number;
  timeStep?: number;
  cutoff?: number;
  seed?: number;
  gridWidth?: number;
  gridHeight?: number;
  thermalDiffusivity?: number;
  fieldHeatCapacity?: number;
  couplingTau?: number;
  reactionPreexponential?: number;
  reactionActivationReduced?: number;
  reactionHeatReduced?: number;
};

type ResolvedWorldOptions = Readonly<Required<ThermochemicalWorldOptions>>;

export type WorldAction = {
  schemaVersion: 'tf.action/0.2';
  actionId: string;
  kind: 'step' | 'set_field_temperature' | 'inject_heat_pulse' | 'branch';
  parentStateId: string;
  resultingStateId: string;
  appliedAtStep: number;
  parameters: Readonly<Record<string, number | string>>;
};

export type ThermochemicalSnapshot = {
  schemaVersion: 'tf.observation/0.2';
  worldId: string;
  stateId: string;
  stateDigest: string;
  parentStateId: string | null;
  step: number;
  timeReduced: number;
  timePicoseconds: number;
  lastAction: WorldAction | null;
  box: { width: number; height: number; unit: 'sigma' };
  particles: ReadonlyArray<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    species: ParticleSpecies;
  }>;
  field: {
    width: number;
    height: number;
    valuesKelvin: ReadonlyArray<number>;
    meanKelvin: number;
    minKelvin: number;
    maxKelvin: number;
    unit: 'kelvin';
    model: 'periodic-fourier-heat-2d';
  };
  metrics: {
    particleTemperatureKelvin: number;
    fieldTemperatureKelvin: number;
    kineticEnergyPerParticle: number;
    potentialEnergyPerParticle: number;
    pressureReduced: number;
    coordinationNumber: number;
    meanSquaredDisplacement: number;
    conversionFraction: number;
    reactionCount: number;
    cumulativeInterfaceEnergyReduced: number;
    couplingCoverage: number;
  };
  conservation: {
    particleCount: number;
    speciesResidual: number;
    massResidual: number;
    energyResidualReduced: number;
    relativeEnergyResidual: number;
    momentumResidual: number;
    heatClosureResidual: number;
    exchangeClosureResidual: number;
    reactionClosureResidual: number;
    externalEnergyReduced: number;
    mdEnergyReduced: number;
    fieldEnergyReduced: number;
    chemicalEnergyReduced: number;
  };
  uncertainty: {
    numerical: { energyResidual: number; heatModeReferenceError: 'verified-in-ci' };
    parameter: { status: 'uncalibrated' };
    modelForm: { status: 'toy-model-only' };
  };
  validityDomain: {
    status: 'in_domain' | 'out_of_domain';
    limits: typeof WORLD_DOMAIN;
  };
  provenance: {
    engine: 'lj-heat-reaction-operator-split';
    engineVersion: '0.2.0';
    seed: number;
    modelRoles: readonly ['solver', 'solver', 'closure'];
    fidelity: 'reduced-unit-demonstration';
  };
};

export type SerializedHeatField = {
  width: number;
  height: number;
  boxWidth: number;
  boxHeight: number;
  diffusivity: number;
  heatCapacity: number;
  minimumTemperatureReduced: number;
  values: number[];
};

export type SerializedThermochemicalWorld = {
  schemaVersion: 'tf.world/0.2';
  worldId: string;
  stateId: string;
  stateDigest: string;
  parentStateId: string | null;
  stateNamespace: string;
  revision: number;
  actionCount: number;
  branchCount: number;
  options: ResolvedWorldOptions;
  md: SerializedSimulation;
  field: SerializedHeatField;
  species: ParticleSpecies[];
  initialTotalEnergy: number;
  externalEnergy: number;
  initialMomentum: { x: number; y: number };
  reservoirMomentum: { x: number; y: number };
  cumulativeInterfaceEnergy: number;
  couplingCoverage: number;
  heatClosureResidual: number;
  exchangeClosureResidual: number;
  reactionClosureResidual: number;
  lastAction: WorldAction | null;
};

export const WORLD_DOMAIN = Object.freeze({
  minimumActionTemperatureKelvin: 45,
  maximumActionTemperatureKelvin: 180,
  minimumResolvedTemperatureKelvin: 20,
  maximumResolvedTemperatureKelvin: 260,
  maximumRelativeEnergyResidual: 0.002,
  maximumMomentumResidual: 1e-8,
  maximumPulseKelvin: 80,
  maximumSubstepsPerAction: 10_000,
} as const);

const DEFAULTS: ResolvedWorldOptions = {
  count: 96,
  density: 0.84,
  temperatureKelvin: 92,
  timeStep: 0.002,
  cutoff: 2.5,
  seed: 20260828,
  gridWidth: 6,
  gridHeight: 4,
  thermalDiffusivity: 0.18,
  fieldHeatCapacity: 4,
  couplingTau: 0.18,
  reactionPreexponential: 2.4,
  reactionActivationReduced: 2.1,
  reactionHeatReduced: 0.015,
};

export class WorldDomainError extends Error {
  readonly code = 'TF_OUT_OF_DOMAIN';
  readonly details: Readonly<Record<string, number | string>>;

  constructor(message: string, details: Record<string, number | string>) {
    super(message);
    this.name = 'WorldDomainError';
    this.details = details;
  }
}

export class PeriodicHeatField {
  readonly width: number;
  readonly height: number;
  readonly boxWidth: number;
  readonly boxHeight: number;
  readonly diffusivity: number;
  readonly heatCapacity: number;
  readonly minimumTemperatureReduced: number;
  private values: Float64Array<ArrayBuffer>;

  constructor({
    width,
    height,
    boxWidth,
    boxHeight,
    diffusivity,
    heatCapacity,
    initialTemperatureReduced,
    minimumTemperatureReduced = WORLD_DOMAIN.minimumResolvedTemperatureKelvin / ARGON_UNITS.epsilonOverKelvin,
  }: {
    width: number;
    height: number;
    boxWidth: number;
    boxHeight: number;
    diffusivity: number;
    heatCapacity: number;
    initialTemperatureReduced: number;
    minimumTemperatureReduced?: number;
  }) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) throw new Error('heat field dimensions must be integers >= 2');
    if (![boxWidth, boxHeight, diffusivity, heatCapacity, initialTemperatureReduced, minimumTemperatureReduced].every(Number.isFinite)) throw new Error('heat field coefficients must be finite');
    if (!(boxWidth > 0 && boxHeight > 0 && diffusivity >= 0 && heatCapacity > 0 && minimumTemperatureReduced > 0)) throw new Error('invalid heat field coefficients');
    if (!(initialTemperatureReduced >= minimumTemperatureReduced)) throw new Error('initial heat-field temperature is below its admissible floor');
    this.width = width;
    this.height = height;
    this.boxWidth = boxWidth;
    this.boxHeight = boxHeight;
    this.diffusivity = diffusivity;
    this.heatCapacity = heatCapacity;
    this.minimumTemperatureReduced = minimumTemperatureReduced;
    this.values = new Float64Array(width * height).fill(initialTemperatureReduced);
  }

  get cellCount() { return this.values.length; }

  getCellTemperatureReduced(x: number, y: number) {
    return this.values[this.index(x, y)];
  }

  setCellTemperatureReduced(x: number, y: number, value: number) {
    if (!Number.isFinite(value) || value < this.minimumTemperatureReduced) throw new Error('invalid cell temperature');
    this.values[this.index(x, y)] = value;
  }

  temperatureReducedAtPosition(x: number, y: number) {
    return this.values[this.positionIndex(x, y)];
  }

  cellIndexAtPosition(x: number, y: number) {
    return this.positionIndex(x, y);
  }

  availableEnergyAtPosition(x: number, y: number) {
    const index = this.positionIndex(x, y);
    return Math.max(0, (this.values[index] - this.minimumTemperatureReduced) * this.heatCapacity);
  }

  addEnergyAtPosition(x: number, y: number, energyReduced: number) {
    const index = this.positionIndex(x, y);
    this.addEnergyAtIndex(index, energyReduced);
  }

  addEnergyAtIndex(index: number, energyReduced: number) {
    if (!Number.isFinite(energyReduced)) throw new Error('heat exchange must be finite');
    const next = this.values[index] + energyReduced / this.heatCapacity;
    if (next < this.minimumTemperatureReduced - 1e-12) throw new Error('heat exchange would make field temperature nonphysical');
    this.values[index] = Math.max(next, this.minimumTemperatureReduced);
  }

  setUniformTemperatureReduced(temperatureReduced: number) {
    if (!Number.isFinite(temperatureReduced) || temperatureReduced < this.minimumTemperatureReduced) throw new Error('invalid uniform field temperature');
    const before = this.totalEnergyReduced();
    this.values.fill(temperatureReduced);
    return this.totalEnergyReduced() - before;
  }

  addGaussianPulse(xFraction: number, yFraction: number, energyReduced: number, widthFraction = 0.12) {
    if (!(xFraction >= 0 && xFraction <= 1 && yFraction >= 0 && yFraction <= 1)) throw new Error('pulse position must be normalized');
    if (!(energyReduced >= 0) || !Number.isFinite(energyReduced)) throw new Error('pulse energy must be finite and non-negative');
    if (!(widthFraction > 0 && widthFraction <= 0.5)) throw new Error('pulse width must be in (0, 0.5]');
    const weights = new Float64Array(this.values.length);
    let totalWeight = 0;
    for (let y = 0; y < this.height; y += 1) {
      for (let x = 0; x < this.width; x += 1) {
        const fx = (x + 0.5) / this.width;
        const fy = (y + 0.5) / this.height;
        const dx = minimumPeriodicFraction(fx - xFraction);
        const dy = minimumPeriodicFraction(fy - yFraction);
        const weight = Math.exp(-(dx * dx + dy * dy) / (2 * widthFraction * widthFraction));
        const index = y * this.width + x;
        weights[index] = weight;
        totalWeight += weight;
      }
    }
    for (let index = 0; index < this.values.length; index += 1) this.addEnergyAtIndex(index, energyReduced * weights[index] / totalWeight);
    return energyReduced;
  }

  advance(durationReduced: number) {
    if (!(durationReduced > 0) || !Number.isFinite(durationReduced)) throw new Error('heat-field duration must be positive and finite');
    if (this.diffusivity === 0) return 0;
    const dx = this.boxWidth / this.width;
    const dy = this.boxHeight / this.height;
    const fullStability = this.diffusivity * durationReduced * (1 / (dx * dx) + 1 / (dy * dy));
    const substeps = Math.max(1, Math.ceil(fullStability / 0.45));
    const dt = durationReduced / substeps;
    const coefficientX = this.diffusivity * dt / (dx * dx);
    const coefficientY = this.diffusivity * dt / (dy * dy);
    let next = new Float64Array(this.values.length);

    for (let substep = 0; substep < substeps; substep += 1) {
      for (let y = 0; y < this.height; y += 1) {
        for (let x = 0; x < this.width; x += 1) {
          const center = this.values[this.index(x, y)];
          const laplacianX = this.values[this.index(x - 1, y)] + this.values[this.index(x + 1, y)] - 2 * center;
          const laplacianY = this.values[this.index(x, y - 1)] + this.values[this.index(x, y + 1)] - 2 * center;
          next[y * this.width + x] = center + coefficientX * laplacianX + coefficientY * laplacianY;
        }
      }
      const previous = this.values;
      this.values = next;
      next = previous;
    }
    return substeps;
  }

  totalEnergyReduced() {
    let sum = 0;
    for (const value of this.values) sum += value;
    return sum * this.heatCapacity;
  }

  statistics() {
    let sum = 0;
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    for (const value of this.values) {
      sum += value;
      minimum = Math.min(minimum, value);
      maximum = Math.max(maximum, value);
    }
    return { mean: sum / this.values.length, minimum, maximum };
  }

  valuesReduced() { return Array.from(this.values); }

  serialize(): SerializedHeatField {
    return {
      width: this.width,
      height: this.height,
      boxWidth: this.boxWidth,
      boxHeight: this.boxHeight,
      diffusivity: this.diffusivity,
      heatCapacity: this.heatCapacity,
      minimumTemperatureReduced: this.minimumTemperatureReduced,
      values: Array.from(this.values),
    };
  }

  static fromSerialized(state: SerializedHeatField) {
    const field = new PeriodicHeatField({
      width: state.width,
      height: state.height,
      boxWidth: state.boxWidth,
      boxHeight: state.boxHeight,
      diffusivity: state.diffusivity,
      heatCapacity: state.heatCapacity,
      initialTemperatureReduced: state.values[0],
      minimumTemperatureReduced: state.minimumTemperatureReduced,
    });
    if (state.values.length !== field.values.length) throw new Error('serialized heat-field size mismatch');
    state.values.forEach((value, index) => {
      if (!Number.isFinite(value) || value < field.minimumTemperatureReduced) throw new Error('serialized heat field contains an invalid temperature');
      field.values[index] = value;
    });
    return field;
  }

  private positionIndex(x: number, y: number) {
    const cellX = Math.floor(wrap(x, this.boxWidth) / this.boxWidth * this.width);
    const cellY = Math.floor(wrap(y, this.boxHeight) / this.boxHeight * this.height);
    return this.index(cellX, cellY);
  }

  private index(x: number, y: number) {
    const wrappedX = ((x % this.width) + this.width) % this.width;
    const wrappedY = ((y % this.height) + this.height) % this.height;
    return wrappedY * this.width + wrappedX;
  }
}

export class ThermochemicalWorld {
  readonly options: ResolvedWorldOptions;
  private md: LennardJonesSimulation;
  private field: PeriodicHeatField;
  private species: ParticleSpecies[];
  private _worldId: string;
  private _stateId: string;
  private _parentStateId: string | null = null;
  private stateNamespace: string;
  private revision = 0;
  private actionCount = 0;
  private branchCount = 0;
  private initialTotalEnergy: number;
  private externalEnergy = 0;
  private initialMomentum: { x: number; y: number };
  private reservoirMomentum = { x: 0, y: 0 };
  private cumulativeInterfaceEnergy = 0;
  private couplingCoverage = 0;
  private heatClosureResidual = 0;
  private exchangeClosureResidual = 0;
  private reactionClosureResidual = 0;
  private lastAction: WorldAction | null = null;

  constructor(options: ThermochemicalWorldOptions = {}) {
    this.options = Object.freeze({ ...DEFAULTS, ...options });
    this.validateOptions();
    this.md = new LennardJonesSimulation({
      count: this.options.count,
      density: this.options.density,
      temperatureKelvin: this.options.temperatureKelvin,
      timeStep: this.options.timeStep,
      cutoff: this.options.cutoff,
      thermostatTau: null,
      seed: this.options.seed,
    });
    this.field = new PeriodicHeatField({
      width: this.options.gridWidth,
      height: this.options.gridHeight,
      boxWidth: this.md.box.width,
      boxHeight: this.md.box.height,
      diffusivity: this.options.thermalDiffusivity,
      heatCapacity: this.options.fieldHeatCapacity,
      initialTemperatureReduced: this.options.temperatureKelvin / ARGON_UNITS.epsilonOverKelvin,
    });
    this.species = new Array<ParticleSpecies>(this.options.count).fill('A');
    this._worldId = `tfw-${this.options.seed.toString(36)}-${worldOptionsFingerprint(this.options)}`;
    this.stateNamespace = this._worldId;
    this._stateId = worldStateId(this.stateNamespace, 0, 0, 'initial');
    this.initialMomentum = this.particleMomentum();
    this.initialTotalEnergy = this.totalTrackedEnergy();
  }

  get stepCount() { return this.md.stepCount; }
  get stateId() { return this._stateId; }
  get worldId() { return this._worldId; }

  advance(substeps = 1) {
    if (!Number.isInteger(substeps) || substeps < 1 || substeps > WORLD_DOMAIN.maximumSubstepsPerAction) {
      throw new WorldDomainError('step action is outside the supported horizon', { substeps, maximum: WORLD_DOMAIN.maximumSubstepsPerAction });
    }
    const parentStateId = this._stateId;
    const backup = this.serialize();
    try {
      for (let index = 0; index < substeps; index += 1) this.integrateOneStep();
      this.finalizeAction('step', parentStateId, { substeps });
    } catch (error) {
      this.restoreFromSerialized(backup);
      throw error;
    }
    return this.observe();
  }

  setFieldTemperatureKelvin(temperatureKelvin: number) {
    if (!(temperatureKelvin >= WORLD_DOMAIN.minimumActionTemperatureKelvin && temperatureKelvin <= WORLD_DOMAIN.maximumActionTemperatureKelvin)) {
      throw new WorldDomainError('temperature action is outside the validated demonstration domain', {
        temperatureKelvin,
        minimum: WORLD_DOMAIN.minimumActionTemperatureKelvin,
        maximum: WORLD_DOMAIN.maximumActionTemperatureKelvin,
      });
    }
    const parentStateId = this._stateId;
    const backup = this.serialize();
    try {
      const change = this.field.setUniformTemperatureReduced(temperatureKelvin / ARGON_UNITS.epsilonOverKelvin);
      this.externalEnergy += change;
      this.commitMutation(parentStateId, `field-temperature:${temperatureKelvin}`);
      this.finalizeAction('set_field_temperature', parentStateId, { temperatureKelvin, externalEnergyReduced: change });
      this.assertAdmissibleState();
    } catch (error) {
      this.restoreFromSerialized(backup);
      throw error;
    }
    return this.observe();
  }

  injectCentralHeatPulse(deltaKelvin = 45) {
    if (!(deltaKelvin > 0 && deltaKelvin <= WORLD_DOMAIN.maximumPulseKelvin)) {
      throw new WorldDomainError('heat pulse is outside the validated demonstration domain', {
        deltaKelvin,
        maximum: WORLD_DOMAIN.maximumPulseKelvin,
      });
    }
    const parentStateId = this._stateId;
    const backup = this.serialize();
    try {
      const affectedCellEquivalent = 9;
      const energy = deltaKelvin / ARGON_UNITS.epsilonOverKelvin * this.options.fieldHeatCapacity * affectedCellEquivalent;
      this.field.addGaussianPulse(0.52, 0.48, energy);
      this.externalEnergy += energy;
      this.commitMutation(parentStateId, `heat-pulse:${deltaKelvin}`);
      this.finalizeAction('inject_heat_pulse', parentStateId, { deltaKelvin, externalEnergyReduced: energy });
      this.assertAdmissibleState();
    } catch (error) {
      this.restoreFromSerialized(backup);
      throw error;
    }
    return this.observe();
  }

  clone(branchOrdinal: number) {
    if (!Number.isSafeInteger(branchOrdinal) || branchOrdinal < 1) throw new Error('branch ordinal must be a positive safe integer');
    const parentStateId = this._stateId;
    const clone = ThermochemicalWorld.fromSerialized(this.serialize());
    clone.branchCount = this.branchCount + 1;
    clone.stateNamespace = `${this.stateNamespace}-b${branchOrdinal.toString(36)}`;
    clone.finalizeAction('branch', parentStateId, { fromStep: clone.stepCount, branchOrdinal });
    return clone;
  }

  observe(): ThermochemicalSnapshot {
    const md = this.md.observe();
    const fieldStats = this.field.statistics();
    const reactionCount = this.species.reduce((sum, species) => sum + Number(species === 'B'), 0);
    const ledger = this.energyLedger(md.metrics.totalEnergyPerParticle * this.options.count, reactionCount);
    const momentum = this.particleMomentum();
    const momentumResidualX = momentum.x + this.reservoirMomentum.x - this.initialMomentum.x;
    const momentumResidualY = momentum.y + this.reservoirMomentum.y - this.initialMomentum.y;
    const momentumResidual = Math.hypot(momentumResidualX, momentumResidualY);
    const minKelvin = fieldStats.minimum * ARGON_UNITS.epsilonOverKelvin;
    const maxKelvin = fieldStats.maximum * ARGON_UNITS.epsilonOverKelvin;
    const inDomain = minKelvin >= WORLD_DOMAIN.minimumResolvedTemperatureKelvin - 1e-9
      && maxKelvin <= WORLD_DOMAIN.maximumResolvedTemperatureKelvin + 1e-9
      && (this.stepCount === 0 || this.couplingCoverage >= 0.9)
      && Math.abs(ledger.relativeResidual) <= WORLD_DOMAIN.maximumRelativeEnergyResidual
      && momentumResidual <= WORLD_DOMAIN.maximumMomentumResidual;

    return {
      schemaVersion: 'tf.observation/0.2',
      worldId: this._worldId,
      stateId: this._stateId,
      stateDigest: this.stateDigest(),
      parentStateId: this._parentStateId,
      step: md.step,
      timeReduced: md.timeReduced,
      timePicoseconds: md.timePicoseconds,
      lastAction: copyAction(this.lastAction),
      box: md.box,
      particles: md.particles.map((particle, index) => ({ ...particle, species: this.species[index] })),
      field: {
        width: this.field.width,
        height: this.field.height,
        valuesKelvin: this.field.valuesReduced().map((value) => value * ARGON_UNITS.epsilonOverKelvin),
        meanKelvin: fieldStats.mean * ARGON_UNITS.epsilonOverKelvin,
        minKelvin,
        maxKelvin,
        unit: 'kelvin',
        model: 'periodic-fourier-heat-2d',
      },
      metrics: {
        particleTemperatureKelvin: md.metrics.temperatureKelvin,
        fieldTemperatureKelvin: fieldStats.mean * ARGON_UNITS.epsilonOverKelvin,
        kineticEnergyPerParticle: md.metrics.kineticEnergyPerParticle,
        potentialEnergyPerParticle: md.metrics.potentialEnergyPerParticle,
        pressureReduced: md.metrics.pressureReduced,
        coordinationNumber: md.metrics.coordinationNumber,
        meanSquaredDisplacement: md.metrics.meanSquaredDisplacement,
        conversionFraction: reactionCount / this.options.count,
        reactionCount,
        cumulativeInterfaceEnergyReduced: this.cumulativeInterfaceEnergy,
        couplingCoverage: this.couplingCoverage,
      },
      conservation: {
        particleCount: this.options.count,
        speciesResidual: this.species.length - this.options.count,
        massResidual: md.particles.length - this.options.count,
        energyResidualReduced: ledger.residual,
        relativeEnergyResidual: ledger.relativeResidual,
        momentumResidual,
        heatClosureResidual: this.heatClosureResidual,
        exchangeClosureResidual: this.exchangeClosureResidual,
        reactionClosureResidual: this.reactionClosureResidual,
        externalEnergyReduced: this.externalEnergy,
        mdEnergyReduced: ledger.md,
        fieldEnergyReduced: ledger.field,
        chemicalEnergyReduced: ledger.chemical,
      },
      uncertainty: {
        numerical: { energyResidual: Math.abs(ledger.relativeResidual), heatModeReferenceError: 'verified-in-ci' },
        parameter: { status: 'uncalibrated' },
        modelForm: { status: 'toy-model-only' },
      },
      validityDomain: { status: inDomain ? 'in_domain' : 'out_of_domain', limits: WORLD_DOMAIN },
      provenance: {
        engine: 'lj-heat-reaction-operator-split',
        engineVersion: '0.2.0',
        seed: this.options.seed,
        modelRoles: ['solver', 'solver', 'closure'],
        fidelity: 'reduced-unit-demonstration',
      },
    };
  }

  serialize(): SerializedThermochemicalWorld {
    return {
      schemaVersion: 'tf.world/0.2',
      worldId: this._worldId,
      stateId: this._stateId,
      stateDigest: this.stateDigest(),
      parentStateId: this._parentStateId,
      stateNamespace: this.stateNamespace,
      revision: this.revision,
      actionCount: this.actionCount,
      branchCount: this.branchCount,
      options: { ...this.options },
      md: this.md.serialize(),
      field: this.field.serialize(),
      species: [...this.species],
      initialTotalEnergy: this.initialTotalEnergy,
      externalEnergy: this.externalEnergy,
      initialMomentum: { ...this.initialMomentum },
      reservoirMomentum: { ...this.reservoirMomentum },
      cumulativeInterfaceEnergy: this.cumulativeInterfaceEnergy,
      couplingCoverage: this.couplingCoverage,
      heatClosureResidual: this.heatClosureResidual,
      exchangeClosureResidual: this.exchangeClosureResidual,
      reactionClosureResidual: this.reactionClosureResidual,
      lastAction: copyAction(this.lastAction),
    };
  }

  static fromSerialized(state: SerializedThermochemicalWorld) {
    if (state.schemaVersion !== 'tf.world/0.2') throw new Error('unsupported thermochemical world-state schema');
    const world = new ThermochemicalWorld(state.options);
    const expectedWorldId = `tfw-${world.options.seed.toString(36)}-${worldOptionsFingerprint(world.options)}`;
    if (state.worldId !== expectedWorldId) throw new Error('serialized world id does not match its configuration');
    if (!state.stateNamespace.match(new RegExp(`^${escapeRegExp(state.worldId)}(?:-b[0-9a-z]+)*$`))) throw new Error('serialized world namespace is invalid');
    if (!Number.isInteger(state.revision) || state.revision < 0 || !Number.isInteger(state.actionCount) || state.actionCount < 0 || !Number.isInteger(state.branchCount) || state.branchCount < 0) throw new Error('serialized world counters are invalid');
    if (state.species.length !== state.options.count || state.species.some((species) => species !== 'A' && species !== 'B')) throw new Error('serialized species state is invalid');
    world.md = LennardJonesSimulation.fromSerialized(state.md);
    world.field = PeriodicHeatField.fromSerialized(state.field);
    assertModuleMatchesWorld(state, world.md, world.field);
    world.species = [...state.species];
    world._worldId = state.worldId;
    world._stateId = state.stateId;
    world._parentStateId = state.parentStateId;
    world.stateNamespace = state.stateNamespace;
    world.revision = state.revision;
    world.actionCount = state.actionCount;
    world.branchCount = state.branchCount;
    world.initialTotalEnergy = state.initialTotalEnergy;
    world.externalEnergy = state.externalEnergy;
    world.initialMomentum = { ...state.initialMomentum };
    world.reservoirMomentum = { ...state.reservoirMomentum };
    world.cumulativeInterfaceEnergy = state.cumulativeInterfaceEnergy;
    world.couplingCoverage = state.couplingCoverage;
    world.heatClosureResidual = state.heatClosureResidual;
    world.exchangeClosureResidual = state.exchangeClosureResidual;
    world.reactionClosureResidual = state.reactionClosureResidual;
    world.lastAction = copyAction(state.lastAction);
    if (!isStateIdFor(state.stateId, state.stateNamespace, world.stepCount, state.revision)) throw new Error('serialized world-state identity is inconsistent');
    assertActionConsistency(world.lastAction, state, world.stepCount);
    if (world.stateDigest() !== state.stateDigest) throw new Error('serialized world-state digest mismatch');
    world.assertAdmissibleState();
    return world;
  }

  private integrateOneStep() {
    const parentStateId = this._stateId;
    const halfStep = this.options.timeStep / 2;
    const macroStep = this.md.stepCount + 1;
    this.advanceHeatField(halfStep);
    this.exchangeParticleFieldEnergy(halfStep);
    this.applyReactionKinetics(halfStep, macroStep, 0);
    this.md.advance(1);
    this.applyReactionKinetics(halfStep, macroStep, 1);
    this.exchangeParticleFieldEnergy(halfStep);
    this.advanceHeatField(halfStep);
    this.commitMutation(parentStateId, `integrate:${this.stepCount}`);
    this.assertAdmissibleState();
  }

  private advanceHeatField(duration: number) {
    const before = this.field.totalEnergyReduced();
    this.field.advance(duration);
    this.heatClosureResidual += Math.abs(this.field.totalEnergyReduced() - before);
  }

  private exchangeParticleFieldEnergy(duration: number) {
    const snapshot = this.md.observe();
    const bins = Array.from({ length: this.field.cellCount }, () => [] as number[]);
    snapshot.particles.forEach((particle, index) => bins[this.field.cellIndexAtPosition(particle.x, particle.y)].push(index));
    const coupledParticleCount = bins.reduce((sum, indices) => sum + (indices.length >= 2 ? indices.length : 0), 0);
    this.couplingCoverage = coupledParticleCount / snapshot.particles.length;
    const relaxation = 1 - Math.exp(-duration / this.options.couplingTau);
    const exchanges: Array<{ indices: number[]; energyReduced: number; cellIndex: number }> = [];

    bins.forEach((indices, cellIndex) => {
      if (indices.length < 2) return;
      const meanVx = indices.reduce((sum, index) => sum + snapshot.particles[index].vx, 0) / indices.length;
      const meanVy = indices.reduce((sum, index) => sum + snapshot.particles[index].vy, 0) / indices.length;
      const relativeKinetic = indices.reduce((sum, index) => {
        const particle = snapshot.particles[index];
        return sum + 0.5 * ((particle.vx - meanVx) ** 2 + (particle.vy - meanVy) ** 2);
      }, 0);
      if (relativeKinetic < 1e-14) return;
      const particleHeatCapacity = indices.length - 1;
      const particleTemperature = relativeKinetic / particleHeatCapacity;
      const fieldTemperature = this.field.getCellTemperatureReduced(cellIndex % this.field.width, Math.floor(cellIndex / this.field.width));
      const equilibriumTemperature = (particleHeatCapacity * particleTemperature + this.options.fieldHeatCapacity * fieldTemperature)
        / (particleHeatCapacity + this.options.fieldHeatCapacity);
      const nextParticleTemperature = equilibriumTemperature + (particleTemperature - equilibriumTemperature) * (1 - relaxation);
      let requestedEnergy = particleHeatCapacity * (nextParticleTemperature - particleTemperature);
      if (requestedEnergy > 0) {
        const representative = snapshot.particles[indices[0]];
        requestedEnergy = Math.min(requestedEnergy, this.field.availableEnergyAtPosition(representative.x, representative.y));
      }
      exchanges.push({ indices, energyReduced: requestedEnergy, cellIndex });
    });

    const applied = this.md.exchangeCellThermalEnergies(exchanges);
    applied.forEach((result, index) => {
      const cellIndex = exchanges[index].cellIndex;
      const fieldBefore = this.field.totalEnergyReduced();
      this.field.addEnergyAtIndex(cellIndex, -result.actualEnergyReduced);
      const fieldDelta = this.field.totalEnergyReduced() - fieldBefore;
      this.exchangeClosureResidual += Math.abs(result.actualEnergyReduced + fieldDelta);
      this.reservoirMomentum.x -= result.deltaPx;
      this.reservoirMomentum.y -= result.deltaPy;
      this.cumulativeInterfaceEnergy += Math.abs(result.actualEnergyReduced);
    });
  }

  private applyReactionKinetics(duration: number, macroStep: number, halfStage: number) {
    const snapshot = this.md.observe();
    const frozenTemperatures = this.field.valuesReduced();
    const events: Array<{ particleIndex: number; cellIndex: number }> = [];
    for (let index = 0; index < this.species.length; index += 1) {
      if (this.species[index] === 'B') continue;
      const particle = snapshot.particles[index];
      const cellIndex = this.field.cellIndexAtPosition(particle.x, particle.y);
      const temperature = frozenTemperatures[cellIndex];
      const rate = this.options.reactionPreexponential * Math.exp(-this.options.reactionActivationReduced / Math.max(temperature, 1e-12));
      if (rate * duration > 0.05) throw new WorldDomainError('reaction hazard exceeds the validated operator-split limit', { rateDuration: rate * duration, maximum: 0.05 });
      const probability = reactionProbability(rate, duration);
      if (counterRandom(this.options.seed, macroStep, index, 17 + halfStage) < probability) events.push({ particleIndex: index, cellIndex });
    }
    const eventsByCell = new Map<number, number>();
    for (const event of events) {
      this.species[event.particleIndex] = 'B';
      eventsByCell.set(event.cellIndex, (eventsByCell.get(event.cellIndex) ?? 0) + 1);
    }
    for (const [cellIndex, count] of eventsByCell) {
      const fieldBefore = this.field.totalEnergyReduced();
      const released = count * this.options.reactionHeatReduced;
      const cellEnergy = frozenTemperatures[cellIndex] * this.options.fieldHeatCapacity;
      if (released > cellEnergy * 0.02 + 1e-12) throw new WorldDomainError('reaction heat jump exceeds the validated cell-energy fraction', { released, cellEnergy, maximumFraction: 0.02 });
      this.field.addEnergyAtIndex(cellIndex, released);
      const fieldDelta = this.field.totalEnergyReduced() - fieldBefore;
      this.reactionClosureResidual += Math.abs(fieldDelta - released);
    }
  }

  private energyLedger(mdEnergy: number, reactionCount: number) {
    const fieldEnergy = this.field.totalEnergyReduced();
    const chemicalEnergy = (this.options.count - reactionCount) * this.options.reactionHeatReduced;
    const total = mdEnergy + fieldEnergy + chemicalEnergy;
    const target = this.initialTotalEnergy + this.externalEnergy;
    const residual = total - target;
    return {
      md: mdEnergy,
      field: fieldEnergy,
      chemical: chemicalEnergy,
      residual,
      relativeResidual: residual / Math.max(this.options.count, Math.abs(mdEnergy), Math.abs(this.externalEnergy), reactionCount * this.options.reactionHeatReduced, 1),
    };
  }

  private totalTrackedEnergy() {
    const md = this.md.observe();
    return md.metrics.totalEnergyPerParticle * this.options.count
      + this.field.totalEnergyReduced()
      + this.options.count * this.options.reactionHeatReduced;
  }

  private particleMomentum() {
    return this.md.observe().particles.reduce((sum, particle) => ({ x: sum.x + particle.vx, y: sum.y + particle.vy }), { x: 0, y: 0 });
  }

  private stateDigest() {
    return digestValue({
      schemaVersion: 'tf.world/0.2',
      worldId: this._worldId,
      stateId: this._stateId,
      parentStateId: this._parentStateId,
      stateNamespace: this.stateNamespace,
      revision: this.revision,
      actionCount: this.actionCount,
      branchCount: this.branchCount,
      step: this.stepCount,
      options: this.options,
      md: this.md.serialize(),
      field: this.field.serialize(),
      species: this.species,
      initialTotalEnergy: this.initialTotalEnergy,
      externalEnergy: this.externalEnergy,
      initialMomentum: this.initialMomentum,
      reservoirMomentum: this.reservoirMomentum,
      cumulativeInterfaceEnergy: this.cumulativeInterfaceEnergy,
      couplingCoverage: this.couplingCoverage,
      heatClosureResidual: this.heatClosureResidual,
      exchangeClosureResidual: this.exchangeClosureResidual,
      reactionClosureResidual: this.reactionClosureResidual,
      lastAction: this.lastAction,
    });
  }

  private restoreFromSerialized(state: SerializedThermochemicalWorld) {
    const restored = ThermochemicalWorld.fromSerialized(state);
    this.md = restored.md;
    this.field = restored.field;
    this.species = restored.species;
    this._worldId = restored._worldId;
    this._stateId = restored._stateId;
    this._parentStateId = restored._parentStateId;
    this.stateNamespace = restored.stateNamespace;
    this.revision = restored.revision;
    this.actionCount = restored.actionCount;
    this.branchCount = restored.branchCount;
    this.initialTotalEnergy = restored.initialTotalEnergy;
    this.externalEnergy = restored.externalEnergy;
    this.initialMomentum = restored.initialMomentum;
    this.reservoirMomentum = restored.reservoirMomentum;
    this.cumulativeInterfaceEnergy = restored.cumulativeInterfaceEnergy;
    this.couplingCoverage = restored.couplingCoverage;
    this.heatClosureResidual = restored.heatClosureResidual;
    this.exchangeClosureResidual = restored.exchangeClosureResidual;
    this.reactionClosureResidual = restored.reactionClosureResidual;
    this.lastAction = restored.lastAction;
  }

  private commitMutation(parentStateId: string, transition: string) {
    this._parentStateId = parentStateId;
    this.revision += 1;
    this._stateId = worldStateId(this.stateNamespace, this.stepCount, this.revision, `${parentStateId}|${transition}`);
  }

  private finalizeAction(kind: WorldAction['kind'], parentStateId: string, parameters: Record<string, number | string>) {
    const physicalStateId = this._stateId;
    this.actionCount += 1;
    this._parentStateId = parentStateId;
    this.revision += 1;
    this._stateId = worldStateId(this.stateNamespace, this.stepCount, this.revision, digestValue({
      physicalStateId,
      kind,
      parentStateId,
      parameters,
      actionCount: this.actionCount,
    }));
    const actionFingerprint = shortDigest({ kind, parentStateId, resultingStateId: this._stateId, appliedAtStep: this.stepCount, parameters });
    this.lastAction = Object.freeze({
      schemaVersion: 'tf.action/0.2',
      actionId: `${this.stateNamespace}-a${this.actionCount.toString(36).padStart(5, '0')}-${actionFingerprint}`,
      kind,
      parentStateId,
      resultingStateId: this._stateId,
      appliedAtStep: this.stepCount,
      parameters: Object.freeze({ ...parameters }),
    });
  }

  private validateOptions() {
    const numericOptions = Object.values(this.options);
    if (!numericOptions.every(Number.isFinite)) throw new Error('world options must be finite');
    if (!Number.isSafeInteger(this.options.seed)) throw new Error('seed must be a safe integer');
    if (!(this.options.temperatureKelvin >= WORLD_DOMAIN.minimumActionTemperatureKelvin && this.options.temperatureKelvin <= WORLD_DOMAIN.maximumActionTemperatureKelvin)) throw new Error('initial temperature is outside the world domain');
    if (!Number.isInteger(this.options.gridWidth) || !Number.isInteger(this.options.gridHeight) || this.options.gridWidth < 2 || this.options.gridHeight < 2) throw new Error('invalid thermochemical grid');
    if (!(this.options.thermalDiffusivity >= 0 && this.options.fieldHeatCapacity > 0 && this.options.couplingTau > 0)) throw new Error('invalid coupling coefficients');
    if (this.options.timeStep / (2 * this.options.couplingTau) > 0.1) throw new Error('coupling split exceeds the validated relaxation limit');
    if (!(this.options.reactionPreexponential >= 0 && this.options.reactionActivationReduced >= 0 && this.options.reactionHeatReduced >= 0)) throw new Error('invalid reaction coefficients');
  }

  private assertAdmissibleState() {
    const snapshot = this.observe();
    if (snapshot.particles.some((particle) => !Number.isFinite(particle.x + particle.y + particle.vx + particle.vy))) throw new Error('non-finite particle state');
    if (snapshot.field.valuesKelvin.some((value) => !Number.isFinite(value))) throw new Error('non-finite heat-field state');
    if (snapshot.field.minKelvin < WORLD_DOMAIN.minimumResolvedTemperatureKelvin - 1e-8 || snapshot.field.maxKelvin > WORLD_DOMAIN.maximumResolvedTemperatureKelvin + 1e-8) {
      throw new WorldDomainError('resolved temperature left the validated world domain', {
        minimumKelvin: snapshot.field.minKelvin,
        maximumKelvin: snapshot.field.maxKelvin,
      });
    }
    if (snapshot.step > 0 && snapshot.metrics.couplingCoverage < 0.9) throw new WorldDomainError('particle-field coupling coverage fell below the validated domain', { coverage: snapshot.metrics.couplingCoverage, minimum: 0.9 });
    if (Math.abs(snapshot.conservation.relativeEnergyResidual) > WORLD_DOMAIN.maximumRelativeEnergyResidual) {
      throw new WorldDomainError('relative energy residual exceeded the validated domain', {
        residual: snapshot.conservation.relativeEnergyResidual,
        maximum: WORLD_DOMAIN.maximumRelativeEnergyResidual,
      });
    }
    if (snapshot.conservation.momentumResidual > WORLD_DOMAIN.maximumMomentumResidual) {
      throw new WorldDomainError('momentum residual exceeded the validated domain', {
        residual: snapshot.conservation.momentumResidual,
        maximum: WORLD_DOMAIN.maximumMomentumResidual,
      });
    }
  }
}

export function reactionProbability(rate: number, duration: number) {
  if (!(rate >= 0) || !(duration >= 0) || !Number.isFinite(rate + duration)) throw new Error('reaction rate and duration must be finite and non-negative');
  return -Math.expm1(-rate * duration);
}

export function fourierModeRelativeL2Error({
  width = 64,
  height = 16,
  diffusivity = 0.01,
  duration = 0.35,
}: {
  width?: number;
  height?: number;
  diffusivity?: number;
  duration?: number;
} = {}) {
  const field = new PeriodicHeatField({
    width,
    height,
    boxWidth: 1,
    boxHeight: 1,
    diffusivity,
    heatCapacity: 1,
    initialTemperatureReduced: 1,
    minimumTemperatureReduced: 0.01,
  });
  const amplitude = 0.1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) field.setCellTemperatureReduced(x, y, 1 + amplitude * Math.sin(2 * Math.PI * (x + 0.5) / width));
  }
  const energyBefore = field.totalEnergyReduced();
  field.advance(duration);
  const decayedAmplitude = amplitude * Math.exp(-diffusivity * (2 * Math.PI) ** 2 * duration);
  let squaredError = 0;
  let squaredSignal = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const expected = 1 + decayedAmplitude * Math.sin(2 * Math.PI * (x + 0.5) / width);
      const difference = field.getCellTemperatureReduced(x, y) - expected;
      squaredError += difference * difference;
      squaredSignal += (expected - 1) ** 2;
    }
  }
  return {
    relativeL2Error: Math.sqrt(squaredError / squaredSignal),
    relativeEnergyResidual: (field.totalEnergyReduced() - energyBefore) / energyBefore,
  };
}

export function runThermochemicalVerification() {
  const heat = fourierModeRelativeL2Error();
  const first = new ThermochemicalWorld({ count: 64, density: 0.78, temperatureKelvin: 88, seed: 73, gridWidth: 5, gridHeight: 3 });
  const second = new ThermochemicalWorld({ count: 64, density: 0.78, temperatureKelvin: 88, seed: 73, gridWidth: 5, gridHeight: 3 });
  first.injectCentralHeatPulse(30);
  second.injectCentralHeatPulse(30);
  const firstSnapshot = first.advance(1_200);
  const secondSnapshot = second.advance(1_200);
  return {
    heatModeRelativeL2Error: heat.relativeL2Error,
    heatEnergyResidual: heat.relativeEnergyResidual,
    coupledEnergyResidual: Math.abs(firstSnapshot.conservation.relativeEnergyResidual),
    momentumResidual: firstSnapshot.conservation.momentumResidual,
    speciesResidual: firstSnapshot.conservation.speciesResidual,
    massResidual: firstSnapshot.conservation.massResidual,
    interfaceEnergyMoved: firstSnapshot.metrics.cumulativeInterfaceEnergyReduced,
    couplingCoverage: firstSnapshot.metrics.couplingCoverage,
    reactionCount: firstSnapshot.metrics.reactionCount,
    heatClosureResidual: firstSnapshot.conservation.heatClosureResidual,
    exchangeClosureResidual: firstSnapshot.conservation.exchangeClosureResidual,
    reactionClosureResidual: firstSnapshot.conservation.reactionClosureResidual,
    deterministicReplay: JSON.stringify(firstSnapshot) === JSON.stringify(secondSnapshot),
    inDomain: firstSnapshot.validityDomain.status === 'in_domain',
  };
}

function copyAction(action: WorldAction | null): WorldAction | null {
  if (!action) return null;
  return Object.freeze({ ...action, parameters: Object.freeze({ ...action.parameters }) });
}

function assertActionConsistency(action: WorldAction | null, state: SerializedThermochemicalWorld, step: number) {
  if (state.actionCount === 0) {
    if (action !== null) throw new Error('serialized world has an action without an action counter');
    return;
  }
  if (!action) throw new Error('serialized world action history is incomplete');
  if (action.schemaVersion !== 'tf.action/0.2' || !['step', 'set_field_temperature', 'inject_heat_pulse', 'branch'].includes(action.kind)) throw new Error('serialized world action kind is invalid');
  assertActionSemantics(action, state, step);
  const fingerprint = shortDigest({ kind: action.kind, parentStateId: action.parentStateId, resultingStateId: action.resultingStateId, appliedAtStep: action.appliedAtStep, parameters: action.parameters });
  const expectedActionId = `${state.stateNamespace}-a${state.actionCount.toString(36).padStart(5, '0')}-${fingerprint}`;
  if (action.actionId !== expectedActionId || action.resultingStateId !== state.stateId || action.appliedAtStep !== step || !action.parentStateId) throw new Error('serialized world action identity is inconsistent');
}

function assertActionSemantics(action: WorldAction, state: SerializedThermochemicalWorld, step: number) {
  if (!action.parameters || typeof action.parameters !== 'object' || Array.isArray(action.parameters)) throw new Error('serialized world action parameters are invalid');
  const parentStep = stateIdStep(action.parentStateId);
  if (parentStep === null) throw new Error('serialized world action parent identity is invalid');
  const parameters = action.parameters as Record<string, number | string>;
  switch (action.kind) {
    case 'step': {
      assertExactParameterKeys(parameters, ['substeps']);
      const substeps = parameters.substeps;
      if (typeof substeps !== 'number' || !Number.isSafeInteger(substeps) || !(substeps >= 1 && substeps <= WORLD_DOMAIN.maximumSubstepsPerAction)) throw new Error('serialized step action parameters are invalid');
      if (parentStep + substeps !== step) throw new Error('serialized step action does not match its state transition');
      break;
    }
    case 'set_field_temperature': {
      assertExactParameterKeys(parameters, ['temperatureKelvin', 'externalEnergyReduced']);
      const temperatureKelvin = parameters.temperatureKelvin;
      const externalEnergyReduced = parameters.externalEnergyReduced;
      if (!(typeof temperatureKelvin === 'number'
        && Number.isFinite(temperatureKelvin)
        && temperatureKelvin >= WORLD_DOMAIN.minimumActionTemperatureKelvin
        && temperatureKelvin <= WORLD_DOMAIN.maximumActionTemperatureKelvin
        && typeof externalEnergyReduced === 'number'
        && Number.isFinite(externalEnergyReduced))) throw new Error('serialized temperature action parameters are invalid');
      if (parentStep !== step) throw new Error('serialized temperature action does not match its state transition');
      const expectedReduced = temperatureKelvin / ARGON_UNITS.epsilonOverKelvin;
      if (state.field.values.some((value) => !nearlyEqual(value, expectedReduced))) throw new Error('serialized temperature action does not match the resulting heat field');
      break;
    }
    case 'inject_heat_pulse': {
      assertExactParameterKeys(parameters, ['deltaKelvin', 'externalEnergyReduced']);
      const deltaKelvin = parameters.deltaKelvin;
      const externalEnergyReduced = parameters.externalEnergyReduced;
      if (!(typeof deltaKelvin === 'number'
        && Number.isFinite(deltaKelvin)
        && deltaKelvin > 0
        && deltaKelvin <= WORLD_DOMAIN.maximumPulseKelvin
        && typeof externalEnergyReduced === 'number'
        && Number.isFinite(externalEnergyReduced)
        && externalEnergyReduced > 0)) throw new Error('serialized heat-pulse action parameters are invalid');
      if (parentStep !== step) throw new Error('serialized heat-pulse action does not match its state transition');
      const expectedEnergy = deltaKelvin / ARGON_UNITS.epsilonOverKelvin * state.options.fieldHeatCapacity * 9;
      if (!nearlyEqual(externalEnergyReduced, expectedEnergy)) throw new Error('serialized heat-pulse action energy is inconsistent');
      break;
    }
    case 'branch': {
      assertExactParameterKeys(parameters, ['fromStep', 'branchOrdinal']);
      const fromStep = parameters.fromStep;
      const branchOrdinal = parameters.branchOrdinal;
      if (typeof fromStep !== 'number' || !Number.isSafeInteger(fromStep) || fromStep !== step || typeof branchOrdinal !== 'number' || !Number.isSafeInteger(branchOrdinal) || branchOrdinal < 1) throw new Error('serialized branch action parameters are invalid');
      if (parentStep !== step) throw new Error('serialized branch action does not match its state transition');
      if (!state.stateNamespace.endsWith(`-b${branchOrdinal.toString(36)}`)) throw new Error('serialized branch action does not match its namespace');
      break;
    }
  }
}

function assertExactParameterKeys(parameters: Record<string, number | string>, expected: string[]) {
  const keys = Object.keys(parameters).sort();
  const sortedExpected = [...expected].sort();
  if (keys.length !== sortedExpected.length || keys.some((key, index) => key !== sortedExpected[index])) throw new Error('serialized world action parameters are not exact for its kind');
}

function stateIdStep(stateId: string) {
  const match = stateId.match(/-s([0-9a-z]{6,})r[0-9a-z]{4,}-[0-9a-f]{16}$/);
  if (!match) return null;
  const step = Number.parseInt(match[1], 36);
  return Number.isSafeInteger(step) ? step : null;
}

function assertModuleMatchesWorld(state: SerializedThermochemicalWorld, md: LennardJonesSimulation, field: PeriodicHeatField) {
  const expectedModuleOptions = {
    count: state.options.count,
    density: state.options.density,
    temperatureKelvin: state.options.temperatureKelvin,
    timeStep: state.options.timeStep,
    cutoff: state.options.cutoff,
    thermostatTau: null,
    seed: state.options.seed,
  } as const;
  for (const [key, expected] of Object.entries(expectedModuleOptions)) {
    if (md.options[key as keyof typeof expectedModuleOptions] !== expected) throw new Error(`module option ${key} does not match world configuration`);
  }
  const fieldMatches = field.width === state.options.gridWidth
    && field.height === state.options.gridHeight
    && field.diffusivity === state.options.thermalDiffusivity
    && field.heatCapacity === state.options.fieldHeatCapacity
    && nearlyEqual(field.boxWidth, md.box.width)
    && nearlyEqual(field.boxHeight, md.box.height)
    && nearlyEqual(field.minimumTemperatureReduced, WORLD_DOMAIN.minimumResolvedTemperatureKelvin / ARGON_UNITS.epsilonOverKelvin);
  if (!fieldMatches) throw new Error('heat-field configuration does not match world configuration');

  const finiteMetadata = [
    state.initialTotalEnergy,
    state.externalEnergy,
    state.initialMomentum.x,
    state.initialMomentum.y,
    state.reservoirMomentum.x,
    state.reservoirMomentum.y,
    state.cumulativeInterfaceEnergy,
    state.couplingCoverage,
    state.heatClosureResidual,
    state.exchangeClosureResidual,
    state.reactionClosureResidual,
  ].every(Number.isFinite);
  if (!finiteMetadata) throw new Error('serialized world metadata must be finite');
  if (state.cumulativeInterfaceEnergy < 0 || state.couplingCoverage < 0 || state.couplingCoverage > 1 || state.heatClosureResidual < 0 || state.exchangeClosureResidual < 0 || state.reactionClosureResidual < 0) throw new Error('serialized world diagnostics are invalid');
}

function worldOptionsFingerprint(options: ResolvedWorldOptions) {
  return digestValue([
    options.count,
    options.density,
    options.temperatureKelvin,
    options.timeStep,
    options.cutoff,
    options.seed,
    options.gridWidth,
    options.gridHeight,
    options.thermalDiffusivity,
    options.fieldHeatCapacity,
    options.couplingTau,
    options.reactionPreexponential,
    options.reactionActivationReduced,
    options.reactionHeatReduced,
  ]).slice('fnv64:'.length);
}

function nearlyEqual(first: number, second: number) {
  return Math.abs(first - second) <= Number.EPSILON * 8 * Math.max(1, Math.abs(first), Math.abs(second));
}

function escapeRegExp(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

function worldStateId(namespace: string, step: number, revision: number, transition: string) {
  return `${namespace}-s${step.toString(36).padStart(6, '0')}r${revision.toString(36).padStart(4, '0')}-${shortDigest(transition)}`;
}

function isStateIdFor(candidate: string, namespace: string, step: number, revision: number) {
  const prefix = `${namespace}-s${step.toString(36).padStart(6, '0')}r${revision.toString(36).padStart(4, '0')}-`;
  return new RegExp(`^${escapeRegExp(prefix)}[0-9a-f]{16}$`).test(candidate);
}

function counterRandom(seed: number, step: number, index: number, channel: number) {
  let value = seed ^ Math.imul(step + 1, 0x9e3779b1) ^ Math.imul(index + 1, 0x85ebca6b) ^ Math.imul(channel + 1, 0xc2b2ae35);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x1_0000_0000;
}

function minimumPeriodicFraction(value: number) { return value - Math.round(value); }
function wrap(value: number, extent: number) { return ((value % extent) + extent) % extent; }

function digestValue(value: unknown) {
  const source = JSON.stringify(value);
  let first = 2166136261;
  let second = 2246822519;
  for (let index = 0; index < source.length; index += 1) {
    const code = source.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second ^ code, 3266489917);
  }
  return `fnv64:${(first >>> 0).toString(16).padStart(8, '0')}${(second >>> 0).toString(16).padStart(8, '0')}`;
}

function shortDigest(value: unknown) { return digestValue(value).slice('fnv64:'.length); }
