import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { ReaderSummaryArtifact } from "../../domain";
import { presentReaderSummaryArtifact } from "../../features/shared/reader-summary-artifact-presenter";
import { briefingArtifactViewFromReaderSummaryView } from "./briefing-legacy.mapper";

describe("briefingArtifactViewFromReaderSummaryView", () => {
  it("preserves canonical URLs for UI citation links", () => {
    const artifact = ReaderSummaryArtifact.create({
      schemaVersion: "reader_summary.artifact.v1",
      readerSummaryId: "briefing-1",
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      scope: { type: "workspace" },
      sourceWindow: {
        windowId: "window-1",
        startedAt: new Date("2026-06-06T00:00:00.000Z"),
        endedAt: new Date("2026-06-06T00:01:00.000Z"),
        selectedFeedItemIds: ["feed-1"],
        storyClusterIds: ["cluster-1"],
      },
      storyClusters: [
        {
          id: "cluster-1",
          storyKey: "url:github.com/openai/codex",
          representativeFeedItemId: "feed-1",
          duplicateFeedItemIds: [],
          topicIds: ["ai-tools"],
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
      headline: "Repo radar briefing",
      executiveSummary: "OpenAI Codex is the strongest repository signal.",
      topStories: [
        {
          storyClusterId: "cluster-1",
          title: "openai/codex leads repo radar",
          summary: "The repository gained attention in the selected window.",
          topicIds: ["ai-tools"],
          providerKeys: ["github-repo-radar"],
          citationIds: ["citation-1"],
        },
      ],
      topicHighlights: [],
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
    const readerSummaryView = presentReaderSummaryArtifact(artifact, {
      status: "fresh",
      checkedAt: new Date("2026-06-06T00:05:00.000Z"),
    });

    expect(
      briefingArtifactViewFromReaderSummaryView(readerSummaryView),
    ).toMatchObject({
      schemaVersion: "briefing.artifact.v1",
      briefingId: "briefing-1",
      citations: [
        {
          citationId: "citation-1",
          label: "[1]",
          providerKey: "github-repo-radar",
          canonicalUrl: "https://github.com/openai/codex",
        },
      ],
    });
  });
});
