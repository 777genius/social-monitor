import type { FeedItem } from "../entities/feed-item";
import { createFeedSignal, type FeedSignal } from "../entities/feed-signal";
import type { FeedNormalizedSignal } from "../value-objects/feed-normalized-signal";
import type { FeedSignalBaselineSample } from "../value-objects/feed-signal-baseline-sample";
import {
  feedProviderMetricsFromMetadata,
  feedProviderMetricStrength,
  type FeedProviderMetrics,
} from "../value-objects/feed-provider-metrics";

export type FeedSignalView = FeedSignal;

type BaselineCandidate = {
  readonly strength: number;
  readonly interestId: string;
  readonly providerKey: string;
  readonly sourceKey: string;
  readonly contentType: string;
  readonly ageBucket: string;
  readonly observedAt: Date;
};

type SignalCandidate = BaselineCandidate & {
  readonly id: string;
  readonly metrics: FeedProviderMetrics;
};

type CohortFallback = FeedNormalizedSignal["cohort"]["fallback"];
type BaselineWindow = FeedNormalizedSignal["cohort"]["baselineWindow"];

type CohortChoice = {
  readonly fallback: CohortFallback;
  readonly baselineWindow: BaselineWindow;
  readonly candidates: readonly BaselineCandidate[];
};

type CohortKeyBuilder = (
  candidate: BaselineCandidate,
  baselineWindow: BaselineWindow,
) => string;

const exactMinimum = 3;
const sourceMinimum = 5;
const providerAgeMinimum = 8;
const providerMinimum = 10;
const dayMs = 24 * 60 * 60 * 1000;
const baselineWindows: readonly {
  readonly name: BaselineWindow;
  readonly durationMs: number;
}[] = [
  { name: "24h", durationMs: dayMs },
  { name: "7d", durationMs: 7 * dayMs },
  { name: "30d", durationMs: 30 * dayMs },
  { name: "all", durationMs: Number.POSITIVE_INFINITY },
];

export class CohortBaselineFeedSignalNormalizer {
  normalize(params: {
    readonly items: readonly FeedItem[];
    readonly baselineItems?: readonly FeedItem[];
    readonly baselineSamples?: readonly FeedSignalBaselineSample[];
    readonly now: Date;
  }): ReadonlyMap<string, FeedSignal> {
    const candidates = params.items.flatMap((item) =>
      toSignalCandidate(item, params.now),
    );
    const candidateIds = new Set(candidates.map((candidate) => candidate.id));
    const baselineCandidates: readonly BaselineCandidate[] = [
      ...dedupeItems([
        ...params.items,
        ...(params.baselineItems ?? []),
      ]).flatMap((item) => toSignalCandidate(item, params.now)),
      ...dedupeSamples(params.baselineSamples ?? [], candidateIds).map(
        (sample) => toBaselineCandidate(sample, params.now),
      ),
    ];
    const cohorts = buildCohorts(baselineCandidates, params.now);
    const result = new Map<string, FeedSignal>();

    for (const candidate of candidates) {
      const cohort = chooseCohort(candidate, cohorts);
      const stats = scoreAgainstCohort(candidate, cohort.candidates);
      const score = normalizedScore(stats.percentile, stats.zScore);

      result.set(
        candidate.id,
        createFeedSignal({
          feedItemId: candidate.id,
          providerMetrics: candidate.metrics,
          normalizedSignal: {
            score,
            band: signalBand(score),
            confidence: confidenceFor(
              cohort.fallback,
              cohort.candidates.length,
              cohort.baselineWindow,
            ),
            basis: "cohort_baseline_v1",
            computedAt: params.now.toISOString(),
            cohort: {
              providerKey: candidate.providerKey,
              sourceKey: candidate.sourceKey,
              contentType: candidate.contentType,
              ageBucket: candidate.ageBucket,
              baselineWindow: cohort.baselineWindow,
              sampleSize: cohort.candidates.length,
              percentile: round(stats.percentile, 3),
              zScore: round(stats.zScore, 3),
              fallback: cohort.fallback,
            },
          },
        }),
      );
    }

    return result;
  }
}

