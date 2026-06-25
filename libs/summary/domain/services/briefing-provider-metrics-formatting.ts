import type { BriefingProviderMetric } from '../entities/briefing-artifact';
import type {
  BriefingEvidenceItem,
  StoryCluster,
} from '../value-objects/briefing-evidence-item';
import { providerLabel, plural } from './briefing-reader-labels';

export const formatProviderMetrics = (
  metrics: BriefingEvidenceItem['providerMetrics'],
): readonly BriefingProviderMetric[] => {
  if (metrics === undefined) {
    return [];
  }

  switch (readString(metrics.kind)) {
    case 'github_repository': {
      const stars = readNumber(metrics.stars);
      const forks = readNumber(metrics.forks);
      const trendingDelta = readRecord(metrics.trendingDelta);
      const trendDeltas = readTrendDeltas(metrics.trendDeltas, trendingDelta);

      return compactMetrics([
        metric('Evidence', readString(metrics.evidenceLabel)),
        metric('Checked', formatCheckedAt(readString(metrics.checkedAt))),
        metric('Source lag', 'GH Archive can lag by about an hour'),
        metric('Stars', stars),
        ...trendDeltas.map((delta) =>
          metric(
            trendDeltas.length > 1 && delta.window !== undefined
              ? `Trend ${delta.window}`
              : 'Trend',
            `+${delta.value}${delta.window === undefined ? '' : ` / ${delta.window}`}`,
          ),
        ),
        metric('Forks', forks),
      ]);
    }
    case 'github_trending_repository': {
      const window = readString(metrics.window);
      const rank = readNumber(metrics.rank);
      const starsGained = readNumber(metrics.starsGained);

      return compactMetrics([
        metric(
          `GitHub Trending ${trendingWindowLabel(window)}`,
          formatTrendingPageSignal(rank, starsGained, window),
        ),
        metric('Stars', readNumber(metrics.stars)),
        metric('Forks', readNumber(metrics.forks)),
      ]);
    }
    case 'reddit_post':
      return compactMetrics([
        metric('Score', readNumber(metrics.score)),
        metric('Comments', readNumber(metrics.comments)),
        metric('Upvote ratio', formatRatio(readNumber(metrics.upvoteRatio))),
      ]);
    case 'hacker_news_story':
      return compactMetrics([
        metric('Points', readNumber(metrics.points)),
        metric('Comments', readNumber(metrics.comments)),
      ]);
    case 'x_post':
      return compactMetrics([
        metric('Likes', readNumber(metrics.likes)),
        metric('Reposts', readNumber(metrics.reposts)),
        metric('Replies', readNumber(metrics.replies)),
        metric('Quotes', readNumber(metrics.quotes)),
        metric('Bookmarks', readNumber(metrics.bookmarks)),
        metric('Impressions', readNumber(metrics.impressions)),
      ]);
    default:
      return [];
  }
};

export const formatStoryProviderMetrics = (params: {
  readonly cluster: StoryCluster | undefined;
  readonly evidence: readonly BriefingEvidenceItem[];
  readonly representativeMetrics: BriefingEvidenceItem['providerMetrics'];
}): readonly BriefingProviderMetric[] => {
  const providerKeys = uniqueNonEmpty([
    ...(params.cluster?.providerKeys ?? []),
    ...params.evidence.map((item) => item.providerKey),
  ]);
  const clusterEvidenceCount =
    params.cluster === undefined
      ? 0
      : 1 + params.cluster.duplicateFeedItemIds.length;
  const evidenceCount = Math.max(params.evidence.length, clusterEvidenceCount);
  const storyMetrics =
    params.cluster === undefined
      ? []
      : compactMetrics([
          metric('Story signal', formatSignalScore(params.cluster.score)),
          ...formatSignalBreakdownMetrics(params.cluster.signalBreakdown),
          providerKeys.length < 2
            ? undefined
            : metric(
                'Confirmed by',
                `${providerKeys.length} provider${plural(providerKeys.length)}: ${providerKeys
                  .slice(0, 3)
                  .map(providerLabel)
                  .join(', ')}`,
              ),
          evidenceCount < 2
            ? undefined
            : metric(
                'Evidence items',
                `${evidenceCount} source item${plural(evidenceCount)}`,
              ),
          ...params.evidence.slice(0, 3).map(evidenceMetric),
        ]);

  return [
    ...storyMetrics,
    ...formatProviderMetrics(params.representativeMetrics),
  ];
};

const formatSignalBreakdownMetrics = (
  breakdown: StoryCluster['signalBreakdown'],
): readonly BriefingProviderMetric[] => {
  if (breakdown === undefined) {
    return [];
  }

  return compactMetrics([
    metric('Base signal', formatSignalScore(breakdown.baseScore)),
    metric('Cross-source support', formatPositiveDelta(breakdown.crossProviderSupport)),
    metric('Same-source support', formatPositiveDelta(breakdown.sameProviderSupport)),
    metric('Provider diversity', formatPositiveDelta(breakdown.providerDiversityBoost)),
    metric('Topic diversity', formatPositiveDelta(breakdown.topicDiversityBoost)),
    metric('Freshness', formatPositiveDelta(breakdown.freshnessBoost)),
  ]);
};

const formatCheckedAt = (value: string | undefined): string | undefined => {
  if (value === undefined) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toISOString();
};

const compactMetrics = (
  values: readonly (BriefingProviderMetric | undefined)[],
): readonly BriefingProviderMetric[] =>
  values.filter(
    (value): value is BriefingProviderMetric => value !== undefined,
  );

