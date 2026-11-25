-- @social-monitor-forward-migration
-- Keep reconciliation accounting aligned with the application contract: a
-- consumed provider response may carry immutable, provider-reported counters.
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

SET LOCAL ROLE "social_monitor_public_schema_owner";

ALTER TABLE "reader_summary_new_input_refresh_reconciliations"
  DROP CONSTRAINT "rs_nir_reconciliations_accounting_check";

ALTER TABLE "reader_summary_new_input_refresh_reconciliations"
  ADD CONSTRAINT "rs_nir_reconciliations_accounting_check" CHECK (
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
  );

COMMIT;
