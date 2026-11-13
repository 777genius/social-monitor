import { requiredArray } from "./openai-responses-reader-summary-json";

export const extractOpenAiOutputText = (
  response: Record<string, unknown>,
): string | undefined => {
  if (
    typeof response.output_text === "string" &&
    response.output_text.trim().length > 0
  ) {
    return response.output_text;
  }

  for (const output of requiredArray<Record<string, unknown>>(
    response.output ?? [],
    "OpenAI output",
  )) {
    for (const content of requiredArray<Record<string, unknown>>(
      output.content ?? [],
      "OpenAI content",
    )) {
      if (typeof content.text === "string" && content.text.trim().length > 0) {
        return content.text;
      }
    }
  }

  return undefined;
};
