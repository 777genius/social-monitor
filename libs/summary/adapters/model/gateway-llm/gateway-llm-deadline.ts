import { LLM_MAX_DEADLINE_MS } from "@agent-teams/account-gateway/llm";

/** Keep the original stream open briefly instead of paying for a replacement.
 * The SDK cannot recover output after it cancels a stream: status readback
 * records effects only. Both admission and cancellation use this hard bound.
 */
export const gatewayLlmSettlementGraceMs = 30_000;

export const gatewayLlmDeadline = (startedAt: number, timeoutMs: number): Date =>
  new Date(startedAt + Math.min(timeoutMs + gatewayLlmSettlementGraceMs,
    LLM_MAX_DEADLINE_MS));
