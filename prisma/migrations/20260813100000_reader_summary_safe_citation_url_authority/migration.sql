-- @social-monitor-forward-migration
-- Bind display-safe citation URLs to an immutable projection of locked,
-- already-validated HTTP(S) source/feed URLs. Provider evidence continues to
-- use the exact database URL; this helper is not a general URL parser.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE OR REPLACE FUNCTION public.reader_summary_safe_citation_url(
  value TEXT
) RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog
AS $reader_summary_safe_citation_url$
DECLARE
  v_authority TEXT;
  v_host TEXT;
  v_host_and_port TEXT;
  v_hn_item_id TEXT;
  v_input TEXT := pg_catalog.btrim(value);
  v_match TEXT[];
  v_path TEXT;
  v_query TEXT;
  v_scheme TEXT;
BEGIN
  IF v_input = '' OR v_input ~ '[[:space:][:cntrl:]]' THEN
    RAISE EXCEPTION 'reader summary citation authority URL is invalid';
  END IF;

  v_match := pg_catalog.regexp_match(
    v_input,
    '^([Hh][Tt][Tt][Pp][Ss]?)://([^/?#]+)([^?#]*)(?:[?]([^#]*))?(?:#.*)?$'
  );
  IF v_match IS NULL THEN
    RAISE EXCEPTION 'reader summary citation authority URL is invalid';
  END IF;

  v_scheme := pg_catalog.lower(v_match[1]);
  v_authority := pg_catalog.regexp_replace(v_match[2], '^.*@', '');
  v_host_and_port := pg_catalog.lower(v_authority);
  IF v_host_and_port = '' OR v_host_and_port ~ '[/@]' THEN
    RAISE EXCEPTION 'reader summary citation authority URL is invalid';
  END IF;
  IF v_scheme = 'http' THEN
    v_host_and_port := pg_catalog.regexp_replace(v_host_and_port, ':80$', '');
  ELSE
    v_host_and_port := pg_catalog.regexp_replace(v_host_and_port, ':443$', '');
  END IF;
  IF v_host_and_port = '' THEN
    RAISE EXCEPTION 'reader summary citation authority URL is invalid';
  END IF;

  v_host := CASE
    WHEN pg_catalog.left(v_host_and_port, 1) = '[' THEN
      (pg_catalog.regexp_match(v_host_and_port, '^\[([^]]+)\]'))[1]
    ELSE pg_catalog.split_part(v_host_and_port, ':', 1)
  END;
  IF v_host IS NULL OR v_host = '' THEN
    RAISE EXCEPTION 'reader summary citation authority URL is invalid';
  END IF;

  v_path := COALESCE(v_match[3], '');
  IF v_path = '' THEN
    v_path := '/';
  END IF;
  v_query := v_match[4];

  IF pg_catalog.regexp_replace(v_host, '^www[.]', '') = 'news.ycombinator.com'
    AND pg_catalog.regexp_replace(v_path, '/+$', '') = '/item' THEN
    v_hn_item_id := (
      pg_catalog.regexp_match(
        COALESCE(v_query, ''),
        '(^|&)id=([0-9]+)(&|$)'
      )
    )[2];
  END IF;

  RETURN v_scheme || '://' || v_host_and_port ||
    CASE WHEN v_path = '/' THEN '' ELSE v_path END ||
    CASE WHEN v_hn_item_id IS NULL THEN '' ELSE '?id=' || v_hn_item_id END;
END;
$reader_summary_safe_citation_url$;

REVOKE ALL ON FUNCTION public.reader_summary_safe_citation_url(TEXT)
FROM PUBLIC;

DO $rewrite_reader_summary_safe_citation_url_authority$
DECLARE
  v_definition TEXT;
  v_source_lock_needle CONSTANT TEXT :=
    'AND (
NOT citation.value ? ''canonicalUrl''
OR citation.value->''canonicalUrl'' = ''null''::JSONB
OR source."canonical_url" = citation.value->>''canonicalUrl'' ) ORDER BY source."id"';
  v_source_lock_replacement CONSTANT TEXT :=
    'AND (
NOT citation.value ? ''canonicalUrl''
OR citation.value->''canonicalUrl'' = ''null''::JSONB
OR public.reader_summary_safe_citation_url(source."canonical_url") = citation.value->>''canonicalUrl'' ) ORDER BY source."id"';
  v_feed_lock_needle CONSTANT TEXT :=
    'AND (
