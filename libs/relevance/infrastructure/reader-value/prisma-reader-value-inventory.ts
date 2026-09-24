import type { JsonObject } from '@social-monitor/shared-kernel';
import { ReaderValueInventoryByteCeilingExceeded,
  type ReaderValueInventory, type ReaderValueInventoryCursor,
  type ReaderValueInventoryItem, type ReaderValueInventorySnapshot,
  type ReaderValuePreparationInventory } from '../../application/contracts/reader-value-inventory';
import type { ReaderValueDiscoveryScope } from '../../application/contracts/reader-value-assessment-store';
import { assessmentReadSnapshot, assessmentTransaction, liveAssessmentScope,
  type AssessmentSqlClient, type AssessmentSqlTransaction } from './assessment-sql';
import { readReaderValueCapture } from './reader-value-capture';
import { canonicalPostgresTimestamp } from './canonical-postgres-timestamp';

type InventoryRow = {
  readonly feed_item_id: string; readonly source_binding_id: string;
  readonly published_at: string; readonly observed_at: string; readonly interest_id: string;
  readonly source_item_id: string; readonly provider_key: string; readonly canonical_url: string;
  readonly source_updated_at: string;
  readonly title: string; readonly body: string; readonly query: string; readonly content_hash: string;
  readonly metadata: unknown; readonly provider_metadata: unknown;
};
type InventoryIdentityRow = {
  readonly feed_item_id: string; readonly source_item_id: string;
  readonly source_updated_at: string; readonly content_hash: string;
  readonly source_bytes: number | string | bigint;
};

export const READER_VALUE_INVENTORY_MAX_SOURCE_BYTES = 32 * 1024 * 1024;

export class PrismaReaderValueInventory implements ReaderValueInventory, ReaderValuePreparationInventory {
  constructor(private readonly client: AssessmentSqlClient) {}

  page(scope: ReaderValueDiscoveryScope, backfillFrom: string, cursor: ReaderValueInventoryCursor | undefined,
    limit: number, sourceByteBudget = READER_VALUE_INVENTORY_MAX_SOURCE_BYTES,
    exclusivePeriodEnd?: string):
    Promise<readonly ReaderValueInventoryItem[]> {
    validatePage(limit, sourceByteBudget);
    return assessmentTransaction(this.client, scope, (tx) => this.pageInTransaction(tx, scope,
      backfillFrom, cursor, limit, sourceByteBudget, exclusivePeriodEnd));
  }

  readSnapshot<T>(scope: ReaderValueDiscoveryScope,
    operation: (snapshot: ReaderValueInventorySnapshot) => Promise<T>): Promise<T> {
    return assessmentReadSnapshot(this.client, scope, async (tx) => {
      let active = true;
      const snapshot: ReaderValueInventorySnapshot = { page: async (
        backfillFrom, cursor, limit, sourceByteBudget = READER_VALUE_INVENTORY_MAX_SOURCE_BYTES,
        exclusivePeriodEnd,
      ) => {
        if (!active) throw new Error('Reader value inventory snapshot is closed');
        validatePage(limit, sourceByteBudget);
        return this.pageInTransaction(tx, scope, backfillFrom, cursor, limit,
          sourceByteBudget, exclusivePeriodEnd);
      } };
      try {
        return await operation(snapshot);
      } finally {
        active = false;
      }
    });
  }

