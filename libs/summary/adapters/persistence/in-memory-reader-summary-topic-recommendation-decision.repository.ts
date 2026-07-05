import type { ReaderSummaryTopicRecommendationDecision } from "../../domain";
import type {
  ListReaderSummaryTopicRecommendationDecisionsQuery,
  ReaderSummaryTopicRecommendationDecisionLookup,
  ReaderSummaryTopicRecommendationDecisionRepositoryPort,
} from "../../ports";

export class InMemoryReaderSummaryTopicRecommendationDecisionRepository
  implements ReaderSummaryTopicRecommendationDecisionRepositoryPort
{
  private readonly decisionsByKey = new Map<
    string,
    ReaderSummaryTopicRecommendationDecision
  >();

  async save(
    decision: ReaderSummaryTopicRecommendationDecision,
  ): Promise<void> {
    const snapshot = decision.toSnapshot();
    this.decisionsByKey.set(
      decisionKey({
        tenantId: snapshot.tenantId,
        workspaceId: snapshot.workspaceId,
        recommendationId: snapshot.recommendationId,
      }),
      decision,
    );
  }

  async listByRecommendationIds(
    query: ListReaderSummaryTopicRecommendationDecisionsQuery,
  ): Promise<readonly ReaderSummaryTopicRecommendationDecision[]> {
    return query.recommendationIds.flatMap((recommendationId) => {
      const decision = this.decisionsByKey.get(
        decisionKey({
          tenantId: query.tenantId,
          workspaceId: query.workspaceId,
          recommendationId,
        }),
      );

      return decision === undefined ? [] : [decision];
    });
  }

  async findByRecommendationId(
    lookup: ReaderSummaryTopicRecommendationDecisionLookup,
  ): Promise<ReaderSummaryTopicRecommendationDecision | null> {
    return this.decisionsByKey.get(decisionKey(lookup)) ?? null;
  }

  async deleteByRecommendationId(
    lookup: ReaderSummaryTopicRecommendationDecisionLookup,
  ): Promise<void> {
    this.decisionsByKey.delete(decisionKey(lookup));
  }
}

const decisionKey = (params: {
  readonly tenantId: string;
  readonly workspaceId: string;
  readonly recommendationId: string;
}): string =>
  [params.tenantId, params.workspaceId, params.recommendationId].join(":");
