import { resolveOpenAiReaderSummarySettings } from "./openai-responses-reader-summary-runtime-settings";
import { OpenAiResponsesReaderSummaryModelAdapter } from "./openai-responses-reader-summary-model.adapter";

describe("OpenAI reader summary runtime settings boundary", () => {
  it("retains exact provider and cost defaults with the native fetch", () => {
    const settings = resolveOpenAiReaderSummarySettings();
    expect(settings).toMatchObject({
      apiKey: "",
      endpointUrl: "https://api.openai.com/v1/responses",
      model: "gpt-5.4-mini",
      evalDatasetVersion: "reader_summary.eval.mvp.v1",
      timeoutMs: 180_000,
      maxOutputTokens: 16_000,
      inputTokenDivisor: 4,
      estimatedInputCostUsdPerMillionTokens: 0,
      estimatedOutputCostUsdPerMillionTokens: 0,
    });
    expect(settings.fetchFn).toBe(fetch);
    expect(new OpenAiResponsesReaderSummaryModelAdapter().classifyError(null)).toEqual({
      kind: "unknown",
      retryable: false,
      message: "Unknown reader summary model error",
    });
  });

  it("preserves trim, explicit transport and numeric precedence", () => {
    const injectedFetch = async () => new Response("{}", { status: 200 });
    const settings = resolveOpenAiReaderSummarySettings({
      apiKey: "  test-key  ",
      endpointUrl: "  https://models.example.test/responses  ",
      model: "  test-model  ",
      evalDatasetVersion: "  test-eval  ",
      timeoutMs: 451,
      maxOutputTokens: 902,
      inputTokenDivisor: 9,
      estimatedInputCostUsdPerMillionTokens: 0,
      estimatedOutputCostUsdPerMillionTokens: 0.75,
      fetchFn: injectedFetch,
    });
    expect(settings).toMatchObject({
      apiKey: "test-key",
      endpointUrl: "https://models.example.test/responses",
      model: "test-model",
      evalDatasetVersion: "test-eval",
      timeoutMs: 451,
      maxOutputTokens: 902,
      inputTokenDivisor: 9,
      estimatedInputCostUsdPerMillionTokens: 0,
      estimatedOutputCostUsdPerMillionTokens: 0.75,
    });
    expect(settings.fetchFn).toBe(injectedFetch);
  });

  it("rejects unusable override values by keeping historic fallback values", () => {
    const settings = resolveOpenAiReaderSummarySettings({
      apiKey: "  ",
      endpointUrl: "  ",
      model: "",
      evalDatasetVersion: " ",
      timeoutMs: Number.NaN,
      maxOutputTokens: -100,
      inputTokenDivisor: 1.2,
      estimatedInputCostUsdPerMillionTokens: Number.POSITIVE_INFINITY,
      estimatedOutputCostUsdPerMillionTokens: -1,
    });
    expect(settings).toMatchObject({
      apiKey: "",
      endpointUrl: "https://api.openai.com/v1/responses",
      model: "gpt-5.4-mini",
      evalDatasetVersion: "reader_summary.eval.mvp.v1",
      timeoutMs: 180_000,
      maxOutputTokens: 16_000,
      inputTokenDivisor: 4,
      estimatedInputCostUsdPerMillionTokens: 0,
      estimatedOutputCostUsdPerMillionTokens: 0,
    });
  });
});
