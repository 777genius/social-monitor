-- @social-monitor-forward-migration
-- The Jev promotion board now publishes up to 64 promoted cards (12 Top,
-- 36 Show more, 16 news without rating), each with a signed comparator. A
-- realistic full board report measures about 17,700 JSON nodes and 15,700
-- object keys with three headline support spans per card, and about 20,900
-- nodes and 18,300 keys with the maximum of eight spans. That leaves less
-- than 30 percent headroom under the former 25,000 node / 20,000 key bounds,
-- so only those two structural bounds are doubled. The news block is also
-- bound by the captured-source title/body check like the other card lists.
-- Byte, depth, per-object key, array and string bounds are unchanged, and the
-- legacy profiles (selection strategy other than jev_primary_v3) still
-- delegate to their original canonical functions.
BEGIN;
SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT CREATE ON SCHEMA public TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE OR REPLACE FUNCTION public.reader_summary_v3_publication_canonical_json(
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

  -- Up to 64 promoted cards (12 Top, 36 Show more, 16 news) can each carry a
  -- 64k-unit source. The unchanged 16 MiB byte bound is checked before
  -- walking or copying the tree.
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
      UNION ALL
      SELECT item.value FROM jsonb_array_elements(CASE
        WHEN jsonb_typeof(v_artifact->'content'->'newsWithoutRatingPosts') = 'array'
          THEN v_artifact->'content'->'newsWithoutRatingPosts'
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
  IF v_depth > 32 OR v_nodes > 50000 OR v_object_keys > 40000
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

REVOKE ALL ON FUNCTION public.reader_summary_v3_publication_canonical_json(JSONB, TEXT, TEXT)
  FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";
RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;
COMMIT;
