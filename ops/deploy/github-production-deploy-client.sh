#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin

ZERO_SHA=0000000000000000000000000000000000000000
POSTGRES_POOL_BOOTSTRAP_VERSION=postgres-pool-v1
SSH_DIRECTORY=${DEPLOY_SSH_DIRECTORY:-${HOME:?HOME is required}/.ssh}
SSH_KEY_PATH=${DEPLOY_SSH_KEY_PATH:-$SSH_DIRECTORY/social-monitor-production}
SSH_KNOWN_HOSTS_PATH=${DEPLOY_SSH_KNOWN_HOSTS_PATH:-$SSH_DIRECTORY/known_hosts}
SSH_BIN=${DEPLOY_SSH_BIN:-ssh}
KNOWN_BACKEND_SOAK_SECONDS=300
MINIMUM_RECONCILE_WINDOW_SECONDS=600
DEFAULT_RECONCILE_ATTEMPTS=45
DEFAULT_RECONCILE_INTERVAL_SECONDS=15
DEFAULT_RECONCILE_WINDOW_SECONDS=$(((DEFAULT_RECONCILE_ATTEMPTS - 1) * DEFAULT_RECONCILE_INTERVAL_SECONDS))
DAILY_CANONICAL_RECOVERY_CONFIRMATION=reader-summary-daily-canonical-recovery-v4
RECONCILE_ATTEMPTS=${DEPLOY_RECONCILE_ATTEMPTS:-$DEFAULT_RECONCILE_ATTEMPTS}
RECONCILE_INTERVAL_SECONDS=${DEPLOY_RECONCILE_INTERVAL_SECONDS:-$DEFAULT_RECONCILE_INTERVAL_SECONDS}
PLAN_POSTGRES_POOL_REPAIR=false

SSH_OPTIONS=(
  -i "$SSH_KEY_PATH"
  -o BatchMode=yes
  -o IdentitiesOnly=yes
  -o ConnectTimeout=30
  -o ServerAliveInterval=15
  # Ten minutes of missed replies safely exceeds the five-minute backend soak.
  -o ServerAliveCountMax=40
  -o StrictHostKeyChecking=yes
  -o "UserKnownHostsFile=$SSH_KNOWN_HOSTS_PATH"
)

fail() {
  printf 'deploy-client-error: %s\n' "$*" >&2
  exit 1
}

validate_client_defaults() {
  ((DEFAULT_RECONCILE_WINDOW_SECONDS >= MINIMUM_RECONCILE_WINDOW_SECONDS)) || \
    fail 'default reconciliation window is shorter than ten minutes'
  ((DEFAULT_RECONCILE_WINDOW_SECONDS > KNOWN_BACKEND_SOAK_SECONDS)) || \
    fail 'default reconciliation window does not cover the backend soak'
}

validate_sha() {
  [[ ${1:-} =~ ^[0-9a-f]{40}$ ]] || fail 'target must be a full lowercase commit SHA'
}

