import { tenantId, workspaceId } from '@social-monitor/shared-kernel';

import type { AutoSummaryCandidate, AutoSummaryCandidateRepositoryPort } from '../../../ports';
import type { PrismaSummaryClient } from './prisma-summary-client';

type AutoSummaryCandidateRow = {
  readonly tenant_id: string;
  readonly workspace_id: string;
  readonly interest_id: string;
  readonly latest_feed_item_observed_at: Date;
  readonly new_feed_item_count: number;
  readonly latest_summary_requested_at: Date | null;
};

export class PrismaAutoSummaryCandidateRepository implements AutoSummaryCandidateRepositoryPort {
  constructor(private readonly prisma: PrismaSummaryClient) {}

  async findDueCandidates(
    params: Parameters<AutoSummaryCandidateRepositoryPort['findDueCandidates']>[0],
  ): Promise<readonly AutoSummaryCandidate[]> {
    const tenantScope = params.tenantId ?? null;
    const workspaceScope = params.workspaceId ?? null;
    const rows = await this.prisma.$queryRaw<AutoSummaryCandidateRow[]>`
      with latest_summary as (
        select
          tenant_id,
          workspace_id,
          interest_id,
          max(requested_at) as latest_summary_requested_at
        from summary_jobs
        where user_id is null
          and subscription_id is null
        group by tenant_id, workspace_id, interest_id
      )
      select
        p.tenant_id,
        p.workspace_id,
        p.interest_id,
        max(f.observed_at) as latest_feed_item_observed_at,
        count(f.id) filter (
          where ls.latest_summary_requested_at is null
             or f.observed_at > ls.latest_summary_requested_at
        )::int as new_feed_item_count,
        ls.latest_summary_requested_at
      from summary_policies p
      join interests t
        on t.tenant_id = p.tenant_id
       and t.workspace_id = p.workspace_id
       and t.id = p.interest_id
      join feed_items f
        on f.tenant_id = p.tenant_id
       and f.workspace_id = p.workspace_id
       and f.interest_id = p.interest_id
       and f.status = 'VISIBLE'
       and f.observed_at <= ${params.latestFeedItemObservedBefore}
      left join latest_summary ls
        on ls.tenant_id = p.tenant_id
       and ls.workspace_id = p.workspace_id
       and ls.interest_id = p.interest_id
      where t.status = 'ENABLED'
        and t.deleted_at is null
        and (${tenantScope}::uuid is null or p.tenant_id = ${tenantScope}::uuid)
        and (${workspaceScope}::uuid is null or p.workspace_id = ${workspaceScope}::uuid)
      group by p.tenant_id, p.workspace_id, p.interest_id, ls.latest_summary_requested_at
      having count(f.id) filter (
        where ls.latest_summary_requested_at is null
           or f.observed_at > ls.latest_summary_requested_at
      ) > 0
      order by max(f.observed_at) asc, p.interest_id asc
      limit ${params.limit}
    `;

    return rows.map((row): AutoSummaryCandidate => ({
      tenantId: tenantId(row.tenant_id),
      workspaceId: workspaceId(row.workspace_id),
      interestId: row.interest_id,
      latestFeedItemObservedAt: row.latest_feed_item_observed_at,
      newFeedItemCount: Number(row.new_feed_item_count),
      latestSummaryRequestedAt: row.latest_summary_requested_at ?? undefined,
    }));
  }
}
