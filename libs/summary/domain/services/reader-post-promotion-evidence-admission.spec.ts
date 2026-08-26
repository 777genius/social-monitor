import { buildReaderSummary } from "../aggregates/reader-summary";
import { admitReaderPostPromotionEvidence } from
  "./reader-post-promotion-evidence-admission";
import {
  attestedStoryRelationFixture,
  storyRelationTestProofAuthority,
} from "./story-relation-provenance-test-fixtures";
import { createStoryRelationProofAuthority } from
  "./story-relation-proof-authority";
import {
  canonicalStoryRelationProofSha256,
} from "./story-relation-verification-proof";
import type {
  StoryRelationCandidateVerificationProof,
  StoryRelationExecutionProof,
} from "../value-objects/story-relation-verification-proof";
import type { SummaryEvidenceItem, SummaryEvidenceSelection } from
  "../value-objects/summary-evidence-item";

describe("admitReaderPostPromotionEvidence supplemental appendix", () => {
  it("preserves GitHub Trending after promotion selection without counting it", () => {
    const selection = fixtureSelection();
    const admitted = admitReaderPostPromotionEvidence(selection);

    expect(admitted.promotionCounts).toEqual({ top: 1, additional: 0 });
    expect(admitted.selectedEvidence.map((item) => item.feedItemId)).toEqual([
      "hn:top",
      "github:trending",
    ]);
    expect(admitted.sourceWindow.selectedFeedItemIds).toEqual([
      "hn:top",
      "github:trending",
    ]);

    const summary = buildReaderSummary({
      headline: "Agent release reaches developers",
      executiveSummary: "The release reached the exact HN Top floor.",
      topStories: [{
        storyClusterId: "cluster:hn:top",
        title: "Agent release reaches developers",
        summary: "The release reached the exact HN Top floor.",
        interestIds: ["agents"],
        providerKeys: ["hacker-news"],
        citationIds: ["citation:hn"],
      }],
      interestHighlights: [],
      repeatedSignals: [],
      risksAndUnknowns: [],
      citationMap: admitted.selectedEvidence.map((item) => ({
        citationId: item.feedItemId === "hn:top"
          ? "citation:hn"
          : "citation:github",
        feedItemId: item.feedItemId,
        sourceItemId: item.sourceItemId,
        providerKey: item.providerKey,
        field: "canonicalUrl" as const,
        canonicalUrl: item.canonicalUrl,
      })),
      storyClusters: admitted.clusters,
      sourceWindow: admitted.sourceWindow,
      selectedEvidence: admitted.selectedEvidence,
      qualityFlags: [],
    });

    expect(summary.topReads).toHaveLength(1);
    expect(summary.selectedPosts).toEqual([]);
    expect(summary.narrativeSections).toEqual([
      expect.objectContaining({
        id: "github-trending",
        citationIds: ["citation:github"],
      }),
    ]);
  });

  it("requires an authority-bound proof before preserving a guarded relation", () => {
    const selection = guardedFixtureSelection();
    const relation = guardedRelation(selection);
    const admitted = admitReaderPostPromotionEvidence({
      ...selection,
      approvedSameStoryRelations: [relation],
    });
    expect(admitted.approvedSameStoryRelations).toEqual([relation]);

    const { verificationProof: _omitted, ...withoutProof } = relation;
    void _omitted;
    const poisonedCluster = {
      ...selection.clusters[0]!,
      duplicateFeedItemIds: ["github:trending"],
      providerKeys: ["hacker-news", "github-trending-page"],
    };
    const omittedAdmission = admitReaderPostPromotionEvidence({
      ...selection,
      clusters: [poisonedCluster],
      approvedSameStoryRelations: [withoutProof],
    });
    expect(omittedAdmission.approvedSameStoryRelations).toEqual([]);
    expect(omittedAdmission.clusters.map((cluster) => cluster.id)).toEqual([
      poisonedCluster.id,
    ]);
  });

  it("keeps proof binding independent from promotion presentation fields", () => {
    const selection = guardedFixtureSelection();
    const relation = guardedRelation(selection);
    const admitted = admitReaderPostPromotionEvidence({
      ...selection,
      sourceWindow: {
        ...selection.sourceWindow,
        periodStartedAt: new Date("2026-08-14T00:00:00.000Z"),
        periodEndedAt: new Date("2026-08-15T00:00:00.000Z"),
        ingestionCutoff: new Date("2026-08-14T12:00:00.000Z"),
        storyClusterIds: ["selector-cluster:stable"],
      },
      clusters: selection.clusters.map((cluster) => ({
        ...cluster,
        id: "selector-cluster:stable",
      })),
      approvedSameStoryRelations: [relation],
    });
    expect(admitted.approvedSameStoryRelations).toEqual([relation]);
    expect(admitted.clusters.map((cluster) => cluster.id)).toEqual([
      "selector-cluster:stable",
    ]);
  });

  it("never suffixes a valid selector cluster when multiple members promote", () => {
    const selection = fixtureSelection();
    const [lead, supplemental] = selection.selectedEvidence;
    if (lead === undefined || supplemental === undefined) {
      throw new Error("Expected two promotion fixtures");
    }
    const support = {
      ...supplemental,
      providerKey: "x-twitter",
      providerName: "X",
      contentQuality: quality,
      promotionFacts: {
        contentKind: "original_post" as const,
        canonicalIdentity: "story:second-promoted-member",
        authorityAttestation: {
          status: "attested" as const,
          official: false,
          trusted: true,
          attestedBy: "source_catalog" as const,
        },
        safetyValid: true,
        freshnessValid: true,
        freshnessProvenance: {
          status: "observed" as const,
          publishedAt: supplemental.publishedAt,
          observedAt: supplemental.observedAt,
          ingestionCutoff: selection.sourceWindow.ingestionCutoff!,
        },
        metricsState: "observed" as const,
        metrics: {
          provider: "x" as const,
          likes: 15,
          reposts: 10,
          weightedScore: 35,
        },
      },
    };
    const clusterId = "selector-cluster:never-renamed";
    const admitted = admitReaderPostPromotionEvidence({
      ...selection,
      selectedEvidence: [lead, support],
      clusters: [{
        ...selection.clusters[0]!,
        id: clusterId,
        duplicateFeedItemIds: [support.feedItemId],
        providerKeys: [lead.providerKey, support.providerKey],
      }],
      sourceWindow: {
        ...selection.sourceWindow,
        storyClusterIds: [clusterId],
      },
    });

    expect(admitted.selectedEvidence.map((item) => item.feedItemId)).toEqual([
      lead.feedItemId,
      support.feedItemId,
    ]);
    expect(admitted.clusters).toHaveLength(1);
    expect(admitted.clusters[0]).toMatchObject({
      id: clusterId,
      representativeFeedItemId: lead.feedItemId,
      duplicateFeedItemIds: [support.feedItemId],
    });
  });

  it.each([
    ["missing endpoint", (selection: SummaryEvidenceSelection) => ({
      ...selection,
      sourceWindow: { ...selection.sourceWindow,
        selectedFeedItemIds: ["hn:top"] },
    })],
    ["stale publication", (selection: SummaryEvidenceSelection) => ({
      ...selection,
      selectedEvidence: selection.selectedEvidence.map((item) =>
        item.feedItemId === "github:trending" ? { ...item,
          publishedAt: new Date("2026-08-13T23:59:59.999Z") } : item),
    })],
    ["publication past the period", (selection: SummaryEvidenceSelection) => ({
      ...selection,
      selectedEvidence: selection.selectedEvidence.map((item) =>
        item.feedItemId === "github:trending" ? { ...item,
          publishedAt: new Date("2026-08-15T00:00:00.000Z") } : item),
    })],
    ["post-cutoff observation", (selection: SummaryEvidenceSelection) => ({
      ...selection,
      selectedEvidence: selection.selectedEvidence.map((item) =>
        item.feedItemId === "github:trending" ? { ...item,
          observedAt: new Date("2026-08-14T12:00:00.001Z") } : item),
    })],
    ["observation before publication", (selection: SummaryEvidenceSelection) => ({
      ...selection,
      selectedEvidence: selection.selectedEvidence.map((item) =>
        item.feedItemId === "github:trending" ? { ...item,
          observedAt: new Date("2026-08-14T09:59:59.999Z") } : item),
    })],
    ["partial period", (selection: SummaryEvidenceSelection) => ({
      ...selection,
      sourceWindow: {
        ...selection.sourceWindow,
        periodEndedAt: undefined,
      },
    })],
    ["selector cluster mismatch", (selection: SummaryEvidenceSelection) => ({
      ...selection,
      clusters: fixtureSelection().clusters,
      sourceWindow: {
        ...selection.sourceWindow,
        storyClusterIds: fixtureSelection().sourceWindow.storyClusterIds,
      },
    })],
  ] as const)("rejects promotion-incompatible proof endpoints: %s",
    (_name, mutate) => {
      const selection = guardedFixtureSelection();
      const relation = guardedRelation(selection);
      expect(admitReaderPostPromotionEvidence({
        ...mutate(selection),
        approvedSameStoryRelations: [relation],
      }).approvedSameStoryRelations).toEqual([]);
    });

  it("fails closed after proof serialization loses process authority", () => {
    const selection = guardedFixtureSelection();
    const relation = guardedRelation(selection);
    const serialized = JSON.parse(JSON.stringify(
      relation.verificationProof)) as StoryRelationCandidateVerificationProof;
    expect(admitReaderPostPromotionEvidence({
      ...selection,
      approvedSameStoryRelations: [{
        ...relation,
        verificationProof: serialized,
      }],
    }).approvedSameStoryRelations).toEqual([]);
  });

  it("rejects a relation issued by a separately-created authority", () => {
    const selection = guardedFixtureSelection();
    const relation = attestedStoryRelationFixture({
      leftFeedItemId: "hn:top",
      rightFeedItemId: "github:trending",
      confidence: 0.99,
      verificationLane: "guarded_recall_primary",
      rankingPolicyVersion: selection.rankingPolicyVersion,
      sourceWindow: selection.sourceWindow,
      proofAuthority: createStoryRelationProofAuthority(),
    });
    expect(admitReaderPostPromotionEvidence({
      ...selection,
      approvedSameStoryRelations: [relation],
    }, storyRelationTestProofAuthority.proofVerifier)
      .approvedSameStoryRelations).toEqual([]);
  });

  it.each([
    ["candidate copy", (proof: StoryRelationCandidateVerificationProof) => ({
      ...proof,
    })],
    ["candidate swap", (proof: StoryRelationCandidateVerificationProof) =>
      rehashCandidate({ ...proof, canonicalPairId: "copied\u0000pair" })],
    ["reordered pair", (proof: StoryRelationCandidateVerificationProof) =>
      rehashCandidate({ ...proof,
        leftFeedItemId: proof.rightFeedItemId,
        rightFeedItemId: proof.leftFeedItemId })],
    ["feature", (proof: StoryRelationCandidateVerificationProof) =>
      rehashCandidate({ ...proof, featureDigest: digest("changed-feature") })],
    ["decision", (proof: StoryRelationCandidateVerificationProof) =>
      rehashCandidate({ ...proof, normalizedDecision: {
        ...proof.normalizedDecision, sameStory: false,
      } as never })],
    ["confidence", (proof: StoryRelationCandidateVerificationProof) =>
      rehashCandidate({ ...proof, normalizedDecision: {
        ...proof.normalizedDecision, confidenceScore: 0.981,
      } })],
    ["proof version", executionMutation((proof) => ({ ...proof,
      proofVersion: "forged-proof-version" as never }))],
    ["lane", executionMutation((proof) => ({ ...proof,
      verificationLane: "semantic_primary" }))],
    ["implementation", executionMutation((proof) => ({ ...proof,
      verifierImplementation: "forged-implementation" as never }))],
    ["model policy", executionMutation((proof) => ({ ...proof,
      verifierPolicy: { ...proof.verifierPolicy,
        promptVersion: "forged-prompt" } }))],
    ["ranking policy", executionMutation((proof) => ({ ...proof,
      rankingPolicyVersion: "forged-ranking" }))],
    ["selection window", executionMutation((proof) => ({ ...proof,
      selectionSha256: digest("forged-window") }))],
    ["candidate ordering", executionMutation((proof) => ({ ...proof,
      candidateBindings: proof.candidateBindings.map((binding) => ({
        ...binding,
        leftFeedItemId: binding.rightFeedItemId,
        rightFeedItemId: binding.leftFeedItemId,
      })) }))],
    ["candidate feature", executionMutation((proof) => ({ ...proof,
      candidateBindings: proof.candidateBindings.map((binding) => ({
        ...binding, featureDigest: digest("forged-candidate-feature"),
      })) }))],
    ["decision output", executionMutation((proof) => ({ ...proof,
      decisionBindings: proof.decisionBindings.map((binding) =>
        binding.valid ? { ...binding, sameStory: false } : binding) }))],
    ["decision confidence", executionMutation((proof) => ({ ...proof,
      decisionBindings: proof.decisionBindings.map((binding) =>
        binding.valid ? { ...binding, confidenceScore: 0.982 } : binding) }))],
    ["normalized output", executionMutation((proof) => ({ ...proof,
      normalizedOutputSha256: digest("forged-normalized-output") }))],
    ["execution identity", executionMutation((proof) => ({ ...proof,
      executionAttestation: { ...proof.executionAttestation,
        requestId: "forged-request" },
      executionAttestationSha256: canonicalStoryRelationProofSha256({
        ...proof.executionAttestation,
        requestId: "forged-request",
      }) }))],
    ["execution attestation", executionMutation((proof) => ({ ...proof,
      executionAttestationSha256: digest("forged-attestation") }))],
    ["selected output", executionMutation((proof) => ({ ...proof,
      selectedOutputSha256: digest("forged-selected-output"),
      executionAttestation: { ...proof.executionAttestation,
        selectedOutputSha256: digest("forged-selected-output") },
      executionAttestationSha256: canonicalStoryRelationProofSha256({
        ...proof.executionAttestation,
        selectedOutputSha256: digest("forged-selected-output"),
      }) }))],
    ["forged authority", executionMutation((proof) => ({ ...proof }))],
  ] as const)("rejects a fully rehashed %s mutation", (_name, mutate) => {
    const selection = guardedFixtureSelection();
    const relation = guardedRelation(selection);
    const proof = relation.verificationProof!;
    expect(admitReaderPostPromotionEvidence({
      ...selection,
      approvedSameStoryRelations: [{
        ...relation,
        verificationProof: mutate(proof) as StoryRelationCandidateVerificationProof,
      }],
    }).approvedSameStoryRelations).toEqual([]);
  });
});

