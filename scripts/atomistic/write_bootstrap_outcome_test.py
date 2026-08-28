from __future__ import annotations

import contextlib
import io
import json
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path


HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import write_bootstrap_outcome as outcome


COMMIT_SHA = "1234567890abcdef1234567890abcdef12345678"


def stage_values(terminal: int | None = None, terminal_outcome: str = "failure") -> list[str]:
    values: list[str] = []
    for index, stage in enumerate(outcome.STAGES):
        if terminal is None or index < terminal:
            value = "success"
        elif index == terminal:
            value = terminal_outcome
        else:
            value = "skipped"
        values.append(f"{stage}={value}")
    return values


class BootstrapOutcomeTests(unittest.TestCase):
    def test_success_is_deterministic_and_strictly_non_promotional(self) -> None:
        with tempfile.TemporaryDirectory() as first, tempfile.TemporaryDirectory() as second:
            first_root = self._root(first)
            second_root = self._root(second)
            self._write_success_files(first_root, "mattersim")
            self._write_success_files(second_root, "mattersim")
            first_path, first_manifest = self._write(first_root, stages=stage_values())
            second_path, second_manifest = self._write(second_root, stages=stage_values())

            self.assertEqual(first_path.read_bytes(), second_path.read_bytes())
            self.assertEqual(first_manifest, second_manifest)
            self.assertEqual(first_manifest["schemaVersion"], outcome.SCHEMA_VERSION)
            self.assertEqual(first_manifest["status"], "success")
            self.assertIsNone(first_manifest["failureStage"])
            self.assertTrue(first_manifest["inferenceSucceeded"])
            self.assertTrue(first_manifest["predictionsPresent"])
            self.assertEqual(first_manifest["evidenceClass"], "bootstrap-not-reproduced")
            self.assertEqual(
                [entry["stage"] for entry in first_manifest["stages"]],
                list(outcome.STAGES),
            )
            encoded = first_path.read_text(encoding="ascii")
            for forbidden in ('"metrics"', '"receipt"', '"attestation"'):
                self.assertNotIn(forbidden, encoded)
            metadata = first_path.lstat()
            self.assertTrue(stat.S_ISREG(metadata.st_mode))
            self.assertFalse(first_path.is_symlink())
            self.assertEqual(metadata.st_nlink, 1)
            self.assertEqual(stat.S_IMODE(metadata.st_mode), 0o444)

    def test_every_failure_stage_accepts_only_a_skipped_tail(self) -> None:
        for failed_index, failed_stage in enumerate(outcome.STAGES):
            with self.subTest(stage=failed_stage), tempfile.TemporaryDirectory() as temporary:
                root = self._root(temporary)
                stages = stage_values(failed_index)
                self._write_files_for_successful_prefix(root, "mattersim", failed_index)
                path, manifest = self._write(root, stages=stages)
                self.assertEqual(manifest["status"], "failed")
                self.assertEqual(manifest["failureStage"], failed_stage)
                self.assertFalse(manifest["inferenceSucceeded"])
                self.assertFalse(manifest["predictionsPresent"])
                self.assertEqual(json.loads(path.read_bytes()), manifest)
                for entry in manifest["stages"][failed_index + 1:]:
                    self.assertEqual(entry["outcome"], "skipped")

    def test_cancelled_stage_is_failed_without_forging_a_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            index = outcome.STAGES.index("build")
            self._write_files_for_successful_prefix(root, "mace", index)
            _, manifest = self._write(
                root,
                model="mace",
                stages=stage_values(index, "cancelled"),
            )
            self.assertEqual(manifest["status"], "failed")
            self.assertIsNone(manifest["failureStage"])
            self.assertFalse(manifest["inferenceSucceeded"])

    def test_rejects_forged_or_incoherent_stage_outcomes(self) -> None:
        valid = stage_values(3)
        cases = {
            "missing": valid[:-1],
            "unknown": [*valid[:2], "forged=success", *valid[3:]],
            "reordered": [valid[1], valid[0], *valid[2:]],
            "unsupported": [*valid[:3], "base=neutral", *valid[4:]],
            "bare skipped": [*stage_values()[:3], "base=skipped", *stage_values()[4:]],
            "success after failure": [*valid[:4], "assets=success", *valid[5:]],
            "second failure": [*valid[:4], "assets=failure", *valid[5:]],
            "malformed": [*valid[:3], "base=failure=forged", *valid[4:]],
        }
        for label, stages in cases.items():
            with self.subTest(case=label):
                with self.assertRaises(ValueError):
                    outcome.parse_stage_outcomes(stages)

    def test_rejects_prediction_without_successful_inference(self) -> None:
        for terminal in (outcome.STAGES.index("build"), outcome.STAGES.index("inference")):
            with (
                self.subTest(terminal=outcome.STAGES[terminal]),
                tempfile.TemporaryDirectory() as temporary,
            ):
                root = self._root(temporary)
                self._write_files_for_successful_prefix(root, "mattersim", terminal)
                self._file(root, "predictions/predictions.jsonl")
                with self.assertRaisesRegex(
                    ValueError, "without successful inference|skipped stage"
                ):
                    self._write(root, stages=stage_values(terminal))

    def test_inference_failure_may_publish_only_failure_diagnostics(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            terminal = outcome.STAGES.index("inference")
            self._write_files_for_successful_prefix(root, "mattersim", terminal)
            self._file(root, "diagnostics/failure-diagnostics.json")
            _, manifest = self._write(root, stages=stage_values(terminal))
            self.assertFalse(manifest["inferenceSucceeded"])
            self.assertFalse(manifest["predictionsPresent"])
            self.assertIn(
                "diagnostics/failure-diagnostics.json", manifest["publishedFiles"]
            )

    def test_failed_stage_may_leave_bounded_partial_output_but_not_future_output(self) -> None:
        terminal = outcome.STAGES.index("resolve")
        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            self._write_files_for_successful_prefix(root, "mattersim", terminal)
            self._file(root, "locks/mattersim.requirements.lock", b"partial\n")
            _, manifest = self._write(root, stages=stage_values(terminal))
            self.assertIn("locks/mattersim.requirements.lock", manifest["publishedFiles"])

        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            self._write_files_for_successful_prefix(root, "mattersim", terminal)
            self._file(root, "manifests/run-summary.json")
            with self.assertRaisesRegex(ValueError, "skipped stage"):
                self._write(root, stages=stage_values(terminal))

    def test_mace_derived_wheel_manifest_tracks_the_wheelhouse_outcome(self) -> None:
        wheelhouse = outcome.STAGES.index("wheelhouse")
        resolve = outcome.STAGES.index("resolve")

        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            self._write_files_for_successful_prefix(root, "mace", resolve)
            _, manifest = self._write(
                root, model="mace", stages=stage_values(resolve)
            )
            self.assertIn(outcome.DERIVED_WHEEL_MANIFEST, manifest["publishedFiles"])

        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            self._write_files_for_successful_prefix(root, "mace", wheelhouse)
            self._file(root, outcome.DERIVED_WHEEL_MANIFEST, b"partial\n")
            _, manifest = self._write(
                root, model="mace", stages=stage_values(wheelhouse)
            )
            self.assertIn(outcome.DERIVED_WHEEL_MANIFEST, manifest["publishedFiles"])

        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            structures = outcome.STAGES.index("structures")
            self._write_files_for_successful_prefix(root, "mace", structures)
            self._file(root, outcome.DERIVED_WHEEL_MANIFEST)
            with self.assertRaisesRegex(ValueError, "skipped stage"):
                self._write(root, model="mace", stages=stage_values(structures))

        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            self._write_files_for_successful_prefix(root, "mace", resolve)
            (root / outcome.DERIVED_WHEEL_MANIFEST).unlink()
            with self.assertRaisesRegex(ValueError, "successful MACE wheelhouse"):
                self._write(root, model="mace", stages=stage_values(resolve))

        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            self._file(root, outcome.DERIVED_WHEEL_MANIFEST)
            with self.assertRaisesRegex(ValueError, "unknown file"):
                self._write(root, model="mattersim", stages=stage_values(0))

    def test_successful_stage_requires_its_allowlisted_completion_files(self) -> None:
        terminal = outcome.STAGES.index("build")
        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            self._write_files_for_successful_prefix(root, "mattersim", terminal)
            (root / "manifests/structures.manifest.json").unlink()
            with self.assertRaisesRegex(ValueError, "successful structures stage"):
                self._write(root, stages=stage_values(terminal))

    def test_rejects_unknown_files_links_and_non_regular_entries(self) -> None:
        cases = ("unknown", "symlink", "hardlink", "fifo")
        for case in cases:
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temporary:
                root = self._root(temporary)
                if case == "unknown":
                    self._file(root, "metrics.json")
                elif case == "symlink":
                    target = Path(temporary).resolve() / "target"
                    target.write_text("untrusted", encoding="utf-8")
                    (root / "manifests/fetched-assets.manifest.json").symlink_to(target)
                elif case == "hardlink":
                    target = Path(temporary).resolve() / "target"
                    target.write_text("untrusted", encoding="utf-8")
                    os.link(target, root / "manifests/fetched-assets.manifest.json")
                else:
                    os.mkfifo(root / "manifests/fetched-assets.manifest.json")
                with self.assertRaises(ValueError):
                    self._write(root, stages=stage_values(0))

    def test_rejects_path_escape_relative_and_symlinked_roots(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            canonical = self._root(temporary)
            with self.assertRaisesRegex(ValueError, "normalized absolute"):
                self._write(canonical, publish_root="relative/publish", stages=stage_values(0))

            escaped = canonical / ".." / canonical.name
            with self.assertRaisesRegex(ValueError, "normalized absolute"):
                self._write(canonical, publish_root=str(escaped), stages=stage_values(0))

            link = canonical.parent / "publish-link"
            link.symlink_to(canonical, target_is_directory=True)
            with self.assertRaisesRegex(ValueError, "canonical"):
                self._write(canonical, publish_root=str(link), stages=stage_values(0))

    def test_rejects_invalid_commit_run_model_and_bounded_files(self) -> None:
        identity_cases = (
            {"commit_sha": "f" * 39},
            {"commit_sha": "F" * 40},
            {"commit_sha": "0" * 40},
            {"run_id": "0"},
            {"run_id": "01"},
            {"run_id": str(outcome.MAX_RUN_ID + 1)},
            {"run_attempt": "0"},
            {"run_attempt": str(outcome.MAX_RUN_ATTEMPT + 1)},
            {"model": "joint"},
        )
        for overrides in identity_cases:
            with self.subTest(overrides=overrides), tempfile.TemporaryDirectory() as temporary:
                root = self._root(temporary)
                with self.assertRaises(ValueError):
                    self._write(root, stages=stage_values(0), **overrides)

        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            oversized = root / "manifests/fetched-assets.manifest.json"
            with oversized.open("wb") as handle:
                handle.truncate(outcome.MAX_PUBLISHED_FILE_BYTES + 1)
            with self.assertRaisesRegex(ValueError, "exceeds its bound"):
                self._write(root, stages=stage_values(0))

    def test_aggregate_bound_includes_the_new_outcome_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            terminal = outcome.STAGES.index("inference")
            self._write_files_for_successful_prefix(root, "mattersim", terminal)
            for relative in (
                "manifests/fetched-assets.manifest.json",
                "manifests/structures.manifest.json",
                "manifests/pytorch-download-sources.json",
            ):
                (root / relative).write_bytes(b"")
            for relative in (
                "locks/mattersim.requirements.lock",
                "manifests/mattersim.wheelhouse.manifest.json",
            ):
                with (root / relative).open("wb") as handle:
                    handle.truncate(outcome.MAX_PUBLISHED_FILE_BYTES)
            with self.assertRaisesRegex(ValueError, "plus outcome exceed"):
                self._write(root, stages=stage_values(terminal))

    def test_refuses_to_overwrite_an_existing_outcome(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            existing = root / outcome.OUTPUT_RELATIVE_PATH
            existing.write_text("original\n", encoding="ascii")
            with self.assertRaisesRegex(ValueError, "overwrite"):
                self._write(root, stages=stage_values(0))
            self.assertEqual(existing.read_text(encoding="ascii"), "original\n")

    def test_cli_writes_only_the_fixed_manifest_and_reports_failure_cleanly(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            arguments = [
                "--model", "mattersim",
                "--commit-sha", COMMIT_SHA,
                "--run-id", "33209101610",
                "--run-attempt", "1",
                "--publish-root", str(root),
            ]
            for value in stage_values(0):
                arguments.extend(("--stage", value))
            stdout = io.StringIO()
            stderr = io.StringIO()
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                status = outcome.main(arguments)
            self.assertEqual(status, 0)
            self.assertEqual(stderr.getvalue(), "")
            report = json.loads(stdout.getvalue())
            self.assertEqual(report["status"], "failed")
            self.assertEqual(report["evidenceClass"], outcome.EVIDENCE_CLASS)
            self.assertEqual(Path(report["output"]), root / outcome.OUTPUT_RELATIVE_PATH)

    def _root(self, temporary: str) -> Path:
        root = (Path(temporary).resolve() / "publish")
        for directory in outcome.ALLOWED_DIRECTORIES:
            (root / directory).mkdir(parents=True, exist_ok=True)
        return root

    def _file(self, root: Path, relative: str, payload: bytes = b"{}\n") -> None:
        path = root / relative
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(payload)

    def _write_success_files(self, root: Path, model: str) -> None:
        for relative in (
            "manifests/fetched-assets.manifest.json",
            "manifests/structures.manifest.json",
            "manifests/pytorch-download-sources.json",
            f"locks/{model}.requirements.lock",
            f"manifests/{model}.wheelhouse.manifest.json",
            "manifests/run-summary.json",
            "predictions/predictions.jsonl",
            "diagnostics/run-diagnostics.json",
        ):
            self._file(root, relative)
        if model == "mace":
            self._file(root, outcome.DERIVED_WHEEL_MANIFEST)

    def _write_files_for_successful_prefix(
        self, root: Path, model: str, terminal: int
    ) -> None:
        succeeded = set(outcome.STAGES[:terminal])
        if "assets" in succeeded:
            self._file(root, "manifests/fetched-assets.manifest.json")
        if "structures" in succeeded:
            self._file(root, "manifests/structures.manifest.json")
        if "wheelhouse" in succeeded:
            self._file(root, "manifests/pytorch-download-sources.json")
            if model == "mace":
                self._file(root, outcome.DERIVED_WHEEL_MANIFEST)
        if "resolve" in succeeded:
            self._file(root, f"locks/{model}.requirements.lock")
            self._file(root, f"manifests/{model}.wheelhouse.manifest.json")
        if "inference" in succeeded:
            self._file(root, "manifests/run-summary.json")
            self._file(root, "predictions/predictions.jsonl")
            self._file(root, "diagnostics/run-diagnostics.json")

    def _write(
        self,
        root: Path,
        *,
        model: str = "mattersim",
        commit_sha: str = COMMIT_SHA,
        run_id: str = "33209101610",
        run_attempt: str = "1",
        publish_root: str | None = None,
        stages: list[str],
    ):
        return outcome.write_outcome(
            model=model,
            commit_sha=commit_sha,
            run_id=run_id,
            run_attempt=run_attempt,
            publish_root=publish_root if publish_root is not None else str(root),
            raw_stages=stages,
        )


if __name__ == "__main__":
    unittest.main()
