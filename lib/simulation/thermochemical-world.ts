import {
  ARGON_UNITS,
  LennardJonesSimulation,
  type SerializedSimulation,
} from './lennard-jones.ts';
import { digestValue, shortDigest } from './digest.ts';

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
  fieldHeatCapacityDensity?: number;
  couplingTau?: number;
  reactionPreexponential?: number;
  reactionActivationReduced?: number;
  reactionHeatReduced?: number;
};

type ResolvedWorldOptions = Readonly<Required<ThermochemicalWorldOptions>>;

export type WorldAction = {
  schemaVersion: 'tf.action/0.3';
  actionId: string;
  kind: 'step' | 'set_field_temperature' | 'inject_heat_pulse' | 'branch';
  parentStateId: string;
  resultingStateId: string;
  appliedAtStep: number;
  parameters: Readonly<Record<string, number | string>>;
};

export type ThermochemicalSnapshot = {
  schemaVersion: 'tf.observation/0.3';
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
    minimumCouplingCoverage: number;
  };
  conservation: {
    particleCount: number;
    speciesResidual: number;
    massResidual: number;
    energyResidualReduced: number;
    relativeEnergyResidual: number;
    momentumResidual: number;
    rawParticleMomentumResidual: number;
    heatClosureResidual: number;
    exchangeClosureResidual: number;
    reactionClosureResidual: number;
    heatClosureMaximum: number;
    exchangeClosureMaximum: number;
    reactionClosureMaximum: number;
    closureReferenceEnergy: number;
    heatClosureRelative: number;
    exchangeClosureRelative: number;
    reactionClosureRelative: number;
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
    engineVersion: '0.3.0';
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
  heatCapacityDensity: number;
  minimumTemperatureReduced: number;
  values: number[];
};

export type SerializedThermochemicalWorld = {
  schemaVersion: 'tf.world/0.3';
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
  initialClosureReferenceEnergy: number;
  externalEnergy: number;
  initialMomentum: { x: number; y: number };
  reservoirMomentum: { x: number; y: number };
  cumulativeInterfaceEnergy: number;
  couplingCoverage: number;
  minimumCouplingCoverage: number;
  heatClosureResidual: number;
  exchangeClosureResidual: number;
  reactionClosureResidual: number;
  heatClosureMaximum: number;
  exchangeClosureMaximum: number;
  reactionClosureMaximum: number;
  lastAction: WorldAction | null;
};

export const WORLD_DOMAIN = Object.freeze({
  minimumParticleCount: 64,
  maximumParticleCount: 256,
  minimumSeed: 0,
  maximumSeed: 0xffff_ffff,
  minimumDensityReduced: 0.7,
  maximumDensityReduced: 0.95,
  minimumInitialTemperatureKelvin: 60,
  maximumInitialTemperatureKelvin: 140,
  minimumActionTemperatureKelvin: 45,
  maximumActionTemperatureKelvin: 180,
  minimumResolvedTemperatureKelvin: 20,
  maximumResolvedTemperatureKelvin: 260,
  minimumTimeStepReduced: 0.001,
  maximumTimeStepReduced: 0.004,
  minimumCutoffReduced: 2.2,
  maximumCutoffReduced: 2.8,
  minimumGridDimension: 2,
  maximumGridDimension: 32,
  maximumGridCells: 64,
  maximumGridCellsPerParticle: 0.25,
  maximumCellAspectRatio: 2,
  maximumPairEvaluationsPerAction: 50_000_000,
  maximumHeatCellUpdatesPerAction: 50_000_000,
  maximumReactionTrialsPerAction: 5_000_000,
  maximumTotalSteps: 10_000,
  maximumActionCount: 10_000,
  maximumBranchDepth: 8,
  minimumThermalDiffusivityReduced: 0,
  maximumThermalDiffusivityReduced: 0.5,
  minimumHeatCapacityDensityReduced: 0.25,
  maximumHeatCapacityDensityReduced: 4,
  minimumCouplingTauReduced: 0.05,
  maximumCouplingTauReduced: 1,
  maximumCouplingSplitRatio: 0.04,
  maximumReactionHazardPerHalfStep: 0.02,
  maximumReactionPreexponentialReduced: 5,
  maximumReactionActivationReduced: 8,
  maximumReactionHeatReduced: 0.05,
  maximumReactionCellEnergyFraction: 0.02,
  maximumMdCoolingFraction: 0.95,
  minimumCouplingCoverage: 0.9,
  minimumRelativeKineticReduced: 1e-14,
  maximumRelativeEnergyResidual: 0.002,
  maximumMomentumResidual: 1e-10,
  maximumOperatorClosureRelative: 1e-12,
  maximumCumulativeClosureRelative: 1e-10,
  maximumPulseKelvin: 80,
  maximumSubstepsPerAction: 10_000,
  maximumHeatSubcyclesPerOperator: 512,
} as const);

export const CENTRAL_PULSE_AREA_FRACTION = 3 / 8;
export const CENTRAL_PULSE_PROFILE = Object.freeze({
  xFraction: 0.52,
  yFraction: 0.48,
  widthFraction: 0.12,
  profileVersion: 'periodic-gaussian-area-v1',
} as const);

