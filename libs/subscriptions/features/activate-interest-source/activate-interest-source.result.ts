import type { CreateUserSubscriptionResult } from '../create-user-subscription/create-user-subscription.result';

export type ActivateInterestSourceResult = CreateUserSubscriptionResult & {
  readonly interestId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly activation: {
    readonly interestCreated: boolean;
    readonly sourceBindingCreated: boolean;
    readonly scanPolicyCreated: boolean;
    readonly scanPolicyUpdated: boolean;
  };
};
