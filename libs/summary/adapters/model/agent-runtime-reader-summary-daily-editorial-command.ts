import { readerSummaryScopeKey } from "../../domain";
import type { AgentRuntimeTaskCommand, ReaderSummaryModelInput } from "../../ports";
import { buildAgentRuntimeRequestId } from "./agent-runtime-model-support";
import { activeReaderSummaryPurposes } from "./active-reader-summary-generation-profile";
import { dailyEditorialInstructions, dailyEditorialOutputSchema } from "./reader-summary-daily-editorial-model";

/** Daily editorial request envelope; no provider dispatch, parsing or attestation. */
export const buildAgentRuntimeDailyEditorialCommand = (params: {
  readonly input: ReaderSummaryModelInput;
  readonly baseCommand: AgentRuntimeTaskCommand;
  readonly prompt: string;
  readonly maxOutputTokens: number;
}): AgentRuntimeTaskCommand => {
  const { input, baseCommand, prompt } = params;
  return {
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
      schemaVersion: "reader_summary.daily_editorial.v2",
      maxOutputTokens: Math.min(params.maxOutputTokens, 3_000),
    },
    metadata: { ...baseCommand.metadata, promptVersion: "reader_summary.daily_editorial.v2" },
  };
};