export const THERMOCHEMICAL_VERIFICATION_PROFILES = Object.freeze({
  unit: Object.freeze({ seeds: Object.freeze([73, 97, 131]), horizonSteps: 1_200 }),
  pr: Object.freeze({ seeds: Object.freeze([73, 97, 131, 163, 197, 229, 263, 307]), horizonSteps: 5_000 }),
  promotion: Object.freeze({
    seeds: Object.freeze([
      73, 97, 131, 163, 197, 229, 263, 307,
      347, 389, 431, 479, 521, 569, 613, 659,
      709, 761, 811, 863, 919, 977, 1_031, 1_087,
      1_151, 1_213, 1_279, 1_351, 1_423, 1_493, 1_567, 1_657,
    ]),
    horizonSteps: 10_000,
  }),
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
  fieldHeatCapacityDensity: 0.84,
  couplingTau: 0.18,
  reactionPreexponential: 2.4,
  reactionActivationReduced: 2.1,
  reactionHeatReduced: 0.013,
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

export function twoReservoirExchange({
  particleTemperature,
  particleHeatCapacity,
  fieldTemperature,
  fieldHeatCapacity,
  durationReduced,
  couplingTauReduced,
}: {
  particleTemperature: number;
  particleHeatCapacity: number;
  fieldTemperature: number;
  fieldHeatCapacity: number;
  durationReduced: number;
  couplingTauReduced: number;
}) {
  const inputs = [particleTemperature, particleHeatCapacity, fieldTemperature, fieldHeatCapacity, durationReduced, couplingTauReduced];
  if (!inputs.every(Number.isFinite)) throw new Error('two-reservoir exchange inputs must be finite');
  if (!(particleTemperature >= 0 && fieldTemperature >= 0 && particleHeatCapacity > 0 && fieldHeatCapacity > 0 && durationReduced >= 0 && couplingTauReduced > 0)) {
    throw new Error('two-reservoir exchange inputs are outside the physical domain');
  }
  const equilibriumTemperature = (particleHeatCapacity * particleTemperature + fieldHeatCapacity * fieldTemperature)
    / (particleHeatCapacity + fieldHeatCapacity);
  const decay = Math.exp(-durationReduced / couplingTauReduced);
  const oneMinusDecay = -Math.expm1(-durationReduced / couplingTauReduced);
  const reducedHeatCapacity = particleHeatCapacity * fieldHeatCapacity / (particleHeatCapacity + fieldHeatCapacity);
  const particleEnergyDelta = -reducedHeatCapacity * (particleTemperature - fieldTemperature) * oneMinusDecay;
  const nextParticleTemperature = particleTemperature + particleEnergyDelta / particleHeatCapacity;
  const nextFieldTemperature = fieldTemperature - particleEnergyDelta / fieldHeatCapacity;
  const energyBefore = particleHeatCapacity * particleTemperature + fieldHeatCapacity * fieldTemperature;
  const energyAfter = particleHeatCapacity * nextParticleTemperature + fieldHeatCapacity * nextFieldTemperature;
  return {
    equilibriumTemperature,
    nextParticleTemperature,
    nextFieldTemperature,
    particleEnergyDelta,
    temperatureDifferenceRatio: particleTemperature === fieldTemperature
      ? 0
      : decay,
    energyClosureResidual: energyAfter - energyBefore,
  };
}

export class PeriodicHeatField {
  readonly width: number;
  readonly height: number;
  readonly boxWidth: number;
  readonly boxHeight: number;
  readonly diffusivity: number;
  readonly heatCapacityDensity: number;
  readonly minimumTemperatureReduced: number;
  private values: Float64Array<ArrayBuffer>;

  constructor({
    width,
    height,
    boxWidth,
    boxHeight,
    diffusivity,
    heatCapacityDensity,
    initialTemperatureReduced,
    minimumTemperatureReduced = WORLD_DOMAIN.minimumResolvedTemperatureKelvin / ARGON_UNITS.epsilonOverKelvin,
  }: {
    width: number;
    height: number;
    boxWidth: number;
    boxHeight: number;
    diffusivity: number;
    heatCapacityDensity: number;
    initialTemperatureReduced: number;
    minimumTemperatureReduced?: number;
  }) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 2 || height < 2) throw new Error('heat field dimensions must be integers >= 2');
    if (![boxWidth, boxHeight, diffusivity, heatCapacityDensity, initialTemperatureReduced, minimumTemperatureReduced].every(Number.isFinite)) throw new Error('heat field coefficients must be finite');
    if (!(boxWidth > 0 && boxHeight > 0 && diffusivity >= 0 && heatCapacityDensity > 0 && minimumTemperatureReduced > 0)) throw new Error('invalid heat field coefficients');
    if (!(initialTemperatureReduced >= minimumTemperatureReduced)) throw new Error('initial heat-field temperature is below its admissible floor');
    this.width = width;
    this.height = height;
    this.boxWidth = boxWidth;
    this.boxHeight = boxHeight;
    this.diffusivity = diffusivity;
    this.heatCapacityDensity = heatCapacityDensity;
    this.minimumTemperatureReduced = minimumTemperatureReduced;
    this.values = new Float64Array(width * height).fill(initialTemperatureReduced);
  }

  get cellCount() { return this.values.length; }
  get cellArea() { return this.boxWidth * this.boxHeight / this.cellCount; }
  get cellHeatCapacity() { return this.heatCapacityDensity * this.cellArea; }
  get totalHeatCapacity() { return this.heatCapacityDensity * this.boxWidth * this.boxHeight; }

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
    return Math.max(0, (this.values[index] - this.minimumTemperatureReduced) * this.cellHeatCapacity);
  }

  addEnergyAtPosition(x: number, y: number, energyReduced: number) {
    const index = this.positionIndex(x, y);
    this.addEnergyAtIndex(index, energyReduced);
  }

  addEnergyAtIndex(index: number, energyReduced: number) {
    if (!Number.isFinite(energyReduced)) throw new Error('heat exchange must be finite');
    const next = this.values[index] + energyReduced / this.cellHeatCapacity;
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
    if (substeps > WORLD_DOMAIN.maximumHeatSubcyclesPerOperator) {
      throw new WorldDomainError('heat solver subcycling exceeds the validated resource envelope', {
        substeps,
        maximum: WORLD_DOMAIN.maximumHeatSubcyclesPerOperator,
      });
    }
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
    return sum * this.cellHeatCapacity;
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
      heatCapacityDensity: this.heatCapacityDensity,
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
      heatCapacityDensity: state.heatCapacityDensity,
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

export function releaseReactionHeat({
  field,
  cellIndex,
  reactionCount,
  reactionHeatReduced,
  maximumCellEnergyFraction = WORLD_DOMAIN.maximumReactionCellEnergyFraction,
}: {
  field: PeriodicHeatField;
  cellIndex: number;
  reactionCount: number;
  reactionHeatReduced: number;
  maximumCellEnergyFraction?: number;
}) {
  if (!Number.isSafeInteger(cellIndex) || cellIndex < 0 || cellIndex >= field.cellCount) throw new Error('reaction heat targets an invalid field cell');
  if (!Number.isSafeInteger(reactionCount) || reactionCount < 0 || !Number.isFinite(reactionHeatReduced) || reactionHeatReduced < 0) throw new Error('reaction heat inputs are invalid');
  if (!(Number.isFinite(maximumCellEnergyFraction) && maximumCellEnergyFraction > 0 && maximumCellEnergyFraction <= 1)) throw new Error('reaction heat fraction limit is invalid');
  const released = reactionCount * reactionHeatReduced;
  const cellTemperature = field.getCellTemperatureReduced(cellIndex % field.width, Math.floor(cellIndex / field.width));
  const cellEnergy = cellTemperature * field.cellHeatCapacity;
  if (released > cellEnergy * maximumCellEnergyFraction + 1e-12) {
    throw new WorldDomainError('reaction heat jump exceeds the validated cell-energy fraction', { released, cellEnergy, maximumFraction: maximumCellEnergyFraction });
  }
  const fieldBefore = field.totalEnergyReduced();
  field.addEnergyAtIndex(cellIndex, released);
  const fieldEnergyDelta = field.totalEnergyReduced() - fieldBefore;
  return {
    released,
    fieldEnergyDelta,
    chemicalEnergyDelta: -released,
    closureResidual: fieldEnergyDelta - released,
  };
}

export type ReactionEvent = Readonly<{ particleIndex: number; cellIndex: number }>;

export function settleReactionEvents({
  field,
  species,
  events,
  reactionHeatReduced,
  maximumCellEnergyFraction = WORLD_DOMAIN.maximumReactionCellEnergyFraction,
}: {
  field: PeriodicHeatField;
  species: ParticleSpecies[];
  events: ReadonlyArray<ReactionEvent>;
  reactionHeatReduced: number;
  maximumCellEnergyFraction?: number;
}) {
  if (!Number.isFinite(reactionHeatReduced) || reactionHeatReduced < 0) throw new Error('reaction heat must be finite and non-negative');
  if (!(Number.isFinite(maximumCellEnergyFraction) && maximumCellEnergyFraction > 0 && maximumCellEnergyFraction <= 1)) throw new Error('reaction heat fraction limit is invalid');
  const orderedEvents = [...events].sort((left, right) => left.cellIndex - right.cellIndex || left.particleIndex - right.particleIndex);
  const seenParticles = new Set<number>();
  const eventsByCell = new Map<number, number>();
  for (const event of orderedEvents) {
    if (!Number.isSafeInteger(event.particleIndex) || event.particleIndex < 0 || event.particleIndex >= species.length) throw new Error('reaction event targets an invalid particle');
    if (!Number.isSafeInteger(event.cellIndex) || event.cellIndex < 0 || event.cellIndex >= field.cellCount) throw new Error('reaction event targets an invalid field cell');
    if (seenParticles.has(event.particleIndex)) throw new Error('reaction batch contains a duplicate particle');
    if (species[event.particleIndex] !== 'A') throw new Error('reaction event must consume species A');
    seenParticles.add(event.particleIndex);
    eventsByCell.set(event.cellIndex, (eventsByCell.get(event.cellIndex) ?? 0) + 1);
  }

  // A frozen half-step may produce several events in one cell. Preflight them
  // as a deterministic micro-event sequence against a virtual energy ledger so
  // the batch remains atomic without rejecting merely because events co-occur.
  const virtualCellEnergies = new Map<number, number>();
  const maximumTemperatureReduced = WORLD_DOMAIN.maximumResolvedTemperatureKelvin / ARGON_UNITS.epsilonOverKelvin;
  for (const event of orderedEvents) {
    const cellEnergy = virtualCellEnergies.get(event.cellIndex)
      ?? field.getCellTemperatureReduced(event.cellIndex % field.width, Math.floor(event.cellIndex / field.width)) * field.cellHeatCapacity;
    if (reactionHeatReduced > cellEnergy * maximumCellEnergyFraction + 1e-12) {
      throw new WorldDomainError('reaction heat micro-event exceeds the validated cell-energy fraction', {
        released: reactionHeatReduced,
        cellEnergy,
        maximumFraction: maximumCellEnergyFraction,
      });
    }
    const nextCellEnergy = cellEnergy + reactionHeatReduced;
    const nextTemperature = nextCellEnergy / field.cellHeatCapacity;
    if (nextTemperature > maximumTemperatureReduced + 1e-12) {
      throw new WorldDomainError('reaction heat micro-event exceeds the maximum resolved temperature', {
        resultingTemperatureKelvin: nextTemperature * ARGON_UNITS.epsilonOverKelvin,
        maximumTemperatureKelvin: WORLD_DOMAIN.maximumResolvedTemperatureKelvin,
        cellIndex: event.cellIndex,
      });
    }
    virtualCellEnergies.set(event.cellIndex, nextCellEnergy);
  }

  const fieldBefore = field.totalEnergyReduced();
  for (const event of orderedEvents) field.addEnergyAtIndex(event.cellIndex, reactionHeatReduced);
  for (const event of orderedEvents) species[event.particleIndex] = 'B';
  const released = orderedEvents.length * reactionHeatReduced;
  const fieldEnergyDelta = field.totalEnergyReduced() - fieldBefore;
  const chemicalEnergyDelta = -released;
  return {
    reactionCount: orderedEvents.length,
    consumedA: orderedEvents.length,
    producedB: orderedEvents.length,
    cells: Array.from(eventsByCell, ([cellIndex, count]) => ({ cellIndex, count })),
    fieldEnergyDelta,
    chemicalEnergyDelta,
    closureResidual: fieldEnergyDelta + chemicalEnergyDelta,
  };
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
  private initialClosureReferenceEnergy = 1;
  private externalEnergy = 0;
  private initialMomentum: { x: number; y: number };
  private reservoirMomentum = { x: 0, y: 0 };
  private cumulativeInterfaceEnergy = 0;
  private couplingCoverage = 0;
  private minimumCouplingCoverage = 1;
  private heatClosureResidual = 0;
  private exchangeClosureResidual = 0;
  private reactionClosureResidual = 0;
  private heatClosureMaximum = 0;
  private exchangeClosureMaximum = 0;
  private reactionClosureMaximum = 0;
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
      heatCapacityDensity: this.options.fieldHeatCapacityDensity,
      initialTemperatureReduced: this.options.temperatureKelvin / ARGON_UNITS.epsilonOverKelvin,
    });
    this.species = new Array<ParticleSpecies>(this.options.count).fill('A');
    this._worldId = `tfw-${this.options.seed.toString(36)}-${worldOptionsFingerprint(this.options)}`;
    this.stateNamespace = this._worldId;
    this._stateId = worldStateId(this.stateNamespace, 0, 0, 'initial');
    this.initialMomentum = this.particleMomentum();
    this.initialTotalEnergy = this.totalTrackedEnergy();
    const initialMdEnergy = this.md.observe().metrics.totalEnergyPerParticle * this.options.count;
    this.initialClosureReferenceEnergy = Math.max(
      1,
      Math.abs(initialMdEnergy) + this.field.totalEnergyReduced() + this.options.count * this.options.reactionHeatReduced,
    );
  }

  get stepCount() { return this.md.stepCount; }
  get stateId() { return this._stateId; }
  get worldId() { return this._worldId; }

  advance(substeps = 1) {
    if (!Number.isInteger(substeps) || substeps < 1 || substeps > WORLD_DOMAIN.maximumSubstepsPerAction) {
      throw new WorldDomainError('step action is outside the supported horizon', { substeps, maximum: WORLD_DOMAIN.maximumSubstepsPerAction });
    }
    this.assertActionBudget();
    if (this.stepCount + substeps > WORLD_DOMAIN.maximumTotalSteps) throw new WorldDomainError('step action exceeds the validated total horizon', { resultingSteps: this.stepCount + substeps, maximum: WORLD_DOMAIN.maximumTotalSteps });
    const pairEvaluations = this.options.count * (this.options.count - 1) / 2 * substeps;
    if (pairEvaluations > WORLD_DOMAIN.maximumPairEvaluationsPerAction) {
      throw new WorldDomainError('step action exceeds the validated pair-evaluation resource envelope', {
        pairEvaluations,
        maximum: WORLD_DOMAIN.maximumPairEvaluationsPerAction,
      });
    }
    const heatSubcycles = estimateHeatSubcycles(this.options, this.md.box);
    const heatCellUpdates = 2 * substeps * this.options.gridWidth * this.options.gridHeight * heatSubcycles;
    if (heatCellUpdates > WORLD_DOMAIN.maximumHeatCellUpdatesPerAction) throw new WorldDomainError('step action exceeds the validated heat-work resource envelope', { heatCellUpdates, maximum: WORLD_DOMAIN.maximumHeatCellUpdatesPerAction });
    const reactionTrials = 2 * substeps * this.options.count;
    if (reactionTrials > WORLD_DOMAIN.maximumReactionTrialsPerAction) throw new WorldDomainError('step action exceeds the validated reaction-work resource envelope', { reactionTrials, maximum: WORLD_DOMAIN.maximumReactionTrialsPerAction });
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
    this.assertActionBudget();
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
    this.assertActionBudget();
    const parentStateId = this._stateId;
    const backup = this.serialize();
    try {
      const energy = deltaKelvin / ARGON_UNITS.epsilonOverKelvin * this.field.totalHeatCapacity * CENTRAL_PULSE_AREA_FRACTION;
      this.field.addGaussianPulse(CENTRAL_PULSE_PROFILE.xFraction, CENTRAL_PULSE_PROFILE.yFraction, energy, CENTRAL_PULSE_PROFILE.widthFraction);
      this.externalEnergy += energy;
      this.commitMutation(parentStateId, `heat-pulse:${deltaKelvin}`);
      this.finalizeAction('inject_heat_pulse', parentStateId, {
        deltaKelvin,
        energyReduced: energy,
        externalEnergyReduced: energy,
        xFraction: CENTRAL_PULSE_PROFILE.xFraction,
        yFraction: CENTRAL_PULSE_PROFILE.yFraction,
        widthFraction: CENTRAL_PULSE_PROFILE.widthFraction,
        profileVersion: CENTRAL_PULSE_PROFILE.profileVersion,
      });
      this.assertAdmissibleState();
    } catch (error) {
      this.restoreFromSerialized(backup);
      throw error;
    }
    return this.observe();
  }

  clone(branchOrdinal: number) {
    if (!Number.isSafeInteger(branchOrdinal) || branchOrdinal < 1) throw new Error('branch ordinal must be a positive safe integer');
    this.assertActionBudget();
    const branchDepth = (this.stateNamespace.match(/-b[0-9a-z]+/g) ?? []).length + 1;
    if (branchDepth > WORLD_DOMAIN.maximumBranchDepth) throw new WorldDomainError('branch depth exceeds the validated resource envelope', { branchDepth, maximum: WORLD_DOMAIN.maximumBranchDepth });
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
    const rawParticleMomentumResidual = Math.hypot(momentum.x - this.initialMomentum.x, momentum.y - this.initialMomentum.y);
    const closureReferenceEnergy = this.closureReferenceEnergy();
    const minKelvin = fieldStats.minimum * ARGON_UNITS.epsilonOverKelvin;
    const maxKelvin = fieldStats.maximum * ARGON_UNITS.epsilonOverKelvin;
    const inDomain = minKelvin >= WORLD_DOMAIN.minimumResolvedTemperatureKelvin - 1e-9
      && maxKelvin <= WORLD_DOMAIN.maximumResolvedTemperatureKelvin + 1e-9
      && (this.stepCount === 0 || this.minimumCouplingCoverage >= WORLD_DOMAIN.minimumCouplingCoverage)
      && Math.abs(ledger.relativeResidual) <= WORLD_DOMAIN.maximumRelativeEnergyResidual
      && momentumResidual <= WORLD_DOMAIN.maximumMomentumResidual
      && rawParticleMomentumResidual <= WORLD_DOMAIN.maximumMomentumResidual
      && this.heatClosureResidual / closureReferenceEnergy <= WORLD_DOMAIN.maximumCumulativeClosureRelative
      && this.exchangeClosureResidual / closureReferenceEnergy <= WORLD_DOMAIN.maximumCumulativeClosureRelative
      && this.reactionClosureResidual / closureReferenceEnergy <= WORLD_DOMAIN.maximumCumulativeClosureRelative
      && this.heatClosureMaximum / closureReferenceEnergy <= WORLD_DOMAIN.maximumOperatorClosureRelative
      && this.exchangeClosureMaximum / closureReferenceEnergy <= WORLD_DOMAIN.maximumOperatorClosureRelative
      && this.reactionClosureMaximum / closureReferenceEnergy <= WORLD_DOMAIN.maximumOperatorClosureRelative;

    return {
      schemaVersion: 'tf.observation/0.3',
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
        minimumCouplingCoverage: this.minimumCouplingCoverage,
      },
      conservation: {
        particleCount: this.options.count,
        speciesResidual: this.species.length - this.options.count,
        massResidual: md.particles.length - this.options.count,
        energyResidualReduced: ledger.residual,
        relativeEnergyResidual: ledger.relativeResidual,
        momentumResidual,
        rawParticleMomentumResidual,
        heatClosureResidual: this.heatClosureResidual,
        exchangeClosureResidual: this.exchangeClosureResidual,
        reactionClosureResidual: this.reactionClosureResidual,
        heatClosureMaximum: this.heatClosureMaximum,
        exchangeClosureMaximum: this.exchangeClosureMaximum,
        reactionClosureMaximum: this.reactionClosureMaximum,
        closureReferenceEnergy,
        heatClosureRelative: this.heatClosureResidual / closureReferenceEnergy,
        exchangeClosureRelative: this.exchangeClosureResidual / closureReferenceEnergy,
        reactionClosureRelative: this.reactionClosureResidual / closureReferenceEnergy,
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
        engineVersion: '0.3.0',
        seed: this.options.seed,
        modelRoles: ['solver', 'solver', 'closure'],
        fidelity: 'reduced-unit-demonstration',
      },
    };
  }

  serialize(): SerializedThermochemicalWorld {
    return {
      schemaVersion: 'tf.world/0.3',
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
      initialClosureReferenceEnergy: this.initialClosureReferenceEnergy,
      externalEnergy: this.externalEnergy,
      initialMomentum: { ...this.initialMomentum },
      reservoirMomentum: { ...this.reservoirMomentum },
      cumulativeInterfaceEnergy: this.cumulativeInterfaceEnergy,
      couplingCoverage: this.couplingCoverage,
      minimumCouplingCoverage: this.minimumCouplingCoverage,
      heatClosureResidual: this.heatClosureResidual,
      exchangeClosureResidual: this.exchangeClosureResidual,
      reactionClosureResidual: this.reactionClosureResidual,
      heatClosureMaximum: this.heatClosureMaximum,
      exchangeClosureMaximum: this.exchangeClosureMaximum,
      reactionClosureMaximum: this.reactionClosureMaximum,
      lastAction: copyAction(this.lastAction),
    };
  }

  static fromSerialized(state: SerializedThermochemicalWorld) {
    if (state.schemaVersion !== 'tf.world/0.3') throw new Error('unsupported thermochemical world-state schema');
    const world = new ThermochemicalWorld(state.options);
    const expectedWorldId = `tfw-${world.options.seed.toString(36)}-${worldOptionsFingerprint(world.options)}`;
    if (state.worldId !== expectedWorldId) throw new Error('serialized world id does not match its configuration');
    if (!state.stateNamespace.match(new RegExp(`^${escapeRegExp(state.worldId)}(?:-b[0-9a-z]+)*$`))) throw new Error('serialized world namespace is invalid');
    if (!Number.isSafeInteger(state.revision) || state.revision < 0 || !Number.isSafeInteger(state.actionCount) || state.actionCount < 0 || !Number.isSafeInteger(state.branchCount) || state.branchCount < 0) throw new Error('serialized world counters are invalid');
    assertNestedResourceEnvelope(state, world.md.box);
    const branchDepth = (state.stateNamespace.match(/-b[0-9a-z]+/g) ?? []).length;
    if (state.actionCount > WORLD_DOMAIN.maximumActionCount || state.md.step > WORLD_DOMAIN.maximumTotalSteps || branchDepth > WORLD_DOMAIN.maximumBranchDepth) throw new WorldDomainError('serialized world exceeds the validated history resource envelope', { actionCount: state.actionCount, step: state.md.step, branchDepth });
    if (state.species.some((species) => species !== 'A' && species !== 'B')) throw new Error('serialized species state is invalid');
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
    world.initialClosureReferenceEnergy = state.initialClosureReferenceEnergy;
    world.externalEnergy = state.externalEnergy;
    world.initialMomentum = { ...state.initialMomentum };
    world.reservoirMomentum = { ...state.reservoirMomentum };
    world.cumulativeInterfaceEnergy = state.cumulativeInterfaceEnergy;
    world.couplingCoverage = state.couplingCoverage;
    world.minimumCouplingCoverage = state.minimumCouplingCoverage;
    world.heatClosureResidual = state.heatClosureResidual;
    world.exchangeClosureResidual = state.exchangeClosureResidual;
    world.reactionClosureResidual = state.reactionClosureResidual;
    world.heatClosureMaximum = state.heatClosureMaximum;
    world.exchangeClosureMaximum = state.exchangeClosureMaximum;
    world.reactionClosureMaximum = state.reactionClosureMaximum;
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
    const firstCoverage = this.exchangeParticleFieldEnergy(halfStep);
    this.applyReactionKinetics(halfStep, macroStep, 0);
    this.md.advance(1);
    this.applyReactionKinetics(halfStep, macroStep, 1);
    const secondCoverage = this.exchangeParticleFieldEnergy(halfStep);
    this.couplingCoverage = Math.min(firstCoverage, secondCoverage);
    this.minimumCouplingCoverage = Math.min(this.minimumCouplingCoverage, this.couplingCoverage);
    this.advanceHeatField(halfStep);
    this.commitMutation(parentStateId, `integrate:${this.stepCount}`);
    this.assertAdmissibleState();
  }

  private advanceHeatField(duration: number) {
    const before = this.field.totalEnergyReduced();
    this.field.advance(duration);
    const residual = Math.abs(this.field.totalEnergyReduced() - before);
    this.heatClosureResidual += residual;
    this.heatClosureMaximum = Math.max(this.heatClosureMaximum, residual);
  }

  private exchangeParticleFieldEnergy(duration: number) {
    const snapshot = this.md.observe();
    const bins = Array.from({ length: this.field.cellCount }, () => [] as number[]);
    snapshot.particles.forEach((particle, index) => bins[this.field.cellIndexAtPosition(particle.x, particle.y)].push(index));
    let coupledParticleCount = 0;
    const exchanges: Array<{ indices: number[]; energyReduced: number; cellIndex: number }> = [];

    bins.forEach((indices, cellIndex) => {
      if (indices.length < 2) return;
      const meanVx = indices.reduce((sum, index) => sum + snapshot.particles[index].vx, 0) / indices.length;
      const meanVy = indices.reduce((sum, index) => sum + snapshot.particles[index].vy, 0) / indices.length;
      const relativeKinetic = indices.reduce((sum, index) => {
        const particle = snapshot.particles[index];
        return sum + 0.5 * ((particle.vx - meanVx) ** 2 + (particle.vy - meanVy) ** 2);
      }, 0);
      if (relativeKinetic < WORLD_DOMAIN.minimumRelativeKineticReduced) return;
      const particleHeatCapacity = indices.length - 1;
      const particleTemperature = relativeKinetic / particleHeatCapacity;
      const fieldTemperature = this.field.getCellTemperatureReduced(cellIndex % this.field.width, Math.floor(cellIndex / this.field.width));
      const exchange = twoReservoirExchange({
        particleTemperature,
        particleHeatCapacity,
        fieldTemperature,
        fieldHeatCapacity: this.field.cellHeatCapacity,
        durationReduced: duration,
        couplingTauReduced: this.options.couplingTau,
      });
      const requestedEnergy = exchange.particleEnergyDelta;
      if (requestedEnergy > 0) {
        const representative = snapshot.particles[indices[0]];
        const availableEnergy = this.field.availableEnergyAtPosition(representative.x, representative.y);
        if (requestedEnergy > availableEnergy + 1e-12) throw new WorldDomainError('analytic exchange would cross the field-temperature floor', { requestedEnergy, availableEnergy });
      }
      const minimumEnergy = -WORLD_DOMAIN.maximumMdCoolingFraction * relativeKinetic;
      if (requestedEnergy < minimumEnergy - 1e-12) throw new WorldDomainError('analytic exchange would cross the validated MD cooling limit', { requestedEnergy, minimum: minimumEnergy });
      exchanges.push({ indices, energyReduced: requestedEnergy, cellIndex });
      coupledParticleCount += indices.length;
    });

    const applied = this.md.exchangeCellThermalEnergies(exchanges);
    applied.forEach((result, index) => {
      if (Math.abs(result.actualEnergyReduced - exchanges[index].energyReduced) > 1e-12 * Math.max(1, Math.abs(exchanges[index].energyReduced))) {
        throw new WorldDomainError('particle exchange deviated from the analytic requested energy', { requestedEnergy: exchanges[index].energyReduced, actualEnergy: result.actualEnergyReduced });
      }
      const cellIndex = exchanges[index].cellIndex;
      const fieldBefore = this.field.totalEnergyReduced();
      this.field.addEnergyAtIndex(cellIndex, -result.actualEnergyReduced);
      const fieldDelta = this.field.totalEnergyReduced() - fieldBefore;
      const closureResidual = Math.abs(result.actualEnergyReduced + fieldDelta);
      this.exchangeClosureResidual += closureResidual;
      this.exchangeClosureMaximum = Math.max(this.exchangeClosureMaximum, closureResidual);
      this.reservoirMomentum.x -= result.deltaPx;
      this.reservoirMomentum.y -= result.deltaPy;
      this.cumulativeInterfaceEnergy += Math.abs(result.actualEnergyReduced);
    });
    return coupledParticleCount / snapshot.particles.length;
  }

  private applyReactionKinetics(duration: number, macroStep: number, halfStage: number) {
    const snapshot = this.md.observe();
    const frozenTemperatures = this.field.valuesReduced();
    const events: ReactionEvent[] = [];
    for (let index = 0; index < this.species.length; index += 1) {
      if (this.species[index] === 'B') continue;
      const particle = snapshot.particles[index];
      const cellIndex = this.field.cellIndexAtPosition(particle.x, particle.y);
      const temperature = frozenTemperatures[cellIndex];
      const rate = this.options.reactionPreexponential * Math.exp(-this.options.reactionActivationReduced / Math.max(temperature, 1e-12));
      if (rate * duration > WORLD_DOMAIN.maximumReactionHazardPerHalfStep) throw new WorldDomainError('reaction hazard exceeds the validated operator-split limit', { rateDuration: rate * duration, maximum: WORLD_DOMAIN.maximumReactionHazardPerHalfStep });
      const probability = reactionProbability(rate, duration);
      if (counterRandom(this.options.seed, macroStep, index, 17 + halfStage) < probability) events.push({ particleIndex: index, cellIndex });
    }
    const settlement = settleReactionEvents({
      field: this.field,
      species: this.species,
      events,
      reactionHeatReduced: this.options.reactionHeatReduced,
    });
    const closureResidual = Math.abs(settlement.closureResidual);
    this.reactionClosureResidual += closureResidual;
    this.reactionClosureMaximum = Math.max(this.reactionClosureMaximum, closureResidual);
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
      schemaVersion: 'tf.world/0.3',
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
      initialClosureReferenceEnergy: this.initialClosureReferenceEnergy,
      externalEnergy: this.externalEnergy,
      initialMomentum: this.initialMomentum,
      reservoirMomentum: this.reservoirMomentum,
      cumulativeInterfaceEnergy: this.cumulativeInterfaceEnergy,
      couplingCoverage: this.couplingCoverage,
      minimumCouplingCoverage: this.minimumCouplingCoverage,
      heatClosureResidual: this.heatClosureResidual,
      exchangeClosureResidual: this.exchangeClosureResidual,
      reactionClosureResidual: this.reactionClosureResidual,
      heatClosureMaximum: this.heatClosureMaximum,
      exchangeClosureMaximum: this.exchangeClosureMaximum,
      reactionClosureMaximum: this.reactionClosureMaximum,
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
    this.initialClosureReferenceEnergy = restored.initialClosureReferenceEnergy;
    this.externalEnergy = restored.externalEnergy;
    this.initialMomentum = restored.initialMomentum;
    this.reservoirMomentum = restored.reservoirMomentum;
    this.cumulativeInterfaceEnergy = restored.cumulativeInterfaceEnergy;
    this.couplingCoverage = restored.couplingCoverage;
    this.minimumCouplingCoverage = restored.minimumCouplingCoverage;
    this.heatClosureResidual = restored.heatClosureResidual;
    this.exchangeClosureResidual = restored.exchangeClosureResidual;
    this.reactionClosureResidual = restored.reactionClosureResidual;
    this.heatClosureMaximum = restored.heatClosureMaximum;
    this.exchangeClosureMaximum = restored.exchangeClosureMaximum;
    this.reactionClosureMaximum = restored.reactionClosureMaximum;
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
      schemaVersion: 'tf.action/0.3',
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
    if (!Number.isSafeInteger(this.options.seed)
      || this.options.seed < WORLD_DOMAIN.minimumSeed
      || this.options.seed > WORLD_DOMAIN.maximumSeed) throw new WorldDomainError('seed is outside the unique 32-bit counter-RNG domain', { seed: this.options.seed, minimum: WORLD_DOMAIN.minimumSeed, maximum: WORLD_DOMAIN.maximumSeed });
    assertRange('particle count', this.options.count, WORLD_DOMAIN.minimumParticleCount, WORLD_DOMAIN.maximumParticleCount, true);
    assertRange('density', this.options.density, WORLD_DOMAIN.minimumDensityReduced, WORLD_DOMAIN.maximumDensityReduced);
    assertRange('initial temperature', this.options.temperatureKelvin, WORLD_DOMAIN.minimumInitialTemperatureKelvin, WORLD_DOMAIN.maximumInitialTemperatureKelvin);
    assertRange('time step', this.options.timeStep, WORLD_DOMAIN.minimumTimeStepReduced, WORLD_DOMAIN.maximumTimeStepReduced);
    assertRange('cutoff', this.options.cutoff, WORLD_DOMAIN.minimumCutoffReduced, WORLD_DOMAIN.maximumCutoffReduced);
    assertRange('grid width', this.options.gridWidth, WORLD_DOMAIN.minimumGridDimension, WORLD_DOMAIN.maximumGridDimension, true);
    assertRange('grid height', this.options.gridHeight, WORLD_DOMAIN.minimumGridDimension, WORLD_DOMAIN.maximumGridDimension, true);
    if (this.options.gridWidth * this.options.gridHeight > WORLD_DOMAIN.maximumGridCells) throw new WorldDomainError('thermochemical grid exceeds the validated resource envelope', { cells: this.options.gridWidth * this.options.gridHeight, maximum: WORLD_DOMAIN.maximumGridCells });
    if (this.options.gridWidth * this.options.gridHeight > this.options.count * WORLD_DOMAIN.maximumGridCellsPerParticle) {
      throw new WorldDomainError('thermochemical grid is too sparse for the validated particle-field coupling coverage', {
        cells: this.options.gridWidth * this.options.gridHeight,
        particles: this.options.count,
        maximumCellsPerParticle: WORLD_DOMAIN.maximumGridCellsPerParticle,
      });
    }
    const estimatedBox = estimateBoxDimensions(this.options.count, this.options.density);
    if (2 * this.options.cutoff >= Math.min(estimatedBox.width, estimatedBox.height)) throw new WorldDomainError('cutoff violates the periodic minimum-image domain', { twiceCutoff: 2 * this.options.cutoff, minimumBoxExtent: Math.min(estimatedBox.width, estimatedBox.height) });
    const cellAspectRatio = (estimatedBox.width / this.options.gridWidth) / (estimatedBox.height / this.options.gridHeight);
    if (cellAspectRatio > WORLD_DOMAIN.maximumCellAspectRatio || cellAspectRatio < 1 / WORLD_DOMAIN.maximumCellAspectRatio) {
      throw new WorldDomainError('thermochemical cells exceed the validated aspect-ratio envelope', {
        cellAspectRatio,
        maximum: WORLD_DOMAIN.maximumCellAspectRatio,
      });
    }
    assertRange('thermal diffusivity', this.options.thermalDiffusivity, WORLD_DOMAIN.minimumThermalDiffusivityReduced, WORLD_DOMAIN.maximumThermalDiffusivityReduced);
    assertRange('heat-capacity density', this.options.fieldHeatCapacityDensity, WORLD_DOMAIN.minimumHeatCapacityDensityReduced, WORLD_DOMAIN.maximumHeatCapacityDensityReduced);
    assertRange('coupling tau', this.options.couplingTau, WORLD_DOMAIN.minimumCouplingTauReduced, WORLD_DOMAIN.maximumCouplingTauReduced);
    assertRange('reaction preexponential', this.options.reactionPreexponential, 0, WORLD_DOMAIN.maximumReactionPreexponentialReduced);
    assertRange('reaction activation', this.options.reactionActivationReduced, 0, WORLD_DOMAIN.maximumReactionActivationReduced);
    assertRange('reaction heat', this.options.reactionHeatReduced, 0, WORLD_DOMAIN.maximumReactionHeatReduced);
    const minimumCellEnergy = WORLD_DOMAIN.minimumResolvedTemperatureKelvin / ARGON_UNITS.epsilonOverKelvin
      * this.options.fieldHeatCapacityDensity * estimatedBox.width * estimatedBox.height
      / (this.options.gridWidth * this.options.gridHeight);
    const maximumSingleEventHeat = minimumCellEnergy * WORLD_DOMAIN.maximumReactionCellEnergyFraction;
    if (this.options.reactionHeatReduced > maximumSingleEventHeat + 1e-12) {
      throw new WorldDomainError('reaction heat exceeds the minimum-temperature single-event settlement domain', {
        reactionHeat: this.options.reactionHeatReduced,
        maximumSingleEventHeat,
        minimumCellEnergy,
      });
    }
    if (this.options.timeStep / (2 * this.options.couplingTau) > WORLD_DOMAIN.maximumCouplingSplitRatio) throw new WorldDomainError('coupling split exceeds the validated relaxation limit', { ratio: this.options.timeStep / (2 * this.options.couplingTau), maximum: WORLD_DOMAIN.maximumCouplingSplitRatio });
    const maximumTemperatureReduced = WORLD_DOMAIN.maximumResolvedTemperatureKelvin / ARGON_UNITS.epsilonOverKelvin;
    const maximumReactionHazard = this.options.reactionPreexponential
      * Math.exp(-this.options.reactionActivationReduced / maximumTemperatureReduced)
      * this.options.timeStep / 2;
    if (maximumReactionHazard > WORLD_DOMAIN.maximumReactionHazardPerHalfStep) throw new WorldDomainError('reaction coefficients exceed the validated maximum hazard', { maximumReactionHazard, maximum: WORLD_DOMAIN.maximumReactionHazardPerHalfStep });
  }

  private assertAdmissibleState() {
    const snapshot = this.observe();
    if (snapshot.step > WORLD_DOMAIN.maximumTotalSteps) throw new WorldDomainError('world step exceeds the validated total horizon', { step: snapshot.step, maximum: WORLD_DOMAIN.maximumTotalSteps });
    if (snapshot.particles.some((particle) => !Number.isFinite(particle.x + particle.y + particle.vx + particle.vy))) throw new Error('non-finite particle state');
    if (snapshot.field.valuesKelvin.some((value) => !Number.isFinite(value))) throw new Error('non-finite heat-field state');
    if (snapshot.field.minKelvin < WORLD_DOMAIN.minimumResolvedTemperatureKelvin - 1e-8 || snapshot.field.maxKelvin > WORLD_DOMAIN.maximumResolvedTemperatureKelvin + 1e-8) {
      throw new WorldDomainError('resolved temperature left the validated world domain', {
        minimumKelvin: snapshot.field.minKelvin,
        maximumKelvin: snapshot.field.maxKelvin,
      });
    }
    if (snapshot.step > 0 && snapshot.metrics.minimumCouplingCoverage < WORLD_DOMAIN.minimumCouplingCoverage) throw new WorldDomainError('particle-field coupling coverage fell below the validated domain', { coverage: snapshot.metrics.minimumCouplingCoverage, minimum: WORLD_DOMAIN.minimumCouplingCoverage });
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
    if (snapshot.conservation.rawParticleMomentumResidual > WORLD_DOMAIN.maximumMomentumResidual) {
      throw new WorldDomainError('raw particle momentum residual exceeded the validated domain', {
        residual: snapshot.conservation.rawParticleMomentumResidual,
        maximum: WORLD_DOMAIN.maximumMomentumResidual,
      });
    }
    const closureChecks = [
      ['heat cumulative', snapshot.conservation.heatClosureRelative, WORLD_DOMAIN.maximumCumulativeClosureRelative],
      ['exchange cumulative', snapshot.conservation.exchangeClosureRelative, WORLD_DOMAIN.maximumCumulativeClosureRelative],
      ['reaction cumulative', snapshot.conservation.reactionClosureRelative, WORLD_DOMAIN.maximumCumulativeClosureRelative],
      ['heat operator', snapshot.conservation.heatClosureMaximum / snapshot.conservation.closureReferenceEnergy, WORLD_DOMAIN.maximumOperatorClosureRelative],
      ['exchange operator', snapshot.conservation.exchangeClosureMaximum / snapshot.conservation.closureReferenceEnergy, WORLD_DOMAIN.maximumOperatorClosureRelative],
      ['reaction operator', snapshot.conservation.reactionClosureMaximum / snapshot.conservation.closureReferenceEnergy, WORLD_DOMAIN.maximumOperatorClosureRelative],
    ] as const;
    for (const [operator, residual, maximum] of closureChecks) {
      if (residual > maximum) throw new WorldDomainError(`${operator} closure residual exceeded the validated domain`, { residual, maximum });
    }
  }

  private closureReferenceEnergy() {
    return this.initialClosureReferenceEnergy + Math.abs(this.externalEnergy);
  }

  private assertActionBudget() {
    if (this.actionCount >= WORLD_DOMAIN.maximumActionCount) throw new WorldDomainError('action count exceeds the validated resource envelope', { actionCount: this.actionCount, maximum: WORLD_DOMAIN.maximumActionCount });
  }
}

