import { asRecord } from "./openai-responses-summary-json";

export const extractOpenAiSummaryOutputText = (
  responseJson: Record<string, unknown>,
): string | undefined => {
  if (
    typeof responseJson.output_text === 'string' &&
    responseJson.output_text.trim().length > 0
  ) {
    return responseJson.output_text;
  }

  const output = responseJson.output;

  if (!Array.isArray(output)) {
    return undefined;
  }

  for (const outputItem of output) {
    const outputRecord = asRecord(outputItem);

    if (outputRecord === null) {
      continue;
    }

    const content = outputRecord.content;

    if (!Array.isArray(content)) {
      continue;
    }

    for (const contentItem of content) {
      const contentRecord = asRecord(contentItem);

      if (contentRecord === null) {
        continue;
      }

      if (
        typeof contentRecord.text === 'string' &&
        contentRecord.text.trim().length > 0
      ) {
        return contentRecord.text;
      }
    }
  }

  return undefined;
};
