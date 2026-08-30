#!/usr/bin/env bash

# Sourced by the deploy entrypoint. This is the narrow, fail-closed hook used
# by the authenticated transition controller after its terminal receipts land.

reader_summary_hold_gate_event() { :; }

reader_summary_hold_require_runtime_commit() {
  local target=$1 root backend source_sha ready
  root=$(reader_summary_hold_root) || return
  backend=$(reader_summary_hold_read_regular \
    "$root/control/deploy-state/backend.sha") || return 1
  source_sha=$(reader_summary_hold_read_regular \
    "$root/control/postgres-runtime-current/SOURCE_SHA") || return 1
  ready=$(reader_summary_hold_read_regular \
    "$root/control/postgres-runtime-current/READY") || return 1
  [[ $backend == "$target" && $source_sha == "$target" && \
     $ready == "$target" ]] || {
    printf 'deploy-error: scheduler release requires committed migrations for exact target\n' >&2
    return 1
  }
  reader_summary_hold_gate_event migrations
}

reader_summary_hold_require_backend_health() {
  if declare -F verify_backend_with_retry >/dev/null; then
    verify_backend_with_retry \
      api agent-runtime ingestion-worker intelligence-worker \
      delivery-service event-relay || return 1
  else
    curl -fsS --max-time 15 http://127.0.0.1:13000/ready >/dev/null || return 1
    curl -fsS --max-time 15 -H 'Host: social-monitor.app' \
      http://127.0.0.1:13080/ready >/dev/null || return 1
  fi
  reader_summary_hold_gate_event health
}

reader_summary_hold_verify_exact_model_route() (
  local root rendered
  root=$(reader_summary_hold_root) || return
  rendered=$(mktemp "${TMPDIR:-/tmp}/reader-summary-model-route.XXXXXX") || return
  trap 'rm -f "$rendered"' EXIT
  if declare -p COMPOSE >/dev/null 2>&1; then
    "${COMPOSE[@]}" --profile app --profile daily config --format json > "$rendered" || \
      return 1
  else
    docker compose -p social-monitor-prod \
      --env-file "$root/secrets/production.env" \
      -f "$root/integration/docker-compose.yml" \
      -f "$root/control/compose.production.yml" \
      -f "$root/control/compose.managed-db.yml" \
      -f "$root/control/postgres-runtime-current/compose.postgres-runtime.yml" \
      -f "$root/control/postgres-runtime-current/compose.agent-runtime-model.yml" \
      --profile app --profile daily config --format json > "$rendered" || return 1
  fi
  python3 - "$rendered" <<'PY' || return 1
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    services = json.load(handle).get("services", {})

agent = services.get("agent-runtime", {}).get("environment", {})
daily = services.get("daily-runner", {}).get("environment", {})
expected = {
    "agent-runtime.AGENT_RUNTIME_PROVIDER": (agent, "AGENT_RUNTIME_PROVIDER", "codex"),
    "agent-runtime.AGENT_RUNTIME_MODEL": (agent, "AGENT_RUNTIME_MODEL", "gpt-5.6-sol"),
    "agent-runtime.AGENT_RUNTIME_REASONING_EFFORT": (agent, "AGENT_RUNTIME_REASONING_EFFORT", "high"),
    "daily-runner.READER_SUMMARY_MODEL_PROVIDER": (daily, "READER_SUMMARY_MODEL_PROVIDER", "agent-runtime"),
    "daily-runner.AGENT_RUNTIME_READER_SUMMARY_MODEL": (daily, "AGENT_RUNTIME_READER_SUMMARY_MODEL", "gpt-5.6-sol"),
    "daily-runner.AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT": (daily, "AGENT_RUNTIME_READER_SUMMARY_REASONING_EFFORT", "high"),
}
for label, (environment, key, value) in expected.items():
    if environment.get(key) != value:
        raise SystemExit(f"exact production model route mismatch: {label}")
PY
  reader_summary_hold_gate_event model
)

reader_summary_hold_require_terminal_receipts() {
  local target=$1 root activated consumption authorization expected
  root=$(reader_summary_hold_root) || return
  if declare -F production_transition_read_activation_marker >/dev/null && \
     declare -F production_transition_read_consumption_record >/dev/null && \
     declare -F production_transition_verify_embedded_review >/dev/null && \
     declare -F production_transition_consumption_record >/dev/null; then
    activated=$(production_transition_read_activation_marker) || return 1
    [[ $activated == "$target" ]] || return 1
    authorization=$(production_transition_verify_embedded_review \
      "$target" '' '' allow-expired) || return 1
    expected=$(production_transition_consumption_record complete "$authorization") || return 1
    [[ $(production_transition_read_consumption_record) == "$expected" ]] || return 1
  else
    activated=$(reader_summary_hold_read_regular \
      "$root/control/deploy-state/production-transition-activated.sha") || return 1
    consumption=$(reader_summary_hold_read_regular \
      "$root/control/deploy-state/production-transition-review-consumption.v2") || return 1
    [[ $activated == "$target" && \
       $consumption == version=social-monitor-production-transition-review-consumption-v2$'\n'status=complete$'\n'* && \
       $consumption == *$'\n'"t=$target"$'\n'* ]] || return 1
  fi
  reader_summary_hold_gate_event receipts
}

reader_summary_hold_reconcile_timers() {
  declare -F verify_effective_postgres_daily_topology >/dev/null || return 1
  declare -F reconcile_postgres_runtime_weekly_timer >/dev/null || return 1
  declare -F reconcile_postgres_runtime_rolling_timer >/dev/null || return 1
  verify_effective_postgres_daily_topology || return 1
  reconcile_postgres_runtime_weekly_timer || return 1
  reconcile_postgres_runtime_rolling_timer || return 1
  reader_summary_hold_gate_event release
}

reader_summary_remove_runtime_hold() {
  local target=$1 marker expected actual
  marker=$(reader_summary_runtime_hold_path) || return
  [[ -e $marker || -L $marker ]] || return 0
  expected=$(reader_summary_runtime_hold_record "$target") || return
  actual=$(reader_summary_hold_read_regular "$marker") || return 1
  [[ $actual == "$expected" ]] || return 1
  rm -f "$marker"
  sync -f "$(dirname "$marker")"
}

production_transition_resume_runtime_schedulers() (
  local target=$1 lock
  reader_summary_hold_validate_target "$target" || return 1
  lock=$(reader_summary_hold_lock_path) || return
  exec 6>"$lock"
  flock -x 6 || return 1
  reader_summary_hold_require_runtime_commit "$target" || return 1
  reader_summary_hold_require_backend_health || return 1
  reader_summary_hold_verify_exact_model_route || return 1
  reader_summary_hold_require_terminal_receipts "$target" || return 1
  reader_summary_hold_reconcile_timers || return 1
  reader_summary_remove_runtime_hold "$target"
)
