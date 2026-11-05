import type { InMemoryFeedItemReadRepository } from "@social-monitor/feed/adapters/persistence/in-memory-feed-item-read.repository";
import type { InMemorySourceItemRepository } from "@social-monitor/ingestion/adapters/persistence/in-memory-source-item.repository";
import { parseGitHubTrendingPageRepositoryMetadata } from "@social-monitor/ingestion/domain/value-objects/github-trending-page";
import { sourceItemContentHash, sourceItemProviderContentHash } from "@social-monitor/ingestion/domain/value-objects/source-item-content-fingerprint";
import type { InMemorySourceBindingRepository } from "@social-monitor/monitoring/adapters/persistence/in-memory-source-binding.repository";
import type { ReaderSummaryGitHubProjectionReaderPort } from "@social-monitor/summary/ports";
import type { ReaderSummaryArtifactProps } from "@social-monitor/summary/domain";

export const hasCompleteCitedGitHubBoard = (snapshot: ReaderSummaryArtifactProps): boolean => {
  const posts = (snapshot.content?.selectedPosts ?? []).filter((post) => post.providerKey === "github-trending-page");
  const citations = new Map(snapshot.citationMap.map((citation) => [citation.citationId, citation]));
  return posts.length === 10 && new Set(posts.map((post) => post.canonicalUrl)).size === 10 &&
    posts.every((post) => post.citationIds.length > 0 && post.citationIds.every((id) => {
      const citation = citations.get(id);
      return citation?.providerKey === "github-trending-page" && citation.canonicalUrl === post.canonicalUrl &&
        snapshot.sourceWindow.selectedFeedItemIds.includes(citation.feedItemId);
    }));
};

/** Reads this smoke's persisted observations; it never fabricates publication bindings. */
export class FixturePersistedGitHubProjectionReader implements ReaderSummaryGitHubProjectionReaderPort {
  constructor(
    private readonly sourceItems: InMemorySourceItemRepository,
    private readonly feedItems: InMemoryFeedItemReadRepository,
    private readonly bindings: InMemorySourceBindingRepository,
    private readonly bindingIds: readonly string[],
  ) {}

  async read(query: Parameters<ReaderSummaryGitHubProjectionReaderPort["read"]>[0]) {
    const startedAt = query.dayStartedAt.getTime();
    const endedAt = query.dayEndedAt.getTime();
    if (!Number.isFinite(startedAt) || !Number.isFinite(endedAt) ||
        !Number.isFinite(query.observedThrough.getTime()) || startedAt % 86_400_000 !== 0 ||
        endedAt !== startedAt + 86_400_000 || query.observedThrough < query.dayStartedAt) {
      throw new Error("GitHub fixture projection requires one exact bounded UTC day");
    }
    // This fixture reads one complete eligibility result, then (if eligible)
    // one complete joined-item result. These are logical repository pages;
    // this does not claim SQL pagination or additional external HTML fetches.
    let pageCount = 1;
    const eligibleBindingIds: string[] = [];
    for (const sourceBindingId of this.bindingIds) {
      const binding = (await this.bindings.findById({ ...query, sourceBindingId }))?.toSnapshot();
      if (binding?.providerKey === "github-trending-page" && binding.status === "enabled" &&
          binding.createdAt < query.dayEndedAt && binding.config.window === "daily") {
        eligibleBindingIds.push(binding.id);
      }
    }
    eligibleBindingIds.sort();
    if (eligibleBindingIds.length === 0) return { eligibleBindingIds, items: [], pageCount };
    pageCount += 1;
    const sourceById = new Map(this.sourceItems.all().map((item) => {
      const source = item.toSnapshot();
      return [source.id, source] as const;
    }));
    const items = this.feedItems.all().flatMap((item) => {
      const feed = item.toSnapshot();
      const source = sourceById.get(feed.sourceItemId);
      if (feed.tenantId !== query.tenantId || feed.workspaceId !== query.workspaceId ||
          feed.providerKey !== "github-trending-page" || !eligibleBindingIds.includes(feed.sourceBindingId) ||
          source?.tenantId !== query.tenantId || source.workspaceId !== query.workspaceId ||
          source.sourceBindingId !== feed.sourceBindingId || source.canonicalUrl !== feed.canonicalUrl ||
          feed.observedAt < query.dayStartedAt || feed.observedAt > query.observedThrough ||
          source.ingestedAt < query.dayStartedAt || source.ingestedAt > query.observedThrough) return [];
      const metadata = parseGitHubTrendingPageRepositoryMetadata(source.metadata);
      if (metadata === null) throw new Error("Persisted GitHub fixture metadata must be canonical");
      return [{
        feedItemId: feed.id, sourceItemId: source.id, sourceBindingId: feed.sourceBindingId,
        providerKey: feed.providerKey, metadataKind: metadata.kind, scanJobId: metadata.trending.scanJobId,
        canonicalUrl: feed.canonicalUrl, repositoryFullName: metadata.repository.fullName,
        rank: metadata.trending.rank, starsGained: metadata.trending.starsGained, window: metadata.trending.window,
        fetchStartedAt: new Date(metadata.trending.fetchStartedAt), checkedAt: new Date(metadata.trending.checkedAt),
        publishedAt: feed.publishedAt, observedAt: feed.observedAt,
        sourceContentHash: sourceItemContentHash(source),
        sourceProviderContentHash: sourceItemProviderContentHash({ providerKey: feed.providerKey, snapshot: source }),
      }];
    });
    return { eligibleBindingIds, items, pageCount };
  }
}
