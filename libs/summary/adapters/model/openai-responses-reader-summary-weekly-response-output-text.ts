import { modelError } from "./openai-responses-reader-summary-weekly-response-failure";
import { asRecord, nonEmptyString } from "./openai-responses-reader-summary-weekly-response-records";

export const extractSingleOutputText = (
  response: Record<string, unknown>,
): string => {
  const aggregate = nonEmptyString(response.output_text);
  const fragments: string[] = [];
  if (response.output !== undefined && !Array.isArray(response.output)) {
    throw modelError(
      "invalid_response",
      false,
      "OpenAI reader summary weekly output must be an array",
    );
  }
  for (const item of Array.isArray(response.output) ? response.output : []) {
    const output = asRecord(item);
    if (output === null || !Array.isArray(output.content)) {
      continue;
    }
    for (const itemContent of output.content) {
      const content = asRecord(itemContent);
      if (content?.type !== "output_text") {
        continue;
      }
      const text = nonEmptyString(content.text);
      if (text === undefined) {
        throw modelError(
          "invalid_response",
          false,
          "OpenAI reader summary weekly output text is empty",
        );
      }
      fragments.push(text);
    }
  }
  if (fragments.length > 1) {
    throw modelError(
      "invalid_response",
      false,
      "OpenAI reader summary weekly response contains stitched output text",
    );
  }
  if (
    aggregate !== undefined &&
    fragments.length === 1 &&
    aggregate !== fragments[0]
  ) {
    throw modelError(
      "invalid_response",
      false,
      "OpenAI reader summary weekly aggregate output text is inconsistent",
    );
  }
  const outputText = aggregate ?? fragments[0];
  if (outputText === undefined) {
    throw modelError(
      "invalid_response",
      false,
      "OpenAI reader summary weekly response has no output text",
    );
  }
  return outputText;
};
