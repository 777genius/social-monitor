import type { FeedNormalizedSignal } from "../value-objects/feed-normalized-signal";
import type { FeedProviderMetrics } from "../value-objects/feed-provider-metrics";

export type FeedSignal = {
  readonly feedItemId: string;
  readonly providerMetrics: FeedProviderMetrics;
  readonly normalizedSignal: FeedNormalizedSignal;
};

export const createFeedSignal = (props: FeedSignal): FeedSignal => {
  if (props.feedItemId.trim().length === 0) {
    throw new Error("Feed signal feed item id must be non-empty");
  }
  if (!Number.isFinite(props.normalizedSignal.score)) {
    throw new Error("Feed signal normalized score must be finite");
  }
  if (props.normalizedSignal.score < 0 || props.normalizedSignal.score > 100) {
    throw new Error("Feed signal normalized score must be between 0 and 100");
  }

  return props;
};
