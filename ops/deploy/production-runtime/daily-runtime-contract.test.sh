#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
DAILY_RUN=$SCRIPT_DIR/daily-run.sh
DAILY_SERVICE=$SCRIPT_DIR/social-monitor-daily.service

grep -F 'postgres-runtime-current/compose.postgres-runtime.yml' "$DAILY_RUN" >/dev/null
# The test asserts literal runtime expansion syntax.
# shellcheck disable=SC2016
grep -F 'runtime_release != "$backend_release"' "$DAILY_RUN" >/dev/null
grep -F 'daily-run-singleton.lock' "$DAILY_RUN" >/dev/null
# The test asserts literal runtime expansion syntax.
# shellcheck disable=SC2016
grep -F '"$FLOCK_COMMAND" -w "$POSTGRES_ADMISSION_WAIT_SECONDS" 8' "$DAILY_RUN" >/dev/null
grep -Fx 'ExecCondition=/var/data/social-monitor/control/daily-c1-runtime.sh --check-legacy-owner' \
  "$DAILY_SERVICE" >/dev/null
grep -Fx 'ExecStartPre=/var/data/social-monitor/control/daily-c1-runtime.sh --prepare-legacy-start' \
  "$DAILY_SERVICE" >/dev/null
grep -Fx 'ExecStart=/var/data/social-monitor/control/daily-c1-runtime.sh --run-and-complete-legacy' \
  "$DAILY_SERVICE" >/dev/null
grep -Fx 'ExecStopPost=/var/data/social-monitor/control/daily-c1-runtime.sh --complete-legacy-start' \
  "$DAILY_SERVICE" >/dev/null
[[ $(grep -c '^ExecCondition=' "$DAILY_SERVICE") -eq 1 ]] || {
  echo 'daily service must declare exactly one readiness condition' >&2
  exit 1
}
grep -Fx 'TimeoutStartSec=19800' "$DAILY_SERVICE" >/dev/null
[[ $(grep -c '^TimeoutStartSec=' "$DAILY_SERVICE") -eq 1 ]] || {
  echo 'daily service must declare exactly one start timeout' >&2
  exit 1
}
grep -Fx 'Restart=no' "$DAILY_SERVICE" >/dev/null

check_mode_line=$(grep -n 'check_daily_c1_readiness || exit 75' "$DAILY_RUN" | head -1 | cut -d: -f1)
singleton_lock_line=$(grep -n 'daily-run-singleton.lock' "$DAILY_RUN" | cut -d: -f1)
post_singleton_check_line=$(grep -n 'check_daily_c1_readiness || exit 75' "$DAILY_RUN" | tail -1 | cut -d: -f1)
admission_lock_line=$(grep -n 'daily-run.lock"' "$DAILY_RUN" | cut -d: -f1)
auth_line=$(grep -n 'refresh-codex-auth.sh" --broker-pool-job-id' "$DAILY_RUN" | cut -d: -f1)
docker_line=$(grep -n 'profile app up -d --no-deps agent-runtime' "$DAILY_RUN" | cut -d: -f1)
((check_mode_line < singleton_lock_line && singleton_lock_line < post_singleton_check_line && post_singleton_check_line < admission_lock_line && post_singleton_check_line < auth_line && post_singleton_check_line < docker_line)) || {
  echo 'daily C1 readiness check ordering is unsafe' >&2
  exit 1
}

test_root=$(mktemp -d /tmp/social-monitor-daily-runtime-contract.XXXXXX)
trap 'rm -rf "$test_root"' EXIT HUP INT TERM
readonly RELEASE_SHA=0123456789abcdef0123456789abcdef01234567

prepare_case() {
  local name=$1
  local case_root=$test_root/$name
  install -d "$case_root/control/postgres-runtime-current" \
    "$case_root/control/deploy-state"
  printf '%s\n' "$RELEASE_SHA" >"$case_root/control/postgres-runtime-current/READY"
  printf '%s\n' "$RELEASE_SHA" >"$case_root/control/deploy-state/backend.sha"
  cat >"$case_root/flock" <<EOF
#!/usr/bin/env bash
printf '%s\\n' "\$*" >>'$case_root/flock.calls'
EOF
  cat >"$case_root/control/refresh-codex-auth.sh" <<EOF
#!/usr/bin/env bash
printf '%s\\n' "\$*" >'$case_root/auth.called'
exit 91
EOF
  cat >"$case_root/docker" <<EOF
#!/usr/bin/env bash
touch '$case_root/docker.called'
exit 92
EOF
  chmod +x "$case_root/flock" "$case_root/control/refresh-codex-auth.sh" \
    "$case_root/docker"
  printf '%s\n' "$case_root"
}

