#!/usr/bin/env python3
"""Verify the one reviewed wheel derived from python-hostlist's pinned sdist.

The source build runs elsewhere.  This verifier is deliberately offline and
accepts no mutable package identity: it binds the official sdist identity, two
declared clean-build digests, and the actual wheel bytes into one small JSON
record.  It does not claim that the caller really used an isolated builder;
that boundary belongs to the workflow policy which invokes this program.
"""

from __future__ import annotations

import argparse
import base64
import csv
import hashlib
import hmac
import io
import json
import os
import re
import stat
import struct
import sys
import zipfile
from email import policy
from email.parser import BytesParser
from pathlib import Path, PurePosixPath


SCHEMA_VERSION = "tf.python-hostlist-derived-wheel-provenance/0.1"
EXPECTED_WHEEL_FILENAME = "python_hostlist-2.3.0-py3-none-any.whl"
EXPECTED_DIST_INFO = "python_hostlist-2.3.0.dist-info"
EXPECTED_DATA_DIRECTORY = "python_hostlist-2.3.0.data"
EXPECTED_NAME = "python_hostlist"
EXPECTED_NORMALIZED_NAME = "python-hostlist"
EXPECTED_VERSION = "2.3.0"
EXPECTED_TAG = "py3-none-any"
EXPECTED_SDIST = {
    "url": (
        "https://files.pythonhosted.org/packages/90/cc/"
        "bb6395c3f2b6bb739b1d3fc0e71f94e6a1c2e256df496237cbfd13cd74a6/"
        "python_hostlist-2.3.0.tar.gz"
    ),
    "filename": "python_hostlist-2.3.0.tar.gz",
    "sizeBytes": 37_326,
    "sha256": "sha256:e1a0b18e525a5fca573cb9862799f11b3f2bd3ba7aec70c4ecd8b95341bb71ea",
}

MAX_WHEEL_BYTES = 1_000_000
MAX_EXPANDED_BYTES = 2_000_000
MAX_MEMBER_BYTES = 1_000_000
MAX_ARCHIVE_MEMBERS = 32
MAX_PATH_BYTES = 512
MAX_METADATA_BYTES = 128_000
MAX_WHEEL_METADATA_BYTES = 16_000
MAX_RECORD_BYTES = 128_000
MAX_PROVENANCE_BYTES = 8_192

SHA256_RE = re.compile(r"sha256:[0-9a-f]{64}\Z")
SAFE_ARCHIVE_PATH_RE = re.compile(r"[A-Za-z0-9._/-]+\Z")
OCI_NAME_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/:+-]*\Z")

SCRIPT_NAMES = ("dbuck", "hostgrep", "hostlist", "pshbak")
REQUIRED_MEMBERS = {
    "hostlist.py",
    *(f"{EXPECTED_DATA_DIRECTORY}/scripts/{name}" for name in SCRIPT_NAMES),
    *(
        f"{EXPECTED_DATA_DIRECTORY}/data/share/man/man1/{name}.1"
        for name in SCRIPT_NAMES
    ),
    f"{EXPECTED_DIST_INFO}/METADATA",
    f"{EXPECTED_DIST_INFO}/WHEEL",
    f"{EXPECTED_DIST_INFO}/top_level.txt",
    f"{EXPECTED_DIST_INFO}/RECORD",
}
OPTIONAL_LICENSE_MEMBERS = {
    f"{EXPECTED_DIST_INFO}/COPYING",
    f"{EXPECTED_DIST_INFO}/LICENSE",
    f"{EXPECTED_DIST_INFO}/LICENSE.txt",
    f"{EXPECTED_DIST_INFO}/licenses/COPYING",
    f"{EXPECTED_DIST_INFO}/licenses/LICENSE",
    f"{EXPECTED_DIST_INFO}/licenses/LICENSE.txt",
    f"{EXPECTED_DIST_INFO}/license_files/COPYING",
}
ALLOWED_MEMBERS = REQUIRED_MEMBERS | OPTIONAL_LICENSE_MEMBERS

