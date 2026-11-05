-- @social-monitor-forward-migration
-- Zero-provider reconciliation is distinct from paid consumption. Preserve the
-- provider predicate and all table ownership, RLS, foreign keys and append-only guards.
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
ALTER TABLE "reader_summary_new_input_refresh_reconciliations"
  DROP CONSTRAINT "rs_nir_reconciliations_identity_check",
  DROP CONSTRAINT "rs_nir_reconciliations_accounting_check";
ALTER TABLE "reader_summary_new_input_refresh_reconciliations"
  ADD CONSTRAINT "rs_nir_reconciliations_identity_check" CHECK (
    "job_status" = 'FAILED'
    AND "reason" IN ('consumed_provider_invocation_without_summary', 'consumed_job_without_provider_invocation')
    AND "operation" LIKE 'new-input-refresh:v1:%'
    AND "period_ended_at" = "period_started_at" + INTERVAL '1 day'
    AND "job_sha256" ~ '^[0-9a-f]{64}$'
    AND "manifest_sha256" ~ '^[0-9a-f]{64}$'
    AND "evidence_sha256" ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT "rs_nir_reconciliations_accounting_check" CHECK (
    CASE WHEN "reason" = 'consumed_provider_invocation_without_summary' THEN (

    jsonb_typeof("invocation") = 'object'
    AND jsonb_typeof("accounting") = 'object'
    AND "invocation" ?& ARRAY[
      'requestId', 'purpose', 'requestSha256', 'attemptSha256',
      'consumedAt', 'returnedAt', 'outcome', 'providerUsageReported'
    ]
    AND jsonb_typeof("invocation"->'requestId') = 'string'
    AND jsonb_typeof("invocation"->'purpose') = 'string'
    AND "invocation"->>'requestSha256' ~ '^[0-9a-f]{64}$'
    AND "invocation"->>'attemptSha256' ~ '^[0-9a-f]{64}$'
    AND "accounting" ?& ARRAY[
      'summaryGenerations', 'publications', 'artifacts',
      'providerInvocations', 'providerUsage'
    ]
    AND "accounting"->'summaryGenerations' = '0'::JSONB
    AND "accounting"->'publications' = '0'::JSONB
    AND "accounting"->'artifacts' = '0'::JSONB
    AND "accounting"->'providerInvocations' = '1'::JSONB
    AND (
      (
        "invocation"->'providerUsageReported' = 'false'::JSONB
        AND NOT ("invocation" ? 'usage')
        AND "accounting"->>'providerUsage' = 'unknown'
        AND NOT ("accounting" ? 'usage')
      )
      OR
      (
        "invocation"->'providerUsageReported' = 'true'::JSONB
        AND jsonb_typeof("invocation"->'usage') = 'object'
        AND "invocation"->'usage' ?& ARRAY['inputTokens', 'outputTokens', 'totalTokens']
        AND ("invocation"->'usage'->>'inputTokens') ~ '^(0|[1-9][0-9]*)$'
        AND ("invocation"->'usage'->>'outputTokens') ~ '^(0|[1-9][0-9]*)$'
        AND ("invocation"->'usage'->>'totalTokens') ~ '^(0|[1-9][0-9]*)$'
        AND ("invocation"->'usage'->>'inputTokens')::NUMERIC <= 9007199254740991
        AND ("invocation"->'usage'->>'outputTokens')::NUMERIC <= 9007199254740991
        AND ("invocation"->'usage'->>'totalTokens')::NUMERIC <= 9007199254740991
        AND ("invocation"->'usage'->>'totalTokens')::NUMERIC =
          ("invocation"->'usage'->>'inputTokens')::NUMERIC +
          ("invocation"->'usage'->>'outputTokens')::NUMERIC
        AND "accounting"->>'providerUsage' = 'reported'
        AND "accounting"->'usage' = "invocation"->'usage'
      )
    )

    ) ELSE COALESCE((
      "reason" = 'consumed_job_without_provider_invocation'
      AND jsonb_typeof("invocation") = 'object'
      AND "invocation" ?& ARRAY['capturePath', 'journalPath', 'manifestPath',
        'captureSha256', 'journalSha256', 'invocationConsumedCount',
        'delegatedInvocationCount', 'providerUsageReported', 'attempts']
      AND "invocation" - ARRAY['capturePath', 'journalPath', 'manifestPath',
        'captureSha256', 'journalSha256', 'invocationConsumedCount',
        'delegatedInvocationCount', 'providerUsageReported', 'attempts'] = '{}'::jsonb
      AND jsonb_typeof("invocation"->'capturePath') = 'string'
      AND jsonb_typeof("invocation"->'journalPath') = 'string'
      AND jsonb_typeof("invocation"->'manifestPath') = 'string'
      AND "invocation"->>'capturePath' LIKE '/%'
      AND "invocation"->>'journalPath' LIKE '/%'
      AND "invocation"->>'manifestPath' LIKE '/%'
      AND "invocation"->>'captureSha256' ~ '^[0-9a-f]{64}$'
      AND "invocation"->>'journalSha256' ~ '^[0-9a-f]{64}$'
      AND "invocation"->'invocationConsumedCount' = '0'::jsonb
      AND "invocation"->'delegatedInvocationCount' = '0'::jsonb
      AND "invocation"->'providerUsageReported' = 'false'::jsonb
      AND CASE WHEN jsonb_typeof("invocation"->'attempts') = 'array'
        THEN jsonb_array_length("invocation"->'attempts') > 0 ELSE false END
      AND "accounting" = '{"summaryGenerations":0,"publications":0,"artifacts":0,
        "providerInvocations":0,"providerUsage":"none"}'::jsonb
    ), false) END
  );
COMMIT;
