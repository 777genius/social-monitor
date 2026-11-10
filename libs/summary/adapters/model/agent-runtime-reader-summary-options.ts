import type { AgentRuntimeClientPort, AgentRuntimeProvider } from "../../ports";
import { parsePositiveInteger } from "./agent-runtime-model-support";
import {
  resolveReaderSummaryGenerationIdentityFromEnv,
  resolveReaderSummaryReasoningEffortFromEnv,
  type ReaderSummaryGenerationBackend,
  type FrozenLegacyReaderSummaryRecoveryContract,
} from "./active-reader-summary-generation-profile";
import { assertNoReaderSummaryPromptReleaseOverride } from "./openai-responses-reader-summary-prompt";
import type { VerifiedReaderSummaryExecutionAttestationSink } from "./reader-summary-execution-attestation";

export type AgentRuntimeReaderSummaryModelAdapterOptions = {
  readonly client: AgentRuntimeClientPort;
  readonly agentProvider?: AgentRuntimeProvider;
  readonly providerInstanceId?: string;
  readonly model?: string;
  readonly modelBackend?: ReaderSummaryGenerationBackend;
  /**
   * high for gpt-5.6-sol and MiMo, xhigh for legacy recovery, the route effort
   * for a gateway backend or gateway-only Codex model.
   */
  readonly reasoningEffort?: string;
  readonly legacyRecoveryContract?: FrozenLegacyReaderSummaryRecoveryContract;
  readonly evalDatasetVersion?: string;
  readonly timeoutMs?: number;
  readonly maxOutputTokens?: number;
  readonly inputTokenDivisor?: number;
  readonly verifiedAttestationSink?: VerifiedReaderSummaryExecutionAttestationSink;
};

export const resolveAgentRuntimeReaderSummaryModelOptions = (
  env: NodeJS.ProcessEnv,
  client: AgentRuntimeClientPort,
): AgentRuntimeReaderSummaryModelAdapterOptions => {
  assertNoReaderSummaryPromptReleaseOverride({
    environmentName: "AGENT_RUNTIME_READER_SUMMARY_PROMPT_VERSION",
    value: env.AGENT_RUNTIME_READER_SUMMARY_PROMPT_VERSION,
  });

  const generationIdentity = resolveReaderSummaryGenerationIdentityFromEnv(env);
  return {
    client,
    agentProvider: generationIdentity.provider,
    providerInstanceId: env.AGENT_RUNTIME_PROVIDER_INSTANCE_ID,
    model: generationIdentity.model,
    modelBackend: generationIdentity.backend,
    reasoningEffort: resolveReaderSummaryReasoningEffortFromEnv(env),
    evalDatasetVersion: env.READER_SUMMARY_EVAL_DATASET_VERSION,
    timeoutMs: parsePositiveInteger(
      env.AGENT_RUNTIME_READER_SUMMARY_TIMEOUT_MS ??
        env.AGENT_RUNTIME_TIMEOUT_MS,
    ),
    maxOutputTokens: parsePositiveInteger(
      env.AGENT_RUNTIME_READER_SUMMARY_MAX_OUTPUT_TOKENS,
    ),
  };
};
