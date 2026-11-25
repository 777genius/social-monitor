-- @social-monitor-forward-migration

BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";

ALTER TABLE "scan_attempts"
ADD COLUMN "attempt_number" INTEGER NOT NULL DEFAULT 1;

ALTER TABLE "scan_attempts"
ADD CONSTRAINT "scan_attempts_attempt_number_check"
CHECK ("attempt_number" >= 1);

RESET ROLE;

COMMIT;