export function reactionProbability(rate: number, duration: number) {
  if (!(rate >= 0) || !(duration >= 0) || !Number.isFinite(rate + duration)) throw new Error('reaction rate and duration must be finite and non-negative');
  return -Math.expm1(-rate * duration);
}

export function fourierModeRelativeL2Error({
  width = 64,
  height = 16,
  boxWidth = 1,
  boxHeight = 1,
  diffusivity = 0.01,
  duration = 0.35,
  modeX = 1,
  modeY = 0,
}: {
  width?: number;
  height?: number;
  boxWidth?: number;
  boxHeight?: number;
  diffusivity?: number;
  duration?: number;
  modeX?: number;
  modeY?: number;
} = {}) {
  if (!Number.isSafeInteger(modeX) || !Number.isSafeInteger(modeY) || modeX < 1 || modeY < 0) throw new Error('Fourier mode indices require positive x and non-negative y modes');
  const field = new PeriodicHeatField({
    width,
    height,
    boxWidth,
    boxHeight,
    diffusivity,
    heatCapacityDensity: 1,
    initialTemperatureReduced: 1,
    minimumTemperatureReduced: 0.01,
  });
  const amplitude = 0.1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const modeValue = Math.sin(2 * Math.PI * modeX * (x + 0.5) / width)
        * Math.cos(2 * Math.PI * modeY * (y + 0.5) / height);
      field.setCellTemperatureReduced(x, y, 1 + amplitude * modeValue);
    }
  }
  const energyBefore = field.totalEnergyReduced();
  field.advance(duration);
  const waveNumberSquared = (2 * Math.PI * modeX / boxWidth) ** 2 + (2 * Math.PI * modeY / boxHeight) ** 2;
  const decayedAmplitude = amplitude * Math.exp(-diffusivity * waveNumberSquared * duration);
  let squaredError = 0;
  let squaredSignal = 0;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const modeValue = Math.sin(2 * Math.PI * modeX * (x + 0.5) / width)
        * Math.cos(2 * Math.PI * modeY * (y + 0.5) / height);
      const expected = 1 + decayedAmplitude * modeValue;
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

