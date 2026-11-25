import type { AgentRuntimeTaskResult } from "../../ports";
import { presentationRuntimeFailureIdentity } from "./agent-runtime-promotion-presentation-v3-runtime-failure-identity";
import { presentationRuntimeFailureIdentity as establishedImport } from "./agent-runtime-promotion-presentation-v3-runtime-failure";

const failedTask = (
  details: Record<string, string>,
  code = "task_timeout",
  causeCategory = "deadline",
): AgentRuntimeTaskResult => ({
  status: "failed",
  warnings: [],
  failure: {
    code,
    causeCategory,
    safeMessage: "Synthetic runtime error; must never appear in operator identity",
    retryable: false,
    reconnectRequired: false,
    details,
  },
});

describe("presentation runtime operator-safe failure identity", () => {
  it("preserves the original public import without a separate implementation", () => {
    expect(establishedImport).toBe(presentationRuntimeFailureIdentity);
  });

  it("keeps only verified gateway references, closed effect and bounded timing", () => {
    const executionRef = "11111111-1111-4111-8111-111111111111";
    const requestRef = `sm${"a".repeat(43)}-a1-r`;
    expect(presentationRuntimeFailureIdentity(failedTask({
      gatewayExecutionRef: executionRef,
      gatewayRequestRef: requestRef,
      gatewayCleanup: "closed",
      gatewayEffect: "response_started",
      gatewayElapsedMs: "003",
      gatewayHardTimeoutMs: "90000",
      providerPayload: "untrusted credentials or provider output",
    }))).toEqual({
      code: "task_timeout",
      causeCategory: "deadline",
      executionClosed: true,
      effect: "response_started",
      elapsedMs: 3,
      timeoutMs: 90000,
      executionRef,
      requestRef,
    });
  });

  it("does not surface arbitrary diagnostics, malformed references or invalid times", () => {
    expect(presentationRuntimeFailureIdentity(failedTask({
      gatewayExecutionRef: "unsafe uuid or injected text",
      gatewayRequestRef: "unsafe request id",
      gatewayCleanup: "pending",
      gatewayEffect: "unknown_remote_state",
      gatewayElapsedMs: "-5",
      gatewayHardTimeoutMs: "Infinity",
      providerPayload: "never returned",
    }, "bad code!", "../unsafe"))).toEqual({
      code: "unclassified",
      causeCategory: "unclassified",
    });
  });

  it("never declares execution closed for a still-unknown effect", () => {
    expect(presentationRuntimeFailureIdentity(failedTask({
      gatewayCleanup: "closed",
      gatewayEffect: "effect_unknown",
      gatewayElapsedMs: "0",
    }))).toEqual({
      code: "task_timeout",
      causeCategory: "deadline",
      effect: "effect_unknown",
      elapsedMs: 0,
    });
  });
});
