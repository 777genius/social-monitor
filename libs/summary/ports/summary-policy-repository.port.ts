import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

import type { SummaryPolicy } from '../domain';

export type FindSummaryPolicyByInterestQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
};

export interface SummaryPolicyRepositoryPort {
  save(policy: SummaryPolicy): Promise<void>;
  findByInterest(query: FindSummaryPolicyByInterestQuery): Promise<SummaryPolicy | null>;
}