export function fourierGridConvergence() {
  const resolutions = [
    { width: 48, height: 32 },
    { width: 96, height: 64 },
    { width: 192, height: 128 },
  ] as const;
  const modes = [{ modeX: 1, modeY: 1 }, { modeX: 2, modeY: 1 }, { modeX: 1, modeY: 2 }] as const;
  const results = modes.map((mode) => {
    const trials = resolutions.map(({ width, height }) => fourierModeRelativeL2Error({
      width,
      height,
      boxWidth: 3,
      boxHeight: 2,
      diffusivity: 0.07,
      duration: 0.12,
      ...mode,
    }));
    const errors = trials.map((trial) => trial.relativeL2Error);
    const orders = [
      Math.log(errors[0] / errors[1]) / Math.log(2),
      Math.log(errors[1] / errors[2]) / Math.log(2),
    ];
    return { ...mode, errors, energyResiduals: trials.map((trial) => trial.relativeEnergyResidual), orders, minimumObservedOrder: Math.min(...orders) };
  });
  return {
    resolutions,
    modes: results,
    minimumObservedOrder: Math.min(...results.map((result) => result.minimumObservedOrder)),
    maximumEnergyResidual: Math.max(...results.flatMap((result) => result.energyResiduals.map(Math.abs))),
  };
}

