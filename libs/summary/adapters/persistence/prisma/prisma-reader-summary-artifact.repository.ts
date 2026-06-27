import { withPrismaWriteRetry } from "@social-monitor/platform-persistence";

import {
  readerSummaryScopeKey,
  type ReaderSummaryArtifact,
} from "../../../domain";
import type {
  ListReaderSummaryArtifactsQuery,
  ListReaderSummaryArtifactsResult,
  ReaderSummaryArtifactRepositoryPort,
} from "../../../ports";
import type { PrismaSummaryClient } from "./prisma-summary-client";
import {
  readerSummaryArtifactFromPrisma,
  readerSummaryArtifactStatusToPrisma,
  readerSummaryQualitySignalsToPrisma,
  readerSummaryScopeToPrisma,
  serializeReaderSummaryArtifact,
} from "./prisma-reader-summary-records";
import {
  encodeSummaryCursor,
  parseSummaryCursor,
} from "./prisma-summary-records";

const VISIBLE_READER_SUMMARY_STATUSES = ["COMPLETED", "NO_SIGNAL"] as const;

export class PrismaReaderSummaryArtifactRepository implements ReaderSummaryArtifactRepositoryPort {
  constructor(private readonly prisma: PrismaSummaryClient) {}

  async save(artifact: ReaderSummaryArtifact): Promise<void> {
    const snapshot = artifact.toSnapshot();
    const status = readerSummaryArtifactStatusToPrisma(artifact);
    const artifactPayload = serializeReaderSummaryArtifact(artifact);
    const scopeFields = readerSummaryScopeToPrisma(snapshot.scope);

    await withPrismaWriteRetry(() =>
      this.prisma.readerSummaryArtifact.upsert({
        where: { id: snapshot.readerSummaryId },
        update: {
          ...scopeFields,
          cadence: snapshot.period.cadence,
          periodStartedAt: snapshot.period.startedAt,
          periodEndedAt: snapshot.period.endedAt,
          periodTimezone: snapshot.period.timezone,
          periodKey: snapshot.period.periodKey,
          status,
          userId: snapshot.userId ?? null,
          subscriptionId: snapshot.subscriptionId ?? null,
          modelVersion: snapshot.lineage.modelVersion,
          promptVersion: snapshot.lineage.promptVersion,
          headline: snapshot.headline,
          summaryText: snapshot.executiveSummary,
          artifactPayload,
          citations: snapshot.citationMap,
          qualitySignals: readerSummaryQualitySignalsToPrisma(artifact),
        },
        create: {
          id: snapshot.readerSummaryId,
          tenantId: snapshot.tenantId,
          workspaceId: snapshot.workspaceId,
          ...scopeFields,
          cadence: snapshot.period.cadence,
          periodStartedAt: snapshot.period.startedAt,
          periodEndedAt: snapshot.period.endedAt,
          periodTimezone: snapshot.period.timezone,
          periodKey: snapshot.period.periodKey,
          userId: snapshot.userId ?? null,
          subscriptionId: snapshot.subscriptionId ?? null,
          status,
          schemaVersion: 1,
          modelVersion: snapshot.lineage.modelVersion,
          promptVersion: snapshot.lineage.promptVersion,
          headline: snapshot.headline,
          summaryText: snapshot.executiveSummary,
          artifactPayload,
          citations: snapshot.citationMap,
          qualitySignals: readerSummaryQualitySignalsToPrisma(artifact),
        },
      }),
    );
  }

  async list(
    query: ListReaderSummaryArtifactsQuery,
  ): Promise<ListReaderSummaryArtifactsResult> {
    const offset = parseSummaryCursor(query.cursor);
    const where = {
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      scopeKey:
        query.scope === undefined
          ? undefined
          : readerSummaryScopeKey(query.scope),
      cadence: query.cadence,
      periodStartedAt: periodStartedAtWhere(query),
      periodEndedAt: query.periodEndedAt,
      periodTimezone: query.timezone,
      status: { in: VISIBLE_READER_SUMMARY_STATUSES },
    };
    const [records, total] = await Promise.all([
      this.prisma.readerSummaryArtifact.findMany({
        where,
        orderBy: [{ periodStartedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
        skip: offset,
        take: query.limit,
      }),
      this.prisma.readerSummaryArtifact.count({ where }),
    ]);
    const items = records.map((record) =>
      readerSummaryArtifactFromPrisma(record),
    );
    const nextOffset = offset + items.length;

    return {
      items,
      nextCursor:
        nextOffset < total ? encodeSummaryCursor(nextOffset) : undefined,
    };
  }

  async findById(
    params: Parameters<ReaderSummaryArtifactRepositoryPort["findById"]>[0],
  ): Promise<ReaderSummaryArtifact | null> {
    const record = await this.prisma.readerSummaryArtifact.findFirst({
      where: {
        tenantId: params.tenantId,
        workspaceId: params.workspaceId,
        id: params.readerSummaryId,
      },
    });

    return record === null ? null : readerSummaryArtifactFromPrisma(record);
  }
}

const periodStartedAtWhere = (query: ListReaderSummaryArtifactsQuery) => {
  if (
    query.periodStartedAt === undefined &&
    query.periodStartedFrom === undefined &&
    query.periodStartedBefore === undefined
  ) {
    return undefined;
  }

  if (
    query.periodStartedFrom === undefined &&
    query.periodStartedBefore === undefined
  ) {
    return query.periodStartedAt;
  }

  return {
    equals: query.periodStartedAt,
    gte: query.periodStartedFrom,
    lt: query.periodStartedBefore,
  };
};
