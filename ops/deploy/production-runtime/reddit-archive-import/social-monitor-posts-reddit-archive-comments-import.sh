# Source-only additive action; existing pinned router owns issuance and neutral helpers.
reddit_comments_image=UNRENDERED_QUALIFIED_COMMENTS_IMAGE
reddit_comments_manifest=/usr/local/lib/social-monitor/current-source-guard/reddit-archive-comments-qualified-partitions.json
reddit_comments_manifest_sha=UNRENDERED_COMMENTS_PROFILE_SHA256
reddit_comments_guard=/usr/local/lib/social-monitor/current-source-guard/current_reddit_archive_comments_import_admission.py
reddit_comments_guard_sha=UNRENDERED_COMMENTS_GUARD_SHA256
reddit_comments_entry=/usr/local/lib/social-monitor/current-source-guard/reddit-archive-comments-qualified-import-entrypoint.sh
reddit_comments_entry_sha=UNRENDERED_COMMENTS_ENTRY_SHA256
reddit_comments_journals="$state/reddit-archive-comments-qualified-journals"

reddit_comments_private() {
  [[ -f $1 && ! -L $1 && $(stat -c '%u:%g:%a:%h' "$1") == 0:0:600:1 ]]
}
reddit_comments_pinned_source() {
  [[ $2 =~ ^[0-9a-f]{64}$ && -f $1 && ! -L $1 && $(stat -c '%u:%g:%a:%h' "$1") == 0:0:644:1 &&
     $(sha256sum "$1" | cut -d' ' -f1) == "$2" ]]
}
reddit_comments_partition() {
  [[ $1 =~ ^[0-9a-f]{64}$ && $reddit_comments_manifest_sha =~ ^[0-9a-f]{64}$ ]] &&
    reddit_comments_private "$reddit_comments_manifest" &&
    [[ $(sha256sum "$reddit_comments_manifest" | cut -d' ' -f1) == "$reddit_comments_manifest_sha" ]] &&
    reddit_comments_pinned_source "$reddit_comments_guard" "$reddit_comments_guard_sha" || return 1
  python3 "$reddit_comments_guard" "$1"
}
reddit_comments_leaf_size_valid() {
  [[ $# == 2 && $2 =~ ^[0-9]{1,12}$ ]] || return 1
  case "$1" in archive.json) (( 10#$2 == 4750 )) ;; packet.json) (( 10#$2 > 0 && 10#$2 <= 65536 )) ;; *) return 1 ;; esac
}
reddit_comments_import_init() {
  [[ $# == 1 ]] || return 1
  reddit_comments_key=$1
  reddit_comments_partition_json=$(reddit_comments_partition "$1") || return 1
  day=$(jq -er .day <<< "$reddit_comments_partition_json") || return 1
  reddit_comments_plan_sha=$(jq -er .planSha256 <<< "$reddit_comments_partition_json") || return 1
  reddit_comments_journal_name=$(jq -er .journalFilename <<< "$reddit_comments_partition_json") || return 1
  [[ $day == 2026-10-01 && $day < "$today" && $reddit_comments_image =~ ^sha256:[0-9a-f]{64}$ ]] &&
    reddit_comments_pinned_source "$reddit_comments_entry" "$reddit_comments_entry_sha" || return 1
  [[ $(jq -er .image "$reddit_comments_manifest") == "$reddit_comments_image" ]] || return 1
  reddit_comments_input=$(jq -er .inputHostRoot <<< "$reddit_comments_partition_json") || return 1
  [[ -d $reddit_comments_input && ! -L $reddit_comments_input && $(stat -c '%u:%a' "$reddit_comments_input") == 0:700 ]] || return 1
  local parent=$reddit_comments_input leaf pin
  while [[ $parent != / ]]; do
    [[ -d $parent && ! -L $parent && $(stat -c %u "$parent") == 0 ]] || return 1
    (( (8#$(stat -c %a "$parent") & 8#022) == 0 )) || return 1
    parent=${parent%/*}; [[ -n $parent ]] || parent=/
  done
  for leaf in archive.json packet.json; do
    reddit_comments_private "$reddit_comments_input/$leaf" &&
      reddit_comments_leaf_size_valid "$leaf" "$(stat -c %s "$reddit_comments_input/$leaf")" || return 1
    if [[ $leaf == archive.json ]]; then pin=$(jq -er .rawSha256 <<< "$reddit_comments_partition_json"); else pin=$(jq -er .packetSha256 <<< "$reddit_comments_partition_json"); fi
    [[ $(sha256sum "$reddit_comments_input/$leaf" | cut -d' ' -f1) == "$pin" ]] || return 1
  done
  image=$reddit_comments_image
}
reddit_comments_claim_valid() {
  local record_path=$1 key=$2 plan=$3 physical=$4 claimed_sha=$5 part expected
  [[ $physical =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f-]{36}$ && $claimed_sha =~ ^[0-9a-f]{64}$ &&
     -d $record_path/import-claim && ! -L $record_path/import-claim &&
     $(stat -c '%u:%g:%a' "$record_path/import-claim") == 0:0:700 ]] || return 1
  reddit_comments_private "$record_path/import-claim/reddit-archive-comments-import-claim.json" || return 1
  [[ $(sha256sum "$record_path/import-claim/reddit-archive-comments-import-claim.json" | cut -d' ' -f1) == "$claimed_sha" ]] || return 1
  part=$(reddit_comments_partition "$key") || return 1
  [[ $plan == "$(jq -er .planSha256 <<< "$part")" ]] || return 1
  expected=$(jq -cnS --arg key "$key" --arg plan "$plan" --arg corr "reddit-archive-comments-import-${physical#*-}" \
    --arg packet "$(jq -er .packetSha256 <<< "$part")" --arg journals "$reddit_comments_journals" \
    '{mode:"import-reddit-archive-comments-missing",inputRoot:"/input-source/2026-10-01",day:"2026-10-01",journalDir:$journals,
      semanticKey:$key,planSha256:$plan,packetSha256:$packet,correlationId:$corr}') || return 1
  [[ $(jq -cS . "$record_path/import-claim/reddit-archive-comments-import-claim.json") == "$expected" ]] &&
    reddit_comments_private "$reddit_comments_journals/$key.native-claim" &&
    [[ $(cat "$reddit_comments_journals/$key.native-claim") == "id=$physical plan_sha256=$plan" ]]
}
reddit_comments_terminal_data_valid() {
  local record_path=$1 part=$2 physical=$3 key tenant workspace binding interest found
  key=$(jq -er .semanticKey <<< "$part") || return 1
  python3 "$reddit_comments_guard" "$key" "$physical" "$record_path/import.receipt" \
    "$reddit_comments_journals/$(jq -er .journalFilename <<< "$part")" || return 1
  tenant=$(jq -er .scope.tenantId "$reddit_comments_manifest"); workspace=$(jq -er .scope.workspaceId "$reddit_comments_manifest")
  binding=$(jq -er .scope.sourceBindingId "$reddit_comments_manifest"); interest=$(jq -er .scope.interestId "$reddit_comments_manifest")
  # Profile recognizer validates UUIDs and exact native identities before this read-only SQL.
  found=$(psql_data "WITH exact_comments AS (
    SELECT c.id FROM conversation_units c JOIN feed_items f ON f.tenant_id=c.tenant_id AND f.workspace_id=c.workspace_id AND f.id=c.root_feed_item_id
    JOIN source_items s ON s.tenant_id=f.tenant_id AND s.workspace_id=f.workspace_id AND s.id=f.source_item_id
    WHERE c.tenant_id='$tenant' AND c.workspace_id='$workspace' AND c.interest_id='$interest' AND c.source_binding_id='$binding'
      AND c.provider_key='reddit' AND c.root_provider_item_id='t3_1wuktlf' AND c.thread_external_id='t3_1wuktlf'
      AND f.id='b179076b-4f9e-45d7-8d57-64346600ca90' AND s.id='9d1b26ae-ed89-41d5-aaa9-bf786b97c90c'
      AND s.provider_key='reddit' AND s.provider_item_id='reddit:t3_1wuktlf' AND s.source_binding_id='$binding'
      AND f.provider_key='reddit' AND f.source_binding_id='$binding' AND f.interest_id='$interest' AND f.status='VISIBLE'
      AND s.published_at='2026-10-01T00:01:13Z' AND c.depth=0 AND c.role='top_level_comment'
      AND c.parent_provider_unit_id IS NULL AND c.schema_version=1 AND c.observed_at<=clock_timestamp()
      AND c.observed_at>='2026-10-16T12:58:32.860Z' AND c.provider_metadata->'redditArchiveComments'->>'rawSha256'='f385d4bd196c4fa91e14705062624eea63871c8e58e292ea0d7d85143b9933b1'
      AND c.provider_metadata->'redditArchiveComments'->>'removalStatus'='UNKNOWN'
      AND c.provider_metadata->'redditArchiveComments'->>'deletionStatus'='UNKNOWN'
      AND ((c.provider_unit_id='t1_pd5e1lp' AND c.published_at='2026-10-01T04:51:00Z')
        OR (c.provider_unit_id='t1_pdhrwqg' AND c.published_at='2026-10-02T21:22:01Z')))
    SELECT count(*)||chr(44)||(SELECT count(*) FROM conversation_signal_baseline_samples b WHERE b.tenant_id='$tenant' AND b.workspace_id='$workspace'
      AND b.conversation_unit_id IN (SELECT id FROM exact_comments)) FROM exact_comments") || return 1
  [[ $found == 2,0 ]]
}
reddit_comments_counts_match() {
  [[ $1 =~ ^[0-9]{1,12},[0-9]{1,12}$ && $1 == "$2" ]]
}
reddit_comments_previous_valid() {
  local record_path=$1 physical=$2 key plan claim part proof
  [[ ${#previous_fields[@]} == 11 && ${previous_fields[0]} == IMPORT_COMPLETED &&
     ${previous_fields[1]} == mode=import-reddit-archive-comments-missing && ${previous_fields[2]} == date=2026-10-01 &&
     ${previous_fields[4]} == collector_exit=0 && ${previous_fields[5]} == exit=0 &&
     ${previous_fields[8]} == import=* && ${previous_fields[9]} == plan_sha256=* && ${previous_fields[10]} == claim_sha256=* ]] || return 1
  key=${previous_fields[8]#import=}; plan=${previous_fields[9]#plan_sha256=}; claim=${previous_fields[10]#claim_sha256=}
  part=$(reddit_comments_partition "$key") || return 1
  [[ ${previous_fields[3]} == "artifact=reddit-archive-comments-import-20261001-${key:0:12}-${physical#*-}" &&
     $plan == "$(jq -er .planSha256 <<< "$part")" ]] &&
    reddit_comments_claim_valid "$record_path" "$key" "$plan" "$physical" "$claim" &&
    reddit_comments_terminal_data_valid "$record_path" "$part" "$physical" &&
    reddit_comments_counts_match "${previous_fields[6]#before=}" "${previous_fields[7]#after=}" || return 1
  reddit_comments_private "$record_path/completion-proof" || return 1
  proof=$(reddit_archive_completion_proof "$record_path" "$reddit_comments_journals/$(jq -er .journalFilename <<< "$part")") || return 1
  [[ ! -e $record_path/watchdog-fired && ! -L $record_path/watchdog-fired && $(cat "$record_path/completion-proof") == "$proof" ]] &&
    role_closed "$physical" && container_absent "social-posts-${physical,,}" && watchdog_inactive "social-posts-wd-${physical#*-}"
}
reddit_comments_import_run() {
  "$fence" check-lock || exit 75
  revoke_role || exit 78
  [[ -e $reddit_comments_journals ]] || mkdir -m 700 "$reddit_comments_journals"
  [[ -d $reddit_comments_journals && ! -L $reddit_comments_journals && $(stat -c '%u:%g:%a' "$reddit_comments_journals") == 0:0:700 &&
     ! -e $reddit_comments_journals/$reddit_comments_key.native-claim && ! -L $reddit_comments_journals/$reddit_comments_key.native-claim &&
     ! -e $reddit_comments_journals/$reddit_comments_journal_name && ! -L $reddit_comments_journals/$reddit_comments_journal_name ]] || exit 75
  before=$(psql_data 'SELECT (SELECT count(*) FROM source_items)||chr(44)||(SELECT count(*) FROM feed_items)') || exit 78
  [[ $before =~ ^[0-9]+,[0-9]+$ ]] || exit 78
  uuid=$(cat /proc/sys/kernel/random/uuid); id="$started-$uuid"; name="social-posts-${id,,}"
  watchdog_unit="social-posts-wd-$uuid"; artifact="reddit-archive-comments-import-20261001-${reddit_comments_key:0:12}-$uuid"
  record="$state/posts-once/$id"
  (set -o noclobber; printf 'id=%s plan_sha256=%s\n' "$id" "$reddit_comments_plan_sha" > "$reddit_comments_journals/$reddit_comments_key.native-claim") || exit 75
  sync -f "$reddit_comments_journals/$reddit_comments_key.native-claim" "$reddit_comments_journals" || exit 78
  mkdir -m 700 "$record" "$record/import-claim"
  jq '{role: .new_name, oid: .new_oid}' "$state/current-partial-R-closure-20261006/closed-v2.receipt" > "$record/generation-role"
  jq -cnS --arg key "$reddit_comments_key" --arg plan "$reddit_comments_plan_sha" --arg corr "reddit-archive-comments-import-$uuid" \
    --arg packet "$(jq -er .packetSha256 <<< "$reddit_comments_partition_json")" --arg journals "$reddit_comments_journals" \
    '{mode:"import-reddit-archive-comments-missing",inputRoot:"/input-source/2026-10-01",day:"2026-10-01",journalDir:$journals,
      semanticKey:$key,planSha256:$plan,packetSha256:$packet,correlationId:$corr}' > "$record/import-claim/reddit-archive-comments-import-claim.json"
  reddit_comments_claim_sha=$(reddit_archive_digest "$record/import-claim/reddit-archive-comments-import-claim.json") || exit 78
  until=$(date -u -d '+30 minutes' +%FT%TZ)
  printf 'STARTED mode=import-reddit-archive-comments-missing date=%s artifact=%s image=%s before=%s watchdog=%s credential_deadline=%s import=%s plan_sha256=%s claim_sha256=%s\n' \
    "$day" "$artifact" "$image" "$before" "$watchdog_unit" "$until" "$reddit_comments_key" "$reddit_comments_plan_sha" "$reddit_comments_claim_sha" > "$record/state"
  sync -f "$record/state" "$record/generation-role" "$record/import-claim/reddit-archive-comments-import-claim.json" "$record/import-claim" "$record" "$state/posts-once"
  systemd-run --quiet --unit="$watchdog_unit" --on-active=31m --on-unit-active=1m --property=Type=oneshot --property=TimeoutStartSec=5m /usr/local/sbin/social-monitor-posts-once watchdog "$id" || exit 78
  systemctl is-active --quiet "$watchdog_unit.timer" || exit 78
  collector_rc=125; collector_quiesced=0
  trap reddit_comments_import_cleanup EXIT; trap 'exit 130' INT; trap 'exit 143' TERM
  [[ $("$fence" admit) == "$role" ]] && reddit_comments_claim_valid "$record" "$reddit_comments_key" "$reddit_comments_plan_sha" "$id" "$reddit_comments_claim_sha" || exit 75
  "$fence" open-attempt "$id" "$until" '' >/dev/null || exit 75
  set +e
  timeout --signal=TERM --kill-after=15s 25m docker run --rm --pull=never --name "$name" \
    --network platform-social-monitor --ip 172.24.10.9 --add-host host.docker.internal:host-gateway \
    --user 0:0 --read-only --tmpfs /tmp:rw,nosuid,nodev,size=64m --cap-drop ALL --security-opt no-new-privileges --pids-limit 128 --memory 1g --cpus 1 \
    --mount "type=bind,source=$reddit_comments_input,destination=/input-source/$day,readonly" \
    --mount "type=bind,source=$record/import-claim,destination=/run/social-monitor,readonly" \
    --mount "type=bind,source=$reddit_comments_journals,destination=$reddit_comments_journals" \
    --mount "type=bind,source=$reddit_comments_entry,destination=/run/bootstrap/reddit-archive-comments-qualified-import-entrypoint.sh,readonly" \
    --mount type=bind,source=/etc/platform/projects/social-monitor/secrets/postgres-collection-password,destination=/run/secrets/postgres-collection-password,readonly \
    --mount type=bind,source=/etc/platform/projects/social-monitor/secrets/postgres-ca.crt,destination=/run/postgres-ca.crt,readonly \
    --entrypoint /bin/sh "$image" /run/bootstrap/reddit-archive-comments-qualified-import-entrypoint.sh "$reddit_comments_key" "$day" "$reddit_comments_plan_sha" \
    "$(jq -er .packetSha256 <<< "$reddit_comments_partition_json")" "reddit-archive-comments-import-$uuid" "$reddit_comments_claim_sha" > "$record/import.receipt" 2> "$record/collector.log" &
  collector_pid=$!; wait "$collector_pid"; collector_rc=$?; collector_quiesced=1; set -e; exit "$collector_rc"
}
reddit_comments_save_state() {
  printf '%s mode=import-reddit-archive-comments-missing date=%s artifact=%s collector_exit=%s exit=%s before=%s after=%s import=%s plan_sha256=%s claim_sha256=%s\n' \
    "$1" "$day" "$artifact" "$collector_rc" "$2" "$before" "$3" "$reddit_comments_key" "$reddit_comments_plan_sha" "$reddit_comments_claim_sha" > "$record/state.next" &&
    sync -f "$record/state.next" && mv "$record/state.next" "$record/state" && sync -f "$record/state" "$record"
}
reddit_comments_import_cleanup() {
  local rc=$? role_safe=1 container_safe=1 data_safe=1 state_name after after_rc proof
  trap - EXIT INT TERM; set +e
  if [[ -n ${collector_pid:-} ]] && kill -0 "$collector_pid" 2>/dev/null; then kill -TERM "$collector_pid" 2>/dev/null; fi
  revoke_role && role_closed "$id" && role_safe=0
  remove_container "$name" && container_absent "$name" && container_safe=0
  after=$(psql_data 'SELECT (SELECT count(*) FROM source_items)||chr(44)||(SELECT count(*) FROM feed_items)'); after_rc=$?
  if [[ $collector_quiesced == 1 && $collector_rc == 0 && $rc == 0 && $role_safe == 0 && $container_safe == 0 &&
        $after_rc == 0 && ! -e $record/watchdog-fired && ! -L $record/watchdog-fired ]]; then
    reddit_comments_claim_valid "$record" "$reddit_comments_key" "$reddit_comments_plan_sha" "$id" "$reddit_comments_claim_sha" &&
      reddit_comments_terminal_data_valid "$record" "$reddit_comments_partition_json" "$id" && reddit_comments_counts_match "$before" "$after" && data_safe=0
  fi
  state_name=FAILED_POSSIBLE_WRITES; [[ $data_safe != 0 ]] || state_name=IMPORT_COMPLETED
  rc=1; [[ $state_name != IMPORT_COMPLETED ]] || rc=0
  reddit_comments_save_state "$state_name" "$rc" "$after" || rc=1
  if [[ $rc == 0 ]]; then
    proof=$(reddit_archive_completion_proof "$record" "$reddit_comments_journals/$reddit_comments_journal_name")
    if [[ $? != 0 ]]; then rc=1
    else
      printf '%s\n' "$proof" > "$record/completion-proof.next" && sync -f "$record/completion-proof.next" &&
        mv "$record/completion-proof.next" "$record/completion-proof" && sync -f "$record/completion-proof" "$record" &&
        stop_watchdog "$watchdog_unit" && watchdog_inactive "$watchdog_unit" &&
        [[ ! -e $record/watchdog-fired && ! -L $record/watchdog-fired ]] || rc=1
    fi
  fi
  if [[ $rc != 0 && $state_name == IMPORT_COMPLETED ]]; then
    state_name=FAILED_POSSIBLE_WRITES
    reddit_comments_save_state "$state_name" 1 "$after" || rc=1
  fi
  printf 'reddit-archive-comments-import id=%s date=%s state=%s exit=%s\n' "$id" "$day" "$state_name" "$rc"
  exit "$rc"
}
