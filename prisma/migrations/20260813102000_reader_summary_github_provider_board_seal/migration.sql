-- @social-monitor-forward-migration
-- Preserve exact per-repository provider hashes while publishing one board seal.
BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";
GRANT CREATE ON SCHEMA public
TO "social_monitor_reader_summary_publication_owner";
RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

DO $rewrite_reader_summary_github_provider_board_seal$
DECLARE
  v_definition TEXT;
  v_original TEXT;
  v_distinct_hash_needle CONSTANT TEXT :=
    'OR v_github_audit->''eligibleBindingIds''->>0 <> ( SELECT min(binding->>''sourceBindingId'')
FROM jsonb_array_elements(v_github_audit->''bindings'') AS binding ) OR (
SELECT count(DISTINCT binding->>''sourceProviderContentHash'')
FROM jsonb_array_elements(v_github_audit->''bindings'') AS binding ) <> 1 THEN';
  v_distinct_hash_replacement CONSTANT TEXT :=
    'OR v_github_audit->''eligibleBindingIds''->>0 <> ( SELECT min(binding->>''sourceBindingId'')
FROM jsonb_array_elements(v_github_audit->''bindings'') AS binding ) THEN';
  v_evidence_needle CONSTANT TEXT :=
    'SELECT jsonb_build_object( ''schemaVersion'', ''reader_summary.weekly_publication_github_evidence.v1'',
''mode'', ''verified'', ''requestedUtcDay'', to_char(v_day, ''YYYY-MM-DD''),
''providerKey'', ''github-trending-page'', ''scanJobId'', min(binding->>''scanJobId''),
''sourceBindingId'', min(binding->>''sourceBindingId''), ''evidenceCount'', 10,
''historicalUnavailableReason'', NULL, ''authorizedAt'', NULL,
''sourceProviderContentHash'', min(binding->>''sourceProviderContentHash''),
''repositories'', jsonb_agg(jsonb_build_object( ''rank'', (binding->>''rank'')::INTEGER,
''citationId'', binding->>''citationId'', ''feedItemId'', binding->>''feedItemId'',
''sourceItemId'', binding->>''sourceItemId'', ''repositoryIdentity'', binding->>''repositoryIdentity'',
''canonicalUrl'', binding->>''canonicalUrl'', ''sourceContentHash'', binding->>''sourceContentHash'',
''sourceProviderContentHash'', binding->>''sourceProviderContentHash''
) ORDER BY (binding->>''rank'')::INTEGER) ) INTO v_github_body
FROM jsonb_array_elements(v_github_audit->''bindings'') AS binding;';
  v_evidence_replacement CONSTANT TEXT :=
    'WITH binding_rows AS (
  SELECT binding.value
  FROM jsonb_array_elements(v_github_audit->''bindings'') AS binding(value)
), board AS (
  SELECT encode(sha256(convert_to(
    "reader_summary_weekly_canonical_json"(jsonb_build_object(
      ''schemaVersion'', ''reader_summary.github_provider_board.v1'',
      ''requestedUtcDay'', to_char(v_day, ''YYYY-MM-DD''),
      ''scanJobId'', min(value->>''scanJobId''),
      ''sourceBindingId'', min(value->>''sourceBindingId''),
      ''sourceProviderContentHashes'', jsonb_agg(
        value->>''sourceProviderContentHash'' ORDER BY (value->>''rank'')::INTEGER
      )
    )), ''UTF8''
  )), ''hex'') AS sha256
  FROM binding_rows
)
SELECT jsonb_build_object(
  ''schemaVersion'', ''reader_summary.weekly_publication_github_evidence.v1'',
  ''mode'', ''verified'', ''requestedUtcDay'', to_char(v_day, ''YYYY-MM-DD''),
  ''providerKey'', ''github-trending-page'', ''scanJobId'', min(binding.value->>''scanJobId''),
  ''sourceBindingId'', min(binding.value->>''sourceBindingId''), ''evidenceCount'', 10,
  ''historicalUnavailableReason'', NULL, ''authorizedAt'', NULL,
  ''sourceProviderContentHash'', board.sha256,
  ''repositories'', jsonb_agg(jsonb_build_object(
    ''rank'', (binding.value->>''rank'')::INTEGER,
    ''citationId'', binding.value->>''citationId'',
    ''feedItemId'', binding.value->>''feedItemId'',
    ''sourceItemId'', binding.value->>''sourceItemId'',
    ''repositoryIdentity'', binding.value->>''repositoryIdentity'',
    ''canonicalUrl'', binding.value->>''canonicalUrl'',
    ''sourceContentHash'', binding.value->>''sourceContentHash'',
    ''sourceProviderContentHash'', board.sha256
  ) ORDER BY (binding.value->>''rank'')::INTEGER)
) INTO v_github_body
FROM binding_rows AS binding CROSS JOIN board
GROUP BY board.sha256;';
BEGIN
  SELECT pg_catalog.pg_get_functiondef(
    'public.record_reader_summary_weekly_publication_evidence_base(uuid)'::REGPROCEDURE
  ) INTO STRICT v_definition;
  v_original := v_definition;

  IF pg_catalog.length(v_definition) - pg_catalog.length(
      pg_catalog.replace(v_definition, v_distinct_hash_needle, '')
    ) <> pg_catalog.length(v_distinct_hash_needle)
    OR pg_catalog.length(v_definition) - pg_catalog.length(
      pg_catalog.replace(v_definition, v_evidence_needle, '')
    ) <> pg_catalog.length(v_evidence_needle) THEN
    RAISE EXCEPTION 'reader summary GitHub provider board seal target diverged';
  END IF;

  v_definition := pg_catalog.replace(
    v_definition, v_distinct_hash_needle, v_distinct_hash_replacement
  );
  v_definition := pg_catalog.replace(
    v_definition, v_evidence_needle, v_evidence_replacement
  );

  IF v_definition = v_original
    OR pg_catalog.strpos(v_definition, v_distinct_hash_needle) <> 0
    OR pg_catalog.strpos(v_definition, v_evidence_needle) <> 0
    OR pg_catalog.strpos(
      v_definition,
      'count(DISTINCT binding->>''sourceProviderContentHash'')'
    ) <> 0
    OR pg_catalog.length(v_definition) - pg_catalog.length(
      pg_catalog.replace(v_definition, v_distinct_hash_replacement, '')
    ) <> pg_catalog.length(v_distinct_hash_replacement)
    OR pg_catalog.length(v_definition) - pg_catalog.length(
      pg_catalog.replace(v_definition, v_evidence_replacement, '')
    ) <> pg_catalog.length(v_evidence_replacement) THEN
    RAISE EXCEPTION 'reader summary GitHub provider board seal rewrite is not exact';
  END IF;

  EXECUTE v_definition;
END;
$rewrite_reader_summary_github_provider_board_seal$;

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public
FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;
COMMIT;
