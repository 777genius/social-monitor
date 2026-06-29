import type {
  RelevanceFeedbackReason,
  RelevanceFeedbackSignal,
  SourceContentQualityVerdict,
  SourceContentSafetyVerdict,
  UserRelevanceProfile,
} from '../../domain';

export type UserRelevanceProfileView = {
  readonly id: string;
  readonly userId: string;
  readonly interestWeights: readonly { readonly key: string; readonly weight: number }[];
  readonly sourceWeights: readonly { readonly key: string; readonly weight: number }[];
  readonly keywordWeights: readonly { readonly key: string; readonly weight: number }[];
  readonly mutedKeywords: readonly string[];
  readonly blockedProviderKeys: readonly string[];
  readonly rulesVersion: string;
  readonly updatedAt: string;
};

export type RelevanceFeedbackSignalView = {
  readonly feedbackId: string;
  readonly userId: string;
  readonly action: string;
  readonly rating?: number;
  readonly target: {
    readonly feedItemId?: string;
    readonly interestId: string;
    readonly providerKey: string;
    readonly feedbackReason?: RelevanceFeedbackReason;
  };
  readonly createdAt: string;
};

export type SourceContentSafetyView = {
  readonly status: SourceContentSafetyVerdict['status'];
  readonly categories: readonly string[];
  readonly rawPayloadRetained: false;
  readonly retentionPolicy: SourceContentSafetyVerdict['retentionPolicy'];
};

export type SourceContentQualityView = {
  readonly qualityScore: number;
  readonly interestRelevanceScore: number;
  readonly engagementIntegrityScore: number;
  readonly eligibleForSummary: boolean;
  readonly eligibleForTopRead: boolean;
  readonly needsLlmReview: boolean;
  readonly decision: SourceContentQualityVerdict['decision'];
  readonly flags: readonly string[];
  readonly reason: string;
};

export const presentUserRelevanceProfile = (profile: UserRelevanceProfile): UserRelevanceProfileView => {
  const snapshot = profile.toSnapshot();

  return {
    id: snapshot.id,
    userId: snapshot.userId,
    interestWeights: snapshot.interestWeights,
    sourceWeights: snapshot.sourceWeights,
    keywordWeights: snapshot.keywordWeights,
    mutedKeywords: snapshot.mutedKeywords,
    blockedProviderKeys: snapshot.blockedProviderKeys,
    rulesVersion: snapshot.rulesVersion,
    updatedAt: snapshot.updatedAt.toISOString(),
  };
};

export const presentRelevanceFeedbackSignal = (
  signal: RelevanceFeedbackSignal,
): RelevanceFeedbackSignalView => {
  const snapshot = signal.toSnapshot();

  return {
    feedbackId: snapshot.id,
    userId: snapshot.userId,
    action: snapshot.action,
    rating: snapshot.rating,
    target: {
      feedItemId: snapshot.target.feedItemId,
      interestId: snapshot.target.interestId,
      providerKey: snapshot.target.providerKey,
      feedbackReason: snapshot.target.feedbackReason,
    },
    createdAt: snapshot.createdAt.toISOString(),
  };
};

export const presentSourceContentSafety = (
  safety: SourceContentSafetyVerdict,
): SourceContentSafetyView => ({
  status: safety.status,
  categories: safety.categories,
  rawPayloadRetained: safety.rawPayloadRetained,
  retentionPolicy: safety.retentionPolicy,
});

export const presentSourceContentQuality = (
  quality: SourceContentQualityVerdict,
): SourceContentQualityView => ({
  qualityScore: quality.qualityScore,
  interestRelevanceScore: quality.interestRelevanceScore,
  engagementIntegrityScore: quality.engagementIntegrityScore,
  eligibleForSummary: quality.eligibleForSummary,
  eligibleForTopRead: quality.eligibleForTopRead,
  needsLlmReview: quality.needsLlmReview,
  decision: quality.decision,
  flags: quality.flags,
  reason: quality.reason,
});
