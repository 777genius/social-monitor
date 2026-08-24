import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  ReaderSummaryArtifact,
  type ReaderSummaryArtifactProps,
} from "../../../domain";
import { emptyReaderSummaryReliabilityReport } from "../../../domain/entities/reader-summary-reliability";
import {
  normalizeReaderSummaryArtifactPayload,
  readerSummaryCitationsToPrisma,
  serializeReaderSummaryArtifact,
} from "./prisma-reader-summary-records";

const artifactProps = (
  overrides: Partial<ReaderSummaryArtifactProps> = {},
): ReaderSummaryArtifactProps => ({
  schemaVersion: "reader_summary.artifact.v1",
  readerSummaryId: "reader-summary-json-1",
  tenantId: tenantId("tenant-reader-summary-json"),
  workspaceId: workspaceId("workspace-reader-summary-json"),
  scope: { type: "workspace" },
  period: {
    cadence: "daily",
    startedAt: new Date("2026-07-03T00:00:00.000Z"),
    endedAt: new Date("2026-07-04T00:00:00.000Z"),
    timezone: "UTC",
    periodKey: "daily:2026-07-03T00:00:00.000Z:2026-07-04T00:00:00.000Z:UTC",
  },
  generatedAt: new Date("2026-07-04T00:05:00.000Z"),
  sourceWindow: {
    windowId: "window-json",
    startedAt: new Date("2026-07-03T08:00:00.000Z"),
    endedAt: new Date("2026-07-03T08:30:00.000Z"),
    selectedFeedItemIds: ["feed-json-1"],
    storyClusterIds: ["story:json"],
  },
  storyClusters: [
    {
      id: "story:json",
      storyKey: "url:example.com/json",
      representativeFeedItemId: "feed-json-1",
      duplicateFeedItemIds: [],
      interestIds: ["interest-ai"],
      providerKeys: ["reddit"],
      score: 1.4,
      observedAtRange: {
        startedAt: new Date("2026-07-03T08:00:00.000Z"),
        endedAt: new Date("2026-07-03T08:30:00.000Z"),
      },
      whyImportant: ["Relevant source item."],
    },
  ],
  contextArtifacts: [],
  headline: "AI source signal is worth reading",
  executiveSummary: "A monitored source produced a useful AI signal.",
  topStories: [
    {
      storyClusterId: "story:json",
      title: "AI source signal",
      summary: "A cited source item is relevant.",
      interestIds: ["interest-ai"],
      providerKeys: ["reddit"],
      citationIds: ["c1"],
    },
  ],
  interestHighlights: [],
  repeatedSignals: [],
  risksAndUnknowns: [],
  citationMap: [
    {
      citationId: "c1",
      feedItemId: "feed-json-1",
      sourceItemId: "source-json-1",
      providerKey: "reddit",
      field: "title",
      canonicalUrl: "https://reddit.com/r/OpenAI/comments/json",
    },
  ],
  qualityFlags: [],
  confidence: {
    level: "medium",
    score: 0.64,
    rationale: "A cited source item backs the summary.",
  },
  lineage: {
    promptVersion: "reader-summary.prompt.v1",
    schemaVersion: "reader_summary.artifact.v1",
    modelVersion: "deterministic-reader-summary-v1",
    providerVersion: "deterministic-local",
    rulesVersion: "reader_summary.rules.policy.v1",
    evalDatasetVersion: "reader_summary.eval.v1",
  },
  usage: {
    inputTokens: 10,
    outputTokens: 20,
    estimatedCostUsd: 0,
  },
  content: readerContent(),
  ...overrides,
});

const readerContent = (): NonNullable<
  ReaderSummaryArtifactProps["content"]
