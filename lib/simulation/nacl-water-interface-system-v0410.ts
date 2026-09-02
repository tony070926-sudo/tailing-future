import { digestValue } from './digest.ts';

/**
 * v0.4.10 is a solver-input foundation for a future NaCl{100}-water interface.
 *
 * It builds one deterministic, fully periodic geometric coordinate seed with
 * explicit Na, Cl, O and H sites.  It does not minimize, equilibrate, execute
 * OpenMM, or infer interface thermodynamics.  The action evaluator below is
 * intentionally fail-closed while the frozen prerequisite gates are absent.
 */

export const NACL_WATER_INTERFACE_SYSTEM_VERSION_V0410 =
  'tf.nacl-water-interface-system/0.4.10' as const;
export const NACL_WATER_INTERFACE_COORDINATE_SEED_VERSION_V0410 =
  'tf.nacl-water-interface-coordinate-seed/0.4.10' as const;
export const NACL_WATER_INTERFACE_ACTION_VERSION_V0410 =
  'tf.nacl-water-interface-action/0.4.10' as const;
export const NACL_WATER_INTERFACE_OBSERVATION_VERSION_V0410 =
  'tf.nacl-water-interface-observation/0.4.10' as const;

const SYSTEM_ID = 'nacl-100-tip3p-balanced-double-interface-6x6x4-geometric-seed' as const;
const SEED_ID = 'nacl-100-tip3p-balanced-double-interface-6x6x4-seed-20260902' as const;
const LATTICE_CONSTANT_NANOMETER = 0.56402 as const;
const CRYSTAL_REPEATS = [6, 6, 4] as const;
const WATER_GRID_PER_REGION = [12, 12, 6] as const;
const CRYSTAL_CELL_COUNT = 6 * 6 * 4;
const FORMULA_UNITS_PER_CONVENTIONAL_CELL = 4;
const IONS_PER_CONVENTIONAL_CELL = 8;
const SODIUM_COUNT = CRYSTAL_CELL_COUNT * FORMULA_UNITS_PER_CONVENTIONAL_CELL;
const CHLORIDE_COUNT = SODIUM_COUNT;
const ION_COUNT = CRYSTAL_CELL_COUNT * IONS_PER_CONVENTIONAL_CELL;
const WATER_COUNT_PER_REGION = 12 * 12 * 6;
const WATER_COUNT = 2 * WATER_COUNT_PER_REGION;
const PARTICLE_COUNT = ION_COUNT + 3 * WATER_COUNT;
const WATER_BOND_COUNT = 2 * WATER_COUNT;
const WATER_CONSTRAINT_COUNT = 3 * WATER_COUNT;
const WATER_MASS_DALTON = 18.015324;
const SODIUM_MASS_DALTON = 22.99;
const CHLORIDE_MASS_DALTON = 35.45;
const OXYGEN_MASS_DALTON = 15.99943;
const HYDROGEN_MASS_DALTON = 1.007947;
const OH_DISTANCE_NANOMETER = 0.09572;
const HH_DISTANCE_NANOMETER = 0.15139006545247014;
const HOH_ANGLE_RADIAN = 1.82421813418;
const CELL_LENGTH_X_NANOMETER = 6 * LATTICE_CONSTANT_NANOMETER;
const CELL_LENGTH_Y_NANOMETER = 6 * LATTICE_CONSTANT_NANOMETER;
const CELL_LENGTH_Z_NANOMETER = 12 * LATTICE_CONSTANT_NANOMETER;
const NOMINAL_SLAB_THICKNESS_NANOMETER = 4 * LATTICE_CONSTANT_NANOMETER;
const NOMINAL_WATER_THICKNESS_PER_SIDE_NANOMETER = 4 * LATTICE_CONSTANT_NANOMETER;
const COMBINED_WATER_THICKNESS_NANOMETER = 8 * LATTICE_CONSTANT_NANOMETER;
const FIRST_CRYSTAL_PLANE_Z_NANOMETER = 4.25 * LATTICE_CONSTANT_NANOMETER;
const LAST_CRYSTAL_PLANE_Z_NANOMETER = 7.75 * LATTICE_CONSTANT_NANOMETER;
const PERIODIC_SURFACE_PLANE_SEPARATION_NANOMETER =
  CELL_LENGTH_Z_NANOMETER - LAST_CRYSTAL_PLANE_Z_NANOMETER
  + FIRST_CRYSTAL_PLANE_Z_NANOMETER;
const DALTON_PER_NANOMETER3_TO_KG_PER_METER3 = 1.6605390666;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const COORDINATE_TOLERANCE_NANOMETER = 1e-12;
const LOCKED_PLAN_DIGEST =
  'sha256:f6f271d255de31ab655e62b7539b65e58a4e85994870232b675ef7b40f2fd0b8' as const;
const LOCKED_SYSTEM_DIGEST =
  'sha256:d47785bc641fd6483c58b8549bf7c0dc7e116a5892c0c13864c98e87c712133a' as const;
const LOCKED_COORDINATE_SEED_DIGEST =
  'sha256:beb7f2c4f997e2e8b8158a05d6083a7d6569bd1f11457f922844646cac0cc426' as const;

type Vector3 = Readonly<{ x: number; y: number; z: number }>;
type Int3 = readonly [number, number, number];
type Element = 'Na' | 'Cl' | 'O' | 'H';
type WaterRegion = 'lower-water-region' | 'upper-water-region';

const ROCKSALT_BASIS = Object.freeze([
  basis('Na', 0, 0, 0),
  basis('Na', 0, 0.5, 0.5),
  basis('Na', 0.5, 0, 0.5),
  basis('Na', 0.5, 0.5, 0),
  basis('Cl', 0.5, 0.5, 0.5),
  basis('Cl', 0.5, 0, 0),
  basis('Cl', 0, 0.5, 0),
  basis('Cl', 0, 0, 0.5),
] as const);

const WATER_ORIENTATIONS = Object.freeze([
  orientation('+x', vector(1, 0, 0), vector(0, 1, 0)),
  orientation('-x', vector(-1, 0, 0), vector(0, 1, 0)),
  orientation('+y', vector(0, 1, 0), vector(0, 0, 1)),
  orientation('-y', vector(0, -1, 0), vector(0, 0, 1)),
  orientation('+z', vector(0, 0, 1), vector(1, 0, 0)),
  orientation('-z', vector(0, 0, -1), vector(1, 0, 0)),
] as const);

const REQUIRED_GATES = Object.freeze([
  gate(
    'pure-water-openmm-control',
    'protected OpenMM 8.6 Reference replay and CPU fixed-coordinate comparison',
  ),
  gate(
    'single-pair-low-salt-pme-control',
    'same force-family periodic water plus one neutral NaCl pair with preregistered bulk gates',
  ),
  gate(
    'dry-nacl-100-slab-stability-control',
    'mobile dry slab stability, force closure and lattice-order audit',
  ),
  gate(
    'solid-water-interface-potential-domain-qualification',
    'independent evidence that the selected potential is valid for solid, solution and interface use',
  ),
] as const);

export type NaClWaterInterfaceSourcePinV0410 = Readonly<{
  sourceId: string;
  role: 'crystal-structure-reference' | 'candidate-parameter-input' | 'license-notices';
  owner: 'NIST/NBS' | 'OpenMM';
  title: string;
  url: string;
  doi: string | null;
  repository: string | null;
  release: string | null;
  commit: string | null;
  path: string | null;
  byteCount: number;
  sha256: string;
  evidenceStatus: 'downloaded-byte-pin' | 'pinned-upstream-byte-identity';
  redistributionCleared: false;
}>;

