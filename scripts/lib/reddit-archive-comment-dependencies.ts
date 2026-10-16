import { isDeepStrictEqual } from 'node:util';
import { ConversationUnitProjectionAdapter } from '@social-monitor/conversation/adapters/ingestion/conversation-unit-projection.adapter';
import { PrismaConversationUnitRepository } from '@social-monitor/conversation/adapters/persistence/prisma/prisma-conversation-unit.repository';
import type {
  Clock,
  IdGenerator,
} from '@social-monitor/shared-kernel';
import {
  tenantId,
  workspaceId,
} from '@social-monitor/shared-kernel';
import type { PrismaIngestionWorkerConnection } from '../../apps/ingestion-worker/src/adapters/persistence/prisma-ingestion-worker-connection';
import type {
  RedditArchiveCommentPlan,
} from '../backfill/reddit-archive-write/comment-plan';
import type {
  RedditArchiveCommentAtomicDependencies,
  RedditArchiveCommentWrites,
} from '../backfill/reddit-archive-write/comment-internal-writer';
import { noRetryGitHubArchiveTransaction } from './github-archive-finite-journal';
import { assertFiniteGitHubArchiveRole } from './github-archive-finite-role-policy';
import {
  archiveNeed as need,
  redditArchiveLane,
  scopedRedditArchiveRelationSql,
} from './reddit-archive-finite-policy';

type Transaction = PrismaIngestionWorkerConnection & {
  $queryRawUnsafe: <T>(sql: string, ...args: unknown[]) => Promise<T>;
};

type ParentRef = Readonly<{ sourceItemId: string; feedItemId: string; publishedAt: Date }>;
type IdentityRef = Readonly<{
  providerUnitId: string;
  feedItemId: string;
  publishedAt: Date;
  observedAt: Date;
  rawSha256: string;
  body: string;
  canonicalUrl: string;
  providerMetadata: unknown;
  matches: boolean;
}>;

/** Native owner must independently admit the comments-only intent and verify the
 * finite identity/expiry, conversation SELECT/INSERT, baseline SELECT, workspace
 * RLS and tenant-global uniqueness. A duplicate hidden by workspace RLS must fail
 * the unique constraint and roll back the whole transaction without retry.
 * Baseline writes are never invoked. The post-table role check alone is
 * insufficient; there is no default admission.
 */
export type RedditArchiveCommentAdmission = (
  transaction: Pick<Transaction, '$queryRawUnsafe'>,
  plan: RedditArchiveCommentPlan,
) => Promise<void>;

/**
 * Comments-only retained archive persistence. This does not create scan jobs,
 * provider attempts, post rows, feed rows, scorer writes, or baseline grants.
 */
