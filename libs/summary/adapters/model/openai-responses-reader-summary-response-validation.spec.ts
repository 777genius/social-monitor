import type { ProviderReaderSummaryAttempt } from "../../ports";
import { validateOpenAiReaderSummaryResponse as legacyValidate } from "./openai-responses-reader-summary-response-policy";
import { validateOpenAiReaderSummaryResponse } from "./openai-responses-reader-summary-response-validation";
import { OpenAiResponsesReaderSummaryModelAdapter } from "./openai-responses-reader-summary-model.adapter";

describe("OpenAI reader-summary response validation boundary", () => {
  it("preserves the legacy function object and adapter validation behavior", () => {
    expect(legacyValidate).toBe(validateOpenAiReaderSummaryResponse);

    const attempt = Object.freeze({
      route: Object.freeze({
        provider: "openai-responses",
        schemaVersion: "reader_summary.artifact.v1",
      }),
      draft: Object.freeze({}),
    }) as unknown as ProviderReaderSummaryAttempt;
    const adapter = new OpenAiResponsesReaderSummaryModelAdapter();
    const outcome = validateOpenAiReaderSummaryResponse(attempt);
    expect(outcome).toMatchObject({
      ok: false,
      failure: { kind: "invalid_schema", retryable: false },
    });
    expect(adapter.validateRawProviderResponse(attempt)).toEqual(outcome);
    expect(attempt.draft).toEqual({});
  });

  it("fails closed for invalid provider artifacts without mutating the input", () => {
    const attempt = Object.freeze({
      route: Object.freeze({
        provider: "another-provider",
        schemaVersion: "unknown.v0",
      }),
      draft: Object.freeze({}),
    }) as unknown as ProviderReaderSummaryAttempt;

    const first = validateOpenAiReaderSummaryResponse(attempt);
    expect(validateOpenAiReaderSummaryResponse(attempt)).toEqual(first);
    expect(first).toMatchObject({
      ok: false,
      failure: { kind: "invalid_schema", retryable: false },
    });
    expect(attempt.route.schemaVersion).toBe("unknown.v0");
  });
});