NOT citation.value ? ''canonicalUrl''
OR citation.value->''canonicalUrl'' = ''null''::JSONB
OR feed."canonical_url" = citation.value->>''canonicalUrl'' ) ORDER BY feed."id"';
  v_feed_lock_replacement CONSTANT TEXT :=
    'AND (
NOT citation.value ? ''canonicalUrl''
OR citation.value->''canonicalUrl'' = ''null''::JSONB
OR public.reader_summary_safe_citation_url(feed."canonical_url") = citation.value->>''canonicalUrl'' ) ORDER BY feed."id"';
  v_provider_needle CONSTANT TEXT :=
    'AND (
NOT citation.value ? ''canonicalUrl'' OR citation.value->''canonicalUrl'' = ''null''::JSONB
OR source."canonical_url" = citation.value->>''canonicalUrl'' ) JOIN "feed_items" AS feed';
  v_provider_replacement CONSTANT TEXT :=
    'AND (
NOT citation.value ? ''canonicalUrl'' OR citation.value->''canonicalUrl'' = ''null''::JSONB
OR public.reader_summary_safe_citation_url(source."canonical_url") = citation.value->>''canonicalUrl'' ) JOIN "feed_items" AS feed';
  v_source_feed_needle CONSTANT TEXT :=
    'AND feed."canonical_url" = source."canonical_url"';
  v_provider_url_needle CONSTANT TEXT :=
    '''canonicalUrl'', feed."canonical_url"';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.record_reader_summary_weekly_publication_evidence_base(uuid)'::REGPROCEDURE
  ) INTO STRICT v_definition;

  IF pg_catalog.length(v_definition) - pg_catalog.length(
      pg_catalog.replace(v_definition, v_source_lock_needle, '')
    ) <> pg_catalog.length(v_source_lock_needle)
    OR pg_catalog.length(v_definition) - pg_catalog.length(
      pg_catalog.replace(v_definition, v_feed_lock_needle, '')
    ) <> pg_catalog.length(v_feed_lock_needle)
    OR pg_catalog.length(v_definition) - pg_catalog.length(
      pg_catalog.replace(v_definition, v_provider_needle, '')
    ) <> pg_catalog.length(v_provider_needle)
    OR pg_catalog.length(v_definition) - pg_catalog.length(
      pg_catalog.replace(v_definition, v_source_feed_needle, '')
    ) <> 2 * pg_catalog.length(v_source_feed_needle)
    OR pg_catalog.length(v_definition) - pg_catalog.length(
      pg_catalog.replace(v_definition, v_provider_url_needle, '')
    ) <> pg_catalog.length(v_provider_url_needle) THEN
    RAISE EXCEPTION 'reader summary citation URL authority rewrite target diverged';
  END IF;

  v_definition := pg_catalog.replace(
    v_definition, v_source_lock_needle, v_source_lock_replacement
  );
  v_definition := pg_catalog.replace(
    v_definition, v_feed_lock_needle, v_feed_lock_replacement
  );
  v_definition := pg_catalog.replace(
    v_definition, v_provider_needle, v_provider_replacement
  );

  IF pg_catalog.strpos(v_definition, v_source_lock_needle) <> 0
    OR pg_catalog.strpos(v_definition, v_feed_lock_needle) <> 0
    OR pg_catalog.strpos(v_definition, v_provider_needle) <> 0
    OR pg_catalog.length(v_definition) - pg_catalog.length(
      pg_catalog.replace(v_definition, v_source_feed_needle, '')
    ) <> 2 * pg_catalog.length(v_source_feed_needle)
    OR pg_catalog.length(v_definition) - pg_catalog.length(
      pg_catalog.replace(v_definition, v_provider_url_needle, '')
    ) <> pg_catalog.length(v_provider_url_needle)
    OR pg_catalog.length(v_definition) - pg_catalog.length(
      pg_catalog.replace(
        v_definition,
        'public.reader_summary_safe_citation_url(',
        ''
      )
    ) <> 3 * pg_catalog.length(
      'public.reader_summary_safe_citation_url('
    ) THEN
    RAISE EXCEPTION 'reader summary citation URL authority rewrite is not exact';
  END IF;

  EXECUTE v_definition;
END;
$rewrite_reader_summary_safe_citation_url_authority$;

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;
COMMIT;
