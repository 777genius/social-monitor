#!/usr/bin/env bash
# Source inside the existing locked posts-once router. The router separately
# owns one-shot per-date claims, prior terminal receipts, lease and watchdog.
x_late_init() {
  [[ $# == 1 ]] || return 1
  case "$1" in
    2026-11-07) x_late_hour=22 ;;
    2026-11-04|2026-11-08|2026-11-10|2026-11-11|2026-11-12|2026-11-13) x_late_hour=21 ;;
    *) return 1 ;;
  esac
  [[ $1 < $today ]] || return 1
  day=$1
}

x_late_evidence() {
  local end
  end=$(date -u -d "$day + 1 day" +%F) || return 1
  # Aggregate-only read: never return post text, provider payloads or credentials.
  [[ $(psql_data "
    WITH scans AS (
      SELECT j.* FROM scan_jobs j
      JOIN source_bindings b ON b.id=j.source_binding_id
      JOIN source_catalog_entries c ON c.id=b.source_catalog_entry_id
      WHERE c.provider_key='x-twitter'
        AND j.tenant_id='00000000-0000-7000-8000-000000006101'
        AND j.workspace_id='00000000-0000-7000-8000-000000006102'
    )
    SELECT
      EXISTS (SELECT 1 FROM scans WHERE status='SUCCEEDED'
       AND completed_at < '${day} ${x_late_hour}:00:00+00'
       AND execution_metadata->>'targetPublishedWindowStartedAt'='${day}T00:00:00.000Z'
       AND execution_metadata->>'targetPublishedWindowEndedAt'='${end}T00:00:00.000Z')
      AND NOT EXISTS (SELECT 1 FROM scans WHERE requested_at >= '${day} ${x_late_hour}:00:00+00'
       AND (execution_metadata->>'targetPublishedWindowStartedAt' IS NULL
        OR execution_metadata->>'targetPublishedWindowEndedAt' IS NULL
        OR ((execution_metadata->>'targetPublishedWindowStartedAt')::timestamptz < '${end} 00:00:00+00'
         AND (execution_metadata->>'targetPublishedWindowEndedAt')::timestamptz > '${day} ${x_late_hour}:00:00+00')))
      AND NOT EXISTS (SELECT 1 FROM source_items WHERE provider_key='x-twitter'
       AND tenant_id='00000000-0000-7000-8000-000000006101'
       AND workspace_id='00000000-0000-7000-8000-000000006102'
       AND published_at >= '${day} ${x_late_hour}:00:00+00' AND published_at < '${end} 00:00:00+00')
  ") == t ]] || return 1
  python3 /usr/local/lib/social-monitor/x-late-window/ledger_admission.py \
    /srv/platform/projects/social-monitor/pipeline/from-do/runtime/x-collector/scweet_state.db "$day"
}

x_late_prior_allows() {
  local old_mode=$1 old_day=$2
  [[ $old_day == "$day" ]] || return 0
  # The existing router must validate the old terminal record and closed lease
  # before calling this hook. A prior X-late claim consumes the segment even on
  # failure; no automatic replay. Other known modes are checked by fresh DB and
  # ledger proof under the same router lock before a new claim opens.
  case "$old_mode" in
    current|current-slot|historical-hn-rss|historical-reddit-x|telegram-channel|import-rss-missing|import-hn-missing|import-hn-archive-missing|import-rss-archive-missing|import-reddit-archive-missing|import-reddit-archive-comments-missing|import-github-archive-missing)
      return 0 ;;
    *) return 1 ;;
  esac
}

x_late_partial_artifact() {
  local path=$1 day=${2:-$day} x_late_hour end
  case "$day" in
    2026-11-07) x_late_hour=22 ;;
    2026-11-04|2026-11-08|2026-11-10|2026-11-11|2026-11-12|2026-11-13) x_late_hour=21 ;;
    *) return 1 ;;
  esac
  end=$(date -u -d "$day + 1 day" +%F) || return 1
  [[ -f $path && ! -L $path ]] || return 1
  jq -e --arg day "$day" --arg start "${day}T${x_late_hour}:00:00.000Z" \
    --arg end "${end}T00:00:00.000Z" '
      .schemaVersion == 1 and .artifactFormat == "reader-summary-clean-real-day-collection-v1" and
      .generatedBy == "npm run run:reader-summary-clean-real-day-collection" and
      .run.collectionDate == $day and .blockingPassed == false and
      .inputs.scope.tenantId == "00000000-0000-7000-8000-000000006101" and
      .inputs.scope.workspaceId == "00000000-0000-7000-8000-000000006102" and
      .inputs.coverage == "PARTIAL_PROVIDER_WINDOW" and
      .inputs.providerKeys == ["x-twitter"] and
      .inputs.targetPublishedWindow == {startInclusive: $start, endExclusive: $end} and
      .model.liveNetwork == true and .model.liveNetworkProviderKeys == ["x-twitter"] and
      .model.rawProviderPayloadPersistedInReport == false and
      .model.rawPostTextPersistedInReport == false and .model.rawProviderConfigPersistedInReport == false and
      .qualityGates.noRawSecretFragments == true and
      ([.scans[].providerKey] | unique) == ["x-twitter"] and
      all(.scans[]; .attemptCount >= 1 and .attemptCount <= 3 and
        (.status == "succeeded" or .status == "failed" or .status == "skipped"))
    ' "$path" >/dev/null
}
