import {
  normalizeOpenAiReaderSummaryWeeklyOptions,
  resolveOpenAiResponsesReaderSummaryWeeklyModelOptions,
} from "./openai-responses-reader-summary-weekly-options";

const stubFetch = jest.fn(async () => new Response("{}"));

describe("OpenAI weekly model option policy", () => {
  it("keeps canonical model, timeout, token defaults and injected fetch", () => {
    const config = normalizeOpenAiReaderSummaryWeeklyOptions({
      model: "  ", endpointUrl: "  ", timeoutMs: -50, maxOutputTokens: 0,
      apiKey: "  unit-test-placeholder  ", fetchFn: stubFetch,
    });
    expect(config).toMatchObject({
      apiKey: "unit-test-placeholder",
      model: "gpt-5.4-mini",
      endpointUrl: "https://api.openai.com/v1/responses",
      timeoutMs: 180_000,
      maxOutputTokens: 16_000,
      fetchFn: stubFetch,
    });
  });

  it("preserves explicit provider values, including allowed numeric boundaries", () => {
    expect(normalizeOpenAiReaderSummaryWeeklyOptions({
      apiKey: "", endpointUrl: "https://example.test/v1/responses",
      model: " weekly-model ", timeoutMs: 1, maxOutputTokens: 1,
    })).toMatchObject({
      model: "weekly-model", timeoutMs: 1, maxOutputTokens: 1,
      endpointUrl: "https://example.test/v1/responses",
    });
  });

  it("uses weekly-before-daily-before-generic model precedence without reading process.env", () => {
    const env = { OPENAI_READER_SUMMARY_WEEKLY_MODEL: "weekly-model",
      OPENAI_READER_SUMMARY_MODEL: "daily-model", OPENAI_SUMMARY_MODEL: "generic-model",
      OPENAI_READER_SUMMARY_WEEKLY_TIMEOUT_MS: "900",
      OPENAI_READER_SUMMARY_WEEKLY_MAX_OUTPUT_TOKENS: "0" };
    expect(resolveOpenAiResponsesReaderSummaryWeeklyModelOptions(env, { requireApiKey: false }))
      .toMatchObject({ model: "weekly-model", timeoutMs: 900 });
    expect(resolveOpenAiResponsesReaderSummaryWeeklyModelOptions({
      OPENAI_READER_SUMMARY_MODEL: "daily-model", OPENAI_SUMMARY_MODEL: "generic-model",
    }, { requireApiKey: false }).model).toBe("daily-model");
    expect(resolveOpenAiResponsesReaderSummaryWeeklyModelOptions({
      OPENAI_SUMMARY_MODEL: "generic-model",
    }, { requireApiKey: false }).model).toBe("generic-model");
  });
});
