import type {
  RankedFeedItemView,
  RelevanceMemoryGuidanceView,
} from '../rank-feed-items/rank-feed-items.result';

export type BuildPersonalizedDigestResult = {
  readonly userId: string;
  readonly status: 'assembled' | 'empty';
  readonly window: {
    readonly startedAt: string;
    readonly endedAt: string;
  };
  readonly interestIds: readonly string[];
  readonly memoryGuidance?: RelevanceMemoryGuidanceView;
  readonly items: readonly RankedFeedItemView[];
  readonly highSignalFeedItemIds: readonly string[];
};
