import { describe, expect, it } from 'vitest';
import {
  angleDegrees,
  COULOMB_CONSTANT_KJ_MOL_ANGSTROM_E2,
  createNaclRocksaltScene,
  createWaterDimerScene,
  distanceAngstrom,
  magnitude,
  NACL_ROCKSALT,
  OPENMM_TIP3P,
  vectorSum,
} from './molecular-interactions';

describe('OpenMM 8.5.1 TIP3P water dimer scene', () => {
  it('builds two neutral, rigid, genuinely three-dimensional water molecules', () => {
    const scene = createWaterDimerScene();
    expect(scene.atoms).toHaveLength(6);
    expect(scene.bonds).toHaveLength(4);
    for (const groupId of ['water-a', 'water-b']) {
      const atoms = scene.atoms.filter((atom) => atom.groupId === groupId);
      const oxygen = atoms.find((atom) => atom.element === 'O');
      const hydrogens = atoms.filter((atom) => atom.element === 'H');
      expect(oxygen).toBeDefined();
      expect(hydrogens).toHaveLength(2);
      expect(atoms.reduce((total, atom) => total + atom.chargeE, 0)).toBeCloseTo(0, 14);
      expect(distanceAngstrom(oxygen!.positionAngstrom, hydrogens[0].positionAngstrom)).toBeCloseTo(OPENMM_TIP3P.ohBondAngstrom, 12);
      expect(distanceAngstrom(oxygen!.positionAngstrom, hydrogens[1].positionAngstrom)).toBeCloseTo(OPENMM_TIP3P.ohBondAngstrom, 12);
      expect(angleDegrees(hydrogens[0].positionAngstrom, oxygen!.positionAngstrom, hydrogens[1].positionAngstrom)).toBeCloseTo(OPENMM_TIP3P.hohAngleDegrees, 11);
    }
    expect(scene.atoms.some((atom) => Math.abs(atom.positionAngstrom.z) > 1e-6)).toBe(true);
  });

  it('closes energy components and cross-molecule forces', () => {
    const scene = createWaterDimerScene({ oxygenSeparationAngstrom: 3.05, donorAngleDegrees: 14 });
    expect(scene.pairInteractions).toHaveLength(9);
    expect(scene.energy.lennardJonesKjMol).not.toBeNull();
    expect(scene.energy.totalKjMol).toBeCloseTo(scene.energy.coulombKjMol + (scene.energy.lennardJonesKjMol ?? 0), 12);
    const totalForce = vectorSum(Object.values(scene.forceByAtomIdKjMolAngstrom).flatMap((force) => force ? [force] : []));
    expect(magnitude(totalForce)).toBeLessThan(1e-10);
    for (const interaction of scene.pairInteractions) {
      expect(Number.isFinite(interaction.totalEnergyKjMol)).toBe(true);
      expect(Number.isFinite(magnitude(interaction.forceOnTargetKjMolAngstrom))).toBe(true);
    }
  });

  it('matches the analytic molecular force to a central finite difference', () => {
    const distance = 3.2;
    const angle = 9;
    const delta = 1e-5;
    const left = createWaterDimerScene({ oxygenSeparationAngstrom: distance - delta, donorAngleDegrees: angle });
    const right = createWaterDimerScene({ oxygenSeparationAngstrom: distance + delta, donorAngleDegrees: angle });
    const numericalForceX = -(right.energy.totalKjMol - left.energy.totalKjMol) / (2 * delta);
    const center = createWaterDimerScene({ oxygenSeparationAngstrom: distance, donorAngleDegrees: angle });
    const waterBForceX = center.atoms
      .filter((atom) => atom.groupId === 'water-b')
      .reduce((total, atom) => total + center.forceByAtomIdKjMolAngstrom[atom.id]!.x, 0);
    expect(Math.abs(numericalForceX - waterBForceX)).toBeLessThan(1e-5);
  });

  it('decays toward zero at long range and rejects invalid geometry', () => {
    const near = createWaterDimerScene({ oxygenSeparationAngstrom: 3 });
    const far = createWaterDimerScene({ oxygenSeparationAngstrom: 6 });
    expect(Math.abs(far.energy.totalKjMol)).toBeLessThan(Math.abs(near.energy.totalKjMol));
    expect(() => createWaterDimerScene({ oxygenSeparationAngstrom: Number.NaN })).toThrow('finite');
    expect(() => createWaterDimerScene({ oxygenSeparationAngstrom: 2 })).toThrow('within');
  });

  it('is deterministic and keeps camera-independent state identity', () => {
    const first = createWaterDimerScene({ oxygenSeparationAngstrom: 2.93, donorAngleDegrees: -12 });
    const second = createWaterDimerScene({ oxygenSeparationAngstrom: 2.93, donorAngleDegrees: -12 });
    expect(first).toEqual(second);
    expect(first.stateDigest).toMatch(/^sha256:[0-9a-f]{64}$/);
    expect(first.stateId.endsWith(first.stateDigest.slice(7, 23))).toBe(true);
    expect(createWaterDimerScene({
      oxygenSeparationAngstrom: 2.93 + Number.EPSILON,
      donorAngleDegrees: -12,
    }).stateDigest).toBe(first.stateDigest);
    expect(createWaterDimerScene({ oxygenSeparationAngstrom: 2.94, donorAngleDegrees: -12 }).stateId).not.toBe(first.stateId);
  });
});

