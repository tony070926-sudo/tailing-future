# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

# No default is intentional: callers must supply a Python 3.12 Linux/x86_64
# image by the immutable digest frozen in the v0.2 reproduction plan.
ARG BASE_IMAGE

FROM ${BASE_IMAGE} AS builder
ENV PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_INDEX=1 \
    PIP_ROOT_USER_ACTION=ignore
COPY --from=wheelhouse / /wheelhouse/
COPY atomistic/locks/mace.requirements.lock /build/requirements.lock
RUN --network=none model_wheel=/wheelhouse/mace_torch-0.3.16-py3-none-any.whl && \
    test "$(stat -c %s "$model_wheel")" = "316021" && \
    echo "b80407edf6b2a1ec8523668c2a36852d20927ce1c3c56b70983a9f2dc53233ad  $model_wheel" | sha256sum -c - && \
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
COPY --from=wheelhouse --chmod=0444 /mace_torch-0.3.16-py3-none-any.whl /opt/tailing/provenance/
COPY --chmod=0444 atomistic/locks/mace.requirements.lock /opt/tailing/requirements.lock
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