run_daily() {
  local case_root=$1
  SOCIAL_MONITOR_DAILY_RUN_TEST_MODE=1 \
  SOCIAL_MONITOR_DAILY_RUN_TEST_ROOT="$case_root" \
  SOCIAL_MONITOR_DAILY_RUN_TEST_ADMISSION_WAIT_SECONDS=0 \
  SOCIAL_MONITOR_DAILY_RUN_TEST_FLOCK="$case_root/flock" \
  SOCIAL_MONITOR_DAILY_RUN_TEST_DOCKER="$case_root/docker" \
    bash "$DAILY_RUN" --yesterday
}

run_check() {
  local case_root=$1
  SOCIAL_MONITOR_DAILY_RUN_TEST_MODE=1 \
  SOCIAL_MONITOR_DAILY_RUN_TEST_ROOT="$case_root" \
  SOCIAL_MONITOR_DAILY_RUN_TEST_ADMISSION_WAIT_SECONDS=0 \
  SOCIAL_MONITOR_DAILY_RUN_TEST_FLOCK="$case_root/flock" \
  SOCIAL_MONITOR_DAILY_RUN_TEST_DOCKER="$case_root/docker" \
    bash "$DAILY_RUN" --check-readiness
}

assert_rejected_marker() {
  local name=$1
  local case_root
  local status
  case_root=$(prepare_case "$name")
  cat >"$case_root/control/postgres-runtime-current/reader-summary-daily-c1.readiness"
  if run_check "$case_root" >"$case_root/stdout" 2>"$case_root/stderr"; then
    status=0
  else
    status=$?
  fi
  [[ $status -eq 75 ]] || {
    echo "$name readiness marker must exit 75, got $status" >&2
    exit 1
  }
  [[ ! -s "$case_root/stdout" ]] || {
    echo "$name readiness marker wrote unexpected stdout" >&2
    exit 1
  }
  grep -Fx 'daily production-day C1 readiness marker is not canonical READY' \
    "$case_root/stderr" >/dev/null
  [[ $(wc -l <"$case_root/stderr") -eq 1 ]] || {
    echo "$name readiness marker wrote unexpected stderr" >&2
    exit 1
  }
  [[ ! -e "$case_root/auth.called" && ! -e "$case_root/docker.called" ]] || {
    echo "$name readiness marker allowed auth or Docker work" >&2
    exit 1
  }
  [[ ! -e "$case_root/flock.calls" ]] || {
    echo "$name readiness marker allowed lock acquisition" >&2
    exit 1
  }
  [[ ! -e "$case_root/control/daily-run-singleton.lock" && \
     ! -e "$case_root/control/daily-run.lock" ]] || {
    echo "$name readiness check created lock files" >&2
    exit 1
  }
}

write_canonical_readiness() {
  local case_root=$1
  cat >"$case_root/control/postgres-runtime-current/reader-summary-daily-c1.readiness" <<'EOF'
schemaVersion=reader_summary.daily_delivery_readiness.c1
state=READY
requires=H_GREEN,C0_GREEN,C1_SCAN_TERMINAL_REPAIR_GREEN
activation=reviewed
EOF
}

assert_rejected_containment() {
  local name=$1 kind=$2
  local case_root status containment
  case_root=$(prepare_case "$name")
  write_canonical_readiness "$case_root"
  containment=$case_root/control/reader-summary-daily-c1-contained.v1
  case "$kind" in
    requested)
      printf '%s\n' \
        schemaVersion=reader_summary.daily_c1_containment.v1 \
        state=REQUESTED \
        "readySha=$RELEASE_SHA" >"$containment"
      ;;
    contained)
      printf '%s\n' \
        schemaVersion=reader_summary.daily_c1_containment.v1 \
        state=CONTAINED \
        "readySha=$RELEASE_SHA" >"$containment"
      ;;
    invalid) printf 'tampered\n' >"$containment" ;;
    symlink) ln -s "$case_root/missing-containment-target" "$containment" ;;
  esac
  if run_check "$case_root" >"$case_root/stdout" 2>"$case_root/stderr"; then
    status=0
  else
    status=$?
  fi
  [[ $status -eq 75 ]] || {
    echo "$name containment marker must exit 75, got $status" >&2
    exit 1
  }
  [[ ! -s "$case_root/stdout" ]] || {
    echo "$name containment marker wrote unexpected stdout" >&2
    exit 1
  }
  grep -Fx 'daily production-day C1 containment marker is present' \
    "$case_root/stderr" >/dev/null
  [[ $(wc -l <"$case_root/stderr") -eq 1 ]]
  [[ ! -e "$case_root/flock.calls" && ! -e "$case_root/auth.called" && \
     ! -e "$case_root/docker.called" ]] || {
    echo "$name containment marker allowed lock, auth, or Docker work" >&2
    exit 1
  }
  [[ ! -e "$case_root/control/daily-run-singleton.lock" && \
     ! -e "$case_root/control/daily-run.lock" ]] || {
    echo "$name containment check created lock files" >&2
    exit 1
  }
}

