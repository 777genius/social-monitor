#!/usr/bin/env bash

# Sourced by social-monitor-production-deploy.sh after PROJECT, COMPOSE, and
# fail are defined.

cleanup_stopped_project_containers() {
  local status
  local -a container_ids=()
  for status in created exited dead; do
    while IFS= read -r container_id; do
      [[ -n $container_id ]] && container_ids+=("$container_id")
    done < <(
      docker ps -aq \
        --filter "label=com.docker.compose.project=$PROJECT" \
        --filter "status=$status"
    )
  done
  ((${#container_ids[@]} > 0)) || return 0
  docker rm -f "${container_ids[@]}" >/dev/null
}

print_docker_disk_report() {
  local path
  printf 'docker-disk-report-begin\n'
  df -h / /var/lib/docker 2>/dev/null || df -h /
  df -ih / /var/lib/docker 2>/dev/null || true
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
    for path in /var /var/data /var/data/social-monitor /var/lib/docker /var/log; do
      [[ -d $path && ! -L $path ]] || continue
      printf 'disk-usage-path=%s\n' "$path"
      timeout 30 du -xhd1 "$path" 2>/dev/null | sort -h | tail -n 40 || true
    done
  fi
  if ! command -v docker >/dev/null 2>&1; then
    printf 'docker=unavailable\n'
    printf 'docker-disk-report-end\n'
    return 0
  fi
  docker system df || true
  docker ps -a \
    --filter "label=com.docker.compose.project=$PROJECT" \
    --format 'project-container id={{.ID}} service={{.Label "com.docker.compose.service"}} status={{.Status}} name={{.Names}}' || true
  docker image ls \
    --format 'image repository={{.Repository}} tag={{.Tag}} id={{.ID}} size={{.Size}}' | \
    awk '$0 ~ /social-monitor|<none>/ {print}' | head -n 200 || true
  printf 'docker-disk-report-end\n'
}

cleanup_project_docker_storage() {
  print_docker_disk_report
  cleanup_stopped_project_containers || \
    fail 'stopped project container cleanup failed'
  backend_image_rescue_cleanup_abandoned_partials || \
    fail 'abandoned backend image rescue cleanup failed'
  print_docker_disk_report
}

stop_and_remove_database_services() {
  local service
  local -a database_services=() container_ids remaining_container_ids
  for service in "$@"; do
    case $service in
      api|ingestion-worker|intelligence-worker|delivery-service|event-relay)
        database_services+=("$service")
        ;;
    esac
  done
  ((${#database_services[@]} > 0)) || return 0
  for service in "${database_services[@]}"; do
    mapfile -t container_ids < <(
      docker ps -aq \
        --filter "label=com.docker.compose.project=$PROJECT" \
        --filter "label=com.docker.compose.service=$service"
    )
    if ((${#container_ids[@]} > 0)); then
      docker stop -t 120 "${container_ids[@]}" || return 1
      docker rm -f "${container_ids[@]}" || return 1
    fi
    mapfile -t remaining_container_ids < <(
      docker ps -aq \
        --filter "label=com.docker.compose.project=$PROJECT" \
        --filter "label=com.docker.compose.service=$service"
    )
    ((${#remaining_container_ids[@]} == 0)) || return 1
  done
}
