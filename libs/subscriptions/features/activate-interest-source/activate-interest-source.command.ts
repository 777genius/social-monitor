import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type {
  CreateUserSubscriptionScheduleCommand,
  CreateUserSubscriptionSummaryPreferenceCommand,
} from '../create-user-subscription/create-user-subscription.command';

export type ActivateInterestSourceScanPolicyCommand = {
  readonly intervalSeconds?: number;
  readonly freshnessSeconds?: number;
  readonly retryBudget?: number;
};

export type ActivateInterestSourceCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: string;
  readonly providerKey: string;
  readonly targetKind: string;
  readonly targetValue: string;
  readonly targetConfig: Readonly<Record<string, unknown>>;
  readonly schedule: CreateUserSubscriptionScheduleCommand;
  readonly summaryPreference?: CreateUserSubscriptionSummaryPreferenceCommand;
  readonly scanPolicy?: ActivateInterestSourceScanPolicyCommand;
  readonly idempotencyKey: string;
  readonly correlationId: string;
};
