export type AlgoliaHit = {
  readonly objectID?: string;
  readonly title?: string;
  readonly story_title?: string;
  readonly story_id?: number;
  readonly parent_id?: number;
  readonly url?: string;
  readonly author?: string;
  readonly created_at_i?: number;
  readonly story_text?: string;
  readonly comment_text?: string;
  readonly points?: number;
  readonly num_comments?: number;
};

export type AlgoliaSearchResponse = {
  readonly hits?: readonly AlgoliaHit[];
  readonly nbHits?: number;
  readonly nbPages?: number;
  readonly page?: number;
  readonly exhaustiveNbHits?: boolean;
  readonly exhaustive?: { readonly nbHits?: boolean };
};
