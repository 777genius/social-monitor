-- @social-monitor-forward-migration
-- Lock risk: brief ACCESS EXCLUSIVE lock while adding metadata columns to
-- outbox_events. Existing rows receive EVENT/default dispatch metadata without
-- a separate backfill.
-- Rollout order: migrate first, then deploy API/event-relay writers and readers.
-- Forward fix: new code can be stopped while pending rows remain durable; do not
-- drop or rewrite pending rows during rollback.

CREATE TYPE "OutboxMessageKind" AS ENUM ('EVENT', 'COMMAND');

ALTER TABLE "outbox_events"
  ADD COLUMN "message_kind" "OutboxMessageKind" NOT NULL DEFAULT 'EVENT',
  ADD COLUMN "available_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "publish_attempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lease_owner" TEXT,
  ADD COLUMN "leased_until" TIMESTAMPTZ(6),
  ADD COLUMN "last_error" TEXT;

CREATE INDEX "outbox_events_dispatch_idx"
  ON "outbox_events"(
    "message_kind",
    "status",
    "available_at",
    "created_at"
  );
