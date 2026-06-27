import type {
  GeneratedSummaryDraft,
  SummaryModelEstimate,
} from '../../ports';
import { SummaryModelProviderError } from './openai-responses-summary-model-error';
import {
  asRecord,
  optionalNonNegativeInteger,
  requiredRecord,
} from './openai-responses-summary-json';

export const resolveOpenAiSummaryUsage = (
  responseJson: Record<string, unknown>,
  estimate: SummaryModelEstimate,
): GeneratedSummaryDraft['usage'] => {
  const usage = asRecord(responseJson.usage);

  if (usage === null) {
    return estimate;
  }

  return {
    inputTokens:
      optionalNonNegativeInteger(usage.input_tokens) ?? estimate.inputTokens,
    outputTokens:
      optionalNonNegativeInteger(usage.output_tokens) ?? estimate.outputTokens,
    estimatedCostUsd: estimate.estimatedCostUsd,
  };
};

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

export const parseOpenAiSummaryJsonObject = (
  value: string,
): Record<string, unknown> => {
  try {
    return requiredRecord(JSON.parse(value), 'OpenAI summary output');
  } catch (error) {
    throw new SummaryModelProviderError({
      kind: 'invalid_schema',
      retryable: false,
      message:
        error instanceof Error
          ? error.message
          : 'OpenAI summary output must be JSON',
    });
  }
};
