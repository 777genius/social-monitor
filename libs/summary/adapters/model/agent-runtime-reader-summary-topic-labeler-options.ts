import type { AgentRuntimeClientPort } from "../../ports";
import { parsePositiveInteger } from "./agent-runtime-model-support";
import {
  assertActiveReaderSummaryProvider,
  resolveReaderSummaryDailyTaskIdentityFromEnv,
  resolveReaderSummaryReasoningEffortFromEnv,
} from "./active-reader-summary-generation-profile";
import type {
  AgentRuntimeReaderSummaryTopicLabelerOptions,
} from "./agent-runtime-reader-summary-topic-labeler.adapter";

/** Composition-only env translation. The verifier adapter owns task execution. */
export const resolveAgentRuntimeReaderSummaryTopicLabelerOptions = (
  env: NodeJS.ProcessEnv,
  client: AgentRuntimeClientPort,
): AgentRuntimeReaderSummaryTopicLabelerOptions => ({
  client,
    agentProvider: assertActiveReaderSummaryProvider(
      env.AGENT_RUNTIME_PROVIDER,
    ),
  providerInstanceId: env.AGENT_RUNTIME_PROVIDER_INSTANCE_ID,
    ...resolveReaderSummaryDailyTaskIdentityFromEnv(
      env, env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_MODEL,
    ),
    reasoningEffort: resolveReaderSummaryReasoningEffortFromEnv(env),
  promptVersion: env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_PROMPT_VERSION,
  timeoutMs: parsePositiveInteger(
    env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_TIMEOUT_MS ??
      env.AGENT_RUNTIME_TIMEOUT_MS,
  ),
  maxOutputTokens: parsePositiveInteger(
    env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_MAX_OUTPUT_TOKENS,
  ),
  maxCandidates: parsePositiveInteger(
    env.AGENT_RUNTIME_READER_SUMMARY_TOPIC_LABELER_MAX_CANDIDATES,
  ),
});
