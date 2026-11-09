import type { GeneratedSummaryDraft, SummaryModelEstimate } from "../../ports";
import { asRecord, optionalNonNegativeInteger } from "./openai-responses-summary-json";

export const resolveOpenAiSummaryUsage = (
  responseJson: Record<string, unknown>,
  estimate: SummaryModelEstimate,
): GeneratedSummaryDraft['usage'] => {
  const usage = asRecord(responseJson.usage);

  if (usage === null) {
    return estimate;
  }

  return {
    inputTokens:
      optionalNonNegativeInteger(usage.input_tokens) ?? estimate.inputTokens,
    outputTokens:
      optionalNonNegativeInteger(usage.output_tokens) ?? estimate.outputTokens,
    estimatedCostUsd: estimate.estimatedCostUsd,
  };
};
