import type {
  RelevanceFeedbackSignalView,
  UserRelevanceProfileView,
} from '../shared/relevance-presenter';

export type RecordRelevanceFeedbackResult = {
  readonly feedback: RelevanceFeedbackSignalView;
  readonly profile: UserRelevanceProfileView;
  readonly created: boolean;
  readonly learningDirection: 'positive' | 'negative' | 'block_provider' | 'recorded';
};
