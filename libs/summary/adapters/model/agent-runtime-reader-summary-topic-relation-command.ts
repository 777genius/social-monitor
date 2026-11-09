import { agentRuntimeReaderSummaryTopicRelationVerifierJsonSchema } from "./agent-runtime-reader-summary-topic-relation-response-schema";
import { readerSummaryScopeKey } from "../../domain";
import type {
  AgentRuntimeTaskCommand,
  ReaderSummaryTopicMapAttemptContext,
  ReaderSummaryTopicRelationVerifierInput,
} from "../../ports";
import { buildAgentRuntimeRequestId } from "./agent-runtime-model-support";
import {
  agentRuntimeReaderSummaryTopicRelationVerifierInstructions,
  buildAgentRuntimeReaderSummaryTopicRelationVerifierPrompt,
} from "./agent-runtime-reader-summary-topic-relation-verifier-prompt";
import {
  activeReaderSummaryPurposes,
  mimoReaderSummaryBackend,
  readerSummaryRouteControls,
  type ReaderSummaryGenerationBackend,
} from "./active-reader-summary-generation-profile";

export const buildAgentRuntimeTopicRelationCommand = (
  params: Readonly<{
  input: ReaderSummaryTopicRelationVerifierInput;
  attemptContext: ReaderSummaryTopicMapAttemptContext;
  provider: "codex";
  providerInstanceId?: string;
  model: string;
  modelBackend: ReaderSummaryGenerationBackend;
  reasoningEffort: string;
  promptVersion: string;
  timeoutMs: number;
  maxOutputTokens: number;
}>,
): AgentRuntimeTaskCommand => {
  const { input, attemptContext } = params;
  const command = {
      requestId: buildAgentRuntimeRequestId(
        `reader-summary-topic-relations-attempt-${attemptContext.attemptNumber}`,
        input.tenantId,
        input.workspaceId,
        readerSummaryScopeKey(input.scope),
        input.requestedAt,
      ),
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      correlationId: buildAgentRuntimeRequestId(
        "reader-summary-topic-relations-correlation",
        input.tenantId,
        input.workspaceId,
        readerSummaryScopeKey(input.scope),
        input.requestedAt,
      ),
      provider: params.provider,
      providerInstanceId: params.providerInstanceId,
      purpose: activeReaderSummaryPurposes.topicRelations,
      systemPrompt: agentRuntimeReaderSummaryTopicRelationVerifierInstructions,
      prompt: buildAgentRuntimeReaderSummaryTopicRelationVerifierPrompt(input),
      outputSchema: agentRuntimeReaderSummaryTopicRelationVerifierJsonSchema,
      controls: {
        interactive: false,
        outputSchemaName: "social_monitor_reader_summary_topic_relations",
        schemaVersion: "reader_summary.topic_relation.v1",
        model: params.model,
        ...(params.modelBackend === mimoReaderSummaryBackend
          ? { modelBackend: params.modelBackend, toolsEnabled: false, toolPolicy: "none" }
          : {}),
        ...readerSummaryRouteControls(params.modelBackend, params.reasoningEffort),
        maxOutputTokens: params.maxOutputTokens,
      },
      timeoutMs: params.timeoutMs,
      metadata: {
        adapter: "agent-runtime-reader-summary-topic-relation-verifier",
        promptVersion: params.promptVersion,
        attemptNumber: String(attemptContext.attemptNumber),
        totalAttempts: String(attemptContext.totalAttempts),
      },
    } as const;
  return command;
};
