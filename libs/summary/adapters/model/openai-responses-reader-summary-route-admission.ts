import type {
  ReaderSummaryModelBudget,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelInput,
  ReaderSummaryModelPolicy,
  ReaderSummaryModelRoute,
} from "../../ports";
import { withReaderSummaryInputPromptVersion } from "./reader-summary-input-prompt-route";
import { isReaderSummaryBudgetExceeded } from "./reader-summary-token-budget";
import { currentReaderSummaryPromptRelease } from "./openai-responses-reader-summary-prompt";
import { ReaderSummaryModelProviderError } from "./openai-responses-reader-summary-transport";

const provider = "openai-responses";

/** Pure route identity and budget admission; the adapter retains metering and I/O. */
export const admitOpenAiReaderSummaryRoute = (
  input: ReaderSummaryModelInput,
  model: string,
  policy: ReaderSummaryModelPolicy,
  budget: ReaderSummaryModelBudget,
  estimate: (route: ReaderSummaryModelRoute) => ReaderSummaryModelEstimate,
): ReaderSummaryModelRoute => {
  const route = withReaderSummaryInputPromptVersion({
    provider,
    model,
    promptVersion: currentReaderSummaryPromptRelease.id,
    schemaVersion: "reader_summary.artifact.v1",
  }, input);
  if (isReaderSummaryBudgetExceeded(estimate(route), policy, budget)) {
    throw new ReaderSummaryModelProviderError({
      kind: "budget_exceeded",
      retryable: false,
      message: "Reader summary model budget exceeded",
    });
  }
  return route;
};
