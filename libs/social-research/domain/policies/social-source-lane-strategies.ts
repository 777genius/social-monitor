import type {
  NormalizedSocialAccountRef,
  NormalizedSocialCommunityRef,
  SocialSourceKey,
} from '../value-objects/social-search-intent';
import type {
  SocialSearchLane,
  SocialSourceBudget,
} from '../value-objects/social-search-plan';
import type { SocialCompiledQueryPlan } from './social-query-strategy';
import { lane } from './social-search-lane-factory';

export type SocialSourceLaneStrategyContext = {
  readonly sourceKey: SocialSourceKey;
  readonly topic: string;
  readonly queryPlan: SocialCompiledQueryPlan;
  readonly handles: readonly NormalizedSocialAccountRef[];
  readonly communities: readonly NormalizedSocialCommunityRef[];
  readonly budget: SocialSourceBudget;
};

export type SocialSourceLaneStrategy = {
  readonly strategyId: string;
  readonly supports: (sourceKey: SocialSourceKey) => boolean;
  readonly buildLanes: (
    params: SocialSourceLaneStrategyContext,
  ) => readonly SocialSearchLane[];
};

export const buildSourceLanes = (params: {
  readonly sourceKey: SocialSourceKey;
  readonly topic: string;
  readonly handles: readonly NormalizedSocialAccountRef[];
  readonly communities: readonly NormalizedSocialCommunityRef[];
  readonly queryPlan: SocialCompiledQueryPlan;
  readonly budget: SocialSourceBudget;
  readonly strategies?: readonly SocialSourceLaneStrategy[];
}): readonly SocialSearchLane[] => {
  const lanes: SocialSearchLane[] = params.queryPlan.lanes.map((queryLane) =>
    lane({
      sourceKey: params.sourceKey,
      kind: queryLane.kind,
      operation: queryLane.operation,
      query: queryLane.query,
      priority: queryLane.priority,
      maxItems: maxItemsForQueryLane(queryLane, params.budget),
      reason: queryLane.reason,
    }),
  );

  const strategy = findSourceLaneStrategy(
    params.sourceKey,
    params.strategies ?? builtInSocialSourceLaneStrategies,
  );

  if (strategy !== undefined) {
    lanes.push(
      ...strategy.buildLanes({
        sourceKey: params.sourceKey,
        topic: params.topic,
        queryPlan: params.queryPlan,
        handles: params.handles,
        communities: params.communities,
        budget: params.budget,
      }),
    );
  }

  return lanes.sort((left, right) => right.priority - left.priority);
};

export const findSourceLaneStrategy = (
  sourceKey: SocialSourceKey,
  strategies: readonly SocialSourceLaneStrategy[] = builtInSocialSourceLaneStrategies,
): SocialSourceLaneStrategy | undefined =>
  strategies.find((strategy) => strategy.supports(sourceKey));

export const hasSourceLaneStrategy = (
  sourceKey: SocialSourceKey,
  strategies?: readonly SocialSourceLaneStrategy[],
): boolean => findSourceLaneStrategy(sourceKey, strategies) !== undefined;

const accountLanes = (
  params: SocialSourceLaneStrategyContext,
): readonly SocialSearchLane[] =>
  params.handles
    .filter((handle) => matchesSource(handle.sourceKey, params.sourceKey))
    .flatMap((handle) => {
      const lanes: SocialSearchLane[] = [];
      if (handle.includePosts) {
        lanes.push(
          lane({
            sourceKey: params.sourceKey,
            kind: 'account_posts',
            operation: 'account_feed',
            query: `from:${handle.handle}`,
            priority: 95,
            maxItems: params.budget.maxItemsPerLane,
            reason: 'official account lane, ranked against the topic',
            parameters: { topicForRanking: params.topic },
          }),
        );
      }
      if (handle.includeMentions) {
        lanes.push(
          lane({
            sourceKey: params.sourceKey,
            kind: 'account_mentions',
            operation: 'mention_search',
            query: `@${handle.handle}`,
            priority: 85,
            maxItems: params.budget.maxItemsPerLane,
            reason: 'public mention lane around an account or product handle',
            parameters: { topicForRanking: params.topic },
          }),
        );
      }

      return lanes;
    });

