import { createHash } from "node:crypto";

export type GatewayLlmAttemptIdentity = {
  /** Gateway invocation key of the logical task; a gateway reference. */
  readonly taskId: string;
  /** 1-based. Every value is a new execution and may be paid again. */
  readonly attempt: number;
};

/**
 * Allocates gateway attempt identities. A value is never handed out twice:
 * reusing an attempt for a different intent is a gateway conflict, and
 * reusing a consumed one yields output_lost, because the gateway keeps no
 * output for readback.
 */
export interface GatewayLlmAttemptSource {
  next(requestId: string): GatewayLlmAttemptIdentity;
}

export const gatewayLlmMaxAttempt = 9_999;

/**
 * Attempt identities scoped to one process run. Agent-runtime request ids are
 * deterministic, so a rerun of the same day would collide with the previous
 * run's executions; the run id gives every run a fresh invocation namespace.
 * Crash replay of a dispatched attempt is out of scope by design, so no
 * cross-process counter is needed. A durable source can replace this one
 * behind the same interface if replay is ever required.
 */
export class RunScopedGatewayLlmAttempts implements GatewayLlmAttemptSource {
  private readonly issued = new Map<string, number>();

  constructor(private readonly runId: string) {
    if (runId.trim().length === 0) {
      throw new Error("Gateway llm attempt run id is required");
    }
  }

  next(requestId: string): GatewayLlmAttemptIdentity {
    if (requestId.length === 0) {
      throw new Error("Gateway llm attempt requires a request id");
    }
    const taskId = gatewayLlmTaskId(this.runId, requestId);
    const attempt = (this.issued.get(taskId) ?? 0) + 1;
    if (attempt > gatewayLlmMaxAttempt) {
      throw new Error("Gateway llm attempt budget is exhausted");
    }
    this.issued.set(taskId, attempt);
    return { taskId, attempt };
  }
}

/** "sm" plus 43 base64url characters: inside the gateway reference grammar. */
export const gatewayLlmTaskId = (runId: string, requestId: string): string =>
  `sm${createHash("sha256").update(`${runId}\u0000${requestId}`, "utf8")
    .digest("base64url")}`;
