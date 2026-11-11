import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { validateDailyEditorialPlan } from "../../domain";
import type { ReaderSummaryDailyGenerationInput } from "../../domain";
import type { ReaderSummaryDailyEditorialAttempt, ReaderSummaryModelEstimate } from "../../ports";
import { dailyEditorialSha256 } from "./reader-summary-daily-editorial-model";
import {
  extractOpenAiOutputText,
  parseOpenAiReaderSummaryJsonObject,
} from "./openai-responses-reader-summary-response-parser";

/** Never attest an unvalidated provider plan or rebind it to different evidence. */
export const readOpenAiDailyEditorialResponse = (
  response: Record<string, unknown>,
  frozen: ReaderSummaryDailyGenerationInput,
  prompt: string,
  usage: ReaderSummaryModelEstimate,
): ReaderSummaryDailyEditorialAttempt => {
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
};
