-- @social-monitor-forward-migration
-- Raise only the bounded per-array capacity needed by DB-authoritative
-- production recovery artifacts. All aggregate and byte bounds remain intact.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

DO $assert_expected_canonical_bound$
DECLARE
  v_definition TEXT;
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.reader_summary_weekly_canonical_json(jsonb)'
      ::pg_catalog.regprocedure
  )
  INTO STRICT v_definition;

  IF pg_catalog.strpos(v_definition, 'v_max_array > 256') = 0
    OR pg_catalog.strpos(v_definition, 'v_max_array > 512') <> 0 THEN
    RAISE EXCEPTION
      'weekly canonical JSON per-array bound is not the expected predecessor';
  END IF;
END;
$assert_expected_canonical_bound$;

CREATE OR REPLACE FUNCTION public.reader_summary_weekly_canonical_json(
  value JSONB
) RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_array_elements BIGINT;
  v_bytes BIGINT;
  v_depth INTEGER;
  v_max_array INTEGER;
  v_max_keys INTEGER;
  v_max_string INTEGER;
  v_nodes BIGINT;
  v_object_keys BIGINT;
  v_result TEXT;
BEGIN
  WITH RECURSIVE node(value, depth) AS (
    SELECT reader_summary_weekly_canonical_json.value, 0
    UNION ALL
    SELECT child.value, node.depth + 1
    FROM node
    CROSS JOIN LATERAL (
      SELECT item.value
      FROM pg_catalog.jsonb_array_elements(
        CASE pg_catalog.jsonb_typeof(node.value)
          WHEN 'array' THEN node.value
          ELSE '[]'::JSONB
        END
      ) AS item
      UNION ALL
      SELECT item.value
      FROM pg_catalog.jsonb_each(
        CASE pg_catalog.jsonb_typeof(node.value)
          WHEN 'object' THEN node.value
          ELSE '{}'::JSONB
        END
      ) AS item
    ) AS child
  )
  SELECT
    count(*),
    max(node.depth),
    COALESCE(sum(
      CASE pg_catalog.jsonb_typeof(node.value)
        WHEN 'object' THEN public.jsonb_object_length(node.value)
        ELSE 0
      END
    ), 0),
    COALESCE(max(
      CASE pg_catalog.jsonb_typeof(node.value)
        WHEN 'object' THEN public.jsonb_object_length(node.value)
        ELSE 0
      END
    ), 0),
    COALESCE(sum(
      CASE pg_catalog.jsonb_typeof(node.value)
        WHEN 'array' THEN pg_catalog.jsonb_array_length(node.value)
        ELSE 0
      END
    ), 0),
    COALESCE(max(
      CASE pg_catalog.jsonb_typeof(node.value)
        WHEN 'array' THEN pg_catalog.jsonb_array_length(node.value)
        ELSE 0
      END
    ), 0),
    COALESCE(max(
      CASE pg_catalog.jsonb_typeof(node.value)
        WHEN 'string' THEN
          public.reader_summary_weekly_utf16_length(node.value #>> '{}')
        ELSE 0
      END
    ), 0)
  INTO
    v_nodes,
    v_depth,
    v_object_keys,
    v_max_keys,
    v_array_elements,
    v_max_array,
    v_max_string
  FROM node;

  IF v_depth > 24
    OR v_nodes > 6000
    OR v_object_keys > 4096
    OR v_max_keys > 64
    OR v_array_elements > 4096
    OR v_max_array > 512
    OR v_max_string > 16384 THEN
    RAISE EXCEPTION 'weekly canonical JSON exceeds structural bounds';
  END IF;
  v_result := public.reader_summary_weekly_canonical_json_unbounded(value);
  v_bytes := pg_catalog.octet_length(
    pg_catalog.convert_to(v_result, 'UTF8')
  );
  IF v_bytes > 1048576 THEN
    RAISE EXCEPTION 'weekly canonical JSON exceeds byte bounds';
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION
  public.reader_summary_weekly_canonical_json(JSONB)
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;

COMMIT;