  private async pageInTransaction(tx: AssessmentSqlTransaction, scope: ReaderValueDiscoveryScope,
    backfillFrom: string, cursor: ReaderValueInventoryCursor | undefined, limit: number,
    sourceByteBudget: number, exclusivePeriodEnd?: string): Promise<readonly ReaderValueInventoryItem[]> {
      // Preflight only bounded identities, versions and database byte lengths. A
      // rejected page never transfers a source body into the application process.
      const identities = await tx.$queryRawUnsafe<InventoryIdentityRow[]>(`SELECT
        f.id::text AS feed_item_id,s.id::text AS source_item_id,
        s.content_updated_at::text AS source_updated_at,s.content_hash,
        (octet_length(s.title)+octet_length(s.body))::bigint AS source_bytes
        FROM feed_items f
        JOIN source_items s ON s.tenant_id=f.tenant_id AND s.workspace_id=f.workspace_id AND s.id=f.source_item_id
          AND s.provider_key=f.provider_key
        JOIN interests i ON i.tenant_id=f.tenant_id AND i.workspace_id=f.workspace_id AND i.id=f.interest_id
        JOIN source_bindings b ON b.tenant_id=f.tenant_id AND b.workspace_id=f.workspace_id AND b.id=f.source_binding_id
          AND b.interest_id=f.interest_id AND b.status='ENABLED' AND b.deleted_at IS NULL
        JOIN source_catalog_entries c ON c.id=b.source_catalog_entry_id AND c.provider_key=f.provider_key
        CROSS JOIN LATERAL (SELECT f.tenant_id,f.workspace_id,f.interest_id,f.source_item_id) a
        WHERE f.tenant_id=$1::uuid AND f.workspace_id=$2::uuid AND f.status='VISIBLE'
          AND f.interest_id=$3::uuid AND s.content_updated_at IS NOT NULL
          AND f.published_at >= $4::timestamptz AND f.published_at <= clock_timestamp()
          AND ($8::timestamptz IS NULL OR f.published_at < $8::timestamptz)
          AND s.created_at+interval '180 days'>clock_timestamp() AND ${liveAssessmentScope}
          AND ($5::timestamptz IS NULL OR (f.published_at,f.id)>($5::timestamptz,$6::uuid))
        ORDER BY f.published_at,f.id LIMIT $7`,scope.tenantId,scope.workspaceId,
      scope.interestId,backfillFrom,cursor?.publishedAt ?? null,cursor?.feedItemId ?? null,limit,
      exclusivePeriodEnd ?? null);
      const bytes = identities.reduce((sum, row) => sum + Number(row.source_bytes), 0);
      if (!Number.isSafeInteger(bytes) || bytes > sourceByteBudget) {
        throw new ReaderValueInventoryByteCeilingExceeded();
      }
      if (identities.length === 0) return [];
      const requested = identities.map((row, ordinal) => ({ ...row,
        source_bytes: undefined, ordinal }));
      // The materialization statement is pinned to the exact identity/revision
      // selected above and repeats every live tenant/workspace/interest guard.
      const rows = await tx.$queryRawUnsafe<InventoryRow[]>(`WITH requested AS (
        SELECT * FROM jsonb_to_recordset($7::jsonb) AS r(feed_item_id uuid,
          source_item_id uuid,source_updated_at timestamptz,content_hash text,ordinal integer))
        SELECT f.id::text AS feed_item_id,
        f.source_binding_id::text AS source_binding_id,f.published_at::text AS published_at,
        f.observed_at::text AS observed_at,f.interest_id::text,s.id::text AS source_item_id,
        s.provider_key,s.canonical_url,s.title,s.body,s.content_updated_at::text AS source_updated_at,
        i.query,s.content_hash,s.metadata,f.provider_metadata
        FROM requested r JOIN feed_items f ON f.id=r.feed_item_id
        JOIN source_items s ON s.tenant_id=f.tenant_id AND s.workspace_id=f.workspace_id AND s.id=f.source_item_id
          AND s.provider_key=f.provider_key AND s.id=r.source_item_id
          AND s.content_updated_at=r.source_updated_at AND s.content_hash=r.content_hash
        JOIN interests i ON i.tenant_id=f.tenant_id AND i.workspace_id=f.workspace_id AND i.id=f.interest_id
        JOIN source_bindings b ON b.tenant_id=f.tenant_id AND b.workspace_id=f.workspace_id AND b.id=f.source_binding_id
          AND b.interest_id=f.interest_id AND b.status='ENABLED' AND b.deleted_at IS NULL
        JOIN source_catalog_entries c ON c.id=b.source_catalog_entry_id AND c.provider_key=f.provider_key
        CROSS JOIN LATERAL (SELECT f.tenant_id,f.workspace_id,f.interest_id,f.source_item_id) a
        WHERE f.tenant_id=$1::uuid AND f.workspace_id=$2::uuid AND f.status='VISIBLE'
          AND f.interest_id=$3::uuid
          AND s.content_updated_at IS NOT NULL
          AND f.published_at >= $4::timestamptz AND f.published_at <= clock_timestamp()
          AND ($8::timestamptz IS NULL OR f.published_at < $8::timestamptz)
          AND s.created_at+interval '180 days'>clock_timestamp() AND ${liveAssessmentScope}
          AND ($5::timestamptz IS NULL OR (f.published_at,f.id)>($5::timestamptz,$6::uuid))
        ORDER BY r.ordinal`,scope.tenantId,scope.workspaceId,
      scope.interestId,backfillFrom,cursor?.publishedAt ?? null,cursor?.feedItemId ?? null,
      JSON.stringify(requested),exclusivePeriodEnd ?? null);
      if (rows.length !== identities.length) {
        throw new Error('Reader value inventory changed during materialization');
      }
      return rows.map((row) => {
        const metadata = metadataRecord(row.metadata);
        const providerMetadata = metadataRecord(row.provider_metadata);
        return {
          cursor: { publishedAt: canonicalPostgresTimestamp(row.published_at),
            feedItemId: row.feed_item_id },
          sourceBindingId: row.source_binding_id,
          observedAt: canonicalPostgresTimestamp(row.observed_at),
          sourceUpdatedAt: canonicalPostgresTimestamp(row.source_updated_at),
          sourceRevisionKey: row.content_hash,
          metadata: metadata.kind === providerMetadata.kind ? providerMetadata : {},
          source: { ...scope, interestId: row.interest_id, sourceItemId: row.source_item_id,
            providerKey: row.provider_key, canonicalUrl: row.canonical_url, title: row.title, body: row.body,
            interest: row.query, ...readReaderValueCapture(metadata, row.provider_key, row.title, row.body) },
        };
      });
  }
}

function validatePage(limit: number, sourceByteBudget: number): void {
  if (!Number.isInteger(limit) || limit < 1 || limit > 25) {
    throw new Error('Reader value inventory page limit is 25');
  }
  if (!Number.isSafeInteger(sourceByteBudget) || sourceByteBudget < 0 ||
      sourceByteBudget > READER_VALUE_INVENTORY_MAX_SOURCE_BYTES) {
    throw new Error('Reader value inventory source byte budget is invalid');
  }
}

/** Nullable/legacy JSON is an unsupported kind, never a pagination failure. */
function metadataRecord(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as JsonObject : {};
}
