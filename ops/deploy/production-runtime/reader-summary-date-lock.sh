#!/usr/bin/env bash
set -euo pipefail

date_value=
date_lock_dir=
fence_dir=
global_lock=
wait_seconds=7500
token_output=
require_preexisting=false
canonical_global_lock=
canonical_date_lock_dir=
canonical_fence_dir=

while (($# > 0)); do
  case "$1" in
    --date) date_value=${2:-}; shift 2 ;;
    --date-lock-dir) date_lock_dir=${2:-}; shift 2 ;;
    --fence-dir) fence_dir=${2:-}; shift 2 ;;
    --global-lock) global_lock=${2:-}; shift 2 ;;
    --wait-seconds) wait_seconds=${2:-}; shift 2 ;;
    --token-output) token_output=${2:-}; shift 2 ;;
    --require-preexisting-authority) require_preexisting=true; shift ;;
    --canonical-global-lock) canonical_global_lock=${2:-}; shift 2 ;;
    --canonical-date-lock-dir) canonical_date_lock_dir=${2:-}; shift 2 ;;
    --canonical-fence-dir) canonical_fence_dir=${2:-}; shift 2 ;;
    --) shift; break ;;
    *) echo "unknown reader-summary date-lock option: $1" >&2; exit 64 ;;
  esac
done

