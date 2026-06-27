import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import {
  assertReaderSummaryCitationsAgainstEvidence,
  ReaderSummaryArtifact,
  type ReaderSummaryArtifactProps,
} from "./reader-summary-artifact";

const baseArtifact = (
  overrides: Partial<ReaderSummaryArtifactProps> = {},
): ReaderSummaryArtifactProps => ({
  schemaVersion: "reader_summary.artifact.v1",
  readerSummaryId: "reader-summary-1",
  tenantId: tenantId("tenant-reader-summary-artifact"),
  workspaceId: workspaceId("workspace-reader-summary-artifact"),
  scope: { type: "workspace" },
  sourceWindow: {
    windowId: "window-1",
    startedAt: new Date("2026-06-23T08:00:00.000Z"),
    endedAt: new Date("2026-06-23T09:00:00.000Z"),
    selectedFeedItemIds: ["feed-1"],
    storyClusterIds: ["story:one"],
  },
  storyClusters: [
    {
      id: "story:one",
      storyKey: "url:example.com/a",
      representativeFeedItemId: "feed-1",
      duplicateFeedItemIds: ["feed-2"],
      topicIds: ["topic-ai", "topic-github"],
      providerKeys: ["reddit", "github"],
      score: 2.4,
      observedAtRange: {
        startedAt: new Date("2026-06-23T08:10:00.000Z"),
        endedAt: new Date("2026-06-23T08:30:00.000Z"),
      },
      whyImportant: ["Repeated across monitored topics"],
    },
  ],
  contextArtifacts: [],
  headline: "AI tooling is trending across sources",
  executiveSummary:
    "The same AI tooling story appeared across several monitored surfaces.",
  topStories: [
    {
      storyClusterId: "story:one",
      title: "AI tooling is trending",
      summary: "One story is repeated across multiple topics.",
      topicIds: ["topic-ai", "topic-github"],
      providerKeys: ["reddit", "github"],
      citationIds: ["citation-1"],
    },
  ],
  topicHighlights: [],
  repeatedSignals: [
    {
      storyClusterId: "story:one",
      title: "Repeated across AI and GitHub topics",
      topicIds: ["topic-ai", "topic-github"],
      citationIds: ["citation-1"],
    },
  ],
  risksAndUnknowns: [],
  citationMap: [
    {
      citationId: "citation-1",
      feedItemId: "feed-1",
      sourceItemId: "source-1",
      providerKey: "reddit",
      field: "title",
    },
  ],
  qualityFlags: [],
  confidence: {
    level: "medium",
    score: 0.64,
    rationale: "Direct source item citation with repeated topic coverage.",
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
  ...overrides,
});

const readerTopRead = (
  overrides: Partial<
    NonNullable<ReaderSummaryArtifactProps["content"]>["topReads"][number]
  > = {},
): NonNullable<ReaderSummaryArtifactProps["content"]>["topReads"][number] => ({
  title: "AI tooling is trending",
  providerKey: "reddit",
  providerName: "Reddit",
  primaryActionKind: "read_source",
  reason: "Repeated across monitored topics.",
  matchedTopicIds: ["topic-ai"],
  matchedRules: ["developer-tools"],
  signalScore: 0.91,
  confidence: {
    level: "medium",
    score: 0.72,
    rationale: "Direct citation backs the top read.",
  },
  confirmedProviderKeys: ["reddit"],
  providerMetrics: [],
  whyImportant: ["Repeated across monitored topics"],
  whyNow: "It appeared in the current monitoring window.",
  canonicalUrl: "https://reddit.com/r/OpenAI/comments/example",
  citationIds: ["citation-1"],
  ...overrides,
});

const readerContent = (
  overrides: Partial<NonNullable<ReaderSummaryArtifactProps["content"]>> = {},
): NonNullable<ReaderSummaryArtifactProps["content"]> => ({
  headline: "AI tooling is trending across sources",
  oneLineTakeaway: "One monitored story is worth reading now.",
  bullets: ["Repeated evidence points to a useful developer tooling signal."],
  qualityState: {
    status: "ready",
    flags: [],
    warnings: [],
    isSingleSource: false,
  },
  topicSections: [],
  sourceMix: [
    {
      providerKey: "reddit",
      itemCount: 1,
      citationCount: 1,
      storyClusterCount: 1,
      crossSourceClusterCount: 1,
      singleSourceOnly: false,
      topicIds: ["topic-ai"],
    },
  ],
  topReads: [readerTopRead()],
  trendDelta: {
    newSignals: [],
    growingSignals: ["AI tooling"],
    repeatedSignals: [],
    fadingSignals: [],
  },
  openQuestions: [],
  risks: [],
  nextActions: [],
  ...overrides,
});

describe("ReaderSummaryArtifact", () => {
  it("accepts a workspace reader summary with story clusters and feed citations", () => {
    expect(
      ReaderSummaryArtifact.create(baseArtifact()).toSnapshot(),
    ).toMatchObject({
      schemaVersion: "reader_summary.artifact.v1",
      readerSummaryId: "reader-summary-1",
      scope: { type: "workspace" },
      topStories: [
        expect.objectContaining({
          storyClusterId: "story:one",
          citationIds: ["citation-1"],
        }),
      ],
    });
  });

  it("rejects top reads that cite outside the citation map", () => {
    expect(() =>
      ReaderSummaryArtifact.create(
        baseArtifact({
          topStories: [
            {
              storyClusterId: "story:one",
              title: "Untrusted story",
              summary: "This cites a missing source.",
              topicIds: ["topic-ai"],
              providerKeys: ["reddit"],
              citationIds: ["missing-citation"],
            },
          ],
        }),
      ),
    ).toThrow("Reader summary top story cites evidence outside citation map");
  });

  it("rejects reader content top reads whose provider is not backed by citations", () => {
    expect(() =>
      ReaderSummaryArtifact.create(
        baseArtifact({
          content: readerContent({
            topReads: [
              readerTopRead({
                providerKey: "github",
                providerName: "GitHub",
                confirmedProviderKeys: ["github"],
              }),
            ],
          }),
        }),
      ),
    ).toThrow(
      "Reader summary top read provider must match at least one citation",
    );
  });

  it("rejects reader content source mix providers outside selected evidence", () => {
    expect(() =>
      ReaderSummaryArtifact.create(
        baseArtifact({
          content: readerContent({
            sourceMix: [
              ...readerContent().sourceMix,
              {
                providerKey: "x-twitter",
                itemCount: 1,
                citationCount: 0,
                storyClusterCount: 0,
                crossSourceClusterCount: 0,
                singleSourceOnly: true,
                topicIds: ["topic-ai"],
              },
            ],
          }),
        }),
      ),
    ).toThrow("Reader summary source mix includes provider outside evidence");
  });

  it("rejects model citations outside selected primary evidence", () => {
    expect(() =>
      assertReaderSummaryCitationsAgainstEvidence(
        {
          citationMap: [
            {
              citationId: "citation-1",
              feedItemId: "feed-outside",
              sourceItemId: "source-outside",
              providerKey: "reddit",
              field: "title",
            },
          ],
          topStories: [],
          topicHighlights: [],
          repeatedSignals: [],
          risksAndUnknowns: [],
        },
        {
          rankingPolicyVersion: "story_ranking_v1",
          sourceWindow: {
            windowId: "window-1",
            startedAt: new Date("2026-06-23T08:00:00.000Z"),
            endedAt: new Date("2026-06-23T09:00:00.000Z"),
            selectedFeedItemIds: ["feed-1"],
            storyClusterIds: ["story:one"],
          },
          clusters: [],
          selectedEvidence: [],
        },
      ),
    ).toThrow(
      "Reader summary citation citation-1 references evidence outside selection",
    );
  });
});
