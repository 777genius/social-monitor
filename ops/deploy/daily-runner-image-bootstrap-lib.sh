#!/usr/bin/env bash

# Sourced by social-monitor-production-deploy.sh. This narrow bridge rebuilds
# only an absent one-shot daily-runner image before the ordinary rescue phase.

DAILY_RUNNER_BOOTSTRAP_DOCKERFILE_SHA256=8ec51a5215f00c9b7c09a664ed908c4358698974cd864fbeeddf90b91110fd93
DAILY_RUNNER_BOOTSTRAP_MAX_ARCHIVE_MEMBERS=20000
DAILY_RUNNER_BOOTSTRAP_MAX_EXPANDED_BYTES=1073741824
DAILY_RUNNER_BOOTSTRAP_CONFIG_INSPECT_ATTEMPTS=5
# The dollar expression is part of the reviewed image command JSON.
# shellcheck disable=SC2016
DAILY_RUNNER_BOOTSTRAP_LEGACY_IMAGE_CONFIG='["docker-entrypoint.sh"]|["sh","-c","case \"$SERVICE\" in api) exec node dist/apps/api-gateway/src/main.js ;; agent-runtime) exec node dist/apps/agent-runtime/src/main.js ;; ingestion) exec node dist/apps/ingestion-worker/src/main.js ;; intelligence) exec node dist/apps/intelligence-worker/src/main.js ;; delivery) exec node dist/apps/delivery-service/src/main.js ;; event-relay) exec node dist/apps/event-relay/src/main.js ;; *) echo \"Unknown service: $SERVICE\" >&2; exit 64 ;; esac"]|"/app"|"node"|null'
DAILY_RUNNER_BOOTSTRAP_API_IMAGE_CONFIG='["/usr/local/bin/docker-entrypoint.sh"]|["/usr/local/bin/node","dist/apps/api-gateway/src/main.js"]|"/app"|"node"|null'
DAILY_RUNNER_BOOTSTRAP_INTELLIGENCE_IMAGE_CONFIG='["/usr/local/bin/docker-entrypoint.sh"]|["/usr/local/bin/node","dist/apps/intelligence-worker/src/main.js"]|"/app"|"node"|null'
if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} == 1 ]]; then
  DAILY_RUNNER_BOOTSTRAP_TMP_ROOT=${SOCIAL_MONITOR_DAILY_RUNNER_BOOTSTRAP_TMP_ROOT:-/tmp}
else
  DAILY_RUNNER_BOOTSTRAP_TMP_ROOT=/tmp
  unset SOCIAL_MONITOR_DAILY_RUNNER_BOOTSTRAP_TMP_ROOT
fi

daily_runner_bootstrap_read_exact_sha() {
  local path=$1
  local description=$2
  local value extra

  [[ -f $path && ! -L $path ]] || \
    fail "$description is not a regular non-symlink file"
  {
    IFS= read -r value || [[ -n $value ]]
    ! IFS= read -r extra
  } < "$path" || fail "$description is not exactly one line"
  [[ $value =~ ^[0-9a-f]{40}$ ]] || fail "$description is not a full SHA"
  printf '%s\n' "$value"
}

daily_runner_bootstrap_image_config_allowed() {
  local config=$1
  local service=$2

  [[ $config == "$DAILY_RUNNER_BOOTSTRAP_LEGACY_IMAGE_CONFIG" ]] && return 0
  case $service in
    api)
      [[ $config == "$DAILY_RUNNER_BOOTSTRAP_API_IMAGE_CONFIG" ]]
      ;;
    intelligence-worker)
      [[ $config == "$DAILY_RUNNER_BOOTSTRAP_INTELLIGENCE_IMAGE_CONFIG" ]]
      ;;
    *)
      return 1
      ;;
  esac
}

