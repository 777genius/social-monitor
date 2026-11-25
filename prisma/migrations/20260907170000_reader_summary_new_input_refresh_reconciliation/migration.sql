-- @social-monitor-forward-migration
-- A FAILED new-input-refresh job that already consumed a paid provider
-- invocation but published no summary has no representation today: the guard
-- can only read "unconsumed" or "already published", so the date is wedged.
--
-- This adds append-only accounting for exactly that state. It records that the
-- original job is ACCOUNTED FOR, never that it succeeded: the original job row
-- is not written to, its digest is captured as an immutability witness, and the
-- foreign key refuses to let it be deleted. Provider counters were not reported
-- for the consumed invocation and their provenance stays UNKNOWN; independently
-- verified counters can only ever arrive later as immutable supplemental rows
-- that reference the original request/attempt, never as a rewrite of history.
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;

SET LOCAL ROLE "social_monitor_public_schema_owner";

CREATE TABLE "reader_summary_new_input_refresh_reconciliations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "period_started_at" TIMESTAMPTZ(6) NOT NULL,
  "period_ended_at" TIMESTAMPTZ(6) NOT NULL,
  "reader_summary_job_id" UUID NOT NULL,
  "operation" TEXT NOT NULL,
  "job_status" TEXT NOT NULL,
  "job_sha256" CHAR(64) NOT NULL,
  "manifest_sha256" CHAR(64) NOT NULL,
  "evidence_sha256" CHAR(64) NOT NULL,
  "reason" TEXT NOT NULL,
  "invocation" JSONB NOT NULL,
  "accounting" JSONB NOT NULL,
  "reconciled_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "rs_nir_reconciliations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rs_nir_reconciliations_job_key"
    UNIQUE ("tenant_id", "workspace_id", "reader_summary_job_id"),
  CONSTRAINT "rs_nir_reconciliations_operation_key"
    UNIQUE ("tenant_id", "operation"),
  -- RESTRICT, not CASCADE: the consumed original job can never be deleted while
  -- it is accounted for, so its failure history cannot be dropped to buy a
  -- cheaper retry.
  CONSTRAINT "rs_nir_reconciliations_job_fkey"
    FOREIGN KEY ("reader_summary_job_id")
    REFERENCES "reader_summary_jobs"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "rs_nir_reconciliations_identity_check" CHECK (
    "job_status" = 'FAILED'
    AND "reason" = 'consumed_provider_invocation_without_summary'
    AND "operation" LIKE 'new-input-refresh:v1:%'
    AND "period_ended_at" = "period_started_at" + INTERVAL '1 day'
    AND "job_sha256" ~ '^[0-9a-f]{64}$'
    AND "manifest_sha256" ~ '^[0-9a-f]{64}$'
    AND "evidence_sha256" ~ '^[0-9a-f]{64}$'
  ),
  -- The reconciled attempt produced no summary, no artifact and no
  -- publication. Provider usage is recorded as unknown, never as zero.
  CONSTRAINT "rs_nir_reconciliations_accounting_check" CHECK (
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
    AND "invocation"->'providerUsageReported' = 'false'::JSONB
    AND "accounting" ?& ARRAY[
      'summaryGenerations', 'publications', 'artifacts',
      'providerInvocations', 'providerUsage'
    ]
    AND "accounting"->'summaryGenerations' = '0'::JSONB
    AND "accounting"->'publications' = '0'::JSONB
    AND "accounting"->'artifacts' = '0'::JSONB
    AND "accounting"->'providerInvocations' = '1'::JSONB
    AND "accounting"->>'providerUsage' = 'unknown'
  )
);

