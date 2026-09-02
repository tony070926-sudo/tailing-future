from __future__ import annotations

import math
import os
import stat
import struct
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

import binary_codec
import contract


class ContractTests(unittest.TestCase):
    def test_openmm_runtime_identity_is_source_exact_not_version_only(self) -> None:
        self.assertEqual(contract.OPENMM_VERSION, "8.6.0")
        self.assertEqual(contract.OPENMM_FULL_VERSION, "8.6.0.dev-c6173db")
        self.assertEqual(
            contract.OPENMM_SOURCE_COMMIT,
            "c6173db6e8edd705eb59172bd21e9ce69c572405",
        )
        self.assertIs(contract.OPENMM_RELEASE_FLAG, False)

    def test_canonical_json_and_binary_codecs_are_deterministic(self) -> None:
        self.assertEqual(contract.canonical_json_bytes({"z": 1, "a": 2}), b'{"a":2,"z":1}\n')
        with self.assertRaises(ValueError):
            contract.canonical_json_bytes({"bad": math.nan})

        encoded = binary_codec.encode_f64le([1, -0.0, 2.5])
        self.assertEqual(binary_codec.decode_f64le(encoded), (1.0, 0.0, 2.5))
        self.assertEqual(encoded[8:16], struct.pack("<d", 0.0))
        with self.assertRaisesRegex(contract.ContractViolation, "not finite"):
            binary_codec.encode_f64le([math.inf])
        with self.assertRaisesRegex(contract.ContractViolation, "outside"):
            binary_codec.encode_u32le([-1])
        self.assertEqual(binary_codec.decode_u32le(binary_codec.encode_u32le([0, 2**32 - 1])), (0, 2**32 - 1))

    def test_atomic_array_writer_enforces_shape_and_read_only_result(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            with binary_codec.AtomicArrayWriter(
                output_root=root,
                artifact_id="probe-array",
                relative_path="arrays/probe.f64le",
                dtype="float64-le",
                shape=(2, 2),
                unit="nanometer",
            ) as writer:
                writer.write([[1.0, 2.0], [3.0, 4.0]])
                descriptor = writer.finish()
            path = root / "arrays/probe.f64le"
            self.assertEqual(descriptor["kind"], "array")
            self.assertEqual(descriptor["sizeBytes"], 32)
            self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o444)
            self.assertEqual(binary_codec.decode_f64le(path.read_bytes()), (1.0, 2.0, 3.0, 4.0))

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            writer = binary_codec.AtomicArrayWriter(
                output_root=root,
                artifact_id="short-array",
                relative_path="arrays/short.u32le",
                dtype="uint32-le",
                shape=(2,),
                unit="index",
            )
            writer.write([1])
            with self.assertRaisesRegex(contract.ContractViolation, "expected 2"):
                writer.finish()
            self.assertFalse((root / "arrays/short.u32le").exists())
            self.assertEqual(list((root / "arrays").iterdir()), [])

    def test_array_descriptor_validator_binds_every_identity_field(self) -> None:
        descriptor = contract.array_descriptor(
            artifact_id="probe-array",
            path="arrays/probe.f64le",
            dtype="float64-le",
            shape=(2, 3),
            unit="nanometer",
            data=bytes(2 * 3 * 8),
        )
        contract.validate_descriptor(descriptor)
        for field, value in (
            ("id", "Bad"),
            ("kind", "canonical-json"),
            ("dtype", "uint32-le"),
            ("shape", [2, 2]),
            ("unit", "meters"),
            ("sizeBytes", 1),
        ):
            changed = dict(descriptor)
            changed[field] = value
            with self.assertRaises(contract.ContractViolation):
                contract.validate_descriptor(changed)

    def test_stage_vector_has_closed_atomic_status_semantics(self) -> None:
        success = tuple((stage, "success") for stage in contract.STAGES)
        status, terminal, normalized = contract.validate_stage_vector(success)
        self.assertEqual((status, terminal), ("complete-pass", None))
        self.assertEqual(len(normalized), len(contract.STAGES))

        failed = tuple(
            (stage, "success" if index < 3 else "failure" if index == 3 else "skipped")
            for index, stage in enumerate(contract.STAGES)
        )
        self.assertEqual(contract.validate_stage_vector(failed)[:2], ("complete-fail", contract.STAGES[3]))
        cancelled = tuple(
            (stage, "success" if index < 2 else "cancelled" if index == 2 else "skipped")
            for index, stage in enumerate(contract.STAGES)
        )
        self.assertEqual(contract.validate_stage_vector(cancelled)[:2], ("incomplete", contract.STAGES[2]))
        skipped = tuple((stage, "skipped") for stage in contract.STAGES)
        self.assertEqual(contract.validate_stage_vector(skipped)[:2], ("incomplete", None))

        malformed = list(failed)
        malformed[-1] = (contract.STAGES[-1], "success")
        with self.assertRaisesRegex(contract.ContractViolation, "after"):
            contract.validate_stage_vector(tuple(malformed))

    def test_input_root_is_closed_and_byte_bound(self) -> None:
        synthetic = {
            "coordinates": {"filename": "tip3p.pdb", "sizeBytes": 3, "sha256": contract.digest_bytes(b"pdb")},
            "parameters": {"filename": "tip3p.xml", "sizeBytes": 3, "sha256": contract.digest_bytes(b"xml")},
            "license": {"filename": "Licenses.txt", "sizeBytes": 3, "sha256": contract.digest_bytes(b"lic")},
        }
        with tempfile.TemporaryDirectory() as temporary, mock.patch.object(contract, "INPUT_FILES", synthetic):
            root = Path(temporary).resolve()
            (root / "tip3p.pdb").write_bytes(b"pdb")
            (root / "tip3p.xml").write_bytes(b"xml")
            (root / "Licenses.txt").write_bytes(b"lic")
            receipt = contract.validate_input_root(root)
            self.assertEqual(set(receipt), set(synthetic))
            (root / "extra").write_bytes(b"x")
            with self.assertRaisesRegex(contract.ContractViolation, "exactly"):
                contract.validate_input_root(root)

    def test_regular_reader_rejects_symlinks_and_hardlinks(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            original = root / "original"
            original.write_bytes(b"evidence")
            symlink = root / "symlink"
            symlink.symlink_to(original)
            with self.assertRaises(contract.ContractViolation):
                contract.read_regular_file(symlink)
            hardlink = root / "hardlink"
            os.link(original, hardlink)
            with self.assertRaises(contract.ContractViolation):
                contract.read_regular_file(original)

    def test_canonical_directory_rejects_a_symlink_ancestor(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            real = root / "real"
            real.mkdir()
            alias = root / "alias"
            alias.symlink_to(real, target_is_directory=True)
            with self.assertRaisesRegex(contract.ContractViolation, "symbolic-link ancestor"):
                contract.canonical_directory(alias, "aliased root")
            with self.assertRaisesRegex(contract.ContractViolation, "symbolic-link ancestor"):
                contract.canonical_directory(alias / "new", "aliased output", create=True)
            self.assertFalse((real / "new").exists())


if __name__ == "__main__":
    unittest.main()
