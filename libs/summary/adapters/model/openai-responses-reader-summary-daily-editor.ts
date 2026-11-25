import type {
  ReaderSummaryDailyEditorialAttempt,
  ReaderSummaryModelInput,
  ReaderSummaryModelRoute,
} from "../../ports";
import { attachFailedDailyEditorUsage } from "./reader-summary-failed-daily-editor-usage";
import { buildDailyEditorialPrompt } from "./reader-summary-daily-editorial-model";
import {
  buildOpenAiDailyEditorialRequest,
  resolveOpenAiDailyEditorialUsage,
} from "./openai-responses-reader-summary-daily-editor-wire";
import { readOpenAiDailyEditorialResponse } from "./openai-responses-reader-summary-daily-editor-response";

/** Daily-only editor protocol; the owning adapter provides transport and credentials. */
export const runOpenAiDailyEditor = async (params: {
  readonly input: ReaderSummaryModelInput;
  readonly route: ReaderSummaryModelRoute;
  readonly maxOutputTokens: number;
  readonly inputTokenDivisor: number;
  readonly estimatedInputCostUsdPerMillionTokens: number;
  readonly estimatedOutputCostUsdPerMillionTokens: number;
  readonly createResponse: (request: Record<string, unknown>) => Promise<Record<string, unknown>>;
}): Promise<ReaderSummaryDailyEditorialAttempt> => {
  const frozen = params.input.evidence.dailyGenerationInput;
  if (frozen === undefined) {
    throw new Error("Daily editorial planning requires a frozen input");
  }
  const prompt = buildDailyEditorialPrompt(params.input);
  const response = await params.createResponse(
    buildOpenAiDailyEditorialRequest(params.route.model, params.maxOutputTokens, prompt),
  );
  const usage = resolveOpenAiDailyEditorialUsage({
    response,
    prompt,
    inputTokenDivisor: params.inputTokenDivisor,
    estimatedInputCostUsdPerMillionTokens: params.estimatedInputCostUsdPerMillionTokens,
    estimatedOutputCostUsdPerMillionTokens: params.estimatedOutputCostUsdPerMillionTokens,
  });
  try {
    return readOpenAiDailyEditorialResponse(response, frozen, prompt, usage);
  } catch (error) {
    attachFailedDailyEditorUsage(error, usage);
    throw error;
  }
};
