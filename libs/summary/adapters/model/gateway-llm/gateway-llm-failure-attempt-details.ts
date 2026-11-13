import type { LlmFailure } from "@agent-teams/account-gateway/llm";
import type { GatewayLlmAttemptIdentity } from "./gateway-llm-attempts";

/**
 * Gateway-side attempt provenance is diagnostic metadata only. Keep it
 * independent of the sanitized public failure taxonomy and rejected model
 * output paths so neither changes the meaning of paid retry or attestation.
 */
export const gatewayLlmFailureAttemptDetails = (
  failure: LlmFailure,
  identity: GatewayLlmAttemptIdentity,
): Readonly<Record<string, string>> => {
  const retry = failure.retry;
  return {
    gatewayCode: failure.code,
    gatewayEffect: failure.effect,
    gatewayRetry: retry.kind,
    gatewayRetryAfterMs: retry.kind === "never" ? "0" : String(retry.afterMs),
    gatewayMayDuplicateCost: retry.kind === "new_attempt"
      ? String(retry.mayDuplicateCost) : "false",
    gatewayCleanup: failure.cleanup,
    gatewayTaskId: identity.taskId,
    gatewayAttempt: String(identity.attempt),
    ...(failure.traceRef === undefined ? {} : { gatewayTraceRef: failure.traceRef }),
    ...(failure.execution === null ? {} : {
      gatewayExecutionRef: failure.execution.executionRef,
      gatewayRequestRef: failure.execution.requestRef,
      gatewayAccountRef: failure.execution.accountRef,
    }),
  };
};
