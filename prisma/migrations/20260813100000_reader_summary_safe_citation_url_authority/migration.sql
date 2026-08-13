-- @social-monitor-forward-migration
-- Treat citation URLs as display data. Immutable source/feed identities remain
-- authoritative, and provider evidence continues to use the database URL.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

DO $rewrite_reader_summary_safe_citation_url_authority$
DECLARE
  v_definition TEXT;
  v_source_lock_needle CONSTANT TEXT :=
    'AND (
NOT citation.value ? ''canonicalUrl''
OR citation.value->''canonicalUrl'' = ''null''::JSONB
OR source."canonical_url" = citation.value->>''canonicalUrl'' ) ORDER BY source."id"';
  v_source_lock_replacement CONSTANT TEXT :=
    'ORDER BY source."id"';
  v_feed_lock_needle CONSTANT TEXT :=
    'AND (
NOT citation.value ? ''canonicalUrl''
OR citation.value->''canonicalUrl'' = ''null''::JSONB
OR feed."canonical_url" = citation.value->>''canonicalUrl'' ) ORDER BY feed."id"';
  v_feed_lock_replacement CONSTANT TEXT :=
    'ORDER BY feed."id"';
  v_provider_needle CONSTANT TEXT :=
    'AND (
NOT citation.value ? ''canonicalUrl'' OR citation.value->''canonicalUrl'' = ''null''::JSONB
OR source."canonical_url" = citation.value->>''canonicalUrl'' ) JOIN "feed_items" AS feed';
  v_provider_replacement CONSTANT TEXT :=
    'JOIN "feed_items" AS feed';
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

  IF pg_catalog.position(v_source_lock_needle IN v_definition) <> 0
    OR pg_catalog.position(v_feed_lock_needle IN v_definition) <> 0
    OR pg_catalog.position(v_provider_needle IN v_definition) <> 0
    OR pg_catalog.length(v_definition) - pg_catalog.length(
      pg_catalog.replace(v_definition, v_source_feed_needle, '')
    ) <> 2 * pg_catalog.length(v_source_feed_needle)
    OR pg_catalog.length(v_definition) - pg_catalog.length(
      pg_catalog.replace(v_definition, v_provider_url_needle, '')
    ) <> pg_catalog.length(v_provider_url_needle) THEN
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
