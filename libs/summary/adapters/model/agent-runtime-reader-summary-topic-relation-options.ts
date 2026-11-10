import type { AgentRuntimeClientPort } from "../../ports";
import { parsePositiveInteger } from "./agent-runtime-model-support";
import { resolveReaderSummaryDailyTaskIdentityFromEnv } from "./active-reader-summary-generation-profile";
import { resolveAgentRuntimeReaderSummaryTopicLabelerOptions } from "./agent-runtime-reader-summary-topic-labeler-options";
import type {
  AgentRuntimeReaderSummaryTopicRelationVerifierOptions,
} from "./agent-runtime-reader-summary-topic-relation-verifier.adapter";

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
