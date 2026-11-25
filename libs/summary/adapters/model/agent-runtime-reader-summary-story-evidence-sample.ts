import { boundedRelevantSourceExcerpt } from "./agent-runtime-reader-summary-story-source-excerpt";

export const evidenceSample = (item: {
  readonly providerKey: string;
  readonly title: string;
  readonly bodyPreview?: string;
  readonly sourceText?: string;
  readonly authorHandle?: string;
  readonly canonicalUrl: string;
  readonly publishedAt: Date;
}, relevanceTerms: readonly string[] = []): Record<string, unknown> => ({
  providerKey: item.providerKey,
  title: item.title,
  bodyPreview: item.bodyPreview?.slice(0, 640),
  sourceText: boundedRelevantSourceExcerpt(item.sourceText, relevanceTerms),
  authorHandle: item.authorHandle,
  canonicalUrl: item.canonicalUrl,
  publishedAt: item.publishedAt.toISOString(),
});
