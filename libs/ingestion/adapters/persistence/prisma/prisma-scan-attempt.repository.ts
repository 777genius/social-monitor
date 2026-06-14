import type { ScanAttempt } from '../../../domain';
import type { FindScanAttemptQuery, ScanAttemptRepositoryPort } from '../../../ports';
import type { PrismaIngestionClient } from './prisma-ingestion-client';
import { scanAttemptFromPrisma, scanAttemptStatusToPrisma } from './prisma-ingestion-records';

export class PrismaScanAttemptRepository implements ScanAttemptRepositoryPort {
  constructor(private readonly prisma: PrismaIngestionClient) {}

  async save(attempt: ScanAttempt): Promise<void> {
    const snapshot = attempt.toSnapshot();
    const status = scanAttemptStatusToPrisma(snapshot.status);

    await this.prisma.scanAttempt.upsert({
      where: { scanJobId: snapshot.scanJobId },
      update: {
        status,
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
        status,
        startedAt: snapshot.startedAt,
        finishedAt: snapshot.finishedAt ?? null,
        fetched: snapshot.fetched,
        inserted: snapshot.inserted,
        skippedDuplicates: snapshot.skippedDuplicates,
        projected: snapshot.projected,
        failureReason: snapshot.failureReason ?? null,
      },
    });
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
