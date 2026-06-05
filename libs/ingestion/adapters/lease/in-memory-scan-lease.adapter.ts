import type { AcquireScanLeaseCommand, ScanLease, ScanLeasePort } from '../../ports';

export class InMemoryScanLeaseAdapter implements ScanLeasePort {
  private readonly leases = new Map<string, ScanLease>();

  async acquire(command: AcquireScanLeaseCommand): Promise<ScanLease | null> {
    const key = leaseKey(command);
    const existing = this.leases.get(key);

    if (existing !== undefined && existing.expiresAt.getTime() > command.leasedAt.getTime()) {
      return null;
    }

    const lease: ScanLease = {
      tenantId: command.tenantId,
      workspaceId: command.workspaceId,
      scanJobId: command.scanJobId,
      workerId: command.workerId,
      fencingToken: `${command.scanJobId}:${command.workerId}:${command.leasedAt.getTime()}`,
      leasedAt: command.leasedAt,
      expiresAt: new Date(command.leasedAt.getTime() + command.ttlSeconds * 1000),
    };
    this.leases.set(key, lease);

    return lease;
  }

  async release(lease: ScanLease): Promise<void> {
    const key = leaseKey(lease);
    const existing = this.leases.get(key);

    if (existing?.fencingToken === lease.fencingToken) {
      this.leases.delete(key);
    }
  }

  current(params: Pick<ScanLease, 'tenantId' | 'workspaceId' | 'scanJobId'>): ScanLease | null {
    return this.leases.get(leaseKey(params)) ?? null;
  }
}

const leaseKey = (params: Pick<ScanLease, 'tenantId' | 'workspaceId' | 'scanJobId'>): string =>
  `${params.tenantId}:${params.workspaceId}:${params.scanJobId}`;
