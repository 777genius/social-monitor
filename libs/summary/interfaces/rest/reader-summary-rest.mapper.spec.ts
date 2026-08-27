import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  emptyReaderSummaryReliabilityReport,
  buildReaderPostPromotionAttestations,
  ReaderSummaryArtifact,
  selectReaderPostPromotions,
  type ReaderPostPromotionInput,
} from "../../domain";
import { normalizeReaderSummaryArtifactPayload } from
  "../../adapters/persistence/prisma/prisma-reader-summary-artifact-payload";
import { serializeReaderSummaryArtifact } from
  "../../adapters/persistence/prisma/prisma-reader-summary-json";
import { presentReaderSummaryArtifact } from "../../features/shared/reader-summary-artifact-presenter";
import {
  listReaderSummariesResponseFromReaderSummaries,
  readerSummaryArtifactViewFromReaderSummaryView,
} from "./reader-summary-rest.mapper";

describe("readerSummaryArtifactViewFromReaderSummaryView", () => {
  it("preserves canonical URLs for UI citation links", () => {
    const promotionAttestations = validPromotionAttestations();
    const artifact = ReaderSummaryArtifact.create({
      schemaVersion: "reader_summary.artifact.v1",
      readerSummaryId: "readerSummary-1",
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      scope: { type: "workspace" },
      period: {
        cadence: "daily",
        startedAt: new Date("2026-06-06T00:00:00.000Z"),
        endedAt: new Date("2026-06-07T00:00:00.000Z"),
        timezone: "UTC",
        periodKey:
          "daily:2026-06-06T00:00:00.000Z:2026-06-07T00:00:00.000Z:UTC",
      },
      sourceWindow: sourceWindow,
      storyClusters: [
        {
          id: "cluster-1",
          storyKey: "url:github.com/openai/codex",
          representativeFeedItemId: "feed-1",
          duplicateFeedItemIds: [],
          interestIds: ["ai-tools"],
          providerKeys: ["github-repo-radar"],
          score: 0.9,
          observedAtRange: {
            startedAt: new Date("2026-06-06T00:00:00.000Z"),
            endedAt: new Date("2026-06-06T00:01:00.000Z"),
          },
          whyImportant: ["Repository is gaining stars quickly."],
        },
      ],
      contextArtifacts: [],
      promotionAttestations,
      promotionEvidenceFacts: validPromotionInputs(),
      personalization: {
        memoryGuidanceStatus: "available",
        memoryGuidanceApplied: true,
        providerPreferenceCount: 1,
        keywordPreferenceCount: 2,
        mutedKeywordCount: 0,
        blockedProviderCount: 0,
        signals: ["provider:github-repo-radar", "keyword:agent"],
      },
      headline: "Repo radar readerSummary",
      executiveSummary: "OpenAI Codex is the strongest repository signal.",
      content: {
        headline: "Repo radar readerSummary",
        oneLineTakeaway: "OpenAI Codex is the strongest repository signal.",
        bullets: ["The repository gained attention in the selected window."],
        mainTopics: ["AI tools"],
        qualityState: {
          status: "ready",
          flags: [],
          warnings: [],
          isSingleSource: true,
        },
        interestSections: [],
        sourceMix: [
          {
            providerKey: "github-repo-radar",
            itemCount: 1,
            citationCount: 1,
            storyClusterCount: 1,
            crossSourceClusterCount: 0,
            singleSourceOnly: true,
            interestIds: ["ai-tools"],
          },
        ],
        topReads: [readerItem()],
        selectedPosts: [],
        claimBoard: [],
        reliabilityReport: emptyReaderSummaryReliabilityReport(),
        trendDelta: {
          newSignals: [],
          growingSignals: [],
          repeatedSignals: [],
          fadingSignals: [],
        },
        risks: [],
        openQuestions: [],
        nextActions: [],
      },
      topStories: [
        {
          storyClusterId: "cluster-1",
          title: "openai/codex leads repo radar",
          summary: "The repository gained attention in the selected window.",
          interestIds: ["ai-tools"],
          providerKeys: ["github-repo-radar"],
          citationIds: ["citation-1"],
        },
      ],
      interestHighlights: [],
      repeatedSignals: [],
      risksAndUnknowns: [],
      citationMap: [
        {
          citationId: "citation-1",
          feedItemId: "feed-1",
          sourceItemId: "source-1",
          providerKey: "github-repo-radar",
          field: "title",
          canonicalUrl: "https://github.com/openai/codex",
        },
      ],
      qualityFlags: [],
      generatedAt: new Date("2026-06-06T00:04:00.000Z"),
      confidence: {
        level: "medium",
        score: 0.7,
        rationale: "Selected evidence is sufficient for a reader summary.",
      },
      lineage: {
        promptVersion: "prompt-v1",
        schemaVersion: "reader_summary.artifact.v1",
        modelVersion: "model-v1",
        providerVersion: "provider-v1",
        rulesVersion: "rules-v1",
        evalDatasetVersion: "eval-v1",
      },
      usage: {
        inputTokens: 1,
        outputTokens: 1,
        estimatedCostUsd: 0,
      },
    });
    const original = promotionAttestations[0]!;
    original.publishedAt.setUTCFullYear(1999);
    if (original.metrics?.provider === "github_radar") {
      original.metrics.windowStartedAt.setUTCFullYear(1999);
    }
    (original.authorityAttestation as { official: boolean }).official = false;
    (original.citationIds as string[]).push("forged-input-citation");
    const protectedSnapshot = artifact.toSnapshot().promotionAttestations![0]!;
    expect(protectedSnapshot.publishedAt.getUTCFullYear()).toBe(2026);
    expect(protectedSnapshot.citationIds).toEqual(["citation-1"]);
    expect(protectedSnapshot.authorityAttestation?.official).toBe(true);
    if (protectedSnapshot.metrics?.provider === "github_radar") {
      expect(protectedSnapshot.metrics.windowStartedAt.getUTCFullYear()).toBe(2026);
    }
    const readerSummaryView = presentReaderSummaryArtifact(artifact, {
      status: "fresh",
      checkedAt: new Date("2026-06-06T00:05:00.000Z"),
    });
    const mutableSnapshot = artifact.toSnapshot();
    mutableSnapshot.promotionAttestations?.[0]?.publishedAt.setUTCFullYear(2000);
    const mutableAttestation = mutableSnapshot.promotionAttestations?.[0];
    if (mutableAttestation?.metrics?.provider === "github_radar") {
      mutableAttestation.metrics.windowStartedAt.setUTCFullYear(2000);
    }
    if (mutableAttestation?.authorityAttestation !== undefined) {
      (mutableAttestation.authorityAttestation as { official: boolean }).official = false;
    }
    expect(artifact.toSnapshot().promotionAttestations?.[0]?.publishedAt).toEqual(
      new Date("2026-06-06T00:00:00.000Z"),
    );
    const afterMutation = artifact.toSnapshot().promotionAttestations![0]!;
    expect(afterMutation.authorityAttestation?.official).toBe(true);
    if (afterMutation.metrics?.provider === "github_radar") {
      expect(afterMutation.metrics.windowStartedAt.getUTCFullYear()).toBe(2026);
    }
    expect(readerSummaryView.promotionAttestations).toEqual(expect.arrayContaining([
      expect.objectContaining({
        candidateId: "feed-1",
        publishedAt: "2026-06-06T00:00:00.000Z",
        observedAt: "2026-06-06T00:00:01.000Z",
      }),
    ]));

    const response =
      readerSummaryArtifactViewFromReaderSummaryView(readerSummaryView);

    expect(response).not.toHaveProperty("promotionAttestations");
    expect(response).not.toHaveProperty("contextArtifacts");
    expect(response).not.toHaveProperty("relatedTopicRelations");

    expect(response).toMatchObject({
      schemaVersion: "reader_summary.artifact.v1",
      readerSummaryId: "readerSummary-1",
      generatedAt: new Date("2026-06-06T00:04:00.000Z"),
      sourceWindow: {
        windowId: "window-1",
        ingestionCutoff: "2026-06-06T00:01:00.000Z",
      },
      citations: [
        {
          citationId: "citation-1",
          label: "[1]",
          providerKey: "github-repo-radar",
          canonicalUrl: "https://github.com/openai/codex",
        },
      ],
      personalization: {
        memoryGuidanceStatus: "available",
        memoryGuidanceApplied: true,
        providerPreferenceCount: 1,
        keywordPreferenceCount: 2,
        mutedKeywordCount: 0,
        blockedProviderCount: 0,
        signals: ["provider:github-repo-radar", "keyword:agent"],
      },
      readerBrief: {
        topReads: [
          {
            matchedRules: expect.arrayContaining([
              "reader-card-kind:curated_top_read",
              "reader-story-cluster:cluster-1",
            ]),
          },
        ],
        selectedPosts: [],
      },
    });
    expect(response.readerBrief.topReads[0]).not.toHaveProperty(
      "storyClusterId",
    );
    expect(response.readerBrief.topReads[0]).not.toHaveProperty("cardKind");

    const {
      promotionMarker: ignoredPromotionMarker,
      promotionPolicyVersion: ignoredPromotionPolicyVersion,
      promotionTier: ignoredPromotionTier,
      promotionCandidateId: ignoredPromotionCandidateId,
      promotionCanonicalIdentity: ignoredPromotionCanonicalIdentity,
      ...supplementalCard
    } = readerSummaryView.content.topReads[0]!;
    void ignoredPromotionMarker;
    void ignoredPromotionPolicyVersion;
    void ignoredPromotionTier;
    void ignoredPromotionCandidateId;
    void ignoredPromotionCanonicalIdentity;
    const responseWithSupplementalAppendix =
      readerSummaryArtifactViewFromReaderSummaryView({
        ...readerSummaryView,
        content: {
          ...readerSummaryView.content,
          selectedPosts: [{
            ...supplementalCard,
            cardKind: "supplemental_trend",
            providerKey: "github-trending-page",
            storyClusterId: "supplemental:github-trending-page:feed-extra",
          }],
        },
      });
    expect(responseWithSupplementalAppendix.readerBrief.selectedPosts)
      .toEqual([]);

    const responseWithLegacySupplementalAppendix =
      readerSummaryArtifactViewFromReaderSummaryView({
        ...readerSummaryView,
        content: {
          ...readerSummaryView.content,
          selectedPosts: [{
            ...supplementalCard,
            providerKey: "github-trending-page",
            storyClusterId: "supplemental:github-trending-page:legacy-feed",
          }],
        },
      });
    expect(responseWithLegacySupplementalAppendix.readerBrief.selectedPosts)
      .toEqual([]);

    const persistedAttestation = readerSummaryView.promotionAttestations[0]!;
    for (const mutation of [
      { canonicalPayload: `${persistedAttestation.canonicalPayload} ` },
      { artifactId: "forged-artifact" },
      { sourceWindowId: "forged-window" },
      { slot: 1 },
      { citationIds: ["forged-citation"] },
    ]) {
      const mutatedView = {
        ...readerSummaryView,
        promotionAttestations: [{ ...persistedAttestation, ...mutation }],
      };
      expect(() => readerSummaryArtifactViewFromReaderSummaryView(mutatedView))
        .toThrow("promotion board is invalid");
    }
    expect(() => readerSummaryArtifactViewFromReaderSummaryView({
      ...readerSummaryView,
      promotionAttestations: [persistedAttestation, {
        ...persistedAttestation,
        candidateId: "extra-attestation",
      }],
    })).toThrow("promotion board is invalid");

    const secondCard = {
      ...readerSummaryView.content.topReads[0]!,
      cardKind: "additional_notable_story" as const,
      promotionTier: "additional" as const,
      promotionCandidateId: "feed-2",
      promotionCanonicalIdentity: "repo:openai/codex-additional",
    };
    const secondAttestation = {
      ...persistedAttestation,
      candidateId: "feed-2",
      canonicalIdentity: "repo:openai/codex-additional",
      placement: "additional" as const,
      tier: "additional" as const,
      decision: "promote_additional" as const,
      slot: 0,
    };
    const twoLaneView = {
      ...readerSummaryView,
      content: {
        ...readerSummaryView.content,
        selectedPosts: [secondCard],
      },
      promotionAttestations: [persistedAttestation, secondAttestation],
    };
    expect(
      readerSummaryArtifactViewFromReaderSummaryView(twoLaneView)
        .readerBrief.selectedPosts,
    ).toHaveLength(1);
    expect(() => readerSummaryArtifactViewFromReaderSummaryView({
      ...twoLaneView,
      content: {
        ...twoLaneView.content,
        topReads: [{
          ...twoLaneView.content.topReads[0]!,
          cardKind: "additional_notable_story" as const,
        }],
      },
    })).toThrow("promotion board is invalid");
    expect(() => readerSummaryArtifactViewFromReaderSummaryView({
      ...twoLaneView,
      content: {
        ...twoLaneView.content,
        selectedPosts: [{
          ...secondCard,
          cardKind: "curated_top_read" as const,
        }],
      },
    })).toThrow("promotion board is invalid");

    const emptyBoardView = {
      ...readerSummaryView,
      content: {
        ...readerSummaryView.content,
        topReads: [],
        selectedPosts: [],
      },
      promotionAttestations: [],
    };
    expect(
      readerSummaryArtifactViewFromReaderSummaryView(emptyBoardView)
        .readerBrief,
    ).toMatchObject({ topReads: [], selectedPosts: [] });
    expect(() => readerSummaryArtifactViewFromReaderSummaryView({
      ...emptyBoardView,
      promotionAttestations: [persistedAttestation],
    })).toThrow("promotion board is invalid");
    expect(() => readerSummaryArtifactViewFromReaderSummaryView({
      ...readerSummaryView,
      promotionBoardState: "legacy_unavailable" as const,
    })).toThrow("promotion board is invalid");

    const overCapCards = Array.from({ length: 9 }, (_, slot) => ({
      ...readerSummaryView.content.topReads[0]!,
      promotionCandidateId: `feed-cap-${slot}`,
      promotionCanonicalIdentity: `repo:openai/codex-${slot}`,
    }));
    const overCapAttestations = overCapCards.map((card, slot) => ({
      ...persistedAttestation,
      candidateId: card.promotionCandidateId,
      canonicalIdentity: card.promotionCanonicalIdentity,
      slot,
    }));
    expect(() => readerSummaryArtifactViewFromReaderSummaryView({
      ...readerSummaryView,
      content: { ...readerSummaryView.content, topReads: overCapCards },
      promotionAttestations: overCapAttestations,
    })).toThrow("promotion board is invalid");

    const reorderedCards = overCapCards.slice(0, 2);
    const reorderedAttestations = reorderedCards.map((card, slot) => ({
      ...persistedAttestation,
      candidateId: card.promotionCandidateId,
      canonicalIdentity: card.promotionCanonicalIdentity,
      slot: 1 - slot,
    }));
    expect(() => readerSummaryArtifactViewFromReaderSummaryView({
      ...readerSummaryView,
      content: { ...readerSummaryView.content, topReads: reorderedCards },
      promotionAttestations: reorderedAttestations,
    })).toThrow("promotion board is invalid");

    const topRead = readerSummaryView.content.topReads[0]!;
    const relatedView = {
      ...readerSummaryView,
      storyClusters: [...readerSummaryView.storyClusters, {
        ...readerSummaryView.storyClusters[0]!,
        id: "cluster-reddit",
        storyKey: "source:reddit:subject",
        representativeFeedItemId: "feed-reddit",
        providerKeys: ["reddit"],
      }],
      citations: [...readerSummaryView.citations, {
        citationId: "citation-reddit",
        label: "[2]",
        feedItemId: "feed-reddit",
        sourceItemId: "subject",
        providerKey: "reddit",
        field: "canonicalUrl" as const,
        canonicalUrl: "https://reddit.example.test/subject",
      }],
      relatedTopicRelations: [{
        relationId:
          "related-topic:v1:reddit:subject:github-repo-radar:source-1",
        subjectStoryClusterId: "cluster-reddit",
        targetStoryClusterId: "cluster-1",
        subjectFeedItemId: "feed-reddit",
        subjectProviderKey: "reddit",
        subjectSourceItemId: "subject",
        subjectCanonicalUrl: "https://reddit.example.test/subject",
        subjectProviderMetrics: [],
        officialAnchorFeedItemId: "feed-1",
        officialAnchorProviderKey: "github-repo-radar",
        officialAnchorSourceItemId: "source-1",
        officialAnchorContentQuality: officialQuality(),
        subjectIsOfficial: false as const,
        officialAnchorIsOfficial: true as const,
      }],
      content: {
        ...readerSummaryView.content,
        selectedPosts: [{
          ...topRead,
          providerKey: "reddit",
          confirmedProviderKeys: ["reddit"],
          providerMetrics: [],
          canonicalUrl: "https://reddit.example.test/subject",
          citationIds: ["citation-reddit"],
          storyClusterId: "cluster-reddit",
          cardKind: "related_topic" as const,
          relationId:
            "related-topic:v1:reddit:subject:github-repo-radar:source-1",
          targetStoryClusterId: "cluster-1",
          matchedRules: [
            ...topRead.matchedRules,
            "reader-card-kind:forged",
            "reader-card-kind:related_topic",
            "reader-related-topic-target:forged",
          ],
        }],
      },
    };
    expect(() => readerSummaryArtifactViewFromReaderSummaryView(relatedView))
      .toThrow("promotion board is invalid");

    for (const cardKind of [
      "curated_top_read",
      "additional_notable_story",
    ] as const) {
      expect(() => readerSummaryArtifactViewFromReaderSummaryView({
        ...relatedView,
        content: {
          ...relatedView.content,
          selectedPosts: [{
            ...topRead,
            cardKind,
            storyClusterId: "cluster-1",
            providerKey: "reddit",
            confirmedProviderKeys: ["reddit"],
            citationIds: ["citation-reddit"],
            canonicalUrl: "https://reddit.example.test/subject",
          }],
        },
      })).toThrow("promotion board is invalid");
    }

    const legacyPayload = JSON.parse(JSON.stringify(
      serializeReaderSummaryArtifact(artifact),
    )) as Record<string, unknown>;
    delete legacyPayload.promotionAttestations;
    delete legacyPayload.promotionEvidenceFacts;
    stripPromotionOnlyFields(legacyPayload);
    const legacyArtifact = ReaderSummaryArtifact.rehydrate(
      normalizeReaderSummaryArtifactPayload(legacyPayload, {
        id: "readerSummary-legacy",
        tenantId: "tenant-1",
        workspaceId: "workspace-1",
        scopeType: "workspace",
        interestId: null,
        cadence: "daily",
        periodStartedAt: new Date("2026-06-06T00:00:00.000Z"),
        periodEndedAt: new Date("2026-06-07T00:00:00.000Z"),
        periodTimezone: "UTC",
        userId: null,
        subscriptionId: null,
        headline: "Legacy persisted summary",
        summaryText: "The summary remains readable.",
        createdAt: new Date("2026-06-06T00:04:00.000Z"),
      }),
    );
    const legacyView = presentReaderSummaryArtifact(legacyArtifact, {
      status: "fresh",
      checkedAt: new Date("2026-06-06T00:05:00.000Z"),
    });

    expect(readerSummaryArtifactViewFromReaderSummaryView(legacyView))
      .toMatchObject({
        readerSummaryId: "readerSummary-legacy",
        headline: "Repo radar readerSummary",
        readerBrief: { topReads: [], selectedPosts: [] },
      });
    expect(listReaderSummariesResponseFromReaderSummaries({
      items: [readerSummaryView, legacyView],
    }).items).toEqual([
      expect.objectContaining({ readerSummaryId: "readerSummary-1" }),
      expect.objectContaining({
        readerSummaryId: "readerSummary-legacy",
        readerBrief: expect.objectContaining({
          topReads: [],
          selectedPosts: [],
        }),
      }),
    ]);
  });
});

