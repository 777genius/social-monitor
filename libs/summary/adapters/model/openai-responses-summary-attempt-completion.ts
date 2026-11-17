import type {
  ProviderSummaryAttempt,
  SummaryModelEstimate,
  SummaryModelInput,
  SummaryModelRoute,
} from "../../ports";
import { normalizeOpenAiSummaryDraft } from "./openai-responses-summary-draft-normalizer";
import { SummaryModelProviderError } from "./openai-responses-summary-model-error";
import { extractOpenAiSummaryOutputText } from "./openai-responses-summary-output-text";
import { parseOpenAiSummaryJsonObject } from "./openai-responses-summary-response-parser";
import { resolveOpenAiSummaryUsage } from "./openai-responses-summary-usage";
import { openAiResponsesCompletionIssue } from "./openai-responses-completion-state";

// Provider-output trust and draft completion belong to the paid-attempt interpreter.
// Post-normalization port validation remains separately owned by response-policy.ts.
/** Interprets untrusted provider output only after transport succeeds. */
export const completeOpenAiSummaryAttempt = (params: {
  readonly responseJson: Record<string, unknown>;
  readonly input: SummaryModelInput;
  readonly selectedRoute: SummaryModelRoute;
  readonly estimateUsage: () => SummaryModelEstimate;
  readonly evalDatasetVersion: string;
}): ProviderSummaryAttempt => {
  // HTTP 200 can still carry an incomplete/failed Responses execution.
  // A parseable partial JSON object must never become a published summary.
  const stateIssue = openAiResponsesCompletionIssue(params.responseJson);
  if (stateIssue !== null) {
    throw new SummaryModelProviderError({
      kind: stateIssue === "refusal" ? "unsafe_or_refused" : "invalid_schema",
      retryable: false,
      message: stateIssue === "error"
        ? "OpenAI summary response reported an error"
        : stateIssue === "refusal"
          ? "OpenAI summary response was refused"
          : "OpenAI summary response did not complete",
    });
  }
  const outputText = extractOpenAiSummaryOutputText(params.responseJson);
  if (outputText === undefined) {
    throw new SummaryModelProviderError({
      kind: "unsafe_or_refused",
      retryable: false,
      message: "OpenAI response did not contain summary output text",
    });
  }
  const rawDraft = parseOpenAiSummaryJsonObject(outputText);
  const usage = resolveOpenAiSummaryUsage(params.responseJson, params.estimateUsage());
  const draft = normalizeOpenAiSummaryDraft(
    rawDraft,
    params.input,
    params.selectedRoute,
    usage,
    params.evalDatasetVersion,
  );
  return { route: params.selectedRoute, draft };
};

