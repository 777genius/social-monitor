import {
  isGitHubTrendingEvidence,
  selectGitHubTrendingSupplementalEvidence,
  type SummaryEvidenceSelection,
} from "../domain";
import {
  composeReaderSummaryEditorialSlate,
  materializeReaderSummaryEditorialSlate,
} from "../adapters/evidence/reader-summary-editorial-slate";

export const makeReaderEvidenceSelection = (
  overrides: {
    readonly firstContentQuality?: SummaryEvidenceSelection["selectedEvidence"][number]["contentQuality"];
  } = {},
): SummaryEvidenceSelection => withReaderPromotionEditorialSlate(
  makeUnmaterializedReaderEvidenceSelection(overrides),
);

export const makeUnmaterializedReaderEvidenceSelection = (
  overrides: {
    readonly firstContentQuality?: SummaryEvidenceSelection["selectedEvidence"][number]["contentQuality"];
  } = {},
): SummaryEvidenceSelection => ({
  rankingPolicyVersion: "story-ranking.v1",
  personalization: {
    memoryGuidanceStatus: "available",
    memoryGuidanceApplied: true,
    providerPreferenceCount: 1,
    keywordPreferenceCount: 2,
    mutedKeywordCount: 0,
    blockedProviderCount: 0,
    signals: ["provider:reddit", "keyword:runtime-regression"],
  },
  sourceWindow: {
    windowId: "window-1",
    startedAt: new Date("2026-06-26T07:00:00.000Z"),
    endedAt: new Date("2026-06-26T08:00:00.000Z"),
    periodStartedAt: new Date("2026-06-26T00:00:00.000Z"),
    periodEndedAt: new Date("2026-06-27T00:00:00.000Z"),
    ingestionCutoff: new Date("2026-06-26T08:00:00.000Z"),
    selectedFeedItemIds: ["feed-1", "feed-2"],
    storyClusterIds: ["cluster-1", "cluster-2"],
  },
  clusters: [readerCluster(), githubCluster()],
  selectedEvidence: [
    readerEvidence(overrides.firstContentQuality),
    githubEvidence(),
  ],
});

export const makeRelatedReaderEvidenceSelection = (): SummaryEvidenceSelection => {
  const base = makeUnmaterializedReaderEvidenceSelection();
  const relatedQuality = eligibleReaderEvidenceQuality();
  const relatedEvidence: SummaryEvidenceSelection["selectedEvidence"][number] = {
    ...readerEvidence(),
    feedItemId: "feed-related",
    sourceItemId: "hn-related",
    sourceBindingId: "binding-hn-related",
    providerKey: "hacker-news",
    providerName: "Hacker News",
    canonicalUrl: "https://news.example.test/item/related",
    title: "Related topic should stay contextual",
    promotionFacts: {
      contentKind: "story",
      canonicalIdentity: "story:related-topic",
      safetyValid: true,
      freshnessValid: true,
      freshnessProvenance: {
        status: "observed",
        publishedAt: new Date("2026-06-26T07:10:00.000Z"),
        observedAt: new Date("2026-06-26T07:20:00.000Z"),
        ingestionCutoff: new Date("2026-06-26T08:00:00.000Z"),
      },
      metricsState: "observed",
      metrics: { provider: "hacker_news", points: 500 },
    },
  };
  return withReaderPromotionEditorialSlate({
    ...base,
    sourceWindow: {
      ...base.sourceWindow,
      selectedFeedItemIds: [...base.sourceWindow.selectedFeedItemIds, "feed-related"],
      storyClusterIds: [...base.sourceWindow.storyClusterIds, "cluster-related"],
    },
    clusters: [...base.clusters, {
      ...readerCluster(),
      id: "cluster-related",
      storyKey: "related-topic",
      representativeFeedItemId: "feed-related",
      providerKeys: ["hacker-news"],
    }],
    selectedEvidence: [...base.selectedEvidence, relatedEvidence],
    relatedTopicRelations: [{
      relationId: "relation:related-topic",
      subjectStoryClusterId: "cluster-related",
      targetStoryClusterId: "cluster-1",
      subjectFeedItemId: "feed-related",
      subjectProviderKey: "hacker-news",
      subjectSourceItemId: "hn-related",
      subjectCanonicalUrl: relatedEvidence.canonicalUrl,
      subjectProviderMetrics: [],
      officialAnchorFeedItemId: "feed-1",
      officialAnchorProviderKey: "reddit",
      officialAnchorSourceItemId: "reddit-post-1",
      officialAnchorContentQuality: relatedQuality,
      subjectIsOfficial: false,
      officialAnchorIsOfficial: true,
    }],
  });
};

