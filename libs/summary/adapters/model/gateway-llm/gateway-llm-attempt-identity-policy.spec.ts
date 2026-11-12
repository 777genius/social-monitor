import {
  gatewayLlmMaxAttempt, gatewayLlmTaskId, RunScopedGatewayLlmAttempts,
} from "./gateway-llm-attempts";
import {
  gatewayLlmTaskId as policyTaskId, nextGatewayLlmAttemptIdentity,
} from "./gateway-llm-attempt-identity-policy";

describe("gateway invocation identity admission", () => {
  it("preserves the public hash export, stable gateway grammar, and run namespace", () => {
    expect(gatewayLlmTaskId).toBe(policyTaskId);
    const id = gatewayLlmTaskId("run-1", "request-1");
    expect(id).toMatch(/^sm[A-Za-z0-9_-]{43}$/);
    expect(id).toBe(gatewayLlmTaskId("run-1", "request-1"));
    expect(id).not.toBe(gatewayLlmTaskId("run-2", "request-1"));
    expect(id).not.toBe(gatewayLlmTaskId("run-1", "request-2"));
  });

  it("keeps admission pure and never consumes the last available attempt", () => {
    const taskId = gatewayLlmTaskId("run-1", "request-1");
    const issued = new Map([[taskId, gatewayLlmMaxAttempt - 1]]);
    expect(nextGatewayLlmAttemptIdentity("run-1", "request-1", issued))
      .toEqual({ taskId, attempt: gatewayLlmMaxAttempt });
    expect(issued.get(taskId)).toBe(gatewayLlmMaxAttempt - 1);
    issued.set(taskId, gatewayLlmMaxAttempt);
    expect(() => nextGatewayLlmAttemptIdentity("run-1", "request-1", issued))
      .toThrow("Gateway llm attempt budget is exhausted");
    expect(issued.get(taskId)).toBe(gatewayLlmMaxAttempt);
  });

  it("rejects invalid request ids before issuing anything, retaining the legacy public hash", () => {
    const attempts = new RunScopedGatewayLlmAttempts("run-1");
    expect(() => new RunScopedGatewayLlmAttempts(" ")).toThrow(
      "Gateway llm attempt run id is required");
    expect(() => attempts.next("")).toThrow("Gateway llm attempt requires a request id");
    expect(gatewayLlmTaskId("run-1", "")).toMatch(/^sm[A-Za-z0-9_-]{43}$/);
    expect(attempts.next("request-1")).toEqual({
      taskId: gatewayLlmTaskId("run-1", "request-1"), attempt: 1,
    });
    expect(attempts.next("request-1").attempt).toBe(2);
    expect(attempts.next("request-2").attempt).toBe(1);
  });
});
