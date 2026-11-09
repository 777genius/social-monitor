import type { AgentRuntimeTaskResult } from "../../ports";
import { runtimePresentationValidationRejection } from "./agent-runtime-promotion-presentation-v3-result-policy";

const failed = (code: string, details: Record<string, string>): AgentRuntimeTaskResult => ({
  status: "failed",
  warnings: [],
  failure: {
    code,
    safeMessage: "Rejected by the provider runtime",
    retryable: false,
    reconnectRequired: false,
    causeCategory: "schema",
    details,
  },
});

describe("promotion presentation runtime output trust policy", () => {
  it.each(["unknown_runtime_failure", "provider_output_invalid"])(
    "absorbs explicit schema-normalization evidence from %s", code => {
      expect(runtimePresentationValidationRejection(failed(code, {
        outputValidationStage: "schema_normalization",
        outputValidationCode: "schema_normalization_failed",
      }), "xiaomi-mimo-token-plan")).toEqual({
        status: "unavailable",
        reason: "invalid_presentation",
        validation: { stage: "runtime_output", code: "schema_normalization_failed" },
      });
    });

  it.each([
    ["product_contract_rejected", "true", "false", "product_contract_rejected"],
    ["schema_parse_or_normalization", "false", "not_returned", "schema_parse_or_normalization"],
  ] as const)("recognizes only MiMo's verified %s validator evidence",
    (stage, called, accepted, code) => {
      const result = failed("provider_output_invalid", {
        presentationValidationStage: stage,
        presentationOutputValidatorCalled: called,
        presentationOutputValidatorAccepted: accepted,
      });
      expect(runtimePresentationValidationRejection(result, "xiaomi-mimo-token-plan"))
        .toEqual({ status: "unavailable", reason: "invalid_presentation",
          validation: { stage: "runtime_output", code } });
      expect(runtimePresentationValidationRejection(result, "openai-chatgpt")).toBeUndefined();
    });

  it.each<Record<string, string>>([
    { outputValidationStage: "schema_normalization" },
    { outputValidationStage: "json_parse", outputValidationCode: "schema_normalization_failed" },
    { presentationValidationStage: "product_contract_rejected",
      presentationOutputValidatorCalled: "true", presentationOutputValidatorAccepted: "true" },
    { presentationValidationStage: "schema_parse_or_normalization",
      presentationOutputValidatorCalled: "true", presentationOutputValidatorAccepted: "not_returned" },
  ])("does not absorb unverified or incomplete diagnostics: %j", details => {
    expect(runtimePresentationValidationRejection(
      failed("provider_output_invalid", details), "xiaomi-mimo-token-plan",
    )).toBeUndefined();
  });

  it("never promotes unrelated failures or completed tasks to validation rejection", () => {
    expect(runtimePresentationValidationRejection(
      failed("credential_unavailable", {
        outputValidationStage: "schema_normalization",
        outputValidationCode: "schema_normalization_failed",
      }), "xiaomi-mimo-token-plan",
    )).toBeUndefined();
    expect(runtimePresentationValidationRejection({
      status: "completed",
      warnings: [],
      structuredOutput: { presentations: [] },
    }, "xiaomi-mimo-token-plan")).toBeUndefined();
  });
});