-- Supplemental only. A counters row explains what an already-consumed provider
-- request cost; it never changes the reconciliation's own accounting and never
-- grants generation budget.
CREATE TABLE "reader_summary_new_input_refresh_reconciliation_counters" (
  "id" UUID NOT NULL,
  "reconciliation_id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "request_id" TEXT NOT NULL,
  "attempt_sha256" CHAR(64) NOT NULL,
  "counters" JSONB NOT NULL,
  "counters_sha256" CHAR(64) NOT NULL,
  "evidence_sha256" CHAR(64) NOT NULL,
  "provenance" TEXT NOT NULL,
  "recorded_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "rs_nir_reconciliation_counters_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "rs_nir_reconciliation_counters_request_key"
    UNIQUE ("tenant_id", "reconciliation_id", "request_id"),
  CONSTRAINT "rs_nir_reconciliation_counters_evidence_key"
    UNIQUE ("tenant_id", "reconciliation_id", "evidence_sha256"),
  CONSTRAINT "rs_nir_reconciliation_counters_parent_fkey"
    FOREIGN KEY ("reconciliation_id")
    REFERENCES "reader_summary_new_input_refresh_reconciliations"("id")
    ON DELETE RESTRICT ON UPDATE RESTRICT,
  CONSTRAINT "rs_nir_reconciliation_counters_identity_check" CHECK (
    "attempt_sha256" ~ '^[0-9a-f]{64}$'
    AND "counters_sha256" ~ '^[0-9a-f]{64}$'
    AND "evidence_sha256" ~ '^[0-9a-f]{64}$'
    AND btrim("request_id") <> ''
    AND "provenance" = 'independently_verified_provider_statement'
  ),
  CONSTRAINT "rs_nir_reconciliation_counters_shape_check" CHECK (
    jsonb_typeof("counters") = 'object'
    AND "counters" ?& ARRAY['inputTokens', 'outputTokens', 'totalTokens']
    AND jsonb_typeof("counters"->'inputTokens') = 'number'
    AND jsonb_typeof("counters"->'outputTokens') = 'number'
    AND jsonb_typeof("counters"->'totalTokens') = 'number'
    AND ("counters"->>'inputTokens')::NUMERIC >= 0
    AND ("counters"->>'outputTokens')::NUMERIC >= 0
    AND ("counters"->>'totalTokens')::NUMERIC =
      ("counters"->>'inputTokens')::NUMERIC +
      ("counters"->>'outputTokens')::NUMERIC
  )
);

CREATE INDEX "rs_nir_reconciliations_period_idx"
  ON "reader_summary_new_input_refresh_reconciliations"(
    "tenant_id", "workspace_id", "period_started_at"
  );
CREATE INDEX "rs_nir_reconciliation_counters_parent_idx"
  ON "reader_summary_new_input_refresh_reconciliation_counters"(
    "tenant_id", "workspace_id", "reconciliation_id"
  );

ALTER TABLE "reader_summary_new_input_refresh_reconciliations"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reader_summary_new_input_refresh_reconciliations"
  FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation"
  ON "reader_summary_new_input_refresh_reconciliations"
  USING (
    public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
  )
  WITH CHECK (
    public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
  );

ALTER TABLE "reader_summary_new_input_refresh_reconciliation_counters"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reader_summary_new_input_refresh_reconciliation_counters"
  FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation"
  ON "reader_summary_new_input_refresh_reconciliation_counters"
  USING (
    public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
  )
  WITH CHECK (
    public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
  );

-- Append-only at the database level. Accounting that can be edited afterwards
-- is not accounting.
CREATE FUNCTION public."reject_rs_nir_reconciliation_mutation"()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog AS $function$
BEGIN
  RAISE EXCEPTION
    'reader summary new-input refresh reconciliation records are append-only';
END;
$function$;

CREATE TRIGGER "rs_nir_reconciliations_append_only"
BEFORE UPDATE OR DELETE
ON "reader_summary_new_input_refresh_reconciliations"
FOR EACH ROW EXECUTE FUNCTION public."reject_rs_nir_reconciliation_mutation"();

CREATE TRIGGER "rs_nir_reconciliation_counters_append_only"
BEFORE UPDATE OR DELETE
ON "reader_summary_new_input_refresh_reconciliation_counters"
FOR EACH ROW EXECUTE FUNCTION public."reject_rs_nir_reconciliation_mutation"();

REVOKE ALL PRIVILEGES ON TABLE
  "reader_summary_new_input_refresh_reconciliations",
  "reader_summary_new_input_refresh_reconciliation_counters"
FROM PUBLIC;
REVOKE ALL ON FUNCTION public."reject_rs_nir_reconciliation_mutation"()
FROM PUBLIC;
GRANT SELECT, INSERT ON TABLE
  "reader_summary_new_input_refresh_reconciliations",
  "reader_summary_new_input_refresh_reconciliation_counters"
TO "social_monitor_reader_summary_publication_runtime";

RESET ROLE;
COMMIT;
