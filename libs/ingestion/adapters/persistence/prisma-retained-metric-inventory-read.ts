import type { RefreshScope } from "../../features/refresh-retained-metrics/refresh-retained-metrics.contracts";
import type { Row } from "./prisma-retained-metric-inventory";
import type { MetricInventoryEnrichment } from "./prisma-retained-metric-inventory-bulk";

export type MetricInventorySqlClient = {
  $queryRaw<T = unknown>(query: TemplateStringsArray, ...values: unknown[]): Promise<T>;
};
type ReadRow = { source: Row; snapshot: Row | null; feeds: Row[]; bindings: Row[]; interests: Row[]; catalogs: Row[];
  counts: { hasRegression: boolean; count: string }[] };

// One invocation-local statement, including on a supplied transaction client. No ORM fallback.
// read deliberately has no publication/provider filter: admission must see and reject drift.
export async function readMetricInventorySource(prisma: MetricInventorySqlClient, scope: RefreshScope, sourceItemId: string):
Promise<{ source: Row; enrichment: MetricInventoryEnrichment } | null> {
  const rows = await prisma.$queryRaw<ReadRow[]>`
    WITH owned AS (SELECT ${scope.tenantId}::uuid AS tenant_id, ${scope.workspaceId}::uuid AS workspace_id,
      ${sourceItemId}::uuid AS source_item_id),
    source AS MATERIALIZED (
      SELECT s.id AS "id",
      s.tenant_id AS "tenantId",
      s.workspace_id AS "workspaceId",
      s.source_binding_id AS "sourceBindingId",
      s.provider_key AS "providerKey",
      s.provider_item_id AS "providerItemId",
      s.canonical_url AS "canonicalUrl",
      s.title AS "title",
      s.body AS "body",
      s.author_handle AS "authorHandle",
      s.published_at AS "publishedAt",
      s.content_hash AS "contentHash",
      s.provider_content_hash AS "providerContentHash",
      s.observed_at AS "observedAt",
      s.last_observed_at AS "lastObservedAt",
      s.content_updated_at AS "contentUpdatedAt",
      s.raw_pointer AS "rawPointer",
      s.metadata AS "metadata",
      s.schema_version AS "schemaVersion",
      s.created_at AS "createdAt"
      FROM source_items s JOIN owned o ON s.tenant_id = o.tenant_id AND s.workspace_id = o.workspace_id AND s.id = o.source_item_id
      LIMIT 1
    ), feeds AS MATERIALIZED (
      SELECT f.id AS "id",
      f.tenant_id AS "tenantId",
      f.workspace_id AS "workspaceId",
      f.interest_id AS "interestId",
      f.source_item_id AS "sourceItemId",
      f.source_binding_id AS "sourceBindingId",
      f.provider_key AS "providerKey",
      f.dedupe_key AS "dedupeKey",
      f.canonical_url AS "canonicalUrl",
      f.title AS "title",
      f.body_preview AS "bodyPreview",
      f.author_handle AS "authorHandle",
      f.published_at AS "publishedAt",
      f.observed_at AS "observedAt",
      f.provider_metadata AS "providerMetadata",
      f.status AS "status",
      f.created_at AS "createdAt",
      f.updated_at AS "updatedAt"
      FROM feed_items f JOIN owned o ON f.tenant_id = o.tenant_id AND f.workspace_id = o.workspace_id AND f.source_item_id = o.source_item_id
      WHERE EXISTS (SELECT 1 FROM source)
      ORDER BY f.id ASC LIMIT 1001
    ), bindings AS MATERIALIZED (
      SELECT b.id AS "id",
      b.tenant_id AS "tenantId",
      b.workspace_id AS "workspaceId",
      b.interest_id AS "interestId",
      b.source_catalog_entry_id AS "sourceCatalogEntryId",
      b.capability_profile_version AS "capabilityProfileVersion",
      b.status AS "status",
      b.config AS "config",
      b.cursor_reset_requested_at AS "cursorResetRequestedAt",
      b.created_at AS "createdAt",
      b.updated_at AS "updatedAt",
      b.deleted_at AS "deletedAt"
      FROM source_bindings b JOIN owned o ON b.tenant_id = o.tenant_id AND b.workspace_id = o.workspace_id
      WHERE b.id IN (SELECT "sourceBindingId" FROM source UNION SELECT "sourceBindingId" FROM feeds)
    ), interests AS (
      SELECT i.id AS "id",
      i.tenant_id AS "tenantId",
      i.workspace_id AS "workspaceId",
      i.name AS "name",
      i.query AS "query",
      i.status AS "status",
      i.created_at AS "createdAt",
      i.updated_at AS "updatedAt",
      i.deleted_at AS "deletedAt"
      FROM interests i JOIN owned o ON i.tenant_id = o.tenant_id AND i.workspace_id = o.workspace_id
      WHERE i.id IN (SELECT "interestId" FROM bindings)
    ), catalogs AS (
      SELECT c.id AS "id",
      c.provider_key AS "providerKey",
      c.display_name AS "displayName",
      c.acquisition_mode AS "acquisitionMode",
      c.readiness AS "readiness",
      c.created_at AS "createdAt",
      c.updated_at AS "updatedAt"
      FROM source_catalog_entries c WHERE c.id IN (SELECT "sourceCatalogEntryId" FROM bindings)
    )
    SELECT row_to_json(s) AS source,
      (SELECT json_build_object('metricsHash', p.metrics_hash, 'lastObservedAt', p.last_observed_at,
        'lastObservationAt', p.last_observation_at)
       FROM source_item_engagement_snapshots p JOIN owned o ON p.tenant_id = o.tenant_id AND p.workspace_id = o.workspace_id
         AND p.source_item_id = o.source_item_id WHERE p.provider_key = s."providerKey") AS snapshot,
      COALESCE((SELECT json_agg(f ORDER BY f.id) FROM feeds f), '[]'::json) AS feeds,
      COALESCE((SELECT json_agg(b ORDER BY b.id) FROM bindings b), '[]'::json) AS bindings,
      COALESCE((SELECT json_agg(i ORDER BY i.id) FROM interests i), '[]'::json) AS interests,
      COALESCE((SELECT json_agg(c ORDER BY c.id) FROM catalogs c), '[]'::json) AS catalogs,
      COALESCE((SELECT json_agg(g) FROM (
        SELECT h.has_regression AS "hasRegression", count(*)::text AS count
        FROM source_item_engagement_observations h JOIN owned o ON h.tenant_id = o.tenant_id AND h.workspace_id = o.workspace_id
          AND h.source_item_id = o.source_item_id GROUP BY h.has_regression
      ) g), '[]'::json) AS counts
    FROM source s`;
  const row = rows[0];
  if (!row) return null;
  const source = dates(row.source, ["publishedAt", "observedAt", "lastObservedAt", "contentUpdatedAt", "createdAt"]);
  source.engagementSnapshot = row.snapshot && dates(row.snapshot, ["lastObservedAt", "lastObservationAt"]);
  let observationCount = 0, regressionCount = 0;
  for (const group of row.counts) {
    const count = Number(group.count);
    observationCount += count;
    if (group.hasRegression) regressionCount += count;
  }
  return { source, enrichment: {
    feeds: row.feeds.map((feed) => dates(feed, ["publishedAt", "observedAt", "createdAt", "updatedAt"])),
    bindings: row.bindings.map((binding) => dates(binding, ["cursorResetRequestedAt", "createdAt", "updatedAt", "deletedAt"])),
    interests: row.interests.map((interest) => dates(interest, ["createdAt", "updatedAt", "deletedAt"])),
    catalogs: row.catalogs.map((catalog) => dates(catalog, ["createdAt", "updatedAt"])), observationCount, regressionCount,
  } };
}

// Only schema DateTime columns are revived. Date-looking strings inside JSON remain strings.
function dates(row: Row, keys: readonly string[]): Row {
  const result = { ...row };
  for (const key of keys) if (typeof result[key] === "string") result[key] = new Date(result[key] as string);
  return result;
}
