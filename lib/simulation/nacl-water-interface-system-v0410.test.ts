import { describe, expect, it } from 'vitest';
import { digestValue } from './digest.ts';
import {
  NACL_WATER_INTERFACE_ACTION_VERSION_V0410,
  NACL_WATER_INTERFACE_COORDINATE_SEED_VERSION_V0410,
  NACL_WATER_INTERFACE_OBSERVATION_VERSION_V0410,
  NACL_WATER_INTERFACE_SYSTEM_VERSION_V0410,
  assertNaClWaterInterfaceActionV0410,
  assertNaClWaterInterfaceObservationV0410,
  assertNaClWaterInterfacePlanV0410,
  computeMinimumDifferentMoleculeDistanceV0410,
  createNaClWaterInterfaceActionV0410,
  createNaClWaterInterfacePlanV0410,
  observeNaClWaterInterfaceActionV0410,
  type NaClWaterInterfacePlanV0410,
} from './nacl-water-interface-system-v0410.ts';

const EXPECTED = Object.freeze({
  plan: 'sha256:f6f271d255de31ab655e62b7539b65e58a4e85994870232b675ef7b40f2fd0b8',
  system: 'sha256:d47785bc641fd6483c58b8549bf7c0dc7e116a5892c0c13864c98e87c712133a',
  seed: 'sha256:beb7f2c4f997e2e8b8158a05d6083a7d6569bd1f11457f922844646cac0cc426',
  construction: 'sha256:7b77acefe148d5e6adb4e27829589cb0e34e17d5cfe78fb0c83d0816ceb05fbb',
  coordinate: 'sha256:17631204745ab1bb264d2052c9cfefb6afbd989a6559d6de1ef5c091c1d8ae99',
  topology: 'sha256:e9d7293e55709ffe8e964c266fe936d597d30d2dd244b398e20b4d0239709183',
});