export const withReaderPromotionEditorialSlate = (
  selection: SummaryEvidenceSelection,
): SummaryEvidenceSelection => {
  const relatedContextIds = new Set(
    (selection.relatedTopicRelations ?? []).map(
      (relation) => relation.subjectFeedItemId,
    ),
  );
  const selectionWithoutRelatedContext = {
    ...selection,
    selectedEvidence: selection.selectedEvidence.filter(
      (item) => !relatedContextIds.has(item.feedItemId),
    ),
  };
  const candidates = selectionWithoutRelatedContext.selectedEvidence.filter(
    (item) => !isGitHubTrendingEvidence(item),
  );
  const slate = composeReaderSummaryEditorialSlate({
    selection: selectionWithoutRelatedContext,
    candidates,
  });

  const materialized = materializeReaderSummaryEditorialSlate({
    selection: selectionWithoutRelatedContext,
    slate,
    supplementalEvidence: selectGitHubTrendingSupplementalEvidence(
      selection.selectedEvidence,
    ),
  });
  return materialized;
};

const readerCluster = (): SummaryEvidenceSelection["clusters"][number] => ({
  id: "cluster-1",
  storyKey: "runtime-regression",
  representativeFeedItemId: "feed-1",
  duplicateFeedItemIds: [],
  interestIds: ["interest-reader-ai"],
  providerKeys: ["reddit"],
  score: 2.2,
  observedAtRange: {
    startedAt: new Date("2026-06-26T07:20:00.000Z"),
    endedAt: new Date("2026-06-26T07:20:00.000Z"),
  },
  whyImportant: ["Matches user preference"],
});

export const githubCluster = (
): SummaryEvidenceSelection["clusters"][number] => ({
  id: "cluster-2",
  storyKey: "github-release",
  representativeFeedItemId: "feed-2",
  duplicateFeedItemIds: [],
  interestIds: ["interest-reader-ai"],
  providerKeys: ["github-trending-page"],
  score: 0.9,
  observedAtRange: {
    startedAt: new Date("2026-06-26T07:30:00.000Z"),
    endedAt: new Date("2026-06-26T07:30:00.000Z"),
  },
  whyImportant: ["Strong source engagement signal"],
});

export const githubEvidence = (
): SummaryEvidenceSelection["selectedEvidence"][number] => ({
  feedItemId: "feed-2",
  sourceItemId: "github-trending-1",
  sourceBindingId: "binding-github",
  interestId: "interest-reader-ai",
  providerKey: "github-trending-page",
  providerName: "GitHub Trending",
  canonicalUrl: "https://github.com/example/project",
  title: "Example project trends on GitHub",
  publishedAt: new Date("2026-06-26T07:20:00.000Z"),
  observedAt: new Date("2026-06-26T07:30:00.000Z"),
  score: 0.9,
  whyImportant: ["Strong source engagement signal"],
  contentQuality: eligibleReaderEvidenceQuality(),
});

const readerEvidence = (
  contentQuality: SummaryEvidenceSelection["selectedEvidence"][number]["contentQuality"] =
    eligibleReaderEvidenceQuality(),
): SummaryEvidenceSelection["selectedEvidence"][number] => ({
  feedItemId: "feed-1",
  sourceItemId: "reddit-post-1",
  sourceBindingId: "binding-reddit",
  interestId: "interest-reader-ai",
  providerKey: "reddit",
  providerName: "Reddit",
  canonicalUrl: "https://reddit.example.test/post-1",
  title: "Runtime regression discussion",
  bodyPreview: "Users are discussing a runtime regression.",
  publishedAt: new Date("2026-06-26T07:10:00.000Z"),
  observedAt: new Date("2026-06-26T07:20:00.000Z"),
  score: 2.2,
  whyImportant: ["Matches user preference"],
  providerMetricLabels: [{ label: "Score", value: "50" }],
  promotionFacts: {
    contentKind: "original_post",
    canonicalIdentity: "story:runtime-regression",
    safetyValid: true,
    freshnessValid: true,
    engagementAuthority: {
      observedAt: new Date("2026-06-26T07:50:00.000Z"),
      regressionState: "stable",
    },
    freshnessProvenance: {
      status: "observed",
      publishedAt: new Date("2026-06-26T07:10:00.000Z"),
      observedAt: new Date("2026-06-26T07:20:00.000Z"),
      ingestionCutoff: new Date("2026-06-26T08:00:00.000Z"),
    },
    metricsState: "observed",
    metrics: {
      provider: "reddit",
      score: 50,
      upvoteRatio: 0.6,
    },
  },
  contentQuality,
});

const eligibleReaderEvidenceQuality = () => ({
  qualityScore: 0.9,
  interestRelevanceScore: 0.9,
  engagementIntegrityScore: 0.9,
  eligibleForSummary: true,
  eligibleForTopRead: true,
  needsLlmReview: false,
  decision: "keep",
  flags: [],
  reason: "Eligible reader summary evidence.",
});
