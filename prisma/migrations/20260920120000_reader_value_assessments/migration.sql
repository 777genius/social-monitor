-- @social-monitor-forward-migration
-- Relevance-owned private cache. No publication schema or production activation.
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";

CREATE UNIQUE INDEX "interests_tenant_workspace_id_key" ON "interests"("tenant_id", "workspace_id", "id");
-- Minimal summary boundary required to erase private inputs without leaving an
-- active frozen manifest or permitting legacy FAILED-job reclaim to revive it.
ALTER TABLE "reader_summary_jobs" ADD COLUMN "terminal_failure_code" TEXT;

CREATE TABLE "reader_value_assessments" (
  "id" UUID NOT NULL PRIMARY KEY,
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "interest_id" UUID NOT NULL,
  "source_item_id" UUID NOT NULL,
  "source_revision_key" TEXT NOT NULL,
  "source_snapshot_sha256" CHAR(64) NOT NULL,
  "interest_sha256" CHAR(64) NOT NULL,
  "rubric_version" TEXT NOT NULL,
  "rubric_sha256" CHAR(64) NOT NULL,
  "input_builder_version" TEXT NOT NULL,
  "model_config_version" TEXT NOT NULL,
  "input_sha256" CHAR(64) NOT NULL,
  "request_sha256" CHAR(64) NOT NULL,
  "input_snapshot" JSONB NOT NULL,
  "request_body" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "attempt_history" JSONB NOT NULL DEFAULT '[]',
  "next_attempt_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lease_until" TIMESTAMPTZ(6),
  "lease_token" UUID,
  "error_code" TEXT,
  "usefulness" TEXT,
  "relevance" TEXT,
  "context_sufficiency" TEXT,
  "evidence_basis" TEXT,
  "result" JSONB,
  "requested_model" TEXT NOT NULL,
  "resolved_model" TEXT,
  "provider" TEXT,
  "request_id" TEXT,
  "assessed_at" TIMESTAMPTZ(6),
  "latency_ms" INTEGER,
  "input_tokens" INTEGER,
  "output_tokens" INTEGER,
  "cost_usd" DECIMAL(20,10),
  "usage_unknown" BOOLEAN NOT NULL DEFAULT false,
  "pinned_job_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "reader_value_assessments_source_fkey" FOREIGN KEY ("tenant_id", "workspace_id", "source_item_id")
    REFERENCES "source_items"("tenant_id", "workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reader_value_assessments_interest_fkey" FOREIGN KEY ("tenant_id", "workspace_id", "interest_id")
    REFERENCES "interests"("tenant_id", "workspace_id", "id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "reader_value_assessments_state_check" CHECK (
    "state" IN ('pending','running','assessed','retryable_failed','permanent_failed')
    AND "attempts" BETWEEN 0 AND 3 AND jsonb_typeof("attempt_history") = 'array'
    AND jsonb_array_length("attempt_history") = "attempts"
    AND ("state" <> 'running' OR ("lease_token" IS NOT NULL AND "lease_until" IS NOT NULL))
  ),
  CONSTRAINT "reader_value_assessments_bounds_check" CHECK (
    octet_length("request_body") <= 56000 AND octet_length("input_snapshot"::text) <= 4194304
    AND octet_length("attempt_history"::text) <= 8192 AND octet_length("result"::text) <= 16384
    AND cardinality("pinned_job_ids") <= 256
    AND "expires_at" <= "created_at" + interval '180 days'
    AND ("cost_usd" IS NULL OR "cost_usd" >= 0)
    AND ("latency_ms" IS NULL OR "latency_ms" >= 0)
    AND ("input_tokens" IS NULL OR "input_tokens" >= 0)
    AND ("output_tokens" IS NULL OR "output_tokens" >= 0)
    AND "source_snapshot_sha256" ~ '^[0-9a-f]{64}$' AND "interest_sha256" ~ '^[0-9a-f]{64}$'
    AND "input_sha256" ~ '^[0-9a-f]{64}$' AND "request_sha256" ~ '^[0-9a-f]{64}$'
    AND "rubric_sha256" ~ '^[0-9a-f]{64}$'
  ),
  CONSTRAINT "reader_value_assessments_result_check" CHECK (
    ("state" = 'assessed' AND "assessed_at" IS NOT NULL AND "result" IS NOT NULL
      AND "resolved_model" IS NOT NULL AND "provider" IS NOT NULL
      AND "usefulness" IS NOT NULL AND "relevance" IS NOT NULL
      AND "context_sufficiency" IS NOT NULL AND "evidence_basis" IS NOT NULL
      AND "usefulness" IN ('noise','context','useful','important','insufficient_context')
      AND "relevance" IN ('unrelated','adjacent','relevant','central','insufficient_context')
      AND "context_sufficiency" IN ('insufficient','partial','sufficient')
      AND "evidence_basis" IN ('observation','described_data','linked_claim','unsupported_claim','no_claim','insufficient_context'))
    OR ("state" <> 'assessed' AND "assessed_at" IS NULL AND "result" IS NULL
      AND "usefulness" IS NULL AND "relevance" IS NULL AND "context_sufficiency" IS NULL AND "evidence_basis" IS NULL)
  )
);
CREATE UNIQUE INDEX "reader_value_assessments_exact_key" ON "reader_value_assessments"(
  "tenant_id", "workspace_id", "interest_id", "source_item_id", "source_snapshot_sha256", "interest_sha256", "input_sha256", "rubric_sha256", "model_config_version"
);
CREATE INDEX "reader_value_assessments_runnable_idx" ON "reader_value_assessments"("tenant_id", "workspace_id", "state", "next_attempt_at", "lease_until");
CREATE INDEX "reader_value_assessments_retention_idx" ON "reader_value_assessments"("tenant_id", "workspace_id", "expires_at", "id");
ALTER TABLE "reader_value_assessments" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reader_value_assessments" FORCE ROW LEVEL SECURITY;
CREATE POLICY "tenant_isolation" ON "reader_value_assessments"
  USING (public.social_monitor_rls_workspace_match("tenant_id", "workspace_id"))
  WITH CHECK (public.social_monitor_rls_workspace_match("tenant_id", "workspace_id"));

CREATE FUNCTION public.guard_reader_value_assessment_update() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
DECLARE immutable_columns text[] := ARRAY[
  'id','tenant_id','workspace_id','interest_id','source_item_id','source_revision_key',
  'source_snapshot_sha256','interest_sha256','rubric_version','rubric_sha256','input_builder_version',
  'model_config_version','input_sha256','request_sha256','input_snapshot','request_body','requested_model','created_at','expires_at'];
  accounting_columns text[] := ARRAY[
    'resolved_model','provider','request_id','latency_ms','input_tokens','output_tokens','cost_usd','usage_unknown'];
  column_name text;
  old_attempt jsonb;
  new_attempt jsonb;
  attempt_index integer;
  is_claim boolean := NEW.state = 'running' AND OLD.state IN ('pending','retryable_failed')
    AND NEW.attempts = OLD.attempts + 1;
  is_completion boolean := OLD.state = 'running'
    AND NEW.state IN ('assessed','retryable_failed','permanent_failed')
    AND NEW.attempts = OLD.attempts;
BEGIN
  FOREACH column_name IN ARRAY immutable_columns LOOP
    IF to_jsonb(NEW)->column_name IS DISTINCT FROM to_jsonb(OLD)->column_name THEN
      RAISE EXCEPTION 'reader value assessment input is immutable' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  IF OLD.state IN ('assessed','permanent_failed')
    AND (to_jsonb(NEW) - 'pinned_job_ids') IS DISTINCT FROM (to_jsonb(OLD) - 'pinned_job_ids') THEN
    RAISE EXCEPTION 'terminal reader value assessment is immutable' USING ERRCODE = '23514';
  END IF;
  IF NEW.attempts < OLD.attempts OR NEW.attempts > OLD.attempts + 1 THEN
    RAISE EXCEPTION 'reader value dispatch reservation cannot reset' USING ERRCODE = '23514';
  END IF;
  IF NEW.state = 'running' AND OLD.state <> 'running' THEN
    IF OLD.state NOT IN ('pending','retryable_failed') OR NEW.attempts <> OLD.attempts + 1
      OR OLD.next_attempt_at > clock_timestamp() OR NEW.lease_token IS NOT DISTINCT FROM OLD.lease_token THEN
      RAISE EXCEPTION 'invalid reader value claim' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.attempts <> OLD.attempts THEN
    RAISE EXCEPTION 'reader value attempt requires claim' USING ERRCODE = '23514';
  END IF;
  IF NEW.state IS DISTINCT FROM OLD.state AND NOT is_claim AND NOT is_completion THEN
    RAISE EXCEPTION 'invalid reader value state transition' USING ERRCODE = '23514';
  END IF;

  -- A claim may only append one well-formed reservation. Every byte of the
  -- already-finalized JSONB prefix is retained.
  IF is_claim THEN
    IF (NEW.attempt_history - (NEW.attempts - 1)) IS DISTINCT FROM OLD.attempt_history THEN
      RAISE EXCEPTION 'reader value attempt prefix is immutable' USING ERRCODE = '23514';
    END IF;
    new_attempt := NEW.attempt_history -> (NEW.attempts - 1);
    IF jsonb_typeof(new_attempt) <> 'object'
      OR NOT new_attempt ?& ARRAY['ordinal','reservedAt','sentAt','finishedAt','requestId','costUsd','usageUnknown']
      OR (new_attempt - ARRAY['ordinal','reservedAt','sentAt','finishedAt','requestId','costUsd','usageUnknown']) <> '{}'::jsonb
      OR new_attempt->>'ordinal' IS DISTINCT FROM NEW.attempts::text
      OR jsonb_typeof(new_attempt->'reservedAt') <> 'string'
      OR new_attempt->'sentAt' <> 'null'::jsonb OR new_attempt->'finishedAt' <> 'null'::jsonb
      OR new_attempt->'requestId' <> 'null'::jsonb OR new_attempt->'costUsd' <> 'null'::jsonb
      OR new_attempt->'usageUnknown' <> 'true'::jsonb THEN
      RAISE EXCEPTION 'invalid reader value attempt reservation' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW.attempt_history IS DISTINCT FROM OLD.attempt_history THEN
    IF NEW.attempts = 0 OR OLD.state <> 'running' THEN
      RAISE EXCEPTION 'finalized reader value attempt is immutable' USING ERRCODE = '23514';
    END IF;
    attempt_index := NEW.attempts - 1;
    IF attempt_index > 0 AND (NEW.attempt_history - attempt_index) IS DISTINCT FROM (OLD.attempt_history - attempt_index) THEN
      RAISE EXCEPTION 'reader value attempt prefix is immutable' USING ERRCODE = '23514';
    END IF;
    old_attempt := OLD.attempt_history -> attempt_index;
    new_attempt := NEW.attempt_history -> attempt_index;
    IF NEW.state = 'running' THEN
      IF (new_attempt - 'sentAt') IS DISTINCT FROM (old_attempt - 'sentAt')
        OR old_attempt->'sentAt' <> 'null'::jsonb OR jsonb_typeof(new_attempt->'sentAt') <> 'string'
        OR old_attempt->'finishedAt' <> 'null'::jsonb THEN
        RAISE EXCEPTION 'invalid reader value send transition' USING ERRCODE = '23514';
      END IF;
    ELSIF is_completion THEN
      IF NOT new_attempt ?& ARRAY['ordinal','reservedAt','sentAt','finishedAt','requestId','costUsd','usageUnknown','inputTokens','outputTokens','errorCode']
        OR (new_attempt - ARRAY['ordinal','reservedAt','sentAt','finishedAt','requestId','costUsd','usageUnknown','inputTokens','outputTokens','errorCode']) <> '{}'::jsonb
        OR new_attempt->'ordinal' IS DISTINCT FROM old_attempt->'ordinal'
        OR new_attempt->'reservedAt' IS DISTINCT FROM old_attempt->'reservedAt'
        OR new_attempt->'sentAt' IS DISTINCT FROM old_attempt->'sentAt'
        OR old_attempt->'finishedAt' <> 'null'::jsonb OR jsonb_typeof(new_attempt->'finishedAt') <> 'string'
        OR jsonb_typeof(new_attempt->'usageUnknown') <> 'boolean'
        OR jsonb_typeof(new_attempt->'requestId') NOT IN ('string','null')
        OR jsonb_typeof(new_attempt->'inputTokens') NOT IN ('number','null')
        OR jsonb_typeof(new_attempt->'outputTokens') NOT IN ('number','null')
        OR jsonb_typeof(new_attempt->'costUsd') NOT IN ('number','null')
        OR jsonb_typeof(new_attempt->'errorCode') NOT IN ('string','null')
        OR (old_attempt->'sentAt' = 'null'::jsonb
          AND NOT (NEW.state IN ('retryable_failed','permanent_failed')
            AND new_attempt->>'errorCode' = 'lease_expired' AND new_attempt->'usageUnknown' = 'true'::jsonb)) THEN
        RAISE EXCEPTION 'invalid reader value completion transition' USING ERRCODE = '23514';
      END IF;
    ELSE
      RAISE EXCEPTION 'finalized reader value attempt is immutable' USING ERRCODE = '23514';
    END IF;
  END IF;

  -- Aggregate accounting is writable only by the one terminal transition of
  -- the current reservation and must agree with its finalized diagnostic.
  FOREACH column_name IN ARRAY accounting_columns LOOP
    IF to_jsonb(NEW)->column_name IS DISTINCT FROM to_jsonb(OLD)->column_name AND NOT is_completion THEN
      RAISE EXCEPTION 'reader value accounting requires completion' USING ERRCODE = '23514';
    END IF;
  END LOOP;
  IF is_completion THEN
    new_attempt := NEW.attempt_history -> (NEW.attempts - 1);
    IF (jsonb_build_object('value',NEW.request_id)->'value') IS DISTINCT FROM new_attempt->'requestId'
      OR (jsonb_build_object('value',NEW.input_tokens)->'value') IS DISTINCT FROM new_attempt->'inputTokens'
      OR (jsonb_build_object('value',NEW.output_tokens)->'value') IS DISTINCT FROM new_attempt->'outputTokens'
      OR to_jsonb(NEW.usage_unknown) IS DISTINCT FROM (to_jsonb(OLD.usage_unknown OR (new_attempt->>'usageUnknown')::boolean))
      -- Application writes attempt cost at DECIMAL(20,10) precision. Keep this
      -- guard at that exact scale too: PostgreSQL otherwise rounds the column
      -- after the unrounded JSON diagnostic has already been compared.
      OR (new_attempt->'costUsd' <> 'null'::jsonb AND new_attempt->'costUsd' IS DISTINCT FROM
        (jsonb_build_object('value',round((new_attempt->>'costUsd')::numeric,10))->'value'))
      OR (jsonb_build_object('value',NEW.cost_usd)->'value') IS DISTINCT FROM
        (jsonb_build_object('value',CASE WHEN new_attempt->'costUsd' = 'null'::jsonb THEN OLD.cost_usd
          ELSE COALESCE(OLD.cost_usd,0) + round((new_attempt->>'costUsd')::numeric,10) END)->'value') THEN
      RAISE EXCEPTION 'reader value aggregate accounting does not match attempt' USING ERRCODE = '23514';
    END IF;
  END IF;
  IF NEW.state = 'assessed' AND OLD.state <> 'assessed' THEN
    IF OLD.state <> 'running' OR OLD.lease_until <= clock_timestamp() OR NEW.lease_token IS DISTINCT FROM OLD.lease_token THEN
      RAISE EXCEPTION 'reader value lease is stale' USING ERRCODE = '23514';
    END IF;
    -- Timestamp after the row lock, never transaction-start or provider time.
    NEW.assessed_at := clock_timestamp();
  END IF;
  IF OLD.usage_unknown AND NOT NEW.usage_unknown THEN
    RAISE EXCEPTION 'reader value unknown billing cannot be cleared' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER "reader_value_assessments_update_guard" BEFORE UPDATE ON "reader_value_assessments"
  FOR EACH ROW EXECUTE FUNCTION public.guard_reader_value_assessment_update();
REVOKE ALL ON TABLE "reader_value_assessments" FROM PUBLIC;
REVOKE ALL ON FUNCTION public.guard_reader_value_assessment_update() FROM PUBLIC;
GRANT SELECT, INSERT, UPDATE, DELETE ON "reader_value_assessments" TO "social_monitor_tenant_system_runtime";

CREATE FUNCTION public.guard_assessment_scope_erased_job() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
BEGIN
  IF OLD.terminal_failure_code = 'scope_changed' AND (
    NEW.status IS DISTINCT FROM OLD.status OR NEW.terminal_failure_code IS DISTINCT FROM OLD.terminal_failure_code
    OR NEW.failed_at IS DISTINCT FROM OLD.failed_at OR NEW.failure_reason IS DISTINCT FROM OLD.failure_reason
  ) THEN
    RAISE EXCEPTION 'assessment scope erasure is terminal' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;
CREATE TRIGGER "reader_summary_assessment_scope_erased_guard" BEFORE UPDATE ON "reader_summary_jobs"
  FOR EACH ROW EXECUTE FUNCTION public.guard_assessment_scope_erased_job();
REVOKE ALL ON FUNCTION public.guard_assessment_scope_erased_job() FROM PUBLIC;
GRANT SELECT, UPDATE(status,failed_at,failure_reason,terminal_failure_code) ON "reader_summary_jobs"
  TO "social_monitor_tenant_system_runtime";

-- Covers direct DELETE and every FK cascade, before private input removal.
-- FK actions may execute as the table owner without the caller's system-role
-- membership. Use the existing private job authority, never a caller-supplied
-- scope. The triggering assessment's composite FK scope bounds every update.
GRANT USAGE, CREATE ON SCHEMA public TO "social_monitor_reader_summary_publication_owner";
GRANT SELECT(id,tenant_id,workspace_id,status), UPDATE(status,failed_at,failure_reason,terminal_failure_code)
  ON "reader_summary_jobs" TO "social_monitor_reader_summary_publication_owner";
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";
CREATE FUNCTION public.fence_deleted_reader_value_assessment_jobs() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $function$
BEGIN
  UPDATE public.reader_summary_jobs j
    SET status='FAILED', failed_at=clock_timestamp(),
        failure_reason='assessment_scope_erased', terminal_failure_code='scope_changed'
    WHERE j.tenant_id=OLD.tenant_id AND j.workspace_id=OLD.workspace_id
      AND j.id=ANY(OLD.pinned_job_ids) AND j.status IN ('REQUESTED','RUNNING');
  RETURN OLD;
END;
$function$;
REVOKE ALL ON FUNCTION public.fence_deleted_reader_value_assessment_jobs() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fence_deleted_reader_value_assessment_jobs() TO "social_monitor_public_schema_owner";
SET LOCAL ROLE "social_monitor_public_schema_owner";
CREATE TRIGGER "reader_value_assessments_delete_guard" BEFORE DELETE ON "reader_value_assessments"
  FOR EACH ROW EXECUTE FUNCTION public.fence_deleted_reader_value_assessment_jobs();
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";
REVOKE EXECUTE ON FUNCTION public.fence_deleted_reader_value_assessment_jobs() FROM "social_monitor_public_schema_owner";
SET LOCAL ROLE "social_monitor_public_schema_owner";
REVOKE CREATE ON SCHEMA public FROM "social_monitor_reader_summary_publication_owner";
RESET ROLE;
COMMIT;
