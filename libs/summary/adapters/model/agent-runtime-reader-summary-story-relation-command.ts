import { createHash } from "node:crypto";
import { readerSummaryScopeKey } from "../../domain";
import type {
  AgentRuntimeTaskCommand,
  ReaderSummaryStoryRelationVerifierInput,
} from "../../ports";
import { buildAgentRuntimeRequestId } from "./agent-runtime-model-support";
import {
  agentRuntimeReaderSummaryStoryRelationVerifierInstructions,
  agentRuntimeReaderSummaryIndependentNewsVerifierInstructions,
  agentRuntimeReaderSummaryStoryRelationVerifierJsonSchema,
  agentRuntimeReaderSummaryRelatedTopicVerifierInstructions,
  agentRuntimeReaderSummaryRelatedTopicVerifierJsonSchema,
  buildAgentRuntimeReaderSummaryStoryRelationVerifierPrompt,
  buildAgentRuntimeReaderSummaryRelatedTopicVerifierPrompt,
} from "./agent-runtime-reader-summary-story-relation-verifier-prompt";
import {
  activeReaderSummaryPurposes,
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
    const scopeKey = readerSummaryScopeKey(input.scope);
    const requestScopeKey = input.verificationLane === "safe_recall_shadow"
      ? `${scopeKey}:safe-recall-shadow`
      : input.verificationLane === "related_topic"
        ? `${scopeKey}:related-topic`
        : input.verificationLane === "independent_news"
          ? `${scopeKey}:independent-news:${createHash("sha256")
            .update(buildAgentRuntimeReaderSummaryStoryRelationVerifierPrompt(input))
            .digest("hex").slice(0, 24)}`
          : scopeKey;
    const relatedTopicLane = input.verificationLane === "related_topic";
    const command = {
      requestId: buildAgentRuntimeRequestId(
        relatedTopicLane
          ? "reader-summary-related-topic-relations"
          : "reader-summary-story-relations",
        input.tenantId,
        input.workspaceId,
        requestScopeKey,
        input.requestedAt,
      ),
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      correlationId: buildAgentRuntimeRequestId(
        relatedTopicLane
          ? "reader-summary-related-topic-relations-correlation"
          : "reader-summary-story-relations-correlation",
        input.tenantId,
        input.workspaceId,
        requestScopeKey,
        input.requestedAt,
      ),
      provider: params.provider,
      providerInstanceId: params.providerInstanceId,
      purpose: relatedTopicLane
        ? activeReaderSummaryPurposes.relatedTopicRelations
        : activeReaderSummaryPurposes.storyRelations,
      systemPrompt: relatedTopicLane
        ? agentRuntimeReaderSummaryRelatedTopicVerifierInstructions
        : input.verificationLane === "independent_news"
          ? agentRuntimeReaderSummaryIndependentNewsVerifierInstructions
          : agentRuntimeReaderSummaryStoryRelationVerifierInstructions,
      prompt: relatedTopicLane
        ? buildAgentRuntimeReaderSummaryRelatedTopicVerifierPrompt(input)
        : buildAgentRuntimeReaderSummaryStoryRelationVerifierPrompt(input),
      outputSchema: relatedTopicLane
        ? agentRuntimeReaderSummaryRelatedTopicVerifierJsonSchema
        : agentRuntimeReaderSummaryStoryRelationVerifierJsonSchema,
      controls: {
        interactive: false,
        outputSchemaName: relatedTopicLane
          ? "social_monitor_reader_summary_related_topic_relations"
          : "social_monitor_reader_summary_story_relations",
        schemaVersion: relatedTopicLane
          ? "reader_summary.related_topic_relation.v1"
          : "reader_summary.story_relation.v1",
        model: params.model,
        ...(params.modelBackend === mimoReaderSummaryBackend
          ? { modelBackend: params.modelBackend, toolsEnabled: false, toolPolicy: "none" }
          : {}),
        ...readerSummaryRouteControls(params.modelBackend, params.reasoningEffort),
        maxOutputTokens: params.maxOutputTokens,
      },
      timeoutMs: relatedTopicLane
        ? (input.timeoutMs ?? params.relatedTopicTimeoutMs)
        : input.verificationLane !== undefined
          ? (input.timeoutMs ?? params.timeoutMs)
          : params.timeoutMs,
      metadata: {
        adapter: "agent-runtime-reader-summary-story-relation-verifier",
        promptVersion: relatedTopicLane
          ? params.relatedTopicPromptVersion
          : input.verificationLane === "independent_news"
            ? `${params.promptVersion}.independent_news.v1`
            : params.promptVersion,
        ...(relatedTopicLane
          ? { taskRole: "related_topic_relation" }
          : {}),
        ...(input.verificationLane === undefined
          ? {}
          : { verificationLane: input.verificationLane }),
      },
    } as const;
  return command;
};
