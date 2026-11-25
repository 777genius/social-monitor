-- @social-monitor-repair-migration
-- Additive engagement persistence. Existing source/feed rows are intentionally
-- not backfilled here; the application backfill is audited and idempotent.
-- Runtime class: online additive DDL. The source-items composite unique index
-- may briefly acquire a SHARE lock while it validates existing UUID identities.
-- Rollout order: backup -> migrate -> ingestion worker -> readers. The previous
-- application remains compatible because every source column is nullable and
-- all new tables are additive. Forward fix is the rollback strategy: preserve
-- captured history, disable the projection provider, then apply a repair patch.

DO $$
BEGIN
  CREATE TYPE "EngagementObservationReason" AS ENUM ('INITIAL', 'CADENCE', 'FINAL', 'LEGACY_BACKFILL');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE "source_items"
  ADD COLUMN IF NOT EXISTS "provider_content_hash" TEXT,
  ADD COLUMN IF NOT EXISTS "last_observed_at" TIMESTAMPTZ(6),
  ADD COLUMN IF NOT EXISTS "content_updated_at" TIMESTAMPTZ(6);

ALTER TABLE "source_candidate_memory"
  ADD COLUMN IF NOT EXISTS "content_fingerprint" TEXT,
  ADD COLUMN IF NOT EXISTS "engagement_fingerprint" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "source_items_tenant_workspace_id_key"
  ON "source_items"("tenant_id", "workspace_id", "id");

CREATE TABLE IF NOT EXISTS "source_item_engagement_snapshots" (
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "source_item_id" UUID NOT NULL,
  "provider_key" TEXT NOT NULL,
  "score" BIGINT,
  "comments" BIGINT,
  "likes" BIGINT,
  "reposts" BIGINT,
  "replies" BIGINT,
  "quotes" BIGINT,
  "bookmarks" BIGINT,
  "impressions" BIGINT,
  "views" BIGINT,
  "points" BIGINT,
  "stars" BIGINT,
  "forks" BIGINT,
  "stars_gained" BIGINT,
  "provider_rank" INTEGER,
  "upvote_ratio_bps" INTEGER,
  "metrics_hash" TEXT NOT NULL,
  "first_observed_at" TIMESTAMPTZ(6) NOT NULL,
  "last_observed_at" TIMESTAMPTZ(6) NOT NULL,
  "last_changed_at" TIMESTAMPTZ(6) NOT NULL,
  "last_observation_at" TIMESTAMPTZ(6) NOT NULL,
  "next_observation_due_at" TIMESTAMPTZ(6) NOT NULL,
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "source_item_engagement_snapshots_pkey"
    PRIMARY KEY ("tenant_id", "workspace_id", "source_item_id")
);

CREATE TABLE IF NOT EXISTS "source_item_engagement_observations" (
  "id" UUID NOT NULL,
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "source_item_id" UUID NOT NULL,
  "provider_key" TEXT NOT NULL,
  "source_binding_id" UUID,
  "scan_job_id" UUID,
  "score" BIGINT,
  "comments" BIGINT,
  "likes" BIGINT,
  "reposts" BIGINT,
  "replies" BIGINT,
  "quotes" BIGINT,
  "bookmarks" BIGINT,
  "impressions" BIGINT,
  "views" BIGINT,
  "points" BIGINT,
  "stars" BIGINT,
  "forks" BIGINT,
  "stars_gained" BIGINT,
  "provider_rank" INTEGER,
  "upvote_ratio_bps" INTEGER,
  "metrics_hash" TEXT NOT NULL,
  "observed_at" TIMESTAMPTZ(6) NOT NULL,
  "bucket_started_at" TIMESTAMPTZ(6) NOT NULL,
  "reason" "EngagementObservationReason" NOT NULL,
  "metrics_changed" BOOLEAN NOT NULL,
  "has_regression" BOOLEAN NOT NULL DEFAULT false,
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "source_item_engagement_observations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "source_item_engagement_daily_rollups" (
  "tenant_id" UUID NOT NULL,
  "workspace_id" UUID NOT NULL,
  "source_item_id" UUID NOT NULL,
  "provider_key" TEXT NOT NULL,
  "day" DATE NOT NULL,
  "sample_count" INTEGER NOT NULL,
  "changed_sample_count" INTEGER NOT NULL,
  "regression_count" INTEGER NOT NULL,
  "first_observed_at" TIMESTAMPTZ(6) NOT NULL,
  "last_observed_at" TIMESTAMPTZ(6) NOT NULL,
  "compacted_through_at" TIMESTAMPTZ(6) NOT NULL,
  "opening_metrics" JSONB NOT NULL,
  "closing_metrics" JSONB NOT NULL,
  "peak_metrics" JSONB NOT NULL,
  "schema_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "source_item_engagement_daily_rollups_pkey"
    PRIMARY KEY ("tenant_id", "workspace_id", "source_item_id", "day")
);

