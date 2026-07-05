export type AppliedTopicSourceBindingUpdate = {
  readonly sourceBindingId: string;
  readonly interestId: string;
  readonly providerKey: string;
  readonly changed: boolean;
  readonly changedConfigPaths: readonly string[];
  readonly rollbackToken?: Readonly<Record<string, unknown>>;
};

export type ApplyAcceptedTopicRecommendationStatus =
  | 'applied'
  | 'already_applied'
  | 'no_supported_bindings';

export type ApplyAcceptedTopicRecommendationResult = {
  readonly status: ApplyAcceptedTopicRecommendationStatus;
  readonly changedSourceBindingCount: number;
  readonly sourceBindingUpdates: readonly AppliedTopicSourceBindingUpdate[];
};

export type RevertedTopicSourceBindingUpdate = {
  readonly sourceBindingId: string;
  readonly interestId: string;
  readonly providerKey: string;
  readonly reverted: boolean;
  readonly reason?: string;
  readonly restoredConfigPaths: readonly string[];
};

export type RevertAcceptedTopicRecommendationStatus =
  | "reverted"
  | "partially_reverted"
  | "nothing_to_revert"
  | "blocked";

export type RevertAcceptedTopicRecommendationResult = {
  readonly status: RevertAcceptedTopicRecommendationStatus;
  readonly revertedSourceBindingCount: number;
  readonly sourceBindingReversions: readonly RevertedTopicSourceBindingUpdate[];
};
