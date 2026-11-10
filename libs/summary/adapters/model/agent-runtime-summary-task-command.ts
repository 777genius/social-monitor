import type {
  AgentRuntimeProvider,
  AgentRuntimeTaskCommand,
  SummaryModelInput,
  SummaryModelRoute,
} from "../../ports";
import { buildInstructions, buildPromptPayload } from "./openai-responses-summary-prompt";
import { openAiSummaryJsonSchema } from "./openai-responses-summary-schema";
import { buildAgentRuntimeRequestId } from "./agent-runtime-model-support";

export const buildAgentRuntimeSummaryTaskCommand = (params: Readonly<{
  input: SummaryModelInput;
  selectedRoute: SummaryModelRoute;
  agentProvider: AgentRuntimeProvider;
  providerInstanceId?: string;
  model: string;
  defaultModelAlias: string;
  routeControls: Readonly<Record<string, unknown>>;
  maxOutputTokens: number;
  timeoutMs: number;
}>): AgentRuntimeTaskCommand => {
  const { input, selectedRoute } = params;
  return {
      requestId: buildAgentRuntimeRequestId(
        "summary",
        input.tenantId,
        input.workspaceId,
        input.interestId,
        input.requestedAt,
      ),
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      correlationId: buildAgentRuntimeRequestId(
        "summary-correlation",
        input.tenantId,
        input.workspaceId,
        input.interestId,
        input.requestedAt,
      ),
      provider: params.agentProvider,
      providerInstanceId: params.providerInstanceId,
      purpose: "social_monitor.summary.generate",
      systemPrompt: buildInstructions(input),
      prompt: buildPromptPayload(input),
      outputSchema: openAiSummaryJsonSchema,
      controls: {
        interactive: false,
        outputSchemaName: "social_monitor_summary_artifact",
        schemaVersion: selectedRoute.schemaVersion,
        ...runtimeModelControl(params.model, params.defaultModelAlias),
        ...params.routeControls,
        maxOutputTokens: params.maxOutputTokens,
      },
      timeoutMs: params.timeoutMs,
      metadata: {
        adapter: "agent-runtime-summary",
        promptVersion: selectedRoute.promptVersion,
      },
    };
};

const runtimeModelControl = (
  model: string,
  defaultModelAlias: string,
): { readonly model?: string } =>
  model === defaultModelAlias ? {} : { model };