const guardedRelation = (selection: SummaryEvidenceSelection) =>
  attestedStoryRelationFixture({
    leftFeedItemId: "hn:top",
    rightFeedItemId: "github:trending",
    confidence: 0.99,
    verificationLane: "guarded_recall_primary",
    rankingPolicyVersion: selection.rankingPolicyVersion,
    sourceWindow: {
      windowId: selection.sourceWindow.windowId,
      startedAt: selection.sourceWindow.startedAt,
      endedAt: selection.sourceWindow.endedAt,
      selectedFeedItemIds: selection.sourceWindow.selectedFeedItemIds,
      storyClusterIds: ["candidate:left", "candidate:right"],
    },
  });

const digest = (label: string): string =>
  canonicalStoryRelationProofSha256({ fixture: label });

const rehashCandidate = (
  proof: StoryRelationCandidateVerificationProof,
): StoryRelationCandidateVerificationProof => ({
  ...proof,
  candidateProofSha256: canonicalStoryRelationProofSha256({
    ...proof,
    candidateProofSha256: undefined,
  }),
});

function executionMutation(
  mutate: (proof: StoryRelationExecutionProof) => StoryRelationExecutionProof,
): (candidateProof: StoryRelationCandidateVerificationProof) =>
  StoryRelationCandidateVerificationProof {
  return (candidateProof: StoryRelationCandidateVerificationProof) => {
  const executionProof = mutate(candidateProof.executionProof);
  const rehashedExecution = {
    ...executionProof,
    proofSha256: canonicalStoryRelationProofSha256({
      ...executionProof,
      proofSha256: undefined,
    }),
  } as StoryRelationExecutionProof;
    return rehashCandidate({
      ...candidateProof,
      executionProof: rehashedExecution,
    });
  };
}

