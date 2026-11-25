import type { TenantId, WorkspaceId } from '@social-monitor/shared-kernel';

export type AcquireScanLeaseCommand = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scanJobId: string;
  readonly workerId: string;
  readonly leasedAt: Date;
  readonly ttlSeconds: number;
};

export type ScanLease = {
  readonly tenantId: TenantId;
  readonly workspaceId: WorkspaceId;
  readonly scanJobId: string;
  readonly workerId: string;
  readonly fencingToken: string;
  readonly leasedAt: Date;
  readonly expiresAt: Date;
};

export interface ScanLeasePort {
  acquire(command: AcquireScanLeaseCommand): Promise<ScanLease | null>;
  release(lease: ScanLease): Promise<void>;
}
