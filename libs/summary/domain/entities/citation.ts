export type ReaderSummaryCitation = {
  readonly citationId: string;
  readonly feedItemId: string;
  readonly sourceItemId: string;
  readonly providerKey: string;
  readonly field: "title" | "bodyPreview" | "canonicalUrl";
  readonly canonicalUrl?: string;
};
