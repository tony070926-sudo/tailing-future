from __future__ import annotations

import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import contract
import diagnostics


class DiagnosticsTests(unittest.TestCase):
    def test_energy_metrics_use_locked_total_column_and_reference_denominator(self) -> None:
        values = []
        for frame in range(contract.FRAME_COUNT):
            values.extend((3.0, 7.0 + frame * 0.001, 10.0 + frame * 0.001))
        self.assertAlmostEqual(diagnostics.energy_excursion(values), 0.01)

        reference = []
        cpu = []
        for step in range(5):
            reference.extend((10.0, 0.0, 0.0, 4.0, 6.0))
            cpu.extend((10.001, 0.0, 0.0, 4.0, 6.001))
        self.assertAlmostEqual(diagnostics.potential_energy_comparison(reference, cpu), 0.0001)

    def test_group_closure_and_force_comparison_cover_every_particle(self) -> None:
        component_count = contract.COMPONENT_COUNT
        energies = []
        forces = []
        for _step in range(5):
            energies.extend((4.0, 0.0, 0.0, 1.5, 2.5))
            forces.extend([1.0] * component_count)
            forces.extend([0.0] * component_count)
            forces.extend([0.0] * component_count)
            forces.extend([0.25] * component_count)
            forces.extend([0.75] * component_count)
        self.assertEqual(diagnostics.group_closure(energies, forces), (0.0, 0.0))
        self.assertEqual(diagnostics.force_comparison(forces, forces), (0.0, 0.0))


if __name__ == "__main__":
    unittest.main()
