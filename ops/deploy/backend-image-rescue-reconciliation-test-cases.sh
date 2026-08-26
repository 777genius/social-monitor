# shellcheck shell=bash
# Sourced by the focused parent contract test; keep scenario state in one shell.
# restore failure retains a terminal tag-only rollback without ever touching
# the healthy container, and the later retry performs only runtime restoration.
reset_case prepared-aggregation-retry
add_ref "$ID_A" "$ID_A"
add_container api prepared-aggregation-api "$ID_A"
prepared_aggregation_state=$(backend_image_rescue_state_file "$SHA")
backend_image_rescue_prepare "$SHA" "$prepared_aggregation_state" api
set_ref_direct "$(compose_image_name api)" "$ID_E"
restore_postgres_runtime_control() {
  printf 'restore-runtime\t%s\n' "$1" >> "$EVENT_LOG"
  [[ ${FAKE_RUNTIME_STATUS:-0} == 0 ]]
}
: > "$EVENT_LOG"
export FAKE_RUNTIME_STATUS=42
set +e
rollback_backend_and_runtime_control \
  true "$prepared_aggregation_state" runtime-backup
prepared_aggregation_status=$?
set -e
((prepared_aggregation_status != 0))
[[ $(ref_id "$(compose_image_name api)") == "$ID_A" ]]
[[ $(backend_image_rescue_read_phase "$prepared_aggregation_state") == \
   rollback-complete ]]
if grep -E $'^(stop-database|compose\t.*force-recreate|verify-backend)' \
  "$EVENT_LOG" >/dev/null; then
  echo 'pre-replacement aggregation touched a healthy container' >&2
  exit 1
fi
export FAKE_RUNTIME_STATUS=0
rollback_backend_and_runtime_control \
  true "$prepared_aggregation_state" runtime-backup
[[ ! -e $prepared_aggregation_state ]]
assert_no_rescue_refs
unset FAKE_RUNTIME_STATUS

# Backend rollback failure never short-circuits runtime-control restoration;
# both failures are reported and rescue cleanup is deliberately skipped.
set +e
aggregation_output=$(
  rollback_backend_images() {
    printf 'forced-backend-rollback\n' >> "$EVENT_LOG"
    return 41
  }
  restore_postgres_runtime_control() {
    printf 'forced-runtime-rollback\n' >> "$EVENT_LOG"
    return 42
  }
  rollback_backend_and_runtime_control true unavailable-state runtime-backup 2>&1
)
aggregation_status=$?
set -e
((aggregation_status != 0))
grep -F 'backend image/container rollback failed (status=41)' \
  <<< "$aggregation_output" >/dev/null
grep -F 'PostgreSQL runtime-control rollback failed (status=42)' \
  <<< "$aggregation_output" >/dev/null
grep -F 'forced-backend-rollback' "$EVENT_LOG" >/dev/null
grep -F 'forced-runtime-rollback' "$EVENT_LOG" >/dev/null

# If a process died after committing backend.sha but before exact cleanup, the
# next deploy under the singleton lock reconciles that completed release.
reset_case reconcile-success
reconciled_state=$(prepare_reconcile_state "$SHA" prepared reconciled-api)
printf '%s\n' "$SHA" > "$STATE/backend.sha"
reconcile_completed_backend_image_rescues
[[ ! -e $reconciled_state ]]
assert_no_rescue_refs

# A completed different-release rescue whose replacement started is reconciled
# through the normal backend rollback path before its exact tags are removed.
reset_case reconcile-stale-replacement-started
stale_sha=2222222222222222222222222222222222222222
stale_state=$(prepare_reconcile_state \
  "$stale_sha" replacement-started stale-api)
set_ref_direct "$(compose_image_name api)" "$ID_E"
printf '%s\n' "$SHA" > "$STATE/backend.sha"
: > "$EVENT_LOG"
reconcile_completed_backend_image_rescues
[[ ! -e $stale_state ]]
[[ $(ref_id "$(compose_image_name api)") == "$ID_A" ]]
[[ $(grep -c '^stop-database' "$EVENT_LOG") == 1 ]]
[[ $(grep -c $'^compose\t.*force-recreate' "$EVENT_LOG") == 1 ]]
[[ $(grep -c '^verify-backend' "$EVENT_LOG") == 1 ]]
assert_no_rescue_refs

# Preparing a new release reconciles a stale different-release replacement
# through rollback plus cleanup before capturing the next snapshot.
reset_case prepare-reconciles-stale-replacement-started
next_sha=4444444444444444444444444444444444444444
stale_state=$(prepare_reconcile_state \
  "$stale_sha" replacement-started stale-prepare-api)