daily_runner_bootstrap_verify_runtime_marker() {
  local previous_sha=$1
  local state_real marker_real releases_real runtime_real ready_sha

  [[ -d $STATE && ! -L $STATE ]] || \
    fail 'deploy state is not a regular directory for daily-runner bootstrap'
  state_real=$(readlink -f "$STATE") || \
    fail 'deploy state path cannot be resolved for daily-runner bootstrap'
  marker_real=$(readlink -f "$STATE/backend.sha") || \
    fail 'backend marker cannot be resolved for daily-runner bootstrap'
  [[ $marker_real == "$state_real/backend.sha" ]] || \
    fail 'backend marker escapes deploy state'
  [[ $(daily_runner_bootstrap_read_exact_sha \
    "$STATE/backend.sha" 'backend marker') == "$previous_sha" ]] || \
    fail 'backend marker changed during daily-runner bootstrap'

  [[ -d $POSTGRES_RUNTIME_RELEASES && ! -L $POSTGRES_RUNTIME_RELEASES ]] || \
    fail 'PostgreSQL runtime releases path is not a regular directory'
  [[ -L $POSTGRES_RUNTIME_CURRENT ]] || \
    fail 'PostgreSQL runtime current path is not an immutable release symlink'
  releases_real=$(readlink -f "$POSTGRES_RUNTIME_RELEASES") || \
    fail 'PostgreSQL runtime releases path cannot be resolved'
  runtime_real=$(readlink -f "$POSTGRES_RUNTIME_CURRENT") || \
    fail 'PostgreSQL runtime current release cannot be resolved'
  [[ -d $runtime_real && ! -L $runtime_real && \
     $runtime_real == "$releases_real/"* ]] || \
    fail 'PostgreSQL runtime current release escapes immutable releases'
  ready_sha=$(daily_runner_bootstrap_read_exact_sha \
    "$runtime_real/READY" 'PostgreSQL runtime READY marker') || \
    fail 'PostgreSQL runtime READY marker cannot be read'
  [[ $ready_sha == "$previous_sha" ]] || \
    fail 'backend marker and PostgreSQL runtime READY do not match'
}

daily_runner_bootstrap_verify_git_release() {
  local previous_sha=$1
  local target_sha=$2
  local head object_type origin_main repository_real status

  [[ $previous_sha =~ ^[0-9a-f]{40}$ && $target_sha =~ ^[0-9a-f]{40}$ ]] || \
    fail 'daily-runner bootstrap release markers are invalid'
  [[ -d $REPO && ! -L $REPO ]] || \
    fail 'integration repository is not a regular directory'
  repository_real=$(readlink -f "$REPO") || \
    fail 'integration repository cannot be resolved'
  [[ $repository_real == "$REPO" ]] || \
    fail 'integration repository path is not canonical'
  status=$(git -C "$repository_real" status --porcelain --untracked-files=all) || \
    fail 'integration worktree cannot be inventoried'
  [[ -z $status ]] || fail 'integration worktree is dirty'
  head=$(git -C "$repository_real" rev-parse HEAD) || \
    fail 'integration HEAD cannot be resolved'
  [[ $head == "$target_sha" ]] || \
    fail 'integration HEAD does not match the deployment target'
  object_type=$(git -C "$repository_real" cat-file -t "$previous_sha" \
    2>/dev/null) || fail 'previous backend commit is unavailable'
  [[ $object_type == commit ]] || fail 'previous backend marker is not a commit'
  object_type=$(git -C "$repository_real" cat-file -t "$target_sha" \
    2>/dev/null) || fail 'deployment target commit is unavailable'
  [[ $object_type == commit ]] || fail 'deployment target is not a commit'
  origin_main=$(git -C "$repository_real" rev-parse origin/main 2>/dev/null) || \
    fail 'trusted origin/main is unavailable'
  [[ $origin_main =~ ^[0-9a-f]{40}$ ]] || \
    fail 'trusted origin/main is invalid'
  git -C "$repository_real" merge-base --is-ancestor \
    "$previous_sha" "$target_sha" || \
    fail 'previous backend commit is not an ancestor of the deployment target'
  git -C "$repository_real" merge-base --is-ancestor \
    "$target_sha" "$origin_main" || \
    fail 'deployment target is not trusted by origin/main'
}

daily_runner_bootstrap_verify_release() {
  daily_runner_bootstrap_verify_runtime_marker "$1"
  daily_runner_bootstrap_verify_git_release "$1" "$2"
}

daily_runner_bootstrap_create_archive() {
  git -C "$REPO" archive --format=tar --output="$2" "$1"
}

