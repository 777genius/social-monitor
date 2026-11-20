import type {
  AgentRuntimeClientPort,
  AgentRuntimeTaskCommand,
  ReaderSummaryDailyEditorialAttempt,
  ReaderSummaryModelInput,
} from "../../ports";
import { runAgentRuntimeDailyEditor } from "./agent-runtime-reader-summary-daily-editorial";
import type { VerifiedReaderSummaryExecutionAttestationSink } from "./reader-summary-execution-attestation";

/**
 * Admit the daily editorial lane before constructing a command or making a paid
 * model call. The generation adapter owns routing; this policy owns the
 * legacy/frozen-input gate and the editor's one-request dispatch.
 */
export const dispatchAgentRuntimeReaderSummaryDailyPlan = async (params: {
  readonly input: ReaderSummaryModelInput;
  readonly client: AgentRuntimeClientPort;
  readonly legacyRecovery: boolean;
  readonly buildPrimaryCommand: () => AgentRuntimeTaskCommand;
  readonly inputTokenDivisor: number;
  readonly maxOutputTokens: number;
  readonly sink?: VerifiedReaderSummaryExecutionAttestationSink;
}): Promise<ReaderSummaryDailyEditorialAttempt> => {
  const { input } = params;
  if (params.legacyRecovery || input.evidence.dailyGenerationInput === undefined)
    throw new Error("Daily editorial planning is not available for this profile");

  return runAgentRuntimeDailyEditor({
    input,
    client: params.client,
    baseCommand: params.buildPrimaryCommand(),
    inputTokenDivisor: params.inputTokenDivisor,
    maxOutputTokens: params.maxOutputTokens,
    sink: params.sink,
  });
};
