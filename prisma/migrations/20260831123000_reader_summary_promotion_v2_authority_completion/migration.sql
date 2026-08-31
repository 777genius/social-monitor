-- @social-monitor-forward-migration
-- Promotion V2 exact historical replay requires an explicit durable statement
-- that engagement authority is complete through the closed UTC day boundary.
-- Existing rollups remain rebuildable, but are not upgraded to exact evidence.
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "feed_items" feed
    JOIN "source_items" source ON source."id" = feed."source_item_id"
    WHERE ROW(feed."tenant_id", feed."workspace_id", feed."provider_key")
      IS DISTINCT FROM
      ROW(source."tenant_id", source."workspace_id", source."provider_key")
    UNION ALL
    SELECT 1
    FROM "source_item_engagement_snapshots" engagement
    JOIN "source_items" source
      ON source."id" = engagement."source_item_id"
    WHERE ROW(engagement."tenant_id", engagement."workspace_id",
      engagement."provider_key") IS DISTINCT FROM
      ROW(source."tenant_id", source."workspace_id", source."provider_key")
    UNION ALL
    SELECT 1
    FROM "source_item_engagement_observations" engagement
    JOIN "source_items" source
      ON source."id" = engagement."source_item_id"
    WHERE ROW(engagement."tenant_id", engagement."workspace_id",
      engagement."provider_key") IS DISTINCT FROM
      ROW(source."tenant_id", source."workspace_id", source."provider_key")
    UNION ALL
    SELECT 1
    FROM "source_item_engagement_daily_rollups" engagement
    JOIN "source_items" source
      ON source."id" = engagement."source_item_id"
    WHERE ROW(engagement."tenant_id", engagement."workspace_id",
      engagement."provider_key") IS DISTINCT FROM
      ROW(source."tenant_id", source."workspace_id", source."provider_key")
  ) THEN
    RAISE EXCEPTION 'Reader promotion authority provider lineage is inconsistent';
  END IF;
END
$migration$;

CREATE UNIQUE INDEX "source_items_scope_id_provider_key"
  ON "source_items"("tenant_id", "workspace_id", "id", "provider_key");
CREATE UNIQUE INDEX "source_item_engagement_snapshots_scope_provider_key"
  ON "source_item_engagement_snapshots"(
    "tenant_id", "workspace_id", "source_item_id", "provider_key"
  );

ALTER TABLE "feed_items"
  DROP CONSTRAINT "feed_items_source_item_id_fkey",
  ADD CONSTRAINT "feed_items_source_item_id_fkey"
    FOREIGN KEY ("tenant_id", "workspace_id", "source_item_id", "provider_key")
    REFERENCES "source_items"("tenant_id", "workspace_id", "id", "provider_key")
    ON DELETE RESTRICT ON UPDATE CASCADE NOT VALID;

ALTER TABLE "source_item_engagement_snapshots"
  DROP CONSTRAINT "source_item_engagement_snapshots_source_item_scope_fkey",
  ADD CONSTRAINT "source_item_engagement_snapshots_source_item_scope_fkey"
    FOREIGN KEY ("tenant_id", "workspace_id", "source_item_id", "provider_key")
    REFERENCES "source_items"("tenant_id", "workspace_id", "id", "provider_key")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

ALTER TABLE "source_item_engagement_observations"
  DROP CONSTRAINT "source_item_engagement_observations_source_item_scope_fkey",
  ADD CONSTRAINT "source_item_engagement_observations_source_item_scope_fkey"
    FOREIGN KEY ("tenant_id", "workspace_id", "source_item_id", "provider_key")
    REFERENCES "source_items"("tenant_id", "workspace_id", "id", "provider_key")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

ALTER TABLE "source_item_engagement_daily_rollups"
  DROP CONSTRAINT "source_item_engagement_daily_rollups_source_item_scope_fkey",
  ADD CONSTRAINT "source_item_engagement_daily_rollups_source_item_scope_fkey"
    FOREIGN KEY ("tenant_id", "workspace_id", "source_item_id", "provider_key")
    REFERENCES "source_items"("tenant_id", "workspace_id", "id", "provider_key")
    ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;

ALTER TABLE "feed_items" VALIDATE CONSTRAINT
  "feed_items_source_item_id_fkey";
ALTER TABLE "source_item_engagement_snapshots" VALIDATE CONSTRAINT
  "source_item_engagement_snapshots_source_item_scope_fkey";
ALTER TABLE "source_item_engagement_observations" VALIDATE CONSTRAINT
  "source_item_engagement_observations_source_item_scope_fkey";
ALTER TABLE "source_item_engagement_daily_rollups" VALIDATE CONSTRAINT
  "source_item_engagement_daily_rollups_source_item_scope_fkey";

ALTER TABLE "source_item_engagement_daily_rollups"
  ADD COLUMN "complete_through_at" TIMESTAMPTZ(6);

ALTER TABLE "source_item_engagement_daily_rollups"
  ADD CONSTRAINT "source_item_engagement_daily_rollups_completion_check"
  CHECK (
    "complete_through_at" IS NULL
    OR "complete_through_at" >= "last_observed_at"
  ) NOT VALID;

ALTER TABLE "source_item_engagement_daily_rollups"
  VALIDATE CONSTRAINT
    "source_item_engagement_daily_rollups_completion_check";
