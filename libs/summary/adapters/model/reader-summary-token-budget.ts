import { primaryReaderSummaryEvidence } from "../../domain";
import type {
  ReaderSummaryModelBudget,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelInput,
  ReaderSummaryModelPolicy,
} from "../../ports";
import { buildOpenAiReaderSummaryPromptPayload } from "./openai-responses-reader-summary-prompt";
import { exceedsSummaryModelBudget } from "./summary-model-budget-admission";

/** Token budget shared by the two reader-summary provider implementations. */
export type ReaderSummaryTokenEstimateSettings = {
  readonly inputTokenDivisor: number;
  readonly maxOutputTokens: number;
  /** Omitted for the subscription-based Agent Runtime provider. */
  readonly pricing?: {
    readonly inputPerMillionUsd: number;
    readonly outputPerMillionUsd: number;
  };
};

export const estimateReaderSummaryTokenUsage = (
  input: ReaderSummaryModelInput,
  settings: ReaderSummaryTokenEstimateSettings,
): ReaderSummaryModelEstimate => {
  const inputTokens = Math.ceil(
    buildOpenAiReaderSummaryPromptPayload(input).length /
      settings.inputTokenDivisor,
  );
  const outputTokens =
    primaryReaderSummaryEvidence(input.evidence).selectedEvidence.length === 0
      ? 128
      : Math.min(
          settings.maxOutputTokens,
          Math.max(768, input.policy.maxStories * 320),
        );

  const estimatedCostUsd = settings.pricing === undefined
    ? 0
    : (inputTokens * settings.pricing.inputPerMillionUsd +
        outputTokens * settings.pricing.outputPerMillionUsd) /
      1_000_000;

  return { inputTokens, outputTokens, estimatedCostUsd };
};

export const isReaderSummaryBudgetExceeded = (
  estimate: ReaderSummaryModelEstimate,
  policy: ReaderSummaryModelPolicy,
  budget: ReaderSummaryModelBudget,
): boolean => exceedsSummaryModelBudget(estimate, policy, budget);
