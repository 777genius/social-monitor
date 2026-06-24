CREATE TABLE "feed_signal_baseline_samples" (
    "id" UUID NOT NULL,
    "tenant_id" UUID NOT NULL,
    "workspace_id" UUID NOT NULL,
    "topic_id" UUID NOT NULL,
    "feed_item_id" UUID NOT NULL,
    "provider_key" TEXT NOT NULL,
    "source_key" TEXT NOT NULL,
    "content_type" TEXT NOT NULL,
    "strength" DOUBLE PRECISION NOT NULL,
    "published_at" TIMESTAMPTZ(6) NOT NULL,
    "observed_at" TIMESTAMPTZ(6) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "feed_signal_baseline_samples_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "feed_signal_baseline_samples_tenant_id_workspace_id_feed_it_key"
    ON "feed_signal_baseline_samples"("tenant_id", "workspace_id", "feed_item_id");

CREATE INDEX "feed_signal_baseline_samples_tenant_id_workspace_id_topic_i_idx"
    ON "feed_signal_baseline_samples"("tenant_id", "workspace_id", "topic_id", "observed_at");

CREATE INDEX "feed_signal_baseline_samples_tenant_id_workspace_id_provider_idx"
    ON "feed_signal_baseline_samples"("tenant_id", "workspace_id", "provider_key", "content_type", "observed_at");
