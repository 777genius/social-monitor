import { primaryReaderSummaryEvidence } from "../../domain";
import type { ReaderSummaryModelInput } from "../../ports";
import { ReaderSummaryModelProviderError } from "./openai-responses-reader-summary-provider-error";

/**
 * The no-signal path is local and allowed without credentials; real selected
 * evidence must be admitted before any paid provider request is assembled.
 * Keep the legacy error shape and precedence stable for callers.
 */
export const admitOpenAiReaderSummaryGeneration = (
  input: ReaderSummaryModelInput,
  apiKey: string,
): "no_signal" | "dispatch" => {
  if (
    primaryReaderSummaryEvidence(input.evidence).selectedEvidence.length === 0
  ) {
    return "no_signal";
  }
  if (apiKey.length === 0) {
    throw new ReaderSummaryModelProviderError({
      kind: "provider_unavailable",
      retryable: false,
      message:
        "READER_SUMMARY_MODEL_PROVIDER=openai-responses requires OPENAI_API_KEY",
    });
  }
  return "dispatch";
};