export type NaClWaterInterfaceGateV0410 = Readonly<{
  gateId:
    | 'pure-water-openmm-control'
    | 'single-pair-low-salt-pme-control'
    | 'dry-nacl-100-slab-stability-control'
    | 'solid-water-interface-potential-domain-qualification';
  requirement: string;
  status: 'required-not-satisfied';
  receiptDigest: null;
}>;

export type NaClWaterInterfaceSystemV0410 = Readonly<{
  schemaVersion: typeof NACL_WATER_INTERFACE_SYSTEM_VERSION_V0410;
  systemId: typeof SYSTEM_ID;
  status: 'geometric-coordinate-seed-not-executed';
  systemDigest: string;
  scientificIdentity: Readonly<{
    role: 'pre-equilibration-balanced-double-interface-nacl-100-water-coordinate-seed';
    surfaceFamily: '{100}';
    representedPlane: '(001)-cubic-equivalent-member-of-{100}';
    surfaceNormalMiller: readonly [0, 0, 1];
    surfaceNormalCartesianAxis: 'z';
    interfaceCount: 2;
    vacuumRegionPresent: false;
    slabCorrectionRequiredByConstruction: false;
  }>;
  sourcePins: ReadonlyArray<NaClWaterInterfaceSourcePinV0410>;
  composition: Readonly<{
    conventionalCellCount: number;
    sodiumIonCount: number;
    chlorideIonCount: number;
    crystalIonCount: number;
    waterMoleculeCount: number;
    waterCountPerRegion: number;
    particleCount: number;
    residueCount: number;
    structuralWaterBondCount: number;
    rigidWaterConstraintCount: number;
    totalFormalChargeE: 0;
    totalModelPointChargeE: 0;
    totalMassDalton: number;
    nominalWaterSeedDensityKgM3: number;
  }>;
  periodicCell: Readonly<{
    kind: 'orthorhombic-fully-periodic';
    vectorsNanometer: readonly [Vector3, Vector3, Vector3];
    lengthsNanometer: Vector3;
    periodicAxes: readonly [true, true, true];
    volumeNanometer3: number;
    nominalSlabThicknessNanometer: number;
    nominalWaterThicknessPerSideNanometer: number;
    combinedWaterThicknessNanometer: number;
    periodicSurfacePlaneSeparationNanometer: number;
    twoWaterRegionsHaveEqualCompositionAndPackingRecipe: true;
  }>;
  crystalConstruction: Readonly<{
    algorithm: 'replicated-fm-3m-conventional-basis-v0410';
    spaceGroup: 'Fm-3m';
    latticeConstantNanometer: number;
    latticeConstantTemperatureCelsius: 26;
    latticeConstantRole: 'experimental-geometric-seed-not-force-field-equilibrium';
    conventionalCellRepeats: typeof CRYSTAL_REPEATS;
    formulaUnitsPerConventionalCell: 4;
    basis: typeof ROCKSALT_BASIS;
    atomicPlaneCount: 8;
    ionsPerAtomicPlane: 144;
    sodiumPerAtomicPlane: 72;
    chloridePerAtomicPlane: 72;
    planeFormalChargeE: 0;
    firstPlaneZNanometer: number;
    lastPlaneZNanometer: number;
    lowerAndUpperTermination: 'neutral-mixed-na-cl-{100}-planes';
  }>;
  waterConstruction: Readonly<{
    algorithm: 'balanced-six-orientation-rigid-tip3p-grid-seed-v0410';
    role: 'deterministic-pre-minimization-packing-not-equilibrated-water';
    gridsPerRegion: typeof WATER_GRID_PER_REGION;
    regionOrder: readonly ['lower-water-region', 'upper-water-region'];
    oxygenHydrogenDistanceNanometer: number;
    hydrogenHydrogenDistanceNanometer: number;
    hydrogenOxygenHydrogenAngleRadian: number;
    orientationIds: readonly ['+x', '-x', '+y', '-y', '+z', '-z'];
    occurrencesPerOrientationPerRegion: 144;
    netDipoleDirectionSumPerRegion: Vector3;
  }>;
  coordinateContract: Readonly<{
    seedId: typeof SEED_ID;
    algorithmVersion: typeof NACL_WATER_INTERFACE_COORDINATE_SEED_VERSION_V0410;
    unit: 'nanometer';
    atomOrder: 'crystal-cell-z-y-x-basis-then-lower-water-z-y-x-ohh-then-upper-water-z-y-x-ohh';
    wrapping: 'all-sites-inside-primary-cell-no-post-generation-wrap';
    coordinateConstructionDigest: string;
    coordinatePayloadDigest: string;
    topologyDigest: string;
  }>;
  candidateForceModel: Readonly<{
    familyId: 'openmm-amber14-tip3p-joung-cheatham-candidate';
    waterModel: 'rigid-TIP3P';
    ionModel: 'Joung-Cheatham-monovalent-ions-for-TIP3P';
    combiningRule: 'Lorentz-Berthelot';
    electrostaticsPlan: 'three-dimensional-PME';
    cutoffNanometer: 1;
    dispersionCorrection: true;
    solidInterfaceDomainValidated: false;
    saturationOrPhaseEquilibriumValidated: false;
    executionEligibility: 'blocked-until-all-prerequisite-gates-have-independent-receipts';
  }>;
  prerequisiteGates: typeof REQUIRED_GATES;
  plannedReadouts: Readonly<{
    availableFromGeometricSeed: readonly [
      'atom-identity-formal-and-model-point-charge',
      'exact-coordinate-and-cell',
      'crystal-layer-and-surface-labels',
      'rigid-water-topology',
    ];
    requireExecutedVerifiedTrajectory: readonly [
      'energy-and-potential-force',
      'z-resolved-species-density',
      'water-dipole-orientation',
      'na-o-cl-h-cl-o-geometric-coordination',
      'surface-site-displacement-and-occupancy',
    ];
    requireQualifiedPotentialAndMultiSeedStatistics: readonly [
      'persistent-detachment-and-reattachment-events',
      'largest-crystal-cluster-and-local-q8',
      'dissolution-or-crystallization-rate',
    ];
  }>;
  evidenceSemantics: Readonly<{
    coordinateConstructionExecutedLocally: true;
    molecularDynamicsExecuted: false;
    openmmExecuted: false;
    pmeExecuted: false;
    minimized: false;
    equilibrated: false;
    trajectoryAvailable: false;
    forceOrEnergyAvailable: false;
    protectedMainArtifact: false;
  }>;
  claimBoundaries: Readonly<{
    lowSaltQualified: false;
    drySlabQualified: false;
    interfacePotentialQualified: false;
    interfaceDynamicsSimulated: false;
    hydrationStructureMeasured: false;
    dissolutionObserved: false;
    crystallizationObserved: false;
    kineticRateEstimated: false;
    electronicStructureComputed: false;
    learnedWorldModelTrained: false;
    industrialPrediction: false;
    publicReleaseEligible: false;
  }>;
}>;

export type NaClWaterInterfaceAtomV0410 = Readonly<{
  atomIndex: number;
  atomId: string;
  moleculeId: string;
  residueId: string;
  element: Element;
  species: 'Na+' | 'Cl-' | 'TIP3P-O' | 'TIP3P-H';
  phase: 'solid-coordinate-seed' | 'water-coordinate-seed';
  formalChargeE: -1 | 0 | 1;
  modelPointChargeE: -1 | -0.834 | 0.417 | 1;
  massDalton: number;
  positionNanometer: Vector3;
  crystalSite: Readonly<{
    cellIndex: Int3;
    basisIndex: number;
    layerIndex: number;
    surfaceRole: 'lower-surface-plane' | 'upper-surface-plane' | 'interior-plane';
  }> | null;
  waterSite: Readonly<{
    region: WaterRegion;
    gridIndex: Int3;
    orientationId: '+x' | '-x' | '+y' | '-y' | '+z' | '-z';
    siteRole: 'O' | 'H1' | 'H2';
  }> | null;
}>;

