-- @social-monitor-forward-migration
-- Admit the exact production-recovery evidence envelope without changing the
-- shared weekly publication canonical bounds.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE FUNCTION
"reader_summary_production_recovery_canonical_json"(
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
    SELECT
      reader_summary_production_recovery_canonical_json.value,
      0
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

  IF v_depth > 24 THEN
    RAISE EXCEPTION
      'production recovery canonical JSON exceeds depth bound';
  ELSIF v_nodes > 6000 THEN
    RAISE EXCEPTION
      'production recovery canonical JSON exceeds node bound';
  ELSIF v_object_keys > 5700 THEN
    RAISE EXCEPTION
      'production recovery canonical JSON exceeds total object-key bound';
  ELSIF v_max_keys > 64 THEN
    RAISE EXCEPTION
      'production recovery canonical JSON exceeds per-object key bound';
  ELSIF v_array_elements > 4096 THEN
    RAISE EXCEPTION
      'production recovery canonical JSON exceeds total array bound';
  ELSIF v_max_array > 512 THEN
    RAISE EXCEPTION
      'production recovery canonical JSON exceeds per-array bound';
  ELSIF v_max_string > 16384 THEN
    RAISE EXCEPTION
      'production recovery canonical JSON exceeds string bound';
  END IF;

  v_result := public.reader_summary_weekly_canonical_json_unbounded(value);
  v_bytes := pg_catalog.octet_length(
    pg_catalog.convert_to(v_result, 'UTF8')
  );
  IF v_bytes > 1048576 THEN
    RAISE EXCEPTION
      'production recovery canonical JSON exceeds byte bound';
  END IF;
  RETURN v_result;
END;
$$;

REVOKE ALL PRIVILEGES ON FUNCTION
  "reader_summary_production_recovery_canonical_json"(JSONB)
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";

DO $replace_recovery_evidence_canonicalizer$
DECLARE
  v_definition TEXT;
  v_recovery_call CONSTANT TEXT :=
    '"reader_summary_production_recovery_canonical_json"(v_evidence)';
  v_shared_call CONSTANT TEXT :=
    '"reader_summary_weekly_canonical_json"(v_evidence)';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'persist_reader_summary_production_recovery_v2(jsonb)'
      ::pg_catalog.regprocedure
  )
  INTO STRICT v_definition;

  IF (
      pg_catalog.length(v_definition) -
      pg_catalog.length(
        pg_catalog.replace(v_definition, v_shared_call, '')
      )
    ) / pg_catalog.length(v_shared_call) <> 2
    OR pg_catalog.strpos(v_definition, v_recovery_call) <> 0
    OR pg_catalog.strpos(
      v_definition,
      'reader_summary.production_recovery_authority.v2'
    ) = 0
    OR pg_catalog.strpos(
      v_definition,
      'jsonb_array_length(binding->''days'') <> 6'
    ) = 0 THEN
    RAISE EXCEPTION
      'production recovery persistence canonical predecessor diverged';
  END IF;

  v_definition := pg_catalog.replace(
    v_definition,
    v_shared_call,
    v_recovery_call
  );
  EXECUTE v_definition;
END;
$replace_recovery_evidence_canonicalizer$;

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;

COMMIT;
