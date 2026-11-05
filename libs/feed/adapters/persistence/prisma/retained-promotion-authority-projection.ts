import { createHash } from "node:crypto";

// Only durable fields consumed by native metric authority and regression resolution.
// Keep timestamps exact and UTC regardless of the connection's timezone setting.
const timestamp = (column: string): string =>
  `to_char(${column} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;
const metrics = (alias: "snapshot" | "retained"): string => [
  "score", "comments", "likes", "reposts", "points", "stars", "forks",
  "stars_gained", "provider_rank", "upvote_ratio_bps", "metrics_hash", "provider_key", "schema_version",
].map((column) => `'${column}', ${alias}.${column}`).join(", ");

/** Fixed SQL, never caller/user supplied; PostgreSQL canonicalizes the JSONB. */
export const retainedPromotionAuthorityProjectionSql = `jsonb_build_object(
  'feedItemId', feed.id, 'sourceItemId', feed.source_item_id,
  'tenantId', feed.tenant_id, 'workspaceId', feed.workspace_id,
  'providerKey', feed.provider_key, 'providerMetadata', feed.provider_metadata,
  'publishedAt', ${timestamp("feed.published_at")}, 'observedAt', ${timestamp("feed.observed_at")},
  'snapshot', (SELECT jsonb_build_object(${metrics("snapshot")},
    'last_observed_at', ${timestamp("snapshot.last_observed_at")},
    'last_changed_at', ${timestamp("snapshot.last_changed_at")})
    FROM source_item_engagement_snapshots snapshot
    WHERE snapshot.tenant_id = feed.tenant_id AND snapshot.workspace_id = feed.workspace_id
      AND snapshot.source_item_id = feed.source_item_id),
  'observations', (SELECT jsonb_agg(jsonb_build_object(${metrics("retained")},
    'id', retained.id, 'observed_at', ${timestamp("retained.observed_at")},
    'has_regression', retained.has_regression) ORDER BY retained.observed_at DESC, retained.id DESC)
    FROM (SELECT observation.* FROM source_item_engagement_observations observation
      WHERE observation.tenant_id = feed.tenant_id AND observation.workspace_id = feed.workspace_id
        AND observation.source_item_id = feed.source_item_id
      ORDER BY observation.observed_at DESC, observation.id DESC LIMIT 2) retained)
)::text`;

export const retainedPromotionAuthoritySha256 = (projection: string): string =>
  createHash("sha256").update(projection).digest("hex");