export type NaClWaterInterfaceBondV0410 = Readonly<{
  bondId: string;
  atomAIndex: number;
  atomBIndex: number;
  atomAId: string;
  atomBId: string;
  role: 'structural-rigid-water-oh-link';
  energeticInteraction: false;
}>;

export type NaClWaterInterfaceConstraintV0410 = Readonly<{
  constraintId: string;
  atomAIndex: number;
  atomBIndex: number;
  atomAId: string;
  atomBId: string;
  sitePair: 'O-H1' | 'O-H2' | 'H1-H2';
  targetDistanceNanometer: number;
}>;

export type NaClWaterInterfaceCoordinateSeedV0410 = Readonly<{
  schemaVersion: typeof NACL_WATER_INTERFACE_COORDINATE_SEED_VERSION_V0410;
  seedId: typeof SEED_ID;
  status: 'geometric-coordinate-seed-not-minimized-or-executed';
  systemId: typeof SYSTEM_ID;
  systemDigest: string;
  atoms: ReadonlyArray<NaClWaterInterfaceAtomV0410>;
  structuralBonds: ReadonlyArray<NaClWaterInterfaceBondV0410>;
  rigidConstraints: ReadonlyArray<NaClWaterInterfaceConstraintV0410>;
  constructionReceipt: Readonly<{
    atomCount: number;
    sodiumIonCount: number;
    chlorideIonCount: number;
    waterMoleculeCount: number;
    lowerWaterCount: number;
    upperWaterCount: number;
    crystalLayerCount: number;
    neutralCrystalLayerCount: number;
    balancedWaterOrientationRegions: 2;
    allSitesInsidePrimaryCell: true;
    totalFormalChargeE: 0;
    totalModelPointChargeE: 0;
    totalMassDalton: number;
    minimumDifferentMoleculeDistanceNanometer: number;
    coordinatePayloadDigest: string;
    topologyDigest: string;
  }>;
  seedDigest: string;
}>;

export type NaClWaterInterfaceActionV0410 = Readonly<{
  schemaVersion: typeof NACL_WATER_INTERFACE_ACTION_VERSION_V0410;
  actionId: string;
  parentSystemDigest: string;
  kind: 'inspect-coordinate-seed' | 'request-interface-preparation' | 'request-mobile-interface-dynamics';
  requestedSeedDigest: string;
  actionDigest: string;
}>;

export type NaClWaterInterfaceObservationV0410 = Readonly<{
  schemaVersion: typeof NACL_WATER_INTERFACE_OBSERVATION_VERSION_V0410;
  observationId: string;
  actionDigest: string;
  systemDigest: string;
  coordinateSeedDigest: string;
  outcome: 'accepted-read-only-inspection' | 'blocked-prerequisite-gates-unsatisfied';
  stateMutationPerformed: false;
  solverInvoked: false;
  unmetGateIds: ReadonlyArray<NaClWaterInterfaceGateV0410['gateId']>;
  availableEvidence: readonly [
    'atom-identity-formal-and-model-point-charge',
    'exact-coordinate-and-cell',
    'crystal-layer-and-surface-labels',
    'rigid-water-topology',
  ];
  unavailableEvidence: ReadonlyArray<string>;
  observationDigest: string;
}>;

export type NaClWaterInterfacePlanV0410 = Readonly<{
  system: NaClWaterInterfaceSystemV0410;
  coordinateSeed: NaClWaterInterfaceCoordinateSeedV0410;
  planDigest: string;
}>;

export function createNaClWaterInterfacePlanV0410(): NaClWaterInterfacePlanV0410 {
  const coordinateSeedPayload = buildCoordinateSeedPayload();
  const coordinatePayloadDigest = digestValue(coordinateSeedPayload.atoms.map((atom) => ({
    atomIndex: atom.atomIndex,
    atomId: atom.atomId,
    positionNanometer: atom.positionNanometer,
  })));
  const topologyDigest = digestValue({
    atomIdentity: coordinateSeedPayload.atoms.map((atom) => ({
      atomIndex: atom.atomIndex,
      atomId: atom.atomId,
      moleculeId: atom.moleculeId,
      residueId: atom.residueId,
      element: atom.element,
      species: atom.species,
      phase: atom.phase,
      formalChargeE: atom.formalChargeE,
      modelPointChargeE: atom.modelPointChargeE,
      massDalton: atom.massDalton,
      crystalSite: atom.crystalSite,
      waterSite: atom.waterSite,
    })),
    structuralBonds: coordinateSeedPayload.structuralBonds,
    rigidConstraints: coordinateSeedPayload.rigidConstraints,
  });
  const compactConstruction = constructionReceipt(
    coordinateSeedPayload,
    coordinatePayloadDigest,
    topologyDigest,
  );
  const seedDigestWithoutSystem = digestValue({
    ...coordinateSeedPayload,
    constructionReceipt: compactConstruction,
  });
  const systemPayload = buildSystemPayload(
    seedDigestWithoutSystem,
    coordinatePayloadDigest,
    topologyDigest,
  );
  const system = deepFreeze({ ...systemPayload, systemDigest: digestValue(systemPayload) });
  const seedPayload = {
    ...coordinateSeedPayload,
    systemDigest: system.systemDigest,
    constructionReceipt: compactConstruction,
  };
  const coordinateSeed = deepFreeze({ ...seedPayload, seedDigest: digestValue(seedPayload) });
  const planPayload = { system, coordinateSeed };
  return deepFreeze({ ...planPayload, planDigest: digestValue(planPayload) });
}

export function createNaClWaterInterfaceActionV0410(
  kind: NaClWaterInterfaceActionV0410['kind'],
  actionId: string,
  candidatePlan?: unknown,
): NaClWaterInterfaceActionV0410 {
  const plan = resolvePlan(candidatePlan);
  assertStableToken(actionId, 'actionId');
  if (![
    'inspect-coordinate-seed',
    'request-interface-preparation',
    'request-mobile-interface-dynamics',
  ].includes(kind)) throw new Error('unknown NaCl-water interface action kind');
  const payload = {
    schemaVersion: NACL_WATER_INTERFACE_ACTION_VERSION_V0410,
    actionId,
    parentSystemDigest: plan.system.systemDigest,
    kind,
    requestedSeedDigest: plan.coordinateSeed.seedDigest,
  };
  return deepFreeze({ ...payload, actionDigest: digestValue(payload) });
}

export function observeNaClWaterInterfaceActionV0410(
  candidate: unknown,
  candidatePlan?: unknown,
): NaClWaterInterfaceObservationV0410 {
  const plan = resolvePlan(candidatePlan);
  const action = assertActionAgainstValidatedPlan(candidate, plan);
  return buildObservation(action, plan);
}

