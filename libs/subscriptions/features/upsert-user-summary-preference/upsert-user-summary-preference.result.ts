import type { UserSummaryPreferenceView } from '../shared/subscription-presenter';

export type UpsertUserSummaryPreferenceResult = {
  readonly summaryPreference: UserSummaryPreferenceView;
  readonly created: boolean;
};
