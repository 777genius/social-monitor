import type { DomainError, Result, TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type ReserveManualScanRequestQuotaCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly sourceBindingId: string;
};

export type ReserveManualScanRequestQuotaResult = {
  readonly remaining: number;
  readonly resetAt: string;
};

export interface ScanRequestQuotaPort {
  reserveManualScanRequest(
    command: ReserveManualScanRequestQuotaCommand,
  ): Promise<Result<ReserveManualScanRequestQuotaResult, DomainError>>;
}
