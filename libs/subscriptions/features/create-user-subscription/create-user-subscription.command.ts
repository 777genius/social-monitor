import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';
import type { DeliveryChannel } from '@social-monitor/delivery/domain';
import type {
  SummaryPolicyFormat,
  SummaryPolicyLanguage,
  SummaryPolicyTone,
} from '@social-monitor/summary/domain';

export type CreateUserSubscriptionScheduleCommand = {
  readonly recipientKey: string;
  readonly channel: DeliveryChannel;
  readonly intervalSeconds: number;
  readonly includeNoSignal: boolean;
  readonly nextRunAt?: Date;
};

export type CreateUserSubscriptionSummaryPreferenceCommand = {
  readonly language?: SummaryPolicyLanguage;
  readonly format?: SummaryPolicyFormat;
  readonly tone?: SummaryPolicyTone;
  readonly maxKeyPoints?: number;
  readonly includeRisks?: boolean;
  readonly includeSourceHighlights?: boolean;
  readonly customInstructions?: string;
};

export type CreateUserSubscriptionCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: string;
  readonly providerKey: string;
  readonly targetKind: string;
  readonly targetValue: string;
  readonly targetConfig: Readonly<Record<string, unknown>>;
  readonly schedule: CreateUserSubscriptionScheduleCommand;
  readonly summaryPreference?: CreateUserSubscriptionSummaryPreferenceCommand;
};
