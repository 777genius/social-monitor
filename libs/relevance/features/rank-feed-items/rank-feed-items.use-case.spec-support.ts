import { classifyFeedPromotionEligibility, FeedItem } from "@social-monitor/feed/domain";
import type { FeedItemReadRepositoryPort, ListFeedItemsQuery, ListFeedItemsResult, ReadPromotionFeedItemSnapshotQuery } from "@social-monitor/feed/ports";
import type { tenantId, workspaceId, JsonObject } from "@social-monitor/shared-kernel";
import type { UserRelevanceProfile as UserRelevanceProfileEntity } from "../../domain";
import type {
  BuildRelevanceMemoryGuidanceQuery, RelevanceMemoryGuidanceReaderPort,
  RelevanceMemoryGuidanceResult, SourceContentQualityReviewerPort,
  SourceContentQualityReviewRequest, SourceContentQualityReviewResult,
  UserRelevanceProfileRepositoryPort,
} from "../../ports";

export const addFeedItem = (
  repository: FakeFeedItemReadRepository,
  props: {
    readonly id: string;
    readonly tenantId: ReturnType<typeof tenantId>;
    readonly workspaceId: ReturnType<typeof workspaceId>;
    readonly interestId: string;
    readonly providerKey: string;
    readonly title: string;
    readonly bodyPreview: string;
    readonly canonicalUrl: string;
    readonly publishedAt: Date;
    readonly authorHandle?: string;
    readonly observedAt?: Date;
    readonly providerMetadata?: JsonObject;
  },
): void => {
  repository.upsert(
    FeedItem.publish({
      ...props,
      sourceItemId: `${props.id}:source`,
      sourceBindingId: `${props.providerKey}:binding`,
      observedAt:
        props.observedAt ?? new Date(props.publishedAt.getTime() + 60_000),
      authorHandle: props.authorHandle,
      providerMetadata: props.providerMetadata,
    }),
  );
};

export class FakeFeedItemReadRepository implements FeedItemReadRepositoryPort {
  readonly queries: ListFeedItemsQuery[] = [];
  private readonly items: FeedItem[] = [];

  upsert(item: FeedItem): void {
    this.items.push(item);
  }

  async list(query: ListFeedItemsQuery): Promise<ListFeedItemsResult> {
    this.queries.push(query);
    const offset = query.cursor === undefined ? 0 : Number(query.cursor);
    const items = this.items
      .filter((item) => {
        const snapshot = item.toSnapshot();

        return (
          snapshot.tenantId === query.tenantId &&
          snapshot.workspaceId === query.workspaceId &&
          (query.interestId === undefined ||
            snapshot.interestId === query.interestId) &&
          (query.observedAfter === undefined ||
            snapshot.observedAt.getTime() > query.observedAfter.getTime()) &&
          (query.observedBefore === undefined ||
            snapshot.observedAt.getTime() < query.observedBefore.getTime()) &&
          (query.publishedAtOrAfter === undefined ||
            snapshot.publishedAt.getTime() >=
              query.publishedAtOrAfter.getTime()) &&
          (query.publishedBefore === undefined ||
            snapshot.publishedAt.getTime() < query.publishedBefore.getTime())
        );
      })
      .sort(
        (left, right) =>
          right.toSnapshot().publishedAt.getTime() -
          left.toSnapshot().publishedAt.getTime(),
      );
    const records = items.slice(offset, offset + query.limit + 1);
    const page = records.slice(0, query.limit);
    const nextOffset = offset + page.length;

    return {
      items: page,
      nextCursor: records.length === query.limit + 1
        ? String(nextOffset)
        : undefined,
    };
  }

  async readPromotionSnapshot(query: ReadPromotionFeedItemSnapshotQuery) {
    const ordered = [...this.items].filter((item) => {
      const snapshot = item.toSnapshot();
      const timestamp = query.timestampPolicy === "published_at"
        ? snapshot.publishedAt
        : snapshot.observedAt;
      return snapshot.tenantId === query.tenantId &&
        snapshot.workspaceId === query.workspaceId &&
        (query.interestId === undefined ||
          snapshot.interestId === query.interestId) &&
        timestamp >= query.windowStartedAt && timestamp < query.windowEndedAt &&
        snapshot.observedAt <= query.observedThrough;
    }).sort((left, right) => {
      const leftSnapshot = left.toSnapshot();
      const rightSnapshot = right.toSnapshot();
      const leftTimestamp = query.timestampPolicy === "published_at"
        ? leftSnapshot.publishedAt
        : leftSnapshot.observedAt;
      const rightTimestamp = query.timestampPolicy === "published_at"
        ? rightSnapshot.publishedAt
        : rightSnapshot.observedAt;
      return rightTimestamp.getTime() - leftTimestamp.getTime() ||
        rightSnapshot.id.localeCompare(leftSnapshot.id);
    });
    const candidates = ordered.flatMap((item) => {
      const snapshot = item.toSnapshot();
      const canonical = classifyFeedPromotionEligibility({
        providerKey: snapshot.providerKey,
        providerMetadata: snapshot.providerMetadata,
      });
      return canonical.eligible ? [{ item, canonical }] : [];
    });
    if (candidates.length > 1_000) return {
      ok: false as const,
      reason: "eligible_item_ceiling_exceeded" as const,
      physicalRowsRead: ordered.length,
      eligibleItemCount: candidates.length,
      exhausted: true,
    };
    return {
      ok: true as const,
      candidates,
      sourceContent: ordered.map((item) => {
        const snapshot = item.toSnapshot();
        return {
          feedItemId: snapshot.id,
          sourceItemId: snapshot.sourceItemId,
          body: snapshot.bodyPreview,
        };
      }),
      physicalRowsRead: ordered.length,
      exhausted: true as const,
    };
  }

  async findById(): Promise<FeedItem | null> {
    return null;
  }
}

export class FakeUserRelevanceProfileRepository implements UserRelevanceProfileRepositoryPort {
  private readonly profiles = new Map<string, UserRelevanceProfileEntity>();

  async save(profile: UserRelevanceProfileEntity): Promise<void> {
    const snapshot = profile.toSnapshot();
    this.profiles.set(
      `${snapshot.tenantId}:${snapshot.workspaceId}:${snapshot.userId}`,
      profile,
    );
  }

  async findByUser(params: {
    readonly tenantId: string;
    readonly workspaceId: string;
    readonly userId: string;
  }): Promise<UserRelevanceProfileEntity | null> {
    return (
      this.profiles.get(
        `${params.tenantId}:${params.workspaceId}:${params.userId}`,
      ) ?? null
    );
  }
}

export class CapturingMemoryGuidanceReader implements RelevanceMemoryGuidanceReaderPort {
  readonly queries: BuildRelevanceMemoryGuidanceQuery[] = [];

  constructor(private readonly result: RelevanceMemoryGuidanceResult) {}

  async buildGuidance(
    query: BuildRelevanceMemoryGuidanceQuery,
  ): Promise<RelevanceMemoryGuidanceResult> {
    this.queries.push(query);

    return this.result;
  }
}

export class CapturingSourceContentQualityReviewer implements SourceContentQualityReviewerPort {
  readonly requests: SourceContentQualityReviewRequest[] = [];

  constructor(
    private readonly reviews: readonly SourceContentQualityReviewResult[],
  ) {}

  async reviewBatch(
    requests: readonly SourceContentQualityReviewRequest[],
  ): Promise<readonly SourceContentQualityReviewResult[]> {
    this.requests.push(...requests);

    return this.reviews;
  }
}
