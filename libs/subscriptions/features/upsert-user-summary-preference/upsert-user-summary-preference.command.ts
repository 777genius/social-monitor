import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';
import type {
  SummaryPolicyFormat,
  SummaryPolicyLanguage,
  SummaryPolicyTone,
} from '@social-monitor/summary/domain';

export type UpsertUserSummaryPreferenceCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: string;
  readonly subscriptionId?: string;
  readonly topicId?: string;
  readonly language?: SummaryPolicyLanguage;
  readonly format?: SummaryPolicyFormat;
  readonly tone?: SummaryPolicyTone;
  readonly maxKeyPoints?: number;
  readonly includeRisks?: boolean;
  readonly includeSourceHighlights?: boolean;
  readonly customInstructions?: string;
};