function buildObservation(
  action: NaClWaterInterfaceActionV0410,
  plan: NaClWaterInterfacePlanV0410,
): NaClWaterInterfaceObservationV0410 {
  const inspection = action.kind === 'inspect-coordinate-seed';
  const unmetGateIds = inspection
    ? []
    : plan.system.prerequisiteGates.map((item) => item.gateId);
  const payload = {
    schemaVersion: NACL_WATER_INTERFACE_OBSERVATION_VERSION_V0410,
    observationId: `${action.actionId}:observation`,
    actionDigest: action.actionDigest,
    systemDigest: plan.system.systemDigest,
    coordinateSeedDigest: plan.coordinateSeed.seedDigest,
    outcome: inspection
      ? 'accepted-read-only-inspection' as const
      : 'blocked-prerequisite-gates-unsatisfied' as const,
    stateMutationPerformed: false as const,
    solverInvoked: false as const,
    unmetGateIds,
    availableEvidence: plan.system.plannedReadouts.availableFromGeometricSeed,
    unavailableEvidence: inspection
      ? [
        ...plan.system.plannedReadouts.requireExecutedVerifiedTrajectory,
        ...plan.system.plannedReadouts.requireQualifiedPotentialAndMultiSeedStatistics,
      ]
      : [
        'interface-preparation',
        'interface-dynamics',
        ...plan.system.plannedReadouts.requireExecutedVerifiedTrajectory,
        ...plan.system.plannedReadouts.requireQualifiedPotentialAndMultiSeedStatistics,
      ],
  };
  return deepFreeze({ ...payload, observationDigest: digestValue(payload) });
}

export function assertNaClWaterInterfacePlanV0410(
  candidate: unknown,
): NaClWaterInterfacePlanV0410 {
  const clone = clonePlain(candidate, 'NaCl-water interface plan') as NaClWaterInterfacePlanV0410;
  assertExactKeys(clone, ['system', 'coordinateSeed', 'planDigest'], 'NaCl-water interface plan');
  if (!DIGEST.test(clone.planDigest) || clone.planDigest !== LOCKED_PLAN_DIGEST) {
    throw new Error('NaCl-water interface plan digest differs from the locked plan');
  }
  if (digestValue({ system: clone.system, coordinateSeed: clone.coordinateSeed }) !== clone.planDigest) {
    throw new Error('NaCl-water interface plan self digest is invalid');
  }
  if (clone.system.systemDigest !== LOCKED_SYSTEM_DIGEST
    || digestValue(withoutKey(
      clone.system as unknown as Record<string, unknown>,
      'systemDigest',
    )) !== clone.system.systemDigest) {
    throw new Error('NaCl-water interface system identity or self digest is invalid');
  }
  if (clone.coordinateSeed.seedDigest !== LOCKED_COORDINATE_SEED_DIGEST
    || clone.coordinateSeed.systemDigest !== clone.system.systemDigest
    || digestValue(withoutKey(
      clone.coordinateSeed as unknown as Record<string, unknown>,
      'seedDigest',
    )) !== clone.coordinateSeed.seedDigest) {
    throw new Error('NaCl-water interface coordinate-seed identity or self digest is invalid');
  }
  return deepFreeze(clone);
}

function resolvePlan(candidatePlan: unknown | undefined): NaClWaterInterfacePlanV0410 {
  return candidatePlan === undefined
    ? createNaClWaterInterfacePlanV0410()
    : assertNaClWaterInterfacePlanV0410(candidatePlan);
}

export function assertNaClWaterInterfaceActionV0410(
  candidate: unknown,
  candidatePlan?: unknown,
): NaClWaterInterfaceActionV0410 {
  const plan = resolvePlan(candidatePlan);
  return assertActionAgainstValidatedPlan(candidate, plan);
}

function assertActionAgainstValidatedPlan(
  candidate: unknown,
  plan: NaClWaterInterfacePlanV0410,
): NaClWaterInterfaceActionV0410 {
  const clone = clonePlain(candidate, 'NaCl-water interface action') as NaClWaterInterfaceActionV0410;
  assertExactKeys(clone, [
    'schemaVersion', 'actionId', 'parentSystemDigest', 'kind', 'requestedSeedDigest', 'actionDigest',
  ], 'NaCl-water interface action');
  if (clone.schemaVersion !== NACL_WATER_INTERFACE_ACTION_VERSION_V0410) {
    throw new Error('NaCl-water interface action schema changed');
  }
  assertStableToken(clone.actionId, 'actionId');
  if (![
    'inspect-coordinate-seed',
    'request-interface-preparation',
    'request-mobile-interface-dynamics',
  ].includes(clone.kind)) throw new Error('unknown NaCl-water interface action kind');
  if (clone.parentSystemDigest !== plan.system.systemDigest
    || clone.requestedSeedDigest !== plan.coordinateSeed.seedDigest) {
    throw new Error('NaCl-water interface action is not bound to the locked system and coordinate seed');
  }
  const payload = withoutKey(clone, 'actionDigest');
  if (!DIGEST.test(clone.actionDigest) || digestValue(payload) !== clone.actionDigest) {
    throw new Error('NaCl-water interface action self digest is invalid');
  }
  return deepFreeze(clone);
}

export function assertNaClWaterInterfaceObservationV0410(
  candidate: unknown,
  action: NaClWaterInterfaceActionV0410,
  candidatePlan?: unknown,
): NaClWaterInterfaceObservationV0410 {
  const plan = resolvePlan(candidatePlan);
  const validatedAction = assertActionAgainstValidatedPlan(action, plan);
  const clone = clonePlain(
    candidate,
    'NaCl-water interface observation',
  ) as NaClWaterInterfaceObservationV0410;
  const expected = buildObservation(validatedAction, plan);
  if (!DIGEST.test(clone.observationDigest)
    || digestValue(withoutKey(clone, 'observationDigest')) !== clone.observationDigest) {
    throw new Error('NaCl-water interface observation self digest is invalid');
  }
  assertExactValue(clone, expected, 'NaCl-water interface observation');
  return deepFreeze(clone);
}

export function computeMinimumDifferentMoleculeDistanceV0410(
  atoms: ReadonlyArray<NaClWaterInterfaceAtomV0410>,
): number {
  if (atoms.length !== PARTICLE_COUNT) throw new Error('minimum-distance audit requires all 6,336 atoms');
  const lengths = [
    CELL_LENGTH_X_NANOMETER,
    CELL_LENGTH_Y_NANOMETER,
    CELL_LENGTH_Z_NANOMETER,
  ] as const;
  const binCounts = [9, 9, 19] as const;
  const binWidths = lengths.map((length, index) => length / binCounts[index]) as unknown as [number, number, number];
  const bins = new Map<string, number[]>();
  const moleculeIds = new Set<string>();
  for (const [arrayIndex, atom] of atoms.entries()) {
    if (atom.atomIndex !== arrayIndex) {
      throw new Error('minimum-distance audit requires atomIndex to be a zero-based array bijection');
    }
    if (typeof atom.moleculeId !== 'string' || atom.moleculeId.length === 0) {
      throw new Error('minimum-distance audit requires bounded molecule identities');
    }
    const coordinates = [atom.positionNanometer.x, atom.positionNanometer.y, atom.positionNanometer.z];
    if (coordinates.some((value, axis) => (
      !Number.isFinite(value) || value < 0 || value >= lengths[axis]
    ))) throw new Error('minimum-distance audit requires coordinates inside the primary cell');
    moleculeIds.add(atom.moleculeId);
    const bin = coordinates.map((value, axis) => Math.min(
      binCounts[axis] - 1,
      Math.floor(value / binWidths[axis]),
    )) as [number, number, number];
    const key = bin.join(':');
    const values = bins.get(key) ?? [];
    values.push(atom.atomIndex);
    bins.set(key, values);
  }
  if (moleculeIds.size < 2) {
    throw new Error('minimum-distance audit requires at least two distinct molecules');
  }
  let minimum = Number.POSITIVE_INFINITY;
  for (const atom of atoms) {
    const coordinates = [atom.positionNanometer.x, atom.positionNanometer.y, atom.positionNanometer.z];
    const centerBin = coordinates.map((value, axis) => Math.min(
      binCounts[axis] - 1,
      Math.floor(value / binWidths[axis]),
    )) as [number, number, number];
    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const neighboringBin = [dx, dy, dz].map((offset, axis) => (
            (centerBin[axis] + offset + binCounts[axis]) % binCounts[axis]
          ));
          for (const otherIndex of bins.get(neighboringBin.join(':')) ?? []) {
            if (otherIndex <= atom.atomIndex) continue;
            const other = atoms[otherIndex];
            if (other.moleculeId === atom.moleculeId) continue;
            const displacement = [
              other.positionNanometer.x - atom.positionNanometer.x,
              other.positionNanometer.y - atom.positionNanometer.y,
              other.positionNanometer.z - atom.positionNanometer.z,
            ].map((value, axis) => value - lengths[axis] * Math.round(value / lengths[axis]));
            const distance = Math.hypot(...displacement);
            if (distance < minimum) minimum = distance;
          }
        }
      }
    }
  }
  if (!Number.isFinite(minimum) || minimum <= 0) throw new Error('minimum-distance audit failed');
  return minimum;
}

