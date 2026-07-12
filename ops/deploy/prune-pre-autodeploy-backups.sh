#!/usr/bin/env bash
set -euo pipefail

backup_dir=${1:?backup directory is required}
keep_count=${2:-10}
protected_backup=${3:-}

if [[ ! $keep_count =~ ^[0-9]+$ ]] || ((keep_count < 1)); then
  echo 'backup-prune-error: keep count must be a positive integer' >&2
  exit 1
fi
[[ -d $backup_dir && ! -L $backup_dir ]] || {
  echo 'backup-prune-error: backup directory must be a real directory' >&2
  exit 1
}
backup_dir=$(realpath "$backup_dir")
command -v python3 >/dev/null || {
  echo 'backup-prune-error: python3 is required for UTC timestamp validation' >&2
  exit 1
}

shopt -s nullglob
records=()
for backup in "$backup_dir"/pre-autodeploy-*.dump; do
  [[ -f $backup && ! -L $backup ]] || continue
  basename=${backup##*/}
  if [[ $basename =~ ^pre-autodeploy-[0-9a-f]{12}-([0-9]{8}T[0-9]{6}Z)\.dump$ ]]; then
    timestamp=${BASH_REMATCH[1]}
    if python3 - "$timestamp" <<'PY'
from datetime import datetime
import sys

value = sys.argv[1]
try:
    parsed = datetime.strptime(value, "%Y%m%dT%H%M%SZ")
except ValueError:
    raise SystemExit(1)
raise SystemExit(0 if parsed.strftime("%Y%m%dT%H%M%SZ") == value else 1)
PY
    then
      records+=("$timestamp"$'\t'"$backup")
    fi
  fi
done

if [[ -n $protected_backup ]]; then
  [[ -f $protected_backup && ! -L $protected_backup ]] || {
    echo 'backup-prune-error: protected backup must be a regular file' >&2
    exit 1
  }
  protected_backup=$(realpath "$protected_backup")
  [[ ${protected_backup%/*} == "$backup_dir" ]] || {
    echo 'backup-prune-error: protected backup must be inside the backup directory' >&2
    exit 1
  }
  protected_found=false
  for record in "${records[@]}"; do
    [[ ${record#*$'\t'} == "$protected_backup" ]] && protected_found=true
  done
  [[ $protected_found == true ]] || {
    echo 'backup-prune-error: protected backup does not match the managed naming policy' >&2
    exit 1
  }
fi

((${#records[@]} > keep_count)) || {
  printf 'database-backups-pruned=0 retained=%s\n' "${#records[@]}"
  exit 0
}

ordered=()
while IFS= read -r record; do
  ordered+=("$record")
done < <(printf '%s\n' "${records[@]}" | LC_ALL=C sort -r)
pruned=0
retained=0
retain_limit=$keep_count
[[ -z $protected_backup ]] || retain_limit=$((keep_count - 1))
for ((index = 0; index < ${#ordered[@]}; index += 1)); do
  backup=${ordered[$index]#*$'\t'}
  if [[ -n $protected_backup && $backup == "$protected_backup" ]]; then
    continue
  fi
  if ((retained < retain_limit)); then
    retained=$((retained + 1))
    continue
  fi
  rm -- "$backup"
  pruned=$((pruned + 1))
done

printf 'database-backups-pruned=%s retained=%s\n' "$pruned" "$keep_count"
