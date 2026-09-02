from __future__ import annotations

import copy
from contextlib import ExitStack
import json
import math
import os
import stat
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock


HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[2]
sys.path.insert(0, str(HERE))

import nacl_water_interface_import_v0411 as subject


class CanonicalValueTests(unittest.TestCase):
    def test_ecmascript_number_golden_boundaries(self) -> None:
        values = [0, -0.0, 0.0, 1e-7, 1e21, 1e-6, 1e20, 5e-324, 1.7976931348623157e308]
        self.assertEqual(
            subject.canonical_json_bytes(values),
            (
                b"[0,0,0,1e-7,1e+21,0.000001,100000000000000000000,"
                b"5e-324,1.7976931348623157e+308]"
            ),
        )
        self.assertEqual(
            subject.digest_value([0, -0.0, 0.0, 1e-7, 1e21]),
            "sha256:42a312db6567a94c25c159743cdfad37637d8d07600423f4b102c5536633cd6d",
        )

    def test_utf16_key_order_and_strict_i_json_rejections(self) -> None:
        value = {"\U0001f600": 1, "\ufffd": 2, "a": 3}
        self.assertEqual(
            subject.canonical_json_bytes(value),
            '{"a":3,"😀":1,"�":2}'.encode("utf-8"),
        )
        with self.assertRaises(subject.ImportViolation):
            subject.canonical_json_bytes({"bad": math.nan})
        with self.assertRaises(subject.ImportViolation):
            subject.canonical_json_bytes({"bad": 2**53})
        with self.assertRaises(subject.ImportViolation):
            subject.canonical_json_bytes({"\ud800": 1})

    def test_strict_parser_rejects_duplicate_keys_constants_bom_and_depth(self) -> None:
        for payload in (
            b'{"a":1,"a":2}',
            b'{"a":NaN}',
            b'\xef\xbb\xbf{"a":1}',
            (b"[" * 40) + b"0" + (b"]" * 40),
        ):
            with self.subTest(payload=payload[:20]):
                with self.assertRaises(subject.ImportViolation):
                    subject.parse_strict_json(payload)
        with self.assertRaises(subject.ImportViolation):
            subject._number(True, "probe")


class SemanticImportTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.temporary = tempfile.TemporaryDirectory(prefix="tf-v0411-test-")
        cls.root = Path(cls.temporary.name).resolve()
        cls.plan_path = cls.root / "plan.json"
        cls.output = cls.root / "normalized"
        subprocess.run(
            [
                "node",
                str(HERE / "export-nacl-water-interface-plan-v0411.mjs"),
                "--output",
                str(cls.plan_path),
            ],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )
        cls.receipt = subject.import_plan(cls.plan_path, cls.output)
        cls.plan = subject.parse_strict_json(cls.plan_path.read_bytes())

    @classmethod
    def tearDownClass(cls) -> None:
        os.chmod(cls.output, 0o700)
        for child in (cls.output / "arrays", cls.output / "manifests"):
            os.chmod(child, 0o700)
        cls.temporary.cleanup()

    def test_full_locked_plan_rebuilds_all_six_digests_and_semantics(self) -> None:
        receipt = self.receipt
        self.assertEqual(receipt["digests"]["expected"], subject.LOCKED_DIGESTS)
        self.assertEqual(receipt["digests"]["recomputed"], subject.LOCKED_DIGESTS)
        self.assertEqual(
            receipt["subject"],
            {
                "schemaVersion": "tf.nacl-water-interface-plan/0.4.10",
                "byteCount": subject.EXPECTED_PLAN_BYTES,
                "rawSha256": subject.EXPECTED_PLAN_RAW_SHA256,
                "canonicalValueSha256": subject.EXPECTED_CANONICAL_VALUE_SHA256,
            },
        )
        self.assertEqual(receipt["semanticAudit"]["particleCount"], 6336)
        self.assertEqual(receipt["semanticAudit"]["structuralBondCount"], 3456)
        self.assertEqual(receipt["semanticAudit"]["rigidConstraintCount"], 5184)
        self.assertEqual(
            receipt["semanticAudit"]["minimumIonWaterDistanceNanometer"],
            subject.EXPECTED_MIN_ION_WATER_NM,
        )
        self.assertEqual(receipt["execution"]["solverInvoked"], False)
        self.assertEqual(receipt["claims"]["publicReleaseEligible"], False)
        self.assertEqual(
            receipt["verifier"]["sourceSha256"],
            subject.IMPORTER_SOURCE_SHA256,
        )
        self.assertEqual(
            receipt["verifier"]["sourceSha256"],
            subject.digest_bytes(Path(subject.__file__).read_bytes()),
        )

    def test_normalized_bundle_is_closed_read_only_and_self_bound(self) -> None:
        receipt = self.receipt
        expected_files = {"semantic-import-receipt.json"}
        for descriptor in receipt["normalizedArtifacts"]["artifacts"]:
            artifact = self.output / descriptor["path"]
            expected_files.add(descriptor["path"])
            self.assertEqual(artifact.stat().st_size, descriptor["sizeBytes"])
            self.assertEqual(subject.digest_bytes(artifact.read_bytes()), descriptor["sha256"])
            self.assertEqual(stat.S_IMODE(artifact.stat().st_mode), 0o444)
            self.assertEqual(artifact.stat().st_nlink, 1)
        actual_files = {
            path.relative_to(self.output).as_posix()
            for path in self.output.rglob("*")
            if path.is_file()
        }
        self.assertEqual(actual_files, expected_files)
        self.assertEqual(
            receipt["normalizedArtifacts"]["semanticRoot"],
            subject.digest_value(receipt["normalizedArtifacts"]["artifacts"]),
        )
        without_receipt_digest = dict(receipt)
        del without_receipt_digest["receiptDigest"]
        self.assertEqual(receipt["receiptDigest"], subject.digest_value(without_receipt_digest))
        self.assertEqual(
            receipt["stableEvidenceDigest"],
            subject.digest_value(subject._stable_evidence_preimage(receipt)),
        )
        on_disk = subject.parse_strict_json((self.output / "semantic-import-receipt.json").read_bytes())
        self.assertEqual(on_disk, receipt)

    def test_direct_semantic_mutations_fail_closed(self) -> None:
        mutations = []
        changed_coordinate = copy.deepcopy(self.plan)
        changed_coordinate["coordinateSeed"]["atoms"][0]["positionNanometer"]["x"] += 0.01
        mutations.append(changed_coordinate)
        changed_gate = copy.deepcopy(self.plan)
        changed_gate["system"]["prerequisiteGates"][0]["status"] = "satisfied"
        mutations.append(changed_gate)
        changed_charge = copy.deepcopy(self.plan)
        changed_charge["coordinateSeed"]["atoms"][1152]["modelPointChargeE"] = 0
        mutations.append(changed_charge)
        swapped_digest = copy.deepcopy(self.plan)
        swapped_digest["coordinateSeed"]["constructionReceipt"]["topologyDigest"] = (
            subject.LOCKED_DIGESTS["coordinatePayload"]
        )
        mutations.append(swapped_digest)
        for index, mutation in enumerate(mutations):
            with self.subTest(index=index):
                with self.assertRaises(subject.ImportViolation):
                    subject.verify_plan_value(mutation)

    def test_existing_output_is_never_overwritten(self) -> None:
        existing = self.root / "existing-output"
        existing.mkdir()
        sentinel = existing / "sentinel"
        sentinel.write_text("preserve", encoding="utf-8")
        with self.assertRaises(subject.ImportViolation):
            subject.import_plan(self.plan_path, existing)
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "preserve")

    def test_hostile_plan_links_are_rejected(self) -> None:
        symlink = self.root / "plan-link.json"
        symlink.symlink_to(self.plan_path)
        with self.assertRaises(subject.ImportViolation):
            subject.read_plan_file(symlink)
        hardlink = self.root / "plan-hardlink.json"
        os.link(self.plan_path, hardlink)
        try:
            with self.assertRaises(subject.ImportViolation):
                subject.read_plan_file(self.plan_path)
        finally:
            hardlink.unlink()

    def test_failure_cleanup_never_deletes_a_replacement_directory(self) -> None:
        output = self.root / "race-output"
        displaced = self.root / "race-output-displaced"
        replacement = self.root / "race-output-replacement"
        replacement.mkdir()
        sentinel = replacement / "sentinel"
        sentinel.write_text("preserve", encoding="utf-8")

        def replace_and_fail(*_arguments: object) -> tuple[int, int]:
            output.rename(displaced)
            replacement.rename(output)
            raise OSError("injected write failure after output path replacement")

        with ExitStack() as stack:
            stack.enter_context(mock.patch.object(
                subject, "read_plan_file", return_value=self.plan_path.read_bytes()
            ))
            stack.enter_context(mock.patch.object(subject, "parse_strict_json", return_value=self.plan))
            stack.enter_context(mock.patch.object(
                subject, "verify_plan_value", return_value=({}, subject.LOCKED_DIGESTS)
            ))
            stack.enter_context(mock.patch.object(
                subject,
                "build_normalized_artifacts",
                return_value=[
                    ({"path": "arrays/probe.bin"}, b"probe"),
                    ({"path": "manifests/identity-ledger.json"}, b"[]\n"),
                ],
            ))
            stack.enter_context(mock.patch.object(
                subject, "_write_exclusive", side_effect=replace_and_fail
            ))
            with self.assertRaisesRegex(OSError, "injected write failure"):
                subject.import_plan(self.plan_path, output)

        self.assertTrue(output.is_dir())
        self.assertEqual((output / "sentinel").read_text(encoding="utf-8"), "preserve")
        self.assertTrue(displaced.is_dir())

    def test_path_replacement_with_symlink_cannot_receive_outputs_or_pass(self) -> None:
        output = self.root / "symlink-race-output"
        displaced = self.root / "symlink-race-output-displaced"
        target = self.root / "symlink-race-target"
        target.mkdir()
        sentinel = target / "sentinel"
        sentinel.write_text("preserve", encoding="utf-8")
        original_writer = subject._write_exclusive
        normalized_artifacts = subject.build_normalized_artifacts(self.plan)
        replaced = False

        def replace_then_write(
            directory_descriptor: int,
            name: str,
            data: bytes,
        ) -> tuple[int, int]:
            nonlocal replaced
            if not replaced:
                output.rename(displaced)
                output.symlink_to(target, target_is_directory=True)
                replaced = True
            return original_writer(directory_descriptor, name, data)

        with ExitStack() as stack:
            stack.enter_context(mock.patch.object(
                subject, "read_plan_file", return_value=self.plan_path.read_bytes()
            ))
            stack.enter_context(mock.patch.object(subject, "parse_strict_json", return_value=self.plan))
            stack.enter_context(mock.patch.object(
                subject, "verify_plan_value", return_value=({}, subject.LOCKED_DIGESTS)
            ))
            stack.enter_context(mock.patch.object(
                subject,
                "build_normalized_artifacts",
                return_value=normalized_artifacts,
            ))
            stack.enter_context(mock.patch.object(
                subject, "_write_exclusive", side_effect=replace_then_write
            ))
            with self.assertRaisesRegex(subject.ImportViolation, "path identity changed"):
                subject.import_plan(self.plan_path, output)

        self.assertTrue(output.is_symlink())
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "preserve")
        self.assertEqual(sorted(path.name for path in target.iterdir()), ["sentinel"])
        self.assertTrue(displaced.is_dir())

    def test_root_inventory_injection_cannot_receive_a_success_receipt(self) -> None:
        output = self.root / "root-inventory-race-output"
        original_writer = subject._write_exclusive

        def inject_root_entry(
            directory_descriptor: int,
            name: str,
            data: bytes,
        ) -> tuple[int, int]:
            identity = original_writer(directory_descriptor, name, data)
            if name == "semantic-import-receipt.json":
                (output / "unexpected").write_bytes(b"preserve")
            return identity

        with ExitStack() as stack:
            stack.enter_context(mock.patch.object(
                subject, "read_plan_file", return_value=self.plan_path.read_bytes()
            ))
            stack.enter_context(mock.patch.object(subject, "parse_strict_json", return_value=self.plan))
            stack.enter_context(mock.patch.object(
                subject, "verify_plan_value", return_value=({}, subject.LOCKED_DIGESTS)
            ))
            stack.enter_context(mock.patch.object(
                subject,
                "build_normalized_artifacts",
                return_value=[({"path": "arrays/probe.bin"}, b"probe")],
            ))
            stack.enter_context(mock.patch.object(
                subject, "_write_exclusive", side_effect=inject_root_entry
            ))
            with self.assertRaisesRegex(subject.ImportViolation, "output inventory changed"):
                subject.import_plan(self.plan_path, output)

        self.assertTrue(output.is_dir())
        self.assertEqual((output / "unexpected").read_bytes(), b"preserve")
        self.assertFalse((output / "semantic-import-receipt.json").exists())


if __name__ == "__main__":
    unittest.main()
