import type {
  ReaderSummaryWeeklyModelInput,
  ReaderSummaryWeeklyModelOutput,
} from "../../ports/reader-summary-weekly-model.port";
import { openAiApiKeySourceDescription } from "./openai-api-key-source";
import {
  extractSingleOutputText,
  modelError,
  readCompletedResponse,
} from "./openai-responses-reader-summary-weekly-response-contract";
import { assertValidWeeklyInput } from "./openai-responses-reader-summary-weekly-input-admission";
import { buildOpenAiReaderSummaryWeeklyRequest } from "./openai-responses-reader-summary-weekly-request";
import { postOpenAiReaderSummaryWeeklyResponse } from "./openai-responses-reader-summary-weekly-transport";
import { admitOpenAiReaderSummaryWeeklyOutput } from "./openai-responses-reader-summary-weekly-output-admission";
import type { NormalizedOpenAiReaderSummaryWeeklyOptions } from "./openai-responses-reader-summary-weekly-options";

/**
 * One weekly task: admit the input and credentials before dispatch, then
 * validate the completed response and sealed artifact. The port adapter
 * owns configuration and error classification, not this execution sequence.
 */
export const executeOpenAiReaderSummaryWeeklyGeneration = async (
  input: ReaderSummaryWeeklyModelInput,
  settings: NormalizedOpenAiReaderSummaryWeeklyOptions,
): Promise<ReaderSummaryWeeklyModelOutput> => {
  assertValidWeeklyInput(input);
  if (settings.apiKey.length === 0) {
    throw modelError(
      "configuration",
      false,
      `OpenAI reader summary weekly model requires ${openAiApiKeySourceDescription}`,
    );
  }

  const response = await postOpenAiReaderSummaryWeeklyResponse({
    apiKey: settings.apiKey,
    endpointUrl: settings.endpointUrl,
    timeoutMs: settings.timeoutMs,
    fetchFn: settings.fetchFn,
    request: buildOpenAiReaderSummaryWeeklyRequest(input, {
      model: settings.model,
      maxOutputTokens: settings.maxOutputTokens,
    }),
  });
  const responseJson = await readCompletedResponse(response);
  const outputText = extractSingleOutputText(responseJson);
  return admitOpenAiReaderSummaryWeeklyOutput(input, outputText);
};
