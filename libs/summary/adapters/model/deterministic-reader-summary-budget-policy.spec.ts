import type {
  ReaderSummaryModelBudget,
  ReaderSummaryModelInput,
  ReaderSummaryModelPolicy,
} from "../../ports";
import {
  assertDeterministicReaderSummaryBudget,
  estimateDeterministicReaderSummaryTokens,
} from "./deterministic-reader-summary-budget-policy";

const inputForEstimate = (
  evidence: readonly { title: string; bodyPreview?: string }[],
  context: readonly string[] = [],
): ReaderSummaryModelInput => ({
  evidence: {
    selectedEvidence: evidence.map((item, index) => ({
      ...item,
      providerKey: "rss",
      feedItemId: `synthetic-${index}`,
    })),
    clusters: [],
    sourceWindow: { selectedFeedItemIds: [], storyClusterIds: [] },
  },
  contextArtifacts: context.map((summaryText) => ({ summaryText })),
} as unknown as ReaderSummaryModelInput);

const permittedPolicy: ReaderSummaryModelPolicy = {
  preferredProvider: "deterministic-local",
  maxInputTokens: 5,
  maxOutputTokens: 260,
  maxEstimatedCostUsd: 0,
};
const permittedBudget: ReaderSummaryModelBudget = {
  remainingTokens: 265,
  remainingCostUsd: 0,
};

describe("deterministic reader summary budget boundary", () => {
  it("uses primary title and preview lengths plus context, with no provider cost", () => {
    const estimate = estimateDeterministicReaderSummaryTokens(inputForEstimate(
      [{ title: "abcd", bodyPreview: "xyz" }, { title: "12345678" }],
      ["hello"],
    ));
    expect(estimate).toEqual({
      inputTokens: 5,
      outputTokens: 260,
      estimatedCostUsd: 0,
    });
    expect(() => assertDeterministicReaderSummaryBudget(
      estimate, permittedPolicy, permittedBudget,
    )).not.toThrow();
  });

  it("keeps the 64-token no-primary-evidence reserve", () => {
    expect(estimateDeterministicReaderSummaryTokens(inputForEstimate([], ["abcd"])))
      .toEqual({ inputTokens: 1, outputTokens: 64, estimatedCostUsd: 0 });
  });

  it.each([
    ["input policy", { maxInputTokens: 4 }, {}],
    ["output policy", { maxOutputTokens: 259 }, {}],
    ["cost policy", { maxEstimatedCostUsd: -1 }, {}],
    ["remaining tokens", {}, { remainingTokens: 264 }],
    ["remaining cost", {}, { remainingCostUsd: -1 }],
  ] as const)("rejects %s overage without weakening the other gates", (_name, policy, budget) => {
    const estimate = estimateDeterministicReaderSummaryTokens(inputForEstimate(
      [{ title: "abcd", bodyPreview: "xyz" }, { title: "12345678" }],
      ["hello"],
    ));
    expect(() => assertDeterministicReaderSummaryBudget(
      estimate,
      { ...permittedPolicy, ...policy },
      { ...permittedBudget, ...budget },
    )).toThrow("Reader summary model budget exceeded");
  });
});