describe('NBS NaCl rocksalt scene', () => {
  it('generates a neutral 1:1 4×4×4 rocksalt fragment from alternating lattice sites', () => {
    const scene = createNaclRocksaltScene();
    expect(scene.atoms).toHaveLength(64);
    expect(scene.atoms.filter((atom) => atom.element === 'Na')).toHaveLength(32);
    expect(scene.atoms.filter((atom) => atom.element === 'Cl')).toHaveLength(32);
    expect(scene.atoms.reduce((total, atom) => total + atom.chargeE, 0)).toBe(0);
    expect(scene.metadata.visibleClusterFormalChargeE).toBe(0);
  });

  it('exposes six unlike first neighbors at a/2 and balances their pair forces', () => {
    const scene = createNaclRocksaltScene();
    const selected = scene.atoms.find((atom) => atom.id === scene.defaultSelectedAtomId)!;
    expect(selected.label).toBe('Na⁺');
    expect(scene.guides).toHaveLength(6);
    expect(scene.pairInteractions).toHaveLength(6);
    scene.pairInteractions.forEach((interaction) => {
      const source = scene.atoms.find((atom) => atom.id === interaction.sourceAtomId)!;
      expect(source.label).toBe('Cl⁻');
      expect(interaction.distanceAngstrom).toBeCloseTo(NACL_ROCKSALT.latticeConstantAngstrom / 2, 12);
      expect(interaction.coulombEnergyKjMol).toBeCloseTo(
        -COULOMB_CONSTANT_KJ_MOL_ANGSTROM_E2 / NACL_ROCKSALT.nearestNeighborAngstrom,
        10,
      );
    });
    expect(magnitude(scene.forceByAtomIdKjMolAngstrom[selected.id]!)).toBeLessThan(1e-10);
    expect(scene.selectableAtomIds).toEqual([selected.id]);
    scene.atoms.filter((atom) => atom.id !== selected.id).forEach((atom) => {
      expect(scene.forceByAtomIdKjMolAngstrom[atom.id]).toBeNull();
    });
  });

  it('shows a finite electrostatic response to a selected-ion displacement', () => {
    const displaced = createNaclRocksaltScene({ selectedDisplacementAngstrom: 0.2 });
    const selectedForce = displaced.forceByAtomIdKjMolAngstrom[displaced.defaultSelectedAtomId]!;
    expect(Number.isFinite(displaced.energy.totalKjMol)).toBe(true);
    expect(magnitude(selectedForce)).toBeGreaterThan(0.1);
    expect(displaced.energy.lennardJonesKjMol).toBeNull();
  });

  it('matches the displaced-ion force to the first-shell energy gradient', () => {
    const displacement = 0.2;
    const delta = 1e-5;
    const left = createNaclRocksaltScene({ selectedDisplacementAngstrom: displacement - delta });
    const right = createNaclRocksaltScene({ selectedDisplacementAngstrom: displacement + delta });
    const numericalForceX = -(right.energy.totalKjMol - left.energy.totalKjMol) / (2 * delta);
    const center = createNaclRocksaltScene({ selectedDisplacementAngstrom: displacement });
    const analyticForceX = center.forceByAtomIdKjMolAngstrom[center.defaultSelectedAtomId]!.x;
    expect(Math.abs(numericalForceX - analyticForceX)).toBeLessThan(1e-5);
  });

  it('contains twelve same-charge second neighbors at a divided by square root of two', () => {
    const scene = createNaclRocksaltScene();
    const selected = scene.atoms.find((atom) => atom.id === scene.defaultSelectedAtomId)!;
    const secondShell = scene.atoms.filter((atom) => atom.element === selected.element
      && atom.id !== selected.id
      && Math.abs(distanceAngstrom(atom.positionAngstrom, selected.positionAngstrom) - NACL_ROCKSALT.secondNeighborAngstrom) < 1e-9);
    expect(secondShell).toHaveLength(12);
  });

  it('locks the experimental lattice and rejects singular or non-finite inputs', () => {
    expect(NACL_ROCKSALT.latticeConstantAngstrom).toBe(5.6402);
    expect(NACL_ROCKSALT.nearestNeighborAngstrom).toBeCloseTo(NACL_ROCKSALT.latticeConstantAngstrom / 2, 12);
    expect(() => createNaclRocksaltScene({ selectedDisplacementAngstrom: Number.POSITIVE_INFINITY })).toThrow('finite');
    expect(() => createNaclRocksaltScene({ selectedDisplacementAngstrom: 0.5 })).toThrow('within');
  });
});
