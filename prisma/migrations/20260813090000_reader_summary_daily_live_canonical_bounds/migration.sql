-- @social-monitor-forward-migration
-- Admit only strict one-day daily reports/model outputs to the existing finite
-- daily canonical profile. Shared weekly bounds remain unchanged.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE OR REPLACE FUNCTION public."reader_summary_daily_canonical_recovery_v4_report_canonical_json"(
  value JSONB
) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog AS $function$
DECLARE
  v_array_elements BIGINT; v_bytes BIGINT; v_depth INTEGER;
  v_max_array INTEGER; v_max_keys INTEGER; v_max_string INTEGER;
  v_nodes BIGINT; v_object_keys BIGINT; v_result TEXT;
  v_period JSONB;
BEGIN
  IF jsonb_typeof(value) IS DISTINCT FROM 'object'
    OR public.jsonb_object_length(value) <> 9
    OR NOT (value ?& ARRAY[
      'schemaVersion', 'semanticStatus', 'modelVersion', 'promptVersion',
      'headline', 'summaryText', 'artifactPayload', 'citations', 'qualitySignals'
    ])
    OR value->>'schemaVersion' IS DISTINCT FROM 'reader_summary.publication_report.v1'
    OR value->'artifactPayload'->>'schemaVersion'
      IS DISTINCT FROM 'reader_summary.artifact.v1' THEN
    RETURN public."reader_summary_weekly_canonical_json"(value);
  END IF;
  v_period := value->'artifactPayload'->'period';
  IF value->'qualitySignals'->'githubProjectionAudit'->'recoveryV4'->>'recoveryVersion'
      IS DISTINCT FROM 'reader_summary.daily_canonical_recovery.v4' THEN
    IF jsonb_typeof(v_period) IS DISTINCT FROM 'object'
      OR public.jsonb_object_length(v_period) <> 5
      OR NOT (v_period ?& ARRAY[
        'cadence', 'startedAt', 'endedAt', 'timezone', 'periodKey'
      ])
      OR v_period->>'cadence' IS DISTINCT FROM 'daily'
      OR v_period->>'timezone' IS DISTINCT FROM 'UTC'
      OR v_period->>'periodKey' IS DISTINCT FROM
        ('daily:' || (v_period->>'startedAt') || ':' ||
        (v_period->>'endedAt') || ':UTC')
      OR COALESCE(v_period->>'startedAt', '') !~
        '^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$'
      OR COALESCE(v_period->>'endedAt', '') !~
        '^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$' THEN
      RETURN public."reader_summary_weekly_canonical_json"(value);
    END IF;
    BEGIN
      IF (v_period->>'endedAt')::TIMESTAMPTZ -
        (v_period->>'startedAt')::TIMESTAMPTZ IS DISTINCT FROM INTERVAL '1 day' THEN
        RETURN public."reader_summary_weekly_canonical_json"(value);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RETURN public."reader_summary_weekly_canonical_json"(value);
    END;
  END IF;
  IF octet_length(convert_to(value::TEXT, 'UTF8')) > 4194304 THEN
    RAISE EXCEPTION 'daily publication report exceeds byte bounds';
  END IF;
  WITH RECURSIVE node(child, depth) AS (
    SELECT value, 0 UNION ALL
    SELECT nested.child, node.depth + 1 FROM node CROSS JOIN LATERAL (
      SELECT item.value AS child FROM jsonb_array_elements(
        CASE jsonb_typeof(node.child) WHEN 'array' THEN node.child ELSE '[]'::JSONB END
      ) AS item
      UNION ALL
      SELECT item.value AS child FROM jsonb_each(
        CASE jsonb_typeof(node.child) WHEN 'object' THEN node.child ELSE '{}'::JSONB END
      ) AS item
    ) AS nested WHERE node.depth <= 32
  )
  SELECT count(*), max(depth),
    COALESCE(sum(CASE jsonb_typeof(child) WHEN 'object'
      THEN public.jsonb_object_length(child) ELSE 0 END), 0),
    COALESCE(max(CASE jsonb_typeof(child) WHEN 'object'
      THEN public.jsonb_object_length(child) ELSE 0 END), 0),
    COALESCE(sum(CASE jsonb_typeof(child) WHEN 'array'
      THEN jsonb_array_length(child) ELSE 0 END), 0),
    COALESCE(max(CASE jsonb_typeof(child) WHEN 'array'
      THEN jsonb_array_length(child) ELSE 0 END), 0),
    COALESCE(max(CASE jsonb_typeof(child) WHEN 'string'
      THEN public.reader_summary_weekly_utf16_length(child #>> '{}') ELSE 0 END), 0)
  INTO v_nodes, v_depth, v_object_keys, v_max_keys,
    v_array_elements, v_max_array, v_max_string FROM node;
  IF v_depth > 32 OR v_nodes > 25000 OR v_object_keys > 20000
    OR v_max_keys > 128 OR v_array_elements > 20000
    OR v_max_array > 1024 OR v_max_string > 65536 THEN
    RAISE EXCEPTION 'daily publication report exceeds structural bounds';
  END IF;
  v_result := public."reader_summary_weekly_canonical_json_unbounded"(value);
  v_bytes := octet_length(convert_to(v_result, 'UTF8'));
  IF v_bytes > 4194304 THEN
    RAISE EXCEPTION 'daily publication report exceeds byte bounds';
  END IF;
  RETURN v_result;
END;
$function$;

CREATE FUNCTION public."reader_summary_daily_artifact_canonical_json"(
  value JSONB
) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE
SET search_path = pg_catalog AS $function$
DECLARE
  v_array_elements BIGINT; v_bytes BIGINT; v_depth INTEGER;
  v_max_array INTEGER; v_max_keys INTEGER; v_max_string INTEGER;
  v_nodes BIGINT; v_object_keys BIGINT; v_result TEXT; v_period JSONB;
BEGIN
  v_period := value->'period';
  IF jsonb_typeof(value) IS DISTINCT FROM 'object'
    OR value->>'schemaVersion' IS DISTINCT FROM 'reader_summary.artifact.v1'
    OR jsonb_typeof(v_period) IS DISTINCT FROM 'object'
    OR public.jsonb_object_length(v_period) <> 5
    OR NOT (v_period ?& ARRAY[
      'cadence', 'startedAt', 'endedAt', 'timezone', 'periodKey'
    ])
    OR v_period->>'cadence' IS DISTINCT FROM 'daily'
    OR v_period->>'timezone' IS DISTINCT FROM 'UTC'
    OR v_period->>'periodKey' IS DISTINCT FROM
      ('daily:' || (v_period->>'startedAt') || ':' ||
      (v_period->>'endedAt') || ':UTC')
    OR COALESCE(v_period->>'startedAt', '') !~
      '^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$'
    OR COALESCE(v_period->>'endedAt', '') !~
      '^\d{4}-\d{2}-\d{2}T00:00:00\.000Z$' THEN
    RETURN public."reader_summary_weekly_canonical_json"(value);
  END IF;
  BEGIN
    IF (v_period->>'endedAt')::TIMESTAMPTZ -
      (v_period->>'startedAt')::TIMESTAMPTZ IS DISTINCT FROM INTERVAL '1 day' THEN
      RETURN public."reader_summary_weekly_canonical_json"(value);
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN public."reader_summary_weekly_canonical_json"(value);
  END;
  IF octet_length(convert_to(value::TEXT, 'UTF8')) > 4194304 THEN
    RAISE EXCEPTION 'daily artifact exceeds byte bounds';
  END IF;
  WITH RECURSIVE node(child, depth) AS (
    SELECT value, 0 UNION ALL
    SELECT nested.child, node.depth + 1 FROM node CROSS JOIN LATERAL (
      SELECT item.value AS child FROM jsonb_array_elements(
        CASE jsonb_typeof(node.child) WHEN 'array' THEN node.child ELSE '[]'::JSONB END
      ) AS item
      UNION ALL
      SELECT item.value AS child FROM jsonb_each(
        CASE jsonb_typeof(node.child) WHEN 'object' THEN node.child ELSE '{}'::JSONB END
      ) AS item
    ) AS nested WHERE node.depth <= 32
  )
  SELECT count(*), max(depth),
    COALESCE(sum(CASE jsonb_typeof(child) WHEN 'object'
      THEN public.jsonb_object_length(child) ELSE 0 END), 0),
    COALESCE(max(CASE jsonb_typeof(child) WHEN 'object'
      THEN public.jsonb_object_length(child) ELSE 0 END), 0),
    COALESCE(sum(CASE jsonb_typeof(child) WHEN 'array'
      THEN jsonb_array_length(child) ELSE 0 END), 0),
    COALESCE(max(CASE jsonb_typeof(child) WHEN 'array'
      THEN jsonb_array_length(child) ELSE 0 END), 0),
    COALESCE(max(CASE jsonb_typeof(child) WHEN 'string'
      THEN public.reader_summary_weekly_utf16_length(child #>> '{}') ELSE 0 END), 0)
  INTO v_nodes, v_depth, v_object_keys, v_max_keys,
    v_array_elements, v_max_array, v_max_string FROM node;
  IF v_depth > 32 OR v_nodes > 25000 OR v_object_keys > 20000
    OR v_max_keys > 128 OR v_array_elements > 20000
    OR v_max_array > 1024 OR v_max_string > 65536 THEN
    RAISE EXCEPTION 'daily artifact exceeds structural bounds';
  END IF;
  v_result := public."reader_summary_weekly_canonical_json_unbounded"(value);
  v_bytes := octet_length(convert_to(v_result, 'UTF8'));
  IF v_bytes > 4194304 THEN RAISE EXCEPTION 'daily artifact exceeds byte bounds'; END IF;
  RETURN v_result;
END;
$function$;

DO $rewrite_daily_live_evidence_canonicalizers$
DECLARE
  v_definition TEXT;
  v_report_needle CONSTANT TEXT :=
    '"reader_summary_weekly_canonical_json"(v_report)';
  v_report_replacement CONSTANT TEXT :=
    '"reader_summary_daily_canonical_recovery_v4_report_canonical_json"(v_report)';
  v_artifact_needle CONSTANT TEXT :=
    '"reader_summary_weekly_canonical_json"(v_artifact."artifact_payload")';
  v_artifact_replacement CONSTANT TEXT :=
    '"reader_summary_daily_artifact_canonical_json"(v_artifact."artifact_payload")';
BEGIN
  SELECT pg_get_functiondef(
    'public.record_reader_summary_weekly_publication_evidence_base(uuid)'::REGPROCEDURE
  ) INTO STRICT v_definition;
  IF length(v_definition) - length(replace(v_definition, v_report_needle, ''))
      <> length(v_report_needle)
    OR length(v_definition) - length(replace(v_definition, v_artifact_needle, ''))
      <> length(v_artifact_needle) THEN
    RAISE EXCEPTION 'daily live evidence canonicalizer targets diverged';
  END IF;
  v_definition := replace(v_definition, v_report_needle, v_report_replacement);
  EXECUTE replace(v_definition, v_artifact_needle, v_artifact_replacement);
END;
$rewrite_daily_live_evidence_canonicalizers$;

REVOKE ALL ON FUNCTION
  public."reader_summary_daily_canonical_recovery_v4_report_canonical_json"(JSONB),
  public."reader_summary_daily_artifact_canonical_json"(JSONB)
FROM PUBLIC, "social_monitor_reader_summary_daily_terminal",
  "social_monitor_reader_summary_publication_runtime",
  "social_monitor_tenant_system_runtime";

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;
COMMIT;
