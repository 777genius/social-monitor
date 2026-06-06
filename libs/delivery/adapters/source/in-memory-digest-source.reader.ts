import type {
  DigestCandidateFeedItem,
  DigestCandidateSummary,
  DigestSourceReaderPort,
  DigestSourceWindowQuery,
  DigestSourceWindowResult,
} from '../../ports';

export class InMemoryDigestSourceReader implements DigestSourceReaderPort {
  private readonly summaries: DigestCandidateSummary[] = [];
  private readonly feedItems: DigestCandidateFeedItem[] = [];

  addSummary(summary: DigestCandidateSummary): void {
    this.summaries.push(summary);
  }

  addFeedItem(feedItem: DigestCandidateFeedItem): void {
    this.feedItems.push(feedItem);
  }

  async readWindow(query: DigestSourceWindowQuery): Promise<DigestSourceWindowResult> {
    const topicIds = new Set(query.topicIds);

    return {
      summaries: this.summaries
        .filter((summary) => matchesScope(summary, query))
        .filter((summary) => topicIds.has(summary.topicId))
        .filter((summary) => isWithinWindow(summary.sourceWindowEndedAt, query))
        .sort((left, right) => left.summaryId.localeCompare(right.summaryId)),
      feedItems: this.feedItems
        .filter((feedItem) => matchesScope(feedItem, query))
        .filter((feedItem) => topicIds.has(feedItem.topicId))
        .filter((feedItem) => isWithinWindow(feedItem.observedAt, query))
        .sort((left, right) => left.feedItemId.localeCompare(right.feedItemId)),
    };
  }
}

const matchesScope = (
  item: Pick<DigestCandidateSummary, 'tenantId' | 'workspaceId'>,
  query: DigestSourceWindowQuery,
): boolean => item.tenantId === query.tenantId && item.workspaceId === query.workspaceId;

const isWithinWindow = (timestamp: Date, query: DigestSourceWindowQuery): boolean =>
  timestamp.getTime() >= query.startedAt.getTime() && timestamp.getTime() < query.endedAt.getTime();