> => {
  const item = {
    storyClusterId: "story:json",
    cardKind: "curated_top_read" as const,
    title: "AI source signal",
    providerKey: "reddit",
    providerName: "Reddit",
    primaryActionKind: "read_source" as const,
    reason: "It is relevant to the monitored topic.",
    matchedInterestIds: ["interest-ai"],
    matchedRules: ["ai"],
    signalScore: 1.4,
    confidence: {
      level: "medium" as const,
      score: 0.64,
      rationale: "The source item is cited.",
    },
    confirmedProviderKeys: ["reddit"],
    providerMetrics: [],
    whyImportant: ["Relevant source item."],
    whyNow: "It appeared in the current summary window.",
    canonicalUrl: "https://reddit.com/r/OpenAI/comments/json",
    citationIds: ["c1"],
    previewMedia: undefined,
  };

  return {
    headline: "AI source signal is worth reading",
    oneLineTakeaway: "A monitored source produced a useful AI signal.\u0000",
    bullets: ["A cited Reddit source item is relevant."],
    mainTopics: ["AI"],
    qualityState: {
      status: "ready",
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
    topReads: [item],
    selectedPosts: [
      { ...item, cardKind: "additional_notable_story" as const },
    ],
    claimBoard: [],
    reliabilityReport: emptyReaderSummaryReliabilityReport(),
    trendDelta: {
      newSignals: ["1 Reddit item selected"],
      growingSignals: [],
      repeatedSignals: [],
      fadingSignals: [],
    },
    openQuestions: ["Is there confirming source evidence?"],
    risks: [],
    nextActions: [],
  };
};

describe("prisma reader summary records", () => {
  it("rejects a curated marker outside the artifact cluster authority", () => {
    const content = readerContent();
    const forged = {
      ...content.topReads[0]!,
      storyClusterId: "story:forged",
      cardKind: "curated_top_read" as const,
    };

    expect(() =>
      ReaderSummaryArtifact.create(
        artifactProps({ content: { ...content, topReads: [forged] } }),
      ),
    ).toThrow("authorized story cluster");
  });

  it("rejects an additional-story marker outside the artifact cluster authority", () => {
    const content = readerContent();
    const forged = {
      ...content.selectedPosts![0]!,
      storyClusterId: "story:forged",
      cardKind: "additional_notable_story" as const,
    };

    expect(() =>
      ReaderSummaryArtifact.create(
        artifactProps({ content: { ...content, selectedPosts: [forged] } }),
      ),
    ).toThrow("authorized story cluster");
  });

  it("serializes reader summary artifacts into Prisma JSON-safe payloads", () => {
    const artifact = ReaderSummaryArtifact.create(artifactProps());

    const payload = serializeReaderSummaryArtifact(artifact);

    expect(JSON.stringify(payload)).not.toContain("previewMedia");
    expect(JSON.stringify(payload)).not.toContain("\\u0000");
    expect(payload).toMatchObject({
      generatedAt: "2026-07-04T00:05:00.000Z",
      period: {
        startedAt: "2026-07-03T00:00:00.000Z",
        endedAt: "2026-07-04T00:00:00.000Z",
      },
      sourceWindow: {
        startedAt: "2026-07-03T08:00:00.000Z",
        endedAt: "2026-07-03T08:30:00.000Z",
      },
      storyClusters: [
        {
          observedAtRange: {
            startedAt: "2026-07-03T08:00:00.000Z",
            endedAt: "2026-07-03T08:30:00.000Z",
          },
        },
      ],
      content: {
        selectedPosts: [
          {
            storyClusterId: "story:json",
            cardKind: "additional_notable_story",
          },
        ],
      },
    });
    expect(payload.userId).toBeUndefined();
    expect(readerSummaryCitationsToPrisma(artifact)).toEqual([
      expect.objectContaining({ citationId: "c1" }),
    ]);
  });

  it("round-trips historical-incomplete token usage without fabricating zeroes", () => {
    const serialized = serializeReaderSummaryArtifact(
      ReaderSummaryArtifact.create(artifactProps({
        usage: {
          inputTokens: null,
          outputTokens: null,
          estimatedCostUsd: 0,
        },
      })),
    );
    const normalized = normalizeReaderSummaryArtifactPayload(serialized, {
      id: "reader-summary-json-1",
      tenantId: "tenant-reader-summary-json",
      workspaceId: "workspace-reader-summary-json",
      scopeType: "workspace",
      interestId: null,
      cadence: "daily",
      periodStartedAt: new Date("2026-07-03T00:00:00.000Z"),
      periodEndedAt: new Date("2026-07-04T00:00:00.000Z"),
      periodTimezone: "UTC",
      userId: null,
      subscriptionId: null,
      headline: "AI source signal is worth reading",
      summaryText: "A monitored source produced a useful AI signal.",
      createdAt: new Date("2026-07-04T00:05:00.000Z"),
    });

    expect(normalized.usage).toEqual({
      inputTokens: null,
      outputTokens: null,
      estimatedCostUsd: 0,
    });
  });

  it("rehydrates legacy missing card markers as unsupported", () => {
    const serialized = serializeReaderSummaryArtifact(
      ReaderSummaryArtifact.create(artifactProps()),
    ) as Record<string, unknown>;
    const content = serialized.content as {
      topReads: Array<Record<string, unknown>>;
      selectedPosts: Array<Record<string, unknown>>;
    };
    delete content.topReads[0]?.storyClusterId;
    delete content.topReads[0]?.cardKind;
    delete content.selectedPosts[0]?.storyClusterId;
    delete content.selectedPosts[0]?.cardKind;

    const normalized = normalizeReaderSummaryArtifactPayload(serialized, {
      id: "reader-summary-json-1",
      tenantId: "tenant-reader-summary-json",
      workspaceId: "workspace-reader-summary-json",
      scopeType: "workspace",
      interestId: null,
      cadence: "daily",
      periodStartedAt: new Date("2026-07-03T00:00:00.000Z"),
      periodEndedAt: new Date("2026-07-04T00:00:00.000Z"),
      periodTimezone: "UTC",
      userId: null,
      subscriptionId: null,
      headline: "AI source signal is worth reading",
      summaryText: "A monitored source produced a useful AI signal.",
      createdAt: new Date("2026-07-04T00:05:00.000Z"),
    });

    expect(normalized.content?.topReads[0]).not.toHaveProperty("storyClusterId");
    expect(normalized.content?.topReads[0]).not.toHaveProperty("cardKind");
    expect(normalized.content?.selectedPosts?.[0]).not.toHaveProperty(
      "storyClusterId",
    );
    expect(normalized.content?.selectedPosts?.[0]).not.toHaveProperty(
      "cardKind",
    );
  });
});
