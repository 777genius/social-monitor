-- @social-monitor-forward-migration
-- Close tenant ownership gaps introduced by tables created after the initial
-- RLS migration and by webhook secrets that previously inherited scope from a
-- non-unique endpoint association.

BEGIN;

SET LOCAL ROLE "social_monitor_public_schema_owner";

ALTER TABLE "webhook_secrets" NO FORCE ROW LEVEL SECURITY;

ALTER TABLE "webhook_secrets"
  ADD COLUMN "tenant_id" UUID,
  ADD COLUMN "workspace_id" UUID;

DO $webhook_secret_scope_is_unambiguous$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "webhook_endpoints"
    GROUP BY "secret_key_id"
    HAVING count(DISTINCT ("tenant_id", "workspace_id")) <> 1
  ) THEN
    RAISE EXCEPTION
      'webhook secret scope migration found a key referenced by multiple tenant workspaces';
  END IF;
END
$webhook_secret_scope_is_unambiguous$;

UPDATE "webhook_secrets" AS secret
SET
  "tenant_id" = endpoint_scope."tenant_id",
  "workspace_id" = endpoint_scope."workspace_id"
FROM (
  SELECT
    "secret_key_id",
    min("tenant_id"::TEXT)::UUID AS "tenant_id",
    min("workspace_id"::TEXT)::UUID AS "workspace_id"
  FROM "webhook_endpoints"
  GROUP BY "secret_key_id"
) AS endpoint_scope
WHERE endpoint_scope."secret_key_id" = secret."id";

-- Historical create failures could leave encrypted material without an
-- endpoint. Preserve it for incident/retention handling, but quarantine it
-- behind an unguessable scope that no application tenant owns.
UPDATE "webhook_secrets"
SET
  "tenant_id" = gen_random_uuid(),
  "workspace_id" = gen_random_uuid()
WHERE "tenant_id" IS NULL OR "workspace_id" IS NULL;

ALTER TABLE "webhook_secrets"
  ALTER COLUMN "tenant_id" SET NOT NULL,
  ALTER COLUMN "workspace_id" SET NOT NULL;

CREATE UNIQUE INDEX "webhook_secrets_id_tenant_workspace_key"
  ON "webhook_secrets" ("id", "tenant_id", "workspace_id");

CREATE INDEX "webhook_secrets_tenant_workspace_id_idx"
  ON "webhook_secrets" ("tenant_id", "workspace_id", "id");

CREATE INDEX "webhook_endpoints_secret_scope_idx"
  ON "webhook_endpoints" ("secret_key_id", "tenant_id", "workspace_id");

ALTER TABLE "webhook_endpoints"
  ADD CONSTRAINT "webhook_endpoints_secret_scope_fkey"
  FOREIGN KEY ("secret_key_id", "tenant_id", "workspace_id")
  REFERENCES "webhook_secrets" ("id", "tenant_id", "workspace_id")
  ON DELETE RESTRICT
  ON UPDATE RESTRICT;

DROP POLICY "tenant_isolation" ON "webhook_secrets";

CREATE POLICY "tenant_isolation" ON "webhook_secrets"
  USING (
    public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
  )
  WITH CHECK (
    public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
  );

ALTER TABLE "webhook_secrets" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "webhook_secrets" FORCE ROW LEVEL SECURITY;

RESET ROLE;

SET LOCAL ROLE "social_monitor_reader_summary_publication_owner";

ALTER TABLE "reader_summary_weekly_publication_evidence"
  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "reader_summary_weekly_publication_evidence"
  FORCE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation"
  ON "reader_summary_weekly_publication_evidence"
  USING (
    public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
  )
  WITH CHECK (
    public.social_monitor_rls_workspace_match("tenant_id", "workspace_id")
  );

RESET ROLE;

COMMIT;