const stripPromotionOnlyFields = (payload: Record<string, unknown>): void => {
  const content = payload.content as Record<string, unknown>;
  const sections = content.interestSections as Record<string, unknown>[];
  const cards = [
    ...(content.topReads as Record<string, unknown>[]),
    ...(content.selectedPosts as Record<string, unknown>[]),
    ...sections.flatMap((section) =>
      section.items as Record<string, unknown>[]),
  ];
  for (const card of cards) {
    delete card.promotionMarker;
    delete card.promotionPolicyVersion;
    delete card.promotionTier;
    delete card.promotionCandidateId;
    delete card.promotionCanonicalIdentity;
  }
};

const sourceWindow = {
  windowId: "window-1",
  startedAt: new Date("2026-06-06T00:00:00.000Z"),
  endedAt: new Date("2026-06-06T00:01:00.000Z"),
  selectedFeedItemIds: ["feed-1"],
  storyClusterIds: ["cluster-1"],
  periodStartedAt: new Date("2026-06-06T00:00:00.000Z"),
  periodEndedAt: new Date("2026-06-07T00:00:00.000Z"),
  ingestionCutoff: new Date("2026-06-06T00:01:00.000Z"),
};

const validPromotionAttestations = () => buildReaderPostPromotionAttestations(
  selectReaderPostPromotions(validPromotionInputs()),
  { artifactId: "readerSummary-1", sourceWindow },
);

