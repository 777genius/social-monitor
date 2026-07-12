import { tenantId, workspaceId } from "@social-monitor/shared-kernel";

import { buildReaderSummaryCoveragePlan } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import {
  buildOpenAiReaderSummaryInstructions,
  buildOpenAiReaderSummaryPromptPayload,
} from "./openai-responses-reader-summary-prompt";
import { openAiReaderSummaryJsonSchema } from "./openai-responses-reader-summary-schema";

describe("OpenAI reader summary prompt contract", () => {
  it("requests detailed candidate descriptions for the final top-eight ranking", () => {
    const instructions = buildOpenAiReaderSummaryInstructions({
      policy: {
        language: "auto",
        format: "executive_brief",
        tone: "analytical",
        includeRisks: true,
        includeInterestHighlights: true,
        includeRepeatedSignals: true,
        maxStories: 15,
        rulesVersion: "reader_summary.rules.policy.v1",
      },
    } as ReaderSummaryModelInput);

    expect(instructions).toContain(
      "each topStories summary 420-650 characters",
    );
    expect(instructions).toContain(
      "Keep source validation out of topStories summary prose",
    );
    expect(instructions).toContain(
      "internal workflow language such as source item",
    );
    expect(instructions).toContain("return 12-15 topStories");
  });

  it("allows fifteen candidates and descriptions up to 720 characters", () => {
    expect(openAiReaderSummaryJsonSchema.properties.topStories.maxItems).toBe(
      15,
    );
    expect(openAiReaderSummaryJsonSchema.$defs.topStory).toMatchObject({
      properties: {
        summary: { maxLength: 720 },
      },
    });
  });

  it("requires every structured narrative section to cite evidence", () => {
    expect(openAiReaderSummaryJsonSchema.$defs.narrativeSection).toMatchObject({
      properties: {
        citationIds: { minItems: 1, maxItems: 3 },
      },
    });
  });

  it("does not expose GitHub Trending evidence or coverage to the model", () => {
    const input = promptInputWithGitHubTrending();
    const payload = buildOpenAiReaderSummaryPromptPayload(input);

    expect(payload).not.toContain("github-trending-page");
    expect(payload).not.toContain("owner/private-prompt-influence");
    expect(payload).toContain("reddit-main-signal");
  });
});

const promptInputWithGitHubTrending = (): ReaderSummaryModelInput => {
  const selectedEvidence = [
    promptEvidence("github-trending-page", "owner/private-prompt-influence", 2),
    promptEvidence("reddit", "reddit-main-signal", 1),
  ];
  const clusters = selectedEvidence.map((item) => ({
    id: `cluster-${item.feedItemId}`,
    storyKey: `story-${item.feedItemId}`,
    representativeFeedItemId: item.feedItemId,
    duplicateFeedItemIds: [],
    interestIds: [item.interestId],
    providerKeys: [item.providerKey],
    score: item.score,
    observedAtRange: { startedAt: item.observedAt, endedAt: item.observedAt },
    whyImportant: item.whyImportant,
  }));
  const evidence = {
    rankingPolicyVersion: "story_ranking_test",
    sourceWindow: {
      windowId: "window-test",
      startedAt: new Date("2026-07-10T00:00:00.000Z"),
      endedAt: new Date("2026-07-11T00:00:00.000Z"),
      selectedFeedItemIds: selectedEvidence.map((item) => item.feedItemId),
      storyClusterIds: clusters.map((cluster) => cluster.id),
    },
    clusters,
    selectedEvidence,
  };

  return {
    tenantId: tenantId("tenant-prompt"),
    workspaceId: workspaceId("workspace-prompt"),
    scope: { type: "workspace" },
    period: {
      cadence: "daily",
      startedAt: new Date("2026-07-10T00:00:00.000Z"),
      endedAt: new Date("2026-07-11T00:00:00.000Z"),
      timezone: "UTC",
      periodKey: "daily:2026-07-10:UTC",
    },
    evidence,
    coveragePlan: buildReaderSummaryCoveragePlan(evidence),
    contextArtifacts: [],
    policy: {
      language: "auto",
      format: "executive_brief",
      tone: "analytical",
      maxStories: 10,
      includeRisks: true,
      includeInterestHighlights: true,
      includeRepeatedSignals: true,
      dedupeStrategy: "canonical_url_then_title",
      rulesVersion: "reader_summary.rules.test",
    },
    requestedAt: new Date("2026-07-11T00:00:01.000Z"),
  };
};

const promptEvidence = (
  providerKey: string,
  title: string,
  index: number,
): ReaderSummaryModelInput["evidence"]["selectedEvidence"][number] => ({
  feedItemId: `feed-${index}`,
  sourceItemId: `source-${index}`,
  sourceBindingId: `binding-${providerKey}`,
  interestId: "interest-ai",
  providerKey,
  canonicalUrl: `https://example.test/${index}`,
  title,
  bodyPreview: `${title} body`,
  publishedAt: new Date("2026-07-10T12:00:00.000Z"),
  observedAt: new Date("2026-07-10T12:01:00.000Z"),
  score: 2,
  whyImportant: [title],
});
