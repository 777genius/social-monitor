import type {
  ProviderReaderSummaryAttempt,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelInput,
  ReaderSummaryModelRoute,
  ReaderSummaryModelValidationResult,
} from "../../ports";
import {
  assertOpenAiReaderSummaryClaimCitationIds,
  assertOpenAiReaderSummaryDraftShape,
  extractOpenAiOutputText,
  normalizeOpenAiReaderSummaryDraft,
  parseOpenAiReaderSummaryJsonObject,
  resolveOpenAiReaderSummaryUsage,
} from "./openai-responses-reader-summary-model-support";
import { ReaderSummaryModelProviderError } from "./openai-responses-reader-summary-provider-error";

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

/** Validates the normalized draft before crossing the model port. */
export const validateOpenAiReaderSummaryResponse = (
  attempt: ProviderReaderSummaryAttempt,
): ReaderSummaryModelValidationResult => {
  try {
    assertOpenAiReaderSummaryDraftShape(attempt.draft);
    if (attempt.route.schemaVersion !== "reader_summary.artifact.v1") {
      throw new Error("Unsupported reader summary schema version");
    }
    if (attempt.route.provider !== "openai-responses") {
      throw new Error("Unexpected reader summary provider route");
    }

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      failure: {
        kind: "invalid_schema",
        retryable: false,
        message:
          error instanceof Error
            ? error.message
            : "Invalid reader summary provider response",
      },
    };
  }
};
