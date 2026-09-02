from __future__ import annotations

import contextlib
import io
import json
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import contract
import outcome
import producer


class ProducerFinalizationTests(unittest.TestCase):
    def _stage_side_effect(self, *, fail_manifest: bool, interrupt_stage: str | None = None):
        def run(stage: str, arguments: tuple[str, ...], *, output_root: Path) -> None:
            if stage == interrupt_stage:
                raise KeyboardInterrupt
            if stage == "manifest":
                if fail_manifest:
                    raise producer.StageFailure("manifest", "synthetic manifest failure")
                digest = arguments[arguments.index("--producer-outcome-digest") + 1]
                contract.atomic_write_json(
                    output_root / "manifests/artifact-manifest.json",
                    {"producerOutcomeDigest": digest},
                )
                return
            for relative, owner in outcome.ARTIFACT_STAGE.items():
                if owner != stage:
                    continue
                path = output_root / relative
                if relative == "manifests/producer-diagnostics.json":
                    contract.atomic_write_json(path, {"thresholdsApplied": False})
                else:
                    contract.atomic_write_bytes(path, b"x")

        return run

    @staticmethod
    def _input_receipt(_input_root: Path, output_root: Path) -> dict[str, object]:
        contract.atomic_write_json(output_root / "manifests/input-receipt.json", {"ok": True})
        return {"ok": True}

    @staticmethod
    def _diagnostics(_output_root: Path) -> dict[str, object]:
        return {"thresholdsApplied": False}

    def _produce(
        self, *, fail_manifest: bool, interrupt_stage: str | None = None
    ) -> tuple[Path, dict[str, object], int]:
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        base = Path(temporary.name).resolve()
        input_root = base / "inputs"
        output_root = base / "outputs"
        input_root.mkdir()
        with (
            mock.patch.object(producer, "platform_guard", return_value={}),
            mock.patch.object(producer, "_input_receipt", side_effect=self._input_receipt),
            mock.patch.object(producer, "write_diagnostics", side_effect=self._diagnostics),
            mock.patch.object(
                producer,
                "_run_worker",
                side_effect=self._stage_side_effect(
                    fail_manifest=fail_manifest, interrupt_stage=interrupt_stage
                ),
            ),
        ):
            with contextlib.redirect_stderr(io.StringIO()):
                result, code = producer.produce(input_root, output_root, "7" * 40)
        return output_root, result, code

    def test_complete_pass_is_published_only_after_manifest_binding(self) -> None:
        root, result, code = self._produce(fail_manifest=False)
        self.assertEqual(code, 0)
        self.assertEqual(result["status"], "complete-pass")
        outcome_bytes = (root / outcome.OUTPUT_RELATIVE_PATH).read_bytes()
        artifact_manifest = json.loads((root / "manifests/artifact-manifest.json").read_bytes())
        self.assertEqual(
            artifact_manifest["producerOutcomeDigest"], contract.digest_bytes(outcome_bytes)
        )
        self.assertEqual(result["stages"][-1], {"stage": "manifest", "outcome": "success"})

    def test_manifest_failure_cannot_leave_complete_pass_outcome(self) -> None:
        root, result, code = self._produce(fail_manifest=True)
        self.assertEqual(code, 1)
        self.assertEqual(result["status"], "complete-fail")
        self.assertEqual(result["terminalStage"], "manifest")
        persisted = json.loads((root / outcome.OUTPUT_RELATIVE_PATH).read_bytes())
        self.assertEqual(persisted["status"], "complete-fail")
        self.assertEqual(persisted["stages"][-1], {"stage": "manifest", "outcome": "failure"})

    def test_interruption_publishes_incomplete_not_failure_or_success(self) -> None:
        root, result, code = self._produce(fail_manifest=False, interrupt_stage="runtime")
        self.assertEqual(code, 75)
        self.assertEqual(result["status"], "incomplete")
        self.assertEqual(result["terminalStage"], "runtime")
        persisted = json.loads((root / outcome.OUTPUT_RELATIVE_PATH).read_bytes())
        self.assertEqual(persisted["status"], "incomplete")
        self.assertEqual(
            persisted["stages"][2], {"stage": "runtime", "outcome": "cancelled"}
        )


if __name__ == "__main__":
    unittest.main()
