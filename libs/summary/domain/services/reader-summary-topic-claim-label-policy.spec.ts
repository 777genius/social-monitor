import {
  alignReaderSummaryTopicSemanticLabelToEvidence,
  ensureTopicLabelExpressesClaimFacet,
  renderReaderSummaryTopicSemanticLabel,
} from "./reader-summary-topic-claim-label-policy";

describe("alignReaderSummaryTopicSemanticLabelToEvidence", () => {
  it("removes a relational role and demotes an unsupported claim facet", () => {
    expect(
      alignReaderSummaryTopicSemanticLabelToEvidence({
        semantic: {
          subject: "Codex core",
          claimType: "availability",
          confidenceScore: 0.9,
        },
        primaryFacet: undefined,
        evidenceTexts: [
          "Codex is the core of our new work product and is not going anywhere.",
        ],
      }),
    ).toEqual({
      subject: "Codex",
      claimType: "other",
      confidenceScore: 0.9,
    });
  });

  it("preserves a proper name without evidence of a relational role", () => {
    expect(
      alignReaderSummaryTopicSemanticLabelToEvidence({
        semantic: {
          subject: "Bitcoin Core",
          claimType: "other",
          confidenceScore: 0.9,
        },
        primaryFacet: undefined,
        evidenceTexts: ["Bitcoin Core 31.0 has been released."],
      }).subject,
    ).toBe("Bitcoin Core");
  });

  it("promotes an uncertain claim when evidence has a concrete facet", () => {
    expect(
      alignReaderSummaryTopicSemanticLabelToEvidence({
        semantic: {
          subject: "ChatGPT",
          claimType: "other",
          confidenceScore: 0.7,
        },
        primaryFacet: "comparison",
        evidenceTexts: ["ChatGPT v. ChatGPT Work v. Claude"],
      }).claimType,
    ).toBe("comparison");
  });
});

describe("renderReaderSummaryTopicSemanticLabel", () => {
  it.each([
    [
      "GPT-5.6 Sol",
      "benchmark",
      "Artificial Analysis",
      "GPT-5.6 Sol Benchmark",
    ],
    ["Anthropic", "security", "Spying", "Anthropic Spying"],
    ["Anthropic", "allegation", "Spying", "Anthropic Spying Allegation"],
    ["Enterprise AI Bills", "costs", undefined, "Enterprise AI Bills"],
    ["Enterprise AI", "costs", "Spending", "Enterprise AI Spending"],
    ["GPT-5 Models", "comparison", undefined, "GPT-5 Models Comparison"],
    ["Anthropic", "limits", "Usage", "Anthropic Usage Limits"],
    ["Claude Code", "education", undefined, "Claude Code Guide"],
    ["Codex", "other", "CLI", "Codex CLI"],
    ["ChatGPT", "other", "Confused", "ChatGPT"],
    ["Coding Train", "other", "public", "Coding Train"],
    ["AI Content", "other", "social", "AI Content"],
    ["AtCoder", "other", "World Tour", "AtCoder World Tour"],
    ["GPT-5.6 Sol", "benchmark", "Index", "GPT-5.6 Sol Benchmark"],
    ["ChatGPT", "comparison", "Confused", "ChatGPT Comparison"],
    ["ChatGPT Work", "release", "Rebranded", "ChatGPT Work Rollout"],
    ["Anthropic", "limits", "Hour Weekly", "Anthropic Limits"],
    ["Anthropic Hour Weekly", "limits", undefined, "Anthropic Limits"],
    ["Grok 4.5", "review", undefined, "Grok 4.5 Review"],
    ["OpenAI Apple lawsuit", "allegation", undefined, "OpenAI Apple lawsuit"],
    [
      "Apple OpenAI civil suit",
      "allegation",
      undefined,
      "Apple OpenAI civil suit",
    ],
    [
      "OpenAI trade-secret case",
      "allegation",
      undefined,
      "OpenAI trade-secret case",
    ],
    ["Grok 4.5", "benchmark", "top", "Grok 4.5 Benchmark"],
    ["Grok 4.5", "benchmark", "best", "Grok 4.5 Benchmark"],
    ["Grok 4.5", "benchmark", "latest", "Grok 4.5 Benchmark"],
    ["GPT 5.6", "other", "Migrating Production AI", "GPT 5.6"],
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

  it("keeps the final reader-facing label within four words", () => {
    expect(
      ensureTopicLabelExpressesClaimFacet(
        "GPT 5.6 Production AI",
        "efficiency",
      ),
    ).toBe("GPT 5.6 Production Efficiency");
  });

  it("does not mistake a technical use case for a legal allegation", () => {
    expect(
      ensureTopicLabelExpressesClaimFacet("Codex Use Case", "release"),
    ).toBe("Codex Use Case Rollout");
  });

  it.each([
    ["GPT-5.6 Sol Benchmark", "benchmark", "GPT-5.6 Sol Benchmark"],
    ["Claude Code Course", "education", "Claude Code Course"],
    ["Anthropic Usage Limits", "limits", "Anthropic Usage Limits"],
    ["Anthropic Spying", "security", "Anthropic Spying"],
    ["Anthropic Hour Weekly Limits", "limits", "Anthropic Limits"],
  ] as const)(
    "normalizes an explicit claim label %s",
    (label, facet, expected) => {
      expect(ensureTopicLabelExpressesClaimFacet(label, facet)).toBe(expected);
    },
  );

  it("does not overwrite another explicit claim in ambiguous evidence", () => {
    expect(
      ensureTopicLabelExpressesClaimFacet("Anthropic AI Security", "education"),
    ).toBe("Anthropic AI Security");
    expect(
      ensureTopicLabelExpressesClaimFacet("Organic Maps Privacy", "release"),
    ).toBe("Organic Maps Privacy");
  });
});