const validPromotionInputs = (): readonly ReaderPostPromotionInput[] => [{
    candidateId: "feed-1",
    provider: "github-repo-radar",
    contentKind: "repository",
    canonicalIdentity: "repo:openai/codex",
    citationId: "citation-1",
    publishedAt: new Date("2026-06-06T00:00:00.000Z"),
    observedAt: new Date("2026-06-06T00:00:01.000Z"),
    checkedAt: new Date("2026-06-06T00:01:00.000Z"),
    periodStart: sourceWindow.periodStartedAt,
    periodEnd: sourceWindow.periodEndedAt,
    ingestionCutoff: sourceWindow.ingestionCutoff,
    freshnessValid: true,
    qualityScore: 0.9,
    relevanceScore: 0.9,
    integrityScore: 0.9,
    qualityValid: true,
    safetyValid: true,
    citationValid: true,
    authorityAttestation: {
      status: "attested",
      official: true,
      trusted: true,
      attestedBy: "source_catalog",
    },
    metricsState: "observed",
    metrics: {
      provider: "github_radar",
      snapshotKind: "repository_growth",
      windowStartedAt: new Date("2026-06-05T00:01:00.000Z"),
      windowEndedAt: new Date("2026-06-06T00:01:00.000Z"),
      starsDelta: 60,
      forksDelta: 4,
    },
  }];

