import {
  redactSensitiveText,
  type Clock,
} from "@social-monitor/shared-kernel";

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
import {
  hackerNewsRecencyWarnings,
  hackerNewsWarnings,
  normalizeHackerNewsStory,
} from "./hacker-news-item-normalizer";
import {
  compactUnique,
  formatHackerNewsScanPassWarning,
  readScanPasses,
  sourceKeyForPass,
  type HackerNewsScanPass,
} from "./hacker-news-scan-pass-support";

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
  constructor(
    private readonly client: HackerNewsClientPort,
    private readonly clock: Clock,
  ) {}

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
    const scanPasses = readScanPasses(context.config);
    const maxItemAgeHours = readOptionalPositiveInteger(
      context.config?.maxItemAgeHours,
      24 * 31,
    );

    if (scanPasses.length > 0) {
      return this.scanPasses(plan, scanPasses, maxItemAgeHours);
    }

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
      .flatMap((story) => normalizeHackerNewsStory(story, sourceKey, searchQuery))
      .filter(
        (item) =>
          cursorTime === undefined || item.publishedAt.getTime() > cursorTime,
      );
    const filteredItems = filterItemsByMaxAge(
      items,
      maxItemAgeHours,
      this.clock.now(),
    );

    return {
      items: filteredItems,
      nextCursor: encodeTimeCursor(filteredItems, plan.cursor),
      warnings: [
        ...hackerNewsWarnings(stories),
        ...hackerNewsRecencyWarnings(items, filteredItems, maxItemAgeHours),
      ],
    };
  }

  private async scanPasses(
    plan: SourceProviderScanPlan,
    passes: readonly HackerNewsScanPass[],
    maxItemAgeHours: number | undefined,
  ): Promise<SourceProviderScanResult> {
    const perPassFallbackLimit = Math.max(
      1,
      Math.ceil(plan.maxItems / passes.length),
    );
    const itemsByExternalId = new Map<
      string,
      ReturnType<typeof normalizeHackerNewsStory>[number]
    >();
    const warnings: string[] = [];
    let failedPasses = 0;
    let firstFailure: unknown;

    for (const pass of passes) {
      const limit = pass.maxItems ?? perPassFallbackLimit;
      let stories: readonly HackerNewsStory[];

      try {
        if (pass.mode === "listing") {
          stories = await this.client.listStories(pass.listing, limit);
        } else if (pass.target === "comment") {
          stories = await this.client.searchComments(pass.query, limit);
        } else {
          stories = await this.client.searchStories(pass.query, limit);
        }
      } catch (error) {
        firstFailure ??= error;
        failedPasses += 1;
        warnings.push(formatHackerNewsScanPassWarning(pass, error));
        continue;
      }

      const filteredStories = filterStoriesByRequiredStoryKeywords(
        filterStoriesByRequiredKeywords(stories, pass.requiredKeywords),
        pass.requiredStoryKeywords,
      );
      const sourceKey = sourceKeyForPass(pass);
      const searchQuery = pass.mode === "search" ? pass.query : undefined;

      for (const item of filteredStories.flatMap((story) =>
        normalizeHackerNewsStory(story, sourceKey, searchQuery),
      )) {
        if (!itemsByExternalId.has(item.externalId)) {
          itemsByExternalId.set(item.externalId, item);
        }
      }

      warnings.push(...hackerNewsWarnings(filteredStories));
    }

    if (failedPasses === passes.length && firstFailure !== undefined) {
      throw firstFailure;
    }

    const sortedItems = [...itemsByExternalId.values()].sort(
      (left, right) => right.publishedAt.getTime() - left.publishedAt.getTime(),
    );
    const filteredItems = filterItemsByMaxAge(
      sortedItems,
      maxItemAgeHours,
      this.clock.now(),
    );

    return {
      items: filteredItems.slice(0, plan.maxItems),
      warnings: compactUnique([
        ...warnings,
        ...hackerNewsRecencyWarnings(
          sortedItems,
          filteredItems,
          maxItemAgeHours,
        ),
      ]),
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

const filterStoriesByRequiredKeywords = (
  stories: readonly HackerNewsStory[],
  requiredKeywords: readonly string[] | undefined,
): readonly HackerNewsStory[] => {
  if (requiredKeywords === undefined || requiredKeywords.length === 0) {
    return stories;
  }

  const normalizedKeywords = requiredKeywords.map((keyword) =>
    keyword.toLocaleLowerCase("en-US"),
  );

  return stories.filter((story) => {
    const haystack = [story.title, story.storyTitle, story.text, story.url]
      .flatMap((value) => (value === undefined ? [] : [value]))
      .join(" ")
      .toLocaleLowerCase("en-US");

    return normalizedKeywords.some((keyword) => haystack.includes(keyword));
  });
};

const filterStoriesByRequiredStoryKeywords = (
  stories: readonly HackerNewsStory[],
  requiredStoryKeywords: readonly string[] | undefined,
): readonly HackerNewsStory[] => {
  if (
    requiredStoryKeywords === undefined ||
    requiredStoryKeywords.length === 0
  ) {
    return stories;
  }

  const normalizedKeywords = requiredStoryKeywords.map((keyword) =>
    keyword.toLocaleLowerCase("en-US"),
  );

  return stories.filter((story) => {
    const haystack = [story.title, story.storyTitle, story.url]
      .flatMap((value) => (value === undefined ? [] : [value]))
      .join(" ")
      .toLocaleLowerCase("en-US");

    return normalizedKeywords.some((keyword) => haystack.includes(keyword));
  });
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

const filterItemsByMaxAge = <TItem extends { readonly publishedAt: Date }>(
  items: readonly TItem[],
  maxItemAgeHours: number | undefined,
  now: Date,
): readonly TItem[] => {
  if (maxItemAgeHours === undefined) {
    return items;
  }

  const cutoff = now.getTime() - maxItemAgeHours * 60 * 60 * 1000;

  return items.filter((item) => item.publishedAt.getTime() >= cutoff);
};

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

const readOptionalPositiveInteger = (
  value: unknown,
  max: number,
): number | undefined => {
  if (value === undefined) {
    return undefined;
  }

  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 1 ||
    value > max
  ) {
    throw new Error(
      `Hacker News source config integer must be between 1 and ${max}`,
    );
  }

  return value;
};
