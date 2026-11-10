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
