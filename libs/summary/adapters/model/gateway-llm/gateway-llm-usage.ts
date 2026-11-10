import type { LlmUsage } from "@agent-teams/account-gateway/llm";
import type { AgentRuntimeTaskResult } from "../../../ports";

/**
 * Preserve the gateway's settlement accounting independently from whether
 * the output can be trusted or attested. Incomplete token totals stay absent.
 */
export const gatewayLlmUsage = (
  usage: LlmUsage | null,
): Pick<AgentRuntimeTaskResult, "usage"> =>
  usage === null || usage.inputTokens === null || usage.outputTokens === null ? {} : {
    usage: {
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      totalTokens: usage.inputTokens + usage.outputTokens,
      estimatedCostUsd: 0,
      ...(usage.cachedInputTokens === null ? {} : { cachedInputTokens: usage.cachedInputTokens }),
      ...(usage.reasoningTokens === null ? {} : { reasoningTokens: usage.reasoningTokens }),
    },
  };
