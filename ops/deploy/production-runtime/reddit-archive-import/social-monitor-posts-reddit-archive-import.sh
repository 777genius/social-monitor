# Sourced only by the pinned existing posts router. No new role or launcher authority.
# UNRENDERED candidate refuses admission; renderer substitutes genuine qualified pins.
reddit_archive_image=UNRENDERED_QUALIFIED_IMAGE
reddit_archive_manifest=/usr/local/lib/social-monitor/current-source-guard/reddit-archive-qualified-partitions.json
reddit_archive_manifest_sha=UNRENDERED_AUTHENTIC_PROFILE_SHA256
reddit_archive_entry=/usr/local/lib/social-monitor/current-source-guard/reddit-archive-qualified-import-entrypoint.sh
reddit_archive_entry_sha=UNRENDERED_ENTRYPOINT_SHA256
reddit_archive_journals="$state/reddit-archive-qualified-journals"

reddit_archive_manifest_valid() {
  [[ -f $reddit_archive_manifest && ! -L $reddit_archive_manifest &&
     $(stat -c '%u:%g:%a:%h' "$reddit_archive_manifest") == 0:0:600:1 &&
     $(sha256sum "$reddit_archive_manifest" | cut -d' ' -f1) == "$reddit_archive_manifest_sha" ]]
}
reddit_archive_partition() {
  local key=$1
  [[ $key =~ ^[0-9a-f]{64}$ ]] && reddit_archive_manifest_valid || return 1
  jq -ce --arg key "$key" '.partitions | map(select(.semanticKey==$key)) | if length==1 then .[0] else error("partition") end' "$reddit_archive_manifest"
}
reddit_archive_import_init() {
  [[ $# == 1 ]] || return 1
  reddit_archive_key=$1
  reddit_archive_partition_json=$(reddit_archive_partition "$reddit_archive_key") || return 1
  day=$(jq -er '.day' <<< "$reddit_archive_partition_json") || return 1
  reddit_archive_plan_sha=$(jq -er '.planSha256' <<< "$reddit_archive_partition_json") || return 1
  reddit_archive_journal_name=$(jq -er '.journalFilename' <<< "$reddit_archive_partition_json") || return 1
  [[ $day < "$today" && $reddit_archive_plan_sha =~ ^[0-9a-f]{64}$ &&
     $reddit_archive_journal_name == "reddit-archive-qualified-$reddit_archive_key.journal.json" ]] || return 1
  jq -e '
    .schemaVersion==1 and .providerKey=="reddit" and
    (.scope | keys | sort)==(["tenantId","workspaceId","interestId","sourceBindingId","scanPolicyId"]|sort) and
    (.scope | all(.[]; type=="string" and test("^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$"))) and
    (.bindingConfig|type=="string" and length>0) and (.scanPolicy|type=="object" and length>0) and
    (.matchedLaneOrdinal|type=="number" and floor==. and .>=1) and
    .scanPolicy.id==.scope.scanPolicyId and
    (.scanPolicy|keys|sort)==(["id","intervalSeconds","freshnessSeconds","retryBudget"]|sort) and
    ([.scanPolicy.intervalSeconds,.scanPolicy.freshnessSeconds]|all(type=="number" and floor==. and .>=1 and .<=31536000)) and
    (.scanPolicy.retryBudget|type=="number" and floor==. and .>=0 and .<=100)
  ' "$reddit_archive_manifest" >/dev/null || return 1
  jq -e '
    (.selectedIds|type=="array" and length>=1 and length<=3) and
    (.selectedIds|unique|length)==(.selectedIds|length) and
    (.selectedIds|all(.[]; type=="string" and test("^reddit:t3_[a-z0-9]{4,12}$"))) and
    ([.archiveSha256,.packetSha256,.bindingConfigSha256,.itemsSha256]|all(type=="string" and test("^[0-9a-f]{64}$")))
  ' <<< "$reddit_archive_partition_json" >/dev/null || return 1
  [[ -f $reddit_archive_entry && ! -L $reddit_archive_entry && $(stat -c '%u:%g:%a:%h' "$reddit_archive_entry") == 0:0:644:1 &&
     $(sha256sum "$reddit_archive_entry" | cut -d' ' -f1) == "$reddit_archive_entry_sha" ]] || return 1
  [[ $reddit_archive_image =~ ^sha256:[0-9a-f]{64}$ ]] || return 1
  reddit_archive_input=$(jq -er '.inputHostRoot' <<< "$reddit_archive_partition_json") || return 1
  [[ $reddit_archive_input == /var/lib/platform/social-monitor/reddit-archive-inputs/* &&
     $reddit_archive_input != *..* && $reddit_archive_input != *[,[:space:]]* &&
     -d $reddit_archive_input && ! -L $reddit_archive_input &&
     $(stat -c '%u:%a' "$reddit_archive_input") == 0:700 ]] || return 1
  local parent=$reddit_archive_input name pin
  while [[ $parent != / ]]; do
    [[ -d $parent && ! -L $parent && $(stat -c %u "$parent") == 0 ]] || return 1
    (( (8#$(stat -c %a "$parent") & 8#022) == 0 )) || return 1
    parent=${parent%/*}; [[ -n $parent ]] || parent=/
  done
  for name in archive.json packet.json; do
    [[ -f $reddit_archive_input/$name && ! -L $reddit_archive_input/$name &&
       $(stat -c '%u:%a:%h' "$reddit_archive_input/$name") == 0:600:1 &&
       $(stat -c %s "$reddit_archive_input/$name") -le 33554432 ]] || return 1
    if [[ $name == archive.json ]]; then pin=$(jq -er .archiveSha256 <<< "$reddit_archive_partition_json"); else pin=$(jq -er .packetSha256 <<< "$reddit_archive_partition_json"); fi
    [[ $pin =~ ^[0-9a-f]{64}$ && $(sha256sum "$reddit_archive_input/$name" | cut -d' ' -f1) == "$pin" ]] || return 1
  done
  image=$reddit_archive_image
}
reddit_archive_claim_valid() {
  local record_path=$1 key=$2 plan=$3 physical=$4 claimed_sha=$5 expected actual claimed_day
  [[ $physical =~ ^[0-9]{8}T[0-9]{6}Z-[0-9a-f-]{36}$ && $claimed_sha =~ ^[0-9a-f]{64}$ &&
     -d $record_path/import-claim && ! -L $record_path/import-claim &&
     $(stat -c '%u:%g:%a' "$record_path/import-claim") == 0:0:700 &&
     -f $record_path/import-claim/reddit-archive-import-claim.json && ! -L $record_path/import-claim/reddit-archive-import-claim.json &&
     $(stat -c '%u:%g:%a:%h' "$record_path/import-claim/reddit-archive-import-claim.json") == 0:0:600:1 &&
     $(sha256sum "$record_path/import-claim/reddit-archive-import-claim.json" | cut -d' ' -f1) == "$claimed_sha" ]] || return 1
  claimed_day=$(reddit_archive_partition "$key" | jq -er .day) || return 1
  expected=$(jq -cnS --arg key "$key" --arg plan "$plan" --arg corr "reddit-archive-import-${physical#*-}" \
    --arg packet "$(reddit_archive_partition "$key" | jq -er .packetSha256)" --arg day "$claimed_day" --arg journals "$reddit_archive_journals" '{mode:"import-reddit-archive-missing",inputRoot:("/input-source/"+$day),day:$day,journalDir:$journals,
      semanticKey:$key,planSha256:$plan,packetSha256:$packet,correlationId:$corr}') || return 1
  actual=$(jq -cS . "$record_path/import-claim/reddit-archive-import-claim.json") || return 1
  [[ $actual == "$expected" &&
     -f $reddit_archive_journals/$key.native-claim && ! -L $reddit_archive_journals/$key.native-claim &&
     $(stat -c '%u:%g:%a:%h' "$reddit_archive_journals/$key.native-claim") == 0:0:600:1 &&
     $(cat "$reddit_archive_journals/$key.native-claim") == "id=$physical plan_sha256=$plan" ]]
}
reddit_archive_terminal_data_valid() {
  local record_path=$1 partition=$2 physical=$3 plan ids count receipt journal native
  plan=$(jq -er '.planSha256' <<< "$partition") || return 1
  ids=$(jq -c '.selectedIds' <<< "$partition") || return 1
  count=$(jq -er '.selectedIds | length' <<< "$partition") || return 1
  [[ $count -ge 1 && $count -le 3 ]] || return 1
  receipt="$record_path/import.receipt"
  journal="$reddit_archive_journals/$(jq -er '.journalFilename' <<< "$partition")"
  for native in "$receipt" "$journal"; do
    [[ -f $native && ! -L $native && $(stat -c '%u:%g:%a:%h' "$native") == 0:0:600:1 &&
       $(stat -c %s "$native") -le 262144 ]] || return 1
    jq -se 'length == 1' "$native" >/dev/null || return 1
  done
  jq -e --arg plan "$plan" --argjson n "$count" '
    (keys | sort)==(["alreadyPresent","coverage","inserted","planSha256","postWritePresent"] | sort)
    and .coverage=="PARTIAL_ARCHIVED_OBSERVATIONS" and .planSha256==$plan
    and ([.inserted,.alreadyPresent,.postWritePresent] | all(type=="number" and floor==. and .>=0 and .<=100))
    and .postWritePresent==$n and .inserted==$n and .alreadyPresent==0' "$receipt" >/dev/null || return 1
  jq -e --arg plan "$plan" --arg corr "reddit-archive-import-${physical#*-}" --argjson ids "$ids" \
    --argjson partition "$partition" --slurpfile receipt "$receipt" --slurpfile manifest "$reddit_archive_manifest" '
    (keys|sort)==(["schemaVersion","day","coverage","providerKey","semanticKey","planSha256","archiveSha256",
      "packetSha256","bindingConfigSha256","itemsSha256","scope","candidateIds","status",
      "inserted","alreadyPresent","postWritePresent"]|sort)
    and .day==$partition.day and .providerKey=="reddit" and .semanticKey==$partition.semanticKey
    and .archiveSha256==$partition.archiveSha256 and .packetSha256==$partition.packetSha256
    and .bindingConfigSha256==$partition.bindingConfigSha256 and .itemsSha256==$partition.itemsSha256
    and .status=="complete" and .schemaVersion==1 and .coverage=="PARTIAL_ARCHIVED_OBSERVATIONS" and .planSha256==$plan
    and (.candidateIds|sort)==($ids|sort) and .scope==($manifest[0].scope+{correlationId:$corr})
    and .inserted==$receipt[0].inserted and .alreadyPresent==0 and .postWritePresent==$receipt[0].postWritePresent' "$journal" >/dev/null || return 1
  # Read only the exact scoped IDs; all must have their visible interest feed row.
  local sql_ids found tenant workspace binding interest
  tenant=$(jq -er .scope.tenantId "$reddit_archive_manifest") || return 1
  workspace=$(jq -er .scope.workspaceId "$reddit_archive_manifest") || return 1
  binding=$(jq -er .scope.sourceBindingId "$reddit_archive_manifest") || return 1
  interest=$(jq -er .scope.interestId "$reddit_archive_manifest") || return 1
  sql_ids=${ids//\'/\'\'}
  found=$(psql_data "SELECT count(DISTINCT s.provider_item_id) FROM source_items s JOIN feed_items f
    ON f.tenant_id=s.tenant_id AND f.workspace_id=s.workspace_id AND f.source_item_id=s.id
    WHERE s.tenant_id='$tenant' AND s.workspace_id='$workspace'
    AND s.provider_key='reddit' AND s.source_binding_id='$binding'
    AND f.interest_id='$interest' AND f.status='VISIBLE'
    AND f.provider_key='reddit' AND f.source_binding_id=s.source_binding_id
    AND s.provider_item_id IN (SELECT jsonb_array_elements_text('$sql_ids'::jsonb))") || return 1
  [[ $found == "$count" ]]
}
reddit_archive_counts_match() {
  local old=$1 new=$2 receipt=$3 inserted a b c d
  [[ $old =~ ^[0-9]{1,12},[0-9]{1,12}$ && $new =~ ^[0-9]{1,12},[0-9]{1,12}$ ]] || return 1
  inserted=$(jq -er '.inserted' "$receipt") || return 1
  a=${old%,*}; b=${old#*,}; c=${new%,*}; d=${new#*,}
  [[ $((10#$c - 10#$a)) == "$inserted" && $((10#$d - 10#$b)) == "$inserted" ]]
}
reddit_archive_digest() {
  local result
  result=$(sha256sum "$1") || return 1
  [[ $result =~ ^([0-9a-f]{64})[[:space:]] ]] || return 1
  printf '%s' "${BASH_REMATCH[1]}"
}
reddit_archive_completion_proof() {
  local record_path=$1 journal=$2 state_sha receipt_sha journal_sha
  state_sha=$(reddit_archive_digest "$record_path/state") || return 1
  receipt_sha=$(reddit_archive_digest "$record_path/import.receipt") || return 1
  journal_sha=$(reddit_archive_digest "$journal") || return 1
  printf 'sha256=%s receipt_sha256=%s journal_sha256=%s' "$state_sha" "$receipt_sha" "$journal_sha"
}
reddit_archive_previous_valid() {
  local record_path=$1 physical=$2 key plan claim partition proof
  [[ ${#previous_fields[@]} == 11 && ${previous_fields[0]} == IMPORT_COMPLETED &&
     ${previous_fields[1]} == mode=import-reddit-archive-missing && ${previous_fields[4]} == collector_exit=0 &&
     ${previous_fields[5]} == exit=0 && ${previous_fields[8]} == import=* &&
     ${previous_fields[9]} == plan_sha256=* && ${previous_fields[10]} == claim_sha256=* &&
     ${previous_fields[6]#before=} =~ ^[0-9]+,[0-9]+$ && ${previous_fields[7]#after=} =~ ^[0-9]+,[0-9]+$ ]] || return 1
  key=${previous_fields[8]#import=}; plan=${previous_fields[9]#plan_sha256=}; claim=${previous_fields[10]#claim_sha256=}
  partition=$(reddit_archive_partition "$key") || return 1
  [[ ${previous_fields[2]} == "date=$(jq -er '.day' <<< "$partition")" &&
     ${previous_fields[3]} == "artifact=reddit-archive-import-$(jq -er '.day | gsub("-";"")' <<< "$partition")-${key:0:12}-${physical#*-}" &&
     $plan == "$(jq -er '.planSha256' <<< "$partition")" ]] || return 1
  reddit_archive_claim_valid "$record_path" "$key" "$plan" "$physical" "$claim" &&
    reddit_archive_terminal_data_valid "$record_path" "$partition" "$physical" &&
    reddit_archive_counts_match "${previous_fields[6]#before=}" "${previous_fields[7]#after=}" "$record_path/import.receipt" || return 1
  [[ -f $record_path/completion-proof && ! -L $record_path/completion-proof &&
     $(stat -c '%u:%g:%a:%h' "$record_path/completion-proof") == 0:0:600:1 ]] || return 1
  proof=$(reddit_archive_completion_proof "$record_path" "$reddit_archive_journals/$(jq -er '.journalFilename' <<< "$partition")") || return 1
  [[ ! -e $record_path/watchdog-fired && ! -L $record_path/watchdog-fired &&
     $(cat "$record_path/completion-proof") == "$proof" ]] &&
    role_closed "$physical" && container_absent "social-posts-${physical,,}" &&
    watchdog_inactive "social-posts-wd-${physical#*-}"
}
reddit_archive_import_run() {
  "$fence" check-lock || exit 75
  revoke_role || exit 78
  [[ -e $reddit_archive_journals ]] || mkdir -m 700 "$reddit_archive_journals"
  [[ -d $reddit_archive_journals && ! -L $reddit_archive_journals && $(stat -c '%u:%g:%a' "$reddit_archive_journals") == 0:0:700 &&
     ! -e $reddit_archive_journals/$reddit_archive_key.native-claim && ! -L $reddit_archive_journals/$reddit_archive_key.native-claim &&
     ! -e $reddit_archive_journals/$reddit_archive_journal_name && ! -L $reddit_archive_journals/$reddit_archive_journal_name ]] || exit 75
  before=$(psql_data 'SELECT (SELECT count(*) FROM source_items)||chr(44)||(SELECT count(*) FROM feed_items)') || exit 78
  [[ $before =~ ^[0-9]+,[0-9]+$ ]] || exit 78
  uuid=$(cat /proc/sys/kernel/random/uuid); id="$started-$uuid"; name="social-posts-${id,,}"
  watchdog_unit="social-posts-wd-$uuid"; artifact="reddit-archive-import-${day//-/}-${reddit_archive_key:0:12}-$uuid"
  record="$state/posts-once/$id"
  (set -o noclobber; printf 'id=%s plan_sha256=%s\n' "$id" "$reddit_archive_plan_sha" > "$reddit_archive_journals/$reddit_archive_key.native-claim") || exit 75
  sync -f "$reddit_archive_journals/$reddit_archive_key.native-claim" "$reddit_archive_journals" || exit 78
  mkdir -m 700 "$record" "$record/import-claim"
  jq '{role: .new_name, oid: .new_oid}' "$state/current-partial-R-closure-20261006/closed-v2.receipt" > "$record/generation-role"
  jq -cnS --arg key "$reddit_archive_key" --arg plan "$reddit_archive_plan_sha" --arg corr "reddit-archive-import-$uuid" --arg packet "$(jq -er .packetSha256 <<< "$reddit_archive_partition_json")" --arg day "$day" --arg journals "$reddit_archive_journals" \
    '{mode:"import-reddit-archive-missing",inputRoot:("/input-source/"+$day),day:$day,journalDir:$journals,semanticKey:$key,
      planSha256:$plan,packetSha256:$packet,correlationId:$corr}' > "$record/import-claim/reddit-archive-import-claim.json"
  reddit_archive_claim_sha=$(sha256sum "$record/import-claim/reddit-archive-import-claim.json" | cut -d' ' -f1)
  until=$(date -u -d '+30 minutes' +%FT%TZ)
  printf 'STARTED mode=import-reddit-archive-missing date=%s artifact=%s image=%s before=%s watchdog=%s credential_deadline=%s import=%s plan_sha256=%s claim_sha256=%s\n' \
    "$day" "$artifact" "$image" "$before" "$watchdog_unit" "$until" "$reddit_archive_key" "$reddit_archive_plan_sha" "$reddit_archive_claim_sha" > "$record/state"
  sync -f "$record/state" "$record/generation-role" "$record/import-claim/reddit-archive-import-claim.json" "$record/import-claim" "$record" "$state/posts-once"
  systemd-run --quiet --unit="$watchdog_unit" --on-active=31m --on-unit-active=1m \
    --property=Type=oneshot --property=TimeoutStartSec=5m /usr/local/sbin/social-monitor-posts-once watchdog "$id" || exit 78
  systemctl is-active --quiet "$watchdog_unit.timer" || exit 78
  collector_rc=125; collector_quiesced=0
  trap reddit_archive_import_cleanup EXIT
  trap 'exit 130' INT; trap 'exit 143' TERM
  [[ $("$fence" admit) == "$role" ]] &&
    reddit_archive_claim_valid "$record" "$reddit_archive_key" "$reddit_archive_plan_sha" "$id" "$reddit_archive_claim_sha" || exit 75
  "$fence" open-attempt "$id" "$until" '' >/dev/null || exit 75
  set +e
  timeout --signal=TERM --kill-after=15s 25m docker run --rm --pull=never --name "$name" \
    --network platform-social-monitor --ip 172.24.10.9 --add-host host.docker.internal:host-gateway \
    --user 0:0 --read-only --tmpfs /tmp:rw,nosuid,nodev,size=64m --cap-drop ALL \
    --security-opt no-new-privileges --pids-limit 128 --memory 1g --cpus 1 \
    --mount "type=bind,source=$reddit_archive_input,destination=/input-source/$day,readonly" \
    --mount "type=bind,source=$record/import-claim,destination=/run/social-monitor,readonly" \
    --mount "type=bind,source=$reddit_archive_journals,destination=$reddit_archive_journals" \
    --mount "type=bind,source=$reddit_archive_entry,destination=/run/bootstrap/reddit-archive-qualified-import-entrypoint.sh,readonly" \
    --mount type=bind,source=/etc/platform/projects/social-monitor/secrets/postgres-collection-password,destination=/run/secrets/postgres-collection-password,readonly \
    --mount type=bind,source=/etc/platform/projects/social-monitor/secrets/postgres-ca.crt,destination=/run/postgres-ca.crt,readonly \
    --entrypoint /bin/sh "$image" /run/bootstrap/reddit-archive-qualified-import-entrypoint.sh "$reddit_archive_key" "$day" "$reddit_archive_plan_sha" "$(jq -er .packetSha256 <<< "$reddit_archive_partition_json")" "reddit-archive-import-$uuid" "$reddit_archive_claim_sha" \
    > "$record/import.receipt" 2> "$record/collector.log" &
  collector_pid=$!; wait "$collector_pid"; collector_rc=$?; collector_quiesced=1
  set -e
  exit "$collector_rc"
}
reddit_archive_import_cleanup() {
  local rc=$? role_safe=1 container_safe=1 data_safe=1 state_name after after_rc proof
  trap - EXIT INT TERM; set +e
  if [[ -n ${collector_pid:-} ]] && kill -0 "$collector_pid" 2>/dev/null; then kill -TERM "$collector_pid" 2>/dev/null; fi
  revoke_role && role_safe=0; remove_container "$name" && container_safe=0
  after=$(psql_data 'SELECT (SELECT count(*) FROM source_items)||chr(44)||(SELECT count(*) FROM feed_items)')
  after_rc=$?
  if [[ $collector_quiesced == 1 && $collector_rc == 0 && $rc == 0 && $role_safe == 0 && $container_safe == 0 &&
        $after_rc == 0 && $after =~ ^[0-9]+,[0-9]+$ && ! -e $record/watchdog-fired ]]; then
    reddit_archive_claim_valid "$record" "$reddit_archive_key" "$reddit_archive_plan_sha" "$id" "$reddit_archive_claim_sha" &&
      reddit_archive_terminal_data_valid "$record" "$reddit_archive_partition_json" "$id" &&
      reddit_archive_counts_match "$before" "$after" "$record/import.receipt" && data_safe=0
  fi
  state_name=FAILED_POSSIBLE_WRITES
  [[ $data_safe != 0 ]] || state_name=IMPORT_COMPLETED
  rc=1; [[ $state_name != IMPORT_COMPLETED ]] || rc=0
  printf '%s mode=import-reddit-archive-missing date=%s artifact=%s collector_exit=%s exit=%s before=%s after=%s import=%s plan_sha256=%s claim_sha256=%s\n' \
    "$state_name" "$day" "$artifact" "$collector_rc" "$rc" "$before" "$after" "$reddit_archive_key" "$reddit_archive_plan_sha" "$reddit_archive_claim_sha" > "$record/state.next" &&
    sync -f "$record/state.next" && mv "$record/state.next" "$record/state" && sync -f "$record/state" "$record" || rc=1
  if [[ $rc == 0 ]]; then
    proof=$(reddit_archive_completion_proof "$record" "$reddit_archive_journals/$reddit_archive_journal_name") || { printf 'completion proof refused\n' >&2; exit 1; }
    printf '%s\n' "$proof" > "$record/completion-proof.next" && sync -f "$record/completion-proof.next" &&
      mv "$record/completion-proof.next" "$record/completion-proof" && sync -f "$record/completion-proof" "$record" &&
      stop_watchdog "$watchdog_unit" && [[ ! -e $record/watchdog-fired && ! -L $record/watchdog-fired ]] || rc=1
  fi
  printf 'reddit-archive-import id=%s date=%s state=%s exit=%s\n' "$id" "$day" "$state_name" "$rc"
  exit "$rc"
}
