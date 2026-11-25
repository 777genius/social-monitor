import type { AgentRuntimeClientPort } from "../../ports";
import type { AgentRuntimePromotionPresentationV3BuilderOptions } from "./agent-runtime-promotion-presentation-v3-options";
import { parsePositiveInteger } from "./agent-runtime-model-support";
import { mimoPresentationReasoningEffort, mimoReaderSummaryBackend } from "./reader-summary-runtime-contract";
import { assertActiveReaderSummaryProvider } from "./reader-summary-generation-identity-core";
import {
  resolveReaderSummaryDailyTaskIdentityFromEnv,
  resolveReaderSummaryReasoningEffortFromEnv,
} from "./reader-summary-generation-env-resolution";

/** Environment parsing remains a composition concern, separate from task execution. */
export const resolveAgentRuntimePromotionPresentationV3BuilderOptions = (
  env: NodeJS.ProcessEnv,
  client: AgentRuntimeClientPort,
): AgentRuntimePromotionPresentationV3BuilderOptions => {
  const identity = resolveReaderSummaryDailyTaskIdentityFromEnv(env,
    env.AGENT_RUNTIME_READER_SUMMARY_PRESENTATION_MODEL);
  const sharedEffort = resolveReaderSummaryReasoningEffortFromEnv(env);
  return {
    client,
    agentProvider: assertActiveReaderSummaryProvider(env.AGENT_RUNTIME_PROVIDER),
    providerInstanceId: env.AGENT_RUNTIME_PROVIDER_INSTANCE_ID,
    ...identity,
    reasoningEffort: identity.modelBackend === mimoReaderSummaryBackend
      ? mimoPresentationReasoningEffort : sharedEffort,
    timeoutMs: parsePositiveInteger(
      env.AGENT_RUNTIME_READER_SUMMARY_PRESENTATION_TIMEOUT_MS ??
        env.AGENT_RUNTIME_TIMEOUT_MS,
    ),
    maxOutputTokens: parsePositiveInteger(
      env.AGENT_RUNTIME_READER_SUMMARY_PRESENTATION_MAX_OUTPUT_TOKENS,
    ),
  };
};
