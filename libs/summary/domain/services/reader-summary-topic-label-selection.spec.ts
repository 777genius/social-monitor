import { selectReaderSummaryTopicLabel } from "./reader-summary-topic-label-selection";

describe("selectReaderSummaryTopicLabel", () => {
  it("prefers a richer grounded extension over a concrete singleton", () => {
    expect(
      selectReaderSummaryTopicLabel({
        proposedLabel: "Codex",
        labelCandidates: [candidate("Codex Work Product")],
        evidenceTexts: ["Codex is core of the new work product"],
        providerLabels: ["x-twitter"],
      }),
    ).toBe("Codex Work Product");
  });

  it("keeps an evidence-aligned structured semantic label", () => {
    expect(
      selectReaderSummaryTopicLabel({
        proposedLabel: "Codex",
        preferProposedLabel: true,
        labelCandidates: [candidate("Codex Check Out")],
        evidenceTexts: ["Check this out. Codex is core of the work product."],
        providerLabels: ["x-twitter"],
      }),
    ).toBe("Codex");
  });

  it("keeps a singleton when the candidate describes another subject", () => {
    expect(
      selectReaderSummaryTopicLabel({
        proposedLabel: "Codex",
        labelCandidates: [candidate("Claude Desktop Plugins")],
        evidenceTexts: ["Codex and Claude Desktop plugins are discussed"],
        providerLabels: ["x-twitter"],
      }),
    ).toBe("Codex");
  });

  it("removes a repository owner from a grounded singleton extension", () => {
    expect(
      selectReaderSummaryTopicLabel({
        proposedLabel: "Codex",
        labelCandidates: [candidate("openai/codex Agent Workflows")],
        evidenceTexts: ["openai/codex agent workflows"],
        providerLabels: ["github-trending-page"],
      }),
    ).toBe("Codex Agent Workflows");
  });

  it("skips a headline-fragment candidate for a grounded noun phrase", () => {
    expect(
      selectReaderSummaryTopicLabel({
        proposedLabel: "Love LLMs Hate",
        preferProposedLabel: true,
        labelCandidates: [candidate("Love LLMs Hate"), candidate("LLM Hype")],
        evidenceTexts: ["I love LLMs but hate the hype"],
        providerLabels: ["hacker-news"],
      }),
    ).toBe("LLM Hype");
  });
});

const candidate = (label: string) => ({
  label,
  source: "evidence-title" as const,
  score: 0.9,
  evidenceFeedItemIds: ["feed:1"],
  rationale: "Grounded fixture",
});
