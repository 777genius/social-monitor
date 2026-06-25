import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryScope, SummaryEvidenceSelection } from "../domain";

export interface ReaderSummaryEvidenceSelectorPort {
  select(params: {
    readonly tenantId: TenantId;
    readonly workspaceId: WorkspaceId;
    readonly scope: ReaderSummaryScope;
    readonly userId?: string;
    readonly subscriptionId?: string;
    readonly maxItems: number;
  }): Promise<SummaryEvidenceSelection>;
}
