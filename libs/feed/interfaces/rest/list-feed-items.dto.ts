export type FeedItemDto = {
  readonly id: string;
  readonly topicId: string;
  readonly sourceItemId: string;
  readonly sourceBindingId: string;
  readonly canonicalUrl: string;
  readonly title: string;
  readonly bodyPreview: string;
  readonly authorHandle?: string;
  readonly publishedAt: string;
  readonly observedAt: string;
};

export type ListFeedItemsResponseDto = {
  readonly items: readonly FeedItemDto[];
  readonly nextCursor?: string;
};

export type GetFeedItemResponseDto = FeedItemDto;
