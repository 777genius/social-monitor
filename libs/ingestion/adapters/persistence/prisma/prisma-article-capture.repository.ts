import { lockArticleCapture, writeArticleCapture, type ArticleCaptureTransaction } from './prisma-article-capture-fence';
import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type { SourceItem } from '../../../domain/entities/source-item';
import { articleCaptureCompletionMatches, articleCaptureIsDue, prepareLegacyArticleCapture, reserveArticleCapture } from '../../../domain/value-objects/article-capture-attempt';
import { ARTICLE_FETCH_POLICY_VERSION, readContentCapture } from '../../../domain/value-objects/source-content-capture';
import { mergeArticleCaptureCompletion } from '../../../domain/value-objects/merge-article-capture-completion';
import { sourceItemProviderContentHash } from '../../../domain/value-objects/source-item-content-fingerprint';
import type { ArticleCaptureRepository, ArticleCaptureScope, CompleteArticleCaptureCommand, ReserveArticleCaptureCommand } from '../../../ports/article-capture-repository';
import type { PrismaIngestionClient } from './prisma-ingestion-client';
import { contentHashForSourceItem, sourceItemFromPrisma, type PrismaSourceItemRecord } from './prisma-ingestion-records';

type TransactionClient = PrismaIngestionClient & {
  $transaction?: <T>(operation: (tx: PrismaIngestionClient) => Promise<T>, options: { isolationLevel: 'Serializable' }) => Promise<T>;
};
export class PrismaArticleCaptureRepository implements ArticleCaptureRepository {
  constructor(private readonly prisma: PrismaIngestionClient) {}

  async findDueArticleCaptures(command: Parameters<ArticleCaptureRepository['findDueArticleCaptures']>[0]): Promise<readonly SourceItem[]> {
    const client = this.prisma as ArticleCaptureTransaction;
    if (typeof client.$queryRaw !== 'function' || this.prisma.sourceItem.findMany === undefined) {
      throw new Error('Article capture requires scoped SQL due lookup support');
    }
    const candidates = await client.$queryRaw<readonly { provider_item_id: string }[]>`
      SELECT provider_item_id FROM source_items
      WHERE tenant_id = ${command.tenantId}::uuid AND workspace_id = ${command.workspaceId}::uuid
        AND source_binding_id = ${command.sourceBindingId}::uuid AND provider_key = ${command.providerKey}
        AND (
          metadata #>> '{articleFetchPolicy,version}' IS DISTINCT FROM ${ARTICLE_FETCH_POLICY_VERSION}
          OR metadata #>> '{articleFetchPolicy,liveUrlRequired}' IS DISTINCT FROM 'true'
          OR EXISTS (
            SELECT 1 FROM jsonb_to_recordset(${JSON.stringify(command.liveArticleCredentialIdentities)}::jsonb)
              AS live("externalId" text, "articleUrl" text)
            WHERE live."externalId" = source_items.provider_item_id
              AND live."articleUrl" = metadata #>> '{contentCapture,articleUrl}'
          )
        )
        AND (
          (metadata #>> '{articleCaptureAttempt,version}' = 'article_capture_attempt.v1'
            AND metadata #>> '{articleCaptureAttempt,status}' IN ('pending', 'retryable_failed', 'running')
            AND jsonb_typeof(metadata #> '{articleCaptureAttempt,attemptCount}') = 'number'
            AND metadata #> '{articleCaptureAttempt,attemptCount}' < '3'::jsonb
            AND metadata #>> '{articleCaptureAttempt,nextAttemptAt}' <= ${command.now.toISOString()})
          OR (metadata -> 'contentCapture' IS NULL AND (
            metadata #>> '{articleContent,status}' = 'failed'
            OR (metadata #>> '{articleContent,status}' = 'skipped' AND (
              metadata #>> '{articleContent,reason}' = 'scan item enrichment budget exceeded'
              OR metadata #>> '{articleContent,reasonCode}' IN ('noise_gate', 'scan_budget_exhausted')))))
        )
      ORDER BY published_at ASC, id ASC LIMIT ${Math.min(20, Math.max(1, Math.floor(command.limit)))}`;
    if (candidates.length === 0) return [];
    const records = await this.prisma.sourceItem.findMany({ where: {
      tenantId: command.tenantId, workspaceId: command.workspaceId, providerKey: command.providerKey,
      providerItemId: { in: candidates.map((row) => row.provider_item_id) },
    } });
    const byExternalId = new Map(records.map((record) => [record.providerItemId, record]));
    const due: SourceItem[] = [];
    for (const candidate of candidates) {
      let record = byExternalId.get(candidate.provider_item_id);
      if (record?.sourceBindingId !== command.sourceBindingId) continue;
      const initialized = sourceItemFromPrisma(record).toSnapshot().metadata?.contentCapture === undefined;
      if (initialized) {
        record = await this.initializeLegacyOpportunity(command, candidate.provider_item_id) ?? undefined;
      }
      if (record === undefined) continue;
      const item = sourceItemFromPrisma(record);
      if ((initialized && readContentCapture(item.toSnapshot())?.articleUrl != null) || articleCaptureIsDue(item.toSnapshot(), command.now)) due.push(item);
    }
    return due;
  }

