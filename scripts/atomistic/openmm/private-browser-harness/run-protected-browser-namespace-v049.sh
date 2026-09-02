#!/bin/sh
set -eu

umask 077
PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
LANG=C
LC_ALL=C
IFS=$(printf ' \t\n_')
IFS=${IFS%_}
export PATH LANG LC_ALL IFS
unset BASH_ENV CDPATH ENV LD_AUDIT LD_DEBUG LD_LIBRARY_PATH LD_PRELOAD NODE_OPTIONS
exec 9>&2
exec 2>/dev/null

success=0
published=0
temporary_output=
scratch_root=
runtime_root=
output=
supervisor_pid=

fail() {
  exit 1
}

is_ancestor_or_self() {
  sought_pid=$1
  current_pid=$$
  while [ "$current_pid" -gt 0 ] 2>/dev/null; do
    [ "$sought_pid" = "$current_pid" ] && return 0
    parent_pid=
    if [ ! -r "/proc/$current_pid/status" ]; then
      break
    fi
    while IFS=: read -r status_key status_value; do
      if [ "$status_key" = PPid ]; then
        set -- $status_value
        parent_pid=${1-}
        break
      fi
    done < "/proc/$current_pid/status"
    case "$parent_pid" in
      ''|*[!0-9]*) break ;;
    esac
    [ "$parent_pid" -lt "$current_pid" ] 2>/dev/null || break
    current_pid=$parent_pid
  done
  return 1
}

