import type {
  StoryCluster,
  SummaryEvidenceItem,
  SummaryEvidenceSelection,
} from "../value-objects/summary-evidence-item";
import {
  buildRelatedTopicCandidates,
  RELATED_TOPIC_MAX_CANDIDATES,
} from "./reader-summary-related-topics";

describe("provider-neutral related-topic candidate policy", () => {
  it("uses strict normalized entity and event title evidence", () => {
    const official = evidence(
      "official",
      "publisher",
      "Northstar signs Orion packets for regional delivery",
      true,
    );
    const subject = evidence(
      "discussion",
      "community",
      "Are Orion packets signed by Northstar for regional delivery?",
      false,
    );

    expect(buildRelatedTopicCandidates({
      selection: selection(official, subject),
    })).toEqual([
      expect.objectContaining({
        subjectFeedItemId: "discussion",
        officialAnchorFeedItemId: "official",
      }),
    ]);
  });

  it("never lets body overlap create eligibility and rejects mismatched events", () => {
    const sharedBody = "Northstar signs Orion packets for regional delivery.";
    const bodyOnly = [
      { ...evidence("official", "publisher", "Publisher note", true), bodyPreview: sharedBody },
      { ...evidence("discussion", "community", "Reader question", false), bodyPreview: sharedBody },
    ] as const;
    const eventMismatch = [
      evidence("official", "publisher", "Northstar acquires Orion systems", true),
      evidence("discussion", "community", "Northstar audits Orion systems", false),
    ] as const;

    expect(buildRelatedTopicCandidates({ selection: selection(...bodyOnly) })).toEqual([]);
    expect(buildRelatedTopicCandidates({ selection: selection(...eventMismatch) })).toEqual([]);
  });

  it("keeps the exact official endpoint that passed provider separation", () => {
    const subject = evidence(
      "discussion",
      "community",
      "Are Orion packets signed by Northstar for regional delivery?",
      false,
    );
    const sameProviderOfficial = evidence(
      "official-community",
      "community",
      "Northstar signs Orion packets for regional delivery",
      true,
    );
    const eligibleOfficial = evidence(
      "official-publisher",
      "publisher",
      "Northstar signs Orion packets for regional delivery",
      true,
    );
    const base = selection(subject, sameProviderOfficial, eligibleOfficial);
    const officialCluster: StoryCluster = {
      id: "story:official",
      storyKey: "story-key:official",
      representativeFeedItemId: sameProviderOfficial.feedItemId,
      duplicateFeedItemIds: [eligibleOfficial.feedItemId],
      interestIds: [sameProviderOfficial.interestId],
      providerKeys: [
        sameProviderOfficial.providerKey,
        eligibleOfficial.providerKey,
      ],
      score: 1,
      observedAtRange: {
        startedAt: sameProviderOfficial.observedAt,
        endedAt: eligibleOfficial.observedAt,
      },
      whyImportant: ["Fixture authority"],
    };
    const candidateSelection: SummaryEvidenceSelection = {
      ...base,
      clusters: [base.clusters[0]!, officialCluster],
      sourceWindow: {
        ...base.sourceWindow,
        storyClusterIds: [base.clusters[0]!.id, officialCluster.id],
      },
    };

    expect(buildRelatedTopicCandidates({ selection: candidateSelection }))
      .toEqual([
        expect.objectContaining({
          subjectFeedItemId: subject.feedItemId,
          officialAnchorFeedItemId: eligibleOfficial.feedItemId,
          subjectStoryClusterId: base.clusters[0]!.id,
          targetStoryClusterId: officialCluster.id,
        }),
      ]);
  });

  it("is permutation-stable and preserves global and cluster-pair caps", () => {
    const official = evidence(
      "official",
      "publisher",
      "Northstar signs Orion packets for regional delivery",
      true,
    );
    const subjects = Array.from({ length: 12 }, (_, index) => evidence(
      `discussion-${index}`,
      `community-${index}`,
      `Orion packets signed by Northstar for regional delivery ${index}`,
      false,
    ));
    const forward = selection(official, ...subjects);
    const reversed = {
      ...forward,
      clusters: [...forward.clusters].reverse(),
      selectedEvidence: [...forward.selectedEvidence].reverse(),
    };

    const candidates = buildRelatedTopicCandidates({ selection: forward });
    expect(candidates).toHaveLength(RELATED_TOPIC_MAX_CANDIDATES);
    expect(buildRelatedTopicCandidates({ selection: reversed })).toEqual(candidates);
  });
});

const evidence = (
  id: string,
  providerKey: string,
  title: string,
  official: boolean,
): SummaryEvidenceItem => ({
  feedItemId: id,
  sourceItemId: `source:${id}`,
  sourceBindingId: `binding:${providerKey}`,
  interestId: "interest:systems",
  providerKey,
  canonicalUrl: `https://${providerKey}.example.test/${id}`,
  title,
  bodyPreview: "Unrelated verifier context.",
  publishedAt: new Date("2026-08-10T08:00:00.000Z"),
  observedAt: new Date("2026-08-10T08:01:00.000Z"),
  score: 1,
  whyImportant: ["Fixture evidence"],
  contentQuality: {
    qualityScore: 1,
    interestRelevanceScore: 1,
    engagementIntegrityScore: 1,
    eligibleForSummary: true,
    eligibleForTopRead: true,
    needsLlmReview: false,
    decision: "fixture",
    flags: official ? ["official_account", "trusted_author"] : [],
    reason: "Fixture authority",
  },
});

const selection = (
  ...items: readonly SummaryEvidenceItem[]
): SummaryEvidenceSelection => {
  const clusters = items.map((item): StoryCluster => ({
    id: `story:${item.feedItemId}`,
    storyKey: `story-key:${item.feedItemId}`,
    representativeFeedItemId: item.feedItemId,
    duplicateFeedItemIds: [],
    interestIds: [item.interestId],
    providerKeys: [item.providerKey],
    score: item.score,
    observedAtRange: { startedAt: item.observedAt, endedAt: item.observedAt },
    whyImportant: item.whyImportant,
  }));
  return {
    rankingPolicyVersion: "fixture-v1",
    sourceWindow: {
      windowId: "window",
      startedAt: new Date("2026-08-10T00:00:00.000Z"),
      endedAt: new Date("2026-08-11T00:00:00.000Z"),
      selectedFeedItemIds: items.map((item) => item.feedItemId),
      storyClusterIds: clusters.map((cluster) => cluster.id),
    },
    clusters,
    selectedEvidence: items,
  };
};
