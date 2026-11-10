import { agentRuntimeReaderSummaryTopicLabelerJsonSchema } from "./agent-runtime-reader-summary-topic-labeler-response-schema";
import { readerSummaryScopeKey } from "../../domain";
import type {
  AgentRuntimeTaskCommand,
  ReaderSummaryTopicLabelerInput,
  ReaderSummaryTopicMapAttemptContext,
} from "../../ports";
import { buildAgentRuntimeRequestId } from "./agent-runtime-model-support";
import {
  agentRuntimeReaderSummaryTopicLabelerInstructions,
  buildAgentRuntimeReaderSummaryTopicLabelPrompt,
} from "./agent-runtime-reader-summary-topic-labeler-prompt";
import {
  activeReaderSummaryPurposes,
  mimoReaderSummaryBackend,
  readerSummaryRouteControls,
  type ReaderSummaryGenerationBackend,
} from "./active-reader-summary-generation-profile";

export const buildAgentRuntimeTopicLabelCommand = (
  params: Readonly<{
  input: ReaderSummaryTopicLabelerInput;
  candidates: ReaderSummaryTopicLabelerInput["candidates"];
  attemptContext: ReaderSummaryTopicMapAttemptContext;
  agentProvider: "codex";
  providerInstanceId?: string;
  model: string;
  modelBackend: ReaderSummaryGenerationBackend;
  reasoningEffort: string;
  promptVersion: string;
  timeoutMs: number;
  maxOutputTokens: number;
}>,
): AgentRuntimeTaskCommand => {
  const { input, attemptContext, candidates } = params;
  const command = {
      requestId: buildAgentRuntimeRequestId(
        `reader-summary-topic-map-attempt-${attemptContext.attemptNumber}`,
        input.tenantId,
        input.workspaceId,
        readerSummaryScopeKey(input.scope),
        input.requestedAt,
      ),
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      correlationId: buildAgentRuntimeRequestId(
        "reader-summary-topic-map-correlation",
        input.tenantId,
        input.workspaceId,
        readerSummaryScopeKey(input.scope),
        input.requestedAt,
      ),
      provider: params.agentProvider,
      providerInstanceId: params.providerInstanceId,
      purpose: activeReaderSummaryPurposes.topicLabel,
      systemPrompt: agentRuntimeReaderSummaryTopicLabelerInstructions,
      prompt: buildAgentRuntimeReaderSummaryTopicLabelPrompt(
        input,
        candidates,
        attemptContext,
      ),
      outputSchema: agentRuntimeReaderSummaryTopicLabelerJsonSchema,
      controls: {
        interactive: false,
        outputSchemaName: "social_monitor_reader_summary_topic_map_labels",
        schemaVersion: "reader_summary.topic_map.v1",
        model: params.model,
        ...(params.modelBackend === mimoReaderSummaryBackend
          ? { modelBackend: params.modelBackend, toolsEnabled: false, toolPolicy: "none" }
          : {}),
        ...readerSummaryRouteControls(params.modelBackend, params.reasoningEffort),
        maxOutputTokens: params.maxOutputTokens,
      },
      timeoutMs: params.timeoutMs,
      metadata: {
        adapter: "agent-runtime-reader-summary-topic-labeler",
        promptVersion: params.promptVersion,
        attemptNumber: String(attemptContext.attemptNumber),
        totalAttempts: String(attemptContext.totalAttempts),
      },
    } as const;
  return command;
};
