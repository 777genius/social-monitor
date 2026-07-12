#!/usr/bin/env bash
set -euo pipefail

if ((EUID == 0)); then
  command -v setpriv >/dev/null || {
    echo 'Backup retention fixture requires setpriv when run as root' >&2
    exit 1
  }
  exec setpriv --reuid=65534 --regid=65534 --clear-groups \
    env PATH="$PATH" TMPDIR=/tmp bash "$0" "$@"
fi

SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
ENTRYPOINT=$SCRIPT_DIR/prune-pre-autodeploy-backups.sh
FIXTURE=$(mktemp -d "${TMPDIR:-/tmp}/social-monitor-backup-prune-test.XXXXXX")
trap 'rm -rf "$FIXTURE"' EXIT

mkdir "$FIXTURE/empty" "$FIXTURE/single"
output=$(bash "$ENTRYPOINT" "$FIXTURE/empty" 10)
grep -Fx 'database-backups-pruned=0 retained=0' <<< "$output" >/dev/null
printf 'single\n' > \
  "$FIXTURE/single/pre-autodeploy-abcdef123456-20260701T120000Z.dump"
output=$(bash "$ENTRYPOINT" "$FIXTURE/single" 10)
grep -Fx 'database-backups-pruned=0 retained=1' <<< "$output" >/dev/null
[[ -f $FIXTURE/single/pre-autodeploy-abcdef123456-20260701T120000Z.dump ]]
ln -s "$FIXTURE/empty" "$FIXTURE/backup-dir-link"
if bash "$ENTRYPOINT" "$FIXTURE/backup-dir-link" 10 >/dev/null 2>&1; then
  echo 'symlink backup directory was accepted' >&2
  exit 1
fi

for index in $(seq 1 12); do
  timestamp=$(printf '202607%02dT120000Z' "$index")
  printf 'backup-%s\n' "$index" > \
    "$FIXTURE/pre-autodeploy-abcdef123456-$timestamp.dump"
done
printf 'manual\n' > "$FIXTURE/manual-production.dump"
printf 'incident\n' > "$FIXTURE/incident-production.dump"
printf 'partial\n' > "$FIXTURE/pre-autodeploy-abcdef123456-20260713T120000Z.dump.partial"
printf 'invalid\n' > "$FIXTURE/pre-autodeploy-not-a-sha-20260713T120000Z.dump"
printf 'invalid-date\n' > "$FIXTURE/pre-autodeploy-abcdef123456-20269999T120000Z.dump"
mkdir "$FIXTURE/pre-autodeploy-abcdef123456-20260715T120000Z.dump"
ln -s "$FIXTURE/manual-production.dump" \
  "$FIXTURE/pre-autodeploy-abcdef123456-20260714T120000Z.dump"

output=$(bash "$ENTRYPOINT" "$FIXTURE" 10)
grep -Fx 'database-backups-pruned=2 retained=10' <<< "$output" >/dev/null
[[ ! -e $FIXTURE/pre-autodeploy-abcdef123456-20260701T120000Z.dump ]]
[[ ! -e $FIXTURE/pre-autodeploy-abcdef123456-20260702T120000Z.dump ]]
for index in $(seq 3 12); do
  timestamp=$(printf '202607%02dT120000Z' "$index")
  [[ -f $FIXTURE/pre-autodeploy-abcdef123456-$timestamp.dump ]]
done
[[ -f $FIXTURE/manual-production.dump ]]
[[ -f $FIXTURE/incident-production.dump ]]
[[ -f $FIXTURE/pre-autodeploy-abcdef123456-20260713T120000Z.dump.partial ]]
[[ -f $FIXTURE/pre-autodeploy-not-a-sha-20260713T120000Z.dump ]]
[[ -f $FIXTURE/pre-autodeploy-abcdef123456-20269999T120000Z.dump ]]
[[ -d $FIXTURE/pre-autodeploy-abcdef123456-20260715T120000Z.dump ]]
[[ -L $FIXTURE/pre-autodeploy-abcdef123456-20260714T120000Z.dump ]]

output=$(bash "$ENTRYPOINT" "$FIXTURE" 10)
grep -Fx 'database-backups-pruned=0 retained=10' <<< "$output" >/dev/null

if bash "$ENTRYPOINT" "$FIXTURE" 0 >/dev/null 2>&1; then
  echo 'zero retention count was accepted' >&2
  exit 1
fi

PROTECTED_FIXTURE=$FIXTURE/protected
mkdir "$PROTECTED_FIXTURE"
protected=$PROTECTED_FIXTURE/pre-autodeploy-012345abcdef-20260701T000000Z.dump
printf 'current\n' > "$protected"
for index in $(seq 1 10); do
  timestamp=$(printf '202609%02dT120000Z' "$index")
  printf 'future-%s\n' "$index" > \
    "$PROTECTED_FIXTURE/pre-autodeploy-fedcba654321-$timestamp.dump"
done
output=$(bash "$ENTRYPOINT" "$PROTECTED_FIXTURE" 10 "$protected")
grep -Fx 'database-backups-pruned=1 retained=10' <<< "$output" >/dev/null
[[ -f $protected ]]
[[ $(find "$PROTECTED_FIXTURE" -maxdepth 1 -type f | wc -l | tr -d ' ') == 10 ]]

dangling=$PROTECTED_FIXTURE/pre-autodeploy-012345abcdef-20261001T000000Z.dump
ln -s "$PROTECTED_FIXTURE/missing" "$dangling"
if bash "$ENTRYPOINT" "$PROTECTED_FIXTURE" 10 "$dangling" >/dev/null 2>&1; then
  echo 'dangling protected backup was accepted' >&2
  exit 1
fi

FAILURE_FIXTURE=$FIXTURE/removal-failure
mkdir "$FAILURE_FIXTURE"
for index in $(seq 1 11); do
  timestamp=$(printf '202608%02dT120000Z' "$index")
  printf 'backup-%s\n' "$index" > \
    "$FAILURE_FIXTURE/pre-autodeploy-fedcba654321-$timestamp.dump"
done
chmod 0500 "$FAILURE_FIXTURE"
if bash "$ENTRYPOINT" "$FAILURE_FIXTURE" 10 >/dev/null 2>&1; then
  echo 'backup deletion failure was ignored' >&2
  exit 1
fi
chmod 0700 "$FAILURE_FIXTURE"

echo 'Pre-autodeploy backup retention tests passed'
