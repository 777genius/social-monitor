import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import type { ReaderSummaryModelInput } from "../../ports";
import { DeterministicReaderSummaryModelAdapter } from "./deterministic-reader-summary-model.adapter";

describe("DeterministicReaderSummaryModelAdapter", () => {
  it("keeps first-page stories and citations provider-diverse", async () => {
    const adapter = new DeterministicReaderSummaryModelAdapter();
    const input = readerSummaryInput();
    const route = adapter.route(
      input,
      {
        preferredProvider: "deterministic-local",
        maxInputTokens: 24_000,
        maxOutputTokens: 2_500,
        maxEstimatedCostUsd: 1,
      },
      {
        remainingTokens: 32_000,
        remainingCostUsd: 2,
      },
    );

    const attempt = await adapter.generate(input, route);
    const citationProviders = attempt.draft.citationMap.map(
      (citation) => citation.providerKey,
    );

    expect(citationProviders).toContain("github-issues");
    expect(
      attempt.draft.topStories.some((story) =>
        story.providerKeys.includes("github-issues"),
      ),
    ).toBe(true);
    expect(attempt.draft.content).toBeDefined();
    expect(attempt.draft.headline).toBe(
      "Workspace briefing: 10 stories across 5 sources (RSS, GitHub Trending, Hacker News + 2 more)",
    );
    expect(attempt.draft.content?.headline).toBe(attempt.draft.headline);
    expect(attempt.draft.headline).not.toBe("rss story 1");
    expect(
      attempt.draft.content?.topReads.map((item) => item.providerKey),
    ).toContain("github-issues");
    expect(attempt.draft.executiveSummary).toContain(
      "Current executive summary covers 12 selected stories for workspace in an analytical tone.",
    );
    expect(attempt.draft.executiveSummary).not.toContain("story/stories");
    expect(attempt.draft.content?.bullets.join(" ")).not.toContain("Top links");
  });
});

const readerSummaryInput = (): ReaderSummaryModelInput => {
  const selectedEvidence = [
    evidenceItem("rss", 1, 1.5),
    evidenceItem("rss", 2, 1.5),
    evidenceItem("github-trending-page", 3, 1.5),
    evidenceItem("github-trending-page", 4, 1.5),
    evidenceItem("github-trending-page", 5, 1.5),
    evidenceItem("rss", 6, 1.497),
    evidenceItem("rss", 7, 1.495),
    evidenceItem("hacker-news", 8, 1.488),
    evidenceItem("reddit", 9, 1.437),
    evidenceItem("hacker-news", 10, 1.238),
    evidenceItem("reddit", 11, 1),
    evidenceItem("github-issues", 12, 1),
  ];
  const clusters = selectedEvidence.map((item) => ({
    id: `story:${item.feedItemId}`,
    storyKey: `story-key:${item.feedItemId}`,
    representativeFeedItemId: item.feedItemId,
    duplicateFeedItemIds: [],
    topicIds: [item.topicId],
    providerKeys: [item.providerKey],
    score: item.score,
    observedAtRange: {
      startedAt: item.observedAt,
      endedAt: new Date(item.observedAt.getTime() + 1),
    },
    whyImportant: item.whyImportant,
  }));

  return {
    tenantId: tenantId("tenant-deterministic-reader-summary-adapter"),
    workspaceId: workspaceId("workspace-deterministic-reader-summary-adapter"),
    scope: { type: "workspace" },
    evidence: {
      rankingPolicyVersion: "story_ranking_v1",
      sourceWindow: {
        windowId: "workspace:deterministic-reader-summary",
        startedAt:
          selectedEvidence[0]?.observedAt ??
          new Date("2026-06-23T08:00:00.000Z"),
        endedAt:
          selectedEvidence.at(-1)?.observedAt ??
          new Date("2026-06-23T08:30:00.000Z"),
        selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
        storyClusterIds: clusters.map((cluster) => cluster.id),
      },
      clusters,
      selectedEvidence,
    },
    contextArtifacts: [],
    policy: {
      language: "auto",
      format: "executive_brief",
      tone: "analytical",
      maxStories: 10,
      includeRisks: true,
      includeTopicHighlights: true,
      includeRepeatedSignals: true,
      dedupeStrategy: "canonical_url_then_title",
      rulesVersion: "reader_summary.rules.test.v1",
    },
    requestedAt: new Date("2026-06-23T08:31:00.000Z"),
  };
};

const evidenceItem = (
  providerKey: string,
  index: number,
  score: number,
): ReaderSummaryModelInput["evidence"]["selectedEvidence"][number] => ({
  feedItemId: `feed-${index}`,
  sourceItemId: `source-${index}`,
  sourceBindingId: `binding-${providerKey}`,
  topicId: `topic-${index % 2}`,
  providerKey,
  canonicalUrl: `https://example.test/${providerKey}/${index}`,
  title: `${providerKey} story ${index}`,
  bodyPreview: "Useful source evidence for a workspace summary.",
  publishedAt: new Date(
    `2026-06-23T08:${String(index).padStart(2, "0")}:00.000Z`,
  ),
  observedAt: new Date(
    `2026-06-23T08:${String(index).padStart(2, "0")}:30.000Z`,
  ),
  score,
  whyImportant: ["Fresh item in the current monitoring window"],
});
