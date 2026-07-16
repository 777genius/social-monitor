import type {
  ReaderSummaryCitation,
  StoryCluster,
  SummaryEvidenceItem,
  TopReadCandidate,
} from "../index";
import {
  buildReaderSummaryAgentTopicEvidence,
  isReaderSummaryAgentTopicEvidenceEligible,
} from "./reader-summary-agent-topic-evidence-policy";

describe("reader summary agent topic evidence policy", () => {
  it.each([
    { label: "a score below the boundary", score: 0.559, accepted: false },
    { label: "a missing score", score: undefined, accepted: false },
    { label: "a non-finite score", score: Number.NaN, accepted: false },
    { label: "the exact boundary", score: 0.56, accepted: true },
  ])("treats $label as accepted=$accepted", ({ score, accepted }) => {
    expect(
      isReaderSummaryAgentTopicEvidenceEligible(
        evidence("feed-boundary", score),
      ),
    ).toBe(accepted);
  });

  it("also requires the existing top-read publication eligibility gate", () => {
    const item = evidence("feed-ineligible", 0.9);

    expect(
      isReaderSummaryAgentTopicEvidenceEligible({
        ...item,
        contentQuality: {
          ...item.contentQuality!,
          eligibleForTopRead: false,
        },
      }),
    ).toBe(false);
  });

  it("rebuilds clusters, citations and top stories without rejected representative metadata", () => {
    const rejectedSentinel = "REJECTED_REPRESENTATIVE_SENTINEL";
    const rejected = evidence("feed-rejected", 0.559, {
      providerKey: rejectedSentinel,
      title: rejectedSentinel,
      canonicalUrl: "https://rejected.example.test/sentinel",
    });
    const accepted = evidence("feed-accepted", 0.56, {
      title: "Accepted runtime evidence",
      canonicalUrl: "https://accepted.example.test/runtime",
    });
    const rejectedOnly = evidence("feed-rejected-only", undefined, {
      title: "Stale top story",
    });
    const result = buildReaderSummaryAgentTopicEvidence({
      requestedAt: new Date("2026-07-16T12:00:00.000Z"),
      selectedEvidence: [rejected, accepted, rejectedOnly],
      clusters: [
        cluster({
          id: "story:stable-correlation",
          storyKey: rejectedSentinel,
          representativeFeedItemId: rejected.feedItemId,
          duplicateFeedItemIds: [accepted.feedItemId],
          providerKeys: [rejectedSentinel, "rss"],
          whyImportant: [rejectedSentinel],
        }),
        cluster({
          id: "story:stale",
          storyKey: "stale",
          representativeFeedItemId: rejectedOnly.feedItemId,
          duplicateFeedItemIds: [],
          providerKeys: ["rss"],
          whyImportant: ["Stale"],
        }),
      ],
      citationMap: [
        citation("c-rejected", rejected),
        citation("c-accepted", accepted),
        {
          ...citation("c-stale", rejectedOnly),
          feedItemId: "feed-not-selected",
        },
      ],
      topStories: [
        topStory("story:stable-correlation", rejectedSentinel, [
          "c-rejected",
          "c-accepted",
        ]),
        topStory("story:stale", "Stale top story", ["c-stale"]),
      ],
    });

    expect(result.selectedEvidence.map((item) => item.feedItemId)).toEqual([
      "feed-accepted",
    ]);
    expect(result.clusters).toEqual([
      expect.objectContaining({
        id: "story:stable-correlation",
        storyKey: "url:accepted.example.test/runtime",
        representativeFeedItemId: "feed-accepted",
        duplicateFeedItemIds: [],
        providerKeys: ["rss"],
      }),
    ]);
    expect(result.citationMap).toEqual([
      expect.objectContaining({
        citationId: "c-accepted",
        feedItemId: "feed-accepted",
        sourceItemId: "source-feed-accepted",
        providerKey: "rss",
        canonicalUrl: "https://accepted.example.test/runtime",
      }),
    ]);
    expect(result.topStories).toEqual([
      expect.objectContaining({
        storyClusterId: "story:stable-correlation",
        title: "Accepted runtime evidence",
        providerKeys: ["rss"],
        citationIds: ["c-accepted"],
      }),
    ]);
    expect(JSON.stringify(result)).not.toContain(rejectedSentinel);
    expect(JSON.stringify(result)).not.toContain("Stale top story");
  });

  it("drops citations with stale lineage and removes their top-story references", () => {
    const accepted = evidence("feed-accepted", 0.9);
    const citationWithoutCanonicalUrl = {
      ...citation("c-current", accepted),
      canonicalUrl: undefined,
    };
    const result = buildReaderSummaryAgentTopicEvidence({
      requestedAt: new Date("2026-07-16T12:00:00.000Z"),
      selectedEvidence: [accepted],
      clusters: [
        cluster({
          id: "story:accepted",
          storyKey: "accepted-compatible-key",
          representativeFeedItemId: accepted.feedItemId,
          duplicateFeedItemIds: [],
          providerKeys: [accepted.providerKey],
          whyImportant: ["Accepted evidence"],
        }),
      ],
      citationMap: [
        {
          ...citation("c-stale-source", accepted),
          sourceItemId: "source-from-another-item",
        },
        {
          ...citation("c-stale-provider", accepted),
          providerKey: "another-provider",
        },
        {
          ...citation("c-stale-url", accepted),
          canonicalUrl: "https://stale.example.test/item",
        },
        citationWithoutCanonicalUrl,
      ],
      topStories: [
        topStory("story:accepted", "Accepted title", [
          "c-stale-source",
          "c-stale-provider",
          "c-stale-url",
          "c-current",
        ]),
      ],
    });

    expect(result.citationMap).toEqual([citationWithoutCanonicalUrl]);
    expect(result.citationMap[0]).toBe(citationWithoutCanonicalUrl);
    expect(result.topStories).toEqual([
      expect.objectContaining({ citationIds: ["c-current"] }),
    ]);
    expect(JSON.stringify(result)).not.toContain("c-stale");
  });

  it("preserves a trusted survivor story-key hint when rebuilding a cluster", () => {
    const rejected = evidence("feed-rejected", 0.559);
    const accepted = evidence("feed-accepted", 0.9, {
      canonicalUrl: "provider-native-item-without-a-canonical-url",
      storyKeyHint: "url:trusted.example.test/runtime-story",
    });
    const result = buildReaderSummaryAgentTopicEvidence({
      requestedAt: new Date("2026-07-16T12:00:00.000Z"),
      selectedEvidence: [rejected, accepted],
      clusters: [
        cluster({
          id: "story:stable-correlation",
          storyKey: "url:rejected.example.test/stale-story",
          representativeFeedItemId: rejected.feedItemId,
          duplicateFeedItemIds: [accepted.feedItemId],
          providerKeys: [rejected.providerKey, accepted.providerKey],
          whyImportant: ["Accepted survivor replaces rejected evidence"],
        }),
      ],
      citationMap: [citation("c-accepted", accepted)],
      topStories: [
        topStory("story:stable-correlation", "Stale title", ["c-accepted"]),
      ],
    });

    expect(result.clusters).toEqual([
      expect.objectContaining({
        storyKey: "url:trusted.example.test/runtime-story",
        representativeFeedItemId: accepted.feedItemId,
      }),
    ]);
  });

  it("preserves the accepted input projection exactly", () => {
    const selectedEvidence = [evidence("feed-accepted", 0.9)];
    const clusters = [
      cluster({
        id: "story:accepted",
        storyKey: "accepted-compatible-key",
        representativeFeedItemId: "feed-accepted",
        duplicateFeedItemIds: [],
        providerKeys: ["rss"],
        whyImportant: ["Accepted evidence"],
      }),
    ];
    const citationMap = [citation("c-accepted", selectedEvidence[0]!)];
    const topStories = [
      topStory("story:accepted", "Accepted title", ["c-accepted"]),
    ];
    const result = buildReaderSummaryAgentTopicEvidence({
      requestedAt: new Date("2026-07-16T12:00:00.000Z"),
      selectedEvidence,
      clusters,
      citationMap,
      topStories,
    });

    expect(result.selectedEvidence).toBe(selectedEvidence);
    expect(result.clusters).toBe(clusters);
    expect(result.citationMap).toBe(citationMap);
    expect(result.topStories).toBe(topStories);
  });
});

