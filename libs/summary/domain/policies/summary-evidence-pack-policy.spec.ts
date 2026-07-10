import { providerMetric } from "../value-objects/provider-metric-label";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { buildSummaryEvidencePack } from "./summary-evidence-pack-policy";

describe("buildSummaryEvidencePack", () => {
  it("groups selected evidence into structured summary buckets", () => {
    const pack = buildSummaryEvidencePack({
      rankingPolicyVersion: "story-ranking.v1",
      sourceWindow: {
        windowId: "window-1",
        startedAt: new Date("2026-07-04T00:00:00.000Z"),
        endedAt: new Date("2026-07-04T01:00:00.000Z"),
        selectedFeedItemIds: ["feed-github", "feed-reddit", "feed-x"],
        storyClusterIds: ["cluster-1"],
      },
      clusters: [
        {
          id: "cluster-1",
          storyKey: "release",
          representativeFeedItemId: "feed-github",
          duplicateFeedItemIds: ["feed-x"],
          interestIds: ["interest-1"],
          providerKeys: ["github", "x-twitter"],
          score: 10,
          observedAtRange: {
            startedAt: new Date("2026-07-04T00:10:00.000Z"),
            endedAt: new Date("2026-07-04T00:20:00.000Z"),
          },
          whyImportant: ["Cross-provider release signal."],
        },
      ],
      selectedEvidence: [
        evidenceItem({
          feedItemId: "feed-github",
          providerKey: "github",
          title: "Repository maintainers publish release notes",
          score: 0.9,
          matchedRules: ["official-release"],
        }),
        evidenceItem({
          feedItemId: "feed-reddit",
          providerKey: "reddit",
          title: "Users disagree with the release claim",
          score: 0.7,
          contentQuality: {
            qualityScore: 0.4,
            interestRelevanceScore: 0.4,
            engagementIntegrityScore: 0.8,
            eligibleForSummary: true,
            eligibleForTopRead: false,
            needsLlmReview: true,
            decision: "downrank",
            flags: ["dissent"],
            reason: "Needs corroboration.",
          },
          providerMetricLabels: [providerMetric("score", 120)].flatMap(
            (metric) => metric ?? [],
          ),
        }),
        evidenceItem({
          feedItemId: "feed-x",
          providerKey: "x-twitter",
          title: "X thread repeats the release notes",
          score: 0.8,
          observedAt: new Date("2026-07-04T00:20:00.000Z"),
        }),
      ],
    });

    expect(pack.officialSignals.map((signal) => signal.feedItemId)).toEqual([
      "feed-github",
    ]);
    expect(pack.topCommunitySignals.map((signal) => signal.feedItemId)).toEqual([
      "feed-x",
    ]);
    expect(pack.emergingSignals[0]?.feedItemId).toBe("feed-x");
    expect(pack.dissentingViews.map((signal) => signal.feedItemId)).toEqual([
      "feed-reddit",
    ]);
    expect(
      pack.highEngagementLowConfidence.map((signal) => signal.feedItemId),
    ).toEqual(["feed-reddit"]);
    expect(pack.duplicatesCollapsed).toEqual([
      {
        clusterId: "cluster-1",
        representativeFeedItemId: "feed-github",
        duplicateFeedItemIds: ["feed-x"],
        providerKeys: ["github", "x-twitter"],
      },
    ]);
    expect(pack.sourceCoverage).toMatchObject({
      selectedEvidenceCount: 3,
      providerCount: 3,
      crossProviderClusterCount: 1,
    });
    expect(pack.confidence).toMatchObject({
      level: "high",
      score: 0.82,
    });
  });

  it("keeps two-provider community repetition at medium confidence", () => {
    const selectedEvidence = [
      evidenceItem({ feedItemId: "feed-reddit", providerKey: "reddit" }),
      evidenceItem({ feedItemId: "feed-x", providerKey: "x-twitter" }),
    ];
    const base = selection(selectedEvidence);
    const pack = buildSummaryEvidencePack({
      ...base,
      sourceWindow: {
        ...base.sourceWindow,
        storyClusterIds: ["cluster-community"],
      },
      clusters: [
        {
          id: "cluster-community",
          storyKey: "topic:community-repeat",
          representativeFeedItemId: "feed-reddit",
          duplicateFeedItemIds: ["feed-x"],
          interestIds: ["interest-1"],
          providerKeys: ["reddit", "x-twitter"],
          score: 2.5,
          observedAtRange: {
            startedAt: new Date("2026-07-09T12:00:00.000Z"),
            endedAt: new Date("2026-07-09T12:05:00.000Z"),
          },
          whyImportant: ["Repeated community discussion"],
        },
      ],
    });

    expect(pack.confidence).toMatchObject({
      level: "medium",
      score: 0.68,
    });
  });

  it("does not count a Hacker News RSS mirror as independent support", () => {
    const selectedEvidence = [
      evidenceItem({
        feedItemId: "feed-hn",
        providerKey: "hacker-news",
        canonicalUrl: "https://news.ycombinator.com/item?id=1",
      }),
      evidenceItem({
        feedItemId: "feed-rss-mirror",
        providerKey: "rss",
        canonicalUrl: "https://news.ycombinator.com/item?id=1",
      }),
    ];
    const base = selection(selectedEvidence);
    const pack = buildSummaryEvidencePack({
      ...base,
      sourceWindow: {
        ...base.sourceWindow,
        storyClusterIds: ["cluster-hn-mirror"],
      },
      clusters: [
        {
          id: "cluster-hn-mirror",
          storyKey: "url:news.ycombinator.com/item?id=1",
          representativeFeedItemId: "feed-hn",
          duplicateFeedItemIds: ["feed-rss-mirror"],
          interestIds: ["interest-1"],
          providerKeys: ["hacker-news", "rss"],
          score: 2.2,
          observedAtRange: {
            startedAt: new Date("2026-07-09T12:00:00.000Z"),
            endedAt: new Date("2026-07-09T12:01:00.000Z"),
          },
          whyImportant: ["Same canonical Hacker News item"],
        },
      ],
    });

    expect(pack.sourceCoverage.crossProviderClusterCount).toBe(0);
    expect(pack.confidence).toMatchObject({ level: "medium", score: 0.65 });
  });

  it("does not treat RSS transport as official without source authority", () => {
    const pack = buildSummaryEvidencePack(
      selection([
        evidenceItem({
          feedItemId: "feed-rss",
          providerKey: "rss",
          title: "Editorial RSS coverage",
        }),
        evidenceItem({
          feedItemId: "feed-official-x",
          providerKey: "x-twitter",
          title: "Official product announcement",
          contentQuality: {
            qualityScore: 1,
            interestRelevanceScore: 1,
            engagementIntegrityScore: 1,
            eligibleForSummary: true,
            eligibleForTopRead: true,
            needsLlmReview: false,
            decision: "promote",
            flags: ["official_account", "trusted_author"],
            reason: "Eligible first-party source",
          },
        }),
      ]),
    );

    expect(pack.officialSignals.map((signal) => signal.feedItemId)).toEqual([
      "feed-official-x",
    ]);
  });
});