const redditLanes = (
  params: SocialSourceLaneStrategyContext,
): readonly SocialSearchLane[] => {
  const searchVariantLanes = [
    lane({
      sourceKey: params.sourceKey,
      kind: 'search_variant',
      operation: 'search',
      query: params.topic,
      priority: 86,
      maxItems: Math.max(10, Math.floor(params.budget.maxItemsPerLane / 2)),
      reason: 'weekly high-engagement Reddit search pass',
      idSuffix: 'top-week',
      parameters: { searchSort: 'top', searchTime: 'week' },
    }),
  ];
  const listingLanes = params.communities
    .filter((community) => matchesSource(community.sourceKey, params.sourceKey))
    .flatMap((community) =>
      community.listings.map((listing) =>
        lane({
          sourceKey: params.sourceKey,
          kind: 'community_listing',
          operation: 'listing',
          query: `${community.name}:${listing}`,
          priority: listingPriority(listing),
          maxItems: params.budget.maxItemsPerLane,
          reason: `${community.name} ${listing} listing lane`,
          parameters: listing === 'top' ? { topTime: 'week' } : undefined,
        }),
      ),
    );

  if (!params.budget.includeEnrichment) {
    return [...searchVariantLanes, ...listingLanes];
  }

  return [
    ...searchVariantLanes,
    ...listingLanes,
    lane({
      sourceKey: params.sourceKey,
      kind: 'thread_enrichment',
      operation: 'enrichment',
      query: params.topic,
      priority: 84,
      maxItems: 10,
      budgetWeight: 2,
      reason: 'fetch comments only for top selected posts',
      parameters: { maxCommentsPerPost: 20, commentSort: 'top' },
    }),
  ];
};

const youtubeLanes = (
  params: SocialSourceLaneStrategyContext,
): readonly SocialSearchLane[] =>
  params.budget.includeEnrichment
    ? [
        lane({
          sourceKey: params.sourceKey,
          kind: 'transcript_enrichment',
          operation: 'enrichment',
          query: params.topic,
          priority: 35,
          maxItems: 8,
          budgetWeight: 3,
          reason: 'best-effort transcript enrichment for top selected videos',
          parameters: { transcriptMode: 'best_effort' },
        }),
      ]
    : [];

export const builtInSocialSourceLaneStrategies: readonly SocialSourceLaneStrategy[] =
  [
    {
      strategyId: 'account-posts-and-mentions',
      supports: (sourceKey) =>
        sourceKey === 'x-twitter' || sourceKey === 'bluesky',
      buildLanes: accountLanes,
    },
    {
      strategyId: 'reddit-community-listings',
      supports: (sourceKey) => sourceKey === 'reddit',
      buildLanes: redditLanes,
    },
    {
      strategyId: 'youtube-transcript-enrichment',
      supports: (sourceKey) => sourceKey === 'youtube',
      buildLanes: youtubeLanes,
    },
  ];

const matchesSource = (
  configuredSource: SocialSourceKey | undefined,
  sourceKey: SocialSourceKey,
): boolean => configuredSource === undefined || configuredSource === sourceKey;

const listingPriority = (listing: string): number => {
  if (listing === 'top') {
    return 88;
  }
  if (listing === 'hot') {
    return 72;
  }

  return 68;
};

const maxItemsForQueryLane = (
  queryLane: SocialCompiledQueryPlan['lanes'][number],
  budget: SocialSourceBudget,
): number =>
  queryLane.maxItemsPolicy === 'fallback_half_min_10'
    ? Math.max(10, Math.floor(budget.maxItemsPerLane / 2))
    : budget.maxItemsPerLane;
