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
      reasonCodes: expect.arrayContaining(["top_read_ineligible_source"]),
      findings: expect.arrayContaining([
        expect.objectContaining({
          code: "top_read_ineligible_source",
          topReadTitle: "AI runtime quality discussion",
          citationId: "citation-publication-1",
          feedItemId: "feed-publication-1",
          sourceItemId: "source-publication-1",
          providerKey: "reddit",
          canonicalUrl: "https://reddit.example.test/post",
        }),
      ]),
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

  it("rejects technical leakage inside the canonical public narrative", () => {
    const decision = policy.evaluate({
      artifact: artifact({
        content: content({
          narrativeSections: [
            {
              id: "narrative-publication-lead",
              kind: "lead",
              title: "Main signal",
              text: "Internal provider:reddit evidence should never reach readers.",
              citationIds: ["citation-publication-1"],
              storyClusterId: "story-publication-1",
            },
          ],
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
          reason: expect.stringContaining("provider:reddit"),
        }),
      ],
    });
  });

  it("rejects technical leakage inside the public executive summary", () => {
    const decision = policy.evaluate({
      artifact: artifact({
        executiveSummary:
          "Internal source item 00000000-0000-7000-8000-000000000001 must stay private.",
      }),
      evidence: evidenceSelection(),
    });

    expect(decision).toMatchObject({
      status: "rejected",
      reasonCodes: ["technical_leakage"],
      findings: [
        expect.objectContaining({
          code: "technical_leakage",
          reason: expect.stringContaining("source item"),
        }),
      ],
    });
  });

  it("publishes a multi-provider daily synthesis with an unbound lead", () => {
    const decision = policy.evaluate({
      artifact: dailySynthesisArtifact(),
      evidence: dailyEvidenceSelection(),
    });

    expect(decision).toMatchObject({
      status: "published",
      qualityPassed: true,
    });
  });

  it("rejects a single-story artifact when the deterministic coverage plan requires a daily synthesis", () => {
    const decision = policy.evaluate({
      artifact: artifact(),
      evidence: dailyEvidenceSelection(),
    });

    expect(decision).toMatchObject({
      status: "rejected",
      reasonCodes: ["editorial_quality"],
      reasons: expect.arrayContaining([
        expect.stringContaining(
          "Daily synthesis lead must cite at least two story clusters",
        ),
        expect.stringContaining(
          "Daily synthesis lead must cite at least two providers",
        ),
      ]),
    });
  });

  it("publishes a structured Watch section whose text starts with a repository bullet", () => {
    const decision = policy.evaluate({
      artifact: dailySynthesisArtifact({
        watchText: "- **example/repo**: +1,200 stars today.",
      }),
      evidence: dailyEvidenceSelection(),
    });

    expect(decision).toMatchObject({
      status: "published",
      qualityPassed: true,
    });
  });

  it("rejects a daily synthesis lead bound to a single story", () => {
    const decision = policy.evaluate({
      artifact: dailySynthesisArtifact({
        narrativeSections: [
          {
            id: "narrative-publication-daily-lead",
            kind: "lead",
            title: "Main signal",
            text: "Reddit and Hacker News surface distinct AI workflow signals.",
            citationIds: [
              "citation-publication-1",
              "citation-publication-2",
            ],
            storyClusterId: "story-publication-1",
          },
        ],
      }),
      evidence: dailyEvidenceSelection(),
    });

    expect(decision).toMatchObject({
      status: "rejected",
      reasonCodes: ["editorial_quality"],
      reasons: expect.arrayContaining([
        expect.stringContaining(
          "Daily synthesis lead must not be bound to one story cluster",
        ),
      ]),
    });
  });

  it("rejects a secondary signal that mixes unrelated story clusters", () => {
    const decision = policy.evaluate({
      artifact: dailySynthesisArtifact({
        narrativeSections: [
          {
            id: "narrative-publication-daily-lead",
            kind: "lead",
            title: "Main signal",
            text: "Reddit and Hacker News surface distinct AI workflow signals.",
            citationIds: [
              "citation-publication-1",
              "citation-publication-2",
            ],
          },
          {
            id: "narrative-publication-secondary",
            kind: "secondary_signal",
            title: "Workflow costs",
            text: "A secondary signal must remain grounded in one story.",
            citationIds: [
              "citation-publication-2",
              "citation-publication-1",
            ],
            storyClusterId: "story-publication-2",
          },
        ],
      }),
      evidence: dailyEvidenceSelection(),
    });

    expect(decision).toMatchObject({
      status: "rejected",
      reasonCodes: ["editorial_quality"],
      reasons: expect.arrayContaining([
        expect.stringContaining(
          "Secondary signal cites evidence from another story cluster",
        ),
      ]),
    });
  });

  it("rejects a daily synthesis whose headline copies a top post", () => {
    const decision = policy.evaluate({
      artifact: dailySynthesisArtifact({
        headline: "AI runtime quality discussion",
      }),
      evidence: dailyEvidenceSelection(),
    });

    expect(decision).toMatchObject({
      status: "rejected",
      reasonCodes: ["editorial_quality"],
      reasons: [expect.stringContaining("Headline copies a top-post title")],
    });
  });

  it("rejects a provider-dominated daily synthesis", () => {
    const decision = policy.evaluate({
      artifact: providerDominatedDailySynthesisArtifact(),
      evidence: dailyEvidenceSelection(),
    });

    expect(decision).toMatchObject({
      status: "rejected",
      reasonCodes: ["editorial_quality"],
      reasons: expect.arrayContaining([
        expect.stringContaining(
          "One provider supplies more than 75% of main narrative citations",
        ),
      ]),
    });
  });

  it("rejects malformed narrative Markdown before publish", () => {
    const decision = policy.evaluate({
      artifact: dailySynthesisArtifact({
        watchText: "Watch: - **example/repo**: +1,200 stars today.",
      }),
      evidence: dailyEvidenceSelection(),
    });

    expect(decision).toMatchObject({
      status: "rejected",
      reasonCodes: ["editorial_quality"],
      reasons: [expect.stringContaining("inline nested Watch bullet")],
    });
  });

  it("bypasses editorial gates for a valid no-signal artifact", () => {
    const decision = policy.evaluate({
      artifact: artifact({
        content: undefined,
        topStories: [],
        qualityFlags: ["no_signal", "limited_sources"],
        noSignalReason: "No eligible evidence passed the selection policy.",
        confidence: {
          level: "none",
          score: 0,
          rationale: "No eligible evidence was selected.",
        },
      }),
      evidence: evidenceSelection(),
    });

    expect(decision).toMatchObject({
      status: "published",
      qualityPassed: true,
      reasons: ["Reader summary artifact is a valid no-signal result."],
    });
  });

  it("does not bypass editorial gates for a signaled artifact carrying a no-signal flag", () => {
    const decision = policy.evaluate({
      artifact: artifact({
        qualityFlags: ["no_signal"],
        noSignalReason: "Inconsistent legacy marker.",
      }),
      evidence: evidenceSelection(),
    });

    expect(decision).toMatchObject({
      status: "rejected",
      reasonCodes: ["editorial_quality"],
      reasons: [
        expect.stringContaining(
          "no_signal flag conflicts with publishable content",
        ),
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
    headline: "Developers weigh AI runtime quality",
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

const content = (overrides: Partial<ReaderSummaryContent> = {}) => {
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
    headline: "Developers weigh AI runtime quality",
    oneLineTakeaway: "A cited source backs the runtime quality discussion.",
    bullets: ["A cited Reddit source is relevant."],
    narrativeSections: [
      {
        id: "narrative-publication-lead",
        kind: "lead" as const,
        title: "Main signal",
        text: "A cited source backs the runtime quality discussion.",
        citationIds: ["citation-publication-1"],
        storyClusterId: "story-publication-1",
      },
    ],
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

const dailySynthesisArtifact = (
  overrides: {
    readonly headline?: string;
    readonly executiveSummary?: string;
    readonly watchText?: string;
    readonly narrativeSections?: NonNullable<
      ReaderSummaryContent["narrativeSections"]
    >;
  } = {},
): ReaderSummaryArtifact => {
  const headline = overrides.headline ?? "AI workflows draw broader scrutiny";
  const storyClusters = [
    publicationStoryCluster(),
    publicationStoryCluster({
      id: "story-publication-2",
      representativeFeedItemId: "feed-publication-2",
      providerKeys: ["hacker-news"],
    }),
  ];
  const citationMap = [
    publicationCitation(),
    publicationCitation({
      citationId: "citation-publication-2",
      feedItemId: "feed-publication-2",
      sourceItemId: "source-publication-2",
      providerKey: "hacker-news",
      canonicalUrl: "https://news.example.test/item/2",
    }),
  ];

  return artifact({
    headline,
    executiveSummary:
      overrides.executiveSummary ??
      "Reddit and Hacker News surface distinct AI workflow signals.",
    sourceWindow: {
      windowId: "window-publication",
      startedAt: new Date("2026-07-05T08:00:00.000Z"),
      endedAt: new Date("2026-07-05T09:00:00.000Z"),
      selectedFeedItemIds: ["feed-publication-1", "feed-publication-2"],
      storyClusterIds: storyClusters.map((cluster) => cluster.id),
    },
    storyClusters,
    citationMap,
    content: content({
      headline,
      narrativeSections:
        overrides.narrativeSections ??
        [
          {
            id: "narrative-publication-daily-lead",
            kind: "lead",
            title: "Main signal",
            text: "Reddit and Hacker News surface distinct AI workflow signals.",
            citationIds: ["citation-publication-1", "citation-publication-2"],
          },
          ...(overrides.watchText === undefined
            ? []
            : [
                {
                  id: "narrative-publication-watch",
                  kind: "watch" as const,
                  title: "Watch",
                  text: overrides.watchText,
                  citationIds: ["citation-publication-1"],
                },
              ]),
        ],
    }),
  });
};

const providerDominatedDailySynthesisArtifact = (): ReaderSummaryArtifact => {
  const thirdCluster = publicationStoryCluster({
    id: "story-publication-3",
    representativeFeedItemId: "feed-publication-3",
    duplicateFeedItemIds: ["feed-publication-4", "feed-publication-5"],
  });
  const base = dailySynthesisArtifact().toSnapshot();
  const extraCitations = [3, 4, 5].map((index) =>
    publicationCitation({
      citationId: `citation-publication-${index}`,
      feedItemId: `feed-publication-${index}`,
      sourceItemId: `source-publication-${index}`,
      canonicalUrl: `https://reddit.example.test/post/${index}`,
    }),
  );

  return artifact({
    ...base,
    sourceWindow: {
      ...base.sourceWindow,
      selectedFeedItemIds: [
        ...base.sourceWindow.selectedFeedItemIds,
        "feed-publication-3",
        "feed-publication-4",
        "feed-publication-5",
      ],
      storyClusterIds: [...base.sourceWindow.storyClusterIds, thirdCluster.id],
    },
    storyClusters: [...base.storyClusters, thirdCluster],
    citationMap: [...base.citationMap, ...extraCitations],
    content: content({
      headline: base.content?.headline ?? base.headline,
      narrativeSections: [
        ...(base.content?.narrativeSections ?? []),
        {
          id: "narrative-publication-secondary",
          kind: "secondary_signal",
          title: "Community follow-up",
          text: "Three Reddit citations expand the secondary signal.",
          citationIds: extraCitations.map((citation) => citation.citationId),
          storyClusterId: thirdCluster.id,
        },
      ],
    }),
  });
};

const publicationStoryCluster = (
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

const publicationCitation = (
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

const evidenceSelection = (
  overrides: {
    readonly firstContentQuality?: SummaryEvidenceContentQuality;
  } = {},
): SummaryEvidenceSelection => ({
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

const dailyEvidenceSelection = (): SummaryEvidenceSelection => {
  const base = evidenceSelection();
  const first = base.selectedEvidence[0]!;
  const firstCluster = base.clusters[0]!;
  const secondCluster = publicationStoryCluster({
    id: "story-publication-2",
    representativeFeedItemId: "feed-publication-2",
    providerKeys: ["hacker-news"],
  });
  const contentQuality: SummaryEvidenceContentQuality = {
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
  const selectedEvidence = [
    { ...first, score: 3, contentQuality },
    {
      ...first,
      feedItemId: "feed-publication-2",
      sourceItemId: "source-publication-2",
      sourceBindingId: "binding-publication-2",
      providerKey: "hacker-news",
      providerName: "Hacker News",
      canonicalUrl: "https://news.example.test/item/2",
      title: "Developers compare AI workflow costs",
      score: 2.4,
      contentQuality,
    },
  ];

  return {
    ...base,
    sourceWindow: {
      ...base.sourceWindow,
      selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
      storyClusterIds: [firstCluster.id, secondCluster.id],
    },
    clusters: [
      { ...firstCluster, score: 3 },
      { ...secondCluster, score: 2.4 },
    ],
    selectedEvidence,
  };
};

const period = () => ({
  cadence: "daily" as const,
  startedAt: new Date("2026-07-05T00:00:00.000Z"),
  endedAt: new Date("2026-07-06T00:00:00.000Z"),
  timezone: "UTC",
  periodKey: "daily:2026-07-05T00:00:00.000Z:2026-07-06T00:00:00.000Z:UTC",
});
