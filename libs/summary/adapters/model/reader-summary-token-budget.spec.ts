import type {
  ReaderSummaryModelBudget,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelPolicy,
} from "../../ports";
import { readerSummaryInput } from "./agent-runtime-reader-summary-model.spec-support";
import {
  estimateReaderSummaryTokenUsage,
  isReaderSummaryBudgetExceeded,
} from "./reader-summary-token-budget";

describe("Reader-summary provider-neutral token admission", () => {
  it("preserves free versus priced execution at identical token counts", () => {
    const input = readerSummaryInput();
    const settings = { inputTokenDivisor: 4, maxOutputTokens: 16_000 };
    const free = estimateReaderSummaryTokenUsage(input, settings);
    const paid = estimateReaderSummaryTokenUsage(input, {
      ...settings,
      pricing: { inputPerMillionUsd: 1, outputPerMillionUsd: 2 },
    });
    expect(free.inputTokens).toBe(paid.inputTokens);
    expect(free.outputTokens).toBe(3_200);
    expect(free.estimatedCostUsd).toBe(0);
    expect(paid.estimatedCostUsd).toBe(
      (paid.inputTokens + 2 * paid.outputTokens) / 1_000_000,
    );
  });

  it("retains the no-signal token floor even when output cap is smaller", () => {
    const input = readerSummaryInput();
    const noSignal = {
      ...input,
      evidence: { ...input.evidence, selectedEvidence: [] },
    };
    expect(estimateReaderSummaryTokenUsage(noSignal, {
      inputTokenDivisor: 4,
      maxOutputTokens: 32,
    }).outputTokens).toBe(128);
  });

  it("denies any individual limit and accepts exact boundaries", () => {
    const estimate: ReaderSummaryModelEstimate = {
      inputTokens: 110, outputTokens: 40, estimatedCostUsd: 0.002,
    };
    const policy: ReaderSummaryModelPolicy = {
      preferredProvider: "agent-runtime",
      maxInputTokens: 110, maxOutputTokens: 40, maxEstimatedCostUsd: 0.002,
    };
    const budget: ReaderSummaryModelBudget = {
      remainingTokens: 150, remainingCostUsd: 0.002,
    };
    expect(isReaderSummaryBudgetExceeded(estimate, policy, budget)).toBe(false);
    expect(isReaderSummaryBudgetExceeded({ ...estimate, inputTokens: 111 }, policy, budget)).toBe(true);
    expect(isReaderSummaryBudgetExceeded({ ...estimate, outputTokens: 41 }, policy, budget)).toBe(true);
    expect(isReaderSummaryBudgetExceeded({ ...estimate, estimatedCostUsd: 0.003 }, policy, budget)).toBe(true);
    expect(isReaderSummaryBudgetExceeded(estimate, policy, { ...budget, remainingTokens: 149 })).toBe(true);
    expect(isReaderSummaryBudgetExceeded(estimate, policy, { ...budget, remainingCostUsd: 0.001 })).toBe(true);
  });
});