assert_no_lingering_private_runtime() {
  [ -d /proc ] || return 1
  for command_line_path in /proc/[0-9]*/cmdline; do
    [ -r "$command_line_path" ] || continue
    candidate_pid=${command_line_path#/proc/}
    candidate_pid=${candidate_pid%/cmdline}
    is_ancestor_or_self "$candidate_pid" && continue
    command_line=$(
      "$tr_bin" '\000' '\n' < "$command_line_path" 2>/dev/null || true
    )
    executable_link=$("$readlink_bin" "/proc/$candidate_pid/exe" 2>/dev/null || true)
    working_link=$("$readlink_bin" "/proc/$candidate_pid/cwd" 2>/dev/null || true)
    case "$command_line\n$executable_link\n$working_link" in
      *"$repository_root"*|*"$runtime_root"*|*"$node_runtime_root"*|\
        *"$rolldown_runtime_root"*|*"$scratch_root"*) return 1 ;;
    esac
    for descriptor_path in /proc/"$candidate_pid"/fd/*; do
      [ -e "$descriptor_path" ] || continue
      descriptor_link=$("$readlink_bin" "$descriptor_path" 2>/dev/null || true)
      case "$descriptor_link" in
        *"$repository_root"*|*"$runtime_root"*|*"$node_runtime_root"*|\
          *"$rolldown_runtime_root"*|*"$scratch_root"*) return 1 ;;
      esac
    done
  done
  listener_state=$("$ss_bin" -H -l -x -n 2>/dev/null || true)
  case "$listener_state" in
    *"$repository_root"*|*"$runtime_root"*|*"$node_runtime_root"*|\
      *"$rolldown_runtime_root"*|*"$scratch_root"*) return 1 ;;
  esac
  return 0
}

cleanup() {
  exit_status=$?
  trap - EXIT HUP INT TERM
  set +e
  cleanup_failed=0
  if [ -n "$supervisor_pid" ] && kill -0 "$supervisor_pid" 2>/dev/null; then
    kill -TERM "$supervisor_pid" 2>/dev/null
    wait "$supervisor_pid" 2>/dev/null
  fi
  if [ -n "$runtime_root" ] && [ -n "$scratch_root" ]; then
    assert_no_lingering_private_runtime || cleanup_failed=1
  fi
  if [ -n "$scratch_root" ]; then
    case "$scratch_root" in
      /tmp/tailing-private-browser-namespace-v049.*)
        "$rm_bin" -rf -- "$scratch_root" 2>/dev/null || cleanup_failed=1
        [ ! -e "$scratch_root" ] || cleanup_failed=1
        ;;
      *) cleanup_failed=1 ;;
    esac
  fi
  if [ -n "$temporary_output" ]; then
    "$rm_bin" -f -- "$temporary_output" 2>/dev/null
  fi
  if [ "$published" -eq 1 ]; then
    if [ "$success" -ne 1 ] || [ "$exit_status" -ne 0 ] \
        || [ "$cleanup_failed" -ne 0 ]; then
      "$rm_bin" -f -- "$output" 2>/dev/null
    fi
  fi
  if [ "$success" -ne 1 ] || [ "$exit_status" -ne 0 ] || [ "$cleanup_failed" -ne 0 ]; then
    printf '%s\n' 'protected browser namespace supervisor failed' >&9
    exit 1
  fi
  exit 0
}

trap cleanup EXIT
trap 'exit 1' HUP INT TERM

[ "$(uname -s)" = Linux ] || fail
[ "$(uname -m)" = x86_64 ] || fail
[ "$(id -u)" -eq 0 ] || fail

required_tools='unshare mount ip setpriv timeout env findmnt mktemp realpath stat awk grep tr readlink ss chmod ln rm mkdir chown sha256sum aa-exec'
for required_tool in $required_tools; do
  command -v "$required_tool" >/dev/null 2>&1 || fail
done

unshare_bin=$(realpath -e "$(command -v unshare)")
mount_bin=$(realpath -e "$(command -v mount)")
ip_bin=$(realpath -e "$(command -v ip)")
setpriv_bin=$(realpath -e "$(command -v setpriv)")
timeout_bin=$(realpath -e "$(command -v timeout)")
env_bin=$(realpath -e "$(command -v env)")
findmnt_bin=$(realpath -e "$(command -v findmnt)")
mktemp_bin=$(realpath -e "$(command -v mktemp)")
realpath_bin=$(realpath -e "$(command -v realpath)")
stat_bin=$(realpath -e "$(command -v stat)")
awk_bin=$(realpath -e "$(command -v awk)")
tr_bin=$(realpath -e "$(command -v tr)")
readlink_bin=$(realpath -e "$(command -v readlink)")
ss_bin=$(realpath -e "$(command -v ss)")
chmod_bin=$(realpath -e "$(command -v chmod)")
ln_bin=$(realpath -e "$(command -v ln)")
rm_bin=$(realpath -e "$(command -v rm)")
mkdir_bin=$(realpath -e "$(command -v mkdir)")
chown_bin=$(realpath -e "$(command -v chown)")
sha256sum_bin=$(realpath -e "$(command -v sha256sum)")
aa_exec_bin=$(realpath -e "$(command -v aa-exec)")
[ "$aa_exec_bin" = /usr/bin/aa-exec ] || fail

[ "$#" -eq 16 ] || fail
[ "$1" = --repository-root ] || fail
repository_root=$2
[ "$3" = --artifact-root ] || fail
artifact_root=$4
[ "$5" = --control-receipt ] || fail
control_receipt=$6
[ "$7" = --source-revision ] || fail
source_revision=$8
[ "$9" = --session-id ] || fail
session_id=${10}
[ "${11}" = --runtime-root ] || fail
runtime_root=${12}
[ "${13}" = --mode ] || fail
mode=${14}
[ "${15}" = --output ] || fail
output=${16}

require_safe_absolute_path() {
  path_value=$1
  case "$path_value" in
    /*) ;;
    *) return 1 ;;
  esac
  case "$path_value" in
    *[!A-Za-z0-9_./-]*|*//*|*/./*|*/../*|*/.|*/..) return 1 ;;
  esac
  return 0
}

require_canonical_directory() {
  require_safe_absolute_path "$1" || return 1
  [ -d "$1" ] && [ ! -L "$1" ] || return 1
  [ "$("$realpath_bin" -e -- "$1")" = "$1" ] || return 1
}

