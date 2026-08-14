-- @social-monitor-forward-migration

DO $migration$
DECLARE
  v_definition TEXT;
  v_needle CONSTANT TEXT :=
    '''citationId'', provider.value->>''citationId'',';
  v_replacement CONSTANT TEXT := $replacement$
'citationId', 'citation:' || encode(sha256(convert_to(
  "reader_summary_weekly_canonical_json"(jsonb_build_object(
    'requestedUtcDate', evidence."requested_utc_date"::TEXT,
    'publicationId', evidence."publication_id"::TEXT,
    'publicationEvidenceSha256', btrim(evidence."canonical_sha256"),
    'providerKey', provider.value->>'providerKey',
    'citationId', provider.value->>'citationId',
    'sourceItemId', provider.value->>'sourceItemId',
    'sourceContentHash', provider.value->>'sourceContentHash'
  )), 'UTF8'
)), 'hex'),
$replacement$;
  v_occurrences INTEGER;
  v_selector_occurrences INTEGER;
BEGIN
  SELECT pg_get_functiondef(
    'persist_reader_summary_weekly_artifact(jsonb)'::REGPROCEDURE
  ) INTO STRICT v_definition;

  v_occurrences := (
    char_length(v_definition) -
    char_length(replace(v_definition, v_needle, ''))
  ) / char_length(v_needle);
  v_selector_occurrences := (
    char_length(v_definition) -
    char_length(replace(
      v_definition,
      '''citationId'', ''citation:'' || encode(sha256(convert_to(',
      ''
    ))
  ) / char_length(
    '''citationId'', ''citation:'' || encode(sha256(convert_to('
  );
  IF v_occurrences = 1 AND v_selector_occurrences = 0 THEN
    EXECUTE replace(v_definition, v_needle, v_replacement);
  ELSIF v_occurrences = 0 AND v_selector_occurrences = 1 THEN
    NULL;
  ELSE
    RAISE EXCEPTION
      'weekly selector citation proof migration found legacy=% selector=%',
      v_occurrences,
      v_selector_occurrences;
  END IF;
END;
$migration$;

COMMENT ON FUNCTION "persist_reader_summary_weekly_artifact"(JSONB) IS
  'Atomically persists or exactly replays a certified weekly summary using review-selector citation proofs.';
