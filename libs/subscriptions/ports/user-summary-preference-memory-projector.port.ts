import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';
import type {
  UserSummaryPreferenceFormat,
  UserSummaryPreferenceLanguage,
  UserSummaryPreferenceTone,
} from '../domain';

export type RecordUserSummaryPreferenceMemoryCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly preferenceId: string;
  readonly userId: string;
  readonly subscriptionId?: string | undefined;
  readonly interestId?: string | undefined;
  readonly language?: UserSummaryPreferenceLanguage | undefined;
  readonly format?: UserSummaryPreferenceFormat | undefined;
  readonly tone?: UserSummaryPreferenceTone | undefined;
  readonly maxKeyPoints?: number | undefined;
  readonly includeRisks?: boolean | undefined;
  readonly includeSourceHighlights?: boolean | undefined;
  readonly customInstructions?: string | undefined;
  readonly rulesVersion: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type UserSummaryPreferenceMemoryProjectionResult = {
  readonly status: 'disabled' | 'written' | 'skipped' | 'unavailable';
  readonly diagnostics?: Readonly<Record<string, unknown>> | undefined;
};

export interface UserSummaryPreferenceMemoryProjectorPort {
  recordUserSummaryPreference(
    command: RecordUserSummaryPreferenceMemoryCommand,
  ): Promise<UserSummaryPreferenceMemoryProjectionResult>;
}

export const NOOP_USER_SUMMARY_PREFERENCE_MEMORY_PROJECTOR: UserSummaryPreferenceMemoryProjectorPort = {
  async recordUserSummaryPreference() {
    return {
      status: 'disabled',
      diagnostics: { mode: 'disabled' },
    };
  },
};
