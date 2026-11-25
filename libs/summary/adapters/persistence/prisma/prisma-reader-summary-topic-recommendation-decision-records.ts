import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  ReaderSummaryTopicRecommendationDecision,
  type ReaderSummaryTopicRecommendationApplicationSnapshot,
} from "../../../domain";

export type PrismaReaderSummaryTopicRecommendationDecisionRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly recommendationId: string;
  readonly topicLabel: string;
  readonly status: string;
  readonly decidedBy: string;
  readonly note: string | null;
  readonly decidedAt: Date;
  readonly application: unknown | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export const readerSummaryTopicRecommendationDecisionFromPrisma = (
  record: PrismaReaderSummaryTopicRecommendationDecisionRecord,
): ReaderSummaryTopicRecommendationDecision =>
  ReaderSummaryTopicRecommendationDecision.record({
    tenantId: tenantId(record.tenantId),
    workspaceId: workspaceId(record.workspaceId),
    recommendationId: record.recommendationId,
    topicLabel: record.topicLabel,
    status: normalizeReaderSummaryTopicRecommendationDecisionStatus(
      record.status,
    ),
    decidedBy: record.decidedBy,
    note: record.note ?? undefined,
    decidedAt: record.decidedAt,
    application: readerSummaryTopicRecommendationApplicationFromPrisma(
      record.application,
    ),
  });

const normalizeReaderSummaryTopicRecommendationDecisionStatus = (
  value: string,
): "accepted" | "rejected" => {
  if (value === "accepted" || value === "rejected") {
    return value;
  }

  throw new Error(
    `Unsupported reader summary topic recommendation decision status "${value}"`,
  );
};

const readerSummaryTopicRecommendationApplicationFromPrisma = (
  value: unknown | null,
): ReaderSummaryTopicRecommendationApplicationSnapshot | undefined => {
  if (value === null || value === undefined) {
    return undefined;
  }

  return value as ReaderSummaryTopicRecommendationApplicationSnapshot;
};