export function heatCapacityGridInvariance() {
  const configurations = [
    { width: 6, height: 4 },
    { width: 12, height: 8 },
    { width: 16, height: 16 },
  ];
  const fields = configurations.map(({ width, height }) => new PeriodicHeatField({
    width,
    height,
    boxWidth: 12,
    boxHeight: 8,
    diffusivity: 0.18,
    heatCapacityDensity: 0.84,
    initialTemperatureReduced: 0.75,
    minimumTemperatureReduced: 0.01,
  }));
  const capacities = fields.map((field) => field.totalHeatCapacity);
  const energies = fields.map((field) => field.totalEnergyReduced());
  return {
    configurations,
    capacities,
    energies,
    maximumCapacitySpread: Math.max(...capacities) - Math.min(...capacities),
    maximumEnergySpread: Math.max(...energies) - Math.min(...energies),
  };
}

export function twoReservoirMatrixVerification() {
  let maximumDifferenceRatioError = 0;
  let maximumTemperatureError = 0;
  let maximumRelativeClosureResidual = 0;
  let maximumSemigroupError = 0;
  let cases = 0;
  for (const particleHeatCapacity of [1, 7, 63]) {
    for (const fieldHeatCapacity of [0.25, 4, 100]) {
      for (const [particleTemperature, fieldTemperature] of [[0.6, 1.1], [1.1, 0.6]]) {
        for (const durationRatio of [1e-8, 0.1, 1, 8]) {
          const couplingTauReduced = 0.3;
          const durationReduced = couplingTauReduced * durationRatio;
          const result = twoReservoirExchange({
            particleTemperature,
            particleHeatCapacity,
            fieldTemperature,
            fieldHeatCapacity,
            durationReduced,
            couplingTauReduced,
          });
          const expectedDecay = Math.exp(-durationRatio);
          const expectedParticleTemperature = result.equilibriumTemperature
            + (particleTemperature - result.equilibriumTemperature) * expectedDecay;
          const expectedFieldTemperature = result.equilibriumTemperature
            + (fieldTemperature - result.equilibriumTemperature) * expectedDecay;
          maximumDifferenceRatioError = Math.max(maximumDifferenceRatioError, Math.abs(result.temperatureDifferenceRatio - expectedDecay));
          maximumTemperatureError = Math.max(
            maximumTemperatureError,
            Math.abs(result.nextParticleTemperature - expectedParticleTemperature),
            Math.abs(result.nextFieldTemperature - expectedFieldTemperature),
          );
          const referenceEnergy = Math.max(1, particleHeatCapacity * particleTemperature + fieldHeatCapacity * fieldTemperature);
          maximumRelativeClosureResidual = Math.max(maximumRelativeClosureResidual, Math.abs(result.energyClosureResidual) / referenceEnergy);

          const firstHalf = twoReservoirExchange({
            particleTemperature,
            particleHeatCapacity,
            fieldTemperature,
            fieldHeatCapacity,
            durationReduced: durationReduced / 2,
            couplingTauReduced,
          });
          const secondHalf = twoReservoirExchange({
            particleTemperature: firstHalf.nextParticleTemperature,
            particleHeatCapacity,
            fieldTemperature: firstHalf.nextFieldTemperature,
            fieldHeatCapacity,
            durationReduced: durationReduced / 2,
            couplingTauReduced,
          });
          maximumSemigroupError = Math.max(
            maximumSemigroupError,
            Math.abs(secondHalf.nextParticleTemperature - result.nextParticleTemperature),
            Math.abs(secondHalf.nextFieldTemperature - result.nextFieldTemperature),
          );
          cases += 1;
        }
      }
    }
  }
  const equalTemperature = twoReservoirExchange({
    particleTemperature: 0.8,
    particleHeatCapacity: 7,
    fieldTemperature: 0.8,
    fieldHeatCapacity: 4,
    durationReduced: 0.1,
    couplingTauReduced: 0.3,
  });
  return {
    cases: cases + 1,
    maximumDifferenceRatioError,
    maximumTemperatureError,
    maximumRelativeClosureResidual,
    maximumSemigroupError,
    equalTemperatureEnergyExchange: Math.abs(equalTemperature.particleEnergyDelta),
  };
}

