import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";
import type { IdGenerator } from "@social-monitor/shared-kernel";

import type { ReaderSummaryTopicRecommendationDecision } from "../../../domain";
import type {
  ListReaderSummaryTopicRecommendationDecisionsQuery,
  ReaderSummaryTopicRecommendationDecisionLookup,
  ReaderSummaryTopicRecommendationDecisionRepositoryPort,
} from "../../../ports";
import { readerSummaryTopicRecommendationDecisionFromPrisma } from "./prisma-reader-summary-topic-recommendation-decision-records";
import type { PrismaSummaryClient } from "./prisma-summary-client";

export class PrismaReaderSummaryTopicRecommendationDecisionRepository implements ReaderSummaryTopicRecommendationDecisionRepositoryPort {
  constructor(
    private readonly prisma: PrismaSummaryClient,
    private readonly ids: IdGenerator,
  ) {}

  async save(
    decision: ReaderSummaryTopicRecommendationDecision,
  ): Promise<void> {
    const snapshot = decision.toSnapshot();
    const mutation = {
      topicLabel: snapshot.topicLabel,
      status: snapshot.status,
      decidedBy: snapshot.decidedBy,
      note: snapshot.note ?? null,
      decidedAt: snapshot.decidedAt,
      application: snapshot.application ?? null,
    };

    await withPrismaWriteRetry(() =>
      this.prisma.readerSummaryTopicRecommendationDecision.upsert({
        where: {
          tenantId_workspaceId_recommendationId: {
            tenantId: snapshot.tenantId,
            workspaceId: snapshot.workspaceId,
            recommendationId: snapshot.recommendationId,
          },
        },
        update: mutation,
        create: {
          ...mutation,
          id: this.ids.generate(),
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          recommendationId: snapshot.recommendationId,
        },
      }),
    );
  }

  async findByRecommendationId(
    lookup: ReaderSummaryTopicRecommendationDecisionLookup,
  ): Promise<ReaderSummaryTopicRecommendationDecision | null> {
    const record =
      await this.prisma.readerSummaryTopicRecommendationDecision.findUnique({
        where: {
          tenantId_workspaceId_recommendationId: {
            tenantId: lookup.tenantId,
            workspaceId: lookup.workspaceId,
            recommendationId: lookup.recommendationId,
          },
        },
      });

    return record === null
      ? null
      : readerSummaryTopicRecommendationDecisionFromPrisma(record);
  }

  async deleteByRecommendationId(
    lookup: ReaderSummaryTopicRecommendationDecisionLookup,
  ): Promise<void> {
    await withPrismaWriteRetry(() =>
      this.prisma.readerSummaryTopicRecommendationDecision.deleteMany({
        where: {
          tenantId: lookup.tenantId,
          workspaceId: lookup.workspaceId,
          recommendationId: lookup.recommendationId,
        },
      }),
    );
  }

  async listByRecommendationIds(
    query: ListReaderSummaryTopicRecommendationDecisionsQuery,
  ): Promise<readonly ReaderSummaryTopicRecommendationDecision[]> {
    if (query.recommendationIds.length === 0) {
      return [];
    }

    const records =
      await this.prisma.readerSummaryTopicRecommendationDecision.findMany({
        where: {
          tenantId: query.tenantId,
          workspaceId: query.workspaceId,
          recommendationId: { in: query.recommendationIds },
        },
      });

    return records.map(readerSummaryTopicRecommendationDecisionFromPrisma);
  }
}
