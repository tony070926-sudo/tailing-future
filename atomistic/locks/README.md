# Atomistic dependency-lock bootstrap

No production lock is committed yet. This is intentional: the two package
wheels are frozen, but their upstream metadata leaves most transitive
dependencies open, and no Python 3.12/Linux x86_64 cold-install plus inference
run has yet established a truthful resolved set.

The environments must remain separate:

- `mattersim==1.2.5` requires `e3nn>=0.5.0`, `numpy>=2.0.0`,
  `torch>=2.2.0`, and `torch-geometric>=2.5.3`;
- `mace-torch==0.3.16` requires `e3nn==0.4.4` and `torch>=1.12`.

The `*.bootstrap.in` files are reviewable resolution inputs, not hash locks.
Their CPU-only PyTorch 2.8.0+cpu/ASE 3.28.0 choices are candidate constraints and must not be
reported as reproduced until the following sequence passes for each model:

1. Resolve inside an immutable Python 3.12.13/Linux x86_64 base image using the
   official CPU PyTorch wheel index and the already verified local model wheel.
2. Download every transitive wheel to a model-specific staging wheelhouse.
3. Reject sdists, editable installs, VCS URLs, mutable direct URLs, duplicate
   project names, and wheels incompatible with cp312/Linux x86_64.
4. Generate `mattersim.requirements.lock` or `mace.requirements.lock` with an
   exact `==` version and SHA-256 hash for every distribution.
5. Recreate an empty venv with `--no-index --require-hashes
   --only-binary=:all: --no-compile` and run `pip check`.
6. Build the model-specific container with a digest-pinned base image and the
   reviewed wheelhouse, then run the exact frozen 10-ID smoke test under
   `--network=none`.
7. Review the predictions, environment manifest, network proof, lock digest,
   container digest, and diagnostics behavior before committing the lock.

Only after that review may a production `*.requirements.lock` be added. The
Dockerfiles deliberately reference the currently absent production locks so an
unlocked image build fails instead of silently resolving newer dependencies.

## Compatibility roots and startup-hook removal

The current MatterSim metadata closure reaches both the new `pymatgen` meta
wheel and `pymatgen-core`; their generated `scripts/pmg` paths overlap. The
resolver continues to reject every overlapping install path. Instead, the
bootstrap fixes `pymatgen==2025.4.17` and
`pymatgen-io-validation==0.1.2`, a reviewed Python 3.12 all-wheel combination
whose dependency constraints remain satisfied and which does not introduce
`pymatgen-core`. These are bootstrap compatibility roots, not a claim that a
newer upstream release is invalid for other environments. The resolver also
rejects every pre-release or development wheel in the resulting closure.

`torch==2.8.0+cpu` declares setuptools at runtime. Both environments therefore
fix `setuptools==84.0.0`. The offline resolver accepts its executable
`distutils-precedence.pth` only when the complete official wheel identity,
size, SHA-256, hook path, size and SHA-256 all match the reviewed constants. It
records the hook in both raw-wheel and planned-runtime inventories. The cold
install and both image builds verify the installed file again, remove it before
the next venv Python process, assert that no startup hook remains, and only then
run `pip check`. All other `.pth` paths and all importable `sitecustomize` or
`usercustomize` module/package forms fail closed.

The freeze and build stages also run the independently hash-bound
`verify_runtime_inventory.py`. It reconstructs install paths directly from the
wheel ZIP members and entry points, rechecks collisions, verifies the declared
removal bytes and ownership, and recomputes both raw and runtime inventories.

## Source-only bootstrap exception

MACE 0.3.16 declares `python-hostlist` as a runtime dependency, while the
[python-hostlist 2.3.0 PyPI release](https://pypi.org/project/python-hostlist/)
publishes no wheel. The bootstrap therefore has one narrowly scoped exception
to the wheel-only download rule:

- `python-hostlist==2.3.0` is an explicit bootstrap root rather than an
  unconstrained transitive selection;
- the exact official sdist, `setuptools==80.9.0`, and `wheel==0.45.1` bytes are
  downloaded from immutable file URLs and checked against frozen sizes and
  SHA-256 digests without executing the sdist;
- two fresh Linux/amd64 builders receive only those read-only inputs, have no
  network or checkout/runtime-wheelhouse access, and must emit byte-identical
  `python_hostlist-2.3.0-py3-none-any.whl` files;
- a dedicated verifier rejects unexpected metadata, payload, RECORD, archive,
  path, startup-hook and resource-boundary behavior, then emits bounded
  deterministic provenance;
- the offline resolver must bind that provenance to the exact derived wheel in
  the final wheelhouse manifest. The sdist and build tools never enter the
  runtime wheelhouse.

This exception is bootstrap evidence only. Its provenance always records
`promotionEligible: false`, and the enclosing run remains
`bootstrap-not-reproduced`. A first-run output digest must not become a
production trust root in the same run. Before any production lock or binary
redistribution, an independent review must freeze the accepted wheel digest and
member inventory (or replace it with an upstream wheel/MACE dependency fix) and
confirm the package's GPL-2.0-or-later redistribution obligations.

## Failure evidence

After checkout and pinned tool setup, an always-running step attempts to stage
`manifests/bootstrap-outcome.json`, including when any of the twelve reviewed
shell stages fails. It records the fixed stage sequence, the first failure
stage, whether inference succeeded, whether predictions exist, and the exact
allowlisted files that were published. It cannot promote evidence: its only
evidence class is `bootstrap-not-reproduced`. If checkout, the action runtime,
or the outcome writer itself cannot run safely, upload is skipped instead of
fabricating an artifact.
