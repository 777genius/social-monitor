import type { ArticleCaptureScope } from '../../../ports/article-capture-repository';
import type { ScanLease } from '../../../ports/scan-lease.port';
import type { PrismaIngestionClient } from './prisma-ingestion-client';

export type ArticleCaptureTransaction = PrismaIngestionClient & {
  $queryRaw<T>(query: TemplateStringsArray, ...values: readonly unknown[]): Promise<T>;
};

export const lockArticleCapture = async (
  client: PrismaIngestionClient,
  scope: ArticleCaptureScope,
  lease: ScanLease,
  externalId: string,
): Promise<{ readonly tx: ArticleCaptureTransaction; readonly now: Date; readonly expiresAt: Date } | null> => {
  const tx = client as ArticleCaptureTransaction;
  if (typeof tx.$queryRaw !== 'function') throw new Error('Article capture requires scoped SQL fence support');
  if (scope.tenantId !== lease.tenantId || scope.workspaceId !== lease.workspaceId) return null;
  // Shared lease lock serializes revocation with completion. Source lock is
  // acquired before reading wall time, so waiting cannot extend the lease.
  const leases = await tx.$queryRaw<readonly { expires_at: Date }[]>`
    SELECT expires_at FROM scan_leases
    WHERE tenant_id = ${scope.tenantId}::uuid AND workspace_id = ${scope.workspaceId}::uuid
      AND scan_job_id = ${lease.scanJobId}::uuid AND fencing_token = ${lease.fencingToken}
    FOR SHARE`;
  if (leases.length !== 1) return null;
  const sources = await tx.$queryRaw<readonly { id: string }[]>`
    SELECT id FROM source_items
    WHERE tenant_id = ${scope.tenantId}::uuid AND workspace_id = ${scope.workspaceId}::uuid
      AND source_binding_id = ${scope.sourceBindingId}::uuid AND provider_key = ${scope.providerKey}
      AND provider_item_id = ${externalId}
    FOR UPDATE`;
  if (sources.length !== 1) return null;
  const times = await tx.$queryRaw<readonly { now: Date }[]>`SELECT clock_timestamp() AS now`;
  const now = times[0]?.now;
  if (!(now instanceof Date) || !Number.isFinite(now.getTime()) || leases[0]!.expires_at <= now) return null;
  return { tx, now, expiresAt: leases[0]!.expires_at };
};

// Repeat the wall-clock predicate at the write itself. JS Date precision and
// time spent preparing metadata must not admit an expired lease at the edge.
export const writeArticleCapture = async (tx: ArticleCaptureTransaction, scope: ArticleCaptureScope, lease: ScanLease, data: {
  readonly id: string;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly body?: string;
  readonly contentHash?: string;
  readonly providerContentHash?: string;
  readonly contentChanged?: boolean;
}): Promise<boolean> => {
  const rows = await tx.$queryRaw<readonly { id: string }[]>`
    UPDATE source_items AS source SET
      metadata = ${JSON.stringify(data.metadata)}::jsonb,
      body = COALESCE(${data.body ?? null}::text, source.body),
      content_hash = COALESCE(${data.contentHash ?? null}::text, source.content_hash),
      provider_content_hash = COALESCE(${data.providerContentHash ?? null}::text, source.provider_content_hash),
      content_updated_at = CASE WHEN ${data.contentChanged ?? false}::boolean THEN clock_timestamp() ELSE source.content_updated_at END
    WHERE source.id = ${data.id}::uuid AND source.tenant_id = ${scope.tenantId}::uuid
      AND source.workspace_id = ${scope.workspaceId}::uuid AND source.source_binding_id = ${scope.sourceBindingId}::uuid
      AND source.provider_key = ${scope.providerKey}
      AND EXISTS (SELECT 1 FROM scan_leases AS lease
        WHERE lease.tenant_id = source.tenant_id AND lease.workspace_id = source.workspace_id
          AND lease.scan_job_id = ${lease.scanJobId}::uuid AND lease.fencing_token = ${lease.fencingToken}
          AND lease.expires_at > clock_timestamp())
    RETURNING source.id`;
  return rows.length === 1;
};
