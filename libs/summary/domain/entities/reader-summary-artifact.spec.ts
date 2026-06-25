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