const fixtureSelection = (): SummaryEvidenceSelection => {
  const publishedAt = new Date("2026-08-14T10:00:00.000Z");
  const observedAt = new Date("2026-08-14T11:00:00.000Z");
  const cutoff = new Date("2026-08-14T12:00:00.000Z");
  const primary: SummaryEvidenceItem = {
    feedItemId: "hn:top",
    sourceItemId: "hn:top",
    sourceBindingId: "binding:hn",
    interestId: "agents",
    providerKey: "hacker-news",
    canonicalUrl: "https://news.ycombinator.com/item?id=50",
    title: "Agent release reaches developers",
    publishedAt,
    observedAt,
    score: 1,
    whyImportant: ["Exact HN Top floor."],
    contentQuality: quality,
    promotionFacts: {
      contentKind: "story",
      canonicalIdentity: "story:agent-release",
      safetyValid: true,
      freshnessValid: true,
      freshnessProvenance: {
        status: "observed",
        publishedAt,
        observedAt,
        ingestionCutoff: cutoff,
      },
      metricsState: "observed",
      metrics: { provider: "hacker_news", points: 50 },
    },
  };
  const supplemental: SummaryEvidenceItem = {
    feedItemId: "github:trending",
    sourceItemId: "github:trending",
    sourceBindingId: "binding:github",
    interestId: "agents",
    providerKey: "github-trending-page",
    canonicalUrl: "https://github.com/example/trending-agent",
    title: "example/trending-agent",
    publishedAt,
    observedAt,
    score: 0.5,
    whyImportant: ["Supplemental GitHub trend."],
    providerMetricLabels: [{
      label: "GitHub Trending today",
      value: "#1, +1,500 stars today",
    }],
  };
  const selectedEvidence = [primary, supplemental];
  return {
    rankingPolicyVersion: "story-ranking.v1",
    selectedEvidence,
    clusters: selectedEvidence.map((item) => ({
      id: `cluster:${item.feedItemId}`,
      storyKey: item.feedItemId,
      representativeFeedItemId: item.feedItemId,
      duplicateFeedItemIds: [],
      interestIds: [item.interestId],
      providerKeys: [item.providerKey],
      score: item.score,
      observedAtRange: { startedAt: observedAt, endedAt: observedAt },
      whyImportant: item.whyImportant,
    })),
    sourceWindow: {
      windowId: "window:appendix",
      startedAt: new Date("2026-08-14T00:00:00.000Z"),
      endedAt: cutoff,
      periodStartedAt: new Date("2026-08-14T00:00:00.000Z"),
      periodEndedAt: new Date("2026-08-15T00:00:00.000Z"),
      ingestionCutoff: cutoff,
      selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
      storyClusterIds: selectedEvidence.map((item) =>
        `cluster:${item.feedItemId}`),
    },
  };
};

const guardedFixtureSelection = (): SummaryEvidenceSelection => {
  const selection = fixtureSelection();
  const [primary, supplemental] = selection.selectedEvidence;
  if (primary === undefined || supplemental === undefined) {
    throw new Error("Guarded relation fixture requires two endpoints");
  }
  return {
    ...selection,
    clusters: [{
      ...selection.clusters[0]!,
      id: "selector-cluster:stable",
      duplicateFeedItemIds: [supplemental.feedItemId],
      providerKeys: [primary.providerKey, supplemental.providerKey],
    }],
    sourceWindow: {
      ...selection.sourceWindow,
      storyClusterIds: ["selector-cluster:stable"],
    },
  };
};

const quality = {
  qualityScore: 0.9,
  interestRelevanceScore: 0.9,
  engagementIntegrityScore: 0.9,
  eligibleForSummary: true,
  eligibleForTopRead: true,
  needsLlmReview: false,
  decision: "promote",
  flags: [],
  reason: "eligible",
} as const;
