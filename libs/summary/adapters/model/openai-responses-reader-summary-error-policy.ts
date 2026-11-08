import type { ReaderSummaryModelFailure } from "../../ports";
import { OpenAiReaderSummaryOutputParseError } from "./openai-responses-reader-summary-model-support";
import { ReaderSummaryModelProviderError } from "./openai-responses-reader-summary-transport";

export const classifyOpenAiReaderSummaryModelError = (error: unknown): ReaderSummaryModelFailure => {
    if (error instanceof ReaderSummaryModelProviderError) {
      return error.failure;
    }

    if (error instanceof OpenAiReaderSummaryOutputParseError) {
      return {
        kind: "invalid_schema",
        retryable: true,
        message: error.message,
      };
    }

    if (error instanceof Error && error.name === "AbortError") {
      return {
        kind: "provider_unavailable",
        retryable: true,
        message: "OpenAI reader summary request timed out",
      };
    }

    const message =
      error instanceof Error
        ? error.message
        : "Unknown reader summary model error";
    const lower = message.toLowerCase();

    if (lower.includes("budget")) {
      return { kind: "budget_exceeded", retryable: false, message };
    }
    if (lower.includes("citation")) {
      return { kind: "citation_validation_failed", retryable: false, message };
    }
    if (lower.includes("schema") || lower.includes("json")) {
      return { kind: "invalid_schema", retryable: false, message };
    }

    return { kind: "unknown", retryable: false, message };
};
