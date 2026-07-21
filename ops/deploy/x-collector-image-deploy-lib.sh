#!/usr/bin/env bash

# Sourced by social-monitor-production-deploy.sh. Release A installs these
# controls before Release B adds the tracked Dockerfile that they activate.

X_COLLECTOR_DOCKERFILE_RELATIVE_PATH=ops/deploy/production-runtime/x-collector.Dockerfile

x_collector_target_has_tracked_dockerfile() {
  local sha=$1
  git -C "$REPO" cat-file -e \
    "$sha:$X_COLLECTOR_DOCKERFILE_RELATIVE_PATH" 2>/dev/null
}

x_collector_reviewed_dockerfile_digest() {
  local sha=$1
  local entry mode type object path

  entry=$(git -C "$REPO" ls-tree "$sha" -- \
    "$X_COLLECTOR_DOCKERFILE_RELATIVE_PATH") || \
    fail 'target X collector Dockerfile cannot be inspected'
  read -r mode type object path <<< "$entry"
  [[ $mode == 100644 && $type == blob && $object =~ ^[0-9a-f]+$ && \
     $path == "$X_COLLECTOR_DOCKERFILE_RELATIVE_PATH" ]] || \
    fail 'target X collector Dockerfile is not a regular 0644 Git blob'
  git -C "$REPO" show \
    "$sha:$X_COLLECTOR_DOCKERFILE_RELATIVE_PATH" | sha256sum | \
    awk '{print $1}'
}

x_collector_verify_reviewed_dockerfile_source() {
  local sha=$1
  local source=$REPO/$X_COLLECTOR_DOCKERFILE_RELATIVE_PATH
  local repository_root source_real reviewed_digest actual_digest

  [[ -f $source && ! -L $source ]] || \
    fail 'reviewed X collector Dockerfile source is missing or a symlink'
  repository_root=$(readlink -f "$REPO") || \
    fail 'integration repository path cannot be resolved'
  source_real=$(readlink -f "$source") || \
    fail 'reviewed X collector Dockerfile source cannot be resolved'
  [[ $source_real == \
     "$repository_root/$X_COLLECTOR_DOCKERFILE_RELATIVE_PATH" ]] || \
    fail 'reviewed X collector Dockerfile source escapes integration'
  [[ $(stat -c '%a' "$source") == 644 ]] || \
    fail 'reviewed X collector Dockerfile source mode is not 0644'
  reviewed_digest=$(x_collector_reviewed_dockerfile_digest "$sha") || \
    fail 'reviewed X collector Dockerfile digest is unavailable'
  actual_digest=$(sha256sum "$source" | awk '{print $1}') || \
    fail 'reviewed X collector Dockerfile source cannot be hashed'
  [[ $actual_digest == "$reviewed_digest" ]] || \
    fail 'reviewed X collector Dockerfile differs from the target Git blob'
}

x_collector_verify_installed_dockerfile() {
  local sha=$1
  local destination=$CONTROL/x-collector.Dockerfile
  local reviewed_digest actual_digest

  [[ -f $destination && ! -L $destination ]] || \
    fail 'installed X collector Dockerfile is missing or a symlink'
  [[ $(stat -c '%a' "$destination") == 644 ]] || \
    fail 'installed X collector Dockerfile mode is not 0644'
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
    [[ $(stat -c '%U:%G' "$destination") == root:root ]] || \
      fail 'installed X collector Dockerfile is not root-owned'
  fi
  reviewed_digest=$(x_collector_reviewed_dockerfile_digest "$sha") || \
    fail 'reviewed X collector Dockerfile digest is unavailable'
  actual_digest=$(sha256sum "$destination" | awk '{print $1}') || \
    fail 'installed X collector Dockerfile cannot be hashed'
  [[ $actual_digest == "$reviewed_digest" ]] || \
    fail 'installed X collector Dockerfile differs from the target Git blob'
}

sync_x_collector_dockerfile() (
  local sha=$1
  local source=$REPO/$X_COLLECTOR_DOCKERFILE_RELATIVE_PATH
  local destination=$CONTROL/x-collector.Dockerfile
  local next=$destination.next.$$

  x_collector_verify_reviewed_dockerfile_source "$sha"
  [[ ! -e $next && ! -L $next ]] || \
    fail 'temporary X collector Dockerfile destination already exists'
  trap 'rm -f -- "$next"' EXIT
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]]; then
    install -m 0644 "$source" "$next"
  else
    install -m 0644 -o root -g root "$source" "$next"
  fi
  [[ -f $next && ! -L $next ]] || \
    fail 'temporary X collector Dockerfile is not a regular file'
  mv -Tf "$next" "$destination"
  x_collector_verify_installed_dockerfile "$sha"
)

x_collector_build_candidate() {
  local sha=$1
  local output_variable=$2
  local image_ref image_id revision

  validate_sha "$sha"
  [[ $output_variable =~ ^[a-z_][a-z0-9_]*$ ]] || \
    fail 'X collector candidate output variable is invalid'
  x_collector_verify_installed_dockerfile "$sha"
  "${COMPOSE[@]}" --profile app build \
    --build-arg "SOCIAL_MONITOR_RELEASE_SHA=$sha" x-collector
  image_ref=$(compose_image_name x-collector)
  image_id=$(docker image inspect "$image_ref" --format '{{.Id}}') || \
    fail 'built X collector candidate image cannot be resolved'
  [[ $image_id =~ ^sha256:[0-9a-f]{64}$ ]] || \
    fail 'built X collector candidate image ID is invalid'
  revision=$(docker image inspect "$image_id" \
    --format '{{index .Config.Labels "org.opencontainers.image.revision"}}') || \
    fail 'built X collector candidate revision cannot be inspected'
  [[ -n $revision && $revision == "$sha" ]] || \
    fail 'built X collector candidate revision is missing or mismatched'
  printf -v "$output_variable" '%s' "$image_id"
}

x_collector_verify_running_candidate() {
  local sha=$1
  local expected_image_id=$2
  local container_id running_image_id revision
  local -a container_ids

  validate_sha "$sha"
  [[ $expected_image_id =~ ^sha256:[0-9a-f]{64}$ ]] || \
    fail 'expected X collector candidate image ID is invalid'
  mapfile -t container_ids < <(
    "${COMPOSE[@]}" --profile app ps -q x-collector
  )
  ((${#container_ids[@]} == 1)) || \
    fail 'running X collector container is not unique'
  container_id=${container_ids[0]}
  [[ -n $container_id ]] || fail 'running X collector container is unavailable'
  running_image_id=$(docker inspect "$container_id" --format '{{.Image}}') || \
    fail 'running X collector image ID cannot be inspected'
  [[ $running_image_id == "$expected_image_id" ]] || \
    fail 'running X collector image ID does not match the built candidate'
  revision=$(docker image inspect "$running_image_id" \
    --format '{{index .Config.Labels "org.opencontainers.image.revision"}}') || \
    fail 'running X collector revision cannot be inspected'
  [[ -n $revision && $revision == "$sha" ]] || \
    fail 'running X collector revision is missing or mismatched'
}
