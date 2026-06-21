import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';
import type {
  SummaryPolicyFormat,
  SummaryPolicyLanguage,
  SummaryPolicyTone,
} from '../domain';

export type UserSummaryPreferenceOverlay = {
  readonly language?: SummaryPolicyLanguage;
  readonly format?: SummaryPolicyFormat;
  readonly tone?: SummaryPolicyTone;
  readonly maxKeyPoints?: number;
  readonly includeRisks?: boolean;
  readonly includeSourceHighlights?: boolean;
  readonly customInstructions?: string;
  readonly rulesVersion: string;
};

export type FindEffectiveUserSummaryPreferenceQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly userId: string;
  readonly subscriptionId?: string;
  readonly topicId: string;
};

export interface UserSummaryPreferenceReaderPort {
  findEffectivePreference(
    query: FindEffectiveUserSummaryPreferenceQuery,
  ): Promise<UserSummaryPreferenceOverlay | null>;
}
