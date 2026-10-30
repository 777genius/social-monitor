-- @social-monitor-forward-migration
-- Drain old ingestion workers before rollout: legacy drainers delete retry rows
-- without honoring these claims. Mixed old/new retry consumers are unsupported.
ALTER TABLE "scan_failure_queue_entries"
  ADD COLUMN "claim_token" UUID,
  ADD COLUMN "claimed_until" TIMESTAMPTZ(6);

ALTER TABLE "scan_failure_queue_entries"
  ADD CONSTRAINT "scan_retry_claim_pair"
  CHECK (("claim_token" IS NULL) = ("claimed_until" IS NULL));

CREATE INDEX "scan_retry_claim_expiry_idx"
  ON "scan_failure_queue_entries" ("status", "claimed_until", "created_at");
