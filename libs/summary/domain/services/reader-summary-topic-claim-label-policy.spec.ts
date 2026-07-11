import {
  ensureTopicLabelExpressesClaimFacet,
  renderReaderSummaryTopicSemanticLabel,
} from "./reader-summary-topic-claim-label-policy";

describe("renderReaderSummaryTopicSemanticLabel", () => {
  it.each([
    [
      "GPT-5.6 Sol",
      "benchmark",
      "Artificial Analysis",
      "GPT-5.6 Sol Benchmark",
    ],
    ["Anthropic", "security", "Spying", "Anthropic Spying"],
    ["Anthropic", "limits", "Usage", "Anthropic Usage Limits"],
    ["Claude Code", "education", undefined, "Claude Code Guide"],
    ["Codex", "other", "CLI", "Codex CLI"],
  ] as const)(
    "renders %s/%s deterministically",
    (subject, claimType, qualifier, expected) => {
      expect(
        renderReaderSummaryTopicSemanticLabel({
          subject,
          claimType,
          qualifier,
          confidenceScore: 0.9,
        }),
      ).toBe(expected);
    },
  );
});

describe("ensureTopicLabelExpressesClaimFacet", () => {
  it.each([
    ["GPT-5.6 Sol", "benchmark", "GPT-5.6 Sol Benchmark"],
    ["GPT-5.6 Family", "release", "GPT-5.6 Family Rollout"],
    ["GPT-5.6 Codex CLI", "availability", "GPT-5.6 Codex CLI Availability"],
    ["Sol High", "efficiency", "Sol High Efficiency"],
  ] as const)("adds a missing claim facet to %s", (label, facet, expected) => {
    expect(ensureTopicLabelExpressesClaimFacet(label, facet)).toBe(expected);
  });

  it.each([
    ["GPT-5.6 Sol Benchmark", "benchmark"],
    ["Claude Code Course", "education"],
    ["Anthropic Usage Limits", "limits"],
    ["Anthropic Spying", "security"],
  ] as const)("keeps an explicit claim label %s", (label, facet) => {
    expect(ensureTopicLabelExpressesClaimFacet(label, facet)).toBe(label);
  });

  it("does not overwrite another explicit claim in ambiguous evidence", () => {
    expect(
      ensureTopicLabelExpressesClaimFacet("Anthropic AI Security", "education"),
    ).toBe("Anthropic AI Security");
    expect(
      ensureTopicLabelExpressesClaimFacet("Organic Maps Privacy", "release"),
    ).toBe("Organic Maps Privacy");
  });
});
