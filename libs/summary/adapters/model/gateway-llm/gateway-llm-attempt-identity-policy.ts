import { createHash } from "node:crypto";

export type GatewayLlmAttemptIdentity = {
  /** Gateway invocation key of the logical task; a gateway reference. */
  readonly taskId: string;
  /** 1-based. Every value is a new execution and may be paid again. */
  readonly attempt: number;
};

/** "sm" plus 43 base64url characters: inside the gateway reference grammar. */
export const gatewayLlmTaskId = (runId: string, requestId: string): string => {
  // A NUL in either component would alias a different (run, request) pair.
  if (runId.includes("\u0000") || requestId.includes("\u0000")) {
    throw new Error("Gateway llm attempt identity contains a reserved delimiter");
  }
  if (/[\uD800-\uDFFF]/u.test(runId) || /[\uD800-\uDFFF]/u.test(requestId)) {
    // UTF-8 replaces isolated surrogates with U+FFFD, aliasing distinct task keys.
    throw new Error("Gateway llm attempt identity contains ill-formed Unicode");
  }
  return `sm${createHash("sha256").update(`${runId}\u0000${requestId}`, "utf8")
    .digest("base64url")}`;
};

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