function buildSystemPayload(
  coordinateConstructionDigest: string,
  coordinatePayloadDigest: string,
  topologyDigest: string,
): Omit<NaClWaterInterfaceSystemV0410, 'systemDigest'> {
  const waterVolume = CELL_LENGTH_X_NANOMETER
    * CELL_LENGTH_Y_NANOMETER
    * COMBINED_WATER_THICKNESS_NANOMETER;
  const totalMass = WATER_COUNT * WATER_MASS_DALTON
    + SODIUM_COUNT * SODIUM_MASS_DALTON
    + CHLORIDE_COUNT * CHLORIDE_MASS_DALTON;
  return {
    schemaVersion: NACL_WATER_INTERFACE_SYSTEM_VERSION_V0410,
    systemId: SYSTEM_ID,
    status: 'geometric-coordinate-seed-not-executed',
    scientificIdentity: {
      role: 'pre-equilibration-balanced-double-interface-nacl-100-water-coordinate-seed',
      surfaceFamily: '{100}',
      representedPlane: '(001)-cubic-equivalent-member-of-{100}',
      surfaceNormalMiller: [0, 0, 1],
      surfaceNormalCartesianAxis: 'z',
      interfaceCount: 2,
      vacuumRegionPresent: false,
      slabCorrectionRequiredByConstruction: false,
    },
    sourcePins: sourcePins(),
    composition: {
      conventionalCellCount: CRYSTAL_CELL_COUNT,
      sodiumIonCount: SODIUM_COUNT,
      chlorideIonCount: CHLORIDE_COUNT,
      crystalIonCount: ION_COUNT,
      waterMoleculeCount: WATER_COUNT,
      waterCountPerRegion: WATER_COUNT_PER_REGION,
      particleCount: PARTICLE_COUNT,
      residueCount: ION_COUNT + WATER_COUNT,
      structuralWaterBondCount: WATER_BOND_COUNT,
      rigidWaterConstraintCount: WATER_CONSTRAINT_COUNT,
      totalFormalChargeE: 0,
      totalModelPointChargeE: 0,
      totalMassDalton: totalMass,
      nominalWaterSeedDensityKgM3:
        WATER_COUNT * WATER_MASS_DALTON / waterVolume * DALTON_PER_NANOMETER3_TO_KG_PER_METER3,
    },
    periodicCell: {
      kind: 'orthorhombic-fully-periodic',
      vectorsNanometer: [
        vector(CELL_LENGTH_X_NANOMETER, 0, 0),
        vector(0, CELL_LENGTH_Y_NANOMETER, 0),
        vector(0, 0, CELL_LENGTH_Z_NANOMETER),
      ],
      lengthsNanometer: vector(
        CELL_LENGTH_X_NANOMETER,
        CELL_LENGTH_Y_NANOMETER,
        CELL_LENGTH_Z_NANOMETER,
      ),
      periodicAxes: [true, true, true],
      volumeNanometer3: CELL_LENGTH_X_NANOMETER
        * CELL_LENGTH_Y_NANOMETER
        * CELL_LENGTH_Z_NANOMETER,
      nominalSlabThicknessNanometer: NOMINAL_SLAB_THICKNESS_NANOMETER,
      nominalWaterThicknessPerSideNanometer: NOMINAL_WATER_THICKNESS_PER_SIDE_NANOMETER,
      combinedWaterThicknessNanometer: COMBINED_WATER_THICKNESS_NANOMETER,
      periodicSurfacePlaneSeparationNanometer: PERIODIC_SURFACE_PLANE_SEPARATION_NANOMETER,
      twoWaterRegionsHaveEqualCompositionAndPackingRecipe: true,
    },
    crystalConstruction: {
      algorithm: 'replicated-fm-3m-conventional-basis-v0410',
      spaceGroup: 'Fm-3m',
      latticeConstantNanometer: LATTICE_CONSTANT_NANOMETER,
      latticeConstantTemperatureCelsius: 26,
      latticeConstantRole: 'experimental-geometric-seed-not-force-field-equilibrium',
      conventionalCellRepeats: CRYSTAL_REPEATS,
      formulaUnitsPerConventionalCell: FORMULA_UNITS_PER_CONVENTIONAL_CELL,
      basis: ROCKSALT_BASIS,
      atomicPlaneCount: 8,
      ionsPerAtomicPlane: 144,
      sodiumPerAtomicPlane: 72,
      chloridePerAtomicPlane: 72,
      planeFormalChargeE: 0,
      firstPlaneZNanometer: FIRST_CRYSTAL_PLANE_Z_NANOMETER,
      lastPlaneZNanometer: LAST_CRYSTAL_PLANE_Z_NANOMETER,
      lowerAndUpperTermination: 'neutral-mixed-na-cl-{100}-planes',
    },
    waterConstruction: {
      algorithm: 'balanced-six-orientation-rigid-tip3p-grid-seed-v0410',
      role: 'deterministic-pre-minimization-packing-not-equilibrated-water',
      gridsPerRegion: WATER_GRID_PER_REGION,
      regionOrder: ['lower-water-region', 'upper-water-region'],
      oxygenHydrogenDistanceNanometer: OH_DISTANCE_NANOMETER,
      hydrogenHydrogenDistanceNanometer: HH_DISTANCE_NANOMETER,
      hydrogenOxygenHydrogenAngleRadian: HOH_ANGLE_RADIAN,
      orientationIds: ['+x', '-x', '+y', '-y', '+z', '-z'],
      occurrencesPerOrientationPerRegion: 144,
      netDipoleDirectionSumPerRegion: vector(0, 0, 0),
    },
    coordinateContract: {
      seedId: SEED_ID,
      algorithmVersion: NACL_WATER_INTERFACE_COORDINATE_SEED_VERSION_V0410,
      unit: 'nanometer',
      atomOrder: 'crystal-cell-z-y-x-basis-then-lower-water-z-y-x-ohh-then-upper-water-z-y-x-ohh',
      wrapping: 'all-sites-inside-primary-cell-no-post-generation-wrap',
      coordinateConstructionDigest,
      coordinatePayloadDigest,
      topologyDigest,
    },
    candidateForceModel: {
      familyId: 'openmm-amber14-tip3p-joung-cheatham-candidate',
      waterModel: 'rigid-TIP3P',
      ionModel: 'Joung-Cheatham-monovalent-ions-for-TIP3P',
      combiningRule: 'Lorentz-Berthelot',
      electrostaticsPlan: 'three-dimensional-PME',
      cutoffNanometer: 1,
      dispersionCorrection: true,
      solidInterfaceDomainValidated: false,
      saturationOrPhaseEquilibriumValidated: false,
      executionEligibility: 'blocked-until-all-prerequisite-gates-have-independent-receipts',
    },
    prerequisiteGates: REQUIRED_GATES,
    plannedReadouts: {
      availableFromGeometricSeed: [
        'atom-identity-formal-and-model-point-charge',
        'exact-coordinate-and-cell',
        'crystal-layer-and-surface-labels',
        'rigid-water-topology',
      ],
      requireExecutedVerifiedTrajectory: [
        'energy-and-potential-force',
        'z-resolved-species-density',
        'water-dipole-orientation',
        'na-o-cl-h-cl-o-geometric-coordination',
        'surface-site-displacement-and-occupancy',
      ],
      requireQualifiedPotentialAndMultiSeedStatistics: [
        'persistent-detachment-and-reattachment-events',
        'largest-crystal-cluster-and-local-q8',
        'dissolution-or-crystallization-rate',
      ],
    },
    evidenceSemantics: {
      coordinateConstructionExecutedLocally: true,
      molecularDynamicsExecuted: false,
      openmmExecuted: false,
      pmeExecuted: false,
      minimized: false,
      equilibrated: false,
      trajectoryAvailable: false,
      forceOrEnergyAvailable: false,
      protectedMainArtifact: false,
    },
    claimBoundaries: {
      lowSaltQualified: false,
      drySlabQualified: false,
      interfacePotentialQualified: false,
      interfaceDynamicsSimulated: false,
      hydrationStructureMeasured: false,
      dissolutionObserved: false,
      crystallizationObserved: false,
      kineticRateEstimated: false,
      electronicStructureComputed: false,
      learnedWorldModelTrained: false,
      industrialPrediction: false,
      publicReleaseEligible: false,
    },
  };
}

