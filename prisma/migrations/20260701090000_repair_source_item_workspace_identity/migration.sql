-- @social-monitor-repair-migration
-- Repair databases that already applied the older tenant-wide source item
-- identity. Fresh databases get the canonical form from the baseline.

DROP INDEX IF EXISTS "source_items_tenant_id_provider_key_provider_item_id_key";

CREATE UNIQUE INDEX IF NOT EXISTS "source_items_tenant_workspace_provider_item_key"
  ON "source_items"("tenant_id", "workspace_id", "provider_key", "provider_item_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'feed_items_source_item_id_fkey'
  ) THEN
    ALTER TABLE "feed_items"
      ADD CONSTRAINT "feed_items_source_item_id_fkey"
      FOREIGN KEY ("source_item_id")
      REFERENCES "source_items"("id")
      ON DELETE RESTRICT
      ON UPDATE CASCADE
      NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM "feed_items" AS feed
    LEFT JOIN "source_items" AS source
      ON source."id" = feed."source_item_id"
    WHERE source."id" IS NULL
  ) THEN
    ALTER TABLE "feed_items"
      VALIDATE CONSTRAINT "feed_items_source_item_id_fkey";
  END IF;
END $$;
