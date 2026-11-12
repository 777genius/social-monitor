import { createHash } from "node:crypto";
import type { GatewayLlmAttemptIdentity } from "./gateway-llm-attempts";

/** "sm" plus 43 base64url characters: inside the gateway reference grammar. */
export const gatewayLlmTaskId = (runId: string, requestId: string): string =>
  `sm${createHash("sha256").update(`${runId}\u0000${requestId}`, "utf8")
    .digest("base64url")}`;

export const gatewayLlmMaxAttempt = 9_999;

/**
 * Pure admission decision: reject invalid/consumed identities before the
 * run-scoped source records an attempt. Never mutates the issued ledger.
 */
export const nextGatewayLlmAttemptIdentity = (
  runId: string,
  requestId: string,
  issued: ReadonlyMap<string, number>,
): GatewayLlmAttemptIdentity => {
  if (requestId.length === 0) {
    throw new Error("Gateway llm attempt requires a request id");
  }
  const taskId = gatewayLlmTaskId(runId, requestId);
  const attempt = (issued.get(taskId) ?? 0) + 1;
  if (attempt > gatewayLlmMaxAttempt) {
    throw new Error("Gateway llm attempt budget is exhausted");
  }
  return { taskId, attempt };
};
