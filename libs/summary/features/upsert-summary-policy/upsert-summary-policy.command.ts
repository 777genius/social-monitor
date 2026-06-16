import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';
import type {
  SummaryPolicyFormat,
  SummaryPolicyLanguage,
  SummaryPolicyTone,
} from '../../domain';

export type UpsertSummaryPolicyCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
  readonly language: SummaryPolicyLanguage;
  readonly format: SummaryPolicyFormat;
  readonly tone: SummaryPolicyTone;
  readonly maxKeyPoints: number;
  readonly includeRisks: boolean;
  readonly includeSourceHighlights: boolean;
  readonly customInstructions?: string;
  readonly correlationId: string;
};
