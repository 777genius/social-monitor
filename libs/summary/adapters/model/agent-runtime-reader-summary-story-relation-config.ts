import type { AgentRuntimeReaderSummaryModelAdapterOptions } from "./agent-runtime-reader-summary-options";
import {
  nonEmptyOrFallback,
  positiveIntegerOrFallback,
} from "./agent-runtime-model-support";
import {
  activeReaderSummaryModel,
  activeReaderSummaryReasoningEffort,
  assertActiveReaderSummaryProvider,
  assertReaderSummaryBackendModel,
  resolveReaderSummaryBackendEffort,
  type ReaderSummaryGenerationBackend,
} from "./active-reader-summary-generation-profile";

export type AgentRuntimeReaderSummaryStoryRelationVerifierOptions = Pick<
  AgentRuntimeReaderSummaryModelAdapterOptions,
  "client" | "agentProvider" | "providerInstanceId" | "verifiedAttestationSink" |
  "reasoningEffort"
> & {
  readonly model?: string;
  readonly modelBackend?: ReaderSummaryGenerationBackend;
  readonly promptVersion?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly relatedTopicPromptVersion?: string;
  readonly relatedTopicTimeoutMs?: number;
};

const defaultModel = activeReaderSummaryModel;
const defaultPromptVersion = "reader_summary.story_relation.agent_runtime.v3";
const defaultRelatedTopicPromptVersion = "reader_summary.related_topic_relation.agent_runtime.v1";
const defaultRelatedTopicTimeoutMs = 15_000;
const defaultTimeoutMs = 300_000;
const defaultMaxOutputTokens = 6_000;

/** Pure provider/model and bounded lane configuration; never executes a task. */
export const resolveStoryRelationVerifierConfig = (
  options: AgentRuntimeReaderSummaryStoryRelationVerifierOptions,
) => {
  const provider = assertActiveReaderSummaryProvider(options.agentProvider) ?? "codex";
  const model = options.model ?? defaultModel;
  const modelBackend = options.modelBackend ?? "openai-chatgpt";
  assertReaderSummaryBackendModel(modelBackend, model);
  const reasoningEffort = resolveReaderSummaryBackendEffort(
    modelBackend, options.reasoningEffort, activeReaderSummaryReasoningEffort, model);
  const promptVersion = nonEmptyOrFallback(
    options.promptVersion,
    defaultPromptVersion,
  );
  const relatedTopicPromptVersion = nonEmptyOrFallback(
    options.relatedTopicPromptVersion,
    defaultRelatedTopicPromptVersion,
  );
  const timeoutMs = positiveIntegerOrFallback(
    options.timeoutMs,
    defaultTimeoutMs,
  );
  const maxOutputTokens = positiveIntegerOrFallback(
    options.maxOutputTokens,
    defaultMaxOutputTokens,
  );
  const relatedTopicTimeoutMs = positiveIntegerOrFallback(
    options.relatedTopicTimeoutMs,
    defaultRelatedTopicTimeoutMs,
  );
  return {
    provider,
    model,
    modelBackend,
    reasoningEffort,
    promptVersion,
    relatedTopicPromptVersion,
    timeoutMs,
    maxOutputTokens,
    relatedTopicTimeoutMs,
  };
};
