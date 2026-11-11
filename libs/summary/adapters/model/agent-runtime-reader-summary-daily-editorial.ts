import type {
  AgentRuntimeClientPort,
  AgentRuntimeTaskCommand,
  ReaderSummaryDailyEditorialAttempt,
  ReaderSummaryModelInput,
} from "../../ports";
import { usageFromAgentRuntime } from "./agent-runtime-model-support";
import { buildDailyEditorialPrompt } from "./reader-summary-daily-editorial-model";
import { buildAgentRuntimeDailyEditorialCommand } from "./agent-runtime-reader-summary-daily-editorial-command";
import { readAttestedAgentRuntimeDailyEditorialResponse } from "./agent-runtime-reader-summary-daily-editorial-response";
import type { VerifiedReaderSummaryExecutionAttestationSink } from "./reader-summary-execution-attestation";

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
  const command = buildAgentRuntimeDailyEditorialCommand({
    input, baseCommand, prompt, maxOutputTokens: params.maxOutputTokens,
  });
  const result = await params.client.runTask(command);
  const usage = usageFromAgentRuntime(result.usage, {
    inputTokens: Math.ceil(prompt.length / params.inputTokenDivisor),
    outputTokens: 3_000, estimatedCostUsd: 0,
  });
  return readAttestedAgentRuntimeDailyEditorialResponse({
    command, result, prompt, frozen, usage, sink: params.sink,
  });
}
