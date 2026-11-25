-- @social-monitor-repair-migration
-- Forward-only repair for PostgreSQL 18 canonical JSON compatibility.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE OR REPLACE FUNCTION public.jsonb_object_length(JSONB) RETURNS INTEGER
LANGUAGE SQL
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, public, pg_temp
RETURN (
  SELECT count(*)::INTEGER
  FROM pg_catalog.jsonb_object_keys($1)
);

CREATE OR REPLACE FUNCTION public.reader_summary_weekly_float8_shortest(
  value DOUBLE PRECISION
) RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, public, pg_temp
SET extra_float_digits = 3
RETURN value::TEXT;

CREATE OR REPLACE FUNCTION public.reader_summary_weekly_canonical_number(
  value JSONB
) RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
  v_decimal_at INTEGER;
  v_digit_count INTEGER;
  v_digits TEXT;
  v_exponent INTEGER := 0;
  v_float DOUBLE PRECISION;
  v_leading_zero_count INTEGER;
  v_mantissa TEXT;
  v_negative BOOLEAN;
  v_result TEXT;
  v_roundtrip JSONB;
  v_shortest TEXT;
BEGIN
  IF pg_catalog.jsonb_typeof(value) <> 'number' THEN
    RAISE EXCEPTION 'weekly canonical number requires a JSON number';
  END IF;
  v_float := (value #>> '{}')::DOUBLE PRECISION;
  IF v_float::TEXT IN ('Infinity', '-Infinity', 'NaN') THEN
    RAISE EXCEPTION 'weekly canonical number must be finite';
  END IF;
  IF v_float = 0 THEN
    v_result := '0';
  ELSE
    v_negative := v_float < 0;
    v_shortest := lower(
      public.reader_summary_weekly_float8_shortest(pg_catalog.abs(v_float))
    );
    IF v_shortest !~ '^[0-9]+([.][0-9]+)?(e[+-]?[0-9]+)?$' THEN
      RAISE EXCEPTION 'weekly canonical shortest float syntax is invalid';
    END IF;
    IF position('e' IN v_shortest) > 0 THEN
      v_mantissa := split_part(v_shortest, 'e', 1);
      v_exponent := split_part(v_shortest, 'e', 2)::INTEGER;
    ELSE
      v_mantissa := v_shortest;
    END IF;

    IF position('.' IN v_mantissa) > 0 THEN
      v_decimal_at := position('.' IN v_mantissa) - 1 + v_exponent;
    ELSE
      v_decimal_at := length(v_mantissa) + v_exponent;
    END IF;
    v_digits := replace(v_mantissa, '.', '');
    v_leading_zero_count := length(v_digits) - length(ltrim(v_digits, '0'));
    v_decimal_at := v_decimal_at - v_leading_zero_count;
    v_digits := rtrim(ltrim(v_digits, '0'), '0');
    v_digit_count := length(v_digits);

    IF v_digit_count <= v_decimal_at AND v_decimal_at <= 21 THEN
      v_result := v_digits || repeat('0', v_decimal_at - v_digit_count);
    ELSIF 0 < v_decimal_at AND v_decimal_at < v_digit_count THEN
      v_result := left(v_digits, v_decimal_at) || '.' ||
        substr(v_digits, v_decimal_at + 1);
    ELSIF -6 < v_decimal_at AND v_decimal_at <= 0 THEN
      v_result := '0.' || repeat('0', -v_decimal_at) || v_digits;
    ELSE
      v_exponent := v_decimal_at - 1;
      v_result := left(v_digits, 1) ||
        CASE
          WHEN v_digit_count > 1 THEN '.' || substr(v_digits, 2)
          ELSE ''
        END ||
        'e' ||
        CASE WHEN v_exponent >= 0 THEN '+' ELSE '' END ||
        v_exponent::TEXT;
    END IF;

    IF v_negative THEN
      v_result := '-' || v_result;
    END IF;
  END IF;
  v_roundtrip := v_result::JSONB;
  IF value IS DISTINCT FROM v_roundtrip
    OR pg_catalog.float8send(v_float) IS DISTINCT FROM
      pg_catalog.float8send(
        (v_roundtrip #>> '{}')::DOUBLE PRECISION
      ) THEN
    RAISE EXCEPTION 'weekly canonical number does not round-trip';
  END IF;
  RETURN v_result;
END;
$$;

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
    OR v_max_array > 256
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
  public.jsonb_object_length(JSONB),
  public.reader_summary_weekly_float8_shortest(DOUBLE PRECISION),
  public.reader_summary_weekly_canonical_number(JSONB),
  public.reader_summary_weekly_canonical_json(JSONB)
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";

DO $repair_publication_schema_version$ DECLARE v_definition TEXT; v_old CONSTANT TEXT := 'NOT v_is_v2 AND payload->>''schemaVersion'' <> ''reader_summary.publication.v1'''; v_new CONSTANT TEXT := 'v_is_v2 IS NOT TRUE AND payload->>''schemaVersion'' IS DISTINCT FROM ''reader_summary.publication.v1'''; BEGIN SELECT pg_catalog.pg_get_functiondef('public.publish_reader_summary(jsonb)'::pg_catalog.regprocedure) INTO STRICT v_definition; IF (pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))) / pg_catalog.length(v_old) <> 1 OR pg_catalog.strpos(v_definition, v_new) <> 0 THEN RAISE EXCEPTION 'weekly publication schema-version predicate is not the expected stale definition'; END IF; EXECUTE pg_catalog.replace(v_definition, v_old, v_new); END; $repair_publication_schema_version$;
DO $repair_scan_job_status$ DECLARE v_definition TEXT; v_old CONSTANT TEXT := 'scan."status" = ''COMPLETED'''; v_new CONSTANT TEXT := 'scan."status" = ''SUCCEEDED'''; BEGIN SELECT pg_catalog.pg_get_functiondef('public.record_reader_summary_weekly_publication_evidence(uuid)'::pg_catalog.regprocedure) INTO STRICT v_definition; IF (pg_catalog.length(v_definition) - pg_catalog.length(pg_catalog.replace(v_definition, v_old, ''))) / pg_catalog.length(v_old) <> 1 OR pg_catalog.strpos(v_definition, v_new) <> 0 THEN RAISE EXCEPTION 'weekly publication scan-job predicate is not the expected stale definition'; END IF; EXECUTE pg_catalog.replace(v_definition, v_old, v_new); END; $repair_scan_job_status$; RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;

COMMIT;
