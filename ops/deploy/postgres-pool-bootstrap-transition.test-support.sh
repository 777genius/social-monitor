#!/usr/bin/env bash

report_error() {
  local status=$1
  local line=$2
  local command=$3
  printf 'bootstrap-transition-error: phase=%s line=%s status=%s command=%q\n' \
    "$TEST_PHASE" "$line" "$status" "$command" >&2
}

write_target_quorum_health_fixture() {
  local repository=$1
  local script=$repository/ops/deploy/rabbitmq-quorum-health.sh
  local recovery_script=$repository/ops/deploy/rabbitmq-quorum-recovery.sh

  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'rabbitmq_quorum_health_probe() { :; }' > "$script"
  chmod 0755 "$script"
  printf '%s\n' \
    '#!/usr/bin/env bash' \
    'rabbitmq_quorum_recovery_probe() { :; }' > "$recovery_script"
  chmod 0755 "$recovery_script"
}
