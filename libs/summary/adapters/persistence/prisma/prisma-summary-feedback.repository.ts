import { withPrismaWriteRetry } from '@social-monitor/platform-persistence';
import type { SummaryFeedback } from '../../../domain';
import type {
  FindSummaryFeedbackByIdempotencyKeyQuery,
  ExportSummaryFeedbackQuery,
  ExportSummaryFeedbackResult,
  ListSummaryFeedbackQuery,
  ListSummaryFeedbackResult,
  SummaryFeedbackExportRepositoryPort,
  SummaryFeedbackRepositoryPort,
} from '../../../ports';
import type { PrismaSummaryClient } from './prisma-summary-client';
import { summaryFeedbackFromPrisma } from './prisma-summary-records';

export class PrismaSummaryFeedbackRepository implements SummaryFeedbackRepositoryPort, SummaryFeedbackExportRepositoryPort {
  constructor(private readonly prisma: PrismaSummaryClient) {}

  async save(feedback: SummaryFeedback): Promise<void> {
    const snapshot = feedback.toSnapshot();
    const data = {
      submittedBy: snapshot.submittedBy,
      rating: snapshot.rating,
      category: snapshot.category,
      triageOwner: snapshot.triageOwner,
      eligibleForEvalFixture: snapshot.eligibleForEvalFixture,
      note: snapshot.comment ?? null,
      evidence: snapshot.evidence,
    };

    await withPrismaWriteRetry(() => this.prisma.summaryFeedback.upsert({
      where: {
        tenantId_idempotencyKey: {
          tenantId: snapshot.tenantId,
          idempotencyKey: snapshot.idempotencyKey,
        },
      },
      update: data,
      create: {
        id: snapshot.id,
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        summaryArtifactId: snapshot.summaryId,
        interestId: snapshot.interestId,
        idempotencyKey: snapshot.idempotencyKey,
        createdAt: snapshot.createdAt,
        ...data,
      },
    }));
  }

  async findByIdempotencyKey(
    query: FindSummaryFeedbackByIdempotencyKeyQuery,
  ): Promise<SummaryFeedback | null> {
    const record = await this.prisma.summaryFeedback.findFirst({
      where: {
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        idempotencyKey: query.idempotencyKey,
      },
    });

    return record === null ? null : summaryFeedbackFromPrisma(record);
  }

  async list(query: ListSummaryFeedbackQuery): Promise<ListSummaryFeedbackResult> {
    const offset = parseCursor(query.cursor);
    const [items, total] = await Promise.all([
      this.prisma.summaryFeedback.findMany({
        where: {
          tenantId: query.tenantId,
          workspaceId: query.workspaceId,
          summaryArtifactId: query.summaryId,
        },
        orderBy: [
          { createdAt: 'desc' },
          { id: 'desc' },
        ],
        skip: offset,
        take: query.limit,
      }),
      this.prisma.summaryFeedback.count({
        where: {
          tenantId: query.tenantId,
          workspaceId: query.workspaceId,
          summaryArtifactId: query.summaryId,
        },
      }),
    ]);
    const nextOffset = offset + items.length;

    return {
      items: items.map(summaryFeedbackFromPrisma),
      nextCursor: nextOffset < total ? encodeCursor(nextOffset) : undefined,
    };
  }

  async exportForReleaseEvidence(query: ExportSummaryFeedbackQuery): Promise<ExportSummaryFeedbackResult> {
    const items = await this.prisma.summaryFeedback.findMany({
      where: {
        tenantId: query.tenantId,
        workspaceId: query.workspaceId,
        createdAt: {
          gte: query.startedAt,
          lte: query.endedAt,
        },
      },
      orderBy: [
        { createdAt: 'desc' },
        { id: 'desc' },
      ],
      skip: 0,
      take: query.limit,
    });

    return { items: items.map(summaryFeedbackFromPrisma) };
  }
}

const encodeCursor = (offset: number): string => Buffer.from(JSON.stringify({ offset })).toString('base64url');

const parseCursor = (cursor: string | undefined): number => {
  if (cursor === undefined) {
    return 0;
  }

  try {
    const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { offset?: unknown };

    if (typeof parsed.offset === 'number' && Number.isInteger(parsed.offset) && parsed.offset >= 0) {
      return parsed.offset;
    }
  } catch {
    return 0;
  }

  return 0;
};
