import { READER_SUMMARY_TOPIC_MAP_MAX_NODES } from "../../domain";
import type { AgentRuntimeClientPort } from "../../ports";
import {
  activeReaderSummaryModel,
  activeReaderSummaryProvider,
  activeReaderSummaryReasoningEffort,
  assertReaderSummaryBackendModel,
  resolveReaderSummaryBackendEffort,
  type ReaderSummaryGenerationBackend,
} from "./active-reader-summary-generation-profile";
import { nonEmptyOrFallback, positiveIntegerOrFallback } from "./agent-runtime-model-support";
import type { VerifiedReaderSummaryExecutionAttestationSink } from "./reader-summary-execution-attestation";

/**
 * Provider and model identity are validated at construction, before any task
 * dispatch. Environment lookup stays in the composition-only options resolver.
 */
export type AgentRuntimeReaderSummaryTopicLabelerOptions = {
  readonly client: AgentRuntimeClientPort;
  readonly agentProvider?: typeof activeReaderSummaryProvider;
  readonly providerInstanceId?: string;
  readonly model?: string;
  readonly modelBackend?: ReaderSummaryGenerationBackend;
  /** high for Codex and MiMo, the route effort for a gateway backend. */
  readonly reasoningEffort?: string;
  readonly promptVersion?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly maxCandidates?: number;
  readonly verifiedAttestationSink?: VerifiedReaderSummaryExecutionAttestationSink;
};

export type AgentRuntimeTopicLabelerSettings = Readonly<{
  agentProvider: typeof activeReaderSummaryProvider;
  providerInstanceId?: string;
  model: string;
  modelBackend: ReaderSummaryGenerationBackend;
  reasoningEffort: string;
  promptVersion: string;
  timeoutMs: number;
  maxOutputTokens: number;
  maxCandidates: number;
}>;

const defaultPromptVersion = "reader_summary.topic_map.agent_runtime.v21";
export const defaultTimeoutMs = 600_000;
const defaultMaxOutputTokens = 6_000;
const defaultMaxCandidates = 30;

/** Immutable dispatch policy; never accepts model-supplied or per-task config. */
export const resolveAgentRuntimeTopicLabelerSettings = (
  options: AgentRuntimeReaderSummaryTopicLabelerOptions,
): AgentRuntimeTopicLabelerSettings => {
  const model = options.model ?? activeReaderSummaryModel;
  const modelBackend = options.modelBackend ?? "openai-chatgpt";
  assertReaderSummaryBackendModel(modelBackend, model);

  return {
    agentProvider: options.agentProvider ?? activeReaderSummaryProvider,
    providerInstanceId: options.providerInstanceId,
    model,
    modelBackend,
    reasoningEffort: resolveReaderSummaryBackendEffort(
      modelBackend,
      options.reasoningEffort,
      activeReaderSummaryReasoningEffort,
      model,
    ),
    promptVersion: nonEmptyOrFallback(
      options.promptVersion,
      defaultPromptVersion,
    ),
    timeoutMs: positiveIntegerOrFallback(options.timeoutMs, defaultTimeoutMs),
    maxOutputTokens: positiveIntegerOrFallback(
      options.maxOutputTokens,
      defaultMaxOutputTokens,
    ),
    maxCandidates: Math.min(
      positiveIntegerOrFallback(options.maxCandidates, defaultMaxCandidates),
      READER_SUMMARY_TOPIC_MAP_MAX_NODES,
    ),
  };
};
