import { buildAgentRuntimeStoryRelationIdentity } from "./agent-runtime-reader-summary-story-relation-identity";
import { projectAgentRuntimeStoryRelationLaneContract } from "./agent-runtime-reader-summary-story-relation-lane-policy";
import type {
  AgentRuntimeTaskCommand,
  ReaderSummaryStoryRelationVerifierInput,
} from "../../ports";
import {
  mimoReaderSummaryBackend,
  readerSummaryRouteControls,
  type ReaderSummaryGenerationBackend,
} from "./active-reader-summary-generation-profile";

export const buildAgentRuntimeStoryRelationCommand = (
  params: Readonly<{
    input: ReaderSummaryStoryRelationVerifierInput;
    provider: "codex";
    providerInstanceId?: string;
    model: string;
    modelBackend: ReaderSummaryGenerationBackend;
    reasoningEffort: string;
    promptVersion: string;
    relatedTopicPromptVersion: string;
    timeoutMs: number;
    relatedTopicTimeoutMs: number;
    maxOutputTokens: number;
  }>,
): AgentRuntimeTaskCommand => {
  const input = params.input;
  const identity = buildAgentRuntimeStoryRelationIdentity(input);
  const lane = projectAgentRuntimeStoryRelationLaneContract(input, params);
  return {
    requestId: identity.requestId,
    tenantId: input.tenantId,
    workspaceId: input.workspaceId,
    correlationId: identity.correlationId,
    provider: params.provider,
    providerInstanceId: params.providerInstanceId,
    purpose: lane.purpose,
    systemPrompt: lane.systemPrompt,
    prompt: lane.prompt,
    outputSchema: lane.outputSchema,
    controls: {
      interactive: false,
      outputSchemaName: lane.outputSchemaName,
      schemaVersion: lane.schemaVersion,
      model: params.model,
      ...(params.modelBackend === mimoReaderSummaryBackend
        ? { modelBackend: params.modelBackend, toolsEnabled: false, toolPolicy: "none" }
        : {}),
      ...readerSummaryRouteControls(params.modelBackend, params.reasoningEffort),
      maxOutputTokens: params.maxOutputTokens,
    },
    timeoutMs: lane.timeoutMs,
    metadata: lane.metadata,
  };
};
