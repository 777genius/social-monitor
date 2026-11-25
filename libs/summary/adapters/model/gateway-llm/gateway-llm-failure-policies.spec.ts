import type { LlmFailure } from "@agent-teams/account-gateway/llm";
import { gatewayLlmFailure } from "./gateway-llm-failure";
import { gatewayLlmFailureAttemptDetails } from "./gateway-llm-failure-attempt-details";
import { gatewayLlmFailureShape } from "./gateway-llm-failure-taxonomy";
import { gatewayLlmOutputViolationDetails } from "./gateway-llm-failure-output-diagnostics";

describe("Gateway LLM failure taxonomy and redacted output diagnostics", () => {
  it.each([
    ["unauthorized", "provider_auth_required", "authorization", true],
    ["busy", "provider_rate_limited", "quota", false],
    ["output_invalid", "provider_output_invalid", "output_schema", false],
    ["output_refused", "provider_output_refused", "refusal", false],
    ["output_truncated", "provider_output_truncated", "output_token_limit", false],
    ["deadline", "task_timeout", "deadline", false],
  ] as const)("preserves %s failure classification", (input, code, causeCategory, reconnect) => {
    expect(gatewayLlmFailureShape(input)).toMatchObject({
      code,
      causeCategory,
      ...(reconnect ? { reconnectRequired: true } : {}),
    });
  });

  it("omits schema detail disclosure on non-schema failure", () => {
    expect(gatewayLlmOutputViolationDetails("provider_failed", {
      first: "$.safe:required",
      all: ["$.safe:required"],
    })).toEqual({});
  });

  it("keeps only schema paths and bounded keywords, never raw output", () => {
    expect(gatewayLlmOutputViolationDetails("output_invalid", {
      first: "$.items[0]:required",
      all: ["$.items[0]:required", "untrusted-output", "$.secret?bad:type"],
    })).toEqual({
      outputValidationPath: "$.items[0]:required",
      outputValidationViolations: "$.items[0]:required",
    });
  });

  it("provides safe fallback when schema decode did not produce a path", () => {
    expect(gatewayLlmOutputViolationDetails("output_invalid")).toEqual({
      outputValidationPath: "json_parse_or_empty",
      outputValidationViolations: "",
    });
    expect(gatewayLlmOutputViolationDetails("output_invalid", {
      first: "raw untrusted provider output",
      all: [],
    }).outputValidationPath).toBe("unclassified");
  });
});

describe("Gateway LLM failure attempt provenance", () => {
  const identity = { taskId: "task-synthetic", attempt: 3 };

  it("retains paid retry and attested execution references without changing output redaction", () => {
    const failure = {
      code: "output_invalid",
      effect: "completed",
      retry: { kind: "new_attempt", afterMs: 240, mayDuplicateCost: true },
      cleanup: "retained",
      traceRef: "trace-synthetic",
      execution: {
        executionRef: "execution-synthetic",
        requestRef: "request-synthetic",
        accountRef: "account-synthetic",
      },
    } as unknown as LlmFailure;
    expect(gatewayLlmFailureAttemptDetails(failure, identity)).toEqual({
      gatewayCode: "output_invalid",
      gatewayEffect: "completed",
      gatewayRetry: "new_attempt",
      gatewayRetryAfterMs: "240",
      gatewayMayDuplicateCost: "true",
      gatewayCleanup: "retained",
      gatewayTaskId: "task-synthetic",
      gatewayAttempt: "3",
      gatewayTraceRef: "trace-synthetic",
      gatewayExecutionRef: "execution-synthetic",
      gatewayRequestRef: "request-synthetic",
      gatewayAccountRef: "account-synthetic",
    });
    expect(gatewayLlmFailure(failure, identity, {
      first: "$.safe:required",
      all: ["$.safe:required", "raw provider output"],
    })).toMatchObject({
      code: "provider_output_invalid",
      causeCategory: "output_schema",
      retryable: true,
      reconnectRequired: false,
      details: {
        outputValidationPath: "$.safe:required",
        outputValidationViolations: "$.safe:required",
        gatewayRetryAfterMs: "240",
        gatewayMayDuplicateCost: "true",
        gatewayExecutionRef: "execution-synthetic",
      },
    });
  });

  it("omits absent trace and execution refs for a never-retry failure", () => {
    const failure = {
      code: "deadline",
      effect: "not_dispatched",
      retry: { kind: "never" },
      cleanup: "none",
      traceRef: undefined,
      execution: null,
    } as unknown as LlmFailure;
    expect(gatewayLlmFailureAttemptDetails(failure, identity)).toEqual({
      gatewayCode: "deadline",
      gatewayEffect: "not_dispatched",
      gatewayRetry: "never",
      gatewayRetryAfterMs: "0",
      gatewayMayDuplicateCost: "false",
      gatewayCleanup: "none",
      gatewayTaskId: "task-synthetic",
      gatewayAttempt: "3",
    });
    expect(gatewayLlmFailure(failure, identity)).toMatchObject({
      code: "task_timeout",
      causeCategory: "deadline",
      retryable: false,
      reconnectRequired: false,
    });
  });
});

import {
  gatewayLlmLocalFailure,
  gatewayLlmModelMismatch,
} from "./gateway-llm-failure";
import { gatewayLlmModelMismatch as directModelMismatch } from "./gateway-llm-failure-model-identity";
import { gatewayLlmLocalFailure as directPreflightFailure } from "./gateway-llm-failure-preflight";

describe("Gateway failure trust phases and legacy exports", () => {
  it("keeps legacy imports the same function objects as dedicated policies", () => {
    expect(gatewayLlmModelMismatch).toBe(directModelMismatch);
    expect(gatewayLlmLocalFailure).toBe(directPreflightFailure);
  });

  it("rejects a completed paid output from another model without retry or identity mutation", () => {
    const identity = Object.freeze({ taskId: "synthetic-paid-task", attempt: 2 });
    expect(directModelMismatch(identity)).toEqual({
      code: "provider_model_mismatch",
      safeMessage: "Provider reported a different model than requested",
      retryable: false,
      reconnectRequired: false,
      causeCategory: "model_identity",
      details: {
        gatewayEffect: "completed",
        gatewayTaskId: "synthetic-paid-task",
        gatewayAttempt: "2",
      },
    });
    expect(identity).toEqual({ taskId: "synthetic-paid-task", attempt: 2 });
  });

  it.each([
    ["invalid_request", "invalid_request"],
    ["unsupported_route", "invalid_request"],
    ["invalid_schema", "output_schema"],
  ] as const)("marks %s as not dispatched with %s cause", (code, category) => {
    expect(directPreflightFailure(code, "Synthetic safe error")).toEqual({
      code,
      safeMessage: "Synthetic safe error",
      retryable: false,
      reconnectRequired: false,
      causeCategory: category,
      details: { gatewayEffect: "not_dispatched" },
    });
  });
});
