import { validateDailyEditorialPlan } from "../../domain";
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import type {
  AgentRuntimeTaskCommand,
  AgentRuntimeTaskResult,
  ReaderSummaryDailyEditorialAttempt,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelInput,
} from "../../ports";
import { attachFailedDailyEditorUsage } from "./reader-summary-failed-daily-editor-usage";
import { readAgentRuntimeObjectOutput } from "./agent-runtime-model-support";
import { parseOpenAiReaderSummaryJsonObject } from "./openai-responses-reader-summary-response-parser";
import { dailyEditorialSha256 } from "./reader-summary-daily-editorial-model";
import {
  verifyAndRecordReaderSummaryExecution,
  type VerifiedReaderSummaryExecutionAttestationSink,
} from "./reader-summary-execution-attestation";

/** Fail closed on untrusted output before recording an attested editorial plan. */
export const readAttestedAgentRuntimeDailyEditorialResponse = async (params: {
  readonly command: AgentRuntimeTaskCommand;
  readonly result: AgentRuntimeTaskResult;
  readonly prompt: string;
  readonly frozen: NonNullable<ReaderSummaryModelInput["evidence"]["dailyGenerationInput"]>;
  readonly usage: ReaderSummaryModelEstimate;
  readonly sink?: VerifiedReaderSummaryExecutionAttestationSink;
}): Promise<ReaderSummaryDailyEditorialAttempt> => {
  const { command, result, prompt, frozen, usage } = params;
  try {
    const raw = readAgentRuntimeObjectOutput(
      result, parseOpenAiReaderSummaryJsonObject, "Daily editorial plan");
    const plan = validateDailyEditorialPlan(raw, frozen);
    if (plan.version !== "reader_summary.daily_editorial.v2")
      throw new Error("Daily editor returned a legacy plan for a synthesis request");
    await verifyAndRecordReaderSummaryExecution({
      command, result, taskRole: "daily_editor", attempt: "primary",
      normalizedOutput: plan, sink: params.sink,
    });
    return {
      plan, usage,
      editorRequestSha256: dailyEditorialSha256(prompt),
      editorOutputSha256: canonicalJsonSha256(plan),
    };
  } catch (error) {
    // Gateway requests rejected before dispatch have no paid model usage.
    if (result.failure?.details.gatewayEffect !== "not_dispatched") {
      attachFailedDailyEditorUsage(error, usage);
    }
    throw error;
  }
};
