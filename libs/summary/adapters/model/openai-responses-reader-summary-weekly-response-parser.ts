import { ReaderSummaryWeeklyArtifact } from "../../domain/entities/reader-summary-weekly-artifact";
import type {
  ReaderSummaryWeeklyModelInput,
  ReaderSummaryWeeklyModelOutput,
} from "../../ports/reader-summary-weekly-model.port";
import { assertFiniteDenseJson } from "./openai-responses-reader-summary-weekly-response-shapes";
import { normalizeLegacyWeeklyModelOutput } from "./openai-responses-reader-summary-weekly-legacy-normalization";

export const parseOpenAiReaderSummaryWeeklyResponse = (
  input: ReaderSummaryWeeklyModelInput,
  value: string,
): ReaderSummaryWeeklyModelOutput => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new OpenAiReaderSummaryWeeklyOutputParseError(
      "response must be non-empty JSON text",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "unknown JSON parse failure";
    throw new OpenAiReaderSummaryWeeklyOutputParseError(detail);
  }
  return parseOpenAiReaderSummaryWeeklyValue(input, parsed);
};

export const parseOpenAiReaderSummaryWeeklyValue = (
  input: ReaderSummaryWeeklyModelInput,
  value: unknown,
): ReaderSummaryWeeklyModelOutput => {
  try {
    assertFiniteDenseJson(value, "weekly output", new Set<object>());
    const normalized = normalizeLegacyWeeklyModelOutput(input, value);
    return ReaderSummaryWeeklyArtifact.create({
      input,
      output: normalized as ReaderSummaryWeeklyModelOutput,
    }).toModelOutput();
  } catch (error) {
    if (error instanceof OpenAiReaderSummaryWeeklyOutputParseError) {
      throw error;
    }
    const detail =
      error instanceof Error ? error.message : "unknown validation failure";
    throw new OpenAiReaderSummaryWeeklyOutputParseError(detail);
  }
};

export class OpenAiReaderSummaryWeeklyOutputParseError extends Error {
  constructor(readonly detail: string) {
    super(`OpenAI reader summary weekly output is invalid: ${detail}`);
    this.name = "OpenAiReaderSummaryWeeklyOutputParseError";
  }
}

