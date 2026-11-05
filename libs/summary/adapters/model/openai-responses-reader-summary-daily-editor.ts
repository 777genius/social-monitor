import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { validateDailyEditorialPlan } from "../../domain";
import type { ReaderSummaryDailyEditorialAttempt, ReaderSummaryModelEstimate,
  ReaderSummaryModelInput, ReaderSummaryModelRoute } from "../../ports";
import { attachFailedDailyEditorUsage } from "./reader-summary-failed-daily-editor-usage";
import { buildDailyEditorialPrompt, dailyEditorialInstructions, dailyEditorialOutputSchema,
  dailyEditorialSha256 } from "./reader-summary-daily-editorial-model";
import { extractOpenAiOutputText, parseOpenAiReaderSummaryJsonObject,
  resolveOpenAiReaderSummaryUsage } from "./openai-responses-reader-summary-model-support";

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
  const response = await params.createResponse({
    model: params.route.model,
    store: false,
    max_output_tokens: Math.min(params.maxOutputTokens, 3_000),
    instructions: dailyEditorialInstructions,
    input: prompt,
    text: { format: {
      type: "json_schema", name: "social_monitor_daily_editorial_plan",
      strict: true, schema: dailyEditorialOutputSchema,
    } },
  });
  const inputTokens = Math.ceil(prompt.length / params.inputTokenDivisor);
  const estimate: ReaderSummaryModelEstimate = {
    inputTokens,
    outputTokens: 3_000,
    estimatedCostUsd: (inputTokens * params.estimatedInputCostUsdPerMillionTokens +
      3_000 * params.estimatedOutputCostUsdPerMillionTokens) / 1_000_000,
  };
  const actual = resolveOpenAiReaderSummaryUsage(response, estimate);
  const usage: ReaderSummaryModelEstimate = {
    inputTokens: actual.inputTokens ?? estimate.inputTokens,
    outputTokens: actual.outputTokens ?? estimate.outputTokens,
    estimatedCostUsd: actual.estimatedCostUsd,
  };
  try {
    const output = extractOpenAiOutputText(response);
    if (output === undefined) {
      throw new Error("Daily editorial plan response is empty");
    }
    const plan = validateDailyEditorialPlan(parseOpenAiReaderSummaryJsonObject(output), frozen);
    return {
      plan, usage,
      editorRequestSha256: dailyEditorialSha256(prompt),
      editorOutputSha256: canonicalJsonSha256(plan),
    };
  } catch (error) {
    attachFailedDailyEditorUsage(error, usage);
    throw error;
  }
};
