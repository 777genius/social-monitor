import type { FeedItem } from "../entities/feed-item";
import { createFeedSignal, type FeedSignal } from "../entities/feed-signal";
import {
  CohortBaselineContentSignalNormalizer,
  contentSignalBaselineSampleFromUnit,
  type ContentSignalBaselineSample,
  type RankableContentUnit,
} from "./cohort-baseline-content-signal-normalizer";
import type { FeedSignalBaselineSample } from "../value-objects/feed-signal-baseline-sample";
import { feedProviderMetricsFromMetadata } from "../value-objects/feed-provider-metrics";

export type FeedSignalView = FeedSignal;

export class CohortBaselineFeedSignalNormalizer {
  private readonly contentNormalizer = new CohortBaselineContentSignalNormalizer();

  normalize(params: {
    readonly items: readonly FeedItem[];
    readonly baselineItems?: readonly FeedItem[];
    readonly baselineSamples?: readonly FeedSignalBaselineSample[];
    readonly now: Date;
  }): ReadonlyMap<string, FeedSignal> {
    const units = params.items.flatMap((item) => toRankableUnit(item));
    const baselineUnits = (params.baselineItems ?? []).flatMap((item) =>
      toRankableUnit(item),
    );
    const signals = this.contentNormalizer.normalize({
      units,
      baselineSamples: [
        ...baselineUnits.map(contentSignalBaselineSampleFromUnit),
        ...(params.baselineSamples ?? []).map(contentBaselineSampleFromFeed),
      ],
      now: params.now,
    });

    return new Map(
      [...signals.entries()].map(([feedItemId, signal]) => [
        feedItemId,
        createFeedSignal({
          feedItemId,
          providerMetrics: signal.providerMetrics,
          normalizedSignal: signal.normalizedSignal,
        }),
      ]),
    );
  }
}

const toRankableUnit = (item: FeedItem): readonly RankableContentUnit[] => {
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
      interestId: snapshot.interestId,
      providerMetrics: metrics,
      publishedAt: snapshot.publishedAt,
      observedAt: snapshot.observedAt,
    },
  ];
};

const contentBaselineSampleFromFeed = (
  sample: FeedSignalBaselineSample,
): ContentSignalBaselineSample => ({
  unitId: sample.feedItemId,
  interestId: sample.interestId,
  providerKey: sample.providerKey,
  sourceKey: sample.sourceKey,
  contentType: sample.contentType,
  strength: sample.strength,
  publishedAt: sample.publishedAt,
  observedAt: sample.observedAt,
});
