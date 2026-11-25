import type {
  AgentRuntimeClientPort,
  AgentRuntimeTaskCommand,
  ReaderSummaryModelEstimate,
  ReaderSummaryModelInput,
} from "../../ports";
import { usageFromAgentRuntime } from "./agent-runtime-model-support";
import { readerSummaryDailyInputReceipt } from "./reader-summary-daily-input-receipt";

/**
 * One paid attempt: validate the frozen daily prompt before provider I/O;
 * normalize physical usage after return. Retry and attestation are separate.
 */
export const runAgentRuntimeReaderSummaryPaidAttempt = async (params: Readonly<{
  client: AgentRuntimeClientPort;
  command: AgentRuntimeTaskCommand;
  input: ReaderSummaryModelInput;
  estimate: () => ReaderSummaryModelEstimate;
}>) => {
  const { command, input } = params;
  const dailyGenerationReceipt = readerSummaryDailyInputReceipt(command.prompt, input.evidence.dailyGenerationInput, input.dailyEditorialPlan);
  const result = await params.client.runTask(command);
  const estimate = params.estimate();
  const attemptUsage = usageFromAgentRuntime(result.usage, estimate);
  return { result, estimate, attemptUsage, dailyGenerationReceipt };
};
