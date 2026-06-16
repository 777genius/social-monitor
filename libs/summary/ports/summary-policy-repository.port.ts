import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SummaryPolicy } from '../domain';

export type FindSummaryPolicyByTopicQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly topicId: string;
};

export interface SummaryPolicyRepositoryPort {
  save(policy: SummaryPolicy): Promise<void>;
  findByTopic(query: FindSummaryPolicyByTopicQuery): Promise<SummaryPolicy | null>;
}