require_canonical_directory "$repository_root" || fail
require_canonical_directory "$artifact_root" || fail
require_canonical_directory "$runtime_root" || fail
require_safe_absolute_path "$control_receipt" || fail
[ -f "$control_receipt" ] && [ ! -L "$control_receipt" ] || fail
[ "$("$realpath_bin" -e -- "$control_receipt")" = "$control_receipt" ] || fail
[ "$("$stat_bin" -c %h -- "$control_receipt")" -eq 1 ] || fail
control_size=$("$stat_bin" -c %s -- "$control_receipt")
[ "$control_size" -gt 0 ] && [ "$control_size" -le 8000000 ] || fail

printf '%s\n' "$source_revision" | grep -Eq '^[0-9a-f]{40}$' || fail
[ "$source_revision" != 0000000000000000000000000000000000000000 ] || fail
printf '%s\n' "$session_id" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$' || fail
printf '%s\n' "$runtime_root" \
  | grep -Eq '^/opt/tailing-private-chromium-[1-9][0-9]{0,31}-[1-9][0-9]{0,9}$' || fail
runtime_suffix=${runtime_root#/opt/tailing-private-chromium-}
app_armor_profile="tailing-future-chromium-$runtime_suffix"
node_runtime_root="/opt/tailing-private-node-$runtime_suffix"
rolldown_runtime_root="/opt/tailing-private-rolldown-$runtime_suffix"
node_dir="$node_runtime_root/bin"
node_bin="$node_dir/node"
rolldown_runtime_file="$rolldown_runtime_root/rolldown-binding.linux-x64-gnu.node"
rolldown_target_file="$repository_root/node_modules/@rolldown/binding-linux-x64-gnu/rolldown-binding.linux-x64-gnu.node"
require_canonical_directory "$node_runtime_root" || fail
require_canonical_directory "$node_dir" || fail
require_canonical_directory "$rolldown_runtime_root" || fail
[ -r /sys/kernel/security/apparmor/profiles ] || fail
grep -Fqx -- "$app_armor_profile (unconfined)" \
  /sys/kernel/security/apparmor/profiles || fail

require_root_frozen_regular_file() {
  frozen_file=$1
  frozen_mode=$2
  [ -f "$frozen_file" ] && [ ! -L "$frozen_file" ] || return 1
  [ "$("$realpath_bin" -e -- "$frozen_file")" = "$frozen_file" ] || return 1
  [ "$("$stat_bin" -c %h -- "$frozen_file")" -eq 1 ] || return 1
  [ "$("$stat_bin" -c %u -- "$frozen_file")" -eq 0 ] || return 1
  [ "$("$stat_bin" -c %g -- "$frozen_file")" -eq 0 ] || return 1
  [ "$("$stat_bin" -c %a -- "$frozen_file")" = "$frozen_mode" ] || return 1
}

[ "$("$stat_bin" -c %u -- "$node_runtime_root")" -eq 0 ] || fail
[ "$("$stat_bin" -c %g -- "$node_runtime_root")" -eq 0 ] || fail
[ "$("$stat_bin" -c %a -- "$node_runtime_root")" = 555 ] || fail
[ "$("$stat_bin" -c %u -- "$node_dir")" -eq 0 ] || fail
[ "$("$stat_bin" -c %g -- "$node_dir")" -eq 0 ] || fail
[ "$("$stat_bin" -c %a -- "$node_dir")" = 555 ] || fail
require_root_frozen_regular_file "$node_bin" 555 || fail
node_size=$("$stat_bin" -c %s -- "$node_bin")
[ "$node_size" -gt 0 ] && [ "$node_size" -le 268435456 ] || fail
[ "$("$node_bin" --version)" = v24.16.0 ] || fail

[ "$("$stat_bin" -c %u -- "$rolldown_runtime_root")" -eq 0 ] || fail
[ "$("$stat_bin" -c %g -- "$rolldown_runtime_root")" -eq 0 ] || fail
[ "$("$stat_bin" -c %a -- "$rolldown_runtime_root")" = 555 ] || fail
require_root_frozen_regular_file "$rolldown_runtime_file" 444 || fail
require_root_frozen_regular_file "$rolldown_target_file" 444 || fail
for rolldown_file in "$rolldown_runtime_file" "$rolldown_target_file"; do
  [ "$("$stat_bin" -c %s -- "$rolldown_file")" -eq 19324672 ] || fail
  rolldown_sha256=$("$sha256sum_bin" -- "$rolldown_file")
  rolldown_sha256=${rolldown_sha256%% *}
  [ "$rolldown_sha256" = ae16856655924ebc41f231393c7f8b89566430a845d1f073fd9d6abf219db04b ] \
    || fail
done
case "$mode" in
  happy-path|mid-playback-dispose|context-loss) ;;
  *) fail ;;
