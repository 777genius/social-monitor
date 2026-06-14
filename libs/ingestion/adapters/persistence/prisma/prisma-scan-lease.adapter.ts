import type { IdGenerator } from '@social-monitor/shared-kernel';

import type { AcquireScanLeaseCommand, ScanLease, ScanLeasePort } from '../../../ports';
import type { PrismaIngestionClient } from './prisma-ingestion-client';
import { scanLeaseFromPrisma } from './prisma-ingestion-records';

export class PrismaScanLeaseAdapter implements ScanLeasePort {
  constructor(
    private readonly prisma: PrismaIngestionClient,
    private readonly ids: IdGenerator,
  ) {}

  async acquire(command: AcquireScanLeaseCommand): Promise<ScanLease | null> {
    await this.prisma.scanLeaseEntry.deleteMany({
      where: {
        tenantId: command.tenantId,
        workspaceId: command.workspaceId,
        scanJobId: command.scanJobId,
        expiresAt: { lte: command.leasedAt },
      },
    });

    const expiresAt = new Date(command.leasedAt.getTime() + command.ttlSeconds * 1000);
    const fencingToken = `${command.scanJobId}:${command.workerId}:${command.leasedAt.getTime()}`;

    try {
      const record = await this.prisma.scanLeaseEntry.create({
        data: {
          id: this.ids.generate(),
          tenantId: command.tenantId,
          workspaceId: command.workspaceId,
          scanJobId: command.scanJobId,
          workerId: command.workerId,
          fencingToken,
          leasedAt: command.leasedAt,
          expiresAt,
        },
      });

      return scanLeaseFromPrisma(record);
    } catch (error) {
      if (isUniqueLeaseConflict(error)) {
        return null;
      }

      throw error;
    }
  }

  async release(lease: ScanLease): Promise<void> {
    await this.prisma.scanLeaseEntry.deleteMany({
      where: {
        tenantId: lease.tenantId,
        workspaceId: lease.workspaceId,
        scanJobId: lease.scanJobId,
        fencingToken: lease.fencingToken,
      },
    });
  }
}

const isUniqueLeaseConflict = (error: unknown): boolean => {
  if (!(error instanceof Error)) {
    return false;
  }

  const code = (error as { readonly code?: unknown }).code;

  if (code === 'P2002') {
    return true;
  }

  const message = error.message.toLowerCase();

  return message.includes('unique') || message.includes('duplicate key');
};
