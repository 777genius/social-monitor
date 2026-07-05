import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { ReaderSummaryArtifact } from "../entities/reader-summary-artifact";
import type { ReaderSummaryContent } from "../entities/reader-summary-artifact";
import { emptyReaderSummaryReliabilityReport } from "../entities/reader-summary-reliability";
import type {
  SummaryEvidenceContentQuality,
  SummaryEvidenceSelection,
} from "../value-objects/summary-evidence-item";
import { ReaderSummaryPublicationPolicy } from "./reader-summary-publication-policy";

const policy = new ReaderSummaryPublicationPolicy();

describe("ReaderSummaryPublicationPolicy", () => {
  it("publishes artifacts whose top reads resolve to eligible evidence", () => {
    const decision = policy.evaluate({
      artifact: artifact(),
      evidence: evidenceSelection(),
    });

    expect(decision).toMatchObject({
      status: "published",
      qualityPassed: true,
    });
  });

  it("rejects artifacts whose top reads reference ineligible evidence", () => {
    const decision = policy.evaluate({
      artifact: artifact(),
      evidence: evidenceSelection({
        firstContentQuality: {
          qualityScore: 0.2,
          interestRelevanceScore: 0.3,
          engagementIntegrityScore: 0.5,
          eligibleForSummary: true,
          eligibleForTopRead: false,
          needsLlmReview: true,
          decision: "downrank",
          flags: ["rumor_only"],
          reason: "Rumor-only evidence cannot become a top read.",
        },
      }),
    });

    expect(decision).toMatchObject({
      status: "rejected",
      qualityPassed: false,
      reasonCodes: ["top_read_ineligible_source"],
      findings: [
        expect.objectContaining({
          code: "top_read_ineligible_source",
          topReadTitle: "AI runtime quality discussion",
          citationId: "citation-publication-1",
          feedItemId: "feed-publication-1",
          sourceItemId: "source-publication-1",
          providerKey: "reddit",
          canonicalUrl: "https://reddit.example.test/post",
        }),
      ],
    });
  });

  it("rejects user-facing technical leakage before publish", () => {
    const decision = policy.evaluate({
      artifact: artifact({
        content: content({
          oneLineTakeaway:
            "This summary references canonicalUrl evidence from source item 00000000-0000-7000-8000-000000000001.",
        }),
      }),
      evidence: evidenceSelection(),
    });

    expect(decision).toMatchObject({
      status: "rejected",
      reasonCodes: ["technical_leakage"],
      findings: [
        expect.objectContaining({
          code: "technical_leakage",
          reason: expect.stringContaining("canonicalUrl"),
        }),
      ],
    });
  });

  it("keeps borderline source risks in shadow mode without blocking publish", () => {
    const decision = policy.evaluate({
      artifact: artifact({
        confidence: {
          level: "low",
          score: 0.42,
          rationale: "Single-source evidence is directionally useful.",
        },
      }),
      evidence: evidenceSelection(),
    });

    expect(decision).toMatchObject({
      status: "published",
      shadow: {
        mode: "shadow",
        policyVersion: "reader_summary_publication_shadow_v1",
        signals: expect.arrayContaining([
          expect.objectContaining({ code: "low_confidence" }),
          expect.objectContaining({ code: "single_source" }),
        ]),
      },
    });
  });
});

const artifact = (
  overrides: Partial<Parameters<typeof ReaderSummaryArtifact.create>[0]> = {},
): ReaderSummaryArtifact =>
  ReaderSummaryArtifact.create({
    schemaVersion: "reader_summary.artifact.v1",
    readerSummaryId: "reader-summary-publication-1",
    tenantId: tenantId("tenant-reader-summary-publication"),
    workspaceId: workspaceId("workspace-reader-summary-publication"),
    scope: { type: "workspace" },
    period: period(),
    sourceWindow: {
      windowId: "window-publication",
      startedAt: new Date("2026-07-05T08:00:00.000Z"),
      endedAt: new Date("2026-07-05T09:00:00.000Z"),
      selectedFeedItemIds: ["feed-publication-1"],
      storyClusterIds: ["story-publication-1"],
    },
    storyClusters: [
      {
        id: "story-publication-1",
        storyKey: "publication-quality",
        representativeFeedItemId: "feed-publication-1",
        duplicateFeedItemIds: [],
        interestIds: ["interest-ai"],
        providerKeys: ["reddit"],
        score: 1,
        observedAtRange: {
          startedAt: new Date("2026-07-05T08:00:00.000Z"),
          endedAt: new Date("2026-07-05T09:00:00.000Z"),
        },
        whyImportant: ["Relevant discussion"],
      },
    ],
    contextArtifacts: [],
    headline: "AI runtime quality discussion",
    executiveSummary: "A cited source backs the runtime quality discussion.",
    content: content(),
    topStories: [
      {
        storyClusterId: "story-publication-1",
        title: "AI runtime quality discussion",
        summary: "A cited source backs the runtime quality discussion.",
        interestIds: ["interest-ai"],
        providerKeys: ["reddit"],
        citationIds: ["citation-publication-1"],
      },
    ],
    interestHighlights: [],
    repeatedSignals: [],
    risksAndUnknowns: [],
    citationMap: [
      {
        citationId: "citation-publication-1",
        feedItemId: "feed-publication-1",
        sourceItemId: "source-publication-1",
        providerKey: "reddit",
        field: "title",
        canonicalUrl: "https://reddit.example.test/post",
      },
    ],
    qualityFlags: [],
    confidence: {
      level: "medium",
      score: 0.7,
      rationale: "The cited discussion supports the summary.",
    },
    lineage: {
      promptVersion: "reader-summary.prompt.test.v1",
      schemaVersion: "reader_summary.artifact.v1",
      modelVersion: "publication-policy-test",
      providerVersion: "deterministic-local",
      rulesVersion: "reader-summary.rules.test.v1",
      evalDatasetVersion: "reader-summary.eval.test.v1",
    },
    usage: {
      inputTokens: 100,
      outputTokens: 50,
      estimatedCostUsd: 0,
    },
    ...overrides,
  });

