from __future__ import annotations

import contextlib
import hashlib
import io
import json
import os
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
sys.path.insert(0, str(HERE))

import write_full_candidate_outcome as outcome


COMMIT_SHA = "1234567890abcdef1234567890abcdef12345678"


def stage_values(
    terminal: int | None = None,
    terminal_outcome: str = "failure",
    *,
    not_started: bool = False,
) -> list[str]:
    values: list[str] = []
    for index, stage in enumerate(outcome.STAGES):
        if not_started:
            value = "skipped"
        elif terminal is None or index < terminal:
            value = "success"
        elif index == terminal:
            value = terminal_outcome
        else:
            value = "skipped"
        values.append(f"{stage}={value}")
    return values


class FullCandidateProducerOutcomeTests(unittest.TestCase):
    def test_complete_is_canonical_deterministic_and_non_promotional(self) -> None:
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
            self.assertEqual(first_manifest["status"], "complete")
            self.assertEqual(first_manifest["statusDomain"], outcome.STATUS_DOMAIN)
            self.assertIsNone(first_manifest["terminalStage"])
            self.assertEqual(first_manifest["partitionId"], "mattersim-full-000")
            self.assertTrue(all(value is False for value in first_manifest["claims"].values()))
            self.assertIsNotNone(first_manifest["evidence"]["predictions"])
            self.assertIsNotNone(first_manifest["evidence"]["structureManifest"])
            self.assertEqual(first_manifest["evidence"]["partial"], [])
            self.assertEqual(first_manifest["evidence"]["failure"], [])

            canonical = (
                json.dumps(
                    first_manifest,
                    ensure_ascii=True,
                    sort_keys=True,
                    separators=(",", ":"),
                )
                + "\n"
            ).encode("ascii")
            self.assertEqual(first_path.read_bytes(), canonical)
            encoded = first_path.read_text(encoding="ascii")
            for forbidden_key in (
                '"scientificPass"',
                '"scientificFail"',
                '"metricPass"',
                '"assessment"',
            ):
                self.assertNotIn(forbidden_key, encoded)
            metadata = first_path.lstat()
            self.assertTrue(stat.S_ISREG(metadata.st_mode))
            self.assertFalse(first_path.is_symlink())
            self.assertEqual(metadata.st_nlink, 1)
            self.assertEqual(stat.S_IMODE(metadata.st_mode), 0o444)

    def test_evidence_records_exact_size_digest_stage_and_sorted_controls(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            self._write_success_files(root, "mattersim")
            prediction_payload = b'{"id":"random-TP-000000"}\n'
            self._file(root, "predictions/predictions.jsonl", prediction_payload)
            _, manifest = self._write(root, stages=stage_values())

            prediction = manifest["evidence"]["predictions"]
            self.assertEqual(prediction["sizeBytes"], len(prediction_payload))
            self.assertEqual(
                prediction["sha256"],
                "sha256:" + hashlib.sha256(prediction_payload).hexdigest(),
            )
            self.assertEqual(prediction["stage"], "inference")
            self.assertEqual(prediction["stageOutcome"], "success")
            controls = manifest["evidence"]["control"]
            self.assertEqual(
                [entry["path"] for entry in controls],
                sorted(entry["path"] for entry in controls),
            )

    def test_failed_and_cancelled_statuses_preserve_every_terminal_stage(self) -> None:
        for terminal, failed_stage in enumerate(outcome.STAGES):
            for terminal_outcome, expected_status in (
                ("failure", "failed"),
                ("cancelled", "cancelled"),
            ):
                with (
                    self.subTest(stage=failed_stage, outcome=terminal_outcome),
                    tempfile.TemporaryDirectory() as temporary,
                ):
                    root = self._root(temporary)
                    self._write_files_for_successful_prefix(root, "mattersim", terminal)
                    _, manifest = self._write(
                        root,
                        stages=stage_values(terminal, terminal_outcome),
                    )
                    self.assertEqual(manifest["status"], expected_status)
                    self.assertEqual(manifest["terminalStage"], failed_stage)
                    for entry in manifest["stages"][terminal + 1 :]:
                        self.assertEqual(entry["outcome"], "skipped")

    def test_all_skipped_is_the_only_not_started_vector(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            _, manifest = self._write(root, stages=stage_values(not_started=True))
            self.assertEqual(manifest["status"], "not-started")
            self.assertIsNone(manifest["terminalStage"])
            self.assertEqual(
                manifest["evidence"],
                {
                    "predictions": None,
                    "structureManifest": None,
                    "control": [],
                    "partial": [],
                    "failure": [],
                },
            )

        ambiguous = stage_values(not_started=True)
        ambiguous[0] = "guard=success"
        with self.assertRaisesRegex(ValueError, "first non-success"):
            outcome.parse_stage_outcomes(ambiguous)

    def test_rejects_forged_or_incoherent_stage_vectors(self) -> None:
        valid = stage_values(3)
        cases = {
            "missing": valid[:-1],
            "unknown": [*valid[:2], "forged=success", *valid[3:]],
            "reordered": [valid[1], valid[0], *valid[2:]],
            "unsupported": [*valid[:3], "base=not-started", *valid[4:]],
            "bare skipped": [*stage_values()[:3], "base=skipped", *stage_values()[4:]],
            "success after failure": [*valid[:4], "assets=success", *valid[5:]],
            "second failure": [*valid[:4], "assets=failure", *valid[5:]],
            "cancel after failure": [*valid[:4], "assets=cancelled", *valid[5:]],
            "malformed": [*valid[:3], "base=failure=forged", *valid[4:]],
        }
        for label, stages in cases.items():
            with self.subTest(case=label), self.assertRaises(ValueError):
                outcome.parse_stage_outcomes(stages)

    def test_forged_complete_requires_all_completion_evidence(self) -> None:
        required_paths = (
            "manifests/fetched-assets.manifest.json",
            "manifests/structures.manifest.json",
            "manifests/pytorch-download-sources.json",
            "locks/mattersim.requirements.lock",
            "manifests/mattersim.wheelhouse.manifest.json",
            "manifests/mattersim.runtime-inputs.json",
            "manifests/mattersim.container-observation.json",
            "diagnostics/mattersim.buildx-metadata.json",
            "diagnostics/mattersim.image-inspect.json",
            "diagnostics/mattersim.buildx-version.txt",
            "diagnostics/mattersim.docker-server-version.txt",
            "manifests/run-summary.json",
            "predictions/predictions.jsonl",
            "diagnostics/run-diagnostics.json",
        )
        for missing in required_paths:
            with self.subTest(missing=missing), tempfile.TemporaryDirectory() as temporary:
                root = self._root(temporary)
                self._write_success_files(root, "mattersim")
                (root / missing).unlink()
                with self.assertRaisesRegex(ValueError, "successful .* missing"):
                    self._write(root, stages=stage_values())

    def test_mace_complete_requires_and_records_derived_wheel_control(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            self._write_success_files(root, "mace")
            _, manifest = self._write(root, model="mace", stages=stage_values())
            self.assertEqual(manifest["partitionId"], "mace-full-000")
            self.assertIn(
                outcome.DERIVED_WHEEL_MANIFEST,
                [entry["path"] for entry in manifest["evidence"]["control"]],
            )

        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            self._write_success_files(root, "mace")
            (root / outcome.DERIVED_WHEEL_MANIFEST).unlink()
            with self.assertRaisesRegex(ValueError, "successful wheelhouse"):
                self._write(root, model="mace", stages=stage_values())

    def test_terminal_stage_files_are_partial_and_failure_evidence_is_separate(self) -> None:
        terminal = outcome.STAGES.index("inference")
        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            self._write_files_for_successful_prefix(root, "mattersim", terminal)
            self._file(root, "predictions/predictions.jsonl", b'{"partial":true}\n')
            self._file(root, "manifests/run-summary.json")
            self._file(root, "diagnostics/failure-diagnostics.json")
            _, manifest = self._write(root, stages=stage_values(terminal))

            self.assertIsNone(manifest["evidence"]["predictions"])
            self.assertEqual(
                [entry["path"] for entry in manifest["evidence"]["partial"]],
                ["manifests/run-summary.json", "predictions/predictions.jsonl"],
            )
            self.assertEqual(
                [entry["path"] for entry in manifest["evidence"]["failure"]],
                ["diagnostics/failure-diagnostics.json"],
            )
            self.assertTrue(
                all(
                    entry["stageOutcome"] == "failure"
                    for bucket in ("partial", "failure")
                    for entry in manifest["evidence"][bucket]
                )
            )

    def test_rejects_future_output_and_failure_diagnostics_on_complete(self) -> None:
        terminal = outcome.STAGES.index("resolve")
        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            self._write_files_for_successful_prefix(root, "mattersim", terminal)
            self._file(root, "predictions/predictions.jsonl")
            with self.assertRaisesRegex(ValueError, "skipped stage"):
                self._write(root, stages=stage_values(terminal))

        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            self._write_success_files(root, "mattersim")
            self._file(root, "diagnostics/failure-diagnostics.json")
            with self.assertRaisesRegex(ValueError, "failure diagnostics"):
                self._write(root, stages=stage_values())

    def test_rejects_symlink_hardlink_fifo_and_unknown_entries(self) -> None:
        for case in ("symlink", "hardlink", "fifo", "unknown-file", "unknown-directory"):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temporary:
                root = self._root(temporary)
                target = Path(temporary).resolve() / "target"
                target.write_bytes(b"untrusted\n")
                member = root / "manifests/fetched-assets.manifest.json"
                if case == "symlink":
                    member.symlink_to(target)
                elif case == "hardlink":
                    os.link(target, member)
                elif case == "fifo":
                    os.mkfifo(member)
                elif case == "unknown-file":
                    self._file(root, "manifests/notes.json")
                else:
                    (root / "structures").mkdir()
                with self.assertRaises(ValueError):
                    self._write(root, stages=stage_values(0))

    def test_rejects_label_metric_receipt_checkpoint_and_raw_structure_names(self) -> None:
        forbidden = (
            "manifests/reference-labels.json",
            "manifests/targets.json",
            "diagnostics/metrics.json",
            "manifests/receipt.json",
            "manifests/attestation.json",
            "manifests/model.checkpoint",
            "manifests/random-TP.xyz",
            "manifests/structures.jsonl",
            "manifests/positions.json",
            "manifests/cell.json",
            "manifests/pbc.json",
        )
        for relative in forbidden:
            with self.subTest(relative=relative), tempfile.TemporaryDirectory() as temporary:
                root = self._root(temporary)
                self._file(root, relative)
                with self.assertRaisesRegex(ValueError, "unknown or forbidden"):
                    self._write(root, stages=stage_values(0))

    def test_rejects_empty_oversize_and_too_many_members(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            self._file(root, "manifests/fetched-assets.manifest.json", b"")
            with self.assertRaisesRegex(ValueError, "must not be empty"):
                self._write(root, stages=stage_values(0))

        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            oversized = root / "manifests/fetched-assets.manifest.json"
            with oversized.open("wb") as handle:
                handle.truncate(outcome.MAX_PUBLISHED_FILE_BYTES + 1)
            with self.assertRaisesRegex(ValueError, "exceeds its bound"):
                self._write(root, stages=stage_values(0))

        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            original_bound = outcome.MAX_DIRECTORY_ENTRIES
            try:
                outcome.MAX_DIRECTORY_ENTRIES = 4
                self._file(root, "manifests/fetched-assets.manifest.json")
                with self.assertRaisesRegex(ValueError, "too many entries"):
                    self._write(root, stages=stage_values(0))
            finally:
                outcome.MAX_DIRECTORY_ENTRIES = original_bound

    def test_rejects_forged_status_argument_and_invalid_identity(self) -> None:
        parser_arguments = [
            "--model",
            "mattersim",
            "--commit-sha",
            COMMIT_SHA,
            "--run-id",
            "1",
            "--run-attempt",
            "1",
            "--publish-root",
            "/tmp/publish",
            "--status",
            "complete",
        ]
        with contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit):
            outcome._parser().parse_args(parser_arguments)

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

    def test_rejects_relative_escaped_symlinked_and_noncanonical_paths(self) -> None:
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

            overlong = "/" + "a" * outcome.MAX_PATH_BYTES
            with self.assertRaisesRegex(ValueError, "exceeds its bound"):
                self._write(canonical, publish_root=overlong, stages=stage_values(0))

    def test_exclusive_output_refuses_regular_symlink_and_hardlinked_destinations(self) -> None:
        for case in ("regular", "symlink", "hardlink"):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temporary:
                root = self._root(temporary)
                output_path = root / outcome.OUTPUT_RELATIVE_PATH
                target = Path(temporary).resolve() / "target"
                target.write_bytes(b"original\n")
                if case == "regular":
                    output_path.write_bytes(b"original\n")
                elif case == "symlink":
                    output_path.symlink_to(target)
                else:
                    os.link(target, output_path)
                with self.assertRaises(ValueError):
                    self._write(root, stages=stage_values(0))
                self.assertEqual(target.read_bytes(), b"original\n")

    def test_rescan_detects_toctou_mutation_before_exclusive_publish(self) -> None:
        terminal = outcome.STAGES.index("inference")
        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            self._write_files_for_successful_prefix(root, "mattersim", terminal)
            target = root / "manifests/fetched-assets.manifest.json"
            original_scan = outcome._scan_publish_root_fd
            calls = 0

            def scan_then_mutate(root_fd: int, model: str):
                nonlocal calls
                result = original_scan(root_fd, model)
                calls += 1
                if calls == 1:
                    target.write_bytes(b"changed after inventory\n")
                return result

            with mock.patch.object(outcome, "_scan_publish_root_fd", scan_then_mutate):
                with self.assertRaisesRegex(ValueError, "changed before outcome"):
                    self._write(root, stages=stage_values(terminal))
            self.assertFalse((root / outcome.OUTPUT_RELATIVE_PATH).exists())

    def test_schema_identity_claims_and_allowlist_are_frozen(self) -> None:
        schema_path = ROOT / "schemas/atomistic-full-candidate-producer-outcome.schema.json"
        schema = json.loads(schema_path.read_bytes())
        self.assertEqual(
            schema["$id"],
            "https://tailing.future/schemas/atomistic-full-candidate-producer-outcome/0.2",
        )
        self.assertEqual(
            schema["properties"]["schemaVersion"]["const"], outcome.SCHEMA_VERSION
        )
        self.assertEqual(
            schema["properties"]["outputPath"]["const"], outcome.OUTPUT_RELATIVE_PATH
        )
        self.assertEqual(schema["properties"]["claims"]["const"], outcome.CLAIMS)
        publication = schema["properties"]["publicationPolicy"]["const"]
        self.assertFalse(publication["workingDirectoryIsPublicArtifact"])
        self.assertFalse(publication["scientificArtifactPublicationEligible"])
        self.assertFalse(publication["administrativeEvidenceArtifactPublicationEligible"])
        self.assertFalse(publication["atomicNumbersPublicationLicenseCleared"])
        self.assertEqual(
            publication["scientificArtifactExactPaths"],
            list(outcome.SCIENTIFIC_ARTIFACT_EXACT_PATHS),
        )
        self.assertTrue(all(value is False for value in outcome.CLAIMS.values()))
        schema_paths = set(schema["$defs"]["publicMemberPath"]["enum"])
        script_paths = set(outcome._file_rules("mattersim")) | set(
            outcome._file_rules("mace")
        )
        script_paths.remove(outcome.OUTPUT_RELATIVE_PATH)
        self.assertEqual(schema_paths, script_paths)
        lowered = "\n".join(schema_paths).lower()
        for forbidden in (
            "structures.jsonl",
            "reference-label",
            "targets.json",
            "metrics.json",
            "receipt.json",
            "attestation.json",
            ".checkpoint",
        ):
            self.assertNotIn(forbidden, lowered)

    def test_cli_reports_derived_status_without_accepting_scientific_status(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = self._root(temporary)
            arguments = [
                "--model",
                "mattersim",
                "--commit-sha",
                COMMIT_SHA,
                "--run-id",
                "33209101610",
                "--run-attempt",
                "1",
                "--publish-root",
                str(root),
            ]
            for value in stage_values(0, "cancelled"):
                arguments.extend(("--stage", value))
            stdout = io.StringIO()
            stderr = io.StringIO()
            with contextlib.redirect_stdout(stdout), contextlib.redirect_stderr(stderr):
                status = outcome.main(arguments)
            self.assertEqual(status, 0)
            self.assertEqual(stderr.getvalue(), "")
            report = json.loads(stdout.getvalue())
            self.assertEqual(report["status"], "cancelled")
            self.assertEqual(report["evidenceClass"], outcome.EVIDENCE_CLASS)
            self.assertEqual(Path(report["output"]), root / outcome.OUTPUT_RELATIVE_PATH)

    def _root(self, temporary: str) -> Path:
        root = Path(temporary).resolve() / "publish"
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
            f"manifests/{model}.runtime-inputs.json",
            f"manifests/{model}.container-observation.json",
            f"diagnostics/{model}.buildx-metadata.json",
            f"diagnostics/{model}.image-inspect.json",
            f"diagnostics/{model}.buildx-version.txt",
            f"diagnostics/{model}.docker-server-version.txt",
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
            self._file(root, f"manifests/{model}.runtime-inputs.json")
        if "build" in succeeded:
            self._file(root, f"manifests/{model}.container-observation.json")
            self._file(root, f"diagnostics/{model}.buildx-metadata.json")
            self._file(root, f"diagnostics/{model}.image-inspect.json")
            self._file(root, f"diagnostics/{model}.buildx-version.txt")
            self._file(root, f"diagnostics/{model}.docker-server-version.txt")
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
