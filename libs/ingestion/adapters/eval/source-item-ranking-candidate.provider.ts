import {
  createSourceItemRankingPlan,
  rankSourceItems,
  sourceItemRankingBreakdown,
} from '../../domain';
import type { RankingCandidateProviderPort } from '../../ports';

type RankableEvalCandidate = {
  readonly candidateId: string;
  readonly title: string;
  readonly body: string;
  readonly authorHandle?: string;
  readonly publishedAt: Date;
  readonly metadata?: unknown;
};

export class SourceItemRankingCandidateProvider
  implements RankingCandidateProviderPort
{
  async rankCandidates(params: Parameters<RankingCandidateProviderPort['rankCandidates']>[0]) {
    const queries = params.evalCase.rankingQueries ?? [
      params.evalCase.topic,
      ...params.evalCase.queryLanes.map((lane) => lane.query),
    ];
    const plan = createSourceItemRankingPlan({
      mode: params.evalCase.rankingMode,
      queries,
    });
    const rankableCandidates: readonly RankableEvalCandidate[] =
      params.evalCase.candidates.map((candidate) => ({
        candidateId: candidate.candidateId,
        title: candidate.title,
        body: candidate.body,
        authorHandle: candidate.authorHandle,
        publishedAt: candidate.publishedAt,
        metadata: candidate.metadata,
      }));
    const rankedCandidates = rankSourceItems(rankableCandidates, plan);

    return {
      rankingId: `source-item-ranking:${plan.mode}`,
      rankedCandidateIds: rankedCandidates.map((candidate) => candidate.candidateId),
      metadata: {
        rankingMode: plan.mode,
        queryCount: plan.queries.length,
        topBreakdowns: rankedCandidates.slice(0, 10).map((candidate) => ({
          candidateId: candidate.candidateId,
          ...sourceItemRankingBreakdown(candidate, plan),
        })),
      },
    };
  }
}
