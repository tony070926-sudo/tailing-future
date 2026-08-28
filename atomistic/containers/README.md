# Atomistic inference containers

The checkpoint is an untrusted pickle boundary. Raw `random-TP.xyz` contains
energy, force, and stress labels and must never be mounted into either model
container. A trusted standard-library preprocessor validates the frozen raw
bytes, ID set, and scientific manifests outside that boundary, then emits the
fixed structure-only bundle:

```sh
python3 scripts/atomistic/prepare_structures.py \
  --dataset /absolute/private-cache/atomistic/random-TP.xyz \
  --output /absolute/private-prepared-structures \
  --plan /absolute/repo/evaluation/atomistic/reproduction-plan.json
```

The raw file remains available only to this preprocessor and the independent
verifier. The model receives `structures.jsonl`, `structures.manifest.json`, a
checkpoint, and the plan. Its prediction process cannot compute metrics or
read reference labels.

## Dependency bootstrap and build

The Dockerfiles intentionally fail until a reviewed
`*.requirements.lock` exists. The bootstrap inputs are not locks. Each model
requires a separate cp312/Linux x86_64 wheelhouse, a single SHA-256 per wheel,
a cold `--no-index --require-hashes --only-binary=:all:` install, and `pip
check`. The base image and Dockerfile frontend are digest-pinned.

The exact setuptools 84.0.0 wheel contains one reviewed executable
`distutils-precedence.pth`. The resolver binds its bytes and declares it as the
only planned removal. Each Dockerfile rechecks the installed hook, deletes it
before starting the next venv interpreter, rejects any remaining `.pth` or
importable site/user customization module or package, and then runs isolated
`pip check`. This is not a general startup-hook exception.

```sh
docker buildx build \
  --platform=linux/amd64 \
  --network=none \
  --build-arg BASE_IMAGE="python:3.12.13-slim-bookworm@sha256:4766d8b510c428e595d74b9cc5bbb2fae8e26316fffb4adc89908d79aacd58a2" \
  --build-context wheelhouse=/absolute/reviewed/wheelhouse/mattersim \
  --file atomistic/containers/mattersim.Dockerfile \
  --tag tailing-mattersim:candidate \
  .
```

## Read-only staging and inference

The private artifact cache is deliberately `0700/0400` and cannot be mounted
directly for UID 65532. Create a new, model-specific staging directory; copy
only the label-free structures, plan, and selected checkpoint; then reverify
the copied bytes. The raw dataset is absent. Create the output directory with
ownership that lets UID 65532 write while keeping other host users out.

```sh
sudo install -d -o root -g root -m 0555 /absolute/mattersim-input
sudo install -o root -g root -m 0444 \
  /absolute/private-prepared-structures/structures.jsonl \
  /absolute/mattersim-input/structures.jsonl
sudo install -o root -g root -m 0444 \
  /absolute/private-prepared-structures/structures.manifest.json \
  /absolute/mattersim-input/structures.manifest.json
sudo install -o root -g root -m 0444 \
  /absolute/private-cache/atomistic/mattersim-v1.0.0-5M.pth \
  /absolute/mattersim-input/mattersim-v1.0.0-5M.pth
sudo install -o root -g root -m 0444 \
  /absolute/repo/evaluation/atomistic/reproduction-plan.json \
  /absolute/mattersim-input/reproduction-plan.json
sudo install -d -o 65532 -g 65532 -m 0700 /absolute/mattersim-output

sha256sum /absolute/mattersim-input/structures.jsonl
# d4ff1ee210abf80884e1526b1e2600e918103f3505a2a712bce57d6fba3a1b5c
sha256sum /absolute/mattersim-input/structures.manifest.json
# 9f870f62cd60b7021d874d1970c81ac8cb64a302e2c5fd4013464198fd11a25e
sha256sum /absolute/mattersim-input/mattersim-v1.0.0-5M.pth
# e3df9fa708725e3d453140646c7d1838324b347a3d1214cf1440522146f872b5
```

Resolve and record the image digest with an out-of-process host inspection.
`TAILING_ATOMISTIC_CONTAINER_DIGEST` is only a binding value supplied to the
runner, not proof of the image identity; the independent verifier must compare
it with the host/container-registry inspection. Run that immutable image with
networking and privilege paths removed:

```sh
docker run --rm \
  --network=none \
  --ipc=none \
  --read-only \
  --user 65532:65532 \
  --cap-drop=ALL \
  --security-opt=no-new-privileges=true \
  --pids-limit=256 \
  --cpus=4 \
  --memory=14g \
  --memory-swap=14g \
  --ulimit nofile=1024:1024 \
  --ulimit core=0:0 \
  --tmpfs /tmp:rw,nosuid,nodev,noexec,size=2g,mode=1777 \
  --env TAILING_ATOMISTIC_CONTAINER_DIGEST="sha256:<image-digest>" \
  --volume /absolute/mattersim-input:/input:ro \
  --volume /absolute/mattersim-output:/out:rw \
  "tailing-mattersim@sha256:<image-digest>" \
  --model mattersim \
  --mode smoke \
  --package /opt/tailing/provenance/mattersim-1.2.5-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl \
  --checkpoint /input/mattersim-v1.0.0-5M.pth \
  --structures /input/structures.jsonl \
  --structure-manifest /input/structures.manifest.json \
  --output /out \
  --plan /input/reproduction-plan.json
```

Use an equivalent separate staging/output pair for MACE. After execution, a
trusted host process must verify file hashes and copy the `0600` outputs into
the evidence store; do not loosen the live output directory. Until real hash
locks, an immutable model image digest, the fixed seccomp profile, and actual
smoke inference have all been reviewed, these are prediction-only bootstrap
artifacts and not reproduced results.
