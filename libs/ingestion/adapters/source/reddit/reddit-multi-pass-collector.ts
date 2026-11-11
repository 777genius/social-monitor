import { rankSourceItems, type SourceItemRankingPlan } from '../../../domain';
import type { SourceProviderScanPlan, SourceProviderScanResult, SourceProviderScanContext } from '../../../ports';
import { redditCapabilityProfile } from './reddit-capability-profile';
import type { RedditClientPort, RedditListingPage } from './reddit-client.port';
import {
  fetchSelectedRedditCandidateComments,
  selectedCommentExpansionForPass,
  withMergedRedditCommentExpansion,
  type RedditScanCandidate,
} from './reddit-selected-comment-enrichment';
import {
  compactUnique,
  filterPostsByAllowedSubreddits,
  normalizePost,
  redditWarnings,
  type RedditScanPass,
} from './reddit-source-support';
import {
  formatScanPassWarning,
  isInsideTargetPublishedWindow,
  pageTargetWindowStats,
  readTargetPublishedWindow,
  redditScanPassLabel,
  redditTopTimeForTargetWindow,
  shouldContinuePastEmptyTargetWindowPage,
  sourceQueryLaneForPass,
} from './reddit-source-window-and-lanes';
import { readAdaptivePaginationPolicy } from '../adaptive-source-pagination';

