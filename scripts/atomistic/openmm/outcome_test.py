from __future__ import annotations

import json
import stat
import sys
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import contract
import outcome


class OutcomeTests(unittest.TestCase):
    def _root(self, temporary: str) -> Path:
        root = Path(temporary).resolve()
        (root / "arrays").mkdir()
        (root / "manifests").mkdir()
        return root

    def _write_required(self, root: Path) -> None:
        for relative in sorted(outcome.REQUIRED_COMPLETE_PATHS):
            path = root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"{}\n" if relative == "manifests/producer-diagnostics.json" else b"x")

    def test_complete_pass_is_atomic_canonical_and_non_promotional(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            self._write_required(root)
            stages = tuple((stage, "success") for stage in contract.STAGES)
            path, manifest = outcome.write_outcome(root, stages)
            self.assertEqual(manifest["status"], "complete-pass")
            self.assertFalse(any(manifest["claims"].values()))
            self.assertFalse(manifest["diagnosticMetricsAreAcceptance"])
            self.assertEqual(path.read_bytes(), contract.canonical_json_bytes(manifest))
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o444)

    def test_success_preimage_is_stable_after_digest_bound_manifest_arrives(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            self._write_required(root)
            stages = tuple((stage, "success") for stage in contract.STAGES)
            before = outcome.build_outcome(root, stages)
            digest = contract.digest_value(before)
            contract.atomic_write_json(
                root / outcome.ARTIFACT_MANIFEST_RELATIVE_PATH,
                {"producerOutcomeDigest": digest},
            )
            after = outcome.build_outcome(root, stages)
            self.assertEqual(before, after)
            path, written = outcome.write_built_outcome(root, before)
            self.assertEqual(contract.digest_bytes(path.read_bytes()), digest)
            self.assertEqual(written, before)

    def test_complete_failure_preserves_partial_terminal_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            (root / "manifests/input-receipt.json").write_bytes(b"x")
            stages = []
            for index, stage in enumerate(contract.STAGES):
                stages.append((stage, "success" if index < 2 else "failure" if index == 2 else "skipped"))
            _, manifest = outcome.write_outcome(root, tuple(stages))
            self.assertEqual(manifest["status"], "complete-fail")
            self.assertEqual(manifest["terminalStage"], "runtime")

    def test_cancelled_stage_is_incomplete(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            (root / "manifests/input-receipt.json").write_bytes(b"x")
            stages = []
            for index, stage in enumerate(contract.STAGES):
                stages.append((stage, "success" if index < 2 else "cancelled" if index == 2 else "skipped"))
            _, manifest = outcome.write_outcome(root, tuple(stages))
            self.assertEqual(manifest["status"], "incomplete")

    def test_forged_success_and_unexpected_output_are_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            stages = tuple((stage, "success") for stage in contract.STAGES)
            with self.assertRaisesRegex(contract.ContractViolation, "missing"):
                outcome.write_outcome(root, stages)

        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            (root / "manifests/forged.json").write_bytes(b"{}")
            skipped = tuple((stage, "skipped") for stage in contract.STAGES)
            with self.assertRaisesRegex(contract.ContractViolation, "unexpected"):
                outcome.write_outcome(root, skipped)

        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            (root / "outside.txt").write_bytes(b"x")
            skipped = tuple((stage, "skipped") for stage in contract.STAGES)
            with self.assertRaisesRegex(contract.ContractViolation, "top-level"):
                outcome.write_outcome(root, skipped)


if __name__ == "__main__":
    unittest.main()
