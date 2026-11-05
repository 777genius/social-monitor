import type { CommandOutboxStorePort } from '@social-monitor/platform-queue';
import type { FakePrismaMonitoringClient } from './scan-dispatch-prisma.fixture';

type Lease = { owner: string; expiresAt: Date; attempts: number; availableAt: Date };

// Deterministic bridge over the same rows written by PrismaScanDispatchAdapter.
// The real command dispatcher owns publication; this fixture models its leases.
export class ScanDispatchFixtureOutbox implements CommandOutboxStorePort {
  private readonly leases = new Map<string, Lease>();
  constructor(private readonly prisma: FakePrismaMonitoringClient) {}

  async claimPending(params: Parameters<CommandOutboxStorePort['claimPending']>[0]) {
    return [...this.prisma.outboxEvents.values()].filter((row) => {
      const lease = this.leases.get(row.id);
      return row.messageKind === 'COMMAND' && row.status === 'PENDING' &&
        (lease === undefined || lease.expiresAt <= params.now && lease.availableAt <= params.now);
    }).slice(0, params.limit).map((row) => {
      const attempts = (this.leases.get(row.id)?.attempts ?? 0) + 1;
      this.leases.set(row.id, { owner: params.leaseOwner, expiresAt: params.leasedUntil,
        attempts, availableAt: params.now });
      if (row.payload === null || typeof row.payload !== 'object' || Array.isArray(row.payload)) {
        throw new Error('Invalid fixture command payload');
      }
      return { id: row.id, publishAttempt: attempts,
        command: { commandId: row.id, commandType: row.eventType, schemaVersion: row.schemaVersion,
          correlationId: row.correlationId, causationId: row.causationId ?? undefined,
          payload: row.payload as Readonly<Record<string, unknown>> } };
    });
  }

  async renewClaims(params: Parameters<CommandOutboxStorePort['renewClaims']>[0]): Promise<boolean> {
    if (params.ids.some((id) => !this.owned(id, params.leaseOwner, params.now))) return false;
    for (const id of params.ids) this.leases.get(id)!.expiresAt = params.leasedUntil;
    return true;
  }

  async markPublished(params: Parameters<CommandOutboxStorePort['markPublished']>[0]): Promise<void> {
    if (!this.owned(params.id, params.leaseOwner, params.publishedAt)) throw new Error('Fixture lease lost');
    const row = this.prisma.outboxEvents.get(params.id)!;
    this.prisma.outboxEvents.set(params.id, { ...row, status: 'PUBLISHED', publishedAt: params.publishedAt });
  }

  async markFailed(params: Parameters<CommandOutboxStorePort['markFailed']>[0]): Promise<void> {
    if (!this.owned(params.id, params.leaseOwner, params.failedAt)) throw new Error('Fixture lease lost');
    const row = this.prisma.outboxEvents.get(params.id)!;
    this.prisma.outboxEvents.set(params.id, { ...row, status: params.terminal ? 'FAILED' : 'PENDING' });
    const lease = this.leases.get(params.id)!;
    lease.owner = '';
    lease.expiresAt = params.failedAt;
    lease.availableAt = params.availableAt;
  }

  private owned(id: string, owner: string, at: Date): boolean {
    const lease = this.leases.get(id);
    return this.prisma.outboxEvents.get(id)?.status === 'PENDING' && lease?.owner === owner && lease.expiresAt > at;
  }
}