export function runThermochemicalVerification({ profile = 'unit' }: { profile?: keyof typeof THERMOCHEMICAL_VERIFICATION_PROFILES } = {}) {
  const heat = fourierModeRelativeL2Error();
  const convergence = fourierGridConvergence();
  const gridInvariance = heatCapacityGridInvariance();
  const exchangeMatrix = twoReservoirMatrixVerification();
  const analyticExchange = twoReservoirExchange({
    particleTemperature: 0.6,
    particleHeatCapacity: 7,
    fieldTemperature: 1.1,
    fieldHeatCapacity: 3.5,
    durationReduced: 0.12,
    couplingTauReduced: 0.3,
  });
  const forcedReactionField = new PeriodicHeatField({
    width: 4,
    height: 4,
    boxWidth: 4,
    boxHeight: 4,
    diffusivity: 0.1,
    heatCapacityDensity: 1,
    initialTemperatureReduced: 1,
    minimumTemperatureReduced: 0.01,
  });
  const forcedSpecies: ParticleSpecies[] = ['A', 'A'];
  const forcedReaction = settleReactionEvents({
    field: forcedReactionField,
    species: forcedSpecies,
    events: [{ particleIndex: 0, cellIndex: 5 }],
    reactionHeatReduced: 0.015,
  });
  const verificationProfile = THERMOCHEMICAL_VERIFICATION_PROFILES[profile];
  const deterministicContinuations: boolean[] = [];
  const ensembleSnapshots = verificationProfile.seeds.map((seed) => {
    const world = new ThermochemicalWorld({ count: 64, density: 0.78, temperatureKelvin: 88, seed, gridWidth: 5, gridHeight: 3 });
    world.injectCentralHeatPulse(30);
    world.advance(verificationProfile.horizonSteps / 2);
    const replay = ThermochemicalWorld.fromSerialized(world.serialize());
    const snapshot = world.advance(verificationProfile.horizonSteps / 2);
    deterministicContinuations.push(JSON.stringify(snapshot) === JSON.stringify(replay.advance(verificationProfile.horizonSteps / 2)));
    return snapshot;
  });
  const firstSnapshot = ensembleSnapshots[0];
  const energyResiduals = ensembleSnapshots.map((snapshot) => Math.abs(snapshot.conservation.relativeEnergyResidual));
  const energyTail = distributionSummary(energyResiduals, verificationProfile.seeds);
  return {
    heatModeRelativeL2Error: heat.relativeL2Error,
    heatEnergyResidual: heat.relativeEnergyResidual,
    fourierMinimumObservedOrder: convergence.minimumObservedOrder,
    fourierMaximumEnergyResidual: convergence.maximumEnergyResidual,
    gridHeatCapacitySpread: gridInvariance.maximumCapacitySpread,
    gridEnergySpread: gridInvariance.maximumEnergySpread,
    analyticExchangeDifferenceError: Math.abs(analyticExchange.temperatureDifferenceRatio - Math.exp(-0.12 / 0.3)),
    analyticExchangeClosureResidual: Math.abs(analyticExchange.energyClosureResidual),
    analyticExchangeMatrix: exchangeMatrix,
    forcedReactionClosureResidual: Math.abs(forcedReaction.closureResidual),
    forcedReactionConsumedA: forcedReaction.consumedA,
    forcedReactionProducedB: forcedReaction.producedB,
    coupledEnergyResidual: Math.abs(firstSnapshot.conservation.relativeEnergyResidual),
    momentumResidual: firstSnapshot.conservation.momentumResidual,
    rawParticleMomentumResidual: firstSnapshot.conservation.rawParticleMomentumResidual,
    speciesResidual: firstSnapshot.conservation.speciesResidual,
    massResidual: firstSnapshot.conservation.massResidual,
    interfaceEnergyMoved: firstSnapshot.metrics.cumulativeInterfaceEnergyReduced,
    couplingCoverage: firstSnapshot.metrics.couplingCoverage,
    minimumCouplingCoverage: firstSnapshot.metrics.minimumCouplingCoverage,
    reactionCount: firstSnapshot.metrics.reactionCount,
    heatClosureResidual: firstSnapshot.conservation.heatClosureResidual,
    exchangeClosureResidual: firstSnapshot.conservation.exchangeClosureResidual,
    reactionClosureResidual: firstSnapshot.conservation.reactionClosureResidual,
    heatClosureRelative: firstSnapshot.conservation.heatClosureRelative,
    exchangeClosureRelative: firstSnapshot.conservation.exchangeClosureRelative,
    reactionClosureRelative: firstSnapshot.conservation.reactionClosureRelative,
    maximumOperatorClosureRelative: Math.max(
      firstSnapshot.conservation.heatClosureMaximum,
      firstSnapshot.conservation.exchangeClosureMaximum,
      firstSnapshot.conservation.reactionClosureMaximum,
    ) / firstSnapshot.conservation.closureReferenceEnergy,
    deterministicReplay: deterministicContinuations.every(Boolean),
    inDomain: firstSnapshot.validityDomain.status === 'in_domain',
    ensemble: {
      profile,
      seeds: [...verificationProfile.seeds],
      horizonSteps: verificationProfile.horizonSteps,
      energyResidualTail: energyTail,
      maximumEnergyResidual: Math.max(...ensembleSnapshots.map((snapshot) => Math.abs(snapshot.conservation.relativeEnergyResidual))),
      maximumMomentumResidual: Math.max(...ensembleSnapshots.map((snapshot) => snapshot.conservation.momentumResidual)),
      maximumRawParticleMomentumResidual: Math.max(...ensembleSnapshots.map((snapshot) => snapshot.conservation.rawParticleMomentumResidual)),
      minimumCouplingCoverage: Math.min(...ensembleSnapshots.map((snapshot) => snapshot.metrics.minimumCouplingCoverage)),
      minimumReactionCount: Math.min(...ensembleSnapshots.map((snapshot) => snapshot.metrics.reactionCount)),
      deterministicContinuations: deterministicContinuations.filter(Boolean).length,
      allInDomain: ensembleSnapshots.every((snapshot) => snapshot.validityDomain.status === 'in_domain'),
    },
  };
}

