import type { AcquireScanLeaseCommand, ScanLease, ScanLeasePort } from '../../ports';

// Process-local leases are handles, not authority conferred by a copied token.
// The owner lookup lets other in-memory persistence adapters check revocation
// synchronously with their write, without sharing one global lease store.
const leaseOwners = new WeakMap<ScanLease, InMemoryScanLeaseAdapter>();

export const isCurrentInMemoryScanLease = (lease: ScanLease, now: Date): boolean => {
  const current = leaseOwners.get(lease)?.current(lease);
  return current === lease && current.expiresAt > now;
};

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
    leaseOwners.set(lease, this);

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
