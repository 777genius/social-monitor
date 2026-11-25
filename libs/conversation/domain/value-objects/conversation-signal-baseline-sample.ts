import {
  contentSignalBaselineSampleFromUnit,
  feedProviderMetricsFromMetadata,
  type ContentSignalBaselineSample,
  type RankableContentUnit,
} from '@social-monitor/feed/domain';

import type { ConversationUnit } from '../entities/conversation-unit';

export type ConversationSignalBaselineSample = ContentSignalBaselineSample & {
  readonly conversationUnitId: string;
};

export const conversationRankableUnitFromUnit = (
  unit: ConversationUnit,
): RankableContentUnit | undefined => {
  const snapshot = unit.toSnapshot();
  const providerMetrics = feedProviderMetricsFromMetadata({
    providerKey: snapshot.providerKey,
    providerMetadata: snapshot.providerMetadata,
  });

  if (providerMetrics === undefined) {
    return undefined;
  }

  return {
    id: snapshot.id,
    interestId: snapshot.interestId,
    providerMetrics,
    publishedAt: snapshot.publishedAt,
    observedAt: snapshot.observedAt,
  };
};

export const conversationSignalBaselineSampleFromUnit = (
  unit: ConversationUnit,
): ConversationSignalBaselineSample | undefined => {
  const rankable = conversationRankableUnitFromUnit(unit);

  if (rankable === undefined) {
    return undefined;
  }

  return {
    ...contentSignalBaselineSampleFromUnit(rankable),
    conversationUnitId: rankable.id,
  };
};
