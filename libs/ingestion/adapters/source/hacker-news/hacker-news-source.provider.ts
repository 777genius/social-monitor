import { redactSensitiveText } from "@social-monitor/shared-kernel";

import type {
  ProviderFailure,
  SourceCapabilityProfile,
  SourceProviderPort,
  SourceProviderScanContext,
  SourceProviderScanPlan,
  SourceProviderScanResult,
  SourceProviderValidationResult,
  SourceQuery,
} from "../../../ports";
import type {
  HackerNewsClientPort,
  HackerNewsListing,
  HackerNewsStory,
} from "./hacker-news-client.port";

const capabilityProfile: SourceCapabilityProfile = {
  providerKey: "hacker-news",
  displayName: "Hacker News",
  version: 1,
  productionSafe: true,
  supportedContentUnits: ["post", "comment", "link"],
  supportedQueryModes: ["search", "listing"],
  cursorModel: "time",
  stableIdentity: ["providerId", "canonicalUrl"],
  quotaModel: "per_app",
  limitations: [
    "Uses public HN Firebase listings and HN Algolia search; no credentials required. Rate-limit and retry budget still apply.",
  ],
};

const supportedListings: readonly HackerNewsListing[] = [
  "top",
  "new",
  "best",
  "ask",
  "show",
  "job",
];

export class HackerNewsSourceProvider implements SourceProviderPort {
  constructor(private readonly client: HackerNewsClientPort) {}

  key(): string {
    return capabilityProfile.providerKey;
  }

  capabilityProfile(): SourceCapabilityProfile {
    return capabilityProfile;
  }

  validateBinding(query: SourceQuery): SourceProviderValidationResult {
    if (!capabilityProfile.supportedQueryModes.includes(query.mode)) {
      return { ok: false, reason: `Unsupported query mode: ${query.mode}` };
    }

    if (query.query.trim().length === 0) {
      return { ok: false, reason: "Query must be non-empty" };
    }

    if (
      query.mode === "listing" &&
      !supportedListings.includes(query.query as HackerNewsListing)
    ) {
      return {
        ok: false,
        reason: `Unsupported Hacker News listing: ${query.query}`,
      };
    }

    return { ok: true };
  }

  planScan(
    query: SourceQuery,
    context: SourceProviderScanContext,
  ): SourceProviderScanPlan {
    return {
      query,
      maxItems: readPositiveInteger(context.config?.maxItems, 30, 1, 100),
    };
  }

  async scan(
    plan: SourceProviderScanPlan,
    context: SourceProviderScanContext,
  ): Promise<SourceProviderScanResult> {
    void context;

    const stories =
      plan.query.mode === "listing"
        ? await this.client.listStories(
            plan.query.query as HackerNewsListing,
            plan.maxItems,
          )
        : await this.client.searchStories(plan.query.query, plan.maxItems);
    const cursorTime = decodeTimeCursor(plan.cursor);
    const sourceKey =
      plan.query.mode === "listing" ? plan.query.query : "search";
    const searchQuery =
      plan.query.mode === "search" ? plan.query.query : undefined;
    const items = stories
      .flatMap((story) => normalizeStory(story, sourceKey, searchQuery))
      .filter(
        (item) =>
          cursorTime === undefined || item.publishedAt.getTime() > cursorTime,
      );

    return {
      items,
      nextCursor: encodeTimeCursor(items, plan.cursor),
      warnings: hackerNewsWarnings(stories),
    };
  }

  classifyError(error: unknown): ProviderFailure {
    const rawMessage =
      error instanceof Error
        ? error.message
        : "Unknown Hacker News provider error";
    const message = redactSensitiveText(rawMessage);
    if (
      rawMessage.includes("429") ||
      rawMessage.toLowerCase().includes("rate limit")
    ) {
      return {
        kind: "rate_limited",
        retryable: true,
        message,
      };
    }

    return {
      kind: "unavailable",
      retryable: true,
      message,
    };
  }
}

const decodeTimeCursor = (cursor: string | undefined): number | undefined => {
  if (cursor === undefined) {
    return undefined;
  }

  const parsed = Date.parse(cursor);

  return Number.isNaN(parsed) ? undefined : parsed;
};

const encodeTimeCursor = (
  items: readonly { readonly publishedAt: Date }[],
  previousCursor: string | undefined,
): string | undefined => {
  const previousTime = decodeTimeCursor(previousCursor);
  const maxPublishedAt = items.reduce(
    (max, item) => Math.max(max, item.publishedAt.getTime()),
    previousTime ?? Number.NEGATIVE_INFINITY,
  );

  if (
    maxPublishedAt === Number.NEGATIVE_INFINITY ||
    maxPublishedAt === previousTime
  ) {
    return previousCursor;
  }

  return new Date(maxPublishedAt).toISOString();
};

const normalizeStory = (
  story: HackerNewsStory,
  sourceKey: string,
  searchQuery: string | undefined,
) => {
  if (story.deleted || story.dead || story.title === undefined) {
    return [];
  }

  const publishedAt = publishedAtForStory(story);

  if (publishedAt === undefined) {
    return [];
  }

  const discussionUrl = `https://news.ycombinator.com/item?id=${story.id}`;

  return [
    {
      externalId: `hn:${story.id}`,
      canonicalUrl: discussionUrl,
      title: story.title,
      body: story.text ?? "",
      authorHandle: story.by,
      publishedAt,
      metadata: hackerNewsStoryMetadata(story, sourceKey, searchQuery),
    },
  ];
};

const hackerNewsWarnings = (
  stories: readonly HackerNewsStory[],
): readonly string[] => [
  ...(stories.some((story) => story.deleted || story.dead)
    ? ["Some Hacker News stories were deleted/dead and skipped."]
    : []),
  ...(stories.some(isTimestampMissingCandidate)
    ? [
        "Some Hacker News stories had no valid time timestamp; they were skipped.",
      ]
    : []),
];

const isTimestampMissingCandidate = (story: HackerNewsStory): boolean =>
  !story.deleted &&
  !story.dead &&
  story.title !== undefined &&
  publishedAtForStory(story) === undefined;

const publishedAtForStory = (story: HackerNewsStory): Date | undefined => {
  if (
    story.time === undefined ||
    !Number.isFinite(story.time) ||
    story.time <= 0
  ) {
    return undefined;
  }

  const publishedAt = new Date(story.time * 1000);

  return Number.isNaN(publishedAt.getTime()) ? undefined : publishedAt;
};

const hackerNewsStoryMetadata = (
  story: HackerNewsStory,
  sourceKey: string,
  searchQuery: string | undefined,
) => ({
  kind: "hacker_news_story",
  source: sourceKey,
  ...(searchQuery === undefined ? {} : { searchQuery }),
  ...(story.url === undefined ? {} : { externalUrl: story.url }),
  ...(story.score === undefined ? {} : { points: story.score }),
  ...(story.comments === undefined ? {} : { comments: story.comments }),
});

const readPositiveInteger = (
  value: unknown,
  fallback: number,
  min: number,
  max: number,
): number => {
  if (value === undefined) {
    return fallback;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < min ||
    value > max
  ) {
    throw new Error(
      `Hacker News source config integer must be between ${min} and ${max}`,
    );
  }

  return value;
};
