from __future__ import annotations

import math
import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import contract
import engine


class EnginePureTests(unittest.TestCase):
    def test_import_does_not_require_openmm(self) -> None:
        self.assertTrue(callable(engine.load_openmm))

    def test_pme_warmup_receipt_names_the_energy_only_operation(self) -> None:
        self.assertEqual(
            engine.PME_WARMUP_OPERATION,
            "getState-getEnergy-true-after-setPositions",
        )

    def test_com_removal_closes_mass_weighted_velocity(self) -> None:
        velocities = [[1.0, -2.0, 3.0] for _ in range(contract.PARTICLE_COUNT)]
        masses = [1.0 + (index % 3) for index in range(contract.PARTICLE_COUNT)]
        corrected, removed = engine.remove_mass_weighted_center_of_mass_velocity(velocities, masses)
        self.assertEqual(removed, (1.0, -2.0, 3.0))
        center = engine.center_of_mass_velocity(corrected, masses)
        self.assertLess(math.sqrt(sum(value * value for value in center)), 1e-15)
        self.assertLess(
            engine.mass_weighted_momentum_relative_residual(corrected, masses), 1e-15
        )

    def test_momentum_residual_is_dimensionless_not_com_speed(self) -> None:
        velocities = [[0.0, 0.0, 0.0] for _ in range(contract.PARTICLE_COUNT)]
        masses = [1.0 for _ in range(contract.PARTICLE_COUNT)]
        velocities[0] = [3.0, 0.0, 0.0]
        velocities[1] = [-1.0, 0.0, 0.0]
        self.assertAlmostEqual(
            engine.mass_weighted_momentum_relative_residual(velocities, masses), 0.5
        )
        self.assertEqual(
            engine.mass_weighted_momentum_relative_residual(
                [[0.0, 0.0, 0.0] for _ in range(contract.PARTICLE_COUNT)], masses
            ),
            0.0,
        )

    def test_compiled_force_inventory_is_exact(self) -> None:
        expected = {
            "HarmonicBondForce": 1,
            "HarmonicAngleForce": 1,
            "NonbondedForce": 1,
        }
        engine.validate_compiled_force_inventory(expected, 3)
        for changed, total in (
            ({"NonbondedForce": 1}, 1),
            ({**expected, "CMMotionRemover": 1}, 4),
            ({**expected, "NonbondedForce": 2}, 4),
        ):
            with self.assertRaises(contract.ContractViolation):
                engine.validate_compiled_force_inventory(changed, total)

    def test_minimum_image_constraint_metrics_are_dimensionless(self) -> None:
        positions = [[0.01, 0.0, 0.0], [2.91, 0.0, 0.0]]
        residual = engine.maximum_constraint_relative_residual(
            positions, [(0, 1, 0.1)]
        )
        self.assertLess(residual, 1e-12)
        velocities = [[1.0, 0.0, 0.0], [1.0, 2.0, 0.0]]
        self.assertEqual(
            engine.maximum_velocity_constraint_rate(positions, velocities, [(0, 1, 0.1)]),
            0.0,
        )
        velocities[1] = [2.0, 0.0, 0.0]
        self.assertAlmostEqual(
            engine.maximum_velocity_constraint_rate(positions, velocities, [(0, 1, 0.1)]),
            1.0,
        )

    def test_particle_reshape_is_exact_and_bounded(self) -> None:
        values = [float(index) for index in range(contract.COMPONENT_COUNT)]
        reshaped = engine.reshape_particle_vectors(values)
        self.assertEqual(len(reshaped), contract.PARTICLE_COUNT)
        self.assertEqual(reshaped[1], [3.0, 4.0, 5.0])
        with self.assertRaises(contract.ContractViolation):
            engine.reshape_particle_vectors(values[:-1])


if __name__ == "__main__":
    unittest.main()
