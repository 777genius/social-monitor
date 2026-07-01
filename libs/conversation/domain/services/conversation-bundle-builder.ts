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
  readonly parentProviderUnitId?: string;
  readonly threadExternalId: string;
  readonly canonicalUrl: string;
  readonly authorHandle?: string;
  readonly body: string;
  readonly publishedAt: Date;
  readonly depth: number;
  readonly role: ConversationUnitRole;
  readonly selectionReason: 'ranked';
  readonly ancestry: readonly ConversationBundleAncestorUnit[];
  readonly providerMetrics: FeedProviderMetrics;
  readonly normalizedSignal: FeedNormalizedSignal;
};

export type ConversationBundleAncestorUnit = {
  readonly conversationUnitId: string;
  readonly providerUnitId: string;
  readonly parentProviderUnitId?: string;
  readonly threadExternalId: string;
  readonly canonicalUrl: string;
  readonly authorHandle?: string;
  readonly body: string;
  readonly publishedAt: Date;
  readonly depth: number;
  readonly role: ConversationUnitRole;
  readonly selectionReason: 'ancestor_context';
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
    readonly maxAncestorDepth?: number;
    readonly maxTotalUnitsPerRoot?: number;
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
    const grouped = new Map<string, ConversationBundleUnitBase[]>();

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
        parentProviderUnitId: snapshot.parentProviderUnitId,
        threadExternalId: snapshot.threadExternalId,
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
      const rankedLimit = normalizeLimit(params.limitPerRoot);
      const rankedUnits = units
        .sort(compareBundleUnits)
        .slice(0, rankedLimit);
      const indexedUnits = new Map(
        units.map((unit) => [unit.providerUnitId, unit] as const),
      );
      let remainingAncestorSlots = Math.max(
        0,
        normalizeMaxTotalUnitsPerRoot(params.maxTotalUnitsPerRoot, rankedLimit) -
          rankedUnits.length,
      );
      const unitsWithAncestry = rankedUnits.map((unit) => {
        const ancestry = collectAncestry({
          unit,
          indexedUnits,
          maxDepth: normalizeMaxAncestorDepth(params.maxAncestorDepth),
          maxItems: remainingAncestorSlots,
        });

        remainingAncestorSlots -= ancestry.length;

        return {
          ...unit,
          selectionReason: 'ranked' as const,
          ancestry,
        };
      });

      return {
        rootFeedItemId,
        units: unitsWithAncestry,
        bundleScore: bundleScore(unitsWithAncestry),
      };
    });
  }
}

type ConversationBundleUnitBase = Omit<
  ConversationBundleAncestorUnit,
  'selectionReason'
>;

const collectAncestry = (params: {
  readonly unit: ConversationBundleUnitBase;
  readonly indexedUnits: ReadonlyMap<string, ConversationBundleUnitBase>;
  readonly maxDepth: number;
  readonly maxItems: number;
}): readonly ConversationBundleAncestorUnit[] => {
  if (params.maxDepth === 0 || params.maxItems === 0) {
    return [];
  }

  const ancestors: ConversationBundleAncestorUnit[] = [];
  const visited = new Set<string>([params.unit.providerUnitId]);
  let parentProviderUnitId = params.unit.parentProviderUnitId;

  while (
    parentProviderUnitId !== undefined &&
    ancestors.length < params.maxDepth &&
    ancestors.length < params.maxItems
  ) {
    if (visited.has(parentProviderUnitId)) {
      break;
    }
    visited.add(parentProviderUnitId);

    const parent = params.indexedUnits.get(parentProviderUnitId);
    if (parent === undefined) {
      break;
    }

    ancestors.push({
      ...parent,
      selectionReason: 'ancestor_context',
    });
    parentProviderUnitId = parent.parentProviderUnitId;
  }

  return ancestors.reverse();
};

const compareBundleUnits = (
  left: ConversationBundleUnitBase,
  right: ConversationBundleUnitBase,
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

const normalizeMaxAncestorDepth = (value: number | undefined): number =>
  value === undefined || !Number.isInteger(value) || value < 0
    ? 3
    : Math.min(value, 10);

const normalizeMaxTotalUnitsPerRoot = (
  value: number | undefined,
  rankedLimit: number,
): number =>
  value === undefined || !Number.isInteger(value) || value < rankedLimit
    ? rankedLimit + rankedLimit * 3
    : Math.min(value, 80);
