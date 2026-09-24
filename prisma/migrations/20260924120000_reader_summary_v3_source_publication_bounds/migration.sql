-- @social-monitor-forward-migration
-- V3's signed captured source permits 64,000 UTF-16 units. Keep the legacy
-- canonical profile for V1/V2 and use a finite V3 profile only for jobs whose
-- frozen selection strategy is jev_primary_v3. Canonical bytes are unchanged.
BEGIN;
SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT CREATE ON SCHEMA public TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE FUNCTION public.reader_summary_v3_publication_canonical_json(
  value JSONB, selection_strategy TEXT, legacy_profile TEXT
) RETURNS TEXT LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE
SET search_path = pg_catalog AS $function$
DECLARE
  v_artifact JSONB;
  v_array_elements BIGINT;
  v_bytes BIGINT;
  v_depth INTEGER;
  v_max_array INTEGER;
  v_max_keys INTEGER;
  v_max_string INTEGER;
  v_nodes BIGINT;
  v_object_keys BIGINT;
  v_result TEXT;
  v_source JSONB;
BEGIN
  IF value IS NULL THEN RETURN NULL; END IF;
  IF legacy_profile IS NULL OR legacy_profile NOT IN ('weekly', 'report', 'artifact') THEN
    RAISE EXCEPTION 'reader summary canonical profile is invalid';
  END IF;
  IF selection_strategy IS DISTINCT FROM 'jev_primary_v3' THEN
    CASE legacy_profile
      WHEN 'report' THEN RETURN public.reader_summary_daily_canonical_recovery_v4_report_canonical_json(value);
      WHEN 'artifact' THEN RETURN public.reader_summary_daily_artifact_canonical_json(value);
      ELSE RETURN public.reader_summary_weekly_canonical_json(value);
    END CASE;
  END IF;

  -- Sixteen selected cards can each carry a 64k-unit source. Allow finite
  -- headroom for UTF-8 and summaries before walking or copying the tree.
  IF octet_length(convert_to(value::TEXT, 'UTF8')) > 16777216 THEN
    RAISE EXCEPTION 'V3 publication canonical JSON exceeds byte bounds';
  END IF;
  IF legacy_profile IN ('report', 'artifact') THEN
    v_artifact := CASE legacy_profile WHEN 'report' THEN value->'artifactPayload'
      ELSE value END;
    IF jsonb_typeof(v_artifact) IS DISTINCT FROM 'object'
      OR v_artifact->>'schemaVersion' IS DISTINCT FROM 'reader_summary.artifact.v1' THEN
      RAISE EXCEPTION 'V3 publication artifact shape is invalid';
    END IF;
    FOR v_source IN SELECT card.value->'capturedSource' FROM (
      SELECT item.value FROM jsonb_array_elements(CASE
        WHEN jsonb_typeof(v_artifact->'content'->'topReads') = 'array'
          THEN v_artifact->'content'->'topReads'
        ELSE '[]'::JSONB END) AS item
      UNION ALL
      SELECT item.value FROM jsonb_array_elements(CASE
        WHEN jsonb_typeof(v_artifact->'content'->'selectedPosts') = 'array'
          THEN v_artifact->'content'->'selectedPosts'
        ELSE '[]'::JSONB END) AS item
      UNION ALL
      SELECT item.value FROM jsonb_array_elements(CASE
        WHEN jsonb_typeof(v_artifact->'content'->'additionalPosts') = 'array'
          THEN v_artifact->'content'->'additionalPosts'
        ELSE '[]'::JSONB END) AS item
    ) AS card WHERE card.value ? 'capturedSource'
    LOOP
      IF jsonb_typeof(v_source) IS DISTINCT FROM 'object'
        OR jsonb_typeof(v_source->'title') IS DISTINCT FROM 'string'
        OR jsonb_typeof(v_source->'body') IS DISTINCT FROM 'string'
        OR public.reader_summary_weekly_utf16_length(v_source->>'title') > 2000
        OR public.reader_summary_weekly_utf16_length(v_source->>'body') > 64000 THEN
        RAISE EXCEPTION 'V3 captured source exceeds signed bounds';
      END IF;
    END LOOP;
  END IF;

  WITH RECURSIVE node(child, depth) AS (
    SELECT value, 0
    UNION ALL
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
  IF legacy_profile IN ('report', 'artifact') AND v_max_string > 16384
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(CASE
        WHEN jsonb_typeof(v_artifact->'promotionAttestations') = 'array'
          THEN v_artifact->'promotionAttestations'
        ELSE '[]'::JSONB END) AS attestation(value)
      WHERE attestation.value->>'schemaVersion'
        = 'reader_post_promotion_attestation.v3'
    ) THEN
    RAISE EXCEPTION 'long V3 publication requires a V3 promotion attestation';
  END IF;
  IF v_depth > 32 OR v_nodes > 25000 OR v_object_keys > 20000
    OR v_max_keys > 128 OR v_array_elements > 20000
    OR v_max_array > 1024 OR v_max_string > 64000 THEN
    RAISE EXCEPTION 'V3 publication canonical JSON exceeds structural bounds';
  END IF;
  v_result := public.reader_summary_weekly_canonical_json_unbounded(value);
  v_bytes := octet_length(convert_to(v_result, 'UTF8'));
  IF v_bytes > 16777216 THEN
    RAISE EXCEPTION 'V3 publication canonical JSON exceeds byte bounds';
  END IF;
  RETURN v_result;