const evidence = (
  feedItemId: string,
  relevanceScore: number | undefined,
  overrides: Partial<SummaryEvidenceItem> = {},
): SummaryEvidenceItem => {
  const contentQuality =
    relevanceScore === undefined
      ? {}
      : {
          contentQuality: {
            qualityScore: 0.9,
            interestRelevanceScore: relevanceScore,
            engagementIntegrityScore: 0.9,
            eligibleForSummary: true,
            eligibleForTopRead: true,
            needsLlmReview: false,
            decision: "keep",
            flags: [],
            reason: "Eligible test evidence",
          },
        };

  return {
    feedItemId,
    sourceItemId: `source-${feedItemId}`,
    sourceBindingId: "binding-rss",
    interestId: "interest-runtime",
    providerKey: "rss",
    canonicalUrl: `https://example.test/${feedItemId}`,
    title: `Evidence ${feedItemId}`,
    bodyPreview: `Grounded body for ${feedItemId}`,
    publishedAt: new Date("2026-07-16T10:00:00.000Z"),
    observedAt: new Date("2026-07-16T10:05:00.000Z"),
    score: 1.2,
    whyImportant: [`Grounded reason for ${feedItemId}`],
    ...contentQuality,
    ...overrides,
  };
};

const cluster = (params: {
  readonly id: string;
  readonly storyKey: string;
  readonly representativeFeedItemId: string;
  readonly duplicateFeedItemIds: readonly string[];
  readonly providerKeys: readonly string[];
  readonly whyImportant: readonly string[];
}): StoryCluster => ({
  ...params,
  interestIds: ["interest-runtime"],
  score: 2,
  observedAtRange: {
    startedAt: new Date("2026-07-16T10:00:00.000Z"),
    endedAt: new Date("2026-07-16T11:00:00.000Z"),
  },
});

const citation = (
  citationId: string,
  item: SummaryEvidenceItem,
): ReaderSummaryCitation => ({
  citationId,
  feedItemId: item.feedItemId,
  sourceItemId: item.sourceItemId,
  providerKey: item.providerKey,
  field: "title",
  canonicalUrl: item.canonicalUrl,
});

const topStory = (
  storyClusterId: string,
  title: string,
  citationIds: readonly string[],
): TopReadCandidate => ({
  storyClusterId,
  title,
  summary: title,
  interestIds: ["interest-runtime"],
  providerKeys: ["rss"],
  citationIds,
});