/** Multi-lane retrieval, pagination, dedupe and comment hydration under one provider scan. */
export async function collectRedditScanPasses(client: RedditClientPort, params: {
  readonly accessToken: string;
  readonly userAgent: string | undefined;
  readonly plan: SourceProviderScanPlan;
  readonly passes: readonly RedditScanPass[];
  readonly fallbackMinScore: number | undefined;
  readonly fallbackIncludeComments: boolean;
  readonly maxCommentedPosts: number | undefined;
  readonly fallbackMaxCommentsPerPost: number | undefined;
  readonly fallbackCommentDepth: number;
  readonly fallbackCommentSort: NonNullable<RedditScanPass["commentSort"]>;
  readonly rankingPlan: SourceItemRankingPlan;
  readonly config: SourceProviderScanContext["config"];
}): Promise<SourceProviderScanResult> {
  const perPassFallbackLimit = Math.max(
    1,
    Math.ceil(params.plan.maxItems / params.passes.length),
  );
  const pagination = readAdaptivePaginationPolicy({
    config: params.config,
    cursorModel: redditCapabilityProfile.cursorModel,
    firstPageLimit: params.plan.maxItems,
  });
  const paginationPolicy = pagination.enabled ? pagination.policy : undefined;
  const targetPublishedWindow = readTargetPublishedWindow(params.config);
  const observedAt = targetPublishedWindow?.observedAt;
  const openWindow = targetPublishedWindow !== undefined && observedAt !== undefined &&
    targetPublishedWindow.startInclusive <= observedAt && observedAt < targetPublishedWindow.endExclusive;
  const candidatesByExternalId = new Map<string, RedditScanCandidate>();
  const warnings: string[] = [];
  let failedPasses = 0;
  let incompleteScan = false;
  let firstFailure: unknown;

  for (const pass of params.passes) {
    const limit = pass.maxItems ?? perPassFallbackLimit;
    const minScore = pass.minScore ?? params.fallbackMinScore;
    const commentExpansion = selectedCommentExpansionForPass({
      pass,
      fallbackIncludeComments: params.fallbackIncludeComments,
      fallbackMaxCommentsPerPost: params.fallbackMaxCommentsPerPost,
      fallbackCommentDepth: params.fallbackCommentDepth,
      fallbackCommentSort: params.fallbackCommentSort,
      minScore,
    });
    let cursor: string | undefined;
    let pageCount = 0;
    let passNewItemCount = 0;
    let duplicateItemCount = 0;
    const maxPages = paginationPolicy?.maxPages ?? 1;

    for (let pageIndex = 0; pageIndex < maxPages; pageIndex += 1) {
      let page: RedditListingPage;

      try {
        page =
          pass.mode === "listing"
            ? await client.listSubredditPosts({
                accessToken: params.accessToken,
                userAgent: params.userAgent,
                subreddit: pass.subreddit,
                listing: pass.listing,
                ...(pass.listing === "top"
                  ? {
                      topTime: redditTopTimeForTargetWindow(
                        pass.topTime ?? "day",
                        targetPublishedWindow,
                      ),
                    }
                  : {}),
                limit,
                after: cursor,
              })
            : await client.searchPosts({
                accessToken: params.accessToken,
                userAgent: params.userAgent,
                query: pass.query,
                sort: pass.searchSort,
                time: pass.searchTime,
                limit,
                after: cursor,
              });
      } catch (error) {
        incompleteScan = true;
        firstFailure ??= error;
        if (pageIndex === 0) {
          failedPasses += 1;
        }

        warnings.push(formatScanPassWarning(pass, error));
        break;
      }

      pageCount += 1;
      let pageNewItemCount = 0;
      let pageDuplicateItemCount = 0;
      const posts =
        pass.mode === "search"
          ? filterPostsByAllowedSubreddits(page.posts, pass.allowedSubreddits)
          : page.posts;
      const windowStats = pageTargetWindowStats(posts, targetPublishedWindow);

      for (const post of posts) {
        if (passNewItemCount >= limit) {
          break;
        }

        for (const item of normalizePost(
          post,
          minScore,
          sourceQueryLaneForPass(pass, limit),
        )) {
          if (!isInsideTargetPublishedWindow(item, targetPublishedWindow)) {
            continue;
          }

          if (passNewItemCount >= limit) {
            break;
          }

          const existing = candidatesByExternalId.get(item.externalId);

          if (existing === undefined) {
            candidatesByExternalId.set(item.externalId, {
              item,
              post,
              ...(commentExpansion === undefined ? {} : { commentExpansion }),
            });
            pageNewItemCount += 1;
            passNewItemCount += 1;
            continue;
          }

          duplicateItemCount += 1;
          pageDuplicateItemCount += 1;
          candidatesByExternalId.set(
            item.externalId,
            withMergedRedditCommentExpansion(existing, commentExpansion),
          );
        }
      }

      warnings.push(...redditWarnings(posts, minScore));
      if (paginationPolicy === undefined || passNewItemCount >= limit) {
        break;
      }

      const nextCursor = page.after;
      if (nextCursor === undefined || nextCursor === cursor) {
        break;
      }

      if (
        shouldContinuePastEmptyTargetWindowPage({
          pageNewItemCount,
          pageDuplicateItemCount,
          windowStats,
        })
      ) {
        cursor = nextCursor;
        continue;
      }

      const pageItemCount = pageNewItemCount + pageDuplicateItemCount;
      const duplicateRate =
        pageItemCount === 0 ? 0 : pageDuplicateItemCount / pageItemCount;
      if (pageNewItemCount < paginationPolicy.minNewItemsPerPage) {
        break;
      }

      if (duplicateRate > paginationPolicy.maxDuplicateRate) {
        break;
      }

      cursor = nextCursor;
    }

    if (paginationPolicy !== undefined && pageCount > 1) {
      warnings.push(
        [
          "reddit_adaptive_pagination.stats",
          `pass=${redditScanPassLabel(pass)}`,
          `pages=${pageCount}`,
          `items=${passNewItemCount}`,
          `duplicates=${duplicateItemCount}`,
        ].join(";"),
      );
    }
  }

  // Retry incomplete historical windows; expose partial live scans as incomplete.
  if (firstFailure !== undefined &&
      ((targetPublishedWindow !== undefined && !openWindow) || failedPasses === params.passes.length)) {
    throw firstFailure;
  }

  const rankedItems = rankSourceItems(
    [...candidatesByExternalId.values()].map((candidate) => candidate.item),
    params.rankingPlan,
  ).slice(0, params.plan.maxItems);
  const rankedCandidates = rankedItems.flatMap((item) => {
    const candidate = candidatesByExternalId.get(item.externalId);

    return candidate === undefined ? [] : [candidate];
  });
  const conversationResult = await fetchSelectedRedditCandidateComments({
    client: client,
    accessToken: params.accessToken,
    userAgent: params.userAgent,
    candidates: rankedCandidates.slice(
      0,
      params.maxCommentedPosts ?? rankedCandidates.length,
    ),
  });

  return {
    items: rankedItems,
    conversationUnits: conversationResult.conversationUnits,
    ...(incompleteScan ? { collection: { complete: false, backfillPending: true } } : {}),
    warnings: compactUnique([...warnings, ...conversationResult.warnings]),
  };
}
