export type ReaderSummaryWindow = {
  readonly windowId: string;
  readonly startedAt: Date;
  readonly endedAt: Date;
  readonly selectedFeedItemIds: readonly string[];
  readonly storyClusterIds: readonly string[];
};