export const createFiniteRedditArchiveCommentDependencies = (
  connection: PrismaIngestionWorkerConnection,
  ids: IdGenerator,
  clock: Clock,
  admitCommentsOnly?: RedditArchiveCommentAdmission,
): RedditArchiveCommentAtomicDependencies => ({
  withAtomicWrites: async (plan, work) => {
    need(admitCommentsOnly !== undefined, 'Native comments-only admission is unavailable');
    return connection.$transaction(
      async (transaction) => {
        const raw = transaction as unknown as Transaction;
        const guarded = noRetryGitHubArchiveTransaction(raw);
        await admitCommentsOnly(guarded, plan);
        const scope = {
          ...plan.scope,
          tenantId: tenantId(plan.scope.tenantId),
          workspaceId: workspaceId(plan.scope.workspaceId),
        };
        redditArchiveLane(plan.bindingConfig, plan.matchedLaneOrdinal);
        await assertFiniteGitHubArchiveRole(
          (sql, values) => guarded.$queryRawUnsafe(sql, ...values),
          scope,
          'write',
        );
        const relation = await guarded.$queryRawUnsafe<
          readonly { interestQuery: string }[]
        >(
          scopedRedditArchiveRelationSql.replace(
            'SELECT 1 FROM',
            'SELECT i.query AS "interestQuery" FROM',
          ),
          scope.tenantId,
          scope.workspaceId,
          scope.interestId,
          scope.sourceBindingId,
          scope.scanPolicyId,
          plan.bindingConfig,
          plan.scanPolicy.intervalSeconds,
          plan.scanPolicy.freshnessSeconds,
          plan.scanPolicy.retryBudget,
        );
        need(
          relation.length === 1 && typeof relation[0]?.interestQuery === 'string',
          'Reddit archive comments scoped binding changed',
        );

        const providerUnitIds = plan.candidates.map((unit) => unit.providerUnitId);
        const rootProviderItemId = plan.candidates[0]?.rootProviderItemId;
        let parent: ParentRef | undefined;
        let writeObservedAt: Date | undefined;
        const writes: RedditArchiveCommentWrites = {
          assertParentAndMissing: async () => {
            const parents = await guarded.$queryRawUnsafe<readonly ParentRef[]>(`
              SELECT s.id AS "sourceItemId", f.id AS "feedItemId", s.published_at AS "publishedAt"
              FROM source_items s
              JOIN feed_items f
                ON f.tenant_id=s.tenant_id AND f.workspace_id=s.workspace_id
               AND f.source_item_id=s.id AND f.provider_key=s.provider_key
               AND f.source_binding_id=s.source_binding_id
              WHERE s.tenant_id=$1::uuid AND s.workspace_id=$2::uuid
                AND s.source_binding_id=$3::uuid AND s.provider_key='reddit'
                AND s.provider_item_id=$4 AND f.interest_id=$5::uuid
                AND f.status='VISIBLE'`,
              scope.tenantId,
              scope.workspaceId,
              scope.sourceBindingId,
              `reddit:t3_${plan.identity.nativeParentId}`,
              scope.interestId,
            );
            need(
              rootProviderItemId === `t3_${plan.identity.nativeParentId}` &&
                parents.length === 1,
              parents.length === 0
                ? 'Reddit archived comment parent feed missing'
                : 'Reddit archived comment parent feed ambiguous or foreign',
            );
            const resolved = parents[0]!;
            need(resolved.publishedAt instanceof Date &&
              resolved.publishedAt.toISOString().slice(0, 10) === '2026-10-01' &&
              plan.candidates.every((unit) => unit.publishedAt >= resolved.publishedAt),
              'Reddit archived comment parent chronology invalid');
            parent = resolved;

            const existing = await guarded.$queryRawUnsafe<
              readonly { workspaceId: string }[]
            >(
              `SELECT workspace_id::text AS "workspaceId" FROM conversation_units
               WHERE tenant_id=$1::uuid AND provider_key='reddit'
                 AND provider_unit_id=ANY($2::text[])`,
              scope.tenantId,
              providerUnitIds,
            );
            need(
              existing.length === 0,
              existing.some((row) => row.workspaceId !== scope.workspaceId)
                ? 'Reddit archived comment identity collision is cross-workspace'
                : 'Reddit archived comment identity already exists; no overwrite',
            );
          },
          persist: async () => {
            need(parent !== undefined, 'Reddit archived comment parent was not checked');
            writeObservedAt = clock.now();
            need(Number.isFinite(writeObservedAt.getTime()) &&
              writeObservedAt.getTime() >= Date.parse(plan.acquiredAt),
              'Reddit archived comment observedAt precedes acquisition');
            const repository = PrismaConversationUnitRepository.forArchiveTransaction(
              guarded,
              ids,
            );
            const projection = new ConversationUnitProjectionAdapter(
              repository,
              ids,
            );
            const result = await projection.projectArchiveInsertOnly({
              tenantId: scope.tenantId,
              workspaceId: scope.workspaceId,
              interestId: scope.interestId,
              sourceBindingId: scope.sourceBindingId,
              providerKey: 'reddit',
              observedAt: writeObservedAt,
              conversationUnits: plan.candidates,
              projectedFeedItems: [
                {
                  sourceItemId: parent.sourceItemId,
                  feedItemId: parent.feedItemId,
                  sourceExternalId: `reddit:${rootProviderItemId}`,
                },
              ],
            });
            need(
              result.projected === 2 &&
                result.skippedOrphans === 0 &&
                result.skippedInvalid === 0,
              'Reddit archived comment projection incomplete',
            );
            return {
              inserted: result.projected,
              projected: result.projected,
            };
          },
          present: async () => {
            need(
              parent !== undefined && writeObservedAt !== undefined,
              'Reddit archived comment write state uncertain',
            );
            const rows = await guarded.$queryRawUnsafe<readonly IdentityRef[]>(`
              SELECT provider_unit_id AS "providerUnitId",
                     root_feed_item_id AS "feedItemId",
                     published_at AS "publishedAt",
                     observed_at AS "observedAt", body, canonical_url AS "canonicalUrl",
                     provider_metadata AS "providerMetadata",
                     provider_metadata->'redditArchiveComments'->>'rawSha256' AS "rawSha256",
                     (interest_id=$4::uuid AND source_binding_id=$5::uuid
                       AND root_provider_item_id='t3_1wuktlf' AND thread_external_id='t3_1wuktlf'
                       AND depth=0 AND role='top_level_comment' AND parent_provider_unit_id IS NULL
                       AND author_handle IS NULL AND schema_version=1
                       AND provider_metadata->'redditArchiveComments'->>'deletionStatus'='UNKNOWN'
                       AND provider_metadata->'redditArchiveComments'->>'removalStatus'='UNKNOWN'
                       AND provider_metadata->'redditArchiveComments'->>'acquiredAt'=$6) AS matches
              FROM conversation_units
              WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid
                AND provider_key='reddit' AND provider_unit_id=ANY($3::text[])`,
              scope.tenantId,
              scope.workspaceId,
              providerUnitIds,
              scope.interestId,
              scope.sourceBindingId,
              plan.acquiredAt,
            );
            const baselineRows = await guarded.$queryRawUnsafe<
              readonly { count: number }[]
            >(
              `SELECT COUNT(*)::int AS count FROM conversation_signal_baseline_samples
               WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid
                 AND conversation_unit_id IN (
                   SELECT id FROM conversation_units
                   WHERE tenant_id=$1::uuid AND workspace_id=$2::uuid
                     AND provider_key='reddit' AND provider_unit_id=ANY($3::text[]))`,
              scope.tenantId,
              scope.workspaceId,
              providerUnitIds,
            );
            need(
              rows.length === 2 &&
                new Set(rows.map((row) => row.providerUnitId)).size === 2 &&
                [...rows].every((row) => {
                  const candidate = plan.candidates.find(
                    (unit) => unit.providerUnitId === row.providerUnitId,
                  );
                  return (
                    candidate !== undefined && row.matches === true &&
                    row.feedItemId === parent?.feedItemId &&
                    row.publishedAt.getTime() === candidate.publishedAt.getTime() &&
                    row.observedAt.getTime() === writeObservedAt?.getTime() &&
                    row.rawSha256 === plan.rawSha256 &&
                    row.body === candidate.body && row.canonicalUrl === candidate.canonicalUrl &&
                    isDeepStrictEqual(row.providerMetadata, candidate.metadata)
                  );
                }) &&
                baselineRows.length === 1 &&
                baselineRows[0]?.count === 0,
              baselineRows[0]?.count !== 0
                ? 'Unexpected archived comment baseline behavior'
                : 'Reddit archive comment readback uncertain',
            );
            return rows.length;
          },
        };
        return work(writes);
      },
      {
        isolationLevel: 'Serializable',
        maxWait: 5000,
        timeout: 120000,
      },
    );
  },
});
