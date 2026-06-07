import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ReserveUsageQuotaCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly subjectKey: string;
  readonly operation: string;
  readonly amount: number;
  readonly limit: number;
  readonly windowStartedAt: Date;
  readonly windowEndsAt: Date;
};

export type ReserveUsageQuotaResult = {
  readonly allowed: boolean;
  readonly consumed: number;
  readonly remaining: number;
};

export interface UsageQuotaLedgerPort {
  reserve(command: ReserveUsageQuotaCommand): Promise<ReserveUsageQuotaResult>;
}
