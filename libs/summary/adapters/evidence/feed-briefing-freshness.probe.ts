import type { FeedItemReadRepositoryPort } from '@social-monitor/feed/ports';
import type { Clock } from '@social-monitor/shared-kernel';

import type { BriefingFreshness, BriefingFreshnessProbePort } from '../../ports';

export class FeedBriefingFreshnessProbe implements BriefingFreshnessProbePort {
  constructor(
    private readonly feedItems: FeedItemReadRepositoryPort,
    private readonly clock: Clock,
  ) {}

  async evaluate(params: Parameters<BriefingFreshnessProbePort['evaluate']>[0]): Promise<BriefingFreshness> {
    const result = await this.feedItems.list({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      topicId: params.scope.type === 'topic' ? params.scope.topicId : undefined,
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