daily_runner_bootstrap_extract_archive() {
  local archive=$1
  local context=$2

  [[ -f $archive && ! -L $archive && -s $archive ]] || \
    fail 'historical daily-runner archive is not a regular non-empty file'
  [[ -d $context && ! -L $context ]] || \
    fail 'historical daily-runner context is not a regular directory'
  python3 - "$archive" "$context" \
    "$DAILY_RUNNER_BOOTSTRAP_MAX_ARCHIVE_MEMBERS" \
    "$DAILY_RUNNER_BOOTSTRAP_MAX_EXPANDED_BYTES" <<'PY'
import os
import pathlib
import sys
import tarfile

archive_path, context_path, max_members_text, max_bytes_text = sys.argv[1:]
root = pathlib.Path(context_path)
max_members = int(max_members_text)
max_bytes = int(max_bytes_text)
seen: set[str] = set()
expanded_bytes = 0

with tarfile.open(archive_path, mode="r:") as archive:
    members = archive.getmembers()
    if not members or len(members) > max_members:
        raise SystemExit("historical archive member count is invalid")
    for member in members:
        name = member.name
        path = pathlib.PurePosixPath(name)
        expanded_bytes += member.size
        valid_mode = (
            member.isdir() and member.mode in {0o755, 0o775}
        ) or (
            member.isfile() and member.mode in {0o644, 0o664, 0o755, 0o775}
        )
        if (
            not name
            or name in seen
            or path.as_posix() != name
            or path.is_absolute()
            or ".." in path.parts
            or "\\" in name
            or any(ord(character) < 32 or ord(character) == 127 for character in name)
            or not valid_mode
            or expanded_bytes > max_bytes
        ):
            raise SystemExit("historical archive contains an unsafe entry")
        seen.add(name)

    for member in members:
        destination = root.joinpath(*pathlib.PurePosixPath(member.name).parts)
        if member.isdir():
            destination.mkdir(mode=0o755, parents=True, exist_ok=False)
            continue
        destination.parent.mkdir(mode=0o755, parents=True, exist_ok=True)
        source = archive.extractfile(member)
        if source is None:
            raise SystemExit("historical archive file content is unavailable")
        descriptor = os.open(
            destination,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | getattr(os, "O_NOFOLLOW", 0),
            0o755 if member.mode & 0o111 else 0o644,
        )
        with source, os.fdopen(descriptor, "wb") as output:
            while chunk := source.read(1024 * 1024):
                output.write(chunk)
PY
}

daily_runner_bootstrap_verify_control_dockerfile() {
  local dockerfile=$CONTROL/daily-runner.Dockerfile
  local control_real dockerfile_real digest

  [[ -d $CONTROL && ! -L $CONTROL ]] || \
    fail 'control path is not a regular directory'
  [[ -f $dockerfile && ! -L $dockerfile ]] || \
    fail 'daily-runner Dockerfile is not a regular non-symlink file'
  control_real=$(readlink -f "$CONTROL") || \
    fail 'control path cannot be resolved for daily-runner bootstrap'
  dockerfile_real=$(readlink -f "$dockerfile") || \
    fail 'daily-runner Dockerfile cannot be resolved'
  [[ $dockerfile_real == "$control_real/daily-runner.Dockerfile" ]] || \
    fail 'daily-runner Dockerfile escapes control'
  [[ $(stat -c '%a' "$dockerfile") == 644 ]] || \
    fail 'daily-runner Dockerfile mode is not 0644'
  if [[ ${SOCIAL_MONITOR_DEPLOY_TEST_MODE:-} != 1 ]]; then
    [[ $(stat -c '%U:%G' "$dockerfile") == root:root ]] || \
      fail 'daily-runner Dockerfile is not root-owned'
  fi
  digest=$(sha256sum "$dockerfile" | awk '{print $1}') || \
    fail 'daily-runner Dockerfile digest cannot be read'
  [[ $digest == "$DAILY_RUNNER_BOOTSTRAP_DOCKERFILE_SHA256" ]] || \
    fail 'daily-runner Dockerfile differs from reviewed immutable bytes'
  printf '%s\n' "$digest"
}

