import {
  tenantId,
  workspaceId,
  type Clock,
} from "@social-monitor/shared-kernel";

import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";
import { StoryClusteringService } from "./story-clustering.service";

const clock: Clock = {
  now: () => new Date("2026-07-09T23:00:00.000Z"),
};

const evidenceItem = (
  overrides: Partial<SummaryEvidenceItem>,
): SummaryEvidenceItem => ({
  feedItemId: "feed-1",
  sourceItemId: "source-1",
  sourceBindingId: "binding-1",
  interestId: "interest-ai",
  providerKey: "reddit",
  canonicalUrl: "https://example.test/story",
  title: "AI model update",
  bodyPreview: "AI model coverage.",
  publishedAt: new Date("2026-07-09T18:00:00.000Z"),
  observedAt: new Date("2026-07-09T18:05:00.000Z"),
  score: 1.5,
  whyImportant: ["Fresh item in the current monitoring window"],
  ...overrides,
});

const clusterCount = (items: readonly SummaryEvidenceItem[]): number =>
  new StoryClusteringService(clock).cluster({
    identity: {
      tenantId: tenantId("tenant-1"),
      workspaceId: workspaceId("workspace-1"),
      scope: { type: "workspace" },
    },
    limit: 10,
    items,
  }).clusters.length;

describe("StoryClusteringService claim facets", () => {
  it("keeps different benchmark claims around the same model separate", () => {
    expect(
      clusterCount([
        evidenceItem({
          feedItemId: "x-agents-last-exam",
          sourceItemId: "x-agents-last-exam",
          providerKey: "x-twitter",
          canonicalUrl: "https://x.com/example/status/agents-last-exam",
          title: "GPT-5.6 leads OpenAI models on Agents' Last Exam",
          bodyPreview:
            "Agents' Last Exam measures long-horizon agent performance.",
        }),
        evidenceItem({
          feedItemId: "rss-artificial-analysis",
          sourceItemId: "rss-artificial-analysis",
          providerKey: "rss",
          canonicalUrl: "https://example.test/artificial-analysis-index",
          title: "GPT-5.6 tops the Artificial Analysis Intelligence Index",
          bodyPreview:
            "Artificial Analysis compares model intelligence and efficiency.",
        }),
      ]),
    ).toBe(2);
  });

  it("keeps a named benchmark separate from product-cost chatter", () => {
    expect(
      clusterCount([
        evidenceItem({
          feedItemId: "x-artificial-analysis",
          sourceItemId: "x-artificial-analysis",
          providerKey: "x-twitter",
          canonicalUrl: "https://x.com/example/status/artificial-analysis",
          title: "Artificial Analysis compares GPT-5.6 with Claude",
          bodyPreview: "The benchmark compares coding and agent performance.",
        }),
        evidenceItem({
          feedItemId: "reddit-fable-cost",
          sourceItemId: "reddit-fable-cost",
          providerKey: "reddit",
          canonicalUrl: "https://reddit.com/r/ClaudeAI/fable-cost",
          title: "Fable 5 and Bun reduce the cost of local coding workflows",
          bodyPreview: "Users compare Fable pricing with Bun workflows.",
        }),
      ]),
    ).toBe(2);
  });

  it("keeps ChatGPT Work coverage separate from a Codex CLI claim", () => {
    expect(
      clusterCount([
        evidenceItem({
          feedItemId: "x-chatgpt-work",
          sourceItemId: "x-chatgpt-work",
          providerKey: "x-twitter",
          canonicalUrl: "https://x.com/OpenAI/status/chatgpt-work",
          title: "OpenAI introduces ChatGPT Work for long-running tasks",
          bodyPreview: "ChatGPT Work combines ChatGPT and Codex workflows.",
        }),
        evidenceItem({
          feedItemId: "reddit-codex-cli",
          sourceItemId: "reddit-codex-cli",
          providerKey: "reddit",
          canonicalUrl: "https://reddit.com/r/OpenAI/codex-cli",
          title: "GPT-5.6 changes the Codex CLI workflow",
          bodyPreview: "Users compare Codex command-line behavior.",
        }),
      ]),
    ).toBe(2);
  });
});
