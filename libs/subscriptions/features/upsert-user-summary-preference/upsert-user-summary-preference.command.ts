import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';
import type {
  UserSummaryPreferenceFormat,
  UserSummaryPreferenceLanguage,
  UserSummaryPreferenceTone,
} from '../../domain';

export type UpsertUserSummaryPreferenceCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: string;
  readonly subscriptionId?: string;
  readonly interestId?: string;
  readonly language?: UserSummaryPreferenceLanguage;
  readonly format?: UserSummaryPreferenceFormat;
  readonly tone?: UserSummaryPreferenceTone;
  readonly maxKeyPoints?: number;
  readonly includeRisks?: boolean;
  readonly includeSourceHighlights?: boolean;
  readonly customInstructions?: string;
};
