-- @social-monitor-forward-migration
-- Replace only the production recovery v2 expected-counts authority with the
-- reviewed Jul23-Jul28 DB facts.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT USAGE, CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

CREATE OR REPLACE FUNCTION
"reader_summary_production_recovery_expected_counts_v2"(
  target_date DATE
) RETURNS JSONB
LANGUAGE SQL
IMMUTABLE
STRICT
PARALLEL SAFE
SET search_path = pg_catalog, public, pg_temp
RETURN CASE target_date
  WHEN DATE '2026-07-23' THEN jsonb_build_array(
    jsonb_build_object(
      'providerKey', 'github-trending-page',
      'count', 0,
      'evidenceState', 'historical_unavailable'
    ),
    jsonb_build_object(
      'providerKey', 'hacker-news',
      'count', 100,
      'evidenceState', 'verified_existing'
    ),
    jsonb_build_object(
      'providerKey', 'reddit',
      'count', 100,
      'evidenceState', 'verified_existing'
    ),
    jsonb_build_object(
      'providerKey', 'rss',
      'count', 78,
      'evidenceState', 'verified_existing'
    ),
    jsonb_build_object(
      'providerKey', 'x-twitter',
      'count', 67,
      'evidenceState', 'verified_existing'
    )
  )
  WHEN DATE '2026-07-24' THEN jsonb_build_array(
    jsonb_build_object(
      'providerKey', 'github-trending-page',
      'count', 10,
      'evidenceState', 'verified_existing'
    ),
    jsonb_build_object(
      'providerKey', 'hacker-news',
      'count', 100,
      'evidenceState', 'verified_existing'
    ),
    jsonb_build_object(
      'providerKey', 'reddit',
      'count', 100,
      'evidenceState', 'verified_existing'
    ),
    jsonb_build_object(
      'providerKey', 'rss',
      'count', 68,
      'evidenceState', 'verified_existing'
    ),
    jsonb_build_object(
      'providerKey', 'x-twitter',
      'count', 73,
      'evidenceState', 'verified_existing'
    )
  )
  WHEN DATE '2026-07-25' THEN jsonb_build_array(
    jsonb_build_object(
      'providerKey', 'github-trending-page',
      'count', 10,
      'evidenceState', 'verified_existing'
    ),
    jsonb_build_object(
      'providerKey', 'hacker-news',
      'count', 100,
      'evidenceState', 'verified_existing'
    ),
    jsonb_build_object(
      'providerKey', 'reddit',
      'count', 100,
      'evidenceState', 'verified_existing'
    ),
    jsonb_build_object(
      'providerKey', 'rss',
      'count', 63,
      'evidenceState', 'verified_existing'
    ),
    jsonb_build_object(
      'providerKey', 'x-twitter',
      'count', 96,
      'evidenceState', 'verified_existing'
    )
  )
  WHEN DATE '2026-07-26' THEN jsonb_build_array(
    jsonb_build_object(
      'providerKey', 'github-trending-page',
      'count', 10,
      'evidenceState', 'verified_existing'
    ),
    jsonb_build_object(
      'providerKey', 'hacker-news',
      'count', 78,
      'evidenceState', 'verified_existing'
    ),
    jsonb_build_object(
      'providerKey', 'reddit',
      'count', 100,
      'evidenceState', 'verified_existing'
    ),
    jsonb_build_object(
      'providerKey', 'rss',
      'count', 62,
      'evidenceState', 'verified_existing'
    ),
    jsonb_build_object(
      'providerKey', 'x-twitter',
      'count', 94,
      'evidenceState', 'verified_existing'
    )
  )
  WHEN DATE '2026-07-27' THEN jsonb_build_array(
    jsonb_build_object(
      'providerKey', 'github-trending-page',
      'count', 10,
      'evidenceState', 'verified_existing'
    ),
    jsonb_build_object(
      'providerKey', 'hacker-news',
      'count', 87,
      'evidenceState', 'verified_existing'
    ),
    jsonb_build_object(
      'providerKey', 'reddit',
      'count', 99,
      'evidenceState', 'verified_existing'
    ),
    jsonb_build_object(
      'providerKey', 'rss',
      'count', 47,
      'evidenceState', 'verified_existing'
    ),
    jsonb_build_object(
      'providerKey', 'x-twitter',
      'count', 58,
      'evidenceState', 'verified_existing'
    )
  )
  WHEN DATE '2026-07-28' THEN jsonb_build_array(
    jsonb_build_object(
      'providerKey', 'github-trending-page',
      'count', 0,
      'evidenceState', 'historical_unavailable'
    ),
    jsonb_build_object(
      'providerKey', 'hacker-news',
      'count', 0,
      'evidenceState', 'historical_unavailable'
    ),
    jsonb_build_object(
      'providerKey', 'reddit',
      'count', 0,
      'evidenceState', 'historical_unavailable'
    ),
    jsonb_build_object(
      'providerKey', 'rss',
      'count', 31,
      'evidenceState', 'partial_existing'
    ),
    jsonb_build_object(
      'providerKey', 'x-twitter',
      'count', 27,
      'evidenceState', 'partial_existing'
    )
  )
  ELSE NULL
END;

REVOKE ALL PRIVILEGES ON FUNCTION
  "reader_summary_production_recovery_expected_counts_v2"(DATE)
FROM PUBLIC, "social_monitor_reader_summary_publication_runtime";

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";

REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;

COMMIT;
