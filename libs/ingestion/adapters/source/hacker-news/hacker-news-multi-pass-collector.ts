import type { Clock } from '@social-monitor/shared-kernel';
import type {
  FetchedConversationUnit,
  FetchedSourceItem,
  SourceProviderScanPlan,
  SourceProviderScanResult,
} from '../../../ports';
import type {
  HackerNewsClientPort,
  HackerNewsSearchOptions,
  HackerNewsStory,
} from './hacker-news-client.port';
import {
  commentExpansionForHackerNewsPass,
  normalizeHackerNewsCommentSearchPass,
  normalizeHackerNewsStoriesWithOptionalComments,
} from './hacker-news-comment-enrichment';
import { hackerNewsRecencyWarnings, hackerNewsWarnings } from './hacker-news-item-normalizer';
import {
  compactUnique,
  formatHackerNewsScanPassWarning,
  sourceKeyForPass,
  type HackerNewsScanPass,
} from './hacker-news-scan-pass-support';
import {
  filterItemsByMaxAge,
  filterStoriesByRequiredKeywords,
  filterStoriesByRequiredStoryKeywords,
  historicalListingSearchQuery,
  isTargetPublishedSearchOptions,
} from './hacker-news-source-window';

/** Multi-lane retrieval and immutable root/comment projection for HN scans. */
export async function collectHackerNewsScanPasses(client: HackerNewsClientPort, clock: Clock, params: {
  readonly plan: SourceProviderScanPlan;
  readonly passes: readonly HackerNewsScanPass[];
  readonly maxItemAgeHours: number | undefined;
  readonly searchOptions: HackerNewsSearchOptions | undefined;
  readonly recencyFilterHours: number | undefined;
  readonly fallbackIncludeComments: boolean;
  readonly fallbackMaxCommentedStories: number | undefined;
  readonly fallbackMaxCommentsPerPost: number | undefined;
  readonly fallbackCommentDepth: number;
  readonly targetWindow: { readonly startInclusive: Date; readonly endExclusive: Date } | undefined;
}): Promise<SourceProviderScanResult> {
  const perPassFallbackLimit = Math.max(
    1,
    Math.ceil(params.plan.maxItems / params.passes.length),
  );
  const itemsByExternalId = new Map<string, FetchedSourceItem>();
  const conversationUnitsByProviderUnitId = new Map<
    string,
    FetchedConversationUnit
  >();
  const rootStoriesById = new Map<number, HackerNewsStory | null>();
  const warnings: string[] = [];
  let failedPasses = 0;
  let firstFailure: unknown;

  for (const pass of params.passes) {
    const limit = pass.maxItems ?? perPassFallbackLimit;
    let stories: readonly HackerNewsStory[];

    try {
      if (
        pass.mode === "listing" &&
        isTargetPublishedSearchOptions(params.searchOptions)
      ) {
        stories = await client.searchStories(
          historicalListingSearchQuery(pass, params.plan.query.query),
          limit,
          params.searchOptions,
        );
      } else if (pass.mode === "listing") {
        stories = await client.listStories(pass.listing, limit);
      } else if (pass.target === "comment") {
        stories = await client.searchComments(
          pass.query,
          limit,
          params.searchOptions,
        );
      } else {
        stories = await client.searchStories(
          pass.query,
          limit,
          params.searchOptions,
        );
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
    if (params.targetWindow !== undefined && filteredStories.length > limit) {
      warnings.push(`Hacker News historical pass incomplete: maxItems exceeded (${sourceKeyForPass(pass)})`);
    }
    const sourceKey = sourceKeyForPass(pass);
    const searchQuery = pass.mode === "search" ? pass.query : undefined;

    if (pass.mode === "search" && pass.target === "comment") {
      const normalized = await normalizeHackerNewsCommentSearchPass({
        client: client,
        rootStoriesById,
        comments: filteredStories,
        sourceKey,
        searchQuery,
        targetWindow: params.targetWindow,
      });

      for (const item of normalized.items) {
        if (!itemsByExternalId.has(item.externalId)) {
          itemsByExternalId.set(item.externalId, item);
        }
      }

      for (const unit of normalized.conversationUnits) {
        if (!conversationUnitsByProviderUnitId.has(unit.providerUnitId)) {
          conversationUnitsByProviderUnitId.set(unit.providerUnitId, unit);
        }
      }

      warnings.push(...normalized.warnings);
      warnings.push(...hackerNewsWarnings(filteredStories));
      continue;
    }

    const expansion = commentExpansionForHackerNewsPass({
      pass,
      fallbackIncludeComments: params.fallbackIncludeComments,
      fallbackMaxCommentedStories: params.fallbackMaxCommentedStories,
      fallbackMaxCommentsPerPost: params.fallbackMaxCommentsPerPost,
      fallbackCommentDepth: params.fallbackCommentDepth,
    });
    const normalized = await normalizeHackerNewsStoriesWithOptionalComments({
      client: client,
      stories: filteredStories,
      sourceKey,
      searchQuery,
      includeComments: expansion !== undefined,
      maxCommentedStories: expansion?.maxCommentedStories,
      maxCommentsPerPost: expansion?.maxCommentsPerPost,
      commentDepth: expansion?.commentDepth ?? params.fallbackCommentDepth,
      targetWindow: params.targetWindow,
    });

    for (const item of normalized.items) {
      if (!itemsByExternalId.has(item.externalId)) {
        itemsByExternalId.set(item.externalId, item);
      }
    }

    for (const unit of normalized.conversationUnits) {
      if (!conversationUnitsByProviderUnitId.has(unit.providerUnitId)) {
        conversationUnitsByProviderUnitId.set(unit.providerUnitId, unit);
      }
    }

    warnings.push(...normalized.warnings);
    warnings.push(...hackerNewsWarnings(filteredStories));
  }

  if (failedPasses === params.passes.length && firstFailure !== undefined) {
    throw firstFailure;
  }

  const sortedItems = [...itemsByExternalId.values()].sort(
    (left, right) => right.publishedAt.getTime() - left.publishedAt.getTime(),
  );
  const filteredItems = filterItemsByMaxAge(
    sortedItems,
    params.recencyFilterHours,
    clock.now(),
  );
  const returnedRootExternalIds = new Set(
    filteredItems
      .slice(0, params.plan.maxItems)
      .map((item) => item.externalId),
  );
  if (params.targetWindow !== undefined && filteredItems.length > params.plan.maxItems) {
    warnings.push("Hacker News historical scan incomplete: maxItems exceeded");
  }

  return {
    items: filteredItems.slice(0, params.plan.maxItems),
    conversationUnits: [...conversationUnitsByProviderUnitId.values()].filter(
      (unit) => returnedRootExternalIds.has(unit.rootExternalId),
    ),
    warnings: compactUnique([
      ...warnings,
      ...hackerNewsRecencyWarnings(
        sortedItems,
        filteredItems,
        params.recencyFilterHours,
      ),
    ]),
  };
}
