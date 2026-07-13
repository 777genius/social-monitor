import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import type { Clock } from "@social-monitor/shared-kernel";

import type {
  ReaderSummaryFreshness,
  ReaderSummaryFreshnessProbePort,
} from "../../ports";

export class FeedReaderSummaryFreshnessProbe implements ReaderSummaryFreshnessProbePort {
  constructor(
    private readonly feedItems: FeedItemReadRepositoryPort,
    private readonly clock: Clock,
  ) {}

  async evaluate(
    params: Parameters<ReaderSummaryFreshnessProbePort["evaluate"]>[0],
  ): Promise<ReaderSummaryFreshness> {
    const result = await this.feedItems.list({
      tenantId: params.tenantId,
      workspaceId: params.workspaceId,
      interestId:
        params.scope.type === "interest" ? params.scope.interestId : undefined,
      publishedAtOrAfter: params.period?.startedAt,
      publishedBefore: params.period?.endedAt,
      observedAfter: params.observedThrough ?? params.sourceWindow.endedAt,
      limit: 1,
    });
    const newest = result.items[0];
    const checkedAt = this.clock.now();

    if (newest === undefined) {
      return {
        status: "fresh",
        checkedAt,
      };
    }

    const snapshot = newest.toSnapshot();

    return {
      status: "stale",
      checkedAt,
      staleMarkedAt: checkedAt,
      reason: "new_evidence_after_window",
      newestFeedItemId: snapshot.id,
      newestObservedAt: snapshot.observedAt,
    };
  }
}