MEMBER_DIGEST_DOMAIN = b"tf.python-hostlist-wheel-members/v1\0"
INSTALL_PATH_DIGEST_DOMAIN = b"tf.python-hostlist-install-paths/v1\0"


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--wheel", required=True, type=Path)
    parser.add_argument("--sdist-url", required=True)
    parser.add_argument("--sdist-filename", required=True)
    parser.add_argument("--sdist-size", required=True, type=int)
    parser.add_argument("--sdist-sha256", required=True)
    parser.add_argument("--builder-image", required=True)
    parser.add_argument("--build-tool-lock-digest", required=True)
    parser.add_argument("--build-script-digest", required=True)
    parser.add_argument("--first-build-digest", required=True)
    parser.add_argument("--second-build-digest", required=True)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    source = validate_source_identity(
        args.sdist_url,
        args.sdist_filename,
        args.sdist_size,
        args.sdist_sha256,
    )
    builder_image = validate_builder_image(args.builder_image)
    build_tool_lock_digest = validate_digest(
        args.build_tool_lock_digest, "build-tool lock digest"
    )
    build_script_digest = validate_digest(
        args.build_script_digest, "build script digest"
    )
    first_digest = validate_digest(args.first_build_digest, "first build digest")
    second_digest = validate_digest(args.second_build_digest, "second build digest")
    if not hmac.compare_digest(first_digest, second_digest):
        raise ValueError("the two clean builds did not produce the same digest")

    wheel = inspect_derived_wheel(args.wheel)
    if not hmac.compare_digest(first_digest, str(wheel["sha256"])):
        raise ValueError("declared build digests do not match the actual wheel bytes")

    provenance = {
        "schemaVersion": SCHEMA_VERSION,
        "derivationId": "python-hostlist-2.3.0",
        "promotionEligible": False,
        "source": source,
        "builder": {
            "image": builder_image,
            "buildToolLockDigest": build_tool_lock_digest,
            "buildScriptDigest": build_script_digest,
        },
        "reproducibility": {
            "firstBuildDigest": first_digest,
            "secondBuildDigest": second_digest,
            "byteIdentical": True,
        },
        "wheel": wheel,
    }
    encoded = json.dumps(
        provenance, ensure_ascii=True, sort_keys=True, separators=(",", ":")
    ).encode("utf-8") + b"\n"
    if len(encoded) > MAX_PROVENANCE_BYTES:
        raise ValueError("derived-wheel provenance exceeds its output bound")
    sys.stdout.write(encoded.decode("ascii"))
    return 0


def validate_source_identity(
    url: str, filename: str, size_bytes: int, sha256: str
) -> dict[str, object]:
    if url != EXPECTED_SDIST["url"]:
        raise ValueError("sdist URL differs from the frozen official PyPI source")
    if filename != EXPECTED_SDIST["filename"]:
        raise ValueError("sdist filename differs from the frozen source")
    if isinstance(size_bytes, bool) or size_bytes != EXPECTED_SDIST["sizeBytes"]:
        raise ValueError("sdist size differs from the frozen source")
    digest = validate_digest(sha256, "sdist digest")
    if not hmac.compare_digest(digest, str(EXPECTED_SDIST["sha256"])):
        raise ValueError("sdist digest differs from the frozen source")
    return {
        "url": url,
        "filename": filename,
        "sizeBytes": size_bytes,
        "sha256": digest,
    }


def validate_digest(value: str, label: str) -> str:
    if not isinstance(value, str) or not SHA256_RE.fullmatch(value):
        raise ValueError(f"{label} must be one canonical lowercase SHA-256 digest")
    return value


def validate_builder_image(value: str) -> str:
    if not isinstance(value, str) or len(value) > 320 or value.count("@") != 1:
        raise ValueError("builder image must be one bounded immutable OCI reference")
    name, digest = value.rsplit("@", 1)
    if (
        not OCI_NAME_RE.fullmatch(name)
        or "://" in name
        or "//" in name
        or name.endswith(("/", ":"))
        or any(component in {"", ".", ".."} for component in name.split("/"))
        or not SHA256_RE.fullmatch(digest)
    ):
        raise ValueError("builder image must be one bounded immutable OCI reference")
    return value


