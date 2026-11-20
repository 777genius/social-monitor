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
import {
  isGatewayReaderSummaryBackend,
  type ReaderSummaryGenerationBackend,
} from "./active-reader-summary-generation-profile";
import { gatewayOutputHardLimits } from "./gateway-llm/gateway-llm-schema-limits";
import { readerSummaryCommandIdentity } from "./agent-runtime-reader-summary-command-identity";
import { readerSummaryTaskControls } from "./agent-runtime-reader-summary-command-controls";

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
  const identity = readerSummaryCommandIdentity({ input, attempt, legacyRecovery: params.legacyRecovery });
  const selectedSchema = readerSummaryWriterSchema(input);
  const hardLimits = isGatewayReaderSummaryBackend(params.modelBackend)
    ? `\n${gatewayOutputHardLimits(selectedSchema)}` : "";
  const repairInstruction = !isRepair ? ""
    : `\n${readerSummaryRepairInstruction(input, schemaViolations)}`;
  return {
    requestId: identity.requestId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    correlationId: identity.correlationId,
    provider: params.agentProvider,
    providerInstanceId: params.providerInstanceId,
    purpose: identity.purpose,
    systemPrompt: `${buildOpenAiReaderSummaryInstructions(input)}${hardLimits}${repairInstruction}`,
    prompt: buildOpenAiReaderSummaryPromptPayload(input),
    outputSchema: selectedSchema,
    controls: readerSummaryTaskControls({
      selectedRoute,
      model: params.model,
      modelBackend: params.modelBackend,
      reasoningEffort: params.reasoningEffort,
      maxOutputTokens: params.maxOutputTokens,
    }),
    timeoutMs: params.timeoutMs,
    metadata: {
      adapter: "agent-runtime-reader-summary",
      promptVersion: selectedRoute.promptVersion,
      reasoningEffort: params.reasoningEffort,
      attempt,
    },
  };
};
