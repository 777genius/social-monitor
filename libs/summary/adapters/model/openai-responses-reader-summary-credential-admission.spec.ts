import { resolveOpenAiReaderSummaryCredential } from "./openai-responses-reader-summary-credential-admission";
import { resolveOpenAiResponsesReaderSummaryModelOptions } from "./openai-responses-reader-summary-options";

describe("OpenAI reader summary credential admission", () => {
  it("rejects an obsolete prompt release before attempting credential file I/O", () => {
    const env = Object.freeze({
      OPENAI_READER_SUMMARY_PROMPT_VERSION: "obsolete",
      OPENAI_API_KEY_FILE: "/nonexistent-sm-reader-credential-do-not-read",
    });

    expect(() => resolveOpenAiResponsesReaderSummaryModelOptions(env, { requireApiKey: true }))
      .toThrow("OPENAI_READER_SUMMARY_PROMPT_VERSION is no longer supported");
  });

  it("prefers the explicit key to an invalid file without leaking it to projection", () => {
    const env = Object.freeze({
      OPENAI_API_KEY: "  synthetic-test-key  ",
      OPENAI_API_KEY_FILE: "/nonexistent-sm-reader-credential-do-not-read",
      OPENAI_READER_SUMMARY_MODEL: "  synthetic-model  ",
      OPENAI_SUMMARY_MODEL: "old-fallback",
      OPENAI_READER_SUMMARY_TIMEOUT_MS: "451",
      OPENAI_READER_SUMMARY_MAX_OUTPUT_TOKENS: "902",
      OPENAI_SUMMARY_INPUT_COST_USD_PER_MILLION_TOKENS: "0.12",
    });
    const expected = resolveOpenAiReaderSummaryCredential(env, { requireApiKey: true });
    const actual = resolveOpenAiResponsesReaderSummaryModelOptions(env, { requireApiKey: true });

    expect(expected).toBe("synthetic-test-key");
    expect(actual).toMatchObject({
      apiKey: expected,
      model: "  synthetic-model  ",
      timeoutMs: 451,
      maxOutputTokens: 902,
      estimatedInputCostUsdPerMillionTokens: 0.12,
    });
    expect(env.OPENAI_API_KEY).toBe("  synthetic-test-key  ");
  });

  it("preserves required-provider fail-closed errors and optional empty credentials", () => {
    const empty = Object.freeze({ OPENAI_API_KEY: "  " });
    expect(() => resolveOpenAiReaderSummaryCredential(empty, { requireApiKey: true }))
      .toThrow("READER_SUMMARY_MODEL_PROVIDER=openai-responses requires OPENAI_API_KEY or OPENAI_API_KEY_FILE");
    expect(() => resolveOpenAiResponsesReaderSummaryModelOptions(empty, { requireApiKey: true }))
      .toThrow("READER_SUMMARY_MODEL_PROVIDER=openai-responses requires OPENAI_API_KEY or OPENAI_API_KEY_FILE");
    expect(resolveOpenAiResponsesReaderSummaryModelOptions(empty, { requireApiKey: false }).apiKey)
      .toBe("");
  });

  it("still fails closed on an invalid credential-file source in optional mode", () => {
    const env = { OPENAI_API_KEY_FILE: "/nonexistent-sm-reader-credential-do-not-read" };
    expect(() => resolveOpenAiResponsesReaderSummaryModelOptions(env, { requireApiKey: false }))
      .toThrow("OPENAI_API_KEY_FILE does not exist");
  });
});