def inspect_derived_wheel(path: Path) -> dict[str, object]:
    path = require_canonical_regular_file(path)
    if path.name != EXPECTED_WHEEL_FILENAME:
        raise ValueError(f"wheel filename must be exactly {EXPECTED_WHEEL_FILENAME}")

    before = path.lstat()
    if before.st_size < 1 or before.st_size > MAX_WHEEL_BYTES:
        raise ValueError("wheel byte length is outside the package-specific policy")
    flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
    descriptor = os.open(path, flags)
    with os.fdopen(descriptor, "rb") as handle:
        opened = os.fstat(handle.fileno())
        require_same_file(before, opened, "wheel changed while it was being opened")
        wheel_bytes = handle.read(MAX_WHEEL_BYTES + 1)
        if len(wheel_bytes) != opened.st_size or len(wheel_bytes) > MAX_WHEEL_BYTES:
            raise ValueError("wheel changed or exceeded its byte limit while reading")
        closed = os.fstat(handle.fileno())
        require_same_file(opened, closed, "wheel changed while it was being read")

    after = path.lstat()
    require_same_file(opened, after, "wheel path changed while it was being inspected")
    validate_zip_envelope(wheel_bytes)

    try:
        with zipfile.ZipFile(io.BytesIO(wheel_bytes), "r") as archive:
            if archive.comment:
                raise ValueError("wheel ZIP comments are forbidden")
            infos = archive.infolist()
            if not infos or len(infos) > MAX_ARCHIVE_MEMBERS:
                raise ValueError("wheel archive member count is outside policy")
            entries = read_validated_members(archive, infos)
    except (OSError, RuntimeError, zipfile.BadZipFile, zipfile.LargeZipFile) as error:
        raise ValueError("wheel is not a valid bounded ZIP archive") from error

    actual_members = set(entries)
    missing = sorted(REQUIRED_MEMBERS - actual_members)
    unexpected = sorted(actual_members - ALLOWED_MEMBERS)
    if missing:
        raise ValueError(f"wheel is missing required members: {missing}")
    if unexpected:
        raise ValueError(f"wheel contains unexpected members: {unexpected}")
    if entries[f"{EXPECTED_DIST_INFO}/top_level.txt"] != b"hostlist\n":
        raise ValueError("top_level.txt differs from the expected hostlist module")

    metadata = parse_metadata(entries[f"{EXPECTED_DIST_INFO}/METADATA"])
    parse_wheel_metadata(entries[f"{EXPECTED_DIST_INFO}/WHEEL"])
    validate_record(entries, entries[f"{EXPECTED_DIST_INFO}/RECORD"])

    member_records = [
        {
            "path": member_path,
            "sizeBytes": len(content),
            "sha256": digest_bytes(content),
        }
        for member_path, content in sorted(entries.items())
    ]
    installed_paths = sorted(install_destination(member_path) for member_path in entries)
    if len(installed_paths) != len(set(installed_paths)):
        raise ValueError("wheel contains an installation-path collision")
    validate_file_directory_collisions(installed_paths)

    return {
        "filename": EXPECTED_WHEEL_FILENAME,
        "name": metadata["name"],
        "normalizedName": EXPECTED_NORMALIZED_NAME,
        "version": metadata["version"],
        "tag": EXPECTED_TAG,
        "sizeBytes": len(wheel_bytes),
        "sha256": digest_bytes(wheel_bytes),
        "archiveMemberCount": len(entries),
        "expandedSizeBytes": sum(len(content) for content in entries.values()),
        "memberDigest": canonical_digest(MEMBER_DIGEST_DOMAIN, member_records),
        "installedPathDigest": canonical_digest(
            INSTALL_PATH_DIGEST_DOMAIN, installed_paths
        ),
    }


def require_canonical_regular_file(path: Path) -> Path:
    if not path.is_absolute():
        raise ValueError("wheel path must be absolute")
    try:
        resolved = path.resolve(strict=True)
        metadata = path.lstat()
    except OSError as error:
        raise ValueError("wheel path is unavailable") from error
    if resolved != path:
        raise ValueError("wheel path must be canonical and symlink-free")
    if not stat.S_ISREG(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode):
        raise ValueError("wheel must be a regular file, not a link or special file")
    if metadata.st_nlink != 1:
        raise ValueError("wheel must not be a hard link")
    return resolved


def file_identity(metadata: os.stat_result) -> tuple[int, int, int, int, int, int]:
    return (
        metadata.st_dev,
        metadata.st_ino,
        metadata.st_mode,
        metadata.st_nlink,
        metadata.st_size,
        metadata.st_mtime_ns,
    )


def require_same_file(
    expected: os.stat_result, actual: os.stat_result, message: str
) -> None:
    if file_identity(expected) != file_identity(actual):
        raise ValueError(message)


