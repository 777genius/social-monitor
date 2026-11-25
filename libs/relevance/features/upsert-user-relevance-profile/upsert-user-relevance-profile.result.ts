import type { UserRelevanceProfileView } from '../shared/relevance-presenter';

export type UpsertUserRelevanceProfileResult = {
  readonly profile: UserRelevanceProfileView;
  readonly created: boolean;
};
