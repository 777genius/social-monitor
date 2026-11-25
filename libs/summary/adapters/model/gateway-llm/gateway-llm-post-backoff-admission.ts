import type { LlmUsage } from "@agent-teams/account-gateway/llm";
import type { AgentRuntimeTaskResult } from "../../../ports";
import { gatewayLlmFailureShape } from "./gateway-llm-failure-taxonomy";
import { gatewayLlmUsage } from "./gateway-llm-usage";

/**
 * Check the deadline and cancellation again after a dispatch-free backoff.
 * The dispatcher may allocate a new account/attempt ONLY when this returns null.
 * An expired wait cannot be converted into a second paid provider request.
 */
export const gatewayLlmPostBackoffStop = (params: {
  readonly resumedAt: Date;
  readonly startedAt: number;
  readonly deadline: Date;
  readonly signal?: AbortSignal;
  readonly usage: LlmUsage | null;
}): AgentRuntimeTaskResult | null => {
  const cancelled = params.signal?.aborted === true;
  if (!cancelled && params.resumedAt.getTime() < params.deadline.getTime()) {
    return null;
  }
  // Cancellation wins a same-instant deadline race, as in the old dispatcher.
  const shape = gatewayLlmFailureShape(cancelled ? "cancelled" : "deadline");
  return {
    status: "failed",
    warnings: [],
    failure: {
      code: shape.code,
      safeMessage: shape.safeMessage,
      retryable: false,
      reconnectRequired: shape.reconnectRequired === true,
      causeCategory: shape.causeCategory,
      details: { gatewayEffect: "not_dispatched" },
    },
    durationMs: params.resumedAt.getTime() - params.startedAt,
    ...gatewayLlmUsage(params.usage),
  };
};
