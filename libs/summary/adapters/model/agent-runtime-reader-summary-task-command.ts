import { readerSummaryScopeKey } from "../../domain";
import type {
  AgentRuntimeProvider,
  AgentRuntimeTaskCommand,
  ReaderSummaryModelInput,
  ReaderSummaryModelRoute,
} from "../../ports";
import { readerSummaryRepairInstruction } from "./reader-summary-narrative-repair-contract";
import {
  buildOpenAiReaderSummaryInstructions,
  buildOpenAiReaderSummaryPromptPayload,
} from "./openai-responses-reader-summary-prompt";
import { readerSummaryWriterSchema } from "./openai-responses-reader-summary-schema";
import { buildAgentRuntimeRequestId } from "./agent-runtime-model-support";
import {
  activeReaderSummaryPurposes,
  frozenLegacyReaderSummaryRecoveryContract,
  isGatewayReaderSummaryBackend,
  readerSummaryRouteControls,
  type ReaderSummaryGenerationBackend,
} from "./active-reader-summary-generation-profile";
import { gatewayOutputHardLimits } from "./gateway-llm/gateway-llm-schema-limits";

export const buildAgentRuntimeReaderSummaryTaskCommand = (
  params: Readonly<{
    input: ReaderSummaryModelInput;
    selectedRoute: ReaderSummaryModelRoute;
    attempt: "primary" | "repair";
    schemaViolations?: readonly string[];
    agentProvider: AgentRuntimeProvider;
    providerInstanceId?: string;
    legacyRecovery: boolean;
    modelBackend: ReaderSummaryGenerationBackend;
    reasoningEffort: string;
    model: string;
    maxOutputTokens: number;
    timeoutMs: number;
  }>,
): AgentRuntimeTaskCommand => {
  const { input, selectedRoute, attempt, schemaViolations } = params;
  const isRepair = attempt === "repair";
  const selectedSchema = readerSummaryWriterSchema(input);
  const hardLimits = isGatewayReaderSummaryBackend(params.modelBackend)
    ? `\n${gatewayOutputHardLimits(selectedSchema)}` : "";
  const repairInstruction = !isRepair ? ""
    : `\n${readerSummaryRepairInstruction(input, schemaViolations)}`;
  return {
    requestId: buildAgentRuntimeRequestId(
      isRepair ? "reader-summary-repair" : "reader-summary",
      input.tenantId,
      input.workspaceId,
      readerSummaryScopeKey(input.scope),
      input.requestedAt,
    ),
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    correlationId: buildAgentRuntimeRequestId(
      "reader-summary-correlation",
      input.tenantId,
      input.workspaceId,
      readerSummaryScopeKey(input.scope),
      input.requestedAt,
    ),
    provider: params.agentProvider,
    providerInstanceId: params.providerInstanceId,
    purpose: isRepair
      ? params.legacyRecovery
        ? frozenLegacyReaderSummaryRecoveryContract.purposes.repair
        : activeReaderSummaryPurposes.repair
      : params.legacyRecovery
        ? frozenLegacyReaderSummaryRecoveryContract.purposes.generate
        : activeReaderSummaryPurposes.generate,
    systemPrompt: `${buildOpenAiReaderSummaryInstructions(input)}${hardLimits}${repairInstruction}`,
    prompt: buildOpenAiReaderSummaryPromptPayload(input),
    outputSchema: selectedSchema,
    controls: {
      interactive: false,
      outputSchemaName: "social_monitor_reader_summary_artifact",
      schemaVersion: selectedRoute.schemaVersion,
      model: params.model,
      ...(params.modelBackend === "xiaomi-mimo-token-plan"
        ? { modelBackend: params.modelBackend }
        : {}),
      ...readerSummaryRouteControls(params.modelBackend, params.reasoningEffort),
      toolsEnabled: false,
      toolPolicy: "none",
      maxOutputTokens: params.maxOutputTokens,
    },
    timeoutMs: params.timeoutMs,
    metadata: {
      adapter: "agent-runtime-reader-summary",
      promptVersion: selectedRoute.promptVersion,
      reasoningEffort: params.reasoningEffort,
      attempt,
    },
  };
};
