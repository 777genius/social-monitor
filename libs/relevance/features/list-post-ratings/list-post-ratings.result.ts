import type { PostRatingView } from '../shared/relevance-presenter';

export type ListPostRatingsResult = {
  readonly ratings: readonly PostRatingView[];
};
