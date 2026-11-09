import type { AgentRuntimeClientPort, AgentRuntimeProvider } from "../../ports";
import { parsePositiveInteger } from "./agent-runtime-model-support";
import {
  resolveReaderSummaryDailyTaskIdentityFromEnv,
  resolveReaderSummaryGenerationIdentityFromEnv,
  resolveReaderSummaryReasoningEffortFromEnv,
  type ReaderSummaryGenerationBackend,
} from "./active-reader-summary-generation-profile";

/** Env-to-adapter translation is composition/config policy, not a model execution concern. */
export type AgentRuntimeSummaryModelAdapterOptions = {
  readonly client: AgentRuntimeClientPort;
  readonly agentProvider?: AgentRuntimeProvider;
  readonly providerInstanceId?: string;
  readonly model?: string;
  readonly modelBackend?: ReaderSummaryGenerationBackend;
  readonly reasoningEffort?: string;
  readonly promptVersion?: string;
  readonly evalDatasetVersion?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly inputTokenDivisor?: number;
};

export const defaultAgentRuntimeSummaryModel = "agent-runtime-summary";

export const resolveAgentRuntimeSummaryModelOptions = (
  env: NodeJS.ProcessEnv,
  client: AgentRuntimeClientPort,
): AgentRuntimeSummaryModelAdapterOptions => ({
  client,
  agentProvider: parseAgentRuntimeProvider(env.AGENT_RUNTIME_PROVIDER),
  providerInstanceId: env.AGENT_RUNTIME_PROVIDER_INSTANCE_ID,
  model: env.AGENT_RUNTIME_SUMMARY_MODEL,
  ...resolveSummaryGatewayIdentity(env),
  promptVersion: env.AGENT_RUNTIME_SUMMARY_PROMPT_VERSION,
  evalDatasetVersion: env.SUMMARY_EVAL_DATASET_VERSION,
  timeoutMs: parsePositiveInteger(
    env.AGENT_RUNTIME_SUMMARY_TIMEOUT_MS ?? env.AGENT_RUNTIME_TIMEOUT_MS,
  ),
  maxOutputTokens: parsePositiveInteger(
    env.AGENT_RUNTIME_SUMMARY_MAX_OUTPUT_TOKENS,
  ),
});

const resolveSummaryGatewayIdentity = (env: NodeJS.ProcessEnv): Partial<AgentRuntimeSummaryModelAdapterOptions> => {
  if (env.AGENT_RUNTIME_TRANSPORT?.trim() !== "gateway-llm") return {};
  const identity = resolveReaderSummaryGenerationIdentityFromEnv(env);
  const purposeModel = env.AGENT_RUNTIME_SUMMARY_MODEL?.trim();
  const route = resolveReaderSummaryDailyTaskIdentityFromEnv(env,
    purposeModel === defaultAgentRuntimeSummaryModel ? undefined : purposeModel);
  const reasoningEffort = resolveReaderSummaryReasoningEffortFromEnv(env) ?? "default";
  const requestedEffort = env.AGENT_RUNTIME_SUMMARY_REASONING_EFFORT?.trim();
  if (requestedEffort && requestedEffort !== reasoningEffort) {
    throw new Error("Gateway summary reasoning effort conflicts with purpose policy");
  }
  return { agentProvider: identity.provider, model: route.model,
    modelBackend: route.modelBackend, reasoningEffort };
};

const parseAgentRuntimeProvider = (
  value: string | undefined,
): AgentRuntimeProvider | undefined => {
  if (value === undefined || value.trim().length === 0) {
    return undefined;
  }
  if (value === "codex" || value === "claude") {
    return value;
  }

  throw new Error('AGENT_RUNTIME_PROVIDER must be "codex" or "claude"');
};
