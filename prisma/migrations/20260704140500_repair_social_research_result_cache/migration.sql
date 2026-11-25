-- @social-monitor-repair-migration
-- Adds durable social research result cache storage for deployed databases that
-- predate the canonical baseline update.

CREATE TABLE IF NOT EXISTS "social_research_result_cache_entries" (
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "cache_key" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "social_research_result_cache_entries_pkey" PRIMARY KEY ("tenant_id","workspace_id","kind","cache_key")
);

CREATE INDEX IF NOT EXISTS "social_research_result_cache_entries_tenant_id_workspace_id_idx"
  ON "social_research_result_cache_entries"("tenant_id", "workspace_id", "kind", "updated_at");

CREATE INDEX IF NOT EXISTS "social_research_result_cache_entries_expires_at_idx"
  ON "social_research_result_cache_entries"("expires_at");
