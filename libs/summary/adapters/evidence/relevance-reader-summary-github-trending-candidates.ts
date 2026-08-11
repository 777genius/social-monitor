import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";
import type {
  SourceContentQualityPolicy,
  SourceContentSafetyPolicy,
} from "@social-monitor/relevance/domain";
import type { Clock } from "@social-monitor/shared-kernel";

import type { SummaryEvidenceItem } from "../../domain";
import type { ReaderSummaryEvidenceSelectorPort } from "../../ports";
import {
  inclusiveObservedBefore,
  mapSupplementFeedItem,
} from "./relevance-reader-summary-evidence-support";

export const withGitHubTrendingCandidates = async (params: {
  readonly query: Parameters<ReaderSummaryEvidenceSelectorPort["select"]>[0];
  readonly rankedItems: readonly SummaryEvidenceItem[];
  readonly feedItems: FeedItemReadRepositoryPort;
  readonly qualityPolicy: SourceContentQualityPolicy;
  readonly safetyPolicy: SourceContentSafetyPolicy;
  readonly clock: Clock;
}): Promise<readonly SummaryEvidenceItem[]> => {
  const itemsById = new Map(
    params.rankedItems.map((item) => [item.feedItemId, item] as const),
  );
  let cursor: string | undefined;
  do {
    const page = await params.feedItems.list({
      tenantId: params.query.tenantId,
      workspaceId: params.query.workspaceId,
      interestId:
        params.query.scope.type === "interest"
          ? params.query.scope.interestId
          : undefined,
      providerKey: "github-trending-page",
      publishedAtOrAfter: params.query.period.startedAt,
      publishedBefore: params.query.period.endedAt,
      observedBefore:
        params.query.observedThrough === undefined
          ? undefined
          : inclusiveObservedBefore(params.query.observedThrough),
      limit: 100,
      cursor,
    });
    for (const feedItem of page.items) {
      const snapshot = feedItem.toSnapshot();
      if (itemsById.has(snapshot.id)) {
        continue;
      }
      itemsById.set(
        snapshot.id,
        mapSupplementFeedItem({
          snapshot,
          qualityPolicy: params.qualityPolicy,
          safetyPolicy: params.safetyPolicy,
          now: params.clock.now(),
        }),
      );
    }
    cursor = page.nextCursor;
  } while (cursor !== undefined);

  return [...itemsById.values()];
};