function buildCoordinateSeedPayload(): Omit<
  NaClWaterInterfaceCoordinateSeedV0410,
  'systemDigest' | 'constructionReceipt' | 'seedDigest'
> & { systemDigest?: never; constructionReceipt?: never; seedDigest?: never } {
  const atoms: NaClWaterInterfaceAtomV0410[] = [];
  const structuralBonds: NaClWaterInterfaceBondV0410[] = [];
  const rigidConstraints: NaClWaterInterfaceConstraintV0410[] = [];
  buildCrystalAtoms(atoms);
  buildWaterRegion('lower-water-region', 0, atoms, structuralBonds, rigidConstraints);
  buildWaterRegion(
    'upper-water-region',
    8 * LATTICE_CONSTANT_NANOMETER,
    atoms,
    structuralBonds,
    rigidConstraints,
  );
  if (atoms.length !== PARTICLE_COUNT
    || structuralBonds.length !== WATER_BOND_COUNT
    || rigidConstraints.length !== WATER_CONSTRAINT_COUNT) {
    throw new Error('NaCl-water interface coordinate builder cardinality changed');
  }
  return {
    schemaVersion: NACL_WATER_INTERFACE_COORDINATE_SEED_VERSION_V0410,
    seedId: SEED_ID,
    status: 'geometric-coordinate-seed-not-minimized-or-executed',
    systemId: SYSTEM_ID,
    atoms,
    structuralBonds,
    rigidConstraints,
  };
}

function buildCrystalAtoms(atoms: NaClWaterInterfaceAtomV0410[]) {
  for (let cellZ = 0; cellZ < CRYSTAL_REPEATS[2]; cellZ += 1) {
    for (let cellY = 0; cellY < CRYSTAL_REPEATS[1]; cellY += 1) {
      for (let cellX = 0; cellX < CRYSTAL_REPEATS[0]; cellX += 1) {
        for (let basisIndex = 0; basisIndex < ROCKSALT_BASIS.length; basisIndex += 1) {
          const site = ROCKSALT_BASIS[basisIndex];
          const layerIndex = 2 * cellZ + (site.fractional.z === 0.5 ? 1 : 0);
          const atomIndex = atoms.length;
          const atomId = `crystal:${cellZ}:${cellY}:${cellX}:${basisIndex}:${site.element}`;
          atoms.push({
            atomIndex,
            atomId,
            moleculeId: atomId,
            residueId: `ion:${atomIndex}`,
            element: site.element,
            species: site.element === 'Na' ? 'Na+' : 'Cl-',
            phase: 'solid-coordinate-seed',
            formalChargeE: site.element === 'Na' ? 1 : -1,
            modelPointChargeE: site.element === 'Na' ? 1 : -1,
            massDalton: site.element === 'Na' ? SODIUM_MASS_DALTON : CHLORIDE_MASS_DALTON,
            positionNanometer: vector(
              (cellX + site.fractional.x + 0.25) * LATTICE_CONSTANT_NANOMETER,
              (cellY + site.fractional.y + 0.25) * LATTICE_CONSTANT_NANOMETER,
              (cellZ + site.fractional.z + 4.25) * LATTICE_CONSTANT_NANOMETER,
            ),
            crystalSite: {
              cellIndex: [cellX, cellY, cellZ],
              basisIndex,
              layerIndex,
              surfaceRole: layerIndex === 0
                ? 'lower-surface-plane'
                : layerIndex === 7
                  ? 'upper-surface-plane'
                  : 'interior-plane',
            },
            waterSite: null,
          });
        }
      }
    }
  }
}

function buildWaterRegion(
  region: WaterRegion,
  regionStartZ: number,
  atoms: NaClWaterInterfaceAtomV0410[],
  structuralBonds: NaClWaterInterfaceBondV0410[],
  rigidConstraints: NaClWaterInterfaceConstraintV0410[],
) {
  const [countX, countY, countZ] = WATER_GRID_PER_REGION;
  const spacing = vector(
    CELL_LENGTH_X_NANOMETER / countX,
    CELL_LENGTH_Y_NANOMETER / countY,
    NOMINAL_WATER_THICKNESS_PER_SIDE_NANOMETER / countZ,
  );
  let localWaterIndex = 0;
  for (let gridZ = 0; gridZ < countZ; gridZ += 1) {
    for (let gridY = 0; gridY < countY; gridY += 1) {
      for (let gridX = 0; gridX < countX; gridX += 1) {
        const orientationValue = WATER_ORIENTATIONS[
          (gridX + gridY + gridZ) % WATER_ORIENTATIONS.length
        ];
        const oxygenPosition = vector(
          (gridX + 0.5) * spacing.x,
          (gridY + 0.5) * spacing.y,
          regionStartZ + (gridZ + 0.5) * spacing.z,
        );
        const halfAngle = HOH_ANGLE_RADIAN / 2;
        const alongBisector = OH_DISTANCE_NANOMETER * Math.cos(halfAngle);
        const perpendicular = OH_DISTANCE_NANOMETER * Math.sin(halfAngle);
        const h1Position = add(
          oxygenPosition,
          add(scale(orientationValue.dipole, alongBisector), scale(orientationValue.perpendicular, perpendicular)),
        );
        const h2Position = add(
          oxygenPosition,
          add(scale(orientationValue.dipole, alongBisector), scale(orientationValue.perpendicular, -perpendicular)),
        );
        const moleculeId = `water:${region}:${String(localWaterIndex).padStart(4, '0')}`;
        const residueId = moleculeId;
        const oxygenIndex = atoms.length;
        const gridIndex = [gridX, gridY, gridZ] as const;
        atoms.push(waterAtom(
          oxygenIndex,
          `${moleculeId}:O`,
          moleculeId,
          residueId,
          'O',
          oxygenPosition,
          region,
          gridIndex,
          orientationValue.id,
        ));
        atoms.push(waterAtom(
          oxygenIndex + 1,
          `${moleculeId}:H1`,
          moleculeId,
          residueId,
          'H1',
          h1Position,
          region,
          gridIndex,
          orientationValue.id,
        ));
        atoms.push(waterAtom(
          oxygenIndex + 2,
          `${moleculeId}:H2`,
          moleculeId,
          residueId,
          'H2',
          h2Position,
          region,
          gridIndex,
          orientationValue.id,
        ));
        addWaterTopology(
          moleculeId,
          oxygenIndex,
          atoms,
          structuralBonds,
          rigidConstraints,
        );
        localWaterIndex += 1;
      }
    }
  }
  if (localWaterIndex !== WATER_COUNT_PER_REGION) {
    throw new Error(`${region} water count changed`);
  }
}

