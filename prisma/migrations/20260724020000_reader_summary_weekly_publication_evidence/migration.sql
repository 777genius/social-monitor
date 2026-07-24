-- @social-monitor-forward-migration
-- Immutable publication evidence derived from locked database authority.
BEGIN; SET LOCAL ROLE "social_monitor_public_schema_owner"; GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner"; RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";
ALTER FUNCTION "publish_reader_summary"(JSONB) RENAME TO "publish_reader_summary_legacy_v1";
CREATE FUNCTION "reader_summary_weekly_utf16_sort_key"(value TEXT) RETURNS BYTEA
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_character TEXT; v_codepoint INTEGER; v_high INTEGER; v_low INTEGER;
v_result BYTEA := ''::BYTEA; BEGIN FOR v_character IN SELECT substring(value FROM position FOR 1)
FROM generate_series(1, length(value)) AS position LOOP v_codepoint := ascii(v_character);
IF v_codepoint <= 65535 THEN v_result := v_result ||
decode(lpad(to_hex(v_codepoint), 4, '0'), 'hex'); ELSE v_codepoint := v_codepoint - 65536;
v_high := 55296 + (v_codepoint >> 10); v_low := 56320 + (v_codepoint & 1023);
v_result := v_result || decode(lpad(to_hex(v_high), 4, '0'), 'hex') ||
decode(lpad(to_hex(v_low), 4, '0'), 'hex'); END IF; END LOOP; RETURN v_result; END; $$;
CREATE FUNCTION "reader_summary_weekly_utf16_length"(value TEXT) RETURNS INTEGER
LANGUAGE SQL IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp RETURN (
SELECT COALESCE(sum( CASE WHEN ascii(substring(value FROM position FOR 1)) > 65535 THEN 2 ELSE 1 END
), 0)::INTEGER FROM generate_series(1, length(value)) AS position );
CREATE FUNCTION "reader_summary_weekly_canonical_number"(value JSONB) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_float DOUBLE PRECISION; v_text TEXT; BEGIN v_float := (value #>> '{}')::DOUBLE PRECISION;
IF v_float::TEXT IN ('Infinity', '-Infinity', 'NaN') THEN
RAISE EXCEPTION 'weekly canonical number must be finite'; END IF; v_text := to_jsonb(v_float)::TEXT;
v_text := regexp_replace( v_text, 'e([+-])0+([0-9]+)$', 'e\1\2' );
IF value IS DISTINCT FROM v_text::JSONB THEN RAISE EXCEPTION
'weekly canonical number does not have JavaScript semantics'; END IF; RETURN v_text; END; $$;
CREATE FUNCTION "reader_summary_weekly_canonical_json_unbounded"(value JSONB) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_result TEXT; BEGIN CASE jsonb_typeof(value) WHEN 'null', 'boolean', 'string' THEN
RETURN value::TEXT; WHEN 'number' THEN RETURN "reader_summary_weekly_canonical_number"(value);
WHEN 'array' THEN SELECT '[' || COALESCE(string_agg(
"reader_summary_weekly_canonical_json_unbounded"(item.value), ',' ORDER BY item.ordinality
), '') || ']' INTO v_result FROM jsonb_array_elements(value) WITH ORDINALITY AS item;
RETURN v_result; WHEN 'object' THEN IF EXISTS ( SELECT 1 FROM jsonb_each(value) AS item
WHERE "reader_summary_weekly_utf16_length"(item.key) > 16384
) THEN RAISE EXCEPTION 'weekly canonical object key is invalid'; END IF;
SELECT '{' || COALESCE(string_agg( to_jsonb(item.key)::TEXT || ':' ||
"reader_summary_weekly_canonical_json_unbounded"(item.value),
',' ORDER BY "reader_summary_weekly_utf16_sort_key"(item.key) ), '') || '}' INTO v_result
FROM jsonb_each(value) AS item; RETURN v_result; ELSE
RAISE EXCEPTION 'weekly canonical JSON type is invalid'; END CASE; END; $$;
CREATE FUNCTION "reader_summary_weekly_canonical_json"(value JSONB) RETURNS TEXT
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE SET search_path = pg_catalog, public, pg_temp AS $$
DECLARE v_array_elements BIGINT; v_bytes BIGINT; v_depth INTEGER;
v_max_array INTEGER; v_max_keys INTEGER; v_max_string INTEGER; v_nodes BIGINT; v_object_keys BIGINT;
v_result TEXT; BEGIN WITH RECURSIVE node(value, depth) AS ( SELECT value, 0 UNION ALL
SELECT child.value, node.depth + 1 FROM node CROSS JOIN LATERAL ( SELECT item.value
FROM jsonb_array_elements( CASE jsonb_typeof(node.value)
WHEN 'array' THEN node.value ELSE '[]'::JSONB END ) AS item UNION ALL SELECT item.value
FROM jsonb_each( CASE jsonb_typeof(node.value) WHEN 'object' THEN node.value ELSE '{}'::JSONB END
) AS item ) AS child ) SELECT count(*), max(depth),
COALESCE(sum(CASE jsonb_typeof(value) WHEN 'object' THEN jsonb_object_length(value) ELSE 0 END), 0),
COALESCE(max(CASE jsonb_typeof(value) WHEN 'object' THEN jsonb_object_length(value) ELSE 0 END), 0),
COALESCE(sum(CASE jsonb_typeof(value) WHEN 'array' THEN jsonb_array_length(value) ELSE 0 END), 0),
COALESCE(max(CASE jsonb_typeof(value) WHEN 'array' THEN jsonb_array_length(value) ELSE 0 END), 0),
COALESCE(max(CASE jsonb_typeof(value) WHEN 'string'
THEN "reader_summary_weekly_utf16_length"(value #>> '{}') ELSE 0 END), 0)
INTO v_nodes, v_depth, v_object_keys, v_max_keys, v_array_elements, v_max_array, v_max_string
FROM node; IF v_depth > 24 OR v_nodes > 6000 OR v_object_keys > 4096
OR v_max_keys > 64 OR v_array_elements > 4096 OR v_max_array > 256 OR v_max_string > 16384 THEN
RAISE EXCEPTION 'weekly canonical JSON exceeds structural bounds'; END IF;
v_result := "reader_summary_weekly_canonical_json_unbounded"(value);
v_bytes := octet_length(convert_to(v_result, 'UTF8')); IF v_bytes > 1048576 THEN
RAISE EXCEPTION 'weekly canonical JSON exceeds byte bounds'; END IF; RETURN v_result; END; $$;
CREATE TABLE "reader_summary_weekly_publication_evidence" (
"publication_id" UUID NOT NULL, "tenant_id" UUID NOT NULL,
"workspace_id" UUID NOT NULL, "scope_type" TEXT NOT NULL,
"scope_key" TEXT NOT NULL, "cadence" TEXT NOT NULL, "period_started_at" TIMESTAMPTZ(6) NOT NULL,
"period_ended_at" TIMESTAMPTZ(6) NOT NULL,
"period_timezone" TEXT NOT NULL, "requested_utc_date" DATE NOT NULL,
"reader_summary_job_id" UUID NOT NULL, "reader_summary_artifact_id" UUID NOT NULL,
"report_id" TEXT NOT NULL, "proof_id" TEXT NOT NULL,
"semantic_status" "SummaryStatus" NOT NULL, "report" JSONB NOT NULL,
"report_sha256" CHAR(64) NOT NULL, "exact_proof" JSONB NOT NULL, "proof_sha256" CHAR(64) NOT NULL,
"artifact_payload_sha256" CHAR(64) NOT NULL, "provider_evidence" JSONB NOT NULL,
"provider_evidence_sha256" CHAR(64) NOT NULL,
"github_evidence" JSONB NOT NULL, "canonical_record" JSONB NOT NULL,
"canonical_bytes" BYTEA NOT NULL, "canonical_sha256" CHAR(64) NOT NULL,
"identity" TEXT NOT NULL, "recorded_at" TIMESTAMPTZ(6) NOT NULL,
CONSTRAINT "reader_summary_weekly_publication_evidence_pkey" PRIMARY KEY ("publication_id"),
CONSTRAINT "reader_summary_weekly_publication_evidence_publication_fkey"
FOREIGN KEY ("publication_id") REFERENCES
"reader_summary_publications"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
CONSTRAINT "reader_summary_weekly_publication_evidence_job_fkey"
FOREIGN KEY ("reader_summary_job_id") REFERENCES
"reader_summary_jobs"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
CONSTRAINT "reader_summary_weekly_publication_evidence_artifact_fkey"
FOREIGN KEY ("reader_summary_artifact_id") REFERENCES
"reader_summary_artifacts"("id") ON DELETE RESTRICT ON UPDATE RESTRICT,
CONSTRAINT "reader_summary_weekly_publication_evidence_slot_fkey" FOREIGN KEY (
"tenant_id", "workspace_id", "scope_type", "scope_key", "cadence",
"period_started_at", "period_ended_at", "period_timezone"
) REFERENCES "reader_summary_publication_slots"(
"tenant_id", "workspace_id", "scope_type", "scope_key", "cadence",
"period_started_at", "period_ended_at", "period_timezone" ) ON DELETE RESTRICT ON UPDATE RESTRICT,
CONSTRAINT "reader_summary_weekly_publication_evidence_daily_check" CHECK (
"cadence" = 'daily' AND "period_timezone" = 'UTC'
AND "period_ended_at" = "period_started_at" + INTERVAL '1 day' AND "requested_utc_date" =
("period_started_at" AT TIME ZONE 'UTC')::DATE AND "semantic_status" IN ('COMPLETED', 'NO_SIGNAL')
), CONSTRAINT "reader_summary_weekly_publication_evidence_hashes_check" CHECK (
"report_sha256" ~ '^[0-9a-f]{64}$' AND "proof_sha256" ~ '^[0-9a-f]{64}$'
AND "artifact_payload_sha256" ~ '^[0-9a-f]{64}$' AND "provider_evidence_sha256" ~ '^[0-9a-f]{64}$'
AND "canonical_sha256" ~ '^[0-9a-f]{64}$' ),
CONSTRAINT "reader_summary_weekly_publication_evidence_semantics_check" CHECK (
COALESCE(jsonb_typeof("report") = 'object', FALSE) AND
COALESCE(jsonb_typeof("report"->'citations') = 'array', FALSE) AND
COALESCE(jsonb_typeof("provider_evidence") = 'array', FALSE) AND
COALESCE(jsonb_typeof("github_evidence") = 'object', FALSE) AND ( (
"semantic_status" = 'NO_SIGNAL' AND "report"->'citations' = '[]'::JSONB AND
"provider_evidence" = '[]'::JSONB AND "github_evidence"->>'mode' IN (
'ordinary_not_required', 'historical_unavailable' ) AND
"github_evidence"->>'evidenceCount' = '0' AND "github_evidence"->'repositories' = '[]'::JSONB ) OR (
"semantic_status" = 'COMPLETED' AND jsonb_array_length("provider_evidence") > 0
AND "github_evidence"->>'mode' <> 'ordinary_not_required' ) ) )
);
CREATE UNIQUE INDEX "reader_summary_weekly_publication_evidence_job_key" ON
"reader_summary_weekly_publication_evidence"("reader_summary_job_id");
CREATE UNIQUE INDEX "reader_summary_weekly_publication_evidence_artifact_key" ON
"reader_summary_weekly_publication_evidence"("reader_summary_artifact_id");
CREATE UNIQUE INDEX "reader_summary_weekly_publication_evidence_report_key" ON
"reader_summary_weekly_publication_evidence"("report_id");
CREATE UNIQUE INDEX "reader_summary_weekly_publication_evidence_proof_key" ON
"reader_summary_weekly_publication_evidence"("proof_id");
CREATE UNIQUE INDEX "reader_summary_weekly_publication_evidence_identity_key" ON
"reader_summary_weekly_publication_evidence"("identity");
CREATE INDEX "reader_summary_weekly_publication_evidence_tenant_day_idx"
ON "reader_summary_weekly_publication_evidence" ("tenant_id", "workspace_id", "requested_utc_date");
CREATE FUNCTION "guard_reader_summary_weekly_publication_evidence"() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$ BEGIN IF TG_OP = 'INSERT'
AND current_user = 'social_monitor_reader_summary_publication_owner' THEN RETURN NEW; END IF;
IF TG_OP = 'DELETE' AND current_user = 'social_monitor_reader_summary_publication_owner'
AND current_setting( 'social_monitor.authorized_retention_purge', TRUE ) = 'on' THEN RETURN OLD;
END IF; RAISE EXCEPTION 'reader summary weekly publication evidence is immutable'; END; $$;
CREATE TRIGGER "reader_summary_weekly_publication_evidence_guarded"
BEFORE INSERT OR UPDATE OR DELETE ON "reader_summary_weekly_publication_evidence" FOR EACH ROW
EXECUTE FUNCTION "guard_reader_summary_weekly_publication_evidence"();
CREATE OR REPLACE FUNCTION "reject_reader_summary_publication_mutation"()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$ BEGIN
IF TG_OP = 'DELETE' AND current_user = 'social_monitor_reader_summary_publication_owner'
AND current_setting( 'social_monitor.authorized_retention_purge', TRUE) = 'on'
THEN RETURN OLD; END IF; RAISE EXCEPTION 'reader summary publication ledger is immutable'; END; $$;
CREATE OR REPLACE FUNCTION "reject_reader_summary_recovery_receipt_mutation"()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = pg_catalog, public, pg_temp AS $$ BEGIN
IF TG_OP = 'DELETE' AND current_user = 'social_monitor_reader_summary_publication_owner'
AND current_setting( 'social_monitor.authorized_retention_purge', TRUE) = 'on'
THEN RETURN OLD; END IF; RAISE EXCEPTION 'reader summary recovery receipt is immutable'; END; $$;
CREATE FUNCTION "record_reader_summary_weekly_publication_evidence"(
target_publication_id UUID) RETURNS VOID LANGUAGE plpgsql
SET search_path = pg_catalog, public, pg_temp AS $$ DECLARE
v_artifact "reader_summary_artifacts"%ROWTYPE;
v_body JSONB; v_bytes BYTEA; v_canonical TEXT; v_day DATE;
v_github JSONB; v_github_audit JSONB; v_github_body JSONB; v_github_count INTEGER;
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
v_report_sha := encode(sha256(convert_to( "reader_summary_weekly_canonical_json"(v_report), 'UTF8'
)), 'hex'); v_proof_sha := encode(sha256(convert_to(
"reader_summary_weekly_canonical_json"(v_publication."exact_proof"), 'UTF8' )), 'hex');
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
OR source."canonical_url" = citation.value->>'canonicalUrl' ) ORDER BY source."id"
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
OR feed."canonical_url" = citation.value->>'canonicalUrl' ) ORDER BY feed."id" FOR UPDATE OF feed;
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
OR source."canonical_url" = citation.value->>'canonicalUrl' ) JOIN "feed_items" AS feed
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
"reader_summary_weekly_canonical_json"(v_provider), 'UTF8' )), 'hex'); v_github_audit :=
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
'repositories', jsonb_build_array() ); END IF; ELSIF v_github_audit->>'status' = 'verified' THEN
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
= binding.value->>'metadataKind' AND source."metadata"->'repository'->>'fullName'
= binding.value->>'repositoryIdentity' AND source."metadata"->'trending'->>'scanJobId'
= binding.value->>'scanJobId' AND source."metadata"->'trending'->>'rank' = binding.value->>'rank'
AND source."metadata"->'trending'->>'starsGained' = binding.value->>'starsGained'
AND source."metadata"->'trending'->>'fetchStartedAt' = binding.value->>'fetchStartedAt'
AND source."metadata"->'trending'->>'checkedAt' = binding.value->>'checkedAt'
LEFT JOIN "feed_items" AS feed ON feed."id" = (binding.value->>'feedItemId')::UUID
AND feed."source_item_id" = source."id" AND feed."tenant_id" = source."tenant_id"
AND feed."workspace_id" = source."workspace_id" AND to_char(feed."published_at" AT TIME ZONE 'UTC',
'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') = binding.value->>'publishedAt'
AND to_char(feed."observed_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
= binding.value->>'observedAt' LEFT JOIN "github_repository_trend_results" AS result
ON result."source_item_id" = source."id" AND result."tenant_id" = source."tenant_id"
AND result."workspace_id" = source."workspace_id"
AND result."scan_job_id" = (binding.value->>'scanJobId')::UUID AND result."source_binding_id" =
(binding.value->>'sourceBindingId')::UUID AND result."repository_full_name" =
binding.value->>'repositoryIdentity' AND result."repository_url" = binding.value->>'canonicalUrl'
AND result."rank" = (binding.value->>'rank')::INTEGER
AND to_char(result."checked_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
= binding.value->>'checkedAt' AND to_char(result."observed_at" AT TIME ZONE 'UTC',
'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') = binding.value->>'observedAt' LEFT JOIN "scan_jobs" AS scan
ON scan."id" = result."scan_job_id" AND scan."tenant_id" = result."tenant_id"
AND scan."workspace_id" = result."workspace_id"
AND scan."source_binding_id" = result."source_binding_id" AND scan."status" = 'COMPLETED'
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
WHERE source."id" IS NULL OR feed."id" IS NULL OR result."id" IS NULL OR scan."id" IS NULL
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
FROM jsonb_array_elements(v_github_audit->'bindings') AS binding ) OR (
SELECT count(DISTINCT binding->>'sourceProviderContentHash')
FROM jsonb_array_elements(v_github_audit->'bindings') AS binding ) <> 1 THEN
RAISE EXCEPTION 'ordinary GitHub evidence is not fully verifiable'; END IF;
SELECT jsonb_build_object( 'schemaVersion', 'reader_summary.weekly_publication_github_evidence.v1',
'mode', 'verified', 'requestedUtcDay', to_char(v_day, 'YYYY-MM-DD'),
'providerKey', 'github-trending-page', 'scanJobId', min(binding->>'scanJobId'),
'sourceBindingId', min(binding->>'sourceBindingId'), 'evidenceCount', 10,
'historicalUnavailableReason', NULL, 'authorizedAt', NULL,
'sourceProviderContentHash', min(binding->>'sourceProviderContentHash'),
'repositories', jsonb_agg(jsonb_build_object( 'rank', (binding->>'rank')::INTEGER,
'citationId', binding->>'citationId', 'feedItemId', binding->>'feedItemId',
'sourceItemId', binding->>'sourceItemId', 'repositoryIdentity', binding->>'repositoryIdentity',
'canonicalUrl', binding->>'canonicalUrl', 'sourceContentHash', binding->>'sourceContentHash',
'sourceProviderContentHash', binding->>'sourceProviderContentHash'
) ORDER BY (binding->>'rank')::INTEGER) ) INTO v_github_body
FROM jsonb_array_elements(v_github_audit->'bindings') AS binding; ELSE
RAISE EXCEPTION 'GitHub publication authority is unavailable'; END IF;
v_github := v_github_body || jsonb_build_object( 'sha256', encode(sha256(convert_to(
"reader_summary_weekly_canonical_json"(v_github_body), 'UTF8' )), 'hex') ); ELSE PERFORM source."id"
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
"reader_summary_weekly_canonical_json"(v_provider), 'UTF8' )), 'hex'); END IF;
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
"reader_summary_weekly_canonical_json"(v_artifact."artifact_payload"), 'UTF8' )), 'hex'),
'providerEvidenceSha256', v_provider_sha, 'providerEvidence', v_provider,
'providerCounts', v_provider_counts, 'githubEvidence', v_github, 'publishedAt', to_char(
v_publication."published_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"' ) );
v_canonical := "reader_summary_weekly_canonical_json"(v_body);
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
'reader_summary.weekly_publication_evidence.v1:' || v_sha, v_publication."published_at" ); END; $$;
CREATE FUNCTION "publish_reader_summary_pre_evidence"(payload JSONB)
RETURNS TABLE (outcome TEXT, publication_id UUID, report_sha256 TEXT, proof_sha256 TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$ DECLARE
v_artifact "reader_summary_artifacts"%ROWTYPE; v_current "reader_summary_publications"%ROWTYPE;
v_current_id UUID; v_event JSONB; v_event_id UUID; v_job "reader_summary_jobs"%ROWTYPE;
v_model_authority SMALLINT; v_published_at TIMESTAMPTZ(6); v_report JSONB;
v_report_canonical TEXT; v_report_sha TEXT; v_proof JSONB; v_proof_canonical TEXT;
v_proof_sha TEXT; v_semantic_status "SummaryStatus"; v_updated INTEGER; BEGIN
BEGIN SELECT * INTO STRICT v_job FROM "reader_summary_jobs"
WHERE "id" = (payload->>'readerSummaryJobId')::UUID;
SELECT * INTO STRICT v_artifact FROM "reader_summary_artifacts"
WHERE "id" = (payload->>'readerSummaryArtifactId')::UUID;
v_event_id := (payload->'readyEvent'->>'eventId')::UUID;
v_published_at := (payload->>'publishedAt')::TIMESTAMPTZ; EXCEPTION WHEN OTHERS THEN
RAISE EXCEPTION 'reader summary V2 pre-evidence locators are invalid'; END;
v_semantic_status := CASE WHEN COALESCE(v_artifact."quality_signals"->'qualityFlags'
? 'no_signal', FALSE) THEN 'NO_SIGNAL'::"SummaryStatus" ELSE 'COMPLETED'::"SummaryStatus" END;
IF payload->>'schemaVersion' <> 'reader_summary.publication.v1'
OR payload->>'tenantId' <> v_job."tenant_id"::TEXT
OR payload->>'workspaceId' <> v_job."workspace_id"::TEXT
OR payload->>'scopeType' <> v_job."scope_type" OR payload->>'scopeKey' <> v_job."scope_key"
OR payload->>'cadence' <> v_job."cadence"
OR (payload->>'periodStartedAt')::TIMESTAMPTZ <> v_job."period_started_at"
OR (payload->>'periodEndedAt')::TIMESTAMPTZ <> v_job."period_ended_at"
OR payload->>'periodTimezone' <> v_job."period_timezone"
OR payload->>'periodKey' <> v_job."period_key"
OR (payload->>'requestedAt')::TIMESTAMPTZ <> v_job."requested_at"
OR payload->>'requestedUtcDate' <>
to_char(v_job."period_started_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD')
OR payload->>'semanticStatus' <> v_semantic_status::TEXT
OR payload->>'modelVersion' <> v_artifact."model_version"
OR v_artifact."tenant_id" <> v_job."tenant_id"
OR v_artifact."workspace_id" <> v_job."workspace_id"
OR v_artifact."scope_type" <> v_job."scope_type" OR v_artifact."scope_key" <> v_job."scope_key"
OR v_artifact."interest_id" IS DISTINCT FROM v_job."interest_id"
OR v_artifact."user_id" IS DISTINCT FROM v_job."user_id"
OR v_artifact."subscription_id" IS DISTINCT FROM v_job."subscription_id"
OR v_artifact."artifact_payload"->>'schemaVersion'
IS DISTINCT FROM 'reader_summary.artifact.v1'
OR v_artifact."artifact_payload"->>'readerSummaryId' IS DISTINCT FROM v_artifact."id"::TEXT
OR v_artifact."artifact_payload"->>'tenantId' IS DISTINCT FROM v_job."tenant_id"::TEXT
OR v_artifact."artifact_payload"->>'workspaceId' IS DISTINCT FROM v_job."workspace_id"::TEXT
OR v_artifact."artifact_payload"->'scope' IS DISTINCT FROM CASE v_job."scope_type"
WHEN 'workspace' THEN jsonb_build_object('type', 'workspace')
WHEN 'interest' THEN jsonb_build_object(
'type', 'interest', 'interestId', v_job."interest_id"::TEXT ) ELSE NULL END
OR v_artifact."artifact_payload"->'period' IS DISTINCT FROM jsonb_build_object(
'cadence', v_job."cadence", 'startedAt', to_char(
v_job."period_started_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"' ),
'endedAt', to_char(v_job."period_ended_at" AT TIME ZONE 'UTC',
'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"' ), 'timezone', v_job."period_timezone",
'periodKey', v_job."period_key" )
OR v_artifact."artifact_payload"->'lineage' IS DISTINCT FROM jsonb_build_object(
'modelVersion', v_artifact."model_version", 'promptVersion', v_artifact."prompt_version" )
OR v_artifact."artifact_payload"->>'headline' IS DISTINCT FROM v_artifact."headline"
OR v_artifact."artifact_payload"->>'executiveSummary'
IS DISTINCT FROM v_artifact."summary_text"
OR v_artifact."artifact_payload"->'citationMap' IS DISTINCT FROM v_artifact."citations"
OR v_artifact."artifact_payload"->'qualityFlags'
IS DISTINCT FROM v_artifact."quality_signals"->'qualityFlags'
OR (v_job."user_id" IS NULL AND v_artifact."artifact_payload" ? 'userId')
OR (v_job."user_id" IS NOT NULL AND v_artifact."artifact_payload"->>'userId'
IS DISTINCT FROM v_job."user_id")
OR (v_job."subscription_id" IS NULL AND v_artifact."artifact_payload" ? 'subscriptionId')
OR (v_job."subscription_id" IS NOT NULL AND v_artifact."artifact_payload"->>'subscriptionId'
IS DISTINCT FROM v_job."subscription_id"::TEXT)
OR v_artifact."status" <> 'RUNNING' OR v_job."status" <> 'RUNNING'
OR v_published_at < v_job."requested_at" THEN
RAISE EXCEPTION 'reader summary V2 pre-evidence authority is invalid'; END IF;
v_report := jsonb_build_object( 'schemaVersion', 'reader_summary.publication_report.v1',
'semanticStatus', v_semantic_status::TEXT, 'modelVersion', v_artifact."model_version",
'promptVersion', v_artifact."prompt_version", 'headline', v_artifact."headline",
'summaryText', v_artifact."summary_text", 'artifactPayload', v_artifact."artifact_payload",
'citations', v_artifact."citations", 'qualitySignals', v_artifact."quality_signals" ||
jsonb_build_object( 'publicationGeneration', jsonb_build_object( 'requestedAt',
to_char(v_job."requested_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"' ) ) ) );
v_report_canonical := "reader_summary_weekly_canonical_json"(v_report);
v_report_sha := encode(sha256(convert_to(v_report_canonical, 'UTF8')), 'hex');
IF payload->'report' IS DISTINCT FROM v_report OR payload->>'reportCanonical' <> v_report_canonical
OR payload->>'reportSha256' <> v_report_sha THEN
RAISE EXCEPTION 'reader summary V2 pre-evidence report diverged'; END IF;
v_proof := jsonb_build_object( 'schemaVersion', 'reader_summary.publication_proof.v1',
'tenantId', v_job."tenant_id"::TEXT, 'workspaceId', v_job."workspace_id"::TEXT,
'scope', jsonb_build_object( 'type', v_job."scope_type", 'key', v_job."scope_key" ),
'period', jsonb_build_object( 'cadence', v_job."cadence",
'startedAt', to_char(v_job."period_started_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
'endedAt', to_char(v_job."period_ended_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
'timezone', v_job."period_timezone", 'periodKey', v_job."period_key" ),
'requestedUtcDate', to_char(v_job."period_started_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD'),
'requestedAt', to_char(v_job."requested_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
'readerSummaryJobId', v_job."id"::TEXT, 'readerSummaryArtifactId', v_artifact."id"::TEXT,
'semanticStatus', v_semantic_status::TEXT, 'modelVersion', v_artifact."model_version",
'reportSha256', v_report_sha ); v_proof_canonical :=
"reader_summary_weekly_canonical_json"(v_proof);
v_proof_sha := encode(sha256(convert_to(v_proof_canonical, 'UTF8')), 'hex');
IF payload->'exactProof' IS DISTINCT FROM v_proof
OR payload->>'proofCanonical' <> v_proof_canonical OR payload->>'proofSha256' <> v_proof_sha THEN
RAISE EXCEPTION 'reader summary V2 pre-evidence proof diverged'; END IF;
v_event := jsonb_build_object( 'eventId', v_event_id::TEXT,
'eventType', 'reader_summary.ready', 'schemaVersion', 1,
'occurredAt', to_char(v_published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
'tenantId', v_job."tenant_id"::TEXT, 'workspaceId', v_job."workspace_id"::TEXT,
'correlationId', v_job."id"::TEXT, 'causationId', v_job."id"::TEXT,
'payload', jsonb_build_object( 'readerSummaryJobId', v_job."id"::TEXT,
'readerSummaryId', v_artifact."id"::TEXT, 'tenantId', v_job."tenant_id"::TEXT,
'workspaceId', v_job."workspace_id"::TEXT, 'scope', v_artifact."artifact_payload"->'scope',
'period', v_artifact."artifact_payload"->'period', 'status', lower(v_semantic_status::TEXT) )
|| CASE WHEN v_job."user_id" IS NULL THEN '{}'::JSONB
ELSE jsonb_build_object('userId', v_job."user_id") END
|| CASE WHEN v_job."subscription_id" IS NULL THEN '{}'::JSONB
ELSE jsonb_build_object('subscriptionId', v_job."subscription_id"::TEXT) END );
IF payload->'readyEvent' IS DISTINCT FROM v_event THEN
RAISE EXCEPTION 'reader summary V2 pre-evidence event diverged'; END IF;
SELECT "current_publication_id" INTO STRICT v_current_id
FROM "reader_summary_publication_slots" WHERE "tenant_id" = v_job."tenant_id"
AND "workspace_id" = v_job."workspace_id" AND "scope_type" = v_job."scope_type"
AND "scope_key" = v_job."scope_key" AND "cadence" = v_job."cadence"
AND "period_started_at" = v_job."period_started_at"
AND "period_ended_at" = v_job."period_ended_at" AND "period_timezone" = v_job."period_timezone";
v_model_authority := "reader_summary_model_authority_rank"(v_artifact."model_version");
IF v_current_id IS NOT NULL THEN SELECT * INTO STRICT v_current
FROM "reader_summary_publications" WHERE "id" = v_current_id;
IF v_job."requested_at" <= v_current."requested_at"
OR v_model_authority < v_current."model_authority" THEN RETURN QUERY SELECT
'stale'::TEXT, v_current."id", v_report_sha, v_proof_sha; RETURN; END IF; END IF;
UPDATE "reader_summary_artifacts" SET "status" = v_semantic_status,
"quality_signals" = v_report->'qualitySignals', "updated_at" = v_published_at
WHERE "id" = v_artifact."id" AND "tenant_id" = v_job."tenant_id"
AND "workspace_id" = v_job."workspace_id" AND "status" = 'RUNNING';
GET DIAGNOSTICS v_updated = ROW_COUNT; IF v_updated <> 1 THEN
RAISE EXCEPTION 'reader summary V2 candidate cannot be promoted'; END IF;
UPDATE "reader_summary_jobs" SET "status" = v_semantic_status, "completed_at" = v_published_at,
"failed_at" = NULL, "reader_summary_artifact_id" = v_artifact."id", "failure_reason" = NULL,
"updated_at" = v_published_at WHERE "id" = v_job."id" AND "status" = 'RUNNING'
AND "requested_at" = v_job."requested_at"; GET DIAGNOSTICS v_updated = ROW_COUNT;
IF v_updated <> 1 THEN RAISE EXCEPTION 'reader summary V2 job update lost authority'; END IF;
INSERT INTO "outbox_events" ( "id", "tenant_id", "workspace_id", "event_type", "schema_version",
"payload", "status", "correlation_id", "causation_id", "created_at" ) VALUES (
v_event_id, v_job."tenant_id", v_job."workspace_id", v_event->>'eventType',
(v_event->>'schemaVersion')::INTEGER, (v_event->'payload') || jsonb_build_object(
'publicationProof', v_proof, 'reportSha256', v_report_sha, 'proofSha256', v_proof_sha ),
'PENDING', v_event->>'correlationId', v_event->>'causationId', v_published_at );
INSERT INTO "reader_summary_publications" ( "id", "tenant_id", "workspace_id", "scope_type",
"scope_key", "cadence", "period_started_at", "period_ended_at", "period_timezone", "period_key",
"requested_utc_date", "publication_kind", "reader_summary_job_id", "reader_summary_artifact_id",
"semantic_status", "requested_at", "model_version", "model_authority", "report_sha256",
"proof_sha256", "exact_proof", "outbox_event_id", "published_at" ) VALUES (
v_artifact."id", v_job."tenant_id", v_job."workspace_id", v_job."scope_type", v_job."scope_key",
v_job."cadence", v_job."period_started_at", v_job."period_ended_at", v_job."period_timezone",
v_job."period_key", (v_job."period_started_at" AT TIME ZONE 'UTC')::DATE, 'EXACT', v_job."id",
v_artifact."id", v_semantic_status, v_job."requested_at", v_artifact."model_version",
v_model_authority, v_report_sha, v_proof_sha, v_proof, v_event_id, v_published_at );
IF v_current_id IS NOT NULL THEN UPDATE "reader_summary_artifacts"
SET "status" = 'SUPERSEDED', "updated_at" = v_published_at
WHERE "id" = v_current."reader_summary_artifact_id"
AND "status" IN ('COMPLETED', 'NO_SIGNAL'); END IF;
UPDATE "reader_summary_publication_slots" SET "current_publication_id" = v_artifact."id",
"updated_at" = v_published_at WHERE "tenant_id" = v_job."tenant_id"
AND "workspace_id" = v_job."workspace_id" AND "scope_type" = v_job."scope_type"
AND "scope_key" = v_job."scope_key" AND "cadence" = v_job."cadence"
AND "period_started_at" = v_job."period_started_at"
AND "period_ended_at" = v_job."period_ended_at" AND "period_timezone" = v_job."period_timezone";
GET DIAGNOSTICS v_updated = ROW_COUNT; IF v_updated <> 1 THEN
RAISE EXCEPTION 'reader summary V2 slot update lost authority'; END IF;
RETURN QUERY SELECT 'published'::TEXT, v_artifact."id", v_report_sha, v_proof_sha; END; $$;
CREATE FUNCTION "publish_reader_summary"(payload JSONB)
RETURNS TABLE (outcome TEXT, publication_id UUID, report_sha256 TEXT, proof_sha256 TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS $$ DECLARE
v_artifact "reader_summary_artifacts"%ROWTYPE; v_artifact_id UUID; v_current_publication_id UUID;
v_derived JSONB; v_event JSONB; v_event_id UUID; v_exact_proof JSONB; v_is_v2 BOOLEAN;
v_job "reader_summary_jobs"%ROWTYPE; v_job_id UUID; v_published_at TIMESTAMPTZ(6);
v_replay "reader_summary_publications"%ROWTYPE;
v_report JSONB; v_report_canonical TEXT; v_report_sha TEXT; v_result RECORD;
v_semantic_status "SummaryStatus"; BEGIN v_is_v2 := payload->>'schemaVersion' =
'reader_summary.publication_command.v2'; IF payload IS NULL OR jsonb_typeof(payload) <> 'object'
OR ( v_is_v2 AND ( jsonb_object_length(payload) <> 5 OR NOT payload ?& ARRAY[
'schemaVersion', 'tenantId', 'workspaceId', 'readerSummaryJobId', 'readerSummaryArtifactId' ] ) )
OR ( NOT v_is_v2 AND payload->>'schemaVersion' <> 'reader_summary.publication.v1' ) THEN
RAISE EXCEPTION 'reader summary publication command schema is invalid'; END IF; BEGIN
v_job_id := (payload->>'readerSummaryJobId')::UUID;
v_artifact_id := (payload->>'readerSummaryArtifactId')::UUID; EXCEPTION WHEN OTHERS THEN
RAISE EXCEPTION 'reader summary publication locators are invalid'; END; SELECT * INTO v_job
FROM "reader_summary_jobs" WHERE "id" = v_job_id FOR UPDATE; IF NOT FOUND
OR v_job."tenant_id"::TEXT <> payload->>'tenantId'
OR v_job."workspace_id"::TEXT <> payload->>'workspaceId' THEN
RAISE EXCEPTION 'reader summary publication job authority is invalid'; END IF;
INSERT INTO "reader_summary_publication_slots" (
"tenant_id", "workspace_id", "scope_type", "scope_key", "cadence",
"period_started_at", "period_ended_at", "period_timezone", "current_publication_id", "updated_at"
) VALUES ( v_job."tenant_id", v_job."workspace_id", v_job."scope_type",
v_job."scope_key", v_job."cadence", v_job."period_started_at",
v_job."period_ended_at", v_job."period_timezone", NULL, v_job."updated_at" ) ON CONFLICT DO NOTHING;
SELECT slot."current_publication_id" INTO v_current_publication_id
FROM "reader_summary_publication_slots" AS slot WHERE slot."tenant_id" = v_job."tenant_id"
AND slot."workspace_id" = v_job."workspace_id" AND slot."scope_type" = v_job."scope_type"
AND slot."scope_key" = v_job."scope_key" AND slot."cadence" = v_job."cadence"
AND slot."period_started_at" = v_job."period_started_at"
AND slot."period_ended_at" = v_job."period_ended_at"
AND slot."period_timezone" = v_job."period_timezone" FOR UPDATE; PERFORM publication."id"
FROM "reader_summary_publications" AS publication WHERE publication."id" = v_current_publication_id
OR publication."reader_summary_job_id" = v_job_id ORDER BY publication."id" FOR UPDATE;
SELECT * INTO v_replay FROM "reader_summary_publications" WHERE "reader_summary_job_id" = v_job_id;
PERFORM artifact."id" FROM "reader_summary_artifacts" AS artifact WHERE artifact."id" IN (
v_artifact_id, COALESCE(( SELECT publication."reader_summary_artifact_id"
FROM "reader_summary_publications" AS publication WHERE publication."id" = v_current_publication_id
), v_artifact_id) ) ORDER BY artifact."id" FOR UPDATE; SELECT * INTO v_artifact
FROM "reader_summary_artifacts" WHERE "id" = v_artifact_id; IF NOT FOUND
OR v_artifact."tenant_id" <> v_job."tenant_id"
OR v_artifact."workspace_id" <> v_job."workspace_id" THEN
RAISE EXCEPTION 'reader summary publication artifact authority is invalid'; END IF;
IF v_replay."id" IS NOT NULL THEN IF v_replay."reader_summary_artifact_id" <> v_artifact_id THEN
RAISE EXCEPTION 'reader summary publication replay diverged'; END IF; IF v_is_v2 THEN
PERFORM "record_reader_summary_weekly_publication_evidence"( v_replay."id" ); RETURN QUERY SELECT
'replayed'::TEXT, v_replay."id", btrim(v_replay."report_sha256"), btrim(v_replay."proof_sha256");
RETURN; END IF; RETURN QUERY SELECT * FROM "publish_reader_summary_legacy_v1"(payload); RETURN;
END IF; IF v_job."status" <> 'RUNNING' OR v_artifact."status" <> 'RUNNING'
OR v_artifact."scope_type" <> v_job."scope_type" OR v_artifact."scope_key" <> v_job."scope_key"
OR v_artifact."interest_id" IS DISTINCT FROM v_job."interest_id"
OR v_artifact."cadence" <> v_job."cadence"
OR v_artifact."period_started_at" <> v_job."period_started_at"
OR v_artifact."period_ended_at" <> v_job."period_ended_at"
OR v_artifact."period_timezone" <> v_job."period_timezone"
OR v_artifact."period_key" <> v_job."period_key"
OR v_artifact."artifact_payload"->>'readerSummaryId' <> v_artifact."id"::TEXT
OR v_artifact."artifact_payload"->>'tenantId' <> v_artifact."tenant_id"::TEXT
OR v_artifact."artifact_payload"->>'workspaceId' <> v_artifact."workspace_id"::TEXT
OR v_artifact."artifact_payload"->'citationMap' IS DISTINCT FROM v_artifact."citations"
OR v_artifact."artifact_payload"->'qualityFlags'
IS DISTINCT FROM v_artifact."quality_signals"->'qualityFlags' THEN
RAISE EXCEPTION 'reader summary publication DB binding is incomplete'; END IF; IF v_is_v2 AND (
v_job."cadence" <> 'daily' OR v_job."period_timezone" <> 'UTC'
OR v_job."period_started_at" <> date_trunc( 'day', v_job."period_started_at" AT TIME ZONE 'UTC'
) AT TIME ZONE 'UTC' OR v_job."period_ended_at" <> v_job."period_started_at" + INTERVAL '1 day'
) THEN RAISE EXCEPTION 'reader summary publication command v2 requires one exact UTC day'; END IF;
v_semantic_status := CASE WHEN COALESCE(v_artifact."quality_signals"->'qualityFlags'
? 'no_signal', FALSE) THEN 'NO_SIGNAL'::"SummaryStatus" ELSE 'COMPLETED'::"SummaryStatus" END;
v_published_at := CASE WHEN v_is_v2 THEN transaction_timestamp()
ELSE (payload->>'publishedAt')::TIMESTAMPTZ END; IF v_published_at < v_job."requested_at" THEN
RAISE EXCEPTION 'reader summary publication time is invalid'; END IF;
v_event_id := CASE WHEN v_is_v2 THEN gen_random_uuid()
ELSE (payload->'readyEvent'->>'eventId')::UUID END; v_report := jsonb_build_object(
'schemaVersion', 'reader_summary.publication_report.v1', 'semanticStatus', v_semantic_status::TEXT,
'modelVersion', v_artifact."model_version", 'promptVersion', v_artifact."prompt_version",
'headline', v_artifact."headline", 'summaryText', v_artifact."summary_text",
'artifactPayload', v_artifact."artifact_payload", 'citations', v_artifact."citations",
'qualitySignals', v_artifact."quality_signals" || jsonb_build_object(
'publicationGeneration', jsonb_build_object( 'requestedAt', to_char(
v_job."requested_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"' ) ) ) );
v_report_canonical := "reader_summary_weekly_canonical_json"(v_report);
v_report_sha := encode(sha256(convert_to( v_report_canonical, 'UTF8' )), 'hex');
v_exact_proof := jsonb_build_object( 'schemaVersion', 'reader_summary.publication_proof.v1',
'tenantId', v_job."tenant_id"::TEXT, 'workspaceId', v_job."workspace_id"::TEXT,
'scope', jsonb_build_object( 'type', v_job."scope_type", 'key', v_job."scope_key" ),
'period', jsonb_build_object( 'cadence', v_job."cadence",
'startedAt', to_char(v_job."period_started_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
'endedAt', to_char(v_job."period_ended_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
'timezone', v_job."period_timezone", 'periodKey', v_job."period_key" ), 'requestedUtcDate',
CASE WHEN v_is_v2 THEN to_char(v_job."period_started_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD')
ELSE to_char(v_job."requested_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD') END,
'requestedAt', to_char(v_job."requested_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
'readerSummaryJobId', v_job."id"::TEXT, 'readerSummaryArtifactId', v_artifact."id"::TEXT,
'semanticStatus', v_semantic_status::TEXT, 'modelVersion', v_artifact."model_version",
'reportSha256', v_report_sha ); v_event := CASE WHEN v_is_v2 THEN jsonb_build_object(
'eventId', v_event_id::TEXT, 'eventType', 'reader_summary.ready', 'schemaVersion', 1,
'occurredAt', to_char(v_published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
'tenantId', v_job."tenant_id"::TEXT, 'workspaceId', v_job."workspace_id"::TEXT,
'correlationId', v_job."id"::TEXT, 'causationId', v_job."id"::TEXT, 'payload', jsonb_build_object(
'readerSummaryJobId', v_job."id"::TEXT, 'readerSummaryId', v_artifact."id"::TEXT,
'tenantId', v_job."tenant_id"::TEXT, 'workspaceId', v_job."workspace_id"::TEXT,
'scope', v_artifact."artifact_payload"->'scope', 'period', v_artifact."artifact_payload"->'period',
'status', lower(v_semantic_status::TEXT) )
|| CASE WHEN v_job."user_id" IS NULL THEN '{}'::JSONB
ELSE jsonb_build_object('userId', v_job."user_id") END
|| CASE WHEN v_job."subscription_id" IS NULL THEN '{}'::JSONB
ELSE jsonb_build_object('subscriptionId', v_job."subscription_id"::TEXT) END ) )
ELSE payload->'readyEvent' END;
v_derived := jsonb_build_object( 'schemaVersion', 'reader_summary.publication.v1',
'tenantId', v_job."tenant_id"::TEXT, 'workspaceId', v_job."workspace_id"::TEXT,
'scopeType', v_job."scope_type", 'scopeKey', v_job."scope_key", 'cadence', v_job."cadence",
'periodStartedAt', v_exact_proof->'period'->>'startedAt',
'periodEndedAt', v_exact_proof->'period'->>'endedAt',
'periodTimezone', v_job."period_timezone", 'periodKey', v_job."period_key",
'requestedUtcDate', v_exact_proof->>'requestedUtcDate',
'requestedAt', v_exact_proof->>'requestedAt', 'readerSummaryJobId', v_job."id"::TEXT,
'readerSummaryArtifactId', v_artifact."id"::TEXT, 'semanticStatus', v_semantic_status::TEXT,
'modelVersion', v_artifact."model_version",
'publishedAt', to_char(v_published_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
'report', v_report, 'reportCanonical', v_report_canonical,
'reportSha256', v_report_sha, 'exactProof', v_exact_proof, 'proofCanonical',
"reader_summary_weekly_canonical_json"(v_exact_proof), 'proofSha256', encode(sha256(convert_to(
"reader_summary_weekly_canonical_json"(v_exact_proof), 'UTF8' )), 'hex'), 'readyEvent', v_event
) || CASE WHEN v_job."interest_id" IS NULL THEN '{}'::JSONB
ELSE jsonb_build_object('interestId', v_job."interest_id"::TEXT) END
|| CASE WHEN v_job."user_id" IS NULL THEN '{}'::JSONB
ELSE jsonb_build_object('userId', v_job."user_id") END
|| CASE WHEN v_job."subscription_id" IS NULL THEN '{}'::JSONB ELSE jsonb_build_object(
'subscriptionId', v_job."subscription_id"::TEXT ) END;
IF NOT v_is_v2 AND payload IS DISTINCT FROM v_derived THEN RAISE EXCEPTION
'reader summary legacy publication command diverges from DB authority'; END IF;
IF v_is_v2 THEN SELECT * INTO v_result FROM "publish_reader_summary_pre_evidence"(v_derived);
ELSE SELECT * INTO v_result FROM "publish_reader_summary_legacy_v1"(v_derived); END IF;
IF v_result.outcome = 'published' AND v_job."cadence" = 'daily' AND v_job."period_timezone" = 'UTC'
AND v_job."period_started_at" = date_trunc( 'day', v_job."period_started_at" AT TIME ZONE 'UTC'
) AT TIME ZONE 'UTC' AND v_job."period_ended_at" = v_job."period_started_at" + INTERVAL '1 day' THEN
PERFORM "record_reader_summary_weekly_publication_evidence"( v_result.publication_id ); END IF;
RETURN QUERY SELECT v_result.outcome::TEXT, v_result.publication_id::UUID,
v_result.report_sha256::TEXT, v_result.proof_sha256::TEXT; END; $$; REVOKE ALL PRIVILEGES ON TABLE
"reader_summary_weekly_publication_evidence"
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";
GRANT SELECT ON TABLE "reader_summary_weekly_publication_evidence"
TO "social_monitor_reader_summary_publication_runtime"; REVOKE ALL PRIVILEGES ON FUNCTION
"publish_reader_summary_legacy_v1"(JSONB), "publish_reader_summary_pre_evidence"(JSONB),
"reader_summary_weekly_utf16_sort_key"(TEXT),
"reader_summary_weekly_utf16_length"(TEXT), "reader_summary_weekly_canonical_number"(JSONB),
"reader_summary_weekly_canonical_json_unbounded"(JSONB),
"reader_summary_weekly_canonical_json"(JSONB), "guard_reader_summary_weekly_publication_evidence"(),
"record_reader_summary_weekly_publication_evidence"(UUID), "publish_reader_summary"(JSONB)
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";
GRANT EXECUTE ON FUNCTION "publish_reader_summary"(JSONB)
TO "social_monitor_reader_summary_publication_runtime"; RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner"; REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner" CASCADE; RESET ROLE; COMMIT;
