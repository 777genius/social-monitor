import type { ProviderReaderSummaryAttempt } from "../../ports";
import { DeterministicReaderSummaryModelAdapter } from "./deterministic-reader-summary-model.adapter";
import {
  classifyDeterministicReaderSummaryError,
  validateDeterministicReaderSummaryProviderResponse,
} from "./deterministic-reader-summary-outcome-policy";

// The response policy only inspects the transport route, not the draft payload.
const attemptWithSchema = (schemaVersion: string): ProviderReaderSummaryAttempt => ({
  route: {
    provider: "deterministic-local",
    model: "deterministic-reader-summary-v1",
    promptVersion: "reader_summary.prompt.v1",
    schemaVersion,
  },
} as ProviderReaderSummaryAttempt);

describe("deterministic reader summary provider outcome policy", () => {
  const adapter = new DeterministicReaderSummaryModelAdapter();

  it("accepts only the exact artifact schema, preserving the adapter contract", () => {
    const accepted = attemptWithSchema("reader_summary.artifact.v1");
    expect(validateDeterministicReaderSummaryProviderResponse(accepted)).toEqual({ ok: true });
    expect(adapter.validateRawProviderResponse(accepted)).toEqual({ ok: true });

    for (const schemaVersion of ["", "reader_summary.artifact.v2", "reader_summary.artifact.v1 "]) {
      const rejected = attemptWithSchema(schemaVersion);
      const failure = {
        ok: false,
        failure: {
          kind: "invalid_schema",
          retryable: false,
          message: "Unsupported reader summary schema version",
        },
      };
      expect(validateDeterministicReaderSummaryProviderResponse(rejected)).toEqual(failure);
      expect(adapter.validateRawProviderResponse(rejected)).toEqual(failure);
    }
  });

  it.each([
    [new Error("Budget exhausted; citation invalid"), "budget_exceeded", "Budget exhausted; citation invalid"],
    [new Error("Missing CITATION"), "citation_validation_failed", "Missing CITATION"],
    [new Error("Provider unavailable"), "unknown", "Provider unavailable"],
    ["Budget exhausted", "unknown", "Unknown reader summary model error"],
    [undefined, "unknown", "Unknown reader summary model error"],
  ])("preserves ordered non-retryable error translation: %#", (error, kind, message) => {
    const expected = { kind, retryable: false, message };
    expect(classifyDeterministicReaderSummaryError(error)).toEqual(expected);
    expect(adapter.classifyError(error)).toEqual(expected);
  });
});
