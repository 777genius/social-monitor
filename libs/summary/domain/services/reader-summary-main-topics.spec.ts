import { buildReaderSummaryMainTopics } from "./reader-summary-main-topics";
import type { TopRead, TopReadCandidate } from "../entities/top-read";
import type { SummaryEvidenceItem } from "../value-objects/summary-evidence-item";

describe("buildReaderSummaryMainTopics", () => {
  it("prioritizes topics named in the reader summary over unrelated top reads", () => {
    const topics = buildReaderSummaryMainTopics({
      headline: "OpenAI GPT-5.6 and ChatGPT Work lead AI agent discussion",
      executiveSummary:
        "OpenAI is rolling out GPT-5.6 and ChatGPT Work for longer-running Codex workflows.",
      topReads: [
        topRead("Fable 5 users discuss usage limits"),
        topRead("Claude Code adds another MCP workflow"),
      ],
      topStories: [],
      interestHighlights: [],
      repeatedSignals: [],
    });

    expect(topics).toEqual([
      "OpenAI",
      "GPT-5.6",
      "ChatGPT Work",
      "AI agents",
      "Codex",
    ]);
  });

  it("keeps reader topics as compact product tags instead of generic prose", () => {
    const topics = buildReaderSummaryMainTopics({
      topReads: [
        topRead(
          "A reported issue says Claude Code may leak session/cache data",
          "Reddit discusses an alleged Alibaba Claude Code ban",
        ),
        topRead(
          "X posts describe OpenWiki and repo-context tooling for agents",
        ),
        topRead("A GitHub issue reports Claude behavior changes"),
      ],
      topStories: [
        story("Reddit discusses an alleged Alibaba Claude Code ban"),
        story("X posts describe OpenWiki and repo-context tooling"),
        story("HN and RSS both surface MCP prompt extraction risk"),
      ],
      interestHighlights: [],
      repeatedSignals: [],
      selectedEvidence: [
        evidence("MCP server security risks reach developer teams"),
        evidence("OpenAI Codex usage reports keep surfacing"),
        evidence("Better models may be worse tools"),
      ],
    });

    expect(topics).toEqual([
      "Claude Code",
      "OpenWiki",
      "prompt extraction",
      "MCP",
      "Codex",
      "AI tool quality",
    ]);
  });
});

const topRead = (title: string, ...whyImportant: readonly string[]): TopRead =>
  ({
    title,
    providerKey: "reddit",
    providerName: "Reddit",
    primaryActionKind: "read_source",
    reason: title,
    matchedInterestIds: [],
    matchedRules: [],
    signalScore: 2.4,
    confidence: {
      level: "medium",
      score: 0.7,
      rationale: "Test confidence.",
    },
    confirmedProviderKeys: [],
    providerMetrics: [],
    whyImportant,
    whyNow: "fresh",
    citationIds: [],
  }) satisfies TopRead;

const story = (title: string): TopReadCandidate => ({
  storyClusterId: `story:${title}`,
  title,
  summary: title,
  interestIds: [],
  providerKeys: ["reddit"],
  citationIds: [],
});

const evidence = (title: string): SummaryEvidenceItem =>
  ({
    feedItemId: `feed:${title}`,
    sourceItemId: `source:${title}`,
    sourceBindingId: "source-binding",
    interestId: "interest-ai",
    providerKey: "rss",
    canonicalUrl: "https://example.test/item",
    title,
    publishedAt: new Date("2026-07-04T00:00:00.000Z"),
    observedAt: new Date("2026-07-04T00:00:00.000Z"),
    score: 1,
    whyImportant: [],
  }) satisfies SummaryEvidenceItem;
