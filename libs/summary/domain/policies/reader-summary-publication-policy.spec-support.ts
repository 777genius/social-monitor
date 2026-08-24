import type { SummaryEvidenceContentQuality } from
  "../value-objects/summary-evidence-item";

export const publicationStoryCluster = (
  overrides: {
    readonly id?: string;
    readonly representativeFeedItemId?: string;
    readonly duplicateFeedItemIds?: readonly string[];
    readonly providerKeys?: readonly string[];
  } = {},
) => ({
  id: overrides.id ?? "story-publication-1",
  storyKey: overrides.id ?? "publication-quality",
  representativeFeedItemId:
    overrides.representativeFeedItemId ?? "feed-publication-1",
  duplicateFeedItemIds: overrides.duplicateFeedItemIds ?? [],
  interestIds: ["interest-ai"],
  providerKeys: overrides.providerKeys ?? ["reddit"],
  score: 1,
  observedAtRange: {
    startedAt: new Date("2026-07-05T08:00:00.000Z"),
    endedAt: new Date("2026-07-05T09:00:00.000Z"),
  },
  whyImportant: ["Relevant discussion"],
});

export const publicationCitation = (
  overrides: {
    readonly citationId?: string;
    readonly feedItemId?: string;
    readonly sourceItemId?: string;
    readonly providerKey?: string;
    readonly canonicalUrl?: string;
  } = {},
) => ({
  citationId: overrides.citationId ?? "citation-publication-1",
  feedItemId: overrides.feedItemId ?? "feed-publication-1",
  sourceItemId: overrides.sourceItemId ?? "source-publication-1",
  providerKey: overrides.providerKey ?? "reddit",
  field: "title" as const,
  canonicalUrl: overrides.canonicalUrl ?? "https://reddit.example.test/post",
});

export const publicationContentQuality: SummaryEvidenceContentQuality = {
  qualityScore: 0.8,
  interestRelevanceScore: 0.8,
  engagementIntegrityScore: 0.8,
  eligibleForSummary: true,
  eligibleForTopRead: true,
  needsLlmReview: false,
  decision: "eligible",
  flags: [],
  reason: "Strong signal",
};
