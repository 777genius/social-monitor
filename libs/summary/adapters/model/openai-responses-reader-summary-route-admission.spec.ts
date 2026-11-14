import type {
  ReaderSummaryModelBudget,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelInput,
  ReaderSummaryModelPolicy,
  ReaderSummaryModelRoute,
} from "../../ports";
import { currentReaderSummaryPromptRelease } from "./openai-responses-reader-summary-prompt";
import { admitOpenAiReaderSummaryRoute } from "./openai-responses-reader-summary-route-admission";
import { ReaderSummaryModelProviderError } from "./openai-responses-reader-summary-transport";

const legacyInput = { evidence: { dailyGenerationInput: undefined } } as ReaderSummaryModelInput;
const policy = {
  maxInputTokens: 500, maxOutputTokens: 500, maxEstimatedCostUsd: 1,
} as ReaderSummaryModelPolicy;
const budget = { remainingTokens: 500, remainingCostUsd: 1 } as ReaderSummaryModelBudget;
const usage = { inputTokens: 100, outputTokens: 200, estimatedCostUsd: 0.25 };

const routeWith = (
  input: ReaderSummaryModelInput,
  current: ReaderSummaryModelEstimate = usage,
  onEstimate?: (route: ReaderSummaryModelRoute) => void,
) => admitOpenAiReaderSummaryRoute(input, "gpt-5.4-mini", policy, budget, (route) => {
  onEstimate?.(route);
  return current;
});

describe("OpenAI reader summary route admission", () => {
  it("keeps the exact provider/model/schema and compiled prompt identity", () => {
    let selected: ReaderSummaryModelRoute | undefined;
    const route = routeWith(legacyInput, usage, (value) => { selected = value; });
    expect(route).toEqual({
      provider: "openai-responses",
      model: "gpt-5.4-mini",
      promptVersion: currentReaderSummaryPromptRelease.id,
      schemaVersion: "reader_summary.artifact.v1",
    });
    expect(selected).toEqual(route);
  });

  it("preserves daily digest and editorial prompt precedence without a provider call", () => {
    const daily = { evidence: { dailyGenerationInput: {} } } as ReaderSummaryModelInput;
    const editorial = {
      evidence: { dailyGenerationInput: {} }, dailyEditorialPlan: {},
    } as ReaderSummaryModelInput;
    expect(routeWith(daily).promptVersion)
      .toBe("reader_summary.prompt.2026-11-03.daily_likes_digest");
    expect(routeWith(editorial).promptVersion)
      .toBe("reader_summary.prompt.2026-11-03.daily_editorial_v1");
  });

  it.each([
    ["input cap", { inputTokens: 501, outputTokens: 10, estimatedCostUsd: 0.01 }],
    ["output cap", { inputTokens: 10, outputTokens: 501, estimatedCostUsd: 0.01 }],
    ["policy cost", { inputTokens: 10, outputTokens: 10, estimatedCostUsd: 1.01 }],
    ["remaining tokens", { inputTokens: 300, outputTokens: 201, estimatedCostUsd: 0.01 }],
    ["remaining cost", { inputTokens: 10, outputTokens: 10, estimatedCostUsd: 1.01 }],
  ])("rejects %s before returning a route", (_name, estimate) => {
    try {
      routeWith(legacyInput, estimate);
      throw new Error("budget must reject");
    } catch (error) {
      expect(error).toBeInstanceOf(ReaderSummaryModelProviderError);
      expect((error as ReaderSummaryModelProviderError).failure).toEqual({
        kind: "budget_exceeded",
        retryable: false,
        message: "Reader summary model budget exceeded",
      });
    }
  });

  it("allows exact equality at all existing admission thresholds", () => {
    expect(routeWith(legacyInput, {
      inputTokens: 250, outputTokens: 250, estimatedCostUsd: 1,
    }).provider).toBe("openai-responses");
  });
});
