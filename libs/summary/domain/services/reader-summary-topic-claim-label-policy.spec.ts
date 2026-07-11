import { ensureTopicLabelExpressesClaimFacet } from "./reader-summary-topic-claim-label-policy";

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
