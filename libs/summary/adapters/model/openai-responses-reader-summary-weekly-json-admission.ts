/**
 * Syntax-only admission of provider-supplied weekly JSON.
 * Never expose parser exception messages: engines can include private input.
 * Artifact/schema/citation validation remains owned by the weekly parser.
 */
export const decodeOpenAiReaderSummaryWeeklyJson = (value: string): unknown => {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new OpenAiReaderSummaryWeeklyOutputParseError(
      "response must be non-empty JSON text",
    );
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    // SyntaxError.message may quote private provider evidence in recent V8.
    // Keep syntax diagnostics fail-closed without exposing response fragments.
    throw new OpenAiReaderSummaryWeeklyOutputParseError("malformed JSON");
  }
  return parsed;
};

export class OpenAiReaderSummaryWeeklyOutputParseError extends Error {
  constructor(readonly detail: string) {
    super(`OpenAI reader summary weekly output is invalid: ${detail}`);
    this.name = "OpenAiReaderSummaryWeeklyOutputParseError";
  }
}
