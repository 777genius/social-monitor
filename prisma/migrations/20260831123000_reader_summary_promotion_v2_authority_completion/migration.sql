-- @social-monitor-forward-migration
-- Promotion V2 exact historical replay requires an explicit durable statement
-- that engagement authority is complete through the closed UTC day boundary.
-- Existing rollups remain rebuildable, but are not upgraded to exact evidence.
BEGIN;

-- Ordered production bootstrap deliberately gives the migration login SET-only
-- membership in the NOLOGIN schema owner. Temporarily lend the publication
-- owner only the columns needed by the cross-tenant validation: that role is
-- the database RLS system reader, while the schema owner remains subject to
-- FORCE ROW LEVEL SECURITY. The ledger makes the grants preimage-safe, and the
-- enclosing transaction guarantees that an exception cannot leak them.
SET LOCAL ROLE "social_monitor_public_schema_owner";
CREATE TEMPORARY TABLE "reader_summary_authority_completion_validation_acl" (
  "relation_name" NAME NOT NULL,
  "column_name" NAME NOT NULL,
  PRIMARY KEY ("relation_name", "column_name")
) ON COMMIT DROP;

DO $grant_validation_acl$
DECLARE
  target RECORD;
BEGIN
  FOR target IN
    SELECT *
    FROM (VALUES
      ('feed_items', 'tenant_id'),
      ('feed_items', 'workspace_id'),
      ('feed_items', 'source_item_id'),
      ('feed_items', 'provider_key'),
      ('source_items', 'id'),
      ('source_items', 'tenant_id'),
      ('source_items', 'workspace_id'),
      ('source_items', 'provider_key'),
      ('source_item_engagement_snapshots', 'source_item_id'),
      ('source_item_engagement_snapshots', 'tenant_id'),
      ('source_item_engagement_snapshots', 'workspace_id'),
      ('source_item_engagement_snapshots', 'provider_key'),
      ('source_item_engagement_observations', 'source_item_id'),
      ('source_item_engagement_observations', 'tenant_id'),
      ('source_item_engagement_observations', 'workspace_id'),
      ('source_item_engagement_observations', 'provider_key'),
      ('source_item_engagement_daily_rollups', 'source_item_id'),
      ('source_item_engagement_daily_rollups', 'tenant_id'),
      ('source_item_engagement_daily_rollups', 'workspace_id'),
      ('source_item_engagement_daily_rollups', 'provider_key')
    ) AS required_acl(relation_name, column_name)
  LOOP
    IF NOT pg_catalog.has_column_privilege(
      'social_monitor_reader_summary_publication_owner',
      pg_catalog.format('public.%I', target.relation_name),
      target.column_name,
      'SELECT'
    ) THEN
      EXECUTE pg_catalog.format(
        'GRANT SELECT (%I) ON TABLE public.%I TO '
          'social_monitor_reader_summary_publication_owner',
        target.column_name,
        target.relation_name
      );
      INSERT INTO
        pg_temp."reader_summary_authority_completion_validation_acl"
        ("relation_name", "column_name")
      VALUES (target.relation_name, target.column_name);
    END IF;
  END LOOP;
END
$grant_validation_acl$;

RESET ROLE;
SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";
DO $migration$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public."feed_items" feed
    JOIN public."source_items" source
      ON source."id" = feed."source_item_id"
    WHERE ROW(feed."tenant_id", feed."workspace_id", feed."provider_key")
      IS DISTINCT FROM
      ROW(source."tenant_id", source."workspace_id", source."provider_key")
    UNION ALL
    SELECT 1
    FROM public."source_item_engagement_snapshots" engagement
    JOIN public."source_items" source
      ON source."id" = engagement."source_item_id"
    WHERE ROW(engagement."tenant_id", engagement."workspace_id",
      engagement."provider_key") IS DISTINCT FROM
      ROW(source."tenant_id", source."workspace_id", source."provider_key")
    UNION ALL
    SELECT 1
    FROM public."source_item_engagement_observations" engagement
    JOIN public."source_items" source
      ON source."id" = engagement."source_item_id"
    WHERE ROW(engagement."tenant_id", engagement."workspace_id",
      engagement."provider_key") IS DISTINCT FROM
      ROW(source."tenant_id", source."workspace_id", source."provider_key")
    UNION ALL
    SELECT 1
    FROM public."source_item_engagement_daily_rollups" engagement
    JOIN public."source_items" source
      ON source."id" = engagement."source_item_id"
    WHERE ROW(engagement."tenant_id", engagement."workspace_id",
      engagement."provider_key") IS DISTINCT FROM
      ROW(source."tenant_id", source."workspace_id", source."provider_key")
  ) THEN
    RAISE EXCEPTION 'Reader promotion authority provider lineage is inconsistent';
  END IF;
END
$migration$;

RESET ROLE;
SET LOCAL ROLE "social_monitor_public_schema_owner";
DO $revoke_validation_acl$
DECLARE
  granted_acl RECORD;
BEGIN
  FOR granted_acl IN
    SELECT "relation_name", "column_name"
    FROM pg_temp."reader_summary_authority_completion_validation_acl"
  LOOP
    EXECUTE pg_catalog.format(
      'REVOKE SELECT (%I) ON TABLE public.%I FROM '
        'social_monitor_reader_summary_publication_owner',
      granted_acl.column_name,
      granted_acl.relation_name
    );
  END LOOP;
END
$revoke_validation_acl$;

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

RESET ROLE;
COMMIT;