function distributionSummary(values: number[], seeds: readonly number[]) {
  const sorted = [...values].sort((left, right) => left - right);
  const maximum = Math.max(...values);
  return {
    p50: quantile(sorted, 0.5),
    p95: quantile(sorted, 0.95),
    p99: quantile(sorted, 0.99),
    maximum,
    worstSeed: seeds[values.indexOf(maximum)],
  };
}

function quantile(sorted: readonly number[], probability: number) {
  const position = (sorted.length - 1) * probability;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  const fraction = position - lower;
  return sorted[lower] * (1 - fraction) + sorted[upper] * fraction;
}

function copyAction(action: WorldAction | null): WorldAction | null {
  if (!action) return null;
  return Object.freeze({ ...action, parameters: Object.freeze({ ...action.parameters }) });
}

function assertRange(label: string, value: number, minimum: number, maximum: number, integer = false) {
  if ((integer && !Number.isSafeInteger(value)) || value < minimum || value > maximum) {
    throw new WorldDomainError(`${label} is outside the validated world domain`, { value, minimum, maximum });
  }
}

function estimateBoxDimensions(count: number, density: number) {
  const columns = Math.ceil(Math.sqrt(count * 1.7));
  const rows = Math.ceil(count / columns);
  const area = count / density;
  const width = Math.sqrt(area * columns / rows);
  return { width, height: area / width };
}

function estimateHeatSubcycles(options: ResolvedWorldOptions, box: { width: number; height: number }) {
  if (options.thermalDiffusivity === 0) return 0;
  const dx = box.width / options.gridWidth;
  const dy = box.height / options.gridHeight;
  const halfStepStability = options.thermalDiffusivity * (options.timeStep / 2) * (1 / (dx * dx) + 1 / (dy * dy));
  return Math.max(1, Math.ceil(halfStepStability / 0.45));
}