describe('v0.4.10 NaCl{100}-water geometric interface foundation', () => {
  const plan = createNaClWaterInterfacePlanV0410();

  it('constructs one exact, immutable, self-digested system and full coordinate seed', () => {
    expect(plan.system.schemaVersion).toBe(NACL_WATER_INTERFACE_SYSTEM_VERSION_V0410);
    expect(plan.coordinateSeed.schemaVersion)
      .toBe(NACL_WATER_INTERFACE_COORDINATE_SEED_VERSION_V0410);
    expect(plan.planDigest).toBe(EXPECTED.plan);
    expect(plan.system.systemDigest).toBe(EXPECTED.system);
    expect(plan.coordinateSeed.seedDigest).toBe(EXPECTED.seed);
    expect(plan.system.coordinateContract).toMatchObject({
      coordinateConstructionDigest: EXPECTED.construction,
      coordinatePayloadDigest: EXPECTED.coordinate,
      topologyDigest: EXPECTED.topology,
    });
    expect(plan.coordinateSeed.constructionReceipt).toMatchObject({
      coordinatePayloadDigest: EXPECTED.coordinate,
      topologyDigest: EXPECTED.topology,
    });
    expect(digestValue({ system: plan.system, coordinateSeed: plan.coordinateSeed }))
      .toBe(plan.planDigest);
    expect(digestValue(withoutKey(plan.system, 'systemDigest'))).toBe(plan.system.systemDigest);
    expect(digestValue(withoutKey(plan.coordinateSeed, 'seedDigest')))
      .toBe(plan.coordinateSeed.seedDigest);
    expectRecursivelyFrozen(plan);
    expect(() => assertNaClWaterInterfacePlanV0410(plan)).not.toThrow();
  }, 60_000);

  it('locks a neutral 6x6x4 Fm-3m slab and two equally populated water sides', () => {
    const { system, coordinateSeed } = plan;
    expect(system.status).toBe('geometric-coordinate-seed-not-executed');
    expect(system.scientificIdentity).toEqual({
      role: 'pre-equilibration-balanced-double-interface-nacl-100-water-coordinate-seed',
      surfaceFamily: '{100}',
      representedPlane: '(001)-cubic-equivalent-member-of-{100}',
      surfaceNormalMiller: [0, 0, 1],
      surfaceNormalCartesianAxis: 'z',
      interfaceCount: 2,
      vacuumRegionPresent: false,
      slabCorrectionRequiredByConstruction: false,
    });
    expect(system.crystalConstruction).toMatchObject({
      spaceGroup: 'Fm-3m',
      latticeConstantNanometer: 0.56402,
      latticeConstantTemperatureCelsius: 26,
      conventionalCellRepeats: [6, 6, 4],
      atomicPlaneCount: 8,
      ionsPerAtomicPlane: 144,
      sodiumPerAtomicPlane: 72,
      chloridePerAtomicPlane: 72,
      planeFormalChargeE: 0,
      lowerAndUpperTermination: 'neutral-mixed-na-cl-{100}-planes',
    });
    expect(system.periodicCell).toMatchObject({
      kind: 'orthorhombic-fully-periodic',
      lengthsNanometer: { x: 3.38412, y: 3.38412, z: 6.76824 },
      periodicAxes: [true, true, true],
      nominalSlabThicknessNanometer: 2.25608,
      nominalWaterThicknessPerSideNanometer: 2.25608,
      combinedWaterThicknessNanometer: 4.51216,
      periodicSurfacePlaneSeparationNanometer: 4.794169999999999,
      twoWaterRegionsHaveEqualCompositionAndPackingRecipe: true,
    });
    expect(system.composition).toMatchObject({
      conventionalCellCount: 144,
      sodiumIonCount: 576,
      chlorideIonCount: 576,
      crystalIonCount: 1152,
      waterMoleculeCount: 1728,
      waterCountPerRegion: 864,
      particleCount: 6336,
      residueCount: 2880,
      structuralWaterBondCount: 3456,
      rigidWaterConstraintCount: 5184,
      totalFormalChargeE: 0,
      totalModelPointChargeE: 0,
      totalMassDalton: 64791.919872,
      nominalWaterSeedDensityKgM3: 1000.3659761772168,
    });
    expect(coordinateSeed.atoms).toHaveLength(6336);
    expect(coordinateSeed.structuralBonds).toHaveLength(3456);
    expect(coordinateSeed.rigidConstraints).toHaveLength(5184);
    expect(coordinateSeed.atoms.every((atom, index) => atom.atomIndex === index)).toBe(true);
    expect(new Set(coordinateSeed.atoms.map((atom) => atom.atomId)).size).toBe(6336);
    expect(new Set(coordinateSeed.atoms.map((atom) => atom.residueId)).size).toBe(2880);
    expect(coordinateSeed.constructionReceipt).toMatchObject({
      atomCount: 6336,
      sodiumIonCount: 576,
      chlorideIonCount: 576,
      waterMoleculeCount: 1728,
      lowerWaterCount: 864,
      upperWaterCount: 864,
      crystalLayerCount: 8,
      neutralCrystalLayerCount: 8,
      balancedWaterOrientationRegions: 2,
      allSitesInsidePrimaryCell: true,
      totalFormalChargeE: 0,
      totalModelPointChargeE: 0,
      minimumDifferentMoleculeDistanceNanometer: 0.16483354467600186,
    });
    expect(Math.abs(
      coordinateSeed.constructionReceipt.totalMassDalton - system.composition.totalMassDalton,
    )).toBeLessThan(1e-9);
  });

  it('has eight neutral mixed {100} planes with five surface and six interior nearest neighbors', () => {
    const ions = plan.coordinateSeed.atoms.filter((atom) => atom.crystalSite !== null);
    const lengthX = plan.system.periodicCell.lengthsNanometer.x;
    const lengthY = plan.system.periodicCell.lengthsNanometer.y;
    const nearest = plan.system.crystalConstruction.latticeConstantNanometer / 2;
    const layers = Array.from({ length: 8 }, (_, layerIndex) => (
      ions.filter((atom) => atom.crystalSite?.layerIndex === layerIndex)
    ));

    expect(layers.map((layer) => layer.length)).toEqual(Array(8).fill(144));
    expect(layers.map((layer) => layer.filter((atom) => atom.element === 'Na').length))
      .toEqual(Array(8).fill(72));
    expect(layers.map((layer) => layer.reduce((sum, atom) => sum + atom.formalChargeE, 0)))
      .toEqual(Array(8).fill(0));
    expect(layers.map((layer) => unique(layer.map((atom) => atom.positionNanometer.z))))
      .toEqual(layers.map((layer) => [layer[0].positionNanometer.z]));
    for (let index = 1; index < layers.length; index += 1) {
      expect(layers[index][0].positionNanometer.z - layers[index - 1][0].positionNanometer.z)
        .toBeCloseTo(nearest, 12);
    }

    for (const ion of ions) {
      const opposite = ion.element === 'Na' ? 'Cl' : 'Na';
      const coordination = ions.filter((other) => {
        if (other.element !== opposite) return false;
        const dx = minimumImage(other.positionNanometer.x - ion.positionNanometer.x, lengthX);
        const dy = minimumImage(other.positionNanometer.y - ion.positionNanometer.y, lengthY);
        const dz = other.positionNanometer.z - ion.positionNanometer.z;
        return Math.abs(Math.hypot(dx, dy, dz) - nearest) <= 1e-12;
      }).length;
      const surface = ion.crystalSite?.surfaceRole !== 'interior-plane';
      expect(coordination).toBe(surface ? 5 : 6);
    }
  }, 60_000);

  it('constructs exact rigid TIP3P molecules with a balanced, explicitly non-equilibrium orientation seed', () => {
    const { atoms, rigidConstraints, structuralBonds } = plan.coordinateSeed;
    expect(plan.system.waterConstruction).toEqual({
      algorithm: 'balanced-six-orientation-rigid-tip3p-grid-seed-v0410',
      role: 'deterministic-pre-minimization-packing-not-equilibrated-water',
      gridsPerRegion: [12, 12, 6],
      regionOrder: ['lower-water-region', 'upper-water-region'],
      oxygenHydrogenDistanceNanometer: 0.09572,
      hydrogenHydrogenDistanceNanometer: 0.15139006545247014,
      hydrogenOxygenHydrogenAngleRadian: 1.82421813418,
      orientationIds: ['+x', '-x', '+y', '-y', '+z', '-z'],
      occurrencesPerOrientationPerRegion: 144,
      netDipoleDirectionSumPerRegion: { x: 0, y: 0, z: 0 },
    });
    for (const region of ['lower-water-region', 'upper-water-region'] as const) {
      const oxygen = atoms.filter((atom) => atom.waterSite?.region === region
        && atom.waterSite.siteRole === 'O');
      expect(oxygen).toHaveLength(864);
      const counts = new Map<string, number>();
      for (const atom of oxygen) {
        const id = atom.waterSite!.orientationId;
        counts.set(id, (counts.get(id) ?? 0) + 1);
      }
      expect([...counts.entries()].sort()).toEqual([
        ['+x', 144], ['+y', 144], ['+z', 144],
        ['-x', 144], ['-y', 144], ['-z', 144],
      ]);
    }
    expect(atoms.filter((atom) => atom.phase === 'water-coordinate-seed').every(
      (atom) => atom.formalChargeE === 0
        && atom.modelPointChargeE === (atom.element === 'O' ? -0.834 : 0.417),
    )).toBe(true);
    expect(atoms.filter((atom) => atom.phase === 'solid-coordinate-seed').every(
      (atom) => atom.formalChargeE === atom.modelPointChargeE,
    )).toBe(true);
    for (const constraint of rigidConstraints) {
      const first = atoms[constraint.atomAIndex];
      const second = atoms[constraint.atomBIndex];
      expect(first.atomId).toBe(constraint.atomAId);
      expect(second.atomId).toBe(constraint.atomBId);
      expect(first.moleculeId).toBe(second.moleculeId);
      expect(distance(first.positionNanometer, second.positionNanometer))
        .toBeCloseTo(constraint.targetDistanceNanometer, 12);
    }
    expect(structuralBonds.every((bond) => bond.energeticInteraction === false)).toBe(true);
    expect(computeMinimumDifferentMoleculeDistanceV0410(atoms))
      .toBe(plan.coordinateSeed.constructionReceipt.minimumDifferentMoleculeDistanceNanometer);
    expect(plan.coordinateSeed.constructionReceipt.minimumDifferentMoleculeDistanceNanometer)
      .toBeGreaterThan(0.1);
  }, 60_000);

  it('places both water regions outside the crystal planes and distinguishes plane span from slab extent', () => {
    const { atoms } = plan.coordinateSeed;
    const ions = atoms.filter((atom) => atom.phase === 'solid-coordinate-seed');
    const lowerWater = atoms.filter((atom) => atom.waterSite?.region === 'lower-water-region');
    const upperWater = atoms.filter((atom) => atom.waterSite?.region === 'upper-water-region');
    const firstPlaneZ = Math.min(...ions.map((atom) => atom.positionNanometer.z));
    const lastPlaneZ = Math.max(...ions.map((atom) => atom.positionNanometer.z));
    expect(Math.max(...lowerWater.map((atom) => atom.positionNanometer.z))).toBeLessThan(firstPlaneZ);
    expect(Math.min(...upperWater.map((atom) => atom.positionNanometer.z))).toBeGreaterThan(lastPlaneZ);
    expect(lastPlaneZ - firstPlaneZ).toBeCloseTo(
      3.5 * plan.system.crystalConstruction.latticeConstantNanometer,
      12,
    );
    expect(plan.system.periodicCell.nominalSlabThicknessNanometer).toBeCloseTo(
      4 * plan.system.crystalConstruction.latticeConstantNanometer,
      12,
    );

    const lengths = plan.system.periodicCell.lengthsNanometer;
    let minimumIonWaterDistance = Number.POSITIVE_INFINITY;
    for (const ion of ions) {
      for (const water of [...lowerWater, ...upperWater]) {
        const dx = minimumImage(water.positionNanometer.x - ion.positionNanometer.x, lengths.x);
        const dy = minimumImage(water.positionNanometer.y - ion.positionNanometer.y, lengths.y);
        const dz = minimumImage(water.positionNanometer.z - ion.positionNanometer.z, lengths.z);
        minimumIonWaterDistance = Math.min(minimumIonWaterDistance, Math.hypot(dx, dy, dz));
      }
    }
    expect(minimumIonWaterDistance).toBeCloseTo(0.26000364891955763, 12);
  }, 60_000);

  it('fails the minimum-distance audit on invalid identity, ordering and cell-domain inputs', () => {
    const sameMolecule = plan.coordinateSeed.atoms.map((atom) => ({
      ...atom,
      moleculeId: 'one-molecule',
    }));
    expect(() => computeMinimumDifferentMoleculeDistanceV0410(sameMolecule))
      .toThrow(/two distinct molecules/);

    const duplicateIndex = [...plan.coordinateSeed.atoms];
    duplicateIndex[1] = { ...duplicateIndex[1], atomIndex: 0 };
    expect(() => computeMinimumDifferentMoleculeDistanceV0410(duplicateIndex))
      .toThrow(/array bijection/);

    expect(() => computeMinimumDifferentMoleculeDistanceV0410(
      [...plan.coordinateSeed.atoms].reverse(),
    )).toThrow(/array bijection/);

    const outsideCell = [...plan.coordinateSeed.atoms];
    outsideCell[0] = {
      ...outsideCell[0],
      positionNanometer: {
        ...outsideCell[0].positionNanometer,
        x: plan.system.periodicCell.lengthsNanometer.x,
      },
    };
    expect(() => computeMinimumDifferentMoleculeDistanceV0410(outsideCell))
      .toThrow(/inside the primary cell/);
  }, 60_000);

  it('pins primary structure and candidate parameter bytes without converting them into execution evidence', () => {
    expect(plan.system.sourcePins).toEqual([
      expect.objectContaining({
        sourceId: 'nist-nbs-circular-539-volume-2-nacl-26c',
        owner: 'NIST/NBS',
        doi: '10.6028/NBS.CIRC.539v2',
        byteCount: 6365255,
        sha256: 'sha256:ad69a84ba964e66caf2de506b7ac044531e0721e2b626ddcfce6d1f839652426',
        evidenceStatus: 'downloaded-byte-pin',
        redistributionCleared: false,
      }),
      expect.objectContaining({
        sourceId: 'openmm-8.6-amber14-tip3p-parameter-candidate',
        release: '8.6.0',
        commit: 'c6173db6e8edd705eb59172bd21e9ce69c572405',
        sha256: 'sha256:3f4b188dbcb6c02863230eaca231e927fb6bf3307ce947d8a50d0f46f6dd83d9',
        redistributionCleared: false,
      }),
      expect.objectContaining({
        sourceId: 'openmm-8.6-license-notices',
        sha256: 'sha256:437b7168cc997abea3b5f2a9e0fb6894f96de77b9c69be428ccfcfe9bed58293',
        redistributionCleared: false,
      }),
    ]);
    expect(plan.system.candidateForceModel).toMatchObject({
      solidInterfaceDomainValidated: false,
      saturationOrPhaseEquilibriumValidated: false,
      executionEligibility: 'blocked-until-all-prerequisite-gates-have-independent-receipts',
    });
    expect(plan.system.evidenceSemantics).toEqual({
      coordinateConstructionExecutedLocally: true,
      molecularDynamicsExecuted: false,
      openmmExecuted: false,
      pmeExecuted: false,
      minimized: false,
      equilibrated: false,
      trajectoryAvailable: false,
      forceOrEnergyAvailable: false,
      protectedMainArtifact: false,
    });
    expect(Object.entries(plan.system.claimBoundaries).every(([, value]) => value === false))
      .toBe(true);
  });

  it('admits read-only inspection but blocks preparation and dynamics without invoking a solver', () => {
    const inspect = createNaClWaterInterfaceActionV0410('inspect-coordinate-seed', 'inspect-1', plan);
    const prepare = createNaClWaterInterfaceActionV0410(
      'request-interface-preparation',
      'prepare-1',
      plan,
    );
    const advance = createNaClWaterInterfaceActionV0410(
      'request-mobile-interface-dynamics',
      'advance-1',
      plan,
    );
    expect(inspect.schemaVersion).toBe(NACL_WATER_INTERFACE_ACTION_VERSION_V0410);
    expect(() => assertNaClWaterInterfaceActionV0410(inspect, plan)).not.toThrow();

    const inspected = observeNaClWaterInterfaceActionV0410(inspect, plan);
    expect(inspected.schemaVersion).toBe(NACL_WATER_INTERFACE_OBSERVATION_VERSION_V0410);
    expect(inspected).toMatchObject({
      outcome: 'accepted-read-only-inspection',
      stateMutationPerformed: false,
      solverInvoked: false,
      unmetGateIds: [],
    });
    expect(inspected.unavailableEvidence).toContain('dissolution-or-crystallization-rate');
    expect(() => assertNaClWaterInterfaceObservationV0410(inspected, inspect, plan)).not.toThrow();

    for (const action of [prepare, advance]) {
      const observation = observeNaClWaterInterfaceActionV0410(action, plan);
      expect(observation).toMatchObject({
        outcome: 'blocked-prerequisite-gates-unsatisfied',
        stateMutationPerformed: false,
        solverInvoked: false,
        unmetGateIds: [
          'pure-water-openmm-control',
          'single-pair-low-salt-pme-control',
          'dry-nacl-100-slab-stability-control',
          'solid-water-interface-potential-domain-qualification',
        ],
      });
      expect(observation.unavailableEvidence).toContain('interface-dynamics');
      expect(() => assertNaClWaterInterfaceObservationV0410(observation, action, plan))
        .not.toThrow();
    }
  }, 60_000);

  it('fails closed on atom, layer, gate, claim, ordering and self-digest tampering', () => {
    const candidates = [
      mutatePlan(plan, (value) => { value.coordinateSeed.atoms[0].modelPointChargeE = -1; }),
      mutatePlan(plan, (value) => { value.coordinateSeed.atoms[0].positionNanometer.x += 0.001; }),
      mutatePlan(plan, (value) => { value.coordinateSeed.atoms.reverse(); }),
      mutatePlan(plan, (value) => { value.system.prerequisiteGates.pop(); }),
      mutatePlan(plan, (value) => {
        (value.system.claimBoundaries as Record<string, unknown>).interfaceDynamicsSimulated = true;
      }),
      mutatePlan(plan, (value) => {
        (value.system.scientificIdentity as Record<string, unknown>).invented = true;
      }),
    ];
    for (const candidate of candidates) {
      candidate.system.systemDigest = digestValue(withoutKey(candidate.system, 'systemDigest'));
      candidate.coordinateSeed.systemDigest = candidate.system.systemDigest;
      candidate.coordinateSeed.seedDigest = digestValue(withoutKey(candidate.coordinateSeed, 'seedDigest'));
      candidate.planDigest = digestValue({
        system: candidate.system,
        coordinateSeed: candidate.coordinateSeed,
      });
      expect(() => assertNaClWaterInterfacePlanV0410(candidate)).toThrow();
    }

    const action = createNaClWaterInterfaceActionV0410(
      'request-mobile-interface-dynamics',
      'action-tamper',
      plan,
    );
    const wrongParent = structuredClone(action) as unknown as {
      parentSystemDigest: string;
      actionDigest: string;
    };
    wrongParent.parentSystemDigest = `sha256:${'0'.repeat(64)}`;
    wrongParent.actionDigest = digestValue(withoutKey(wrongParent, 'actionDigest'));
    expect(() => assertNaClWaterInterfaceActionV0410(wrongParent, plan)).toThrow(/not bound/);

    const observation = observeNaClWaterInterfaceActionV0410(action, plan);
    const forged = structuredClone(observation) as unknown as {
      solverInvoked: boolean;
      observationDigest: string;
    };
    forged.solverInvoked = true;
    forged.observationDigest = digestValue(withoutKey(forged, 'observationDigest'));
    expect(() => assertNaClWaterInterfaceObservationV0410(forged, action, plan)).toThrow();
  }, 60_000);

  it('rejects accessors, undefined, non-finite data and extra keys before trust', () => {
    const action = createNaClWaterInterfaceActionV0410('inspect-coordinate-seed', 'inspect-safe', plan);
    const extra = { ...action, unexpected: true };
    expect(() => assertNaClWaterInterfaceActionV0410(extra, plan)).toThrow(/keys/);

    const nonfinite = structuredClone(action);
    (nonfinite as unknown as { parentSystemDigest: number }).parentSystemDigest = Number.NaN;
    expect(() => assertNaClWaterInterfaceActionV0410(nonfinite, plan)).toThrow(/plain-data/);

    const accessor = { ...action } as Record<string, unknown>;
    Object.defineProperty(accessor, 'actionId', { enumerable: true, get: () => 'getter' });
    expect(() => assertNaClWaterInterfaceActionV0410(accessor, plan)).toThrow(/plain-data/);

    const undefinedSystemKey = structuredClone(plan) as unknown as Record<string, unknown>;
    ((undefinedSystemKey.system as Record<string, unknown>).claimBoundaries as Record<string, unknown>)
      .unexpected = undefined;
    expect(() => assertNaClWaterInterfacePlanV0410(undefinedSystemKey)).toThrow(/plain-data/);

    const undefinedAtomKey = structuredClone(plan) as unknown as Record<string, unknown>;
    const undefinedAtom = (
      (undefinedAtomKey.coordinateSeed as Record<string, unknown>).atoms as unknown[]
    )[0] as Record<string, unknown>;
    undefinedAtom.unexpected = undefined;
    expect(() => assertNaClWaterInterfacePlanV0410(undefinedAtomKey)).toThrow(/plain-data/);
  });

  it('rejects a caller-supplied forged plan at every action and observation boundary', () => {
    const forgedPlan = structuredClone(plan) as unknown as Record<string, unknown>;
    const forgedSystem = forgedPlan.system as Record<string, unknown>;
    forgedSystem.prerequisiteGates = [];
    forgedSystem.plannedReadouts = {
      availableFromGeometricSeed: ['energy-and-potential-force', 'interface-dynamics'],
      requireExecutedVerifiedTrajectory: [],
      requireQualifiedPotentialAndMultiSeedStatistics: [],
    };
    const action = createNaClWaterInterfaceActionV0410(
      'request-mobile-interface-dynamics',
      'canonical-action',
      plan,
    );
    const observation = observeNaClWaterInterfaceActionV0410(action, plan);

    expect(() => createNaClWaterInterfaceActionV0410(
      'request-mobile-interface-dynamics',
      'forged-create',
      forgedPlan,
    )).toThrow(/self digest|locked plan/);
    expect(() => assertNaClWaterInterfaceActionV0410(action, forgedPlan))
      .toThrow(/self digest|locked plan/);
    expect(() => observeNaClWaterInterfaceActionV0410(action, forgedPlan))
      .toThrow(/self digest|locked plan/);
    expect(() => assertNaClWaterInterfaceObservationV0410(observation, action, forgedPlan))
      .toThrow(/self digest|locked plan/);
  }, 60_000);
});

