import type { UserSubscriptionDetailView } from '../shared/subscription-presenter';

export type ListUserSubscriptionsResult = {
  readonly subscriptions: readonly UserSubscriptionDetailView[];
  readonly nextCursor?: string;
};