function assertActionConsistency(action: WorldAction | null, state: SerializedThermochemicalWorld, step: number) {
  if (state.actionCount === 0) {
    if (action !== null) throw new Error('serialized world has an action without an action counter');
    return;
  }
  if (!action) throw new Error('serialized world action history is incomplete');
  if (action.schemaVersion !== 'tf.action/0.3' || !['step', 'set_field_temperature', 'inject_heat_pulse', 'branch'].includes(action.kind)) throw new Error('serialized world action kind is invalid');
  assertActionSemantics(action, state, step);
  const fingerprint = shortDigest({ kind: action.kind, parentStateId: action.parentStateId, resultingStateId: action.resultingStateId, appliedAtStep: action.appliedAtStep, parameters: action.parameters });
  const expectedActionId = `${state.stateNamespace}-a${state.actionCount.toString(36).padStart(5, '0')}-${fingerprint}`;
  if (action.actionId !== expectedActionId || action.resultingStateId !== state.stateId || action.appliedAtStep !== step || !action.parentStateId) throw new Error('serialized world action identity is inconsistent');
  if (state.parentStateId !== action.parentStateId) throw new Error('serialized world action parent chain is inconsistent');
  assertActionParentLineage(action, state);
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
      if (state.options.count * (state.options.count - 1) / 2 * substeps > WORLD_DOMAIN.maximumPairEvaluationsPerAction) throw new Error('serialized step action exceeds the pair-evaluation resource envelope');
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
      assertExactParameterKeys(parameters, ['deltaKelvin', 'energyReduced', 'externalEnergyReduced', 'profileVersion', 'widthFraction', 'xFraction', 'yFraction']);
      const deltaKelvin = parameters.deltaKelvin;
      const energyReduced = parameters.energyReduced;
      const externalEnergyReduced = parameters.externalEnergyReduced;
      if (!(typeof deltaKelvin === 'number'
        && Number.isFinite(deltaKelvin)
        && deltaKelvin > 0
        && deltaKelvin <= WORLD_DOMAIN.maximumPulseKelvin
        && typeof energyReduced === 'number'
        && Number.isFinite(energyReduced)
        && energyReduced > 0
        && typeof externalEnergyReduced === 'number'
        && Number.isFinite(externalEnergyReduced)
        && externalEnergyReduced > 0
        && parameters.profileVersion === CENTRAL_PULSE_PROFILE.profileVersion
        && parameters.xFraction === CENTRAL_PULSE_PROFILE.xFraction
        && parameters.yFraction === CENTRAL_PULSE_PROFILE.yFraction
        && parameters.widthFraction === CENTRAL_PULSE_PROFILE.widthFraction)) throw new Error('serialized heat-pulse action parameters are invalid');
      if (parentStep !== step) throw new Error('serialized heat-pulse action does not match its state transition');
      const expectedEnergy = deltaKelvin / ARGON_UNITS.epsilonOverKelvin
        * state.field.heatCapacityDensity * state.field.boxWidth * state.field.boxHeight
        * CENTRAL_PULSE_AREA_FRACTION;
      if (!nearlyEqual(externalEnergyReduced, expectedEnergy) || !nearlyEqual(energyReduced, expectedEnergy)) throw new Error('serialized heat-pulse action energy is inconsistent');
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

function parseWorldStateId(stateId: string) {
  if (typeof stateId !== 'string') return null;
  const match = stateId.match(/^(.+)-s([0-9a-z]{6,})r([0-9a-z]{4,})-([0-9a-f]{16})$/);
  if (!match) return null;
  const step = Number.parseInt(match[2], 36);
  const revision = Number.parseInt(match[3], 36);
  if (!Number.isSafeInteger(step) || step < 0 || !Number.isSafeInteger(revision) || revision < 0) return null;
  if (match[2] !== step.toString(36).padStart(6, '0') || match[3] !== revision.toString(36).padStart(4, '0')) return null;
  return { namespace: match[1], step, revision };
}

function stateIdStep(stateId: string) {
  return parseWorldStateId(stateId)?.step ?? null;
}

function assertActionParentLineage(action: WorldAction, state: SerializedThermochemicalWorld) {
  const parent = parseWorldStateId(action.parentStateId);
  if (!parent) throw new Error('serialized world action parent identity is invalid');
  const parameters = action.parameters as Record<string, number | string>;
  let expectedNamespace = state.stateNamespace;
  let expectedStep = state.md.step;
  let expectedRevision: number;
  switch (action.kind) {
    case 'step': {
      const substeps = parameters.substeps as number;
      expectedStep -= substeps;
      expectedRevision = state.revision - substeps - 1;
      break;
    }
    case 'set_field_temperature':
    case 'inject_heat_pulse':
      expectedRevision = state.revision - 2;
      break;
    case 'branch': {
      const suffix = `-b${(parameters.branchOrdinal as number).toString(36)}`;
      expectedNamespace = state.stateNamespace.slice(0, -suffix.length);
      expectedRevision = state.revision - 1;
      break;
    }
  }
  if (!expectedNamespace || parent.namespace !== expectedNamespace) throw new Error('serialized world action parent namespace lineage is inconsistent');
  if (expectedStep < 0 || parent.step !== expectedStep) throw new Error('serialized world action parent step is inconsistent');
  if (expectedRevision < 0 || parent.revision !== expectedRevision) throw new Error('serialized world action parent revision is inconsistent');
}

function assertNestedResourceEnvelope(state: SerializedThermochemicalWorld, expectedBox: { width: number; height: number }) {
  const md = state.md as SerializedSimulation | null | undefined;
  const field = state.field as SerializedHeatField | null | undefined;
  if (!md || typeof md !== 'object' || !md.options || typeof md.options !== 'object') throw new Error('serialized nested module failed the pre-allocation resource gate');
  if (!field || typeof field !== 'object') throw new Error('serialized nested heat field failed the pre-allocation resource gate');
  if (!Array.isArray(state.species)
    || state.species.length !== state.options.count
    || state.species.length < WORLD_DOMAIN.minimumParticleCount
    || state.species.length > WORLD_DOMAIN.maximumParticleCount) throw new Error('serialized species length failed the pre-allocation resource gate');

  const expectedModuleOptions = {
    count: state.options.count,
    density: state.options.density,
    temperatureKelvin: state.options.temperatureKelvin,
    timeStep: state.options.timeStep,
    cutoff: state.options.cutoff,
    thermostatTau: null,
    seed: state.options.seed,
  } as const;
  const nestedOptionKeys = Object.keys(md.options).sort();
  const expectedOptionKeys = Object.keys(expectedModuleOptions).sort();
  if (nestedOptionKeys.length !== expectedOptionKeys.length
    || nestedOptionKeys.some((key, index) => key !== expectedOptionKeys[index])
    || Object.entries(expectedModuleOptions).some(([key, expected]) => md.options[key as keyof typeof expectedModuleOptions] !== expected)) {
    throw new Error('serialized nested module options failed the pre-allocation resource gate');
  }
  if (!Array.isArray(md.particles)
    || md.particles.length !== state.options.count
    || md.particles.length < WORLD_DOMAIN.minimumParticleCount
    || md.particles.length > WORLD_DOMAIN.maximumParticleCount) throw new Error('serialized nested particle count failed the pre-allocation resource gate');

  const dimensionsAreValid = Number.isSafeInteger(field.width)
    && Number.isSafeInteger(field.height)
    && field.width >= WORLD_DOMAIN.minimumGridDimension
    && field.width <= WORLD_DOMAIN.maximumGridDimension
    && field.height >= WORLD_DOMAIN.minimumGridDimension
    && field.height <= WORLD_DOMAIN.maximumGridDimension
    && field.width === state.options.gridWidth
    && field.height === state.options.gridHeight;
  const cellCount = dimensionsAreValid ? field.width * field.height : Number.NaN;
  if (!dimensionsAreValid || !Number.isSafeInteger(cellCount) || cellCount > WORLD_DOMAIN.maximumGridCells) throw new Error('serialized nested grid failed the pre-allocation resource gate');
  if (!Array.isArray(field.values) || field.values.length !== cellCount || field.values.length > WORLD_DOMAIN.maximumGridCells) throw new Error('serialized nested field values failed the pre-allocation resource gate');
  if (field.diffusivity !== state.options.thermalDiffusivity
    || field.heatCapacityDensity !== state.options.fieldHeatCapacityDensity
    || !nearlyEqual(field.boxWidth, expectedBox.width)
    || !nearlyEqual(field.boxHeight, expectedBox.height)
    || !nearlyEqual(field.minimumTemperatureReduced, WORLD_DOMAIN.minimumResolvedTemperatureKelvin / ARGON_UNITS.epsilonOverKelvin)) {
    throw new Error('serialized nested field options failed the pre-allocation resource gate');
  }
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
    && field.heatCapacityDensity === state.options.fieldHeatCapacityDensity
    && nearlyEqual(field.boxWidth, md.box.width)
    && nearlyEqual(field.boxHeight, md.box.height)
    && nearlyEqual(field.minimumTemperatureReduced, WORLD_DOMAIN.minimumResolvedTemperatureKelvin / ARGON_UNITS.epsilonOverKelvin);
  if (!fieldMatches) throw new Error('heat-field configuration does not match world configuration');

  const finiteMetadata = [
    state.initialTotalEnergy,
    state.initialClosureReferenceEnergy,
    state.externalEnergy,
    state.initialMomentum.x,
    state.initialMomentum.y,
    state.reservoirMomentum.x,
    state.reservoirMomentum.y,
    state.cumulativeInterfaceEnergy,
    state.couplingCoverage,
    state.minimumCouplingCoverage,
    state.heatClosureResidual,
    state.exchangeClosureResidual,
    state.reactionClosureResidual,
    state.heatClosureMaximum,
    state.exchangeClosureMaximum,
    state.reactionClosureMaximum,
  ].every(Number.isFinite);
  if (!finiteMetadata) throw new Error('serialized world metadata must be finite');
  if (state.initialClosureReferenceEnergy < 1
    || state.cumulativeInterfaceEnergy < 0
    || state.couplingCoverage < 0
    || state.couplingCoverage > 1
    || state.minimumCouplingCoverage < 0
    || state.minimumCouplingCoverage > 1
    || state.minimumCouplingCoverage > Math.max(state.couplingCoverage, Number(state.md.step === 0))
    || state.heatClosureResidual < 0
    || state.exchangeClosureResidual < 0
    || state.reactionClosureResidual < 0
    || state.heatClosureMaximum < 0
    || state.exchangeClosureMaximum < 0
    || state.reactionClosureMaximum < 0
    || state.heatClosureMaximum > state.heatClosureResidual + 1e-20
    || state.exchangeClosureMaximum > state.exchangeClosureResidual + 1e-20
    || state.reactionClosureMaximum > state.reactionClosureResidual + 1e-20) throw new Error('serialized world diagnostics are invalid');
}

function worldOptionsFingerprint(options: ResolvedWorldOptions) {
  return shortDigest([
    options.count,
    options.density,
    options.temperatureKelvin,
    options.timeStep,
    options.cutoff,
    options.seed,
    options.gridWidth,
    options.gridHeight,
    options.thermalDiffusivity,
    options.fieldHeatCapacityDensity,
    options.couplingTau,
    options.reactionPreexponential,
    options.reactionActivationReduced,
    options.reactionHeatReduced,
  ]);
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
