import type {
  ProviderReaderSummaryAttempt,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelInput,
  ReaderSummaryModelRoute,
} from "../../ports";
import {
  assertOpenAiReaderSummaryClaimCitationIds,
  extractOpenAiOutputText,
  normalizeOpenAiReaderSummaryDraft,
  resolveOpenAiReaderSummaryUsage,
} from "./openai-responses-reader-summary-model-support";
import { parseOpenAiReaderSummaryJsonObject } from "./openai-responses-reader-summary-output-json-admission";
import { ReaderSummaryModelProviderError } from "./openai-responses-reader-summary-provider-error";
import { openAiResponsesCompletionIssue } from "./openai-responses-completion-state";

/**
 * Decodes untrusted OpenAI responses after transport completes.
 * Refusal, strict JSON, citation trust, usage, and normalization remain ordered.
 */
export const completeOpenAiReaderSummaryAttempt = ({
  responseJson,
  input,
  selectedRoute,
  estimateUsage,
  evalDatasetVersion,
  dailyGenerationReceipt,
}: {
  readonly responseJson: Record<string, unknown>;
  readonly input: ReaderSummaryModelInput;
  readonly selectedRoute: ReaderSummaryModelRoute;
  readonly estimateUsage: () => ReaderSummaryModelEstimate;
  readonly evalDatasetVersion: string;
  readonly dailyGenerationReceipt: ProviderReaderSummaryAttempt["dailyGenerationReceipt"];
}): ProviderReaderSummaryAttempt => {
  // Responses HTTP 200 is not proof that the model completed. Never trust
  // parseable partial/failed output as a publishable reader summary.
  const stateIssue = openAiResponsesCompletionIssue(responseJson);
  if (stateIssue !== null) {
    throw new ReaderSummaryModelProviderError({
      kind: stateIssue === "refusal" ? "unsafe_or_refused" : "invalid_schema",
      retryable: false,
      message: stateIssue === "error"
        ? "OpenAI reader summary response reported an error"
        : stateIssue === "refusal"
          ? "OpenAI reader summary response was refused"
          : "OpenAI reader summary response did not complete",
    });
  }
  const outputText = extractOpenAiOutputText(responseJson);

  if (outputText === undefined) {
    throw new ReaderSummaryModelProviderError({
      kind: "unsafe_or_refused",
      retryable: false,
      message: "OpenAI response did not contain reader summary output text",
    });
  }

  const rawDraft = parseOpenAiReaderSummaryJsonObject(outputText);
  assertOpenAiReaderSummaryClaimCitationIds(rawDraft);
  const usage = resolveOpenAiReaderSummaryUsage(
    responseJson,
    estimateUsage(),
  );
  const draft = normalizeOpenAiReaderSummaryDraft(
    rawDraft,
    input,
    selectedRoute,
    usage,
    evalDatasetVersion,
  );

  return {
    route: selectedRoute,
    draft,
    ...(dailyGenerationReceipt === undefined ? {} : { dailyGenerationReceipt }),
  };
};

// Preserve legacy imports while validation owns the fail-closed boundary.
export { validateOpenAiReaderSummaryResponse } from "./openai-responses-reader-summary-response-validation";
