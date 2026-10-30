-- @social-monitor-forward-migration
ALTER TABLE "scan_attempts"
  ADD COLUMN "terminal_failure" BOOLEAN NOT NULL DEFAULT FALSE;
