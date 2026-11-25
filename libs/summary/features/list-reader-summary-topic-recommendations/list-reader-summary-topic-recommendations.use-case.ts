import {
  type Clock,
  DomainError,
  err,
  ok,
  type Result,
} from "@social-monitor/shared-kernel";

import {
  buildReaderSummaryPeriod,
  buildReaderSummaryTopicRecommendations,
  type ReaderSummaryScope,
  type ReaderSummaryTopicRecommendation,
  type ReaderSummaryTopicRecommendationDecision,
} from "../../domain";
import type {
  ReaderSummaryArtifactRepositoryPort,
  ReaderSummaryTopicCollectionMetricsReaderPort,
  ReaderSummaryTopicRecommendationDecisionRepositoryPort,
} from "../../ports";
import {
  NOOP_READER_SUMMARY_TOPIC_COLLECTION_METRICS_READER,
} from "../../ports/reader-summary-topic-collection-metrics.port";
import type { ListReaderSummaryTopicRecommendationsQuery } from "./list-reader-summary-topic-recommendations.query";
import type { ListReaderSummaryTopicRecommendationsResult } from "./list-reader-summary-topic-recommendations.result";

const MAX_ARTIFACT_SCAN_LIMIT = 120;

export class ListReaderSummaryTopicRecommendationsUseCase {
  constructor(
    private readonly readerSummaries: ReaderSummaryArtifactRepositoryPort,
    private readonly clock: Clock,
    private readonly topicCollectionMetrics: ReaderSummaryTopicCollectionMetricsReaderPort = NOOP_READER_SUMMARY_TOPIC_COLLECTION_METRICS_READER,
    private readonly topicRecommendationDecisions?: ReaderSummaryTopicRecommendationDecisionRepositoryPort,
  ) {}

  async execute(
    query: ListReaderSummaryTopicRecommendationsQuery,
  ): Promise<Result<ListReaderSummaryTopicRecommendationsResult, DomainError>> {
    const validation = validateQuery(query);
    if (!validation.ok) {
      return err(validation.error);
    }

    const windowEndedAt = this.clock.now();
    const windowStartedAt = new Date(
      windowEndedAt.getTime() - query.windowDays * 24 * 60 * 60 * 1000,
    );
    const scope = query.scope ?? { type: "workspace" };
    const artifacts = await this.readerSummaries.list({
      tenantId: query.tenantId,
      workspaceId: query.workspaceId,
      scope,
      periodStartedFrom: windowStartedAt,
      periodStartedBefore: windowEndedAt,
      limit: MAX_ARTIFACT_SCAN_LIMIT,
    });
    const recommendations = buildReaderSummaryTopicRecommendations({
      artifacts: artifacts.items.map((artifact) => artifact.toSnapshot()),
      windowDays: query.windowDays,
      limit: query.limit,
    });
    const items = await this.enrichRecommendations({
      query,
      scope,
      windowStartedAt,
      windowEndedAt,
      recommendations,
    });

    return ok({
      windowStartedAt,
      windowEndedAt,
      items,
    });
  }

  private async enrichRecommendations(params: {
    readonly query: ListReaderSummaryTopicRecommendationsQuery;
    readonly scope: ReaderSummaryScope;
    readonly windowStartedAt: Date;
    readonly windowEndedAt: Date;
    readonly recommendations: readonly ReaderSummaryTopicRecommendation[];
  }): Promise<readonly ReaderSummaryTopicRecommendation[]> {
    const period = buildReaderSummaryPeriod({
      cadence: "custom",
      startedAt: params.windowStartedAt,
      endedAt: params.windowEndedAt,
      timezone: "UTC",
    });
    const decisionsById = await this.loadDecisionsByRecommendationId({
      query: params.query,
      recommendationIds: params.recommendations.map(
        (recommendation) => recommendation.recommendationId,
      ),
    });

    return Promise.all(
      params.recommendations.map(async (recommendation) => {
        const metrics =
          await this.topicCollectionMetrics.readTopicCollectionMetrics({
            tenantId: params.query.tenantId,
            workspaceId: params.query.workspaceId,
            scope: params.scope,
            period,
            topicLabel: recommendation.topicLabel,
            interestIds: recommendation.interestIds,
          });
        const collectedPostCount =
          metrics?.collectedPostCount ?? recommendation.metrics.collectedPostCount;
        const decision = decisionsById.get(recommendation.recommendationId);

        return {
          ...recommendation,
          ...(decision === undefined
            ? {}
            : recommendationDecisionView(decision)),
          metrics: topicPerformanceMetrics({
            base: recommendation.metrics,
            collectedPostCount,
            lowRelevancePostCount: metrics?.lowRelevancePostCount,
            mutedPostCount: metrics?.mutedPostCount,
            userRatedPostCount: metrics?.userRatedPostCount,
          }),
        };
      }),
    );
  }

