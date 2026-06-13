import type { FeedItemReadRepositoryPort } from '@social-monitor/feed/ports';
import type { Clock } from '@social-monitor/shared-kernel';

import type { SummaryFreshness, SummaryFreshnessPort } from '../../ports';

export class FeedSummaryFreshnessProbe implements SummaryFreshnessPort {
  constructor(
    private readonly feedItems: FeedItemReadRepositoryPort,
    private readonly clock: Clock,
  ) {}

  async evaluate(params: Parameters<SummaryFreshnessPort['evaluate']>[0]): Promise<SummaryFreshness> {
    const result = await this.feedItems.list({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      topicId: params.topicId,
      observedAfter: params.sourceWindow.endedAt,
      limit: 1,
    });
    const newest = result.items[0];
    const checkedAt = this.clock.now();

    if (newest === undefined) {
      return {
        status: 'fresh',
        checkedAt,
      };
    }

    const snapshot = newest.toSnapshot();

    return {
      status: 'stale',
      checkedAt,
      staleMarkedAt: checkedAt,
      reason: 'new_evidence_after_window',
      newestFeedItemId: snapshot.id,
      newestObservedAt: snapshot.observedAt,
    };
  }
}
