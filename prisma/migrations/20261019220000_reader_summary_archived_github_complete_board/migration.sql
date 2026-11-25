-- @social-monitor-forward-migration
-- Record archived GitHub trending board publication evidence for days whose
-- board comes from immutable archive custody instead of a live scan envelope.
-- The archived board is bound exactly as published (1..10 contiguous ranks).
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE OR REPLACE FUNCTION public.record_reader_summary_weekly_publication_evidence_base(target_publication_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'pg_temp'
AS $function$ DECLARE
v_artifact "reader_summary_artifacts"%ROWTYPE;
v_body JSONB; v_bytes BYTEA; v_canonical TEXT; v_day DATE;
v_github JSONB; v_github_audit JSONB; v_github_body JSONB; v_github_count INTEGER; v_archived_count INTEGER;
v_existing "reader_summary_weekly_publication_evidence"%ROWTYPE;
v_feed_lock_count INTEGER; v_source_lock_count INTEGER; v_job "reader_summary_jobs"%ROWTYPE;
v_provider JSONB; v_provider_counts JSONB; v_provider_sha TEXT;
v_publication "reader_summary_publications"%ROWTYPE;
v_report JSONB; v_report_sha TEXT; v_proof_sha TEXT; v_sha TEXT; v_scope JSONB; BEGIN
SELECT * INTO STRICT v_publication FROM "reader_summary_publications"
WHERE "id" = target_publication_id; SELECT * INTO STRICT v_job FROM "reader_summary_jobs"
WHERE "id" = v_publication."reader_summary_job_id"; SELECT * INTO STRICT v_artifact
FROM "reader_summary_artifacts" WHERE "id" = v_publication."reader_summary_artifact_id";
SELECT * INTO v_existing FROM "reader_summary_weekly_publication_evidence"
WHERE "publication_id" = target_publication_id;
v_day := (v_publication."period_started_at" AT TIME ZONE 'UTC')::DATE;
IF v_publication."publication_kind" <> 'EXACT' OR v_publication."cadence" <> 'daily'
OR v_publication."period_timezone" <> 'UTC' OR v_publication."period_started_at" <>
date_trunc('day', v_publication."period_started_at" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
OR v_publication."period_ended_at" <> v_publication."period_started_at" + INTERVAL '1 day'
OR v_artifact."tenant_id" <> v_publication."tenant_id"
OR v_artifact."workspace_id" <> v_publication."workspace_id"
OR v_artifact."id" <> v_publication."id" OR v_artifact."scope_type" <> v_publication."scope_type"
OR v_artifact."scope_key" <> v_publication."scope_key"
OR v_artifact."scope_type" NOT IN ('workspace', 'interest')
OR (v_artifact."scope_type" = 'workspace' AND v_artifact."interest_id" IS NOT NULL)
OR (v_artifact."scope_type" = 'interest' AND (
v_artifact."interest_id" IS NULL OR v_artifact."scope_key" <>
'interest:' || v_artifact."interest_id"::TEXT ))
OR v_artifact."cadence" <> v_publication."cadence" OR v_artifact."period_started_at" <>
v_publication."period_started_at" OR v_artifact."period_ended_at" <> v_publication."period_ended_at"
OR v_artifact."period_timezone" <> v_publication."period_timezone"
OR v_artifact."period_key" <> v_publication."period_key"
OR v_artifact."model_version" <> v_publication."model_version" OR (
v_existing."publication_id" IS NULL AND v_artifact."status" <> v_publication."semantic_status" )
OR ( v_existing."publication_id" IS NOT NULL AND v_artifact."status" NOT IN (
v_publication."semantic_status", 'SUPERSEDED' ) ) OR v_job."tenant_id" <> v_publication."tenant_id"
OR v_job."workspace_id" <> v_publication."workspace_id"
OR v_job."scope_type" <> v_publication."scope_type"
OR v_job."scope_key" <> v_publication."scope_key"
OR v_job."interest_id" IS DISTINCT FROM v_artifact."interest_id"
OR v_job."cadence" <> v_publication."cadence"
OR v_job."period_started_at" <> v_publication."period_started_at"
OR v_job."period_ended_at" <> v_publication."period_ended_at"
OR v_job."period_timezone" <> v_publication."period_timezone"
OR v_job."period_key" <> v_publication."period_key"
OR v_job."user_id" IS DISTINCT FROM v_artifact."user_id" OR v_job."subscription_id" IS DISTINCT FROM
v_artifact."subscription_id" OR v_job."requested_at" <> v_publication."requested_at"
OR v_job."status" <> v_publication."semantic_status"
OR v_job."reader_summary_artifact_id" <> v_artifact."id"
OR v_publication."requested_utc_date" <> v_day OR NOT EXISTS (
SELECT 1 FROM "reader_summary_publication_slots" AS slot
WHERE slot."tenant_id" = v_publication."tenant_id"
AND slot."workspace_id" = v_publication."workspace_id"
AND slot."scope_type" = v_publication."scope_type" AND slot."scope_key" = v_publication."scope_key"
AND slot."cadence" = v_publication."cadence"
AND slot."period_started_at" = v_publication."period_started_at"
AND slot."period_ended_at" = v_publication."period_ended_at"
AND slot."period_timezone" = v_publication."period_timezone" AND (
v_existing."publication_id" IS NOT NULL OR slot."current_publication_id" = v_publication."id" )
) THEN RAISE EXCEPTION 'weekly publication evidence authority is incomplete'; END IF; IF (
v_publication."semantic_status" = 'NO_SIGNAL' AND (
NOT COALESCE(v_artifact."quality_signals"->'qualityFlags' ? 'no_signal', FALSE) OR btrim(COALESCE(
v_artifact."artifact_payload"->>'noSignalReason', '' )) = '' ) ) OR (
v_publication."semantic_status" = 'COMPLETED'
AND COALESCE(v_artifact."quality_signals"->'qualityFlags' ? 'no_signal', FALSE) ) THEN
RAISE EXCEPTION 'weekly publication evidence semantic status is not real'; END IF;
v_report := jsonb_build_object( 'schemaVersion', 'reader_summary.publication_report.v1',
'semanticStatus', v_publication."semantic_status"::TEXT, 'modelVersion', v_artifact."model_version",
'promptVersion', v_artifact."prompt_version",
'headline', v_artifact."headline", 'summaryText', v_artifact."summary_text",
'artifactPayload', v_artifact."artifact_payload", 'citations', v_artifact."citations",
'qualitySignals', v_artifact."quality_signals" || jsonb_build_object(
'publicationGeneration', jsonb_build_object( 'requestedAt', to_char(
v_job."requested_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"' ) ) ) );
v_report_sha := encode(sha256(convert_to( public.reader_summary_v3_publication_canonical_json(v_report, v_job."selection_strategy", 'report'), 'UTF8'
)), 'hex'); v_proof_sha := encode(sha256(convert_to(
public.reader_summary_v3_publication_canonical_json(v_publication."exact_proof", v_job."selection_strategy", 'weekly'), 'UTF8' )), 'hex');
IF btrim(v_publication."report_sha256") <> v_report_sha
OR btrim(v_publication."proof_sha256") <> v_proof_sha THEN
RAISE EXCEPTION 'weekly publication report or proof authority drifted'; END IF;
IF v_existing."publication_id" IS NULL THEN
IF jsonb_typeof(v_artifact."citations") IS DISTINCT FROM 'array' OR EXISTS ( SELECT 1
FROM jsonb_array_elements(v_artifact."citations") AS citation(value)
WHERE jsonb_typeof(citation.value) IS DISTINCT FROM 'object' OR NOT citation.value ?& ARRAY[
'citationId', 'field', 'feedItemId', 'sourceItemId', 'providerKey' ]
OR jsonb_object_length(citation.value) <>
CASE WHEN citation.value ? 'canonicalUrl' THEN 6 ELSE 5 END
OR btrim(COALESCE(citation.value->>'citationId', '')) = '' OR citation.value->>'field' NOT IN (
'title', 'bodyPreview', 'canonicalUrl' ) OR citation.value->>'providerKey' <> ALL(ARRAY[
'github-trending-page', 'hacker-news', 'reddit', 'rss', 'x-twitter' ]) ) OR (
SELECT count(*) <> count(DISTINCT citation.value->>'citationId')
OR count(*) <> count(DISTINCT citation.value->>'feedItemId')
OR count(*) <> count(DISTINCT citation.value->>'sourceItemId')
FROM jsonb_array_elements(v_artifact."citations") AS citation(value) ) THEN
RAISE EXCEPTION 'weekly publication citation graph is not exact'; END IF; PERFORM source."id"
FROM jsonb_array_elements(v_artifact."citations") AS citation(value) JOIN "source_items" AS source
ON source."id" = (citation.value->>'sourceItemId')::UUID
AND source."tenant_id" = v_artifact."tenant_id"
AND source."workspace_id" = v_artifact."workspace_id"
AND source."provider_key" = citation.value->>'providerKey' AND (
v_artifact."scope_type" <> 'interest' OR EXISTS ( SELECT 1 FROM "source_bindings" AS binding
WHERE binding."id" = source."source_binding_id"
AND binding."tenant_id" = source."tenant_id"
AND binding."workspace_id" = source."workspace_id"
AND binding."interest_id" = v_artifact."interest_id" ) ) AND (
NOT citation.value ? 'canonicalUrl'
OR citation.value->'canonicalUrl' = 'null'::JSONB
OR public.reader_summary_safe_citation_url(source."canonical_url") = citation.value->>'canonicalUrl' ) ORDER BY source."id"
FOR UPDATE OF source; GET DIAGNOSTICS v_source_lock_count = ROW_COUNT;
IF v_source_lock_count <> jsonb_array_length(v_artifact."citations") THEN
RAISE EXCEPTION 'weekly publication source authority is incomplete'; END IF; PERFORM feed."id"
FROM jsonb_array_elements(v_artifact."citations") AS citation(value) JOIN "source_items" AS source
ON source."id" = (citation.value->>'sourceItemId')::UUID
AND source."tenant_id" = v_artifact."tenant_id"
AND source."workspace_id" = v_artifact."workspace_id"
AND source."provider_key" = citation.value->>'providerKey' AND (
v_artifact."scope_type" <> 'interest' OR EXISTS ( SELECT 1 FROM "source_bindings" AS binding
WHERE binding."id" = source."source_binding_id"
AND binding."tenant_id" = source."tenant_id"
AND binding."workspace_id" = source."workspace_id"
AND binding."interest_id" = v_artifact."interest_id" ) ) JOIN "feed_items" AS feed
ON feed."id" = (citation.value->>'feedItemId')::UUID AND feed."source_item_id" = source."id"
AND feed."source_binding_id" = source."source_binding_id" AND feed."tenant_id" = source."tenant_id"
AND feed."workspace_id" = source."workspace_id" AND feed."provider_key" = source."provider_key"
AND feed."canonical_url" = source."canonical_url" AND (
v_artifact."scope_type" <> 'interest' OR feed."interest_id" = v_artifact."interest_id" ) AND (
NOT citation.value ? 'canonicalUrl'
OR citation.value->'canonicalUrl' = 'null'::JSONB
OR public.reader_summary_safe_citation_url(feed."canonical_url") = citation.value->>'canonicalUrl' ) ORDER BY feed."id" FOR UPDATE OF feed;
GET DIAGNOSTICS v_feed_lock_count = ROW_COUNT;
IF v_feed_lock_count <> jsonb_array_length(v_artifact."citations") THEN
RAISE EXCEPTION 'weekly publication feed authority is incomplete'; END IF;
SELECT COALESCE(jsonb_agg(jsonb_build_object( 'citationId', citation.value->>'citationId',
'citationField', citation.value->>'field', 'feedItemId', feed."id"::TEXT,
'sourceItemId', source."id"::TEXT, 'sourceBindingId', source."source_binding_id"::TEXT,
'providerKey', source."provider_key", 'providerItemId', source."provider_item_id",
'canonicalUrl', feed."canonical_url", 'title', feed."title", 'sourceText', feed."body_preview",
'publishedAt', to_char( feed."published_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"' ),
'observedAt', to_char( feed."observed_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"' ),
'sourceContentHash', source."content_hash" ) ORDER BY array_position(ARRAY[
'github-trending-page', 'hacker-news', 'reddit', 'rss', 'x-twitter' ], source."provider_key"),
source."id"::TEXT, citation.value->>'citationId' ), '[]'::JSONB) INTO v_provider
FROM jsonb_array_elements(v_artifact."citations") AS citation(value) JOIN "source_items" AS source
ON source."id" = (citation.value->>'sourceItemId')::UUID
AND source."tenant_id" = v_artifact."tenant_id"
AND source."workspace_id" = v_artifact."workspace_id"
AND source."provider_key" = citation.value->>'providerKey' AND (
v_artifact."scope_type" <> 'interest' OR EXISTS ( SELECT 1 FROM "source_bindings" AS binding
WHERE binding."id" = source."source_binding_id"
AND binding."tenant_id" = source."tenant_id"
AND binding."workspace_id" = source."workspace_id"
AND binding."interest_id" = v_artifact."interest_id" ) )
AND source."provider_key" = ANY(ARRAY[
'github-trending-page', 'hacker-news', 'reddit', 'rss', 'x-twitter' ]) AND (
NOT citation.value ? 'canonicalUrl' OR citation.value->'canonicalUrl' = 'null'::JSONB
OR public.reader_summary_safe_citation_url(source."canonical_url") = citation.value->>'canonicalUrl' ) JOIN "feed_items" AS feed
ON feed."id" = (citation.value->>'feedItemId')::UUID AND feed."source_item_id" = source."id"
AND feed."source_binding_id" = source."source_binding_id" AND feed."tenant_id" = source."tenant_id"
AND feed."workspace_id" = source."workspace_id" AND feed."provider_key" = source."provider_key"
AND feed."canonical_url" = source."canonical_url" AND (
v_artifact."scope_type" <> 'interest' OR feed."interest_id" = v_artifact."interest_id" );
IF jsonb_array_length(v_provider) <>
jsonb_array_length(v_artifact."citations") OR ( v_publication."semantic_status" = 'COMPLETED'
AND jsonb_array_length(v_provider) = 0 ) OR ( v_publication."semantic_status" = 'NO_SIGNAL'
AND jsonb_array_length(v_provider) <> 0 ) THEN
RAISE EXCEPTION 'weekly publication provider evidence is incomplete'; END IF; v_provider_counts := (
SELECT jsonb_agg(jsonb_build_object( 'providerKey', provider.key, 'count', (
SELECT count(*) FROM jsonb_array_elements(v_provider) AS evidence
WHERE evidence->>'providerKey' = provider.key ) ) ORDER BY provider.ordinality) FROM unnest(ARRAY[
'github-trending-page', 'hacker-news', 'reddit', 'rss', 'x-twitter'
]) WITH ORDINALITY AS provider(key, ordinality) ); v_provider_sha := encode(sha256(convert_to(
public.reader_summary_v3_publication_canonical_json(v_provider, v_job."selection_strategy", 'weekly'), 'UTF8' )), 'hex'); v_github_audit :=
v_artifact."quality_signals"->'githubProjectionAudit'; v_github_count := (
SELECT count(*) FROM jsonb_array_elements(v_provider) AS evidence
WHERE evidence->>'providerKey' = 'github-trending-page' );
IF v_publication."semantic_status" = 'NO_SIGNAL'
AND v_github_audit->>'status' IS DISTINCT FROM 'not_required' THEN RAISE EXCEPTION
'NO_SIGNAL requires not-required GitHub evidence'; END IF;
IF v_github_audit->>'status' = 'not_required' THEN
IF jsonb_typeof(v_github_audit) IS DISTINCT FROM 'object' OR NOT v_github_audit ?& ARRAY[
'schemaVersion', 'status', 'requestedUtcDay', 'pageCount',
'scannedItemCount', 'eligibleBindingIds', 'bindings', 'violationCodes', 'reasons' ]
OR v_github_audit->>'schemaVersion' <> 'reader_summary.github_projection.v1'
OR v_github_audit->>'requestedUtcDay' <> to_char(v_day, 'YYYY-MM-DD')
OR v_github_audit->'violationCodes' <> '[]'::JSONB OR v_github_audit->'reasons' <> '[]'::JSONB
OR jsonb_typeof(v_github_audit->'pageCount') <> 'number'
OR jsonb_typeof(v_github_audit->'scannedItemCount') <> 'number'
OR v_github_audit->>'pageCount' !~ '^(0|[1-9][0-9]*)$'
OR v_github_audit->>'scannedItemCount' !~ '^(0|[1-9][0-9]*)$'
OR jsonb_typeof(v_github_audit->'eligibleBindingIds') <> 'array'
OR jsonb_typeof(v_github_audit->'bindings') <> 'array' OR v_github_count <> 0
OR COALESCE(jsonb_array_length(v_github_audit->'bindings'), -1) <> 0 OR COALESCE(jsonb_array_length(
v_github_audit->'eligibleBindingIds'), -1) <> 0 OR v_github_audit->>'scannedItemCount' <> '0'
OR v_github_audit ?| ARRAY[ 'observedThrough', 'projectionCheckedAt', 'telemetry' ] THEN
RAISE EXCEPTION 'not-required GitHub evidence is not exact'; END IF;
IF v_github_audit ? 'historicalOmission' THEN IF jsonb_object_length(v_github_audit) <> 10
OR jsonb_typeof(v_github_audit->'historicalOmission') IS DISTINCT FROM 'object'
OR jsonb_object_length(v_github_audit->'historicalOmission') <> 3
OR v_github_audit->'historicalOmission'->>'mode' <> 'github_projection_unavailable_historical'
OR btrim(COALESCE( v_github_audit->'historicalOmission'->>'reason', ''
)) <> v_github_audit->'historicalOmission'->>'reason'
OR length(v_github_audit->'historicalOmission'->>'reason') NOT BETWEEN 1 AND 4096
OR v_github_audit->>'pageCount' <> '0' OR v_github_audit->'historicalOmission'->>'authorizedAt'
!~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$' OR (v_github_audit->'historicalOmission'
->>'authorizedAt')::TIMESTAMPTZ < v_publication."period_ended_at" THEN
RAISE EXCEPTION 'historical GitHub authorization is not exact'; END IF;
v_github_body := jsonb_build_object( 'schemaVersion',
'reader_summary.weekly_publication_github_evidence.v1', 'mode', 'historical_unavailable',
'requestedUtcDay', to_char(v_day, 'YYYY-MM-DD'),
'providerKey', 'github-trending-page', 'scanJobId', NULL,
'sourceBindingId', NULL, 'evidenceCount', 0, 'historicalUnavailableReason',
v_github_audit->'historicalOmission'->>'reason', 'authorizedAt',
v_github_audit->'historicalOmission'->>'authorizedAt', 'sourceProviderContentHash', NULL,
'repositories', jsonb_build_array() ); ELSE IF jsonb_object_length(v_github_audit) <> 9
OR v_publication."semantic_status" <> 'NO_SIGNAL' OR (v_github_audit->>'pageCount')::INTEGER < 1
OR jsonb_array_length(COALESCE( v_artifact."artifact_payload"->'content'->'selectedPosts',
'[]'::JSONB )) <> 0 THEN RAISE EXCEPTION 'ordinary GitHub omission is not exact'; END IF;
v_github_body := jsonb_build_object( 'schemaVersion',
'reader_summary.weekly_publication_github_evidence.v1', 'mode', 'ordinary_not_required',
'requestedUtcDay', to_char(v_day, 'YYYY-MM-DD'),
'providerKey', 'github-trending-page', 'scanJobId', NULL,
'sourceBindingId', NULL, 'evidenceCount', 0,
'historicalUnavailableReason', NULL, 'authorizedAt', NULL, 'sourceProviderContentHash', NULL,
'repositories', jsonb_build_array() ); END IF;
ELSIF jsonb_typeof(v_github_audit->'archivedProjection') = 'object' THEN
v_archived_count := COALESCE(jsonb_array_length(v_github_audit->'archivedProjection'->'bindings'), -1);
IF jsonb_typeof(v_github_audit) IS DISTINCT FROM 'object'
OR jsonb_object_length(v_github_audit) <> 11 OR NOT v_github_audit ?& ARRAY[
'schemaVersion', 'status', 'requestedUtcDay', 'pageCount',
'scannedItemCount', 'eligibleBindingIds', 'observedThrough',
'bindings', 'archivedProjection', 'violationCodes', 'reasons' ]
OR v_github_audit ?| ARRAY[ 'historicalOmission', 'projectionCheckedAt', 'telemetry' ]
OR v_github_audit->>'schemaVersion' <> 'reader_summary.github_projection.v1'
OR v_github_audit->>'status' <> 'verified'
OR v_github_audit->>'requestedUtcDay' <> to_char(v_day, 'YYYY-MM-DD')
OR v_github_audit->'violationCodes' <> '[]'::JSONB OR v_github_audit->'reasons' <> '[]'::JSONB
OR v_github_audit->'bindings' <> '[]'::JSONB
OR jsonb_typeof(v_github_audit->'pageCount') <> 'number'
OR v_github_audit->>'pageCount' !~ '^(0|[1-9][0-9]*)$'
OR (v_github_audit->>'pageCount')::INTEGER < 1
OR jsonb_typeof(v_github_audit->'scannedItemCount') <> 'number'
OR v_github_audit->>'scannedItemCount' !~ '^(0|[1-9][0-9]*)$'
OR (v_github_audit->>'scannedItemCount')::INTEGER <> v_archived_count
OR v_github_audit->>'observedThrough' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
OR COALESCE(jsonb_array_length(v_github_audit->'eligibleBindingIds'), -1) <> 1
OR jsonb_typeof(v_github_audit->'archivedProjection') <> 'object'
OR jsonb_object_length(v_github_audit->'archivedProjection') <> 2
OR NOT v_github_audit->'archivedProjection' ?& ARRAY[ 'observationKind', 'bindings' ]
OR v_github_audit->'archivedProjection'->>'observationKind' <> 'archived'
OR v_archived_count NOT BETWEEN 1 AND 10
OR v_github_count <> v_archived_count
OR (SELECT count(*) FROM jsonb_array_elements(
COALESCE(v_artifact."artifact_payload"->'content'->'selectedPosts', '[]'::JSONB)) AS post
WHERE post->>'providerKey' = 'github-trending-page') <> v_archived_count
OR (SELECT count(DISTINCT (binding->'observation'->'trending'->>'rank')::INTEGER)
FROM jsonb_array_elements(v_github_audit->'archivedProjection'->'bindings') AS binding) <> v_archived_count
OR (SELECT count(DISTINCT pg_catalog.lower(binding->'observation'->'repository'->>'fullName'))
FROM jsonb_array_elements(v_github_audit->'archivedProjection'->'bindings') AS binding) <> v_archived_count
OR (SELECT count(DISTINCT binding->>'sourceBindingId')
FROM jsonb_array_elements(v_github_audit->'archivedProjection'->'bindings') AS binding) <> 1
OR (SELECT count(DISTINCT binding->>'citationId')
FROM jsonb_array_elements(v_github_audit->'archivedProjection'->'bindings') AS binding) <> v_archived_count
OR (SELECT count(DISTINCT binding->>'feedItemId')
FROM jsonb_array_elements(v_github_audit->'archivedProjection'->'bindings') AS binding) <> v_archived_count
OR (SELECT count(DISTINCT binding->>'sourceItemId')
FROM jsonb_array_elements(v_github_audit->'archivedProjection'->'bindings') AS binding) <> v_archived_count
OR (SELECT count(DISTINCT binding->'observation'->'archive')
FROM jsonb_array_elements(v_github_audit->'archivedProjection'->'bindings') AS binding) <> 1
OR (SELECT count(DISTINCT binding->'observation'->'trending'->>'snapshotContentHash')
FROM jsonb_array_elements(v_github_audit->'archivedProjection'->'bindings') AS binding) <> 1
OR v_github_audit->'eligibleBindingIds'->>0 <> (SELECT min(binding->>'sourceBindingId')
FROM jsonb_array_elements(v_github_audit->'archivedProjection'->'bindings') AS binding)
OR EXISTS ( SELECT 1
FROM jsonb_array_elements(v_github_audit->'archivedProjection'->'bindings') WITH ORDINALITY AS binding(value, ordinality)
LEFT JOIN LATERAL ( SELECT post.value FROM jsonb_array_elements(
v_artifact."artifact_payload"->'content'->'selectedPosts') AS post(value)
WHERE post.value->>'providerKey' = 'github-trending-page' OFFSET binding.ordinality - 1 LIMIT 1
) AS selected_post ON TRUE
LEFT JOIN "source_items" AS source
ON source."id" = (binding.value->>'sourceItemId')::UUID
AND source."tenant_id" = v_artifact."tenant_id"
AND source."workspace_id" = v_artifact."workspace_id"
AND source."provider_key" = 'github-trending-page' AND source."source_binding_id" =
(binding.value->>'sourceBindingId')::UUID
AND source."provider_item_id" = binding.value->>'sourceExternalId'
AND source."canonical_url" = binding.value->>'canonicalUrl'
AND source."content_hash" = binding.value->>'sourceContentHash' AND source."provider_content_hash" =
binding.value->>'sourceProviderContentHash'
AND source."metadata" = binding.value->'observation'
AND source."metadata"->>'kind' = 'github_trending_page_repository'
AND source."metadata"->'trending'->>'observationKind' = 'archived'
AND source."metadata"->'trending'->'scanJobId' = 'null'::JSONB
AND source."metadata"->'trending'->'fetchStartedAt' = 'null'::JSONB
AND source."metadata"->'trending'->'checkedAt' = 'null'::JSONB
AND source."metadata"->'trending'->>'rank' = binding.value->'observation'->'trending'->>'rank'
AND source."metadata"->'trending'->>'starsGained' = binding.value->'observation'->'trending'->>'starsGained'
LEFT JOIN "feed_items" AS feed ON feed."id" = (binding.value->>'feedItemId')::UUID
AND feed."source_item_id" = source."id" AND feed."tenant_id" = source."tenant_id"
AND feed."workspace_id" = source."workspace_id"
AND feed."canonical_url" = binding.value->>'canonicalUrl'
AND to_char(feed."published_at" AT TIME ZONE 'UTC',
'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') = binding.value->>'publishedAt'
AND to_char(feed."observed_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
= binding.value->>'observedAt'
LEFT JOIN "source_bindings" AS source_binding ON source_binding."id" = source."source_binding_id"
AND source_binding."tenant_id" = source."tenant_id"
AND source_binding."workspace_id" = source."workspace_id" AND source_binding."status" = 'ENABLED'
AND source_binding."deleted_at" IS NULL AND source_binding."created_at" <
v_publication."period_ended_at" AND lower(COALESCE( NULLIF(source_binding."config"->>'window', ''),
NULLIF(source_binding."config"->>'since', ''), NULLIF(source_binding."config"->>'query', ''),
NULLIF( source_binding."config"->'sourceQuery'->>'query', '' ) )) IN ('daily', 'today')
LEFT JOIN "source_catalog_entries" AS catalog
ON catalog."id" = source_binding."source_catalog_entry_id"
AND catalog."provider_key" = 'github-trending-page' LEFT JOIN "interests" AS interest
ON interest."id" = source_binding."interest_id"
AND interest."tenant_id" = source_binding."tenant_id"
AND interest."workspace_id" = source_binding."workspace_id" AND interest."status" = 'ENABLED'
AND interest."deleted_at" IS NULL
WHERE source."id" IS NULL OR feed."id" IS NULL
OR source_binding."id" IS NULL OR catalog."id" IS NULL OR interest."id" IS NULL
OR jsonb_typeof(binding.value) <> 'object' OR jsonb_object_length(binding.value) <> 15
OR NOT binding.value ?& ARRAY[ 'scanJobId', 'fetchStartedAt', 'checkedAt',
'selectedPostIndex', 'citationId', 'feedItemId', 'sourceItemId', 'sourceBindingId',
'sourceExternalId', 'canonicalUrl', 'sourceContentHash', 'sourceProviderContentHash',
'publishedAt', 'observedAt', 'observation' ]
OR jsonb_typeof(binding.value->'scanJobId') <> 'null'
OR jsonb_typeof(binding.value->'fetchStartedAt') <> 'null'
OR jsonb_typeof(binding.value->'checkedAt') <> 'null'
OR binding.value->>'selectedPostIndex' !~ '^(0|[1-9][0-9]*)$'
OR (binding.value->>'selectedPostIndex')::INTEGER <> binding.ordinality::INTEGER - 1
OR binding.value->'observation'->'trending'->>'rank' <> binding.ordinality::TEXT
OR binding.value->'observation'->'trending'->>'observationKind' <> 'archived'
OR binding.value->'observation'->'trending'->'scanJobId' <> 'null'::JSONB
OR binding.value->'observation'->'trending'->'fetchStartedAt' <> 'null'::JSONB
OR binding.value->'observation'->'trending'->'checkedAt' <> 'null'::JSONB
OR binding.value->'observation'->'repository'->>'url' <> binding.value->>'canonicalUrl'
OR (regexp_match(binding.value->>'canonicalUrl',
'^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)$')) IS NULL
OR pg_catalog.lower(binding.value->'observation'->'repository'->>'fullName') <> pg_catalog.lower(
(regexp_match(binding.value->>'canonicalUrl',
'^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)$'))[1] || '/' ||
(regexp_match(binding.value->>'canonicalUrl',
'^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)$'))[2] )
OR binding.value->>'sourceContentHash' !~ '^[a-f0-9]{64}$'
OR binding.value->>'sourceProviderContentHash' !~ '^[a-f0-9]{64}$'
OR binding.value->'observation'->'trending'->>'snapshotContentHash' !~ '^[a-f0-9]{64}$'
OR binding.value->>'publishedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
OR binding.value->>'observedAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
OR binding.value->'observation'->'archive'->>'acquiredAt' !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$'
OR binding.value->>'publishedAt' <> binding.value->'observation'->'archive'->>'serializedAt'
OR (binding.value->>'publishedAt')::TIMESTAMPTZ < v_publication."period_started_at"
OR (binding.value->>'publishedAt')::TIMESTAMPTZ >= v_publication."period_ended_at"
OR (binding.value->>'observedAt')::TIMESTAMPTZ <
(binding.value->'observation'->'archive'->>'acquiredAt')::TIMESTAMPTZ
OR (binding.value->>'observedAt')::TIMESTAMPTZ > (v_github_audit->>'observedThrough')::TIMESTAMPTZ
OR selected_post.value->>'canonicalUrl' <> binding.value->>'canonicalUrl'
OR selected_post.value->'citationIds' <> jsonb_build_array(binding.value->>'citationId')
OR NOT EXISTS (
SELECT 1 FROM jsonb_array_elements(v_provider) AS evidence
WHERE evidence->>'citationId' = binding.value->>'citationId'
AND evidence->>'feedItemId' = binding.value->>'feedItemId'
AND evidence->>'sourceItemId' = binding.value->>'sourceItemId' AND evidence->>'sourceContentHash' =
binding.value->>'sourceContentHash' ) ) THEN
RAISE EXCEPTION 'archived GitHub evidence is not fully verifiable'; END IF;
WITH binding_rows AS (
  SELECT binding.value,
    (regexp_match(binding.value->>'canonicalUrl',
      '^https://github\.com/([A-Za-z0-9_.-]+)/([A-Za-z0-9_.-]+)$')) AS url_identity
  FROM jsonb_array_elements(v_github_audit->'archivedProjection'->'bindings') AS binding(value)
), board AS (
  SELECT encode(sha256(convert_to(
    "reader_summary_weekly_canonical_json"(jsonb_build_object(
      'schemaVersion', 'reader_summary.github_provider_board.v1',
      'requestedUtcDay', to_char(v_day, 'YYYY-MM-DD'),
      'scanJobId', min(value->>'scanJobId'),
      'sourceBindingId', min(value->>'sourceBindingId'),
      'sourceProviderContentHashes', jsonb_agg(
        value->>'sourceProviderContentHash'
        ORDER BY (value->'observation'->'trending'->>'rank')::INTEGER
      )
    )), 'UTF8'
  )), 'hex') AS sha256
  FROM binding_rows
)
SELECT jsonb_build_object(
  'schemaVersion', 'reader_summary.weekly_publication_github_evidence.v1',
  'mode', 'archived_verified', 'requestedUtcDay', to_char(v_day, 'YYYY-MM-DD'),
  'providerKey', 'github-trending-page', 'scanJobId', min(binding.value->>'scanJobId'),
  'sourceBindingId', min(binding.value->>'sourceBindingId'), 'evidenceCount', v_archived_count,
  'historicalUnavailableReason', NULL, 'authorizedAt', NULL,
  'sourceProviderContentHash', board.sha256,
  'repositories', jsonb_agg(jsonb_build_object(
    'rank', (binding.value->'observation'->'trending'->>'rank')::INTEGER,
    'citationId', binding.value->>'citationId',
    'feedItemId', binding.value->>'feedItemId',
    'sourceItemId', binding.value->>'sourceItemId',
    'repositoryIdentity', pg_catalog.lower(
      binding.url_identity[1] || '/' || binding.url_identity[2] ),
    'canonicalUrl', binding.value->>'canonicalUrl',
    'sourceContentHash', binding.value->>'sourceContentHash',
    'sourceProviderContentHash', board.sha256
  ) ORDER BY (binding.value->'observation'->'trending'->>'rank')::INTEGER)
) INTO v_github_body
FROM binding_rows AS binding CROSS JOIN board
GROUP BY board.sha256;
ELSIF v_github_audit->>'status' = 'verified' THEN
IF jsonb_typeof(v_github_audit) IS DISTINCT FROM 'object'
OR jsonb_object_length(v_github_audit) <> 12 OR NOT v_github_audit ?& ARRAY[
'schemaVersion', 'status', 'requestedUtcDay', 'pageCount',
'scannedItemCount', 'eligibleBindingIds', 'observedThrough',
'projectionCheckedAt', 'telemetry', 'bindings', 'violationCodes', 'reasons' ]
OR v_github_audit ? 'historicalOmission' OR v_github_audit->>'schemaVersion'
<> 'reader_summary.github_projection.v1' OR v_github_audit->'violationCodes' <> '[]'::JSONB
OR v_github_audit->'reasons' <> '[]'::JSONB OR jsonb_typeof(v_github_audit->'pageCount') <> 'number'
OR v_github_audit->>'pageCount' !~ '^(0|[1-9][0-9]*)$'
OR (v_github_audit->>'pageCount')::INTEGER < 1
OR jsonb_typeof(v_github_audit->'scannedItemCount') <> 'number'
OR v_github_audit->>'scannedItemCount' !~ '^(0|[1-9][0-9]*)$'
OR (v_github_audit->>'scannedItemCount')::INTEGER < 10
OR jsonb_typeof(v_github_audit->'telemetry') <> 'object'
OR jsonb_object_length(v_github_audit->'telemetry') <> 4 OR v_github_count <> 10
OR COALESCE(jsonb_array_length(v_github_audit->'bindings'), -1) <> 10
OR v_github_audit->>'requestedUtcDay' <> to_char(v_day, 'YYYY-MM-DD')
OR COALESCE(jsonb_array_length( v_github_audit->'eligibleBindingIds'), -1) <> 1 OR (
SELECT count(*) FROM jsonb_array_elements( COALESCE(
v_artifact."artifact_payload"->'content'->'selectedPosts', '[]'::JSONB ) ) AS post
WHERE post->>'providerKey' = 'github-trending-page' ) <> 10 OR (
SELECT count(DISTINCT (binding->>'rank')::INTEGER)
FROM jsonb_array_elements(v_github_audit->'bindings') AS binding ) <> 10 OR EXISTS ( SELECT 1
FROM jsonb_array_elements(v_github_audit->'bindings') WITH ORDINALITY AS binding(value, ordinality)
LEFT JOIN LATERAL ( SELECT post.value FROM jsonb_array_elements(
v_artifact."artifact_payload"->'content'->'selectedPosts' ) AS post(value)
WHERE post.value->>'providerKey' = 'github-trending-page' OFFSET binding.ordinality - 1 LIMIT 1
) AS selected_post ON TRUE LEFT JOIN "source_items" AS source
ON source."id" = (binding.value->>'sourceItemId')::UUID
AND source."tenant_id" = v_artifact."tenant_id"
AND source."workspace_id" = v_artifact."workspace_id"
AND source."provider_key" = 'github-trending-page' AND source."source_binding_id" =
(binding.value->>'sourceBindingId')::UUID
AND source."canonical_url" = binding.value->>'canonicalUrl'
AND source."content_hash" = binding.value->>'sourceContentHash' AND source."provider_content_hash" =
binding.value->>'sourceProviderContentHash' AND source."metadata"->>'kind'
= binding.value->>'metadataKind' AND pg_catalog.lower(source."metadata"->'repository'->>'fullName')
= pg_catalog.lower(binding.value->>'repositoryIdentity') AND source."metadata"->'trending'->>'scanJobId'
= binding.value->>'scanJobId' AND source."metadata"->'trending'->>'rank' = binding.value->>'rank'
AND source."metadata"->'trending'->>'starsGained' = binding.value->>'starsGained'
AND source."metadata"->'trending'->>'fetchStartedAt' = binding.value->>'fetchStartedAt'
AND source."metadata"->'trending'->>'checkedAt' = binding.value->>'checkedAt'
LEFT JOIN "feed_items" AS feed ON feed."id" = (binding.value->>'feedItemId')::UUID
AND feed."source_item_id" = source."id" AND feed."tenant_id" = source."tenant_id"
AND feed."workspace_id" = source."workspace_id" AND to_char(feed."published_at" AT TIME ZONE 'UTC',
'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') = binding.value->>'publishedAt'
AND to_char(feed."observed_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
= binding.value->>'observedAt' LEFT JOIN "scan_jobs" AS scan
ON scan."id" = (binding.value->>'scanJobId')::UUID
AND scan."id" = (source."metadata"->'trending'->>'scanJobId')::UUID
AND scan."tenant_id" = source."tenant_id"
AND scan."workspace_id" = source."workspace_id"
AND scan."source_binding_id" = source."source_binding_id"
AND scan."status" = 'SUCCEEDED' AND scan."completed_at" IS NOT NULL
AND scan."failure_class" IS NULL AND scan."failure_reason" IS NULL
AND jsonb_typeof(scan."execution_metadata") = 'object'
AND scan."execution_metadata"->>'providerKey' = 'github-trending-page'
AND scan."execution_metadata"->>'status' = 'succeeded'
AND jsonb_typeof(scan."execution_metadata"->'acceptedItemCount') = 'number'
AND scan."execution_metadata"->>'acceptedItemCount' ~ '^[1-9][0-9]*$'
AND (scan."execution_metadata"->>'acceptedItemCount')::INTEGER >= 10
AND scan."execution_metadata"->>'targetPublishedWindowStartedAt' = to_char(
  v_publication."period_started_at" AT TIME ZONE 'UTC',
  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
)
AND scan."execution_metadata"->>'targetPublishedWindowEndedAt' = to_char(
  v_publication."period_ended_at" AT TIME ZONE 'UTC',
  'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
)
LEFT JOIN "source_bindings" AS source_binding ON source_binding."id" = source."source_binding_id"
AND source_binding."tenant_id" = source."tenant_id"
AND source_binding."workspace_id" = source."workspace_id" AND source_binding."status" = 'ENABLED'
AND source_binding."deleted_at" IS NULL AND source_binding."created_at" <
v_publication."period_ended_at" AND lower(COALESCE( NULLIF(source_binding."config"->>'window', ''),
NULLIF(source_binding."config"->>'since', ''), NULLIF(source_binding."config"->>'query', ''),
NULLIF( source_binding."config"->'sourceQuery'->>'query', '' ) )) IN ('daily', 'today')
LEFT JOIN "source_catalog_entries" AS catalog
ON catalog."id" = source_binding."source_catalog_entry_id"
AND catalog."provider_key" = 'github-trending-page' LEFT JOIN "interests" AS interest
ON interest."id" = source_binding."interest_id"
AND interest."tenant_id" = source_binding."tenant_id"
AND interest."workspace_id" = source_binding."workspace_id" AND interest."status" = 'ENABLED'
AND interest."deleted_at" IS NULL
WHERE source."id" IS NULL OR feed."id" IS NULL OR scan."id" IS NULL
OR source_binding."id" IS NULL OR catalog."id" IS NULL OR interest."id" IS NULL
OR jsonb_typeof(binding.value) <> 'object' OR jsonb_object_length(binding.value) <> 18
OR NOT binding.value ?& ARRAY[ 'selectedPostIndex', 'rank', 'citationId', 'feedItemId',
'sourceItemId', 'sourceBindingId', 'providerKey', 'metadataKind', 'scanJobId', 'repositoryIdentity',
'canonicalUrl', 'starsGained', 'fetchStartedAt', 'publishedAt', 'checkedAt', 'observedAt',
'sourceContentHash', 'sourceProviderContentHash' ]
OR binding.value->>'providerKey' <> 'github-trending-page' OR binding.value->>'metadataKind'
<> 'github_trending_page_repository' OR binding.value->>'rank' !~ '^[1-9][0-9]*$'
OR binding.value->>'selectedPostIndex' !~ '^(0|[1-9][0-9]*)$'
OR binding.value->>'starsGained' !~ '^(0|[1-9][0-9]*)$' OR (binding.value->>'rank')::INTEGER
<> binding.ordinality::INTEGER OR (binding.value->>'selectedPostIndex')::INTEGER
<> binding.ordinality::INTEGER - 1 OR selected_post.value->>'canonicalUrl'
<> binding.value->>'canonicalUrl' OR selected_post.value->'citationIds'
<> jsonb_build_array(binding.value->>'citationId') OR NOT EXISTS (
SELECT 1 FROM jsonb_array_elements(v_provider) AS evidence
WHERE evidence->>'citationId' = binding.value->>'citationId'
AND evidence->>'feedItemId' = binding.value->>'feedItemId'
AND evidence->>'sourceItemId' = binding.value->>'sourceItemId' AND evidence->>'sourceContentHash' =
binding.value->>'sourceContentHash' ) ) OR ( SELECT count(DISTINCT binding->>'scanJobId')
FROM jsonb_array_elements(v_github_audit->'bindings') AS binding ) <> 1 OR (
SELECT count(DISTINCT binding->>'sourceBindingId')
FROM jsonb_array_elements(v_github_audit->'bindings') AS binding ) <> 1
OR v_github_audit->'eligibleBindingIds'->>0 <> ( SELECT min(binding->>'sourceBindingId')
FROM jsonb_array_elements(v_github_audit->'bindings') AS binding ) THEN
RAISE EXCEPTION 'ordinary GitHub evidence is not fully verifiable'; END IF;
WITH binding_rows AS (
  SELECT binding.value
  FROM jsonb_array_elements(v_github_audit->'bindings') AS binding(value)
), board AS (
  SELECT encode(sha256(convert_to(
    "reader_summary_weekly_canonical_json"(jsonb_build_object(
      'schemaVersion', 'reader_summary.github_provider_board.v1',
      'requestedUtcDay', to_char(v_day, 'YYYY-MM-DD'),
      'scanJobId', min(value->>'scanJobId'),
      'sourceBindingId', min(value->>'sourceBindingId'),
      'sourceProviderContentHashes', jsonb_agg(
        value->>'sourceProviderContentHash' ORDER BY (value->>'rank')::INTEGER
      )
    )), 'UTF8'
  )), 'hex') AS sha256
  FROM binding_rows
)
SELECT jsonb_build_object(
  'schemaVersion', 'reader_summary.weekly_publication_github_evidence.v1',
  'mode', 'verified', 'requestedUtcDay', to_char(v_day, 'YYYY-MM-DD'),
  'providerKey', 'github-trending-page', 'scanJobId', min(binding.value->>'scanJobId'),
  'sourceBindingId', min(binding.value->>'sourceBindingId'), 'evidenceCount', 10,
  'historicalUnavailableReason', NULL, 'authorizedAt', NULL,
  'sourceProviderContentHash', board.sha256,
  'repositories', jsonb_agg(jsonb_build_object(
    'rank', (binding.value->>'rank')::INTEGER,
    'citationId', binding.value->>'citationId',
    'feedItemId', binding.value->>'feedItemId',
    'sourceItemId', binding.value->>'sourceItemId',
    'repositoryIdentity', binding.value->>'repositoryIdentity',
    'canonicalUrl', binding.value->>'canonicalUrl',
    'sourceContentHash', binding.value->>'sourceContentHash',
    'sourceProviderContentHash', board.sha256
  ) ORDER BY (binding.value->>'rank')::INTEGER)
) INTO v_github_body
FROM binding_rows AS binding CROSS JOIN board
GROUP BY board.sha256; ELSE
RAISE EXCEPTION 'GitHub publication authority is unavailable'; END IF;
v_github := v_github_body || jsonb_build_object( 'sha256', encode(sha256(convert_to(
public.reader_summary_v3_publication_canonical_json(v_github_body, v_job."selection_strategy", 'weekly'), 'UTF8' )), 'hex') ); ELSE PERFORM source."id"
FROM jsonb_array_elements(v_existing."provider_evidence") AS evidence(value)
JOIN "source_items" AS source ON source."id" = (evidence.value->>'sourceItemId')::UUID
ORDER BY source."id" FOR UPDATE OF source; PERFORM feed."id"
FROM jsonb_array_elements(v_existing."provider_evidence") AS evidence(value)
JOIN "feed_items" AS feed ON feed."id" = (evidence.value->>'feedItemId')::UUID ORDER BY feed."id"
FOR UPDATE OF feed; v_provider := v_existing."provider_evidence";
v_github := v_existing."github_evidence"; v_provider_counts := (
SELECT jsonb_agg(jsonb_build_object( 'providerKey', provider.key, 'count', (
SELECT count(*) FROM jsonb_array_elements(v_provider) AS evidence
WHERE evidence->>'providerKey' = provider.key ) ) ORDER BY provider.ordinality) FROM unnest(ARRAY[
'github-trending-page', 'hacker-news', 'reddit', 'rss', 'x-twitter'
]) WITH ORDINALITY AS provider(key, ordinality) ); v_provider_sha := encode(sha256(convert_to(
public.reader_summary_v3_publication_canonical_json(v_provider, v_job."selection_strategy", 'weekly'), 'UTF8' )), 'hex'); END IF;
SELECT * INTO v_existing FROM "reader_summary_weekly_publication_evidence"
WHERE "publication_id" = target_publication_id FOR UPDATE;
v_scope := CASE v_publication."scope_type"
WHEN 'workspace' THEN jsonb_build_object('type', 'workspace') ELSE jsonb_build_object(
'type', 'interest', 'interestId', v_artifact."interest_id"::TEXT ) END;
v_body := jsonb_build_object( 'schemaVersion', 'reader_summary.weekly_publication_evidence.v1',
'tenantId', v_publication."tenant_id"::TEXT,
'workspaceId', v_publication."workspace_id"::TEXT, 'scope', v_scope, 'period', jsonb_build_object(
'cadence', 'daily', 'startedAt', to_char( v_publication."period_started_at" AT TIME ZONE 'UTC',
'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"' ), 'endedAt', to_char(
v_publication."period_ended_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"' ),
'timezone', 'UTC', 'periodKey', v_publication."period_key" ),
'requestedUtcDate', to_char(v_day, 'YYYY-MM-DD'), 'publicationId', v_publication."id"::TEXT,
'artifactId', v_artifact."id"::TEXT, 'jobId', v_job."id"::TEXT,
'reportId', 'reader-summary-report:' || v_publication."id"::TEXT,
'proofId', 'reader-summary-proof:' || v_publication."id"::TEXT,
'semanticStatus', v_publication."semantic_status"::TEXT, 'reportSha256', v_report_sha,
'proofSha256', v_proof_sha, 'artifactPayloadSha256', encode(sha256(convert_to(
public.reader_summary_v3_publication_canonical_json(v_artifact."artifact_payload", v_job."selection_strategy", 'artifact'), 'UTF8' )), 'hex'),
'providerEvidenceSha256', v_provider_sha, 'providerEvidence', v_provider,
'providerCounts', v_provider_counts, 'githubEvidence', v_github, 'publishedAt', to_char(
v_publication."published_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"' ) );
v_canonical := public.reader_summary_v3_publication_canonical_json(v_body, v_job."selection_strategy", 'weekly');
v_bytes := convert_to(v_canonical, 'UTF8'); v_sha := encode(sha256(v_bytes), 'hex');
IF v_existing."publication_id" IS NOT NULL THEN
IF v_existing."tenant_id" <> v_publication."tenant_id"
OR v_existing."workspace_id" <> v_publication."workspace_id"
OR v_existing."scope_type" <> v_publication."scope_type"
OR v_existing."scope_key" <> v_publication."scope_key"
OR v_existing."reader_summary_job_id" <> v_job."id"
OR v_existing."reader_summary_artifact_id" <> v_artifact."id"
OR v_existing."semantic_status" <> v_publication."semantic_status"
OR v_existing."report" <> v_report OR btrim(v_existing."report_sha256") <> v_report_sha
OR v_existing."exact_proof" <> v_publication."exact_proof"
OR btrim(v_existing."proof_sha256") <> v_proof_sha
OR btrim(v_existing."provider_evidence_sha256") <> v_provider_sha
OR v_existing."canonical_record" <> v_body OR v_existing."canonical_bytes" <> v_bytes
OR btrim(v_existing."canonical_sha256") <> v_sha OR v_existing."identity" <>
'reader_summary.weekly_publication_evidence.v1:' || v_sha
OR v_existing."recorded_at" <> v_publication."published_at" THEN
RAISE EXCEPTION 'weekly publication evidence replay diverged'; END IF; RETURN; END IF;
INSERT INTO "reader_summary_weekly_publication_evidence" (
"publication_id", "tenant_id", "workspace_id", "scope_type",
"scope_key", "cadence", "period_started_at", "period_ended_at",
"period_timezone", "requested_utc_date", "reader_summary_job_id",
"reader_summary_artifact_id", "report_id", "proof_id",
"semantic_status", "report", "report_sha256", "exact_proof",
"proof_sha256", "artifact_payload_sha256", "provider_evidence",
"provider_evidence_sha256", "github_evidence", "canonical_record",
"canonical_bytes", "canonical_sha256", "identity", "recorded_at" ) VALUES (
v_publication."id", v_publication."tenant_id",
v_publication."workspace_id", v_publication."scope_type",
v_publication."scope_key", v_publication."cadence",
v_publication."period_started_at", v_publication."period_ended_at",
v_publication."period_timezone", v_day, v_job."id", v_artifact."id",
'reader-summary-report:' || v_publication."id"::TEXT,
'reader-summary-proof:' || v_publication."id"::TEXT,
v_publication."semantic_status", v_report, v_report_sha, v_publication."exact_proof", v_proof_sha,
v_body->>'artifactPayloadSha256', v_provider, v_provider_sha, v_github, v_body, v_bytes, v_sha,
'reader_summary.weekly_publication_evidence.v1:' || v_sha, v_publication."published_at" ); END; $function$;

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;
COMMIT;
