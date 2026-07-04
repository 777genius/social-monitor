import type { JsonObject } from '@social-monitor/shared-kernel';

import type { RankingEvalCase } from '../domain';

export type RankingCandidateProviderResult = {
  readonly rankingId: string;
  readonly rankedCandidateIds: readonly string[];
  readonly metadata?: JsonObject;
};

export type RankingCandidateProviderPort = {
  rankCandidates(params: {
    readonly evalCase: RankingEvalCase;
  }): Promise<RankingCandidateProviderResult>;
};
