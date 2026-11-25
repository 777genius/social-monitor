import type { InterestView } from '../shared/interest-presenter';

export type ListInterestsResult = {
  readonly interests: readonly InterestView[];
  readonly nextCursor?: string;
};
