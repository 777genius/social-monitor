import type { AgentRuntimeClientPort } from "../../ports";
import { nonEmptyOrFallback, parsePositiveInteger, positiveIntegerOrFallback } from "./agent-runtime-model-support";
import {
  activeReaderSummaryModel,
  activeReaderSummaryReasoningEffort,
  assertReaderSummaryBackendModel,
  resolveReaderSummaryBackendEffort,
  resolveReaderSummaryDailyTaskIdentityFromEnv,
} from "./active-reader-summary-generation-profile";
import { resolveAgentRuntimeReaderSummaryTopicLabelerOptions } from "./agent-runtime-reader-summary-topic-labeler-options";
import type {
  AgentRuntimeReaderSummaryTopicRelationVerifierOptions,
} from "./agent-runtime-reader-summary-topic-relation-verifier.adapter";

const defaultModel = activeReaderSummaryModel;
const defaultPromptVersion = "reader_summary.topic_relation.agent_runtime.v3";
export const topicRelationVerifierDefaultTimeoutMs = 300_000;
const defaultMaxOutputTokens = 4_000;

/** Pure model identity and dispatch bounds, separate from verification and attestation. */
export const resolveTopicRelationVerifierConfig = (
  options: Pick<
    AgentRuntimeReaderSummaryTopicRelationVerifierOptions,
    "agentProvider" | "model" | "modelBackend" | "reasoningEffort" |
      "promptVersion" | "timeoutMs" | "maxOutputTokens"
  >,
) => {
  const provider = options.agentProvider ?? "codex";
  const model = options.model ?? defaultModel;
  const modelBackend = options.modelBackend ?? "openai-chatgpt";
  assertReaderSummaryBackendModel(modelBackend, model);
  const reasoningEffort = resolveReaderSummaryBackendEffort(
    modelBackend, options.reasoningEffort, activeReaderSummaryReasoningEffort, model);
  return {
    provider,
    model,
    modelBackend,
    reasoningEffort,
    promptVersion: nonEmptyOrFallback(options.promptVersion, defaultPromptVersion),
    timeoutMs: positiveIntegerOrFallback(options.timeoutMs, topicRelationVerifierDefaultTimeoutMs),
    maxOutputTokens: positiveIntegerOrFallback(options.maxOutputTokens, defaultMaxOutputTokens),
  } as const;
};

/** Related-topic env precedence stays separate from verification and attestation. */
export const resolveAgentRuntimeReaderSummaryTopicRelationVerifierOptions = (
  env: NodeJS.ProcessEnv,
  client: AgentRuntimeClientPort,
): AgentRuntimeReaderSummaryTopicRelationVerifierOptions => {
  const shared = resolveAgentRuntimeReaderSummaryTopicLabelerOptions(
    env,
    client,
  );

  return {
    client,
    agentProvider: shared.agentProvider,
    providerInstanceId: shared.providerInstanceId,
    reasoningEffort: shared.reasoningEffort,
    ...resolveReaderSummaryDailyTaskIdentityFromEnv(
      env, env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_RELATION_VERIFIER_MODEL,
    ),
    promptVersion:
      env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_RELATION_VERIFIER_PROMPT_VERSION,
    timeoutMs: parsePositiveInteger(
      env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_RELATION_VERIFIER_TIMEOUT_MS ??
        env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_TIMEOUT_MS ??
        env.AGENT_RUNTIME_TIMEOUT_MS,
    ),
    maxOutputTokens: parsePositiveInteger(
      env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_RELATION_VERIFIER_MAX_OUTPUT_TOKENS,
    ),
  };
};
