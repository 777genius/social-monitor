import { assertReaderSummaryWeeklyModelInput, type ReaderSummaryWeeklyModelInput } from "../../ports/reader-summary-weekly-model.port";
import { modelError } from "./openai-responses-reader-summary-weekly-response-contract";

/** Translate strict weekly input admission into the original non-retryable provider failure. */
export const assertValidWeeklyInput = (input: ReaderSummaryWeeklyModelInput): void => {
  try {
    assertReaderSummaryWeeklyModelInput(input);
  } catch (error) {
    throw modelError(
      "invalid_input",
      false,
      error instanceof Error
        ? error.message
        : "Reader summary weekly model input is invalid",
    );
  }
};
