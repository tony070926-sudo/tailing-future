from __future__ import annotations

import os
import stat
import tempfile
import unittest
import zipfile
from pathlib import Path

from safe_extract_zip import main


class SafeExtractZipTests(unittest.TestCase):
    def test_extracts_hidden_and_nested_regular_files(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            archive = root / "artifact.zip"
            output = root / "output"
            output.mkdir()
            with zipfile.ZipFile(archive, "w") as handle:
                handle.writestr("dist/server/wrangler.json", b"{}")
                handle.writestr("dist/server/.vite/manifest.json", b"{}")
            self.assertEqual(main(["--archive", str(archive), "--output", str(output)]), 0)
            self.assertEqual((output / "dist/server/wrangler.json").read_bytes(), b"{}")
            self.assertEqual((output / "dist/server/.vite/manifest.json").read_bytes(), b"{}")

    def test_rejects_traversal_duplicate_and_symlink_members(self) -> None:
        for mode in ("traversal", "duplicate", "symlink"):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary).resolve()
                archive = root / "artifact.zip"
                output = root / "output"
                output.mkdir()
                with zipfile.ZipFile(archive, "w") as handle:
                    if mode == "traversal":
                        handle.writestr("../outside", b"bad")
                    elif mode == "duplicate":
                        handle.writestr("dist/value", b"first")
                        handle.writestr("dist/value", b"second")
                    else:
                        info = zipfile.ZipInfo("dist/link")
                        info.create_system = 3
                        info.external_attr = (stat.S_IFLNK | 0o777) << 16
                        handle.writestr(info, "target")
                with self.assertRaises(ValueError):
                    main(["--archive", str(archive), "--output", str(output)])
                self.assertFalse((root / "outside").exists())

    @unittest.skipUnless(hasattr(os, "symlink"), "symlink support required")
    def test_rejects_symlinked_archive_or_nonempty_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary).resolve()
            archive = root / "artifact.zip"
            with zipfile.ZipFile(archive, "w") as handle:
                handle.writestr("dist/value", b"ok")
            link = root / "archive-link.zip"
            link.symlink_to(archive)
            output = root / "output"
            output.mkdir()
            with self.assertRaises(ValueError):
                main(["--archive", str(link), "--output", str(output)])
            (output / "occupied").write_bytes(b"x")
            with self.assertRaises(ValueError):
                main(["--archive", str(archive), "--output", str(output)])


if __name__ == "__main__":
    unittest.main()