function waterAtom(
  atomIndex: number,
  atomId: string,
  moleculeId: string,
  residueId: string,
  role: 'O' | 'H1' | 'H2',
  positionNanometer: Vector3,
  region: WaterRegion,
  gridIndex: Int3,
  orientationId: NaClWaterInterfaceAtomV0410['waterSite'] extends infer Site
    ? Site extends { orientationId: infer Id } ? Id : never
    : never,
): NaClWaterInterfaceAtomV0410 {
  const oxygen = role === 'O';
  return {
    atomIndex,
    atomId,
    moleculeId,
    residueId,
    element: oxygen ? 'O' : 'H',
    species: oxygen ? 'TIP3P-O' : 'TIP3P-H',
    phase: 'water-coordinate-seed',
    formalChargeE: 0,
    modelPointChargeE: oxygen ? -0.834 : 0.417,
    massDalton: oxygen ? OXYGEN_MASS_DALTON : HYDROGEN_MASS_DALTON,
    positionNanometer,
    crystalSite: null,
    waterSite: { region, gridIndex, orientationId, siteRole: role },
  };
}

function addWaterTopology(
  moleculeId: string,
  oxygenIndex: number,
  atoms: ReadonlyArray<NaClWaterInterfaceAtomV0410>,
  bonds: NaClWaterInterfaceBondV0410[],
  constraints: NaClWaterInterfaceConstraintV0410[],
) {
  const oxygen = atoms[oxygenIndex];
  const h1 = atoms[oxygenIndex + 1];
  const h2 = atoms[oxygenIndex + 2];
  for (const [suffix, hydrogen] of [['oh1', h1], ['oh2', h2]] as const) {
    bonds.push({
      bondId: `${moleculeId}:${suffix}`,
      atomAIndex: oxygen.atomIndex,
      atomBIndex: hydrogen.atomIndex,
      atomAId: oxygen.atomId,
      atomBId: hydrogen.atomId,
      role: 'structural-rigid-water-oh-link',
      energeticInteraction: false,
    });
  }
  for (const [sitePair, first, second, target] of [
    ['O-H1', oxygen, h1, OH_DISTANCE_NANOMETER],
    ['O-H2', oxygen, h2, OH_DISTANCE_NANOMETER],
    ['H1-H2', h1, h2, HH_DISTANCE_NANOMETER],
  ] as const) {
    constraints.push({
      constraintId: `${moleculeId}:${sitePair}`,
      atomAIndex: first.atomIndex,
      atomBIndex: second.atomIndex,
      atomAId: first.atomId,
      atomBId: second.atomId,
      sitePair,
      targetDistanceNanometer: target,
    });
  }
}

function constructionReceipt(
  payload: ReturnType<typeof buildCoordinateSeedPayload>,
  coordinatePayloadDigest: string,
  topologyDigest: string,
): NaClWaterInterfaceCoordinateSeedV0410['constructionReceipt'] {
  const layerSummaries = Array.from({ length: 8 }, (_, layerIndex) => {
    const ions = payload.atoms.filter((atom) => atom.crystalSite?.layerIndex === layerIndex);
    return {
      count: ions.length,
      charge: ions.reduce((sum, atom) => sum + atom.formalChargeE, 0),
    };
  });
  const lowerWaterCount = countWaterMolecules(payload.atoms, 'lower-water-region');
  const upperWaterCount = countWaterMolecules(payload.atoms, 'upper-water-region');
  const totalFormalCharge = payload.atoms.reduce((sum, atom) => sum + atom.formalChargeE, 0);
  const totalModelPointCharge = payload.atoms.reduce(
    (sum, atom) => sum + atom.modelPointChargeE,
    0,
  );
  const totalMass = payload.atoms.reduce((sum, atom) => sum + atom.massDalton, 0);
  if (layerSummaries.some((layer) => layer.count !== 144 || layer.charge !== 0)) {
    throw new Error('rocksalt surface construction lost a neutral mixed atomic plane');
  }
  if (lowerWaterCount !== WATER_COUNT_PER_REGION || upperWaterCount !== WATER_COUNT_PER_REGION) {
    throw new Error('water regions are not balanced');
  }
  if (Math.abs(totalFormalCharge) > 1e-12 || Math.abs(totalModelPointCharge) > 1e-12) {
    throw new Error('coordinate seed is not chemically and model-point-charge neutral');
  }
  assertSitesInsideCell(payload.atoms);
  assertWaterGeometry(payload.atoms, payload.rigidConstraints);
  assertBalancedOrientations(payload.atoms);
  const minimumDistance = computeMinimumDifferentMoleculeDistanceV0410(payload.atoms);
  if (minimumDistance < 0.1) {
    throw new Error(`coordinate seed has an inter-molecular overlap (${minimumDistance} nm)`);
  }
  return {
    atomCount: payload.atoms.length,
    sodiumIonCount: payload.atoms.filter((atom) => atom.species === 'Na+').length,
    chlorideIonCount: payload.atoms.filter((atom) => atom.species === 'Cl-').length,
    waterMoleculeCount: lowerWaterCount + upperWaterCount,
    lowerWaterCount,
    upperWaterCount,
    crystalLayerCount: layerSummaries.length,
    neutralCrystalLayerCount: layerSummaries.filter((layer) => layer.charge === 0).length,
    balancedWaterOrientationRegions: 2,
    allSitesInsidePrimaryCell: true,
    totalFormalChargeE: 0,
    totalModelPointChargeE: 0,
    totalMassDalton: totalMass,
    minimumDifferentMoleculeDistanceNanometer: minimumDistance,
    coordinatePayloadDigest,
    topologyDigest,
  };
}

function assertSitesInsideCell(atoms: ReadonlyArray<NaClWaterInterfaceAtomV0410>) {
  const lengths = [CELL_LENGTH_X_NANOMETER, CELL_LENGTH_Y_NANOMETER, CELL_LENGTH_Z_NANOMETER];
  for (const atom of atoms) {
    const coordinates = [atom.positionNanometer.x, atom.positionNanometer.y, atom.positionNanometer.z];
    if (coordinates.some((value, axis) => !Number.isFinite(value) || value < 0 || value >= lengths[axis])) {
      throw new Error(`${atom.atomId} lies outside the primary periodic cell`);
    }
  }
}

function assertWaterGeometry(
  atoms: ReadonlyArray<NaClWaterInterfaceAtomV0410>,
  constraints: ReadonlyArray<NaClWaterInterfaceConstraintV0410>,
) {
  if (constraints.length !== WATER_CONSTRAINT_COUNT) throw new Error('rigid-water constraints are incomplete');
  for (const constraint of constraints) {
    const first = atoms[constraint.atomAIndex];
    const second = atoms[constraint.atomBIndex];
    if (first.atomId !== constraint.atomAId || second.atomId !== constraint.atomBId
      || first.moleculeId !== second.moleculeId) {
      throw new Error('rigid-water constraint identity changed');
    }
    const actual = distance(first.positionNanometer, second.positionNanometer);
    if (Math.abs(actual - constraint.targetDistanceNanometer) > COORDINATE_TOLERANCE_NANOMETER) {
      throw new Error(`${constraint.constraintId} does not satisfy the rigid geometry`);
    }
  }
}

