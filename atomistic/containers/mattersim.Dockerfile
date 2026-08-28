# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

# No default is intentional: callers must supply a Python 3.12 Linux/x86_64
# image by immutable sha256 digest, for example
# --build-arg BASE_IMAGE=python:3.12.13-slim-bookworm@sha256:4766d8b510c428e595d74b9cc5bbb2fae8e26316fffb4adc89908d79aacd58a2.
ARG BASE_IMAGE

FROM ${BASE_IMAGE} AS builder
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_INDEX=1 \
    PIP_ROOT_USER_ACTION=ignore
COPY --from=wheelhouse / /wheelhouse/
COPY atomistic/locks/mattersim.requirements.lock /build/requirements.lock
RUN --network=none model_wheel=/wheelhouse/mattersim-1.2.5-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl && \
    test "$(stat -c %s "$model_wheel")" = "755919" && \
    echo "1b5e46ba56efa5c1e93372ad32321300fa5e1f07dd9188a11b727bd578cf8d7f  $model_wheel" | sha256sum -c - && \
    python -m venv /opt/tailing-venv && \
    /opt/tailing-venv/bin/python -m pip install \
      --no-index \
      --require-hashes \
      --find-links=/wheelhouse \
      --only-binary=:all: \
      --no-compile \
      -r /build/requirements.lock && \
    /opt/tailing-venv/bin/python -m pip check

FROM ${BASE_IMAGE} AS runtime
RUN --network=none groupadd --gid 65532 tailing && \
    useradd --uid 65532 --gid 65532 --no-create-home --home-dir /tmp/tailing-home tailing && \
    mkdir -p /opt/tailing/provenance /work && \
    chown 65532:65532 /work
COPY --from=builder /opt/tailing-venv /opt/tailing-venv
COPY --from=wheelhouse --chmod=0444 /mattersim-1.2.5-cp312-cp312-manylinux_2_17_x86_64.manylinux2014_x86_64.whl /opt/tailing/provenance/
COPY --chmod=0444 atomistic/locks/mattersim.requirements.lock /opt/tailing/requirements.lock
COPY --chmod=0444 scripts/atomistic/run_model.py scripts/atomistic/runtime_contract.py /opt/tailing-venv/lib/python3.12/site-packages/
ENV PATH=/opt/tailing-venv/bin \
    HOME=/tmp/tailing-home \
    TAILING_ATOMISTIC_LOCK_PATH=/opt/tailing/requirements.lock \
    PIP_NO_INDEX=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONNOUSERSITE=1 \
    PYTHONHASHSEED=0 \
    OMP_NUM_THREADS=1 \
    MKL_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    NUMEXPR_NUM_THREADS=1 \
    VECLIB_MAXIMUM_THREADS=1 \
    BLIS_NUM_THREADS=1 \
    CUDA_VISIBLE_DEVICES="" \
    PYTORCH_ENABLE_MPS_FALLBACK=0
USER 65532:65532
WORKDIR /work
ENTRYPOINT ["/opt/tailing-venv/bin/python", "-I", "-m", "run_model"]
