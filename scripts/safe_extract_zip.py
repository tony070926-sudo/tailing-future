#!/usr/bin/env python3
"""Extract one bounded GitHub artifact ZIP into an empty private directory."""

from __future__ import annotations

import argparse
import os
import stat
import sys
import zipfile
from pathlib import Path, PurePosixPath


MAX_ARCHIVE_BYTES = 10_000_000
MAX_EXPANDED_BYTES = 50_000_000
MAX_MEMBERS = 20_000


def parse_args(argv: list[str]) -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    return parser.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(sys.argv[1:] if argv is None else argv)
    archive_path = canonical_regular_file(args.archive)
    output = canonical_empty_directory(args.output)
    with zipfile.ZipFile(archive_path) as archive:
        members = archive.infolist()
        if len(members) < 1 or len(members) > MAX_MEMBERS:
            raise ValueError("artifact ZIP member count is outside policy")
        if sum(member.file_size for member in members) > MAX_EXPANDED_BYTES:
            raise ValueError("artifact ZIP expanded size exceeds policy")
        seen: set[str] = set()
        files: set[str] = set()
        directories: set[str] = set()
        for member in members:
            parts = validate_member(member, seen)
            relative = "/".join(parts)
            if member.is_dir():
                if relative in files:
                    raise ValueError("artifact ZIP has a file/directory collision")
                directories.add(relative)
                ensure_directories(output, parts)
                continue
            if relative in directories:
                raise ValueError("artifact ZIP has a file/directory collision")
            for index in range(1, len(parts)):
                ancestor = "/".join(parts[:index])
                if ancestor in files:
                    raise ValueError("artifact ZIP has a file/directory collision")
                directories.add(ancestor)
            ensure_directories(output, parts[:-1])
            destination = output.joinpath(*parts)
            descriptor = os.open(
                destination,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0),
                0o600,
            )
            expanded = 0
            try:
                with archive.open(member, "r") as source, os.fdopen(descriptor, "wb") as target:
                    descriptor = -1
                    for chunk in iter(lambda: source.read(1024 * 1024), b""):
                        expanded += len(chunk)
                        if expanded > member.file_size:
                            raise ValueError("artifact member expands past its declared size")
                        target.write(chunk)
                    target.flush()
                    os.fsync(target.fileno())
            finally:
                if descriptor >= 0:
                    os.close(descriptor)
            if expanded != member.file_size:
                raise ValueError("artifact member length differs from its ZIP metadata")
            files.add(relative)
    print(f"Safely extracted {len(files)} files")
    return 0


def canonical_regular_file(path: Path) -> Path:
    if not path.is_absolute() or path != Path(os.path.abspath(path)):
        raise ValueError("archive path must be a normalized absolute path")
    resolved = path.resolve(strict=True)
    metadata = path.lstat()
    if resolved != path or not stat.S_ISREG(metadata.st_mode) or metadata.st_nlink != 1:
        raise ValueError("archive must be a canonical, single-link regular file")
    if metadata.st_size < 1 or metadata.st_size > MAX_ARCHIVE_BYTES:
        raise ValueError("archive size is outside policy")
    return resolved


def canonical_empty_directory(path: Path) -> Path:
    if not path.is_absolute() or path != Path(os.path.abspath(path)):
        raise ValueError("output path must be a normalized absolute path")
    resolved = path.resolve(strict=True)
    metadata = path.lstat()
    if resolved != path or not stat.S_ISDIR(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode):
        raise ValueError("output must be a canonical real directory")
    if any(path.iterdir()):
        raise ValueError("output directory must be empty")
    return resolved


def validate_member(member: zipfile.ZipInfo, seen: set[str]) -> tuple[str, ...]:
    name = member.filename
    path = PurePosixPath(name)
    parts = path.parts
    if (not name or "\x00" in name or "\\" in name or name.startswith("/") or name in seen
            or path.is_absolute() or any(part in {"", ".", ".."} for part in parts)):
        raise ValueError("artifact ZIP contains a duplicate or unsafe path")
    seen.add(name)
    mode = (member.external_attr >> 16) & 0xFFFF
    file_type = stat.S_IFMT(mode)
    if file_type not in {0, stat.S_IFREG, stat.S_IFDIR} or (file_type == stat.S_IFDIR) != member.is_dir():
        raise ValueError("artifact ZIP contains a link or special member")
    if member.flag_bits & 0x1:
        raise ValueError("encrypted artifact members are forbidden")
    if member.file_size < 0 or member.compress_size < 0:
        raise ValueError("artifact member has an invalid size")
    return tuple(parts)


def ensure_directories(root: Path, parts: tuple[str, ...]) -> None:
    current = root
    for part in parts:
        current = current / part
        try:
            current.mkdir(mode=0o700)
        except FileExistsError:
            pass
        metadata = current.lstat()
        if not stat.S_ISDIR(metadata.st_mode) or stat.S_ISLNK(metadata.st_mode) or current.resolve(strict=True) != current:
            raise ValueError("artifact output path contains a link or non-directory")


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        print(f"safe artifact extraction failed: {error}", file=sys.stderr)
        raise SystemExit(1)