assert_rejected_marker extra-line <<'EOF'
schemaVersion=reader_summary.daily_delivery_readiness.c1
state=READY
requires=H_GREEN,C0_GREEN,C1_SCAN_TERMINAL_REPAIR_GREEN
activation=reviewed
unexpected=true
EOF

assert_rejected_marker duplicate-state <<'EOF'
schemaVersion=reader_summary.daily_delivery_readiness.c1
state=READY
state=READY
requires=H_GREEN,C0_GREEN,C1_SCAN_TERMINAL_REPAIR_GREEN
activation=reviewed
EOF

assert_rejected_marker contradictory-state <<'EOF'
schemaVersion=reader_summary.daily_delivery_readiness.c1
state=READY
state=BLOCKED
requires=H_GREEN,C0_GREEN,C1_SCAN_TERMINAL_REPAIR_GREEN
activation=reviewed
EOF

assert_rejected_marker tampered-activation <<'EOF'
schemaVersion=reader_summary.daily_delivery_readiness.c1
state=READY
requires=H_GREEN,C0_GREEN,C1_SCAN_TERMINAL_REPAIR_GREEN
activation=forbidden
EOF

assert_rejected_containment containment-requested requested
assert_rejected_containment containment-contained contained
assert_rejected_containment contained-invalid invalid
assert_rejected_containment contained-symlink symlink

canonical_root=$(prepare_case canonical)
write_canonical_readiness "$canonical_root"
if run_check "$canonical_root" >"$canonical_root/check.stdout" \
  2>"$canonical_root/check.stderr"; then
  canonical_check_status=0
else
  canonical_check_status=$?
fi
[[ $canonical_check_status -eq 0 ]]
[[ ! -s "$canonical_root/check.stdout" && ! -s "$canonical_root/check.stderr" ]]
[[ ! -e "$canonical_root/flock.calls" && ! -e "$canonical_root/auth.called" && \
   ! -e "$canonical_root/docker.called" ]] || {
  echo 'read-only readiness check performed operational work' >&2
  exit 1
}
[[ ! -e "$canonical_root/control/daily-run-singleton.lock" && \
   ! -e "$canonical_root/control/daily-run.lock" ]] || {
  echo 'read-only readiness check created lock files' >&2
  exit 1
}
if run_daily "$canonical_root" >"$canonical_root/stdout" 2>"$canonical_root/stderr"; then
  canonical_status=0
else
  canonical_status=$?
fi
[[ $canonical_status -eq 91 ]] || {
  echo "canonical readiness marker was not accepted, got $canonical_status" >&2
  exit 1
}
grep -Fx -- '--broker-pool-job-id social-monitor-production-account-pool-terra-v25-20260804' \
  "$canonical_root/auth.called" >/dev/null
diff -u <(printf '%s\n' '-n 9' '-w 0 8') "$canonical_root/flock.calls"
[[ ! -e "$canonical_root/docker.called" ]] || {
  echo 'Docker ran after the canonical-case auth stop' >&2
  exit 1
}

race_root=$(prepare_case containment-after-singleton)
write_canonical_readiness "$race_root"
cat >"$race_root/flock" <<EOF
#!/usr/bin/env bash
printf '%s\\n' "\$*" >>'$race_root/flock.calls'
if [[ \$1 == -n ]]; then
  printf 'appeared-after-singleton\\n' >'$race_root/control/reader-summary-daily-c1-contained.v1'
fi
EOF
chmod +x "$race_root/flock"
if run_daily "$race_root" >"$race_root/stdout" 2>"$race_root/stderr"; then
  race_status=0
else
  race_status=$?
fi
[[ $race_status -eq 75 ]] || {
  echo "post-singleton containment must exit 75, got $race_status" >&2
  exit 1
}
grep -Fx 'daily production-day C1 containment marker is present' \
  "$race_root/stderr" >/dev/null
diff -u <(printf '%s\n' '-n 9') "$race_root/flock.calls"
[[ ! -e "$race_root/auth.called" && ! -e "$race_root/docker.called" ]] || {
  echo 'post-singleton containment allowed auth or Docker work' >&2
  exit 1
}

printf 'production daily runtime contract test passed\n'