daily_runner_bootstrap_verify_legacy_base_image() {
  local base_id=$1
  local base_service=$2
  local deployment_project=${PROJECT:-}
  local container_id record
  local inspected_id image_id status running paused restarting dead oom_killed
  local error restart_count project service compose_image oneoff container_number extra

  [[ $base_id =~ ^sha256:[0-9a-f]{64}$ && \
     $deployment_project == social-monitor-prod && \
     $base_service =~ ^(intelligence-worker|api)$ ]] || return 1
  container_id=$(docker container ls --no-trunc \
    --filter "label=com.docker.compose.project=$deployment_project" \
    --filter "label=com.docker.compose.service=$base_service" \
    --format '{{.ID}}' 2>/dev/null) || return 1
  [[ $container_id =~ ^[0-9a-f]{64}$ ]] || return 1
  record=$(docker inspect "$container_id" --format \
    '{{.Id}}|{{.Image}}|{{.State.Status}}|{{.State.Running}}|{{.State.Paused}}|{{.State.Restarting}}|{{.State.Dead}}|{{.State.OOMKilled}}|{{.State.Error}}|{{.RestartCount}}|{{index .Config.Labels "com.docker.compose.project"}}|{{index .Config.Labels "com.docker.compose.service"}}|{{index .Config.Labels "com.docker.compose.image"}}|{{index .Config.Labels "com.docker.compose.oneoff"}}|{{index .Config.Labels "com.docker.compose.container-number"}}' \
    2>/dev/null) || return 1
  [[ $record != *$'\n'* && $record != *$'\r'* ]] || return 1
  IFS='|' read -r inspected_id image_id status running paused restarting dead \
    oom_killed error restart_count project service compose_image oneoff \
    container_number extra <<< "$record"
  [[ $inspected_id == "$container_id" && \
     $image_id == "$base_id" && \
     $status == running && $running == true && \
     $paused == false && $restarting == false && $dead == false && \
     $oom_killed == false && -z $error && $restart_count == 0 && \
     $project == "$deployment_project" && $service == "$base_service" && \
     $compose_image == "$image_id" && $oneoff == False && \
     $container_number == 1 && -z $extra ]]
}

daily_runner_bootstrap_base_image_id() {
  local previous_sha=$1
  local validation_mode=${2:-initial}
  local base_tag fallback_tag base_service=intelligence-worker
  local identity image_id revision extra config

  [[ $validation_mode == initial || $validation_mode == revalidate ]] || \
    fail 'daily-runner base image validation mode is unexpected'
  base_tag=$(compose_image_name intelligence-worker)
  [[ $base_tag == social-monitor-prod-intelligence-worker:latest ]] || \
    fail 'daily-runner bootstrap base tag is unexpected'
  fallback_tag=$(compose_image_name api)
  [[ $fallback_tag == social-monitor-prod-api:latest ]] || \
    fail 'daily-runner bootstrap fallback base tag is unexpected'
  if ! identity=$(docker image inspect "$base_tag" --format \
    '{{.Id}}|{{with index .Config.Labels "org.opencontainers.image.revision"}}{{.}}{{end}}' \
  2>/dev/null); then
    base_tag=$fallback_tag
    base_service=api
    identity=$(docker image inspect "$base_tag" --format \
      '{{.Id}}|{{with index .Config.Labels "org.opencontainers.image.revision"}}{{.}}{{end}}' \
      2>/dev/null) || fail 'daily-runner base image identity cannot be inspected'
  fi
  [[ $identity != *$'\n'* ]] || \
    fail 'daily-runner base image identity is ambiguous'
  IFS='|' read -r image_id revision extra <<< "$identity"
  [[ $image_id =~ ^sha256:[0-9a-f]{64}$ && -z $extra ]] || \
    fail 'daily-runner base image identity or revision is unexpected'
  if [[ $revision == "$previous_sha" ]]; then
    :
  elif [[ -n $revision ]]; then
    fail 'daily-runner base image identity or revision is unexpected'
  elif [[ $validation_mode == initial ]]; then
    daily_runner_bootstrap_verify_legacy_base_image \
      "$image_id" "$base_service" || \
      fail 'daily-runner unlabelled base image is not runtime-stable'
  fi
  config=$(backend_image_rescue_image_config "$image_id") || \
    fail 'daily-runner base image config cannot be inspected'
  daily_runner_bootstrap_image_config_allowed "$config" "$base_service" || \
    fail 'daily-runner base image config is unexpected'
  printf '%s\n' "$image_id"
}

daily_runner_bootstrap_require_admission() {
  local control_real admission_real descriptor_real

  control_real=$(readlink -f "$CONTROL") || \
    fail 'control path cannot be resolved for admission validation'
  [[ -f $POSTGRES_ADMISSION_LOCK && ! -L $POSTGRES_ADMISSION_LOCK ]] || \
    fail 'PostgreSQL admission lock path is unsafe'
  admission_real=$(readlink -f "$POSTGRES_ADMISSION_LOCK") || \
    fail 'PostgreSQL admission lock cannot be resolved'
  [[ $admission_real == "$control_real/daily-run.lock" ]] || \
    fail 'PostgreSQL admission lock escapes control'
  descriptor_real=$(readlink -f "/proc/$BASHPID/fd/8") || \
    fail 'daily-runner bootstrap does not own PostgreSQL admission descriptor'
  [[ $descriptor_real == "$admission_real" ]] || \
    fail 'daily-runner bootstrap admission descriptor is unexpected'
  if flock -n "$admission_real" true; then
    fail 'daily-runner bootstrap requires the held PostgreSQL admission lock'
  fi
}