const readerItem = () => ({
  storyClusterId: "cluster-1",
  cardKind: "curated_top_read" as const,
  promotionMarker: "reader_post_promotion" as const,
  promotionPolicyVersion: "reader_post_promotion.v1" as const,
  promotionTier: "top" as const,
  promotionCandidateId: "feed-1",
  promotionCanonicalIdentity: "repo:openai/codex",
  title: "openai/codex leads repo radar",
  providerKey: "github-repo-radar",
  providerName: "GitHub Repo Radar",
  primaryActionKind: "read_source" as const,
  reason: "Repository is gaining stars quickly.",
  matchedInterestIds: ["ai-tools"],
  matchedRules: ["agent"],
  signalScore: 0.9,
  confidence: {
    level: "medium" as const,
    score: 0.7,
    rationale: "Selected evidence is sufficient for a reader summary.",
  },
  confirmedProviderKeys: ["github-repo-radar"],
  providerMetrics: [],
  whyImportant: ["Repository is gaining stars quickly."],
  whyNow: "The repository gained attention in the selected window.",
  canonicalUrl: "https://github.com/openai/codex",
  citationIds: ["citation-1"],
});

const officialQuality = () => ({
  qualityScore: 0.9,
  interestRelevanceScore: 0.9,
  engagementIntegrityScore: 0.9,
  eligibleForSummary: true,
  eligibleForTopRead: true,
  needsLlmReview: false,
  decision: "promote",
  flags: ["official_account", "trusted_author"],
  reason: "Verified first-party source authority",
});