const selection = (
  selectedEvidence: readonly SummaryEvidenceItem[],
): Parameters<typeof buildSummaryEvidencePack>[0] => ({
  rankingPolicyVersion: "story-ranking.v1",
  sourceWindow: {
    windowId: "window-authority",
    startedAt: new Date("2026-07-09T00:00:00.000Z"),
    endedAt: new Date("2026-07-10T00:00:00.000Z"),
    selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
    storyClusterIds: [],
  },
  clusters: [],
  selectedEvidence,
});

const evidenceItem = (
  overrides: Partial<SummaryEvidenceItem>,
): SummaryEvidenceItem => ({
  feedItemId: overrides.feedItemId ?? "feed-1",
  sourceItemId: overrides.sourceItemId ?? `${overrides.feedItemId ?? "feed-1"}-source`,
  sourceBindingId: "binding-1",
  interestId: "interest-1",
  providerKey: overrides.providerKey ?? "reddit",
  canonicalUrl:
    overrides.canonicalUrl ??
    `https://example.test/${overrides.feedItemId ?? "feed-1"}`,
  title: overrides.title ?? "Evidence title",
  bodyPreview: overrides.bodyPreview,
  authorHandle: overrides.authorHandle,
  publishedAt:
    overrides.publishedAt ?? new Date("2026-07-04T00:05:00.000Z"),
  observedAt:
    overrides.observedAt ?? new Date("2026-07-04T00:10:00.000Z"),
  score: overrides.score ?? 0.5,
  whyImportant: overrides.whyImportant ?? ["Relevant signal."],
  providerMetricLabels: overrides.providerMetricLabels,
  contentQuality: overrides.contentQuality,
  matchedRules: overrides.matchedRules,
  conversationContext: overrides.conversationContext,
});