const toSignalCandidate = (
  item: FeedItem,
  now: Date,
): readonly SignalCandidate[] => {
  const snapshot = item.toSnapshot();
  const metrics = feedProviderMetricsFromMetadata({
    providerKey: snapshot.providerKey,
    providerMetadata: snapshot.providerMetadata,
  });

  if (metrics === undefined) {
    return [];
  }

  return [
    {
      id: snapshot.id,
      metrics,
      strength: feedProviderMetricStrength(metrics),
      interestId: snapshot.interestId,
      providerKey: metrics.providerKey,
      sourceKey: metrics.sourceKey,
      contentType: metrics.contentType,
      ageBucket: ageBucketFor(snapshot.publishedAt, now),
      observedAt: snapshot.observedAt,
    },
  ];
};

const toBaselineCandidate = (
  sample: FeedSignalBaselineSample,
  now: Date,
): BaselineCandidate => ({
  strength: sample.strength,
  interestId: sample.interestId,
  providerKey: sample.providerKey,
  sourceKey: sample.sourceKey,
  contentType: sample.contentType,
  ageBucket: ageBucketFor(sample.publishedAt, now),
  observedAt: sample.observedAt,
});

const buildCohorts = (candidates: readonly BaselineCandidate[], now: Date) => {
  const cohorts = new Map<string, BaselineCandidate[]>();

  for (const candidate of candidates) {
    for (const key of cohortKeys(candidate, now)) {
      const existing = cohorts.get(key) ?? [];
      existing.push(candidate);
      cohorts.set(key, existing);
    }
  }

  return cohorts;
};

const chooseCohort = (
  candidate: SignalCandidate,
  cohorts: ReadonlyMap<string, readonly BaselineCandidate[]>,
): CohortChoice => {
  const options = fallbackOptions.flatMap((option) =>
    baselineWindows.map((window) => ({
      fallback: option.fallback,
      baselineWindow: window.name,
      candidates: cohorts.get(option.key(candidate, window.name)) ?? [],
      minimum: option.minimum,
    })),
  );

  return (
    options.find((option) => option.candidates.length >= option.minimum) ??
    [...options].sort(
      (left, right) => right.candidates.length - left.candidates.length,
    )[0] ?? {
      fallback: "exact",
      baselineWindow: "all",
      candidates: [candidate],
    }
  );
};

const scoreAgainstCohort = (
  candidate: SignalCandidate,
  cohort: readonly BaselineCandidate[],
): { readonly percentile: number; readonly zScore: number } => {
  if (cohort.length <= 1) {
    return { percentile: 0.5, zScore: 0 };
  }

  const values = cohort.map((item) => item.strength);
  const less = values.filter((value) => value < candidate.strength).length;
  const equal = values.filter((value) => value === candidate.strength).length;
  const percentile = (less + Math.max(0, equal - 1) / 2) / (cohort.length - 1);
  const mean =
    values.reduce((total, value) => total + value, 0) / values.length;
  const variance =
    values.reduce((total, value) => total + (value - mean) ** 2, 0) /
    values.length;
  const standardDeviation = Math.sqrt(variance);

  return {
    percentile: clamp(percentile, 0, 1),
    zScore:
      standardDeviation <= 0
        ? 0
        : clamp((candidate.strength - mean) / standardDeviation, -4, 4),
  };
};

const normalizedScore = (percentile: number, zScore: number): number =>
  Math.round(clamp(percentile * 75 + sigmoid(zScore) * 25, 0, 100));

const signalBand = (score: number): FeedNormalizedSignal["band"] => {
  if (score < 20) {
    return "low";
  }
  if (score < 55) {
    return "normal";
  }
  if (score < 85) {
    return "high";
  }

  return "breakout";
};

const confidenceFor = (
  fallback: CohortFallback,
  sampleSize: number,
  baselineWindow: BaselineWindow,
): number => {
  const fallbackWeight = {
    exact: 1,
    source: 0.86,
    provider_age: 0.72,
    provider: 0.58,
  }[fallback];
  const windowWeight = {
    "24h": 1,
    "7d": 0.94,
    "30d": 0.86,
    all: 0.72,
  }[baselineWindow];
  const sampleWeight = Math.log1p(sampleSize) / Math.log1p(50);

  return round(
    clamp(fallbackWeight * windowWeight * sampleWeight, 0.15, 0.98),
    2,
  );
};

