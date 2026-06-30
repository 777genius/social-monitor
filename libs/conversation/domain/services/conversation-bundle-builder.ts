import {
  CohortBaselineContentSignalNormalizer,
  type ContentSignalBaselineSample,
} from '@social-monitor/feed/domain';
import type {
  FeedNormalizedSignal,
  FeedProviderMetrics,
} from '@social-monitor/feed/domain';

import type { ConversationUnit, ConversationUnitRole } from '../entities/conversation-unit';
import { conversationRankableUnitFromUnit } from '../value-objects/conversation-signal-baseline-sample';

export type ConversationBundleUnit = {
  readonly conversationUnitId: string;
  readonly providerUnitId: string;
  readonly canonicalUrl: string;
  readonly authorHandle?: string;
  readonly body: string;
  readonly publishedAt: Date;
  readonly depth: number;
  readonly role: ConversationUnitRole;
  readonly providerMetrics: FeedProviderMetrics;
  readonly normalizedSignal: FeedNormalizedSignal;
};

export type ConversationBundle = {
  readonly rootFeedItemId: string;
  readonly units: readonly ConversationBundleUnit[];
  readonly bundleScore: number;
};

export class ConversationBundleBuilder {
  constructor(
    private readonly normalizer = new CohortBaselineContentSignalNormalizer(),
  ) {}

  build(params: {
    readonly units: readonly ConversationUnit[];
    readonly baselineSamples?: readonly ContentSignalBaselineSample[];
    readonly now: Date;
    readonly limitPerRoot: number;
  }): readonly ConversationBundle[] {
    const rankableUnits = params.units.flatMap((unit) => {
      const rankable = conversationRankableUnitFromUnit(unit);

      return rankable === undefined ? [] : [rankable];
    });
    const signals = this.normalizer.normalize({
      units: rankableUnits,
      baselineSamples: params.baselineSamples,
      now: params.now,
    });
    const grouped = new Map<string, ConversationBundleUnit[]>();

    for (const unit of params.units) {
      const snapshot = unit.toSnapshot();
      const signal = signals.get(snapshot.id);

      if (signal === undefined) {
        continue;
      }

      const existing = grouped.get(snapshot.rootFeedItemId) ?? [];
      existing.push({
        conversationUnitId: snapshot.id,
        providerUnitId: snapshot.providerUnitId,
        canonicalUrl: snapshot.canonicalUrl,
        authorHandle: snapshot.authorHandle,
        body: snapshot.body,
        publishedAt: snapshot.publishedAt,
        depth: snapshot.depth,
        role: snapshot.role,
        providerMetrics: signal.providerMetrics,
        normalizedSignal: signal.normalizedSignal,
      });
      grouped.set(snapshot.rootFeedItemId, existing);
    }

    return [...grouped.entries()].map(([rootFeedItemId, units]) => {
      const rankedUnits = units
        .sort(compareBundleUnits)
        .slice(0, normalizeLimit(params.limitPerRoot));

      return {
        rootFeedItemId,
        units: rankedUnits,
        bundleScore: bundleScore(rankedUnits),
      };
    });
  }
}

const compareBundleUnits = (
  left: ConversationBundleUnit,
  right: ConversationBundleUnit,
): number => {
  const signalDiff =
    right.normalizedSignal.score - left.normalizedSignal.score;

  if (signalDiff !== 0) {
    return signalDiff;
  }

  const depthDiff = left.depth - right.depth;
  if (depthDiff !== 0) {
    return depthDiff;
  }

  return right.publishedAt.getTime() - left.publishedAt.getTime();
};

const bundleScore = (units: readonly ConversationBundleUnit[]): number => {
  if (units.length === 0) {
    return 0;
  }

  const scores = units.map((unit) => unit.normalizedSignal.score);
  const max = Math.max(...scores);
  const median =
    [...scores].sort((left, right) => left - right)[
      Math.floor(scores.length / 2)
    ] ?? max;
  const breadth = Math.min(10, units.length) * 2;

  return Math.round(max * 0.45 + median * 0.4 + breadth);
};

const normalizeLimit = (value: number): number =>
  Number.isInteger(value) && value > 0 ? Math.min(value, 20) : 7;
