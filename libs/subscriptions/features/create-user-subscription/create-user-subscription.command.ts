import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';
import type {
  UserSubscriptionDeliveryChannel,
  UserSummaryPreferenceFormat,
  UserSummaryPreferenceLanguage,
  UserSummaryPreferenceTone,
} from '../../domain';

export type CreateUserSubscriptionScheduleCommand = {
  readonly recipientKey: string;
  readonly channel: UserSubscriptionDeliveryChannel;
  readonly intervalSeconds: number;
  readonly includeNoSignal: boolean;
  readonly nextRunAt?: Date;
};

export type CreateUserSubscriptionSummaryPreferenceCommand = {
  readonly language?: UserSummaryPreferenceLanguage;
  readonly format?: UserSummaryPreferenceFormat;
  readonly tone?: UserSummaryPreferenceTone;
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
