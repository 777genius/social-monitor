import type { StoryCluster, SummaryEvidenceItem, SummaryEvidenceSelection } from "../../domain";
import { composeReaderSummaryEditorialSlate } from "./reader-summary-editorial-slate";
const periodStartedAt = new Date("2026-08-29T00:00:00.000Z");
const periodEndedAt = new Date("2026-08-30T00:00:00.000Z");
const publishedAt = new Date("2026-08-29T12:00:00.000Z");
const observedAt = new Date("2026-08-29T13:00:00.000Z");

export const compose = (
  items: readonly SummaryEvidenceItem[],
  clusters = items.map((item) => storyCluster(item.feedItemId, [item])),
) => composeReaderSummaryEditorialSlate({
  selection: selection(items, clusters),
  candidates: items,
});

export const selection = (
  items: readonly SummaryEvidenceItem[],
  clusters: readonly StoryCluster[],
): SummaryEvidenceSelection => ({
  rankingPolicyVersion: "fixture",
  sourceWindow: {
    windowId: "window-1",
    startedAt: periodStartedAt,
    endedAt: periodEndedAt,
    periodStartedAt,
    periodEndedAt,
    ingestionCutoff: periodEndedAt,
    selectedFeedItemIds: items.map((item) => item.feedItemId),
    storyClusterIds: clusters.map((cluster) => cluster.id),
  },
  selectedEvidence: items,
  clusters,
});

export const xEvidence = (
  id: string,
  likes: number,
  overrides: {
    readonly relevanceScore?: number;
    readonly canonicalIdentity?: string;
  } = {},
): SummaryEvidenceItem => evidence({
  id,
  providerKey: "x-twitter",
  contentKind: "original_post",
  canonicalIdentity: overrides.canonicalIdentity ?? `story:${id}`,
  relevanceScore: overrides.relevanceScore,
  metrics: {
    provider: "x",
    likes,
    reposts: 0,
    weightedScore: likes,
  },
});

export const redditEvidence = (
  id: string,
  score: number,
  overrides: { readonly canonicalIdentity?: string } = {},
): SummaryEvidenceItem => evidence({
  id,
  providerKey: "reddit",
  contentKind: "original_post",
  canonicalIdentity: overrides.canonicalIdentity ?? `story:${id}`,
  metrics: { provider: "reddit", score, upvoteRatio: 0.9 },
});

export const hackerNewsEvidence = (
  id: string,
  points: number,
): SummaryEvidenceItem => evidence({
  id,
  providerKey: "hacker-news",
  contentKind: "story",
  canonicalIdentity: `story:${id}`,
  metrics: { provider: "hacker_news", points },
});

const evidence = (params: {
  readonly id: string;
  readonly providerKey: string;
  readonly contentKind: "original_post" | "story";
  readonly canonicalIdentity: string;
  readonly relevanceScore?: number;
  readonly metrics: NonNullable<
    NonNullable<SummaryEvidenceItem["promotionFacts"]>["metrics"]
  >;
}): SummaryEvidenceItem => ({
  feedItemId: params.id,
  sourceItemId: `source-${params.id}`,
  sourceBindingId: `binding-${params.id}`,
  interestId: "interest-ai",
  providerKey: params.providerKey,
  canonicalUrl: `https://example.test/${params.id}`,
  title: `Concrete product update ${params.id}`,
  bodyPreview: "A concrete self-contained product update.",
  publishedAt,
  observedAt,
  score: 1,
  whyImportant: ["It changes a concrete workflow."],
  contentQuality: {
    qualityScore: 0.9,
    interestRelevanceScore: params.relevanceScore ?? 0.9,
    engagementIntegrityScore: 0.9,
    eligibleForSummary: true,
    eligibleForTopRead: true,
    needsLlmReview: false,
    decision: "allow",
    flags: [],
    reason: "fixture",
  },
  promotionFacts: {
    contentKind: params.contentKind,
    canonicalIdentity: params.canonicalIdentity,
    safetyValid: true,
    freshnessValid: true,
    engagementAuthority: {
      observedAt: new Date("2026-08-29T23:00:00.000Z"),
      regressionState: "stable",
    },
    freshnessProvenance: {
      status: "observed",
      publishedAt,
      observedAt,
      ingestionCutoff: periodEndedAt,
    },
    metricsState: "observed",
    metrics: params.metrics,
  },
});

export const storyCluster = (
  id: string,
  items: readonly SummaryEvidenceItem[],
): StoryCluster => ({
  id: `cluster-${id}`,
  storyKey: items[0]?.promotionFacts?.canonicalIdentity ?? id,
  representativeFeedItemId: items[0]!.feedItemId,
  duplicateFeedItemIds: items.slice(1).map((item) => item.feedItemId),
  interestIds: ["interest-ai"],
  providerKeys: [...new Set(items.map((item) => item.providerKey))],
  score: 1,
  observedAtRange: { startedAt: observedAt, endedAt: observedAt },
  whyImportant: ["It changes a concrete workflow."],
});
