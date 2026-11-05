import type { PrismaIngestionWorkerConnection } from '../../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection';
import { PrismaSourceItemRepository } from '@social-monitor/ingestion/adapters/persistence/prisma/prisma-source-item.repository';
import { PrismaFeedProjectionAdapter } from '@social-monitor/feed/adapters/persistence/prisma/prisma-feed-projection.adapter';
import { feedDedupeKeyForItem } from '@social-monitor/feed/adapters/persistence/feed-dedupe-key';
import { SourceItem } from '@social-monitor/ingestion/domain/entities/source-item';
import { sanitizeFetchedSourceItem } from '@social-monitor/ingestion/features/execute-scan/scan-source-sanitization';
import { CryptoIdGenerator, SystemClock, tenantId, workspaceId } from '@social-monitor/shared-kernel';
import { insertOnlyFeedTransaction } from '../import-rss-sep24-verified';
import { noRetryGitHubArchiveTransaction } from './github-archive-finite-journal';
import { assertFiniteGitHubArchiveRole } from './github-archive-finite-role-policy';
import { archiveNeed as need, redditArchiveLane, scopedRedditArchiveRelationSql } from './reddit-archive-finite-policy';
import type { RedditArchiveAtomicDependencies } from '../backfill/reddit-archive-write/internal-writer';
type Transaction = PrismaIngestionWorkerConnection & { $queryRawUnsafe: <T>(sql: string, ...args: unknown[]) => Promise<T> };

/** Direct protected persistence seam: archive import never invents a provider scan/fetch attempt. */
export function createFiniteRedditArchiveDependencies(connection: PrismaIngestionWorkerConnection): RedditArchiveAtomicDependencies {
  const ids = new CryptoIdGenerator(), clock = new SystemClock();
  return { withAtomicWrites: (p, work) => connection.$transaction(async tx => {
    const raw = tx as unknown as Transaction, s = { ...p.scope, tenantId: tenantId(p.scope.tenantId),
      workspaceId: workspaceId(p.scope.workspaceId) }, externalIds = p.candidates.map(x => x.externalId);
    const nativeIds = externalIds.map(id => id.replace(/^reddit:t3_/u, ''));
    const aliases = nativeIds.flatMap(id => [id, `t3_${id}`, `reddit:${id}`, `reddit:t3_${id}`]);
    redditArchiveLane(p.bindingConfig, p.matchedLaneOrdinal);
    await assertFiniteGitHubArchiveRole((sql, values) => raw.$queryRawUnsafe(sql, ...values), s, 'write');
    const relation = await raw.$queryRawUnsafe<readonly { interestQuery: string }[]>(
      scopedRedditArchiveRelationSql.replace('SELECT 1 FROM', 'SELECT i.query AS "interestQuery" FROM'),
      s.tenantId, s.workspaceId, s.interestId, s.sourceBindingId, s.scanPolicyId, p.bindingConfig,
      p.scanPolicy.intervalSeconds, p.scanPolicy.freshnessSeconds, p.scanPolicy.retryBudget);
    need(relation.length === 1 && typeof relation[0]!.interestQuery === 'string', 'Reddit archive scoped binding changed');
    const guarded = insertOnlyFeedTransaction(noRetryGitHubArchiveTransaction(raw));
    const finite = new Proxy(guarded, { get(target, property) {
      if (property === '$transaction') return <T>(operation: (client: Transaction) => Promise<T>) => operation(finite);
      return Reflect.get(target, property);
    } }) as Transaction;
    const items = new PrismaSourceItemRepository(finite), feed = new PrismaFeedProjectionAdapter(finite, ids);
    const matching = async () => raw.$queryRawUnsafe<readonly { sourceItemId: string }[]>(`
      SELECT DISTINCT s.id AS "sourceItemId" FROM source_items s JOIN feed_items f
      ON f.tenant_id=s.tenant_id AND f.workspace_id=s.workspace_id AND f.source_item_id=s.id
      AND f.provider_key=s.provider_key AND f.source_binding_id=s.source_binding_id
      WHERE s.tenant_id=$1::uuid AND s.workspace_id=$2::uuid AND s.source_binding_id=$3::uuid
      AND s.provider_key='reddit' AND s.provider_item_id=ANY($4::text[]) AND f.interest_id=$5::uuid AND f.status='VISIBLE'`,
    s.tenantId, s.workspaceId, s.sourceBindingId, externalIds, s.interestId);
    return work({ assertMissing: async job => {
      const keys = p.candidates.map(x => feedDedupeKeyForItem({ canonicalUrl: x.item.canonicalUrl,
        sourceBindingId: s.sourceBindingId, providerMetadata: x.item.metadata }));
      need(new Set(keys).size === keys.length, 'Reddit archive duplicate feed identities');
      const rows = await raw.$queryRawUnsafe<readonly { reserved: boolean }[]>(`
        SELECT EXISTS(SELECT 1 FROM source_items WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid
         AND provider_key='reddit' AND (provider_item_id=ANY($3::text[]) OR canonical_url=ANY($4::text[])
          OR substring(canonical_url from '/comments/([a-z0-9]+)')=ANY($7::text[]))
        UNION ALL SELECT 1 FROM feed_items WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid
         AND provider_key='reddit' AND (canonical_url=ANY($4::text[]) OR dedupe_key=ANY($6::text[])
          OR substring(canonical_url from '/comments/([a-z0-9]+)')=ANY($7::text[]))
        UNION ALL SELECT 1 FROM scan_jobs WHERE id=$5::uuid
        UNION ALL SELECT 1 FROM scan_attempts WHERE scan_job_id=$5::uuid
        UNION ALL SELECT 1 FROM scan_leases WHERE scan_job_id=$5::uuid) AS reserved`,
      s.tenantId, s.workspaceId, aliases, p.candidates.map(x => x.item.canonicalUrl), job, keys, nativeIds);
      need(rows.length === 1 && rows[0]!.reserved === false, 'Reddit archive identity already exists; no replay');
    }, persist: async () => {
      const now = clock.now();
      const input = p.candidates.map(({ item }) => SourceItem.ingest({ ...sanitizeFetchedSourceItem({ ...item,
        metadata: { ...item.metadata, archiveImportObservedAt: now.toISOString() } }), id: ids.generate(),
        tenantId: s.tenantId, workspaceId: s.workspaceId, sourceBindingId: s.sourceBindingId, ingestedAt: now }));
      const saved = await items.saveRedditArchiveBatchInsertOnly({ ...s, providerKey: 'reddit', items: input });
      need(saved.inserted === input.length && saved.contentUpdated === 0 && saved.skippedDuplicates === 0 &&
        saved.items.length === input.length && new Set(saved.items.map(x => x.externalId)).size === input.length &&
        saved.items.every(x => x.inserted && externalIds.includes(x.externalId)), 'Reddit insert-only contract failed');
      const projected = await feed.project({ ...s, providerKey: 'reddit', sourceItems: saved.items.map(x => x.persistedItem),
        snapshots: { interestQuerySnapshot: { interestId: s.interestId, query: relation[0]!.interestQuery },
          sourceBindingSnapshot: { sourceBindingId: s.sourceBindingId, providerKey: 'reddit', sourceQuery: p.sourceQuery },
          workspaceScopeSnapshot: { tenantId: s.tenantId, workspaceId: s.workspaceId } } });
      return { inserted: saved.inserted, projected: projected.projected };
    }, present: async () => (await matching()).length });
  }, { isolationLevel: 'Serializable', maxWait: 5000, timeout: 120000 }) };
}
