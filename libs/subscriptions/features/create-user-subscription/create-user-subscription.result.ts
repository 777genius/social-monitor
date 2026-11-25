import type { UserSubscriptionDetailView } from '../shared/subscription-presenter';

export type CreateUserSubscriptionResult = UserSubscriptionDetailView & {
  readonly created: boolean;
};
