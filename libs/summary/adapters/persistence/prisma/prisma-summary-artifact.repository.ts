import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type { SummaryArtifact } from '../../../domain';
import type {
  ListSummaryArtifactsQuery,
  ListSummaryArtifactsResult,
  SummaryArtifactRepositoryPort,
} from '../../../ports';
import type { PrismaSummaryClient } from './prisma-summary-client';
import {
  encodeSummaryCursor,
  parseSummaryCursor,
  summaryArtifactFromPrisma,
} from './prisma-summary-records';

import { summaryArtifactWrite } from './prisma-summary-execution-writes';

const VISIBLE_SUMMARY_STATUSES = ['COMPLETED', 'NO_SIGNAL'] as const;

export class PrismaSummaryArtifactRepository implements SummaryArtifactRepositoryPort {
  constructor(private readonly prisma: PrismaSummaryClient) {}

  async save(artifact: SummaryArtifact): Promise<void> {
    await withPrismaWriteRetry(() => this.prisma.summaryArtifact.upsert(summaryArtifactWrite(artifact)));
  }

  async list(query: ListSummaryArtifactsQuery): Promise<ListSummaryArtifactsResult> {
    const offset = parseSummaryCursor(query.cursor);
    const where = {
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      interestId: query.interestId,
      status: { in: VISIBLE_SUMMARY_STATUSES },
    };
    const [records, total] = await Promise.all([
      this.prisma.summaryArtifact.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: offset,
        take: query.limit,
      }),
      this.prisma.summaryArtifact.count({ where }),
    ]);
    const items = records.map((record) => summaryArtifactFromPrisma(record));
    const nextOffset = offset + items.length;

    return {
      items,
      nextCursor: nextOffset < total ? encodeSummaryCursor(nextOffset) : undefined,
    };
  }

  async findById(
    params: Parameters<SummaryArtifactRepositoryPort['findById']>[0],
  ): Promise<SummaryArtifact | null> {
    const record = await this.prisma.summaryArtifact.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        id: params.summaryId,
      },
    });

    return record === null ? null : summaryArtifactFromPrisma(record);
  }
}
