# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

# The child manifest is the locked linux/amd64 member of the separately pinned
# python:3.12.11-slim-bookworm index.  It is deliberately not a build argument.
FROM --platform=linux/amd64 python:3.12.11-slim-bookworm@sha256:c00fc7b44d844b6da22861ec24af43968a5200eac4ec607b4725d585165d6b49 AS builder

ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_INDEX=1 \
    PIP_ROOT_USER_ACTION=ignore \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONNOUSERSITE=1

COPY --from=wheelhouse / /wheelhouse/
COPY --chmod=0444 atomistic/locks/openmm-water.requirements.lock /build/requirements.lock

RUN --network=none set -eu; \
    test "$(find /wheelhouse -mindepth 1 -maxdepth 1 -type f -links 1 -printf x)" = xx; \
    test "$(find /wheelhouse -mindepth 1 -maxdepth 1 ! -type f -print -quit)" = ""; \
    openmm_wheel=/wheelhouse/openmm-8.6.0-cp312-cp312-manylinux_2_34_x86_64.whl; \
    numpy_wheel=/wheelhouse/numpy-2.2.6-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl; \
    test "$(stat -c %s "$openmm_wheel")" = 14428011; \
    test "$(stat -c %s "$numpy_wheel")" = 16527618; \
    echo "e7acafe671fe40c502623886b15a97bcc948a83a4a995da0336b7ee3ab4b0221  $openmm_wheel" | sha256sum -c -; \
    echo "fd83c01228a688733f1ded5201c678f0c53ecc1006ffbc404db9f7a899ac6249  $numpy_wheel" | sha256sum -c -; \
    python -m venv /opt/tailing-venv; \
    /opt/tailing-venv/bin/python -m pip install \
      --no-index \
      --require-hashes \
      --find-links=/wheelhouse \
      --only-binary=:all: \
      --no-compile \
      -r /build/requirements.lock; \
    test -z "$(find /opt/tailing-venv/lib/python3.12/site-packages -mindepth 1 -maxdepth 1 \
      \( -iname '*.pth' -o -iname sitecustomize -o -iname 'sitecustomize.*' \
      -o -iname usercustomize -o -iname 'usercustomize.*' \) -print -quit)"; \
    /opt/tailing-venv/bin/python -I -B -m pip check; \
    /opt/tailing-venv/bin/python -I -B -c \
      'import importlib.metadata as m; import numpy, openmm; from openmm import version; assert m.version("openmm")=="8.6.0"; assert numpy.__version__=="2.2.6"; assert version.full_version=="8.6.0.dev-c6173db"; assert version.git_revision=="c6173db6e8edd705eb59172bd21e9ce69c572405"; assert version.release is False; assert {"Reference","CPU"}.issubset({openmm.Platform.getPlatform(i).getName() for i in range(openmm.Platform.getNumPlatforms())}); assert openmm.Platform.getPluginLoadFailures()==[]'

FROM --platform=linux/amd64 python:3.12.11-slim-bookworm@sha256:c00fc7b44d844b6da22861ec24af43968a5200eac4ec607b4725d585165d6b49 AS runtime

RUN --network=none set -eu; \
    groupadd --gid 65532 tailing; \
    useradd --uid 65532 --gid 65532 --no-create-home --home-dir /tmp/tailing-home tailing; \
    mkdir -p /opt/tailing/provenance /work /tmp/tailing-home; \
    chown 65532:65532 /work /tmp/tailing-home

COPY --from=builder /opt/tailing-venv /opt/tailing-venv
COPY --from=wheelhouse --chmod=0444 /openmm-8.6.0-cp312-cp312-manylinux_2_34_x86_64.whl /opt/tailing/provenance/
COPY --from=wheelhouse --chmod=0444 /numpy-2.2.6-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl /opt/tailing/provenance/
COPY --chmod=0444 atomistic/locks/openmm-water.requirements.lock /opt/tailing/requirements.lock
COPY --chmod=0444 scripts/atomistic/openmm/contract.py /opt/tailing-venv/lib/python3.12/site-packages/
COPY --chmod=0444 scripts/atomistic/openmm/binary_codec.py /opt/tailing-venv/lib/python3.12/site-packages/
COPY --chmod=0444 scripts/atomistic/openmm/engine.py /opt/tailing-venv/lib/python3.12/site-packages/
COPY --chmod=0444 scripts/atomistic/openmm/worker.py /opt/tailing-venv/lib/python3.12/site-packages/
COPY --chmod=0444 scripts/atomistic/openmm/diagnostics.py /opt/tailing-venv/lib/python3.12/site-packages/
COPY --chmod=0444 scripts/atomistic/openmm/outcome.py /opt/tailing-venv/lib/python3.12/site-packages/
COPY --chmod=0444 scripts/atomistic/openmm/producer.py /opt/tailing-venv/lib/python3.12/site-packages/

RUN --network=none set -eu; \
    test -z "$(find /opt/tailing-venv/lib/python3.12/site-packages -mindepth 1 -maxdepth 1 \
      \( -iname '*.pth' -o -iname sitecustomize -o -iname 'sitecustomize.*' \
      -o -iname usercustomize -o -iname 'usercustomize.*' \) -print -quit)"; \
    /opt/tailing-venv/bin/python -I -B -m pip check; \
    /opt/tailing-venv/bin/python -I -B -c \
      'from pathlib import Path; names=("contract.py","binary_codec.py","engine.py","worker.py","diagnostics.py","outcome.py","producer.py"); root=Path("/opt/tailing-venv/lib/python3.12/site-packages"); [compile((root/name).read_text(encoding="utf-8"), str(root/name), "exec") for name in names]'

ENV PATH=/opt/tailing-venv/bin \
    HOME=/tmp/tailing-home \
    TAILING_OPENMM_LOCK_PATH=/opt/tailing/requirements.lock \
    PIP_NO_INDEX=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONNOUSERSITE=1 \
    PYTHONHASHSEED=0 \
    TZ=UTC \
    LC_ALL=C.UTF-8 \
    OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    NUMEXPR_NUM_THREADS=1

USER 65532:65532
WORKDIR /work
# Isolated mode (-I) is intentionally not used for execution: it ignores
# PYTHONHASHSEED.  env removes import-path injection before Python starts; -P
# removes the cwd from sys.path and -s disables the user site.
ENTRYPOINT ["/usr/bin/env", "-u", "PYTHONPATH", "-u", "PYTHONHOME", "-u", "PYTHONSTARTUP", "-u", "PYTHONUSERBASE", "/opt/tailing-venv/bin/python", "-P", "-s", "-B", "-m", "producer"]