valid_deploy_host() {
  local host=$1 label
  local -a labels
  [[ ${#host} -le 253 && $host != *..* ]] || return 1
  IFS=. read -r -a labels <<< "$host"
  for label in "${labels[@]}"; do
    [[ ${#label} -le 63 && \
       $label =~ ^[A-Za-z0-9]([A-Za-z0-9-]*[A-Za-z0-9])?$ ]] || return 1
  done
}

validate_remote_environment() {
  [[ -n ${DEPLOY_HOST:-} ]] || fail 'DEPLOY_HOST is required'
  [[ -n ${DEPLOY_USER:-} ]] || fail 'DEPLOY_USER is required'
  valid_deploy_host "$DEPLOY_HOST" || fail 'DEPLOY_HOST is invalid'
  [[ ${#DEPLOY_USER} -le 32 && \
     $DEPLOY_USER =~ ^[A-Za-z_][A-Za-z0-9._-]*$ ]] || fail 'DEPLOY_USER is invalid'
  [[ $RECONCILE_ATTEMPTS =~ ^[1-9][0-9]*$ ]] || fail 'reconciliation attempts must be positive'
  [[ $RECONCILE_INTERVAL_SECONDS =~ ^[0-9]+$ ]] || fail 'reconciliation interval must be non-negative'
}

configure_ssh() {
  [[ -n ${DEPLOY_KEY:-} ]] || fail 'DEPLOY_KEY is required'
  [[ -n ${KNOWN_HOSTS:-} ]] || fail 'KNOWN_HOSTS is required'
  install -d -m 0700 "$SSH_DIRECTORY"
  printf '%s\n' "$DEPLOY_KEY" > "$SSH_KEY_PATH"
  chmod 0600 "$SSH_KEY_PATH"
  printf '%s\n' "$KNOWN_HOSTS" > "$SSH_KNOWN_HOSTS_PATH"
  chmod 0600 "$SSH_KNOWN_HOSTS_PATH"
}

remove_ssh() {
  rm -f "$SSH_KEY_PATH" "$SSH_KNOWN_HOSTS_PATH"
}

run_remote() {
  local action=$1
  local sha=$2
  local confirmation=${3:-}
  if (($# == 3)); then
    "$SSH_BIN" "${SSH_OPTIONS[@]}" \
      -- "$DEPLOY_USER@$DEPLOY_HOST" "$action $sha $confirmation"
    return
  fi
  "$SSH_BIN" "${SSH_OPTIONS[@]}" \
    -- "$DEPLOY_USER@$DEPLOY_HOST" "$action $sha"
}

validate_maintenance_action() {
  case ${1:-} in
    disk-report|project-disk-cleanup|reader-summary-recover-missing-days|reader-summary-weekly-run|reader-summary-daily-canonical-recovery-v4) ;;
    *) fail 'maintenance action must be disk-report, project-disk-cleanup, reader-summary-recover-missing-days, reader-summary-weekly-run, or reader-summary-daily-canonical-recovery-v4' ;;
  esac
}

validate_daily_canonical_recovery_confirmation() {
  [[ ${1:-} == "$DAILY_CANONICAL_RECOVERY_CONFIRMATION" ]] || \
    fail 'daily canonical recovery requires its exact confirmation token'
}

run_maintenance() {
  local sha=$1
  local maintenance_action=$2
  local confirmation=${3:-}
  validate_sha "$sha"
  validate_maintenance_action "$maintenance_action"
  validate_remote_environment
  if [[ $maintenance_action == reader-summary-daily-canonical-recovery-v4 ]]; then
    [[ $# == 3 ]] || fail 'daily canonical recovery requires a confirmation token'
    validate_daily_canonical_recovery_confirmation "$confirmation"
    run_remote "$maintenance_action" "$sha" "$confirmation"
    return
  fi
  [[ $# == 2 ]] || fail 'this maintenance action does not accept a confirmation token'
  run_remote "$maintenance_action" "$sha"
}

plan_parse_error() {
  printf 'deploy-client-error: invalid deploy plan: %s\n' "$*" >&2
  return 1
}

parse_plan() {
  local raw=$1
  local key value extra required
  local -A values=()

  while IFS='=' read -r key value extra; do
    [[ -n $key && -n $value && -z ${extra:-} ]] || \
      plan_parse_error 'every line must contain exactly one key and value' || return
    case $key in
      frontend|backend|backend_base|control|x_collector|postgres_pool_bootstrap|postgres_pool_bootstrap_sha) ;;
      *) plan_parse_error "unexpected key $key" || return ;;
    esac
    [[ -z ${values[$key]+present} ]] || plan_parse_error "duplicate key $key" || return
    values[$key]=$value
  done <<< "$raw"

  for required in frontend backend backend_base control x_collector; do
    [[ -n ${values[$required]+present} ]] || plan_parse_error "missing key $required" || return
  done
  for required in frontend backend control x_collector; do
    [[ ${values[$required]} =~ ^(true|false)$ ]] || \
      plan_parse_error "$required must be true or false" || return
  done
  [[ ${values[backend_base]} =~ ^[0-9a-f]{40}$ ]] || \
    plan_parse_error 'backend_base must be a full lowercase commit SHA' || return

  if [[ -z ${values[postgres_pool_bootstrap]+present} && \
        -z ${values[postgres_pool_bootstrap_sha]+present} ]]; then
    values[postgres_pool_bootstrap]=uninstalled
    values[postgres_pool_bootstrap_sha]=$ZERO_SHA
  elif [[ -z ${values[postgres_pool_bootstrap]+present} || \
          -z ${values[postgres_pool_bootstrap_sha]+present} ]]; then
    plan_parse_error 'bootstrap status and marker must appear together' || return
  fi
  [[ ${values[postgres_pool_bootstrap]} =~ ^(uninstalled|postgres-pool-v1)$ ]] || \
    plan_parse_error 'bootstrap status is unsupported' || return
  [[ ${values[postgres_pool_bootstrap_sha]} =~ ^[0-9a-f]{40}$ ]] || \
    plan_parse_error 'bootstrap marker must be a full lowercase commit SHA' || return
  if [[ ${values[postgres_pool_bootstrap]} == uninstalled ]]; then
    [[ ${values[postgres_pool_bootstrap_sha]} == "$ZERO_SHA" ]] || \
      plan_parse_error 'uninstalled bootstrap must use the zero marker' || return
  else
    [[ ${values[postgres_pool_bootstrap_sha]} != "$ZERO_SHA" ]] || \
      plan_parse_error 'installed bootstrap marker must be non-zero' || return
  fi

  PLAN_FRONTEND=${values[frontend]}
  PLAN_BACKEND=${values[backend]}
  PLAN_BACKEND_BASE=${values[backend_base]}
  PLAN_CONTROL=${values[control]}
  PLAN_X_COLLECTOR=${values[x_collector]}
  PLAN_POSTGRES_POOL_BOOTSTRAP=${values[postgres_pool_bootstrap]}
  PLAN_POSTGRES_POOL_BOOTSTRAP_SHA=${values[postgres_pool_bootstrap_sha]}
}

print_plan() {
  printf 'frontend=%s\nbackend=%s\nbackend_base=%s\ncontrol=%s\nx_collector=%s\npostgres_pool_bootstrap=%s\npostgres_pool_bootstrap_sha=%s\npostgres_pool_repair=%s\n' \
    "$PLAN_FRONTEND" "$PLAN_BACKEND" "$PLAN_BACKEND_BASE" "$PLAN_CONTROL" \
    "$PLAN_X_COLLECTOR" "$PLAN_POSTGRES_POOL_BOOTSTRAP" \
    "$PLAN_POSTGRES_POOL_BOOTSTRAP_SHA" "$PLAN_POSTGRES_POOL_REPAIR"
}

capture_plan() {
  local sha=$1
  local output status
  if output=$(run_remote plan "$sha"); then
    status=0
  else
    status=$?
  fi
  ((status == 0)) || return "$status"
  parse_plan "$output" || return 65
}

write_plan_outputs() {
  local output_path=${GITHUB_OUTPUT:-}
  [[ -n $output_path ]] || fail 'GITHUB_OUTPUT is required for plan'
  {
    printf 'frontend=%s\n' "$PLAN_FRONTEND"
    printf 'backend=%s\n' "$PLAN_BACKEND"
    printf 'backend_base=%s\n' "$PLAN_BACKEND_BASE"
    printf 'control=%s\n' "$PLAN_CONTROL"
    printf 'x_collector=%s\n' "$PLAN_X_COLLECTOR"
    printf 'postgres_pool_bootstrap=%s\n' "$PLAN_POSTGRES_POOL_BOOTSTRAP"
    printf 'postgres_pool_bootstrap_sha=%s\n' "$PLAN_POSTGRES_POOL_BOOTSTRAP_SHA"
    printf 'postgres_pool_repair=%s\n' "$PLAN_POSTGRES_POOL_REPAIR"
  } >> "$output_path"
}

repair_missing_postgres_pool_bootstrap() {
  local sha=$1
  local durable_backend_base=$PLAN_BACKEND_BASE
  local status

  [[ $durable_backend_base != "$ZERO_SHA" ]] || \
    fail 'missing PostgreSQL bootstrap marker has no valid backend base'
  printf 'deploy-client: invoking PostgreSQL bootstrap repair through deploy\n' >&2
  # Remote stdout is intentionally non-authoritative. Only the recaptured
  # ordinary plan below may attest that control and marker committed together.
  if run_remote deploy "$sha" >/dev/null; then
    status=0
  else
    status=$?
  fi
  if ((status == 255)); then
    printf 'deploy-client: SSH disconnected during bootstrap repair; recapturing the ordinary plan\n' >&2
  elif ((status != 0)); then
    fail "legacy PostgreSQL bootstrap repair failed with status $status"
  fi

  if capture_plan "$sha"; then
    status=0
  else
    status=$?
  fi
  ((status == 0)) || fail "post-bootstrap plan failed with status $status"
  [[ $PLAN_POSTGRES_POOL_BOOTSTRAP == "$POSTGRES_POOL_BOOTSTRAP_VERSION" && \
     $PLAN_POSTGRES_POOL_BOOTSTRAP_SHA == "$sha" ]] || \
    fail 'post-bootstrap plan is not installed at the target SHA'
  [[ $PLAN_BACKEND_BASE == "$durable_backend_base" ]] || \
    fail 'durable backend base changed during atomic PostgreSQL bootstrap'
  [[ $PLAN_BACKEND == true ]] || \
    fail 'backend is no longer pending after atomic PostgreSQL bootstrap'
  PLAN_POSTGRES_POOL_REPAIR=true
}

read_initial_plan() {
  local sha=$1
  local status
  PLAN_POSTGRES_POOL_REPAIR=false
  if capture_plan "$sha"; then
    status=0
  else
    status=$?
  fi
  ((status == 0)) || fail "plan command failed with status $status"
  if [[ $PLAN_BACKEND == true && \
        $PLAN_POSTGRES_POOL_BOOTSTRAP != "$POSTGRES_POOL_BOOTSTRAP_VERSION" ]]; then
    repair_missing_postgres_pool_bootstrap "$sha"
  fi
  print_plan
  write_plan_outputs
}

plan_is_fully_reconciled() {
  [[ $PLAN_FRONTEND == false && $PLAN_BACKEND == false && \
     $PLAN_CONTROL == false && $PLAN_X_COLLECTOR == false && \
     $PLAN_POSTGRES_POOL_BOOTSTRAP == "$POSTGRES_POOL_BOOTSTRAP_VERSION" && \
     $PLAN_POSTGRES_POOL_BOOTSTRAP_SHA != "$ZERO_SHA" && \
     $PLAN_BACKEND_BASE != "$ZERO_SHA" ]]
}

reconcile_deploy_plan() {
  local sha=$1
  local attempt status
  printf 'deploy-client: reconciling the target plan without rerunning deploy\n' >&2
  for ((attempt = 1; attempt <= RECONCILE_ATTEMPTS; attempt += 1)); do
    if capture_plan "$sha"; then
      status=0
    else
      status=$?
    fi
    if ((status == 0)); then
      print_plan
      if plan_is_fully_reconciled; then
        printf 'deploy-client: target plan is fully reconciled\n' >&2
        return 0
      fi
      printf 'deploy-client: reconciliation attempt %d remains pending or partial\n' "$attempt" >&2
    elif ((status == 255)); then
      printf 'deploy-client: reconciliation attempt %d also lost SSH transport\n' "$attempt" >&2
    else
      fail "reconciliation plan failed with status $status"
    fi
    if ((attempt < RECONCILE_ATTEMPTS)); then
      sleep "$RECONCILE_INTERVAL_SECONDS"
    fi
  done
  fail "target plan did not reconcile within $RECONCILE_ATTEMPTS attempts"
}

deploy_once() {
  local sha=$1
  local status
  if run_remote deploy "$sha"; then
    status=0
  else
    status=$?
  fi
  ((status == 0 || status == 255)) || return "$status"
  if ((status == 255)); then
    printf 'deploy-client: SSH disconnected after deploy; the deploy will not be rerun\n' >&2
  fi
  reconcile_deploy_plan "$sha"
}

deploy_release() {
  local sha=$1
  local status
  deploy_once "$sha" || {
    status=$?
    fail "deploy command failed with non-transport status $status"
  }
}

upload_frontend() {
  local sha=$1
  local archive=${2:-}
  [[ -n $archive && -s $archive ]] || fail 'frontend archive is missing or empty'
  run_remote upload "$sha" < "$archive"
}

validate_client_defaults
[[ ${BASH_SOURCE[0]} == "$0" ]] || return 0

action=${1:-}
case $action in
  configure)
    [[ $# == 1 ]] || fail 'configure takes no arguments'
    configure_ssh
    ;;
  cleanup)
    [[ $# == 1 ]] || fail 'cleanup takes no arguments'
    remove_ssh
    ;;
  plan)
    [[ $# == 2 ]] || fail 'plan requires a target SHA'
    validate_sha "$2"
    validate_remote_environment
    read_initial_plan "$2"
    ;;
  upload)
    [[ $# == 3 ]] || fail 'upload requires a target SHA and archive'
    validate_sha "$2"
    validate_remote_environment
    upload_frontend "$2" "$3"
    ;;
  deploy)
    [[ $# == 2 ]] || fail 'deploy requires a target SHA'
    validate_sha "$2"
    validate_remote_environment
    deploy_release "$2"
    ;;
  maintenance)
    [[ $# == 3 || $# == 4 ]] || fail 'maintenance requires a target SHA, action, and optional confirmation'
    if (($# == 4)); then
      run_maintenance "$2" "$3" "$4"
    else
      run_maintenance "$2" "$3"
    fi
    ;;
  *) fail 'allowed commands: configure, cleanup, plan, upload, deploy, maintenance' ;;
esac