function minimumImage(value: number, length: number) {
  return value - length * Math.round(value / length);
}

function distance(
  first: Readonly<{ x: number; y: number; z: number }>,
  second: Readonly<{ x: number; y: number; z: number }>,
) {
  return Math.hypot(second.x - first.x, second.y - first.y, second.z - first.z);
}

function unique(values: readonly number[]) {
  return [...new Set(values)];
}

function withoutKey<T extends Record<string, unknown>>(value: T, key: string) {
  const clone = { ...value };
  delete clone[key];
  return clone;
}

type Mutable<T> = T extends ReadonlyArray<infer Item>
  ? Mutable<Item>[]
  : T extends object
    ? { -readonly [Key in keyof T]: Mutable<T[Key]> }
    : T;

function mutatePlan(
  plan: NaClWaterInterfacePlanV0410,
  mutate: (value: Mutable<NaClWaterInterfacePlanV0410>) => void,
) {
  const clone = structuredClone(plan) as unknown as Mutable<NaClWaterInterfacePlanV0410>;
  mutate(clone);
  return clone;
}

function expectRecursivelyFrozen(value: unknown) {
  if (!value || typeof value !== 'object') return;
  expect(Object.isFrozen(value)).toBe(true);
  for (const child of Object.values(value)) expectRecursivelyFrozen(child);
}