stale_tag=$(backend_image_rescue_tag "$stale_sha" api)
set_ref_direct "$(compose_image_name api)" "$ID_E"
printf '%s\n' "$SHA" > "$STATE/backend.sha"
: > "$EVENT_LOG"
next_state=$(backend_image_rescue_state_file "$next_sha")
backend_image_rescue_prepare "$next_sha" "$next_state" api
[[ ! -e $stale_state ]]
[[ -e $next_state ]]
[[ -z $(ref_id "$stale_tag") ]]
[[ $(ref_id "$(compose_image_name api)") == "$ID_A" ]]
[[ $(ref_id "$(backend_image_rescue_tag "$next_sha" api)") == "$ID_A" ]]
[[ $(grep -c '^stop-database' "$EVENT_LOG") == 1 ]]
[[ $(grep -c $'^compose\t.*force-recreate' "$EVENT_LOG") == 1 ]]
backend_image_rescue_cleanup "$next_state"
assert_no_rescue_refs

# A different-release rescue already marked rollback-complete is cleaned only
# after manifest and exact rescue-tag validation; no container rollback repeats.
reset_case reconcile-stale-rollback-complete
rollback_complete_state=$(prepare_reconcile_state \
  "$stale_sha" rollback-complete rollback-complete-api)
printf '%s\n' "$SHA" > "$STATE/backend.sha"
: > "$EVENT_LOG"
reconcile_completed_backend_image_rescues
[[ ! -e $rollback_complete_state ]]
if grep -E $'^(stop-database|compose\t.*force-recreate|verify-backend)' \
  "$EVENT_LOG" >/dev/null; then
  echo 'rollback-complete reconciliation repeated container rollback' >&2
  exit 1
fi
assert_no_rescue_refs

# Prepared different-release evidence fails closed and keeps blocking a new
# release because no replacement or rollback has durably completed.
reset_case reconcile-preserves-prepared
prepared_state=$(prepare_reconcile_state "$stale_sha" prepared prepared-api)
printf '%s\n' "$SHA" > "$STATE/backend.sha"
assert_fails reconcile_completed_backend_image_rescues
[[ -e $prepared_state ]]
[[ $(ref_id "$(backend_image_rescue_tag "$stale_sha" api)") == "$ID_A" ]]
assert_fails backend_image_rescue_prepare \
  "$SHA" "$(backend_image_rescue_state_file "$SHA")" api
[[ -e $prepared_state ]]

# Incomplete manifests and wrong rescue-tag identities fail closed and keep the
# on-disk evidence plus Docker tag available for operator inspection.
reset_case reconcile-rejects-incomplete
bad_sha=3333333333333333333333333333333333333333
bad_state=$(backend_image_rescue_state_file "$bad_sha")
bad_tag=$(backend_image_rescue_tag "$bad_sha" api)
add_ref "$bad_tag" "$ID_A"
umask 077
{
  printf '%s\n' "$BACKEND_IMAGE_RESCUE_VERSION"
  printf 'target\t%s\nproject\t%s\n' "$bad_sha" "$PROJECT"
  printf 'image\tapi\trecreate\trunning-image\tbad-api\t%s\t%s\n' \
    "$ID_A" "$bad_tag"
} > "$bad_state"
chmod 0600 "$bad_state"
assert_fails reconcile_completed_backend_image_rescues
[[ -e $bad_state ]]
[[ $(ref_id "$bad_tag") == "$ID_A" ]]
assert_fails backend_image_rescue_prepare \
  "$SHA" "$(backend_image_rescue_state_file "$SHA")" api
[[ -e $bad_state ]]

reset_case reconcile-rejects-wrong-tag
wrong_state=$(prepare_reconcile_state "$stale_sha" rollback-complete wrong-api)
wrong_tag=$(backend_image_rescue_tag "$stale_sha" api)
set_ref_direct "$wrong_tag" "$ID_B"
assert_fails reconcile_completed_backend_image_rescues
[[ -e $wrong_state ]]
[[ $(ref_id "$wrong_tag") == "$ID_B" ]]
assert_fails backend_image_rescue_prepare \
  "$SHA" "$(backend_image_rescue_state_file "$SHA")" api
[[ -e $wrong_state ]]
[[ $(ref_id "$wrong_tag") == "$ID_B" ]]

if grep -E $'docker\t(image\t)?(system\t)?prune' "$EVENT_LOG" >/dev/null; then
  echo 'backend rescue contract invoked a broad Docker prune' >&2
  exit 1
fi
if grep -E 'docker([[:space:]]+container)?[[:space:]]+commit' \
  "$LIBRARY" >/dev/null; then
  echo 'backend rescue library retained unsafe docker commit adoption' >&2
  exit 1
fi
