import type { TenantId, WorkspaceId } from "@social-monitor/shared-kernel";
import type { SourceQuery } from "../../ports";

export type ExecuteScanCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scanJobId: string;
  readonly interestId: string;
  readonly sourceBindingId: string;
  readonly scanPolicyId: string;
  readonly providerKey: string;
  readonly sourceQuery: SourceQuery;
  readonly interestQuerySnapshot?: string;
  readonly correlationId: string;
  readonly causationId: string;
  readonly attemptNumber?: number;
  readonly retryBudget?: number;
  readonly workerId?: string;
  readonly leaseTtlSeconds?: number;
};
