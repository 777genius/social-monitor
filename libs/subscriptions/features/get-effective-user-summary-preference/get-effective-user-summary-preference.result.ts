import type { UserSummaryPreferenceView } from '../shared/subscription-presenter';

export type EffectiveUserSummaryPreferenceSource = 'subscription' | 'topic' | 'none';

export type GetEffectiveUserSummaryPreferenceResult = {
  readonly summaryPreference?: UserSummaryPreferenceView;
  readonly source: EffectiveUserSummaryPreferenceSource;
};
