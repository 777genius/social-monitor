import type {
  ProviderSummaryAttempt,
  SummaryModelEstimate,
  SummaryModelInput,
  SummaryModelRoute,
  SummaryModelValidationResult,
} from "../../ports";
import {
  assertOpenAiSummaryDraftShape,
  normalizeOpenAiSummaryDraft,
} from "./openai-responses-summary-draft-normalizer";
import { SummaryModelProviderError } from "./openai-responses-summary-model-error";
import { extractOpenAiSummaryOutputText } from "./openai-responses-summary-output-text";
import { parseOpenAiSummaryJsonObject } from "./openai-responses-summary-response-parser";
import { resolveOpenAiSummaryUsage } from "./openai-responses-summary-usage";

/** Interprets untrusted provider output only after transport succeeds. */
export const completeOpenAiSummaryAttempt = (params: {
  readonly responseJson: Record<string, unknown>;
  readonly input: SummaryModelInput;
  readonly selectedRoute: SummaryModelRoute;
  readonly estimateUsage: () => SummaryModelEstimate;
  readonly evalDatasetVersion: string;
}): ProviderSummaryAttempt => {
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

/** Keep post-normalization port validation distinct from HTTP and schema decoding. */
export const validateOpenAiSummaryResponse = (
  attempt: ProviderSummaryAttempt,
): SummaryModelValidationResult => {
  try {
    assertOpenAiSummaryDraftShape(attempt.draft);

    if (attempt.route.schemaVersion !== "summary.artifact.v1") {
      throw new Error("Unsupported summary schema version");
    }

    if (attempt.route.provider !== "openai-responses") {
      throw new Error("Unexpected summary provider route");
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
            : "Invalid summary provider response",
      },
    };
  }
};
