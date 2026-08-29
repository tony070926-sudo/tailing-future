# Atomistic dependency-lock bootstrap

No production lock is committed yet. This is intentional: the two package
wheels are frozen, but their upstream metadata leaves most transitive
dependencies open. Protected-main run `33226521340` established truthful
Python 3.12/Linux x86_64 resolved sets and ten-record smoke inference for both
models, but the runtime-input identities have not yet been independently
replicated and frozen. Later R6b execution success does not change that state:
all four fresh summaries contain a contradictory nested
`promotionEligible: true`, so the accepted-replica count remains **0 / 2**.

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
   canonical runtime-input manifest, run-specific config/exporter observations
   and diagnostics behavior before committing the lock. A Docker local-load
   config-ID alias must never be relabeled as an OCI manifest digest.

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
run `pip check`. All other direct `site-packages/*.pth` paths and all top-level
importable `sitecustomize` or `usercustomize` module/package forms fail closed;
nested `.pth` model/data payloads remain ordinary RECORD-hashed files.

The wheel `data` installation scheme is prefix-relative, so an unrestricted
`.data/data` member could otherwise alias venv configuration, executables, or
site packages. The resolver and independent verifier allow only the exact
reviewed FontTools, Plotly, SymPy and `python-hostlist` wheel identities with
their complete known `share/man` or `share/jupyter` member sets. They also
reject wheel files or generated entry points that collide with the venv's
Python, pip or activation scripts and seeded pip package roots.

The freeze and build stages also run the independently hash-bound
`verify_runtime_inventory.py`. It reconstructs install paths directly from the
wheel ZIP members and entry points, independently reclassifies direct startup
hooks, rechecks collisions, verifies the declared removal bytes and ownership,
and recomputes both raw and runtime inventories.

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
`bootstrap-not-reproduced`. Run `33226521340` produced the same reviewed derived
wheel bytes in two clean builders, but a first successful workflow remains only
one run observation. Before any production lock or binary redistribution, two
independent protected-main replicas must agree on the canonical runtime-input
manifest; review must freeze the accepted wheel digest and member inventory (or
replace it with an upstream wheel/MACE dependency fix) and confirm the
package's GPL-2.0-or-later redistribution obligations.

## Failure evidence

After checkout and pinned tool setup, an always-running step attempts to stage
`manifests/bootstrap-outcome.json`, including when any of the twelve reviewed
shell stages fails. It records the fixed stage sequence, the first failure
stage, whether inference succeeded, whether predictions exist, and the exact
allowlisted files that were published. Successful resolve/build stages also
require a model-specific runtime-input manifest and container observation; the
former is the stable, non-self-referential identity candidate, while the latter
remains run-scoped. Raw Buildx metadata, Docker inspect output and Buildx/Docker
version lines are staged with the observation so its diagnostic digests can be
independently recomputed. The outcome cannot promote evidence: its only evidence
class is `bootstrap-not-reproduced`. If checkout, the action runtime, or the
outcome writer itself cannot run safely, upload is skipped instead of
fabricating an artifact.

Protected-main discovery runs `33229898921` and `33229901480` exercised this
failure path. Both stable runtime-input manifests and dependency locks agreed,
but all four jobs failed after image export because the original observer
required `containerimage.descriptor` while Docker `--load` emitted
`image.name` and a config-ID-alias exporter digest. They contributed no
accepted replica. The detailed negative-evidence review is
`evaluation/reviews/2026-08-29-r6a-runtime-discovery-failure-review.md`.

Protected-main R6b runs `33231316217` and `33231323492` then completed both
model jobs and ten-record inference, but each `run-summary.json` equated a
complete environment identity with `promotionEligible: true`. That nested
positive claim conflicts with the same bundle's
`bootstrap-not-reproduced` outcome and container claims. The runs are retained
as negative protocol evidence and cannot be rewritten or counted later; the
accepted-replica count is still **0 / 2**. Exact jobs, artifacts and archive
digests are recorded in
`evaluation/reviews/2026-08-29-r6b-successful-execution-claim-conflict-review.md`.

The non-circular repair order is strict. This Commit-P candidate actively
quarantines the legacy R5 dispatch path and prepositions a versioned v2 runner
without changing the R5 source anchor; v2 is not selected or executed here.
After P passes protected-main Sentinel and has an immutable merged SHA, Commit S
may switch the discovery lock and workflow to P; entirely fresh runs must then
be authenticated by a separately controlled verifier that rejects any positive
nested promotion claim. Only a later Commit F may freeze accepted identities. A
publication postprocessor may reject contradictory output but must never
sanitize it into acceptable evidence.