def validate_zip_envelope(content: bytes) -> None:
    if not content.startswith(b"PK\x03\x04"):
        raise ValueError("wheel contains a ZIP prefix or lacks a local header")
    eocd_offset = content.rfind(b"PK\x05\x06")
    if eocd_offset < 0 or eocd_offset + 22 != len(content):
        raise ValueError("wheel contains a ZIP comment, suffix, or malformed terminator")
    try:
        (
            signature,
            disk_number,
            central_disk,
            entries_on_disk,
            total_entries,
            central_size,
            central_offset,
            comment_size,
        ) = struct.unpack_from("<4s4H2LH", content, eocd_offset)
    except struct.error as error:
        raise ValueError("wheel contains a malformed ZIP terminator") from error
    if (
        signature != b"PK\x05\x06"
        or disk_number != 0
        or central_disk != 0
        or entries_on_disk != total_entries
        or entries_on_disk == 0xFFFF
        or total_entries == 0xFFFF
        or central_size == 0xFFFFFFFF
        or central_offset == 0xFFFFFFFF
        or total_entries < 1
        or total_entries > MAX_ARCHIVE_MEMBERS
        or comment_size != 0
        or central_offset + central_size != eocd_offset
    ):
        raise ValueError("wheel ZIP envelope is not one bounded single-disk archive")
    if (
        eocd_offset >= 20
        and content[eocd_offset - 20 : eocd_offset - 16] == b"PK\x06\x07"
    ):
        raise ValueError("ZIP64 wheels are outside the package-specific policy")


def read_validated_members(
    archive: zipfile.ZipFile, infos: list[zipfile.ZipInfo]
) -> dict[str, bytes]:
    entries: dict[str, bytes] = {}
    expanded = 0
    for info in infos:
        validate_member(info, entries)
        expanded += info.file_size
        if info.file_size > MAX_MEMBER_BYTES or expanded > MAX_EXPANDED_BYTES:
            raise ValueError("wheel expanded byte length exceeds policy")
        try:
            content = archive.read(info)
        except (OSError, RuntimeError, zipfile.BadZipFile) as error:
            raise ValueError(f"cannot safely read wheel member {info.filename!r}") from error
        if len(content) != info.file_size:
            raise ValueError(f"wheel member {info.filename!r} changed size while reading")
        entries[info.filename] = content
    return entries


def validate_member(info: zipfile.ZipInfo, entries: dict[str, bytes]) -> None:
    name = info.filename
    if (
        not name
        or len(name.encode("utf-8")) > MAX_PATH_BYTES
        or not SAFE_ARCHIVE_PATH_RE.fullmatch(name)
        or "\\" in name
        or "\x00" in name
        or name in entries
        or info.is_dir()
    ):
        raise ValueError("wheel contains a duplicate, directory, or unsafe archive path")
    parts = name.split("/")
    if any(part in {"", ".", ".."} for part in parts) or PurePosixPath(name).is_absolute():
        raise ValueError("wheel contains an unsafe archive path")
    basename = parts[-1].lower()
    if basename.endswith(".pth") or basename in {"sitecustomize.py", "usercustomize.py"}:
        raise ValueError("wheel startup-hook paths are forbidden")
    mode = (info.external_attr >> 16) & 0xFFFF
    file_type = stat.S_IFMT(mode)
    if file_type not in {0, stat.S_IFREG} or mode & (
        stat.S_ISUID | stat.S_ISGID | stat.S_ISVTX
    ):
        raise ValueError("wheel contains a link, special member, or privileged mode")
    if info.flag_bits & 0x1:
        raise ValueError("encrypted wheel members are forbidden")
    if info.compress_type not in {zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED}:
        raise ValueError("wheel uses an unsupported compression algorithm")
    if info.comment:
        raise ValueError("wheel member comments are forbidden")


def parse_metadata(content: bytes) -> dict[str, str]:
    if len(content) > MAX_METADATA_BYTES or b"\x00" in content:
        raise ValueError("METADATA is outside policy")
    message = BytesParser(policy=policy.default).parsebytes(content)
    if message.defects:
        raise ValueError("METADATA is malformed")
    names = message.get_all("Name", [])
    versions = message.get_all("Version", [])
    metadata_versions = message.get_all("Metadata-Version", [])
    if names != [EXPECTED_NAME] or versions != [EXPECTED_VERSION]:
        raise ValueError("METADATA Name or Version differs from python_hostlist 2.3.0")
    if len(metadata_versions) != 1 or not re.fullmatch(r"2(?:\.[0-9]+)+", metadata_versions[0]):
        raise ValueError("METADATA must declare one valid Metadata-Version")
    if message.get_all("Requires-Dist", []):
        raise ValueError("derived python-hostlist wheel must have no Requires-Dist")
    if message.get_all("Provides-Extra", []):
        raise ValueError("derived python-hostlist wheel must have no Provides-Extra")
    if message.get_all("Requires-Python", []):
        raise ValueError("derived python-hostlist wheel has unexpected Requires-Python")
    return {"name": names[0], "version": versions[0]}


