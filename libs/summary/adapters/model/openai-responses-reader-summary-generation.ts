import type {
  ProviderReaderSummaryAttempt,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelInput,
  ReaderSummaryModelRoute,
} from "../../ports";
import { readerSummaryDailyInputReceipt } from "./reader-summary-daily-input-receipt";
import { buildOpenAiReaderSummaryResponseRequest } from "./openai-responses-reader-summary-response-request";
import { completeOpenAiReaderSummaryAttempt } from "./openai-responses-reader-summary-response-policy";
import {
  buildOpenAiReaderSummaryInstructions,
  buildOpenAiReaderSummaryPromptPayload,
} from "./openai-responses-reader-summary-prompt";
import { readerSummaryWriterSchema } from "./openai-responses-reader-summary-schema";

/**
 * Provider-specific request execution: the adapter owns admission and credentials,
 * this collaborator owns prompt/receipt binding, one transport invocation and
 * the ordered response trust boundary. Keep the transport injectable.
 */
export const runOpenAiReaderSummaryGeneration = async ({
  input,
  selectedRoute,
  maxOutputTokens,
  evalDatasetVersion,
  createResponse,
  estimateUsage,
}: {
  readonly input: ReaderSummaryModelInput;
  readonly selectedRoute: ReaderSummaryModelRoute;
  readonly maxOutputTokens: number;
  readonly evalDatasetVersion: string;
  readonly createResponse: (request: Record<string, unknown>) => Promise<Record<string, unknown>>;
  readonly estimateUsage: () => ReaderSummaryModelEstimate;
}): Promise<ProviderReaderSummaryAttempt> => {
  const prompt = buildOpenAiReaderSummaryPromptPayload(input);
  const dailyGenerationReceipt = readerSummaryDailyInputReceipt(prompt, input.evidence.dailyGenerationInput, input.dailyEditorialPlan);
  const responseJson = await createResponse(
    buildOpenAiReaderSummaryResponseRequest({
      model: selectedRoute.model,
      maxOutputTokens,
      instructions: buildOpenAiReaderSummaryInstructions(input),
      prompt,
      schema: readerSummaryWriterSchema(input),
    }),
  );
  return completeOpenAiReaderSummaryAttempt({
    responseJson,
    input,
    selectedRoute,
    estimateUsage,
    evalDatasetVersion,
    dailyGenerationReceipt,
  });
};
