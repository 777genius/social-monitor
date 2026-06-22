import type { RelevanceFeedbackAction, RelevanceWeight } from '../../domain';
import type { BuildPersonalizedDigestResult } from '../../features/build-personalized-digest/build-personalized-digest.result';
import type { RankFeedItemsResult } from '../../features/rank-feed-items/rank-feed-items.result';
import type { RecordRelevanceFeedbackResult } from '../../features/record-relevance-feedback/record-relevance-feedback.result';
import type { UpsertUserRelevanceProfileResult } from '../../features/upsert-user-relevance-profile/upsert-user-relevance-profile.result';

export class RelevanceWeightDto implements RelevanceWeight {
  declare readonly key: string;
  declare readonly weight: number;
}

export class UpsertUserRelevanceProfileRequestDto {
  declare readonly topicWeights?: readonly RelevanceWeightDto[];
  declare readonly sourceWeights?: readonly RelevanceWeightDto[];
  declare readonly keywordWeights?: readonly RelevanceWeightDto[];
  declare readonly mutedKeywords?: readonly string[];
  declare readonly blockedProviderKeys?: readonly string[];
}

export class RecordRelevanceFeedbackRequestDto {
  declare readonly idempotencyKey: string;
  declare readonly action: RelevanceFeedbackAction;
  declare readonly rating?: number;
  declare readonly feedItemId?: string;
  declare readonly topicId: string;
  declare readonly providerKey: string;
  declare readonly title: string;
  declare readonly bodyPreview?: string;
  declare readonly canonicalUrl?: string;
}

export type UpsertUserRelevanceProfileResponseDto = UpsertUserRelevanceProfileResult;
export type RankFeedItemsResponseDto = RankFeedItemsResult;
export type BuildPersonalizedDigestResponseDto = BuildPersonalizedDigestResult;
export type RecordRelevanceFeedbackResponseDto = RecordRelevanceFeedbackResult;
