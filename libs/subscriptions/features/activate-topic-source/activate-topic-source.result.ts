import type { CreateUserSubscriptionResult } from '../create-user-subscription/create-user-subscription.result';

export type ActivateTopicSourceResult = CreateUserSubscriptionResult & {
  readonly topicId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly activation: {
    readonly topicCreated: boolean;
    readonly sourceBindingCreated: boolean;
    readonly scanPolicyCreated: boolean;
    readonly scanPolicyUpdated: boolean;
  };
};