[[ $date_value =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || {
  echo "reader-summary date lock requires YYYY-MM-DD" >&2
  exit 64
}
[[ $date_lock_dir == /* && $fence_dir == /* ]] || {
  echo "reader-summary date lock directories must be absolute" >&2
  exit 64
}
[[ $wait_seconds =~ ^[0-9]+$ ]] || {
  echo "reader-summary date lock wait must be whole seconds" >&2
  exit 64
}
(($# > 0)) || {
  echo "reader-summary date lock requires a command" >&2
  exit 64
}

if [[ $require_preexisting == true ]]; then
  [[ ! -L $global_lock && ! -L $date_lock_dir && ! -L $fence_dir &&
     ! -L $canonical_global_lock && ! -L $canonical_date_lock_dir &&
     ! -L $canonical_fence_dir ]] || {
    echo "reader-summary canonical lock authority cannot be a symlink" >&2
    exit 76
  }
  [[ -f $global_lock && -d $date_lock_dir && -d $fence_dir ]] || {
    echo "reader-summary canonical lock authority must pre-exist" >&2
    exit 76
  }
  [[ $canonical_global_lock == /* && $canonical_date_lock_dir == /* &&
     $canonical_fence_dir == /* ]] || {
    echo "reader-summary canonical lock witnesses must be absolute" >&2
    exit 64
  }
  same_identity() {
    [[ $(realpath -e -- "$1") == $(realpath -e -- "$2") &&
       $(stat -Lc '%d:%i' -- "$1") == $(stat -Lc '%d:%i' -- "$2") ]]
  }
  same_identity "$global_lock" "$canonical_global_lock" &&
    same_identity "$date_lock_dir" "$canonical_date_lock_dir" &&
    same_identity "$fence_dir" "$canonical_fence_dir" || {
      echo "reader-summary canonical lock mount/path identity mismatch" >&2
      exit 76
    }
else
  mkdir -p "$date_lock_dir" "$fence_dir"
fi
expected_date_dir_identity=$(stat -Lc '%d:%i' -- "$date_lock_dir")
expected_fence_dir_identity=$(stat -Lc '%d:%i' -- "$fence_dir")
if [[ -n $global_lock ]]; then
  [[ $global_lock == /* ]] || {
    echo "reader-summary global lock path must be absolute" >&2
    exit 64
  }
  if [[ $require_preexisting != true ]]; then
    mkdir -p "$(dirname -- "$global_lock")"
    : >>"$global_lock"
  fi
  expected_global_identity=$(stat -Lc '%d:%i' -- "$global_lock")
  exec 8<"$global_lock"
  opened_global_identity=$(stat -Lc '%d:%i' -- "/proc/$$/fd/8")
  if [[ $opened_global_identity != "$expected_global_identity" ||
        $opened_global_identity != "$(stat -Lc '%d:%i' -- "$global_lock")" ]]; then
    echo "reader-summary global lock changed during open" >&2
    exit 76
  fi
  if [[ $require_preexisting == true ]]; then
    canonical_global_identity=$(stat -Lc '%d:%i' -- "$canonical_global_lock")
    if [[ $opened_global_identity != "$canonical_global_identity" ]]; then
      echo "reader-summary canonical global lock changed during open" >&2
      exit 76
    fi
  fi
  flock -w "$wait_seconds" 8 || {
    echo "reader-summary date lock timed out waiting for daily-run.lock" >&2
    exit 75
  }
fi

exec 6<"$date_lock_dir"
exec 5<"$fence_dir"
opened_date_dir_identity=$(stat -Lc '%d:%i' -- "/proc/$$/fd/6")
opened_fence_dir_identity=$(stat -Lc '%d:%i' -- "/proc/$$/fd/5")
path_date_dir_identity=$(stat -Lc '%d:%i' -- "$date_lock_dir")
path_fence_dir_identity=$(stat -Lc '%d:%i' -- "$fence_dir")
if [[ $opened_date_dir_identity != "$expected_date_dir_identity" ||
      $opened_fence_dir_identity != "$expected_fence_dir_identity" ||
      $opened_date_dir_identity != "$path_date_dir_identity" ||
      $opened_fence_dir_identity != "$path_fence_dir_identity" ]]; then
  echo "reader-summary lock directory changed during open" >&2
  exit 76
fi
canonical_opened_date_identity=$opened_date_dir_identity
canonical_opened_fence_identity=$opened_fence_dir_identity
if [[ $require_preexisting == true ]]; then
  canonical_opened_date_identity=$(stat -Lc '%d:%i' -- "$canonical_date_lock_dir")
  canonical_opened_fence_identity=$(stat -Lc '%d:%i' -- "$canonical_fence_dir")
fi
if [[ $opened_date_dir_identity != "$canonical_opened_date_identity" ||
      $opened_fence_dir_identity != "$canonical_opened_fence_identity" ]]; then
  echo "reader-summary canonical lock mount/path identity changed" >&2
  exit 76
fi

date_lock_path="/proc/$$/fd/6/$date_value.lock"
[[ ! -L $date_lock_path ]] || {
  echo "reader-summary date lock cannot be a symlink" >&2
  exit 76
}
exec 7>>"$date_lock_path"
opened_date_lock_identity=$(stat -Lc '%d:%i' -- "/proc/$$/fd/7")
named_date_lock_identity=$(stat -Lc '%d:%i' -- "$date_lock_path")
[[ ! -L $date_lock_path &&
   $opened_date_lock_identity == "$named_date_lock_identity" ]] || {
  echo "reader-summary date lock changed during open" >&2
  exit 76
}
flock -w "$wait_seconds" 7 || {
  echo "reader-summary date lock timed out for $date_value" >&2
  exit 75
}

counter_path="/proc/$$/fd/5/$date_value.counter"
[[ ! -L $counter_path ]] || {
  echo "reader-summary date fence counter cannot be a symlink" >&2
  exit 76
}
counter=0
if [[ -e $counter_path ]]; then
  counter=$(<"$counter_path")
  [[ $counter =~ ^[0-9]+$ ]] || {
    echo "reader-summary date fence counter is invalid" >&2
    exit 76
  }
fi
next_counter=$((counter + 1))
next_path="$counter_path.next.$$"
(set -o noclobber; printf '%s\n' "$next_counter" >"$next_path")
mv -T -- "$next_path" "$counter_path"
fence_token="reader-summary-date:$date_value:$next_counter"
export READER_SUMMARY_DATE_FENCE_TOKEN=$fence_token

if [[ -n $token_output ]]; then
  [[ $token_output == /* ]] || {
    echo "reader-summary fence token output must be absolute" >&2
    exit 64
  }
  mkdir -p "$(dirname -- "$token_output")"
  token_dir=$(dirname -- "$token_output")
  token_name=$(basename -- "$token_output")
  [[ ! -L $token_dir && ! -L $token_output ]] || {
    echo "reader-summary fence token output cannot be a symlink" >&2
    exit 76
  }
  expected_token_dir_identity=$(stat -Lc '%d:%i' -- "$token_dir")
  exec 4<"$token_dir"
  opened_token_dir_identity=$(stat -Lc '%d:%i' -- "/proc/$$/fd/4")
  [[ $opened_token_dir_identity == "$expected_token_dir_identity" &&
     $opened_token_dir_identity == "$(stat -Lc '%d:%i' -- "$token_dir")" ]] || {
    echo "reader-summary fence token directory changed during open" >&2
    exit 76
  }
  token_output_fd="/proc/$$/fd/4/$token_name"
  [[ ! -L $token_output_fd ]] || {
    echo "reader-summary fence token output cannot be a symlink" >&2
    exit 76
  }
  token_next="$token_output_fd.next.$$"
  (set -o noclobber; printf '%s\n' "$fence_token" >"$token_next")
  mv -T -- "$token_next" "$token_output_fd"
fi

exec "$@"