CREATE INDEX IF NOT EXISTS "source_item_engagement_snapshots_provider_observed_idx"
  ON "source_item_engagement_snapshots"("tenant_id", "workspace_id", "provider_key", "last_observed_at" DESC);
CREATE INDEX IF NOT EXISTS "source_item_engagement_snapshots_due_idx"
  ON "source_item_engagement_snapshots"("tenant_id", "workspace_id", "next_observation_due_at");
CREATE INDEX IF NOT EXISTS "source_item_engagement_observations_item_observed_idx"
  ON "source_item_engagement_observations"("tenant_id", "workspace_id", "source_item_id", "observed_at" DESC);
CREATE INDEX IF NOT EXISTS "source_item_engagement_observations_provider_observed_idx"
  ON "source_item_engagement_observations"("tenant_id", "workspace_id", "provider_key", "observed_at" DESC);
CREATE INDEX IF NOT EXISTS "source_item_engagement_observations_retention_idx"
  ON "source_item_engagement_observations"("tenant_id", "workspace_id", "observed_at" DESC);
CREATE UNIQUE INDEX IF NOT EXISTS "source_item_engagement_observations_bucket_key"
  ON "source_item_engagement_observations"("tenant_id", "workspace_id", "source_item_id", "bucket_started_at");
CREATE INDEX IF NOT EXISTS "source_item_engagement_daily_rollups_provider_day_idx"
  ON "source_item_engagement_daily_rollups"("tenant_id", "workspace_id", "provider_key", "day" DESC);