const content = (
  overrides: Partial<ReaderSummaryContent> = {},
) => {
  const topRead = {
    title: "AI runtime quality discussion",
    providerKey: "reddit",
    providerName: "Reddit",
    primaryActionKind: "read_source" as const,
    reason: "It is relevant to the monitored topic.",
    matchedInterestIds: ["interest-ai"],
    matchedRules: ["ai"],
    signalScore: 1,
    confidence: {
      level: "medium" as const,
      score: 0.7,
      rationale: "The cited discussion supports the summary.",
    },
    confirmedProviderKeys: ["reddit"],
    providerMetrics: [],
    whyImportant: ["Relevant discussion"],
    whyNow: "It appeared in the current summary window.",
    canonicalUrl: "https://reddit.example.test/post",
    citationIds: ["citation-publication-1"],
  };

  return {
    headline: "AI runtime quality discussion",
    oneLineTakeaway: "A cited source backs the runtime quality discussion.",
    bullets: ["A cited Reddit source is relevant."],
    qualityState: {
      status: "ready" as const,
      flags: [],
      warnings: [],
      isSingleSource: true,
    },
    interestSections: [],
    sourceMix: [
      {
        providerKey: "reddit",
        itemCount: 1,
        citationCount: 1,
        storyClusterCount: 1,
        crossSourceClusterCount: 0,
        singleSourceOnly: true,
        interestIds: ["interest-ai"],
      },
    ],
    topReads: [topRead],
    selectedPosts: [topRead],
    claimBoard: [],
    reliabilityReport: emptyReaderSummaryReliabilityReport(),
    trendDelta: {
      newSignals: ["1 Reddit item selected"],
      growingSignals: [],
      repeatedSignals: [],
      fadingSignals: [],
    },
    openQuestions: [],
    risks: [],
    nextActions: [],
    ...overrides,
  };
};

const evidenceSelection = (overrides: {
  readonly firstContentQuality?: SummaryEvidenceContentQuality;
} = {}): SummaryEvidenceSelection => ({
  rankingPolicyVersion: "story-ranking.test.v1",
  sourceWindow: {
    windowId: "window-publication",
    startedAt: new Date("2026-07-05T08:00:00.000Z"),
    endedAt: new Date("2026-07-05T09:00:00.000Z"),
    selectedFeedItemIds: ["feed-publication-1"],
    storyClusterIds: ["story-publication-1"],
  },
  clusters: [
    {
      id: "story-publication-1",
      storyKey: "publication-quality",
      representativeFeedItemId: "feed-publication-1",
      duplicateFeedItemIds: [],
      interestIds: ["interest-ai"],
      providerKeys: ["reddit"],
      score: 1,
      observedAtRange: {
        startedAt: new Date("2026-07-05T08:00:00.000Z"),
        endedAt: new Date("2026-07-05T09:00:00.000Z"),
      },
        whyImportant: ["Relevant discussion"],
    },
  ],
  selectedEvidence: [
    {
      feedItemId: "feed-publication-1",
      sourceItemId: "source-publication-1",
      sourceBindingId: "binding-publication-1",
      interestId: "interest-ai",
      providerKey: "reddit",
      providerName: "Reddit",
      canonicalUrl: "https://reddit.example.test/post",
      title: "AI runtime quality discussion",
      bodyPreview: "A source discusses runtime quality.",
      publishedAt: new Date("2026-07-05T08:00:00.000Z"),
      observedAt: new Date("2026-07-05T08:05:00.000Z"),
      score: 1,
      whyImportant: ["Relevant discussion"],
      contentQuality: overrides.firstContentQuality,
    },
  ],
});

const period = () => ({
  cadence: "daily" as const,
  startedAt: new Date("2026-07-05T00:00:00.000Z"),
  endedAt: new Date("2026-07-06T00:00:00.000Z"),
  timezone: "UTC",
  periodKey: "daily:2026-07-05T00:00:00.000Z:2026-07-06T00:00:00.000Z:UTC",
});
