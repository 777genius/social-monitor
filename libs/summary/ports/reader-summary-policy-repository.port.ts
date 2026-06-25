import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryPolicy, ReaderSummaryScope } from "../domain";

export type FindReaderSummaryPolicyByScopeQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: ReaderSummaryScope;
};

export interface ReaderSummaryPolicyRepositoryPort {
  save(policy: ReaderSummaryPolicy): Promise<void>;
  findByScope(
    query: FindReaderSummaryPolicyByScopeQuery,
  ): Promise<ReaderSummaryPolicy | null>;
}