const ageBucketFor = (publishedAt: Date, now: Date): string => {
  const ageHours = Math.max(
    0,
    (now.getTime() - publishedAt.getTime()) / 3_600_000,
  );

  if (ageHours <= 1) {
    return "0-1h";
  }
  if (ageHours <= 3) {
    return "1-3h";
  }
  if (ageHours <= 6) {
    return "3-6h";
  }
  if (ageHours <= 12) {
    return "6-12h";
  }
  if (ageHours <= 24) {
    return "12-24h";
  }
  if (ageHours <= 72) {
    return "1-3d";
  }
  if (ageHours <= 168) {
    return "3-7d";
  }

  return "7d+";
};

const cohortKeys = (
  candidate: BaselineCandidate,
  now: Date,
): readonly string[] =>
  windowsFor(candidate, now).flatMap((window) =>
    fallbackOptions.map((option) => option.key(candidate, window)),
  );

const windowsFor = (
  candidate: BaselineCandidate,
  now: Date,
): readonly BaselineWindow[] =>
  baselineWindows
    .filter(
      (window) =>
        window.name === "all" ||
        now.getTime() - candidate.observedAt.getTime() <= window.durationMs,
    )
    .map((window) => window.name);

const exactKey = (
  candidate: BaselineCandidate,
  baselineWindow: BaselineWindow,
): string =>
  cohortKey([
    "exact",
    baselineWindow,
    candidate.interestId,
    candidate.providerKey,
    candidate.sourceKey,
    candidate.contentType,
    candidate.ageBucket,
  ]);

const sourceKey = (
  candidate: BaselineCandidate,
  baselineWindow: BaselineWindow,
): string =>
  cohortKey([
    "source",
    baselineWindow,
    candidate.interestId,
    candidate.providerKey,
    candidate.sourceKey,
    candidate.contentType,
  ]);

const providerAgeKey = (
  candidate: BaselineCandidate,
  baselineWindow: BaselineWindow,
): string =>
  cohortKey([
    "provider_age",
    baselineWindow,
    candidate.interestId,
    candidate.providerKey,
    candidate.contentType,
    candidate.ageBucket,
  ]);

const providerKey = (
  candidate: BaselineCandidate,
  baselineWindow: BaselineWindow,
): string =>
  cohortKey([
    "provider",
    baselineWindow,
    candidate.interestId,
    candidate.providerKey,
    candidate.contentType,
  ]);

const cohortKey = (parts: readonly string[]): string => JSON.stringify(parts);

const fallbackOptions: readonly {
  readonly fallback: CohortFallback;
  readonly minimum: number;
  readonly key: CohortKeyBuilder;
}[] = [
  { fallback: "exact", minimum: exactMinimum, key: exactKey },
  { fallback: "source", minimum: sourceMinimum, key: sourceKey },
  {
    fallback: "provider_age",
    minimum: providerAgeMinimum,
    key: providerAgeKey,
  },
  { fallback: "provider", minimum: providerMinimum, key: providerKey },
];

const dedupeItems = <TItem extends { toSnapshot(): { readonly id: string } }>(
  items: readonly TItem[],
): readonly TItem[] => {
  const byId = new Map<string, TItem>();

  for (const item of items) {
    byId.set(item.toSnapshot().id, item);
  }

  return [...byId.values()];
};

const dedupeSamples = (
  samples: readonly FeedSignalBaselineSample[],
  excludedFeedItemIds: ReadonlySet<string>,
): readonly FeedSignalBaselineSample[] => {
  const byFeedItemId = new Map<string, FeedSignalBaselineSample>();

  for (const sample of samples) {
    if (!excludedFeedItemIds.has(sample.feedItemId)) {
      byFeedItemId.set(sample.feedItemId, sample);
    }
  }

  return [...byFeedItemId.values()];
};

const sigmoid = (value: number): number => 1 / (1 + Math.exp(-value));

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));

const round = (value: number, digits: number): number => {
  const multiplier = 10 ** digits;

  return Math.round(value * multiplier) / multiplier;
};