END;
$function$;

-- Function-definition rewrites are pinned to exact call sites. This protects
-- the security-definer publication flow and leaves the V2 branch unchanged.
DO $rewrite_v3_publication$
DECLARE
  v_definition TEXT;
  v_function REGPROCEDURE;
  v_needles TEXT[] := ARRAY[
    '"reader_summary_daily_canonical_recovery_v4_report_canonical_json"(v_report)',
    '"reader_summary_daily_artifact_canonical_json"(v_artifact."artifact_payload")',
    '"reader_summary_weekly_canonical_json"(v_provider)',
    '"reader_summary_weekly_canonical_json"(v_github_body)',
    '"reader_summary_weekly_canonical_json"(v_publication."exact_proof")',
    '"reader_summary_weekly_canonical_json"(v_body)'
  ];
  v_profiles TEXT[] := ARRAY['report', 'artifact', 'weekly', 'weekly', 'weekly', 'weekly'];
  v_expected INTEGER[] := ARRAY[1, 1, 2, 1, 1, 1];
  v_needle TEXT;
  v_replacement TEXT;
  v_count INTEGER;
  i INTEGER;
BEGIN
  v_function := 'public.record_reader_summary_weekly_publication_evidence_base(uuid)'::REGPROCEDURE;
  SELECT pg_get_functiondef(v_function) INTO STRICT v_definition;
  FOR i IN 1..array_length(v_needles, 1) LOOP
    v_needle := v_needles[i];
    v_count := (length(v_definition) - length(replace(v_definition, v_needle, '')))
      / length(v_needle);
    IF v_count <> v_expected[i] THEN
      RAISE EXCEPTION 'V3 evidence canonical call % diverged: %', i, v_count;
    END IF;
    v_replacement := 'public.reader_summary_v3_publication_canonical_json('
      || CASE i WHEN 2 THEN 'v_artifact."artifact_payload"'
        WHEN 3 THEN 'v_provider' WHEN 4 THEN 'v_github_body'
        WHEN 5 THEN 'v_publication."exact_proof"' WHEN 6 THEN 'v_body'
        ELSE 'v_report' END
      || ', v_job."selection_strategy", ''' || v_profiles[i] || ''')';
    v_definition := replace(v_definition, v_needle, v_replacement);
  END LOOP;
  EXECUTE v_definition;

  v_function := 'public.publish_reader_summary(jsonb)'::REGPROCEDURE;
  SELECT pg_get_functiondef(v_function) INTO STRICT v_definition;
  v_needle := '"reader_summary_daily_canonical_recovery_v4_report_canonical_json"(v_report)';
  v_count := (length(v_definition) - length(replace(v_definition, v_needle, '')))
    / length(v_needle);
  IF v_count <> 1 THEN
    RAISE EXCEPTION 'V3 publisher report canonical call diverged: %', v_count;
  END IF;
  EXECUTE replace(v_definition, v_needle,
    'public.reader_summary_v3_publication_canonical_json(v_report, v_job."selection_strategy", ''report'')');
END;
$rewrite_v3_publication$;

REVOKE ALL ON FUNCTION public.reader_summary_v3_publication_canonical_json(JSONB, TEXT, TEXT)
  FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";
RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;
COMMIT;
