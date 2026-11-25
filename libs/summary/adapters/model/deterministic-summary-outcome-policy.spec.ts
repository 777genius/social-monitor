import type { ProviderSummaryAttempt } from "../../ports";
import { DeterministicSummaryModelAdapter } from "./deterministic-summary-model.adapter";
import {
  classifyDeterministicSummaryError,
  validateDeterministicSummaryProviderResponse,
} from "./deterministic-summary-outcome-policy";

const attemptWithSchema = (schemaVersion: string): ProviderSummaryAttempt => ({
  route: {
    provider: "deterministic-local",
    model: "summary-fake-v1",
    promptVersion: "summary.prompt.v1",
    schemaVersion,
  },
} as ProviderSummaryAttempt);

describe("deterministic summary provider outcome", () => {
  const adapter = new DeterministicSummaryModelAdapter();

  it("keeps the exact artifact schema gate and original diagnostics", () => {
    const accepted = attemptWithSchema("summary.artifact.v1");
    expect(validateDeterministicSummaryProviderResponse(accepted)).toEqual({ ok: true });
    expect(adapter.validateRawProviderResponse(accepted)).toEqual({ ok: true });
    for (const version of ["", "summary.artifact.v2", "summary.artifact.v1 "]) {
      const rejected = attemptWithSchema(version);
      const expected = {
        ok: false,
        failure: {
          kind: "invalid_schema",
          retryable: false,
          message: "Unsupported summary schema version",
        },
      };
      expect(validateDeterministicSummaryProviderResponse(rejected)).toEqual(expected);
      expect(adapter.validateRawProviderResponse(rejected)).toEqual(expected);
    }
  });

  it.each([
    [new Error("Budget exhausted; citation not valid"), "budget_exceeded", "Budget exhausted; citation not valid"],
    [new Error("Missing CITATION"), "citation_validation_failed", "Missing CITATION"],
    [new Error("Other failure"), "unknown", "Other failure"],
    ["Budget failure", "unknown", "Unknown summary model error"],
    [undefined, "unknown", "Unknown summary model error"],
  ])("retains ordered, case-insensitive, non-retryable classification (%#)", (error, kind, message) => {
    const expected = { kind, retryable: false, message };
    expect(classifyDeterministicSummaryError(error)).toEqual(expected);
    expect(adapter.classifyError(error)).toEqual(expected);
  });
});
