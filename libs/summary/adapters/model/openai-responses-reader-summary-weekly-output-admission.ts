import type {
  ReaderSummaryWeeklyModelInput,
  ReaderSummaryWeeklyModelOutput,
} from "../../ports/reader-summary-weekly-model.port";
import { modelError } from "./openai-responses-reader-summary-weekly-response-contract";
import { parseOpenAiReaderSummaryWeeklyResponse } from "./openai-responses-reader-summary-weekly-response-parser";

/** Translate rejected artifact text to the stable non-retryable provider failure contract. */
export const admitOpenAiReaderSummaryWeeklyOutput = (
  input: ReaderSummaryWeeklyModelInput,
  outputText: string,
): ReaderSummaryWeeklyModelOutput => {
  try {
    return parseOpenAiReaderSummaryWeeklyResponse(input, outputText);
  } catch (error) {
    throw modelError(
      "output_validation",
      false,
      error instanceof Error
        ? error.message
        : "OpenAI reader summary weekly output validation failed",
    );
  }
};
