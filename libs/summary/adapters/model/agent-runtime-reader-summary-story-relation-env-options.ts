import type { AgentRuntimeClientPort } from "../../ports";
import { parsePositiveInteger } from "./agent-runtime-model-support";
import { resolveAgentRuntimeReaderSummaryModelOptions } from "./agent-runtime-reader-summary-options";
import { resolveReaderSummaryDailyTaskIdentityFromEnv } from "./active-reader-summary-generation-profile";
import type { AgentRuntimeReaderSummaryStoryRelationVerifierOptions } from "./agent-runtime-reader-summary-story-relation-config";

/** Environment precedence belongs to configuration, not response verification. */
export const resolveAgentRuntimeReaderSummaryStoryRelationVerifierOptions = (
  env: NodeJS.ProcessEnv,
  client: AgentRuntimeClientPort,
): AgentRuntimeReaderSummaryStoryRelationVerifierOptions => {
  const shared = resolveAgentRuntimeReaderSummaryModelOptions(env, client);
  return {
    client,
    agentProvider: shared.agentProvider,
    providerInstanceId: shared.providerInstanceId,
    reasoningEffort: shared.reasoningEffort,
    ...resolveReaderSummaryDailyTaskIdentityFromEnv(
      env, env.AGENT_RUNTIME_READER_SUMMARY_STORY_RELATION_VERIFIER_MODEL,
    ),
    promptVersion:
      env.AGENT_RUNTIME_READER_SUMMARY_STORY_RELATION_VERIFIER_PROMPT_VERSION,
    relatedTopicPromptVersion:
      env.AGENT_RUNTIME_READER_SUMMARY_RELATED_TOPIC_VERIFIER_PROMPT_VERSION,
    relatedTopicTimeoutMs: parsePositiveInteger(
      env.AGENT_RUNTIME_READER_SUMMARY_RELATED_TOPIC_VERIFIER_TIMEOUT_MS,
    ),
    timeoutMs: parsePositiveInteger(
      env.AGENT_RUNTIME_READER_SUMMARY_STORY_RELATION_VERIFIER_TIMEOUT_MS ??
        env.AGENT_RUNTIME_READER_SUMMARY_MODEL_TIMEOUT_MS ??
        env.AGENT_RUNTIME_TIMEOUT_MS,
    ),
    maxOutputTokens: parsePositiveInteger(
      env.AGENT_RUNTIME_READER_SUMMARY_STORY_RELATION_VERIFIER_MAX_OUTPUT_TOKENS,
    ),
  };
};