def parse_wheel_metadata(content: bytes) -> None:
    if len(content) > MAX_WHEEL_METADATA_BYTES or b"\x00" in content:
        raise ValueError("WHEEL metadata is outside policy")
    message = BytesParser(policy=policy.default).parsebytes(content)
    if message.defects:
        raise ValueError("WHEEL metadata is malformed")
    if message.get_all("Wheel-Version", []) != ["1.0"]:
        raise ValueError("WHEEL must declare exactly Wheel-Version 1.0")
    roots = [value.lower() for value in message.get_all("Root-Is-Purelib", [])]
    if roots != ["true"]:
        raise ValueError("WHEEL must declare exactly Root-Is-Purelib true")
    if message.get_all("Tag", []) != [EXPECTED_TAG]:
        raise ValueError("WHEEL must declare exactly the py3-none-any tag")
    generators = message.get_all("Generator", [])
    if len(generators) > 1 or any(not value.strip() or len(value) > 256 for value in generators):
        raise ValueError("WHEEL contains invalid Generator metadata")


def validate_record(entries: dict[str, bytes], content: bytes) -> None:
    if len(content) > MAX_RECORD_BYTES or b"\x00" in content:
        raise ValueError("RECORD is outside policy")
    try:
        rows = list(csv.reader(io.StringIO(content.decode("utf-8"), newline="")))
    except (UnicodeDecodeError, csv.Error) as error:
        raise ValueError("RECORD is not valid UTF-8 CSV") from error
    record_path = f"{EXPECTED_DIST_INFO}/RECORD"
    recorded: set[str] = set()
    for row in rows:
        if len(row) != 3 or not row[0] or row[0] in recorded:
            raise ValueError("RECORD contains malformed or duplicate rows")
        member_path, encoded_hash, encoded_size = row
        validate_record_path(member_path)
        if member_path not in entries:
            raise ValueError("RECORD references a missing archive member")
        recorded.add(member_path)
        if member_path == record_path:
            if encoded_hash or encoded_size:
                raise ValueError("RECORD self-row must have empty hash and size")
            continue
        member = entries[member_path]
        if encoded_size != str(len(member)):
            raise ValueError("RECORD contains an incorrect member size")
        match = re.fullmatch(r"sha256=([A-Za-z0-9_-]{43})", encoded_hash)
        if not match:
            raise ValueError("RECORD contains a weak or malformed member hash")
        encoded = match.group(1)
        try:
            claimed = base64.b64decode(encoded + "=", altchars=b"-_", validate=True)
        except (TypeError, ValueError) as error:
            raise ValueError("RECORD member hash is not canonical base64url") from error
        canonical = base64.urlsafe_b64encode(claimed).rstrip(b"=").decode("ascii")
        if len(claimed) != hashlib.sha256().digest_size or not hmac.compare_digest(
            canonical, encoded
        ):
            raise ValueError("RECORD member hash is not canonical base64url")
        if not hmac.compare_digest(hashlib.sha256(member).digest(), claimed):
            raise ValueError("RECORD member hash does not match archive bytes")
    if recorded != set(entries):
        raise ValueError("RECORD does not enumerate every archive member")


def validate_record_path(value: str) -> None:
    if (
        not SAFE_ARCHIVE_PATH_RE.fullmatch(value)
        or len(value.encode("utf-8")) > MAX_PATH_BYTES
        or "\\" in value
        or "\x00" in value
        or PurePosixPath(value).is_absolute()
        or any(part in {"", ".", ".."} for part in value.split("/"))
    ):
        raise ValueError("RECORD contains an unsafe member path")


def install_destination(member_path: str) -> str:
    parts = member_path.split("/")
    if parts[0] == EXPECTED_DATA_DIRECTORY:
        if len(parts) < 3 or parts[1] not in {"scripts", "data"}:
            raise ValueError("wheel contains an unsupported .data installation scheme")
        return "/".join((parts[1], *parts[2:]))
    return f"site-packages/{member_path}"


def validate_file_directory_collisions(paths: list[str]) -> None:
    files = set(paths)
    for path in paths:
        parts = path.split("/")
        for index in range(1, len(parts)):
            if "/".join(parts[:index]) in files:
                raise ValueError("wheel contains a file/directory installation collision")


def digest_bytes(content: bytes) -> str:
    return "sha256:" + hashlib.sha256(content).hexdigest()


def canonical_digest(domain: bytes, value: object) -> str:
    encoded = json.dumps(
        value, ensure_ascii=True, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")
    return digest_bytes(domain + encoded)


if __name__ == "__main__":
    raise SystemExit(main())