esac

require_safe_absolute_path "$output" || fail
[ ! -e "$output" ] && [ ! -L "$output" ] || fail
output_name=${output##*/}
output_parent=${output%/*}
[ -n "$output_name" ] && [ -n "$output_parent" ] || fail
[ "$("$realpath_bin" -m -- "$output")" = "$output" ] || fail
require_canonical_directory "$output_parent" || fail
[ "$("$stat_bin" -c %u -- "$output_parent")" -eq 0 ] || fail
[ "$("$stat_bin" -c %g -- "$output_parent")" -eq 0 ] || fail
output_parent_permissions=$("$stat_bin" -c %A -- "$output_parent")
case "$output_parent_permissions" in
  ?????w????|????????w?) fail ;;
esac

paths_overlap() {
  [ "$1" = "$2" ] && return 0
  case "$1" in "$2"/*) return 0 ;; esac
  case "$2" in "$1"/*) return 0 ;; esac
  return 1
}

paths_overlap "$repository_root" "$artifact_root" && fail
paths_overlap "$repository_root" "$runtime_root" && fail
paths_overlap "$repository_root" "$node_runtime_root" && fail
paths_overlap "$repository_root" "$rolldown_runtime_root" && fail
paths_overlap "$artifact_root" "$runtime_root" && fail
paths_overlap "$artifact_root" "$node_runtime_root" && fail
paths_overlap "$artifact_root" "$rolldown_runtime_root" && fail
paths_overlap "$runtime_root" "$node_runtime_root" && fail
paths_overlap "$runtime_root" "$rolldown_runtime_root" && fail
paths_overlap "$node_runtime_root" "$rolldown_runtime_root" && fail
case "$control_receipt" in
  "$repository_root"/*|"$artifact_root"/*|"$runtime_root"/*|"$node_runtime_root"/*|\
    "$rolldown_runtime_root"/*) fail ;;
esac
case "$output" in
  "$repository_root"/*|"$artifact_root"/*|"$runtime_root"/*|"$node_runtime_root"/*|\
    "$rolldown_runtime_root"/*|"$control_receipt") fail ;;
esac

runner_path="$repository_root/scripts/atomistic/openmm/private-browser-harness/run-protected-private-browser-mode-v049.server.mjs"
[ -f "$runner_path" ] && [ ! -L "$runner_path" ] || fail
[ "$("$realpath_bin" -e -- "$runner_path")" = "$runner_path" ] || fail
[ "$("$stat_bin" -c %h -- "$runner_path")" -eq 1 ] || fail
[ "$("$stat_bin" -c %u -- "$runtime_root")" -eq 0 ] || fail
[ "$("$stat_bin" -c %g -- "$runtime_root")" -eq 0 ] || fail
[ "$("$stat_bin" -c %a -- "$runtime_root")" = 555 ] || fail

scratch_root=$("$mktemp_bin" -d /tmp/tailing-private-browser-namespace-v049.XXXXXXXX)
[ -d "$scratch_root" ] && [ ! -L "$scratch_root" ] || fail
[ "$("$stat_bin" -c %u -- "$scratch_root")" -eq 0 ] || fail
[ "$("$stat_bin" -c %g -- "$scratch_root")" -eq 0 ] || fail
[ "$("$stat_bin" -c %a -- "$scratch_root")" = 700 ] || fail

temporary_output=$("$mktemp_bin" "$output_parent/.${output_name}.${session_id}.XXXXXXXX")
[ -f "$temporary_output" ] && [ ! -L "$temporary_output" ] || fail
[ "$("$stat_bin" -c %h -- "$temporary_output")" -eq 1 ] || fail
[ "$("$stat_bin" -c %u -- "$temporary_output")" -eq 0 ] || fail
[ "$("$stat_bin" -c %g -- "$temporary_output")" -eq 0 ] || fail
[ "$("$stat_bin" -c %a -- "$temporary_output")" = 600 ] || fail
ulimit -f 4096 || fail

"$timeout_bin" --signal=TERM --kill-after=10s 180s \
  "$unshare_bin" --mount --net --pid --fork --kill-child=KILL --mount-proc=/proc \
  /bin/sh -eu -c '
    [ "$#" -eq 24 ] || exit 1
    repository_root=$1
    artifact_root=$2
    control_receipt=$3
    source_revision=$4
    session_id=$5
    runtime_root=$6
    mode=$7
    scratch_root=$8
    runner_path=$9
    shift 9
    node_bin=$1
    node_dir=$2
    mount_bin=$3
    ip_bin=$4
    setpriv_bin=$5
    env_bin=$6
    findmnt_bin=$7
    awk_bin=$8
    mkdir_bin=$9
    shift 9
    chown_bin=$1
    node_runtime_root=$2
    rolldown_runtime_file=$3
    rolldown_target_file=$4
    aa_exec_bin=$5
    app_armor_profile=$6

    "$mount_bin" --make-rprivate /
    "$mount_bin" -t tmpfs \
      -o rw,nosuid,nodev,noexec,size=268435456,nr_inodes=8192,mode=0700,uid=65534,gid=65534 \
      tailing-private-browser-scratch "$scratch_root"
    for scratch_directory in home tmp cache config runtime; do
      "$mkdir_bin" -m 0700 -- "$scratch_root/$scratch_directory"
      "$chown_bin" 65534:65534 -- "$scratch_root/$scratch_directory"
    done

    verify_readonly_mount() {
      mount_target=$1
      execution_policy=$2
      mount_options=$("$findmnt_bin" -rn --mountpoint "$mount_target" --output OPTIONS)
      [ -n "$mount_options" ] || exit 1
      case "$mount_options" in *"
"*) exit 1 ;; esac
      case ",$mount_options," in *,ro,*) ;; *) exit 1 ;; esac
      case ",$mount_options," in *,rw,*) exit 1 ;; esac
      case ",$mount_options," in *,nosuid,*) ;; *) exit 1 ;; esac
      case ",$mount_options," in *,nodev,*) ;; *) exit 1 ;; esac
      case "$execution_policy" in
        noexec)
          case ",$mount_options," in *,noexec,*) ;; *) exit 1 ;; esac
          ;;
        exec)
          case ",$mount_options," in *,noexec,*) exit 1 ;; esac
          ;;
        *) exit 1 ;;
      esac
    }

    bind_readonly() {
      bind_target=$1
      execution_policy=$2
      "$mount_bin" --bind -- "$bind_target" "$bind_target"
      "$mount_bin" -o "remount,bind,ro,nosuid,nodev,$execution_policy" -- "$bind_target"
      verify_readonly_mount "$bind_target" "$execution_policy"
    }

    bind_readonly "$repository_root" noexec
    bind_readonly "$artifact_root" noexec
    bind_readonly "$control_receipt" noexec
    bind_readonly "$node_runtime_root" exec
    bind_readonly "$rolldown_runtime_root" noexec
    bind_readonly "$runtime_root" exec
    "$mount_bin" --bind -- "$rolldown_runtime_file" "$rolldown_target_file"
    "$mount_bin" -o remount,bind,ro,nosuid,nodev,exec -- "$rolldown_target_file"
    verify_readonly_mount "$rolldown_target_file" exec

    "$ip_bin" link set dev lo up
    "$ip_bin" -o link show \
      | "$awk_bin" '\''$2 != "lo:" { exit 1 } END { if (NR != 1) exit 1 }'\''
    "$ip_bin" -o -4 route show table all \
      | "$awk_bin" '\''NF > 0 && $0 !~ / dev lo([[:space:]]|$)/ { exit 1 }'\''
    "$ip_bin" -o -6 route show table all \
      | "$awk_bin" '\''NF > 0 && $0 !~ / dev lo([[:space:]]|$)/ { exit 1 }'\''

    cd "$repository_root"
    exec "$aa_exec_bin" --profile="$app_armor_profile" -- \
      "$setpriv_bin" \
      --reuid=65534 --regid=65534 --clear-groups \
      --inh-caps=-all --ambient-caps=-all --bounding-set=-all --no-new-privs \
      "$env_bin" -i \
      CI=1 \
      HOME="$scratch_root/home" \
      LANG=C.UTF-8 \
      LC_ALL=C.UTF-8 \
      NODE_ENV=production \
      PATH="$node_dir:/usr/bin:/bin" \
      TAILING_BROWSER_APPARMOR_PROFILE="$app_armor_profile" \
      TMPDIR="$scratch_root/tmp" \
      TZ=UTC \
      XDG_CACHE_HOME="$scratch_root/cache" \
      XDG_CONFIG_HOME="$scratch_root/config" \
      XDG_RUNTIME_DIR="$scratch_root/runtime" \
      "$node_bin" "$runner_path" \
      --artifact-root "$artifact_root" \
      --control-receipt "$control_receipt" \
      --source-revision "$source_revision" \
      --session-id "$session_id" \
      --runtime-root "$runtime_root" \
      --mode "$mode"
  ' protected-browser-namespace-child \
  "$repository_root" "$artifact_root" "$control_receipt" "$source_revision" \
  "$session_id" "$runtime_root" "$mode" "$scratch_root" "$runner_path" \
  "$node_bin" "$node_dir" "$mount_bin" "$ip_bin" "$setpriv_bin" "$env_bin" \
  "$findmnt_bin" "$awk_bin" "$mkdir_bin" "$chown_bin" "$node_runtime_root" \
  "$rolldown_runtime_file" "$rolldown_target_file" "$aa_exec_bin" "$app_armor_profile" \
  >"$temporary_output" 2>"$scratch_root/namespace.stderr" 9>&- &
supervisor_pid=$!
if wait "$supervisor_pid"; then
  supervisor_pid=
else
  supervisor_pid=
  fail
fi

assert_no_lingering_private_runtime || fail
[ -f "$temporary_output" ] && [ ! -L "$temporary_output" ] || fail
[ "$("$stat_bin" -c %h -- "$temporary_output")" -eq 1 ] || fail
[ "$("$stat_bin" -c %u -- "$temporary_output")" -eq 0 ] || fail
[ "$("$stat_bin" -c %g -- "$temporary_output")" -eq 0 ] || fail
output_size=$("$stat_bin" -c %s -- "$temporary_output")
[ "$output_size" -gt 0 ] && [ "$output_size" -le 2000000 ] || fail
"$chmod_bin" 0444 -- "$temporary_output"
[ "$("$stat_bin" -c %a -- "$temporary_output")" = 444 ] || fail
"$ln_bin" -- "$temporary_output" "$output"
published=1
"$rm_bin" -f -- "$temporary_output"
temporary_output=
[ -f "$output" ] && [ ! -L "$output" ] || fail
[ "$("$stat_bin" -c %h -- "$output")" -eq 1 ] || fail
[ "$("$stat_bin" -c %s -- "$output")" -eq "$output_size" ] || fail
[ "$("$stat_bin" -c %u -- "$output")" -eq 0 ] || fail
[ "$("$stat_bin" -c %g -- "$output")" -eq 0 ] || fail
[ "$("$stat_bin" -c %a -- "$output")" = 444 ] || fail

success=1
