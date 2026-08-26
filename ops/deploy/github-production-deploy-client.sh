#!/usr/bin/env bash
set -euo pipefail

PATH=/usr/local/bin:/usr/bin:/bin

ZERO_SHA=0000000000000000000000000000000000000000
POSTGRES_POOL_BOOTSTRAP_VERSION=postgres-pool-v1
RELEASE_B_CONTROLLER_SHA=8b4aeb31e855ed379349a4e4827600009e174132
RELEASE_B_CURRENT_MAIN_SHA=77313ea03a3bac7d2298f4021d58124c810d291f
RELEASE_B_BRIDGE_SHA=b89950632b0cefa4f7b58b687cdfd6e6cd912a04
RELEASE_B_BRIDGE_TREE=0f2edeb95bbb658cebdb1aecdcda24026eca7d19
RELEASE_B_BRIDGE_BLOB=e02f7b7684f75121521065b43148708d545ab806
RELEASE_B_BRIDGE_PATH=ops/deploy/deploy-control-bridge-lib.sh
RELEASE_B_REVIEWED_TARGET_SHA=05744f99b2d13e47a64a7ff12ea2ab8893f5e88a
RELEASE_B_REVIEWED_TARGET_TREE=237c34068c057d2dfb5efaf9d606028cdaf18525
DAILY_C1_BRIDGE_POLICY_SHA=944fdb6da3071f70a69c7048c9fcdf1c2552603e
SSH_DIRECTORY=${DEPLOY_SSH_DIRECTORY:-${HOME:?HOME is required}/.ssh}
SSH_KEY_PATH=${DEPLOY_SSH_KEY_PATH:-$SSH_DIRECTORY/social-monitor-production}
SSH_KNOWN_HOSTS_PATH=${DEPLOY_SSH_KNOWN_HOSTS_PATH:-$SSH_DIRECTORY/known_hosts}
SSH_BIN=${DEPLOY_SSH_BIN:-ssh}
KNOWN_BACKEND_SOAK_SECONDS=300
MINIMUM_RECONCILE_WINDOW_SECONDS=600
DEFAULT_RECONCILE_ATTEMPTS=45
DEFAULT_RECONCILE_INTERVAL_SECONDS=15
DEFAULT_RECONCILE_WINDOW_SECONDS=$(((DEFAULT_RECONCILE_ATTEMPTS - 1) * DEFAULT_RECONCILE_INTERVAL_SECONDS))
DEFAULT_PLAN_READ_ATTEMPTS=4
DEFAULT_PLAN_READ_INTERVAL_SECONDS=3
DAILY_CANONICAL_RECOVERY_CONFIRMATION=reader-summary-daily-canonical-recovery-v4
DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN=invalid-product-retry-set-v1
RECONCILE_ATTEMPTS=${DEPLOY_RECONCILE_ATTEMPTS:-$DEFAULT_RECONCILE_ATTEMPTS}
RECONCILE_INTERVAL_SECONDS=${DEPLOY_RECONCILE_INTERVAL_SECONDS:-$DEFAULT_RECONCILE_INTERVAL_SECONDS}
PLAN_READ_ATTEMPTS=${DEPLOY_PLAN_READ_ATTEMPTS:-$DEFAULT_PLAN_READ_ATTEMPTS}
PLAN_READ_INTERVAL_SECONDS=${DEPLOY_PLAN_READ_INTERVAL_SECONDS:-$DEFAULT_PLAN_READ_INTERVAL_SECONDS}
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
  [[ $PLAN_READ_ATTEMPTS =~ ^[1-9][0-9]*$ ]] || fail 'plan read attempts must be positive'
  [[ $PLAN_READ_INTERVAL_SECONDS =~ ^[0-9]+$ ]] || fail 'plan read interval must be non-negative'
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
  local first_authorization_value=${3:-}
  local second_authorization_value=${4:-}
  local third_authorization_value=${5:-}
  if (($# == 5)); then
    "$SSH_BIN" "${SSH_OPTIONS[@]}" \
      -- "$DEPLOY_USER@$DEPLOY_HOST" \
      "$action $sha $first_authorization_value $second_authorization_value $third_authorization_value"
    return
  fi
  if (($# == 4)); then
    "$SSH_BIN" "${SSH_OPTIONS[@]}" \
      -- "$DEPLOY_USER@$DEPLOY_HOST" \
      "$action $sha $first_authorization_value $second_authorization_value"
    return
  fi
  if (($# == 3)); then
    "$SSH_BIN" "${SSH_OPTIONS[@]}" \
      -- "$DEPLOY_USER@$DEPLOY_HOST" \
      "$action $sha $first_authorization_value"
    return
  fi
  "$SSH_BIN" "${SSH_OPTIONS[@]}" \
    -- "$DEPLOY_USER@$DEPLOY_HOST" "$action $sha"
}

validate_maintenance_action() {
  case ${1:-} in
    disk-report|project-disk-cleanup|reader-summary-recover-missing-days|reader-summary-weekly-run|reader-summary-production-history|reader-summary-daily-canonical-recovery-v4|reader-summary-daily-terminal-set-receipt-v1|reader-summary-daily-scan-terminal-preimage-c1|reader-summary-daily-scan-terminal-repair-c1|reader-summary-daily-delivery-c1-run|reader-summary-daily-delivery-c1-contain) ;;
    *) fail 'maintenance action is not in the reviewed allowlist' ;;
  esac
}

validate_daily_canonical_recovery_retry_set_token() {
  [[ ${1:-} == "$DAILY_CANONICAL_RECOVERY_RETRY_SET_TOKEN" ]] || \
    fail 'daily canonical recovery requires invalid-product-retry-set-v1'
}

validate_daily_canonical_recovery_confirmation() {
  [[ ${1:-} == "$DAILY_CANONICAL_RECOVERY_CONFIRMATION" ]] || \
    fail 'daily canonical recovery requires its exact confirmation token'
}

validate_lowercase_hex_digest() {
  [[ ${1:-} =~ ^[0-9a-f]{64}$ ]] || \
    fail 'daily canonical recovery terminal-set digest must be a 64-character lowercase hexadecimal value'
}

validate_terminal_set_receipt_file() {
  local receipt_path=${1:-}
  [[ $# == 1 && -f $receipt_path && ! -L $receipt_path ]] || \
    fail 'terminal-set receipt must be one regular file'
  node - "$receipt_path" <<'NODE' || fail 'terminal-set receipt is invalid'
const fs = require("node:fs");
const raw = fs.readFileSync(process.argv[2], "utf8");
if (!raw.endsWith("\n") || raw.slice(0, -1).includes("\n") || raw.includes("\r")) {
  process.exit(1);
}
let receipt;
try { receipt = JSON.parse(raw.slice(0, -1)); } catch { process.exit(1); }
const keys = [
  "schemaVersion", "retrySetToken", "tenantId", "workspaceId",
  "requestedUtcDates", "terminalCount", "terminalSetSha256",
];
const dates = [
  "2026-07-25", "2026-07-26", "2026-07-27",
  "2026-07-28", "2026-07-29", "2026-07-30",
];
if (receipt === null || typeof receipt !== "object" || Array.isArray(receipt) ||
    JSON.stringify(receipt) + "\n" !== raw ||
    JSON.stringify(Object.keys(receipt)) !== JSON.stringify(keys) ||
    receipt.schemaVersion !== "reader_summary.daily_terminal_set_receipt.v1" ||
    receipt.retrySetToken !== "invalid-product-retry-set-v1" ||
    receipt.tenantId !== "00000000-0000-7000-8000-000000000901" ||
    receipt.workspaceId !== "00000000-0000-7000-8000-000000000902" ||
    JSON.stringify(receipt.requestedUtcDates) !== JSON.stringify(dates) ||
    receipt.terminalCount !== 6 ||
    typeof receipt.terminalSetSha256 !== "string" ||
    !/^[0-9a-f]{64}$/.test(receipt.terminalSetSha256)) process.exit(1);
NODE
  chmod 0444 "$receipt_path"
  [[ $(stat -c '%a' "$receipt_path") == 444 ]] || \
    fail 'terminal-set receipt could not be made immutable'
}

validate_daily_scan_terminal_artifact_file() {
  local artifact_kind=${1:-} artifact_path=${2:-} expected_preimage_sha256=${3:-}
  [[ $# == 2 || $# == 3 ]] || \
    fail 'daily scan terminal artifact validation requires kind, file, and optional expected digest'
  [[ $artifact_kind == preimage || $artifact_kind == repair ]] || \
    fail 'daily scan terminal artifact kind is invalid'
  [[ -f $artifact_path && ! -L $artifact_path ]] || \
    fail 'daily scan terminal artifact must be one regular file'
  if [[ $artifact_kind == repair ]]; then
    validate_lowercase_hex_digest "$expected_preimage_sha256"
  else
    [[ -z $expected_preimage_sha256 ]] || \
      fail 'daily scan terminal preimage artifact does not accept an expected digest'
  fi
  node - "$artifact_kind" "$artifact_path" "$expected_preimage_sha256" <<'NODE' || \
    fail 'daily scan terminal artifact is invalid'
const fs = require("node:fs");
const crypto = require("node:crypto");
const [kind, path, expectedDigest] = process.argv.slice(2);
const raw = fs.readFileSync(path, "utf8");
if (!raw.endsWith("\n") || raw.slice(0, -1).includes("\n") || raw.includes("\r")) {
  process.exit(1);
}
let artifact;
try { artifact = JSON.parse(raw.slice(0, -1)); } catch { process.exit(1); }
const keys = kind === "preimage"
  ? ["schemaVersion", "confirmation", "capturedAt", "reviewedPreimageSha256", "targetCount", "redactedTargetsSha256", "targets"]
  : ["schemaVersion", "confirmation", "reviewedPreimageSha256", "transactionTimestamp", "targetCount", "restoreEvidenceSha256", "durableReceipt"];
const timestampKey = kind === "preimage" ? "capturedAt" : "transactionTimestamp";
const schemaVersion = kind === "preimage"
  ? "reader_summary.daily_scan_terminal_preimage.c1"
  : "reader_summary.daily_scan_terminal_repair.c1";
const digest = artifact?.reviewedPreimageSha256;
const targetKeys = ["target", "jobId", "sourceBindingId", "leaseId", "leasePresent", "jobStatus", "attemptStatus", "attemptNumber", "fetched", "inserted", "skippedDuplicates", "projected", "failureReasonSha256", "schedulerDecisionCount", "downstream", "failureMetadataSqlNull", "executionMetadataSqlNull"];
const downstreamKeys = ["failureQueue", "githubCandidates", "githubResults", "engagementObservations", "sourceItems", "feedItems", "outbox", "inbox", "idempotency", "cursor"];
const fixedTargets = [
  { target: "hacker_news", jobId: "e630ed7d-42b7-4bf0-a747-f9bdf0f8a9d7", sourceBindingId: "0348ff97-3925-4d04-a192-7e782badbf50", leaseId: "703fd7b5-cf83-4508-a5b1-5a9dfdc4643e", leasePresent: true, jobStatus: "ENQUEUED", attemptStatus: "RUNNING", failureReasonSha256: null },
  { target: "reddit", jobId: "b9de1ac8-4490-48d6-befa-a25472b5e94a", sourceBindingId: "8e753ea9-fb03-4c05-8288-6e871cb20b27", leaseId: null, leasePresent: false, jobStatus: "REQUESTED", attemptStatus: "FAILED", failureReasonSha256: "f6080204874629cf05223f8dc7650330a89106f0e4562a92b4b5310bd9f90ad1" },
];
const validTargets = kind !== "preimage" || (Array.isArray(artifact?.targets) &&
  artifact.targets.length === 2 && artifact.targets.every((target, index) => {
    const fixed = fixedTargets[index];
    return target !== null && typeof target === "object" && !Array.isArray(target) &&
      JSON.stringify(Object.keys(target)) === JSON.stringify(targetKeys) &&
      Object.entries(fixed).every(([key, value]) => target[key] === value) &&
      target.attemptNumber === 1 &&
      [target.fetched, target.inserted, target.skippedDuplicates, target.projected].every(value => Number.isSafeInteger(value) && value >= 0) &&
      target.schedulerDecisionCount === 1 &&
      target.downstream !== null && typeof target.downstream === "object" && !Array.isArray(target.downstream) &&
      JSON.stringify(Object.keys(target.downstream)) === JSON.stringify(downstreamKeys) &&
      downstreamKeys.every(key => target.downstream[key] === 0) &&
      typeof target.failureMetadataSqlNull === "boolean" &&
      typeof target.executionMetadataSqlNull === "boolean";
  }) && typeof artifact.redactedTargetsSha256 === "string" &&
  artifact.redactedTargetsSha256 === crypto.createHash("sha256").update(JSON.stringify(artifact.targets), "utf8").digest("hex"));
if (artifact === null || typeof artifact !== "object" || Array.isArray(artifact) ||
    JSON.stringify(artifact) + "\n" !== raw ||
    JSON.stringify(Object.keys(artifact)) !== JSON.stringify(keys) ||
    artifact.schemaVersion !== schemaVersion ||
    artifact.confirmation !== "reader-summary-daily-scan-terminal-repair-c1" ||
    typeof artifact[timestampKey] !== "string" ||
    Number.isNaN(Date.parse(artifact[timestampKey])) ||
    typeof digest !== "string" || !/^[0-9a-f]{64}$/.test(digest) ||
    artifact.targetCount !== 2 ||
    !validTargets ||
    (kind === "repair" && (digest !== expectedDigest ||
      typeof artifact.restoreEvidenceSha256 !== "string" ||
      !/^[0-9a-f]{64}$/.test(artifact.restoreEvidenceSha256) ||
      artifact.durableReceipt !== true))) process.exit(1);
NODE
  chmod 0444 "$artifact_path"
  [[ $(stat -c '%a' "$artifact_path") == 444 ]] || \
    fail 'daily scan terminal artifact could not be made immutable'
}

validate_daily_delivery_c1_artifact_file() {
  local kind=${1:-} artifact_path=${2:-} expected_sha=${3:-}
  local expected_date=${4:-}
  [[ $kind == run || $kind == contain ]] || fail 'daily delivery C1 artifact kind is invalid'
  [[ -f $artifact_path && ! -L $artifact_path ]] || fail 'daily delivery C1 artifact must be one regular file'
  validate_sha "$expected_sha"
  if [[ $kind == run ]]; then
    [[ $# == 4 && $expected_date =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || fail 'daily delivery C1 run artifact requires its expected date'
  else
    [[ $# == 3 ]] || fail 'daily delivery C1 containment artifact accepts no date'
  fi
  node - "$kind" "$artifact_path" "$expected_sha" "$expected_date" <<'NODE' || fail 'daily delivery C1 artifact is invalid'
const fs = require("node:fs");
const [kind, path, expectedSha, expectedDate] = process.argv.slice(2);
const raw = fs.readFileSync(path, "utf8");
if (!raw.endsWith("\n") || raw.slice(0, -1).includes("\n") || raw.includes("\r")) process.exit(1);
let value;
try { value = JSON.parse(raw.slice(0, -1)); } catch { process.exit(1); }
const runKeys = ["schemaVersion", "confirmation", "releaseSha", "requestedUtcDate", "eligibleThrough", "nextUnresolvedUtcDate", "publicationCount", "publicationSetSha256", "receiptSha256", "journalState", "serviceInvocationId", "serviceBootId", "baselineSha256", "invocationOrigin", "startedAtRealtimeUsec", "serviceResult", "exitCode", "exitStatus", "owner", "ownerReleaseSha", "legacyTimerUnitFileState", "legacyTimerActiveState", "legacyTimerNextElapseUSecRealtime", "v6TimerUnitFileState", "v6TimerActiveState"];
const containKeys = ["schemaVersion", "confirmation", "releaseSha", "state", "scheduleResumePolicy", "legacyTimerUnitFileState", "legacyTimerActiveState", "v6TimerUnitFileState", "v6TimerActiveState", "legacyServiceActiveState", "v6ServiceActiveState"];
const keys = kind === "run" ? runKeys : containKeys;
const hex = item => typeof item === "string" && /^[0-9a-f]{64}$/.test(item);
const positiveInteger = item => typeof item === "string" && /^[1-9][0-9]*$/.test(item);
const invocation = item => typeof item === "string" && /^[0-9a-f]{32}$/.test(item);
const uuid = item => typeof item === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(item);
const sha = item => typeof item === "string" && /^[0-9a-f]{40}$/.test(item);
const next = new Date(`${expectedDate}T00:00:00.000Z`);
const first = new Date("2026-07-23T00:00:00.000Z");
const expectedCount = Math.floor((next.getTime() - first.getTime()) / 86400000) + 1;
next.setUTCDate(next.getUTCDate() + 1);
const validRun = kind !== "run" || (
  value.schemaVersion === "reader_summary.daily_delivery_c1_run.v2" &&
  value.confirmation === "reader-summary-daily-delivery-c1-run" &&
  value.requestedUtcDate === expectedDate && value.eligibleThrough === expectedDate &&
  value.nextUnresolvedUtcDate === next.toISOString().slice(0, 10) &&
  value.publicationCount === expectedCount && hex(value.publicationSetSha256) &&
  hex(value.receiptSha256) && value.journalState === "SUCCESS" &&
  invocation(value.serviceInvocationId) && uuid(value.serviceBootId) &&
  hex(value.baselineSha256) && /^(automatic|manual-reconcile)$/.test(value.invocationOrigin) &&
  positiveInteger(value.startedAtRealtimeUsec) && value.serviceResult === "success" &&
  value.exitCode === "exited" && value.exitStatus === "0" &&
  value.owner === "LEGACY" && sha(value.ownerReleaseSha) &&
  value.legacyTimerUnitFileState === "enabled" && value.legacyTimerActiveState === "active" &&
  typeof value.legacyTimerNextElapseUSecRealtime === "string" &&
  value.legacyTimerNextElapseUSecRealtime.length > 0 &&
  value.legacyTimerNextElapseUSecRealtime !== "n/a" &&
  value.v6TimerUnitFileState === "disabled" && value.v6TimerActiveState === "inactive"
);
const validContain = kind !== "contain" || (value.schemaVersion === "reader_summary.daily_delivery_c1_containment.v1" && value.confirmation === "reader-summary-daily-delivery-c1-contain" && value.state === "CONTAINED" && value.scheduleResumePolicy === "separate-reviewed-clearance-required" && value.legacyTimerUnitFileState === "disabled" && value.legacyTimerActiveState === "inactive" && value.v6TimerUnitFileState === "disabled" && value.v6TimerActiveState === "inactive" && value.legacyServiceActiveState === "inactive" && value.v6ServiceActiveState === "inactive");
if (value === null || typeof value !== "object" || Array.isArray(value) || JSON.stringify(value) + "\n" !== raw || JSON.stringify(Object.keys(value)) !== JSON.stringify(keys) || value.releaseSha !== expectedSha || !validRun || !validContain) process.exit(1);
NODE
  chmod 0444 "$artifact_path"
  [[ $(stat -c '%a' "$artifact_path") == 444 ]] || fail 'daily delivery C1 artifact could not be made immutable'
}

run_maintenance() {
  local sha=$1
  local maintenance_action=$2
  local first_authorization_value=${3:-}
  local second_authorization_value=${4:-}
  local third_authorization_value=${5:-}
  validate_sha "$sha"
  validate_maintenance_action "$maintenance_action"
  validate_remote_environment
  if [[ $maintenance_action == reader-summary-daily-canonical-recovery-v4 ]]; then
    if (($# == 4)); then
      validate_daily_canonical_recovery_retry_set_token "$first_authorization_value"
      validate_lowercase_hex_digest "$second_authorization_value"
      run_remote "$maintenance_action" "$sha" "$first_authorization_value" \
        "$second_authorization_value"
      return
    fi
    if (($# == 5)); then
      validate_daily_canonical_recovery_confirmation "$first_authorization_value"
      validate_lowercase_hex_digest "$second_authorization_value"
      validate_lowercase_hex_digest "$third_authorization_value"
      run_remote "$maintenance_action" "$sha" "$first_authorization_value" \
        "$second_authorization_value" "$third_authorization_value"
      return
    fi
    fail 'daily canonical recovery requires either retry-set token and digest or its exact legacy confirmation'
  fi
  if [[ $maintenance_action == reader-summary-daily-scan-terminal-repair-c1 ]]; then
    [[ $# == 4 && \
       $first_authorization_value == reader-summary-daily-scan-terminal-repair-c1 ]] || \
      fail 'daily scan terminal repair requires exact confirmation and reviewed preimage SHA-256'
    validate_lowercase_hex_digest "$second_authorization_value"
    run_remote "$maintenance_action" "$sha" "$first_authorization_value" \
      "$second_authorization_value"
    return
  fi
  if [[ $maintenance_action == reader-summary-daily-delivery-c1-run ]]; then
    [[ $# == 4 && $first_authorization_value == "$maintenance_action" && \
       $second_authorization_value =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || \
      fail 'daily delivery C1 run requires exact confirmation and UTC recovery-through date'
    run_remote "$maintenance_action" "$sha" "$first_authorization_value" \
      "$second_authorization_value"
    return
  fi
  if [[ $maintenance_action == reader-summary-daily-delivery-c1-contain ]]; then
    [[ $# == 4 && $first_authorization_value == "$maintenance_action" && \
       $second_authorization_value == "$sha" ]] || \
      fail 'daily delivery C1 containment requires exact confirmation and current READY SHA'
    run_remote "$maintenance_action" "$sha" "$first_authorization_value" \
      "$second_authorization_value"
    return
  fi
  if [[ $maintenance_action == reader-summary-production-history ]]; then
    [[ $# == 3 && $first_authorization_value =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}$ ]] || \
      fail 'historical reader-summary recovery requires one UTC recovery-through date'
    run_remote "$maintenance_action" "$sha" "$first_authorization_value"
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
  local sha=$1 attempt output status
  for ((attempt = 1; attempt <= PLAN_READ_ATTEMPTS; attempt += 1)); do
    if output=$(run_remote plan "$sha"); then
      status=0
    else
      status=$?
    fi
    if ((status == 0)); then
      parse_plan "$output" || return 65
      return 0
    fi
    ((status == 255 && attempt < PLAN_READ_ATTEMPTS)) || return "$status"
    printf 'deploy-client: plan SSH read disconnected; retrying (%d/%d)\n' \
      "$attempt" "$PLAN_READ_ATTEMPTS" >&2
    sleep "$PLAN_READ_INTERVAL_SECONDS"
  done
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

inspect_plan() {
  local sha=$1 status
  PLAN_POSTGRES_POOL_REPAIR=false
  if capture_plan "$sha"; then
    status=0
  else
    status=$?
  fi
  ((status == 0)) || fail "inspect-plan command failed with status $status"
  print_plan
}

plan_is_fully_reconciled() {
  [[ $PLAN_FRONTEND == false && $PLAN_BACKEND == false && \
     $PLAN_CONTROL == false && $PLAN_X_COLLECTOR == false && \
     $PLAN_POSTGRES_POOL_BOOTSTRAP == "$POSTGRES_POOL_BOOTSTRAP_VERSION" && \
     $PLAN_POSTGRES_POOL_BOOTSTRAP_SHA != "$ZERO_SHA" && \
     $PLAN_BACKEND_BASE != "$ZERO_SHA" ]]
}

plan_is_exact_release_b_bridge_transition() {
  [[ $PLAN_FRONTEND == false && $PLAN_BACKEND == false && \
     $PLAN_CONTROL == true && $PLAN_X_COLLECTOR == false && \
     $PLAN_POSTGRES_POOL_BOOTSTRAP == "$POSTGRES_POOL_BOOTSTRAP_VERSION" && \
     $PLAN_POSTGRES_POOL_BOOTSTRAP_SHA == "$RELEASE_B_CONTROLLER_SHA" && \
     $PLAN_BACKEND_BASE == "$RELEASE_B_CONTROLLER_SHA" ]]
}

plan_is_exact_release_b_target_transition() {
  [[ $PLAN_FRONTEND == false && $PLAN_BACKEND == true && \
     $PLAN_BACKEND_BASE == "$RELEASE_B_CONTROLLER_SHA" && \
     $PLAN_CONTROL == true && $PLAN_X_COLLECTOR == false && \
     $PLAN_POSTGRES_POOL_BOOTSTRAP == "$POSTGRES_POOL_BOOTSTRAP_VERSION" && \
     $PLAN_POSTGRES_POOL_BOOTSTRAP_SHA == "$RELEASE_B_CONTROLLER_SHA" && \
     $PLAN_POSTGRES_POOL_REPAIR == false ]]
}

plan_is_exact_release_b_current_main_target_transition() {
  [[ $PLAN_FRONTEND == false && $PLAN_BACKEND == false && \
     $PLAN_BACKEND_BASE == "$RELEASE_B_CURRENT_MAIN_SHA" && \
     $PLAN_CONTROL == true && $PLAN_X_COLLECTOR == false && \
     $PLAN_POSTGRES_POOL_BOOTSTRAP == "$POSTGRES_POOL_BOOTSTRAP_VERSION" && \
     $PLAN_POSTGRES_POOL_BOOTSTRAP_SHA == "$RELEASE_B_CURRENT_MAIN_SHA" && \
     $PLAN_POSTGRES_POOL_REPAIR == false ]]
}

verify_release_b_bridge_identity() {
  local sha=$1 repository=${GITHUB_WORKSPACE:-.}
  local actual_tree delta entry mode type object path extra
  local -a ancestry=()

  [[ $sha == "$RELEASE_B_BRIDGE_SHA" ]] || \
    fail 'Release B bridge SHA is not the reviewed pin'
  read -r -a ancestry <<< "$(git -C "$repository" \
    rev-list --parents -n 1 "$sha" 2>/dev/null)" || \
    fail 'Release B bridge ancestry cannot be inspected'
  [[ ${#ancestry[@]} == 2 && ${ancestry[0]} == "$sha" && \
     ${ancestry[1]} == "$RELEASE_B_CONTROLLER_SHA" ]] || \
    fail 'Release B bridge is not the exact controller child'
  actual_tree=$(git -C "$repository" rev-parse "$sha^{tree}" 2>/dev/null) || \
    fail 'Release B bridge tree cannot be inspected'
  [[ $actual_tree == "$RELEASE_B_BRIDGE_TREE" ]] || \
    fail 'Release B bridge tree does not match its reviewed pin'
  delta=$(git -C "$repository" diff --name-only --no-renames \
    "$RELEASE_B_CONTROLLER_SHA" "$sha" -- 2>/dev/null) || \
    fail 'Release B bridge delta cannot be inspected'
  [[ $delta == "$RELEASE_B_BRIDGE_PATH" ]] || \
    fail 'Release B bridge changes more than its reviewed controller policy'
  entry=$(git -C "$repository" ls-tree "$sha" -- \
    "$RELEASE_B_BRIDGE_PATH" 2>/dev/null) || \
    fail 'Release B bridge policy blob cannot be inspected'
  read -r mode type object path extra <<< "$entry"
  [[ -z ${extra:-} && $mode == 100644 && $type == blob && \
     $object == "$RELEASE_B_BRIDGE_BLOB" && \
     $path == "$RELEASE_B_BRIDGE_PATH" ]] || \
    fail 'Release B bridge policy blob does not match its reviewed pin'
}

verify_release_b_reviewed_target_identity() {
  local sha=$1 requested_target=$2 repository=${GITHUB_WORKSPACE:-.}
  local actual_tree delta entries first_parent_history parent
  local -a ancestry=()
  local requested_contains_reviewed=false

  [[ $sha == "$RELEASE_B_REVIEWED_TARGET_SHA" ]] || \
    fail 'Release B reviewed target SHA is not the reviewed pin'
  read -r -a ancestry <<< "$(git -C "$repository" \
    rev-list --parents -n 1 "$sha" 2>/dev/null)" || \
    fail 'Release B reviewed target ancestry cannot be inspected'
  [[ ${#ancestry[@]} == 3 && ${ancestry[0]} == "$sha" && \
     ${ancestry[1]} == "$RELEASE_B_CURRENT_MAIN_SHA" && \
     ${ancestry[2]} == "$RELEASE_B_BRIDGE_SHA" ]] || \
    fail 'Release B reviewed target does not have its exact ordered parents'
  actual_tree=$(git -C "$repository" rev-parse "$sha^{tree}" 2>/dev/null) || \
    fail 'Release B reviewed target tree cannot be inspected'
  [[ $actual_tree == "$RELEASE_B_REVIEWED_TARGET_TREE" ]] || \
    fail 'Release B reviewed target tree does not match its reviewed pin'
  delta=$(git -C "$repository" diff --name-only --no-renames \
    "$RELEASE_B_CURRENT_MAIN_SHA" "$sha" -- 2>/dev/null) || \
    fail 'Release B reviewed target delta cannot be inspected'
  [[ $delta == $'.github/workflows/production-deploy.yml\nops/deploy/deploy-control-bridge-lib.sh\nops/deploy/github-production-deploy-client.sh\nops/deploy/github-production-deploy-client.test.sh\nops/deploy/production-release-b-bridge-order.test.sh\nops/deploy/rabbitmq-quorum-deploy-bridge-transition.test.sh' ]] || \
    fail 'Release B reviewed target changes outside its exact reviewed delta'
  entries=$(git -C "$repository" ls-tree "$sha" -- \
    .github/workflows/production-deploy.yml \
    ops/deploy/deploy-control-bridge-lib.sh \
    ops/deploy/github-production-deploy-client.sh \
    ops/deploy/github-production-deploy-client.test.sh \
    ops/deploy/production-release-b-bridge-order.test.sh \
    ops/deploy/rabbitmq-quorum-deploy-bridge-transition.test.sh 2>/dev/null) || \
    fail 'Release B reviewed target files cannot be inspected'
  [[ $entries == $'100644 blob 1e85c36aaeb064df3235e8093acb6124d64d0398\t.github/workflows/production-deploy.yml\n100644 blob e02f7b7684f75121521065b43148708d545ab806\tops/deploy/deploy-control-bridge-lib.sh\n100755 blob 086a7d95d2a8125cd6c8f2dd39b05fe42e4c9482\tops/deploy/github-production-deploy-client.sh\n100755 blob 8db3980a225a8222765dfa95c4fd895bfb20712a\tops/deploy/github-production-deploy-client.test.sh\n100755 blob 47f97467223fa0e7a0b779741d676ad4f19b7bea\tops/deploy/production-release-b-bridge-order.test.sh\n100644 blob ab7e2c5cb06d85dce0d3e2427d8af7e9636b32ad\tops/deploy/rabbitmq-quorum-deploy-bridge-transition.test.sh' ]] || \
    fail 'Release B reviewed target file identities do not match their pins'

  git -C "$repository" cat-file -e "$requested_target^{commit}" 2>/dev/null || \
    fail 'Release B requested target commit cannot be inspected'
  first_parent_history=$(git -C "$repository" rev-list --first-parent \
    "$requested_target" 2>/dev/null) || \
    fail 'Release B requested target first-parent history cannot be inspected'
  while IFS= read -r parent; do
    if [[ $parent == "$sha" ]]; then
      requested_contains_reviewed=true
      break
    fi
  done <<< "$first_parent_history"
  [[ $requested_contains_reviewed == true ]] || \
    fail 'Release B requested target does not first-parent-contain the reviewed target'
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

deploy_release_b_reviewed_target() {
  local target=$1 status
  if capture_plan "$target"; then
    status=0
  else
    status=$?
  fi
  ((status == 0)) || fail "Release B reviewed target plan failed with status $status"
  print_plan
  plan_is_fully_reconciled && return 0
  { plan_is_exact_release_b_target_transition || \
    plan_is_exact_release_b_current_main_target_transition; } || \
    fail 'Release B reviewed target plan is not an exact admitted transition'
  deploy_once "$target"
}

prepare_release_b_bridge() {
  local sha=$1 bridge=$2 current_main=$3 bridge_target=$4 requested_target=$5 status
  local target_plan_exact=false current_main_target_plan_exact=false
  [[ $sha == "$RELEASE_B_CONTROLLER_SHA" ]] || \
    fail 'Release B controller SHA is not the reviewed pin'
  [[ $current_main == "$RELEASE_B_CURRENT_MAIN_SHA" ]] || \
    fail 'Release B current-main SHA is not the reviewed pin'
  verify_release_b_bridge_identity "$bridge"
  verify_release_b_reviewed_target_identity "$bridge_target" "$requested_target"

  if capture_plan "$bridge_target"; then
    print_plan
    plan_is_fully_reconciled && return 0
    plan_is_exact_release_b_target_transition && target_plan_exact=true
    plan_is_exact_release_b_current_main_target_transition && \
      current_main_target_plan_exact=true
  else
    status=$?
    ((status == 1)) || fail "Release B target preflight plan failed with status $status"
  fi
  if capture_plan "$current_main"; then
    print_plan
    if plan_is_fully_reconciled; then
      [[ $current_main_target_plan_exact == true ]] || \
        fail 'Release B reviewed target is not the exact current-main transition'
      deploy_release_b_reviewed_target "$bridge_target"
      return 0
    fi
    plan_is_exact_release_b_target_transition || \
      fail 'Release B current-main plan is not the exact controller transition'
  else
    status=$?
    ((status == 1)) || fail "Release B current-main plan failed with status $status"
  fi
  [[ $target_plan_exact == true ]] || \
    fail 'Release B target plan is not the exact controller transition'
  if capture_plan "$bridge"; then
    print_plan
    if plan_is_fully_reconciled; then
      deploy_release_b_reviewed_target "$bridge_target"
      return 0
    fi
    if plan_is_exact_release_b_bridge_transition; then
      deploy_once "$bridge"
      deploy_release_b_reviewed_target "$bridge_target"
      return 0
    fi
  else
    status=$?
    ((status == 1)) || \
      fail "Release B bridge preflight plan failed with status $status"
  fi
  if capture_plan "$sha"; then
    status=0
  else
    status=$?
  fi
  ((status == 0)) || \
    fail "Release B controller plan failed with status $status"
  print_plan
  plan_is_fully_reconciled || deploy_once "$sha"
  if capture_plan "$bridge"; then
    status=0
  else
    status=$?
  fi
  ((status == 0)) || fail "Release B bridge plan failed with status $status"
  print_plan
  if plan_is_fully_reconciled; then
    deploy_release_b_reviewed_target "$bridge_target"
    return 0
  fi
  plan_is_exact_release_b_bridge_transition || \
    fail 'Release B bridge plan is not the exact fresh control-only transition'
  deploy_once "$bridge"
  deploy_release_b_reviewed_target "$bridge_target"
}

install_daily_c1_bridge_policy() {
  local sha=$1 status
  [[ $sha == "$DAILY_C1_BRIDGE_POLICY_SHA" ]] || \
    fail 'daily C1 bridge policy SHA is not the reviewed pin'
  if run_remote deploy "$sha"; then
    status=0
  else
    status=$?
  fi
  ((status == 0 || status == 255)) || \
    fail "daily C1 bridge policy install failed with status $status"
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
  inspect-plan)
    [[ $# == 2 ]] || fail 'inspect-plan requires a target SHA'
    validate_sha "$2"
    validate_remote_environment
    inspect_plan "$2"
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
  prepare-release-b-bridge)
    [[ $# == 6 ]] || fail 'prepare-release-b-bridge requires controller, bridge, current-main, reviewed-target, and requested-target pins'
    validate_sha "$2"
    validate_sha "$3"
    validate_sha "$4"
    validate_sha "$5"
    validate_sha "$6"
    validate_remote_environment
    prepare_release_b_bridge "$2" "$3" "$4" "$5" "$6"
    ;;
  install-daily-c1-bridge-policy)
    [[ $# == 2 ]] || fail 'install-daily-c1-bridge-policy requires its pinned SHA'
    validate_sha "$2"
    validate_remote_environment
    install_daily_c1_bridge_policy "$2"
    ;;
  maintenance)
    [[ $# == 3 || $# == 4 || $# == 5 || $# == 6 ]] || \
      fail 'maintenance requires a target SHA, action, and optional retry-set authorization'
    if (($# == 6)); then
      run_maintenance "$2" "$3" "$4" "$5" "$6"
    elif (($# == 5)); then
      run_maintenance "$2" "$3" "$4" "$5"
    elif (($# == 4)); then
      run_maintenance "$2" "$3" "$4"
    else
      run_maintenance "$2" "$3"
    fi
    ;;
  validate-terminal-set-receipt)
    [[ $# == 2 ]] || fail 'validate-terminal-set-receipt requires one file'
    validate_terminal_set_receipt_file "$2"
    ;;
  validate-daily-scan-terminal-artifact)
    [[ $# == 3 || $# == 4 ]] || \
      fail 'validate-daily-scan-terminal-artifact requires kind, file, and optional expected digest'
    if [[ $# == 4 ]]; then
      validate_daily_scan_terminal_artifact_file "$2" "$3" "$4"
    else
      validate_daily_scan_terminal_artifact_file "$2" "$3"
    fi
    ;;
  validate-daily-delivery-c1-artifact)
    [[ $# == 4 || $# == 5 ]] || \
      fail 'validate-daily-delivery-c1-artifact requires kind, file, SHA, and optional date'
    if [[ $# == 5 ]]; then
      validate_daily_delivery_c1_artifact_file "$2" "$3" "$4" "$5"
    else
      validate_daily_delivery_c1_artifact_file "$2" "$3" "$4"
    fi
    ;;
  *) fail 'command is not in the reviewed client allowlist' ;;
esac