  private async loadDecisionsByRecommendationId(params: {
    readonly query: ListReaderSummaryTopicRecommendationsQuery;
    readonly recommendationIds: readonly string[];
  }): Promise<Map<string, ReaderSummaryTopicRecommendationDecision>> {
    if (
      this.topicRecommendationDecisions === undefined ||
      params.recommendationIds.length === 0
    ) {
      return new Map();
    }

    const decisions =
      await this.topicRecommendationDecisions.listByRecommendationIds({
        tenantId: params.query.tenantId,
        workspaceId: params.query.workspaceId,
        recommendationIds: params.recommendationIds,
      });

    return new Map(
      decisions.map((decision) => [
        decision.toSnapshot().recommendationId,
        decision,
      ]),
    );
  }
}

const recommendationDecisionView = (
  decision: ReaderSummaryTopicRecommendationDecision,
): Pick<
  ReaderSummaryTopicRecommendation,
  "decisionStatus" | "decidedAt" | "decidedBy" | "decisionNote"
> => {
  const snapshot = decision.toSnapshot();

  return {
    decisionStatus: snapshot.status,
    decidedAt: snapshot.decidedAt,
    decidedBy: snapshot.decidedBy,
    decisionNote: snapshot.note,
  };
};

const topicPerformanceMetrics = (params: {
  readonly base: ReaderSummaryTopicRecommendation["metrics"];
  readonly collectedPostCount: number;
  readonly lowRelevancePostCount?: number;
  readonly mutedPostCount?: number;
  readonly userRatedPostCount?: number;
}): ReaderSummaryTopicRecommendation["metrics"] => ({
  ...params.base,
  collectedPostCount: params.collectedPostCount,
  lowRelevanceSignalCount:
    params.lowRelevancePostCount ?? params.base.lowRelevanceSignalCount,
  mutedSignalCount: params.mutedPostCount ?? params.base.mutedSignalCount,
  userRatedSignalCount:
    params.userRatedPostCount ?? params.base.userRatedSignalCount,
  selectionRate: rate(
    params.base.selectedEvidenceCount,
    params.collectedPostCount,
  ),
  citationRate: rate(
    params.base.citationCount,
    params.base.selectedEvidenceCount,
  ),
  topReadRate: rate(params.base.topReadCount, params.base.selectedEvidenceCount),
  noiseRate: noiseRate({
    collectedPostCount: params.collectedPostCount,
    selectedEvidenceCount: params.base.selectedEvidenceCount,
  }),
});

const noiseRate = (params: {
  readonly collectedPostCount: number;
  readonly selectedEvidenceCount: number;
}): number => {
  if (params.collectedPostCount <= 0) {
    return 0;
  }

  return Number(
    Math.max(
      0,
      1 -
        Math.min(params.selectedEvidenceCount, params.collectedPostCount) /
          params.collectedPostCount,
    ).toFixed(3),
  );
};

const rate = (numerator: number, denominator: number): number => {
  if (denominator <= 0) {
    return 0;
  }

  return Number(Math.max(0, numerator / denominator).toFixed(3));
};

const validateQuery = (
  query: ListReaderSummaryTopicRecommendationsQuery,
): Result<true, DomainError> => {
  if (!Number.isInteger(query.windowDays) || query.windowDays < 3 || query.windowDays > 30) {
    return err(
      new DomainError(
        "validation.failed",
        "ReaderSummary topic recommendation windowDays must be between 3 and 30",
      ),
    );
  }

  if (!Number.isInteger(query.limit) || query.limit < 1 || query.limit > 20) {
    return err(
      new DomainError(
        "validation.failed",
        "ReaderSummary topic recommendation limit must be between 1 and 20",
      ),
    );
  }

  return ok(true);
};
