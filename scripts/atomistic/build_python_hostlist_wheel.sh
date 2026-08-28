#!/bin/sh
set -eu

umask 077
export LC_ALL=C
export PIP_DISABLE_PIP_VERSION_CHECK=1
export PIP_NO_CACHE_DIR=1
export PIP_NO_INDEX=1
export PIP_NO_INPUT=1
export PYTHONHASHSEED=0
export SOURCE_DATE_EPOCH=1756467619
export TZ=UTC

source_path=/inputs/source/python_hostlist-2.3.0.tar.gz
tool_lock=/inputs/build-tools.requirements.lock
tool_dir=/inputs/tools
output_dir=/output
venv_dir=/tmp/build-venv

test "$(id -u)" -ne 0
test -f "$source_path"
test ! -L "$source_path"
test -f "$tool_lock"
test ! -L "$tool_lock"
test -d "$tool_dir"
test ! -L "$tool_dir"
test -d "$output_dir"
test ! -L "$output_dir"
test -z "$(find "$output_dir" -mindepth 1 -maxdepth 1 -print -quit)"

python -m venv "$venv_dir"
"$venv_dir/bin/python" -m pip install \
  --no-cache-dir \
  --no-compile \
  --no-index \
  --require-hashes \
  --only-binary=:all: \
  --find-links="$tool_dir" \
  --requirement "$tool_lock"
"$venv_dir/bin/python" -m pip wheel \
  --no-cache-dir \
  --no-deps \
  --no-index \
  --no-build-isolation \
  --wheel-dir "$output_dir" \
  "$source_path"

wheel_path="$output_dir/python_hostlist-2.3.0-py3-none-any.whl"
test -f "$wheel_path"
test ! -L "$wheel_path"
test -z "$(find "$output_dir" -mindepth 1 -maxdepth 1 ! -name 'python_hostlist-2.3.0-py3-none-any.whl' -print -quit)"
chmod 0444 "$wheel_path"
