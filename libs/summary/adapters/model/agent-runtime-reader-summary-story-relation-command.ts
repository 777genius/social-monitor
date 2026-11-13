import { buildAgentRuntimeStoryRelationIdentity } from "./agent-runtime-reader-summary-story-relation-identity";
import type {
  AgentRuntimeTaskCommand,
  ReaderSummaryStoryRelationVerifierInput,
} from "../../ports";
import {
  agentRuntimeReaderSummaryStoryRelationVerifierInstructions,
  agentRuntimeReaderSummaryIndependentNewsVerifierInstructions,
} from "./agent-runtime-reader-summary-story-relation-instructions";
import { agentRuntimeReaderSummaryStoryRelationVerifierJsonSchema } from "./agent-runtime-reader-summary-story-relation-schema";
import {
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
    const identity = buildAgentRuntimeStoryRelationIdentity(input);
    const relatedTopicLane = identity.relatedTopicLane;
    const command = {
      requestId: identity.requestId,
      tenantId: input.tenantId,
      workspaceId: input.workspaceId,
      correlationId: identity.correlationId,
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