daily_runner_bootstrap_assert_no_active_container() {
  local inventory_format inventory
  local container_id container_state label_project label_service extra
  local active_count=0

  [[ $PROJECT =~ ^[a-z0-9][a-z0-9_-]*$ ]] || \
    fail 'daily-runner bootstrap project label is invalid'
  inventory_format=$'{{.ID}}\t{{.State}}\t{{.Label "com.docker.compose.project"}}\t{{.Label "com.docker.compose.service"}}'
  inventory=$(docker container ls --no-trunc \
    --filter "label=com.docker.compose.project=$PROJECT" \
    --filter 'label=com.docker.compose.service=daily-runner' \
    --format "$inventory_format") || \
    fail 'daily-runner container state cannot be inventoried'
  [[ $inventory != *$'\r'* ]] || \
    fail 'daily-runner container inventory is malformed'
  [[ -n $inventory ]] || return 0

  while IFS=$'\t' read -r \
    container_id container_state label_project label_service extra; do
    [[ $container_id =~ ^[0-9a-f]{64}$ && -n $container_state && \
       -z $extra ]] || fail 'daily-runner container inventory is malformed'
    [[ $label_project == "$PROJECT" && $label_service == daily-runner ]] || \
      fail 'daily-runner container inventory label mismatch'
    case $container_state in
      running|restarting|paused) ;;
      *) fail 'daily-runner container state is unexpected' ;;
    esac
    ((active_count += 1))
  done <<< "$inventory"

  ((active_count <= 1)) || \
    fail 'daily-runner container inventory is ambiguous'
  ((active_count == 0)) || \
    fail 'active daily-runner container blocks image bootstrap'
}

daily_runner_bootstrap_remove_tag() {
  local tag=$1
  local expected_id=${2:-}
  local actual_id

  actual_id=$(backend_image_rescue_image_id "$tag" || true)
  [[ -n $actual_id ]] || return 0
  [[ -z $expected_id || $actual_id == "$expected_id" ]] || return 1
  docker image rm "$tag" >/dev/null || return 1
  ! backend_image_rescue_image_id "$tag" >/dev/null
}

daily_runner_bootstrap_remove_workdir() {
  local workdir=$1
  local previous_sha=$2

  [[ -n $workdir ]] || return 0
  [[ $workdir == \
    "$DAILY_RUNNER_BOOTSTRAP_TMP_ROOT/daily-runner-bootstrap.$previous_sha."* && \
    -d $workdir && ! -L $workdir ]] || return 1
  rm -rf -- "$workdir" || return 1
  [[ ! -e $workdir && ! -L $workdir ]]
}

