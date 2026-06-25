import {
  type FeedItem,
  feedProviderMetricsFromMetadata,
  feedProviderMetricStrength,
} from '@social-monitor/feed/domain';
import type { FeedItemReadRepositoryPort } from '@social-monitor/feed/ports';
import {
  type Clock,
  DomainError,
  err,
  ok,
  type Result,
} from '@social-monitor/shared-kernel';

import {
  extractSignalKeywords,
  SourceContentSafetyPolicy,
  type SourceContentSafetyVerdict,
  type UserRelevanceProfile,
} from '../../domain';
import type { UserRelevanceProfileRepositoryPort } from '../../ports';
import {
  presentSourceContentSafety,
  presentUserRelevanceProfile,
} from '../shared/relevance-presenter';
import type { RankFeedItemsCommand } from './rank-feed-items.command';
import type { RankedFeedItemView, RankFeedItemsResult } from './rank-feed-items.result';

type RankFeedItemsFailure = DomainError | Error;

const maxLimit = 50;
const maxCandidateScan = 200;

export class RankFeedItemsUseCase {
  private readonly safetyPolicy = new SourceContentSafetyPolicy();

  constructor(
    private readonly feedItems: FeedItemReadRepositoryPort,
    private readonly profiles: UserRelevanceProfileRepositoryPort,
    private readonly clock: Clock,
  ) {}

  async execute(command: RankFeedItemsCommand): Promise<Result<RankFeedItemsResult, RankFeedItemsFailure>> {
    const limit = normalizeLimit(command.limit);

    if (limit === null) {
      return err(new DomainError('validation.failed', 'Relevance ranking limit must be between 1 and 50'));
    }

    const userId = normalizeOptional(command.userId);
    const profile = userId === undefined
      ? null
      : await this.profiles.findByUser({
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          userId,
        });
    const candidates = await this.feedItems.list({
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      topicId: normalizeOptional(command.topicId),
      observedAfter: command.observedAfter,
      limit: maxCandidateScan,
    });
    const generatedAt = this.clock.now();
    const scored = candidates.items
      .map((item) => scoreFeedItem(item, profile, this.safetyPolicy, generatedAt))
      .filter((item): item is ScoredFeedItem => item !== null)
      .sort(compareScoredItems);
    const clustered = selectClusterWinners(scored, limit);

    return ok({
      generatedAt: generatedAt.toISOString(),
      profileApplied: profile !== null,
      profile: profile === null ? undefined : presentUserRelevanceProfile(profile),
      items: clustered.map((item, index) => presentRankedFeedItem(item, index + 1)),
    });
  }
}

type ScoredFeedItem = {
  readonly snapshot: ReturnType<FeedItem['toSnapshot']>;
  readonly safety: SourceContentSafetyVerdict;
  readonly score: number;
  readonly whyImportant: readonly string[];
  readonly clusterKey: string;
  readonly titleTokens: readonly string[];
  readonly duplicateFeedItemIds: readonly string[];
  readonly clusterSize: number;
};

const scoreFeedItem = (
  item: FeedItem,
  profile: UserRelevanceProfile | null,
  safetyPolicy: SourceContentSafetyPolicy,
  now: Date,
): ScoredFeedItem | null => {
  const snapshot = item.toSnapshot();
  const safety = safetyPolicy.evaluate(snapshot);
  const title = safety.sanitizedTitle;
  const bodyPreview = safety.sanitizedBodyPreview ?? '';
  const searchText = `${title} ${bodyPreview}`;

  if (
    safety.status === 'blocked' ||
    profile?.isProviderBlocked(snapshot.providerKey) === true ||
    profile?.hasMutedKeyword(searchText) === true
  ) {
    return null;
  }

  const keywords = extractSignalKeywords(searchText);
  const topicWeight = profile?.topicWeight(snapshot.topicId) ?? 0;
  const sourceWeight = profile?.sourceWeight(snapshot.providerKey) ?? 0;
  const keywordScore = keywords.reduce((total, keyword) => total + (profile?.keywordWeight(keyword) ?? 0), 0);
  const ageHours = Math.max(0, (now.getTime() - snapshot.publishedAt.getTime()) / 3_600_000);
  const recencyScore = Math.max(0, 0.5 - ageHours / 336);
  const sourceSignalScore = providerSignalScore(snapshot.providerKey, snapshot.providerMetadata);
  const safetyPenalty = safety.status === 'sanitized' ? -0.25 : 0;
  const score = roundScore(
    1 +
      topicWeight * 0.8 +
      sourceWeight * 0.7 +
      keywordScore * 0.35 +
      sourceSignalScore +
      recencyScore +
      safetyPenalty,
  );

  return {
    snapshot,
    safety,
    score,
    whyImportant: buildWhyImportant({
      topicWeight,
      sourceWeight,
      keywordMatches: keywords.filter((keyword) => (profile?.keywordWeight(keyword) ?? 0) > 0),
      sourceSignalScore,
      recencyScore,
      safety,
    }),
    clusterKey: canonicalClusterKey(safety.sanitizedCanonicalUrl ?? snapshot.canonicalUrl, title),
    titleTokens: titleTokens(title),
    duplicateFeedItemIds: [],
    clusterSize: 1,
  };
};

