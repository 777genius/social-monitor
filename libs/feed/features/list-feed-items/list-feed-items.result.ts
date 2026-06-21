export type FeedItemListEntry = {
  readonly id: string;
  readonly topicId: string;
  readonly sourceItemId: string;
  readonly sourceBindingId: string;
  readonly providerKey: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly bodyPreview: string;
  readonly authorHandle?: string;
  readonly publishedAt: string;
  readonly observedAt: string;
};

export type ListFeedItemsUseCaseResult = {
  readonly items: readonly FeedItemListEntry[];
  readonly nextCursor?: string;
};
