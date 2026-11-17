import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import { validateDailyEditorialPlan } from "../../domain";
import type { ReaderSummaryDailyGenerationInput } from "../../domain";
import type { ReaderSummaryDailyEditorialAttempt, ReaderSummaryModelEstimate } from "../../ports";
import { dailyEditorialSha256 } from "./reader-summary-daily-editorial-model";
import { openAiResponsesCompletionIssue } from "./openai-responses-completion-state";
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
  const stateIssue = openAiResponsesCompletionIssue(response);
  if (stateIssue !== null) {
    // runOpenAiDailyEditor records physical usage even when this plan rejects.
    throw new Error(stateIssue === "error"
      ? "Daily editorial plan response reported an error"
      : stateIssue === "refusal"
        ? "Daily editorial plan response was refused"
        : "Daily editorial plan response did not complete");
  }
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
