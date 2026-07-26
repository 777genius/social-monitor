import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type { ScanAttempt } from '../../../domain';
import type { FindScanAttemptQuery, ScanAttemptRepositoryPort } from '../../../ports';
import type { PrismaIngestionClient } from './prisma-ingestion-client';
import { scanAttemptFromPrisma, scanAttemptStatusToPrisma } from './prisma-ingestion-records';

export class PrismaScanAttemptRepository implements ScanAttemptRepositoryPort {
  constructor(private readonly prisma: PrismaIngestionClient) {}

  async save(attempt: ScanAttempt): Promise<void> {
    const snapshot = attempt.toSnapshot();
    const status = scanAttemptStatusToPrisma(snapshot.status);

    await withPrismaWriteRetry(() => this.prisma.scanAttempt.upsert({
      where: { scanJobId: snapshot.scanJobId },
      update: {
        status,
        attemptNumber: snapshot.attemptNumber,
        startedAt: snapshot.startedAt,
        finishedAt: snapshot.finishedAt ?? null,
        fetched: snapshot.fetched,
        inserted: snapshot.inserted,
        skippedDuplicates: snapshot.skippedDuplicates,
        projected: snapshot.projected,
        failureReason: snapshot.failureReason ?? null,
      },
      create: {
        scanJobId: snapshot.scanJobId,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        sourceBindingId: snapshot.sourceBindingId,
        attemptNumber: snapshot.attemptNumber,
        status,
        startedAt: snapshot.startedAt,
        finishedAt: snapshot.finishedAt ?? null,
        fetched: snapshot.fetched,
        inserted: snapshot.inserted,
        skippedDuplicates: snapshot.skippedDuplicates,
        projected: snapshot.projected,
        failureReason: snapshot.failureReason ?? null,
      },
    }));
  }

  async findByScanJob(query: FindScanAttemptQuery): Promise<ScanAttempt | null> {
    const record = await this.prisma.scanAttempt.findFirst({
      where: {
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        scanJobId: query.scanJobId,
      },
    });

    return record === null ? null : scanAttemptFromPrisma(record);
  }
}