function assertBalancedOrientations(atoms: ReadonlyArray<NaClWaterInterfaceAtomV0410>) {
  for (const region of ['lower-water-region', 'upper-water-region'] as const) {
    const oxygenSites = atoms.filter((atom) => atom.waterSite?.region === region
      && atom.waterSite.siteRole === 'O');
    const counts = Object.fromEntries(WATER_ORIENTATIONS.map((item) => [item.id, 0])) as Record<string, number>;
    const sum = [0, 0, 0];
    for (const oxygen of oxygenSites) {
      const orientationValue = WATER_ORIENTATIONS.find(
        (item) => item.id === oxygen.waterSite?.orientationId,
      );
      if (!orientationValue) throw new Error('unknown water seed orientation');
      counts[orientationValue.id] += 1;
      sum[0] += orientationValue.dipole.x;
      sum[1] += orientationValue.dipole.y;
      sum[2] += orientationValue.dipole.z;
    }
    if (Object.values(counts).some((count) => count !== 144) || sum.some((value) => value !== 0)) {
      throw new Error(`${region} water seed orientation schedule is not balanced`);
    }
  }
}

function countWaterMolecules(
  atoms: ReadonlyArray<NaClWaterInterfaceAtomV0410>,
  region: WaterRegion,
) {
  return atoms.filter((atom) => atom.waterSite?.region === region
    && atom.waterSite.siteRole === 'O').length;
}

function sourcePins(): NaClWaterInterfaceSourcePinV0410[] {
  const openMmCommit = 'c6173db6e8edd705eb59172bd21e9ce69c572405';
  return [
    {
      sourceId: 'nist-nbs-circular-539-volume-2-nacl-26c',
      role: 'crystal-structure-reference',
      owner: 'NIST/NBS',
      title: 'Standard X-ray Diffraction Powder Patterns, NBS Circular 539 Volume 2',
      url: 'https://nvlpubs.nist.gov/nistpubs/Legacy/circ/nbscircular539v2.pdf',
      doi: '10.6028/NBS.CIRC.539v2',
      repository: null,
      release: null,
      commit: null,
      path: null,
      byteCount: 6_365_255,
      sha256: 'sha256:ad69a84ba964e66caf2de506b7ac044531e0721e2b626ddcfce6d1f839652426',
      evidenceStatus: 'downloaded-byte-pin',
      redistributionCleared: false,
    },
    {
      sourceId: 'openmm-8.6-amber14-tip3p-parameter-candidate',
      role: 'candidate-parameter-input',
      owner: 'OpenMM',
      title: 'OpenMM 8.6 amber14/tip3p.xml',
      url: `https://raw.githubusercontent.com/openmm/openmm/${openMmCommit}/wrappers/python/openmm/app/data/amber14/tip3p.xml`,
      doi: null,
      repository: 'https://github.com/openmm/openmm',
      release: '8.6.0',
      commit: openMmCommit,
      path: 'wrappers/python/openmm/app/data/amber14/tip3p.xml',
      byteCount: 19_070,
      sha256: 'sha256:3f4b188dbcb6c02863230eaca231e927fb6bf3307ce947d8a50d0f46f6dd83d9',
      evidenceStatus: 'pinned-upstream-byte-identity',
      redistributionCleared: false,
    },
    {
      sourceId: 'openmm-8.6-license-notices',
      role: 'license-notices',
      owner: 'OpenMM',
      title: 'OpenMM 8.6 license notices',
      url: `https://raw.githubusercontent.com/openmm/openmm/${openMmCommit}/docs-source/licenses/Licenses.txt`,
      doi: null,
      repository: 'https://github.com/openmm/openmm',
      release: '8.6.0',
      commit: openMmCommit,
      path: 'docs-source/licenses/Licenses.txt',
      byteCount: 9_305,
      sha256: 'sha256:437b7168cc997abea3b5f2a9e0fb6894f96de77b9c69be428ccfcfe9bed58293',
      evidenceStatus: 'pinned-upstream-byte-identity',
      redistributionCleared: false,
    },
  ];
}

function basis(element: 'Na' | 'Cl', x: number, y: number, z: number) {
  return Object.freeze({ element, fractional: vector(x, y, z) });
}

function orientation(
  id: '+x' | '-x' | '+y' | '-y' | '+z' | '-z',
  dipole: Vector3,
  perpendicular: Vector3,
) {
  return Object.freeze({ id, dipole, perpendicular });
}

function gate(
  gateId: NaClWaterInterfaceGateV0410['gateId'],
  requirement: string,
): NaClWaterInterfaceGateV0410 {
  return Object.freeze({ gateId, requirement, status: 'required-not-satisfied', receiptDigest: null });
}

function vector(x: number, y: number, z: number): Vector3 {
  return Object.freeze({ x: cleanZero(x), y: cleanZero(y), z: cleanZero(z) });
}

function add(first: Vector3, second: Vector3) {
  return vector(first.x + second.x, first.y + second.y, first.z + second.z);
}

function scale(value: Vector3, factor: number) {
  return vector(value.x * factor, value.y * factor, value.z * factor);
}

function distance(first: Vector3, second: Vector3) {
  return Math.hypot(second.x - first.x, second.y - first.y, second.z - first.z);
}

function cleanZero(value: number) {
  return Object.is(value, -0) ? 0 : value;
}

function clonePlain(value: unknown, label: string): unknown {
  try {
    digestValue(value);
    assertNoUndefined(value);
    return structuredClone(value);
  } catch (error) {
    throw new Error(`${label} is not a finite plain-data value`, { cause: error });
  }
}

function assertNoUndefined(value: unknown): void {
  if (value === undefined) throw new TypeError('plain-data values cannot contain undefined');
  if (!value || typeof value !== 'object') return;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) assertNoUndefined(value[index]);
    return;
  }
  for (const key of Object.keys(value)) {
    assertNoUndefined((value as Record<string, unknown>)[key]);
  }
}

function assertStableToken(value: unknown, label: string) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(value)) {
    throw new Error(`${label} must be a stable bounded token`);
  }
}

function assertExactKeys(value: unknown, expected: readonly string[], label: string) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  const actual = Object.keys(value).sort();
  const locked = [...expected].sort();
  if (actual.length !== locked.length || actual.some((key, index) => key !== locked[index])) {
    throw new Error(`${label} keys differ from the closed contract`);
  }
}

function withoutKey<T extends Record<string, unknown>>(value: T, key: string) {
  const clone = { ...value };
  delete clone[key];
  return clone;
}

function assertExactValue(actual: unknown, expected: unknown, label: string): void {
  if (Object.is(actual, expected)) return;
  if (Array.isArray(actual) && Array.isArray(expected)) {
    if (actual.length !== expected.length) throw new Error(`${label} array length changed`);
    for (let index = 0; index < actual.length; index += 1) {
      assertExactValue(actual[index], expected[index], `${label}[${index}]`);
    }
    return;
  }
  if (actual && expected && typeof actual === 'object' && typeof expected === 'object') {
    const actualRecord = actual as Record<string, unknown>;
    const expectedRecord = expected as Record<string, unknown>;
    assertExactKeys(actualRecord, Object.keys(expectedRecord), label);
    for (const key of Object.keys(expectedRecord)) {
      assertExactValue(actualRecord[key], expectedRecord[key], `${label}.${key}`);
    }
    return;
  }
  throw new Error(`${label} differs from the locked value`);
}

function deepFreeze<Value>(value: Value): Value {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  }
  return value;
}
