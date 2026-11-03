import { readerSummaryScopeKey, validateDailyEditorialPlan } from "../../domain";
import { canonicalJsonSha256 } from "@social-monitor/contracts/grpc/agent_runtime/v1/execution-attestation";
import type { AgentRuntimeClientPort, AgentRuntimeTaskCommand,
  ReaderSummaryDailyEditorialAttempt, ReaderSummaryModelInput } from "../../ports";
import { buildAgentRuntimeRequestId, readAgentRuntimeObjectOutput,
  usageFromAgentRuntime } from "./agent-runtime-model-support";
import { activeReaderSummaryPurposes } from "./active-reader-summary-generation-profile";
import { buildDailyEditorialPrompt, dailyEditorialInstructions,
  dailyEditorialOutputSchema, dailyEditorialSha256 } from "./reader-summary-daily-editorial-model";
import { parseOpenAiReaderSummaryJsonObject } from "./openai-responses-reader-summary-response-parser";
import { verifyAndRecordReaderSummaryExecution,
  type VerifiedReaderSummaryExecutionAttestationSink } from "./reader-summary-execution-attestation";

/** A single attested model call; the caller retains ownership of job and budget. */
export async function runAgentRuntimeDailyEditor(params: {
  readonly input: ReaderSummaryModelInput;
  readonly baseCommand: AgentRuntimeTaskCommand;
  readonly client: AgentRuntimeClientPort;
  readonly inputTokenDivisor: number;
  readonly maxOutputTokens: number;
  readonly sink?: VerifiedReaderSummaryExecutionAttestationSink;
}): Promise<ReaderSummaryDailyEditorialAttempt> {
  const { input, baseCommand } = params;
  const frozen = input.evidence.dailyGenerationInput;
  if (frozen === undefined) throw new Error("Daily editorial input is missing");
  const prompt = buildDailyEditorialPrompt(input);
  const command: AgentRuntimeTaskCommand = {
    ...baseCommand,
    requestId: buildAgentRuntimeRequestId("reader-summary-daily-editorial",
      input.tenantId, input.workspaceId, readerSummaryScopeKey(input.scope), input.requestedAt),
    purpose: activeReaderSummaryPurposes.dailyEditorial,
    systemPrompt: dailyEditorialInstructions,
    prompt,
    outputSchema: dailyEditorialOutputSchema,
    controls: {
      ...baseCommand.controls,
      outputSchemaName: "social_monitor_daily_editorial_plan",
      schemaVersion: "reader_summary.daily_editorial.v1",
      maxOutputTokens: Math.min(params.maxOutputTokens, 3_000),
    },
    metadata: { ...baseCommand.metadata, promptVersion: "reader_summary.daily_editorial.v1" },
  };
  const result = await params.client.runTask(command);
  const raw = readAgentRuntimeObjectOutput(
    result, parseOpenAiReaderSummaryJsonObject, "Daily editorial plan");
  const plan = validateDailyEditorialPlan(raw, frozen);
  await verifyAndRecordReaderSummaryExecution({
    command, result, taskRole: "daily_editor", attempt: "primary",
    normalizedOutput: plan, sink: params.sink,
  });
  return {
    plan,
    usage: usageFromAgentRuntime(result.usage, {
      inputTokens: Math.ceil(prompt.length / params.inputTokenDivisor),
      outputTokens: 3_000, estimatedCostUsd: 0,
    }),
    editorRequestSha256: dailyEditorialSha256(prompt),
    editorOutputSha256: canonicalJsonSha256(plan),
  };
}
