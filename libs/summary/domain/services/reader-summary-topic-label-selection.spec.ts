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
});

const candidate = (label: string) => ({
  label,
  source: "evidence-title" as const,
  score: 0.9,
  evidenceFeedItemIds: ["feed:1"],
  rationale: "Grounded fixture",
});