  private initializeLegacyOpportunity(scope: ArticleCaptureScope, externalId: string): Promise<PrismaSourceItemRecord | null> {
    return this.transaction(async (client) => {
      const tx = client as ArticleCaptureTransaction;
      if (typeof tx.$queryRaw !== 'function' || tx.sourceItem.update === undefined) throw new Error('Legacy capture initialization requires scoped SQL support');
      const locked = await tx.$queryRaw<readonly { id: string }[]>`
        SELECT id FROM source_items WHERE tenant_id = ${scope.tenantId}::uuid AND workspace_id = ${scope.workspaceId}::uuid
          AND source_binding_id = ${scope.sourceBindingId}::uuid AND provider_key = ${scope.providerKey}
          AND provider_item_id = ${externalId} FOR UPDATE`;
      if (locked.length !== 1) return null;
      const record = await findCurrent(tx, scope, externalId);
      if (record === null) return null;
      const snapshot = sourceItemFromPrisma(record).toSnapshot();
      if (snapshot.metadata?.contentCapture !== undefined) return record;
      const times = await tx.$queryRaw<readonly { now: Date }[]>`SELECT clock_timestamp() AS now`;
      const now = times[0]?.now;
      if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new Error('Capture initialization requires database wall time');
      const prepared = prepareLegacyArticleCapture(snapshot, scope.providerKey, now);
      if (prepared === snapshot) return record;
      return tx.sourceItem.update({ where: { id: record.id }, data: {
        body: prepared.body, metadata: prepared.metadata ?? {}, contentHash: contentHashForSourceItem(prepared),
        providerContentHash: sourceItemProviderContentHash({ providerKey: scope.providerKey, snapshot: prepared }),
        contentUpdatedAt: now, lastObservedAt: record.lastObservedAt ?? record.observedAt,
      } });
    });
  }

  reserveArticleCapture(command: ReserveArticleCaptureCommand): Promise<SourceItem | null> {
    return this.transaction(async (tx) => {
      const fence = await lockArticleCapture(tx, command, command.lease, command.externalId);
      if (fence === null) return null;
      const record = await findCurrent(tx, command, command.externalId);
      if (record === null) return null;
      const snapshot = prepareLegacyArticleCapture(sourceItemFromPrisma(record).toSnapshot(), command.providerKey, fence.now);
      const capture = readContentCapture(snapshot);
      if (capture?.nativeRevision !== command.expectedNativeRevision || capture.articleUrl !== command.expectedArticleUrl) return null;
      const reserved = reserveArticleCapture(snapshot, {
        now: fence.now, token: command.reservationToken, scanJobId: command.lease.scanJobId,
        scanFence: command.lease.fencingToken, leaseUntil: fence.expiresAt,
      });
      if (reserved === undefined) return null;
      const providerContentHash = sourceItemProviderContentHash({ providerKey: command.providerKey, snapshot: reserved });
      if (!await writeArticleCapture(fence.tx, command, command.lease, {
        id: record.id, body: reserved.body, metadata: reserved.metadata ?? {},
        contentHash: contentHashForSourceItem(reserved), providerContentHash,
        contentChanged: providerContentHash !== record.providerContentHash,
      })) return null;
      const persisted = await findCurrent(tx, command, command.externalId);
      return persisted === null ? null : sourceItemFromPrisma(persisted);
    });
  }

  completeArticleCapture(command: CompleteArticleCaptureCommand): Promise<SourceItem | null> {
    return this.transaction(async (tx) => {
      const fence = await lockArticleCapture(tx, command, command.lease, command.item.toSnapshot().externalId);
      if (fence === null) return null;
      const incoming = command.item.toSnapshot();
      const record = await findCurrent(tx, command, incoming.externalId);
      if (record === null || record.id !== incoming.id) return null;
      const current = sourceItemFromPrisma(record).toSnapshot();
      const capture = readContentCapture(incoming);
      if (capture?.nativeRevision !== command.expected.nativeRevision || capture.articleUrl !== command.expected.articleUrl ||
          command.lease.fencingToken !== command.expected.scanFence || command.lease.scanJobId !== command.expected.scanJobId) return null;
      if (!articleCaptureCompletionMatches(current, command.expected, fence.now)) return null;
      const merged = mergeArticleCaptureCompletion(current, incoming, command.providerKey);
      if (merged === undefined) return null;
      const providerContentHash = sourceItemProviderContentHash({ providerKey: command.providerKey, snapshot: merged });
      const changed = providerContentHash !== record.providerContentHash;
      if (!await writeArticleCapture(fence.tx, command, command.lease, {
        id: record.id, body: merged.body, metadata: merged.metadata ?? {},
        contentHash: contentHashForSourceItem(merged), providerContentHash, contentChanged: changed,
      })) return null;
      const persisted = await findCurrent(tx, command, incoming.externalId);
      return persisted === null ? null : sourceItemFromPrisma(persisted);
    });
  }

  private transaction<T>(operation: (tx: PrismaIngestionClient) => Promise<T>): Promise<T> {
    const transaction = (this.prisma as TransactionClient).$transaction;
    if (transaction === undefined) throw new Error('Article capture requires Serializable transaction support');
    return withPrismaWriteRetry(() => transaction.call(this.prisma, operation, { isolationLevel: 'Serializable' }) as Promise<T>);
  }
}

const findCurrent = async (tx: PrismaIngestionClient, scope: ArticleCaptureScope, externalId: string): Promise<PrismaSourceItemRecord | null> => {
  const record = await tx.sourceItem.findFirst({ where: {
    tenantId: scope.tenantId, workspaceId: scope.workspaceId, providerKey: scope.providerKey, providerItemId: externalId,
  } });
  return record?.sourceBindingId === scope.sourceBindingId ? record : null;
};
