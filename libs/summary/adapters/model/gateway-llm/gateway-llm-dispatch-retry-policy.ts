import type { LlmFailure } from "@agent-teams/account-gateway/llm";

type GatewayReplayKind = "same_attempt" | "new_attempt";

/**
 * Admit only dispatch-free repeats. A possibly paid call is never retried,
 * even with remaining budget. This policy does no I/O or attempt allocation.
 */
export const gatewayLlmDispatchFreeRetry = (params: {
  readonly retry: LlmFailure["retry"];
  readonly retries: number;
  readonly maxRetries: number;
  readonly deadlineMs: number;
  readonly nowMs: number;
  readonly signal?: AbortSignal;
}): { readonly afterMs: number; readonly replay: GatewayReplayKind | null } => {
  const { retry } = params;
  const afterMs = retry.kind === "never" ? 0 : retry.afterMs;
  const remainingMs = params.deadlineMs - params.nowMs;
  // SDK types are compile-time only: never schedule an unbounded/negative retry
  // if a provider response or an injected clock violates the wire contract.
  if (!Number.isSafeInteger(params.retries) || params.retries < 0 ||
      !Number.isSafeInteger(params.maxRetries) || params.maxRetries < 0 ||
      !Number.isFinite(afterMs) || afterMs < 0 || !Number.isFinite(remainingMs)) {
    return { afterMs: 0, replay: null };
  }
  const replay = retry.kind === "same_attempt" ||
    (retry.kind === "new_attempt" && !retry.mayDuplicateCost);
  if (!replay || params.retries >= params.maxRetries ||
      params.signal?.aborted === true ||
      remainingMs <= afterMs) {
    return { afterMs, replay: null };
  }
  return { afterMs, replay: retry.kind as GatewayReplayKind };
};
