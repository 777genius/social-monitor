import { withReaderSummaryInputPromptVersion } from "./reader-summary-input-prompt-route";
import {
  estimateReaderSummaryTokenUsage,
  isReaderSummaryBudgetExceeded,
} from "./reader-summary-token-budget";
import type {
  ReaderSummaryModelBudget,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelInput,
  ReaderSummaryModelPolicy,
  ReaderSummaryModelRoute,
} from "../../ports";
import type { AgentRuntimeReaderSummaryRuntimeSettings } from "./agent-runtime-reader-summary-runtime-settings";
import { AgentRuntimeModelProviderError } from "./agent-runtime-model-support";
import { currentReaderSummaryPromptRelease } from "./openai-responses-reader-summary-prompt";

/**
 * Route identity, token estimate and budget admission are a single policy
 * boundary. The transport adapter only orchestrates generation and validation.
 */
export const estimateAgentRuntimeReaderSummaryUsage = (params: {
  readonly input: ReaderSummaryModelInput;
  readonly selectedRoute: ReaderSummaryModelRoute;
  readonly settings: AgentRuntimeReaderSummaryRuntimeSettings;
}): ReaderSummaryModelEstimate => {
  void params.selectedRoute;
  return estimateReaderSummaryTokenUsage(params.input, {
    inputTokenDivisor: params.settings.inputTokenDivisor,
    maxOutputTokens: params.settings.maxOutputTokens,
  });
};

export const admitAgentRuntimeReaderSummaryRoute = (params: {
  readonly input: ReaderSummaryModelInput;
  readonly policy: ReaderSummaryModelPolicy;
  readonly budget: ReaderSummaryModelBudget;
  readonly settings: AgentRuntimeReaderSummaryRuntimeSettings;
}): ReaderSummaryModelRoute => {
  const route = withReaderSummaryInputPromptVersion({
    provider: "agent-runtime",
    model: `${params.settings.agentProvider}:${params.settings.model}:${params.settings.reasoningEffort}`,
    promptVersion: currentReaderSummaryPromptRelease.id,
    schemaVersion: "reader_summary.artifact.v1",
  }, params.input);
  const estimate = estimateAgentRuntimeReaderSummaryUsage({
    input: params.input,
    selectedRoute: route,
    settings: params.settings,
  });
  if (isReaderSummaryBudgetExceeded(estimate, params.policy, params.budget)) {
    throw new AgentRuntimeModelProviderError({
      kind: "budget_exceeded",
      retryable: false,
      message: "Reader summary model budget exceeded",
    });
  }
  return route;
};
