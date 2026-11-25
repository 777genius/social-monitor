import type { LlmFailure } from "@agent-teams/account-gateway/llm";
import { gatewayLlmDispatchFreeRetry } from "./gateway-llm-dispatch-retry-policy";

/**
 * Interprets one rejected gateway execution without effects. Account-health
 * feedback and cost-safe replay are projected from the same failure evidence;
 * the dispatch coordinator still owns observation, backoff and attempt IDs.
 */
export const projectGatewayLlmFailedDispatch = (params: {
  readonly failure: LlmFailure;
  readonly retries: number;
  readonly maxRetries: number;
  readonly deadline: Date;
  readonly now: Date;
  readonly signal?: AbortSignal;
}): {
  readonly accountOutcome: "busy" | "unauthorized" | "other";
  readonly retryDecision: ReturnType<typeof gatewayLlmDispatchFreeRetry>;
} => ({
  accountOutcome: observation(params.failure),
  retryDecision: gatewayLlmDispatchFreeRetry({
    retry: params.failure.retry,
    retries: params.retries,
    maxRetries: params.maxRetries,
    deadlineMs: params.deadline.getTime(),
    nowMs: params.now.getTime(),
    signal: params.signal,
  }),
});

const observation = (failure: LlmFailure): "busy" | "unauthorized" | "other" =>
  failure.code === "busy" ? "busy" : failure.code === "unauthorized" ? "unauthorized" : "other";
