import type {
  BriefingNextAction,
  BriefingProviderMetric,
  BriefingReaderItem,
} from '../entities/briefing-artifact';
import type { BriefingEvidenceItem, StoryCluster } from '../value-objects/briefing-evidence-item';

export const buildMatchedRules = (
  evidence: readonly BriefingEvidenceItem[],
  topicIds: readonly string[],
  providerKey: string,
): readonly string[] => {
  const explicitRules = evidence.flatMap((item) => item.matchedRules ?? []);
  const fallbackRules = [
    ...topicIds.map((topicId) => `topic:${topicId}`),
    ...evidence.map((item) => `source-binding:${item.sourceBindingId}`),
    `provider:${providerKey}`,
  ];

  return compactUnique([...explicitRules, ...fallbackRules]);
};

export const buildWhyNow = (
  cluster: StoryCluster | undefined,
  providerKeys: readonly string[],
  evidence: readonly BriefingEvidenceItem[],
): string => {
  const providers = uniqueNonEmpty([
    ...(cluster?.providerKeys ?? []),
    ...providerKeys,
    ...evidence.map((item) => item.providerKey),
  ]).map(providerLabel);
  const duplicateCount = cluster?.duplicateFeedItemIds.length ?? 0;
  const topicCount = cluster?.topicIds.length ?? uniqueNonEmpty(evidence.map((item) => item.topicId)).length;
  const coverage = providers.length > 1
    ? `Current briefing window has cross-source coverage from ${providers.slice(0, 3).join(', ')}`
    : `Current briefing window has ${providers[0] ?? 'source'} coverage`;
  const duplicateText = duplicateCount === 0 ? '' : ` and clustered ${duplicateCount} related item${plural(duplicateCount)}`;
  const topicText = topicCount > 1 ? ` across ${topicCount} topics` : '';

  return `${coverage}${topicText}${duplicateText}.`;
};

export const normalizeSignalScore = (value: number): number =>
  Number.isFinite(value) && value > 0 ? Number(value.toFixed(3)) : 0;

export const formatProviderMetrics = (metrics: BriefingEvidenceItem['providerMetrics']): readonly BriefingProviderMetric[] => {
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
        metric('Stars', stars),
        ...trendDeltas.map((delta) =>
          metric(
            trendDeltas.length > 1 && delta.window !== undefined ? `Trend ${delta.window}` : 'Trend',
            `+${delta.value}${delta.window === undefined ? '' : ` / ${delta.window}`}`,
          )),
        metric('Forks', forks),
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

export const uniqueActions = (actions: readonly BriefingNextAction[]): readonly BriefingNextAction[] => {
  const seen = new Set<string>();

  return actions.filter((action) => {
    const key = `${action.kind}:${action.label}:${action.canonicalUrl ?? ''}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const firstSentence = (value: string): string | undefined => {
  const trimmed = value.replace(/\s+/g, ' ').trim();
  if (trimmed.length === 0) {
    return undefined;
  }
  const match = /^(.+?[.!?])(?:\s|$)/.exec(trimmed);
  return match?.[1] ?? trimmed;
};

export const hasAnyCitation = (left: readonly string[], right: readonly string[]): boolean =>
  left.some((citationId) => right.includes(citationId));

export const uniqueItems = (items: readonly BriefingReaderItem[]): readonly BriefingReaderItem[] => {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = `${item.providerKey}:${item.title}:${item.citationIds.join(',')}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
};

export const uniqueNonEmpty = (values: readonly string[]): readonly string[] => {
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

export const compactUnique = (values: readonly (string | undefined)[]): readonly string[] =>
  uniqueNonEmpty(values.filter((value): value is string => value !== undefined));

export const nonEmpty = (value: string, fallback: string): string => {
  const trimmed = value.trim();
  return trimmed.length === 0 ? fallback : trimmed;
};

export const topicTitle = (topicId: string): string =>
  topicId
    .split(/[-_:\s]+/)
    .filter((part) => part.length > 0)
    .map((part) => part[0]?.toUpperCase() + part.slice(1))
    .join(' ');

export const providerLabel = (providerKey: string): string => {
  switch (providerKey.toLowerCase()) {
    case 'github-repo-radar':
      return 'Repo Radar';
    case 'github-issues':
    case 'github':
      return 'GitHub';
    case 'hacker-news':
    case 'hn':
      return 'Hacker News';
    case 'reddit':
      return 'Reddit';
    case 'rss':
      return 'RSS';
    default:
      return providerKey;
  }
};

export const plural = (count: number): string => count === 1 ? '' : 's';

const compactMetrics = (
  values: readonly (BriefingProviderMetric | undefined)[],
): readonly BriefingProviderMetric[] =>
  values.filter((value): value is BriefingProviderMetric => value !== undefined);

const metric = (label: string, value: number | string | undefined): BriefingProviderMetric | undefined =>
  value === undefined
    ? undefined
    : {
      label,
      value: typeof value === 'number' ? value.toLocaleString('en-US') : value,
    };

const formatRatio = (value: number | undefined): string | undefined =>
  value === undefined ? undefined : `${Math.round(value * 100)}%`;

const readRecord = (value: unknown): Readonly<Record<string, unknown>> | undefined =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
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
  typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;

const readNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;