const selectClusterWinners = (
  items: readonly ScoredFeedItem[],
  limit: number,
): readonly ScoredFeedItem[] => {
  const clusters: ScoredFeedItem[][] = [];

  for (const item of items) {
    const cluster = clusters.find((candidate) => belongsToCluster(item, candidate[0]));

    if (cluster === undefined) {
      clusters.push([item]);
    } else {
      cluster.push(item);
    }
  }

  const winners: ScoredFeedItem[] = [];

  for (const cluster of clusters) {
    const sortedCluster = cluster.sort(compareScoredItems);
    const winner = sortedCluster[0];

    if (winner === undefined) {
      continue;
    }

    const duplicates = sortedCluster.slice(1);
    winners.push({
      ...winner,
      duplicateFeedItemIds: duplicates.map((item) => item.snapshot.id),
      clusterSize: cluster.length,
      whyImportant: cluster.length <= 1
        ? winner.whyImportant
        : [...winner.whyImportant, `Clustered ${cluster.length} similar items`],
    });
  }

  return winners.sort(compareScoredItems).slice(0, limit);
};

const belongsToCluster = (item: ScoredFeedItem, clusterHead: ScoredFeedItem | undefined): boolean =>
  clusterHead !== undefined &&
  (item.clusterKey === clusterHead.clusterKey || tokenSimilarity(item.titleTokens, clusterHead.titleTokens) >= 0.56);

const presentRankedFeedItem = (item: ScoredFeedItem, rank: number): RankedFeedItemView => ({
  feedItemId: item.snapshot.id,
  sourceItemId: item.snapshot.sourceItemId,
  sourceBindingId: item.snapshot.sourceBindingId,
  topicId: item.snapshot.topicId,
  providerKey: item.snapshot.providerKey,
  canonicalUrl: item.safety.sanitizedCanonicalUrl ?? item.snapshot.canonicalUrl,
  title: item.safety.sanitizedTitle,
  bodyPreview: item.safety.sanitizedBodyPreview,
  providerMetadata: item.snapshot.providerMetadata,
  authorHandle: item.snapshot.authorHandle,
  publishedAt: item.snapshot.publishedAt.toISOString(),
  observedAt: item.snapshot.observedAt.toISOString(),
  score: item.score,
  rank,
  clusterId: item.clusterKey,
  clusterSize: item.clusterSize,
  duplicateFeedItemIds: item.duplicateFeedItemIds,
  whyImportant: item.whyImportant,
  safety: presentSourceContentSafety(item.safety),
});

const buildWhyImportant = (params: {
  readonly topicWeight: number;
  readonly sourceWeight: number;
  readonly keywordMatches: readonly string[];
  readonly sourceSignalScore: number;
  readonly recencyScore: number;
  readonly safety: SourceContentSafetyVerdict;
}): readonly string[] => {
  const reasons = [];

  if (params.topicWeight > 0) {
    reasons.push('Matches a preferred topic');
  }

  if (params.sourceWeight > 0) {
    reasons.push('Comes from a preferred source');
  }

  if (params.keywordMatches.length > 0) {
    reasons.push(`Matches interest keywords: ${params.keywordMatches.slice(0, 3).join(', ')}`);
  }

  if (params.sourceSignalScore >= 0.35) {
    reasons.push('Strong source engagement signal');
  }

  if (params.recencyScore > 0.25) {
    reasons.push('Fresh item in the current monitoring window');
  }

  if (params.safety.status === 'sanitized') {
    reasons.push('Unsafe source instructions were sandboxed before summarization');
  }

  return reasons.length === 0 ? ['Relevant recent source item'] : reasons;
};

const compareScoredItems = (left: ScoredFeedItem, right: ScoredFeedItem): number => {
  const scoreDiff = right.score - left.score;

  if (scoreDiff !== 0) {
    return scoreDiff;
  }

  return right.snapshot.publishedAt.getTime() - left.snapshot.publishedAt.getTime();
};

const providerSignalScore = (
  providerKey: string,
  providerMetadata: ReturnType<FeedItem['toSnapshot']>['providerMetadata'],
): number => {
  const metrics = feedProviderMetricsFromMetadata({ providerKey, providerMetadata });

  if (metrics === undefined) {
    return 0;
  }

  return Math.min(0.85, feedProviderMetricStrength(metrics) / 10);
};

const canonicalClusterKey = (canonicalUrl: string, title: string): string => {
  try {
    const parsed = new URL(canonicalUrl);
    parsed.hash = '';
    parsed.search = '';

    return `url:${parsed.hostname.toLocaleLowerCase('en-US')}${parsed.pathname.replace(/\/+$/u, '')}`;
  } catch {
    return `title:${titleTokens(title).join('-')}`;
  }
};

const tokenSimilarity = (left: readonly string[], right: readonly string[]): number => {
  if (left.length === 0 || right.length === 0) {
    return 0;
  }

  const leftSet = new Set(left);
  const rightSet = new Set(right);
  const intersection = [...leftSet].filter((token) => rightSet.has(token)).length;
  const union = new Set([...leftSet, ...rightSet]).size;

  return union === 0 ? 0 : intersection / union;
};

const titleTokens = (value: string): readonly string[] => extractSignalKeywords(value).slice(0, 10);

const normalizeLimit = (value: number): number | null =>
  Number.isInteger(value) && value >= 1 && value <= maxLimit ? value : null;

const normalizeOptional = (value: string | undefined): string | undefined => {
  const normalized = value?.trim();

  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
};

const roundScore = (value: number): number => Math.round(value * 1000) / 1000;