CREATE INDEX IF NOT EXISTS "source_item_engagement_daily_rollups_retention_idx"
  ON "source_item_engagement_daily_rollups"("tenant_id", "workspace_id", "day" DESC);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'source_item_engagement_snapshots_source_item_scope_fkey') THEN
    ALTER TABLE "source_item_engagement_snapshots"
      ADD CONSTRAINT "source_item_engagement_snapshots_source_item_scope_fkey"
      FOREIGN KEY ("tenant_id", "workspace_id", "source_item_id")
      REFERENCES "source_items"("tenant_id", "workspace_id", "id")
      ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'source_item_engagement_observations_source_item_scope_fkey') THEN
    ALTER TABLE "source_item_engagement_observations"
      ADD CONSTRAINT "source_item_engagement_observations_source_item_scope_fkey"
      FOREIGN KEY ("tenant_id", "workspace_id", "source_item_id")
      REFERENCES "source_items"("tenant_id", "workspace_id", "id")
      ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'source_item_engagement_daily_rollups_source_item_scope_fkey') THEN
    ALTER TABLE "source_item_engagement_daily_rollups"
      ADD CONSTRAINT "source_item_engagement_daily_rollups_source_item_scope_fkey"
      FOREIGN KEY ("tenant_id", "workspace_id", "source_item_id")
      REFERENCES "source_items"("tenant_id", "workspace_id", "id")
      ON DELETE CASCADE ON UPDATE CASCADE NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'source_item_engagement_snapshots_metrics_check') THEN
    ALTER TABLE "source_item_engagement_snapshots"
      ADD CONSTRAINT "source_item_engagement_snapshots_metrics_check" CHECK (
        ("comments" IS NULL OR "comments" >= 0) AND
        ("likes" IS NULL OR "likes" >= 0) AND
        ("reposts" IS NULL OR "reposts" >= 0) AND
        ("replies" IS NULL OR "replies" >= 0) AND
        ("quotes" IS NULL OR "quotes" >= 0) AND
        ("bookmarks" IS NULL OR "bookmarks" >= 0) AND
        ("impressions" IS NULL OR "impressions" >= 0) AND
        ("views" IS NULL OR "views" >= 0) AND
        ("points" IS NULL OR "points" >= 0) AND
        ("stars" IS NULL OR "stars" >= 0) AND
        ("forks" IS NULL OR "forks" >= 0) AND
        ("stars_gained" IS NULL OR "stars_gained" >= 0) AND
        ("provider_rank" IS NULL OR "provider_rank" > 0) AND
        ("upvote_ratio_bps" IS NULL OR "upvote_ratio_bps" BETWEEN 0 AND 10000)
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'source_item_engagement_snapshots_time_check') THEN
    ALTER TABLE "source_item_engagement_snapshots"
      ADD CONSTRAINT "source_item_engagement_snapshots_time_check" CHECK (
        "first_observed_at" <= "last_changed_at" AND
        "last_changed_at" <= "last_observed_at" AND
        "first_observed_at" <= "last_observation_at" AND
        "last_observation_at" <= "last_observed_at" AND
        "last_observation_at" <= "next_observation_due_at"
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'source_item_engagement_observations_metrics_check') THEN
    ALTER TABLE "source_item_engagement_observations"
      ADD CONSTRAINT "source_item_engagement_observations_metrics_check" CHECK (
        ("comments" IS NULL OR "comments" >= 0) AND
        ("likes" IS NULL OR "likes" >= 0) AND
        ("reposts" IS NULL OR "reposts" >= 0) AND
        ("replies" IS NULL OR "replies" >= 0) AND
        ("quotes" IS NULL OR "quotes" >= 0) AND
        ("bookmarks" IS NULL OR "bookmarks" >= 0) AND
        ("impressions" IS NULL OR "impressions" >= 0) AND
        ("views" IS NULL OR "views" >= 0) AND
        ("points" IS NULL OR "points" >= 0) AND
        ("stars" IS NULL OR "stars" >= 0) AND
        ("forks" IS NULL OR "forks" >= 0) AND
        ("stars_gained" IS NULL OR "stars_gained" >= 0) AND
        ("provider_rank" IS NULL OR "provider_rank" > 0) AND
        ("upvote_ratio_bps" IS NULL OR "upvote_ratio_bps" BETWEEN 0 AND 10000)
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'source_item_engagement_observations_bucket_check') THEN
    ALTER TABLE "source_item_engagement_observations"
      ADD CONSTRAINT "source_item_engagement_observations_bucket_check" CHECK (
        "bucket_started_at" = date_bin(INTERVAL '30 minutes', "bucket_started_at", TIMESTAMPTZ '2000-01-01 00:00:00+00') AND
        "observed_at" >= "bucket_started_at" AND
        "observed_at" < "bucket_started_at" + INTERVAL '30 minutes'
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'source_item_engagement_daily_rollups_counts_check') THEN
    ALTER TABLE "source_item_engagement_daily_rollups"
      ADD CONSTRAINT "source_item_engagement_daily_rollups_counts_check" CHECK (
        "sample_count" > 0 AND
        "changed_sample_count" BETWEEN 0 AND "sample_count" AND
        "regression_count" BETWEEN 0 AND "sample_count" AND
        "first_observed_at" <= "last_observed_at" AND
        "last_observed_at" <= "compacted_through_at"
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'source_item_engagement_daily_rollups_metrics_check') THEN
    ALTER TABLE "source_item_engagement_daily_rollups"
      ADD CONSTRAINT "source_item_engagement_daily_rollups_metrics_check" CHECK (
        jsonb_typeof("opening_metrics") = 'object' AND
        jsonb_typeof("closing_metrics") = 'object' AND
        jsonb_typeof("peak_metrics") = 'object'
      ) NOT VALID;
  END IF;
END $$;

ALTER TABLE "source_item_engagement_snapshots" VALIDATE CONSTRAINT "source_item_engagement_snapshots_source_item_scope_fkey";
ALTER TABLE "source_item_engagement_observations" VALIDATE CONSTRAINT "source_item_engagement_observations_source_item_scope_fkey";
ALTER TABLE "source_item_engagement_daily_rollups" VALIDATE CONSTRAINT "source_item_engagement_daily_rollups_source_item_scope_fkey";
ALTER TABLE "source_item_engagement_snapshots" VALIDATE CONSTRAINT "source_item_engagement_snapshots_metrics_check";
ALTER TABLE "source_item_engagement_snapshots" VALIDATE CONSTRAINT "source_item_engagement_snapshots_time_check";
ALTER TABLE "source_item_engagement_observations" VALIDATE CONSTRAINT "source_item_engagement_observations_metrics_check";
ALTER TABLE "source_item_engagement_observations" VALIDATE CONSTRAINT "source_item_engagement_observations_bucket_check";
ALTER TABLE "source_item_engagement_daily_rollups" VALIDATE CONSTRAINT "source_item_engagement_daily_rollups_counts_check";
ALTER TABLE "source_item_engagement_daily_rollups" VALIDATE CONSTRAINT "source_item_engagement_daily_rollups_metrics_check";
