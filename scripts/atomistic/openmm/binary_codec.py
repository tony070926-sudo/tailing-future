"""Canonical binary array codecs for the OpenMM producer.

The scientific payload is never encoded as JSON numbers.  Float values use
IEEE-754 binary64 little-endian bytes and integer indices use uint32
little-endian bytes.  Negative zero is canonicalized to positive zero, while
NaN and infinities are rejected.
"""

from __future__ import annotations

import math
import hashlib
import os
import struct
import tempfile
from pathlib import Path
from typing import Iterator, Sequence

from contract import ContractViolation, canonical_directory, validate_relative_artifact_path


def flatten(values: object) -> Iterator[float | int]:
    if isinstance(values, (str, bytes, bytearray, memoryview)):
        raise ContractViolation("binary array values cannot contain byte or string containers")
    if isinstance(values, Sequence):
        for value in values:
            yield from flatten(value)
        return
    if hasattr(values, "tolist"):
        yield from flatten(values.tolist())
        return
    yield values  # type: ignore[misc]


def encode_f64le(values: object) -> bytes:
    payload = bytearray()
    for index, raw in enumerate(flatten(values)):
        if isinstance(raw, bool) or not isinstance(raw, (int, float)):
            raise ContractViolation(f"float array component {index} is not numeric")
        value = float(raw)
        if not math.isfinite(value):
            raise ContractViolation(f"float array component {index} is not finite")
        if value == 0.0:
            value = 0.0
        payload.extend(struct.pack("<d", value))
    return bytes(payload)


def decode_f64le(data: bytes) -> tuple[float, ...]:
    if len(data) % 8 != 0:
        raise ContractViolation("float64 byte length is not divisible by eight")
    return tuple(value[0] for value in struct.iter_unpack("<d", data))


def encode_u32le(values: object) -> bytes:
    payload = bytearray()
    for index, raw in enumerate(flatten(values)):
        if isinstance(raw, bool) or not isinstance(raw, int) or not 0 <= raw <= 0xFFFFFFFF:
            raise ContractViolation(f"uint32 array component {index} is outside the closed domain")
        payload.extend(struct.pack("<I", raw))
    return bytes(payload)


def decode_u32le(data: bytes) -> tuple[int, ...]:
    if len(data) % 4 != 0:
        raise ContractViolation("uint32 byte length is not divisible by four")
    return tuple(value[0] for value in struct.iter_unpack("<I", data))


class AtomicArrayWriter:
    """Stream exactly one shaped binary array into an atomic read-only file."""

    def __init__(
        self,
        *,
        output_root: Path,
        artifact_id: str,
        relative_path: str,
        dtype: str,
        shape: Sequence[int],
        unit: str,
    ) -> None:
        validate_relative_artifact_path(relative_path)
        if dtype not in ("float64-le", "uint32-le"):
            raise ContractViolation("unsupported streaming array dtype")
        if not shape or any(isinstance(value, bool) or not isinstance(value, int) or value < 1 for value in shape):
            raise ContractViolation("streaming array shape must contain positive integers")
        self._root = canonical_directory(output_root, "array output root", create=True)
        self._path = self._root / relative_path
        self._parent = canonical_directory(self._path.parent, "array artifact parent", create=True)
        descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{self._path.name}.", suffix=".tmp", dir=self._parent
        )
        os.fchmod(descriptor, 0o600)
        self._temporary = Path(temporary_name)
        self._handle = os.fdopen(descriptor, "wb", closefd=True)
        self._artifact_id = artifact_id
        self._relative_path = relative_path
        self._dtype = dtype
        self._shape = tuple(shape)
        self._unit = unit
        self._component_count = 0
        self._byte_count = 0
        self._digest = hashlib.sha256()
        self._closed = False

    def write(self, values: object) -> None:
        if self._closed:
            raise ContractViolation("cannot append to a closed array writer")
        encoded = encode_f64le(values) if self._dtype == "float64-le" else encode_u32le(values)
        component_bytes = 8 if self._dtype == "float64-le" else 4
        components = len(encoded) // component_bytes
        expected = math.prod(self._shape)
        if self._component_count + components > expected:
            raise ContractViolation("streaming array exceeds its declared shape")
        self._handle.write(encoded)
        self._digest.update(encoded)
        self._component_count += components
        self._byte_count += len(encoded)

    def finish(self) -> dict[str, object]:
        if self._closed:
            raise ContractViolation("array writer was already closed")
        expected = math.prod(self._shape)
        if self._component_count != expected:
            self.abort()
            raise ContractViolation(
                f"streaming array has {self._component_count} components; expected {expected}"
            )
        self._handle.flush()
        os.fsync(self._handle.fileno())
        self._handle.close()
        os.chmod(self._temporary, 0o444)
        os.replace(self._temporary, self._path)
        directory_descriptor = os.open(
            self._parent, os.O_RDONLY | getattr(os, "O_DIRECTORY", 0)
        )
        try:
            os.fsync(directory_descriptor)
        finally:
            os.close(directory_descriptor)
        self._closed = True
        return {
            "id": self._artifact_id,
            "path": self._relative_path,
            "kind": "array",
            "dtype": self._dtype,
            "shape": list(self._shape),
            "unit": self._unit,
            "sizeBytes": self._byte_count,
            "sha256": "sha256:" + self._digest.hexdigest(),
        }

    def abort(self) -> None:
        if self._closed:
            return
        try:
            self._handle.close()
        finally:
            if self._temporary.exists():
                self._temporary.unlink()
            self._closed = True

    def __enter__(self) -> "AtomicArrayWriter":
        return self

    def __exit__(self, exc_type: object, exc: object, traceback: object) -> None:
        if exc_type is not None:
            self.abort()
        elif not self._closed:
            self.abort()
