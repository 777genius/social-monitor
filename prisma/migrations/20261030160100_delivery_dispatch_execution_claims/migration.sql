-- @social-monitor-forward-migration
-- Additive ownership metadata. Deploy after old delivery workers are drained:
-- legacy workers do not understand fenced execution or transactional dispatch.
ALTER TABLE "delivery_attempts"
  ADD COLUMN "dispatch_command_id" UUID,
  ADD COLUMN "execution_token" UUID,
  ADD COLUMN "execution_lease_expires_at" TIMESTAMPTZ(6);

CREATE INDEX "delivery_attempts_recovery_idx"
  ON "delivery_attempts" ("state", "execution_lease_expires_at", "assembling_at");