daily_runner_image_bootstrap_before_rescue() (
  set -uo pipefail
  local previous_sha=$1
  local target_sha=$2
  local compose_tag state_file partial phase manifest_target
  local dockerfile_digest dockerfile_digest_after base_config base_id base_id_after
  local base_config_after_build
  local config_attempt
  local workdir='' archive='' context='' temporary_tag='' candidate_id=''
  local base_alias_tag=''
  local identity config singleton_fd revision extra
  local compose_created=false completed=false temporary_owned=false
  local base_alias_created=false

  compose_tag=$(compose_image_name daily-runner)
  if backend_image_rescue_image_id "$compose_tag" >/dev/null; then
    return 0
  fi

  state_file=$(backend_image_rescue_state_file "$target_sha")
  partial=$state_file.partial
  [[ ! -e $partial && ! -L $partial ]] || \
    fail 'partial backend rescue state blocks daily-runner bootstrap'
  if [[ -e $state_file || -L $state_file ]]; then
    [[ -f $state_file && ! -L $state_file ]] || \
      fail 'existing backend rescue state is not a regular file'
    manifest_target=$(backend_image_rescue_manifest_target "$state_file") || \
      fail 'existing backend rescue state is invalid'
    [[ $manifest_target == "$target_sha" ]] || \
      fail 'existing backend rescue state targets another release'
    phase=$(backend_image_rescue_read_phase "$state_file") || \
      fail 'existing backend rescue phase is invalid'
    [[ $phase == prepared ]] || \
      fail 'existing backend rescue state is not replayable'
    return 0
  fi

  daily_runner_bootstrap_verify_release "$previous_sha" "$target_sha"
  daily_runner_bootstrap_require_admission
  [[ ! -L $DAILY_SINGLETON_LOCK && \
     (! -e $DAILY_SINGLETON_LOCK || -f $DAILY_SINGLETON_LOCK) ]] || \
    fail 'daily singleton lock path is unsafe'
  exec {singleton_fd}>"$DAILY_SINGLETON_LOCK" || \
    fail 'daily singleton lock cannot be opened for image bootstrap'
  [[ -f $DAILY_SINGLETON_LOCK && ! -L $DAILY_SINGLETON_LOCK ]] || \
    fail 'daily singleton lock is not a regular file'
  [[ $(readlink -f "/proc/$BASHPID/fd/$singleton_fd") == \
     "$(readlink -f "$DAILY_SINGLETON_LOCK")" ]] || \
    fail 'daily singleton lock descriptor is unexpected'
  flock -n "$singleton_fd" || \
    fail 'active daily execution blocks daily-runner image bootstrap'
  daily_runner_bootstrap_assert_no_active_container

  # Invoked by the EXIT/INT/TERM traps installed below.
  # shellcheck disable=SC2317,SC2329
  cleanup_daily_runner_bootstrap() {
    local original_status=$?
    local cleanup_status=0
    trap - EXIT HUP INT TERM
    if [[ $compose_created == true && $completed == false ]]; then
      daily_runner_bootstrap_remove_tag \
        "$compose_tag" "$candidate_id" || cleanup_status=1
    fi
    if [[ $temporary_owned == true ]]; then
      daily_runner_bootstrap_remove_tag \
        "$temporary_tag" "$candidate_id" || cleanup_status=1
    fi
    if [[ $base_alias_created == true ]]; then
      daily_runner_bootstrap_remove_tag \
        "$base_alias_tag" "$base_id" || cleanup_status=1
    fi
    daily_runner_bootstrap_remove_workdir \
      "$workdir" "$previous_sha" || cleanup_status=1
    if ((cleanup_status != 0)); then
      printf 'deploy-error: daily-runner bootstrap exact cleanup failed\n' >&2
      exit 125
    fi
    exit "$original_status"
  }
  trap cleanup_daily_runner_bootstrap EXIT
  trap 'exit 129' HUP
  trap 'exit 130' INT
  trap 'exit 143' TERM

  [[ -d $DAILY_RUNNER_BOOTSTRAP_TMP_ROOT && \
     ! -L $DAILY_RUNNER_BOOTSTRAP_TMP_ROOT ]] || \
    fail 'daily-runner bootstrap temporary root is unsafe'
  workdir=$(mktemp -d \
    "$DAILY_RUNNER_BOOTSTRAP_TMP_ROOT/daily-runner-bootstrap.$previous_sha.XXXXXX") || \
    fail 'daily-runner bootstrap work directory cannot be created'
  archive=$workdir/source.tar
  context=$workdir/context
  install -d -m 0700 "$context" || \
    fail 'daily-runner bootstrap context cannot be created'
  temporary_tag=$PROJECT-daily-runner-bootstrap:$previous_sha-$BASHPID

  if backend_image_rescue_image_id "$temporary_tag" >/dev/null; then
    fail 'daily-runner bootstrap temporary tag already exists'
  fi
  dockerfile_digest=$(daily_runner_bootstrap_verify_control_dockerfile) || \
    fail 'daily-runner Dockerfile could not be validated'
  base_id=$(daily_runner_bootstrap_base_image_id "$previous_sha") || \
    fail 'daily-runner base image could not be validated'
  base_config=$(backend_image_rescue_image_config "$base_id") || \
    fail 'daily-runner base image config cannot be re-inspected'
  base_alias_tag=$(compose_image_name intelligence-worker)
  [[ $base_alias_tag == social-monitor-prod-intelligence-worker:latest ]] || \
    fail 'daily-runner build base alias is unexpected'
  if ! backend_image_rescue_image_id "$base_alias_tag" >/dev/null; then
    docker image tag "$base_id" "$base_alias_tag" >/dev/null || \
      fail 'daily-runner build base alias could not be created'
    base_alias_created=true
    [[ $(backend_image_rescue_image_id "$base_alias_tag") == "$base_id" ]] || \
      fail 'daily-runner build base alias identity is unexpected'
  fi
  daily_runner_bootstrap_create_archive "$previous_sha" "$archive" || \
    fail 'historical daily-runner archive could not be created'
  chmod 0600 "$archive" || fail 'historical daily-runner archive mode failed'
  daily_runner_bootstrap_extract_archive "$archive" "$context" || \
    fail 'historical daily-runner archive validation failed'

  temporary_owned=true
  BUILDX_NO_DEFAULT_ATTESTATIONS=1 docker build \
    --pull=false --provenance=false \
    --file "$CONTROL/daily-runner.Dockerfile" \
    --label "org.opencontainers.image.revision=$previous_sha" \
    --tag "$temporary_tag" \
    "$context" >/dev/null || fail 'historical daily-runner image build failed'
  identity=$(docker image inspect "$temporary_tag" --format \
    '{{.Id}}|{{index .Config.Labels "org.opencontainers.image.revision"}}') || \
    fail 'historical daily-runner image identity cannot be inspected'
  [[ $identity != *$'\n'* ]] || \
    fail 'historical daily-runner image identity is ambiguous'
  IFS='|' read -r candidate_id revision extra <<< "$identity"
  [[ $candidate_id =~ ^sha256:[0-9a-f]{64}$ && \
     $revision == "$previous_sha" && -z $extra ]] || \
    fail 'historical daily-runner image identity is unexpected'
  for ((config_attempt = 1;
        config_attempt <= DAILY_RUNNER_BOOTSTRAP_CONFIG_INSPECT_ATTEMPTS;
        config_attempt += 1)); do
    config=$(backend_image_rescue_image_config "$temporary_tag") || \
      fail 'historical daily-runner image config cannot be inspected'
    base_config_after_build=$(backend_image_rescue_image_config "$base_id") || \
      fail 'daily-runner base image config cannot be re-inspected after build'
    [[ $base_config_after_build == "$base_config" ]] || \
      fail 'daily-runner base image config changed during historical build'
    [[ $config != "$base_config_after_build" ]] || break
    ((config_attempt < DAILY_RUNNER_BOOTSTRAP_CONFIG_INSPECT_ATTEMPTS)) || break
    sleep 1 || fail 'daily-runner image config settle wait failed'
  done
  [[ $config == "$base_config_after_build" ]] || \
    fail 'historical daily-runner image config is unexpected'
  if [[ $base_alias_created == true ]]; then
    daily_runner_bootstrap_remove_tag "$base_alias_tag" "$base_id" || \
      fail 'daily-runner build base alias cleanup failed'
    base_alias_created=false
  fi

  daily_runner_bootstrap_verify_release "$previous_sha" "$target_sha"
  base_id_after=$(daily_runner_bootstrap_base_image_id \
    "$previous_sha" revalidate) || \
    fail 'daily-runner base image could not be revalidated'
  [[ $base_id_after == "$base_id" ]] || \
    fail 'daily-runner base image identity changed during historical build'
  dockerfile_digest_after=$(daily_runner_bootstrap_verify_control_dockerfile) || \
    fail 'daily-runner Dockerfile could not be revalidated'
  [[ $dockerfile_digest_after == "$dockerfile_digest" ]] || \
    fail 'daily-runner Dockerfile changed during historical build'
  if backend_image_rescue_image_id "$compose_tag" >/dev/null; then
    fail 'daily-runner Compose image appeared during historical build'
  fi
  compose_created=true
  docker image tag "$temporary_tag" "$compose_tag" >/dev/null || \
    fail 'historical daily-runner image could not be installed'
  [[ $(backend_image_rescue_image_id "$compose_tag") == "$candidate_id" ]] || \
    fail 'installed historical daily-runner image identity is unexpected'
  daily_runner_bootstrap_remove_tag "$temporary_tag" "$candidate_id" || \
    fail 'historical daily-runner temporary tag cleanup failed'
  temporary_owned=false
  daily_runner_bootstrap_remove_workdir "$workdir" "$previous_sha" || \
    fail 'historical daily-runner context cleanup failed'
  workdir=
  completed=true
  trap - EXIT HUP INT TERM
)
