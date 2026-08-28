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
