from __future__ import annotations

import sys
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import worker
import contract


class _FakeOpenMm:
    class MinimizationReporter:
        def __init__(self) -> None:
            pass


class WorkerPureTests(unittest.TestCase):
    @staticmethod
    def _report_arguments(cycle: int) -> dict[str, float]:
        return {
            "system energy": float(cycle),
            "restraint energy": 0.0,
            "restraint strength": 100.0,
            "max constraint error": 1e-6,
        }

    def test_verlet_energy_receipt_distinguishes_raw_and_shifted_velocities(self) -> None:
        self.assertEqual(
            worker.ENERGY_TEMPORAL_ALIGNMENT,
            "openmm-state-potential-and-integrator-adjusted-kinetic-at-position-time",
        )
        self.assertEqual(
            worker.STATE_KINETIC_ENERGY_SEMANTICS,
            "ReferenceIntegrateVerletStepKernel-computeShiftedKineticEnergy-"
            "plus-half-dt-with-velocity-constraints-1e-4",
        )

    def test_three_restarts_are_allowed_and_the_fourth_exhausts_the_budget(self) -> None:
        trace = worker._MinimizationTrace(_FakeOpenMm)
        # cycle 0 is the initial minimization; cycles 1..3 are the three
        # permitted constraint-restraint restarts.
        for cycle in range(5):
            stopped = trace.reporter.report(
                0,
                [0.0] * contract.COMPONENT_COUNT,
                [1.0] * contract.COMPONENT_COUNT,
                self._report_arguments(cycle),
            )
            if cycle < 4:
                self.assertFalse(stopped)
        self.assertTrue(stopped)
        self.assertEqual(trace.receipt()["globalCallbackOrdinal"], 4)
        self.assertEqual(trace.receipt()["constraintRestartCount"], 4)
        self.assertEqual(trace.receipt()["budgetExhaustion"], "maximum-constraint-restarts")
        self.assertIsNotNone(trace.receipt()["lastPositionSha256"])
        self.assertFalse(trace.receipt()["reporterNeverStoppedMinimizationEarly"])


if __name__ == "__main__":
    unittest.main()
