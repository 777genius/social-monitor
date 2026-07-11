-- @social-monitor-repair-migration
CREATE TABLE IF NOT EXISTS "source_candidate_memory" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "interest_id" UUID NOT NULL,
    "source_binding_id" UUID NOT NULL,
    "provider_key" TEXT NOT NULL,
    "provider_item_id" TEXT NOT NULL,
    "scope_fingerprint" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "policy_version" TEXT NOT NULL,
    "decision" TEXT NOT NULL,
    "reason_code" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ(6) NOT NULL,
    "first_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "last_seen_at" TIMESTAMPTZ(6) NOT NULL,
    "seen_count" INTEGER NOT NULL DEFAULT 1,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "source_candidate_memory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "source_candidate_memory_scope_item_key"
ON "source_candidate_memory"("tenant_id", "workspace_id", "interest_id", "source_binding_id", "provider_key", "scope_fingerprint", "provider_item_id");

CREATE INDEX IF NOT EXISTS "source_candidate_memory_active_lookup_idx"
ON "source_candidate_memory"("tenant_id", "workspace_id", "source_binding_id", "provider_key", "scope_fingerprint", "expires_at");

CREATE INDEX IF NOT EXISTS "source_candidate_memory_expiry_idx"
ON "source_candidate_memory"("expires_at");
