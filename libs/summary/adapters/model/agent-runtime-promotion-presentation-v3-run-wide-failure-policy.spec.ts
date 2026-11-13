import type { AgentRuntimeTaskResult } from "../../ports";
import { presentationRuntimeFailureDisposition } from "./agent-runtime-promotion-presentation-v3-runtime-failure";
import { isRunWidePresentationFailure } from "./agent-runtime-promotion-presentation-v3-run-wide-failure-policy";

const failed = (
  details: Readonly<Record<string, string>> = {},
  overrides: Partial<NonNullable<AgentRuntimeTaskResult["failure"]>> = {},
): AgentRuntimeTaskResult => ({
  status: "failed",
  warnings: [],
  failure: {
    code: "unknown_runtime_failure",
    safeMessage: "Synthetic task failure",
    causeCategory: "agent_runtime",
    retryable: true,
    reconnectRequired: false,
    details,
    ...overrides,
  },
});

describe("presentation runtime run-wide failure veto", () => {
  it.each([
    ["capacity", { capacityReason: "quota_limited" }],
    ["cooldown", { cooldownUntil: "2026-11-13T00:00:00Z" }],
    ["output validation", { outputValidationStatus: "invalid" }],
    ["presentation validation", { presentationValidationStatus: "invalid" }],
    ["presentation rejection", { presentationRejected: "true" }],
    ["availability", { availability: "quota_exhausted" }],
    ["waiting executor", { safeExecutorStatus: "waiting_capacity" }],
    ["untrusted reason", { reason: "account_unavailable" }],
  ] as const)("does not retry run-wide %s evidence", (_label, details) => {
    const result = failed(details);
    expect(isRunWidePresentationFailure(result.failure!)).toBe(true);
    expect(presentationRuntimeFailureDisposition(result)).toBeUndefined();
  });

  it.each(["Rate limit reached", "Reconnect the account", "Credential expired", "HTTP 429",
    "Attestation invalid"])("rejects run-wide safe message %s", (safeMessage) => {
    const result = failed({}, { safeMessage });
    expect(isRunWidePresentationFailure(result.failure!)).toBe(true);
    expect(presentationRuntimeFailureDisposition(result)).toBeUndefined();
  });

  it("retains task-local retry, deadline skip and ambiguous-dispatch skip", () => {
    const transient = failed({ reason: "user_abort" });
    const timeout = failed({}, { code: "task_timeout" });
    const unknown = failed({ gatewayEffect: "effect_unknown" }, { code: "provider_effect_unknown" });
    const pending = failed({ gatewayCleanup: "pending" }, { code: "provider_failed" });
    expect(isRunWidePresentationFailure(transient.failure!)).toBe(false);
    expect(presentationRuntimeFailureDisposition(transient)).toBe("retry");
    expect(presentationRuntimeFailureDisposition(timeout)).toBe("skip");
    expect(presentationRuntimeFailureDisposition(unknown)).toBe("skip");
    expect(presentationRuntimeFailureDisposition(pending)).toBe("skip");
  });

  it("keeps reconnect-required terminal and never retries", () => {
    expect(presentationRuntimeFailureDisposition(failed({}, { reconnectRequired: true }))).toBeUndefined();
  });
});
