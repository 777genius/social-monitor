import { ReaderSummaryWeeklyArtifact } from "../../domain/entities/reader-summary-weekly-artifact";
import type {
  ReaderSummaryWeeklyModelInput,
  ReaderSummaryWeeklyModelOutput,
} from "../../ports/reader-summary-weekly-model.port";
import { assertFiniteDenseJson } from "./openai-responses-reader-summary-weekly-response-shapes";
import { normalizeLegacyWeeklyModelOutput } from "./openai-responses-reader-summary-weekly-legacy-normalization";
import { decodeOpenAiReaderSummaryWeeklyJson, OpenAiReaderSummaryWeeklyOutputParseError } from "./openai-responses-reader-summary-weekly-json-admission";
export { OpenAiReaderSummaryWeeklyOutputParseError } from "./openai-responses-reader-summary-weekly-json-admission";

export const parseOpenAiReaderSummaryWeeklyResponse = (
  input: ReaderSummaryWeeklyModelInput,
  value: string,
): ReaderSummaryWeeklyModelOutput =>
  parseOpenAiReaderSummaryWeeklyValue(input, decodeOpenAiReaderSummaryWeeklyJson(value));

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