const metric = (
  label: string,
  value: number | string | undefined,
): BriefingProviderMetric | undefined =>
  value === undefined
    ? undefined
    : {
        label,
        value:
          typeof value === 'number' ? value.toLocaleString('en-US') : value,
      };

const formatRatio = (value: number | undefined): string | undefined =>
  value === undefined ? undefined : `${Math.round(value * 100)}%`;

const formatSignalScore = (value: number | undefined): string | undefined =>
  value === undefined
    ? undefined
    : Number.isInteger(value)
      ? String(value)
      : value.toFixed(3).replace(/0+$/u, '').replace(/\.$/u, '');

const formatRank = (value: number | undefined): string | undefined =>
  value === undefined ? undefined : `#${value}`;

const formatSigned = (value: number | undefined): string | undefined =>
  value === undefined ? undefined : `+${value.toLocaleString('en-US')}`;

const formatPositiveDelta = (value: number | undefined): string | undefined =>
  value === undefined || value <= 0 ? undefined : `+${formatSignalScore(value)}`;

const formatTrendingPageSignal = (
  rank: number | undefined,
  starsGained: number | undefined,
  window: string | undefined,
): string | undefined => {
  const formattedRank = formatRank(rank);
  const formattedStars = formatSigned(starsGained);

  if (formattedRank === undefined || formattedStars === undefined) {
    return undefined;
  }

  return `${formattedRank}, ${formattedStars} stars ${trendingWindowLabel(window)}`;
};

const trendingWindowLabel = (window: string | undefined): string => {
  switch (window) {
    case 'weekly':
      return 'this week';
    case 'monthly':
      return 'this month';
    case 'daily':
    default:
      return 'today';
  }
};

const evidenceMetric = (
  evidence: BriefingEvidenceItem,
): BriefingProviderMetric | undefined => {
  const summary = providerMetricSummary(evidence.providerMetrics);

  return summary === undefined
    ? undefined
    : metric(`${providerLabel(evidence.providerKey)} evidence`, summary);
};

const providerMetricSummary = (
  metrics: BriefingEvidenceItem['providerMetrics'],
): string | undefined => {
  if (metrics === undefined) {
    return undefined;
  }

  switch (readString(metrics.kind)) {
    case 'github_repository': {
      const stars = readNumber(metrics.stars);
      const trend = readRecord(metrics.trendingDelta);
      const trendValue = readNumber(trend?.value);
      const trendWindow = readString(trend?.window);
      const trendText =
        trendValue === undefined
          ? undefined
          : `${formatSigned(trendValue)} stars${trendWindow === undefined ? '' : ` / ${trendWindow}`}`;
      return compactText([
        trendText,
        stars === undefined
          ? undefined
          : `${stars.toLocaleString('en-US')} total stars`,
      ]);
    }
    case 'github_trending_repository':
      return formatTrendingPageSignal(
        readNumber(metrics.rank),
        readNumber(metrics.starsGained),
        readString(metrics.window),
      );
    case 'reddit_post':
      return compactText([
        formatNamedNumber('score', readNumber(metrics.score)),
        formatNamedNumber('comments', readNumber(metrics.comments)),
        formatRatio(readNumber(metrics.upvoteRatio)) === undefined
          ? undefined
          : `${formatRatio(readNumber(metrics.upvoteRatio))} upvoted`,
      ]);
    case 'hacker_news_story':
      return compactText([
        formatNamedNumber('points', readNumber(metrics.points)),
        formatNamedNumber('comments', readNumber(metrics.comments)),
      ]);
    case 'x_post':
      return compactText([
        formatNamedNumber('likes', readNumber(metrics.likes)),
        formatNamedNumber('reposts', readNumber(metrics.reposts)),
        formatNamedNumber('replies', readNumber(metrics.replies)),
      ]);
    default:
      return undefined;
  }
};

const formatNamedNumber = (
  label: string,
  value: number | undefined,
): string | undefined =>
  value === undefined ? undefined : `${value.toLocaleString('en-US')} ${label}`;

const compactText = (
  parts: readonly (string | undefined)[],
): string | undefined => {
  const compacted = parts.filter((part): part is string => part !== undefined);

  return compacted.length === 0 ? undefined : compacted.join(', ');
};

const readRecord = (
  value: unknown,
): Readonly<Record<string, unknown>> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Readonly<Record<string, unknown>>)
    : undefined;

const readTrendDeltas = (
  value: unknown,
  fallback: Readonly<Record<string, unknown>> | undefined,
): readonly { readonly window?: string; readonly value: number }[] => {
  const deltas = Array.isArray(value)
    ? value.map(readRecord).flatMap((record) => {
        const metricValue = readNumber(record?.value);

        return metricValue === undefined
          ? []
          : [{ window: readString(record?.window), value: metricValue }];
      })
    : [];

  if (deltas.length > 0) {
    return deltas;
  }

  const fallbackValue = readNumber(fallback?.value);

  return fallbackValue === undefined
    ? []
    : [{ window: readString(fallback?.window), value: fallbackValue }];
};

const readString = (value: unknown): string | undefined =>
  typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;

const readNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const uniqueNonEmpty = (values: readonly string[]): readonly string[] => {
  const seen = new Set<string>();
  return values
    .map((value) => value.trim())
    .filter((value) => {
      if (value.length === 0 || seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });
};
