import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryScope } from "../../domain";

export type RequestReaderSummaryCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scope: ReaderSummaryScope;
  readonly userId?: string;
  readonly subscriptionId?: string;
  readonly idempotencyKey: string;
  readonly correlationId: string;
};
