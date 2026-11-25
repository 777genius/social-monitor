import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { SummaryEvidenceSelection } from "../../ports";

export type LoadUserContextForSummaryQuery = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly interestId: string;
  readonly userId?: string | undefined;
  readonly subscriptionId?: string | undefined;
  readonly evidence: SummaryEvidenceSelection;
  readonly requestedAt: Date;
};
