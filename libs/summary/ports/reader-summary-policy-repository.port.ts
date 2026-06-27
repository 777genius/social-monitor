import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryPolicy, ReaderSummaryScope } from "../domain";

export type FindReaderSummaryPolicyByScopeQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: ReaderSummaryScope;
};

export type ListScheduledReaderSummaryPoliciesQuery = {
  readonly tenantId?: TenantId;
  readonly workspaceId?: WorkspaceId;
  readonly limit: number;
};

export interface ReaderSummaryPolicyRepositoryPort {
  save(policy: ReaderSummaryPolicy): Promise<void>;
  findByScope(
    query: FindReaderSummaryPolicyByScopeQuery,
  ): Promise<ReaderSummaryPolicy | null>;
  listScheduled(
    query: ListScheduledReaderSummaryPoliciesQuery,
  ): Promise<readonly ReaderSummaryPolicy[]>;
}
