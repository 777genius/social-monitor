-- @social-monitor-forward-migration
-- Lock risk: ALTER TABLE takes an exclusive lock; schedule the coordinated drain.
BEGIN;
SET TRANSACTION ISOLATION LEVEL SERIALIZABLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";

ALTER TABLE public."scan_attempts"
  ADD COLUMN "terminal_failure" BOOLEAN NOT NULL DEFAULT FALSE;

COMMIT;
