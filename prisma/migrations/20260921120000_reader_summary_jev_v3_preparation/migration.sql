-- @social-monitor-forward-migration
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";

ALTER TABLE "reader_summary_jobs"
  ADD COLUMN "selection_strategy" TEXT,
  ADD COLUMN "preparation_config" JSONB,
  ADD COLUMN "preparation_manifest" JSONB,
  ADD COLUMN "preparation_manifest_sha256" CHAR(64),
  ADD COLUMN "preparation_cutoff_at" TIMESTAMPTZ(6),
  ADD COLUMN "preparation_deadline_at" TIMESTAMPTZ(6),
  ADD COLUMN "preparation_next_check_at" TIMESTAMPTZ(6),
  ADD COLUMN "preparation_ready_at" TIMESTAMPTZ(6);

ALTER TABLE "reader_summary_jobs"
  ADD CONSTRAINT "reader_summary_jobs_selection_strategy_check"
  CHECK ("selection_strategy" IS NULL OR "selection_strategy" IN
    ('legacy_v2', 'jev_shadow', 'jev_primary_v3')),
  ADD CONSTRAINT "reader_summary_jobs_preparation_manifest_sha_check"
  CHECK ("preparation_manifest_sha256" IS NULL OR
    "preparation_manifest_sha256" ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT "reader_summary_jobs_preparation_pair_check"
  CHECK (("preparation_manifest" IS NULL) =
    ("preparation_manifest_sha256" IS NULL)),
  ADD CONSTRAINT "reader_summary_jobs_preparation_time_check"
  CHECK ("preparation_deadline_at" IS NULL OR
    ("preparation_cutoff_at" IS NOT NULL AND
     "preparation_deadline_at" > "preparation_cutoff_at"));

CREATE INDEX "reader_summary_jobs_preparation_due_idx"
  ON "reader_summary_jobs" ("status", "preparation_next_check_at", "requested_at", "id");

-- Existing jobs remain legacy by absence, while every new writer freezes a value.
COMMENT ON COLUMN "reader_summary_jobs"."selection_strategy" IS
  'Frozen at job creation/preparation. NULL is readable legacy history only.';

CREATE OR REPLACE FUNCTION public.guard_assessment_scope_erased_job()
RETURNS trigger LANGUAGE plpgsql SET search_path = pg_catalog AS $function$
BEGIN
  IF OLD.terminal_failure_code IS NOT NULL AND (
    NEW.status IS DISTINCT FROM OLD.status OR
    NEW.terminal_failure_code IS DISTINCT FROM OLD.terminal_failure_code OR
    NEW.failed_at IS DISTINCT FROM OLD.failed_at OR
    NEW.failure_reason IS DISTINCT FROM OLD.failure_reason
  ) THEN
    RAISE EXCEPTION 'reader summary preparation failure is terminal'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.selection_strategy IS NOT NULL AND (
    NEW.selection_strategy IS DISTINCT FROM OLD.selection_strategy OR
    (OLD.preparation_config IS NOT NULL AND
      NEW.preparation_config IS DISTINCT FROM OLD.preparation_config) OR
    (OLD.preparation_cutoff_at IS NOT NULL AND
      NEW.preparation_cutoff_at IS DISTINCT FROM OLD.preparation_cutoff_at) OR
    (OLD.preparation_deadline_at IS NOT NULL AND
      NEW.preparation_deadline_at IS DISTINCT FROM OLD.preparation_deadline_at)
  ) THEN
    RAISE EXCEPTION 'reader summary preparation identity is immutable'
      USING ERRCODE = '23514';
  END IF;
  IF OLD.preparation_manifest IS NOT NULL AND (
    NEW.preparation_manifest IS DISTINCT FROM OLD.preparation_manifest OR
    NEW.preparation_manifest_sha256 IS DISTINCT FROM OLD.preparation_manifest_sha256
  ) THEN
    RAISE EXCEPTION 'reader summary preparation manifest is write-once'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.terminal_failure_code IS NOT NULL AND NEW.status <> 'FAILED' THEN
    RAISE EXCEPTION 'terminal failure code requires failed job'
      USING ERRCODE = '23514';
  END IF;
  IF NEW.selection_strategy = 'jev_primary_v3' AND NEW.status = 'RUNNING' AND
    (NEW.preparation_manifest IS NULL OR NEW.preparation_ready_at IS NULL) THEN
    RAISE EXCEPTION 'V3 execution requires an atomically ready manifest'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$function$;

COMMIT;
