import type { FeedItemReadRepositoryPort } from "@social-monitor/feed/ports";

import type {
  CountReaderSummaryCollectedFeedItemsQuery,
  ReaderSummaryCollectedFeedItemCoverage,
  ReaderSummaryCoverageCounterPort,
} from "../../ports";
import { isDefaultReaderSummaryEvidenceProvider } from "./reader-summary-evidence-provider-filter";

const PAGE_LIMIT = 100;
const MAX_PAGES = 1000;

export class FeedReaderSummaryCoverageCounter implements ReaderSummaryCoverageCounterPort {
  constructor(private readonly feedItems: FeedItemReadRepositoryPort) {}

  async countCollectedFeedItems(
    query: CountReaderSummaryCollectedFeedItemsQuery,
  ): Promise<number | undefined> {
    const coverage = await this.countCollectedFeedItemCoverage(query);
    return coverage?.collectedFeedItemCount;
  }

  async countCollectedFeedItemCoverage(
    query: CountReaderSummaryCollectedFeedItemsQuery,
  ): Promise<ReaderSummaryCollectedFeedItemCoverage | undefined> {
    let cursor: string | undefined;
    let total = 0;
    const providerCounts = new Map<string, number>();

    for (let page = 0; page < MAX_PAGES; page += 1) {
      const result = await this.feedItems.list({
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        interestId:
          query.scope.type === "interest" ? query.scope.interestId : undefined,
        observedAfter: query.period.startedAt,
        observedBefore: query.period.endedAt,
        limit: PAGE_LIMIT,
        cursor,
      });
      for (const item of result.items) {
        const providerKey = item.toSnapshot().providerKey;
        if (!isDefaultReaderSummaryEvidenceProvider(providerKey)) {
          continue;
        }

        total += 1;
        providerCounts.set(
          providerKey,
          (providerCounts.get(providerKey) ?? 0) + 1,
        );
      }

      if (result.nextCursor === undefined) {
        return {
          collectedFeedItemCount: total,
          providerBreakdown: [...providerCounts.entries()]
            .sort((left, right) => {
              const countDiff = right[1] - left[1];
              return countDiff === 0
                ? left[0].localeCompare(right[0])
                : countDiff;
            })
            .map(([providerKey, collectedFeedItemCount]) => ({
              providerKey,
              collectedFeedItemCount,
            })),
        };
      }

      if (result.nextCursor === cursor) {
        return undefined;
      }
      cursor = result.nextCursor;
    }

    return undefined;
  }
}
