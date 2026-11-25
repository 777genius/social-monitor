import type { PostRatingView } from '../shared/relevance-presenter';

export type RecordPostRatingResult = {
  readonly rating: PostRatingView;
  readonly created: boolean;
  readonly learningDirection: 'recorded';
};
